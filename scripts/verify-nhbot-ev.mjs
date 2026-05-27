import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const moduleCache = new Map();
const serverRoot = path.resolve(
  projectRoot,
  "..",
  "nh-osrs-184-master",
  "nh-osrs-184-master",
  "Nh-master",
  "nh-server",
  "src",
  "main",
  "java",
  "io",
  "ruin"
);

const botSource = readFileSync(
  path.join(serverRoot, "model", "entity", "player", "ai", "scripts", "NhStakerBot.java"),
  "utf8"
);
const loadoutSource = readFileSync(
  path.join(serverRoot, "model", "entity", "player", "ai", "NhStakerLoadout.java"),
  "utf8"
);
const combatUtilsSource = readFileSync(path.join(serverRoot, "model", "combat", "CombatUtils.java"), "utf8");
const prayerSource = readFileSync(path.join(serverRoot, "model", "skills", "prayer", "Prayer.java"), "utf8");

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
  vm.runInNewContext(transpiled, { module, exports: module.exports, require: localRequire, console }, { filename: resolved });
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
      // try next
    }
  }
  return candidates[0];
}

function snippetBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(startIndex !== -1, `missing start marker: ${start}`);
  assert(endIndex !== -1, `missing end marker after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
}

const decideOffence = snippetBetween(
  botSource,
  "private OffenceStyle decideOffenceStyle(Player opponent)",
  "private void applyDefencePrayer(Player opponent)"
);
assert(
  decideOffence.indexOf("bestExpectedOffenceStyle(opponent, wantsFreeze)") <
    decideOffence.indexOf("counterFromProtectionMask(protectionMask, wantsFreeze)"),
  "scripted offence selection should score expected style EV before falling back to simple prayer counters"
);

const contextGuards = snippetBetween(
  botSource,
  "private CombatDecision applyContextGuards(Player opponent, CombatDecision decision)",
  "private String appendGuardDetails"
);
for (const snippet of [
  "bestExpectedOffenceStyle(opponent, wantsFreeze)",
  "expectedOffenceStyleEv(opponent, style, wantsFreeze",
  "CLIENT_STYLE_EV_GUARD_MARGIN",
  "style = evStyle",
  "offence = offencePrayerFor(style)"
]) {
  assert(contextGuards.includes(snippet), `policy guard no longer preserves EV style override: ${snippet}`);
}

const clientOffenceEv = snippetBetween(
  botSource,
  "private double clientOffenceEv(Player opponent,",
  "private double clientStyleBaseHit(OffenceStyle style,"
);
for (const snippet of [
  "expectedBonusesForStyle(style)",
  "clientStyleAccuracyFactor(style, expectedBonuses)",
  "clientStyleTankFactor(opponent, expectedBonuses)",
  "isStyleProtectedByMask(style, delayed.protectionMask)"
]) {
  assert(clientOffenceEv.includes(snippet), `client offence EV no longer uses source-backed gear/prayer context: ${snippet}`);
}

const expectedBonuses = snippetBetween(
  botSource,
  "private int[] expectedBonusesForStyle(OffenceStyle style)",
  "private int bonusAt(int[] bonuses, int index)"
);
for (const snippet of [
  "replaceExpectedBonusSlot(expected, Equipment.SLOT_WEAPON, magicWeaponId)",
  "replaceExpectedBonusSlot(expected, Equipment.SLOT_WEAPON, rangedWeaponId)",
  "replaceExpectedBonusSlot(expected, Equipment.SLOT_AMMO, rangedAmmoId)",
  "replaceExpectedBonusSlot(expected, Equipment.SLOT_WEAPON, meleeWeaponId)",
  "replaceExpectedBonusSlot(expected, Equipment.SLOT_CHEST, rangedChestId)",
  "replaceExpectedBonusSlot(expected, Equipment.SLOT_CHEST, meleeChestId)",
  "ItemDef.get(itemId)",
  "def.equipBonuses"
]) {
  assert(expectedBonuses.includes(snippet), `expected style bonuses no longer use selected gear bonuses: ${snippet}`);
}

for (const snippet of [
  "pickOwnedBestForSlot(player, Equipment.SLOT_CHEST, STYLE_RANGED, KARILS_LEATHERTOP)",
  "pickOwnedBestForSlot(player, Equipment.SLOT_LEGS, STYLE_RANGED, VERACS_PLATESKIRT)",
  "pickOwnedBestForSlot(player, Equipment.SLOT_CHEST, STYLE_MELEE, KARILS_LEATHERTOP)",
  "pickOwnedBestForSlot(player, Equipment.SLOT_LEGS, STYLE_MELEE, VERACS_PLATESKIRT)",
  "return new SelectedWeapons(magicWeaponId, rangedWeaponId, rangedAmmoId, meleeWeaponId"
]) {
  assert(loadoutSource.includes(snippet), `NhStakerLoadout selected-gear contract changed: ${snippet}`);
}

assert(
  combatUtilsSource.includes("return (int) (1.3 + (effectiveStrength / 10d) + (bonus / 80d) + ((effectiveStrength * bonus) / 640d));"),
  "CombatUtils max-damage source no longer matches the EV max-hit approximation anchor"
);
assert(
  prayerSource.includes("p.rangedStrengthBoost = 0.23;") &&
    prayerSource.includes("p.strengthBoost = 0.23;"),
  "Prayer source no longer matches the EV offensive-prayer boost anchors"
);

const runtimeCombat = loadTsModule("src/sim/runtimePlayerCombat.ts");
const runtimePolicy = loadTsModule("src/sim/nh/runtime-policy-opponent.ts");
const canonicalGear = loadTsModule("src/sim/nh/canonicalGear.ts");
const botPolicy = loadTsModule("src/bot/policy.ts");
const policyFeatures = loadTsModule("src/sim/nh/policy-features.ts");
const policyBridge = loadTsModule("src/sim/nh/policy-bridge.ts");
const duel = loadTsModule("src/sim/nh/duel.ts");

const evGuardSource = readFileSync(path.join(projectRoot, "src", "sim", "nh", "runtime-policy-opponent.ts"), "utf8");
for (const snippet of [
  'import { nhClientOffenceEv, nhStyleInOffensiveRange, nhWeaknessForStyle } from "./clientOffenceEv";',
  "return nhClientOffenceEv(context, style, stats, actor);",
  "return nhStyleInOffensiveRange(context, style);",
  "return nhWeaknessForStyle(bonuses, style);",
  "bestEv >= currentEv + runtimePolicyClientStyleEvGuardMargin"
]) {
  assert(evGuardSource.includes(snippet), `runtime EV guard no longer mirrors Java gear-bonus scoring: ${snippet}`);
}

const policySource = readFileSync(path.join(projectRoot, "src", "bot", "policy.ts"), "utf8");
for (const snippet of [
  "Source: NhStakerSelfPlayManager.visibleStyleEv() is the policy-bridge prior.",
  "The fuller NhStakerBot.clientOffenceEv() remains in runtime context guards.",
  "const weakness = opponentWeaknessForStyle(context, style);",
  "const baseHit = style === \"magic\" ? 31 : style === \"ranged\" ? 41 : 42;",
  "return (baseHit / 42) * defenceFactor * prayerFactor * rangeFactor * statFactor * koPressure;"
]) {
  assert(policySource.includes(snippet), `policy bridge prior no longer mirrors Java NhStakerSelfPlayManager.visibleStyleEv(): ${snippet}`);
}

const clientEvSource = readFileSync(path.join(projectRoot, "src", "sim", "nh", "clientOffenceEv.ts"), "utf8");
for (const snippet of [
  "Source: NhStakerBot.clientOffenceEv()",
  "const baseHit = nhClientStyleBaseHit(style, stats, expectedBonuses);",
  "const accuracyFactor = nhClientStyleAccuracyFactor(style, expectedBonuses);",
  "const tankFactor = nhClientStyleTankFactor(context, expectedBonuses);",
  "for (const slot of actor.strippedEquipmentSlots)",
  "return (baseHit / 42) * defenceFactor * prayerFactor * statFactor * accuracyFactor * tankFactor;"
]) {
  assert(clientEvSource.includes(snippet), `shared TS client EV helper no longer mirrors Java scoring: ${snippet}`);
}

const forcedMagicController = {
  id: "verify-nhbot-ev-forced-magic",
  chooseAction: () => ({
    offenceStyle: "magic",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const candidateGearEvState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes",
  seed: 2609
});
const candidateGearEv = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: candidateGearEvState,
  controller: forcedMagicController,
  localActor: {
    tile: candidateGearEvState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    equipment: canonicalGear.canonicalNhLoadoutEquipment["acb-hides"],
    activePrayers: ["protect_from_magic"]
  },
  opponentActor: {
    tile: candidateGearEvState.actors.opponent.tile,
    loadoutId: "kodai-robes",
    equipment: canonicalGear.canonicalNhLoadoutEquipment["kodai-robes"]
  }
});
assert(
  candidateGearEv.effectiveAction.offenceStyle === "ranged",
  `TS runtime EV guard should override protected mage to ranged using candidate selected gear, got ${candidateGearEv.effectiveAction.offenceStyle}`
);
assert(
  candidateGearEv.state.actors.opponent.equipment.weapon?.itemId === 11785,
  `TS runtime EV guard should equip the selected ranged weapon after the EV override, got ${JSON.stringify(candidateGearEv.state.actors.opponent.equipment.weapon)}`
);

const emptyPolicy = {
  version: 1,
  counters: { decisions: 0, samples: 0, exploration: 0 },
  actionVisits: [],
  weightsByAction: new Map(),
  weightEntryCount: 0,
  sourceLabel: "verify-empty-policy"
};
const policyPriorState = duel.createInitialNhDuelState(26091);
const strongPolicySelf = {
  ...policyPriorState.actors.self,
  tile: { x: 0, y: 0, plane: 0 },
  activePrayers: ["rigour"],
  candidateEquipmentByStyle: {
    magic: canonicalGear.canonicalNhLoadoutEquipment["kodai-robes"],
    ranged: canonicalGear.canonicalNhLoadoutEquipment["acb-hides"],
    slash: canonicalGear.canonicalNhLoadoutEquipment["tentacle-bandos"]
  }
};
const policyOpponent = {
  ...policyPriorState.actors.opponent,
  tile: { x: 5, y: 0, plane: 0 },
  equipment: canonicalGear.canonicalNhLoadoutEquipment["kodai-robes"],
  activePrayers: ["protect_from_magic"],
  lastOffenceStyle: "magic",
  lastVisibleOpponentStyle: "magic"
};
const strongPolicyContext = duel.createNhDuelControllerContext(0, strongPolicySelf, policyOpponent, {
  rewardEpisodeActive: true,
  rewardEpisodeId: 1
});
const weakRangedContext = {
  ...strongPolicyContext,
  self: {
    ...strongPolicyContext.self,
    candidateEquipmentByStyle: {
      ...strongPolicyContext.self.candidateEquipmentByStyle,
      ranged: {}
    }
  }
};
const policyFeaturesForContext = policyFeatures.encodeNhPolicyFeatures(strongPolicyContext);
function policyStyleScore(context, style) {
  const rankings = botPolicy.rankNhPolicyActionsFromFeatures(
    emptyPolicy,
    policyFeaturesForContext,
    policyBridge.nhPolicyActionCount,
    context,
    [],
    () => false
  );
  const matching = rankings.filter(
    (entry) =>
      entry.decoded.offenceStyle === style &&
      entry.decoded.supplyIntent === "none" &&
      entry.decoded.specIntent === "none" &&
      entry.decoded.movementIntent === "pressure"
  );
  assert(matching.length > 0, `missing policy ranking for ${style} pressure action`);
  return Math.max(...matching.map((entry) => entry.score));
}
const strongRangedPolicyScore = policyStyleScore(strongPolicyContext, "ranged");
const weakRangedPolicyScore = policyStyleScore(weakRangedContext, "ranged");
assert(
  Math.abs(strongRangedPolicyScore - weakRangedPolicyScore) < 1e-9,
  `policy bridge prior should match NhStakerSelfPlayManager and ignore runtime candidate-gear scoring; strong=${strongRangedPolicyScore} weak=${weakRangedPolicyScore}`
);

console.log("verify-nhbot-ev passed");
