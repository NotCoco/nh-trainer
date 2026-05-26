import type { RuntimeActorId, RuntimeActorPose, RuntimeSceneSnapshot } from "../render/runtimeScene";
import type { RuntimePlayerCombatEvent, RuntimePlayerCombatState } from "../sim/runtimePlayerCombat";
import type { RuneliteHideUnderConfigSnapshot } from "./RuneliteClientShell";

export const RUNELITE_HIDE_UNDER_PLUGIN_ID = "hide-under";
export const RUNELITE_HIDE_UNDER_TARGET_TIMER_TICKS = 16;
export const RUNELITE_HIDE_UNDER_CASTLE_WARS_REGION_ID = 9520;
export const RUNELITE_HIDE_UNDER_SOURCE_DESCRIPTOR =
  'HideUnder @PluginDescriptor(name = "Hide Under", description = "Hide local player when under targeted players", type = PluginType.PVP, enabledByDefault = false)';
export const RUNELITE_HIDE_UNDER_SOURCE_TARGET_TIMER =
  "onInteractingChanged/onAnimationChanged PlayerContainer.setTimer(16); onGameTick decrement else target=false";
export const RUNELITE_HIDE_UNDER_SOURCE_LOCAL_VISIBILITY =
  "onGameTick client.setLocalPlayerHidden(false); same targeted WorldPoint distanceTo(lp)==0 -> client.setLocalPlayerHidden(true)";
export const RUNELITE_HIDE_UNDER_SOURCE_REGION_GUARD =
  "onGameStateChanged client.setIsHidingEntities(isPlayerRegionAllowed()); Castle Wars region 9520 disabled";

export function runeliteHideUnderActorVisible(
  pose: RuntimeActorPose,
  snapshot: RuntimeSceneSnapshot,
  combatState: RuntimePlayerCombatState,
  config: RuneliteHideUnderConfigSnapshot
): boolean {
  if (runeliteLocalPlayerSceneModelCullsActor(pose, snapshot, combatState, config)) {
    return false;
  }

  if (pose.actorId !== "local-player") {
    return true;
  }

  return !runeliteHideUnderLocalPlayerHidden(snapshot, combatState, config);
}

export function runeliteHideUnderLocalPlayerHidden(
  snapshot: RuntimeSceneSnapshot,
  combatState: RuntimePlayerCombatState,
  config: RuneliteHideUnderConfigSnapshot
): boolean {
  if (!config.enabled || !config.isHidingEntities || !config.inAllowedRegion) {
    return false;
  }

  const localPlayer = snapshot.actors.find((actor) => actor.actorId === "local-player");
  if (!localPlayer) {
    return false;
  }

  return snapshot.actors.some(
    (actor) =>
      actor.actorId !== "local-player" &&
      sameRuneliteHideUnderTile(actor, localPlayer) &&
      runeliteHideUnderTargetedRecently(actor.actorId, combatState, config.targetTimerTicks)
  );
}

function runeliteHideUnderTargetedRecently(
  actorId: RuntimeActorId,
  combatState: RuntimePlayerCombatState,
  targetTimerTicks: number
): boolean {
  const local = combatState.actors["local-player"];
  const other = combatState.actors[actorId];
  if (!other) {
    return false;
  }

  if (local.targetId === actorId || other.targetId === "local-player") {
    return true;
  }

  if (local.lastTargetId === actorId || other.lastTargetId === "local-player") {
    return true;
  }

  const lowerBoundTick = combatState.tick - Math.max(0, Math.trunc(targetTimerTicks));
  return combatState.events.some((event) => runeliteHideUnderEventTargetsLocalAndActor(event, actorId, lowerBoundTick));
}

function runeliteHideUnderEventTargetsLocalAndActor(
  event: RuntimePlayerCombatEvent,
  actorId: RuntimeActorId,
  lowerBoundTick: number
): boolean {
  if (event.tick < lowerBoundTick) {
    return false;
  }

  if (event.kind === "attack" || event.kind === "hitsplat") {
    const targetActorId = event.kind === "attack" ? event.defenderId : event.targetActorId;
    return (
      (event.attackerId === "local-player" && targetActorId === actorId) ||
      (event.attackerId === actorId && targetActorId === "local-player")
    );
  }

  return false;
}

function sameRuneliteHideUnderTile(left: RuntimeActorPose, right: RuntimeActorPose): boolean {
  return left.tile.x === right.tile.x && left.tile.z === right.tile.z;
}

function runeliteLocalPlayerSceneModelCullsActor(
  pose: RuntimeActorPose,
  snapshot: RuntimeSceneSnapshot,
  combatState: RuntimePlayerCombatState,
  config: RuneliteHideUnderConfigSnapshot
): boolean {
  if (pose.actorId === "local-player") {
    return false;
  }

  const localPlayer = snapshot.actors.find((actor) => actor.actorId === "local-player");
  if (!localPlayer || runeliteHideUnderLocalPlayerHidden(snapshot, combatState, config)) {
    return false;
  }

  if (!runeliteLocalPlayerHasCombatTargetPriority(pose.actorId, combatState)) {
    return false;
  }

  // Source: ViewportMouse.method2303() draws the local player before Client.combatTargetPlayerIndex,
  // and Players.method2146() uses Client.tileLastDrawnActor when both size-1 actors are centered
  // on the same scene tile. The 3D model is culled, while 2D overheads still render separately.
  return (
    sameRuneliteHideUnderTile(pose, localPlayer) &&
    runtimePoseCenteredOnServerTile(pose) &&
    runtimePoseCenteredOnServerTile(localPlayer)
  );
}

function runeliteLocalPlayerHasCombatTargetPriority(
  actorId: RuntimeActorId,
  combatState: RuntimePlayerCombatState
): boolean {
  const local = combatState.actors["local-player"];
  const other = combatState.actors[actorId];
  return (
    local.targetId === actorId ||
    local.lastTargetId === actorId ||
    other?.targetId === "local-player" ||
    other?.lastTargetId === "local-player"
  );
}

function runtimePoseCenteredOnServerTile(pose: RuntimeActorPose): boolean {
  const renderTile = pose.renderTile ?? pose.tile;
  return renderTile.x === pose.tile.x && renderTile.z === pose.tile.z;
}
