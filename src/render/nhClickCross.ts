export type NhClickCrossColor = "yellow" | "red";
export type NhMouseCrossColor = 1 | 2;

export interface NhClickCrossSpriteSource {
  readonly spriteId: number;
  readonly x?: number;
  readonly y?: number;
}

export interface NhClickCrossDefinition {
  readonly color: NhClickCrossColor;
  readonly mouseCrossColor: NhMouseCrossColor;
  readonly frame: number;
  readonly spriteId: number;
  readonly drawOffset: number;
}

export type NhClickCrossDefinitionStore = ReadonlyMap<string, NhClickCrossDefinition>;

export const NH_MOUSE_CROSS_YELLOW_COLOR = 1;
export const NH_MOUSE_CROSS_RED_COLOR = 2;
export const NH_MOUSE_CROSS_FRAME_COUNT = 4;
export const NH_MOUSE_CROSS_FRAME_STATE_CYCLES = 100;
export const NH_MOUSE_CROSS_STATE_STEP = 20;
export const NH_MOUSE_CROSS_LIFETIME_STATE = 400;
export const NH_MOUSE_CROSS_DRAW_OFFSET = 8;
export const NH_MOUSE_CROSS_CLIENT_CYCLE_MS = 20;
export const NH_MOUSE_CROSS_FRAME_MS =
  (NH_MOUSE_CROSS_FRAME_STATE_CYCLES / NH_MOUSE_CROSS_STATE_STEP) * NH_MOUSE_CROSS_CLIENT_CYCLE_MS;
export const NH_MOUSE_CROSS_LIFETIME_MS =
  (NH_MOUSE_CROSS_LIFETIME_STATE / NH_MOUSE_CROSS_STATE_STEP) * NH_MOUSE_CROSS_CLIENT_CYCLE_MS;

export function createNhClickCrossDefinitionStore(source: unknown): NhClickCrossDefinitionStore {
  const sprites = clickCrossSpriteEntries(source)
    .map((entry, index) => normalizeClickCrossSprite(entry, index))
    .filter((entry): entry is Required<NhClickCrossSpriteSource> => entry !== null)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  return sprites.length >= NH_MOUSE_CROSS_FRAME_COUNT * 2
    ? buildClickCrossDefinitionStore(sprites.slice(0, NH_MOUSE_CROSS_FRAME_COUNT * 2))
    : new Map();
}

export function nhClickCrossDefinition(
  definitions: NhClickCrossDefinitionStore,
  color: NhClickCrossColor,
  frame: number
): NhClickCrossDefinition | null {
  const normalizedFrame = normalizeClickCrossFrame(frame);
  return definitions.get(clickCrossKey(color, normalizedFrame)) ?? null;
}

export function nhClickCrossFrameFromState(mouseCrossState: number): number {
  return normalizeClickCrossFrame(Math.trunc(mouseCrossState / NH_MOUSE_CROSS_FRAME_STATE_CYCLES));
}

export function nhClickCrossStateFromElapsedMs(elapsedMs: number): number {
  const elapsedCycles = Math.max(0, Math.trunc(elapsedMs / NH_MOUSE_CROSS_CLIENT_CYCLE_MS));
  return elapsedCycles * NH_MOUSE_CROSS_STATE_STEP;
}

export function nhClickCrossFrameFromElapsedMs(elapsedMs: number): number {
  return nhClickCrossFrameFromState(nhClickCrossStateFromElapsedMs(elapsedMs));
}

export function nhClickCrossExpired(elapsedMs: number): boolean {
  return nhClickCrossStateFromElapsedMs(elapsedMs) >= NH_MOUSE_CROSS_LIFETIME_STATE;
}

function buildClickCrossDefinitionStore(sprites: readonly Required<NhClickCrossSpriteSource>[]): NhClickCrossDefinitionStore {
  const definitions = new Map<string, NhClickCrossDefinition>();
  for (let index = 0; index < Math.min(sprites.length, NH_MOUSE_CROSS_FRAME_COUNT * 2); index += 1) {
    const color = index < NH_MOUSE_CROSS_FRAME_COUNT ? "yellow" : "red";
    const frame = index % NH_MOUSE_CROSS_FRAME_COUNT;
    const mouseCrossColor =
      color === "yellow" ? NH_MOUSE_CROSS_YELLOW_COLOR : NH_MOUSE_CROSS_RED_COLOR;
    definitions.set(clickCrossKey(color, frame), {
      color,
      mouseCrossColor,
      frame,
      spriteId: sprites[index].spriteId,
      drawOffset: NH_MOUSE_CROSS_DRAW_OFFSET
    });
  }
  return definitions;
}

function clickCrossKey(color: NhClickCrossColor, frame: number): string {
  return `${color}:${normalizeClickCrossFrame(frame)}`;
}

function normalizeClickCrossFrame(frame: number): number {
  if (!Number.isFinite(frame)) {
    return 0;
  }
  return Math.max(0, Math.min(NH_MOUSE_CROSS_FRAME_COUNT - 1, Math.trunc(frame)));
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

function normalizeClickCrossSprite(source: unknown, index: number): Required<NhClickCrossSpriteSource> | null {
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
