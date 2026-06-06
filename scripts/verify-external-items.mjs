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

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(projectRoot, relativePath), "utf8"));
}

function loadTsModule(relativePath) {
  return loadModule(path.resolve(projectRoot, relativePath));
}

function loadModule(sourcePath) {
  const resolvedPath = resolveModulePath(sourcePath);
  const cached = moduleCache.get(resolvedPath);
  if (cached) {
    return cached.exports;
  }

  if (resolvedPath.endsWith(".json")) {
    const module = { exports: readJson(path.relative(projectRoot, resolvedPath)) };
    moduleCache.set(resolvedPath, module);
    return module.exports;
  }

  const source = readFileSync(resolvedPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      resolveJsonModule: true,
      strict: true,
      target: ts.ScriptTarget.ES2020
    },
    fileName: resolvedPath
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(resolvedPath, module);
  vm.runInNewContext(
    transpiled,
    {
      module,
      exports: module.exports,
      require: (request) => localRequire(resolvedPath, request),
      console
    },
    { filename: resolvedPath }
  );
  return module.exports;
}

function localRequire(parentPath, request) {
  if (request.startsWith(".")) {
    return loadModule(path.resolve(path.dirname(parentPath), request));
  }
  return require(request);
}

function resolveModulePath(candidatePath) {
  const attempts = [
    candidatePath,
    `${candidatePath}.ts`,
    `${candidatePath}.tsx`,
    `${candidatePath}.js`,
    `${candidatePath}.json`,
    path.join(candidatePath, "index.ts"),
    path.join(candidatePath, "index.tsx"),
    path.join(candidatePath, "index.js")
  ];
  for (const attempt of attempts) {
    try {
      const stat = require("node:fs").statSync(attempt);
      if (stat.isFile()) {
        return attempt;
      }
    } catch {
      // Try the next module candidate.
    }
  }
  throw new Error(`Cannot resolve module ${candidatePath}`);
}

const externalItems = readJson("fixtures/external-items/noxious-halberd.json").items;
const serverItems = readJson("fixtures/assets/defs/server-items.json");
const generatedServerItems = readJson("src/generated/server-items.json");
const equipmentRows = readJson("fixtures/assets/defs/equipment-bonuses.json");
const generatedEquipmentRows = readJson("src/generated/equipment-bonuses.json");
const cacheItems = readJson("fixtures/assets/defs/cache-items.json");
const cacheModels = readJson("fixtures/assets/models/cache-models.json");
const weaponTypes = readJson("fixtures/assets/defs/weapon-types.json");
const generatedWeaponTypes = readJson("src/generated/weapon-types.json");
const spriteSheet = readJson("fixtures/render/sprites/item_sprites.json");
const rawSequences = readJson("fixtures/assets/animations/sequences.json");
const frameStore = readJson("fixtures/assets/animations/frames.json");
const runtimePolicySource = readFileSync(path.join(projectRoot, "src/sim/nh/runtime-policy-opponent.ts"), "utf8");

const { canMeleeReachThisTick } = loadTsModule("src/sim/world/movement.ts");
const { nhWeaponProfiles, playerAttackGate } = loadTsModule("src/sim/combat/player-combat.ts");
const runtimeCombat = loadTsModule("src/sim/runtimePlayerCombat.ts");
const runtimePolicy = loadTsModule("src/sim/nh/runtime-policy-opponent.ts");
const { createAttackTimerState } = loadTsModule("src/sim/combat/timers.ts");
const { createEntityLockState } = loadTsModule("src/sim/entity/locks.ts");
const { nhLoadouts } = loadTsModule("src/sim/nh/loadouts.ts");
const { runtimeLoadouts } = loadTsModule("src/render/runtimeScene.ts");
const { composeNhPlayerModel } = loadTsModule("src/render/nhPlayerModel.ts");

const noxFixture = externalItems.find((item) => item.id === 29796);
assert(noxFixture, "external Noxious halberd fixture should exist");
assert(noxFixture.serverItem.specialAttack === null, "Noxious halberd special should stay disabled until poison/venom exists");

for (const rows of [serverItems, generatedServerItems]) {
  const row = rows.find((item) => item.id === 29796);
  assert(row?.name === "Noxious halberd", "server item 29796 should be merged");
  assert(row.weaponType === "HALBERD", "Noxious halberd should use the HALBERD weapon type");
  assert(row.twoHanded === true, "Noxious halberd should be two-handed");
}

for (const rows of [equipmentRows, generatedEquipmentRows]) {
  const row = rows.find((item) => item.id === 29796);
  assert(row?.bonuses?.slash_attack_bonus === 132, "Noxious halberd slash attack should be +132");
  assert(row.bonuses.melee_strength_bonus === 142, "Noxious halberd melee strength should be +142");
}

assert(cacheItems["29796"]?.inventoryModel === 54299, "Noxious halberd cache item should use the real inventory model");
assert(cacheItems["29796"]?.maleModel0 === 54316, "Noxious halberd cache item should use the real male worn model");
assert(cacheItems["29796"]?.femaleModel0 === 54315, "Noxious halberd cache item should use the real female worn model");
assert(
  cacheModels["54316"]?.vertexCount > 0 && cacheModels["54316"]?.faceCount > 0,
  "Noxious halberd current-cache male model should be present"
);

for (const rows of [weaponTypes, generatedWeaponTypes]) {
  const halberd = rows.HALBERD;
  assert(halberd?.maxDistance === 2, "HALBERD max distance should be 2");
  assert(halberd.attackTicks === 5, "HALBERD attack speed should be 5 ticks");
  assert(halberd.attackSets?.[1]?.style === "SLASH", "HALBERD aggressive style should be slash");
  assert(halberd.attackSets?.[1]?.attackAnimation === 440, "HALBERD aggressive slash should use animation 440");

  const vestaLongsword = rows.VESTA_LONGSWORD;
  assert(vestaLongsword?.attackTicks === 5, "Vesta's longsword attack speed should be 5 ticks");
  assert(vestaLongsword.attackAnimation === 390, "Vesta's longsword slash attacks should use animation 390");
  assert(vestaLongsword.attackSound === 2500, "Vesta's longsword should use attack sound 2500");
  assert(vestaLongsword.attackSets?.[2]?.style === "STAB", "Vesta's longsword controlled style should be stab");
  assert(vestaLongsword.attackSets?.[2]?.attackAnimation === 386, "Vesta's longsword controlled stab should use animation 386");
}

assert(spriteSheet.sprites.filter((sprite) => sprite.itemId === 29796).length === 2, "Noxious halberd icon should have normal and selected item sprites");
const halberdSequence = rawSequences["440"];
assert(halberdSequence?.frameIDs?.length > 0, "Noxious halberd attack sequence 440 should be imported from current cache");
for (const packedFrameId of halberdSequence.frameIDs) {
  const frameKey = `${packedFrameId >>> 16}:${packedFrameId & 0xffff}`;
  assert(frameStore.frames[frameKey], `Noxious halberd attack sequence should include frame ${frameKey}`);
}
for (const [sequenceId, label] of [
  ["386", "Vesta's longsword controlled stab"],
  ["390", "Vesta's longsword slash"]
]) {
  const sequence = rawSequences[sequenceId];
  assert(sequence?.frameIDs?.length > 0, `${label} sequence ${sequenceId} should be imported from current cache`);
  for (const packedFrameId of sequence.frameIDs) {
    const frameKey = `${packedFrameId >>> 16}:${packedFrameId & 0xffff}`;
    assert(frameStore.frames[frameKey], `${label} sequence should include frame ${frameKey}`);
  }
}

assert(nhWeaponProfiles.noxious_halberd.attackRange === 2, "Noxious halberd weapon profile should attack from 2 tiles");
assert(nhWeaponProfiles.noxious_halberd.cooldownTicks === 5, "Noxious halberd weapon profile should have a 5-tick cooldown");
assert(nhLoadouts["noxious-halberd"]?.equipment.weapon?.itemId === 29796, "NH noxious loadout should equip item 29796");
const noxiousRuntimeLoadout = runtimeLoadouts.find((loadout) => loadout.id === "noxious-halberd");
assert(noxiousRuntimeLoadout, "runtime noxious loadout should be registered");

const noxiousMetadata = readJson("fixtures/render/player-loadouts/noxious-bandos.mesh.json");
const noxiousComposed = composeNhPlayerModel(
  {
    cacheItems,
    kits: readJson("fixtures/assets/defs/kits.json"),
    cacheModels,
    serverItems,
    bodyColors: readJson("fixtures/assets/defs/body-colors.json"),
    textures: readJson("fixtures/assets/defs/textures.json")
  },
  {
    itemIds: noxiousRuntimeLoadout.itemIds,
    bodyColors: noxiousRuntimeLoadout.bodyColors
  }
);
assert(
  noxiousComposed.metadata.sourceVertexCount === noxiousMetadata.sourceVertexCount,
  "runtime noxious loadout source vertex count should match its generated mesh metadata"
);
assert(
  noxiousComposed.metadata.expandedVertexCount === noxiousMetadata.expandedVertexCount,
  "runtime noxious loadout expanded vertex count should match its generated mesh metadata"
);
assert(
  noxiousComposed.metadata.sourceFaceCount === noxiousMetadata.sourceFaceCount,
  "runtime noxious loadout source face count should match its generated mesh metadata"
);

const defaultMeleeReach = canMeleeReachThisTick({
  attacker: { x: 0, y: 0, plane: 0 },
  defender: { x: 2, y: 0, plane: 0 },
  attackerFrozen: true
});
assert(defaultMeleeReach.canReach === false, "default melee should not attack from two tiles while frozen");

const noxiousReach = canMeleeReachThisTick({
  attacker: { x: 0, y: 0, plane: 0 },
  defender: { x: 2, y: 0, plane: 0 },
  attackerFrozen: true,
  attackRange: 2
});
assert(noxiousReach.canReach === true, "Noxious halberd should attack from two tiles while frozen");
assert(noxiousReach.relation === "extended-range", "Noxious two-tile reach should be marked as extended range");

const noxiousAttackGate = playerAttackGate({
  currentTick: 100,
  attackerTile: { x: 0, y: 0, plane: 0 },
  defenderTile: { x: 2, y: 0, plane: 0 },
  attackerFrozen: true,
  locks: createEntityLockState(),
  attackTimer: createAttackTimerState(0),
  weapon: nhWeaponProfiles.noxious_halberd
});
assert(noxiousAttackGate.canAttack === true, "Noxious halberd player attack gate should allow a ready 2-tile hit");
assert(noxiousAttackGate.requiresMovement === false, "Noxious halberd 2-tile hit should not require movement");
assert(
  runtimePolicySource.includes("const meleeRouteDistance = runtimePolicyMeleeTargetRouteRange(input.context.self);"),
  "Runtime policy melee pressure should derive route distance from the active melee weapon"
);
assert(
  runtimePolicySource.includes("input.targetRouteStep(input.opponentTile, input.localTile, routeDistance"),
  "Runtime policy melee pressure should pass the derived melee route distance into TargetRoute"
);
assert(
  runtimePolicySource.includes("meleeRouteDistance <= 1"),
  "Runtime policy spec pull-in should be limited to one-tile melee weapons"
);
assert(
  runtimePolicySource.includes("return loadoutForWeapon(gearProfile.meleeWeaponId).id;"),
  "Runtime policy melee loadout should keep the selected melee weapon loadout"
);

const noxiousPressureController = {
  id: "verify-noxious-pressure-route",
  chooseAction: () => ({
    offenceStyle: "melee",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};

const noxiousAtReachPressureState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 2, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "noxious-halberd",
  localPrayers: ["protect_from_magic"],
  seed: 29797
});
const noxiousAtReachPressure = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: noxiousAtReachPressureState,
  controller: noxiousPressureController,
  localActor: {
    tile: noxiousAtReachPressureState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: noxiousAtReachPressureState.actors.opponent.tile,
    loadoutId: "noxious-halberd",
    inventoryItems: []
  },
  targetRouteStep: () => {
    throw new Error("Noxious halberd should not request target-route movement while already at two-tile reach");
  }
});
assert(
  noxiousAtReachPressure.effectiveAction.offenceStyle === "melee",
  `Noxious at-reach verifier should exercise melee pressure, got ${noxiousAtReachPressure.effectiveAction.offenceStyle}`
);
assert(noxiousAtReachPressure.context.meleeReachable === true, "Noxious pressure context should treat two-tile distance as melee-reachable");
assert(noxiousAtReachPressure.opponentLoadoutId === "noxious-halberd", "Noxious melee policy should keep the Nox loadout instead of switching to tentacle");
assert(noxiousAtReachPressure.opponentMovedThisTick === false, "Noxious pressure should not pull from two-tile reach into one-tile range");

console.log("external item fixtures verified");
