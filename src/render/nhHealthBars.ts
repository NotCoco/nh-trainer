export const NH_PLAYER_HEALTH_BAR_DEFINITION_ID = 0;
export const NH_HEALTH_BAR_FRONT_SPRITE_ID = 2176;
export const NH_HEALTH_BAR_BACK_SPRITE_ID = 2177;
export const NH_HEALTH_BAR_WIDTH = 30;

export interface NhHealthBarDefinition {
  readonly id: number;
  readonly frontSpriteId: number;
  readonly backSpriteId: number;
  readonly width: number;
  readonly widthPadding: number;
  readonly interpolationStep: number;
  readonly lifetimeCycles: number;
  readonly fadeStartCycle: number;
  readonly opacityStart: number;
  readonly opacityEnd: number;
}

export interface NhHealthBarUpdateState {
  readonly cycle: number;
  readonly health: number;
  readonly health2: number;
  readonly cycleOffset: number;
}

export interface NhHealthBarRenderState {
  readonly definition: NhHealthBarDefinition;
  readonly update: NhHealthBarUpdateState;
}

export interface NhHealthBarLayout {
  readonly frontSpriteId: number;
  readonly backSpriteId: number;
  readonly widthPixels: number;
  readonly clipWidthPixels: number;
  readonly widthRatio: number;
  readonly alpha: number;
}

export type NhHealthBarDefinitionStore = ReadonlyMap<number, NhHealthBarDefinition>;

const defaultPlayerHealthBarDefinition: NhHealthBarDefinition = {
  id: NH_PLAYER_HEALTH_BAR_DEFINITION_ID,
  frontSpriteId: NH_HEALTH_BAR_FRONT_SPRITE_ID,
  backSpriteId: NH_HEALTH_BAR_BACK_SPRITE_ID,
  width: NH_HEALTH_BAR_WIDTH,
  widthPadding: 0,
  interpolationStep: 1,
  lifetimeCycles: 300,
  fadeStartCycle: -1,
  opacityStart: 250,
  opacityEnd: 250
};

export const defaultNhHealthBarDefinitions: NhHealthBarDefinitionStore = new Map<number, NhHealthBarDefinition>([
  [NH_PLAYER_HEALTH_BAR_DEFINITION_ID, defaultPlayerHealthBarDefinition]
]);

export const nhPlayerHealthBarDefinition = defaultPlayerHealthBarDefinition;

export function createNhHealthBarDefinitionStore(source: unknown): NhHealthBarDefinitionStore {
  const store = new Map<number, NhHealthBarDefinition>();
  for (const entry of healthBarSourceEntries(source)) {
    const definition = normalizeHealthBarDefinition(entry);
    if (definition) {
      store.set(definition.id, definition);
    }
  }
  return store.size > 0 ? store : defaultNhHealthBarDefinitions;
}

export function nhHealthBarDefinition(
  definitionId: number,
  definitions: NhHealthBarDefinitionStore = defaultNhHealthBarDefinitions
): NhHealthBarDefinition | null {
  return definitions.get(definitionId) ?? null;
}

export function createNhHealthBarRenderState(
  cycle: number,
  healthRatio: number,
  previousHealthRatio = healthRatio,
  cycleOffset = 0,
  definition: NhHealthBarDefinition = nhPlayerHealthBarDefinition
): NhHealthBarRenderState {
  return {
    definition,
    update: {
      cycle,
      health: ratioToDefinitionHealth(previousHealthRatio, definition),
      health2: ratioToDefinitionHealth(healthRatio, definition),
      cycleOffset
    }
  };
}

export function layoutNhHealthBar(
  healthBar: NhHealthBarRenderState,
  clientCycle: number,
  frontSpriteWidth: number = healthBar.definition.width
): NhHealthBarLayout {
  const definition = healthBar.definition;
  const update = healthBar.update;
  const widthPixels = frontSpriteWidth - healthBarWidthPadding(definition, frontSpriteWidth) * 2;
  const elapsedCycles = Math.max(0, clientCycle - update.cycle);
  const targetWidth = Math.floor((widthPixels * update.health2) / definition.width);
  let clipWidthPixels = targetWidth;
  let alpha = 255;

  if (update.cycleOffset > elapsedCycles) {
    const step =
      definition.interpolationStep === 0
        ? 0
        : definition.interpolationStep * Math.floor(elapsedCycles / definition.interpolationStep);
    const previousWidth = Math.floor((widthPixels * update.health) / definition.width);
    clipWidthPixels = Math.floor((step * (targetWidth - previousWidth)) / update.cycleOffset + previousWidth);
  } else if (definition.fadeStartCycle >= 0) {
    const remainingCycles = definition.lifetimeCycles + update.cycleOffset - elapsedCycles;
    alpha = Math.max(0, Math.min(255, Math.floor((remainingCycles * 256) / (definition.lifetimeCycles - definition.fadeStartCycle))));
  }

  if (update.health2 > 0 && clipWidthPixels < 1) {
    clipWidthPixels = 1;
  }

  const paddedClip = clipWidthPixels === widthPixels ? frontSpriteWidth : clipWidthPixels + healthBarWidthPadding(definition, frontSpriteWidth);
  const safeClip = Math.max(0, Math.min(frontSpriteWidth, paddedClip));

  return {
    frontSpriteId: definition.frontSpriteId,
    backSpriteId: definition.backSpriteId,
    widthPixels: frontSpriteWidth,
    clipWidthPixels: safeClip,
    widthRatio: safeClip / Math.max(1, frontSpriteWidth),
    alpha
  };
}

function ratioToDefinitionHealth(healthRatio: number, definition: NhHealthBarDefinition): number {
  return Math.max(0, Math.min(definition.width, Math.round(healthRatio * definition.width)));
}

function healthBarWidthPadding(definition: NhHealthBarDefinition, frontSpriteWidth: number): number {
  return definition.widthPadding * 2 < frontSpriteWidth ? definition.widthPadding : 0;
}

function healthBarSourceEntries(source: unknown): readonly unknown[] {
  if (Array.isArray(source)) {
    return source;
  }
  if (!source || typeof source !== "object") {
    return [];
  }
  return Object.values(source);
}

function normalizeHealthBarDefinition(source: unknown): NhHealthBarDefinition | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const record = source as Record<string, unknown>;
  const id = integerField(record.id);
  if (id === undefined) {
    return null;
  }

  const fallback = defaultNhHealthBarDefinitions.get(id) ?? defaultPlayerHealthBarDefinition;
  return {
    id,
    frontSpriteId: integerField(record.frontSpriteId, fallback.frontSpriteId) ?? fallback.frontSpriteId,
    backSpriteId: integerField(record.backSpriteId, fallback.backSpriteId) ?? fallback.backSpriteId,
    width: positiveIntegerField(record.width, fallback.width),
    widthPadding: nonNegativeIntegerField(record.widthPadding, fallback.widthPadding),
    interpolationStep: nonNegativeIntegerField(record.interpolationStep, fallback.interpolationStep),
    lifetimeCycles: positiveIntegerField(record.lifetimeCycles, fallback.lifetimeCycles),
    fadeStartCycle: integerField(record.fadeStartCycle, fallback.fadeStartCycle) ?? fallback.fadeStartCycle,
    opacityStart: clampByte(integerField(record.opacityStart, fallback.opacityStart) ?? fallback.opacityStart),
    opacityEnd: clampByte(integerField(record.opacityEnd, fallback.opacityEnd) ?? fallback.opacityEnd)
  };
}

function integerField(value: unknown, fallback?: number): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return fallback;
}

function positiveIntegerField(value: unknown, fallback: number): number {
  const parsed = integerField(value, fallback) ?? fallback;
  return parsed > 0 ? parsed : fallback;
}

function nonNegativeIntegerField(value: unknown, fallback: number): number {
  const parsed = integerField(value, fallback) ?? fallback;
  return parsed >= 0 ? parsed : fallback;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}
