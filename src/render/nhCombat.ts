import {
  defaultRuntimeSkillStates,
  type RuntimeHudState,
  type RuntimeSkillId,
  type RuntimeSkillState
} from "./runtimeScene";

export type NhAttackType =
  | "ACCURATE"
  | "AGGRESSIVE"
  | "DEFENSIVE"
  | "CONTROLLED"
  | "RAPID_RANGED"
  | "LONG_RANGED";

export type NhAttackStyle =
  | "STAB"
  | "SLASH"
  | "CRUSH"
  | "RANGED"
  | "MAGIC"
  | "MAGICAL_RANGED"
  | "MAGICAL_MELEE"
  | "DRAGONFIRE"
  | "CANNON";

export interface NhWeaponAttackSetDefinition {
  readonly child: number;
  readonly type: NhAttackType;
  readonly style: NhAttackStyle;
}

export interface NhWeaponTypeDefinition {
  readonly id: string;
  readonly config: number;
  readonly maxDistance: number;
  readonly attackTicks: number;
  readonly renderAnimations: readonly number[];
  readonly attackSets: readonly (NhWeaponAttackSetDefinition | null)[];
}

export type NhWeaponTypeDefinitionStore = ReadonlyMap<string, NhWeaponTypeDefinition>;

export function createNhWeaponTypeDefinitionStore(source: unknown): NhWeaponTypeDefinitionStore {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return new Map();
  }

  const entries: Array<readonly [string, NhWeaponTypeDefinition]> = [];
  for (const [id, value] of Object.entries(source)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const record = value as Record<string, unknown>;
    const config = integerField(record.config);
    const maxDistance = integerField(record.maxDistance);
    const attackTicks = integerField(record.attackTicks);
    if (config === null || maxDistance === null || attackTicks === null) {
      continue;
    }

    entries.push([
      id,
      {
        id,
        config,
        maxDistance,
        attackTicks,
        renderAnimations: normalizeIntegerArray(record.renderAnimations),
        attackSets: normalizeAttackSets(record.attackSets)
      }
    ]);
  }

  return new Map(entries);
}

function normalizeIntegerArray(source: unknown): readonly number[] {
  if (!Array.isArray(source)) {
    return [];
  }
  return source.filter((value): value is number => Number.isInteger(value));
}

export function nhWeaponTypeDefinitionByConfig(
  definitions: NhWeaponTypeDefinitionStore,
  config: number | undefined
): NhWeaponTypeDefinition | null {
  if (config === undefined || !Number.isInteger(config)) {
    return null;
  }

  for (const definition of definitions.values()) {
    if (definition.config === config) {
      return definition;
    }
  }

  return null;
}

export function nhAttackTypeLabel(type: NhAttackType): string {
  switch (type) {
    case "RAPID_RANGED":
      return "Rapid";
    case "LONG_RANGED":
      return "Longrange";
    case "ACCURATE":
      return "Accurate";
    case "AGGRESSIVE":
      return "Aggressive";
    case "DEFENSIVE":
      return "Defensive";
    case "CONTROLLED":
      return "Controlled";
  }
}

export function nhAttackStyleLabel(style: NhAttackStyle): string {
  return style
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function nhCombatLevelFromHud(hud: RuntimeHudState): number {
  const attack = fixedSkillLevel(hud, "attack");
  const defence = fixedSkillLevel(hud, "defence");
  const strength = fixedSkillLevel(hud, "strength");
  const hitpoints = fixedSkillLevel(hud, "hitpoints");
  const ranged = fixedSkillLevel(hud, "ranged");
  const prayer = fixedSkillLevel(hud, "prayer");
  const magic = fixedSkillLevel(hud, "magic");
  const coreBase = (defence + hitpoints + Math.trunc(prayer / 2)) * 0.25;
  const meleeBase = (attack + strength) * 0.325;
  const rangedBase = (Math.trunc(ranged / 2) + ranged) * 0.325;
  const magicBase = (Math.trunc(magic / 2) + magic) * 0.325;
  return Math.trunc(coreBase + Math.max(meleeBase, rangedBase, magicBase));
}

function normalizeAttackSets(source: unknown): readonly (NhWeaponAttackSetDefinition | null)[] {
  if (!Array.isArray(source)) {
    return [];
  }

  const orderedSets: Array<NhWeaponAttackSetDefinition | null> = [null, null, null, null];
  for (const value of source) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const record = value as Record<string, unknown>;
    const child = integerField(record.child);
    if (child === null || !isNhAttackType(record.type) || !isNhAttackStyle(record.style)) {
      continue;
    }
    const index = Math.trunc(child / 4);
    if (index >= 0 && index < orderedSets.length) {
      orderedSets[index] = { child, type: record.type, style: record.style };
    }
  }
  return orderedSets;
}

function fixedSkillLevel(hud: RuntimeHudState, id: RuntimeSkillId): number {
  return normalizeSkillState(hud.skills?.[id] ?? defaultRuntimeSkillStates[id]).fixed;
}

function normalizeSkillState(value: RuntimeSkillState): RuntimeSkillState {
  return {
    current: normalizeSkillLevel(value.current),
    fixed: Math.max(1, normalizeSkillLevel(value.fixed))
  };
}

function normalizeSkillLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(999, Math.trunc(value)));
}

function integerField(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function isNhAttackType(value: unknown): value is NhAttackType {
  return (
    value === "ACCURATE" ||
    value === "AGGRESSIVE" ||
    value === "DEFENSIVE" ||
    value === "CONTROLLED" ||
    value === "RAPID_RANGED" ||
    value === "LONG_RANGED"
  );
}

function isNhAttackStyle(value: unknown): value is NhAttackStyle {
  return (
    value === "STAB" ||
    value === "SLASH" ||
    value === "CRUSH" ||
    value === "RANGED" ||
    value === "MAGIC" ||
    value === "MAGICAL_RANGED" ||
    value === "MAGICAL_MELEE" ||
    value === "DRAGONFIRE" ||
    value === "CANNON"
  );
}
