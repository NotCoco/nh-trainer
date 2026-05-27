import type { RuntimeProjectileLifecycle, RuntimeRenderEvent } from "./runtimeScene";
import { nhClientUnitsToWorldUnits } from "./nhOverlayProjection";

export interface NhProjectileDefinition {
  readonly id: string;
  readonly label?: string;
  readonly artifactUrl?: string;
  readonly impactArtifactUrl?: string;
  readonly projectileGfxId: number;
  readonly impactGfxId: number;
  readonly startHeight: number;
  readonly endHeight: number;
  readonly delayCycles: number;
  readonly durationStartCycles?: number;
  readonly durationIncrementCycles?: number;
  readonly durationCycles: number;
  readonly curve: number;
  readonly offset: number;
  readonly skipTravel: boolean;
}

export interface NhProjectileDefinitionStore {
  readonly projectiles: readonly NhProjectileDefinition[];
}

export type NhProjectileDefinitionMap = ReadonlyMap<string, NhProjectileDefinition>;

export interface NhProjectileMotionSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
}

const SERVER_PROJECTILE_HEIGHT_SCALE = 4;
const CLIENT_PROJECTILE_SLOPE_RADIANS = 0.02454369;
const CLIENT_ANGLE_UNITS_PER_RADIAN = 325.949;

export function nhProjectileDefinitionForGfx(
  definitions: NhProjectileDefinitionMap | undefined,
  projectileGfxId: number
): NhProjectileDefinition | null {
  if (!definitions) {
    return null;
  }
  for (const definition of definitions.values()) {
    if (definition.projectileGfxId === projectileGfxId) {
      return definition;
    }
  }
  return null;
}

export function nhProjectileDuration(
  event: RuntimeRenderEvent,
  definition: NhProjectileDefinition
): number {
  if (!event.fromTile || !event.toTile) {
    return Math.max(1, definition.durationCycles);
  }

  const distance = Math.max(
    Math.abs(event.toTile.x - event.fromTile.x),
    Math.abs(event.toTile.z - event.fromTile.z)
  );
  const start = definition.durationStartCycles ?? definition.durationCycles;
  const increment = definition.durationIncrementCycles ?? 0;
  return Math.max(1, start + increment * Math.max(0, distance - 1));
}

export function nhProjectileLifecycleFromDefinition(
  event: RuntimeRenderEvent,
  definition: NhProjectileDefinition
): RuntimeProjectileLifecycle | null {
  if (!event.fromTile || !event.toTile) {
    return null;
  }

  const duration = nhProjectileDuration(event, definition);
  const sourceTile = definition.skipTravel ? event.toTile : event.fromTile;
  return {
    gfxId: definition.projectileGfxId,
    plane: 0,
    targetIndex: 0,
    sourceTile,
    destinationTile: event.toTile,
    sourceHeight: definition.startHeight,
    destinationHeight: definition.endHeight,
    delayCycles: definition.delayCycles,
    durationCycles: duration,
    cycleStart: event.startCycle + definition.delayCycles,
    cycleEnd: event.startCycle + duration,
    slope: definition.curve,
    startDistanceOffset: definition.offset,
    packetCycle: event.startCycle,
    skipTravel: definition.skipTravel
  };
}

export function sampleNhProjectileMotion(
  event: RuntimeRenderEvent,
  cycle: number,
  definition: NhProjectileDefinition
): NhProjectileMotionSample | null {
  const lifecycle = event.projectile ?? nhProjectileLifecycleFromDefinition(event, definition);
  if (!lifecycle) {
    return null;
  }

  return sampleNhProjectileLifecycle(
    lifecycle,
    nhRenderCycleToProjectileClientCycle(event, cycle, lifecycle)
  );
}

export function sampleNhProjectileLifecycle(
  lifecycle: RuntimeProjectileLifecycle,
  clientCycle: number
): NhProjectileMotionSample {
  const sourceX = lifecycle.sourceTile.x;
  const sourceY = lifecycle.sourceTile.z;
  const sourceZ = projectileHeightToWorldHeight(lifecycle.sourceHeight);
  const targetZ = projectileHeightToWorldHeight(lifecycle.destinationHeight);
  const sourceOffset = nhClientUnitsToWorldUnits(lifecycle.startDistanceOffset);
  const deltaX = lifecycle.destinationTile.x - sourceX;
  const deltaY = lifecycle.destinationTile.z - sourceY;
  const horizontalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  let x = sourceX;
  let y = sourceY;

  if (horizontalDistance > 0) {
    x += (sourceOffset * deltaX) / horizontalDistance;
    y += (sourceOffset * deltaY) / horizontalDistance;
  }

  let z = sourceZ;
  const remainingAtDestinationSet = Math.max(1, lifecycle.cycleEnd + 1 - lifecycle.cycleStart);
  const elapsed = Math.min(
    remainingAtDestinationSet,
    Math.max(0, clientCycle - lifecycle.cycleStart)
  );
  const speedX = (lifecycle.destinationTile.x - x) / remainingAtDestinationSet;
  const speedY = (lifecycle.destinationTile.z - y) / remainingAtDestinationSet;
  const speed = Math.sqrt(speedX * speedX + speedY * speedY);
  let speedZ = -speed * Math.tan(CLIENT_PROJECTILE_SLOPE_RADIANS * lifecycle.slope);
  const accelerationZ =
    (2 * (targetZ - z - remainingAtDestinationSet * speedZ)) /
    (remainingAtDestinationSet * remainingAtDestinationSet);

  x += speedX * elapsed;
  y += speedY * elapsed;
  z += elapsed * elapsed * 0.5 * accelerationZ + elapsed * speedZ;
  speedZ += accelerationZ * elapsed;

  return {
    x,
    y,
    z,
    yaw: ((Math.atan2(speedX, speedY) * CLIENT_ANGLE_UNITS_PER_RADIAN + 1024) | 0) & 2047,
    pitch: ((Math.atan2(speedZ, speed) * CLIENT_ANGLE_UNITS_PER_RADIAN) | 0) & 2047
  };
}

export function nhRenderCycleToProjectileClientCycle(
  event: RuntimeRenderEvent,
  cycle: number,
  lifecycle: RuntimeProjectileLifecycle
): number {
  const duration = Math.max(1, event.endCycle - event.startCycle);
  const progress = Math.min(1, Math.max(0, (cycle - event.startCycle) / duration));
  return lifecycle.cycleStart + progress * Math.max(0, lifecycle.cycleEnd - lifecycle.cycleStart);
}

function projectileHeightToWorldHeight(height: number): number {
  return nhClientUnitsToWorldUnits(height * SERVER_PROJECTILE_HEIGHT_SCALE);
}
