import type { RuntimeTile } from "./runtimeScene";

export interface NhArenaMetadata {
  readonly bounds: {
    readonly west: number;
    readonly south: number;
    readonly east: number;
    readonly north: number;
    readonly plane: number;
  };
  readonly tiles: readonly NhArenaTile[];
}

export interface NhArenaTile {
  readonly x: number;
  readonly y: number;
  readonly plane: number;
  readonly height: number;
  readonly settings?: number;
  readonly overlayId?: number;
  readonly overlayPath?: number;
  readonly overlayRotation?: number;
  readonly underlayId?: number;
  readonly heights?: {
    readonly southWest?: number;
    readonly southEast?: number;
    readonly northEast?: number;
    readonly northWest?: number;
  };
}

export interface NhArenaObjectPlacement {
  readonly id: number;
  readonly name: string;
  readonly actions?: readonly (string | null)[];
  readonly type: number;
  readonly orientation: number;
  readonly x: number;
  readonly y: number;
  readonly plane: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly interactType?: number;
  readonly blocksProjectile?: boolean;
  readonly accessBlockMask?: number;
  readonly wallOrDoor?: number;
  readonly obstructsGround?: boolean;
  readonly isHollow?: boolean;
  readonly mapSceneId?: number;
  readonly mapIconId?: number;
  readonly animationId?: number;
  readonly transformVarbit?: number;
  readonly transformVarp?: number;
  readonly transforms?: readonly number[];
}

export interface NhWorldTile {
  readonly x: number;
  readonly y: number;
  readonly plane: number;
}

export interface NhSceneCollision {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly blockedTiles: ReadonlySet<string>;
  snapTile(tile: RuntimeTile): RuntimeTile;
  canStand(tile: RuntimeTile): boolean;
  canStep(from: RuntimeTile, to: RuntimeTile): boolean;
  sceneToWorldTile(tile: RuntimeTile): NhWorldTile;
  worldToSceneTile(tile: NhWorldTile): RuntimeTile;
  getFlagWorld(x: number, y: number): number;
  getProjectileFlagWorld(x: number, y: number): number;
  sampleHeight(tile: RuntimeTile): number;
}

export interface NhSceneOffset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface NhScenePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface NhArenaTileSceneCorners {
  readonly southWest: NhScenePoint;
  readonly southEast: NhScenePoint;
  readonly northEast: NhScenePoint;
  readonly northWest: NhScenePoint;
}

interface TileCornerHeights {
  readonly southWest: number;
  readonly southEast: number;
  readonly northEast: number;
  readonly northWest: number;
}

const tileScale = 0.5;
const terrainHeightScale = 0.08 / 128;
const tileEpsilon = 0.0001;

export const NH_OBJECT_MASK = 0x100;
export const NH_UNMOVABLE_MASK = 0x200000;
export const NH_FLOOR_DECORATION_MASK = 0x40000;
export const NH_PROJECTILE_MASK = 0x20000;
export const NH_BLOCK_MOVEMENT_FULL =
  NH_OBJECT_MASK | NH_FLOOR_DECORATION_MASK | NH_UNMOVABLE_MASK;

export const NH_WEST_MASK = 0x1240108;
export const NH_EAST_MASK = 0x1240180;
export const NH_SOUTH_MASK = 0x1240102;
export const NH_NORTH_MASK = 0x1240120;
export const NH_SOUTH_WEST_MASK = 0x124010e;
export const NH_NORTH_WEST_MASK = 0x1240138;
export const NH_SOUTH_EAST_MASK = 0x1240183;
export const NH_NORTH_EAST_MASK = 0x12401e0;

export function snapNhTile(tile: RuntimeTile): RuntimeTile {
  return {
    x: snapAxis(tile.x),
    z: snapAxis(tile.z)
  };
}

export function nhArenaWorldTileCenterToScene(
  arena: NhArenaMetadata,
  sceneOffset: NhSceneOffset,
  worldX: number,
  worldY: number
): RuntimeTile {
  return worldTileCenterToScene(arena, sceneOffset, worldX, worldY);
}

export function nhArenaTileSceneCorners(
  arena: NhArenaMetadata,
  sceneOffset: NhSceneOffset,
  tile: NhArenaTile
): NhArenaTileSceneCorners {
  const heights = tileCornerHeights(tile);
  const west = roundSceneAxis((tile.x - arena.bounds.west) * tileScale + sceneOffset.x);
  const east = roundSceneAxis((tile.x + 1 - arena.bounds.west) * tileScale + sceneOffset.x);
  const south = roundSceneAxis((tile.y - arena.bounds.south) * tileScale + sceneOffset.z);
  const north = roundSceneAxis((tile.y + 1 - arena.bounds.south) * tileScale + sceneOffset.z);
  return {
    southWest: { x: west, y: heights.southWest + sceneOffset.y, z: south },
    southEast: { x: east, y: heights.southEast + sceneOffset.y, z: south },
    northEast: { x: east, y: heights.northEast + sceneOffset.y, z: north },
    northWest: { x: west, y: heights.northWest + sceneOffset.y, z: north }
  };
}

export function buildNhSceneCollision(
  arena: NhArenaMetadata,
  objects: readonly NhArenaObjectPlacement[],
  sceneOffset: NhSceneOffset
): NhSceneCollision {
  const flagsByWorldTile = new Map<string, number>();
  const projectileFlagsByWorldTile = new Map<string, number>();
  const heightByCorner = new Map<string, number>();
  const walkableWorldTiles = new Set<string>();
  for (const tile of arena.tiles) {
    walkableWorldTiles.add(worldTileKey(tile.x, tile.y, tile.plane));
    const heights = tileCornerHeights(tile);
    heightByCorner.set(worldCornerKey(tile.x, tile.y, tile.plane), heights.southWest);
    heightByCorner.set(worldCornerKey(tile.x + 1, tile.y, tile.plane), heights.southEast);
    heightByCorner.set(worldCornerKey(tile.x + 1, tile.y + 1, tile.plane), heights.northEast);
    heightByCorner.set(worldCornerKey(tile.x, tile.y + 1, tile.plane), heights.northWest);
  }

  const minX = worldTileCenterToScene(arena, sceneOffset, arena.bounds.west, arena.bounds.south).x;
  const maxX = worldTileCenterToScene(arena, sceneOffset, arena.bounds.east, arena.bounds.south).x;
  const minZ = worldTileCenterToScene(arena, sceneOffset, arena.bounds.west, arena.bounds.south).z;
  const maxZ = worldTileCenterToScene(arena, sceneOffset, arena.bounds.west, arena.bounds.north).z;

  const addFlagWorld = (x: number, y: number, mask: number): void => {
    const key = worldTileKey(x, y, arena.bounds.plane);
    if (!walkableWorldTiles.has(key)) {
      return;
    }
    flagsByWorldTile.set(key, (flagsByWorldTile.get(key) ?? 0) | mask);
  };

  const addProjectileFlagWorld = (x: number, y: number, mask: number): void => {
    const key = worldTileKey(x, y, arena.bounds.plane);
    if (!walkableWorldTiles.has(key)) {
      return;
    }
    projectileFlagsByWorldTile.set(key, (projectileFlagsByWorldTile.get(key) ?? 0) | mask);
  };

  for (const placement of objects) {
    if (placement.plane !== arena.bounds.plane) {
      continue;
    }
    addObjectPlacementCollision(placement, addFlagWorld, addProjectileFlagWorld);
  }

  const getFlagWorld = (x: number, y: number): number => {
    const key = worldTileKey(x, y, arena.bounds.plane);
    if (!walkableWorldTiles.has(key)) {
      return NH_UNMOVABLE_MASK;
    }
    return flagsByWorldTile.get(key) ?? 0;
  };

  const getProjectileFlagWorld = (x: number, y: number): number => {
    const key = worldTileKey(x, y, arena.bounds.plane);
    if (!walkableWorldTiles.has(key)) {
      return NH_UNMOVABLE_MASK;
    }
    return projectileFlagsByWorldTile.get(key) ?? 0;
  };

  const sceneToWorldTile = (tile: RuntimeTile): NhWorldTile =>
    sceneTileToWorldTile(arena, sceneOffset, tile);

  const worldToSceneTile = (tile: NhWorldTile): RuntimeTile =>
    worldTileCenterToScene(arena, sceneOffset, tile.x, tile.y);

  const snapTile = (tile: RuntimeTile): RuntimeTile => worldToSceneTile(sceneToWorldTile(tile));

  const blockedTiles = new Set<string>();
  for (const key of walkableWorldTiles) {
    const [x, y] = parseWorldTileKey(key);
    if ((getFlagWorld(x, y) & NH_BLOCK_MOVEMENT_FULL) !== 0) {
      blockedTiles.add(tileKey(worldTileCenterToScene(arena, sceneOffset, x, y)));
    }
  }

  const canStand = (tile: RuntimeTile): boolean => {
    const snapped = snapTile(tile);
    const world = sceneToWorldTile(snapped);
    return (
      snapped.x >= Math.min(minX, maxX) - tileEpsilon &&
      snapped.x <= Math.max(minX, maxX) + tileEpsilon &&
      snapped.z >= Math.min(minZ, maxZ) - tileEpsilon &&
      snapped.z <= Math.max(minZ, maxZ) + tileEpsilon &&
      (getFlagWorld(world.x, world.y) & NH_BLOCK_MOVEMENT_FULL) === 0
    );
  };

  return {
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minZ: Math.min(minZ, maxZ),
    maxZ: Math.max(minZ, maxZ),
    blockedTiles,
    snapTile,
    canStand,
    canStep(from: RuntimeTile, to: RuntimeTile): boolean {
      const start = snapTile(from);
      const end = snapTile(to);
      if (!canStand(end)) {
        return false;
      }

      const startWorld = sceneToWorldTile(start);
      const endWorld = sceneToWorldTile(end);
      const deltaX = Math.sign(endWorld.x - startWorld.x);
      const deltaY = Math.sign(endWorld.y - startWorld.y);
      return (
        Math.abs(endWorld.x - startWorld.x) <= 1 &&
        Math.abs(endWorld.y - startWorld.y) <= 1 &&
        (deltaX !== 0 || deltaY !== 0) &&
        allowEntranceWorld(startWorld.x, startWorld.y, deltaX, deltaY, getFlagWorld)
      );
    },
    sceneToWorldTile,
    worldToSceneTile,
    getFlagWorld,
    getProjectileFlagWorld,
    sampleHeight(tile: RuntimeTile): number {
      const world = sceneTileToWorld(arena, sceneOffset, tile);
      const baseX = Math.floor(world.x);
      const baseY = Math.floor(world.y);
      const fracX = world.x - baseX;
      const fracY = world.y - baseY;
      const southWest = heightByCorner.get(worldCornerKey(baseX, baseY, arena.bounds.plane)) ?? 0;
      const southEast = heightByCorner.get(worldCornerKey(baseX + 1, baseY, arena.bounds.plane)) ?? southWest;
      const northEast = heightByCorner.get(worldCornerKey(baseX + 1, baseY + 1, arena.bounds.plane)) ?? southEast;
      const northWest = heightByCorner.get(worldCornerKey(baseX, baseY + 1, arena.bounds.plane)) ?? southWest;
      const south = lerp(southWest, southEast, fracX);
      const north = lerp(northWest, northEast, fracX);
      return lerp(south, north, fracY) + sceneOffset.y;
    }
  };
}

export function clientObjectFootprint(placement: NhArenaObjectPlacement): { readonly sizeX: number; readonly sizeY: number } {
  const orientation = placement.orientation & 3;
  if (orientation === 1 || orientation === 3) {
    return { sizeX: placement.sizeY, sizeY: placement.sizeX };
  }
  return { sizeX: placement.sizeX, sizeY: placement.sizeY };
}

function addObjectPlacementCollision(
  placement: NhArenaObjectPlacement,
  addFlagWorld: (x: number, y: number, mask: number) => void,
  addProjectileFlagWorld: (x: number, y: number, mask: number) => void
): void {
  const interactType = placement.interactType ?? 0;
  const solid = placement.blocksProjectile === true;
  const type = placement.type;
  if (type === 22) {
    if (interactType === 1) {
      addFlagWorld(placement.x, placement.y, NH_FLOOR_DECORATION_MASK);
    }
    return;
  }

  if (interactType === 0) {
    return;
  }

  if (type === 0 || type === 1 || type === 2 || type === 3) {
    addWallCollision(placement.x, placement.y, type, placement.orientation & 3, solid, addFlagWorld);
    if (solid) {
      addWallCollision(placement.x, placement.y, type, placement.orientation & 3, true, addProjectileFlagWorld);
    }
    return;
  }

  if (type === 9 || type === 10 || type === 11 || type >= 12) {
    const footprint = clientObjectFootprint(placement);
    addRectangleCollision(placement.x, placement.y, footprint.sizeX, footprint.sizeY, solid, addFlagWorld);
    if (solid) {
      addRectangleCollision(placement.x, placement.y, footprint.sizeX, footprint.sizeY, true, addProjectileFlagWorld);
    }
  }
}

function addRectangleCollision(
  x: number,
  y: number,
  width: number,
  height: number,
  solid: boolean,
  addFlagWorld: (x: number, y: number, mask: number) => void
): void {
  const mask = NH_OBJECT_MASK | (solid ? NH_PROJECTILE_MASK : 0);
  for (let dx = 0; dx < width; dx += 1) {
    for (let dy = 0; dy < height; dy += 1) {
      addFlagWorld(x + dx, y + dy, mask);
    }
  }
}

function addWallCollision(
  x: number,
  y: number,
  type: number,
  orientation: number,
  solid: boolean,
  addFlagWorld: (x: number, y: number, mask: number) => void
): void {
  const add = (flagX: number, flagY: number, mask: number): void => {
    addFlagWorld(flagX, flagY, mask);
  };

  if (type === 0) {
    if (orientation === 0) {
      add(x, y, 128);
      add(x - 1, y, 8);
    } else if (orientation === 1) {
      add(x, y, 2);
      add(x, y + 1, 32);
    } else if (orientation === 2) {
      add(x, y, 8);
      add(x + 1, y, 128);
    } else if (orientation === 3) {
      add(x, y, 32);
      add(x, y - 1, 2);
    }
  } else if (type === 1 || type === 3) {
    if (orientation === 0) {
      add(x, y, 1);
      add(x - 1, y + 1, 16);
    } else if (orientation === 1) {
      add(x, y, 4);
      add(x + 1, y + 1, 64);
    } else if (orientation === 2) {
      add(x, y, 16);
      add(x + 1, y - 1, 1);
    } else if (orientation === 3) {
      add(x, y, 64);
      add(x - 1, y - 1, 4);
    }
  } else if (type === 2) {
    if (orientation === 0) {
      add(x, y, 130);
      add(x - 1, y, 8);
      add(x, y + 1, 32);
    } else if (orientation === 1) {
      add(x, y, 10);
      add(x, y + 1, 32);
      add(x + 1, y, 128);
    } else if (orientation === 2) {
      add(x, y, 40);
      add(x + 1, y, 128);
      add(x, y - 1, 2);
    } else if (orientation === 3) {
      add(x, y, 160);
      add(x, y - 1, 2);
      add(x - 1, y, 8);
    }
  }

  if (!solid) {
    return;
  }

  if (type === 0) {
    if (orientation === 0) {
      add(x, y, 65536);
      add(x - 1, y, 4096);
    } else if (orientation === 1) {
      add(x, y, 1024);
      add(x, y + 1, 16384);
    } else if (orientation === 2) {
      add(x, y, 4096);
      add(x + 1, y, 65536);
    } else if (orientation === 3) {
      add(x, y, 16384);
      add(x, y - 1, 1024);
    }
  } else if (type === 1 || type === 3) {
    if (orientation === 0) {
      add(x, y, 512);
      add(x - 1, y + 1, 8192);
    } else if (orientation === 1) {
      add(x, y, 2048);
      add(x + 1, y + 1, 32768);
    } else if (orientation === 2) {
      add(x, y, 8192);
      add(x + 1, y - 1, 512);
    } else if (orientation === 3) {
      add(x, y, 32768);
      add(x - 1, y - 1, 2048);
    }
  } else if (type === 2) {
    if (orientation === 0) {
      add(x, y, 66560);
      add(x - 1, y, 4096);
      add(x, y + 1, 16384);
    } else if (orientation === 1) {
      add(x, y, 5120);
      add(x, y + 1, 16384);
      add(x + 1, y, 65536);
    } else if (orientation === 2) {
      add(x, y, 20480);
      add(x + 1, y, 65536);
      add(x, y - 1, 1024);
    } else if (orientation === 3) {
      add(x, y, 81920);
      add(x, y - 1, 1024);
      add(x - 1, y, 4096);
    }
  }
}

function allowEntranceWorld(
  x: number,
  y: number,
  deltaX: number,
  deltaY: number,
  getFlagWorld: (x: number, y: number) => number
): boolean {
  if (deltaX === -1 && deltaY === 0) {
    return (getFlagWorld(x - 1, y) & NH_WEST_MASK) === 0;
  }
  if (deltaX === 1 && deltaY === 0) {
    return (getFlagWorld(x + 1, y) & NH_EAST_MASK) === 0;
  }
  if (deltaX === 0 && deltaY === -1) {
    return (getFlagWorld(x, y - 1) & NH_SOUTH_MASK) === 0;
  }
  if (deltaX === 0 && deltaY === 1) {
    return (getFlagWorld(x, y + 1) & NH_NORTH_MASK) === 0;
  }
  if (deltaX === -1 && deltaY === -1) {
    return (
      (getFlagWorld(x - 1, y - 1) & NH_SOUTH_WEST_MASK) === 0 &&
      (getFlagWorld(x - 1, y) & NH_WEST_MASK) === 0 &&
      (getFlagWorld(x, y - 1) & NH_SOUTH_MASK) === 0
    );
  }
  if (deltaX === 1 && deltaY === -1) {
    return (
      (getFlagWorld(x + 1, y - 1) & NH_SOUTH_EAST_MASK) === 0 &&
      (getFlagWorld(x + 1, y) & NH_EAST_MASK) === 0 &&
      (getFlagWorld(x, y - 1) & NH_SOUTH_MASK) === 0
    );
  }
  if (deltaX === -1 && deltaY === 1) {
    return (
      (getFlagWorld(x - 1, y + 1) & NH_NORTH_WEST_MASK) === 0 &&
      (getFlagWorld(x - 1, y) & NH_WEST_MASK) === 0 &&
      (getFlagWorld(x, y + 1) & NH_NORTH_MASK) === 0
    );
  }
  if (deltaX === 1 && deltaY === 1) {
    return (
      (getFlagWorld(x + 1, y + 1) & NH_NORTH_EAST_MASK) === 0 &&
      (getFlagWorld(x + 1, y) & NH_EAST_MASK) === 0 &&
      (getFlagWorld(x, y + 1) & NH_NORTH_MASK) === 0
    );
  }
  return false;
}

function tileCornerHeights(tile: NhArenaTile): TileCornerHeights {
  const heights = tile.heights ?? {};
  return {
    southWest: terrainHeight(heights.southWest ?? tile.height),
    southEast: terrainHeight(heights.southEast ?? tile.height),
    northEast: terrainHeight(heights.northEast ?? tile.height),
    northWest: terrainHeight(heights.northWest ?? tile.height)
  };
}

function worldTileCenterToScene(
  arena: NhArenaMetadata,
  sceneOffset: NhSceneOffset,
  worldX: number,
  worldY: number
): RuntimeTile {
  return {
    x: roundSceneAxis((worldX + 0.5 - arena.bounds.west) * tileScale + sceneOffset.x),
    z: roundSceneAxis((worldY + 0.5 - arena.bounds.south) * tileScale + sceneOffset.z)
  };
}

function sceneTileToWorld(
  arena: NhArenaMetadata,
  sceneOffset: NhSceneOffset,
  tile: RuntimeTile
): { readonly x: number; readonly y: number } {
  return {
    x: (tile.x - sceneOffset.x) / tileScale + arena.bounds.west,
    y: (tile.z - sceneOffset.z) / tileScale + arena.bounds.south
  };
}

function sceneTileToWorldTile(
  arena: NhArenaMetadata,
  sceneOffset: NhSceneOffset,
  tile: RuntimeTile
): NhWorldTile {
  const world = sceneTileToWorld(arena, sceneOffset, tile);
  return {
    x: Math.floor(world.x + tileEpsilon),
    y: Math.floor(world.y + tileEpsilon),
    plane: arena.bounds.plane
  };
}

function snapAxis(value: number): number {
  return Math.round(value / tileScale) * tileScale;
}

function tileKey(tile: RuntimeTile): string {
  return `${tile.x.toFixed(3)}:${tile.z.toFixed(3)}`;
}

function roundSceneAxis(value: number): number {
  return Number(value.toFixed(6));
}

function worldCornerKey(x: number, y: number, plane: number): string {
  return `${x}:${y}:${plane}`;
}

function worldTileKey(x: number, y: number, plane: number): string {
  return `${x}:${y}:${plane}`;
}

function parseWorldTileKey(key: string): readonly [number, number, number] {
  const [x, y, plane] = key.split(":").map((value) => Number.parseInt(value, 10));
  return [x, y, plane];
}

function terrainHeight(height: number): number {
  return -height * terrainHeightScale;
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}
