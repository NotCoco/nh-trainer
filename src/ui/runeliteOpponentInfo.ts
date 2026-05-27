import type { RuntimeActorId } from "../render/runtimeScene";
import { nhMenuBaseOpcode, type NhPlayerContextMenuEntry } from "../render/nhContextMenu";
import type { RuntimePlayerCombatActorState, RuntimePlayerCombatState } from "../sim/runtimePlayerCombat";
import type { RuneliteOpponentInfoConfigSnapshot, RuneliteOpponentHitpointsDisplayStyle } from "./RuneliteClientShell";

export const RUNELITE_OPPONENT_INFO_WAIT_MS = 5000;
export const RUNELITE_OPPONENT_INFO_STANDARD_WIDTH = 129;
export const RUNELITE_OPPONENT_INFO_PANEL_BORDER = { top: 2, right: 2, bottom: 2, left: 2 } as const;
export const RUNELITE_OPPONENT_INFO_PANEL_GAP_Y = 2;
export const RUNELITE_OPPONENT_INFO_PROGRESS_HEIGHT = 16;
export const RUNELITE_OPPONENT_INFO_HP_GREEN_RGBA = "rgba(0, 146, 54, 0.902)";
export const RUNELITE_OPPONENT_INFO_HP_RED_RGBA = "rgba(102, 15, 16, 0.902)";
export const RUNELITE_OPPONENT_INFO_BACKGROUND_RGBA = "rgba(70, 61, 50, 0.612)";
export const RUNELITE_OPPONENT_INFO_OUTSIDE_STROKE_RGBA = "rgba(56, 48, 35, 1)";
export const RUNELITE_OPPONENT_INFO_INSIDE_STROKE_RGBA = "rgba(90, 82, 69, 1)";
export const RUNELITE_OPPONENT_COMPARISON_HIGHLIGHT_COLOR = "#ffc800";
export const RUNELITE_OPPONENT_COMPARISON_HIGHER_STAT_COLOR = "#00ff00";
export const RUNELITE_OPPONENT_COMPARISON_LOWER_STAT_COLOR = "#ff0000";
export const RUNELITE_OPPONENT_COMPARISON_NEUTRAL_STAT_COLOR = "#ffffff";

export type RuneliteOpponentComparisonSkillId =
  | "attack"
  | "strength"
  | "defence"
  | "hitpoints"
  | "ranged"
  | "magic"
  | "prayer";

export interface RuneliteOpponentComparisonRow {
  readonly skill: RuneliteOpponentComparisonSkillId;
  readonly label: string;
  readonly localLevel: number;
  readonly opponentLevel: number;
  readonly localColor: string;
  readonly opponentColor: string;
}

export interface RuneliteOpponentComparisonSnapshot {
  readonly opponentId: RuntimeActorId;
  readonly opponentName: string;
  readonly rows: readonly RuneliteOpponentComparisonRow[];
  readonly sourceOverlayPosition: "OverlayPosition.BOTTOM_LEFT";
  readonly sourceOverlayLayer: "OverlayLayer.ABOVE_WIDGETS";
}

export interface RuneliteOpponentInfoSnapshot {
  readonly opponentId: RuntimeActorId;
  readonly opponentName: string;
  readonly opponentsOpponentName: string | null;
  readonly currentHitpoints: number;
  readonly maxHitpoints: number;
  readonly displayStyle: RuneliteOpponentHitpointsDisplayStyle;
  readonly label: string;
  readonly fillPercent: number;
  readonly width: number;
  readonly sourceLastOpponent: "targetId" | "lastTargetId";
}

export interface RuneliteOpponentInfoMenuInput<TTile> {
  readonly entries: readonly NhPlayerContextMenuEntry<TTile>[];
  readonly targetActorId: RuntimeActorId;
  readonly combatState: RuntimePlayerCombatState;
  readonly config: RuneliteOpponentInfoConfigSnapshot;
}

export function runeliteOpponentInfoSnapshot(
  combatState: RuntimePlayerCombatState,
  config: RuneliteOpponentInfoConfigSnapshot
): RuneliteOpponentInfoSnapshot | null {
  if (!config.enabled) {
    return null;
  }

  const local = combatState.actors["local-player"];
  const sourceLastOpponent = local.targetId !== null ? "targetId" : local.lastTargetId !== null ? "lastTargetId" : null;
  if (sourceLastOpponent === null) {
    return null;
  }

  const opponentId = local[sourceLastOpponent];
  if (opponentId === null) {
    return null;
  }

  const opponent = combatState.actors[opponentId];
  if (!opponent || opponent.hitpoints <= 0) {
    return null;
  }

  const currentHitpoints = Math.max(0, Math.min(opponent.maxHitpoints, opponent.hitpoints));
  const maxHitpoints = Math.max(1, opponent.maxHitpoints);
  const fillPercent = Math.max(0, Math.min(100, (currentHitpoints / maxHitpoints) * 100));
  const displayStyle = config.hitpointsDisplayStyle;

  return {
    opponentId: opponent.id,
    opponentName: runeliteOpponentInfoActorName(opponent),
    opponentsOpponentName: config.showOpponentsOpponent ? runeliteOpponentInfoOpponentsOpponentName(combatState, opponent) : null,
    currentHitpoints,
    maxHitpoints,
    displayStyle,
    label: runeliteOpponentInfoHitpointsLabel(currentHitpoints, maxHitpoints, displayStyle),
    fillPercent,
    width: RUNELITE_OPPONENT_INFO_STANDARD_WIDTH,
    sourceLastOpponent
  };
}

export function runeliteOpponentComparisonSnapshot(
  combatState: RuntimePlayerCombatState,
  config: RuneliteOpponentInfoConfigSnapshot
): RuneliteOpponentComparisonSnapshot | null {
  if (!config.enabled || !config.lookupOnInteraction) {
    return null;
  }

  const local = combatState.actors["local-player"];
  const opponentId = local.targetId ?? local.lastTargetId;
  if (opponentId === null) {
    return null;
  }

  const opponent = combatState.actors[opponentId];
  if (!opponent || opponent.hitpoints <= 0) {
    return null;
  }

  const rows = runeliteOpponentComparisonRows(local, opponent);
  if (rows.length === 0) {
    return null;
  }

  return {
    opponentId: opponent.id,
    opponentName: runeliteOpponentInfoActorName(opponent),
    rows,
    sourceOverlayPosition: "OverlayPosition.BOTTOM_LEFT",
    sourceOverlayLayer: "OverlayLayer.ABOVE_WIDGETS"
  };
}

// Source: OpponentInfoPlugin.onBeforeRender/onMenuOpened -> modify(MenuEntry) only rewrites Attack rows.
export function applyRuneliteOpponentInfoMenuEntries<TTile>({
  entries,
  targetActorId,
  combatState,
  config
}: RuneliteOpponentInfoMenuInput<TTile>): readonly NhPlayerContextMenuEntry<TTile>[] {
  if (
    !config.enabled ||
    (!config.showAttackersMenu && !config.showAttackingMenu && !config.showHitpointsMenu)
  ) {
    return entries;
  }

  const local = combatState.actors["local-player"];
  const target = combatState.actors[targetActorId];
  if (!local || !target) {
    return entries;
  }

  return entries.map((entry) => {
    if (entry.actionText !== "Attack" || nhMenuBaseOpcode(entry.opcode) !== 44) {
      return entry;
    }

    let targetText = entry.targetText;

    if (config.showAttackingMenu && local.targetId === targetActorId) {
      targetText = `${runeliteOpponentInfoColorTag(config.attackingColor)}${stripLeadingNhColorTag(targetText)}`;
    }

    if (config.showAttackersMenu && target.targetId === "local-player") {
      targetText = `*${targetText}`;
    }

    if (config.showHitpointsMenu && target.maxHitpoints > 0 && target.hitpoints > 0) {
      const levelIndex = targetText.lastIndexOf("(level-");
      if (levelIndex !== -1) {
        targetText = `${targetText.substring(0, levelIndex)}<col=ff0000>(${Math.trunc(target.hitpoints)}/${Math.trunc(target.maxHitpoints)})`;
      }
    }

    return targetText === entry.targetText ? entry : { ...entry, targetText };
  });
}

export function runeliteOpponentInfoExactHp(ratio: number, healthScale: number, maxHp: number): number {
  if (ratio < 0 || healthScale <= 0 || maxHp === -1) {
    return -1;
  }

  let exactHealth = 0;
  if (ratio > 0) {
    let minHealth = 1;
    let maxHealth: number;
    if (healthScale > 1) {
      if (ratio > 1) {
        minHealth = Math.trunc((maxHp * (ratio - 1) + healthScale - 2) / (healthScale - 1));
      }
      maxHealth = Math.trunc((maxHp * ratio - 1) / (healthScale - 1));
      if (maxHealth > maxHp) {
        maxHealth = maxHp;
      }
    } else {
      maxHealth = maxHp;
    }
    exactHealth = Math.trunc((minHealth + maxHealth + 1) / 2);
  }

  return exactHealth;
}

function runeliteOpponentInfoHitpointsLabel(
  currentHitpoints: number,
  maxHitpoints: number,
  displayStyle: RuneliteOpponentHitpointsDisplayStyle
): string {
  const percentage = `${((currentHitpoints / Math.max(1, maxHitpoints)) * 100).toFixed(1)}%`;
  if (displayStyle === "Percentage") {
    return percentage;
  }

  const hitpoints = `${currentHitpoints}/${maxHitpoints}`;
  return displayStyle === "Both" ? `${hitpoints} (${percentage})` : hitpoints;
}

function runeliteOpponentInfoActorName(actor: RuntimePlayerCombatActorState): string {
  return actor.id === "opponent" ? "Opponent" : actor.id;
}

function runeliteOpponentInfoOpponentsOpponentName(
  combatState: RuntimePlayerCombatState,
  opponent: RuntimePlayerCombatActorState
): string | null {
  const interacting = opponent.targetId ?? opponent.lastTargetId;
  if (interacting !== "local-player") {
    return null;
  }
  return runeliteOpponentInfoActorName(combatState.actors["local-player"]);
}

const runeliteOpponentComparisonSkills = [
  { skill: "attack", label: "Attack" },
  { skill: "strength", label: "Strength" },
  { skill: "defence", label: "Defence" },
  { skill: "hitpoints", label: "Hitpoints" },
  { skill: "ranged", label: "Ranged" },
  { skill: "magic", label: "Magic" },
  { skill: "prayer", label: "Prayer" }
] as const satisfies readonly {
  readonly skill: RuneliteOpponentComparisonSkillId;
  readonly label: string;
}[];

function runeliteOpponentComparisonRows(
  local: RuntimePlayerCombatActorState,
  opponent: RuntimePlayerCombatActorState
): readonly RuneliteOpponentComparisonRow[] {
  const rows: RuneliteOpponentComparisonRow[] = [];
  for (const definition of runeliteOpponentComparisonSkills) {
    const localLevel = runeliteOpponentComparisonLevel(local, definition.skill);
    const opponentLevel = runeliteOpponentComparisonLevel(opponent, definition.skill);
    if (localLevel === null || opponentLevel === null) {
      continue;
    }

    rows.push({
      ...definition,
      localLevel,
      opponentLevel,
      localColor: runeliteOpponentComparisonColor(localLevel, opponentLevel),
      opponentColor: runeliteOpponentComparisonColor(opponentLevel, localLevel)
    });
  }
  return rows;
}

function runeliteOpponentComparisonLevel(
  actor: RuntimePlayerCombatActorState,
  skill: RuneliteOpponentComparisonSkillId
): number | null {
  if (skill === "hitpoints") {
    return Math.trunc(actor.maxHitpoints);
  }
  if (skill === "prayer") {
    return null;
  }
  return Math.trunc(actor.levels[skill]);
}

function runeliteOpponentComparisonColor(a: number, b: number): string {
  if (a > b) {
    return RUNELITE_OPPONENT_COMPARISON_HIGHER_STAT_COLOR;
  }
  if (a < b) {
    return RUNELITE_OPPONENT_COMPARISON_LOWER_STAT_COLOR;
  }
  return RUNELITE_OPPONENT_COMPARISON_NEUTRAL_STAT_COLOR;
}

function runeliteOpponentInfoColorTag(color: string): string {
  const match = color.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return `<col=${match ? match[1].toLowerCase() : "00ff00"}>`;
}

function stripLeadingNhColorTag(text: string): string {
  return text.replace(/^<col=[0-9a-fA-F]{6}>/, "");
}
