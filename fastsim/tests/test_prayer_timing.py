"""When a hit is decided, and when it is allowed to happen at all.

Two things the whole project rests on, both easy to get backwards and neither
of which would crash if you did:

  1. The damage number - prayer reduction included - is fixed when the attack
     is THROWN, not when it lands. Reacting to a visible projectile is
     mechanically useless, which is what forces the bot to predict.
  2. A fighter killed by damage arriving at the top of a tick loses that tick's
     attack. Getting this wrong hands out free swings and changes who wins
     close fights.

Both are driven through the real engine here rather than by calling the maths
directly.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import actions, combat, engine, policy, schema  # noqa: E402


class ScriptedPolicy:
    """Forces a fixed action in one channel and leaves the rest greedy."""

    def __init__(self, per_side_actions):
        # per_side_actions: list of dicts, one per side, {channel_name: action_id}
        self.per_side_actions = per_side_actions
        self.input_size = schema.INPUT_SIZE

    def score(self, inputs):
        n = inputs.shape[0]
        scores = np.zeros((n, schema.ACTION_COUNT), dtype=np.float32)
        for side, wanted in enumerate(self.per_side_actions):
            rows = np.arange(side, n, 2)
            for action_id in wanted.values():
                scores[rows, action_id] = 100.0
        return scores, np.zeros(n, dtype=np.float32)


class DelayedPrayerReactivePolicy:
    """Prays mage on side 0 and records when side 1 can observe it."""

    input_size = schema.INPUT_SIZE

    def __init__(self):
        self.side_one_saw_magic = []

    def score(self, inputs):
        n = inputs.shape[0]
        scores = np.full(
            (n, schema.ACTION_COUNT), -100.0, dtype=np.float32)
        for side in (0, 1):
            rows = np.arange(side, n, 2)
            for action_id in (NO_SPEC, STAY, NO_SUPPLY):
                scores[rows, action_id] = 100.0
            scores[
                rows, PRAY_MAGE if side == 0 else PRAY_MELEE] = 100.0
            if side == 0:
                scores[rows, NO_ATTACK] = 100.0
            else:
                saw_magic = (
                    inputs[rows, schema.INPUT_OPP_PROTECT_MAGIC] > 0.5)
                scores[rows[~saw_magic], NO_ATTACK] = 100.0
                scores[rows[saw_magic], RANGED_ATTACK] = 100.0
        self.side_one_saw_magic.append(
            inputs[1::2, schema.INPUT_OPP_PROTECT_MAGIC].copy())
        return scores, np.zeros(n, dtype=np.float32)


def _build(side0, side1, distance, max_ticks=40, tick_ms=300):
    eng = engine.Engine(n_fights=64, policy=ScriptedPolicy([side0, side1]),
                        seed=4, epsilon=0.0, max_ticks=max_ticks, tick_ms=tick_ms)
    # Line the fighters up at a fixed distance so the flight time is known.
    eng.state.x[:, 0] = 0
    eng.state.y[:, 0] = 0
    eng.state.x[:, 1] = distance
    eng.state.y[:, 1] = 0
    eng.state.prev_x = eng.state.x.copy()
    eng.state.prev_y = eng.state.y.copy()
    return eng


MAGE_ATTACK = (schema.COMBAT_BASE + schema.COMBAT_ATTACK_BASE
               + schema.STYLE_MAGIC * 2 + schema.ATTACK_INTENT_ATTACK)
RANGED_ATTACK = (schema.COMBAT_BASE + schema.COMBAT_ATTACK_BASE
                 + schema.STYLE_RANGED * 2 + schema.ATTACK_INTENT_ATTACK)
NO_SPEC = schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE
STAY = schema.MOVEMENT_BASE + schema.MOVE_NONE
NO_SUPPLY = schema.SUPPLY_BASE + schema.SUPPLY_NONE
PRAY_MAGE = schema.DEFENCE_BASE + schema.PRAY_PROTECT_MAGIC
PRAY_MELEE = schema.DEFENCE_BASE + schema.PRAY_PROTECT_MELEE
NO_ATTACK = schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK


def _run_and_measure(defender_prayer, distance=5, switch_after=None):
    """Side 0 barrages side 1. Returns total damage side 1 took."""
    attacker = {"combat": MAGE_ATTACK, "movement": STAY, "supply": NO_SUPPLY,
                "defence": PRAY_MELEE}
    defender = {"combat": NO_ATTACK, "movement": STAY, "supply": NO_SUPPLY,
                "defence": defender_prayer}

    eng = _build(attacker, defender, distance)
    for tick in range(30):
        if switch_after is not None and tick == switch_after:
            eng.policy.per_side_actions[1]["defence"] = PRAY_MAGE
        eng.step()
    return int(eng.state.damage_taken[:, 1].sum())


def test_prayer_is_locked_in_when_the_attack_is_thrown():
    """The damage number is decided at launch, not on arrival.

    Hit.defend() runs the target's postDefend listener, and
    PlayerCombat.postDefend is where `hit.damage *= 0.60` lives. Entity.hit
    calls defend() the instant the attack is made, so the prayer that counts is
    the one already up when the attacker commits.

    Practically: a defender who only reacts once the projectile is in the air
    has already lost that exchange. Which is the whole reason this project is
    about predicting the opponent's style rather than reacting to it.
    """
    flight = int(combat.projectile_ticks(
        np.array([schema.STYLE_MAGIC]), np.array([5]), 300)[0])
    assert flight > 1, "this test is meaningless if the hit lands instantly"

    never = _run_and_measure(PRAY_MELEE)
    always = _run_and_measure(PRAY_MAGE)

    assert never > 0, "the attacker never connected - test setup is broken"
    # Having the right overhead up from the start clearly helps.
    assert always < never * 0.8, (
        f"the correct prayer did not reduce damage: {always} vs {never}")

    # Switching one tick into the flight protects the hits thrown from then on,
    # but cannot retrospectively help the ones already in the air. So it lands
    # between the two, never better than praying correctly throughout.
    switched = _run_and_measure(PRAY_MELEE, switch_after=2)
    assert switched >= always * 0.9, (
        f"reacting mid-flight beat praying correctly all along "
        f"({switched} vs {always}) - prayer is being applied too late")


def test_prayer_switched_on_the_roll_tick_does_not_count():
    """PlayerCombat.nhStakerDefencePrayerSwitchTooFreshForHit: a switch made on
    the same tick the attack was rolled uses the PREVIOUS overhead."""
    eng = _build({"combat": NO_ATTACK, "movement": STAY, "supply": NO_SUPPLY,
                  "defence": PRAY_MELEE},
                 {"combat": NO_ATTACK, "movement": STAY, "supply": NO_SUPPLY,
                  "defence": PRAY_MELEE},
                 distance=1)
    eng.step()

    s = eng.state
    # Record a switch on the current tick: the OLD prayer is what counts.
    s.previous_overhead[:] = schema.PRAY_PROTECT_MAGIC
    s.overhead[:] = schema.PRAY_PROTECT_MELEE
    s.overhead_switch_tick[:] = s.tick[:, None]
    assert (eng._effective_overhead() == schema.PRAY_PROTECT_MAGIC).all()

    # A switch made on an earlier tick has taken effect by now.
    s.overhead_switch_tick[:] = s.tick[:, None] - 1
    assert (eng._effective_overhead() == schema.PRAY_PROTECT_MELEE).all()


def test_new_prayer_is_hidden_from_the_attacker_until_n_plus_one():
    policy = DelayedPrayerReactivePolicy()
    eng = engine.Engine(
        n_fights=4,
        policy=policy,
        seed=31,
        epsilon=0.0,
        max_ticks=10,
        start_distance_min=4,
        start_distance_max=4)

    eng.step()  # P(N) is selected and becomes visually active.
    assert not policy.side_one_saw_magic[0].any()
    assert (eng.state.overhead[:, 0] == schema.PRAY_PROTECT_MAGIC).all()
    assert (eng._pending.chosen["combat"][1::2] == NO_ATTACK).all()

    eng.step()  # The attacker first receives P(N) at decision N+1.
    assert policy.side_one_saw_magic[1].all()
    assert (eng._pending.chosen["combat"][1::2] == RANGED_ATTACK).all()


def test_opponent_overhead_and_style_share_the_one_tick_visibility_window():
    eng = engine.Engine(
        n_fights=1,
        policy=ScriptedPolicy([
            {"combat": NO_ATTACK, "defence": PRAY_MELEE},
            {"combat": NO_ATTACK, "defence": PRAY_MELEE},
        ]),
        seed=32,
        epsilon=0.0,
        max_ticks=10)
    eng.state.style[0, 0] = schema.STYLE_RANGED
    eng.state.overhead[0, 0] = schema.PRAY_PROTECT_MAGIC

    eng._settle_visible_state()
    assert eng.state.seen_opp_style[0, 1] == schema.STYLE_RANGED
    assert eng.state.seen_opp_overhead[0, 1] == schema.PRAY_PROTECT_MAGIC

    eng._settle_visible_state()
    assert eng.state.seen_opp_overhead[0, 1] == schema.PRAY_PROTECT_MAGIC


def test_distance_changes_how_long_the_hit_takes():
    """Standing further away buys the defender more time to react."""
    close = int(combat.projectile_ticks(
        np.array([schema.STYLE_MAGIC]), np.array([1]), 300)[0])
    far = int(combat.projectile_ticks(
        np.array([schema.STYLE_MAGIC]), np.array([10]), 300)[0])
    assert far > close


def test_a_fighter_killed_at_the_start_of_a_tick_cannot_swing():
    """Player.process() runs processHits() before combat, and canAttack returns
    false when isDead() - so damage arriving at the top of a tick takes that
    tick's attack away. Nobody gets a free swing from beyond the grave."""
    eng = _build({"combat": MAGE_ATTACK, "movement": STAY, "supply": NO_SUPPLY,
                  "defence": PRAY_MELEE},
                 {"combat": MAGE_ATTACK, "movement": STAY, "supply": NO_SUPPLY,
                  "defence": PRAY_MELEE},
                 distance=3)
    s = eng.state
    # Side 1 is about to die from a hit already in the air.
    s.hp[:, 1] = 1
    s.pending_damage[:, 1, 0] = 50
    s.attack_delay[:] = 0

    before = s.damage_taken[:, 0].copy()
    eng.step()

    assert (s.hp[:, 1] == 0).all(), "side 1 should be dead"
    # A dead fighter queues nothing, so side 0 takes no new damage from them.
    assert (s.pending_damage[:, 0, :].sum(axis=1) == 0).all(), (
        "a dead fighter still launched an attack")
    assert (s.damage_taken[:, 0] == before).all()


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
    print("prayer timing:", "OK" if failures == 0 else f"{failures} FAILED")
    raise SystemExit(1 if failures else 0)
