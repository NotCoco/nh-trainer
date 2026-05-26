import type { VisibleAnimationIds } from "../sim";
import type { RuntimeSequenceName } from "./runtimeScene";
import { type KronosSequencePlaybackMode } from "./kronosSequencePlayback";

export interface KronosResolvedActorSequence {
  readonly sequenceName: RuntimeSequenceName;
  readonly playbackMode: KronosSequencePlaybackMode;
  readonly poseSequenceName?: RuntimeSequenceName;
  readonly movementSequenceName?: RuntimeSequenceName;
  readonly actionSequenceName?: RuntimeSequenceName;
}

export type KronosActorSequenceDefinitionStore = ReadonlyMap<number, RuntimeSequenceName>;

const defaultActorSequenceDefinitions: KronosActorSequenceDefinitionStore = new Map<number, RuntimeSequenceName>([
  [808, "idle"],
  [823, "turn"],
  [813, "wand_ready"],
  [1209, "wand_turn"],
  [1205, "wand_walk"],
  [1206, "wand_walk_back"],
  [1207, "wand_walk_left"],
  [1208, "wand_walk_right"],
  [1210, "wand_run"],
  [819, "walk"],
  [820, "walk_back"],
  [821, "walk_left"],
  [822, "walk_right"],
  [824, "run"],
  [829, "consume"],
  [393, "wand_attack"],
  [1662, "gmaul_ready"],
  [1663, "gmaul_walk"],
  [1664, "gmaul_run"],
  [1660, "whip_walk"],
  [1661, "whip_run"],
  [1658, "whip_attack"],
  [1665, "gmaul_attack"],
  [1667, "gmaul_special"],
  [7053, "godsword_ready"],
  [7044, "godsword_turn"],
  [7052, "godsword_walk"],
  [7048, "godsword_walk_back"],
  [7047, "godsword_walk_right"],
  [7043, "godsword_run"],
  [7045, "godsword_attack"],
  [7644, "ags_special"],
  [1978, "blitz_cast"],
  [1979, "barrage_cast"],
  [4591, "crossbow_ready"],
  [4227, "crossbow_walk_back"],
  [4226, "crossbow_walk"],
  [4228, "crossbow_run"],
  [4230, "crossbow_attack"]
]);

export function createKronosActorSequenceDefinitionStore(source: unknown): KronosActorSequenceDefinitionStore {
  const store = new Map<number, RuntimeSequenceName>();
  for (const entry of actorSequenceSourceEntries(source)) {
    const definition = normalizeActorSequenceDefinition(entry);
    if (definition) {
      if (!store.has(definition.sequenceId)) {
        store.set(definition.sequenceId, definition.name);
      }
    }
  }
  return store.size > 0 ? store : defaultActorSequenceDefinitions;
}

export function kronosRuntimeSequenceNameForId(
  sequenceId: number | undefined,
  definitions: KronosActorSequenceDefinitionStore = defaultActorSequenceDefinitions
): RuntimeSequenceName | undefined {
  return sequenceId === undefined ? undefined : definitions.get(sequenceId);
}

export function resolveKronosActorSequence(
  animations: VisibleAnimationIds,
  definitions: KronosActorSequenceDefinitionStore = defaultActorSequenceDefinitions
): KronosResolvedActorSequence {
  const poseSequenceName = kronosRuntimeSequenceNameForId(animations.pose, definitions);
  const movementSequenceName = kronosRuntimeSequenceNameForId(animations.movement, definitions);
  const actionSequenceName = kronosRuntimeSequenceNameForId(animations.action, definitions);
  const movementCanDriveModel =
    movementSequenceName !== undefined && (movementSequenceName !== poseSequenceName || actionSequenceName === undefined);
  const sequenceName = actionSequenceName ?? (movementCanDriveModel ? movementSequenceName : undefined) ?? poseSequenceName ?? "idle";

  return {
    sequenceName,
    playbackMode: actionSequenceName ? "primary" : "loop",
    poseSequenceName,
    movementSequenceName,
    actionSequenceName
  };
}

function actorSequenceSourceEntries(source: unknown): readonly unknown[] {
  if (Array.isArray(source)) {
    return source;
  }
  if (!source || typeof source !== "object") {
    return [];
  }
  return Object.values(source);
}

function normalizeActorSequenceDefinition(source: unknown): { readonly sequenceId: number; readonly name: RuntimeSequenceName } | null {
  if (!source || typeof source !== "object") {
    return null;
  }
  const record = source as Record<string, unknown>;
  const sequenceId = integerField(record.sequenceId);
  const name = runtimeSequenceNameField(record.name);
  return sequenceId === undefined || name === undefined ? null : { sequenceId, name };
}

function integerField(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return undefined;
}

function runtimeSequenceNameField(value: unknown): RuntimeSequenceName | undefined {
  return value === "idle" ||
    value === "turn" ||
    value === "walk_back" ||
    value === "walk_left" ||
    value === "walk_right" ||
    value === "wand_ready" ||
    value === "wand_turn" ||
    value === "wand_walk" ||
    value === "wand_walk_back" ||
    value === "wand_walk_left" ||
    value === "wand_walk_right" ||
    value === "wand_run" ||
    value === "crossbow_ready" ||
    value === "crossbow_turn" ||
    value === "crossbow_walk" ||
    value === "crossbow_walk_back" ||
    value === "crossbow_walk_left" ||
    value === "crossbow_walk_right" ||
    value === "crossbow_run" ||
    value === "gmaul_ready" ||
    value === "gmaul_turn" ||
    value === "gmaul_walk" ||
    value === "gmaul_walk_back" ||
    value === "gmaul_walk_left" ||
    value === "gmaul_walk_right" ||
    value === "gmaul_run" ||
    value === "godsword_ready" ||
    value === "godsword_turn" ||
    value === "godsword_walk" ||
    value === "godsword_walk_back" ||
    value === "godsword_walk_left" ||
    value === "godsword_walk_right" ||
    value === "godsword_run" ||
    value === "whip_turn" ||
    value === "whip_walk" ||
    value === "whip_walk_back" ||
    value === "whip_walk_left" ||
    value === "whip_walk_right" ||
    value === "whip_run" ||
    value === "walk" ||
    value === "run" ||
    value === "consume" ||
    value === "wand_attack" ||
    value === "whip_attack" ||
    value === "godsword_attack" ||
    value === "ags_special" ||
    value === "gmaul_attack" ||
    value === "gmaul_special" ||
    value === "crossbow_attack" ||
    value === "blitz_cast" ||
    value === "barrage_cast"
    ? value
    : undefined;
}
