import { readFileSync } from "node:fs";
import path from "node:path";
import { loadTsModule, projectRoot } from "./lib/load-ts-module.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const botPolicy = loadTsModule("src/bot/policy.ts");
const nhDuel = loadTsModule("src/sim/nh/duel.ts");

// NH stake's shipped 90-input model uses the original Java action IDs. In the
// newer layout, 385 incorrectly becomes a magic attack with a different move.
const legacyNhActionIds = [392, 385, 0, 1155];
const legacyNhArtifact = {
  kind: "nh-neural-policy",
  version: 1,
  schema: { inputSize: 90, featureSize: 139, actionCount: 4, actionIds: legacyNhActionIds },
  source: { step: 0, metrics: {} },
  normalization: { mean: Array(90).fill(0), std: Array(90).fill(1) },
  model: {
    layers: [{ activation: "silu", weight: [Array(90).fill(0)], bias: [0] }],
    policy: { weight: legacyNhActionIds.map(() => [0]), bias: [30, 20, 10, -10] }
  }
};
const legacyNhPolicy = botPolicy.parseNhNeuralPolicyJson(JSON.stringify(legacyNhArtifact), "nh-stake-original-action-layout");
const legacyNhState = nhDuel.createInitialNhDuelState(123);
const legacyNhContext = nhDuel.createNhDuelControllerContext(20,
  { ...legacyNhState.actors.self, tile: { x: 0, y: 0, plane: 0 } },
  { ...legacyNhState.actors.opponent, tile: { x: 8, y: 0, plane: 0 } }
);
const legacyNhController = botPolicy.createNhPolicyController(legacyNhPolicy);
const legacyNhAction = legacyNhController.chooseAction(legacyNhContext);
assert(legacyNhController.policyDecoder === "nh-deployed-legacy", "NH stake must select its original controller mode.");
assert(
  legacyNhController.getLastRankings()[0].action === 385 &&
    legacyNhAction.offenceStyle === "ranged" &&
    legacyNhAction.defencePrayer === "protect_from_magic" &&
    legacyNhAction.movementIntent === "pressure" &&
    legacyNhAction.attackIntent === "attack" &&
    legacyNhAction.equipmentIntent === "style_loadout",
  `Distant NH stake ranged action was misdecoded: ${JSON.stringify(legacyNhAction)}`
);
const legacyNhFrozenContext = nhDuel.createNhDuelControllerContext(20,
  { ...legacyNhContext.self, locks: { ...legacyNhContext.self.locks, freezeUntilTick: 50 } },
  { ...legacyNhContext.opponent, locks: { ...legacyNhContext.opponent.locks, freezeUntilTick: 50 } }
);
const legacyNhFrozenAction = botPolicy.createNhPolicyController(legacyNhPolicy).chooseAction(legacyNhFrozenContext);
assert(
  legacyNhFrozenAction.offenceStyle === "ranged" && legacyNhFrozenAction.movementIntent === "pressure",
  "Frozen NH stake must retain legal ranged attacks and reject stand-under movement."
);
const legacyNhFeaturesModule = loadTsModule("src/sim/nh/policy-features.ts");
for (const distance of [0, 1, 8]) {
  const context = nhDuel.createNhDuelControllerContext(20,
    legacyNhContext.self,
    {
      ...legacyNhContext.opponent,
      tile: { x: distance, y: 0, plane: 0 },
      locks: { ...legacyNhContext.opponent.locks, freezeUntilTick: 50 }
    }
  );
  const controller = botPolicy.createNhPolicyController(legacyNhPolicy);
  const action = controller.chooseAction(context);
  assert(action.movementIntent === (distance === 0 ? "pressure" : "stand_under"),
    `Stand-under must be available only when it can move onto the frozen target (distance ${distance}).`);
}
const legacyNhFeatures = legacyNhFeaturesModule.encodeNhPolicyFeatures(
  legacyNhContext, legacyNhFeaturesModule.createNhPolicyFeatureState()
);
const legacyNhCandidate = botPolicy.rankNhNeuralPolicyCandidateActionsFromFeatures(
  legacyNhPolicy, legacyNhFeatures, [385, 0], 1, legacyNhContext
)[0];
assert(
  legacyNhCandidate.action === 385 && legacyNhCandidate.decoded.offenceStyle === "ranged",
  "Candidate ranking must use the same original NH action decoder."
);
const legacyNhSpecFeatures = [...legacyNhFeatures];
for (const index of [10, 11, 73, 74, 75, 76]) {
  legacyNhSpecFeatures[legacyNhFeaturesModule.nhPolicyInputFeatureStart + index] = 1;
}
const legacyNhSpec = botPolicy.rankNhNeuralPolicyCandidateActionsFromFeatures(
  legacyNhPolicy, legacyNhSpecFeatures, [1155], 1
)[0];
assert(
  legacyNhSpec.action === 1155 && legacyNhSpec.decoded.specIntent === "use_special",
  "Original NH special actions must remain available when their source gates allow them."
);

for (const [index, scale] of [[20, 12], [21, 30], [22, 120]]) {
  const artifact = JSON.parse(JSON.stringify(legacyNhArtifact));
  artifact.model.layers[0].weight[0][index] = 1;
  artifact.model.policy.weight[1][0] = 1;
  const policy = botPolicy.parseNhNeuralPolicyJson(JSON.stringify(artifact), `nh-reward-input-${index}`);
  for (const multiple of [-2, -0.5, 0.5, 2]) {
    const features = [...legacyNhFeatures];
    features[legacyNhFeaturesModule.nhPolicyInputFeatureStart + index] = scale * multiple;
    const ranking = botPolicy.rankNhNeuralPolicyCandidateActionsFromFeatures(policy, features, [385], 1)[0];
    const raw = Math.max(-1, Math.min(1, multiple));
    const expectedScore = 20 + raw / (1 + Math.exp(-raw));
    assert(Math.abs(ranking.score - expectedScore) < 1e-6, `NH reward input ${index} lost its original scale/clamp.`);
  }
}

// Standalone Node checks only: this script is never imported by the trainer.
const runtimeCombat = loadTsModule("src/sim/runtimePlayerCombat.ts");
const runtimeOpponent = loadTsModule("src/sim/nh/runtime-policy-opponent.ts");
const pressureState = {
  ...runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 4, z: 0 },
    opponentTile: { x: 0, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "acb-hides",
    localPrayers: ["protect_from_magic", "rigour"],
    seed: 321
  }),
  tick: 97
};
const holdAction = {
  offenceStyle: "ranged", defencePrayer: "protect_from_magic", movementIntent: "pressure",
  supplyIntent: "none", specIntent: "none", attackIntent: "hold", equipmentIntent: "weapon_only"
};
function applyPolicy(state, controller, options = {}) {
  return runtimeOpponent.applyRuntimeOpponentPolicyAction({
    state, controller, localActor: state.actors["local-player"], opponentActor: state.actors.opponent,
    tileScale: 0.5, ...options
  });
}
function fixedController(action) {
  return { id: "test:nh-stake", policyDecoder: "nh-deployed-legacy", chooseAction: () => action };
}
for (const offenceStyle of ["magic", "ranged", "melee"]) {
  const result = applyPolicy(pressureState, fixedController({ ...holdAction, offenceStyle }));
  assert(result.opponentTile.x === 0.5 && result.opponentMovedThisTick,
    `${offenceStyle} PRESSURE + HOLD must approach instead of stalling.`);
  assert(result.state.actors.opponent.targetId === null, "Approaching must not override a held attack.");
}
const frozenPressureState = {
  ...pressureState,
  actors: {
    ...pressureState.actors,
    opponent: {
      ...pressureState.actors.opponent,
      locks: { ...pressureState.actors.opponent.locks, freezeUntilTick: 120 }
    }
  }
};
const frozenPressure = applyPolicy(frozenPressureState, fixedController(holdAction));
assert(!frozenPressure.opponentMovedThisTick && frozenPressure.movementBlockedReason === "movement-gated",
  "Pressure must continue to respect freeze locks.");
const blockedPressure = applyPolicy(pressureState, fixedController(holdAction), { canStep: () => false });
assert(!blockedPressure.opponentMovedThisTick && blockedPressure.movementBlockedReason === "collision",
  "Pressure must continue to respect collision checks.");
let requestedRouteDistance = null;
const routedPressure = applyPolicy(pressureState, fixedController(holdAction), {
  targetRouteStep: (from, target, distance) => {
    requestedRouteDistance = distance;
    return { x: 0.5, z: 0.5 };
  }
});
assert(requestedRouteDistance === 1 && routedPressure.opponentTile.z === 0.5,
  "Pressure must use the scene's legal target route, stopping beside the opponent.");
const noRoutePressure = applyPolicy(pressureState, fixedController(holdAction), { targetRouteStep: () => null });
assert(!noRoutePressure.opponentMovedThisTick, "Pressure must not bypass a blocked scene route.");
const noMovement = applyPolicy(pressureState, fixedController({ ...holdAction, movementIntent: "none" }));
assert(!noMovement.opponentMovedThisTick, "An explicit no-movement action must remain stationary.");

// Use the shipped NH model without exploration or replacing any model files.
// Before the fix this seeded fight stopped attacking at tick 121, repeatedly
// choosing PRESSURE + HOLD at eight tiles while the player kept attacking.
const shippedPolicy = botPolicy.parseNhNeuralPolicyJson(
  readFileSync(path.join(projectRoot, "fixtures/ai/nh-neural-policy-hard.json"), "utf8"),
  "nh-stake-counterattack-regression"
);
const shippedController = botPolicy.createNhPolicyController(shippedPolicy);
let fight = {
  ...pressureState,
  actors: {
    ...pressureState.actors,
    "local-player": { ...pressureState.actors["local-player"], hitpoints: 62 }
  }
};
let heldPressureTick = null;
let resumedAttackTick = null;
for (let i = 0; i < 40; i += 1) {
  fight = runtimeCombat.requestRuntimePlayerCombatAttack(fight, "local-player", "opponent");
  const result = applyPolicy(fight, shippedController);
  if (result.effectiveAction.movementIntent === "pressure" && result.effectiveAction.attackIntent === "hold") {
    heldPressureTick ??= fight.tick;
    assert(result.opponentMovedThisTick, "The shipped NH policy must execute its held-attack approach.");
  }
  const tick = fight.tick;
  fight = runtimeCombat.advanceRuntimePlayerCombat(result.state, {
    tiles: { "local-player": result.state.actors["local-player"].tile, opponent: result.opponentTile },
    tileScale: 0.5
  }).state;
  if (heldPressureTick !== null && fight.events.some(event =>
    event.kind === "attack" && event.attackerId === "opponent" && event.tick === tick
  )) {
    resumedAttackTick = tick;
    break;
  }
}
assert(heldPressureTick !== null, "The regression scenario must reach the reported held-attack approach.");
assert(resumedAttackTick !== null && resumedAttackTick - heldPressureTick <= 8,
  "The shipped NH policy must resume attacking after closing the distance.");

console.log(JSON.stringify({
  status: "ok", nhStakeOriginalActionLayout: true, frozenRangedAttack: true, candidateRanking: true,
  legacySpecials: true, legacyRewardInputScales: true, pressureApproach: true, movementGates: true,
  shippedModelCounterattack: { heldPressureTick, resumedAttackTick }
}, null, 2));
