"""When does a hitsplat actually appear? Measured end to end, not by formula.

There are two separate claims here and they need separate tests, because a bug
in one hides behind a correct-looking other.

  1. The DELAY TABLE is right - projectile_ticks() reproduces the Java formula.
     tests/test_combat_parity.py already covers that.

  2. The ENGINE ACTUALLY USES IT - an attack thrown on tick L lands on tick
     L + delay. This is the one that was wrong: the pending-damage buffer is
     read before it is shifted, so writing a hit into slot D instead of D-1 made
     every hit in the game land a tick late. The delay table was perfect the
     whole time, so a formula test could never have caught it.

  3. The BOT OBSERVES IT one decision later. AIPlayer.checkLogout runs the NH
     decision before Player.processHits. HP changes on L + delay, but input/reward
     state cannot include that impact until decision L + delay + 1.

The final section covers PID: whether the player processed later in the tick
gets their hitsplat a tick after the player processed earlier. On real OSRS
they would. On Kronos they do not, and that is deliberate - Hit.defend
compensates for it. The test models the server's own arithmetic under both
processing orders rather than asserting the conclusion.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import combat, engine, gear, schema  # noqa: E402

STYLE_NAMES = {schema.STYLE_MELEE: "melee", schema.STYLE_RANGED: "ranged",
               schema.STYLE_MAGIC: "magic"}


class OneSidedAttacker:
    """Side 0 attacks with a fixed style. Side 1 stands still and does nothing."""

    def __init__(self, style):
        self.style = style
        self.input_size = schema.INPUT_SIZE

    def score(self, inputs):
        n = inputs.shape[0]
        s = np.zeros((n, schema.ACTION_COUNT), dtype=np.float32)
        s[:, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 100.0
        s[:, schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE] = 100.0
        s[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        s[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 100.0
        attack = (schema.COMBAT_BASE + schema.COMBAT_ATTACK_BASE
                  + self.style * 2 + schema.ATTACK_INTENT_ATTACK)
        attackers = np.arange(0, n, 2)          # side 0 of every fight
        s[attackers, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 0.0
        s[attackers, attack] = 200.0
        return s, np.zeros(n, dtype=np.float32)


def _measure_launch_to_land(style, distance, tick_ms=300):
    """Drive a real fight and return (ticks between launch and landing, delay).

    Returns None if the attack never happened - which is the correct answer when
    the target is out of that style's reach.
    """
    eng = engine.Engine(n_fights=8, policy=OneSidedAttacker(style), seed=7,
                        epsilon=0.0, max_ticks=300, tick_ms=tick_ms)
    s = eng.state
    s.hp[:] = 990                                # nobody dies mid-measurement
    s.x[:, 0], s.y[:, 0] = 0, 0
    s.x[:, 1], s.y[:, 1] = distance, 0
    s.prev_x, s.prev_y = s.x.copy(), s.y.copy()
    s.style[:, 0] = style
    s.weapon_id[:, 0] = eng.gear_tables["weapon_id"][style]
    s.equipped_ids[:, 0, gear.SLOT_WEAPON] = s.weapon_id[:, 0]
    if style == schema.STYLE_MELEE:
        s.equipped_ids[:, 0, gear.SLOT_SHIELD] = -1
        s.has_shield[:, 0] = False
    # Hold both fighters at the requested distance. Otherwise the persistent
    # Java combat route correctly walks an out-of-range attacker inward and
    # this helper would measure a later in-range launch instead. This test is
    # about the hit queue; route composition is covered in test_movement.py.
    eng._apply_persistent_combat_route = lambda *args, **kwargs: None

    launches = []
    real_queue = eng._queue_hit

    def spy(damage, hit_style, delay_ticks, active, *args, **kwargs):
        # Captures the launch tick from INSIDE the tick, which is the only
        # ordering that reflects how the engine really runs.
        live = active & (damage > 0)
        if live[0, 0] and not launches:
            launches.append((int(s.tick[0]), int(delay_ticks[0, 0])))
        return real_queue(
            damage, hit_style, delay_ticks, active, *args, **kwargs)

    eng._queue_hit = spy

    for _ in range(80):
        eng.step()
        if launches and s.damage_taken[0, 1] > 0:
            landed_on = int(s.tick[0]) - 1       # step() has already advanced
            return landed_on - launches[0][0], launches[0][1]
    return None


def test_every_style_and_distance_lands_on_the_tick_the_formula_says():
    """The heart of it: launch on tick L, land on tick L + delay.

    Checked for every style at every distance it can actually reach, rather
    than for one sample - a slot-indexing bug is uniform, so one distance
    passing tells you nothing about the rest.
    """
    # The ordinary DMM melee weapon is the two-tile Noxious halberd. Specials
    # remain one-tile attacks and are covered separately.
    reach = {schema.STYLE_MELEE: 2, schema.STYLE_RANGED: 8, schema.STYLE_MAGIC: 10}
    checked = 0
    problems = []

    for style, max_distance in reach.items():
        for distance in range(1, max_distance + 1):
            result = _measure_launch_to_land(style, distance)
            expected = int(combat.projectile_ticks(
                np.array([style]), np.array([distance]), 300)[0])
            if result is None:
                problems.append(
                    f"{STYLE_NAMES[style]} at distance {distance}: never attacked, "
                    f"but this is inside its reach of {max_distance}")
                continue
            gap, used_delay = result
            if used_delay != expected:
                problems.append(
                    f"{STYLE_NAMES[style]} at distance {distance}: engine used a "
                    f"delay of {used_delay}, formula says {expected}")
            if gap != expected:
                problems.append(
                    f"{STYLE_NAMES[style]} at distance {distance}: landed {gap} "
                    f"ticks after launch, should be {expected}")
            checked += 1

    assert not problems, "\n  " + "\n  ".join(problems)
    assert checked == 20, f"expected 20 style/distance pairs, checked {checked}"


def test_a_target_beyond_reach_is_never_hit():
    """The counterpart: out of range means no attack at all, not a late one."""
    for style, first_out_of_reach in ((schema.STYLE_MELEE, 3),
                                      (schema.STYLE_RANGED, 9),
                                      (schema.STYLE_MAGIC, 11)):
        result = _measure_launch_to_land(style, first_out_of_reach)
        assert result is None, (
            f"{STYLE_NAMES[style]} attacked from distance {first_out_of_reach}, "
            f"which is past its reach")


# --- PID ------------------------------------------------------------------
#
# Below is the server's own arithmetic, transcribed. Two methods decide when a
# hitsplat appears:
#
#   Hit.defend (Hit.java:480), run at launch:
#       if (ticks > 0 && target.processed) ticks--;
#
#   Hit.finish (Hit.java:601), run from the target's processHits():
#       if (ticks-- > 0) return false;
#
# and CoreWorker sets player.processed = true immediately before that player's
# process(), so "target.processed" means "the target has already had its turn
# this tick".


def _finish(ticks):
    """Hit.finish's countdown. Returns (landed, ticks after the decrement)."""
    return ticks <= 0, ticks - 1


def _java_landing_tick(delay, attacker_first):
    """Ticks between launch and hitsplat, for one processing order."""
    ticks = delay
    if not attacker_first and ticks > 0:
        ticks -= 1                     # Hit.java:480 - target already processed

    if attacker_first:
        # The target has not gone yet, so its processHits() still runs this
        # tick and consumes one step of the countdown.
        landed, ticks = _finish(ticks)
        if landed:
            return 0

    tick = 0
    while tick < 200:
        tick += 1
        landed, ticks = _finish(ticks)
        if landed:
            return tick
    raise AssertionError("hit never landed")


def test_processing_order_does_not_change_the_landing_tick():
    """The off-PID player does NOT get a later hitsplat on this server.

    Whichever order the two fighters are processed in, exactly one step of the
    countdown is consumed on the launch tick:

      attacker first  - no decrement in defend(), but the target's own
                        processHits() still runs later that tick
      attacker second - defend() decrements, and the target has already run

    So both land on launch + delay. Real OSRS would put the off-PID hit a tick
    later; Kronos cancels it out on purpose. If this test ever fails, the
    simulator's single uniform delay is no longer safe and PID has to be
    modelled per fighter.
    """
    for delay in range(1, 21):
        first = _java_landing_tick(delay, attacker_first=True)
        second = _java_landing_tick(delay, attacker_first=False)
        assert first == second, (
            f"delay {delay}: attacker-first lands on tick {first} but "
            f"attacker-second lands on tick {second}")
        assert first == delay, (
            f"delay {delay}: landed on tick {first}, expected {delay}")


def test_the_simulator_uses_that_same_landing_tick():
    """Tie the two halves together: what the engine does equals what the
    server's arithmetic says, for both processing orders."""
    for style in (schema.STYLE_MELEE, schema.STYLE_RANGED, schema.STYLE_MAGIC):
        distance = 1 if style == schema.STYLE_MELEE else 5
        measured = _measure_launch_to_land(style, distance)
        assert measured is not None
        gap, delay = measured
        for attacker_first in (True, False):
            assert gap == _java_landing_tick(delay, attacker_first), (
                f"{STYLE_NAMES[style]}: simulator lands on tick {gap}, server "
                f"arithmetic (attacker_first={attacker_first}) says "
                f"{_java_landing_tick(delay, attacker_first)}")


def test_impact_is_visible_to_the_following_policy_decision():
    """Physical landing is L+D; HP and direct EV enter decision L+D+1."""
    original_roll_hit = combat.roll_hit

    def guaranteed_hit(
            rng, chance, min_dmg, max_dmg, damage_boost=0.0,
            ignore_defence=False, return_landed=False):
        damage = np.maximum(
            np.asarray(min_dmg, dtype=np.int32),
            np.asarray(max_dmg, dtype=np.int32))
        if return_landed:
            return damage, np.ones(damage.shape, dtype=bool)
        return damage

    combat.roll_hit = guaranteed_hit
    try:
        eng = engine.Engine(
            n_fights=1,
            policy=OneSidedAttacker(schema.STYLE_MAGIC),
            seed=70,
            epsilon=0.0,
            max_ticks=20,
            tick_ms=300,
            start_distance_min=4,
            start_distance_max=4)
        delay = int(combat.projectile_ticks(
            np.array([schema.STYLE_MAGIC]), np.array([4]), 300)[0])

        eng.step()  # launch L=0
        for _ in range(delay - 1):
            eng.step()
        assert eng.state.hp[0, 1] == 99

        eng.step()  # physical impact after decision L+D
        assert eng.state.hp[0, 1] < 99
        assert eng._pending.decision_tick[1] == delay
        assert eng._pending.inputs[1, schema.INPUT_SELF_HP] == 1.0

        direct = [
            event for event in eng._pending.reward_events
            if event.event_type == 1]
        assert len(direct) == 1
        assert direct[0].resolution_tick == delay + 1
        assert direct[0].contributors[0].source_tick == 0

        impact_row = eng.step()
        assert impact_row.decision_tick[1] == delay
        assert impact_row.next_inputs[1, schema.INPUT_SELF_HP] < 1.0
        assert (
            impact_row.next_inputs[0, schema.INPUT_REWARD_DELTA] > 0.0)
        assert (
            impact_row.next_inputs[1, schema.INPUT_REWARD_DELTA] < 0.0)
    finally:
        combat.roll_hit = original_roll_hit


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
    print("hit timing:", "OK" if failures == 0 else f"{failures} FAILED")
    raise SystemExit(1 if failures else 0)
