import type { RuntimeHudState, RuntimeSkillId, RuntimeSkillState } from "../render/runtimeScene";
import type { RuneliteBoostsConfigSnapshot, RuneliteBoostsDisplayBoosts, RuneliteInfoBoxConfigSnapshot } from "./RuneliteClientShell";

export const RUNELITE_BOOSTS_OVERLAY_WIDTH = 129;
export const RUNELITE_BOOSTS_ICON_PANEL_WIDTH = 28;
export const RUNELITE_BOOSTS_ROW_HEIGHT = 15;
export const RUNELITE_BOOSTS_ICON_ROW_HEIGHT = 17;
export const RUNELITE_BOOSTS_BACKGROUND_RGBA = "rgba(70, 61, 50, 0.612)";
export const RUNELITE_BOOSTS_POSITIVE_COLOR = "#00ff00";
export const RUNELITE_BOOSTS_THRESHOLD_COLOR = "#ffff00";
export const RUNELITE_BOOSTS_NEGATIVE_COLOR = "#ee3333";
export const RUNELITE_INFOBOX_GAP_PX = 1;
export const RUNELITE_INFOBOX_MIN_SIZE_PX = 2;

export type RuneliteBoostsOverlayMode = "panel" | "combat-icons";
export type RuneliteInfoBoxOrientation = "horizontal" | "vertical";

export interface RuneliteBoostRowSnapshot {
  readonly skillId: RuntimeSkillId;
  readonly skillName: string;
  readonly sourceSkill: string;
  readonly boostedLevel: number;
  readonly baseLevel: number;
  readonly boost: number;
  readonly label: string;
  readonly value: string;
  readonly boostedValue: string;
  readonly baseValue: string;
  readonly color: string;
  readonly iconPath: string;
}

export interface RuneliteBoostsOverlaySnapshot {
  readonly mode: RuneliteBoostsOverlayMode;
  readonly rows: readonly RuneliteBoostRowSnapshot[];
  readonly width: number;
  readonly height: number;
  readonly renderOrder: number;
}

export interface RuneliteBoostsInfoBoxItemSnapshot {
  readonly skillId: RuntimeSkillId;
  readonly skillName: string;
  readonly sourceSkill: string;
  readonly tooltip: string;
  readonly priority: "InfoBoxPriority.HIGH";
  readonly text: string;
  readonly color: string;
  readonly iconPath: string;
  readonly boostedLevel: number;
  readonly baseLevel: number;
  readonly boost: number;
}

export interface RuneliteBoostsInfoBoxSnapshot {
  readonly boxes: readonly RuneliteBoostsInfoBoxItemSnapshot[];
  readonly orientation: RuneliteInfoBoxOrientation;
  readonly wrap: number;
  readonly size: number;
  readonly gap: number;
  readonly width: number;
  readonly height: number;
  readonly renderOrder: number;
}

interface RuneliteBoostSkillDefinition {
  readonly id: RuntimeSkillId;
  readonly skillName: string;
  readonly sourceSkill: string;
  readonly iconPath: string;
  readonly combat: boolean;
}

export const RUNELITE_BOOSTS_COMBAT_SKILL_ORDER: readonly RuneliteBoostSkillDefinition[] = [
  {
    id: "attack",
    skillName: "Attack",
    sourceSkill: "Skill.ATTACK",
    iconPath: "runelite-ui/skill_icons_small/attack.png",
    combat: true
  },
  {
    id: "strength",
    skillName: "Strength",
    sourceSkill: "Skill.STRENGTH",
    iconPath: "runelite-ui/skill_icons_small/strength.png",
    combat: true
  },
  {
    id: "defence",
    skillName: "Defence",
    sourceSkill: "Skill.DEFENCE",
    iconPath: "runelite-ui/skill_icons_small/defence.png",
    combat: true
  },
  {
    id: "ranged",
    skillName: "Ranged",
    sourceSkill: "Skill.RANGED",
    iconPath: "runelite-ui/skill_icons_small/ranged.png",
    combat: true
  },
  {
    id: "magic",
    skillName: "Magic",
    sourceSkill: "Skill.MAGIC",
    iconPath: "runelite-ui/skill_icons_small/magic.png",
    combat: true
  }
] as const;

export function runeliteBoostsOverlaySnapshot(
  hud: RuntimeHudState,
  config: RuneliteBoostsConfigSnapshot
): RuneliteBoostsOverlaySnapshot | null {
  if (!config.enabled || config.displayInfoboxes) {
    return null;
  }

  const rows = runeliteBoostRows(hud, config);
  if (rows.length === 0) {
    return null;
  }

  const mode: RuneliteBoostsOverlayMode = config.displayIcons ? "combat-icons" : "panel";
  return {
    mode,
    rows,
    width: mode === "combat-icons" ? RUNELITE_BOOSTS_ICON_PANEL_WIDTH : RUNELITE_BOOSTS_OVERLAY_WIDTH,
    height: rows.length * (mode === "combat-icons" ? RUNELITE_BOOSTS_ICON_ROW_HEIGHT : RUNELITE_BOOSTS_ROW_HEIGHT) + (mode === "panel" ? 8 : 0),
    renderOrder: 10
  };
}

export function runeliteBoostsInfoBoxSnapshot(
  hud: RuntimeHudState,
  boostsConfig: RuneliteBoostsConfigSnapshot,
  infoBoxConfig: RuneliteInfoBoxConfigSnapshot
): RuneliteBoostsInfoBoxSnapshot | null {
  if (!boostsConfig.enabled || !boostsConfig.displayInfoboxes) {
    return null;
  }

  const rows = runeliteBoostRows(hud, boostsConfig);
  if (rows.length === 0) {
    return null;
  }

  const size = Math.max(RUNELITE_INFOBOX_MIN_SIZE_PX, Math.trunc(infoBoxConfig.size));
  const wrap = Math.max(1, Math.trunc(infoBoxConfig.wrap));
  const orientation: RuneliteInfoBoxOrientation = infoBoxConfig.vertical ? "vertical" : "horizontal";
  const primaryCount = Math.min(rows.length, wrap);
  const secondaryCount = Math.ceil(rows.length / primaryCount);
  const width =
    orientation === "horizontal"
      ? primaryCount * size + Math.max(0, primaryCount - 1) * RUNELITE_INFOBOX_GAP_PX
      : secondaryCount * size + Math.max(0, secondaryCount - 1) * RUNELITE_INFOBOX_GAP_PX;
  const height =
    orientation === "horizontal"
      ? secondaryCount * size + Math.max(0, secondaryCount - 1) * RUNELITE_INFOBOX_GAP_PX
      : primaryCount * size + Math.max(0, primaryCount - 1) * RUNELITE_INFOBOX_GAP_PX;

  return {
    boxes: rows.map((row) => ({
      skillId: row.skillId,
      skillName: row.skillName,
      sourceSkill: row.sourceSkill,
      tooltip: `${row.skillName} boost`,
      priority: "InfoBoxPriority.HIGH",
      text: row.boostedValue,
      color: row.color,
      iconPath: row.iconPath,
      boostedLevel: row.boostedLevel,
      baseLevel: row.baseLevel,
      boost: row.boost
    })),
    orientation,
    wrap,
    size,
    gap: RUNELITE_INFOBOX_GAP_PX,
    width,
    height,
    renderOrder: 10
  };
}

export function runeliteBoostRows(
  hud: RuntimeHudState,
  config: RuneliteBoostsConfigSnapshot
): readonly RuneliteBoostRowSnapshot[] {
  if (config.displayBoosts === "NONE") {
    return [];
  }

  return RUNELITE_BOOSTS_COMBAT_SKILL_ORDER.filter((skill) => runeliteBoostSkillAllowed(skill, config.displayBoosts))
    .flatMap((skill) => {
      const state = hud.skills?.[skill.id];
      if (!state || !runeliteSkillIsBoosted(state)) {
        return [];
      }

      const boost = state.current - state.fixed;
      const color = runeliteBoostTextColor(boost, config.boostThreshold);
      const relativeValue = `${boost > 0 ? "+" : ""}${boost}`;
      return [
        {
          skillId: skill.id,
          skillName: skill.skillName,
          sourceSkill: skill.sourceSkill,
          boostedLevel: state.current,
          baseLevel: state.fixed,
          boost,
          label: `${skill.skillName}:`,
          value: config.useRelativeBoost ? relativeValue : `${state.current}/${state.fixed}`,
          boostedValue: config.useRelativeBoost ? relativeValue : String(state.current),
          baseValue: config.useRelativeBoost ? "" : `/${state.fixed}`,
          color,
          iconPath: skill.iconPath
        }
      ];
    });
}

function runeliteBoostSkillAllowed(skill: RuneliteBoostSkillDefinition, displayBoosts: RuneliteBoostsDisplayBoosts): boolean {
  if (displayBoosts === "COMBAT" || displayBoosts === "BOTH") {
    return skill.combat;
  }
  return false;
}

function runeliteSkillIsBoosted(state: RuntimeSkillState): boolean {
  return Math.trunc(state.current) !== Math.trunc(state.fixed);
}

function runeliteBoostTextColor(boost: number, boostThreshold: number): string {
  if (boost < 0) {
    return RUNELITE_BOOSTS_NEGATIVE_COLOR;
  }
  return boost <= boostThreshold ? RUNELITE_BOOSTS_THRESHOLD_COLOR : RUNELITE_BOOSTS_POSITIVE_COLOR;
}
