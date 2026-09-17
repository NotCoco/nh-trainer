// Extracted from the production runtime; shared helpers keep their existing behavior.
import {
  type RuntimeTile,
  type RuntimeLoadoutId,
  type RuntimePlayerAppearance,
  type RuntimeSequenceName,
  type RuntimeSceneSnapshot,
  type RuntimeActorId
} from "../render/runtimeScene";
import {
  NH_GAME_TICK_MS,
  findNhObjectRouteWaypoints,
  findNhTileRouteWaypoints,
  nhSceneObjectRouteReached,
  findNhTargetRouteWaypoints,
  nhSceneTargetRouteReached,
  NH_TILE_WORLD_UNITS,
  nhSceneProjectileRouteClear
} from "../render/nhTileMovement";
import {
  type NhSceneCollision,
  type NhArenaObjectPlacement
} from "../render/nhSceneCollision";
import {
  type RuntimePlayerCombatActorState,
  isRuntimePlayerCombatActorDead,
  runtimePlayerCombatTargetRouteProfile,
  type RuntimePlayerCombatState
} from "../sim";
import {
  movementGate,
  canAttackThroughLock
} from "../sim/entity/locks";
import {
  nhNhBotCombatTileAllowed
} from "../render/nhWilderness";
import {
  type NhInventoryEquipmentDefinitionStore
} from "../render/nhInventory";
import {
  type VisibleEquipment
} from "../sim/clientView";
import {
  nhLoadouts
} from "../sim/nh/loadouts";
import {
  type NhWeaponTypeDefinitionStore
} from "../render/nhCombat";
import {
  type NhActorSequenceDefinitionStore,
  nhRuntimeSequenceNameForId,
  createNhActorSequenceDefinitionStore
} from "../render/nhActorSequence";
import {
  type NhAnimationFixtures,
  type NhSequenceFrameCursorOverride,
  nhSequencePrecedenceAnimating,
  type NhRenderSequenceDefinition,
  nhSequencePriority
} from "../render/nhSequencePlayback";


export interface RuntimeClientPosition {
  readonly x: number;
  readonly z: number;
}


export interface ManualActorState {
  /** Snapped scene tile that represents the server-side actor position. */
  readonly tile: RuntimeTile;
  /** Visual-only tile used while the model interpolates between server ticks. */
  readonly renderTile: RuntimeTile;
  readonly routeWaypoints: readonly RuntimeTile[];
  readonly routeTraversalModes: readonly number[];
  readonly serverRouteWaypoints: readonly RuntimeTile[];
  readonly serverRouteTraversalModes: readonly number[];
  /** Server route is already represented in the held client path buffer. */
  readonly serverRouteVisualQueued: boolean;
  readonly clientPosition: RuntimeClientPosition | null;
  /** Source server-side/true location used by minimap while a primary sequence holds the visible model. */
  readonly logicalClientPosition: RuntimeClientPosition | null;
  readonly logicalRouteWaypoints: readonly RuntimeTile[];
  readonly logicalRouteTraversalModes: readonly number[];
  readonly lastMovementClientCycle: number | null;
  readonly clientTargetIndexUntilClientCycle: number;
  readonly movementStallTicks: number;
  readonly sequencePathLengthAtStart: number;
  readonly activeSequenceKey: string | null;
  readonly completedSequenceKey: string | null;
  readonly primaryFrame: number;
  readonly primaryFrameCycle: number;
  readonly primarySequenceLoops: number;
  readonly primarySequenceCycle: number;
  readonly primarySequenceDelayCycles: number;
  readonly movementBlockedBySequence: boolean;
  readonly movementFrame: number;
  readonly movementFrameCycle: number;
  readonly orientationUnits: number;
  readonly rotationUnits: number;
  readonly turnTicks: number;
  readonly running: boolean;
  readonly loadoutId: RuntimeLoadoutId;
  readonly appearance?: RuntimePlayerAppearance;
  readonly sequenceName: RuntimeSequenceName;
  readonly facingDegrees: number;
  readonly markerLabel: string;
  readonly animationCycle: number;
}


export interface ManualActorRouteResult {
  readonly actor: ManualActorState;
  readonly reached: boolean;
}

export const NH_CLIENT_CYCLE_MS = 20;

export const NH_CLIENT_CYCLES_PER_GAME_TICK = NH_GAME_TICK_MS / NH_CLIENT_CYCLE_MS;

// The JS trainer can enqueue several accepted server steps before the next draw
// after a busy frame. Keep those steps instead of dropping the unreached head,
// because client class329 only snaps when an impossible next path tile is fed in.
export const NH_CLIENT_ROUTE_BUFFER_LIMIT = 9;

export const NH_ACTOR_TILE_CLIENT_UNITS = 128;

export const NH_ACTOR_ORIENTATION_UNITS = 2048;

export const NH_ACTOR_TURN_SPEED_UNITS = 32;

export const NH_ACTOR_TURN_ANIMATION_DELAY_TICKS = 25;


export function manualActorFromSnapshot(
  snapshot: RuntimeSceneSnapshot,
  actorId: RuntimeActorId = "local-player",
  markerLabel = actorId === "local-player" ? "local control" : "opponent"
): ManualActorState {
  const localPose = snapshot.actors.find((pose) => pose.actorId === actorId) ?? snapshot.actors[0];
  const orientationUnits = localPose.orientationUnits ?? nhFacingDegreesToOrientationUnits(localPose.facingDegrees);
  const rotationUnits = localPose.rotationUnits ?? orientationUnits;
  return {
    tile: localPose.tile,
    renderTile: localPose.renderTile ?? localPose.tile,
    routeWaypoints: [],
    routeTraversalModes: [],
    serverRouteWaypoints: [],
    serverRouteTraversalModes: [],
    serverRouteVisualQueued: false,
    clientPosition: null,
    logicalClientPosition: null,
    logicalRouteWaypoints: [],
    logicalRouteTraversalModes: [],
    lastMovementClientCycle: null,
    clientTargetIndexUntilClientCycle: 0,
    movementStallTicks: 0,
    sequencePathLengthAtStart: 0,
    activeSequenceKey: null,
    completedSequenceKey: null,
    primaryFrame: 0,
    primaryFrameCycle: 0,
    primarySequenceLoops: 0,
    primarySequenceCycle: 0,
    primarySequenceDelayCycles: 0,
    movementBlockedBySequence: false,
    movementFrame: 0,
    movementFrameCycle: 0,
    orientationUnits,
    rotationUnits,
    turnTicks: 0,
    running: snapshot.hud.running ?? true,
    loadoutId: localPose.loadoutId,
    appearance: localPose.appearance,
    sequenceName: "idle",
    facingDegrees: localPose.facingDegrees,
    markerLabel,
    animationCycle: 0
  };
}


export function snapManualActorToCollision(actor: ManualActorState, collision: NhSceneCollision): ManualActorState {
  const tile = collision.snapTile(actor.tile);
  return {
    ...actor,
    tile,
    renderTile: tile,
    clientPosition: nhClientPositionFromRuntimeTile(tile),
    logicalClientPosition: nhClientPositionFromRuntimeTile(tile),
    logicalRouteWaypoints: [],
    logicalRouteTraversalModes: [],
    routeWaypoints: [],
    routeTraversalModes: [],
    serverRouteWaypoints: [],
    serverRouteTraversalModes: [],
    serverRouteVisualQueued: false,
    clientTargetIndexUntilClientCycle: 0,
    movementBlockedBySequence: false
  };
}


export function teleportManualActorToTile(actor: ManualActorState, tile: RuntimeTile): ManualActorState {
  return {
    ...actor,
    tile,
    renderTile: tile,
    clientPosition: nhClientPositionFromRuntimeTile(tile),
    logicalClientPosition: nhClientPositionFromRuntimeTile(tile),
    logicalRouteWaypoints: [],
    logicalRouteTraversalModes: [],
    routeWaypoints: [],
    routeTraversalModes: [],
    serverRouteWaypoints: [],
    serverRouteTraversalModes: [],
    serverRouteVisualQueued: false,
    clientTargetIndexUntilClientCycle: 0,
    movementBlockedBySequence: false,
    movementStallTicks: 0,
    sequenceName: "idle"
  };
}


export function manualActorHeldClientRouteStartTile(
  actor: ManualActorState,
  fallbackStartTile: RuntimeTile,
  collision: NhSceneCollision
): RuntimeTile {
  const tailTile = actor.routeWaypoints.length > 0
    ? actor.routeWaypoints[actor.routeWaypoints.length - 1]
    : null;
  return collision.snapTile(tailTile ?? fallbackStartTile);
}


export function manualActorHeldLogicalRouteStartTile(
  actor: ManualActorState,
  fallbackStartTile: RuntimeTile,
  collision: NhSceneCollision
): RuntimeTile {
  const tailTile = actor.logicalRouteWaypoints.length > 0
    ? actor.logicalRouteWaypoints[actor.logicalRouteWaypoints.length - 1]
    : null;
  return collision.snapTile(tailTile ?? fallbackStartTile);
}


export function routeManualActor(
  actor: ManualActorState,
  destinationTile: RuntimeTile,
  collision: NhSceneCollision,
  objectPlacement: NhArenaObjectPlacement | undefined,
  now: number,
  preserveClientPath = false,
  deferClientPathUntilServerTick = false
): ManualActorRouteResult {
  const startTile = collision.snapTile(actor.tile);
  const destination = collision.snapTile(destinationTile);
  const routeSegment = objectPlacement
    ? findNhObjectRouteWaypoints(startTile, objectPlacement, collision)
    : findNhTileRouteWaypoints(startTile, destination, collision);
  const routePath = expandNhManualRoutePath(startTile, routeSegment, collision);
  const serverRoute = setNhManualServerRoutePath(routePath);
  const deferredPreservedServerRoute =
    preserveClientPath && deferClientPathUntilServerTick
      ? (() => {
          const heldStartTile = manualActorHeldLogicalRouteStartTile(actor, startTile, collision);
          const heldRouteSegment = objectPlacement
            ? findNhObjectRouteWaypoints(heldStartTile, objectPlacement, collision)
            : findNhTileRouteWaypoints(heldStartTile, destination, collision);
          const heldRoutePath = expandNhManualRoutePath(heldStartTile, heldRouteSegment, collision);
          return setNhManualServerRoutePath(heldRoutePath);
        })()
      : null;
  const heldClientRoute =
    preserveClientPath && !deferClientPathUntilServerTick
      ? (() => {
          const heldStartTile = manualActorHeldClientRouteStartTile(actor, startTile, collision);
          const heldRouteSegment = objectPlacement
            ? findNhObjectRouteWaypoints(heldStartTile, objectPlacement, collision)
            : findNhTileRouteWaypoints(heldStartTile, destination, collision);
          const heldRoutePath = expandNhManualRoutePath(heldStartTile, heldRouteSegment, collision);
          return enqueueManualActorClientPathSteps(actor, heldRoutePath, actor.running ? 2 : 1);
        })()
      : null;
  const heldLogicalRoute =
    preserveClientPath && !deferClientPathUntilServerTick
      ? (() => {
          const heldStartTile = manualActorHeldLogicalRouteStartTile(actor, startTile, collision);
          const heldRouteSegment = objectPlacement
            ? findNhObjectRouteWaypoints(heldStartTile, objectPlacement, collision)
            : findNhTileRouteWaypoints(heldStartTile, destination, collision);
          const heldRoutePath = expandNhManualRoutePath(heldStartTile, heldRouteSegment, collision);
          return enqueueManualActorLogicalClientPathSteps(actor, heldRoutePath, actor.running ? 2 : 1);
        })()
      : null;
  const reached = objectPlacement
    ? nhSceneObjectRouteReached(startTile, objectPlacement, collision)
    : sameNhTile(startTile, destination);
  const clientPosition = manualActorRouteClientPosition(actor, startTile);
  const lastMovementClientCycle = deferClientPathUntilServerTick && !preserveClientPath
    ? actor.lastMovementClientCycle
    : preserveClientPath
      ? actor.lastMovementClientCycle ?? Math.floor(now / NH_CLIENT_CYCLE_MS)
      : Math.floor(now / NH_CLIENT_CYCLE_MS);
  const settlementWaypoints = nhClientSettlementWaypoints(clientPosition, startTile);
  // Source: Player.method1100() adds new path steps without class329 consuming
  // the held path while sequence priority/precedence stalls movement.
  const routeWaypoints = heldClientRoute?.routeWaypoints ?? (
    deferClientPathUntilServerTick ? actor.routeWaypoints : settlementWaypoints
  );
  const routeTraversalModes = heldClientRoute?.routeTraversalModes ?? (
    deferClientPathUntilServerTick
      ? actor.routeTraversalModes
      : settlementWaypoints.map(() => actor.running ? 2 : 1)
  );
  const logicalClientPosition = manualActorRouteLogicalClientPosition(actor, startTile);
  const logicalSettlementWaypoints = nhClientSettlementWaypoints(logicalClientPosition, startTile);
  const logicalSettlementTraversalModes = logicalSettlementWaypoints.map(() => actor.running ? 2 : 1);
  const logicalRouteWaypoints = heldLogicalRoute?.logicalRouteWaypoints ?? (
    deferClientPathUntilServerTick ? actor.logicalRouteWaypoints : logicalSettlementWaypoints
  );
  const logicalRouteTraversalModes = heldLogicalRoute?.logicalRouteTraversalModes ?? (
    deferClientPathUntilServerTick ? actor.logicalRouteTraversalModes : logicalSettlementTraversalModes
  );
  // Source: Player.method1100() preserves the local client's path queue even
  // when a held action sequence keeps the visible model on its old x/y. The
  // trainer has a split client/server loop, so same-tile return clicks must
  // carry the preserved path into the next local server tick instead of
  // collapsing to an empty route from the stale authoritative tile.
  const preservedServerRoute = preserveClientPath && heldLogicalRoute
    ? setNhManualServerRouteFromPreservedClientPath(
        actor,
        heldLogicalRoute.logicalRouteWaypoints
      )
    : null;
  const nextServerRoute =
    deferredPreservedServerRoute && deferredPreservedServerRoute.serverRouteWaypoints.length > 0
      ? deferredPreservedServerRoute
      : preservedServerRoute && preservedServerRoute.serverRouteWaypoints.length > 0
      ? preservedServerRoute
      : serverRoute;
  if (nextServerRoute.serverRouteWaypoints.length === 0) {
    return {
      actor: {
        ...actor,
        tile: startTile,
        renderTile: actor.renderTile,
        clientPosition,
        logicalClientPosition,
        logicalRouteWaypoints,
        logicalRouteTraversalModes,
        lastMovementClientCycle,
        routeWaypoints,
        routeTraversalModes,
        serverRouteWaypoints: [],
        serverRouteTraversalModes: [],
        serverRouteVisualQueued: false,
        movementStallTicks: actor.movementStallTicks,
        sequenceName: routeWaypoints.length > 0 || deferClientPathUntilServerTick ? actor.sequenceName : "idle"
      },
      reached
    };
  }

  return {
    actor: {
      ...actor,
      tile: startTile,
      renderTile: actor.renderTile,
      clientPosition,
      logicalClientPosition,
      logicalRouteWaypoints,
      logicalRouteTraversalModes,
      lastMovementClientCycle,
      routeWaypoints,
      routeTraversalModes,
      serverRouteWaypoints: nextServerRoute.serverRouteWaypoints,
      serverRouteTraversalModes: nextServerRoute.serverRouteTraversalModes,
      serverRouteVisualQueued: preserveClientPath && !deferClientPathUntilServerTick,
      movementStallTicks: actor.movementStallTicks,
      sequenceName: actor.sequenceName
    },
    reached: true
  };
}


export function routeManualActorToTarget(
  actor: ManualActorState,
  targetTile: RuntimeTile,
  attackRange: number,
  collision: NhSceneCollision,
  now: number,
  preserveVisualSettlement = true,
  preserveClientPath = false
): ManualActorRouteResult {
  const startTile = collision.snapTile(actor.tile);
  const routeSegment = findNhTargetRouteWaypoints(startTile, targetTile, attackRange, collision);
  const routePath = expandNhManualRoutePath(startTile, routeSegment, collision);
  const serverRoute = setNhManualServerRoutePath(routePath);
  // Source: TargetRoute.beforeMovement() rewrites the server Movement path; the
  // client still only receives accepted movement updates through Player.method1111().
  // While an action sequence is holding class329, keep the already-held client
  // buffer instead of preloading the whole recomputed route into the visual path.
  const heldClientRoute =
    preserveClientPath
      ? {
          routeWaypoints: actor.routeWaypoints,
          routeTraversalModes: actor.routeTraversalModes
        }
      : null;
  const heldLogicalRoute =
    preserveClientPath
      ? {
          logicalRouteWaypoints: actor.logicalRouteWaypoints,
          logicalRouteTraversalModes: actor.logicalRouteTraversalModes
        }
      : null;
  const reached = nhSceneTargetRouteReached(startTile, targetTile, attackRange, collision);
  const clientPosition = manualActorRouteClientPosition(actor, startTile);
  const lastMovementClientCycle = preserveClientPath
    ? actor.lastMovementClientCycle
    : Math.floor(now / NH_CLIENT_CYCLE_MS);
  const settlementWaypoints = nhClientSettlementWaypoints(clientPosition, startTile);
  // Source: RouteFinder.route() rewrites Movement.readOffset/writeOffset from
  // the actor's current server tile on each TargetRoute.beforeMovement() pass.
  // TargetRoute-driven melee/range/mage routes consume their first server step
  // before PlayerCombat.attack(); when that caller immediately advances the
  // server route, do not visually settle back to the previous tile first.
  const routeWaypoints = heldClientRoute?.routeWaypoints ?? (
    preserveVisualSettlement
      ? settlementWaypoints
      : []
  );
  const routeTraversalModes = heldClientRoute?.routeTraversalModes ??
    routeWaypoints.map(() => actor.running ? 2 : 1);
  const logicalClientPosition = manualActorRouteLogicalClientPosition(actor, startTile);
  const logicalSettlementWaypoints = nhClientSettlementWaypoints(logicalClientPosition, startTile);
  const logicalSettlementTraversalModes = logicalSettlementWaypoints.map(() => actor.running ? 2 : 1);
  const logicalRouteWaypoints = heldLogicalRoute?.logicalRouteWaypoints ?? logicalSettlementWaypoints;
  const logicalRouteTraversalModes = heldLogicalRoute?.logicalRouteTraversalModes ?? logicalSettlementTraversalModes;
  const nextServerRoute = serverRoute;
  if (nextServerRoute.serverRouteWaypoints.length === 0) {
    return {
      actor: {
        ...actor,
        tile: startTile,
        renderTile: actor.renderTile,
        clientPosition,
        logicalClientPosition,
        logicalRouteWaypoints,
        logicalRouteTraversalModes,
        lastMovementClientCycle,
        routeWaypoints,
        routeTraversalModes,
        serverRouteWaypoints: [],
        serverRouteTraversalModes: [],
        serverRouteVisualQueued: false,
        movementStallTicks: actor.movementStallTicks,
        sequenceName: routeWaypoints.length > 0 ? actor.sequenceName : "idle"
      },
      reached
    };
  }

  return {
    actor: {
      ...actor,
      tile: startTile,
      renderTile: actor.renderTile,
      clientPosition,
      logicalClientPosition,
      logicalRouteWaypoints,
      logicalRouteTraversalModes,
      lastMovementClientCycle,
      routeWaypoints,
      routeTraversalModes,
      serverRouteWaypoints: nextServerRoute.serverRouteWaypoints,
      serverRouteTraversalModes: nextServerRoute.serverRouteTraversalModes,
      serverRouteVisualQueued: false,
      movementStallTicks: actor.movementStallTicks,
      sequenceName: actor.sequenceName
    },
    reached: true
  };
}


export function manualActorRouteClientPosition(actor: ManualActorState, startTile: RuntimeTile): RuntimeClientPosition {
  return actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile ?? startTile);
}


export function manualActorRouteLogicalClientPosition(actor: ManualActorState, startTile: RuntimeTile): RuntimeClientPosition {
  return actor.logicalClientPosition ??
    actor.clientPosition ??
    nhClientPositionFromRuntimeTile(actor.renderTile ?? startTile);
}


export function nhClientSettlementWaypoints(
  clientPosition: RuntimeClientPosition,
  authoritativeTile: RuntimeTile
): readonly RuntimeTile[] {
  const targetPosition = nhClientPositionFromRuntimeTile(authoritativeTile);
  if (clientPosition.x === targetPosition.x && clientPosition.z === targetPosition.z) {
    return [];
  }

  const waypoints: RuntimeTile[] = [];
  let x = clientPosition.x;
  let z = clientPosition.z;
  while ((x !== targetPosition.x || z !== targetPosition.z) && waypoints.length < NH_CLIENT_ROUTE_BUFFER_LIMIT) {
    x = nhMoveClientAxis(x, targetPosition.x, NH_ACTOR_TILE_CLIENT_UNITS);
    z = nhMoveClientAxis(z, targetPosition.z, NH_ACTOR_TILE_CLIENT_UNITS);
    waypoints.push(runtimeTileFromNhClientPosition({ x, z }));
  }
  return waypoints;
}


export function expandNhManualRoutePath(
  startTile: RuntimeTile,
  routeSegment: readonly RuntimeTile[],
  collision: NhSceneCollision
): readonly RuntimeTile[] {
  const path: RuntimeTile[] = [];
  let currentTile = collision.snapTile(startTile);
  for (const waypoint of routeSegment) {
    while (!sameNhTile(currentTile, waypoint)) {
      const nextTile = nhStepTowardWaypoint(currentTile, waypoint);
      if (!collision.canStep(currentTile, nextTile)) {
        return path;
      }
      path.push(nextTile);
      currentTile = nextTile;
    }
  }
  return path;
}


export function setNhManualServerRoutePath(
  routePath: readonly RuntimeTile[]
): Pick<ManualActorState, "serverRouteWaypoints" | "serverRouteTraversalModes"> {
  if (routePath.length === 0) {
    return {
      serverRouteWaypoints: [],
      serverRouteTraversalModes: []
    };
  }

  return {
    serverRouteWaypoints: routePath,
    serverRouteTraversalModes: routePath.map(() => 1)
  };
}


export function nhClientPathUpdateFromAcceptedServerSteps(
  enqueuedWaypoints: readonly RuntimeTile[],
  traversalMode: number
): Pick<ManualActorState, "routeWaypoints" | "routeTraversalModes"> {
  if (enqueuedWaypoints.length === 0) {
    return {
      routeWaypoints: [],
      routeTraversalModes: []
    };
  }
  // Source: Player.method1111() handles a run update by calling class4.method65()
  // before method1100(). That resolves and queues the intermediate path tile, then
  // queues the final run tile, with pathTraversed set to 2 for both entries.
  return {
    routeWaypoints: enqueuedWaypoints,
    routeTraversalModes: enqueuedWaypoints.map(() => traversalMode)
  };
}


export function setNhManualServerRouteFromPreservedClientPath(
  actor: ManualActorState,
  preservedWaypoints: readonly RuntimeTile[]
): Pick<ManualActorState, "serverRouteWaypoints" | "serverRouteTraversalModes"> {
  const routePath = preservedWaypoints.filter((waypoint, index) =>
    index > 0 || !sameNhTile(waypoint, actor.tile)
  );
  return setNhManualServerRoutePath(routePath);
}


export function advanceManualActorServerRouteTick(
  actor: ManualActorState,
  acceptedClientCycle: number | null = null
): ManualActorState {
  if (actor.serverRouteWaypoints.length === 0) {
    return actor.serverRouteVisualQueued ? { ...actor, serverRouteVisualQueued: false } : actor;
  }
  const sourceTickStepCount = actor.running && actor.serverRouteWaypoints.length > 1 ? 2 : 1;
  const enqueueCount = Math.min(sourceTickStepCount, actor.serverRouteWaypoints.length);
  const enqueuedWaypoints = actor.serverRouteWaypoints.slice(0, enqueueCount);
  const traversalMode = sourceTickStepCount > 1 ? 2 : 1;
  const clientUpdate = nhClientPathUpdateFromAcceptedServerSteps(enqueuedWaypoints, traversalMode);
  const route = actor.serverRouteVisualQueued
    ? {
      routeWaypoints: actor.routeWaypoints,
      routeTraversalModes: actor.routeTraversalModes
    }
    : enqueueManualActorClientPathSteps(actor, clientUpdate.routeWaypoints, traversalMode);
  const logicalRoute = actor.serverRouteVisualQueued
    ? {
      logicalRouteWaypoints: actor.logicalRouteWaypoints,
      logicalRouteTraversalModes: actor.logicalRouteTraversalModes
    }
    : enqueueManualActorLogicalClientPathSteps(actor, clientUpdate.routeWaypoints, traversalMode);
  const remainingServerRouteWaypoints = actor.serverRouteWaypoints.slice(enqueueCount);
  const acceptedMovementCursor =
    acceptedClientCycle === null ? null : Math.max(0, acceptedClientCycle - 1);
  const lastMovementClientCycle =
    acceptedMovementCursor === null
      ? actor.lastMovementClientCycle
      : Math.max(actor.lastMovementClientCycle ?? acceptedMovementCursor, acceptedMovementCursor);
  return {
    ...actor,
    tile: enqueuedWaypoints[enqueuedWaypoints.length - 1] ?? actor.tile,
    routeWaypoints: route.routeWaypoints,
    routeTraversalModes: route.routeTraversalModes,
    logicalRouteWaypoints: logicalRoute.logicalRouteWaypoints,
    logicalRouteTraversalModes: logicalRoute.logicalRouteTraversalModes,
    serverRouteWaypoints: remainingServerRouteWaypoints,
    serverRouteTraversalModes: actor.serverRouteTraversalModes.slice(enqueueCount),
    serverRouteVisualQueued: actor.serverRouteVisualQueued && remainingServerRouteWaypoints.length > 0,
    // Source: Player.method1100() writes path steps during the player update,
    // before class329.method6315() processes actors for that Client.cycle. Stamp
    // the cursor to the cycle immediately before the update so the accepted
    // cycle can either stall into field687 or consume normally. Newly accepted
    // steps must not spend pre-update client-cycle backlog.
    // this cursor mirrors Client.cycle and must never move backwards.
    lastMovementClientCycle
  };
}


export function advanceManualActorTargetRouteTick(
  actor: ManualActorState,
  acceptedClientCycle: number | null = null
): ManualActorState {
  if (actor.serverRouteWaypoints.length === 0) {
    return actor;
  }
  const sourceTickStepCount = actor.running && actor.serverRouteWaypoints.length > 1 ? 2 : 1;
  const enqueueCount = Math.min(sourceTickStepCount, actor.serverRouteWaypoints.length);
  const enqueuedWaypoints = actor.serverRouteWaypoints.slice(0, enqueueCount);
  const traversalMode = sourceTickStepCount > 1 ? 2 : 1;
  const clientUpdate = nhClientPathUpdateFromAcceptedServerSteps(enqueuedWaypoints, traversalMode);
  const clientPosition = actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile ?? actor.tile);
  const settlementWaypoints = nhClientSettlementWaypoints(clientPosition, actor.tile);
  const settlementTraversalModes = settlementWaypoints.map(() => actor.running ? 2 : 1);
  const targetRouteWaypoints = [...settlementWaypoints, ...clientUpdate.routeWaypoints];
  const targetRouteTraversalModes = [
    ...settlementTraversalModes,
    ...clientUpdate.routeTraversalModes
  ];
  // Source: TargetRoute.beforeMovement() rewrites Movement steps before each
  // movement pass. The source client then receives the fresh accepted movement
  // path; an older click-away/client tail must not sit ahead of the pull-in step.
  const compressedRoute = compressManualActorTargetRouteClientPath(
    clientPosition,
    targetRouteWaypoints,
    targetRouteTraversalModes,
    enqueueCount
  );
  const logicalClientPosition = manualActorRouteLogicalClientPosition(actor, actor.tile);
  const logicalSettlementWaypoints = nhClientSettlementWaypoints(logicalClientPosition, actor.tile);
  const logicalTargetRouteWaypoints = [...logicalSettlementWaypoints, ...clientUpdate.routeWaypoints];
  const logicalTargetRouteTraversalModes = [
    ...logicalSettlementWaypoints.map(() => actor.running ? 2 : 1),
    ...clientUpdate.routeTraversalModes
  ];
  const logicalRoute = setManualActorLogicalClientPath(
    logicalClientPosition,
    logicalTargetRouteWaypoints,
    logicalTargetRouteTraversalModes,
    enqueueCount
  );
  const acceptedMovementCursor =
    acceptedClientCycle === null ? null : Math.max(0, acceptedClientCycle - 1);
  const lastMovementClientCycle =
    acceptedMovementCursor === null
      ? actor.lastMovementClientCycle
      : Math.max(actor.lastMovementClientCycle ?? acceptedMovementCursor, acceptedMovementCursor);
  return {
    ...actor,
    tile: enqueuedWaypoints[enqueuedWaypoints.length - 1] ?? actor.tile,
    routeWaypoints: compressedRoute.routeWaypoints,
    routeTraversalModes: compressedRoute.routeTraversalModes,
    logicalClientPosition,
    logicalRouteWaypoints: logicalRoute.logicalRouteWaypoints,
    logicalRouteTraversalModes: logicalRoute.logicalRouteTraversalModes,
    serverRouteWaypoints: [],
    serverRouteTraversalModes: [],
    serverRouteVisualQueued: false,
    // Source: TargetRoute.beforeMovement() still reaches the client as a
    // player-update path write before class329's actor pass on that same client
    // cycle; avoid pre-update backlog while still allowing the accepted cycle.
    lastMovementClientCycle
  };
}


export function compressManualActorTargetRouteClientPath(
  clientPosition: RuntimeClientPosition,
  routeWaypoints: readonly RuntimeTile[],
  routeTraversalModes: readonly number[],
  preservedTailCount = 0
): Pick<ManualActorState, "routeWaypoints" | "routeTraversalModes"> {
  void clientPosition;
  void preservedTailCount;
  if (routeWaypoints.length <= NH_CLIENT_ROUTE_BUFFER_LIMIT) {
    return { routeWaypoints, routeTraversalModes };
  }

  // Source: Player.method1100() keeps a fixed pathX/pathY buffer by shifting in
  // the newest step at index 0. It does not geometry-compress loops, so a
  // forward/back click sequence during a held action must survive exactly.
  const startIndex = routeWaypoints.length - NH_CLIENT_ROUTE_BUFFER_LIMIT;
  return {
    routeWaypoints: routeWaypoints.slice(startIndex),
    routeTraversalModes: routeTraversalModes.slice(startIndex)
  };
}


export function enqueueManualActorClientPathSteps(
  actor: ManualActorState,
  nextSteps: readonly RuntimeTile[],
  traversalMode: number
): Pick<ManualActorState, "routeWaypoints" | "routeTraversalModes"> {
  const clientPosition = actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile ?? actor.tile);
  const routeWaypoints = [...actor.routeWaypoints, ...nextSteps];
  const routeTraversalModes = [
    ...actor.routeTraversalModes,
    ...Array.from({ length: nextSteps.length }, () => traversalMode)
  ];
  return compressManualActorTargetRouteClientPath(
    clientPosition,
    routeWaypoints,
    routeTraversalModes,
    nextSteps.length
  );
}


export function setManualActorLogicalClientPath(
  logicalClientPosition: RuntimeClientPosition,
  nextSteps: readonly RuntimeTile[],
  traversalModes: readonly number[],
  preservedTailCount = 0
): Pick<ManualActorState, "logicalRouteWaypoints" | "logicalRouteTraversalModes"> {
  const route = compressManualActorTargetRouteClientPath(
    logicalClientPosition,
    nextSteps,
    traversalModes,
    preservedTailCount
  );
  return {
    logicalRouteWaypoints: route.routeWaypoints,
    logicalRouteTraversalModes: route.routeTraversalModes
  };
}


export function enqueueManualActorLogicalClientPathSteps(
  actor: ManualActorState,
  nextSteps: readonly RuntimeTile[],
  traversalMode: number
): Pick<ManualActorState, "logicalRouteWaypoints" | "logicalRouteTraversalModes"> {
  const logicalClientPosition = manualActorRouteLogicalClientPosition(actor, actor.tile);
  return setManualActorLogicalClientPath(
    logicalClientPosition,
    [...actor.logicalRouteWaypoints, ...nextSteps],
    [
      ...actor.logicalRouteTraversalModes,
      ...Array.from({ length: nextSteps.length }, () => traversalMode)
    ],
    nextSteps.length
  );
}


export function nhStepTowardWaypoint(fromTile: RuntimeTile, waypoint: RuntimeTile): RuntimeTile {
  const deltaX = Math.sign(Math.round((waypoint.x - fromTile.x) / NH_TILE_WORLD_UNITS));
  const deltaZ = Math.sign(Math.round((waypoint.z - fromTile.z) / NH_TILE_WORLD_UNITS));
  return {
    x: fromTile.x + deltaX * NH_TILE_WORLD_UNITS,
    z: fromTile.z + deltaZ * NH_TILE_WORLD_UNITS
  };
}


export function sameNhTile(left: RuntimeTile, right: RuntimeTile): boolean {
  return left.x === right.x && left.z === right.z;
}


export function runtimeSequenceIsMovement(sequenceName: RuntimeSequenceName): boolean {
  return sequenceName === "walk" ||
    sequenceName === "run" ||
    sequenceName === "turn" ||
    sequenceName === "walk_back" ||
    sequenceName === "walk_left" ||
    sequenceName === "walk_right" ||
    sequenceName.endsWith("_walk") ||
    sequenceName.endsWith("_turn") ||
    sequenceName.endsWith("_walk_back") ||
    sequenceName.endsWith("_walk_left") ||
    sequenceName.endsWith("_walk_right") ||
    sequenceName.endsWith("_run");
}


export function runtimeSequenceIsWeaponReady(sequenceName: RuntimeSequenceName): boolean {
  return sequenceName.endsWith("_ready");
}


export function manualActorHasPendingMovement(actor: ManualActorState): boolean {
  return actor.routeWaypoints.length > 0 || actor.serverRouteWaypoints.length > 0;
}


export function manualActorHasHeldActionMovement(actor: ManualActorState): boolean {
  return actor.activeSequenceKey !== null ||
    actor.movementBlockedBySequence ||
    actor.movementStallTicks > 0 ||
    manualActorHasPendingMovement(actor) ||
    actor.logicalRouteWaypoints.length > 0 ||
    actor.serverRouteVisualQueued;
}


export function clearManualActorMovementRoute(actor: ManualActorState): ManualActorState {
  // Source: Entity.freeze() calls Movement.reset(), which clears queued steps without rewriting Position.
  // The client still has to settle smoothly to
  // that last accepted server tile, otherwise the next post-freeze route starts
  // from a hidden authoritative tile and visibly snaps.
  const clientPosition = actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile);
  const settlementWaypoints = nhClientSettlementWaypoints(clientPosition, actor.tile);
  const logicalClientPosition = manualActorRouteLogicalClientPosition(actor, actor.tile);
  const logicalSettlementWaypoints = nhClientSettlementWaypoints(logicalClientPosition, actor.tile);
  return {
    ...actor,
    renderTile: runtimeTileFromNhClientPosition(clientPosition),
    routeWaypoints: settlementWaypoints,
    routeTraversalModes: settlementWaypoints.map(() => actor.running ? 2 : 1),
    logicalClientPosition,
    logicalRouteWaypoints: logicalSettlementWaypoints,
    logicalRouteTraversalModes: logicalSettlementWaypoints.map(() => actor.running ? 2 : 1),
    serverRouteWaypoints: [],
    serverRouteTraversalModes: [],
    serverRouteVisualQueued: false,
    clientPosition,
    movementStallTicks: 0,
    sequencePathLengthAtStart: 0,
    movementBlockedBySequence: false,
    sequenceName: runtimeSequenceIsMovement(actor.sequenceName) ? "idle" : actor.sequenceName
  };
}


export function stopManualActorMovementIfMovementGated(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState,
  tick: number
): ManualActorState {
  return movementGate(combatActor.locks, tick).blocked ? clearManualActorMovementRoute(actor) : actor;
}


export function syncManualActorServerTileToCombatActor(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState
): ManualActorState {
  if (sameNhTile(actor.tile, combatActor.tile)) {
    return actor;
  }

  // Source: Entity.freeze() calls Movement.reset() during the earlier PID
  // player's process. If the visual/manual tick had already staged a later
  // actor's step, snap the authoritative server tile back and let the client
  // settle to it instead of leaving an impossible frozen-under position.
  return clearManualActorMovementRoute({
    ...actor,
    tile: combatActor.tile
  });
}


export function manualActorHasActiveCombatTargetRoute(input: {
  readonly combatActor: RuntimePlayerCombatActorState;
  readonly targetActorId: RuntimeActorId;
  readonly targetCombatActor: RuntimePlayerCombatActorState;
  readonly tick: number;
}): boolean {
  return (
    input.combatActor.targetId === input.targetActorId &&
    !isRuntimePlayerCombatActorDead(input.combatActor, input.tick) &&
    !isRuntimePlayerCombatActorDead(input.targetCombatActor, input.tick)
  );
}


export function preAttackRouteManualActorToCombatTarget(input: {
  readonly actorId: RuntimeActorId;
  readonly actor: ManualActorState;
  readonly combatActor: RuntimePlayerCombatActorState;
  readonly targetActorId: RuntimeActorId;
  readonly targetActor: ManualActorState;
  readonly targetCombatActor: RuntimePlayerCombatActorState;
  readonly collision: NhSceneCollision;
  readonly tick: number;
  readonly now: number;
  readonly acceptedClientCycle: number;
  readonly movedThisTick: boolean;
}): ManualActorState {
  if (
    input.movedThisTick ||
    !manualActorHasActiveCombatTargetRoute(input)
  ) {
    return input.actor;
  }

  const profile = runtimePlayerCombatTargetRouteProfile(input.actorId, input.combatActor);
  if (movementGate(input.combatActor.locks, input.tick).blocked) {
    return clearManualActorMovementRoute(input.actor);
  }

  if (nhSceneTargetRouteReached(input.actor.tile, input.targetActor.tile, profile.attackRange, input.collision)) {
    return {
      ...input.actor,
      serverRouteWaypoints: [],
      serverRouteTraversalModes: [],
      serverRouteVisualQueued: false
    };
  }

  // Source: Nh Player.process() runs combat.preAttack(), TargetRoute.beforeMovement(), movement.process(),
  // TargetRoute.afterMovement(), then combat.attack(); target-route movement is consumed before the attack gate,
  // even when the first step has not reached attack range yet.
  const routed = routeManualActorToTarget(input.actor, input.targetActor.tile, profile.attackRange, input.collision, input.now, false);
  // Source: TargetRoute.beforeMovement() recomputes RouteFinder.routeEntity() each tick before Movement.process().
  // Only this tick's walk/run step survives; carrying the remaining target-route tail into the next tick makes
  // melee pathing use stale waypoints instead of the freshly recomputed entity route.
  return advanceManualActorTargetRouteTick(routed.actor, input.acceptedClientCycle);
}


export function runtimeCombatProjectileLineOfSight(input: {
  readonly actorId: RuntimeActorId;
  readonly actor: ManualActorState;
  readonly combatActor: RuntimePlayerCombatActorState;
  readonly targetActor: ManualActorState;
  readonly collision: NhSceneCollision;
}): boolean {
  const profile = runtimePlayerCombatTargetRouteProfile(input.actorId, input.combatActor);
  return profile.melee || nhSceneProjectileRouteClear(input.actor.tile, input.targetActor.tile, input.collision);
}


export function runtimeManualPolicyCanAttackSignal(input: {
  readonly attacker: RuntimePlayerCombatActorState;
  readonly target: RuntimePlayerCombatActorState;
  readonly tick: number;
  readonly collision: NhSceneCollision | null;
}): boolean {
  if (!canAttackThroughLock(input.attacker.locks, input.tick)) {
    return false;
  }

  if (!input.collision) {
    return true;
  }

  // Source: PlayerCombat.canAttack() delegates player-vs-player legality to
  // Wilderness.allowAttack(); in the trainer this is the combat-tile listener
  // check, not an attack-timer/range/line-of-sight gate.
  return (
    nhNhBotCombatTileAllowed(input.collision.sceneToWorldTile(input.attacker.tile)) &&
    nhNhBotCombatTileAllowed(input.collision.sceneToWorldTile(input.target.tile))
  );
}


export function runtimeLoadoutWeaponTypeId(
  loadoutId: RuntimeLoadoutId,
  equipmentDefinitions: NhInventoryEquipmentDefinitionStore,
  equipment?: VisibleEquipment
): string | null {
  const weaponItemId = equipment?.weapon?.itemId ?? nhLoadouts[loadoutId].equipment.weapon?.itemId;
  return weaponItemId === undefined ? null : equipmentDefinitions.get(weaponItemId)?.weaponType ?? null;
}


export function nhWeaponRenderSequenceName(
  loadoutId: RuntimeLoadoutId,
  renderAnimationIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  equipmentDefinitions: NhInventoryEquipmentDefinitionStore,
  weaponTypeDefinitions: NhWeaponTypeDefinitionStore,
  actorSequenceDefinitions: NhActorSequenceDefinitionStore,
  equipment?: VisibleEquipment
): RuntimeSequenceName {
  const weaponTypeId = runtimeLoadoutWeaponTypeId(loadoutId, equipmentDefinitions, equipment);
  const sequenceId = weaponTypeId ? weaponTypeDefinitions.get(weaponTypeId)?.renderAnimations[renderAnimationIndex] : undefined;
  return nhRuntimeSequenceNameForId(sequenceId, actorSequenceDefinitions) ?? (
    renderAnimationIndex === 1 ? "turn" :
      renderAnimationIndex === 2 ? "walk" :
        renderAnimationIndex === 3 ? "walk_back" :
          renderAnimationIndex === 4 ? "walk_left" :
            renderAnimationIndex === 5 ? "walk_right" :
              renderAnimationIndex === 6 ? "run" : "idle"
  );
}


export function manualActorWeaponRenderAnimationIndex(sequenceName: RuntimeSequenceName): 0 | 1 | 2 | 3 | 4 | 5 | 6 | null {
  if (sequenceName === "idle" || runtimeSequenceIsWeaponReady(sequenceName)) {
    return 0;
  }
  if (sequenceName === "turn" || sequenceName.endsWith("_turn")) {
    return 1;
  }
  if (sequenceName === "walk") {
    return 2;
  }
  if (sequenceName === "walk_back" || sequenceName.endsWith("_walk_back")) {
    return 3;
  }
  if (sequenceName === "walk_left" || sequenceName.endsWith("_walk_left")) {
    return 4;
  }
  if (sequenceName === "walk_right" || sequenceName.endsWith("_walk_right")) {
    return 5;
  }
  if (sequenceName === "run" || sequenceName.endsWith("_run")) {
    return 6;
  }
  if (sequenceName.endsWith("_walk")) {
    return 2;
  }
  return null;
}


export function manualActorBaseSequenceName(
  sequenceName: RuntimeSequenceName,
  loadoutId?: RuntimeLoadoutId,
  equipmentDefinitions: NhInventoryEquipmentDefinitionStore = new Map(),
  weaponTypeDefinitions: NhWeaponTypeDefinitionStore = new Map(),
  actorSequenceDefinitions: NhActorSequenceDefinitionStore = createNhActorSequenceDefinitionStore(null),
  equipment?: VisibleEquipment
): RuntimeSequenceName {
  const weaponRenderAnimationIndex = manualActorWeaponRenderAnimationIndex(sequenceName);
  if (!loadoutId) {
    if (weaponRenderAnimationIndex !== null && sequenceName !== "idle" && !runtimeSequenceIsMovement(sequenceName)) {
      return sequenceName;
    }
    return runtimeSequenceIsMovement(sequenceName) ? sequenceName : "idle";
  }
  if (weaponRenderAnimationIndex !== null) {
    return nhWeaponRenderSequenceName(
      loadoutId,
      weaponRenderAnimationIndex,
      equipmentDefinitions,
      weaponTypeDefinitions,
      actorSequenceDefinitions,
      equipment
    );
  }
  return nhWeaponRenderSequenceName(loadoutId, 0, equipmentDefinitions, weaponTypeDefinitions, actorSequenceDefinitions, equipment);
}


export function manualActorVisibleSequenceName(actor: ManualActorState): RuntimeSequenceName {
  if (actor.movementBlockedBySequence || actor.routeWaypoints.length === 0 || !nhSequenceIsReadyMovement(actor.sequenceName)) {
    return actor.sequenceName;
  }

  return nhMovementSequenceNameFromOrientation(actor);
}


export function nhAdvanceMovementFrameCursor(
  actor: ManualActorState,
  movementSequenceName: RuntimeSequenceName,
  animationFixtures: NhAnimationFixtures | null
): ManualActorState {
  const sequence = animationFixtures?.sequences.get(movementSequenceName);
  if (!sequence || sequence.frames.length === 0) {
    return actor;
  }

  let movementFrame = Math.max(0, Math.trunc(actor.movementFrame));
  let movementFrameCycle = Math.max(0, Math.trunc(actor.movementFrameCycle)) + 1;
  const frameLength = movementFrame < sequence.frames.length
    ? Math.max(1, sequence.frames[movementFrame].lengthClientCycles)
    : 1;

  if (movementFrame < sequence.frames.length && movementFrameCycle > frameLength) {
    movementFrameCycle = 1;
    movementFrame += 1;
  }

  if (movementFrame >= sequence.frames.length) {
    movementFrame = 0;
    movementFrameCycle = 0;
  }

  return {
    ...actor,
    movementFrame,
    movementFrameCycle
  };
}


export function nhMovementFrameCursor(actor: ManualActorState): NhSequenceFrameCursorOverride {
  return {
    frameIndex: actor.movementFrame,
    frameCycle: actor.movementFrameCycle
  };
}


export function runtimePlayerCombatActionActive(
  combatActor: RuntimePlayerCombatActorState,
  combatState: RuntimePlayerCombatState
): boolean {
  return combatActor.actionSequenceName !== null && combatState.tick < combatActor.actionUntilTick;
}


export function nhClientPositionFromRuntimeTile(tile: RuntimeTile): RuntimeClientPosition {
  return {
    x: Math.round((tile.x / NH_TILE_WORLD_UNITS) * NH_ACTOR_TILE_CLIENT_UNITS),
    z: Math.round((tile.z / NH_TILE_WORLD_UNITS) * NH_ACTOR_TILE_CLIENT_UNITS)
  };
}


export function runtimeTileFromNhClientPosition(position: RuntimeClientPosition): RuntimeTile {
  return {
    x: Number(((position.x / NH_ACTOR_TILE_CLIENT_UNITS) * NH_TILE_WORLD_UNITS).toFixed(6)),
    z: Number(((position.z / NH_ACTOR_TILE_CLIENT_UNITS) * NH_TILE_WORLD_UNITS).toFixed(6))
  };
}


export function normalizeNhOrientationUnits(units: number): number {
  const integerUnits = Number.isFinite(units) ? Math.trunc(units) : 0;
  return ((integerUnits % NH_ACTOR_ORIENTATION_UNITS) + NH_ACTOR_ORIENTATION_UNITS) % NH_ACTOR_ORIENTATION_UNITS;
}


export function nhFacingDegreesToOrientationUnits(degrees: number): number {
  return normalizeNhOrientationUnits((degrees * NH_ACTOR_ORIENTATION_UNITS) / 360 + 1024);
}


export function nhActorModelRotationRadiansFromFacingDegrees(degrees: number): number {
  const orientationUnits = nhFacingDegreesToOrientationUnits(degrees);
  return (orientationUnits * Math.PI * 2) / NH_ACTOR_ORIENTATION_UNITS;
}


export function nhOrientationUnitsToFacingDegrees(units: number): number {
  const degrees = ((normalizeNhOrientationUnits(units) - 1024) * 360) / NH_ACTOR_ORIENTATION_UNITS;
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}


export function nhOrientationUnitsFromClientDelta(
  deltaX: number,
  deltaZ: number,
  fallbackUnits: number
): number {
  if (deltaX > 0) {
    if (deltaZ > 0) {
      return 1280;
    }
    if (deltaZ < 0) {
      return 1792;
    }
    return 1536;
  }
  if (deltaX < 0) {
    if (deltaZ > 0) {
      return 768;
    }
    if (deltaZ < 0) {
      return 256;
    }
    return 512;
  }
  if (deltaZ > 0) {
    return 1024;
  }
  if (deltaZ < 0) {
    return 0;
  }
  return fallbackUnits;
}


export function nhTargetOrientationUnits(
  position: RuntimeClientPosition,
  target: RuntimeClientPosition,
  fallbackUnits: number
): number {
  const deltaX = position.x - target.x;
  const deltaZ = position.z - target.z;
  if (deltaX === 0 && deltaZ === 0) {
    return fallbackUnits;
  }
  return normalizeNhOrientationUnits(Math.atan2(deltaX, deltaZ) * 325.949);
}


export function signedNhOrientationDelta(targetUnits: number, rotationUnits: number): number {
  let delta = normalizeNhOrientationUnits(targetUnits - rotationUnits);
  if (delta > 1024) {
    delta -= NH_ACTOR_ORIENTATION_UNITS;
  }
  return delta;
}


export function nhMoveClientAxis(current: number, target: number, speed: number): number {
  if (current < target) {
    return Math.min(current + speed, target);
  }
  if (current > target) {
    return Math.max(current - speed, target);
  }
  return current;
}


export function nhManualMovementSpeed(
  actor: ManualActorState,
  traversalMode: number,
  hasCombatTarget: boolean
): { readonly speed: number; readonly movementStallTicks: number } {
  return nhManualMovementSpeedForPath(
    actor,
    actor.routeWaypoints.length,
    traversalMode,
    hasCombatTarget,
    actor.movementStallTicks
  );
}


export function nhManualMovementSpeedForPath(
  actor: Pick<ManualActorState, "rotationUnits" | "orientationUnits">,
  pathLength: number,
  traversalMode: number,
  hasCombatTarget: boolean,
  movementStallTicks: number
): { readonly speed: number; readonly movementStallTicks: number } {
  let speed = 4;
  if (actor.rotationUnits !== actor.orientationUnits && !hasCombatTarget) {
    speed = 2;
  }
  if (pathLength > 2) {
    speed = 6;
  }
  if (pathLength > 3) {
    speed = 8;
  }
  let nextMovementStallTicks = movementStallTicks;
  if (nextMovementStallTicks > 0 && pathLength > 1) {
    speed = 8;
    nextMovementStallTicks -= 1;
  }
  if (traversalMode === 2) {
    speed <<= 1;
  }
  return { speed, movementStallTicks: nextMovementStallTicks };
}


export function manualActorHasClientTargetIndex(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState | null,
  clientCycle: number
): boolean {
  // Source: PlayerCombat.reset() clears the server target immediately, but
  // faceNone(true) removes the client targetIndex through EntityDirectionUpdate's
  // delayed stage/reset path. Keep this as an explicit client-side hold, not the
  // trainer's broader last-target combat memory.
  return Boolean(
    (combatActor !== null && combatActor.targetId !== null) ||
      actor.clientTargetIndexUntilClientCycle >= clientCycle
  );
}


export function manualActorWithClientTargetIndexHold(
  actor: ManualActorState,
  untilClientCycle: number
): ManualActorState {
  return {
    ...actor,
    clientTargetIndexUntilClientCycle: Math.max(
      actor.clientTargetIndexUntilClientCycle,
      untilClientCycle
    )
  };
}


export function nhMovementSequenceNameFromOrientation(actor: ManualActorState): RuntimeSequenceName {
  const delta = signedNhOrientationDelta(actor.orientationUnits, actor.rotationUnits);
  if (delta >= -256 && delta <= 256) {
    return "walk";
  }
  if (delta >= 256 && delta < 768) {
    return "walk_right";
  }
  if (delta >= -768 && delta <= -256) {
    return "walk_left";
  }
  return "walk_back";
}


export function nhMovementSequenceNameForSpeed(
  speed: number,
  movementSequenceName: RuntimeSequenceName
): RuntimeSequenceName {
  return speed >= 8 && movementSequenceName === "walk" ? "run" : movementSequenceName;
}


export function nhSequenceIsReadyMovement(sequenceName: RuntimeSequenceName): boolean {
  return sequenceName === "idle" || runtimeSequenceIsWeaponReady(sequenceName);
}


export function nhTurnSequenceForReadyMovement(
  sequenceName: RuntimeSequenceName,
  turnTicks: number,
  stillTurning: boolean
): RuntimeSequenceName {
  return nhSequenceIsReadyMovement(sequenceName) &&
    (turnTicks > NH_ACTOR_TURN_ANIMATION_DELAY_TICKS || stillTurning)
    ? "turn"
    : sequenceName;
}


export function rotateManualActorTowardNhOrientation(
  actor: ManualActorState,
  targetActor: ManualActorState | null,
  hasCombatTarget: boolean
): ManualActorState {
  const targetPosition = targetActor
    ? targetActor.clientPosition ?? nhClientPositionFromRuntimeTile(targetActor.renderTile)
    : null;
  const orientationUnits =
    hasCombatTarget && targetPosition
      ? nhTargetOrientationUnits(actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile), targetPosition, actor.orientationUnits)
      : actor.orientationUnits;
  const delta = normalizeNhOrientationUnits(orientationUnits - actor.rotationUnits);
  if (delta === 0) {
    return {
      ...actor,
      orientationUnits,
      turnTicks: 0,
      facingDegrees: nhOrientationUnitsToFacingDegrees(actor.rotationUnits)
    };
  }

  let rotationUnits = actor.rotationUnits;
  let stillTurning = true;
  if (delta > 1024) {
    rotationUnits -= NH_ACTOR_TURN_SPEED_UNITS;
    if (delta < NH_ACTOR_TURN_SPEED_UNITS || delta > NH_ACTOR_ORIENTATION_UNITS - NH_ACTOR_TURN_SPEED_UNITS) {
      rotationUnits = orientationUnits;
      stillTurning = false;
    }
  } else {
    rotationUnits += NH_ACTOR_TURN_SPEED_UNITS;
    if (delta < NH_ACTOR_TURN_SPEED_UNITS || delta > NH_ACTOR_ORIENTATION_UNITS - NH_ACTOR_TURN_SPEED_UNITS) {
      rotationUnits = orientationUnits;
      stillTurning = false;
    }
  }
  rotationUnits = normalizeNhOrientationUnits(rotationUnits);
  const turnTicks = actor.turnTicks + 1;
  const sequenceName = nhTurnSequenceForReadyMovement(actor.sequenceName, turnTicks, stillTurning);

  return {
    ...actor,
    orientationUnits,
    rotationUnits,
    turnTicks,
    sequenceName,
    facingDegrees: nhOrientationUnitsToFacingDegrees(rotationUnits)
  };
}


export function manualActorActionSequenceKey(
  combatActor: RuntimePlayerCombatActorState,
  combatState: RuntimePlayerCombatState
): string | null {
  if (!runtimePlayerCombatActionActive(combatActor, combatState) || !combatActor.actionSequenceName) {
    return null;
  }
  const actionStartTick =
    combatActor.actionStartedAtTick ?? combatActor.actionUntilTick - combatActor.actionDurationTicks;
  const actionStartClientCycle =
    combatActor.actionStartedAtClientCycle ?? actionStartTick * NH_CLIENT_CYCLES_PER_GAME_TICK;
  return `${combatActor.actionSequenceName}:${actionStartClientCycle}`;
}


export function manualActorSequenceNameFromKey(sequenceKey: string | null): RuntimeSequenceName | null {
  if (!sequenceKey) {
    return null;
  }
  const separatorIndex = sequenceKey.lastIndexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }
  return sequenceKey.slice(0, separatorIndex) as RuntimeSequenceName;
}


export function manualActorSequenceStartClientCycle(sequenceKey: string | null): number | null {
  if (!sequenceKey) {
    return null;
  }
  const separatorIndex = sequenceKey.lastIndexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= sequenceKey.length - 1) {
    return null;
  }
  const cycle = Number.parseInt(sequenceKey.slice(separatorIndex + 1), 10);
  return Number.isFinite(cycle) ? cycle : null;
}


export function manualActorActiveSequenceContext(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState | null,
  combatState: RuntimePlayerCombatState
): { readonly key: string; readonly sequenceName: RuntimeSequenceName } | null {
  if (!actor.activeSequenceKey) {
    return null;
  }
  const activeCombatSequenceKey =
    combatActor ? manualActorActionSequenceKey(combatActor, combatState) : null;
  if (
    activeCombatSequenceKey === actor.activeSequenceKey &&
    combatActor?.actionSequenceName
  ) {
    return {
      key: actor.activeSequenceKey,
      sequenceName: combatActor.actionSequenceName
    };
  }
  const sequenceName = manualActorSequenceNameFromKey(actor.activeSequenceKey);
  return sequenceName ? { key: actor.activeSequenceKey, sequenceName } : null;
}


export function manualActorWithCombatActionFacing(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState,
  targetActor: ManualActorState | null = null
): ManualActorState {
  if (combatActor.actionFacingDegrees === null) {
    return actor;
  }
  const orientationUnits = targetActor
    ? nhTargetOrientationUnits(
      actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile ?? actor.tile),
      targetActor.clientPosition ?? nhClientPositionFromRuntimeTile(targetActor.renderTile ?? targetActor.tile),
      actor.orientationUnits
    )
    : nhFacingDegreesToOrientationUnits(combatActor.actionFacingDegrees);
  const facingDegrees = nhOrientationUnitsToFacingDegrees(orientationUnits);
  return actor.orientationUnits === orientationUnits &&
    actor.rotationUnits === orientationUnits &&
    actor.facingDegrees === facingDegrees
    ? actor
    : {
      ...actor,
      orientationUnits,
      rotationUnits: orientationUnits,
      facingDegrees,
      turnTicks: 0
    };
}


export function syncManualActorActionSequence(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState,
  combatState: RuntimePlayerCombatState,
  targetActor: ManualActorState | null = null
): ManualActorState {
  const activeSequenceKey = manualActorActionSequenceKey(combatActor, combatState);
  if (activeSequenceKey === null) {
    // Source: once LoginPacket.method3722 accepts a primary sequence, class329
    // advances that client sequence until its frame table finishes. Server-side
    // combat action bookkeeping expiring must not cancel the visible sequence or
    // unblock movement early.
    if (actor.activeSequenceKey !== null) {
      return actor;
    }
    return actor.activeSequenceKey === null &&
      actor.completedSequenceKey === null &&
      actor.sequencePathLengthAtStart === 0 &&
      actor.primaryFrame === 0 &&
      actor.primaryFrameCycle === 0 &&
      actor.primarySequenceLoops === 0 &&
      actor.primarySequenceCycle === 0 &&
      actor.primarySequenceDelayCycles === 0
      ? actor
      : {
        ...actor,
        activeSequenceKey: null,
        completedSequenceKey: null,
        sequencePathLengthAtStart: 0,
        primaryFrame: 0,
        primaryFrameCycle: 0,
        primarySequenceLoops: 0,
        primarySequenceCycle: 0,
        primarySequenceDelayCycles: 0
      };
  }
  if (actor.completedSequenceKey === activeSequenceKey) {
    return actor.activeSequenceKey === null ? actor : { ...actor, activeSequenceKey: null };
  }
  if (actor.activeSequenceKey === activeSequenceKey) {
    return manualActorWithCombatActionFacing(actor, combatActor, targetActor);
  }
  return manualActorWithCombatActionFacing({
    ...actor,
    activeSequenceKey,
    completedSequenceKey: null,
    sequencePathLengthAtStart: actor.routeWaypoints.length,
    // Source: Nh LoginPacket.method3722 resets sequenceFrame, sequenceFrameCycle, sequenceDelay,
    // and field703 only when a new primary sequence is accepted by the client.
    primaryFrame: 0,
    primaryFrameCycle: 0,
    primarySequenceLoops: 0,
    primarySequenceCycle: 0,
    primarySequenceDelayCycles: 0
  }, combatActor, targetActor);
}


export function manualActorWithPrimarySequence(
  actor: ManualActorState,
  sequenceName: RuntimeSequenceName,
  startClientCycle: number
): ManualActorState {
  return {
    ...actor,
    activeSequenceKey: `${sequenceName}:${Math.max(0, Math.trunc(startClientCycle))}`,
    completedSequenceKey: null,
    sequencePathLengthAtStart: actor.routeWaypoints.length,
    primaryFrame: 0,
    primaryFrameCycle: 0,
    primarySequenceLoops: 0,
    primarySequenceCycle: 0,
    primarySequenceDelayCycles: 0
  };
}


export function sameManualActorTilePath(
  left: readonly RuntimeTile[],
  right: readonly RuntimeTile[]
): boolean {
  return left.length === right.length && left.every((tile, index) => sameNhTile(tile, right[index]));
}


export function sameManualActorTraversalPath(
  left: readonly number[],
  right: readonly number[]
): boolean {
  return left.length === right.length && left.every((mode, index) => mode === right[index]);
}


export function sameManualActorClientPosition(
  left: RuntimeClientPosition | null,
  right: RuntimeClientPosition | null
): boolean {
  return left === right || (
    left !== null &&
    right !== null &&
    left.x === right.x &&
    left.z === right.z
  );
}


export function manualActorMovementStateDiffers(
  current: ManualActorState,
  incoming: ManualActorState
): boolean {
  return (
    !sameNhTile(current.tile, incoming.tile) ||
    !sameNhTile(current.renderTile, incoming.renderTile) ||
    !sameManualActorClientPosition(current.clientPosition, incoming.clientPosition) ||
    !sameManualActorClientPosition(current.logicalClientPosition, incoming.logicalClientPosition) ||
    !sameManualActorTilePath(current.routeWaypoints, incoming.routeWaypoints) ||
    !sameManualActorTraversalPath(current.routeTraversalModes, incoming.routeTraversalModes) ||
    !sameManualActorTilePath(current.logicalRouteWaypoints, incoming.logicalRouteWaypoints) ||
    !sameManualActorTraversalPath(current.logicalRouteTraversalModes, incoming.logicalRouteTraversalModes) ||
    !sameManualActorTilePath(current.serverRouteWaypoints, incoming.serverRouteWaypoints) ||
    !sameManualActorTraversalPath(current.serverRouteTraversalModes, incoming.serverRouteTraversalModes) ||
    current.serverRouteVisualQueued !== incoming.serverRouteVisualQueued ||
    current.lastMovementClientCycle !== incoming.lastMovementClientCycle ||
    current.movementStallTicks !== incoming.movementStallTicks ||
    current.movementBlockedBySequence !== incoming.movementBlockedBySequence
  );
}


export function manualActorWithMovementState(
  incoming: ManualActorState,
  current: ManualActorState,
  sequenceState: Pick<
    ManualActorState,
    | "activeSequenceKey"
    | "completedSequenceKey"
    | "sequencePathLengthAtStart"
    | "primaryFrame"
    | "primaryFrameCycle"
    | "primarySequenceLoops"
    | "primarySequenceCycle"
    | "primarySequenceDelayCycles"
  >
): ManualActorState {
  return {
    ...incoming,
    tile: current.tile,
    renderTile: current.renderTile,
    clientPosition: current.clientPosition,
    routeWaypoints: current.routeWaypoints,
    routeTraversalModes: current.routeTraversalModes,
    logicalClientPosition: current.logicalClientPosition,
    logicalRouteWaypoints: current.logicalRouteWaypoints,
    logicalRouteTraversalModes: current.logicalRouteTraversalModes,
    serverRouteWaypoints: current.serverRouteWaypoints,
    serverRouteTraversalModes: current.serverRouteTraversalModes,
    serverRouteVisualQueued: current.serverRouteVisualQueued,
    clientTargetIndexUntilClientCycle: current.clientTargetIndexUntilClientCycle,
    movementStallTicks: current.movementStallTicks,
    movementBlockedBySequence: current.movementBlockedBySequence,
    movementFrame: current.movementFrame,
    movementFrameCycle: current.movementFrameCycle,
    orientationUnits: current.orientationUnits,
    rotationUnits: current.rotationUnits,
    turnTicks: current.turnTicks,
    sequenceName: current.sequenceName,
    facingDegrees: current.facingDegrees,
    animationCycle: current.animationCycle,
    lastMovementClientCycle: current.lastMovementClientCycle,
    ...sequenceState
  };
}


export function manualActorSequenceCursorState(actor: ManualActorState): Pick<
  ManualActorState,
  | "activeSequenceKey"
  | "completedSequenceKey"
  | "sequencePathLengthAtStart"
  | "primaryFrame"
  | "primaryFrameCycle"
  | "primarySequenceLoops"
  | "primarySequenceCycle"
  | "primarySequenceDelayCycles"
> {
  return {
    activeSequenceKey: actor.activeSequenceKey,
    completedSequenceKey: actor.completedSequenceKey,
    sequencePathLengthAtStart: actor.sequencePathLengthAtStart,
    primaryFrame: actor.primaryFrame,
    primaryFrameCycle: actor.primaryFrameCycle,
    primarySequenceLoops: actor.primarySequenceLoops,
    primarySequenceCycle: actor.primarySequenceCycle,
    primarySequenceDelayCycles: actor.primarySequenceDelayCycles
  };
}


export function manualActorWithAuthoritativeSequenceCursor(
  incoming: ManualActorState,
  current: ManualActorState
): ManualActorState {
  const incomingMovementCursor = incoming.lastMovementClientCycle ?? -1;
  const currentMovementCursor = current.lastMovementClientCycle ?? -1;
  const currentPathCursorAhead =
    current.primarySequenceCycle > incoming.primarySequenceCycle ||
    current.movementStallTicks > incoming.movementStallTicks ||
    current.routeWaypoints.length > incoming.routeWaypoints.length ||
    current.logicalRouteWaypoints.length > incoming.logicalRouteWaypoints.length ||
    current.serverRouteWaypoints.length > incoming.serverRouteWaypoints.length ||
    currentMovementCursor > incomingMovementCursor;
  const currentMovementStateDiffers = manualActorMovementStateDiffers(current, incoming);
  const currentHasPendingMovement =
    current.routeWaypoints.length > 0 ||
    current.logicalRouteWaypoints.length > 0 ||
    current.serverRouteWaypoints.length > 0 ||
    current.serverRouteVisualQueued ||
    current.movementBlockedBySequence ||
    current.movementStallTicks > 0;
  const incomingLooksLikeStaleActorState =
    currentMovementStateDiffers &&
    currentHasPendingMovement &&
    currentMovementCursor >= incomingMovementCursor;
  if (
    current.activeSequenceKey &&
    current.activeSequenceKey === incoming.activeSequenceKey &&
    (currentPathCursorAhead || currentMovementStateDiffers)
  ) {
    // Source: equipment updates only rebuild PlayerAppearance. They do not
    // reset LoginPacket.method3722's primary sequence cursor or class329's
    // held path cursor, so same-sequence stale React state must also preserve
    // the newer client movement cursor.
    return manualActorWithMovementState(incoming, current, manualActorSequenceCursorState(current));
  }

  if (
    current.activeSequenceKey &&
    incoming.activeSequenceKey === null &&
    current.completedSequenceKey === null &&
    (currentPathCursorAhead || currentMovementStateDiffers)
  ) {
    // Source: equipment/appearance packets do not cancel an accepted primary
    // sequence; class329 keeps sequenceFrame/sequenceFrameCycle plus the held
    // path/field687 cursor advancing until the frame table finishes. Stale
    // React state must not erase that client cursor.
    return manualActorWithMovementState(incoming, current, manualActorSequenceCursorState(current));
  }

  if (
    current.completedSequenceKey &&
    (
      current.completedSequenceKey === incoming.activeSequenceKey ||
      (incoming.activeSequenceKey === null && currentMovementStateDiffers)
    )
  ) {
    // Source: Equipment.equip() sends an appearance update without resetting
    // class329's path or field687 catch-up state. If that appearance state lands
    // after the primary sequence ended, it must still not roll back the slingshot.
    return manualActorWithMovementState(incoming, current, {
      activeSequenceKey: null,
      completedSequenceKey: current.completedSequenceKey,
      sequencePathLengthAtStart: 0,
      primaryFrame: 0,
      primaryFrameCycle: 0,
      primarySequenceLoops: 0,
      primarySequenceCycle: current.primarySequenceCycle,
      primarySequenceDelayCycles: 0
    });
  }

  if (
    incoming.activeSequenceKey === null &&
    incoming.completedSequenceKey === null &&
    current.activeSequenceKey === null &&
    current.completedSequenceKey === null &&
    incomingLooksLikeStaleActorState
  ) {
    // Source: appearance/equipment packets do not clear Player.pathX/pathY or
    // class329.field687 after the primary sequence has finished either. React
    // state from that appearance update can land after the local render cursor
    // has already consumed more held path; keep the source movement cursor and
    // apply only the non-movement appearance/loadout fields from the incoming state.
    return manualActorWithMovementState(incoming, current, {
      activeSequenceKey: null,
      completedSequenceKey: null,
      sequencePathLengthAtStart: 0,
      primaryFrame: 0,
      primaryFrameCycle: 0,
      primarySequenceLoops: 0,
      primarySequenceCycle: current.primarySequenceCycle,
      primarySequenceDelayCycles: 0
    });
  }

  return incoming;
}


export function nhPrimaryFrameCursor(actor: ManualActorState): NhSequenceFrameCursorOverride {
  return {
    frameIndex: actor.primaryFrame,
    frameCycle: actor.primaryFrameCycle
  };
}


export function nhAdvancePrimarySequenceCursor(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState | null,
  combatState: RuntimePlayerCombatState | null,
  animationFixtures: NhAnimationFixtures | null
): ManualActorState {
  if (!combatActor || !combatState || actor.activeSequenceKey === null) {
    return actor;
  }

  const activeSequence = manualActorActiveSequenceContext(actor, combatActor, combatState);
  if (!activeSequence) {
    return actor;
  }

  const sequence = animationFixtures?.sequences.get(activeSequence.sequenceName);
  if (!sequence || sequence.frames.length === 0) {
    return {
      ...actor,
      primarySequenceCycle: actor.primarySequenceCycle + 1,
      primarySequenceDelayCycles: 0
    };
  }

  const primarySequenceDelayCycles = Math.max(0, Math.trunc(actor.primarySequenceDelayCycles));
  if (actor.sequencePathLengthAtStart > 0 && nhSequencePrecedenceAnimating(sequence) === 1) {
    // Source: class329.method6315 sets sequenceDelay = 1 and returns when a
    // precedenceAnimating=1 primary sequence was accepted with field726 > 0.
    // The visible actor keeps consuming movement; the primary frame table waits.
    return {
      ...actor,
      primarySequenceDelayCycles: 1
    };
  }
  if (primarySequenceDelayCycles > 0) {
    return {
      ...actor,
      primarySequenceDelayCycles: primarySequenceDelayCycles - 1
    };
  }

  let primaryFrame = Math.max(0, Math.trunc(actor.primaryFrame));
  let primaryFrameCycle = Math.max(0, Math.trunc(actor.primaryFrameCycle)) + 1;
  let primarySequenceLoops = Math.max(0, Math.trunc(actor.primarySequenceLoops));
  const primarySequenceCycle = actor.primarySequenceCycle + 1;
  const frameLength = primaryFrame < sequence.frames.length
    ? Math.max(1, sequence.frames[primaryFrame].lengthClientCycles)
    : 1;

  // Source: Nh class329 increments sequenceFrameCycle once per 20ms client cycle and
  // advances only when sequenceFrameCycle is greater than frameLengths[sequenceFrame].
  if (primaryFrame < sequence.frames.length && primaryFrameCycle > frameLength) {
    primaryFrameCycle = 1;
    primaryFrame += 1;
  }

  if (primaryFrame >= sequence.frames.length) {
    const frameStep = sequence.frameStep ?? -1;
    if (frameStep < 0) {
      return {
        ...actor,
        activeSequenceKey: null,
        completedSequenceKey: actor.activeSequenceKey,
        sequencePathLengthAtStart: 0,
        primaryFrame: 0,
        primaryFrameCycle: 0,
        primarySequenceLoops: 0,
        primarySequenceCycle,
        primarySequenceDelayCycles: 0
      };
    }

    primaryFrame -= frameStep;
    primarySequenceLoops += 1;
    if (
      primarySequenceLoops >= (sequence.maxLoops ?? 99) ||
      primaryFrame < 0 ||
      primaryFrame >= sequence.frames.length
    ) {
      return {
        ...actor,
        activeSequenceKey: null,
        completedSequenceKey: actor.activeSequenceKey,
        sequencePathLengthAtStart: 0,
        primaryFrame: 0,
        primaryFrameCycle: 0,
        primarySequenceLoops: 0,
        primarySequenceCycle,
        primarySequenceDelayCycles: 0
      };
    }
  }

  return {
    ...actor,
    primaryFrame,
    primaryFrameCycle,
    primarySequenceLoops,
    primarySequenceCycle,
    primarySequenceDelayCycles: 0
  };
}


export function manualActorMovementBlockedByNhSequence(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState | null,
  combatState: RuntimePlayerCombatState,
  animationFixtures: NhAnimationFixtures | null,
): boolean {
  const activeSequence = manualActorActiveSequenceContext(actor, combatActor, combatState);
  const sequence = activeSequence ? animationFixtures?.sequences.get(activeSequence.sequenceName) : null;
  if (!activeSequence || !sequence) {
    return false;
  }
  if (
    actor.primaryFrame < 0 ||
    actor.primaryFrame >= sequence.frames.length
  ) {
    return false;
  }

  if (actor.routeWaypoints.length === 0) {
    return false;
  }
  return manualActorSequenceBlocksVisibleMovement(
    actor,
    activeSequence,
    combatActor,
    combatState,
    sequence
  );
}


export function manualActorSequenceBlocksVisibleMovement(
  actor: ManualActorState,
  activeSequence: { readonly key: string; readonly sequenceName: RuntimeSequenceName },
  combatActor: RuntimePlayerCombatActorState | null,
  combatState: RuntimePlayerCombatState,
  sequence: NhRenderSequenceDefinition
): boolean {
  return actor.sequencePathLengthAtStart > 0
    ? nhSequencePrecedenceAnimating(sequence) === 0
    : nhSequencePriority(sequence) === 0;
}


export function manualActorClientPathHeldByNhSequence(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState | null,
  combatState: RuntimePlayerCombatState,
  animationFixtures: NhAnimationFixtures | null
): boolean {
  const activeSequence = manualActorActiveSequenceContext(actor, combatActor, combatState);
  if (!activeSequence || actor.completedSequenceKey === activeSequence.key) {
    return false;
  }

  const sequence = animationFixtures?.sequences.get(activeSequence.sequenceName);
  if (!sequence) {
    return false;
  }

  // Source: client class329 stalls path consumption with field726 > 0 using
  // precedenceAnimating, otherwise priority. New movement packets should be
  // appended to the held client path, not replace that path from the latest click.
  return manualActorSequenceBlocksVisibleMovement(
    actor,
    activeSequence,
    combatActor,
    combatState,
    sequence
  );
}


export function advanceManualActorLogicalClientCycle(
  actor: ManualActorState,
  hasCombatTarget: boolean
): ManualActorState {
  const logicalClientPosition = manualActorRouteLogicalClientPosition(actor, actor.tile);
  if (actor.logicalRouteWaypoints.length === 0) {
    return {
      ...actor,
      logicalClientPosition
    };
  }

  const targetTile = actor.logicalRouteWaypoints[0];
  const targetPosition = nhClientPositionFromRuntimeTile(targetTile);
  const traversalMode = actor.logicalRouteTraversalModes[0] ?? (actor.running ? 2 : 1);
  const { speed } = nhManualMovementSpeedForPath(
    actor,
    actor.logicalRouteWaypoints.length,
    traversalMode,
    hasCombatTarget,
    0
  );
  const nextPosition = {
    x: nhMoveClientAxis(logicalClientPosition.x, targetPosition.x, speed),
    z: nhMoveClientAxis(logicalClientPosition.z, targetPosition.z, speed)
  };
  const reached = nextPosition.x === targetPosition.x && nextPosition.z === targetPosition.z;
  return {
    ...actor,
    logicalClientPosition: nextPosition,
    logicalRouteWaypoints: reached ? actor.logicalRouteWaypoints.slice(1) : actor.logicalRouteWaypoints,
    logicalRouteTraversalModes: reached ? actor.logicalRouteTraversalModes.slice(1) : actor.logicalRouteTraversalModes
  };
}


export function advanceManualActorClientCycle(
  actor: ManualActorState,
  _collision: NhSceneCollision,
  movementBlocked: boolean,
  targetActor: ManualActorState | null,
  hasCombatTarget: boolean,
  animationFixtures: NhAnimationFixtures | null,
  advanceLogical = true
): ManualActorState {
  const clientPosition = actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile);
  const logicalActor = advanceLogical ? advanceManualActorLogicalClientCycle(actor, hasCombatTarget) : actor;
  let currentActor: ManualActorState = {
    ...logicalActor,
    clientPosition,
    sequenceName: "idle"
  };
  if (actor.routeWaypoints.length === 0) {
    currentActor = {
      ...currentActor,
      tile: actor.tile,
      renderTile: runtimeTileFromNhClientPosition(clientPosition),
      clientPosition,
      routeTraversalModes: [],
      movementStallTicks: 0
    };
    const rotatedActor = rotateManualActorTowardNhOrientation(
      { ...currentActor, movementBlockedBySequence: false },
      targetActor,
      hasCombatTarget
    );
    return nhAdvanceMovementFrameCursor(rotatedActor, rotatedActor.sequenceName, animationFixtures);
  }

  if (movementBlocked) {
    currentActor = {
      ...currentActor,
      clientPosition,
      movementBlockedBySequence: true,
      // Source: class329.field687 is not capped; each blocked client cycle is drained by the catch-up speed rule.
      movementStallTicks: actor.movementStallTicks + 1
    };
    const rotatedActor = rotateManualActorTowardNhOrientation(currentActor, targetActor, hasCombatTarget);
    return nhAdvanceMovementFrameCursor(rotatedActor, rotatedActor.sequenceName, animationFixtures);
  }

  const targetTile = actor.routeWaypoints[0];
  const targetPosition = nhClientPositionFromRuntimeTile(targetTile);
  currentActor = {
    ...currentActor,
    orientationUnits: nhOrientationUnitsFromClientDelta(
      targetPosition.x - clientPosition.x,
      targetPosition.z - clientPosition.z,
      actor.orientationUnits
    )
  };
  if (
    Math.abs(targetPosition.x - clientPosition.x) > 256 ||
    Math.abs(targetPosition.z - clientPosition.z) > 256
  ) {
    const settlementWaypoints = nhClientSettlementWaypoints(clientPosition, targetTile);
    if (settlementWaypoints.length > 0) {
      // Source: client class329 only takes this snap branch when its path target is impossible.
      // Real server route packets keep the next path tile inside that window; if the trainer's
      // JS queue ever violates it, repair the generated route instead of presenting a teleport.
      const settlementTraversalMode = actor.routeTraversalModes[0] ?? (actor.running ? 2 : 1);
      const repairedRoute = compressManualActorTargetRouteClientPath(
        clientPosition,
        [...settlementWaypoints, ...actor.routeWaypoints.slice(1)],
        [
          ...Array.from({ length: settlementWaypoints.length }, () => settlementTraversalMode),
          ...actor.routeTraversalModes.slice(1)
        ]
      );
      const repairedTargetPosition = nhClientPositionFromRuntimeTile(repairedRoute.routeWaypoints[0]);
      // Trimming the fixed path buffer can discard the nearby repair steps.
      // Only retry a reachable first step; otherwise use class329's snap below.
      if (
        Math.abs(repairedTargetPosition.x - clientPosition.x) <= 256 &&
        Math.abs(repairedTargetPosition.z - clientPosition.z) <= 256
      ) {
        return advanceManualActorClientCycle(
          {
            ...currentActor,
            clientPosition,
            routeWaypoints: repairedRoute.routeWaypoints,
            routeTraversalModes: repairedRoute.routeTraversalModes
          },
          _collision,
          movementBlocked,
          targetActor,
          hasCombatTarget,
          animationFixtures,
          false
        );
      }
    }
    const routeWaypoints = actor.routeWaypoints.slice(1);
    const routeTraversalModes = actor.routeTraversalModes.slice(1);
    const renderTile = runtimeTileFromNhClientPosition(targetPosition);
    currentActor = {
      ...currentActor,
      tile: actor.tile,
      renderTile,
      clientPosition: targetPosition,
      routeWaypoints,
      routeTraversalModes,
      sequencePathLengthAtStart: Math.max(0, actor.sequencePathLengthAtStart - 1),
      movementBlockedBySequence: false,
      sequenceName: routeWaypoints.length > 0 ? actor.sequenceName : "idle"
    };
    // Source: TargetRoute.beforeMovement() only rewrites Movement steps; PlayerCombat.faceTarget()
    // is not applied continuously during the run-in. Keep movement-facing while consuming route steps.
    const rotatedActor = rotateManualActorTowardNhOrientation(currentActor, targetActor, false);
    return nhAdvanceMovementFrameCursor(rotatedActor, rotatedActor.sequenceName, animationFixtures);
  }

  const traversalMode = actor.routeTraversalModes[0] ?? (actor.running ? 2 : 1);
  const initialMovementSequenceName = nhMovementSequenceNameFromOrientation(currentActor);
  const { speed, movementStallTicks } = nhManualMovementSpeed(currentActor, traversalMode, hasCombatTarget);
  const movementSequenceName = nhMovementSequenceNameForSpeed(speed, initialMovementSequenceName);
  const nextPosition = {
    x: nhMoveClientAxis(clientPosition.x, targetPosition.x, speed),
    z: nhMoveClientAxis(clientPosition.z, targetPosition.z, speed)
  };
  const reached = nextPosition.x === targetPosition.x && nextPosition.z === targetPosition.z;
  const routeWaypoints = reached ? actor.routeWaypoints.slice(1) : actor.routeWaypoints;
  const routeTraversalModes = reached ? actor.routeTraversalModes.slice(1) : actor.routeTraversalModes;
  const renderTile = runtimeTileFromNhClientPosition(nextPosition);
  currentActor = {
    ...currentActor,
    tile: actor.tile,
    renderTile,
    clientPosition: nextPosition,
    routeWaypoints,
    routeTraversalModes,
    movementStallTicks,
    sequencePathLengthAtStart: reached ? Math.max(0, actor.sequencePathLengthAtStart - 1) : actor.sequencePathLengthAtStart,
    movementBlockedBySequence: false,
    sequenceName: movementSequenceName
  };
  // Source: TargetRoute.beforeMovement() queues the route; combat facing is separate from
  // route-facing until the actor is no longer consuming movement steps.
  const rotatedActor = rotateManualActorTowardNhOrientation(currentActor, targetActor, false);
  return nhAdvanceMovementFrameCursor(rotatedActor, rotatedActor.sequenceName, animationFixtures);
}


export function advanceManualActor(
  actor: ManualActorState,
  now: number,
  collision: NhSceneCollision,
  combatActor: RuntimePlayerCombatActorState | null = null,
  combatState: RuntimePlayerCombatState | null = null,
  animationFixtures: NhAnimationFixtures | null = null,
  targetActor: ManualActorState | null = null,
  maxClientCyclesToAdvance = Number.POSITIVE_INFINITY
): ManualActorState {
  const animationCycle = Math.floor(now / NH_CLIENT_CYCLE_MS);
  const clientPosition = actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile);
  let currentActor =
    combatActor && combatState
      ? syncManualActorActionSequence({ ...actor, clientPosition }, combatActor, combatState, targetActor)
      : { ...actor, clientPosition };
  if (actor.lastMovementClientCycle !== null && actor.lastMovementClientCycle > animationCycle) {
    // Source: scene clicks only send a movement packet; Player.method1100()
    // cannot expose the accepted path to class329 until the later player update.
    // Keep the future client-cycle gate even if only this actor has pending movement.
    return {
      ...currentActor,
      animationCycle,
      lastMovementClientCycle: actor.lastMovementClientCycle
    };
  }
  // Source: Client.vmethod1937() parses player updates before class329.method6315()
  // in the same Client.cycle. A newly accepted primary sequence can therefore
  // block or consume movement on that cycle; do not skip the class329 pass just
  // because LoginPacket.method3722 reset the sequence frame cursor.
  const previousCycle = actor.lastMovementClientCycle ?? animationCycle;
  const maxCycleCatchUp = Math.max(0, Math.trunc(maxClientCyclesToAdvance));
  const targetMovementCycle = Math.min(
    animationCycle,
    previousCycle + maxCycleCatchUp
  );

  for (let cycle = previousCycle + 1; cycle <= targetMovementCycle; cycle += 1) {
    const activeSequenceStartClientCycle = manualActorSequenceStartClientCycle(currentActor.activeSequenceKey);
    const sequenceAcceptedForCycle =
      activeSequenceStartClientCycle === null || cycle >= activeSequenceStartClientCycle;
    const hasClientTargetIndex = manualActorHasClientTargetIndex(currentActor, combatActor, cycle);
    const movementBlocked =
      sequenceAcceptedForCycle && combatActor && combatState
        ? manualActorMovementBlockedByNhSequence(currentActor, combatActor, combatState, animationFixtures)
        : false;
    currentActor = advanceManualActorClientCycle(
      currentActor,
      collision,
      movementBlocked,
      targetActor,
      hasClientTargetIndex,
      animationFixtures
    );
    if (sequenceAcceptedForCycle) {
      currentActor = nhAdvancePrimarySequenceCursor(currentActor, combatActor, combatState, animationFixtures);
    }
  }

  return {
    ...currentActor,
    animationCycle,
    lastMovementClientCycle: targetMovementCycle
  };
}


export function advanceManualActorBeforeAcceptedPlayerUpdate(input: {
  readonly actor: ManualActorState;
  readonly acceptedClientCycle: number;
  readonly collision: NhSceneCollision;
  readonly combatActor: RuntimePlayerCombatActorState | null;
  readonly combatState: RuntimePlayerCombatState | null;
  readonly animationFixtures: NhAnimationFixtures | null;
  readonly targetActor: ManualActorState | null;
}): ManualActorState {
  const updatePreviousCycle = Math.max(0, input.acceptedClientCycle - 1);
  const actorMovementCycle = input.actor.lastMovementClientCycle ?? updatePreviousCycle;
  if (actorMovementCycle >= updatePreviousCycle) {
    return input.actor;
  }

  let currentActor = input.combatActor && input.combatState
    ? syncManualActorActionSequence(
        {
          ...input.actor,
          clientPosition: input.actor.clientPosition ?? nhClientPositionFromRuntimeTile(input.actor.renderTile)
        },
        input.combatActor,
        input.combatState,
        input.targetActor
      )
    : input.actor;

  // Source: Client.vmethod1937() receives the player update after earlier
  // client cycles have already run class329.method6315(). That pass increments
  // field687 while a sequence blocks movement, but once the sequence no longer
  // blocks it consumes the same path before the next packet is accepted. Keep
  // the TypeScript pre-update catch-up as a full class329-style pass; equipment
  // appearance packets are handled separately and must not rewrite this cursor.
  for (let cycle = actorMovementCycle + 1; cycle <= updatePreviousCycle; cycle += 1) {
    const activeSequenceStartClientCycle = manualActorSequenceStartClientCycle(currentActor.activeSequenceKey);
    const sequenceAcceptedForCycle =
      activeSequenceStartClientCycle === null || cycle >= activeSequenceStartClientCycle;
    const hasClientTargetIndex = manualActorHasClientTargetIndex(
      currentActor,
      input.combatActor,
      cycle
    );
    const movementBlocked =
      sequenceAcceptedForCycle &&
      input.combatActor !== null &&
      input.combatState !== null
        ? manualActorMovementBlockedByNhSequence(
            currentActor,
            input.combatActor,
            input.combatState,
            input.animationFixtures
          )
        : false;
    currentActor = advanceManualActorClientCycle(
      currentActor,
      input.collision,
      movementBlocked,
      input.targetActor,
      hasClientTargetIndex,
      input.animationFixtures
    );
    if (sequenceAcceptedForCycle) {
      currentActor = nhAdvancePrimarySequenceCursor(
        currentActor,
        input.combatActor,
        input.combatState,
        input.animationFixtures
      );
    }
  }

  return {
    ...currentActor,
    animationCycle: updatePreviousCycle,
    lastMovementClientCycle: updatePreviousCycle
  };
}
