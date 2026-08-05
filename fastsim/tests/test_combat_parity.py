"""Check the combat maths against values worked out by hand from the Java.

These are not regression snapshots of our own output - that would only prove we
are consistently wrong. Each expected number is derived from the formula as it
appears in CombatUtils.java, computed independently, and written down here with
the working shown.

If one of these fails, the simulator and the server have diverged, and any data
generated in between is suspect.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import combat, engine, gear, schema  # noqa: E402


def test_hit_chance_matches_osrs_formula():
    # CombatUtils.hitChance, both branches.
    # attack > defence:  1 - (def + 2) / (2 * (atk + 1))
    atk, dfc = 20000.0, 15000.0
    expected = 1.0 - (dfc + 2.0) / (2.0 * (atk + 1.0))
    assert math.isclose(float(combat.hit_chance(np.array([atk]), np.array([dfc]))[0]),
                        expected, rel_tol=1e-12)

    # attack <= defence: atk / (2 * (def + 1))
    atk, dfc = 10000.0, 15000.0
    expected = atk / (2.0 * (dfc + 1.0))
    assert math.isclose(float(combat.hit_chance(np.array([atk]), np.array([dfc]))[0]),
                        expected, rel_tol=1e-12)


def test_effective_strength_ceils_before_style_bonus():
    # getEffectiveStrength: Math.ceil(level * prayerBonus) + styleBonus + adder
    # 99 strength, Piety (+0.23), aggressive (+3):
    #   ceil(99 * 1.23) = ceil(121.77) = 122, + 3 = 125
    result = combat.effective_strength(
        np.array([99.0]), np.array([schema.STYLE_MELEE]),
        np.array([0.0]), np.array([combat.PIETY_STRENGTH]),
        np.array([combat.AGGRESSIVE]))
    assert float(result[0]) == 125.0


def test_max_damage_truncates():
    # getMaxDamage: (int)(1.3 + eff/10 + bonus/80 + eff*bonus/640)
    eff, bonus = 125.0, 163.0
    expected = int(1.3 + eff / 10.0 + bonus / 80.0 + (eff * bonus) / 640.0)
    assert int(combat.max_damage(np.array([eff]), np.array([bonus]))[0]) == expected


def test_magic_defence_is_thirty_seventy():
    # getDefenceBonus against magic:
    #   effDef * 0.30 + effMagic * 0.70, then * (bonus + 64)
    defence_level = np.array([99.0])
    magic_level = np.array([99.0])
    defence_boost = np.array([combat.AUGURY_DEFENCE])
    magic_boost = np.array([combat.AUGURY_MAGIC])
    attack_type = np.array([combat.ACCURATE])
    bonus = np.array([105.0])

    eff_def = combat.effective_defence(defence_level, defence_boost, attack_type)
    eff_magic = magic_level * (1.0 + magic_boost)
    expected = (eff_def * 0.30 + eff_magic * 0.70) * (bonus + 64.0)

    actual = combat.defence_roll(defence_level, magic_level, defence_boost,
                                 magic_boost, attack_type, bonus,
                                 attacked_by_magic=np.array([True]))
    assert math.isclose(float(actual[0]), float(expected[0]), rel_tol=1e-12)


def test_live_engine_applies_worn_magic_interference():
    class Scores:
        input_size = schema.INPUT_SIZE

        def score(self, inputs):
            return (
                np.zeros((len(inputs), schema.ACTION_COUNT), dtype=np.float32),
                np.zeros(len(inputs), dtype=np.float32),
            )

    eng = engine.Engine(1, Scores(), seed=4, epsilon=0.0)
    s = eng.state
    s.style[:] = schema.STYLE_MAGIC
    s.equipped_ids[:, :, gear.SLOT_CHEST] = gear.MASORI_BODY_F.item_id
    s.equipped_ids[:, :, gear.SLOT_LEGS] = gear.TORVA_PLATELEGS.item_id

    attack_roll, _, _ = eng._base_rolls(
        np.full((1, 2), schema.STYLE_MAGIC, dtype=np.int32))
    bonuses = gear.equipment_bonuses(
        s.equipped_ids, eng.gear_tables["item_bonus_lookup"])
    effective = combat.effective_attack(
        s.magic_level,
        np.full((1, 2), schema.STYLE_MAGIC),
        np.full((1, 2), combat.AUGURY_MAGIC),
        np.zeros((1, 2)),
        np.zeros((1, 2)),
        np.full((1, 2), 0.90),
        np.full((1, 2), combat.ACCURATE),
    )
    expected = effective * (bonuses[..., schema.MAGIC_ATTACK] + 64.0)
    assert np.allclose(attack_roll, expected)


def test_accurate_zero_damage_hit_remains_successful_for_freeze():
    damage, landed = combat.roll_hit(
        np.random.default_rng(2),
        np.ones(16),
        np.zeros(16, dtype=np.int32),
        np.zeros(16, dtype=np.int32),
        return_landed=True)
    assert np.all(damage == 0)
    assert np.all(landed)


def test_confliction_block_arms_and_next_cast_consumes_accuracy_boost():
    class Scores:
        input_size = schema.INPUT_SIZE

        def score(self, inputs):
            return (
                np.zeros((len(inputs), schema.ACTION_COUNT), dtype=np.float32),
                np.zeros(len(inputs), dtype=np.float32),
            )

    eng = engine.Engine(1, Scores(), seed=5, epsilon=0.0)
    eng.state.style[:] = schema.STYLE_MAGIC
    attacking = np.ones((1, 2), dtype=bool)
    no_specs = np.zeros((1, 2), dtype=bool)
    spec_kind = np.full((1, 2), -1, dtype=np.int32)
    boosts = []

    def blocked_then_accurate(_base, _style, **kwargs):
        boosts.append(np.asarray(kwargs.get("attack_boost")).copy())
        return np.zeros((1, 2)) if len(boosts) == 1 else np.ones((1, 2))

    eng._hit_chance = blocked_then_accurate
    eng._resolve_attacks(attacking, no_specs, spec_kind)
    assert np.all(eng.state.confliction_magic_accuracy_until_tick == 4)
    assert np.all(boosts[0] == combat.ZURIELS_STAFF_ATTACK_BOOST)

    eng.world_tick = 4
    eng._resolve_attacks(attacking, no_specs, spec_kind)
    assert np.all(
        boosts[1] == 1.0 + combat.ZURIELS_STAFF_ATTACK_BOOST)
    assert np.all(eng.state.confliction_magic_accuracy_until_tick == -1)


def test_confliction_and_zuriel_accuracy_boosts_add_before_multiplier():
    class Scores:
        input_size = schema.INPUT_SIZE

        def score(self, inputs):
            return (
                np.zeros((len(inputs), schema.ACTION_COUNT), dtype=np.float32),
                np.zeros(len(inputs), dtype=np.float32),
            )

    eng = engine.Engine(1, Scores(), seed=6, epsilon=0.0)
    s = eng.state
    attacker_style = np.full((1, 2), schema.STYLE_MAGIC, dtype=np.int32)
    s.style[:] = attacker_style
    s.confliction_magic_accuracy_until_tick[:] = 0
    attacking = np.ones((1, 2), dtype=bool)
    no_specs = np.zeros((1, 2), dtype=bool)
    spec_kind = np.full((1, 2), -1, dtype=np.int32)

    captured = []
    real_roll_hit = combat.roll_hit

    def capture_roll(_rng, chance, min_hit, max_hit, **_kwargs):
        captured.append(np.asarray(chance).copy())
        return (
            np.zeros_like(max_hit, dtype=np.int32),
            np.ones_like(max_hit, dtype=bool),
        )

    combat.roll_hit = capture_roll
    try:
        eng._resolve_attacks(attacking, no_specs, spec_kind)
    finally:
        combat.roll_hit = real_roll_hit

    bonuses = gear.equipment_bonuses(
        s.equipped_ids, eng.gear_tables["item_bonus_lookup"])
    attack_type = eng._attack_types(attacker_style, s.weapon_id)
    effective_attack = combat.effective_attack(
        s.magic_level,
        attacker_style,
        combat.MAGIC_BOOST_BY_STYLE[attacker_style],
        combat.RANGED_ATTACK_BOOST_BY_STYLE[attacker_style],
        combat.MELEE_ATTACK_BOOST_BY_STYLE[attacker_style],
        magic_interference=gear.magic_interference(
            s.equipped_ids, eng.gear_tables["item_bonus_lookup"]),
        attack_type=attack_type,
    )
    unboosted_attack_roll = combat.attack_roll(
        effective_attack, bonuses[..., schema.MAGIC_ATTACK])

    defender_style = np.maximum(s.flip(s.style), 0)
    defender_attack_type = eng._attack_types(
        defender_style, s.flip(s.weapon_id))
    defence_component = combat.defence_component(
        s.flip(s.defence_level),
        s.flip(s.magic_level),
        combat.DEFENCE_BOOST_BY_STYLE[defender_style],
        combat.MAGIC_BOOST_BY_STYLE[defender_style],
        defender_attack_type,
        attacked_by_magic=np.ones((1, 2), dtype=bool),
    )
    defence_roll = (
        defence_component
        * (s.flip(bonuses)[..., schema.MAGIC_DEFENCE] + 64.0))
    expected = combat.hit_chance(
        unboosted_attack_roll
        * (1.0 + 1.0 + combat.ZURIELS_STAFF_ATTACK_BOOST),
        defence_roll,
    )
    assert len(captured) == 1
    assert np.allclose(captured[0], expected)


def test_magic_max_damage_uses_barrage_base():
    # TargetSpell.cast: maxDamage *= (1 + magicDamage * 0.01)
    # Ice Barrage base 30, mage set magic damage bonus from the gear table.
    bonuses = gear.build_set_bonus_table()
    magic_damage = bonuses[schema.STYLE_MAGIC][schema.MAGIC_DAMAGE]
    expected = int(30 * (1.0 + magic_damage * 0.01))
    actual = int(combat.magic_max_damage(
        np.array([combat.BARRAGE_MAX_DAMAGE]), np.array([magic_damage]))[0])
    assert actual == expected


def test_protected_prayer_multiplier_is_sixty_percent():
    # CombatUtils.expectedDamage: prayerMultiplier = protected ? 0.60 : 1.0
    unprotected = combat.expected_damage(np.array([1.0]), np.array([40]),
                                         np.array([False]))
    protected = combat.expected_damage(np.array([1.0]), np.array([40]),
                                       np.array([True]))
    assert math.isclose(float(protected[0]) / float(unprotected[0]), 0.6, rel_tol=1e-12)


def test_attack_ranges_follow_player_combat():
    # PlayerCombat.java:495 - spell casts reach 10, everything else is the
    # weapon's own range capped at 10.
    table = gear.build_set_weapon_table()
    assert int(table["max_distance"][schema.STYLE_MAGIC]) == 10
    assert int(table["max_distance"][schema.STYLE_RANGED]) == 8   # Zaryte crossbow
    assert int(table["max_distance"][schema.STYLE_MELEE]) == 2    # Noxious halberd


def test_rapid_shaves_one_tick():
    # PlayerCombat.java:858 - RAPID_RANGED fires at attackTicks - 1.
    table = gear.build_set_weapon_table()
    base = int(table["attack_ticks"][schema.STYLE_RANGED])
    assert combat.ATTACK_TYPE_BY_STYLE[schema.STYLE_RANGED] == combat.RAPID_RANGED
    assert base - 1 == 5  # Zaryte crossbow: 6 base, 5 on rapid


def test_projectile_ticks_match_the_java_formula():
    # Projectile.send:  duration = start + increment * max(0, distance - 1)
    #                   returns delay + duration
    # Hit.clientDelay:  ticks = max(1, (delay * cycleRate) / tickMs)   [int div]
    for tick_ms in (600,):
        for distance in (1, 2, 3, 5, 8, 10):
            travel = max(0, distance - 1)

            raw = (combat.MAGIC_PROJECTILE_DELAY
                   + combat.MAGIC_PROJECTILE_DURATION_START
                   + combat.MAGIC_PROJECTILE_DURATION_INCREMENT * travel)
            expected = max(1, (raw * combat.MAGIC_CYCLE_RATE) // tick_ms)
            actual = combat.projectile_ticks(
                np.array([schema.STYLE_MAGIC]), np.array([distance]), tick_ms)
            assert int(actual[0]) == expected, (tick_ms, distance, actual, expected)

            raw = (combat.RANGED_PROJECTILE_DELAY
                   + combat.RANGED_PROJECTILE_DURATION_START
                   + combat.RANGED_PROJECTILE_DURATION_INCREMENT * travel)
            expected = max(1, (raw * combat.RANGED_CYCLE_RATE) // tick_ms)
            actual = combat.projectile_ticks(
                np.array([schema.STYLE_RANGED]), np.array([distance]), tick_ms)
            assert int(actual[0]) == expected


def test_the_gameplay_tick_is_always_six_hundred():
    """The training profile does NOT change projectile flight in ticks.

    Server.java has two tick lengths and only one of them is game logic:

        tickMs()          -> worker period, 300ms in training. Used ONLY for
                             display strings (uptime, playtime, bestiary).
        gameplayTickMs()  -> `return (int) DEFAULT_TICK_MS;` - hardcoded 600,
                             in both profiles. Hit.clientDelayTicks uses this.

    So the training profile runs the same logical ticks faster in real time; it
    does not change what a tick contains. This rig used to divide by 300 and so
    doubled every projectile flight time in the game - the single biggest
    fidelity error it has had. This test is the guard against that returning.
    """
    assert combat.GAMEPLAY_TICK_MS == 600

    at = lambda style, d: int(combat.projectile_ticks(
        np.array([style]), np.array([d]))[0])

    # Independent anchors: what OSRS actually does at 600ms.
    assert at(schema.STYLE_MAGIC, 1) == 3
    assert at(schema.STYLE_RANGED, 1) == 2
    assert at(schema.STYLE_MELEE, 1) == 1

    # The acceptance criterion called out explicitly in the parity work order.
    assert at(schema.STYLE_MAGIC, 10) == 6, (
        "Ice Barrage at distance 10 must be 6 delay ticks")


def test_projectile_table_over_every_distance_one_to_thirteen():
    """Full table, not spot checks - a divisor error is uniform, so one
    distance passing proves nothing about the rest."""
    for distance in range(1, 14):
        travel = max(0, distance - 1)

        raw = (combat.MAGIC_PROJECTILE_DELAY
               + combat.MAGIC_PROJECTILE_DURATION_START
               + combat.MAGIC_PROJECTILE_DURATION_INCREMENT * travel)
        expected = max(1, (raw * combat.MAGIC_CYCLE_RATE) // 600)
        actual = int(combat.projectile_ticks(
            np.array([schema.STYLE_MAGIC]), np.array([distance]))[0])
        assert actual == expected, ("magic", distance, actual, expected)

        raw = (combat.RANGED_PROJECTILE_DELAY
               + combat.RANGED_PROJECTILE_DURATION_START
               + combat.RANGED_PROJECTILE_DURATION_INCREMENT * travel)
        expected = max(1, (raw * combat.RANGED_CYCLE_RATE) // 600)
        actual = int(combat.projectile_ticks(
            np.array([schema.STYLE_RANGED]), np.array([distance]))[0])
        assert actual == expected, ("ranged", distance, actual, expected)


def test_zuriels_staff_casts_every_four_ticks():
    """PlayerCombat.targetSpellAttackTicks:

        return ancientSpellbook && castingWeaponId == ZURIELS_STAFF_DMM ? 4 : 5;

    The loadout is Zuriel's staff autocasting Ice Barrage off ancients, so the
    cast speed is 4 - NOT the 5 that the staff's weapon_types.json entry gives.
    Taking the generic value makes the bot's main attack 25% slower than the
    server's.
    """
    from fastsim import gear
    speeds = gear.build_set_weapon_table()["attack_ticks"]
    assert int(speeds[schema.STYLE_MAGIC]) == 4


def test_pending_buffer_is_big_enough():
    from fastsim import state as state_module
    assert combat.max_projectile_ticks() < state_module.PENDING_SLOTS


def test_special_attack_specs_match_the_java():
    s = combat.SPEC_SPECS

    # ArmadylGodsword: boostDamage(0.375), boostAttack(1.0)
    ags = s[schema.SPEC_ARMADYL_GODSWORD]
    assert ags["damage_boost"] == 0.375
    assert ags["attack_boost"] == 1.0

    # Voidwaker: randDamage(max*0.50, max*1.50).ignoreDefence(), thrown as MAGIC
    vw = s[schema.SPEC_VOIDWAKER]
    assert (vw["min_fraction"], vw["max_fraction"]) == (0.50, 1.50)
    assert vw["ignore_defence"] is True
    assert vw["hit_style"] == schema.STYLE_MAGIC

    # VestasLongsword: randDamage(max*0.20, max*1.20),
    #                  rollAgainstDefenceStyle(STAB), boostDefence(-0.75)
    vls = s[schema.SPEC_VESTA_LONGSWORD]
    assert (vls["min_fraction"], vls["max_fraction"]) == (0.20, 1.20)
    assert vls["defence_boost"] == -0.75
    assert vls["defence_style"] == schema.STAB_DEFENCE

    # GraniteMaul: a plain extra hit, no modifiers at all. The double is two.
    gm = s[schema.SPEC_GRANITE_MAUL]
    assert (gm["damage_boost"], gm["attack_boost"], gm["defence_boost"]) == (0.0, 0.0, 0.0)
    assert gm["extra_hits"] == 1
    assert s[schema.SPEC_GRANITE_MAUL_DOUBLE]["extra_hits"] == 2

    # Energy costs are getDrainAmount() * 10.
    assert list(schema.SPEC_ENERGY_COST) == [500, 1000, 500, 500, 250]


def test_voidwaker_always_lands():
    # ignoreDefence means the accuracy roll is skipped entirely.
    rng = np.random.default_rng(0)
    zero_chance = np.zeros(500)
    damage = combat.roll_hit(rng, zero_chance, np.full(500, 10), np.full(500, 30),
                             ignore_defence=True)
    assert (damage > 0).all()
    assert damage.min() >= 10 and damage.max() <= 30


def test_damage_boost_applies_before_the_roll():
    # Hit.defend line 483: maxDamage *= (1 + damageBoost), then roll.
    rng = np.random.default_rng(0)
    rolled = combat.roll_damage_range(rng, np.zeros(2000, dtype=np.int64),
                                      np.full(2000, 40), damage_boost=0.375)
    assert rolled.max() == 55  # int(40 * 1.375)
    assert rolled.min() == 0


def test_gear_bonuses_come_from_item_info():
    # Spot-check the values that were previously hand-entered and wrong.
    assert gear.BARROWS_GLOVES.bonuses[schema.STAB_ATTACK] == 12
    assert gear.IMBUED_SARADOMIN_CAPE.bonuses[schema.MAGIC_DAMAGE] == 2
    assert gear.IMBUED_SARADOMIN_CAPE.bonuses[schema.MAGIC_DEFENCE] == 15
    assert gear.SEERS_RING_I.bonuses[schema.MAGIC_ATTACK] == 12
    assert gear.DRAGONFIRE_SHIELD.bonuses[schema.SLASH_DEFENCE] == 75


def test_action_layout_sums_to_the_action_count():
    total = (schema.COMBAT_COUNT + schema.DEFENCE_COUNT + schema.MOVEMENT_COUNT
             + schema.SUPPLY_COUNT + schema.GEAR_COUNT)
    assert total == schema.ACTION_COUNT
    assert schema.MOVEMENT_OFFSETS.shape[0] == schema.MOVEMENT_COUNT


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
    print("combat parity:", "OK" if failures == 0 else f"{failures} FAILED")
    raise SystemExit(1 if failures else 0)
