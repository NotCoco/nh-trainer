"""Focused Java-parity checks for Vengeance reflection timing."""

from __future__ import annotations

import numpy as np

from fastsim import engine, schema, state


class HoldScores:
    input_size = schema.INPUT_SIZE

    def score(self, inputs):
        rows = inputs.shape[0]
        scores = np.zeros((rows, schema.ACTION_COUNT), dtype=np.float32)
        scores[:, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 100.0
        scores[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MELEE] = 100.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 100.0
        return scores, np.zeros(rows, dtype=np.float32)


def test_reflection_is_a_delayed_fixed_typeless_hit():
    eng = engine.Engine(
        1, HoldScores(), seed=1, epsilon=0.0, replay_seed=424242)
    s = eng.state
    s.vengeance_active[0] = [True, True]
    incoming = np.zeros(
        (1, 2, state.PENDING_HITS_PER_SLOT), dtype=np.int32)
    styles = np.full(
        (1, 2, state.PENDING_HITS_PER_SLOT), -1, dtype=np.int32)
    count = np.array([[1, 0]], dtype=np.int32)
    incoming[0, 0, 0] = 35
    styles[0, 0, 0] = schema.STYLE_MAGIC

    eng._apply_vengeance_reflect(incoming, styles, count)

    # Java creates a default-delay Hit during postDamage. It cannot change HP
    # in the policy snapshot from the same completed tick.
    assert np.array_equal(s.hp[0], [99, 99])
    assert s.pending_damage[0, 1, 0] == 27
    assert not s.vengeance_active[0, 0]
    assert s.vengeance_active[0, 1]
    # Hit.defend consumes an ordinal even though fixed typeless damage needs no
    # random draw. The following same-tick attack therefore uses ordinal one.
    assert np.array_equal(eng._replay_hit_ordinals[0], [1, 0])

    eng._land_pending_damage()
    assert np.array_equal(s.hp[0], [99, 72])
    # The reflected Hit has no attack style, so it cannot trigger Vengeance.
    assert s.vengeance_active[0, 1]
    assert not s.pending_damage.any()


def test_typeless_reflection_is_not_combined_with_a_same_tick_attack():
    eng = engine.Engine(
        1, HoldScores(), seed=1, epsilon=0.0, replay_seed=424242)
    s = eng.state
    s.vengeance_active[0, 1] = True
    incoming = np.zeros(
        (1, 2, state.PENDING_HITS_PER_SLOT), dtype=np.int32)
    styles = np.full(
        (1, 2, state.PENDING_HITS_PER_SLOT), -1, dtype=np.int32)
    count = np.array([[0, 2]], dtype=np.int32)
    incoming[0, 1, :2] = [27, 53]
    styles[0, 1, :2] = [-1, schema.STYLE_MELEE]

    eng._apply_vengeance_reflect(incoming, styles, count)

    assert s.pending_damage[0, 0, 0] == 40
    assert not s.vengeance_active[0, 1]


if __name__ == "__main__":
    test_reflection_is_a_delayed_fixed_typeless_hit()
    test_typeless_reflection_is_not_combined_with_a_same_tick_attack()
    print("vengeance timing: OK")
