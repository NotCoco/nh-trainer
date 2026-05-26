import type { RuntimeTile } from "./runtimeScene";
import {
  KRONOS_EAST_MASK,
  KRONOS_NORTH_EAST_MASK,
  KRONOS_NORTH_MASK,
  KRONOS_NORTH_WEST_MASK,
  KRONOS_SOUTH_EAST_MASK,
  KRONOS_SOUTH_MASK,
  KRONOS_SOUTH_WEST_MASK,
  KRONOS_WEST_MASK,
  type KronosArenaObjectPlacement,
  type KronosSceneCollision,
  type KronosWorldTile
} from "./kronosSceneCollision";

export const KRONOS_TILE_WORLD_UNITS = 0.5;
export const KRONOS_GAME_TICK_MS = 600;

export interface KronosRouteStep {
  readonly tile: RuntimeTile;
  readonly facingDegrees: number;
}

interface RouteNode {
  readonly x: number;
  readonly y: number;
}

const routeGridSize = 128;
const routeGridCenter = 64;
const routeQueueMask = 0xfff;
const unreachableDistance = 99999999;
const fallbackRange = 10;
const wallWestAccessMask = 0x8;
const wallEastAccessMask = 0x80;
const wallSouthAccessMask = 0x2;
const wallNorthAccessMask = 0x20;
const objectAccessWestBlock = 0x8;
const objectAccessEastBlock = 0x2;
const objectAccessSouthBlock = 0x4;
const objectAccessNorthBlock = 0x1;

interface KronosWorldRouteTarget {
  readonly x: number;
  readonly y: number;
  readonly plane: number;
  readonly width: number;
  readonly height: number;
  isReached(x: number, y: number, collision: KronosSceneCollision): boolean;
}

export function findKronosTileRouteWaypoints(
  startTile: RuntimeTile,
  destinationTile: RuntimeTile,
  collision: KronosSceneCollision
): readonly RuntimeTile[] {
  const start = collision.snapTile(startTile);
  const destination = collision.snapTile(destinationTile);

  if (!collision.canStand(start)) {
    return [];
  }

  const startWorld = collision.sceneToWorldTile(start);
  const destinationWorld = collision.sceneToWorldTile(destination);
  const worldPath = findKronosWorldRoutePath(startWorld, exactWorldRouteTarget(destinationWorld), collision);
  return worldPath.map((tile) => collision.worldToSceneTile(tile));
}

export function findKronosObjectRouteWaypoints(
  startTile: RuntimeTile,
  placement: KronosArenaObjectPlacement,
  collision: KronosSceneCollision
): readonly RuntimeTile[] {
  const start = collision.snapTile(startTile);

  if (!collision.canStand(start)) {
    return [];
  }

  const startWorld = collision.sceneToWorldTile(start);
  if (startWorld.plane !== placement.plane) {
    return [];
  }

  const worldPath = findKronosWorldRoutePath(startWorld, objectWorldRouteTarget(placement), collision);
  return worldPath.map((tile) => collision.worldToSceneTile(tile));
}

export function findKronosTargetRouteWaypoints(
  startTile: RuntimeTile,
  targetTile: RuntimeTile,
  distance: number,
  collision: KronosSceneCollision
): readonly RuntimeTile[] {
  const start = collision.snapTile(startTile);
  const target = collision.snapTile(targetTile);

  if (!collision.canStand(start)) {
    return [];
  }

  const startWorld = collision.sceneToWorldTile(start);
  const targetWorld = collision.sceneToWorldTile(target);
  if (startWorld.plane !== targetWorld.plane) {
    return [];
  }

  const worldPath = findKronosWorldRoutePath(startWorld, entityTargetWorldRouteTarget(targetWorld, distance), collision);
  return worldPath.map((tile) => collision.worldToSceneTile(tile));
}

export function kronosSceneObjectRouteReached(
  tile: RuntimeTile,
  placement: KronosArenaObjectPlacement,
  collision: KronosSceneCollision
): boolean {
  const world = collision.sceneToWorldTile(collision.snapTile(tile));
  return world.plane === placement.plane && objectWorldRouteTarget(placement).isReached(world.x, world.y, collision);
}

export function kronosSceneTargetRouteReached(
  tile: RuntimeTile,
  targetTile: RuntimeTile,
  distance: number,
  collision: KronosSceneCollision
): boolean {
  const world = collision.sceneToWorldTile(collision.snapTile(tile));
  const targetWorld = collision.sceneToWorldTile(collision.snapTile(targetTile));
  return world.plane === targetWorld.plane && entityTargetWorldRouteTarget(targetWorld, distance).isReached(world.x, world.y, collision);
}

export function kronosSceneProjectileRouteClear(
  tile: RuntimeTile,
  targetTile: RuntimeTile,
  collision: KronosSceneCollision,
  size = 1,
  targetSize = 1
): boolean {
  const world = collision.sceneToWorldTile(collision.snapTile(tile));
  const targetWorld = collision.sceneToWorldTile(collision.snapTile(targetTile));
  return (
    world.plane === targetWorld.plane &&
    kronosWorldProjectileRouteClear(world.x, world.y, world.plane, size, targetWorld.x, targetWorld.y, targetSize, collision)
  );
}

export function kronosWorldProjectileRouteClear(
  sourceX: number,
  sourceY: number,
  plane: number,
  size: number,
  targetX: number,
  targetY: number,
  targetSize: number,
  collision: KronosSceneCollision
): boolean {
  let projectedTargetX = targetX * 2 + targetSize - 1;
  let projectedTargetY = targetY * 2 + targetSize - 1;
  let projectedSourceX = sourceX * 2 + size - 1;
  let projectedSourceY = sourceY * 2 + size - 1;

  if ((projectedTargetX & 1) !== 0) {
    projectedTargetX += projectedTargetX > projectedSourceX ? -1 : 1;
  }
  if ((projectedTargetY & 1) !== 0) {
    projectedTargetY += projectedTargetY > projectedSourceY ? -1 : 1;
  }

  if ((projectedSourceX & 1) !== 0) {
    projectedSourceX += projectedSourceX > projectedTargetX ? -1 : 1;
  }
  if ((projectedSourceY & 1) !== 0) {
    projectedSourceY += projectedSourceY > projectedTargetY ? -1 : 1;
  }

  return kronosWorldProjectileLineClear(
    projectedSourceX >> 1,
    projectedSourceY >> 1,
    plane,
    projectedTargetX >> 1,
    projectedTargetY >> 1,
    collision
  );
}

function findKronosWorldRoutePath(
  start: KronosWorldTile,
  target: KronosWorldRouteTarget,
  collision: KronosSceneCollision
): readonly KronosWorldTile[] {
  if (target.isReached(start.x, start.y, collision)) {
    return [];
  }

  const directions = createRouteGrid(0);
  const distances = createRouteGrid(unreachableDistance);
  const queue: RouteNode[] = new Array(4096);
  const baseArrayOffsetX = start.x - routeGridCenter;
  const baseArrayOffsetY = start.y - routeGridCenter;

  directions[routeGridCenter][routeGridCenter] = 99;
  distances[routeGridCenter][routeGridCenter] = 0;
  queue[0] = { x: start.x, y: start.y };

  let readOffset = 0;
  let writeOffset = 1;
  let currentX = start.x;
  let currentY = start.y;
  let reachable = false;
  let foundX = start.x;
  let foundY = start.y;

  while (readOffset !== writeOffset) {
    const current = queue[readOffset];
    currentX = current.x;
    currentY = current.y;
    readOffset = (readOffset + 1) & routeQueueMask;

    const arrayX = currentX - baseArrayOffsetX;
    const arrayY = currentY - baseArrayOffsetY;
    if (target.isReached(currentX, currentY, collision)) {
      reachable = true;
      foundX = currentX;
      foundY = currentY;
      break;
    }

    const distance = distances[arrayX][arrayY] + 1;
    if (
      arrayX > 0 &&
      directions[arrayX - 1][arrayY] === 0 &&
      (collision.getFlagWorld(currentX - 1, currentY) & KRONOS_WEST_MASK) === 0
    ) {
      queue[writeOffset] = { x: currentX - 1, y: currentY };
      writeOffset = (writeOffset + 1) & routeQueueMask;
      directions[arrayX - 1][arrayY] = 2;
      distances[arrayX - 1][arrayY] = distance;
    }

    if (
      arrayX < routeGridSize - 1 &&
      directions[arrayX + 1][arrayY] === 0 &&
      (collision.getFlagWorld(currentX + 1, currentY) & KRONOS_EAST_MASK) === 0
    ) {
      queue[writeOffset] = { x: currentX + 1, y: currentY };
      writeOffset = (writeOffset + 1) & routeQueueMask;
      directions[arrayX + 1][arrayY] = 8;
      distances[arrayX + 1][arrayY] = distance;
    }

    if (
      arrayY > 0 &&
      directions[arrayX][arrayY - 1] === 0 &&
      (collision.getFlagWorld(currentX, currentY - 1) & KRONOS_SOUTH_MASK) === 0
    ) {
      queue[writeOffset] = { x: currentX, y: currentY - 1 };
      writeOffset = (writeOffset + 1) & routeQueueMask;
      directions[arrayX][arrayY - 1] = 1;
      distances[arrayX][arrayY - 1] = distance;
    }

    if (
      arrayY < routeGridSize - 1 &&
      directions[arrayX][arrayY + 1] === 0 &&
      (collision.getFlagWorld(currentX, currentY + 1) & KRONOS_NORTH_MASK) === 0
    ) {
      queue[writeOffset] = { x: currentX, y: currentY + 1 };
      writeOffset = (writeOffset + 1) & routeQueueMask;
      directions[arrayX][arrayY + 1] = 4;
      distances[arrayX][arrayY + 1] = distance;
    }

    if (
      arrayX > 0 &&
      arrayY > 0 &&
      directions[arrayX - 1][arrayY - 1] === 0 &&
      (collision.getFlagWorld(currentX - 1, currentY - 1) & KRONOS_SOUTH_WEST_MASK) === 0 &&
      (collision.getFlagWorld(currentX - 1, currentY) & KRONOS_WEST_MASK) === 0 &&
      (collision.getFlagWorld(currentX, currentY - 1) & KRONOS_SOUTH_MASK) === 0
    ) {
      queue[writeOffset] = { x: currentX - 1, y: currentY - 1 };
      writeOffset = (writeOffset + 1) & routeQueueMask;
      directions[arrayX - 1][arrayY - 1] = 3;
      distances[arrayX - 1][arrayY - 1] = distance;
    }

    if (
      arrayX < routeGridSize - 1 &&
      arrayY > 0 &&
      directions[arrayX + 1][arrayY - 1] === 0 &&
      (collision.getFlagWorld(currentX + 1, currentY - 1) & KRONOS_SOUTH_EAST_MASK) === 0 &&
      (collision.getFlagWorld(currentX + 1, currentY) & KRONOS_EAST_MASK) === 0 &&
      (collision.getFlagWorld(currentX, currentY - 1) & KRONOS_SOUTH_MASK) === 0
    ) {
      queue[writeOffset] = { x: currentX + 1, y: currentY - 1 };
      writeOffset = (writeOffset + 1) & routeQueueMask;
      directions[arrayX + 1][arrayY - 1] = 9;
      distances[arrayX + 1][arrayY - 1] = distance;
    }

    if (
      arrayX > 0 &&
      arrayY < routeGridSize - 1 &&
      directions[arrayX - 1][arrayY + 1] === 0 &&
      (collision.getFlagWorld(currentX - 1, currentY + 1) & KRONOS_NORTH_WEST_MASK) === 0 &&
      (collision.getFlagWorld(currentX - 1, currentY) & KRONOS_WEST_MASK) === 0 &&
      (collision.getFlagWorld(currentX, currentY + 1) & KRONOS_NORTH_MASK) === 0
    ) {
      queue[writeOffset] = { x: currentX - 1, y: currentY + 1 };
      writeOffset = (writeOffset + 1) & routeQueueMask;
      directions[arrayX - 1][arrayY + 1] = 6;
      distances[arrayX - 1][arrayY + 1] = distance;
    }

    if (
      arrayX < routeGridSize - 1 &&
      arrayY < routeGridSize - 1 &&
      directions[arrayX + 1][arrayY + 1] === 0 &&
      (collision.getFlagWorld(currentX + 1, currentY + 1) & KRONOS_NORTH_EAST_MASK) === 0 &&
      (collision.getFlagWorld(currentX + 1, currentY) & KRONOS_EAST_MASK) === 0 &&
      (collision.getFlagWorld(currentX, currentY + 1) & KRONOS_NORTH_MASK) === 0
    ) {
      queue[writeOffset] = { x: currentX + 1, y: currentY + 1 };
      writeOffset = (writeOffset + 1) & routeQueueMask;
      directions[arrayX + 1][arrayY + 1] = 12;
      distances[arrayX + 1][arrayY + 1] = distance;
    }
  }

  if (!reachable) {
    const fallback = findNearestRouteFallback(target, baseArrayOffsetX, baseArrayOffsetY, distances);
    if (!fallback) {
      return [];
    }
    foundX = fallback.x;
    foundY = fallback.y;
  }

  if (foundX === start.x && foundY === start.y) {
    return [];
  }

  const reversedPath: KronosWorldTile[] = [{ x: foundX, y: foundY, plane: start.plane }];
  let lastWrittenDirection = directions[foundX - baseArrayOffsetX][foundY - baseArrayOffsetY];
  let direction = lastWrittenDirection;
  while (foundX !== start.x || foundY !== start.y) {
    if (lastWrittenDirection !== direction) {
      lastWrittenDirection = direction;
      reversedPath.push({ x: foundX, y: foundY, plane: start.plane });
    }
    if (direction === 0) {
      break;
    }
    if ((direction & 2) !== 0) {
      foundX += 1;
    } else if ((direction & 8) !== 0) {
      foundX -= 1;
    }
    if ((direction & 1) !== 0) {
      foundY += 1;
    } else if ((direction & 4) !== 0) {
      foundY -= 1;
    }
    direction = directions[foundX - baseArrayOffsetX][foundY - baseArrayOffsetY];
  }

  return reversedPath.reverse();
}

function findNearestRouteFallback(
  target: KronosWorldRouteTarget,
  baseArrayOffsetX: number,
  baseArrayOffsetY: number,
  distances: readonly (readonly number[])[]
): KronosWorldTile | null {
  let lowestCost = Number.MAX_SAFE_INTEGER;
  let lowestDistance = Number.MAX_SAFE_INTEGER;
  let found: KronosWorldTile | null = null;
  const targetMaxX = target.x + Math.max(1, target.width) - 1;
  const targetMaxY = target.y + Math.max(1, target.height) - 1;
  for (let checkX = target.x - fallbackRange; checkX <= targetMaxX + fallbackRange; checkX += 1) {
    for (let checkY = target.y - fallbackRange; checkY <= targetMaxY + fallbackRange; checkY += 1) {
      const arrayX = checkX - baseArrayOffsetX;
      const arrayY = checkY - baseArrayOffsetY;
      if (
        arrayX < 0 ||
        arrayY < 0 ||
        arrayX >= routeGridSize ||
        arrayY >= routeGridSize ||
        distances[arrayX][arrayY] >= 100
      ) {
        continue;
      }

      const deltaX = checkX < target.x ? target.x - checkX : checkX > targetMaxX ? checkX - targetMaxX : 0;
      const deltaY = checkY < target.y ? target.y - checkY : checkY > targetMaxY ? checkY - targetMaxY : 0;
      const cost = deltaX * deltaX + deltaY * deltaY;
      const distance = distances[arrayX][arrayY];
      if (cost < lowestCost || (cost === lowestCost && distance < lowestDistance)) {
        lowestCost = cost;
        lowestDistance = distance;
        found = { x: checkX, y: checkY, plane: target.plane };
      }
    }
  }
  return found;
}

function exactWorldRouteTarget(destination: KronosWorldTile): KronosWorldRouteTarget {
  return {
    x: destination.x,
    y: destination.y,
    plane: destination.plane,
    width: 1,
    height: 1,
    isReached: (x, y) => x === destination.x && y === destination.y
  };
}

function objectWorldRouteTarget(placement: KronosArenaObjectPlacement): KronosWorldRouteTarget {
  const footprint = kronosObjectRouteFootprint(placement);
  const accessMask = rotatedObjectAccessBlockMask(placement.accessBlockMask ?? 0, placement.orientation);
  return {
    x: placement.x,
    y: placement.y,
    plane: placement.plane,
    width: footprint.sizeX,
    height: footprint.sizeY,
    isReached: (x, y, collision) =>
      kronosObjectRouteReachedWorld(x, y, placement, footprint.sizeX, footprint.sizeY, accessMask, collision)
  };
}

function entityTargetWorldRouteTarget(target: KronosWorldTile, distance: number): KronosWorldRouteTarget {
  const routeDistance = Math.max(1, Math.trunc(distance));
  return {
    x: target.x,
    y: target.y,
    plane: target.plane,
    width: 1,
    height: 1,
    isReached: (x, y, collision) => entityTargetRouteReachedWorld(x, y, target.x, target.y, target.plane, routeDistance, collision)
  };
}

function entityTargetRouteReachedWorld(
  x: number,
  y: number,
  targetX: number,
  targetY: number,
  plane: number,
  distance: number,
  collision: KronosSceneCollision
): boolean {
  if (x === targetX && y === targetY) {
    return false;
  }

  if (distance <= 1) {
    return entityTargetCanStepWorld(x, y, targetX, targetY, collision);
  }

  return (
    targetRouteInRangeWorld(x, y, targetX, targetY, distance) &&
    kronosWorldProjectileRouteClear(x, y, plane, 1, targetX, targetY, 1, collision)
  );
}

function kronosWorldProjectileLineClear(
  sourceX: number,
  sourceY: number,
  _plane: number,
  targetX: number,
  targetY: number,
  collision: KronosSceneCollision
): boolean {
  if (sourceX === targetX && sourceY === targetY) {
    return false;
  }

  const dx = Math.abs(targetX - sourceX);
  const dy = Math.abs(targetY - sourceY);
  const sx = sourceX < targetX ? 1 : -1;
  const sy = sourceY < targetY ? 1 : -1;
  let err = dx - dy;
  let oldX = sourceX;
  let oldY = sourceY;
  let currentX = sourceX;
  let currentY = sourceY;

  while (true) {
    const err2 = err << 1;
    if (err2 > -dy) {
      err -= dy;
      currentX += sx;
    }
    if (err2 < dx) {
      err += dx;
      currentY += sy;
    }
    if (!allowProjectileEntranceWorld(oldX, oldY, currentX - oldX, currentY - oldY, collision)) {
      return false;
    }
    if (currentX === targetX && currentY === targetY) {
      return true;
    }
    oldX = currentX;
    oldY = currentY;
  }
}

function allowProjectileEntranceWorld(
  x: number,
  y: number,
  deltaX: number,
  deltaY: number,
  collision: KronosSceneCollision
): boolean {
  if (deltaX === -1 && deltaY === 0) {
    return (collision.getProjectileFlagWorld(x - 1, y) & KRONOS_WEST_MASK) === 0;
  }
  if (deltaX === 1 && deltaY === 0) {
    return (collision.getProjectileFlagWorld(x + 1, y) & KRONOS_EAST_MASK) === 0;
  }
  if (deltaX === 0 && deltaY === -1) {
    return (collision.getProjectileFlagWorld(x, y - 1) & KRONOS_SOUTH_MASK) === 0;
  }
  if (deltaX === 0 && deltaY === 1) {
    return (collision.getProjectileFlagWorld(x, y + 1) & KRONOS_NORTH_MASK) === 0;
  }
  if (deltaX === -1 && deltaY === -1) {
    return (
      (collision.getProjectileFlagWorld(x - 1, y - 1) & KRONOS_SOUTH_WEST_MASK) === 0 &&
      (collision.getProjectileFlagWorld(x - 1, y) & KRONOS_WEST_MASK) === 0 &&
      (collision.getProjectileFlagWorld(x, y - 1) & KRONOS_SOUTH_MASK) === 0
    );
  }
  if (deltaX === 1 && deltaY === -1) {
    return (
      (collision.getProjectileFlagWorld(x + 1, y - 1) & KRONOS_SOUTH_EAST_MASK) === 0 &&
      (collision.getProjectileFlagWorld(x + 1, y) & KRONOS_EAST_MASK) === 0 &&
      (collision.getProjectileFlagWorld(x, y - 1) & KRONOS_SOUTH_MASK) === 0
    );
  }
  if (deltaX === -1 && deltaY === 1) {
    return (
      (collision.getProjectileFlagWorld(x - 1, y + 1) & KRONOS_NORTH_WEST_MASK) === 0 &&
      (collision.getProjectileFlagWorld(x - 1, y) & KRONOS_WEST_MASK) === 0 &&
      (collision.getProjectileFlagWorld(x, y + 1) & KRONOS_NORTH_MASK) === 0
    );
  }
  if (deltaX === 1 && deltaY === 1) {
    return (
      (collision.getProjectileFlagWorld(x + 1, y + 1) & KRONOS_NORTH_EAST_MASK) === 0 &&
      (collision.getProjectileFlagWorld(x + 1, y) & KRONOS_EAST_MASK) === 0 &&
      (collision.getProjectileFlagWorld(x, y + 1) & KRONOS_NORTH_MASK) === 0
    );
  }
  return false;
}

function entityTargetCanStepWorld(
  checkX: number,
  checkY: number,
  targetX: number,
  targetY: number,
  collision: KronosSceneCollision
): boolean {
  const checkSizeX = 1;
  const checkSizeY = 1;
  const targetSizeX = 1;
  const targetSizeY = 1;
  const checkEast = checkX + checkSizeX;
  const checkNorth = checkY + checkSizeY;
  const targetEast = targetX + targetSizeX;
  const targetNorth = targetY + targetSizeY;

  if (checkX === targetEast) {
    const overlapSouth = Math.max(checkY, targetY);
    const overlapNorth = Math.min(checkNorth, targetNorth);
    for (let worldY = overlapSouth; worldY < overlapNorth; worldY += 1) {
      if ((collision.getFlagWorld(targetEast - 1, worldY) & wallWestAccessMask) === 0) {
        return true;
      }
    }
  } else if (targetX === checkEast) {
    const overlapSouth = Math.max(checkY, targetY);
    const overlapNorth = Math.min(checkNorth, targetNorth);
    for (let worldY = overlapSouth; worldY < overlapNorth; worldY += 1) {
      if ((collision.getFlagWorld(targetX, worldY) & wallEastAccessMask) === 0) {
        return true;
      }
    }
  } else if (checkY === targetNorth) {
    const overlapWest = Math.max(checkX, targetX);
    const overlapEast = Math.min(checkEast, targetEast);
    for (let worldX = overlapWest; worldX < overlapEast; worldX += 1) {
      if ((collision.getFlagWorld(worldX, targetNorth - 1) & wallSouthAccessMask) === 0) {
        return true;
      }
    }
  } else if (checkNorth === targetY) {
    const overlapWest = Math.max(checkX, targetX);
    const overlapEast = Math.min(checkEast, targetEast);
    for (let worldX = overlapWest; worldX < overlapEast; worldX += 1) {
      if ((collision.getFlagWorld(worldX, targetY) & wallNorthAccessMask) === 0) {
        return true;
      }
    }
  }
  return false;
}

function targetRouteInRangeWorld(
  x: number,
  y: number,
  targetX: number,
  targetY: number,
  distance: number
): boolean {
  if (x < targetX && targetX - x > distance) {
    return false;
  }
  if (x > targetX && x - targetX > distance) {
    return false;
  }
  if (y < targetY && targetY - y > distance) {
    return false;
  }
  if (y > targetY && y - targetY > distance) {
    return false;
  }
  return true;
}

function kronosObjectRouteReachedWorld(
  x: number,
  y: number,
  placement: KronosArenaObjectPlacement,
  width: number,
  height: number,
  accessMask: number,
  collision: KronosSceneCollision
): boolean {
  const type = placement.type;
  const orientation = placement.orientation & 3;

  if (type === 10 || type === 11 || type === 22) {
    return kronosRectangleObjectRouteReached(x, y, placement.x, placement.y, width, height, accessMask, collision);
  }

  if (type === 0 || type === 2 || type === 9) {
    return kronosWallObjectRouteReached(x, y, placement.x, placement.y, type, orientation, collision);
  }

  return x === placement.x && y === placement.y;
}

function kronosRectangleObjectRouteReached(
  x: number,
  y: number,
  objectX: number,
  objectY: number,
  width: number,
  height: number,
  accessMask: number,
  collision: KronosSceneCollision
): boolean {
  const objectMaxX = objectX + width - 1;
  const objectMaxY = objectY + height - 1;
  if (x >= objectX && x <= objectMaxX && y >= objectY && y <= objectMaxY) {
    return true;
  }
  if (
    x === objectX - 1 &&
    y >= objectY &&
    y <= objectMaxY &&
    (collision.getFlagWorld(x, y) & wallWestAccessMask) === 0 &&
    (accessMask & objectAccessWestBlock) === 0
  ) {
    return true;
  }
  if (
    x === objectMaxX + 1 &&
    y >= objectY &&
    y <= objectMaxY &&
    (collision.getFlagWorld(x, y) & wallEastAccessMask) === 0 &&
    (accessMask & objectAccessEastBlock) === 0
  ) {
    return true;
  }
  if (
    y === objectY - 1 &&
    x >= objectX &&
    x <= objectMaxX &&
    (collision.getFlagWorld(x, y) & wallSouthAccessMask) === 0 &&
    (accessMask & objectAccessSouthBlock) === 0
  ) {
    return true;
  }
  return (
    y === objectMaxY + 1 &&
    x >= objectX &&
    x <= objectMaxX &&
    (collision.getFlagWorld(x, y) & wallNorthAccessMask) === 0 &&
    (accessMask & objectAccessNorthBlock) === 0
  );
}

function kronosWallObjectRouteReached(
  x: number,
  y: number,
  objectX: number,
  objectY: number,
  type: number,
  orientation: number,
  collision: KronosSceneCollision
): boolean {
  if (x === objectX && y === objectY) {
    return true;
  }

  if (type === 0) {
    if (orientation === 0) {
      return (
        (x === objectX - 1 && y === objectY) ||
        (x === objectX && y === objectY + 1 && (collision.getFlagWorld(x, y) & KRONOS_NORTH_MASK) === 0) ||
        (x === objectX && y === objectY - 1 && (collision.getFlagWorld(x, y) & KRONOS_SOUTH_MASK) === 0)
      );
    }
    if (orientation === 1) {
      return (
        (x === objectX && y === objectY + 1) ||
        (x === objectX - 1 && y === objectY && (collision.getFlagWorld(x, y) & KRONOS_WEST_MASK) === 0) ||
        (x === objectX + 1 && y === objectY && (collision.getFlagWorld(x, y) & KRONOS_EAST_MASK) === 0)
      );
    }
    if (orientation === 2) {
      return (
        (x === objectX + 1 && y === objectY) ||
        (x === objectX && y === objectY + 1 && (collision.getFlagWorld(x, y) & KRONOS_NORTH_MASK) === 0) ||
        (x === objectX && y === objectY - 1 && (collision.getFlagWorld(x, y) & KRONOS_SOUTH_MASK) === 0)
      );
    }
    return (
      (x === objectX && y === objectY - 1) ||
      (x === objectX - 1 && y === objectY && (collision.getFlagWorld(x, y) & KRONOS_WEST_MASK) === 0) ||
      (x === objectX + 1 && y === objectY && (collision.getFlagWorld(x, y) & KRONOS_EAST_MASK) === 0)
    );
  }

  if (type === 2) {
    if (orientation === 0) {
      return (
        (x === objectX - 1 && y === objectY) ||
        (x === objectX && y === objectY + 1) ||
        (x === objectX + 1 && y === objectY && (collision.getFlagWorld(x, y) & KRONOS_EAST_MASK) === 0) ||
        (x === objectX && y === objectY - 1 && (collision.getFlagWorld(x, y) & KRONOS_SOUTH_MASK) === 0)
      );
    }
    if (orientation === 1) {
      return (
        (x === objectX - 1 && y === objectY && (collision.getFlagWorld(x, y) & KRONOS_WEST_MASK) === 0) ||
        (x === objectX && y === objectY + 1) ||
        (x === objectX + 1 && y === objectY) ||
        (x === objectX && y === objectY - 1 && (collision.getFlagWorld(x, y) & KRONOS_SOUTH_MASK) === 0)
      );
    }
    if (orientation === 2) {
      return (
        (x === objectX - 1 && y === objectY && (collision.getFlagWorld(x, y) & KRONOS_WEST_MASK) === 0) ||
        (x === objectX && y === objectY + 1 && (collision.getFlagWorld(x, y) & KRONOS_NORTH_MASK) === 0) ||
        (x === objectX + 1 && y === objectY) ||
        (x === objectX && y === objectY - 1)
      );
    }
    return (
      (x === objectX - 1 && y === objectY) ||
      (x === objectX && y === objectY + 1 && (collision.getFlagWorld(x, y) & KRONOS_NORTH_MASK) === 0) ||
      (x === objectX + 1 && y === objectY && (collision.getFlagWorld(x, y) & KRONOS_EAST_MASK) === 0) ||
      (x === objectX && y === objectY - 1)
    );
  }

  return (
    (x === objectX && y === objectY + 1 && (collision.getFlagWorld(x, y) & wallNorthAccessMask) === 0) ||
    (x === objectX && y === objectY - 1 && (collision.getFlagWorld(x, y) & wallSouthAccessMask) === 0) ||
    (x === objectX - 1 && y === objectY && (collision.getFlagWorld(x, y) & wallWestAccessMask) === 0) ||
    (x === objectX + 1 && y === objectY && (collision.getFlagWorld(x, y) & wallEastAccessMask) === 0)
  );
}

function kronosObjectRouteFootprint(
  placement: KronosArenaObjectPlacement
): { readonly sizeX: number; readonly sizeY: number } {
  const orientation = placement.orientation & 3;
  if ((placement.type === 10 || placement.type === 11 || placement.type === 22) && (orientation === 1 || orientation === 3)) {
    return { sizeX: placement.sizeY, sizeY: placement.sizeX };
  }
  return { sizeX: placement.sizeX, sizeY: placement.sizeY };
}

function rotatedObjectAccessBlockMask(accessMask: number, orientation: number): number {
  const rotation = orientation & 3;
  if (rotation === 0) {
    return accessMask & 0xf;
  }
  return (((accessMask << rotation) & 0xf) + (accessMask >> (4 - rotation))) & 0xf;
}

function createRouteGrid(initialValue: number): number[][] {
  return Array.from({ length: routeGridSize }, () => new Array<number>(routeGridSize).fill(initialValue));
}

export function kronosFacingDegrees(fromTile: RuntimeTile, toTile: RuntimeTile): number {
  const deltaX = Math.sign(Math.round((toTile.x - fromTile.x) / KRONOS_TILE_WORLD_UNITS));
  const deltaZ = Math.sign(Math.round((toTile.z - fromTile.z) / KRONOS_TILE_WORLD_UNITS));
  if (deltaX === 0 && deltaZ === 0) {
    return 0;
  }

  return (Math.atan2(deltaX, deltaZ) * 180) / Math.PI;
}

export function kronosActorTargetFacingDegrees(fromTile: RuntimeTile, toTile: RuntimeTile): number {
  const deltaX = toTile.x - fromTile.x;
  const deltaZ = toTile.z - fromTile.z;
  if (deltaX === 0 && deltaZ === 0) {
    return 0;
  }

  return (Math.atan2(deltaX, deltaZ) * 180) / Math.PI;
}

export function interpolateKronosTile(fromTile: RuntimeTile, toTile: RuntimeTile, progress: number): RuntimeTile {
  const clamped = Math.max(0, Math.min(1, progress));
  return {
    x: fromTile.x + (toTile.x - fromTile.x) * clamped,
    z: fromTile.z + (toTile.z - fromTile.z) * clamped
  };
}
