import equipmentRowsJson from "../generated/equipment-bonuses.json";
import {
  createNhPolicyFeatureState,
  commitNhPolicyDecisionState,
  resetNhPolicyFeatureState,
  encodeNhPolicyFeatures,
  decodeNhPolicyAction,
  decodeNhDeployedLegacyPolicyAction,
  nhPolicyActionCount,
  nhDeployedLegacyPolicyActionCount,
  nhPolicyFeatureSize,
  nhPolicyInputFeatureStart,
  nhPolicyInputSize,
  nhPolicyV15InputSize,
  nhPolicyV16InputSize,
  nhPolicyV17InputSize,
  nhPolicyPreviousInputSize,
  nhPolicyCombatActionCount,
  isNhDirectGearActionId,
  nhPolicyV1ActionCount,
  nhDefencePrayers,
  nhSupplyIntents,
  nhExtraSupplyIntents,
  dmmCanonicalAttackActionIds as currentDmmCanonicalAttackActionIds,
  dmmCanonicalDefenceActionIds as currentDmmCanonicalDefenceActionIds,
  dmmCanonicalMovementActionIds as currentDmmCanonicalMovementActionIds,
  dmmCanonicalSpecActionIds as currentDmmCanonicalSpecActionIds,
  dmmCanonicalSupplyActionIds as currentDmmCanonicalSupplyActionIds,
  dmmCurrentActionVectorActionIds as currentDmmActionVectorActionIds,
  isNhExplicitSpecIntent,
  nhExplicitSpecWeaponKind,
  nhSpecIntentIsLegacyGeneric,
  nhSpecIntentIsDouble,
  canMeleeSpecialStepInReachNextTick,
  nhWeaponProfiles,
  nhDmmCoreGearActionsForCombat,
  nhDirectGearActionSlot,
  mergeNhDmmDirectGearActionsSlotAware,
  getAttackDelayStatus,
  type NhDirectGearAction,
  type NhDirectGearSlot,
  type NhPolicyFeatureState,
  type NhSpecIntent,
  type NhDuelController,
  type NhDuelControllerContext,
  type NhPolicyAction
} from "../sim";
import {
  applyNhConditionedPolicyV10Scores,
  commitNhConditionedPolicyInput,
  conditionedGearScore,
  createNhConditionedPolicyRuntimeState,
  parseNhConditionedPolicyV10,
  resetNhConditionedPolicyRuntimeState,
  type NhConditionedPolicyRuntimeState,
  type NhConditionedPolicyV10
} from "./conditioned-policy-v10";
import { aggregateVisibleEquipmentBonuses, type EquipmentBonusRow } from "../sim/equipment/equipment";
import { canonicalNhGear } from "../sim/nh/canonicalGear";
import { nhGearProfileAvailableSpecialWeaponKinds, nhGearProfileUsesIndependentGear } from "../sim/nh/gearProfile";

export interface NhPolicyCounters {
  readonly decisions: number;
  readonly samples: number;
  readonly exploration: number;
}

export interface NhPolicyActionVisit {
  readonly action: number;
  readonly visits: number;
}

export interface NhPolicyWeightEntry {
  readonly action: number;
  readonly featureIndex: number;
  readonly value: number;
}

export interface ParsedNhPolicy {
  readonly version: number;
  readonly counters: NhPolicyCounters;
  readonly actionVisits: readonly NhPolicyActionVisit[];
  readonly weightsByAction: ReadonlyMap<number, ReadonlyMap<number, number>>;
  readonly weightEntryCount: number;
  readonly sourceLabel: string;
}

export interface NhNeuralDenseLayer {
  readonly weight: readonly Float32Array[];
  readonly bias: Float32Array;
  readonly activation: "silu";
}

export interface ParsedNhNeuralPolicy {
  readonly kind: "neural";
  readonly version: number;
  readonly sourceLabel: string;
  readonly step: number;
  readonly inputSize: number;
  readonly featureSize: number;
  readonly actionCount: number;
  readonly actionIds?: Int32Array;
  readonly inputMean: Float32Array;
  readonly inputStd: Float32Array;
  readonly layers: readonly NhNeuralDenseLayer[];
  readonly policy: Omit<NhNeuralDenseLayer, "activation">;
  readonly directGearConditioning?: NhDirectGearConditioning;
  readonly conditionedV10?: NhConditionedPolicyV10;
  readonly metrics: Readonly<Record<string, number>>;
}

export type NhDirectGearConditioningStyle = "hold" | "magic" | "ranged" | "melee";

export interface NhDirectGearConditioning {
  readonly kind: "dmm-body-legs-combat-age-residual";
  readonly version: 1;
  readonly combatSource: "greedyCombat";
  readonly ageInputIndex: 110;
  readonly ageNormalizerTicks: 8;
  readonly styles: readonly NhDirectGearConditioningStyle[];
  readonly featureOrder: readonly string[];
  readonly actionIds: Int32Array;
  readonly weight: readonly Float32Array[];
  readonly actionRowById: ReadonlyMap<number, number>;
  readonly active: boolean;
}

export type NhRuntimePolicy = ParsedNhPolicy | ParsedNhNeuralPolicy;

export interface NhPolicyActionSummary {
  readonly action: number;
  readonly visits: number;
  readonly decoded: NhPolicyAction;
}

export interface NhPolicyScoredAction extends NhPolicyActionSummary {
  readonly score: number;
}

export interface NhPolicyPriorNormalizedInputTrace {
  readonly valid: boolean;
  readonly normalizedInput: readonly number[] | null;
}

export interface NhPolicyLegalActionTrace {
  readonly actionId: number;
  readonly modelRow: number;
}

export interface NhPolicyDecisionTrace {
  readonly tick: number;
  readonly rewardEpisodeId: number;
  readonly rawInput: readonly number[];
  readonly normalizedInput: readonly number[];
  readonly attackHistoryCodes: readonly [number, number, number];
  readonly ownPrayerHistoryCodes: readonly [number, number];
  readonly priorNormalizedInputsNewestFirst: readonly NhPolicyPriorNormalizedInputTrace[];
  readonly priorNormalizedInputHistoryLength: number;
  readonly legalActions: readonly NhPolicyLegalActionTrace[];
  /** Indexed by model row. Legal rows are final selection scores; illegal rows retain post-v10 pre-gear scores. */
  readonly finalScores: readonly number[];
  /** Representative attack/spec row for the resolved action-vector decision. */
  readonly selectedActionId: number;
  readonly selectedModelRow: number;
}

type NhPolicyDecisionObservationTrace = Omit<
  NhPolicyDecisionTrace,
  "selectedActionId" | "selectedModelRow"
>;

export type NhPolicyEqualScoreTieBreaker = () => boolean;

export interface NhPolicySummary {
  readonly version: number;
  readonly counters: NhPolicyCounters;
  readonly actionsWithVisits: number;
  readonly weightEntryCount: number;
  readonly topActions: readonly NhPolicyActionSummary[];
}

export interface NhPolicyRuntimeController extends NhDuelController {
  readonly getLastRankings: () => readonly NhPolicyScoredAction[];
  readonly setDecisionTraceEnabled: (enabled: boolean) => void;
  readonly getLastDecisionTrace: () => NhPolicyDecisionTrace | null;
}

const nhPolicyStoreVersion = 15;
const previousNhPolicyStoreVersion = 14;
const v13NhPolicyStoreVersion = 13;
const v13NhPolicyInputSize = 90;
const v13NhPolicyActionCount = 4950;
const v13NhPolicyBiasFeatureIndex = nhPolicyInputFeatureStart + v13NhPolicyInputSize;
const previousNhPolicyInputSize = nhPolicyPreviousInputSize;
const previousNhPolicyBiasFeatureIndex = nhPolicyInputFeatureStart + previousNhPolicyInputSize;
const dmmDeployedConstantInputStdMax = 0.0001001;
const v12NhPolicyStoreVersion = 12;
const v12NhPolicyInputSize = 86;
const v12NhPolicyBiasFeatureIndex = nhPolicyInputFeatureStart + v12NhPolicyInputSize;
const legacyNhPolicyStoreVersion = 11;
const legacyNhPolicyInputSize = 77;
const legacyNhPolicyBiasFeatureIndex = nhPolicyInputFeatureStart + legacyNhPolicyInputSize;
const explorationReheatDecisionsCap = 350_000;
const loadedPolicyWeightClamp = 6;
const loadRebalanceStripTwoScale = 0.7;
const loadRebalanceStripOneScale = 0.86;
const loadRebalanceSmiteScale = 0.92;
const loadRebalanceRedemptionScale = 0.62;
const loadRebalanceHealingSupplyScale = 0.82;
const loadRebalanceTripleEatScale = 0.72;
const loadRebalanceRestoreReboostScale = 1;
const loadRebalanceDoubleSpecScale = 0.7;
const regearStyleIdlePriorPenalty = 0.2;
const regearStyleDefenceGainPriorScale = 0.55;
const regearStyleDefenceGainPriorMax = 0.55;
const offenceStripActionsEnabled = false;
const opponentGearStyleInputIndex = 46;
const opponentMeleeReachInputIndex = 72;
const visibleStyleMatchRateInputIndex = 86;
const visibleStyleMismatchRateInputIndex = 87;
const visibleStyleConfidenceInputIndex = 88;
const visibleStyleLastOutcomeInputIndex = 89;
const defenceVisibleStyleTrustPriorScale = 2.6;
const defenceVisibleStyleMismatchPriorScale = 1.6;
const defenceVisibleStyleAlternativePenaltyScale = 0;
const defenceVisibleStyleLastMatchPriorScale = 0.45;
const equipmentRows = equipmentRowsJson as readonly EquipmentBonusRow[];
const actionVisitMapCache = new WeakMap<ParsedNhPolicy, ReadonlyMap<number, number>>();
const tabularPolicyCandidateCache = new WeakMap<ParsedNhPolicy, readonly number[]>();
const decodedActionCache: (NhPolicyAction | undefined)[] = [];
const dmmDirectGearVectorScoreFloor = 0;
const dmmSelfMagicRatioInputIndex = 65;
const dmmSelfMeleeReachInputIndex = 71;
const dmmCanEquipTwoHandedInputIndex = 109;
const dmmOpponentAttackAgeInputIndex = 110;
const dmmMinimumMagicCastRatio = 82 / 99;
const dmmDirectGearConditioningKind = "dmm-body-legs-combat-age-residual";
const dmmDirectGearConditioningStyles = ["hold", "magic", "ranged", "melee"] as const;
const dmmDirectGearConditioningFeatureOrder = [
  "hold",
  "magic",
  "ranged",
  "melee",
  "hold_x_age",
  "magic_x_age",
  "ranged_x_age",
  "melee_x_age"
] as const;
const dmmDirectGearConditioningActions = new Set<NhDirectGearAction>([
  "equip_dmm_virtus_robe_top",
  "equip_dmm_masori_body",
  "unequip_body",
  "equip_dmm_virtus_robe_bottom",
  "equip_dmm_torva_platelegs",
  "unequip_legs"
]);
const dmmDirectGearSlotOrder: readonly NhDirectGearSlot[] = [
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
const dmmDirectGearTargetItemIds: Readonly<Record<NhDirectGearAction, number | null>> = {
  equip_dmm_torva_full_helm: canonicalNhGear.torvaFullHelm.itemId,
  equip_imbued_saradomin_cape: canonicalNhGear.imbuedSaradominCape.itemId,
  equip_amulet_of_fury: canonicalNhGear.amuletOfFury.itemId,
  equip_dmm_zuriels_staff: canonicalNhGear.zurielsStaff.itemId,
  equip_dmm_virtus_robe_top: canonicalNhGear.virtusRobeTop.itemId,
  equip_dmm_elidinis_ward: canonicalNhGear.elidinisWardF.itemId,
  equip_dmm_virtus_robe_bottom: canonicalNhGear.virtusRobeBottom.itemId,
  equip_dmm_confliction_gauntlets: canonicalNhGear.conflictionGauntlets.itemId,
  equip_dmm_avernic_treads: canonicalNhGear.avernicTreadsMax.itemId,
  equip_seers_ring_i: canonicalNhGear.seersRingI.itemId,
  equip_dmm_onyx_dragon_bolts: canonicalNhGear.onyxDragonBoltsE.itemId,
  equip_dmm_masori_body: canonicalNhGear.masoriBodyF.itemId,
  equip_dmm_zaryte_crossbow: canonicalNhGear.zaryteCrossbow.itemId,
  equip_dmm_torva_platelegs: canonicalNhGear.torvaPlatelegs.itemId,
  equip_dragonfire_shield: canonicalNhGear.dragonfireShield.itemId,
  equip_dmm_noxious_halberd: canonicalNhGear.noxiousHalberd.itemId,
  equip_barrows_gloves: canonicalNhGear.barrowsGloves.itemId,
  equip_dmm_vestas_longsword: canonicalNhGear.vestaLongsword.itemId,
  equip_dmm_voidwaker: canonicalNhGear.voidwaker.itemId,
  equip_granite_maul: canonicalNhGear.graniteMaul.itemId,
  unequip_head: null,
  unequip_cape: null,
  unequip_amulet: null,
  unequip_body: null,
  unequip_shield: null,
  unequip_legs: null,
  unequip_hands: null,
  unequip_feet: null,
  unequip_ring: null
};
const dmmTwoHandedDirectGearActions = new Set<NhDirectGearAction>([
  "equip_dmm_noxious_halberd",
  "equip_granite_maul"
]);
const dmmCanonicalAttackActionIds = new Set<number>(currentDmmCanonicalAttackActionIds());
const dmmCanonicalSpecActionIds = new Set<number>(currentDmmCanonicalSpecActionIds());
const dmmCanonicalCombatActionIds = new Set<number>([
  ...dmmCanonicalAttackActionIds,
  ...dmmCanonicalSpecActionIds
]);
let baselineTabularCandidateActions: readonly number[] | null = null;

export function createNhPolicyController(policy: NhRuntimePolicy): NhPolicyRuntimeController {
  const featureState = createNhPolicyFeatureState();
  const conditionedState = createNhConditionedPolicyRuntimeState();
  let lastRankings: readonly NhPolicyScoredAction[] = [];
  let lastDecisionTrace: NhPolicyDecisionTrace | null = null;
  let decisionTraceEnabled = false;
  let activeEpisodeId: number | null = null;
  let lastContextTick: number | null = null;
  const neuralPolicy = isParsedNhNeuralPolicy(policy);
  const dmmDeployedCompositePolicy = neuralPolicy && isDmmDeployedCompositePolicy(policy);
  let currentDmmActionSurfaceVerified = false;
  const decodeMode = neuralPolicy
    ? dmmDeployedCompositePolicy
      ? "dmm-deployed-composite"
      : "current-action-vector"
    : "tabular";
  return {
    id: `${neuralPolicy ? "neural-policy" : "parsed-policy"}:${policy.sourceLabel}:${decodeMode}`,
    // Source: NhStakerBot.resolveDefencePrayer() applies the reachability and
    // visible-threat guards only for deployed-composite and legacy controllers;
    // current-direct neural decisions keep the model's defence prayer untouched.
    defencePrayerStrictModelChoice:
      neuralPolicy && !dmmDeployedCompositePolicy && policy.conditionedV10 !== undefined,
    chooseAction(context) {
      const rewardEpisodeActive = context.rewardEpisodeActive ?? true;
      const rewardEpisodeId = context.rewardEpisodeId ?? 0;
      if (context.rewardEpisodeId === undefined && lastContextTick !== null && context.tick < lastContextTick) {
        resetNhPolicyFeatureState(featureState);
        resetNhConditionedPolicyRuntimeState(conditionedState);
        activeEpisodeId = null;
      }
      if (!rewardEpisodeActive || rewardEpisodeId < 0) {
        resetNhPolicyFeatureState(featureState);
        resetNhConditionedPolicyRuntimeState(conditionedState);
        activeEpisodeId = null;
      } else if (activeEpisodeId !== rewardEpisodeId) {
        resetNhPolicyFeatureState(featureState);
        resetNhConditionedPolicyRuntimeState(conditionedState);
        activeEpisodeId = rewardEpisodeId;
      }
      const baseFeatures = encodeNhPolicyFeatures(context, featureState);
      const features = baseFeatures;
      const decisionTraceCapture: { current: NhPolicyDecisionObservationTrace | null } | null =
        decisionTraceEnabled && neuralPolicy && policy.conditionedV10 ? { current: null } : null;
      const dmmNeuralContext = isDmmNeuralContext(context);
      if (
        neuralPolicy &&
        dmmNeuralContext &&
        !dmmDeployedCompositePolicy &&
        !currentDmmActionSurfaceVerified
      ) {
        assertNhNeuralPolicyHasCurrentDmmActionSurface(policy);
        currentDmmActionSurfaceVerified = true;
      }
      const rawNeuralRankings = neuralPolicy
        ? dmmDeployedCompositePolicy && dmmNeuralContext
          ? rankNhDeployedLegacyNeuralPolicyActionsFromFeatures(
              policy,
              features,
              policy.actionCount,
              javaStyleEqualScoreTieBreaker
            )
          : rankNhNeuralPolicyActionsFromFeatures(
            policy,
            features,
            policy.actionCount,
            context,
            javaStyleEqualScoreTieBreaker,
            conditionedState,
            featureState,
            decisionTraceCapture
              ? (trace) => {
                  decisionTraceCapture.current = trace;
                }
              : undefined
          )
        : [];
      const conditioned =
        neuralPolicy && dmmNeuralContext && !dmmDeployedCompositePolicy
          ? conditionDmmDirectGearRankings(policy, rawNeuralRankings, features, context)
          : { rankings: rawNeuralRankings };
      const allNeuralRankings = conditioned.rankings;
      lastRankings = neuralPolicy
        ? allNeuralRankings.slice(0, 12)
        : rankNhPolicyActionsFromFeatures(policy, features, 5, context, javaStyleEqualScoreTieBreaker);
      lastContextTick = context.tick;
      const selected = lastRankings[0];
      if (!selected) {
        throw new Error(`NH policy controller ${policy.sourceLabel} produced no allowed action.`);
      }
      const decisionObservationTrace = decisionTraceCapture?.current ?? null;
      if (decisionObservationTrace && neuralPolicy) {
        const representativeRanking = conditioned.combatSelection
          ? conditioned.combatSelection.specRanking.decoded.specIntent === "none"
            ? conditioned.combatSelection.attackRanking
            : conditioned.combatSelection.specRanking
          : selected;
        const finalScores = Array.from(decisionObservationTrace.finalScores);
        for (const ranking of allNeuralRankings) {
          const modelRow = neuralModelActionForAction(policy, ranking.action);
          if (modelRow >= 0 && modelRow < finalScores.length) {
            // Legal gear rows receive their last conditioning pass after the
            // v10 score head, so publish the exact scores used by selection.
            finalScores[modelRow] = ranking.score;
          }
        }
        lastDecisionTrace = Object.freeze({
          ...decisionObservationTrace,
          finalScores: Object.freeze(finalScores),
          selectedActionId: representativeRanking.action,
          selectedModelRow: neuralModelActionForAction(policy, representativeRanking.action)
        });
      }
      if (!neuralPolicy || !dmmNeuralContext || dmmDeployedCompositePolicy) {
        commitNhPolicyDecisionState(featureState, context, selected.decoded);
        return selected.decoded;
      }
      const resolved = resolveDmmNeuralActionVector(
        allNeuralRankings,
        context,
        conditioned.combatSelection,
        policy.directGearConditioning?.active === true
      );
      commitNhPolicyDecisionState(featureState, context, resolved);
      return resolved;
    },
    getLastRankings() {
      return lastRankings;
    },
    setDecisionTraceEnabled(enabled) {
      decisionTraceEnabled = enabled;
      if (!enabled) {
        lastDecisionTrace = null;
      }
    },
    getLastDecisionTrace() {
      return lastDecisionTrace;
    }
  };
}

interface DmmGreedyCombatSelection {
  readonly attackRanking: NhPolicyScoredAction;
  readonly specRanking: NhPolicyScoredAction;
  readonly combatAction: NhPolicyAction;
}

interface DmmConditionedRankings {
  readonly rankings: readonly NhPolicyScoredAction[];
  readonly combatSelection?: DmmGreedyCombatSelection;
}

function conditionDmmDirectGearRankings(
  policy: ParsedNhNeuralPolicy,
  rankings: readonly NhPolicyScoredAction[],
  features: readonly number[],
  context: NhDuelControllerContext
): DmmConditionedRankings {
  const conditioning = policy.directGearConditioning;
  if (!conditioning?.active) {
    return { rankings };
  }
  const combatSelection = selectDmmGreedyCombat(rankings);
  if (!combatSelection) {
    throw new Error("Conditioned DMM neural policy is missing a mapped attack or spec channel action.");
  }
  const style = directGearConditioningStyle(combatSelection.combatAction);
  const styleIndex = conditioning.styles.indexOf(style);
  const attackAge = clamp01(inputFeature(features, conditioning.ageInputIndex));
  const conditioningInput = new Float32Array(8);
  conditioningInput[styleIndex] = 1;
  conditioningInput[4 + styleIndex] = attackAge;

  const rawInput = Array.from({ length: policy.inputSize }, (_, index) => inputFeature(features, index));
  const ordinaryCooldown = getAttackDelayStatus(context.opponent.attackTimer, context.tick).remainingTicks;
  let changed = false;
  const adjusted = rankings.map((ranking) => {
    const rowIndex = conditioning.actionRowById.get(ranking.action);
    let residual = 0;
    if (rowIndex !== undefined) {
      const row = conditioning.weight[rowIndex];
      for (let inputIndex = 0; inputIndex < conditioningInput.length; inputIndex += 1) {
        residual += row[inputIndex] * conditioningInput[inputIndex];
      }
    }
    let adjustedScore = ranking.score + residual;
    if (policy.conditionedV10) {
      const modelAction = neuralModelActionForAction(policy, ranking.action);
      adjustedScore = conditionedGearScore(
        policy.conditionedV10,
        modelAction,
        styleIndex,
        rawInput,
        ordinaryCooldown,
        adjustedScore
      );
    }
    if (adjustedScore === ranking.score) {
      return ranking;
    }
    changed = true;
    return { ...ranking, score: adjustedScore };
  });
  if (!changed) {
    return { rankings, combatSelection };
  }
  const reordered = adjusted
    .map((ranking, index) => ({ ranking, index }))
    .sort((left, right) => right.ranking.score - left.ranking.score || left.index - right.index)
    .map(({ ranking }) => ranking);
  return { rankings: reordered, combatSelection };
}

function directGearConditioningStyle(action: NhPolicyAction): NhDirectGearConditioningStyle {
  if (action.specIntent === "none" && (action.attackIntent ?? "hold") === "hold") {
    return "hold";
  }
  if (action.offenceStyle === "magic") {
    return "magic";
  }
  if (action.offenceStyle === "ranged") {
    return "ranged";
  }
  return "melee";
}

function selectDmmGreedyCombat(
  rankings: readonly NhPolicyScoredAction[]
): DmmGreedyCombatSelection | null {
  const rankingByAction = new Map<number, NhPolicyScoredAction>();
  for (const ranking of rankings) {
    rankingByAction.set(ranking.action, ranking);
  }
  const attackRanking = bestCanonicalRankingOrNull([...dmmCanonicalAttackActionIds], rankingByAction);
  const specRanking = bestCanonicalRankingOrNull([...dmmCanonicalSpecActionIds], rankingByAction);
  if (!attackRanking || !specRanking) {
    return null;
  }
  return {
    attackRanking,
    specRanking,
    combatAction: specRanking.decoded.specIntent === "none" ? attackRanking.decoded : specRanking.decoded
  };
}

function resolveDmmNeuralActionVector(
  rankings: readonly NhPolicyScoredAction[],
  context: NhDuelControllerContext,
  preselectedCombat?: DmmGreedyCombatSelection,
  conditionedBodyLegs = false
): NhPolicyAction {
  const rankingByAction = new Map<number, NhPolicyScoredAction>();
  for (const ranking of rankings) {
    rankingByAction.set(ranking.action, ranking);
  }
  const combatSelection = preselectedCombat ?? selectDmmGreedyCombat(rankings);
  const attackRanking = combatSelection?.attackRanking ?? null;
  const specRanking = combatSelection?.specRanking ?? null;

  const defenceRanking = bestCanonicalRankingOrNull(
    currentDmmCanonicalDefenceActionIds(),
    rankingByAction
  );
  const movementRanking = bestCanonicalRankingOrNull(
    currentDmmCanonicalMovementActionIds(),
    rankingByAction
  );
  const supplyRanking = bestCanonicalRankingOrNull(
    currentDmmCanonicalSupplyActionIds(),
    rankingByAction
  );

  if (!attackRanking || !specRanking || !defenceRanking || !movementRanking || !supplyRanking) {
    throw new Error(
      `DMM neural policy is missing mapped-vector channel label(s): attack=${attackRanking ? "ok" : "missing"}, spec=${specRanking ? "ok" : "missing"}, defence=${defenceRanking ? "ok" : "missing"}, movement=${movementRanking ? "ok" : "missing"}, supply=${supplyRanking ? "ok" : "missing"}.`
    );
  }

  const combatAction = combatSelection!.combatAction;
  const legacyCoreDirectGearActions = nhDmmCoreGearActionsForCombat(combatAction);
  const coreDirectGearActions = conditionedBodyLegs
    ? legacyCoreDirectGearActions.filter((action) => {
        const slot = nhDirectGearActionSlot(action);
        return slot !== "body" && slot !== "legs";
      })
    : legacyCoreDirectGearActions;
  const reservedDirectGearSlots = new Set<NhDirectGearSlot>(coreDirectGearActions.map(nhDirectGearActionSlot));
  if (coreDirectGearActions.some((action) => dmmTwoHandedDirectGearActions.has(action))) {
    reservedDirectGearSlots.add("shield");
  }
  const optionalDirectGearActions = collectDmmDirectGearActions(
    rankings,
    coreDirectGearActions,
    reservedDirectGearSlots,
    context
  );
  const directGearActions = mergeNhDmmDirectGearActionsSlotAware(coreDirectGearActions, optionalDirectGearActions);
  return {
    ...combatAction,
    defencePrayer: defenceRanking.decoded.defencePrayer,
    movementIntent: movementRanking.decoded.movementIntent,
    supplyIntent: supplyRanking.decoded.supplyIntent,
    directGearActions
  };
}

function collectDmmDirectGearActions(
  rankings: readonly NhPolicyScoredAction[],
  coreActions: readonly NhDirectGearAction[],
  reservedSlots: ReadonlySet<NhDirectGearSlot>,
  context: NhDuelControllerContext
): NhDirectGearAction[] {
  const selectedBySlot = new Map<
    NhDirectGearSlot,
    { action: NhDirectGearAction; actionId: number; score: number }
  >();
  for (const ranking of rankings) {
    if (!isNhDirectGearActionId(ranking.action) || ranking.score <= dmmDirectGearVectorScoreFloor) {
      continue;
    }
    const directGearAction = ranking.decoded.directGearActions?.[0];
    if (directGearAction === undefined) {
      continue;
    }
    const slot = nhDirectGearActionSlot(directGearAction);
    if (
      reservedSlots.has(slot) ||
      !dmmDirectGearActionIsExecutable(directGearAction, context)
    ) {
      continue;
    }
    const selected = selectedBySlot.get(slot);
    if (
      !selected ||
      ranking.score > selected.score ||
      (ranking.score === selected.score && ranking.action < selected.actionId)
    ) {
      selectedBySlot.set(slot, { action: directGearAction, actionId: ranking.action, score: ranking.score });
    }
  }
  const scoreOrdered = [...selectedBySlot.entries()]
    .sort(([leftSlot, left], [rightSlot, right]) => {
      // Source: NhStakerSelfPlayManager.selectVectorDirectGearModelActions()
      // executes the strongest optional swap first so a constrained inventory
      // keeps the same action ordering as Java.
      const scoreOrder = right.score - left.score;
      return scoreOrder !== 0
        ? scoreOrder
        : dmmDirectGearSlotOrder.indexOf(leftSlot) - dmmDirectGearSlotOrder.indexOf(rightSlot);
    })
    .map(([, selected]) => selected.action);
  return capacitySafeDmmOptionalDirectGearActions(coreActions, scoreOrdered, context);
}

function dmmDirectGearActionIsExecutable(
  action: NhDirectGearAction,
  context: NhDuelControllerContext
): boolean {
  const slot = nhDirectGearActionSlot(action);
  const currentlyStripped = context.self.strippedEquipmentSlots.includes(slot);
  const currentItem = currentlyStripped ? undefined : context.self.equipment[slot];
  const targetItemId = dmmDirectGearTargetItemIds[action];
  const freeInventorySlots = context.self.inventorySlots.filter((inventorySlot) => inventorySlot === null).length;
  if (targetItemId === null) {
    return currentItem !== undefined && freeInventorySlots > 0;
  }
  if (
    currentItem?.itemId === targetItemId ||
    !context.self.inventorySlots.some((inventorySlot) => inventorySlot?.itemId === targetItemId)
  ) {
    return false;
  }
  if (dmmTwoHandedDirectGearActions.has(action) && context.self.equipment.shield !== undefined) {
    return false;
  }
  const equippedWeaponId = context.self.equipment.weapon?.itemId;
  if (
    slot === "shield" &&
    equippedWeaponId !== undefined &&
    [...dmmTwoHandedDirectGearActions].some(
      (twoHandedAction) => dmmDirectGearTargetItemIds[twoHandedAction] === equippedWeaponId
    )
  ) {
    return false;
  }
  return true;
}

function capacitySafeDmmOptionalDirectGearActions(
  coreActions: readonly NhDirectGearAction[],
  scoreOrderedOptionalActions: readonly NhDirectGearAction[],
  context: NhDuelControllerContext
): NhDirectGearAction[] {
  let freeInventorySlots = context.self.inventorySlots.filter((slot) => slot === null).length;
  for (const action of coreActions) {
    freeInventorySlots += dmmDirectGearFreeSlotDelta(action, context);
  }

  let retainedTwoHandedWeaponEquip = false;
  let retainedShieldEquip = false;
  const compatibleActions = scoreOrderedOptionalActions.filter((action) => {
    const slot = nhDirectGearActionSlot(action);
    const unequip = dmmDirectGearTargetItemIds[action] === null;
    const twoHandedWeaponEquip = slot === "weapon" && !unequip && dmmTwoHandedDirectGearActions.has(action);
    const shieldEquip = slot === "shield" && !unequip;
    if ((twoHandedWeaponEquip && retainedShieldEquip) || (shieldEquip && retainedTwoHandedWeaponEquip)) {
      return false;
    }
    retainedTwoHandedWeaponEquip ||= twoHandedWeaponEquip;
    retainedShieldEquip ||= shieldEquip;
    return true;
  });

  const executionOrder = [
    ...compatibleActions.filter((action) => dmmDirectGearTargetItemIds[action] !== null),
    ...compatibleActions.filter((action) => dmmDirectGearTargetItemIds[action] === null)
  ];
  const retained: NhDirectGearAction[] = [];
  for (const action of executionOrder) {
    const nextFreeInventorySlots = freeInventorySlots + dmmDirectGearFreeSlotDelta(action, context);
    if (nextFreeInventorySlots < 0) {
      continue;
    }
    freeInventorySlots = nextFreeInventorySlots;
    retained.push(action);
  }
  return retained;
}

function dmmDirectGearFreeSlotDelta(
  action: NhDirectGearAction,
  context: NhDuelControllerContext
): number {
  const slot = nhDirectGearActionSlot(action);
  const currentlyStripped = context.self.strippedEquipmentSlots.includes(slot);
  const currentItem = currentlyStripped ? undefined : context.self.equipment[slot];
  const targetItemId = dmmDirectGearTargetItemIds[action];
  if (targetItemId === null) {
    return currentItem === undefined ? 0 : -1;
  }
  if (currentItem?.itemId === targetItemId) {
    return 0;
  }
  let delta = currentItem === undefined ? 1 : 0;
  if (
    slot === "weapon" &&
    dmmTwoHandedDirectGearActions.has(action) &&
    !context.self.strippedEquipmentSlots.includes("shield") &&
    context.self.equipment.shield !== undefined
  ) {
    delta -= 1;
  }
  return delta;
}

function bestCanonicalRankingOrNull(
  actionIds: readonly number[],
  rankingByAction: ReadonlyMap<number, NhPolicyScoredAction>
): NhPolicyScoredAction | null {
  let best: NhPolicyScoredAction | null = null;
  for (const actionId of actionIds) {
    const ranking = rankingByAction.get(actionId);
    if (!ranking) {
      continue;
    }
    if (!best || ranking.score > best.score || (ranking.score === best.score && javaStyleEqualScoreTieBreaker())) {
      best = ranking;
    }
  }
  return best;
}

function isParsedNhNeuralPolicy(policy: NhRuntimePolicy): policy is ParsedNhNeuralPolicy {
  return (policy as ParsedNhNeuralPolicy).kind === "neural";
}

export function parseNhPolicyTsv(text: string, sourceLabel = "policy.tsv"): ParsedNhPolicy {
  let version = 0;
  let counters: NhPolicyCounters = { decisions: 0, samples: 0, exploration: 0 };
  const actionVisits = new Map<number, number>();
  const mutableWeights = new Map<number, Map<number, number>>();
  let weightEntryCount = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const parts = line.split("\t");
    if (parts[0] === "version" && parts.length >= 2) {
      version = parseInteger(parts[1], 0);
      continue;
    }

    if (parts[0] === "counters" && parts.length >= 4) {
      counters = {
        decisions: parseInteger(parts[1], 0),
        samples: parseInteger(parts[2], 0),
        exploration: parseInteger(parts[3], 0)
      };
      continue;
    }

    if (parts[0] === "act" && parts.length >= 3) {
      const action = parseInteger(parts[1], -1);
      if (isValidAction(action)) {
        actionVisits.set(action, Math.max(0, parseInteger(parts[2], 0)));
      }
      continue;
    }

    if (parts[0] === "ow" && parts.length >= 4) {
      const action = parseInteger(parts[1], -1);
      const featureIndex = parseInteger(parts[2], -1);
      const value = Number(parts[3]);
      const mappedFeatureIndex = mapLoadedPolicyFeatureIndex(version, featureIndex);
      if (!isValidAction(action) || mappedFeatureIndex < 0 || mappedFeatureIndex >= nhPolicyFeatureSize || !Number.isFinite(value)) {
        continue;
      }
      const weights = mutableWeights.get(action) ?? new Map<number, number>();
      if (!mutableWeights.has(action)) {
        mutableWeights.set(action, weights);
      }
      weights.set(mappedFeatureIndex, value);
      weightEntryCount += 1;
    }
  }

  if (!isLoadablePolicyStoreVersion(version)) {
    // Source: NhStakerSelfPlayManager.loadFromDisk() accepts the live store
    // version and the directly migratable v11 shape, but skips other versions.
    throw new Error(`NH policy version ${version} does not match expected version ${nhPolicyStoreVersion}.`);
  }

  rebalanceLoadedNhPolicyActionBiases(mutableWeights, actionVisits);
  const normalizedCounters = normalizeLoadedNhPolicyCounters(counters, actionVisits);

  return {
    version,
    counters: normalizedCounters,
    actionVisits: [...actionVisits.entries()].map(([action, visits]) => ({ action, visits })),
    weightsByAction: mutableWeights,
    weightEntryCount,
    sourceLabel
  };
}

export function parseNhNeuralPolicyJson(text: string, sourceLabel = "neural-policy.json"): ParsedNhNeuralPolicy {
  const root = readObject(JSON.parse(text), sourceLabel);
  const conditionedArtifact = root.kind === "nh-neural-policy-conditioned";
  if (root.kind !== "nh-neural-policy" && !conditionedArtifact) {
    throw new Error(`${sourceLabel} is not an NH neural policy model.`);
  }
  const version = parseRequiredInteger(root.version, `${sourceLabel}.version`);
  if (conditionedArtifact && version !== 2 && version !== 10) {
    throw new Error(`${sourceLabel} conditioned NH neural policy version must be 2 or 10.`);
  }
  const schema = readObject(root.schema, `${sourceLabel}.schema`);
  const inputSize = parseRequiredInteger(schema.inputSize, `${sourceLabel}.schema.inputSize`);
  const featureSize = parseRequiredInteger(schema.featureSize, `${sourceLabel}.schema.featureSize`);
  const actionCount = parseRequiredInteger(schema.actionCount, `${sourceLabel}.schema.actionCount`);
  const actionIds = readOptionalActionIds(schema.actionIds, actionCount, `${sourceLabel}.schema.actionIds`);
  const expectedFeatureSize = neuralPolicyFeatureSizeForInputSize(inputSize, conditionedArtifact);
  if (expectedFeatureSize === null) {
    throw new Error(
      `${sourceLabel} input size ${inputSize} does not match expected ${nhPolicyInputSize}, previous ${nhPolicyPreviousInputSize}, or v13 ${v13NhPolicyInputSize}.`
    );
  }
  if (featureSize !== expectedFeatureSize) {
    throw new Error(`${sourceLabel} feature size ${featureSize} does not match expected ${expectedFeatureSize}.`);
  }
  const v13ImplicitActionCount = inputSize === v13NhPolicyInputSize && actionCount === v13NhPolicyActionCount;
  if (
    actionIds === undefined &&
    !v13ImplicitActionCount &&
    actionCount !== nhPolicyActionCount &&
    actionCount !== nhPolicyCombatActionCount &&
    actionCount !== nhPolicyV1ActionCount
  ) {
    throw new Error(
      `${sourceLabel} action count ${actionCount} does not match expected ${nhPolicyActionCount}, combat-only ${nhPolicyCombatActionCount}, v13 ${v13NhPolicyActionCount}, or legacy ${nhPolicyV1ActionCount}.`
    );
  }

  const source = readObject(root.source, `${sourceLabel}.source`);
  const normalization = readObject(root.normalization, `${sourceLabel}.normalization`);
  const model = readObject(root.model, `${sourceLabel}.model`);
  const rawLayers = readArray(model.layers, `${sourceLabel}.model.layers`);
  let previousWidth = inputSize;
  const layers = rawLayers.map((rawLayer, layerIndex) => {
    const layer = readObject(rawLayer, `${sourceLabel}.model.layers[${layerIndex}]`);
    if (layer.activation !== "silu") {
      throw new Error(`${sourceLabel}.model.layers[${layerIndex}].activation must be silu.`);
    }
    const bias = readNumberVector(layer.bias, null, `${sourceLabel}.model.layers[${layerIndex}].bias`);
    const weight = readNumberMatrix(
      layer.weight,
      bias.length,
      previousWidth,
      `${sourceLabel}.model.layers[${layerIndex}].weight`
    );
    previousWidth = bias.length;
    return { weight, bias, activation: "silu" as const };
  });
  if (layers.length === 0) {
    throw new Error(`${sourceLabel} must include at least one encoder layer.`);
  }
  const rawPolicy = readObject(model.policy, `${sourceLabel}.model.policy`);
  const policyBias = readNumberVector(rawPolicy.bias, actionCount, `${sourceLabel}.model.policy.bias`);
  const policyWeight = readNumberMatrix(
    rawPolicy.weight,
    actionCount,
    previousWidth,
    `${sourceLabel}.model.policy.weight`
  );
  const directGearConditioning = conditionedArtifact
    ? readNhDirectGearConditioning(
        root.directGearConditioning,
        actionIds,
        inputSize,
        `${sourceLabel}.directGearConditioning`
      )
    : undefined;
  const conditionedV10 = conditionedArtifact && version === 10
    ? parseNhConditionedPolicyV10(root, actionIds ?? new Int32Array(), inputSize, previousWidth, sourceLabel)
    : undefined;

  return {
    kind: "neural",
    version,
    sourceLabel,
    step: parseOptionalInteger(source.step, 0),
    inputSize,
    featureSize,
    actionCount,
    actionIds,
    inputMean: readNumberVector(normalization.mean, inputSize, `${sourceLabel}.normalization.mean`),
    inputStd: readNumberVector(normalization.std, inputSize, `${sourceLabel}.normalization.std`),
    layers,
    policy: {
      weight: policyWeight,
      bias: policyBias
    },
    directGearConditioning,
    conditionedV10,
    metrics: readNumberRecord(source.metrics)
  };
}

function readNhDirectGearConditioning(
  value: unknown,
  policyActionIds: Int32Array | undefined,
  inputSize: number,
  label: string
): NhDirectGearConditioning {
  const conditioning = readObject(value, label);
  if (conditioning.kind !== dmmDirectGearConditioningKind) {
    throw new Error(`${label}.kind must be ${dmmDirectGearConditioningKind}.`);
  }
  const version = parseRequiredInteger(conditioning.version, `${label}.version`);
  if (version !== 1) {
    throw new Error(`${label}.version must be 1.`);
  }
  if (conditioning.combatSource !== "greedyCombat") {
    throw new Error(`${label}.combatSource must be greedyCombat.`);
  }
  const ageInputIndex = parseRequiredInteger(
    conditioning.ageInputIndex,
    `${label}.ageInputIndex`
  );
  if (ageInputIndex !== dmmOpponentAttackAgeInputIndex || ageInputIndex >= inputSize) {
    throw new Error(
      `${label}.ageInputIndex must be current raw state input ${dmmOpponentAttackAgeInputIndex}.`
    );
  }
  const ageNormalizerTicks = parseRequiredInteger(
    conditioning.ageNormalizerTicks,
    `${label}.ageNormalizerTicks`
  );
  if (ageNormalizerTicks !== 8) {
    throw new Error(`${label}.ageNormalizerTicks must be 8.`);
  }
  const rawStyles = readArray(conditioning.styles, `${label}.styles`);
  if (
    rawStyles.length !== dmmDirectGearConditioningStyles.length ||
    rawStyles.some((style, index) => style !== dmmDirectGearConditioningStyles[index])
  ) {
    throw new Error(`${label}.styles must be hold,magic,ranged,melee.`);
  }
  const rawFeatureOrder = readArray(conditioning.featureOrder, `${label}.featureOrder`);
  if (
    rawFeatureOrder.length !== dmmDirectGearConditioningFeatureOrder.length ||
    rawFeatureOrder.some((feature, index) => feature !== dmmDirectGearConditioningFeatureOrder[index])
  ) {
    throw new Error(`${label}.featureOrder must match the current combat-style and raw-age interaction order.`);
  }
  if (
    policyActionIds === undefined ||
    !sameActionIds(policyActionIds, currentDmmActionVectorActionIds())
  ) {
    throw new Error(`${label} requires the exact current DMM schema.actionIds mapping.`);
  }
  const actionIds = readOptionalActionIds(conditioning.actionIds, 6, `${label}.actionIds`);
  if (actionIds === undefined) {
    throw new Error(`${label}.actionIds is required.`);
  }
  const actionRowById = new Map<number, number>();
  const seenActions = new Set<NhDirectGearAction>();
  const mappedPolicyActions = new Set(policyActionIds);
  for (let rowIndex = 0; rowIndex < actionIds.length; rowIndex += 1) {
    const actionId = actionIds[rowIndex];
    if (!mappedPolicyActions.has(actionId) || actionRowById.has(actionId)) {
      throw new Error(`${label}.actionIds[${rowIndex}] must be a unique mapped policy action.`);
    }
    const decoded = decodeNhPolicyAction(actionId);
    const directGearAction = decoded.directGearActions?.[0];
    if (
      directGearAction === undefined ||
      !dmmDirectGearConditioningActions.has(directGearAction) ||
      (decoded.directGearActions?.length ?? 0) !== 1
    ) {
      throw new Error(`${label}.actionIds[${rowIndex}] is not one of the six body/legs conditioning actions.`);
    }
    actionRowById.set(actionId, rowIndex);
    seenActions.add(directGearAction);
  }
  if (seenActions.size !== dmmDirectGearConditioningActions.size) {
    throw new Error(`${label}.actionIds must map each body/legs conditioning action exactly once.`);
  }
  const weight = readNumberMatrix(conditioning.weight, 6, 8, `${label}.weight`);
  const active = weight.some((row) => row.some((entry) => entry !== 0));
  return {
    kind: dmmDirectGearConditioningKind,
    version: 1,
    combatSource: "greedyCombat",
    ageInputIndex: dmmOpponentAttackAgeInputIndex,
    ageNormalizerTicks: 8,
    styles: dmmDirectGearConditioningStyles,
    featureOrder: dmmDirectGearConditioningFeatureOrder,
    actionIds,
    weight,
    actionRowById,
    active
  };
}

function neuralPolicyFeatureSizeForInputSize(inputSize: number, conditionedArtifact = false): number | null {
  const supported = conditionedArtifact
    ? [nhPolicyInputSize, nhPolicyV17InputSize, nhPolicyV16InputSize]
    : [nhPolicyInputSize, nhPolicyV17InputSize, nhPolicyV16InputSize, nhPolicyV15InputSize, nhPolicyPreviousInputSize, v13NhPolicyInputSize];
  return supported.includes(inputSize) ? nhPolicyInputFeatureStart + inputSize + 1 : null;
}

export function assertNhNeuralPolicyHasExplicitSpecActions(
  policy: ParsedNhNeuralPolicy,
  requiredSpecIntents: readonly NhSpecIntent[],
  label = policy.sourceLabel
): void {
  if (requiredSpecIntents.length === 0) {
    return;
  }
  const availableSpecIntents = new Set<string>();
  if (policy.actionIds !== undefined) {
    for (const action of policy.actionIds) {
      if (isValidAction(action)) {
        availableSpecIntents.add(decodeNhPolicyAction(action).specIntent);
      }
    }
  } else {
    for (let action = 0; action < policy.actionCount && action < nhPolicyActionCount; action += 1) {
      availableSpecIntents.add(decodeNhPolicyAction(action).specIntent);
    }
  }
  const missing = requiredSpecIntents.filter((specIntent) => !availableSpecIntents.has(specIntent));
  if (missing.length > 0) {
    throw new Error(`${label} is missing required explicit neural spec action(s): ${missing.join(", ")}.`);
  }
}

export function assertNhNeuralPolicyHasDirectGearActions(
  policy: ParsedNhNeuralPolicy,
  label = policy.sourceLabel
): void {
  if (!neuralPolicyHasDirectGearActions(policy)) {
    throw new Error(`${label} is missing required DMM direct-gear action IDs; refusing legacy compact DMM model.`);
  }
}

export function assertNhNeuralPolicyHasCurrentDmmActionSurface(
  policy: ParsedNhNeuralPolicy,
  label = policy.sourceLabel
): void {
  const expectedInputSize = nhPolicyInputSize;
  if (policy.inputSize !== expectedInputSize) {
    throw new Error(`${label} input size ${policy.inputSize} does not match current DMM input size ${expectedInputSize}.`);
  }
  if (policy.actionIds === undefined) {
    throw new Error(`${label} must include schema.actionIds; refusing implicit legacy DMM action mapping.`);
  }
  const expectedActionIds = currentDmmActionVectorActionIds();
  if (!sameActionIds(policy.actionIds, expectedActionIds)) {
    throw new Error(
      `${label} DMM action schema does not match current broad-HOLD direct-action surface; refusing stale per-style-HOLD model.`
    );
  }

  const mappedActions = new Set(policy.actionIds);
  const missingGroups = [
    missingCurrentDmmMappedActions("combat", dmmCanonicalCombatActionIds, mappedActions),
    missingCurrentDmmMappedActions("defence", dmmCanonicalDefenceActionIds(), mappedActions),
    missingCurrentDmmMappedActions("movement", dmmCanonicalMovementActionIds(), mappedActions),
    missingCurrentDmmMappedActions("supply", dmmRequiredCurrentSupplyActionIds(), mappedActions)
  ].filter((entry): entry is string => entry !== null);

  if (!neuralPolicyHasDirectGearActions(policy)) {
    missingGroups.push("directGear=none");
  }
  if (missingGroups.length > 0) {
    throw new Error(`${label} does not expose the current DMM same-tick action surface: ${missingGroups.join("; ")}.`);
  }
}

function sameActionIds(actual: ArrayLike<number>, expected: readonly number[]): boolean {
  if (actual.length !== expected.length) {
    return false;
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) {
      return false;
    }
  }
  return true;
}

function missingCurrentDmmMappedActions(
  label: string,
  expectedActions: Iterable<number>,
  mappedActions: ReadonlySet<number>
): string | null {
  const missing: number[] = [];
  let expectedCount = 0;
  for (const action of expectedActions) {
    expectedCount += 1;
    if (!mappedActions.has(action)) {
      missing.push(action);
    }
  }
  if (missing.length === 0) {
    return null;
  }
  return `${label}=${expectedCount - missing.length}/${expectedCount} missing ${missing.slice(0, 8).join(",")}`;
}

function dmmCanonicalDefenceActionIds(): readonly number[] {
  return currentDmmCanonicalDefenceActionIds();
}

function dmmCanonicalMovementActionIds(): readonly number[] {
  return currentDmmCanonicalMovementActionIds();
}

function dmmRequiredCurrentSupplyActionIds(): readonly number[] {
  const supplyActions = currentDmmCanonicalSupplyActionIds();
  return [
    ...supplyActions.slice(0, nhSupplyIntents.length),
    ...supplyActions.slice(nhSupplyIntents.length + nhExtraSupplyIntents.length)
  ];
}

function isLoadablePolicyStoreVersion(version: number): boolean {
  return (
    version === nhPolicyStoreVersion ||
    version === previousNhPolicyStoreVersion ||
    version === v13NhPolicyStoreVersion ||
    version === v12NhPolicyStoreVersion ||
    version === legacyNhPolicyStoreVersion
  );
}

function mapLoadedPolicyFeatureIndex(version: number, featureIndex: number): number {
  if (version === nhPolicyStoreVersion) {
    return featureIndex;
  }
  if (version === previousNhPolicyStoreVersion) {
    if (featureIndex < 0 || featureIndex > previousNhPolicyBiasFeatureIndex) {
      return -1;
    }
    return featureIndex === previousNhPolicyBiasFeatureIndex ? nhPolicyFeatureSize - 1 : featureIndex;
  }
  if (version === v13NhPolicyStoreVersion) {
    if (featureIndex < 0 || featureIndex > v13NhPolicyBiasFeatureIndex) {
      return -1;
    }
    return featureIndex === v13NhPolicyBiasFeatureIndex ? nhPolicyFeatureSize - 1 : featureIndex;
  }
  if (version === v12NhPolicyStoreVersion) {
    if (featureIndex < 0 || featureIndex > v12NhPolicyBiasFeatureIndex) {
      return -1;
    }
    return featureIndex === v12NhPolicyBiasFeatureIndex ? nhPolicyFeatureSize - 1 : featureIndex;
  }
  if (version !== legacyNhPolicyStoreVersion || featureIndex < 0 || featureIndex > legacyNhPolicyBiasFeatureIndex) {
    return -1;
  }
  return featureIndex === legacyNhPolicyBiasFeatureIndex ? nhPolicyFeatureSize - 1 : featureIndex;
}

function normalizeLoadedNhPolicyCounters(
  counters: NhPolicyCounters,
  visitsByAction: Map<number, number>
): NhPolicyCounters {
  // Source: NhStakerSelfPlayManager.loadFromDisk() reheats old policies by
  // capping active decisions and scaling action visits/exploration with the same ratio.
  const loadedDecisions = Math.max(0, counters.decisions);
  const activeDecisions = Math.min(loadedDecisions, explorationReheatDecisionsCap);
  const reheatScale = loadedDecisions <= 0 ? 1 : Math.min(1, activeDecisions / loadedDecisions);
  if (reheatScale < 0.999999) {
    for (const [action, visits] of visitsByAction.entries()) {
      visitsByAction.set(action, Math.max(0, Math.round(visits * reheatScale)));
    }
  }
  return {
    decisions: activeDecisions,
    samples: Math.max(0, counters.samples),
    exploration: Math.max(0, Math.round(Math.max(0, counters.exploration) * reheatScale))
  };
}

function rebalanceLoadedNhPolicyActionBiases(
  weightsByAction: Map<number, Map<number, number>>,
  visitsByAction: Map<number, number>
): void {
  // Source: NhStakerSelfPlayManager.rebalanceLoadedActionBiases() mutates the
  // loaded live policy before inference, so TS must not rank raw TSV weights.
  for (let action = 0; action < nhPolicyActionCount; action += 1) {
    const scale = loadedPolicyActionScale(action);
    if (scale >= 0.9999) {
      continue;
    }

    const weights = weightsByAction.get(action);
    if (weights) {
      for (const [featureIndex, value] of weights.entries()) {
        weights.set(featureIndex, clampDouble(value * scale, -loadedPolicyWeightClamp, loadedPolicyWeightClamp));
      }
    }

    const visits = visitsByAction.get(action);
    if (visits !== undefined) {
      visitsByAction.set(action, Math.max(0, Math.round(visits * scale * scale)));
    }
  }
}

function loadedPolicyActionScale(action: number): number {
  const decoded = cachedDecodeNhPolicyAction(action);
  let scale = 1;
  if (decoded.supplyIntent === "offence_strip_two") {
    scale *= loadRebalanceStripTwoScale;
  } else if (decoded.supplyIntent === "offence_strip_one") {
    scale *= loadRebalanceStripOneScale;
  }
  if (
    decoded.supplyIntent === "safe_eat" ||
    decoded.supplyIntent === "double_eat" ||
    decoded.supplyIntent === "brew_only" ||
    decoded.supplyIntent === "panic_full"
  ) {
    scale *= loadRebalanceHealingSupplyScale;
  }
  if (decoded.defencePrayer === "smite") {
    scale *= loadRebalanceSmiteScale;
  } else if (decoded.defencePrayer === "redemption") {
    scale *= loadRebalanceRedemptionScale;
  }
  if (decoded.supplyIntent === "triple_eat") {
    scale *= loadRebalanceTripleEatScale;
  }
  if (decoded.supplyIntent === "restore_reboost") {
    scale *= loadRebalanceRestoreReboostScale;
  }
  if (nhSpecIntentIsDouble(decoded.specIntent)) {
    scale *= loadRebalanceDoubleSpecScale;
  }
  return scale;
}

export function summarizeNhPolicy(policy: ParsedNhPolicy, limit = 8): NhPolicySummary {
  const sortedActions = [...policy.actionVisits]
    .filter((visit) => visit.visits > 0)
    .sort((left, right) => right.visits - left.visits)
    .slice(0, Math.max(1, Math.trunc(limit)));

  return {
    version: policy.version,
    counters: policy.counters,
    actionsWithVisits: policy.actionVisits.filter((visit) => visit.visits > 0).length,
    weightEntryCount: policy.weightEntryCount,
    topActions: sortedActions.map((visit) => ({
      ...visit,
      decoded: decodeNhPolicyAction(visit.action)
    }))
  };
}

export function chooseNhPolicyActionFromFeatures(
  policy: ParsedNhPolicy,
  features: readonly number[]
): NhPolicyScoredAction | null {
  return rankNhPolicyActionsFromFeatures(policy, features, 1)[0] ?? null;
}

export function rankNhPolicyActionsFromFeatures(
  policy: ParsedNhPolicy,
  features: readonly number[],
  limit = 6,
  context?: NhDuelControllerContext,
  equalScoreTieBreaker?: NhPolicyEqualScoreTieBreaker
): readonly NhPolicyScoredAction[] {
  if (features.length !== nhPolicyFeatureSize) {
    throw new Error(`NH policy feature vector must have ${nhPolicyFeatureSize} entries, got ${features.length}.`);
  }
  const actionVisits = actionVisitMap(policy);
  const rankings: NhPolicyScoredAction[] = [];
  for (const action of tabularPolicyCandidateActions(policy)) {
    const decoded = cachedDecodeNhPolicyAction(action);
    if (!isNhPolicyActionAllowed(features, decoded)) {
      continue;
    }
    let score = 0;
    const weights = policy.weightsByAction.get(action);
    if (weights) {
      for (const [featureIndex, value] of weights.entries()) {
        score += value * features[featureIndex];
      }
    }
    score += actionPrior(features, decoded, context);
    rankings.push({
      action,
      score,
      visits: actionVisits.get(action) ?? 0,
      decoded
    });
  }

  const resolvedRankings =
    rankings.length > 0
      ? rankings
      : isDmmNeuralContext(context)
      ? []
      : [
          {
            action: 0,
            score: policyScore(policy, 0, features),
            visits: actionVisits.get(0) ?? 0,
            decoded: decodeNhPolicyAction(0)
          }
        ];

  if (equalScoreTieBreaker) {
    return rankWithJavaEqualScoreTieBreak(resolvedRankings, limit, equalScoreTieBreaker);
  }

  return resolvedRankings
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.trunc(limit)));
}

export function rankNhPolicyCandidateActionsFromFeatures(
  policy: ParsedNhPolicy,
  features: readonly number[],
  candidateActions: readonly number[],
  limit = 6,
  context?: NhDuelControllerContext,
  equalScoreTieBreaker?: NhPolicyEqualScoreTieBreaker
): readonly NhPolicyScoredAction[] {
  if (features.length !== nhPolicyFeatureSize) {
    throw new Error(`NH policy feature vector must have ${nhPolicyFeatureSize} entries, got ${features.length}.`);
  }
  const actionVisits = actionVisitMap(policy);
  const rankings: NhPolicyScoredAction[] = [];
  const seen = new Set<number>();
  for (const candidateAction of candidateActions) {
    const action = Math.trunc(candidateAction);
    if (!isValidAction(action) || seen.has(action)) {
      continue;
    }
    seen.add(action);
    const decoded = cachedDecodeNhPolicyAction(action);
    if (!isNhPolicyActionAllowed(features, decoded)) {
      continue;
    }
    const score = policyScore(policy, action, features) + actionPrior(features, decoded, context);
    rankings.push({
      action,
      score,
      visits: actionVisits.get(action) ?? 0,
      decoded
    });
  }

  const resolvedRankings =
    rankings.length > 0
      ? rankings
      : isDmmNeuralContext(context)
      ? []
      : [
          {
            action: 0,
            score: policyScore(policy, 0, features),
            visits: actionVisits.get(0) ?? 0,
            decoded: decodeNhPolicyAction(0)
          }
        ];

  if (equalScoreTieBreaker) {
    return rankWithJavaEqualScoreTieBreak(resolvedRankings, limit, equalScoreTieBreaker);
  }

  return resolvedRankings
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.trunc(limit)));
}

export function rankNhNeuralPolicyActionsFromFeatures(
  policy: ParsedNhNeuralPolicy,
  features: readonly number[],
  limit = 6,
  contextOrEqualScoreTieBreaker?: NhDuelControllerContext | NhPolicyEqualScoreTieBreaker,
  equalScoreTieBreaker?: NhPolicyEqualScoreTieBreaker,
  conditionedRuntimeState?: NhConditionedPolicyRuntimeState,
  featureState?: NhPolicyFeatureState,
  decisionTraceObserver?: (trace: NhPolicyDecisionObservationTrace) => void
): readonly NhPolicyScoredAction[] {
  const expectedFeatureSize = nhPolicyFeatureSize;
  if (features.length !== expectedFeatureSize) {
    throw new Error(`NH neural policy feature vector must have ${expectedFeatureSize} entries, got ${features.length}.`);
  }
  const context =
    typeof contextOrEqualScoreTieBreaker === "function" ? undefined : contextOrEqualScoreTieBreaker;
  const tieBreaker =
    typeof contextOrEqualScoreTieBreaker === "function" ? contextOrEqualScoreTieBreaker : equalScoreTieBreaker;
  const normalizedInput = normalizeNhNeuralInput(policy, features);
  const encoded = runNhNeuralEncoder(policy, normalizedInput);
  const rankings: NhPolicyScoredAction[] = [];
  const actionCount = policy.actionIds === undefined ? Math.min(nhPolicyActionCount, policy.actionCount) : policy.actionCount;
  const dmmDirectGearModel = isDmmNeuralContext(context) && neuralPolicyHasDirectGearActions(policy);
  const legalModelActions = new Set<number>();
  const decodedByModelAction = new Map<number, NhPolicyAction>();
  for (let modelAction = 0; modelAction < actionCount; modelAction += 1) {
    const action = policy.actionIds?.[modelAction] ?? modelAction;
    const decoded = cachedDecodeNhPolicyAction(action);
    if (!isNhPolicyActionAllowed(features, decoded, context, { dmmDirectGearModel })) {
      continue;
    }
    legalModelActions.add(modelAction);
    decodedByModelAction.set(modelAction, decoded);
  }
  let scores = Array.from({ length: actionCount }, (_, modelAction) => neuralPolicyActionScore(policy, modelAction, encoded));
  if (policy.conditionedV10) {
    if (!context || !conditionedRuntimeState || !featureState) {
      throw new Error(`${policy.sourceLabel} requires stateful conditioned-v10 inference.`);
    }
    scores = applyNhConditionedPolicyV10Scores({
      conditioned: policy.conditionedV10,
      baseScores: scores,
      normalizedInput,
      encoded,
      inputMean: policy.inputMean,
      inputStd: policy.inputStd,
      attackHistoryCodes: featureState.defencePrayerAttackHistoryCodes,
      ownPrayerHistoryCodes: featureState.defencePrayerOwnHistoryCodes,
      priorNormalizedInputs: conditionedRuntimeState.priorNormalizedInputs,
      legalModelActions
    });
    if (decisionTraceObserver) {
      decisionTraceObserver(captureNhPolicyDecisionObservationTrace(
        policy,
        features,
        normalizedInput,
        featureState,
        conditionedRuntimeState,
        legalModelActions,
        scores,
        policy.conditionedV10.defencePrayer.priorStateHistoryLags,
        context.tick,
        context.rewardEpisodeId ?? 0
      ));
    }
    commitNhConditionedPolicyInput(
      conditionedRuntimeState,
      normalizedInput,
      context.tick,
      policy.conditionedV10.defencePrayer.priorStateHistoryLags
    );
  }
  for (const modelAction of legalModelActions) {
    const action = policy.actionIds?.[modelAction] ?? modelAction;
    const decoded = decodedByModelAction.get(modelAction);
    if (!decoded) {
      continue;
    }
    rankings.push({
      action,
      score: scores[modelAction],
      visits: 0,
      decoded
    });
  }

  if (rankings.length === 0 && dmmDirectGearModel) {
    throw new Error("DMM neural policy produced no legal current action-vector rankings; refusing scalar fallback");
  }

  const resolvedRankings =
    rankings.length > 0
      ? rankings
      : [
          {
            action: policy.actionIds?.[0] ?? 0,
            score: neuralPolicyActionScore(policy, 0, encoded),
            visits: 0,
            decoded: decodeNhPolicyAction(policy.actionIds?.[0] ?? 0)
          }
        ];

  if (tieBreaker) {
    return rankWithJavaEqualScoreTieBreak(resolvedRankings, limit, tieBreaker);
  }

  return resolvedRankings
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.trunc(limit)));
}

function captureNhPolicyDecisionObservationTrace(
  policy: ParsedNhNeuralPolicy,
  features: readonly number[],
  normalizedInput: Float32Array,
  featureState: NhPolicyFeatureState,
  conditionedRuntimeState: NhConditionedPolicyRuntimeState,
  legalModelActions: ReadonlySet<number>,
  scores: readonly number[],
  priorHistoryLags: number,
  tick: number,
  rewardEpisodeId: number
): NhPolicyDecisionObservationTrace {
  const priorHistoryLength = Math.min(
    priorHistoryLags,
    conditionedRuntimeState.priorNormalizedInputs.length
  );
  const priorNormalizedInputsNewestFirst = Object.freeze(
    Array.from({ length: priorHistoryLags }, (_, index): NhPolicyPriorNormalizedInputTrace => {
      const prior = conditionedRuntimeState.priorNormalizedInputs[index];
      return Object.freeze({
        valid: prior !== undefined,
        normalizedInput: prior === undefined ? null : frozenNumberCopy(prior)
      });
    })
  );
  const legalActions = Object.freeze(
    Array.from(legalModelActions, (modelRow): NhPolicyLegalActionTrace => Object.freeze({
      actionId: policy.actionIds?.[modelRow] ?? modelRow,
      modelRow
    }))
  );
  return Object.freeze({
    tick,
    rewardEpisodeId,
    rawInput: Object.freeze(Array.from(
      { length: policy.inputSize },
      (_, index) => features[nhPolicyInputFeatureStart + index]
    )),
    normalizedInput: frozenNumberCopy(normalizedInput),
    attackHistoryCodes: Object.freeze([
      featureState.defencePrayerAttackHistoryCodes[0] ?? 0,
      featureState.defencePrayerAttackHistoryCodes[1] ?? 0,
      featureState.defencePrayerAttackHistoryCodes[2] ?? 0
    ] as [number, number, number]),
    ownPrayerHistoryCodes: Object.freeze([
      featureState.defencePrayerOwnHistoryCodes[0] ?? 0,
      featureState.defencePrayerOwnHistoryCodes[1] ?? 0
    ] as [number, number]),
    priorNormalizedInputsNewestFirst,
    priorNormalizedInputHistoryLength: priorHistoryLength,
    legalActions,
    finalScores: frozenNumberCopy(scores)
  });
}

function frozenNumberCopy(values: ArrayLike<number>): readonly number[] {
  return Object.freeze(Array.from(values));
}

function rankNhDeployedLegacyNeuralPolicyActionsFromFeatures(
  policy: ParsedNhNeuralPolicy,
  features: readonly number[],
  limit = 6,
  equalScoreTieBreaker?: NhPolicyEqualScoreTieBreaker
): readonly NhPolicyScoredAction[] {
  if (features.length !== nhPolicyFeatureSize) {
    throw new Error(`NH policy feature vector must have ${nhPolicyFeatureSize} entries, got ${features.length}.`);
  }
  const encoded = runNhNeuralEncoder(policy, normalizeNhNeuralInput(policy, features, { dmmDeployedComposite: true }));
  const rankings: NhPolicyScoredAction[] = [];
  const actionCount = policy.actionIds === undefined ? policy.actionCount : policy.actionIds.length;
  for (let modelAction = 0; modelAction < actionCount; modelAction += 1) {
    const action = policy.actionIds?.[modelAction] ?? modelAction;
    const decoded = decodeNhDeployedLegacyPolicyAction(action);
    if (!isNhDeployedLegacyPolicyActionAllowed(features, decoded)) {
      continue;
    }
    rankings.push({
      action,
      score: neuralPolicyActionScore(policy, modelAction, encoded),
      visits: 0,
      decoded
    });
  }

  if (rankings.length === 0) {
    throw new Error("DMM deployed-composite policy produced no legal deployed-legacy rankings; refusing action fallback.");
  }

  if (equalScoreTieBreaker) {
    return rankWithJavaEqualScoreTieBreak(rankings, limit, equalScoreTieBreaker);
  }

  return rankings
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.trunc(limit)));
}

const neuralActionIdIndexCache = new WeakMap<Int32Array, Map<number, number>>();

function neuralModelActionForAction(policy: ParsedNhNeuralPolicy, action: number): number {
  if (policy.actionIds === undefined) {
    return action >= 0 && action < policy.actionCount ? action : -1;
  }
  let index = neuralActionIdIndexCache.get(policy.actionIds);
  if (!index) {
    index = new Map<number, number>();
    for (let modelAction = 0; modelAction < policy.actionIds.length; modelAction += 1) {
      index.set(policy.actionIds[modelAction] ?? 0, modelAction);
    }
    neuralActionIdIndexCache.set(policy.actionIds, index);
  }
  return index.get(action) ?? -1;
}

export function rankNhNeuralPolicyCandidateActionsFromFeatures(
  policy: ParsedNhNeuralPolicy,
  features: readonly number[],
  candidateActions: readonly number[],
  limit = 6,
  contextOrEqualScoreTieBreaker?: NhDuelControllerContext | NhPolicyEqualScoreTieBreaker,
  equalScoreTieBreaker?: NhPolicyEqualScoreTieBreaker
): readonly NhPolicyScoredAction[] {
  if (policy.conditionedV10) {
    throw new Error(`${policy.sourceLabel} conditioned-v10 policy requires the stateful full-action ranker.`);
  }
  const expectedFeatureSize = nhPolicyFeatureSize;
  if (features.length !== expectedFeatureSize) {
    throw new Error(`NH neural policy feature vector must have ${expectedFeatureSize} entries, got ${features.length}.`);
  }
  const context =
    typeof contextOrEqualScoreTieBreaker === "function" ? undefined : contextOrEqualScoreTieBreaker;
  const tieBreaker =
    typeof contextOrEqualScoreTieBreaker === "function" ? contextOrEqualScoreTieBreaker : equalScoreTieBreaker;
  const encoded = runNhNeuralEncoder(policy, normalizeNhNeuralInput(policy, features));
  const rankings: NhPolicyScoredAction[] = [];
  const seen = new Set<number>();
  const dmmDirectGearModel = isDmmNeuralContext(context) && neuralPolicyHasDirectGearActions(policy);
  for (const candidateAction of candidateActions) {
    const action = Math.trunc(candidateAction);
    if (!isValidAction(action) || seen.has(action)) {
      continue;
    }
    seen.add(action);
    const modelAction = neuralModelActionForAction(policy, action);
    if (modelAction < 0) {
      continue;
    }
    const decoded = cachedDecodeNhPolicyAction(action);
    if (!isNhPolicyActionAllowed(features, decoded, context, { dmmDirectGearModel })) {
      continue;
    }
    rankings.push({
      action,
      score: neuralPolicyActionScore(policy, modelAction, encoded),
      visits: 0,
      decoded
    });
  }

  if (rankings.length === 0 && dmmDirectGearModel) {
    throw new Error("DMM neural candidate policy produced no legal current action-vector rankings; refusing scalar fallback");
  }

  const resolvedRankings =
    rankings.length > 0
      ? rankings
      : [
          {
            action: policy.actionIds?.[0] ?? 0,
            score: neuralPolicyActionScore(policy, 0, encoded),
            visits: 0,
            decoded: decodeNhPolicyAction(policy.actionIds?.[0] ?? 0)
          }
        ];

  if (tieBreaker) {
    return rankWithJavaEqualScoreTieBreak(resolvedRankings, limit, tieBreaker);
  }

  return resolvedRankings
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.trunc(limit)));
}

function rankWithJavaEqualScoreTieBreak(
  rankings: readonly NhPolicyScoredAction[],
  limit: number,
  equalScoreTieBreaker: NhPolicyEqualScoreTieBreaker
): readonly NhPolicyScoredAction[] {
  const remaining = [...rankings];
  const selected: NhPolicyScoredAction[] = [];
  const cappedLimit = Math.max(1, Math.trunc(limit));
  while (remaining.length > 0 && selected.length < cappedLimit) {
    let bestIndex = 0;
    for (let index = 1; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const best = remaining[bestIndex];
      // Source: NhStakerSelfPlayManager.chooseAction() uses Random.rollDie(2) when
      // final live inference scores are exactly equal.
      if (candidate.score > best.score || (candidate.score === best.score && equalScoreTieBreaker())) {
        bestIndex = index;
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }
  return selected;
}

function javaStyleEqualScoreTieBreaker(): boolean {
  return Math.random() < 0.5;
}

function isDmmNeuralContext(context: NhDuelControllerContext | undefined): boolean {
  return context?.self.gearProfile !== undefined && nhGearProfileUsesIndependentGear(context.self.gearProfile);
}

function neuralPolicyHasDirectGearActions(policy: ParsedNhNeuralPolicy): boolean {
  if (policy.actionIds === undefined) {
    return policy.actionCount >= nhPolicyActionCount;
  }
  return policy.actionIds.some((action) => isNhDirectGearActionId(action));
}

function isDmmDeployedCompositePolicy(policy: ParsedNhNeuralPolicy): boolean {
  if (policy.inputSize !== nhPolicyPreviousInputSize || policy.actionIds === undefined) {
    return false;
  }
  if (policy.actionIds.length === 0) {
    return false;
  }
  return policy.actionIds.every((action) => action >= 0 && action < nhDeployedLegacyPolicyActionCount);
}

function actionVisitMap(policy: ParsedNhPolicy): ReadonlyMap<number, number> {
  const cached = actionVisitMapCache.get(policy);
  if (cached) {
    return cached;
  }
  const visits = new Map<number, number>();
  for (const entry of policy.actionVisits) {
    visits.set(entry.action, entry.visits);
  }
  actionVisitMapCache.set(policy, visits);
  return visits;
}

function tabularPolicyCandidateActions(policy: ParsedNhPolicy): readonly number[] {
  const cached = tabularPolicyCandidateCache.get(policy);
  if (cached) {
    return cached;
  }

  const candidates = new Set<number>(baselineTabularActions());
  for (const action of policy.weightsByAction.keys()) {
    if (isValidAction(action)) {
      candidates.add(action);
    }
  }
  for (const entry of policy.actionVisits) {
    if (entry.visits > 0 && isValidAction(entry.action)) {
      candidates.add(entry.action);
    }
  }

  const sorted = [...candidates].sort((left, right) => left - right);
  tabularPolicyCandidateCache.set(policy, sorted);
  return sorted;
}

function baselineTabularActions(): readonly number[] {
  if (baselineTabularCandidateActions) {
    return baselineTabularCandidateActions;
  }
  baselineTabularCandidateActions = Array.from({ length: nhPolicyV1ActionCount }, (_unused, action) => action);
  return baselineTabularCandidateActions;
}

function cachedDecodeNhPolicyAction(action: number): NhPolicyAction {
  const normalized = Math.max(0, Math.min(nhPolicyActionCount - 1, Math.trunc(action)));
  const cached = decodedActionCache[normalized];
  if (cached) {
    return cached;
  }
  const decoded = decodeNhPolicyAction(normalized);
  decodedActionCache[normalized] = decoded;
  return decoded;
}

function actionPrior(
  features: readonly number[],
  action: NhPolicyAction,
  context?: NhDuelControllerContext
): number {
  return specOpportunityPrior(features, action) +
    offenceGearWeaknessPrior(features, action, context) +
    defencePrayerReliabilityPrior(features, action) +
    supplyIntentPrior(features, action, context) +
    movementControlPrior(features, action, context);
}

function defencePrayerReliabilityPrior(features: readonly number[], action: NhPolicyAction): number {
  if (inputFeature(features, 33) <= 0.5) {
    return 0;
  }
  const protectedStyle = protectedStyleForPrayer(action.defencePrayer);
  const visibleStyle = readEncodedStyle(features, opponentGearStyleInputIndex);
  if (!protectedStyle || !visibleStyle) {
    return 0;
  }
  if (visibleStyle === "melee" && inputFeature(features, opponentMeleeReachInputIndex) <= 0.5) {
    return 0;
  }

  const matchRate = clamp01(inputFeature(features, visibleStyleMatchRateInputIndex));
  const mismatchRate = clamp01(inputFeature(features, visibleStyleMismatchRateInputIndex));
  const confidence = clamp01(inputFeature(features, visibleStyleConfidenceInputIndex));
  if (confidence <= 0) {
    return 0;
  }
  const reliability = confidence * (matchRate - mismatchRate);
  if (protectedStyle === visibleStyle) {
    if (reliability >= 0) {
      const lastMatch = Math.max(0, clampSigned(inputFeature(features, visibleStyleLastOutcomeInputIndex)));
      return (defenceVisibleStyleTrustPriorScale * reliability) +
        (defenceVisibleStyleLastMatchPriorScale * confidence * lastMatch);
    }
    return defenceVisibleStyleMismatchPriorScale * reliability;
  }
  return reliability > 0 ? -defenceVisibleStyleAlternativePenaltyScale * reliability : 0;
}

function specOpportunityPrior(features: readonly number[], action: NhPolicyAction): number {
  if (action.specIntent === "none" || action.supplyIntent !== "none") {
    return 0;
  }
  const singleWindow = Math.max(inputFeature(features, 73), inputFeature(features, 75));
  const doubleWindow = Math.max(inputFeature(features, 74), inputFeature(features, 76));
  const window = nhSpecIntentIsDouble(action.specIntent) ? doubleWindow : singleWindow;
  if (window < 0.34) {
    return 0;
  }
  const specScale = nhSpecIntentIsDouble(action.specIntent) ? 1.1 : 0.92;
  return 44 * (window - 0.34) * specScale;
}

function offenceGearWeaknessPrior(
  features: readonly number[],
  action: NhPolicyAction,
  context?: NhDuelControllerContext
): number {
  if (inputFeature(features, 33) <= 0.5) {
    return 0;
  }

  const weakness = action.specIntent === "none"
    ? opponentWeaknessForStyle(context, action.offenceStyle)
    : Math.max(opponentWeaknessForStyle(context, action.offenceStyle), opponentGmaulWeakness(context));
  const exposedWeakness = Math.max(0, weakness);
  const protectedStyle = isProtectedByOpponentPrayer(features, action.offenceStyle);
  const selectedEv = visibleStyleEv(features, context, action.offenceStyle);
  const bestOtherEv = bestOtherVisibleStyleEv(features, context, action.offenceStyle);
  const evEdge = selectedEv - bestOtherEv;
  let score = 8.4 * weakness;

  if (protectedStyle) {
    score -= 5.5 * (0.35 + exposedWeakness);
  } else {
    score += 1.25 * exposedWeakness;
  }
  score += 5.2 * evEdge;

  const distance = clamp01(inputFeature(features, 0)) * 12;
  const selfFrozen = inputFeature(features, 12) > 0.5;
  const selfAttackReady = inputFeature(features, 9) > 0.5;
  const meleeReachNow = context?.meleeReachable ?? inputFeature(features, 71) > 0.5;

  if (action.offenceStyle === "melee") {
    if (distance >= 0.75 && distance <= 1.25 && meleeReachNow) {
      const reachableExposure = exposedWeakness + (!protectedStyle && weakness >= -0.05 ? 0.65 : 0);
      score += 60 * reachableExposure;
    } else if (distance > 1.25 && distance <= 2.25 && !selfFrozen && meleeReachNow) {
      const stepExposure = exposedWeakness + (!protectedStyle && weakness >= -0.08 ? 0.52 : 0);
      score += (selfAttackReady ? 50 : 2.6) * stepExposure;
    } else {
      score -= 1.55 * (distance > 4 ? 1 : 0.55);
    }

    if (meleeReachNow && !protectedStyle && evEdge > 0) {
      score += 4.6 * (0.2 + evEdge);
    }
  } else {
    const meleeEv = visibleStyleEv(features, context, "melee");
    const cleanMeleeWindow =
      distance >= 0.75 &&
      distance <= 2.25 &&
      meleeReachNow &&
      !selfFrozen &&
      selfAttackReady &&
      inputFeature(features, 54) <= 0.5;
    const meleeEdge = meleeEv - selectedEv;
    const meleeWeakness = opponentWeaknessForStyle(context, "melee");
    if (cleanMeleeWindow && meleeWeakness >= weakness - 0.18 && meleeEdge > 0) {
      score -= 24.5 * (distance > 1.25 ? 0.76 : 1) * (0.25 + Math.max(0, meleeWeakness) + meleeEdge);
    }
  }

  if (isHealingSupplyIntent(action.supplyIntent)) {
    score *= 0.45;
  }
  return score;
}

function supplyIntentPrior(
  features: readonly number[],
  action: NhPolicyAction,
  context?: NhDuelControllerContext
): number {
  const lastTaken = Math.max(0, inputFeature(features, 24));
  const selfHp = clamp01(inputFeature(features, 1));
  const canAttack = inputFeature(features, 8) > 0.5;
  const selfAttackReady = inputFeature(features, 9) > 0.5;
  const hasFood = inputFeature(features, 4) > 0.5 / 28;
  const hasTwoFood = inputFeature(features, 4) > 1.5 / 28;
  const hasBrew = inputFeature(features, 5) > 0.5 / 8;
  const hasRestore = inputFeature(features, 6) > 0.5 / 8;
  const hasReboost = inputFeature(features, 7) > 0.5 / 8;
  const hasAnySupply = hasFood || hasBrew || hasRestore || hasReboost;
  if (!hasAnySupply) {
    return 0;
  }

  const distance = Math.max(0, Math.round(clamp01(inputFeature(features, 0)) * 12));
  const hpRisk = clamp01((74 / 99 - selfHp) / (36 / 99));
  const hitRisk = clamp01(lastTaken * 1.45);
  const visibleKoRisk = visibleSupplyKoRisk(features, action, selfHp, distance);
  const risk = Math.max(clamp01(hpRisk + hitRisk * 0.3), visibleKoRisk);
  const panicRisk = Math.max(
    clamp01((44 / 99 - selfHp) / (19 / 99) + hitRisk * 0.25),
    clamp01((visibleKoRisk - 0.34) / 0.54)
  );

  if (action.supplyIntent === "none") {
    return -skipDangerSupplyPenalty(selfHp, risk, panicRisk);
  }
  if (action.supplyIntent === "regear_style") {
    const defenceGainCredit = Math.min(
      regearStyleDefenceGainPriorMax,
      Math.max(0, regearDefenceGainForLikelyThreat(features)) * regearStyleDefenceGainPriorScale
    );
    if (lastTaken > 0.05 || selfHp < 56 / 99) {
      return -skipDangerSupplyPenalty(selfHp, risk, panicRisk) * 0.65 + defenceGainCredit * 0.35;
    }
    return defenceGainCredit - regearStyleIdlePriorPenalty;
  }
  if (action.supplyIntent === "restore_reboost") {
    const selfPrayer = inputFeature(features, 3);
    const attackDeficit = inputFeature(features, 66);
    const strengthDeficit = inputFeature(features, 67);
    const defenceDeficit = inputFeature(features, 68);
    const rangedDeficit = inputFeature(features, 69);
    const magicDeficit = inputFeature(features, 70);
    const restoreNeed =
      selfPrayer < 55 / 99 ||
      attackDeficit < -0.025 ||
      strengthDeficit < -0.025 ||
      defenceDeficit < -0.025 ||
      rangedDeficit < -0.025 ||
      magicDeficit < -0.025;
    const reboostNeed = needsCombatReboost(attackDeficit, strengthDeficit, defenceDeficit, rangedDeficit);
    if ((hasRestore && restoreNeed) || (hasReboost && reboostNeed)) {
      const needSeverity = Math.max(
        clamp01((55 / 99 - selfPrayer) / (24 / 99)),
        clamp01(Math.max(-attackDeficit, -strengthDeficit, -defenceDeficit, -rangedDeficit, -magicDeficit) / 0.18),
        reboostNeed ? 0.65 : 0
      );
      return 4.35 + 4.2 * needSeverity;
    }
    return -2.4;
  }
  if (!isHealingSupplyIntent(action.supplyIntent)) {
    return 0;
  }
  if (risk <= 0) {
    return -lowRiskSupplyPenalty(action.supplyIntent, selfHp, risk, panicRisk);
  }

  if (action.supplyIntent === "safe_eat") {
    return hasFood && selfHp < 68 / 99
      ? 10.8 * risk * (selfHp < 49 / 99 ? 0.55 : 0.58)
      : -lowRiskSupplyPenalty(action.supplyIntent, selfHp, risk, panicRisk);
  }
  if (action.supplyIntent === "double_eat") {
    return hasFood && selfHp < 58 / 99
      ? 10.8 * risk * 0.88
      : -lowRiskSupplyPenalty(action.supplyIntent, selfHp, risk, panicRisk);
  }
  if (action.supplyIntent === "triple_eat") {
    return (hasBrew || hasTwoFood) && (selfHp < 48 / 99 || panicRisk > 0.4)
      ? 10.8 * Math.max(risk, panicRisk) * 1.02
      : -lowRiskSupplyPenalty(action.supplyIntent, selfHp, risk, panicRisk);
  }
  if (action.supplyIntent === "brew_only") {
    const currentEv = visibleStyleEv(features, context, action.offenceStyle);
    const postBrewEv = visibleStyleEv(features, context, action.offenceStyle, 1);
    const bestPostBrewEv = bestVisibleStyleEv(features, context, 1);
    const landedDamagePressure = lastTaken > 0.04;
    const brewTempoWindow =
      hasBrew &&
      (canAttack || selfAttackReady) &&
      selfHp < 72 / 99 &&
      (risk > 0.24 || landedDamagePressure || visibleKoRisk > 0.42) &&
      isBrewOnlyEvWindow(currentEv, postBrewEv, bestPostBrewEv);
    return hasBrew && (selfHp < 50 / 99 || (selfHp < 56 / 99 && risk > 0.28) || brewTempoWindow)
      ? 10.8 * Math.max(risk, brewTempoWindow ? 0.18 : risk) * (brewTempoWindow ? 0.42 : 0.66)
      : -lowRiskSupplyPenalty(action.supplyIntent, selfHp, risk, panicRisk);
  }
  if (action.supplyIntent === "panic_full") {
    return hasAnySupply && (selfHp < 42 / 99 || panicRisk > 0.55)
      ? 10.8 * Math.max(risk, panicRisk) * 1.18
      : -lowRiskSupplyPenalty(action.supplyIntent, selfHp, risk, panicRisk);
  }
  return 0;
}

function regearDefenceGainForLikelyThreat(features: readonly number[]): number {
  const likely = readEncodedStyle(features, 43) ?? readEncodedStyle(features, 46);
  if (likely === "magic") {
    return clampSigned(inputFeature(features, 80));
  }
  if (likely === "ranged") {
    return clampSigned(inputFeature(features, 81));
  }
  if (likely === "melee") {
    return clampSigned(inputFeature(features, 82));
  }
  return Math.max(
    clampSigned(inputFeature(features, 80)),
    clampSigned(inputFeature(features, 81)),
    clampSigned(inputFeature(features, 82))
  );
}

function movementControlPrior(
  features: readonly number[],
  action: NhPolicyAction,
  context?: NhDuelControllerContext
): number {
  if (
    inputFeature(features, 33) <= 0.5 ||
    inputFeature(features, 12) > 0.5 ||
    inputFeature(features, 13) <= 0.5
  ) {
    return 0;
  }

  const distance = Math.max(0, Math.round(clamp01(inputFeature(features, 0)) * 12));
  const controlValue = underControlValue(features, action, distance);
  const attackReady = inputFeature(features, 9) > 0.5;
  const supportSupply = isHealingSupplyIntent(action.supplyIntent) ||
    action.supplyIntent === "restore_reboost" ||
    action.supplyIntent === "regear_style";

  if (action.movementIntent === "stand_under") {
    if (distance === 1) {
      return 5.6 * controlValue * (supportSupply ? 1.22 : 1);
    }
    if (distance > 1 && distance <= 4 && controlValue > 0.24) {
      const routeScale = attackReady ? 0.48 : 1;
      return 3.35 * controlValue * routeScale * (supportSupply ? 1.12 : 1);
    }
    if (distance === 0 && attackReady && controlValue < 0.22) {
      return -0.9;
    }
  }

  return 0;
}

function underControlValue(features: readonly number[], action: NhPolicyAction, distance: number): number {
  const selfHp = clamp01(inputFeature(features, 1));
  const selfPrayer = clamp01(inputFeature(features, 3));
  const lastTaken = Math.max(0, inputFeature(features, 24));
  const risk = visibleSupplyKoRisk(features, action, selfHp, distance);
  const hpRecovery = clamp01((82 / 99 - selfHp) / (40 / 99));
  const prayerRecovery = clamp01((55 / 99 - selfPrayer) / (45 / 99));
  const statRecovery = clamp01(
    (Math.max(0, -inputFeature(features, 66)) +
      Math.max(0, -inputFeature(features, 67)) +
      Math.max(0, -inputFeature(features, 69)) +
      Math.max(0, -inputFeature(features, 70))) *
      5.2
  );
  const recentPressure = clamp01(lastTaken * 1.35);
  const specSetup = Math.max(
    Math.max(inputFeature(features, 75), inputFeature(features, 76)),
    Math.max(inputFeature(features, 73), inputFeature(features, 74)) * 0.7
  );
  const cooldownValue = inputFeature(features, 9) > 0.5 ? 0 : 0.22;
  const distanceValue = distance === 0 ? 0.2 : distance === 1 ? 0.12 : 0;
  return clamp01(
    risk * 0.36 +
      hpRecovery * 0.26 +
      prayerRecovery * 0.14 +
      statRecovery * 0.12 +
      recentPressure * 0.16 +
      specSetup * 0.18 +
      cooldownValue +
      distanceValue
  );
}

function visibleSupplyKoRisk(
  features: readonly number[],
  action: NhPolicyAction,
  selfHp: number,
  distance: number
): number {
  if (inputFeature(features, 33) <= 0.5) {
    return 0;
  }
  const likely = readEncodedStyle(features, 43) ?? readEncodedStyle(features, 46);
  if (likely) {
    return softVisibleKoRisk(selfHp, visibleThreatDamage(features, action, likely, distance));
  }
  const worst = Math.max(
    visibleThreatDamage(features, action, "magic", distance),
    visibleThreatDamage(features, action, "ranged", distance),
    visibleThreatDamage(features, action, "melee", distance)
  );
  return softVisibleKoRisk(selfHp, worst);
}

function visibleThreatDamage(
  features: readonly number[],
  action: NhPolicyAction,
  style: NhPolicyAction["offenceStyle"],
  distance: number
): number {
  let base = style === "magic" ? 31 / 99 : style === "ranged" ? 41 / 99 : inputFeature(features, 71) > 0.5 || distance <= 2 ? 42 / 99 : 0.06;
  if (protectedStyleForPrayer(action.defencePrayer) === style) {
    base *= 0.6;
  }
  const opponentSpec = clamp01(inputFeature(features, 59));
  if (opponentSpec >= 0.5 && distance <= 2) {
    const followupWeight = style === "melee" ? 1 : style === "ranged" ? 0.82 : 0.18;
    const gmaulDamage = style === "melee" && opponentSpec >= 0.99 ? 72 : 38;
    base += followupWeight * (gmaulDamage / 99);
  }
  return base;
}

function softVisibleKoRisk(selfHp: number, damage: number): number {
  return clamp01((damage - selfHp + 13 / 99) / (30 / 99));
}

function skipDangerSupplyPenalty(selfHp: number, risk: number, panicRisk: number): number {
  let danger = clamp01((risk - 0.52) / 0.36);
  const panic = clamp01((panicRisk - 0.22) / 0.48);
  if (selfHp > 68 / 99 && panic <= 0) {
    danger *= 0.4;
  }
  return 10.7 * danger + 7.4 * panic;
}

function lowRiskSupplyPenalty(
  supply: NhPolicyAction["supplyIntent"],
  selfHp: number,
  risk: number,
  panicRisk: number
): number {
  const safeHpScale = 0.85 + clamp01((selfHp - 50 / 99) / (34 / 99));
  let penalty = 4.95 * safeHpScale;
  if (supply === "double_eat") {
    penalty += 3.15;
  } else if (supply === "brew_only") {
    penalty *= selfHp < 80 / 99 ? 0.58 : 0.78;
  } else if (supply === "triple_eat") {
    penalty += 3.15 * 1.35;
  } else if (supply === "panic_full") {
    penalty += 3.15 + 4.7;
  }
  if (risk > 0.35 || panicRisk > 0.38) {
    penalty *= 0.65;
  }
  return penalty;
}

function isBrewOnlyEvWindow(currentEv: number, postBrewEv: number, bestPostBrewEv: number): boolean {
  return postBrewEv >= 0.46 && postBrewEv >= currentEv * 0.66 && postBrewEv >= bestPostBrewEv - 0.08;
}

function bestVisibleStyleEv(
  features: readonly number[],
  context: NhDuelControllerContext | undefined,
  extraBrewDoses: number
): number {
  return Math.max(
    visibleStyleEv(features, context, "magic", extraBrewDoses),
    visibleStyleEv(features, context, "ranged", extraBrewDoses),
    visibleStyleEv(features, context, "melee", extraBrewDoses)
  );
}

function bestOtherVisibleStyleEv(
  features: readonly number[],
  context: NhDuelControllerContext | undefined,
  selectedStyle: NhPolicyAction["offenceStyle"]
): number {
  const styles: readonly NhPolicyAction["offenceStyle"][] = ["magic", "ranged", "melee"];
  return styles
    .filter((style) => style !== selectedStyle)
    .reduce((best, style) => Math.max(best, visibleStyleEv(features, context, style)), 0);
}

function opponentWeaknessForStyle(
  context: NhDuelControllerContext | undefined,
  style: NhPolicyAction["offenceStyle"]
): number {
  if (!context || context.opponent.observedInfoKnown === false) {
    return 0;
  }
  const bonuses = aggregateVisibleEquipmentBonuses(context.opponent.equipment, equipmentRows);
  if (style === "magic") {
    return weaknessFromDefenceBonus(bonuses.magic_defence_bonus);
  }
  if (style === "ranged") {
    return weaknessFromDefenceBonus(bonuses.range_defence_bonus);
  }
  return weaknessFromDefenceBonus(bonuses.slash_defence_bonus);
}

function opponentGmaulWeakness(context: NhDuelControllerContext | undefined): number {
  if (!context || context.opponent.observedInfoKnown === false) {
    return 0;
  }
  return weaknessFromDefenceBonus(aggregateVisibleEquipmentBonuses(context.opponent.equipment, equipmentRows).crush_defence_bonus);
}

function weaknessFromDefenceBonus(defenceBonus: number): number {
  return -clampDouble((defenceBonus - 70) / 140, -1, 1);
}

function visibleStyleEv(
  features: readonly number[],
  context: NhDuelControllerContext | undefined,
  style: NhPolicyAction["offenceStyle"],
  extraBrewDoses = 0
): number {
  // Source: NhStakerSelfPlayManager.visibleStyleEv() is the policy-bridge prior.
  // The fuller NhStakerBot.clientOffenceEv() remains in runtime context guards.
  const weakness = opponentWeaknessForStyle(context, style);
  const defenceFactor = 0.56 + 0.58 * clamp01(weakness + 0.35);
  const prayerFactor = isProtectedByOpponentPrayer(features, style) ? 0.58 : 1;
  const distance = clamp01(inputFeature(features, 0)) * 12;
  const meleeReachNow = inputFeature(features, 71) > 0.5;
  const selfAttackReady = inputFeature(features, 9) > 0.5;
  const baseHit = style === "magic" ? 31 : style === "ranged" ? 41 : 42;
  let rangeFactor = 1;
  if (style === "melee") {
    if (!meleeReachNow) {
      rangeFactor = 0.08;
    } else if (distance > 1.25) {
      rangeFactor = selfAttackReady ? 0.88 : 0.46;
    }
  }
  const opponentHp = clamp01(inputFeature(features, 2));
  const statFactor = styleStatFactor(features, style, extraBrewDoses);
  const effectiveBaseHit = baseHit * Math.min(1.08, Math.max(0, statFactor));
  const koPressure = opponentHp > 0 && effectiveBaseHit / 99 >= opponentHp ? 1.1 : 1;
  return (baseHit / 42) * defenceFactor * prayerFactor * rangeFactor * statFactor * koPressure;
}

function styleStatFactor(
  features: readonly number[],
  style: NhPolicyAction["offenceStyle"],
  extraBrewDoses: number
): number {
  if (style === "magic") {
    const magicRatio = offensiveLevelRatio(features, 65, 70, extraBrewDoses);
    const magicLevel = magicRatio * 99;
    if (magicLevel < 82) {
      return 0.1;
    }
    const spellDamageFactor = magicLevel >= 94 ? 1 : 26 / 31;
    return clampDouble(spellDamageFactor * (0.56 + 0.44 * Math.min(1, magicRatio)), 0.1, 1.1);
  }
  if (style === "ranged") {
    const rangedRatio = offensiveLevelRatio(features, 64, 69, extraBrewDoses);
    return clampDouble(0.38 + 0.62 * rangedRatio, 0.18, 1.14);
  }

  const attackRatio = offensiveLevelRatio(features, 61, 66, extraBrewDoses);
  const strengthRatio = offensiveLevelRatio(features, 62, 67, extraBrewDoses);
  const accuracyFactor = 0.42 + 0.58 * attackRatio;
  const damageFactor = 0.48 + 0.52 * strengthRatio;
  return clampDouble(accuracyFactor * damageFactor, 0.16, 1.22);
}

function normalizeNhNeuralInput(
  policy: ParsedNhNeuralPolicy,
  features: readonly number[],
  options: { readonly dmmDeployedComposite?: boolean } = {}
): Float32Array {
  const input = new Float32Array(policy.inputSize);
  for (let index = 0; index < policy.inputSize; index += 1) {
    const std = policy.inputStd[index];
    const raw =
      options.dmmDeployedComposite &&
      policy.inputSize === nhPolicyPreviousInputSize &&
      Number.isFinite(std) &&
      Math.abs(std) <= dmmDeployedConstantInputStdMax
        ? policy.inputMean[index]
        : features[nhPolicyInputFeatureStart + index];
    input[index] = (raw - policy.inputMean[index]) /
      (Number.isFinite(std) && Math.abs(std) > 1.0e-8 ? std : 1);
  }
  return input;
}

function runNhNeuralEncoder(policy: ParsedNhNeuralPolicy, normalizedInput: Float32Array): Float32Array {
  let current = normalizedInput;
  for (const layer of policy.layers) {
    current = runDenseLayer(layer, current);
  }
  return current;
}

function runDenseLayer(layer: NhNeuralDenseLayer, input: Float32Array): Float32Array {
  const output = new Float32Array(layer.bias.length);
  for (let row = 0; row < layer.bias.length; row += 1) {
    output[row] = silu(denseRowScore(layer, row, input));
  }
  return output;
}

function denseRowScore(
  layer: Pick<NhNeuralDenseLayer, "weight" | "bias">,
  rowIndex: number,
  input: Float32Array
): number {
  const weights = layer.weight[rowIndex];
  let score = layer.bias[rowIndex] ?? 0;
  for (let index = 0; index < input.length; index += 1) {
    score += weights[index] * input[index];
  }
  return score;
}

function neuralPolicyActionScore(
  policy: ParsedNhNeuralPolicy,
  action: number,
  encoded: Float32Array
): number {
  if (action < 0 || action >= policy.actionCount) {
    return Number.NEGATIVE_INFINITY;
  }
  return denseRowScore(policy.policy, action, encoded);
}

function silu(value: number): number {
  return value / (1 + Math.exp(-value));
}

function offensiveLevelRatio(
  features: readonly number[],
  ratioIndex: number,
  deltaIndex: number,
  extraBrewDoses: number
): number {
  let ratio = clamp01(inputFeature(features, ratioIndex));
  const levelDelta = clampSigned(inputFeature(features, deltaIndex));
  if (levelDelta > 0) {
    ratio = Math.max(ratio, 1 + (levelDelta * 40) / 99);
  }
  return clampDouble(ratio - Math.max(0, extraBrewDoses) * (9 / 99), 0, 1.25);
}

function policyScore(policy: ParsedNhPolicy, action: number, features: readonly number[]): number {
  const weights = policy.weightsByAction.get(action);
  if (!weights) {
    return 0;
  }
  let score = 0;
  for (const [featureIndex, value] of weights.entries()) {
    score += value * features[featureIndex];
  }
  return score;
}

function isDmmCurrentCombatActionAllowed(
  features: readonly number[],
  action: NhPolicyAction,
  context?: NhDuelControllerContext
): boolean {
  const attackIntent = action.attackIntent ?? "attack";
  if (attackIntent === "hold") {
    return true;
  }
  if (inputFeature(features, 9) <= 0.5) {
    return false;
  }

  if (action.offenceStyle === "melee") {
    const reachable = attackIntent === "off_tick"
      ? dmmMeleeOffTickReachable(features)
      : context?.meleeReachable ?? inputFeature(features, dmmSelfMeleeReachInputIndex) > 0.5;
    if (!reachable) {
      return false;
    }
  } else {
    const distance = Math.max(0, Math.round(clamp01(inputFeature(features, 0)) * 12));
    if (distance < 1 || distance > 10) {
      return false;
    }
  }

  return !(
    action.specIntent === "none" &&
    action.offenceStyle === "magic" &&
    inputFeature(features, dmmSelfMagicRatioInputIndex) < dmmMinimumMagicCastRatio
  );
}

function dmmMeleeOffTickReachable(features: readonly number[]): boolean {
  if (inputFeature(features, dmmSelfMeleeReachInputIndex) > 0.5) {
    return true;
  }
  const dx = Math.abs(Math.round(clampSigned(inputFeature(features, 31)) * 16));
  const dy = Math.abs(Math.round(clampSigned(inputFeature(features, 32)) * 16));
  const selfFrozen = inputFeature(features, 12) > 0.5;
  if (dx === 0 && dy === 0) {
    return !selfFrozen;
  }
  if (dx + dy === 1) {
    return true;
  }
  if (selfFrozen) {
    return false;
  }
  if (dx === 1 && dy === 1) {
    return true;
  }
  const stepInLimit = 3;
  return dx <= stepInLimit && dy <= stepInLimit && !(dx === stepInLimit && dy === stepInLimit);
}

function isNhPolicyActionAllowed(
  features: readonly number[],
  action: NhPolicyAction,
  context?: NhDuelControllerContext,
  options?: { readonly dmmDirectGearModel?: boolean }
): boolean {
  const dmmNeuralContext = isDmmNeuralContext(context);
  const dmmDirectGearModel = options?.dmmDirectGearModel === true;
  const directGearOnly =
    (action.directGearActions?.length ?? 0) > 0 &&
    action.supplyIntent === "none" &&
    action.specIntent === "none" &&
    (action.attackIntent ?? "hold") === "hold";
  if (directGearOnly) {
    return dmmNeuralContext && dmmDirectGearModel;
  }
  if (dmmNeuralContext && dmmDirectGearModel && (action.equipmentIntent ?? "style_loadout") !== "weapon_only") {
    return false;
  }
  if (dmmNeuralContext && !dmmDirectGearModel) {
    return false;
  }
  const hasTarget = inputFeature(features, 33) > 0.5;
  if (!hasTarget) {
    return action.specIntent === "none" &&
      action.supplyIntent === "none" &&
      (!dmmDirectGearModel || (action.attackIntent ?? "hold") === "hold");
  }

  const selfHp = inputFeature(features, 1);
  const selfPrayer = inputFeature(features, 3);
  const lastTaken = Math.max(0, inputFeature(features, 24));
  const canAttack = inputFeature(features, 8) > 0.5;
  const selfAttackReady = inputFeature(features, 9) > 0.5;
  const canSpecSingleNow = inputFeature(features, 10) > 0.5;
  const canSpecDoubleNow = inputFeature(features, 11) > 0.5;
  const specSingleWindow = Math.max(inputFeature(features, 73), inputFeature(features, 75));
  const specDoubleWindow = Math.max(inputFeature(features, 74), inputFeature(features, 76));
  const selfFrozen = inputFeature(features, 12) > 0.5;
  const opponentFrozen = inputFeature(features, 13) > 0.5;
  const hasFood = inputFeature(features, 4) > 0.5 / 28;
  const hasTwoFood = inputFeature(features, 4) > 1.5 / 28;
  const hasBrew = inputFeature(features, 5) > 0.5 / 8;
  const hasRestore = inputFeature(features, 6) > 0.5 / 8;
  const hasReboost = inputFeature(features, 7) > 0.5 / 8;
  const distance = Math.max(0, Math.round(clamp01(inputFeature(features, 0)) * 12));
  const attackDeficit = inputFeature(features, 66);
  const strengthDeficit = inputFeature(features, 67);
  const defenceDeficit = inputFeature(features, 68);
  const rangedDeficit = inputFeature(features, 69);
  const magicDeficit = inputFeature(features, 70);
  const needsRestore =
    selfPrayer < 55 / 99 ||
    attackDeficit < -0.025 ||
    strengthDeficit < -0.025 ||
    defenceDeficit < -0.025 ||
    rangedDeficit < -0.025 ||
    magicDeficit < -0.025;
  const needsReboost = needsCombatReboost(attackDeficit, strengthDeficit, defenceDeficit, rangedDeficit);

  if (nhSpecIntentIsLegacyGeneric(action.specIntent)) {
    return false;
  }
  if (dmmDirectGearModel && !isDmmCurrentCombatActionAllowed(features, action, context)) {
    return false;
  }
  if (isNhExplicitSpecIntent(action.specIntent)) {
    const specialKind = nhExplicitSpecWeaponKind(action.specIntent);
    const consumesAttackTimer = specialKind !== "granite_maul";
    const canSpecNow = nhSpecIntentIsDouble(action.specIntent) ? canSpecDoubleNow : canSpecSingleNow;
    const canReachForSpec = specialKind === null
      ? false
      : context
        ? canMeleeSpecialStepInReachNextTick(context, specialKind)
        : inputFeature(features, 71) > 0.5;
    const hasSpecControl = context
      ? nhWeaponProfiles[context.self.weaponId].hasVisibleSpecBar
      : canSpecNow;
    const requiredEnergy = explicitSpecRequiredEnergy(action.specIntent);
    const hasSpecEnergy = context ? context.self.gmaul.specialEnergy >= requiredEnergy : canSpecNow;
    if (
      !canReachForSpec ||
      !hasSpecControl ||
      !hasSpecEnergy ||
      !isExplicitSpecKindAvailable(context, specialKind) ||
      (consumesAttackTimer && !selfAttackReady)
    ) {
      return false;
    }
  } else {
    if (nhSpecIntentIsDouble(action.specIntent) && (!canSpecDoubleNow || specDoubleWindow < 0.24)) {
      return false;
    }
    if (
      action.specIntent !== "none" &&
      !nhSpecIntentIsDouble(action.specIntent) &&
      (!canSpecSingleNow || specSingleWindow < 0.24)
    ) {
      return false;
    }
  }
  if (
    dmmDirectGearModel &&
    nhDmmCoreGearActionsForCombat(action).some(
      (coreAction) =>
        dmmTwoHandedDirectGearActions.has(coreAction) &&
        inputFeature(features, dmmCanEquipTwoHandedInputIndex) <= 0.5
    )
  ) {
    return false;
  }

  if (action.defencePrayer === "smite") {
    // Source: NhStakerSelfPlayManager.isActionAllowed(..., trainingMode=false)
    // rejects Smite during live inference; Smite remains only a training action.
    return false;
  } else if (action.defencePrayer === "redemption" && (selfPrayer < 12 / 99 || selfHp < 0.1 || selfHp > 0.35)) {
    return false;
  }

  let supplyAllowed = true;
  if (action.supplyIntent === "safe_eat" || action.supplyIntent === "double_eat") {
    supplyAllowed = hasFood && allowHealingSupply(action.supplyIntent, selfHp, lastTaken, canAttack, selfAttackReady);
  } else if (action.supplyIntent === "triple_eat") {
    supplyAllowed = (hasBrew || hasTwoFood) && allowHealingSupply(action.supplyIntent, selfHp, lastTaken, canAttack, selfAttackReady);
  } else if (action.supplyIntent === "brew_only") {
    supplyAllowed = hasBrew && allowHealingSupply(action.supplyIntent, selfHp, lastTaken, canAttack, selfAttackReady);
  } else if (action.supplyIntent === "restore_reboost") {
    supplyAllowed = (hasRestore && needsRestore) || (hasReboost && needsReboost);
  } else if (action.supplyIntent === "panic_full") {
    supplyAllowed = (hasFood || hasBrew || hasRestore || hasReboost) &&
      allowHealingSupply(action.supplyIntent, selfHp, lastTaken, canAttack, selfAttackReady);
  } else if (action.supplyIntent === "offence_strip_one" || action.supplyIntent === "offence_strip_two") {
    supplyAllowed = allowOffenceStrip(features, action, distance, selfHp, selfFrozen);
  } else if (action.supplyIntent === "regear_style") {
    supplyAllowed = allowRegear(features, action, selfHp, selfFrozen);
  } else if (action.supplyIntent === "vengeance_trinket") {
    supplyAllowed =
      context === undefined ||
      (context.self.canUseVengeanceTrinket ?? (context.self.vengeanceTrinketCasts ?? 0) < 2);
  }
  if (!supplyAllowed) {
    return false;
  }

  if (action.movementIntent === "stand_under" && (!opponentFrozen || selfFrozen)) {
    return false;
  }
  return !selfFrozen || action.movementIntent === "none";
}

function isNhDeployedLegacyPolicyActionAllowed(features: readonly number[], action: NhPolicyAction): boolean {
  const hasTarget = inputFeature(features, 33) > 0.5;
  if (!hasTarget) {
    return action.specIntent === "none" && action.supplyIntent === "none";
  }

  const selfHp = inputFeature(features, 1);
  const selfPrayer = inputFeature(features, 3);
  const lastTaken = Math.max(0, inputFeature(features, 24));
  const canAttack = inputFeature(features, 8) > 0.5;
  const selfAttackReady = inputFeature(features, 9) > 0.5;
  const canSpecSingleNow = inputFeature(features, 10) > 0.5;
  const canSpecDoubleNow = inputFeature(features, 11) > 0.5;
  const specSingleWindow = Math.max(inputFeature(features, 73), inputFeature(features, 75));
  const specDoubleWindow = Math.max(inputFeature(features, 74), inputFeature(features, 76));
  const selfFrozen = inputFeature(features, 12) > 0.5;
  const opponentFrozen = inputFeature(features, 13) > 0.5;
  const hasFood = inputFeature(features, 4) > 0.5 / 28;
  const hasTwoFood = inputFeature(features, 4) > 1.5 / 28;
  const hasBrew = inputFeature(features, 5) > 0.5 / 8;
  const hasRestore = inputFeature(features, 6) > 0.5 / 8;
  const hasReboost = inputFeature(features, 7) > 0.5 / 8;
  const distance = Math.max(0, Math.round(clamp01(inputFeature(features, 0)) * 12));
  const attackDeficit = inputFeature(features, 66);
  const strengthDeficit = inputFeature(features, 67);
  const defenceDeficit = inputFeature(features, 68);
  const rangedDeficit = inputFeature(features, 69);
  const magicDeficit = inputFeature(features, 70);
  const needsRestore =
    selfPrayer < 55 / 99 ||
    attackDeficit < -0.025 ||
    strengthDeficit < -0.025 ||
    defenceDeficit < -0.025 ||
    rangedDeficit < -0.025 ||
    magicDeficit < -0.025;
  const needsReboost = needsCombatReboost(attackDeficit, strengthDeficit, defenceDeficit, rangedDeficit);

  if (action.specIntent === "use_special_double" && (!canSpecDoubleNow || specDoubleWindow < 0.24)) {
    return false;
  }
  if (action.specIntent === "use_special" && (!canSpecSingleNow || specSingleWindow < 0.24)) {
    return false;
  }

  if (action.defencePrayer === "smite") {
    return false;
  } else if (action.defencePrayer === "redemption" && (selfPrayer < 12 / 99 || selfHp < 0.1 || selfHp > 0.35)) {
    return false;
  }

  let supplyAllowed = true;
  if (action.supplyIntent === "safe_eat" || action.supplyIntent === "double_eat") {
    supplyAllowed = hasFood && allowHealingSupply(action.supplyIntent, selfHp, lastTaken, canAttack, selfAttackReady);
  } else if (action.supplyIntent === "triple_eat") {
    supplyAllowed = (hasBrew || hasTwoFood) && allowHealingSupply(action.supplyIntent, selfHp, lastTaken, canAttack, selfAttackReady);
  } else if (action.supplyIntent === "brew_only") {
    supplyAllowed = hasBrew && allowHealingSupply(action.supplyIntent, selfHp, lastTaken, canAttack, selfAttackReady);
  } else if (action.supplyIntent === "restore_reboost") {
    supplyAllowed = (hasRestore && needsRestore) || (hasReboost && needsReboost);
  } else if (action.supplyIntent === "panic_full") {
    supplyAllowed = (hasFood || hasBrew || hasRestore || hasReboost) &&
      allowHealingSupply(action.supplyIntent, selfHp, lastTaken, canAttack, selfAttackReady);
  } else if (action.supplyIntent === "offence_strip_one" || action.supplyIntent === "offence_strip_two") {
    supplyAllowed = allowOffenceStrip(features, action, distance, selfHp, selfFrozen);
  } else if (action.supplyIntent === "regear_style") {
    supplyAllowed = allowRegear(features, action, selfHp, selfFrozen);
  }
  if (!supplyAllowed) {
    return false;
  }

  if (action.movementIntent === "stand_under" && (!opponentFrozen || selfFrozen)) {
    return false;
  }
  if (
    action.movementIntent === "step_out" &&
    !allowStepOut(features, action, distance, selfHp, selfFrozen, opponentFrozen)
  ) {
    return false;
  }
  return !selfFrozen || action.movementIntent === "pressure";
}

function isExplicitSpecKindAvailable(
  context: NhDuelControllerContext | undefined,
  specialKind: ReturnType<typeof nhExplicitSpecWeaponKind>
): boolean {
  if (specialKind === null || context === undefined || context.self.gearProfile === undefined) {
    return true;
  }
  return nhGearProfileAvailableSpecialWeaponKinds(context.self.gearProfile, context.self.gmaul.specialEnergy)
    .includes(specialKind);
}

function explicitSpecRequiredEnergy(specIntent: NhSpecIntent): number {
  if (specIntent === "spec_granite_maul_double") {
    return 100;
  }
  if (specIntent === "spec_vesta_longsword") {
    return 25;
  }
  if (specIntent === "none" || nhSpecIntentIsLegacyGeneric(specIntent)) {
    return Number.POSITIVE_INFINITY;
  }
  return 50;
}

function needsCombatReboost(attackDelta: number, strengthDelta: number, defenceDelta: number, rangedDelta: number): boolean {
  const boostFloor = 3 / 40;
  return attackDelta < boostFloor || strengthDelta < boostFloor || defenceDelta < boostFloor || rangedDelta < boostFloor;
}

function allowHealingSupply(
  supply: NhPolicyAction["supplyIntent"],
  selfHp: number,
  lastTaken: number,
  canAttack: boolean,
  selfAttackReady: boolean
): boolean {
  const hitRisk = clamp01(lastTaken * 1.45);
  const panicRisk = clamp01((44 / 99 - selfHp) / (19 / 99) + hitRisk * 0.25);
  if (supply === "safe_eat") {
    return selfHp < 68 / 99 || hitRisk > 0.55;
  }
  if (supply === "double_eat") {
    return selfHp < 58 / 99 || hitRisk > 0.68 || panicRisk > 0.42;
  }
  if (supply === "triple_eat") {
    return selfHp < 48 / 99 || panicRisk > 0.42;
  }
  if (supply === "brew_only") {
    return selfHp < 50 / 99 || hitRisk > 0.64 || ((canAttack || selfAttackReady) && selfHp < 72 / 99 && hitRisk > 0.18);
  }
  if (supply === "panic_full") {
    return selfHp < 42 / 99 || panicRisk > 0.55;
  }
  return true;
}

function allowStepOut(
  features: readonly number[],
  action: NhPolicyAction,
  distance: number,
  selfHp: number,
  selfFrozen: boolean,
  opponentFrozen: boolean
): boolean {
  if (selfFrozen || distance > 1) {
    return false;
  }
  if (opponentFrozen) {
    if (action.offenceStyle === "melee") {
      return distance === 0 && inputFeature(features, 71) > 0.5;
    }
    return action.offenceStyle === "magic" || action.offenceStyle === "ranged";
  }
  const opponentLikely = readEncodedStyle(features, 43) ?? readEncodedStyle(features, 46);
  return opponentLikely === "melee" && selfHp <= 42 / 99;
}

function allowOffenceStrip(
  features: readonly number[],
  action: NhPolicyAction,
  distance: number,
  selfHp: number,
  selfFrozen: boolean
): boolean {
  if (!offenceStripActionsEnabled) {
    return false;
  }
  return !selfFrozen &&
    selfHp >= 78 / 99 &&
    distance <= 1 &&
    inputFeature(features, 24) <= 0.05 &&
    !isProtectedByOpponentPrayer(features, action.offenceStyle);
}

function allowRegear(features: readonly number[], action: NhPolicyAction, selfHp: number, selfFrozen: boolean): boolean {
  if (selfFrozen || selfHp < 56 / 99 || inputFeature(features, 24) > 0.2) {
    return false;
  }
  const currentStyle = readEncodedStyle(features, 37);
  return currentStyle === null || currentStyle === action.offenceStyle;
}

function readEncodedStyle(features: readonly number[], startIndex: number): NhPolicyAction["offenceStyle"] | null {
  if (inputFeature(features, startIndex) > 0.5) {
    return "magic";
  }
  if (inputFeature(features, startIndex + 1) > 0.5) {
    return "ranged";
  }
  if (inputFeature(features, startIndex + 2) > 0.5) {
    return "melee";
  }
  return null;
}

function isProtectedByOpponentPrayer(features: readonly number[], style: NhPolicyAction["offenceStyle"]): boolean {
  if (style === "magic") {
    return inputFeature(features, 52) > 0.5;
  }
  if (style === "ranged") {
    return inputFeature(features, 53) > 0.5;
  }
  return inputFeature(features, 54) > 0.5;
}

function protectedStyleForPrayer(prayer: NhPolicyAction["defencePrayer"]): NhPolicyAction["offenceStyle"] | null {
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

function isHealingSupplyIntent(supply: NhPolicyAction["supplyIntent"]): boolean {
  return supply === "safe_eat" ||
    supply === "double_eat" ||
    supply === "triple_eat" ||
    supply === "brew_only" ||
    supply === "panic_full";
}

function inputFeature(features: readonly number[], inputIndex: number): number {
  return features[nhPolicyInputFeatureStart + inputIndex] ?? 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function clampSigned(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, value));
}

function clampDouble(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function isValidAction(action: number): boolean {
  return Number.isInteger(action) && action >= 0 && action < nhPolicyActionCount;
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function readNumberVector(value: unknown, expectedLength: number | null, label: string): Float32Array {
  const values = readArray(value, label);
  if (expectedLength !== null && values.length !== expectedLength) {
    throw new Error(`${label} must have ${expectedLength} entries, got ${values.length}.`);
  }
  const output = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const parsed = Number(values[index]);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${label}[${index}] must be a finite number.`);
    }
    output[index] = parsed;
  }
  return output;
}

function readNumberMatrix(
  value: unknown,
  expectedRows: number,
  expectedColumns: number,
  label: string
): readonly Float32Array[] {
  const rows = readArray(value, label);
  if (rows.length !== expectedRows) {
    throw new Error(`${label} must have ${expectedRows} rows, got ${rows.length}.`);
  }
  return rows.map((row, rowIndex) =>
    readNumberVector(row, expectedColumns, `${label}[${rowIndex}]`)
  );
}

function readOptionalActionIds(value: unknown, expectedLength: number, label: string): Int32Array | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const values = readArray(value, label);
  if (values.length !== expectedLength) {
    throw new Error(`${label} must have ${expectedLength} entries, got ${values.length}.`);
  }
  const actionIds = new Int32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const action = Number(values[index]);
    if (!isValidAction(action)) {
      throw new Error(`${label}[${index}] must be a valid global NH action id.`);
    }
    actionIds[index] = action;
  }
  return actionIds;
}

function readNumberRecord(value: unknown): Readonly<Record<string, number>> {
  if (value === undefined || value === null) {
    return {};
  }
  const record = readObject(value, "metrics");
  const output: Record<string, number> = {};
  for (const [key, entry] of Object.entries(record)) {
    const parsed = Number(entry);
    if (Number.isFinite(parsed)) {
      output[key] = parsed;
    }
  }
  return output;
}

function parseRequiredInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer.`);
  }
  return parsed;
}

function parseOptionalInteger(value: unknown, fallback: number): number {
  if (value === undefined || value === null) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function parseInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
