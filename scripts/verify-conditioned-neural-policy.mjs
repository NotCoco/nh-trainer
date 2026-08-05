import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadTsModule(relativePath) {
  return loadAbsoluteModule(path.resolve(projectRoot, relativePath));
}

function loadAbsoluteModule(sourcePath) {
  const resolved = path.normalize(sourcePath);
  const cached = moduleCache.get(resolved);
  if (cached) {
    return cached.exports;
  }
  if (resolved.endsWith(".json")) {
    const module = { exports: JSON.parse(readFileSync(resolved, "utf8")) };
    moduleCache.set(resolved, module);
    return module.exports;
  }
  const source = readFileSync(resolved, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true,
      jsx: ts.JsxEmit.ReactJSX,
      resolveJsonModule: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true
    },
    fileName: resolved
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(resolved, module);
  const localRequire = (request) => {
    if (request.startsWith(".")) {
      return loadAbsoluteModule(resolveRelativeModule(resolved, request));
    }
    return require(request);
  };
  vm.runInNewContext(
    transpiled,
    { module, exports: module.exports, require: localRequire, console },
    { filename: resolved }
  );
  return module.exports;
}

function resolveRelativeModule(parentPath, request) {
  const requested = path.resolve(path.dirname(parentPath), request);
  const candidates = requested.endsWith(".ts") || requested.endsWith(".json")
    ? [requested]
    : [`${requested}.ts`, `${requested}.tsx`, `${requested}.json`, path.join(requested, "index.ts")];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Try the next supported source extension.
    }
  }
  return candidates[0];
}

const botPolicy = loadTsModule("src/bot/policy.ts");
const nhDuel = loadTsModule("src/sim/nh/duel.ts");
const nhGearProfile = loadTsModule("src/sim/nh/gearProfile.ts");
const nhLoadouts = loadTsModule("src/sim/nh/loadouts.ts");
const nhPolicyBridge = loadTsModule("src/sim/nh/policy-bridge.ts");
const { canonicalNhGear } = loadTsModule("src/sim/nh/canonicalGear.ts");

const actionIds = nhPolicyBridge.dmmCurrentActionVectorActionIds();
const attackIds = nhPolicyBridge.dmmCanonicalAttackActionIds();
const specIds = nhPolicyBridge.dmmCanonicalSpecActionIds();
const defenceIds = nhPolicyBridge.dmmCanonicalDefenceActionIds();
const movementIds = nhPolicyBridge.dmmCanonicalMovementActionIds();
const supplyIds = nhPolicyBridge.dmmCanonicalSupplyActionIds();

function findAction(ids, predicate, label) {
  const actionId = ids.find((id) => predicate(nhPolicyBridge.decodeNhPolicyAction(id), id));
  assert(actionId !== undefined, `Missing action for ${label}.`);
  return actionId;
}

function directGearId(action) {
  return findAction(
    actionIds,
    (decoded, actionId) =>
      nhPolicyBridge.isNhDirectGearActionId(actionId) && decoded.directGearActions?.[0] === action,
    action
  );
}

const conditioningActionIds = [
  directGearId("equip_dmm_virtus_robe_top"),
  directGearId("equip_dmm_masori_body"),
  directGearId("unequip_body"),
  directGearId("equip_dmm_virtus_robe_bottom"),
  directGearId("equip_dmm_torva_platelegs"),
  directGearId("unequip_legs")
];
const magicAttackId = findAction(
  attackIds,
  (action) => action.offenceStyle === "magic" && action.attackIntent === "attack",
  "magic attack"
);
const noSpecId = findAction(specIds, (action) => action.specIntent === "none", "no spec");
const defenceId = defenceIds[0];
const movementId = findAction(movementIds, (action) => action.movementIntent === "none", "no movement");
const supplyId = findAction(supplyIds, (action) => action.supplyIntent === "none", "no supply");
const unrelatedGearId = directGearId("equip_dmm_torva_full_helm");
const exactZeroGearId = directGearId("unequip_shield");

function createArtifact({ conditioned, weight, scoreOverrides = [] }) {
  const inputSize = conditioned ? nhPolicyBridge.nhPolicyInputSize + 1 : nhPolicyBridge.nhPolicyInputSize;
  const featureSize = conditioned ? nhPolicyBridge.nhPolicyFeatureSize + 1 : nhPolicyBridge.nhPolicyFeatureSize;
  const scoreByAction = new Map([
    [magicAttackId, 12],
    [noSpecId, 11],
    [defenceId, 10],
    [movementId, 9],
    [supplyId, 8],
    [conditioningActionIds[0], 0.4],
    [conditioningActionIds[1], 0.5],
    [conditioningActionIds[2], -1],
    [conditioningActionIds[3], 0.4],
    [conditioningActionIds[4], 0.5],
    [conditioningActionIds[5], -1],
    [unrelatedGearId, 0.7],
    [exactZeroGearId, 0]
  ]);
  for (const [actionId, score] of scoreOverrides) {
    scoreByAction.set(actionId, score);
  }
  const mean = Array(inputSize).fill(0);
  const std = Array(inputSize).fill(1);
  const model = {
    layers: [
      {
        activation: "silu",
        weight: [Array(inputSize).fill(0)],
        bias: [0]
      }
    ],
    policy: {
      weight: actionIds.map(() => [0]),
      bias: actionIds.map((actionId, index) => scoreByAction.get(actionId) ?? (-100 - index * 0.001))
    }
  };
  const artifact = {
    kind: conditioned ? "nh-neural-policy-conditioned" : "nh-neural-policy",
    version: conditioned ? 2 : 1,
    schema: {
      inputSize,
      featureSize,
      actionCount: actionIds.length,
      actionIds
    },
    source: { step: 0, metrics: {} },
    normalization: { mean, std },
    model
  };
  if (conditioned) {
    artifact.directGearConditioning = {
      kind: "dmm-body-legs-combat-age-residual",
      version: 1,
      combatSource: "greedyCombat",
      ageInputIndex: 110,
      ageNormalizerTicks: 8,
      styles: ["hold", "magic", "ranged", "melee"],
      featureOrder: [
        "hold",
        "magic",
        "ranged",
        "melee",
        "hold_x_age",
        "magic_x_age",
        "ranged_x_age",
        "melee_x_age"
      ],
      actionIds: conditioningActionIds,
      weight
    };
  }
  return artifact;
}

const equipment = nhLoadouts.nhLoadouts["noxious-halberd"].equipment;
const gearProfile = nhGearProfile.inferNhSelectedGearProfile({
  equipment,
  inventoryItems: Object.values(equipment)
});

function createContext(opponentAttackAgeTicks) {
  const tick = 20;
  const state = nhDuel.createInitialNhDuelState(0x434f4e44);
  const self = {
    ...state.actors.self,
    tile: { x: 0, y: 0, plane: 0 },
    loadoutId: "noxious-halberd",
    weaponId: "noxious_halberd",
    previousWeaponId: "noxious_halberd",
    equipment,
    gearProfile
  };
  const opponent = {
    ...state.actors.opponent,
    tile: { x: 4, y: 0, plane: 0 },
    observedInfoKnown: true,
    attackTimer: {
      ...state.actors.opponent.attackTimer,
      lastAttackTick: tick - opponentAttackAgeTicks,
      weaponCooldownTicks: 4
    }
  };
  return nhDuel.createNhDuelControllerContext(tick, self, opponent);
}

function parseArtifact(artifact, label) {
  return botPolicy.parseNhNeuralPolicyJson(JSON.stringify(artifact), label);
}

function choose(artifact, attackAgeTicks, label) {
  return chooseInContext(artifact, createContext(attackAgeTicks), label);
}

function chooseInContext(artifact, context, label) {
  const parsed = parseArtifact(artifact, label);
  botPolicy.assertNhNeuralPolicyHasCurrentDmmActionSurface(parsed, label);
  return botPolicy.createNhPolicyController(parsed).chooseAction(context);
}

function assertThrows(mutator, expectedText, label) {
  const artifact = structuredClone(zeroConditionedArtifact);
  mutator(artifact);
  let message = "";
  try {
    parseArtifact(artifact, label);
  } catch (error) {
    message = String(error?.message ?? error);
  }
  assert(message.includes(expectedText), `${label} did not fail closed as expected: ${message}`);
}

const zeroWeight = Array.from({ length: 6 }, () => Array(8).fill(0));
const legacyArtifact = createArtifact({ conditioned: false });
const zeroConditionedArtifact = createArtifact({ conditioned: true, weight: zeroWeight });
const legacyAction = choose(legacyArtifact, 4, "legacy-v1");
const zeroConditionedAction = choose(zeroConditionedArtifact, 4, "conditioned-v2-zero");
assert(
  JSON.stringify(zeroConditionedAction) === JSON.stringify(legacyAction),
  `Zero conditioning changed the legacy decision: ${JSON.stringify({ legacyAction, zeroConditionedAction })}`
);

const learnedWeight = Array.from({ length: 6 }, () => Array(8).fill(0));
learnedWeight[0][5] = 0.3;
const learnedArtifact = createArtifact({ conditioned: true, weight: learnedWeight });
const neutralAgeAction = choose(learnedArtifact, 2, "conditioned-v2-neutral-age");
const higherAgeAction = choose(learnedArtifact, 4, "conditioned-v2-higher-age");
assert(
  neutralAgeAction.directGearActions.includes("equip_dmm_masori_body"),
  `Raw attack age 0.25 should preserve the base body choice: ${JSON.stringify(neutralAgeAction)}`
);
assert(
  higherAgeAction.directGearActions.includes("equip_dmm_virtus_robe_top"),
  `Raw attack age 0.5 should apply the learned Virtus-top residual: ${JSON.stringify(higherAgeAction)}`
);
assert(
  higherAgeAction.directGearActions.includes("equip_dmm_torva_platelegs") &&
    higherAgeAction.directGearActions.includes("equip_dmm_torva_full_helm"),
  `Conditioning must not alter unrelated legs/head scores: ${JSON.stringify(higherAgeAction)}`
);
assert(
  !higherAgeAction.directGearActions.includes("unequip_shield"),
  `An exact-zero direct-gear score must not be selected: ${JSON.stringify(higherAgeAction)}`
);

const alreadyEquippedContext = createContext(2);
const alreadyEquippedBodyLegsAction = chooseInContext(
  learnedArtifact,
  {
    ...alreadyEquippedContext,
    self: {
      ...alreadyEquippedContext.self,
      equipment: {
        ...alreadyEquippedContext.self.equipment,
        body: canonicalNhGear.masoriBodyF,
        legs: canonicalNhGear.torvaPlatelegs
      }
    }
  },
  "conditioned-v2-already-equipped-body-legs"
);
assert(
  alreadyEquippedBodyLegsAction.directGearActions.includes("equip_dmm_virtus_robe_top") &&
    alreadyEquippedBodyLegsAction.directGearActions.includes("equip_dmm_virtus_robe_bottom") &&
    !alreadyEquippedBodyLegsAction.directGearActions.includes("equip_dmm_masori_body") &&
    !alreadyEquippedBodyLegsAction.directGearActions.includes("equip_dmm_torva_platelegs"),
  `Already-equipped body/legs no-ops must not suppress useful second-best switches: ${JSON.stringify(alreadyEquippedBodyLegsAction)}`
);

const emptySlotArtifact = createArtifact({
  conditioned: true,
  weight: learnedWeight,
  scoreOverrides: [
    [conditioningActionIds[2], 0.9],
    [conditioningActionIds[5], 0.9]
  ]
});
const emptySlotContext = createContext(2);
const { body: _emptyBody, ...equipmentWithoutBody } = emptySlotContext.self.equipment;
const emptySlotAction = chooseInContext(
  emptySlotArtifact,
  {
    ...emptySlotContext,
    self: {
      ...emptySlotContext.self,
      equipment: equipmentWithoutBody,
      strippedEquipmentSlots: ["legs"]
    }
  },
  "conditioned-v2-empty-body-stripped-legs"
);
assert(
  emptySlotAction.directGearActions.includes("equip_dmm_masori_body") &&
    emptySlotAction.directGearActions.includes("equip_dmm_torva_platelegs") &&
    !emptySlotAction.directGearActions.includes("unequip_body") &&
    !emptySlotAction.directGearActions.includes("unequip_legs"),
  `Unequip no-ops on empty or stripped slots must not suppress useful equips: ${JSON.stringify(emptySlotAction)}`
);
assert(
  higherAgeAction.offenceStyle === legacyAction.offenceStyle &&
    higherAgeAction.attackIntent === legacyAction.attackIntent &&
    higherAgeAction.specIntent === legacyAction.specIntent &&
    higherAgeAction.defencePrayer === legacyAction.defencePrayer &&
    higherAgeAction.movementIntent === legacyAction.movementIntent &&
    higherAgeAction.supplyIntent === legacyAction.supplyIntent,
  "Direct-gear conditioning changed a non-gear policy channel."
);

assertThrows((artifact) => delete artifact.directGearConditioning, "must be an object", "missing-conditioning");
assertThrows((artifact) => artifact.version = 1, "version must be 2", "wrong-version");
assertThrows(
  (artifact) => artifact.directGearConditioning.version = 2,
  ".version must be 1",
  "wrong-conditioning-version"
);
assertThrows(
  (artifact) => artifact.directGearConditioning.combatSource = "sampledCombat",
  ".combatSource must be greedyCombat",
  "wrong-combat-source"
);
assertThrows(
  (artifact) => artifact.directGearConditioning.ageInputIndex = 109,
  "must be current raw state input 110",
  "wrong-age-input"
);
assertThrows(
  (artifact) => artifact.directGearConditioning.ageNormalizerTicks = 4,
  ".ageNormalizerTicks must be 8",
  "wrong-age-normalizer"
);
assertThrows(
  (artifact) => artifact.directGearConditioning.styles = ["magic", "hold", "ranged", "melee"],
  "must be hold,magic,ranged,melee",
  "wrong-style-order"
);
assertThrows(
  (artifact) => artifact.directGearConditioning.featureOrder[4] = "age_x_hold",
  ".featureOrder must match",
  "wrong-feature-order"
);
assertThrows(
  (artifact) => artifact.directGearConditioning.actionIds[5] = artifact.directGearConditioning.actionIds[0],
  "must be a unique mapped policy action",
  "duplicate-action"
);
assertThrows(
  (artifact) => artifact.directGearConditioning.weight[0] = [0],
  "must have 8 entries",
  "wrong-weight-shape"
);

console.log(JSON.stringify({
  status: "ok",
  legacyVersion: parseArtifact(legacyArtifact, "legacy-final").version,
  zeroResidualIdentical: true,
  rawAgeResidualApplied: true,
  exactZeroDirectGearRejected: true,
  alreadyEquippedBodyLegsFiltered: true,
  emptySlotUnequipFiltered: true,
  malformedArtifactsRejected: 10
}, null, 2));
