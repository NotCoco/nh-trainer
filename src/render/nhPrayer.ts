import type { NhPrayerId } from "./nhFixedLayout";

export type NhPrayerStates = Readonly<Partial<Record<NhPrayerId, boolean>>>;

export interface NhPrayerDefinition {
  readonly id: NhPrayerId;
  readonly enumName: string;
  readonly ordinal: number;
  readonly varpbitId: number;
  readonly soundId: number;
  readonly level: number;
  readonly drain: number;
  readonly headIcon: number | null;
  readonly group:
    | "defence"
    | "strength"
    | "attack"
    | "ranged"
    | "magic"
    | "mixed"
    | "overhead"
    | "none";
}

export interface NhPrayerToggleResult {
  readonly prayers: NhPrayerStates;
  readonly mutation: "activate" | "deactivate";
  readonly deactivatedPrayerIds: readonly NhPrayerId[];
}

const nhPrayerDefinitions = [
  definePrayer("thick-skin", "THICK_SKIN", 0, 4104, 2690, 1, 3, null, "defence"),
  definePrayer("burst-of-strength", "BURST_OF_STRENGTH", 1, 4105, 2688, 4, 3, null, "strength"),
  definePrayer("clarity-of-thought", "CLARITY_OF_THOUGHT", 2, 4106, 2664, 7, 3, null, "attack"),
  definePrayer("rock-skin", "ROCK_SKIN", 3, 4107, 2684, 10, 6, null, "defence"),
  definePrayer("superhuman-strength", "SUPERHUMAN_STRENGTH", 4, 4108, 2689, 13, 6, null, "strength"),
  definePrayer("improved-reflexes", "IMPROVED_REFLEXES", 5, 4109, 2662, 16, 6, null, "attack"),
  definePrayer("rapid-restore", "RAPID_RESTORE", 6, 4110, 2679, 19, 1, null, "none"),
  definePrayer("rapid-heal", "RAPID_HEAL", 7, 4111, 2678, 22, 2, null, "none"),
  definePrayer("protect-item", "PROTECT_ITEM", 8, 4112, 1982, 25, 2, null, "none"),
  definePrayer("steel-skin", "STEEL_SKIN", 9, 4113, 2687, 28, 12, null, "defence"),
  definePrayer("ultimate-strength", "ULTIMATE_STRENGTH", 10, 4114, 2691, 31, 12, null, "strength"),
  definePrayer("incredible-reflexes", "INCREDIBLE_REFLEXES", 11, 4115, 2667, 34, 12, null, "attack"),
  definePrayer("protect-from-magic", "PROTECT_FROM_MAGIC", 12, 4116, 2675, 37, 12, 2, "overhead"),
  definePrayer("protect-from-missiles", "PROTECT_FROM_MISSILES", 13, 4117, 2677, 40, 12, 1, "overhead"),
  definePrayer("protect-from-melee", "PROTECT_FROM_MELEE", 14, 4118, 2676, 43, 12, 0, "overhead"),
  definePrayer("retribution", "RETRIBUTION", 15, 4119, 2682, 46, 3, 3, "overhead"),
  definePrayer("redemption", "REDEMPTION", 16, 4120, 2680, 49, 6, 5, "overhead"),
  definePrayer("smite", "SMITE", 17, 4121, 2686, 52, 18, 4, "overhead"),
  definePrayer("sharp-eye", "SHARP_EYE", 18, 4122, 2685, 8, 3, null, "ranged"),
  definePrayer("mystic-will", "MYSTIC_WILL", 19, 4123, 2670, 9, 3, null, "magic"),
  definePrayer("hawk-eye", "HAWK_EYE", 20, 4124, 2666, 26, 6, null, "ranged"),
  definePrayer("mystic-lore", "MYSTIC_LORE", 21, 4125, 2668, 27, 6, null, "magic"),
  definePrayer("eagle-eye", "EAGLE_EYE", 22, 4126, 2665, 44, 12, null, "ranged"),
  definePrayer("mystic-might", "MYSTIC_MIGHT", 23, 4127, 2669, 45, 12, null, "magic"),
  definePrayer("chivalry", "CHIVALRY", 24, 4128, 3826, 60, 24, null, "mixed"),
  definePrayer("piety", "PIETY", 25, 4129, 3825, 70, 24, null, "mixed"),
  definePrayer("rigour", "RIGOUR", 26, 5464, 2685, 74, 24, null, "mixed"),
  definePrayer("augury", "AUGURY", 27, 5465, 2670, 77, 24, null, "mixed"),
  definePrayer("preserve", "PRESERVE", 28, 5466, 2679, 55, 3, null, "none")
] as const satisfies readonly NhPrayerDefinition[];

const definitionsById: ReadonlyMap<NhPrayerId, NhPrayerDefinition> = new Map(
  nhPrayerDefinitions.map((definition) => [definition.id, definition])
);

export function nhPrayerDefinition(id: NhPrayerId): NhPrayerDefinition | undefined {
  return definitionsById.get(id);
}

export function nhPrayerDisallowedIds(definition: NhPrayerDefinition): readonly NhPrayerId[] {
  const groups = disallowedGroups(definition.group);
  return nhPrayerDefinitions
    .filter((candidate) => groups.has(candidate.group))
    .map((candidate) => candidate.id);
}

export function nhActivePrayerIds(prayers: NhPrayerStates | undefined): readonly NhPrayerId[] {
  if (!prayers) {
    return [];
  }
  return nhPrayerDefinitions.flatMap((definition) => (prayers[definition.id] === true ? [definition.id] : []));
}

export function nhTogglePrayerState(
  prayers: NhPrayerStates | undefined,
  definition: NhPrayerDefinition
): NhPrayerToggleResult {
  const next: Partial<Record<NhPrayerId, boolean>> = { ...(prayers ?? {}) };
  if (next[definition.id] === true) {
    next[definition.id] = false;
    return { prayers: next, mutation: "deactivate", deactivatedPrayerIds: [definition.id] };
  }

  const deactivatedPrayerIds: NhPrayerId[] = [];
  for (const id of nhPrayerDisallowedIds(definition)) {
    if (next[id] === true) {
      next[id] = false;
      deactivatedPrayerIds.push(id);
    }
  }
  next[definition.id] = true;
  return { prayers: next, mutation: "activate", deactivatedPrayerIds };
}

function definePrayer(
  id: NhPrayerId,
  enumName: string,
  ordinal: number,
  varpbitId: number,
  soundId: number,
  level: number,
  drain: number,
  headIcon: number | null,
  group: NhPrayerDefinition["group"]
): NhPrayerDefinition {
  return { id, enumName, ordinal, varpbitId, soundId, level, drain, headIcon, group };
}

function disallowedGroups(group: NhPrayerDefinition["group"]): ReadonlySet<NhPrayerDefinition["group"]> {
  switch (group) {
    case "defence":
      return new Set(["defence", "mixed"]);
    case "strength":
      return new Set(["strength", "ranged", "magic", "mixed"]);
    case "attack":
      return new Set(["attack", "ranged", "magic", "mixed"]);
    case "ranged":
      return new Set(["ranged", "strength", "attack", "magic", "mixed"]);
    case "magic":
      return new Set(["magic", "strength", "attack", "ranged", "mixed"]);
    case "mixed":
      return new Set(["mixed", "defence", "strength", "attack", "ranged", "magic"]);
    case "overhead":
      return new Set(["overhead"]);
    case "none":
      return new Set();
  }
}
