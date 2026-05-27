import type { NhFixedClientCssLayout, NhFixedClientLayout, NhFixedOrbId, NhFixedOrbLayout } from "../render/nhFixedLayout";
import type { RuntimeHudState } from "../render/runtimeScene";
import type { RuneliteStatusOrbsConfigSnapshot } from "./RuneliteClientShell";

export const RUNELITE_STATUS_ORBS_SPEC_REGEN_TICKS = 50;
export const RUNELITE_STATUS_ORBS_NORMAL_HP_REGEN_TICKS = 100;
export const RUNELITE_STATUS_ORBS_DIAMETER = 26;
export const RUNELITE_STATUS_ORBS_OFFSET = 27;
export const RUNELITE_STATUS_ORBS_STROKE_WIDTH = 2;
export const RUNELITE_STATUS_ORBS_OVERLAY_POSITION = "OverlayPosition.DYNAMIC";
export const RUNELITE_STATUS_ORBS_OVERLAY_LAYER = "OverlayLayer.ABOVE_WIDGETS";
export const RUNELITE_STATUS_ORBS_ARC_SOURCE = "Arc2D.Double(bounds.x + OFFSET, bounds.y + (bounds.height / 2 - DIAMETER / 2), DIAMETER, DIAMETER, 90.d, -360.d * percent, Arc2D.OPEN)";
export const RUNELITE_STATUS_ORBS_STROKE_SOURCE = "new BasicStroke(2f, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER)";
export const RUNELITE_STATUS_ORBS_HITPOINTS_COLOR = runeliteStatusOrbBrighterCss(0x9b0703);
export const RUNELITE_STATUS_ORBS_SPECIAL_COLOR = runeliteStatusOrbBrighterCss(0x1e95b0);
export const RUNELITE_STATUS_ORBS_RUN_COLOR = "rgb(255, 215, 0)";
export const RUNELITE_STATUS_ORBS_SPECIAL_ACTIVE_OVERLAY_RGBA = "rgba(255, 255, 255, 0.235)";
export const RUNELITE_STATUS_ORBS_RUN_ORB_TEXT_SOURCE = "WidgetInfo.MINIMAP_RUN_ORB_TEXT";
export const RUNELITE_STATUS_ORBS_DEFAULT_WEIGHT_KG = 0;
export const RUNELITE_STATUS_ORBS_STAMINA_DEPLETION_MULTIPLIER = 0.3;

export type RuneliteStatusOrbKind = "hitpoints" | "special" | "run";

export interface RuneliteStatusOrbsRunTimeOptions {
  readonly weightKg?: number;
  readonly staminaActive?: boolean;
}

export interface RuneliteStatusOrbSnapshot {
  readonly id: RuneliteStatusOrbKind;
  readonly orbId: NhFixedOrbId;
  readonly sourceWidget: string;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly left: number;
  readonly top: number;
  readonly diameter: number;
  readonly percent: number;
  readonly color: string;
  readonly arcPath: string;
  readonly activeOverlay: boolean;
}

export function runeliteStatusOrbSnapshots(
  fixedLayout: NhFixedClientLayout | null,
  cssLayout: NhFixedClientCssLayout | null,
  hud: RuntimeHudState,
  config: RuneliteStatusOrbsConfigSnapshot,
  gameTick: number
): readonly RuneliteStatusOrbSnapshot[] {
  if (!config.enabled || !fixedLayout || !cssLayout) {
    return [];
  }

  const snapshots: RuneliteStatusOrbSnapshot[] = [];
  if (config.showHitpoints) {
    const hitpoints = runeliteStatusOrbSnapshot(
      "hitpoints",
      "hp",
      "WidgetInfo.MINIMAP_HEALTH_ORB",
      fixedLayout,
      cssLayout,
      runeliteStatusOrbsHitpointsPercentage(hud, config, gameTick),
      RUNELITE_STATUS_ORBS_HITPOINTS_COLOR,
      false
    );
    if (hitpoints) {
      snapshots.push(hitpoints);
    }
  }

  if (config.showSpecial) {
    const special = runeliteStatusOrbSnapshot(
      "special",
      "spec",
      "WidgetInfo.MINIMAP_SPEC_ORB",
      fixedLayout,
      cssLayout,
      hud.specialEnergy >= 100 ? 0 : runeliteStatusOrbTickProgress(gameTick, RUNELITE_STATUS_ORBS_SPEC_REGEN_TICKS),
      RUNELITE_STATUS_ORBS_SPECIAL_COLOR,
      hud.specialActive === true
    );
    if (special) {
      snapshots.push(special);
    }
  }

  if (config.showRun) {
    const run = runeliteStatusOrbSnapshot(
      "run",
      "run",
      "WidgetInfo.MINIMAP_RUN_ORB",
      fixedLayout,
      cssLayout,
      runeliteStatusOrbsRunPercentage(hud, gameTick),
      RUNELITE_STATUS_ORBS_RUN_COLOR,
      false
    );
    if (run) {
      snapshots.push(run);
    }
  }

  return snapshots;
}

export function runeliteStatusOrbsRunOrbText(
  hud: RuntimeHudState,
  config: RuneliteStatusOrbsConfigSnapshot,
  options: RuneliteStatusOrbsRunTimeOptions = {}
): string | null {
  if (!config.enabled || !config.replaceOrbText) {
    return null;
  }

  return runeliteStatusOrbsEstimatedRunTimeRemaining(hud.runEnergy, true, options);
}

export function runeliteStatusOrbsEstimatedRunTimeRemaining(
  runEnergy: number,
  inSeconds: boolean,
  options: RuneliteStatusOrbsRunTimeOptions = {}
): string {
  const effectiveWeight = Math.max(options.weightKg ?? RUNELITE_STATUS_ORBS_DEFAULT_WEIGHT_KG, 0);
  let lossRate = Math.min(effectiveWeight, 64) / 100 + 0.64;

  if (options.staminaActive === true) {
    lossRate *= RUNELITE_STATUS_ORBS_STAMINA_DEPLETION_MULTIPLIER;
  }

  const secondsLeft = (Math.max(0, Math.trunc(runEnergy)) * 0.6) / lossRate;
  if (inSeconds) {
    return `${Math.floor(secondsLeft)}s`;
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = Math.floor(secondsLeft - minutes * 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function runeliteStatusOrbArcPath(percent: number): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(percent) ? percent : 0));
  if (clamped <= 0) {
    return "";
  }

  const radius = RUNELITE_STATUS_ORBS_DIAMETER / 2;
  const center = radius;
  if (clamped >= 0.999) {
    return `M ${center} 0 A ${radius} ${radius} 0 1 1 ${center} ${RUNELITE_STATUS_ORBS_DIAMETER} A ${radius} ${radius} 0 1 1 ${center} 0`;
  }

  const angle = clamped * Math.PI * 2;
  const x = center + radius * Math.sin(angle);
  const y = center - radius * Math.cos(angle);
  const largeArc = clamped > 0.5 ? 1 : 0;
  return `M ${center} 0 A ${radius} ${radius} 0 ${largeArc} 1 ${runeliteStatusOrbPathNumber(x)} ${runeliteStatusOrbPathNumber(y)}`;
}

function runeliteStatusOrbSnapshot(
  id: RuneliteStatusOrbKind,
  orbId: NhFixedOrbId,
  sourceWidget: string,
  fixedLayout: NhFixedClientLayout,
  cssLayout: NhFixedClientCssLayout,
  percent: number,
  color: string,
  activeOverlay: boolean
): RuneliteStatusOrbSnapshot | null {
  const orb = statusOrbLayout(fixedLayout, orbId);
  if (!orb) {
    return null;
  }

  const sourceX = orb.rect.x + RUNELITE_STATUS_ORBS_OFFSET;
  const sourceY = orb.rect.y + (orb.rect.height / 2 - RUNELITE_STATUS_ORBS_DIAMETER / 2);
  const clampedPercent = Math.max(0, Math.min(1, Number.isFinite(percent) ? percent : 0));

  return {
    id,
    orbId,
    sourceWidget,
    sourceX,
    sourceY,
    left: cssLayout.surfaceRect.x + sourceX * cssLayout.scale,
    top: cssLayout.surfaceRect.y + sourceY * cssLayout.scale,
    diameter: RUNELITE_STATUS_ORBS_DIAMETER,
    percent: clampedPercent,
    color,
    arcPath: runeliteStatusOrbArcPath(clampedPercent),
    activeOverlay
  };
}

function statusOrbLayout(fixedLayout: NhFixedClientLayout, id: NhFixedOrbId): NhFixedOrbLayout | null {
  return fixedLayout.orbs.find((orb) => orb.id === id) ?? null;
}

function runeliteStatusOrbsHitpointsPercentage(
  hud: RuntimeHudState,
  config: RuneliteStatusOrbsConfigSnapshot,
  gameTick: number
): number {
  const current = hud.skills?.hitpoints?.current ?? hud.hitpoints;
  const maximum = hud.skills?.hitpoints?.fixed ?? hud.hitpointsMax;
  const ticksPerHpRegen = hud.prayers?.["rapid-heal"] === true
    ? RUNELITE_STATUS_ORBS_NORMAL_HP_REGEN_TICKS / 2
    : RUNELITE_STATUS_ORBS_NORMAL_HP_REGEN_TICKS;
  const percentage = runeliteStatusOrbTickProgress(gameTick, ticksPerHpRegen);

  if (current === maximum && !config.showWhenNoChange) {
    return 0;
  }

  if (current > maximum) {
    return 1 - percentage;
  }

  return percentage;
}

function runeliteStatusOrbsRunPercentage(hud: RuntimeHudState, gameTick: number): number {
  if (hud.runEnergy >= 100) {
    return 0;
  }

  const agility = Math.max(1, hud.skills?.agility?.current ?? hud.skills?.agility?.fixed ?? 1);
  const runRegenPerTick = (agility / 6 + 8) / 100;
  return Math.min(1, Math.max(0, (Math.trunc(gameTick) % Math.max(1, Math.ceil(1 / runRegenPerTick))) * runRegenPerTick));
}

function runeliteStatusOrbTickProgress(gameTick: number, tickCycle: number): number {
  return (Math.max(0, Math.trunc(gameTick)) % Math.max(1, Math.trunc(tickCycle))) / Math.max(1, Math.trunc(tickCycle));
}

function runeliteStatusOrbBrighterCss(color: number): string {
  const r = (color >>> 16) & 0xff;
  const g = (color >>> 8) & 0xff;
  const b = color & 0xff;
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    if (max === rn) {
      hue = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      hue = (bn - rn) / delta + 2;
    } else {
      hue = (rn - gn) / delta + 4;
    }
    hue /= 6;
    if (hue < 0) {
      hue += 1;
    }
  }

  const [brightR, brightG, brightB] = runeliteStatusOrbHsvToRgb(hue, 1, 1);
  return `rgb(${brightR}, ${brightG}, ${brightB})`;
}

function runeliteStatusOrbHsvToRgb(hue: number, saturation: number, value: number): readonly [number, number, number] {
  const h = ((hue % 1) + 1) % 1;
  const sector = Math.floor(h * 6);
  const fraction = h * 6 - sector;
  const p = value * (1 - saturation);
  const q = value * (1 - fraction * saturation);
  const t = value * (1 - (1 - fraction) * saturation);
  const values: readonly [number, number, number] =
    sector % 6 === 0
      ? [value, t, p]
      : sector % 6 === 1
        ? [q, value, p]
        : sector % 6 === 2
          ? [p, value, t]
          : sector % 6 === 3
            ? [p, q, value]
            : sector % 6 === 4
              ? [t, p, value]
              : [value, p, q];
  return [
    Math.round(values[0] * 255),
    Math.round(values[1] * 255),
    Math.round(values[2] * 255)
  ];
}

function runeliteStatusOrbPathNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}
