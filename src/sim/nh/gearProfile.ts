import equipmentRowsJson from "../../generated/equipment-bonuses.json";
import type { EquipmentSlot, VisibleEquipment, VisibleEquipmentItem } from "../clientView";
import type { BonusTable, CombatStyle } from "../combat/formulas";
import { equipmentRowsByItemId, type EquipmentBonusRow } from "../equipment/equipment";
import type { NhOffenceStyle, NhPolicyAction } from "./policy-bridge";
import { canonicalNhGear, canonicalNhLoadoutEquipment } from "./canonicalGear";
import type { NhWeaponId } from "./loadouts";

export type NhCandidateVisibleStyle = "magic" | "ranged" | "slash";

export interface NhSelectedGearProfile {
  readonly magicWeaponId: NhWeaponId;
  readonly rangedWeaponId: NhWeaponId;
  readonly rangedAmmoItem: VisibleEquipmentItem;
  readonly meleeWeaponId: NhWeaponId;
  readonly equipmentItemCount: number;
  readonly inventoryItemCount: number;
  readonly equipmentWeaponItemId: number | null;
  readonly magicShieldItem: VisibleEquipmentItem;
  readonly magicCapeItem: VisibleEquipmentItem;
  readonly magicAmuletItem: VisibleEquipmentItem;
  readonly magicChestItem: VisibleEquipmentItem;
  readonly magicLegsItem: VisibleEquipmentItem;
  readonly rangedCapeItem: VisibleEquipmentItem;
  readonly rangedAmuletItem: VisibleEquipmentItem;
  readonly rangedShieldItem: VisibleEquipmentItem;
  readonly rangedChestItem: VisibleEquipmentItem;
  readonly rangedLegsItem: VisibleEquipmentItem;
  readonly meleeShieldItem: VisibleEquipmentItem;
  readonly meleeCapeItem: VisibleEquipmentItem;
  readonly meleeAmuletItem: VisibleEquipmentItem;
  readonly meleeChestItem: VisibleEquipmentItem;
  readonly meleeLegsItem: VisibleEquipmentItem;
  readonly ownedItems: readonly VisibleEquipmentItem[];
  readonly strictInventory: boolean;
}

const equipmentRows = equipmentRowsJson as readonly EquipmentBonusRow[];
const equipmentRowByItemId = equipmentRowsByItemId(equipmentRows);

const equipmentSlotByCacheSlot: Readonly<Record<number, EquipmentSlot | undefined>> = {
  0: "head",
  1: "cape",
  2: "amulet",
  3: "weapon",
  4: "body",
  5: "shield",
  7: "legs",
  9: "hands",
  10: "feet",
  12: "ring",
  13: "ammo"
};

// Source: NhStakerLoadout MAGIC/RANGED/MELEE_WEAPON_CANDIDATES.
const javaBotMagicWeaponCandidates: readonly NhWeaponId[] = ["staff_of_the_dead", "kodai", "ancient_staff"];
const javaBotRangedWeaponCandidates: readonly NhWeaponId[] = ["dragon_crossbow", "armadyl_crossbow", "rune_crossbow", "magic_shortbow"];
const javaBotMeleeWeaponCandidates: readonly NhWeaponId[] = ["tentacle_whip", "abyssal_whip"];

// Trainer weapon recognition can cover more local weapons, but copied bot
// source layouts are still gated by Java's narrower candidate sets below.
const magicWeaponCandidates: readonly NhWeaponId[] = javaBotMagicWeaponCandidates;
const rangedWeaponCandidates: readonly NhWeaponId[] = javaBotRangedWeaponCandidates;
const meleeWeaponCandidates: readonly NhWeaponId[] = javaBotMeleeWeaponCandidates;

const weaponItemById = {
  kodai: canonicalNhLoadoutEquipment["kodai-robes"].weapon,
  ancient_staff: canonicalNhGear.ancientStaff,
  staff_of_the_dead: canonicalNhGear.staffOfTheDead,
  armadyl_crossbow: canonicalNhLoadoutEquipment["acb-hides"].weapon,
  rune_crossbow: canonicalNhGear.runeCrossbow,
  magic_shortbow: canonicalNhGear.magicShortbow,
  dragon_crossbow: canonicalNhGear.dragonCrossbow,
  tentacle_whip: canonicalNhLoadoutEquipment["tentacle-bandos"].weapon,
  abyssal_whip: canonicalNhGear.abyssalWhip,
  armadyl_godsword: canonicalNhLoadoutEquipment["ags-bandos"].weapon,
  granite_maul: canonicalNhLoadoutEquipment["gmaul-bandos"].weapon
} as const satisfies Readonly<Record<NhWeaponId, VisibleEquipmentItem>>;

const vestaLongswordItemId = 22613;

export function inferNhSelectedGearProfile(input: {
  readonly equipment: VisibleEquipment;
  readonly previousProfile?: NhSelectedGearProfile;
  readonly inventoryItems?: readonly VisibleEquipmentItem[];
}): NhSelectedGearProfile {
  const strictInventory = input.inventoryItems !== undefined;
  const effectiveStrictInventory = strictInventory || input.previousProfile?.strictInventory === true;
  const ownedItems = collectProfileOwnedItems(input.equipment, input.previousProfile, input.inventoryItems, effectiveStrictInventory);
  const styleSelectionItems = collectStyleSelectionItems(input.equipment, input.inventoryItems, ownedItems);
  const currentWeaponId = nhGearProfileWeaponIdForEquipment(input.equipment);
  const magicWeaponId = pickOwnedWeapon(ownedItems, magicWeaponCandidates, effectiveStrictInventory ? currentWeaponId ?? "kodai" : "kodai");
  const rangedWeaponId = pickOwnedWeapon(
    ownedItems,
    rangedWeaponCandidates,
    effectiveStrictInventory ? currentWeaponId ?? "armadyl_crossbow" : "armadyl_crossbow"
  );
  const meleeWeaponId = pickOwnedWeapon(
    ownedItems,
    meleeWeaponCandidates,
    effectiveStrictInventory ? currentWeaponId ?? "tentacle_whip" : "tentacle_whip"
  );
  const rangedAmmoItem = input.equipment.ammo ?? canonicalNhLoadoutEquipment["acb-hides"].ammo;

  return {
    magicWeaponId,
    rangedWeaponId,
    rangedAmmoItem,
    meleeWeaponId,
    equipmentItemCount: countVisibleEquipmentItems(input.equipment),
    inventoryItemCount: input.inventoryItems?.length ?? input.previousProfile?.inventoryItemCount ?? 0,
    equipmentWeaponItemId: input.equipment.weapon?.itemId ?? null,
    magicShieldItem: pickOwnedBestForSlot(
      styleSelectionItems,
      "shield",
      "magic",
      effectiveStrictInventory ? input.equipment.shield ?? canonicalNhLoadoutEquipment["kodai-robes"].shield : canonicalNhLoadoutEquipment["kodai-robes"].shield
    ),
    magicCapeItem: pickOwnedBestForSlot(
      styleSelectionItems,
      "cape",
      "magic",
      effectiveStrictInventory ? input.equipment.cape ?? canonicalNhLoadoutEquipment["kodai-robes"].cape : canonicalNhLoadoutEquipment["kodai-robes"].cape
    ),
    magicAmuletItem: pickOwnedBestForSlot(
      styleSelectionItems,
      "amulet",
      "magic",
      effectiveStrictInventory ? input.equipment.amulet ?? canonicalNhLoadoutEquipment["kodai-robes"].amulet : canonicalNhLoadoutEquipment["kodai-robes"].amulet
    ),
    magicChestItem: pickOwnedBestForSlot(
      styleSelectionItems,
      "body",
      "magic",
      effectiveStrictInventory ? input.equipment.body ?? canonicalNhLoadoutEquipment["kodai-robes"].body : canonicalNhLoadoutEquipment["kodai-robes"].body
    ),
    magicLegsItem: pickOwnedBestForSlot(
      styleSelectionItems,
      "legs",
      "magic",
      effectiveStrictInventory ? input.equipment.legs ?? canonicalNhLoadoutEquipment["kodai-robes"].legs : canonicalNhLoadoutEquipment["kodai-robes"].legs
    ),
    rangedCapeItem: pickOwnedBestForSlot(
      styleSelectionItems,
      "cape",
      "ranged",
      effectiveStrictInventory ? input.equipment.cape ?? canonicalNhLoadoutEquipment["acb-hides"].cape : canonicalNhLoadoutEquipment["acb-hides"].cape
    ),
    rangedAmuletItem: pickOwnedBestForSlot(
      styleSelectionItems,
      "amulet",
      "ranged",
      effectiveStrictInventory ? input.equipment.amulet ?? canonicalNhLoadoutEquipment["acb-hides"].amulet : canonicalNhLoadoutEquipment["acb-hides"].amulet
    ),
    rangedShieldItem: pickOwnedBestForSlot(
      styleSelectionItems,
      "shield",
      "ranged",
      effectiveStrictInventory ? input.equipment.shield ?? canonicalNhLoadoutEquipment["acb-hides"].shield : canonicalNhLoadoutEquipment["acb-hides"].shield
    ),
    rangedChestItem: pickOwnedBestForSlot(
      styleSelectionItems,
      "body",
      "ranged",
      effectiveStrictInventory ? input.equipment.body ?? canonicalNhLoadoutEquipment["acb-hides"].body : canonicalNhLoadoutEquipment["acb-hides"].body
    ),
    rangedLegsItem: pickOwnedBestForSlot(
      styleSelectionItems,
      "legs",
      "ranged",
      effectiveStrictInventory ? input.equipment.legs ?? canonicalNhLoadoutEquipment["acb-hides"].legs : canonicalNhLoadoutEquipment["acb-hides"].legs
    ),
    meleeShieldItem: pickOwnedBestForSlot(
      styleSelectionItems,
      "shield",
      "melee",
      effectiveStrictInventory ? input.equipment.shield ?? canonicalNhLoadoutEquipment["tentacle-bandos"].shield : canonicalNhLoadoutEquipment["tentacle-bandos"].shield
    ),
    meleeCapeItem: pickOwnedBestForSlot(
      styleSelectionItems,
      "cape",
      "melee",
      effectiveStrictInventory ? input.equipment.cape ?? canonicalNhLoadoutEquipment["tentacle-bandos"].cape : canonicalNhLoadoutEquipment["tentacle-bandos"].cape
    ),
    meleeAmuletItem: pickOwnedBestForSlot(
      styleSelectionItems,
      "amulet",
      "melee",
      effectiveStrictInventory ? input.equipment.amulet ?? canonicalNhLoadoutEquipment["tentacle-bandos"].amulet : canonicalNhLoadoutEquipment["tentacle-bandos"].amulet
    ),
    meleeChestItem: pickOwnedBestForSlot(
      styleSelectionItems,
      "body",
      "melee",
      effectiveStrictInventory ? input.equipment.body ?? canonicalNhLoadoutEquipment["tentacle-bandos"].body : canonicalNhLoadoutEquipment["tentacle-bandos"].body
    ),
    meleeLegsItem: pickOwnedBestForSlot(
      styleSelectionItems,
      "legs",
      "melee",
      effectiveStrictInventory ? input.equipment.legs ?? canonicalNhLoadoutEquipment["tentacle-bandos"].legs : canonicalNhLoadoutEquipment["tentacle-bandos"].legs
    ),
    ownedItems,
    strictInventory: effectiveStrictInventory
  };
}

export function nhGearProfileCandidateEquipmentByStyle(
  currentEquipment: VisibleEquipment,
  profile: NhSelectedGearProfile
): Readonly<Record<NhCandidateVisibleStyle, VisibleEquipment>> {
  return {
    magic: applyExpectedStyleEquipment(currentEquipment, profile, "magic"),
    ranged: applyExpectedStyleEquipment(currentEquipment, profile, "ranged"),
    slash: applyExpectedStyleEquipment(currentEquipment, profile, "melee")
  };
}

export function nhGearProfileActionEquipment(input: {
  readonly currentEquipment: VisibleEquipment;
  readonly profile: NhSelectedGearProfile;
  readonly action: NhPolicyAction;
  readonly threatStyle: NhOffenceStyle | null;
  readonly underPressure: boolean;
  readonly hitpoints: number;
  readonly allowFlexibleGear?: boolean;
  readonly flexibleGearPasses?: number;
}): VisibleEquipment {
  let equipment = applyJavaStyleLoadout(input.currentEquipment, input.profile, { ...input.action, specIntent: "none" });
  if (input.allowFlexibleGear ?? true) {
    const passes = Math.max(1, Math.trunc(input.flexibleGearPasses ?? 1));
    for (let pass = 0; pass < passes; pass += 1) {
      equipment = optimizeFlexibleGear({
        equipment,
        profile: input.profile,
        threatStyle: input.threatStyle,
        underPressure: input.underPressure,
        hitpoints: input.hitpoints
      });
    }
  }
  if (input.action.offenceStyle === "magic") {
    equipment = {
      ...equipment,
      body: input.profile.magicChestItem,
      legs: input.profile.magicLegsItem
    };
  }
  if (input.action.specIntent !== "none" && nhGearProfileCanEquipGraniteMaul(input.profile)) {
    return {
      ...equipment,
      weapon: weaponItemById.granite_maul
    };
  }
  if (input.action.specIntent === "use_special" && nhGearProfileCanEquipArmadylGodsword(input.profile)) {
    const { shield: _shield, ...equipmentWithoutShield } = equipment;
    return {
      ...equipmentWithoutShield,
      weapon: weaponItemById.armadyl_godsword
    };
  }
  return equipment;
}

export function nhGearProfileWeaponIdForEquipment(equipment: VisibleEquipment): NhWeaponId | null {
  const weaponItemId = equipment.weapon?.itemId;
  if (weaponItemId === undefined) {
    return null;
  }
  for (const [weaponId, item] of Object.entries(weaponItemById) as [NhWeaponId, VisibleEquipmentItem][]) {
    if (item.itemId === weaponItemId) {
      return weaponId;
    }
  }
  return null;
}

export function isNhGraniteMaulItemId(itemId: number): boolean {
  return itemId === 4153 || itemId === 12848 || itemId === 20557;
}

export function isNhArmadylGodswordItemId(itemId: number): boolean {
  return itemId === 11802;
}

export function nhGearProfileCanEquipGraniteMaul(profile: NhSelectedGearProfile): boolean {
  return profile.ownedItems.some((item) => isNhGraniteMaulItemId(item.itemId));
}

export function nhGearProfileCanEquipArmadylGodsword(profile: NhSelectedGearProfile): boolean {
  return profile.ownedItems.some((item) => isNhArmadylGodswordItemId(item.itemId));
}

export function nhGearProfileAvailableSpecialWeaponKind(
  profile: NhSelectedGearProfile
): "granite_maul" | "armadyl_godsword" | null {
  if (nhGearProfileCanEquipGraniteMaul(profile)) {
    return "granite_maul";
  }
  if (nhGearProfileCanEquipArmadylGodsword(profile)) {
    return "armadyl_godsword";
  }
  return null;
}

export function nhGearProfileForBotPreferredSource(
  sourceProfile: NhSelectedGearProfile,
  fallbackProfile: NhSelectedGearProfile
): NhSelectedGearProfile {
  return nhGearProfileUsableBotSourceProfile(sourceProfile) ?? fallbackProfile;
}

export function nhGearProfileUsableBotSourceProfile(sourceProfile: NhSelectedGearProfile): NhSelectedGearProfile | null {
  const normalizedSource = normalizeBotCommandLayoutProfile(sourceProfile);
  return nhGearProfileHasUsableBotLoadout(normalizedSource) ? normalizedSource : null;
}

export function nhGearProfileNormalizeBotSourceEquipment(equipment: VisibleEquipment): VisibleEquipment {
  if (equipment.weapon?.itemId !== vestaLongswordItemId) {
    return equipment;
  }
  return {
    ...equipment,
    weapon: weaponItemById.tentacle_whip
  };
}

function normalizeBotCommandLayoutProfile(profile: NhSelectedGearProfile): NhSelectedGearProfile {
  let normalized = normalizeBotCommandLayoutSpecialWeapon(normalizeBotCommandLayoutVesta(profile));
  if (!nhGearProfileCanEquipArmadylGodsword(normalized)) {
    // Source: NhStakerLoadout.normalizeBotCommandLayout() replaces Granite mauls
    // with Armadyl godsword and ensures an AGS exists in the NH stake template.
    normalized = {
      ...normalized,
      ownedItems: [...normalized.ownedItems, canonicalNhGear.armadylGodsword]
    };
  }
  return normalized;
}

function normalizeBotCommandLayoutSpecialWeapon(profile: NhSelectedGearProfile): NhSelectedGearProfile {
  if (!profile.ownedItems.some((item) => isNhGraniteMaulItemId(item.itemId))) {
    return profile;
  }
  const byId = new Map<number, VisibleEquipmentItem>();
  for (const item of profile.ownedItems) {
    const normalizedItem = isNhGraniteMaulItemId(item.itemId) ? weaponItemById.armadyl_godsword : item;
    byId.set(normalizedItem.itemId, normalizedItem);
  }
  return {
    ...profile,
    equipmentWeaponItemId: isNhGraniteMaulItemId(profile.equipmentWeaponItemId ?? -1)
      ? weaponItemById.armadyl_godsword.itemId
      : profile.equipmentWeaponItemId,
    ownedItems: [...byId.values()]
  };
}

function normalizeBotCommandLayoutVesta(profile: NhSelectedGearProfile): NhSelectedGearProfile {
  if (!profile.ownedItems.some((item) => item.itemId === vestaLongswordItemId)) {
    return profile;
  }
  const byId = new Map<number, VisibleEquipmentItem>();
  for (const item of profile.ownedItems) {
    const normalizedItem = item.itemId === vestaLongswordItemId ? weaponItemById.tentacle_whip : item;
    byId.set(normalizedItem.itemId, normalizedItem);
  }
  // Source: NhStakerLoadout.normalizeBotCommandLayout() replaces Vesta's
  // longsword with pickEquipable(MELEE_WEAPON_CANDIDATES, ABYSSAL_TENTACLE).
  return {
    ...profile,
    meleeWeaponId: "tentacle_whip",
    equipmentWeaponItemId:
      profile.equipmentWeaponItemId === vestaLongswordItemId ? weaponItemById.tentacle_whip.itemId : profile.equipmentWeaponItemId,
    ownedItems: [...byId.values()]
  };
}

function nhGearProfileHasUsableBotLoadout(profile: NhSelectedGearProfile): boolean {
  // Source: NhStakerLoadout.hasUsableBotLoadout() requires a populated saved
  // equipment/inventory template, an equipped weapon, all three style weapons,
  // and an equipable special weapon before the bot accepts a copied command layout.
  return (
    profile.equipmentItemCount >= 8 &&
    profile.inventoryItemCount >= 12 &&
    profile.equipmentWeaponItemId !== null &&
    javaBotMagicWeaponCandidates.includes(profile.magicWeaponId) &&
    javaBotRangedWeaponCandidates.includes(profile.rangedWeaponId) &&
    javaBotMeleeWeaponCandidates.includes(profile.meleeWeaponId) &&
    nhGearProfileOwnsWeapon(profile, profile.magicWeaponId) &&
    nhGearProfileOwnsWeapon(profile, profile.rangedWeaponId) &&
    nhGearProfileOwnsWeapon(profile, profile.meleeWeaponId) &&
    nhGearProfileAvailableSpecialWeaponKind(profile) !== null
  );
}

function nhGearProfileOwnsWeapon(profile: NhSelectedGearProfile, weaponId: NhWeaponId): boolean {
  const itemId = weaponItemById[weaponId]?.itemId;
  return itemId !== undefined && profile.ownedItems.some((item) => item.itemId === itemId);
}

function collectProfileOwnedItems(
  equipment: VisibleEquipment,
  previousProfile: NhSelectedGearProfile | undefined,
  inventoryItems: readonly VisibleEquipmentItem[] | undefined,
  strictInventory: boolean
): readonly VisibleEquipmentItem[] {
  const byId = new Map<number, VisibleEquipmentItem>();
  const add = (item: VisibleEquipmentItem | undefined): void => {
    if (item) {
      byId.set(item.itemId, item);
    }
  };

  for (const item of Object.values(equipment)) {
    add(item);
  }
  // Source: NhStakerBot.collectSlotCandidates() looks at the currently equipped slot
  // plus the live inventory. Canonical defaults are only for trainer fixtures without
  // a visible inventory feed.
  if (inventoryItems) {
    for (const item of inventoryItems) {
      add(item);
    }
    return [...byId.values()];
  }
  if (previousProfile) {
    for (const item of previousProfile.ownedItems) {
      add(item);
    }
  }
  if (strictInventory) {
    return [...byId.values()];
  }
  for (const loadout of Object.values(canonicalNhLoadoutEquipment)) {
    for (const item of Object.values(loadout)) {
      add(item);
    }
  }
  return [...byId.values()];
}

function collectStyleSelectionItems(
  equipment: VisibleEquipment,
  inventoryItems: readonly VisibleEquipmentItem[] | undefined,
  ownedItems: readonly VisibleEquipmentItem[]
): readonly VisibleEquipmentItem[] {
  if (!inventoryItems) {
    return ownedItems;
  }
  const byId = new Map<number, VisibleEquipmentItem>();
  const add = (item: VisibleEquipmentItem | undefined): void => {
    if (item) {
      byId.set(item.itemId, item);
    }
  };

  // Source: NhStakerLoadout.pickOwnedBestForSlot() scans inventory before
  // equipment and only replaces the best item on strictly higher styleScore.
  for (const item of inventoryItems) {
    add(item);
  }
  for (const item of Object.values(equipment)) {
    add(item);
  }
  return [...byId.values()];
}

function countVisibleEquipmentItems(equipment: VisibleEquipment): number {
  return Object.values(equipment).filter((item) => item !== undefined).length;
}

function pickOwnedWeapon(
  ownedItems: readonly VisibleEquipmentItem[],
  candidates: readonly NhWeaponId[],
  fallback: NhWeaponId
): NhWeaponId {
  const ownedIds = new Set(ownedItems.map((item) => item.itemId));
  return candidates.find((weaponId) => ownedIds.has(weaponItemById[weaponId].itemId)) ?? fallback;
}

function pickOwnedBestForSlot(
  ownedItems: readonly VisibleEquipmentItem[],
  slot: EquipmentSlot,
  style: NhOffenceStyle,
  fallback: VisibleEquipmentItem
): VisibleEquipmentItem {
  let best = fallback;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const item of ownedItems) {
    if (slotForItem(item) !== slot) {
      continue;
    }
    const score = styleScore(item, style);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

function applyExpectedStyleEquipment(
  currentEquipment: VisibleEquipment,
  profile: NhSelectedGearProfile,
  style: NhOffenceStyle
): VisibleEquipment {
  const equipment: Partial<Record<EquipmentSlot, VisibleEquipmentItem>> = { ...currentEquipment };
  if (style === "magic") {
    equipment.weapon = weaponItemById[profile.magicWeaponId];
    equipment.shield = profile.magicShieldItem;
    equipment.cape = profile.magicCapeItem;
    equipment.amulet = profile.magicAmuletItem;
    equipment.body = profile.magicChestItem;
    equipment.legs = profile.magicLegsItem;
  } else if (style === "ranged") {
    equipment.weapon = weaponItemById[profile.rangedWeaponId];
    equipment.shield = profile.rangedShieldItem;
    equipment.ammo = profile.rangedAmmoItem;
    equipment.cape = profile.rangedCapeItem;
    equipment.amulet = profile.rangedAmuletItem;
    equipment.body = profile.rangedChestItem;
    equipment.legs = profile.rangedLegsItem;
  } else {
    equipment.weapon = weaponItemById[profile.meleeWeaponId];
    equipment.shield = profile.meleeShieldItem;
    equipment.cape = profile.meleeCapeItem;
    equipment.amulet = profile.meleeAmuletItem;
    equipment.body = profile.meleeChestItem;
    equipment.legs = profile.meleeLegsItem;
  }
  return equipment;
}

function applyJavaStyleLoadout(
  currentEquipment: VisibleEquipment,
  profile: NhSelectedGearProfile,
  action: NhPolicyAction
): VisibleEquipment {
  if (action.offenceStyle === "magic") {
    return {
      ...currentEquipment,
      weapon: weaponItemById[profile.magicWeaponId],
      shield: profile.magicShieldItem,
      body: profile.magicChestItem,
      legs: profile.magicLegsItem
    };
  }

  if (action.offenceStyle === "ranged") {
    return {
      ...currentEquipment,
      weapon: weaponItemById[profile.rangedWeaponId],
      shield: profile.rangedShieldItem,
      ammo: profile.rangedAmmoItem
    };
  }

  return {
    ...currentEquipment,
    weapon: weaponItemById[profile.meleeWeaponId],
    shield: profile.meleeShieldItem
  };
}

function optimizeFlexibleGear(input: {
  readonly equipment: VisibleEquipment;
  readonly profile: NhSelectedGearProfile;
  readonly threatStyle: NhOffenceStyle | null;
  readonly underPressure: boolean;
  readonly hitpoints: number;
}): VisibleEquipment {
  let swaps = 0;
  let equipment: Partial<Record<EquipmentSlot, VisibleEquipmentItem>> = { ...input.equipment };
  for (const slot of flexibleGearSlots) {
    const candidate = selectFlexibleItemForSlot({
      slot,
      profile: input.profile,
      currentItem: equipment[slot],
      threatStyle: input.threatStyle,
      underPressure: input.underPressure,
      hitpoints: input.hitpoints
    });
    if (!candidate || candidate.itemId === equipment[slot]?.itemId) {
      continue;
    }
    equipment = { ...equipment, [slot]: candidate };
    swaps += 1;
    if (swaps >= 3) {
      break;
    }
  }
  return equipment;
}

const flexibleGearSlots = [
  "head",
  "cape",
  "amulet",
  "body",
  "legs",
  "hands",
  "feet",
  "ring"
] as const satisfies readonly EquipmentSlot[];

function selectFlexibleItemForSlot(input: {
  readonly slot: EquipmentSlot;
  readonly profile: NhSelectedGearProfile;
  readonly currentItem: VisibleEquipmentItem | undefined;
  readonly threatStyle: NhOffenceStyle | null;
  readonly underPressure: boolean;
  readonly hitpoints: number;
}): VisibleEquipmentItem | null {
  const candidates = input.profile.ownedItems.filter((item) => slotForItem(item) === input.slot);
  if (input.currentItem && !candidates.some((item) => item.itemId === input.currentItem?.itemId)) {
    candidates.unshift(input.currentItem);
  }
  if (candidates.length <= 1) {
    return null;
  }

  let best = candidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const score = flexibleItemUtility(candidate, input.threatStyle, input.underPressure, input.hitpoints);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function flexibleItemUtility(
  item: VisibleEquipmentItem,
  threatStyle: NhOffenceStyle | null,
  underPressure: boolean,
  hp: number
): number {
  const bonuses = equipmentRowByItemId.get(item.itemId)?.bonuses;
  if (!bonuses) {
    return 0;
  }
  let defenceWeight = underPressure ? 1.2 : 0.68;
  if (hp <= 45) {
    defenceWeight *= 1.25;
  } else if (hp <= 65) {
    defenceWeight *= 1.12;
  }
  return defenceScoreAgainstThreat(threatStyle, bonuses) * defenceWeight + bonuses.prayer_bonus * 0.08;
}

function styleScore(item: VisibleEquipmentItem, style: NhOffenceStyle): number {
  const bonuses = equipmentRowByItemId.get(item.itemId)?.bonuses;
  if (!bonuses) {
    return 0;
  }
  if (style === "magic") {
    return bonuses.magic_attack_bonus * 100 + bonuses.magic_damage_bonus * 30 + bonuses.magic_defence_bonus * 15 + bonuses.prayer_bonus;
  }
  if (style === "ranged") {
    return bonuses.range_attack_bonus * 100 + bonuses.ranged_strength_bonus * 35 + bonuses.range_defence_bonus * 15 + bonuses.prayer_bonus;
  }
  return (
    Math.max(bonuses.stab_attack_bonus, bonuses.slash_attack_bonus, bonuses.crush_attack_bonus) * 100 +
    bonuses.melee_strength_bonus * 35 +
    Math.max(bonuses.stab_defence_bonus, bonuses.slash_defence_bonus, bonuses.crush_defence_bonus) * 15 +
    bonuses.prayer_bonus
  );
}

function defenceScoreAgainstThreat(style: NhOffenceStyle | null, bonuses: BonusTable): number {
  if (style === null) {
    return 0;
  }
  if (style === "magic") {
    return bonuses.magic_defence_bonus;
  }
  if (style === "ranged") {
    return bonuses.range_defence_bonus;
  }
  return Math.max(bonuses.stab_defence_bonus, bonuses.slash_defence_bonus, bonuses.crush_defence_bonus);
}

function slotForItem(item: VisibleEquipmentItem): EquipmentSlot | undefined {
  const row = equipmentRowByItemId.get(item.itemId);
  return row ? equipmentSlotByCacheSlot[row.equipSlot] : undefined;
}
