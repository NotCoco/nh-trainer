export type KronosClickCrossColor = "yellow" | "red";
export type KronosMouseCrossColor = 1 | 2;

export interface KronosClickCrossSpriteSource {
  readonly spriteId: number;
  readonly x?: number;
  readonly y?: number;
}

export interface KronosClickCrossDefinition {
  readonly color: KronosClickCrossColor;
  readonly mouseCrossColor: KronosMouseCrossColor;
  readonly frame: number;
  readonly spriteId: number;
  readonly drawOffset: number;
}

export type KronosClickCrossDefinitionStore = ReadonlyMap<string, KronosClickCrossDefinition>;

export const KRONOS_MOUSE_CROSS_YELLOW_COLOR = 1;
export const KRONOS_MOUSE_CROSS_RED_COLOR = 2;
export const KRONOS_MOUSE_CROSS_FRAME_COUNT = 4;
export const KRONOS_MOUSE_CROSS_FRAME_STATE_CYCLES = 100;
export const KRONOS_MOUSE_CROSS_STATE_STEP = 20;
export const KRONOS_MOUSE_CROSS_LIFETIME_STATE = 400;
export const KRONOS_MOUSE_CROSS_DRAW_OFFSET = 8;
export const KRONOS_MOUSE_CROSS_CLIENT_CYCLE_MS = 20;
export const KRONOS_MOUSE_CROSS_FRAME_MS =
  (KRONOS_MOUSE_CROSS_FRAME_STATE_CYCLES / KRONOS_MOUSE_CROSS_STATE_STEP) * KRONOS_MOUSE_CROSS_CLIENT_CYCLE_MS;
export const KRONOS_MOUSE_CROSS_LIFETIME_MS =
  (KRONOS_MOUSE_CROSS_LIFETIME_STATE / KRONOS_MOUSE_CROSS_STATE_STEP) * KRONOS_MOUSE_CROSS_CLIENT_CYCLE_MS;

export function createKronosClickCrossDefinitionStore(source: unknown): KronosClickCrossDefinitionStore {
  const sprites = clickCrossSpriteEntries(source)
    .map((entry, index) => normalizeClickCrossSprite(entry, index))
    .filter((entry): entry is Required<KronosClickCrossSpriteSource> => entry !== null)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  return sprites.length >= KRONOS_MOUSE_CROSS_FRAME_COUNT * 2
    ? buildClickCrossDefinitionStore(sprites.slice(0, KRONOS_MOUSE_CROSS_FRAME_COUNT * 2))
    : new Map();
}

export function kronosClickCrossDefinition(
  definitions: KronosClickCrossDefinitionStore,
  color: KronosClickCrossColor,
  frame: number
): KronosClickCrossDefinition | null {
  const normalizedFrame = normalizeClickCrossFrame(frame);
  return definitions.get(clickCrossKey(color, normalizedFrame)) ?? null;
}

export function kronosClickCrossFrameFromState(mouseCrossState: number): number {
  return normalizeClickCrossFrame(Math.trunc(mouseCrossState / KRONOS_MOUSE_CROSS_FRAME_STATE_CYCLES));
}

export function kronosClickCrossStateFromElapsedMs(elapsedMs: number): number {
  const elapsedCycles = Math.max(0, Math.trunc(elapsedMs / KRONOS_MOUSE_CROSS_CLIENT_CYCLE_MS));
  return elapsedCycles * KRONOS_MOUSE_CROSS_STATE_STEP;
}

export function kronosClickCrossFrameFromElapsedMs(elapsedMs: number): number {
  return kronosClickCrossFrameFromState(kronosClickCrossStateFromElapsedMs(elapsedMs));
}

export function kronosClickCrossExpired(elapsedMs: number): boolean {
  return kronosClickCrossStateFromElapsedMs(elapsedMs) >= KRONOS_MOUSE_CROSS_LIFETIME_STATE;
}

function buildClickCrossDefinitionStore(sprites: readonly Required<KronosClickCrossSpriteSource>[]): KronosClickCrossDefinitionStore {
  const definitions = new Map<string, KronosClickCrossDefinition>();
  for (let index = 0; index < Math.min(sprites.length, KRONOS_MOUSE_CROSS_FRAME_COUNT * 2); index += 1) {
    const color = index < KRONOS_MOUSE_CROSS_FRAME_COUNT ? "yellow" : "red";
    const frame = index % KRONOS_MOUSE_CROSS_FRAME_COUNT;
    const mouseCrossColor =
      color === "yellow" ? KRONOS_MOUSE_CROSS_YELLOW_COLOR : KRONOS_MOUSE_CROSS_RED_COLOR;
    definitions.set(clickCrossKey(color, frame), {
      color,
      mouseCrossColor,
      frame,
      spriteId: sprites[index].spriteId,
      drawOffset: KRONOS_MOUSE_CROSS_DRAW_OFFSET
    });
  }
  return definitions;
}

function clickCrossKey(color: KronosClickCrossColor, frame: number): string {
  return `${color}:${normalizeClickCrossFrame(frame)}`;
}

function normalizeClickCrossFrame(frame: number): number {
  if (!Number.isFinite(frame)) {
    return 0;
  }
  return Math.max(0, Math.min(KRONOS_MOUSE_CROSS_FRAME_COUNT - 1, Math.trunc(frame)));
}

function clickCrossSpriteEntries(source: unknown): readonly unknown[] {
  if (Array.isArray(source)) {
    return source;
  }
  if (!source || typeof source !== "object") {
    return [];
  }
  const sprites = (source as Record<string, unknown>).sprites;
  return Array.isArray(sprites) ? sprites : [];
}

function normalizeClickCrossSprite(source: unknown, index: number): Required<KronosClickCrossSpriteSource> | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const record = source as Record<string, unknown>;
  const spriteId = integerField(record.spriteId);
  if (spriteId === undefined) {
    return null;
  }

  return {
    spriteId,
    x: integerField(record.x) ?? index,
    y: integerField(record.y) ?? 0
  };
}

function integerField(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return undefined;
}
