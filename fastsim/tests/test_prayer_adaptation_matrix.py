"""Parity checks for the single-batch prayer adaptation matrix."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from fastsim import schema  # noqa: E402
from tools import evaluate_fixed_attack as fixed_eval  # noqa: E402
from tools.evaluate_prayer_adaptation_matrix import (  # noqa: E402
    SCENARIOS,
    Scenario,
    _args_for,
    _gate_scenario,
    run_vectorized_matrix,
)


class FixedPolicy:
    action_ids = schema.CURRENT_ACTION_IDS
    action_count = schema.ACTION_COUNT
    defence_prayer_head_version = 1

    def __init__(self, defence: int):
        self.defence = defence

    def score(self, inputs):
        scores = np.zeros(
            (len(inputs), schema.ACTION_COUNT), dtype=np.float32)
        scores[:, schema.COMBAT_ATTACK_BASE] = 3.0
        scores[:, schema.COMBAT_SPEC_NONE] = 1.0
        scores[:, schema.DEFENCE_BASE + self.defence] = 3.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 3.0
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 3.0
        return scores, np.zeros(len(inputs), dtype=np.float32)


def _stable_probe_fields(report: dict) -> dict:
    return {
        "aggregate": report["aggregate"],
        "persistentRangedRecovery": report["persistentRangedRecovery"],
        "persistentTerminalRecovery": report["persistentTerminalRecovery"],
        "honestStyleTransitionRecovery": report[
            "honestStyleTransitionRecovery"],
        "cells": report["cells"],
    }


def _first_difference(actual, expected, path="root"):
    if type(actual) is not type(expected):
        return f"{path}: {type(actual).__name__} != {type(expected).__name__}"
    if isinstance(actual, dict):
        if actual.keys() != expected.keys():
            return f"{path}: keys {actual.keys()} != {expected.keys()}"
        for key in actual:
            difference = _first_difference(
                actual[key], expected[key], f"{path}.{key}")
            if difference is not None:
                return difference
        return None
    if isinstance(actual, list):
        if len(actual) != len(expected):
            return f"{path}: lengths {len(actual)} != {len(expected)}"
        for index, (left, right) in enumerate(zip(actual, expected)):
            difference = _first_difference(
                left, right, f"{path}[{index}]")
            if difference is not None:
                return difference
        return None
    if actual != expected:
        return f"{path}: {actual!r} != {expected!r}"
    return None


def test_vectorized_matrix_matches_independent_scenario_runs() -> None:
    scenarios = [
        (0, Scenario(
            "fixed-ranged-test", "ranged", "fixed-ranged",
            2, 15, 1, 3, "ranged")),
        (13, Scenario(
            "block-switch-test", "block-switch", "mixed",
            3, 19, 1, 6)),
    ]
    candidate_path = Path("candidate-test.pt")
    parent_path = Path("parent-test.pt")

    expected = {}
    for index, scenario in scenarios:
        for subject, checkpoint, defence in (
                ("candidate", candidate_path, schema.PRAY_PROTECT_MISSILES),
                ("parent", parent_path, schema.PRAY_PROTECT_MAGIC)):
            args = _args_for(
                checkpoint, scenario, index, "cpu", quick=False)
            expected[(index, subject)] = fixed_eval.run_probe(
                args, candidate_policy=FixedPolicy(defence))

    actual, execution = run_vectorized_matrix(
        scenarios,
        candidate_path,
        parent_path,
        FixedPolicy(schema.PRAY_PROTECT_MISSILES),
        FixedPolicy(schema.PRAY_PROTECT_MAGIC),
        "cpu",
        quick=False)

    assert execution["parallelCells"] == len(scenarios) * 4
    assert execution["vectorizedFightLanes"] == sum(
        min(12, scenario.fights) * 4
        for _index, scenario in scenarios)
    for key in expected:
        difference = _first_difference(
            _stable_probe_fields(actual[key]),
            _stable_probe_fields(expected[key]))
        assert difference is None, f"{key}: {difference}"


def _transition_summary(blocks: list[dict]) -> dict:
    transitions = (
        "magic->ranged",
        "magic->melee",
        "ranged->magic",
        "ranged->melee",
        "melee->magic",
        "melee->ranged",
    )
    return {
        "coldOpeningPriorDecisionStates": {
            "laneCount": sum(
                block["repeat"] == "cold" for block in blocks),
            "measuredLanes": sum(
                block["repeat"] == "cold" for block in blocks),
            "unmeasuredRouteBlockedPrefixLanes": 0,
            "minimum": 1,
            "maximum": 1,
            "lanesAtOrAbove16": 0,
        },
        "distribution": fixed_eval._honest_transition_distribution(blocks),
        "byRepeat": {
            repeat: fixed_eval._honest_transition_distribution([
                block for block in blocks if block["repeat"] == repeat
            ])
            for repeat in ("cold", "warm")
        },
        "byRole": {
            role: fixed_eval._honest_transition_distribution([
                block for block in blocks if block["role"] == role
            ])
            for role in ("first", "second")
        },
        "byTransition": {
            transition: fixed_eval._honest_transition_distribution([
                block for block in blocks
                if block["transition"] == transition
            ])
            for transition in transitions
        },
        "blocks": blocks,
    }


def _passing_transition_blocks() -> list[dict]:
    transitions = (
        "magic->ranged",
        "magic->melee",
        "ranged->magic",
        "ranged->melee",
        "melee->magic",
        "melee->ranged",
    )
    return [
        {
            "role": role,
            "repeat": repeat,
            "transition": transition,
            "fromStyle": transition.split("->", 1)[0],
            "toStyle": transition.split("->", 1)[1],
            "lane": transitions.index(transition) * 3 + prefix - 1,
            "prefixRolls": prefix,
            "rolls": 8,
            "correct": 8,
            "longestMissStreak": 0,
            "unexpectedStyleRolls": 0,
            "dishonestWeaponRolls": 0,
            "distances": [1, 6],
            "opponentPrayers": ["magic", "ranged", "melee"],
        }
        for role in ("first", "second")
        for repeat in ("cold", "warm")
        for transition in transitions
        for prefix in (1, 2, 3)
    ]


def test_honest_transition_gate_rejects_four_misses_from_first_roll() -> None:
    scenario = Scenario(
        "honest-transition-test",
        "honest-gear-style-transitions",
        "honest-transition",
        18,
        220,
        1,
        8)
    passing_blocks = _passing_transition_blocks()
    failures: list[dict] = []
    _gate_scenario(
        scenario,
        {"styleTransition": _transition_summary(passing_blocks)},
        {},
        failures)
    assert failures == []

    failing_blocks = [dict(block) for block in passing_blocks]
    failing_blocks[0]["correct"] = 4
    failing_blocks[0]["longestMissStreak"] = 4
    failures = []
    _gate_scenario(
        scenario,
        {"styleTransition": _transition_summary(failing_blocks)},
        {},
        failures)
    assert any(
        "four-miss streak" in failure["reason"]
        for failure in failures)
    assert any(
        "cold repeat longest miss streak is 4" == failure["reason"]
        for failure in failures)


def test_honest_transition_gate_excludes_only_blocked_melee() -> None:
    scenario = Scenario(
        "honest-transition-test",
        "honest-gear-style-transitions",
        "honest-transition",
        18,
        220,
        1,
        8)
    blocks = _passing_transition_blocks()
    excluded = [
        block for block in blocks
        if block["role"] == "first"
        and block["transition"] == "ranged->melee"
        and block["prefixRolls"] == 1
    ]
    for block in excluded:
        block["rolls"] = 0
        block["correct"] = 0
        block["excludedRouteBlocked"] = True
        block["routeBlockedReason"] = (
            "stable_unreachable_halberd_route"
            if block["repeat"] == "cold"
            else "not_reached_after_cold_route_block")
    failures: list[dict] = []
    _gate_scenario(
        scenario,
        {"styleTransition": _transition_summary(blocks)},
        {},
        failures)
    assert failures == []

    ranged_block = next(
        block for block in blocks
        if block["transition"] == "melee->ranged")
    ranged_block["rolls"] = 0
    ranged_block["correct"] = 0
    ranged_block["excludedRouteBlocked"] = True
    ranged_block["routeBlockedReason"] = (
        "stable_unreachable_halberd_route")
    failures = []
    _gate_scenario(
        scenario,
        {"styleTransition": _transition_summary(blocks)},
        {},
        failures)
    assert any(
        "non-melee block was incorrectly route-excluded" in failure["reason"]
        for failure in failures)
    ranged_block["rolls"] = 8
    ranged_block["correct"] = 8
    ranged_block["excludedRouteBlocked"] = False
    ranged_block["routeBlockedReason"] = None

    ranged_prefix_blocks = [
        block for block in blocks
        if block["role"] == "second"
        and block["transition"] == "melee->ranged"
        and block["prefixRolls"] == 1
    ]
    for block in ranged_prefix_blocks:
        block["rolls"] = 0
        block["correct"] = 0
        block["excludedRouteBlocked"] = True
        block["routeBlockedReason"] = (
            "melee_a_prefix_route_blocked_before_b"
            if block["repeat"] == "cold"
            else "not_reached_after_melee_a_prefix_route_block")
    failures = []
    _gate_scenario(
        scenario,
        {"styleTransition": _transition_summary(blocks)},
        {},
        failures)
    assert not any(
        "non-melee block was incorrectly route-excluded" in failure["reason"]
        for failure in failures)


def test_full_matrix_contains_honest_transition_promotion_gate() -> None:
    scenario = next(
        scenario for scenario in SCENARIOS
        if scenario.name == "honest-gear-style-transitions")
    assert scenario.attack == "honest-gear-style-transitions"
    assert scenario.kind == "honest-transition"
    assert scenario.fights >= 18
    assert (scenario.distance_min, scenario.distance_max) == (1, 8)
    assert scenario.defence == "seeded-switching-protection"


if __name__ == "__main__":
    test_vectorized_matrix_matches_independent_scenario_runs()
    test_honest_transition_gate_rejects_four_misses_from_first_roll()
    test_honest_transition_gate_excludes_only_blocked_melee()
    test_full_matrix_contains_honest_transition_promotion_gate()
    print("prayer adaptation matrix: OK")
