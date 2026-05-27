import { Matrix4, Vector3, type PerspectiveCamera } from "three";
import type { NhViewport } from "./nhFixedLayout";
import {
  NH_CLIENT_TILE_UNITS,
  NH_CLIENT_TO_SCENE_UNITS,
  clientUnitsToRadians,
  nhClientCameraOffset,
  type NhCameraAngles,
  type NhCameraZoom
} from "./nhClientCamera";
import type { NhActorOverlayPlacement } from "./nhOverlayPlacement";

export interface NhViewportProjection {
  readonly x: number;
  readonly y: number;
  readonly depthClientUnits: number;
  readonly ndcZ: number;
}

interface NhVector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface NhOverlayClientCameraState {
  readonly target: NhVector3Like;
  readonly angles: Pick<NhCameraAngles, "yaw" | "pitch">;
  readonly zoom?: NhCameraZoom;
}

export const NH_TILE_CLIENT_UNITS = NH_CLIENT_TILE_UNITS;
export const NH_MIN_PROJECT_DEPTH_CLIENT_UNITS = 50;

const projectionScratch = new Vector3();
const cameraSpaceScratch = new Vector3();
const matrixScratch = new Matrix4();
const clientTrigAmplitude = 65536;

export function nhClientUnitsToWorldUnits(value: number): number {
  return value * NH_CLIENT_TO_SCENE_UNITS;
}

export function nhWorldUnitsToClientUnits(value: number): number {
  return value / NH_CLIENT_TO_SCENE_UNITS;
}

export function nhActorAnchorWorldPosition(
  actorPosition: NhVector3Like,
  anchorClientUnits: number
): Vector3 {
  return new Vector3(
    actorPosition.x,
    actorPosition.y + nhClientUnitsToWorldUnits(anchorClientUnits),
    actorPosition.z
  );
}

export function nhProjectWorldPointToViewport(
  camera: PerspectiveCamera,
  viewport: NhViewport,
  worldPosition: NhVector3Like
): NhViewportProjection | null {
  projectionScratch.set(worldPosition.x, worldPosition.y, worldPosition.z).project(camera);
  if (!Number.isFinite(projectionScratch.x) || !Number.isFinite(projectionScratch.y)) {
    return null;
  }

  matrixScratch.copy(camera.matrixWorldInverse);
  cameraSpaceScratch.set(worldPosition.x, worldPosition.y, worldPosition.z).applyMatrix4(matrixScratch);
  const depthClientUnits = nhWorldUnitsToClientUnits(-cameraSpaceScratch.z);
  if (depthClientUnits < NH_MIN_PROJECT_DEPTH_CLIENT_UNITS) {
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

export function nhOverlayViewportProjection(
  camera: PerspectiveCamera,
  viewport: NhViewport,
  actorPosition: NhVector3Like,
  placement: NhActorOverlayPlacement
): NhViewportProjection | null {
  const anchorPosition = nhActorAnchorWorldPosition(actorPosition, placement.anchorClientUnits);
  const projection = nhProjectWorldPointToViewport(camera, viewport, anchorPosition);
  if (!projection) {
    return null;
  }

  return {
    ...projection,
    x: projection.x + placement.centerOffsetXPixels,
    y: projection.y + placement.centerOffsetYPixelsDown
  };
}

export function nhProjectWorldPointToClientViewport(
  cameraState: NhOverlayClientCameraState,
  viewport: NhViewport,
  worldPosition: NhVector3Like
): NhViewportProjection | null {
  const cameraOffset = nhClientCameraOffset(cameraState.angles, viewport.rect.height, cameraState.zoom);
  const cameraX = nhSceneUnitsToClientInt(cameraState.target.x) - cameraOffset.x;
  const cameraY = nhSceneHeightToClientInt(cameraState.target.y) - cameraOffset.y;
  const cameraZ = nhSceneUnitsToClientInt(cameraState.target.z) - cameraOffset.z;

  let x = nhSceneUnitsToClientInt(worldPosition.x) - cameraX;
  let y = nhSceneUnitsToClientInt(worldPosition.z) - cameraZ;
  let z = nhSceneHeightToClientInt(worldPosition.y) - cameraY;

  const pitchSin = clientSine(cameraState.angles.pitch);
  const pitchCos = clientCosine(cameraState.angles.pitch);
  const yawSin = clientSine(cameraState.angles.yaw);
  const yawCos = clientCosine(cameraState.angles.yaw);

  const rotatedX = arithmeticShift16(yawCos * x + y * yawSin);
  y = arithmeticShift16(yawCos * y - yawSin * x);
  x = rotatedX;

  const projectedY = arithmeticShift16(pitchCos * z - y * pitchSin);
  const depth = arithmeticShift16(z * pitchSin + y * pitchCos);
  if (depth < NH_MIN_PROJECT_DEPTH_CLIENT_UNITS) {
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

export function nhOverlayClientViewportProjection(
  cameraState: NhOverlayClientCameraState,
  viewport: NhViewport,
  actorPosition: NhVector3Like,
  placement: NhActorOverlayPlacement
): NhViewportProjection | null {
  const anchorPosition = nhActorAnchorWorldPosition(actorPosition, placement.anchorClientUnits);
  const projection = nhProjectWorldPointToClientViewport(cameraState, viewport, anchorPosition);
  if (!projection) {
    return null;
  }

  return {
    ...projection,
    x: projection.x + placement.centerOffsetXPixels,
    y: projection.y + placement.centerOffsetYPixelsDown
  };
}

export function nhViewportProjectionToWorld(
  camera: PerspectiveCamera,
  viewport: NhViewport,
  projection: Pick<NhViewportProjection, "x" | "y" | "ndcZ">
): Vector3 {
  const width = Math.max(1, viewport.rect.width);
  const height = Math.max(1, viewport.rect.height);
  return new Vector3(
    (projection.x / width) * 2 - 1,
    -((projection.y / height) * 2 - 1),
    projection.ndcZ
  ).unproject(camera);
}

export function nhOverlayWorldPositionFromViewport(
  camera: PerspectiveCamera,
  viewport: NhViewport,
  actorPosition: NhVector3Like,
  placement: NhActorOverlayPlacement
): Vector3 | null {
  const projection = nhOverlayViewportProjection(camera, viewport, actorPosition, placement);
  return projection ? nhViewportProjectionToWorld(camera, viewport, projection) : null;
}

export function nhClientPixelScaleAtWorldPosition(
  camera: PerspectiveCamera,
  viewport: NhViewport,
  worldPosition: NhVector3Like
): number {
  matrixScratch.copy(camera.matrixWorldInverse);
  cameraSpaceScratch.set(worldPosition.x, worldPosition.y, worldPosition.z).applyMatrix4(matrixScratch);
  const depthWorldUnits = Math.max(0.01, -cameraSpaceScratch.z);
  const viewportHeight = Math.max(1, viewport.rect.height);
  return (2 * Math.tan((camera.fov * Math.PI) / 360) * depthWorldUnits) / viewportHeight;
}

function nhSceneUnitsToClientInt(value: number): number {
  return Math.trunc(value / NH_CLIENT_TO_SCENE_UNITS);
}

function nhSceneHeightToClientInt(value: number): number {
  // Source: PlayerAppearance.method4162 projects actor overlays as terrainHeight - logicalHeight.
  return -nhSceneUnitsToClientInt(value);
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
