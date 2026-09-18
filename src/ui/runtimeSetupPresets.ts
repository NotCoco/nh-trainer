// Mode-owned starting gear, spellbooks, inventories, and supply accounting.
import {
  type NhSpellbookId
} from "../render/nhFixedLayout";
import {
  type RuntimeInventorySlot,
  type RuntimeLoadoutId
} from "../render/runtimeScene";
import {
  normalizeNhInventorySlots
} from "../render/nhInventory";
import {
  consumableItemIdForDoseCount,
  consumableDefinitions,
  consumableUseCountForItemId,
  nhDirectGearActionSlot,
  type ConsumableId,
  type RuntimePlayerCombatActorState,
  type RuntimePlayerCombatSupplies,
  type RuntimePolicyOpponentResult
} from "../sim";
import type { EquipmentSlot, VisibleEquipment } from "../sim/clientView";
import {
  riskFightCandidateLabel
} from "../bot";

export type RuntimeEquipmentItemIdsBySlot = ReadonlyMap<number, number>;
export type RuntimeTrainerSetupId = "nh-stake" | "dmm" | "webweaver";
export interface RuntimeDmmSetupOptions {
  readonly graniteMaul: boolean;
  readonly armadylGodsword: boolean;
}
export interface RuntimeTrainerSetupPreset {
  readonly id: RuntimeTrainerSetupId;
  readonly label: string;
  readonly loadoutId: RuntimeLoadoutId;
  readonly spellbookId: NhSpellbookId;
  readonly inventorySlots: readonly (RuntimeInventorySlot | null)[];
  readonly equipmentEntries: readonly (readonly [number, number])[];
}

export const RUNTIME_NH_STAKE_LOADOUT_ID: RuntimeLoadoutId = "kodai-robes";
export const RUNTIME_MANTA_RAY_ITEM_ID = 391;
export const RUNTIME_GRANITE_MAUL_ITEM_ID = 4153;
export const RUNTIME_DMM_GRANITE_MAUL_ITEM_ID = 24225;
export const RUNTIME_ARMADYL_GODSWORD_ITEM_ID = 11802;
export const RUNTIME_VENGEANCE_TRINKET_ITEM_ID = 28561;
export const RUNTIME_NH_STAKE_INVENTORY_ITEM_IDS = [
  12695,
  22461,
  6685,
  6685,
  13441,
  391,
  391,
  10925,
  391,
  6685,
  391,
  10925,
  4736,
  21902,
  391,
  391,
  4759,
  22322,
  391,
  391,
  11802,
  12006,
  391,
  391,
  391,
  391,
  391,
  12791
] as const;
export const RUNTIME_NH_STAKE_EQUIPMENT_ENTRIES = [
  [0, 10828],
  [1, 21791],
  [2, 6585],
  [3, 11791],
  [4, 4091],
  [5, 12831],
  [7, 4093],
  [9, 7462],
  [10, 11840],
  [12, 11770],
  [13, 21932]
] as const satisfies readonly (readonly [number, number])[];
export const RUNTIME_NH_STAKE_INVENTORY_SLOTS = normalizeNhInventorySlots(
  RUNTIME_NH_STAKE_INVENTORY_ITEM_IDS.map((itemId) => ({ itemId, quantity: 1 }))
);
export const RUNTIME_DMM_CAPTURED_INVENTORY_SLOTS = normalizeNhInventorySlots([
  { itemId: 12695, quantity: 1 },
  { itemId: 22461, quantity: 1 },
  { itemId: 10925, quantity: 1 },
  { itemId: 10925, quantity: 1 },
  { itemId: 13441, quantity: 1 },
  { itemId: 391, quantity: 1 },
  { itemId: 6685, quantity: 1 },
  { itemId: 10925, quantity: 1 },
  { itemId: 391, quantity: 1 },
  { itemId: 391, quantity: 1 },
  { itemId: 6685, quantity: 1 },
  { itemId: 6685, quantity: 1 },
  { itemId: 27238, quantity: 1 },
  { itemId: 26374, quantity: 1 },
  { itemId: 391, quantity: 1 },
  { itemId: 391, quantity: 1 },
  { itemId: 26386, quantity: 1 },
  { itemId: 11283, quantity: 1 },
  { itemId: 29796, quantity: 1 },
  { itemId: 391, quantity: 1 },
  { itemId: 7462, quantity: 1 },
  { itemId: 22613, quantity: 1 },
  { itemId: 27690, quantity: 1 },
  { itemId: 391, quantity: 1 },
  { itemId: 28561, quantity: 2 },
  { itemId: 391, quantity: 1 },
  { itemId: 391, quantity: 1 },
  { itemId: 12791, quantity: 1 }
]);
export const RUNTIME_DMM_GRANITE_MAUL_SLOT_INDEX = 23;
export const RUNTIME_DMM_ARMADYL_GODSWORD_SLOT_INDEX = 25;
export const RUNTIME_DMM_DEFAULT_SETUP_OPTIONS: RuntimeDmmSetupOptions = {
  graniteMaul: true,
  armadylGodsword: false
};
export const RUNTIME_DMM_EQUIPMENT_ENTRIES = [
  [0, 26382],
  [1, 21791],
  [2, 6585],
  [3, 22647],
  [4, 26243],
  [5, 27251],
  [7, 26245],
  [9, 31106],
  [10, 31097],
  [12, 19710],
  [13, 21950]
] as const satisfies readonly (readonly [number, number])[];
// Source: Webweaver (risk fighting) loadout - webweaver bow (u) main, recoil worn,
// ultor ring + pies + potions + pouch + brews + sanfews + ornate gmaul + elder maul
// in inventory, 4 halibut and the remaining slots filled with marlins. No head slot.
export const RUNTIME_WEBWEAVER_INVENTORY_ITEM_IDS = [
  28307, // Ultor ring
  7218, // Summer pie
  7218,
  2550, // Spare ring of recoil
  11722, // Super ranging (4)
  12695, // Super combat potion (4)
  12791, // Rune pouch (astral/death/earth for vengeance)
  6685, // Saradomin brew (4)
  6685,
  10925, // Sanfew serum (4)
  10925,
  24225, // Granite maul (ornate handle)
  21003, // Elder maul
  32336, // Halibut
  32336,
  32336,
  32336,
  32352, // Marlin
  32352,
  32352,
  32352,
  32352,
  32352,
  32352,
  32352,
  32352,
  32352,
  32352
] as const;
export const RUNTIME_WEBWEAVER_EQUIPMENT_ENTRIES = [
  [1, 21295], // Infernal cape
  [2, 29801], // Amulet of rancour
  [3, 27652], // Webweaver bow (u)
  [7, 23246], // Fremennik kilt
  [9, 7462], // Barrows gloves
  [10, 31097], // Avernic treads (max)
  [12, 2550] // Ring of recoil
] as const satisfies readonly (readonly [number, number])[];
export const RUNTIME_WEBWEAVER_INVENTORY_SLOTS = normalizeNhInventorySlots(
  RUNTIME_WEBWEAVER_INVENTORY_ITEM_IDS.map((itemId) => ({ itemId, quantity: 1 }))
);
// Source: Lunar Vengeance costs 4 astral, 2 death, 10 earth runes per cast. The
// pouch starts with enough for several casts so rune management matters.
export const RUNTIME_WEBWEAVER_POUCH_RUNES = {
  astral: 40,
  death: 20,
  earth: 100
} as const;
export const RUNTIME_WEBWEAVER_VENGEANCE_RUNE_COST = {
  astral: 4,
  death: 2,
  earth: 10
} as const;
export const RUNTIME_WEBWEAVER_VENGEANCE_RUNE_CASTS = 10;
export const RUNTIME_WEBWEAVER_LOADOUT_ID: RuntimeLoadoutId = "acb-hides";
export const RUNTIME_TRAINER_SETUP_PRESETS = {
  "nh-stake": {
    id: "nh-stake",
    label: "NH stake",
    loadoutId: RUNTIME_NH_STAKE_LOADOUT_ID,
    spellbookId: "ancient",
    inventorySlots: RUNTIME_NH_STAKE_INVENTORY_SLOTS,
    equipmentEntries: RUNTIME_NH_STAKE_EQUIPMENT_ENTRIES
  },
  dmm: {
    id: "dmm",
    label: "DMM",
    loadoutId: RUNTIME_NH_STAKE_LOADOUT_ID,
    spellbookId: "ancient",
    inventorySlots: RUNTIME_DMM_CAPTURED_INVENTORY_SLOTS,
    equipmentEntries: RUNTIME_DMM_EQUIPMENT_ENTRIES
  },
  webweaver: {
    id: "webweaver",
    label: riskFightCandidateLabel,
    loadoutId: RUNTIME_WEBWEAVER_LOADOUT_ID,
    spellbookId: "lunar",
    inventorySlots: RUNTIME_WEBWEAVER_INVENTORY_SLOTS,
    equipmentEntries: RUNTIME_WEBWEAVER_EQUIPMENT_ENTRIES
  }
} as const satisfies Readonly<Record<RuntimeTrainerSetupId, RuntimeTrainerSetupPreset>>;
export function runtimeSetupPreset(setupId: RuntimeTrainerSetupId): RuntimeTrainerSetupPreset {
  return RUNTIME_TRAINER_SETUP_PRESETS[setupId];
}

export function runtimeDmmInventorySlotsWithOptions(
  options: RuntimeDmmSetupOptions = RUNTIME_DMM_DEFAULT_SETUP_OPTIONS
): readonly (RuntimeInventorySlot | null)[] {
  const slots = [...normalizeNhInventorySlots(RUNTIME_DMM_CAPTURED_INVENTORY_SLOTS)];
  if (options.graniteMaul) {
    runtimeDmmReplacePreferredMantaSlot(slots, RUNTIME_DMM_GRANITE_MAUL_SLOT_INDEX, RUNTIME_DMM_GRANITE_MAUL_ITEM_ID);
  }
  if (options.armadylGodsword) {
    runtimeDmmReplacePreferredMantaSlot(slots, RUNTIME_DMM_ARMADYL_GODSWORD_SLOT_INDEX, RUNTIME_ARMADYL_GODSWORD_ITEM_ID);
  }
  return slots;
}

export function runtimeDmmSetupOptionItemId(key: keyof RuntimeDmmSetupOptions): number {
  return key === "graniteMaul" ? RUNTIME_DMM_GRANITE_MAUL_ITEM_ID : RUNTIME_ARMADYL_GODSWORD_ITEM_ID;
}

export function runtimeDmmSetupOptionPreferredSlotIndex(key: keyof RuntimeDmmSetupOptions): number {
  return key === "graniteMaul" ? RUNTIME_DMM_GRANITE_MAUL_SLOT_INDEX : RUNTIME_DMM_ARMADYL_GODSWORD_SLOT_INDEX;
}

export function runtimeDmmReplacePreferredMantaSlot(
  slots: (RuntimeInventorySlot | null)[],
  preferredSlotIndex: number,
  itemId: number
): boolean {
  const preferredSlot = slots[preferredSlotIndex];
  const slotIndex = preferredSlot?.itemId === RUNTIME_MANTA_RAY_ITEM_ID
    ? preferredSlotIndex
    : slots.findIndex((slot) => slot?.itemId === RUNTIME_MANTA_RAY_ITEM_ID);
  if (slotIndex === -1) {
    return false;
  }
  slots[slotIndex] = { itemId, quantity: 1 };
  return true;
}

export function runtimeDmmInventorySlotsAfterOptionToggle(
  currentSlots: readonly (RuntimeInventorySlot | null)[],
  key: keyof RuntimeDmmSetupOptions,
  enabled: boolean
): readonly (RuntimeInventorySlot | null)[] {
  const slots = [...normalizeNhInventorySlots(currentSlots)];
  const itemId = runtimeDmmSetupOptionItemId(key);
  const existingSlotIndexes = slots
    .map((slot, index) => slot?.itemId === itemId ? index : -1)
    .filter((index) => index !== -1);

  if (!enabled) {
    for (const slotIndex of existingSlotIndexes) {
      slots[slotIndex] = { itemId: RUNTIME_MANTA_RAY_ITEM_ID, quantity: 1 };
    }
    return normalizeNhInventorySlots(slots);
  }

  if (existingSlotIndexes.length > 0) {
    for (const duplicateSlotIndex of existingSlotIndexes.slice(1)) {
      slots[duplicateSlotIndex] = { itemId: RUNTIME_MANTA_RAY_ITEM_ID, quantity: 1 };
    }
    return normalizeNhInventorySlots(slots);
  }

  runtimeDmmReplacePreferredMantaSlot(slots, runtimeDmmSetupOptionPreferredSlotIndex(key), itemId);
  return normalizeNhInventorySlots(slots);
}

export function runtimeSetupInventorySlots(
  setupId: RuntimeTrainerSetupId,
  dmmOptions: RuntimeDmmSetupOptions = RUNTIME_DMM_DEFAULT_SETUP_OPTIONS
): readonly (RuntimeInventorySlot | null)[] {
  if (setupId === "dmm") {
    return runtimeDmmInventorySlotsWithOptions(dmmOptions);
  }
  return normalizeNhInventorySlots(runtimeSetupPreset(setupId).inventorySlots);
}

export function runtimeSetupEquipmentItems(setupId: RuntimeTrainerSetupId): RuntimeEquipmentItemIdsBySlot {
  return new Map(runtimeSetupPreset(setupId).equipmentEntries);
}

export function runtimeNhStakeInventorySlots(): readonly (RuntimeInventorySlot | null)[] {
  return runtimeSetupInventorySlots("nh-stake");
}

export function runtimeNhStakeEquipmentItems(): RuntimeEquipmentItemIdsBySlot {
  return runtimeSetupEquipmentItems("nh-stake");
}

export const RUNTIME_CONSUMABLE_IDS = Object.keys(consumableDefinitions) as ConsumableId[];
export const EMPTY_RUNTIME_SUPPLIES: RuntimePlayerCombatSupplies = {
  manta_ray: 0,
  shark: 0,
  anglerfish: 0,
  karambwan: 0,
  summer_pie: 0,
  halibut: 0,
  marlin: 0,
  saradomin_brew: 0,
  super_restore: 0,
  sanfew_serum: 0,
  super_combat: 0,
  super_ranging: 0,
  ranging_potion: 0,
  bastion: 0
};
export const RUNTIME_NH_STAKE_ALLOWED_SETUP_ITEM_IDS = new Set<number>([
  RUNTIME_GRANITE_MAUL_ITEM_ID,
  RUNTIME_DMM_GRANITE_MAUL_ITEM_ID,
  RUNTIME_ARMADYL_GODSWORD_ITEM_ID,
  ...Object.values(RUNTIME_TRAINER_SETUP_PRESETS).flatMap((setup) => [
    ...setup.inventorySlots.flatMap((slot) => slot ? [slot.itemId] : []),
    ...setup.equipmentEntries.map(([, itemId]) => itemId)
  ]),
  ...Object.values(RUNTIME_TRAINER_SETUP_PRESETS).flatMap((setup) => setup.inventorySlots).flatMap((slot) => {
    const itemId = slot?.itemId;
    if (itemId === undefined) {
      return [];
    }
    const consumableId = RUNTIME_CONSUMABLE_IDS.find((id) => consumableDefinitions[id].itemIds.includes(itemId));
    return consumableId ? consumableDefinitions[consumableId].itemIds : [itemId];
  })
]);

export function runtimeConsumableIdForItemId(itemId: number): ConsumableId | null {
  for (const id of RUNTIME_CONSUMABLE_IDS) {
    if (consumableDefinitions[id].itemIds.includes(itemId)) {
      return id;
    }
  }
  return null;
}

export function runtimeSuppliesFromInventorySlots(
  slots: readonly (RuntimeInventorySlot | null)[]
): RuntimePlayerCombatSupplies {
  // Source: sim/nh/duel.ts createSuppliesFromInventory() and runtime-policy-opponent.ts
  // runtimePolicySuppliesForInventorySlots() count usable supplies from the inventory container.
  const supplies: Record<ConsumableId, number> = { ...EMPTY_RUNTIME_SUPPLIES };
  for (const slot of slots) {
    if (!slot) {
      continue;
    }
    const item = runtimeConsumableIdForItemId(slot.itemId);
    if (item) {
      supplies[item] += consumableUseCountForItemId(slot.itemId, slot.quantity);
    }
  }
  return supplies;
}

export function runtimeVengeanceTrinketChargesFromInventorySlots(
  slots: readonly (RuntimeInventorySlot | null)[]
): number {
  return slots.reduce(
    (total, slot) =>
      slot?.itemId === RUNTIME_VENGEANCE_TRINKET_ITEM_ID
        ? total + Math.max(0, Math.trunc(slot.quantity))
        : total,
    0
  );
}

export function runtimeRecoilRingsRemaining(
  inventorySlots: readonly (RuntimeInventorySlot | null)[],
  equipment: RuntimeEquipmentItemIdsBySlot
): number {
  return Number(equipment.get(12) === 2550) + inventorySlots.reduce(
    (count, slot) => count + (slot?.itemId === 2550 ? Math.max(0, slot.quantity) : 0), 0
  );
}

export function runtimeNhStakeSupplies(): RuntimePlayerCombatSupplies {
  return runtimeSuppliesFromInventorySlots(RUNTIME_NH_STAKE_INVENTORY_SLOTS);
}

export function runtimeNhStakeVengeanceTrinketCharges(): number {
  return runtimeVengeanceTrinketChargesFromInventorySlots(RUNTIME_NH_STAKE_INVENTORY_SLOTS);
}

export function runtimeSetupInventorySlotsForSupplies(
  setupId: RuntimeTrainerSetupId,
  supplies: RuntimePlayerCombatSupplies,
  dmmOptions: RuntimeDmmSetupOptions = RUNTIME_DMM_DEFAULT_SETUP_OPTIONS
): readonly (RuntimeInventorySlot | null)[] {
  const remainingSupplies: Record<ConsumableId, number> = { ...supplies };
  return runtimeSetupInventorySlots(setupId, dmmOptions).map((slot) => {
    if (!slot) {
      return null;
    }

    const supply = runtimeConsumableIdForItemId(slot.itemId);
    if (!supply) {
      return slot;
    }
    if (remainingSupplies[supply] <= 0) {
      return null;
    }

    const slotUses = consumableUseCountForItemId(slot.itemId, slot.quantity);
    const visibleUses = Math.min(slotUses, remainingSupplies[supply]);
    remainingSupplies[supply] -= visibleUses;
    return {
      ...slot,
      itemId: consumableItemIdForDoseCount(supply, visibleUses, slot.itemId),
      quantity: 1
    };
  });
}

export function runtimeInventorySlotsAfterConsumedSupplies(
  inventorySlots: readonly (RuntimeInventorySlot | null)[],
  consumedSupplies: readonly ConsumableId[]
): readonly (RuntimeInventorySlot | null)[] {
  const slots = [...normalizeNhInventorySlots(inventorySlots)];
  for (const consumed of consumedSupplies) {
    const slotIndex = slots.findIndex((slot) => slot !== null && runtimeConsumableIdForItemId(slot.itemId) === consumed);
    if (slotIndex === -1) {
      continue;
    }
    const slot = slots[slotIndex]!;
    const remainingUses = consumableUseCountForItemId(slot.itemId, slot.quantity) - 1;
    slots[slotIndex] = remainingUses <= 0
      ? consumed === "summer_pie" ? { itemId: 2313, quantity: 1 } : null
      : {
          ...slot,
          itemId: consumableItemIdForDoseCount(consumed, remainingUses, slot.itemId),
          quantity: 1
        };
  }
  return slots;
}

export function runtimeInventorySlotsAfterVengeanceTrinketUse(
  inventorySlots: readonly (RuntimeInventorySlot | null)[],
  previousCharges: number,
  nextCharges: number
): readonly (RuntimeInventorySlot | null)[] {
  const slots = [...normalizeNhInventorySlots(inventorySlots)];
  let chargesConsumed = Math.max(0, Math.trunc(previousCharges) - Math.trunc(nextCharges));
  for (let slotIndex = 0; slotIndex < slots.length && chargesConsumed > 0; slotIndex += 1) {
    const slot = slots[slotIndex];
    if (slot?.itemId !== RUNTIME_VENGEANCE_TRINKET_ITEM_ID) {
      continue;
    }
    const consumedHere = Math.min(chargesConsumed, Math.max(0, Math.trunc(slot.quantity)));
    const remainingQuantity = Math.max(0, Math.trunc(slot.quantity) - consumedHere);
    slots[slotIndex] = remainingQuantity > 0 ? { ...slot, quantity: remainingQuantity } : null;
    chargesConsumed -= consumedHere;
  }
  return slots;
}

export function runtimeInventorySlotsAfterEquipmentChange(
  inventorySlots: readonly (RuntimeInventorySlot | null)[],
  previousEquipment: VisibleEquipment,
  nextEquipment: VisibleEquipment,
  preferredSlotOrder: readonly EquipmentSlot[] = []
): readonly (RuntimeInventorySlot | null)[] {
  const slots = [...normalizeNhInventorySlots(inventorySlots)];
  const equipmentSlotOrder = [...new Set([...preferredSlotOrder, ...RUNTIME_EQUIPMENT_SLOT_ORDER])];
  for (const equipmentSlot of equipmentSlotOrder) {
    const previousItem = previousEquipment[equipmentSlot];
    const nextItem = nextEquipment[equipmentSlot];
    if (previousItem?.itemId === nextItem?.itemId) {
      continue;
    }

    if (nextItem) {
      const selectedSlotIndex = slots.findIndex((slot) => slot?.itemId === nextItem.itemId);
      if (selectedSlotIndex === -1) {
        continue;
      }
      // Equipment.equip() swaps the worn item into the selected item's exact
      // inventory slot. An empty equipment slot leaves that same slot empty.
      slots[selectedSlotIndex] = previousItem ? { itemId: previousItem.itemId, quantity: 1 } : null;
      continue;
    }

    if (previousItem) {
      // Equipment.unequip() uses Inventory.freeSlot(), preserving every other slot.
      const freeSlotIndex = slots.findIndex((slot) => slot === null);
      if (freeSlotIndex !== -1) {
        slots[freeSlotIndex] = { itemId: previousItem.itemId, quantity: 1 };
      }
    }
  }
  return slots;
}

export function runtimePersistentOpponentInventorySlotsAfterPolicyResult(
  inventorySlots: readonly (RuntimeInventorySlot | null)[],
  previousActor: RuntimePlayerCombatActorState,
  result: RuntimePolicyOpponentResult
): readonly (RuntimeInventorySlot | null)[] {
  const afterSupplies = runtimeInventorySlotsAfterConsumedSupplies(inventorySlots, result.consumedSupplies);
  const afterTrinket = runtimeInventorySlotsAfterVengeanceTrinketUse(
    afterSupplies,
    previousActor.vengeanceTrinketCharges,
    result.state.actors.opponent.vengeanceTrinketCharges
  );
  const directGearSlotOrder = (result.effectiveAction.directGearActions ?? []).map(nhDirectGearActionSlot);
  return runtimeInventorySlotsAfterEquipmentChange(
    afterTrinket,
    previousActor.equipment,
    result.state.actors.opponent.equipment,
    directGearSlotOrder
  );
}

export const RUNTIME_EQUIPMENT_SLOT_ORDER: readonly EquipmentSlot[] = [
  "head",
  "cape",
  "amulet",
  "weapon",
  "body",
  "shield",
  "legs",
  "hands",
  "feet",
  "ring",
  "ammo"
];
