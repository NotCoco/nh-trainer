"""Ice Barrage's 20-second hold is 33 logical game ticks, not 20 ticks."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import combat, engine, schema, state  # noqa: E402


class OneSidedMage:
    def __init__(self):
        self.attack = True
        self.input_size = schema.INPUT_SIZE

    def score(self, inputs):
        rows = inputs.shape[0]
        scores = np.zeros((rows, schema.ACTION_COUNT), dtype=np.float32)
        scores[:, schema.COMBAT_NO_ATTACK] = 100.0
        scores[:, schema.COMBAT_SPEC_NONE] = 100.0
        scores[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MELEE] = 100.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 100.0
        if self.attack:
            side0 = np.arange(0, rows, 2)
            action = (schema.COMBAT_ATTACK_BASE
                      + schema.STYLE_MAGIC * 2
                      + schema.ATTACK_INTENT_ATTACK)
            scores[side0, schema.COMBAT_NO_ATTACK] = 0.0
            scores[side0, action] = 1000.0
        return scores, np.zeros(rows, dtype=np.float32)


def test_barrage_applies_thirty_three_tick_hold_in_the_engine():
    actor = OneSidedMage()
    eng = engine.Engine(512, actor, seed=19, epsilon=0.0,
                        start_distance_min=4, start_distance_max=4)
    s = eng.state
    s.hp[:] = 999

    eng.step()
    frozen = s.freeze_ticks[:, 1] > 0
    assert frozen.any(), "test setup produced no successful Barrage"
    assert (s.freeze_ticks[frozen, 1] == combat.BARRAGE_FREEZE_TICKS).all()
    assert combat.BARRAGE_FREEZE_TICKS == 33

    actor.attack = False
    eng.step()
    assert (s.freeze_ticks[frozen, 1] == 32).all(), (
        "the next decision should see 32 ticks remaining")


if __name__ == "__main__":
    test_barrage_applies_thirty_three_tick_hold_in_the_engine()
    print("freeze duration: OK")
