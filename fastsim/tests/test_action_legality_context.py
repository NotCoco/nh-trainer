"""Java's contextual prayer and supply support-mask gates."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import actions, engine, gear, schema  # noqa: E402


class ZeroScores:
    input_size = schema.INPUT_SIZE

    def score(self, inputs):
        return (
            np.zeros((len(inputs), schema.ACTION_COUNT), dtype=np.float32),
            np.zeros(len(inputs), dtype=np.float32),
        )


def _legal(eng):
    return actions.compute(eng.state, eng.gear_tables).mask


def test_full_health_masks_healing_but_initial_reboost_is_legal():
    eng = engine.Engine(8, ZeroScores(), seed=13, epsilon=0.0)
    legal = _legal(eng)
    assert not legal[:, schema.SUPPLY_BASE + schema.SUPPLY_SAFE_EAT].any()
    assert not legal[:, schema.SUPPLY_BASE + schema.SUPPLY_BREW_ONLY].any()
    assert legal[:, schema.SUPPLY_BASE
                 + schema.SUPPLY_RESTORE_REBOOST].all()


def test_recent_large_hit_opens_safe_eat_and_brew():
    eng = engine.Engine(8, ZeroScores(), seed=14, epsilon=0.0)
    eng.state.last_taken_hit[:] = 30
    legal = _legal(eng)
    assert legal[:, schema.SUPPLY_BASE + schema.SUPPLY_SAFE_EAT].all()
    assert legal[:, schema.SUPPLY_BASE + schema.SUPPLY_BREW_ONLY].all()


def test_smite_and_redemption_use_their_java_context_windows():
    eng = engine.Engine(8, ZeroScores(), seed=15, epsilon=0.0)
    legal = _legal(eng)
    assert legal[:, schema.DEFENCE_BASE + schema.PRAY_SMITE].all()
    assert not legal[:, schema.DEFENCE_BASE + schema.PRAY_REDEMPTION].any()

    eng.state.hp[:] = 25
    legal = _legal(eng)
    assert not legal[:, schema.DEFENCE_BASE + schema.PRAY_SMITE].any()
    assert legal[:, schema.DEFENCE_BASE + schema.PRAY_REDEMPTION].all()


def test_java_global_mask_exposes_all_current_direct_gear_rows():
    eng = engine.Engine(8, ZeroScores(), seed=18, epsilon=0.0)
    legal = _legal(eng)
    assert legal[:, schema.GEAR_BASE:].all()


def test_stand_under_is_masked_after_reaching_the_opponent_tile():
    eng = engine.Engine(8, ZeroScores(), seed=181, epsilon=0.0)
    s = eng.state
    s.x[:] = 0
    s.y[:] = 0
    s.origin_x[:] = 0
    s.origin_y[:] = 0
    s.freeze_ticks[:] = 0
    s.lock_ticks[:] = 0
    s.seen_opp_frozen[:] = True
    stand_under = schema.MOVEMENT_BASE + schema.MOVE_STAND_UNDER

    assert not _legal(eng)[:, stand_under].any()

    s.x[:, 1] = 1
    assert _legal(eng)[:, stand_under].all()


def test_can_attack_input_uses_live_weapon_style_not_current_offence():
    eng = engine.Engine(
        1, ZeroScores(), seed=19, epsilon=0.0,
        start_distance_min=5, start_distance_max=5)
    eng.state.style[:] = schema.STYLE_MELEE
    legal = actions.compute(eng.state, eng.gear_tables)
    assert legal.can_attack.all(), (
        "the live Zuriel staff was incorrectly range-checked as melee")

    eng.state.style[:] = schema.STYLE_MAGIC
    eng.state.weapon_id[:] = gear.VOIDWAKER.item_id
    eng.state.equipped_ids[:, :, gear.SLOT_WEAPON] = gear.VOIDWAKER.item_id
    legal = actions.compute(eng.state, eng.gear_tables)
    assert not legal.can_attack.any(), (
        "the live Voidwaker was incorrectly range-checked as magic")


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
    print("action legality context:",
          "OK" if failures == 0 else f"{failures} FAILED")
    raise SystemExit(1 if failures else 0)
