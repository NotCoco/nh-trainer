"""Focused coverage for the fixed-attack evaluation opponent."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

import generate  # noqa: E402
from evaluate_fixed_attack import (  # noqa: E402
    ATTACK_CHOICES,
    ATTACK_SCRIPT_BY_CHOICE,
    _ForcedPrayerPolicy,
    _PrayerTraceEngine,
    _aggregate,
    _honest_style_transition_summary,
    _persistent_ranged_summary,
    _persistent_terminal_summary,
)
from fastsim import evaluation, gear, schema, scripted_policy  # noqa: E402
from fastsim.paths import trainer_dir  # noqa: E402


def test_fixed_melee_scores_only_the_ordinary_melee_attack():
    fixed = scripted_policy.ScriptedPolicy("fixed-melee")
    scores, values = fixed.score(
        np.zeros((3, schema.INPUT_SIZE), dtype=np.float32))
    melee = (
        schema.COMBAT_ATTACK_BASE
        + schema.STYLE_MELEE * 2
        + schema.ATTACK_INTENT_ATTACK)
    assert np.all(scores[:, melee] == 100.0)
    assert np.all(scores[:, schema.COMBAT_SPEC_NONE] == 100.0)
    vls_local = int(np.flatnonzero(
        gear.DIRECT_GEAR_ITEMS == gear.VESTAS_LONGSWORD.item_id)[0])
    assert np.all(scores[:, schema.GEAR_BASE + vls_local] == 100.0)
    assert np.all(values == 0.0)


def test_fixed_halberd_scores_only_ordinary_melee_with_halberd():
    fixed = scripted_policy.ScriptedPolicy("fixed-halberd")
    scores, values = fixed.score(
        np.zeros((3, schema.INPUT_SIZE), dtype=np.float32))
    melee = (
        schema.COMBAT_ATTACK_BASE
        + schema.STYLE_MELEE * 2
        + schema.ATTACK_INTENT_ATTACK)
    halberd_local = int(np.flatnonzero(
        gear.DIRECT_GEAR_ITEMS == gear.NOXIOUS_HALBERD.item_id)[0])

    assert np.all(scores[:, melee] == 100.0)
    assert np.all(scores[:, schema.COMBAT_SPEC_NONE] == 100.0)
    assert np.all(scores[:, schema.GEAR_BASE + halberd_local] == 100.0)
    assert np.all(values == 0.0)


def test_fixed_ranged_holds_crossbow_and_full_gear_while_waiting():
    fixed = scripted_policy.ScriptedPolicy("fixed-ranged")
    inputs = np.zeros((2, schema.INPUT_SIZE), dtype=np.float32)
    scores, _values = fixed.score(inputs)
    crossbow_local = int(np.flatnonzero(
        gear.DIRECT_GEAR_ITEMS == gear.ZARYTE_CROSSBOW.item_id)[0])
    assert np.all(scores[:, schema.COMBAT_NO_ATTACK] == 200.0)
    assert np.all(scores[:, schema.GEAR_BASE + crossbow_local] == 100.0)
    for item in (
            gear.MASORI_BODY_F,
            gear.TORVA_PLATELEGS,
            gear.DRAGONFIRE_SHIELD):
        local = int(np.flatnonzero(
            gear.DIRECT_GEAR_ITEMS == item.item_id)[0])
        assert np.all(scores[:, schema.GEAR_BASE + local] == 100.0)

    angle = gear.ZARYTE_CROSSBOW.item_id * schema.WEAPON_EMBED_FREQ
    inputs[:, schema.INPUT_SELF_WEAPON_SIN] = np.sin(angle)
    inputs[:, schema.INPUT_SELF_WEAPON_COS] = np.cos(angle)
    visible_scores, _values = fixed.score(inputs)
    assert np.all(visible_scores[:, schema.COMBAT_NO_ATTACK] == 0.0)
    assert np.all(
        visible_scores[:, schema.GEAR_BASE + crossbow_local] == 100.0)


def test_fixed_ranged_has_zero_staff_visible_cooldown_decisions():
    for subject_script in ("passive", "fixed-magic"):
        runner = _PrayerTraceEngine(
            n_fights=4,
            policy=scripted_policy.ScriptedPolicy(subject_script),
            opponent_policy=scripted_policy.ScriptedPolicy(
                "fixed-ranged", defence="seeded-switching-protection", seed=7431),
            subject_side=0,
            seed=8431,
            replay_seed=9431,
            epsilon=0.0,
            max_ticks=60,
            start_distance_min=6,
            start_distance_max=6,
            world_id=35,
            prayer_trace_sustain=True,
            decision_prayer_trace=True)
        runner.run(on_record=lambda _record: None)
        for rolls, decisions in zip(
                runner.lane_prayer_trace,
                runner.lane_decision_prayer_trace):
            assert rolls
            first_roll_tick = int(rolls[0]["tick"])
            cooldown_decisions = [
                row for row in decisions
                if int(row["tick"]) >= first_roll_tick
            ]
            assert cooldown_decisions
            assert all(
                int(row["opponentWeaponId"])
                == gear.ZARYTE_CROSSBOW.item_id
                for row in cooldown_decisions)


def test_all_fixed_scripts_use_java_cohort_safe_and_triple_eats():
    inputs = np.zeros((4, schema.INPUT_SIZE), dtype=np.float32)
    inputs[:, schema.INPUT_SELF_HP] = np.asarray(
        (0.80, 58.0 / 99.0, 45.0 / 99.0, 45.0 / 99.0),
        dtype=np.float32)
    inputs[:, schema.INPUT_SELF_FOOD_COUNT] = np.asarray(
        (8.0, 8.0, 8.0, 1.0), dtype=np.float32) / 28.0
    inputs[:, schema.INPUT_SELF_BREW_COUNT] = np.asarray(
        (2.0, 2.0, 2.0, 0.0), dtype=np.float32) / 8.0

    expected = np.asarray((
        schema.SUPPLY_NONE,
        schema.SUPPLY_SAFE_EAT,
        schema.SUPPLY_TRIPLE_EAT,
        schema.SUPPLY_SAFE_EAT,
    ))
    for script in (
            "fixed-magic",
            "fixed-ranged",
            "fixed-melee",
            "fixed-halberd"):
        scores, _values = scripted_policy.ScriptedPolicy(script).score(inputs)
        chosen = np.argmax(
            scores[
                :,
                schema.SUPPLY_BASE:
                schema.SUPPLY_BASE + schema.SUPPLY_COUNT,
            ],
            axis=1)
        assert np.array_equal(chosen, expected)


def test_non_fixed_scripts_keep_no_supply_behavior():
    inputs = np.zeros((1, schema.INPUT_SIZE), dtype=np.float32)
    inputs[:, schema.INPUT_SELF_HP] = 40.0 / 99.0
    inputs[:, schema.INPUT_SELF_FOOD_COUNT] = 8.0 / 28.0
    inputs[:, schema.INPUT_SELF_BREW_COUNT] = 2.0 / 8.0

    for script in (
            "passive",
            "magic-then-halberd",
            "vls-pressure",
            "seeded-rapid-switch"):
        scores, _values = scripted_policy.ScriptedPolicy(script).score(inputs)
        chosen = np.argmax(
            scores[
                :,
                schema.SUPPLY_BASE:
                schema.SUPPLY_BASE + schema.SUPPLY_COUNT,
            ],
            axis=1)
        assert np.array_equal(chosen, (schema.SUPPLY_NONE,))


def test_magic_then_halberd_switches_weapon_and_style_after_opening():
    scripted = scripted_policy.ScriptedPolicy("magic-then-halberd")
    inputs = np.zeros((1, schema.INPUT_SIZE), dtype=np.float32)
    staff_local = int(np.flatnonzero(
        gear.DIRECT_GEAR_ITEMS == gear.ZURIELS_STAFF.item_id)[0])
    halberd_local = int(np.flatnonzero(
        gear.DIRECT_GEAR_ITEMS == gear.NOXIOUS_HALBERD.item_id)[0])
    magic = (
        schema.COMBAT_ATTACK_BASE
        + schema.STYLE_MAGIC * 2
        + schema.ATTACK_INTENT_ATTACK)
    melee = (
        schema.COMBAT_ATTACK_BASE
        + schema.STYLE_MELEE * 2
        + schema.ATTACK_INTENT_ATTACK)

    for _tick in range(5):
        scores, _values = scripted.score(inputs)
        assert scores[0, magic] == 100.0
        assert scores[0, schema.GEAR_BASE + staff_local] == 100.0
    scores, _values = scripted.score(inputs)
    assert scores[0, melee] == 100.0
    assert scores[0, schema.GEAR_BASE + halberd_local] == 100.0


def test_one_magic_then_halberd_has_a_switch_only_tick():
    scripted = scripted_policy.ScriptedPolicy(
        "one-magic-then-halberd")
    inputs = np.zeros((1, schema.INPUT_SIZE), dtype=np.float32)
    halberd_local = int(np.flatnonzero(
        gear.DIRECT_GEAR_ITEMS == gear.NOXIOUS_HALBERD.item_id)[0])
    magic = (
        schema.COMBAT_ATTACK_BASE
        + schema.STYLE_MAGIC * 2
        + schema.ATTACK_INTENT_ATTACK)
    melee = (
        schema.COMBAT_ATTACK_BASE
        + schema.STYLE_MELEE * 2
        + schema.ATTACK_INTENT_ATTACK)

    for _tick in range(4):
        scores, _values = scripted.score(inputs)
        assert scores[0, magic] == 100.0
    switch_scores, _values = scripted.score(inputs)
    assert switch_scores[0, schema.COMBAT_NO_ATTACK] == 100.0
    assert switch_scores[0, schema.GEAR_BASE + halberd_local] == 100.0
    attack_scores, _values = scripted.score(inputs)
    assert attack_scores[0, melee] == 100.0
    assert attack_scores[0, schema.GEAR_BASE + halberd_local] == 100.0


def test_persistent_ranged_summary_keeps_worst_lane_visible():
    cells = [{
        "role": "first",
        "lanePrayerTrace": [
            [
                {"style": "ranged", "correct": False},
                {"style": "magic", "correct": True},
                {"style": "magic", "correct": True},
                {"style": "ranged", "correct": False},
                {"style": "ranged", "correct": False},
                {"style": "ranged", "correct": False},
            ],
            [
                {"style": "ranged", "correct": False},
                {"style": "magic", "correct": True},
                {"style": "magic", "correct": True},
                {"style": "ranged", "correct": False},
                {"style": "ranged", "correct": True},
                {"style": "ranged", "correct": True},
            ],
        ],
    }]
    summary = _persistent_ranged_summary(
        cells, "live-rmm-then-persistent-ranged")
    assert summary["distribution"] == {
        "usableLanes": 2,
        "minimumPct": 0.0,
        "p10Pct": 10.0,
        "medianPct": 50.0,
        "lanesBelow50Pct": 1,
        "lanesBelow70Pct": 1,
        "zeroCorrectLanes": 1,
    }


def test_seeded_persistent_ranged_summary_uses_exact_prefix_length():
    seed = 7
    # Lane zero has a two-roll prefix for this seed. Both prefix rolls happen
    # to be Ranged, so style-based boundary inference would count them as the
    # persistent phase and hide the intended first-roll exclusion.
    cells = [{
        "role": "first",
        "lanePrayerTrace": [[
            {"style": "ranged", "correct": False},
            {"style": "ranged", "correct": False},
            {"style": "ranged", "correct": False},
            {"style": "ranged", "correct": True},
            {"style": "ranged", "correct": True},
        ]],
    }]
    summary = _persistent_ranged_summary(
        cells,
        "seeded-varied-prefix-then-persistent-ranged",
        seed=seed)
    lane = summary["lanes"][0]
    assert lane["terminalStartAttackIndex"] == 2
    assert lane["rolls"] == 3
    assert lane["afterFirstRolls"] == 2
    assert lane["afterFirstCorrectPct"] == 100.0


def test_long_balanced_summary_uses_seeded_boundary_for_ranged_lanes():
    seed = 11
    lane_count = 6
    lane_indices = np.arange(lane_count, dtype=np.int64)
    terminals = (
        scripted_policy.ScriptedPolicy.seeded_long_terminal_styles(
            lane_indices, seed))
    ranged_lane = int(np.flatnonzero(
        terminals == schema.STYLE_RANGED)[0])
    prefix_length = int(
        scripted_policy.ScriptedPolicy.seeded_long_prefix_lengths(
            np.asarray([ranged_lane], dtype=np.int64), seed)[0])
    traces = [[] for _lane in range(lane_count)]
    traces[ranged_lane] = [
        {"style": "ranged", "correct": False}
        for _roll in range(prefix_length + 1)
    ] + [
        {"style": "ranged", "correct": True},
        {"style": "ranged", "correct": True},
    ]
    summary = _persistent_ranged_summary(
        [{"role": "first", "lanePrayerTrace": traces}],
        "seeded-long-mr-prefix-then-persistent-balanced",
        seed=seed)
    lane = next(
        row for row in summary["lanes"]
        if row["lane"] == ranged_lane)
    assert lane["terminalStartAttackIndex"] == prefix_length
    assert lane["rolls"] == 3
    assert lane["afterFirstRolls"] == 2
    assert lane["afterFirstCorrectPct"] == 100.0


def test_exact_human_summary_starts_after_five_roll_prefix():
    trace = [
        {"style": style, "correct": False}
        for style in ("magic", "magic", "magic", "ranged", "magic")
    ] + [
        {"style": "ranged", "correct": False},
        {"style": "ranged", "correct": True},
        {"style": "ranged", "correct": True},
    ]
    summary = _persistent_ranged_summary(
        [{"role": "first", "lanePrayerTrace": [trace]}],
        "live-mmmrm-then-persistent-ranged")
    lane = summary["lanes"][0]
    assert lane["terminalStartAttackIndex"] == 5
    assert lane["rolls"] == 3
    assert lane["afterFirstRolls"] == 2
    assert lane["afterFirstCorrectPct"] == 100.0


def test_live_magic_melee_summary_starts_after_two_roll_prefix():
    trace = [
        {"style": "magic", "correct": False},
        {"style": "melee", "correct": False},
        {"style": "ranged", "correct": False},
        {"style": "ranged", "correct": True},
        {"style": "ranged", "correct": True},
    ]
    summary = _persistent_ranged_summary(
        [{"role": "first", "lanePrayerTrace": [trace]}],
        "live-magic-melee-then-persistent-ranged")
    lane = summary["lanes"][0]
    assert lane["terminalStartAttackIndex"] == 2
    assert lane["rolls"] == 3
    assert lane["afterFirstRolls"] == 2
    assert lane["afterFirstCorrectPct"] == 100.0


def test_honest_transition_summary_counts_misses_from_first_b_roll():
    seed = 7
    lane = np.asarray([0], dtype=np.int64)
    from_styles, to_styles, prefix_lengths = (
        scripted_policy.ScriptedPolicy.honest_style_transition_spec(
            lane, seed))
    from_style = int(from_styles[0])
    to_style = int(to_styles[0])
    prefix = int(prefix_lengths[0])
    from_name = evaluation.STYLE_NAMES[from_style]
    to_name = evaluation.STYLE_NAMES[to_style]
    weapon_by_style = {
        schema.STYLE_MAGIC: gear.ZURIELS_STAFF.item_id,
        schema.STYLE_RANGED: gear.ZARYTE_CROSSBOW.item_id,
        schema.STYLE_MELEE: gear.NOXIOUS_HALBERD.item_id,
    }
    styles = (
        [from_style] * prefix
        + [to_style] * 8
        + [from_style] * prefix
        + [to_style] * 8)
    correctness = (
        [True] * prefix
        + [False, False, False, False, True, True, True, True]
        + [True] * prefix
        + [True] * 8)
    trace = [
        {
            "tick": index + 10,
            "style": evaluation.STYLE_NAMES[style],
            "correct": correct,
            "distance": 1 + index % 6,
            "attackerWeaponId": weapon_by_style[style],
        }
        for index, (style, correct) in enumerate(zip(styles, correctness))
    ]
    prayers = (*evaluation.PRAYER_NAMES,)
    decisions = [
        {
            "tick": row["tick"],
            "opponentPrayerBefore": prayers[index % len(prayers)],
        }
        for index, row in enumerate(trace)
    ]
    summary = _honest_style_transition_summary(
        [{
            "role": "first",
            "lanePrayerTrace": [trace],
            "laneDecisionPrayerTrace": [decisions],
        }],
        "honest-gear-style-transitions",
        seed=seed)
    transition = f"{from_name}->{to_name}"
    cold = next(
        block for block in summary["blocks"]
        if block["repeat"] == "cold")
    warm = next(
        block for block in summary["blocks"]
        if block["repeat"] == "warm")
    assert cold["transition"] == transition
    assert cold["blockStartAttackIndex"] == prefix
    assert cold["rolls"] == 8
    assert cold["longestMissStreak"] == 4
    assert warm["longestMissStreak"] == 0
    assert summary["byRepeat"]["cold"]["longestMissStreak"] == 4
    assert summary["byRepeat"]["warm"]["longestMissStreak"] == 0
    assert summary["distribution"]["lanesWithFourMissStreak"] == 1


def test_honest_transition_summary_excludes_only_stable_blocked_melee():
    seed = 3
    trace = [{
        "tick": 1,
        "style": "magic",
        "correct": True,
        "distance": 3,
        "attackerWeaponId": gear.ZURIELS_STAFF.item_id,
    }]
    decisions = [
        {
            "tick": tick,
            "opponentPrayerBefore": "magic",
            "opponentWeaponId": gear.NOXIOUS_HALBERD.item_id,
            "opponentFrozen": False,
            "opponentLockTicks": 0,
            "distance": 3,
            "opponentImprovingMeleeMoveLegal": False,
            "opponentX": 10,
            "opponentY": 10,
            "subjectX": 13,
            "subjectY": 10,
        }
        for tick in range(2, 14)
    ]
    summary = _honest_style_transition_summary(
        [{
            "role": "first",
            "lanePrayerTrace": [trace],
            "laneDecisionPrayerTrace": [decisions],
        }],
        "honest-gear-style-transitions",
        seed=seed)
    assert summary["distribution"]["excludedRouteBlockedBlocks"] == 2
    assert summary["distribution"]["eligibleBlocks"] == 0
    assert [
        row["reason"] for row in summary["excludedRouteBlockedBlocks"]
    ] == [
        "stable_unreachable_halberd_route",
        "not_reached_after_cold_route_block",
    ]

    decisions[6]["opponentImprovingMeleeMoveLegal"] = True
    summary = _honest_style_transition_summary(
        [{
            "role": "first",
            "lanePrayerTrace": [trace],
            "laneDecisionPrayerTrace": [decisions],
        }],
        "honest-gear-style-transitions",
        seed=seed)
    assert summary["distribution"]["excludedRouteBlockedBlocks"] == 0


def test_honest_transition_summary_reports_blocked_melee_a_prefix():
    decisions = [
        {
            "tick": tick,
            "opponentPrayerBefore": "ranged",
            "opponentWeaponId": gear.NOXIOUS_HALBERD.item_id,
            "opponentFrozen": False,
            "opponentLockTicks": 0,
            "distance": 3,
            "opponentImprovingMeleeMoveLegal": False,
            "opponentX": 20,
            "opponentY": 20,
            "subjectX": 23,
            "subjectY": 20,
        }
        for tick in range(12)
    ]
    summary = _honest_style_transition_summary(
        [{
            "role": "second",
            "lanePrayerTrace": [[]],
            "laneDecisionPrayerTrace": [decisions],
        }],
        "honest-gear-style-transitions",
        seed=12)
    assert [
        row["transition"] for row in summary["excludedRouteBlockedBlocks"]
    ] == ["melee->magic", "melee->magic"]
    assert [
        row["reason"] for row in summary["excludedRouteBlockedBlocks"]
    ] == [
        "melee_a_prefix_route_blocked_before_b",
        "not_reached_after_melee_a_prefix_route_block",
    ]


def test_terminal_summary_exposes_every_balanced_lane_for_gates():
    seed = 11
    lane_count = 6
    lane_indices = np.arange(lane_count, dtype=np.int64)
    prefix_lengths = (
        scripted_policy.ScriptedPolicy.seeded_long_prefix_lengths(
            lane_indices, seed))
    terminal_styles = (
        scripted_policy.ScriptedPolicy.seeded_long_terminal_styles(
            lane_indices, seed))
    traces = []
    for lane, (prefix_length, terminal_style) in enumerate(zip(
            prefix_lengths, terminal_styles)):
        terminal_name = evaluation.STYLE_NAMES[int(terminal_style)]
        terminal_correct = (lane % 2) == 0
        traces.append(
            [
                {"style": "magic", "correct": False}
                for _roll in range(int(prefix_length))
            ] + [
                {"style": terminal_name, "correct": False},
                {"style": terminal_name, "correct": terminal_correct},
                {"style": terminal_name, "correct": terminal_correct},
            ])

    summary = _persistent_terminal_summary(
        [{"role": "first", "lanePrayerTrace": traces}],
        "seeded-long-mr-prefix-then-persistent-balanced",
        seed=seed)
    assert summary["distribution"]["laneCount"] == lane_count
    assert summary["distribution"]["usableLanes"] == lane_count
    assert summary["distribution"]["rolls"] == lane_count * 2
    assert summary["distribution"]["correctPct"] == 50.0
    assert summary["distribution"]["minimumPct"] == 0.0
    assert summary["distribution"]["zeroCorrectLanes"] == 3
    assert summary["distribution"]["unexpectedStyleRolls"] == 0
    assert {
        style: summary["byTerminalStyle"][style]["laneCount"]
        for style in evaluation.STYLE_NAMES
    } == {"magic": 2, "ranged": 2, "melee": 2}
    for lane, row in enumerate(summary["lanes"]):
        assert row["terminalStartAttackIndex"] == int(
            prefix_lengths[lane])
        assert row["terminalStyle"] == evaluation.STYLE_NAMES[
            int(terminal_styles[lane])]
        assert row["afterFirstRolls"] == 2


def test_terminal_summary_uses_exact_human_five_roll_boundary():
    trace = [
        {"style": style, "correct": False}
        for style in ("magic", "magic", "magic", "ranged", "magic")
    ] + [
        {"style": "ranged", "correct": False},
        {"style": "ranged", "correct": True},
        {"style": "ranged", "correct": True},
    ]
    summary = _persistent_terminal_summary(
        [{"role": "first", "lanePrayerTrace": [trace]}],
        "live-mmmrm-then-persistent-ranged")
    lane = summary["lanes"][0]
    assert lane["terminalStyle"] == "ranged"
    assert lane["terminalStartAttackIndex"] == 5
    assert lane["phaseRolls"] == 3
    assert lane["unexpectedStyleRolls"] == 0
    assert lane["afterFirstCorrectPct"] == 100.0


def test_varied_halberd_curriculum_has_independent_openers_and_switch_times():
    scripted = scripted_policy.ScriptedPolicy(
        "varied-opener-then-halberd")
    inputs = np.zeros((32, schema.INPUT_SIZE), dtype=np.float32)
    staff_local = int(np.flatnonzero(
        gear.DIRECT_GEAR_ITEMS == gear.ZURIELS_STAFF.item_id)[0])
    crossbow_local = int(np.flatnonzero(
        gear.DIRECT_GEAR_ITEMS == gear.ZARYTE_CROSSBOW.item_id)[0])
    vls_local = int(np.flatnonzero(
        gear.DIRECT_GEAR_ITEMS == gear.VESTAS_LONGSWORD.item_id)[0])
    halberd_local = int(np.flatnonzero(
        gear.DIRECT_GEAR_ITEMS == gear.NOXIOUS_HALBERD.item_id)[0])

    first_scores, _values = scripted.score(inputs)
    first_styles = _selected_ordinary_style(first_scores)
    assert np.array_equal(
        first_styles[1::2][:4],
        np.array([
            schema.STYLE_MELEE,
            schema.STYLE_MAGIC,
            schema.STYLE_RANGED,
            schema.STYLE_MELEE,
        ]))
    assert first_scores[1, schema.GEAR_BASE + halberd_local] == 100.0
    assert first_scores[3, schema.GEAR_BASE + staff_local] == 100.0
    assert first_scores[5, schema.GEAR_BASE + crossbow_local] == 100.0
    assert first_scores[7, schema.GEAR_BASE + vls_local] == 100.0

    # Lanes 4-7 switch after five decisions, while lanes 8-11 retain
    # their opener for a sixth decision.
    for _tick in range(4):
        scripted.score(inputs)
    fifth_scores, _values = scripted.score(inputs)
    sixth_scores, _values = scripted.score(inputs)
    assert fifth_scores[11, schema.GEAR_BASE + halberd_local] == 100.0
    assert fifth_scores[19, schema.GEAR_BASE + staff_local] == 100.0
    assert sixth_scores[19, schema.GEAR_BASE + halberd_local] == 100.0


def test_smite_has_explicit_legal_protect_magic_fallback():
    fixed = scripted_policy.ScriptedPolicy("fixed-melee", defence="smite")
    scores, _values = fixed.score(
        np.zeros((1, schema.INPUT_SIZE), dtype=np.float32))
    defence_scores = scores[
        0,
        schema.DEFENCE_BASE:
        schema.DEFENCE_BASE + schema.DEFENCE_COUNT,
    ]
    smite = schema.PRAY_SMITE
    assert defence_scores[smite] == 100.0
    defence_scores[smite] = -np.inf
    assert int(np.argmax(defence_scores)) == schema.PRAY_PROTECT_MAGIC


def _scripted_defence_actions(
        fixed: scripted_policy.ScriptedPolicy,
        inputs: np.ndarray) -> np.ndarray:
    scores, _values = fixed.score(inputs)
    return np.argmax(
        scores[
            :,
            schema.DEFENCE_BASE:
            schema.DEFENCE_BASE + schema.DEFENCE_COUNT,
        ],
        axis=1)


def test_melee_defence_holds_through_repeated_attack_observations():
    fixed = scripted_policy.ScriptedPolicy(
        "fixed-melee", defence="melee")
    inputs = np.zeros((8, schema.INPUT_SIZE), dtype=np.float32)

    for observed_age in (1, 2, 3, 4, 5, 1, 2, 3):
        inputs[:, schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK] = (
            observed_age
            / schema.OPPONENT_OBSERVED_ATTACK_AGE_NORMALIZER)
        actions = _scripted_defence_actions(fixed, inputs)
        assert np.all(actions == schema.PRAY_PROTECT_MELEE)


def test_delayed_melee_magic_defence_uses_lane_varied_vls_cycles():
    fixed = scripted_policy.ScriptedPolicy(
        "fixed-melee", defence="melee-magic-delayed")
    inputs = np.zeros((8, schema.INPUT_SIZE), dtype=np.float32)
    actions_by_tick = np.stack([
        _scripted_defence_actions(fixed, inputs)
        for _tick in range(26)
    ])
    opponent_rows = actions_by_tick[:, 1::2]

    # Lane 0 holds Melee for one five-tick VLS cycle, lane 1 for two,
    # lane 2 for three and lane 3 for four. Each then has a five-tick
    # Protect-Magic block before returning to Melee.
    for lane, melee_ticks in enumerate((5, 10, 15, 20)):
        assert np.all(
            opponent_rows[:melee_ticks, lane]
            == schema.PRAY_PROTECT_MELEE)
        assert np.all(
            opponent_rows[melee_ticks:melee_ticks + 5, lane]
            == schema.PRAY_PROTECT_MAGIC)
        assert opponent_rows[melee_ticks + 5, lane] == (
            schema.PRAY_PROTECT_MELEE)


def test_reactive_melee_magic_defence_varies_post_attack_hold_by_lane():
    fixed = scripted_policy.ScriptedPolicy(
        "fixed-melee", defence="melee-magic-reactive")
    inputs = np.zeros((8, schema.INPUT_SIZE), dtype=np.float32)

    for fight_lane, melee_ticks in enumerate((1, 2, 3, 4)):
        row = fight_lane * 2 + 1
        inputs[
            row,
            schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK,
        ] = melee_ticks / schema.OPPONENT_OBSERVED_ATTACK_AGE_NORMALIZER
    actions = _scripted_defence_actions(fixed, inputs)
    assert np.all(actions[1::2] == schema.PRAY_PROTECT_MELEE)

    for fight_lane, melee_ticks in enumerate((1, 2, 3, 4)):
        row = fight_lane * 2 + 1
        inputs[
            row,
            schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK,
        ] = (
            (melee_ticks + 1)
            / schema.OPPONENT_OBSERVED_ATTACK_AGE_NORMALIZER)
    actions = _scripted_defence_actions(fixed, inputs)
    assert np.all(actions[1::2] == schema.PRAY_PROTECT_MAGIC)


def test_fixed_melee_chases_from_random_distance_and_stops_in_reach():
    fixed = scripted_policy.ScriptedPolicy("fixed-melee")
    inputs = np.zeros((2, schema.INPUT_SIZE), dtype=np.float32)
    inputs[:, schema.INPUT_TARGET_REL_DX] = np.array([6.0, 1.0]) / 16.0
    inputs[:, schema.INPUT_MELEE_REACH] = np.array([0.0, 1.0])

    scores, _values = fixed.score(inputs)
    step_two_east = int(np.flatnonzero(
        np.all(schema.MOVEMENT_OFFSETS == (2, 0), axis=1))[0])
    movement = scores[
        :,
        schema.MOVEMENT_BASE:
        schema.MOVEMENT_BASE + schema.MOVEMENT_COUNT,
    ]

    assert movement[0, step_two_east] > movement[0, schema.MOVE_NONE]
    assert movement[1, step_two_east] < movement[1, schema.MOVE_NONE]


def test_fixed_vls_probe_launches_vls_and_no_ordinary_melee():
    passive = scripted_policy.ScriptedPolicy(
        "passive", defence="magic")
    vls = scripted_policy.ScriptedPolicy("vls-pressure")
    runner = evaluation.EvaluationEngine(
        n_fights=4,
        policy=passive,
        opponent_policy=vls,
        subject_side=1,
        seed=109,
        replay_seed=6109,
        epsilon=0.0,
        max_ticks=30,
        start_distance_min=1,
        start_distance_max=1,
        world_id=35)
    runner.run(on_record=lambda _record: None)
    report = runner.evaluation.report()
    melee = report["outgoingMeleeIntoProtectMelee"]
    assert report["completedFights"] == 4
    assert melee["vls"]["rolls"] > 0
    assert melee["ordinary"]["rolls"] == 0


def test_fixed_voidwaker_probe_launches_voidwaker_and_no_ordinary_melee():
    passive = scripted_policy.ScriptedPolicy(
        "passive", defence="magic")
    voidwaker = scripted_policy.ScriptedPolicy("voidwaker-pressure")
    runner = evaluation.EvaluationEngine(
        n_fights=4,
        policy=passive,
        opponent_policy=voidwaker,
        subject_side=1,
        seed=111,
        replay_seed=6111,
        epsilon=0.0,
        max_ticks=30,
        start_distance_min=1,
        start_distance_max=1,
        world_id=36)
    runner.run(on_record=lambda _record: None)
    report = runner.evaluation.report()
    melee = report["outgoingMeleeIntoProtectMelee"]
    assert report["completedFights"] == 4
    assert report["outgoingStyleSpread"]["magic"] > 0
    assert melee["ordinary"]["rolls"] == 0


def _selected_ordinary_style(scores: np.ndarray) -> np.ndarray:
    attack_scores = np.stack([
        scores[
            :,
            schema.COMBAT_ATTACK_BASE
            + style * 2
            + schema.ATTACK_INTENT_ATTACK,
        ]
        for style in (
            schema.STYLE_MAGIC,
            schema.STYLE_RANGED,
            schema.STYLE_MELEE)
    ], axis=1)
    return np.argmax(attack_scores, axis=1)


def test_adaptive_attack_uses_delayed_prayer_and_matching_direct_gear():
    adaptive = scripted_policy.ScriptedPolicy("adaptive-off-prayer")
    inputs = np.zeros((6, schema.INPUT_SIZE), dtype=np.float32)
    inputs[0:2, schema.INPUT_OPP_PROTECT_MAGIC] = 1.0
    inputs[2:4, schema.INPUT_OPP_PROTECT_RANGED] = 1.0
    inputs[4:6, schema.INPUT_OPP_PROTECT_MELEE] = 1.0

    scores, _values = adaptive.score(inputs)
    selected = _selected_ordinary_style(scores)

    assert np.all(selected[0:2] != schema.STYLE_MAGIC)
    assert np.all(selected[2:4] != schema.STYLE_RANGED)
    assert np.all(selected[4:6] != schema.STYLE_MELEE)
    for row, style in enumerate(selected):
        item_id = (
            gear.ZURIELS_STAFF.item_id,
            gear.ZARYTE_CROSSBOW.item_id,
            gear.VESTAS_LONGSWORD.item_id,
        )[style]
        local = int(np.flatnonzero(
            gear.DIRECT_GEAR_ITEMS == item_id)[0])
        assert scores[row, schema.GEAR_BASE + local] == 100.0


def test_adaptive_attack_alternates_the_two_unprotected_styles():
    adaptive = scripted_policy.ScriptedPolicy("adaptive-off-prayer")
    inputs = np.zeros((4, schema.INPUT_SIZE), dtype=np.float32)
    inputs[:, schema.INPUT_OPP_PROTECT_MELEE] = 1.0

    first, _values = adaptive.score(inputs)
    second, _values = adaptive.score(inputs)
    first_style = _selected_ordinary_style(first)
    second_style = _selected_ordinary_style(second)

    assert np.array_equal(
        first_style,
        np.array([
            schema.STYLE_MAGIC,
            schema.STYLE_MAGIC,
            schema.STYLE_RANGED,
            schema.STYLE_RANGED,
        ]))
    assert np.array_equal(
        second_style,
        np.array([
            schema.STYLE_RANGED,
            schema.STYLE_RANGED,
            schema.STYLE_MAGIC,
            schema.STYLE_MAGIC,
        ]))


def test_adaptive_attack_chases_only_selected_melee_out_of_reach():
    adaptive = scripted_policy.ScriptedPolicy("adaptive-off-prayer")
    inputs = np.zeros((4, schema.INPUT_SIZE), dtype=np.float32)
    inputs[:, schema.INPUT_OPP_PROTECT_MAGIC] = 1.0
    inputs[:, schema.INPUT_TARGET_REL_DX] = 6.0 / 16.0
    inputs[:, schema.INPUT_MELEE_REACH] = np.array([0.0, 0.0, 0.0, 1.0])

    scores, _values = adaptive.score(inputs)
    selected = _selected_ordinary_style(scores)
    movement = scores[
        :,
        schema.MOVEMENT_BASE:
        schema.MOVEMENT_BASE + schema.MOVEMENT_COUNT,
    ]
    step_two_east = int(np.flatnonzero(
        np.all(schema.MOVEMENT_OFFSETS == (2, 0), axis=1))[0])

    assert np.array_equal(
        selected,
        np.array([
            schema.STYLE_RANGED,
            schema.STYLE_RANGED,
            schema.STYLE_MELEE,
            schema.STYLE_MELEE,
        ]))
    assert movement[0, step_two_east] < movement[0, schema.MOVE_NONE]
    assert movement[1, step_two_east] < movement[1, schema.MOVE_NONE]
    assert movement[2, step_two_east] > movement[2, schema.MOVE_NONE]
    assert movement[3, step_two_east] < movement[3, schema.MOVE_NONE]


def test_fixed_attack_cli_maps_adaptive_to_the_shared_script():
    assert ATTACK_SCRIPT_BY_CHOICE["halberd"] == "fixed-halberd"
    assert ATTACK_SCRIPT_BY_CHOICE["magic-halberd"] == (
        "magic-then-halberd")
    assert ATTACK_SCRIPT_BY_CHOICE["magic1-halberd"] == (
        "one-magic-then-halberd")
    assert "adaptive" in ATTACK_CHOICES
    assert ATTACK_SCRIPT_BY_CHOICE["adaptive"] == "adaptive-off-prayer"
    assert "adaptive-random" in ATTACK_CHOICES
    assert ATTACK_SCRIPT_BY_CHOICE["adaptive-random"] == (
        "adaptive-random-off-prayer")
    assert ATTACK_SCRIPT_BY_CHOICE["random"] == "hidden-random-style"
    assert ATTACK_SCRIPT_BY_CHOICE["block-switch"] == (
        "seeded-block-switch")
    assert ATTACK_SCRIPT_BY_CHOICE["voidwaker"] == "voidwaker-pressure"
    assert "voidwaker-pressure" in (
        scripted_policy.EVALUATION_ONLY_SCRIPT_NAMES)


def test_forced_prayer_benchmark_changes_only_the_defence_channel():
    class StubPolicy:
        def score(self, inputs, **_kwargs):
            count = inputs.shape[0]
            return (
                np.arange(schema.ACTION_COUNT, dtype=np.float32)[None, :]
                .repeat(count, axis=0),
                np.zeros(count, dtype=np.float32))

        def condition_direct_gear(self, scores, *_args, **_kwargs):
            return scores

    original, _ = StubPolicy().score(
        np.zeros((2, schema.INPUT_SIZE), dtype=np.float32))
    forced, _ = _ForcedPrayerPolicy(
        StubPolicy(), "ranged").score(
            np.zeros((2, schema.INPUT_SIZE), dtype=np.float32))

    before = original.copy()
    before[:, schema.DEFENCE_BASE:
           schema.DEFENCE_BASE + schema.DEFENCE_COUNT] = 0.0
    after = forced.copy()
    after[:, schema.DEFENCE_BASE:
          schema.DEFENCE_BASE + schema.DEFENCE_COUNT] = 0.0
    assert np.array_equal(before, after)
    assert np.argmax(
        forced[:, schema.DEFENCE_BASE:
               schema.DEFENCE_BASE + schema.DEFENCE_COUNT], axis=1
    ).tolist() == [schema.PRAY_PROTECT_MISSILES] * 2


def test_adaptive_random_is_seeded_diverse_and_matches_direct_gear():
    inputs = np.zeros((32, schema.INPUT_SIZE), dtype=np.float32)
    inputs[:, schema.INPUT_OPP_PROTECT_MELEE] = 1.0
    first = scripted_policy.ScriptedPolicy(
        "adaptive-random-off-prayer", seed=6109)
    replay = scripted_policy.ScriptedPolicy(
        "adaptive-random-off-prayer", seed=6109)

    seen = set()
    for _tick in range(8):
        first_scores, _values = first.score(inputs)
        replay_scores, _values = replay.score(inputs)
        assert np.array_equal(first_scores, replay_scores)
        selected = _selected_ordinary_style(first_scores)
        seen.update(int(style) for style in selected)
        assert not np.any(selected == schema.STYLE_MELEE)
        for row, style in enumerate(selected):
            item_id = (
                gear.ZURIELS_STAFF.item_id,
                gear.ZARYTE_CROSSBOW.item_id,
                gear.VESTAS_LONGSWORD.item_id,
            )[style]
            local = int(np.flatnonzero(
                gear.DIRECT_GEAR_ITEMS == item_id)[0])
            assert first_scores[
                row, schema.GEAR_BASE + local] == 100.0

    assert seen == {schema.STYLE_MAGIC, schema.STYLE_RANGED}


def test_hidden_random_style_is_seeded_uniform_and_prayer_independent():
    clear_inputs = np.zeros((24, schema.INPUT_SIZE), dtype=np.float32)
    prayed_inputs = clear_inputs.copy()
    prayed_inputs[:, schema.INPUT_OPP_PROTECT_MELEE] = 1.0
    clear = scripted_policy.ScriptedPolicy(
        "hidden-random-style", seed=761101)
    prayed = scripted_policy.ScriptedPolicy(
        "hidden-random-style", seed=761101)
    seen = set()

    for _tick in range(12):
        clear_scores, _values = clear.score(clear_inputs)
        prayed_scores, _values = prayed.score(prayed_inputs)
        clear_styles = _selected_ordinary_style(clear_scores)
        prayed_styles = _selected_ordinary_style(prayed_scores)
        assert np.array_equal(clear_styles, prayed_styles)
        seen.update(int(style) for style in clear_styles)
        for row, style in enumerate(clear_styles):
            item_id = (
                gear.ZURIELS_STAFF.item_id,
                gear.ZARYTE_CROSSBOW.item_id,
                gear.VESTAS_LONGSWORD.item_id,
            )[style]
            local = int(np.flatnonzero(
                gear.DIRECT_GEAR_ITEMS == item_id)[0])
            assert clear_scores[
                row, schema.GEAR_BASE + local] == 100.0

    assert seen == {
        schema.STYLE_MAGIC,
        schema.STYLE_RANGED,
        schema.STYLE_MELEE,
    }


def test_seeded_block_switch_covers_every_permutation_by_attack_roll():
    clear_inputs = np.zeros((12, schema.INPUT_SIZE), dtype=np.float32)
    prayed_inputs = clear_inputs.copy()
    prayed_inputs[:, schema.INPUT_OPP_PROTECT_MAGIC] = 1.0
    clear = scripted_policy.ScriptedPolicy(
        "seeded-block-switch", seed=761101)
    prayed = scripted_policy.ScriptedPolicy(
        "seeded-block-switch", seed=761101)
    expected_slots = (0, 1, 0, 0, 0, 2, 2)
    clear_sequences = [[] for _lane in range(6)]
    prayed_sequences = [[] for _lane in range(6)]

    for attack_index in range(len(expected_slots)):
        clear_inputs[:, schema.INPUT_SELF_ATTACK_READY] = 1.0
        prayed_inputs[:, schema.INPUT_SELF_ATTACK_READY] = 1.0
        clear_scores, _values = clear.score(clear_inputs)
        prayed_scores, _values = prayed.score(prayed_inputs)
        clear_styles = _selected_ordinary_style(clear_scores)[1::2]
        prayed_styles = _selected_ordinary_style(prayed_scores)[1::2]
        for lane, style in enumerate(clear_styles):
            clear_sequences[lane].append(int(style))
        for lane, style in enumerate(prayed_styles):
            prayed_sequences[lane].append(int(style))
        assert np.array_equal(clear_styles, prayed_styles)

        if attack_index + 1 < len(expected_slots):
            prior_styles = _selected_ordinary_style(clear_scores)
            clear_inputs[:, schema.INPUT_SELF_ATTACK_READY] = 0.0
            prayed_inputs[:, schema.INPUT_SELF_ATTACK_READY] = 0.0
            cooldown_scores, _values = clear.score(clear_inputs)
            prayed_cooldown_scores, _values = prayed.score(prayed_inputs)
            assert np.array_equal(
                _selected_ordinary_style(cooldown_scores), prior_styles)
            assert np.array_equal(
                _selected_ordinary_style(cooldown_scores),
                _selected_ordinary_style(prayed_cooldown_scores))

    expected_permutations = {
        (schema.STYLE_MAGIC, schema.STYLE_RANGED, schema.STYLE_MELEE),
        (schema.STYLE_MAGIC, schema.STYLE_MELEE, schema.STYLE_RANGED),
        (schema.STYLE_RANGED, schema.STYLE_MAGIC, schema.STYLE_MELEE),
        (schema.STYLE_RANGED, schema.STYLE_MELEE, schema.STYLE_MAGIC),
        (schema.STYLE_MELEE, schema.STYLE_MAGIC, schema.STYLE_RANGED),
        (schema.STYLE_MELEE, schema.STYLE_RANGED, schema.STYLE_MAGIC),
    }
    expected_sequences = {
        tuple(permutation[slot] for slot in expected_slots)
        for permutation in expected_permutations
    }
    assert set(map(tuple, clear_sequences)) == expected_sequences
    assert clear_sequences == prayed_sequences

    staff_local = int(np.flatnonzero(
        gear.DIRECT_GEAR_ITEMS == gear.ZURIELS_STAFF.item_id)[0])
    crossbow_local = int(np.flatnonzero(
        gear.DIRECT_GEAR_ITEMS == gear.ZARYTE_CROSSBOW.item_id)[0])
    halberd_local = int(np.flatnonzero(
        gear.DIRECT_GEAR_ITEMS == gear.NOXIOUS_HALBERD.item_id)[0])
    for row, style in enumerate(_selected_ordinary_style(clear_scores)):
        local = {
            schema.STYLE_MAGIC: staff_local,
            schema.STYLE_RANGED: crossbow_local,
            schema.STYLE_MELEE: halberd_local,
        }[int(style)]
        assert clear_scores[row, schema.GEAR_BASE + local] == 100.0


def test_fixed_attack_aggregate_retains_post_opening_prayer_metrics():
    def cell(
            opening: int,
            incoming: tuple[tuple[int, int], ...],
            post_opening: tuple[tuple[int, int], ...]) -> dict:
        total_rolls = sum(rolls for rolls, _correct in incoming)
        return {"metrics": {
            "completedFights": 1,
            "rollPrayerByIncomingStyle": {
                name: {"rolls": rolls, "correct": correct}
                for name, (rolls, correct) in zip(
                    evaluation.STYLE_NAMES, incoming)
            },
            "openingIncomingAttackRolls": opening,
            "postOpeningIncomingAttackRolls": sum(
                rolls for rolls, _correct in post_opening),
            "postOpeningRollPrayerByIncomingStyle": {
                name: {"rolls": rolls, "correct": correct}
                for name, (rolls, correct) in zip(
                    evaluation.STYLE_NAMES, post_opening)
            },
            "activePrayerShare": {
                name: {
                    "rolls": total_rolls if index == 0 else 0,
                }
                for index, name in enumerate(evaluation.PRAYER_NAMES)
            },
            "prayerOwnWeaponShortcut": {
                "knownOwnWeaponStyleRolls": total_rolls,
                "prayerMatchesOwnWeaponStyle": total_rolls // 2,
                "incomingStyleDiffersFromOwnWeaponRolls": total_rolls,
                "differingPrayerMatchesOwnWeaponStyle": total_rolls // 2,
                "differingPrayerCorrect": sum(
                    correct for _rolls, correct in incoming),
            },
        }}

    aggregate = _aggregate([
        cell(2, ((6, 3), (1, 1), (0, 0)),
             ((4, 3), (1, 1), (0, 0))),
        cell(3, ((2, 1), (3, 0), (3, 1)),
             ((1, 1), (2, 0), (2, 1))),
    ])

    assert aggregate["openingIncomingAttackRolls"] == 5
    assert aggregate["postOpeningIncomingAttackRolls"] == 10
    assert aggregate["postOpeningRollPrayerCorrectPct"] == 60.0
    assert aggregate["postOpeningRollPrayerByIncomingStyle"] == {
        "magic": {"rolls": 5, "correct": 4, "correctPct": 80.0},
        "ranged": {"rolls": 3, "correct": 1, "correctPct": 33.333},
        "melee": {"rolls": 2, "correct": 1, "correctPct": 50.0},
    }
    assert aggregate["prayerOwnWeaponShortcut"] == {
        "knownOwnWeaponStyleRolls": 15,
        "prayerMatchesOwnWeaponStyle": 7,
        "incomingStyleDiffersFromOwnWeaponRolls": 15,
        "differingPrayerMatchesOwnWeaponStyle": 7,
        "differingPrayerCorrect": 6,
        "prayerMatchesOwnWeaponStylePct": 46.667,
        "differingPrayerMatchesOwnWeaponStylePct": 46.667,
        "differingPrayerCorrectPct": 40.0,
    }


def test_generate_writes_v26_scripted_cohort_rows(tmp_path: Path):
    output = tmp_path / "scripted-vls.nhrl"
    result = generate.main([
        "--fights", "2",
        "--max-ticks", "12",
        "--workers", "1",
        "--opponent-script", "vls-pressure",
        "--opponent-script-defence", "melee",
        "--epsilon", "0",
        "--start-distance-min", "1",
        "--start-distance-max", "1",
        "--world-id", "35",
        "--out", str(output),
        "--seed", "6109",
    ])
    assert result == 0

    sys.path.insert(0, str(trainer_dir()))
    import nh_rollout as rollout  # noqa: E402

    header = rollout.read_header(output)
    raw = rollout.RolloutFile(output).records
    scripted_side = (raw["bot_index"] % 2) == 0
    vls_row = (
        schema.COMBAT_SPEC_BASE
        + schema.SPEC_VESTA_LONGSWORD * 2
        + schema.ATTACK_INTENT_ATTACK)

    assert header.version == schema.NHRL_VERSION
    assert header.input_size == schema.INPUT_SIZE
    assert header.action_count == schema.ACTION_COUNT
    assert np.all(
        raw["source_pair_mode_code"] == schema.PAIR_MODE_COHORT)
    assert np.all(raw["opponent_snapshot_id"] == -1)
    assert np.any(
        raw["channel_action_labels"][scripted_side, 1] == vls_row)
    assert np.count_nonzero(raw["roll_prayer_teacher_action"] >= 0) > 0


def test_generate_can_place_main_policy_on_second_side(tmp_path: Path):
    output = tmp_path / "scripted-first.nhrl"
    result = generate.main([
        "--fights", "2",
        "--max-ticks", "12",
        "--workers", "1",
        "--main-policy-side", "second",
        "--opponent-script", "fixed-melee",
        "--opponent-script-defence", "melee",
        "--epsilon", "0",
        "--start-distance-min", "1",
        "--start-distance-max", "1",
        "--world-id", "35",
        "--out", str(output),
        "--seed", "6110",
    ])
    assert result == 0

    sys.path.insert(0, str(trainer_dir()))
    import nh_rollout as rollout  # noqa: E402

    raw = rollout.RolloutFile(output).records
    scripted_side = (raw["bot_index"] % 2) == 1
    melee_row = (
        schema.COMBAT_ATTACK_BASE
        + schema.STYLE_MELEE * 2
        + schema.ATTACK_INTENT_ATTACK)
    sidecar = __import__("json").loads(
        output.with_suffix(".fastsim.json").read_text(encoding="utf-8"))

    assert np.any(
        raw["channel_action_labels"][scripted_side, 0] == melee_row)
    assert sidecar["mainPolicySide"] == 1
    assert sidecar["mainPolicyBotIndexParity"] == "even"
