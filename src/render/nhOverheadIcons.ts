import type { PrayerIcon, SkullIcon } from "../sim";

export type NhPrayerOverheadIcon = Exclude<PrayerIcon, "none">;
export type NhSkullOverheadIcon = Exclude<SkullIcon, "none">;
export type NhOverheadIconKind = "prayer" | "skull";
export type NhOverheadSpriteSheetId = "prayer_overheads" | "pk_skull";

export interface NhOverheadIconDefinition {
  readonly key: string;
  readonly kind: NhOverheadIconKind;
  readonly label: string;
  readonly headIconIndex: number;
  readonly spriteSheetId: NhOverheadSpriteSheetId;
  readonly spriteId: number;
  readonly spriteFrame: number;
  readonly width: number;
  readonly height: number;
}

export interface NhOverheadIconDefinitionStore {
  readonly prayers: ReadonlyMap<NhPrayerOverheadIcon, NhOverheadIconDefinition>;
  readonly skulls: ReadonlyMap<NhSkullOverheadIcon, NhOverheadIconDefinition>;
}

const defaultPrayerDefinitions = new Map<NhPrayerOverheadIcon, NhOverheadIconDefinition>([
  ["protect_from_melee", overhead("prayer", "protect_from_melee", "prayer_overheads", 440, 0, 0)],
  ["protect_from_missiles", overhead("prayer", "protect_from_missiles", "prayer_overheads", 440, 1, 1)],
  ["protect_from_magic", overhead("prayer", "protect_from_magic", "prayer_overheads", 440, 2, 2)],
  ["retribution", overhead("prayer", "retribution", "prayer_overheads", 440, 3, 3)],
  ["smite", overhead("prayer", "smite", "prayer_overheads", 440, 4, 4)],
  ["redemption", overhead("prayer", "redemption", "prayer_overheads", 440, 5, 5)]
]);

const defaultSkullDefinitions = new Map<NhSkullOverheadIcon, NhOverheadIconDefinition>([
  ["white_pk", overhead("skull", "white_pk", "pk_skull", 439, 0, 0)],
  ["red_pk", overhead("skull", "red_pk", "pk_skull", 439, 1, 1)]
]);

export const defaultNhOverheadIconDefinitions: NhOverheadIconDefinitionStore = {
  prayers: defaultPrayerDefinitions,
  skulls: defaultSkullDefinitions
};

export function createNhOverheadIconDefinitionStore(source: unknown): NhOverheadIconDefinitionStore {
  const prayers = normalizeOverheadSection<NhPrayerOverheadIcon>("prayer", "prayer_overheads", source, "prayers");
  const skulls = normalizeOverheadSection<NhSkullOverheadIcon>("skull", "pk_skull", source, "skulls");

  return prayers.size > 0 || skulls.size > 0
    ? {
        prayers: prayers.size > 0 ? prayers : defaultPrayerDefinitions,
        skulls: skulls.size > 0 ? skulls : defaultSkullDefinitions
      }
    : defaultNhOverheadIconDefinitions;
}

export function nhPrayerOverheadDefinition(
  icon: PrayerIcon,
  definitions: NhOverheadIconDefinitionStore = defaultNhOverheadIconDefinitions
): NhOverheadIconDefinition | null {
  return icon === "none" ? null : definitions.prayers.get(icon) ?? null;
}

export function nhSkullOverheadDefinition(
  icon: SkullIcon,
  definitions: NhOverheadIconDefinitionStore = defaultNhOverheadIconDefinitions
): NhOverheadIconDefinition | null {
  return icon === "none" ? null : definitions.skulls.get(icon) ?? null;
}

function overhead(
  kind: NhOverheadIconKind,
  key: string,
  spriteSheetId: NhOverheadSpriteSheetId,
  spriteId: number,
  spriteFrame: number,
  headIconIndex: number
): NhOverheadIconDefinition {
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
  kind: NhOverheadIconKind,
  spriteSheetId: NhOverheadSpriteSheetId,
  source: unknown,
  key: "prayers" | "skulls"
): ReadonlyMap<TIcon, NhOverheadIconDefinition> {
  if (!source || typeof source !== "object") {
    return new Map();
  }

  const section = (source as Record<string, unknown>)[key];
  if (!section || typeof section !== "object" || Array.isArray(section)) {
    return new Map();
  }

  const definitions = new Map<TIcon, NhOverheadIconDefinition>();
  for (const [icon, rawDefinition] of Object.entries(section)) {
    const definition = normalizeOverheadDefinition(kind, icon, spriteSheetId, rawDefinition);
    if (definition) {
      definitions.set(icon as TIcon, definition);
    }
  }
  return definitions;
}

function normalizeOverheadDefinition(
  kind: NhOverheadIconKind,
  key: string,
  fallbackSheetId: NhOverheadSpriteSheetId,
  source: unknown
): NhOverheadIconDefinition | null {
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

function spriteSheetIdField(value: unknown): NhOverheadSpriteSheetId | undefined {
  return value === "prayer_overheads" || value === "pk_skull" ? value : undefined;
}
