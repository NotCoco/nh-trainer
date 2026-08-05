import type { PrayerId } from "../prayer/prayers";

export const nhMovementIntents = [
  "none",
  "stand_under",
  "move_w2_s2",
  "move_w1_s2",
  "move_s2",
  "move_e1_s2",
  "move_e2_s2",
  "move_w2_s1",
  "move_w1_s1",
  "move_s1",
  "move_e1_s1",
  "move_e2_s1",
  "move_w2",
  "move_w1",
  "move_e1",
  "move_e2",
  "move_w2_n1",
  "move_w1_n1",
  "move_n1",
  "move_e1_n1",
  "move_e2_n1",
  "move_w2_n2",
  "move_w1_n2",
  "move_n2",
  "move_e1_n2",
  "move_e2_n2"
] as const;

export const nhDeployedLegacyMovementIntents = [
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

export type NhCurrentMovementIntent = (typeof nhMovementIntents)[number];
export type NhDeployedLegacyMovementIntent = (typeof nhDeployedLegacyMovementIntents)[number];
export type NhMovementIntent = NhCurrentMovementIntent | NhDeployedLegacyMovementIntent;

export const nhMovementDeltas = {
  none: [0, 0],
  stand_under: [0, 0],
  pressure: [0, 0],
  step_out: [0, 0],
  step_north: [0, 1],
  step_south: [0, -1],
  step_east: [1, 0],
  step_west: [-1, 0],
  step_north_east: [1, 1],
  step_north_west: [-1, 1],
  step_south_east: [1, -1],
  step_south_west: [-1, -1],
  move_w2_s2: [-2, -2],
  move_w1_s2: [-1, -2],
  move_s2: [0, -2],
  move_e1_s2: [1, -2],
  move_e2_s2: [2, -2],
  move_w2_s1: [-2, -1],
  move_w1_s1: [-1, -1],
  move_s1: [0, -1],
  move_e1_s1: [1, -1],
  move_e2_s1: [2, -1],
  move_w2: [-2, 0],
  move_w1: [-1, 0],
  move_e1: [1, 0],
  move_e2: [2, 0],
  move_w2_n1: [-2, 1],
  move_w1_n1: [-1, 1],
  move_n1: [0, 1],
  move_e1_n1: [1, 1],
  move_e2_n1: [2, 1],
  move_w2_n2: [-2, 2],
  move_w1_n2: [-1, 2],
  move_n2: [0, 2],
  move_e1_n2: [1, 2],
  move_e2_n2: [2, 2]
} as const satisfies Record<NhMovementIntent, readonly [number, number]>;

export type NhOffenceStyle = "magic" | "ranged" | "melee";
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
  | "regear_style"
  | "vengeance_trinket";
export type NhLegacySpecIntent = "none" | "use_special" | "use_special_double";
export type NhExplicitSpecIntent =
  | "spec_granite_maul"
  | "spec_granite_maul_double"
  | "spec_armadyl_godsword"
  | "spec_voidwaker"
  | "spec_vesta_longsword";
export type NhSpecIntent = NhLegacySpecIntent | NhExplicitSpecIntent;
export type NhSpecHistoryKind = "none" | "granite_maul" | "voidwaker" | "vesta_longsword" | "other";
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
export type NhDirectGearAction =
  | "equip_dmm_torva_full_helm"
  | "equip_imbued_saradomin_cape"
  | "equip_amulet_of_fury"
  | "equip_dmm_zuriels_staff"
  | "equip_dmm_virtus_robe_top"
  | "equip_dmm_elidinis_ward"
  | "equip_dmm_virtus_robe_bottom"
  | "equip_dmm_confliction_gauntlets"
  | "equip_dmm_avernic_treads"
  | "equip_seers_ring_i"
  | "equip_dmm_onyx_dragon_bolts"
  | "equip_dmm_masori_body"
  | "equip_dmm_zaryte_crossbow"
  | "equip_dmm_torva_platelegs"
  | "equip_dragonfire_shield"
  | "equip_dmm_noxious_halberd"
  | "equip_barrows_gloves"
  | "equip_dmm_vestas_longsword"
  | "equip_dmm_voidwaker"
  | "equip_granite_maul"
  | "unequip_head"
  | "unequip_cape"
  | "unequip_amulet"
  | "unequip_body"
  | "unequip_shield"
  | "unequip_legs"
  | "unequip_hands"
  | "unequip_feet"
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
  readonly directGearActions?: readonly NhDirectGearAction[];
}

export const nhPolicyLegacyV12InputSize = 86;
export const nhPolicyPreviousInputSize = 92;
export const nhPolicyV15InputSize = 110;
export const nhPolicyV16InputSize = 111;
export const nhPolicyV17InputSize = 112;
export const nhPolicyInputSize = 114;
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
export const nhVengeanceTrinketSupplyIntents = ["vengeance_trinket"] as const;
export const nhLegacySpecIntents = ["none", "use_special", "use_special_double"] as const;
export const nhExplicitSpecIntents = [
  "spec_granite_maul",
  "spec_granite_maul_double",
  "spec_armadyl_godsword",
  "spec_voidwaker",
  "spec_vesta_longsword"
] as const;
export const nhSpecIntents = [...nhLegacySpecIntents, ...nhExplicitSpecIntents] as const;
export const nhAttackIntents = ["attack", "hold", "off_tick"] as const;
export const nhChannelCombatAttackIntents = ["attack", "off_tick"] as const;
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
export const nhDirectGearActions = [
  "equip_dmm_torva_full_helm",
  "equip_imbued_saradomin_cape",
  "equip_amulet_of_fury",
  "equip_dmm_zuriels_staff",
  "equip_dmm_virtus_robe_top",
  "equip_dmm_elidinis_ward",
  "equip_dmm_virtus_robe_bottom",
  "equip_dmm_confliction_gauntlets",
  "equip_dmm_avernic_treads",
  "equip_seers_ring_i",
  "equip_dmm_onyx_dragon_bolts",
  "equip_dmm_masori_body",
  "equip_dmm_zaryte_crossbow",
  "equip_dmm_torva_platelegs",
  "equip_dragonfire_shield",
  "equip_dmm_noxious_halberd",
  "equip_barrows_gloves",
  "equip_dmm_vestas_longsword",
  "equip_dmm_voidwaker",
  "equip_granite_maul",
  "unequip_head",
  "unequip_cape",
  "unequip_amulet",
  "unequip_body",
  "unequip_shield",
  "unequip_legs",
  "unequip_hands",
  "unequip_feet",
  "unequip_ring"
] as const satisfies readonly NhDirectGearAction[];

export type NhDirectGearSlot =
  | "head"
  | "cape"
  | "amulet"
  | "weapon"
  | "body"
  | "shield"
  | "legs"
  | "hands"
  | "feet"
  | "ring"
  | "ammo";

export const nhDirectGearActionSlots = {
  equip_dmm_torva_full_helm: "head",
  equip_imbued_saradomin_cape: "cape",
  equip_amulet_of_fury: "amulet",
  equip_dmm_zuriels_staff: "weapon",
  equip_dmm_virtus_robe_top: "body",
  equip_dmm_elidinis_ward: "shield",
  equip_dmm_virtus_robe_bottom: "legs",
  equip_dmm_confliction_gauntlets: "hands",
  equip_dmm_avernic_treads: "feet",
  equip_seers_ring_i: "ring",
  equip_dmm_onyx_dragon_bolts: "ammo",
  equip_dmm_masori_body: "body",
  equip_dmm_zaryte_crossbow: "weapon",
  equip_dmm_torva_platelegs: "legs",
  equip_dragonfire_shield: "shield",
  equip_dmm_noxious_halberd: "weapon",
  equip_barrows_gloves: "hands",
  equip_dmm_vestas_longsword: "weapon",
  equip_dmm_voidwaker: "weapon",
  equip_granite_maul: "weapon",
  unequip_head: "head",
  unequip_cape: "cape",
  unequip_amulet: "amulet",
  unequip_body: "body",
  unequip_shield: "shield",
  unequip_legs: "legs",
  unequip_hands: "hands",
  unequip_feet: "feet",
  unequip_ring: "ring"
} as const satisfies Record<NhDirectGearAction, NhDirectGearSlot>;

export function nhDirectGearActionSlot(action: NhDirectGearAction): NhDirectGearSlot {
  return nhDirectGearActionSlots[action];
}

export function nhDmmCoreGearActionsForCombat(
  action: Pick<NhPolicyAction, "offenceStyle" | "specIntent" | "attackIntent">
): readonly NhDirectGearAction[] {
  switch (action.specIntent) {
    case "spec_granite_maul":
    case "spec_granite_maul_double":
      return ["equip_granite_maul"];
    case "spec_voidwaker":
      return ["equip_dmm_voidwaker"];
    case "spec_vesta_longsword":
      return ["equip_dmm_vestas_longsword"];
  }

  if ((action.attackIntent ?? "attack") === "hold") {
    return [];
  }

  switch (action.offenceStyle) {
    case "magic":
      return ["equip_dmm_zuriels_staff"];
    case "ranged":
      return ["equip_dmm_zaryte_crossbow"];
    case "melee":
      return ["equip_dmm_noxious_halberd"];
  }
}

export function mergeNhDmmDirectGearActionsSlotAware(
  coreActions: readonly NhDirectGearAction[],
  optionalActions: readonly NhDirectGearAction[]
): readonly NhDirectGearAction[] {
  const reservedSlots = new Set(coreActions.map(nhDirectGearActionSlot));
  const seenSlots = new Set<NhDirectGearSlot>();
  const merged: NhDirectGearAction[] = [];
  // Source: NhStakerSelfPlayManager.mergeDirectGearActionsSlotAware() applies
  // the combat-required weapon before optional tank/offence swaps.
  for (const action of coreActions) {
    const slot = nhDirectGearActionSlot(action);
    if (seenSlots.has(slot)) {
      continue;
    }
    seenSlots.add(slot);
    merged.push(action);
  }
  for (const action of optionalActions) {
    const slot = nhDirectGearActionSlot(action);
    if (reservedSlots.has(slot) || seenSlots.has(slot)) {
      continue;
    }
    seenSlots.add(slot);
    merged.push(action);
  }
  return merged;
}

export const nhBaseActionCount =
  nhOffenceStyles.length * nhDefencePrayers.length * nhMovementIntents.length * nhSupplyIntents.length;
export const nhExtraBaseActionCount =
  nhOffenceStyles.length * nhDefencePrayers.length * nhMovementIntents.length * nhExtraSupplyIntents.length;
export const nhVengeanceTrinketBaseActionCount =
  nhOffenceStyles.length * nhDefencePrayers.length * nhMovementIntents.length * nhVengeanceTrinketSupplyIntents.length;
export const nhLegacyActionCount = nhBaseActionCount * nhLegacySpecIntents.length;
export const nhExtendedSupplyActionCount = nhExtraBaseActionCount * nhLegacySpecIntents.length;
export const nhPolicyV1ActionCount = nhLegacyActionCount + nhExtendedSupplyActionCount;
export const nhPolicyV1VariantActionCount = nhPolicyV1ActionCount * nhAttackIntents.length * nhEquipmentIntents.length;
export const nhVengeanceTrinketActionCount =
  nhVengeanceTrinketBaseActionCount * nhAttackIntents.length * nhEquipmentIntents.length;
export const nhPolicyActionCountWithoutExplicitSpecs = nhPolicyV1VariantActionCount + nhVengeanceTrinketActionCount;
export const nhExplicitSpecBaseActionCount =
  nhDefencePrayers.length * nhMovementIntents.length * nhAttackIntents.length * nhEquipmentIntents.length;
export const nhExplicitSpecActionCount = nhExplicitSpecBaseActionCount * nhExplicitSpecIntents.length;
export const nhPolicyCombatActionCount = nhPolicyActionCountWithoutExplicitSpecs + nhExplicitSpecActionCount;
export const nhDirectGearActionBase = nhPolicyCombatActionCount;
export const nhDirectGearActionCount = nhDirectGearActions.length;
export const nhDirectGearActionLimit = nhDirectGearActionBase + nhDirectGearActionCount;
export const nhChannelAttackActionCount = 1 + nhOffenceStyles.length * nhChannelCombatAttackIntents.length;
export const nhChannelSpecActionCount = 1 + nhExplicitSpecIntents.length * nhChannelCombatAttackIntents.length;
export const nhChannelDefenceActionCount = nhDefencePrayers.length;
export const nhChannelMovementActionCount = nhMovementIntents.length;
export const nhChannelSupplyActionCount =
  nhSupplyIntents.length + nhExtraSupplyIntents.length + nhVengeanceTrinketSupplyIntents.length;
export const nhChannelAttackActionBase = nhDirectGearActionLimit;
export const nhChannelSpecActionBase = nhChannelAttackActionBase + nhChannelAttackActionCount;
export const nhChannelDefenceActionBase = nhChannelSpecActionBase + nhChannelSpecActionCount;
export const nhChannelMovementActionBase = nhChannelDefenceActionBase + nhChannelDefenceActionCount;
export const nhChannelSupplyActionBase = nhChannelMovementActionBase + nhChannelMovementActionCount;
export const nhChannelActionLimit = nhChannelSupplyActionBase + nhChannelSupplyActionCount;
export const nhPolicyActionCount = nhChannelActionLimit;
export const nhPolicyPreviousFeatureSize = nhPolicyReservoirSize + nhPolicyPreviousInputSize + 1;
export const nhPolicyFeatureSize = nhPolicyReservoirSize + nhPolicyInputSize + 1;

const nhDeployedLegacyBaseActionCount =
  nhOffenceStyles.length * nhDefencePrayers.length * nhDeployedLegacyMovementIntents.length * nhSupplyIntents.length;
const nhDeployedLegacyExtraBaseActionCount =
  nhOffenceStyles.length *
  nhDefencePrayers.length *
  nhDeployedLegacyMovementIntents.length *
  nhExtraSupplyIntents.length;
const nhDeployedLegacyActionCount = nhDeployedLegacyBaseActionCount * nhLegacySpecIntents.length;
const nhDeployedLegacyPolicyV1ActionCount =
  nhDeployedLegacyActionCount + nhDeployedLegacyExtraBaseActionCount * nhLegacySpecIntents.length;
export const nhDeployedLegacyPolicyActionCount =
  nhDeployedLegacyPolicyV1ActionCount * nhAttackIntents.length * nhEquipmentIntents.length;

export function decodeNhDeployedLegacyPolicyAction(action: number): NhPolicyAction {
  const normalizedAction = clampInt(action, 0, nhDeployedLegacyPolicyActionCount - 1);
  const legacyAction = normalizedAction % nhDeployedLegacyPolicyV1ActionCount;
  const variantIndex = Math.floor(normalizedAction / nhDeployedLegacyPolicyV1ActionCount);
  const attackIndex = variantIndex % nhAttackIntents.length;
  const equipmentIndex = Math.floor(variantIndex / nhAttackIntents.length) % nhEquipmentIntents.length;
  const extendedSupplyAction = legacyAction >= nhDeployedLegacyActionCount;
  const baseAction = extendedSupplyAction
    ? (legacyAction - nhDeployedLegacyActionCount) % nhDeployedLegacyExtraBaseActionCount
    : legacyAction % nhDeployedLegacyBaseActionCount;
  const specIndex = extendedSupplyAction
    ? Math.floor((legacyAction - nhDeployedLegacyActionCount) / nhDeployedLegacyExtraBaseActionCount)
    : Math.floor(legacyAction / nhDeployedLegacyBaseActionCount);
  const supplyPool = extendedSupplyAction ? nhExtraSupplyIntents : nhSupplyIntents;

  const supplyIndex = baseAction % supplyPool.length;
  const movementIndex = Math.floor(baseAction / supplyPool.length) % nhDeployedLegacyMovementIntents.length;
  const defenceIndex =
    Math.floor(baseAction / (supplyPool.length * nhDeployedLegacyMovementIntents.length)) % nhDefencePrayers.length;
  const styleIndex =
    Math.floor(baseAction / (supplyPool.length * nhDeployedLegacyMovementIntents.length * nhDefencePrayers.length)) %
    nhOffenceStyles.length;

  return {
    offenceStyle: nhOffenceStyles[styleIndex],
    defencePrayer: nhDefencePrayers[defenceIndex],
    movementIntent: nhDeployedLegacyMovementIntents[movementIndex],
    supplyIntent: supplyPool[supplyIndex],
    specIntent: nhLegacySpecIntents[clampInt(specIndex, 0, nhLegacySpecIntents.length - 1)],
    extendedSupplyAction,
    attackIntent: nhAttackIntents[attackIndex],
    equipmentIntent: nhEquipmentIntents[equipmentIndex]
  };
}

export function decodeNhPolicyAction(action: number): NhPolicyAction {
  const normalizedAction = clampInt(action, 0, nhPolicyActionCount - 1);
  if (isNhDirectGearActionId(normalizedAction)) {
    const directGearAction = nhDirectGearActions[normalizedAction - nhDirectGearActionBase];
    return {
      offenceStyle: "magic",
      defencePrayer: "protect_from_magic",
      movementIntent: "none",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false,
      attackIntent: "hold",
      equipmentIntent: "weapon_only",
      directGearActions: directGearAction === undefined ? [] : [directGearAction]
    };
  }
  if (isNhChannelAttackActionId(normalizedAction)) {
    const offset = normalizedAction - nhChannelAttackActionBase;
    if (offset <= 0) {
      return {
        offenceStyle: "magic",
        defencePrayer: "protect_from_magic",
        movementIntent: "none",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false,
        attackIntent: "hold",
        equipmentIntent: "weapon_only"
      };
    }
    const combatOffset = offset - 1;
    const styleIndex = Math.floor(combatOffset / nhChannelCombatAttackIntents.length) % nhOffenceStyles.length;
    const attackIndex = combatOffset % nhChannelCombatAttackIntents.length;
    const offenceStyle = nhOffenceStyles[styleIndex];
    const attackIntent = nhChannelCombatAttackIntents[attackIndex];
    return {
      offenceStyle,
      defencePrayer: "protect_from_magic",
      movementIntent: "none",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false,
      attackIntent,
      equipmentIntent: "weapon_only",
      directGearActions: nhDmmCoreGearActionsForCombat({ offenceStyle, specIntent: "none", attackIntent })
    };
  }
  if (isNhChannelSpecActionId(normalizedAction)) {
    const offset = normalizedAction - nhChannelSpecActionBase;
    if (offset <= 0) {
      return {
        offenceStyle: "magic",
        defencePrayer: "protect_from_magic",
        movementIntent: "none",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false,
        attackIntent: "hold",
        equipmentIntent: "weapon_only"
      };
    }
    const specOffset = offset - 1;
    const specIndex = Math.floor(specOffset / nhChannelCombatAttackIntents.length) % nhExplicitSpecIntents.length;
    const attackIndex = specOffset % nhChannelCombatAttackIntents.length;
    const specIntent = nhExplicitSpecIntents[specIndex];
    const attackIntent = nhChannelCombatAttackIntents[attackIndex];
    return {
      offenceStyle: "melee",
      defencePrayer: "protect_from_magic",
      movementIntent: "none",
      supplyIntent: "none",
      specIntent,
      extendedSupplyAction: false,
      attackIntent,
      equipmentIntent: "weapon_only",
      directGearActions: nhDmmCoreGearActionsForCombat({ offenceStyle: "melee", specIntent, attackIntent })
    };
  }
  if (isNhChannelDefenceActionId(normalizedAction)) {
    const defenceIndex = normalizedAction - nhChannelDefenceActionBase;
    return {
      offenceStyle: "magic",
      defencePrayer: nhDefencePrayers[clampInt(defenceIndex, 0, nhDefencePrayers.length - 1)],
      movementIntent: "none",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false,
      attackIntent: "hold",
      equipmentIntent: "weapon_only"
    };
  }
  if (isNhChannelMovementActionId(normalizedAction)) {
    const movementIndex = normalizedAction - nhChannelMovementActionBase;
    return {
      offenceStyle: "magic",
      defencePrayer: "protect_from_magic",
      movementIntent: nhMovementIntents[clampInt(movementIndex, 0, nhMovementIntents.length - 1)],
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false,
      attackIntent: "hold",
      equipmentIntent: "weapon_only"
    };
  }
  if (isNhChannelSupplyActionId(normalizedAction)) {
    const supplyPool = [...nhSupplyIntents, ...nhExtraSupplyIntents, ...nhVengeanceTrinketSupplyIntents] as const;
    const supplyIndex = normalizedAction - nhChannelSupplyActionBase;
    const supplyIntent = supplyPool[clampInt(supplyIndex, 0, supplyPool.length - 1)];
    return {
      offenceStyle: "magic",
      defencePrayer: "protect_from_magic",
      movementIntent: "none",
      supplyIntent,
      specIntent: "none",
      extendedSupplyAction: (nhExtraSupplyIntents as readonly string[]).includes(supplyIntent),
      attackIntent: "hold",
      equipmentIntent: "weapon_only"
    };
  }
  if (normalizedAction >= nhPolicyActionCountWithoutExplicitSpecs) {
    const offset = normalizedAction - nhPolicyActionCountWithoutExplicitSpecs;
    const specIndex = Math.floor(offset / nhExplicitSpecBaseActionCount);
    const baseAction = offset % nhExplicitSpecBaseActionCount;
    const equipmentIndex = baseAction % nhEquipmentIntents.length;
    const attackIndex = Math.floor(baseAction / nhEquipmentIntents.length) % nhAttackIntents.length;
    const movementIndex =
      Math.floor(baseAction / (nhEquipmentIntents.length * nhAttackIntents.length)) % nhMovementIntents.length;
    const defenceIndex =
      Math.floor(baseAction / (nhEquipmentIntents.length * nhAttackIntents.length * nhMovementIntents.length)) %
      nhDefencePrayers.length;
    return {
      offenceStyle: "melee",
      defencePrayer: nhDefencePrayers[defenceIndex],
      movementIntent: nhMovementIntents[movementIndex],
      supplyIntent: "none",
      specIntent: nhExplicitSpecIntents[clampInt(specIndex, 0, nhExplicitSpecIntents.length - 1)],
      extendedSupplyAction: false,
      attackIntent: nhAttackIntents[attackIndex],
      equipmentIntent: nhEquipmentIntents[equipmentIndex]
    };
  }
  if (normalizedAction >= nhPolicyV1VariantActionCount) {
    const offset = normalizedAction - nhPolicyV1VariantActionCount;
    const baseAction = offset % nhVengeanceTrinketBaseActionCount;
    const variantIndex = Math.floor(offset / nhVengeanceTrinketBaseActionCount);
    const attackIndex = variantIndex % nhAttackIntents.length;
    const equipmentIndex = Math.floor(variantIndex / nhAttackIntents.length) % nhEquipmentIntents.length;
    const movementIndex = baseAction % nhMovementIntents.length;
    const defenceIndex = Math.floor(baseAction / nhMovementIntents.length) % nhDefencePrayers.length;
    const styleIndex = Math.floor(baseAction / (nhMovementIntents.length * nhDefencePrayers.length)) % nhOffenceStyles.length;
    return {
      offenceStyle: nhOffenceStyles[styleIndex],
      defencePrayer: nhDefencePrayers[defenceIndex],
      movementIntent: nhMovementIntents[movementIndex],
      supplyIntent: "vengeance_trinket",
      specIntent: "none",
      extendedSupplyAction: false,
      attackIntent: nhAttackIntents[attackIndex],
      equipmentIntent: nhEquipmentIntents[equipmentIndex]
    };
  }
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
    specIntent: nhLegacySpecIntents[clampInt(specIndex, 0, nhLegacySpecIntents.length - 1)],
    extendedSupplyAction,
    attackIntent: nhAttackIntents[attackIndex],
    equipmentIntent: nhEquipmentIntents[equipmentIndex]
  };
}

export function encodeNhPolicyAction(action: NhPolicyAction): number {
  const directGearAction = action.directGearActions?.[0];
  if (
    directGearAction !== undefined &&
    action.directGearActions?.length === 1 &&
    action.supplyIntent === "none" &&
    action.specIntent === "none" &&
    (action.attackIntent ?? "hold") === "hold"
  ) {
    const directGearIndex = indexOfOrZero(nhDirectGearActions, directGearAction);
    return nhDirectGearActionBase + directGearIndex;
  }
  const styleIndex = indexOfOrZero(nhOffenceStyles, action.offenceStyle);
  const defenceIndex = indexOfOrZero(nhDefencePrayers, action.defencePrayer);
  const movementIndex = indexOfOrZero(nhMovementIntents, action.movementIntent);
  const attackIndex = indexOfOrZero(nhAttackIntents, action.attackIntent ?? "attack");
  const equipmentIndex = indexOfOrZero(nhEquipmentIntents, action.equipmentIntent ?? "style_loadout");
  const variantIndex = equipmentIndex * nhAttackIntents.length + attackIndex;
  if (isNhExplicitSpecIntent(action.specIntent)) {
    const specIndex = indexOfOrZero(nhExplicitSpecIntents, action.specIntent);
    const baseAction =
      (((defenceIndex * nhMovementIntents.length + movementIndex) * nhAttackIntents.length + attackIndex) *
        nhEquipmentIntents.length) +
      equipmentIndex;
    return nhPolicyActionCountWithoutExplicitSpecs + specIndex * nhExplicitSpecBaseActionCount + baseAction;
  }
  const specIndex = indexOfOrZero(nhLegacySpecIntents, action.specIntent as NhLegacySpecIntent);
  if (action.supplyIntent === "vengeance_trinket") {
    const baseAction =
      ((styleIndex * nhDefencePrayers.length + defenceIndex) * nhMovementIntents.length) + movementIndex;
    return nhPolicyV1VariantActionCount + variantIndex * nhVengeanceTrinketBaseActionCount + baseAction;
  }
  const supplyPool = action.extendedSupplyAction ? nhExtraSupplyIntents : nhSupplyIntents;
  const supplyIndex = indexOfOrZero(supplyPool, action.supplyIntent as (typeof supplyPool)[number]);

  const baseAction =
    (((styleIndex * nhDefencePrayers.length + defenceIndex) * nhMovementIntents.length + movementIndex) *
      supplyPool.length) +
    supplyIndex;

  const legacyAction = action.extendedSupplyAction
    ? nhLegacyActionCount + specIndex * nhExtraBaseActionCount + baseAction
    : specIndex * nhBaseActionCount + baseAction;
  return variantIndex * nhPolicyV1ActionCount + legacyAction;
}

export function isNhDirectGearActionId(action: number): boolean {
  return action >= nhDirectGearActionBase && action < nhDirectGearActionLimit;
}

export function isNhChannelActionId(action: number): boolean {
  return action >= nhChannelAttackActionBase && action < nhChannelActionLimit;
}

export function isNhChannelAttackActionId(action: number): boolean {
  return action >= nhChannelAttackActionBase && action < nhChannelSpecActionBase;
}

export function isNhChannelSpecActionId(action: number): boolean {
  return action >= nhChannelSpecActionBase && action < nhChannelDefenceActionBase;
}

export function isNhChannelDefenceActionId(action: number): boolean {
  return action >= nhChannelDefenceActionBase && action < nhChannelMovementActionBase;
}

export function isNhChannelMovementActionId(action: number): boolean {
  return action >= nhChannelMovementActionBase && action < nhChannelSupplyActionBase;
}

export function isNhChannelSupplyActionId(action: number): boolean {
  return action >= nhChannelSupplyActionBase && action < nhChannelActionLimit;
}

export function dmmCanonicalAttackActionIds(): readonly number[] {
  return [
    nhChannelAttackActionBase,
    ...nhOffenceStyles.flatMap((_, styleIndex) =>
      nhChannelCombatAttackIntents.map(
        (__, attackIndex) => nhChannelAttackActionBase + 1 + styleIndex * nhChannelCombatAttackIntents.length + attackIndex
      )
    )
  ];
}

export function dmmCanonicalSpecActionIds(): readonly number[] {
  return [
    nhChannelSpecActionBase,
    ...nhExplicitSpecIntents.flatMap((_, specIndex) =>
      nhChannelCombatAttackIntents.map(
        (__, attackIndex) => nhChannelSpecActionBase + 1 + specIndex * nhChannelCombatAttackIntents.length + attackIndex
      )
    )
  ];
}

export function dmmCanonicalDefenceActionIds(): readonly number[] {
  return nhDefencePrayers.map((_, index) => nhChannelDefenceActionBase + index);
}

export function dmmCanonicalMovementActionIds(): readonly number[] {
  return nhMovementIntents.map((_, index) => nhChannelMovementActionBase + index);
}

export function dmmCanonicalSupplyActionIds(): readonly number[] {
  return [
    ...nhSupplyIntents.map((_, index) => nhChannelSupplyActionBase + index),
    ...nhVengeanceTrinketSupplyIntents.map(
      (_, index) => nhChannelSupplyActionBase + nhSupplyIntents.length + nhExtraSupplyIntents.length + index
    )
  ];
}

export function dmmCurrentActionVectorActionIds(): readonly number[] {
  return [
    ...dmmCanonicalAttackActionIds(),
    ...dmmCanonicalSpecActionIds(),
    ...dmmCanonicalDefenceActionIds(),
    ...dmmCanonicalMovementActionIds(),
    ...dmmCanonicalSupplyActionIds(),
    ...nhDirectGearActions.map((_, index) => nhDirectGearActionBase + index)
  ];
}

export function isNhExplicitSpecIntent(specIntent: NhSpecIntent): specIntent is NhExplicitSpecIntent {
  return (nhExplicitSpecIntents as readonly string[]).includes(specIntent);
}

export function nhExplicitSpecWeaponKind(
  specIntent: NhSpecIntent
): "granite_maul" | "armadyl_godsword" | "voidwaker" | "vesta_longsword" | null {
  if (specIntent === "spec_granite_maul" || specIntent === "spec_granite_maul_double") {
    return "granite_maul";
  }
  if (specIntent === "spec_armadyl_godsword") {
    return "armadyl_godsword";
  }
  if (specIntent === "spec_voidwaker") {
    return "voidwaker";
  }
  if (specIntent === "spec_vesta_longsword") {
    return "vesta_longsword";
  }
  return null;
}

export function nhSpecIntentIsDouble(specIntent: NhSpecIntent): boolean {
  return specIntent === "use_special_double" || specIntent === "spec_granite_maul_double";
}

export function nhSpecIntentIsLegacyGeneric(specIntent: NhSpecIntent): boolean {
  return specIntent === "use_special" || specIntent === "use_special_double";
}

export function assertNhPolicyShape(inputSize: number, actionCount: number): void {
  if (inputSize !== nhPolicyInputSize) {
    throw new Error(`NH policy input size mismatch: expected ${nhPolicyInputSize}, got ${inputSize}`);
  }
  if (actionCount !== nhPolicyActionCount && actionCount !== nhPolicyV1ActionCount) {
    throw new Error(`NH policy action count mismatch: expected ${nhPolicyActionCount} or legacy ${nhPolicyV1ActionCount}, got ${actionCount}`);
  }
}

function indexOfOrZero<T extends string>(values: readonly T[], value: string): number {
  const index = (values as readonly string[]).indexOf(value);
  return index === -1 ? 0 : index;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
