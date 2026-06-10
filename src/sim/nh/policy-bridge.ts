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
export type NhAttackIntent = "attack" | "hold" | "off_tick";
export type NhEquipmentIntent =
  | "style_loadout"
  | "weapon_only"
  | "unequip_feet"
  | "unequip_head"
  | "unequip_cape"
  | "unequip_amulet"
  | "unequip_body"
  | "unequip_shield"
  | "unequip_legs"
  | "unequip_hands"
  | "unequip_ring";

export interface NhPolicyAction {
  readonly offenceStyle: NhOffenceStyle;
  readonly defencePrayer: PrayerId;
  readonly movementIntent: NhMovementIntent;
  readonly supplyIntent: NhSupplyIntent;
  readonly specIntent: NhSpecIntent;
  readonly extendedSupplyAction: boolean;
  readonly attackIntent?: NhAttackIntent;
  readonly equipmentIntent?: NhEquipmentIntent;
}

export const nhPolicyLegacyV12InputSize = 86;
export const nhPolicyPreviousInputSize = 90;
export const nhPolicyInputSize = 92;
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
export const nhAttackIntents = ["attack", "hold", "off_tick"] as const;
export const nhEquipmentIntents = [
  "style_loadout",
  "weapon_only",
  "unequip_feet",
  "unequip_head",
  "unequip_cape",
  "unequip_amulet",
  "unequip_body",
  "unequip_shield",
  "unequip_legs",
  "unequip_hands",
  "unequip_ring"
] as const;

export const nhBaseActionCount =
  nhOffenceStyles.length * nhDefencePrayers.length * nhMovementIntents.length * nhSupplyIntents.length;
export const nhExtraBaseActionCount =
  nhOffenceStyles.length * nhDefencePrayers.length * nhMovementIntents.length * nhExtraSupplyIntents.length;
export const nhLegacyActionCount = nhBaseActionCount * nhSpecIntents.length;
export const nhExtendedSupplyActionCount = nhExtraBaseActionCount * nhSpecIntents.length;
export const nhPolicyV1ActionCount = nhLegacyActionCount + nhExtendedSupplyActionCount;
export const nhPolicyActionCount = nhPolicyV1ActionCount * nhAttackIntents.length * nhEquipmentIntents.length;
export const nhPolicyPreviousFeatureSize = nhPolicyReservoirSize + nhPolicyPreviousInputSize + 1;
export const nhPolicyFeatureSize = nhPolicyReservoirSize + nhPolicyInputSize + 1;

export function decodeNhPolicyAction(action: number): NhPolicyAction {
  const normalizedAction = clampInt(action, 0, nhPolicyActionCount - 1);
  const legacyAction = normalizedAction % nhPolicyV1ActionCount;
  const variantIndex = Math.floor(normalizedAction / nhPolicyV1ActionCount);
  const attackIndex = variantIndex % nhAttackIntents.length;
  const equipmentIndex = Math.floor(variantIndex / nhAttackIntents.length) % nhEquipmentIntents.length;
  const extendedSupplyAction = legacyAction >= nhLegacyActionCount;
  const baseAction = extendedSupplyAction
    ? (legacyAction - nhLegacyActionCount) % nhExtraBaseActionCount
    : legacyAction % nhBaseActionCount;
  const specIndex = extendedSupplyAction
    ? Math.floor((legacyAction - nhLegacyActionCount) / nhExtraBaseActionCount)
    : Math.floor(legacyAction / nhBaseActionCount);
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
    extendedSupplyAction,
    attackIntent: nhAttackIntents[attackIndex],
    equipmentIntent: nhEquipmentIntents[equipmentIndex]
  };
}

export function encodeNhPolicyAction(action: NhPolicyAction): number {
  const styleIndex = indexOfOrZero(nhOffenceStyles, action.offenceStyle);
  const defenceIndex = indexOfOrZero(nhDefencePrayers, action.defencePrayer);
  const movementIndex = indexOfOrZero(nhMovementIntents, action.movementIntent);
  const specIndex = indexOfOrZero(nhSpecIntents, action.specIntent);
  const attackIndex = indexOfOrZero(nhAttackIntents, action.attackIntent ?? "attack");
  const equipmentIndex = indexOfOrZero(nhEquipmentIntents, action.equipmentIntent ?? "style_loadout");
  const supplyPool = action.extendedSupplyAction ? nhExtraSupplyIntents : nhSupplyIntents;
  const supplyIndex = indexOfOrZero(supplyPool, action.supplyIntent as (typeof supplyPool)[number]);

  const baseAction =
    (((styleIndex * nhDefencePrayers.length + defenceIndex) * nhMovementIntents.length + movementIndex) *
      supplyPool.length) +
    supplyIndex;

  const legacyAction = action.extendedSupplyAction
    ? nhLegacyActionCount + specIndex * nhExtraBaseActionCount + baseAction
    : specIndex * nhBaseActionCount + baseAction;
  return (equipmentIndex * nhAttackIntents.length + attackIndex) * nhPolicyV1ActionCount + legacyAction;
}

export function assertNhPolicyShape(inputSize: number, actionCount: number): void {
  if (inputSize !== nhPolicyInputSize) {
    throw new Error(`NH policy input size mismatch: expected ${nhPolicyInputSize}, got ${inputSize}`);
  }
  if (actionCount !== nhPolicyActionCount && actionCount !== nhPolicyV1ActionCount) {
    throw new Error(`NH policy action count mismatch: expected ${nhPolicyActionCount} or legacy ${nhPolicyV1ActionCount}, got ${actionCount}`);
  }
}

function indexOfOrZero<T extends string>(values: readonly T[], value: T): number {
  const index = values.indexOf(value);
  return index === -1 ? 0 : index;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
