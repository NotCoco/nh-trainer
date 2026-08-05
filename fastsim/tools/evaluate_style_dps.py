#!/usr/bin/env python3
"""Compare ordinary Magic and Ranged expected DPS over legal DMM gear states."""

from __future__ import annotations

import argparse
import itertools
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import combat, engine, gear, schema  # noqa: E402


TICK_SECONDS = 0.6
LEVEL = 99
DEFENDER_WEAPONS = (
    gear.ZURIELS_STAFF,
    gear.ZARYTE_CROSSBOW,
    gear.NOXIOUS_HALBERD,
    gear.VESTAS_LONGSWORD,
    gear.VOIDWAKER,
    gear.GRANITE_MAUL,
)
VARIABLE_SLOTS = (
    gear.SLOT_HAT,
    gear.SLOT_CHEST,
    gear.SLOT_LEGS,
    gear.SLOT_SHIELD,
    gear.SLOT_HANDS,
)


def _equipment_ids(items: dict[int, gear.Item]) -> np.ndarray:
    equipped = np.full(gear.SLOT_COUNT, -1, dtype=np.int32)
    for slot, item in items.items():
        equipped[int(slot)] = int(item.item_id)
    return equipped


def defender_gear_states() -> tuple[list[dict], np.ndarray]:
    """All legal combinations of the loadout's switchable defensive slots."""
    base = dict(gear.MAGE_SET)
    rows = []
    equipped_rows = []
    choices = (
        (gear.TORVA_FULL_HELM, None),
        (gear.VIRTUS_ROBE_TOP, gear.MASORI_BODY_F, None),
        (gear.VIRTUS_ROBE_BOTTOM, gear.TORVA_PLATELEGS, None),
        (gear.ELIDINIS_WARD_F, gear.DRAGONFIRE_SHIELD, None),
        (gear.CONFLICTION_GAUNTLETS, gear.BARROWS_GLOVES, None),
    )
    for weapon in DEFENDER_WEAPONS:
        for selected in itertools.product(*choices):
            selected_by_slot = dict(zip(VARIABLE_SLOTS, selected, strict=True))
            if weapon.two_handed and selected_by_slot[gear.SLOT_SHIELD] is not None:
                continue
            items = dict(base)
            for slot in VARIABLE_SLOTS:
                items.pop(slot, None)
            items[gear.SLOT_WEAPON] = weapon
            for slot, item in selected_by_slot.items():
                if item is not None:
                    items[slot] = item
            equipped_rows.append(_equipment_ids(items))
            rows.append({
                "weapon": weapon.name,
                "head": (
                    None if selected[0] is None else selected[0].name),
                "body": (
                    None if selected[1] is None else selected[1].name),
                "legs": (
                    None if selected[2] is None else selected[2].name),
                "shield": (
                    None if selected[3] is None else selected[3].name),
                "hands": (
                    None if selected[4] is None else selected[4].name),
            })
    return rows, np.stack(equipped_rows)


def _attack_type(style: np.ndarray, weapon_ids: np.ndarray) -> np.ndarray:
    result = combat.ATTACK_TYPE_BY_STYLE[style].copy()
    melee = style == schema.STYLE_MELEE
    result = np.where(melee, combat.ACCURATE, result)
    return np.where(
        melee & (weapon_ids == gear.NOXIOUS_HALBERD.item_id),
        combat.CONTROLLED,
        result,
    )


def _ordinary_style(
        attacker_set: dict[int, gear.Item],
        style: int,
        defender_ids: np.ndarray) -> dict[str, np.ndarray | int]:
    count = len(defender_ids)
    attacker_ids = np.broadcast_to(
        _equipment_ids(attacker_set), (count, gear.SLOT_COUNT))
    lookup = gear.build_item_bonus_lookup()
    attacker_bonus = gear.equipment_bonuses(attacker_ids, lookup)
    defender_bonus = gear.equipment_bonuses(defender_ids, lookup)
    attacker_style = np.full(count, style, dtype=np.int32)
    attacker_weapon = attacker_ids[:, gear.SLOT_WEAPON]
    attack_type = _attack_type(attacker_style, attacker_weapon)
    defender_weapon = defender_ids[:, gear.SLOT_WEAPON]
    defender_style = gear.style_for_weapon(defender_weapon)
    defender_attack_type = _attack_type(defender_style, defender_weapon)

    attack_level = np.full(count, LEVEL, dtype=np.float64)
    effective_attack = combat.effective_attack(
        attack_level,
        attacker_style,
        combat.MAGIC_BOOST_BY_STYLE[attacker_style],
        combat.RANGED_ATTACK_BOOST_BY_STYLE[attacker_style],
        combat.MELEE_ATTACK_BOOST_BY_STYLE[attacker_style],
        gear.magic_interference(attacker_ids, lookup),
        attack_type,
    )
    attack_bonus_index = (
        schema.MAGIC_ATTACK if style == schema.STYLE_MAGIC
        else schema.RANGE_ATTACK)
    attack_roll = combat.attack_roll(
        effective_attack, attacker_bonus[:, attack_bonus_index])
    if style == schema.STYLE_MAGIC:
        attack_roll *= 1.0 + combat.ZURIELS_STAFF_ATTACK_BOOST

    defence_component = combat.defence_component(
        np.full(count, LEVEL, dtype=np.float64),
        np.full(count, LEVEL, dtype=np.float64),
        combat.DEFENCE_BOOST_BY_STYLE[defender_style],
        combat.MAGIC_BOOST_BY_STYLE[defender_style],
        defender_attack_type,
        attacked_by_magic=np.full(count, style == schema.STYLE_MAGIC),
    )
    defence_index = (
        schema.MAGIC_DEFENCE if style == schema.STYLE_MAGIC
        else schema.RANGE_DEFENCE)
    defence_roll = defence_component * (
        defender_bonus[:, defence_index] + 64.0)
    chance = combat.hit_chance(attack_roll, defence_roll)

    if style == schema.STYLE_MAGIC:
        maximum = combat.magic_max_damage(
            combat.BARRAGE_MAX_DAMAGE,
            attacker_bonus[:, schema.MAGIC_DAMAGE])
        attack_ticks = 4
    else:
        effective_strength = combat.effective_strength(
            np.full(count, LEVEL, dtype=np.float64),
            attacker_style,
            combat.RANGED_STRENGTH_BOOST_BY_STYLE[attacker_style],
            combat.MELEE_STRENGTH_BOOST_BY_STYLE[attacker_style],
            attack_type,
        )
        maximum = combat.max_damage(
            effective_strength,
            attacker_bonus[:, schema.RANGED_STRENGTH])
        attack_ticks = int(gear.ZARYTE_CROSSBOW.attack_ticks - 1)

    def expected(protected: bool) -> np.ndarray:
        protected_rows = np.full(count, protected)
        base = engine.Engine._expected_uniform_damage(
            chance, np.zeros(count, dtype=np.int32), maximum,
            protected_rows)
        if style != schema.STYLE_RANGED:
            return base
        boosted_maximum = (
            maximum * (1.0 + combat.ONYX_BOLT_DAMAGE_BOOST)).astype(np.int32)
        boosted = engine.Engine._expected_uniform_damage(
            chance, np.zeros(count, dtype=np.int32), boosted_maximum,
            protected_rows)
        return (
            (1.0 - combat.ONYX_BOLT_PROC_CHANCE) * base
            + combat.ONYX_BOLT_PROC_CHANCE * boosted)

    return {
        "hitChance": chance,
        "maxHit": maximum,
        "attackTicks": attack_ticks,
        "unprotected": expected(False),
        "protected": expected(True),
    }


def _summary(values: np.ndarray) -> dict:
    return {
        "minimum": round(float(np.min(values)), 6),
        "median": round(float(np.median(values)), 6),
        "mean": round(float(np.mean(values)), 6),
        "maximum": round(float(np.max(values)), 6),
    }


def _optimal_magic_prayer_share(
        magic_unprotected: np.ndarray,
        magic_protected: np.ndarray,
        ranged_unprotected: np.ndarray,
        ranged_protected: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Two-style simultaneous-game optimum for the defender."""
    denominator = (
        magic_protected - magic_unprotected
        - ranged_unprotected + ranged_protected)
    intersection = np.divide(
        ranged_protected - magic_unprotected,
        denominator,
        out=np.zeros_like(denominator),
        where=np.abs(denominator) > 1.0e-12)
    candidates = np.stack((
        np.zeros_like(intersection),
        np.ones_like(intersection),
        np.clip(intersection, 0.0, 1.0),
    ), axis=1)
    magic_payoff = (
        magic_unprotected[:, None]
        + candidates
        * (magic_protected - magic_unprotected)[:, None])
    ranged_payoff = (
        ranged_protected[:, None]
        + candidates
        * (ranged_unprotected - ranged_protected)[:, None])
    worst = np.maximum(magic_payoff, ranged_payoff)
    selected = np.argmin(worst, axis=1)
    rows = np.arange(len(selected))
    return candidates[rows, selected], worst[rows, selected]


def _voidwaker_summary() -> dict:
    attacker = dict(gear.RANGE_SET)
    attacker[gear.SLOT_WEAPON] = gear.VOIDWAKER
    attacker[gear.SLOT_HANDS] = gear.BARROWS_GLOVES
    ids = _equipment_ids(attacker)
    bonuses = gear.set_bonuses(attacker)
    style = np.asarray([schema.STYLE_MELEE], dtype=np.int32)
    attack_type = np.asarray([combat.ACCURATE], dtype=np.int8)
    effective_strength = combat.effective_strength(
        np.asarray([LEVEL], dtype=np.float64),
        style,
        combat.RANGED_STRENGTH_BOOST_BY_STYLE[style],
        combat.MELEE_STRENGTH_BOOST_BY_STYLE[style],
        attack_type,
    )
    maximum = int(combat.max_damage(
        effective_strength,
        np.asarray([bonuses[schema.MELEE_STRENGTH]]))[0])
    minimum = int(maximum * 0.50)
    special_maximum = int(maximum * 1.50)
    unprotected = float(engine.Engine._expected_uniform_damage(
        np.ones(1), np.asarray([minimum]), np.asarray([special_maximum]),
        np.zeros(1, dtype=bool))[0])
    protected = float(engine.Engine._expected_uniform_damage(
        np.ones(1), np.asarray([minimum]), np.asarray([special_maximum]),
        np.ones(1, dtype=bool))[0])
    return {
        "attackerGear": {
            "weapon": gear.VOIDWAKER.name,
            "body": attacker[gear.SLOT_CHEST].name,
            "legs": attacker[gear.SLOT_LEGS].name,
            "shield": attacker[gear.SLOT_SHIELD].name,
            "hands": attacker[gear.SLOT_HANDS].name,
        },
        "ordinaryMeleeMaxHit": maximum,
        "specialDamageRange": [minimum, special_maximum],
        "specialExpectedDamageUnprotected": round(unprotected, 6),
        "specialExpectedDamageProtectMagic": round(protected, 6),
        "specialEnergyCostPct": 50,
        "note": (
            "The special always lands as Magic. Its ordinary attacks remain "
            "Melee, so the correct protection changes once less than 50% "
            "special energy remains."),
        "equipmentIds": ids.tolist(),
    }


def build_report() -> dict:
    gear_rows, defender_ids = defender_gear_states()
    magic = _ordinary_style(gear.MAGE_SET, schema.STYLE_MAGIC, defender_ids)
    ranged = _ordinary_style(gear.RANGE_SET, schema.STYLE_RANGED, defender_ids)
    magic_ticks = int(magic["attackTicks"])
    ranged_ticks = int(ranged["attackTicks"])
    magic_unprotected = magic["unprotected"] / (magic_ticks * TICK_SECONDS)
    magic_protected = magic["protected"] / (magic_ticks * TICK_SECONDS)
    ranged_unprotected = ranged["unprotected"] / (ranged_ticks * TICK_SECONDS)
    ranged_protected = ranged["protected"] / (ranged_ticks * TICK_SECONDS)
    optimal_magic_share, minimax_dps = _optimal_magic_prayer_share(
        magic_unprotected,
        magic_protected,
        ranged_unprotected,
        ranged_protected,
    )

    rows = []
    for index, gear_row in enumerate(gear_rows):
        rows.append({
            **gear_row,
            "magic": {
                "hitChancePct": round(float(magic["hitChance"][index]) * 100, 4),
                "maxHit": int(magic["maxHit"][index]),
                "expectedDamagePerAttack": round(
                    float(magic["unprotected"][index]), 6),
                "unprotectedDps": round(float(magic_unprotected[index]), 6),
                "protectedDps": round(float(magic_protected[index]), 6),
            },
            "ranged": {
                "hitChancePct": round(float(ranged["hitChance"][index]) * 100, 4),
                "maxHit": int(ranged["maxHit"][index]),
                "expectedDamagePerAttack": round(
                    float(ranged["unprotected"][index]), 6),
                "unprotectedDps": round(float(ranged_unprotected[index]), 6),
                "protectedDps": round(float(ranged_protected[index]), 6),
            },
            "twoStyleMinimaxProtectMagicPct": round(
                float(optimal_magic_share[index]) * 100, 4),
            "twoStyleMinimaxWorstCaseDps": round(
                float(minimax_dps[index]), 6),
        })

    magic_higher = magic_unprotected > ranged_unprotected
    ranged_higher = ranged_unprotected > magic_unprotected
    return {
        "schema": "fastsim_style_dps_sweep.v1",
        "authority": "source_formula_diagnostic",
        "configuration": {
            "combatLevel": LEVEL,
            "logicalTickSeconds": TICK_SECONDS,
            "magicAttackTicks": magic_ticks,
            "rangedAttackTicks": ranged_ticks,
            "defenderGearStates": len(rows),
            "magicAttackerSet": {
                "weapon": gear.MAGE_SET[gear.SLOT_WEAPON].name,
                "body": gear.MAGE_SET[gear.SLOT_CHEST].name,
                "legs": gear.MAGE_SET[gear.SLOT_LEGS].name,
                "shield": gear.MAGE_SET[gear.SLOT_SHIELD].name,
            },
            "rangedAttackerSet": {
                "weapon": gear.RANGE_SET[gear.SLOT_WEAPON].name,
                "body": gear.RANGE_SET[gear.SLOT_CHEST].name,
                "legs": gear.RANGE_SET[gear.SLOT_LEGS].name,
                "shield": gear.RANGE_SET[gear.SLOT_SHIELD].name,
                "ammo": gear.RANGE_SET[gear.SLOT_AMMO].name,
            },
        },
        "summary": {
            "unprotectedMagicDps": _summary(magic_unprotected),
            "unprotectedRangedDps": _summary(ranged_unprotected),
            "magicHigherStateCount": int(np.count_nonzero(magic_higher)),
            "magicHigherStatePct": round(
                float(np.mean(magic_higher)) * 100, 4),
            "rangedHigherStateCount": int(np.count_nonzero(ranged_higher)),
            "rangedHigherStatePct": round(
                float(np.mean(ranged_higher)) * 100, 4),
            "medianMagicToRangedDpsRatio": round(float(np.median(
                magic_unprotected / ranged_unprotected)), 6),
            "twoStyleMinimaxProtectMagicPct": _summary(
                optimal_magic_share * 100.0),
            "twoStyleMinimaxWorstCaseDps": _summary(minimax_dps),
        },
        "voidwaker": _voidwaker_summary(),
        "rows": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    report = build_report()
    output = args.out.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
