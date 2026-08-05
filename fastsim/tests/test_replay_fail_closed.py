"""Deterministic replay must reject a stale or mechanically illegal plan."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import engine, policy, schema  # noqa: E402


def _plan(supply_action: int):
    forced = (
        schema.COMBAT_NO_ATTACK,
        schema.COMBAT_SPEC_NONE,
        schema.DEFENCE_BASE,
        schema.MOVEMENT_BASE + schema.MOVE_NONE,
        supply_action,
    )
    return {(0, 0): forced, (0, 1): forced}


def test_legal_replay_plan_executes():
    eng = engine.Engine(
        n_fights=1,
        policy=policy.RandomPolicy(seed=1),
        seed=1,
        epsilon=0.0,
        max_ticks=2,
        replay_plan=_plan(schema.SUPPLY_BASE + schema.SUPPLY_NONE),
    )
    eng.step()


def test_illegal_replay_plan_fails_closed():
    eng = engine.Engine(
        n_fights=1,
        policy=policy.RandomPolicy(seed=1),
        seed=1,
        epsilon=0.0,
        max_ticks=2,
        replay_plan=_plan(schema.SUPPLY_BASE + schema.SUPPLY_PANIC_FULL),
    )
    try:
        eng.step()
    except ValueError as exc:
        assert "replay action mismatch" in str(exc)
    else:
        raise AssertionError("stale replay plan silently changed its action")


if __name__ == "__main__":
    test_legal_replay_plan_executes()
    test_illegal_replay_plan_fails_closed()
    print("replay fail-closed checks passed")
