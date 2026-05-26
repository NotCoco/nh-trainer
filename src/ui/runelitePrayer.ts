import { kronosActivePrayerIds } from "../render/kronosPrayer";
import type { RuntimeHudState } from "../render/runtimeScene";
import type { RunelitePrayerConfigSnapshot, RunelitePrayerFlickLocation } from "./RuneliteClientShell";

export const RUNELITE_PRAYER_BAR_FILL_RGBA = "rgb(0, 149, 151)";
export const RUNELITE_PRAYER_BAR_BACKGROUND_RGBA = "rgb(0, 0, 0)";
export const RUNELITE_PRAYER_FLICK_HELP_RGBA = "rgb(255, 255, 255)";
export const RUNELITE_PRAYER_ORB_FLICK_RGBA = "rgb(0, 255, 255)";
export const RUNELITE_PRAYER_BAR_WIDTH = 30;
export const RUNELITE_PRAYER_BAR_HEIGHT = 5;
export const RUNELITE_PRAYER_BAR_LOCAL_HEIGHT_OFFSET_PX = 10;
export const RUNELITE_PRAYER_HD_BAR_PADDING = 1;
export const RUNELITE_PRAYER_GAME_TICK_LENGTH_MS = 600;

export interface RunelitePrayerBarSnapshot {
  readonly currentPrayer: number;
  readonly maxPrayer: number;
  readonly ratio: number;
  readonly progressFill: number;
  readonly showFlickHelper: boolean;
  readonly flickLocation: RunelitePrayerFlickLocation;
  readonly flickXOffset: number;
  readonly tickProgressRadians: number;
  readonly width: number;
  readonly height: number;
}

export interface RunelitePrayerFlickOrbSnapshot {
  readonly showFlickHelper: boolean;
  readonly flickLocation: RunelitePrayerFlickLocation;
  readonly xOffset: number;
  readonly yOffset: number;
  readonly indicatorHeight: number;
  readonly tickProgressRadians: number;
}

export function runelitePrayerAnyActive(hud: RuntimeHudState): boolean {
  return kronosActivePrayerIds(hud.prayers).length > 0;
}

export function runelitePrayerTickProgressRadians(timeMs: number): number {
  const tickProgress = (timeMs % RUNELITE_PRAYER_GAME_TICK_LENGTH_MS) / RUNELITE_PRAYER_GAME_TICK_LENGTH_MS;
  return tickProgress * Math.PI;
}

export function runelitePrayerBarSnapshot(
  hud: RuntimeHudState,
  config: RunelitePrayerConfigSnapshot,
  tickProgressRadians: number,
  localPlayerInCombat: boolean
): RunelitePrayerBarSnapshot | null {
  if (!config.enabled || !config.showPrayerBar) {
    return null;
  }

  const prayersActive = runelitePrayerAnyActive(hud);
  if (config.hideIfNotPraying && !prayersActive) {
    return null;
  }
  if (config.hideIfOutOfCombat && !localPlayerInCombat) {
    return null;
  }

  const maxPrayer = Math.max(1, Math.trunc(hud.prayerMax));
  const currentPrayer = Math.max(0, Math.trunc(hud.prayer));
  const ratio = Math.max(0, Math.min(1, currentPrayer / maxPrayer));
  const showFlickHelper =
    (prayersActive || config.prayerFlickAlwaysOn) &&
    (config.prayerFlickLocation === "PRAYER_BAR" || config.prayerFlickLocation === "BOTH");
  const flickXOffset = Math.trunc(-Math.cos(tickProgressRadians) * RUNELITE_PRAYER_BAR_WIDTH / 2 + RUNELITE_PRAYER_BAR_WIDTH / 2);

  return {
    currentPrayer,
    maxPrayer,
    ratio,
    progressFill: Math.ceil(Math.min(RUNELITE_PRAYER_BAR_WIDTH * ratio, RUNELITE_PRAYER_BAR_WIDTH)),
    showFlickHelper,
    flickLocation: config.prayerFlickLocation,
    flickXOffset,
    tickProgressRadians,
    width: RUNELITE_PRAYER_BAR_WIDTH,
    height: RUNELITE_PRAYER_BAR_HEIGHT
  };
}

export function runelitePrayerFlickOrbSnapshot(
  hud: RuntimeHudState,
  config: RunelitePrayerConfigSnapshot,
  tickProgressRadians: number,
  orbInnerSize: number
): RunelitePrayerFlickOrbSnapshot | null {
  if (!config.enabled) {
    return null;
  }

  const prayersActive = runelitePrayerAnyActive(hud);
  const showFlickHelper =
    (prayersActive || config.prayerFlickAlwaysOn) &&
    (config.prayerFlickLocation === "PRAYER_ORB" || config.prayerFlickLocation === "BOTH");
  if (!showFlickHelper) {
    return null;
  }

  const xOffset = Math.trunc(-Math.cos(tickProgressRadians) * orbInnerSize / 2 + orbInnerSize / 2);
  const indicatorHeight = Math.sin(tickProgressRadians) * orbInnerSize;
  return {
    showFlickHelper,
    flickLocation: config.prayerFlickLocation,
    xOffset,
    yOffset: orbInnerSize / 2 - indicatorHeight / 2,
    indicatorHeight,
    tickProgressRadians
  };
}
