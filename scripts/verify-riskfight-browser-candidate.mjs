import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { BrowserRiskFight, comboRewardContract, healingSupplyHitpoints, riskFightComboWindow,
  riskFightTerminalCredit, vengeanceStackDamage } from "./riskfight-training-bridge.mjs";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const moduleCache = new Map();
const tileScale = 128;

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
  const candidates = requested.endsWith(".ts") || requested.endsWith(".tsx") || requested.endsWith(".json")
    ? [requested]
    : [`${requested}.ts`, `${requested}.tsx`, `${requested}.json`, path.join(requested, "index.ts")];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function fileSha256(sourcePath) {
  return createHash("sha256").update(readFileSync(sourcePath)).digest("hex").toUpperCase();
}

function maxAbsoluteDifference(actual, expected) {
  assert(actual.length === expected.length, `vector length ${actual.length} != ${expected.length}`);
  let maximum = 0;
  for (let index = 0; index < actual.length; index += 1) {
    maximum = Math.max(maximum, Math.abs(actual[index] - expected[index]));
  }
  return maximum;
}

function assertVectorClose(label, actual, expected, tolerance = 3e-4) {
  const maximum = maxAbsoluteDifference(actual, expected);
  assert(maximum <= tolerance, `${label} max error ${maximum} exceeds ${tolerance}`);
  return maximum;
}

function bestIndex(values) {
  let best = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > values[best]) {
      best = index;
    }
  }
  return best;
}

const riskPolicy = loadTsModule("src/bot/riskfight-policy.ts");
const runtimeCombat = loadTsModule("src/sim/runtimePlayerCombat.ts");
const runtimePolicyOpponent = loadTsModule("src/sim/nh/runtime-policy-opponent.ts");
const policyBridge = loadTsModule("src/sim/nh/policy-bridge.ts");
const canonicalGear = loadTsModule("src/sim/nh/canonicalGear.ts");
const inventory = loadTsModule("src/render/nhInventory.ts");
const equipmentMath = loadTsModule("src/sim/equipment/equipment.ts");
const consumables = loadTsModule("src/sim/items/consumables.ts");
const setupPresets = loadTsModule("src/ui/runtimeSetupPresets.ts");
const equipmentRows = JSON.parse(readFileSync(path.join(projectRoot, "src/generated/equipment-bonuses.json"), "utf8"));

const candidatePath = path.join(projectRoot, "src", "generated", "webweaver-riskfight-candidate.json");
const candidatePayload = JSON.parse(readFileSync(candidatePath, "utf8"));
const checkpointPath = path.resolve(projectRoot, candidatePayload.source_checkpoint);
const parsedPolicy = riskPolicy.parseRiskFightBrowserPolicy(candidatePayload);
const mechanicsOnly = process.argv.includes("--mechanics-only");
const gameplaySourceChanges = Object.entries(candidatePayload.source_sha256 ?? {})
  .filter(([sourcePath, expected]) => fileSha256(path.join(projectRoot, sourcePath)) !== expected.toUpperCase())
  .map(([sourcePath]) => sourcePath);

assert(fileSha256(checkpointPath) === riskPolicy.riskFightCandidateCheckpointSha256, "retained checkpoint SHA-256 mismatch");
// Mechanics regression checks may run after a fix, but the default candidate
// qualification must still reject a model evaluated against different rules.
assert(mechanicsOnly || gameplaySourceChanges.length === 0, `qualified gameplay source changed: ${gameplaySourceChanges.join(", ")}`);
assert(parsedPolicy.identity.promoted === false, "candidate must remain unpromoted");
assert(parsedPolicy.identity.runtimeProfile === "risk_webweaver_v2", "runtime profile changed");
assert(parsedPolicy.identity.checkpointSha256 === riskPolicy.riskFightCandidateCheckpointSha256, "controller checkpoint identity mismatch");
assert(parsedPolicy.identity.parameterSha256 === riskPolicy.riskFightCandidateParameterSha256, "controller parameter identity mismatch");
assert(parsedPolicy.identity.schemaSha256 === riskPolicy.riskFightCandidateSchemaSha256, "controller schema identity mismatch");
assert(riskPolicy.riskFightFeatureNames.length === 53, "risk-fight feature count changed");
assert(riskPolicy.riskFightMainActions.length === 21, "risk-fight main-action count changed");
assert(riskPolicy.riskFightPrayerActions.length === 3, "risk-fight prayer-action count changed");
assert(riskPolicy.riskFightMovementActions.length === 3, "risk-fight movement-action count changed");
assert(policyBridge.nhPolicyInputSize === 114, "stable NH input contract changed");

// Contiguous experiment IDs must not share nearly the same opening accuracy
// roll. Exercise the real bow shot, not a second implementation of the RNG.
function openingArrowForEpisode(seed) {
  const fight = new BrowserRiskFight({ seed, startDistance: 1, pid: 0 });
  const combatSeed = fight.state.randomSeed;
  fight.step([[0, 0], [riskPolicy.riskFightMainActions.indexOf("WEBWEAVER_ATTACK"), 0]]);
  fight.step([[0, 0], [0, 0]]);
  // Tick 2's packet phase now precedes this arrow's tick-2 impact.
  fight.step([[0, 0], [0, 0]]);
  const hit = fight.state.events.find(event => event.id === "0-opponent-local-player-webweaver_bow-hit-hitsplat");
  assert(hit, "opening seed-diversity probe did not resolve its arrow");
  return { combatSeed, damage: hit.damage };
}
const openingSeedCases = Array.from({ length: 32 }, (_, index) => openingArrowForEpisode(9_200_041 + index));
const distinctCombatSeeds = new Set(openingSeedCases.map(result => result.combatSeed)).size;
const openingHitCount = openingSeedCases.filter(result => result.damage > 0).length;
assert(distinctCombatSeeds === 32, "different episode IDs collided after initial combat-seed mixing");
assert(openingHitCount >= 3 && openingHitCount <= 29,
  "contiguous evaluation IDs failed to exercise both successful and missed opening shots");
assert(new Set(openingSeedCases.map(result => result.damage)).size >= 4,
  "opening damage outcomes lack diversity across evaluation episodes");
assert(JSON.stringify(openingArrowForEpisode(9_200_041)) === JSON.stringify(openingSeedCases[0]),
  "the same recorded episode ID did not reproduce its combat seed and first hit");

const fixture = candidatePayload.verification;
assert(fixture?.producer === "PyTorch CPU float32", "Python inference fixture is missing");
const fixtureOutput = riskPolicy.runRiskFightBrowserPolicy(
  parsedPolicy,
  Float32Array.from(fixture.observation)
);
const inferenceErrors = {
  main: assertVectorClose("main logits", fixtureOutput.mainLogits, fixture.main_logits),
  prayer: assertVectorClose("prayer logits", fixtureOutput.prayerLogits, fixture.prayer_logits),
  movement: assertVectorClose("movement logits", fixtureOutput.movementLogits, fixture.movement_logits),
  value: Math.abs(fixtureOutput.value - fixture.value)
};
assert(inferenceErrors.value <= 3e-4, `value max error ${inferenceErrors.value} exceeds tolerance`);
assert(riskPolicy.riskFightMainActions[bestIndex(fixtureOutput.mainLogits)] === fixture.argmax.main, "main argmax mapping differs from Python");
assert(riskPolicy.riskFightPrayerActions[bestIndex(fixtureOutput.prayerLogits)] === fixture.argmax.prayer, "prayer argmax mapping differs from Python");
assert(riskPolicy.riskFightMovementActions[bestIndex(fixtureOutput.movementLogits)] === fixture.argmax.movement, "movement argmax mapping differs from Python");

const riskEquipment = {
  cape: canonicalGear.canonicalNhGear.infernalCape,
  amulet: canonicalGear.canonicalNhGear.amuletOfRancour,
  weapon: canonicalGear.canonicalNhGear.webweaverBow,
  legs: canonicalGear.canonicalNhGear.fremennikKilt,
  hands: canonicalGear.canonicalNhGear.barrowsGloves,
  feet: { itemId: 31097, name: "Avernic treads (max)" },
  ring: canonicalGear.canonicalNhGear.ringOfRecoil
};
const riskSupplies = {
  ...runtimeCombat.runtimePlayerCombatDefaultSupplies,
  manta_ray: 0,
  anglerfish: 0,
  marlin: 11,
  halibut: 4,
  summer_pie: 4,
  saradomin_brew: 8,
  sanfew_serum: 8,
  super_ranging: 4,
  super_combat: 4
};

const presetSupplies = setupPresets.runtimeSuppliesFromInventorySlots(setupPresets.runtimeSetupInventorySlots("webweaver"));
for (const name of ["marlin", "halibut", "summer_pie", "saradomin_brew", "sanfew_serum", "super_ranging", "super_combat"]) {
  assert(presetSupplies[name] === riskSupplies[name], `browser inventory/training supply mismatch: ${name}`);
}
assert(consumables.consumableUseCountForItemId(7218) === 2 && consumables.consumableUseCountForItemId(7220) === 1,
  "whole and half summer pies must contain two and one bites");
let pieSlots = [{ itemId: 7218, quantity: 1 }];
pieSlots = setupPresets.runtimeInventorySlotsAfterConsumedSupplies(pieSlots, ["summer_pie"]);
assert(pieSlots[0]?.itemId === 7220 && setupPresets.runtimeSuppliesFromInventorySlots(pieSlots).summer_pie === 1,
  "bot's first pie bite failed to retain the half pie");
pieSlots = setupPresets.runtimeInventorySlotsAfterConsumedSupplies(pieSlots, ["summer_pie"]);
assert(pieSlots[0]?.itemId === 2313 && setupPresets.runtimeSuppliesFromInventorySlots(pieSlots).summer_pie === 0,
  "bot's second pie bite must leave an empty dish and zero usable bites");

function createRiskState(distance = 1, processOrder = ["opponent", "local-player"]) {
  const opponentTile = { x: 0, z: 0 };
  const localTile = { x: distance * tileScale, z: 0 };
  let state = runtimeCombat.createRuntimePlayerCombatState({
    riskFight: true,
    localRecoilRingsRemaining: 2,
    opponentRecoilRingsRemaining: 2,
    localTile,
    opponentTile,
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "acb-hides",
    localSupplies: riskSupplies,
    opponentSupplies: riskSupplies,
    localVengeanceRuneCasts: 10,
    opponentVengeanceRuneCasts: 10,
    localSpecialEnergy: 100,
    opponentSpecialEnergy: 100,
    combatStartTick: 0,
    seed: 0x5a17f11e
  });
  state = runtimeCombat.syncRuntimePlayerCombatStateToInput(state, {
    tiles: { "local-player": localTile, opponent: opponentTile },
    equipment: { "local-player": riskEquipment, opponent: riskEquipment },
    tileScale
  });
  return {
    ...state,
    processOrder,
    nextProcessOrderShuffleTick: 1000
  };
}

function advanceAtCurrentTiles(state) {
  return runtimeCombat.advanceRuntimePlayerCombat(state, {
    tiles: {
      "local-player": state.actors["local-player"].tile,
      opponent: state.actors.opponent.tile
    },
    equipment: {
      "local-player": state.actors["local-player"].equipment,
      opponent: state.actors.opponent.equipment
    },
    tileScale
  }).state;
}

const inventoryDefinitions = inventory.createNhInventoryItemDefinitionStore(
  JSON.parse(readFileSync(path.join(projectRoot, "fixtures/assets/defs/cache-items.json"), "utf8"))
);
let potionSlots = inventory.normalizeNhInventorySlots([{ itemId: 11722, quantity: 1 }]);
let potionState = createRiskState();
for (const [doseIndex, nextItemId] of [11723, 11724, 11725, 229].entries()) {
  const slot = potionSlots[0];
  const entry = inventory.buildNhInventoryContextEntries({
    slot, slotIndex: 0, widgetId: inventory.NH_INVENTORY_WIDGET_ID,
    itemDefinition: inventoryDefinitions.get(slot.itemId)
  }).find((candidate) => candidate.actionText === "Drink");
  assert(entry, `super ranging dose ${4 - doseIndex} has no Drink action`);
  const changed = inventory.mutateNhInventorySlotsForAction(potionSlots, entry);
  assert(changed.mutation?.kind === "drink-dose" && changed.slots[0]?.itemId === nextItemId, "super ranging dose was not consumed");
  potionSlots = changed.slots;
  potionState = { ...potionState, tick: doseIndex * 3 };
  const consumed = runtimeCombat.consumeRuntimePlayerCombatSupply(potionState, "local-player", "super_ranging");
  assert(consumed.consumed && consumed.state.actors["local-player"].levels.ranged === 118, "super ranging must boost 99 to 118 without stacking");
  assert(consumed.state.actors["local-player"].fixedLevels.ranged === 99, "potion changed the base Ranged level");
  assert(!runtimeCombat.consumeRuntimePlayerCombatSupply(consumed.state, "local-player", "super_ranging").consumed, "same-tick second sip was allowed");
  potionState = consumed.state;
}
assert(potionState.actors["local-player"].supplies.super_ranging === 0, "four sips did not exhaust the potion");

const webweaverMaxHits = {};
for (const actorId of ["local-player", "opponent"]) {
  const targetId = actorId === "opponent" ? "local-player" : "opponent";
  for (const [attackSet, expectedMax] of [[0, 23], [1, 22], [3, 22]]) {
    const state = runtimeCombat.setRuntimePlayerCombatAttackSet(createRiskState(), actorId, attackSet);
    assert(runtimeCombat.runtimePlayerCombatDamageEstimate(state.actors[actorId], state.actors[targetId], "ranged").maxDamage === expectedMax, `Ranged style ${attackSet} uses the wrong strength bonus`);
  }
  let boosted = runtimeCombat.setRuntimePlayerCombatAttackSet(createRiskState(), actorId, 1);
  boosted = runtimeCombat.consumeRuntimePlayerCombatSupply(boosted, actorId, "super_ranging").state;
  boosted = runtimeCombat.setRuntimePlayerCombatPrayers(boosted, actorId, ["rigour"]);
  const estimate = runtimeCombat.runtimePlayerCombatDamageEstimate(boosted.actors[actorId], boosted.actors[targetId], "ranged");
  assert(estimate.maxDamage === 32, "Webweaver Rapid with 118 Ranged, Rigour and +68 strength must max 32 without a Wilderness multiplier");
  webweaverMaxHits[actorId] = estimate.maxDamage;
  for (const ammoItemId of [21932, 21944, 21948]) {
    const equipment = { ...riskEquipment, ammo: { itemId: ammoItemId, name: "Enchanted dragon bolts" } };
    assert(equipmentMath.aggregateVisibleEquipmentBonuses(equipment, equipmentRows).ranged_strength_bonus === 68, "Webweaver incorrectly gained ammo-slot strength");
    for (let seed = 0; seed < 128; seed += 1) {
      let state = runtimeCombat.setRuntimePlayerCombatLoadout(boosted, actorId, "acb-hides", equipment);
      state = { ...state, randomSeed: Math.imul(seed + 1, 0x9e3779b9) >>> 0 };
      state = runtimeCombat.requestRuntimePlayerCombatAttack(state, actorId, targetId);
      const launched = advanceAtCurrentTiles(state);
      const event = launched.events.find((candidate) => candidate.kind === "attack");
      assert(event?.maxDamage === 32, "normal Webweaver shot exceeded its max hit");
      const hits = [...launched.queuedHits, ...launched.events.filter((candidate) => candidate.kind === "hitsplat")];
      assert(hits.every((hit) => !hit.boltEffect && hit.damage <= 32), "Webweaver triggered an enchanted-bolt effect or an oversized hit");
    }
  }
}

function reflectHits({ damage = 20, count = 1, vengeance = false, attackerVengeance = false, charges = 40, attackerHp = 99 } = {}) {
  const state = createRiskState();
  const queued = {
    ...state,
    actors: {
      ...state.actors,
      opponent: { ...state.actors.opponent, hitpoints: attackerHp, vengeanceActive: attackerVengeance },
      "local-player": { ...state.actors["local-player"], vengeanceActive: vengeance, recoilCharges: charges }
    },
    queuedHits: Array.from({ length: count }, (_, index) => ({
      id: `reflection-${index}`, dueTick: 0, hitsplatTick: 0,
      attackerId: "opponent", defenderId: "local-player", style: "ranged",
      attackType: "RAPID_RANGED", attackSetIndex: 1, weaponId: "webweaver_bow",
      damage, rawDamage: damage, maxDamage: damage, hitChance: 1
    }))
  };
  const preMovement = runtimeCombat.applyRuntimePlayerCombatPreMovementHits(queued, {
    tiles: { "local-player": state.actors["local-player"].tile, opponent: state.actors.opponent.tile }, tileScale
  });
  return advanceAtCurrentTiles(preMovement.state);
}
const recoilOnly = reflectHits();
assert(recoilOnly.events.filter((event) => event.id.endsWith("recoil-hitsplat")).length === 1, "recoil applied more than once across pre-movement and attack processing");
assert(recoilOnly.actors.opponent.hitpoints === 97 && recoilOnly.actors["local-player"].recoilCharges === 38, "20 damage must reflect exactly 2 and spend 2 charges");
const combinedReflection = reflectHits({ vengeance: true });
const reflectedSplats = combinedReflection.events.filter((event) => event.kind === "hitsplat" && event.targetActorId === "opponent");
assert(JSON.stringify(reflectedSplats.map((event) => event.damage)) === "[15,2]", "Vengeance and recoil totals changed");
assert(new Set(reflectedSplats.map((event) => event.slotIndex)).size === 2, "Vengeance and recoil overlap in the same hitsplat slot");
assert(reflectedSplats[0].nextHitpoints === 84 && reflectedSplats[1].previousHitpoints === 84 && reflectedSplats[1].nextHitpoints === 82, "reflection events each reported the combined HP loss");
assert(combinedReflection.queuedHits.length === 0, "reflected damage must not queue another recoil");
// Both fighters wear recoil. Only the opponent attacks; their armed Vengeance
// must ignore damage returned by the idle player's recoil or Vengeance.
for (const vengeance of [false, true]) {
  let state = reflectHits({ vengeance, attackerVengeance: true });
  const expectedOpponentHp = vengeance ? 82 : 97;
  const hitIds = state.events.filter((event) => event.kind === "hitsplat").map((event) => event.id);
  assert(hitIds.length === (vengeance ? 3 : 2), "reflections created an extra hit");
  assert(state.actors["local-player"].hitpoints === 79, "idle player took damage beyond the original 20-damage attack");
  assert(state.actors.opponent.hitpoints === expectedOpponentHp, "reflected damage chained back through the attacker's ring");
  assert(state.actors.opponent.vengeanceActive, "recoil or Vengeance triggered the attacker's Vengeance");
  assert(state.actors.opponent.recoilCharges === 40, "reflected damage consumed the attacker's recoil charges");
  for (let tick = 0; tick < 6; tick += 1) state = advanceAtCurrentTiles(state);
  assert(state.queuedHits.length === 0, "reflection queued a delayed recursive hit");
  assert(state.actors["local-player"].hitpoints === 79 && state.actors.opponent.hitpoints === expectedOpponentHp, "reflection caused delayed extra damage");
  assert(JSON.stringify(state.events.filter((event) => event.kind === "hitsplat").map((event) => event.id)) === JSON.stringify(hitIds), "delayed reflection added another hitsplat");
}
const swarmRecoil = reflectHits({ damage: 10, count: 4 });
assert(swarmRecoil.actors.opponent.hitpoints === 95 && swarmRecoil.actors["local-player"].recoilCharges === 36, "four Swarm hits should each reflect once");
assert(reflectHits({ damage: 10, count: 4, charges: 3 }).actors.opponent.hitpoints === 96, "recoil exceeded its remaining charges");
assert(reflectHits({ damage: 0 }).events.every((event) => !event.id.endsWith("recoil-hitsplat")), "a zero hit triggered recoil");
assert(reflectHits({ vengeance: true, attackerHp: 10 }).events.every((event) => !event.id.endsWith("recoil-hitsplat")), "recoil hit an attacker already killed by Vengeance");

const attackCadence = {};
for (const actorId of ["local-player", "opponent"]) {
  for (const [attackSet, interval] of [[0, 4], [1, 3], [3, 4]]) {
    let state = runtimeCombat.setRuntimePlayerCombatAttackSet(createRiskState(1), actorId, attackSet);
    state = runtimeCombat.requestRuntimePlayerCombatAttack(state, actorId, actorId === "opponent" ? "local-player" : "opponent");
    const ticks = [];
    for (let tick = 0; tick < 10; tick++) {
      state = advanceAtCurrentTiles(state);
      for (const event of state.events.filter((event) => event.kind === "attack" && event.attackerId === actorId)) {
        if (ticks.includes(event.tick)) continue;
        ticks.push(event.tick);
        assert(event.sequenceName === "bow_attack", "Webweaver must use the bow attack animation");
        assert(event.projectile?.gfxId === 1574, "Webweaver must fire its generated arrow, not a crossbow bolt");
        assert(event.projectile?.startHeight === 40 && event.projectile?.curve === 15, "Webweaver arrow launch must match Projectile.arrow");
      }
    }
    assert(ticks.length >= 3, "Webweaver cadence check did not launch enough attacks");
    assert(ticks.slice(1).every((tick, index) => tick - ticks[index] === interval), `Webweaver ${actorId} style ${attackSet} attack spacing ${ticks} != ${interval}`);
    attackCadence[`${actorId}:${attackSet}`] = ticks;
  }
}

const rawSequences = JSON.parse(readFileSync(path.join(projectRoot, "fixtures/assets/animations/sequences.json"), "utf8"));
const frameStore = JSON.parse(readFileSync(path.join(projectRoot, "fixtures/assets/animations/frames.json"), "utf8"));
const actorSequences = loadTsModule("src/render/nhActorSequence.ts");
for (const [id, name] of [[426, "bow_attack"], [7516, "elder_maul_attack"], [7518, "elder_maul_ready"], [7519, "elder_maul_run"], [7520, "elder_maul_walk"]]) {
  assert(actorSequences.nhRuntimeSequenceNameForId(id) === name, `missing actor animation mapping ${id}:${name}`);
  assert(rawSequences[id]?.frameIDs?.length > 0, `missing cache animation ${id}`);
  for (const packedId of rawSequences[id].frameIDs) {
    assert(frameStore.frames[`${packedId >>> 16}:${packedId & 0xffff}`]?.transforms?.length > 0, `missing animation frame ${packedId} for ${name}`);
  }
}
const weaponTypes = JSON.parse(readFileSync(path.join(projectRoot, "fixtures/assets/defs/weapon-types.json"), "utf8"));
assert(JSON.stringify(weaponTypes.ELDER_MAUL.renderAnimations) === JSON.stringify([7518, 7520, 7520, 7520, 7520, 7520, 7519]), "Elder maul must use its own held/movement animations");
assert(weaponTypes.ELDER_MAUL.attackAnimation === 7516, "Elder maul attack animation is incorrect");
const arrowGlb = readFileSync(path.join(projectRoot, "fixtures/render/spotanims/webweaver_arrow.glb"));
assert(arrowGlb.readUInt32LE(0) === 0x46546c67 && arrowGlb.length > 1000, "Webweaver arrow GLB is missing or invalid");

assert(riskPolicy.riskFightCandidateLabel === "Risk Fight", "fight selector must say Risk Fight");
const singleArrowHits = {};
for (const distance of [1, 9]) {
  for (const processOrder of [["opponent", "local-player"], ["local-player", "opponent"]]) {
    for (const actorId of ["local-player", "opponent"]) {
      const targetId = actorId === "opponent" ? "local-player" : "opponent";
      let state = createRiskState(distance, processOrder);
      const maskState = { ...state, actors: {
        "local-player": { ...state.actors["local-player"], tile: { x: distance, z: 0 } },
        opponent: { ...state.actors.opponent, tile: { x: 0, z: 0 } }
      } };
      const mask = riskPolicy.riskFightLegalMainActionMask({ state: maskState, selfId: actorId, opponentId: targetId, episodeStartTick: 0, tileScale: 1 });
      assert(!mask[riskPolicy.riskFightMainActions.indexOf("WEBWEAVER_SPEC")], "uncharged bow still allows a neural Swarm action");
      assert(mask[riskPolicy.riskFightMainActions.indexOf("WEBWEAVER_ATTACK")], "normal arrows were disabled with Swarm");
      if (distance === 1) assert(mask[riskPolicy.riskFightMainActions.indexOf("GMAUL_SPEC")], "maul specials must remain available");
      const toggled = runtimeCombat.toggleRuntimePlayerCombatSpecial(state, actorId);
      assert(toggled.mutation === "noop-no-special" && !toggled.specialActive, "uncharged bow spec click activated Swarm");
      // A stale armed flag must not turn an ordinary arrow into a multi-hit attack.
      state = { ...state, actors: { ...state.actors, [actorId]: { ...state.actors[actorId], specialActive: true } } };
      state = runtimeCombat.requestRuntimePlayerCombatAttack(state, actorId, targetId);
      const launched = advanceAtCurrentTiles(state);
      const attackEvent = launched.events.find((event) => event.kind === "attack" && event.attackerId === actorId);
      assert(attackEvent && !attackEvent.specialAttack && !attackEvent.projectileProfiles, "uncharged bow launched a multi-projectile special");
      assert(attackEvent.sequenceName === "bow_attack" && attackEvent.projectile?.gfxId === 1574, "ordinary arrow lost the Webweaver animation/projectile");
      assert(launched.actors[actorId].gmaul.specialEnergy === 100, "ordinary arrow spent special energy");
      state = runtimeCombat.resetRuntimePlayerCombatActorTarget(launched, actorId);
      for (let tick = 0; tick < 6; tick += 1) state = advanceAtCurrentTiles(state);
      const directHits = state.events.filter((event) => event.kind === "hitsplat" && event.attackerId === actorId);
      const recoilHits = state.events.filter((event) => event.id.endsWith("recoil-hitsplat"));
      assert(directHits.length === 1 && directHits[0].targetActorId === targetId, "one arrow produced extra target hitsplats");
      assert(recoilHits.length === Number(directHits[0].damage > 0), "one arrow produced duplicate recoil hitsplats");
      singleArrowHits[`d${distance}:${processOrder[0]}-first:${actorId}`] = directHits.length;
    }
  }
}

// The Wiki bow table is the on-PID delay. The opposite shooter must land one
// tick later, without changing either arrow's launch packet or retiming a shot
// already in flight when PID changes.
const bowPidTimings = [];
for (const [distance, onPidDelay] of [[1, 1], [2, 1], [3, 2], [5, 2], [6, 2], [8, 2], [9, 3], [10, 3]]) {
  for (const processOrder of [["local-player", "opponent"], ["opponent", "local-player"]]) {
    for (const riskFight of [true, false]) {
      let state = { ...createRiskState(distance, processOrder), riskFight };
      for (const actorId of processOrder) {
        // Long range makes the entire documented 1-10 tile table reachable.
        state = runtimeCombat.setRuntimePlayerCombatAttackSet(state, actorId, 3);
        state = runtimeCombat.requestRuntimePlayerCombatAttack(state, actorId, actorId === "opponent" ? "local-player" : "opponent");
      }
      state = advanceAtCurrentTiles(state);
      const shots = state.events.filter(event => event.kind === "attack");
      assert(shots.length === 2 && shots.every(event => event.tick === 0), "simultaneous bow fixture did not shoot on the same tick");
      assert(JSON.stringify(shots[0].projectile) === JSON.stringify(shots[1].projectile)
        && shots[0].projectileDurationCycles === shots[1].projectileDurationCycles,
      "PID changed projectile release or flight duration");
      const expectedDelays = riskFight ? [onPidDelay, onPidDelay + 1] : [distance < 6 ? 2 : 3, distance < 6 ? 2 : 3];
      for (const [index, actorId] of processOrder.entries()) {
        const hit = state.queuedHits.find(hit => hit.attackerId === actorId);
        assert(hit?.dueTick === expectedDelays[index] && hit.hitsplatTick === expectedDelays[index],
          `bow d${distance}, risk=${riskFight}, ${actorId}: due/hitsplat != ${expectedDelays[index]}`);
        if (riskFight) {
          assert(shots.find(event => event.attackerId === actorId)?.hitDelayTicks === expectedDelays[index],
            "public projectile observation disagrees with the PID-adjusted damage queue");
        }
        state = runtimeCombat.resetRuntimePlayerCombatActorTarget(state, actorId);
      }
      // Reverse priority after launch: scheduled damage must retain its timing.
      state = { ...state, processOrder: [...processOrder].reverse() };
      if (riskFight) {
        for (const selfId of processOrder) {
          const opponentId = selfId === "opponent" ? "local-player" : "opponent";
          const observation = riskPolicy.encodeRiskFightObservation({ state, selfId, opponentId, episodeStartTick: 0,
            tileScale, shaping: { "local-player": 0, opponent: 0 } });
          for (const [feature, owner, delay] of [["incoming_projectiles_one_tick", opponentId, 1],
            ["incoming_projectiles_two_ticks", opponentId, 2], ["outgoing_projectiles_one_tick", selfId, 1]]) {
            const expected = state.queuedHits.filter(hit => hit.attackerId === owner && hit.dueTick === state.tick + delay).length / 4;
            assert(observation[riskPolicy.riskFightFeatureNames.indexOf(feature)] === expected,
              `PID-adjusted ${feature} disagrees with the real arrivals after a priority switch`);
          }
        }
      }
      for (let tick = 0; tick < 5; tick += 1) state = advanceAtCurrentTiles(state);
      for (const [index, actorId] of processOrder.entries()) {
        const hits = state.events.filter(event => event.kind === "hitsplat" && event.id === `0-${actorId}-${actorId === "opponent" ? "local-player" : "opponent"}-webweaver_bow-hit-hitsplat`);
        assert(hits.length === 1 && hits[0].tick === expectedDelays[index], "in-flight PID switch changed the actual damage tick");
      }
      if (riskFight) bowPidTimings.push({ distance, pid: processOrder[0], hitTicks: expectedDelays });
    }
  }
}

let vengeanceState = createRiskState(1);
let vengeanceCast = runtimeCombat.castRuntimePlayerCombatVengeanceSpell(vengeanceState, "opponent", { consumeRuneCast: true });
assert(vengeanceCast.cast, "initial regular Vengeance cast failed");
assert(vengeanceCast.state.actors.opponent.vengeanceRuneCastsRemaining === 9, "regular Vengeance did not consume one rune cast");
vengeanceState = {
  ...vengeanceCast.state,
  tick: 49,
  actors: {
    ...vengeanceCast.state.actors,
    opponent: { ...vengeanceCast.state.actors.opponent, vengeanceActive: false }
  }
};
assert(!runtimeCombat.castRuntimePlayerCombatVengeanceSpell(vengeanceState, "opponent", { consumeRuneCast: true }).cast, "Vengeance recast was legal before T+50");
vengeanceState = { ...vengeanceState, tick: 50 };
vengeanceCast = runtimeCombat.castRuntimePlayerCombatVengeanceSpell(vengeanceState, "opponent", { consumeRuneCast: true });
assert(vengeanceCast.cast, "Vengeance was not legal at exactly T+50");
assert(vengeanceCast.state.actors.opponent.vengeanceRuneCastsRemaining === 8, "Vengeance recast did not decrement runes");

let reflectionState = createRiskState(1, ["opponent", "local-player"]);
reflectionState = {
  ...reflectionState,
  queuedHits: [{
    id: "riskfight-reflection-owner",
    dueTick: 0,
    hitsplatTick: 0,
    attackerId: "opponent",
    defenderId: "local-player",
    style: "ranged",
    attackType: "RAPID_RANGED",
    attackSetIndex: 1,
    weaponId: "webweaver_bow",
    damage: 1,
    rawDamage: 1,
    maxDamage: 1,
    hitChance: 1
  }],
  actors: {
    ...reflectionState.actors,
    "local-player": {
      ...reflectionState.actors["local-player"],
      vengeanceActive: true,
      equipment: { ...riskEquipment, ring: canonicalGear.canonicalNhGear.ultorRing }
    },
    opponent: { ...reflectionState.actors.opponent, hitpoints: 1 }
  }
};
const reflected = advanceAtCurrentTiles(reflectionState);
const vengeanceHitsplat = reflected.events.find((event) => event.kind === "hitsplat" && event.id.includes("vengeance-hitsplat"));
assert(vengeanceHitsplat?.damage === 1, "Vengeance must ceil 75% of a one-damage hit to one");
assert(vengeanceHitsplat?.attackerId === "local-player" && vengeanceHitsplat?.targetActorId === "opponent", "Vengeance reflection ownership changed");

const reflectedComboEvents = combinedReflection.events;
const reflectionTick = reflectedComboEvents.find(event => event.id.endsWith("vengeance-hitsplat")).tick;
const ownComboHit = { kind: "hitsplat", id: "own-maul-hitsplat", tick: reflectionTick,
  attackerId: "local-player", targetActorId: "opponent", damage: 20, previousHitpoints: 99 };
assert(vengeanceStackDamage(reflectedComboEvents, reflectionTick, "local-player") === 0,
  "Vengeance alone must not earn combo credit");
assert(vengeanceStackDamage([...reflectedComboEvents, ownComboHit], reflectionTick, "local-player") === 15,
  "same-tick stack diagnostic must use actual reflected and direct damage");
for (const changedHit of [
  { ...ownComboHit, tick: reflectionTick + 1 },
  { ...ownComboHit, damage: 0 },
  { ...ownComboHit, id: "own-recoil-hitsplat" }
]) {
  assert(vengeanceStackDamage([...reflectedComboEvents, changedHit], reflectionTick, "local-player") === 0,
    "a later hit, miss or recoil must not earn a Vengeance-stack bonus");
}
assert(vengeanceStackDamage([...reflectedComboEvents, { ...ownComboHit, previousHitpoints: 2 }], reflectionTick, "local-player") === 2,
  "overkill must not inflate stack credit");
assert(vengeanceStackDamage(vengeanceCast.state.events, 50, "opponent") === 0,
  "casting Vengeance must not earn a reward");

const rewardActor = { ...createRiskState().actors.opponent,
  supplies: { marlin: 1, halibut: 1, summer_pie: 2, saradomin_brew: 3, sanfew_serum: 999 } };
assert(healingSupplyHitpoints(rewardActor) === 114,
  "remaining healing must count actual pie bites and brew doses, excluding restore/boost potions");
const comboHits = [
  { kind: "hitsplat", id: "bow-hitsplat", tick: 10, attackerId: "local-player", targetActorId: "opponent",
    damage: 35, previousHitpoints: 60, nextHitpoints: 25 },
  { kind: "hitsplat", id: "maul-hitsplat", tick: 11, attackerId: "local-player", targetActorId: "opponent",
    damage: 40, previousHitpoints: 25, nextHitpoints: 0 }
];
const lethalStack = riskFightComboWindow(comboHits, 11, "local-player");
assert(lethalStack.lethal && lethalStack.damage === 60, "adjacent-tick landed bow/maul stack must count only useful damage");
assert(!riskFightComboWindow([comboHits[0]], 10, "local-player").qualifies,
  "single hits must not count as combos");
assert(!riskFightComboWindow([{ ...comboHits[0], tick: 8 }, comboHits[1]], 11, "local-player").qualifies,
  "slow damage from separate attack cycles must not count as a stack");
assert(!riskFightComboWindow([comboHits[0], { ...comboHits[1], id: "chip-recoil-hitsplat" }], 11, "local-player").qualifies,
  "recoil must not turn ordinary damage into a combo");
assert(!riskFightComboWindow([comboHits[0], { ...comboHits[1], damage: 0 }], 11, "local-player").qualifies,
  "a spec miss must not earn combo credit");
assert(!riskFightComboWindow([comboHits[0], { kind: "supply", actorId: "opponent", tick: 11, healed: 44 },
  { ...comboHits[1], previousHitpoints: 69, nextHitpoints: 29 }], 11, "local-player").qualifies,
  "healing between hits must be subtracted when grading burst pressure");
assert(riskFightComboWindow([comboHits[0], { ...comboHits[1], id: "trigger-vengeance-hitsplat" }], 11, "local-player").vengeanceDamage === 25,
  "Vengeance contribution must use landed, non-overkill damage");
const rewardState = { ...createRiskState(), tick: 11,
  events: [...comboHits, { kind: "death", actorId: "opponent", tick: 11 }],
  actors: { ...createRiskState().actors, opponent: { ...rewardActor, supplies: { marlin: 1, halibut: 1 } } } };
const stockedCredit = riskFightTerminalCredit(rewardState, 0);
assert(stockedCredit.terminalReward[0] === 100 && stockedCredit.stockedComboKos[0] === 1 && stockedCredit.terminalReward[1] === -10,
  "a lethal stack against stocked opposition must dominate ordinary kills");
const exhaustedState = { ...rewardState, actors: { ...rewardState.actors,
  opponent: { ...rewardActor, supplies: { sanfew_serum: 8, super_combat: 4 } } } };
assert(riskFightTerminalCredit(exhaustedState, 0).terminalReward[0] === 0 &&
  riskFightTerminalCredit(exhaustedState, 0).exhaustedKos[0] === 1,
  "an exhausted-opponent KO must pay zero even if it looks like a combo or potions remain");
const nearlyExhausted = { ...rewardState, actors: { ...rewardState.actors,
  opponent: { ...rewardActor, supplies: { summer_pie: 1 } } } };
assert(riskFightTerminalCredit(nearlyExhausted, 0).terminalReward[0] === 5 &&
  riskFightTerminalCredit(nearlyExhausted, 0).stockedComboKos[0] === 0,
  "leaving one pie bite must not game the full-stock combo objective");

// Exercise emitted rewards through the actual browser combat engine, including
// repeated partial-tick events and a later death refund.
const rewardFight = new BrowserRiskFight({ seed: 18407, startDistance: 1, maxTicks: 30 });
function injectRewardHit(fight, id, attackerId, defenderId, damage) {
  fight.state = { ...fight.state, queuedHits: [...fight.state.queuedHits, {
    id, dueTick: fight.state.tick, hitsplatTick: fight.state.tick, attackerId, defenderId,
    style: "ranged", attackType: "RAPID", attackSetIndex: 1, weaponId: "webweaver_bow",
    damage, rawDamage: damage, maxDamage: damage, hitChance: 1
  }] };
}
injectRewardHit(rewardFight, "reward-bow", "local-player", "opponent", 30);
injectRewardHit(rewardFight, "reward-maul", "local-player", "opponent", 25);
rewardFight.step([[0, 0], [0, 0]]);
const firstComboReward = rewardFight.rewards[0];
assert(firstComboReward > 0 && firstComboReward <= comboRewardContract.combo_bonus_cap,
  "actual nonlethal burst must produce a bounded combo learning signal");
rewardFight.step([[0, 0], [0, 0]]);
assert(rewardFight.rewards[0] === 0, "retained events must not pay the same stack twice");
injectRewardHit(rewardFight, "reward-later-death", "opponent", "local-player", 200);
rewardFight.step([[0, 0], [0, 0]]);
assert(rewardFight.done && rewardFight.report.comboReward[0] === 0 &&
  rewardFight.report.objectiveReturn[0] === -10 && rewardFight.rewards[0] === -10 - firstComboReward,
  "dying must refund earlier stack bonuses so suicide combos cannot bank reward");
const exhaustedFight = new BrowserRiskFight({ seed: 18408, startDistance: 1, maxTicks: 30 });
exhaustedFight.state = { ...exhaustedFight.state, actors: { ...exhaustedFight.state.actors,
  opponent: { ...exhaustedFight.state.actors.opponent, supplies: { ...exhaustedState.actors.opponent.supplies } } } };
injectRewardHit(exhaustedFight, "exhausted-chip", "local-player", "opponent", 25);
exhaustedFight.step([[0, 0], [0, 0]]);
assert(exhaustedFight.rewards[0] === 0, "damage to an exhausted opponent must not pay a dense reward");
injectRewardHit(exhaustedFight, "exhausted-kill", "local-player", "opponent", 200);
exhaustedFight.step([[0, 0], [0, 0]]);
assert(exhaustedFight.done && exhaustedFight.report.objectiveReturn[0] === 0,
  "exhausted-opponent kills must have zero positive return end-to-end");
const stockedFinishFight = new BrowserRiskFight({ seed: 18409, startDistance: 1, maxTicks: 30 });
stockedFinishFight.state = { ...stockedFinishFight.state, actors: { ...stockedFinishFight.state.actors,
  opponent: { ...stockedFinishFight.state.actors.opponent, hitpoints: 60 } } };
injectRewardHit(stockedFinishFight, "stacked-bow", "local-player", "opponent", 35);
injectRewardHit(stockedFinishFight, "stacked-maul", "local-player", "opponent", 40);
stockedFinishFight.step([[0, 0], [0, 0]]);
assert(stockedFinishFight.report.stockedComboKos[0] === 1 && stockedFinishFight.report.terminalReward[0] === 100 &&
  stockedFinishFight.report.comboFinish.netDamage === 60 && stockedFinishFight.report.comboFinish.hits[1].damage === 25,
  "full combat-engine stocked combo KO must have useful-damage evidence and the declared terminal reward");
for (const ending of ["timeout", "exhausted-ko"]) {
  const fight = new BrowserRiskFight({ seed: 18410, startDistance: 1, maxTicks: ending === "timeout" ? 2 : 30 });
  injectRewardHit(fight, "provisional-bow", "local-player", "opponent", 30);
  injectRewardHit(fight, "provisional-maul", "local-player", "opponent", 25);
  fight.step([[0, 0], [0, 0]]);
  assert(fight.comboReward[0] > 0, "test must first earn a provisional stack bonus");
  if (ending === "exhausted-ko") {
    fight.state = { ...fight.state, actors: { ...fight.state.actors,
      opponent: { ...fight.state.actors.opponent, supplies: {} } } };
    injectRewardHit(fight, "exhausted-finisher", "local-player", "opponent", 200);
  }
  fight.step([[0, 0], [0, 0]]);
  assert(fight.done && fight.report.objectiveReturn[0] === 0 && fight.report.comboReward[0] === 0,
    "timeouts and exhausted victories must refund provisional bonuses instead of paying for attrition/stalling");
}
assert(reflected.events.some((event) => event.kind === "death" && event.actorId === "opponent"), "Vengeance terminal death was not attributed to the attacker");
assert(reflected.actors.opponent.deadUntilTick === 5, "terminal death lifecycle did not set the five-tick respawn gate");

function riskAction(mainAction, prayerAction = "NONE", movementAction = "HOLD") {
  const attacking = ["WEBWEAVER_ATTACK", "WEBWEAVER_SPEC", "GMAUL_ATTACK", "GMAUL_SPEC", "GMAUL_DOUBLE_SPEC", "GMAUL_RELEASE", "ELDER_ATTACK"].includes(mainAction);
  const offenceStyle = mainAction.startsWith("WEBWEAVER") ? "ranged" : mainAction.startsWith("GMAUL") || mainAction.startsWith("ELDER") ? "melee" : "ranged";
  return {
    offenceStyle,
    defencePrayer: prayerAction === "PROTECT_MELEE" ? "protect_from_melee" : "protect_from_missiles",
    movementIntent: movementAction === "STEP_CLOSER" ? "pressure" : movementAction === "STEP_AWAY" ? "step_out" : "none",
    supplyIntent: "none",
    specIntent: mainAction === "GMAUL_SPEC" ? "spec_granite_maul" : "none",
    extendedSupplyAction: false,
    attackIntent: attacking ? "attack" : "hold",
    equipmentIntent: "weapon_only",
    riskFightMainAction: mainAction,
    riskFightPrayerAction: prayerAction,
    riskFightMovementAction: movementAction
  };
}

function controllerForAction(action) {
  let lastDecision = null;
  return {
    id: riskPolicy.riskFightCandidateControllerId,
    runtimeProfile: riskPolicy.riskFightRuntimeProfile,
    identity: parsedPolicy.identity,
    chooseAction() {
      throw new Error("profile-specific adapter was bypassed");
    },
    chooseRuntimeAction(input) {
      lastDecision = {
        controllerId: riskPolicy.riskFightCandidateControllerId,
        checkpointSha256: riskPolicy.riskFightCandidateCheckpointSha256,
        parameterSha256: riskPolicy.riskFightCandidateParameterSha256,
        schemaSha256: riskPolicy.riskFightCandidateSchemaSha256,
        tick: input.state.tick,
        episodeTick: input.state.tick - input.episodeStartTick,
        observation: new Float32Array(53),
        legalMainActions: Array(21).fill(true),
        mainLogits: new Float32Array(21),
        prayerLogits: new Float32Array(3),
        movementLogits: new Float32Array(3),
        value: 0,
        mainAction: action.riskFightMainAction,
        prayerAction: action.riskFightPrayerAction,
        movementAction: action.riskFightMovementAction,
        action
      };
      return lastDecision;
    },
    getLastDecision() {
      return lastDecision;
    },
    resetEpisode() {
      lastDecision = null;
    }
  };
}

function applyRiskAction(state, action, options = {}) {
  const controller = controllerForAction(action);
  const result = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
    state,
    controller,
    localActor: {
      tile: state.actors["local-player"].tile,
      loadoutId: state.actors["local-player"].loadoutId,
      equipment: state.actors["local-player"].equipment
    },
    opponentActor: {
      tile: state.actors.opponent.tile,
      loadoutId: state.actors.opponent.loadoutId,
      equipment: state.actors.opponent.equipment
    },
    allowSourceLoadoutSync: false,
    inPvpCombatArea: true,
    rewardEpisodeActive: true,
    rewardEpisodeStartTick: 0,
    nextRepositionTick: 0,
    tileScale,
    ...options
  });
  assert(result.controllerId === riskPolicy.riskFightCandidateControllerId, "risk adapter returned a different controller identity");
  return result;
}

const equipmentActions = [
  ["WEBWEAVER_ATTACK", canonicalGear.canonicalNhGear.webweaverBow.itemId],
  ["GMAUL_ATTACK", canonicalGear.canonicalNhGear.graniteMaulOrnateHandle.itemId],
  ["ELDER_ATTACK", canonicalGear.canonicalNhGear.elderMaul.itemId]
];
for (const [actionName, expectedWeaponId] of equipmentActions) {
  const result = applyRiskAction(createRiskState(1), riskAction(actionName));
  assert(result.state.actors.opponent.equipment.weapon?.itemId === expectedWeaponId, `${actionName} equipped the wrong weapon`);
  const attacked = advanceAtCurrentTiles(result.state);
  const event = attacked.events.find((event) => event.kind === "attack" && event.attackerId === "opponent");
  if (actionName === "ELDER_ATTACK") assert(event?.sequenceName === "elder_maul_attack", "Elder maul must not use the godsword attack animation");
  if (actionName === "WEBWEAVER_ATTACK") assert(result.state.actors.opponent.attackSetIndex === 1, "Webweaver opponent must use three-tick Rapid");
  for (const slot of ["cape", "amulet", "body", "legs", "hands", "feet", "ammo", "head"]) {
    assert(result.state.actors.opponent.equipment[slot]?.itemId === riskEquipment[slot]?.itemId, `weapon action invented gear in ${slot}`);
  }
}
for (const prayer of riskPolicy.riskFightPrayerActions) {
  for (const [main, offencePrayer] of [["WEBWEAVER_ATTACK", "rigour"], ["ELDER_ATTACK", "piety"]]) {
    const result = applyRiskAction(createRiskState(1), riskAction(main, prayer));
    assert(result.state.actors.opponent.activePrayers.includes(offencePrayer), "risk fights must keep offensive prayers");
    assert(!result.state.actors.opponent.activePrayers.some((id) => id.startsWith("protect_from_")), `risk-fight opponent enabled protection from ${prayer}`);
  }
}
const maulSpecial = advanceAtCurrentTiles(applyRiskAction(createRiskState(1), riskAction("GMAUL_SPEC")).state);
assert(maulSpecial.events.some((event) => event.kind === "attack" && event.specialAttack === "granite_maul"), "Risk Fight lost its Granite maul special");
assert(maulSpecial.actors.opponent.gmaul.specialEnergy === 50, "Granite maul special did not consume its normal energy");
const doubleMaul = advanceAtCurrentTiles(applyRiskAction(createRiskState(1), riskAction("GMAUL_DOUBLE_SPEC")).state);
assert(doubleMaul.actors.opponent.gmaulSpecsUsed === 2 && doubleMaul.actors.opponent.gmaul.specialEnergy === 0,
  "risk double-maul must execute two player-path specs and consume 100 energy");
for (const itemId of [4153, 24225]) for (const actorId of ["local-player", "opponent"]) {
  const targetId = actorId === "opponent" ? "local-player" : "opponent";
  let state = createRiskState(1);
  state = runtimeCombat.setRuntimePlayerCombatLoadout(state, actorId, "gmaul-bandos", {
    ...state.actors[actorId].equipment, weapon: { itemId, name: "Granite maul" }
  });
  state = runtimeCombat.requestRuntimePlayerCombatAttack(state, actorId, targetId);
  state = runtimeCombat.toggleRuntimePlayerCombatSpecial(state, actorId).state;
  state = runtimeCombat.toggleRuntimePlayerCombatSpecial(state, actorId).state;
  state = advanceAtCurrentTiles(state);
  assert(state.actors[actorId].gmaul.preloaded && state.actors[actorId].gmaulSpecsUsed === 0 &&
    state.actors[actorId].targetId === null && state.actors[actorId].gmaul.specialEnergy === 100,
  `NH/DMM and risk mauls must hold two clicks: item=${itemId}, actor=${actorId}`);
  let expired = state;
  for (let tick = 0; tick < 4; tick++) expired = advanceAtCurrentTiles(expired);
  assert(!expired.actors[actorId].gmaul.preloaded && expired.actors[actorId].gmaul.queuedSpecs === 0 &&
    expired.actors[actorId].gmaul.specialEnergy === 100, "unused preload expiry spent energy or left a stale queue");
  state = runtimeCombat.requestRuntimePlayerCombatAttack(state, actorId, targetId);
  state = advanceAtCurrentTiles(state);
  assert(state.actors[actorId].gmaulSpecsUsed === 2 && state.actors[actorId].gmaul.specialEnergy === 0,
    "releasing a preload must use exactly two specs");
  state = runtimeCombat.toggleRuntimePlayerCombatSpecial(state, actorId).state;
  state = advanceAtCurrentTiles(state);
  assert(state.actors[actorId].gmaulSpecsUsed === 2, "depleted maul manufactured extra special energy");
}

const observationState = createRiskState(5);
const observationInput = { state: observationState, selfId: "opponent", opponentId: "local-player",
  episodeStartTick: 0, tileScale, shaping: { "local-player": 0, opponent: 0 } };
const observed = Array.from(riskPolicy.encodeRiskFightObservation(observationInput));
const publicCast = { kind: "spotanim", id: "public-vengeance-cast", tick: 0, actorId: "local-player",
  artifactUrl: "render/spotanims/vengeance_cast.glb" };
const reflectedObservationState = { ...observationState, tick: 1, events: [publicCast,
  { kind: "hitsplat", id: "public-recoil-hitsplat", tick: 0, attackerId: "opponent", targetActorId: "local-player", damage: 2 }] };
assert(riskPolicy.encodeRiskFightObservation({ ...observationInput, state: reflectedObservationState })[12] === 1,
  "public recoil damage must not falsely clear observed Vengeance");
assert(riskPolicy.encodeRiskFightObservation({ ...observationInput,
  state: { ...reflectedObservationState, events: [publicCast,
    { ...reflectedObservationState.events[1], id: "public-normal-hitsplat" }] } })[12] === 0,
  "a normal positive hit must clear observed Vengeance");
const privateActor = observationState.actors["local-player"];
const changedPrivateState = { ...observationState, actors: { ...observationState.actors,
  "local-player": { ...privateActor, supplies: Object.fromEntries(Object.keys(privateActor.supplies).map(key => [key, 999])),
    gmaul: { ...privateActor.gmaul, specialEnergy: 0, preloaded: true, queuedSpecs: 2 }, gmaulSpecsUsed: 99,
    vengeanceActive: true, vengeanceCooldownUntilTick: 900, vengeanceRuneCastsRemaining: 900,
    lastVengeanceSpellCastTick: 0, recoilCharges: 999, prayerPoints: 0,
    levels: { attack: 1, strength: 1, defence: 1, ranged: 1, magic: 1 },
    attackTimer: { ...privateActor.attackTimer, additiveAttackDelayTicks: 99 },
    equipment: { ...privateActor.equipment, ring: canonicalGear.canonicalNhGear.ultorRing }
  } }, queuedHits: [{ id: "hidden-future-roll", dueTick: 1, attackerId: "local-player", defenderId: "opponent",
    style: "ranged", attackType: "ranged", attackSetIndex: 1, projectileProfileId: "webweaver_arrow",
    damage: 999, rawDamage: 999, maxDamage: 999, hitChance: 1 }] };
assert(JSON.stringify(Array.from(riskPolicy.encodeRiskFightObservation({ ...observationInput, state: changedPrivateState }))) === JSON.stringify(observed),
  "private opponent resources, future hit damage, boosts or armed actions leaked into observations");
const blockedInput = { ...observationInput, canStep: () => false };
assert(JSON.stringify(riskPolicy.riskFightLegalMovementMask(blockedInput)) === JSON.stringify([true, false, false]),
  "collision-illegal movement remained selectable");
const blockedDecision = riskPolicy.createRiskFightPolicyController().chooseRuntimeAction(blockedInput);
assert(blockedDecision.movementAction === "HOLD" && blockedDecision.prayerAction === "NONE",
  "inference bypassed movement or risk prayer legality");
const priorView = { ...privateActor, tile: { x: observationState.actors.opponent.tile.x + tileScale, z: observationState.actors.opponent.tile.z },
  equipment: { ...privateActor.equipment, weapon: canonicalGear.canonicalNhGear.elderMaul }, hitpoints: 42 };
const priorObservation = riskPolicy.encodeRiskFightObservation({ ...observationInput, observedOpponent: priorView });
assert(Math.abs(priorObservation[1] - 42 / 115) < 1e-6 && Math.abs(priorObservation[34] - 1 / 9) < 1e-6 && priorObservation[42] === 1,
  "completed-prior-tick appearance was ignored");
let observedByAdapter;
const recordingController = controllerForAction(riskAction("WAIT"));
const originalChoose = recordingController.chooseRuntimeAction;
recordingController.chooseRuntimeAction = input => { observedByAdapter = input.observedOpponent; return originalChoose(input); };
runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({ state: observationState, controller: recordingController,
  localActor: { tile: priorView.tile, equipment: priorView.equipment, loadoutId: priorView.loadoutId },
  opponentActor: { tile: observationState.actors.opponent.tile, loadoutId: observationState.actors.opponent.loadoutId },
  allowSourceLoadoutSync: false, rewardEpisodeActive: true, tileScale });
assert(observedByAdapter?.tile.x === priorView.tile.x && observedByAdapter?.equipment.weapon.itemId === 21003,
  "browser adapter failed to pass the delayed appearance into risk inference");
let ringResult = applyRiskAction(createRiskState(1), riskAction("EQUIP_ULTOR"));
assert(ringResult.state.actors.opponent.equipment.ring?.itemId === canonicalGear.canonicalNhGear.ultorRing.itemId, "Ultor action did not equip Ultor");
ringResult = applyRiskAction(ringResult.state, riskAction("EQUIP_RECOIL"));
assert(ringResult.state.actors.opponent.equipment.ring?.itemId === canonicalGear.canonicalNhGear.ringOfRecoil.itemId, "recoil action did not restore recoil");

let supplyState = createRiskState(1);
supplyState = {
  ...supplyState,
  actors: {
    ...supplyState.actors,
    opponent: { ...supplyState.actors.opponent, hitpoints: 30 }
  }
};
const supplyResult = applyRiskAction(supplyState, riskAction("EAT_MARLIN_HALIBUT"));
assert(JSON.stringify(supplyResult.consumedSupplies) === JSON.stringify(["marlin", "halibut"]), "marlin/halibut action did not preserve combo order");
assert(supplyResult.state.actors.opponent.supplies.marlin === 10, "marlin count did not decrement");
assert(supplyResult.state.actors.opponent.supplies.halibut === 3, "halibut count did not decrement");
assert(supplyResult.state.actors.opponent.hitpoints === 74, "marlin/halibut healing total changed");
let finiteFood = createRiskState(1);
for (let use = 0; use < 20; use++) {
  finiteFood = { ...finiteFood, tick: use * 4, actors: { ...finiteFood.actors, opponent: { ...finiteFood.actors.opponent, hitpoints: 1 } } };
  finiteFood = applyRiskAction(finiteFood, riskAction("EAT_MARLIN")).state;
}
assert(finiteFood.actors.opponent.supplies.marlin === 0 && finiteFood.events.filter(event => event.kind === "supply" && event.item === "marlin").length === 11,
  "risk opponent ate more marlins than its initial inventory");

let depleted = createRiskState(1);
depleted = {
  ...depleted,
  actors: {
    ...depleted.actors,
    opponent: {
      ...depleted.actors.opponent,
      hitpoints: 1,
      supplies: { ...riskSupplies, marlin: 0 },
      vengeanceRuneCastsRemaining: 0,
      recoilCharges: 0
    }
  }
};
const restored = runtimeCombat.resetRuntimePlayerCombatActorPolicyFreshFight(depleted, "opponent", {
  supplies: riskSupplies,
  vengeanceRuneCastsRemaining: 10
});
assert(restored.actors.opponent.hitpoints === 99, "fresh-fight reset did not restore hitpoints");
assert(restored.actors.opponent.supplies.marlin === 11, "fresh-fight reset did not restore supplies");
assert(restored.actors.opponent.vengeanceRuneCastsRemaining === 10, "fresh-fight reset did not restore Vengeance casts");
assert(restored.actors.opponent.recoilCharges === 40, "fresh-fight reset did not restore recoil charges");

const viewerSource = readFileSync(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
const runtimePolicySource = readFileSync(path.join(projectRoot, "src", "sim", "nh", "runtime-policy-opponent.ts"), "utf8");
const bridgeSource = readFileSync(path.join(projectRoot, "src", "sim", "nh", "policy-bridge.ts"), "utf8");
assert(viewerSource.includes("manualOpponentRiskFightPolicyControllerRef.current"), "UI does not own the embedded risk controller");
assert(viewerSource.includes("riskFightSetupSelected"), "UI selector does not profile-gate the risk controller");
assert(viewerSource.includes('const freshFightReset = runtimeSetupPresetIdRef.current === "nh-stake" && shouldRuntimePolicyResetForFreshFight'), "DMM or Webweaver still enters the legacy NH armour reset");
assert(viewerSource.includes("!riskFightCandidateRequired &&"), "candidate start still depends on the stable policy loader");
assert(viewerSource.includes("lastManualOpponentRiskFightObservation"), "exact candidate observation telemetry is missing");
assert(viewerSource.includes("lastManualOpponentRiskFightThreeHeadAction"), "three-head action telemetry is missing");
assert(runtimePolicySource.includes("const riskFightMode = isRiskFightPolicyController(input.controller)"), "risk adapter is not gated before stable recovery/shaping");
assert(bridgeSource.includes("readonly riskFightMainAction?:"), "risk main action is not profile-optional");
assert(bridgeSource.includes("readonly riskFightPrayerAction?:"), "risk prayer action is not profile-optional");
assert(bridgeSource.includes("readonly riskFightMovementAction?:"), "risk movement action is not profile-optional");

const serverJavaRoot = path.join(
  workspaceRoot,
  "kronos-osrs-184-master",
  "kronos-osrs-184-master",
  "Kronos-master",
  "kronos-server",
  "src",
  "main",
  "java",
  "io",
  "ruin"
);
const coreWorkerSource = readFileSync(path.join(serverJavaRoot, "process", "CoreWorker.java"), "utf8");
const entityListSource = readFileSync(path.join(serverJavaRoot, "model", "entity", "EntityList.java"), "utf8");
const projectileSource = readFileSync(path.join(serverJavaRoot, "model", "map", "Projectile.java"), "utf8");
const hitSource = readFileSync(path.join(serverJavaRoot, "model", "combat", "Hit.java"), "utf8");
const vengeanceSource = readFileSync(path.join(serverJavaRoot, "model", "skills", "magic", "spells", "lunar", "Vengeance.java"), "utf8");
const webweaverSource = readFileSync(path.join(serverJavaRoot, "model", "combat", "special", "ranged", "WebweaverBow.java"), "utf8");
const recoilSource = readFileSync(path.join(serverJavaRoot, "model", "item", "actions", "impl", "jewellery", "RingOfRecoil.java"), "utf8");
assert(coreWorkerSource.includes("players.resetCount()") && coreWorkerSource.includes("players.scramble()"), "Java PID indexing source changed");
assert(coreWorkerSource.includes("Random.get(40, 60)"), "Java PID scramble interval changed");
assert(entityListSource.includes("indexes[count++] = index"), "Java physical-index rebuild source changed");
assert(projectileSource.includes("durationIncrement * Math.max(0, distance - 1)"), "Java projectile travel formula changed");
assert(hitSource.includes("if (ticks > 0 && target.processed)") && hitSource.includes("ticks--"), "Java processed-target compensation changed");
assert(vengeanceSource.includes("Math.ceil(hit.damage * 0.75)"), "Java Vengeance reflection rounding changed");
assert(recoilSource.includes("Math.ceil(hit.damage * 0.10)"), "Java recoil reflection rounding changed");
assert(vengeanceSource.includes("e.delay(50)"), "Java Vengeance cooldown changed");
for (const timing of [
  "20, 33, 3",
  "30, 43, 3",
  "40, 53, 3",
  "50, 63, 3"
]) {
  assert(webweaverSource.includes(timing), `Java Webweaver projectile ${timing} changed`);
}

// Audit regressions: reachable brewed states, PID KOs, packet eating and finite spares.
const riskRules = loadTsModule("src/sim/nh/riskfight.ts");
const mainIndex = name => riskRules.riskFightMainActions.indexOf(name);
const riskInput = (state, selfId = "local-player") => ({ state, selfId,
  opponentId: selfId === "local-player" ? "opponent" : "local-player", episodeStartTick: 0, tileScale });
for (const actorId of ["local-player", "opponent"]) {
  let state = createRiskState();
  state = { ...state, actors: { ...state.actors, [actorId]: { ...state.actors[actorId], hitpoints: 80 } } };
  state = runtimeCombat.consumeRuntimePlayerCombatSupply(state, actorId, "saradomin_brew").state;
  assert(state.actors[actorId].levels.magic === 90, "brew fixture did not drain Magic");
  const denied = runtimeCombat.castRuntimePlayerCombatVengeanceSpell(state, actorId, { consumeRuneCast: true });
  assert(!denied.cast && denied.reason === "magic-level" && denied.state === state, "brewed Vengeance cast mutated state");
  assert(!riskRules.riskFightLegalMainActionMask(riskInput(state, actorId))[mainIndex("CAST_VENGEANCE")], "brewed Vengeance remained selectable");
  for (const [magic, expected] of [[93, false], [94, true]]) {
    const boundary = { ...state, actors: { ...state.actors, [actorId]: { ...state.actors[actorId],
      levels: { ...state.actors[actorId].levels, magic } } } };
    assert(runtimeCombat.castRuntimePlayerCombatVengeanceSpell(boundary, actorId).cast === expected, `Vengeance level boundary ${magic}`);
  }
  const lowDefence = { ...state, actors: { ...state.actors, [actorId]: { ...state.actors[actorId],
    levels: { ...state.actors[actorId].levels, magic: 99, defence: 39 } } } };
  assert(runtimeCombat.castRuntimePlayerCombatVengeanceSpell(lowDefence, actorId).reason === "defence-level", "Vengeance ignored current Defence");
}
for (const pid of [0, 1]) {
  const fight = new BrowserRiskFight({ seed: 6, startDistance: 1, pid, variant: "cleared" });
  const ids = ["local-player", "opponent"];
  fight.state = { ...fight.state, actors: Object.fromEntries(ids.map(id => [id, { ...fight.state.actors[id], hitpoints: 20 }])) };
  fight.completedActors = fight.state.actors;
  const oldMode = { ...fight.state, riskFight: false };
  let legacy = oldMode;
  for (const id of ids) legacy = riskRules.applyRiskFightMainAction(legacy, id, "GMAUL_DOUBLE_SPEC").state;
  legacy = runtimeCombat.advanceRuntimePlayerCombat(legacy, { tiles: {}, tileScale: .5 }).state;
  assert(legacy.events.filter(e => e.kind === "attack").length === 2, "NH/DMM attack sequencing changed");
  fight.step([[mainIndex("GMAUL_DOUBLE_SPEC"), 0], [mainIndex("GMAUL_DOUBLE_SPEC"), 0]]);
  const attacks = fight.state.events.filter(e => e.kind === "attack");
  assert(attacks.length === 1 && attacks[0].attackerId === ids[pid], "lethally hit non-PID fighter launched a return maul");
  assert(fight.report?.winner === pid && fight.report?.outcome === "ko", "PID KO became a mutual death");
}
function dueArrow(targetId, tick = 0, damage = 26) {
  return { id: `audit-${tick}-${targetId}`, dueTick: tick, hitsplatTick: tick,
    attackerId: targetId === "local-player" ? "opponent" : "local-player", defenderId: targetId,
    style: "ranged", attackType: "RAPID_RANGED", attackSetIndex: 1, weaponId: "webweaver_bow",
    damage, rawDamage: damage, maxDamage: 32, hitChance: 1 };
}
for (const side of [0, 1]) {
  const fight = new BrowserRiskFight({ seed: 1, startDistance: 1, pid: side, variant: "cleared" });
  const id = ["local-player", "opponent"][side];
  fight.state = { ...fight.state, actors: { ...fight.state.actors, [id]: { ...fight.state.actors[id], hitpoints: 20 } },
    queuedHits: [dueArrow(id)] };
  fight.completedActors = fight.state.actors;
  const actions = [[0, 0], [0, 0]];
  actions[side][0] = mainIndex("EAT_MARLIN");
  fight.step(actions);
  assert(fight.state.actors[id].hitpoints === 18 && fight.state.actors[id].supplies.marlin === 10,
    "food did not precede incoming hits equally for both actors");
}
const deferred = applyRiskAction(createRiskState(2), riskAction("WAIT", "NONE", "STEP_AWAY"), { deferRiskFightMovement: true });
assert(deferred.pendingRiskFightMovementTile && !deferred.opponentMovedThisTick && deferred.state.actors.opponent.tile.x === 0,
  "packet-phase risk decision moved before incoming hits");
assert(deferred.movementBlockedReason === null, "accepted deferred movement was reported as blocked");
for (const side of [0, 1]) {
  const fight = new BrowserRiskFight({ seed: 1, startDistance: 2, pid: side, variant: "cleared" });
  const id = ["local-player", "opponent"][side];
  const tileBefore = fight.state.actors[id].tile;
  fight.state = { ...fight.state, actors: { ...fight.state.actors, [id]: { ...fight.state.actors[id], hitpoints: 20 } },
    queuedHits: [dueArrow(id)] };
  fight.completedActors = fight.state.actors;
  const movementIndex = riskRules.riskFightLegalMovementMask(fight.input(side)).findIndex((legal, index) => legal && index > 0);
  assert(movementIndex > 0, "fatal-impact movement fixture has no legal step");
  const actions = [[0, 0], [0, 0]];
  actions[side][1] = movementIndex;
  fight.step(actions);
  assert(fight.state.actors[id].hitpoints === 0 && JSON.stringify(fight.state.actors[id].tile) === JSON.stringify(tileBefore),
    "an incoming lethal hit failed to cancel queued movement");
}
let ringState = createRiskState();
ringState = { ...ringState, actors: { ...ringState.actors, "local-player": { ...ringState.actors["local-player"], recoilCharges: 1 } },
  queuedHits: [dueArrow("local-player", 0, 10)] };
ringState = runtimeCombat.applyRuntimePlayerCombatPreMovementHits(ringState, { tiles: {}, tileScale }).state;
const broken = ringState.actors["local-player"];
assert(!broken.equipment.ring && broken.recoilCharges === 0 && broken.recoilRingsRemaining === 1, "first ring did not shatter finitely");
assert(riskRules.riskFightLegalMainActionMask(riskInput(ringState))[mainIndex("EQUIP_RECOIL")], "spare ring is not selectable");
const manualSpare = runtimeCombat.syncRuntimePlayerCombatStateToInput(ringState, {
  tiles: {}, equipment: { "local-player": { ...broken.equipment, ring: canonicalGear.canonicalNhGear.ringOfRecoil } }, tileScale
});
assert(manualSpare.actors["local-player"].recoilCharges === 40 && manualSpare.actors["local-player"].recoilRingsRemaining === 1,
  "manual inventory equipment sync failed to activate the finite spare");
ringState = riskRules.applyRiskFightMainAction(ringState, "local-player", "EQUIP_RECOIL").state;
assert(ringState.actors["local-player"].recoilCharges === 40, "equipping the spare failed to restore its charge budget");
const spareInventory = setupPresets.runtimeInventorySlotsAfterEquipmentChange([{ itemId: 2550, quantity: 1 }], broken.equipment,
  ringState.actors["local-player"].equipment);
assert(spareInventory[0] === null, "equipping a spare returned the shattered ring to inventory");
ringState = { ...ringState, actors: { ...ringState.actors, "local-player": { ...ringState.actors["local-player"], recoilCharges: 3 } } };
ringState = riskRules.applyRiskFightMainAction(ringState, "local-player", "EQUIP_ULTOR").state;
ringState = riskRules.applyRiskFightMainAction(ringState, "local-player", "EQUIP_RECOIL").state;
assert(ringState.actors["local-player"].recoilCharges === 3, "switching intact rings created infinite charges");
ringState = { ...ringState, queuedHits: [dueArrow("local-player", 0, 30)] };
ringState = runtimeCombat.applyRuntimePlayerCombatPreMovementHits(ringState, { tiles: {}, tileScale }).state;
assert(!ringState.actors["local-player"].equipment.ring && ringState.actors["local-player"].recoilRingsRemaining === 0,
  "last recoil ring did not deplete");
assert(!riskRules.riskFightLegalMainActionMask(riskInput(ringState))[mainIndex("EQUIP_RECOIL")], "bot invented a third ring");
const newKit = setupPresets.runtimeSetupInventorySlots("webweaver");
assert(newKit.filter(slot => slot?.itemId === 7218).length === 2 && newKit.filter(slot => slot?.itemId === 2550).length === 1,
  "Risk kit must contain two pies and one spare recoil ring");
assert(setupPresets.runtimeRecoilRingsRemaining(newKit, setupPresets.runtimeSetupEquipmentItems("webweaver")) === 2,
  "recoil supply count missed worn or spare ring");

const opponentInfo = loadTsModule("src/ui/runeliteOpponentInfo.ts");
const opponentInfoConfig = { enabled: true, hitpointsDisplayStyle: "Hitpoints", showOpponentsOpponent: false };
let hpDisplayState = runtimeCombat.requestRuntimePlayerCombatAttack(createRiskState(), "local-player", "opponent");
hpDisplayState = { ...hpDisplayState, queuedHits: [dueArrow("opponent", 0, 98)] };
hpDisplayState = runtimeCombat.applyRuntimePlayerCombatPreMovementHits(hpDisplayState, { tiles: {}, tileScale }).state;
assert(opponentInfo.runeliteOpponentInfoSnapshot(hpDisplayState, opponentInfoConfig)?.label === "1/99",
  "numeric HP confused a one-HP survivor with a death");
hpDisplayState = { ...hpDisplayState, queuedHits: [dueArrow("opponent", 0, 1)] };
hpDisplayState = runtimeCombat.applyRuntimePlayerCombatPreMovementHits(hpDisplayState, { tiles: {}, tileScale }).state;
const deadHpDisplay = opponentInfo.runeliteOpponentInfoSnapshot(hpDisplayState, opponentInfoConfig);
assert(deadHpDisplay?.label === "0/99" && deadHpDisplay.fillPercent === 0, "opponent HP panel disappeared at death");
hpDisplayState = { ...hpDisplayState, actors: { ...hpDisplayState.actors, opponent: { ...hpDisplayState.actors.opponent, hitpoints: 115 } } };
const boostedHpDisplay = opponentInfo.runeliteOpponentInfoSnapshot(hpDisplayState, opponentInfoConfig);
assert(boostedHpDisplay?.label === "115/99" && boostedHpDisplay.fillPercent === 100, "numeric HP concealed overhealing");
assert(opponentInfo.runeliteOpponentInfoSnapshot(hpDisplayState, { ...opponentInfoConfig, enabled: false }) === null,
  "explicitly disabling the opponent panel no longer works");
const trackingState = advanceAtCurrentTiles(runtimeCombat.requestRuntimePlayerCombatAttack(createRiskState(), "opponent", "local-player"));
assert(opponentInfo.runeliteOpponentInfoSnapshot(trackingState, opponentInfoConfig)?.sourceLastOpponent === "recentAttack",
  "incoming combat failed to retain the opponent panel without a local attack target");
assert(opponentInfo.runeliteOpponentInfoSnapshot({ ...trackingState, tick: 9 }, opponentInfoConfig) === null,
  "opponent panel did not expire after the five-second combat grace period");

console.log(JSON.stringify({
  ok: true,
  mechanicsOnly,
  qualifiedGameplaySourceMatches: gameplaySourceChanges.length === 0,
  gameplaySourceChanges,
  auditRegressions: { vengeanceLevels: true, pidKoBothOrders: true, foodBeforeHitsBothSides: true, deferredMovement: true, lethalHitCancelsMovement: true, finiteRecoilSpare: true },
  promoted: false,
  controllerId: riskPolicy.riskFightCandidateControllerId,
  checkpointSha256: riskPolicy.riskFightCandidateCheckpointSha256,
  parameterSha256: riskPolicy.riskFightCandidateParameterSha256,
  schemaSha256: riskPolicy.riskFightCandidateSchemaSha256,
  pythonBrowserInferenceMaxError: inferenceErrors,
  attackCadence,
  webweaverMaxHits,
  superRanging: { rangedLevel: potionState.actors["local-player"].levels.ranged, finalItemId: potionSlots[0].itemId },
  reflection: { recoilOnly: 2, vengeanceAndRecoil: reflectedSplats.map((event) => event.damage), swarmRecoil: 4 },
  singleArrowHits,
  bowPidTimings,
  opponentHp: { oneHpSurvivor: true, zeroHpDeath: true, overhealing: true },
  vengeance: {
    firstRecastTick: 50,
    runeCastsRemainingAfterTwoCasts: vengeanceCast.state.actors.opponent.vengeanceRuneCastsRemaining,
    oneDamageReflection: vengeanceHitsplat.damage,
    terminalOwner: vengeanceHitsplat.attackerId
  },
  adapter: {
    weapons: equipmentActions.map(([action, itemId]) => ({ action, itemId })),
    ring: ringResult.state.actors.opponent.equipment.ring.itemId,
    comboSupplies: supplyResult.consumedSupplies,
    restoredRecoilCharges: restored.actors.opponent.recoilCharges
  },
  pidOwnership: {
    localCandidate: "persistent browser/FastSim order with 40-60 tick rerolls",
    javaSource: "physical-index order rebuilt each tick; randomized only on scramble tick",
    promotionParity: false
  }
}, null, 2));
