import equipmentRowsJson from "../../generated/equipment-bonuses.json";
import serverItemsJson from "../../generated/server-items.json";
import weaponTypesJson from "../../generated/weapon-types.json";
import type { RuntimeActorId, RuntimeLoadoutId, RuntimeTile } from "../../render/runtimeScene";
import type { EquipmentSlot, VisibleEquipment, VisibleEquipmentItem } from "../clientView";
import type { CombatLevels, CombatStyle } from "../combat/formulas";
import type { BonusTable } from "../combat/formulas";
import { aggregateVisibleEquipmentBonuses, type EquipmentBonusRow } from "../equipment/equipment";
import { updateGmaulEquipment } from "../combat/gmaul";
import { canAttack as canAttackByTimer, createAttackTimerState } from "../combat/timers";
import { canAct, canMove, createEntityLockState, isFrozen, resetFreeze, type EntityLockState } from "../entity/locks";
import { consumableDefinitions, consumableUseCountForItemId, type ConsumableId, type SimStat, type SimStats } from "../items/consumables";
import {
  activeProtectionPrayer,
  prayerDefinitions,
  protectPrayerForStyle,
  type PrayerId,
  type ProtectionPrayerId
} from "../prayer/prayers";
import { nhWeaponProfiles } from "../combat/player-combat";
import {
  consumeRuntimePlayerCombatSupply,
  requestRuntimePlayerCombatAttack,
  resetRuntimePlayerCombatActorPolicyDisengage,
  runtimePlayerCombatDefaultLevels,
  runtimePlayerCombatDefaultSupplies,
  setRuntimePlayerCombatAutocast,
  setRuntimePlayerCombatLoadout,
  setRuntimePlayerCombatPrayers,
  syncRuntimePlayerCombatStateToInput,
  toggleRuntimePlayerCombatSpecial,
  type RuntimePlayerCombatActorState,
  type RuntimePlayerCombatEvent,
  type RuntimePlayerCombatState
} from "../runtimePlayerCombat";
import type { TilePosition } from "../world/movement";
import {
  createNhDuelControllerContext,
  type NhDuelActorState,
  type NhDuelController,
  type NhDuelControllerContext
} from "./duel";
import { nhClientOffenceEv, nhStyleInOffensiveRange, nhWeaknessForStyle } from "./clientOffenceEv";
import { nhLoadouts, type NhLoadoutId, type NhWeaponId } from "./loadouts";
import {
  inferNhSelectedGearProfile,
  isNhArmadylGodswordItemId,
  isNhGraniteMaulItemId,
  nhGearProfileAvailableSpecialWeaponKind,
  nhGearProfileCanEquipArmadylGodsword,
  nhGearProfileCanEquipGraniteMaul,
  nhGearProfileNormalizeBotSourceEquipment,
  nhGearProfileUsableBotSourceProfile,
  nhGearProfileActionEquipment,
  nhGearProfileCandidateEquipmentByStyle,
  nhGearProfileWeaponIdForEquipment,
  type NhSelectedGearProfile
} from "./gearProfile";
import {
  nhDefencePrayers,
  nhExtraSupplyIntents,
  nhMovementIntents,
  nhOffenceStyles,
  nhPolicyActionCount,
  nhSpecIntents,
  nhSupplyIntents,
  type NhMovementIntent,
  type NhOffenceStyle,
  type NhPolicyAction
} from "./policy-bridge";
import { nhPolicyGmaulSpecApproachWindow } from "./policy-features";

type RuntimePolicyIntentCoverage<T extends string> = Readonly<Record<T, string>>;
type RuntimePolicyDefencePrayer = (typeof nhDefencePrayers)[number];
type RuntimePolicySpecialWeaponKind = "granite_maul" | "armadyl_godsword";

export interface RuntimePolicyInventorySlot {
  readonly itemId: number;
  readonly quantity: number;
}

export const runtimePolicyOpponentActionCoverage = {
  offenceStyles: {
    magic: "switch to Kodai mage loadout and attack through runtime spell/autocast combat path",
    ranged: "switch to Armadyl crossbow range loadout and attack through runtime ranged path",
    melee: "switch to abyssal tentacle melee loadout unless a spec intent promotes granite maul"
  },
  defencePrayers: {
    protect_from_magic: "activate compatible protection prayer set before the attack tick resolves",
    protect_from_missiles: "activate compatible protection prayer set before the attack tick resolves",
    protect_from_melee: "activate compatible protection prayer set before the attack tick resolves",
    smite: "activate compatible prayer set; policy ranker normally filters unsafe smite choices",
    redemption: "activate compatible prayer set; policy ranker normally filters unsafe redemption choices"
  },
  movementIntents: {
    pressure: "keep the attack target set so the source-backed target-route/pre-attack route path can step in",
    stand_under: "step toward or onto the delayed frozen opponent tile when movement is allowed",
    step_out: "step one tile away from the delayed opponent tile when movement is allowed",
    step_north: "step one tile north when movement is allowed",
    step_south: "step one tile south when movement is allowed",
    step_east: "step one tile east when movement is allowed",
    step_west: "step one tile west when movement is allowed",
    step_north_east: "step one tile north-east when movement is allowed",
    step_north_west: "step one tile north-west when movement is allowed",
    step_south_east: "step one tile south-east when movement is allowed",
    step_south_west: "step one tile south-west when movement is allowed"
  },
  supplyIntents: {
    none: "no supply packet unless source post-brew recovery gates promote restore/reboost",
    safe_eat: "consume the best available main-food packet",
    double_eat: "consume shark then karambwan through runtime food locks",
    triple_eat: "consume main food, brew, then karambwan through runtime food/potion locks",
    brew_only: "consume one Saradomin brew through runtime potion locks",
    restore_reboost: "consume restore and reboost only when source stat/prayer thresholds require it",
    panic_full: "consume main food, brew, karambwan, then source-gated restore/reboost recovery",
    offence_strip_one: "remove one source-selected defensive equipment slot for offence EV",
    offence_strip_two: "remove up to two source-selected defensive equipment slots for offence EV",
    regear_style: "restore the full equipment for the selected style loadout"
  },
  specIntents: {
    none: "no special packet",
    use_special: "queue one Granite maul packet or toggle AGS special when source client-spec-control gates allow it",
    use_special_double: "queue two Granite maul packets when source client-spec-control gates allow it; AGS drops double intent"
  }
} as const satisfies {
  readonly offenceStyles: RuntimePolicyIntentCoverage<NhOffenceStyle>;
  readonly defencePrayers: RuntimePolicyIntentCoverage<RuntimePolicyDefencePrayer>;
  readonly movementIntents: RuntimePolicyIntentCoverage<NhMovementIntent>;
  readonly supplyIntents: RuntimePolicyIntentCoverage<NhPolicyAction["supplyIntent"]>;
  readonly specIntents: RuntimePolicyIntentCoverage<NhPolicyAction["specIntent"]>;
};

export interface RuntimePolicyOpponentActorView {
  readonly tile: RuntimeTile;
  readonly loadoutId: RuntimeLoadoutId;
  readonly equipment?: VisibleEquipment;
  readonly inventoryItems?: readonly VisibleEquipmentItem[];
  readonly inventorySlots?: readonly (RuntimePolicyInventorySlot | null)[];
  readonly gearProfile?: NhSelectedGearProfile;
  readonly observation?: RuntimePolicyActorObservation;
  readonly activePrayers?: readonly PrayerId[];
  readonly stats?: SimStats;
  readonly locks?: EntityLockState;
  readonly movedThisTick?: boolean;
  readonly lastMoveDx?: number;
  readonly lastMoveDy?: number;
  readonly observedInfoKnown?: boolean;
}

export interface RuntimePolicyActorObservation {
  readonly ateFoodLastTick: boolean;
  readonly drankPotionLastTick: boolean;
  readonly likelyOffenceStyle?: NhOffenceStyle;
  readonly lastDealtHit: number;
  readonly lastTakenHit: number;
  readonly rewardDelta: number;
  readonly rewardTotal: number;
  readonly rewardDps: number;
  readonly estimatedSpecialEnergy?: number;
}

export interface RuntimePolicyStepContext {
  readonly movementIntent: NhMovementIntent;
  readonly targetTile: RuntimeTile;
  readonly allowTargetTile: boolean;
}

export type RuntimePolicyStepPredicate = (
  from: RuntimeTile,
  to: RuntimeTile,
  context: RuntimePolicyStepContext
) => boolean;

export type RuntimePolicyProjectileLineOfSightPredicate = (from: RuntimeTile, target: RuntimeTile) => boolean;

export type RuntimePolicyTargetRouteStepPredicate = (
  from: RuntimeTile,
  target: RuntimeTile,
  distance: number,
  context: RuntimePolicyStepContext
) => RuntimeTile | null;

export type RuntimePolicyTileRouteStepPredicate = (
  from: RuntimeTile,
  target: RuntimeTile,
  context: RuntimePolicyStepContext
) => RuntimeTile | null;

export interface RuntimePolicyOpponentResult {
  readonly state: RuntimePlayerCombatState;
  readonly action: NhPolicyAction;
  readonly effectiveAction: NhPolicyAction;
  readonly controllerId: string;
  readonly context: NhDuelControllerContext;
  readonly opponentLoadoutId: RuntimeLoadoutId;
  readonly opponentTile: RuntimeTile;
  readonly opponentMovedThisTick: boolean;
  readonly opponentLastMoveDx: number;
  readonly opponentLastMoveDy: number;
  readonly movementBlockedReason: string | null;
  readonly nextRepositionTick: number | null;
  readonly consumedSupplies: readonly ConsumableId[];
  readonly strippedEquipmentSlots: readonly EquipmentSlot[];
}

export function applyRuntimeOpponentPolicyAction(input: {
  readonly state: RuntimePlayerCombatState;
  readonly controller: NhDuelController;
  readonly localActor: RuntimePolicyOpponentActorView;
  readonly opponentActor: RuntimePolicyOpponentActorView;
  readonly rewardEpisodeId?: number;
  readonly rewardEpisodeActive?: boolean;
  readonly rewardEpisodeStartTick?: number;
  readonly canStep?: RuntimePolicyStepPredicate;
  readonly targetRouteStep?: RuntimePolicyTargetRouteStepPredicate;
  readonly tileRouteStep?: RuntimePolicyTileRouteStepPredicate;
  readonly projectileLineOfSight?: RuntimePolicyProjectileLineOfSightPredicate;
  readonly inPvpCombatArea?: boolean;
  readonly nextRepositionTick?: number;
  readonly tileScale?: number;
  readonly selfPlayMode?: boolean;
  readonly allowSourceLoadoutSync?: boolean;
}): RuntimePolicyOpponentResult {
  const stateWithPendingOutcome = runtimePolicyApplyPendingGmaulSpecOutcome(
    input.state,
    "opponent",
    "local-player",
    input.rewardEpisodeActive,
    input.rewardEpisodeStartTick
  );
  const scale = normalizeRuntimePolicyTileScale(input.tileScale) ?? runtimePolicyTileScale(input.localActor.tile, input.opponentActor.tile);
  const localGearProfile = inferNhSelectedGearProfile({
    equipment: input.localActor.equipment ?? stateWithPendingOutcome.actors["local-player"].equipment,
    previousProfile: input.localActor.gearProfile ?? stateWithPendingOutcome.actors["local-player"].gearProfile,
    inventoryItems: input.localActor.inventoryItems
  });
  const opponentGearProfile = inferNhSelectedGearProfile({
    equipment: input.opponentActor.equipment ?? stateWithPendingOutcome.actors.opponent.equipment,
    previousProfile: input.opponentActor.gearProfile ?? stateWithPendingOutcome.actors.opponent.gearProfile,
    inventoryItems: input.opponentActor.inventoryItems
  });
  if (input.selfPlayMode !== true && input.inPvpCombatArea === false) {
    const state = resetRuntimePlayerCombatActorPolicyDisengage(stateWithPendingOutcome, "opponent");
    const localObservation = {
      ...runtimePolicyActorObservation(state, "local-player", input.rewardEpisodeStartTick),
      estimatedSpecialEnergy: runtimePolicyOpponentSpecialEnergyEstimate(
        state,
        "local-player",
        input.rewardEpisodeStartTick
      )
    };
    const opponentObservation = runtimePolicyActorObservation(state, "opponent", input.rewardEpisodeStartTick);
    const localPolicyActor = runtimeCombatActorToNhDuelActor(
      "self",
      "Local trainer",
      state.actors["local-player"],
      { ...input.localActor, gearProfile: localGearProfile, observation: localObservation },
      scale,
      "policy-opponent"
    );
    const opponentPolicyActor = runtimeCombatActorToNhDuelActor(
      "opponent",
      "NH policy bot",
      state.actors.opponent,
      { ...input.opponentActor, gearProfile: opponentGearProfile, observation: opponentObservation },
      scale,
      "policy-self"
    );
    const context = createNhDuelControllerContext(state.tick, opponentPolicyActor, localPolicyActor, {
      rewardEpisodeId: input.rewardEpisodeId,
      rewardEpisodeActive: input.rewardEpisodeActive
    });
    const action = runtimePolicyLeftPvpNoopAction(context.self.lastOffenceStyle ?? undefined);
    return {
      state,
      action,
      effectiveAction: action,
      controllerId: input.controller.id,
      context,
      opponentLoadoutId: state.actors.opponent.loadoutId,
      opponentTile: input.opponentActor.tile,
      opponentMovedThisTick: false,
      opponentLastMoveDx: 0,
      opponentLastMoveDy: 0,
      movementBlockedReason: "left-pvp",
      nextRepositionTick: null,
      consumedSupplies: [],
      strippedEquipmentSlots: []
    };
  }
  // Source: NhStakerBot.trySyncLoadoutFromOpponent() copies the opponent's saved
  // command layout into the bot before an active reward episode starts.
  const sourceInventoryVisible = input.allowSourceLoadoutSync !== false && input.localActor.inventoryItems !== undefined;
  const sourceSyncReady =
    sourceInventoryVisible &&
    !input.rewardEpisodeActive &&
    stateWithPendingOutcome.tick >= stateWithPendingOutcome.actors.opponent.policyNextLoadoutSyncTick;
  const syncedSourceGearProfile = sourceSyncReady ? nhGearProfileUsableBotSourceProfile(localGearProfile) : null;
  const syncedOpponentGearProfile =
    sourceSyncReady
      ? syncedSourceGearProfile ?? opponentGearProfile
      : input.opponentActor.gearProfile ?? stateWithPendingOutcome.actors.opponent.gearProfile ?? opponentGearProfile;
  const stateWithSyncedGearProfile = runtimePolicySyncOpponentGearProfileFromSource(
    stateWithPendingOutcome,
    syncedOpponentGearProfile,
    sourceInventoryVisible,
    input.rewardEpisodeActive,
    input.localActor,
    syncedSourceGearProfile !== null
  );
  const stateWithRecoveredLoadout = runtimePolicyPerformEmergencyRecovery(
    stateWithSyncedGearProfile,
    "opponent",
    syncedOpponentGearProfile
  );
  const stateWithRewardShaping = runtimePolicyApplyTickRewardShaping(
    stateWithRecoveredLoadout,
    input,
    scale,
    localGearProfile,
    syncedOpponentGearProfile
  );
  const stateWithPrayer = runtimePolicyEnsurePrayerPoints(stateWithRewardShaping, "opponent");
  const localObservation = {
    ...runtimePolicyActorObservation(stateWithPrayer, "local-player", input.rewardEpisodeStartTick),
    estimatedSpecialEnergy: runtimePolicyOpponentSpecialEnergyEstimate(
      stateWithPrayer,
      "local-player",
      input.rewardEpisodeStartTick
    )
  };
  const opponentObservation = runtimePolicyActorObservation(stateWithPrayer, "opponent", input.rewardEpisodeStartTick);
  const opponentActorViewForContext = runtimePolicyActorViewAfterEmergencyRecovery(
    input.opponentActor,
    stateWithSyncedGearProfile.actors.opponent,
    stateWithPrayer.actors.opponent
  );
  const localPolicyActor = runtimeCombatActorToNhDuelActor(
    "self",
    "Local trainer",
    stateWithPrayer.actors["local-player"],
    { ...input.localActor, gearProfile: localGearProfile, observation: localObservation },
    scale,
    "policy-opponent"
  );
  const opponentPolicyActor = runtimeCombatActorToNhDuelActor(
    "opponent",
    "NH policy bot",
    stateWithPrayer.actors.opponent,
    { ...opponentActorViewForContext, gearProfile: syncedOpponentGearProfile, observation: opponentObservation },
    scale,
    "policy-self"
  );
  const scriptedFreezeAttempt = runtimePolicyResolveScriptedFreezeAttempt(stateWithPrayer, "opponent", localPolicyActor);
  const stateWithScriptedFreezeAttempt = scriptedFreezeAttempt.state;
  const context = createNhDuelControllerContext(stateWithScriptedFreezeAttempt.tick, opponentPolicyActor, localPolicyActor, {
    rewardEpisodeId: input.rewardEpisodeId,
    rewardEpisodeActive: input.rewardEpisodeActive,
    scriptedWantsFreeze: scriptedFreezeAttempt.wantsFreeze
  });
  const action = input.controller.chooseAction(context);
  const contextGuardedAction = runtimePolicyActionWithContextGuards(
    action,
    context,
    stateWithScriptedFreezeAttempt,
    "opponent",
    "local-player",
    input.selfPlayMode === true
  );
  let effectiveAction = runtimePolicyActionWithDelayedPrayerCounter(
    contextGuardedAction,
    context,
    localPolicyActor.activePrayers
  );
  // Source: NhStakerBot.run() applies applyContextGuards() and enforceLivePrayerCounter()
  // before switchToStyle(...), but enforceLivePrayerCounter() reads protectionMask(opponent),
  // which is the delayed OpponentInfoSnapshot mask. The spec gate must see the guarded
  // desired style, not the raw policy style, so same-tile guarded melee specs are not
  // rejected too early.
  effectiveAction = runtimePolicyActionWithAllowedSpecIntent(
    effectiveAction,
    context,
    stateWithScriptedFreezeAttempt,
    "opponent",
    input.rewardEpisodeStartTick
  );
  const currentOffenceStyle = context.self.lastOffenceStyle ?? null;
  const desiredOrCurrentOffenceStyle = currentOffenceStyle ?? effectiveAction.offenceStyle;
  let state = stateWithScriptedFreezeAttempt;
  const stateBeforeSupply = state;
  const supplyResult = consumeRuntimeOpponentPolicySupplies(state, contextGuardedAction, context);
  state = supplyResult.state;
  const styleStall = runtimePolicyRecoverStyleStall(state, effectiveAction.offenceStyle, context, syncedOpponentGearProfile);
  state = styleStall.state;
  const actorCanUseFlexibleGear = canAct(state.actors.opponent.locks, state.tick);
  const opponentUnderAggression = runtimePolicyIsAggressingActor(state, "opponent", "local-player");
  const resolvedThreatStyle = runtimePolicyResolveThreatStyle(context);

  const currentStyleEquipment = nhGearProfileActionEquipment({
    currentEquipment: state.actors.opponent.equipment,
    profile: syncedOpponentGearProfile,
    action: { ...effectiveAction, offenceStyle: desiredOrCurrentOffenceStyle, specIntent: "none" },
    threatStyle: resolvedThreatStyle,
    underPressure: opponentUnderAggression,
    hitpoints: state.actors.opponent.hitpoints,
    // Source: NhStakerBot.applySupplyIntent(REGEAR_STYLE) calls applyLoadout(currentOffence)
    // only. Flexible gear runs later from switchToStyle()/the main tick loop.
    allowFlexibleGear: false
  });
  const equipmentResult = applyRuntimeOpponentPolicyEquipmentIntent(
    state,
    effectiveAction,
    context,
    currentStyleEquipment,
    currentOffenceStyle,
    opponentUnderAggression
  );
  state = equipmentResult.state;
  if (input.rewardEpisodeActive) {
    const supplyReward = runtimePolicySupplyReward({
      stateBeforeSupply,
      stateAfterSupply: supplyResult.state,
      stateAfterEquipment: state,
      context,
      action: contextGuardedAction,
      supply: supplyResult,
      equipment: equipmentResult,
      gearProfile: syncedOpponentGearProfile
    });
    if (supplyReward) {
      state = appendRuntimePolicyRewardEvent(
        state,
        "opponent",
        "supply_reward",
        supplyReward.reward,
        supplyReward.details
      );
    }
  }

  const suppressStyleReequipThisTick =
    !styleStall.forceStyleSwitch &&
    equipmentResult.strippedSlots.length > 0 &&
    currentOffenceStyle !== null &&
    currentOffenceStyle === effectiveAction.offenceStyle;
  const javaWouldSwitchToStyle =
    !suppressStyleReequipThisTick &&
    (currentOffenceStyle !== effectiveAction.offenceStyle ||
      !runtimePolicyIsEquippedForStyle(state.actors.opponent, effectiveAction.offenceStyle, syncedOpponentGearProfile));
  const targetEquipment = nhGearProfileActionEquipment({
    currentEquipment: state.actors.opponent.equipment,
    profile: syncedOpponentGearProfile,
    action: effectiveAction,
    threatStyle: resolvedThreatStyle,
    underPressure: opponentUnderAggression,
    hitpoints: state.actors.opponent.hitpoints,
    allowFlexibleGear: actorCanUseFlexibleGear,
    // Source: NhStakerBot.switchToStyle() can call optimizeFlexibleGear(), then
    // the main tick loop calls optimizeFlexibleGear() again after currentOffence
    // is updated. Same-style ticks only receive the main-loop pass.
    flexibleGearPasses: javaWouldSwitchToStyle ? 2 : 1
  });
  const targetLoadoutId = runtimeLoadoutForPolicyAction(effectiveAction, syncedOpponentGearProfile);
  let opponentLoadoutId = targetLoadoutId;
  if (!suppressStyleReequipThisTick) {
    if (javaWouldSwitchToStyle) {
      // Source: NhStakerBot.switchToStyle() always enters applyLoadout(), and
      // applyLoadout() begins with clearAutocast() before equipping the style.
      state = setRuntimePlayerCombatAutocast(state, "opponent", null);
    }
    state = setRuntimePlayerCombatLoadout(state, "opponent", targetLoadoutId);
    state = syncRuntimePlayerCombatStateToInput(state, {
      tiles: {
        opponent: input.state.actors.opponent.tile
      },
      equipment: {
        opponent: targetEquipment
      }
    });
  } else {
    opponentLoadoutId = state.actors.opponent.loadoutId;
  }
  if (effectiveAction.offenceStyle === "magic") {
    state = runtimePolicyEnforceMagicCoreArmor(state, syncedOpponentGearProfile);
    // Source: NhStakerBot.castBarrage() calls ensureAutocast(iceBarrageSpell(),
    // ICE_BARRAGE_AUTOCAST_SLOT) before attackTarget(opponent).
    state = setRuntimePlayerCombatAutocast(state, "opponent", "ice-barrage");
  }
  const contextAfterSupply = runtimePolicyContextWithSelfActor(
    context,
    state.actors.opponent,
    runtimePolicyStats(state.actors.opponent),
    syncedOpponentGearProfile
  );
  const resolvedDefencePrayer = runtimePolicyResolveDefencePrayer(
    effectiveAction.defencePrayer,
    contextAfterSupply,
    state,
    "opponent",
    "local-player",
    input.selfPlayMode === true
  );
  if (resolvedDefencePrayer !== effectiveAction.defencePrayer) {
    effectiveAction = { ...effectiveAction, defencePrayer: resolvedDefencePrayer };
  }
  state = setRuntimePolicyOpponentCurrentOffence(state, effectiveAction.offenceStyle);
  state = setRuntimePlayerCombatPrayers(
    state,
    "opponent",
    runtimePolicyPrayersForAction(state.actors.opponent, effectiveAction, contextGuardedAction)
  );
  if (styleStall.recoveryAttempted) {
    state = runtimePolicyClearStyleStallIfReady(state, "opponent", effectiveAction.offenceStyle, context, syncedOpponentGearProfile);
  }

  if (effectiveAction.specIntent !== "none") {
    const specialKind = runtimePolicyAvailableSpecialWeaponKind(context.self);
    state = toggleRuntimePlayerCombatSpecial(state, "opponent").state;
    if (effectiveAction.specIntent === "use_special_double" && specialKind === "granite_maul") {
      state = toggleRuntimePlayerCombatSpecial(state, "opponent").state;
    }
    state = appendRuntimePolicyRewardEvent(
      state,
      "opponent",
      "gmaul_spec",
      runtimePolicyGmaulSpecReward(context, effectiveAction, stateWithRewardShaping, "opponent", input.rewardEpisodeStartTick),
      runtimePolicyGmaulSpecRewardDetails(context, effectiveAction)
    );
  } else if (action.specIntent === "none" && input.rewardEpisodeActive) {
    state = appendRuntimePolicyRewardEvent(
      state,
      "opponent",
      "gmaul_missed_spec",
      runtimePolicyMissedGmaulSpecReward(context, input.state, "opponent", input.rewardEpisodeStartTick)
    );
  }

  const movementResult = applyRuntimeOpponentPolicyMovementIntent({
    state,
    action: effectiveAction,
    context,
    opponentTile: input.opponentActor.tile,
    localTile: input.localActor.tile,
    scale,
    canStep: input.canStep,
    targetRouteStep: input.targetRouteStep,
    tileRouteStep: input.tileRouteStep,
    projectileLineOfSight: input.projectileLineOfSight,
    nextRepositionTick: input.nextRepositionTick ?? 0
  });
  state = movementResult.state;
  const magicLineOfSightResult = ensureRuntimeOpponentPolicyMagicLineOfSight({
    state,
    action: effectiveAction,
    opponentTile: movementResult.opponentTile,
    localTile: input.localActor.tile,
    movedThisTick: movementResult.moved,
    lastMoveDx: movementResult.lastMoveDx,
    lastMoveDy: movementResult.lastMoveDy,
    blockedReason: movementResult.blockedReason,
    nextRepositionTick: movementResult.nextRepositionTick ?? input.nextRepositionTick ?? 0,
    scale,
    canStep: input.canStep,
    projectileLineOfSight: input.projectileLineOfSight
  });
  state = magicLineOfSightResult.state;
  state = requestRuntimePlayerCombatAttack(state, "opponent", "local-player");

  return {
    state,
    action,
    effectiveAction,
    controllerId: input.controller.id,
    context,
    opponentLoadoutId,
    opponentTile: magicLineOfSightResult.opponentTile,
    opponentMovedThisTick: magicLineOfSightResult.moved,
    opponentLastMoveDx: magicLineOfSightResult.lastMoveDx,
    opponentLastMoveDy: magicLineOfSightResult.lastMoveDy,
    movementBlockedReason: magicLineOfSightResult.blockedReason,
    nextRepositionTick: magicLineOfSightResult.nextRepositionTick,
    consumedSupplies: supplyResult.consumed,
    strippedEquipmentSlots: equipmentResult.strippedSlots
  };
}

export function assertRuntimePolicyOpponentActionCoverage(): {
  readonly actionCount: number;
  readonly offenceStyles: number;
  readonly defencePrayers: number;
  readonly movementIntents: number;
  readonly supplyIntents: number;
  readonly specIntents: number;
} {
  assertCovered("offence style", nhOffenceStyles, runtimePolicyOpponentActionCoverage.offenceStyles);
  assertCovered("defence prayer", nhDefencePrayers, runtimePolicyOpponentActionCoverage.defencePrayers);
  assertCovered("movement intent", nhMovementIntents, runtimePolicyOpponentActionCoverage.movementIntents);
  assertCovered(
    "supply intent",
    [...nhSupplyIntents, ...nhExtraSupplyIntents],
    runtimePolicyOpponentActionCoverage.supplyIntents
  );
  assertCovered("spec intent", nhSpecIntents, runtimePolicyOpponentActionCoverage.specIntents);

  return {
    actionCount: nhPolicyActionCount,
    offenceStyles: nhOffenceStyles.length,
    defencePrayers: nhDefencePrayers.length,
    movementIntents: nhMovementIntents.length,
    supplyIntents: nhSupplyIntents.length + nhExtraSupplyIntents.length,
    specIntents: nhSpecIntents.length
  };
}

function runtimePolicyLeftPvpNoopAction(lastOffenceStyle: NhOffenceStyle | undefined): NhPolicyAction {
  // Source: NhStakerBot.tick() returns immediately after resetCombatState("left_pvp");
  // the TS bridge still returns a shaped action object for diagnostics, but it is not
  // allowed to drive prayers, gear, supplies, movement, or attacks.
  return {
    offenceStyle: lastOffenceStyle ?? "magic",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  };
}

function assertCovered<T extends string>(
  label: string,
  values: readonly T[],
  coverage: Readonly<Record<T, string>>
): void {
  for (const value of values) {
    if (!coverage[value]) {
      throw new Error(`Runtime policy opponent missing ${label} coverage for ${value}.`);
    }
  }
}

function runtimePolicyActionWithAllowedSpecIntent(
  action: NhPolicyAction,
  context: NhDuelControllerContext,
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  rewardEpisodeStartTick?: number
): NhPolicyAction {
  if (
    action.specIntent === "none" ||
    (
      !runtimePolicyActorQueuedGraniteMaulRecently(state, actorId, context.tick, rewardEpisodeStartTick) &&
      runtimePolicyCanApplySpecialSpecIntent(action, context)
    )
  ) {
    return action;
  }
  return {
    ...action,
    specIntent: "none"
  };
}

function runtimePolicyActorQueuedGraniteMaulRecently(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  tick: number,
  rewardEpisodeStartTick?: number
): boolean {
  const earliestTick = tick - runtimePolicySpecQueueCooldownTicks;
  // Source: NhStakerBot.applySpecIntent() skips policy specs when rewardLastSpecTick
  // is in the same episode and within SPEC_QUEUE_COOLDOWN_TICKS.
  return state.events.some((event) => {
    if (event.tick < earliestTick || event.tick > tick) {
      return false;
    }
    if (rewardEpisodeStartTick !== undefined && event.tick < rewardEpisodeStartTick) {
      return false;
    }
    if (event.kind === "policy-reward") {
      return event.actorId === actorId && event.reason === "gmaul_spec";
    }
    return (
      event.kind === "attack" &&
      event.attackerId === actorId &&
      event.specialAttack === "granite_maul"
    );
  });
}

function runtimePolicyGmaulSpecReward(
  context: NhDuelControllerContext,
  action: NhPolicyAction,
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  rewardEpisodeStartTick?: number
): number {
  if (action.specIntent !== "use_special" && action.specIntent !== "use_special_double") {
    return 0;
  }
  const specialKind = runtimePolicyAvailableSpecialWeaponKind(context.self);
  if (!specialKind) {
    return 0;
  }
  const doubleSpec = specialKind === "granite_maul" && action.specIntent === "use_special_double";
  const opponentHp = runtimePolicyOpponentVisibleHp(context);
  const recentHit = Math.max(0, context.self.lastDealtHit);
  const meleeProtected = activeProtectionPrayer(context.opponent.activePrayers) === protectPrayerForStyle("crush");
  const exposure = runtimePolicyOpponentMeleeSpecExposure(context, specialKind);
  const setupScore = runtimePolicySpecialSetupScore(specialKind, doubleSpec, opponentHp, recentHit, exposure, meleeProtected);
  const koChance = runtimePolicyClientSpecialKoChance(context, specialKind, doubleSpec, exposure, meleeProtected, opponentHp);
  const credibleWindow = runtimePolicySpecialCredibleSpecWindow(
    specialKind,
    doubleSpec,
    opponentHp,
    recentHit,
    exposure,
    meleeProtected,
    koChance,
    setupScore
  );

  let delta: number;
  if (koChance >= runtimePolicySpecGoodKoChance) {
    const overWindow = koChance - runtimePolicySpecGoodKoChance;
    delta = runtimePolicySpecKoWindowScale * (0.35 + overWindow) * (doubleSpec ? 1.08 : 0.92);
    delta += runtimePolicySpecSetupBonusScale * setupScore;
  } else if (credibleWindow >= runtimePolicySpecCredibleWindowFloor) {
    const overWindow = credibleWindow - runtimePolicySpecCredibleWindowFloor;
    delta = runtimePolicySpecCredibleWindowScale * overWindow * (doubleSpec ? 1.05 : 0.92);
    delta += runtimePolicySpecSetupBonusScale * setupScore * 0.35;
  } else {
    const lowScale =
      (runtimePolicySpecLowKoChance - Math.min(koChance, runtimePolicySpecLowKoChance)) /
      runtimePolicySpecLowKoChance;
    delta = -runtimePolicySpecLowEvPenalty * Math.max(0.25, lowScale) * (doubleSpec ? 1.15 : 1);
    if (setupScore >= 0.58 && koChance >= runtimePolicySpecLowKoChance * 0.75) {
      delta += runtimePolicySpecSetupBonusScale * 0.35 * setupScore;
    }
  }

  if (opponentHp >= 75 && recentHit < 20) {
    delta -= runtimePolicySpecEarlyLowPressurePenalty * (doubleSpec ? 1.25 : 1);
  }
  delta -= runtimePolicySpecialDryHighHpPenalty(specialKind, doubleSpec, opponentHp, recentHit, setupScore);
  if (meleeProtected && opponentHp > 44) {
    const prayerPenaltyScale = runtimePolicyClamp01((opponentHp - 40) / 45);
    delta -= runtimePolicySpecMeleePrayerPenalty * prayerPenaltyScale * (doubleSpec ? 1.15 : 0.85);
  }
  if (runtimePolicyActorQueuedGraniteMaulWithin(state, actorId, state.tick, runtimePolicySpecRecentRepeatTicks, rewardEpisodeStartTick) && koChance < runtimePolicySpecGoodKoChance) {
    delta -= runtimePolicySpecSpamPenalty * (doubleSpec ? 1.25 : 1);
  }
  // Source: NhStakerBot.applySpecReward() adds this policy reward immediately
  // after queueGraniteMaulSpec()/attackTarget(), so the next tick's encoded
  // rewardDelta/rewardTotal carries the quality of the chosen spec window.
  return delta;
}

function runtimePolicyGmaulSpecRewardDetails(
  context: NhDuelControllerContext,
  action: NhPolicyAction
): RuntimePolicyRewardDetails {
  const doubleSpec = action.specIntent === "use_special_double";
  const specialKind = runtimePolicyAvailableSpecialWeaponKind(context.self) ?? "granite_maul";
  const opponentHp = runtimePolicyOpponentVisibleHp(context);
  const recentHit = Math.max(0, context.self.lastDealtHit);
  const meleeProtected = activeProtectionPrayer(context.opponent.activePrayers) === protectPrayerForStyle("crush");
  const effectiveDoubleSpec = specialKind === "granite_maul" && doubleSpec;
  const exposure = runtimePolicyOpponentMeleeSpecExposure(context, specialKind);
  const setupScore = runtimePolicySpecialSetupScore(specialKind, effectiveDoubleSpec, opponentHp, recentHit, exposure, meleeProtected);
  const koChance = runtimePolicyClientSpecialKoChance(context, specialKind, effectiveDoubleSpec, exposure, meleeProtected, opponentHp);
  return {
    gmaulDoubleSpec: effectiveDoubleSpec,
    specialWeaponKind: specialKind,
    opponentStartHitpoints: opponentHp,
    recentHit,
    koChance,
    setupScore,
    credibleWindow: runtimePolicySpecialCredibleSpecWindow(
      specialKind,
      effectiveDoubleSpec,
      opponentHp,
      recentHit,
      exposure,
      meleeProtected,
      koChance,
      setupScore
    ),
    meleeProtected
  };
}

function runtimePolicyApplyPendingGmaulSpecOutcome(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  opponentId: RuntimeActorId,
  rewardEpisodeActive: boolean | undefined,
  rewardEpisodeStartTick?: number
): RuntimePlayerCombatState {
  if (!rewardEpisodeActive) {
    return state;
  }
  const pending = runtimePolicyPendingGmaulSpecEvent(state, actorId, rewardEpisodeStartTick);
  if (!pending) {
    return state;
  }
  const age = state.tick - pending.tick;
  if (age <= 0 || age > runtimePolicySpecOutcomeWindowTicks) {
    return state;
  }
  const opponent = state.actors[opponentId];
  const opponentHp = opponent?.hitpoints ?? 0;
  const dealtDelta = runtimePolicyActorDamageDealtAtTick(state.events, actorId, state.tick - 1);
  const doubleSpec = pending.gmaulDoubleSpec === true;
  const agsPending = pending.specialWeaponKind === "armadyl_godsword";
  const credibleWindow = pending.credibleWindow ?? 0;
  const startHp = pending.opponentStartHitpoints ?? 0;
  const killed = opponentHp <= 0 || (opponent?.deadUntilTick !== null && opponent?.deadUntilTick !== undefined && opponent.deadUntilTick > state.tick);
  const lowPressure = opponentHp <= (agsPending ? 44 : doubleSpec ? 42 : 30) && credibleWindow >= runtimePolicySpecCredibleWindowFloor;
  const healPressure =
    opponentHp >= startHp + 10 &&
    startHp <= (agsPending ? 72 : doubleSpec ? 76 : 56) &&
    credibleWindow >= runtimePolicySpecCredibleWindowFloor;
  const outcomeReady = killed || dealtDelta > 0 || lowPressure || healPressure || age >= runtimePolicySpecOutcomeWindowTicks;
  if (!outcomeReady) {
    return state;
  }

  let delta = 0;
  if (killed) {
    delta += runtimePolicySpecOutcomeKillBonus * (doubleSpec ? 1.08 : 0.92);
  }
  if (dealtDelta > 0) {
    const expectedHit = agsPending ? 46 : doubleSpec ? 52 : 32;
    delta += runtimePolicySpecOutcomeDamageScale * runtimePolicyClamp01(dealtDelta / expectedHit);
  }
  if (lowPressure) {
    const pressureScale = runtimePolicyClamp01(((agsPending ? 50 : doubleSpec ? 48 : 34) - opponentHp) / 32);
    delta += runtimePolicySpecOutcomePressureBonus * (0.45 + pressureScale);
  }
  if (healPressure) {
    delta += runtimePolicySpecOutcomeHealPressureBonus * (0.6 + credibleWindow);
  }
  const whiff = age >= runtimePolicySpecOutcomeWindowTicks && delta <= 0;
  if (whiff) {
    const whiffScale = pending.meleeProtected === true ? 0.55 : 1;
    delta -= runtimePolicySpecOutcomeWhiffPenalty * (0.45 + credibleWindow) * (doubleSpec ? 1.25 : 1) * whiffScale;
  }
  // Source: NhStakerBot.applyPendingSpecOutcome() applies one outcome reward
  // within SPEC_OUTCOME_WINDOW_TICKS, then clearPendingSpecOutcome().
  return appendRuntimePolicyRewardEvent(state, actorId, "gmaul_spec_outcome", delta, {
    sourcePolicyRewardId: pending.id,
    gmaulDoubleSpec: doubleSpec,
    specialWeaponKind: pending.specialWeaponKind,
    opponentStartHitpoints: startHp,
    recentHit: pending.recentHit,
    koChance: pending.koChance,
    setupScore: pending.setupScore,
    credibleWindow,
    meleeProtected: pending.meleeProtected
  }, state.tick - 1);
}

function runtimePolicyEnsurePrayerPoints(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId
): RuntimePlayerCombatState {
  const actor = state.actors[actorId];
  if (actor.prayerPoints >= actor.maxPrayerPoints) {
    return state;
  }
  // Source: NhStakerBot.ensurePrayerPoints() restores current prayer to fixed
  // before inference; this is a bot stat reset, not a consumed restore potion.
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...actor,
        prayerPoints: actor.maxPrayerPoints
      }
    }
  };
}

function runtimePolicyApplyTickRewardShaping(
  state: RuntimePlayerCombatState,
  input: {
    readonly localActor: RuntimePolicyOpponentActorView;
    readonly opponentActor: RuntimePolicyOpponentActorView;
    readonly rewardEpisodeId?: number;
    readonly rewardEpisodeActive?: boolean;
    readonly rewardEpisodeStartTick?: number;
  },
  scale: number,
  localGearProfile: NhSelectedGearProfile,
  syncedOpponentGearProfile: NhSelectedGearProfile
): RuntimePlayerCombatState {
  if (!input.rewardEpisodeActive || state.tick <= 0) {
    return state;
  }

  const localPolicyActor = runtimeCombatActorToNhDuelActor(
    "self",
    "Local trainer",
    state.actors["local-player"],
    { ...input.localActor, gearProfile: localGearProfile },
    scale,
    "policy-opponent"
  );
  const opponentPolicyActor = runtimeCombatActorToNhDuelActor(
    "opponent",
    "NH policy bot",
    state.actors.opponent,
    { ...input.opponentActor, gearProfile: syncedOpponentGearProfile },
    scale,
    "policy-self"
  );
  const context = createNhDuelControllerContext(state.tick, opponentPolicyActor, localPolicyActor, {
    rewardEpisodeId: input.rewardEpisodeId,
    rewardEpisodeActive: input.rewardEpisodeActive
  });
  const eventTick = state.tick - 1;
  const previousDistance = runtimePolicyPreviousRewardDistance(state, "opponent", eventTick);
  const dealtDelta = runtimePolicyActorDamageDealtAtTick(state.events, "opponent", eventTick);
  const rewardSnapshot = runtimePolicyActorRewardSnapshot(state.events, "opponent", eventTick, undefined);
  let next = state;

  const stylePressure = runtimePolicyStylePressureReward(state, context, "opponent", eventTick, previousDistance);
  if (!runtimePolicyHasPolicyRewardEvent(next, "opponent", "style_pressure", eventTick)) {
    next = appendRuntimePolicyRewardEvent(
      next,
      "opponent",
      "style_pressure",
      stylePressure.reward,
      stylePressure.details,
      eventTick
    );
  }

  const gearWeakness = runtimePolicyGearWeaknessPressureReward(context);
  if (gearWeakness !== 0 && !runtimePolicyHasPolicyRewardEvent(next, "opponent", "gear_weakness", eventTick)) {
    next = appendRuntimePolicyRewardEvent(next, "opponent", "gear_weakness", gearWeakness, {
      offenceStyle: context.self.lastOffenceStyle ?? undefined,
      protectedStyle: runtimePolicyProtectedStyleFromPrayer(activeProtectionPrayer(context.opponent.activePrayers)) ?? undefined
    }, eventTick);
  }

  const meleeThreat = runtimePolicyMeleeThreatReward(state, context, "opponent", eventTick);
  if (!runtimePolicyHasPolicyRewardEvent(next, "opponent", "melee_threat", eventTick)) {
    next = appendRuntimePolicyRewardEvent(next, "opponent", "melee_threat", meleeThreat.reward, {
      meleeThreatPotential: meleeThreat.potential,
      offenceStyle: "melee",
      protectedStyle: runtimePolicyProtectedStyleFromPrayer(activeProtectionPrayer(context.opponent.activePrayers)) ?? undefined
    }, eventTick);
  }

  const meleeTelegraph = runtimePolicyMeleeTelegraphReward(context);
  if (meleeTelegraph !== 0 && !runtimePolicyHasPolicyRewardEvent(next, "opponent", "melee_telegraph", eventTick)) {
    next = appendRuntimePolicyRewardEvent(next, "opponent", "melee_telegraph", meleeTelegraph, {
      offenceStyle: context.self.lastOffenceStyle ?? undefined,
      protectedStyle: runtimePolicyProtectedStyleFromPrayer(activeProtectionPrayer(context.opponent.activePrayers)) ?? undefined
    }, eventTick);
  }

  const freezeControl = runtimePolicyFreezeControlRewards(
    state,
    context,
    "opponent",
    eventTick,
    previousDistance,
    dealtDelta,
    rewardSnapshot.latest.rewardDps
  );
  for (const reward of freezeControl) {
    if (!runtimePolicyHasPolicyRewardEvent(next, "opponent", reward.reason, eventTick)) {
      next = appendRuntimePolicyRewardEvent(next, "opponent", reward.reason, reward.reward, reward.details, eventTick);
    }
  }

  const spacing = runtimePolicySpacingRewards(context, previousDistance);
  for (const reward of spacing) {
    if (!runtimePolicyHasPolicyRewardEvent(next, "opponent", reward.reason, eventTick)) {
      next = appendRuntimePolicyRewardEvent(next, "opponent", reward.reason, reward.reward, reward.details, eventTick);
    }
  }

  const statState = runtimePolicyStatStateReward(context.self.stats);
  if (statState.reward !== 0 && !runtimePolicyHasPolicyRewardEvent(next, "opponent", "stat_state", eventTick)) {
    next = appendRuntimePolicyRewardEvent(next, "opponent", "stat_state", statState.reward, statState.details, eventTick);
  }

  const defenceBelief = runtimePolicyDefenceBeliefReward(context, state, "opponent", eventTick, previousDistance);
  if (
    defenceBelief &&
    !runtimePolicyHasPolicyRewardEvent(next, "opponent", "defence_belief", eventTick)
  ) {
    next = appendRuntimePolicyRewardEvent(
      next,
      "opponent",
      "defence_belief",
      defenceBelief.reward,
      defenceBelief.details,
      eventTick
    );
  }

  const actualPrayer = runtimePolicyActualPrayerHitReward(state.events, "opponent", eventTick);
  if (
    (actualPrayer.details.onPrayerHits || actualPrayer.details.offPrayerHits) &&
    !runtimePolicyHasPolicyRewardEvent(next, "opponent", "actual_prayer", eventTick)
  ) {
    next = appendRuntimePolicyRewardEvent(
      next,
      "opponent",
      "actual_prayer",
      actualPrayer.reward,
      actualPrayer.details,
      eventTick
    );
  }

  const deathSupply = runtimePolicyDeathSupplyReward(next, "opponent", eventTick, input.rewardEpisodeStartTick);
  if (deathSupply && !runtimePolicyHasPolicyRewardEvent(next, "opponent", "death_supply", eventTick)) {
    next = appendRuntimePolicyRewardEvent(next, "opponent", "death_supply", deathSupply.reward, deathSupply.details, eventTick);
  }

  return next;
}

function runtimePolicyStylePressureReward(
  state: RuntimePlayerCombatState,
  context: NhDuelControllerContext,
  actorId: RuntimeActorId,
  eventTick: number,
  previousDistance: number | null
): { readonly reward: number; readonly details: RuntimePolicyRewardDetails } {
  const offenceStyle = context.self.lastOffenceStyle;
  const distance = runtimePolicyObservedDistance(context);
  if (!offenceStyle) {
    return {
      reward: 0,
      details: { styleProtected: false, distance, previousDistance: previousDistance ?? undefined }
    };
  }
  const protectedStyle = runtimePolicyProtectedStyleFromPrayer(activeProtectionPrayer(context.opponent.activePrayers));
  if (!protectedStyle) {
    return {
      reward: 0,
      details: { offenceStyle, styleProtected: false, distance, previousDistance: previousDistance ?? undefined }
    };
  }
  const inRange = runtimePolicyStyleInOffensiveRange(context, offenceStyle);
  const intoProtection = offenceStyle === protectedStyle;
  let protectedStyleStreak = 0;
  let reward = 0;
  if (intoProtection) {
    protectedStyleStreak = runtimePolicyPreviousProtectedStyleStreak(state, actorId, eventTick, offenceStyle, protectedStyle) + 1;
    if (inRange) {
      const penalizedTicks = protectedStyleStreak - runtimePolicyProtectedStyleStickGraceTicks;
      if (penalizedTicks > 0) {
        const stickyPenalty = runtimePolicyProtectedStyleStickPenalty * Math.min(3, penalizedTicks);
        reward = -(runtimePolicyIntoPrayerPenalty + stickyPenalty);
      }
    }
  } else if (inRange) {
    reward = runtimePolicyOffPrayerBonus + runtimePolicyUnprotectedStylePressureBonus;
  }

  return {
    reward,
    details: {
      offenceStyle,
      protectedStyle,
      protectedStyleStreak,
      styleProtected: intoProtection,
      distance,
      previousDistance: previousDistance ?? undefined
    }
  };
}

function runtimePolicyPreviousProtectedStyleStreak(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  eventTick: number,
  offenceStyle: NhOffenceStyle,
  protectedStyle: NhOffenceStyle
): number {
  const previous = [...state.events].reverse().find(
    (event): event is Extract<RuntimePlayerCombatEvent, { readonly kind: "policy-reward" }> =>
      event.kind === "policy-reward" &&
      event.actorId === actorId &&
      event.reason === "style_pressure" &&
      event.tick === eventTick - 1
  );
  if (
    !previous ||
    previous.styleProtected !== true ||
    previous.offenceStyle !== offenceStyle ||
    previous.protectedStyle !== protectedStyle
  ) {
    return 0;
  }
  return previous.protectedStyleStreak ?? 0;
}

function runtimePolicyGearWeaknessPressureReward(context: NhDuelControllerContext): number {
  if (context.opponent.observedInfoKnown === false) {
    return 0;
  }
  const offenceStyle = context.self.lastOffenceStyle;
  if (!offenceStyle) {
    return 0;
  }
  if (!runtimePolicyStyleInOffensiveRange(context, offenceStyle)) {
    return 0;
  }
  const protectedStyle = runtimePolicyProtectedStyleFromPrayer(activeProtectionPrayer(context.opponent.activePrayers));
  if (protectedStyle === offenceStyle) {
    return 0;
  }
  const opponentBonuses = aggregateVisibleEquipmentBonuses(context.opponent.equipment, equipmentRows);
  const selectedWeakness = runtimePolicyWeaknessForStyle(opponentBonuses, offenceStyle);
  const bestOpen = runtimePolicyBestOpenWeakness(context, opponentBonuses);
  let reward = runtimePolicyGearWeaknessPressureScale * selectedWeakness;
  const gap = bestOpen - selectedWeakness;
  if (gap > 0.12) {
    reward -= runtimePolicyGearWeaknessGapScale * Math.min(1, gap);
  }
  if (offenceStyle === "melee" && selectedWeakness >= -0.05 && runtimePolicyObservedMeleeReachable(context)) {
    const distance = runtimePolicyObservedDistance(context);
    const rangeScale = distance === 2 ? 0.7 : 1;
    reward += runtimePolicyAdjacentTentacleWeaknessBonus * rangeScale * (0.2 + Math.max(0, selectedWeakness));
  } else if (runtimePolicyObservedMeleeReachable(context) && protectedStyle !== "melee") {
    const meleeWeakness = runtimePolicyWeaknessForStyle(opponentBonuses, "melee");
    if (meleeWeakness >= -0.08 && meleeWeakness >= selectedWeakness - 0.12) {
      reward -= runtimePolicyOpenTentacleMissPenalty * (0.55 + Math.max(0, meleeWeakness));
    }
  }
  return Math.max(-0.24, Math.min(0.28, reward));
}

function runtimePolicyBestOpenWeakness(context: NhDuelControllerContext, opponentBonuses: BonusTable): number {
  const protectedStyle = runtimePolicyProtectedStyleFromPrayer(activeProtectionPrayer(context.opponent.activePrayers));
  let best = -1;
  for (const style of ["magic", "ranged", "melee"] as const) {
    if (protectedStyle === style || !runtimePolicyStyleInOffensiveRange(context, style)) {
      continue;
    }
    best = Math.max(best, runtimePolicyWeaknessForStyle(opponentBonuses, style));
  }
  return best <= -1 ? 0 : best;
}

function runtimePolicyMeleeThreatReward(
  state: RuntimePlayerCombatState,
  context: NhDuelControllerContext,
  actorId: RuntimeActorId,
  eventTick: number
): { readonly reward: number; readonly potential: number } {
  const potential = runtimePolicyMeleeThreatPotential(context);
  const previous = runtimePolicyPreviousMeleeThreatPotential(state, actorId, eventTick);
  const reward = previous === null ? 0 : runtimePolicyMeleeThreatPotentialScale * (potential - previous);
  return { reward, potential };
}

function runtimePolicyMeleeThreatPotential(context: NhDuelControllerContext): number {
  if (context.opponent.observedInfoKnown === false) {
    return 0;
  }
  const protectedStyle = runtimePolicyProtectedStyleFromPrayer(activeProtectionPrayer(context.opponent.activePrayers));
  if (protectedStyle === "melee" || !runtimePolicyObservedMeleeReachable(context)) {
    return 0;
  }
  const opponentBonuses = aggregateVisibleEquipmentBonuses(context.opponent.equipment, equipmentRows);
  const meleeWeakness = runtimePolicyWeaknessForStyle(opponentBonuses, "melee");
  const magicWeakness = protectedStyle === "magic" ? -1 : runtimePolicyWeaknessForStyle(opponentBonuses, "magic");
  const rangedWeakness = protectedStyle === "ranged" ? -1 : runtimePolicyWeaknessForStyle(opponentBonuses, "ranged");
  const bestNonMelee = Math.max(magicWeakness, rangedWeakness);
  const openValue = Math.max(0, meleeWeakness + 0.18);
  const relativeEdge = Math.max(0, meleeWeakness - bestNonMelee + 0.1);
  const distance = runtimePolicyObservedDistance(context);
  const distanceScale = distance <= 1 ? 1 : 0.72;
  return runtimePolicyClamp01(distanceScale * (openValue * 0.65 + relativeEdge * 0.55));
}

function runtimePolicyPreviousMeleeThreatPotential(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  eventTick: number
): number | null {
  const previous = [...state.events].reverse().find(
    (event): event is Extract<RuntimePlayerCombatEvent, { readonly kind: "policy-reward" }> =>
      event.kind === "policy-reward" &&
      event.actorId === actorId &&
      event.reason === "melee_threat" &&
      event.tick === eventTick - 1
  );
  return previous?.meleeThreatPotential ?? null;
}

function runtimePolicyMeleeTelegraphReward(context: NhDuelControllerContext): number {
  if (context.self.lastOffenceStyle !== "melee") {
    return 0;
  }
  const selfAttackReady = canAttackByTimer(context.self.attackTimer, context.tick);
  const practicalMeleeReach = runtimePolicyObservedMeleeReachable(context);
  if (practicalMeleeReach && selfAttackReady) {
    return 0;
  }
  const protectedStyle = runtimePolicyProtectedStyleFromPrayer(activeProtectionPrayer(context.opponent.activePrayers));
  if (protectedStyle === "melee") {
    return 0;
  }
  return -runtimePolicyMeleeTelegraphPenalty * (practicalMeleeReach ? 0.55 : 1);
}

type RuntimePolicyRewardReason = Extract<RuntimePlayerCombatEvent, { readonly kind: "policy-reward" }>["reason"];

function runtimePolicyFreezeControlRewards(
  state: RuntimePlayerCombatState,
  context: NhDuelControllerContext,
  actorId: RuntimeActorId,
  eventTick: number,
  previousDistance: number | null,
  dealtDelta: number,
  rewardDps: number
): readonly { readonly reason: RuntimePolicyRewardReason; readonly reward: number; readonly details: RuntimePolicyRewardDetails }[] {
  const distance = runtimePolicyObservedDistance(context);
  const active = isFrozen(context.opponent.locks, context.tick) && !isFrozen(context.self.locks, context.tick) && distance === 0;
  if (!active) {
    return [];
  }

  const controlValue = runtimePolicyUnderControlValue(context);
  const selfAttackReady = canAttackByTimer(context.self.attackTimer, context.tick);
  const productiveControl = runtimePolicyIsProductiveUnderControl(context, selfAttackReady, controlValue);
  const supplied = runtimePolicyActorSuppliedAtOrBefore(state.events, actorId, eventTick);
  const entry = previousDistance !== null && previousDistance > 0;
  const rewards: { readonly reason: RuntimePolicyRewardReason; readonly reward: number; readonly details: RuntimePolicyRewardDetails }[] = [];

  let freezeUnderTicks = 0;
  let freezeUnderReward = 0;
  if (!productiveControl && dealtDelta <= 0 && rewardDps <= 0) {
    freezeUnderTicks = runtimePolicyPreviousFreezeUnderNoPressureTicks(state, actorId, eventTick) + 1;
    const penalizedTicks = freezeUnderTicks - runtimePolicyFreezeUnderNoPressureGraceTicks;
    if (penalizedTicks > 0) {
      freezeUnderReward = -runtimePolicyFreezeUnderNoPressurePenalty * Math.min(4, penalizedTicks);
    }
  }
  rewards.push({
    reason: "freeze_under_no_pressure",
    reward: freezeUnderReward,
    details: {
      distance,
      previousDistance: previousDistance ?? undefined,
      freezeUnderNoPressureTicks: freezeUnderTicks,
      controlValue,
      productiveControl
    }
  });

  let underControlIdleTicks = 0;
  let underControlReward = 0;
  if (entry) {
    underControlReward += runtimePolicyUnderControlEntryBonus * (0.5 + controlValue);
  }
  if (productiveControl) {
    underControlReward += runtimePolicyUnderControlProductiveScale * (0.35 + controlValue);
    if (supplied) {
      underControlReward += runtimePolicyUnderControlSafeSupplyBonus * (0.45 + controlValue);
    }
  } else if (selfAttackReady && dealtDelta <= 0) {
    underControlIdleTicks = runtimePolicyPreviousUnderControlIdleTicks(state, actorId, eventTick) + 1;
    const penalizedTicks = underControlIdleTicks - runtimePolicyUnderControlIdleGraceTicks;
    if (penalizedTicks > 0) {
      underControlReward -= runtimePolicyUnderControlIdlePenalty * Math.min(4, penalizedTicks);
    }
  }
  rewards.push({
    reason: "under_control",
    reward: underControlReward,
    details: {
      distance,
      previousDistance: previousDistance ?? undefined,
      underControlIdleTicks,
      controlValue,
      productiveControl,
      entry
    }
  });

  return rewards;
}

function runtimePolicySpacingRewards(
  context: NhDuelControllerContext,
  previousDistance: number | null
): readonly { readonly reason: RuntimePolicyRewardReason; readonly reward: number; readonly details: RuntimePolicyRewardDetails }[] {
  const distance = runtimePolicyObservedDistance(context);
  const rewards: { readonly reason: RuntimePolicyRewardReason; readonly reward: number; readonly details: RuntimePolicyRewardDetails }[] = [];
  const opponentFrozen = isFrozen(context.opponent.locks, context.tick);
  const selfFrozen = isFrozen(context.self.locks, context.tick);
  const underControlValue = opponentFrozen && !selfFrozen ? runtimePolicyUnderControlValue(context) : 0;

  if (opponentFrozen && !selfFrozen && previousDistance !== null) {
    const distanceDelta = distance < 0 ? 0 : previousDistance - distance;
    let freezePosition = 0;
    if (distance === 0 && previousDistance > 0) {
      freezePosition += runtimePolicyFreezeStandUnderBonus;
    } else if (distance <= 1 && distanceDelta > 0) {
      freezePosition += runtimePolicyFreezeStandUnderBonus * 0.35;
    }
    if (freezePosition !== 0) {
      rewards.push({
        reason: "freeze_position",
        reward: freezePosition,
        details: { distance, previousDistance }
      });
    }
    if (
      distance <= 1 &&
      previousDistance === 2 &&
      runtimePolicySpecApproachWindowFromContext(context, false) >= runtimePolicySpecApproachWindowFloor
    ) {
      rewards.push({
        reason: "spec_approach",
        reward: runtimePolicySpecApproachBonus,
        details: { distance, previousDistance }
      });
    }
  }

  if (context.self.lastOffenceStyle === "melee" && !runtimePolicyObservedMeleeReachable(context)) {
    let penalty = -runtimePolicyMeleeOutOfRangePenalty * Math.max(1, Math.min(3, distance - 1));
    if (selfFrozen) {
      penalty -= runtimePolicyFrozenMeleeLockPenalty;
    }
    rewards.push({
      reason: "melee_range",
      reward: penalty,
      details: { distance, previousDistance: previousDistance ?? undefined, offenceStyle: "melee" }
    });
  } else if (
    (context.self.lastOffenceStyle === "magic" || context.self.lastOffenceStyle === "ranged") &&
    opponentFrozen &&
    !selfFrozen &&
    distance > 1 &&
    underControlValue <= runtimePolicyUnderControlRouteValueFloor
  ) {
    rewards.push({
      reason: "range_spacing",
      reward: runtimePolicyRangedMagicSpaceBonus * Math.min(3, distance - 1),
      details: { distance, previousDistance: previousDistance ?? undefined, offenceStyle: context.self.lastOffenceStyle ?? undefined }
    });
  }

  if (
    selfFrozen &&
    distance > 1 &&
    (context.self.lastOffenceStyle === "magic" || context.self.lastOffenceStyle === "ranged")
  ) {
    rewards.push({
      reason: "frozen_cast",
      reward: runtimePolicyFrozenCastKiteBonus,
      details: { distance, previousDistance: previousDistance ?? undefined, offenceStyle: context.self.lastOffenceStyle ?? undefined }
    });
  }

  return rewards;
}

interface RuntimePolicyStyleBelief {
  readonly magic: number;
  readonly ranged: number;
  readonly melee: number;
  readonly confidence: number;
  readonly readable: boolean;
}

function runtimePolicyDefenceBeliefReward(
  context: NhDuelControllerContext,
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  eventTick: number,
  previousDistance: number | null
): { readonly reward: number; readonly details: RuntimePolicyRewardDetails } | null {
  const distance = runtimePolicyObservedDistance(context);
  const threatStyle = runtimePolicyResolveThreatStyle(context);
  const defencePrayer = activeProtectionPrayer(context.self.activePrayers);
  const hp = context.self.stats.hitpoints.current;
  const takenDelta = runtimePolicyActorDamageTakenAtTick(state.events, actorId, eventTick);
  const belief = runtimePolicyClientStyleBelief(context, state.events, "local-player", eventTick, threatStyle, distance);
  const noPrayerDamage = runtimePolicyExpectedClientThreatDamage(context, belief, undefined, distance);
  if (noPrayerDamage <= 0) {
    return null;
  }
  const chosenDamage = runtimePolicyExpectedClientThreatDamage(context, belief, defencePrayer, distance);
  const magicDamage = runtimePolicyExpectedClientThreatDamage(context, belief, "protect_from_magic", distance);
  const rangedDamage = runtimePolicyExpectedClientThreatDamage(context, belief, "protect_from_missiles", distance);
  const meleeDamage = runtimePolicyExpectedClientThreatDamage(context, belief, "protect_from_melee", distance);
  const averagePrayerDamage = (magicDamage + rangedDamage + meleeDamage) / 3;
  const bestPrayerDamage = Math.min(magicDamage, rangedDamage, meleeDamage);
  const chosenReduction = noPrayerDamage - chosenDamage;
  const averageReduction = noPrayerDamage - averagePrayerDamage;
  const expectedRisk = runtimePolicyExpectedClientKoRisk(context, belief, hp, undefined, distance);
  const hitRisk = takenDelta <= 0 ? 0 : Math.min(1, takenDelta / 24);
  const pressure = Math.max(expectedRisk, hitRisk, runtimePolicyClamp01(noPrayerDamage / 55));
  if (!belief.readable && takenDelta <= 0 && pressure < 0.35) {
    return null;
  }
  if (pressure < runtimePolicyDefenceBeliefMinPressure) {
    return null;
  }
  const edge = (chosenReduction - averageReduction) / 24;
  const confidenceScale = belief.readable ? 0.4 + belief.confidence : 0.35;
  let delta = edge * runtimePolicyDefenceBeliefEvScale * confidenceScale * (0.45 + pressure);
  if (belief.readable) {
    const bestGap = Math.max(0, chosenDamage - bestPrayerDamage) / 24;
    if (bestGap > 0) {
      delta -= bestGap * runtimePolicyDefenceBeliefBestGapScale * confidenceScale * (0.35 + pressure);
    } else {
      delta += runtimePolicyDefenceBeliefBestMatchBonus * confidenceScale * pressure;
    }
  }
  if (takenDelta > 0) {
    delta += edge * runtimePolicyDefenceBeliefHitScale * confidenceScale * Math.min(3, takenDelta / 8);
  }
  if (delta === 0) {
    return null;
  }
  return {
    reward: delta,
    details: {
      defencePrayer,
      offenceStyle: threatStyle ?? undefined,
      magicBelief: belief.magic,
      rangedBelief: belief.ranged,
      meleeBelief: belief.melee,
      beliefConfidence: belief.confidence,
      beliefReadable: belief.readable,
      noPrayerDamage,
      chosenPrayerDamage: chosenDamage,
      bestPrayerDamage,
      averagePrayerDamage,
      expectedRisk,
      pressure,
      distance: distance < 0 ? undefined : distance
    }
  };
}

function runtimePolicyClientStyleBelief(
  context: NhDuelControllerContext,
  events: readonly RuntimePlayerCombatEvent[],
  observedActorId: RuntimeActorId,
  eventTick: number,
  fallbackThreatStyle: NhOffenceStyle | null,
  distance: number
): RuntimePolicyStyleBelief {
  let magic = 1;
  let ranged = 1;
  let melee = 1;
  let readable = false;
  const addEvidence = (style: NhOffenceStyle | null | undefined, weight: number): void => {
    if (!style) {
      return;
    }
    if (style === "magic") {
      magic += weight;
    } else if (style === "ranged") {
      ranged += weight;
    } else {
      melee += weight;
    }
    readable = true;
  };

  if (context.opponent.observedInfoKnown !== false) {
    addEvidence(context.opponent.lastOffenceStyle, 2.2);
    addEvidence(context.opponent.lastVisibleOpponentStyle, 1.2);
    addEvidence(policyStyleForRuntimeWeaponId(context.opponent.weaponId), 1.45);
  }

  let observations = 0;
  let weight = 0.52;
  for (const event of [...events].reverse()) {
    if (observations >= 6) {
      break;
    }
    if (event.tick > eventTick || event.tick < eventTick - 16) {
      continue;
    }
    if (event.kind !== "attack" || event.attackerId !== observedActorId) {
      continue;
    }
    addEvidence(runtimePolicyOffenceStyleForCombatStyle(event.style), weight);
    observations++;
    weight *= 0.72;
  }

  addEvidence(fallbackThreatStyle, 0.35);
  if (!runtimePolicyObservedOpponentMeleeReachable(context)) {
    magic += 0.35;
    ranged += 0.35;
    if (isFrozen(context.opponent.locks, context.tick) || isFrozen(context.self.locks, context.tick)) {
      melee *= 0.72;
    }
  } else if (distance >= 0) {
    melee += 0.25;
  }

  const total = Math.max(0.001, magic + ranged + melee);
  const normalizedMagic = magic / total;
  const normalizedRanged = ranged / total;
  const normalizedMelee = melee / total;
  const confidence = Math.max(normalizedMagic, normalizedRanged, normalizedMelee);
  return {
    magic: normalizedMagic,
    ranged: normalizedRanged,
    melee: normalizedMelee,
    confidence,
    readable: readable || confidence >= 0.46
  };
}

function runtimePolicyExpectedClientThreatDamage(
  context: NhDuelControllerContext,
  belief: RuntimePolicyStyleBelief,
  defencePrayer: ProtectionPrayerId | undefined,
  distance: number
): number {
  return (
    belief.magic * runtimePolicyClientStyleThreatDamage(context, "magic", defencePrayer, distance) +
    belief.ranged * runtimePolicyClientStyleThreatDamage(context, "ranged", defencePrayer, distance) +
    belief.melee * runtimePolicyClientStyleThreatDamage(context, "melee", defencePrayer, distance)
  );
}

function runtimePolicyExpectedClientKoRisk(
  context: NhDuelControllerContext,
  belief: RuntimePolicyStyleBelief,
  hp: number,
  defencePrayer: ProtectionPrayerId | undefined,
  distance: number
): number {
  return (
    belief.magic * runtimePolicySoftKoRisk(hp, runtimePolicyClientStyleThreatDamage(context, "magic", defencePrayer, distance), 8) +
    belief.ranged * runtimePolicySoftKoRisk(hp, runtimePolicyClientStyleThreatDamage(context, "ranged", defencePrayer, distance), 8) +
    belief.melee * runtimePolicySoftKoRisk(hp, runtimePolicyClientStyleThreatDamage(context, "melee", defencePrayer, distance), 8)
  );
}

function runtimePolicyClientStyleThreatDamage(
  context: NhDuelControllerContext,
  style: NhOffenceStyle,
  defencePrayer: ProtectionPrayerId | undefined,
  distance: number
): number {
  if (!runtimePolicyObservedStyleInRange(context, style, distance)) {
    return 0;
  }
  let firstHit = runtimePolicyEstimatedThreatMaxHit(context, style);
  let followup = 0;
  if ((style === "melee" || style === "ranged") && context.opponent.gmaul.specialEnergy >= 50) {
    if (runtimePolicyClientGmaulFollowupPossible(context, style)) {
      followup =
        context.opponent.weaponId === "granite_maul" && context.opponent.gmaul.specialEnergy >= 100
          ? runtimePolicyClientThreatGmaulDoubleMax
          : runtimePolicyClientThreatGmaulMax;
    }
  }
  if (runtimePolicyProtectedStyleFromPrayer(defencePrayer) === style) {
    firstHit = Math.max(0, Math.round(firstHit * runtimePolicyClientThreatPrayerReduction));
    followup = Math.max(0, Math.round(followup * runtimePolicyClientThreatPrayerReduction));
  }
  return Math.max(0, firstHit + followup);
}

function runtimePolicyObservedStyleInRange(
  context: NhDuelControllerContext,
  style: NhOffenceStyle | null,
  distance: number
): boolean {
  if (!style) {
    return false;
  }
  if (style === "melee") {
    return runtimePolicyObservedOpponentMeleeReachable(context);
  }
  return distance > 0 && distance <= runtimePolicyClientThreatRange;
}

function runtimePolicyActualPrayerHitReward(
  events: readonly RuntimePlayerCombatEvent[],
  actorId: RuntimeActorId,
  eventTick: number
): { readonly reward: number; readonly details: RuntimePolicyRewardDetails } {
  let onPrayerHits = 0;
  let onPrayerDamage = 0;
  let offPrayerHits = 0;
  let offPrayerDamage = 0;
  for (const event of events) {
    if (event.kind !== "hitsplat" || event.tick !== eventTick || event.targetActorId !== actorId) {
      continue;
    }
    if (event.defenderProtectionPrayer === protectPrayerForStyle(event.style)) {
      onPrayerHits++;
      onPrayerDamage += event.damage;
    } else {
      offPrayerHits++;
      offPrayerDamage += event.damage;
    }
  }
  const reward =
    onPrayerHits * runtimePolicyActualPrayerOnHitBonus +
    onPrayerDamage * runtimePolicyActualPrayerOnDamageScale -
    (offPrayerHits * runtimePolicyActualPrayerOffHitPenalty + offPrayerDamage * runtimePolicyActualPrayerOffDamageScale);
  return {
    reward,
    details: {
      onPrayerHits,
      offPrayerHits,
      onPrayerDamage,
      offPrayerDamage
    }
  };
}

function runtimePolicyUnderControlValue(context: NhDuelControllerContext): number {
  if (!isFrozen(context.opponent.locks, context.tick) || isFrozen(context.self.locks, context.tick)) {
    return 0;
  }
  const threatStyle = runtimePolicyResolveThreatStyle(context);
  const defencePrayer = runtimePolicyProtectedStyleFromPrayer(activeProtectionPrayer(context.self.activePrayers));
  const estimatedMaxHit = runtimePolicyEstimatedThreatMaxHit(context, threatStyle);
  const prayerAdjustedMax = defencePrayer === threatStyle ? Math.round(estimatedMaxHit * runtimePolicyClientThreatPrayerReduction) : estimatedMaxHit;
  const risk = runtimePolicySoftKoRisk(
    context.self.stats.hitpoints.current,
    prayerAdjustedMax,
    runtimePolicyObservedOpponentMeleeReachable(context) ? 10 : 4
  );
  const hpRecovery = runtimePolicyClamp01((82 - context.self.stats.hitpoints.current) / 40);
  const prayerRecovery = runtimePolicyClamp01((55 - context.self.stats.prayer.current) / 45);
  const statRecovery = runtimePolicyClamp01(runtimePolicyCombatDeficitScore(context.self.stats) / 1.65);
  const recentPressure = runtimePolicyClamp01(context.self.lastTakenHit / 32);
  const specSetup = runtimePolicySpecApproachWindowFromContext(context, false);
  const cooldownValue = canAttackByTimer(context.self.attackTimer, context.tick) ? 0 : 0.22;
  return runtimePolicyClamp01(
    risk * 0.36 +
      hpRecovery * 0.26 +
      prayerRecovery * 0.14 +
      statRecovery * 0.12 +
      recentPressure * 0.16 +
      specSetup * 0.18 +
      cooldownValue +
      0.2
  );
}

function runtimePolicyIsProductiveUnderControl(
  context: NhDuelControllerContext,
  selfAttackReady: boolean,
  controlValue: number
): boolean {
  if (!isFrozen(context.opponent.locks, context.tick) || isFrozen(context.self.locks, context.tick)) {
    return false;
  }
  const distance = runtimePolicyObservedDistance(context);
  if (distance !== 0) {
    return false;
  }
  if (context.self.ateFoodLastTick || context.self.drankPotionLastTick) {
    return controlValue >= 0.18;
  }
  if (!selfAttackReady) {
    return true;
  }
  if (controlValue >= 0.34) {
    return true;
  }
  return (
    runtimePolicySpecApproachWindowFromContext(context, false) >= runtimePolicySpecApproachWindowFloor &&
    (context.self.stats.hitpoints.current < 86 || runtimePolicyOpponentVisibleHp(context) < 74)
  );
}

function runtimePolicySpecApproachWindowFromContext(context: NhDuelControllerContext, doubleSpecOnly: boolean): number {
  const specialKind = runtimePolicyAvailableSpecialWeaponKind(context.self);
  if (
    !canAct(context.self.locks, context.tick) ||
    isFrozen(context.self.locks, context.tick) ||
    context.self.stats.hitpoints.current <= 0 ||
    specialKind === null ||
    (doubleSpecOnly && specialKind !== "granite_maul")
  ) {
    return 0;
  }
  const distance = runtimePolicyObservedDistance(context);
  if (
    distance < 0 ||
    distance > 2 ||
    context.self.gmaul.specialEnergy < runtimePolicySpecialRequiredEnergy(specialKind, false) ||
    (specialKind === "armadyl_godsword" && !canAttackByTimer(context.self.attackTimer, context.tick))
  ) {
    return 0;
  }
  // Source: NhStakerBot.specApproachWindow() values two-tile approach windows
  // before the special weapon is already in melee reach.
  const exposure = runtimePolicyOpponentMeleeSpecExposure(context, specialKind);
  const meleeProtected = activeProtectionPrayer(context.opponent.activePrayers) === protectPrayerForStyle("crush");
  const opponentHp = runtimePolicyOpponentVisibleHp(context);
  const recentHit = Math.max(0, context.self.lastDealtHit);
  const single = doubleSpecOnly
    ? 0
    : runtimePolicySpecialCredibleSpecWindow(
        specialKind,
        false,
        opponentHp,
        recentHit,
        exposure,
        meleeProtected,
        runtimePolicyClientSpecialKoChance(context, specialKind, false, exposure, meleeProtected, opponentHp, false),
        runtimePolicySpecialSetupScore(specialKind, false, opponentHp, recentHit, exposure, meleeProtected)
      );
  const double =
    specialKind === "granite_maul" && context.self.gmaul.specialEnergy >= runtimePolicySpecialRequiredEnergy(specialKind, true)
      ? runtimePolicyGmaulCredibleSpecWindow(
          true,
          opponentHp,
          recentHit,
          exposure,
          meleeProtected,
          runtimePolicyClientGmaulKoChance(context, true, exposure, meleeProtected, opponentHp, false),
          runtimePolicyGmaulSetupScore(true, opponentHp, recentHit, exposure, meleeProtected)
        )
      : 0;
  return Math.max(single, double);
}

function runtimePolicyCombatDeficitScore(stats: NhDuelActorState["stats"]): number {
  return Math.min(
    2.5,
    runtimePolicyStatDeficit(stats.attack.current, stats.attack.fixed, 35) +
      runtimePolicyStatDeficit(stats.strength.current, stats.strength.fixed, 35) +
      runtimePolicyStatDeficit(stats.ranged.current, stats.ranged.fixed, 35) +
      runtimePolicyStatDeficit(stats.magic.current, stats.magic.fixed, 35)
  );
}

function runtimePolicyStatStateReward(
  stats: NhDuelActorState["stats"]
): { readonly reward: number; readonly details: RuntimePolicyRewardDetails } {
  const boostedCombatLevels = runtimePolicyTotalBoostedCombatLevels(stats);
  const brewedDownCombatLevels = runtimePolicyTotalBrewedDownCombatLevels(stats);
  const pottedStateBonus = Math.min(
    runtimePolicyPottedStateMax,
    boostedCombatLevels * runtimePolicyPottedStatePerLevel
  );
  const brewedDownPenalty = Math.min(
    runtimePolicyBrewedDownMax,
    brewedDownCombatLevels * runtimePolicyBrewedDownPerLevel
  );
  const combatDeficitScore = runtimePolicyCombatDeficitScore(stats);
  const combatDeficitPenalty = combatDeficitScore * runtimePolicyCombatDeficitPenaltyScale;
  // Source: NhStakerBot.updateRewardEpisode() adds pottedStateBonus - brewedDownPenalty,
  // then subtracts combatDeficitScore() * REWARD_COMBAT_DEFICIT_PENALTY_SCALE.
  return {
    reward: pottedStateBonus - brewedDownPenalty - combatDeficitPenalty,
    details: {
      boostedCombatLevels,
      brewedDownCombatLevels,
      pottedStateBonus,
      brewedDownPenalty,
      combatDeficitScore,
      combatDeficitPenalty
    }
  };
}

function runtimePolicyTotalBoostedCombatLevels(stats: NhDuelActorState["stats"]): number {
  return (
    runtimePolicyBoostedLevels(stats.attack.current, stats.attack.fixed) +
    runtimePolicyBoostedLevels(stats.strength.current, stats.strength.fixed) +
    runtimePolicyBoostedLevels(stats.defence.current, stats.defence.fixed) +
    runtimePolicyBoostedLevels(stats.ranged.current, stats.ranged.fixed)
  );
}

function runtimePolicyTotalBrewedDownCombatLevels(stats: NhDuelActorState["stats"]): number {
  return (
    runtimePolicyBrewedDownLevels(stats.attack.current, stats.attack.fixed) +
    runtimePolicyBrewedDownLevels(stats.strength.current, stats.strength.fixed) +
    runtimePolicyBrewedDownLevels(stats.defence.current, stats.defence.fixed) +
    runtimePolicyBrewedDownLevels(stats.ranged.current, stats.ranged.fixed)
  );
}

function runtimePolicyBoostedLevels(current: number, fixed: number): number {
  return Math.max(0, current - fixed);
}

function runtimePolicyBrewedDownLevels(current: number, fixed: number): number {
  return Math.max(0, fixed - current);
}

function runtimePolicyStatDeficit(current: number, fixed: number, divisor: number): number {
  if (fixed <= 0 || current >= fixed) {
    return 0;
  }
  return Math.min(1, (fixed - current) / divisor);
}

function runtimePolicyDeathSupplyReward(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  deathTick: number,
  rewardEpisodeStartTick?: number
): { readonly reward: number; readonly details: RuntimePolicyRewardDetails } | null {
  if (!state.events.some((event) => event.kind === "death" && event.actorId === actorId && event.tick === deathTick)) {
    return null;
  }
  const episodeStartTick = rewardEpisodeStartTick ?? runtimePolicyRewardFirstTick(state.events, actorId, deathTick);
  const unusedHealingSupplies = runtimePolicyUnusedHealingSupplies(state.actors[actorId].supplies);
  const totalDamageTaken = runtimePolicyTotalDamageTaken(state.events, actorId, deathTick, episodeStartTick ?? undefined);
  const supplyCounters = runtimePolicySupplyCounters(state.events, actorId, deathTick, episodeStartTick ?? undefined);
  let avoidableSupplyPenalty = 0;
  if (unusedHealingSupplies > 0 && totalDamageTaken >= 60) {
    if (supplyCounters.healingSupplyEvents <= 0) {
      avoidableSupplyPenalty = runtimePolicyDeathUnusedHealingSupplyPenalty;
    } else if (supplyCounters.goodSupplyEvents <= 0) {
      avoidableSupplyPenalty = runtimePolicyDeathNoGoodSupplyPenalty;
    }
  }
  if (avoidableSupplyPenalty <= 0) {
    return null;
  }
  // Source: NhStakerBot.applyDeathPenaltyAndEndEpisode() applies this on top of REWARD_DEATH_PENALTY
  // when the bot dies with unused healing supplies after taking at least 60 damage.
  return {
    reward: -avoidableSupplyPenalty,
    details: {
      unusedHealingSupplies,
      healingSupplyEvents: supplyCounters.healingSupplyEvents,
      goodSupplyEvents: supplyCounters.goodSupplyEvents,
      totalDamageTaken,
      avoidableSupplyPenalty
    }
  };
}

function runtimePolicyUnusedHealingSupplies(supplies: RuntimePlayerCombatActorState["supplies"]): number {
  return supplies.manta_ray + supplies.shark + supplies.anglerfish + supplies.karambwan + supplies.saradomin_brew;
}

function runtimePolicyTotalDamageTaken(
  events: readonly RuntimePlayerCombatEvent[],
  actorId: RuntimeActorId,
  upToTick: number,
  rewardEpisodeStartTick?: number
): number {
  let total = 0;
  for (const event of events) {
    if (
      event.kind === "hitsplat" &&
      event.targetActorId === actorId &&
      event.tick <= upToTick &&
      (rewardEpisodeStartTick === undefined || event.tick >= rewardEpisodeStartTick)
    ) {
      total += event.damage;
    }
  }
  return total;
}

function runtimePolicySupplyCounters(
  events: readonly RuntimePlayerCombatEvent[],
  actorId: RuntimeActorId,
  upToTick: number,
  rewardEpisodeStartTick?: number
): { readonly healingSupplyEvents: number; readonly goodSupplyEvents: number } {
  let healingSupplyEvents = 0;
  let goodSupplyEvents = 0;
  for (const event of events) {
    if (
      event.kind !== "policy-reward" ||
      event.actorId !== actorId ||
      event.reason !== "supply_reward" ||
      event.tick > upToTick ||
      (rewardEpisodeStartTick !== undefined && event.tick < rewardEpisodeStartTick)
    ) {
      continue;
    }
    const healingSupply = (event.foodUses ?? 0) > 0 || (event.brewUses ?? 0) > 0;
    const goodSupply = (event.riskReduction ?? 0) >= runtimePolicySupplyMeaningfulRiskDrop;
    if (healingSupply) {
      healingSupplyEvents += 1;
    }
    if (goodSupply) {
      goodSupplyEvents += 1;
    }
  }
  return { healingSupplyEvents, goodSupplyEvents };
}

function runtimePolicyActorSuppliedAtOrBefore(
  events: readonly RuntimePlayerCombatEvent[],
  actorId: RuntimeActorId,
  eventTick: number
): boolean {
  return events.some(
    (event) => event.kind === "supply" && event.actorId === actorId && (event.tick === eventTick || event.tick === eventTick - 1)
  );
}

function runtimePolicyPreviousRewardDistance(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  eventTick: number
): number | null {
  const previous = [...state.events].reverse().find(
    (event): event is Extract<RuntimePlayerCombatEvent, { readonly kind: "policy-reward" }> =>
      event.kind === "policy-reward" &&
      event.actorId === actorId &&
      event.tick === eventTick - 1 &&
      event.distance !== undefined
  );
  return previous?.distance ?? null;
}

function runtimePolicyPreviousFreezeUnderNoPressureTicks(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  eventTick: number
): number {
  const previous = [...state.events].reverse().find(
    (event): event is Extract<RuntimePlayerCombatEvent, { readonly kind: "policy-reward" }> =>
      event.kind === "policy-reward" &&
      event.actorId === actorId &&
      event.reason === "freeze_under_no_pressure" &&
      event.tick === eventTick - 1
  );
  return previous?.freezeUnderNoPressureTicks ?? 0;
}

function runtimePolicyPreviousUnderControlIdleTicks(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  eventTick: number
): number {
  const previous = [...state.events].reverse().find(
    (event): event is Extract<RuntimePlayerCombatEvent, { readonly kind: "policy-reward" }> =>
      event.kind === "policy-reward" &&
      event.actorId === actorId &&
      event.reason === "under_control" &&
      event.tick === eventTick - 1
  );
  return previous?.underControlIdleTicks ?? 0;
}

function runtimePolicyPendingGmaulSpecEvent(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  rewardEpisodeStartTick?: number
): RuntimePolicyGmaulSpecRewardEvent | null {
  const outcomes = new Set(
    state.events
      .filter(
        (event): event is Extract<RuntimePlayerCombatEvent, { readonly kind: "policy-reward" }> =>
          event.kind === "policy-reward" &&
          event.actorId === actorId &&
          event.reason === "gmaul_spec_outcome" &&
          event.sourcePolicyRewardId !== undefined
      )
      .map((event) => event.sourcePolicyRewardId)
  );
  let pending: RuntimePolicyGmaulSpecRewardEvent | null = null;
  for (const event of state.events) {
    if (
      event.kind !== "policy-reward" ||
      event.actorId !== actorId ||
      event.reason !== "gmaul_spec" ||
      outcomes.has(event.id) ||
      (rewardEpisodeStartTick !== undefined && event.tick < rewardEpisodeStartTick)
    ) {
      continue;
    }
    if (!pending || event.tick > pending.tick) {
      pending = event as RuntimePolicyGmaulSpecRewardEvent;
    }
  }
  return pending;
}

type RuntimePolicyGmaulSpecRewardEvent = Extract<RuntimePlayerCombatEvent, { readonly kind: "policy-reward" }> & {
  readonly reason: "gmaul_spec";
  readonly specialWeaponKind?: RuntimePolicySpecialWeaponKind;
};

function runtimePolicyActorDamageDealtAtTick(
  events: readonly RuntimePlayerCombatEvent[],
  actorId: RuntimeActorId,
  tick: number
): number {
  let damage = 0;
  for (const event of events) {
    if (event.kind === "hitsplat" && event.tick === tick && event.attackerId === actorId) {
      damage += event.damage;
    }
  }
  return damage;
}

function runtimePolicyActorDamageTakenAtTick(
  events: readonly RuntimePlayerCombatEvent[],
  actorId: RuntimeActorId,
  tick: number
): number {
  let damage = 0;
  for (const event of events) {
    if (event.kind === "hitsplat" && event.tick === tick && event.targetActorId === actorId) {
      damage += event.damage;
    }
  }
  return damage;
}

function runtimePolicyMissedGmaulSpecReward(
  context: NhDuelControllerContext,
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  rewardEpisodeStartTick?: number
): number {
  const specialKind = runtimePolicyAvailableSpecialWeaponKind(context.self);
  if (!specialKind) {
    return 0;
  }
  if (
    !runtimePolicyCanUseSpecialSpecFromObserved(context, specialKind, false) &&
    !runtimePolicyCanUseSpecialSpecFromObserved(context, specialKind, true)
  ) {
    return 0;
  }
  if (runtimePolicyActorMissedGraniteMaulWithin(state, actorId, state.tick, runtimePolicySpecRecentRepeatTicks, rewardEpisodeStartTick)) {
    return 0;
  }

  const canSingle = runtimePolicyCanUseSpecialSpecFromObserved(context, specialKind, false);
  const canDouble = runtimePolicyCanUseSpecialSpecFromObserved(context, specialKind, true);
  const opponentHp = runtimePolicyOpponentVisibleHp(context);
  const recentHit = Math.max(0, context.self.lastDealtHit);
  const exposure = runtimePolicyOpponentMeleeSpecExposure(context, specialKind);
  const meleeProtected = activeProtectionPrayer(context.opponent.activePrayers) === protectPrayerForStyle("crush");
  const singleKo = canSingle ? runtimePolicyClientSpecialKoChance(context, specialKind, false, exposure, meleeProtected, opponentHp) : 0;
  const doubleKo = canDouble ? runtimePolicyClientSpecialKoChance(context, specialKind, true, exposure, meleeProtected, opponentHp) : 0;
  const singleSetup = canSingle ? runtimePolicySpecialSetupScore(specialKind, false, opponentHp, recentHit, exposure, meleeProtected) : 0;
  const doubleSetup = canDouble ? runtimePolicySpecialSetupScore(specialKind, true, opponentHp, recentHit, exposure, meleeProtected) : 0;
  const bestKo = Math.max(singleKo, doubleKo);
  const bestSetup = Math.max(singleSetup, doubleSetup);
  let bestCredible = 0;
  if (canSingle) {
    bestCredible = Math.max(
      bestCredible,
      runtimePolicySpecialCredibleSpecWindow(specialKind, false, opponentHp, recentHit, exposure, meleeProtected, singleKo, singleSetup)
    );
  }
  if (canDouble) {
    bestCredible = Math.max(
      bestCredible,
      runtimePolicySpecialCredibleSpecWindow(specialKind, true, opponentHp, recentHit, exposure, meleeProtected, doubleKo, doubleSetup)
    );
  }
  const missedFloor = recentHit >= 24 ? runtimePolicySpecCredibleWindowFloor : Math.max(0.22, runtimePolicySpecCredibleWindowFloor);
  if (bestKo < runtimePolicySpecGoodKoChance && bestSetup < runtimePolicySpecMissedSetupFloor && bestCredible < missedFloor) {
    return 0;
  }

  let delta =
    -runtimePolicySpecMissedWindowPenalty *
    (0.24 + bestKo * 0.34 + bestSetup * 0.2 + bestCredible * 0.34);
  if (recentHit >= 24) {
    delta -= runtimePolicySpecMissedBigHitPenalty * runtimePolicyClamp01((recentHit - 20) / 22);
  }
  if (meleeProtected) {
    delta *= 0.35;
  }
  // Source: NhStakerBot.applyMissedSpecOpportunityReward() penalizes a NONE
  // spec intent when a visible Gmaul single/double window was available.
  return delta;
}

function runtimePolicyActorQueuedGraniteMaulWithin(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  tick: number,
  lookbackTicks: number,
  rewardEpisodeStartTick?: number
): boolean {
  const earliestTick = tick - Math.max(0, Math.trunc(lookbackTicks));
  return state.events.some((event) => {
    if (event.tick < earliestTick || event.tick > tick) {
      return false;
    }
    if (rewardEpisodeStartTick !== undefined && event.tick < rewardEpisodeStartTick) {
      return false;
    }
    if (event.kind === "policy-reward") {
      return event.actorId === actorId && event.reason === "gmaul_spec";
    }
    return event.kind === "attack" && event.attackerId === actorId && event.specialAttack === "granite_maul";
  });
}

function runtimePolicyActorMissedGraniteMaulWithin(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  tick: number,
  lookbackTicks: number,
  rewardEpisodeStartTick?: number
): boolean {
  const earliestTick = tick - Math.max(0, Math.trunc(lookbackTicks));
  return state.events.some((event) =>
    event.kind === "policy-reward" &&
    event.actorId === actorId &&
    event.reason === "gmaul_missed_spec" &&
    event.tick >= earliestTick &&
    event.tick <= tick &&
    (rewardEpisodeStartTick === undefined || event.tick >= rewardEpisodeStartTick)
  );
}

function runtimePolicyCanUseSpecialSpecFromObserved(
  context: NhDuelControllerContext,
  specialKind: RuntimePolicySpecialWeaponKind,
  doubleSpec: boolean
): boolean {
  if (doubleSpec && specialKind !== "granite_maul") {
    return false;
  }
  const requiredEnergy = runtimePolicySpecialRequiredEnergy(specialKind, doubleSpec);
  return (
    canAct(context.self.locks, context.tick) &&
    context.self.stats.hitpoints.current > 0 &&
    context.opponent.stats.hitpoints.current > 0 &&
    context.self.gmaul.specialEnergy >= requiredEnergy &&
    runtimePolicyObservedMeleeReachable(context) &&
    nhWeaponProfiles[context.self.weaponId].hasVisibleSpecBar &&
    (specialKind !== "armadyl_godsword" || canAttackByTimer(context.self.attackTimer, context.tick))
  );
}

function runtimePolicyAvailableSpecialWeaponKind(actor: NhDuelActorState): RuntimePolicySpecialWeaponKind | null {
  if (runtimePolicyHasEquipableGraniteMaulAvailable(actor)) {
    return "granite_maul";
  }
  if (runtimePolicyHasEquipableArmadylGodswordAvailable(actor)) {
    return "armadyl_godsword";
  }
  return null;
}

function runtimePolicyHasEquipableGraniteMaulAvailable(actor: NhDuelActorState): boolean {
  // Source: NhStakerBot.hasEquipableGraniteMaulAvailable() accepts the current
  // weapon first, then any owned inventory maul; the selected gear profile is
  // only the trainer's cached view of the same owned item set.
  if (actor.equipment.weapon && isNhGraniteMaulItemId(actor.equipment.weapon.itemId)) {
    return true;
  }
  if (actor.gearProfile && nhGearProfileCanEquipGraniteMaul(actor.gearProfile)) {
    return true;
  }
  return actor.inventorySlots.some((slot) => slot !== null && slot.quantity > 0 && isNhGraniteMaulItemId(slot.itemId));
}

function runtimePolicyHasEquipableArmadylGodswordAvailable(actor: NhDuelActorState): boolean {
  if (actor.equipment.weapon && isNhArmadylGodswordItemId(actor.equipment.weapon.itemId)) {
    return true;
  }
  if (actor.gearProfile && nhGearProfileCanEquipArmadylGodsword(actor.gearProfile)) {
    return true;
  }
  return actor.inventorySlots.some((slot) => slot !== null && slot.quantity > 0 && isNhArmadylGodswordItemId(slot.itemId));
}

function runtimePolicySpecialRequiredEnergy(specialKind: RuntimePolicySpecialWeaponKind, doubleSpec: boolean): number {
  if (specialKind === "granite_maul") {
    return doubleSpec ? 100 : 50;
  }
  return 50;
}

function runtimePolicyClientSpecialKoChance(
  context: NhDuelControllerContext,
  specialKind: RuntimePolicySpecialWeaponKind,
  doubleSpec: boolean,
  exposure: number,
  meleeProtected: boolean,
  opponentHp = runtimePolicyOpponentVisibleHp(context),
  requireMeleeRange = true
): number {
  if (specialKind === "armadyl_godsword") {
    return doubleSpec ? 0 : runtimePolicyClientAgsKoChance(context, exposure, meleeProtected, opponentHp, requireMeleeRange);
  }
  return runtimePolicyClientGmaulKoChance(context, doubleSpec, exposure, meleeProtected, opponentHp, requireMeleeRange);
}

function runtimePolicyClientGmaulKoChance(
  context: NhDuelControllerContext,
  doubleSpec: boolean,
  exposure: number,
  meleeProtected: boolean,
  opponentHp = runtimePolicyOpponentVisibleHp(context),
  requireMeleeRange = true
): number {
  if (requireMeleeRange && !runtimePolicyObservedMeleeReachable(context)) {
    return 0;
  }
  const recentHit = Math.max(0, context.self.lastDealtHit);
  const prayerFactor = meleeProtected ? runtimePolicyClientThreatPrayerReduction : 1;
  const maxSpecDamage = doubleSpec ? runtimePolicyClientThreatGmaulDoubleMax : runtimePolicyClientThreatGmaulMax;
  const effectiveDamage = Math.max(1, Math.round(maxSpecDamage * exposure * prayerFactor));
  let chance = runtimePolicySoftKoRisk(opponentHp, effectiveDamage, doubleSpec ? 14 : 10);
  if (!meleeProtected && recentHit >= 24 && opponentHp <= 72) {
    chance += 0.08;
  }
  if (recentHit >= 30 && opponentHp <= 65) {
    chance += 0.12;
  }
  if (recentHit >= 38 && opponentHp <= 58) {
    chance += 0.1;
  }
  if (opponentHp <= 45) {
    chance += 0.08;
  }
  if (opponentHp >= 70 && recentHit < 18) {
    chance -= 0.12;
  }
  if (opponentHp >= 78 && recentHit < 24) {
    chance -= 0.14;
  }
  return runtimePolicyClamp01(chance);
}

function runtimePolicyClientAgsKoChance(
  context: NhDuelControllerContext,
  exposure: number,
  meleeProtected: boolean,
  opponentHp = runtimePolicyOpponentVisibleHp(context),
  requireMeleeRange = true
): number {
  if (requireMeleeRange && !runtimePolicyObservedMeleeReachable(context)) {
    return 0;
  }
  const recentHit = Math.max(0, context.self.lastDealtHit);
  const prayerFactor = meleeProtected ? runtimePolicyClientThreatPrayerReduction : 1;
  const effectiveDamage = Math.max(1, Math.round(runtimePolicyClientThreatAgsMax * exposure * prayerFactor));
  let chance = runtimePolicySoftKoRisk(opponentHp, effectiveDamage, 12);
  if (!meleeProtected && recentHit >= 24 && opponentHp <= 78) {
    chance += 0.08;
  }
  if (recentHit >= 32 && opponentHp <= 72) {
    chance += 0.11;
  }
  if (opponentHp <= 52) {
    chance += 0.08;
  }
  if (opponentHp >= 86 && recentHit < 22) {
    chance -= 0.14;
  }
  return runtimePolicyClamp01(chance);
}

function runtimePolicySpecialCredibleSpecWindow(
  specialKind: RuntimePolicySpecialWeaponKind,
  doubleSpec: boolean,
  opponentHp: number,
  recentHit: number,
  exposure: number,
  meleeProtected: boolean,
  koChance: number,
  setupScore: number
): number {
  if (specialKind === "armadyl_godsword") {
    return runtimePolicyAgsCredibleSpecWindow(opponentHp, recentHit, exposure, meleeProtected, koChance, setupScore);
  }
  return runtimePolicyGmaulCredibleSpecWindow(doubleSpec, opponentHp, recentHit, exposure, meleeProtected, koChance, setupScore);
}

function runtimePolicyAgsCredibleSpecWindow(
  opponentHp: number,
  recentHit: number,
  exposure: number,
  meleeProtected: boolean,
  koChance: number,
  setupScore: number
): number {
  let window = Math.max(koChance, setupScore * 0.86);
  if (recentHit >= 24 && opponentHp <= 78) {
    window += 0.09 + runtimePolicyClamp01((recentHit - 24) / 26) * 0.11;
  }
  if (!meleeProtected && exposure >= 1.05 && opponentHp <= 76) {
    window += runtimePolicyClamp01((exposure - 1) / 0.32) * 0.08;
  }
  if (meleeProtected && opponentHp > 44) {
    window *= 0.45;
  }
  if (opponentHp >= 86 && recentHit < 22) {
    window *= 0.45;
  }
  return runtimePolicyClamp01(window);
}

function runtimePolicyGmaulCredibleSpecWindow(
  doubleSpec: boolean,
  opponentHp: number,
  recentHit: number,
  exposure: number,
  meleeProtected: boolean,
  koChance: number,
  setupScore: number
): number {
  let window = Math.max(koChance, setupScore * 0.82);
  if (recentHit >= 24 && opponentHp <= (doubleSpec ? 82 : 58)) {
    window += 0.1 + runtimePolicyClamp01((recentHit - 24) / 24) * 0.1;
  }
  if (!meleeProtected && exposure >= 1.05 && opponentHp <= (doubleSpec ? 84 : 56)) {
    window += runtimePolicyClamp01((exposure - 1) / 0.32) * 0.08;
  }
  if (meleeProtected && opponentHp > (doubleSpec ? 46 : 30)) {
    window *= 0.42;
  }
  if (opponentHp >= 82 && recentHit < 24) {
    window *= 0.45;
  }
  return runtimePolicyClamp01(window);
}

function runtimePolicySpecialSetupScore(
  specialKind: RuntimePolicySpecialWeaponKind,
  doubleSpec: boolean,
  opponentHp: number,
  recentHit: number,
  exposure: number,
  meleeProtected: boolean
): number {
  if (specialKind === "armadyl_godsword") {
    return runtimePolicyAgsSetupScore(opponentHp, recentHit, exposure, meleeProtected);
  }
  return runtimePolicyGmaulSetupScore(doubleSpec, opponentHp, recentHit, exposure, meleeProtected);
}

function runtimePolicyAgsSetupScore(
  opponentHp: number,
  recentHit: number,
  exposure: number,
  meleeProtected: boolean
): number {
  const hpScore = runtimePolicyClamp01((76 - opponentHp) / 42);
  const recentHitScore = runtimePolicyClamp01((recentHit - 18) / 26);
  const exposureScore = runtimePolicyClamp01((exposure - 0.82) / 0.48);
  let setup = hpScore * 0.56 + recentHitScore * 0.28 + exposureScore * 0.16;
  if (recentHit >= 30 && opponentHp <= 68) {
    setup += 0.12;
  }
  if (recentHit <= 8 && opponentHp >= 72) {
    setup -= 0.2;
  }
  return runtimePolicyClamp01(setup * (meleeProtected ? 0.3 : 1));
}

function runtimePolicyGmaulSetupScore(
  doubleSpec: boolean,
  opponentHp: number,
  recentHit: number,
  exposure: number,
  meleeProtected: boolean
): number {
  const hpScore = doubleSpec ? runtimePolicyClamp01((88 - opponentHp) / 42) : runtimePolicyClamp01((54 - opponentHp) / 34);
  const recentHitScore = runtimePolicyClamp01((recentHit - 16) / 24);
  const exposureScore = runtimePolicyClamp01((exposure - 0.82) / 0.45);
  let setup = hpScore * 0.5 + recentHitScore * 0.32 + exposureScore * 0.18;
  if (recentHit >= 28 && opponentHp <= (doubleSpec ? 72 : 50)) {
    setup += 0.12;
  }
  if (recentHit <= 8 && opponentHp >= (doubleSpec ? 68 : 48)) {
    setup -= 0.18;
  }
  return runtimePolicyClamp01(setup * (meleeProtected ? 0.25 : 1));
}

function runtimePolicySpecialDryHighHpPenalty(
  specialKind: RuntimePolicySpecialWeaponKind,
  doubleSpec: boolean,
  opponentHp: number,
  recentHit: number,
  setupScore: number
): number {
  if (specialKind === "armadyl_godsword") {
    if (recentHit >= 22 || opponentHp < 70) {
      return 0;
    }
    const highHp = runtimePolicyClamp01((opponentHp - 70) / 24);
    return runtimePolicySpecDryHighHpPenalty * highHp * (1 - setupScore);
  }
  return runtimePolicyGmaulDryHighHpPenalty(doubleSpec, opponentHp, recentHit, setupScore);
}

function runtimePolicyGmaulDryHighHpPenalty(
  doubleSpec: boolean,
  opponentHp: number,
  recentHit: number,
  setupScore: number
): number {
  if (recentHit >= 18 || opponentHp < 62) {
    return 0;
  }
  const highHp = runtimePolicyClamp01((opponentHp - 62) / 28);
  const noSetup = 1 - setupScore;
  const specScale = doubleSpec ? 1.15 : 0.85;
  return runtimePolicySpecDryHighHpPenalty * highHp * noSetup * specScale;
}

function runtimePolicyOpponentMeleeSpecExposure(
  context: NhDuelControllerContext,
  specialKind: RuntimePolicySpecialWeaponKind = "granite_maul"
): number {
  if (context.opponent.observedInfoKnown === false) {
    return 1;
  }
  const bonuses = aggregateVisibleEquipmentBonuses(context.opponent.equipment, equipmentRows);
  const meleeDefence = specialKind === "armadyl_godsword" ? bonuses.slash_defence_bonus : bonuses.crush_defence_bonus;
  const rangedDefence = bonuses.range_defence_bonus;
  let exposure = 1;
  if (meleeDefence <= 75) {
    exposure += 0.22;
  } else if (meleeDefence <= 115) {
    exposure += 0.1;
  } else if (meleeDefence >= 185) {
    exposure -= 0.26;
  } else if (meleeDefence >= 145) {
    exposure -= 0.14;
  }
  const gearStyle = context.opponent.lastVisibleOpponentStyle;
  if (gearStyle === "magic" && bonuses.magic_defence_bonus <= 95 && meleeDefence <= 125) {
    exposure += 0.12;
  }
  if (gearStyle === "ranged" && rangedDefence >= 125 && meleeDefence >= 125) {
    exposure -= 0.08;
  }
  return Math.max(0.62, Math.min(1.32, exposure));
}

function runtimePolicySoftKoRisk(hp: number, possibleDamage: number, margin: number): number {
  if (possibleDamage <= 0) {
    return 0;
  }
  const lower = Math.max(1, possibleDamage - margin);
  const upper = Math.min(115, possibleDamage + margin);
  if (hp <= lower) {
    return 1;
  }
  if (hp >= upper) {
    return 0;
  }
  return (upper - hp) / Math.max(1, upper - lower);
}

function runtimePolicyOpponentVisibleHp(context: NhDuelControllerContext): number {
  // Source: NhStakerBot.clientVisibleOpponentHp() stores delayed client HP
  // in 5-HP buckets; inference reward/window helpers use visibleHpOrDefault().
  return runtimePolicyClientVisibleHitpoints(context.opponent.stats.hitpoints.current);
}

function runtimePolicyClientVisibleHitpoints(hitpoints: number): number {
  const hp = Math.max(0, Math.min(99, Math.trunc(Number.isFinite(hitpoints) ? hitpoints : 0)));
  if (hp <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(99, Math.trunc((hp + 2) / 5) * 5));
}

function runtimePolicyActionWithContextGuards(
  action: NhPolicyAction,
  context: NhDuelControllerContext,
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  opponentId: RuntimeActorId,
  selfPlayMode: boolean
): NhPolicyAction {
  let offenceStyle = action.offenceStyle;
  let movementIntent = action.movementIntent;
  let supplyIntent = action.supplyIntent;
  let defencePrayer = action.defencePrayer;
  // Source: NhStakerBot.applyContextGuards() converts impossible stand-under/step-out
  // decisions back to PRESSURE before the bot issues movement.
  if (movementIntent === "stand_under" && !isFrozen(context.opponent.locks, context.tick)) {
    movementIntent = "pressure";
  }
  if (
    movementIntent === "step_out" &&
    !runtimePolicyAllowStepOutByContext(context, action.offenceStyle, state, actorId, opponentId)
  ) {
    movementIntent = "pressure";
  }
  if (
    (supplyIntent === "offence_strip_one" || supplyIntent === "offence_strip_two") &&
    !runtimePolicyAllowOffenceStripByContext(context, action.offenceStyle, state, actorId, opponentId)
  ) {
    supplyIntent = "none";
  }
  if (
    defencePrayer === "smite" &&
    !selfPlayMode
  ) {
    // Source: NhStakerBot.applyContextGuards() rejects Smite unless
    // isSelfPlayBot() is true. In self-play, shouldAllowSmite() is checked later
    // by resolveDefencePrayer() after supply use and style recovery.
    defencePrayer = runtimePolicyProtectionPrayerForOpponent(context);
  }

  const evStyle = runtimePolicyBestExpectedOffenceStyle(context);
  if (evStyle && evStyle !== offenceStyle) {
    const currentEv = runtimePolicyExpectedOffenceStyleEv(context, offenceStyle);
    const bestEv = runtimePolicyExpectedOffenceStyleEv(context, evStyle);
    if (bestEv >= currentEv + runtimePolicyClientStyleEvGuardMargin) {
      offenceStyle = evStyle;
    }
  }

  return movementIntent === action.movementIntent &&
    supplyIntent === action.supplyIntent &&
    defencePrayer === action.defencePrayer &&
    offenceStyle === action.offenceStyle
    ? action
    : { ...action, offenceStyle, movementIntent, supplyIntent, defencePrayer };
}

function runtimePolicyResolveDefencePrayer(
  requested: PrayerId,
  context: NhDuelControllerContext,
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  opponentId: RuntimeActorId,
  selfPlayMode: boolean
): PrayerId {
  // Source: NhStakerBot.run() applies supply use, style recovery/equipment, then
  // resolveDefencePrayer(); Redemption/Smite must be rechecked against post-supply HP/prayer.
  if (requested === "smite") {
    return selfPlayMode &&
      runtimePolicyShouldAllowSmite(
        context,
        state,
        actorId,
        opponentId,
        runtimePolicyResolveThreatStyle(context)
      )
      ? "smite"
      : runtimePolicyProtectionPrayerForOpponent(context);
  }
  if (requested === "redemption") {
    return runtimePolicyShouldAttemptRedemption(context, state, actorId, opponentId)
      ? "redemption"
      : runtimePolicyProtectionPrayerForOpponent(context);
  }
  return requested;
}

function runtimePolicyActionWithDelayedPrayerCounter(
  action: NhPolicyAction,
  context: NhDuelControllerContext,
  observedOpponentPrayers: readonly PrayerId[]
): NhPolicyAction {
  const observedProtectedStyle = runtimePolicyProtectedStyleFromPrayer(activeProtectionPrayer(observedOpponentPrayers));
  if (!observedProtectedStyle) {
    return action;
  }
  const desiredBlocked = action.offenceStyle === observedProtectedStyle;
  const currentBlocked = context.self.lastOffenceStyle === observedProtectedStyle;
  if (!desiredBlocked && !currentBlocked) {
    return action;
  }
  const counter = runtimePolicyCounterPrayerStyle(
    observedProtectedStyle,
    observedProtectedStyle === "melee" && !isFrozen(context.opponent.locks, context.tick)
  );
  if (!counter || counter === action.offenceStyle) {
    return action;
  }
  return {
    ...action,
    offenceStyle: counter
  };
}

const runtimePolicyClientStyleEvGuardMargin = 0.1;
const runtimePolicyStyleStallThresholdTicks = 6;
const runtimePolicyRedemptionHpTrigger = 42;
const runtimePolicyRedemptionProcHpThreshold = 10;
const runtimePolicySpecQueueCooldownTicks = 10;
const runtimePolicySpecApproachWindowFloor = 0.2;
const runtimePolicyClientThreatRange = 8;
const runtimePolicySupplyGoodBonus = 0.48;
const runtimePolicySupplyBadPenalty = 0.3;
const runtimePolicySupplyUnneededRestorePenalty = 0.3;
const runtimePolicySupplyUnneededReboostPenalty = 0.26;
const runtimePolicySupplyRiskReductionScale = 7.35;
const runtimePolicySupplyLowRiskUsePenalty = 4.2;
const runtimePolicySupplyNoRiskReductionPenalty = 3.75;
const runtimePolicySupplyOpportunityCostScale = 1.95;
const runtimePolicySupplyRepeatLowValuePenalty = 1.85;
const runtimePolicySupplyMeaningfulRiskDrop = 0.065;
const runtimePolicyBrewTempoHealBonus = 0.42;
const runtimePolicyBrewOnlyPenaltyWeight = 0.45;
const runtimePolicyBrewTempoMinPostEv = 0.46;
const runtimePolicyBrewTempoMinEvRetention = 0.66;
const runtimePolicyBrewTempoBestEvMargin = 0.08;
const runtimePolicySupplyRepeatWindowTicks = 10;
const runtimePolicyFoodUseCost = 0.66;
const runtimePolicyBrewUseCost = 1.18;
const runtimePolicyRestoreUseCost = 0.25;
const runtimePolicyReboostUseCost = 0.2;
const runtimePolicyFoodWastePenaltyPerHp = 0.26;
const runtimePolicyBrewWastePenaltyPerHp = 0.21;
const runtimePolicyOffenceStripGainScale = 0;
const runtimePolicyOffenceStripFailPenalty = 0;
const runtimePolicyOffenceStripUnderPressurePenalty = 0;
const runtimePolicyOffenceStripBadOffencePenalty = 0;
const runtimePolicyOffenceStripBadNetPenalty = 0;
const runtimePolicyOffenceStripAsymmetricLossScale = 0;
const runtimePolicyRegearStyleBonus = 0;
const runtimePolicyDefenceBeliefEvScale = 0.48;
const runtimePolicyDefenceBeliefHitScale = 0.28;
const runtimePolicyDefenceBeliefBestGapScale = 0.58;
const runtimePolicyDefenceBeliefBestMatchBonus = 0.1;
const runtimePolicyDefenceBeliefMinPressure = 0.08;
const runtimePolicyActualPrayerOnHitBonus = 0.7;
const runtimePolicyActualPrayerOnDamageScale = 0.018;
const runtimePolicyActualPrayerOffHitPenalty = 1.65;
const runtimePolicyActualPrayerOffDamageScale = 0.075;

interface RuntimePolicyServerItemRow {
  readonly id: number;
  readonly name: string;
  readonly weaponType: string | null;
  readonly rangedWeapon: string | null;
  readonly bonuses: BonusTable;
}

interface RuntimePolicyWeaponAttackSetRow {
  readonly type?: string | null;
  readonly style?: string | null;
}

interface RuntimePolicyWeaponTypeRow {
  readonly attackSets?: readonly (RuntimePolicyWeaponAttackSetRow | null)[];
}

const runtimePolicyServerItemById = new Map(
  (serverItemsJson as readonly RuntimePolicyServerItemRow[]).map((row) => [row.id, row])
);
const runtimePolicyWeaponTypeById = new Map(
  Object.entries(weaponTypesJson as Readonly<Record<string, RuntimePolicyWeaponTypeRow>>)
);

const runtimePolicyGuaranteedMagicWeaponIds = new Set([
  21006, // KODAI_WAND
  11907, // TRIDENT_OF_THE_SEAS
  22288, // TRIDENT_OF_THE_SEAS_E
  12899, // TRIDENT_OF_THE_SWAMP
  22292, // TRIDENT_OF_THE_SWAMP_E
  12904, // TOXIC_STAFF_OF_THE_DEAD
  11791, // STAFF_OF_THE_DEAD
  22323, // SANGUINESTI_STAFF
  4675 // ANCIENT_STAFF
]);

function runtimePolicyBestExpectedOffenceStyle(context: NhDuelControllerContext): NhOffenceStyle | null {
  const styles: readonly NhOffenceStyle[] = ["magic", "ranged", "melee"];
  let bestStyle: NhOffenceStyle | null = null;
  let bestEv = 0;
  for (const style of styles) {
    const ev = runtimePolicyExpectedOffenceStyleEv(context, style);
    if (ev > bestEv) {
      bestStyle = style;
      bestEv = ev;
    }
  }
  return bestStyle;
}

function runtimePolicyExpectedOffenceStyleEv(context: NhDuelControllerContext, style: NhOffenceStyle): number {
  if (!runtimePolicyStyleInOffensiveRange(context, style)) {
    return 0;
  }
  let ev = runtimePolicyClientOffenceEv(context, style);
  if (runtimePolicyWantsFreeze(context) && style === "magic" && ev > 0) {
    ev += 0.16;
  }
  return ev;
}

function runtimePolicyClientOffenceEv(context: NhDuelControllerContext, style: NhOffenceStyle): number {
  return runtimePolicyClientOffenceEvForActor(context, style, context.self.stats, context.self);
}

function runtimePolicyClientOffenceEvForActor(
  context: NhDuelControllerContext,
  style: NhOffenceStyle,
  stats: NhDuelActorState["stats"],
  actor: NhDuelActorState
): number {
  return nhClientOffenceEv(context, style, stats, actor);
}

function runtimePolicyBestClientOffenceEvForActor(
  context: NhDuelControllerContext,
  stats: NhDuelActorState["stats"],
  actor: NhDuelActorState
): number {
  let best = 0;
  for (const style of ["magic", "ranged", "melee"] as const) {
    best = Math.max(best, runtimePolicyClientOffenceEvForActor(context, style, stats, actor));
  }
  return best;
}

function runtimePolicyWeaknessForStyle(bonuses: BonusTable, style: NhOffenceStyle): number {
  return nhWeaknessForStyle(bonuses, style);
}

function runtimePolicyClamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function runtimePolicyStyleInOffensiveRange(context: NhDuelControllerContext, style: NhOffenceStyle): boolean {
  // Source: NhStakerBot.clientOffenceEv() and attackRangeForThreat(); share the
  // same helper as the policy prior so candidate-gear EV cannot drift by path.
  return nhStyleInOffensiveRange(context, style);
}

function runtimePolicyWantsFreeze(context: NhDuelControllerContext): boolean {
  // Source: NhStakerBot.applyContextGuards() uses a stateless wantsFreeze
  // predicate for the EV style guard: opponent exists, delayed target is not
  // frozen, and delayed protection does not include magic. This intentionally
  // differs from scriptedFallbackDecision(), where shouldAttemptFreeze() mutates
  // nextFreezeAttemptTick before choosing the fallback style.
  return (
    !isFrozen(context.opponent.locks, context.tick) &&
    activeProtectionPrayer(context.opponent.activePrayers) !== protectPrayerForStyle("magic")
  );
}

function runtimePolicyResolveScriptedFreezeAttempt(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  observedOpponent: NhDuelActorState
): { readonly state: RuntimePlayerCombatState; readonly wantsFreeze: boolean } {
  const actor = state.actors[actorId];
  if (
    isFrozen(observedOpponent.locks, state.tick) ||
    activeProtectionPrayer(observedOpponent.activePrayers) === protectPrayerForStyle("magic") ||
    state.tick < actor.policyNextFreezeAttemptTick
  ) {
    return { state, wantsFreeze: false };
  }

  // Source: NhStakerBot.shouldAttemptFreeze() mutates nextFreezeAttemptTick
  // before the policy decision is queried, so the scripted-offence input only
  // pushes freeze attempts once every FREEZE_RETRY_TICKS while the target is
  // unfrozen and not protecting from magic.
  return {
    state: {
      ...state,
      actors: {
        ...state.actors,
        [actorId]: {
          ...actor,
          policyNextFreezeAttemptTick: state.tick + runtimePolicyFreezeRetryTicks
        }
      }
    },
    wantsFreeze: true
  };
}

function runtimePolicyProtectionPrayerForOpponent(context: NhDuelControllerContext): PrayerId {
  if (context.opponent.observedInfoKnown === false) {
    return activeProtectionPrayer(context.self.activePrayers) ?? "protect_from_melee";
  }
  const likely = runtimePolicyResolveThreatStyle(context);
  return likely ? protectPrayerForStyle(styleCombatStyle(likely)) : activeProtectionPrayer(context.self.activePrayers) ?? "protect_from_melee";
}

function runtimePolicyResolveThreatStyle(context: NhDuelControllerContext): NhOffenceStyle | null {
  // Source: NhStakerBot.resolveThreatStyle() uses delayed likely style first,
  // then delayed visible gear style when the likely attack style is unknown.
  if (context.opponent.observedInfoKnown === false) {
    return null;
  }
  return context.opponent.lastOffenceStyle ?? context.opponent.lastVisibleOpponentStyle ?? null;
}

function runtimePolicyProtectedStyleFromPrayer(prayer: ProtectionPrayerId | undefined): NhOffenceStyle | null {
  if (prayer === "protect_from_magic") {
    return "magic";
  }
  if (prayer === "protect_from_missiles") {
    return "ranged";
  }
  if (prayer === "protect_from_melee") {
    return "melee";
  }
  return null;
}

function runtimePolicyShouldAllowSmite(
  context: NhDuelControllerContext,
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  opponentId: RuntimeActorId,
  threatStyle: NhOffenceStyle | null
): boolean {
  const hp = context.self.stats.hitpoints.current;
  const prayerPoints = context.self.stats.prayer.current;
  if (hp <= 52 || prayerPoints < 14) {
    return false;
  }
  const recentlyDefending = runtimePolicyActorWasDefendingRecently(state, actorId, opponentId, 2);
  const resolvedThreatStyle = threatStyle ?? runtimePolicyResolveThreatStyle(context);
  if (!resolvedThreatStyle) {
    return hp >= 80 && prayerPoints >= 24 && !recentlyDefending;
  }
  if (!runtimePolicyIsLikelyUnderThreat(context, state, actorId, opponentId, resolvedThreatStyle)) {
    return true;
  }
  const distance = runtimePolicyObservedDistance(context);
  if (resolvedThreatStyle === "melee") {
    if (!runtimePolicyObservedOpponentMeleeReachable(context)) {
      return true;
    }
    return hp >= 92 && prayerPoints >= 30 && !recentlyDefending;
  }
  if (!recentlyDefending && hp >= 78 && prayerPoints >= 22) {
    return true;
  }
  if (distance < 0 || distance > runtimePolicyAttackRangeForThreat(resolvedThreatStyle)) {
    return true;
  }
  return hp >= 95 && prayerPoints >= 36 && !runtimePolicyActorWasDefendingRecently(state, actorId, opponentId, 1);
}

function runtimePolicyAttackRangeForThreat(style: NhOffenceStyle): number {
  return style === "melee" ? 1 : runtimePolicyClientThreatRange;
}

function runtimePolicyCounterPrayerStyle(style: NhOffenceStyle, wantsFreeze: boolean): NhOffenceStyle | null {
  if (style === "magic") {
    return "ranged";
  }
  if (style === "ranged") {
    return "magic";
  }
  if (style === "melee") {
    return wantsFreeze ? "magic" : "ranged";
  }
  return null;
}

function runtimePolicyShouldAttemptRedemption(
  context: NhDuelControllerContext,
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  opponentId: RuntimeActorId
): boolean {
  const hp = context.self.stats.hitpoints.current;
  if (
    hp <= runtimePolicyRedemptionProcHpThreshold ||
    hp > runtimePolicyRedemptionHpTrigger ||
    context.self.stats.prayer.current < 12
  ) {
    return false;
  }
  const threatStyle = runtimePolicyResolveThreatStyle(context);
  if (!threatStyle || !runtimePolicyIsLikelyUnderThreat(context, state, actorId, opponentId, threatStyle)) {
    return false;
  }
  const estimatedMaxHit = runtimePolicyEstimatedThreatMaxHit(context, threatStyle);
  return estimatedMaxHit >= 8 && hp - estimatedMaxHit <= runtimePolicyRedemptionProcHpThreshold;
}

function runtimePolicyIsLikelyUnderThreat(
  context: NhDuelControllerContext,
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  opponentId: RuntimeActorId,
  style: NhOffenceStyle | null
): boolean {
  // Source: NhStakerBot.isLikelyUnderThreat() treats an aggressing opponent or
  // recent defence as threat before falling back to observed style range.
  if (runtimePolicyIsAggressingActor(state, actorId, opponentId) || runtimePolicyActorWasDefendingRecently(state, actorId, opponentId, 4)) {
    return true;
  }
  if (!style) {
    return false;
  }
  return runtimePolicyThreatInRange(context, style);
}

function runtimePolicyThreatInRange(context: NhDuelControllerContext, style: NhOffenceStyle | null): boolean {
  if (!style) {
    return false;
  }
  if (style === "melee") {
    return runtimePolicyObservedOpponentMeleeReachable(context);
  }
  const distance = runtimePolicyObservedDistance(context);
  if (distance < 0) {
    return false;
  }
  return distance > 0 && distance <= runtimePolicyClientThreatRange;
}

function runtimePolicyEstimatedThreatMaxHit(context: NhDuelControllerContext, style: NhOffenceStyle | null): number {
  if (!style) {
    return 0;
  }
  const weaponId = context.opponent.weaponId;
  if (style === "magic") {
    return 33;
  }
  if (style === "ranged") {
    return 46;
  }
  if (weaponId === "granite_maul") {
    return 40;
  }
  return 48;
}

function runtimePolicyAllowOffenceStripByContext(
  context: NhDuelControllerContext,
  style: NhOffenceStyle,
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  opponentId: RuntimeActorId
): boolean {
  if (context.self.stats.hitpoints.current < 78 || isFrozen(context.self.locks, context.tick)) {
    return false;
  }
  // Source: NhStakerBot.allowOffenceStripByContext() refuses strip actions while
  // the opponent is actively aggressing the bot or the bot was defending recently.
  if (
    runtimePolicyIsAggressingActor(state, actorId, opponentId) ||
    runtimePolicyActorWasDefendingRecently(state, actorId, opponentId, 3)
  ) {
    return false;
  }
  return activeProtectionPrayer(context.opponent.activePrayers) !== protectPrayerForStyle(styleCombatStyle(style));
}

function runtimePolicyIsAggressingActor(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  opponentId: RuntimeActorId
): boolean {
  const opponent = state.actors[opponentId];
  if (!opponent || runtimePolicyActorDeadAtTick(opponent, state.tick)) {
    return false;
  }
  if (opponent.targetId === actorId) {
    return true;
  }
  if (opponent.lastTargetId === actorId && opponent.lastTargetTimeoutTicks > 0) {
    return true;
  }
  return runtimePolicyActorWasDefendingRecently(state, actorId, opponentId, 8);
}

function runtimePolicyActorWasDefendingRecently(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  opponentId: RuntimeActorId,
  ticks: number
): boolean {
  const earliestTick = state.tick - Math.max(0, Math.trunc(ticks));
  return state.events.some((event) => {
    if (event.tick < earliestTick || event.tick > state.tick) {
      return false;
    }
    if (event.kind === "attack") {
      return event.attackerId === opponentId && event.defenderId === actorId;
    }
    if (event.kind === "hitsplat") {
      return event.attackerId === opponentId && event.targetActorId === actorId;
    }
    return false;
  });
}

function runtimePolicyActorDeadAtTick(actor: RuntimePlayerCombatActorState, tick: number): boolean {
  return actor.hitpoints <= 0 || (actor.deadUntilTick !== null && actor.deadUntilTick > tick);
}

function styleCombatStyle(style: NhOffenceStyle): "magic" | "ranged" | "slash" {
  return style === "melee" ? "slash" : style;
}

function runtimePolicyOffenceStyleForCombatStyle(style: CombatStyle): NhOffenceStyle {
  return style === "magic" ? "magic" : style === "ranged" ? "ranged" : "melee";
}

function runtimePolicyAllowStepOutByContext(
  context: NhDuelControllerContext,
  style: NhOffenceStyle,
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  opponentId: RuntimeActorId
): boolean {
  if (!canMove(context.self.locks, context.tick)) {
    return false;
  }
  const distance = runtimePolicyObservedDistance(context);
  if (distance < 0) {
    return false;
  }
  if (distance <= 0) {
    return true;
  }
  if (isFrozen(context.opponent.locks, context.tick)) {
    return (style === "magic" || style === "ranged") && distance <= 1;
  }
  // Source: NhStakerBot.allowStepOutByContext() resolves likely threat style
  // before gear fallback, then requires isLikelyUnderThreat() for melee step-outs.
  const threatStyle = runtimePolicyResolveThreatStyle(context);
  const underThreat = runtimePolicyIsLikelyUnderThreat(context, state, actorId, opponentId, threatStyle);
  return underThreat && threatStyle === "melee" && context.self.stats.hitpoints.current <= 42 && distance <= 1;
}

function chebyshevPolicyDistance(left: TilePosition, right: TilePosition): number {
  if ((left.plane ?? 0) !== (right.plane ?? 0)) {
    return -1;
  }
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function runtimePolicyObservedDistance(context: NhDuelControllerContext): number {
  if (context.opponent.observedInfoKnown === false) {
    return -1;
  }
  return chebyshevPolicyDistance(context.self.tile, context.opponent.tile);
}

function runtimePolicyObservedMeleeReachable(context: NhDuelControllerContext): boolean {
  return context.opponent.observedInfoKnown !== false && context.meleeReachable;
}

function runtimePolicyObservedOpponentMeleeReachable(context: NhDuelControllerContext): boolean {
  return context.opponent.observedInfoKnown !== false && context.opponentMeleeReachable;
}

function runtimePolicyCanApplySpecialSpecIntent(
  action: NhPolicyAction,
  context: NhDuelControllerContext
): boolean {
  const specialKind = runtimePolicyAvailableSpecialWeaponKind(context.self);
  if (!specialKind || (action.specIntent === "use_special_double" && specialKind !== "granite_maul")) {
    return false;
  }
  const requiredEnergy = runtimePolicySpecialRequiredEnergy(specialKind, action.specIntent === "use_special_double");
  // Source: NhStakerBot.run() switches to desiredOffence before applySpecIntent();
  // the spec check therefore sees the server weapon after switchToStyle(desiredOffence).
  // Tick-start weapon only gates whether a client spec-bar packet could be sent.
  return (
    canAct(context.self.locks, context.tick) &&
    context.self.stats.hitpoints.current > 0 &&
    context.opponent.stats.hitpoints.current > 0 &&
    context.self.gmaul.specialEnergy >= requiredEnergy &&
    nhWeaponProfiles[context.self.weaponId].hasVisibleSpecBar &&
    (specialKind !== "armadyl_godsword" || canAttackByTimer(context.self.attackTimer, context.tick)) &&
    runtimePolicyStyleWeaponCanAttackForSpec(context, action.offenceStyle) &&
    runtimePolicyObservedMeleeReachable(context) &&
    !runtimePolicyFrozenDiagonalAdjacent(context)
  );
}

function runtimePolicyStyleWeaponCanAttackForSpec(context: NhDuelControllerContext, style: NhOffenceStyle): boolean {
  if (style === "melee") {
    return context.meleeReachable;
  }
  const distance = chebyshevPolicyDistance(context.self.tile, context.opponent.tile);
  // Source: NhStakerBot.applySpecIntent() asks PlayerCombat.canAttack() after
  // switchToStyle(desiredOffence), but PlayerCombat.canAttack() only checks the
  // combat/listener/dead/stun/PJ gates; it does not enforce weapon or spell
  // distance. maybeEquipGraniteMaulForSpec() separately requires observed maul
  // melee reach, which remains the real range gate for the queued spec.
  return distance >= 0;
}

function runtimePolicyFrozenDiagonalAdjacent(context: NhDuelControllerContext): boolean {
  if (!isFrozen(context.self.locks, context.tick)) {
    return false;
  }
  const dx = Math.abs(context.self.tile.x - context.opponent.tile.x);
  const dy = Math.abs(context.self.tile.y - context.opponent.tile.y);
  return dx === 1 && dy === 1;
}

function setRuntimePolicyOpponentGearProfile(
  state: RuntimePlayerCombatState,
  gearProfile: NhSelectedGearProfile
): RuntimePlayerCombatState {
  return {
    ...state,
    actors: {
      ...state.actors,
      opponent: {
        ...state.actors.opponent,
        gearProfile
      }
    }
  };
}

function runtimePolicySyncOpponentGearProfileFromSource(
  state: RuntimePlayerCombatState,
  gearProfile: NhSelectedGearProfile,
  sourceInventoryVisible: boolean,
  rewardEpisodeActive?: boolean,
  sourceActorView?: RuntimePolicyOpponentActorView,
  sourceLayoutAccepted = false
): RuntimePlayerCombatState {
  const actor = state.actors.opponent;
  const nextSourceSignature =
    sourceInventoryVisible && !rewardEpisodeActive ? runtimePolicySourceLayoutSignature(sourceActorView) : null;
  const sourceChanged =
    sourceInventoryVisible &&
    !rewardEpisodeActive &&
    nextSourceSignature !== null &&
    actor.policyLoadoutSourceSignature !== nextSourceSignature;
  const sourceAttemptReady =
    sourceInventoryVisible && !rewardEpisodeActive && state.tick >= actor.policyNextLoadoutSyncTick;
  if (sourceInventoryVisible && !rewardEpisodeActive && !sourceAttemptReady) {
    return state;
  }
  const nextLoadoutSyncTick =
    sourceInventoryVisible && !rewardEpisodeActive ? state.tick + 2 : actor.policyNextLoadoutSyncTick;
  if (!sourceChanged) {
    return {
      ...setRuntimePolicyOpponentGearProfile(state, gearProfile),
      actors: {
        ...state.actors,
        opponent: {
          ...state.actors.opponent,
          gearProfile,
          policyNextLoadoutSyncTick: nextLoadoutSyncTick
        }
      }
    };
  }

  const syncedEquipment = sourceLayoutAccepted
    ? nhGearProfileNormalizeBotSourceEquipment(sourceActorView?.equipment ?? actor.equipment)
    : actor.equipment;
  const sourceInventorySlots = sourceLayoutAccepted ? runtimePolicyInventorySlotsForSourceView(sourceActorView) : null;
  const syncedInventorySlots = sourceInventorySlots
    ? runtimePolicyNormalizeBotInventorySlots(sourceInventorySlots)
    : null;
  const syncedSupplies = syncedInventorySlots ? runtimePolicySuppliesForInventorySlots(syncedInventorySlots) : actor.supplies;
  const weaponSlotChanged = (actor.equipment.weapon?.itemId ?? null) !== (syncedEquipment.weapon?.itemId ?? null);
  const previousWeaponId = runtimePolicyWeaponIdForEquipment(actor.equipment) ?? nhLoadouts[actor.loadoutId].weaponId;
  const nextWeaponId = runtimePolicyWeaponIdForEquipment(syncedEquipment) ?? previousWeaponId;

  // Source: NhStakerBot.trySyncLoadoutFromOpponent() applies the source layout,
  // throttles the next sync attempt by two ticks, then clears currentOffence,
  // last prayer memory, style stall, and BOT_STYLE_KEY.
  return {
    ...state,
    actors: {
      ...state.actors,
      opponent: {
        ...actor,
        equipment: syncedEquipment,
        gearProfile,
        supplies: syncedSupplies,
        policyNextLoadoutSyncTick: nextLoadoutSyncTick,
        policyLoadoutSourceSignature: nextSourceSignature ?? actor.policyLoadoutSourceSignature,
        policyOffenceStyle: undefined,
        policyStalledStyle: null,
        policyStalledStyleTicks: 0,
        queuedSpellId: weaponSlotChanged ? null : actor.queuedSpellId,
        autocastSpellId: weaponSlotChanged ? null : actor.autocastSpellId,
        defensiveCast: weaponSlotChanged ? false : actor.defensiveCast,
        specialActive: weaponSlotChanged ? false : actor.specialActive,
        gmaul: weaponSlotChanged
          ? updateGmaulEquipment(actor.gmaul, state.tick, {
              equippedGraniteMaul: nextWeaponId === "granite_maul",
              previousWeaponHadVisibleSpecBar: nhWeaponProfiles[previousWeaponId].hasVisibleSpecBar
            })
          : actor.gmaul
      }
    }
  };
}

function runtimePolicyNormalizeBotInventorySlots(
  slots: readonly (RuntimePolicyInventorySlot | null)[]
): readonly (RuntimePolicyInventorySlot | null)[] {
  // Source: NhStakerLoadout.normalizeBotCommandLayout() replaces Vesta's
  // longsword with the bot melee candidate and Granite mauls with AGS before
  // accepting a copied NH stake layout.
  const normalized = runtimePolicyNormalizeInventorySlots(slots).map((slot) =>
    slot?.itemId === 22613
      ? { itemId: 12006, quantity: slot.quantity }
      : slot !== null && isNhGraniteMaulItemId(slot.itemId)
      ? { itemId: 11802, quantity: slot.quantity }
      : slot
  );
  if (normalized.some((slot) => slot !== null && isNhArmadylGodswordItemId(slot.itemId))) {
    return normalized;
  }
  let replaceIndex = normalized.findIndex((slot) => slot !== null && slot.itemId === 391);
  if (replaceIndex === -1) {
    replaceIndex = normalized.findIndex((slot) => slot !== null && slot.itemId === 385);
  }
  if (replaceIndex === -1) {
    replaceIndex = normalized.findIndex((slot) => slot === null);
  }
  if (replaceIndex === -1) {
    replaceIndex = normalized.length - 1;
  }
  normalized[replaceIndex] = { itemId: 11802, quantity: 1 };
  return normalized;
}

function runtimePolicySourceLayoutSignature(sourceActorView: RuntimePolicyOpponentActorView | undefined): string | null {
  if (!sourceActorView || sourceActorView.inventoryItems === undefined) {
    return null;
  }
  const inventorySlots = runtimePolicyInventorySlotsForSourceView(sourceActorView);
  if (!inventorySlots) {
    return null;
  }
  const equipment = sourceActorView.equipment ?? {};
  const equipmentSlots: readonly EquipmentSlot[] = [
    "head",
    "cape",
    "amulet",
    "weapon",
    "body",
    "shield",
    "legs",
    "hands",
    "feet",
    "ring",
    "ammo"
  ];
  const equipmentSignature = equipmentSlots
    .map((slot, index) => `${index + 1}:${equipment[slot]?.itemId ?? 0}:1`)
    .join("|");
  const inventorySignature = inventorySlots
    .map((slot, index) => `${index + 1}:${slot?.itemId ?? 0}:${slot?.quantity ?? 0}`)
    .join("|");
  // Source: NhStakerBot.savedLayoutSignature() hashes spellbook, equipment,
  // inventory, and rune-pouch templates. The web runtime only models the live
  // ancient spellbook plus equipment/inventory containers at inference time.
  return `spellbook:ancient;equipment:${equipmentSignature};inventory:${inventorySignature}`;
}

function runtimePolicyInventorySlotsForSourceView(
  sourceActorView: RuntimePolicyOpponentActorView | undefined
): readonly (RuntimePolicyInventorySlot | null)[] | null {
  if (!sourceActorView) {
    return null;
  }
  if (sourceActorView.inventorySlots) {
    return runtimePolicyNormalizeInventorySlots(sourceActorView.inventorySlots);
  }
  if (sourceActorView.inventoryItems) {
    return runtimePolicyInventorySlotsForItems(sourceActorView.inventoryItems);
  }
  return null;
}

function runtimePolicyNormalizeInventorySlots(
  slots: readonly (RuntimePolicyInventorySlot | null)[]
): (RuntimePolicyInventorySlot | null)[] {
  return Array.from({ length: 28 }, (_, index) => runtimePolicyNormalizeInventorySlot(slots[index]));
}

function runtimePolicyNormalizeInventorySlot(slot: RuntimePolicyInventorySlot | null | undefined): RuntimePolicyInventorySlot | null {
  if (!slot || slot.itemId <= 0 || slot.quantity <= 0) {
    return null;
  }
  return {
    itemId: Math.trunc(slot.itemId),
    quantity: Math.max(1, Math.trunc(slot.quantity))
  };
}

function runtimePolicySuppliesForInventorySlots(
  slots: readonly (RuntimePolicyInventorySlot | null)[]
): RuntimePlayerCombatActorState["supplies"] {
  const supplies: Record<ConsumableId, number> = {
    manta_ray: 0,
    shark: 0,
    anglerfish: 0,
    karambwan: 0,
    saradomin_brew: 0,
    super_restore: 0,
    sanfew_serum: 0,
    super_combat: 0,
    ranging_potion: 0,
    bastion: 0
  };
  for (const slot of slots) {
    if (!slot) {
      continue;
    }
    const item = runtimePolicyConsumableIdForItemId(slot.itemId);
    if (item) {
      supplies[item] += consumableUseCountForItemId(slot.itemId, slot.quantity);
    }
  }
  return supplies;
}

function runtimePolicyConsumableIdForItemId(itemId: number): ConsumableId | null {
  for (const id of Object.keys(consumableDefinitions) as ConsumableId[]) {
    const definition = consumableDefinitions[id];
    if (definition.itemIds.includes(itemId)) {
      return id;
    }
  }
  return null;
}

function runtimePolicyPerformEmergencyRecovery(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  gearProfile: NhSelectedGearProfile
): RuntimePlayerCombatState {
  const actor = state.actors[actorId];
  if (!runtimePolicyNeedsEmergencyRecovery(actor, state.tick)) {
    return state;
  }

  const recoveredEquipment = nhGearProfileCandidateEquipmentByStyle(nhLoadouts["kodai-robes"].equipment, gearProfile).magic;
  // Source: NhStakerBot.performEmergencyRecovery() restores core combat state,
  // clears autocast, then ensureLoadoutIntegrity() rebuilds the selected mage setup.
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...actor,
        loadoutId: "kodai-robes",
        equipment: recoveredEquipment,
        gearProfile,
        levels: runtimePlayerCombatDefaultLevels,
        fixedLevels: runtimePlayerCombatDefaultLevels,
        hitpoints: 99,
        maxHitpoints: 99,
        prayerPoints: 99,
        maxPrayerPoints: 99,
        supplies: runtimePlayerCombatDefaultSupplies,
        activePrayers: [],
        locks: resetFreeze(actor.locks),
        queuedSpellId: null,
        autocastSpellId: null,
        defensiveCast: false,
        specialActive: false,
        gmaul: {
          ...actor.gmaul,
          equippedGraniteMaul: false,
          previousWeaponHadVisibleSpecBar: false,
          gmaulEquippedTick: undefined,
          specBarVisibleTick: undefined,
          queuedSpecs: 0,
          timeoutTicks: 0,
          specialEnergy: 100,
          queuedTargetId: undefined
        }
      }
    }
  };
}

function runtimePolicyNeedsEmergencyRecovery(actor: RuntimePlayerCombatActorState, tick: number): boolean {
  if (actor.hitpoints <= 0 || (actor.deadUntilTick !== null && actor.deadUntilTick > tick)) {
    return false;
  }
  return runtimePolicyHasCoreStatsGap(actor) || runtimePolicyHasCriticalLoadoutGap(actor);
}

function runtimePolicyHasCoreStatsGap(actor: RuntimePlayerCombatActorState): boolean {
  // Source: NhStakerBot.hasCoreStatsGap() checks fixed/base combat levels,
  // not brewed-down current levels, before performEmergencyRecovery().
  return (
    actor.fixedLevels.attack < 90 ||
    actor.fixedLevels.strength < 90 ||
    actor.fixedLevels.defence < 90 ||
    actor.fixedLevels.ranged < 90 ||
    actor.fixedLevels.magic < 90 ||
    actor.maxPrayerPoints < 90 ||
    actor.maxHitpoints < 90
  );
}

function runtimePolicyHasCriticalLoadoutGap(actor: RuntimePlayerCombatActorState): boolean {
  const equippedItems = Object.values(actor.equipment).filter((item) => item !== undefined);
  return equippedItems.length === 0 || actor.equipment.weapon === undefined;
}

function runtimePolicyActorViewAfterEmergencyRecovery(
  actorView: RuntimePolicyOpponentActorView,
  before: RuntimePlayerCombatActorState,
  after: RuntimePlayerCombatActorState
): RuntimePolicyOpponentActorView {
  if (
    !(runtimePolicyHasCoreStatsGap(before) || runtimePolicyHasCriticalLoadoutGap(before)) ||
    runtimePolicyHasCoreStatsGap(after) ||
    runtimePolicyHasCriticalLoadoutGap(after)
  ) {
    return actorView;
  }
  return {
    ...actorView,
    loadoutId: after.loadoutId,
    equipment: after.equipment,
    gearProfile: after.gearProfile ?? actorView.gearProfile,
    stats: runtimePolicyStats(after),
    activePrayers: after.activePrayers,
    locks: after.locks
  };
}

function setRuntimePolicyOpponentCurrentOffence(
  state: RuntimePlayerCombatState,
  offenceStyle: NhOffenceStyle
): RuntimePlayerCombatState {
  return {
    ...state,
    actors: {
      ...state.actors,
      opponent: {
        ...state.actors.opponent,
        // Source: NhStakerBot.currentOffence is updated after a successful style
        // switch and is not overwritten by maybeEquipGraniteMaulForSpec().
        policyOffenceStyle: offenceStyle
      }
    }
  };
}

function runtimePolicyEnforceMagicCoreArmor(
  state: RuntimePlayerCombatState,
  gearProfile: NhSelectedGearProfile
): RuntimePlayerCombatState {
  const actor = state.actors.opponent;
  if (
    actor.equipment.body?.itemId === gearProfile.magicChestItem.itemId &&
    actor.equipment.legs?.itemId === gearProfile.magicLegsItem.itemId
  ) {
    return state;
  }
  // Source: NhStakerBot.enforceMagicCoreArmor() runs after flexible gear and
  // OFFENCE_STRIP suppression, so magic keeps its source-selected robe body/legs.
  return syncRuntimePlayerCombatStateToInput(state, {
    tiles: {
      opponent: actor.tile
    },
    equipment: {
      opponent: {
        ...actor.equipment,
        body: gearProfile.magicChestItem,
        legs: gearProfile.magicLegsItem
      }
    }
  });
}

function runtimePolicyRecoverStyleStall(
  state: RuntimePlayerCombatState,
  desiredStyle: NhOffenceStyle,
  context: NhDuelControllerContext,
  gearProfile: NhSelectedGearProfile
): {
  readonly state: RuntimePlayerCombatState;
  readonly forceStyleSwitch: boolean;
  readonly recoveryAttempted: boolean;
} {
  const actor = state.actors.opponent;
  if (runtimePolicyStyleReadyForDecision(actor, desiredStyle, context, gearProfile)) {
    return {
      state: runtimePolicySetOpponentStyleStall(state, null, 0),
      forceStyleSwitch: false,
      recoveryAttempted: false
    };
  }

  if (actor.policyStalledStyle !== desiredStyle) {
    return {
      state: runtimePolicySetOpponentStyleStall(state, desiredStyle, 1),
      forceStyleSwitch: false,
      recoveryAttempted: false
    };
  }

  const stalledTicks = actor.policyStalledStyleTicks + 1;
  if (stalledTicks < runtimePolicyStyleStallThresholdTicks) {
    return {
      state: runtimePolicySetOpponentStyleStall(state, desiredStyle, stalledTicks),
      forceStyleSwitch: false,
      recoveryAttempted: false
    };
  }

  // Source: NhStakerBot.recoverStyleStall() retries switchToStyle(),
  // applyDefencePrayer(), and applyOffencePrayer() after STYLE_STALL_THRESHOLD_TICKS.
  return {
    state: runtimePolicySetOpponentStyleStall(state, desiredStyle, 0),
    forceStyleSwitch: true,
    recoveryAttempted: true
  };
}

function runtimePolicyClearStyleStallIfReady(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  desiredStyle: NhOffenceStyle,
  context: NhDuelControllerContext,
  gearProfile: NhSelectedGearProfile
): RuntimePlayerCombatState {
  const actor = state.actors[actorId];
  return runtimePolicyStyleReadyForDecision(actor, desiredStyle, context, gearProfile)
    ? runtimePolicySetActorStyleStall(state, actorId, null, 0)
    : state;
}

function runtimePolicyStyleReadyForDecision(
  actor: RuntimePlayerCombatActorState,
  desiredStyle: NhOffenceStyle,
  context: NhDuelControllerContext,
  gearProfile: NhSelectedGearProfile
): boolean {
  return (
    runtimePolicyIsEquippedForStyle(actor, desiredStyle, gearProfile) &&
    runtimePolicyIsDefencePrayerActive(actor, context) &&
    runtimePolicyIsOffencePrayerActive(actor, desiredStyle)
  );
}

function runtimePolicyIsEquippedForStyle(
  actor: RuntimePlayerCombatActorState,
  style: NhOffenceStyle,
  gearProfile: NhSelectedGearProfile
): boolean {
  const weaponId = runtimePolicyWeaponIdForEquipment(actor.equipment);
  if (style === "magic") {
    return weaponId === gearProfile.magicWeaponId && actor.equipment.shield?.itemId === gearProfile.magicShieldItem.itemId;
  }
  if (style === "ranged") {
    return (
      weaponId === gearProfile.rangedWeaponId &&
      actor.equipment.shield?.itemId === gearProfile.rangedShieldItem.itemId &&
      actor.equipment.ammo?.itemId === gearProfile.rangedAmmoItem.itemId
    );
  }
  return weaponId === gearProfile.meleeWeaponId && actor.equipment.shield?.itemId === gearProfile.meleeShieldItem.itemId;
}

function runtimePolicyIsDefencePrayerActive(
  actor: RuntimePlayerCombatActorState,
  context: NhDuelControllerContext
): boolean {
  return actor.activePrayers.includes(runtimePolicyProtectionPrayerForOpponent(context));
}

function runtimePolicyIsOffencePrayerActive(
  actor: RuntimePlayerCombatActorState,
  style: NhOffenceStyle
): boolean {
  if (style === "magic") {
    return actor.activePrayers.includes("augury") || actor.activePrayers.includes("mystic_might");
  }
  if (style === "ranged") {
    return actor.activePrayers.includes("rigour") || actor.activePrayers.includes("eagle_eye");
  }
  return actor.activePrayers.includes("piety") || actor.activePrayers.includes("ultimate_strength");
}

function runtimePolicySetOpponentStyleStall(
  state: RuntimePlayerCombatState,
  style: NhOffenceStyle | null,
  ticks: number
): RuntimePlayerCombatState {
  return runtimePolicySetActorStyleStall(state, "opponent", style, ticks);
}

function runtimePolicySetActorStyleStall(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  style: NhOffenceStyle | null,
  ticks: number
): RuntimePlayerCombatState {
  const actor = state.actors[actorId];
  if (actor.policyStalledStyle === style && actor.policyStalledStyleTicks === ticks) {
    return state;
  }
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...actor,
        policyStalledStyle: style,
        policyStalledStyleTicks: ticks
      }
    }
  };
}

function runtimeCombatActorToNhDuelActor(
  id: "self" | "opponent",
  label: string,
  actor: RuntimePlayerCombatActorState,
  actorView: RuntimePolicyOpponentActorView,
  scale: number,
  policyRole: "policy-self" | "policy-opponent"
): NhDuelActorState {
  const observedInfoKnown = actorView.observedInfoKnown !== false;
  const loadoutId = nhLoadoutIdForRuntime(actorView.loadoutId);
  const equipment = observedInfoKnown ? actorView.equipment ?? actor.equipment : {};
  const gearProfile =
    actorView.gearProfile ??
    inferNhSelectedGearProfile({
      equipment,
      previousProfile: actor.gearProfile,
      inventoryItems: observedInfoKnown ? actorView.inventoryItems : []
    });
  const weaponId = runtimePolicyWeaponIdForEquipment(equipment) ?? nhLoadouts[loadoutId].weaponId;
  const offenceStyle = policyStyleForRuntimeWeaponId(weaponId);
  const observation = actorView.observation ?? emptyRuntimePolicyActorObservation;
  const weaponStyle = runtimePolicyVisibleStyleFromWeapon(equipment.weapon);
  const ammoStyle = runtimePolicyVisibleAmmoStyleFromEquipment(equipment);
  const attackBonusStyle = runtimePolicyVisibleStyleFromAttackBonuses(equipment);
  const visibleGearStyle = runtimePolicyVisibleGearStyleFromEquipment(equipment, weaponStyle);
  const activePrayers = observedInfoKnown ? actorView.activePrayers ?? actor.activePrayers : [];
  const prayerStyle = runtimePolicyStyleFromOffensivePrayers(activePrayers);
  const spellStyle = observedInfoKnown ? runtimePolicyReliableMagicSpellStyle(actor, weaponStyle) : null;
  const attackStyle = observedInfoKnown ? runtimePolicyStyleFromAttackSet(actor, equipment, weaponStyle) : null;
  const weaponOrAttackStyle = weaponStyle === "magic" && attackStyle === "melee"
    ? "magic"
    : weaponStyle ?? attackStyle;
  const likelyOffenceStyle = observedInfoKnown
    ? observation.likelyOffenceStyle ?? spellStyle ?? weaponOrAttackStyle ?? prayerStyle ?? ammoStyle ?? attackBonusStyle
    : null;
  const policyOffenceStyle = policyRole === "policy-self" ? actor.policyOffenceStyle ?? null : likelyOffenceStyle;
  const gmaul =
    observation.estimatedSpecialEnergy === undefined
      ? observedInfoKnown
        ? actor.gmaul
        : { ...actor.gmaul, specialEnergy: 0 }
      : { ...actor.gmaul, specialEnergy: observation.estimatedSpecialEnergy };
  return {
    id,
    label,
    tile: runtimeTileToPolicyTile(actorView.tile, scale),
    stats: observedInfoKnown ? actorView.stats ?? runtimePolicyStats(actor) : runtimePolicyUnknownOpponentInfoStats(actor),
    activePrayers,
    weaponId,
    previousWeaponId: weaponId,
    loadoutId,
    equipment,
    gearProfile,
    candidateEquipmentByStyle: nhGearProfileCandidateEquipmentByStyle(equipment, gearProfile),
    inventorySlots: observedInfoKnown
      ? runtimePolicyInventorySlotsForView(actorView, actorView.inventoryItems ?? gearProfile.ownedItems)
      : runtimePolicyInventorySlotsForItems([]),
    strippedEquipmentSlots: [],
    attackTimer: actor.attackTimer ?? createAttackTimerState(-100),
    locks: observedInfoKnown ? actorView.locks ?? actor.locks ?? createEntityLockState() : createEntityLockState(),
    supplies: actor.supplies,
    supplyDelays: actor.supplyDelays,
    gmaul,
    specialActive: actor.specialActive,
    movedThisTick: actorView.movedThisTick ?? false,
    lastMoveDx: actorView.lastMoveDx ?? 0,
    lastMoveDy: actorView.lastMoveDy ?? 0,
    ateFoodLastTick: observation.ateFoodLastTick,
    drankPotionLastTick: observation.drankPotionLastTick,
    lastDealtHit: observation.lastDealtHit,
    lastTakenHit: observation.lastTakenHit,
    rewardDelta: observation.rewardDelta,
    rewardTotal: observation.rewardTotal,
    rewardDps: observation.rewardDps,
    observedInfoKnown,
    lastOffenceStyle: policyOffenceStyle,
    lastVisibleOpponentStyle: observedInfoKnown ? visibleGearStyle : null
  };
}

function runtimePolicyInventorySlotsForView(
  actorView: RuntimePolicyOpponentActorView,
  fallbackItems: readonly VisibleEquipmentItem[]
): NhDuelActorState["inventorySlots"] {
  if (actorView.inventorySlots) {
    const normalized = runtimePolicyNormalizeInventorySlots(actorView.inventorySlots);
    return normalized.map((slot) => (slot ? { itemId: slot.itemId, quantity: slot.quantity } : null));
  }
  return runtimePolicyInventorySlotsForItems(fallbackItems);
}

function runtimePolicyInventorySlotsForItems(
  items: readonly VisibleEquipmentItem[] | undefined
): NhDuelActorState["inventorySlots"] {
  if (!items) {
    return Array.from({ length: 28 }, () => null);
  }
  return Array.from({ length: 28 }, (_, index) => {
    const item = items[index];
    return item ? { itemId: item.itemId, quantity: 1 } : null;
  });
}

const emptyRuntimePolicyActorObservation: RuntimePolicyActorObservation = {
  ateFoodLastTick: false,
  drankPotionLastTick: false,
  lastDealtHit: 0,
  lastTakenHit: 0,
  rewardDelta: 0,
  rewardTotal: 0,
  rewardDps: 0
};

const runtimePolicyClientSpecMax = 100;
const runtimePolicyClientSpecGmaulSingleCost = 50;
const runtimePolicyClientSpecRegenAmount = 10;
const runtimePolicyClientSpecRegenTicks = 50;
const runtimePolicyRewardDamageDealtWeight = 1;
const runtimePolicyRewardDamageTakenWeight = 0.7;
const runtimePolicyRewardDpsWeight = 0.2;
const runtimePolicyRewardDtpsWeight = 0.1;
const runtimePolicyRewardRollingWindowTicks = 8;
const runtimePolicyRewardKillBonus = 50;
const runtimePolicyRewardDeathPenalty = 50;
const runtimePolicyDelayedOpponentInfoDelayTicks = 1;
const runtimePolicyFreezeRetryTicks = 6;
const runtimePolicyPottedStatePerLevel = 0.00045;
const runtimePolicyBrewedDownPerLevel = 0.00065;
const runtimePolicyPottedStateMax = 0.045;
const runtimePolicyBrewedDownMax = 0.065;
const runtimePolicyCombatDeficitPenaltyScale = 0.18;
const runtimePolicyDeathUnusedHealingSupplyPenalty = 10;
const runtimePolicyDeathNoGoodSupplyPenalty = 4;
const runtimePolicyOffPrayerBonus = 0.075;
const runtimePolicyIntoPrayerPenalty = 0.18;
const runtimePolicyProtectedStyleStickPenalty = 0.038;
const runtimePolicyProtectedStyleStickGraceTicks = 2;
const runtimePolicyUnprotectedStylePressureBonus = 0.026;
const runtimePolicyGearWeaknessPressureScale = 0.082;
const runtimePolicyGearWeaknessGapScale = 0.06;
const runtimePolicyAdjacentTentacleWeaknessBonus = 0.62;
const runtimePolicyOpenTentacleMissPenalty = 0.285;
const runtimePolicyMeleeThreatPotentialScale = 0.3;
const runtimePolicyMeleeTelegraphPenalty = 0.034;
const runtimePolicyFreezeStandUnderBonus = 0.065;
const runtimePolicyFreezeUnderNoPressurePenalty = 0.03;
const runtimePolicyFreezeUnderNoPressureGraceTicks = 3;
const runtimePolicyUnderControlEntryBonus = 0.135;
const runtimePolicyUnderControlProductiveScale = 0.145;
const runtimePolicyUnderControlSafeSupplyBonus = 0.095;
const runtimePolicyUnderControlIdlePenalty = 0.042;
const runtimePolicyUnderControlIdleGraceTicks = 2;
const runtimePolicyUnderControlRouteValueFloor = 0.24;
const runtimePolicyMeleeOutOfRangePenalty = 0.024;
const runtimePolicyRangedMagicSpaceBonus = 0.01;
const runtimePolicyFrozenMeleeLockPenalty = 0.034;
const runtimePolicyFrozenCastKiteBonus = 0.01;
const runtimePolicySpecKoWindowScale = 4.25;
const runtimePolicySpecLowEvPenalty = 1.55;
const runtimePolicySpecEarlyLowPressurePenalty = 1.3;
const runtimePolicySpecSpamPenalty = 1.05;
const runtimePolicySpecSetupBonusScale = 1.25;
const runtimePolicySpecDryHighHpPenalty = 1.45;
const runtimePolicySpecMeleePrayerPenalty = 0.8;
const runtimePolicySpecMissedWindowPenalty = 0.95;
const runtimePolicySpecMissedBigHitPenalty = 0.7;
const runtimePolicySpecCredibleWindowScale = 2.05;
const runtimePolicySpecGoodKoChance = 0.26;
const runtimePolicySpecLowKoChance = 0.18;
const runtimePolicySpecCredibleWindowFloor = 0.15;
const runtimePolicySpecMissedSetupFloor = 0.44;
const runtimePolicySpecRecentRepeatTicks = 4;
const runtimePolicySpecOutcomeWindowTicks = 4;
const runtimePolicySpecOutcomeKillBonus = 4.75;
const runtimePolicySpecOutcomeDamageScale = 1.35;
const runtimePolicySpecOutcomePressureBonus = 1.2;
const runtimePolicySpecOutcomeHealPressureBonus = 0.8;
const runtimePolicySpecOutcomeWhiffPenalty = 1.05;
const runtimePolicySpecApproachBonus = 0.18;
const runtimePolicyClientThreatGmaulMax = 40;
const runtimePolicyClientThreatGmaulDoubleMax = 72;
const runtimePolicyClientThreatAgsMax = 74;
const runtimePolicyClientThreatPrayerReduction = 0.6;

interface RuntimePolicyRewardDetails {
  readonly sourcePolicyRewardId?: string;
  readonly gmaulDoubleSpec?: boolean;
  readonly specialWeaponKind?: RuntimePolicySpecialWeaponKind;
  readonly opponentStartHitpoints?: number;
  readonly recentHit?: number;
  readonly koChance?: number;
  readonly setupScore?: number;
  readonly credibleWindow?: number;
  readonly meleeProtected?: boolean;
  readonly offenceStyle?: NhOffenceStyle;
  readonly protectedStyle?: NhOffenceStyle;
  readonly protectedStyleStreak?: number;
  readonly styleProtected?: boolean;
  readonly meleeThreatPotential?: number;
  readonly distance?: number;
  readonly previousDistance?: number;
  readonly freezeUnderNoPressureTicks?: number;
  readonly underControlIdleTicks?: number;
  readonly controlValue?: number;
  readonly productiveControl?: boolean;
  readonly entry?: boolean;
  readonly supplyIntent?: NhPolicyAction["supplyIntent"];
  readonly foodUses?: number;
  readonly brewUses?: number;
  readonly restoreUses?: number;
  readonly reboostUses?: number;
  readonly appliedFoodHealing?: number;
  readonly appliedBrewHealing?: number;
  readonly wastedFoodHealing?: number;
  readonly wastedBrewHealing?: number;
  readonly supplyUrgency?: number;
  readonly riskBefore?: number;
  readonly riskAfter?: number;
  readonly riskReduction?: number;
  readonly offenceOpportunity?: number;
  readonly opportunityCost?: number;
  readonly repeatPenalty?: number;
  readonly priorSupplyActions?: number;
  readonly priorLowValueSupplies?: number;
  readonly recentSupplyActions?: number;
  readonly recentLowValueSupplies?: number;
  readonly lowValueSupply?: boolean;
  readonly restoreNeeded?: boolean;
  readonly reboostNeeded?: boolean;
  readonly restoreRecovered?: boolean;
  readonly reboosted?: boolean;
  readonly offenceEvBefore?: number;
  readonly offenceEvAfter?: number;
  readonly bestOffenceEvAfter?: number;
  readonly strippedPieces?: number;
  readonly strippedGain?: number;
  readonly strippedOffenceGain?: number;
  readonly strippedDefenceLoss?: number;
  readonly defencePrayer?: ProtectionPrayerId;
  readonly magicBelief?: number;
  readonly rangedBelief?: number;
  readonly meleeBelief?: number;
  readonly beliefConfidence?: number;
  readonly beliefReadable?: boolean;
  readonly noPrayerDamage?: number;
  readonly chosenPrayerDamage?: number;
  readonly bestPrayerDamage?: number;
  readonly averagePrayerDamage?: number;
  readonly expectedRisk?: number;
  readonly pressure?: number;
  readonly onPrayerHits?: number;
  readonly offPrayerHits?: number;
  readonly onPrayerDamage?: number;
  readonly offPrayerDamage?: number;
  readonly boostedCombatLevels?: number;
  readonly brewedDownCombatLevels?: number;
  readonly pottedStateBonus?: number;
  readonly brewedDownPenalty?: number;
  readonly combatDeficitScore?: number;
  readonly combatDeficitPenalty?: number;
  readonly unusedHealingSupplies?: number;
  readonly healingSupplyEvents?: number;
  readonly goodSupplyEvents?: number;
  readonly totalDamageTaken?: number;
  readonly avoidableSupplyPenalty?: number;
}

function appendRuntimePolicyRewardEvent(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  reason: Extract<RuntimePlayerCombatEvent, { readonly kind: "policy-reward" }>["reason"],
  reward: number,
  details: RuntimePolicyRewardDetails = {},
  eventTick = state.tick
): RuntimePlayerCombatState {
  if (reward === 0 && reason === "gmaul_missed_spec") {
    return state;
  }
  const event: RuntimePlayerCombatEvent = {
    kind: "policy-reward",
    id: `policy-reward-${eventTick}-${actorId}-${state.events.length}`,
    tick: eventTick,
    actorId,
    reason,
    reward,
    ...details
  };
  return {
    ...state,
    events: [...state.events, event].filter((entry) => entry.tick >= state.tick - runtimePolicyRetainedEventAgeTicks)
  };
}

function runtimePolicyHasPolicyRewardEvent(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  reason: Extract<RuntimePlayerCombatEvent, { readonly kind: "policy-reward" }>["reason"],
  tick: number
): boolean {
  return state.events.some(
    (event) => event.kind === "policy-reward" && event.actorId === actorId && event.reason === reason && event.tick === tick
  );
}

const runtimePolicyRetainedEventAgeTicks = 550;

function runtimePolicyOpponentSpecialEnergyEstimate(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  rewardEpisodeStartTick?: number
): number {
  // Source: NhStakerBot.resetCombatState()/resetOpponentSpecialEnergyEstimate()
  // restarts the client-side estimate at CLIENT_SPEC_MAX for a fresh tracked
  // fight; retained trainer events before the current policy episode must not
  // make the bot believe the opponent is still drained.
  const gmaulEvents = state.events
    .filter(
      (event): event is Extract<RuntimePlayerCombatEvent, { readonly kind: "attack" }> =>
        event.kind === "attack" &&
        event.attackerId === actorId &&
        event.specialAttack === "granite_maul" &&
        (rewardEpisodeStartTick === undefined || event.tick >= rewardEpisodeStartTick)
    )
    .sort((left, right) => left.tick - right.tick);

  if (gmaulEvents.length === 0) {
    return runtimePolicyClientSpecMax;
  }

  let estimate = runtimePolicyClientSpecMax;
  let estimateTick = gmaulEvents[0].tick;
  for (const event of gmaulEvents) {
    estimate = runtimePolicyRegenerateClientSpecEstimate(estimate, estimateTick, event.tick);
    estimateTick = event.tick;
    estimate = Math.max(
      0,
      estimate - (event.specialAttackCount ?? 1) * runtimePolicyClientSpecGmaulSingleCost
    );
  }

  return runtimePolicyRegenerateClientSpecEstimate(estimate, estimateTick, state.tick);
}

function runtimePolicyRegenerateClientSpecEstimate(estimate: number, fromTick: number, toTick: number): number {
  const elapsed = Math.max(0, toTick - fromTick);
  if (elapsed < runtimePolicyClientSpecRegenTicks) {
    return estimate;
  }
  const regenSteps = Math.floor(elapsed / runtimePolicyClientSpecRegenTicks);
  return Math.min(
    runtimePolicyClientSpecMax,
    estimate + Math.min(10, regenSteps) * runtimePolicyClientSpecRegenAmount
  );
}

function runtimePolicyActorObservation(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  rewardEpisodeStartTick?: number
): RuntimePolicyActorObservation {
  const previousTick = state.tick - 1;
  let ateFoodLastTick = false;
  let drankPotionLastTick = false;
  let likelyOffenceStyle: NhOffenceStyle | undefined;
  let likelyOffenceTick = Number.NEGATIVE_INFINITY;
  // Source: NhStakerBot delays the live opponent info snapshot by one tick.
  // Longer attack history is only belief evidence, not the primary likely style.
  const earliestLikelyOffenceTick = previousTick - runtimePolicyDelayedOpponentInfoDelayTicks + 1;

  for (const event of state.events) {
    if (event.kind === "supply" && event.actorId === actorId) {
      if (event.tick === previousTick) {
        const kind = consumableDefinitions[event.item].kind;
        ateFoodLastTick ||= kind === "food" || kind === "karambwan";
        drankPotionLastTick ||= kind === "potion" || kind === "brew" || kind === "restore" || kind === "reboost";
      }
    } else if (
      event.kind === "attack" &&
      event.attackerId === actorId &&
      event.tick >= earliestLikelyOffenceTick &&
      event.tick <= previousTick
    ) {
      if (event.tick >= likelyOffenceTick) {
        likelyOffenceTick = event.tick;
        likelyOffenceStyle = runtimePolicyStyleForCombatStyle(event.style);
      }
    }
  }

  const reward = runtimePolicyActorRewardSnapshot(state.events, actorId, previousTick, rewardEpisodeStartTick);
  return {
    ateFoodLastTick,
    drankPotionLastTick,
    likelyOffenceStyle,
    lastDealtHit: reward.latest.damageDealt,
    lastTakenHit: reward.latest.damageTaken,
    rewardDelta: reward.latest.reward,
    rewardTotal: reward.total,
    rewardDps: reward.latest.rewardDps
  };
}

function runtimePolicyStyleForCombatStyle(style: CombatStyle): NhOffenceStyle {
  return style === "magic" ? "magic" : style === "ranged" ? "ranged" : "melee";
}

interface RuntimePolicyActorRewardTick {
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly healed: number;
  readonly rewardDps: number;
  readonly rewardDtps: number;
  readonly reward: number;
}

function runtimePolicyActorRewardSnapshot(
  events: readonly RuntimePlayerCombatEvent[],
  actorId: RuntimeActorId,
  upToTick: number,
  rewardEpisodeStartTick?: number
): { readonly latest: RuntimePolicyActorRewardTick; readonly total: number } {
  if (upToTick < 0) {
    return {
      latest: emptyRuntimePolicyRewardTick(),
      total: 0
    };
  }

  const firstTick = runtimePolicyRewardFirstTick(events, actorId, upToTick, rewardEpisodeStartTick);
  if (firstTick === null) {
    return {
      latest: emptyRuntimePolicyRewardTick(),
      total: 0
    };
  }

  const damageWindow = Array<number>(runtimePolicyRewardRollingWindowTicks).fill(0);
  const takenWindow = Array<number>(runtimePolicyRewardRollingWindowTicks).fill(0);
  let damageTotal = 0;
  let takenTotal = 0;
  let windowCursor = 0;
  let total = 0;
  let latest = emptyRuntimePolicyRewardTick();

  for (let tick = firstTick; tick <= upToTick; tick += 1) {
    const summary = runtimePolicyActorRewardEventSummary(events, actorId, tick);
    damageTotal -= damageWindow[windowCursor];
    takenTotal -= takenWindow[windowCursor];
    damageWindow[windowCursor] = summary.damageDealt;
    takenWindow[windowCursor] = summary.damageTaken;
    damageTotal += summary.damageDealt;
    takenTotal += summary.damageTaken;
    windowCursor = (windowCursor + 1) % runtimePolicyRewardRollingWindowTicks;

    const rewardDps = damageTotal / runtimePolicyRewardRollingWindowTicks;
    const rewardDtps = takenTotal / runtimePolicyRewardRollingWindowTicks;
    // Source: NhStakerBot.updateRewardEpisode() updates the 8-tick rolling rates,
    // then sets rewardLastDelta from dealt/taken and rolling DPS/DTPS weights.
    const reward =
      summary.damageDealt * runtimePolicyRewardDamageDealtWeight -
      summary.damageTaken * runtimePolicyRewardDamageTakenWeight +
      rewardDps * runtimePolicyRewardDpsWeight -
      rewardDtps * runtimePolicyRewardDtpsWeight +
      summary.policyReward +
      summary.killBonus -
      summary.deathPenalty;

    latest = {
      damageDealt: summary.damageDealt,
      damageTaken: summary.damageTaken,
      healed: summary.healed,
      rewardDps,
      rewardDtps,
      reward
    };
    total += reward;
  }

  return {
    latest,
    total
  };
}

function runtimePolicyRewardFirstTick(
  events: readonly RuntimePlayerCombatEvent[],
  actorId: RuntimeActorId,
  upToTick: number,
  rewardEpisodeStartTick?: number
): number | null {
  if (rewardEpisodeStartTick !== undefined) {
    return rewardEpisodeStartTick <= upToTick ? rewardEpisodeStartTick : null;
  }
  let firstTick = Number.POSITIVE_INFINITY;
  for (const event of events) {
    if (event.tick > upToTick || !runtimePolicyRewardEventRelevantToActor(event, actorId)) {
      continue;
    }
    firstTick = Math.min(firstTick, event.tick);
  }
  return Number.isFinite(firstTick) ? firstTick : null;
}

function runtimePolicyActorRewardEventSummary(
  events: readonly RuntimePlayerCombatEvent[],
  actorId: RuntimeActorId,
  tick: number
): {
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly healed: number;
  readonly policyReward: number;
  readonly killBonus: number;
  readonly deathPenalty: number;
} {
  let damageDealt = 0;
  let damageTaken = 0;
  let healed = 0;
  let policyReward = 0;
  let killBonus = 0;
  let deathPenalty = 0;
  for (const event of events) {
    if (event.tick !== tick) {
      continue;
    }
    if (event.kind === "hitsplat") {
      if (event.attackerId === actorId) {
        damageDealt += event.damage;
      }
      if (event.targetActorId === actorId) {
        damageTaken += event.damage;
      }
    } else if (event.kind === "supply" && event.actorId === actorId) {
      healed += event.healed;
    } else if (event.kind === "death") {
      if (event.actorId === actorId) {
        deathPenalty += runtimePolicyRewardDeathPenalty;
      } else {
        killBonus += runtimePolicyRewardKillBonus;
      }
    } else if (event.kind === "policy-reward" && event.actorId === actorId) {
      policyReward += event.reward;
    }
  }
  return {
    damageDealt,
    damageTaken,
    healed,
    policyReward,
    killBonus,
    deathPenalty
  };
}

function runtimePolicyRewardEventRelevantToActor(
  event: RuntimePlayerCombatEvent,
  actorId: RuntimeActorId
): boolean {
  if (event.kind === "hitsplat") {
    return event.attackerId === actorId || event.targetActorId === actorId;
  }
  if (event.kind === "supply") {
    return event.actorId === actorId;
  }
  if (event.kind === "policy-reward") {
    return event.actorId === actorId;
  }
  return event.kind === "death";
}

function emptyRuntimePolicyRewardTick(): RuntimePolicyActorRewardTick {
  return {
    damageDealt: 0,
    damageTaken: 0,
    healed: 0,
    rewardDps: 0,
    rewardDtps: 0,
    reward: 0
  };
}

interface RuntimePolicySupplySummary {
  readonly state: RuntimePlayerCombatState;
  readonly consumed: readonly ConsumableId[];
  readonly supplyIntent: NhPolicyAction["supplyIntent"];
  readonly hpBefore: number;
  readonly hpAfter: number;
  readonly statsBefore: SimStats;
  readonly statsAfter: SimStats;
  readonly foodUses: number;
  readonly brewUses: number;
  readonly restoreUses: number;
  readonly reboostUses: number;
  readonly appliedFoodHealing: number;
  readonly appliedBrewHealing: number;
  readonly wastedFoodHealing: number;
  readonly wastedBrewHealing: number;
}

interface RuntimePolicyEquipmentIntentResult {
  readonly state: RuntimePlayerCombatState;
  readonly strippedSlots: readonly EquipmentSlot[];
  readonly strippedGain: number;
  readonly strippedOffenceGain: number;
  readonly strippedDefenceLoss: number;
  readonly usedRegearStyle: boolean;
}

function consumeRuntimeOpponentPolicySupplies(
  state: RuntimePlayerCombatState,
  action: NhPolicyAction,
  context: NhDuelControllerContext
): RuntimePolicySupplySummary {
  let nextState = state;
  const consumed: ConsumableId[] = [];
  const supplyIntent = runtimePolicyResolvedSupplyIntent(action.supplyIntent, context.self.stats, state, "opponent");
  const statsBefore = runtimePolicyStats(state.actors.opponent);
  const emptySummary = (): RuntimePolicySupplySummary => ({
    state: nextState,
    consumed,
    supplyIntent,
    hpBefore: state.actors.opponent.hitpoints,
    hpAfter: nextState.actors.opponent.hitpoints,
    statsBefore,
    statsAfter: runtimePolicyStats(nextState.actors.opponent),
    foodUses: 0,
    brewUses: 0,
    restoreUses: 0,
    reboostUses: 0,
    appliedFoodHealing: 0,
    appliedBrewHealing: 0,
    wastedFoodHealing: 0,
    wastedBrewHealing: 0
  });
  // Source: NhStakerBot.applySupplyIntent() promotes post-brew recovery first, then rejects supply use
  // while the actor is locked or stunned. Freeze is not an action lock, so frozen actors can still eat.
  if (!canAct(state.actors.opponent.locks, state.tick)) {
    return emptySummary();
  }
  let foodUses = 0;
  let brewUses = 0;
  let restoreUses = 0;
  let reboostUses = 0;
  let appliedFoodHealing = 0;
  let appliedBrewHealing = 0;
  let wastedFoodHealing = 0;
  let wastedBrewHealing = 0;
  const consumeItem = (item: ConsumableId): void => {
    const beforeActor = nextState.actors.opponent;
    const expectedHealing = runtimePolicyExpectedHealingAmount(item, beforeActor);
    const wastedHealing = runtimePolicyPrecomputedHealingWaste(item, beforeActor, expectedHealing);
    const result = consumeRuntimePlayerCombatSupply(nextState, "opponent", item);
    nextState = result.state;
    if (result.consumed) {
      consumed.push(item);
      const kind = consumableDefinitions[item].kind;
      if (kind === "food" || kind === "karambwan") {
        foodUses++;
        appliedFoodHealing += Math.max(0, expectedHealing - wastedHealing);
        wastedFoodHealing += wastedHealing;
      } else if (kind === "brew") {
        brewUses++;
        appliedBrewHealing += Math.max(0, expectedHealing - wastedHealing);
        wastedBrewHealing += wastedHealing;
      } else if (kind === "restore") {
        restoreUses++;
      } else if (kind === "reboost") {
        reboostUses++;
      }
    }
  };
  const consumeRestoreReboostIfNeeded = (): void => {
    if (runtimePolicyNeedsRestoreNow(runtimePolicyStats(nextState.actors.opponent))) {
      consumeFirstAvailable(["super_restore", "sanfew_serum"]);
    }
    if (runtimePolicyNeedsRangedReboostNow(runtimePolicyStats(nextState.actors.opponent))) {
      // Source: NhStakerBot.drinkReboostPotionsDetailed() tries the ranged
      // reboost first, but only while the current stats still need it.
      consumeFirstAvailable(["bastion", "ranging_potion"]);
    }
    if (runtimePolicyNeedsMeleeReboostNow(runtimePolicyStats(nextState.actors.opponent))) {
      consumeFirstAvailable(["super_combat"]);
    }
  };

  const consumeFirstAvailable = (items: readonly ConsumableId[]): void => {
    for (const item of items) {
      const beforeConsumed = consumed.length;
      consumeItem(item);
      if (consumed.length > beforeConsumed) {
        return;
      }
    }
  };

  for (const items of runtimePolicySupplyItemGroupsForIntent(supplyIntent)) {
    consumeFirstAvailable(items);
  }
  if (supplyIntent === "restore_reboost" || supplyIntent === "panic_full") {
    // Source: NhStakerBot.PANIC_FULL checks needsRestoreNow()/needsReboostNow()
    // after main food, brew, and karambwan have already applied their effects.
    consumeRestoreReboostIfNeeded();
  }
  nextState = runtimePolicyStateWithPostBrewRecoveryUntilTick(
    nextState,
    "opponent",
    runtimePolicyPostBrewRecoveryUntilAfterSupply({
      previousUntilTick: state.actors.opponent.policyPostBrewRecoveryUntilTick ?? 0,
      tick: state.tick,
      supplyIntent,
      statsAfter: runtimePolicyStats(nextState.actors.opponent),
      brewUses,
      restoreUses,
      reboostUses
    })
  );
  return {
    state: nextState,
    consumed,
    supplyIntent,
    hpBefore: state.actors.opponent.hitpoints,
    hpAfter: nextState.actors.opponent.hitpoints,
    statsBefore,
    statsAfter: runtimePolicyStats(nextState.actors.opponent),
    foodUses,
    brewUses,
    restoreUses,
    reboostUses,
    appliedFoodHealing,
    appliedBrewHealing,
    wastedFoodHealing,
    wastedBrewHealing
  };
}

function runtimePolicyPostBrewRecoveryUntilAfterSupply(input: {
  readonly previousUntilTick: number;
  readonly tick: number;
  readonly supplyIntent: NhPolicyAction["supplyIntent"];
  readonly statsAfter: SimStats;
  readonly brewUses: number;
  readonly restoreUses: number;
  readonly reboostUses: number;
}): number {
  const stickyUntilTick = input.tick + runtimePolicySupplyRecoveryStickyTicks;
  if ((input.supplyIntent === "triple_eat" || input.supplyIntent === "brew_only") && input.brewUses > 0) {
    return stickyUntilTick;
  }
  if (input.supplyIntent === "restore_reboost") {
    if (!runtimePolicyNeedsPostBrewRecovery(input.statsAfter)) {
      return 0;
    }
    return input.restoreUses > 0 || input.reboostUses > 0 ? stickyUntilTick : input.previousUntilTick;
  }
  if (input.supplyIntent === "panic_full" && (input.brewUses > 0 || input.restoreUses > 0 || input.reboostUses > 0)) {
    return stickyUntilTick;
  }
  return input.previousUntilTick;
}

function runtimePolicyStateWithPostBrewRecoveryUntilTick(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  untilTick: number
): RuntimePlayerCombatState {
  const actor = state.actors[actorId];
  if ((actor.policyPostBrewRecoveryUntilTick ?? 0) === untilTick) {
    return state;
  }
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...actor,
        policyPostBrewRecoveryUntilTick: untilTick
      }
    }
  };
}

function applyRuntimeOpponentPolicyEquipmentIntent(
  state: RuntimePlayerCombatState,
  action: NhPolicyAction,
  context: NhDuelControllerContext,
  currentStyleEquipment: VisibleEquipment,
  currentOffenceStyle: NhOffenceStyle | null,
  underPressure: boolean
): RuntimePolicyEquipmentIntentResult {
  const actor = state.actors.opponent;
  let nextState = state;
  let equipment = actor.equipment;
  let strippedSlots: readonly EquipmentSlot[] = [];
  let strippedGain = 0;
  let strippedOffenceGain = 0;
  let strippedDefenceLoss = 0;
  let usedRegearStyle = false;

  // Source: NhStakerBot.applySupplyIntent() handles OFFENCE_STRIP/REGEAR_STYLE inside the same
  // locked/stunned supply gate, while ordinary style loadout still runs later in the tick.
  if (!canAct(actor.locks, state.tick)) {
    return { state, strippedSlots: [], strippedGain, strippedOffenceGain, strippedDefenceLoss, usedRegearStyle };
  }

  if (action.supplyIntent === "regear_style" && currentOffenceStyle !== null) {
    // Source: NhStakerBot.applySupplyIntent(REGEAR_STYLE) calls
    // applyLoadout(currentOffence), which starts by clearing autocast and
    // queuedSpell even when the regear leaves the same weapon equipped.
    nextState = setRuntimePlayerCombatAutocast(nextState, "opponent", null);
    equipment = currentStyleEquipment;
    usedRegearStyle = true;
  } else if (
    currentOffenceStyle !== null &&
    (action.supplyIntent === "offence_strip_one" || action.supplyIntent === "offence_strip_two")
  ) {
    const stripResult = stripRuntimePolicyEquipmentForOffence({
      equipment,
      style: currentOffenceStyle,
      threatStyle: runtimePolicyResolveThreatStyle(context),
      // Source: NhStakerBot.applySupplyIntent() passes opponent != null && isAggressingBot(opponent);
      // low HP is applied separately inside stripDefencePenaltyWeight().
      underPressure,
      hitpoints: actor.hitpoints,
      maxPieces: action.supplyIntent === "offence_strip_two" ? 2 : 1
    });
    equipment = stripResult.equipment;
    strippedSlots = strippedRuntimePolicyEquipmentSlots(actor.equipment, equipment);
    strippedGain = stripResult.netGain;
    strippedOffenceGain = stripResult.offenceGain;
    strippedDefenceLoss = stripResult.defenceLoss;
  }

  if (equipment === actor.equipment) {
    return { state: nextState, strippedSlots: [], strippedGain, strippedOffenceGain, strippedDefenceLoss, usedRegearStyle };
  }

  return {
    state: syncRuntimePlayerCombatStateToInput(nextState, {
      tiles: {
        opponent: actor.tile
      },
      equipment: {
        opponent: equipment
      }
    }),
    strippedSlots,
    strippedGain,
    strippedOffenceGain,
    strippedDefenceLoss,
    usedRegearStyle
  };
}

function runtimePolicySupplyReward(input: {
  readonly stateBeforeSupply: RuntimePlayerCombatState;
  readonly stateAfterSupply: RuntimePlayerCombatState;
  readonly stateAfterEquipment: RuntimePlayerCombatState;
  readonly context: NhDuelControllerContext;
  readonly action: NhPolicyAction;
  readonly supply: RuntimePolicySupplySummary;
  readonly equipment: RuntimePolicyEquipmentIntentResult;
  readonly gearProfile: NhSelectedGearProfile;
}): { readonly reward: number; readonly details: RuntimePolicyRewardDetails } | null {
  const supply = input.supply;
  const healingUses = supply.foodUses + supply.brewUses;
  const supplyActionCount = healingUses + supply.restoreUses + supply.reboostUses;
  const strippedPieces = input.equipment.strippedSlots.length;
  const stripIntent = supply.supplyIntent === "offence_strip_one" || supply.supplyIntent === "offence_strip_two";
  const regearIntent = supply.supplyIntent === "regear_style";
  if (supply.supplyIntent === "none" || (supplyActionCount <= 0 && !stripIntent && !regearIntent)) {
    return null;
  }

  const beforeActor = input.stateBeforeSupply.actors.opponent;
  const afterSupplyActor = input.stateAfterSupply.actors.opponent;
  const afterEquipmentActor = input.stateAfterEquipment.actors.opponent;
  const currentOffence = input.context.self.lastOffenceStyle ?? null;
  const threatStyle = runtimePolicyResolveThreatStyle(input.context);
  const underPressure = runtimePolicyIsAggressingActor(input.stateBeforeSupply, "opponent", "local-player");
  const defencePrayerAtUse = runtimePolicyProtectedStyleFromPrayer(activeProtectionPrayer(input.context.self.activePrayers));
  const protectedStyle = runtimePolicyProtectedStyleFromPrayer(activeProtectionPrayer(input.context.opponent.activePrayers));
  const offenceStyleProtectedAtUse = currentOffence !== null && currentOffence === protectedStyle;
  const beforeContext = runtimePolicyContextWithSelfActor(
    input.context,
    beforeActor,
    supply.statsBefore,
    input.gearProfile
  );
  const afterContext = runtimePolicyContextWithSelfActor(
    input.context,
    afterEquipmentActor,
    supply.statsAfter,
    input.gearProfile
  );
  const appliedHealing = Math.max(0, supply.appliedFoodHealing + supply.appliedBrewHealing);
  const supplyUrgency = runtimePolicySupplyHealingUrgency(beforeContext, threatStyle, supply.hpBefore, underPressure);
  const riskBefore = runtimePolicyClientKoRisk(beforeContext, threatStyle, supply.hpBefore, defencePrayerAtUse);
  const riskAfter = runtimePolicyClientKoRisk(beforeContext, threatStyle, afterSupplyActor.hitpoints, defencePrayerAtUse);
  const riskReduction = Math.max(0, riskBefore - riskAfter);
  const offenceOpportunity = runtimePolicySupplyOffenceOpportunity(beforeContext, input.stateBeforeSupply);
  const offenceEvBefore =
    currentOffence === null
      ? 0
      : runtimePolicyClientOffenceEvForActor(beforeContext, currentOffence, supply.statsBefore, beforeContext.self);
  const offenceEvAfter =
    currentOffence === null
      ? 0
      : runtimePolicyClientOffenceEvForActor(afterContext, currentOffence, supply.statsAfter, afterContext.self);
  const bestOffenceEvAfter = runtimePolicyBestClientOffenceEvForActor(afterContext, supply.statsAfter, afterContext.self);
  const brewOnlyTempo = supply.supplyIntent === "brew_only" && supply.brewUses > 0 && supply.foodUses === 0;
  const brewOnlyEvWindow =
    brewOnlyTempo &&
    offenceEvAfter >= runtimePolicyBrewTempoMinPostEv &&
    offenceEvAfter >= offenceEvBefore * runtimePolicyBrewTempoMinEvRetention &&
    offenceEvAfter >= bestOffenceEvAfter - runtimePolicyBrewTempoBestEvMargin;
  const healingPenaltyUses =
    supply.foodUses + supply.brewUses * (brewOnlyTempo ? runtimePolicyBrewOnlyPenaltyWeight : 0.75);
  const supplyMemory = runtimePolicyRecentSupplyMemory(input.stateBeforeSupply, "opponent", input.stateBeforeSupply.tick);

  const attackFixed = supply.statsBefore.attack.fixed;
  const strengthFixed = supply.statsBefore.strength.fixed;
  const defenceFixed = supply.statsBefore.defence.fixed;
  const rangedFixed = supply.statsBefore.ranged.fixed;
  const magicFixed = supply.statsBefore.magic.fixed;
  const restoreNeeded =
    supply.statsBefore.prayer.current < runtimePolicyRestorePrayerThreshold ||
    supply.statsBefore.attack.current + runtimePolicyRestoreStatDeficitLevels < attackFixed ||
    supply.statsBefore.strength.current + runtimePolicyRestoreStatDeficitLevels < strengthFixed ||
    supply.statsBefore.defence.current + runtimePolicyRestoreStatDeficitLevels < defenceFixed ||
    supply.statsBefore.ranged.current + runtimePolicyRestoreStatDeficitLevels < rangedFixed ||
    supply.statsBefore.magic.current + runtimePolicyRestoreStatDeficitLevels < magicFixed;
  const reboostNeeded = runtimePolicyNeedsReboostNow(supply.statsBefore);
  let restoreRecovered = false;
  let reboosted = false;
  let opportunityCost = 0;
  let repeatPenalty = 0;
  let delta = 0;

  if (supply.foodUses > 0 || supply.brewUses > 0) {
    if (appliedHealing > 0 && riskReduction >= runtimePolicySupplyMeaningfulRiskDrop) {
      const healingScale = 0.65 + Math.min(1.1, appliedHealing / 32);
      delta += runtimePolicySupplyRiskReductionScale * riskReduction * healingScale;
    } else if (appliedHealing > 0 && supplyUrgency >= 0.45 && riskBefore >= 0.4) {
      const healingScale = 0.55 + Math.min(1.15, appliedHealing / 26);
      delta += runtimePolicySupplyGoodBonus * supplyUrgency * healingScale * 0.18;
    }
    const tempoBrew =
      brewOnlyTempo &&
      brewOnlyEvWindow &&
      supply.appliedBrewHealing > 0 &&
      supply.wastedBrewHealing <= supply.appliedBrewHealing &&
      supply.hpBefore < 82 &&
      Math.max(riskBefore, supplyUrgency) >= 0.16;
    if (tempoBrew) {
      const wasteScale = Math.max(0.25, 1 - supply.wastedBrewHealing / 16);
      delta +=
        runtimePolicyBrewTempoHealBonus *
        (0.65 + Math.max(riskBefore, supplyUrgency)) *
        (0.7 + Math.min(0.55, offenceEvAfter)) *
        wasteScale;
    }
    const safety = 1 - supplyUrgency;
    if (healingPenaltyUses > 0 && safety > 0.35) {
      delta -= runtimePolicySupplyBadPenalty * healingPenaltyUses * safety;
    }
    if (healingPenaltyUses > 0 && riskBefore < 0.35) {
      delta -= runtimePolicySupplyLowRiskUsePenalty * healingPenaltyUses * (1 - riskBefore);
    }
    if (healingPenaltyUses > 0 && riskReduction <= 0.015) {
      delta -= runtimePolicySupplyNoRiskReductionPenalty * healingPenaltyUses * (1 + Math.max(0, safety - 0.35));
    }
    if (appliedHealing <= 0 && healingUses > 0) {
      delta -= runtimePolicySupplyBadPenalty * healingPenaltyUses;
    }
  }

  if (supply.restoreUses > 0) {
    restoreRecovered =
      supply.statsAfter.prayer.current > supply.statsBefore.prayer.current ||
      supply.statsAfter.attack.current > supply.statsBefore.attack.current ||
      supply.statsAfter.strength.current > supply.statsBefore.strength.current ||
      supply.statsAfter.defence.current > supply.statsBefore.defence.current ||
      supply.statsAfter.ranged.current > supply.statsBefore.ranged.current ||
      supply.statsAfter.magic.current > supply.statsBefore.magic.current;
    if (restoreRecovered && restoreNeeded) {
      delta += runtimePolicySupplyGoodBonus * 0.65;
    } else if (restoreRecovered) {
      delta -= runtimePolicySupplyUnneededRestorePenalty;
    } else {
      delta -= runtimePolicySupplyBadPenalty * 0.55;
    }
  }

  if (supply.reboostUses > 0) {
    reboosted =
      supply.statsAfter.attack.current > supply.statsBefore.attack.current ||
      supply.statsAfter.strength.current > supply.statsBefore.strength.current ||
      supply.statsAfter.defence.current > supply.statsBefore.defence.current ||
      supply.statsAfter.ranged.current > supply.statsBefore.ranged.current;
    if (reboosted && reboostNeeded) {
      delta += runtimePolicySupplyGoodBonus * 0.55;
    } else if (reboosted) {
      delta -= runtimePolicySupplyUnneededReboostPenalty;
    } else {
      delta -= runtimePolicySupplyBadPenalty * 0.45;
    }
  }

  const lowValueHealing =
    healingUses > 0 &&
    !(brewOnlyEvWindow && supply.appliedBrewHealing > 0 && supply.hpBefore < 82) &&
    riskReduction < runtimePolicySupplyMeaningfulRiskDrop &&
    (riskBefore < 0.6 || supplyUrgency < 0.6);
  const lowValueSupport =
    (supply.restoreUses > 0 && (!restoreRecovered || !restoreNeeded)) ||
    (supply.reboostUses > 0 && (!reboosted || !reboostNeeded));
  const lowValueSupply = lowValueHealing || lowValueSupport;

  if (healingUses > 0 && offenceOpportunity > 0 && (riskBefore < 0.55 || riskReduction < 0.1)) {
    const opportunityUses =
      supply.foodUses + supply.brewUses * (brewOnlyEvWindow ? 0.25 : brewOnlyTempo ? 0.45 : 0.65);
    opportunityCost =
      runtimePolicySupplyOpportunityCostScale *
      opportunityUses *
      offenceOpportunity *
      Math.max(0.2, 1 - riskBefore);
    delta -= opportunityCost;
  }
  if (supplyActionCount > 0 && supplyMemory.recentSupplyActions > 0 && (lowValueSupply || riskBefore < 0.45)) {
    const repeatPressure = Math.min(4, supplyMemory.recentSupplyActions + supplyMemory.recentLowValueSupplies * 0.65);
    repeatPenalty =
      runtimePolicySupplyRepeatLowValuePenalty *
      repeatPressure *
      Math.max(0.35, 1 - riskBefore) *
      (lowValueSupply ? 1.35 : 0.75) *
      (brewOnlyTempo ? 0.55 : 1);
    delta -= repeatPenalty;
  }

  delta -= supply.foodUses * runtimePolicyFoodUseCost;
  delta -= supply.brewUses * runtimePolicyBrewUseCost;
  delta -= supply.restoreUses * runtimePolicyRestoreUseCost;
  delta -= supply.reboostUses * runtimePolicyReboostUseCost;
  delta -= supply.wastedFoodHealing * runtimePolicyFoodWastePenaltyPerHp;
  delta -= supply.wastedBrewHealing * runtimePolicyBrewWastePenaltyPerHp;

  if (stripIntent) {
    const safeStripWindow = !underPressure && !offenceStyleProtectedAtUse && supply.hpBefore >= 72;
    if (
      strippedPieces > 0 &&
      input.equipment.strippedGain > offenceStripMinImprovement &&
      input.equipment.strippedOffenceGain > offenceStripMinImprovement &&
      safeStripWindow
    ) {
      const effectiveGain = Math.min(input.equipment.strippedGain, input.equipment.strippedOffenceGain);
      delta += Math.min(0.55, effectiveGain * runtimePolicyOffenceStripGainScale);
    } else {
      delta -= runtimePolicyOffenceStripFailPenalty;
    }
    if (strippedPieces > 0 && input.equipment.strippedOffenceGain <= offenceStripMinImprovement) {
      delta -= runtimePolicyOffenceStripBadOffencePenalty;
    }
    if (strippedPieces > 0 && input.equipment.strippedGain <= 0) {
      delta -= runtimePolicyOffenceStripBadNetPenalty;
    }
    if (underPressure && strippedPieces > 0) {
      delta -= runtimePolicyOffenceStripUnderPressurePenalty * strippedPieces;
    }
    if (offenceStyleProtectedAtUse && strippedPieces > 0) {
      delta -= runtimePolicyOffenceStripFailPenalty * 0.8;
    }
    if (input.equipment.strippedDefenceLoss > 0) {
      const defenceLossScale = Math.min(1, input.equipment.strippedDefenceLoss / 65);
      delta -=
        defenceLossScale *
        (underPressure
          ? runtimePolicyOffenceStripUnderPressurePenalty
          : runtimePolicyOffenceStripUnderPressurePenalty * 0.45);
    }
    if (strippedPieces > 0 && input.equipment.strippedDefenceLoss > 0) {
      const offenceFloor = Math.max(0.01, input.equipment.strippedOffenceGain);
      const asymmetry = input.equipment.strippedDefenceLoss / offenceFloor;
      if (asymmetry > 1) {
        delta -= Math.min(0.45, (asymmetry - 1) * runtimePolicyOffenceStripAsymmetricLossScale);
      }
    }
  } else if (regearIntent) {
    if (input.equipment.usedRegearStyle) {
      delta += underPressure ? runtimePolicyRegearStyleBonus : runtimePolicyRegearStyleBonus * 0.45;
    } else {
      delta -= runtimePolicyOffenceStripFailPenalty * 0.5;
    }
  }

  const nextSupplyActions = supplyActionCount > 0
    ? Math.min(6, supplyMemory.recentSupplyActions + 1)
    : supplyMemory.recentSupplyActions;
  const nextLowValueSupplies = supplyActionCount > 0
    ? lowValueSupply
      ? Math.min(6, supplyMemory.recentLowValueSupplies + 1)
      : Math.max(0, supplyMemory.recentLowValueSupplies - 1)
    : supplyMemory.recentLowValueSupplies;

  return {
    reward: delta,
    details: {
      supplyIntent: supply.supplyIntent,
      foodUses: supply.foodUses,
      brewUses: supply.brewUses,
      restoreUses: supply.restoreUses,
      reboostUses: supply.reboostUses,
      appliedFoodHealing: supply.appliedFoodHealing,
      appliedBrewHealing: supply.appliedBrewHealing,
      wastedFoodHealing: supply.wastedFoodHealing,
      wastedBrewHealing: supply.wastedBrewHealing,
      supplyUrgency,
      riskBefore,
      riskAfter,
      riskReduction,
      offenceOpportunity,
      opportunityCost,
      repeatPenalty,
      priorSupplyActions: supplyMemory.recentSupplyActions,
      priorLowValueSupplies: supplyMemory.recentLowValueSupplies,
      recentSupplyActions: nextSupplyActions,
      recentLowValueSupplies: nextLowValueSupplies,
      lowValueSupply,
      restoreNeeded,
      reboostNeeded,
      restoreRecovered,
      reboosted,
      offenceEvBefore,
      offenceEvAfter,
      bestOffenceEvAfter,
      strippedPieces,
      strippedGain: input.equipment.strippedGain,
      strippedOffenceGain: input.equipment.strippedOffenceGain,
      strippedDefenceLoss: input.equipment.strippedDefenceLoss,
      offenceStyle: currentOffence ?? undefined,
      protectedStyle: protectedStyle ?? undefined,
      styleProtected: offenceStyleProtectedAtUse
    }
  };
}

function runtimePolicyContextWithSelfActor(
  context: NhDuelControllerContext,
  actor: RuntimePlayerCombatActorState,
  stats: SimStats,
  gearProfile: NhSelectedGearProfile
): NhDuelControllerContext {
  const equipment = actor.equipment;
  return {
    ...context,
    self: {
      ...context.self,
      stats,
      equipment,
      gearProfile,
      candidateEquipmentByStyle: nhGearProfileCandidateEquipmentByStyle(equipment, gearProfile),
      supplies: actor.supplies,
      gmaul: actor.gmaul,
      specialActive: actor.specialActive
    }
  };
}

function runtimePolicyRecentSupplyMemory(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  tick: number
): { readonly recentSupplyActions: number; readonly recentLowValueSupplies: number } {
  const earliestTick = tick - runtimePolicySupplyRepeatWindowTicks;
  const previous = [...state.events].reverse().find(
    (event): event is Extract<RuntimePlayerCombatEvent, { readonly kind: "policy-reward" }> =>
      event.kind === "policy-reward" &&
      event.actorId === actorId &&
      event.reason === "supply_reward" &&
      event.tick >= earliestTick &&
      event.tick <= tick
  );
  return {
    recentSupplyActions: previous?.recentSupplyActions ?? 0,
    recentLowValueSupplies: previous?.recentLowValueSupplies ?? 0
  };
}

function runtimePolicyExpectedHealingAmount(item: ConsumableId, actor: RuntimePlayerCombatActorState): number {
  if (item === "manta_ray") {
    return 22;
  }
  if (item === "shark") {
    return 20;
  }
  if (item === "anglerfish") {
    const fixed = actor.maxHitpoints;
    const c = fixed <= 24 ? 2 : fixed <= 49 ? 4 : fixed <= 74 ? 6 : fixed <= 92 ? 8 : 13;
    return Math.floor(fixed / 10) + c;
  }
  if (item === "karambwan") {
    return 18;
  }
  if (item === "saradomin_brew") {
    return 2 + Math.trunc(actor.maxHitpoints * 0.15);
  }
  return 0;
}

function runtimePolicyPrecomputedHealingWaste(
  item: ConsumableId,
  actor: RuntimePlayerCombatActorState,
  expectedHealing: number
): number {
  if (expectedHealing <= 0) {
    return 0;
  }
  const cap = item === "saradomin_brew" ? actor.maxHitpoints + expectedHealing : actor.maxHitpoints;
  const headroom = Math.max(0, cap - actor.hitpoints);
  const potentialHealing = Math.min(expectedHealing, headroom);
  return Math.max(0, expectedHealing - potentialHealing);
}

function runtimePolicySupplyHealingUrgency(
  context: NhDuelControllerContext,
  threatStyle: NhOffenceStyle | null,
  hp: number,
  underPressure: boolean
): number {
  const risk = runtimePolicyClientKoRisk(
    context,
    threatStyle,
    hp,
    runtimePolicyProtectedStyleFromPrayer(activeProtectionPrayer(context.self.activePrayers))
  );
  return underPressure ? risk : Math.max(0, risk - 0.06);
}

function runtimePolicyClientKoRisk(
  context: NhDuelControllerContext,
  threatStyle: NhOffenceStyle | null,
  hp: number,
  defenceStyle: NhOffenceStyle | null
): number {
  if (hp <= 0 || !threatStyle) {
    return 0;
  }
  const firstHitMax = runtimePolicyMitigatedClientHitForPrayer(
    runtimePolicyEstimatedThreatMaxHit(context, threatStyle),
    threatStyle,
    defenceStyle
  );
  const opponentSpecEnergy = context.opponent.gmaul.specialEnergy;
  const gmaulFollowup = opponentSpecEnergy >= 50 && runtimePolicyClientGmaulFollowupPossible(context, threatStyle);
  const followupMax = gmaulFollowup
    ? runtimePolicyMitigatedClientHitForPrayer(
        context.opponent.weaponId === "granite_maul" && opponentSpecEnergy >= 100
          ? runtimePolicyClientThreatGmaulDoubleMax
          : runtimePolicyClientThreatGmaulMax,
        "melee",
        defenceStyle
      )
    : 0;
  const burstMax = Math.min(99, firstHitMax + followupMax);
  const emergencyHeal = runtimePolicyEmergencyHealBeforeFollowup(context.self);
  const inRange = runtimePolicyThreatInRange(context, threatStyle);
  const firstHitRisk = runtimePolicySoftKoRisk(hp, firstHitMax, inRange ? 10 : 4);
  const burstRisk = gmaulFollowup ? runtimePolicySoftKoRisk(hp + emergencyHeal, burstMax, inRange ? 12 : 6) : 0;
  let pressureRisk = inRange ? 0.16 : 0.04;
  if (gmaulFollowup) {
    pressureRisk += 0.12;
  }
  if (isFrozen(context.self.locks, context.tick) && runtimePolicyObservedOpponentMeleeReachable(context)) {
    pressureRisk += 0.08;
  }
  return runtimePolicyClamp01(Math.max(pressureRisk, Math.max(firstHitRisk, burstRisk)));
}

function runtimePolicyMitigatedClientHitForPrayer(
  hit: number,
  style: NhOffenceStyle,
  defenceStyle: NhOffenceStyle | null
): number {
  return defenceStyle === style ? Math.max(0, Math.round(hit * runtimePolicyClientThreatPrayerReduction)) : hit;
}

function runtimePolicyClientGmaulFollowupPossible(context: NhDuelControllerContext, style: NhOffenceStyle): boolean {
  if (!runtimePolicyObservedOpponentMeleeReachable(context)) {
    return false;
  }
  if (context.opponent.weaponId === "granite_maul") {
    return true;
  }
  return style === "melee" || style === "ranged";
}

function runtimePolicyEmergencyHealBeforeFollowup(actor: NhDuelActorState): number {
  let heal = 0;
  if (actor.supplies.manta_ray + actor.supplies.shark + actor.supplies.anglerfish + actor.supplies.karambwan > 0) {
    heal = Math.max(heal, 22);
  }
  if (actor.supplies.saradomin_brew > 0) {
    heal = Math.max(heal, 16);
  }
  return Math.round(heal * 0.45);
}

function runtimePolicySupplyOffenceOpportunity(context: NhDuelControllerContext, state: RuntimePlayerCombatState): number {
  if (runtimePolicyActorDeadAtTick(state.actors["local-player"], state.tick)) {
    return 0;
  }
  const opponentHp = runtimePolicyOpponentVisibleHp(context);
  const recentHit = Math.max(0, context.self.lastDealtHit);
  const distance = runtimePolicyObservedDistance(context);
  const lowHpScore = runtimePolicyClamp01((72 - opponentHp) / 46);
  const recentHitScore = runtimePolicyClamp01((recentHit - 16) / 26);
  const freezeControl = isFrozen(context.opponent.locks, context.tick) && !isFrozen(context.self.locks, context.tick) &&
    distance >= 0 && distance <= 6
    ? 0.2
    : 0;
  const attackWindow =
    (context.self.lastOffenceStyle ? runtimePolicyStyleInOffensiveRange(context, context.self.lastOffenceStyle) : false) ||
    canAttackByTimer(context.self.attackTimer, context.tick)
      ? 0.14
      : 0;
  let specWindow = 0;
  const meleeProtected = activeProtectionPrayer(context.opponent.activePrayers) === protectPrayerForStyle("crush");
  const specialKind = runtimePolicyAvailableSpecialWeaponKind(context.self);
  const exposure = specialKind ? runtimePolicyOpponentMeleeSpecExposure(context, specialKind) : 1;
  if (specialKind && runtimePolicyCanUseSpecialSpecFromObserved(context, specialKind, false)) {
    specWindow = Math.max(
      specWindow,
      runtimePolicyClientSpecialKoChance(context, specialKind, false, exposure, meleeProtected, opponentHp)
    );
    specWindow = Math.max(specWindow, runtimePolicySpecialSetupScore(specialKind, false, opponentHp, recentHit, exposure, meleeProtected));
  }
  if (specialKind && runtimePolicyCanUseSpecialSpecFromObserved(context, specialKind, true)) {
    specWindow = Math.max(specWindow, runtimePolicyClientGmaulKoChance(context, true, exposure, meleeProtected, opponentHp));
    specWindow = Math.max(specWindow, runtimePolicyGmaulSetupScore(true, opponentHp, recentHit, exposure, meleeProtected));
  }
  const pressureWindow = lowHpScore * 0.48 + recentHitScore * 0.28 + freezeControl + attackWindow;
  return runtimePolicyClamp01(Math.max(specWindow, pressureWindow));
}

interface RuntimePolicyEquipmentStripInput {
  readonly equipment: VisibleEquipment;
  readonly style: NhOffenceStyle;
  readonly threatStyle: NhOffenceStyle | null;
  readonly underPressure: boolean;
  readonly hitpoints: number;
  readonly maxPieces: number;
}

const equipmentRows = equipmentRowsJson as readonly EquipmentBonusRow[];
const offenceStripSlots: readonly EquipmentSlot[] = ["shield", "body", "legs", "head", "cape", "amulet", "hands", "feet"];
const offenceStripMinImprovement = 0.09;

function stripRuntimePolicyEquipmentForOffence(input: RuntimePolicyEquipmentStripInput): {
  readonly equipment: VisibleEquipment;
  readonly netGain: number;
  readonly offenceGain: number;
  readonly defenceLoss: number;
} {
  let equipment = input.equipment;
  let netGain = 0;
  let offenceGain = 0;
  let defenceLoss = 0;
  for (let count = 0; count < Math.max(0, Math.trunc(input.maxPieces)); count += 1) {
    const candidate = bestRuntimePolicyOffenceStripCandidate(
      equipment,
      input.style,
      input.threatStyle,
      input.underPressure,
      input.hitpoints
    );
    if (!candidate || candidate.netGain <= offenceStripMinImprovement) {
      break;
    }
    const nextEquipment: Partial<Record<EquipmentSlot, VisibleEquipment[EquipmentSlot]>> = { ...equipment };
    delete nextEquipment[candidate.slot];
    equipment = nextEquipment;
    netGain += candidate.netGain;
    offenceGain += candidate.offenceGain;
    defenceLoss += candidate.defenceLoss;
  }
  return { equipment, netGain, offenceGain, defenceLoss };
}

function strippedRuntimePolicyEquipmentSlots(
  before: VisibleEquipment,
  after: VisibleEquipment
): readonly EquipmentSlot[] {
  return offenceStripSlots.filter((slot) => before[slot] !== undefined && after[slot] === undefined);
}

function bestRuntimePolicyOffenceStripCandidate(
  equipment: VisibleEquipment,
  style: NhOffenceStyle,
  threatStyle: NhOffenceStyle | null,
  underPressure: boolean,
  hitpoints: number
): { readonly slot: EquipmentSlot; readonly netGain: number; readonly offenceGain: number; readonly defenceLoss: number } | null {
  const currentBonuses = aggregateVisibleEquipmentBonuses(equipment, equipmentRows);
  const currentOffence = offensiveScoreForStyle(style, currentBonuses);
  const currentDefence = defenceScoreAgainstThreat(threatStyle, currentBonuses);
  const defenceWeight = stripDefencePenaltyWeight(threatStyle, underPressure, hitpoints);
  let best: { readonly slot: EquipmentSlot; readonly netGain: number; readonly offenceGain: number; readonly defenceLoss: number } | null = null;

  for (const slot of offenceStripSlots) {
    if (!equipment[slot]) {
      continue;
    }
    const withoutEquipment: Partial<Record<EquipmentSlot, VisibleEquipment[EquipmentSlot]>> = { ...equipment };
    delete withoutEquipment[slot];
    const withoutBonuses = aggregateVisibleEquipmentBonuses(withoutEquipment, equipmentRows);
    const offenceGain = offensiveScoreForStyle(style, withoutBonuses) - currentOffence;
    const defenceLoss = Math.max(0, currentDefence - defenceScoreAgainstThreat(threatStyle, withoutBonuses));
    const netGain = offenceGain - defenceLoss * defenceWeight;
    if (netGain > offenceStripMinImprovement && (!best || netGain > best.netGain)) {
      best = { slot, netGain, offenceGain, defenceLoss };
    }
  }

  return best;
}

function offensiveScoreForStyle(style: NhOffenceStyle, bonuses: BonusTable): number {
  if (style === "magic") {
    return bonuses.magic_attack_bonus + 2 * bonuses.magic_damage_bonus;
  }
  if (style === "ranged") {
    return bonuses.range_attack_bonus + 1.8 * bonuses.ranged_strength_bonus;
  }
  return Math.max(bonuses.stab_attack_bonus, bonuses.slash_attack_bonus, bonuses.crush_attack_bonus) +
    1.8 * bonuses.melee_strength_bonus;
}

function defenceScoreAgainstThreat(style: NhOffenceStyle | null, bonuses: BonusTable): number {
  if (style === null) {
    return 0;
  }
  if (style === "magic") {
    return bonuses.magic_defence_bonus;
  }
  if (style === "ranged") {
    return bonuses.range_defence_bonus;
  }
  return Math.max(bonuses.stab_defence_bonus, bonuses.slash_defence_bonus, bonuses.crush_defence_bonus);
}

function stripDefencePenaltyWeight(style: NhOffenceStyle | null, underPressure: boolean, hitpoints: number): number {
  let weight = style ? (underPressure ? 1.04 : 0.62) : 0.3;
  if (hitpoints <= 45) {
    weight *= 1.3;
  } else if (hitpoints <= 65) {
    weight *= 1.15;
  }
  return weight;
}

function applyRuntimeOpponentPolicyMovementIntent(input: {
  readonly state: RuntimePlayerCombatState;
  readonly action: NhPolicyAction;
  readonly context: NhDuelControllerContext;
  readonly opponentTile: RuntimeTile;
  readonly localTile: RuntimeTile;
  readonly scale: number;
  readonly canStep?: RuntimePolicyStepPredicate;
  readonly targetRouteStep?: RuntimePolicyTargetRouteStepPredicate;
  readonly tileRouteStep?: RuntimePolicyTileRouteStepPredicate;
  readonly projectileLineOfSight?: RuntimePolicyProjectileLineOfSightPredicate;
  readonly nextRepositionTick: number;
}): {
  readonly state: RuntimePlayerCombatState;
  readonly opponentTile: RuntimeTile;
  readonly moved: boolean;
  readonly lastMoveDx: number;
  readonly lastMoveDy: number;
  readonly blockedReason: string | null;
  readonly nextRepositionTick: number | null;
} {
  const actor = input.state.actors.opponent;
  if (input.action.movementIntent === "pressure") {
    const pressureApproachTile = runtimePolicyPressureApproachTile(input);
    if (pressureApproachTile && !sameRuntimePolicyTile(pressureApproachTile, input.opponentTile)) {
      if (!canMove(actor.locks, input.state.tick)) {
        return {
          state: input.state,
          opponentTile: input.opponentTile,
          moved: false,
          lastMoveDx: 0,
          lastMoveDy: 0,
          blockedReason: "movement-gated",
          nextRepositionTick: input.nextRepositionTick
        };
      }
      if (
        input.canStep &&
        !input.canStep(input.opponentTile, pressureApproachTile, {
          movementIntent: "pressure",
          targetTile: input.localTile,
          allowTargetTile: false
        })
      ) {
        return {
          state: input.state,
          opponentTile: input.opponentTile,
          moved: false,
          lastMoveDx: 0,
          lastMoveDy: 0,
          blockedReason: "collision",
          nextRepositionTick: input.nextRepositionTick
        };
      }
      return {
        state: syncRuntimePlayerCombatStateToInput(input.state, {
          tiles: {
            opponent: pressureApproachTile
          }
        }),
        opponentTile: pressureApproachTile,
        moved: true,
        lastMoveDx: runtimePolicyStepDelta(input.opponentTile.x, pressureApproachTile.x, input.scale),
        lastMoveDy: runtimePolicyStepDelta(input.opponentTile.z, pressureApproachTile.z, input.scale),
        blockedReason: null,
        nextRepositionTick: input.nextRepositionTick
      };
    }
    return {
      state: input.state,
      opponentTile: input.opponentTile,
      moved: false,
      lastMoveDx: 0,
      lastMoveDy: 0,
      blockedReason: null,
      nextRepositionTick: input.nextRepositionTick
    };
  }

  if (!canMove(actor.locks, input.state.tick)) {
    return {
      state: input.state,
      opponentTile: input.opponentTile,
      moved: false,
      lastMoveDx: 0,
      lastMoveDy: 0,
      blockedReason: "movement-gated",
      nextRepositionTick: input.nextRepositionTick
    };
  }

  if (input.state.tick < input.nextRepositionTick) {
    return {
      state: input.state,
      opponentTile: input.opponentTile,
      moved: false,
      lastMoveDx: 0,
      lastMoveDy: 0,
      blockedReason: "reposition-cooldown",
      nextRepositionTick: input.nextRepositionTick
    };
  }

  const attemptedNextRepositionTick = runtimePolicyNextRepositionTickAfterMovement(
    input.state.tick,
    input.action.movementIntent
  );
  const standUnderRouteResult = runtimePolicyStandUnderRouteTile(input, attemptedNextRepositionTick);
  if (standUnderRouteResult) {
    return standUnderRouteResult;
  }

  const nextTile = runtimePolicyMovementTile(input);
  if (!nextTile || sameRuntimePolicyTile(nextTile, input.opponentTile)) {
    const blockedNextRepositionTick =
      input.action.movementIntent === "step_out" && !nextTile ? attemptedNextRepositionTick : input.nextRepositionTick;
    return {
      state: input.state,
      opponentTile: input.opponentTile,
      moved: false,
      lastMoveDx: 0,
      lastMoveDy: 0,
      blockedReason: nextTile ? null : "source-gated",
      nextRepositionTick: nextTile ? attemptedNextRepositionTick : blockedNextRepositionTick
    };
  }

  if (runtimePolicyDirectionalStepWouldStarveTargetRoute(input, nextTile)) {
    return {
      state: input.state,
      opponentTile: input.opponentTile,
      moved: false,
      lastMoveDx: 0,
      lastMoveDy: 0,
      blockedReason: "source-gated",
      nextRepositionTick: attemptedNextRepositionTick
    };
  }

  const targetTileStep = sameRuntimePolicyTile(nextTile, input.localTile);
  const allowTargetTile = input.action.movementIntent === "stand_under";
  // Source: NhStakerBot.tryStep(... allowTargetTile=false) cannot step onto the
  // opponent tile for ordinary directional movement; only attemptStandUnder() opts in.
  if (targetTileStep && !allowTargetTile) {
    return {
      state: input.state,
      opponentTile: input.opponentTile,
      moved: false,
      lastMoveDx: 0,
      lastMoveDy: 0,
      blockedReason: "source-gated",
      nextRepositionTick: attemptedNextRepositionTick
    };
  }

  // Source: NhStakerBot.tryStep() rejects non-target movement when
  // ProjectileRoute.allow(candidate, target) fails.
  if (
    !targetTileStep &&
    input.projectileLineOfSight !== undefined &&
    !input.projectileLineOfSight(nextTile, input.localTile)
  ) {
    return {
      state: input.state,
      opponentTile: input.opponentTile,
      moved: false,
      lastMoveDx: 0,
      lastMoveDy: 0,
      blockedReason: "projectile-line-of-sight",
      nextRepositionTick: attemptedNextRepositionTick
    };
  }

  if (
    input.canStep &&
    !input.canStep(input.opponentTile, nextTile, {
      movementIntent: input.action.movementIntent,
      targetTile: input.localTile,
      allowTargetTile
    })
  ) {
    return {
      state: input.state,
      opponentTile: input.opponentTile,
      moved: false,
      lastMoveDx: 0,
      lastMoveDy: 0,
      blockedReason: "collision",
      nextRepositionTick: attemptedNextRepositionTick
    };
  }

  return {
    state: syncRuntimePlayerCombatStateToInput(input.state, {
      tiles: {
        opponent: nextTile
      }
    }),
    opponentTile: nextTile,
    moved: true,
    lastMoveDx: runtimePolicyStepDelta(input.opponentTile.x, nextTile.x, input.scale),
    lastMoveDy: runtimePolicyStepDelta(input.opponentTile.z, nextTile.z, input.scale),
    blockedReason: null,
    nextRepositionTick: attemptedNextRepositionTick
  };
}

function runtimePolicyStandUnderRouteTile(
  input: {
    readonly state: RuntimePlayerCombatState;
    readonly action: NhPolicyAction;
    readonly context: NhDuelControllerContext;
    readonly opponentTile: RuntimeTile;
    readonly localTile: RuntimeTile;
    readonly tileRouteStep?: RuntimePolicyTileRouteStepPredicate;
    readonly scale: number;
  },
  attemptedNextRepositionTick: number
): {
  readonly state: RuntimePlayerCombatState;
  readonly opponentTile: RuntimeTile;
  readonly moved: boolean;
  readonly lastMoveDx: number;
  readonly lastMoveDy: number;
  readonly blockedReason: string | null;
  readonly nextRepositionTick: number | null;
} | null {
  if (input.action.movementIntent !== "stand_under") {
    return null;
  }
  if (
    isFrozen(input.context.self.locks, input.context.tick) ||
    !isFrozen(input.context.opponent.locks, input.context.tick)
  ) {
    return null;
  }
  const observedDistance = chebyshevPolicyDistance(input.context.self.tile, input.context.opponent.tile);
  if (observedDistance <= 1) {
    return null;
  }
  if (!input.tileRouteStep) {
    return {
      state: input.state,
      opponentTile: input.opponentTile,
      moved: false,
      lastMoveDx: 0,
      lastMoveDy: 0,
      blockedReason: "source-gated",
      nextRepositionTick: attemptedNextRepositionTick
    };
  }

  // Source: NhStakerBot.attemptStandUnder() sets nextRepositionTick=tick+1,
  // then for observedDistance > 1 calls RouteFinder.routeAbsolute(delayed.x, delayed.y).
  // That is an exact tile route to the frozen target, not a direct stepToward fallback.
  const routeStep = input.tileRouteStep(input.opponentTile, input.localTile, {
    movementIntent: "stand_under",
    targetTile: input.localTile,
    allowTargetTile: true
  });
  if (!routeStep || sameRuntimePolicyTile(routeStep, input.opponentTile)) {
    return {
      state: input.state,
      opponentTile: input.opponentTile,
      moved: false,
      lastMoveDx: 0,
      lastMoveDy: 0,
      blockedReason: "collision",
      nextRepositionTick: attemptedNextRepositionTick
    };
  }

  return {
    state: syncRuntimePlayerCombatStateToInput(input.state, {
      tiles: {
        opponent: routeStep
      }
    }),
    opponentTile: routeStep,
    moved: true,
    lastMoveDx: runtimePolicyStepDelta(input.opponentTile.x, routeStep.x, input.scale),
    lastMoveDy: runtimePolicyStepDelta(input.opponentTile.z, routeStep.z, input.scale),
    blockedReason: null,
    nextRepositionTick: attemptedNextRepositionTick
  };
}

function ensureRuntimeOpponentPolicyMagicLineOfSight(input: {
  readonly state: RuntimePlayerCombatState;
  readonly action: NhPolicyAction;
  readonly opponentTile: RuntimeTile;
  readonly localTile: RuntimeTile;
  readonly movedThisTick: boolean;
  readonly lastMoveDx: number;
  readonly lastMoveDy: number;
  readonly blockedReason: string | null;
  readonly nextRepositionTick: number;
  readonly scale: number;
  readonly canStep?: RuntimePolicyStepPredicate;
  readonly projectileLineOfSight?: RuntimePolicyProjectileLineOfSightPredicate;
}): {
  readonly state: RuntimePlayerCombatState;
  readonly opponentTile: RuntimeTile;
  readonly moved: boolean;
  readonly lastMoveDx: number;
  readonly lastMoveDy: number;
  readonly blockedReason: string | null;
  readonly nextRepositionTick: number | null;
} {
  if (input.action.offenceStyle !== "magic") {
    return {
      state: input.state,
      opponentTile: input.opponentTile,
      moved: input.movedThisTick,
      lastMoveDx: input.lastMoveDx,
      lastMoveDy: input.lastMoveDy,
      blockedReason: input.blockedReason,
      nextRepositionTick: input.nextRepositionTick
    };
  }

  const overlapping = sameRuntimePolicyTile(input.opponentTile, input.localTile);
  const projectileBlocked =
    !overlapping &&
    input.projectileLineOfSight !== undefined &&
    !input.projectileLineOfSight(input.opponentTile, input.localTile);
  if (!overlapping && !projectileBlocked) {
    return {
      state: input.state,
      opponentTile: input.opponentTile,
      moved: input.movedThisTick,
      lastMoveDx: input.lastMoveDx,
      lastMoveDy: input.lastMoveDy,
      blockedReason: input.blockedReason,
      nextRepositionTick: input.nextRepositionTick
    };
  }

  const actor = input.state.actors.opponent;
  if (input.movedThisTick || !canMove(actor.locks, input.state.tick)) {
    return {
      state: input.state,
      opponentTile: input.opponentTile,
      moved: input.movedThisTick,
      lastMoveDx: input.lastMoveDx,
      lastMoveDy: input.lastMoveDy,
      blockedReason: input.blockedReason ?? "movement-gated",
      nextRepositionTick: input.nextRepositionTick
    };
  }
  if (input.state.tick < input.nextRepositionTick) {
    return {
      state: input.state,
      opponentTile: input.opponentTile,
      moved: input.movedThisTick,
      lastMoveDx: input.lastMoveDx,
      lastMoveDy: input.lastMoveDy,
      blockedReason: input.blockedReason ?? "reposition-cooldown",
      nextRepositionTick: input.nextRepositionTick
    };
  }

  const attemptedNextRepositionTick = input.state.tick + 2;
  const nextTile = runtimePolicyMagicLineOfSightStepTile(input);
  if (!nextTile) {
    return {
      state: input.state,
      opponentTile: input.opponentTile,
      moved: input.movedThisTick,
      lastMoveDx: input.lastMoveDx,
      lastMoveDy: input.lastMoveDy,
      blockedReason: input.blockedReason ?? "magic-line-of-sight",
      nextRepositionTick: attemptedNextRepositionTick
    };
  }

  return {
    state: syncRuntimePlayerCombatStateToInput(input.state, {
      tiles: {
        opponent: nextTile
      }
    }),
    opponentTile: nextTile,
    moved: true,
    lastMoveDx: runtimePolicyStepDelta(input.opponentTile.x, nextTile.x, input.scale),
    lastMoveDy: runtimePolicyStepDelta(input.opponentTile.z, nextTile.z, input.scale),
    blockedReason: null,
    nextRepositionTick: attemptedNextRepositionTick
  };
}

function runtimePolicyMagicLineOfSightStepTile(input: {
  readonly state: RuntimePlayerCombatState;
  readonly opponentTile: RuntimeTile;
  readonly localTile: RuntimeTile;
  readonly scale: number;
  readonly canStep?: RuntimePolicyStepPredicate;
  readonly projectileLineOfSight?: RuntimePolicyProjectileLineOfSightPredicate;
}): RuntimeTile | null {
  // Source: NhStakerBot.ensureMagicLineOfSight() calls stepAwayFrom() when the bot is
  // under the target or ProjectileRoute blocks the cast, and the reposition itself
  // uses the same stepAwayFrom() candidate ordering as policy STEP_OUT.
  return stepAwayRuntimePolicyTile(input);
}

function stepAwayRuntimePolicyTile(input: {
  readonly state: RuntimePlayerCombatState;
  readonly opponentTile: RuntimeTile;
  readonly localTile: RuntimeTile;
  readonly scale: number;
  readonly canStep?: RuntimePolicyStepPredicate;
  readonly projectileLineOfSight?: RuntimePolicyProjectileLineOfSightPredicate;
}): RuntimeTile | null {
  for (const step of runtimePolicyStepAwayDeltas(input)) {
    const candidate = runtimePolicyTryStepAwayTile(input, step.dx, step.dz);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function runtimePolicyTryStepAwayTile(
  input: {
    readonly state: RuntimePlayerCombatState;
    readonly opponentTile: RuntimeTile;
    readonly localTile: RuntimeTile;
    readonly scale: number;
    readonly canStep?: RuntimePolicyStepPredicate;
    readonly projectileLineOfSight?: RuntimePolicyProjectileLineOfSightPredicate;
  },
  dx: number,
  dz: number
): RuntimeTile | null {
  if (dx === 0 && dz === 0) {
    return null;
  }
  const candidate = {
    x: input.opponentTile.x + dx * input.scale,
    z: input.opponentTile.z + dz * input.scale
  };
  if (sameRuntimePolicyTile(candidate, input.localTile)) {
    return null;
  }
  if (
    input.canStep &&
    !input.canStep(input.opponentTile, candidate, {
      movementIntent: "step_out",
      targetTile: input.localTile,
      allowTargetTile: false
    })
  ) {
    return null;
  }
  if (
    input.projectileLineOfSight !== undefined &&
    !input.projectileLineOfSight(candidate, input.localTile)
  ) {
    return null;
  }
  return candidate;
}

function runtimePolicyPressureApproachTile(input: {
  readonly action: NhPolicyAction;
  readonly context: NhDuelControllerContext;
  readonly opponentTile: RuntimeTile;
  readonly localTile: RuntimeTile;
  readonly scale: number;
  readonly targetRouteStep?: RuntimePolicyTargetRouteStepPredicate;
}): RuntimeTile | null {
  const shouldRouteToOpponent =
    input.action.offenceStyle === "melee" && !input.context.meleeReachable;
  const shouldRouteForSpec =
    chebyshevPolicyDistance(input.context.self.tile, input.context.opponent.tile) === 2 &&
    nhPolicyGmaulSpecApproachWindow(input.context, false) >= runtimePolicySpecApproachWindowFloor;

  if (shouldRouteToOpponent || shouldRouteForSpec) {
    // Source: NhStakerBot.applyMovementIntent(PRESSURE) calls routeToOpponentIfAllowed()
    // for melee pressure and shouldApproachForSpec(). RouteFinder.routeEntity()
    // uses RouteEntity/ClipUtils.canStep, so collision detours must come from the
    // same target-route path when a scene collision map is available.
    if (input.targetRouteStep) {
      return input.targetRouteStep(input.opponentTile, input.localTile, 1, {
        movementIntent: "pressure",
        targetTile: input.localTile,
        allowTargetTile: false
      });
    }
    return stepTowardRuntimePolicyTile(input.opponentTile, input.localTile, input.scale, false);
  }

  return null;
}

function runtimePolicyDirectionalStepWouldStarveTargetRoute(
  input: {
    readonly action: NhPolicyAction;
    readonly context: NhDuelControllerContext;
    readonly opponentTile: RuntimeTile;
    readonly localTile: RuntimeTile;
    readonly scale: number;
  },
  nextTile: RuntimeTile
): boolean {
  if (!runtimePolicyMovementIsDirectional(input.action.movementIntent)) {
    return false;
  }
  const maxRange = runtimePolicyTargetRouteRangeForStyle(input.action.offenceStyle, input.context.self);
  if (maxRange === null) {
    return false;
  }
  const currentDistance = chebyshevPolicyDistance(
    runtimeTileToPolicyTile(input.opponentTile, input.scale),
    runtimeTileToPolicyTile(input.localTile, input.scale)
  );
  const nextDistance = chebyshevPolicyDistance(
    runtimeTileToPolicyTile(nextTile, input.scale),
    runtimeTileToPolicyTile(input.localTile, input.scale)
  );
  if (currentDistance < 0 || nextDistance < 0) {
    return false;
  }
  // Source: ranged/magic attacks ultimately pass through PlayerCombat.preAttack() and
  // TargetRoute.inRange(... distance). The trainer runs policy movement before the
  // target-route attack pass, so a max-range sideways/away step must not consume the
  // movement slot every tick and prevent the same source TargetRoute pressure path.
  return currentDistance >= maxRange && nextDistance >= currentDistance;
}

function runtimePolicyMovementIsDirectional(movement: NhMovementIntent): boolean {
  return movement.startsWith("step_") && movement !== "step_out";
}

function runtimePolicyTargetRouteRangeForStyle(style: NhOffenceStyle, actor: NhDuelActorState): number | null {
  if (style === "magic") {
    return 10;
  }
  if (style === "ranged") {
    const rangedWeaponId =
      actor.gearProfile?.rangedWeaponId ??
      nhGearProfileWeaponIdForEquipment(actor.candidateEquipmentByStyle?.ranged ?? actor.equipment) ??
      actor.weaponId;
    return nhWeaponProfiles[rangedWeaponId].attackRange;
  }
  return null;
}

function runtimePolicyNextRepositionTickAfterMovement(tick: number, movement: NhMovementIntent): number {
  // Source: NhStakerBot.stepAwayFrom() sets nextRepositionTick=tick+2; stand-under
  // and directional policy steps set tick+1.
  return movement === "step_out" ? tick + 2 : tick + 1;
}

function runtimePolicyMovementTile(input: {
  readonly state: RuntimePlayerCombatState;
  readonly action: NhPolicyAction;
  readonly context: NhDuelControllerContext;
  readonly opponentTile: RuntimeTile;
  readonly localTile: RuntimeTile;
  readonly scale: number;
  readonly canStep?: RuntimePolicyStepPredicate;
  readonly projectileLineOfSight?: RuntimePolicyProjectileLineOfSightPredicate;
}): RuntimeTile | null {
  const movement = input.action.movementIntent;
  if (movement === "stand_under") {
    if (
      isFrozen(input.context.self.locks, input.context.tick) ||
      !isFrozen(input.context.opponent.locks, input.context.tick)
    ) {
      return null;
    }
    return stepTowardRuntimePolicyTile(input.opponentTile, input.localTile, input.scale, true);
  }
  if (movement === "step_out") {
    return stepAwayRuntimePolicyTile(input);
  }

  const direction = directionForRuntimePolicyMovement(movement);
  return {
    x: input.opponentTile.x + direction.dx * input.scale,
    z: input.opponentTile.z + direction.dy * input.scale
  };
}

function directionForRuntimePolicyMovement(movement: NhMovementIntent): { readonly dx: number; readonly dy: number } {
  if (movement === "step_north") {
    return { dx: 0, dy: 1 };
  }
  if (movement === "step_south") {
    return { dx: 0, dy: -1 };
  }
  if (movement === "step_east") {
    return { dx: 1, dy: 0 };
  }
  if (movement === "step_west") {
    return { dx: -1, dy: 0 };
  }
  if (movement === "step_north_east") {
    return { dx: 1, dy: 1 };
  }
  if (movement === "step_north_west") {
    return { dx: -1, dy: 1 };
  }
  if (movement === "step_south_east") {
    return { dx: 1, dy: -1 };
  }
  if (movement === "step_south_west") {
    return { dx: -1, dy: -1 };
  }
  return { dx: 0, dy: 0 };
}

function stepTowardRuntimePolicyTile(
  self: RuntimeTile,
  target: RuntimeTile,
  scale: number,
  allowTargetTile: boolean
): RuntimeTile {
  const dx = runtimePolicyStepDelta(self.x, target.x, scale);
  const dz = runtimePolicyStepDelta(self.z, target.z, scale);
  const nextTile = {
    x: self.x + dx * scale,
    z: self.z + dz * scale
  };
  return !allowTargetTile && sameRuntimePolicyTile(nextTile, target) ? self : nextTile;
}

function runtimePolicyStepAwayDeltas(input: {
  readonly state: RuntimePlayerCombatState;
  readonly opponentTile: RuntimeTile;
  readonly localTile: RuntimeTile;
  readonly scale: number;
}): readonly { readonly dx: number; readonly dz: number }[] {
  // Source: NhStakerBot.stepAwayFrom() computes -unitVector to the target, uses
  // Random.rollDie(2, 1) when either axis is zero, then scans current.area(1)
  // using Position.area's x-major/y-min-to-max order if the first step is blocked.
  // The TS runtime keeps movement pure, so the rollDie side is a deterministic
  // seed/tick/tile hash instead of consuming hidden global RNG.
  const primaryDx =
    -runtimePolicyStepDelta(input.opponentTile.x, input.localTile.x, input.scale) ||
    runtimePolicyStepAwayTieBreak(input, "x");
  const primaryDz =
    -runtimePolicyStepDelta(input.opponentTile.z, input.localTile.z, input.scale) ||
    runtimePolicyStepAwayTieBreak(input, "z");
  const deltas: { dx: number; dz: number }[] = [{ dx: primaryDx, dz: primaryDz }];

  for (const dx of [-1, 0, 1]) {
    for (const dz of [-1, 0, 1]) {
      if (dx === 0 && dz === 0) {
        continue;
      }
      if (dx === primaryDx && dz === primaryDz) {
        continue;
      }
      deltas.push({ dx, dz });
    }
  }
  return deltas;
}

function runtimePolicyStepAwayTieBreak(
  input: {
    readonly state: RuntimePlayerCombatState;
    readonly opponentTile: RuntimeTile;
    readonly localTile: RuntimeTile;
    readonly scale: number;
  },
  axis: "x" | "z"
): number {
  const selfX = Math.round(input.opponentTile.x / input.scale);
  const selfZ = Math.round(input.opponentTile.z / input.scale);
  const targetX = Math.round(input.localTile.x / input.scale);
  const targetZ = Math.round(input.localTile.z / input.scale);
  const axisSalt = axis === "x" ? 0x9e3779b9 : 0x85ebca6b;
  const hash =
    Math.imul(selfX, 73856093) ^
    Math.imul(selfZ, 19349663) ^
    Math.imul(targetX, 83492791) ^
    Math.imul(targetZ, 2654435761) ^
    Math.imul(input.state.tick + 1, 1597334677) ^
    input.state.randomSeed ^
    axisSalt;
  return (hash & 1) === 0 ? -1 : 1;
}

function runtimePolicyStepDelta(from: number, to: number, scale: number): number {
  return Math.sign(Math.round((to - from) / scale));
}

function sameRuntimePolicyTile(left: RuntimeTile, right: RuntimeTile): boolean {
  return left.x === right.x && left.z === right.z;
}

function runtimePolicySupplyItemGroupsForIntent(
  supplyIntent: NhPolicyAction["supplyIntent"]
): readonly (readonly ConsumableId[])[] {
  if (supplyIntent === "safe_eat") {
    // Source: NhStakerBot.eatMainFoodDetailed() consumes MAIN_FOOD_IDS = manta/shark.
    return [["manta_ray", "shark"]];
  }
  if (supplyIntent === "double_eat") {
    return [["manta_ray", "shark"], ["karambwan"]];
  }
  if (supplyIntent === "triple_eat" || supplyIntent === "panic_full") {
    return [["manta_ray", "shark"], ["saradomin_brew"], ["karambwan"]];
  }
  if (supplyIntent === "brew_only") {
    return [["saradomin_brew"]];
  }
  return [];
}

const runtimePolicyRestorePrayerThreshold = 55;
const runtimePolicyRestoreStatDeficitLevels = 3;
const runtimePolicyReboostStatDeficitLevels = 3;
const runtimePolicySupplyRecoveryStickyTicks = 8;

function runtimePolicyResolvedSupplyIntent(
  supplyIntent: NhPolicyAction["supplyIntent"],
  stats: SimStats,
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId
): NhPolicyAction["supplyIntent"] {
  if (supplyIntent !== "none") {
    return supplyIntent;
  }
  // Source: NhStakerBot.applySupplyIntent() promotes NONE to RESTORE_REBOOST while
  // post-brew recovery is sticky and needsPostBrewRecovery() is still true.
  return runtimePolicyHasPostBrewRecoveryWindow(state, actorId) && runtimePolicyNeedsPostBrewRecovery(stats)
    ? "restore_reboost"
    : "none";
}

function runtimePolicyHasPostBrewRecoveryWindow(state: RuntimePlayerCombatState, actorId: RuntimeActorId): boolean {
  // Source: NhStakerBot keeps postBrewRecoveryUntilTick as mutable policy state;
  // it extends after brew/needed recovery and clears as soon as recovery is done.
  const untilTick = state.actors[actorId].policyPostBrewRecoveryUntilTick ?? 0;
  return untilTick > 0 && untilTick >= state.tick;
}

function runtimePolicyNeedsPostBrewRecovery(stats: SimStats): boolean {
  return (
    stats.attack.current + 2 < stats.attack.fixed ||
    stats.ranged.current + 2 < stats.ranged.fixed ||
    stats.magic.current + 2 < stats.magic.fixed ||
    stats.prayer.current < 62
  );
}

function runtimePolicyNeedsRestoreNow(stats: SimStats): boolean {
  return (
    stats.prayer.current < runtimePolicyRestorePrayerThreshold ||
    stats.attack.current + runtimePolicyRestoreStatDeficitLevels < stats.attack.fixed ||
    stats.strength.current + runtimePolicyRestoreStatDeficitLevels < stats.strength.fixed ||
    stats.defence.current + runtimePolicyRestoreStatDeficitLevels < stats.defence.fixed ||
    stats.ranged.current + runtimePolicyRestoreStatDeficitLevels < stats.ranged.fixed ||
    stats.magic.current + runtimePolicyRestoreStatDeficitLevels < stats.magic.fixed
  );
}

function runtimePolicyNeedsReboostNow(stats: SimStats): boolean {
  return runtimePolicyNeedsMeleeReboostNow(stats) || runtimePolicyNeedsRangedReboostNow(stats);
}

function runtimePolicyNeedsMeleeReboostNow(stats: SimStats): boolean {
  return (
    runtimePolicyBelowBoostFloor(stats.attack) ||
    runtimePolicyBelowBoostFloor(stats.strength) ||
    runtimePolicyBelowBoostFloor(stats.defence)
  );
}

function runtimePolicyNeedsRangedReboostNow(stats: SimStats): boolean {
  return runtimePolicyBelowBoostFloor(stats.ranged) || runtimePolicyBelowBoostFloor(stats.defence);
}

function runtimePolicyBelowBoostFloor(stat: SimStat): boolean {
  return stat.fixed > 0 && stat.current < stat.fixed + runtimePolicyReboostStatDeficitLevels;
}

function runtimePolicyStats(actor: RuntimePlayerCombatActorState): SimStats {
  return {
    attack: statFromLevel(actor.levels.attack, actor.fixedLevels.attack),
    strength: statFromLevel(actor.levels.strength, actor.fixedLevels.strength),
    defence: statFromLevel(actor.levels.defence, actor.fixedLevels.defence),
    ranged: statFromLevel(actor.levels.ranged, actor.fixedLevels.ranged),
    magic: statFromLevel(actor.levels.magic, actor.fixedLevels.magic),
    hitpoints: {
      current: actor.hitpoints,
      fixed: actor.maxHitpoints
    },
    prayer: {
      current: actor.prayerPoints,
      fixed: actor.maxPrayerPoints
    }
  };
}

function runtimePolicyUnknownOpponentInfoStats(actor: RuntimePlayerCombatActorState): SimStats {
  const stats = runtimePolicyStats(actor);
  return {
    ...stats,
    hitpoints: {
      current: -1,
      fixed: stats.hitpoints.fixed
    },
    prayer: {
      current: 0,
      fixed: stats.prayer.fixed
    }
  };
}

function statFromLevel(value: number, fixedValue = 99): SimStats["attack"] {
  const level = normalizedLevel(value);
  const fixed = normalizedLevel(fixedValue);
  return {
    current: level,
    fixed
  };
}

function normalizedLevel(value: number): CombatLevels["attack"] {
  return Math.max(1, Math.trunc(Number.isFinite(value) ? value : 99));
}

function runtimeLoadoutForPolicyAction(action: NhPolicyAction, gearProfile: NhSelectedGearProfile): RuntimeLoadoutId {
  if (action.offenceStyle === "magic") {
    return "kodai-robes";
  }
  if (action.offenceStyle === "ranged") {
    return "acb-hides";
  }
  if (action.specIntent === "use_special" && nhGearProfileAvailableSpecialWeaponKind(gearProfile) === "armadyl_godsword") {
    return "ags-bandos";
  }
  return "tentacle-bandos";
}

function runtimePolicyPrayersForAction(
  actor: RuntimePlayerCombatActorState,
  action: NhPolicyAction,
  offencePrayerAction: NhPolicyAction = action
): readonly PrayerId[] {
  if (actor.prayerPoints <= 0) {
    return [];
  }
  // Source: NhStakerBot.run() applies resolveDefencePrayer() after live style
  // countering, but applyOffencePrayer(decision.offencePrayer, desiredOffence)
  // keeps the sanitized/context-guarded decision offence prayer as preferred.
  return [action.defencePrayer, offensivePrayerForPolicyStyle(offencePrayerAction.offenceStyle, actor)];
}

function offensivePrayerForPolicyStyle(style: NhOffenceStyle, actor?: RuntimePlayerCombatActorState): PrayerId {
  const [preferred, fallback] =
    style === "magic"
      ? (["augury", "mystic_might"] as const)
      : style === "ranged"
        ? (["rigour", "eagle_eye"] as const)
        : (["piety", "ultimate_strength"] as const);
  // Source: NhStakerBot.activateOffencePrayer() tries the preferred offence prayer
  // first, then activatePrayerPrefer() falls back to the lower-tier prayer before
  // unsafe-forcing the chosen prayer.
  return actor && !runtimePolicyCanActivatePreferredOffencePrayer(actor, preferred) ? fallback : preferred;
}

function runtimePolicyCanActivatePreferredOffencePrayer(
  actor: RuntimePlayerCombatActorState,
  prayer: PrayerId
): boolean {
  const definition = prayerDefinitions[prayer];
  if (actor.maxPrayerPoints < definition.level) {
    return false;
  }
  if (prayer === "piety" || prayer === "rigour" || prayer === "augury") {
    // Source: Prayer.checkReq() checks fixed Prayer level, and Piety/Rigour/Augury
    // activationCheck uses StatList.checkFixed(Defence, 70), not current Defence.
    return actor.fixedLevels.defence >= 70;
  }
  return true;
}

function policyStyleForRuntimeWeaponId(weaponId: NhWeaponId): NhOffenceStyle {
  if (weaponId === "kodai" || weaponId === "ancient_staff" || weaponId === "staff_of_the_dead") {
    return "magic";
  }
  if (
    weaponId === "armadyl_crossbow" ||
    weaponId === "rune_crossbow" ||
    weaponId === "magic_shortbow" ||
    weaponId === "dragon_crossbow"
  ) {
    return "ranged";
  }
  return "melee";
}

function runtimePolicyVisibleStyleFromEquipment(equipment: VisibleEquipment): NhOffenceStyle | null {
  const weaponStyle = runtimePolicyVisibleStyleFromWeapon(equipment.weapon);
  if (weaponStyle) {
    return weaponStyle;
  }
  return runtimePolicyVisibleAmmoStyleFromEquipment(equipment) ?? runtimePolicyVisibleStyleFromAttackBonuses(equipment);
}

function runtimePolicyVisibleGearStyleFromEquipment(
  equipment: VisibleEquipment,
  weaponStyle: NhOffenceStyle | null
): NhOffenceStyle | null {
  // Source: NhStakerBot.detectLikelyOffenceStyleFromGearLive() records only
  // weapon style or ammo as gearStyle; attack-bonus inference belongs to
  // detectLikelyOffenceStyleLive(), not the delayed gear-style channel.
  if (weaponStyle) {
    return weaponStyle;
  }
  return runtimePolicyVisibleAmmoStyleFromEquipment(equipment);
}

function runtimePolicyVisibleAmmoStyleFromEquipment(equipment: VisibleEquipment): NhOffenceStyle | null {
  return !equipment.weapon && equipment.ammo ? "ranged" : null;
}

function runtimePolicyReliableMagicSpellStyle(
  actor: RuntimePlayerCombatActorState,
  weaponStyle: NhOffenceStyle | null
): NhOffenceStyle | null {
  // Source: NhStakerBot.isReliableMagicSpellState() treats queued spells as
  // reliable magic evidence before weapon/prayer fallback; autocast only counts
  // when the current weapon is visibly a magic weapon.
  if (actor.queuedSpellId !== null || (actor.autocastSpellId !== null && weaponStyle === "magic")) {
    return "magic";
  }
  return null;
}

function runtimePolicyStyleFromAttackSet(
  actor: RuntimePlayerCombatActorState,
  equipment: VisibleEquipment,
  weaponStyle: NhOffenceStyle | null
): NhOffenceStyle | null {
  if (!equipment.weapon) {
    // Source: PlayerCombat.updateWeapon() falls back to WeaponType.UNARMED and
    // getAttackStyle() falls back to AttackStyle.CRUSH, which the bot maps to melee.
    return "melee";
  }
  const weaponType = equipment.weapon
    ? runtimePolicyServerItemById.get(equipment.weapon.itemId)?.weaponType ?? null
    : null;
  const row = weaponType ? runtimePolicyWeaponTypeById.get(weaponType) : undefined;
  const style = row?.attackSets?.[actor.attackSetIndex]?.style ?? null;
  // Source: NhStakerBot.styleFromAttackStyle() uses PlayerCombat.getAttackStyle()
  // after reliable spell state and before prayer/ammo/bonus fallbacks.
  if (style === "MAGIC") {
    return "magic";
  }
  if (style === "RANGED" || style === "MAGICAL_RANGED") {
    return "ranged";
  }
  if (style === "MAGICAL_MELEE") {
    return weaponStyle === "magic" ? "magic" : "melee";
  }
  if (style === "STAB" || style === "SLASH" || style === "CRUSH") {
    return "melee";
  }
  return null;
}

function runtimePolicyStyleFromOffensivePrayers(prayers: readonly PrayerId[]): NhOffenceStyle | null {
  // Source: NhStakerBot.styleFromOffensivePrayers() uses offensive prayer cues
  // only after spell/weapon/attack-style evidence fails.
  if (
    prayers.includes("augury") ||
    prayers.includes("mystic_might") ||
    prayers.includes("mystic_lore") ||
    prayers.includes("mystic_will")
  ) {
    return "magic";
  }
  if (
    prayers.includes("rigour") ||
    prayers.includes("eagle_eye") ||
    prayers.includes("hawk_eye") ||
    prayers.includes("sharp_eye")
  ) {
    return "ranged";
  }
  if (
    prayers.includes("piety") ||
    prayers.includes("chivalry") ||
    prayers.includes("ultimate_strength") ||
    prayers.includes("superhuman_strength") ||
    prayers.includes("burst_of_strength")
  ) {
    return "melee";
  }
  return null;
}

function runtimePolicyVisibleStyleFromWeapon(item: VisibleEquipmentItem | undefined): NhOffenceStyle | null {
  if (!item) {
    return null;
  }
  const row = runtimePolicyServerItemById.get(item.itemId);
  const name = (row?.name ?? item.name ?? "").toLowerCase();
  const weaponType = (row?.weaponType ?? "").toLowerCase();
  const nameSaysRanged =
    name.includes("bow") || name.includes("crossbow") || name.includes("blowpipe") || name.includes("ballista");
  const nameSaysMagic =
    name.includes("staff") || name.includes("wand") || name.includes("trident") || name.includes("sceptre");
  // Source: NhStakerBot.styleFromWeapon() checks guaranteed magic ids before
  // explicit ranged weapon metadata and weapon-name heuristics.
  if (runtimePolicyGuaranteedMagicWeaponIds.has(item.itemId)) {
    return "magic";
  }
  if (row?.rangedWeapon || nameSaysRanged || weaponType.includes("bow") || weaponType.includes("crossbow")) {
    return "ranged";
  }
  if (nameSaysMagic || weaponType.includes("staff") || weaponType.includes("wand")) {
    return "magic";
  }
  return runtimePolicyStyleFromWeaponAttackSets(row?.weaponType ? runtimePolicyWeaponTypeById.get(row.weaponType) : undefined);
}

function runtimePolicyStyleFromWeaponAttackSets(
  weaponType: RuntimePolicyWeaponTypeRow | undefined
): NhOffenceStyle | null {
  let hasMagic = false;
  let hasRanged = false;
  let hasMelee = false;
  for (const attackSet of weaponType?.attackSets ?? []) {
    const style = attackSet?.style;
    if (style === "MAGIC" || style === "MAGICAL_MELEE") {
      hasMagic = true;
    } else if (style === "RANGED" || style === "MAGICAL_RANGED") {
      hasRanged = true;
    } else if (style === "STAB" || style === "SLASH" || style === "CRUSH") {
      hasMelee = true;
    }
  }
  if (hasMagic) {
    return "magic";
  }
  if (hasRanged) {
    return "ranged";
  }
  return hasMelee ? "melee" : null;
}

function runtimePolicyVisibleStyleFromAttackBonuses(equipment: VisibleEquipment): NhOffenceStyle | null {
  return runtimePolicyStyleFromBonuses(aggregateVisibleEquipmentBonuses(equipment, equipmentRows));
}

function runtimePolicyStyleFromBonuses(bonuses: BonusTable): NhOffenceStyle | null {
  const magic = bonuses.magic_attack_bonus;
  const ranged = bonuses.range_attack_bonus;
  const melee = Math.max(bonuses.stab_attack_bonus, bonuses.slash_attack_bonus, bonuses.crush_attack_bonus);
  const best = Math.max(magic, ranged, melee);
  if (best <= 0) {
    return null;
  }
  if (magic >= ranged && magic >= melee) {
    return "magic";
  }
  if (ranged >= melee) {
    return "ranged";
  }
  return "melee";
}

function runtimePolicyWeaponIdForEquipment(equipment: VisibleEquipment): NhWeaponId | null {
  return nhGearProfileWeaponIdForEquipment(equipment);
}

function nhLoadoutIdForRuntime(loadoutId: RuntimeLoadoutId): NhLoadoutId {
  return loadoutId;
}

function runtimeTileToPolicyTile(tile: RuntimeTile, scale: number): TilePosition {
  return {
    x: Math.round(tile.x / scale),
    y: Math.round(tile.z / scale),
    plane: 0
  };
}

function runtimePolicyTileScale(left: RuntimeTile, right: RuntimeTile): number {
  const coordinates = [left.x, left.z, right.x, right.z];
  const hasSceneScaledCoordinate = coordinates.some((coordinate) => Math.abs(coordinate - Math.round(coordinate)) > 0.0001);
  const dx = Math.abs(left.x - right.x);
  const dz = Math.abs(left.z - right.z);
  if (hasSceneScaledCoordinate || (dx > 0 && dx < 1) || (dz > 0 && dz < 1)) {
    return 0.5;
  }
  return 1;
}

function normalizeRuntimePolicyTileScale(tileScale: number | undefined): number | undefined {
  if (tileScale === undefined || !Number.isFinite(tileScale) || tileScale <= 0) {
    return undefined;
  }
  return tileScale;
}
