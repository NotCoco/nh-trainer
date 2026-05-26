import kitsJson from "../generated/kits.json";
import serverItemsJson from "../generated/server-items.json";
import type { PrayerIcon, SkullIcon, VisibleEquipment } from "./clientView";

type PlayerBodyColors = readonly [number, number, number, number, number];

interface KronosKitDefinition {
  readonly id: number;
  readonly bodyPartId: number;
  readonly nonSelectable?: boolean;
}

interface KronosServerItemDefinition {
  readonly id: number;
  readonly equipSlot: number | null;
  readonly twoHanded?: boolean;
  readonly hideHair?: boolean;
  readonly hideBeard?: boolean;
  readonly hideArms?: boolean;
}

type KronosEquippedServerItemDefinition = KronosServerItemDefinition & { readonly equipSlot: number };

interface KronosAppearanceSequences {
  readonly ready: number;
  readonly turnLeft: number;
  readonly walk: number;
  readonly walkBack: number;
  readonly walkLeft: number;
  readonly walkRight: number;
  readonly run: number;
}

export interface KronosClientAppearancePacketOptions {
  readonly equipment: VisibleEquipment;
  readonly bodyColors?: PlayerBodyColors;
  readonly gender?: 0 | 1;
  readonly skullIcon?: SkullIcon;
  readonly prayerIcon?: PrayerIcon;
  readonly sequences?: Partial<KronosAppearanceSequences>;
  readonly username?: string;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly combatLevel?: number;
  readonly skillLevel?: number;
  readonly hidden?: boolean;
}

const kits = kitsJson as Record<string, KronosKitDefinition>;
const serverItems = serverItemsJson as readonly KronosServerItemDefinition[];
const serverItemById = new Map(serverItems.map((item) => [item.id, item]));

const defaultBodyColors = [0, 0, 0, 0, 0] as const satisfies PlayerBodyColors;
const defaultSequences = {
  ready: 808,
  turnLeft: 823,
  walk: 819,
  walkBack: 820,
  walkLeft: 821,
  walkRight: 822,
  run: 824
} as const satisfies KronosAppearanceSequences;

const defaultMaleBodyParts = [
  { bodyPartId: 0, equipmentSlot: 8 },
  { bodyPartId: 1, equipmentSlot: 11 },
  { bodyPartId: 2, equipmentSlot: 4 },
  { bodyPartId: 3, equipmentSlot: 6 },
  { bodyPartId: 4, equipmentSlot: 9 },
  { bodyPartId: 5, equipmentSlot: 7 },
  { bodyPartId: 6, equipmentSlot: 10 }
] as const;

export function createKronosClientAppearancePacket(
  options: KronosClientAppearancePacketOptions
): readonly number[] {
  const bytes: number[] = [];
  const sequences = { ...defaultSequences, ...options.sequences };

  pushByte(bytes, options.gender ?? 0);
  pushByte(bytes, headIconPk(options.skullIcon ?? "none"));
  pushByte(bytes, headIconPrayer(options.prayerIcon ?? "none"));

  for (const encoded of kronosAppearanceEquipmentSlots(options.equipment)) {
    if (encoded === 0) {
      pushByte(bytes, 0);
    } else {
      pushUnsignedShort(bytes, encoded);
    }
  }

  for (const color of options.bodyColors ?? defaultBodyColors) {
    pushByte(bytes, color);
  }

  for (const sequence of [
    sequences.ready,
    sequences.turnLeft,
    sequences.walk,
    sequences.walkBack,
    sequences.walkLeft,
    sequences.walkRight,
    sequences.run
  ]) {
    pushUnsignedShort(bytes, sequence < 0 ? 65535 : sequence);
  }

  pushString(bytes, options.username ?? "");
  pushString(bytes, options.prefix ?? "");
  pushString(bytes, options.suffix ?? "");
  pushByte(bytes, options.combatLevel ?? 126);
  pushUnsignedShort(bytes, options.skillLevel ?? 0);
  pushByte(bytes, options.hidden ? 1 : 0);
  return bytes;
}

export function kronosAppearanceEquipmentSlots(equipment: VisibleEquipment): readonly number[] {
  const hiddenKitSlots = new Set<number>();
  const equipmentSlots = new Array<number>(12).fill(0);
  const equippedServerItems: KronosEquippedServerItemDefinition[] = [];

  for (const item of Object.values(equipment)) {
    const serverItem = item ? serverItemById.get(item.itemId) : undefined;
    if (!serverItem || !isPlayerAppearanceSlot(serverItem.equipSlot)) {
      continue;
    }
    const equippedServerItem = serverItem as KronosEquippedServerItemDefinition;
    equippedServerItems.push(equippedServerItem);
    markHiddenBodyKitSlots(hiddenKitSlots, equippedServerItem);
  }

  for (const bodyPart of defaultMaleBodyParts) {
    if (!hiddenKitSlots.has(bodyPart.equipmentSlot)) {
      equipmentSlots[bodyPart.equipmentSlot] = selectableKitId(bodyPart.bodyPartId) + 256;
    }
  }

  for (const item of Object.values(equipment)) {
    const serverItem = item ? serverItemById.get(item.itemId) : undefined;
    if (serverItem && isPlayerAppearanceSlot(serverItem.equipSlot)) {
      equipmentSlots[(serverItem as KronosEquippedServerItemDefinition).equipSlot] = item.itemId + 512;
    }
  }
  clearInvalidTwoHandedAppearanceSlots(equipmentSlots, equippedServerItems);

  return equipmentSlots;
}

function selectableKitId(bodyPartId: number): number {
  const kit = Object.values(kits).find(
    (candidate) => candidate.bodyPartId === bodyPartId && !candidate.nonSelectable
  );
  if (!kit) {
    throw new Error(`missing selectable male kit for body part ${bodyPartId}`);
  }
  return kit.id;
}

function isPlayerAppearanceSlot(slot: number | null): slot is number {
  return Number.isInteger(slot) && slot !== null && slot >= 0 && slot < 12;
}

function markHiddenBodyKitSlots(hiddenKitSlots: Set<number>, serverItem: KronosEquippedServerItemDefinition): void {
  hiddenKitSlots.add(serverItem.equipSlot);
  if (serverItem.equipSlot === 0 && serverItem.hideHair) {
    hiddenKitSlots.add(8);
  }
  if (serverItem.equipSlot === 0 && serverItem.hideBeard) {
    hiddenKitSlots.add(11);
  }
  if (serverItem.equipSlot === 4 && serverItem.hideArms) {
    hiddenKitSlots.add(6);
  }
}

function clearInvalidTwoHandedAppearanceSlots(
  equipmentSlots: number[],
  equippedServerItems: readonly KronosEquippedServerItemDefinition[]
): void {
  const weapon = equippedServerItems.find((item) => item.equipSlot === 3);
  if (weapon?.twoHanded) {
    equipmentSlots[5] = 0;
  }
}

function headIconPk(icon: SkullIcon): number {
  if (icon === "white_pk") {
    return 0;
  }
  if (icon === "red_pk") {
    return 1;
  }
  return -1;
}

function headIconPrayer(icon: PrayerIcon): number {
  if (icon === "protect_from_melee") {
    return 0;
  }
  if (icon === "protect_from_missiles") {
    return 1;
  }
  if (icon === "protect_from_magic") {
    return 2;
  }
  if (icon === "retribution") {
    return 3;
  }
  if (icon === "smite") {
    return 4;
  }
  if (icon === "redemption") {
    return 5;
  }
  return -1;
}

function pushByte(bytes: number[], value: number): void {
  bytes.push(value & 0xff);
}

function pushUnsignedShort(bytes: number[], value: number): void {
  pushByte(bytes, value >> 8);
  pushByte(bytes, value);
}

function pushString(bytes: number[], value: string): void {
  for (const char of value) {
    pushByte(bytes, char.charCodeAt(0));
  }
  pushByte(bytes, 0);
}
