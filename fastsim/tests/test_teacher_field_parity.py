"""Focused Java-v25 teacher-field timing and encoding contracts."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import engine, gear, schema  # noqa: E402


class OneSidedMage:
    input_size = schema.INPUT_SIZE

    def score(self, inputs):
        count = len(inputs)
        scores = np.zeros(
            (count, schema.ACTION_COUNT), dtype=np.float32)
        scores[:, schema.COMBAT_NO_ATTACK] = 100.0
        scores[:, schema.COMBAT_SPEC_NONE] = 100.0
        scores[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MAGIC] = 100.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 100.0
        scores[0, schema.COMBAT_NO_ATTACK] = 0.0
        scores[0, schema.COMBAT_ATTACK_BASE] = 200.0
        return scores, np.zeros(count, dtype=np.float32)


def test_offensive_style_teacher_source_bonus_is_explicit():
    assert engine.OFFENSIVE_STYLE_TEACHER_OFF_PRAYER_BONUS == 2.0


def test_visible_threat_uses_staged_weapon_and_reach():
    eng = engine.Engine(1, OneSidedMage(), seed=51, epsilon=0.0)
    state = eng.state
    state.x[0] = (0, 1)
    state.y[0] = (0, 0)
    state.seen_opp_frozen[:] = False
    # Voidwaker/VLS spending is hidden from the client-side estimate. The
    # visible threat must remain the same even when true energy is exhausted.
    state.seen_opp_spec_energy[:] = 0
    state.seen_opp_weapon_id[0, 0] = gear.VESTAS_LONGSWORD.item_id
    state.seen_opp_weapon_id[0, 1] = gear.VOIDWAKER.item_id

    index, damage = eng._visible_threat_fields()

    assert index.tolist() == [schema.STYLE_MELEE, schema.STYLE_MAGIC]
    assert damage.tolist() == [106, 33]


def test_same_tick_offensive_teachers_and_zero_style_defaults():
    eng = engine.Engine(
        1, OneSidedMage(), seed=52, epsilon=0.0, max_ticks=20,
        start_distance_min=4, start_distance_max=4)
    eng.step()
    record = eng._pending

    assert record.roll_prayer_teacher_action.tolist() == [-1, -1]
    assert record.roll_prayer_teacher_attack_style_code.tolist() == [0, 0]
    assert record.offensive_style_teacher_action[0] >= 0
    style = int(record.offensive_style_teacher_attack_style_code[0])
    action = int(record.offensive_style_teacher_action[0])
    assert style in (1, 2, 3)
    assert action == schema.COMBAT_ATTACK_BASE + (3 - style) * 2
    # Side 1 raises Protect Magic on this same tick, but side 0 could not see
    # that when it chose the attack. The label must match side 0's delayed
    # decision input rather than leaking the new prayer.
    assert record.offensive_style_teacher_defender_prayer_style_code[0] == 0
    assert record.offensive_style_teacher_action[1] == -1
    assert record.offensive_style_teacher_attack_style_code[1] == 0
    assert record.offensive_style_teacher_defender_prayer_style_code[1] == 0

    assert record.roll_offensive_gear_teacher_action_count.tolist() == [4, 0]
    assert record.roll_offensive_gear_teacher_actions[0].tolist() == [
        60, 61, 63, 62]
    assert record.roll_offensive_gear_teacher_attack_style_code.tolist() == [
        3, 0]


def test_vengeance_opportunity_targets_previous_tick_and_takes_max():
    eng = engine.Engine(
        1, OneSidedMage(), seed=53, epsilon=0.0, max_ticks=20,
        start_distance_min=4, start_distance_max=4)
    eng.step()
    pending = eng._pending
    fired = np.array([[True, False]])

    eng._book_vengeance_opportunity(fired, np.array([[5.0, 0.0]]))
    eng._book_vengeance_opportunity(fired, np.array([[8.0, 0.0]]))

    assert pending.vengeance_opportunity_roll_tick.tolist() == [-1, 1]
    assert pending.vengeance_opportunity_expected_damage.tolist() == [
        0.0, 8.0]


if __name__ == "__main__":
    for name, function in sorted(globals().copy().items()):
        if name.startswith("test_") and callable(function):
            function()
            print(f"  ok   {name}")
