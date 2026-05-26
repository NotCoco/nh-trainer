import type { PerspectiveCamera } from "three";
import type { KronosViewport } from "./kronosFixedLayout";
import {
  kronosArenaTileSceneCorners,
  kronosArenaWorldTileCenterToScene,
  type KronosArenaMetadata,
  type KronosSceneOffset
} from "./kronosSceneCollision";
import {
  kronosProjectWorldPointToViewport
} from "./kronosOverlayProjection";
import type { RuntimeTile } from "./runtimeScene";

interface KronosViewportPoint {
  readonly x: number;
  readonly y: number;
}

interface KronosSceneTilePickInput {
  readonly camera: PerspectiveCamera;
  readonly viewport: KronosViewport;
  readonly arena: KronosArenaMetadata;
  readonly sceneOffset: KronosSceneOffset;
  readonly point: KronosViewportPoint;
}

export function kronosPickSceneTileFromViewportPoint(input: KronosSceneTilePickInput): RuntimeTile | null {
  const click = {
    x: Math.trunc(input.point.x),
    y: Math.trunc(input.point.y)
  };
  let bestTile: RuntimeTile | null = null;
  let bestDepth = Number.POSITIVE_INFINITY;

  for (const tile of input.arena.tiles) {
    if (tile.plane !== input.arena.bounds.plane) {
      continue;
    }

    const corners = kronosArenaTileSceneCorners(input.arena, input.sceneOffset, tile);
    const southWest = kronosProjectWorldPointToViewport(input.camera, input.viewport, corners.southWest);
    const southEast = kronosProjectWorldPointToViewport(input.camera, input.viewport, corners.southEast);
    const northEast = kronosProjectWorldPointToViewport(input.camera, input.viewport, corners.northEast);
    const northWest = kronosProjectWorldPointToViewport(input.camera, input.viewport, corners.northWest);
    if (!southWest || !southEast || !northEast || !northWest) {
      continue;
    }

    const northTriangle = kronosContainsSourceTriangle(click, northEast, northWest, southEast);
    const southTriangle = kronosContainsSourceTriangle(click, southWest, southEast, northWest);
    if (!northTriangle && !southTriangle) {
      continue;
    }

    const depth = Math.min(
      southWest.depthClientUnits,
      southEast.depthClientUnits,
      northEast.depthClientUnits,
      northWest.depthClientUnits
    );
    if (depth < bestDepth) {
      bestDepth = depth;
      bestTile = kronosArenaWorldTileCenterToScene(input.arena, input.sceneOffset, tile.x, tile.y);
    }
  }

  return bestTile;
}

export function kronosContainsSourceTriangle(
  point: KronosViewportPoint,
  a: KronosViewportPoint,
  b: KronosViewportPoint,
  c: KronosViewportPoint
): boolean {
  return kronosContainsBounds(point.x, point.y, a.y, b.y, c.y, a.x, b.x, c.x);
}

function kronosContainsBounds(
  pointX: number,
  pointY: number,
  y0: number,
  y1: number,
  y2: number,
  x0: number,
  x1: number,
  x2: number
): boolean {
  if (pointY < y0 && pointY < y1 && pointY < y2) {
    return false;
  }
  if (pointY > y0 && pointY > y1 && pointY > y2) {
    return false;
  }
  if (pointX < x0 && pointX < x1 && pointX < x2) {
    return false;
  }
  if (pointX > x0 && pointX > x1 && pointX > x2) {
    return false;
  }

  const edge0 = (pointY - y0) * (x1 - x0) - (pointX - x0) * (y1 - y0);
  const edge1 = (x2 - x1) * (pointY - y1) - (pointX - x1) * (y2 - y1);
  const edge2 = (x0 - x2) * (pointY - y2) - (y0 - y2) * (pointX - x2);
  return edge0 === 0
    ? edge1 !== 0
      ? edge1 < 0
        ? edge2 <= 0
        : edge2 >= 0
      : true
    : edge0 < 0
      ? edge1 <= 0 && edge2 <= 0
      : edge1 >= 0 && edge2 >= 0;
}
