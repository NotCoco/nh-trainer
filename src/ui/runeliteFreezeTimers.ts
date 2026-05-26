import { KRONOS_GAME_TICK_MS } from "../render/kronosTileMovement";
import type { RuntimeActorId } from "../render/runtimeScene";
import type { RuntimePlayerCombatState } from "../sim";
import type { RuneliteFreezeTimersConfigSnapshot, RuneliteInfoBoxConfigSnapshot, RuneliteTimersConfigSnapshot } from "./RuneliteClientShell";

export const RUNELITE_FREEZE_TIMERS_FREEZE_IMAGE_PATH = "runelite-plugins/freezetimers/freeze.png";
export const RUNELITE_FREEZE_TIMERS_FREEZE_IMMUNE_IMAGE_PATH = "runelite-plugins/freezetimers/freezeimmune.png";
export const RUNELITE_FREEZE_TIMERS_BARRAGE_SPOTANIM_ID = 369;
export const RUNELITE_FREEZE_TIMERS_BARRAGE_DURATION_MS = 19200;
export const RUNELITE_FREEZE_TIMERS_FREEZE_IMMUNITY_MS = 3000;
export const RUNELITE_FREEZE_TIMERS_OVERLAY_Y_OFFSET_PX = 18;
export const RUNELITE_FREEZE_TIMERS_IMAGE_TEXT_GAP_PX = 1;
export const RUNELITE_FREEZE_TIMERS_IMAGE_WIDTH_PX = 16;
export const RUNELITE_FREEZE_TIMERS_IMAGE_HEIGHT_PX = 16;
export const RUNELITE_FREEZE_TIMERS_TIMER_FONT_PX = 14;
export const RUNELITE_FREEZE_TIMERS_FREEZE_IMMUNITY_TICKS = 5;
export const RUNELITE_TIMERS_ICE_BARRAGE_SPRITE_ID = 328;
export const RUNELITE_TIMERS_INFOBOX_GAP_PX = 1;
export const RUNELITE_TIMERS_FREEZE_INFOBOX_RENDER_ORDER = 220000;

export type RuneliteFreezeTimerOverlayState = "freeze" | "freeze-immune";

export interface RuneliteFreezeTimerOverlaySnapshot {
  readonly id: string;
  readonly actorId: RuntimeActorId;
  readonly state: RuneliteFreezeTimerOverlayState;
  readonly imagePath: string;
  readonly text: string;
  readonly textColor: "white" | "yellow";
  readonly freezeEndTick: number;
  readonly reapplyEndTick: number;
  readonly remainingTicks: number;
  readonly xOffset: number;
  readonly yOffset: number;
  readonly overlaysDrawn: number;
  readonly noImage: boolean;
  readonly fontStyle: string;
  readonly textSize: number;
}

export interface RuneliteFreezeTimerInfoBoxSnapshot {
  readonly id: string;
  readonly state: "freeze";
  readonly text: string;
  readonly freezeEndTick: number;
  readonly remainingTicks: number;
  readonly spriteId: number;
  readonly tooltip: string;
  readonly size: number;
  readonly width: number;
  readonly height: number;
  readonly gap: number;
  readonly renderOrder: number;
}

export function runeliteLocalFreezeTimerInfoBoxSnapshot(
  combatState: RuntimePlayerCombatState,
  timersConfig: RuneliteTimersConfigSnapshot,
  infoBoxConfig: RuneliteInfoBoxConfigSnapshot
): RuneliteFreezeTimerInfoBoxSnapshot | null {
  if (!timersConfig.enabled || !timersConfig.showFreezes) {
    return null;
  }

  const local = combatState.actors["local-player"];
  if (!local || local.locks.freezeUntilTick < combatState.tick) {
    return null;
  }

  const remainingTicks = Math.max(0, local.locks.freezeUntilTick - combatState.tick);
  const size = Math.max(1, Math.trunc(infoBoxConfig.size));
  return {
    id: "runelite-timers-local-freeze-infobox",
    state: "freeze",
    text: runeliteFreezeTimerText(remainingTicks * KRONOS_GAME_TICK_MS),
    freezeEndTick: local.locks.freezeUntilTick,
    remainingTicks,
    spriteId: RUNELITE_TIMERS_ICE_BARRAGE_SPRITE_ID,
    tooltip: "Ice barrage",
    size,
    width: size,
    height: size,
    gap: RUNELITE_TIMERS_INFOBOX_GAP_PX,
    renderOrder: RUNELITE_TIMERS_FREEZE_INFOBOX_RENDER_ORDER
  };
}

export function runeliteFreezeTimerOverlaySnapshotsFromCombatState(
  combatState: RuntimePlayerCombatState,
  config: RuneliteFreezeTimersConfigSnapshot
): readonly RuneliteFreezeTimerOverlaySnapshot[] {
  if (!config.enabled || !config.showPlayers || !config.freezeTimers) {
    return [];
  }

  const overlays: RuneliteFreezeTimerOverlaySnapshot[] = [];

  for (const actor of Object.values(combatState.actors)) {
    const overlay = runeliteFreezeTimerOverlayForActor(actor.id, actor.locks.freezeUntilTick, combatState.tick, config);
    if (overlay) {
      overlays.push(overlay);
    }
  }

  return overlays;
}

export function runeliteFreezeTimerOverlayForActor(
  actorId: RuntimeActorId,
  freezeUntilTick: number,
  currentTick: number,
  config: RuneliteFreezeTimersConfigSnapshot
): RuneliteFreezeTimerOverlaySnapshot | null {
  if (freezeUntilTick < 0) {
    return null;
  }

  const reapplyEndTick = freezeUntilTick + RUNELITE_FREEZE_TIMERS_FREEZE_IMMUNITY_TICKS;
  if (reapplyEndTick < currentTick) {
    return null;
  }

  const frozen = freezeUntilTick >= currentTick;
  const targetTick = frozen ? freezeUntilTick : reapplyEndTick;
  const remainingTicks = Math.max(0, targetTick - currentTick);
  const state: RuneliteFreezeTimerOverlayState = frozen ? "freeze" : "freeze-immune";

  return {
    id: `runelite-freeze-timers-${actorId}-${state}`,
    actorId,
    state,
    imagePath: frozen ? RUNELITE_FREEZE_TIMERS_FREEZE_IMAGE_PATH : RUNELITE_FREEZE_TIMERS_FREEZE_IMMUNE_IMAGE_PATH,
    text: runeliteFreezeTimerText(remainingTicks * KRONOS_GAME_TICK_MS),
    textColor: frozen || !config.noImage ? "white" : "yellow",
    freezeEndTick: freezeUntilTick,
    reapplyEndTick,
    remainingTicks,
    xOffset: config.xOffset,
    yOffset: 0,
    overlaysDrawn: 0,
    noImage: config.noImage,
    fontStyle: config.fontStyle,
    textSize: config.textSize
  };
}

export function runeliteFreezeTimerText(remainingMs: number): string {
  const secondsRemaining = Math.max(0, Math.floor(remainingMs / 1000)) + 1;
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const secondsText = seconds > 9 ? String(seconds) : `0${seconds}`;
  return minutes > 0 ? `${minutes}:${secondsText}` : secondsText;
}
