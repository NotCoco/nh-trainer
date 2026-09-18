#!/usr/bin/env python3
"""Train and evaluate an isolated Webweaver risk-fight candidate on CUDA.

The candidate is intentionally *not* copied into a browser/server policy slot.
It must first pass Java matched-fight parity and runtime schema integration.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import copy
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import random
import subprocess
import sys
import time
from typing import Sequence

import numpy as np
import torch
from torch import nn
from torch.distributions import Categorical

from fastsim.riskfight import (
    ASSUMPTIONS,
    FEATURE_COUNT,
    FEATURE_NAMES,
    KO_TERMINAL_REWARD,
    MAIN_ACTION_COUNT,
    MAX_TICKS,
    MOVEMENT_ACTION_COUNT,
    PRAYER_ACTION_COUNT,
    SHAPING_BUDGET,
    SOURCE_ANCHORS,
    FightActions,
    MainAction,
    MovementAction,
    PrayerAction,
    RiskFight,
    validate_reward_invariant,
)


SCHEMA_VERSION = 1


class RiskPolicy(nn.Module):
    def __init__(self, hidden: int = 192) -> None:
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(FEATURE_COUNT, hidden),
            nn.LayerNorm(hidden),
            nn.SiLU(),
            nn.Linear(hidden, hidden),
            nn.SiLU(),
        )
        self.main_head = nn.Linear(hidden, MAIN_ACTION_COUNT)
        self.prayer_head = nn.Linear(hidden, PRAYER_ACTION_COUNT)
        self.movement_head = nn.Linear(hidden, MOVEMENT_ACTION_COUNT)
        self.value_head = nn.Linear(hidden, 1)

    def forward(self, observation: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        hidden = self.encoder(observation)
        return (
            self.main_head(hidden),
            self.prayer_head(hidden),
            self.movement_head(hidden),
            self.value_head(hidden).squeeze(-1),
        )


def require_cuda(raw: str) -> torch.device:
    if not raw.startswith("cuda"):
        raise SystemExit(f"risk-fight training is CUDA-only; refusing requested device {raw!r}")
    if not torch.cuda.is_available():
        raise SystemExit("risk-fight training requires CUDA; torch.cuda.is_available() is false")
    device = torch.device(raw)
    try:
        probe = torch.randn((64, 64), device=device)
        result = probe @ probe
        torch.cuda.synchronize(device)
    except Exception as exc:  # pragma: no cover - hardware dependent
        raise SystemExit(f"risk-fight CUDA allocation/kernel probe failed: {exc}") from exc
    if result.device.type != "cuda":
        raise SystemExit(f"CUDA probe escaped to {result.device}")
    return device


def assert_cuda_tensor(tensor: torch.Tensor, label: str) -> None:
    if tensor.device.type != "cuda":
        raise RuntimeError(f"{label} left CUDA: {tensor.device}")


def assert_optimizer_cuda(optimizer: torch.optim.Optimizer) -> None:
    for state in optimizer.state.values():
        for key, value in state.items():
            if isinstance(value, torch.Tensor):
                # PyTorch AdamW intentionally keeps its scalar step counter on
                # CPU in some builds.  Learned moment buffers must stay CUDA.
                if key == "step" and value.numel() == 1:
                    continue
                assert_cuda_tensor(value, "optimizer state")


def optimizer_tensor_devices(optimizer: torch.optim.Optimizer) -> dict[str, list[str]]:
    devices: dict[str, set[str]] = defaultdict(set)
    for state in optimizer.state.values():
        for key, value in state.items():
            if isinstance(value, torch.Tensor):
                devices[key].add(str(value.device))
    return {key: sorted(values) for key, values in sorted(devices.items())}


def nvidia_driver_version() -> str | None:
    try:
        return subprocess.run(
            ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
            check=True, capture_output=True, text=True, timeout=10,
        ).stdout.strip().splitlines()[0]
    except (OSError, subprocess.SubprocessError, IndexError):
        return None


def model_digest(model: nn.Module) -> str:
    digest = hashlib.sha256()
    with torch.no_grad():
        for parameter in model.parameters():
            digest.update(parameter.detach().cpu().contiguous().numpy().tobytes())
    return digest.hexdigest()


def oracle_actions(fight: RiskFight, side: int, exploration: float = 0.04) -> FightActions:
    actor = fight.fighters[side]
    opponent = fight.fighters[1 - side]
    observation = fight.observe(side)
    incoming_next = observation[FEATURE_NAMES.index("incoming_next_tick")] * 115.0
    legal = fight.legal_main_mask(side)

    if opponent.weapon == "webweaver":
        prayer = PrayerAction.PROTECT_RANGED
    else:
        prayer = PrayerAction.PROTECT_MELEE

    if opponent.hp <= 52 and fight.distance > 1:
        movement = MovementAction.STEP_CLOSER
    elif actor.hp <= 28 and fight.distance < 7:
        movement = MovementAction.STEP_AWAY
    else:
        movement = MovementAction.HOLD

    priorities: list[MainAction] = []
    if actor.ranged < 110:
        priorities.append(MainAction.SIP_SUPER_RANGING)
    if actor.attack < 110 or actor.strength < 110:
        priorities.append(MainAction.SIP_SUPER_COMBAT)
    if actor.hp <= 30:
        priorities.extend((MainAction.EAT_MARLIN_HALIBUT, MainAction.EAT_PIE_HALIBUT, MainAction.EAT_MARLIN, MainAction.SIP_BREW))
    elif actor.hp <= 50:
        priorities.extend((MainAction.EAT_MARLIN, MainAction.EAT_SUMMER_PIE, MainAction.SIP_BREW))
    if incoming_next >= 18:
        priorities.append(MainAction.CAST_VENGEANCE)
    if fight.distance == 1 and opponent.hp <= 50:
        priorities.extend((MainAction.EQUIP_ULTOR, MainAction.GMAUL_SPEC, MainAction.ELDER_ATTACK))
    if fight.distance == 1 and opponent.hp <= 66:
        priorities.extend((MainAction.EQUIP_ULTOR, MainAction.ELDER_ATTACK, MainAction.GMAUL_SPEC))
    if opponent.hp <= 48 or actor.special_energy == 100:
        priorities.append(MainAction.WEBWEAVER_SPEC)
    priorities.extend((MainAction.WEBWEAVER_ATTACK, MainAction.CAST_VENGEANCE, MainAction.WAIT))

    main = next((choice for choice in priorities if legal[int(choice)]), MainAction.WAIT)
    if fight.rng.random() < exploration:
        legal_indices = np.flatnonzero(legal)
        main = MainAction(int(fight.rng.choice(legal_indices)))
        prayer = PrayerAction(int(fight.rng.integers(0, PRAYER_ACTION_COUNT)))
        movement = MovementAction(int(fight.rng.integers(0, MOVEMENT_ACTION_COUNT)))
    return FightActions(main, prayer, movement)


def collect_oracle_rows(fights: int, seed: int, max_ticks: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    observations: list[np.ndarray] = []
    masks: list[np.ndarray] = []
    mains: list[int] = []
    prayers: list[int] = []
    movements: list[int] = []
    for episode in range(fights):
        fight = RiskFight(seed + episode, max_ticks=max_ticks)
        while not fight.done:
            pair = [oracle_actions(fight, side) for side in range(2)]
            for side in range(2):
                observations.append(fight.observe(side))
                masks.append(fight.legal_main_mask(side))
                mains.append(int(pair[side].main))
                prayers.append(int(pair[side].prayer))
                movements.append(int(pair[side].movement))
            fight.step(pair)
    return (
        np.stack(observations), np.stack(masks), np.asarray(mains, dtype=np.int64),
        np.asarray(prayers, dtype=np.int64), np.asarray(movements, dtype=np.int64),
    )


def bootstrap_oracle(
    model: RiskPolicy,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    fights: int,
    epochs: int,
    seed: int,
    max_ticks: int,
) -> dict:
    observations, masks, mains, prayers, movements = collect_oracle_rows(fights, seed, max_ticks)
    generator = np.random.default_rng(seed + 90_001)
    batch_size = min(4096, len(observations))
    action_counts = np.bincount(mains, minlength=MAIN_ACTION_COUNT).astype(np.float64)
    main_weights = np.zeros(MAIN_ACTION_COUNT, dtype=np.float32)
    present = action_counts > 0
    main_weights[present] = action_counts[present].sum() / (present.sum() * action_counts[present])
    main_weights = np.clip(main_weights, 0.05, 20.0)
    main_weight_tensor = torch.as_tensor(main_weights, device=device)
    losses: list[float] = []
    for _ in range(epochs):
        for start in range(0, len(observations), batch_size):
            indices = generator.permutation(len(observations))[start : start + batch_size]
            obs = torch.as_tensor(observations[indices], device=device)
            legal = torch.as_tensor(masks[indices], device=device, dtype=torch.bool)
            main_target = torch.as_tensor(mains[indices], device=device)
            prayer_target = torch.as_tensor(prayers[indices], device=device)
            movement_target = torch.as_tensor(movements[indices], device=device)
            assert_cuda_tensor(obs, "oracle observation batch")
            main_logits, prayer_logits, movement_logits, _ = model(obs)
            assert_cuda_tensor(main_logits, "oracle main logits")
            main_logits = main_logits.masked_fill(~legal, -1.0e9)
            loss = (
                nn.functional.cross_entropy(main_logits, main_target, weight=main_weight_tensor)
                + 0.35 * nn.functional.cross_entropy(prayer_logits, prayer_target)
                + 0.25 * nn.functional.cross_entropy(movement_logits, movement_target)
            )
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 2.0)
            optimizer.step()
            losses.append(float(loss.detach().cpu()))
    return {
        "rows": int(len(observations)),
        "fights": fights,
        "epochs": epochs,
        "loss_first": losses[0],
        "loss_final": losses[-1],
        "loss_min": min(losses),
        "main_action_counts": {
            MainAction(index).name: int(count) for index, count in enumerate(action_counts) if count > 0
        },
    }


@torch.no_grad()
def policy_actions(
    model: RiskPolicy,
    fights: Sequence[RiskFight],
    device: torch.device,
    deterministic: bool,
) -> tuple[list[list[FightActions]], dict[str, np.ndarray]]:
    observations: list[np.ndarray] = []
    masks: list[np.ndarray] = []
    active: list[bool] = []
    for fight in fights:
        for side in range(2):
            observations.append(fight.observe(side) if not fight.done else np.zeros(FEATURE_COUNT, dtype=np.float32))
            masks.append(fight.legal_main_mask(side))
            active.append(not fight.done)
    obs = torch.as_tensor(np.stack(observations), device=device)
    legal = torch.as_tensor(np.stack(masks), device=device, dtype=torch.bool)
    assert_cuda_tensor(obs, "policy observation batch")
    main_logits, prayer_logits, movement_logits, values = model(obs)
    assert_cuda_tensor(values, "policy values")
    main_logits = main_logits.masked_fill(~legal, -1.0e9)
    distributions = (Categorical(logits=main_logits), Categorical(logits=prayer_logits), Categorical(logits=movement_logits))
    if deterministic:
        selected = tuple(logits.argmax(dim=-1) for logits in (main_logits, prayer_logits, movement_logits))
    else:
        selected = tuple(distribution.sample() for distribution in distributions)
    old_log_probability = sum(distribution.log_prob(action) for distribution, action in zip(distributions, selected))
    pair_actions: list[list[FightActions]] = []
    for index, fight in enumerate(fights):
        sides: list[FightActions] = []
        for side in range(2):
            row = index * 2 + side
            if fight.done:
                sides.append(FightActions(MainAction.WAIT, PrayerAction.NONE, MovementAction.HOLD))
            else:
                sides.append(FightActions(
                    MainAction(int(selected[0][row].item())),
                    PrayerAction(int(selected[1][row].item())),
                    MovementAction(int(selected[2][row].item())),
                ))
        pair_actions.append(sides)
    packed = {
        "observation": np.stack(observations),
        "legal": np.stack(masks),
        "main": selected[0].cpu().numpy(),
        "prayer": selected[1].cpu().numpy(),
        "movement": selected[2].cpu().numpy(),
        "old_log_probability": old_log_probability.cpu().numpy(),
        "value": values.cpu().numpy(),
        "active": np.asarray(active, dtype=np.bool_),
    }
    return pair_actions, packed


def collect_selfplay(
    model: RiskPolicy,
    device: torch.device,
    fight_count: int,
    seed: int,
    max_ticks: int,
) -> tuple[dict[str, np.ndarray], list[dict]]:
    fights = [RiskFight(seed + index, max_ticks=max_ticks) for index in range(fight_count)]
    timeline: dict[str, list[np.ndarray]] = defaultdict(list)
    while not all(fight.done for fight in fights):
        actions, packed = policy_actions(model, fights, device, deterministic=False)
        rewards = np.zeros(fight_count * 2, dtype=np.float32)
        done = np.zeros(fight_count * 2, dtype=np.bool_)
        for index, fight in enumerate(fights):
            if fight.done:
                done[index * 2 : index * 2 + 2] = True
                continue
            step_rewards, terminal = fight.step(actions[index])
            rewards[index * 2 : index * 2 + 2] = step_rewards
            done[index * 2 : index * 2 + 2] = terminal
        for key, value in packed.items():
            timeline[key].append(value)
        timeline["reward"].append(rewards)
        timeline["done"].append(done)

    rollout = {key: np.stack(values) for key, values in timeline.items()}
    running = np.zeros(fight_count * 2, dtype=np.float32)
    returns = np.zeros_like(rollout["reward"])
    for tick in range(len(returns) - 1, -1, -1):
        # Gamma is intentionally 1.0.  The terminal-vs-shaping proof is an
        # undiscounted finite-horizon invariant; discounting a tick-360 KO
        # would silently destroy the promised dominance at early decisions.
        running = rollout["reward"][tick] + running * (~rollout["done"][tick])
        returns[tick] = running
    rollout["return"] = returns
    return rollout, [fight.result_dict() for fight in fights]


def ppo_update(
    model: RiskPolicy,
    optimizer: torch.optim.Optimizer,
    rollout: dict[str, np.ndarray],
    device: torch.device,
    epochs: int = 3,
    batch_size: int = 8192,
) -> dict:
    active = rollout["active"].reshape(-1)
    selected = np.flatnonzero(active)
    observation = rollout["observation"].reshape(-1, FEATURE_COUNT)[selected]
    legal = rollout["legal"].reshape(-1, MAIN_ACTION_COUNT)[selected]
    main_action = rollout["main"].reshape(-1)[selected]
    prayer_action = rollout["prayer"].reshape(-1)[selected]
    movement_action = rollout["movement"].reshape(-1)[selected]
    old_log_probability = rollout["old_log_probability"].reshape(-1)[selected]
    old_value = rollout["value"].reshape(-1)[selected]
    returns = rollout["return"].reshape(-1)[selected]
    # The policy objective uses the undiscounted per-agent return directly.
    # A learned state-dependent value baseline could invert the proven ordering
    # between a +68 minimum win and a +32 maximum non-KO trajectory.  The value
    # head still learns as an auxiliary critic, but cannot redefine utility.
    advantage = returns.copy()
    advantage = (advantage - advantage.mean()) / max(float(advantage.std()), 1.0e-6)
    generator = np.random.default_rng(88_007 + len(selected))
    losses: list[float] = []
    policy_losses: list[float] = []
    value_losses: list[float] = []
    entropy_values: list[float] = []
    for _ in range(epochs):
        order = generator.permutation(len(selected))
        for start in range(0, len(order), batch_size):
            indices = order[start : start + batch_size]
            obs = torch.as_tensor(observation[indices], device=device)
            mask = torch.as_tensor(legal[indices], device=device, dtype=torch.bool)
            main = torch.as_tensor(main_action[indices], device=device)
            prayer = torch.as_tensor(prayer_action[indices], device=device)
            movement = torch.as_tensor(movement_action[indices], device=device)
            old_lp = torch.as_tensor(old_log_probability[indices], device=device)
            target_return = torch.as_tensor(returns[indices], device=device)
            target_advantage = torch.as_tensor(advantage[indices], device=device)
            for tensor, label in (
                (obs, "PPO observations"), (old_lp, "PPO old log probability"),
                (target_return, "PPO returns"), (target_advantage, "PPO advantages"),
            ):
                assert_cuda_tensor(tensor, label)
            main_logits, prayer_logits, movement_logits, value = model(obs)
            for tensor, label in (
                (main_logits, "PPO main logits"), (prayer_logits, "PPO prayer logits"),
                (movement_logits, "PPO movement logits"), (value, "PPO values"),
            ):
                assert_cuda_tensor(tensor, label)
            main_logits = main_logits.masked_fill(~mask, -1.0e9)
            distributions = (
                Categorical(logits=main_logits),
                Categorical(logits=prayer_logits),
                Categorical(logits=movement_logits),
            )
            log_probability = (
                distributions[0].log_prob(main)
                + distributions[1].log_prob(prayer)
                + distributions[2].log_prob(movement)
            )
            ratio = torch.exp(log_probability - old_lp)
            clipped = torch.clamp(ratio, 0.8, 1.2)
            policy_loss = -torch.minimum(ratio * target_advantage, clipped * target_advantage).mean()
            value_loss = nn.functional.smooth_l1_loss(value, target_return)
            entropy = sum(distribution.entropy().mean() for distribution in distributions)
            loss = policy_loss + 0.40 * value_loss - 0.006 * entropy
            assert_cuda_tensor(loss, "PPO loss")
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            for parameter in model.parameters():
                assert_cuda_tensor(parameter, "policy parameter after PPO update")
            assert_optimizer_cuda(optimizer)
            losses.append(float(loss.detach().cpu()))
            policy_losses.append(float(policy_loss.detach().cpu()))
            value_losses.append(float(value_loss.detach().cpu()))
            entropy_values.append(float(entropy.detach().cpu()))
    return {
        "rows": int(len(selected)),
        "loss": float(np.mean(losses)),
        "policy_loss": float(np.mean(policy_losses)),
        "value_loss": float(np.mean(value_losses)),
        "entropy": float(np.mean(entropy_values)),
    }


def aggregate_results(results: Sequence[dict]) -> dict:
    outcomes = Counter(result["outcome"] for result in results)
    ko_sources = Counter(result["ko_source"] for result in results if result["ko_source"])
    winners = Counter(str(result["winner"]) for result in results if result["winner"] is not None)
    total = max(1, len(results))
    by_distance: dict[str, dict[str, int]] = defaultdict(lambda: {"fights": 0, "valid_kos": 0, "timeouts": 0})
    by_pid: dict[str, dict[str, int]] = defaultdict(lambda: {"fights": 0, "valid_kos": 0, "winner_is_initial_pid": 0})
    for result in results:
        distance_bucket = str(result["start_distance"])
        by_distance[distance_bucket]["fights"] += 1
        by_distance[distance_bucket]["valid_kos"] += int(result["outcome"] == "valid_ko")
        by_distance[distance_bucket]["timeouts"] += int(result["outcome"] == "timeout")
        pid_bucket = str(result["initial_pid"])
        by_pid[pid_bucket]["fights"] += 1
        by_pid[pid_bucket]["valid_kos"] += int(result["outcome"] == "valid_ko")
        by_pid[pid_bucket]["winner_is_initial_pid"] += int(result["winner"] == result["initial_pid"])
    flat = lambda key: [value for result in results for value in result[key]]
    attacks = flat("legal_attacks")
    illegal = flat("illegal_attempts")
    veng_casts = flat("vengeance_casts")
    veng_damage = flat("vengeance_reflect_damage")
    food = flat("food_eaten")
    prayer = flat("prayer_remaining")
    ultor_ticks = flat("ultor_ticks")
    route_failures = flat("route_failures")
    shaping = flat("shaping")
    terminal = flat("terminal")
    return {
        "fights": len(results),
        "outcomes": dict(outcomes),
        "valid_ko_rate": outcomes["valid_ko"] / total,
        "timeout_rate": outcomes["timeout"] / total,
        "simultaneous_ko_rate": outcomes["simultaneous_ko"] / total,
        "ko_sources": dict(ko_sources),
        "winner_sides": dict(winners),
        "mean_ticks": float(np.mean([result["ticks"] for result in results])),
        "mean_legal_attacks_per_agent": float(np.mean(attacks)),
        "illegal_attempts": int(sum(illegal)),
        "mean_vengeance_casts_per_agent": float(np.mean(veng_casts)),
        "max_vengeance_casts_per_agent": int(max(veng_casts)),
        "vengeance_reflect_damage": int(sum(veng_damage)),
        "mean_food_eaten_per_agent": float(np.mean(food)),
        "mean_prayer_remaining": float(np.mean(prayer)),
        "movement_distance_changed_rate": float(np.mean([result["distance_final"] != result["start_distance"] for result in results])),
        "ultor_exposure_rate": float(np.mean([ticks > 0 for ticks in ultor_ticks])),
        "mean_ultor_ticks_per_agent": float(np.mean(ultor_ticks)),
        "route_failures": int(sum(route_failures)),
        "shaping_min": float(min(shaping)),
        "shaping_max": float(max(shaping)),
        "terminal_values": sorted(set(terminal)),
        "terminal_emissions_exactly_two": all(result["terminal_emissions"] == 2 for result in results),
        "winner_side_imbalance": abs(winners["0"] - winners["1"]) / max(1, outcomes["valid_ko"]),
        "by_start_distance": dict(by_distance),
        "by_initial_pid": dict(by_pid),
    }


@torch.no_grad()
def evaluate_policy(
    model: RiskPolicy,
    device: torch.device,
    seeds: Sequence[int],
    distances: Sequence[int],
    max_ticks: int,
    deterministic: bool = True,
) -> tuple[dict, list[dict]]:
    fights = [
        RiskFight(seed, start_distance=distance, initial_pid=pid, max_ticks=max_ticks)
        for seed in seeds for distance in distances for pid in (0, 1)
    ]
    while not all(fight.done for fight in fights):
        actions, _ = policy_actions(model, fights, device, deterministic=deterministic)
        for fight, pair in zip(fights, actions):
            if not fight.done:
                fight.step(pair)
    results = [fight.result_dict() for fight in fights]
    return aggregate_results(results), results


def save_candidate(
    path: Path,
    model: RiskPolicy,
    optimizer: torch.optim.Optimizer,
    report: dict,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "kind": "webweaver-riskfight-candidate",
        "schema_version": SCHEMA_VERSION,
        "feature_names": FEATURE_NAMES,
        "main_actions": [action.name for action in MainAction],
        "prayer_actions": [action.name for action in PrayerAction],
        "movement_actions": [action.name for action in MovementAction],
        "model_state": model.state_dict(),
        "optimizer_state": optimizer.state_dict(),
        "report": report,
        "promoted": False,
    }, path)


def selection_score(metrics: dict) -> float:
    return (
        float(metrics["valid_ko_rate"])
        - float(metrics["timeout_rate"])
        - float(metrics["simultaneous_ko_rate"])
        + 0.05 * min(1.0, float(metrics["mean_food_eaten_per_agent"]) / 3.0)
        + 0.03 * float(metrics["movement_distance_changed_rate"])
        + 0.02 * float(metrics["ultor_exposure_rate"])
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="CUDA-only Webweaver risk-fight self-play candidate trainer")
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--seed", type=int, default=73_001)
    parser.add_argument("--oracle-fights", type=int, default=160)
    parser.add_argument("--oracle-epochs", type=int, default=12)
    parser.add_argument("--selfplay-fights", type=int, default=192)
    parser.add_argument("--selfplay-updates", type=int, default=4)
    parser.add_argument("--eval-seeds", type=int, default=48)
    parser.add_argument("--max-ticks", type=int, default=MAX_TICKS)
    parser.add_argument("--output-dir", type=Path, default=Path("out/riskfight"))
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = require_cuda(args.device)
    torch.cuda.manual_seed_all(args.seed)
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.cuda.reset_peak_memory_stats(device)
    reward_invariant = validate_reward_invariant()
    if not all((
        reward_invariant["win_strictly_dominates_non_ko"],
        reward_invariant["death_strictly_worse_than_non_ko"],
        reward_invariant["terminal_gt_twice_budget"],
    )):
        raise SystemExit(f"reward invariant failed: {reward_invariant}")

    model = RiskPolicy().to(device)
    if any(parameter.device.type != "cuda" for parameter in model.parameters()) or any(
        buffer.device.type != "cuda" for buffer in model.buffers()
    ):
        raise SystemExit("one or more risk policy parameters are not on CUDA")
    optimizer = torch.optim.AdamW(model.parameters(), lr=3.0e-4, weight_decay=1.0e-4)
    digest_before = model_digest(model)
    started = time.perf_counter()
    print(json.dumps({
        "event": "cuda_preflight",
        "python": sys.version.split()[0],
        "torch": torch.__version__,
        "torch_cuda": torch.version.cuda,
        "device": str(device),
        "device_name": torch.cuda.get_device_name(device),
        "driver": nvidia_driver_version(),
        "capability": list(torch.cuda.get_device_capability(device)),
        "total_memory_mib": round(torch.cuda.get_device_properties(device).total_memory / (1024 ** 2), 2),
        "parameter_device": str(next(model.parameters()).device),
        "logical_tick_ms": 600,
        "wall_clock_tick_ms": "not used by isolated simulator",
    }, sort_keys=True), flush=True)

    # Baseline uses stochastic sampling; deterministic random heads commonly
    # lock into a single WAIT/potion action and are not a meaningful baseline.
    baseline, _ = evaluate_policy(
        model, device, range(args.seed + 20_000, args.seed + 20_000 + max(8, args.eval_seeds // 4)),
        (1, 9), args.max_ticks, deterministic=False,
    )
    bootstrap = bootstrap_oracle(
        model, optimizer, device, args.oracle_fights, args.oracle_epochs,
        args.seed + 1_000, args.max_ticks,
    )
    validation_seeds = list(range(args.seed + 700_000, args.seed + 700_016))
    bootstrap_validation, _ = evaluate_policy(
        model, device, validation_seeds, (1, 9), args.max_ticks,
    )
    best_score = selection_score(bootstrap_validation)
    best_stage = "oracle_bootstrap"
    best_state = {name: tensor.detach().clone() for name, tensor in model.state_dict().items()}
    best_optimizer_state = copy.deepcopy(optimizer.state_dict())
    selection_history: list[dict] = [{
        "stage": best_stage,
        "score": best_score,
        "valid_ko_rate": bootstrap_validation["valid_ko_rate"],
        "timeout_rate": bootstrap_validation["timeout_rate"],
        "simultaneous_ko_rate": bootstrap_validation["simultaneous_ko_rate"],
    }]
    updates: list[dict] = []
    for update in range(args.selfplay_updates):
        rollout, results = collect_selfplay(
            model, device, args.selfplay_fights,
            args.seed + 100_000 + update * args.selfplay_fights,
            args.max_ticks,
        )
        update_metrics = ppo_update(model, optimizer, rollout, device)
        update_metrics["update"] = update + 1
        update_metrics["selfplay"] = aggregate_results(results)
        validation, _ = evaluate_policy(model, device, validation_seeds, (1, 9), args.max_ticks)
        score = selection_score(validation)
        selection_history.append({
            "stage": f"selfplay_update_{update + 1}",
            "score": score,
            "valid_ko_rate": validation["valid_ko_rate"],
            "timeout_rate": validation["timeout_rate"],
            "simultaneous_ko_rate": validation["simultaneous_ko_rate"],
        })
        if score > best_score:
            best_score = score
            best_stage = f"selfplay_update_{update + 1}"
            best_state = {name: tensor.detach().clone() for name, tensor in model.state_dict().items()}
            best_optimizer_state = copy.deepcopy(optimizer.state_dict())
        updates.append(update_metrics)
        print(json.dumps({
            "event": "cuda_selfplay_update",
            "update": update + 1,
            "rows": update_metrics["rows"],
            "valid_ko_rate": update_metrics["selfplay"]["valid_ko_rate"],
            "timeout_rate": update_metrics["selfplay"]["timeout_rate"],
            "allocated_mib": round(torch.cuda.memory_allocated(device) / (1024 ** 2), 2),
            "parameter_device": str(next(model.parameters()).device),
        }, sort_keys=True), flush=True)

    model.load_state_dict(best_state)
    optimizer.load_state_dict(best_optimizer_state)
    assert_optimizer_cuda(optimizer)
    torch.cuda.synchronize(device)
    digest_after = model_digest(model)
    if digest_after == digest_before:
        raise SystemExit("CUDA training completed without changing model parameters")

    heldout_seed_start = args.seed + 900_000
    heldout_seeds = list(range(heldout_seed_start, heldout_seed_start + args.eval_seeds))
    heldout, heldout_fights = evaluate_policy(model, device, heldout_seeds, (1, 5, 9), args.max_ticks)
    promotion_gate = {
        "reward_invariant": all((
            reward_invariant["win_strictly_dominates_non_ko"],
            reward_invariant["death_strictly_worse_than_non_ko"],
            reward_invariant["terminal_gt_twice_budget"],
        )),
        "valid_ko_rate_at_least_0_70": heldout["valid_ko_rate"] >= 0.70,
        "timeout_rate_at_most_0_20": heldout["timeout_rate"] <= 0.20,
        "simultaneous_ko_rate_at_most_0_15": heldout["simultaneous_ko_rate"] <= 0.15,
        "no_illegal_actions": heldout["illegal_attempts"] == 0,
        "one_shot_terminal": heldout["terminal_emissions_exactly_two"],
        "attack_volume_present": heldout["mean_legal_attacks_per_agent"] >= 5.0,
        "supplies_used": heldout["mean_food_eaten_per_agent"] >= 1.0,
        "regular_vengeance_used_not_spammed": (
            heldout["mean_vengeance_casts_per_agent"] >= 0.10
            and heldout["max_vengeance_casts_per_agent"] <= args.max_ticks // 50 + 1
        ),
        "prayer_used": heldout["mean_prayer_remaining"] < 99.0,
        "movement_exercised": heldout["movement_distance_changed_rate"] >= 0.10,
        "ultor_recoil_choice_exercised": heldout["ultor_exposure_rate"] >= 0.05,
        "winner_role_imbalance_at_most_0_20": heldout["winner_side_imbalance"] <= 0.20,
        "each_distance_valid_ko_rate_at_least_0_50": all(
            bucket["valid_kos"] / max(1, bucket["fights"]) >= 0.50
            for bucket in heldout["by_start_distance"].values()
        ),
        "each_distance_timeout_rate_at_most_0_25": all(
            bucket["timeouts"] / max(1, bucket["fights"]) <= 0.25
            for bucket in heldout["by_start_distance"].values()
        ),
        "each_pid_valid_ko_rate_at_least_0_50": all(
            bucket["valid_kos"] / max(1, bucket["fights"]) >= 0.50
            for bucket in heldout["by_initial_pid"].values()
        ),
        "ko_source_not_single_channel": (
            len(heldout["ko_sources"]) >= 2
            and max(heldout["ko_sources"].values(), default=0)
                / max(1, sum(heldout["ko_sources"].values())) <= 0.90
        ),
        "vengeance_had_causal_effect": heldout["vengeance_reflect_damage"] > 0,
        "recoil_had_causal_ko": heldout["ko_sources"].get("recoil", 0) > 0,
        "no_invalid_deaths": heldout["outcomes"].get("invalid_death", 0) == 0,
        "shaping_bounds_observed": (
            heldout["shaping_min"] >= -SHAPING_BUDGET
            and heldout["shaping_max"] <= SHAPING_BUDGET
        ),
        "both_pid_roles": set(heldout["by_initial_pid"]) == {"0", "1"},
        "near_mid_far": set(heldout["by_start_distance"]) == {"1", "5", "9"},
        # This isolated evaluator is necessary but not sufficient: Java matched
        # fights and a browser action-schema adapter remain hard requirements.
        "java_matched_fight_parity": False,
        "browser_schema_integration": False,
    }
    promotion_gate["passed"] = all(promotion_gate.values())

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = args.output_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    checkpoint_path = run_dir / "webweaver-riskfight-candidate.pt"
    report_path = run_dir / "report.json"
    fights_path = run_dir / "heldout-fights.jsonl"
    elapsed = time.perf_counter() - started
    report = {
        "kind": "webweaver-riskfight-candidate-report",
        "schema_version": SCHEMA_VERSION,
        "run_id": run_id,
        "promoted": False,
        "source_anchors": SOURCE_ANCHORS,
        "assumptions": list(ASSUMPTIONS),
        "reward_invariant": reward_invariant,
        "cuda": {
            "required": True,
            "device": str(device),
            "device_name": torch.cuda.get_device_name(device),
            "torch": torch.__version__,
            "torch_cuda": torch.version.cuda,
            "driver": nvidia_driver_version(),
            "capability": list(torch.cuda.get_device_capability(device)),
            "total_memory_mib": torch.cuda.get_device_properties(device).total_memory / (1024 ** 2),
            "parameter_device": str(next(model.parameters()).device),
            "parameter_devices": sorted({str(parameter.device) for parameter in model.parameters()}),
            "buffer_devices": sorted({str(buffer.device) for buffer in model.buffers()}),
            "optimizer_tensor_devices": optimizer_tensor_devices(optimizer),
            "allocated_mib": torch.cuda.memory_allocated(device) / (1024 ** 2),
            "reserved_mib": torch.cuda.memory_reserved(device) / (1024 ** 2),
            "peak_allocated_mib": torch.cuda.max_memory_allocated(device) / (1024 ** 2),
            "peak_reserved_mib": torch.cuda.max_memory_reserved(device) / (1024 ** 2),
            "parameter_digest_before": digest_before,
            "parameter_digest_after": digest_after,
            "parameters_changed": digest_before != digest_after,
        },
        "arguments": vars(args) | {"output_dir": str(args.output_dir)},
        "bootstrap": bootstrap,
        "selfplay_updates": updates,
        "candidate_selection": {
            "validation_seeds": validation_seeds,
            "distances": [1, 9],
            "best_stage": best_stage,
            "best_score": best_score,
            "history": selection_history,
        },
        "baseline": baseline,
        "heldout": heldout,
        "heldout_protocol": {
            "seed_start": heldout_seed_start,
            "seed_count": args.eval_seeds,
            "distances": [1, 5, 9],
            "pid_roles": [0, 1],
            "policy": "deterministic shared candidate self-play",
        },
        "promotion_gate": promotion_gate,
        "elapsed_seconds": elapsed,
    }
    save_candidate(checkpoint_path, model, optimizer, report)
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    fights_path.write_text("".join(json.dumps(row, sort_keys=True) + "\n" for row in heldout_fights), encoding="utf-8")
    print(json.dumps({
        "event": "riskfight_training_complete",
        "checkpoint": str(checkpoint_path.resolve()),
        "report": str(report_path.resolve()),
        "heldout_fights": str(fights_path.resolve()),
        "promoted": False,
        "promotion_gate_passed": promotion_gate["passed"],
        "valid_ko_rate": heldout["valid_ko_rate"],
        "timeout_rate": heldout["timeout_rate"],
        "parameters_changed": digest_before != digest_after,
        "elapsed_seconds": round(elapsed, 3),
    }, indent=2, sort_keys=True), flush=True)


if __name__ == "__main__":
    main()
