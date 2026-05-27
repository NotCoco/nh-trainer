import type { NhFixedClientCssLayout, NhFixedClientLayout, NhRect } from "../render/nhFixedLayout";
import type { RuntimeHudState } from "../render/runtimeScene";
import type { RuneliteStatusBarMode, RuneliteStatusBarsConfigSnapshot } from "./RuneliteClientShell";

export const RUNELITE_STATUS_BARS_HEIGHT = 252;
export const RUNELITE_STATUS_BARS_RESIZED_BOTTOM_HEIGHT = 272;
export const RUNELITE_STATUS_BARS_BAR_WIDTH = 20;
export const RUNELITE_STATUS_BARS_PADDING = 1;
export const RUNELITE_STATUS_BARS_OVERHEAL_OFFSET = 2;
export const RUNELITE_STATUS_BARS_HEAL_OFFSET = 3;
export const RUNELITE_STATUS_BARS_ICON_AND_COUNTER_OFFSET_X = 1;
export const RUNELITE_STATUS_BARS_ICON_AND_COUNTER_OFFSET_Y = 21;
export const RUNELITE_STATUS_BARS_COUNTER_ICON_HEIGHT = 18;
export const RUNELITE_STATUS_BARS_SKILL_ICON_HEIGHT = 35;
export const RUNELITE_STATUS_BARS_FIXED_LEFT_OFFSET = { x: 20, y: -4 } as const;
export const RUNELITE_STATUS_BARS_FIXED_RIGHT_OFFSET = { x: 0, y: -4 } as const;
export const RUNELITE_STATUS_BARS_BACKGROUND_RGBA = "rgba(0, 0, 0, 0.588)";
export const RUNELITE_STATUS_BARS_OVERHEAL_RGBA = "rgba(216, 255, 139, 0.588)";

export type RuneliteStatusBarSide = "left" | "right";

export interface RuneliteStatusBarSnapshot {
  readonly side: RuneliteStatusBarSide;
  readonly mode: RuneliteStatusBarMode;
  readonly sourceRenderer: string;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly maximumValue: number;
  readonly currentValue: number;
  readonly restoreValue: number;
  readonly filledHeight: number;
  readonly standardColor: string;
  readonly restoreColor: string;
  readonly iconPath: string | null;
  readonly iconWidth: number;
  readonly iconHeight: number;
  readonly enableCounter: boolean;
  readonly enableSkillIcon: boolean;
  readonly enableRestorationBars: boolean;
}

interface RuneliteStatusBarModeValue {
  readonly sourceRenderer: string;
  readonly maximumValue: number;
  readonly currentValue: number;
  readonly restoreValue: number;
  readonly standardColor: string;
  readonly restoreColor: string;
  readonly iconPath: string | null;
  readonly iconWidth: number;
  readonly iconHeight: number;
}

export function runeliteStatusBarSnapshots(
  fixedLayout: NhFixedClientLayout | null,
  cssLayout: NhFixedClientCssLayout | null,
  hud: RuntimeHudState,
  config: RuneliteStatusBarsConfigSnapshot
): readonly RuneliteStatusBarSnapshot[] {
  if (!config.enabled || !fixedLayout || !cssLayout) {
    return [];
  }

  const sourceContainer = fixedLayout.fixedViewportInterfaceContainer?.rect ?? fixedLayout.sidePanel?.rect ?? null;
  if (!sourceContainer) {
    return [];
  }

  return [
    runeliteStatusBarSnapshot("left", config.leftBarMode, sourceContainer, cssLayout, hud, config),
    runeliteStatusBarSnapshot("right", config.rightBarMode, sourceContainer, cssLayout, hud, config)
  ].filter((snapshot): snapshot is RuneliteStatusBarSnapshot => snapshot !== null);
}

export function runeliteStatusBarFillHeight(maximumValue: number, currentValue: number, size = RUNELITE_STATUS_BARS_HEIGHT): number {
  const maximum = Math.max(1, Math.trunc(maximumValue));
  const current = Math.max(0, Math.trunc(currentValue));
  const ratio = current / maximum;
  if (ratio >= 1) {
    return size;
  }
  return Math.round(ratio * size);
}

function runeliteStatusBarSnapshot(
  side: RuneliteStatusBarSide,
  mode: RuneliteStatusBarMode,
  container: NhRect,
  cssLayout: NhFixedClientCssLayout,
  hud: RuntimeHudState,
  config: RuneliteStatusBarsConfigSnapshot
): RuneliteStatusBarSnapshot | null {
  const value = runeliteStatusBarModeValue(mode, hud);
  if (!value) {
    return null;
  }

  const sourceX =
    side === "left"
      ? container.x - RUNELITE_STATUS_BARS_FIXED_LEFT_OFFSET.x
      : container.x - RUNELITE_STATUS_BARS_FIXED_RIGHT_OFFSET.x + container.width;
  const sourceY =
    side === "left"
      ? container.y - RUNELITE_STATUS_BARS_FIXED_LEFT_OFFSET.y
      : container.y - RUNELITE_STATUS_BARS_FIXED_RIGHT_OFFSET.y;
  const sourceHeight = RUNELITE_STATUS_BARS_HEIGHT;
  const sourceWidth = RUNELITE_STATUS_BARS_BAR_WIDTH;
  const left = cssLayout.surfaceRect.x + sourceX * cssLayout.scale;
  const top = cssLayout.surfaceRect.y + sourceY * cssLayout.scale;

  return {
    side,
    mode,
    sourceRenderer: value.sourceRenderer,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    left,
    top,
    width: sourceWidth,
    height: sourceHeight,
    maximumValue: value.maximumValue,
    currentValue: value.currentValue,
    restoreValue: value.restoreValue,
    filledHeight: runeliteStatusBarFillHeight(value.maximumValue, value.currentValue, sourceHeight),
    standardColor: value.standardColor,
    restoreColor: value.restoreColor,
    iconPath: value.iconPath,
    iconWidth: value.iconWidth,
    iconHeight: value.iconHeight,
    enableCounter: config.enableCounter,
    enableSkillIcon: config.enableSkillIcon,
    enableRestorationBars: config.enableRestorationBars
  };
}

function runeliteStatusBarModeValue(mode: RuneliteStatusBarMode, hud: RuntimeHudState): RuneliteStatusBarModeValue | null {
  if (mode === "Hitpoints") {
    return {
      sourceRenderer: "HitPointsRenderer",
      maximumValue: hud.skills?.hitpoints?.fixed ?? hud.hitpointsMax,
      currentValue: hud.skills?.hitpoints?.current ?? hud.hitpoints,
      restoreValue: 0,
      standardColor: "rgba(225, 35, 0, 0.49)",
      restoreColor: "rgba(255, 112, 6, 0.588)",
      iconPath: "runelite-ui/skill_icons_small/hitpoints.png",
      iconWidth: 16,
      iconHeight: 16
    };
  }

  if (mode === "Prayer") {
    return {
      sourceRenderer: "PrayerRenderer",
      maximumValue: hud.skills?.prayer?.fixed ?? hud.prayerMax,
      currentValue: hud.skills?.prayer?.current ?? hud.prayer,
      restoreValue: 0,
      standardColor: "rgba(50, 200, 200, 0.686)",
      restoreColor: "rgba(57, 255, 186, 0.294)",
      iconPath: "runelite-ui/skill_icons_small/prayer.png",
      iconWidth: 17,
      iconHeight: 17
    };
  }

  if (mode === "Run Energy") {
    return {
      sourceRenderer: "EnergyRenderer",
      maximumValue: 100,
      currentValue: hud.runEnergy,
      restoreValue: 0,
      standardColor: "rgba(199, 174, 0, 0.863)",
      restoreColor: "rgba(199, 118, 0, 0.855)",
      iconPath: null,
      iconWidth: 0,
      iconHeight: 0
    };
  }

  if (mode === "Special Attack") {
    return {
      sourceRenderer: "SpecialAttackRenderer",
      maximumValue: 100,
      currentValue: hud.specialEnergy,
      restoreValue: 0,
      standardColor: "rgba(3, 153, 0, 0.765)",
      restoreColor: "rgba(3, 153, 0, 0.765)",
      iconPath: null,
      iconWidth: 0,
      iconHeight: 0
    };
  }

  return null;
}
