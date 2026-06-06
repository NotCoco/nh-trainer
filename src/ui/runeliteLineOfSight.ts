export const RUNELITE_LINE_OF_SIGHT_PLUGIN_ID = "line-of-sight";
export const RUNELITE_LINE_OF_SIGHT_CONFIG_GROUP = "lineofsight";
export const RUNELITE_LINE_OF_SIGHT_SOURCE_REPOSITORY = "https://github.com/Krazune/LineOfSight";
export const RUNELITE_LINE_OF_SIGHT_PLUGIN_HUB_PATH =
  "runelite/plugin-hub/plugins/line-of-sight repository=https://github.com/Krazune/LineOfSight.git commit=13e1a7fea214cb04ff6dd7b0441f455f96f94d27";
export const RUNELITE_LINE_OF_SIGHT_OVERLAY_POSITION = "OverlayPosition.DYNAMIC";
export const RUNELITE_LINE_OF_SIGHT_OVERLAY_LAYER = "OverlayLayer.ABOVE_SCENE";
export const RUNELITE_LINE_OF_SIGHT_DEFAULT_RANGE = 10;
export const RUNELITE_LINE_OF_SIGHT_DEFAULT_BORDER_COLOR = "#ffff00";
export const RUNELITE_LINE_OF_SIGHT_DEFAULT_FILL_RGBA = "rgba(255, 255, 0, 0.176)";
export const RUNELITE_LINE_OF_SIGHT_DEFAULT_ASYMMETRICAL_BORDER_COLOR = "#ff0000";
export const RUNELITE_LINE_OF_SIGHT_DEFAULT_ASYMMETRICAL_FILL_RGBA = "rgba(255, 0, 0, 0.176)";

export type RuneliteLineOfSightOverlayKind = "regular" | "asymmetrical";

export function runeliteLineOfSightClampedRange(value: number): number {
  return Math.min(10, Math.max(1, Math.trunc(value)));
}

export function runeliteLineOfSightClampedBorderWidth(value: number): number {
  return Math.min(12, Math.max(1, Math.trunc(value)));
}
