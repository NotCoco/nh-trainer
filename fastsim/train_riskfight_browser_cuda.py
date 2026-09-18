#!/usr/bin/env python3
"""CUDA PPO continuation against the browser's source combat engine.

The Node bridge owns combat, observations, legal-action masks and rewards.  This
module contains no second combat simulator or tactical action replacement.  Its
JSON-lines protocol is documented in BrowserBridge and checked at every frame.

Checkpoint tensors use the original RiskPolicy state-dict keys. ``model_state``
is canonical; ``state_dict`` aliases the same CPU tensor dictionary for exporters.
All learning and policy inference run on CUDA; CPU tensors are serialization only.
Artifacts always go into a NEW directory. Nothing is promoted or copied into a
browser policy slot, and the retained v1 checkpoint is never changed.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import copy
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import queue
import random
import subprocess
import sys
import threading
import time
from typing import Any, Sequence

import numpy as np
import torch
from torch import nn
from torch.distributions import Categorical


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASELINE = ROOT / "fastsim/out/riskfight/20260831T140504Z/webweaver-riskfight-candidate.pt"
RETAINED_BASELINE_SHA256 = "86ccdd26a15c377247e6fedc3ebd2d5844c0127e007353c34f34920f0f3a64b0"
PROFILE = "risk_webweaver_v2"
SCHEMA_VERSION = 2
HIDDEN = 192
DISTANCES = (1, 5, 9)
OBJECTIVE_VERSION = "stocked_combo_v2"
SIGNED_REPORT_METRICS = ("terminalReward", "comboReward", "objectiveReturn")
REPORT_METRICS = ("damage", "attacks", "food", "specs", "illegal", "movement", "suppliesRemaining", "specialRemaining",
                  "vengeanceCasts", "vengeanceReflectedDamage", "vengeanceStackDamage", "vengeanceStackReward",
                  "openingVengeanceCasts", "elderAttacks", "doubleMaulAttacks", "elderAfterDoubleMaul", "vengeanceComboKos",
                  "healingRemaining", "stockedComboKos", "stockedKos", "exhaustedKos", "comboDamage", "comboStacks", "vengeanceComboDamage") + SIGNED_REPORT_METRICS


def validate_combo_contract(reward: dict[str, Any]) -> dict[str, Any]:
    expected = {"version": OBJECTIVE_VERSION, "gamma": 1, "combo_bonus_cap": 20, "stocked_healing_threshold": 44,
                "combo_window_tick_span": 1, "combo_min_damage": 40, "combo_ko_min_damage": 50,
                "material_hit_min_damage": 8, "combo_ko_terminal": 100, "ordinary_ko_terminal": 20,
                "exhausted_ko_terminal": 0, "death_terminal": -10, "damage_reward": 0, "cast_reward": 0,
                "combo_bonus_retained_only": "stocked victory"}
    if not isinstance(reward, dict):
        raise ValueError("bridge lacks the explicit stocked-combo reward contract")
    for name, value in expected.items():
        if reward.get(name) != value:
            raise ValueError(f"unsupported stocked-combo contract {name}: {reward.get(name)!r}; expected {value!r}")
    return copy.deepcopy(reward)


def audit_objective_report(report: dict[str, Any], reward: dict[str, Any], cumulative: np.ndarray | None = None) -> None:
    """Check attribution/accounting supplied by the source engine, not combat rules."""
    validate_combo_contract(reward)
    terminal = np.zeros(2, dtype=np.float64)
    winner = report["winner"]
    stocked = np.asarray(report["stockedKos"], dtype=np.float64)
    exhausted = np.asarray(report["exhaustedKos"], dtype=np.float64)
    combo_kos = np.asarray(report["stockedComboKos"], dtype=np.float64)
    healing = np.asarray(report["healingRemaining"], dtype=np.float64)
    bonus = np.asarray(report["comboReward"], dtype=np.float64)
    for values in (stocked, exhausted, combo_kos):
        if values.shape != (2,) or np.any((values != 0) & (values != 1)):
            raise ValueError("terminal KO counters must be one boolean count per actor")
    if np.any(bonus < -1.0e-5) or np.any(bonus > reward["combo_bonus_cap"] + 1.0e-5):
        raise ValueError("episode combo bonus exceeded its nonnegative cap")
    if report["outcome"] == "ko":
        loser = 1 - winner
        terminal[loser] = reward["death_terminal"]
        stock = healing[loser]
        if stock < 0 or stocked[winner] != int(stock > 0) or exhausted[winner] != int(stock == 0):
            raise ValueError("KO stock classification differs from remaining healing")
        if stocked[loser] or exhausted[loser] or combo_kos[loser]:
            raise ValueError("losing actor received a terminal KO credit")
        if combo_kos[winner]:
            if stock < reward["stocked_healing_threshold"] or not stocked[winner]:
                raise ValueError("full stocked-combo KO credit requires the declared healing threshold")
            terminal[winner] = reward["combo_ko_terminal"]
        else:
            terminal[winner] = reward["ordinary_ko_terminal"] * min(1, stock / reward["stocked_healing_threshold"])
        if abs(bonus[loser]) > 1.0e-5:
            raise ValueError("dead actor retained a combo bonus instead of refunding it")
        if stock == 0 and abs(bonus[winner]) > 1.0e-5:
            raise ValueError("exhausted-opponent victory retained a combo bonus")
    elif report["outcome"] == "simultaneous-ko":
        terminal[:] = reward["death_terminal"]
        if np.any(np.abs(bonus) > 1.0e-5) or stocked.any() or exhausted.any() or combo_kos.any():
            raise ValueError("simultaneous death retained bonus or winner credit")
    elif report["outcome"] == "timeout":
        if np.any(np.abs(bonus) > 1.0e-5) or stocked.any() or exhausted.any() or combo_kos.any():
            raise ValueError("timeout retained a combo bonus or KO credit")
    else:
        raise ValueError("unknown objective outcome")
    if not np.allclose(report["terminalReward"], terminal, rtol=0, atol=1.0e-4):
        raise ValueError("terminal reward does not match stocked-combo/exhausted/death attribution")
    expected_return = terminal + bonus
    if not np.allclose(report["objectiveReturn"], expected_return, rtol=0, atol=1.0e-4):
        raise ValueError("objective return differs from terminal reward plus capped combo bonus")
    if cumulative is not None and not np.allclose(cumulative, expected_return, rtol=0, atol=1.0e-4):
        raise ValueError("emitted step rewards differ from the reported objective return")


def combo_selection_rank(metrics: dict[str, Any]) -> tuple[float, float]:
    if not metrics["no_illegal_actions"]:
        return (-float("inf"), -float("inf"))
    # Rank the corrected objective first; own combo rate breaks return ties.
    return (float(metrics["mean_objective_return"]), float(metrics["stocked_combo_ko_rate"]))


def combo_improvement_evidence(heldout: dict[str, Any], varied: dict[str, Any], stable_v1: dict[str, Any]) -> dict[str, Any]:
    interval = heldout.get("confidence_interval", {}).get("stocked_combo_ko_differential")
    checks = {
        "positive_current_incumbent_combo_differential_ci": interval is not None and interval[0] > 0,
        "no_illegal_actions": bool(heldout.get("no_illegal_actions") and varied.get("no_illegal_actions") and stable_v1.get("no_illegal_actions")),
        "no_supported_varied_combo_regression": varied.get("any_significant_combo_regression") is False,
        "positive_varied_own_combo_rate_delta": varied.get("mean_own_combo_ko_rate_delta", 0) > 0,
        "no_supported_varied_own_combo_regression": varied.get("any_significant_own_combo_regression") is False,
        "current_incumbent_ordinary_score_floor": heldout.get("score_rate", 0) >= 0.48,
        "no_supported_varied_ordinary_score_regression": varied.get("any_significant_ordinary_score_regression") is False,
        "basic_stable_v1_non_regression": stable_v1.get("score_rate", 0) >= 0.5,
    }
    return {"objective_version": OBJECTIVE_VERSION, "checks": checks, "passed": all(checks.values()), "automatic_promotion": False,
            "interpretation": "Positive held-out combo differential against the current incumbent and positive mean own combo-KO rate delta across paired varied opponents; no supported varied combo/own-combo/ordinary-score regression; current head-to-head ordinary score at least 0.48, with its CI reported for review and a basic stable-v1 regression check"}


def emit(event: str, **values: Any) -> None:
    print(json.dumps({"event": event, **values}, sort_keys=True, allow_nan=False), flush=True)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_cuda(raw: str) -> torch.device:
    if not raw.startswith("cuda") or not torch.cuda.is_available():
        raise RuntimeError(f"CUDA is required for inference and training; requested={raw!r}, available={torch.cuda.is_available()}")
    device = torch.device(raw)
    probe = torch.randn((64, 64), device=device)
    result = probe @ probe
    torch.cuda.synchronize(device)
    assert_cuda(result, "CUDA kernel probe")
    return device


def assert_cuda(tensor: torch.Tensor, label: str) -> None:
    if tensor.device.type != "cuda":
        raise RuntimeError(f"{label} left CUDA: {tensor.device}")


def assert_optimizer_cuda(optimizer: torch.optim.Optimizer) -> None:
    for state in optimizer.state.values():
        for key, value in state.items():
            # Adam's scalar step counter can be CPU; learned moments cannot.
            if isinstance(value, torch.Tensor) and not (key == "step" and value.numel() == 1):
                assert_cuda(value, f"optimizer {key}")


def optimizer_devices(optimizer: torch.optim.Optimizer | None) -> dict[str, list[str]]:
    devices: dict[str, set[str]] = defaultdict(set)
    if optimizer is not None:
        for state in optimizer.state.values():
            for key, value in state.items():
                if isinstance(value, torch.Tensor):
                    devices[key].add(str(value.device))
    return {key: sorted(values) for key, values in devices.items()}


def cpu_copy(value: Any) -> Any:
    if isinstance(value, torch.Tensor):
        return value.detach().to("cpu").clone()
    if isinstance(value, dict):
        return {key: cpu_copy(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return type(value)(cpu_copy(item) for item in value)
    return copy.deepcopy(value)


def model_digest(model: nn.Module) -> str:
    digest = hashlib.sha256()
    for tensor in model.state_dict().values():
        digest.update(tensor.detach().cpu().contiguous().numpy().tobytes())
    return digest.hexdigest()


def unique_names(value: Any, label: str) -> list[str]:
    if not isinstance(value, (list, tuple)) or not value or any(not isinstance(name, str) or not name for name in value):
        raise ValueError(f"{label} must be a nonempty list of names")
    if len(set(value)) != len(value):
        raise ValueError(f"{label} contains duplicate names")
    return list(value)


@dataclass(frozen=True)
class Schema:
    feature_names: list[str]
    action_heads: dict[str, list[str]]
    raw: dict[str, Any]

    @classmethod
    def from_bridge(cls, raw: dict[str, Any]) -> "Schema":
        if raw.get("runtime_profile") != PROFILE:
            raise ValueError(f"bridge runtime_profile must be {PROFILE!r}: {raw.get('runtime_profile')!r}")
        features = unique_names(raw.get("feature_names"), "feature_names")
        heads = raw.get("action_heads", {})
        actions = {name: unique_names(heads.get(name), f"{name} actions") for name in ("main", "prayer", "movement")}
        if actions["prayer"] != ["NONE", "PROTECT_RANGED", "PROTECT_MELEE"]:
            raise ValueError("unexpected serialized prayer head; runtime prayer must be forced NONE")
        if actions["movement"] != ["HOLD", "STEP_CLOSER", "STEP_AWAY"] or "WAIT" not in actions["main"]:
            raise ValueError("bridge lacks explicit WAIT/HOLD actions or has an unknown movement contract")
        return cls(features, actions, raw)

    def metadata(self) -> dict[str, Any]:
        contract = {"feature_names": self.feature_names, "action_heads": self.action_heads}
        encoded = json.dumps(contract, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return {"schema_version": SCHEMA_VERSION, "runtime_profile": PROFILE, "schema_sha256": hashlib.sha256(encoded).hexdigest(), **contract}


class RiskPolicy(nn.Module):
    def __init__(self, schema: Schema) -> None:
        super().__init__()
        self.encoder = nn.Sequential(nn.Linear(len(schema.feature_names), HIDDEN), nn.LayerNorm(HIDDEN), nn.SiLU(), nn.Linear(HIDDEN, HIDDEN), nn.SiLU())
        self.main_head = nn.Linear(HIDDEN, len(schema.action_heads["main"]))
        self.prayer_head = nn.Linear(HIDDEN, len(schema.action_heads["prayer"]))
        self.movement_head = nn.Linear(HIDDEN, len(schema.action_heads["movement"]))
        self.value_head = nn.Linear(HIDDEN, 1)
        self.prayer_head.requires_grad_(False)

    def forward(self, observation: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        hidden = self.encoder(observation)
        # A stale critic must not rewrite the demonstrated actor representation.
        # Detaching changes gradient ownership only; inference values are equal.
        return self.main_head(hidden), self.prayer_head(hidden), self.movement_head(hidden), self.value_head(hidden.detach()).squeeze(-1)


def checked_state(checkpoint: dict[str, Any], schema: Schema) -> dict[str, torch.Tensor]:
    state = checkpoint.get("model_state", checkpoint.get("state_dict"))
    if not isinstance(state, dict):
        raise ValueError("checkpoint contains neither model_state nor state_dict")
    expected = RiskPolicy(schema).state_dict()
    if set(state) != set(expected):
        raise ValueError(f"checkpoint network keys differ: {sorted(set(state) ^ set(expected))}")
    for name, tensor in state.items():
        if not isinstance(tensor, torch.Tensor) or tensor.shape != expected[name].shape or not torch.isfinite(tensor).all():
            raise ValueError(f"invalid checkpoint tensor: {name}, shape={getattr(tensor, 'shape', None)}")
    return state


def migrate_incumbent(path: Path, schema: Schema) -> tuple[RiskPolicy, dict[str, Any]]:
    checksum = sha256_file(path)
    if path.resolve() == DEFAULT_BASELINE.resolve() and checksum != RETAINED_BASELINE_SHA256:
        raise ValueError("retained incumbent checksum changed; refusing to silently train from another baseline")
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    if checkpoint.get("kind") != "webweaver-riskfight-candidate" or checkpoint.get("schema_version") != 1:
        raise ValueError("baseline migration requires the explicitly named v1 risk-fight checkpoint")
    old_features = unique_names(checkpoint.get("feature_names"), "baseline feature_names")
    old_actions = {head: unique_names(checkpoint.get(f"{head}_actions"), f"baseline {head} actions") for head in schema.action_heads}
    old_schema = Schema(old_features, old_actions, {})
    old_state = checked_state(checkpoint, old_schema)
    model = RiskPolicy(schema)
    migrated = model.state_dict()
    remapped = {"encoder.0.weight"} | {f"{head}_head.{part}" for head in schema.action_heads for part in ("weight", "bias")}
    for name, tensor in old_state.items():
        if name not in remapped:
            if migrated[name].shape != tensor.shape:
                raise ValueError(f"shared layer changed shape: {name}")
            migrated[name].copy_(tensor)
    migrated["encoder.0.weight"].zero_()
    feature_map: list[dict[str, Any]] = []
    for target, name in enumerate(schema.feature_names):
        source = old_features.index(name) if name in old_features else None
        if source is not None:
            migrated["encoder.0.weight"][:, target].copy_(old_state["encoder.0.weight"][:, source])
        feature_map.append({"name": name, "source_column": source, "target_column": target})
    action_maps: dict[str, list[dict[str, Any]]] = {}
    for head, names in schema.action_heads.items():
        migrated[f"{head}_head.weight"].zero_()
        migrated[f"{head}_head.bias"].fill_(-2.0)
        action_maps[head] = []
        for target, name in enumerate(names):
            source = old_actions[head].index(name) if name in old_actions[head] else None
            if source is not None:
                for part in ("weight", "bias"):
                    migrated[f"{head}_head.{part}"][target].copy_(old_state[f"{head}_head.{part}"][source])
            action_maps[head].append({"name": name, "source_row": source, "target_row": target})
    model.load_state_dict(migrated)
    return model, {
        "source_baseline": str(path.resolve()), "source_baseline_sha256": checksum,
        "baseline_label": "Frozen incumbent migrated by feature/action names and evaluated under corrected browser v2 rules",
        "feature_mapping": feature_map, "action_mapping": action_maps,
        "dropped_features": [name for name in old_features if name not in schema.feature_names],
        "dropped_actions": {head: [name for name in old_actions[head] if name not in schema.action_heads[head]] for head in old_actions},
        "new_input_initialization": "zero columns", "new_action_initialization": "zero rows with bias -2",
        "old_optimizer_reused": False,
    }


def load_checked_v2(path: Path, schema: Schema, metadata: dict[str, Any], allow_source_update: bool = False) -> dict[str, Any]:
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    if checkpoint.get("kind") != "webweaver-riskfight-candidate":
        raise ValueError("v2 continuation requires an explicit risk-fight candidate checkpoint")
    for key in ("runtime_profile", "schema_version", "schema_sha256", "feature_names", "action_heads", "source_baseline_sha256", "baseline_parameter_sha256"):
        if checkpoint.get(key) != metadata[key]:
            raise ValueError(f"v2 checkpoint {key} differs from the current contract, source or frozen incumbent")
    previous_source = checkpoint.get("bridge_schema", {}).get("source_sha256")
    current_source = schema.raw.get("source_sha256")
    if not isinstance(current_source, dict) or not current_source or not isinstance(previous_source, dict) or not previous_source or not checkpoint.get("bridge_sha256"):
        raise ValueError("v2 checkpoint engine source hash contract is missing")
    if (previous_source != current_source or checkpoint["bridge_sha256"] != metadata["bridge_sha256"]) and not allow_source_update:
        raise ValueError("v2 checkpoint engine source hashes differ; use the explicit source-update flag for the requested resume or evaluation mode")
    state = checked_state(checkpoint, schema)
    digest = hashlib.sha256()
    for tensor in state.values():
        digest.update(tensor.detach().cpu().contiguous().numpy().tobytes())
    if digest.hexdigest() != checkpoint.get("parameter_sha256"):
        raise ValueError("v2 checkpoint parameter checksum differs from its recorded lineage")
    return checkpoint


def seed_ranges(split: dict[str, Any], include_heldout: bool = True) -> list[tuple[str, int, int]]:
    if not isinstance(split, dict):
        raise ValueError("checkpoint seed_split metadata is missing")
    ranges: list[tuple[str, int, int]] = []
    for key in ("training_range_inclusive_exclusive", "bootstrap_range_inclusive_exclusive"):
        value = split.get(key)
        if not isinstance(value, (list, tuple)) or len(value) != 2 or any(type(seed) is not int for seed in value) or not 0 <= value[0] <= value[1] <= 2**32:
            raise ValueError(f"invalid or missing checkpoint seed range: {key}")
        if value[0] < value[1]:
            ranges.append((key, value[0], value[1]))
    for key in (("validation", "heldout") if include_heldout else ("validation",)):
        seeds = split.get(key)
        if not isinstance(seeds, (list, tuple)) or any(type(seed) is not int or not 0 <= seed < 2**32 for seed in seeds):
            raise ValueError(f"invalid or missing checkpoint seed list: {key}")
        ranges.extend((key, seed, seed + 1) for seed in seeds)
    return ranges


def validate_prior_seed_exposure(current_split: dict[str, Any], checkpoint: dict[str, Any], include_prior_heldout: bool = True) -> list[dict[str, Any]]:
    lineage = checkpoint.get("resume_lineage", [])
    if not isinstance(lineage, list) or any(not isinstance(entry, dict) for entry in lineage):
        raise ValueError("invalid v2 resume lineage")
    current = seed_ranges(current_split)
    reference_exposure = checkpoint.get("reference_seed_exposure", [])
    if not isinstance(reference_exposure, list) or any(not isinstance(entry, dict) for entry in reference_exposure):
        raise ValueError("invalid frozen-reference seed exposure")
    prior_splits = [("resume checkpoint", checkpoint.get("seed_split"))] + [(f"ancestor {index + 1}", entry.get("seed_split")) for index, entry in enumerate(lineage)]
    prior_splits += [(f"frozen-reference ancestor {index + 1}", entry.get("seed_split")) for index, entry in enumerate(reference_exposure)]
    for label, previous_split in prior_splits:
        for new_key, new_start, new_end in current:
            for old_key, old_start, old_end in seed_ranges(previous_split, include_heldout=include_prior_heldout):
                if max(new_start, old_start) < min(new_end, old_end):
                    raise ValueError(f"seed overlap: current {new_key} reuses {label} {old_key} at seed {max(new_start, old_start)}; choose a fresh base --seed")
    return copy.deepcopy(lineage)


@dataclass
class Frame:
    observations: np.ndarray
    main_masks: np.ndarray
    movement_masks: np.ndarray
    rewards: np.ndarray
    dones: np.ndarray
    reports: list[dict[str, Any] | None]

    @classmethod
    def parse(cls, raw: dict[str, Any], fights: int, schema: Schema, previous: "Frame | None" = None) -> "Frame":
        rows = fights * 2
        fields = {
            "observations": (np.float32, (rows, len(schema.feature_names))),
            "main_masks": (np.bool_, (rows, len(schema.action_heads["main"]))),
            "movement_masks": (np.bool_, (rows, len(schema.action_heads["movement"]))),
            "rewards": (np.float32, (rows,)), "dones": (np.bool_, (fights,)),
        }
        arrays = {}
        for name, (dtype, shape) in fields.items():
            value = np.asarray(raw.get(name), dtype=dtype)
            if value.shape != shape or not np.isfinite(value).all():
                raise ValueError(f"invalid bridge {name}: shape={value.shape}, expected={shape}")
            arrays[name] = value
        reports = raw.get("reports")
        if not isinstance(reports, list) or len(reports) != fights:
            raise ValueError("bridge reports must have one slot per fight")
        frame = cls(**arrays, reports=reports)
        active = np.repeat(~frame.dones, 2)
        if not frame.main_masks[active].any(axis=1).all() or not frame.movement_masks[active].any(axis=1).all():
            raise ValueError("active bridge row has no legal main or movement action")
        if previous is not None:
            if np.any(previous.dones & ~frame.dones):
                raise ValueError("finished fight became active without a reset")
            if np.any(frame.rewards[np.repeat(previous.dones, 2)] != 0):
                raise ValueError("bridge emitted repeated reward after a fight ended")
        for index, done in enumerate(frame.dones):
            if not done:
                continue
            report = reports[index]
            if not isinstance(report, dict) or report.get("outcome") not in ("ko", "simultaneous-ko", "timeout"):
                raise ValueError(f"finished fight {index} has no valid final report")
            winner = report.get("winner")
            if (report["outcome"] == "ko" and winner not in (0, 1)) or (report["outcome"] != "ko" and winner is not None):
                raise ValueError(f"inconsistent outcome/winner in fight {index}")
            if not isinstance(report.get("ticks"), (int, float)) or report["ticks"] < 0:
                raise ValueError(f"invalid fight duration in report {index}")
            for key in REPORT_METRICS:
                values = np.asarray(report.get(key), dtype=np.float64)
                if values.shape != (2,) or not np.isfinite(values).all() or (key not in SIGNED_REPORT_METRICS and (values < 0).any()):
                    raise ValueError(f"invalid report metric {key} in fight {index}")
            audit_objective_report(report, schema.raw.get("reward", {}))
        return frame


class BrowserBridge:
    """One JSON request/response per line; stdout is exclusively protocol JSON.

    schema -> {feature_names, action_heads, runtime_profile}; reset receives a
    fights array of {seed,startDistance,pid,maxTicks}; step receives one
    [mainIndex,movementIndex] pair per fighter row. Rows never reorder:
    [fight0 side0, fight0 side1, fight1 side0, ...]. Dones and reports have one
    entry per fight. The post-step reward belongs to the submitted action;
    terminal rewards occur once, and completed fights persist with zero rewards.
    Both actors observe the completed previous tick. Prayer is forced NONE.
    close exits without requiring a response. Diagnostics belong on stderr.
    """

    def __init__(self, node: str, script: Path, stderr_path: Path, timeout: float) -> None:
        self.timeout = timeout
        self.fight_count = 0
        self.frame: Frame | None = None
        self.stderr = stderr_path.open("w", encoding="utf-8")
        self.process = subprocess.Popen([node, str(script)], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.stderr, text=True, encoding="utf-8", bufsize=1)
        self.responses: queue.Queue[str | None] = queue.Queue()

        def read_lines() -> None:
            assert self.process.stdout is not None
            try:
                for line in self.process.stdout:
                    self.responses.put(line)
            finally:
                self.responses.put(None)

        self.reader = threading.Thread(target=read_lines, daemon=True, name="riskfight-bridge-output")
        self.reader.start()
        try:
            self.schema = Schema.from_bridge(self.request({"op": "schema"}))
        except BaseException:
            self.close()
            raise

    def request(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self.process.poll() is not None:
            raise RuntimeError(f"browser bridge exited with status {self.process.returncode}; inspect bridge.stderr.log")
        assert self.process.stdin is not None
        self.process.stdin.write(json.dumps(payload, separators=(",", ":"), allow_nan=False) + "\n")
        self.process.stdin.flush()
        try:
            line = self.responses.get(timeout=self.timeout)
        except queue.Empty as exc:
            raise RuntimeError(f"browser bridge timed out on {payload['op']}; inspect bridge.stderr.log") from exc
        if line is None:
            raise RuntimeError("browser bridge closed stdout; inspect bridge.stderr.log")
        response = json.loads(line)
        if not isinstance(response, dict) or "error" in response:
            raise RuntimeError(f"browser bridge rejected {payload['op']}: {response}")
        return response

    def reset(self, fights: list[dict[str, int]]) -> Frame:
        self.fight_count = len(fights)
        self.frame = Frame.parse(self.request({"op": "reset", "fights": fights}), self.fight_count, self.schema)
        if self.frame.dones.any() or np.any(self.frame.rewards != 0):
            raise ValueError("reset must begin active fights with zero rewards")
        return self.frame

    def step(self, actions: np.ndarray) -> Frame:
        self.frame = Frame.parse(self.request({"op": "step", "actions": actions.tolist()}), self.fight_count, self.schema, self.frame)
        return self.frame

    def close(self) -> None:
        try:
            if self.process.poll() is None:
                try:
                    assert self.process.stdin is not None
                    self.process.stdin.write('{"op":"close"}\n')
                    self.process.stdin.flush()
                    self.process.wait(timeout=5)
                except (OSError, subprocess.TimeoutExpired):
                    self.process.kill()
                    self.process.wait(timeout=5)
        finally:
            self.reader.join(timeout=1)
            for stream in (self.process.stdin, self.process.stdout):
                if stream is not None:
                    stream.close()
            self.stderr.close()


@torch.no_grad()
def infer(model: RiskPolicy, frame: Frame, rows: np.ndarray, device: torch.device, deterministic: bool) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    observation = torch.as_tensor(frame.observations[rows], device=device)
    main_mask = torch.as_tensor(frame.main_masks[rows], device=device, dtype=torch.bool)
    movement_mask = torch.as_tensor(frame.movement_masks[rows], device=device, dtype=torch.bool)
    assert_cuda(observation, "policy observations")
    main_logits, _, movement_logits, values = model(observation)
    assert_cuda(main_logits, "main logits")
    assert_cuda(movement_logits, "movement logits")
    assert_cuda(values, "value predictions")
    distributions = (Categorical(logits=main_logits.masked_fill(~main_mask, -1.0e9)), Categorical(logits=movement_logits.masked_fill(~movement_mask, -1.0e9)))
    actions = [distribution.logits.argmax(-1) if deterministic else distribution.sample() for distribution in distributions]
    log_probability = distributions[0].log_prob(actions[0]) + distributions[1].log_prob(actions[1])
    return torch.stack(actions, dim=-1).cpu().numpy(), log_probability.cpu().numpy(), values.cpu().numpy()


def idle_actions(rows: int, schema: Schema) -> np.ndarray:
    return np.tile([schema.action_heads["main"].index("WAIT"), schema.action_heads["movement"].index("HOLD")], (rows, 1)).astype(np.int64)


@dataclass(frozen=True)
class ScriptOpponent:
    """A train/eval opponent, never a learned-policy action replacement.

    Inputs are exclusively one sanitized observation row and its legal masks.
    Scales below are the named v2 encoder contract: HP/115, levels/120,
    distance/9, special/100 and attack delay/7. No engine or opponent private
    state, sampled damage, trajectory outcome or reward enters the decisions.
    """

    name: str
    food_hp: float
    combo_hp: float
    retreat_hp: float
    spec_hp: float
    pressure_distance: float

    def metadata(self) -> dict[str, Any]:
        return dict(vars(self))

    def actions(self, frame: Frame, rows: np.ndarray, schema: Schema, *, finishing_demonstrations: bool = False) -> np.ndarray:
        feature = {name: index for index, name in enumerate(schema.feature_names)}
        main = {name: index for index, name in enumerate(schema.action_heads["main"])}
        movement = {name: index for index, name in enumerate(schema.action_heads["movement"])}
        required = ("self_hp", "opponent_hp", "self_attack_timer", "self_special", "self_attack_level", "self_strength_level", "self_ranged_level", "self_magic_level", "self_prayer_points", "self_gmaul_preloaded")
        if finishing_demonstrations:
            required += ("self_weapon_gmaul", "self_gmaul_queued", "self_vengeance_cooldown")
        missing = [name for name in (*required, "distance") if name not in feature]
        if missing:
            raise ValueError(f"observation-only script lacks required v2 features: {missing}")
        decisions = idle_actions(len(rows), schema)
        for output, row in enumerate(rows):
            observation = frame.observations[row]
            value = lambda name: float(observation[feature[name]])
            hp, opponent_hp = value("self_hp") * 115, value("opponent_hp") * 115
            distance = value("distance") * 9
            strength = value("self_strength_level") * 120
            attack = value("self_attack_level") * 120
            ranged = value("self_ranged_level") * 120
            special = value("self_special") * 100
            ready = value("self_attack_timer") < 1.0e-6
            preloaded = value("self_gmaul_preloaded") > 0.5
            # A rough visible HP window gives a demonstration, not privileged
            # knowledge of hit chance or pre-rolled future damage.
            ko_window = self.spec_hp * min(1.05, max(0.7, strength / 118))
            near = distance <= 1.001
            incoming = value("incoming_projectiles_one_tick") > 0
            outgoing = value("outgoing_projectiles_one_tick") > 0
            finishing_window = finishing_demonstrations and opponent_hp <= 80.001
            completed_maul = finishing_demonstrations and value("self_weapon_gmaul") > 0.5 and not preloaded and value("self_gmaul_queued") < 1.0e-6
            recent_vengeance = finishing_demonstrations and value("self_vengeance_cooldown") * 50 >= 47.999
            # Instant Gmaul legality does not require a ready normal attack timer.
            spec_followup = finishing_window and near and any(
                name in main and frame.main_masks[row, main[name]]
                for name in ("GMAUL_RELEASE", "GMAUL_DOUBLE_SPEC", "GMAUL_SPEC")
            )
            normal_melee_followup = near and value("self_attack_timer") * 7 <= 1.001 and (completed_maul or opponent_hp <= min(48, ko_window))
            finishing_vengeance = finishing_window and incoming and (outgoing or spec_followup or normal_melee_followup)
            priorities: list[str] = []
            if hp <= self.combo_hp:
                priorities.extend(("EAT_MARLIN_HALIBUT", "EAT_PIE_HALIBUT", "EAT_MARLIN", "EAT_SUMMER_PIE", "EAT_HALIBUT", "SIP_BREW"))
            elif hp <= self.food_hp:
                priorities.extend(("EAT_MARLIN", "EAT_SUMMER_PIE", "EAT_HALIBUT", "SIP_BREW"))
            if finishing_vengeance:
                priorities.append("CAST_VENGEANCE")
            if near and (opponent_hp <= ko_window or (finishing_window and recent_vengeance)):
                if preloaded:
                    priorities.append("GMAUL_RELEASE")
                if special >= 99.999:
                    priorities.append("GMAUL_DOUBLE_SPEC")
                if special >= 49.999:
                    priorities.append("GMAUL_SPEC")
            if min(attack, strength, ranged) < 96 or value("self_magic_level") * 120 < 94 or value("self_prayer_points") * 99 < 30:
                priorities.append("SIP_SANFEW")
            if ranged < 110:
                priorities.append("SIP_SUPER_RANGING")
            if min(attack, strength) < 110:
                priorities.append("SIP_SUPER_COMBAT")
            # Demonstrate a response to visible pressure, not automatic upkeep.
            # A cast now can reflect an incoming arrow next tick alongside our
            # queued arrow or next melee hit. No rolled damage is visible here.
            melee_followup = near and value("self_attack_timer") * 7 <= 1.001 and opponent_hp <= ko_window
            if not finishing_demonstrations and incoming and (outgoing or melee_followup):
                priorities.append("CAST_VENGEANCE")
            # Completed own queue/equipment is observable; actual follow-up
            # outcomes are counted separately rather than inferred as successes.
            if completed_maul and near and ready:
                priorities.append("ELDER_ATTACK")
            if preloaded and near:
                priorities.append("GMAUL_RELEASE")
            if 1.001 < distance <= 3.001 and opponent_hp <= ko_window and special >= 99.999 and not ready and not preloaded:
                priorities.append("GMAUL_PRELOAD")
            if ready and near and opponent_hp <= min(48, ko_window):
                priorities.append("ELDER_ATTACK")
            if ready:
                priorities.append("WEBWEAVER_ATTACK")
            priorities.append("WAIT")
            chosen = next((name for name in priorities if name in main and frame.main_masks[row, main[name]]), "WAIT")
            decisions[output, 0] = main[chosen]
            melee = chosen in ("GMAUL_SPEC", "GMAUL_DOUBLE_SPEC", "GMAUL_RELEASE", "ELDER_ATTACK", "GMAUL_ATTACK")
            if melee or (chosen == "CAST_VENGEANCE" and finishing_vengeance and near and (spec_followup or normal_melee_followup)):
                movement_choice = "HOLD"
            elif hp <= self.retreat_hp and distance < 7:
                movement_choice = "STEP_AWAY"
            elif preloaded or chosen == "GMAUL_PRELOAD" or (opponent_hp <= ko_window and special >= 49.999):
                movement_choice = "STEP_CLOSER"
            elif distance > self.pressure_distance:
                movement_choice = "STEP_CLOSER"
            elif distance < self.pressure_distance:
                movement_choice = "STEP_AWAY"
            else:
                movement_choice = "HOLD"
            if frame.movement_masks[row, movement[movement_choice]]:
                decisions[output, 1] = movement[movement_choice]
        return decisions


# The held-out thresholds/spacing are deliberately different from demonstration
# labels. They are evaluated only after the candidate checkpoint is selected.
BOOTSTRAP_SCRIPTS = (
    ScriptOpponent("bootstrap_aggressive", 43, 27, 22, 65, 2),
    ScriptOpponent("bootstrap_balanced", 57, 36, 32, 55, 3),
    ScriptOpponent("bootstrap_conservative", 69, 46, 44, 46, 5),
)
HELDOUT_SCRIPTS = (
    ScriptOpponent("heldout_aggressive", 47, 31, 25, 70, 1),
    ScriptOpponent("heldout_balanced", 61, 41, 37, 59, 4),
    ScriptOpponent("heldout_conservative", 74, 51, 49, 42, 6),
)


def demonstration_diagnostics(arrays: dict[str, np.ndarray], reports: Sequence[dict[str, Any]], schema: Schema, max_ticks: int, weights: np.ndarray, teacher_rows: np.ndarray | None = None) -> dict[str, Any]:
    cast = schema.action_heads["main"].index("CAST_VENGEANCE")
    choices = arrays["actions"][:, 0]
    legal = arrays["main_masks"][:, cast]
    casts = legal & (choices == cast)
    deferred = legal & ~casts
    opening = arrays["observations"][:, schema.feature_names.index("episode_progress")] * max_ticks <= 2.001
    outcomes = ("openingVengeanceCasts", "vengeanceCasts", "vengeanceReflectedDamage", "vengeanceStackDamage",
                "vengeanceComboDamage", "vengeanceComboKos", "doubleMaulAttacks", "elderAttacks",
                "elderAfterDoubleMaul", "stockedComboKos", "illegal")
    owned = np.ones(len(reports) * 2, dtype=bool) if teacher_rows is None else teacher_rows
    return {
        "cast_legal_rows": int(legal.sum()), "cast_legal_labeled_cast": int(casts.sum()),
        "cast_legal_deferred": int(deferred.sum()),
        "cast_legal_deferred_actions": dict(Counter(schema.action_heads["main"][index] for index in choices[deferred])),
        "opening_cast_labels": int((casts & opening).sum()),
        "cast_legal_row_weight_mass": {"cast": float(weights[choices[casts]].sum()), "deferred": float(weights[choices[deferred]].sum())},
        "actual_demo_outcomes": {"fights": len(reports), "actors": int(owned.sum()), "outcomes": dict(Counter(report["outcome"] for report in reports)),
                                **{key: float(sum(report[key][side] for index, report in enumerate(reports) for side in (0, 1) if owned[index * 2 + side])) for key in outcomes}},
        "actual_combo_finishes": [{"seed": report["seed"], "winner": report["winner"], "comboFinish": report["comboFinish"]}
                                 for index, report in enumerate(reports) if "comboFinish" in report and owned[index * 2 + report["winner"]]],
    }


def bootstrap_schedule(fights: int, max_ticks: int, seed: int, finishing_demonstrations: bool) -> tuple[list[dict[str, int]], np.ndarray, np.ndarray]:
    if not finishing_demonstrations:
        configs = [{"seed": seed + index, "startDistance": DISTANCES[index % 3], "pid": (index // 3) % 2, "maxTicks": max_ticks} for index in range(fights)]
        scripts = np.asarray([(index // 2 + index % 2) % len(BOOTSTRAP_SCRIPTS) for index in range(fights * 2)])
        return configs, scripts, np.ones(fights * 2, dtype=bool)
    # Each 216-fight cycle crosses teacher, distance, PID and teacher side.
    # Every cell faces current weights three times and each training script once.
    configs = []
    scripts = np.full(fights * 2, -1, dtype=np.int64)  # -1 means frozen current.
    teachers = np.zeros(fights * 2, dtype=bool)
    for index in range(fights):
        cell = (index // 2) % 36
        side = cell // 18
        teacher_row = index * 2 + side
        configs.append({"seed": seed + index, "startDistance": DISTANCES[(cell // 3) % 3], "pid": (cell // 9) % 2, "maxTicks": max_ticks})
        scripts[teacher_row] = cell % 3
        teachers[teacher_row] = True
        if index % 2:
            scripts[teacher_row ^ 1] = (index // 72) % 3
    return configs, scripts, teachers


def bootstrap_coverage(configs: Sequence[dict[str, int]], script_rows: np.ndarray, teacher_rows: np.ndarray) -> dict[str, Any]:
    coverage = Counter((BOOTSTRAP_SCRIPTS[script_rows[row]].name, int(configs[row // 2]["startDistance"]), int(configs[row // 2]["pid"]), int(row % 2),
                        "current" if script_rows[row ^ 1] < 0 else "script") for row in np.flatnonzero(teacher_rows))
    return {
        "teacher_start_coverage": [{"teacher": key[0], "distance": key[1], "pid": key[2], "side": key[3], "opponent": key[4], "fights": count} for key, count in sorted(coverage.items())],
        "coverage_summary": {"cells": len(coverage), "min_fights_per_cell": min(coverage.values()), "max_fights_per_cell": max(coverage.values())},
    }


def demonstration_agreement(model: RiskPolicy, data: dict[str, torch.Tensor], schema: Schema, max_ticks: int, batch_size: int) -> dict[str, Any]:
    """In-sample imitation counts, never validation or checkpoint selection."""
    was_training = model.training
    model.eval()
    predictions = []
    with torch.no_grad():
        for start in range(0, len(data["actions"]), batch_size):
            stop = start + batch_size
            main, _, movement, _ = model(data["observations"][start:stop])
            predictions.append(torch.stack((main.masked_fill(~data["main_masks"][start:stop], -1.0e9).argmax(-1),
                                            movement.masked_fill(~data["movement_masks"][start:stop], -1.0e9).argmax(-1)), dim=1))
    model.train(was_training)
    predicted = torch.cat(predictions).cpu().numpy()
    labels = data["actions"].cpu().numpy()
    cast = schema.action_heads["main"].index("CAST_VENGEANCE")
    cast_legal = data["main_masks"][:, cast].cpu().numpy()
    opening = data["observations"][:, schema.feature_names.index("episode_progress")].cpu().numpy() * max_ticks <= 2.001
    contexts = {"all": np.ones(len(labels), dtype=bool), "cast_legal_cast": cast_legal & (labels[:, 0] == cast),
                "cast_legal_defer": cast_legal & (labels[:, 0] != cast), "opening_cast_legal_defer": opening & cast_legal & (labels[:, 0] != cast),
                "maul": np.isin(labels[:, 0], [schema.action_heads["main"].index(name) for name in ("GMAUL_DOUBLE_SPEC", "GMAUL_SPEC", "GMAUL_RELEASE")]),
                "elder": labels[:, 0] == schema.action_heads["main"].index("ELDER_ATTACK")}
    current = data["opponent_current"].cpu().numpy()
    result = {}
    for opponent, rows in (("current", current), ("script", ~current)):
        result[opponent] = {}
        for context, mask in contexts.items():
            selected = rows & mask
            matches = predicted[selected] == labels[selected]
            result[opponent][context] = {"rows": int(selected.sum()), "main_correct": int(matches[:, 0].sum()),
                                         "joint_correct": int(matches.all(axis=1).sum()), "cast_predictions": int((predicted[selected, 0] == cast).sum())}
    return result


def bootstrap_policy(bridge: BrowserBridge, model: RiskPolicy, optimizer: torch.optim.Optimizer, device: torch.device, fights: int, epochs: int, max_ticks: int, batch_size: int, seed: int, balance_demonstrations: bool = False, finishing_demonstrations: bool = False, baseline: RiskPolicy | None = None) -> dict[str, Any]:
    if finishing_demonstrations and baseline is None:
        raise ValueError("finishing demonstrations require the explicit frozen current incumbent")
    configs, script_rows, teacher_rows = bootstrap_schedule(fights, max_ticks, seed, finishing_demonstrations)
    current_rows = script_rows < 0
    script_opponent_rows = ~teacher_rows & ~current_rows
    frame = bridge.reset(configs)
    history: dict[str, list[np.ndarray]] = defaultdict(list)
    observed_rows: Counter[str] = Counter()
    cast_index = bridge.schema.action_heads["main"].index("CAST_VENGEANCE")
    first_cast_ticks: dict[int, int] = {}
    for tick in range(max_ticks):
        active = np.repeat(~frame.dones, 2)
        rows = np.flatnonzero(active & teacher_rows)
        actions = idle_actions(fights * 2, bridge.schema)
        current = np.flatnonzero(active & current_rows)
        if len(current):
            actions[current], _, _ = infer(baseline, frame, current, device, deterministic=True)
        for name, ownership in (("teacher", teacher_rows), ("current", current_rows), ("script_opponent", script_opponent_rows)):
            observed_rows[name] += int((active & ownership).sum())
        for index, script in enumerate(BOOTSTRAP_SCRIPTS):
            owned = np.flatnonzero(active & (script_rows == index))
            if len(owned):
                actions[owned] = script.actions(frame, owned, bridge.schema, finishing_demonstrations=finishing_demonstrations)
        for row in rows[actions[rows, 0] == cast_index]:
            first_cast_ticks.setdefault(int(row), tick)
        for key, value in {"observations": frame.observations[rows], "main_masks": frame.main_masks[rows], "movement_masks": frame.movement_masks[rows], "actions": actions[rows], "opponent_current": current_rows[rows ^ 1]}.items():
            history[key].append(value)
        frame = bridge.step(actions)
        if (tick + 1) % 60 == 0:
            emit("bootstrap_rollout_progress", tick=tick + 1, active_fights=int((~frame.dones).sum()))
        if frame.dones.all():
            break
    if not frame.dones.all():
        raise RuntimeError("bootstrap fights did not terminate at maxTicks")
    arrays = {key: np.concatenate(values) for key, values in history.items()}
    data = {key: torch.as_tensor(value, device=device) for key, value in arrays.items()}
    for key, tensor in data.items():
        assert_cuda(tensor, f"bootstrap {key}")
    counts = np.bincount(arrays["actions"][:, 0], minlength=len(bridge.schema.action_heads["main"]))
    weights = np.ones(len(counts), dtype=np.float32)
    present = counts > 0
    weights[present] = np.sqrt(counts.sum() / (present.sum() * counts[present]))
    if balance_demonstrations:
        weights /= float(np.dot(weights, counts) / counts.sum())
        weights = np.clip(weights, 0.35, 4)
    else:
        weights = np.clip(weights, 0.25, 4)
    reports = [report for report in frame.reports if report is not None]
    diagnostics = demonstration_diagnostics(arrays, reports, bridge.schema, max_ticks, weights, teacher_rows)
    diagnostics["actual_current_opponent_outcomes"] = demonstration_diagnostics(arrays, reports, bridge.schema, max_ticks, weights, current_rows)["actual_demo_outcomes"]
    diagnostics["actual_script_opponent_outcomes"] = demonstration_diagnostics(arrays, reports, bridge.schema, max_ticks, weights, script_opponent_rows)["actual_demo_outcomes"]
    diagnostics["first_cast_label_tick_histogram"] = dict(Counter(first_cast_ticks.values()))
    diagnostics["actors_without_cast_label"] = int(teacher_rows.sum()) - len(first_cast_ticks)
    diagnostics["sample_ownership"] = {"teacher_actors": int(teacher_rows.sum()), "current_actors": int(current_rows.sum()),
                                       "script_opponent_actors": int(script_opponent_rows.sum()), "observed_rows": dict(observed_rows),
                                       "supervised_rows": len(arrays["actions"]), "supervised_against_current": int(arrays["opponent_current"].sum()),
                                       "supervised_against_script": int((~arrays["opponent_current"]).sum())}
    diagnostics.update(bootstrap_coverage(configs, script_rows, teacher_rows))
    emit("bootstrap_demonstrations", finishing_demonstrations=finishing_demonstrations,
         actual_combo_finish_count=len(diagnostics["actual_combo_finishes"]),
         **{key: value for key, value in diagnostics.items() if key not in ("actual_combo_finishes", "teacher_start_coverage")})
    agreement_before = demonstration_agreement(model, data, bridge.schema, max_ticks, batch_size)
    weight_tensor = torch.as_tensor(weights, device=device)
    losses: list[float] = []
    rows = len(arrays["actions"])
    generator = torch.Generator(device=device).manual_seed(seed)
    for epoch in range(epochs):
        order = torch.randperm(rows, generator=generator, device=device)
        for start in range(0, rows, batch_size):
            indices = order[start:start + batch_size]
            main, _, movement, _ = model(data["observations"][indices])
            main_logits = main.masked_fill(~data["main_masks"][indices], -1.0e9)
            movement_logits = movement.masked_fill(~data["movement_masks"][indices], -1.0e9)
            if balance_demonstrations:
                row_weights = weight_tensor[data["actions"][indices, 0]]
                main_loss = nn.functional.cross_entropy(main_logits, data["actions"][indices, 0], reduction="none")
                movement_loss = nn.functional.cross_entropy(movement_logits, data["actions"][indices, 1], reduction="none")
                loss = (row_weights * (main_loss + 0.35 * movement_loss)).mean()
            else:
                loss = nn.functional.cross_entropy(main_logits, data["actions"][indices, 0], weight=weight_tensor) + 0.35 * nn.functional.cross_entropy(movement_logits, data["actions"][indices, 1])
            assert_cuda(loss, "bootstrap loss")
            if not torch.isfinite(loss):
                raise RuntimeError("bootstrap loss is non-finite")
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0, error_if_nonfinite=True)
            optimizer.step()
            assert_optimizer_cuda(optimizer)
            losses.append(float(loss.detach().cpu()))
        emit("bootstrap_epoch", epoch=epoch + 1, epochs=epochs, rows=rows, last_loss=losses[-1])
    agreement = {"scope": "in-sample teacher rows, before/after BC; diagnostic only, never used for selection",
                 "before": agreement_before, "after": demonstration_agreement(model, data, bridge.schema, max_ticks, batch_size)}
    emit("bootstrap_agreement", **agreement)
    return {"fights": fights, "rows": rows, "epochs": epochs, "finishing_demonstrations": finishing_demonstrations, "demonstration_diagnostics": diagnostics, "student_agreement": agreement, "current_opponent_parameter_sha256": model_digest(baseline) if finishing_demonstrations else None, "loss_first": losses[0], "loss_final": losses[-1], "loss_mean": float(np.mean(losses)), "action_counts": {name: int(count) for name, count in zip(bridge.schema.action_heads["main"], counts)}, "balance_demonstrations": balance_demonstrations, "action_weights": {name: float(weight) for name, weight in zip(bridge.schema.action_heads["main"], weights)}, "weight_dataset_mean_after_clamp": float(np.dot(weights, counts) / counts.sum()), "weighting": "inverse sqrt frequency, dataset mean normalized then clamped 0.35..4; each row weights both main and movement" if balance_demonstrations else "existing main-only class weighting; movement unweighted", "scripts": [script.metadata() for script in BOOTSTRAP_SCRIPTS], "learning": "CUDA masked supervised main/movement labels from observation-only scripts; no deployed helper"}


def collect_rollout(bridge: BrowserBridge, model: RiskPolicy, baseline: RiskPolicy, snapshot: RiskPolicy, device: torch.device, fights: int, seed: int, max_ticks: int, update: int, finishing_demonstrations: bool = False) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    generator = np.random.default_rng(seed)
    configs = [{"seed": seed + index, "startDistance": DISTANCES[index % len(DISTANCES)], "pid": (index // 3) % 2, "maxTicks": max_ticks} for index in range(fights)]
    # Equal quarters: current incumbent, self-play, lagged snapshot, and varied
    # observation-only scripts. Only learner-policy rows enter PPO.
    opponent_modes = np.asarray([index % 4 for index in range(fights)])
    generator.shuffle(opponent_modes)
    learner_sides = np.asarray([index % 2 for index in range(fights)])
    generator.shuffle(learner_sides)
    policy_owner = np.zeros(fights * 2, dtype=np.int64)
    for index, mode in enumerate(opponent_modes):
        if mode != 1:
            policy_owner[index * 2 + 1 - learner_sides[index]] = {0: 1, 2: 2, 3: 3}[int(mode)]
    policies = (model, baseline, snapshot)
    frame = bridge.reset(configs)
    timeline: dict[str, list[np.ndarray]] = defaultdict(list)
    cumulative_rewards = np.zeros(fights * 2, dtype=np.float64)
    started = time.perf_counter()
    for tick in range(max_ticks):
        active = np.repeat(~frame.dones, 2)
        actions = idle_actions(fights * 2, bridge.schema)
        old_lp = np.zeros(fights * 2, dtype=np.float32)
        values = np.zeros(fights * 2, dtype=np.float32)
        for owner, policy in enumerate(policies):
            rows = np.flatnonzero(active & (policy_owner == owner))
            if len(rows):
                actions[rows], old_lp[rows], values[rows] = infer(policy, frame, rows, device, deterministic=owner != 0)
        for script_index, script in enumerate(BOOTSTRAP_SCRIPTS):
            rows = np.flatnonzero(active & (policy_owner == 3) & ((np.arange(fights * 2) // 2) % len(BOOTSTRAP_SCRIPTS) == script_index))
            if len(rows):
                actions[rows] = script.actions(frame, rows, bridge.schema, finishing_demonstrations=finishing_demonstrations)
        for key, value in {"observations": frame.observations, "main_masks": frame.main_masks, "movement_masks": frame.movement_masks, "actions": actions, "old_log_probability": old_lp, "values": values, "trainable": active & (policy_owner == 0)}.items():
            timeline[key].append(value)
        frame = bridge.step(actions)
        cumulative_rewards += frame.rewards
        timeline["rewards"].append(frame.rewards)
        timeline["dones"].append(np.repeat(frame.dones, 2))
        if (tick + 1) % 60 == 0:
            emit("rollout_progress", update=update, tick=tick + 1, active_fights=int((~frame.dones).sum()), seconds=round(time.perf_counter() - started, 2))
        if frame.dones.all():
            break
    if not frame.dones.all():
        raise RuntimeError("browser did not terminate all fights at maxTicks; refusing truncated undiscounted returns")
    rollout = {key: np.stack(values) for key, values in timeline.items()}
    returns = np.zeros_like(rollout["rewards"])
    running = np.zeros(fights * 2, dtype=np.float32)
    for tick in range(len(returns) - 1, -1, -1):
        running = rollout["rewards"][tick] + running * (~rollout["dones"][tick])
        returns[tick] = running
    rollout["returns"] = returns
    for index, report in enumerate(frame.reports):
        assert report is not None
        audit_objective_report(report, bridge.schema.raw["reward"], cumulative_rewards[index * 2:index * 2 + 2])
    reports = [report for report in frame.reports if report is not None]
    summary = {"fights": fights, "objective_version": OBJECTIVE_VERSION, "finishing_demonstrations": finishing_demonstrations, "trainable_rows": int(rollout["trainable"].sum()), "ticks": len(returns), "outcomes": dict(Counter(report["outcome"] for report in reports)), "opponent_fights": {"current_incumbent": int((opponent_modes == 0).sum()), "current_selfplay": int((opponent_modes == 1).sum()), "lagged_snapshot": int((opponent_modes == 2).sum()), "observation_scripts": int((opponent_modes == 3).sum())}, "illegal_actions": int(sum(sum(report["illegal"]) for report in reports)), "reward_min": float(cumulative_rewards.min()), "reward_max": float(cumulative_rewards.max()), "learner_objective_return_mean": float(cumulative_rewards[policy_owner == 0].mean()), "seconds": round(time.perf_counter() - started, 2)}
    emit("rollout_complete", update=update, **summary)
    return rollout, summary


def ppo_update(model: RiskPolicy, optimizer: torch.optim.Optimizer, rollout: dict[str, np.ndarray], device: torch.device, epochs: int, batch_size: int, seed: int, target_kl: float) -> dict[str, Any]:
    selected = rollout["trainable"].reshape(-1)
    if not selected.any():
        raise ValueError("rollout has no trainable policy rows")
    flattened = {key: value.reshape((-1,) + value.shape[2:])[selected] for key, value in rollout.items() if key not in ("trainable", "rewards", "dones")}
    advantages = flattened["returns"] - flattened["values"]
    advantages = (advantages - advantages.mean()) / max(float(advantages.std()), 1.0e-6)
    data = {key: torch.as_tensor(value, device=device) for key, value in flattened.items()}
    data["advantages"] = torch.as_tensor(advantages, device=device)
    for key, value in data.items():
        assert_cuda(value, f"PPO {key}")
    generator = torch.Generator(device=device).manual_seed(seed)
    metrics: dict[str, list[float]] = defaultdict(list)
    rows = len(advantages)
    kl_checks: list[float] = []
    early_stop = False
    completed_epochs = 0
    stop_epoch = None
    for epoch in range(epochs):
        order = torch.randperm(rows, generator=generator, device=device)
        for start in range(0, rows, batch_size):
            indices = order[start:start + batch_size]
            main_logits, _, movement_logits, values = model(data["observations"][indices])
            distributions = (Categorical(logits=main_logits.masked_fill(~data["main_masks"][indices], -1.0e9)), Categorical(logits=movement_logits.masked_fill(~data["movement_masks"][indices], -1.0e9)))
            action = data["actions"][indices]
            log_probability = distributions[0].log_prob(action[:, 0]) + distributions[1].log_prob(action[:, 1])
            log_ratio = log_probability - data["old_log_probability"][indices]
            ratio = log_ratio.exp()
            approximate_kl = float(((ratio - 1) - log_ratio).mean().detach().cpu())
            if not np.isfinite(approximate_kl):
                raise RuntimeError("PPO produced a non-finite policy KL")
            kl_checks.append(approximate_kl)
            if approximate_kl > target_kl:
                early_stop, stop_epoch = True, epoch + 1
                emit("ppo_kl_stop", epoch=stop_epoch, completed_minibatches=len(metrics["loss"]), observed_kl=approximate_kl, target_kl=target_kl)
                break
            advantage = data["advantages"][indices]
            policy_loss = -torch.minimum(ratio * advantage, ratio.clamp(0.8, 1.2) * advantage).mean()
            value_loss = nn.functional.smooth_l1_loss(values, data["returns"][indices])
            entropy = sum(distribution.entropy().mean() for distribution in distributions)
            loss = policy_loss + 0.4 * value_loss - 0.01 * entropy
            assert_cuda(loss, "PPO loss")
            if not torch.isfinite(loss):
                raise RuntimeError("PPO produced a non-finite loss")
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            gradient_norm = nn.utils.clip_grad_norm_(model.parameters(), 1.0, error_if_nonfinite=True)
            optimizer.step()
            assert_optimizer_cuda(optimizer)
            for name, parameter in model.named_parameters():
                assert_cuda(parameter, f"updated parameter {name}")
            for name, value in {"loss": loss, "policy_loss": policy_loss, "value_loss": value_loss, "entropy": entropy, "clip_fraction": (torch.abs(ratio - 1) > 0.2).float().mean(), "gradient_norm": gradient_norm}.items():
                metrics[name].append(float(value.detach().cpu()))
        if early_stop:
            break
        completed_epochs += 1
    return {"rows": rows, "epochs": epochs, "completed_epochs": completed_epochs, "minibatches": len(metrics["loss"]), "early_stop": early_stop, "stop_epoch": stop_epoch, "target_kl": target_kl, "approx_kl": float(np.mean(kl_checks)), "max_observed_kl": max(kl_checks), "stop_kl": kl_checks[-1] if early_stop else None, **{key: float(np.mean(values)) if values else 0.0 for key, values in metrics.items()}}


def result_counts(records: Sequence[dict[str, Any]]) -> dict[str, Any]:
    total = len(records)
    wins = sum(record["result"] == "win" for record in records)
    losses = sum(record["result"] == "loss" for record in records)
    draws = total - wins - losses
    own_combo = sum(record["stockedComboKos"][record["challenger_side"]] for record in records)
    other_combo = sum(record["stockedComboKos"][1 - record["challenger_side"]] for record in records)
    return {"fights": total, "wins": wins, "losses": losses, "draws": draws, "timeouts": sum(record["outcome"] == "timeout" for record in records), "simultaneous_kos": sum(record["outcome"] == "simultaneous-ko" for record in records), "score_rate": (wins + 0.5 * draws) / total if total else None, "win_rate": wins / total if total else None, "loss_rate": losses / total if total else None,
            "stocked_combo_kos": own_combo, "opponent_stocked_combo_kos": other_combo,
            "stocked_combo_ko_rate": own_combo / total if total else None, "opponent_stocked_combo_ko_rate": other_combo / total if total else None,
            "stocked_combo_ko_differential": (own_combo - other_combo) / total if total else None,
            "mean_objective_return": float(np.mean([record["objectiveReturn"][record["challenger_side"]] for record in records])) if total else None,
            "mean_opponent_objective_return": float(np.mean([record["objectiveReturn"][1 - record["challenger_side"]] for record in records])) if total else None,
            "stocked_kos": sum(record["stockedKos"][record["challenger_side"]] for record in records),
            "exhausted_kos": sum(record["exhaustedKos"][record["challenger_side"]] for record in records)}


def evaluate_summary(records: list[dict[str, Any]], bootstrap_seed: int) -> dict[str, Any]:
    grouped: dict[int, list[list[float]]] = defaultdict(list)
    for record in records:
        side = record["challenger_side"]
        grouped[record["seed"]].append([record["score"], record["stockedComboKos"][side] - record["stockedComboKos"][1 - side], record["objectiveReturn"][side]])
    seed_scores = np.asarray([np.mean(values, axis=0) for _, values in sorted(grouped.items())])
    intervals = {"score_rate": None, "stocked_combo_ko_differential": None, "mean_objective_return": None}
    if len(seed_scores) >= 2:
        indices = np.random.default_rng(bootstrap_seed).integers(0, len(seed_scores), size=(4000, len(seed_scores)))
        samples = seed_scores[indices].mean(axis=1)
        for index, name in enumerate(intervals):
            intervals[name] = [float(value) for value in np.quantile(samples[:, index], (0.025, 0.975))]
    diagnostics = {}
    for key in REPORT_METRICS:
        diagnostics[key] = {}
        for label, offset in (("challenger", 0), ("opponent", 1)):
            values = [record[key][record["challenger_side"] ^ offset] for record in records]
            diagnostics[key][label] = {"sum": float(sum(values)), "mean": float(np.mean(values)), "min": float(min(values)), "max": float(max(values))}
    return {
        **result_counts(records), "objective_version": OBJECTIVE_VERSION, "seed_count": len(grouped), "mean_ticks": float(np.mean([record["ticks"] for record in records])),
        "confidence_interval": {"method": "95% percentile bootstrap of paired seed clusters; each seed includes both challenger roles, both initial PID assignments, and all three distances", **intervals, "resamples": 4000, "independent_seed_clusters": len(grouped)},
        "by_distance": {str(distance): result_counts([record for record in records if record["startDistance"] == distance]) for distance in DISTANCES},
        "by_initial_pid": {str(pid): result_counts([record for record in records if record["pid"] == pid]) for pid in (0, 1)},
        "by_challenger_pid": {label: result_counts([record for record in records if (record["challenger_side"] == record["pid"]) == first]) for label, first in (("first", True), ("second", False))},
        "by_challenger_side": {str(side): result_counts([record for record in records if record["challenger_side"] == side]) for side in (0, 1)},
        "diagnostics": diagnostics, "no_illegal_actions": diagnostics["illegal"]["challenger"]["sum"] == 0 and diagnostics["illegal"]["opponent"]["sum"] == 0,
    }


def evaluate(bridge: BrowserBridge, model: RiskPolicy, baseline: RiskPolicy | ScriptOpponent, device: torch.device, seeds: Sequence[int], max_ticks: int, batch_size: int, label: str, bootstrap_seed: int, opponent_identity: dict[str, Any] | None = None) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    cases = [{"seed": seed, "startDistance": distance, "pid": pid, "challenger_side": side, "maxTicks": max_ticks} for seed in seeds for distance in DISTANCES for pid in (0, 1) for side in (0, 1)]
    records: list[dict[str, Any]] = []
    started = time.perf_counter()
    for start in range(0, len(cases), batch_size):
        batch = cases[start:start + batch_size]
        frame = bridge.reset([{key: value for key, value in case.items() if key != "challenger_side"} for case in batch])
        cumulative_rewards = np.zeros(len(batch) * 2, dtype=np.float64)
        challenger_rows = np.zeros(len(batch) * 2, dtype=np.bool_)
        for index, case in enumerate(batch):
            challenger_rows[2 * index + case["challenger_side"]] = True
        for tick in range(max_ticks):
            active = np.repeat(~frame.dones, 2)
            actions = idle_actions(len(batch) * 2, bridge.schema)
            for policy, owner in ((model, challenger_rows), (baseline, ~challenger_rows)):
                rows = np.flatnonzero(active & owner)
                if len(rows):
                    if isinstance(policy, ScriptOpponent):
                        actions[rows] = policy.actions(frame, rows, bridge.schema)
                    else:
                        actions[rows], _, _ = infer(policy, frame, rows, device, deterministic=True)
            frame = bridge.step(actions)
            cumulative_rewards += frame.rewards
            if frame.dones.all():
                break
            if (tick + 1) % 120 == 0:
                emit("evaluation_progress", phase=label, batch_start=start, tick=tick + 1, active_fights=int((~frame.dones).sum()))
        if not frame.dones.all():
            raise RuntimeError("evaluation exceeded maxTicks without terminal reports")
        for index, (case, report) in enumerate(zip(batch, frame.reports)):
            assert report is not None
            audit_objective_report(report, bridge.schema.raw["reward"], cumulative_rewards[index * 2:index * 2 + 2])
            result = "draw" if report["winner"] is None else "win" if report["winner"] == case["challenger_side"] else "loss"
            side = case["challenger_side"]
            records.append({**report, **case, "result": result, "score": {"win": 1.0, "draw": 0.5, "loss": 0.0}[result], "combo_difference": report["stockedComboKos"][side] - report["stockedComboKos"][1 - side], "own_combo_ko": report["stockedComboKos"][side], "actor_objective_return": report["objectiveReturn"][side]})
        emit("evaluation_batch", phase=label, completed=len(records), total=len(cases), seconds=round(time.perf_counter() - started, 2))
    summary = evaluate_summary(records, bootstrap_seed)
    summary["opponent"] = baseline.metadata() if isinstance(baseline, ScriptOpponent) else opponent_identity or "frozen_current_incumbent"
    summary["seconds"] = round(time.perf_counter() - started, 2)
    emit("evaluation_complete", phase=label, **result_counts(records), combo_ci=summary["confidence_interval"]["stocked_combo_ko_differential"], no_illegal_actions=summary["no_illegal_actions"])
    return summary, records


def paired_metric_delta(challenger: list[dict[str, Any]], incumbent: list[dict[str, Any]], seed: int, metric: str) -> dict[str, Any]:
    key = lambda record: (record["seed"], record["startDistance"], record["pid"], record["challenger_side"])
    reference = {key(record): record[metric] for record in incumbent}
    if len(reference) != len(incumbent) or set(reference) != {key(record) for record in challenger}:
        raise ValueError("script evaluation cases are not paired")
    grouped: dict[int, list[float]] = defaultdict(list)
    for record in challenger:
        grouped[record["seed"]].append(record[metric] - reference[key(record)])
    values = np.asarray([np.mean(scores) for _, scores in sorted(grouped.items())])
    interval = None
    if len(values) > 1:
        samples = np.random.default_rng(seed).choice(values, size=(4000, len(values)), replace=True).mean(axis=1)
        interval = [float(value) for value in np.quantile(samples, (0.025, 0.975))]
    return {"metric": metric, "mean_delta": float(values.mean()), "confidence_interval_95": interval, "method": "paired bootstrap over seed clusters, preserving both roles/PID assignments and distances", "seed_count": len(values)}


def paired_score_delta(challenger: list[dict[str, Any]], incumbent: list[dict[str, Any]], seed: int) -> dict[str, Any]:
    result = paired_metric_delta(challenger, incumbent, seed, "score")
    return {**result, "score_delta": result["mean_delta"]}


def evaluate_scripts(bridge: BrowserBridge, model: RiskPolicy, baseline: RiskPolicy, device: torch.device, seeds: Sequence[int], max_ticks: int, batch_size: int, bootstrap_seed: int, output: Path, metadata: dict[str, Any]) -> dict[str, Any]:
    summaries = {}
    for script in HELDOUT_SCRIPTS:
        challenger_metrics, challenger_records = evaluate(bridge, model, script, device, seeds, max_ticks, batch_size, f"selected_vs_{script.name}", bootstrap_seed)
        incumbent_metrics, incumbent_records = evaluate(bridge, baseline, script, device, seeds, max_ticks, batch_size, f"incumbent_vs_{script.name}", bootstrap_seed)
        difference = paired_score_delta(challenger_records, incumbent_records, bootstrap_seed)
        combo_difference = paired_metric_delta(challenger_records, incumbent_records, bootstrap_seed, "combo_difference")
        own_combo_difference = paired_metric_delta(challenger_records, incumbent_records, bootstrap_seed, "own_combo_ko")
        return_difference = paired_metric_delta(challenger_records, incumbent_records, bootstrap_seed, "actor_objective_return")
        summaries[script.name] = {"script": script.metadata(), "candidate": challenger_metrics, "incumbent": incumbent_metrics, "paired_difference": difference, "paired_combo_difference": combo_difference, "paired_own_combo_ko_rate_difference": own_combo_difference, "paired_objective_return_difference": return_difference}
        write_json(output / f"evaluation-{script.name}.json", {**metadata, **summaries[script.name], "candidate_fights": challenger_records, "incumbent_fights": incumbent_records, "used_for_selection": False})
    return {"seeds": list(seeds), "objective_version": OBJECTIVE_VERSION, "current_incumbent": metadata["current_incumbent"], "used_for_selection": False, "scripts": summaries, "mean_score_delta": float(np.mean([entry["paired_difference"]["score_delta"] for entry in summaries.values()])), "mean_combo_delta": float(np.mean([entry["paired_combo_difference"]["mean_delta"] for entry in summaries.values()])), "mean_own_combo_ko_rate_delta": float(np.mean([entry["paired_own_combo_ko_rate_difference"]["mean_delta"] for entry in summaries.values()])), "any_significant_combo_regression": any(entry["paired_combo_difference"]["confidence_interval_95"] is not None and entry["paired_combo_difference"]["confidence_interval_95"][1] < 0 for entry in summaries.values()), "any_significant_own_combo_regression": any(entry["paired_own_combo_ko_rate_difference"]["confidence_interval_95"] is not None and entry["paired_own_combo_ko_rate_difference"]["confidence_interval_95"][1] < 0 for entry in summaries.values()), "any_significant_ordinary_score_regression": any(entry["paired_difference"]["confidence_interval_95"] is not None and entry["paired_difference"]["confidence_interval_95"][1] < 0 for entry in summaries.values()), "no_illegal_actions": all(entry["candidate"]["no_illegal_actions"] and entry["incumbent"]["no_illegal_actions"] for entry in summaries.values())}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    with path.open("x", encoding="utf-8") as target:
        json.dump(payload, target, indent=2, sort_keys=True, allow_nan=False)
        target.write("\n")


def save_checkpoint(path: Path, model: RiskPolicy, optimizer: torch.optim.Optimizer | None, metadata: dict[str, Any], stage: str) -> None:
    state = cpu_copy(model.state_dict())
    payload = {
        **metadata, "kind": "webweaver-riskfight-candidate", "stage": stage,
        "model_state": state, "state_dict": state, "model_state_device": "cpu",
        "parameter_sha256": model_digest(model), "optimizer_tensor_devices_during_learning": optimizer_devices(optimizer),
        "optimizer_state": cpu_copy(optimizer.state_dict()) if optimizer is not None else None,
        "main_actions": metadata["action_heads"]["main"], "prayer_actions": metadata["action_heads"]["prayer"], "movement_actions": metadata["action_heads"]["movement"],
    }
    with path.open("xb") as target:
        torch.save(payload, target)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--seed", type=int, default=73_001)
    parser.add_argument("--fights", type=int, default=64, help="parallel fights per rollout: equal quarters current incumbent, self-play, snapshot and observation-only scripts")
    parser.add_argument("--updates", type=int, default=6)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--bootstrap-fights", type=int, default=0, help="optional observation-only demonstration fights; 0 disables supervised warm-start")
    parser.add_argument("--bootstrap-epochs", type=int, default=4)
    parser.add_argument("--finishing-demonstrations", action="store_true", help="training-only Vengeance/maul/Elder examples from legal sanitized observations; held-out opponents are unchanged")
    parser.add_argument("--balance-demonstrations", action="store_true", help="weight both main and movement demo loss by main-action rarity; optional coordinated-label balancing")
    parser.add_argument("--batch-size", type=int, default=4096, help="CUDA PPO minibatch rows")
    parser.add_argument("--learning-rate", type=float, default=1.0e-4, help="supervised bootstrap learning rate")
    parser.add_argument("--ppo-learning-rate", type=float, default=3.0e-5, help="separate continuation learning rate; PPO starts with fresh Adam state")
    parser.add_argument("--target-kl", type=float, default=0.015, help="stop further PPO minibatches when policy KL exceeds this value")
    parser.add_argument("--max-ticks", type=int, default=360)
    parser.add_argument("--validation-seeds", type=int, default=8, help="seed clusters used only for checkpoint selection; 12 paired fights per seed")
    parser.add_argument("--eval-seeds", type=int, default=24, help="held-out seed clusters used only after selecting the checkpoint; 12 fights per seed")
    parser.add_argument("--script-eval-seeds", type=int, default=4, help="held-out seed clusters for each varied scripted opponent, capped by --eval-seeds; 12 fights per seed and policy")
    parser.add_argument("--eval-batch-fights", type=int, default=128)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    parser.add_argument("--current-incumbent-v2", type=Path, help="frozen current v2 comparison; defaults to --resume-v2 for training, required for evaluation-only")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--evaluate-only", type=Path, help="evaluate a saved v2 candidate without learning or checkpoint selection")
    mode.add_argument("--resume-v2", type=Path, help="required v2 training initialization; freezes it as current incumbent unless separately specified, requires fresh seeds")
    parser.add_argument("--allow-resume-source-update", action="store_true", help="explicitly permit changed engine source for v2 training continuation only; records lineage and requires newly trained requalification")
    parser.add_argument("--allow-evaluation-source-update", action="store_true", help="explicitly evaluate unchanged checkpoint weights against changed source; evaluation-only, with original training provenance retained")
    parser.add_argument("--output-dir", type=Path, help="exact NEW artifact directory; defaults to fastsim/out/riskfight/<UTC>-browser")
    parser.add_argument("--bridge", type=Path, default=ROOT / "scripts/riskfight-training-bridge.mjs")
    parser.add_argument("--node", default="node")
    parser.add_argument("--bridge-timeout", type=float, default=120.0, help="seconds allowed per JSON-lines response")
    args = parser.parse_args(argv)
    for name in ("fights", "updates", "epochs", "bootstrap_epochs", "batch_size", "max_ticks", "validation_seeds", "eval_seeds", "script_eval_seeds", "eval_batch_fights"):
        if getattr(args, name) < 1:
            parser.error(f"--{name.replace('_', '-')} must be positive")
    if any(not np.isfinite(value) or value <= 0 for value in (args.learning_rate, args.ppo_learning_rate, args.target_kl, args.bridge_timeout)):
        parser.error("learning rates, target KL and bridge timeout must be finite and positive")
    if args.allow_resume_source_update and not args.resume_v2:
        parser.error("--allow-resume-source-update requires --resume-v2; it is not permitted for evaluation-only")
    if args.allow_evaluation_source_update and not args.evaluate_only:
        parser.error("--allow-evaluation-source-update requires --evaluate-only; it is not permitted for training or resume")
    if not args.evaluate_only and not args.resume_v2:
        parser.error("stocked-combo training requires explicit --resume-v2; there is no v1 initialization fallback")
    if args.evaluate_only and not args.current_incumbent_v2:
        parser.error("--evaluate-only requires explicit --current-incumbent-v2")
    if args.finishing_demonstrations and args.evaluate_only:
        parser.error("--finishing-demonstrations affects training scripts only; omit it for evaluation-only")
    if args.bootstrap_fights < 0:
        parser.error("--bootstrap-fights must be nonnegative")
    if args.seed < 0 or args.seed + max(900_000 + args.eval_seeds, 100_000 + args.updates * args.fights) >= 2**32:
        parser.error("seed ranges must fit unsigned 32-bit bridge seeds")
    return args


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    if not args.bridge.is_file():
        raise RuntimeError(f"browser engine bridge does not exist: {args.bridge}")
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = require_cuda(args.device)
    torch.cuda.manual_seed_all(args.seed)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.cuda.reset_peak_memory_stats(device)
    output = (args.output_dir or ROOT / "fastsim/out/riskfight" / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + "-browser")).resolve()
    artifact_root = (ROOT / "fastsim/out/riskfight").resolve()
    if not output.is_relative_to(artifact_root) or output == artifact_root:
        raise ValueError(f"output directory must be a fresh child of ignored {artifact_root}")
    output.mkdir(parents=True, exist_ok=False)
    trainer_bytes = Path(__file__).resolve().read_bytes()
    trainer_checksum = hashlib.sha256(trainer_bytes).hexdigest()
    with (output / "trainer-source.py").open("xb") as snapshot_file:
        snapshot_file.write(trainer_bytes)
    bridge: BrowserBridge | None = None
    started = time.perf_counter()
    try:
        bridge = BrowserBridge(args.node, args.bridge.resolve(), output / "bridge.stderr.log", args.bridge_timeout)
        schema = bridge.schema
        reward_contract = validate_combo_contract(schema.raw.get("reward", {}))
        stable_v1, migration = migrate_incumbent(args.baseline.resolve(), schema)
        stable_v1 = stable_v1.to(device).eval().requires_grad_(False)
        stable_v1_digest = model_digest(stable_v1)
        validation_seeds = list(range(args.seed + 700_000, args.seed + 700_000 + args.validation_seeds))
        heldout_seeds = list(range(args.seed + 900_000, args.seed + 900_000 + args.eval_seeds))
        train_start, train_end = args.seed + 100_000, args.seed + 100_000 + args.updates * args.fights
        bootstrap_start, bootstrap_end = args.seed + 1_000, args.seed + 1_000 + args.bootstrap_fights
        if set(validation_seeds) & set(heldout_seeds) or any(train_start <= seed < train_end for seed in validation_seeds + heldout_seeds):
            raise ValueError("training, validation and held-out seeds overlap")
        if bootstrap_end > train_start or any(bootstrap_start <= seed < bootstrap_end for seed in validation_seeds + heldout_seeds):
            raise ValueError("bootstrap seeds overlap training or evaluation seeds")
        cuda = {"device": str(device), "device_name": torch.cuda.get_device_name(device), "capability": list(torch.cuda.get_device_capability(device)), "torch": str(torch.__version__), "torch_cuda": torch.version.cuda, "python": sys.version.split()[0], "allocation_and_kernel_probe_passed": True, "parameter_device": str(next(stable_v1.parameters()).device), "tf32_enabled": False}
        metadata = {
            **schema.metadata(), **migration, "created_at": datetime.now(timezone.utc).isoformat(),
            "arguments": {key: str(value) if isinstance(value, Path) else value for key, value in vars(args).items()},
            "artifact_directory": str(output), "bridge_path": str(args.bridge.resolve()), "bridge_sha256": sha256_file(args.bridge), "bridge_schema": schema.raw,
            "trainer_source_sha256": trainer_checksum, "trainer_source_snapshot": str(output / "trainer-source.py"),
            "cuda": cuda, "baseline_parameter_sha256": stable_v1_digest, "network": {"hidden_size": HIDDEN, "activation": "silu", "layer_norm_epsilon": 1.0e-5},
            "prayer_mode": "forced NONE; serialized prayer head retained and frozen", "gamma": 1.0,
            "reward_owner": "source-engine realized stocked combos; exhausted victories and timeouts return zero, deaths return -10; only a surviving stocked-victory winner retains capped combo bonuses; generic damage and button presses earn no reward", "objective_version": OBJECTIVE_VERSION, "reward_contract": reward_contract, "promoted": False,
            "seed_split": {"training_range_inclusive_exclusive": [train_start, train_end], "bootstrap_range_inclusive_exclusive": [bootstrap_start, bootstrap_end], "validation": validation_seeds, "heldout": heldout_seeds},
            "train_only_demonstration_scripts": [script.metadata() for script in BOOTSTRAP_SCRIPTS],
            "training_curriculum": {"version": "finishing_demonstrations_v1" if args.finishing_demonstrations else "existing_observation_scripts",
                                    "finishing_demonstrations": args.finishing_demonstrations, "scope": "bootstrap and scripted training opponents only",
                                    "bootstrap_sampling": "216-fight balanced teacher/current-or-script cycle; only designated teacher rows supervised" if args.finishing_demonstrations else "existing two-teacher selfplay",
                                    "vengeance_opponent_hp_ceiling": 80 if args.finishing_demonstrations else None,
                                    "description": "Food first; visible next-tick incoming plus queued outgoing or legal melee/spec follow-up; recent own Vengeance permits the matching maul window; completed maul queue plus ready shared timer permits Elder. No private damage or deployed helper." if args.finishing_demonstrations else "Existing observation-only script priorities"},
            "heldout_opponent_scripts": [script.metadata() for script in HELDOUT_SCRIPTS],
            "evaluation_contract": "Deterministic legal-action argmax, corrected source engine and sanitized v2 observations for both policies; both roles and PID assignments at distances 1/5/9; no exploration",
            "state_dict_convention": "model_state is canonical; state_dict aliases identical CPU tensors with encoder/main_head/prayer_head/movement_head/value_head keys; no browser JSON is written",
            "optimization": {"critic_updates_actor_encoder": False, "ppo_learning_rate": args.ppo_learning_rate, "target_kl": args.target_kl, "ppo_optimizer_start": "fresh after initialization/resume/bootstrap; no inherited Adam moments", "validation_rejection": "training continues latest weights; best snapshot selected separately by actor objective return then own stocked-combo KO rate", "balance_demonstrations": args.balance_demonstrations},
            "resume_lineage": [],
            "stable_v1_reference": {"label": "stable v1 migrated by explicit feature/action names", "checkpoint_path": str(args.baseline.resolve()), "checkpoint_sha256": migration["source_baseline_sha256"], "parameter_sha256": stable_v1_digest},
        }
        current_path = (args.current_incumbent_v2 or args.resume_v2).resolve()
        # An explicitly named frozen reference is measured under current rules;
        # its original source provenance is retained, never presented as retraining.
        current_checkpoint = load_checked_v2(current_path, schema, metadata, allow_source_update=True)
        baseline = RiskPolicy(schema).to(device)
        baseline.load_state_dict(checked_state(current_checkpoint, schema))
        baseline.eval().requires_grad_(False)
        baseline_digest = model_digest(baseline)
        metadata["current_incumbent"] = {"label": "frozen current v2 incumbent", "checkpoint_path": str(current_path), "checkpoint_sha256": sha256_file(current_path), "parameter_sha256": baseline_digest, "runtime_profile": PROFILE, "training_bridge_sha256": current_checkpoint["bridge_sha256"], "training_source_sha256": current_checkpoint["bridge_schema"]["source_sha256"]}
        metadata["reference_seed_exposure"] = copy.deepcopy(current_checkpoint.get("reference_seed_exposure", [])) + [{"checkpoint_sha256": metadata["current_incumbent"]["checkpoint_sha256"], "seed_split": current_checkpoint["seed_split"]}] + [{"checkpoint_sha256": entry["checkpoint_sha256"], "seed_split": entry["seed_split"]} for entry in current_checkpoint.get("resume_lineage", [])]
        if not args.evaluate_only:
            validate_prior_seed_exposure(metadata["seed_split"], current_checkpoint)
        model = copy.deepcopy(baseline).requires_grad_(True)
        model.prayer_head.requires_grad_(False)
        resume_checkpoint = None
        source_updated = False
        if args.resume_v2:
            resume_checkpoint = load_checked_v2(args.resume_v2.resolve(), schema, metadata, allow_source_update=args.allow_resume_source_update)
            lineage = validate_prior_seed_exposure(metadata["seed_split"], resume_checkpoint)
            previous_source = resume_checkpoint["bridge_schema"]["source_sha256"]
            current_source = schema.raw["source_sha256"]
            source_updated = previous_source != current_source or resume_checkpoint["bridge_sha256"] != metadata["bridge_sha256"]
            resumed = {
                "checkpoint": str(args.resume_v2.resolve()), "checkpoint_sha256": sha256_file(args.resume_v2),
                "parameter_sha256": resume_checkpoint["parameter_sha256"], "stage": resume_checkpoint.get("stage"),
                "source_baseline_sha256": resume_checkpoint["source_baseline_sha256"], "seed_split": resume_checkpoint["seed_split"],
                "source_update_explicitly_allowed": args.allow_resume_source_update, "source_updated": source_updated,
                "previous_source_sha256": previous_source, "current_source_sha256": current_source,
                "previous_bridge_sha256": resume_checkpoint["bridge_sha256"], "current_bridge_sha256": metadata["bridge_sha256"],
                "source_changes": {key: {"previous": previous_source.get(key), "current": current_source.get(key)} for key in sorted(set(previous_source) | set(current_source)) if previous_source.get(key) != current_source.get(key)},
                "optimizer_reused": False,
            }
            metadata["resume_lineage"] = lineage + [resumed]
            metadata["resume"] = resumed
            model.load_state_dict(checked_state(resume_checkpoint, schema))
        write_json(output / "manifest.json", metadata)
        emit("cuda_preflight", output=str(output), runtime_profile=PROFILE, features=len(schema.feature_names), main_actions=len(schema.action_heads["main"]), **cuda)
        if args.evaluate_only:
            checkpoint = load_checked_v2(args.evaluate_only.resolve(), schema, metadata, allow_source_update=args.allow_evaluation_source_update)
            if checkpoint.get("current_incumbent", {}).get("checkpoint_sha256") != metadata["current_incumbent"]["checkpoint_sha256"]:
                raise ValueError("evaluation reference differs from the candidate's explicit current incumbent")
            evaluation_split = {"training_range_inclusive_exclusive": [0, 0], "bootstrap_range_inclusive_exclusive": [0, 0], "validation": [], "heldout": heldout_seeds}
            # Repeating an existing held-out evaluation is allowed; using any
            # ancestor's learning/selection seeds as held-out evidence is not.
            validate_prior_seed_exposure(evaluation_split, checkpoint, include_prior_heldout=False)
            validate_prior_seed_exposure(evaluation_split, current_checkpoint, include_prior_heldout=False)
            model.load_state_dict(checked_state(checkpoint, schema))
            model.eval().requires_grad_(False)
            training_source = checkpoint["bridge_schema"]["source_sha256"]
            evaluation_source = schema.raw["source_sha256"]
            evaluation_metadata = {
                **metadata, "mode": "evaluate_only", "candidate": str(args.evaluate_only.resolve()),
                "candidate_sha256": sha256_file(args.evaluate_only), "candidate_parameter_sha256": checkpoint["parameter_sha256"],
                "training_bridge_schema": checkpoint["bridge_schema"], "training_source_sha256": training_source,
                "training_bridge_sha256": checkpoint["bridge_sha256"], "learned_weight_computation": False,
                "evaluation_source_update": {
                    "explicitly_allowed": args.allow_evaluation_source_update,
                    "source_updated": training_source != evaluation_source or checkpoint["bridge_sha256"] != metadata["bridge_sha256"],
                    "bridge_changed": checkpoint["bridge_sha256"] != metadata["bridge_sha256"],
                    "source_changes": {key: {"training": training_source.get(key), "evaluation": evaluation_source.get(key)} for key in sorted(set(training_source) | set(evaluation_source)) if training_source.get(key) != evaluation_source.get(key)},
                },
            }
            heldout, records = evaluate(bridge, model, baseline, device, heldout_seeds, args.max_ticks, args.eval_batch_fights, "evaluate_only_current_incumbent", args.seed + 50_003, metadata["current_incumbent"])
            varied = evaluate_scripts(bridge, model, baseline, device, heldout_seeds[:args.script_eval_seeds], args.max_ticks, args.eval_batch_fights, args.seed + 60_007, output, evaluation_metadata)
            stable_metrics, stable_records = evaluate(bridge, model, stable_v1, device, heldout_seeds, args.max_ticks, args.eval_batch_fights, "evaluate_only_stable_v1", args.seed + 70_009, metadata["stable_v1_reference"])
            write_json(output / "evaluation-stable-v1.json", {**evaluation_metadata, "metrics": stable_metrics, "fights": stable_records, "used_for_selection": False})
            if model_digest(model) != checkpoint["parameter_sha256"]:
                raise RuntimeError("evaluation unexpectedly changed candidate weights")
            write_json(output / "report.json", {**evaluation_metadata, "heldout": heldout, "varied_opponents": varied, "stable_v1_evaluation": stable_metrics, "improvement_evidence": combo_improvement_evidence(heldout, varied, stable_metrics), "fights": records})
            emit("complete", mode="evaluate_only", report=str(output / "report.json"), **result_counts(records))
            return

        save_checkpoint(output / "stable-v1-migrated.pt", stable_v1, None, {**metadata, "export_ready": False}, "stable_v1_reference")
        save_checkpoint(output / "current-incumbent-frozen.pt", baseline, None, {**metadata, "export_ready": False, "training_bridge_schema": current_checkpoint["bridge_schema"]}, "current_incumbent")
        initial_validation, records = evaluate(bridge, baseline, baseline, device, validation_seeds, args.max_ticks, args.eval_batch_fights, "validation_current_incumbent", args.seed + 40_001, metadata["current_incumbent"])
        write_json(output / "validation-incumbent.json", {**metadata, "stage": "current_incumbent", "metrics": initial_validation, "fights": records})
        best_rank = combo_selection_rank(initial_validation)
        best_state = cpu_copy(baseline.state_dict())
        best_stage = "current_incumbent"
        best_update = 0
        best_optimizer_state = None
        bootstrap_report = None
        resume_report = None
        if resume_checkpoint is not None:
            if model_digest(model) == baseline_digest:
                resume_validation = initial_validation
            else:
                resume_validation, records = evaluate(bridge, model, baseline, device, validation_seeds, args.max_ticks, args.eval_batch_fights, "validation_resume", args.seed + 40_001, metadata["current_incumbent"])
            resume_selected = combo_selection_rank(resume_validation) > best_rank
            if resume_selected:
                best_rank, best_stage, best_update = combo_selection_rank(resume_validation), "resumed_v2", -2
                best_state = cpu_copy(model.state_dict())
            resume_report = {"validation": resume_validation, "selected": resume_selected, "source_requalification_required": source_updated, "learned_weight_computation": False}
            # These are inherited weights, even though validation used the
            # current engine. Preserve their original training source exactly.
            inherited_metadata = {**metadata, "bridge_schema": resume_checkpoint["bridge_schema"], "bridge_sha256": resume_checkpoint["bridge_sha256"], "evaluation_source_sha256": schema.raw["source_sha256"], "resume_validation": resume_report, "export_ready": False}
            save_checkpoint(output / "candidate-resume.pt", model, None, inherited_metadata, "resumed_v2")
            write_json(output / "validation-resume.json", {**metadata, **resume_report, "fights": records})
        if args.bootstrap_fights:
            bootstrap_optimizer = torch.optim.AdamW([parameter for parameter in model.parameters() if parameter.requires_grad], lr=args.learning_rate, weight_decay=1.0e-4)
            bootstrap_metrics = bootstrap_policy(bridge, model, bootstrap_optimizer, device, args.bootstrap_fights, args.bootstrap_epochs, args.max_ticks, args.batch_size, bootstrap_start, args.balance_demonstrations, args.finishing_demonstrations, baseline)
            bootstrap_validation, records = evaluate(bridge, model, baseline, device, validation_seeds, args.max_ticks, args.eval_batch_fights, "validation_bootstrap", args.seed + 40_001, metadata["current_incumbent"])
            bootstrap_selected = combo_selection_rank(bootstrap_validation) > best_rank
            if bootstrap_selected:
                best_rank, best_stage, best_update = combo_selection_rank(bootstrap_validation), "observation_script_bootstrap", -1
                best_state = cpu_copy(model.state_dict())
            bootstrap_report = {"training": bootstrap_metrics, "validation": bootstrap_validation, "selected": bootstrap_selected}
            save_checkpoint(output / "candidate-bootstrap.pt", model, bootstrap_optimizer, {**metadata, "bootstrap": bootstrap_report}, "observation_script_bootstrap")
            write_json(output / "validation-bootstrap.json", {**metadata, **bootstrap_report, "fights": records})
            del bootstrap_optimizer
        # Keep the latest learning state, including exploratory bootstrap/PPO
        # changes. Validation chooses a separate retained snapshot, not a reset.
        optimizer = torch.optim.AdamW([parameter for parameter in model.parameters() if parameter.requires_grad], lr=args.ppo_learning_rate, weight_decay=1.0e-4)
        best_optimizer_state = cpu_copy(optimizer.state_dict())
        emit("ppo_optimizer_reset", starting_stage="observation_script_bootstrap" if args.bootstrap_fights else "resumed_v2", selected_stage=best_stage, learning_rate=args.ppo_learning_rate, inherited_moment_tensors=0, target_kl=args.target_kl)
        snapshot = copy.deepcopy(baseline)
        history: list[dict[str, Any]] = []
        for update in range(1, args.updates + 1):
            rollout, rollout_summary = collect_rollout(bridge, model, baseline, snapshot, device, args.fights, train_start + (update - 1) * args.fights, args.max_ticks, update, args.finishing_demonstrations)
            # Keep the pre-update weights as next rollout's lagged opponent.
            snapshot = copy.deepcopy(model).eval().requires_grad_(False)
            before = model_digest(model)
            metrics = ppo_update(model, optimizer, rollout, device, args.epochs, args.batch_size, args.seed + update, args.target_kl)
            del rollout
            if metrics["minibatches"] > 0 and before == model_digest(model):
                raise RuntimeError("CUDA optimizer completed without changing any model parameters")
            if model_digest(baseline) != baseline_digest or model_digest(stable_v1) != stable_v1_digest:
                raise RuntimeError("frozen incumbent changed during training")
            stage = f"update_{update:03d}"
            validation, records = evaluate(bridge, model, baseline, device, validation_seeds, args.max_ticks, args.eval_batch_fights, f"validation_{stage}", args.seed + 40_001, metadata["current_incumbent"])
            selected = combo_selection_rank(validation) > best_rank
            if selected:
                best_rank, best_stage, best_update = combo_selection_rank(validation), stage, update
                best_state = cpu_copy(model.state_dict())
                best_optimizer_state = cpu_copy(optimizer.state_dict())
            stage_report = {"stage": stage, "update": update, "ppo": metrics, "rollout": rollout_summary, "validation": validation, "selected": selected, "restored_best_for_next_rollout": False, "training_continues_latest": True, "accepted_stage": best_stage, "selection_rank": list(combo_selection_rank(validation))}
            history.append(stage_report)
            save_checkpoint(output / f"candidate-{stage}.pt", model, optimizer, {**metadata, "validation": validation}, stage)
            write_json(output / f"validation-{stage}.json", {**metadata, **stage_report, "fights": records})
            emit("cuda_update", update=update, rows=metrics["rows"], loss=round(metrics["loss"], 5), validation_own_combo_rate=validation["stocked_combo_ko_rate"], validation_combo_difference=validation["stocked_combo_ko_differential"], validation_objective_return=validation["mean_objective_return"], validation_score=validation["score_rate"], best_stage=best_stage, restored_best=False, kl_early_stop=metrics["early_stop"], allocated_mib=round(torch.cuda.memory_allocated(device) / 1024**2, 2))
        model.load_state_dict(best_state)
        model.eval()
        if best_optimizer_state is not None:
            optimizer.load_state_dict(best_optimizer_state)
            assert_optimizer_cuda(optimizer)
        # Held-out results are read only after selection is complete. They are
        # evidence, never a fallback search for another candidate checkpoint.
        heldout, records = evaluate(bridge, model, baseline, device, heldout_seeds, args.max_ticks, args.eval_batch_fights, "heldout_selected_current_incumbent", args.seed + 50_003, metadata["current_incumbent"])
        varied = evaluate_scripts(bridge, model, baseline, device, heldout_seeds[:args.script_eval_seeds], args.max_ticks, args.eval_batch_fights, args.seed + 60_007, output, metadata)
        stable_metrics, stable_records = evaluate(bridge, model, stable_v1, device, heldout_seeds, args.max_ticks, args.eval_batch_fights, "heldout_stable_v1", args.seed + 70_009, metadata["stable_v1_reference"])
        write_json(output / "evaluation-stable-v1.json", {**metadata, "metrics": stable_metrics, "fights": stable_records, "used_for_selection": False})
        source_requalified = bool(source_updated and best_stage != "resumed_v2" and best_update != 0 and heldout["no_illegal_actions"] and varied["no_illegal_actions"])
        inherited_checkpoint = current_checkpoint if best_stage == "current_incumbent" else resume_checkpoint if best_stage == "resumed_v2" else None
        training_source = inherited_checkpoint["bridge_schema"]["source_sha256"] if inherited_checkpoint is not None else schema.raw["source_sha256"]
        interval = heldout["confidence_interval"]["stocked_combo_ko_differential"]
        improvement_evidence = combo_improvement_evidence(heldout, varied, stable_metrics)
        export_ready = inherited_checkpoint is None and improvement_evidence["passed"] and (not source_updated or source_requalified)
        report = {
            **metadata, "mode": "training", "updates": history, "resume_validation": resume_report, "bootstrap": bootstrap_report, "incumbent_validation": initial_validation,
            "selection": {"metric": "lexicographic: actor mean objectiveReturn, then own stocked-combo KO rate; opponent combo denial and ordinary win-score do not select; ties retain earlier snapshot", "stage": best_stage, "update": best_update, "rank": list(best_rank), "heldout_used_for_selection": False, "per_update_rollback": False},
            "heldout": heldout, "varied_opponents": varied, "stable_v1_evaluation": stable_metrics, "heldout_fights": records, "candidate_parameter_sha256": model_digest(model),
            "candidate_changed_from_incumbent": model_digest(model) != baseline_digest, "learned_weight_computation": True,
            "source_requalification": {"required": source_updated, "passed": source_requalified if source_updated else None, "selected_weights_training_source_sha256": training_source, "evaluation_source_sha256": schema.raw["source_sha256"], "fresh_validation_and_heldout_completed": True}, "export_ready": export_ready,
            "improvement_evidence": improvement_evidence,
            "elapsed_seconds": round(time.perf_counter() - started, 2), "cuda_peak_memory_mib": round(torch.cuda.max_memory_allocated(device) / 1024**2, 2),
        }
        selected_metadata = {**metadata, "selection": report["selection"], "heldout": heldout, "varied_opponents": varied, "stable_v1_evaluation": stable_metrics, "improvement_evidence": report["improvement_evidence"], "source_requalification": report["source_requalification"], "export_ready": export_ready}
        if inherited_checkpoint is not None:
            selected_metadata["bridge_schema"] = inherited_checkpoint["bridge_schema"]
            selected_metadata["bridge_sha256"] = inherited_checkpoint["bridge_sha256"]
        save_checkpoint(output / "selected-candidate-v2.pt", model, optimizer if best_update else None, selected_metadata, best_stage)
        write_json(output / "report.json", report)
        emit("complete", report=str(output / "report.json"), candidate=str(output / "selected-candidate-v2.pt"), selected_stage=best_stage, heldout_combo_difference=heldout["stocked_combo_ko_differential"], combo_ci=interval, heldout_score=heldout["score_rate"], combo_improvement=improvement_evidence["passed"], export_ready=export_ready, promoted=False)
    except BaseException as exc:
        if not (output / "failure.json").exists():
            write_json(output / "failure.json", {"runtime_profile": PROFILE, "schema_version": SCHEMA_VERSION, "error_type": type(exc).__name__, "error": str(exc), "promoted": False})
        raise
    finally:
        if bridge is not None:
            bridge.close()


if __name__ == "__main__":
    main()
