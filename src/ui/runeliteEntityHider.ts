import type { RuntimeActorId, RuntimeActorPose, RuntimeRenderEvent, RuntimeSceneSnapshot } from "../render/runtimeScene";
import type { RuneliteEntityHiderConfigSnapshot } from "./RuneliteClientShell";

export const RUNELITE_ENTITY_HIDER_CONFIG_GROUP = "entityhider";
export const RUNELITE_ENTITY_HIDER_CASTLE_WARS_REGION_ID = 9520;
export const RUNELITE_ENTITY_HIDER_SOURCE_UPDATE_CONFIG = "client.setPlayersHidden(config.hidePlayers()) client.setPlayersHidden2D(config.hidePlayers2D()) client.setProjectilesHidden(config.hideProjectiles())";
export const RUNELITE_ENTITY_HIDER_SOURCE_CSV = "Text.fromCSV(config.hideSpecificPlayers())";

export function runeliteEntityHiderActorVisible(
  pose: Pick<RuntimeActorPose, "actorId" | "markerLabel">,
  config: RuneliteEntityHiderConfigSnapshot
): boolean {
  if (!config.enabled || !config.isHidingEntities) {
    return true;
  }

  if (pose.actorId === "local-player") {
    return !config.hideLocalPlayer;
  }

  if (config.hidePlayers || runeliteEntityHiderSpecificPlayerHidden(pose, config)) {
    return false;
  }

  return true;
}

export function runeliteEntityHiderActor2dVisible(
  pose: Pick<RuntimeActorPose, "actorId" | "markerLabel">,
  config: RuneliteEntityHiderConfigSnapshot
): boolean {
  if (!config.enabled || !config.isHidingEntities) {
    return true;
  }

  if (pose.actorId === "local-player") {
    return !config.hideLocalPlayer2D;
  }

  if (config.hidePlayers2D || runeliteEntityHiderSpecificPlayerHidden(pose, config)) {
    return false;
  }

  return true;
}

export function runeliteEntityHiderRuntimeEventVisible(
  event: RuntimeRenderEvent,
  snapshot: RuntimeSceneSnapshot,
  config: RuneliteEntityHiderConfigSnapshot
): boolean {
  if (!config.enabled || !config.isHidingEntities) {
    return true;
  }

  if (event.kind === "projectile" && config.hideProjectiles) {
    return false;
  }

  if (event.actorId) {
    const pose = runeliteEntityHiderPose(snapshot, event.actorId);
    if (pose) {
      if (event.kind === "overlay-sprite" && !runeliteEntityHiderActor2dVisible(pose, config)) {
        return false;
      }
      if (event.kind === "spotanim" && !runeliteEntityHiderActorVisible(pose, config)) {
        return false;
      }
    }
  }

  return true;
}

export function runeliteEntityHiderFilterRuntimeEvents(
  events: readonly RuntimeRenderEvent[],
  snapshot: RuntimeSceneSnapshot,
  config: RuneliteEntityHiderConfigSnapshot
): readonly RuntimeRenderEvent[] {
  return events.filter((event) => runeliteEntityHiderRuntimeEventVisible(event, snapshot, config));
}

export function runeliteEntityHiderActorId2dVisible(
  actorId: RuntimeActorId,
  snapshot: RuntimeSceneSnapshot,
  config: RuneliteEntityHiderConfigSnapshot
): boolean {
  const pose = runeliteEntityHiderPose(snapshot, actorId);
  return pose ? runeliteEntityHiderActor2dVisible(pose, config) : true;
}

function runeliteEntityHiderPose(snapshot: RuntimeSceneSnapshot, actorId: RuntimeActorId): RuntimeActorPose | null {
  return snapshot.actors.find((pose) => pose.actorId === actorId) ?? null;
}

function runeliteEntityHiderSpecificPlayerHidden(
  pose: Pick<RuntimeActorPose, "actorId" | "markerLabel">,
  config: RuneliteEntityHiderConfigSnapshot
): boolean {
  const hiddenPlayers = runeliteEntityHiderCsv(config.hideSpecificPlayers);
  if (hiddenPlayers.length === 0) {
    return false;
  }

  const labels = new Set([pose.actorId, pose.markerLabel].map((label) => label.trim().toLowerCase()));
  return hiddenPlayers.some((name) => labels.has(name));
}

function runeliteEntityHiderCsv(value: string): readonly string[] {
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}
