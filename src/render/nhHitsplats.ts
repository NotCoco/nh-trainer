export type NhHitsplatTypeId = number;

export const NH_HITSPLAT_BLOCK_TYPE = 0;
export const NH_HITSPLAT_DAMAGE_TYPE = 1;
export const NH_HITSPLAT_DEFAULT_DURATION_CYCLES = 50;
export const NH_HITSPLAT_EMPTY_SECONDARY_TYPE = -1;
export const NH_HITSPLAT_TEXT_BASELINE_FROM_TOP_PX = 15;
export const NH_HITSPLAT_FALLBACK_FONT_ASCENT_PX = 10;

export interface NhHitsplatSpriteSet {
  readonly leftSpriteId?: number;
  readonly middleSpriteId?: number;
  readonly rightSpriteId?: number;
  readonly endSpriteId?: number;
}

export interface NhHitsplatDefinition {
  readonly id: NhHitsplatTypeId;
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
  readonly sprites: NhHitsplatSpriteSet;
}

export interface NhHitsplatComponent {
  readonly typeId: NhHitsplatTypeId;
  readonly value: number;
  readonly definition: NhHitsplatDefinition;
  readonly text: string;
}

export interface NhHitsplatRenderState {
  readonly slotIndex: number;
  readonly packetCycle: number;
  readonly delayCycles: number;
  readonly expiresOnClientCycle: number;
  readonly primary: NhHitsplatComponent;
  readonly secondary?: NhHitsplatComponent;
}

export interface NhHitsplatPacket {
  readonly primaryType: number;
  readonly primaryValue: number;
  readonly secondaryType: number;
  readonly secondaryValue: number;
  readonly packetCycle: number;
  readonly delayCycles: number;
  readonly slotIndex: number;
}

export type NhHitsplatSpriteSheetId = "hitsplats" | "hitsplat_digits";

export interface NhHitsplatSpriteMetrics {
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly advance?: number;
  readonly leftBearing?: number;
  readonly topBearing?: number;
  readonly ascent?: number;
}

export interface NhHitsplatLayoutSprite {
  readonly sheetId: NhHitsplatSpriteSheetId;
  readonly spriteId: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
  readonly renderOrderOffset: number;
}

export interface NhHitsplatLayout {
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly sprites: readonly NhHitsplatLayoutSprite[];
}

export type NhHitsplatMetricLookup = (
  sheetId: NhHitsplatSpriteSheetId,
  spriteId: number
) => NhHitsplatSpriteMetrics | undefined;

export type NhHitsplatDefinitionStore = ReadonlyMap<number, NhHitsplatDefinition>;
export type NhHitsplatVariableLookup = ReadonlyMap<number, number> | Readonly<Record<number, number>>;

export interface NhHitsplatVariableState {
  readonly varbits?: NhHitsplatVariableLookup;
  readonly varps?: NhHitsplatVariableLookup;
}

export const defaultNhHitsplatDefinitions: NhHitsplatDefinitionStore = new Map<number, NhHitsplatDefinition>([
  [
    NH_HITSPLAT_BLOCK_TYPE,
    {
      id: NH_HITSPLAT_BLOCK_TYPE,
      label: "Blocked damage",
      fontId: -1,
      fontArchiveName: "",
      textColor: 0xffffff,
      durationCycles: NH_HITSPLAT_DEFAULT_DURATION_CYCLES,
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
    NH_HITSPLAT_DAMAGE_TYPE,
    {
      id: NH_HITSPLAT_DAMAGE_TYPE,
      label: "Damage",
      fontId: -1,
      fontArchiveName: "",
      textColor: 0xffffff,
      durationCycles: NH_HITSPLAT_DEFAULT_DURATION_CYCLES,
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

export function createNhHitsplatDefinitionStore(source: unknown): NhHitsplatDefinitionStore {
  const store = new Map<number, NhHitsplatDefinition>();
  for (const entry of hitsplatSourceEntries(source)) {
    const definition = normalizeHitsplatDefinition(entry);
    if (definition) {
      store.set(definition.id, definition);
    }
  }
  return store.size > 0 ? store : defaultNhHitsplatDefinitions;
}

export function nhHitsplatDefinition(
  typeId: number,
  definitions: NhHitsplatDefinitionStore = defaultNhHitsplatDefinitions
): NhHitsplatDefinition | null {
  return definitions.get(typeId) ?? null;
}

export function resolveNhHitsplatDefinition(
  typeId: number,
  definitions: NhHitsplatDefinitionStore = defaultNhHitsplatDefinitions,
  variables: NhHitsplatVariableState = {}
): NhHitsplatDefinition | null {
  const definition = nhHitsplatDefinition(typeId, definitions);
  return definition ? resolveNhHitsplatTransformedDefinition(definition, definitions, variables) : null;
}

export function resolveNhHitsplatTransformedDefinition(
  definition: NhHitsplatDefinition,
  definitions: NhHitsplatDefinitionStore = defaultNhHitsplatDefinitions,
  variables: NhHitsplatVariableState = {}
): NhHitsplatDefinition | null {
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
  return transformedTypeId === -1 ? null : nhHitsplatDefinition(transformedTypeId, definitions);
}

export function nhHitsplatTypeForDamage(amount: number): NhHitsplatTypeId {
  return amount <= 0 ? NH_HITSPLAT_BLOCK_TYPE : NH_HITSPLAT_DAMAGE_TYPE;
}

export function nhHitsplatText(definition: NhHitsplatDefinition, value: number): string {
  return definition.template.split("%1").join(Math.max(0, Math.trunc(value)).toString());
}

export function createNhHitsplatRenderState(
  packet: NhHitsplatPacket,
  definitions: NhHitsplatDefinitionStore = defaultNhHitsplatDefinitions,
  variables: NhHitsplatVariableState = {}
): NhHitsplatRenderState {
  const state = createNhHitsplatRenderStateOrNull(packet, definitions, variables);
  if (!state) {
    throw new Error(`Nh hitsplat definition ${packet.primaryType} transformed to null`);
  }
  return state;
}

export function createNhHitsplatRenderStateOrNull(
  packet: NhHitsplatPacket,
  definitions: NhHitsplatDefinitionStore = defaultNhHitsplatDefinitions,
  variables: NhHitsplatVariableState = {}
): NhHitsplatRenderState | null {
  const primaryBaseDefinition = nhHitsplatDefinition(packet.primaryType, definitions);
  if (!primaryBaseDefinition) {
    throw new Error(`missing Nh hitsplat definition ${packet.primaryType}`);
  }
  const primaryDefinition = resolveNhHitsplatTransformedDefinition(primaryBaseDefinition, definitions, variables);
  if (!primaryDefinition) {
    return null;
  }

  const secondaryBaseDefinition =
    packet.secondaryType >= 0 ? nhHitsplatDefinition(packet.secondaryType, definitions) : null;
  if (packet.secondaryType >= 0 && !secondaryBaseDefinition) {
    throw new Error(`missing Nh secondary hitsplat definition ${packet.secondaryType}`);
  }
  const secondaryDefinition = secondaryBaseDefinition
    ? resolveNhHitsplatTransformedDefinition(secondaryBaseDefinition, definitions, variables)
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
      text: nhHitsplatText(primaryDefinition, packet.primaryValue)
    },
    secondary: secondaryDefinition
      ? {
          typeId: secondaryDefinition.id,
          value: packet.secondaryValue,
          definition: secondaryDefinition,
          text: nhHitsplatText(secondaryDefinition, packet.secondaryValue)
        }
      : undefined
  };
}

export function nhHitsplatPrimarySpriteId(hitsplat: NhHitsplatRenderState): number | undefined {
  return firstSpriteId(hitsplat.primary.definition.sprites);
}

export function layoutNhHitsplat(
  hitsplat: NhHitsplatRenderState,
  lookup: NhHitsplatMetricLookup,
  clientCycle: number
): NhHitsplatLayout | null {
  const primary = layoutComponent(hitsplat.primary, 0, lookup);
  if (!primary) {
    return null;
  }

  const alpha = nhHitsplatAlpha(hitsplat, clientCycle);
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
  const offset = nhHitsplatOffset(hitsplat, clientCycle);
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
  component: NhHitsplatComponent,
  startX: number,
  lookup: NhHitsplatMetricLookup
): { readonly x: number; readonly width: number; readonly height: number; readonly sprites: readonly NhHitsplatLayoutSprite[] } | null {
  const sprites: NhHitsplatLayoutSprite[] = [];
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
    height: Math.max(height, NH_HITSPLAT_TEXT_BASELINE_FROM_TOP_PX),
    sprites
  };
}

function appendGlyphs(
  sprites: NhHitsplatLayoutSprite[],
  text: string,
  glyphs: readonly (NhHitsplatSpriteMetrics | undefined)[],
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
    const baselineY = baselineOffset + NH_HITSPLAT_TEXT_BASELINE_FROM_TOP_PX;
    const glyphX = penX + (glyph.leftBearing ?? 0);
    const glyphY = baselineY - (glyph.ascent ?? NH_HITSPLAT_FALLBACK_FONT_ASCENT_PX) + (glyph.topBearing ?? 0);
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

function glyphAdvance(glyph: NhHitsplatSpriteMetrics | undefined): number {
  return Math.max(1, glyph?.advance ?? glyph?.width ?? 1);
}

function spritePart(
  spriteId: number | undefined,
  x: number,
  y: number,
  metrics: NhHitsplatSpriteMetrics,
  renderOrderOffset: number
): NhHitsplatLayoutSprite {
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
  lookup: NhHitsplatMetricLookup
): NhHitsplatSpriteMetrics | undefined {
  return spriteId === undefined ? undefined : lookup("hitsplats", spriteId);
}

function firstSpriteId(sprites: NhHitsplatSpriteSet): number | undefined {
  return sprites.leftSpriteId ?? sprites.middleSpriteId ?? sprites.rightSpriteId ?? sprites.endSpriteId;
}

function nhHitsplatAlpha(hitsplat: NhHitsplatRenderState, clientCycle: number): number {
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

function nhHitsplatOffset(hitsplat: NhHitsplatRenderState, clientCycle: number): { readonly x: number; readonly y: number } {
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

function normalizeHitsplatDefinition(source: unknown): NhHitsplatDefinition | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const record = source as Record<string, unknown>;
  const id = integerField(record.id);
  if (id === undefined) {
    return null;
  }

  const fallback = defaultNhHitsplatDefinitions.get(id);
  const sprites = normalizeHitsplatSprites(record.sprites, fallback?.sprites);
  return {
    id,
    label: stringField(record.label, fallback?.label ?? `Hit splat ${id}`),
    fontId: integerField(record.fontId, fallback?.fontId ?? -1) ?? -1,
    fontArchiveName: stringField(record.fontArchiveName, fallback?.fontArchiveName ?? ""),
    textColor: integerField(record.textColor, fallback?.textColor ?? 0xffffff) ?? 0xffffff,
    durationCycles: positiveIntegerField(record.durationCycles, fallback?.durationCycles ?? NH_HITSPLAT_DEFAULT_DURATION_CYCLES),
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
  fallback: NhHitsplatSpriteSet | undefined
): NhHitsplatSpriteSet {
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

function hitsplatVariableValue(lookup: NhHitsplatVariableLookup | undefined, id: number): number {
  if (!lookup) {
    return -1;
  }
  const mapLike = lookup as { readonly get?: (key: number) => unknown };
  const raw = typeof mapLike.get === "function" ? mapLike.get(id) : (lookup as Readonly<Record<number, number>>)[id];
  return typeof raw === "number" && Number.isFinite(raw) ? Math.trunc(raw) : -1;
}
