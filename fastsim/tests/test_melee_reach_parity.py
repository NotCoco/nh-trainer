"""Focused Java/FastSim melee TargetRoute reach contracts."""

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


def _combat_slot(style, intent):
    return (
        schema.COMBAT_BASE
        + schema.COMBAT_ATTACK_BASE
        + style * 2
        + intent
    )


def _spec_slot(kind, intent):
    return (
        schema.COMBAT_BASE
        + schema.COMBAT_SPEC_BASE
        + kind * 2
        + intent
    )


def test_exact_standing_and_two_substep_drag_in_boundaries():
    assert actions._melee_reach_now(1, 1, True, 1)
    assert not actions._melee_reach_now(2, 0, True, 1)
    assert actions._melee_reach_now(2, 2, True, 2)
    assert not actions._melee_reach_now(3, 0, True, 2)

    assert actions._melee_reach_now(3, 3, False, 1)
    assert not actions._melee_reach_now(4, 0, False, 1)
    assert actions._melee_reach_now(4, 4, False, 2)
    assert not actions._melee_reach_now(5, 0, False, 2)


def test_current_action_legality_uses_required_weapon_range():
    eng = engine.Engine(1, HoldScores(), seed=301, epsilon=0.0)
    state = eng.state
    state.x[0] = [0, 4]
    state.y[0] = [0, 0]
    state.freeze_ticks[:] = 0
    state.attack_delay[:] = 0
    state.special_energy[:] = 1000

    legal = actions.compute(state, eng.gear_tables)
    ordinary_melee = _combat_slot(
        schema.STYLE_MELEE, schema.ATTACK_INTENT_ATTACK)
    gmaul_spec = _spec_slot(
        schema.SPEC_GRANITE_MAUL, schema.ATTACK_INTENT_ATTACK)
    assert legal.mask[0, ordinary_melee]
    assert not legal.mask[0, gmaul_spec]

    state.x[0, 1] = 3
    legal = actions.compute(state, eng.gear_tables)
    assert legal.mask[0, ordinary_melee]
    assert legal.mask[0, gmaul_spec]


def test_reach_inputs_use_current_and_t_minus_one_weapon_ranges():
    eng = engine.Engine(1, HoldScores(), seed=302, epsilon=0.0)
    state = eng.state
    state.x[0] = [0, 2]
    state.y[0] = [0, 0]
    state.freeze_ticks[0, 0] = 8
    state.seen_opp_frozen[0, 0] = True

    state.weapon_id[0, 0] = gear.VESTAS_LONGSWORD.item_id
    state.seen_opp_weapon_id[0, 0] = gear.VESTAS_LONGSWORD.item_id
    legal = actions.compute(state, eng.gear_tables)
    inputs = observation.build(state, eng.gear_tables, legal)
    assert inputs[0, schema.INPUT_MELEE_REACH] == 0.0
    assert inputs[0, schema.INPUT_OPP_MELEE_REACH] == 0.0

    state.weapon_id[0, 0] = gear.NOXIOUS_HALBERD.item_id
    # Live side 1 may already hold the halberd, but side 0 must continue using
    # its deliberately staged T-1 weapon until that snapshot advances.
    state.weapon_id[0, 1] = gear.NOXIOUS_HALBERD.item_id
    legal = actions.compute(state, eng.gear_tables)
    inputs = observation.build(state, eng.gear_tables, legal)
    assert inputs[0, schema.INPUT_MELEE_REACH] == 1.0
    assert inputs[0, schema.INPUT_OPP_MELEE_REACH] == 0.0

    state.seen_opp_weapon_id[0, 0] = gear.NOXIOUS_HALBERD.item_id
    legal = actions.compute(state, eng.gear_tables)
    inputs = observation.build(state, eng.gear_tables, legal)
    assert inputs[0, schema.INPUT_OPP_MELEE_REACH] == 1.0


def test_visible_frozen_distance_two_threat_distinguishes_halberd():
    eng = engine.Engine(1, HoldScores(), seed=303, epsilon=0.0)
    state = eng.state
    state.x[0] = [0, 2]
    state.y[0] = [0, 0]
    state.seen_opp_frozen[0, 0] = True

    state.seen_opp_weapon_id[0, 0] = gear.VESTAS_LONGSWORD.item_id
    _, damage = eng._visible_threat_fields()
    assert damage[0] == 0

    state.seen_opp_weapon_id[0, 0] = gear.NOXIOUS_HALBERD.item_id
    index, damage = eng._visible_threat_fields()
    assert index[0] == schema.STYLE_MELEE
    assert damage[0] == 88
