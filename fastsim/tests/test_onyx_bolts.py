"""Onyx dragon bolts (e), and the distance at which a freeze breaks.

The bolts are worn by this loadout and the server implements them, so leaving
them out made ranged strictly weaker and less self-sustaining than it really is.
OnyxBoltEffect.java:

    int procPercent = target.player != null ? 10 : 11;
    boolean proc = Random.rollPercent(procPercent);
    if(!proc) return false;
    int damage = target.hit(hit.boostDamage(0.20));
    int heal = (int) (damage * 0.25);
    if(heal > 0) hit.attacker.incrementHp(heal);

Everything below is driven through the real engine, because the interesting
parts are all about *when* things happen, not about the arithmetic.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import combat, engine, schema  # noqa: E402
from fastsim.state import MAX_HP  # noqa: E402


class StyleAttacker:
    """Side 0 attacks with `style`; side 1 stands still."""

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
        rows = np.arange(0, n, 2)
        s[rows, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 0.0
        s[rows, attack] = 200.0
        return s, np.zeros(n, dtype=np.float32)


def _fight(style, n_fights=1024, distance=4, seed=11, hurt_attacker_to=None):
    eng = engine.Engine(n_fights=n_fights, policy=StyleAttacker(style), seed=seed,
                        epsilon=0.0, max_ticks=400)
    s = eng.state
    # Health has to stay inside the real 0..MAX_HP range or the healing clamp
    # is being exercised outside its domain and the test proves nothing.
    s.hp[:] = MAX_HP
    if hurt_attacker_to is not None:
        s.hp[:, 0] = hurt_attacker_to
    s.x[:, 0], s.y[:, 0] = 0, 0
    s.x[:, 1], s.y[:, 1] = distance, 0
    s.prev_x, s.prev_y = s.x.copy(), s.y.copy()
    s.style[:, 0] = style
    s.weapon_id[:, 0] = eng.gear_tables["weapon_id"][style]
    return eng


def test_the_attacker_heals_when_a_bolt_procs():
    """Ranged should now gain health back. Melee, which has no bolt, must not."""
    ranged = _fight(schema.STYLE_RANGED, hurt_attacker_to=40)
    start = ranged.state.hp[:, 0].copy()
    for _ in range(60):
        ranged.step()
    healed = (ranged.state.hp[:, 0] > start).sum()
    assert healed > 0, "no ranged attacker ever healed - the bolt effect is dead"

    melee = _fight(schema.STYLE_MELEE, distance=1, hurt_attacker_to=40)
    start = melee.state.hp[:, 0].copy()
    for _ in range(60):
        melee.step()
    assert (melee.state.hp[:, 0] <= start).all(), (
        "a melee attacker healed - the bolt effect is firing for the wrong style")


def test_the_proc_rate_is_about_one_in_ten():
    """One in ten ATTACKS, not one in ten ticks.

    Worth being careful about: the crossbow fires every 5 ticks, so a correct
    10%-per-attack rate shows up as 2% per tick. Measuring per tick and calling
    it wrong - or worse, "fixing" the rate to make a per-tick measurement read
    10% - would make the bolts five times too strong.
    """
    eng = _fight(schema.STYLE_RANGED, n_fights=8000)
    attacks = 0
    procs = 0

    real_resolve = eng._resolve_attacks
    real_roll = combat.roll_hit
    pending = {}

    def resolve_spy(attacking, speccing, spec_kind, roll_context=None):
        pending["attacking"] = attacking.copy()
        return real_resolve(
            attacking, speccing, spec_kind, roll_context=roll_context)

    def roll_spy(rng, chance, min_dmg, max_dmg, damage_boost=0.0,
                 ignore_defence=False, return_landed=False):
        nonlocal attacks, procs
        boost = np.asarray(damage_boost)
        if boost.ndim and "attacking" in pending:
            swung = pending.pop("attacking")
            attacks += int(swung.sum())
            procs += int(((boost > 0) & swung).sum())
        return real_roll(
            rng,
            chance,
            min_dmg,
            max_dmg,
            damage_boost=damage_boost,
            ignore_defence=ignore_defence,
            return_landed=return_landed)

    eng._resolve_attacks = resolve_spy
    combat.roll_hit = roll_spy
    try:
        for _ in range(20):
            eng.step()
    finally:
        combat.roll_hit = real_roll

    assert attacks > 25000, f"only {attacks} attacks - too few to judge a rate"
    rate = procs / attacks
    assert 0.09 < rate < 0.11, (
        f"proc rate {rate:.4f} over {attacks} attacks, expected about 0.10")


def test_healing_stops_at_full_health():
    """Entity.incrementHp clamps to max, so a proc at full health is wasted."""
    eng = _fight(schema.STYLE_RANGED, n_fights=512)
    eng.state.hp[:] = MAX_HP
    for _ in range(40):
        eng.step()
    assert (eng.state.hp[:, 0] <= MAX_HP).all(), "healed past the cap"


def test_a_blocked_bolt_heals_nothing():
    """The heal is a share of damage actually dealt, so zero damage means zero
    healing. Forced by making every hit miss."""
    eng = _fight(schema.STYLE_RANGED, n_fights=512, hurt_attacker_to=40)
    eng._hit_chance = lambda *a, **k: np.zeros((eng.n_fights, 2))
    start = eng.state.hp[:, 0].copy()
    for _ in range(40):
        eng.step()
    assert (eng.state.hp[:, 0] == start).all(), (
        "an attacker healed from bolts that never connected")


def test_a_freeze_breaks_once_the_freezer_is_far_enough_away():
    """Entity.isMovementBlocked resets the freeze when the freezer is more than
    12 tiles off - not 10, and not on the attack-range boundary."""
    eng = _fight(schema.STYLE_MAGIC, n_fights=16)
    s = eng.state
    s.freeze_ticks[:] = 20

    # Well inside the threshold: the freeze survives.
    s.x[:, 1] = 11
    eng._apply_movement(np.zeros(eng.n_fights * 2, dtype=np.int32)
                        + schema.MOVE_NONE)
    assert (s.freeze_ticks > 0).all(), "freeze broke at 11 tiles, too early"

    # Past it: gone.
    s.freeze_ticks[:] = 20
    s.x[:, 1] = 13
    eng._apply_movement(np.zeros(eng.n_fights * 2, dtype=np.int32)
                        + schema.MOVE_NONE)
    assert (s.freeze_ticks == 0).all(), "freeze survived past 12 tiles"


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
    print("onyx bolts:", "OK" if failures == 0 else f"{failures} FAILED")
    raise SystemExit(1 if failures else 0)
