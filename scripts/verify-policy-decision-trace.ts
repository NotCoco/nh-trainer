import { readFileSync } from "node:fs";
import {
  createNhPolicyController,
  parseNhNeuralPolicyJson,
  type NhPolicyDecisionTrace
} from "../src/bot/policy";
import { createInitialNhDuelState, createNhDuelControllerContext } from "../src/sim/nh/duel";
import { inferNhSelectedGearProfile } from "../src/sim/nh/gearProfile";
import { nhLoadouts } from "../src/sim/nh/loadouts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createContext(tick: number) {
  const state = createInitialNhDuelState(0x54524143);
  const equipment = nhLoadouts["noxious-halberd"].equipment;
  const gearProfile = inferNhSelectedGearProfile({
    equipment,
    inventoryItems: Object.values(equipment)
  });
  const self = {
    ...state.actors.self,
    tile: { x: 0, y: 0, plane: 0 },
    loadoutId: "noxious-halberd" as const,
    weaponId: "noxious_halberd" as const,
    previousWeaponId: "noxious_halberd" as const,
    equipment,
    gearProfile
  };
  const opponent = {
    ...state.actors.opponent,
    tile: { x: 4, y: 0, plane: 0 },
    observedInfoKnown: true,
    attackTimer: {
      ...state.actors.opponent.attackTimer,
      lastAttackTick: tick - 4,
      weaponCooldownTicks: 4
    }
  };
  return createNhDuelControllerContext(tick, self, opponent);
}

function assertFrozenTrace(trace: NhPolicyDecisionTrace): void {
  assert(Object.isFrozen(trace), "Trace object must be frozen.");
  assert(Object.isFrozen(trace.rawInput), "Raw input copy must be frozen.");
  assert(Object.isFrozen(trace.normalizedInput), "Normalized input copy must be frozen.");
  assert(Object.isFrozen(trace.attackHistoryCodes), "Attack history copy must be frozen.");
  assert(Object.isFrozen(trace.ownPrayerHistoryCodes), "Prayer history copy must be frozen.");
  assert(Object.isFrozen(trace.priorNormalizedInputsNewestFirst), "Prior history copy must be frozen.");
  assert(Object.isFrozen(trace.legalActions), "Legal-action copy must be frozen.");
  assert(Object.isFrozen(trace.finalScores), "Final score copy must be frozen.");
  for (const entry of trace.priorNormalizedInputsNewestFirst) {
    assert(Object.isFrozen(entry), "Each prior-history entry must be frozen.");
    assert(entry.normalizedInput === null || Object.isFrozen(entry.normalizedInput),
      "Each valid prior input must be frozen.");
  }
  for (const entry of trace.legalActions) {
    assert(Object.isFrozen(entry), "Each legal-action entry must be frozen.");
  }
}

const policy = parseNhNeuralPolicyJson(
  readFileSync("fixtures/ai/nh-neural-policy-dmm-current.json", "utf8"),
  "trace-test-policy"
);
const disabledController = createNhPolicyController(policy);
disabledController.chooseAction(createContext(19));
assert(disabledController.getLastDecisionTrace() === null,
  "Decision tracing must remain allocation-free and empty by default.");
const controller = createNhPolicyController(policy);
assert(controller.getLastDecisionTrace() === null, "Trace must be null before the first decision.");
controller.setDecisionTraceEnabled(true);

controller.chooseAction(createContext(20));
const first = controller.getLastDecisionTrace();
assert(first !== null, "Conditioned-v10 decision did not expose a trace.");
assert(first.tick === 20 && first.rewardEpisodeId === 0,
  "Trace must expose the exact decision tick and effective reward episode ID.");
assert(first.rawInput.length === 114, `Expected 114 raw inputs, got ${first.rawInput.length}.`);
assert(first.normalizedInput.length === 114,
  `Expected 114 normalized inputs, got ${first.normalizedInput.length}.`);
assert(first.attackHistoryCodes.length === 3, "Attack history must contain three codes.");
assert(first.ownPrayerHistoryCodes.length === 2, "Own-prayer history must contain two codes.");
assert(first.priorNormalizedInputsNewestFirst.length === 16,
  "Prior normalized input history must expose all 16 newest-first slots.");
assert(first.priorNormalizedInputHistoryLength === 0,
  "The first decision must not include its current input in prior history.");
assert(first.priorNormalizedInputsNewestFirst.every((entry) => !entry.valid && entry.normalizedInput === null),
  "Unused first-decision history slots must be invalid.");
assert(first.finalScores.length === 86, `Expected 86 final scores, got ${first.finalScores.length}.`);
assert(first.finalScores.every(Number.isFinite), "Final scores must all be finite.");
assert(first.legalActions.length > 0, "Trace must include the full non-empty legal action set.");
assert(first.legalActions.every(({ actionId, modelRow }) => policy.actionIds?.[modelRow] === actionId),
  "Legal action IDs must remain paired with their model rows.");
assert(policy.actionIds?.[first.selectedModelRow] === first.selectedActionId,
  "Selected action ID must map to the selected model row.");
const conditionedGearRanking = controller.getLastRankings().find(
  (ranking) => policy.directGearConditioning?.actionIds.includes(ranking.action)
);
assert(conditionedGearRanking !== undefined,
  "The fixture must expose a post-conditioning direct-gear ranking.");
const conditionedGearModelRow = policy.actionIds?.indexOf(conditionedGearRanking.action) ?? -1;
assert(conditionedGearModelRow >= 0,
  "The conditioned direct-gear ranking must map to a model row.");
assert(first.finalScores[conditionedGearModelRow] === conditionedGearRanking.score,
  "Trace score must equal the final post-conditioning direct-gear ranking score.");
assert(policy.directGearConditioning !== undefined,
  "The fixture must include direct-gear conditioning.");
const unconditionedController = createNhPolicyController({
  ...policy,
  directGearConditioning: {
    ...policy.directGearConditioning,
    active: false
  }
});
unconditionedController.setDecisionTraceEnabled(true);
unconditionedController.chooseAction(createContext(20));
const unconditionedTrace = unconditionedController.getLastDecisionTrace();
assert(unconditionedTrace !== null,
  "The unconditioned comparison decision must expose a trace.");
assert(first.finalScores[conditionedGearModelRow] !== unconditionedTrace.finalScores[conditionedGearModelRow],
  "The fixture gear row must prove that the final conditioning pass changed its trace score.");
for (let index = 0; index < first.rawInput.length; index += 1) {
  const divisor = Math.abs(policy.inputStd[index]) > 1e-8 ? policy.inputStd[index] : 1;
  const expected = Math.fround((first.rawInput[index] - policy.inputMean[index]) / divisor);
  assert(first.normalizedInput[index] === expected,
    `Normalized input ${index} does not match the raw observation copy.`);
}
assertFrozenTrace(first);

const preservedFirstTrace = JSON.stringify(first);
controller.chooseAction(createContext(21));
const second = controller.getLastDecisionTrace();
assert(second !== null && second !== first, "Each decision must publish a new trace snapshot.");
assert(second.priorNormalizedInputHistoryLength === 1,
  "The second decision must expose exactly one valid prior input.");
assert(second.priorNormalizedInputsNewestFirst[0].valid,
  "The newest prior input must be marked valid.");
assert(
  JSON.stringify(second.priorNormalizedInputsNewestFirst[0].normalizedInput) ===
    JSON.stringify(first.normalizedInput),
  "The newest prior input must be a copy of the prior decision's normalized observation."
);
assert(JSON.stringify(first) === preservedFirstTrace,
  "A later decision mutated the previous trace snapshot.");
assertFrozenTrace(second);
controller.setDecisionTraceEnabled(false);
assert(controller.getLastDecisionTrace() === null,
  "Disabling decision tracing must clear the retained snapshot.");

console.log(JSON.stringify({
  status: "ok",
  tick: first.tick,
  rewardEpisodeId: first.rewardEpisodeId,
  rawInputSize: first.rawInput.length,
  normalizedInputSize: first.normalizedInput.length,
  attackHistorySize: first.attackHistoryCodes.length,
  ownPrayerHistorySize: first.ownPrayerHistoryCodes.length,
  priorHistorySlots: first.priorNormalizedInputsNewestFirst.length,
  secondDecisionPriorHistoryLength: second.priorNormalizedInputHistoryLength,
  legalActions: first.legalActions.length,
  finalScores: first.finalScores.length,
  selectedActionId: first.selectedActionId,
  selectedModelRow: first.selectedModelRow,
  conditionedGearActionId: conditionedGearRanking.action,
  conditionedGearModelRow,
  conditionedGearFinalScoreMatched: true,
  conditionedGearScoreChanged: true,
  defaultTracingDisabled: true,
  disablingClearsTrace: true,
  deepCopyPreserved: true
}, null, 2));
