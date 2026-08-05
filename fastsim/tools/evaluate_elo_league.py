#!/usr/bin/env python3
"""Run every compatible checkpoint and scripted opponent in a paired Elo league.

Each unordered pair plays one complete fight.  Player-slot assignment is
balanced across the circle-method schedule.  The simulator runs many complete
round-robin rounds in one vectorized batch, while Elo updates are applied
afterward in ordinary round order from each round's starting ratings.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import sys
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, fields
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from fastsim import engine, replay, schema, state  # noqa: E402
from fastsim.policy import Policy  # noqa: E402
from fastsim.scripted_policy import SCRIPT_NAMES, ScriptedPolicy  # noqa: E402
from evaluate_paired import _RoutedPolicy  # noqa: E402


START_RATING = 1500.0
K_FACTOR = 32.0
ELO_SCALE = 400.0
COMPATIBLE_INPUT_SIZES = (110, 111, 112)
STYLE_NAMES = ("magic", "ranged", "melee")
DEFAULT_STALL_TICKS = 120
DEFAULT_SAFETY_MAX_TICKS = 2400


@dataclass
class Entrant:
    index: int
    label: str
    kind: str
    source: str
    policy: object | None = None
    script: str | None = None
    sha256: str | None = None
    input_size: int | None = None
    prayer_head_version: int | None = None

    def fresh_policy(self, side: int, batch_seed: int):
        if self.kind == "checkpoint":
            return self.policy
        return ScriptedPolicy(
            self.script,
            defence="seeded-human-prayer-mix",
            seed=batch_seed + self.index * 1009 + side * 104729,
            use_vengeance=True,
        )


@dataclass(frozen=True)
class MatchPlan:
    round_index: int
    entrant_a: int
    entrant_b: int


class LeagueEngine(engine.Engine):
    """Engine with compact fight-result diagnostics and paired replay draws."""

    def __init__(
            self,
            *args,
            paired_lanes,
            lane_replay_seeds,
            lane_replay_bot_indices,
            stall_ticks=DEFAULT_STALL_TICKS,
            progress_interval=0,
            progress_label="",
            **kwargs):
        super().__init__(*args, **kwargs)
        self._lane_replay_seeds = np.asarray(
            lane_replay_seeds, dtype=np.int64)
        self._lane_replay_bot_indices = np.asarray(
            lane_replay_bot_indices, dtype=np.int64)
        if self._lane_replay_seeds.shape != (self.n_fights,):
            raise ValueError("lane replay seeds must have one entry per fight")
        if self._lane_replay_bot_indices.shape != (self.n_fights, 2):
            raise ValueError(
                "lane replay bot indices must have shape [fights, 2]")

        # Both role-swapped fights receive the exact same physical starting
        # state.  Only which policy occupies player slot zero/one changes.
        for first_lane, second_lane in paired_lanes:
            for definition in fields(state.BatchState):
                value = getattr(self.state, definition.name)
                if (
                        isinstance(value, np.ndarray)
                        and value.shape[:1] == (self.n_fights,)):
                    value[second_lane] = value[first_lane]
        self.state.bot_index[:] = self._lane_replay_bot_indices

        self.stall_ticks = int(stall_ticks)
        self.progress_interval = int(progress_interval)
        self.progress_label = str(progress_label)
        self._last_damage_tick = np.zeros(self.n_fights, dtype=np.int64)
        self._last_damage_total = self.state.damage_dealt.sum(axis=1).copy()
        self.finish_tick = np.full(self.n_fights, -1, dtype=np.int64)
        self.outcome_reason = np.full(
            self.n_fights, "", dtype="<U24")

        self.expected_damage_dealt = np.zeros(
            (self.n_fights, 2), dtype=np.float64)
        self.incoming_attack_rolls = np.zeros(
            (self.n_fights, 2), dtype=np.int64)
        self.correct_prayer_rolls = np.zeros(
            (self.n_fights, 2), dtype=np.int64)
        self.outgoing_style_rolls = np.zeros(
            (self.n_fights, 2, 3), dtype=np.int64)
        self.original_lane_indices = np.arange(
            self.n_fights, dtype=np.intp)

    def _replay_units(self, draw_kind):
        # Exact vector form of replay.keyed_u64.  The scalar helper is ideal
        # for Java parity probes but a Python call per fighter dominates a
        # many-thousand-lane evaluation.
        with np.errstate(over="ignore"):
            value = (
                self._lane_replay_seeds[:, None].astype(np.uint64)
                + np.uint64(replay.TICK_MIX)
                * np.uint64(self.world_tick + 1)
                + np.uint64(replay.SIDE_MIX)
                * (self._lane_replay_bot_indices.astype(np.uint64) + 1)
                + np.uint64(replay.ORDINAL_MIX)
                * (self._replay_hit_ordinals.astype(np.uint64) + 1)
                + np.uint64(replay.KIND_MIX)
                * np.uint64(int(draw_kind) + 1)
            )
            value = (
                (value ^ (value >> np.uint64(30)))
                * np.uint64(0xBF58476D1CE4E5B9))
            value = (
                (value ^ (value >> np.uint64(27)))
                * np.uint64(0x94D049BB133111EB))
            value ^= value >> np.uint64(31)
        return (value >> np.uint64(11)).astype(np.float64) * (
            1.0 / (1 << 53))

    def _book_vengeance_opportunity(self, fired, expected_damage):
        fired = np.asarray(fired, dtype=bool)
        expected = np.asarray(expected_damage, dtype=np.float64)
        self.expected_damage_dealt += np.where(fired, expected, 0.0)

    def _book_roll_prayer(self, fired, hit_style, spec_kind=None):
        fired = np.asarray(fired, dtype=bool)
        hit_style = np.asarray(hit_style)
        protected = self._protected_at_roll(hit_style, fired)
        self.incoming_attack_rolls += self.state.flip(
            fired).astype(np.int64)
        self.correct_prayer_rolls += self.state.flip(
            protected).astype(np.int64)
        for style_index in range(3):
            self.outgoing_style_rolls[:, :, style_index] += (
                fired & (hit_style == style_index)).astype(np.int64)

        # Preserve the exact numeric reward fields consumed by the next model
        # observation, but omit teacher labels and per-source NHEV provenance.
        pending = self._pending
        if pending is None:
            return
        target = self.state.flip(fired)
        flat_target = self._flat(target)
        flat_target &= ~pending.done
        flat_target &= pending.episode_id == self._flat(
            self.state.episode_id)
        defender_reward = self._flat(self.state.flip(np.where(
            fired,
            np.where(
                protected,
                engine.REWARD_ROLL_PRAYER_CORRECT,
                engine.REWARD_ROLL_PRAYER_INCORRECT),
            0.0)))
        self._flat(self.state.pending_roll_prayer_reward)[flat_target] += (
            defender_reward[flat_target])

    def _append_reward_event(self, *args, **kwargs):
        """Elo needs live reward observations, not exported provenance."""

    def _emit_rolling_reward_events(self, current_dps, current_dtps):
        """The caller already computes identical numeric DPS/DTPS fields."""

    def _book_offensive_style_teacher(self, fired):
        """Offline teacher labels are not part of policy inference."""

    def _book_roll_offensive_gear_teacher(self, fired):
        """Offline teacher labels are not part of policy inference."""

    def _offensive_gear_influence_mask(
            self, roll_style, active, *, spell_magic=False,
            ignore_defence=False):
        # These masks route training credit only.  Expected-damage magnitude
        # and all combat mechanics are independent of them.
        return np.zeros((self.n_fights, 2), dtype=np.int32)

    def _book_landed_expected_damage(
            self,
            expected,
            source_ticks,
            prayer_ticks,
            tank_ticks,
            defensive_gear_masks,
            offensive_gear_masks,
            vengeance_reflection,
            hit_count):
        """Vectorized numeric equivalent without per-hit credit objects."""
        expected = np.asarray(expected, dtype=np.float64)
        source_ticks = np.asarray(source_ticks)
        prayer_ticks = np.asarray(prayer_ticks)
        tank_ticks = np.asarray(tank_ticks)
        defensive_gear_masks = np.asarray(defensive_gear_masks)
        vengeance_reflection = np.asarray(
            vengeance_reflection, dtype=bool)
        hit_count = np.asarray(hit_count, dtype=np.int64)
        hit_slots = np.arange(expected.shape[2], dtype=np.int64)
        within_count = hit_slots[None, None, :] < hit_count[:, :, None]
        valid = (
            within_count
            & (expected > 0.0)
            & (source_ticks >= 0)
            & ~vengeance_reflection)
        dealt = np.where(valid, expected, 0.0).sum(axis=2)
        self.state.pending_expected_reward += self.state.flip(dealt)

        # Incoming credit exists only when a current defender decision owns
        # either the prayer or a tank-gear contribution.
        taken_valid = (
            valid
            & (tank_ticks >= 0)
            & ((prayer_ticks >= 0) | (defensive_gear_masks != 0)))
        taken = np.where(taken_valid, expected, 0.0).sum(axis=2)
        self.state.pending_expected_reward -= taken

    def _book_roll_tank_gear(self, fired, hit_style):
        """Vectorized numeric tank reward without teacher/event objects."""
        fired = np.asarray(fired, dtype=bool)
        context = self._current_roll_context
        defensive_masks = np.zeros(
            (self.n_fights, 2), dtype=np.int32)
        if not fired.any() or context is None:
            return defensive_masks

        s = self.state
        target_rows = np.flatnonzero(s.flip(fired).reshape(-1))
        attack_rows = target_rows ^ 1
        flat_equipped = self._flat(s.equipped_ids)
        flat_free_slots = self._flat(s.inventory_free_slots)
        flat_styles = self._flat(np.asarray(hit_style, dtype=np.int32))
        keys = np.column_stack((
            flat_equipped[target_rows],
            flat_styles[attack_rows],
            flat_free_slots[target_rows],
        ))
        unique_keys, inverse = np.unique(keys, axis=0, return_inverse=True)
        unique_results = [
            self._roll_tank_raw_reward(
                key[:flat_equipped.shape[1]],
                int(key[-2]),
                int(key[-1]))
            for key in unique_keys
        ]
        raw_unique = np.asarray(
            [result[0] for result in unique_results], dtype=np.float64)
        expected_unique = np.asarray(
            [result[3] for result in unique_results], dtype=np.int32)
        teacher_unique = np.zeros(
            (len(unique_results), flat_equipped.shape[1]), dtype=bool)
        for index, result in enumerate(unique_results):
            if result[2]:
                teacher_unique[index, np.asarray(result[2], dtype=np.intp)] = True

        raw = raw_unique[inverse]
        expected_items = expected_unique[inverse]
        teacher_slots = teacher_unique[inverse]
        current_items = np.maximum(flat_equipped[target_rows], 0)
        stable = np.zeros(flat_equipped.shape[1], dtype=bool)
        stable[np.asarray(tuple(engine.STABLE_TANK_RELEVANT_SLOTS))] = True
        relevant = teacher_slots | (
            stable[None, :]
            & (expected_items > 0)
            & (expected_items == current_items))

        slots = np.asarray([
            int(slot) for slot in engine.TANK_GEAR_SLOTS
            if int(slot) in engine.OPTIONAL_GEAR_UNIT_BY_SLOT
        ], dtype=np.intp)
        units = np.asarray([
            engine.OPTIONAL_GEAR_UNIT_BY_SLOT[int(slot)] for slot in slots
        ], dtype=np.intp)
        applicable = (
            context["eligible"][target_rows]
            | context["virtual_none"][target_rows]
            | (context["causal_actual"][target_rows] >= 0))
        applicable = applicable[:, units]
        reserved = context["reserved"][target_rows][:, units]
        matched = relevant[:, slots] & (
            expected_items[:, slots] == current_items[:, slots])
        missed = relevant[:, slots] & ~matched
        candidates = np.where(raw[:, None] > 0.0, matched, missed)
        has_recipient = np.any(
            candidates & (reserved | applicable), axis=1)
        flat_pending = self._flat(s.pending_roll_tank_gear_reward)
        flat_pending[target_rows] += np.where(has_recipient, raw, 0.0)

        influential = (
            relevant[:, slots] & ~reserved & applicable)
        slot_bits = (1 << slots).astype(np.int32)
        masks = np.bitwise_or.reduce(
            np.where(influential, slot_bits[None, :], 0), axis=1)
        defensive_masks.reshape(-1)[attack_rows] = masks
        return defensive_masks

    def effective_survivability(self):
        s = self.state
        return (
            np.maximum(s.hp, 0).astype(np.float64)
            + s.food_count * engine.FOOD_HEAL
            + s.brew_count * engine.BREW_HEAL
        )

    def _deterministic_winner(self, lanes):
        winners = np.empty(len(lanes), dtype=np.int8)
        for offset, lane in enumerate(lanes):
            bot_zero, bot_one = (
                int(value)
                for value in self._lane_replay_bot_indices[int(lane)])
            low, high = sorted((bot_zero, bot_one))
            key = (
                int(self._lane_replay_seeds[int(lane)])
                ^ (low * 0x9E3779B1)
                ^ (high * 0x85EBCA77)
            )
            chosen = low if key & 1 == 0 else high
            winners[offset] = 0 if bot_zero == chosen else 1
        return winners

    def _tiebreak_winners(self, lanes):
        lanes = np.asarray(lanes, dtype=np.intp)
        survivability = self.effective_survivability()[lanes]
        survival_gap = survivability[:, 0] - survivability[:, 1]
        damage_gap = (
            self.state.damage_dealt[lanes, 0]
            - self.state.damage_dealt[lanes, 1])
        expected_gap = (
            self.expected_damage_dealt[lanes, 0]
            - self.expected_damage_dealt[lanes, 1])
        winners = np.where(survival_gap > 0, 0, 1).astype(np.int8)
        tied = np.isclose(survival_gap, 0.0)
        winners = np.where(
            tied & (damage_gap > 0), 0,
            np.where(tied & (damage_gap < 0), 1, winners))
        tied &= damage_gap == 0
        winners = np.where(
            tied & (expected_gap > 0), 0,
            np.where(tied & (expected_gap < 0), 1, winners))
        tied &= np.isclose(expected_gap, 0.0)
        if tied.any():
            winners[tied] = self._deterministic_winner(lanes[tied])
        return winners

    def _award_unresolved(self, mask, reason):
        lanes = np.flatnonzero(mask)
        if not len(lanes):
            return
        winners = self._tiebreak_winners(lanes)
        self.state.winner[lanes] = winners
        self.state.alive[lanes] = False
        self.finish_tick[lanes] = self.world_tick
        self.outcome_reason[lanes] = reason
        self._side0_wins += int(np.count_nonzero(winners == 0))
        self._side1_wins += int(np.count_nonzero(winners == 1))

    def step(self):
        was_alive = self.state.alive.copy()
        completed = super().step()
        s = self.state
        damage_total = s.damage_dealt.sum(axis=1)
        dealt_damage = damage_total > self._last_damage_total
        self._last_damage_tick[dealt_damage] = self.world_tick
        self._last_damage_total = damage_total.copy()

        newly_finished = was_alive & ~s.alive
        ordinary_death = newly_finished & (s.winner >= 0)
        self.finish_tick[ordinary_death] = self.world_tick
        self.outcome_reason[ordinary_death] = "death"

        unresolved_finished = newly_finished & (s.winner < 0)
        if unresolved_finished.any():
            # Engine counted these as draws before this evaluator supplied its
            # mandatory no-draw tiebreak.
            self._draws -= int(np.count_nonzero(unresolved_finished))
            reason = (
                "safety-cap-tiebreak"
                if self.world_tick >= self.max_ticks
                else "simultaneous-death")
            self._award_unresolved(unresolved_finished, reason)

        stalled = (
            s.alive
            & ((self.world_tick - self._last_damage_tick) >= self.stall_ticks)
        )
        self._award_unresolved(stalled, "damage-stall-tiebreak")

        if (
                self.progress_interval > 0
                and self.world_tick % self.progress_interval == 0):
            print(
                f"    {self.progress_label}tick {self.world_tick}: "
                f"{int(np.count_nonzero(s.alive))}/{self.n_fights} "
                "fights still active",
                flush=True,
            )
        return completed

    @staticmethod
    def _slice_pending_value(value, flat_keep, old_rows):
        if (
                isinstance(value, np.ndarray)
                and value.shape[:1] == (old_rows,)):
            return value[flat_keep].copy()
        if isinstance(value, dict):
            return {
                key: LeagueEngine._slice_pending_value(
                    item, flat_keep, old_rows)
                for key, item in value.items()
            }
        return value

    def compact_active_lanes(self):
        """Drop finished lanes while preserving every active fight field."""
        keep = self.state.alive.copy()
        if keep.all() or not keep.any():
            return
        old_n = self.n_fights
        flat_keep = np.repeat(keep, 2)

        if self._pending is not None:
            for definition in fields(engine.TickRecord):
                name = definition.name
                value = getattr(self._pending, name)
                setattr(
                    self._pending,
                    name,
                    self._slice_pending_value(value, flat_keep, old_n * 2))

        for definition in fields(state.BatchState):
            name = definition.name
            if name == "n_fights":
                continue
            value = getattr(self.state, name)
            if (
                    isinstance(value, np.ndarray)
                    and value.shape[:1] == (old_n,)):
                setattr(self.state, name, value[keep].copy())

        self.policy.compact_lanes(keep, 0)
        self.opponent_policy.compact_lanes(keep, 1)
        checkpoint_instances = {}
        for routed in (self.policy, self.opponent_policy):
            for instance, _rows in routed.groups:
                if hasattr(instance, "_cuda_graphs"):
                    checkpoint_instances[id(instance)] = instance
        for instance in checkpoint_instances.values():
            instance._cuda_graphs.clear()
        if checkpoint_instances:
            torch.cuda.empty_cache()

        self._drain_counter = self._drain_counter[keep].copy()
        self._rolling_reward_contributor_cache = (
            self._rolling_reward_contributor_cache[keep].copy())
        self._replay_hit_ordinals = self._replay_hit_ordinals[keep].copy()
        self._lane_replay_seeds = self._lane_replay_seeds[keep].copy()
        self._lane_replay_bot_indices = (
            self._lane_replay_bot_indices[keep].copy())
        self.expected_damage_dealt = self.expected_damage_dealt[keep].copy()
        self.incoming_attack_rolls = self.incoming_attack_rolls[keep].copy()
        self.correct_prayer_rolls = self.correct_prayer_rolls[keep].copy()
        self.outgoing_style_rolls = self.outgoing_style_rolls[keep].copy()
        self._last_damage_tick = self._last_damage_tick[keep].copy()
        self._last_damage_total = self._last_damage_total[keep].copy()
        self.finish_tick = self.finish_tick[keep].copy()
        self.outcome_reason = self.outcome_reason[keep].copy()
        self.original_lane_indices = self.original_lane_indices[keep].copy()

        self.n_fights = int(np.count_nonzero(keep))
        self.state.n_fights = self.n_fights
        if self._defence_prayer_prior_state_history_enabled:
            rows = self.n_fights * 2
            self._defence_prayer_prior_state_history_ordered = np.empty(
                (
                    rows,
                    schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
                    schema.INPUT_SIZE,
                ),
                dtype=np.float32)
            self._defence_prayer_prior_state_history_valid = np.empty(
                (
                    rows,
                    schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
                ),
                dtype=bool)
            self._defence_prayer_prior_state_history_rows = np.arange(
                rows, dtype=np.intp)


class LeagueBatchResult:
    """Original-lane result arrays archived across active-lane compactions."""

    def __init__(self, n_fights):
        self.n_fights = int(n_fights)
        self.state = SimpleNamespace(
            winner=np.full(n_fights, -1, dtype=np.int8),
            damage_dealt=np.zeros((n_fights, 2), dtype=np.int32),
        )
        self.expected_damage_dealt = np.zeros(
            (n_fights, 2), dtype=np.float64)
        self.incoming_attack_rolls = np.zeros(
            (n_fights, 2), dtype=np.int64)
        self.correct_prayer_rolls = np.zeros(
            (n_fights, 2), dtype=np.int64)
        self.outgoing_style_rolls = np.zeros(
            (n_fights, 2, 3), dtype=np.int64)
        self.finish_tick = np.full(n_fights, -1, dtype=np.int64)
        self.outcome_reason = np.full(n_fights, "", dtype="<U24")
        self._survivability = np.zeros((n_fights, 2), dtype=np.float64)
        self._captured = np.zeros(n_fights, dtype=bool)

    def capture(self, runner: LeagueEngine, mask):
        mask = np.asarray(mask, dtype=bool)
        if not mask.any():
            return
        local = np.flatnonzero(mask)
        target = runner.original_lane_indices[local]
        fresh = ~self._captured[target]
        if not fresh.any():
            return
        local = local[fresh]
        target = target[fresh]
        self.state.winner[target] = runner.state.winner[local]
        self.state.damage_dealt[target] = runner.state.damage_dealt[local]
        self.expected_damage_dealt[target] = (
            runner.expected_damage_dealt[local])
        self.incoming_attack_rolls[target] = (
            runner.incoming_attack_rolls[local])
        self.correct_prayer_rolls[target] = (
            runner.correct_prayer_rolls[local])
        self.outgoing_style_rolls[target] = (
            runner.outgoing_style_rolls[local])
        self.finish_tick[target] = runner.finish_tick[local]
        self.outcome_reason[target] = runner.outcome_reason[local]
        self._survivability[target] = runner.effective_survivability()[local]
        self._captured[target] = True

    def effective_survivability(self):
        return self._survivability

    def summary(self):
        winners = self.state.winner
        return {
            "fights": self.n_fights,
            "side0_wins": int(np.count_nonzero(winners == 0)),
            "side1_wins": int(np.count_nonzero(winners == 1)),
            "draws": int(np.count_nonzero(winners < 0)),
        }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def discover_checkpoint_files(checkpoint_root: Path):
    files = sorted(checkpoint_root.rglob("*.pt"))
    by_hash: dict[str, list[Path]] = {}
    for path in files:
        by_hash.setdefault(sha256_file(path), []).append(path)
    canonical = [paths[0] for paths in by_hash.values()]
    canonical.sort()
    aliases = [
        {
            "sha256": digest,
            "canonical": str(paths[0]),
            "aliases": [str(path) for path in paths[1:]],
        }
        for digest, paths in sorted(by_hash.items())
        if len(paths) > 1
    ]
    digest_by_path = {
        paths[0]: digest for digest, paths in by_hash.items()
    }
    return files, canonical, aliases, digest_by_path


def _checkpoint_labels(paths: list[Path], checkpoint_root: Path):
    stems = Counter(path.stem for path in paths)
    labels = {}
    for path in paths:
        relative = path.relative_to(checkpoint_root).with_suffix("")
        labels[path] = (
            path.stem
            if stems[path.stem] == 1
            else relative.as_posix()
        )
    return labels


def load_entrants(checkpoint_root: Path, device: str):
    all_files, canonical, aliases, digest_by_path = (
        discover_checkpoint_files(checkpoint_root))
    labels = _checkpoint_labels(canonical, checkpoint_root)
    entrants: list[Entrant] = []
    rejected = []
    print(
        f"Discovered {len(all_files)} checkpoint files "
        f"({len(canonical)} unique); loading on {device}...",
        flush=True,
    )
    for ordinal, path in enumerate(canonical, start=1):
        try:
            loaded = Policy.load(
                path,
                device=device,
                compatible_input_sizes=COMPATIBLE_INPUT_SIZES,
            )
        except Exception as exc:
            rejected.append({"path": str(path), "reason": str(exc)})
            continue
        entrants.append(Entrant(
            index=len(entrants),
            label=labels[path],
            kind="checkpoint",
            source=str(path),
            policy=loaded,
            sha256=digest_by_path[path],
            input_size=int(loaded.input_size),
            prayer_head_version=int(
                getattr(loaded, "defence_prayer_head_version", 1)),
        ))
        if ordinal % 25 == 0 or ordinal == len(canonical):
            print(
                f"  examined {ordinal}/{len(canonical)}; "
                f"loaded {len(entrants)}, rejected {len(rejected)}",
                flush=True,
            )

    for script_name in SCRIPT_NAMES:
        entrants.append(Entrant(
            index=len(entrants),
            label=f"script:{script_name}",
            kind="script",
            source=script_name,
            script=script_name,
            prayer_head_version=1,
        ))
    return entrants, {
        "checkpointFilesFound": len(all_files),
        "uniqueCheckpointFiles": len(canonical),
        "loadedCheckpoints": sum(
            entrant.kind == "checkpoint" for entrant in entrants),
        "scriptedOpponents": len(SCRIPT_NAMES),
        "exactDuplicateAliases": aliases,
        "rejectedCheckpoints": rejected,
    }


def build_round_robin(count: int, seed: int) -> list[list[MatchPlan]]:
    """Circle-method schedule: every unordered pair once, one match per round."""
    if count < 2:
        raise ValueError("the league needs at least two entrants")
    order = list(np.random.default_rng(seed).permutation(count).astype(int))
    if len(order) % 2:
        order.append(None)
    rounds = []
    for round_index in range(len(order) - 1):
        matches = []
        for position in range(len(order) // 2):
            entrant_a = order[position]
            entrant_b = order[-1 - position]
            if entrant_a is None or entrant_b is None:
                continue
            forward = (int(entrant_b) - int(entrant_a)) % count
            if (
                    forward > count // 2
                    or (
                        count % 2 == 0
                        and forward == count // 2
                        and int(entrant_a) % 2 == 1)):
                entrant_a, entrant_b = entrant_b, entrant_a
            matches.append(MatchPlan(
                round_index=round_index,
                entrant_a=int(entrant_a),
                entrant_b=int(entrant_b),
            ))
        rounds.append(matches)
        order = [order[0], order[-1], *order[1:-1]]
    return rounds


def expected_score(rating_a: float, rating_b: float) -> float:
    return 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / ELO_SCALE))


def elo_delta(
        rating_a: float,
        rating_b: float,
        score_a: float,
        k_factor: float = K_FACTOR) -> float:
    return float(k_factor) * (
        float(score_a) - expected_score(rating_a, rating_b))


def apply_elo_rounds(
        match_results: list[dict],
        entrant_count: int,
        start_rating: float = START_RATING,
        k_factor: float = K_FACTOR) -> np.ndarray:
    ratings = np.full(entrant_count, float(start_rating), dtype=np.float64)
    by_round: dict[int, list[dict]] = {}
    for result in match_results:
        by_round.setdefault(int(result["round"]), []).append(result)
    for round_index in sorted(by_round):
        snapshot = ratings.copy()
        changes = np.zeros_like(ratings)
        for result in by_round[round_index]:
            entrant_a = int(result["entrantA"])
            entrant_b = int(result["entrantB"])
            delta = elo_delta(
                snapshot[entrant_a],
                snapshot[entrant_b],
                float(result["scoreA"]),
                k_factor,
            )
            changes[entrant_a] += delta
            changes[entrant_b] -= delta
            result["preMatchRatingA"] = float(snapshot[entrant_a])
            result["preMatchRatingB"] = float(snapshot[entrant_b])
            result["eloChangeA"] = float(delta)
        ratings += changes
    return ratings


def _fight_score(winner: int, entrant_side: int) -> float:
    if winner < 0:
        raise ValueError("the no-draw league received an unresolved fight")
    return 1.0 if winner == entrant_side else 0.0


def _build_batch_policies(
        entrants: list[Entrant],
        matches: list[MatchPlan],
        batch_seed: int,
        score_lock=None):
    side_rows = ({}, {})
    for match_index, match in enumerate(matches):
        side_rows[0].setdefault(match.entrant_a, []).append(2 * match_index)
        side_rows[1].setdefault(match.entrant_b, []).append(
            2 * match_index + 1)

    routed = []
    for side in range(2):
        assignments = []
        for entrant_index, rows in side_rows[side].items():
            instance = entrants[entrant_index].fresh_policy(side, batch_seed)
            assignments.append((instance, np.asarray(rows, dtype=np.intp)))
        routed.append(_RoutedPolicy(assignments, score_lock=score_lock))
    return routed[0], routed[1]


def simulate_batch(
        entrants: list[Entrant],
        matches: list[MatchPlan],
        *,
        seed: int,
        replay_seed: int,
        max_ticks: int,
        stall_ticks: int,
        world_id: int,
        score_lock=None,
        progress_label="",
        compact_interval=100):
    policy_zero, policy_one = _build_batch_policies(
        entrants, matches, seed, score_lock=score_lock)
    n_fights = len(matches)
    lane_replay_seeds = np.empty(n_fights, dtype=np.int64)
    lane_replay_bot_indices = np.empty((n_fights, 2), dtype=np.int64)
    for match_index, match in enumerate(matches):
        common_seed = (
            replay_seed
            + int(match.round_index) * 1000003
            + min(match.entrant_a, match.entrant_b) * 1009
            + max(match.entrant_a, match.entrant_b) * 9176
        )
        lane_replay_seeds[match_index] = common_seed
        lane_replay_bot_indices[match_index] = (
            match.entrant_a, match.entrant_b)

    runner = LeagueEngine(
        n_fights=n_fights,
        policy=policy_zero,
        opponent_policy=policy_one,
        paired_lanes=(),
        lane_replay_seeds=lane_replay_seeds,
        lane_replay_bot_indices=lane_replay_bot_indices,
        seed=seed,
        replay_seed=replay_seed,
        epsilon=0.0,
        max_ticks=max_ticks,
        start_distance_min=1,
        start_distance_max=8,
        world_id=world_id,
        lane_radius=3,
        episodes_per_lane=1,
        stall_ticks=stall_ticks,
        progress_interval=100,
        progress_label=progress_label,
    )
    archived = LeagueBatchResult(n_fights)
    while runner.has_work():
        runner.step()
        finished = ~runner.state.alive
        archived.capture(runner, finished)
        if (
                compact_interval > 0
                and runner.world_tick % compact_interval == 0
                and finished.any()
                and runner.state.alive.any()):
            runner.compact_active_lanes()
    runner.flush()
    archived.capture(
        runner, np.ones(runner.n_fights, dtype=bool))
    if np.any(archived.state.winner < 0):
        raise AssertionError("league batch ended with unresolved fights")
    if np.any(archived.finish_tick < 0):
        raise AssertionError("league batch ended without finish ticks")
    return archived


def _new_totals(entrant_count: int):
    return {
        "fightWins": np.zeros(entrant_count, dtype=np.int64),
        "fightLosses": np.zeros(entrant_count, dtype=np.int64),
        "fightDraws": np.zeros(entrant_count, dtype=np.int64),
        "matchPoints": np.zeros(entrant_count, dtype=np.float64),
        "expectedDamageGap": np.zeros(entrant_count, dtype=np.float64),
        "actualDamageGap": np.zeros(entrant_count, dtype=np.float64),
        "prayerCorrect": np.zeros(entrant_count, dtype=np.int64),
        "prayerRolls": np.zeros(entrant_count, dtype=np.int64),
        "styleRolls": np.zeros((entrant_count, 3), dtype=np.int64),
    }


def collect_batch_results(
        runner: LeagueEngine,
        matches: list[MatchPlan],
        totals: dict,
        output: list[dict]):
    for match_index, match in enumerate(matches):
        lane = match_index
        winner = int(runner.state.winner[lane])
        score_a = _fight_score(winner, 0)
        output.append({
            "round": match.round_index,
            "entrantA": match.entrant_a,
            "entrantB": match.entrant_b,
            "scoreA": score_a,
            "winnerSide": winner,
            "outcomeReason": str(runner.outcome_reason[lane]),
            "finishTick": int(runner.finish_tick[lane]),
        })
        totals["matchPoints"][match.entrant_a] += score_a
        totals["matchPoints"][match.entrant_b] += 1.0 - score_a

        views = (
            (match.entrant_a, lane, 0, score_a),
            (match.entrant_b, lane, 1, 1.0 - score_a),
        )
        for entrant_index, lane, side, fight_score in views:
            if fight_score == 1.0:
                totals["fightWins"][entrant_index] += 1
            elif fight_score == 0.0:
                totals["fightLosses"][entrant_index] += 1
            else:
                totals["fightDraws"][entrant_index] += 1
            opponent_side = 1 - side
            totals["expectedDamageGap"][entrant_index] += (
                runner.expected_damage_dealt[lane, side]
                - runner.expected_damage_dealt[lane, opponent_side])
            totals["actualDamageGap"][entrant_index] += (
                runner.state.damage_dealt[lane, side]
                - runner.state.damage_dealt[lane, opponent_side])
            totals["prayerCorrect"][entrant_index] += (
                runner.correct_prayer_rolls[lane, side])
            totals["prayerRolls"][entrant_index] += (
                runner.incoming_attack_rolls[lane, side])
            totals["styleRolls"][entrant_index] += (
                runner.outgoing_style_rolls[lane, side])


def build_standings(
        entrants: list[Entrant],
        ratings: np.ndarray,
        totals: dict):
    order = sorted(
        range(len(entrants)),
        key=lambda index: (
            -float(ratings[index]),
            -float(totals["matchPoints"][index]),
            entrants[index].label,
        ),
    )
    neural_order = [
        index for index in order if entrants[index].kind == "checkpoint"]
    neural_rank = {
        entrant_index: rank
        for rank, entrant_index in enumerate(neural_order, start=1)
    }
    rows = []
    for rank, entrant_index in enumerate(order, start=1):
        entrant = entrants[entrant_index]
        fight_count = int(
            totals["fightWins"][entrant_index]
            + totals["fightLosses"][entrant_index]
            + totals["fightDraws"][entrant_index])
        prayer_rolls = int(totals["prayerRolls"][entrant_index])
        style_rolls = totals["styleRolls"][entrant_index]
        style_total = int(style_rolls.sum())
        rows.append({
            "rank": rank,
            "checkpointRank": neural_rank.get(entrant_index),
            "entrantIndex": entrant_index,
            "label": entrant.label,
            "kind": entrant.kind,
            "source": entrant.source,
            "rating": round(float(ratings[entrant_index]), 6),
            "ratingChange": round(
                float(ratings[entrant_index] - START_RATING), 6),
            "matchPoints": round(
                float(totals["matchPoints"][entrant_index]), 3),
            "fightWins": int(totals["fightWins"][entrant_index]),
            "fightLosses": int(totals["fightLosses"][entrant_index]),
            "fightDraws": int(totals["fightDraws"][entrant_index]),
            "expectedDamageGapPerFight": round(
                float(totals["expectedDamageGap"][entrant_index])
                / max(1, fight_count), 6),
            "actualDamageGapPerFight": round(
                float(totals["actualDamageGap"][entrant_index])
                / max(1, fight_count), 6),
            "prayerCorrectPct": round(
                100.0 * int(totals["prayerCorrect"][entrant_index])
                / max(1, prayer_rolls), 6),
            "incomingAttackRolls": prayer_rolls,
            "outgoingMagicPct": round(
                100.0 * int(style_rolls[schema.STYLE_MAGIC])
                / max(1, style_total), 6),
            "outgoingRangedPct": round(
                100.0 * int(style_rolls[schema.STYLE_RANGED])
                / max(1, style_total), 6),
            "outgoingMeleePct": round(
                100.0 * int(style_rolls[schema.STYLE_MELEE])
                / max(1, style_total), 6),
            "sha256": entrant.sha256,
            "inputSize": entrant.input_size,
            "prayerHeadVersion": entrant.prayer_head_version,
        })
    return rows


def write_outputs(
        output_dir: Path,
        report: dict,
        standings: list[dict],
        matches: list[dict],
        entrants: list[Entrant]):
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "report.json"
    standings_path = output_dir / "standings.csv"
    matches_path = output_dir / "matches.csv"
    report_path.write_text(
        json.dumps(report, indent=2), encoding="utf-8")
    with standings_path.open("w", newline="", encoding="utf-8") as target:
        writer = csv.DictWriter(target, fieldnames=list(standings[0]))
        writer.writeheader()
        writer.writerows(standings)
    with matches_path.open("w", newline="", encoding="utf-8") as target:
        fields_out = (
            "round", "entrantA", "labelA", "entrantB", "labelB",
            "scoreA", "winnerSide", "outcomeReason", "finishTick",
            "preMatchRatingA", "preMatchRatingB", "eloChangeA",
        )
        writer = csv.DictWriter(target, fieldnames=fields_out)
        writer.writeheader()
        for match in matches:
            writer.writerow({
                **{key: match[key] for key in fields_out if key in match},
                "labelA": entrants[int(match["entrantA"])].label,
                "labelB": entrants[int(match["entrantB"])].label,
            })
    return report_path, standings_path, matches_path


def _run_signature(entrants, args):
    payload = {
        "entrants": [
            (entrant.kind, entrant.source, entrant.sha256)
            for entrant in entrants
        ],
        "seed": args.seed,
        "replaySeed": args.replay_seed,
        "worldId": args.world_id,
        "stallTicks": args.stall_ticks,
        "safetyMaxTicks": args.safety_max_ticks,
        "roundsPerBatch": args.rounds_per_batch,
        "parallelShards": args.parallel_shards,
    }
    return hashlib.sha256(json.dumps(
        payload, sort_keys=True).encode("utf-8")).hexdigest()


def _save_partial(path, signature, completed_rounds, matches, totals):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps({
        "signature": signature,
        "completedRounds": int(completed_rounds),
        "matches": matches,
        "totals": {
            key: value.tolist() for key, value in totals.items()
        },
    }), encoding="utf-8")
    os.replace(temporary, path)


def _load_partial(path, signature, entrant_count):
    if not path.exists():
        return 0, [], _new_totals(entrant_count)
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("signature") != signature:
        raise ValueError(
            f"existing partial league has a different configuration: {path}")
    expected = _new_totals(entrant_count)
    restored = {}
    for key, template in expected.items():
        value = np.asarray(payload["totals"][key], dtype=template.dtype)
        if value.shape != template.shape:
            raise ValueError(
                f"partial league total {key} has shape {value.shape}, "
                f"expected {template.shape}")
        restored[key] = value
    return (
        int(payload["completedRounds"]),
        list(payload["matches"]),
        restored,
    )


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--checkpoint-root",
        type=Path,
        default=ROOT / "checkpoints",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "out" / "elo-league",
    )
    parser.add_argument("--device", default="auto")
    parser.add_argument(
        "--safety-max-ticks", type=int, default=DEFAULT_SAFETY_MAX_TICKS)
    parser.add_argument(
        "--stall-ticks", type=int, default=DEFAULT_STALL_TICKS)
    parser.add_argument("--rounds-per-batch", type=int, default=157)
    parser.add_argument("--parallel-shards", type=int, default=1)
    parser.add_argument("--seed", type=int, default=20260804)
    parser.add_argument("--replay-seed", type=int, default=731904)
    parser.add_argument("--world-id", type=int, default=35)
    args = parser.parse_args()
    if args.safety_max_ticks <= 0:
        parser.error("--safety-max-ticks must be positive")
    if args.stall_ticks <= 0:
        parser.error("--stall-ticks must be positive")
    if args.rounds_per_batch <= 0:
        parser.error("--rounds-per-batch must be positive")
    if args.parallel_shards < 1 or args.parallel_shards > 8:
        parser.error("--parallel-shards must be between 1 and 8")
    return args


def main():
    args = parse_args()
    started = time.perf_counter()
    entrants, discovery = load_entrants(
        args.checkpoint_root.resolve(), args.device)
    rounds = build_round_robin(len(entrants), args.seed)
    all_matches = [match for round_matches in rounds for match in round_matches]
    expected_matches = len(entrants) * (len(entrants) - 1) // 2
    if len(all_matches) != expected_matches:
        raise RuntimeError(
            f"schedule has {len(all_matches)} matches, expected "
            f"{expected_matches}")

    print(
        f"League: {len(entrants)} entrants, {len(rounds)} rounds, "
        f"{len(all_matches)} matches/fights.",
        flush=True,
    )
    output_dir = args.output_dir.resolve()
    partial_path = output_dir / "partial-state.json"
    signature = _run_signature(entrants, args)
    completed_rounds, match_results, totals = _load_partial(
        partial_path, signature, len(entrants))
    if completed_rounds:
        print(
            f"Resuming after {completed_rounds}/{len(rounds)} completed "
            f"rounds and {len(match_results)} matches.",
            flush=True,
        )
    batch_count = math.ceil(len(rounds) / args.rounds_per_batch)
    score_lock = threading.Lock()
    for round_start in range(
            completed_rounds, len(rounds), args.rounds_per_batch):
        batch_index = round_start // args.rounds_per_batch + 1
        round_stop = min(
            len(rounds), round_start + args.rounds_per_batch)
        batch_matches = [
            match
            for round_matches in rounds[round_start:round_stop]
            for match in round_matches
        ]
        batch_started = time.perf_counter()
        print(
            f"Batch {batch_index}/{batch_count}: rounds "
            f"{round_start + 1}-{round_stop}, "
            f"{len(batch_matches)} parallel fights...",
            flush=True,
        )
        shard_matches = [[] for _ in range(args.parallel_shards)]
        for match in batch_matches:
            shard_matches[match.round_index % args.parallel_shards].append(
                match)
        shard_results = []
        with ThreadPoolExecutor(
                max_workers=args.parallel_shards) as executor:
            futures = {
                executor.submit(
                    simulate_batch,
                    entrants,
                    matches,
                    seed=(
                        args.seed
                        + round_start * 31
                        + shard_index * 10007),
                    replay_seed=args.replay_seed,
                    max_ticks=args.safety_max_ticks,
                    stall_ticks=args.stall_ticks,
                    world_id=args.world_id,
                    score_lock=score_lock,
                    progress_label=f"shard {shard_index + 1}: ",
                ): (shard_index, matches)
                for shard_index, matches in enumerate(shard_matches)
                if matches
            }
            for future in as_completed(futures):
                shard_index, matches = futures[future]
                shard_results.append((
                    shard_index, matches, future.result()))
        for _shard_index, matches, runner in sorted(shard_results):
            collect_batch_results(
                runner, matches, totals, match_results)
            del runner
        _save_partial(
            partial_path,
            signature,
            round_stop,
            match_results,
            totals,
        )
        print(
            f"  finished in {time.perf_counter() - batch_started:.1f}s; "
            f"simulated {len(match_results)}/{len(all_matches)} matches",
            flush=True,
        )

    ratings = apply_elo_rounds(match_results, len(entrants))
    if not np.isclose(float(ratings.mean()), START_RATING, atol=1.0e-9):
        raise RuntimeError("zero-sum Elo invariant failed")
    standings = build_standings(entrants, ratings, totals)
    elapsed = time.perf_counter() - started
    report = {
        "createdUtc": datetime.now(timezone.utc).isoformat(),
        "configuration": {
            "ratingSystem": "classic Elo",
            "startRating": START_RATING,
            "kFactorPerFight": K_FACTOR,
            "expectedScoreScale": ELO_SCALE,
            "matchScore": (
                "one completed fight per unordered pair; win=1, loss=0"),
            "roundUpdates": (
                "simultaneous from ratings at the start of each round"),
            "exploration": 0.0,
            "normalFightEnd": "death",
            "damageStallTicks": args.stall_ticks,
            "safetyMaxTicksPerFight": args.safety_max_ticks,
            "drawsAllowed": False,
            "startDistanceTiles": [1, 8],
            "worldId": args.world_id,
            "seed": args.seed,
            "replaySeed": args.replay_seed,
            "scriptDefence": "seeded-human-prayer-mix",
            "scriptVengeance": True,
            "parallelCpuShards": args.parallel_shards,
        },
        "coverage": {
            **discovery,
            "entrants": len(entrants),
            "rounds": len(rounds),
            "matches": len(match_results),
            "fights": len(match_results),
            "everyCompatiblePairPlayedOnce": (
                len(match_results) == expected_matches),
        },
        "runtimeSeconds": round(elapsed, 6),
        "meanFinalRating": float(ratings.mean()),
        "standings": standings,
    }
    report_path, standings_path, matches_path = write_outputs(
        output_dir,
        report,
        standings,
        match_results,
        entrants,
    )
    partial_path.unlink(missing_ok=True)
    print(
        f"Complete in {elapsed:.1f}s. Top entrant: "
        f"{standings[0]['label']} ({standings[0]['rating']:.2f}).",
        flush=True,
    )
    print(f"Report: {report_path}", flush=True)
    print(f"Standings: {standings_path}", flush=True)
    print(f"Matches: {matches_path}", flush=True)


if __name__ == "__main__":
    main()
