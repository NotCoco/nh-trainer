import type { RuntimeHudState } from "../render/runtimeScene";
import type { RuneliteAttackStylesConfigSnapshot } from "./RuneliteClientShell";

export type RuneliteAttackStyleSkill = "ATTACK" | "STRENGTH" | "DEFENCE" | "RANGED" | "MAGIC";
export type RuneliteAttackStyleId =
  | "ACCURATE"
  | "AGGRESSIVE"
  | "DEFENSIVE"
  | "CONTROLLED"
  | "RANGING"
  | "LONGRANGE"
  | "CASTING"
  | "DEFENSIVE_CASTING"
  | "OTHER";

export interface RuneliteAttackStyleDefinition {
  readonly id: RuneliteAttackStyleId;
  readonly name: string;
  readonly skills: readonly RuneliteAttackStyleSkill[];
}

export interface RuneliteAttackStylesOverlaySnapshot {
  readonly attackStyle: RuneliteAttackStyleDefinition;
  readonly warnedSkillSelected: boolean;
  readonly visible: boolean;
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly weaponTypeConfig: number;
  readonly attackSetIndex: number;
  readonly defensiveCastingMode: boolean;
}

export const RUNELITE_ATTACK_STYLES_OVERLAY_POSITION = "ABOVE_CHATBOX_RIGHT";
export const RUNELITE_ATTACK_STYLES_PANEL_PADDING_X = 10;
export const RUNELITE_ATTACK_STYLES_OVERLAY_HEIGHT = 20;
export const RUNELITE_ATTACK_STYLES_TEXT_NORMAL_RGBA = "rgb(255, 255, 255)";
export const RUNELITE_ATTACK_STYLES_TEXT_WARNING_RGBA = "rgb(255, 0, 0)";

const attackStyles: Readonly<Record<RuneliteAttackStyleId, RuneliteAttackStyleDefinition>> = {
  ACCURATE: { id: "ACCURATE", name: "Accurate", skills: ["ATTACK"] },
  AGGRESSIVE: { id: "AGGRESSIVE", name: "Aggressive", skills: ["STRENGTH"] },
  DEFENSIVE: { id: "DEFENSIVE", name: "Defensive", skills: ["DEFENCE"] },
  CONTROLLED: { id: "CONTROLLED", name: "Controlled", skills: ["ATTACK", "STRENGTH", "DEFENCE"] },
  RANGING: { id: "RANGING", name: "Ranging", skills: ["RANGED"] },
  LONGRANGE: { id: "LONGRANGE", name: "Longrange", skills: ["RANGED", "DEFENCE"] },
  CASTING: { id: "CASTING", name: "Casting", skills: ["MAGIC"] },
  DEFENSIVE_CASTING: { id: "DEFENSIVE_CASTING", name: "Defensive Casting", skills: ["MAGIC", "DEFENCE"] },
  OTHER: { id: "OTHER", name: "Other", skills: [] }
};

export const RUNELITE_WEAPON_TYPE_ATTACK_STYLES: readonly (readonly (RuneliteAttackStyleId | null)[])[] = [
  ["ACCURATE", "AGGRESSIVE", null, "DEFENSIVE"],
  ["ACCURATE", "AGGRESSIVE", "AGGRESSIVE", "DEFENSIVE"],
  ["ACCURATE", "AGGRESSIVE", null, "DEFENSIVE"],
  ["RANGING", "RANGING", null, "LONGRANGE"],
  ["ACCURATE", "AGGRESSIVE", "CONTROLLED", "DEFENSIVE"],
  ["RANGING", "RANGING", null, "LONGRANGE"],
  ["AGGRESSIVE", "RANGING", "DEFENSIVE_CASTING", null],
  ["RANGING", "RANGING", null, "LONGRANGE"],
  ["OTHER", "AGGRESSIVE", null, null],
  ["ACCURATE", "AGGRESSIVE", "CONTROLLED", "DEFENSIVE"],
  ["ACCURATE", "AGGRESSIVE", "AGGRESSIVE", "DEFENSIVE"],
  ["ACCURATE", "AGGRESSIVE", "AGGRESSIVE", "DEFENSIVE"],
  ["CONTROLLED", "AGGRESSIVE", null, "DEFENSIVE"],
  ["ACCURATE", "AGGRESSIVE", null, "DEFENSIVE"],
  ["ACCURATE", "AGGRESSIVE", "AGGRESSIVE", "DEFENSIVE"],
  ["CONTROLLED", "CONTROLLED", "CONTROLLED", "DEFENSIVE"],
  ["ACCURATE", "AGGRESSIVE", "CONTROLLED", "DEFENSIVE"],
  ["ACCURATE", "AGGRESSIVE", "AGGRESSIVE", "DEFENSIVE"],
  ["ACCURATE", "AGGRESSIVE", null, "DEFENSIVE", "CASTING", "DEFENSIVE_CASTING"],
  ["RANGING", "RANGING", null, "LONGRANGE"],
  ["ACCURATE", "CONTROLLED", null, "DEFENSIVE"],
  ["ACCURATE", "AGGRESSIVE", null, "DEFENSIVE", "CASTING", "DEFENSIVE_CASTING"],
  ["ACCURATE", "AGGRESSIVE", "AGGRESSIVE", "DEFENSIVE"],
  ["CASTING", "CASTING", null, "DEFENSIVE_CASTING"],
  ["ACCURATE", "AGGRESSIVE", "CONTROLLED", "DEFENSIVE"],
  ["CONTROLLED", "AGGRESSIVE", null, "DEFENSIVE"],
  ["AGGRESSIVE", "AGGRESSIVE", null, "AGGRESSIVE"],
  ["ACCURATE", null, null, "OTHER"]
] as const;

export function runeliteAttackStylesOverlaySnapshot(
  hud: RuntimeHudState,
  config: RuneliteAttackStylesConfigSnapshot
): RuneliteAttackStylesOverlaySnapshot | null {
  if (!config.enabled) {
    return null;
  }

  const weaponTypeConfig = Math.trunc(hud.weaponTypeConfig ?? 0);
  const attackSetIndex = Math.trunc(hud.attackSet ?? 0);
  const style = runeliteAttackStyleForWeapon(weaponTypeConfig, attackSetIndex, Boolean(hud.defensiveCast));
  if (!style) {
    return null;
  }

  const warnedSkillSelected = style.skills.some((skill) => runeliteAttackStylesWarnsForSkill(config, skill));
  if (!warnedSkillSelected && !config.alwaysShowStyle) {
    return null;
  }

  return {
    attackStyle: style,
    warnedSkillSelected,
    visible: true,
    width: style.name.length * 7 + RUNELITE_ATTACK_STYLES_PANEL_PADDING_X,
    height: RUNELITE_ATTACK_STYLES_OVERLAY_HEIGHT,
    color: warnedSkillSelected ? RUNELITE_ATTACK_STYLES_TEXT_WARNING_RGBA : RUNELITE_ATTACK_STYLES_TEXT_NORMAL_RGBA,
    weaponTypeConfig,
    attackSetIndex,
    defensiveCastingMode: Boolean(hud.defensiveCast)
  };
}

export function runeliteAttackStyleForWeapon(
  weaponTypeConfig: number,
  attackSetIndex: number,
  defensiveCastingMode: boolean
): RuneliteAttackStyleDefinition | null {
  const weaponType = RUNELITE_WEAPON_TYPE_ATTACK_STYLES[weaponTypeConfig] ?? RUNELITE_WEAPON_TYPE_ATTACK_STYLES[0];
  const sourceStyleId = weaponType?.[attackSetIndex] ?? null;
  if (!sourceStyleId) {
    return null;
  }

  const styleId = sourceStyleId === "CASTING" && defensiveCastingMode ? "DEFENSIVE_CASTING" : sourceStyleId;
  return attackStyles[styleId] ?? attackStyles.OTHER;
}

export function runeliteAttackStyleIsWarned(
  style: RuneliteAttackStyleDefinition,
  config: RuneliteAttackStylesConfigSnapshot
): boolean {
  return style.skills.some((skill) => runeliteAttackStylesWarnsForSkill(config, skill));
}

export function runeliteAttackStylesWarnsForSkill(
  config: RuneliteAttackStylesConfigSnapshot,
  skill: RuneliteAttackStyleSkill
): boolean {
  if (skill === "ATTACK") {
    return config.warnForAttack;
  }
  if (skill === "STRENGTH") {
    return config.warnForStrength;
  }
  if (skill === "DEFENCE") {
    return config.warnForDefence;
  }
  if (skill === "RANGED") {
    return config.warnForRanged;
  }
  return config.warnForMagic;
}
