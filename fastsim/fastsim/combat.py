"""The combat maths, rewritten to work on whole batches of fights at once.

Every formula here is a line-for-line translation of
src/main/java/io/ruin/model/combat/CombatUtils.java. The only change is shape:
where Java computes one number for one fighter, these functions compute one
number per fight for thousands of fights, held in numpy arrays.

If CombatUtils.java ever changes, this file must change with it, and
tests/test_combat_parity.py must be re-run against fresh Java values.
"""

from __future__ import annotations

import numpy as np

from . import schema

# --- Attack types (io.ruin.model.combat.AttackType) -------------------------
# Only the ones the NH loadout actually uses are modelled.
ACCURATE = 0
AGGRESSIVE = 1
CONTROLLED = 2
DEFENSIVE = 3
RAPID_RANGED = 4
LONG_RANGED = 5

# --- Prayer boosts (io.ruin.model.entity.player.Prayer) ---------------------
# The bot turns on the offensive prayer that matches its offence style:
# RIGOUR for ranged, PIETY for melee, AUGURY for magic
# (NhStakerSelfPlayManager, ~line 4834).
PIETY_ATTACK = 0.20
PIETY_STRENGTH = 0.23
PIETY_DEFENCE = 0.25
RIGOUR_RANGED_ATTACK = 0.20
RIGOUR_RANGED_STRENGTH = 0.23
RIGOUR_DEFENCE = 0.25
AUGURY_MAGIC = 0.25
AUGURY_DEFENCE = 0.25

# Per style [MAGIC, RANGED, MELEE], the boost that style's prayer gives.
MAGIC_BOOST_BY_STYLE = np.array([AUGURY_MAGIC, 0.0, 0.0])
RANGED_ATTACK_BOOST_BY_STYLE = np.array([0.0, RIGOUR_RANGED_ATTACK, 0.0])
RANGED_STRENGTH_BOOST_BY_STYLE = np.array([0.0, RIGOUR_RANGED_STRENGTH, 0.0])
MELEE_ATTACK_BOOST_BY_STYLE = np.array([0.0, 0.0, PIETY_ATTACK])
MELEE_STRENGTH_BOOST_BY_STYLE = np.array([0.0, 0.0, PIETY_STRENGTH])
DEFENCE_BOOST_BY_STYLE = np.array([AUGURY_DEFENCE, RIGOUR_DEFENCE, PIETY_DEFENCE])

# The attack type each set fights with.
# Magic: autocast barrage (ACCURATE). Ranged: crossbow on rapid.
# Melee's live attack type is weapon-specific and resolved by Engine because
# direct switches leave VLS accurate while the halberd starts controlled.
ATTACK_TYPE_BY_STYLE = np.array([ACCURATE, RAPID_RANGED, AGGRESSIVE], dtype=np.int8)

# IceBarrage.afterHit passes 20 SECONDS to Entity.freeze. TickDelay converts
# that with Server.toTicks(20), whose canonical 600ms divisor yields 33 ticks.
BARRAGE_MAX_DAMAGE = 30
BARRAGE_FREEZE_TICKS = 33  # (20 * 1000) // Server.gameplayTickMs()
ZURIELS_STAFF_ATTACK_BOOST = 0.10  # IceBarrage.beforeHit


# ---------------------------------------------------------------------------
# How long a hit takes to arrive.
#
# This is not a constant. It depends on how far apart the two players are, and
# it is one of the things that decides whether a prayer switch lands in time.
#
# Projectile.send:
#     distance = max(|dx|, |dy|)                        (Misc.getDistance)
#     duration = durationStart + durationIncrement * max(0, distance - 1)
#     returns    delay + duration
#
# Hit.clientDelay(delay, cycleRate):
#     ticks = max(1, (delay * cycleRate) / Server.gameplayTickMs())
#                                                       (integer division)
#
# READ THIS BEFORE TOUCHING THE TICK LENGTH. Server.java has two of them and
# they are not interchangeable:
#
#   Server.tickMs()          = worker.getPeriod() - the real-time gap between
#                              ticks. 300ms under the training profile, 600 live.
#                              Every single use of it in the server is display
#                              text: uptime, playtime, bestiary strings.
#
#   Server.gameplayTickMs()  = hardcoded `return (int) DEFAULT_TICK_MS;` = 600.
#                              ALWAYS 600, in both profiles. This is the one all
#                              game logic uses, including clientDelayTicks.
#
# So the training profile makes the same logical ticks happen twice as fast in
# wall-clock time. It does not change what happens in a tick. Projectile flight
# is 6 ticks for a barrage at distance 10 in training exactly as it is live.
#
# This file previously divided by 300 and so doubled every projectile flight
# time in the game. If you are tempted to reintroduce a training tick length,
# check which of the two Java methods you are actually mirroring.
# ---------------------------------------------------------------------------

# The logical tick. Not a tuning knob - Server.gameplayTickMs() is a constant.
GAMEPLAY_TICK_MS = 600

# Ice Barrage: Projectile(368, 43, 0, delay=51, start=56, increment=10, 16, 64)
# and TargetSpell casts with clientDelay(duration, 19).
MAGIC_PROJECTILE_DELAY = 51
MAGIC_PROJECTILE_DURATION_START = 56
MAGIC_PROJECTILE_DURATION_INCREMENT = 10
MAGIC_CYCLE_RATE = 19

# Dragon bolts: Projectile(1468, 38, 36, delay=41, start=51, increment=5, 5, 11)
# and PlayerCombat fires ranged with the default clientDelay cycle rate of 16.
RANGED_PROJECTILE_DELAY = 41
RANGED_PROJECTILE_DURATION_START = 51
RANGED_PROJECTILE_DURATION_INCREMENT = 5
RANGED_CYCLE_RATE = 16

# Melee makes no Hit.clientDelay call, so it keeps Hit's default of 1 tick.
MELEE_HIT_TICKS = 1

# Onyx dragon bolts (e) - OnyxBoltEffect.java, and this loadout wears them.
#
#     int procPercent = target.player != null ? 10 : 11;   // 10 vs players
#     boolean proc = Random.rollPercent(procPercent);      // get() <= 0.10
#     if(!proc) return false;
#     int damage = target.hit(hit.boostDamage(0.20));
#     int heal = (int) (damage * 0.25);
#     if(heal > 0) hit.attacker.incrementHp(heal);
#
# Two things about how this is wired, from the call site in PlayerCombat:
#
#     if(rangedAmmo.effect != null && rangedAmmo.effect.apply(target, hit))
#         return;
#     target.hit(hit);
#
# The effect throws the hit itself when it procs and the caller then returns,
# so it REPLACES the normal hit rather than adding a second one - one hit
# either way, just a boosted one on a proc. And the heal is taken from the
# damage the hit actually deals, so it is zero on a blocked hit and it is
# measured after the protect-prayer reduction. incrementHp caps at max HP.
ONYX_BOLT_PROC_CHANCE = 0.10
ONYX_BOLT_DAMAGE_BOOST = 0.20
ONYX_BOLT_HEAL_FRACTION = 0.25

# Entity.isMovementBlocked: a freeze is dropped the moment the frozen player
# tries to move and the one who froze them is more than 12 tiles away.
FREEZE_BREAK_DISTANCE = 12


def projectile_ticks(style, distance, tick_ms: int = GAMEPLAY_TICK_MS):
    """Ticks between an attack being fired and it landing, per fight.

    Integer division throughout, matching the Java exactly - rounding this the
    "nice" way would shift hit timings by a whole tick at some distances.
    """
    distance = np.maximum(0, np.asarray(distance, dtype=np.int64))
    travel = np.maximum(0, distance - 1)

    magic_raw = (MAGIC_PROJECTILE_DELAY + MAGIC_PROJECTILE_DURATION_START
                 + MAGIC_PROJECTILE_DURATION_INCREMENT * travel)
    magic_ticks = np.maximum(1, (magic_raw * MAGIC_CYCLE_RATE) // tick_ms)

    ranged_raw = (RANGED_PROJECTILE_DELAY + RANGED_PROJECTILE_DURATION_START
                  + RANGED_PROJECTILE_DURATION_INCREMENT * travel)
    ranged_ticks = np.maximum(1, (ranged_raw * RANGED_CYCLE_RATE) // tick_ms)

    result = np.full(np.shape(style), MELEE_HIT_TICKS, dtype=np.int64)
    result = np.where(style == schema.STYLE_MAGIC, magic_ticks, result)
    result = np.where(style == schema.STYLE_RANGED, ranged_ticks, result)
    return result


def max_projectile_ticks(tick_ms: int = GAMEPLAY_TICK_MS, max_distance: int = 10) -> int:
    """Longest possible hit delay, so the pending-damage buffer can be sized."""
    styles = np.array([schema.STYLE_MAGIC, schema.STYLE_RANGED, schema.STYLE_MELEE])
    distances = np.arange(0, max_distance + 1)
    grid = projectile_ticks(styles[:, None], distances[None, :], tick_ms)
    return int(grid.max())


# ---------------------------------------------------------------------------
# Special attacks, from model/combat/special/melee/.
#
# Each one is a real, distinct thing, and the differences are the whole reason
# a player picks one over another:
#
#   granite maul      an extra ordinary hit, right now, no bonuses at all -
#                     which is exactly why it is the knockout tool
#   armadyl godsword  +37.5% damage and DOUBLE accuracy
#   voidwaker         ignores defence entirely, so it always lands, for
#                     50%-150% of max - and it is thrown as a MAGIC hit, so
#                     protect-from-magic reduces it, not protect-from-melee
#   vesta's longsword 20%-120% of max, rolled against STAB defence with the
#                     defender's defence cut by 75%
#
# `attack_boost` multiplies the attack roll, `defence_boost` the defence roll
# (Hit.calculateNhStakerHitChance), and `damage_boost` scales max damage before
# the roll (Hit line 483). min/max fractions are of the normal melee max hit.
# ---------------------------------------------------------------------------

SPEC_SPECS = {
    schema.SPEC_GRANITE_MAUL: dict(
        min_fraction=0.0, max_fraction=1.0, damage_boost=0.0,
        attack_boost=0.0, defence_boost=0.0, ignore_defence=False,
        hit_style=schema.STYLE_MELEE, extra_hits=1),
    schema.SPEC_GRANITE_MAUL_DOUBLE: dict(
        min_fraction=0.0, max_fraction=1.0, damage_boost=0.0,
        attack_boost=0.0, defence_boost=0.0, ignore_defence=False,
        hit_style=schema.STYLE_MELEE, extra_hits=2),
    schema.SPEC_ARMADYL_GODSWORD: dict(
        min_fraction=0.0, max_fraction=1.0, damage_boost=0.375,
        attack_boost=1.0, defence_boost=0.0, ignore_defence=False,
        hit_style=schema.STYLE_MELEE, extra_hits=1),
    schema.SPEC_VOIDWAKER: dict(
        min_fraction=0.50, max_fraction=1.50, damage_boost=0.0,
        attack_boost=0.0, defence_boost=0.0, ignore_defence=True,
        hit_style=schema.STYLE_MAGIC, extra_hits=1),
    schema.SPEC_VESTA_LONGSWORD: dict(
        min_fraction=0.20, max_fraction=1.20, damage_boost=0.0,
        attack_boost=0.0, defence_boost=-0.75, ignore_defence=False,
        hit_style=schema.STYLE_MELEE, extra_hits=1,
        defence_style=schema.STAB_DEFENCE),
}


def roll_damage_range(rng, min_damage, max_damage, damage_boost=0.0,
                      draw=None):
    """Hit.defend's damage roll: max is boosted first, then a uniform draw
    inclusive of both ends (Random.get(min, max))."""
    boosted = (np.asarray(max_damage, dtype=np.float64)
               * (1.0 + damage_boost)).astype(np.int64)
    low = np.asarray(min_damage, dtype=np.int64)
    boosted = np.maximum(boosted, low)
    span = boosted - low + 1
    random_draw = (
        rng.random(np.shape(low))
        if draw is None
        else np.asarray(draw, dtype=np.float64))
    return (low + np.floor(random_draw * span)).astype(np.int32)


def effective_attack(level, style, magic_boost, ranged_boost, melee_boost,
                     magic_interference, attack_type):
    """CombatUtils.getEffectiveAttack, batched.

    level: array of the relevant stat level per fight.
    style: array of schema.STYLE_* per fight.
    """
    eff = np.asarray(level, dtype=np.float64).copy()

    is_magic = style == schema.STYLE_MAGIC
    is_ranged = style == schema.STYLE_RANGED
    is_melee = style == schema.STYLE_MELEE

    eff = np.where(is_magic, eff * (1.0 + magic_boost), eff)
    eff = np.where(is_magic & (magic_interference > 0),
                   eff * (1.0 - magic_interference), eff)
    # Magic adds 3 on accurate, otherwise 1 - it never adds 0.
    eff = np.where(is_magic, eff + np.where(attack_type == ACCURATE, 3.0, 1.0), eff)

    eff = np.where(is_ranged, eff * (1.0 + ranged_boost), eff)
    eff = np.where(is_ranged & (attack_type == ACCURATE), eff + 3.0, eff)
    eff = np.where(is_ranged & (attack_type == LONG_RANGED), eff + 1.0, eff)

    eff = np.where(is_melee, eff * (1.0 + melee_boost), eff)
    eff = np.where(is_melee & (attack_type == ACCURATE), eff + 3.0, eff)
    eff = np.where(is_melee & (attack_type == CONTROLLED), eff + 1.0, eff)

    return eff + 8.0


def attack_roll(effective_atk, attack_bonus):
    """CombatUtils.getAttackBonus tail: effectiveAttack * (bonus + 64)."""
    return effective_atk * (np.asarray(attack_bonus, dtype=np.float64) + 64.0)


def effective_defence(defence_level, defence_boost, attack_type):
    """CombatUtils.getEffectiveDefence, batched."""
    eff = np.asarray(defence_level, dtype=np.float64) * (1.0 + defence_boost)
    eff = np.where((attack_type == DEFENSIVE) | (attack_type == LONG_RANGED),
                   eff + 3.0, eff)
    eff = np.where(attack_type == CONTROLLED, eff + 1.0, eff)
    return eff + 8.0


def defence_component(defence_level, magic_level, defence_boost, magic_boost,
                      defender_attack_type, attacked_by_magic):
    """The stat half of CombatUtils.getDefenceBonus, before the gear multiply.

    Split out because it does not depend on WHICH defensive bonus is being
    rolled against. A special that rolls against a different bonus (Vesta's
    rolls against stab) reuses this and only pays for the final multiply.

    Against magic the defence roll is 30% of the defence stat plus 70% of the
    magic stat - that is the OSRS magic defence rule and it is why swapping to
    Torva legs while being barraged is so costly.
    """
    eff = effective_defence(defence_level, defence_boost, defender_attack_type)
    eff_magic = np.asarray(magic_level, dtype=np.float64) * (1.0 + magic_boost)
    return np.where(attacked_by_magic, eff * 0.30 + eff_magic * 0.70, eff)


def defence_roll(defence_level, magic_level, defence_boost, magic_boost,
                 defender_attack_type, defence_bonus, attacked_by_magic):
    """CombatUtils.getDefenceBonus, batched."""
    eff = defence_component(defence_level, magic_level, defence_boost,
                            magic_boost, defender_attack_type, attacked_by_magic)
    return eff * (np.asarray(defence_bonus, dtype=np.float64) + 64.0)


def effective_strength(level, style, ranged_strength_boost, melee_strength_boost,
                       attack_type, str_adder=0):
    """CombatUtils.getEffectiveStrength, batched.

    Note the Math.ceil: it is applied to level * prayer BEFORE the style bonus.
    """
    level = np.asarray(level, dtype=np.float64)
    is_ranged = style == schema.STYLE_RANGED

    prayer_bonus = np.where(is_ranged,
                            1.0 + ranged_strength_boost,
                            1.0 + melee_strength_boost)
    style_bonus = np.zeros_like(level)
    style_bonus = np.where(is_ranged & (attack_type == ACCURATE), 3.0, style_bonus)
    style_bonus = np.where(is_ranged & (attack_type == LONG_RANGED), 1.0, style_bonus)
    style_bonus = np.where(~is_ranged & (attack_type == AGGRESSIVE), 3.0, style_bonus)
    style_bonus = np.where(~is_ranged & (attack_type == CONTROLLED), 1.0, style_bonus)

    return np.ceil(level * prayer_bonus) + style_bonus + str_adder


def max_damage(effective_str, strength_bonus):
    """CombatUtils.getMaxDamage, batched. Melee and ranged only.

    The Java casts to int, which truncates towards zero.
    """
    strength_bonus = np.asarray(strength_bonus, dtype=np.float64)
    raw = (1.3
           + effective_str / 10.0
           + strength_bonus / 80.0
           + (effective_str * strength_bonus) / 640.0)
    return raw.astype(np.int32)


def magic_max_damage(spell_max, magic_damage_bonus):
    """TargetSpell.cast: maxDamage *= (1 + magicDamageBonus * 0.01)."""
    scaled = np.asarray(spell_max, dtype=np.float64) * (
        1.0 + np.asarray(magic_damage_bonus, dtype=np.float64) * 0.01)
    return scaled.astype(np.int32)


def hit_chance(attack_bonus, defence_bonus):
    """CombatUtils.hitChance, batched. Identical two-branch OSRS formula."""
    attack_bonus = np.asarray(attack_bonus, dtype=np.float64)
    defence_bonus = np.asarray(defence_bonus, dtype=np.float64)
    high = 1.0 - (defence_bonus + 2.0) / (2.0 * (attack_bonus + 1.0))
    low = attack_bonus / (2.0 * (defence_bonus + 1.0))
    return np.where(attack_bonus > defence_bonus, high, low)


def expected_damage(chance, max_dmg, protected_by_prayer):
    """CombatUtils.expectedDamage, batched."""
    multiplier = np.where(protected_by_prayer, schema.PROTECTED_DAMAGE_MULTIPLIER, 1.0)
    return np.maximum(0.0, chance) * np.maximum(0, max_dmg) * 0.5 * multiplier


def roll_hit(rng, chance, min_dmg, max_dmg, damage_boost=0.0,
             ignore_defence=False, return_landed=False,
             damage_draw=None, accuracy_draw=None):
    """One attack, rolled for every fight in the batch at once.

    Order matches Hit.defend: the damage is rolled first, then the accuracy
    check either lets it through or blocks it to zero.

      damage = Random.get(min, max * (1 + damageBoost))    inclusive
      if Random.get() > hitChance: blocked

    Note what is NOT here: the protect-prayer reduction. Entity.hit calls
    Hit.defend and PlayerCombat.postDefend at launch, so the engine applies the
    reduction immediately after this function returns.

    Returns integer damage per fight, 0 where the attack was blocked. With
    ``return_landed=True`` it also returns the accuracy result, because Java
    Ice spells freeze on an accurate zero-damage roll as well as positive hits.
    """
    rolled = roll_damage_range(
        rng, min_dmg, max_dmg, damage_boost, draw=damage_draw)
    if ignore_defence:
        damage = np.maximum(rolled, 0).astype(np.int32)
        landed = np.ones(np.shape(damage), dtype=bool)
        return (damage, landed) if return_landed else damage
    # Java blocks when Random.get() > hitChance, so it lands on <=.
    random_draw = (
        rng.random(np.shape(chance))
        if accuracy_draw is None
        else np.asarray(accuracy_draw, dtype=np.float64))
    landed = random_draw <= chance
    damage = np.maximum(np.where(landed, rolled, 0), 0).astype(np.int32)
    return (damage, landed) if return_landed else damage


def apply_protection(damage, protected_by_prayer):
    """PlayerCombat.postDefend: hit.damage *= 0.60 against a matched overhead
    in PvP. Integer field, so the multiply truncates."""
    reduced = (np.asarray(damage) * schema.PROTECTED_DAMAGE_MULTIPLIER).astype(np.int32)
    return np.where(protected_by_prayer, reduced, damage).astype(np.int32)


def style_vs_style_defence_index(attacker_style):
    """Which defensive bonus the defender's gear is rolled against.

    magic  -> MAGIC_DEFENCE
    ranged -> RANGE_DEFENCE
    melee  -> SLASH_DEFENCE (Vesta's longsword aggressive is a slash attack)
    """
    table = np.array([schema.MAGIC_DEFENCE, schema.RANGE_DEFENCE,
                      schema.SLASH_DEFENCE], dtype=np.int8)
    return table[attacker_style]


def style_attack_bonus_index(attacker_style):
    """Which offensive bonus the attacker's gear contributes."""
    table = np.array([schema.MAGIC_ATTACK, schema.RANGE_ATTACK,
                      schema.SLASH_ATTACK], dtype=np.int8)
    return table[attacker_style]
