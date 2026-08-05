"""Focused checks for Java state114 observation semantics."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import actions, engine, gear, observation, schema  # noqa: E402


class HoldScores:
    input_size = schema.INPUT_SIZE

    def score(self, inputs):
        rows = inputs.shape[0]
        scores = np.zeros((rows, schema.ACTION_COUNT), dtype=np.float32)
        scores[:, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 100.0
        scores[:, schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE] = 100.0
        scores[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MELEE] = 100.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 100.0
        return scores, np.zeros(rows, dtype=np.float32)


def _initial_inputs():
    eng = engine.Engine(8, HoldScores(), seed=12, epsilon=0.0)
    eng.state.attack_level[:] = 90
    eng.step()
    return eng, eng._pending.inputs


def test_opening_current_style_and_flexible_defence_match_java_reset():
    eng = engine.Engine(8, HoldScores(), seed=11, epsilon=0.0)
    legal = actions.compute(eng.state, eng.gear_tables)
    inputs = observation.build(eng.state, eng.gear_tables, legal)

    current_style = inputs[
        :, schema.INPUT_STYLE_BLOCK_BASE + 3:
        schema.INPUT_STYLE_BLOCK_BASE + 6]
    assert np.all(current_style == 0.0), (
        "Java clears currentOffence on reset despite visibly wearing mage gear")
    assert np.allclose(
        inputs[:, schema.INPUT_SELF_MAGIC_DEF_GAIN], 52.0 / 140.0)
    assert np.allclose(
        inputs[:, schema.INPUT_SELF_RANGED_DEF_GAIN], 1.0)
    assert np.allclose(
        inputs[:, schema.INPUT_SELF_MELEE_DEF_GAIN], 55.0 / 140.0)


def test_inventory_counts_use_java_items_not_internal_potion_doses():
    _, inputs = _initial_inputs()
    assert np.allclose(inputs[:, schema.INPUT_SELF_FOOD_COUNT], 7.0 / 28.0)
    assert np.allclose(inputs[:, schema.INPUT_SELF_BREW_COUNT], 3.0 / 8.0)
    assert np.allclose(inputs[:, schema.INPUT_SELF_RESTORE_COUNT], 3.0 / 8.0)
    assert np.allclose(
        inputs[:, schema.INPUT_SELF_INVENTORY_FREE_SLOTS], 1.0 / 28.0)


def test_level_deficit_is_signed_current_minus_fixed():
    _, inputs = _initial_inputs()
    assert np.allclose(inputs[:, schema.INPUT_LEVEL_RATIO_BASE], 90.0 / 99.0)
    assert np.allclose(inputs[:, schema.INPUT_LEVEL_DEFICIT_BASE], -9.0 / 40.0)


def test_none_spec_history_uses_java_code_zero_one_hot():
    _, inputs = _initial_inputs()
    last = inputs[:, schema.INPUT_LAST_SPEC_KIND_BASE:
                  schema.INPUT_LAST_SPEC_KIND_BASE + 5]
    previous = inputs[:, schema.INPUT_PREV_SPEC_KIND_BASE:
                      schema.INPUT_PREV_SPEC_KIND_BASE + 5]
    expected = np.array([1.0, 0.0, 0.0, 0.0, 0.0])
    assert np.all(last == expected)
    assert np.all(previous == expected)


def test_voidwaker_and_vls_use_java_spec_history_codes_two_and_three():
    eng = engine.Engine(2, HoldScores(), seed=16, epsilon=0.0)
    eng.state.last_spec_kind[:, 0] = schema.SPEC_VOIDWAKER
    eng.state.last_spec_kind[:, 1] = schema.SPEC_VESTA_LONGSWORD
    eng.step()
    last = eng._pending.inputs[:, schema.INPUT_LAST_SPEC_KIND_BASE:
                               schema.INPUT_LAST_SPEC_KIND_BASE + 5]
    assert np.all(last[0::2] == np.array([0, 0, 1, 0, 0]))
    assert np.all(last[1::2] == np.array([0, 0, 0, 1, 0]))


def test_opponent_spec_input_does_not_leak_the_true_energy_bar():
    eng = engine.Engine(4, HoldScores(), seed=17, epsilon=0.0)
    eng.state.seen_opp_spec_energy[:] = 0
    eng.step()
    assert np.all(
        eng._pending.inputs[:, schema.INPUT_OPP_SPEC_ENERGY_EST] == 1.0)


def test_global_decision_tick_drives_vengeance_recency_and_vls_pending():
    eng = engine.Engine(1, HoldScores(), seed=171, epsilon=0.0)
    s = eng.state
    s.tick[:] = 7
    s.veng_trinket_last_cast_tick[0, 1] = 132
    s.veng_trinket_casts[0, 1] = 1
    s.optional_vls_setup_tick[0, 0] = 136
    legal = actions.compute(s, eng.gear_tables)

    inputs = observation.build(
        s, eng.gear_tables, legal, decision_tick=137)
    expected_recent = (
        schema.VENGEANCE_TRINKET_RECENT_TICKS_NORMALIZER - 5
    ) / schema.VENGEANCE_TRINKET_RECENT_TICKS_NORMALIZER
    assert np.isclose(
        inputs[0, schema.INPUT_OPP_VENG_TRINKET_RECENT],
        expected_recent)
    assert inputs[
        0, schema.INPUT_SELF_OPTIONAL_VLS_SETUP_PENDING] == 1.0

    next_inputs = observation.build(
        s, eng.gear_tables, legal, decision_tick=138)
    assert np.isclose(
        next_inputs[0, schema.INPUT_OPP_VENG_TRINKET_RECENT],
        expected_recent
        - 1.0 / schema.VENGEANCE_TRINKET_RECENT_TICKS_NORMALIZER)
    assert next_inputs[
        0, schema.INPUT_SELF_OPTIONAL_VLS_SETUP_PENDING] == 0.0


def test_reachable_visible_voidwaker_is_magic_threat_but_melee_gear():
    eng = engine.Engine(1, HoldScores(), seed=170, epsilon=0.0)
    s = eng.state
    s.x[0] = [0, 2]
    s.y[0] = [0, 0]
    s.seen_opp_weapon_id[0, 0] = gear.VOIDWAKER.item_id
    s.seen_opp_frozen[0, 0] = False

    legal = actions.compute(s, eng.gear_tables)
    inputs = observation.build(s, eng.gear_tables, legal)
    likely_base = schema.INPUT_STYLE_BLOCK_BASE + 9
    gear_base = schema.INPUT_STYLE_BLOCK_BASE + 12
    assert np.array_equal(
        inputs[0, likely_base:likely_base + 3],
        np.array([1.0, 0.0, 0.0]))
    assert np.array_equal(
        inputs[0, gear_base:gear_base + 3],
        np.array([0.0, 0.0, 1.0]))

    # Outside the one-step spec box it is only a visible melee weapon.
    s.x[0, 1] = 4
    legal = actions.compute(s, eng.gear_tables)
    inputs = observation.build(s, eng.gear_tables, legal)
    assert np.array_equal(
        inputs[0, likely_base:likely_base + 3],
        np.array([0.0, 0.0, 1.0]))


def test_visible_style_history_is_recorded_on_positive_damage_at_impact():
    eng = engine.Engine(1, HoldScores(), seed=18, epsilon=0.0)
    s = eng.state
    s.hp[:] = 999

    # Side 1's magic hit lands on side 0 while the staff is still visible.
    s.weapon_id[0, 1] = gear.ZURIELS_STAFF.item_id
    s.pending_damage[0, 0, 0] = 1
    s.pending_style_of_hit[0, 0, 0] = schema.STYLE_MAGIC
    eng._land_pending_damage()
    assert s.style_sample_count[0, 0] == 1
    assert s.style_match_count[0, 0] == 1
    assert s.last_style_outcome[0, 0] == 1
    assert s.style_sample_count[0, 1] == 0, (
        "the observation belongs to the defender, not the attacker")

    # A launched magic projectile arrives after the attacker switches to range.
    s.weapon_id[0, 1] = gear.ZARYTE_CROSSBOW.item_id
    s.pending_damage[0, 0, 0] = 1
    s.pending_style_of_hit[0, 0, 0] = schema.STYLE_MAGIC
    eng._land_pending_damage()
    assert s.style_sample_count[0, 0] == 2
    assert s.style_match_count[0, 0] == 1
    assert s.last_style_outcome[0, 0] == -1


def test_visible_style_history_ignores_zero_damage_and_caps_at_sixteen():
    eng = engine.Engine(1, HoldScores(), seed=19, epsilon=0.0)
    s = eng.state
    s.hp[:] = 999
    s.weapon_id[0, 1] = gear.ZURIELS_STAFF.item_id

    # Java only calls the accumulator from its positive-damage branch.
    s.pending_style_of_hit[0, 0, 0] = schema.STYLE_MAGIC
    eng._land_pending_damage()
    assert s.style_sample_count[0, 0] == 0

    for _ in range(20):
        s.pending_damage[0, 0, 0] = 1
        s.pending_style_of_hit[0, 0, 0] = schema.STYLE_MAGIC
        eng._land_pending_damage()
    assert s.style_sample_count[0, 0] == 16
    assert s.style_match_count[0, 0] == 16


def test_visible_style_history_keeps_overlapping_hits_and_java_order():
    eng = engine.Engine(1, HoldScores(), seed=190, epsilon=0.0)
    s = eng.state
    s.hp[:] = 999
    s.weapon_id[0, 1] = gear.ZURIELS_STAFF.item_id

    damage = np.zeros((1, 2), dtype=np.int32)
    style = np.full((1, 2), schema.STYLE_NONE, dtype=np.int32)
    delay = np.ones((1, 2), dtype=np.int32)
    active = np.zeros((1, 2), dtype=bool)
    damage[0, 1] = 1
    active[0, 1] = True

    style[0, 1] = schema.STYLE_MAGIC
    eng._queue_hit(damage, style, delay, active)
    style[0, 1] = schema.STYLE_RANGED
    eng._queue_hit(damage, style, delay, active)
    eng._land_pending_damage()

    assert s.style_sample_count[0, 0] == 2
    assert s.style_match_count[0, 0] == 1
    assert np.array_equal(
        s.style_outcome_window[0, 0, -2:], np.array([1, -1]))
    assert s.last_style_outcome[0, 0] == -1


def test_freeze_input_uses_java_eighty_tick_normalizer():
    eng = engine.Engine(2, HoldScores(), seed=20, epsilon=0.0)
    eng.state.freeze_ticks[:] = 32
    legal = actions.compute(eng.state, eng.gear_tables)
    inputs = observation.build(eng.state, eng.gear_tables, legal)
    assert np.allclose(
        inputs[:, schema.INPUT_SELF_FREEZE_TICKS], 0.4)


def test_opponent_melee_reach_uses_staged_freeze_on_the_thaw_tick():
    eng = engine.Engine(1, HoldScores(), seed=201, epsilon=0.0)
    s = eng.state
    s.x[0] = [0, 0]
    s.y[0] = [0, 0]

    # The opponent has just thawed live, but Java's OpponentInfoSnapshot still
    # reports the prior-tick frozen state. On the same tile that must suppress
    # opponent melee reach until the next visible-state settlement.
    s.freeze_ticks[0, 1] = 0
    s.seen_opp_frozen[0, 0] = True
    legal = actions.compute(s, eng.gear_tables)
    inputs = observation.build(s, eng.gear_tables, legal)
    assert inputs[0, schema.INPUT_OPP_FROZEN] == 1.0
    assert inputs[0, schema.INPUT_OPP_MELEE_REACH] == 0.0

    s.seen_opp_frozen[0, 0] = False
    legal = actions.compute(s, eng.gear_tables)
    inputs = observation.build(s, eng.gear_tables, legal)
    assert inputs[0, schema.INPUT_OPP_MELEE_REACH] == 1.0


def test_scripted_freeze_retry_uses_staged_opponent_freeze():
    eng = engine.Engine(1, HoldScores(), seed=202, epsilon=0.0)
    s = eng.state
    s.tick[:] = 12
    s.freeze_ticks[0, 1] = 0
    s.seen_opp_frozen[0, 0] = True
    s.seen_opp_overhead[0, 0] = schema.PRAY_PROTECT_MELEE
    legal = actions.compute(s, eng.gear_tables)

    observation.build(s, eng.gear_tables, legal)
    assert s.next_freeze_attempt_tick[0, 0] == 0

    s.seen_opp_frozen[0, 0] = False
    observation.build(s, eng.gear_tables, legal)
    assert s.next_freeze_attempt_tick[0, 0] == 18


def test_scripted_ranged_ev_uses_the_current_weapon_reach():
    eng = engine.Engine(1, HoldScores(), seed=21, epsilon=0.0)
    s = eng.state
    s.x[0] = [0, 4]
    s.y[0] = [0, 0]
    s.seen_opp_overhead[0, 0] = schema.PRAY_PROTECT_MAGIC
    scripted_base = schema.INPUT_STYLE_BLOCK_BASE + 6

    # With a staff actually worn, Java's ranged threat estimate only reaches
    # three tiles even though its hypothetical ranged set contains a crossbow.
    legal = actions.compute(s, eng.gear_tables)
    inputs = observation.build(s, eng.gear_tables, legal)
    assert np.all(
        inputs[0, scripted_base:scripted_base + 3]
        == np.array([1.0, 0.0, 0.0]))

    # Wearing the crossbow makes the same ranged estimate legal at four tiles.
    s.weapon_id[0, 0] = gear.ZARYTE_CROSSBOW.item_id
    s.equipped_ids[0, 0, gear.SLOT_WEAPON] = gear.ZARYTE_CROSSBOW.item_id
    legal = actions.compute(s, eng.gear_tables)
    inputs = observation.build(s, eng.gear_tables, legal)
    assert np.all(
        inputs[0, scripted_base:scripted_base + 3]
        == np.array([0.0, 1.0, 0.0]))


def test_observed_opponent_attack_age_first_appears_as_one_tick():
    eng = engine.Engine(
        1, HoldScores(), seed=22, epsilon=0.0,
        start_distance_min=4, start_distance_max=4)
    eng.state.ticks_since_attack[0, 1] = 0
    eng._settle_visible_state()
    legal = actions.compute(eng.state, eng.gear_tables)
    inputs = observation.build(eng.state, eng.gear_tables, legal)
    assert np.isclose(
        inputs[0, schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK],
        1.0 / schema.OPPONENT_OBSERVED_ATTACK_AGE_NORMALIZER)


def test_engine_does_not_double_advance_first_observed_attack_age():
    class OneSidedAttack(HoldScores):
        def score(self, inputs):
            scores, value = super().score(inputs)
            scores[0, schema.COMBAT_NO_ATTACK] = 0.0
            scores[0, schema.COMBAT_ATTACK_BASE] = 100.0
            return scores, value

    eng = engine.Engine(
        1, OneSidedAttack(), seed=23, epsilon=0.0,
        start_distance_min=4, start_distance_max=4)
    eng.step()
    first = eng.step()
    assert np.isclose(
        first.next_inputs[1, schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK],
        1.0 / schema.OPPONENT_OBSERVED_ATTACK_AGE_NORMALIZER)


def test_opponent_status_uses_delayed_client_visible_rounding():
    eng = engine.Engine(1, HoldScores(), seed=24, epsilon=0.0)
    s = eng.state
    s.hp[0] = [63, 71]
    s.freeze_ticks[0] = [32, 33]
    s.moving[0] = [False, True]
    eng._settle_visible_state()

    # Java publishes the opponent status snapshot after the tick, rounding
    # positive HP and freeze time to the values a real client would display.
    assert np.array_equal(s.seen_opp_hp[0], [70, 65])
    assert np.array_equal(s.seen_opp_freeze_ticks[0], [35, 30])
    assert np.array_equal(s.seen_opp_moving[0], [True, False])

    legal = actions.compute(s, eng.gear_tables)
    inputs = observation.build(s, eng.gear_tables, legal)
    assert np.allclose(
        inputs[:, schema.INPUT_OPP_HP], np.array([70.0, 65.0]) / 99.0)
    assert np.allclose(
        inputs[:, schema.INPUT_OPP_FREEZE_TICKS],
        np.array([35.0, 30.0]) / schema.FREEZE_TICKS_NORMALIZER)


if __name__ == "__main__":
    failures = 0
    for name, function in sorted(globals().items()):
        if name.startswith("test_") and callable(function):
            try:
                function()
                print(f"  ok   {name}")
            except AssertionError as error:
                failures += 1
                print(f"  FAIL {name}: {error}")
    print("observation state contract:",
          "OK" if failures == 0 else f"{failures} FAILED")
    raise SystemExit(1 if failures else 0)
