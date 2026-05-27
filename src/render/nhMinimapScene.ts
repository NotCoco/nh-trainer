import { NH_CAMERA_UNITS } from "./nhClientCamera";
import type { NhArenaMetadata, NhArenaObjectPlacement, NhArenaTile } from "./nhSceneCollision";
import type { RuntimeTile } from "./runtimeScene";

export interface NhFloorDefinitionStore {
  readonly underlays: readonly NhFloorDefinition[];
  readonly overlays: readonly NhOverlayDefinition[];
}

export interface NhFloorDefinition {
  readonly id: number;
  readonly rgbColor: number;
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
  readonly hueMultiplier: number;
}

export interface NhOverlayDefinition {
  readonly id: number;
  readonly rgbColor: number;
  readonly texture: number;
  readonly secondaryRgbColor: number;
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
  readonly otherHue: number;
  readonly otherSaturation: number;
  readonly otherLightness: number;
}

export interface NhTextureDefinitionStore {
  readonly textures: readonly NhTextureDefinition[];
}

export interface NhTextureDefinition {
  readonly id: number;
  readonly averageHsl: number;
}

export interface NhMinimapSceneCell {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly worldX: number;
  readonly worldY: number;
  readonly underlayId: number;
  readonly overlayId: number;
}

export interface NhMinimapSceneOverlayPixel {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly worldX: number;
  readonly worldY: number;
  readonly underlayId: number;
  readonly overlayId: number;
  readonly shape: number;
  readonly rotation: number;
  readonly maskIndex: number;
}

export interface NhMinimapSceneSegment {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly worldX: number;
  readonly worldY: number;
  readonly type: number;
  readonly orientation: number;
  readonly objectId: number;
}

export interface NhMinimapSceneMapSceneObject {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly mapSceneId: number;
  readonly objectId: number;
  readonly worldX: number;
  readonly worldY: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly type: number;
  readonly orientation: number;
}

export interface NhMinimapSceneMapIconObject {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly mapIconId: number;
  readonly objectId: number;
  readonly worldX: number;
  readonly worldY: number;
  readonly tile: RuntimeTile;
  readonly type: number;
  readonly orientation: number;
}

export interface NhMinimapSceneSprite {
  readonly width: number;
  readonly height: number;
  readonly colorMode: "client-palette";
  readonly sourceSceneSizeTiles: number;
  readonly sourceInsetPixels: number;
  readonly pixelsPerTile: number;
  readonly originSceneTile: {
    readonly x: number;
    readonly y: number;
  };
  readonly originWorldTile: {
    readonly x: number;
    readonly y: number;
    readonly plane: number;
  };
  readonly cells: readonly NhMinimapSceneCell[];
  readonly overlayPixels: readonly NhMinimapSceneOverlayPixel[];
  readonly segments: readonly NhMinimapSceneSegment[];
  readonly mapSceneObjects: readonly NhMinimapSceneMapSceneObject[];
  readonly mapIconObjects: readonly NhMinimapSceneMapIconObject[];
  readonly overlayPixelCount: number;
  readonly mapSceneObjectCount: number;
  readonly mapIconObjectCount: number;
}

export interface NhMinimapSceneTransform {
  readonly centerX: number;
  readonly centerY: number;
  readonly angleDegrees: number;
  readonly left: number;
  readonly top: number;
}

const sourceSpriteSize = 512;
const sourceSceneSizeTiles = 104;
const sourceInsetPixels = 48;
const pixelsPerTile = 4;
const originSceneTile = { x: sourceSceneSizeTiles / 2, y: sourceSceneSizeTiles / 2 };
const minimapWallColor = "#eeeeee";
const minimapInteractableWallColor = "#ee0000";
const minimapColorPalette = buildColorPalette(0.9, 0, 512);
const tileShape2D: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 1],
  [1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  [0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1],
  [1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1]
];
const tileRotation2D: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [12, 8, 4, 0, 13, 9, 5, 1, 14, 10, 6, 2, 15, 11, 7, 3],
  [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  [3, 7, 11, 15, 2, 6, 10, 14, 1, 5, 9, 13, 0, 4, 8, 12]
];

export function buildNhMinimapSceneSprite(
  arena: NhArenaMetadata,
  objects: readonly NhArenaObjectPlacement[],
  floors: NhFloorDefinitionStore,
  textures: NhTextureDefinitionStore = { textures: [] }
): NhMinimapSceneSprite {
  const floorMaps: NhMinimapFloorMaps = {
    underlays: new Map(floors.underlays.map((floor) => [floor.id, floor])),
    overlays: new Map(floors.overlays.map((floor) => [floor.id, floor])),
    textures: new Map(textures.textures.map((texture) => [texture.id, texture]))
  };
  const colors: NhMinimapTerrainColors = {
    floors: floorMaps,
    blendedUnderlays: buildBlendedUnderlayColors(arena, floorMaps)
  };
  const originWorldTile = {
    x: Math.round((arena.bounds.west + arena.bounds.east + 1) / 2),
    y: Math.round((arena.bounds.south + arena.bounds.north + 1) / 2),
    plane: arena.bounds.plane
  };
  const cells = arena.tiles
    .filter((tile) => tile.plane === arena.bounds.plane)
    .flatMap((tile): readonly NhMinimapSceneCell[] => {
      const color = baseTerrainColor(tile, colors);
      if (!color) {
        return [];
      }
      const rect = sourceRectForWorldTile(originWorldTile, tile.x, tile.y);
      return [{
        key: `tile:${tile.x}:${tile.y}:${tile.plane}`,
        ...rect,
        width: pixelsPerTile,
        height: pixelsPerTile,
        color,
        worldX: tile.x,
        worldY: tile.y,
        underlayId: tile.underlayId ?? 0,
        overlayId: tile.overlayId ?? 0
      }];
    })
    .filter((cell) => sourceRectIsVisible(cell));
  const overlayPixels = arena.tiles.flatMap((tile) => overlayPixelsForTile(originWorldTile, tile, colors));
  const segments = objects.flatMap((object) => objectSegments(originWorldTile, object));
  const mapSceneObjects = objects.flatMap((object) => mapSceneObject(originWorldTile, object));
  const mapIconObjects = objects.flatMap((object) => mapIconObject(originWorldTile, object));

  return {
    width: sourceSpriteSize,
    height: sourceSpriteSize,
    colorMode: "client-palette",
    sourceSceneSizeTiles,
    sourceInsetPixels,
    pixelsPerTile,
    originSceneTile,
    originWorldTile,
    cells,
    overlayPixels,
    segments,
    mapSceneObjects,
    mapIconObjects,
    overlayPixelCount: overlayPixels.length,
    mapSceneObjectCount: mapSceneObjects.length,
    mapIconObjectCount: mapIconObjects.length
  };
}

export function nhMinimapSceneTransform(
  sprite: NhMinimapSceneSprite,
  localTile: RuntimeTile,
  camAngleY: number,
  mask: { readonly width: number; readonly height: number }
): NhMinimapSceneTransform {
  const center = nhMinimapSceneCenter(sprite, localTile);
  return {
    centerX: center.x,
    centerY: center.y,
    angleDegrees: (wrapClientAngle(camAngleY) / NH_CAMERA_UNITS) * 360,
    left: Math.trunc(mask.width / 2) - center.x,
    top: Math.trunc(mask.height / 2) - center.y
  };
}

export function nhMinimapSceneCenter(
  sprite: NhMinimapSceneSprite,
  localTile: RuntimeTile
): { readonly x: number; readonly y: number } {
  return {
    x: sprite.sourceInsetPixels + sprite.originSceneTile.x * sprite.pixelsPerTile + localTile.x * sprite.pixelsPerTile + 2,
    y: sourceSpriteSize - sprite.sourceInsetPixels - sprite.originSceneTile.y * sprite.pixelsPerTile - localTile.z * sprite.pixelsPerTile - 2
  };
}

interface NhMinimapFloorMaps {
  readonly underlays: ReadonlyMap<number, NhFloorDefinition>;
  readonly overlays: ReadonlyMap<number, NhOverlayDefinition>;
  readonly textures: ReadonlyMap<number, NhTextureDefinition>;
}

interface NhMinimapTerrainColors {
  readonly floors: NhMinimapFloorMaps;
  readonly blendedUnderlays: ReadonlyMap<string, string>;
}

function terrainColor(tile: NhArenaTile, colors: NhMinimapTerrainColors, overlayCell = false): string | null {
  const overlay = tile.overlayId && tile.overlayId > 0 ? colors.floors.overlays.get(tile.overlayId - 1) : null;
  const chosen = overlayCell && overlay ? overlayColor(overlay, colors.floors.textures) : null;
  if (chosen) {
    return chosen;
  }

  const underlay = tile.underlayId && tile.underlayId > 0 ? colors.floors.underlays.get(tile.underlayId - 1) : null;
  return underlayTileColor(tile, colors.blendedUnderlays, underlay);
}

function baseTerrainColor(
  tile: NhArenaTile,
  colors: NhMinimapTerrainColors
): string | null {
  const shape = tileModelShape(tile);
  return terrainColor(tile, colors, shape === 1);
}

function overlayPixelsForTile(
  originWorldTile: NhMinimapSceneSprite["originWorldTile"],
  tile: NhArenaTile,
  colors: NhMinimapTerrainColors
): readonly NhMinimapSceneOverlayPixel[] {
  const overlayId = tile.overlayId ?? 0;
  const shape = tileModelShape(tile);
  if (tile.plane !== originWorldTile.plane || overlayId <= 0 || shape <= 1) {
    return [];
  }
  const rect = sourceRectForWorldTile(originWorldTile, tile.x, tile.y);
  if (!sourceRectIsVisible({ ...rect, width: pixelsPerTile, height: pixelsPerTile })) {
    return [];
  }

  const shapeMask = tileShape2D[shape];
  const rotation = (tile.overlayRotation ?? 0) & 3;
  const rotationMask = tileRotation2D[rotation];
  if (!shapeMask || !rotationMask) {
    return [];
  }

  const color = terrainColor(tile, colors, true);
  if (!color) {
    return [];
  }
  const pixels: NhMinimapSceneOverlayPixel[] = [];
  let sourceIndex = 0;
  for (let y = 0; y < pixelsPerTile; y += 1) {
    for (let x = 0; x < pixelsPerTile; x += 1) {
      const maskIndex = rotationMask[sourceIndex++];
      if (shapeMask[maskIndex] !== 0) {
        pixels.push({
          key: `tile-overlay:${tile.x}:${tile.y}:${tile.plane}:${shape}:${rotation}:${x}:${y}`,
          x: rect.x + x,
          y: rect.y + y,
          color,
          worldX: tile.x,
          worldY: tile.y,
          underlayId: tile.underlayId ?? 0,
          overlayId,
          shape,
          rotation,
          maskIndex
        });
      }
    }
  }
  return pixels;
}

function tileModelShape(tile: { readonly overlayId?: number; readonly overlayPath?: number }): number {
  return (tile.overlayId ?? 0) > 0 ? (tile.overlayPath ?? 0) + 1 : 0;
}

function objectSegments(
  originWorldTile: NhMinimapSceneSprite["originWorldTile"],
  object: NhArenaObjectPlacement
): readonly NhMinimapSceneSegment[] {
  if (object.plane !== originWorldTile.plane) {
    return [];
  }
  const rect = sourceRectForWorldTile(originWorldTile, object.x, object.y);
  if (!sourceRectIsVisible({ ...rect, width: pixelsPerTile, height: pixelsPerTile })) {
    return [];
  }
  const type = object.type;
  const orientation = object.orientation & 3;
  const color = object.blocksProjectile ? minimapInteractableWallColor : minimapWallColor;
  if (type === 0 || type === 2) {
    return wallSegments(rect.x, rect.y, type, orientation, color, object);
  }
  if (type === 3) {
    return wallCornerSegment(rect.x, rect.y, orientation, color, object);
  }
  if (type === 9) {
    return diagonalSegments(rect.x, rect.y, orientation, color, object);
  }
  return [];
}

function mapSceneObject(
  originWorldTile: NhMinimapSceneSprite["originWorldTile"],
  object: NhArenaObjectPlacement
): readonly NhMinimapSceneMapSceneObject[] {
  const mapSceneId = object.mapSceneId ?? -1;
  if (object.plane !== originWorldTile.plane || mapSceneId < 0) {
    return [];
  }
  const rect = sourceRectForWorldTile(originWorldTile, object.x, object.y);
  const mapSceneRect = {
    x: rect.x,
    y: rect.y - (object.sizeY - 1) * pixelsPerTile,
    width: object.sizeX * pixelsPerTile,
    height: object.sizeY * pixelsPerTile
  };
  if (!sourceRectIsVisible(mapSceneRect)) {
    return [];
  }

  return [
    {
      key: `mapscene:${object.id}:${object.x}:${object.y}:${object.type}:${object.orientation}:${mapSceneId}`,
      x: mapSceneRect.x,
      y: mapSceneRect.y,
      mapSceneId,
      objectId: object.id,
      worldX: object.x,
      worldY: object.y,
      sizeX: object.sizeX,
      sizeY: object.sizeY,
      type: object.type,
      orientation: object.orientation & 3
    }
  ];
}

function mapIconObject(
  originWorldTile: NhMinimapSceneSprite["originWorldTile"],
  object: NhArenaObjectPlacement
): readonly NhMinimapSceneMapIconObject[] {
  const mapIconId = object.mapIconId ?? -1;
  if (object.plane !== originWorldTile.plane || mapIconId < 0) {
    return [];
  }
  const rect = sourceRectForWorldTile(originWorldTile, object.x, object.y);
  if (!sourceRectIsVisible({ ...rect, width: pixelsPerTile, height: pixelsPerTile })) {
    return [];
  }

  return [
    {
      key: `mapicon:${object.id}:${object.x}:${object.y}:${object.type}:${object.orientation}:${mapIconId}`,
      x: rect.x,
      y: rect.y,
      mapIconId,
      objectId: object.id,
      worldX: object.x,
      worldY: object.y,
      tile: {
        x: object.x - originWorldTile.x,
        z: object.y - originWorldTile.y
      },
      type: object.type,
      orientation: object.orientation & 3
    }
  ];
}

function wallSegments(
  x: number,
  y: number,
  type: number,
  orientation: number,
  color: string,
  object: NhArenaObjectPlacement
): readonly NhMinimapSceneSegment[] {
  const segments = [wallSegment(x, y, orientation, color, object, "primary")];
  if (type === 2) {
    segments.push(wallSegment(x, y, (orientation + 1) & 3, color, object, "secondary"));
  }
  return segments;
}

function wallSegment(
  x: number,
  y: number,
  orientation: number,
  color: string,
  object: NhArenaObjectPlacement,
  part: string
): NhMinimapSceneSegment {
  if (orientation === 0) {
    return segment(`${part}:west`, x, y, 1, 4, color, object);
  }
  if (orientation === 1) {
    return segment(`${part}:north`, x, y, 4, 1, color, object);
  }
  if (orientation === 2) {
    return segment(`${part}:east`, x + 3, y, 1, 4, color, object);
  }
  return segment(`${part}:south`, x, y + 3, 4, 1, color, object);
}

function wallCornerSegment(
  x: number,
  y: number,
  orientation: number,
  color: string,
  object: NhArenaObjectPlacement
): readonly NhMinimapSceneSegment[] {
  if (orientation === 0) {
    return [segment("corner:west-north", x, y, 1, 1, color, object)];
  }
  if (orientation === 1) {
    return [segment("corner:east-north", x + 3, y, 1, 1, color, object)];
  }
  if (orientation === 2) {
    return [segment("corner:east-south", x + 3, y + 3, 1, 1, color, object)];
  }
  return [segment("corner:west-south", x, y + 3, 1, 1, color, object)];
}

function diagonalSegments(
  x: number,
  y: number,
  orientation: number,
  color: string,
  object: NhArenaObjectPlacement
): readonly NhMinimapSceneSegment[] {
  return Array.from({ length: pixelsPerTile }, (_, index) => {
    const offsetY = orientation === 0 || orientation === 2 ? pixelsPerTile - 1 - index : index;
    return segment(`diagonal:${index}`, x + index, y + offsetY, 1, 1, color, object);
  });
}

function segment(
  part: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  object: NhArenaObjectPlacement
): NhMinimapSceneSegment {
  return {
    key: `object:${object.id}:${object.x}:${object.y}:${object.type}:${object.orientation}:${part}`,
    x,
    y,
    width,
    height,
    color,
    worldX: object.x,
    worldY: object.y,
    type: object.type,
    orientation: object.orientation & 3,
    objectId: object.id
  };
}

function sourceRectForWorldTile(
  originWorldTile: NhMinimapSceneSprite["originWorldTile"],
  worldX: number,
  worldY: number
): { readonly x: number; readonly y: number } {
  const sceneX = originSceneTile.x + worldX - originWorldTile.x;
  const sceneY = originSceneTile.y + worldY - originWorldTile.y;
  return {
    x: sourceInsetPixels + sceneX * pixelsPerTile,
    y: sourceInsetPixels + (sourceSceneSizeTiles - sceneY - 1) * pixelsPerTile
  };
}

function sourceRectIsVisible(rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= sourceSpriteSize && rect.y + rect.height <= sourceSpriteSize;
}

function buildBlendedUnderlayColors(
  arena: NhArenaMetadata,
  floors: Pick<NhMinimapFloorMaps, "underlays">
): ReadonlyMap<string, string> {
  const blendRadius = 5;
  const tiles = new Map(arena.tiles.map((tile) => [tileKey(tile.x, tile.y, tile.plane), tile]));
  const colors = new Map<string, string>();

  for (const tile of arena.tiles) {
    let hue = 0;
    let saturation = 0;
    let lightness = 0;
    let hueMultiplier = 0;
    let count = 0;

    for (let y = tile.y - blendRadius; y <= tile.y + blendRadius; y += 1) {
      for (let x = tile.x - blendRadius; x <= tile.x + blendRadius; x += 1) {
        const neighbor = tiles.get(tileKey(x, y, tile.plane));
        const underlay = neighbor?.underlayId && neighbor.underlayId > 0 ? floors.underlays.get(neighbor.underlayId - 1) : null;
        if (!underlay) {
          continue;
        }

        hue += underlay.hue;
        saturation += underlay.saturation;
        lightness += underlay.lightness;
        hueMultiplier += underlay.hueMultiplier;
        count += 1;
      }
    }

    if (count === 0 || hueMultiplier === 0) {
      continue;
    }

    const packed = packFloorHsl(
      Math.floor((hue * 256) / hueMultiplier),
      Math.floor(saturation / count),
      Math.max(0, Math.min(255, Math.floor(lightness / count)))
    );
    colors.set(tileKey(tile.x, tile.y, tile.plane), paletteCss(method1792(packed, 96)));
  }

  return colors;
}

function underlayTileColor(
  tile: NhArenaTile,
  blendedUnderlays: ReadonlyMap<string, string>,
  underlay: NhFloorDefinition | null | undefined
): string | null {
  return blendedUnderlays.get(tileKey(tile.x, tile.y, tile.plane)) ?? (underlay ? underlayColor(underlay) : null);
}

function underlayColor(underlay: NhFloorDefinition): string {
  const packed = packFloorHsl(underlay.hue, underlay.saturation, underlay.lightness);
  return paletteCss(method1792(packed, 96));
}

function overlayColor(overlay: NhOverlayDefinition, textures: ReadonlyMap<number, NhTextureDefinition>): string | null {
  if (overlay.texture >= 0) {
    const color = textureAveragePaletteColor(overlay.texture, textures);
    if (color) {
      return color;
    }
  }
  if (overlay.rgbColor === 0xff00ff) {
    return null;
  }

  const packed =
    overlay.secondaryRgbColor >= 0
      ? packFloorHsl(overlay.otherHue, overlay.otherSaturation, overlay.otherLightness)
      : packFloorHsl(overlay.hue, overlay.saturation, overlay.lightness);
  return paletteCss(adjustHslLightness(packed, 96));
}

function textureAveragePaletteColor(textureId: number, textures: ReadonlyMap<number, NhTextureDefinition>): string | null {
  const texture = textures.get(textureId);
  if (!texture) {
    return null;
  }
  return paletteCss(adjustHslLightness(texture.averageHsl, 96));
}

function paletteCss(index: number): string {
  return rgbIntToCss(minimapColorPalette[index] ?? 0);
}

function packFloorHsl(hue: number, saturation: number, lightness: number): number {
  let packedSaturation = saturation;
  if (lightness > 179) {
    packedSaturation = Math.floor(packedSaturation / 2);
  }
  if (lightness > 192) {
    packedSaturation = Math.floor(packedSaturation / 2);
  }
  if (lightness > 217) {
    packedSaturation = Math.floor(packedSaturation / 2);
  }
  if (lightness > 243) {
    packedSaturation = Math.floor(packedSaturation / 2);
  }
  return (Math.floor(packedSaturation / 32) << 7) + (Math.floor(hue / 4) << 10) + Math.floor(lightness / 2);
}

function method1792(hsl: number, lightness: number): number {
  if (hsl === -1) {
    return 12345678;
  }
  const adjusted = clampLightness(((hsl & 127) * lightness) / 128);
  return (hsl & 65408) + adjusted;
}

function adjustHslLightness(hsl: number, lightness: number): number {
  if (hsl === -2) {
    return 12345678;
  }
  if (hsl === -1) {
    return clampLightness(lightness);
  }
  const adjusted = clampLightness(((hsl & 127) * lightness) / 128);
  return (hsl & 65408) + adjusted;
}

function clampLightness(value: number): number {
  return Math.max(2, Math.min(126, Math.floor(value)));
}

function buildColorPalette(brightness: number, start: number, end: number): readonly number[] {
  const palette = new Array<number>(65536).fill(1);
  let paletteIndex = start * 128;

  for (let i = start; i < end; i += 1) {
    const hue = (i >> 3) / 64 + 0.0078125;
    const saturation = (i & 7) / 8 + 0.0625;

    for (let lightnessIndex = 0; lightnessIndex < 128; lightnessIndex += 1) {
      const lightness = lightnessIndex / 128;
      const [red, green, blue] = hslToRgb(hue, saturation, lightness);
      const rgb =
        (Math.floor(Math.pow(red, brightness) * 256) << 16) |
        (Math.floor(Math.pow(green, brightness) * 256) << 8) |
        Math.floor(Math.pow(blue, brightness) * 256);
      palette[paletteIndex] = rgb === 0 ? 1 : rgb;
      paletteIndex += 1;
    }
  }

  return palette;
}

function hslToRgb(hue: number, saturation: number, lightness: number): readonly [number, number, number] {
  if (saturation === 0) {
    return [lightness, lightness, lightness];
  }
  const high = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const low = 2 * lightness - high;
  return [
    hueToRgb(low, high, hue + 1 / 3),
    hueToRgb(low, high, hue),
    hueToRgb(low, high, hue - 1 / 3)
  ];
}

function hueToRgb(low: number, high: number, hue: number): number {
  let shiftedHue = hue;
  if (shiftedHue > 1) {
    shiftedHue -= 1;
  }
  if (shiftedHue < 0) {
    shiftedHue += 1;
  }
  if (6 * shiftedHue < 1) {
    return low + (high - low) * 6 * shiftedHue;
  }
  if (2 * shiftedHue < 1) {
    return high;
  }
  if (3 * shiftedHue < 2) {
    return low + (high - low) * (2 / 3 - shiftedHue) * 6;
  }
  return low;
}

function tileKey(x: number, y: number, plane: number): string {
  return `${x}:${y}:${plane}`;
}

function rgbIntToCss(rgb: number): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, "0")}`;
}

function wrapClientAngle(units: number): number {
  return ((Math.trunc(units) % NH_CAMERA_UNITS) + NH_CAMERA_UNITS) % NH_CAMERA_UNITS;
}
