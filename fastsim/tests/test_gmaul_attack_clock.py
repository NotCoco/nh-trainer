"""Granite-maul specials must not restart the ordinary attack-age clock."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import engine, gear, schema  # noqa: E402


class HoldPolicy:
    input_size = schema.INPUT_SIZE

    @staticmethod
    def score(inputs):
        rows = inputs.shape[0]
        scores = np.zeros((rows, schema.ACTION_COUNT), dtype=np.float32)
        scores[:, schema.COMBAT_NO_ATTACK] = 10.0
        scores[:, schema.COMBAT_SPEC_NONE] = 10.0
        scores[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MELEE] = 10.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 10.0
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 10.0
        return scores, np.zeros(rows, dtype=np.float32)


def _granite_maul_engine():
    runner = engine.Engine(
        1,
        HoldPolicy(),
        seed=31,
        epsilon=0.0,
        start_distance_min=1,
        start_distance_max=1,
    )
    state = runner.state
    state.style[0, 0] = schema.STYLE_MELEE
    state.weapon_id[0, 0] = gear.GRANITE_MAUL.item_id
    state.equipped_ids[0, 0, gear.SLOT_WEAPON] = gear.GRANITE_MAUL.item_id
    state.special_energy[0, 0] = 1000
    return runner


def test_gmaul_special_preserves_ordinary_attack_clock_and_visible_age():
    for kind in (
            schema.SPEC_GRANITE_MAUL,
            schema.SPEC_GRANITE_MAUL_DOUBLE):
        runner = _granite_maul_engine()
        state = runner.state
        state.ticks_since_attack[0] = [4, 9]
        state.attack_delay[0, 0] = 3
        attacking = np.zeros((1, 2), dtype=bool)
        speccing = np.asarray([[True, False]])
        spec_kind = np.asarray([[kind, -1]])

        runner._resolve_attacks(attacking, speccing, spec_kind)

        assert state.ticks_since_attack[0, 0] == 4
        assert state.attack_delay[0, 0] == 3
        assert state.last_attack_style[0, 0] == schema.STYLE_MELEE
        runner._settle_visible_state()
        assert state.opp_ticks_since_observed_attack[0, 1] == 4


def test_ordinary_granite_maul_swing_resets_clock_and_starts_seven_ticks():
    runner = _granite_maul_engine()
    state = runner.state
    state.ticks_since_attack[0] = [4, 9]
    state.attack_delay[0, 0] = 0
    attacking = np.asarray([[True, False]])
    speccing = np.zeros((1, 2), dtype=bool)
    spec_kind = np.full((1, 2), -1, dtype=np.int32)

    runner._resolve_attacks(attacking, speccing, spec_kind)

    assert state.ticks_since_attack[0, 0] == 0
    assert state.attack_delay[0, 0] == gear.GRANITE_MAUL.attack_ticks == 7
    runner._settle_visible_state()
    assert state.opp_ticks_since_observed_attack[0, 1] == 0


if __name__ == "__main__":
    test_gmaul_special_preserves_ordinary_attack_clock_and_visible_age()
    test_ordinary_granite_maul_swing_resets_clock_and_starts_seven_ticks()
    print("gmaul attack clock: OK")
