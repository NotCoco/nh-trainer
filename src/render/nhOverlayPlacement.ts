import type { RuntimeRenderEvent } from "./runtimeScene";

export interface NhSpriteLike {
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface NhActorOverlayPlacement {
  readonly anchorClientUnits: number;
  readonly centerOffsetXPixels: number;
  readonly centerOffsetYPixelsDown: number;
}

export const NH_PLAYER_DEFAULT_HEIGHT_CLIENT_UNITS = 200;

const OVERHEAD_ANCHOR_CLIENT_UNITS = NH_PLAYER_DEFAULT_HEIGHT_CLIENT_UNITS + 15;
const HITSPLAT_ANCHOR_CLIENT_UNITS = NH_PLAYER_DEFAULT_HEIGHT_CLIENT_UNITS / 2;
const OVERLAY_STACK_START_Y = -2;
const OVERHEAD_BASE_STACK_Y = 5;
const HEAD_ICON_STACK_STEP_Y = 25;
const HEAD_ICON_DRAW_X = -12;
const HEALTH_BAR_GAP_Y = 2;
const HITSPLAT_TOP_Y = -12;

export function nhOverlaySortValue(event: RuntimeRenderEvent): number {
  if (event.clientOrder !== undefined) {
    return event.clientOrder;
  }
  if (event.spriteSheetId === "health_bars") {
    return 10;
  }
  if (event.spriteSheetId === "pk_skull") {
    return 20;
  }
  if (event.spriteSheetId === "prayer_overheads") {
    return 30;
  }
  if (event.spriteSheetId === "hitsplats") {
    return 40;
  }
  return 50;
}

export function nhActorOverlayPlacement(
  event: RuntimeRenderEvent,
  actorEvents: readonly RuntimeRenderEvent[],
  sprite: NhSpriteLike | undefined,
  stackIndex: number
): NhActorOverlayPlacement | null {
  if (event.spriteSheetId === "hitsplats") {
    return hitSplatPlacement(sprite, event.hitsplat?.slotIndex ?? stackIndex);
  }

  if (event.spriteSheetId === "health_bars") {
    return healthBarPlacement(sprite, stackIndex);
  }

  if (event.spriteSheetId === "pk_skull") {
    return headIconPlacement(sprite, OVERHEAD_BASE_STACK_Y + HEAD_ICON_STACK_STEP_Y);
  }

  if (event.spriteSheetId === "prayer_overheads") {
    const hasPkSkull = actorEvents.some((candidate) => candidate.spriteSheetId === "pk_skull");
    return headIconPlacement(
      sprite,
      OVERHEAD_BASE_STACK_Y + HEAD_ICON_STACK_STEP_Y * (hasPkSkull ? 2 : 1)
    );
  }

  return {
    anchorClientUnits: OVERHEAD_ANCHOR_CLIENT_UNITS,
    centerOffsetXPixels: 0,
    centerOffsetYPixelsDown: 0
  };
}

function healthBarPlacement(sprite: NhSpriteLike | undefined, stackIndex: number): NhActorOverlayPlacement | null {
  if (!sprite) {
    return null;
  }

  const height = sprite.height;
  const stackY = OVERLAY_STACK_START_Y + stackIndex * (height + HEALTH_BAR_GAP_Y) + height;
  return {
    anchorClientUnits: OVERHEAD_ANCHOR_CLIENT_UNITS,
    centerOffsetXPixels: 0,
    centerOffsetYPixelsDown: -stackY + height / 2
  };
}

function headIconPlacement(sprite: NhSpriteLike | undefined, stackY: number): NhActorOverlayPlacement | null {
  if (!sprite) {
    return null;
  }

  const center = spriteDrawAtCenter(HEAD_ICON_DRAW_X, -stackY, sprite);
  return {
    anchorClientUnits: OVERHEAD_ANCHOR_CLIENT_UNITS,
    centerOffsetXPixels: center.x,
    centerOffsetYPixelsDown: center.y
  };
}

function hitSplatPlacement(sprite: NhSpriteLike | undefined, stackIndex: number): NhActorOverlayPlacement | null {
  if (!sprite) {
    return null;
  }

  const slot = stackIndex % 4;
  const slotOffsetX = slot === 2 ? -15 : slot === 3 ? 15 : 0;
  const slotOffsetY = slot === 1 ? -20 : slot >= 2 ? -10 : 0;
  const center = spriteDrawAtCenter(slotOffsetX - sprite.width / 2, HITSPLAT_TOP_Y + slotOffsetY, sprite);
  return {
    anchorClientUnits: HITSPLAT_ANCHOR_CLIENT_UNITS,
    centerOffsetXPixels: center.x,
    centerOffsetYPixelsDown: center.y
  };
}

function spriteDrawAtCenter(
  drawX: number,
  drawY: number,
  sprite: NhSpriteLike
): { readonly x: number; readonly y: number } {
  return {
    x: drawX + sprite.offsetX + sprite.width / 2,
    y: drawY + sprite.offsetY + sprite.height / 2
  };
}
