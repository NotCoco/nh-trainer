import type { RuntimeActorId, RuntimeSceneSnapshot } from "../render/runtimeScene";
import type { RunelitePlayerIndicatorsConfigSnapshot } from "./RuneliteClientShell";

export type RunelitePlayerIndicatorRelation = "SELF" | "TARGET" | "OTHER";
export type RunelitePlayerIndicationLocation = "ABOVE_HEAD" | "HULL" | "MINIMAP" | "MENU" | "TILE";

export const RUNELITE_PLAYER_INDICATORS_ACTOR_OVERHEAD_TEXT_MARGIN = 40;
export const RUNELITE_PLAYER_INDICATORS_ACTOR_HORIZONTAL_TEXT_MARGIN = 10;
export const RUNELITE_PLAYER_INDICATORS_DEFAULT_LOCATIONS: readonly RunelitePlayerIndicationLocation[] = [
  "ABOVE_HEAD",
  "MINIMAP",
  "MENU",
  "TILE"
];
export const RUNELITE_PLAYER_INDICATORS_SELF_COLOR = "#00b8d4";
export const RUNELITE_PLAYER_INDICATORS_TARGET_COLOR = "#136ef7";
export const RUNELITE_PLAYER_INDICATORS_OTHER_COLOR = "#ff0000";
export const RUNELITE_PLAYER_INDICATORS_COMBAT_LEVEL = 126;

export interface RunelitePlayerIndicatorSnapshot {
  readonly actorId: RuntimeActorId;
  readonly relation: RunelitePlayerIndicatorRelation;
  readonly name: string;
  readonly label: string;
  readonly color: string;
  readonly locations: readonly RunelitePlayerIndicationLocation[];
}

export function runelitePlayerIndicatorSnapshots(
  snapshot: RuntimeSceneSnapshot,
  config: RunelitePlayerIndicatorsConfigSnapshot
): readonly RunelitePlayerIndicatorSnapshot[] {
  if (!config.enabled || !runelitePlayerIndicatorsAnyHighlightEnabled(config)) {
    return [];
  }

  const indicators: RunelitePlayerIndicatorSnapshot[] = [];
  const local = snapshot.actors.find((actor) => actor.actorId === "local-player") ?? null;
  const opponent = snapshot.actors.find((actor) => actor.actorId === "opponent") ?? null;

  if (local && config.highlightOwnPlayer) {
    indicators.push(
      runelitePlayerIndicatorSnapshot({
        actorId: "local-player",
        relation: "SELF",
        name: "local-player",
        color: config.ownPlayerColor,
        showCombatLevel: false
      })
    );
  }

  if (opponent && config.highlightTargets) {
    indicators.push(
      runelitePlayerIndicatorSnapshot({
        actorId: "opponent",
        relation: "TARGET",
        name: "Opponent",
        color: config.targetColor,
        showCombatLevel: config.showCombatLevel
      })
    );
  } else if (opponent && config.highlightOtherPlayers) {
    indicators.push(
      runelitePlayerIndicatorSnapshot({
        actorId: "opponent",
        relation: "OTHER",
        name: "Opponent",
        color: config.otherPlayerColor,
        showCombatLevel: false
      })
    );
  }

  return indicators;
}

function runelitePlayerIndicatorsAnyHighlightEnabled(config: RunelitePlayerIndicatorsConfigSnapshot): boolean {
  return config.highlightOwnPlayer || config.highlightTargets || config.highlightOtherPlayers;
}

function runelitePlayerIndicatorSnapshot(input: {
  readonly actorId: RuntimeActorId;
  readonly relation: RunelitePlayerIndicatorRelation;
  readonly name: string;
  readonly color: string;
  readonly showCombatLevel: boolean;
}): RunelitePlayerIndicatorSnapshot {
  const label = input.showCombatLevel ? `${input.name} (${RUNELITE_PLAYER_INDICATORS_COMBAT_LEVEL})` : input.name;
  return {
    actorId: input.actorId,
    relation: input.relation,
    name: input.name,
    label,
    color: input.color,
    locations: RUNELITE_PLAYER_INDICATORS_DEFAULT_LOCATIONS
  };
}
