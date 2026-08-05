"""Weapon inputs must use the learned Java embedding frequency."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import actions, engine, observation, policy, schema  # noqa: E402


def test_weapon_embedding_uses_java_frequency() -> None:
    fight = engine.Engine(
        n_fights=1, policy=policy.RandomPolicy(seed=1), seed=2, max_ticks=2)
    fight.state.weapon_id[0, 0] = 22613
    fight.state.weapon_id[0, 1] = 22647
    legal = actions.compute(fight.state, fight.gear_tables)
    inputs = observation.build(fight.state, fight.gear_tables, legal)

    np.testing.assert_allclose(
        inputs[0, schema.INPUT_SELF_WEAPON_SIN],
        np.sin(22613 * 0.013),
        rtol=0.0,
        atol=1e-7)
    np.testing.assert_allclose(
        inputs[0, schema.INPUT_OPP_WEAPON_SIN],
        np.sin(22647 * 0.013),
        rtol=0.0,
        atol=1e-7)


if __name__ == "__main__":
    test_weapon_embedding_uses_java_frequency()
    print("observation weapon embedding: OK")
