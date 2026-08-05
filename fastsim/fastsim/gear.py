"""The DMM loadout: items, their bonuses, and the three fighting sets.

Where the numbers come from
---------------------------
Every bonus here is taken from the server's own data, not from memory of live
OSRS values:

  custom Kronos items  - hard-coded in
                         src/main/java/io/ruin/data/impl/items/DmmRuntimeItems.java
  everything else      - data/items/item_info.json, which the server parses in
                         data/impl/items/item_info.java into the same 14-slot
                         array

Weapon speeds and reach come from data/items/weapon_types.json.

Bonus array order is EquipmentStats:
    [stab_atk, slash_atk, crush_atk, magic_atk, range_atk,
     stab_def, slash_def, crush_def, magic_def, range_def,
     melee_str, ranged_str, magic_dmg, prayer]
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from . import schema

# Equipment slot ids (io.ruin.model.item.containers.Equipment).
SLOT_HAT = 0
SLOT_CAPE = 1
SLOT_AMULET = 2
SLOT_WEAPON = 3
SLOT_CHEST = 4
SLOT_SHIELD = 5
SLOT_LEGS = 7
SLOT_HANDS = 9
SLOT_FEET = 10
SLOT_RING = 12
SLOT_AMMO = 13

SLOT_COUNT = 14


@dataclass(frozen=True)
class Item:
    item_id: int
    name: str
    slot: int
    bonuses: tuple  # length 14
    two_handed: bool = False
    weapon_type: str | None = None
    attack_ticks: int = 0
    max_distance: int = 1


def _b(*values) -> tuple:
    assert len(values) == schema.BONUS_COUNT, f"expected 14 bonuses, got {len(values)}"
    return tuple(int(v) for v in values)


# --- Custom Kronos DMM items (VERIFIED against DmmRuntimeItems.java) --------

TORVA_FULL_HELM = Item(
    26382, "Torva full helm", SLOT_HAT,
    _b(0, 0, 0, -5, -5, 59, 60, 62, -2, 57, 8, 0, 0, 1))
MASORI_BODY_F = Item(
    27238, "Masori body (f)", SLOT_CHEST,
    _b(0, 0, 0, -4, 43, 59, 52, 64, 74, 60, 0, 4, 0, 1))
TORVA_PLATELEGS = Item(
    26386, "Torva platelegs", SLOT_LEGS,
    _b(0, 0, 0, -24, -11, 87, 78, 79, -9, 102, 4, 0, 0, 1))
ELIDINIS_WARD_F = Item(
    27251, "Elidinis' ward (f)", SLOT_SHIELD,
    _b(0, 0, 0, 25, 0, 53, 55, 73, 2, 52, 0, 0, 5, 4))
ZURIELS_STAFF = Item(
    22647, "Zuriel's staff", SLOT_WEAPON,
    _b(13, -1, 65, 18, 0, 5, 7, 4, 18, 0, 72, 0, 10, 0),
    weapon_type="MAGIC_STAFF", attack_ticks=5, max_distance=1)
VIRTUS_ROBE_TOP = Item(
    26243, "Virtus robe top", SLOT_CHEST,
    _b(0, 0, 0, 35, -11, 47, 36, 56, 31, 0, 0, 0, 2, 2))
VIRTUS_ROBE_BOTTOM = Item(
    26245, "Virtus robe bottom", SLOT_LEGS,
    _b(0, 0, 0, 26, -9, 31, 28, 34, 22, 0, 0, 0, 2, 1))
ZARYTE_CROSSBOW = Item(
    26374, "Zaryte crossbow", SLOT_WEAPON,
    _b(0, 0, 0, 0, 110, 14, 14, 12, 15, 16, 0, 0, 0, 1),
    weapon_type="ARMADYL_CROSSBOW", attack_ticks=6, max_distance=8)
ONYX_DRAGON_BOLTS_E = Item(
    21950, "Onyx dragon bolts (e)", SLOT_AMMO,
    _b(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 122, 0, 0))
AVERNIC_TREADS = Item(
    31097, "Avernic treads (max)", SLOT_FEET,
    _b(5, 5, 5, 11, 15, 21, 25, 25, 10, 10, 6, 3, 2, 0))
CONFLICTION_GAUNTLETS = Item(
    31106, "Confliction gauntlets", SLOT_HANDS,
    _b(0, 0, 0, 20, -4, 15, 18, 7, 5, 5, 0, 0, 7, 2))
VOIDWAKER = Item(
    27690, "Voidwaker", SLOT_WEAPON,
    _b(70, 80, -2, 5, 0, 0, 1, 0, 2, 0, 80, 0, 0, 0),
    weapon_type="SWORD", attack_ticks=4, max_distance=1)
VESTAS_LONGSWORD = Item(
    22613, "Vesta's longsword", SLOT_WEAPON,
    _b(106, 121, -2, 0, 0, 1, 4, 3, 0, 0, 118, 0, 0, 0),
    weapon_type="VESTA_LONGSWORD", attack_ticks=5, max_distance=1)
NOXIOUS_HALBERD = Item(
    29796, "Noxious halberd", SLOT_WEAPON,
    _b(80, 132, 0, 0, 0, 0, 0, 0, 0, 0, 142, 0, 0, 0),
    two_handed=True, weapon_type="HALBERD", attack_ticks=7, max_distance=2)

# --- Standard OSRS items -----------------------------------------------------
# These are not cache lookups after all: the server loads them from
# data/items/item_info.json via data/impl/items/item_info.java, which maps the
# json fields onto the same 14-slot bonus array. Values below were extracted
# from that file, so they are as authoritative as the DMM ones above.

IMBUED_SARADOMIN_CAPE = Item(
    21791, "Imbued saradomin cape", SLOT_CAPE,
    _b(0, 0, 0, 15, 0, 3, 3, 3, 15, 0, 0, 0, 2, 0))
AMULET_OF_FURY = Item(
    6585, "Amulet of fury", SLOT_AMULET,
    _b(10, 10, 10, 10, 10, 15, 15, 15, 15, 15, 8, 0, 0, 5))
SEERS_RING_I = Item(
    11770, "Seers ring (i)", SLOT_RING,
    _b(0, 0, 0, 12, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0))
BARROWS_GLOVES = Item(
    7462, "Barrows gloves", SLOT_HANDS,
    _b(12, 12, 12, 6, 12, 12, 12, 12, 6, 12, 12, 0, 0, 0))
DRAGONFIRE_SHIELD = Item(
    11283, "Dragonfire shield", SLOT_SHIELD,
    _b(0, 0, 0, -10, -5, 70, 75, 72, 10, 72, 7, 0, 0, 0))
GRANITE_MAUL = Item(
    4153, "Granite maul", SLOT_WEAPON,
    _b(0, 0, 81, 0, 0, 0, 0, 0, 0, 0, 79, 0, 0, 0),
    two_handed=True, weapon_type="GRANITE_MAUL", attack_ticks=7, max_distance=1)

ALL_ITEMS = [
    TORVA_FULL_HELM, MASORI_BODY_F, TORVA_PLATELEGS, ELIDINIS_WARD_F,
    ZURIELS_STAFF, VIRTUS_ROBE_TOP, VIRTUS_ROBE_BOTTOM, ZARYTE_CROSSBOW,
    ONYX_DRAGON_BOLTS_E, AVERNIC_TREADS, CONFLICTION_GAUNTLETS, VOIDWAKER,
    VESTAS_LONGSWORD, NOXIOUS_HALBERD, IMBUED_SARADOMIN_CAPE, AMULET_OF_FURY,
    SEERS_RING_I, BARROWS_GLOVES, DRAGONFIRE_SHIELD, GRANITE_MAUL,
]
BY_ID = {item.item_id: item for item in ALL_ITEMS}

# DmmRuntimeItems.bindSpecial clears every runtime item's cache special, then
# binds controls only to Voidwaker, Vesta's longsword, and Zaryte crossbow.
# Granite maul is a normal cache item and retains its own special.
SPECIAL_BAR_WEAPON_IDS = frozenset({
    ZARYTE_CROSSBOW.item_id,
    VOIDWAKER.item_id,
    VESTAS_LONGSWORD.item_id,
    GRANITE_MAUL.item_id,
})

SPEC_WEAPONS = (
    GRANITE_MAUL,
    GRANITE_MAUL,
    None,  # Armadyl godsword is not present in the DMM loadout.
    VOIDWAKER,
    VESTAS_LONGSWORD,
)


def weapon_shows_special_bar(item_ids) -> np.ndarray:
    """NhStakerBot.weaponShowsSpecialBar for the weapons in this loadout."""
    return np.isin(item_ids, tuple(SPECIAL_BAR_WEAPON_IDS))


# --- The three fighting sets -----------------------------------------------
# Built from NhStakerLoadout.setupDmmLoadout (worn) plus setupDmmInventory
# (the swap pieces the bot carries). The bot starts in the mage set.

MAGE_SET = {
    SLOT_HAT: TORVA_FULL_HELM,
    SLOT_CAPE: IMBUED_SARADOMIN_CAPE,
    SLOT_AMULET: AMULET_OF_FURY,
    SLOT_WEAPON: ZURIELS_STAFF,
    SLOT_CHEST: VIRTUS_ROBE_TOP,
    SLOT_SHIELD: ELIDINIS_WARD_F,
    SLOT_LEGS: VIRTUS_ROBE_BOTTOM,
    SLOT_HANDS: CONFLICTION_GAUNTLETS,
    SLOT_FEET: AVERNIC_TREADS,
    SLOT_RING: SEERS_RING_I,
    SLOT_AMMO: ONYX_DRAGON_BOLTS_E,
}

RANGE_SET = dict(MAGE_SET)
RANGE_SET.update({
    SLOT_WEAPON: ZARYTE_CROSSBOW,
    SLOT_CHEST: MASORI_BODY_F,
    SLOT_LEGS: TORVA_PLATELEGS,
    SLOT_SHIELD: DRAGONFIRE_SHIELD,
})

MELEE_SET = dict(MAGE_SET)
MELEE_SET.update({
    SLOT_WEAPON: NOXIOUS_HALBERD,
    SLOT_CHEST: MASORI_BODY_F,
    SLOT_LEGS: TORVA_PLATELEGS,
    SLOT_HANDS: BARROWS_GLOVES,
})
MELEE_SET.pop(SLOT_SHIELD)

SETS = (MAGE_SET, RANGE_SET, MELEE_SET)  # indexed by schema.STYLE_*

# NhStakerBot.DirectGearAction.policyActions(), in current model-row order.
# The first 20 equip a concrete item and the final nine unequip a slot. Ammo is
# deliberately present in the global action schema but its causal unit is
# inactive in v25, matching nh_rollout.py.
DIRECT_GEAR_ITEMS = np.array([
    TORVA_FULL_HELM.item_id,
    IMBUED_SARADOMIN_CAPE.item_id,
    AMULET_OF_FURY.item_id,
    ZURIELS_STAFF.item_id,
    VIRTUS_ROBE_TOP.item_id,
    ELIDINIS_WARD_F.item_id,
    VIRTUS_ROBE_BOTTOM.item_id,
    CONFLICTION_GAUNTLETS.item_id,
    AVERNIC_TREADS.item_id,
    SEERS_RING_I.item_id,
    ONYX_DRAGON_BOLTS_E.item_id,
    MASORI_BODY_F.item_id,
    ZARYTE_CROSSBOW.item_id,
    TORVA_PLATELEGS.item_id,
    DRAGONFIRE_SHIELD.item_id,
    NOXIOUS_HALBERD.item_id,
    BARROWS_GLOVES.item_id,
    VESTAS_LONGSWORD.item_id,
    VOIDWAKER.item_id,
    GRANITE_MAUL.item_id,
    *([-1] * 9),
], dtype=np.int32)
DIRECT_GEAR_SLOTS = np.array([
    SLOT_HAT, SLOT_CAPE, SLOT_AMULET, SLOT_WEAPON, SLOT_CHEST,
    SLOT_SHIELD, SLOT_LEGS, SLOT_HANDS, SLOT_FEET, SLOT_RING, SLOT_AMMO,
    SLOT_CHEST, SLOT_WEAPON, SLOT_LEGS, SLOT_SHIELD, SLOT_WEAPON,
    SLOT_HANDS, SLOT_WEAPON, SLOT_WEAPON, SLOT_WEAPON,
    SLOT_HAT, SLOT_CAPE, SLOT_AMULET, SLOT_CHEST, SLOT_SHIELD,
    SLOT_LEGS, SLOT_HANDS, SLOT_FEET, SLOT_RING,
], dtype=np.int8)
DIRECT_GEAR_UNEQUIP = DIRECT_GEAR_ITEMS < 0
DIRECT_GEAR_TWO_HANDED = np.array([
    item_id > 0 and BY_ID[item_id].two_handed
    for item_id in DIRECT_GEAR_ITEMS
], dtype=bool)
assert DIRECT_GEAR_ITEMS.size == schema.GEAR_COUNT

# One causal unit per optional slot. The ammo unit is retained for schema
# compatibility but is inactive and therefore never selected.
GEAR_UNIT_SLOTS = np.asarray(schema.OPTIONAL_GEAR_SLOTS, dtype=np.int8)
GEAR_ROWS_BY_SLOT = {
    int(slot): np.nonzero(DIRECT_GEAR_SLOTS == slot)[0] + schema.GEAR_BASE
    for slot in GEAR_UNIT_SLOTS
}


def set_bonuses(gear_set: dict) -> np.ndarray:
    """Sum the 14 bonuses over every worn slot."""
    total = np.zeros(schema.BONUS_COUNT, dtype=np.int32)
    for item in gear_set.values():
        total += np.asarray(item.bonuses, dtype=np.int32)
    return total


def build_set_bonus_table() -> np.ndarray:
    """[3 styles, 14 bonuses] - the summed bonuses of each fighting set."""
    return np.stack([set_bonuses(s) for s in SETS])


def initial_equipment_ids() -> np.ndarray:
    """The exact worn DMM mage setup, indexed by Equipment slot."""
    equipped = np.full(SLOT_COUNT, -1, dtype=np.int32)
    for slot, item in MAGE_SET.items():
        equipped[slot] = item.item_id
    return equipped


def build_item_bonus_lookup() -> np.ndarray:
    """Dense item-id lookup used by vectorized live-equipment calculations."""
    size = max(BY_ID) + 1
    lookup = np.zeros((size, schema.BONUS_COUNT), dtype=np.int32)
    for item_id, item in BY_ID.items():
        lookup[item_id] = np.asarray(item.bonuses, dtype=np.int32)
    return lookup


def equipment_bonuses(equipped_ids: np.ndarray, lookup: np.ndarray) -> np.ndarray:
    """Sum bonuses for [..., 14] live equipment arrays."""
    ids = np.asarray(equipped_ids, dtype=np.int64)
    safe = np.where((ids >= 0) & (ids < lookup.shape[0]), ids, 0)
    bonuses = lookup[safe]
    bonuses = np.where((ids >= 0)[..., None], bonuses, 0)
    return bonuses.sum(axis=-2)


def magic_interference(equipped_ids: np.ndarray, lookup: np.ndarray) -> np.ndarray:
    """CombatUtils.getMagicInterference for the two armour slots it checks."""
    ids = np.asarray(equipped_ids, dtype=np.int64)
    checked = ids[..., [SLOT_CHEST, SLOT_LEGS]]
    safe = np.where(
        (checked >= 0) & (checked < lookup.shape[0]), checked, 0)
    magic_attack = lookup[safe, schema.MAGIC_ATTACK]
    worn = checked >= 0
    # Java applies 0.45 once for each worn chest/legs item whose magic attack
    # bonus is negative. With both pieces, the effective magic level is only
    # ten percent of its pre-interference value.
    return np.sum(worn & (magic_attack < 0), axis=-1) * 0.45


def style_for_weapon(item_ids: np.ndarray) -> np.ndarray:
    """detectLikelyOffenceStyleFromGearLive for every modelled DMM weapon."""
    ids = np.asarray(item_ids)
    return np.select(
        [
            ids == ZURIELS_STAFF.item_id,
            ids == ZARYTE_CROSSBOW.item_id,
            np.isin(ids, (
                NOXIOUS_HALBERD.item_id,
                VESTAS_LONGSWORD.item_id,
                VOIDWAKER.item_id,
                GRANITE_MAUL.item_id,
            )),
        ],
        [schema.STYLE_MAGIC, schema.STYLE_RANGED, schema.STYLE_MELEE],
        default=schema.STYLE_NONE,
    ).astype(np.int32)


def weapon_max_distance(item_ids: np.ndarray) -> np.ndarray:
    """PlayerCombat.weaponType.maxDistance for every modelled weapon id."""
    ids = np.asarray(item_ids)
    distance = np.ones(ids.shape, dtype=np.int32)
    for item in ALL_ITEMS:
        if item.slot == SLOT_WEAPON:
            distance = np.where(
                ids == item.item_id, item.max_distance, distance)
    return distance


def melee_standing_range(item_ids: np.ndarray) -> np.ndarray:
    """Visible melee range, defaulting non-melee/unknown weapons to one tile."""
    ids = np.asarray(item_ids)
    return np.where(
        style_for_weapon(ids) == schema.STYLE_MELEE,
        weapon_max_distance(ids),
        1,
    ).astype(np.int32)


def build_set_weapon_table() -> dict:
    """Per-style weapon facts the tick loop needs.

    Attack range follows PlayerCombat.java:495 --
        useSpell() ? 10 : min(weaponType.maxDistance + (longRange ? 2 : 0), 10)
    so the mage set reaches 10 tiles because it is casting a spell, not because
    the staff itself has any reach. Everything else uses the weapon's own range
    capped at 10.
    """
    ranges = []
    for style in range(3):
        weapon = SETS[style][SLOT_WEAPON]
        if style == schema.STYLE_MAGIC:
            ranges.append(10)  # autocast Ice Barrage
        else:
            ranges.append(min(weapon.max_distance, 10))

    # Casting speed does NOT come from the staff's entry in weapon_types.json.
    # PlayerCombat.targetSpellAttackTicks overrides it:
    #
    #     return ancientSpellbook && castingWeaponId == ZURIELS_STAFF_DMM ? 4 : 5;
    #
    # This loadout is exactly that case - Zuriel's staff autocasting Ice Barrage
    # off the ancient spellbook - so barrage fires every 4 ticks, not the 5 the
    # generic weapon table would give. A 25% difference in how often the bot's
    # main attack goes out, so it is not a detail.
    speeds = [SETS[s][SLOT_WEAPON].attack_ticks for s in range(3)]
    if SETS[schema.STYLE_MAGIC][SLOT_WEAPON] is ZURIELS_STAFF:
        speeds[schema.STYLE_MAGIC] = 4

    return {
        "attack_ticks": np.array(speeds, dtype=np.int32),
        "max_distance": np.array(ranges, dtype=np.int32),
        "weapon_id": np.array(
            [SETS[s][SLOT_WEAPON].item_id for s in range(3)], dtype=np.int32),
    }


def load_override(path: str | Path) -> None:
    """Replace any bonus with a live dump from the running server.

    Not needed for correctness - the built-in values already come from the
    server's own data files. This exists so a live dump can be diffed against
    them after a server-side item change.

    The dump is the JSON written by tools/DumpGearTable.java:
        {"<item id>": {"bonuses": [14 ints], "attackTicks": int,
                       "maxDistance": int, "twoHanded": bool}}
    Only items present in the dump are touched, so a partial dump is fine.
    """
    data = json.loads(Path(path).read_text())
    for raw_id, payload in data.items():
        item = BY_ID.get(int(raw_id))
        if item is None:
            continue
        replacement = Item(
            item_id=item.item_id,
            name=item.name,
            slot=item.slot,
            bonuses=_b(*payload["bonuses"]),
            two_handed=bool(payload.get("twoHanded", item.two_handed)),
            weapon_type=payload.get("weaponType", item.weapon_type),
            attack_ticks=int(payload.get("attackTicks", item.attack_ticks)),
            max_distance=int(payload.get("maxDistance", item.max_distance)),
        )
        BY_ID[item.item_id] = replacement
        for gear_set in SETS:
            for slot, existing in list(gear_set.items()):
                if existing.item_id == item.item_id:
                    gear_set[slot] = replacement
