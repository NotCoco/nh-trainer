#!/usr/bin/env python3
"""Evaluate one checkpoint against a deliberately simple fixed attack.

Neural-vs-neural screens can hide failures against predictable opponents
because both policies keep changing style.  This tool supplies the missing
sanity check: the opponent repeatedly uses one ordinary style, or spends its
available VLS special attacks, while the candidate remains unchanged.

This is evaluation-only.  It does not write NHRL training rows.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import evaluation, gear, policy, schema, scripted_policy  # noqa: E402


JAVA_COMPATIBLE_ANCHOR_INPUTS = (110, 111, 112)
ATTACK_SCRIPT_BY_CHOICE = {
    "magic": "fixed-magic",
    "ranged": "fixed-ranged",
    "melee": "fixed-melee",
    "halberd": "fixed-halberd",
    "magic-halberd": "magic-then-halberd",
    "magic1-halberd": "one-magic-then-halberd",
    "vls": "vls-pressure",
    "voidwaker": "voidwaker-pressure",
    "adaptive": "adaptive-off-prayer",
    "adaptive-random": "adaptive-random-off-prayer",
    "random": "hidden-random-style",
    "block-switch": "seeded-block-switch",
    "rapid-switch": "seeded-rapid-switch",
    "freeze-stepout-halberd": "freeze-stepout-halberd",
    "varied-opener-then-persistent-ranged": (
        "varied-opener-then-persistent-ranged"),
    "varied-opener-then-persistent-balanced": (
        "varied-opener-then-persistent-balanced"),
    "seeded-varied-prefix-then-persistent-ranged": (
        "seeded-varied-prefix-then-persistent-ranged"),
    "seeded-varied-prefix-then-persistent-balanced": (
        "seeded-varied-prefix-then-persistent-balanced"),
    "seeded-long-mr-prefix-then-persistent-balanced": (
        "seeded-long-mr-prefix-then-persistent-balanced"),
    "seeded-mixed-then-ranged-pressure": (
        "seeded-mixed-then-ranged-pressure"),
    "seeded-mixed-then-balanced-pressure": (
        "seeded-mixed-then-balanced-pressure"),
    "seeded-recurring-three-style-blocks": (
        "seeded-recurring-three-style-blocks"),
    "seeded-three-style-then-ranged-gear-fakes": (
        "seeded-three-style-then-ranged-gear-fakes"),
    "seeded-ranged-phase-balanced-gear-fakes": (
        "seeded-ranged-phase-balanced-gear-fakes"),
    "seeded-ranged-multigear-movement-pressure": (
        "seeded-ranged-multigear-movement-pressure"),
    "seeded-complete-history-balanced-pressure": (
        "seeded-complete-history-balanced-pressure"),
    "live-rmm-then-persistent-ranged": (
        "live-rmm-then-persistent-ranged"),
    "live-mmmrm-then-persistent-ranged": (
        "live-mmmrm-then-persistent-ranged"),
    "live-magic-melee-then-persistent-ranged": (
        "live-magic-melee-then-persistent-ranged"),
    "live-human-ranged-pressure": (
        "live-human-ranged-pressure"),
    "live-human-ranged-pressure-fullgear": (
        "live-human-ranged-pressure-fullgear"),
    "live-human-recurring-ranged-pressure-fullgear": (
        "live-human-recurring-ranged-pressure-fullgear"),
    "seeded-comprehensive-human-ranged-pressure": (
        "seeded-comprehensive-human-ranged-pressure"),
    "honest-gear-style-transitions": (
        "honest-gear-style-transitions"),
    "live-ranged-gear-flick-pressure": (
        "live-ranged-gear-flick-pressure"),
    "heldout-ranged-multigear-movement-a": (
        "heldout-ranged-multigear-movement-a"),
    "heldout-ranged-multigear-movement-b": (
        "heldout-ranged-multigear-movement-b"),
    "none": "passive",
}
ATTACK_CHOICES = tuple(ATTACK_SCRIPT_BY_CHOICE)


class _DefenceOnlyPolicy:
    """Keep a model's prayer decision while freezing its other channels."""

    def __init__(self, wrapped):
        self._wrapped = wrapped
        self.action_count = wrapped.action_count
        self.action_ids = wrapped.action_ids
        self.input_size = getattr(wrapped, "input_size", schema.INPUT_SIZE)
        self.defence_prayer_head_version = int(getattr(
            wrapped, "defence_prayer_head_version", 1))

    def score(self, *args, **kwargs):
        scores, values = self._wrapped.score(*args, **kwargs)
        scores = np.asarray(scores, dtype=np.float32).copy()
        scores[:, schema.COMBAT_BASE:
               schema.COMBAT_BASE + schema.COMBAT_COUNT] = -100.0
        scores[:, schema.COMBAT_NO_ATTACK] = 100.0
        scores[:, schema.MOVEMENT_BASE:
               schema.MOVEMENT_BASE + schema.MOVEMENT_COUNT] = -100.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        scores[:, schema.SUPPLY_BASE:
               schema.SUPPLY_BASE + schema.SUPPLY_COUNT] = -100.0
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 100.0
        scores[:, schema.GEAR_BASE:] = -100.0
        return scores, values


class _ForcedPrayerPolicy:
    """Evaluation-only static prayer benchmark around a complete policy."""

    _LOCAL_BY_NAME = {
        "magic": schema.PRAY_PROTECT_MAGIC,
        "ranged": schema.PRAY_PROTECT_MISSILES,
        "melee": schema.PRAY_PROTECT_MELEE,
    }

    def __init__(self, wrapped, prayer: str):
        self._wrapped = wrapped
        self._local = self._LOCAL_BY_NAME[prayer]

    def __getattr__(self, name):
        return getattr(self._wrapped, name)

    def score(self, *args, **kwargs):
        scores, values = self._wrapped.score(*args, **kwargs)
        scores = np.asarray(scores, dtype=np.float32).copy()
        start = schema.DEFENCE_BASE
        scores[:, start:start + schema.DEFENCE_COUNT] = -1.0e6
        scores[:, start + self._local] = 1.0e6
        return scores, values

    def condition_direct_gear(self, *args, **kwargs):
        return self._wrapped.condition_direct_gear(*args, **kwargs)


def _melee_route_trace_fields(runner, lane: int, attacker: int, target: int):
    rel_dx = int(
        runner.state.x[lane, target] - runner.state.x[lane, attacker])
    rel_dy = int(
        runner.state.y[lane, target] - runner.state.y[lane, attacker])
    distance = max(abs(rel_dx), abs(rel_dy))
    flat_row = lane * 2 + attacker
    legal_mask = runner._current_roll_context["legal_mask"][flat_row]
    improving_legal = False
    for local in range(schema.MOVE_OFFSET_BASE, schema.MOVEMENT_COUNT):
        dx, dy = schema.MOVEMENT_OFFSETS[local]
        remaining = max(abs(rel_dx - int(dx)), abs(rel_dy - int(dy)))
        if (
                remaining < distance
                and bool(legal_mask[schema.MOVEMENT_BASE + local])):
            improving_legal = True
            break
    return {
        "opponentLockTicks": int(runner.state.lock_ticks[lane, attacker]),
        "opponentX": int(runner.state.x[lane, attacker]),
        "opponentY": int(runner.state.y[lane, attacker]),
        "subjectX": int(runner.state.x[lane, target]),
        "subjectY": int(runner.state.y[lane, target]),
        "opponentImprovingMeleeMoveLegal": improving_legal,
    }


class _PrayerTraceEngine(evaluation.EvaluationEngine):
    """Record per-lane incoming roll prayer without changing simulation."""

    def __init__(self, *args, **kwargs):
        self._prayer_trace_sustain = bool(
            kwargs.pop("prayer_trace_sustain", False))
        self._decision_prayer_trace_enabled = bool(
            kwargs.pop("decision_prayer_trace", False))
        super().__init__(*args, **kwargs)
        self.lane_prayer_trace = [
            [] for _lane in range(self.n_fights)]
        self.lane_decision_prayer_trace = [
            [] for _lane in range(self.n_fights)]

    def step(self):
        if self._prayer_trace_sustain:
            # Keep a normal full-health observation while preventing either
            # side from ending the diagnostic before the persistent phase.
            # Combat, timing, movement, gear, prayer and attack rolls remain
            # the real engine path; only accumulated hitpoint loss is cleared.
            self.state.hp[self.state.alive] = 99
        return super().step()

    def _book_roll_prayer(self, fired, hit_style, spec_kind=None):
        fired = np.asarray(fired, dtype=bool)
        hit_style = np.asarray(hit_style)
        subject = self.evaluation.subject_side
        attacker = 1 - subject
        incoming = fired[:, attacker]
        if np.any(incoming):
            protected = self._protected_at_roll(hit_style, fired)
            effective = self._effective_overhead()
            for lane in np.flatnonzero(incoming):
                lane = int(lane)
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
                    "prayer": (
                        evaluation.PRAYER_NAMES[
                            prayer - schema.PRAY_PROTECT_MAGIC]
                        if (
                            schema.PRAY_PROTECT_MAGIC
                            <= prayer
                            <= schema.PRAY_PROTECT_MELEE)
                        else "none"
                    ),
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

    @staticmethod
    def _prayer_name(prayer: int) -> str:
        if schema.PRAY_PROTECT_MAGIC <= prayer <= schema.PRAY_PROTECT_MELEE:
            return evaluation.PRAYER_NAMES[
                prayer - schema.PRAY_PROTECT_MAGIC]
        return "none"

    def _apply_prayer(self, defence_action):
        if self._decision_prayer_trace_enabled:
            selected = np.asarray(defence_action, dtype=np.int32)
            if selected.shape == (self.n_fights * 2,):
                selected = selected.reshape(self.n_fights, 2)
            elif selected.shape != (self.n_fights, 2):
                raise ValueError(
                    "defence_action must have one row per fighter")
            subject = self.evaluation.subject_side
            opponent = 1 - subject
            own_before = np.asarray(self.state.overhead)[:, subject]
            opponent_before = np.asarray(self.state.overhead)[:, opponent]
            chosen = selected[:, subject] - schema.DEFENCE_BASE
            for lane in range(self.n_fights):
                dx = abs(int(
                    self.state.x[lane, opponent]
                    - self.state.x[lane, subject]))
                dy = abs(int(
                    self.state.y[lane, opponent]
                    - self.state.y[lane, subject]))
                self.lane_decision_prayer_trace[lane].append({
                    "tick": int(self.world_tick),
                    "selectedPrayer": self._prayer_name(int(chosen[lane])),
                    "ownPrayerBefore": self._prayer_name(
                        int(own_before[lane])),
                    "opponentPrayerBefore": self._prayer_name(
                        int(opponent_before[lane])),
                    "distance": max(dx, dy),
                    "sameTile": dx == 0 and dy == 0,
                    "subjectFrozen": bool(
                        self.state.freeze_ticks[lane, subject] > 0),
                    "opponentFrozen": bool(
                        self.state.freeze_ticks[lane, opponent] > 0),
                    "opponentWeaponId": int(
                        self.state.weapon_id[lane, opponent]),
                    **_melee_route_trace_fields(
                        self, lane, opponent, subject),
                })
        return super()._apply_prayer(defence_action)


def _pct(part: int, whole: int) -> float | None:
    if whole <= 0:
        return None
    return round(100.0 * part / whole, 3)


def _terminal_phase_spec(
        script: str,
        lane_index: int,
        seed: int | None) -> tuple[int, int] | None:
    if script == "fixed-magic":
        return 0, schema.STYLE_MAGIC
    if script == "fixed-ranged":
        return 0, schema.STYLE_RANGED
    if script in ("fixed-melee", "fixed-halberd"):
        return 0, schema.STYLE_MELEE
    if script == "varied-opener-then-persistent-ranged":
        return 10, schema.STYLE_RANGED
    if script == "varied-opener-then-persistent-balanced":
        if seed is None:
            raise ValueError("seed is required for a balanced terminal style")
        return 10, (lane_index + seed) % 3
    if script in (
            "seeded-varied-prefix-then-persistent-ranged",
            "seeded-varied-prefix-then-persistent-balanced"):
        if seed is None:
            raise ValueError(
                "seed is required for a seeded persistent phase boundary")
        start = (lane_index + seed * 5) % 11
        terminal = (
            (lane_index + seed) % 3
            if script.endswith("-balanced")
            else schema.STYLE_RANGED)
        return start, terminal
    if script == "seeded-long-mr-prefix-then-persistent-balanced":
        if seed is None:
            raise ValueError(
                "seed is required for a seeded persistent phase boundary")
        lane = np.asarray([lane_index], dtype=np.int64)
        start = int(
            scripted_policy.ScriptedPolicy.seeded_long_prefix_lengths(
                lane, seed)[0])
        terminal = int(
            scripted_policy.ScriptedPolicy.seeded_long_terminal_styles(
                lane, seed)[0])
        return start, terminal
    if script in (
            "seeded-mixed-then-ranged-pressure",
            "seeded-mixed-then-balanced-pressure"):
        if seed is None:
            raise ValueError(
                "seed is required for a seeded pressure phase boundary")
        lane = np.asarray([lane_index], dtype=np.int64)
        start = int(
            scripted_policy.ScriptedPolicy.seeded_pressure_prefix_lengths(
                lane, seed)[0])
        terminal = (
            int(
                scripted_policy.ScriptedPolicy.seeded_long_terminal_styles(
                    lane, seed)[0])
            if script.endswith("-balanced-pressure")
            else schema.STYLE_RANGED
        )
        return start, terminal
    if script == "live-rmm-then-persistent-ranged":
        return 3, schema.STYLE_RANGED
    if script == "live-mmmrm-then-persistent-ranged":
        return 5, schema.STYLE_RANGED
    if script == "live-magic-melee-then-persistent-ranged":
        return 2, schema.STYLE_RANGED
    if script in (
            "live-human-ranged-pressure",
            "live-human-ranged-pressure-fullgear"):
        return 3, schema.STYLE_RANGED
    if script == "live-human-recurring-ranged-pressure-fullgear":
        return 16, schema.STYLE_RANGED
    if script in (
            "seeded-three-style-then-ranged-gear-fakes",
            "seeded-ranged-phase-balanced-gear-fakes",
            "seeded-ranged-multigear-movement-pressure"):
        if seed is None:
            raise ValueError(
                "seed is required for a seeded gear-fake phase boundary")
        lane = np.asarray([lane_index], dtype=np.int64)
        start = int(
            scripted_policy.ScriptedPolicy
            .seeded_ranged_fake_prefix_lengths(lane, seed)[0])
        return start, schema.STYLE_RANGED
    if script == "live-ranged-gear-flick-pressure":
        return 4, schema.STYLE_RANGED
    if script == "heldout-ranged-multigear-movement-a":
        return 6, schema.STYLE_RANGED
    if script == "heldout-ranged-multigear-movement-b":
        return 7, schema.STYLE_RANGED
    return None


def _terminal_distribution(lanes: list[dict]) -> dict:
    usable = [
        lane for lane in lanes if lane["afterFirstRolls"] > 0]
    rates = np.asarray(
        [lane["afterFirstCorrectPct"] for lane in usable],
        dtype=np.float64)
    rolls = sum(lane["afterFirstRolls"] for lane in usable)
    correct = sum(lane["afterFirstCorrect"] for lane in usable)
    after_third_usable = [
        lane for lane in lanes if lane["afterThirdRolls"] > 0]
    after_third_rates = np.asarray(
        [lane["afterThirdCorrectPct"] for lane in after_third_usable],
        dtype=np.float64)
    after_third_rolls = sum(
        lane["afterThirdRolls"] for lane in after_third_usable)
    after_third_correct = sum(
        lane["afterThirdCorrect"] for lane in after_third_usable)
    return {
        "laneCount": len(lanes),
        "usableLanes": len(usable),
        "rolls": rolls,
        "correct": correct,
        "correctPct": _pct(correct, rolls),
        "minimumPct": (
            round(float(np.min(rates)), 3) if rates.size else None),
        "p10Pct": (
            round(float(np.percentile(rates, 10)), 3)
            if rates.size else None),
        "medianPct": (
            round(float(np.median(rates)), 3) if rates.size else None),
        "lanesBelow50Pct": sum(
            lane["afterFirstCorrectPct"] < 50.0 for lane in usable),
        "lanesBelow70Pct": sum(
            lane["afterFirstCorrectPct"] < 70.0 for lane in usable),
        "zeroCorrectLanes": sum(
            lane["afterFirstCorrect"] == 0 for lane in usable),
        "unexpectedStyleRolls": sum(
            lane["unexpectedStyleRolls"] for lane in lanes),
        "afterThird": {
            "usableLanes": len(after_third_usable),
            "rolls": after_third_rolls,
            "correct": after_third_correct,
            "correctPct": _pct(
                after_third_correct, after_third_rolls),
            "minimumPct": (
                round(float(np.min(after_third_rates)), 3)
                if after_third_rates.size else None),
            "p10Pct": (
                round(float(np.percentile(after_third_rates, 10)), 3)
                if after_third_rates.size else None),
            "medianPct": (
                round(float(np.median(after_third_rates)), 3)
                if after_third_rates.size else None),
            "lanesBelow50Pct": sum(
                lane["afterThirdCorrectPct"] < 50.0
                for lane in after_third_usable),
            "lanesBelow70Pct": sum(
                lane["afterThirdCorrectPct"] < 70.0
                for lane in after_third_usable),
            "zeroCorrectLanes": sum(
                lane["afterThirdCorrect"] == 0
                for lane in after_third_usable),
            "lanesWithFourMissStreak": sum(
                lane["longestMissStreakAfterThird"] >= 4
                for lane in after_third_usable),
            "longestMissStreak": max(
                (
                    lane["longestMissStreakAfterThird"]
                    for lane in after_third_usable
                ),
                default=0),
        },
    }


def _longest_miss_streak(rolls: list[dict]) -> int:
    longest = 0
    current = 0
    for roll in rolls:
        if bool(roll["correct"]):
            current = 0
        else:
            current += 1
            longest = max(longest, current)
    return longest


def _honest_transition_distribution(blocks: list[dict]) -> dict:
    eligible = [
        block for block in blocks
        if not block.get("excludedRouteBlocked", False)
    ]
    completed = [
        block for block in eligible
        if block["rolls"]
        >= scripted_policy.HONEST_STYLE_TRANSITION_B_ROLLS
    ]
    rolls = sum(block["rolls"] for block in eligible)
    correct = sum(block["correct"] for block in eligible)
    distances = sorted({
        distance
        for block in blocks
        for distance in block["distances"]
    })
    opponent_prayers = sorted({
        prayer
        for block in blocks
        for prayer in block["opponentPrayers"]
    })
    return {
        "blockCount": len(blocks),
        "eligibleBlocks": len(eligible),
        "excludedRouteBlockedBlocks": len(blocks) - len(eligible),
        "completeBlocks": sum(
            block["rolls"]
            >= scripted_policy.HONEST_STYLE_TRANSITION_B_ROLLS
            for block in blocks),
        "completeEligibleBlocks": len(completed),
        "minimumEligibleBlockRolls": min(
            (block["rolls"] for block in eligible), default=0),
        "rolls": rolls,
        "correct": correct,
        "correctPct": _pct(correct, rolls),
        "lanesWithFourMissStreak": sum(
            block["longestMissStreak"] >= 4 for block in completed),
        "longestMissStreak": max(
            (block["longestMissStreak"] for block in completed), default=0),
        "unexpectedStyleRolls": sum(
            block["unexpectedStyleRolls"] for block in blocks),
        "dishonestWeaponRolls": sum(
            block["dishonestWeaponRolls"] for block in blocks),
        "decisionWeaponTicks": sum(
            block.get("decisionWeaponTicks", 0) for block in blocks),
        "dishonestDecisionWeaponTicks": sum(
            block.get("dishonestDecisionWeaponTicks", 0)
            for block in blocks),
        "distances": distances,
        "opponentPrayers": opponent_prayers,
    }


def _melee_route_block_evidence(
        decisions: list[dict],
        start_tick: int,
        expected_weapon: int) -> dict:
    longest = 0
    current = 0
    previous_geometry = None
    first_tick = None
    last_tick = None
    for row in decisions:
        tick = int(row["tick"])
        qualifies = (
            tick >= start_tick
            and int(row.get("opponentWeaponId", -1)) == expected_weapon
            and not bool(row.get("opponentFrozen", False))
            and int(row.get("opponentLockTicks", 0)) <= 0
            and int(row.get("distance", 0))
            > gear.NOXIOUS_HALBERD.max_distance
            and not bool(row.get(
                "opponentImprovingMeleeMoveLegal", True)))
        geometry = (
            row.get("opponentX"), row.get("opponentY"),
            row.get("subjectX"), row.get("subjectY"))
        if qualifies and geometry == previous_geometry:
            current += 1
        elif qualifies:
            current = 1
            first_tick = tick
        else:
            current = 0
            first_tick = None
        previous_geometry = geometry if qualifies else None
        if current > longest:
            longest = current
            last_tick = tick
    return {
        "blocked": longest >= 8,
        "stableBlockedDecisionTicks": longest,
        "lastBlockedDecisionTick": last_tick,
    }


def _honest_style_transition_summary(
        cells: list[dict],
        script: str,
        seed: int | None = None) -> dict | None:
    if script != "honest-gear-style-transitions":
        return None
    if seed is None:
        raise ValueError("seed is required for honest style transitions")

    expected_weapon_by_style = {
        schema.STYLE_MAGIC: gear.ZURIELS_STAFF.item_id,
        schema.STYLE_RANGED: gear.ZARYTE_CROSSBOW.item_id,
        schema.STYLE_MELEE: gear.NOXIOUS_HALBERD.item_id,
    }
    blocks = []
    for cell in cells:
        traces = cell["lanePrayerTrace"]
        decision_traces = cell.get("laneDecisionPrayerTrace") or (
            [[] for _lane in traces])
        for lane_index, trace in enumerate(traces):
            lane = np.asarray([lane_index], dtype=np.int64)
            from_styles, to_styles, prefix_lengths = (
                scripted_policy.ScriptedPolicy.honest_style_transition_spec(
                    lane, seed))
            cold_starts, warm_starts = (
                scripted_policy.ScriptedPolicy
                .honest_style_transition_block_starts(lane, seed))
            from_style = int(from_styles[0])
            to_style = int(to_styles[0])
            prefix_length = int(prefix_lengths[0])
            transition = (
                f"{evaluation.STYLE_NAMES[from_style]}->"
                f"{evaluation.STYLE_NAMES[to_style]}")
            expected_style = evaluation.STYLE_NAMES[to_style]
            expected_weapon = expected_weapon_by_style[to_style]
            first_a_roll_tick = (
                int(trace[0]["tick"]) if trace else None)
            prior_decision_states = (
                sum(
                    int(row["tick"]) < first_a_roll_tick
                    for row in decision_traces[lane_index])
                if first_a_roll_tick is not None else None)
            prayer_by_tick = {
                int(row["tick"]): row.get("opponentPrayerBefore", "none")
                for row in decision_traces[lane_index]
            }
            prefix_evidence_start = (
                int(trace[-1]["tick"]) + 1 if trace else 0)
            prefix_route_evidence = _melee_route_block_evidence(
                decision_traces[lane_index],
                prefix_evidence_start,
                gear.NOXIOUS_HALBERD.item_id)
            prefix_route_blocked = (
                from_style == schema.STYLE_MELEE
                and len(trace) < prefix_length
                and prefix_route_evidence["blocked"])
            lane_blocks = []
            for repeat, start in (
                    ("cold", int(cold_starts[0])),
                    ("warm", int(warm_starts[0]))):
                block_rolls = trace[
                    start:start
                    + scripted_policy.HONEST_STYLE_TRANSITION_B_ROLLS]
                if block_rolls:
                    first_block_tick = int(block_rolls[0]["tick"])
                    last_block_tick = int(block_rolls[-1]["tick"])
                    block_decisions = [
                        row for row in decision_traces[lane_index]
                        if first_block_tick <= int(row["tick"])
                        <= last_block_tick
                        and "opponentWeaponId" in row
                    ]
                else:
                    block_decisions = []
                if block_rolls:
                    evidence_start_tick = int(block_rolls[-1]["tick"]) + 1
                elif start > 0 and trace:
                    prior_index = min(start, len(trace)) - 1
                    evidence_start_tick = int(trace[prior_index]["tick"]) + 1
                else:
                    evidence_start_tick = 0
                route_evidence = _melee_route_block_evidence(
                    decision_traces[lane_index],
                    evidence_start_tick,
                    expected_weapon)
                excluded = (
                    to_style == schema.STYLE_MELEE
                    and len(block_rolls)
                    < scripted_policy.HONEST_STYLE_TRANSITION_B_ROLLS
                    and route_evidence["blocked"])
                if prefix_route_blocked:
                    excluded = True
                    route_evidence = prefix_route_evidence
                block = {
                    "role": cell["role"],
                    "lane": lane_index,
                    "repeat": repeat,
                    "transition": transition,
                    "fromStyle": evaluation.STYLE_NAMES[from_style],
                    "toStyle": expected_style,
                    "prefixRolls": prefix_length,
                    "priorDecisionStatesBeforeFirstColdARoll": (
                        prior_decision_states),
                    "blockStartAttackIndex": start,
                    "rolls": len(block_rolls),
                    "correct": sum(
                        bool(roll["correct"]) for roll in block_rolls),
                    "correctPct": _pct(
                        sum(bool(roll["correct"]) for roll in block_rolls),
                        len(block_rolls)),
                    "longestMissStreak": _longest_miss_streak(block_rolls),
                    "unexpectedStyleRolls": sum(
                        roll["style"] != expected_style
                        for roll in block_rolls),
                    "dishonestWeaponRolls": sum(
                        int(roll.get("attackerWeaponId", -1))
                        != expected_weapon
                        for roll in block_rolls),
                    "decisionWeaponTicks": len(block_decisions),
                    "dishonestDecisionWeaponTicks": sum(
                        int(row["opponentWeaponId"]) != expected_weapon
                        for row in block_decisions),
                    "distances": sorted({
                        int(roll["distance"]) for roll in block_rolls
                    }),
                    "opponentPrayers": sorted({
                        prayer_by_tick.get(int(roll["tick"]), "none")
                        for roll in block_rolls
                    }),
                    "excludedRouteBlocked": excluded,
                    "routeBlockedReason": (
                        (
                            "melee_a_prefix_route_blocked_before_b"
                            if repeat == "cold"
                            else "not_reached_after_melee_a_prefix_route_block"
                        )
                        if prefix_route_blocked
                        else (
                            "stable_unreachable_halberd_route"
                            if excluded else None)),
                    "routeBlockedEvidence": route_evidence,
                }
                lane_blocks.append(block)
            if (
                    not prefix_route_blocked
                    and lane_blocks[0]["excludedRouteBlocked"]
                    and lane_blocks[1]["rolls"]
                    < scripted_policy.HONEST_STYLE_TRANSITION_B_ROLLS
                    and len(trace) < int(warm_starts[0])):
                lane_blocks[1]["excludedRouteBlocked"] = True
                lane_blocks[1]["routeBlockedReason"] = (
                    "not_reached_after_cold_route_block")
                lane_blocks[1]["routeBlockedEvidence"] = lane_blocks[0][
                    "routeBlockedEvidence"]
            blocks.extend(lane_blocks)

    transitions = (
        "magic->ranged",
        "magic->melee",
        "ranged->magic",
        "ranged->melee",
        "melee->magic",
        "melee->ranged",
    )
    cold_blocks = [
        block for block in blocks if block["repeat"] == "cold"
    ]
    measured_openings = [
        int(block["priorDecisionStatesBeforeFirstColdARoll"])
        for block in cold_blocks
        if block["priorDecisionStatesBeforeFirstColdARoll"] is not None
    ]
    return {
        "definition": (
            "prayer correctness from the first roll of each honest-gear "
            "eight-roll B block, first cold and then repeated warm"),
        "excludedRouteBlockedBlocks": [
            {
                "role": block["role"],
                "lane": block["lane"],
                "repeat": block["repeat"],
                "transition": block["transition"],
                "prefixRolls": block["prefixRolls"],
                "reason": block["routeBlockedReason"],
                "evidence": block["routeBlockedEvidence"],
            }
            for block in blocks
            if block["excludedRouteBlocked"]
        ],
        "coldOpeningPriorDecisionStates": {
            "definition": (
                "model decisions strictly before the first cold A attack "
                "roll; promotion requires fewer than 16"),
            "laneCount": len(cold_blocks),
            "measuredLanes": len(measured_openings),
            "unmeasuredRouteBlockedPrefixLanes": sum(
                block["priorDecisionStatesBeforeFirstColdARoll"] is None
                and block["routeBlockedReason"]
                == "melee_a_prefix_route_blocked_before_b"
                for block in cold_blocks),
            "minimum": min(measured_openings, default=None),
            "maximum": max(measured_openings, default=None),
            "lanesAtOrAbove16": sum(
                value >= 16 for value in measured_openings),
            "decisionStateCounts": {
                str(value): measured_openings.count(value)
                for value in sorted(set(measured_openings))
            },
            "byRole": {
                role: {
                    "measuredLanes": len(values),
                    "minimum": min(values, default=None),
                    "maximum": max(values, default=None),
                    "lanesAtOrAbove16": sum(
                        value >= 16 for value in values),
                }
                for role in ("first", "second")
                for values in [[
                    int(block["priorDecisionStatesBeforeFirstColdARoll"])
                    for block in cold_blocks
                    if block["role"] == role
                    and block[
                        "priorDecisionStatesBeforeFirstColdARoll"] is not None
                ]]
            },
        },
        "distribution": _honest_transition_distribution(blocks),
        "byRepeat": {
            repeat: _honest_transition_distribution([
                block for block in blocks if block["repeat"] == repeat
            ])
            for repeat in ("cold", "warm")
        },
        "byRole": {
            role: _honest_transition_distribution([
                block for block in blocks if block["role"] == role
            ])
            for role in ("first", "second")
        },
        "byTransition": {
            transition: _honest_transition_distribution([
                block for block in blocks
                if block["transition"] == transition
            ])
            for transition in transitions
        },
        "blocks": blocks,
    }


def _persistent_terminal_summary(
        cells: list[dict],
        script: str,
        seed: int | None = None) -> dict | None:
    if _terminal_phase_spec(script, 0, seed) is None:
        return None

    lanes = []
    for cell in cells:
        for lane_index, trace in enumerate(cell["lanePrayerTrace"]):
            phase_spec = _terminal_phase_spec(script, lane_index, seed)
            if phase_spec is None:
                continue
            terminal_start, terminal_style = phase_spec
            terminal_name = evaluation.STYLE_NAMES[terminal_style]
            phase = trace[terminal_start:]
            terminal = [
                roll for roll in phase
                if roll["style"] == terminal_name
            ]
            after_first = terminal[1:]
            correct = sum(bool(roll["correct"]) for roll in terminal)
            after_first_correct = sum(
                bool(roll["correct"]) for roll in after_first)
            after_third = terminal[3:]
            after_third_correct = sum(
                bool(roll["correct"]) for roll in after_third)
            first_six = terminal[:6]
            first_correct = next((
                index + 1
                for index, roll in enumerate(terminal)
                if bool(roll["correct"])
            ), None)
            lanes.append({
                "role": cell["role"],
                "lane": lane_index,
                "terminalStyle": terminal_name,
                "terminalStartAttackIndex": terminal_start,
                "phaseRolls": len(phase),
                "unexpectedStyleRolls": len(phase) - len(terminal),
                "rolls": len(terminal),
                "correct": correct,
                "correctPct": _pct(correct, len(terminal)),
                "afterFirstRolls": len(after_first),
                "afterFirstCorrect": after_first_correct,
                "afterFirstCorrectPct": _pct(
                    after_first_correct, len(after_first)),
                "afterThirdRolls": len(after_third),
                "afterThirdCorrect": after_third_correct,
                "afterThirdCorrectPct": _pct(
                    after_third_correct, len(after_third)),
                "firstSixRolls": len(first_six),
                "firstSixCorrect": sum(
                    bool(roll["correct"]) for roll in first_six),
                "firstSixCorrectPct": _pct(
                    sum(bool(roll["correct"]) for roll in first_six),
                    len(first_six)),
                "rollsToFirstCorrect": first_correct,
                "longestMissStreakAfterThird": _longest_miss_streak(
                    after_third),
            })

    return {
        "definition": (
            "prayer correctness after the first roll in each lane's "
            "persistent terminal-style phase"),
        "distribution": _terminal_distribution(lanes),
        "byTerminalStyle": {
            style: _terminal_distribution([
                lane for lane in lanes
                if lane["terminalStyle"] == style
            ])
            for style in evaluation.STYLE_NAMES
        },
        "byRole": {
            role: _terminal_distribution([
                lane for lane in lanes if lane["role"] == role
            ])
            for role in ("first", "second")
        },
        "lanes": lanes,
    }


def _persistent_ranged_summary(
        cells: list[dict],
        script: str,
        seed: int | None = None) -> dict | None:
    if script not in (
            "fixed-ranged",
            "varied-opener-then-persistent-ranged",
            "seeded-varied-prefix-then-persistent-ranged",
            "seeded-long-mr-prefix-then-persistent-balanced",
            "seeded-mixed-then-ranged-pressure",
            "seeded-three-style-then-ranged-gear-fakes",
            "seeded-ranged-phase-balanced-gear-fakes",
            "seeded-ranged-multigear-movement-pressure",
            "live-rmm-then-persistent-ranged",
            "live-mmmrm-then-persistent-ranged",
            "live-magic-melee-then-persistent-ranged",
            "live-human-ranged-pressure",
            "live-human-ranged-pressure-fullgear",
            "live-human-recurring-ranged-pressure-fullgear",
            "live-ranged-gear-flick-pressure",
            "heldout-ranged-multigear-movement-a",
            "heldout-ranged-multigear-movement-b"):
        return None

    known_start = {
        "fixed-ranged": 0,
        "varied-opener-then-persistent-ranged": 10,
        "live-rmm-then-persistent-ranged": 3,
        "live-mmmrm-then-persistent-ranged": 5,
        "live-magic-melee-then-persistent-ranged": 2,
        "live-human-ranged-pressure": 3,
        "live-human-ranged-pressure-fullgear": 3,
        "live-human-recurring-ranged-pressure-fullgear": 16,
        "live-ranged-gear-flick-pressure": 4,
        "heldout-ranged-multigear-movement-a": 6,
        "heldout-ranged-multigear-movement-b": 7,
    }.get(script)
    lanes = []
    for cell in cells:
        for lane_index, trace in enumerate(cell["lanePrayerTrace"]):
            if script in (
                    "seeded-varied-prefix-then-persistent-ranged",
                    "seeded-long-mr-prefix-then-persistent-balanced",
                    "seeded-mixed-then-ranged-pressure",
                    "seeded-three-style-then-ranged-gear-fakes",
                    "seeded-ranged-phase-balanced-gear-fakes",
                    "seeded-ranged-multigear-movement-pressure"):
                if seed is None:
                    raise ValueError(
                        "seed is required for a seeded persistent-Ranged "
                        "phase boundary")
                if script == "seeded-mixed-then-ranged-pressure":
                    terminal_start = int(
                        scripted_policy.ScriptedPolicy
                        .seeded_pressure_prefix_lengths(
                            np.asarray([lane_index], dtype=np.int64),
                            seed,
                        )[0]
                    )
                elif script in (
                        "seeded-three-style-then-ranged-gear-fakes",
                        "seeded-ranged-phase-balanced-gear-fakes",
                        "seeded-ranged-multigear-movement-pressure"):
                    terminal_start = int(
                        scripted_policy.ScriptedPolicy
                        .seeded_ranged_fake_prefix_lengths(
                            np.asarray([lane_index], dtype=np.int64),
                            seed,
                        )[0]
                    )
                elif (
                    script
                    == "seeded-long-mr-prefix-then-persistent-balanced"
                ):
                    terminal_style = int(
                        scripted_policy.ScriptedPolicy.seeded_long_terminal_styles(
                            np.asarray([lane_index], dtype=np.int64),
                            seed,
                        )[0]
                    )
                    if terminal_style != schema.STYLE_RANGED:
                        continue
                    terminal_start = int(
                        scripted_policy.ScriptedPolicy.seeded_long_prefix_lengths(
                            np.asarray([lane_index], dtype=np.int64),
                            seed,
                        )[0]
                    )
                else:
                    terminal_start = (lane_index + seed * 5) % 11
            elif known_start is None:
                non_ranged = [
                    index for index, roll in enumerate(trace)
                    if roll["style"] != "ranged"
                ]
                terminal_start = (
                    non_ranged[-1] + 1 if non_ranged else 0)
            else:
                terminal_start = known_start
            terminal = [
                roll for roll in trace[terminal_start:]
                if roll["style"] == "ranged"
            ]
            after_first = terminal[1:]
            correct = sum(bool(roll["correct"]) for roll in terminal)
            after_first_correct = sum(
                bool(roll["correct"]) for roll in after_first)
            lanes.append({
                "role": cell["role"],
                "lane": lane_index,
                "terminalStartAttackIndex": terminal_start,
                "rolls": len(terminal),
                "correct": correct,
                "correctPct": _pct(correct, len(terminal)),
                "afterFirstRolls": len(after_first),
                "afterFirstCorrect": after_first_correct,
                "afterFirstCorrectPct": _pct(
                    after_first_correct, len(after_first)),
            })

    usable = [
        lane for lane in lanes if lane["afterFirstRolls"] > 0]
    rates = np.asarray(
        [lane["afterFirstCorrectPct"] for lane in usable],
        dtype=np.float64)
    distribution = {
        "usableLanes": len(usable),
        "minimumPct": (
            round(float(np.min(rates)), 3) if rates.size else None),
        "p10Pct": (
            round(float(np.percentile(rates, 10)), 3)
            if rates.size else None),
        "medianPct": (
            round(float(np.median(rates)), 3) if rates.size else None),
        "lanesBelow50Pct": sum(
            lane["afterFirstCorrectPct"] < 50.0 for lane in usable),
        "lanesBelow70Pct": sum(
            lane["afterFirstCorrectPct"] < 70.0 for lane in usable),
        "zeroCorrectLanes": sum(
            lane["afterFirstCorrect"] == 0 for lane in usable),
    }
    return {
        "definition": (
            "ranged prayer correctness after the first roll in the "
            "persistent-ranged phase, reported per independent fight lane"),
        "distribution": distribution,
        "lanes": lanes,
    }


def _aggregate(cells: list[dict]) -> dict:
    completed = sum(
        int(cell["metrics"]["completedFights"]) for cell in cells)
    incoming = {
        name: {
            "rolls": sum(
                int(cell["metrics"]["rollPrayerByIncomingStyle"][name]["rolls"])
                for cell in cells),
            "correct": sum(
                int(cell["metrics"]["rollPrayerByIncomingStyle"][name]["correct"])
                for cell in cells),
        }
        for name in evaluation.STYLE_NAMES
    }
    for bucket in incoming.values():
        bucket["correctPct"] = _pct(bucket["correct"], bucket["rolls"])
    post_opening = {
        name: {
            "rolls": sum(
                int(cell["metrics"][
                    "postOpeningRollPrayerByIncomingStyle"][name]["rolls"])
                for cell in cells),
            "correct": sum(
                int(cell["metrics"][
                    "postOpeningRollPrayerByIncomingStyle"][name]["correct"])
                for cell in cells),
        }
        for name in evaluation.STYLE_NAMES
    }
    for bucket in post_opening.values():
        bucket["correctPct"] = _pct(bucket["correct"], bucket["rolls"])
    total_rolls = sum(bucket["rolls"] for bucket in incoming.values())
    total_correct = sum(bucket["correct"] for bucket in incoming.values())
    opening_rolls = sum(
        int(cell["metrics"]["openingIncomingAttackRolls"])
        for cell in cells)
    post_opening_rolls = sum(
        int(cell["metrics"]["postOpeningIncomingAttackRolls"])
        for cell in cells)
    post_opening_correct = sum(
        bucket["correct"] for bucket in post_opening.values())
    active = {
        name: sum(
            int(cell["metrics"]["activePrayerShare"][name]["rolls"])
            for cell in cells)
        for name in evaluation.PRAYER_NAMES
    }
    shortcut = {
        "knownOwnWeaponStyleRolls": sum(
            int(cell["metrics"]["prayerOwnWeaponShortcut"][
                "knownOwnWeaponStyleRolls"])
            for cell in cells),
        "prayerMatchesOwnWeaponStyle": sum(
            int(cell["metrics"]["prayerOwnWeaponShortcut"][
                "prayerMatchesOwnWeaponStyle"])
            for cell in cells),
        "incomingStyleDiffersFromOwnWeaponRolls": sum(
            int(cell["metrics"]["prayerOwnWeaponShortcut"][
                "incomingStyleDiffersFromOwnWeaponRolls"])
            for cell in cells),
        "differingPrayerMatchesOwnWeaponStyle": sum(
            int(cell["metrics"]["prayerOwnWeaponShortcut"][
                "differingPrayerMatchesOwnWeaponStyle"])
            for cell in cells),
        "differingPrayerCorrect": sum(
            int(cell["metrics"]["prayerOwnWeaponShortcut"][
                "differingPrayerCorrect"])
            for cell in cells),
    }
    shortcut["prayerMatchesOwnWeaponStylePct"] = _pct(
        shortcut["prayerMatchesOwnWeaponStyle"],
        shortcut["knownOwnWeaponStyleRolls"])
    shortcut["differingPrayerMatchesOwnWeaponStylePct"] = _pct(
        shortcut["differingPrayerMatchesOwnWeaponStyle"],
        shortcut["incomingStyleDiffersFromOwnWeaponRolls"])
    shortcut["differingPrayerCorrectPct"] = _pct(
        shortcut["differingPrayerCorrect"],
        shortcut["incomingStyleDiffersFromOwnWeaponRolls"])
    return {
        "completedFights": completed,
        "incomingAttackRolls": total_rolls,
        "rollPrayerCorrectPct": _pct(total_correct, total_rolls),
        "rollPrayerByIncomingStyle": incoming,
        "openingIncomingAttackRolls": opening_rolls,
        "postOpeningIncomingAttackRolls": post_opening_rolls,
        "postOpeningRollPrayerCorrectPct": _pct(
            post_opening_correct, post_opening_rolls),
        "postOpeningRollPrayerByIncomingStyle": post_opening,
        "activePrayerShare": {
            name: {
                "rolls": rolls,
                "pct": _pct(rolls, total_rolls),
            }
            for name, rolls in active.items()
        },
        "prayerOwnWeaponShortcut": shortcut,
    }


def run_probe(args, candidate_policy=None) -> dict:
    candidate = candidate_policy
    if candidate is None:
        candidate = policy.Policy.load(
            Path(args.candidate).resolve(),
            device=args.device,
            compatible_input_sizes=JAVA_COMPATIBLE_ANCHOR_INPUTS)
    script = ATTACK_SCRIPT_BY_CHOICE[args.attack]
    distance_min = (
        args.distance
        if getattr(args, "distance_min", None) is None
        else args.distance_min)
    distance_max = (
        args.distance
        if getattr(args, "distance_max", None) is None
        else args.distance_max)
    roles = (("first", 0), ("second", 1))
    if args.role != "both":
        roles = tuple(role for role in roles if role[0] == args.role)
    # Keep the complete candidate active. The v3 prayer head consumes sixteen
    # prior full-state rows, so replacing the bot's attacks, gear, movement,
    # and supplies creates a different prayer problem from live practice.
    subject_policy = candidate

    started = time.time()
    cells = []
    for role_index, (role, subject_side) in enumerate(roles):
        # ScriptedPolicy owns its tick counter. Each matched role must begin
        # from tick zero rather than inheriting the completed first role.
        fixed = scripted_policy.ScriptedPolicy(
            script, args.opponent_defence, seed=args.seed)
        main = subject_policy if subject_side == 0 else fixed
        opponent = fixed if subject_side == 0 else subject_policy
        runner = _PrayerTraceEngine(
            n_fights=args.fights,
            policy=main,
            opponent_policy=opponent,
            subject_side=subject_side,
            seed=args.seed + role_index * 17,
            replay_seed=args.replay_seed + role_index * 17,
            epsilon=0.0,
            max_ticks=args.max_ticks,
            start_distance_min=distance_min,
            start_distance_max=distance_max,
            world_id=args.world_id,
            lane_radius=3,
            prayer_trace_sustain=getattr(
                args, "prayer_trace_sustain", False),
            decision_prayer_trace=getattr(
                args, "decision_prayer_trace", False))
        runner.run(on_record=lambda _record: None)
        cells.append({
            "role": role,
            "metrics": runner.evaluation.report(),
            "lanePrayerTrace": runner.lane_prayer_trace,
            "laneDecisionPrayerTrace": runner.lane_decision_prayer_trace,
        })

    persistent_ranged = _persistent_ranged_summary(
        cells, script, seed=args.seed)
    persistent_terminal = _persistent_terminal_summary(
        cells, script, seed=args.seed)
    honest_style_transitions = _honest_style_transition_summary(
        cells, script, seed=args.seed)
    return {
        "schema": "fastsim_fixed_attack_eval.v1",
        "authority": "rapid_screen",
        "promotionAuthority": False,
        "writesTrainingRows": False,
        "runtimeSeconds": round(time.time() - started, 3),
        "configuration": {
            "candidate": str(Path(args.candidate).resolve()),
            "fixedAttack": args.attack,
            "opponentDefence": args.opponent_defence,
            "fightsPerRole": args.fights,
            "maxTicks": args.max_ticks,
            "distance": args.distance,
            "distanceMin": distance_min,
            "distanceMax": distance_max,
            "role": args.role,
            "worldId": args.world_id,
            "seed": args.seed,
            "replaySeed": args.replay_seed,
            "device": args.device,
            "forcePrayer": getattr(args, "force_prayer", None),
            "prayerTraceSustain": bool(getattr(
                args, "prayer_trace_sustain", False)),
            "decisionPrayerTrace": bool(getattr(
                args, "decision_prayer_trace", False)),
        },
        "aggregate": _aggregate(cells),
        "persistentRangedRecovery": persistent_ranged,
        "persistentTerminalRecovery": persistent_terminal,
        "honestStyleTransitionRecovery": honest_style_transitions,
        "cells": cells,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate a checkpoint against a fixed ordinary style, repeated "
            "legal VLS specials, or delayed-prayer adaptive attacks; no "
            "rollout data is written."))
    parser.add_argument("--candidate", required=True)
    parser.add_argument(
        "--attack", choices=ATTACK_CHOICES, default="melee")
    parser.add_argument(
        "--opponent-defence",
        choices=scripted_policy.DEFENCE_NAMES,
        default="smite")
    parser.add_argument("--fights", type=int, default=128)
    parser.add_argument("--max-ticks", type=int, default=180)
    parser.add_argument("--distance", type=int, default=1)
    parser.add_argument(
        "--distance-min",
        type=int,
        help="minimum randomized starting distance; overrides --distance")
    parser.add_argument(
        "--distance-max",
        type=int,
        help="maximum randomized starting distance; overrides --distance")
    parser.add_argument(
        "--role", choices=("both", "first", "second"), default="both")
    parser.add_argument("--world-id", type=int, default=36)
    parser.add_argument("--seed", type=int, default=99109)
    parser.add_argument("--replay-seed", type=int, default=66109)
    parser.add_argument(
        "--device", choices=("auto", "cuda", "cpu"), default="auto")
    parser.add_argument(
        "--force-prayer",
        choices=("magic", "ranged", "melee"),
        help=(
            "diagnostic-only: keep the full candidate but force one static "
            "protection prayer"))
    parser.add_argument(
        "--prayer-trace-sustain",
        action="store_true",
        help=(
            "Reset both alive fighters to normal full health before each "
            "decision so a prayer trace reaches its persistent phase. This "
            "is diagnostic-only and does not affect ordinary evaluations."))
    parser.add_argument(
        "--decision-prayer-trace",
        action="store_true",
        help=(
            "Record the candidate's selected protection prayer on every "
            "decision tick, including both fighters' prior overheads."))
    parser.add_argument("--out")
    args = parser.parse_args()

    if args.fights <= 0:
        parser.error("--fights must be positive")
    if args.max_ticks <= 0:
        parser.error("--max-ticks must be positive")
    if args.distance <= 0:
        parser.error("--distance must be positive")
    if args.distance_min is not None and args.distance_min <= 0:
        parser.error("--distance-min must be positive")
    if args.distance_max is not None and args.distance_max <= 0:
        parser.error("--distance-max must be positive")
    distance_min = (
        args.distance if args.distance_min is None else args.distance_min)
    distance_max = (
        args.distance if args.distance_max is None else args.distance_max)
    if distance_min > distance_max:
        parser.error("--distance-min cannot exceed --distance-max")

    candidate_policy = None
    if args.force_prayer is not None:
        candidate_policy = _ForcedPrayerPolicy(
            policy.Policy.load(
                Path(args.candidate).resolve(),
                device=args.device,
                compatible_input_sizes=JAVA_COMPATIBLE_ANCHOR_INPUTS),
            args.force_prayer)
    report = run_probe(args, candidate_policy=candidate_policy)
    rendered = json.dumps(report, indent=2)
    if args.out:
        output = Path(args.out).resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered + "\n", encoding="utf-8")
        print(output)
    else:
        print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
