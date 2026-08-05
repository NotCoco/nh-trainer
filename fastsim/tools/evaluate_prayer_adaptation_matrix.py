#!/usr/bin/env python3
"""Closed-loop defence-prayer promotion matrix with compact trace evidence."""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastsim import evaluation, gear, policy, schema, scripted_policy, state  # noqa: E402
from tools import evaluate_fixed_attack as fixed_eval  # noqa: E402
from tools import evaluate_paired as paired_eval  # noqa: E402


@dataclass(frozen=True)
class Scenario:
    name: str
    attack: str
    kind: str
    fights: int
    ticks: int
    distance_min: int
    distance_max: int
    target_style: str | None = None
    defence: str = "seeded-switching-protection"
    use_vengeance: bool = False


SCENARIOS = (
    Scenario("fixed-ranged", "ranged", "fixed-ranged", 64, 180, 1, 8,
             "ranged"),
    Scenario("old-gearfake-unseen-seed",
             "seeded-three-style-then-ranged-gear-fakes",
             "repeated-ranged", 96, 260, 1, 8),
    Scenario("heldout-gearflick-close", "live-ranged-gear-flick-pressure",
             "repeated-ranged", 96, 260, 1, 1),
    Scenario("heldout-gearflick-random", "live-ranged-gear-flick-pressure",
             "repeated-ranged", 96, 260, 1, 8),
    Scenario("heldout-multigear-moving-a",
             "heldout-ranged-multigear-movement-a",
             "repeated-ranged", 128, 280, 1, 8),
    Scenario("heldout-multigear-moving-b",
             "heldout-ranged-multigear-movement-b",
             "repeated-ranged", 128, 280, 1, 8),
    Scenario("heldout-human-fullgear", "live-human-ranged-pressure-fullgear",
             "interrupted-ranged", 96, 260, 1, 8),
    Scenario("heldout-human-recurring-fullgear",
             "live-human-recurring-ranged-pressure-fullgear",
             "interrupted-ranged", 96, 300, 1, 8, defence="melee"),
    Scenario("fixed-magic", "magic", "fixed-style", 64, 180, 1, 8,
             "magic"),
    Scenario("fixed-melee", "melee", "fixed-style", 64, 180, 1, 1,
             "melee"),
    Scenario("fixed-halberd", "halberd", "fixed-style", 64, 200, 3, 3,
             "melee"),
    Scenario("adaptive-random", "adaptive-random", "mixed", 96, 240, 1, 8),
    Scenario("rapid-switch", "rapid-switch", "mixed", 64, 220, 1, 8),
    Scenario("block-switch", "block-switch", "mixed", 64, 220, 1, 8),
    Scenario("balanced-complete-history",
             "seeded-complete-history-balanced-pressure",
             "mixed", 96, 280, 1, 8),
    Scenario("honest-gear-style-transitions",
             "honest-gear-style-transitions",
             "honest-transition", 72, 220, 1, 8),
    Scenario("vengeance-human-ranged",
             "seeded-comprehensive-human-ranged-pressure",
             "mixed", 96, 260, 1, 8,
             defence="seeded-human-prayer-mix", use_vengeance=True),
    Scenario("vengeance-adaptive",
             "adaptive-random",
             "mixed", 96, 260, 1, 8,
             defence="seeded-switching-protection", use_vengeance=True),
    Scenario("vengeance-balanced-history",
             "seeded-complete-history-balanced-pressure",
             "mixed", 96, 280, 1, 8,
             defence="melee-magic-reactive", use_vengeance=True),
    Scenario("vengeance-three-style-blocks",
             "seeded-recurring-three-style-blocks",
             "mixed", 96, 260, 1, 8,
             defence="seeded-reactive-protection", use_vengeance=True),
)


@dataclass(frozen=True)
class _VectorCellTask:
    index: int
    subject: str
    scenario_index: int
    scenario: Scenario
    role: str
    subject_side: int
    fights: int
    seed: int
    replay_seed: int
    world_id: int


class _ScriptedSidePolicy:
    """Preserve ScriptedPolicy's original two-rows-per-fight indexing."""

    input_size = schema.INPUT_SIZE
    action_count = schema.ACTION_COUNT
    action_ids = schema.CURRENT_ACTION_IDS
    defence_prayer_head_version = 1

    def __init__(
            self,
            script: str,
            defence: str,
            seed: int,
            side: int,
            fights: int,
            use_vengeance: bool = False):
        self._policy = scripted_policy.ScriptedPolicy(
            script, defence, seed=seed, use_vengeance=use_vengeance)
        self._side = int(side)
        self._fights = int(fights)

    def score(self, inputs):
        inputs = np.asarray(inputs)
        if inputs.shape[0] != self._fights:
            raise ValueError(
                "scripted routed policy received the wrong lane count")
        paired_inputs = np.repeat(inputs, 2, axis=0)
        paired_inputs[self._side::2] = inputs
        scores, values = self._policy.score(paired_inputs)
        return scores[self._side::2], values[self._side::2]


class _TimedGroupedEvaluationCollector(
        paired_eval._GroupedEvaluationCollector):
    """Stop each cell at its original scenario-specific tick limit."""

    def __init__(
            self,
            lane_slices,
            subject_sides,
            episodes_per_lane,
            cell_max_ticks):
        super().__init__(
            lane_slices, subject_sides, episodes_per_lane)
        self.cell_max_ticks = tuple(int(value) for value in cell_max_ticks)

    def observe_decision_tick(self, source, world_tick: int) -> None:
        for index, max_ticks in enumerate(self.cell_max_ticks):
            if world_tick >= max_ticks:
                self._stopped[index] = True
        super().observe_decision_tick(source, world_tick)


class _GroupedPrayerTraceEngine(paired_eval._GroupedEvaluationEngine):
    """One heterogeneous engine for every matrix scenario and model."""

    def __init__(self, *args, cell_max_ticks, **kwargs):
        lane_slices = tuple(kwargs["lane_slices"])
        subject_sides = tuple(kwargs["subject_sides"])
        super().__init__(*args, **kwargs)
        lane_max_ticks = np.empty(self.n_fights, dtype=np.int32)
        for lane_slice, max_ticks in zip(
                lane_slices, cell_max_ticks, strict=True):
            lane_max_ticks[lane_slice] = int(max_ticks)
        # Engine and EvaluationEngine already support NumPy lane-wise
        # comparisons here. Giving each lane its original limit makes timeout
        # draws, completed-fight counts and alive-state transitions identical
        # to the independent runners.
        self.max_ticks = lane_max_ticks
        self.evaluation = _TimedGroupedEvaluationCollector(
            lane_slices,
            subject_sides,
            self.episodes_per_lane,
            cell_max_ticks)
        self._trace_lane_slices = lane_slices
        self._trace_subject_sides = subject_sides
        self.lane_prayer_trace = [
            [] for _lane in range(self.n_fights)]
        self.lane_decision_prayer_trace = [
            [] for _lane in range(self.n_fights)]

    def step(self):
        # This is the same diagnostic-only sustain behavior used by
        # evaluate_fixed_attack._PrayerTraceEngine.
        self.state.hp[self.state.alive] = 99
        return super().step()

    @staticmethod
    def _prayer_name(prayer: int) -> str:
        if schema.PRAY_PROTECT_MAGIC <= prayer <= schema.PRAY_PROTECT_MELEE:
            return evaluation.PRAYER_NAMES[
                prayer - schema.PRAY_PROTECT_MAGIC]
        return "none"

    def _book_roll_prayer(self, fired, hit_style, spec_kind=None):
        fired = np.asarray(fired, dtype=bool)
        hit_style = np.asarray(hit_style)
        protected = self._protected_at_roll(hit_style, fired)
        effective = self._effective_overhead()
        for cell_index, (lane_slice, subject) in enumerate(zip(
                self._trace_lane_slices,
                self._trace_subject_sides,
                strict=True)):
            if self.evaluation._stopped[cell_index]:
                continue
            attacker = 1 - subject
            incoming = fired[lane_slice, attacker]
            for local_lane in np.flatnonzero(incoming):
                lane = lane_slice.start + int(local_lane)
                style = int(hit_style[lane, attacker])
                prayer = int(effective[lane, subject])
                dx = abs(int(
                    self.state.x[lane, attacker]
                    - self.state.x[lane, subject]))
                dy = abs(int(
                    self.state.y[lane, attacker]
                    - self.state.y[lane, subject]))
                self.lane_prayer_trace[lane].append({
                    "tick": int(self.world_tick),
                    "style": evaluation.STYLE_NAMES[style],
                    "prayer": self._prayer_name(prayer),
                    "correct": bool(protected[lane, attacker]),
                    "distance": max(dx, dy),
                    "sameTile": dx == 0 and dy == 0,
                    "attackerFrozen": bool(
                        self.state.freeze_ticks[lane, attacker] > 0),
                    "subjectFrozen": bool(
                        self.state.freeze_ticks[lane, subject] > 0),
                    "attackerWeaponId": int(
                        self.state.weapon_id[lane, attacker]),
                })
        return super()._book_roll_prayer(
            fired, hit_style, spec_kind=spec_kind)

    def _apply_prayer(self, defence_action):
        selected = np.asarray(defence_action, dtype=np.int32)
        if selected.shape == (self.n_fights * 2,):
            selected = selected.reshape(self.n_fights, 2)
        elif selected.shape != (self.n_fights, 2):
            raise ValueError("defence_action must have one row per fighter")
        for cell_index, (lane_slice, subject) in enumerate(zip(
                self._trace_lane_slices,
                self._trace_subject_sides,
                strict=True)):
            if self.evaluation._stopped[cell_index]:
                continue
            opponent = 1 - subject
            own_before = np.asarray(self.state.overhead)[lane_slice, subject]
            opponent_before = np.asarray(
                self.state.overhead)[lane_slice, opponent]
            chosen = selected[lane_slice, subject] - schema.DEFENCE_BASE
            for local_lane in range(lane_slice.stop - lane_slice.start):
                lane = lane_slice.start + local_lane
                dx = abs(int(
                    self.state.x[lane, opponent]
                    - self.state.x[lane, subject]))
                dy = abs(int(
                    self.state.y[lane, opponent]
                    - self.state.y[lane, subject]))
                self.lane_decision_prayer_trace[lane].append({
                    "tick": int(self.world_tick),
                    "selectedPrayer": self._prayer_name(
                        int(chosen[local_lane])),
                    "ownPrayerBefore": self._prayer_name(
                        int(own_before[local_lane])),
                    "opponentPrayerBefore": self._prayer_name(
                        int(opponent_before[local_lane])),
                    "distance": max(dx, dy),
                    "sameTile": dx == 0 and dy == 0,
                    "subjectFrozen": bool(
                        self.state.freeze_ticks[lane, subject] > 0),
                    "opponentFrozen": bool(
                        self.state.freeze_ticks[lane, opponent] > 0),
                    "opponentWeaponId": int(
                        self.state.weapon_id[lane, opponent]),
                    **fixed_eval._melee_route_trace_fields(
                        self, lane, opponent, subject),
                })
        return super()._apply_prayer(defence_action)


def _pct(part: int, whole: int) -> float | None:
    return None if whole <= 0 else round(100.0 * part / whole, 3)


def _longest_hold(values: list[str]) -> int:
    longest = 0
    current = 0
    previous = None
    for value in values:
        if value == previous:
            current += 1
        else:
            previous = value
            current = 1
        longest = max(longest, current)
    return longest


def _trace_summary(report: dict, script: str, seed: int) -> dict | None:
    prayer_counts: Counter[str] = Counter()
    weapon_counts: Counter[int] = Counter()
    distances: Counter[int] = Counter()
    decision_switches = 0
    decision_pairs = 0
    wrong_alternations = 0
    wrong_pairs = 0
    longest_decision_hold = 0
    same_tile_decisions = 0
    subject_frozen_decisions = 0
    opponent_frozen_decisions = 0
    usable_lanes = 0

    for cell in report["cells"]:
        for lane, roll_trace in enumerate(cell["lanePrayerTrace"]):
            spec = fixed_eval._terminal_phase_spec(script, lane, seed)
            if spec is None:
                continue
            terminal_start, terminal_style = spec
            if len(roll_trace) <= terminal_start:
                continue
            terminal_name = evaluation.STYLE_NAMES[terminal_style]
            terminal_rolls = [
                row for row in roll_trace[terminal_start:]
                if row["style"] == terminal_name
            ]
            if len(terminal_rolls) < 4:
                continue
            usable_lanes += 1
            after_third = terminal_rolls[3:]
            prayer_counts.update(row["prayer"] for row in after_third)
            wrong = [row for row in after_third if not row["correct"]]
            for previous, current in zip(wrong, wrong[1:]):
                wrong_pairs += 1
                wrong_alternations += previous["prayer"] != current["prayer"]

            terminal_tick = int(terminal_rolls[0]["tick"])
            decisions = [
                row for row in cell["laneDecisionPrayerTrace"][lane]
                if int(row["tick"]) >= terminal_tick
            ]
            selected = [row["selectedPrayer"] for row in decisions]
            longest_decision_hold = max(
                longest_decision_hold, _longest_hold(selected))
            for previous, current in zip(selected, selected[1:]):
                decision_pairs += 1
                decision_switches += previous != current
            for row in decisions:
                weapon_counts[int(row["opponentWeaponId"])] += 1
                distances[int(row["distance"])] += 1
                same_tile_decisions += bool(row["sameTile"])
                subject_frozen_decisions += bool(row["subjectFrozen"])
                opponent_frozen_decisions += bool(row["opponentFrozen"])

    if usable_lanes == 0:
        return None
    fake_ids = {
        gear.ZURIELS_STAFF.item_id,
        gear.VESTAS_LONGSWORD.item_id,
        gear.VOIDWAKER.item_id,
        gear.NOXIOUS_HALBERD.item_id,
    }
    return {
        "usableLanes": usable_lanes,
        "rollPrayerShareAfterThird": {
            name: _pct(prayer_counts[name], sum(prayer_counts.values()))
            for name in (*evaluation.PRAYER_NAMES, "none")
        },
        "wrongPrayerAlternationPct": _pct(
            wrong_alternations, wrong_pairs),
        "decisionPrayerSwitchPct": _pct(
            decision_switches, decision_pairs),
        "longestDecisionPrayerHoldTicks": longest_decision_hold,
        "visibleFakeWeapons": {
            str(item_id): weapon_counts[item_id]
            for item_id in sorted(fake_ids)
            if weapon_counts[item_id] > 0
        },
        "distanceDecisionCounts": {
            str(distance): count
            for distance, count in sorted(distances.items())
        },
        "sameTileDecisions": same_tile_decisions,
        "subjectFrozenDecisions": subject_frozen_decisions,
        "opponentFrozenDecisions": opponent_frozen_decisions,
    }


def _compact(report: dict, script: str, seed: int) -> dict:
    terminal = report.get("persistentTerminalRecovery")
    compact_terminal = None
    if terminal is not None:
        compact_terminal = {
            "afterThird": terminal["distribution"]["afterThird"],
            "byRoleAfterThird": {
                role: terminal["byRole"][role]["afterThird"]
                for role in ("first", "second")
            },
            "unexpectedStyleRolls": terminal["distribution"][
                "unexpectedStyleRolls"],
        }
    return {
        "rollPrayerCorrectPct": report["aggregate"]["rollPrayerCorrectPct"],
        "byIncomingStyle": report["aggregate"][
            "rollPrayerByIncomingStyle"],
        "byRoleIncomingStyle": {
            cell["role"]: cell["metrics"]["rollPrayerByIncomingStyle"]
            for cell in report["cells"]
        },
        "activePrayerShare": report["aggregate"]["activePrayerShare"],
        "terminal": compact_terminal,
        "styleTransition": report.get("honestStyleTransitionRecovery"),
        "trace": _trace_summary(report, script, seed),
        "runtimeSeconds": report["runtimeSeconds"],
    }


def _args_for(
        checkpoint: Path,
        scenario: Scenario,
        index: int,
        device: str,
        quick: bool) -> SimpleNamespace:
    fights = min(12, scenario.fights) if quick else scenario.fights
    return SimpleNamespace(
        candidate=str(checkpoint),
        attack=scenario.attack,
        opponent_defence=scenario.defence,
        fights=fights,
        max_ticks=scenario.ticks,
        distance=scenario.distance_min,
        distance_min=scenario.distance_min,
        distance_max=scenario.distance_max,
        role="both",
        world_id=35 + index % 4,
        seed=165100 + index * 101,
        replay_seed=265100 + index * 103,
        device=device,
        prayer_trace_sustain=True,
        decision_prayer_trace=True,
    )


def _build_vector_cell_tasks(
        scenarios: list[tuple[int, Scenario]],
        quick: bool) -> list[_VectorCellTask]:
    tasks: list[_VectorCellTask] = []
    for scenario_index, scenario in scenarios:
        fights = min(12, scenario.fights) if quick else scenario.fights
        scenario_seed = 165100 + scenario_index * 101
        scenario_replay_seed = 265100 + scenario_index * 103
        for subject in ("candidate", "parent"):
            for role_index, (role, subject_side) in enumerate((
                    ("first", 0), ("second", 1))):
                tasks.append(_VectorCellTask(
                    index=len(tasks),
                    subject=subject,
                    scenario_index=scenario_index,
                    scenario=scenario,
                    role=role,
                    subject_side=subject_side,
                    fights=fights,
                    seed=scenario_seed + role_index * 17,
                    replay_seed=scenario_replay_seed + role_index * 17,
                    world_id=35 + scenario_index % 4))
    return tasks


def _probe_report_from_cells(
        checkpoint: Path,
        task: _VectorCellTask,
        cells: list[dict],
        runtime_seconds: float,
        device: str) -> dict:
    script = fixed_eval.ATTACK_SCRIPT_BY_CHOICE[task.scenario.attack]
    return {
        "schema": "fastsim_fixed_attack_eval.v1",
        "authority": "rapid_screen",
        "promotionAuthority": False,
        "writesTrainingRows": False,
        "runtimeSeconds": round(runtime_seconds, 3),
        "configuration": {
            "candidate": str(checkpoint.resolve()),
            "fixedAttack": task.scenario.attack,
            "opponentDefence": task.scenario.defence,
            "opponentUsesVengeance": task.scenario.use_vengeance,
            "fightsPerRole": task.fights,
            "maxTicks": task.scenario.ticks,
            "distance": task.scenario.distance_min,
            "distanceMin": task.scenario.distance_min,
            "distanceMax": task.scenario.distance_max,
            "role": "both",
            "worldId": task.world_id,
            "seed": 165100 + task.scenario_index * 101,
            "replaySeed": 265100 + task.scenario_index * 103,
            "device": device,
            "prayerTraceSustain": True,
            "decisionPrayerTrace": True,
        },
        "aggregate": fixed_eval._aggregate(cells),
        "persistentRangedRecovery": fixed_eval._persistent_ranged_summary(
            cells,
            script,
            seed=165100 + task.scenario_index * 101),
        "persistentTerminalRecovery": (
            fixed_eval._persistent_terminal_summary(
                cells,
                script,
                seed=165100 + task.scenario_index * 101)),
        "honestStyleTransitionRecovery": (
            fixed_eval._honest_style_transition_summary(
                cells,
                script,
                seed=165100 + task.scenario_index * 101)),
        "cells": cells,
    }


def run_vectorized_matrix(
        scenarios: list[tuple[int, Scenario]],
        candidate_path: Path,
        parent_path: Path,
        candidate_policy,
        parent_policy,
        device: str,
        quick: bool) -> tuple[dict[tuple[int, str], dict], dict]:
    """Run every selected candidate/parent scenario in one CUDA engine."""
    tasks = _build_vector_cell_tasks(scenarios, quick)
    if not tasks:
        return {}, {
            "mode": "single_vectorized_cuda_batch",
            "parallelCells": 0,
            "vectorizedFightLanes": 0,
            "modelCalls": 0,
            "logicalScoreRows": 0,
        }

    lane_slices = []
    subject_sides = []
    cell_max_ticks = []
    cell_templates = []
    side_zero_assignments = []
    side_one_assignments = []
    lane_replay_seeds = []
    lane_replay_bot_indices = []
    offset = 0
    prior_state_history_enabled = any(
        int(getattr(instance, "defence_prayer_head_version", 1)) >= 3
        for instance in (candidate_policy, parent_policy))
    subject_policies = {
        "candidate": candidate_policy,
        "parent": parent_policy,
    }
    for task in tasks:
        lane_slice = slice(offset, offset + task.fights)
        lane_slices.append(lane_slice)
        subject_sides.append(task.subject_side)
        cell_max_ticks.append(task.scenario.ticks)
        # The prayer head reads sixteen prior complete fight states. Evaluate
        # it while the candidate's other channels behave normally so its own
        # gear, attacks, movement, and supplies match live inference context.
        subject_policy = subject_policies[task.subject]
        script = fixed_eval.ATTACK_SCRIPT_BY_CHOICE[task.scenario.attack]
        fixed = _ScriptedSidePolicy(
            script,
            task.scenario.defence,
            165100 + task.scenario_index * 101,
            1 - task.subject_side,
            task.fights,
            use_vengeance=task.scenario.use_vengeance)

        flat_start = 2 * lane_slice.start
        flat_stop = 2 * lane_slice.stop
        side_zero_rows = np.arange(
            flat_start, flat_stop, 2, dtype=np.intp)
        side_one_rows = np.arange(
            flat_start + 1, flat_stop, 2, dtype=np.intp)
        if task.subject_side == 0:
            side_zero_assignments.append((subject_policy, side_zero_rows))
            side_one_assignments.append((fixed, side_one_rows))
        else:
            side_zero_assignments.append((fixed, side_zero_rows))
            side_one_assignments.append((subject_policy, side_one_rows))

        cell_templates.append(state.BatchState.new(
            task.fights,
            np.random.default_rng(task.seed),
            start_distance_min=task.scenario.distance_min,
            start_distance_max=task.scenario.distance_max,
            world_id=task.world_id,
            lane_radius=3,
            defence_prayer_prior_state_history=
                prior_state_history_enabled))
        lane_replay_seeds.extend([task.replay_seed] * task.fights)
        lane_replay_bot_indices.extend(
            (fight * 2, fight * 2 + 1)
            for fight in range(task.fights))
        offset = lane_slice.stop

    side_zero_policy = paired_eval._RoutedPolicy(side_zero_assignments)
    side_one_policy = paired_eval._RoutedPolicy(side_one_assignments)
    started = time.time()
    runner = _GroupedPrayerTraceEngine(
        n_fights=offset,
        policy=side_zero_policy,
        opponent_policy=side_one_policy,
        lane_slices=lane_slices,
        subject_sides=subject_sides,
        cell_max_ticks=cell_max_ticks,
        cell_state_templates=cell_templates,
        lane_replay_seeds=lane_replay_seeds,
        lane_replay_bot_indices=lane_replay_bot_indices,
        seed=tasks[0].seed,
        replay_seed=tasks[0].replay_seed,
        epsilon=0.0,
        max_ticks=max(cell_max_ticks),
        start_distance_min=min(
            task.scenario.distance_min for task in tasks),
        start_distance_max=max(
            task.scenario.distance_max for task in tasks),
        world_id=tasks[0].world_id,
        lane_radius=3,
        episodes_per_lane=1)
    runner.run(on_record=lambda _record: None)
    runtime_seconds = time.time() - started

    cells_by_key: dict[tuple[int, str], list[dict]] = {}
    first_task_by_key: dict[tuple[int, str], _VectorCellTask] = {}
    for task, lane_slice, collector in zip(
            tasks, lane_slices, runner.evaluation.collectors, strict=True):
        key = (task.scenario_index, task.subject)
        first_task_by_key.setdefault(key, task)
        cells_by_key.setdefault(key, []).append({
            "role": task.role,
            "metrics": collector.report(),
            "lanePrayerTrace": runner.lane_prayer_trace[
                lane_slice.start:lane_slice.stop],
            "laneDecisionPrayerTrace": runner.lane_decision_prayer_trace[
                lane_slice.start:lane_slice.stop],
        })

    checkpoint_paths = {
        "candidate": candidate_path,
        "parent": parent_path,
    }
    reports = {
        key: _probe_report_from_cells(
            checkpoint_paths[key[1]],
            first_task_by_key[key],
            cells,
            runtime_seconds,
            device)
        for key, cells in cells_by_key.items()
    }
    return reports, {
        "mode": "single_vectorized_cuda_batch",
        "parallelCells": len(tasks),
        "vectorizedFightLanes": offset,
        "modelCalls": (
            side_zero_policy.model_calls + side_one_policy.model_calls),
        "logicalScoreRows": (
            side_zero_policy.logical_rows + side_one_policy.logical_rows),
        "runtimeSeconds": round(runtime_seconds, 3),
    }


def _failure(failures: list[dict], scenario: str, reason: str) -> None:
    failures.append({"scenario": scenario, "reason": reason})


def _gate_repeated_ranged(
        name: str,
        candidate: dict,
        parent: dict,
        expected_lanes: int,
        require_only_terminal_style: bool,
        minimum_after_third_pct: float,
        failures: list[dict]) -> None:
    terminal = candidate.get("terminal")
    if terminal is None:
        _failure(failures, name, "missing persistent terminal summary")
        return
    after = terminal["afterThird"]
    role_values = [
        terminal["byRoleAfterThird"][role]["correctPct"]
        for role in ("first", "second")
    ]
    parent_terminal = parent.get("terminal") or {}
    parent_after = parent_terminal.get("afterThird", {})
    parent_value = parent_after.get("correctPct")
    parent_role_values = [
        parent_terminal.get("byRoleAfterThird", {})
        .get(role, {}).get("correctPct")
        for role in ("first", "second")
    ]
    lane_limit = math.floor(0.05 * max(1, after["usableLanes"]))
    checks = (
        (after["usableLanes"] >= math.ceil(0.95 * expected_lanes),
         f"only {after['usableLanes']}/{expected_lanes} lanes usable"),
        (after["correctPct"] is not None
         and after["correctPct"] >= minimum_after_third_pct,
         f"after-third accuracy {after['correctPct']} < "
         f"{minimum_after_third_pct:g}"),
        (parent_value is None or (
            after["correctPct"] is not None
            and after["correctPct"] >= parent_value - 3.0),
         f"after-third accuracy regressed more than 3 points from {parent_value}"),
        (after["medianPct"] is not None and after["medianPct"] >= 75.0,
         f"lane median {after['medianPct']} < 75"),
        (after["p10Pct"] is not None and after["p10Pct"] >= 50.0,
         f"lane p10 {after['p10Pct']} < 50"),
        (all(value is not None and value >= 65.0 for value in role_values),
         f"role accuracy below 65: {role_values}"),
        (all(
            reference is None or (
                value is not None and value >= reference - 5.0)
            for value, reference in zip(role_values, parent_role_values)),
         f"role accuracy regressed more than 5 points from {parent_role_values}"),
        (after["lanesBelow50Pct"] <= lane_limit,
         f"{after['lanesBelow50Pct']} lanes below 50; limit {lane_limit}"),
        (after["zeroCorrectLanes"] == 0,
         f"{after['zeroCorrectLanes']} zero-correct lanes"),
        (after["lanesWithFourMissStreak"] == 0,
         f"{after['lanesWithFourMissStreak']} lanes have four-miss streaks"),
        (not require_only_terminal_style
         or terminal["unexpectedStyleRolls"] == 0,
         f"{terminal['unexpectedStyleRolls']} unexpected terminal styles"),
    )
    for passed, reason in checks:
        if not passed:
            _failure(failures, name, reason)


def _gate_honest_style_transitions(
        name: str,
        candidate: dict,
        expected_lanes: int,
        failures: list[dict]) -> None:
    summary = candidate.get("styleTransition")
    if summary is None:
        _failure(failures, name, "missing honest style-transition summary")
        return

    distribution = summary["distribution"]
    cold_opening = summary["coldOpeningPriorDecisionStates"]
    expected_blocks = expected_lanes * 2
    checks = (
        (distribution["blockCount"] == expected_blocks,
         f"only {distribution['blockCount']}/{expected_blocks} blocks present"),
        (distribution["completeEligibleBlocks"]
         == distribution["eligibleBlocks"],
         f"only {distribution['completeEligibleBlocks']}/"
         f"{distribution['eligibleBlocks']} reachable blocks complete"),
        (distribution["minimumEligibleBlockRolls"]
         >= scripted_policy.HONEST_STYLE_TRANSITION_B_ROLLS,
         "shortest reachable B block has "
         f"{distribution['minimumEligibleBlockRolls']} rolls"),
        (distribution["lanesWithFourMissStreak"] == 0,
         f"{distribution['lanesWithFourMissStreak']} B blocks have a "
         "four-miss streak"),
        (distribution["unexpectedStyleRolls"] == 0,
         f"{distribution['unexpectedStyleRolls']} B rolls use the wrong style"),
        (distribution["dishonestWeaponRolls"] == 0,
         f"{distribution['dishonestWeaponRolls']} B rolls use dishonest gear"),
        (distribution["dishonestDecisionWeaponTicks"] == 0,
         f"{distribution['dishonestDecisionWeaponTicks']} B-block cooldown "
         "decisions show the wrong weapon"),
    )
    for passed, reason in checks:
        if not passed:
            _failure(failures, name, reason)

    measured_or_blocked = (
        cold_opening["measuredLanes"]
        + cold_opening["unmeasuredRouteBlockedPrefixLanes"])
    if (
            cold_opening["laneCount"] != expected_lanes
            or measured_or_blocked != expected_lanes):
        _failure(
            failures, name,
            "cold-opening decision history is missing lanes: "
            f"measured={cold_opening['measuredLanes']} "
            "routeBlockedPrefix="
            f"{cold_opening['unmeasuredRouteBlockedPrefixLanes']} "
            f"expected={expected_lanes}")
    if cold_opening["lanesAtOrAbove16"] != 0:
        _failure(
            failures, name,
            f"{cold_opening['lanesAtOrAbove16']} cold openings already have "
            "16 or more prior model decisions")

    for repeat in ("cold", "warm"):
        block = summary["byRepeat"][repeat]
        if block["blockCount"] != expected_lanes:
            _failure(
                failures, name,
                f"{repeat} repeat has {block['blockCount']}/"
                f"{expected_lanes} blocks")
        if block["completeEligibleBlocks"] != block["eligibleBlocks"]:
            _failure(
                failures, name,
                f"{repeat} repeat has only "
                f"{block['completeEligibleBlocks']}/"
                f"{block['eligibleBlocks']} reachable complete blocks")
        if block["longestMissStreak"] >= 4:
            _failure(
                failures, name,
                f"{repeat} repeat longest miss streak is "
                f"{block['longestMissStreak']}")

    transitions = (
        "magic->ranged",
        "magic->melee",
        "ranged->magic",
        "ranged->melee",
        "melee->magic",
        "melee->ranged",
    )
    expected_per_transition = expected_blocks // len(transitions)
    for transition in transitions:
        block = summary["byTransition"].get(transition)
        if block is None or block["blockCount"] != expected_per_transition:
            count = None if block is None else block["blockCount"]
            _failure(
                failures, name,
                f"{transition} has {count}/{expected_per_transition} blocks")

    expected_variants = {
        (transition, prefix)
        for transition in transitions
        for prefix in (1, 2, 3)
    }
    blocks = summary["blocks"]
    for block in blocks:
        excluded = bool(block.get("excludedRouteBlocked", False))
        prefix_route_exclusion = (
            block.get("fromStyle") == "melee"
            and block.get("routeBlockedReason") in (
                "melee_a_prefix_route_blocked_before_b",
                "not_reached_after_melee_a_prefix_route_block"))
        if (
                excluded
                and block["toStyle"] != "melee"
                and not prefix_route_exclusion):
            _failure(
                failures, name,
                "non-melee block was incorrectly route-excluded: "
                f"{block['role']}/{block['lane']}/{block['repeat']}/"
                f"{block['transition']}")
        if (
                not excluded
                and block["rolls"]
                < scripted_policy.HONEST_STYLE_TRANSITION_B_ROLLS):
            _failure(
                failures, name,
                "reachable block is incomplete: "
                f"{block['role']}/{block['lane']}/{block['repeat']}/"
                f"{block['transition']} has {block['rolls']} rolls")
        if (
                excluded
                and block.get("routeBlockedReason") not in (
                    "stable_unreachable_halberd_route",
                    "not_reached_after_cold_route_block",
                    "melee_a_prefix_route_blocked_before_b",
                    "not_reached_after_melee_a_prefix_route_block")):
            _failure(
                failures, name,
                "route-excluded block lacks mechanical evidence: "
                f"{block['role']}/{block['lane']}/{block['repeat']}")
    for role in ("first", "second"):
        for repeat in ("cold", "warm"):
            observed = {
                (block["transition"], int(block["prefixRolls"]))
                for block in blocks
                if block["role"] == role and block["repeat"] == repeat
            }
            if observed != expected_variants:
                missing = sorted(expected_variants - observed)
                _failure(
                    failures, name,
                    f"{role}/{repeat} is missing transition variants "
                    f"{missing}")

    distances = distribution["distances"]
    if not distances or min(distances) > 2 or max(distances) < 5:
        _failure(
            failures, name,
            f"B-roll distance coverage is not varied close/far: {distances}")
    prayers = set(distribution["opponentPrayers"])
    expected_prayers = set(evaluation.PRAYER_NAMES[:3])
    if not expected_prayers.issubset(prayers):
        _failure(
            failures, name,
            "B rolls did not cover all varied opponent prayers: "
            f"{sorted(prayers)}")


def _gate_scenario(
        scenario: Scenario,
        candidate: dict,
        parent: dict,
        failures: list[dict]) -> None:
    name = scenario.name
    if scenario.kind == "honest-transition":
        _gate_honest_style_transitions(
            name, candidate, scenario.fights * 2, failures)
        return
    if scenario.kind in ("fixed-ranged", "fixed-style"):
        style = str(scenario.target_style)
        value = candidate["byIncomingStyle"][style]["correctPct"]
        parent_value = parent["byIncomingStyle"][style]["correctPct"]
        if value is None or value < 90.0:
            _failure(failures, name, f"{style} fixed-style accuracy {value} < 90")
        if value is not None and parent_value is not None and value < parent_value - 2.0:
            _failure(
                failures, name,
                f"{style} regressed {round(parent_value - value, 3)} points")
        role_values = [
            candidate["byRoleIncomingStyle"][role][style]["correctPct"]
            for role in ("first", "second")
        ]
        parent_role_values = [
            parent["byRoleIncomingStyle"][role][style]["correctPct"]
            for role in ("first", "second")
        ]
        if any(value is None or value < 88.0 for value in role_values):
            _failure(failures, name, f"{style} role accuracy below 88: {role_values}")
        if any(
                reference is not None and (
                    value is None or value < reference - 3.0)
                for value, reference in zip(role_values, parent_role_values)):
            _failure(
                failures, name,
                f"{style} role accuracy regressed more than 3 points from "
                f"{parent_role_values}")
        if scenario.kind == "fixed-ranged":
            _gate_repeated_ranged(
                name,
                candidate,
                parent,
                scenario.fights * 2,
                True,
                90.0,
                failures)
        return

    if scenario.kind in ("repeated-ranged", "interrupted-ranged"):
        _gate_repeated_ranged(
            name,
            candidate,
            parent,
            scenario.fights * 2,
            scenario.kind == "repeated-ranged",
            70.0,
            failures)
        return

    overall_value = candidate["rollPrayerCorrectPct"]
    parent_overall_value = parent["rollPrayerCorrectPct"]
    if overall_value is None or overall_value < 30.0:
        _failure(
            failures, name,
            f"mixed overall accuracy {overall_value} < 30")
    if (
            overall_value is not None
            and parent_overall_value is not None
            and overall_value < parent_overall_value - 2.0):
        _failure(
            failures, name,
            f"mixed overall accuracy regressed "
            f"{round(parent_overall_value - overall_value, 3)} points")

    for style in evaluation.STYLE_NAMES:
        value = candidate["byIncomingStyle"][style]["correctPct"]
        parent_value = parent["byIncomingStyle"][style]["correctPct"]
        rows = candidate["byIncomingStyle"][style]["rolls"]
        if rows >= 20 and (value is None or value < 25.0):
            _failure(failures, name, f"{style} mixed accuracy {value} < 25")
        if (
                rows >= 20
                and value is not None
                and parent_value is not None
                and value < parent_value - 3.0):
            _failure(
                failures, name,
                f"{style} regressed {round(parent_value - value, 3)} points")
        role_rows = [
            candidate["byRoleIncomingStyle"][role][style]["rolls"]
            for role in ("first", "second")
        ]
        role_values = [
            candidate["byRoleIncomingStyle"][role][style]["correctPct"]
            for role in ("first", "second")
        ]
        parent_role_values = [
            parent["byRoleIncomingStyle"][role][style]["correctPct"]
            for role in ("first", "second")
        ]
        if any(rows < 20 for rows in role_rows):
            _failure(
                failures, name,
                f"{style} has insufficient per-role coverage: {role_rows}")
            continue
        if any(value is None or value < 20.0 for value in role_values):
            _failure(
                failures, name,
                f"{style} mixed role accuracy below 20: {role_values}")
        if any(
                reference is not None and (
                    value is None or value < reference - 5.0)
                for value, reference in zip(role_values, parent_role_values)):
            _failure(
                failures, name,
                f"{style} mixed role accuracy regressed more than 5 points "
                f"from {parent_role_values}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--parent", type=Path, required=True)
    parser.add_argument("--device", choices=("cuda",), default="cuda")
    parser.add_argument("--quick", action="store_true")
    parser.add_argument(
        "--scenario",
        action="append",
        choices=tuple(scenario.name for scenario in SCENARIOS),
        help="Run only this named scenario; repeat to select several.",
    )
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    candidate_path = args.candidate.resolve()
    parent_path = args.parent.resolve()
    for path in (candidate_path, parent_path):
        if not path.is_file():
            parser.error(f"checkpoint does not exist: {path}")

    candidate_policy = policy.Policy.load(
        candidate_path, device=args.device,
        compatible_input_sizes=fixed_eval.JAVA_COMPATIBLE_ANCHOR_INPUTS)
    parent_policy = policy.Policy.load(
        parent_path, device=args.device,
        compatible_input_sizes=fixed_eval.JAVA_COMPATIBLE_ANCHOR_INPUTS)
    started = time.time()
    results = []
    failures: list[dict] = []
    selected = set(args.scenario or ())
    scenarios = [
        (index, scenario)
        for index, scenario in enumerate(SCENARIOS)
        if not selected or scenario.name in selected
    ]
    complete_suite = {
        scenario.name for _index, scenario in scenarios
    } == {
        scenario.name for scenario in SCENARIOS
    }
    vectorized_reports, execution = run_vectorized_matrix(
        scenarios,
        candidate_path,
        parent_path,
        candidate_policy,
        parent_policy,
        args.device,
        args.quick)
    for index, scenario in scenarios:
        candidate_args = _args_for(
            candidate_path, scenario, index, args.device, args.quick)
        parent_args = _args_for(
            parent_path, scenario, index, args.device, args.quick)
        candidate_report = vectorized_reports[(index, "candidate")]
        parent_report = vectorized_reports[(index, "parent")]
        script = fixed_eval.ATTACK_SCRIPT_BY_CHOICE[scenario.attack]
        candidate_compact = _compact(
            candidate_report, script, candidate_args.seed)
        parent_compact = _compact(parent_report, script, parent_args.seed)
        before = len(failures)
        if not args.quick:
            _gate_scenario(
                scenario, candidate_compact, parent_compact, failures)
        results.append({
            "name": scenario.name,
            "attack": scenario.attack,
            "kind": scenario.kind,
            "fightsPerRole": candidate_args.fights,
            "distanceMin": scenario.distance_min,
            "distanceMax": scenario.distance_max,
            "seed": candidate_args.seed,
            "candidate": candidate_compact,
            "parent": parent_compact,
            "failures": failures[before:],
        })

    report = {
        "schema": "fastsim_prayer_adaptation_matrix.v1",
        "promotionAuthority": bool(not args.quick and complete_suite),
        "passed": (
            not failures if not args.quick and complete_suite else None),
        "candidate": str(candidate_path),
        "parent": str(parent_path),
        "quick": bool(args.quick),
        "runtimeSeconds": round(time.time() - started, 3),
        "execution": execution,
        "thresholds": {
            "fixedStylePct": 90.0,
            "fixedStyleMaxRegressionPoints": 2.0,
            "fixedStyleRolePct": 88.0,
            "fixedStyleRoleMaxRegressionPoints": 3.0,
            "fixedRangedAfterThirdPct": 90.0,
            "repeatedRangedAfterThirdPct": 70.0,
            "repeatedRangedMaxRegressionPoints": 3.0,
            "repeatedRangedRolePct": 65.0,
            "repeatedRangedRoleMaxRegressionPoints": 5.0,
            "repeatedRangedMinimumUsableLaneShare": 0.95,
            "repeatedRangedLaneMedianPct": 75.0,
            "repeatedRangedLaneP10Pct": 50.0,
            "repeatedRangedMaxLanesBelow50Share": 0.05,
            "repeatedRangedZeroCorrectLanes": 0,
            "repeatedRangedFourMissStreakLanes": 0,
            "honestTransitionBlockRolls": (
                scripted_policy.HONEST_STYLE_TRANSITION_B_ROLLS),
            "honestTransitionFourMissStreakLanes": 0,
            "mixedOverallFloorPct": 30.0,
            "mixedOverallMaxRegressionPoints": 2.0,
            "mixedPerStyleFloorPct": 25.0,
            "mixedMaxRegressionPoints": 3.0,
            "mixedRolePerStyleFloorPct": 20.0,
            "mixedRoleMaxRegressionPoints": 5.0,
            "mixedMinimumRollsPerRoleStyle": 20,
        },
        "failures": failures,
        "scenarios": results,
    }
    output = args.out.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "passed": report["passed"],
        "failures": failures,
        "runtimeSeconds": report["runtimeSeconds"],
        "output": str(output),
    }, indent=2))
    return 0 if args.quick or not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())
