import type { PrayerIcon, SkullIcon } from "../sim";

export type KronosPrayerOverheadIcon = Exclude<PrayerIcon, "none">;
export type KronosSkullOverheadIcon = Exclude<SkullIcon, "none">;
export type KronosOverheadIconKind = "prayer" | "skull";
export type KronosOverheadSpriteSheetId = "prayer_overheads" | "pk_skull";

export interface KronosOverheadIconDefinition {
  readonly key: string;
  readonly kind: KronosOverheadIconKind;
  readonly label: string;
  readonly headIconIndex: number;
  readonly spriteSheetId: KronosOverheadSpriteSheetId;
  readonly spriteId: number;
  readonly spriteFrame: number;
  readonly width: number;
  readonly height: number;
}

export interface KronosOverheadIconDefinitionStore {
  readonly prayers: ReadonlyMap<KronosPrayerOverheadIcon, KronosOverheadIconDefinition>;
  readonly skulls: ReadonlyMap<KronosSkullOverheadIcon, KronosOverheadIconDefinition>;
}

const defaultPrayerDefinitions = new Map<KronosPrayerOverheadIcon, KronosOverheadIconDefinition>([
  ["protect_from_melee", overhead("prayer", "protect_from_melee", "prayer_overheads", 440, 0, 0)],
  ["protect_from_missiles", overhead("prayer", "protect_from_missiles", "prayer_overheads", 440, 1, 1)],
  ["protect_from_magic", overhead("prayer", "protect_from_magic", "prayer_overheads", 440, 2, 2)],
  ["retribution", overhead("prayer", "retribution", "prayer_overheads", 440, 3, 3)],
  ["smite", overhead("prayer", "smite", "prayer_overheads", 440, 4, 4)],
  ["redemption", overhead("prayer", "redemption", "prayer_overheads", 440, 5, 5)]
]);

const defaultSkullDefinitions = new Map<KronosSkullOverheadIcon, KronosOverheadIconDefinition>([
  ["white_pk", overhead("skull", "white_pk", "pk_skull", 439, 0, 0)],
  ["red_pk", overhead("skull", "red_pk", "pk_skull", 439, 1, 1)]
]);

export const defaultKronosOverheadIconDefinitions: KronosOverheadIconDefinitionStore = {
  prayers: defaultPrayerDefinitions,
  skulls: defaultSkullDefinitions
};

export function createKronosOverheadIconDefinitionStore(source: unknown): KronosOverheadIconDefinitionStore {
  const prayers = normalizeOverheadSection<KronosPrayerOverheadIcon>("prayer", "prayer_overheads", source, "prayers");
  const skulls = normalizeOverheadSection<KronosSkullOverheadIcon>("skull", "pk_skull", source, "skulls");

  return prayers.size > 0 || skulls.size > 0
    ? {
        prayers: prayers.size > 0 ? prayers : defaultPrayerDefinitions,
        skulls: skulls.size > 0 ? skulls : defaultSkullDefinitions
      }
    : defaultKronosOverheadIconDefinitions;
}

export function kronosPrayerOverheadDefinition(
  icon: PrayerIcon,
  definitions: KronosOverheadIconDefinitionStore = defaultKronosOverheadIconDefinitions
): KronosOverheadIconDefinition | null {
  return icon === "none" ? null : definitions.prayers.get(icon) ?? null;
}

export function kronosSkullOverheadDefinition(
  icon: SkullIcon,
  definitions: KronosOverheadIconDefinitionStore = defaultKronosOverheadIconDefinitions
): KronosOverheadIconDefinition | null {
  return icon === "none" ? null : definitions.skulls.get(icon) ?? null;
}

function overhead(
  kind: KronosOverheadIconKind,
  key: string,
  spriteSheetId: KronosOverheadSpriteSheetId,
  spriteId: number,
  spriteFrame: number,
  headIconIndex: number
): KronosOverheadIconDefinition {
  return {
    key,
    kind,
    label: key,
    headIconIndex,
    spriteSheetId,
    spriteId,
    spriteFrame,
    width: 25,
    height: 25
  };
}

function normalizeOverheadSection<TIcon extends string>(
  kind: KronosOverheadIconKind,
  spriteSheetId: KronosOverheadSpriteSheetId,
  source: unknown,
  key: "prayers" | "skulls"
): ReadonlyMap<TIcon, KronosOverheadIconDefinition> {
  if (!source || typeof source !== "object") {
    return new Map();
  }

  const section = (source as Record<string, unknown>)[key];
  if (!section || typeof section !== "object" || Array.isArray(section)) {
    return new Map();
  }

  const definitions = new Map<TIcon, KronosOverheadIconDefinition>();
  for (const [icon, rawDefinition] of Object.entries(section)) {
    const definition = normalizeOverheadDefinition(kind, icon, spriteSheetId, rawDefinition);
    if (definition) {
      definitions.set(icon as TIcon, definition);
    }
  }
  return definitions;
}

function normalizeOverheadDefinition(
  kind: KronosOverheadIconKind,
  key: string,
  fallbackSheetId: KronosOverheadSpriteSheetId,
  source: unknown
): KronosOverheadIconDefinition | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const record = source as Record<string, unknown>;
  const headIconIndex = integerField(record.headIconIndex);
  const spriteId = integerField(record.spriteId);
  const spriteFrame = integerField(record.spriteFrame, 0);
  if (headIconIndex === undefined || spriteId === undefined || spriteFrame === undefined) {
    return null;
  }

  return {
    key,
    kind,
    label: stringField(record.label) ?? key,
    headIconIndex,
    spriteSheetId: spriteSheetIdField(record.spriteSheetId) ?? fallbackSheetId,
    spriteId,
    spriteFrame,
    width: nonNegativeIntegerField(record.width, 0),
    height: nonNegativeIntegerField(record.height, 0)
  };
}

function integerField(value: unknown, fallback?: number): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return fallback;
}

function nonNegativeIntegerField(value: unknown, fallback: number): number {
  const parsed = integerField(value, fallback) ?? fallback;
  return parsed >= 0 ? parsed : fallback;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function spriteSheetIdField(value: unknown): KronosOverheadSpriteSheetId | undefined {
  return value === "prayer_overheads" || value === "pk_skull" ? value : undefined;
}
