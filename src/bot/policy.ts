import equipmentRowsJson from "../generated/equipment-bonuses.json";
import {
  createNhPolicyFeatureState,
  resetNhPolicyFeatureState,
  encodeNhPolicyFeatures,
  decodeNhPolicyAction,
  nhPolicyActionCount,
  nhPolicyFeatureSize,
  nhPolicyInputFeatureStart,
  scriptedNhController,
  type NhDuelController,
  type NhDuelControllerContext,
  type NhPolicyAction
} from "../sim";
import { aggregateVisibleEquipmentBonuses, type EquipmentBonusRow } from "../sim/equipment/equipment";

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

export interface NhPolicyActionSummary {
  readonly action: number;
  readonly visits: number;
  readonly decoded: NhPolicyAction;
}

export interface NhPolicyScoredAction extends NhPolicyActionSummary {
  readonly score: number;
}

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
}

export interface NhPolicyHistoryObservation {
  readonly tick: number;
  readonly targetId: string | null;
  readonly targetPresent: boolean;
  readonly distance: number;
  readonly opponentLikelyStyle: NhPolicyAction["offenceStyle"] | null;
  readonly opponentGearStyle: NhPolicyAction["offenceStyle"] | null;
}

const policyHistoryTicks = 16;
const defencePrayerHistoryObservationLimit = 8;
const nhPolicyStoreVersion = 11;
const explorationReheatDecisionsCap = 350_000;
const loadedPolicyWeightClamp = 6;
const loadRebalanceStripTwoScale = 0.7;
const loadRebalanceStripOneScale = 0.86;
const loadRebalanceSmiteScale = 0.92;
const loadRebalanceRedemptionScale = 0.62;
const loadRebalanceHealingSupplyScale = 0.66;
const loadRebalanceTripleEatScale = 0.56;
const loadRebalanceDoubleSpecScale = 0.7;
const equipmentRows = equipmentRowsJson as readonly EquipmentBonusRow[];
const actionVisitMapCache = new WeakMap<ParsedNhPolicy, ReadonlyMap<number, number>>();

export function createNhPolicyController(policy: ParsedNhPolicy): NhPolicyRuntimeController {
  const featureState = createNhPolicyFeatureState();
  const historyWindow: NhPolicyHistoryObservation[] = [];
  let lastRankings: readonly NhPolicyScoredAction[] = [];
  let activeEpisodeId: number | null = null;
  let lastContextTick: number | null = null;
  return {
    id: `parsed-policy:${policy.sourceLabel}`,
    chooseAction(context) {
      const rewardEpisodeActive = context.rewardEpisodeActive ?? true;
      const rewardEpisodeId = context.rewardEpisodeId ?? 0;
      if (context.rewardEpisodeId === undefined && lastContextTick !== null && context.tick < lastContextTick) {
        resetNhPolicyFeatureState(featureState);
        historyWindow.length = 0;
        activeEpisodeId = null;
      }
      if (!rewardEpisodeActive || rewardEpisodeId < 0) {
        resetNhPolicyFeatureState(featureState);
        historyWindow.length = 0;
        activeEpisodeId = null;
      } else if (activeEpisodeId !== rewardEpisodeId) {
        resetNhPolicyFeatureState(featureState);
        historyWindow.length = 0;
        activeEpisodeId = rewardEpisodeId;
      }
      const features = encodeNhPolicyFeatures(context, featureState);
      const observation = policyHistoryObservationFromFeatures(features, context.tick, context.opponent.id);
      lastRankings = rankNhPolicyActionsFromFeatures(
        policy,
        features,
        5,
        context,
        historyWindow,
        javaStyleEqualScoreTieBreaker
      );
      historyWindow.push(observation);
      while (historyWindow.length > policyHistoryTicks) {
        historyWindow.shift();
      }
      lastContextTick = context.tick;
      return lastRankings[0]?.decoded ?? scriptedNhController.chooseAction(context);
    },
    getLastRankings() {
      return lastRankings;
    }
  };
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
      if (!isValidAction(action) || featureIndex < 0 || featureIndex >= nhPolicyFeatureSize || !Number.isFinite(value)) {
        continue;
      }
      const weights = mutableWeights.get(action) ?? new Map<number, number>();
      if (!mutableWeights.has(action)) {
        mutableWeights.set(action, weights);
      }
      weights.set(featureIndex, value);
      weightEntryCount += 1;
    }
  }

  if (version !== nhPolicyStoreVersion) {
    // Source: NhStakerSelfPlayManager.loadFromDisk() refuses policy TSV files
    // whose STORE_VERSION does not match the live bridge shape.
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
  const decoded = decodeNhPolicyAction(action);
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
  if (decoded.specIntent === "use_special_double") {
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
  historyWindow: readonly NhPolicyHistoryObservation[] = [],
  equalScoreTieBreaker?: NhPolicyEqualScoreTieBreaker
): readonly NhPolicyScoredAction[] {
  if (features.length !== nhPolicyFeatureSize) {
    throw new Error(`NH policy feature vector must have ${nhPolicyFeatureSize} entries, got ${features.length}.`);
  }
  const currentObservation = policyHistoryObservationFromFeatures(
    features,
    context?.tick ?? nextPolicyHistoryTick(historyWindow),
    context?.opponent.id ?? null
  );

  const actionVisits = actionVisitMap(policy);
  const rankings: NhPolicyScoredAction[] = [];
  for (let action = 0; action < nhPolicyActionCount; action += 1) {
    const decoded = decodeNhPolicyAction(action);
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
    score += actionPrior(features, decoded, context, historyWindow, currentObservation);
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

function actionPrior(
  features: readonly number[],
  action: NhPolicyAction,
  context?: NhDuelControllerContext,
  historyWindow: readonly NhPolicyHistoryObservation[] = [],
  currentObservation: NhPolicyHistoryObservation = policyHistoryObservationFromFeatures(features, nextPolicyHistoryTick(historyWindow))
): number {
  return specOpportunityPrior(features, action) +
    specApproachPrior(features, action) +
    offenceGearWeaknessPrior(features, action, context) +
    defencePrayerPrior(features, action) +
    defencePrayerHistoryPrior(features, action, historyWindow, currentObservation) +
    supplyIntentPrior(features, action, context) +
    movementControlPrior(features, action, context);
}

function specOpportunityPrior(features: readonly number[], action: NhPolicyAction): number {
  if (action.specIntent === "none" || action.supplyIntent !== "none") {
    return 0;
  }
  const singleWindow = Math.max(inputFeature(features, 73), inputFeature(features, 75));
  const doubleWindow = Math.max(inputFeature(features, 74), inputFeature(features, 76));
  const window = action.specIntent === "use_special_double" ? doubleWindow : singleWindow;
  if (window < 0.34) {
    return 0;
  }
  const specScale = action.specIntent === "use_special_double" ? 1.1 : 0.92;
  return 44 * (window - 0.34) * specScale;
}

function specApproachPrior(features: readonly number[], action: NhPolicyAction): number {
  if (action.specIntent !== "none" || action.supplyIntent !== "none" || action.movementIntent !== "pressure") {
    return 0;
  }
  const distance = inputFeature(features, 0) * 12;
  if (distance < 1.4 || distance > 2.4 || inputFeature(features, 12) > 0.5) {
    return 0;
  }
  const window = Math.max(
    Math.max(inputFeature(features, 73), inputFeature(features, 75)),
    Math.max(inputFeature(features, 74), inputFeature(features, 76))
  );
  if (window < 0.2) {
    return 0;
  }
  const styleScale = action.offenceStyle === "melee" ? 1 : 0.42;
  return 18 * (window - 0.2) * styleScale;
}

function defencePrayerPrior(features: readonly number[], action: NhPolicyAction): number {
  if (inputFeature(features, 33) <= 0.5) {
    return 0;
  }
  let magic = 1;
  let ranged = 1;
  let melee = 1;
  let readable = false;
  const likely = readEncodedStyle(features, 43);
  if (likely) {
    magic += likely === "magic" ? 1.55 : 0;
    ranged += likely === "ranged" ? 1.55 : 0;
    melee += likely === "melee" ? 1.55 : 0;
    readable = true;
  }
  const gear = readEncodedStyle(features, 46);
  if (gear) {
    magic += gear === "magic" ? 1.1 : 0;
    ranged += gear === "ranged" ? 1.1 : 0;
    melee += gear === "melee" ? 1.1 : 0;
    readable = true;
  }
  if (!readable) {
    return 0;
  }

  const distance = Math.max(0, Math.round(clamp01(inputFeature(features, 0)) * 12));
  if (distance > 1) {
    magic += 0.35;
    ranged += 0.35;
    melee *= 0.72;
  } else {
    melee += 0.25;
  }

  const total = Math.max(1e-6, magic + ranged + melee);
  const best = Math.max(magic, ranged, melee);
  const confidence = clamp01((best / total - 1 / 3) * 1.8);
  if (confidence < 0.18) {
    return 0;
  }

  const selfHp = clamp01(inputFeature(features, 1));
  const lastTaken = Math.max(0, inputFeature(features, 24));
  let pressure = 0.45 + (1 - selfHp) * 0.35 + clamp01(lastTaken * 1.8) * 0.35;
  if (distance <= 2) {
    pressure += 0.15;
  }
  pressure = clamp01(pressure);

  const protectedStyle = protectedStyleForPrayer(action.defencePrayer);
  if (!protectedStyle) {
    return -4.6 * 0.6 * confidence * pressure;
  }
  const protectedBelief = beliefForStyle(protectedStyle, magic, ranged, melee) / total;
  return 4.6 * (protectedBelief - 1 / 3) * (0.55 + pressure) * (0.5 + confidence);
}

function defencePrayerHistoryPrior(
  features: readonly number[],
  action: NhPolicyAction,
  historyWindow: readonly NhPolicyHistoryObservation[],
  observation: NhPolicyHistoryObservation
): number {
  if (inputFeature(features, 33) <= 0.5 || !observation.targetPresent || historyWindow.length === 0) {
    return 0;
  }

  let magic = 1;
  let ranged = 1;
  let melee = 1;
  let readable = false;
  let observations = 0;
  let weight = 1;
  for (let index = historyWindow.length - 1; index >= 0 && observations < defencePrayerHistoryObservationLimit; index -= 1) {
    const previous = historyWindow[index];
    if (
      !previous.targetPresent ||
      previous.tick >= observation.tick ||
      (previous.targetId ?? null) !== observation.targetId
    ) {
      continue;
    }
    if (previous.opponentLikelyStyle) {
      magic += styleEvidence(previous.opponentLikelyStyle, "magic", weight);
      ranged += styleEvidence(previous.opponentLikelyStyle, "ranged", weight);
      melee += styleEvidence(previous.opponentLikelyStyle, "melee", weight);
      readable = true;
    } else if (previous.opponentGearStyle) {
      const gearWeight = weight * 0.58;
      magic += styleEvidence(previous.opponentGearStyle, "magic", gearWeight);
      ranged += styleEvidence(previous.opponentGearStyle, "ranged", gearWeight);
      melee += styleEvidence(previous.opponentGearStyle, "melee", gearWeight);
      readable = true;
    }
    observations += 1;
    weight *= 0.78;
  }
  if (!readable) {
    return 0;
  }

  const distance = observation.distance < 0
    ? Math.max(0, Math.round(clamp01(inputFeature(features, 0)) * 12))
    : observation.distance;
  if (distance > 1) {
    magic += 0.25;
    ranged += 0.25;
    melee *= 0.8;
  } else {
    melee += 0.2;
  }

  const total = Math.max(1e-6, magic + ranged + melee);
  const best = Math.max(magic, ranged, melee);
  const confidence = clamp01((best / total - 1 / 3) * 1.75);
  if (confidence < 0.1) {
    return 0;
  }

  const selfHp = clamp01(inputFeature(features, 1));
  const lastTaken = Math.max(0, inputFeature(features, 24));
  let pressure = 0.36 + (1 - selfHp) * 0.36 + clamp01(lastTaken * 1.7) * 0.28;
  if (distance <= 2) {
    pressure += 0.12;
  }
  pressure = clamp01(pressure);

  const protectedStyle = protectedStyleForPrayer(action.defencePrayer);
  if (!protectedStyle) {
    return -3.2 * 0.6 * confidence * pressure;
  }
  const protectedBelief = beliefForStyle(protectedStyle, magic, ranged, melee) / total;
  return 3.2 * (protectedBelief - 1 / 3) * (0.5 + pressure) * (0.45 + confidence);
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
  const hasAnySupply = hasFood || hasBrew;
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
    if (lastTaken > 0.05 || selfHp < 56 / 99) {
      return -skipDangerSupplyPenalty(selfHp, risk, panicRisk) * 0.65;
    }
    return -0.35;
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
    const brewTempoWindow =
      hasBrew &&
      (canAttack || selfAttackReady) &&
      selfHp < 80 / 99 &&
      (risk > 0.12 || lastTaken > 0) &&
      isBrewOnlyEvWindow(currentEv, postBrewEv, bestPostBrewEv);
    return hasBrew && (selfHp < 56 / 99 || brewTempoWindow)
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

  if (action.movementIntent === "step_out" && distance === 0 && attackReady) {
    const styleEv = visibleStyleEv(features, context, action.offenceStyle);
    const bestEv = bestVisibleStyleEv(features, context, 0);
    let score = 5.35 * (0.24 + styleEv);
    if (action.offenceStyle === "melee") {
      const edge = styleEv - bestOtherVisibleStyleEv(features, context, action.offenceStyle);
      if (edge > 0) {
        score += 4.6 * (0.28 + edge);
      }
    }
    if (supportSupply && controlValue > 0.45 && styleEv < bestEv - 0.08) {
      score -= 5.35 * 0.35;
    }
    return score;
  }

  if (action.movementIntent === "pressure" && distance === 1 && !attackReady && controlValue > 0.4) {
    return -0.9 * 0.35;
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

function isNhPolicyActionAllowed(features: readonly number[], action: NhPolicyAction): boolean {
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
    return selfHp < 56 / 99 || hitRisk > 0.64 || ((canAttack || selfAttackReady) && selfHp < 80 / 99);
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

function policyHistoryObservationFromFeatures(
  features: readonly number[],
  tick: number,
  targetId: string | null = null
): NhPolicyHistoryObservation {
  return {
    tick,
    targetId,
    targetPresent: inputFeature(features, 33) > 0.5,
    distance: Math.max(0, Math.round(clamp01(inputFeature(features, 0)) * 12)),
    opponentLikelyStyle: readEncodedStyle(features, 43),
    opponentGearStyle: readEncodedStyle(features, 46)
  };
}

function nextPolicyHistoryTick(historyWindow: readonly NhPolicyHistoryObservation[]): number {
  return historyWindow.reduce((tick, observation) => Math.max(tick, observation.tick), -1) + 1;
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

function styleEvidence(
  actual: NhPolicyAction["offenceStyle"],
  expected: NhPolicyAction["offenceStyle"],
  weight: number
): number {
  return actual === expected ? weight : 0;
}

function beliefForStyle(style: NhPolicyAction["offenceStyle"], magic: number, ranged: number, melee: number): number {
  if (style === "magic") {
    return magic;
  }
  if (style === "ranged") {
    return ranged;
  }
  return melee;
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

function parseInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
