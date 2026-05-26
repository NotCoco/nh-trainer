export type KronosHitsplatTypeId = number;

export const KRONOS_HITSPLAT_BLOCK_TYPE = 0;
export const KRONOS_HITSPLAT_DAMAGE_TYPE = 1;
export const KRONOS_HITSPLAT_DEFAULT_DURATION_CYCLES = 50;
export const KRONOS_HITSPLAT_EMPTY_SECONDARY_TYPE = -1;
export const KRONOS_HITSPLAT_TEXT_BASELINE_FROM_TOP_PX = 15;
export const KRONOS_HITSPLAT_FALLBACK_FONT_ASCENT_PX = 10;

export interface KronosHitsplatSpriteSet {
  readonly leftSpriteId?: number;
  readonly middleSpriteId?: number;
  readonly rightSpriteId?: number;
  readonly endSpriteId?: number;
}

export interface KronosHitsplatDefinition {
  readonly id: KronosHitsplatTypeId;
  readonly label: string;
  readonly fontId: number;
  readonly fontArchiveName: string;
  readonly textColor: number;
  readonly durationCycles: number;
  readonly horizontalOffset: number;
  readonly verticalOffset: number;
  readonly fadeStartCycle: number;
  readonly priorityMode: number;
  readonly textBaselineOffset: number;
  readonly template: string;
  readonly transformVarbit: number;
  readonly transformVarp: number;
  readonly transforms: readonly number[];
  readonly sprites: KronosHitsplatSpriteSet;
}

export interface KronosHitsplatComponent {
  readonly typeId: KronosHitsplatTypeId;
  readonly value: number;
  readonly definition: KronosHitsplatDefinition;
  readonly text: string;
}

export interface KronosHitsplatRenderState {
  readonly slotIndex: number;
  readonly packetCycle: number;
  readonly delayCycles: number;
  readonly expiresOnClientCycle: number;
  readonly primary: KronosHitsplatComponent;
  readonly secondary?: KronosHitsplatComponent;
}

export interface KronosHitsplatPacket {
  readonly primaryType: number;
  readonly primaryValue: number;
  readonly secondaryType: number;
  readonly secondaryValue: number;
  readonly packetCycle: number;
  readonly delayCycles: number;
  readonly slotIndex: number;
}

export type KronosHitsplatSpriteSheetId = "hitsplats" | "hitsplat_digits";

export interface KronosHitsplatSpriteMetrics {
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly advance?: number;
  readonly leftBearing?: number;
  readonly topBearing?: number;
  readonly ascent?: number;
}

export interface KronosHitsplatLayoutSprite {
  readonly sheetId: KronosHitsplatSpriteSheetId;
  readonly spriteId: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
  readonly renderOrderOffset: number;
}

export interface KronosHitsplatLayout {
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly sprites: readonly KronosHitsplatLayoutSprite[];
}

export type KronosHitsplatMetricLookup = (
  sheetId: KronosHitsplatSpriteSheetId,
  spriteId: number
) => KronosHitsplatSpriteMetrics | undefined;

export type KronosHitsplatDefinitionStore = ReadonlyMap<number, KronosHitsplatDefinition>;
export type KronosHitsplatVariableLookup = ReadonlyMap<number, number> | Readonly<Record<number, number>>;

export interface KronosHitsplatVariableState {
  readonly varbits?: KronosHitsplatVariableLookup;
  readonly varps?: KronosHitsplatVariableLookup;
}

export const defaultKronosHitsplatDefinitions: KronosHitsplatDefinitionStore = new Map<number, KronosHitsplatDefinition>([
  [
    KRONOS_HITSPLAT_BLOCK_TYPE,
    {
      id: KRONOS_HITSPLAT_BLOCK_TYPE,
      label: "Blocked damage",
      fontId: -1,
      fontArchiveName: "",
      textColor: 0xffffff,
      durationCycles: KRONOS_HITSPLAT_DEFAULT_DURATION_CYCLES,
      horizontalOffset: 0,
      verticalOffset: 0,
      fadeStartCycle: -1,
      priorityMode: -1,
      textBaselineOffset: 0,
      template: "%1",
      transformVarbit: -1,
      transformVarp: -1,
      transforms: [],
      sprites: { middleSpriteId: 1358 }
    }
  ],
  [
    KRONOS_HITSPLAT_DAMAGE_TYPE,
    {
      id: KRONOS_HITSPLAT_DAMAGE_TYPE,
      label: "Damage",
      fontId: -1,
      fontArchiveName: "",
      textColor: 0xffffff,
      durationCycles: KRONOS_HITSPLAT_DEFAULT_DURATION_CYCLES,
      horizontalOffset: 0,
      verticalOffset: 0,
      fadeStartCycle: -1,
      priorityMode: -1,
      textBaselineOffset: 0,
      template: "%1",
      transformVarbit: -1,
      transformVarp: -1,
      transforms: [],
      sprites: { middleSpriteId: 1359 }
    }
  ]
]);

export function createKronosHitsplatDefinitionStore(source: unknown): KronosHitsplatDefinitionStore {
  const store = new Map<number, KronosHitsplatDefinition>();
  for (const entry of hitsplatSourceEntries(source)) {
    const definition = normalizeHitsplatDefinition(entry);
    if (definition) {
      store.set(definition.id, definition);
    }
  }
  return store.size > 0 ? store : defaultKronosHitsplatDefinitions;
}

export function kronosHitsplatDefinition(
  typeId: number,
  definitions: KronosHitsplatDefinitionStore = defaultKronosHitsplatDefinitions
): KronosHitsplatDefinition | null {
  return definitions.get(typeId) ?? null;
}

export function resolveKronosHitsplatDefinition(
  typeId: number,
  definitions: KronosHitsplatDefinitionStore = defaultKronosHitsplatDefinitions,
  variables: KronosHitsplatVariableState = {}
): KronosHitsplatDefinition | null {
  const definition = kronosHitsplatDefinition(typeId, definitions);
  return definition ? resolveKronosHitsplatTransformedDefinition(definition, definitions, variables) : null;
}

export function resolveKronosHitsplatTransformedDefinition(
  definition: KronosHitsplatDefinition,
  definitions: KronosHitsplatDefinitionStore = defaultKronosHitsplatDefinitions,
  variables: KronosHitsplatVariableState = {}
): KronosHitsplatDefinition | null {
  if (definition.transforms.length === 0) {
    return definition;
  }

  const selector =
    definition.transformVarbit !== -1
      ? hitsplatVariableValue(variables.varbits, definition.transformVarbit)
      : definition.transformVarp !== -1
        ? hitsplatVariableValue(variables.varps, definition.transformVarp)
        : -1;
  const transformIndex =
    selector >= 0 && selector < definition.transforms.length - 1
      ? selector
      : definition.transforms.length - 1;
  const transformedTypeId = definition.transforms[transformIndex] ?? -1;
  return transformedTypeId === -1 ? null : kronosHitsplatDefinition(transformedTypeId, definitions);
}

export function kronosHitsplatTypeForDamage(amount: number): KronosHitsplatTypeId {
  return amount <= 0 ? KRONOS_HITSPLAT_BLOCK_TYPE : KRONOS_HITSPLAT_DAMAGE_TYPE;
}

export function kronosHitsplatText(definition: KronosHitsplatDefinition, value: number): string {
  return definition.template.split("%1").join(Math.max(0, Math.trunc(value)).toString());
}

export function createKronosHitsplatRenderState(
  packet: KronosHitsplatPacket,
  definitions: KronosHitsplatDefinitionStore = defaultKronosHitsplatDefinitions,
  variables: KronosHitsplatVariableState = {}
): KronosHitsplatRenderState {
  const state = createKronosHitsplatRenderStateOrNull(packet, definitions, variables);
  if (!state) {
    throw new Error(`Kronos hitsplat definition ${packet.primaryType} transformed to null`);
  }
  return state;
}

export function createKronosHitsplatRenderStateOrNull(
  packet: KronosHitsplatPacket,
  definitions: KronosHitsplatDefinitionStore = defaultKronosHitsplatDefinitions,
  variables: KronosHitsplatVariableState = {}
): KronosHitsplatRenderState | null {
  const primaryBaseDefinition = kronosHitsplatDefinition(packet.primaryType, definitions);
  if (!primaryBaseDefinition) {
    throw new Error(`missing Kronos hitsplat definition ${packet.primaryType}`);
  }
  const primaryDefinition = resolveKronosHitsplatTransformedDefinition(primaryBaseDefinition, definitions, variables);
  if (!primaryDefinition) {
    return null;
  }

  const secondaryBaseDefinition =
    packet.secondaryType >= 0 ? kronosHitsplatDefinition(packet.secondaryType, definitions) : null;
  if (packet.secondaryType >= 0 && !secondaryBaseDefinition) {
    throw new Error(`missing Kronos secondary hitsplat definition ${packet.secondaryType}`);
  }
  const secondaryDefinition = secondaryBaseDefinition
    ? resolveKronosHitsplatTransformedDefinition(secondaryBaseDefinition, definitions, variables)
    : null;

  return {
    slotIndex: packet.slotIndex,
    packetCycle: packet.packetCycle,
    delayCycles: packet.delayCycles,
    expiresOnClientCycle: packet.packetCycle + packet.delayCycles + primaryBaseDefinition.durationCycles,
    primary: {
      typeId: primaryDefinition.id,
      value: packet.primaryValue,
      definition: primaryDefinition,
      text: kronosHitsplatText(primaryDefinition, packet.primaryValue)
    },
    secondary: secondaryDefinition
      ? {
          typeId: secondaryDefinition.id,
          value: packet.secondaryValue,
          definition: secondaryDefinition,
          text: kronosHitsplatText(secondaryDefinition, packet.secondaryValue)
        }
      : undefined
  };
}

export function kronosHitsplatPrimarySpriteId(hitsplat: KronosHitsplatRenderState): number | undefined {
  return firstSpriteId(hitsplat.primary.definition.sprites);
}

export function layoutKronosHitsplat(
  hitsplat: KronosHitsplatRenderState,
  lookup: KronosHitsplatMetricLookup,
  clientCycle: number
): KronosHitsplatLayout | null {
  const primary = layoutComponent(hitsplat.primary, 0, lookup);
  if (!primary) {
    return null;
  }

  const alpha = kronosHitsplatAlpha(hitsplat, clientCycle);
  const components = [primary];
  if (hitsplat.secondary) {
    const secondary = layoutComponent(hitsplat.secondary, primary.width + 2, lookup);
    if (!secondary) {
      return null;
    }
    components.push(secondary);
  }

  const width = components.reduce((max, component) => Math.max(max, component.x + component.width), 0);
  const height = components.reduce((max, component) => Math.max(max, component.height), 0);
  const offset = kronosHitsplatOffset(hitsplat, clientCycle);
  const sprites = components.flatMap((component, componentIndex) =>
    component.sprites.map((sprite) => ({
      ...sprite,
      alpha,
      renderOrderOffset: componentIndex * 20 + sprite.renderOrderOffset
    }))
  );

  return { width, height, alpha, offsetX: offset.x, offsetY: offset.y, sprites };
}

function layoutComponent(
  component: KronosHitsplatComponent,
  startX: number,
  lookup: KronosHitsplatMetricLookup
): { readonly x: number; readonly width: number; readonly height: number; readonly sprites: readonly KronosHitsplatLayoutSprite[] } | null {
  const sprites: KronosHitsplatLayoutSprite[] = [];
  const definition = component.definition;
  const left = spriteMetrics(definition.sprites.leftSpriteId, lookup);
  const middle = spriteMetrics(definition.sprites.middleSpriteId, lookup);
  const right = spriteMetrics(definition.sprites.rightSpriteId, lookup);
  const end = spriteMetrics(definition.sprites.endSpriteId, lookup);
  const glyphs = [...component.text].map((character) => lookup("hitsplat_digits", character.charCodeAt(0)));

  if (glyphs.some((glyph) => glyph === undefined)) {
    return null;
  }

  const textWidth = glyphs.reduce((total, glyph) => total + glyphAdvance(glyph), 0);
  let cursor = startX;
  let height = 0;

  if (left) {
    sprites.push(spritePart(definition.sprites.leftSpriteId, cursor, 0, left, 0));
    cursor += left.width;
    height = Math.max(height, left.height);
  }

  cursor += 2;

  if (right) {
    sprites.push(spritePart(definition.sprites.rightSpriteId, cursor, 0, right, 1));
    cursor += right.width;
    height = Math.max(height, right.height);
  }

  const textX = cursor;
  if (middle) {
    const repeatCount = !right && !end ? 1 : Math.floor(textWidth / middle.width) + 1;
    const repeatedWidth = middle.width * repeatCount;
    for (let index = 0; index < repeatCount; index += 1) {
      sprites.push(spritePart(definition.sprites.middleSpriteId, cursor + index * middle.width, 0, middle, 2 + index));
    }
    cursor += repeatedWidth;
    height = Math.max(height, middle.height);
    appendGlyphs(
      sprites,
      component.text,
      glyphs,
      textX + Math.trunc((repeatedWidth - textWidth) / 2),
      definition.textBaselineOffset
    );
  } else {
    appendGlyphs(sprites, component.text, glyphs, textX, definition.textBaselineOffset);
    cursor += textWidth;
  }

  if (end) {
    sprites.push(spritePart(definition.sprites.endSpriteId, cursor, 0, end, 10));
    cursor += end.width;
    height = Math.max(height, end.height);
  }

  return {
    x: startX,
    width: cursor - startX,
    height: Math.max(height, KRONOS_HITSPLAT_TEXT_BASELINE_FROM_TOP_PX),
    sprites
  };
}

function appendGlyphs(
  sprites: KronosHitsplatLayoutSprite[],
  text: string,
  glyphs: readonly (KronosHitsplatSpriteMetrics | undefined)[],
  x: number,
  baselineOffset: number
): void {
  let penX = x;
  for (let index = 0; index < glyphs.length; index += 1) {
    const glyph = glyphs[index];
    if (!glyph) {
      continue;
    }
    const character = text[index];
    const baselineY = baselineOffset + KRONOS_HITSPLAT_TEXT_BASELINE_FROM_TOP_PX;
    const glyphX = penX + (glyph.leftBearing ?? 0);
    const glyphY = baselineY - (glyph.ascent ?? KRONOS_HITSPLAT_FALLBACK_FONT_ASCENT_PX) + (glyph.topBearing ?? 0);
    sprites.push({
      sheetId: "hitsplat_digits",
      spriteId: character.charCodeAt(0),
      x: glyphX,
      y: glyphY,
      width: glyph.width,
      height: glyph.height,
      alpha: 255,
      renderOrderOffset: 12 + index
    });
    penX += glyphAdvance(glyph);
  }
}

function glyphAdvance(glyph: KronosHitsplatSpriteMetrics | undefined): number {
  return Math.max(1, glyph?.advance ?? glyph?.width ?? 1);
}

function spritePart(
  spriteId: number | undefined,
  x: number,
  y: number,
  metrics: KronosHitsplatSpriteMetrics,
  renderOrderOffset: number
): KronosHitsplatLayoutSprite {
  if (spriteId === undefined) {
    throw new Error("missing sprite id for hitsplat part");
  }

  return {
    sheetId: "hitsplats",
    spriteId,
    x,
    y,
    width: metrics.width,
    height: metrics.height,
    alpha: 255,
    renderOrderOffset
  };
}

function spriteMetrics(
  spriteId: number | undefined,
  lookup: KronosHitsplatMetricLookup
): KronosHitsplatSpriteMetrics | undefined {
  return spriteId === undefined ? undefined : lookup("hitsplats", spriteId);
}

function firstSpriteId(sprites: KronosHitsplatSpriteSet): number | undefined {
  return sprites.leftSpriteId ?? sprites.middleSpriteId ?? sprites.rightSpriteId ?? sprites.endSpriteId;
}

function kronosHitsplatAlpha(hitsplat: KronosHitsplatRenderState, clientCycle: number): number {
  const definition = hitsplat.primary.definition;
  if (definition.fadeStartCycle < 0) {
    return 255;
  }

  const remainingCycles = hitsplat.expiresOnClientCycle - clientCycle;
  return Math.max(
    0,
    Math.min(255, Math.floor((remainingCycles * 256) / (definition.durationCycles - definition.fadeStartCycle)))
  );
}

function kronosHitsplatOffset(hitsplat: KronosHitsplatRenderState, clientCycle: number): { readonly x: number; readonly y: number } {
  const definition = hitsplat.primary.definition;
  const remainingCycles = hitsplat.expiresOnClientCycle - clientCycle;
  const durationCycles = Math.max(1, definition.durationCycles);
  return {
    x: definition.horizontalOffset - Math.trunc((remainingCycles * definition.horizontalOffset) / durationCycles),
    y: Math.trunc((remainingCycles * definition.verticalOffset) / durationCycles) - definition.verticalOffset
  };
}

function hitsplatSourceEntries(source: unknown): readonly unknown[] {
  if (Array.isArray(source)) {
    return source;
  }
  if (!source || typeof source !== "object") {
    return [];
  }
  return Object.values(source);
}

function normalizeHitsplatDefinition(source: unknown): KronosHitsplatDefinition | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const record = source as Record<string, unknown>;
  const id = integerField(record.id);
  if (id === undefined) {
    return null;
  }

  const fallback = defaultKronosHitsplatDefinitions.get(id);
  const sprites = normalizeHitsplatSprites(record.sprites, fallback?.sprites);
  return {
    id,
    label: stringField(record.label, fallback?.label ?? `Hit splat ${id}`),
    fontId: integerField(record.fontId, fallback?.fontId ?? -1) ?? -1,
    fontArchiveName: stringField(record.fontArchiveName, fallback?.fontArchiveName ?? ""),
    textColor: integerField(record.textColor, fallback?.textColor ?? 0xffffff) ?? 0xffffff,
    durationCycles: positiveIntegerField(record.durationCycles, fallback?.durationCycles ?? KRONOS_HITSPLAT_DEFAULT_DURATION_CYCLES),
    horizontalOffset: integerField(record.horizontalOffset, fallback?.horizontalOffset ?? 0) ?? 0,
    verticalOffset: integerField(record.verticalOffset, fallback?.verticalOffset ?? 0) ?? 0,
    fadeStartCycle: integerField(record.fadeStartCycle, fallback?.fadeStartCycle ?? -1) ?? -1,
    priorityMode: integerField(record.priorityMode, fallback?.priorityMode ?? -1) ?? -1,
    textBaselineOffset: integerField(record.textBaselineOffset, fallback?.textBaselineOffset ?? 0) ?? 0,
    template: stringField(record.template, fallback?.template ?? "%1") || "%1",
    transformVarbit: integerField(record.transformVarbit, fallback?.transformVarbit ?? -1) ?? -1,
    transformVarp: integerField(record.transformVarp, fallback?.transformVarp ?? -1) ?? -1,
    transforms: numberArrayField(record.transforms, fallback?.transforms ?? []),
    sprites
  };
}

function normalizeHitsplatSprites(
  source: unknown,
  fallback: KronosHitsplatSpriteSet | undefined
): KronosHitsplatSpriteSet {
  const record = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
  return {
    leftSpriteId: optionalSpriteId(record.leftSpriteId, fallback?.leftSpriteId),
    middleSpriteId: optionalSpriteId(record.middleSpriteId, fallback?.middleSpriteId),
    rightSpriteId: optionalSpriteId(record.rightSpriteId, fallback?.rightSpriteId),
    endSpriteId: optionalSpriteId(record.endSpriteId, fallback?.endSpriteId)
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

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function optionalSpriteId(value: unknown, fallback: number | undefined): number | undefined {
  const parsed = integerField(value, fallback);
  return parsed === undefined || parsed < 0 ? undefined : parsed;
}

function numberArrayField(value: unknown, fallback: readonly number[]): readonly number[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value
    .map((entry) => integerField(entry))
    .filter((entry): entry is number => entry !== undefined);
}

function hitsplatVariableValue(lookup: KronosHitsplatVariableLookup | undefined, id: number): number {
  if (!lookup) {
    return -1;
  }
  const mapLike = lookup as { readonly get?: (key: number) => unknown };
  const raw = typeof mapLike.get === "function" ? mapLike.get(id) : (lookup as Readonly<Record<number, number>>)[id];
  return typeof raw === "number" && Number.isFinite(raw) ? Math.trunc(raw) : -1;
}
