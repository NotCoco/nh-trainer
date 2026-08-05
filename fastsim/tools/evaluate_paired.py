#!/usr/bin/env python3
"""Run a matched candidate/control anchor screen entirely in FastSim."""

from __future__ import annotations

import argparse
import json
import multiprocessing
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from collections import defaultdict
from dataclasses import dataclass, fields
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import evaluation, policy, replay, state, world_map


JAVA_COMPATIBLE_ANCHOR_INPUTS = (110, 111, 112)
MAX_VISIBLE_PROTECTED_ORDINARY_MELEE_PCT = 1.0
MIN_SAFE_MAGIC_WARD_PCT = 90.0
MAX_CELL_WORKERS = 4
SUBJECT_LABELS = ("candidate", "control")

_WORKER_SUBJECT_POLICIES = None
_WORKER_ANCHOR_POLICIES = None


class _StateSlice:
    """Read-only lane view used by one original cell's metric collector."""

    def __init__(self, source, lane_slice: slice):
        self._source = source
        self._slice = lane_slice
        self.n_fights = lane_slice.stop - lane_slice.start

    def __getattr__(self, name):
        value = getattr(self._source, name)
        if (
                isinstance(value, np.ndarray)
                and value.shape[:1] == (self._source.n_fights,)):
            return value[self._slice]
        return value


@dataclass
class _GroupedPendingRoll:
    values: tuple


class _GroupedEvaluationCollector:
    """Preserve one independent report per cell inside one large engine."""

    def __init__(self, lane_slices, subject_sides, episodes_per_lane):
        self.lane_slices = tuple(lane_slices)
        self.collectors = tuple(
            evaluation.EvaluationCollector(
                lane_slice.stop - lane_slice.start, subject_side)
            for lane_slice, subject_side in zip(
                self.lane_slices, subject_sides, strict=True)
        )
        self._expected_fights = tuple(
            collector.n_fights * int(episodes_per_lane)
            for collector in self.collectors)
        self._stopped = np.zeros(len(self.collectors), dtype=bool)
        self._stop_after_positions = np.zeros(
            len(self.collectors), dtype=bool)

    def _states(self, source):
        return tuple(
            _StateSlice(source, lane_slice)
            for lane_slice in self.lane_slices)

    def observe_decision_tick(self, source, world_tick: int) -> None:
        for index, (collector, cell_state) in enumerate(zip(
                self.collectors, self._states(source), strict=True)):
            if self._stopped[index]:
                continue
            collector.observe_decision_tick(cell_state, world_tick)

    def observe_resulting_defence_prayer(self, defence_action) -> None:
        paired = np.asarray(defence_action).reshape(-1, 2)
        for index, (collector, lane_slice) in enumerate(zip(
                self.collectors, self.lane_slices, strict=True)):
            if self._stopped[index]:
                continue
            collector.observe_resulting_defence_prayer(
                paired[lane_slice])

    def begin_roll(
            self,
            source,
            fired,
            styles,
            protected,
            effective_overhead,
            world_tick,
            weapon_switch_ticks,
            decision_attack_delay=None,
            spec_kind=None):
        states = self._states(source)
        pending = []
        for index, (collector, cell_state, lane_slice) in enumerate(zip(
                self.collectors,
                states,
                self.lane_slices,
                strict=True)):
            if self._stopped[index]:
                pending.append(None)
                continue
            pending.append(collector.begin_roll(
                cell_state,
                fired[lane_slice],
                styles[lane_slice],
                protected[lane_slice],
                effective_overhead[lane_slice],
                world_tick,
                weapon_switch_ticks[lane_slice],
                decision_attack_delay=(
                    None
                    if decision_attack_delay is None
                    else decision_attack_delay[lane_slice]),
                spec_kind=spec_kind))
        return _GroupedPendingRoll(tuple(pending))

    def add_expected(self, pending, expected_damage) -> None:
        if pending is None:
            return
        for index, (collector, cell_pending, lane_slice) in enumerate(zip(
                self.collectors,
                pending.values,
                self.lane_slices,
                strict=True)):
            if self._stopped[index]:
                continue
            collector.add_expected(
                cell_pending, expected_damage[lane_slice])

    def add_actual(self, pending, damage) -> None:
        if pending is None:
            return
        for index, (collector, cell_pending, lane_slice) in enumerate(zip(
                self.collectors,
                pending.values,
                self.lane_slices,
                strict=True)):
            if self._stopped[index]:
                continue
            collector.add_actual(cell_pending, damage[lane_slice])

    def episode_end(self, source, newly_finished) -> None:
        for index, (collector, cell_state, lane_slice) in enumerate(zip(
                self.collectors,
                self._states(source),
                self.lane_slices,
                strict=True)):
            if self._stopped[index]:
                continue
            collector.episode_end(
                cell_state, newly_finished[lane_slice])
            if collector.completed_fights == self._expected_fights[index]:
                self._stop_after_positions[index] = True

    def observe_positions(self, source) -> None:
        for index, (collector, cell_state) in enumerate(zip(
                self.collectors, self._states(source), strict=True)):
            if self._stopped[index]:
                continue
            collector.observe_positions(cell_state)
            if self._stop_after_positions[index]:
                self._stopped[index] = True


class _RoutedPolicy:
    """Score the assigned side's rows with their cell-specific checkpoint."""

    def __init__(self, assignments, score_lock=None):
        grouped = defaultdict(list)
        instances = {}
        for policy_instance, rows in assignments:
            key = id(policy_instance)
            instances[key] = policy_instance
            grouped[key].append(np.asarray(rows, dtype=np.intp))
        self.groups = tuple(
            (instances[key], np.concatenate(row_groups))
            for key, row_groups in grouped.items())
        if not self.groups:
            raise ValueError("routed policy requires at least one assignment")
        action_counts = {
            int(instance.action_count) for instance, _rows in self.groups}
        if len(action_counts) != 1:
            raise ValueError(
                "all routed evaluation policies must share an action count")
        self.action_count = action_counts.pop()
        self.action_ids = self.groups[0][0].action_ids
        if any(
                tuple(instance.action_ids) != tuple(self.action_ids)
                for instance, _rows in self.groups):
            raise ValueError(
                "all routed evaluation policies must share action IDs")
        self.defence_prayer_head_version = max(
            int(getattr(instance, "defence_prayer_head_version", 1))
            for instance, _rows in self.groups)
        self.model_calls = 0
        self.logical_rows = 0
        self.score_lock = score_lock

    @staticmethod
    def _take(value, rows):
        return None if value is None else value[rows]

    def score(
            self,
            inputs,
            prayer_history_codes=None,
            prior_state_history=None,
            prior_state_history_valid=None):
        if self.score_lock is None:
            return self._score_unlocked(
                inputs,
                prayer_history_codes,
                prior_state_history,
                prior_state_history_valid)
        with self.score_lock:
            return self._score_unlocked(
                inputs,
                prayer_history_codes,
                prior_state_history,
                prior_state_history_valid)

    def _score_unlocked(
            self,
            inputs,
            prayer_history_codes=None,
            prior_state_history=None,
            prior_state_history_valid=None):
        scores = np.zeros(
            (len(inputs), self.action_count), dtype=np.float32)
        values = np.zeros(len(inputs), dtype=np.float32)
        pending_cuda = []
        for instance, rows in self.groups:
            version = int(getattr(
                instance, "defence_prayer_head_version", 1))
            cuda_packed = (
                hasattr(instance, "score_cuda_graph_packed")
                and getattr(getattr(instance, "device", None), "type", None)
                == "cuda")
            if cuda_packed:
                packed = instance.score_cuda_graph_packed(
                    inputs[rows],
                    self._take(prayer_history_codes, rows),
                    self._take(prior_state_history, rows),
                    self._take(prior_state_history_valid, rows))
                pending_cuda.append((rows, packed))
            elif version >= 3:
                local_scores, local_values = instance.score(
                    inputs[rows],
                    self._take(prayer_history_codes, rows),
                    self._take(prior_state_history, rows),
                    self._take(prior_state_history_valid, rows))
            elif version >= 2:
                local_scores, local_values = instance.score(
                    inputs[rows],
                    self._take(prayer_history_codes, rows))
            else:
                local_scores, local_values = instance.score(inputs[rows])
            if not cuda_packed:
                scores[rows] = local_scores
                values[rows] = local_values
            self.model_calls += 1
            self.logical_rows += len(rows)
        # Every checkpoint graph above is now queued on the same CUDA stream.
        # The first readback waits once for that complete queue; subsequent
        # packed copies do not insert a model-by-model compute synchronization.
        for rows, packed in pending_cuda:
            result = packed.float().cpu().numpy()
            scores[rows] = result[:, :-1]
            values[rows] = result[:, -1]
        return scores, values

    def condition_direct_gear(
            self,
            scores,
            inputs,
            legal_mask,
            opponent_ordinary_attack_cooldown_remaining=None):
        conditioned = scores.copy()
        for instance, rows in self.groups:
            if not hasattr(instance, "condition_direct_gear"):
                continue
            local_cooldown = (
                None
                if opponent_ordinary_attack_cooldown_remaining is None
                else opponent_ordinary_attack_cooldown_remaining[rows])
            conditioned[rows] = instance.condition_direct_gear(
                scores[rows],
                inputs[rows],
                legal_mask[rows],
                local_cooldown)
        return conditioned

    def compact_lanes(self, keep_lanes, side):
        """Remap assigned rows after an evaluation engine drops finished lanes."""
        keep = np.asarray(keep_lanes, dtype=bool)
        lane_to_new = np.full(len(keep), -1, dtype=np.intp)
        lane_to_new[keep] = np.arange(np.count_nonzero(keep), dtype=np.intp)
        compacted = []
        for instance, rows in self.groups:
            group_keep = keep[rows // 2]
            if hasattr(instance, "compact_rows"):
                instance.compact_rows(group_keep)
            if not group_keep.any():
                continue
            old_lanes = rows[group_keep] // 2
            new_rows = lane_to_new[old_lanes] * 2 + int(side)
            compacted.append((instance, new_rows.astype(np.intp)))
        self.groups = tuple(compacted)


class _GroupedEvaluationEngine(evaluation.EvaluationEngine):
    """One vectorized engine retaining the original independent cell views."""

    def __init__(
            self,
            *args,
            lane_slices,
            subject_sides,
            cell_state_templates,
            lane_replay_seeds,
            lane_replay_bot_indices,
            **kwargs):
        super().__init__(*args, subject_side=0, **kwargs)
        self.evaluation = _GroupedEvaluationCollector(
            lane_slices, subject_sides, self.episodes_per_lane)
        self._cell_state_templates = tuple(cell_state_templates)
        self._lane_slices = tuple(lane_slices)
        self._lane_replay_seeds = np.asarray(
            lane_replay_seeds, dtype=np.int64)
        self._lane_replay_bot_indices = np.asarray(
            lane_replay_bot_indices, dtype=np.int64)
        self._install_cell_state_templates(self.state)
        self._fresh_state_template = self._clone_current_state()
        self._evaluation_decision_attack_delay = (
            self.state.attack_delay.copy())

    def _install_cell_state_templates(self, destination) -> None:
        for definition in fields(state.BatchState):
            name = definition.name
            current = getattr(destination, name)
            if not (
                    isinstance(current, np.ndarray)
                    and current.shape[:1] == (self.n_fights,)):
                continue
            for lane_slice, template in zip(
                    self._lane_slices,
                    self._cell_state_templates,
                    strict=True):
                current[lane_slice] = getattr(template, name)

    def _clone_current_state(self):
        values = {}
        for definition in fields(state.BatchState):
            value = getattr(self.state, definition.name)
            values[definition.name] = (
                value.copy() if isinstance(value, np.ndarray) else value)
        return state.BatchState(**values)

    def _reset_finished_lanes(self):
        current = self.state
        reset = (
            (~current.alive)
            & (current.episode_id[:, 0] < self.episodes_per_lane))
        if not reset.any():
            return
        next_episode = current.episode_id[reset].copy() + 1
        stable_bot_index = current.bot_index[reset].copy()
        vengeance_active = current.vengeance_active[reset].copy()
        vengeance_cooldown = current.vengeance_cooldown[reset].copy()
        for definition in fields(state.BatchState):
            name = definition.name
            destination = getattr(current, name)
            replacement = getattr(self._fresh_state_template, name)
            if (
                    isinstance(destination, np.ndarray)
                    and destination.shape[:1] == (self.n_fights,)):
                destination[reset] = replacement[reset]
        current.episode_id[reset] = next_episode
        current.bot_index[reset] = stable_bot_index
        current.vengeance_active[reset] = vengeance_active
        current.vengeance_cooldown[reset] = vengeance_cooldown
        current.lock_ticks[reset] = 1
        self._drain_counter[reset] = 0
        self._rolling_reward_contributor_cache[reset] = None

    def _replay_units(self, draw_kind):
        return np.asarray([
            [
                replay.unit(
                    int(self._lane_replay_seeds[fight]),
                    self.world_tick,
                    int(self._lane_replay_bot_indices[fight, side]),
                    int(self._replay_hit_ordinals[fight, side]),
                    draw_kind)
                for side in range(2)
            ]
            for fight in range(self.n_fights)
        ], dtype=np.float64)


@dataclass(frozen=True)
class CellTask:
    index: int
    subject: str
    anchor: str
    scenario: str
    distance: int
    role: str
    subject_side: int
    seed: int
    replay_seed: int
    n_fights: int
    episodes_per_lane: int
    max_ticks: int
    world_id: int


def validate_cell_workers(cell_workers: int, device: str) -> None:
    if cell_workers < 1 or cell_workers > MAX_CELL_WORKERS:
        raise ValueError(
            f"--cell-workers must be between 1 and {MAX_CELL_WORKERS}")
    if cell_workers > 1 and device != "cpu":
        raise ValueError(
            "--cell-workers greater than 1 requires --device cpu")


def build_cell_tasks(
        anchor_labels,
        scenarios,
        roles,
        *,
        seed: int,
        replay_seed: int,
        n_fights: int,
        episodes_per_lane: int,
        max_ticks: int,
        world_id: int) -> list[CellTask]:
    tasks = []
    for subject in SUBJECT_LABELS:
        for anchor_index, anchor in enumerate(anchor_labels):
            for scenario, distance in scenarios:
                for role, subject_side in roles:
                    tasks.append(CellTask(
                        index=len(tasks),
                        subject=subject,
                        anchor=anchor,
                        scenario=scenario,
                        distance=distance,
                        role=role,
                        subject_side=subject_side,
                        seed=(
                            seed
                            + anchor_index * 1009
                            + (0 if scenario == "close" else 101)
                            + (0 if role == "first" else 17)),
                        replay_seed=(
                            replay_seed
                            + anchor_index * 1009
                            + (0 if scenario == "close" else 101)
                            + (0 if role == "first" else 17)),
                        n_fights=n_fights,
                        episodes_per_lane=episodes_per_lane,
                        max_ticks=max_ticks,
                        world_id=world_id))
    return tasks


def order_cell_results(indexed_results, expected_count: int) -> list[dict]:
    by_index = {}
    for index, cell in indexed_results:
        if index < 0 or index >= expected_count:
            raise ValueError(f"cell result index {index} is out of range")
        if index in by_index:
            raise ValueError(f"duplicate cell result index {index}")
        by_index[index] = cell
    if len(by_index) != expected_count:
        missing = [
            index for index in range(expected_count)
            if index not in by_index]
        raise ValueError(f"missing cell result indices: {missing}")
    return [by_index[index] for index in range(expected_count)]


def selected_scenarios(
        scenario_filter: str,
        close_distance: int,
        normal_distance: int) -> tuple[tuple[str, int], ...]:
    scenarios = (
        ("close", close_distance),
        ("normal", normal_distance))
    if scenario_filter == "both":
        return scenarios
    return tuple(
        scenario
        for scenario in scenarios
        if scenario[0] == scenario_filter)


def selected_roles(role_filter: str) -> tuple[tuple[str, int], ...]:
    roles = (("first", 0), ("second", 1))
    if role_filter == "both":
        return roles
    return tuple(role for role in roles if role[0] == role_filter)


def parse_anchor(raw: str) -> tuple[str, Path]:
    if "=" not in raw:
        raise argparse.ArgumentTypeError(
            "--anchor must be LABEL=checkpoint.pt")
    label, path = raw.split("=", 1)
    if not label.strip() or not path.strip():
        raise argparse.ArgumentTypeError(
            "--anchor must be LABEL=checkpoint.pt")
    return label.strip(), Path(path).resolve()


def load_eval_policy(path: Path, device: str):
    return policy.Policy.load(
        path,
        device=device,
        compatible_input_sizes=JAVA_COMPATIBLE_ANCHOR_INPUTS)


def build_cell_runner(
        task: CellTask,
        subject_policies: dict,
        anchor_policies: dict):
    subject_policy = subject_policies[task.subject]
    anchor_policy = anchor_policies[task.anchor]
    main_policy = (
        subject_policy if task.subject_side == 0 else anchor_policy)
    opponent_policy = (
        anchor_policy if task.subject_side == 0 else subject_policy)
    return evaluation.EvaluationEngine(
        n_fights=task.n_fights,
        policy=main_policy,
        opponent_policy=opponent_policy,
        subject_side=task.subject_side,
        seed=task.seed,
        replay_seed=task.replay_seed,
        epsilon=0.0,
        max_ticks=task.max_ticks,
        start_distance_min=task.distance,
        start_distance_max=task.distance,
        world_id=task.world_id,
        lane_radius=3,
        episodes_per_lane=task.episodes_per_lane)


def cell_result(task: CellTask, runner) -> tuple[int, dict]:
    return task.index, {
        "subject": task.subject,
        "anchor": task.anchor,
        "scenario": task.scenario,
        "startDistance": task.distance,
        "role": task.role,
        "seed": task.seed,
        "replaySeed": task.replay_seed,
        "metrics": runner.evaluation.report(),
    }


def run_cell_task(
        task: CellTask,
        subject_policies: dict,
        anchor_policies: dict) -> tuple[int, dict]:
    runner = build_cell_runner(
        task, subject_policies, anchor_policies)
    runner.run(on_record=lambda _record: None)
    return cell_result(task, runner)


def run_vectorized_cell_tasks(
        tasks: list[CellTask],
        subject_policies: dict,
        anchor_policies: dict) -> tuple[list[tuple[int, dict]], dict]:
    """Run every evaluation cell as lanes of one vectorized engine."""
    if not tasks:
        return [], {
            "parallelCells": 0,
            "vectorizedFightLanes": 0,
            "modelCalls": 0,
            "logicalScoreRows": 0,
        }
    common = {
        (task.n_fights,
         task.episodes_per_lane,
         task.max_ticks,
         task.world_id)
        for task in tasks
    }
    if len(common) != 1:
        raise ValueError(
            "vectorized evaluation cells must share fight and world settings")
    n_fights, episodes_per_lane, max_ticks, world_id = common.pop()
    lane_slices = []
    subject_sides = []
    cell_templates = []
    side_zero_assignments = []
    side_one_assignments = []
    lane_replay_seeds = []
    lane_replay_bot_indices = []
    offset = 0
    routed_policies = [
        *subject_policies.values(), *anchor_policies.values()]
    prior_state_history_enabled = any(
        int(getattr(instance, "defence_prayer_head_version", 1)) >= 3
        for instance in routed_policies)
    for task in tasks:
        lane_slice = slice(offset, offset + task.n_fights)
        lane_slices.append(lane_slice)
        subject_sides.append(task.subject_side)
        subject_policy = subject_policies[task.subject]
        anchor_policy = anchor_policies[task.anchor]
        main_policy = (
            subject_policy if task.subject_side == 0 else anchor_policy)
        opponent_policy = (
            anchor_policy if task.subject_side == 0 else subject_policy)
        flat_start = 2 * lane_slice.start
        flat_stop = 2 * lane_slice.stop
        side_zero_assignments.append((
            main_policy,
            np.arange(flat_start, flat_stop, 2, dtype=np.intp)))
        side_one_assignments.append((
            opponent_policy,
            np.arange(flat_start + 1, flat_stop, 2, dtype=np.intp)))
        cell_templates.append(state.BatchState.new(
            task.n_fights,
            np.random.default_rng(task.seed),
            start_distance_min=task.distance,
            start_distance_max=task.distance,
            world_id=task.world_id,
            lane_radius=3,
            defence_prayer_prior_state_history=
                prior_state_history_enabled))
        lane_replay_seeds.extend([task.replay_seed] * task.n_fights)
        lane_replay_bot_indices.extend(
            (fight * 2, fight * 2 + 1)
            for fight in range(task.n_fights))
        offset = lane_slice.stop

    side_zero_policy = _RoutedPolicy(side_zero_assignments)
    side_one_policy = _RoutedPolicy(side_one_assignments)
    runner = _GroupedEvaluationEngine(
        n_fights=offset,
        policy=side_zero_policy,
        opponent_policy=side_one_policy,
        lane_slices=lane_slices,
        subject_sides=subject_sides,
        cell_state_templates=cell_templates,
        lane_replay_seeds=lane_replay_seeds,
        lane_replay_bot_indices=lane_replay_bot_indices,
        seed=tasks[0].seed,
        replay_seed=tasks[0].replay_seed,
        epsilon=0.0,
        max_ticks=max_ticks,
        start_distance_min=min(task.distance for task in tasks),
        start_distance_max=max(task.distance for task in tasks),
        world_id=world_id,
        lane_radius=3,
        episodes_per_lane=episodes_per_lane)
    runner.run(on_record=lambda _record: None)
    results = []
    for task, collector in zip(
            tasks, runner.evaluation.collectors, strict=True):
        results.append((task.index, {
            "subject": task.subject,
            "anchor": task.anchor,
            "scenario": task.scenario,
            "startDistance": task.distance,
            "role": task.role,
            "seed": task.seed,
            "replaySeed": task.replay_seed,
            "metrics": collector.report(),
        }))
    return results, {
        "parallelCells": len(tasks),
        "vectorizedFightLanes": offset,
        "modelCalls": (
            side_zero_policy.model_calls + side_one_policy.model_calls),
        "logicalScoreRows": (
            side_zero_policy.logical_rows + side_one_policy.logical_rows),
    }


def initialize_cpu_cell_worker(
        candidate_path: str,
        control_path: str,
        anchor_items: tuple[tuple[str, str], ...]) -> None:
    global _WORKER_SUBJECT_POLICIES, _WORKER_ANCHOR_POLICIES
    _WORKER_SUBJECT_POLICIES = {
        "candidate": load_eval_policy(Path(candidate_path), "cpu"),
        "control": load_eval_policy(Path(control_path), "cpu"),
    }
    _WORKER_ANCHOR_POLICIES = {
        label: load_eval_policy(Path(path), "cpu")
        for label, path in anchor_items
    }


def run_cpu_cell_worker(task: CellTask) -> tuple[int, dict]:
    if (_WORKER_SUBJECT_POLICIES is None
            or _WORKER_ANCHOR_POLICIES is None):
        raise RuntimeError("CPU cell worker was not initialized")
    return run_cell_task(
        task, _WORKER_SUBJECT_POLICIES, _WORKER_ANCHOR_POLICIES)


def sum_nested_metrics(reports: list[dict]) -> dict:
    if not reports:
        raise ValueError("cannot aggregate an empty report list")
    total = {
        "completedFights": 0,
        "wins": 0,
        "losses": 0,
        "draws": 0,
        "damageDealt": 0.0,
        "damageTaken": 0.0,
        "outgoingAttackRolls": 0,
        "incomingAttackRolls": 0,
        "outgoingByStyle": {
            name: 0 for name in evaluation.STYLE_NAMES},
        "incomingStyleSpread": {
            name: 0 for name in evaluation.STYLE_NAMES},
        "ordinaryMeleeIntoProtectMelee": {
            "rolls": 0,
            "protected": 0,
            "visibleProtectMeleeAtDecision": 0,
            "visibleAndProtectedAtRoll": 0,
            "protectedNotVisibleAtDecision": 0,
        },
        "vlsIntoProtectMelee": {
            "rolls": 0,
            "protected": 0,
            "visibleProtectMeleeAtDecision": 0,
            "visibleAndProtectedAtRoll": 0,
            "protectedNotVisibleAtDecision": 0,
        },
        "expectedOutgoingDamage": 0.0,
        "expectedIncomingDamage": 0.0,
        "actualOutgoingRollDamage": 0.0,
        "actualIncomingRollDamage": 0.0,
        "prayerCorrect": 0,
        "incomingByStyle": {name: 0 for name in evaluation.STYLE_NAMES},
        "correctByStyle": {name: 0 for name in evaluation.STYLE_NAMES},
        "robeRolls": 0,
        "robeGmaulRolls": 0,
        "headEmptyRolls": 0,
        "headEmptyGmaulRolls": 0,
        "fullOffenceExposureRolls": 0,
        "fullOffenceExposureGmaulRolls": 0,
        "magicGear": {
            bucket: {
                "rolls": 0,
                "virtusTopRolls": 0,
                "virtusBottomRolls": 0,
                "torvaPlatelegsRolls": 0,
                "headUnequippedRolls": 0,
                "elidinisWardRolls": 0,
                "dragonfireShieldRolls": 0,
                "fullOffenceRolls": 0,
                "fullOffenceWithWardRolls": 0,
            }
            for bucket in ("waiting", "ready")
        },
        "standUnderTiming": {
            "allSameTile": {
                "decisionTicks": 0,
                "ownOrdinaryAttackCoolingDownTicks": 0,
                "ownOrdinaryAttackReadyTicks": 0,
            },
            "frozenOpponentSameTile": {
                "decisionTicks": 0,
                "ownOrdinaryAttackCoolingDownTicks": 0,
                "ownOrdinaryAttackReadyTicks": 0,
                "legalStepOutAttackOpportunities": 0,
                "legalStepOutOrdinaryAttackConversions": 0,
            },
        },
        "freezeMeleePrayerTiming": {
            "frozenUnreachable": {
                scope: {
                    "decisionTicks": 0,
                    "protectMeleeTicks": 0,
                }
                for scope in (
                    "all",
                    "moreThanFiveTicks",
                    "twoToFiveTicks",
                    "oneTick",
                )
            },
            "guaranteedSafeThroughNextEffectiveRollV2": {
                scope: {
                    "decisionTicks": 0,
                    "protectMeleeTicks": 0,
                }
                for scope in (
                    "all",
                    "moreThanFiveTicks",
                    "twoToFiveTicks",
                    "oneTick",
                )
            },
            "firstVisibleThaw": {
                "decisionTicks": 0,
                "visibleMeleeReachableTicks": 0,
                "protectMeleeTicks": 0,
            },
            "postThawVisibleMeleeReachable": {
                "decisionTicks": 0,
                "visibleMeleeReachableTicks": 0,
                "protectMeleeTicks": 0,
            },
        },
        "outsideCachedMapSamples": 0,
    }
    for report in reports:
        fights = int(report["completedFights"])
        total["completedFights"] += fights
        total["wins"] += int(report["wins"])
        total["losses"] += int(report["losses"])
        total["draws"] += int(report["draws"])
        total["damageDealt"] += float(report["totalDamageDealt"])
        total["damageTaken"] += float(report["totalDamageTaken"])
        for key in (
                "outgoingAttackRolls",
                "incomingAttackRolls"):
            total[key] += int(report[key])
        for name in evaluation.STYLE_NAMES:
            total["outgoingByStyle"][name] += int(
                report["outgoingStyleSpread"][name])
            total["incomingStyleSpread"][name] += int(
                report["incomingStyleSpread"][name])
        for source_name, destination_name in (
                ("ordinary", "ordinaryMeleeIntoProtectMelee"),
                ("vls", "vlsIntoProtectMelee")):
            source = report[
                "outgoingMeleeIntoProtectMelee"][source_name]
            destination = total[destination_name]
            for key in destination:
                destination[key] += int(source[key])
        for key in (
                "expectedOutgoingDamage",
                "expectedIncomingDamage",
                "actualOutgoingRollDamage",
                "actualIncomingRollDamage"):
            total[key] += float(report[key])
        for name, bucket in report["rollPrayerByIncomingStyle"].items():
            total["incomingByStyle"][name] += int(bucket["rolls"])
            total["correctByStyle"][name] += int(bucket["correct"])
            total["prayerCorrect"] += int(bucket["correct"])
        total["robeRolls"] += int(
            report["physicalRobeExposure"]["rolls"])
        total["robeGmaulRolls"] += int(
            report["physicalRobeExposure"]["gmaulRolls"])
        total["headEmptyRolls"] += int(
            report["physicalHeadUnequippedExposure"]["rolls"])
        total["headEmptyGmaulRolls"] += int(
            report["physicalHeadUnequippedExposure"]["gmaulRolls"])
        total["fullOffenceExposureRolls"] += int(
            report["physicalFullOffenceExposure"]["rolls"])
        total["fullOffenceExposureGmaulRolls"] += int(
            report["physicalFullOffenceExposure"]["gmaulRolls"])
        for bucket in ("waiting", "ready"):
            source = report[
                "ordinaryMagicGearAtRollByDefenderAttackTimer"][bucket]
            destination = total["magicGear"][bucket]
            for key in destination:
                destination[key] += int(source[key])
        for scope in ("allSameTile", "frozenOpponentSameTile"):
            source = report["standUnderTiming"][scope]
            destination = total["standUnderTiming"][scope]
            for key in destination:
                destination[key] += int(source[key])
        freeze_source = report["freezeMeleePrayerTiming"]
        frozen_source = freeze_source["frozenUnreachable"]
        frozen_total = total["freezeMeleePrayerTiming"][
            "frozenUnreachable"]
        for scope in (
                "all",
                "moreThanFiveTicks",
                "twoToFiveTicks",
                "oneTick"):
            source = (
                frozen_source["all"]
                if scope == "all"
                else frozen_source["byVisibleFreezeRemaining"][scope])
            destination = frozen_total[scope]
            for key in destination:
                destination[key] += int(source[key])
        guaranteed_source = freeze_source[
            "guaranteedSafeThroughNextEffectiveRollV2"]
        guaranteed_total = total["freezeMeleePrayerTiming"][
            "guaranteedSafeThroughNextEffectiveRollV2"]
        for scope in (
                "all",
                "moreThanFiveTicks",
                "twoToFiveTicks",
                "oneTick"):
            source = (
                guaranteed_source["all"]
                if scope == "all"
                else guaranteed_source[
                    "byVisibleFreezeRemaining"][scope])
            destination = guaranteed_total[scope]
            for key in destination:
                destination[key] += int(source[key])
        for scope in (
                "firstVisibleThaw",
                "postThawVisibleMeleeReachable"):
            source = freeze_source[scope]
            destination = total["freezeMeleePrayerTiming"][scope]
            for key in destination:
                destination[key] += int(source[key])
        total["outsideCachedMapSamples"] += int(
            report["isolation"]["outsideCachedMapSamples"])

    fights = total["completedFights"]
    incoming = total["incomingAttackRolls"]
    expected_gap = (
        total["expectedOutgoingDamage"]
        - total["expectedIncomingDamage"])
    actual_gap = (
        total["actualOutgoingRollDamage"]
        - total["actualIncomingRollDamage"])

    def gear_bucket(bucket: str) -> dict:
        metrics = total["magicGear"][bucket]
        rolls = metrics["rolls"]

        def pct(key: str):
            return (
                round(100.0 * metrics[key] / rolls, 3)
                if rolls else None)

        return {
            **metrics,
            "virtusTopPct": pct("virtusTopRolls"),
            "virtusBottomPct": pct("virtusBottomRolls"),
            "torvaPlatelegsPct": pct("torvaPlatelegsRolls"),
            "headUnequippedPct": pct("headUnequippedRolls"),
            "elidinisWardPct": pct("elidinisWardRolls"),
            "dragonfireShieldPct": pct("dragonfireShieldRolls"),
            "fullOffencePct": pct("fullOffenceRolls"),
            "fullOffenceWithWardPct": pct("fullOffenceWithWardRolls"),
        }

    robe_non_gmaul = total["robeRolls"] - total["robeGmaulRolls"]
    head_non_gmaul = (
        total["headEmptyRolls"] - total["headEmptyGmaulRolls"])
    full_offence_non_gmaul = (
        total["fullOffenceExposureRolls"]
        - total["fullOffenceExposureGmaulRolls"])

    def protected_melee_bucket(key: str) -> dict:
        metrics = total[key]
        rolls = metrics["rolls"]
        visible = metrics["visibleProtectMeleeAtDecision"]
        return {
            **metrics,
            "protectedPct": (
                round(100.0 * metrics["protected"] / rolls, 3)
                if rolls else None),
            "visibleAndProtectedPctOfMeleeRolls": (
                round(
                    100.0 * metrics["visibleAndProtectedAtRoll"] / rolls,
                    3)
                if rolls else None),
            "visibleAndProtectedPctWhenVisible": (
                round(
                    100.0 * metrics["visibleAndProtectedAtRoll"] / visible,
                    3)
                if visible else None),
        }

    stand_under = total["standUnderTiming"]
    frozen_stand_under = stand_under["frozenOpponentSameTile"]
    step_out_opportunities = frozen_stand_under[
        "legalStepOutAttackOpportunities"]
    step_out_conversions = frozen_stand_under[
        "legalStepOutOrdinaryAttackConversions"]
    freeze_timing = total["freezeMeleePrayerTiming"]

    def frozen_prayer_bucket(metric: str, scope: str) -> dict:
        metrics = freeze_timing[metric][scope]
        return {
            **metrics,
            "protectMeleePct": (
                round(
                    100.0 * metrics["protectMeleeTicks"]
                    / metrics["decisionTicks"],
                    3)
                if metrics["decisionTicks"] else None),
        }

    def thaw_bucket(scope: str) -> dict:
        metrics = freeze_timing[scope]
        reachable = metrics["visibleMeleeReachableTicks"]
        return {
            **metrics,
            "protectMeleePct": (
                round(
                    100.0 * metrics["protectMeleeTicks"] / reachable,
                    3)
                if reachable else None),
        }

    return {
        "completedFights": fights,
        "wins": total["wins"],
        "losses": total["losses"],
        "draws": total["draws"],
        "averageDamageDealt": (
            round(total["damageDealt"] / fights, 3) if fights else None),
        "averageDamageTaken": (
            round(total["damageTaken"] / fights, 3) if fights else None),
        "outgoingAttackRolls": total["outgoingAttackRolls"],
        "incomingAttackRolls": incoming,
        "outgoingStyleSpread": total["outgoingByStyle"],
        "incomingStyleSpread": total["incomingStyleSpread"],
        "outgoingMeleeIntoProtectMelee": {
            "ordinary": protected_melee_bucket(
                "ordinaryMeleeIntoProtectMelee"),
            "vls": protected_melee_bucket("vlsIntoProtectMelee"),
        },
        "expectedOutgoingDamage": round(
            total["expectedOutgoingDamage"], 6),
        "expectedIncomingDamage": round(
            total["expectedIncomingDamage"], 6),
        "expectedDamageGap": round(expected_gap, 6),
        "expectedDamageGapPerFight": (
            round(expected_gap / fights, 3) if fights else None),
        "actualOutgoingRollDamage": round(
            total["actualOutgoingRollDamage"], 6),
        "actualIncomingRollDamage": round(
            total["actualIncomingRollDamage"], 6),
        "actualRollDamageGap": round(actual_gap, 6),
        "actualRollDamageGapPerFight": (
            round(actual_gap / fights, 3) if fights else None),
        "rollPrayerCorrectPct": (
            round(100.0 * total["prayerCorrect"] / incoming, 3)
            if incoming else None),
        "rollPrayerByIncomingStyle": {
            name: {
                "rolls": total["incomingByStyle"][name],
                "correct": total["correctByStyle"][name],
                "correctPct": (
                    round(
                        100.0 * total["correctByStyle"][name]
                        / total["incomingByStyle"][name],
                        3)
                    if total["incomingByStyle"][name] else None),
            }
            for name in evaluation.STYLE_NAMES
        },
        "physicalRobeExposure": {
            "rolls": total["robeRolls"],
            "rollsPerFight": (
                round(total["robeRolls"] / fights, 3)
                if fights else None),
            "gmaulRolls": total["robeGmaulRolls"],
            "nonGmaulRolls": robe_non_gmaul,
            "nonGmaulRollsPerFight": (
                round(robe_non_gmaul / fights, 3)
                if fights else None),
        },
        "physicalHeadUnequippedExposure": {
            "rolls": total["headEmptyRolls"],
            "gmaulRolls": total["headEmptyGmaulRolls"],
            "nonGmaulRolls": head_non_gmaul,
            "nonGmaulRollsPerFight": (
                round(head_non_gmaul / fights, 3)
                if fights else None),
        },
        "physicalFullOffenceExposure": {
            "rolls": total["fullOffenceExposureRolls"],
            "gmaulRolls": total["fullOffenceExposureGmaulRolls"],
            "nonGmaulRolls": full_offence_non_gmaul,
            "nonGmaulRollsPerFight": (
                round(full_offence_non_gmaul / fights, 3)
                if fights else None),
        },
        "ordinaryMagicGearAtRollByDefenderAttackTimer": {
            bucket: gear_bucket(bucket)
            for bucket in ("waiting", "ready")
        },
        "standUnderTiming": {
            "allSameTile": dict(stand_under["allSameTile"]),
            "frozenOpponentSameTile": {
                **frozen_stand_under,
                "legalStepOutOrdinaryAttackConversionPct": (
                    round(
                        100.0 * step_out_conversions
                        / step_out_opportunities,
                        3)
                if step_out_opportunities else None),
            },
        },
        "freezeMeleePrayerTiming": {
            "frozenUnreachable": {
                "all": frozen_prayer_bucket(
                    "frozenUnreachable", "all"),
                "byVisibleFreezeRemaining": {
                    scope: frozen_prayer_bucket(
                        "frozenUnreachable", scope)
                    for scope in (
                        "moreThanFiveTicks",
                        "twoToFiveTicks",
                        "oneTick",
                    )
                },
            },
            "guaranteedSafeThroughNextEffectiveRollV2": {
                "all": frozen_prayer_bucket(
                    "guaranteedSafeThroughNextEffectiveRollV2", "all"),
                "byVisibleFreezeRemaining": {
                    scope: frozen_prayer_bucket(
                        "guaranteedSafeThroughNextEffectiveRollV2",
                        scope)
                    for scope in (
                        "moreThanFiveTicks",
                        "twoToFiveTicks",
                        "oneTick",
                    )
                },
            },
            "firstVisibleThaw": thaw_bucket("firstVisibleThaw"),
            "postThawVisibleMeleeReachable": {
                **thaw_bucket("postThawVisibleMeleeReachable"),
                "decisionWindow": "next three decisions",
            },
        },
        "isolation": {
            "crossLaneRollCount": 0,
            "interFightInteractionPossible": False,
            "outsideCachedMapSamples":
                total["outsideCachedMapSamples"],
            "mode": "independent vectorized fight lanes",
        },
    }


def numeric_delta(candidate: dict, control: dict, key: str):
    left = candidate.get(key)
    right = control.get(key)
    if left is None or right is None:
        return None
    return round(float(left) - float(right), 3)


def visible_protected_ordinary_melee_gate(metrics: dict) -> bool:
    ordinary = metrics["outgoingMeleeIntoProtectMelee"]["ordinary"]
    rate = ordinary["visibleAndProtectedPctOfMeleeRolls"]
    return (
        int(ordinary["rolls"]) > 0
        and rate is not None
        and float(rate) < MAX_VISIBLE_PROTECTED_ORDINARY_MELEE_PCT
    )


def safe_magic_ward_gate(metrics: dict) -> bool:
    waiting = metrics[
        "ordinaryMagicGearAtRollByDefenderAttackTimer"]["waiting"]
    rate = waiting["elidinisWardPct"]
    return (
        int(waiting["rolls"]) > 0
        and rate is not None
        and float(rate) >= MIN_SAFE_MAGIC_WARD_PCT
    )


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--control", type=Path, required=True)
    parser.add_argument(
        "--anchor", action="append", type=parse_anchor, required=True,
        help="repeat LABEL=checkpoint.pt for each immutable anchor")
    parser.add_argument("--fights-per-cell", type=int, default=256)
    parser.add_argument("--episodes-per-lane", type=int, default=1)
    parser.add_argument("--max-ticks", type=int, default=300)
    parser.add_argument("--close-distance", type=int, default=1)
    parser.add_argument("--normal-distance", type=int, default=6)
    parser.add_argument(
        "--scenario", choices=("both", "close", "normal"), default="both",
        help="run both distance scenarios or one focused scenario")
    parser.add_argument(
        "--role", choices=("both", "first", "second"), default="both",
        help="run both subject roles or one focused role")
    parser.add_argument("--world-id", type=int, default=35)
    parser.add_argument("--seed", type=int, default=6301)
    parser.add_argument(
        "--replay-seed", type=int, default=20260728,
        help="keyed combat seed shared by matched candidate/control cells")
    parser.add_argument(
        "--device", choices=("auto", "cuda", "cpu"), default="auto")
    parser.add_argument(
        "--cell-workers", type=int, default=1,
        help=(
            "persistent CPU processes for independent evaluation cells; "
            "CUDA always batches all cells in one process; "
            f"maximum CPU workers {MAX_CELL_WORKERS}"))
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    if args.fights_per_cell <= 0:
        parser.error("--fights-per-cell must be positive")
    if args.episodes_per_lane <= 0:
        parser.error("--episodes-per-lane must be positive")
    if args.max_ticks <= 1:
        parser.error("--max-ticks must be greater than one")
    try:
        validate_cell_workers(args.cell_workers, args.device)
    except ValueError as exc:
        parser.error(str(exc))
    anchors = dict(args.anchor)
    if len(anchors) != len(args.anchor):
        parser.error("anchor labels must be unique")
    scenarios = selected_scenarios(
        args.scenario, args.close_distance, args.normal_distance)
    roles = selected_roles(args.role)
    for _scenario, distance in scenarios:
        if not world_map.SELF_PLAY_MAP.has_plan(
                args.world_id, distance, distance):
            parser.error(
                f"world {args.world_id} has no cache-derived lanes at "
                f"exact distance {distance}")

    tasks = build_cell_tasks(
        tuple(anchors),
        scenarios,
        roles,
        seed=args.seed,
        replay_seed=args.replay_seed,
        n_fights=args.fights_per_cell,
        episodes_per_lane=args.episodes_per_lane,
        max_ticks=args.max_ticks,
        world_id=args.world_id)

    started = time.perf_counter()
    execution = {
        "mode": None,
        "parallelCells": 1,
    }
    if args.cell_workers == 1:
        subject_policies = {
            "candidate": load_eval_policy(
                args.candidate.resolve(), args.device),
            "control": load_eval_policy(
                args.control.resolve(), args.device),
        }
        loaded_anchors = {
            label: load_eval_policy(path, args.device)
            for label, path in anchors.items()
        }
        loaded_policies = [
            *subject_policies.values(), *loaded_anchors.values()]
        use_cuda_vectorized = all(
            getattr(getattr(instance, "device", None), "type", None)
            == "cuda"
            for instance in loaded_policies)
        if use_cuda_vectorized:
            indexed_results, batch_stats = run_vectorized_cell_tasks(
                tasks, subject_policies, loaded_anchors)
            execution = {
                "mode": "single-vectorized-engine-routed-policies",
                **batch_stats,
            }
        else:
            indexed_results = [
                run_cell_task(task, subject_policies, loaded_anchors)
                for task in tasks
            ]
            execution["mode"] = "serial-cells-cpu"
    else:
        anchor_items = tuple(
            (label, str(path)) for label, path in anchors.items())
        with ProcessPoolExecutor(
                max_workers=args.cell_workers,
                mp_context=multiprocessing.get_context("spawn"),
                initializer=initialize_cpu_cell_worker,
                initargs=(
                    str(args.candidate.resolve()),
                    str(args.control.resolve()),
                    anchor_items)) as executor:
            indexed_results = list(
                executor.map(run_cpu_cell_worker, tasks, chunksize=1))
        execution = {
            "mode": "parallel-cells-cpu-processes",
            "parallelCells": args.cell_workers,
        }
    cells = order_cell_results(indexed_results, len(tasks))

    aggregate = {
        label: sum_nested_metrics([
            cell["metrics"]
            for cell in cells
            if cell["subject"] == label])
        for label in SUBJECT_LABELS
    }
    comparison = {
        "candidateMinusControl": {
            key: numeric_delta(
                aggregate["candidate"], aggregate["control"], key)
            for key in (
                "expectedDamageGapPerFight",
                "actualRollDamageGapPerFight",
                "rollPrayerCorrectPct")
        }
    }
    comparison["candidateMinusControl"][
        "physicalRobeRollsPerFight"] = numeric_delta(
            aggregate["candidate"]["physicalRobeExposure"],
            aggregate["control"]["physicalRobeExposure"],
            "rollsPerFight")
    for bucket in ("waiting", "ready"):
        comparison["candidateMinusControl"][
            f"{bucket}OrdinaryMagicFullOffencePct"] = numeric_delta(
                aggregate["candidate"][
                    "ordinaryMagicGearAtRollByDefenderAttackTimer"][bucket],
                aggregate["control"][
                    "ordinaryMagicGearAtRollByDefenderAttackTimer"][bucket],
                "fullOffencePct")
    comparison["candidateMinusControl"][
        "nonGmaulPhysicalFullOffenceRollsPerFight"] = numeric_delta(
            aggregate["candidate"]["physicalFullOffenceExposure"],
            aggregate["control"]["physicalFullOffenceExposure"],
            "nonGmaulRollsPerFight")
    comparison["candidateMinusControl"][
        "visibleProtectedOrdinaryMeleePctOfMeleeRolls"] = numeric_delta(
            aggregate["candidate"][
                "outgoingMeleeIntoProtectMelee"]["ordinary"],
            aggregate["control"][
                "outgoingMeleeIntoProtectMelee"]["ordinary"],
            "visibleAndProtectedPctOfMeleeRolls")

    expected_fights = (
        args.fights_per_cell
        * args.episodes_per_lane
        * len(anchors)
        * len(scenarios)
        * len(roles))
    gates = {
        "checkpointLoadRequirementMet": True,
        "candidateCompletedExpectedFights":
            aggregate["candidate"]["completedFights"] == expected_fights,
        "controlCompletedExpectedFights":
            aggregate["control"]["completedFights"] == expected_fights,
        "laneIsolationRequirementMet": (
            aggregate["candidate"]["isolation"][
                "outsideCachedMapSamples"] == 0
            and aggregate["control"]["isolation"][
                "outsideCachedMapSamples"] == 0),
        "explorationDisabled": True,
        "sameMatchedSeedsForCandidateAndControl": True,
        "candidateVisibleProtectedOrdinaryMeleeBelowOnePct":
            visible_protected_ordinary_melee_gate(
                aggregate["candidate"]),
        "candidateSafeMagicWardAtLeastNinetyPct":
            safe_magic_ward_gate(aggregate["candidate"]),
    }
    report = {
        "schema": "fastsim_paired_anchor_eval.v1",
        "authority": "rapid_screen",
        "promotionAuthority": False,
        "primaryDamageMetric": "expectedDamageGapPerFight",
        "runtimeSeconds": round(time.perf_counter() - started, 3),
        "configuration": {
            "candidate": str(args.candidate.resolve()),
            "control": str(args.control.resolve()),
            "anchors": {
                label: str(path) for label, path in anchors.items()
            },
            "fightsPerCell": args.fights_per_cell,
            "episodesPerLane": args.episodes_per_lane,
            "maxTicks": args.max_ticks,
            "closeDistance": args.close_distance,
            "normalDistance": args.normal_distance,
            "scenarioFilter": args.scenario,
            "roleFilter": args.role,
            "worldId": args.world_id,
            "epsilon": 0.0,
            "device": args.device,
            "cellWorkers": args.cell_workers,
            "execution": execution,
        },
        "gates": gates,
        "aggregate": aggregate,
        "comparison": comparison,
        "cells": cells,
        "coverage": {
            "available": [
                "completed fights and outcomes",
                "expected and actual roll damage",
                "outgoing attack style spread",
                "roll-time prayer correctness overall and by style",
                "ordinary and 0-1 tick Zuriel prayer correctness",
                "incoming-roll prayer holds and switches",
                "physical-roll Virtus exposure",
                "incoming-roll gear switching",
                "frozen-opponent stand-under timing and legal step-out "
                "attack conversion",
                "cache-derived exact-distance starts",
                "vectorized lane isolation",
            ],
            "notYetEquivalentToJava": [
                "stand-under value attribution beyond frozen-opponent timing",
                "full per-slot tank teacher utilization",
                "defensive actionable-window switch telemetry",
                "Vengeance usefulness classification",
                "Java process/model-load log gates",
                "cross-runtime deployment validation",
            ],
            "note": (
                "Use this for high-sample iteration. Keep one focused Java "
                "promotion check until the wider replay matrix covers the "
                "remaining runtime-only telemetry.")
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(args.out.resolve()),
        "runtimeSeconds": report["runtimeSeconds"],
        "gates": gates,
        "candidate": aggregate["candidate"],
        "control": aggregate["control"],
        "comparison": comparison,
    }, indent=2))
    return 0 if all(gates.values()) else 2


if __name__ == "__main__":
    raise SystemExit(main())
