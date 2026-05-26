export const RUNELITE_TILE_INDICATORS_CONFIG_GROUP = "tileindicators";
export const RUNELITE_TILE_INDICATORS_OVERLAY_POSITION = "OverlayPosition.DYNAMIC";
export const RUNELITE_TILE_INDICATORS_OVERLAY_LAYER = "OverlayLayer.ABOVE_SCENE";
export const RUNELITE_TILE_INDICATORS_OVERLAY_PRIORITY = "OverlayPriority.MED";
export const RUNELITE_TILE_INDICATORS_FILL_RGBA = "rgba(0, 0, 0, 0.196)";
export const RUNELITE_TILE_INDICATORS_STROKE_WIDTH = 2;
export const RUNELITE_TILE_INDICATORS_THIN_STROKE_WIDTH = 1;

export type RuneliteTileIndicatorKind = "hovered" | "destination" | "current";

export function runeliteTileIndicatorStrokeWidth(thin: boolean): number {
  return thin ? RUNELITE_TILE_INDICATORS_THIN_STROKE_WIDTH : RUNELITE_TILE_INDICATORS_STROKE_WIDTH;
}
