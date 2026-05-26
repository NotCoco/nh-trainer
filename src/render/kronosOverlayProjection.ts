import { Matrix4, Vector3, type PerspectiveCamera } from "three";
import type { KronosViewport } from "./kronosFixedLayout";
import {
  KRONOS_CLIENT_TILE_UNITS,
  KRONOS_CLIENT_TO_SCENE_UNITS,
  clientUnitsToRadians,
  kronosClientCameraOffset,
  type KronosCameraAngles,
  type KronosCameraZoom
} from "./kronosClientCamera";
import type { KronosActorOverlayPlacement } from "./kronosOverlayPlacement";

export interface KronosViewportProjection {
  readonly x: number;
  readonly y: number;
  readonly depthClientUnits: number;
  readonly ndcZ: number;
}

interface KronosVector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface KronosOverlayClientCameraState {
  readonly target: KronosVector3Like;
  readonly angles: Pick<KronosCameraAngles, "yaw" | "pitch">;
  readonly zoom?: KronosCameraZoom;
}

export const KRONOS_TILE_CLIENT_UNITS = KRONOS_CLIENT_TILE_UNITS;
export const KRONOS_MIN_PROJECT_DEPTH_CLIENT_UNITS = 50;

const projectionScratch = new Vector3();
const cameraSpaceScratch = new Vector3();
const matrixScratch = new Matrix4();
const clientTrigAmplitude = 65536;

export function kronosClientUnitsToWorldUnits(value: number): number {
  return value * KRONOS_CLIENT_TO_SCENE_UNITS;
}

export function kronosWorldUnitsToClientUnits(value: number): number {
  return value / KRONOS_CLIENT_TO_SCENE_UNITS;
}

export function kronosActorAnchorWorldPosition(
  actorPosition: KronosVector3Like,
  anchorClientUnits: number
): Vector3 {
  return new Vector3(
    actorPosition.x,
    actorPosition.y + kronosClientUnitsToWorldUnits(anchorClientUnits),
    actorPosition.z
  );
}

export function kronosProjectWorldPointToViewport(
  camera: PerspectiveCamera,
  viewport: KronosViewport,
  worldPosition: KronosVector3Like
): KronosViewportProjection | null {
  projectionScratch.set(worldPosition.x, worldPosition.y, worldPosition.z).project(camera);
  if (!Number.isFinite(projectionScratch.x) || !Number.isFinite(projectionScratch.y)) {
    return null;
  }

  matrixScratch.copy(camera.matrixWorldInverse);
  cameraSpaceScratch.set(worldPosition.x, worldPosition.y, worldPosition.z).applyMatrix4(matrixScratch);
  const depthClientUnits = kronosWorldUnitsToClientUnits(-cameraSpaceScratch.z);
  if (depthClientUnits < KRONOS_MIN_PROJECT_DEPTH_CLIENT_UNITS) {
    return null;
  }

  const width = Math.max(1, viewport.rect.width);
  const height = Math.max(1, viewport.rect.height);
  return {
    x: Math.trunc(((projectionScratch.x + 1) * width) / 2),
    y: Math.trunc(((1 - projectionScratch.y) * height) / 2),
    depthClientUnits: Math.trunc(depthClientUnits),
    ndcZ: projectionScratch.z
  };
}

export function kronosOverlayViewportProjection(
  camera: PerspectiveCamera,
  viewport: KronosViewport,
  actorPosition: KronosVector3Like,
  placement: KronosActorOverlayPlacement
): KronosViewportProjection | null {
  const anchorPosition = kronosActorAnchorWorldPosition(actorPosition, placement.anchorClientUnits);
  const projection = kronosProjectWorldPointToViewport(camera, viewport, anchorPosition);
  if (!projection) {
    return null;
  }

  return {
    ...projection,
    x: projection.x + placement.centerOffsetXPixels,
    y: projection.y + placement.centerOffsetYPixelsDown
  };
}

export function kronosProjectWorldPointToClientViewport(
  cameraState: KronosOverlayClientCameraState,
  viewport: KronosViewport,
  worldPosition: KronosVector3Like
): KronosViewportProjection | null {
  const cameraOffset = kronosClientCameraOffset(cameraState.angles, viewport.rect.height, cameraState.zoom);
  const cameraX = kronosSceneUnitsToClientInt(cameraState.target.x) - cameraOffset.x;
  const cameraY = kronosSceneHeightToClientInt(cameraState.target.y) - cameraOffset.y;
  const cameraZ = kronosSceneUnitsToClientInt(cameraState.target.z) - cameraOffset.z;

  let x = kronosSceneUnitsToClientInt(worldPosition.x) - cameraX;
  let y = kronosSceneUnitsToClientInt(worldPosition.z) - cameraZ;
  let z = kronosSceneHeightToClientInt(worldPosition.y) - cameraY;

  const pitchSin = clientSine(cameraState.angles.pitch);
  const pitchCos = clientCosine(cameraState.angles.pitch);
  const yawSin = clientSine(cameraState.angles.yaw);
  const yawCos = clientCosine(cameraState.angles.yaw);

  const rotatedX = arithmeticShift16(yawCos * x + y * yawSin);
  y = arithmeticShift16(yawCos * y - yawSin * x);
  x = rotatedX;

  const projectedY = arithmeticShift16(pitchCos * z - y * pitchSin);
  const depth = arithmeticShift16(z * pitchSin + y * pitchCos);
  if (depth < KRONOS_MIN_PROJECT_DEPTH_CLIENT_UNITS) {
    return null;
  }

  const width = Math.max(1, Math.trunc(viewport.rect.width));
  const height = Math.max(1, Math.trunc(viewport.rect.height));
  const scale = Math.max(1, Math.trunc(viewport.zoom));
  return {
    x: Math.trunc(width / 2) + Math.trunc((x * scale) / depth),
    y: Math.trunc(height / 2) + Math.trunc((projectedY * scale) / depth),
    depthClientUnits: depth,
    ndcZ: depth
  };
}

export function kronosOverlayClientViewportProjection(
  cameraState: KronosOverlayClientCameraState,
  viewport: KronosViewport,
  actorPosition: KronosVector3Like,
  placement: KronosActorOverlayPlacement
): KronosViewportProjection | null {
  const anchorPosition = kronosActorAnchorWorldPosition(actorPosition, placement.anchorClientUnits);
  const projection = kronosProjectWorldPointToClientViewport(cameraState, viewport, anchorPosition);
  if (!projection) {
    return null;
  }

  return {
    ...projection,
    x: projection.x + placement.centerOffsetXPixels,
    y: projection.y + placement.centerOffsetYPixelsDown
  };
}

export function kronosViewportProjectionToWorld(
  camera: PerspectiveCamera,
  viewport: KronosViewport,
  projection: Pick<KronosViewportProjection, "x" | "y" | "ndcZ">
): Vector3 {
  const width = Math.max(1, viewport.rect.width);
  const height = Math.max(1, viewport.rect.height);
  return new Vector3(
    (projection.x / width) * 2 - 1,
    -((projection.y / height) * 2 - 1),
    projection.ndcZ
  ).unproject(camera);
}

export function kronosOverlayWorldPositionFromViewport(
  camera: PerspectiveCamera,
  viewport: KronosViewport,
  actorPosition: KronosVector3Like,
  placement: KronosActorOverlayPlacement
): Vector3 | null {
  const projection = kronosOverlayViewportProjection(camera, viewport, actorPosition, placement);
  return projection ? kronosViewportProjectionToWorld(camera, viewport, projection) : null;
}

export function kronosClientPixelScaleAtWorldPosition(
  camera: PerspectiveCamera,
  viewport: KronosViewport,
  worldPosition: KronosVector3Like
): number {
  matrixScratch.copy(camera.matrixWorldInverse);
  cameraSpaceScratch.set(worldPosition.x, worldPosition.y, worldPosition.z).applyMatrix4(matrixScratch);
  const depthWorldUnits = Math.max(0.01, -cameraSpaceScratch.z);
  const viewportHeight = Math.max(1, viewport.rect.height);
  return (2 * Math.tan((camera.fov * Math.PI) / 360) * depthWorldUnits) / viewportHeight;
}

function kronosSceneUnitsToClientInt(value: number): number {
  return Math.trunc(value / KRONOS_CLIENT_TO_SCENE_UNITS);
}

function kronosSceneHeightToClientInt(value: number): number {
  // Source: PlayerAppearance.method4162 projects actor overlays as terrainHeight - logicalHeight.
  return -kronosSceneUnitsToClientInt(value);
}

function clientSine(units: number): number {
  // Source: Perspective.SINE/Rasterizer3D_sine cast the scaled trig value to int.
  return Math.trunc(Math.sin(clientUnitsToRadians(units)) * clientTrigAmplitude);
}

function clientCosine(units: number): number {
  // Source: Perspective.COSINE/Rasterizer3D_cosine cast the scaled trig value to int.
  return Math.trunc(Math.cos(clientUnitsToRadians(units)) * clientTrigAmplitude);
}

function arithmeticShift16(value: number): number {
  return Math.floor(value / clientTrigAmplitude);
}
