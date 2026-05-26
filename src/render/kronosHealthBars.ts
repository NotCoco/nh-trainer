export const KRONOS_PLAYER_HEALTH_BAR_DEFINITION_ID = 0;
export const KRONOS_HEALTH_BAR_FRONT_SPRITE_ID = 2176;
export const KRONOS_HEALTH_BAR_BACK_SPRITE_ID = 2177;
export const KRONOS_HEALTH_BAR_WIDTH = 30;

export interface KronosHealthBarDefinition {
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

export interface KronosHealthBarUpdateState {
  readonly cycle: number;
  readonly health: number;
  readonly health2: number;
  readonly cycleOffset: number;
}

export interface KronosHealthBarRenderState {
  readonly definition: KronosHealthBarDefinition;
  readonly update: KronosHealthBarUpdateState;
}

export interface KronosHealthBarLayout {
  readonly frontSpriteId: number;
  readonly backSpriteId: number;
  readonly widthPixels: number;
  readonly clipWidthPixels: number;
  readonly widthRatio: number;
  readonly alpha: number;
}

export type KronosHealthBarDefinitionStore = ReadonlyMap<number, KronosHealthBarDefinition>;

const defaultPlayerHealthBarDefinition: KronosHealthBarDefinition = {
  id: KRONOS_PLAYER_HEALTH_BAR_DEFINITION_ID,
  frontSpriteId: KRONOS_HEALTH_BAR_FRONT_SPRITE_ID,
  backSpriteId: KRONOS_HEALTH_BAR_BACK_SPRITE_ID,
  width: KRONOS_HEALTH_BAR_WIDTH,
  widthPadding: 0,
  interpolationStep: 1,
  lifetimeCycles: 300,
  fadeStartCycle: -1,
  opacityStart: 250,
  opacityEnd: 250
};

export const defaultKronosHealthBarDefinitions: KronosHealthBarDefinitionStore = new Map<number, KronosHealthBarDefinition>([
  [KRONOS_PLAYER_HEALTH_BAR_DEFINITION_ID, defaultPlayerHealthBarDefinition]
]);

export const kronosPlayerHealthBarDefinition = defaultPlayerHealthBarDefinition;

export function createKronosHealthBarDefinitionStore(source: unknown): KronosHealthBarDefinitionStore {
  const store = new Map<number, KronosHealthBarDefinition>();
  for (const entry of healthBarSourceEntries(source)) {
    const definition = normalizeHealthBarDefinition(entry);
    if (definition) {
      store.set(definition.id, definition);
    }
  }
  return store.size > 0 ? store : defaultKronosHealthBarDefinitions;
}

export function kronosHealthBarDefinition(
  definitionId: number,
  definitions: KronosHealthBarDefinitionStore = defaultKronosHealthBarDefinitions
): KronosHealthBarDefinition | null {
  return definitions.get(definitionId) ?? null;
}

export function createKronosHealthBarRenderState(
  cycle: number,
  healthRatio: number,
  previousHealthRatio = healthRatio,
  cycleOffset = 0,
  definition: KronosHealthBarDefinition = kronosPlayerHealthBarDefinition
): KronosHealthBarRenderState {
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

export function layoutKronosHealthBar(
  healthBar: KronosHealthBarRenderState,
  clientCycle: number,
  frontSpriteWidth: number = healthBar.definition.width
): KronosHealthBarLayout {
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

function ratioToDefinitionHealth(healthRatio: number, definition: KronosHealthBarDefinition): number {
  return Math.max(0, Math.min(definition.width, Math.round(healthRatio * definition.width)));
}

function healthBarWidthPadding(definition: KronosHealthBarDefinition, frontSpriteWidth: number): number {
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

function normalizeHealthBarDefinition(source: unknown): KronosHealthBarDefinition | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const record = source as Record<string, unknown>;
  const id = integerField(record.id);
  if (id === undefined) {
    return null;
  }

  const fallback = defaultKronosHealthBarDefinitions.get(id) ?? defaultPlayerHealthBarDefinition;
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
