import { KRONOS_CAMERA_UNITS } from "./kronosClientCamera";
import type { RuntimeActorPose, RuntimeMinimapDotKind, RuntimeSceneSnapshot, RuntimeTile } from "./runtimeScene";

export interface KronosMinimapMask {
  readonly width: number;
  readonly height: number;
}

export interface KronosMinimapSpriteMask extends KronosMinimapMask {
  readonly xStarts: readonly number[];
  readonly xWidths: readonly number[];
}

export interface KronosMinimapMaskRows extends KronosMinimapMask {
  readonly xStarts?: readonly number[];
  readonly xWidths?: readonly number[];
}

export interface KronosMinimapDotOffsetInput extends KronosMinimapMask {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly camAngleY: number;
  readonly spriteWidth: number;
  readonly spriteHeight: number;
}

export interface KronosMinimapDotOffset {
  readonly left: number;
  readonly top: number;
  readonly rotatedX: number;
  readonly rotatedY: number;
  readonly distanceSquared: number;
  readonly clipped: boolean;
}

export interface KronosMinimapDot extends KronosMinimapDotOffset {
  readonly actorId: string;
  readonly kind: KronosMinimapDotKind;
  readonly sourceSpriteIndex: number;
  readonly width: number;
  readonly height: number;
}

export interface KronosMinimapMarker extends KronosMinimapDotOffset {
  readonly id: string;
  readonly tile: RuntimeTile;
  readonly kind: KronosMinimapMarkerKind;
  readonly sourceSpriteIndex: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDegrees?: number;
}

export interface KronosMinimapMapIcon extends KronosMinimapDotOffset {
  readonly id: string;
  readonly objectId: number;
  readonly mapIconId: number;
  readonly tile: RuntimeTile;
  readonly width: number;
  readonly height: number;
}

export interface KronosMinimapLocalPlayerDot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface KronosMinimapDotSpriteSize {
  readonly width: number;
  readonly height: number;
}

export type KronosMinimapDotSpriteSizeLookup = (
  kind: KronosMinimapDotKind
) => KronosMinimapDotSpriteSize | null | undefined;

export interface KronosMinimapClickInput extends KronosMinimapMaskRows {
  readonly localTile: RuntimeTile;
  readonly clickX: number;
  readonly clickY: number;
  readonly camAngleY: number;
}

export interface KronosMinimapClickTarget {
  readonly tile: RuntimeTile;
  readonly centeredX: number;
  readonly centeredY: number;
  readonly rotatedLocalX: number;
  readonly rotatedLocalY: number;
}

export type KronosMinimapDotKind = RuntimeMinimapDotKind;
export type KronosMinimapMarkerKind = "destination" | "hint";

export const KRONOS_MINIMAP_UNITS_PER_TILE = 4;
export const KRONOS_MINIMAP_DOT_SIZE = 4;
export const KRONOS_MINIMAP_LOCAL_PLAYER_DOT_SIZE = 3;
export const KRONOS_MINIMAP_LOCAL_PLAYER_DOT_COLOR = 16777215;
export const KRONOS_MINIMAP_MAX_DOT_DISTANCE_SQUARED = 6400;
export const KRONOS_MINIMAP_CLIPPED_DOT_DISTANCE_SQUARED = 2500;
export const KRONOS_MINIMAP_HINT_EDGE_MIN_DISTANCE_SQUARED = 4225;
export const KRONOS_MINIMAP_HINT_EDGE_MAX_DISTANCE_SQUARED = 90000;
export const KRONOS_MINIMAP_HINT_EDGE_SIZE = 20;

const rasterizerTrigScale = 65536;
const radiansPerClientUnit = (Math.PI * 2) / KRONOS_CAMERA_UNITS;

export function kronosMinimapDotOffset(input: KronosMinimapDotOffsetInput): KronosMinimapDotOffset | null {
  const deltaX = Math.trunc(input.deltaX);
  const deltaY = Math.trunc(input.deltaY);
  const distanceSquared = deltaY * deltaY + deltaX * deltaX;
  if (distanceSquared > KRONOS_MINIMAP_MAX_DOT_DISTANCE_SQUARED) {
    return null;
  }

  const angle = wrapClientAngle(input.camAngleY);
  const sine = rasterizerSine(angle);
  const cosine = rasterizerCosine(angle);
  const rotatedX = (cosine * deltaX + deltaY * sine) >> 16;
  const rotatedY = (deltaY * cosine - sine * deltaX) >> 16;
  const left = rotatedX + Math.trunc(input.width / 2) - Math.trunc(input.spriteWidth / 2);
  const top = Math.trunc(input.height / 2) - rotatedY - Math.trunc(input.spriteHeight / 2);

  return {
    left,
    top,
    rotatedX,
    rotatedY,
    distanceSquared,
    clipped: distanceSquared > KRONOS_MINIMAP_CLIPPED_DOT_DISTANCE_SQUARED
  };
}

export function kronosMinimapActorDeltas(
  localTile: RuntimeTile,
  targetTile: RuntimeTile
): { readonly deltaX: number; readonly deltaY: number } {
  return {
    deltaX: Math.trunc((targetTile.x - localTile.x) * KRONOS_MINIMAP_UNITS_PER_TILE),
    deltaY: Math.trunc((targetTile.z - localTile.z) * KRONOS_MINIMAP_UNITS_PER_TILE)
  };
}

export function kronosMinimapActorTile(actor: Pick<RuntimeActorPose, "tile" | "renderTile">): RuntimeTile {
  return actor.renderTile ?? actor.tile;
}

export function kronosMinimapDestinationDeltas(
  localTile: RuntimeTile,
  destinationTile: RuntimeTile
): { readonly deltaX: number; readonly deltaY: number } {
  return {
    deltaX: Math.trunc(destinationTile.x * KRONOS_MINIMAP_UNITS_PER_TILE + 2 - Math.trunc(localTile.x * KRONOS_MINIMAP_UNITS_PER_TILE)),
    deltaY: Math.trunc(destinationTile.z * KRONOS_MINIMAP_UNITS_PER_TILE + 2 - Math.trunc(localTile.z * KRONOS_MINIMAP_UNITS_PER_TILE))
  };
}

export function kronosMinimapLocalPlayerDot(mask: KronosMinimapMask): KronosMinimapLocalPlayerDot {
  return {
    left: Math.trunc(mask.width / 2) - 1,
    top: Math.trunc(mask.height / 2) - 1,
    width: KRONOS_MINIMAP_LOCAL_PLAYER_DOT_SIZE,
    height: KRONOS_MINIMAP_LOCAL_PLAYER_DOT_SIZE
  };
}

export function kronosMinimapClickToTile(input: KronosMinimapClickInput): KronosMinimapClickTarget | null {
  const clickX = Math.trunc(input.clickX);
  const clickY = Math.trunc(input.clickY);
  if (!kronosMinimapMaskContains(input, clickX, clickY)) {
    return null;
  }

  const centeredX = clickX - Math.trunc(input.width / 2);
  const centeredY = clickY - Math.trunc(input.height / 2);
  const angle = wrapClientAngle(input.camAngleY);
  const sine = rasterizerSine(angle);
  const cosine = rasterizerCosine(angle);
  const rotatedLocalX = (centeredY * sine + centeredX * cosine) >> 11;
  const rotatedLocalY = (centeredY * cosine - sine * centeredX) >> 11;
  const localX = Math.trunc(input.localTile.x * 128);
  const localY = Math.trunc(input.localTile.z * 128);

  return {
    tile: {
      x: (rotatedLocalX + localX) >> 7,
      z: (localY - rotatedLocalY) >> 7
    },
    centeredX,
    centeredY,
    rotatedLocalX,
    rotatedLocalY
  };
}

export function kronosMinimapMaskContains(mask: KronosMinimapMaskRows, x: number, y: number): boolean {
  const clickX = Math.trunc(x);
  const clickY = Math.trunc(y);
  if (clickX < 0 || clickY < 0) {
    return false;
  }

  if (!mask.xStarts || !mask.xWidths) {
    return clickX < mask.width && clickY < mask.height;
  }

  if (clickY >= mask.xStarts.length || clickY >= mask.xWidths.length) {
    return false;
  }

  const xStart = mask.xStarts[clickY];
  const xWidth = mask.xWidths[clickY];
  return clickX >= xStart && clickX <= xStart + xWidth;
}

export function kronosMinimapDotsForSnapshot(
  snapshot: RuntimeSceneSnapshot,
  camAngleY: number,
  mask: KronosMinimapMask,
  dotSpriteSizeForKind: KronosMinimapDotSpriteSizeLookup
): readonly KronosMinimapDot[] {
  const localPlayer = snapshot.actors.find((actor) => actor.actorId === "local-player");
  if (!localPlayer) {
    return [];
  }
  const localTile = kronosMinimapActorTile(localPlayer);
  const entityDots = (snapshot.minimapEntities ?? []).flatMap((entity) => {
    const spriteSize = normalizedMinimapDotSpriteSize(dotSpriteSizeForKind(entity.kind));
    return spriteSize
      ? kronosMinimapDotForTile(entity.id, entity.tile, entity.kind, localTile, camAngleY, mask, spriteSize)
      : [];
  });

  const actorDots = snapshot.actors.flatMap((actor) => {
    if (actor.actorId === localPlayer.actorId) {
      return [];
    }
    const kind = actorMinimapDotKind(localPlayer, actor);
    const spriteSize = normalizedMinimapDotSpriteSize(dotSpriteSizeForKind(kind));
    if (!spriteSize) {
      return [];
    }

    return kronosMinimapDotForTile(
      actor.actorId,
      kronosMinimapActorTile(actor),
      kind,
      localTile,
      camAngleY,
      mask,
      spriteSize
    );
  });

  return [...entityDots, ...actorDots];
}

export function kronosMinimapDestinationMarker(
  localTile: RuntimeTile,
  destinationTile: RuntimeTile,
  camAngleY: number,
  mask: KronosMinimapMask,
  markerSpriteSize: KronosMinimapDotSpriteSize
): KronosMinimapMarker | null {
  const delta = kronosMinimapDestinationDeltas(localTile, destinationTile);
  const spriteWidth = Math.trunc(markerSpriteSize.width);
  const spriteHeight = Math.trunc(markerSpriteSize.height);
  const offset = kronosMinimapDotOffset({
    ...delta,
    ...mask,
    camAngleY,
    spriteWidth,
    spriteHeight
  });
  if (!offset) {
    return null;
  }

  return {
    ...offset,
    id: "destination",
    tile: destinationTile,
    kind: "destination",
    sourceSpriteIndex: kronosMinimapMapMarkerSpriteIndex("destination"),
    width: spriteWidth,
    height: spriteHeight
  };
}

export function kronosMinimapHintMarker(
  hintId: string,
  localTile: RuntimeTile,
  hintTile: RuntimeTile,
  camAngleY: number,
  mask: KronosMinimapMask,
  markerSpriteSize: KronosMinimapDotSpriteSize
): KronosMinimapMarker | null {
  const delta = kronosMinimapDestinationDeltas(localTile, hintTile);
  const distanceSquared = delta.deltaX * delta.deltaX + delta.deltaY * delta.deltaY;
  const spriteWidth = Math.trunc(markerSpriteSize.width);
  const spriteHeight = Math.trunc(markerSpriteSize.height);

  if (
    distanceSquared > KRONOS_MINIMAP_HINT_EDGE_MIN_DISTANCE_SQUARED &&
    distanceSquared < KRONOS_MINIMAP_HINT_EDGE_MAX_DISTANCE_SQUARED
  ) {
    const edge = kronosMinimapHintEdgeOffset(delta.deltaX, delta.deltaY, camAngleY, mask);
    return {
      ...edge,
      id: hintId,
      tile: hintTile,
      kind: "hint",
      sourceSpriteIndex: kronosMinimapMapMarkerSpriteIndex("hint"),
      width: KRONOS_MINIMAP_HINT_EDGE_SIZE,
      height: KRONOS_MINIMAP_HINT_EDGE_SIZE,
      rotationDegrees: edge.rotationDegrees
    };
  }

  const offset = kronosMinimapDotOffset({
    ...delta,
    ...mask,
    camAngleY,
    spriteWidth,
    spriteHeight
  });
  if (!offset) {
    return null;
  }

  return {
    ...offset,
    id: hintId,
    tile: hintTile,
    kind: "hint",
    sourceSpriteIndex: kronosMinimapMapMarkerSpriteIndex("hint"),
    width: spriteWidth,
    height: spriteHeight
  };
}

export function kronosMinimapMapIconForObject(
  object: {
    readonly key: string;
    readonly objectId: number;
    readonly mapIconId: number;
    readonly tile: RuntimeTile;
  },
  localTile: RuntimeTile,
  camAngleY: number,
  mask: KronosMinimapMask,
  spriteSize: KronosMinimapDotSpriteSize
): KronosMinimapMapIcon | null {
  return kronosMinimapMapIconForSource(
    {
      id: object.key,
      objectId: object.objectId,
      mapIconId: object.mapIconId,
      tile: object.tile
    },
    localTile,
    camAngleY,
    mask,
    spriteSize
  );
}

export function kronosMinimapMapIconForSource(
  icon: {
    readonly id: string;
    readonly objectId: number;
    readonly mapIconId: number;
    readonly tile: RuntimeTile;
  },
  localTile: RuntimeTile,
  camAngleY: number,
  mask: KronosMinimapMask,
  spriteSize: KronosMinimapDotSpriteSize
): KronosMinimapMapIcon | null {
  const delta = kronosMinimapDestinationDeltas(localTile, icon.tile);
  const spriteWidth = Math.trunc(spriteSize.width);
  const spriteHeight = Math.trunc(spriteSize.height);
  const offset = kronosMinimapDotOffset({
    ...delta,
    ...mask,
    camAngleY,
    spriteWidth,
    spriteHeight
  });
  if (!offset) {
    return null;
  }

  return {
    ...offset,
    id: icon.id,
    objectId: icon.objectId,
    mapIconId: icon.mapIconId,
    tile: icon.tile,
    width: spriteWidth,
    height: spriteHeight
  };
}

function kronosMinimapDotForTile(
  id: string,
  tile: RuntimeTile,
  kind: KronosMinimapDotKind,
  localTile: RuntimeTile,
  camAngleY: number,
  mask: KronosMinimapMask,
  spriteSize: KronosMinimapDotSpriteSize
): readonly KronosMinimapDot[] {
  const delta = kronosMinimapActorDeltas(localTile, tile);
  const spriteWidth = Math.trunc(spriteSize.width);
  const spriteHeight = Math.trunc(spriteSize.height);
  const offset = kronosMinimapDotOffset({
    ...delta,
    ...mask,
    camAngleY,
    spriteWidth,
    spriteHeight
  });
  if (!offset) {
    return [];
  }

  return [
    {
      ...offset,
      actorId: id,
      kind,
      sourceSpriteIndex: kronosMinimapMapDotSpriteIndex(kind),
      width: spriteWidth,
      height: spriteHeight
    }
  ];
}

function normalizedMinimapDotSpriteSize(
  size: KronosMinimapDotSpriteSize | null | undefined
): KronosMinimapDotSpriteSize | null {
  if (!size) {
    return null;
  }
  const width = Math.trunc(size.width);
  const height = Math.trunc(size.height);
  return width > 0 && height > 0 ? { width, height } : null;
}

function actorMinimapDotKind(localPlayer: RuntimeActorPose, actor: RuntimeActorPose): KronosMinimapDotKind {
  if (actor.minimapDotKind) {
    return actor.minimapDotKind;
  }

  const localTeam = localPlayer.appearance?.team ?? 0;
  const actorTeam = actor.appearance?.team ?? 0;
  if (localTeam !== 0 && actorTeam !== 0 && actorTeam === localTeam) {
    return "team";
  }
  return "player";
}

function kronosMinimapHintEdgeOffset(
  deltaX: number,
  deltaY: number,
  camAngleY: number,
  mask: KronosMinimapMask
): KronosMinimapDotOffset & { readonly rotationDegrees: number } {
  const angle = wrapClientAngle(camAngleY);
  const sine = rasterizerSine(angle);
  const cosine = rasterizerCosine(angle);
  const rotatedX = (cosine * deltaX + deltaY * sine) >> 16;
  const rotatedY = (deltaY * cosine - sine * deltaX) >> 16;
  const rotationRadians = Math.atan2(rotatedX, rotatedY);
  const edgeRadius = Math.trunc(mask.width / 2) - 25;
  const edgeX = Math.trunc(Math.sin(rotationRadians) * edgeRadius);
  const edgeY = Math.trunc(Math.cos(rotationRadians) * edgeRadius);
  const distanceSquared = deltaY * deltaY + deltaX * deltaX;

  return {
    left: edgeX + Math.trunc(mask.width / 2) - Math.trunc(KRONOS_MINIMAP_HINT_EDGE_SIZE / 2),
    top: Math.trunc(mask.height / 2) - Math.trunc(KRONOS_MINIMAP_HINT_EDGE_SIZE / 2) - edgeY - 10,
    rotatedX,
    rotatedY,
    distanceSquared,
    clipped: true,
    rotationDegrees: (rotationRadians * 180) / Math.PI
  };
}

export function kronosMinimapMapDotSpriteIndex(kind: KronosMinimapDotKind): number {
  if (kind === "item") {
    return 0;
  }
  if (kind === "npc") {
    return 1;
  }
  if (kind === "friend") {
    return 3;
  }
  if (kind === "team") {
    return 4;
  }
  if (kind === "friends-chat") {
    return 5;
  }
  return 2;
}

export function kronosMinimapMapMarkerSpriteIndex(kind: KronosMinimapMarkerKind): number {
  return kind === "hint" ? 1 : 0;
}

function rasterizerSine(angle: number): number {
  return Math.trunc(rasterizerTrigScale * Math.sin(angle * radiansPerClientUnit));
}

function rasterizerCosine(angle: number): number {
  return Math.trunc(rasterizerTrigScale * Math.cos(angle * radiansPerClientUnit));
}

function wrapClientAngle(units: number): number {
  return ((Math.trunc(units) % KRONOS_CAMERA_UNITS) + KRONOS_CAMERA_UNITS) % KRONOS_CAMERA_UNITS;
}
