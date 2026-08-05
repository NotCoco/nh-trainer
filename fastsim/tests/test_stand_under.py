"""Standing under someone: what it stops, and what it does not.

The mechanic NH is built around. `TargetRoute.inTarget` is true when two
players' tiles overlap, and both places that decide whether you may attack
exclude it:

    beforeMovement0:  if(!inTarget(...) && inRange(...)) withinDistance = true;
    allowStep:        if(inTarget(stepX, stepY, ...)) { withinDistance = false; ... }

So a hit cannot launch while the fighters still overlap. A free fighter with an
immediate melee command may let TargetRoute step it out and then attack; a
frozen player cannot. An explicit tile step still owns its tick and does not
also attack.

Without this the rig produced fights where both fighters sat on one tile
trading hits forever, which is nothing like the real server.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import engine, schema, state  # noqa: E402

STEP_OFF = next(i for i in range(len(schema.MOVEMENT_OFFSETS))
                if tuple(schema.MOVEMENT_OFFSETS[i]) == (1, 0))


class Actor:
    """Both sides attack with `style`; movement is whatever is passed."""

    def __init__(self, style, movement=schema.MOVE_NONE, movement_side=None):
        self.style = style
        self.movement = movement
        self.movement_side = movement_side
        self.input_size = schema.INPUT_SIZE

    def score(self, inputs):
        n = inputs.shape[0]
        s = np.zeros((n, schema.ACTION_COUNT), dtype=np.float32)
        s[:, schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE] = 100.0
        s[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 100.0
        s[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MELEE] = 100.0
        s[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        attack = (schema.COMBAT_BASE + schema.COMBAT_ATTACK_BASE
                  + self.style * 2 + schema.ATTACK_INTENT_ATTACK)
        s[:, attack] = 200.0
        if self.movement_side is not None:
            rows = np.arange(self.movement_side, n, 2)
            s[rows, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 0.0
            s[rows, schema.MOVEMENT_BASE + self.movement] = 200.0
        return s, np.zeros(n, dtype=np.float32)


class HoldActor(Actor):
    """Select policy HOLD while leaving any existing combat target intact."""

    def score(self, inputs):
        scores, value = super().score(inputs)
        scores[:, schema.COMBAT_BASE:schema.COMBAT_BASE + 7] = 0.0
        scores[:, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 200.0
        return scores, value


def _stacked(style, movement=schema.MOVE_NONE, movement_side=None, n_fights=32):
    eng = engine.Engine(n_fights=n_fights,
                        policy=Actor(style, movement, movement_side),
                        seed=9, epsilon=0.0, max_ticks=300)
    s = eng.state
    s.hp[:] = 99
    s.x[:] = 0
    s.y[:] = 0                       # both fighters on the same tile
    s.prev_x, s.prev_y = s.x.copy(), s.y.copy()
    s.origin_x, s.origin_y = s.x.copy(), s.y.copy()
    s.lane_min_x = np.full(n_fights, -state.LANE_RADIUS, dtype=np.int32)
    s.lane_max_x = np.full(n_fights, state.LANE_RADIUS, dtype=np.int32)
    s.lane_min_y = np.full(n_fights, -state.LANE_RADIUS, dtype=np.int32)
    s.lane_max_y = np.full(n_fights, state.LANE_RADIUS, dtype=np.int32)
    s.style[:] = style
    s.weapon_id[:] = eng.gear_tables["weapon_id"][style]
    s.attack_delay[:] = 0
    return eng


def test_non_melee_target_route_steps_off_before_launching():
    """Range/magic cannot launch at zero, but TargetRoute moves first."""
    for style in (schema.STYLE_RANGED, schema.STYLE_MAGIC):
        eng = _stacked(style)
        s = eng.state
        assert (s.distance() == 0).all(), "test setup: they should be stacked"

        eng.step()

        assert (s.distance() == 1).all(), (
            f"{style}: TargetRoute did not move off the overlap")
        assert s.pending_damage.sum() == 0 and s.damage_taken.sum() == 0, (
            f"{style}: HOLD leaked an attack on the route-out tick")

        eng.step()
        assert (s.pending_damage.sum() + s.damage_taken.sum()) > 0, (
            f"{style}: the next in-range decision did not launch")


def test_melee_target_route_steps_out_before_attacking():
    """Same-tile melee reach is a route-out opportunity, not an in-place hit."""
    eng = _stacked(schema.STYLE_MELEE)
    s = eng.state

    eng.step()

    assert (s.distance() == 1).all(), (
        "TargetRoute did not find an adjacent tile from the overlap")
    assert s.moving[:, 0].all()
    assert (s.pending_damage.sum() + s.damage_taken.sum()) > 0, (
        "melee route stepped out but never launched the now-adjacent attack")


def test_hold_preserves_an_existing_target_route_and_steps_off_overlap():
    """HOLD suppresses the swing, not PlayerCombat's retained target."""
    eng = _stacked(schema.STYLE_MAGIC)
    eng.policy = HoldActor(schema.STYLE_MAGIC)
    s = eng.state
    s.combat_target[:, 0] = True

    eng.step()

    assert (s.distance() == 1).all(), (
        "policy HOLD incorrectly cleared the retained combat TargetRoute")
    assert s.moving[:, 0].all()
    assert not s.moving[:, 1].any()
    assert s.pending_damage.sum() == 0 and s.damage_taken.sum() == 0, (
        "HOLD leaked an ordinary attack while the target route moved")


def test_frozen_retained_target_cannot_route_off_overlap():
    """TargetRoute is reset when RouteFinder sees movement blocked by freeze."""
    eng = _stacked(schema.STYLE_MAGIC)
    eng.policy = HoldActor(schema.STYLE_MAGIC)
    s = eng.state
    s.combat_target[:] = True
    s.freeze_ticks[:] = 30

    eng.step()

    assert (s.distance() == 0).all()
    assert not s.moving.any()


def test_a_frozen_player_under_an_opponent_can_do_nothing():
    """The frozen one cannot step off and cannot attack, so they just wait."""
    eng = _stacked(schema.STYLE_MAGIC, movement=STEP_OFF, movement_side=0)
    s = eng.state
    s.freeze_ticks[:, 1] = 30        # side 1 is frozen, side 0 is free

    eng.step()                        # side 0 steps off
    assert (s.distance() == 1).all(), "side 0 should have stepped off the tile"
    assert not s.moving[:, 1].any(), "a frozen fighter moved"

    # Side 1 was stuck under them for that tick and threw nothing.
    assert s.pending_damage[:, 0, :].sum() == 0, (
        "the frozen fighter attacked while stood underneath")


def test_explicit_step_out_owns_the_tick_and_does_not_attack():
    """NhStakerBot.explicitMovementWinsTick resets the combat route."""
    eng = _stacked(schema.STYLE_MAGIC, movement=STEP_OFF, movement_side=0)
    s = eng.state

    eng.step()

    assert s.moving[:, 0].all(), "side 0 did not step off"
    assert (s.distance() == 1).all()
    assert s.pending_damage[:, 1, :].sum() == 0, (
        "an explicit movement-channel step must consume the attack tick")


def test_once_separated_they_fight_normally():
    """Guard against the same-tile rule accidentally disabling combat."""
    eng = _stacked(schema.STYLE_MAGIC)
    s = eng.state
    s.x[:, 1] = 4
    s.prev_x = s.x.copy()

    for _ in range(8):
        eng.step()

    assert (s.pending_damage.sum() + s.damage_taken.sum()) > 0, (
        "two separated fighters never attacked")


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
    print("stand under:", "OK" if failures == 0 else f"{failures} FAILED")
    raise SystemExit(1 if failures else 0)
