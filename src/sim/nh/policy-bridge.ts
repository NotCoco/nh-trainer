import type { PrayerId } from "../prayer/prayers";

export type NhOffenceStyle = "magic" | "ranged" | "melee";
export type NhMovementIntent =
  | "pressure"
  | "stand_under"
  | "step_out"
  | "step_north"
  | "step_south"
  | "step_east"
  | "step_west"
  | "step_north_east"
  | "step_north_west"
  | "step_south_east"
  | "step_south_west";
export type NhSupplyIntent =
  | "none"
  | "safe_eat"
  | "double_eat"
  | "triple_eat"
  | "brew_only"
  | "restore_reboost"
  | "panic_full"
  | "offence_strip_one"
  | "offence_strip_two"
  | "regear_style";
export type NhSpecIntent = "none" | "use_special" | "use_special_double";

export interface NhPolicyAction {
  readonly offenceStyle: NhOffenceStyle;
  readonly defencePrayer: PrayerId;
  readonly movementIntent: NhMovementIntent;
  readonly supplyIntent: NhSupplyIntent;
  readonly specIntent: NhSpecIntent;
  readonly extendedSupplyAction: boolean;
}

export const nhPolicyInputSize = 77;
export const nhPolicyReservoirSize = 48;

// Keep these arrays in lockstep with Java NhStakerSelfPlayPolicyBridge; trained policy action ids depend on the order.
export const nhOffenceStyles = ["magic", "ranged", "melee"] as const;
export const nhDefencePrayers = [
  "protect_from_magic",
  "protect_from_missiles",
  "protect_from_melee",
  "smite",
  "redemption"
] as const satisfies readonly PrayerId[];
export const nhMovementIntents = [
  "pressure",
  "stand_under",
  "step_out",
  "step_north",
  "step_south",
  "step_east",
  "step_west",
  "step_north_east",
  "step_north_west",
  "step_south_east",
  "step_south_west"
] as const;
export const nhSupplyIntents = [
  "none",
  "safe_eat",
  "double_eat",
  "triple_eat",
  "brew_only",
  "restore_reboost",
  "panic_full"
] as const;
export const nhExtraSupplyIntents = ["offence_strip_one", "offence_strip_two", "regear_style"] as const;
export const nhSpecIntents = ["none", "use_special", "use_special_double"] as const;

export const nhBaseActionCount =
  nhOffenceStyles.length * nhDefencePrayers.length * nhMovementIntents.length * nhSupplyIntents.length;
export const nhExtraBaseActionCount =
  nhOffenceStyles.length * nhDefencePrayers.length * nhMovementIntents.length * nhExtraSupplyIntents.length;
export const nhLegacyActionCount = nhBaseActionCount * nhSpecIntents.length;
export const nhPolicyActionCount = nhLegacyActionCount + nhExtraBaseActionCount * nhSpecIntents.length;
export const nhPolicyFeatureSize = nhPolicyReservoirSize + nhPolicyInputSize + 1;

export function decodeNhPolicyAction(action: number): NhPolicyAction {
  const normalizedAction = clampInt(action, 0, nhPolicyActionCount - 1);
  const extendedSupplyAction = normalizedAction >= nhLegacyActionCount;
  const baseAction = extendedSupplyAction
    ? (normalizedAction - nhLegacyActionCount) % nhExtraBaseActionCount
    : normalizedAction % nhBaseActionCount;
  const specIndex = extendedSupplyAction
    ? Math.floor((normalizedAction - nhLegacyActionCount) / nhExtraBaseActionCount)
    : Math.floor(normalizedAction / nhBaseActionCount);
  const supplyPool = extendedSupplyAction ? nhExtraSupplyIntents : nhSupplyIntents;

  const supplyIndex = baseAction % supplyPool.length;
  const movementIndex = Math.floor(baseAction / supplyPool.length) % nhMovementIntents.length;
  const defenceIndex =
    Math.floor(baseAction / (supplyPool.length * nhMovementIntents.length)) % nhDefencePrayers.length;
  const styleIndex =
    Math.floor(baseAction / (supplyPool.length * nhMovementIntents.length * nhDefencePrayers.length)) %
    nhOffenceStyles.length;

  return {
    offenceStyle: nhOffenceStyles[styleIndex],
    defencePrayer: nhDefencePrayers[defenceIndex],
    movementIntent: nhMovementIntents[movementIndex],
    supplyIntent: supplyPool[supplyIndex],
    specIntent: nhSpecIntents[clampInt(specIndex, 0, nhSpecIntents.length - 1)],
    extendedSupplyAction
  };
}

export function encodeNhPolicyAction(action: NhPolicyAction): number {
  const styleIndex = indexOfOrZero(nhOffenceStyles, action.offenceStyle);
  const defenceIndex = indexOfOrZero(nhDefencePrayers, action.defencePrayer);
  const movementIndex = indexOfOrZero(nhMovementIntents, action.movementIntent);
  const specIndex = indexOfOrZero(nhSpecIntents, action.specIntent);
  const supplyPool = action.extendedSupplyAction ? nhExtraSupplyIntents : nhSupplyIntents;
  const supplyIndex = indexOfOrZero(supplyPool, action.supplyIntent as (typeof supplyPool)[number]);

  const baseAction =
    (((styleIndex * nhDefencePrayers.length + defenceIndex) * nhMovementIntents.length + movementIndex) *
      supplyPool.length) +
    supplyIndex;

  return action.extendedSupplyAction
    ? nhLegacyActionCount + specIndex * nhExtraBaseActionCount + baseAction
    : specIndex * nhBaseActionCount + baseAction;
}

export function assertNhPolicyShape(inputSize: number, actionCount: number): void {
  if (inputSize !== nhPolicyInputSize) {
    throw new Error(`NH policy input size mismatch: expected ${nhPolicyInputSize}, got ${inputSize}`);
  }
  if (actionCount !== nhPolicyActionCount) {
    throw new Error(`NH policy action count mismatch: expected ${nhPolicyActionCount}, got ${actionCount}`);
  }
}

function indexOfOrZero<T extends string>(values: readonly T[], value: T): number {
  const index = values.indexOf(value);
  return index === -1 ? 0 : index;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
