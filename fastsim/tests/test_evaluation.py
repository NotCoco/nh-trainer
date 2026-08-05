"""Focused tests for exact-distance and evaluation-only compatibility."""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from fastsim import engine, evaluation, gear, policy, schema, world_map
from evaluate_paired import (
    MAX_CELL_WORKERS,
    build_cell_tasks,
    order_cell_results,
    run_cell_task,
    run_vectorized_cell_tasks,
    safe_magic_ward_gate,
    selected_roles,
    selected_scenarios,
    sum_nested_metrics,
    validate_cell_workers,
    visible_protected_ordinary_melee_gate,
)


SERVER = (
    ROOT.parent
    / "kronos-osrs-184-master"
    / "kronos-osrs-184-master"
    / "Kronos-master"
    / "kronos-server")
TEACHER1 = (
    SERVER / "tools" / "nh-gpu-trainer" / "checkpoints"
    / "solana2-dmm-v16-closeheavy-bodylegs-teacher1-fresh-4w-20260715-g1.pt")


class FixedPolicy:
    action_ids = schema.CURRENT_ACTION_IDS
    action_count = schema.ACTION_COUNT

    def __init__(self, defence: int):
        self.defence = defence

    def score(self, inputs):
        scores = np.zeros((len(inputs), schema.ACTION_COUNT), dtype=np.float32)
        scores[:, schema.COMBAT_ATTACK_BASE] = 3.0
        scores[:, schema.COMBAT_SPEC_NONE] = 1.0
        scores[:, schema.DEFENCE_BASE + self.defence] = 3.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 3.0
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 3.0
        return scores, np.zeros(len(inputs), dtype=np.float32)


class FixedStylePolicy(FixedPolicy):
    def __init__(self, style: int):
        super().__init__(schema.PRAY_PROTECT_MELEE)
        self.style = style

    def score(self, inputs):
        scores, value = super().score(inputs)
        scores[:, schema.COMBAT_BASE:schema.COMBAT_SPEC_NONE] = 0.0
        attack = (
            schema.COMBAT_BASE
            + schema.COMBAT_ATTACK_BASE
            + self.style * 2
            + schema.ATTACK_INTENT_ATTACK)
        scores[:, attack] = 3.0
        return scores, value


class FullBookkeepingEvaluationEngine(evaluation.EvaluationEngine):
    """The pre-optimization evaluator, retained only as a parity oracle."""

    _append_reward_event = engine.Engine._append_reward_event
    _emit_rolling_reward_events = engine.Engine._emit_rolling_reward_events
    _book_offensive_style_teacher = (
        engine.Engine._book_offensive_style_teacher)
    _book_roll_offensive_gear_teacher = (
        engine.Engine._book_roll_offensive_gear_teacher)
    _offensive_gear_influence_mask = (
        engine.Engine._offensive_gear_influence_mask)
    _finalize_tank_reward_events = (
        engine.Engine._finalize_tank_reward_events)


def test_exact_distance_uses_cache_derived_lanes():
    for distance in (1, 6):
        assert world_map.SELF_PLAY_MAP.has_plan(35, distance, distance)
        plan = world_map.SELF_PLAY_MAP.initial_lanes(
            35, distance, distance, 64)
        assert plan is not None
        assert np.all(plan.distance == distance)
        assert np.all(world_map.SELF_PLAY_MAP._wilderness(
            plan.x, plan.y))
        assert np.all(world_map.SELF_PLAY_MAP._wilderness(
            plan.x + plan.distance, plan.y))


def test_paired_eval_filters_preserve_full_default_matrix():
    assert selected_scenarios("both", 1, 6) == (
        ("close", 1),
        ("normal", 6))
    assert selected_roles("both") == (("first", 0), ("second", 1))


def test_paired_eval_filters_select_one_focused_cell_axis():
    assert selected_scenarios("normal", 1, 6) == (("normal", 6),)
    assert selected_scenarios("close", 1, 6) == (("close", 1),)
    assert selected_roles("first") == (("first", 0),)
    assert selected_roles("second") == (("second", 1),)


def test_paired_eval_cell_tasks_preserve_matrix_order_and_matched_seeds():
    tasks = build_cell_tasks(
        ("A", "B"),
        (("close", 1), ("normal", 6)),
        (("first", 0), ("second", 1)),
        seed=100,
        replay_seed=1000,
        n_fights=8,
        episodes_per_lane=1,
        max_ticks=300,
        world_id=37)

    assert [task.index for task in tasks] == list(range(16))
    assert [task.subject for task in tasks[:8]] == ["candidate"] * 8
    assert [task.subject for task in tasks[8:]] == ["control"] * 8
    assert [
        (task.anchor, task.scenario, task.role, task.subject_side)
        for task in tasks[:8]
    ] == [
        ("A", "close", "first", 0),
        ("A", "close", "second", 1),
        ("A", "normal", "first", 0),
        ("A", "normal", "second", 1),
        ("B", "close", "first", 0),
        ("B", "close", "second", 1),
        ("B", "normal", "first", 0),
        ("B", "normal", "second", 1),
    ]
    assert [task.seed for task in tasks[:8]] == [
        100, 117, 201, 218, 1109, 1126, 1210, 1227]
    assert [task.replay_seed for task in tasks[:8]] == [
        1000, 1017, 1101, 1118, 2009, 2026, 2110, 2127]
    assert [task.seed for task in tasks[8:]] == [
        task.seed for task in tasks[:8]]
    assert [task.replay_seed for task in tasks[8:]] == [
        task.replay_seed for task in tasks[:8]]


def test_paired_eval_cell_results_restore_original_task_order():
    cells = order_cell_results([
        (2, {"name": "third"}),
        (0, {"name": "first"}),
        (1, {"name": "second"}),
    ], 3)
    assert [cell["name"] for cell in cells] == [
        "first", "second", "third"]


def test_vectorized_cells_preserve_independent_seeded_cell_results():
    tasks = build_cell_tasks(
        ("anchor",),
        (("close", 1), ("normal", 6)),
        (("first", 0), ("second", 1)),
        seed=173,
        replay_seed=9173,
        n_fights=2,
        episodes_per_lane=2,
        max_ticks=16,
        world_id=35)
    serial_subjects = {
        "candidate": FixedPolicy(schema.PRAY_PROTECT_MAGIC),
        "control": FixedPolicy(schema.PRAY_PROTECT_MISSILES),
    }
    serial_anchors = {
        "anchor": FixedPolicy(schema.PRAY_PROTECT_MELEE)}
    expected = [
        run_cell_task(task, serial_subjects, serial_anchors)
        for task in tasks
    ]

    vector_subjects = {
        "candidate": FixedPolicy(schema.PRAY_PROTECT_MAGIC),
        "control": FixedPolicy(schema.PRAY_PROTECT_MISSILES),
    }
    vector_anchors = {
        "anchor": FixedPolicy(schema.PRAY_PROTECT_MELEE)}
    actual, stats = run_vectorized_cell_tasks(
        tasks, vector_subjects, vector_anchors)

    assert actual == expected
    assert stats["parallelCells"] == len(tasks)
    assert stats["vectorizedFightLanes"] == sum(
        task.n_fights for task in tasks)


def test_paired_eval_cell_worker_validation_is_cpu_only_and_capped():
    for workers, device in (
            (1, "auto"),
            (1, "cuda"),
            (1, "cpu"),
            (2, "cpu"),
            (MAX_CELL_WORKERS, "cpu")):
        validate_cell_workers(workers, device)

    for workers, device in (
            (0, "cpu"),
            (MAX_CELL_WORKERS + 1, "cpu"),
            (2, "auto"),
            (2, "cuda")):
        try:
            validate_cell_workers(workers, device)
        except ValueError:
            pass
        else:
            raise AssertionError(
                f"accepted invalid cell worker setting: {workers}, {device}")


def test_eval_collector_records_roll_time_prayer_and_completion():
    runner = evaluation.EvaluationEngine(
        n_fights=8,
        policy=FixedPolicy(schema.PRAY_PROTECT_MAGIC),
        opponent_policy=FixedPolicy(schema.PRAY_PROTECT_MISSILES),
        subject_side=0,
        seed=3,
        replay_seed=7,
        epsilon=0.0,
        max_ticks=30,
        start_distance_min=1,
        start_distance_max=1,
        world_id=35)
    runner.run(on_record=lambda _record: None)
    report = runner.evaluation.report()
    assert report["completedFights"] == 8
    assert report["incomingAttackRolls"] > 0
    assert report["rollPrayerByIncomingStyle"]["magic"]["rolls"] > 0
    # The launch-tick prayer decision is intentionally ineffective, so each
    # fight's opening cast lands before Protect Magic can count.
    assert report["rollPrayerByIncomingStyle"]["magic"]["correctPct"] > 80.0
    assert report["activePrayerShare"]["none"]["rolls"] == 8
    assert report["isolation"]["outsideCachedMapSamples"] == 0


def test_eval_collector_splits_melee_and_safe_magic_gear_at_roll():
    collector = evaluation.EvaluationCollector(2, subject_side=0)
    equipped = np.full((2, 2, gear.SLOT_COUNT), -1, dtype=np.int32)
    equipped[:, 0, gear.SLOT_WEAPON] = gear.ZURIELS_STAFF.item_id
    equipped[:, 0, gear.SLOT_CHEST] = gear.VIRTUS_ROBE_TOP.item_id
    equipped[0, 0, gear.SLOT_LEGS] = gear.VIRTUS_ROBE_BOTTOM.item_id
    equipped[1, 0, gear.SLOT_LEGS] = gear.TORVA_PLATELEGS.item_id
    equipped[0, 0, gear.SLOT_SHIELD] = gear.ELIDINIS_WARD_F.item_id
    equipped[1, 0, gear.SLOT_SHIELD] = gear.DRAGONFIRE_SHIELD.item_id
    state = SimpleNamespace(
        weapon_id=equipped[:, :, gear.SLOT_WEAPON].copy(),
        equipped_ids=equipped,
        attack_delay=np.asarray([[0, 2], [0, 0]], dtype=np.int32),
        episode_id=np.zeros((2, 2), dtype=np.int32),
        seen_opp_overhead=np.asarray([
            [schema.PRAY_PROTECT_MELEE, -1],
            [-1, -1],
        ], dtype=np.int32),
    )
    fired = np.asarray([[True, False], [True, False]])
    styles = np.asarray([
        [schema.STYLE_MAGIC, -1],
        [schema.STYLE_MAGIC, -1],
    ])
    protected = np.zeros((2, 2), dtype=bool)
    overhead = np.full((2, 2), -1, dtype=np.int32)
    switch_ticks = np.full((2, 2), -1000, dtype=np.int64)
    collector.begin_roll(
        state, fired, styles, protected, overhead, 10, switch_ticks)

    state.weapon_id[:, 0] = gear.NOXIOUS_HALBERD.item_id
    state.equipped_ids[:, 0, gear.SLOT_WEAPON] = (
        gear.NOXIOUS_HALBERD.item_id)
    melee_styles = np.asarray([
        [schema.STYLE_MELEE, -1],
        [schema.STYLE_MELEE, -1],
    ])
    melee_protected = np.asarray([
        [True, False],
        [False, False],
    ])
    collector.begin_roll(
        state, fired, melee_styles, melee_protected, overhead, 11,
        switch_ticks)
    collector.begin_roll(
        state, fired, melee_styles, melee_protected, overhead, 12,
        switch_ticks, spec_kind=schema.SPEC_VESTA_LONGSWORD)

    report = collector.report()
    melee = report["outgoingMeleeIntoProtectMelee"]
    assert melee["ordinary"] == {
        "rolls": 2,
        "protected": 1,
        "protectedPct": 50.0,
        "visibleProtectMeleeAtDecision": 1,
        "visibleAndProtectedAtRoll": 1,
        "protectedNotVisibleAtDecision": 0,
    }
    assert melee["vls"] == {
        "rolls": 2,
        "protected": 1,
        "protectedPct": 50.0,
        "visibleProtectMeleeAtDecision": 1,
        "visibleAndProtectedAtRoll": 1,
        "protectedNotVisibleAtDecision": 0,
    }
    magic = report["ordinaryMagicGearAtRollByDefenderAttackTimer"]
    assert magic["waiting"]["rolls"] == 1
    assert magic["waiting"]["virtusBottomPct"] == 100.0
    assert magic["waiting"]["headUnequippedPct"] == 100.0
    assert magic["waiting"]["elidinisWardPct"] == 100.0
    assert magic["waiting"]["dragonfireShieldPct"] == 0.0
    assert magic["waiting"]["fullOffencePct"] == 100.0
    assert magic["waiting"]["fullOffenceWithWardPct"] == 100.0
    assert magic["ready"]["rolls"] == 1
    assert magic["ready"]["virtusBottomPct"] == 0.0
    assert magic["ready"]["torvaPlatelegsPct"] == 100.0
    assert magic["ready"]["headUnequippedPct"] == 100.0
    assert magic["ready"]["elidinisWardPct"] == 0.0
    assert magic["ready"]["dragonfireShieldPct"] == 100.0
    assert magic["ready"]["fullOffencePct"] == 0.0
    assert magic["ready"]["fullOffenceWithWardPct"] == 0.0

    incoming_fired = np.asarray([[False, True], [False, True]])
    incoming_melee = np.asarray([
        [-1, schema.STYLE_MELEE],
        [-1, schema.STYLE_MELEE],
    ])
    collector.begin_roll(
        state, incoming_fired, incoming_melee, protected, overhead, 13,
        switch_ticks)
    collector.begin_roll(
        state, incoming_fired, incoming_melee, protected, overhead, 14,
        switch_ticks, spec_kind=schema.SPEC_GRANITE_MAUL)
    report = collector.report()
    assert report["physicalRobeExposure"] == {
        "rolls": 4,
        "rollsPerFight": None,
        "gmaulRolls": 2,
        "nonGmaulRolls": 2,
        "nonGmaulRollsPerFight": None,
    }
    assert report["physicalHeadUnequippedExposure"] == {
        "rolls": 4,
        "gmaulRolls": 2,
        "nonGmaulRolls": 2,
        "nonGmaulRollsPerFight": None,
    }
    assert report["physicalFullOffenceExposure"] == {
        "rolls": 2,
        "gmaulRolls": 1,
        "nonGmaulRolls": 1,
        "nonGmaulRollsPerFight": None,
    }


def test_eval_collector_excludes_first_incoming_tick_per_episode():
    collector = evaluation.EvaluationCollector(1, subject_side=0)
    equipped = np.full((1, 2, gear.SLOT_COUNT), -1, dtype=np.int32)
    state = SimpleNamespace(
        weapon_id=equipped[:, :, gear.SLOT_WEAPON].copy(),
        equipped_ids=equipped,
        attack_delay=np.zeros((1, 2), dtype=np.int32),
        episode_id=np.zeros((1, 2), dtype=np.int32),
        seen_opp_overhead=np.full((1, 2), -1, dtype=np.int32),
    )
    switch_ticks = np.full((1, 2), -1000, dtype=np.int64)

    def book(style, protected, world_tick, spec_kind=None):
        fired = np.asarray([[False, True]])
        styles = np.asarray([[-1, style]], dtype=np.int32)
        protected_roll = np.asarray(
            [[False, protected]], dtype=bool)
        overhead = np.asarray([[
            schema.PRAY_PROTECT_MAGIC + style if protected else -1,
            -1,
        ]], dtype=np.int32)
        collector.begin_roll(
            state,
            fired,
            styles,
            protected_roll,
            overhead,
            world_tick,
            switch_ticks,
            spec_kind=spec_kind,
        )

    book(schema.STYLE_MAGIC, False, 10)
    book(
        schema.STYLE_MELEE,
        True,
        10,
        spec_kind=schema.SPEC_GRANITE_MAUL,
    )
    book(schema.STYLE_RANGED, True, 11)

    state.episode_id[:] = 1
    book(schema.STYLE_RANGED, False, 20)
    book(
        schema.STYLE_MAGIC,
        True,
        20,
        spec_kind=schema.SPEC_GRANITE_MAUL_DOUBLE,
    )
    book(schema.STYLE_MELEE, True, 21)

    report = collector.report()
    assert report["incomingAttackRolls"] == 6
    assert report["openingIncomingAttackRolls"] == 4
    assert report["postOpeningIncomingAttackRolls"] == 2
    assert report["postOpeningRollPrayerCorrectPct"] == 100.0
    assert report["postOpeningRollPrayerByIncomingStyle"] == {
        "magic": {
            "rolls": 0,
            "correct": 0,
            "correctPct": None,
        },
        "ranged": {
            "rolls": 1,
            "correct": 1,
            "correctPct": 100.0,
        },
        "melee": {
            "rolls": 1,
            "correct": 1,
            "correctPct": 100.0,
        },
    }


def test_safe_magic_gear_uses_pre_supply_decision_timer():
    collector = evaluation.EvaluationCollector(1, subject_side=0)
    equipped = np.full((1, 2, gear.SLOT_COUNT), -1, dtype=np.int32)
    equipped[0, 0, gear.SLOT_WEAPON] = gear.ZURIELS_STAFF.item_id
    equipped[0, 0, gear.SLOT_CHEST] = gear.VIRTUS_ROBE_TOP.item_id
    equipped[0, 0, gear.SLOT_LEGS] = gear.VIRTUS_ROBE_BOTTOM.item_id
    state = SimpleNamespace(
        weapon_id=equipped[:, :, gear.SLOT_WEAPON].copy(),
        equipped_ids=equipped,
        # The defender began ready, then ate before this same-tick roll.
        attack_delay=np.asarray([[0, 3]], dtype=np.int32),
        episode_id=np.zeros((1, 2), dtype=np.int32),
    )
    fired = np.asarray([[True, False]])
    styles = np.asarray([[schema.STYLE_MAGIC, -1]])
    protected = np.zeros((1, 2), dtype=bool)
    overhead = np.full((1, 2), -1, dtype=np.int32)
    switch_ticks = np.full((1, 2), -1000, dtype=np.int64)
    decision_attack_delay = np.asarray([[0, 0]], dtype=np.int32)

    collector.begin_roll(
        state,
        fired,
        styles,
        protected,
        overhead,
        10,
        switch_ticks,
        decision_attack_delay=decision_attack_delay,
    )

    magic = collector.report()[
        "ordinaryMagicGearAtRollByDefenderAttackTimer"]
    assert magic["waiting"]["rolls"] == 0
    assert magic["ready"]["rolls"] == 1
    assert magic["ready"]["fullOffencePct"] == 100.0


def test_stand_under_timing_requires_a_frozen_opponent_for_useful_window():
    collector = evaluation.EvaluationCollector(2, subject_side=0)
    equipped = np.full((2, 2, gear.SLOT_COUNT), -1, dtype=np.int32)
    equipped[:, 0, gear.SLOT_WEAPON] = gear.NOXIOUS_HALBERD.item_id
    state = SimpleNamespace(
        alive=np.ones(2, dtype=bool),
        hp=np.full((2, 2), 99, dtype=np.int32),
        x=np.zeros((2, 2), dtype=np.int32),
        y=np.zeros((2, 2), dtype=np.int32),
        moving=np.zeros((2, 2), dtype=bool),
        attack_delay=np.asarray([[2, 0], [0, 0]], dtype=np.int32),
        freeze_ticks=np.asarray([[0, 5], [0, 5]], dtype=np.int32),
        lock_ticks=np.zeros((2, 2), dtype=np.int32),
        weapon_id=equipped[:, :, gear.SLOT_WEAPON].copy(),
        equipped_ids=equipped,
        episode_id=np.zeros((2, 2), dtype=np.int32),
        overhead=np.full((2, 2), -1, dtype=np.int32),
        seen_opp_overhead=np.full((2, 2), -1, dtype=np.int32),
        seen_opp_frozen=np.zeros((2, 2), dtype=bool),
        seen_opp_freeze_ticks=np.zeros((2, 2), dtype=np.int32),
        seen_opp_weapon_id=np.full((2, 2), -1, dtype=np.int32),
    )

    collector.observe_decision_tick(state, world_tick=10)
    # Only lane 1 was ready. It took the legal TargetRoute step and launched
    # an ordinary melee attack; lane 0 stayed underneath on cooldown.
    state.x[1, 0] = -1
    state.moving[1, 0] = True
    fired = np.asarray([[False, False], [True, False]], dtype=bool)
    styles = np.asarray([
        [-1, -1],
        [schema.STYLE_MELEE, -1],
    ], dtype=np.int32)
    protected = np.zeros((2, 2), dtype=bool)
    overhead = np.full((2, 2), -1, dtype=np.int32)
    switch_ticks = np.full((2, 2), -1000, dtype=np.int64)
    collector.begin_roll(
        state,
        fired,
        styles,
        protected,
        overhead,
        10,
        switch_ticks,
    )

    # Raw overlap is still counted, but lane 0 is not a useful frozen-target
    # window and lane 1 cannot step out while the subject itself is frozen.
    state.x[:] = 0
    state.y[:] = 0
    state.moving[:] = False
    state.attack_delay[:] = 0
    state.freeze_ticks[:, 0] = np.asarray([0, 5])
    state.freeze_ticks[:, 1] = np.asarray([0, 5])
    collector.observe_decision_tick(state, world_tick=11)

    timing = collector.report()["standUnderTiming"]
    assert timing["allSameTile"] == {
        "decisionTicks": 4,
        "ownOrdinaryAttackCoolingDownTicks": 1,
        "ownOrdinaryAttackReadyTicks": 3,
    }
    assert timing["frozenOpponentSameTile"] == {
        "decisionTicks": 3,
        "ownOrdinaryAttackCoolingDownTicks": 1,
        "ownOrdinaryAttackReadyTicks": 2,
        "legalStepOutAttackOpportunities": 1,
        "legalStepOutOrdinaryAttackConversions": 1,
        "legalStepOutOrdinaryAttackConversionPct": 100.0,
    }


def test_freeze_melee_prayer_timing_splits_visible_countdown_buckets():
    collector = evaluation.EvaluationCollector(4, subject_side=0)
    state = SimpleNamespace(
        alive=np.ones(4, dtype=bool),
        hp=np.full((4, 2), 99, dtype=np.int32),
        x=np.zeros((4, 2), dtype=np.int32),
        y=np.zeros((4, 2), dtype=np.int32),
        moving=np.zeros((4, 2), dtype=bool),
        attack_delay=np.zeros((4, 2), dtype=np.int32),
        freeze_ticks=np.zeros((4, 2), dtype=np.int32),
        lock_ticks=np.zeros((4, 2), dtype=np.int32),
        episode_id=np.zeros((4, 2), dtype=np.int32),
        overhead=np.full((4, 2), -1, dtype=np.int32),
        seen_opp_frozen=np.zeros((4, 2), dtype=bool),
        seen_opp_freeze_ticks=np.zeros((4, 2), dtype=np.int32),
        seen_opp_weapon_id=np.full((4, 2), -1, dtype=np.int32),
    )
    state.x[:, 1] = np.asarray([2, 3, 2, 2], dtype=np.int32)
    state.seen_opp_frozen[:, 0] = True
    state.seen_opp_freeze_ticks[:, 0] = np.asarray(
        [10, 5, 1, 10], dtype=np.int32)
    state.seen_opp_weapon_id[:, 0] = np.asarray([
        gear.VESTAS_LONGSWORD.item_id,
        gear.NOXIOUS_HALBERD.item_id,
        gear.VESTAS_LONGSWORD.item_id,
        gear.NOXIOUS_HALBERD.item_id,
    ], dtype=np.int32)
    state.overhead[:, 0] = np.asarray([
        schema.PRAY_PROTECT_MELEE,
        schema.PRAY_PROTECT_MISSILES,
        schema.PRAY_PROTECT_MELEE,
        schema.PRAY_PROTECT_MELEE,
    ], dtype=np.int32)

    collector.observe_decision_tick(state, world_tick=10)
    defence_actions = np.full(
        (4, 2),
        schema.DEFENCE_BASE + schema.PRAY_PROTECT_MAGIC,
        dtype=np.int32)
    defence_actions[:, 0] = schema.DEFENCE_BASE + np.asarray([
        schema.PRAY_PROTECT_MAGIC,
        schema.PRAY_PROTECT_MELEE,
        schema.PRAY_PROTECT_MISSILES,
        schema.PRAY_PROTECT_MELEE,
    ], dtype=np.int32)
    collector.observe_resulting_defence_prayer(defence_actions)
    timing = collector.report()["freezeMeleePrayerTiming"][
        "frozenUnreachable"]

    assert timing["all"] == {
        "decisionTicks": 3,
        "protectMeleeTicks": 1,
        "protectMeleePct": 33.333,
    }
    assert timing["byVisibleFreezeRemaining"] == {
        "moreThanFiveTicks": {
            "decisionTicks": 1,
            "protectMeleeTicks": 0,
            "protectMeleePct": 0.0,
        },
        "twoToFiveTicks": {
            "decisionTicks": 1,
            "protectMeleeTicks": 1,
            "protectMeleePct": 100.0,
        },
        "oneTick": {
            "decisionTicks": 1,
            "protectMeleeTicks": 0,
            "protectMeleePct": 0.0,
        },
    }


def test_frozen_unreachable_result_preserves_protection_for_nonprotect_action():
    collector = evaluation.EvaluationCollector(4, subject_side=0)
    state = SimpleNamespace(
        alive=np.ones(4, dtype=bool),
        hp=np.full((4, 2), 99, dtype=np.int32),
        x=np.asarray([[0, 2]] * 4, dtype=np.int32),
        y=np.zeros((4, 2), dtype=np.int32),
        moving=np.zeros((4, 2), dtype=bool),
        attack_delay=np.zeros((4, 2), dtype=np.int32),
        freeze_ticks=np.zeros((4, 2), dtype=np.int32),
        lock_ticks=np.zeros((4, 2), dtype=np.int32),
        episode_id=np.zeros((4, 2), dtype=np.int32),
        overhead=np.full((4, 2), -1, dtype=np.int32),
        seen_opp_frozen=np.zeros((4, 2), dtype=bool),
        seen_opp_freeze_ticks=np.zeros((4, 2), dtype=np.int32),
        seen_opp_weapon_id=np.full((4, 2), -1, dtype=np.int32),
    )
    state.seen_opp_frozen[:, 0] = True
    state.seen_opp_freeze_ticks[:, 0] = 5
    state.seen_opp_weapon_id[:, 0] = gear.VESTAS_LONGSWORD.item_id
    state.overhead[:, 0] = np.asarray([
        schema.PRAY_PROTECT_MELEE,
        schema.PRAY_PROTECT_MISSILES,
        schema.PRAY_PROTECT_MELEE,
        schema.PRAY_PROTECT_MAGIC,
    ], dtype=np.int32)

    collector.observe_decision_tick(state, world_tick=10)
    defence_actions = np.full(
        (4, 2),
        schema.DEFENCE_BASE + schema.PRAY_PROTECT_MAGIC,
        dtype=np.int32)
    defence_actions[:, 0] = schema.DEFENCE_BASE + np.asarray([
        schema.PRAY_PROTECT_MAGIC,
        schema.PRAY_PROTECT_MISSILES,
        schema.PRAY_SMITE,
        schema.PRAY_REDEMPTION,
    ], dtype=np.int32)
    collector.observe_resulting_defence_prayer(defence_actions)

    timing = collector.report()["freezeMeleePrayerTiming"][
        "frozenUnreachable"]
    assert timing["all"] == {
        "decisionTicks": 4,
        "protectMeleeTicks": 1,
        "protectMeleePct": 25.0,
    }


def test_guaranteed_safe_v2_uses_next_roll_movement_geometry():
    collector = evaluation.EvaluationCollector(10, subject_side=0)
    state = SimpleNamespace(
        alive=np.ones(10, dtype=bool),
        hp=np.full((10, 2), 99, dtype=np.int32),
        x=np.zeros((10, 2), dtype=np.int32),
        y=np.zeros((10, 2), dtype=np.int32),
        moving=np.zeros((10, 2), dtype=bool),
        attack_delay=np.zeros((10, 2), dtype=np.int32),
        freeze_ticks=np.zeros((10, 2), dtype=np.int32),
        lock_ticks=np.zeros((10, 2), dtype=np.int32),
        episode_id=np.zeros((10, 2), dtype=np.int32),
        overhead=np.full((10, 2), -1, dtype=np.int32),
        seen_opp_frozen=np.zeros((10, 2), dtype=bool),
        seen_opp_freeze_ticks=np.zeros((10, 2), dtype=np.int32),
        seen_opp_weapon_id=np.full((10, 2), -1, dtype=np.int32),
    )
    # Self freeze 0/1/2 permits 2/1/0 movement decisions, so the strict
    # safe-distance thresholds are 6/4/2 tiles respectively.
    state.freeze_ticks[:, 0] = np.asarray(
        [0, 0, 1, 1, 2, 2, 2, 1, 0, 2], dtype=np.int32)
    state.x[:, 1] = np.asarray(
        [7, 6, 5, 4, 3, 2, 0, 0, 0, 9], dtype=np.int32)
    state.y[:, 1] = np.asarray(
        [0, 0, 0, 0, 0, 0, 0, 0, 7, 0], dtype=np.int32)
    state.seen_opp_frozen[:, 0] = True
    state.seen_opp_freeze_ticks[:, 0] = np.asarray(
        [10, 10, 5, 5, 5, 5, 5, 5, 5, 1], dtype=np.int32)
    state.seen_opp_weapon_id[:, 0] = gear.NOXIOUS_HALBERD.item_id

    collector.observe_decision_tick(state, world_tick=10)
    defence_actions = np.full(
        (10, 2),
        schema.DEFENCE_BASE + schema.PRAY_PROTECT_MAGIC,
        dtype=np.int32)
    defence_actions[[0, 4, 5, 6], 0] = (
        schema.DEFENCE_BASE + schema.PRAY_PROTECT_MELEE)
    collector.observe_resulting_defence_prayer(defence_actions)

    timing = collector.report()["freezeMeleePrayerTiming"]
    safe = timing["guaranteedSafeThroughNextEffectiveRollV2"]
    assert safe["all"] == {
        "decisionTicks": 5,
        "protectMeleeTicks": 3,
        "protectMeleePct": 60.0,
    }
    assert safe["byVisibleFreezeRemaining"] == {
        "moreThanFiveTicks": {
            "decisionTicks": 1,
            "protectMeleeTicks": 1,
            "protectMeleePct": 100.0,
        },
        "twoToFiveTicks": {
            "decisionTicks": 4,
            "protectMeleeTicks": 2,
            "protectMeleePct": 50.0,
        },
        "oneTick": {
            "decisionTicks": 0,
            "protectMeleeTicks": 0,
            "protectMeleePct": None,
        },
    }
    # The legacy visible-weapon bucket remains available and intentionally
    # classifies a different set of rows.
    assert timing["frozenUnreachable"]["all"]["decisionTicks"] == 9


def test_evaluation_engine_uses_selected_prayer_for_frozen_unreachable():
    runner = evaluation.EvaluationEngine(
        n_fights=4,
        policy=FixedPolicy(schema.PRAY_PROTECT_MAGIC),
        subject_side=0,
        seed=17,
        epsilon=0.0,
        max_ticks=5,
        start_distance_min=2,
        start_distance_max=2,
        world_id=35,
    )
    state = runner.state
    state.overhead[:, 0] = schema.PRAY_PROTECT_MELEE
    state.seen_opp_frozen[:, 0] = True
    state.seen_opp_freeze_ticks[:, 0] = 5
    state.seen_opp_weapon_id[:, 0] = gear.VESTAS_LONGSWORD.item_id

    runner.step()

    timing = runner.evaluation.report()["freezeMeleePrayerTiming"][
        "frozenUnreachable"]["all"]
    assert timing == {
        "decisionTicks": 4,
        "protectMeleeTicks": 0,
        "protectMeleePct": 0.0,
    }


def test_freeze_melee_prayer_timing_tracks_thaw_and_recovery_window():
    collector = evaluation.EvaluationCollector(2, subject_side=0)
    state = SimpleNamespace(
        alive=np.ones(2, dtype=bool),
        hp=np.full((2, 2), 99, dtype=np.int32),
        x=np.zeros((2, 2), dtype=np.int32),
        y=np.zeros((2, 2), dtype=np.int32),
        moving=np.zeros((2, 2), dtype=bool),
        attack_delay=np.zeros((2, 2), dtype=np.int32),
        freeze_ticks=np.zeros((2, 2), dtype=np.int32),
        lock_ticks=np.zeros((2, 2), dtype=np.int32),
        episode_id=np.zeros((2, 2), dtype=np.int32),
        overhead=np.full((2, 2), -1, dtype=np.int32),
        seen_opp_frozen=np.zeros((2, 2), dtype=bool),
        seen_opp_freeze_ticks=np.zeros((2, 2), dtype=np.int32),
        seen_opp_weapon_id=np.full((2, 2), -1, dtype=np.int32),
    )
    state.x[:, 1] = np.asarray([3, 5], dtype=np.int32)
    state.seen_opp_frozen[:, 0] = True
    state.seen_opp_freeze_ticks[:, 0] = 5
    state.seen_opp_weapon_id[:, 0] = np.asarray([
        gear.VESTAS_LONGSWORD.item_id,
        gear.NOXIOUS_HALBERD.item_id,
    ], dtype=np.int32)
    collector.observe_decision_tick(state, world_tick=20)

    # On the first visibly thawed decision, only the ordinary one-tile weapon
    # at distance three can drag in and hit.
    state.seen_opp_frozen[:, 0] = False
    state.seen_opp_freeze_ticks[:, 0] = 0
    state.overhead[:, 0] = schema.PRAY_PROTECT_MELEE
    collector.observe_decision_tick(state, world_tick=21)

    # One decision later, move the halberd lane into its distance-four
    # unfrozen drag-in reach. Exactly one of the two lanes protects melee.
    state.x[:, 1] = np.asarray([3, 4], dtype=np.int32)
    state.overhead[:, 0] = np.asarray([
        schema.PRAY_PROTECT_MISSILES,
        schema.PRAY_PROTECT_MELEE,
    ], dtype=np.int32)
    collector.observe_decision_tick(state, world_tick=22)

    timing = collector.report()["freezeMeleePrayerTiming"]
    assert timing["firstVisibleThaw"] == {
        "decisionTicks": 2,
        "visibleMeleeReachableTicks": 1,
        "protectMeleeTicks": 1,
        "protectMeleePct": 100.0,
    }
    assert timing["postThawVisibleMeleeReachable"] == {
        "decisionTicks": 2,
        "visibleMeleeReachableTicks": 2,
        "protectMeleeTicks": 1,
        "protectMeleePct": 50.0,
        "decisionWindow": "next three decisions",
    }

    # Starting a new episode while unfrozen is a reset, not a thaw boundary.
    state.episode_id += 1
    collector.observe_decision_tick(state, world_tick=23)
    reset_timing = collector.report()["freezeMeleePrayerTiming"]
    assert reset_timing["firstVisibleThaw"] == timing["firstVisibleThaw"]
    assert (
        reset_timing["postThawVisibleMeleeReachable"]
        == timing["postThawVisibleMeleeReachable"])


def test_evaluation_engine_records_legal_melee_step_out_attack_conversion():
    runner = evaluation.EvaluationEngine(
        n_fights=8,
        policy=FixedStylePolicy(schema.STYLE_MELEE),
        subject_side=0,
        seed=9,
        epsilon=0.0,
        max_ticks=20,
        start_distance_min=1,
        start_distance_max=1,
        world_id=35,
    )
    state = runner.state
    state.x[:, 1] = state.x[:, 0]
    state.y[:, 1] = state.y[:, 0]
    state.prev_x = state.x.copy()
    state.prev_y = state.y.copy()
    state.freeze_ticks[:, 1] = 10
    state.attack_delay[:, 0] = 0

    runner.step()

    timing = runner.evaluation.report()[
        "standUnderTiming"]["frozenOpponentSameTile"]
    assert timing["legalStepOutAttackOpportunities"] == 8
    assert timing["legalStepOutOrdinaryAttackConversions"] == 8
    assert timing["legalStepOutOrdinaryAttackConversionPct"] == 100.0
    assert state.moving[:, 0].all()
    assert (state.distance() == 1).all()


def test_paired_aggregate_retains_full_offence_and_gmaul_splits():
    report = evaluation.EvaluationCollector(1, subject_side=0).report()
    report["completedFights"] = 2
    report["ordinaryMagicGearAtRollByDefenderAttackTimer"]["waiting"].update({
        "rolls": 10,
        "virtusTopRolls": 10,
        "virtusBottomRolls": 8,
        "torvaPlatelegsRolls": 2,
        "headUnequippedRolls": 9,
        "elidinisWardRolls": 9,
        "dragonfireShieldRolls": 1,
        "fullOffenceRolls": 7,
        "fullOffenceWithWardRolls": 7,
    })
    report["ordinaryMagicGearAtRollByDefenderAttackTimer"]["ready"].update({
        "rolls": 5,
        "virtusTopRolls": 5,
        "virtusBottomRolls": 1,
        "torvaPlatelegsRolls": 4,
        "headUnequippedRolls": 1,
        "elidinisWardRolls": 1,
        "dragonfireShieldRolls": 4,
        "fullOffenceRolls": 1,
        "fullOffenceWithWardRolls": 1,
    })
    report["physicalRobeExposure"].update({
        "rolls": 6, "gmaulRolls": 2})
    report["physicalHeadUnequippedExposure"].update({
        "rolls": 4, "gmaulRolls": 1})
    report["physicalFullOffenceExposure"].update({
        "rolls": 3, "gmaulRolls": 1})
    report["outgoingMeleeIntoProtectMelee"]["ordinary"].update({
        "rolls": 8,
        "protected": 6,
        "visibleProtectMeleeAtDecision": 5,
        "visibleAndProtectedAtRoll": 4,
        "protectedNotVisibleAtDecision": 2,
    })
    report["standUnderTiming"]["allSameTile"].update({
        "decisionTicks": 7,
        "ownOrdinaryAttackCoolingDownTicks": 5,
        "ownOrdinaryAttackReadyTicks": 2,
    })
    report["standUnderTiming"]["frozenOpponentSameTile"].update({
        "decisionTicks": 6,
        "ownOrdinaryAttackCoolingDownTicks": 4,
        "ownOrdinaryAttackReadyTicks": 2,
        "legalStepOutAttackOpportunities": 2,
        "legalStepOutOrdinaryAttackConversions": 1,
    })
    frozen_timing = report["freezeMeleePrayerTiming"][
        "frozenUnreachable"]
    frozen_timing["all"].update({
        "decisionTicks": 9,
        "protectMeleeTicks": 6,
    })
    frozen_timing["byVisibleFreezeRemaining"][
        "moreThanFiveTicks"].update({
            "decisionTicks": 4,
            "protectMeleeTicks": 3,
        })
    frozen_timing["byVisibleFreezeRemaining"]["twoToFiveTicks"].update({
        "decisionTicks": 3,
        "protectMeleeTicks": 2,
    })
    frozen_timing["byVisibleFreezeRemaining"]["oneTick"].update({
        "decisionTicks": 2,
        "protectMeleeTicks": 1,
    })
    guaranteed_safe = report["freezeMeleePrayerTiming"][
        "guaranteedSafeThroughNextEffectiveRollV2"]
    guaranteed_safe["all"].update({
        "decisionTicks": 7,
        "protectMeleeTicks": 2,
    })
    guaranteed_safe["byVisibleFreezeRemaining"][
        "moreThanFiveTicks"].update({
            "decisionTicks": 4,
            "protectMeleeTicks": 1,
        })
    guaranteed_safe["byVisibleFreezeRemaining"]["twoToFiveTicks"].update({
        "decisionTicks": 3,
        "protectMeleeTicks": 1,
    })
    report["freezeMeleePrayerTiming"]["firstVisibleThaw"].update({
        "decisionTicks": 5,
        "visibleMeleeReachableTicks": 3,
        "protectMeleeTicks": 2,
    })
    report["freezeMeleePrayerTiming"][
        "postThawVisibleMeleeReachable"].update({
            "decisionTicks": 7,
            "visibleMeleeReachableTicks": 4,
            "protectMeleeTicks": 1,
        })

    aggregate = sum_nested_metrics([report, report])

    waiting = aggregate[
        "ordinaryMagicGearAtRollByDefenderAttackTimer"]["waiting"]
    ready = aggregate[
        "ordinaryMagicGearAtRollByDefenderAttackTimer"]["ready"]
    assert waiting["rolls"] == 20
    assert waiting["virtusBottomPct"] == 80.0
    assert waiting["headUnequippedPct"] == 90.0
    assert waiting["elidinisWardPct"] == 90.0
    assert waiting["dragonfireShieldPct"] == 10.0
    assert waiting["fullOffencePct"] == 70.0
    assert waiting["fullOffenceWithWardPct"] == 70.0
    assert ready["fullOffencePct"] == 20.0
    assert ready["elidinisWardPct"] == 20.0
    assert safe_magic_ward_gate(aggregate)
    assert aggregate["physicalRobeExposure"]["nonGmaulRolls"] == 8
    assert aggregate[
        "physicalHeadUnequippedExposure"]["nonGmaulRolls"] == 6
    assert aggregate[
        "physicalFullOffenceExposure"]["nonGmaulRollsPerFight"] == 1.0
    ordinary = aggregate["outgoingMeleeIntoProtectMelee"]["ordinary"]
    assert ordinary["rolls"] == 16
    assert ordinary["protectedPct"] == 75.0
    assert ordinary["visibleAndProtectedAtRoll"] == 8
    assert ordinary["visibleAndProtectedPctOfMeleeRolls"] == 50.0
    assert ordinary["visibleAndProtectedPctWhenVisible"] == 80.0
    assert not visible_protected_ordinary_melee_gate(aggregate)
    assert aggregate["standUnderTiming"] == {
        "allSameTile": {
            "decisionTicks": 14,
            "ownOrdinaryAttackCoolingDownTicks": 10,
            "ownOrdinaryAttackReadyTicks": 4,
        },
        "frozenOpponentSameTile": {
            "decisionTicks": 12,
            "ownOrdinaryAttackCoolingDownTicks": 8,
            "ownOrdinaryAttackReadyTicks": 4,
            "legalStepOutAttackOpportunities": 4,
            "legalStepOutOrdinaryAttackConversions": 2,
            "legalStepOutOrdinaryAttackConversionPct": 50.0,
        },
    }
    assert aggregate["freezeMeleePrayerTiming"] == {
        "frozenUnreachable": {
            "all": {
                "decisionTicks": 18,
                "protectMeleeTicks": 12,
                "protectMeleePct": 66.667,
            },
            "byVisibleFreezeRemaining": {
                "moreThanFiveTicks": {
                    "decisionTicks": 8,
                    "protectMeleeTicks": 6,
                    "protectMeleePct": 75.0,
                },
                "twoToFiveTicks": {
                    "decisionTicks": 6,
                    "protectMeleeTicks": 4,
                    "protectMeleePct": 66.667,
                },
                "oneTick": {
                    "decisionTicks": 4,
                    "protectMeleeTicks": 2,
                    "protectMeleePct": 50.0,
                },
            },
        },
        "guaranteedSafeThroughNextEffectiveRollV2": {
            "all": {
                "decisionTicks": 14,
                "protectMeleeTicks": 4,
                "protectMeleePct": 28.571,
            },
            "byVisibleFreezeRemaining": {
                "moreThanFiveTicks": {
                    "decisionTicks": 8,
                    "protectMeleeTicks": 2,
                    "protectMeleePct": 25.0,
                },
                "twoToFiveTicks": {
                    "decisionTicks": 6,
                    "protectMeleeTicks": 2,
                    "protectMeleePct": 33.333,
                },
                "oneTick": {
                    "decisionTicks": 0,
                    "protectMeleeTicks": 0,
                    "protectMeleePct": None,
                },
            },
        },
        "firstVisibleThaw": {
            "decisionTicks": 10,
            "visibleMeleeReachableTicks": 6,
            "protectMeleeTicks": 4,
            "protectMeleePct": 66.667,
        },
        "postThawVisibleMeleeReachable": {
            "decisionTicks": 14,
            "visibleMeleeReachableTicks": 8,
            "protectMeleeTicks": 2,
            "protectMeleePct": 25.0,
            "decisionWindow": "next three decisions",
        },
    }

    aggregate["outgoingMeleeIntoProtectMelee"]["ordinary"][
        "visibleAndProtectedPctOfMeleeRolls"] = 0.999
    assert visible_protected_ordinary_melee_gate(aggregate)

    aggregate["outgoingMeleeIntoProtectMelee"]["ordinary"][
        "visibleAndProtectedPctOfMeleeRolls"] = 1.0
    assert not visible_protected_ordinary_melee_gate(aggregate)

    aggregate["outgoingMeleeIntoProtectMelee"]["ordinary"]["rolls"] = 0
    aggregate["outgoingMeleeIntoProtectMelee"]["ordinary"][
        "visibleAndProtectedPctOfMeleeRolls"] = 0.0
    assert not visible_protected_ordinary_melee_gate(aggregate)

    aggregate["ordinaryMagicGearAtRollByDefenderAttackTimer"]["waiting"][
        "elidinisWardPct"] = 89.999
    assert not safe_magic_ward_gate(aggregate)
    aggregate["ordinaryMagicGearAtRollByDefenderAttackTimer"]["waiting"][
        "elidinisWardPct"] = 90.0
    aggregate["ordinaryMagicGearAtRollByDefenderAttackTimer"]["waiting"][
        "rolls"] = 0
    assert not safe_magic_ward_gate(aggregate)


def test_eval_skips_rollout_bookkeeping_without_changing_seeded_metrics():
    kwargs = dict(
        n_fights=8,
        policy=FixedPolicy(schema.PRAY_PROTECT_MAGIC),
        opponent_policy=FixedPolicy(schema.PRAY_PROTECT_MISSILES),
        subject_side=0,
        seed=31,
        replay_seed=71,
        epsilon=0.0,
        max_ticks=30,
        start_distance_min=1,
        start_distance_max=1,
        world_id=35)
    optimized = evaluation.EvaluationEngine(**kwargs)
    reference = FullBookkeepingEvaluationEngine(**kwargs)
    optimized.run(on_record=lambda _record: None)
    reference.run(on_record=lambda _record: None)

    assert optimized.evaluation.report() == reference.evaluation.report()
    np.testing.assert_array_equal(optimized.state.hp, reference.state.hp)
    np.testing.assert_array_equal(
        optimized.state.equipped_ids, reference.state.equipped_ids)
    np.testing.assert_array_equal(
        optimized.state.overhead, reference.state.overhead)
    np.testing.assert_array_equal(
        optimized.state.damage_dealt, reference.state.damage_dealt)


def test_isolation_gate_ignores_completed_lane_coordinates():
    runner = evaluation.EvaluationEngine(
        n_fights=2,
        policy=FixedPolicy(schema.PRAY_PROTECT_MAGIC),
        subject_side=0,
        seed=4,
        epsilon=0.0,
        max_ticks=2,
        start_distance_min=1,
        start_distance_max=1,
        world_id=35)
    runner.state.alive[0] = False
    runner.state.x[0] = -1_000_000
    runner.state.y[0] = -1_000_000
    runner.evaluation.observe_positions(runner.state)
    assert runner.evaluation.outside_cached_map_samples == 0


def test_legacy_anchor_prefix_is_explicit_and_matches_manual_prefix():
    if not TEACHER1.exists():
        return
    try:
        policy.Policy.load(TEACHER1, device="cpu")
    except ValueError as exc:
        assert "wants 111 inputs" in str(exc)
    else:
        raise AssertionError("rollout policy load must remain fail-closed")

    anchor = policy.Policy.load(
        TEACHER1,
        device="cpu",
        compatible_input_sizes=(110, 111, 112))
    raw = np.linspace(-1.0, 1.0, 2 * schema.INPUT_SIZE).reshape(
        2, schema.INPUT_SIZE).astype(np.float32)
    full_scores, full_value = anchor.score(raw)
    prefix_scores, prefix_value = anchor.score(raw[:, :111])
    np.testing.assert_allclose(full_scores, prefix_scores, atol=0.0, rtol=0.0)
    np.testing.assert_allclose(full_value, prefix_value, atol=0.0, rtol=0.0)


if __name__ == "__main__":
    test_exact_distance_uses_cache_derived_lanes()
    test_paired_eval_filters_preserve_full_default_matrix()
    test_paired_eval_filters_select_one_focused_cell_axis()
    test_paired_eval_cell_tasks_preserve_matrix_order_and_matched_seeds()
    test_paired_eval_cell_results_restore_original_task_order()
    test_vectorized_cells_preserve_independent_seeded_cell_results()
    test_eval_collector_records_roll_time_prayer_and_completion()
    test_eval_collector_splits_melee_and_safe_magic_gear_at_roll()
    test_eval_collector_excludes_first_incoming_tick_per_episode()
    test_safe_magic_gear_uses_pre_supply_decision_timer()
    test_stand_under_timing_requires_a_frozen_opponent_for_useful_window()
    test_freeze_melee_prayer_timing_splits_visible_countdown_buckets()
    test_frozen_unreachable_result_preserves_protection_for_nonprotect_action()
    test_guaranteed_safe_v2_uses_next_roll_movement_geometry()
    test_evaluation_engine_uses_selected_prayer_for_frozen_unreachable()
    test_freeze_melee_prayer_timing_tracks_thaw_and_recovery_window()
    test_evaluation_engine_records_legal_melee_step_out_attack_conversion()
    test_paired_aggregate_retains_full_offence_and_gmaul_splits()
    test_eval_skips_rollout_bookkeeping_without_changing_seeded_metrics()
    test_isolation_gate_ignores_completed_lane_coordinates()
    test_legacy_anchor_prefix_is_explicit_and_matches_manual_prefix()
    print("evaluation: OK")
