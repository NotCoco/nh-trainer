import type { RuntimeInventorySlot } from "./runtimeScene";
import type { NhMenuEntry } from "./nhContextMenu";
import type { NhSelectedSpell } from "./nhSceneObjects";

const gearSwitchSlots = [
  21006,
  21791,
  12002,
  4712,
  4714,
  12006,
  12954,
  6570,
  19553,
  11832,
  11834,
  4153
] as const;
const supplySlots = [
  3144,
  3144,
  3144,
  3144,
  385,
  385,
  385,
  385,
  6685,
  6685,
  3024,
  3024,
  12695,
  22461,
  22296
] as const;

const inventorySlotCount = 28;
const inventoryItemActionOpcodes = [33, 34, 35, 36, 37] as const;
const inventoryItemNameColorTag = "<col=ff9040>";
const inventorySpellTargetFlag = 16;
const emptyVialItemId = 229;
const drinkDoseTransitions = new Map<number, number>([
  [6685, 6687],
  [6687, 6689],
  [6689, 6691],
  [6691, emptyVialItemId],
  [3024, 3026],
  [3026, 3028],
  [3028, 3030],
  [3030, emptyVialItemId],
  [10925, 10927],
  [10927, 10929],
  [10929, 10931],
  [10931, emptyVialItemId],
  [12695, 12697],
  [12697, 12699],
  [12699, 12701],
  [12701, emptyVialItemId],
  [22461, 22464],
  [22464, 22467],
  [22467, 22470],
  [22470, emptyVialItemId]
]);

export const NH_INVENTORY_USE_OPCODE = 38;
export const NH_INVENTORY_USE_SELECTED_OPCODE = 31;
export const NH_INVENTORY_SPELL_SELECTED_OPCODE = 32;
export const NH_INVENTORY_EXAMINE_OPCODE = 1005;
export const NH_INVENTORY_WIDGET_ID = 9764864;

export const initialNhInventorySlots: readonly RuntimeInventorySlot[] = [...gearSwitchSlots, ...supplySlots].map(
  (itemId) => ({
    itemId,
    quantity: 1
  })
);

export function normalizeNhInventorySlots(
  slots: readonly (RuntimeInventorySlot | null)[] | undefined
): readonly (RuntimeInventorySlot | null)[] {
  const source = slots && slots.length > 0 ? slots : initialNhInventorySlots;
  return Array.from({ length: inventorySlotCount }, (_, index) => source[index] ?? null);
}

export interface NhInventoryQuantityText {
  readonly text: string;
  readonly color: string;
}

export interface NhInventoryItemDefinition {
  readonly id: number;
  readonly name: string;
  readonly stackable: boolean;
  readonly countObj?: readonly number[];
  readonly countCo?: readonly number[];
  readonly interfaceOptions: readonly (string | null)[];
  readonly equipmentOptions: readonly (string | null)[];
}

export interface NhInventoryEquipmentDefinition {
  readonly id: number;
  readonly name: string;
  readonly equipSlot: number | null;
  readonly weaponType: string | null;
  readonly twoHanded: boolean;
  readonly specialAttack: NhInventorySpecialAttackDefinition | null;
}

export interface NhInventorySpecialAttackDefinition {
  readonly drainPercent: number;
  readonly source: string;
}

export type NhInventoryItemDefinitionStore = ReadonlyMap<number, NhInventoryItemDefinition>;
export type NhInventoryEquipmentDefinitionStore = ReadonlyMap<number, NhInventoryEquipmentDefinition>;

export interface NhInventorySelectedItem {
  readonly itemId: number;
  readonly itemName: string;
  readonly slotIndex: number;
  readonly widgetId: number;
}

export type NhInventoryContextMenuEntry = NhMenuEntry & {
  readonly action: "inventory-action" | "inventory-use" | "inventory-use-selected" | "inventory-spell-selected" | "inventory-examine";
  readonly slotIndex: number;
  readonly widgetId: number;
  readonly itemId: number;
  readonly itemName: string;
  readonly actionIndex?: 0 | 1 | 2 | 3 | 4;
  readonly selectedItem?: NhInventorySelectedItem;
  readonly selectedSpell?: NhSelectedSpell;
};

export interface NhInventoryActionMutation {
  readonly kind: "eat-remove" | "drink-dose" | "empty-vial" | "drop-remove" | "equipment-swap";
  readonly slotIndex: number;
  readonly previousItemId: number;
  readonly nextItemId: number | null;
}

export interface NhInventoryDragMutation {
  readonly kind: "inventory-drag-swap";
  readonly sourceSlotIndex: number;
  readonly destinationSlotIndex: number;
  readonly sourceItemId: number;
  readonly destinationItemId: number | null;
}

export function nhInventoryQuantityText(
  quantity: number,
  itemDefinition: NhInventoryItemDefinition | undefined,
  quantityMode = 2
): NhInventoryQuantityText | null {
  const normalized = Math.trunc(quantity);
  if (normalized <= 1) {
    return null;
  }

  if (quantityMode <= 0 || (quantityMode === 2 && !itemDefinition?.stackable)) {
    return null;
  }

  if (normalized < 100000) {
    return { text: String(normalized), color: "#ffff00" };
  }
  if (normalized < 10000000) {
    return { text: `${Math.trunc(normalized / 1000)}K`, color: "#ffffff" };
  }
  return { text: `${Math.trunc(normalized / 1000000)}M`, color: "#00ff80" };
}

export function createNhInventoryItemDefinitionStore(source: unknown): NhInventoryItemDefinitionStore {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return new Map();
  }

  const entries: Array<readonly [number, NhInventoryItemDefinition]> = [];
  for (const value of Object.values(source)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const record = value as Record<string, unknown>;
    const id = typeof record.id === "number" && Number.isInteger(record.id) ? record.id : null;
    if (id === null || typeof record.name !== "string") {
      continue;
    }
    entries.push([
      id,
      {
        id,
        name: record.name,
        stackable: record.stackable === 1 || record.stackable === true,
        countObj: normalizeInventoryNumericArray(record.countObj),
        countCo: normalizeInventoryNumericArray(record.countCo),
        interfaceOptions: normalizeInventoryInterfaceOptions(record.interfaceOptions),
        equipmentOptions: normalizeEquipmentInterfaceOptions(record.params)
      }
    ]);
  }

  return new Map(entries);
}

export function createNhInventoryEquipmentDefinitionStore(source: unknown): NhInventoryEquipmentDefinitionStore {
  if (!Array.isArray(source)) {
    return new Map();
  }

  const entries: Array<readonly [number, NhInventoryEquipmentDefinition]> = [];
  for (const value of source) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const record = value as Record<string, unknown>;
    const id = typeof record.id === "number" && Number.isInteger(record.id) ? record.id : null;
    if (id === null || typeof record.name !== "string") {
      continue;
    }
    entries.push([
      id,
      {
        id,
        name: record.name,
        equipSlot: typeof record.equipSlot === "number" && Number.isInteger(record.equipSlot) ? record.equipSlot : null,
        weaponType: typeof record.weaponType === "string" ? record.weaponType : null,
        twoHanded: record.twoHanded === true,
        specialAttack: normalizeInventorySpecialAttack(record.specialAttack)
      }
    ]);
  }

  return new Map(entries);
}

function normalizeInventorySpecialAttack(source: unknown): NhInventorySpecialAttackDefinition | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  const record = source as Record<string, unknown>;
  if (typeof record.drainPercent !== "number" || !Number.isInteger(record.drainPercent)) {
    return null;
  }
  return {
    drainPercent: Math.max(0, Math.min(100, record.drainPercent)),
    source: typeof record.source === "string" ? record.source : "nh-server:combat.special.Special"
  };
}

export function buildNhInventoryContextEntries({
  slot,
  slotIndex,
  widgetId,
  itemDefinition,
  itemName,
  selectedItem,
  selectedSpell
}: {
  readonly slot: RuntimeInventorySlot;
  readonly slotIndex: number;
  readonly widgetId: number;
  readonly itemDefinition: NhInventoryItemDefinition | undefined;
  readonly itemName?: string;
  readonly selectedItem?: NhInventorySelectedItem | null;
  readonly selectedSpell?: NhSelectedSpell | null;
}): readonly NhInventoryContextMenuEntry[] {
  const normalizedSlotIndex = Math.max(0, Math.trunc(slotIndex));
  const normalizedWidgetId = Number.isInteger(widgetId) ? Math.trunc(widgetId) : NH_INVENTORY_WIDGET_ID;
  const name = itemDefinition?.name ?? itemName ?? `item ${slot.itemId}`;
  const targetText = `${inventoryItemNameColorTag}${name}`;
  const actions = normalizeInventoryInterfaceOptions(itemDefinition?.interfaceOptions);
  const entries: NhInventoryContextMenuEntry[] = [];

  if (selectedItem) {
    if (selectedItem.widgetId === normalizedWidgetId && selectedItem.slotIndex === normalizedSlotIndex) {
      return entries;
    }
    return [
      {
        actionText: "Use",
        targetText: `${inventoryItemNameColorTag}${selectedItem.itemName} <col=ffffff>-> ${targetText}`,
        opcode: NH_INVENTORY_USE_SELECTED_OPCODE,
        identifier: slot.itemId,
        argument1: normalizedSlotIndex,
        argument2: normalizedWidgetId,
        action: "inventory-use-selected",
        slotIndex: normalizedSlotIndex,
        widgetId: normalizedWidgetId,
        itemId: slot.itemId,
        itemName: name,
        selectedItem
      }
    ];
  }

  if (selectedSpell) {
    if ((selectedSpell.flags & inventorySpellTargetFlag) === inventorySpellTargetFlag) {
      return [
        {
          actionText: selectedSpell.actionName,
          targetText: `${selectedSpell.spellName} -> ${targetText}`,
          opcode: NH_INVENTORY_SPELL_SELECTED_OPCODE,
          identifier: slot.itemId,
          argument1: normalizedSlotIndex,
          argument2: normalizedWidgetId,
          action: "inventory-spell-selected",
          slotIndex: normalizedSlotIndex,
          widgetId: normalizedWidgetId,
          itemId: slot.itemId,
          itemName: name,
          selectedSpell
        }
      ];
    }
    return entries;
  }

  for (let actionIndex = 4; actionIndex >= 3; actionIndex -= 1) {
    const entry = inventoryActionEntry(actionIndex, actions, slot, normalizedSlotIndex, normalizedWidgetId, name, targetText);
    if (entry) {
      entries.push(entry);
    }
  }

  entries.push({
    actionText: "Use",
    targetText,
    opcode: NH_INVENTORY_USE_OPCODE,
    identifier: slot.itemId,
    argument1: normalizedSlotIndex,
    argument2: normalizedWidgetId,
    action: "inventory-use",
    slotIndex: normalizedSlotIndex,
    widgetId: normalizedWidgetId,
    itemId: slot.itemId,
    itemName: name
  });

  for (let actionIndex = 2; actionIndex >= 0; actionIndex -= 1) {
    const entry = inventoryActionEntry(actionIndex, actions, slot, normalizedSlotIndex, normalizedWidgetId, name, targetText);
    if (entry) {
      entries.push(entry);
    }
  }

  entries.push({
    actionText: "Examine",
    targetText,
    opcode: NH_INVENTORY_EXAMINE_OPCODE,
    identifier: slot.itemId,
    argument1: normalizedSlotIndex,
    argument2: normalizedWidgetId,
    action: "inventory-examine",
    slotIndex: normalizedSlotIndex,
    widgetId: normalizedWidgetId,
    itemId: slot.itemId,
    itemName: name
  });

  return entries;
}

export function mutateNhInventorySlotsForAction(
  slots: readonly (RuntimeInventorySlot | null)[],
  entry: NhInventoryContextMenuEntry
): { readonly slots: readonly (RuntimeInventorySlot | null)[]; readonly mutation: NhInventoryActionMutation | null } {
  if (entry.action !== "inventory-action") {
    return { slots, mutation: null };
  }

  const current = slots[entry.slotIndex];
  if (!current || current.itemId !== entry.itemId) {
    return { slots, mutation: null };
  }

  const action = entry.actionText.toLowerCase();
  if (action === "eat") {
    return replaceNhInventorySlot(slots, entry.slotIndex, null, "eat-remove", current.itemId);
  }
  if (action === "drop") {
    return replaceNhInventorySlot(slots, entry.slotIndex, null, "drop-remove", current.itemId);
  }
  if (action === "empty") {
    return replaceNhInventorySlot(slots, entry.slotIndex, { itemId: emptyVialItemId, quantity: 1 }, "empty-vial", current.itemId);
  }
  if (action === "drink") {
    const nextItemId = drinkDoseTransitions.get(current.itemId);
    if (!nextItemId) {
      return { slots, mutation: null };
    }
    return replaceNhInventorySlot(slots, entry.slotIndex, { itemId: nextItemId, quantity: 1 }, "drink-dose", current.itemId);
  }

  return { slots, mutation: null };
}

export function replaceNhInventorySlot(
  slots: readonly (RuntimeInventorySlot | null)[],
  slotIndex: number,
  nextSlot: RuntimeInventorySlot | null,
  kind: NhInventoryActionMutation["kind"],
  previousItemId: number
): { readonly slots: readonly (RuntimeInventorySlot | null)[]; readonly mutation: NhInventoryActionMutation } {
  const nextSlots = [...normalizeNhInventorySlots(slots)];
  nextSlots[slotIndex] = nextSlot;
  return {
    slots: nextSlots,
    mutation: {
      kind,
      slotIndex,
      previousItemId,
      nextItemId: nextSlot?.itemId ?? null
    }
  };
}

export function reorderNhInventorySlotsForDrag(
  slots: readonly (RuntimeInventorySlot | null)[],
  sourceSlotIndex: number,
  destinationSlotIndex: number
): { readonly slots: readonly (RuntimeInventorySlot | null)[]; readonly mutation: NhInventoryDragMutation | null } {
  const sourceIndex = Math.trunc(sourceSlotIndex);
  const destinationIndex = Math.trunc(destinationSlotIndex);
  if (
    sourceIndex < 0 ||
    sourceIndex >= inventorySlotCount ||
    destinationIndex < 0 ||
    destinationIndex >= inventorySlotCount ||
    sourceIndex === destinationIndex
  ) {
    return { slots: normalizeNhInventorySlots(slots), mutation: null };
  }

  const nextSlots = [...normalizeNhInventorySlots(slots)];
  const sourceSlot = nextSlots[sourceIndex];
  if (!sourceSlot) {
    return { slots: nextSlots, mutation: null };
  }

  const destinationSlot = nextSlots[destinationIndex] ?? null;
  nextSlots[destinationIndex] = sourceSlot;
  nextSlots[sourceIndex] = destinationSlot;
  return {
    slots: nextSlots,
    mutation: {
      kind: "inventory-drag-swap",
      sourceSlotIndex: sourceIndex,
      destinationSlotIndex: destinationIndex,
      sourceItemId: sourceSlot.itemId,
      destinationItemId: destinationSlot?.itemId ?? null
    }
  };
}

function inventoryActionEntry(
  actionIndex: number,
  actions: readonly (string | null)[],
  slot: RuntimeInventorySlot,
  slotIndex: number,
  widgetId: number,
  itemName: string,
  targetText: string
): NhInventoryContextMenuEntry | null {
  const actionText = actions[actionIndex] ?? (actionIndex === 4 ? "Drop" : null);
  if (!actionText) {
    return null;
  }
  const normalizedActionIndex = actionIndex as 0 | 1 | 2 | 3 | 4;

  return {
    actionText,
    targetText,
    opcode: inventoryItemActionOpcodes[normalizedActionIndex],
    identifier: slot.itemId,
    argument1: slotIndex,
    argument2: widgetId,
    action: "inventory-action",
    slotIndex,
    widgetId,
    itemId: slot.itemId,
    itemName,
    actionIndex: normalizedActionIndex
  };
}

function normalizeInventoryInterfaceOptions(source: unknown): readonly (string | null)[] {
  const options = Array.from({ length: 5 }, (_, index) => {
    if (!Array.isArray(source)) {
      return null;
    }
    const option = source[index];
    return typeof option === "string" && option.length > 0 ? option : null;
  });

  return options;
}

function normalizeEquipmentInterfaceOptions(source: unknown): readonly (string | null)[] {
  const options: Array<string | null> = ["Remove", null, null, null, null, null];
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return options;
  }

  const params = source as Record<string, unknown>;
  for (let paramId = 451; paramId <= 455; paramId += 1) {
    const value = params[String(paramId)];
    if (typeof value === "string" && value.length > 0) {
      options[(paramId - 451) + 1] = value;
    }
  }
  return options;
}

function normalizeInventoryNumericArray(source: unknown): readonly number[] | undefined {
  if (!Array.isArray(source)) {
    return undefined;
  }
  const values = source.map((value) => (typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0));
  return values.some((value) => value !== 0) ? values : undefined;
}
