import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const workspaceRoot = path.resolve(projectRoot, "..");
const legacySourceName = ["Kro", "nos"].join("");
const legacySourceNameLower = legacySourceName.toLowerCase();
const sourceRoot = process.env.NH_SOURCE_ROOT
  ? path.resolve(process.env.NH_SOURCE_ROOT)
  : path.join(
    workspaceRoot,
    `${legacySourceNameLower}-osrs-184-master`,
    `${legacySourceNameLower}-osrs-184-master`,
    `${legacySourceName}-master`
  );
const serverProjectRoot = path.join(sourceRoot, `${legacySourceNameLower}-server`);
const serverPracticeDmmDeployedPropertiesPath = path.join(serverProjectRoot, "server.practice.dmm.deployed.properties");
const serverPracticeDmmDeployedPropertiesSource = existsSync(serverPracticeDmmDeployedPropertiesPath)
  ? readFileSync(serverPracticeDmmDeployedPropertiesPath, "utf8")
  : "";
const serverRuinRoot = process.env.NH_SERVER_JAVA_RUIN_ROOT
  ? path.resolve(process.env.NH_SERVER_JAVA_RUIN_ROOT)
  : path.join(serverProjectRoot, "src", "main", "java", "io", "ruin");
const clientSourceRoot = process.env.NH_CLIENT_SOURCE_ROOT
  ? path.resolve(process.env.NH_CLIENT_SOURCE_ROOT)
  : path.join(workspaceRoot, `${legacySourceName}184-Client`, "runelite-client", "src", "main");
const clientStandaloneRoot = path.join(clientSourceRoot, "java", "net", "runelite", "standalone");

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
      // try next candidate
    }
  }
  return candidates[0];
}

const runtimeCombat = loadTsModule("src/sim/runtimePlayerCombat.ts");
const entityLocks = loadTsModule("src/sim/entity/locks.ts");
const spellRequirements = loadTsModule("src/sim/magic/spellRequirements.ts");
const runtimePolicyOpponent = loadTsModule("src/sim/nh/runtime-policy-opponent.ts");
const nhDuel = loadTsModule("src/sim/nh/duel.ts");
const nhGearProfile = loadTsModule("src/sim/nh/gearProfile.ts");
const consumables = loadTsModule("src/sim/items/consumables.ts");
const equipment = loadTsModule("src/sim/equipment/equipment.ts");
const combatFormulas = loadTsModule("src/sim/combat/formulas.ts");
const itemActionQueue = loadTsModule("src/sim/engine/itemActionQueue.ts");
const nhLoadouts = loadTsModule("src/sim/nh/loadouts.ts");
const nhPolicyFeatures = loadTsModule("src/sim/nh/policy-features.ts");
const nhPolicyBridge = loadTsModule("src/sim/nh/policy-bridge.ts");
const botPolicy = loadTsModule("src/bot/policy.ts");
const prayers = loadTsModule("src/sim/prayer/prayers.ts");
const nhCombat = loadTsModule("src/render/nhCombat.ts");
const equipmentRows = loadTsModule("src/generated/equipment-bonuses.json");
const serverItems = loadTsModule("src/generated/server-items.json");
const playerCombatSource = readNhServerSource("model/entity/player/PlayerCombat.java");
const configSource = readNhServerSource("model/inter/utils/Config.java");
const combatSource = readNhServerSource("model/combat/Combat.java");
const hitSource = readNhServerSource("model/combat/Hit.java");
const combatUtilsSource = readNhServerSource("model/combat/CombatUtils.java");
const projectileSource = readNhServerSource("model/map/Projectile.java");
const graniteMaulSource = readNhServerSource("model/combat/special/melee/GraniteMaul.java");
const armadylGodswordSource = readNhServerSource("model/combat/special/melee/ArmadylGodsword.java");
const vestasLongswordSource = readNhServerSource("model/combat/special/melee/VestasLongsword.java");
const armadylCrossbowSource = readNhServerSource("model/combat/special/ranged/ArmadylCrossbow.java");
const rangedAmmoSource = readNhServerSource("model/combat/RangedAmmo.java");
const diamondBoltEffectSource = readNhServerSource("model/combat/special/ranged/bolts/DiamondBoltEffect.java");
const dragonBoltEffectSource = readNhServerSource("model/combat/special/ranged/bolts/DragonBoltEffect.java");
const onyxBoltEffectSource = readNhServerSource("model/combat/special/ranged/bolts/OnyxBoltEffect.java");
const targetSpellSource = readNhServerSource("model/skills/magic/spells/TargetSpell.java");
const iceBlitzSource = readNhServerSource("model/skills/magic/spells/ancient/IceBlitz.java");
const bloodBlitzSource = readNhServerSource("model/skills/magic/spells/ancient/BloodBlitz.java");
const iceBarrageSource = readNhServerSource("model/skills/magic/spells/ancient/IceBarrage.java");
const bloodBarrageSource = readNhServerSource("model/skills/magic/spells/ancient/BloodBarrage.java");
const bloodSpellSource = readNhServerSource("model/skills/magic/spells/ancient/BloodSpell.java");
const spellbookCastableScriptSource = readNhScriptSource("script2614.cs2");
const spellbookLevelFilterScriptSource = readNhScriptSource("script2619.cs2");
const nhStakerBotSource = readNhServerSource("model/entity/player/ai/scripts/NhStakerBot.java");
const nhStakerLoadoutSource = readNhServerSource("model/entity/player/ai/NhStakerLoadout.java");
const nhStakerSelfPlayManagerSource = readNhServerSource("model/entity/player/ai/NhStakerSelfPlayManager.java");
const nhNeuralPolicyModelSource = readNhServerSource("model/entity/player/ai/NhNeuralPolicyModel.java");
const walkHandlerSource = readNhServerSource("network/incoming/handlers/WalkHandler.java");
const playerSource = readNhServerSource("model/entity/player/Player.java");
const coreWorkerSource = readNhServerSource("process/CoreWorker.java");
const entitySource = readNhServerSource("model/entity/Entity.java");
const positionSource = readNhServerSource("model/map/Position.java");
const targetRouteSource = readNhServerSource("model/map/route/routes/TargetRoute.java");
const tabInventorySource = readNhServerSource("model/inter/handlers/TabInventory.java");
const equipmentSource = readNhServerSource("model/item/containers/Equipment.java");
const consumableSource = readNhServerSource("model/item/actions/impl/Consumable.java");
const trinketOfVengeanceSource = readNhServerSource("model/item/actions/impl/TrinketOfVengeance.java");
const tickDelaySource = readNhServerSource("utility/TickDelay.java");
const tabCombatSource = readNhServerSource("model/inter/handlers/TabCombat.java");
const weaponTypeLoaderSource = readNhServerSource("data/impl/items/weapon_types.java");
const clientActorMovementSource = readNhClientSource("class329.java");
const clientActorSource = readNhClientSource("Actor.java");
const clientPlayerSource = readNhClientSource("Player.java");
const specbarRedrawSource = readNhClientScriptSource("SpecbarRedraw.rs2asm");
const combatInterfaceSpecialSource = readNhClientScriptSource("CombatInterfaceSP.rs2asm");
const weaponTypes = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "weapon-types.json"), "utf8"));
const appSource = readFileSync(path.join(projectRoot, "src", "ui", "App.tsx"), "utf8");
const viewerSource = readFileSync(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
const hudSource = readFileSync(path.join(projectRoot, "src", "ui", "NhClientHud.tsx"), "utf8");
const botPolicySource = readFileSync(path.join(projectRoot, "src", "bot", "policy.ts"), "utf8");
const runtimeCombatSource = readFileSync(path.join(projectRoot, "src", "sim", "runtimePlayerCombat.ts"), "utf8");
const consumablesSource = readFileSync(path.join(projectRoot, "src", "sim", "items", "consumables.ts"), "utf8");
const magicRequirementsSource = readFileSync(path.join(projectRoot, "src", "sim", "magic", "spellRequirements.ts"), "utf8");
const runtimePolicyOpponentSource = readFileSync(path.join(projectRoot, "src", "sim", "nh", "runtime-policy-opponent.ts"), "utf8");
const nhPolicyFeaturesSource = readFileSync(path.join(projectRoot, "src", "sim", "nh", "policy-features.ts"), "utf8");
const nhDuelSource = readFileSync(path.join(projectRoot, "src", "sim", "nh", "duel.ts"), "utf8");
const nhSelfPlayPolicyBridgeSource = nhStakerSelfPlayManagerSource.slice(
  nhStakerSelfPlayManagerSource.indexOf("private static final class NhStakerSelfPlayPolicyBridge implements")
);

function readNhServerSource(relativePath) {
  return readFileSync(
    path.join(serverRuinRoot, ...relativePath.split("/")),
    "utf8"
  );
}

function readNhClientSource(relativePath) {
  return readFileSync(
    path.join(clientStandaloneRoot, ...relativePath.split("/")),
    "utf8"
  );
}

function readNhClientScriptSource(relativePath) {
  return readFileSync(
    path.join(clientSourceRoot, "scripts", relativePath),
    "utf8"
  );
}

function readNhScriptSource(relativePath) {
  return readFileSync(
    path.join(sourceRoot, "scripts", relativePath),
    "utf8"
  );
}

function parseProperties(source) {
  const properties = new Map();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const equals = line.indexOf("=");
    if (equals < 0) {
      continue;
    }
    properties.set(line.slice(0, equals).trim(), line.slice(equals + 1).trim());
  }
  return properties;
}

function resolveConfiguredPath(value, basePath) {
  if (!value) {
    return "";
  }
  return path.isAbsolute(value) ? value : path.resolve(basePath, value);
}

function parseJavaEnumArray(source, arrayName) {
  const match = source.match(new RegExp(`\\b${arrayName}\\s*=\\s*\\{([\\s\\S]*?)\\};`));
  assert(match, `missing Java enum array ${arrayName}`);
  return [...match[1].matchAll(/\.([A-Z0-9_]+)\b/g)].map((entry) => entry[1].toLowerCase());
}

function parseRuntimeInventoryItemIds(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*normalizeNhInventorySlots\\(\\[([\\s\\S]*?)\\]\\);`));
  assert(match, `missing runtime inventory block ${constName}`);
  return [...match[1].matchAll(/itemId:\s*(\d+)/g)].map((entry) => Number(entry[1]));
}

function deployedLegacyMovementName(javaName) {
  const mapped = {
    move_n1: "step_north",
    move_s1: "step_south",
    move_e1: "step_east",
    move_w1: "step_west",
    move_e1_n1: "step_north_east",
    move_w1_n1: "step_north_west",
    move_e1_s1: "step_south_east",
    move_w1_s1: "step_south_west"
  }[javaName];
  return mapped ?? javaName;
}

function assertArrayEquals(actual, expected, label) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} mismatch: ${JSON.stringify({ actual, expected })}`
  );
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function decodeJavaStyleDeployedLegacyAction(action, surface) {
  const deployedLegacyBaseActionCount =
    surface.offence.length * surface.defence.length * surface.movement.length * surface.supply.length;
  const deployedLegacyExtraBaseActionCount =
    surface.offence.length * surface.defence.length * surface.movement.length * surface.extraSupply.length;
  const deployedLegacyActionCount = deployedLegacyBaseActionCount * surface.spec.length;
  const deployedLegacyPolicyV1ActionCount =
    deployedLegacyActionCount + deployedLegacyExtraBaseActionCount * surface.spec.length;
  const deployedLegacyPolicyActionCount =
    deployedLegacyPolicyV1ActionCount * surface.attack.length * surface.equipment.length;

  const normalizedAction = clampInt(action, 0, deployedLegacyPolicyActionCount - 1);
  const legacyAction = normalizedAction % deployedLegacyPolicyV1ActionCount;
  const variantIndex = Math.trunc(normalizedAction / deployedLegacyPolicyV1ActionCount);
  const attackIndex = variantIndex % surface.attack.length;
  const equipmentIndex = Math.trunc(variantIndex / surface.attack.length) % surface.equipment.length;
  const extendedSupplyAction = legacyAction >= deployedLegacyActionCount;
  const baseAction = extendedSupplyAction
    ? (legacyAction - deployedLegacyActionCount) % deployedLegacyExtraBaseActionCount
    : legacyAction % deployedLegacyBaseActionCount;
  const specIndex = extendedSupplyAction
    ? Math.trunc((legacyAction - deployedLegacyActionCount) / deployedLegacyExtraBaseActionCount)
    : Math.trunc(legacyAction / deployedLegacyBaseActionCount);
  const supplyPool = extendedSupplyAction ? surface.extraSupply : surface.supply;
  const supplyIndex = baseAction % supplyPool.length;
  const movementIndex = Math.trunc(baseAction / supplyPool.length) % surface.movement.length;
  const defenceIndex = Math.trunc(baseAction / (supplyPool.length * surface.movement.length)) % surface.defence.length;
  const styleIndex =
    Math.trunc(baseAction / (supplyPool.length * surface.movement.length * surface.defence.length)) %
    surface.offence.length;

  return {
    offenceStyle: surface.offence[styleIndex],
    defencePrayer: surface.defence[defenceIndex],
    movementIntent: surface.movement[movementIndex],
    supplyIntent: supplyPool[supplyIndex],
    specIntent: surface.spec[clampInt(specIndex, 0, surface.spec.length - 1)],
    extendedSupplyAction,
    attackIntent: surface.attack[attackIndex],
    equipmentIntent: surface.equipment[equipmentIndex]
  };
}

function createState(seed = 1, overrides = {}) {
  return runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 4, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "kodai-robes",
    combatStartTick: 0,
    seed,
    ...overrides
  });
}

function pinProcessOrder(state, processOrder) {
  return {
    ...state,
    processOrder,
    nextProcessOrderShuffleTick: 999,
    processOrderSeed: 1
  };
}

function combatLevels(overrides = {}) {
  return {
    ...runtimeCombat.runtimePlayerCombatDefaultLevels,
    ...overrides
  };
}

function requestLocalAttack(state) {
  return runtimeCombat.requestRuntimePlayerCombatAttack(state, "local-player", "opponent");
}

function itemRow(itemId) {
  const row = equipmentRows.find((entry) => entry.id === itemId);
  assert(row, `missing equipment bonus row for item ${itemId}`);
  return row;
}

function serverItem(itemId) {
  const item = Array.isArray(serverItems)
    ? serverItems.find((entry) => entry.id === itemId)
    : serverItems[String(itemId)] ?? serverItems[itemId];
  assert(item, `missing generated server item row for item ${itemId}`);
  return item;
}

function assertEquipmentRowMatchesServerItem(itemId) {
  const row = itemRow(itemId);
  const source = serverItem(itemId);
  for (const key of Object.keys(row.bonuses)) {
    assert(
      row.bonuses[key] === source.bonuses[key],
      `equipment bonus row for ${itemId} ${key} should match exported Java item info: ${row.bonuses[key]} !== ${source.bonuses[key]}`
    );
  }
}

function bonusDelta(withEquipment, withoutEquipment) {
  const withBonuses = equipment.aggregateVisibleEquipmentBonuses(withEquipment, equipmentRows);
  const withoutBonuses = equipment.aggregateVisibleEquipmentBonuses(withoutEquipment, equipmentRows);
  return Object.fromEntries(
    Object.keys(withBonuses).map((key) => [key, withoutBonuses[key] - withBonuses[key]])
  );
}

function assertUnequipDeltaMatchesRemovedItem(label, withEquipment, withoutEquipment, removedItem) {
  const row = itemRow(removedItem.itemId);
  const delta = bonusDelta(withEquipment, withoutEquipment);
  for (const key of Object.keys(row.bonuses)) {
    const expected = -row.bonuses[key];
    assert(
      delta[key] === expected,
      `${label} ${key} delta should exactly subtract ${removedItem.name}'s Java-exported equipment bonus: got ${delta[key]}, expected ${expected}`
    );
  }
  return delta;
}

function requestLocalSpell(state, spellId = "ice-barrage") {
  return runtimeCombat.requestRuntimePlayerCombatSpell(state, "local-player", "opponent", spellId);
}

function requestOpponentSpell(state, spellId = "ice-barrage") {
  return runtimeCombat.requestRuntimePlayerCombatSpell(state, "opponent", "local-player", spellId);
}

function requestOpponentAttack(state) {
  return runtimeCombat.requestRuntimePlayerCombatAttack(state, "opponent", "local-player");
}

function advance(state, tiles = {}) {
  return runtimeCombat.advanceRuntimePlayerCombat(state, {
    tiles: {
      "local-player": tiles.local ?? state.actors["local-player"].tile,
      opponent: tiles.opponent ?? state.actors.opponent.tile
    }
  });
}

function stateWithLocalEquipment(state, equipment) {
  return runtimeCombat.syncRuntimePlayerCombatStateToInput(state, {
    tiles: {
      "local-player": state.actors["local-player"].tile,
      opponent: state.actors.opponent.tile
    },
    equipment: {
      "local-player": equipment
    }
  });
}

function expectedRuntimeHitChance(state, attackerId, defenderId, attackStyle, options = {}) {
  const attackEstimate = runtimeCombat.runtimePlayerCombatDamageEstimate(
    state.actors[attackerId],
    state.actors[defenderId],
    attackStyle
  );
  const defenceStyle = options.defenceStyle ?? attackStyle;
  const defenceEstimate =
    defenceStyle === attackStyle
      ? attackEstimate
      : runtimeCombat.runtimePlayerCombatDamageEstimate(
          state.actors[attackerId],
          state.actors[defenderId],
          defenceStyle
        );
  return combatFormulas.hitChance(
    attackEstimate.attackRoll * (options.attackRollMultiplier ?? 1),
    defenceEstimate.defenceRoll * (options.defenceRollMultiplier ?? 1)
  );
}

function nearlyEqual(left, right, epsilon = 1e-12) {
  return Math.abs(left - right) <= epsilon;
}

function findLocalBoltProc(ammoItemId, ammoName, effectId, seedStart = 800, seedEnd = 5000) {
  const equipment = {
    ...nhLoadouts.nhLoadouts["acb-hides"].equipment,
    ammo: { itemId: ammoItemId, name: ammoName }
  };
  for (let seed = seedStart; seed < seedEnd; seed += 1) {
    let state = createState(seed, {
      localTile: { x: 0, z: 0 },
      opponentTile: { x: 4, z: 0 },
      localLoadoutId: "acb-hides"
    });
    state = stateWithLocalEquipment(state, equipment);
    state = {
      ...state,
      actors: {
        ...state.actors,
        "local-player": {
          ...state.actors["local-player"],
          hitpoints: 50
        }
      }
    };
    const result = advance(requestLocalAttack(state));
    const queuedHit = result.state.queuedHits.find((hit) => hit.attackerId === "local-player");
    if (queuedHit?.boltEffect?.id === effectId) {
      return result.state;
    }
  }
  throw new Error(`could not find deterministic ${effectId} bolt proc for ammo ${ammoItemId}`);
}

function findAcbSpecialDoubledBoltProc(seedStart = 5000, seedEnd = 12000) {
  const equipment = {
    ...nhLoadouts.nhLoadouts["acb-hides"].equipment,
    weapon: { itemId: 11785, name: "Armadyl crossbow" },
    ammo: { itemId: 21946, name: "Diamond dragon bolts (e)" }
  };
  for (let seed = seedStart; seed < seedEnd; seed += 1) {
    const normalResult = advance(requestLocalAttack(stateWithLocalEquipment(createState(seed), equipment)));
    const normalHit = normalResult.state.queuedHits.find((hit) => hit.attackerId === "local-player");

    const specialBase = stateWithLocalEquipment(createState(seed), equipment);
    const specialResult = advance(requestLocalAttack(runtimeCombat.toggleRuntimePlayerCombatSpecial(specialBase, "local-player").state));
    const specialHit = specialResult.state.queuedHits.find((hit) => hit.attackerId === "local-player");
    if (!normalHit?.boltEffect && specialHit?.boltEffect?.id === "diamond") {
      return { normalHit, specialHit, state: specialResult.state };
    }
  }
  throw new Error("could not find deterministic ACB doubled bolt-proc seed");
}

function findSuccessfulZaryteSpecialBoltProc(seedStart = 12000, seedEnd = 22000) {
  const equipment = {
    ...nhLoadouts.nhLoadouts["acb-hides"].equipment,
    weapon: { itemId: 26374, name: "Zaryte crossbow" },
    ammo: { itemId: 21946, name: "Diamond dragon bolts (e)" }
  };
  for (let seed = seedStart; seed < seedEnd; seed += 1) {
    const state = stateWithLocalEquipment(createState(seed, {
      localSpecialEnergy: 100
    }), equipment);
    const result = advance(requestLocalAttack(runtimeCombat.toggleRuntimePlayerCombatSpecial(state, "local-player").state));
    const queuedHit = result.state.queuedHits.find((hit) => hit.attackerId === "local-player");
    if (
      queuedHit?.weaponId === "zaryte_crossbow" &&
      queuedHit.boltEffect?.id === "diamond" &&
      queuedHit.hitChance > 0 &&
      queuedHit.hitChance < 1
    ) {
      return { queuedHit, state: result.state };
    }
  }
  throw new Error("could not find deterministic successful Zaryte special bolt-proc seed");
}

function resolveForcedLocalQueuedHit(state, damage = 20) {
  const queuedHit = state.queuedHits.find((hit) => hit.attackerId === "local-player");
  assert(queuedHit, `expected a local queued hit to force: ${JSON.stringify(state.queuedHits)}`);
  let nextState = {
    ...state,
    queuedHits: [
      {
        ...queuedHit,
        damage,
        rawDamage: damage
      }
    ]
  };
  while (nextState.tick < queuedHit.dueTick) {
    nextState = advance(nextState).state;
  }
  return advance(nextState).state;
}

function freezeActor(state, actorId, untilTick, sourceId = undefined) {
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...state.actors[actorId],
        locks: {
          ...state.actors[actorId].locks,
          freezeUntilTick: untilTick,
          ...(sourceId === undefined ? {} : { freezeSourceId: sourceId })
        }
      }
    }
  };
}

function freezeBothActors(state, untilTick) {
  return freezeActor(freezeActor(state, "local-player", untilTick), "opponent", untilTick);
}

function attackEventTicksFor(loadoutId, cooldownTicks, tiles, options = {}) {
  let state = createState(31 + cooldownTicks, {
    localTile: tiles.local,
    opponentTile: tiles.opponent,
    localLoadoutId: loadoutId,
    localAttackSetIndex: options.attackSetIndex ?? 0
  });
  state = options.spellId ? requestLocalSpell(state, options.spellId) : requestLocalAttack(state);
  for (let index = 0; index <= cooldownTicks; index += 1) {
    state = advance(state).state;
  }
  return state.events
    .filter((event) => event.kind === "attack" && event.attackerId === "local-player")
    .map((event) => event.tick);
}

function damageFromState(seed, opponentPrayers = []) {
  let state = createState(seed, { opponentPrayers });
  state = requestLocalAttack(state);
  let result = advance(state);
  state = result.state;
  for (let index = 0; index < 3; index += 1) {
    result = advance(state);
    state = result.state;
  }
  return state.events.find((event) => event.kind === "hitsplat")?.damage ?? 0;
}

function assertAttackAnimationWindow(result, actorId, label) {
  const actor = result.state.actors[actorId];
  const attack = result.state.events.find((event) => event.kind === "attack" && event.attackerId === actorId);
  const hit = result.state.queuedHits.find((candidate) => candidate.attackerId === actorId);
  assert(attack, `${label} should create an attack event before any queued hit can resolve`);
  assert(
    actor.actionSequenceName === attack.sequenceName &&
      actor.actionStartedAtTick === attack.tick &&
      Number.isFinite(actor.actionStartedAtClientCycle) &&
      actor.actionUntilTick > attack.tick,
    `${label} should start a visible action animation window with the queued attack: ${JSON.stringify({ actor, attack, hit })}`
  );
  if (hit) {
    const sourceDelayEndTick = attack.tick + attack.hitDelayTicks;
    assert(
      actor.actionUntilTick >= sourceDelayEndTick,
      `${label} action window should cover the source hit-delay boundary so hits cannot land detached from the attack animation: ${JSON.stringify({ actor, attack, hit, sourceDelayEndTick })}`
    );
  }
}

assert(playerCombatSource.includes("TargetRoute.set(player, target"), "Nh PlayerCombat should route to attack targets before attacking");
assert(playerCombatSource.includes("updateLastAttack(weaponType.attackTicks)"), "Nh PlayerCombat melee attacks should update weapon cooldown ticks");
assert(playerCombatSource.includes("attackTicks = type == AttackType.RAPID_RANGED ? weaponType.attackTicks - 1 : weaponType.attackTicks"), "Nh ranged attacks should reduce weapon ticks for rapid ranged attack type");
assert(playerCombatSource.includes("target.hit(new Hit(player, style, type)"), "Nh PlayerCombat should apply melee hits through target.hit");
assert(
  playerCombatSource.includes("public void toggleSpecial()") &&
    playerCombatSource.includes("queueGraniteMaulSpecial()") &&
    playerCombatSource.includes("specialActive = wepDef.special") &&
    playerCombatSource.includes("Config.SPECIAL_ACTIVE.set(player, 1)"),
  "Nh PlayerCombat.toggleSpecial should activate regular specials and queue Granite maul clicks"
);
assert(
  playerCombatSource.includes("if(amount > energy / 10)") &&
    playerCombatSource.includes("Config.SPECIAL_ENERGY.set(player, energy - (amount * 10))") &&
    playerCombatSource.includes("specialActive = null"),
  "Nh PlayerCombat.handleSpecial should clear active state and drain varp-300 special energy"
);
assert(
  playerCombatSource.includes("graniteMaulTimeoutTicks = 5") &&
    playerCombatSource.includes("graniteMaulTimeoutTicks == 4") &&
    playerCombatSource.includes("graniteMaulSpecials = Math.min(graniteMaulSpecials, energy / 500)") &&
    playerCombatSource.includes("Config.SPECIAL_ENERGY.set(player, energy)"),
  "Nh Granite maul queue should auto-attack after one tick, timeout after five ticks, and drain 50 percent per consumed spec"
);
assert(
  configSource.includes("ATTACK_SET = varp(43") &&
    configSource.includes("AUTO_RETALIATE = varp(172") &&
    configSource.includes("WEAPON_TYPE = varpbit(357") &&
    configSource.includes("SPECIAL_ENERGY = varp(300, true).defaultValue(1000)") &&
    configSource.includes("SPECIAL_ACTIVE = varp(301") &&
    configSource.includes("SPECIAL_ORB_STATE = varpbit(8121"),
  "Nh combat tab config ids should still match the trainer HUD varp/varpbit mapping"
);
assert(combatSource.includes("lastAttackTickDelay + attackDelayTicks"), "Nh Combat attack delay should combine weapon and additive delays");
assert(
  !hitSource.includes("PVP_MAGIC_ACCURACY_MODIFIER") && !hitSource.includes("PVP_MELEE_ACCURACY_MODIFIER"),
  "Nh Hit should not apply hidden global PvP magic or melee accuracy multipliers"
);
assert(hitSource.includes("return clientDelay(delay, 16)"), "Nh Hit default clientDelay should use the 16ms cycle-rate bridge");
assert(
  playerCombatSource.includes("private void postDefend(Hit hit)") &&
    playerCombatSource.includes("hit.damage *= 0.60") &&
    hitSource.includes("target.hitListener.postDefend.accept(this)") &&
    combatUtilsSource.includes("addXp(Player player, Entity victim, AttackStyle attackStyle, AttackType attackType, int damageDealt)"),
  "Nh should finalize protection-reduced PvP Hit.damage before XP is awarded and before the queued hit later finishes"
);
assert(combatUtilsSource.includes("MAGIC_CALC_SLOTS") && combatUtilsSource.includes("interferenceCount * 0.45"), "Nh magic accuracy should apply chest/legs interference");
assert(projectileSource.includes("return delay + duration"), "Nh Projectile.send should return delay plus duration for hit timing");
assert(
  projectileSource.includes("BOLT = new Projectile(27, 38, 36, 41, 51, 5, 5, 11)") &&
    projectileSource.includes("DRAGON_BOLT = new Projectile(1468, 38, 36, 41, 51, 5, 5, 11)"),
  "Nh projectile source should distinguish standard and dragon bolt projectile payloads"
);
assert(
  rangedAmmoSource.includes("DRAGON_DRAGONSTONE_BOLTS(new RangedData(Projectile.DRAGON_BOLT)") &&
    rangedAmmoSource.includes("DRAGON_BOLTS(new RangedData(Projectile.DRAGON_BOLT)"),
  "Nh dragon-bolt ammo should use Projectile.DRAGON_BOLT instead of the standard bolt gfx"
);
assert(
  rangedAmmoSource.includes("DIAMOND_BOLTS(new RangedData(Projectile.BOLT), new DiamondBoltEffect())") &&
    rangedAmmoSource.includes("DRAGON_DIAMOND_BOLTS(new RangedData(Projectile.DRAGON_BOLT), new DiamondBoltEffect())") &&
    rangedAmmoSource.includes("DRAGON_DRAGONSTONE_BOLTS(new RangedData(Projectile.DRAGON_BOLT), new DragonBoltEffect())") &&
    rangedAmmoSource.includes("DRAGON_ONYX_BOLTS(new RangedData(Projectile.DRAGON_BOLT), new OnyxBoltEffect())"),
  "Nh bolt ammo should wire Diamond, Dragonstone, and Onyx effects to the matching bolt item families"
);
assert(
  diamondBoltEffectSource.includes("Random.rollPercent(target.player != null ? 5 : 10)") &&
    diamondBoltEffectSource.includes("target.graphics(758)") &&
    diamondBoltEffectSource.includes("hit.boostDamage(0.15).ignoreDefence()") &&
    dragonBoltEffectSource.includes("Random.rollPercent(6)") &&
    dragonBoltEffectSource.includes("target.graphics(756)") &&
    dragonBoltEffectSource.includes("hit.boostDamage(0.45)") &&
    onyxBoltEffectSource.includes("int procPercent = target.player != null ? 10 : 11") &&
    onyxBoltEffectSource.includes("NhDeterministicReplay.onyxProc(") &&
    onyxBoltEffectSource.includes("? Random.rollPercent(procPercent)") &&
    onyxBoltEffectSource.includes("expectNhStakerRandomDamageBoost(procPercent * 0.01D, 0.20D, proc, \"onyx_bolt\")") &&
    onyxBoltEffectSource.includes("target.graphics(753)") &&
    onyxBoltEffectSource.includes("hit.boostDamage(0.20)") &&
    onyxBoltEffectSource.includes("hit.attacker.incrementHp(heal)"),
  "Nh bolt effect sources should preserve player proc chances, graphics, damage boosts, diamond defence ignore, and onyx healing"
);
assert(
  armadylCrossbowSource.includes("new Projectile(301, 38, 36, 41, 51, 5, 5, 11)") &&
    armadylCrossbowSource.includes(".boostAttack(1.0)") &&
    runtimeCombatSource.includes('id: "armadyl_crossbow", drainPercent: 50'),
  "Armadyl crossbow special should use projectile 301, double accuracy, and current OSRS 50 percent drain"
);
assert(
  graniteMaulSource.includes("player.animate(1667)") &&
    graniteMaulSource.includes("player.graphics(340, 96, 0)") &&
    graniteMaulSource.includes("player.publicSound(2715)") &&
    graniteMaulSource.includes("target.hit(new Hit(player, attackStyle, attackType).randDamage(maxDamage))") &&
    graniteMaulSource.includes("return 50"),
  "Nh Granite maul special should use animation 1667, graphics 340, sound 2715, immediate hit, and 50 percent drain"
);
assert(
  playerCombatSource.includes("player.publicSound(weaponType.attackSound, 1, 1)") &&
    armadylGodswordSource.includes("player.publicSound(3869)") &&
    vestasLongswordSource.includes("player.animate(7515)") &&
    !vestasLongswordSource.includes("publicSound(") &&
    consumableSource.includes("player.privateSound(2393)") &&
    consumableSource.includes("player.privateSound(2401)"),
  "Nh combat sounds should come from WeaponType.attackSound, AGS special sound 3869, VLS source has animation 7515 but no explicit publicSound, and supplies use private eat/drink sounds 2393/2401"
);
assert(
  specbarRedrawSource.includes("get_varp               301") &&
    specbarRedrawSource.includes("iconst                 16776960") &&
    specbarRedrawSource.includes("get_varp               300") &&
    specbarRedrawSource.includes("Special Attack: ") &&
    specbarRedrawSource.includes("iconst                 12907") &&
    combatInterfaceSpecialSource.includes("iconst                 301") &&
    combatInterfaceSpecialSource.includes("iconst                 300"),
  "Nh client special bar script should still be varp-301 active color plus varp-300 energy text/fill"
);
assert(
  weaponTypes.ARMADYL_CROSSBOW?.config === 5 &&
    weaponTypes.ARMADYL_CROSSBOW?.attackTicks === 6 &&
    weaponTypes.ARMADYL_CROSSBOW?.attackSets?.[1]?.type === "RAPID_RANGED" &&
    weaponTypes.GRANITE_MAUL?.config === 2 &&
    weaponTypes.GRANITE_MAUL?.attackTicks === 7 &&
    weaponTypes.GRANITE_MAUL?.attackAnimation === 1665,
  "exported Nh WeaponType definitions should keep ACB and Granite maul config/tick/animation data"
);
assert(
  weaponTypeLoaderSource.includes("orderedSets[set.child / 4] = set") &&
    readFileSync(path.join(projectRoot, "src", "render", "nhCombat.ts"), "utf8").includes("const index = Math.trunc(child / 4)") &&
    readFileSync(path.join(projectRoot, "src", "render", "nhCombat.ts"), "utf8").includes("orderedSets[index] = { child, type: record.type, style: record.style }"),
  "trainer WeaponType store should mirror Nh weapon_types loader and place attack sets by child / 4."
);
const weaponTypeStore = nhCombat.createNhWeaponTypeDefinitionStore(weaponTypes);
const wandType = weaponTypeStore.get("WAND");
assert(
  weaponTypes.WAND?.attackAnimation === 393 &&
    weaponTypes.WAND?.renderAnimations?.[0] === 813 &&
    weaponTypes.WAND?.renderAnimations?.[2] === 1205,
  "exported source WAND type should keep staff bash attack animation 393 and wand render animations."
);
assert(
  wandType?.config === 18 &&
    wandType.attackSets[0]?.child === 3 &&
    wandType.attackSets[1]?.child === 7 &&
    wandType.attackSets[2] === null &&
    wandType.attackSets[3]?.child === 15,
  "Kodai/WAND attack sets should be sparse like Nh config 18: Bash, Pound, no child 12, Focus."
);
for (const soundId of [
  102, 104, 106, 168, 169, 171, 227, 2238, 2242, 2244, 2246, 2393, 2401, 2500, 2555, 2563, 2693, 2695,
  2714, 2715, 2720, 2907, 2910, 2917, 3846, 3869, 5027, 6182
]) {
  assert(
    existsSync(path.join(projectRoot, "fixtures", "render", "sounds", `sound-${soundId}.wav`)),
    `exported sound-${soundId}.wav should exist for runtime game sound playback`
  );
}
const foodSoundResult = runtimeCombat.consumeRuntimePlayerCombatSupply(createState(141, {
  localLevels: combatLevels({ hitpoints: 50 })
}), "local-player", "manta_ray");
const foodSoundEvent = foodSoundResult.state.events.find((event) => event.kind === "supply");
assert(
  foodSoundResult.consumed &&
    JSON.stringify(foodSoundEvent?.soundIds) === JSON.stringify([2393]) &&
    foodSoundEvent?.soundChannel === "sound-effects",
  `Manta ray supply event should emit source private eat sound 2393 on sound-effects: ${JSON.stringify(foodSoundEvent)}`
);
let foodTargetCancelState = requestLocalAttack(createState(143, {
  localLevels: combatLevels({ hitpoints: 50 })
}));
const foodTargetCancelResult = runtimeCombat.consumeRuntimePlayerCombatSupply(
  foodTargetCancelState,
  "local-player",
  "manta_ray"
);
let foodTargetCancelAdvanced = foodTargetCancelResult.state;
for (let index = 0; index < 6; index += 1) {
  foodTargetCancelAdvanced = advance(foodTargetCancelAdvanced).state;
}
assert(
  foodTargetCancelResult.consumed &&
    foodTargetCancelResult.state.actors["local-player"].targetId === null &&
    foodTargetCancelResult.state.actors["local-player"].queuedSpellId === null &&
    !foodTargetCancelAdvanced.events.some((event) => event.kind === "attack" && event.attackerId === "local-player"),
  `Food should mirror Consumable.animEat resetActions(..., resetCombat=true) and cancel the active DCB target: ${JSON.stringify({
    actor: foodTargetCancelResult.state.actors["local-player"],
    events: foodTargetCancelAdvanced.events
  })}`
);
const drinkSoundResult = runtimeCombat.consumeRuntimePlayerCombatSupply(createState(142, {
  localLevels: combatLevels({ attack: 90, strength: 90, defence: 90 })
}), "local-player", "super_combat");
const drinkSoundEvent = drinkSoundResult.state.events.find((event) => event.kind === "supply");
assert(
  drinkSoundResult.consumed &&
    JSON.stringify(drinkSoundEvent?.soundIds) === JSON.stringify([2401]) &&
    drinkSoundEvent?.soundChannel === "sound-effects",
  `Super combat supply event should emit source private drink sound 2401 on sound-effects: ${JSON.stringify(drinkSoundEvent)}`
);
let drinkTargetCancelState = requestLocalAttack(createState(144, {
  localLevels: combatLevels({ attack: 90, strength: 90, defence: 90 })
}));
const drinkTargetCancelResult = runtimeCombat.consumeRuntimePlayerCombatSupply(
  drinkTargetCancelState,
  "local-player",
  "super_combat"
);
const drinkTargetCancelAdvanced = advance(drinkTargetCancelResult.state).state;
assert(
  drinkTargetCancelResult.consumed &&
    drinkTargetCancelResult.state.actors["local-player"].targetId === null &&
    drinkTargetCancelResult.state.actors["local-player"].queuedSpellId === null &&
    !drinkTargetCancelAdvanced.events.some((event) => event.kind === "attack" && event.attackerId === "local-player"),
  `Potions should mirror Consumable.animDrink resetActions(..., resetCombat=true) and cancel the active DCB target: ${JSON.stringify({
    actor: drinkTargetCancelResult.state.actors["local-player"],
    events: drinkTargetCancelAdvanced.events
  })}`
);
assert(
  /if \(action\.kind === "eat" \|\| action\.kind === "drink"\)[\s\S]*targetId: null,[\s\S]*queuedSpellId: null,/.test(viewerSource),
  "RuntimeSceneViewer queued inventory eat/drink path should clear the local combat target like the shared supply helper"
);
for (const spotanimFile of [
  "onyx_bolt_proc.glb",
  "onyx_bolt_proc.mesh.json",
  "dragonstone_bolt_proc.glb",
  "dragonstone_bolt_proc.mesh.json",
  "diamond_bolt_proc.glb",
  "diamond_bolt_proc.mesh.json"
]) {
  assert(
    existsSync(path.join(projectRoot, "fixtures", "render", "spotanims", spotanimFile)),
    `exported ${spotanimFile} should exist for bolt proc spotanim playback`
  );
}
assert(
  clientActorSource.includes("this.hitSplatCycles[var9] = var5 + var11 + var6") &&
    clientActorSource.includes("if(var13.definition.field3296 == var8.field3296)") &&
    clientActorSource.includes("var13.method2246(var2 + var4, var5, var6, var3);"),
  "Nh client Actor should keep per-instance hitsplat cycles and one updated health bar per matching definition"
);
assert(targetSpellSource.includes(".clientDelay(projectileDuration, 19)"), "Nh target spells should use the magic projectile cycle-rate bridge");
assert(targetSpellSource.includes('getStats().check(StatType.Magic, lvlReq, "cast this spell")'), "Nh TargetSpell.cast should gate primary casts on current Magic level");
assert(
  playerCombatSource.includes("if(!spell.cast(player, target))") &&
    playerCombatSource.includes("reset();") &&
    playerCombatSource.includes("updateLastAttack(targetSpellAttackTicks(castingWeaponId, ancientSpellbook))") &&
    playerCombatSource.includes("DmmRuntimeItems.ZURIELS_STAFF_DMM ? 4 : 5"),
  "Nh PlayerCombat.attackWithMagic should reset failed spell casts before applying the casting weapon's shared cooldown"
);
assert(bloodBarrageSource.includes("setLvlReq(92)"), "Nh Blood Barrage source should require Magic level 92");
assert(iceBarrageSource.includes("setLvlReq(94)"), "Nh Ice Barrage source should require Magic level 94");
assert(bloodBlitzSource.includes("setLvlReq(80)"), "Nh Blood Blitz source should require Magic level 80");
assert(iceBlitzSource.includes("setLvlReq(82)"), "Nh Ice Blitz source should require Magic level 82");
assert(
  spellbookCastableScriptSource.includes("stat(magic) < oc_param($obj0, spell_levelreq)") &&
    spellbookCastableScriptSource.includes("if_settrans(0, $component1)") &&
    spellbookLevelFilterScriptSource.includes("stat_base(magic) < $int1") &&
    spellbookLevelFilterScriptSource.includes("stat(magic) < $int1"),
  "Nh spellbook scripts should use current Magic for icon disabled state and base+current Magic for lack-level filtering"
);
assert(
  spellRequirements.nhMagicSpellLevelRequirement("blood-blitz") === 80 &&
    spellRequirements.nhMagicSpellLevelRequirement("ice-blitz") === 82 &&
    spellRequirements.nhMagicSpellLevelRequirement("blood-barrage") === 92 &&
    spellRequirements.nhMagicSpellLevelRequirement("ice-barrage") === 94 &&
    spellRequirements.nhMagicSpellCurrentLevelCanCast("ice-barrage", 93) === false &&
    spellRequirements.nhMagicSpellLevelFilterAllows("ice-barrage", 93, 99) === true,
  "trainer spell requirement helper should preserve Nh current-level cast gating and script2619 filtering distinction"
);
assert(
  hudSource.includes("nhMagicSpellCurrentLevelCanCast") &&
    hudSource.includes("data-current-magic-level") &&
    hudSource.includes("data-magic-level-can-cast") &&
    hudSource.includes("data-source-castable-state"),
  "trainer spellbook icon layer should expose Nh current Magic disabled-sprite state for verifier-visible UI parity"
);
assert(
  runtimeCombatSource.includes("requiredMagicLevel: nhMagicSpellLevelRequirementById[\"blood-blitz\"]") &&
    runtimeCombatSource.includes("requiredMagicLevel: nhMagicSpellLevelRequirementById[\"ice-blitz\"]") &&
    runtimeCombatSource.includes("requiredMagicLevel: nhMagicSpellLevelRequirementById[\"blood-barrage\"]") &&
    runtimeCombatSource.includes("requiredMagicLevel: nhMagicSpellLevelRequirementById[\"ice-barrage\"]") &&
    magicRequirementsSource.includes("TargetSpell.cast") &&
    magicRequirementsSource.includes("script2619") &&
    magicRequirementsSource.includes("You need Magic level of") &&
    runtimeCombatSource.includes("resetRuntimePlayerCombatFailedSpellCast") &&
    !runtimeCombatSource.includes('readonly kind: "message"'),
  "trainer spell combat definitions should carry Nh magic level requirements without adding chat/message events to the render combat stream"
);
assert(iceBarrageSource.includes("setMaxDamage(30)"), "Nh Ice Barrage source should keep base max damage at 30");
assert(bloodBlitzSource.includes("setMaxDamage(25)"), "Nh Blood Blitz source should keep base max damage at 25");
assert(iceBlitzSource.includes("setMaxDamage(26)"), "Nh Ice Blitz source should keep base max damage at 26");
assert(
  bloodBlitzSource.includes("setAnimationId(1978)") &&
    bloodBlitzSource.includes("setProjectile(new Projectile(374, 43, 0, 51, 56, 10, 16, 64))") &&
    iceBlitzSource.includes("setAnimationId(1978)") &&
    iceBlitzSource.includes("setCastGfx(366, 124, 0)") &&
    iceBlitzSource.includes("setProjectile(new Projectile(56, 10))") &&
    iceBlitzSource.includes("hold(hit, target, 15, true)"),
  "Nh Blitz sources should preserve animation 1978, Blood Blitz projectile 374, Ice Blitz cast gfx 366, and 15-second freeze"
);
assert(
  targetSpellSource.includes("entity.publicSound(castSound[0], castSound[1], castSound[2])") &&
    targetSpellSource.includes("t.publicSound(227, 1, 0)") &&
    targetSpellSource.includes("t.publicSound(hitSoundId, 1, 0)") &&
    bloodBlitzSource.includes("setCastSound(106, 1, 0)") &&
    bloodBlitzSource.includes("setHitSound(104)") &&
    iceBlitzSource.includes("setCastSound(171, 1, 0)") &&
    iceBlitzSource.includes("setHitSound(169)") &&
    bloodBarrageSource.includes("setCastSound(106, 1, 0)") &&
    bloodBarrageSource.includes("setHitSound(102)") &&
    iceBarrageSource.includes("setCastSound(171, 1, 0)") &&
    iceBarrageSource.includes("setHitSound(168)"),
  "Nh target spells should preserve cast, hit, and splash sound IDs for Blitz/Barrage spells"
);
assert(
  bloodSpellSource.includes("int healAmount = hit.damage / 4") &&
    bloodSpellSource.includes("hasId(22647)") &&
    bloodSpellSource.includes("hit.attacker.incrementHp(healAmount)"),
  "Nh BloodSpell should heal on afterHit using integer damage / 4 and the Zuriel's staff multiplier"
);
assert(
  playerSource.includes("if(++specialRestoreTicks >= 50)") &&
    playerSource.includes("combat.restoreSpecial(10)") &&
    playerCombatSource.includes("int newEnergy = Math.min(1000, energy + (percent * 10))"),
  "Nh Player.tick should restore 10 percent special energy every 50 ticks after combat.attack"
);
assert(
  runtimeCombatSource.includes("tickRuntimePlayerCombatSpecialRestore") &&
    runtimeCombatSource.includes("runtimePlayerCombatSpecialRestorePeriodTicks = 50") &&
    runtimeCombatSource.includes("Player.tick() increments specialRestoreTicks after combat.attack()"),
  "trainer runtime should port Nh post-attack special regeneration timing"
);
assert(
  playerCombatSource.includes("public TargetSpell queuedSpell, autocastSpell") &&
    playerCombatSource.includes("if(queuedSpell == null)") &&
    playerCombatSource.includes("spell = autocastSpell") &&
    playerCombatSource.includes("spell = queuedSpell") &&
    playerCombatSource.includes("if(!autocast)") &&
    playerCombatSource.includes("reset();"),
  "Nh PlayerCombat should keep selected spells one-shot and autocast spells persistent"
);
assert(
  runtimeCombatSource.includes("runtimeBotDefaultAutocastSpell") &&
    runtimeCombatSource.includes("actorId === \"local-player\"") &&
    runtimeCombatSource.includes("actor.loadoutId !== \"kodai-robes\"") &&
    runtimeCombatSource.includes("runtimePlayerCombatSpellDefinitions[\"ice-barrage\"]"),
  "trainer runtime should keep Kodai default autocast as a bot-only fallback while local/player Kodai remains normal unless selected/autocast"
);
assert(
  runtimeCombatSource.includes("export function syncRuntimePlayerCombatStateToInput") &&
    viewerSource.includes("syncRuntimePlayerCombatStateToInput(manualCombatStateRef.current") &&
    viewerSource.includes("opponent: manualOpponentRef.current.loadoutId"),
  "manual combat commands should sync combat-state loadouts from the visible actors before queuing player/opponent attacks"
);
assert(walkHandlerSource.includes("player.resetActions(true, true, true)"), "Nh WalkHandler should reset movement and combat before routing walk packets");
assert(
  playerSource.includes("if(resetCombat && combat.getTarget() != null)") &&
    playerSource.includes("combat.reset()"),
  "Nh Player.resetActions should clear combat target when resetCombat is true"
);
assert(
    tabInventorySource.includes("player.getEquipment().equip(item)") &&
    tabInventorySource.includes("player.resetActions(false, player.getMovement().following != null, true)") &&
    viewerSource.includes("inventoryEquipResetActions") &&
    viewerSource.includes('resetRuntimePlayerCombatActorTarget(nextCombatState, "local-player")') &&
    viewerSource.includes("TabInventory.click -> Equipment.equip(item); player.resetActions(false, following != null, true)"),
  "trainer inventory equip should port Nh TabInventory resetActions(..., resetCombat=true) so gear switches stop the current attack target."
);
assert(
  equipmentSource.includes("if(updatedSlots[SLOT_WEAPON])") &&
    equipmentSource.includes("player.getCombat().updateWeapon(false)") &&
    equipmentSource.includes("// player.resetAnimation();") &&
    playerCombatSource.includes("int setIndex = Config.ATTACK_SET.get(player)") &&
    playerCombatSource.includes("Config.ATTACK_SET.set(player, resolvedIndex)") &&
    playerCombatSource.includes("for(int i = index; i >= 0; i--)") &&
    tabCombatSource.includes("public static void updateAutocast(Player player, boolean login)") &&
    tabCombatSource.includes("resetAutocast(player)") &&
    runtimeCombatSource.includes("weaponSlotChanged") &&
    runtimeCombatSource.includes("resolveRuntimePlayerCombatAttackSetIndexForWeapon") &&
    runtimeCombatSource.includes("autocastSpellId: respawning || loadoutChanged || weaponSlotChanged ? null : actor.autocastSpellId") &&
    runtimeCombatSource.includes("defensiveCast: respawning || loadoutChanged || weaponSlotChanged ? false : actor.defensiveCast") &&
    runtimeCombatSource.includes("const actionStillActive = !respawning && actor.actionSequenceName !== null && tick < actor.actionUntilTick"),
  "trainer weapon-slot sync should port Nh Equipment.sendUpdates -> updateWeapon(false), persistent Config.ATTACK_SET resolution, and autocast clearing without resetting the active attack animation."
);
assert(
  playerCombatSource.includes("player.faceNone(!isDead())") &&
    playerCombatSource.includes("TargetRoute.reset(player)"),
  "Nh PlayerCombat.reset should clear target-facing and target routes"
);
assert(
  targetRouteSource.includes("entity.getCombat().reset()"),
  "Nh TargetRoute should reset combat when target routing fails"
);
assert(
  viewerSource.includes("resetRuntimePlayerCombatActorTarget(manualCombatStateRef.current, request.actorId)") &&
    viewerSource.includes("frozen melee step-in attempt must not"),
  "trainer route-block handling should mirror TargetRoute failure by clearing stale combat targets when freeze blocks step-in melee"
);
assert(
  playerSource.includes("combat.preAttack();") &&
    playerSource.includes("TargetRoute.beforeMovement(this);") &&
    playerSource.includes("movement.process();") &&
    playerSource.includes("TargetRoute.afterMovement(this);") &&
    playerSource.includes("combat.attack();") &&
    runtimeCombatSource.includes("runtimePlayerCombatTargetRouteProfile") &&
    runtimeCombatSource.includes("targetRouteMovementConsumed") &&
    viewerSource.includes("preAttackRouteManualActorToCombatTarget") &&
    viewerSource.includes("TargetRoute.beforeMovement()") &&
    viewerSource.includes("and Movement.process() in CoreWorker PID order") &&
    viewerSource.includes("advanceManualActorTargetRouteTick(routed.actor, input.acceptedClientCycle)") &&
    viewerSource.includes("Only this tick's walk/run step survives") &&
    viewerSource.includes("const localHasTargetRoute = manualActorHasActiveCombatTargetRoute") &&
    viewerSource.includes("const opponentHasTargetRoute = manualActorHasActiveCombatTargetRoute") &&
    viewerSource.includes("targetRouteMovementConsumed: {"),
  "manual melee target routing should port Nh preAttack/TargetRoute/movement ordering before the attack gate"
);
assert(
  coreWorkerSource.includes("players.scramble()") &&
    coreWorkerSource.includes("Random.get(40, 60)") &&
    runtimeCombatSource.includes("processOrder") &&
    runtimeCombatSource.includes("nextProcessOrderShuffleTick") &&
    runtimeCombatSource.includes("runtimePlayerCombatProcessOrderStateForTick") &&
    runtimeCombatSource.includes("for (const actorId of processOrderState.processOrder)") &&
    runtimeCombatSource.includes("preMovementTiles") &&
    runtimeCombatSource.includes("mergeRuntimePlayerCombatAttemptActorsAfterPidMovement"),
  "runtime combat should model Nh CoreWorker/EntityList player process order, including pre-movement target tiles for earlier-PID attacks"
);
assert(
  playerCombatSource.includes("TargetRoute.set(player, target, useSpell() ? 10") &&
    playerCombatSource.includes("getAttackType() == AttackType.LONG_RANGED ? 2 : 0"),
  "Nh PlayerCombat.preAttack should give selected/autocast spells a 10-tile TargetRoute and long-ranged weapon attacks +2 tiles"
);
assert(
  targetSpellSource.includes("double percentageBonus = entity.getCombat().getBonus(EquipmentStats.MAGIC_DAMAGE)") &&
    targetSpellSource.includes("maxDamage *= (1D + percentageBonus * 0.01)"),
  "Nh target spells should apply the visible magic damage equipment percentage after the spell base max"
);

let countdownState = createState(810, {
  combatStartTick: runtimeCombat.runtimePlayerCombatFightCountdownTicks
});
assert(runtimeCombat.runtimePlayerCombatIsFightCountdownActive(countdownState), "pre-fight countdown should start active when combatStartTick is in the future");
assert(runtimeCombat.runtimePlayerCombatFightCountdownLabel(countdownState) === "3", "pre-fight countdown should start at 3");
assert(requestLocalAttack(countdownState).actors["local-player"].targetId === null, "pre-fight countdown should block local attack target requests");
assert(requestOpponentAttack(countdownState).actors.opponent.targetId === null, "pre-fight countdown should block opponent attack target requests");
let countdownAdvance = advance({
  ...countdownState,
  actors: {
    ...countdownState.actors,
    "local-player": {
      ...countdownState.actors["local-player"],
      targetId: "opponent"
    },
    opponent: {
      ...countdownState.actors.opponent,
      targetId: "local-player"
    }
  }
});
assert(
  countdownAdvance.state.queuedHits.length === 0 && countdownAdvance.routeRequests.length === 0,
  "pre-fight countdown should gate both actors' attack processing while still allowing the game tick to advance"
);
let goState = {
  ...countdownState,
  tick: runtimeCombat.runtimePlayerCombatFightCountdownTicks
};
assert(runtimeCombat.runtimePlayerCombatFightCountdownLabel(goState) === "Go", "countdown should show Go on the first combat-open tick");
goState = requestLocalAttack(goState);
const goResult = advance(goState);
assert(
  goResult.state.events.some((event) => event.kind === "attack" && event.attackerId === "local-player"),
  "player attacks should be accepted once the countdown reaches Go"
);

let outOfRange = createState(7, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 12, z: 0 }
});
outOfRange = requestLocalAttack(outOfRange);
const outOfRangeResult = advance(outOfRange);
assert(outOfRangeResult.state.queuedHits.length === 0, "out-of-range ranged attack should not queue a hit");
assert(
  outOfRangeResult.routeRequests.some(
    (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 8
  ),
  "out-of-range player Attack should request route-toward-target movement"
);

let opponentPidFirst = createState(811, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides"
});
opponentPidFirst = {
  ...opponentPidFirst,
  processOrder: ["opponent", "local-player"],
  nextProcessOrderShuffleTick: 999,
  processOrderSeed: 1
};
opponentPidFirst = requestLocalAttack(requestOpponentAttack(opponentPidFirst));
const opponentPidFirstResult = advance(opponentPidFirst);
const opponentPidFirstAttackEvents = opponentPidFirstResult.state.events.filter((event) => event.kind === "attack");
assert(
  opponentPidFirstAttackEvents[0]?.attackerId === "opponent" &&
    opponentPidFirstAttackEvents[1]?.attackerId === "local-player",
  "same-tick attacks should resolve in the current Nh/PID process order, not fixed local-player first"
);

function processOrderKey(processOrder) {
  return processOrder.join(",");
}

function findProcessOrderSeedFor(targetProcessOrder, shuffleTick = 1) {
  for (let seed = 1; seed < 10000; seed += 1) {
    const candidate = {
      ...createState(812, {
        localLoadoutId: "kodai-robes",
        opponentLoadoutId: "kodai-robes"
      }),
      tick: shuffleTick,
      processOrder: targetProcessOrder[0] === "local-player" ? ["opponent", "local-player"] : ["local-player", "opponent"],
      nextProcessOrderShuffleTick: shuffleTick,
      processOrderSeed: seed
    };
    if (processOrderKey(runtimeCombat.runtimePlayerCombatProcessOrderForTick(candidate, shuffleTick)) === processOrderKey(targetProcessOrder)) {
      return seed;
    }
  }
  throw new Error(`could not find deterministic process-order seed for ${targetProcessOrder.join(" > ")}`);
}

const flippedToOpponentPidSeed = findProcessOrderSeedFor(["opponent", "local-player"], 1);
let sameTickMagicAfterPidFlip = createState(813, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "kodai-robes"
});
sameTickMagicAfterPidFlip = {
  ...sameTickMagicAfterPidFlip,
  tick: 1,
  processOrder: ["local-player", "opponent"],
  nextProcessOrderShuffleTick: 1,
  processOrderSeed: flippedToOpponentPidSeed
};
const displayedPidFlipOrder = runtimeCombat.runtimePlayerCombatProcessOrderForTick(
  sameTickMagicAfterPidFlip,
  sameTickMagicAfterPidFlip.tick
);
sameTickMagicAfterPidFlip = requestOpponentSpell(requestLocalSpell(sameTickMagicAfterPidFlip));
const sameTickMagicAfterPidFlipResult = advance(sameTickMagicAfterPidFlip);
const flippedAttackEvents = sameTickMagicAfterPidFlipResult.state.events.filter((event) => event.kind === "attack");
const opponentPidMagicHit = sameTickMagicAfterPidFlipResult.state.queuedHits.find(
  (hit) => hit.attackerId === "opponent" && hit.defenderId === "local-player" && hit.spellId === "ice-barrage"
);
const localOffPidMagicHit = sameTickMagicAfterPidFlipResult.state.queuedHits.find(
  (hit) => hit.attackerId === "local-player" && hit.defenderId === "opponent" && hit.spellId === "ice-barrage"
);
assert(
  processOrderKey(displayedPidFlipOrder) === "opponent,local-player" &&
    processOrderKey(sameTickMagicAfterPidFlipResult.state.processOrder) === "opponent,local-player" &&
    displayedPidFlipOrder[0] !== displayedPidFlipOrder[1] &&
    flippedAttackEvents[0]?.attackerId === "opponent" &&
    flippedAttackEvents[1]?.attackerId === "local-player" &&
    opponentPidMagicHit &&
    localOffPidMagicHit &&
    opponentPidMagicHit.dueTick === opponentPidMagicHit.hitsplatTick &&
    localOffPidMagicHit.dueTick === localOffPidMagicHit.hitsplatTick &&
    opponentPidMagicHit.dueTick === localOffPidMagicHit.dueTick - 1,
  `PID flip should make the overlay-visible process order and same-tick combat order agree, with only the on-PID side getting the earlier magic impact: ${JSON.stringify({
    displayedPidFlipOrder,
    stateProcessOrder: sameTickMagicAfterPidFlipResult.state.processOrder,
    attacks: flippedAttackEvents,
    opponentPidMagicHit,
    localOffPidMagicHit
  })}`
);

function assertPidAdjustedOutgoingHitsplat(label, attackerId, defenderId, processOrder, overrides = {}) {
  let state = createState(812, {
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 4, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "acb-hides",
    ...overrides
  });
  state = pinProcessOrder(state, processOrder);
  state = attackerId === "local-player" ? requestLocalAttack(state) : requestOpponentAttack(state);
  const result = advance(state);
  const attack = result.state.events.find((event) => event.kind === "attack" && event.attackerId === attackerId);
  const queuedHit = result.state.queuedHits.find(
    (candidate) => candidate.attackerId === attackerId && candidate.defenderId === defenderId
  );
  const appliedHitEvent = result.state.events.find(
    (event) => event.kind === "hitsplat" && event.attackerId === attackerId && event.targetActorId === defenderId
  );
  assert(
    attack && (queuedHit || appliedHitEvent),
    `${label} verifier should launch one attack and either queue or immediately apply one hit: ${JSON.stringify({
      processOrder,
      events: result.state.events,
      queuedHits: result.state.queuedHits
    })}`
  );
  const defenderAlreadyProcessed =
    processOrder.indexOf(defenderId) >= 0 && processOrder.indexOf(defenderId) < processOrder.indexOf(attackerId);
  const expectedNormalHitsplatDelay = Math.max(1, attack.hitDelayTicks);
  const hasProjectile = attack.projectile !== undefined;
  const expectedPidAdjustedHitsplatDelay = defenderAlreadyProcessed
    ? expectedNormalHitsplatDelay
    : hasProjectile && attack.style === "ranged"
      ? expectedNormalHitsplatDelay
      : Math.max(0, expectedNormalHitsplatDelay - 1);
  const expectedDueTick = attack.tick + expectedPidAdjustedHitsplatDelay;
  const expectedHitsplatTick = attack.tick + expectedPidAdjustedHitsplatDelay;
  const actualDueTick = queuedHit?.dueTick ?? appliedHitEvent?.tick;
  const actualHitsplatTick = queuedHit?.hitsplatTick ?? appliedHitEvent?.tick;
  assert(
    actualDueTick === expectedDueTick && actualHitsplatTick === expectedHitsplatTick && !("xpDropTick" in (queuedHit ?? {})),
    `${label} outgoing hit should apply damage, health bar state, and hitsplat on the same PID-adjusted tick: ${JSON.stringify({
      processOrder,
      attack,
      queuedHit,
      appliedHitEvent,
      expectedNormalHitsplatDelay,
      expectedPidAdjustedHitsplatDelay,
      expectedDueTick,
      expectedHitsplatTick,
      actualDueTick,
      actualHitsplatTick,
      defenderAlreadyProcessed,
      hasProjectile
    })}`
  );
  if (appliedHitEvent) {
    assert(
      result.state.actors[defenderId].hitpoints === appliedHitEvent.nextHitpoints,
      `${label} immediately applied hit should update actor HP on the same tick as its hitsplat event: ${JSON.stringify({
        hitpoints: result.state.actors[defenderId].hitpoints,
        appliedHitEvent
      })}`
    );
  }
  return { attack, hit: queuedHit ?? appliedHitEvent, queuedHit, appliedHitEvent, state: result.state };
}

function observedPidImpactTick(result) {
  return result.queuedHit?.dueTick ?? result.appliedHitEvent?.tick;
}

function observedPidHitsplatTick(result) {
  return result.queuedHit?.hitsplatTick ?? result.queuedHit?.dueTick ?? result.appliedHitEvent?.tick;
}

const localOnPidHitsplat = assertPidAdjustedOutgoingHitsplat(
  "local on-PID",
  "local-player",
  "opponent",
  ["local-player", "opponent"]
);
const localOffPidHitsplat = assertPidAdjustedOutgoingHitsplat(
  "local off-PID",
  "local-player",
  "opponent",
  ["opponent", "local-player"]
);
assert(
  observedPidImpactTick(localOffPidHitsplat) === observedPidImpactTick(localOnPidHitsplat) &&
    observedPidHitsplatTick(localOffPidHitsplat) === observedPidHitsplatTick(localOnPidHitsplat),
  "local on-PID outgoing projectile damage should keep the source delay instead of drawing like instant melee"
);
const opponentOnPidHitsplat = assertPidAdjustedOutgoingHitsplat(
  "opponent on-PID",
  "opponent",
  "local-player",
  ["opponent", "local-player"]
);
const opponentOffPidHitsplat = assertPidAdjustedOutgoingHitsplat(
  "opponent off-PID",
  "opponent",
  "local-player",
  ["local-player", "opponent"]
);
assert(
  observedPidImpactTick(opponentOffPidHitsplat) === observedPidImpactTick(opponentOnPidHitsplat) &&
    observedPidHitsplatTick(opponentOffPidHitsplat) === observedPidHitsplatTick(opponentOnPidHitsplat),
  "opponent on-PID outgoing projectile damage should keep the source delay instead of drawing like instant melee"
);
const localCloseRangeRangedOnPidHitsplat = assertPidAdjustedOutgoingHitsplat(
  "local close-range ranged on-PID",
  "local-player",
  "opponent",
  ["local-player", "opponent"],
  {
    opponentTile: { x: 1, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "acb-hides"
  }
);
assert(
  localCloseRangeRangedOnPidHitsplat.attack.style === "ranged" &&
    localCloseRangeRangedOnPidHitsplat.attack.projectile?.id === "dragon_bolt" &&
    localCloseRangeRangedOnPidHitsplat.attack.projectileDurationCycles === 51 &&
    localCloseRangeRangedOnPidHitsplat.attack.hitDelayTicks === 2 &&
    observedPidHitsplatTick(localCloseRangeRangedOnPidHitsplat) === localCloseRangeRangedOnPidHitsplat.attack.tick + 2,
  "close-range on-PID crossbow hits should use the source two-tick dragon-bolt delay and not draw as instant melee"
);
const localCloseRangeRangedOneTickLater = advance(localCloseRangeRangedOnPidHitsplat.state).state;
assert(
  localCloseRangeRangedOneTickLater.queuedHits.some((hit) => hit.id === localCloseRangeRangedOnPidHitsplat.hit.id) &&
    !localCloseRangeRangedOneTickLater.events.some(
      (event) => event.kind === "hitsplat" && event.id === `${localCloseRangeRangedOnPidHitsplat.hit.id}-hitsplat`
    ),
  "close-range on-PID crossbow should still be queued one tick after firing instead of splatting at melee speed"
);
const localCloseRangeRangedTwoTicksLater = advance(localCloseRangeRangedOneTickLater).state;
assert(
  !localCloseRangeRangedTwoTicksLater.queuedHits.some((hit) => hit.id === localCloseRangeRangedOnPidHitsplat.hit.id) &&
    localCloseRangeRangedTwoTicksLater.events.some(
      (event) =>
        event.kind === "hitsplat" &&
        event.id === `${localCloseRangeRangedOnPidHitsplat.hit.id}-hitsplat` &&
        event.tick === localCloseRangeRangedOnPidHitsplat.attack.tick + 2
    ),
  "close-range on-PID crossbow should splat on the second tick after firing"
);
const localMeleeOnPidHitsplat = assertPidAdjustedOutgoingHitsplat(
  "local melee on-PID",
  "local-player",
  "opponent",
  ["local-player", "opponent"],
  {
    opponentTile: { x: 1, z: 0 },
    localLoadoutId: "tentacle-bandos",
    opponentLoadoutId: "tentacle-bandos"
  }
);
const localMeleeOffPidHitsplat = assertPidAdjustedOutgoingHitsplat(
  "local melee off-PID",
  "local-player",
  "opponent",
  ["opponent", "local-player"],
  {
    opponentTile: { x: 1, z: 0 },
    localLoadoutId: "tentacle-bandos",
    opponentLoadoutId: "tentacle-bandos"
  }
);
assert(
  localMeleeOnPidHitsplat.attack.hitDelayTicks === 1 &&
    localMeleeOffPidHitsplat.attack.hitDelayTicks === 1 &&
    localMeleeOnPidHitsplat.appliedHitEvent?.tick === localMeleeOffPidHitsplat.hit.dueTick - 1 &&
    localMeleeOnPidHitsplat.state.actors.opponent.hitpoints === localMeleeOnPidHitsplat.appliedHitEvent.nextHitpoints,
  "instant on-PID melee hits should apply damage and hitsplat one tick earlier, not just draw the visible splat early"
);
assert(
  observedPidHitsplatTick(localCloseRangeRangedOnPidHitsplat) === observedPidHitsplatTick(localMeleeOnPidHitsplat) + 2,
  "close-range on-PID crossbow hits should stay two ticks slower than on-PID melee hits"
);
assert(
  !viewerSource.includes("queuedRuntimePlayerCombatHitsplatRenderEvent") &&
    runtimeCombatSource.includes("const immediateAppliedHits = applyRuntimePlayerCombatDueHits(actors, queuedHits, currentTick, input.tileScale)") &&
    viewerSource.includes("const localQueuedHits = combatState.queuedHits.filter((hit) => hit.attackerId === \"local-player\")"),
  "RuntimeSceneViewer should not draw hitsplats directly from queued hits; PID-early damage should be applied in combat state while leaving the queued-hit XP-drop scan unchanged"
);

function resolvedHitState(startState, hitId) {
  let state = startState;
  for (let guard = 0; guard < 12 && state.queuedHits.some((hit) => hit.id === hitId); guard += 1) {
    state = advance(state).state;
  }
  return state;
}

function pidMagicCase(label, processOrder) {
  for (let seed = 120; seed < 260; seed += 1) {
    let state = createState(seed, {
      localTile: { x: 0, z: 0 },
      opponentTile: { x: 4, z: 0 },
      localLoadoutId: "kodai-robes",
      opponentLoadoutId: "kodai-robes"
    });
    state = pinProcessOrder(state, processOrder);
    state = requestLocalSpell(state);
    const result = advance(state);
    const attack = result.state.events.find((event) => event.kind === "attack" && event.attackerId === "local-player");
    const hit = result.state.queuedHits.find((candidate) => candidate.attackerId === "local-player" && candidate.defenderId === "opponent");
    if (!attack || !hit || hit.damage <= 0) {
      continue;
    }
    const resolved = resolvedHitState(result.state, hit.id);
    const hitsplat = resolved.events.find((event) => event.kind === "hitsplat" && event.id === `${hit.id}-hitsplat`);
    assert(hitsplat, `${label} magic case should resolve into a hitsplat event`);
    assert(
      resolved.actors.opponent.hitpoints === hitsplat.nextHitpoints,
      `${label} magic damage should update opponent HP on the exact hitsplat tick: ${JSON.stringify({
        hit,
        hitsplat,
        resolvedHp: resolved.actors.opponent.hitpoints
      })}`
    );
    return { attack, hit, hitsplat, resolved };
  }
  throw new Error(`${label} verifier could not find a deterministic damaging Ice Barrage seed`);
}

const localOnPidMagic = pidMagicCase("local on-PID magic", ["local-player", "opponent"]);
const localOffPidMagic = pidMagicCase("local off-PID magic", ["opponent", "local-player"]);
assert(
  localOnPidMagic.attack.style === "magic" &&
    localOffPidMagic.attack.style === "magic" &&
    localOnPidMagic.hit.dueTick === localOnPidMagic.hit.hitsplatTick &&
    localOffPidMagic.hit.dueTick === localOffPidMagic.hit.hitsplatTick &&
    localOnPidMagic.hit.dueTick === localOffPidMagic.hit.dueTick - 1 &&
    localOnPidMagic.hitsplat.tick === localOnPidMagic.hit.dueTick &&
    localOffPidMagic.hitsplat.tick === localOffPidMagic.hit.dueTick,
  `on-PID magic should land one tick earlier than off-PID magic, with hit event and HP timing aligned: ${JSON.stringify({
    onPid: { dueTick: localOnPidMagic.hit.dueTick, hitsplatTick: localOnPidMagic.hitsplat.tick },
    offPid: { dueTick: localOffPidMagic.hit.dueTick, hitsplatTick: localOffPidMagic.hitsplat.tick }
  })}`
);

let opponentPidFreezeCancelsUnderStep = createState(1, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
opponentPidFreezeCancelsUnderStep = freezeActor(opponentPidFreezeCancelsUnderStep, "opponent", 20);
opponentPidFreezeCancelsUnderStep = runtimeCombat.setRuntimePlayerCombatAutocast(
  opponentPidFreezeCancelsUnderStep,
  "opponent",
  "ice-barrage"
);
opponentPidFreezeCancelsUnderStep = {
  ...opponentPidFreezeCancelsUnderStep,
  processOrder: ["opponent", "local-player"],
  nextProcessOrderShuffleTick: 999,
  processOrderSeed: 1
};
opponentPidFreezeCancelsUnderStep = requestOpponentAttack(opponentPidFreezeCancelsUnderStep);
const opponentPidFreezeCancelsUnderStepResult = runtimeCombat.advanceRuntimePlayerCombat(
  opponentPidFreezeCancelsUnderStep,
  {
    preMovementTiles: {
      "local-player": { x: 0, z: 0 },
      opponent: { x: 1, z: 0 }
    },
    tiles: {
      "local-player": { x: 1, z: 0 },
      opponent: { x: 1, z: 0 }
    },
    projectileLineOfSight: {
      opponent: true
    }
  }
);
assert(
  entityLocks.isFrozen(opponentPidFreezeCancelsUnderStepResult.state.actors["local-player"].locks, opponentPidFreezeCancelsUnderStep.tick),
  "fixture seed should produce a positive Ice Barrage freeze roll"
);
assert(
  opponentPidFreezeCancelsUnderStepResult.state.actors["local-player"].tile.x === 0 &&
    opponentPidFreezeCancelsUnderStepResult.state.actors["local-player"].tile.z === 0,
  "earlier-PID Ice Barrage freeze should reset the later player's queued under-step instead of leaving them frozen under the caster"
);

let localPidUnderStepBlocksLaterFreeze = createState(901, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
localPidUnderStepBlocksLaterFreeze = freezeActor(localPidUnderStepBlocksLaterFreeze, "opponent", 20);
localPidUnderStepBlocksLaterFreeze = runtimeCombat.setRuntimePlayerCombatAutocast(
  localPidUnderStepBlocksLaterFreeze,
  "opponent",
  "ice-barrage"
);
localPidUnderStepBlocksLaterFreeze = {
  ...localPidUnderStepBlocksLaterFreeze,
  processOrder: ["local-player", "opponent"],
  nextProcessOrderShuffleTick: 999,
  processOrderSeed: 1
};
localPidUnderStepBlocksLaterFreeze = requestOpponentAttack(localPidUnderStepBlocksLaterFreeze);
const localPidUnderStepBlocksLaterFreezeResult = runtimeCombat.advanceRuntimePlayerCombat(
  localPidUnderStepBlocksLaterFreeze,
  {
    preMovementTiles: {
      "local-player": { x: 0, z: 0 },
      opponent: { x: 1, z: 0 }
    },
    tiles: {
      "local-player": { x: 1, z: 0 },
      opponent: { x: 1, z: 0 }
    },
    projectileLineOfSight: {
      opponent: true
    }
  }
);
assert(
  localPidUnderStepBlocksLaterFreezeResult.state.queuedHits.length === 0 &&
    !entityLocks.isFrozen(localPidUnderStepBlocksLaterFreezeResult.state.actors["local-player"].locks, localPidUnderStepBlocksLaterFreeze.tick),
  "later-PID frozen caster should not Ice Barrage a target that has already stepped under on its PID turn"
);

let localPidStepInSpecBeatsLaterTargetStepOut = createState(1121, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 3, z: 0 },
  localLoadoutId: "gmaul-bandos",
  opponentLoadoutId: "kodai-robes"
});
localPidStepInSpecBeatsLaterTargetStepOut = pinProcessOrder(localPidStepInSpecBeatsLaterTargetStepOut, [
  "local-player",
  "opponent"
]);
localPidStepInSpecBeatsLaterTargetStepOut = runtimeCombat.toggleRuntimePlayerCombatSpecial(
  localPidStepInSpecBeatsLaterTargetStepOut,
  "local-player"
).state;
localPidStepInSpecBeatsLaterTargetStepOut = requestLocalAttack(localPidStepInSpecBeatsLaterTargetStepOut);
const localPidStepInSpecBeatsLaterTargetStepOutResult = runtimeCombat.advanceRuntimePlayerCombat(
  localPidStepInSpecBeatsLaterTargetStepOut,
  {
    preMovementTiles: {
      "local-player": { x: 0, z: 0 },
      opponent: { x: 3, z: 0 }
    },
    tiles: {
      "local-player": { x: 2, z: 0 },
      opponent: { x: 5, z: 0 }
    },
    targetRouteMovementConsumed: {
      "local-player": true,
      opponent: true
    }
  }
);
assert(
  localPidStepInSpecBeatsLaterTargetStepOutResult.state.events.some(
    (event) => event.kind === "attack" && event.attackerId === "local-player" && event.specialAttack === "granite_maul"
  ),
  "on-PID melee spec step-in should resolve against the defender's pre-movement tile when the defender steps out later in the tick"
);

let localOffPidStepInSpecChasesEarlierTargetStepOut = createState(1122, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 3, z: 0 },
  localLoadoutId: "gmaul-bandos",
  opponentLoadoutId: "kodai-robes"
});
localOffPidStepInSpecChasesEarlierTargetStepOut = pinProcessOrder(localOffPidStepInSpecChasesEarlierTargetStepOut, [
  "opponent",
  "local-player"
]);
localOffPidStepInSpecChasesEarlierTargetStepOut = runtimeCombat.toggleRuntimePlayerCombatSpecial(
  localOffPidStepInSpecChasesEarlierTargetStepOut,
  "local-player"
).state;
localOffPidStepInSpecChasesEarlierTargetStepOut = requestLocalAttack(localOffPidStepInSpecChasesEarlierTargetStepOut);
const localOffPidStepInSpecChasesEarlierTargetStepOutResult = runtimeCombat.advanceRuntimePlayerCombat(
  localOffPidStepInSpecChasesEarlierTargetStepOut,
  {
    preMovementTiles: {
      "local-player": { x: 0, z: 0 },
      opponent: { x: 3, z: 0 }
    },
    tiles: {
      "local-player": { x: 2, z: 0 },
      opponent: { x: 5, z: 0 }
    },
    targetRouteMovementConsumed: {
      "local-player": true,
      opponent: true
    }
  }
);
assert(
  !localOffPidStepInSpecChasesEarlierTargetStepOutResult.state.events.some(
    (event) => event.kind === "attack" && event.attackerId === "local-player" && event.specialAttack === "granite_maul"
  ) &&
    localOffPidStepInSpecChasesEarlierTargetStepOutResult.state.queuedHits.length === 0,
  "off-PID melee spec step-in should chase instead of hitting when the defender has already stepped out"
);

let frozenMelee = createState(9, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 1 },
  localLoadoutId: "tentacle-bandos"
});
frozenMelee = {
  ...frozenMelee,
  actors: {
    ...frozenMelee.actors,
    "local-player": {
      ...frozenMelee.actors["local-player"],
      locks: {
        ...frozenMelee.actors["local-player"].locks,
        freezeUntilTick: 10
      }
    }
  }
};
frozenMelee = requestLocalAttack(frozenMelee);
const frozenMeleeResult = advance(frozenMelee);
assert(frozenMeleeResult.state.queuedHits.length === 0, "frozen diagonal melee should not queue a hit");
assert(
  frozenMeleeResult.routeRequests.some(
    (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 1
  ),
  "frozen diagonal melee should request route movement instead of treating diagonal reach as valid"
);

let frozenOpponentSceneTwoTileDiagonalMelee = createState(1015, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 1 },
  opponentLoadoutId: "tentacle-bandos"
});
frozenOpponentSceneTwoTileDiagonalMelee = freezeActor(frozenOpponentSceneTwoTileDiagonalMelee, "opponent", 20);
frozenOpponentSceneTwoTileDiagonalMelee = requestOpponentAttack(frozenOpponentSceneTwoTileDiagonalMelee);
const frozenOpponentSceneTwoTileDiagonalMeleeResult = runtimeCombat.advanceRuntimePlayerCombat(
  frozenOpponentSceneTwoTileDiagonalMelee,
  {
    tiles: {
      "local-player": frozenOpponentSceneTwoTileDiagonalMelee.actors["local-player"].tile,
      opponent: frozenOpponentSceneTwoTileDiagonalMelee.actors.opponent.tile
    },
    tileScale: 0.5
  }
);
assert(
  frozenOpponentSceneTwoTileDiagonalMeleeResult.state.queuedHits.length === 0,
  "manual-scene frozen opponent should not melee from two scene tiles away when both coordinates happen to be integers"
);

let frozenOpponentSceneTwoTileCardinalMelee = createState(1016, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  opponentLoadoutId: "tentacle-bandos"
});
frozenOpponentSceneTwoTileCardinalMelee = freezeActor(frozenOpponentSceneTwoTileCardinalMelee, "opponent", 20);
frozenOpponentSceneTwoTileCardinalMelee = requestOpponentAttack(frozenOpponentSceneTwoTileCardinalMelee);
const frozenOpponentSceneTwoTileCardinalMeleeResult = runtimeCombat.advanceRuntimePlayerCombat(
  frozenOpponentSceneTwoTileCardinalMelee,
  {
    tiles: {
      "local-player": frozenOpponentSceneTwoTileCardinalMelee.actors["local-player"].tile,
      opponent: frozenOpponentSceneTwoTileCardinalMelee.actors.opponent.tile
    },
    tileScale: 0.5
  }
);
assert(
  frozenOpponentSceneTwoTileCardinalMeleeResult.state.queuedHits.length === 0,
  "manual-scene frozen opponent should not melee from a two-tile cardinal gap that was previously inferred as one tile"
);

let frozenLocalSceneTwoTileCardinalMelee = createState(1018, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "tentacle-bandos"
});
frozenLocalSceneTwoTileCardinalMelee = freezeActor(frozenLocalSceneTwoTileCardinalMelee, "local-player", 20);
frozenLocalSceneTwoTileCardinalMelee = requestLocalAttack(frozenLocalSceneTwoTileCardinalMelee);
const frozenLocalSceneTwoTileCardinalMeleeResult = runtimeCombat.advanceRuntimePlayerCombat(
  frozenLocalSceneTwoTileCardinalMelee,
  {
    tiles: {
      "local-player": frozenLocalSceneTwoTileCardinalMelee.actors["local-player"].tile,
      opponent: frozenLocalSceneTwoTileCardinalMelee.actors.opponent.tile
    },
    tileScale: 0.5
  }
);
assert(
  frozenLocalSceneTwoTileCardinalMeleeResult.state.queuedHits.length === 0,
  "manual-scene frozen local player should not melee from a two-tile cardinal step-in gap"
);

let capturedSceneScalePolicyContext = null;
const sceneScalePolicyController = {
  id: "test-scene-scale-policy",
  chooseAction: (context) => {
    capturedSceneScalePolicyContext = context;
    return {
      offenceStyle: "melee",
      defencePrayer: "protect_from_missiles",
      movementIntent: "pressure",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false
    };
  }
};
const sceneScalePolicyState = createState(1017, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 1 },
  opponentLoadoutId: "tentacle-bandos"
});
runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: sceneScalePolicyState,
  controller: sceneScalePolicyController,
  localActor: {
    tile: sceneScalePolicyState.actors["local-player"].tile,
    loadoutId: sceneScalePolicyState.actors["local-player"].loadoutId
  },
  opponentActor: {
    tile: sceneScalePolicyState.actors.opponent.tile,
    loadoutId: sceneScalePolicyState.actors.opponent.loadoutId
  },
  tileScale: 0.5
});
assert(
  capturedSceneScalePolicyContext?.meleeReachable === false,
  "manual-scene policy context should read a 1.0 world-unit diagonal gap as two OSRS tiles, not one diagonal melee step"
);

for (const itemId of [11840, 11832, 11834, 10828, 7462]) {
  assertEquipmentRowMatchesServerItem(itemId);
}

const nhStakeEquipment = nhLoadouts.nhLoadouts["tentacle-bandos"].equipment;
const nhStakeProfile = nhGearProfile.inferNhSelectedGearProfile({
  equipment: nhStakeEquipment,
  inventoryItems: Object.values(nhStakeEquipment)
});
const nhStakeUnequippedBoots = nhGearProfile.nhGearProfileActionEquipment({
  currentEquipment: nhStakeEquipment,
  profile: nhStakeProfile,
  action: {
    offenceStyle: "magic",
    defencePrayer: "protect_from_missiles",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    equipmentIntent: "unequip_feet"
  },
  threatStyle: null,
  underPressure: false,
  hitpoints: 99,
  allowFlexibleGear: false
});
assert(!nhStakeUnequippedBoots.feet, "NH stake unequip_feet should leave the boots slot empty");
const nhStakeBootDelta = assertUnequipDeltaMatchesRemovedItem(
  "NH stake unequip_feet",
  nhStakeEquipment,
  nhStakeUnequippedBoots,
  nhStakeEquipment.feet
);
assert(
  nhStakeBootDelta.magic_attack_bonus === 3 &&
    nhStakeBootDelta.range_attack_bonus === 1 &&
    nhStakeBootDelta.melee_strength_bonus === -4,
  `Dragon boots unequip should gain negative magic/range attack back and lose melee strength: ${JSON.stringify(nhStakeBootDelta)}`
);
const nhStakeBootsInInventoryProfile = nhGearProfile.inferNhSelectedGearProfile({
  equipment: nhStakeUnequippedBoots,
  previousProfile: nhStakeProfile,
  inventoryItems: [nhStakeEquipment.feet]
});
const nhStakeReequippedBoots = nhGearProfile.nhGearProfileActionEquipment({
  currentEquipment: nhStakeUnequippedBoots,
  profile: nhStakeBootsInInventoryProfile,
  action: {
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    equipmentIntent: "style_loadout"
  },
  threatStyle: null,
  underPressure: false,
  hitpoints: 99,
  allowFlexibleGear: false
});
assert(
  nhStakeReequippedBoots.feet?.itemId === nhStakeEquipment.feet.itemId,
  `Dragon boots should be equippable again after appearing in the inventory view: ${JSON.stringify({
    feet: nhStakeReequippedBoots.feet
  })}`
);

const dmmIndependentEquipment = nhLoadouts.nhLoadouts["noxious-halberd"].equipment;
const dmmIndependentInventory = Object.values(dmmIndependentEquipment);
const dmmIndependentProfile = nhGearProfile.inferNhSelectedGearProfile({
  equipment: dmmIndependentEquipment,
  inventoryItems: dmmIndependentInventory
});
const dmmMagicStyleAction = {
  offenceStyle: "magic",
  defencePrayer: "protect_from_missiles",
  movementIntent: "pressure",
  supplyIntent: "none",
  specIntent: "none"
};
const dmmMagicStyleEquipment = nhGearProfile.nhGearProfileActionEquipment({
  currentEquipment: dmmIndependentEquipment,
  profile: dmmIndependentProfile,
  action: {
    ...dmmMagicStyleAction,
    equipmentIntent: "style_loadout"
  },
  threatStyle: null,
  underPressure: false,
  hitpoints: 99,
  allowFlexibleGear: false
});
const dmmUnequippedHead = nhGearProfile.nhGearProfileActionEquipment({
  currentEquipment: dmmIndependentEquipment,
  profile: dmmIndependentProfile,
  action: {
    ...dmmMagicStyleAction,
    equipmentIntent: "unequip_head"
  },
  threatStyle: null,
  underPressure: false,
  hitpoints: 99,
  allowFlexibleGear: false
});
assert(!dmmUnequippedHead.head, "DMM independent unequip_head should leave the head slot empty");
const dmmFullBonuses = equipment.aggregateVisibleEquipmentBonuses(dmmMagicStyleEquipment, equipmentRows);
const dmmHeadlessBonuses = equipment.aggregateVisibleEquipmentBonuses(dmmUnequippedHead, equipmentRows);
assert(
  JSON.stringify(dmmFullBonuses) !== JSON.stringify(dmmHeadlessBonuses),
  "head-slot bonuses should be removed while the item is unequipped"
);
assertUnequipDeltaMatchesRemovedItem(
  "DMM independent unequip_head",
  dmmMagicStyleEquipment,
  dmmUnequippedHead,
  dmmMagicStyleEquipment.head
);
const dmmUnequippedBody = nhGearProfile.nhGearProfileActionEquipment({
  currentEquipment: dmmIndependentEquipment,
  profile: dmmIndependentProfile,
  action: {
    ...dmmMagicStyleAction,
    equipmentIntent: "unequip_body"
  },
  threatStyle: null,
  underPressure: false,
  hitpoints: 99,
  allowFlexibleGear: false
});
assert(!dmmUnequippedBody.body, "DMM independent unequip_body should leave the body slot empty");
assertUnequipDeltaMatchesRemovedItem(
  "DMM independent unequip_body",
  dmmMagicStyleEquipment,
  dmmUnequippedBody,
  dmmMagicStyleEquipment.body
);
const dmmHeadlessProfile = nhGearProfile.inferNhSelectedGearProfile({
  equipment: dmmUnequippedHead,
  previousProfile: dmmIndependentProfile,
  inventoryItems: dmmIndependentInventory
});
const dmmReequippedHead = nhGearProfile.nhGearProfileActionEquipment({
  currentEquipment: dmmUnequippedHead,
  profile: dmmHeadlessProfile,
  action: {
    ...dmmMagicStyleAction,
    equipmentIntent: "style_loadout"
  },
  threatStyle: null,
  underPressure: false,
  hitpoints: 99,
  allowFlexibleGear: false
});
assert(
  dmmReequippedHead.head?.itemId === dmmMagicStyleEquipment.head?.itemId,
  "DMM independent style_loadout should restore a previously unequipped head slot before flexible gear optimization"
);

const dmmVectorProbeActionIds = nhPolicyBridge.dmmCurrentActionVectorActionIds();
const dmmVectorProbeAttackIds = nhPolicyBridge.dmmCanonicalAttackActionIds();

function dmmVectorProbeFindActionId(actionIds, predicate, label) {
  const actionId = actionIds.find((id) => predicate(nhPolicyBridge.decodeNhPolicyAction(id), id));
  assert(actionId !== undefined, `missing DMM vector probe action: ${label}`);
  return actionId;
}

function dmmVectorProbeDirectGearId(action) {
  return dmmVectorProbeFindActionId(
    dmmVectorProbeActionIds,
    (decoded, id) =>
      nhPolicyBridge.isNhDirectGearActionId(id) &&
      decoded.directGearActions?.[0] === action,
    action
  );
}

const dmmVectorProbeIds = {
  hold: dmmVectorProbeAttackIds[0],
  magic: dmmVectorProbeFindActionId(
    dmmVectorProbeAttackIds,
    (action) => action.offenceStyle === "magic" && action.attackIntent === "attack",
    "magic attack"
  ),
  ranged: dmmVectorProbeFindActionId(
    dmmVectorProbeAttackIds,
    (action) => action.offenceStyle === "ranged" && action.attackIntent === "attack",
    "ranged attack"
  ),
  melee: dmmVectorProbeFindActionId(
    dmmVectorProbeAttackIds,
    (action) => action.offenceStyle === "melee" && action.attackIntent === "attack",
    "melee attack"
  ),
  noxious: dmmVectorProbeDirectGearId("equip_dmm_noxious_halberd"),
  torvaLegs: dmmVectorProbeDirectGearId("equip_dmm_torva_platelegs"),
  virtusTop: dmmVectorProbeDirectGearId("equip_dmm_virtus_robe_top"),
  masoriBody: dmmVectorProbeDirectGearId("equip_dmm_masori_body"),
  torvaHelm: dmmVectorProbeDirectGearId("equip_dmm_torva_full_helm"),
  unequipHead: dmmVectorProbeDirectGearId("unequip_head")
};

function createDmmVectorProbePolicy(label, scores) {
  const scoreByAction = new Map(scores);
  const inputSize = nhPolicyBridge.nhPolicyInputSize;
  const actionIds = Int32Array.from(dmmVectorProbeActionIds);
  const policy = {
    kind: "neural",
    version: 15,
    sourceLabel: label,
    step: 0,
    inputSize,
    featureSize: nhPolicyBridge.nhPolicyFeatureSize,
    actionCount: actionIds.length,
    actionIds,
    inputMean: new Float32Array(inputSize),
    inputStd: new Float32Array(inputSize).fill(1),
    layers: [
      {
        weight: [new Float32Array(inputSize)],
        bias: Float32Array.of(0),
        activation: "silu"
      }
    ],
    policy: {
      weight: Array.from({ length: actionIds.length }, () => Float32Array.of(0)),
      bias: Float32Array.from(
        dmmVectorProbeActionIds.map(
          (actionId, index) => scoreByAction.get(actionId) ?? (-100 - index * 0.001)
        )
      )
    },
    metrics: {}
  };
  botPolicy.assertNhNeuralPolicyHasCurrentDmmActionSurface(policy, label);
  return policy;
}

function createDmmVectorProbeContext({
  tick = 20,
  distance = 4,
  magic = 99,
  cooldown = false,
  fullInventoryWithShield = false
} = {}) {
  const state = nhDuel.createInitialNhDuelState(0x444d4d);
  const inventorySlots = fullInventoryWithShield
    ? state.actors.self.inventorySlots.map((slot) => slot ?? { itemId: 385, quantity: 1 })
    : state.actors.self.inventorySlots;
  const self = {
    ...state.actors.self,
    tile: { x: 0, y: 0, plane: 0 },
    loadoutId: "noxious-halberd",
    weaponId: "noxious_halberd",
    previousWeaponId: "noxious_halberd",
    equipment: fullInventoryWithShield
      ? { ...dmmIndependentEquipment, shield: nhLoadouts.nhLoadouts["kodai-robes"].equipment.shield }
      : dmmIndependentEquipment,
    gearProfile: dmmIndependentProfile,
    inventorySlots,
    stats: {
      ...state.actors.self.stats,
      magic: { current: magic, fixed: 99 }
    },
    attackTimer: cooldown
      ? {
          lastAttackTick: tick,
          weaponCooldownTicks: 4,
          additiveAttackDelayTicks: 0
        }
      : state.actors.self.attackTimer
  };
  const opponent = {
    ...state.actors.opponent,
    tile: { x: distance, y: 0, plane: 0 },
    observedInfoKnown: true
  };
  return nhDuel.createNhDuelControllerContext(tick, self, opponent);
}

function chooseDmmVectorProbeAction(label, scores, context) {
  return botPolicy.createNhPolicyController(
    createDmmVectorProbePolicy(label, scores)
  ).chooseAction(context);
}

function assertDmmVectorProbeGear(action, expected, label) {
  const actual = [...new Set(action.directGearActions ?? [])].sort();
  const wanted = [...expected].sort();
  assert(
    actual.length === wanted.length &&
      actual.every((gear, index) => gear === wanted[index]),
    `${label}: ${JSON.stringify({ actual, wanted, action })}`
  );
}

const dmmCooldownContext = createDmmVectorProbeContext({ distance: 1, cooldown: true });
assert(
  nhPolicyFeatures.encodeNhPolicyInput(dmmCooldownContext)[9] === 0,
  "DMM cooldown probe must encode selfAttackReady=0"
);
const dmmCooldownAction = chooseDmmVectorProbeAction(
  "dmm-vector-cooldown-probe",
  [
    [dmmVectorProbeIds.hold, 1],
    [dmmVectorProbeIds.magic, 40],
    [dmmVectorProbeIds.ranged, 30],
    [dmmVectorProbeIds.melee, 50]
  ],
  dmmCooldownContext
);
assert(
  dmmCooldownAction.attackIntent === "hold",
  `DMM vector controller should HOLD during attack cooldown: ${JSON.stringify(dmmCooldownAction)}`
);
assertDmmVectorProbeGear(dmmCooldownAction, [], "DMM cooldown HOLD gear");

const dmmReachContext = createDmmVectorProbeContext({ distance: 4 });
assert(
  nhPolicyFeatures.encodeNhPolicyInput(dmmReachContext)[71] === 0,
  "DMM reach probe must encode meleeReach=0"
);
const dmmReachAction = chooseDmmVectorProbeAction(
  "dmm-vector-reach-probe",
  [
    [dmmVectorProbeIds.hold, 1],
    [dmmVectorProbeIds.magic, 20],
    [dmmVectorProbeIds.ranged, 30],
    [dmmVectorProbeIds.melee, 50]
  ],
  dmmReachContext
);
assert(
  dmmReachAction.offenceStyle === "ranged" && dmmReachAction.attackIntent === "attack",
  `DMM vector controller should reject unreachable melee: ${JSON.stringify(dmmReachAction)}`
);
assertDmmVectorProbeGear(
  dmmReachAction,
  ["equip_dmm_zaryte_crossbow", "equip_dmm_masori_body"],
  "DMM ranged core gear"
);

const dmmLowMagicContext = createDmmVectorProbeContext({ distance: 4, magic: 81 });
const dmmEdgeMagicContext = createDmmVectorProbeContext({ distance: 4, magic: 82 });
const dmmLowMagicInput = nhPolicyFeatures.encodeNhPolicyInput(dmmLowMagicContext);
const dmmEdgeMagicInput = nhPolicyFeatures.encodeNhPolicyInput(dmmEdgeMagicContext);
assert(
  Math.abs(dmmLowMagicInput[65] - 81 / 99) < 1e-12 &&
    Math.abs(dmmEdgeMagicInput[65] - 82 / 99) < 1e-12,
  `DMM magic-ratio probe inputs are wrong: ${JSON.stringify({
    low: dmmLowMagicInput[65],
    edge: dmmEdgeMagicInput[65]
  })}`
);
const dmmMagicScores = [
  [dmmVectorProbeIds.hold, 1],
  [dmmVectorProbeIds.magic, 40],
  [dmmVectorProbeIds.ranged, 30],
  [dmmVectorProbeIds.melee, 20]
];
const dmmLowMagicAction = chooseDmmVectorProbeAction(
  "dmm-vector-low-magic-probe",
  dmmMagicScores,
  dmmLowMagicContext
);
const dmmEdgeMagicAction = chooseDmmVectorProbeAction(
  "dmm-vector-edge-magic-probe",
  dmmMagicScores,
  dmmEdgeMagicContext
);
assert(
  dmmLowMagicAction.offenceStyle === "ranged" && dmmEdgeMagicAction.offenceStyle === "magic",
  `DMM vector magic threshold should switch at level 82: ${JSON.stringify({
    low: dmmLowMagicAction,
    edge: dmmEdgeMagicAction
  })}`
);
assertDmmVectorProbeGear(
  dmmLowMagicAction,
  ["equip_dmm_zaryte_crossbow", "equip_dmm_masori_body"],
  "DMM low-magic fallback gear"
);
assertDmmVectorProbeGear(
  dmmEdgeMagicAction,
  ["equip_dmm_zuriels_staff", "equip_dmm_virtus_robe_top"],
  "DMM castable-magic core gear"
);

const dmmFullInventoryAction = chooseDmmVectorProbeAction(
  "dmm-vector-full-inventory-probe",
  [
    [dmmVectorProbeIds.hold, 1],
    [dmmVectorProbeIds.ranged, 30],
    [dmmVectorProbeIds.melee, 50]
  ],
  createDmmVectorProbeContext({ distance: 1, fullInventoryWithShield: true })
);
assert(
  dmmFullInventoryAction.offenceStyle === "ranged",
  `DMM vector controller should reject a two-handed core weapon with a shield and full inventory: ${JSON.stringify(dmmFullInventoryAction)}`
);

const dmmOneFreeTwoHandedBaseContext = createDmmVectorProbeContext({ distance: 1 });
const dmmOneFreeTwoHandedContext = {
  ...dmmOneFreeTwoHandedBaseContext,
  self: {
    ...dmmOneFreeTwoHandedBaseContext.self,
    weaponId: "staff_of_the_dead",
    previousWeaponId: "staff_of_the_dead",
    equipment: {
      ...dmmOneFreeTwoHandedBaseContext.self.equipment,
      weapon: nhLoadouts.nhLoadouts["kodai-robes"].equipment.weapon,
      shield: nhLoadouts.nhLoadouts["kodai-robes"].equipment.shield
    },
    inventorySlots: Array.from({ length: 28 }, (_, index) =>
      index === 0
        ? { itemId: dmmIndependentEquipment.weapon.itemId, quantity: 1 }
        : index === 27
          ? null
          : { itemId: 385, quantity: 1 }
    )
  }
};
const dmmOneFreeTwoHandedAction = chooseDmmVectorProbeAction(
  "dmm-vector-one-free-two-handed-probe",
  [
    [dmmVectorProbeIds.hold, 1],
    [dmmVectorProbeIds.ranged, 30],
    [dmmVectorProbeIds.melee, 50],
    [dmmVectorProbeIds.unequipHead, 9]
  ],
  dmmOneFreeTwoHandedContext
);
assertDmmVectorProbeGear(
  dmmOneFreeTwoHandedAction,
  ["equip_dmm_noxious_halberd"],
  "DMM two-handed core reserves shield displacement capacity"
);

const dmmDirectGearAction = chooseDmmVectorProbeAction(
  "dmm-vector-direct-gear-probe",
  [
    [dmmVectorProbeIds.hold, 20],
    [dmmVectorProbeIds.noxious, 9],
    [dmmVectorProbeIds.torvaLegs, 0],
    [dmmVectorProbeIds.masoriBody, 0.25],
    [dmmVectorProbeIds.virtusTop, 0.75],
    [dmmVectorProbeIds.torvaHelm, -0.01]
  ],
  createDmmVectorProbeContext()
);
assert(
  dmmDirectGearAction.attackIntent === "hold",
  `DMM direct-gear probe should keep broad HOLD: ${JSON.stringify(dmmDirectGearAction)}`
);
assertDmmVectorProbeGear(
  dmmDirectGearAction,
  ["equip_dmm_torva_platelegs", "equip_dmm_virtus_robe_top"],
  "DMM direct-gear threshold/no-op/slot selection"
);

let frozenUnderMelee = createState(10, {
  localTile: { x: 1, z: 1 },
  opponentTile: { x: 1, z: 1 },
  localLoadoutId: "tentacle-bandos"
});
frozenUnderMelee = {
  ...frozenUnderMelee,
  actors: {
    ...frozenUnderMelee.actors,
    "local-player": {
      ...frozenUnderMelee.actors["local-player"],
      locks: {
        ...frozenUnderMelee.actors["local-player"].locks,
        freezeUntilTick: 11
      }
    }
  }
};
frozenUnderMelee = requestLocalAttack(frozenUnderMelee);
const frozenUnderMeleeResult = advance(frozenUnderMelee);
assert(frozenUnderMeleeResult.state.queuedHits.length === 0, "frozen same-tile melee should not queue a hit from underneath the target");

let frozenBothMagicTenTiles = createState(1010, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 10, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "kodai-robes"
});
frozenBothMagicTenTiles = freezeBothActors(frozenBothMagicTenTiles, 20);
frozenBothMagicTenTiles = requestLocalSpell(frozenBothMagicTenTiles);
const frozenBothMagicTenTilesResult = advance(frozenBothMagicTenTiles);
const frozenBothMagicTenTilesEvent = frozenBothMagicTenTilesResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "local-player"
);
assert(
  frozenBothMagicTenTilesResult.state.queuedHits.length === 1 &&
    frozenBothMagicTenTilesEvent?.style === "magic" &&
    frozenBothMagicTenTilesEvent.spellId === "ice-barrage" &&
    frozenBothMagicTenTilesResult.routeRequests.length === 0,
  `both-frozen selected Ice Barrage should fire at Nh' 10-tile spell TargetRoute distance without requiring movement: ${JSON.stringify({
    queuedHits: frozenBothMagicTenTilesResult.state.queuedHits,
    routeRequests: frozenBothMagicTenTilesResult.routeRequests,
    event: frozenBothMagicTenTilesEvent
  })}`
);

let frozenBothMagicTwoTiles = createState(1013, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 2, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "kodai-robes"
});
frozenBothMagicTwoTiles = freezeBothActors(frozenBothMagicTwoTiles, 20);
frozenBothMagicTwoTiles = requestLocalSpell(frozenBothMagicTwoTiles);
const frozenBothMagicTwoTilesResult = advance(frozenBothMagicTwoTiles);
const frozenBothMagicTwoTilesEvent = frozenBothMagicTwoTilesResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "local-player"
);
assert(
  frozenBothMagicTwoTilesResult.state.queuedHits.length === 1 &&
    frozenBothMagicTwoTilesEvent?.style === "magic" &&
    frozenBothMagicTwoTilesEvent.spellId === "ice-barrage" &&
    frozenBothMagicTwoTilesResult.routeRequests.length === 0,
  `both-frozen selected Ice Barrage should fire at two tiles without being blocked by freeze routing: ${JSON.stringify({
    queuedHits: frozenBothMagicTwoTilesResult.state.queuedHits,
    routeRequests: frozenBothMagicTwoTilesResult.routeRequests,
    event: frozenBothMagicTwoTilesEvent
  })}`
);

let frozenBothRangeTwoTilesAccurate = createState(1014, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 2, z: 0 },
  localLoadoutId: "acb-hides",
  localAttackSetIndex: 0
});
frozenBothRangeTwoTilesAccurate = freezeBothActors(frozenBothRangeTwoTilesAccurate, 20);
frozenBothRangeTwoTilesAccurate = requestLocalAttack(frozenBothRangeTwoTilesAccurate);
const frozenBothRangeTwoTilesAccurateResult = advance(frozenBothRangeTwoTilesAccurate);
const frozenBothRangeTwoTilesAccurateEvent = frozenBothRangeTwoTilesAccurateResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "local-player"
);
assert(
  frozenBothRangeTwoTilesAccurateResult.state.queuedHits.length === 1 &&
    frozenBothRangeTwoTilesAccurateEvent?.style === "ranged" &&
    frozenBothRangeTwoTilesAccurateResult.routeRequests.length === 0,
  `both-frozen accurate ACB should fire at two tiles without being blocked by freeze routing: ${JSON.stringify({
    queuedHits: frozenBothRangeTwoTilesAccurateResult.state.queuedHits,
    routeRequests: frozenBothRangeTwoTilesAccurateResult.routeRequests,
    event: frozenBothRangeTwoTilesAccurateEvent
  })}`
);

let frozenBothRangeNineTilesAccurate = createState(1011, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 9, z: 0 },
  localLoadoutId: "acb-hides",
  localAttackSetIndex: 0
});
frozenBothRangeNineTilesAccurate = freezeBothActors(frozenBothRangeNineTilesAccurate, 20);
frozenBothRangeNineTilesAccurate = requestLocalAttack(frozenBothRangeNineTilesAccurate);
const frozenBothRangeNineTilesAccurateResult = advance(frozenBothRangeNineTilesAccurate);
assert(
  frozenBothRangeNineTilesAccurateResult.state.queuedHits.length === 0 &&
    frozenBothRangeNineTilesAccurateResult.routeRequests.some(
      (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 8
    ),
  "both-frozen accurate ACB should still respect the Nh 8-tile weapon range and request movement when one tile too far"
);

let frozenBothRangeTenTilesLongrange = createState(1012, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 10, z: 0 },
  localLoadoutId: "acb-hides",
  localAttackSetIndex: 3
});
frozenBothRangeTenTilesLongrange = freezeBothActors(frozenBothRangeTenTilesLongrange, 20);
frozenBothRangeTenTilesLongrange = requestLocalAttack(frozenBothRangeTenTilesLongrange);
const frozenBothRangeTenTilesLongrangeResult = advance(frozenBothRangeTenTilesLongrange);
const frozenBothRangeTenTilesLongrangeEvent = frozenBothRangeTenTilesLongrangeResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "local-player"
);
assert(
  frozenBothRangeTenTilesLongrangeResult.state.queuedHits.length === 1 &&
    frozenBothRangeTenTilesLongrangeEvent?.style === "ranged" &&
    frozenBothRangeTenTilesLongrangeResult.state.queuedHits[0]?.attackType === "LONG_RANGED" &&
    frozenBothRangeTenTilesLongrangeResult.routeRequests.length === 0,
  `both-frozen longrange ACB should fire through Nh' +2 long-ranged TargetRoute distance without movement: ${JSON.stringify({
    queuedHits: frozenBothRangeTenTilesLongrangeResult.state.queuedHits,
    routeRequests: frozenBothRangeTenTilesLongrangeResult.routeRequests,
    event: frozenBothRangeTenTilesLongrangeEvent
  })}`
);

let cooldownMeleeStep = createState(10, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 1 },
  localLoadoutId: "tentacle-bandos"
});
cooldownMeleeStep = {
  ...cooldownMeleeStep,
  actors: {
    ...cooldownMeleeStep.actors,
    "local-player": {
      ...cooldownMeleeStep.actors["local-player"],
      attackTimer: {
        ...cooldownMeleeStep.actors["local-player"].attackTimer,
        lastAttackTick: cooldownMeleeStep.tick,
        weaponCooldownTicks: 4
      }
    }
  }
};
cooldownMeleeStep = requestLocalAttack(cooldownMeleeStep);
const cooldownMeleeStepResult = advance(cooldownMeleeStep);
assert(cooldownMeleeStepResult.state.queuedHits.length === 0, "cooldown melee step-in should not queue a hit before the attack timer is ready");
assert(
  cooldownMeleeStepResult.routeRequests.some(
    (request) => request.actorId === "local-player" && request.reason === "timer" && request.attackRange === 1
  ),
  "cooldown melee step-in should still set the target route before the swing is ready"
);

let meleeStep = createState(11, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 1 },
  localLoadoutId: "tentacle-bandos"
});
meleeStep = requestLocalAttack(meleeStep);
const meleeStepResult = advance(meleeStep);
assert(meleeStepResult.state.queuedHits.length === 0, "unfrozen diagonal melee should not hit until TargetRoute has consumed the step-in movement");
assert(
  meleeStepResult.routeRequests.some(
    (request) => request.actorId === "local-player" && request.reason === "ready" && request.attackRange === 1
  ),
  "step-in melee should request target-route movement toward the target"
);

let consumedMovementMelee = createState(1110, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 2, z: 0 },
  localLoadoutId: "tentacle-bandos"
});
consumedMovementMelee = requestLocalAttack(consumedMovementMelee);
const consumedMovementMeleeResult = runtimeCombat.advanceRuntimePlayerCombat(consumedMovementMelee, {
  tiles: {
    "local-player": consumedMovementMelee.actors["local-player"].tile,
    opponent: consumedMovementMelee.actors.opponent.tile
  },
  targetRouteMovementConsumed: {
    "local-player": true
  }
});
assert(
  consumedMovementMeleeResult.state.queuedHits.length === 0 &&
    consumedMovementMeleeResult.routeRequests.some((request) => request.actorId === "local-player" && request.reason === "ready"),
  "melee should not still attack from step-in range after its Nh movement step was already consumed this tick"
);

let consumedMovementSameTileRange = createState(1112, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides"
});
consumedMovementSameTileRange = requestLocalAttack(consumedMovementSameTileRange);
const sameTileRangeWithoutConsumedMovement = advance(consumedMovementSameTileRange);
assert(
  sameTileRangeWithoutConsumedMovement.routeRequests.some(
    (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 8
  ),
  "same-tile ranged attacks should request a target route when no movement packet has already been consumed"
);
const sameTileRangeAfterConsumedMovement = runtimeCombat.advanceRuntimePlayerCombat(consumedMovementSameTileRange, {
  tiles: {
    "local-player": consumedMovementSameTileRange.actors["local-player"].tile,
    opponent: consumedMovementSameTileRange.actors.opponent.tile
  },
  targetRouteMovementConsumed: {
    "local-player": true
  }
});
assert(
  sameTileRangeAfterConsumedMovement.state.queuedHits.length === 0 &&
    sameTileRangeAfterConsumedMovement.routeRequests.length === 0,
  "same-tile ranged target routing should not counter-route an explicit movement step already consumed this tick"
);
assert(
  targetRouteSource.includes("r != null && r.target != null && entity.getMovement().isAtDestination()"),
  "Nh TargetRoute.beforeMovement should only issue target routing when the actor is already at destination"
);
const tentacleTargetRouteProfile = runtimeCombat.runtimePlayerCombatTargetRouteProfile(
  "local-player",
  consumedMovementMelee.actors["local-player"]
);
assert(
  tentacleTargetRouteProfile.melee &&
    tentacleTargetRouteProfile.attackRange === 1 &&
    tentacleTargetRouteProfile.source === "weapon",
  "target-route helper should expose the active Nh melee weapon route profile for UI pre-routing"
);
const opponentKodaiTargetRouteProfile = runtimeCombat.runtimePlayerCombatTargetRouteProfile(
  "opponent",
  createState(1111).actors.opponent
);
assert(
  !opponentKodaiTargetRouteProfile.melee && opponentKodaiTargetRouteProfile.source === "bot-autocast-spell",
  "target-route helper should preserve the opponent bot's source-backed default autocast instead of treating Kodai as melee"
);

let sceneScaledAdjacentMelee = createState(111, {
  localTile: { x: 0.25, z: 0.25 },
  opponentTile: { x: 0.75, z: 0.25 },
  localLoadoutId: "tentacle-bandos"
});
sceneScaledAdjacentMelee = requestLocalAttack(sceneScaledAdjacentMelee);
const sceneScaledAdjacentMeleeResult = advance(sceneScaledAdjacentMelee);
assert(
  sceneScaledAdjacentMeleeResult.state.events.some((event) => event.kind === "attack" && event.attackerId === "local-player") &&
    (sceneScaledAdjacentMeleeResult.state.queuedHits.length === 1 ||
      sceneScaledAdjacentMeleeResult.state.events.some((event) => event.kind === "hitsplat" && event.attackerId === "local-player")),
  "manual-scene adjacent melee should treat Nh 0.5 scene units as one tile and resolve a hit without routing"
);
assert(
  sceneScaledAdjacentMeleeResult.routeRequests.length === 0,
  "manual-scene adjacent melee should not route underneath the target after an already-reached hit"
);

let sceneScaledStepMelee = createState(112, {
  localTile: { x: 0.25, z: 0.25 },
  opponentTile: { x: 1.25, z: 0.25 },
  localLoadoutId: "tentacle-bandos"
});
sceneScaledStepMelee = requestLocalAttack(sceneScaledStepMelee);
const sceneScaledStepMeleeResult = advance(sceneScaledStepMelee);
assert(
  sceneScaledStepMeleeResult.state.queuedHits.length === 0 &&
    sceneScaledStepMeleeResult.routeRequests.some((request) => request.reason === "ready" && request.attackRange === 1),
  "manual-scene two-tile melee should route to a valid attack tile before the hit can be queued"
);

let sceneScaledAdjacentRange = createState(113, {
  localTile: { x: 0.25, z: 0.25 },
  opponentTile: { x: 0.75, z: 0.25 },
  localLoadoutId: "acb-hides"
});
sceneScaledAdjacentRange = requestLocalAttack(sceneScaledAdjacentRange);
const sceneScaledAdjacentRangeResult = advance(sceneScaledAdjacentRange);
assert(
  sceneScaledAdjacentRangeResult.state.queuedHits.length === 1,
  "manual-scene adjacent ranged attacks should not be blocked by sub-1 scene-unit distance"
);

let wandAttack = createState(12, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "kodai-robes"
});
wandAttack = requestLocalAttack(wandAttack);
const wandAttackResult = advance(wandAttack);
const wandAttackEvent = wandAttackResult.state.events.find((event) => event.kind === "attack");
assert(wandAttackEvent?.style === "slash", "Staff of the Dead default Attack should dispatch its source melee style, not a spell");
assert(wandAttackEvent?.sequenceName === "wand_attack", "Staff of the Dead default Attack should use source WAND staff bash animation 393 instead of whip fallback");
assert(wandAttackEvent?.projectile === undefined, "Staff of the Dead default Attack should not emit an Ice Barrage projectile");
assert(JSON.stringify(wandAttackEvent?.soundIds) === JSON.stringify([2555]), `Staff of the Dead default Attack should emit source attack sound 2555: ${JSON.stringify(wandAttackEvent)}`);
assert(wandAttackEvent?.hitDelayTicks === 1, "Staff of the Dead default melee hit should resolve through the melee hit delay");
assertAttackAnimationWindow(wandAttackResult, "local-player", "Staff of the Dead default staff bash");

let localKodaiNoAutocast = createState(122, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes"
});
localKodaiNoAutocast = requestLocalAttack(localKodaiNoAutocast);
const localKodaiNoAutocastResult = advance(localKodaiNoAutocast);
assert(
  localKodaiNoAutocastResult.state.queuedHits.length === 0 &&
    localKodaiNoAutocastResult.routeRequests.some(
      (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 1
    ),
  "local/player Kodai Attack without selected spell or autocast should remain a normal WAND attack path, not implicit Ice Barrage"
);

let botKodaiDefaultAutocast = createState(123, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
botKodaiDefaultAutocast = requestOpponentAttack(botKodaiDefaultAutocast);
const botKodaiDefaultAutocastResult = advance(botKodaiDefaultAutocast);
const botKodaiDefaultAutocastEvent = botKodaiDefaultAutocastResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "opponent"
);
assert(
  botKodaiDefaultAutocastEvent?.style === "magic" &&
    botKodaiDefaultAutocastEvent.spellId === "ice-barrage" &&
    botKodaiDefaultAutocastEvent.autocast === true &&
    botKodaiDefaultAutocastEvent.sequenceName === "barrage_cast" &&
    botKodaiDefaultAutocastEvent.projectile?.id === "ice_barrage_projectile",
  `opponent/bot Kodai Attack should default to persistent Ice Barrage semantics instead of staff-bashing: ${JSON.stringify(botKodaiDefaultAutocastEvent)}`
);
assert(
  botKodaiDefaultAutocastResult.state.actors.opponent.autocastSpellId === null,
  "bot-only default autocast should be an attack fallback and should not silently set the local-visible autocast varp"
);

let staleOpponentCombatLoadout = createState(124, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
staleOpponentCombatLoadout = runtimeCombat.syncRuntimePlayerCombatStateToInput(staleOpponentCombatLoadout, {
  tiles: {
    "local-player": staleOpponentCombatLoadout.actors["local-player"].tile,
    opponent: staleOpponentCombatLoadout.actors.opponent.tile
  },
  loadouts: {
    "local-player": "acb-hides",
    opponent: "acb-hides"
  }
});
staleOpponentCombatLoadout = requestOpponentAttack(staleOpponentCombatLoadout);
const syncedOpponentLoadoutResult = advance(staleOpponentCombatLoadout);
const syncedOpponentLoadoutEvent = syncedOpponentLoadoutResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "opponent"
);
assert(
  syncedOpponentLoadoutEvent?.style === "ranged" &&
    syncedOpponentLoadoutEvent.spellId === undefined &&
    syncedOpponentLoadoutEvent.sequenceName === "crossbow_attack",
  `visible ACB/Armadyl opponent loadout must not be allowed to fire a stale Kodai autocast: ${JSON.stringify(syncedOpponentLoadoutEvent)}`
);

let staleOpponentActionWindow = createState(125, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
staleOpponentActionWindow = requestOpponentAttack(staleOpponentActionWindow);
const staleOpponentMagicStart = advance(staleOpponentActionWindow).state;
assert(
  staleOpponentMagicStart.actors.opponent.actionSequenceName === "barrage_cast",
  "test setup should start with an active opponent Kodai barrage action window"
);
const syncedStaleOpponentActionWindow = runtimeCombat.syncRuntimePlayerCombatStateToInput(staleOpponentMagicStart, {
  tiles: {
    "local-player": staleOpponentMagicStart.actors["local-player"].tile,
    opponent: staleOpponentMagicStart.actors.opponent.tile
  },
  loadouts: {
    "local-player": "acb-hides",
    opponent: "acb-hides"
  }
});
assert(
  syncedStaleOpponentActionWindow.actors.opponent.actionSequenceName === "barrage_cast" &&
    syncedStaleOpponentActionWindow.actors.opponent.actionStartedAtTick === staleOpponentMagicStart.actors.opponent.actionStartedAtTick &&
    syncedStaleOpponentActionWindow.actors.opponent.actionUntilTick === staleOpponentMagicStart.actors.opponent.actionUntilTick &&
    syncedStaleOpponentActionWindow.actors.opponent.queuedSpellId === null &&
    syncedStaleOpponentActionWindow.actors.opponent.autocastSpellId === null,
  "visible ACB/Armadyl opponent sync should keep the already-started Nh action animation while clearing stale spell/autocast state"
);

const forcedMagicPolicyController = {
  id: "test-policy-forced-magic",
  chooseAction: () => ({
    offenceStyle: "magic",
    defencePrayer: "protect_from_missiles",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
let manualPolicyOpponentMagic = createState(126, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides"
});
const manualPolicyMagicApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicyOpponentMagic,
  controller: forcedMagicPolicyController,
  localActor: {
    tile: manualPolicyOpponentMagic.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: manualPolicyOpponentMagic.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  manualPolicyMagicApplied.controllerId === "test-policy-forced-magic" &&
    manualPolicyMagicApplied.opponentLoadoutId === "kodai-robes",
  "manual viewport opponent should use the loaded policy controller to choose its visible loadout"
);
assert(
  manualPolicyMagicApplied.state.actors.opponent.autocastSpellId === "ice-barrage",
  "manual viewport opponent magic should mirror NhStakerBot.castBarrage by explicitly setting Ice Barrage autocast"
);
const manualPolicyMagicResult = advance(manualPolicyMagicApplied.state);
const manualPolicyMagicEvent = manualPolicyMagicResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "opponent"
);
assert(
  manualPolicyMagicEvent?.style === "magic" &&
    manualPolicyMagicEvent.spellId === "ice-barrage" &&
    manualPolicyMagicEvent.autocast === true &&
    manualPolicyMagicEvent.sequenceName === "barrage_cast",
  `manual viewport opponent policy magic should attack from Kodai, not visible Armadyl: ${JSON.stringify(manualPolicyMagicEvent)}`
);

const forcedRangedPolicyController = {
  id: "test-policy-forced-ranged",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const manualPolicyRangeApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicyMagicResult.state,
  controller: forcedRangedPolicyController,
  localActor: {
    tile: manualPolicyMagicResult.state.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: manualPolicyMagicResult.state.actors.opponent.tile,
    loadoutId: "kodai-robes"
  }
});
assert(
  manualPolicyRangeApplied.opponentLoadoutId === "acb-hides" &&
    manualPolicyRangeApplied.state.actors.opponent.queuedSpellId === null &&
    manualPolicyRangeApplied.state.actors.opponent.autocastSpellId === null,
  "manual viewport opponent policy range should clear stale Kodai spell state and show Armadyl before ranged attacks"
);

const forcedRangedUnequipBootsPolicyController = {
  id: "test-policy-ranged-unequip-boots",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false,
    attackIntent: "attack",
    equipmentIntent: "unequip_feet"
  })
};
let manualPolicyUnequipBoots = createState(131, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  localPrayers: ["protect_from_magic"]
});
const manualPolicyUnequipBootsApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicyUnequipBoots,
  controller: forcedRangedUnequipBootsPolicyController,
  localActor: {
    tile: manualPolicyUnequipBoots.actors["local-player"].tile,
    loadoutId: "acb-hides",
    activePrayers: ["protect_from_magic"]
  },
  opponentActor: {
    tile: manualPolicyUnequipBoots.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  manualPolicyUnequipBootsApplied.effectiveAction.equipmentIntent === "unequip_feet" &&
    manualPolicyUnequipBootsApplied.effectiveAction.attackIntent === "attack" &&
    manualPolicyUnequipBootsApplied.state.actors.opponent.equipment.feet === undefined &&
    manualPolicyUnequipBootsApplied.state.actors.opponent.targetId === "local-player",
  `manual viewport opponent policy should unequip boots while still requesting an attack: ${JSON.stringify({
    action: manualPolicyUnequipBootsApplied.effectiveAction,
    feet: manualPolicyUnequipBootsApplied.state.actors.opponent.equipment.feet,
    targetId: manualPolicyUnequipBootsApplied.state.actors.opponent.targetId
  })}`
);
const manualPolicyUnequipBootsResult = advance(manualPolicyUnequipBootsApplied.state);
const manualPolicyUnequipBootsEvent = manualPolicyUnequipBootsResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "opponent"
);
assert(
  manualPolicyUnequipBootsEvent?.style === "ranged" &&
    manualPolicyUnequipBootsResult.state.actors.opponent.equipment.feet === undefined,
  `manual viewport opponent policy boot unequip should not consume the tick before ranged attack: ${JSON.stringify({
    event: manualPolicyUnequipBootsEvent,
    feet: manualPolicyUnequipBootsResult.state.actors.opponent.equipment.feet
  })}`
);
const forcedDoubleGmaulPolicyController = {
  id: "test-policy-forced-double-gmaul",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "spec_granite_maul_double",
    extendedSupplyAction: false
  })
};
let manualPolicyOpponentGmaul = createState(130, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentLevels: { attack: 1, strength: 1, defence: 99, ranged: 99, magic: 1 }
});
const manualPolicyGmaulApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicyOpponentGmaul,
  controller: forcedDoubleGmaulPolicyController,
  localActor: {
    tile: manualPolicyOpponentGmaul.actors["local-player"].tile,
    loadoutId: "acb-hides",
    activePrayers: ["protect_from_magic"]
  },
  opponentActor: {
    tile: manualPolicyOpponentGmaul.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  manualPolicyGmaulApplied.opponentLoadoutId === "acb-hides" &&
    manualPolicyGmaulApplied.state.actors.opponent.equipment.weapon?.itemId ===
      nhLoadouts.nhLoadouts["gmaul-bandos"].equipment.weapon?.itemId &&
    manualPolicyGmaulApplied.state.actors.opponent.gmaul.queuedSpecs === 2,
  `manual viewport policy gmaul intent should equip the maul weapon only and queue the double spec from a tick-start special-bar weapon: ${JSON.stringify({
    opponentLoadoutId: manualPolicyGmaulApplied.opponentLoadoutId,
    weapon: manualPolicyGmaulApplied.state.actors.opponent.equipment.weapon?.itemId,
    queuedSpecs: manualPolicyGmaulApplied.state.actors.opponent.gmaul.queuedSpecs,
    action: manualPolicyGmaulApplied.action,
    effectiveAction: manualPolicyGmaulApplied.effectiveAction
  })}`
);
const manualPolicyGmaulResult = advance(manualPolicyGmaulApplied.state);
assert(
  manualPolicyGmaulResult.state.events.some(
    (event) => event.kind === "attack" && event.attackerId === "opponent" && event.specialAttack === "granite_maul"
  ) &&
    manualPolicyGmaulResult.state.events.some(
      (event) => event.kind === "spotanim" && event.actorId === "opponent" && event.spotanimId === 340
    ) &&
    manualPolicyGmaulResult.state.actors.opponent.gmaul.specialEnergy === 0,
  "manual viewport policy gmaul input should become the Nh Granite maul special attack path"
);

let manualPolicyOpponentStepInGmaul = createState(138, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 3, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides"
});
const manualPolicyStepInGmaulApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicyOpponentStepInGmaul,
  controller: forcedDoubleGmaulPolicyController,
  localActor: {
    tile: manualPolicyOpponentStepInGmaul.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: manualPolicyOpponentStepInGmaul.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  manualPolicyStepInGmaulApplied.effectiveAction.specIntent === "spec_granite_maul_double" &&
    manualPolicyStepInGmaulApplied.state.actors.opponent.gmaul.queuedSpecs === 2,
  `manual viewport policy gmaul intent should allow regular-melee next-tick step-in range at dx=3: ${JSON.stringify({
    queuedSpecs: manualPolicyStepInGmaulApplied.state.actors.opponent.gmaul.queuedSpecs,
    effectiveAction: manualPolicyStepInGmaulApplied.effectiveAction
  })}`
);

let manualPolicyOpponentCornerGmaul = createState(139, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 3, z: 3 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides"
});
const manualPolicyCornerGmaulApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicyOpponentCornerGmaul,
  controller: forcedDoubleGmaulPolicyController,
  localActor: {
    tile: manualPolicyOpponentCornerGmaul.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: manualPolicyOpponentCornerGmaul.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  manualPolicyCornerGmaulApplied.effectiveAction.specIntent === "none" &&
    manualPolicyCornerGmaulApplied.state.actors.opponent.gmaul.queuedSpecs === 0,
  `manual viewport policy gmaul intent should reject the removed far corner of the 7x7 step-in shape: ${JSON.stringify({
    queuedSpecs: manualPolicyCornerGmaulApplied.state.actors.opponent.gmaul.queuedSpecs,
    effectiveAction: manualPolicyCornerGmaulApplied.effectiveAction
  })}`
);

let manualPolicyOpponentFarGmaul = createState(132, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides"
});
const manualPolicyFarGmaulApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicyOpponentFarGmaul,
  controller: forcedDoubleGmaulPolicyController,
  localActor: {
    tile: manualPolicyOpponentFarGmaul.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: manualPolicyOpponentFarGmaul.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  manualPolicyFarGmaulApplied.effectiveAction.specIntent === "none" &&
    manualPolicyFarGmaulApplied.state.actors.opponent.gmaul.queuedSpecs === 0,
  `manual viewport policy gmaul intent should wait until NhStakerBot.maybeEquipGraniteMaulForSpec observes valid next-tick step-in reach: ${JSON.stringify({
    opponentLoadoutId: manualPolicyFarGmaulApplied.opponentLoadoutId,
    weapon: manualPolicyFarGmaulApplied.state.actors.opponent.equipment.weapon?.itemId,
    queuedSpecs: manualPolicyFarGmaulApplied.state.actors.opponent.gmaul.queuedSpecs,
    effectiveAction: manualPolicyFarGmaulApplied.effectiveAction
  })}`
);

let manualPolicyOpponentFarMeleeGmaul = createState(133, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "gmaul-bandos"
});
const manualPolicyFarMeleeGmaulApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicyOpponentFarMeleeGmaul,
  controller: forcedDoubleGmaulPolicyController,
  localActor: {
    tile: manualPolicyOpponentFarMeleeGmaul.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: manualPolicyOpponentFarMeleeGmaul.actors.opponent.tile,
    loadoutId: "gmaul-bandos"
  }
});
assert(
  manualPolicyFarMeleeGmaulApplied.effectiveAction.specIntent === "none" &&
    manualPolicyFarMeleeGmaulApplied.state.actors.opponent.gmaul.queuedSpecs === 0,
  `manual viewport policy gmaul intent should still skip when the tick-start weapon itself is melee and cannot attack yet: ${JSON.stringify({
    queuedSpecs: manualPolicyFarMeleeGmaulApplied.state.actors.opponent.gmaul.queuedSpecs,
    effectiveAction: manualPolicyFarMeleeGmaulApplied.effectiveAction
  })}`
);

let manualPolicyOpponentNoSpecControl = createState(131, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
const manualPolicyNoSpecControlEquipment = {
  ...manualPolicyOpponentNoSpecControl.actors.opponent.equipment,
  weapon: { itemId: 4675, name: "Ancient staff" }
};
const manualPolicyNoSpecControlApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicyOpponentNoSpecControl,
  controller: forcedDoubleGmaulPolicyController,
  localActor: {
    tile: manualPolicyOpponentNoSpecControl.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: manualPolicyOpponentNoSpecControl.actors.opponent.tile,
    loadoutId: "kodai-robes",
    equipment: manualPolicyNoSpecControlEquipment
  }
});
assert(
  manualPolicyNoSpecControlApplied.effectiveAction.specIntent === "none" &&
    manualPolicyNoSpecControlApplied.state.actors.opponent.gmaul.queuedSpecs === 0,
  `manual viewport policy gmaul intent should be skipped when Nh tick-start client spec control is unavailable: ${JSON.stringify({
    effectiveAction: manualPolicyNoSpecControlApplied.effectiveAction,
    queuedSpecs: manualPolicyNoSpecControlApplied.state.actors.opponent.gmaul.queuedSpecs,
    loadoutId: manualPolicyNoSpecControlApplied.opponentLoadoutId
  })}`
);

const visibleEvState = nhDuel.createInitialNhDuelState(128);
const acbLoadoutActor = visibleEvState.actors.opponent;
const visibleEvSelf = {
  ...visibleEvState.actors.self,
  loadoutId: "acb-hides",
  weaponId: "armadyl_crossbow",
  equipment: acbLoadoutActor.equipment
};
const visibleEvOpponent = {
  ...visibleEvState.actors.opponent,
  loadoutId: "acb-hides",
  weaponId: "armadyl_crossbow",
  equipment: acbLoadoutActor.equipment,
  activePrayers: []
};
const visibleEvContext = nhDuel.createNhDuelControllerContext(0, visibleEvSelf, visibleEvOpponent);
const visibleEvByStyle = new Map(visibleEvContext.visibleStyleEvs.map((estimate) => [estimate.style, estimate.expectedDamage]));
assert(
  ["magic", "ranged", "slash"].every((style) => (visibleEvByStyle.get(style) ?? 0) > 0),
  `candidate style EV should evaluate every switchable style with candidate gear: ${JSON.stringify(Object.fromEntries(visibleEvByStyle))}`
);
assert(
  nhDuelSource.includes("attackerPrayers: compatiblePrayerSet([...self.activePrayers, offensivePrayerForVisibleStyle(style)])") &&
    nhDuelSource.includes('style === "slash" ? offensivePrayerForStyle("melee") : offensivePrayerForStyle(style)'),
  "candidate visible-style EV should include the offensive prayer that Nh would use for the candidate style"
);
const protectedMissilesVisibleEvOpponent = {
  ...visibleEvOpponent,
  activePrayers: ["protect_from_missiles"]
};
const protectedMissilesVisibleEvContext = nhDuel.createNhDuelControllerContext(
  0,
  visibleEvSelf,
  protectedMissilesVisibleEvOpponent
);
const protectedMissilesVisibleEvByStyle = new Map(
  protectedMissilesVisibleEvContext.visibleStyleEvs.map((estimate) => [estimate.style, estimate.expectedDamage])
);
assert(
  (protectedMissilesVisibleEvByStyle.get("ranged") ?? Infinity) <
    Math.max(protectedMissilesVisibleEvByStyle.get("magic") ?? 0, protectedMissilesVisibleEvByStyle.get("slash") ?? 0),
  `candidate visible-style EV should apply PvP protection-prayer damage reduction before ranking bot attacks: ${JSON.stringify(Object.fromEntries(protectedMissilesVisibleEvByStyle))}`
);
const defaultNhPolicyPath = path.resolve(
  serverProjectRoot,
  "data",
  "ai",
  "nhstaker-selfplay-policy-nhstake-ags-hard.tsv"
);
const defaultNhPolicy = botPolicy.parseNhPolicyTsv(readFileSync(defaultNhPolicyPath, "utf8"), defaultNhPolicyPath);
const gmaulSpecProbeAction = {
  offenceStyle: "ranged",
  defencePrayer: "protect_from_magic",
  movementIntent: "pressure",
  supplyIntent: "none",
  specIntent: "spec_granite_maul_double",
  extendedSupplyAction: false
};
const specProbePolicy = {
  version: 1,
  counters: { decisions: 0, samples: 0, exploration: 0 },
  actionVisits: [],
  weightsByAction: new Map([[nhPolicyBridge.encodeNhPolicyAction(gmaulSpecProbeAction), new Map()]]),
  weightEntryCount: 0,
  sourceLabel: "spec-probe"
};
const gmaulSpecProbeState = nhDuel.createInitialNhDuelState(130);
const gmaulSpecProbeOpponent = {
  ...gmaulSpecProbeState.actors.opponent,
  tile: { x: 1, y: 0, plane: 0 },
  stats: {
    ...gmaulSpecProbeState.actors.opponent.stats,
    hitpoints: {
      ...gmaulSpecProbeState.actors.opponent.stats.hitpoints,
      current: 18
    }
  }
};
const gmaulSpecProbeAcbSelf = {
  ...gmaulSpecProbeState.actors.self,
  tile: { x: 0, y: 0, plane: 0 },
  loadoutId: "acb-hides",
  weaponId: "armadyl_crossbow",
  equipment: nhLoadouts.nhLoadouts["acb-hides"].equipment
};
const gmaulSpecProbeKodaiSelf = {
  ...gmaulSpecProbeAcbSelf,
  loadoutId: "kodai-robes",
  weaponId: "kodai",
  equipment: nhLoadouts.nhLoadouts["kodai-robes"].equipment
};
const gmaulSpecProbeAcbContext = nhDuel.createNhDuelControllerContext(
  0,
  gmaulSpecProbeAcbSelf,
  gmaulSpecProbeOpponent
);
const gmaulSpecProbeKodaiContext = nhDuel.createNhDuelControllerContext(
  0,
  gmaulSpecProbeKodaiSelf,
  gmaulSpecProbeOpponent
);
const gmaulSpecProbeAcbInput = nhPolicyFeatures.encodeNhPolicyInput(gmaulSpecProbeAcbContext);
const gmaulSpecProbeKodaiInput = nhPolicyFeatures.encodeNhPolicyInput(gmaulSpecProbeKodaiContext);
assert(
  gmaulSpecProbeAcbInput[10] === 1 &&
    gmaulSpecProbeAcbInput[11] === 1 &&
    gmaulSpecProbeKodaiInput[10] === 0 &&
    gmaulSpecProbeKodaiInput[11] === 0,
  `NH policy spec-control features should mirror Nh tick-start special bar control, not already-equipped gmaul state: ${JSON.stringify({
    acb: gmaulSpecProbeAcbInput.slice(10, 12),
    kodai: gmaulSpecProbeKodaiInput.slice(10, 12)
  })}`
);
const gmaulSpecProbeAcbRanking = botPolicy.rankNhPolicyActionsFromFeatures(
  specProbePolicy,
  nhPolicyFeatures.encodeNhPolicyFeatures(gmaulSpecProbeAcbContext, nhPolicyFeatures.createNhPolicyFeatureState()),
  1,
  gmaulSpecProbeAcbContext
);
const gmaulSpecProbeKodaiRanking = botPolicy.rankNhPolicyActionsFromFeatures(
  specProbePolicy,
  nhPolicyFeatures.encodeNhPolicyFeatures(gmaulSpecProbeKodaiContext, nhPolicyFeatures.createNhPolicyFeatureState()),
  1,
  gmaulSpecProbeKodaiContext
);
assert(
  gmaulSpecProbeAcbRanking[0]?.decoded.specIntent === "spec_granite_maul_double" &&
    gmaulSpecProbeKodaiRanking[0]?.decoded.specIntent === "none",
  `NH policy bridge should allow gmaul intents from tick-start spec-bar weapons and reject them from Kodai: ${JSON.stringify({
    acb: gmaulSpecProbeAcbRanking[0]?.decoded,
    kodai: gmaulSpecProbeKodaiRanking[0]?.decoded
  })}`
);
const visibleEvPolicyFeatures = nhPolicyFeatures.encodeNhPolicyFeatures(
  visibleEvContext,
  nhPolicyFeatures.createNhPolicyFeatureState()
);
const visibleEvPolicyRankings = botPolicy.rankNhPolicyActionsFromFeatures(
  defaultNhPolicy,
  visibleEvPolicyFeatures,
  5,
  visibleEvContext
);
const expectedVisibleEvOffenceStyle = visibleEvContext.bestVisibleStyle === "slash" ? "melee" : visibleEvContext.bestVisibleStyle;
assert(
  visibleEvPolicyRankings[0]?.decoded.offenceStyle === expectedVisibleEvOffenceStyle,
  `default NH policy should follow the best candidate-gear visible EV style: ${JSON.stringify({
    expected: expectedVisibleEvOffenceStyle,
    evs: Object.fromEntries(visibleEvByStyle),
    rankings: visibleEvPolicyRankings.map((entry) => ({ score: entry.score, decoded: entry.decoded }))
  })}`
);
const protectedMissilesVisibleEvPolicyFeatures = nhPolicyFeatures.encodeNhPolicyFeatures(
  protectedMissilesVisibleEvContext,
  nhPolicyFeatures.createNhPolicyFeatureState()
);
const protectedMissilesVisibleEvPolicyRankings = botPolicy.rankNhPolicyActionsFromFeatures(
  defaultNhPolicy,
  protectedMissilesVisibleEvPolicyFeatures,
  5,
  protectedMissilesVisibleEvContext
);
const protectedMissilesLiveCounterState = createState(129, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  localPrayers: ["protect_from_missiles"]
});
const protectedMissilesLiveCounterApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: protectedMissilesLiveCounterState,
  controller: botPolicy.createNhPolicyController(defaultNhPolicy),
  localActor: {
    tile: protectedMissilesLiveCounterState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    equipment: acbLoadoutActor.equipment,
    activePrayers: ["protect_from_missiles"]
  },
  opponentActor: {
    tile: protectedMissilesLiveCounterState.actors.opponent.tile,
    loadoutId: "acb-hides",
    equipment: acbLoadoutActor.equipment
  }
});
assert(
  /desiredOffence\s*=\s*enforceLivePrayerCounter\(opponent,\s*desiredOffence(?:,\s*decision)?\);/.test(nhStakerBotSource) &&
    protectedMissilesLiveCounterApplied.effectiveAction.offenceStyle !== "ranged",
  `default NH policy should not keep bolting into active Protect from Missiles after the Java live-prayer counter gate: ${JSON.stringify({
    rankings: protectedMissilesVisibleEvPolicyRankings.map((entry) => ({ score: entry.score, decoded: entry.decoded })),
    action: protectedMissilesLiveCounterApplied.action,
    effectiveAction: protectedMissilesLiveCounterApplied.effectiveAction,
    loadout: protectedMissilesLiveCounterApplied.opponentLoadoutId
  })}`
);
const priorOnlyAntiArmadylPolicy = {
  version: 1,
  counters: { decisions: 0, samples: 0, exploration: 0 },
  actionVisits: [],
  weightsByAction: new Map(
    [
      {
        offenceStyle: "magic",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      },
      {
        offenceStyle: "ranged",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      },
      {
        offenceStyle: "melee",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      }
    ].map((action) => [nhPolicyBridge.encodeNhPolicyAction(action), new Map()])
  ),
  weightEntryCount: 0,
  sourceLabel: "prior-only-anti-armadyl"
};
const priorOnlyAntiArmadylRankings = botPolicy.rankNhPolicyActionsFromFeatures(
  priorOnlyAntiArmadylPolicy,
  visibleEvPolicyFeatures,
  3,
  visibleEvContext
);
assert(
  priorOnlyAntiArmadylRankings[0]?.decoded.offenceStyle === expectedVisibleEvOffenceStyle &&
    visibleEvPolicyRankings[0]?.decoded.offenceStyle === expectedVisibleEvOffenceStyle,
  `EV prior should follow candidate-gear EV instead of a stale current-gear ranking: ${JSON.stringify({
    expected: expectedVisibleEvOffenceStyle,
    priorOnly: priorOnlyAntiArmadylRankings.map((entry) => ({ score: entry.score, decoded: entry.decoded })),
    defaultPolicy: visibleEvPolicyRankings.map((entry) => ({ score: entry.score, decoded: entry.decoded }))
  })}`
);
const scriptedFallbackAntiArmadylState = createState(129, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
const scriptedFallbackAntiArmadyl = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: scriptedFallbackAntiArmadylState,
  controller: nhDuel.scriptedNhController,
  localActor: {
    tile: scriptedFallbackAntiArmadylState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    equipment: acbLoadoutActor.equipment
  },
  opponentActor: {
    tile: scriptedFallbackAntiArmadylState.actors.opponent.tile,
    loadoutId: "kodai-robes"
  }
});
assert(
  scriptedFallbackAntiArmadyl.controllerId === "scripted-nh-controller" &&
    scriptedFallbackAntiArmadyl.action.offenceStyle === "magic" &&
    scriptedFallbackAntiArmadyl.opponentLoadoutId === "kodai-robes",
  `manual viewport no-policy fallback should mirror Java NhStakerBot.clientOffenceEv scripted fallback, not the older trainer visible-EV shortcut: ${JSON.stringify({
    controllerId: scriptedFallbackAntiArmadyl.controllerId,
    action: scriptedFallbackAntiArmadyl.action,
    opponentLoadoutId: scriptedFallbackAntiArmadyl.opponentLoadoutId
  })}`
);

const baseConsumableStats = {
  attack: { current: 99, fixed: 99 },
  strength: { current: 99, fixed: 99 },
  defence: { current: 99, fixed: 99 },
  ranged: { current: 99, fixed: 99 },
  magic: { current: 99, fixed: 99 },
  hitpoints: { current: 50, fixed: 99 },
  prayer: { current: 99, fixed: 99 }
};
const baseConsumableAttackTimer = {
  lastAttackTick: 0,
  weaponCooldownTicks: 0,
  additiveAttackDelayTicks: 0
};
const firstShark = consumables.applyConsumable({
  stats: baseConsumableStats,
  delays: consumables.createSupplyDelayState(),
  attackTimer: baseConsumableAttackTimer,
  currentTick: 100,
  item: "shark"
});
const oneTickEarlyShark = consumables.applyConsumable({
  stats: firstShark.stats,
  delays: firstShark.delays,
  attackTimer: firstShark.attackTimer,
  currentTick: 102,
  item: "shark"
});
const expiryTickShark = consumables.applyConsumable({
  stats: firstShark.stats,
  delays: firstShark.delays,
  attackTimer: firstShark.attackTimer,
  currentTick: 103,
  item: "shark"
});
const expiryTickKarambwan = consumables.applyConsumable({
  stats: baseConsumableStats,
  delays: {
    eatDelayUntilTick: 103,
    karambwanDelayUntilTick: -1,
    potionDelayUntilTick: -1
  },
  attackTimer: baseConsumableAttackTimer,
  currentTick: 103,
  item: "karambwan"
});
assert(
  tickDelaySource.includes("return !Server.isPast(end);") &&
    consumablesSource.includes("return delayUntilTick > currentTick;") &&
    firstShark.ok &&
    firstShark.delays.eatDelayUntilTick === 103 &&
    !oneTickEarlyShark.ok &&
    oneTickEarlyShark.reason === "eat-delay" &&
    expiryTickShark.ok &&
    expiryTickKarambwan.ok &&
    expiryTickKarambwan.attackTimer.additiveAttackDelayTicks === 2,
  `Nh TickDelay should expire when currentTick reaches end, so queued consumables are available on the expiry tick: ${JSON.stringify({
    firstShark,
    oneTickEarlyShark,
    expiryTickShark,
    expiryTickKarambwan
  })}`
);
const lateTickQueue = itemActionQueue.createItemActionQueue();
lateTickQueue.push({
  kind: "eat",
  slotIndex: 0,
  itemId: 385,
  queuedAtMs: 599,
  readyAtMs: 600
});
const lateTickBeforeBoundary = lateTickQueue.drainReady(599, 600);
const lateTickAtBoundary = lateTickQueue.drainReady(600, 600);
assert(
  lateTickBeforeBoundary.length === 0 &&
    lateTickAtBoundary.length === 1 &&
    /const queueInventoryConsumableAction[\s\S]*const readyAtMs = nextNhGameTickAt\(runtimeTickOriginMsRef\.current, queuedAtMs\);[\s\S]*itemActionQueueRef\.current\.push\(\{[\s\S]*readyAtMs,/.test(viewerSource),
  `queued consumable packets should resolve on the next Nh tick boundary even when clicked late in the previous tick: ${JSON.stringify({
    lateTickBeforeBoundary,
    lateTickAtBoundary
  })}`
);

const forcedDoubleEatPolicyController = {
  id: "test-policy-forced-double-eat",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "double_eat",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
let manualPolicySupplyState = createState(127, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentSupplies: {
    manta_ray: 4,
    shark: 0,
    anglerfish: 0,
    karambwan: 4,
    saradomin_brew: 0,
    super_restore: 0,
    sanfew_serum: 0,
    super_combat: 0,
    ranging_potion: 0,
    bastion: 0
  }
});
manualPolicySupplyState = {
  ...manualPolicySupplyState,
  actors: {
    ...manualPolicySupplyState.actors,
    opponent: {
      ...manualPolicySupplyState.actors.opponent,
      hitpoints: 45
    }
  }
};
const manualPolicySupplyApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicySupplyState,
  controller: forcedDoubleEatPolicyController,
  localActor: {
    tile: manualPolicySupplyState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: manualPolicySupplyState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  manualPolicySupplyApplied.context.self.supplies.manta_ray === 4 &&
    manualPolicySupplyApplied.context.self.supplies.karambwan === 4,
  "manual viewport policy context should expose the opponent bot's real supply counts instead of all-zero supplies"
);
assert(
  JSON.stringify(manualPolicySupplyApplied.consumedSupplies) === JSON.stringify(["manta_ray", "karambwan"]) &&
    manualPolicySupplyApplied.state.actors.opponent.hitpoints === 85 &&
    manualPolicySupplyApplied.state.actors.opponent.supplies.manta_ray === 3 &&
    manualPolicySupplyApplied.state.actors.opponent.supplies.karambwan === 3,
  `manual viewport policy bot should consume and persist Nh-timed supplies: ${JSON.stringify({
    consumed: manualPolicySupplyApplied.consumedSupplies,
    hp: manualPolicySupplyApplied.state.actors.opponent.hitpoints,
    supplies: manualPolicySupplyApplied.state.actors.opponent.supplies
  })}`
);

let magicAttack = createState(120, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes"
});
magicAttack = requestLocalSpell(magicAttack);
const magicAttackResult = advance(magicAttack);
const magicAttackEvent = magicAttackResult.state.events.find((event) => event.kind === "attack");
assertAttackAnimationWindow(magicAttackResult, "local-player", "Ice Barrage attack");
assert(magicAttackEvent?.style === "magic", "Selected Ice Barrage should dispatch a magic attack style");
assert(magicAttackEvent?.spellId === "ice-barrage" && magicAttackEvent?.autocast === false, "Selected Ice Barrage should be tagged as a queued one-shot spell, not autocast");
assert(magicAttackEvent?.sequenceName === "barrage_cast", "Selected Ice Barrage should play the barrage cast sequence");
assert(magicAttackEvent?.projectile?.id === "ice_barrage_projectile", "Selected Ice Barrage should emit the ice barrage projectile profile");
assert(JSON.stringify(magicAttackEvent?.soundIds) === JSON.stringify([171]), `Ice Barrage cast should emit source sound 171: ${JSON.stringify(magicAttackEvent)}`);
assert(magicAttackEvent?.hitDelayTicks === 4, "Ice barrage hit delay should match Nh Projectile.send plus TargetSpell clientDelay(projectileDuration, 19)");
assert(magicAttackEvent?.projectileDurationCycles === 86, "Ice barrage projectile duration should use source 56 + 10 cycles per extra tile");
assert(
  magicAttackResult.state.queuedHits[0]?.dueTick <= 4,
  "Ice barrage hitsplat should resolve before the next five-tick magic attack can animate"
);
assert(magicAttackResult.state.queuedHits[0]?.spellId === "ice-barrage", "Ice Barrage queued hit should retain spell metadata for RuneLite-style trackers");
assert(magicAttackResult.state.actors["local-player"].queuedSpellId === null, "queued selected spell should clear after the cast is launched");
assert(magicAttackResult.state.actors["local-player"].targetId === null, "one-shot selected spell should not keep the player auto-attacking");
const magicDamageEstimate = runtimeCombat.runtimePlayerCombatDamageEstimate(
  magicAttackResult.state.actors["local-player"],
  magicAttackResult.state.actors.opponent,
  "magic"
);
assert(magicDamageEstimate.maxDamage === 35, `Staff-of-the-Dead Mystic Ice Barrage max should be 30 base plus the source NH bot gear bonus, not a stale 38/43: ${JSON.stringify(magicDamageEstimate)}`);
assert(
  magicAttackResult.state.queuedHits[0]?.rawDamage <= magicDamageEstimate.maxDamage,
  `Kodai magic queued damage should not exceed the source-visible barrage max: ${JSON.stringify(magicAttackResult.state.queuedHits[0])}`
);
assert(
  magicAttackResult.state.actors["local-player"].actionStartedAtTick === 0 &&
    magicAttackResult.state.actors["local-player"].actionStartedAtClientCycle === 0 &&
    magicAttackResult.state.actors["local-player"].actionDurationTicks === 4 &&
    magicAttackResult.state.actors["local-player"].actionUntilTick === 4,
  "runtime combat attack animation should stay active for the standard animation duration, independent of weapon cooldown window"
);
const magicAttackWeaponSync = runtimeCombat.syncRuntimePlayerCombatStateToInput(magicAttackResult.state, {
  tiles: {
    "local-player": magicAttackResult.state.actors["local-player"].tile,
    opponent: magicAttackResult.state.actors.opponent.tile
  },
  loadouts: {
    "local-player": "acb-hides"
  },
  equipment: {
    "local-player": nhLoadouts.nhLoadouts["acb-hides"].equipment
  }
});
assert(
  magicAttackWeaponSync.actors["local-player"].actionSequenceName === "barrage_cast" &&
    magicAttackWeaponSync.actors["local-player"].actionStartedAtTick === magicAttackResult.state.actors["local-player"].actionStartedAtTick &&
    magicAttackWeaponSync.actors["local-player"].actionStartedAtClientCycle === magicAttackResult.state.actors["local-player"].actionStartedAtClientCycle &&
    magicAttackWeaponSync.queuedHits.length === magicAttackResult.state.queuedHits.length &&
    magicAttackWeaponSync.actors["local-player"].queuedSpellId === null &&
    magicAttackWeaponSync.actors["local-player"].autocastSpellId === null,
  `weapon sync after an attack should preserve the active Nh animation while clearing spell/autocast state: ${JSON.stringify(magicAttackWeaponSync.actors["local-player"])}`
);
let magicHitState = magicAttackResult.state;
for (let index = 0; index < 4; index += 1) {
  magicHitState = advance(magicHitState).state;
}
const magicHitsplatEvent = magicHitState.events.find((event) => event.kind === "hitsplat" && event.style === "magic");
assert(magicHitsplatEvent, "queued magic damage should resolve into a style-tagged hitsplat event");
assert(
  JSON.stringify(magicHitsplatEvent.soundIds) === JSON.stringify([magicHitsplatEvent.damage > 0 ? 168 : 227]),
  `Ice Barrage hit/splash should emit source hit sound 168 or splash sound 227: ${JSON.stringify(magicHitsplatEvent)}`
);
assert(
  magicHitsplatEvent.damage <= magicHitsplatEvent.maxDamage && magicHitsplatEvent.maxDamage === 35,
  `magic hitsplat should be the applied engine value and should not display impossible barrage damage: ${JSON.stringify(magicHitsplatEvent)}`
);

let bloodAttack = null;
let bloodAttackResult = null;
for (let seed = 130; seed < 170; seed += 1) {
  const candidateState = createState(seed, {
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 4, z: 0 },
    localLoadoutId: "kodai-robes"
  });
  const woundedCandidate = {
    ...candidateState,
    actors: {
      ...candidateState.actors,
      "local-player": {
        ...candidateState.actors["local-player"],
        hitpoints: 50
      }
    }
  };
  const result = advance(requestLocalSpell(woundedCandidate, "blood-barrage"));
  if ((result.state.queuedHits[0]?.rawDamage ?? 0) > 0) {
    bloodAttack = woundedCandidate;
    bloodAttackResult = result;
    break;
  }
}
assert(bloodAttack && bloodAttackResult, "Blood Barrage verifier should find a deterministic non-zero source-backed hit seed");
const bloodAttackEvent = bloodAttackResult.state.events.find((event) => event.kind === "attack");
assertAttackAnimationWindow(bloodAttackResult, "local-player", "Blood Barrage attack");
assert(bloodAttackEvent?.style === "magic", "Selected Blood Barrage should dispatch a magic attack style");
assert(bloodAttackEvent?.spellId === "blood-barrage" && bloodAttackEvent?.autocast === false, "Selected Blood Barrage should be tagged as a queued one-shot spell");
assert(bloodAttackEvent?.projectile?.id === "blood_barrage_delay", "Blood Barrage should carry the Nh delay-only Projectile(51,56,10) profile");
assert(bloodAttackEvent?.projectile?.gfxId === -1, "Blood Barrage should not render an Ice projectile because Nh sends no projectile packet for gfx -1");
assert(JSON.stringify(bloodAttackEvent?.soundIds) === JSON.stringify([106]), `Blood Barrage cast should emit source sound 106: ${JSON.stringify(bloodAttackEvent)}`);
assert(bloodAttackEvent?.projectileDurationCycles === 86, "Blood Barrage delay-only projectile should still use source duration cycles for hit timing");
assert(bloodAttackResult.state.queuedHits[0]?.maxDamage === 33, `Blood Barrage max should use base 29 plus the source NH gear bonus: ${JSON.stringify(bloodAttackResult.state.queuedHits[0])}`);
const deterministicBloodHit = bloodAttackResult.state.queuedHits[0];
assert(deterministicBloodHit, "Blood Barrage verifier should queue a delayed hit");
let bloodHitState = {
  ...bloodAttackResult.state,
  queuedHits: [
    {
      ...deterministicBloodHit,
      damage: 20,
      rawDamage: 20
    }
  ]
};
while (bloodHitState.tick < deterministicBloodHit.dueTick) {
  bloodHitState = advance(bloodHitState).state;
  assert(
    bloodHitState.actors["local-player"].hitpoints === 50,
    `Blood Barrage should not heal before the queued hit's due tick: ${JSON.stringify({
      tick: bloodHitState.tick,
      dueTick: deterministicBloodHit.dueTick,
      hitpoints: bloodHitState.actors["local-player"].hitpoints
    })}`
  );
}
bloodHitState = advance(bloodHitState).state;
const bloodHitsplatEvent = bloodHitState.events.find((event) => event.kind === "hitsplat" && event.spellId === "blood-barrage");
const bloodSpotanimEvent = bloodHitState.events.find((event) => event.kind === "spotanim" && event.spotanimId === 377);
assert(bloodHitsplatEvent, "Blood Barrage queued damage should resolve into a tagged hitsplat event");
assert(bloodSpotanimEvent?.artifactUrl === "render/spotanims/blood_barrage_hit.glb", "Blood Barrage should play Nh hit gfx 377, not the Ice Barrage hit gfx");
assert(JSON.stringify(bloodHitsplatEvent.soundIds) === JSON.stringify([102]), `Blood Barrage hit should emit source hit sound 102: ${JSON.stringify(bloodHitsplatEvent)}`);
assert(bloodHitsplatEvent.damage === 20, "Blood Barrage deterministic heal verifier should apply the forced source hit value");
assert(
  bloodHitState.actors["local-player"].hitpoints === Math.min(99, 50 + Math.trunc(bloodHitsplatEvent.damage / 4)),
  `Blood Barrage should heal the caster by hit.damage / 4 like BloodSpell.afterHit: ${JSON.stringify({
    damage: bloodHitsplatEvent.damage,
    hitpoints: bloodHitState.actors["local-player"].hitpoints
  })}`
);

let bloodBlitzAttack = null;
let bloodBlitzAttackResult = null;
for (let seed = 170; seed < 220; seed += 1) {
  const candidateState = createState(seed, {
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 4, z: 0 },
    localLoadoutId: "kodai-robes"
  });
  const woundedCandidate = {
    ...candidateState,
    actors: {
      ...candidateState.actors,
      "local-player": {
        ...candidateState.actors["local-player"],
        hitpoints: 50
      }
    }
  };
  const result = advance(requestLocalSpell(woundedCandidate, "blood-blitz"));
  if ((result.state.queuedHits[0]?.rawDamage ?? 0) > 0) {
    bloodBlitzAttack = woundedCandidate;
    bloodBlitzAttackResult = result;
    break;
  }
}
assert(bloodBlitzAttack && bloodBlitzAttackResult, "Blood Blitz verifier should find a deterministic non-zero source-backed hit seed");
const bloodBlitzAttackEvent = bloodBlitzAttackResult.state.events.find((event) => event.kind === "attack");
assertAttackAnimationWindow(bloodBlitzAttackResult, "local-player", "Blood Blitz attack");
assert(bloodBlitzAttackEvent?.spellId === "blood-blitz", "Selected Blood Blitz should be tagged as a queued one-shot spell");
assert(bloodBlitzAttackEvent?.sequenceName === "blitz_cast", "Blood Blitz should use Nh animation 1978 through the blitz_cast sequence");
assert(bloodBlitzAttackEvent?.projectile?.id === "blood_blitz_projectile", "Blood Blitz should carry Nh projectile gfx 374");
assert(bloodBlitzAttackEvent?.projectile?.artifactUrl === "render/spotanims/blood_blitz_projectile.glb", "Blood Blitz projectile should render from the cache GLB");
assert(JSON.stringify(bloodBlitzAttackEvent?.soundIds) === JSON.stringify([106]), `Blood Blitz cast should emit source sound 106: ${JSON.stringify(bloodBlitzAttackEvent)}`);
assert(bloodBlitzAttackEvent?.projectileDurationCycles === 86, "Blood Blitz projectile duration should use the source 56 + 10 per tile cycles");
assert(bloodBlitzAttackResult.state.queuedHits[0]?.maxDamage === 29, `Blood Blitz max should use base 25 plus the source NH gear bonus: ${JSON.stringify(bloodBlitzAttackResult.state.queuedHits[0])}`);
const deterministicBloodBlitzHit = bloodBlitzAttackResult.state.queuedHits[0];
assert(deterministicBloodBlitzHit, "Blood Blitz verifier should queue a delayed hit");
let bloodBlitzHitState = {
  ...bloodBlitzAttackResult.state,
  queuedHits: [
    {
      ...deterministicBloodBlitzHit,
      damage: 20,
      rawDamage: 20
    }
  ]
};
while (bloodBlitzHitState.tick < deterministicBloodBlitzHit.dueTick) {
  bloodBlitzHitState = advance(bloodBlitzHitState).state;
}
bloodBlitzHitState = advance(bloodBlitzHitState).state;
const bloodBlitzHitsplatEvent = bloodBlitzHitState.events.find((event) => event.kind === "hitsplat" && event.spellId === "blood-blitz");
const bloodBlitzSpotanimEvent = bloodBlitzHitState.events.find((event) => event.kind === "spotanim" && event.spotanimId === 375);
assert(bloodBlitzHitsplatEvent?.damage === 20, "Blood Blitz deterministic heal verifier should apply the forced source hit value");
assert(bloodBlitzSpotanimEvent?.artifactUrl === "render/spotanims/blood_blitz_hit.glb", "Blood Blitz should play Nh hit gfx 375");
assert(JSON.stringify(bloodBlitzHitsplatEvent?.soundIds) === JSON.stringify([104]), `Blood Blitz hit should emit source hit sound 104: ${JSON.stringify(bloodBlitzHitsplatEvent)}`);
assert(
  bloodBlitzHitState.actors["local-player"].hitpoints === Math.min(99, 50 + Math.trunc(bloodBlitzHitsplatEvent.damage / 4)),
  `Blood Blitz should heal the caster by hit.damage / 4 like BloodSpell.afterHit: ${JSON.stringify({
    damage: bloodBlitzHitsplatEvent.damage,
    hitpoints: bloodBlitzHitState.actors["local-player"].hitpoints
  })}`
);

let iceBlitzAttackResult = null;
for (let seed = 220; seed < 270; seed += 1) {
  const result = advance(
    requestLocalSpell(
      createState(seed, {
        localTile: { x: 0, z: 0 },
        opponentTile: { x: 4, z: 0 },
        localLoadoutId: "kodai-robes"
      }),
      "ice-blitz"
    )
  );
  if ((result.state.queuedHits[0]?.rawDamage ?? 0) > 0) {
    iceBlitzAttackResult = result;
    break;
  }
}
assert(iceBlitzAttackResult, "Ice Blitz verifier should find a deterministic non-zero source-backed hit seed");
const iceBlitzAttackEvent = iceBlitzAttackResult.state.events.find((event) => event.kind === "attack");
const iceBlitzCastSpotanimEvent = iceBlitzAttackResult.state.events.find((event) => event.kind === "spotanim" && event.spotanimId === 366);
assertAttackAnimationWindow(iceBlitzAttackResult, "local-player", "Ice Blitz attack");
assert(iceBlitzAttackEvent?.spellId === "ice-blitz", "Selected Ice Blitz should be tagged as a queued one-shot spell");
assert(iceBlitzAttackEvent?.sequenceName === "blitz_cast", "Ice Blitz should use Nh animation 1978 through the blitz_cast sequence");
assert(iceBlitzAttackEvent?.projectile?.id === "ice_blitz_delay", "Ice Blitz should carry Nh delay-only Projectile(56,10)");
assert(iceBlitzAttackEvent?.projectile?.gfxId === -1, "Ice Blitz should not render a travel projectile because Nh sends no projectile packet for gfx -1");
assert(JSON.stringify(iceBlitzAttackEvent?.soundIds) === JSON.stringify([171]), `Ice Blitz cast should emit source sound 171: ${JSON.stringify(iceBlitzAttackEvent)}`);
assert(iceBlitzAttackEvent?.projectileDurationCycles === 86, "Ice Blitz delay-only projectile should still use source duration cycles for hit timing");
assert(iceBlitzCastSpotanimEvent?.artifactUrl === "render/spotanims/ice_blitz_cast.glb", "Ice Blitz should play Nh cast gfx 366 on the caster");
assert(iceBlitzAttackResult.state.queuedHits[0]?.maxDamage === 30, `Ice Blitz max should use base 26 plus the source NH gear bonus: ${JSON.stringify(iceBlitzAttackResult.state.queuedHits[0])}`);
assert(
  runtimeCombat.runtimePlayerCombatSpellDefinitions["ice-blitz"].freezeDurationTicks === runtimeCombat.runtimePlayerCombatIceBlitzFreezeTicks,
  "Ice Blitz definition should carry the Nh 15-second freeze duration"
);
assert(
  entityLocks.isFrozen(iceBlitzAttackResult.state.actors.opponent.locks, iceBlitzAttackResult.state.tick),
  `Ice Blitz should apply freeze on a successful cast like TargetSpell.hold(): ${JSON.stringify(iceBlitzAttackResult.state.actors.opponent.locks)}`
);
const deterministicIceBlitzHit = iceBlitzAttackResult.state.queuedHits[0];
let iceBlitzHitState = {
  ...iceBlitzAttackResult.state,
  queuedHits: [
    {
      ...deterministicIceBlitzHit,
      damage: 20,
      rawDamage: 20
    }
  ]
};
while (iceBlitzHitState.tick < deterministicIceBlitzHit.dueTick) {
  iceBlitzHitState = advance(iceBlitzHitState).state;
}
iceBlitzHitState = advance(iceBlitzHitState).state;
const iceBlitzHitsplatEvent = iceBlitzHitState.events.find((event) => event.kind === "hitsplat" && event.spellId === "ice-blitz");
const iceBlitzHitSpotanimEvent = iceBlitzHitState.events.find((event) => event.kind === "spotanim" && event.spotanimId === 367);
assert(JSON.stringify(iceBlitzHitsplatEvent?.soundIds) === JSON.stringify([169]), `Ice Blitz hit should emit source hit sound 169: ${JSON.stringify(iceBlitzHitsplatEvent)}`);
assert(iceBlitzHitSpotanimEvent?.artifactUrl === "render/spotanims/ice_blitz_hit.glb", "Ice Blitz should play Nh hit gfx 367");

assert(runtimeCombat.runtimePlayerCombatSpellDefinitions["blood-barrage"].requiredMagicLevel === 92, "Blood Barrage runtime definition should keep Nh level requirement 92");
assert(runtimeCombat.runtimePlayerCombatSpellDefinitions["ice-barrage"].requiredMagicLevel === 94, "Ice Barrage runtime definition should keep Nh level requirement 94");
assert(runtimeCombat.runtimePlayerCombatSpellDefinitions["blood-blitz"].requiredMagicLevel === 80, "Blood Blitz runtime definition should keep Nh level requirement 80");
assert(runtimeCombat.runtimePlayerCombatSpellDefinitions["ice-blitz"].requiredMagicLevel === 82, "Ice Blitz runtime definition should keep Nh level requirement 82");

let lowCurrentIce = createState(901, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes",
  localLevels: combatLevels({ magic: 93 })
});
lowCurrentIce = requestLocalSpell(lowCurrentIce, "ice-barrage");
const lowCurrentIceResult = advance(lowCurrentIce);
assert(
  !lowCurrentIceResult.state.events.some((event) => event.kind === "attack" && event.attackerId === "local-player"),
  `current Magic 93 should not cast Ice Barrage requiring 94: ${JSON.stringify(lowCurrentIceResult.state.events)}`
);
assert(
  lowCurrentIceResult.state.queuedHits.every((hit) => hit.attackerId !== "local-player") &&
    lowCurrentIceResult.state.actors["local-player"].queuedSpellId === null &&
    lowCurrentIceResult.state.actors["local-player"].targetId === null,
  `failed Ice Barrage cast should reset the selected spell without queuing damage or cooldown: ${JSON.stringify(lowCurrentIceResult.state.actors["local-player"])}`
);
assert(
  lowCurrentIceResult.state.events.every((event) => event.attackerId !== "local-player"),
  `failed Ice Barrage cast should not add non-render message events into the combat animation stream: ${JSON.stringify(lowCurrentIceResult.state.events)}`
);

let lowCurrentBlood = createState(902, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes",
  localLevels: combatLevels({ magic: 91 })
});
lowCurrentBlood = requestLocalSpell(lowCurrentBlood, "blood-barrage");
const lowCurrentBloodResult = advance(lowCurrentBlood);
assert(
  !lowCurrentBloodResult.state.events.some((event) => event.kind === "attack" && event.attackerId === "local-player") &&
    lowCurrentBloodResult.state.queuedHits.every((hit) => hit.attackerId !== "local-player"),
  `current Magic 91 should not cast Blood Barrage requiring 92: ${JSON.stringify(lowCurrentBloodResult.state.events)}`
);
assert(
  lowCurrentBloodResult.state.events.every((event) => event.attackerId !== "local-player"),
  `failed Blood Barrage cast should not add non-render message events into the combat animation stream: ${JSON.stringify(lowCurrentBloodResult.state.events)}`
);

let exactCurrentBlood = createState(903, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes",
  localLevels: combatLevels({ magic: 92 })
});
exactCurrentBlood = requestLocalSpell(exactCurrentBlood, "blood-barrage");
const exactCurrentBloodResult = advance(exactCurrentBlood);
assert(
  exactCurrentBloodResult.state.events.some(
    (event) => event.kind === "attack" && event.attackerId === "local-player" && event.spellId === "blood-barrage"
  ),
  `current Magic 92 should still cast Blood Barrage at the exact Nh requirement: ${JSON.stringify(exactCurrentBloodResult.state.events)}`
);

let exactCurrentIce = createState(904, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes",
  localLevels: combatLevels({ magic: 94 })
});
exactCurrentIce = requestLocalSpell(exactCurrentIce, "ice-barrage");
const exactCurrentIceResult = advance(exactCurrentIce);
assert(
  exactCurrentIceResult.state.events.some(
    (event) => event.kind === "attack" && event.attackerId === "local-player" && event.spellId === "ice-barrage"
  ),
  `current Magic 94 should still cast Ice Barrage at the exact Nh requirement: ${JSON.stringify(exactCurrentIceResult.state.events)}`
);

let lowCurrentAutocast = createState(905, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes",
  localLevels: combatLevels({ magic: 93 })
});
lowCurrentAutocast = runtimeCombat.setRuntimePlayerCombatAutocast(lowCurrentAutocast, "local-player", "ice-barrage", false);
lowCurrentAutocast = requestLocalAttack(lowCurrentAutocast);
const lowCurrentAutocastResult = advance(lowCurrentAutocast);
assert(
  lowCurrentAutocastResult.state.actors["local-player"].autocastSpellId === "ice-barrage" &&
    lowCurrentAutocastResult.state.actors["local-player"].queuedSpellId === null &&
    lowCurrentAutocastResult.state.actors["local-player"].targetId === null &&
    !lowCurrentAutocastResult.state.events.some((event) => event.kind === "attack" && event.attackerId === "local-player"),
  `failed autocast should reset target but keep the persistent autocast selection like PlayerCombat.reset(): ${JSON.stringify(lowCurrentAutocastResult.state.actors["local-player"])}`
);
assert(
  lowCurrentAutocastResult.state.events.every((event) => event.attackerId !== "local-player"),
  `failed autocast should not add non-render message events into the combat animation stream: ${JSON.stringify(lowCurrentAutocastResult.state.events)}`
);

let autocastAttack = createState(121, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes"
});
autocastAttack = runtimeCombat.setRuntimePlayerCombatAutocast(autocastAttack, "local-player", "ice-barrage", false);
autocastAttack = requestLocalAttack(autocastAttack);
for (let index = 0; index <= 5; index += 1) {
  autocastAttack = advance(autocastAttack).state;
}
const autocastAttackEvents = autocastAttack.events.filter((event) => event.kind === "attack" && event.attackerId === "local-player");
assert(
  JSON.stringify(autocastAttackEvents.map((event) => event.tick)) === JSON.stringify([0, 5]),
  `explicit autocast should persist and fire on the five-tick magic cooldown: ${JSON.stringify(autocastAttackEvents)}`
);
assert(
  autocastAttackEvents.every((event) => event.spellId === "ice-barrage" && event.autocast === true),
  "explicit autocast events should stay tagged separately from one-shot selected spells"
);
assert(autocastAttack.actors["local-player"].autocastSpellId === "ice-barrage", "explicit autocast should persist after repeated attacks");

let zurielIntoCrossbow = createState(906, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  localAttackSetIndex: 1
});
zurielIntoCrossbow = stateWithLocalEquipment(zurielIntoCrossbow, {
  ...nhLoadouts.nhLoadouts["acb-hides"].equipment,
  weapon: { itemId: 22647, name: "Zuriel's staff (Deadman Mode)" }
});
zurielIntoCrossbow = advance(requestLocalSpell(zurielIntoCrossbow, "ice-barrage")).state;
zurielIntoCrossbow = stateWithLocalEquipment(zurielIntoCrossbow, {
  ...nhLoadouts.nhLoadouts["acb-hides"].equipment,
  weapon: { itemId: 26374, name: "Zaryte crossbow" }
});
zurielIntoCrossbow = requestLocalAttack(zurielIntoCrossbow);
while (zurielIntoCrossbow.tick <= 9) {
  zurielIntoCrossbow = advance(zurielIntoCrossbow).state;
}
const zurielIntoCrossbowTicks = zurielIntoCrossbow.events
  .filter((event) => event.kind === "attack" && event.attackerId === "local-player")
  .map((event) => event.tick);
assert(
  JSON.stringify(zurielIntoCrossbowTicks) === JSON.stringify([0, 4, 9]),
  `Zuriel cast should permit a switched rapid crossbow at tick four, then the crossbow should own its normal five-tick cycle: ${JSON.stringify(zurielIntoCrossbowTicks)}`
);

let weaponSwitchClearsAutocast = createState(122, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes"
});
weaponSwitchClearsAutocast = runtimeCombat.setRuntimePlayerCombatAutocast(
  weaponSwitchClearsAutocast,
  "local-player",
  "ice-barrage",
  true
);
weaponSwitchClearsAutocast = requestLocalAttack(weaponSwitchClearsAutocast);
weaponSwitchClearsAutocast = advance(weaponSwitchClearsAutocast).state;
assert(
  weaponSwitchClearsAutocast.events.some(
    (event) => event.kind === "attack" && event.attackerId === "local-player" && event.spellId === "ice-barrage"
  ),
  "weapon-switch autocast regression setup should start with a real Ice Barrage autocast"
);
weaponSwitchClearsAutocast = runtimeCombat.syncRuntimePlayerCombatStateToInput(weaponSwitchClearsAutocast, {
  tiles: {
    "local-player": weaponSwitchClearsAutocast.actors["local-player"].tile,
    opponent: weaponSwitchClearsAutocast.actors.opponent.tile
  },
  equipment: {
    "local-player": nhLoadouts.nhLoadouts["acb-hides"].equipment
  }
});
assert(
  weaponSwitchClearsAutocast.actors["local-player"].autocastSpellId === null &&
    weaponSwitchClearsAutocast.actors["local-player"].defensiveCast === false,
  "weapon-slot equipment sync should clear stale autocast and defensive casting before the next cooldown opens"
);
for (let index = 0; index <= 5; index += 1) {
  weaponSwitchClearsAutocast = advance(weaponSwitchClearsAutocast).state;
}
const postSwitchMagicAttacks = weaponSwitchClearsAutocast.events.filter(
  (event) => event.kind === "attack" && event.attackerId === "local-player" && event.tick > 0 && event.spellId
);
assert(
  postSwitchMagicAttacks.length === 0,
  `switching away from an autocasting Kodai should not create another magic attack/XP-drop candidate: ${JSON.stringify(postSwitchMagicAttacks)}`
);
assert(
  weaponSwitchClearsAutocast.queuedHits.every((hit) => hit.attackerId !== "local-player" || !hit.spellId),
  `post-switch queued hit candidates should be weapon hits, not stale spell hits: ${JSON.stringify(weaponSwitchClearsAutocast.queuedHits)}`
);

let selectedSpellEquipReset = createState(123, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes"
});
selectedSpellEquipReset = advance(requestLocalSpell(selectedSpellEquipReset)).state;
selectedSpellEquipReset = requestLocalSpell(selectedSpellEquipReset);
assert(
  selectedSpellEquipReset.actors["local-player"].queuedSpellId === "ice-barrage",
  "selected spell regression setup should queue a second spell while the first cast cooldown is active"
);
selectedSpellEquipReset = runtimeCombat.resetRuntimePlayerCombatActorTarget(selectedSpellEquipReset, "local-player");
for (let index = 0; index <= 5; index += 1) {
  selectedSpellEquipReset = advance(selectedSpellEquipReset).state;
}
const selectedSpellPostEquipAttacks = selectedSpellEquipReset.events.filter(
  (event) => event.kind === "attack" && event.attackerId === "local-player" && event.tick > 0 && event.spellId
);
assert(
  selectedSpellPostEquipAttacks.length === 0,
  `Equipment.equip resetActions should clear a queued selected spell before the next cooldown opens: ${JSON.stringify(selectedSpellPostEquipAttacks)}`
);

let clientCycleAttack = createState(21, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes"
});
clientCycleAttack = requestLocalSpell(clientCycleAttack);
const clientCycleAttackResult = runtimeCombat.advanceRuntimePlayerCombat(clientCycleAttack, {
  tiles: {
    "local-player": clientCycleAttack.actors["local-player"].tile,
    opponent: clientCycleAttack.actors.opponent.tile
  },
  clientCycle: 345
});
assert(
  clientCycleAttackResult.state.actors["local-player"].actionStartedAtClientCycle === 345,
  "attack animation playback should start from the actual client cycle, not restart from a server-tick modulo"
);

let rangedAttack = createState(16, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides"
});
rangedAttack = requestLocalAttack(rangedAttack);
const rangedAttackResult = advance(rangedAttack);
const rangedAttackEvent = rangedAttackResult.state.events.find((event) => event.kind === "attack");
assertAttackAnimationWindow(rangedAttackResult, "local-player", "ACB ranged attack");
assert(rangedAttackEvent?.style === "ranged", "ACB loadout should dispatch a ranged attack style");
assert(rangedAttackEvent?.sequenceName === "crossbow_attack", "ACB ranged attack should play the crossbow sequence");
assert(rangedAttackEvent?.projectile?.id === "dragon_bolt", "ACB dragonstone-bolt loadout should emit the Nh dragon bolt projectile profile");
assert(rangedAttackEvent?.projectile?.gfxId === 1468, "ACB dragonstone-bolt loadout should use Projectile.DRAGON_BOLT gfx 1468");
assert(rangedAttackEvent?.hitDelayTicks === 2, "ACB bolt hit delay should match Nh default clientDelay for Projectile.BOLT");
assert(rangedAttackEvent?.projectileDurationCycles === 66, "ACB bolt duration should use source 51 + 5 cycles per extra tile");

let delayedPrayerDamageState = null;
let delayedPrayerQueuedHit = null;
for (let seed = 800; seed < 900; seed += 1) {
  let candidate = createState(seed, {
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 4, z: 0 },
    localLoadoutId: "acb-hides",
    opponentPrayers: []
  });
  candidate = requestLocalAttack(candidate);
  const candidateResult = advance(candidate);
  const hit = candidateResult.state.queuedHits.find((queuedHit) => queuedHit.attackerId === "local-player");
  if (hit && hit.damage > 0) {
    delayedPrayerDamageState = candidateResult.state;
    delayedPrayerQueuedHit = hit;
    break;
  }
}
assert(delayedPrayerDamageState && delayedPrayerQueuedHit, "delayed-prayer verifier should find a positive ranged queued hit");
const delayedPrayerXpDrops = runtimeCombat.runtimePlayerCombatXpDropsForDamage(
  delayedPrayerQueuedHit,
  runtimeCombat.runtimePlayerCombatQueuedHitDamage(delayedPrayerDamageState.actors, delayedPrayerQueuedHit, delayedPrayerDamageState.tick)
);
let delayedPrayerAfterDrop = runtimeCombat.setRuntimePlayerCombatPrayers(
  delayedPrayerDamageState,
  "opponent",
  ["protect_from_missiles"]
);
while (delayedPrayerAfterDrop.queuedHits.some((hit) => hit.id === delayedPrayerQueuedHit.id)) {
  delayedPrayerAfterDrop = advance(delayedPrayerAfterDrop).state;
}
const delayedPrayerHitsplat = delayedPrayerAfterDrop.events.find(
  (event) => event.kind === "hitsplat" && event.id === `${delayedPrayerQueuedHit.id}-hitsplat`
);
assert(
  delayedPrayerHitsplat?.damage === delayedPrayerQueuedHit.damage &&
    delayedPrayerQueuedHit.damage === delayedPrayerQueuedHit.rawDamage &&
    Math.round(delayedPrayerXpDrops.reduce((sum, drop) => sum + drop.xp, 0)) > 0,
  `post-attack prayer changes should not lower the already finalized XP-drop/HIT number or eventual hitsplat: ${JSON.stringify({
    queuedDamage: delayedPrayerQueuedHit.damage,
    queuedRawDamage: delayedPrayerQueuedHit.rawDamage,
    hitsplatDamage: delayedPrayerHitsplat?.damage,
    xpDrops: delayedPrayerXpDrops
  })}`
);

let protectedAtAttackState = null;
let protectedAtAttackQueuedHit = null;
for (let seed = 900; seed < 2000; seed += 1) {
  let candidate = createState(seed, {
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 4, z: 0 },
    localLoadoutId: "acb-hides",
    opponentPrayers: ["protect_from_missiles"]
  });
  candidate = requestLocalAttack(candidate);
  const candidateResult = advance(candidate);
  const hit = candidateResult.state.queuedHits.find((queuedHit) => queuedHit.attackerId === "local-player");
  if (hit && hit.rawDamage > hit.damage && hit.damage > 0) {
    protectedAtAttackState = candidateResult.state;
    protectedAtAttackQueuedHit = hit;
    break;
  }
}
assert(protectedAtAttackState && protectedAtAttackQueuedHit, "protected-at-attack verifier should find a protected positive ranged queued hit");
const protectedAtAttackDamageForDrop = runtimeCombat.runtimePlayerCombatQueuedHitDamage(
  protectedAtAttackState.actors,
  protectedAtAttackQueuedHit,
  protectedAtAttackState.tick
);
const protectedAtAttackXpDrops = runtimeCombat.runtimePlayerCombatXpDropsForDamage(
  protectedAtAttackQueuedHit,
  protectedAtAttackDamageForDrop
);
assert(
  protectedAtAttackDamageForDrop === protectedAtAttackQueuedHit.damage &&
    protectedAtAttackQueuedHit.damage < protectedAtAttackQueuedHit.rawDamage &&
    protectedAtAttackXpDrops.some((drop) => drop.skillId === "ranged" && Math.round(drop.xp) === protectedAtAttackQueuedHit.damage * 4),
  `XP/HIT drops should use prayer-finalized queued damage when protection was active on the attack tick: ${JSON.stringify({
    queuedDamage: protectedAtAttackQueuedHit.damage,
    queuedRawDamage: protectedAtAttackQueuedHit.rawDamage,
    damageForDrop: protectedAtAttackDamageForDrop,
    xpDrops: protectedAtAttackXpDrops
  })}`
);

const armadylCrossbowEquipment = {
  ...nhLoadouts.nhLoadouts["acb-hides"].equipment,
  weapon: { itemId: 11785, name: "Armadyl crossbow" }
};

let acbSpecialAttack = createState(22, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides"
});
acbSpecialAttack = stateWithLocalEquipment(acbSpecialAttack, armadylCrossbowEquipment);
const acbSpecialToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(acbSpecialAttack, "local-player");
assert(acbSpecialToggle.mutation === "activate", "ACB special click should activate PlayerCombat.toggleSpecial state");
acbSpecialAttack = requestLocalAttack(acbSpecialToggle.state);
const acbSpecialResult = advance(acbSpecialAttack);
const acbSpecialEvent = acbSpecialResult.state.events.find((event) => event.kind === "attack");
const expectedAcbSpecialHitChance = expectedRuntimeHitChance(acbSpecialToggle.state, "local-player", "opponent", "ranged", {
  attackRollMultiplier: 2
});
assertAttackAnimationWindow(acbSpecialResult, "local-player", "ACB special attack");
assert(acbSpecialEvent?.specialAttack === "armadyl_crossbow", "ACB special attack event should be tagged as Armadyl crossbow special");
assert(acbSpecialEvent?.projectile?.id === "armadyl_crossbow_special", "ACB special should use the Nh Armadyl Eye projectile profile");
assert(acbSpecialEvent?.projectile?.gfxId === 301, "ACB special projectile should use gfx 301 from ArmadylCrossbow.java");
assert(JSON.stringify(acbSpecialEvent?.soundIds) === JSON.stringify([2695]), `ACB special should emit the crossbow attack sound 2695: ${JSON.stringify(acbSpecialEvent)}`);
assert(acbSpecialEvent?.hitDelayTicks === 2, "ACB special should keep the source projectile client-delay timing");
assert(
  nearlyEqual(acbSpecialEvent?.hitChance ?? -1, expectedAcbSpecialHitChance),
  `ACB special should double the ranged attack roll, not the final hit chance: ${JSON.stringify({
    event: acbSpecialEvent,
    expectedAcbSpecialHitChance
  })}`
);
assert(acbSpecialResult.state.actors["local-player"].gmaul.specialEnergy === 50, "ACB special should drain 50 percent special energy");
assert(acbSpecialResult.state.actors["local-player"].specialActive === false, "ACB special should clear Config.SPECIAL_ACTIVE after use");
const acbDoubledBolt = findAcbSpecialDoubledBoltProc();
assert(
  acbDoubledBolt.normalHit?.boltEffect === undefined &&
    acbDoubledBolt.specialHit?.weaponId === "armadyl_crossbow" &&
    acbDoubledBolt.specialHit?.boltEffect?.id === "diamond" &&
    acbDoubledBolt.state.actors["local-player"].gmaul.specialEnergy === 50,
  `ACB special should double enchanted bolt proc chance while preserving 50 percent drain: ${JSON.stringify(acbDoubledBolt)}`
);

let specialRegen = createState(701, {
  localSpecialEnergy: 60
});
for (let index = 0; index < 49; index += 1) {
  specialRegen = advance(specialRegen).state;
}
assert(
  specialRegen.actors["local-player"].gmaul.specialEnergy === 60 &&
    specialRegen.actors["local-player"].specialRestoreTicks === 49,
  `special energy should not restore before Nh' 50 tick threshold: ${JSON.stringify(specialRegen.actors["local-player"])}`
);
specialRegen = advance(specialRegen).state;
assert(
  specialRegen.actors["local-player"].gmaul.specialEnergy === 70 &&
    specialRegen.actors["local-player"].specialRestoreTicks === 0,
  `special energy should restore 10 percent on the 50th post-attack player tick: ${JSON.stringify(specialRegen.actors["local-player"])}`
);

let acbSpecialRestoreBoundary = createState(702, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  localSpecialEnergy: 50
});
acbSpecialRestoreBoundary = stateWithLocalEquipment(acbSpecialRestoreBoundary, armadylCrossbowEquipment);
acbSpecialRestoreBoundary = {
  ...acbSpecialRestoreBoundary,
  actors: {
    ...acbSpecialRestoreBoundary.actors,
    "local-player": {
      ...acbSpecialRestoreBoundary.actors["local-player"],
      specialRestoreTicks: 49
    }
  }
};
acbSpecialRestoreBoundary = requestLocalAttack(
  runtimeCombat.toggleRuntimePlayerCombatSpecial(acbSpecialRestoreBoundary, "local-player").state
);
const acbSpecialRestoreBoundaryResult = advance(acbSpecialRestoreBoundary);
assert(
  acbSpecialRestoreBoundaryResult.state.events.some(
    (event) => event.kind === "attack" && event.specialAttack === "armadyl_crossbow"
  ),
  "ACB restore-boundary setup should fire the special before the same tick's special regen"
);
assert(
  acbSpecialRestoreBoundaryResult.state.actors["local-player"].gmaul.specialEnergy === 10 &&
    acbSpecialRestoreBoundaryResult.state.actors["local-player"].specialRestoreTicks === 0,
  `ACB special should drain 50 first, then post-attack regen should add 10 percent on the same 50th tick: ${JSON.stringify(
    acbSpecialRestoreBoundaryResult.state.actors["local-player"]
  )}`
);

let lowEnergyAcbSpecial = createState(23, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  localSpecialEnergy: 30
});
lowEnergyAcbSpecial = stateWithLocalEquipment(lowEnergyAcbSpecial, armadylCrossbowEquipment);
lowEnergyAcbSpecial = runtimeCombat.toggleRuntimePlayerCombatSpecial(lowEnergyAcbSpecial, "local-player").state;
lowEnergyAcbSpecial = requestLocalAttack(lowEnergyAcbSpecial);
const lowEnergyAcbResult = advance(lowEnergyAcbSpecial);
const lowEnergyAcbEvent = lowEnergyAcbResult.state.events.find((event) => event.kind === "attack");
assert(lowEnergyAcbEvent?.specialAttack === undefined, "low-energy ACB should fall back to a normal attack instead of firing the special");
assert(lowEnergyAcbEvent?.projectile?.id === "dragon_bolt", "low-energy ACB fallback should keep the normal dragon-bolt projectile");
assert(JSON.stringify(lowEnergyAcbEvent?.soundIds) === JSON.stringify([2695]), `normal crossbow attack should emit source attack sound 2695: ${JSON.stringify(lowEnergyAcbEvent)}`);
assert(lowEnergyAcbResult.state.actors["local-player"].gmaul.specialEnergy === 30, "low-energy ACB fallback should not drain special energy");
assert(lowEnergyAcbResult.state.actors["local-player"].specialActive === false, "low-energy ACB fallback should clear active special state");

const diamondBoltProcState = findLocalBoltProc(21946, "Diamond dragon bolts (e)", "diamond");
const diamondBoltHit = diamondBoltProcState.queuedHits.find((hit) => hit.attackerId === "local-player");
assert(
  diamondBoltHit?.boltEffect?.chancePercent === 5 &&
    diamondBoltHit.boltEffect.damageMultiplier === 1.15 &&
    diamondBoltHit.boltEffect.guaranteedHit === true,
  `Diamond dragon bolt proc should carry source player chance, damage boost, and ignore-defence semantics: ${JSON.stringify(diamondBoltHit)}`
);
const diamondBoltResolvedState = resolveForcedLocalQueuedHit(diamondBoltProcState);
const diamondBoltHitsplat = diamondBoltResolvedState.events.find((event) => event.kind === "hitsplat" && event.boltEffect?.id === "diamond");
const diamondBoltSpotanim = diamondBoltResolvedState.events.find((event) => event.kind === "spotanim" && event.spotanimId === 758);
assert(JSON.stringify(diamondBoltHitsplat?.soundIds) === JSON.stringify([2910]), `Diamond bolt proc should emit configured proc sound 2910: ${JSON.stringify(diamondBoltHitsplat)}`);
assert(diamondBoltSpotanim?.artifactUrl === "render/spotanims/diamond_bolt_proc.glb", `Diamond bolt proc should emit gfx 758 artifact: ${JSON.stringify(diamondBoltSpotanim)}`);

const dragonstoneBoltProcState = findLocalBoltProc(21948, "Dragonstone dragon bolts (e)", "dragonstone");
const dragonstoneBoltHit = dragonstoneBoltProcState.queuedHits.find((hit) => hit.attackerId === "local-player");
assert(
  dragonstoneBoltHit?.boltEffect?.chancePercent === 6 &&
    dragonstoneBoltHit.boltEffect.damageMultiplier === 1.45,
  `Dragonstone dragon bolt proc should carry source 6 percent chance and 45 percent boost: ${JSON.stringify(dragonstoneBoltHit)}`
);
const dragonstoneBoltResolvedState = resolveForcedLocalQueuedHit(dragonstoneBoltProcState);
const dragonstoneBoltHitsplat = dragonstoneBoltResolvedState.events.find((event) => event.kind === "hitsplat" && event.boltEffect?.id === "dragonstone");
const dragonstoneBoltSpotanim = dragonstoneBoltResolvedState.events.find((event) => event.kind === "spotanim" && event.spotanimId === 756);
assert(dragonstoneBoltHitsplat?.soundIds === undefined, `Dragonstone bolt proc should not invent a sound absent from the source behavior: ${JSON.stringify(dragonstoneBoltHitsplat)}`);
assert(dragonstoneBoltSpotanim?.artifactUrl === "render/spotanims/dragonstone_bolt_proc.glb", `Dragonstone bolt proc should emit gfx 756 artifact: ${JSON.stringify(dragonstoneBoltSpotanim)}`);

const onyxBoltProcState = findLocalBoltProc(21950, "Onyx dragon bolts (e)", "onyx");
const onyxBoltHit = onyxBoltProcState.queuedHits.find((hit) => hit.attackerId === "local-player");
assert(
  onyxBoltHit?.boltEffect?.chancePercent === 10 &&
    onyxBoltHit.boltEffect.damageMultiplier === 1.2 &&
    onyxBoltHit.boltEffect.healFraction === 0.25,
  `Onyx dragon bolt proc should carry source player chance, 20 percent boost, and 25 percent heal: ${JSON.stringify(onyxBoltHit)}`
);
const onyxBoltResolvedState = resolveForcedLocalQueuedHit(onyxBoltProcState);
const onyxBoltHitsplat = onyxBoltResolvedState.events.find((event) => event.kind === "hitsplat" && event.boltEffect?.id === "onyx");
const onyxBoltSpotanim = onyxBoltResolvedState.events.find((event) => event.kind === "spotanim" && event.spotanimId === 753);
assert(JSON.stringify(onyxBoltHitsplat?.soundIds) === JSON.stringify([2917]), `Onyx bolt proc should emit configured proc sound 2917: ${JSON.stringify(onyxBoltHitsplat)}`);
assert(onyxBoltSpotanim?.artifactUrl === "render/spotanims/onyx_bolt_proc.glb", `Onyx bolt proc should emit gfx 753 artifact: ${JSON.stringify(onyxBoltSpotanim)}`);
assert(
  onyxBoltResolvedState.actors["local-player"].hitpoints === 55,
  `Onyx bolt proc should heal the attacker for damage * 0.25 after a forced 20 hit: ${JSON.stringify(onyxBoltResolvedState.actors["local-player"])}`
);

const dragonCrossbowEquipment = {
  ...nhLoadouts.nhLoadouts["acb-hides"].equipment,
  weapon: { itemId: 21902, name: "Dragon crossbow" }
};
const dragonCrossbowNoSpecialState = runtimeCombat.syncRuntimePlayerCombatStateToInput(createState(703, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  localSpecialEnergy: 100
}), {
  tiles: {
    "local-player": { x: 0, z: 0 },
    opponent: { x: 4, z: 0 }
  },
  equipment: {
    "local-player": dragonCrossbowEquipment
  }
});
const dragonCrossbowNoSpecialToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(dragonCrossbowNoSpecialState, "local-player");
assert(
  dragonCrossbowNoSpecialToggle.mutation === "noop-no-special" &&
    dragonCrossbowNoSpecialToggle.state.actors["local-player"].specialActive === false,
  `Dragon crossbow should expose the client spec bar for one-ticking but still have no server special: ${JSON.stringify(dragonCrossbowNoSpecialToggle)}`
);
let dragonCrossbowIntoAgsOneTick = runtimeCombat.syncRuntimePlayerCombatStateToInput(createState(704, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  localSpecialEnergy: 100
}), {
  tiles: {
    "local-player": { x: 0, z: 0 },
    opponent: { x: 1, z: 0 }
  },
  equipment: {
    "local-player": dragonCrossbowEquipment
  }
});
dragonCrossbowIntoAgsOneTick = runtimeCombat.syncRuntimePlayerCombatStateToInput(dragonCrossbowIntoAgsOneTick, {
  tiles: {
    "local-player": { x: 0, z: 0 },
    opponent: { x: 1, z: 0 }
  },
  loadouts: {
    "local-player": "ags-bandos"
  },
  equipment: {
    "local-player": nhLoadouts.nhLoadouts["ags-bandos"].equipment
  }
});
const dragonCrossbowIntoAgsToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(dragonCrossbowIntoAgsOneTick, "local-player");
assert(
  dragonCrossbowIntoAgsToggle.mutation === "activate" &&
    dragonCrossbowIntoAgsOneTick.actors["local-player"].weaponSwitchTick === dragonCrossbowIntoAgsOneTick.tick,
  "queued DCB-bar spec packet should activate once the same-tick AGS equip is processed first and record the weapon-switch signal tick"
);
const dragonCrossbowIntoAgsResult = advance(requestLocalAttack(dragonCrossbowIntoAgsToggle.state));
const dragonCrossbowIntoAgsEvent = dragonCrossbowIntoAgsResult.state.events.find((event) => event.kind === "attack");
assert(
  dragonCrossbowIntoAgsEvent?.specialAttack === "armadyl_godsword" &&
    JSON.stringify(dragonCrossbowIntoAgsEvent.soundIds) === JSON.stringify([3869]) &&
    dragonCrossbowIntoAgsResult.state.actors["local-player"].gmaul.specialEnergy === 50,
  `Dragon crossbow visible spec bar should support AGS one-tick packet order without giving DCB a special: ${JSON.stringify(dragonCrossbowIntoAgsEvent)}`
);
const agsBaseEstimate = runtimeCombat.runtimePlayerCombatDamageEstimate(
  dragonCrossbowIntoAgsToggle.state.actors["local-player"],
  dragonCrossbowIntoAgsToggle.state.actors.opponent,
  "slash"
);
const expectedAgsHitChance = expectedRuntimeHitChance(dragonCrossbowIntoAgsToggle.state, "local-player", "opponent", "slash", {
  attackRollMultiplier: 2
});
assert(
  dragonCrossbowIntoAgsEvent?.maxDamage === Math.trunc(agsBaseEstimate.maxDamage * 1.375) &&
    nearlyEqual(dragonCrossbowIntoAgsEvent.hitChance, expectedAgsHitChance),
  `AGS special should use 50 percent energy, 37.5 percent damage boost, and doubled attack roll: ${JSON.stringify({
    event: dragonCrossbowIntoAgsEvent,
    baseMaxDamage: agsBaseEstimate.maxDamage,
    expectedAgsHitChance
  })}`
);
const voidwakerEquipment = {
  ...nhLoadouts.nhLoadouts["tentacle-bandos"].equipment,
  weapon: { itemId: 27690, name: "Voidwaker" }
};
let voidwakerSpecial = runtimeCombat.syncRuntimePlayerCombatStateToInput(createState(705, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "tentacle-bandos",
  localSpecialEnergy: 100
}), {
  tiles: {
    "local-player": { x: 0, z: 0 },
    opponent: { x: 1, z: 0 }
  },
  equipment: {
    "local-player": voidwakerEquipment
  }
});
const ordinaryVoidwakerResult = advance(requestLocalAttack(voidwakerSpecial));
const ordinaryVoidwakerEvent = ordinaryVoidwakerResult.state.events.find((event) => event.kind === "attack");
assert(
  ordinaryVoidwakerEvent !== undefined &&
    ["stab", "slash", "crush"].includes(ordinaryVoidwakerEvent.style) &&
    ordinaryVoidwakerEvent.specialAttack === undefined,
  `ordinary Voidwaker attacks should remain base melee hits: ${JSON.stringify(ordinaryVoidwakerEvent)}`
);
const voidwakerSpecialToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(voidwakerSpecial, "local-player");
assert(
  voidwakerSpecialToggle.mutation === "activate" &&
    voidwakerSpecialToggle.state.actors["local-player"].voidwakerSpecsUsed === 1 &&
    voidwakerSpecialToggle.state.actors["local-player"].lastSpecKind === "voidwaker" &&
    voidwakerSpecialToggle.state.actors["local-player"].lastSpecTick === voidwakerSpecialToggle.state.tick,
  "Voidwaker activation should record accepted non-Gmaul spec history immediately, before attack launch"
);
voidwakerSpecial = requestLocalAttack(voidwakerSpecialToggle.state);
const voidwakerSpecialResult = advance(voidwakerSpecial);
const voidwakerSpecialEvent = voidwakerSpecialResult.state.events.find((event) => event.kind === "attack");
const voidwakerQueuedHit = voidwakerSpecialResult.state.queuedHits.find((hit) => hit.attackerId === "local-player");
const voidwakerBaseEstimate = runtimeCombat.runtimePlayerCombatDamageEstimate(
  voidwakerSpecialToggle.state.actors["local-player"],
  voidwakerSpecialToggle.state.actors.opponent,
  "slash"
);
assert(
  voidwakerSpecialEvent?.specialAttack === "voidwaker" &&
    voidwakerSpecialEvent?.sequenceName === "voidwaker_special" &&
    JSON.stringify(voidwakerSpecialEvent.soundIds) === JSON.stringify([5027, 6182]),
  `Voidwaker special should emit its special sequence and both configured special sounds: ${JSON.stringify(voidwakerSpecialEvent)}`
);
assert(
  voidwakerSpecialEvent?.style === "magic" &&
    voidwakerQueuedHit?.style === "magic" &&
    voidwakerQueuedHit.hitChance === 1 &&
    voidwakerQueuedHit.maxDamage === Math.trunc(voidwakerBaseEstimate.maxDamage * 1.5) &&
    voidwakerQueuedHit.rawDamage >= Math.trunc(voidwakerBaseEstimate.maxDamage * 0.5),
  `Voidwaker special should be guaranteed magic damage rolled from 50 to 150 percent melee max: ${JSON.stringify({
    event: voidwakerSpecialEvent,
    queuedHit: voidwakerQueuedHit,
    baseMaxDamage: voidwakerBaseEstimate.maxDamage
  })}`
);
assert(
  voidwakerSpecialResult.state.actors["local-player"].voidwakerSpecsUsed === 1 &&
    voidwakerSpecialResult.state.actors["local-player"].attackStyleSignalTick === voidwakerSpecialEvent.tick,
  "Voidwaker launch should preserve the activation-time history count and record the current attack-style signal tick"
);

const forcedOffTickVoidwakerPolicyController = {
  id: "test-policy-off-tick-voidwaker",
  chooseAction: () => ({
    offenceStyle: "melee",
    defencePrayer: "protect_from_melee",
    movementIntent: "none",
    supplyIntent: "none",
    specIntent: "spec_voidwaker",
    extendedSupplyAction: false,
    attackIntent: "off_tick"
  })
};
let offTickVoidwakerState = runtimeCombat.syncRuntimePlayerCombatStateToInput(createState(1705, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  opponentLoadoutId: "tentacle-bandos",
  opponentSpecialEnergy: 100
}), {
  tiles: {
    "local-player": { x: 0, z: 0 },
    opponent: { x: 1, z: 0 }
  },
  equipment: {
    opponent: voidwakerEquipment
  }
});
offTickVoidwakerState = {
  ...offTickVoidwakerState,
  actors: {
    ...offTickVoidwakerState.actors,
    opponent: {
      ...offTickVoidwakerState.actors.opponent,
      attackTimer: {
        lastAttackTick: -4,
        weaponCooldownTicks: 4,
        additiveAttackDelayTicks: 0
      }
    }
  }
};
const offTickVoidwakerApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: offTickVoidwakerState,
  controller: forcedOffTickVoidwakerPolicyController,
  localActor: {
    tile: offTickVoidwakerState.actors["local-player"].tile,
    loadoutId: offTickVoidwakerState.actors["local-player"].loadoutId,
    equipment: offTickVoidwakerState.actors["local-player"].equipment
  },
  opponentActor: {
    tile: offTickVoidwakerState.actors.opponent.tile,
    loadoutId: offTickVoidwakerState.actors.opponent.loadoutId,
    equipment: offTickVoidwakerState.actors.opponent.equipment
  }
});
const offTickVoidwakerDeferred = advance(offTickVoidwakerApplied.state);
assert(
  offTickVoidwakerApplied.effectiveAction.specIntent === "spec_voidwaker" &&
    offTickVoidwakerApplied.state.actors.opponent.voidwakerSpecsUsed === 1 &&
    offTickVoidwakerApplied.state.actors.opponent.lastSpecKind === "voidwaker" &&
    offTickVoidwakerApplied.state.actors.opponent.lastSpecTick === offTickVoidwakerApplied.state.tick &&
    !offTickVoidwakerDeferred.state.events.some(
      (event) => event.kind === "attack" && event.attackerId === "opponent" && event.tick === offTickVoidwakerApplied.state.tick
    ),
  `accepted off-tick Voidwaker intent should record history before its deferred launch: ${JSON.stringify({
    action: offTickVoidwakerApplied.effectiveAction,
    actor: offTickVoidwakerApplied.state.actors.opponent,
    events: offTickVoidwakerDeferred.state.events
  })}`
);

const forcedMeleeProtectionPolicyController = {
  id: "test-policy-voidwaker-visible-threat",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_melee",
    movementIntent: "none",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false,
    attackIntent: "hold"
  })
};
function applyVisibleVoidwakerThreat(specialEnergy, distance) {
  let state = runtimeCombat.syncRuntimePlayerCombatStateToInput(createState(1710 + specialEnergy + distance, {
    localTile: { x: 0, z: 0 },
    opponentTile: { x: distance, z: 0 },
    localLoadoutId: "tentacle-bandos",
    opponentLoadoutId: "acb-hides",
    localSpecialEnergy: specialEnergy
  }), {
    tiles: {
      "local-player": { x: 0, z: 0 },
      opponent: { x: distance, z: 0 }
    },
    equipment: {
      "local-player": voidwakerEquipment
    }
  });
  return runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
    state,
    controller: forcedMeleeProtectionPolicyController,
    localActor: {
      tile: state.actors["local-player"].tile,
      loadoutId: state.actors["local-player"].loadoutId,
      equipment: state.actors["local-player"].equipment
    },
    opponentActor: {
      tile: state.actors.opponent.tile,
      loadoutId: state.actors.opponent.loadoutId,
      equipment: state.actors.opponent.equipment
    }
  });
}
const ordinaryVoidwakerThreat = applyVisibleVoidwakerThreat(25, 1);
const unreachableVoidwakerSpecThreat = applyVisibleVoidwakerThreat(100, 4);
const credibleVoidwakerSpecThreat = applyVisibleVoidwakerThreat(100, 1);
const unreachableVoidwakerInput = nhPolicyFeatures.encodeNhPolicyInput(unreachableVoidwakerSpecThreat.context);
const credibleVoidwakerInput = nhPolicyFeatures.encodeNhPolicyInput(credibleVoidwakerSpecThreat.context);
assert(
  ordinaryVoidwakerThreat.context.opponent.lastVisibleOpponentStyle === "melee" &&
    unreachableVoidwakerSpecThreat.context.opponent.lastVisibleOpponentStyle === "melee" &&
    credibleVoidwakerSpecThreat.context.opponent.lastVisibleOpponentStyle === "melee" &&
    unreachableVoidwakerSpecThreat.context.opponent.lastOffenceStyle === "melee" &&
    credibleVoidwakerSpecThreat.context.opponent.lastOffenceStyle === "magic" &&
    JSON.stringify(unreachableVoidwakerInput.slice(43, 46)) === JSON.stringify([0, 0, 1]) &&
    JSON.stringify(credibleVoidwakerInput.slice(43, 46)) === JSON.stringify([1, 0, 0]) &&
    !runtimePolicyOpponentSource.includes("27690 // VOIDWAKER spec threat") &&
    runtimePolicyOpponentSource.includes('context.opponent.weaponId === "voidwaker"') &&
    runtimePolicyOpponentSource.includes("canMeleeStepInReachNextTick({"),
  `ordinary visible Voidwaker should stay Melee; only an eligible reachable spec threat should promote raw114 likely style to Magic: ${JSON.stringify({
    ordinaryStyle: ordinaryVoidwakerThreat.context.opponent.lastVisibleOpponentStyle,
    unreachableLikely: unreachableVoidwakerSpecThreat.context.opponent.lastOffenceStyle,
    unreachableRawLikely: unreachableVoidwakerInput.slice(43, 46),
    credibleLikely: credibleVoidwakerSpecThreat.context.opponent.lastOffenceStyle,
    credibleRawLikely: credibleVoidwakerInput.slice(43, 46)
  })}`
);
const vestaEquipment = {
  ...nhLoadouts.nhLoadouts["tentacle-bandos"].equipment,
  weapon: { itemId: 22613, name: "Vesta's longsword (Deadman Mode)" }
};
let vestaSpecial = runtimeCombat.syncRuntimePlayerCombatStateToInput(createState(706, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "tentacle-bandos",
  localSpecialEnergy: 100
}), {
  tiles: {
    "local-player": { x: 0, z: 0 },
    opponent: { x: 1, z: 0 }
  },
  equipment: {
    "local-player": vestaEquipment
  }
});
const vestaSpecialToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(vestaSpecial, "local-player");
assert(vestaSpecialToggle.mutation === "activate", "Vesta's longsword visible equipment should expose a server special");
vestaSpecial = requestLocalAttack(vestaSpecialToggle.state);
const vestaSpecialResult = advance(vestaSpecial);
const vestaSpecialEvent = vestaSpecialResult.state.events.find((event) => event.kind === "attack");
const vestaQueuedHit = vestaSpecialResult.state.queuedHits.find((hit) => hit.attackerId === "local-player");
const vestaBaseEstimate = runtimeCombat.runtimePlayerCombatDamageEstimate(
  vestaSpecialToggle.state.actors["local-player"],
  vestaSpecialToggle.state.actors.opponent,
  "slash"
);
const expectedVestaHitChance = expectedRuntimeHitChance(vestaSpecialToggle.state, "local-player", "opponent", "slash", {
  defenceStyle: "stab",
  defenceRollMultiplier: 0.25
});
assert(
  vestaSpecialEvent?.specialAttack === "vesta_longsword" &&
    vestaSpecialEvent?.sequenceName === "vesta_longsword_special" &&
    JSON.stringify(vestaSpecialEvent.soundIds) === JSON.stringify([2500]),
  `VLS special should emit the VLS sequence and the weapon attack sound fallback because Kronos source has no explicit publicSound: ${JSON.stringify(vestaSpecialEvent)}`
);
assert(
  vestaQueuedHit?.weaponId === "vesta_longsword" &&
    vestaQueuedHit.maxDamage === Math.trunc(vestaBaseEstimate.maxDamage * 1.2) &&
    nearlyEqual(vestaQueuedHit.hitChance, expectedVestaHitChance) &&
    vestaSpecialResult.state.actors["local-player"].gmaul.specialEnergy === 75,
  `VLS special should use 25 percent energy, 20-120 percent damage, and attack accuracy against 25 percent stab defence: ${JSON.stringify({
    queuedHit: vestaQueuedHit,
    baseMaxDamage: vestaBaseEstimate.maxDamage,
    expectedVestaHitChance
  })}`
);
const zaryteForcedBolt = findSuccessfulZaryteSpecialBoltProc();
const expectedZaryteHitChance = expectedRuntimeHitChance(zaryteForcedBolt.state, "local-player", "opponent", "ranged", {
  attackRollMultiplier: 2
});
assert(
  zaryteForcedBolt.queuedHit.weaponId === "zaryte_crossbow" &&
    zaryteForcedBolt.queuedHit.boltEffect?.id === "diamond" &&
    zaryteForcedBolt.queuedHit.hitChance < 1 &&
    nearlyEqual(zaryteForcedBolt.queuedHit.hitChance, expectedZaryteHitChance) &&
    zaryteForcedBolt.state.actors["local-player"].gmaul.specialEnergy === 25,
  `Zaryte crossbow special should double accuracy, drain 75 percent, and force the equipped bolt effect only after a successful hit: ${JSON.stringify({
    queuedHit: zaryteForcedBolt.queuedHit,
    expectedZaryteHitChance
  })}`
);
assert(
  hudSource.includes("combatTabVisibleSpecBarWithoutServerSpecialItemIds") &&
    hudSource.includes("weaponHasCombatTabSpecialBar") &&
    viewerSource.includes("queueCombatSpecialAfterPendingItemPackets"),
  "HUD and packet queue should preserve Dragon crossbow combat-tab spec bar one-tick ordering."
);

let gmaulAttack = createState(14, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
gmaulAttack = requestLocalAttack(gmaulAttack);
const gmaulAttackResult = advance(gmaulAttack);
const gmaulAttackEvent = gmaulAttackResult.state.events.find((event) => event.kind === "attack");
assert(gmaulAttackEvent?.sequenceName === "gmaul_attack", "regular Granite maul attack should use WeaponType.attackAnimation 1665, not the special animation");
assert(JSON.stringify(gmaulAttackEvent?.soundIds) === JSON.stringify([2714]), `regular Granite maul attacks should emit source attack sound 2714: ${JSON.stringify(gmaulAttackEvent)}`);
assert(
  !gmaulAttackResult.state.events.some((event) => event.kind === "spotanim" && event.spotanimId === 340),
  "regular Granite maul attacks should not emit the special-only source gfx 340"
);

let noxiousAttack = createState(15, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 2, z: 0 },
  localLoadoutId: "noxious-halberd"
});
noxiousAttack = requestLocalAttack(noxiousAttack);
const noxiousAttackResult = advance(noxiousAttack);
const noxiousAttackEvent = noxiousAttackResult.state.events.find((event) => event.kind === "attack");
assert(noxiousAttackEvent?.sequenceName === "halberd_attack", "Noxious halberd attack should use HALBERD animation 440");

function graniteMaulHitRollCount(result) {
  return (
    result.state.queuedHits.filter((hit) => hit.weaponId === "granite_maul").length +
    result.state.events.filter((event) => event.kind === "hitsplat" && `${event.id}`.includes("granite-maul-spec")).length
  );
}

let gmaulSpecial = createState(24, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
const gmaulSpecialToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(gmaulSpecial, "local-player");
assert(gmaulSpecialToggle.mutation === "queue-gmaul", "first Granite maul special click should queue a spec and mark the special bar active");
assert(gmaulSpecialToggle.queuedGraniteMaulSpecs === 1, "first Granite maul click should queue one pending special");
gmaulSpecial = requestLocalAttack(gmaulSpecialToggle.state);
const gmaulSpecialResult = advance(gmaulSpecial);
const gmaulSpecialEvent = gmaulSpecialResult.state.events.find((event) => event.kind === "attack");
assertAttackAnimationWindow(gmaulSpecialResult, "local-player", "Granite maul special attack");
assert(gmaulSpecialEvent?.specialAttack === "granite_maul", "Granite maul queued special should emit a special attack event");
assert(gmaulSpecialEvent?.sequenceName === "gmaul_special", "Granite maul queued special should use GraniteMaul.handle animation 1667");
assert(JSON.stringify(gmaulSpecialEvent?.soundIds) === JSON.stringify([2715]), `Granite maul special should emit source special sound 2715: ${JSON.stringify(gmaulSpecialEvent)}`);
assert(gmaulSpecialResult.state.events.some((event) => event.kind === "spotanim" && event.spotanimId === 340), "Granite maul special should emit source gfx 340");
assert(graniteMaulHitRollCount(gmaulSpecialResult) === 1, "single Granite maul queued spec should create one immediate hit roll");
assert(gmaulSpecialResult.state.actors["local-player"].gmaul.specialEnergy === 50, "Granite maul special should drain 50 percent energy");
assert(gmaulSpecialResult.state.actors["local-player"].specialActive === false, "Granite maul special should clear active special state after use");

let offWeaponGmaul = createState(241, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "tentacle-bandos"
});
offWeaponGmaul = requestLocalAttack(offWeaponGmaul);
const offWeaponWhipResult = advance(offWeaponGmaul);
assert(
  offWeaponWhipResult.state.events.some((event) => event.kind === "attack" && event.sequenceName === "whip_attack"),
  "off-weapon Granite maul verifier should start from a non-maul weapon attack"
);
offWeaponGmaul = runtimeCombat.setRuntimePlayerCombatLoadout(offWeaponWhipResult.state, "local-player", "gmaul-bandos");
offWeaponGmaul = runtimeCombat.resetRuntimePlayerCombatActorTarget(offWeaponGmaul, "local-player");
const offWeaponGmaulToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(offWeaponGmaul, "local-player");
assert(offWeaponGmaulToggle.mutation === "queue-gmaul", "switching to Granite maul after another weapon attack should allow queueing the maul special");
const offWeaponGmaulResult = advance(offWeaponGmaulToggle.state);
const offWeaponGmaulEvent = offWeaponGmaulResult.state.events.find((event) => event.kind === "attack" && event.specialAttack === "granite_maul");
assert(offWeaponGmaulEvent?.sequenceName === "gmaul_special", "queued Granite maul special should fire during the previous weapon delay after switching to the maul");
assert(graniteMaulHitRollCount(offWeaponGmaulResult) === 1, "off-weapon Granite maul queue should produce one immediate special hit roll");
assert(offWeaponGmaulResult.state.actors["local-player"].gmaul.specialEnergy === 50, "off-weapon Granite maul special should drain the same 50 percent energy");

let noSpecWeaponToGmaul = createState(242, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "kodai-robes"
});
noSpecWeaponToGmaul = runtimeCombat.setRuntimePlayerCombatLoadout(noSpecWeaponToGmaul, "local-player", "gmaul-bandos");
const noSpecWeaponToGmaulToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(noSpecWeaponToGmaul, "local-player");
assert(
  noSpecWeaponToGmaulToggle.mutation === "queue-gmaul" &&
    noSpecWeaponToGmaulToggle.queuedGraniteMaulSpecs === 1,
  "server-side Granite maul special action should queue from the current weapon and not reject on the trainer's client-side specbar visibility timer"
);

let diagonalLastTargetGmaul = createState(243, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 1 },
  localLoadoutId: "gmaul-bandos"
});
const diagonalLastTargetToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(diagonalLastTargetGmaul, "local-player");
diagonalLastTargetGmaul = requestLocalAttack(diagonalLastTargetToggle.state);
diagonalLastTargetGmaul = runtimeCombat.resetRuntimePlayerCombatActorTarget(diagonalLastTargetGmaul, "local-player");
const diagonalLastTargetResult = advance(diagonalLastTargetGmaul);
assert(
  diagonalLastTargetResult.state.actors["local-player"].targetId === null &&
    diagonalLastTargetResult.state.queuedHits.length === 0,
  "Granite maul auto-attack should not retarget a diagonal last target; Nh only auto-targets size-1 players at diffX + diffY == 1"
);

let cardinalLastTargetGmaul = createState(244, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
const cardinalLastTargetToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(cardinalLastTargetGmaul, "local-player");
cardinalLastTargetGmaul = requestLocalAttack(cardinalLastTargetToggle.state);
cardinalLastTargetGmaul = runtimeCombat.resetRuntimePlayerCombatActorTarget(cardinalLastTargetGmaul, "local-player");
const cardinalLastTargetResult = advance(cardinalLastTargetGmaul);
assert(
  cardinalLastTargetResult.state.actors["local-player"].targetId === "opponent" &&
    graniteMaulHitRollCount(cardinalLastTargetResult) === 1,
  "Granite maul auto-attack should retarget and fire only when the last target is cardinal-adjacent like Nh"
);

let outOfRangeDoubleGmaul = createState(245, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
const outOfRangeFirstGmaulClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(outOfRangeDoubleGmaul, "local-player");
const outOfRangeSecondGmaulClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(outOfRangeFirstGmaulClick.state, "local-player");
outOfRangeDoubleGmaul = requestLocalAttack(outOfRangeSecondGmaulClick.state);
const outOfRangeDoubleGmaulRoute = advance(outOfRangeDoubleGmaul);
assert(
  outOfRangeDoubleGmaulRoute.state.actors["local-player"].gmaul.queuedSpecs === 2 &&
    outOfRangeDoubleGmaulRoute.state.queuedHits.length === 0 &&
    outOfRangeDoubleGmaulRoute.routeRequests.some(
      (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 1
    ),
  "out-of-range double Granite maul preload should keep both queued specs and request melee TargetRoute movement"
);
const outOfRangeDoubleGmaulFire = advance(outOfRangeDoubleGmaulRoute.state, {
  local: { x: 3, z: 0 },
  opponent: { x: 4, z: 0 }
});
assert(
  graniteMaulHitRollCount(outOfRangeDoubleGmaulFire) === 2 &&
    outOfRangeDoubleGmaulFire.state.actors["local-player"].gmaul.specialEnergy === 0,
  "out-of-range double Granite maul preload should fire both queued specs after TargetRoute reaches melee distance"
);

let preloadedGmaulNeedsTargetClick = createState(246, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
preloadedGmaulNeedsTargetClick = requestLocalAttack(preloadedGmaulNeedsTargetClick);
preloadedGmaulNeedsTargetClick = runtimeCombat.resetRuntimePlayerCombatActorTarget(preloadedGmaulNeedsTargetClick, "local-player");
const preloadedNeedsTargetFirstClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(preloadedGmaulNeedsTargetClick, "local-player");
const preloadedNeedsTargetSecondClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(preloadedNeedsTargetFirstClick.state, "local-player");
const preloadedNeedsTargetIdle = advance(preloadedNeedsTargetSecondClick.state);
assert(
  preloadedNeedsTargetIdle.state.actors["local-player"].targetId === null &&
    preloadedNeedsTargetIdle.state.actors["local-player"].gmaul.queuedSpecs === 2 &&
    preloadedNeedsTargetIdle.state.queuedHits.length === 0 &&
    preloadedNeedsTargetIdle.routeRequests.length === 0,
  "far last-target double Granite maul preload should not auto-run without a new player click"
);
const preloadedNeedsTargetThirdClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(preloadedNeedsTargetIdle.state, "local-player");
assert(
  preloadedNeedsTargetThirdClick.queuedGraniteMaulSpecs === 3 &&
    preloadedNeedsTargetThirdClick.state.actors["local-player"].targetId === "opponent",
  "third Granite maul click should promote the existing far last-target into the active target route"
);
const preloadedNeedsTargetRoute = advance(preloadedNeedsTargetThirdClick.state);
assert(
  preloadedNeedsTargetRoute.state.actors["local-player"].gmaul.queuedSpecs === 3 &&
    preloadedNeedsTargetRoute.routeRequests.some(
      (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 1
    ),
  "third Granite maul click should use the normal melee TargetRoute request while keeping queued specs until in range"
);
const preloadedNeedsTargetFire = advance(preloadedNeedsTargetRoute.state, {
  local: { x: 3, z: 0 },
  opponent: { x: 4, z: 0 }
});
assert(
  graniteMaulHitRollCount(preloadedNeedsTargetFire) === 2 &&
    preloadedNeedsTargetFire.state.actors["local-player"].gmaul.queuedSpecs === 0,
  "third-click Granite maul auto-target should fire through the existing energy-capped maul consumption once routed into melee range"
);

let delayedPreloadThirdClick = createState(251, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
delayedPreloadThirdClick = requestLocalAttack(delayedPreloadThirdClick);
delayedPreloadThirdClick = runtimeCombat.resetRuntimePlayerCombatActorTarget(delayedPreloadThirdClick, "local-player");
for (let tick = 0; tick < 4; tick += 1) {
  delayedPreloadThirdClick = advance(delayedPreloadThirdClick).state;
}
const delayedPreloadFirstClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(delayedPreloadThirdClick, "local-player");
const delayedPreloadSecondClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(delayedPreloadFirstClick.state, "local-player");
assert(
  delayedPreloadSecondClick.state.actors["local-player"].gmaul.queuedTargetId === "opponent",
  "a delayed double-click preload should bind the currently remembered target for the live Gmaul queue"
);
let delayedPreloadWait = delayedPreloadSecondClick.state;
for (let tick = 0; tick < 2; tick += 1) {
  delayedPreloadWait = advance(delayedPreloadWait).state;
}
assert(
  delayedPreloadWait.actors["local-player"].lastTargetId === null &&
    delayedPreloadWait.actors["local-player"].gmaul.queuedSpecs === 2 &&
    delayedPreloadWait.actors["local-player"].gmaul.timeoutTicks > 0,
  "test setup should leave only the live Gmaul preload target after the normal last-target timeout expires"
);
const delayedPreloadThirdClickResult = runtimeCombat.toggleRuntimePlayerCombatSpecial(delayedPreloadWait, "local-player");
assert(
  delayedPreloadThirdClickResult.state.actors["local-player"].targetId === "opponent" &&
    delayedPreloadThirdClickResult.state.actors["local-player"].gmaul.queuedSpecs === 3,
  "third Granite maul click should send a still-live preload even after the old last-target timeout has expired"
);

let doubleGmaulSpecial = createState(25, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
const firstGmaulClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(doubleGmaulSpecial, "local-player");
const secondGmaulClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(firstGmaulClick.state, "local-player");
assert(secondGmaulClick.mutation === "deactivate-queue-gmaul", "second active Granite maul click should deactivate and queue another spec like Nh");
assert(secondGmaulClick.queuedGraniteMaulSpecs === 2, "two Granite maul clicks should queue two special hits before combat consumes them");
doubleGmaulSpecial = requestLocalAttack(secondGmaulClick.state);
const doubleGmaulResult = advance(doubleGmaulSpecial);
assert(graniteMaulHitRollCount(doubleGmaulResult) === 2, "two queued Granite maul specs should create two immediate hit rolls");
assert(doubleGmaulResult.state.actors["local-player"].gmaul.specialEnergy === 0, "two Granite maul specs should consume 100 percent special energy");

let inRangeTripleClickGmaul = createState(250, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
inRangeTripleClickGmaul = requestLocalAttack(inRangeTripleClickGmaul);
inRangeTripleClickGmaul = runtimeCombat.resetRuntimePlayerCombatActorTarget(inRangeTripleClickGmaul, "local-player");
const inRangeTripleFirstClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(inRangeTripleClickGmaul, "local-player");
const inRangeTripleSecondClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(inRangeTripleFirstClick.state, "local-player");
const inRangeTripleThirdClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(inRangeTripleSecondClick.state, "local-player");
const inRangeTripleClickResult = advance(inRangeTripleThirdClick.state);
assert(
  inRangeTripleThirdClick.state.actors["local-player"].targetId === "opponent" &&
    graniteMaulHitRollCount(inRangeTripleClickResult) === 2,
  "third Granite maul click should auto-target and immediately fire when the existing last target is already in melee range"
);

let tripleGmaulSpecial = createState(247, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
const tripleGmaulFirstClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(tripleGmaulSpecial, "local-player");
const tripleGmaulSecondClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(tripleGmaulFirstClick.state, "local-player");
const tripleGmaulThirdClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(tripleGmaulSecondClick.state, "local-player");
assert(tripleGmaulThirdClick.queuedGraniteMaulSpecs === 3, "three Granite maul clicks should queue three attempts before Nh energy caps consumption");
tripleGmaulSpecial = requestLocalAttack(tripleGmaulThirdClick.state);
const tripleGmaulResult = advance(tripleGmaulSpecial);
assert(
  graniteMaulHitRollCount(tripleGmaulResult) === 2 &&
    tripleGmaulResult.state.actors["local-player"].gmaul.queuedSpecs === 0 &&
    tripleGmaulResult.state.actors["local-player"].gmaul.specialEnergy === 0,
  "three queued Granite maul clicks at 100 percent energy should consume at most two specs, matching Nh energy / 500 cap"
);

let staleGmaulQueueMeleeFallthrough = createState(248, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
const staleGmaulFirstClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(staleGmaulQueueMeleeFallthrough, "local-player");
const staleGmaulSecondClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(staleGmaulFirstClick.state, "local-player");
staleGmaulQueueMeleeFallthrough = runtimeCombat.setRuntimePlayerCombatLoadout(
  staleGmaulSecondClick.state,
  "local-player",
  "tentacle-bandos"
);
staleGmaulQueueMeleeFallthrough = requestLocalAttack(staleGmaulQueueMeleeFallthrough);
const staleGmaulQueueMeleeFallthroughResult = advance(staleGmaulQueueMeleeFallthrough);
const staleGmaulQueueMeleeFallthroughAttack = staleGmaulQueueMeleeFallthroughResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "local-player"
);
assert(
  staleGmaulQueueMeleeFallthroughAttack?.sequenceName === "whip_attack" &&
    staleGmaulQueueMeleeFallthroughAttack?.specialAttack === undefined &&
    staleGmaulQueueMeleeFallthroughResult.state.actors["local-player"].gmaul.queuedSpecs === 0 &&
    staleGmaulQueueMeleeFallthroughResult.state.actors["local-player"].gmaul.specialEnergy === 100,
  "queued Granite maul specs should be cleared by the Nh melee fallthrough path when attacking with a non-maul melee weapon"
);

let staleGmaulQueueWeaponSwap = createState(251, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
staleGmaulQueueWeaponSwap = requestLocalAttack(staleGmaulQueueWeaponSwap);
staleGmaulQueueWeaponSwap = runtimeCombat.resetRuntimePlayerCombatActorTarget(staleGmaulQueueWeaponSwap, "local-player");
const staleSwapFirstClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(staleGmaulQueueWeaponSwap, "local-player");
const staleSwapSecondClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(staleSwapFirstClick.state, "local-player");
staleGmaulQueueWeaponSwap = runtimeCombat.setRuntimePlayerCombatLoadout(
  staleSwapSecondClick.state,
  "local-player",
  "acb-hides"
);
assert(
  staleGmaulQueueWeaponSwap.actors["local-player"].gmaul.queuedSpecs === 0,
  "swapping away from Granite maul should cancel the preloaded spec queue instead of preserving stale clicks"
);
staleGmaulQueueWeaponSwap = runtimeCombat.setRuntimePlayerCombatLoadout(
  staleGmaulQueueWeaponSwap,
  "local-player",
  "gmaul-bandos"
);
const staleSwapFreshClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(staleGmaulQueueWeaponSwap, "local-player");
assert(
  staleSwapFreshClick.queuedGraniteMaulSpecs === 1 &&
    staleSwapFreshClick.state.actors["local-player"].targetId === null,
  "swapping back to Granite maul and clicking once should start a fresh single queue, not unload the old double preload"
);

let acbIntoOutOfRangeGmaul = createState(249, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides"
});
acbIntoOutOfRangeGmaul = requestLocalAttack(acbIntoOutOfRangeGmaul);
const acbIntoOutOfRangeShot = advance(acbIntoOutOfRangeGmaul);
assert(
  acbIntoOutOfRangeShot.state.events.some((event) => event.kind === "attack" && event.style === "ranged"),
  "ACB to Granite maul out-of-range verifier should start from a ranged hit"
);
acbIntoOutOfRangeGmaul = runtimeCombat.setRuntimePlayerCombatLoadout(
  acbIntoOutOfRangeShot.state,
  "local-player",
  "gmaul-bandos"
);
acbIntoOutOfRangeGmaul = runtimeCombat.resetRuntimePlayerCombatActorTarget(acbIntoOutOfRangeGmaul, "local-player");
const acbIntoGmaulFirstClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(acbIntoOutOfRangeGmaul, "local-player");
const acbIntoGmaulSecondClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(acbIntoGmaulFirstClick.state, "local-player");
const acbIntoGmaulRoute = advance(requestLocalAttack(acbIntoGmaulSecondClick.state));
assert(
  acbIntoGmaulRoute.state.actors["local-player"].gmaul.queuedSpecs === 2 &&
    acbIntoGmaulRoute.routeRequests.some(
      (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 1
    ),
  "ACB into double Granite maul should preload both specs while routing from out of range after the opponent click"
);
const acbIntoGmaulFire = advance(acbIntoGmaulRoute.state, {
  local: { x: 3, z: 0 },
  opponent: { x: 4, z: 0 }
});
assert(
  graniteMaulHitRollCount(acbIntoGmaulFire) === 2,
  "ACB into double Granite maul should fire both queued specs once melee route reaches the opponent even during the ACB cooldown"
);

let frozenUnderGmaulSpecial = createState(26, {
  localTile: { x: 1, z: 1 },
  opponentTile: { x: 1, z: 1 },
  localLoadoutId: "gmaul-bandos"
});
frozenUnderGmaulSpecial = {
  ...frozenUnderGmaulSpecial,
  actors: {
    ...frozenUnderGmaulSpecial.actors,
    "local-player": {
      ...frozenUnderGmaulSpecial.actors["local-player"],
      locks: {
        ...frozenUnderGmaulSpecial.actors["local-player"].locks,
        freezeUntilTick: 27
      }
    }
  }
};
const frozenUnderGmaulToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(frozenUnderGmaulSpecial, "local-player");
frozenUnderGmaulSpecial = requestLocalAttack(frozenUnderGmaulToggle.state);
const frozenUnderGmaulResult = advance(frozenUnderGmaulSpecial);
assert(frozenUnderGmaulResult.state.queuedHits.length === 0, "frozen same-tile Granite maul special should not queue a hit from underneath the target");
assert(
  !frozenUnderGmaulResult.state.events.some((event) => event.kind === "attack" && event.specialAttack === "granite_maul"),
  "frozen same-tile Granite maul special should not emit the special attack event"
);
assert(
  frozenUnderGmaulResult.state.actors["local-player"].gmaul.specialEnergy === 100,
  "frozen same-tile Granite maul special should not drain special energy"
);
assert(
  frozenUnderGmaulResult.routeRequests.some(
    (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 1
  ),
  "frozen same-tile Granite maul special should keep TargetRoute-style walk-out request instead of treating underneath as reachable"
);

let frozenTwoTileGmaulSpecial = createState(261, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
frozenTwoTileGmaulSpecial = freezeActor(frozenTwoTileGmaulSpecial, "local-player", 20);
const frozenTwoTileGmaulToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(frozenTwoTileGmaulSpecial, "local-player");
frozenTwoTileGmaulSpecial = requestLocalAttack(frozenTwoTileGmaulToggle.state);
const frozenTwoTileGmaulResult = runtimeCombat.advanceRuntimePlayerCombat(frozenTwoTileGmaulSpecial, {
  tiles: {
    "local-player": frozenTwoTileGmaulSpecial.actors["local-player"].tile,
    opponent: frozenTwoTileGmaulSpecial.actors.opponent.tile
  },
  tileScale: 0.5
});
assert(
  frozenTwoTileGmaulResult.state.queuedHits.length === 0 &&
    !frozenTwoTileGmaulResult.state.events.some((event) => event.kind === "attack" && event.specialAttack === "granite_maul") &&
    frozenTwoTileGmaulResult.state.actors["local-player"].gmaul.specialEnergy === 100,
  "frozen two-tile Granite maul step-in should not queue or drain a special attack"
);

let opponentAttack = createState(15, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides"
});
opponentAttack = requestOpponentAttack(opponentAttack);
const opponentAttackResult = advance(opponentAttack);
assert(opponentAttackResult.state.queuedHits.length === 1, "opponent Attack should be able to queue hits against the local player");
assert(
  opponentAttackResult.state.events.some((event) => event.kind === "attack" && event.attackerId === "opponent"),
  "opponent Attack should emit attack events just like local Attack"
);

let cooldown = createState(13);
cooldown = requestLocalAttack(cooldown);
let cooldownResult = advance(cooldown);
const queuedAfterFirst = cooldownResult.state.queuedHits.length;
cooldownResult = advance(cooldownResult.state);
assert(
  cooldownResult.state.queuedHits.length <= queuedAfterFirst,
  "weapon cooldown should stop immediate repeated attack queuing on the next tick"
);
assert(
  JSON.stringify(attackEventTicksFor("kodai-robes", 5, { local: { x: 0, z: 0 }, opponent: { x: 4, z: 0 } }, { spellId: "ice-barrage" })) === JSON.stringify([0]),
  "selected one-shot magic should emit one cast animation and then clear instead of autocasting"
);
assert(
  JSON.stringify(attackEventTicksFor("kodai-robes", 4, { local: { x: 0, z: 0 }, opponent: { x: 1, z: 0 } })) === JSON.stringify([0, 4]),
  "Kodai default WAND attack should use the four-tick Nh melee cooldown"
);
assert(
  JSON.stringify(attackEventTicksFor("acb-hides", 6, { local: { x: 0, z: 0 }, opponent: { x: 4, z: 0 } })) === JSON.stringify([0, 6]),
  "ACB accurate/longrange should use the six-tick Nh WeaponType.attackTicks cooldown"
);
assert(
  JSON.stringify(attackEventTicksFor("acb-hides", 5, { local: { x: 0, z: 0 }, opponent: { x: 4, z: 0 } }, { attackSetIndex: 1 })) === JSON.stringify([0, 5]),
  "ACB rapid style should apply Nh PlayerCombat's one-tick ranged reduction"
);
let attackSetPersistence = createState(140, {
  localLoadoutId: "acb-hides",
  localAttackSetIndex: 0
});
attackSetPersistence = runtimeCombat.setRuntimePlayerCombatAttackSet(attackSetPersistence, "local-player", 1);
attackSetPersistence = runtimeCombat.setRuntimePlayerCombatLoadout(attackSetPersistence, "local-player", "tentacle-bandos");
assert(
  attackSetPersistence.actors["local-player"].attackSetIndex === 1,
  "weapon switches should preserve Config.ATTACK_SET instead of resetting to Accurate"
);
attackSetPersistence = runtimeCombat.setRuntimePlayerCombatLoadout(attackSetPersistence, "local-player", "acb-hides");
assert(
  attackSetPersistence.actors["local-player"].attackSetIndex === 1,
  "switching back to ACB should keep Rapid selected like Nh varp 43"
);
const attackSetNullSlotResolved = createState(141, {
  localLoadoutId: "acb-hides",
  localAttackSetIndex: 2
});
assert(
  attackSetNullSlotResolved.actors["local-player"].attackSetIndex === 1,
  "Nh null attack-set child 11 should resolve backward to the previous visible attack style"
);
assert(
  JSON.stringify(attackEventTicksFor("tentacle-bandos", 4, { local: { x: 0, z: 0 }, opponent: { x: 1, z: 0 } })) === JSON.stringify([0, 4]),
  "whip should emit one attack animation per four-tick Nh attack cooldown"
);
assert(
  JSON.stringify(attackEventTicksFor("gmaul-bandos", 7, { local: { x: 0, z: 0 }, opponent: { x: 1, z: 0 } })) === JSON.stringify([0, 7]),
  "Granite maul regular attacks should use the seven-tick Nh WeaponType.attackTicks cooldown"
);

assert(
  targetSpellSource.includes("target.freeze(seconds, hit.attacker)") &&
    targetSpellSource.indexOf("int damage = target.hit(hit);") < targetSpellSource.indexOf("afterHit(hit, target);"),
  "Nh TargetSpell should roll/queue damage, then apply Ice Barrage hold immediately through afterHit"
);
assert(
  entitySource.includes("freezer.getPosition().isWithinDistance(getPosition(), false, 12)") &&
    positionSource.includes("Math.abs(x - other.x) <= distance && Math.abs(y - other.y) <= distance"),
  "Nh freeze break should use Entity.isMovementBlocked freezer Chebyshev distance 12"
);

let freezeOnCastResult = null;
for (let seed = 1; seed < 1000; seed += 1) {
  let freezeOnCast = createState(seed, {
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 10, z: 0 },
    localLoadoutId: "kodai-robes",
    opponentLoadoutId: "acb-hides"
  });
  freezeOnCast = requestLocalSpell(freezeOnCast);
  const result = advance(freezeOnCast);
  if (entityLocks.isFrozen(result.state.actors.opponent.locks, result.state.tick)) {
    freezeOnCastResult = result;
    break;
  }
}
assert(freezeOnCastResult, "Ice Barrage should apply freeze on the cast tick when the rolled hit is non-zero");
assert(
  freezeOnCastResult.state.queuedHits.length === 1 &&
    freezeOnCastResult.state.queuedHits[0].spellId === "ice-barrage" &&
    freezeOnCastResult.state.queuedHits[0].freezeDurationTicks === undefined,
  "Ice Barrage queued damage should not carry a second delayed freeze after the source immediate hold"
);

let distantFreezeBreak = createState(44, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 13, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides"
});
distantFreezeBreak = freezeActor(distantFreezeBreak, "opponent", distantFreezeBreak.tick + 30, "local-player");
const distantFreezeBreakResult = advance(distantFreezeBreak);
assert(
  !entityLocks.isFrozen(distantFreezeBreakResult.state.actors.opponent.locks, distantFreezeBreakResult.state.tick),
  "freeze should reset once the freezer is outside Nh' distance-12 break range"
);

let inRangeFreezeHeld = createState(45, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 12, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides"
});
inRangeFreezeHeld = freezeActor(inRangeFreezeHeld, "opponent", inRangeFreezeHeld.tick + 30, "local-player");
const inRangeFreezeHeldResult = advance(inRangeFreezeHeld);
assert(
  entityLocks.isFrozen(inRangeFreezeHeldResult.state.actors.opponent.locks, inRangeFreezeHeldResult.state.tick),
  "freeze should remain while the freezer is still inside Nh' inclusive distance-12 break range"
);

let preMovementFreeze = createState(43, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
preMovementFreeze = {
  ...preMovementFreeze,
  queuedHits: [
    {
      id: "pre-movement-freeze",
      dueTick: preMovementFreeze.tick,
      attackerId: "opponent",
      defenderId: "local-player",
      style: "magic",
      attackType: "ACCURATE",
      attackSetIndex: 0,
      damage: 1,
      rawDamage: 1,
      maxDamage: 1,
      hitChance: 1,
      freezeDurationTicks: runtimeCombat.runtimePlayerCombatIceBarrageFreezeTicks
    }
  ]
};
const preMovementFreezeApplied = runtimeCombat.applyRuntimePlayerCombatPreMovementHits(preMovementFreeze, {
  tiles: {
    "local-player": preMovementFreeze.actors["local-player"].tile,
    opponent: preMovementFreeze.actors.opponent.tile
  }
});
assert(preMovementFreezeApplied.applied, "due freeze hit should apply during the pre-movement hit phase");
assert(preMovementFreezeApplied.state.tick === preMovementFreeze.tick, "pre-movement hit phase should not advance the game tick");
assert(preMovementFreezeApplied.state.queuedHits.length === 0, "pre-movement hit phase should remove due hits before the combat attack phase");
assert(
  preMovementFreezeApplied.state.actors["local-player"].locks.freezeUntilTick ===
    preMovementFreeze.tick + runtimeCombat.runtimePlayerCombatIceBarrageFreezeTicks,
  "pre-movement hit phase should apply Ice Barrage freeze before route movement can consume another step"
);
const preMovementFreezeAdvanced = advance(preMovementFreezeApplied.state);
assert(
  preMovementFreezeAdvanced.state.events.filter((event) => event.id === "pre-movement-freeze-hitsplat").length === 1,
  "pre-applied freeze hits should not be replayed by the later combat attack phase"
);

let walkResetState = createState(17, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes"
});
walkResetState = requestLocalSpell(walkResetState);
const walkResetAttack = advance(walkResetState).state;
const walkResetQueuedHits = walkResetAttack.queuedHits.length;
const walkResetCleared = runtimeCombat.resetRuntimePlayerCombatActorTarget(walkResetAttack, "local-player");
assert(walkResetCleared.actors["local-player"].targetId === null, "manual walk reset should clear the local combat target");
assert(
  walkResetCleared.actors["local-player"].actionSequenceName === "barrage_cast",
  "manual walk reset should preserve a primary attack animation that Nh already launched"
);
assert(
  walkResetCleared.queuedHits.length === walkResetQueuedHits,
  "manual walk reset should not delete damage that Nh already launched"
);
let walkResetAdvanced = walkResetCleared;
for (let index = 0; index < 6; index += 1) {
  walkResetAdvanced = advance(walkResetAdvanced, { local: { x: 1, z: 0 } }).state;
}
assert(
  walkResetAdvanced.events.filter((event) => event.kind === "attack" && event.attackerId === "local-player").length === 1,
  "after a manual walk reset, local combat should not keep auto-attacking until another Attack command is sent"
);
assert(
  runtimeCombat.runtimePlayerCombatHitsplatEndTick(0) === 2,
  "manual combat hitsplats should convert the default 50 client-cycle lifetime through 30 client cycles per game tick"
);
assert(
  runtimeCombat.runtimePlayerCombatHealthBarEndTick(0) === 10,
  "manual combat health bars should convert the source 300 client-cycle player health-bar lifetime through game ticks"
);

let seedWithDamage = 1;
let unprotectedDamage = 0;
for (; seedWithDamage < 1000; seedWithDamage += 1) {
  unprotectedDamage = damageFromState(seedWithDamage);
  if (unprotectedDamage > 0) {
    break;
  }
}
assert(unprotectedDamage > 0, "test should find a deterministic seed that produces ranged damage");
const protectedDamage = damageFromState(seedWithDamage, ["protect_from_missiles"]);
assert(
  protectedDamage === Math.trunc(unprotectedDamage * prayers.pvpProtectionDamageMultiplier),
  "PvP protection prayer should reduce visible ranged damage through the shared prayer reducer"
);
let protectSnapshotState = createState(seedWithDamage, { opponentPrayers: ["protect_from_missiles"] });
protectSnapshotState = requestLocalAttack(protectSnapshotState);
let protectSnapshotAttack = advance(protectSnapshotState).state;
const protectSnapshotHit = protectSnapshotAttack.queuedHits[0];
assert(protectSnapshotHit, "protected queued hit should exist for prayer snapshot regression");
assert(
  protectSnapshotHit.defenderProtectionPrayer === "protect_from_missiles" &&
    protectSnapshotHit.damage === Math.trunc(protectSnapshotHit.rawDamage * prayers.pvpProtectionDamageMultiplier),
  `queued hit should store Nh finalized on-prayer damage at attack time: ${JSON.stringify(protectSnapshotHit)}`
);
protectSnapshotAttack = {
  ...protectSnapshotAttack,
  actors: {
    ...protectSnapshotAttack.actors,
    opponent: {
      ...protectSnapshotAttack.actors.opponent,
      activePrayers: []
    }
  }
};
assert(
  runtimeCombat.runtimePlayerCombatQueuedHitDamage(
    protectSnapshotAttack.actors,
    protectSnapshotHit,
    protectSnapshotAttack.tick
  ) === protectSnapshotHit.damage,
  "queued-hit XP preview should keep the finalized on-prayer damage after the defender changes prayer"
);
while (protectSnapshotAttack.queuedHits.some((hit) => hit.id === protectSnapshotHit.id)) {
  protectSnapshotAttack = advance(protectSnapshotAttack).state;
}
const protectSnapshotHitsplat = protectSnapshotAttack.events.find(
  (event) => event.kind === "hitsplat" && event.id === `${protectSnapshotHit.id}-hitsplat`
);
assert(
  protectSnapshotHitsplat?.damage === protectSnapshotHit.damage,
  `hitsplat should consume the same finalized on-prayer damage as the queued XP drop: ${JSON.stringify({
    queued: protectSnapshotHit,
    hitsplat: protectSnapshotHitsplat
  })}`
);
let latePrayerState = createState(seedWithDamage);
latePrayerState = requestLocalAttack(latePrayerState);
let latePrayerAttack = advance(latePrayerState).state;
const latePrayerHit = latePrayerAttack.queuedHits[0];
assert(latePrayerHit, "unprotected queued hit should exist for late-prayer regression");
assert(
  latePrayerHit.damage === latePrayerHit.rawDamage && latePrayerHit.defenderProtectionPrayer === undefined,
  `queued hit should store unprotected damage before any later prayer change: ${JSON.stringify(latePrayerHit)}`
);
latePrayerAttack = {
  ...latePrayerAttack,
  actors: {
    ...latePrayerAttack.actors,
    opponent: {
      ...latePrayerAttack.actors.opponent,
      activePrayers: ["protect_from_missiles"]
    }
  }
};
assert(
  runtimeCombat.runtimePlayerCombatQueuedHitDamage(latePrayerAttack.actors, latePrayerHit, latePrayerAttack.tick) ===
    latePrayerHit.damage,
  "queued-hit XP preview should not be lowered by a prayer switched on after the attack was launched"
);
while (latePrayerAttack.queuedHits.some((hit) => hit.id === latePrayerHit.id)) {
  latePrayerAttack = advance(latePrayerAttack).state;
}
const latePrayerHitsplat = latePrayerAttack.events.find(
  (event) => event.kind === "hitsplat" && event.id === `${latePrayerHit.id}-hitsplat`
);
assert(
  latePrayerHitsplat?.damage === latePrayerHit.damage,
  `hitsplat should not be lowered by a late prayer after the queued XP drop was emitted: ${JSON.stringify({
    queued: latePrayerHit,
    hitsplat: latePrayerHitsplat
  })}`
);

const sampledMaxes = {};
for (const [loadoutId, tiles] of Object.entries({
  "kodai-robes": { local: { x: 0, z: 0 }, opponent: { x: 1, z: 0 } },
  "acb-hides": { local: { x: 0, z: 0 }, opponent: { x: 4, z: 0 } },
  "tentacle-bandos": { local: { x: 0, z: 0 }, opponent: { x: 1, z: 0 } },
  "gmaul-bandos": { local: { x: 0, z: 0 }, opponent: { x: 1, z: 0 } }
})) {
  let maxObserved = 0;
  let formulaMax = 0;
  for (let seed = 1; seed <= 1500; seed += 1) {
    let state = createState(seed, {
      localTile: tiles.local,
      opponentTile: tiles.opponent,
      localLoadoutId: loadoutId,
      opponentLoadoutId: "kodai-robes"
    });
    state = requestLocalAttack(state);
    const result = advance(state);
    const hit =
      result.state.queuedHits[0] ??
      result.state.events.find((event) => event.kind === "hitsplat" && event.attackerId === "local-player");
    assert(hit, `${loadoutId} should resolve one hit roll while sampling damage`);
    const estimate = runtimeCombat.runtimePlayerCombatDamageEstimate(
      result.state.actors["local-player"],
      result.state.actors.opponent,
      hit.style
    );
    formulaMax = Math.max(formulaMax, estimate.maxDamage);
    maxObserved = Math.max(maxObserved, hit.rawDamage);
    assert(hit.rawDamage <= estimate.maxDamage, `${loadoutId} raw damage must not exceed the visible Nh formula max`);
  }
  sampledMaxes[loadoutId] = { maxObserved, formulaMax };
}
assert(
  Object.values(sampledMaxes).every((entry) => entry.formulaMax < 60),
  "NH runtime loadouts should not produce impossible 80+ manual hits from the visible formula"
);
assert(sampledMaxes["kodai-robes"].formulaMax < 38, `Kodai wand default crush should not inherit the Ice Barrage max hit: ${JSON.stringify(sampledMaxes["kodai-robes"])}`);
const sampledBarrageEstimate = runtimeCombat.runtimePlayerCombatDamageEstimate(
  magicAttackResult.state.actors["local-player"],
  magicAttackResult.state.actors.opponent,
  "magic"
);
assert(sampledBarrageEstimate.maxDamage === 35, `Selected Ice Barrage max should stay source-backed at 35 for this loadout: ${JSON.stringify(sampledBarrageEstimate)}`);

const staleDeathSupplies = {
  ...runtimeCombat.runtimePlayerCombatDefaultSupplies,
  manta_ray: 0,
  karambwan: 0,
  saradomin_brew: 0,
  super_restore: 0
};
const staleDeathSupplyDelays = {
  eatDelayUntilTick: 99,
  karambwanDelayUntilTick: 99,
  potionDelayUntilTick: 99
};
const lethalBaseState = createState(19);
const lethalState = {
  ...lethalBaseState,
  actors: {
    ...lethalBaseState.actors,
    opponent: {
      ...lethalBaseState.actors.opponent,
      targetId: "local-player",
      lastTargetId: "local-player",
      lastTargetTimeoutTicks: 5,
      policyOffenceStyle: "melee",
      policyNextLoadoutSyncTick: 19,
      policyNextFreezeAttemptTick: 23,
      policyStalledStyle: "ranged",
      policyStalledStyleTicks: 4,
      queuedSpellId: "ice-barrage",
      autocastSpellId: "blood-barrage",
      defensiveCast: true,
      supplies: staleDeathSupplies,
      supplyDelays: staleDeathSupplyDelays,
      activePrayers: ["protect_from_magic", "augury"]
    }
  },
  queuedHits: [
    {
      id: "manual-lethal",
      dueTick: 0,
      attackerId: "local-player",
      defenderId: "opponent",
      style: "slash",
      attackType: "AGGRESSIVE",
      attackSetIndex: 0,
      damage: 99,
      rawDamage: 99,
      maxDamage: 99,
      hitChance: 1
    }
  ]
};
const lethalResult = advance(lethalState);
const lethalOpponent = lethalResult.state.actors.opponent;
assert(lethalOpponent.hitpoints === 0, "lethal hit should set target hitpoints to zero");
assert(lethalOpponent.deadUntilTick !== null, "lethal hit should schedule a death reset");
assert(
  lethalResult.state.events.some((event) => event.kind === "death" && event.actorId === "opponent"),
  "lethal hit should emit a death event"
);
assert(
  lethalResult.state.combatStartTick === (lethalOpponent.deadUntilTick ?? 0) + runtimeCombat.runtimePlayerCombatFightCountdownTicks,
  `death should schedule the next rematch countdown after respawn: ${JSON.stringify({
    combatStartTick: lethalResult.state.combatStartTick,
    deadUntilTick: lethalOpponent.deadUntilTick
  })}`
);
assert(
  nhStakerBotSource.includes("resetForDeath();") &&
    nhStakerBotSource.includes("private void resetForDeath()") &&
    nhStakerBotSource.includes("player.getCombat().reset();") &&
    playerCombatSource.includes("public void reset()") &&
    playerCombatSource.includes("queuedSpell = null;") &&
    runtimeCombatSource.includes("function resetRuntimePlayerCombatActorPolicyDeath") &&
    runtimeCombatSource.includes("resetForDeath() as soon as the bot is dead"),
  "runtime lethal hit should stay source-anchored to NhStakerBot.resetForDeath and PlayerCombat.reset"
);
assert(
  lethalOpponent.targetId === null &&
    lethalOpponent.lastTargetId === null &&
    lethalOpponent.lastTargetTimeoutTicks === 0 &&
    lethalOpponent.policyOffenceStyle === undefined &&
    lethalOpponent.policyNextLoadoutSyncTick === 0 &&
    lethalOpponent.policyNextFreezeAttemptTick === 0 &&
    lethalOpponent.policyStalledStyle === null &&
    lethalOpponent.policyStalledStyleTicks === 0 &&
    lethalOpponent.queuedSpellId === null &&
    lethalOpponent.activePrayers.length === 0 &&
    lethalOpponent.supplies.manta_ray === 0 &&
    lethalOpponent.supplyDelays.eatDelayUntilTick === 99,
  `lethal hit should apply Java resetForDeath policy cleanup immediately while leaving inventory restore for respawn: ${JSON.stringify(lethalOpponent)}`
);
const respawnTick = lethalOpponent.deadUntilTick;
const staleRespawnState = {
  ...lethalResult.state,
  tick: respawnTick,
  actors: {
    ...lethalResult.state.actors,
    opponent: {
      ...lethalResult.state.actors.opponent,
      targetId: "local-player",
      lastTargetId: "local-player",
      lastTargetTimeoutTicks: 5,
      policyOffenceStyle: "melee",
      policyStalledStyle: "ranged",
      policyStalledStyleTicks: 4,
      queuedSpellId: "ice-barrage",
      autocastSpellId: "blood-barrage",
      defensiveCast: true,
      levels: { attack: 43, strength: 42, defence: 41, ranged: 44, magic: 45 },
      prayerPoints: 12,
      activePrayers: ["protect_from_magic", "augury"],
      locks: entityLocks.applyFreeze(entityLocks.createEntityLockState(), 0, 12, "local-player"),
      supplies: staleDeathSupplies,
      supplyDelays: staleDeathSupplyDelays,
      specialActive: true,
      gmaul: {
        ...lethalResult.state.actors.opponent.gmaul,
        equippedGraniteMaul: true,
        previousWeaponHadVisibleSpecBar: true,
        gmaulEquippedTick: 0,
        specBarVisibleTick: 0,
        queuedSpecs: 2,
        timeoutTicks: 4,
        specialEnergy: 0,
        queuedTargetId: "local-player"
      }
    }
  }
};
const respawnSynced = runtimeCombat.syncRuntimePlayerCombatStateToInput(staleRespawnState, {
  tiles: {
    "local-player": staleRespawnState.actors["local-player"].tile,
    opponent: staleRespawnState.actors.opponent.tile
  }
});
const respawnedOpponent = respawnSynced.actors.opponent;
assert(
  playerCombatSource.includes("public void restore()") &&
    playerCombatSource.includes("player.getStats().restore(true);") &&
    playerCombatSource.includes("player.getPrayer().deactivateAll();") &&
    playerCombatSource.includes("player.resetFreeze();") &&
    playerCombatSource.includes("restoreSpecial(100);") &&
    nhStakerBotSource.includes("private void prepareFreshState(boolean restoreStatsAndHp)") &&
    nhStakerBotSource.includes("clearAutocast();") &&
    nhStakerBotSource.includes("player.getCombat().reset();") &&
    nhStakerLoadoutSource.includes("public static SelectedWeapons prepareBot(Player player") &&
    nhStakerLoadoutSource.includes("SelectedWeapons selected = applyBot(player, preferredSource);") &&
    nhStakerLoadoutSource.includes("place(player, 5, MANTA_RAY, 1);") &&
    runtimeCombatSource.includes("PlayerCombat.restore() and NhStakerBot.prepareFreshState() clear combat") &&
    runtimeCombatSource.includes("supplies: runtimePlayerCombatDefaultSupplies") &&
    runtimeCombatSource.includes("gmaul: createGmaulSpecState(100)"),
  "runtime respawn reset should stay source-anchored to Nh PlayerCombat.restore and NhStakerBot.prepareFreshState"
);
assert(
  respawnedOpponent.hitpoints === respawnedOpponent.maxHitpoints &&
    respawnedOpponent.deadUntilTick === null &&
    respawnedOpponent.targetId === null &&
    respawnedOpponent.lastTargetId === null &&
    respawnedOpponent.lastTargetTimeoutTicks === 0 &&
    respawnedOpponent.policyOffenceStyle === undefined &&
    respawnedOpponent.policyStalledStyle === null &&
    respawnedOpponent.policyStalledStyleTicks === 0 &&
    respawnedOpponent.queuedSpellId === null &&
    respawnedOpponent.autocastSpellId === null &&
    respawnedOpponent.defensiveCast === false &&
    respawnedOpponent.levels.magic === 99 &&
    respawnedOpponent.prayerPoints === respawnedOpponent.maxPrayerPoints &&
    respawnedOpponent.activePrayers.length === 0 &&
    respawnedOpponent.locks.freezeUntilTick === -1 &&
    respawnedOpponent.supplies.manta_ray === runtimeCombat.runtimePlayerCombatDefaultSupplies.manta_ray &&
    respawnedOpponent.supplies.karambwan === runtimeCombat.runtimePlayerCombatDefaultSupplies.karambwan &&
    respawnedOpponent.supplies.saradomin_brew === runtimeCombat.runtimePlayerCombatDefaultSupplies.saradomin_brew &&
    respawnedOpponent.supplyDelays.eatDelayUntilTick === -1 &&
    respawnedOpponent.supplyDelays.karambwanDelayUntilTick === -1 &&
    respawnedOpponent.supplyDelays.potionDelayUntilTick === -1 &&
    respawnedOpponent.specialActive === false &&
    respawnedOpponent.gmaul.queuedSpecs === 0 &&
    respawnedOpponent.gmaul.specialEnergy === 100,
  `runtime respawn should clear stale NH policy/combat state before the next inference tick: ${JSON.stringify(respawnedOpponent)}`
);
assert(
  viewerSource.includes("applyRuntimeFullFightResetAfterRespawn") &&
    viewerSource.includes("runtimeCombatActorRespawnedForFreshFightReset") &&
    viewerSource.includes("runtimeNhStakeInventorySlots()") &&
    viewerSource.includes("runtimeNhStakeEquipmentItems()") &&
    viewerSource.includes("runtimeSuppliesFromInventorySlots(localInventorySlots)") &&
    viewerSource.includes("runtimeSuppliesFromInventorySlots(opponentInventorySlots)") &&
    viewerSource.includes("Saved setup restored") &&
    viewerSource.includes("lastFreshFightResetInventoryCount") &&
    viewerSource.includes("lastFreshFightResetOpponentSupplies") &&
    viewerSource.includes("lastFreshFightResetOpponentInventorySupplies") &&
    viewerSource.includes("setRuntimeSetupSelectorOpen(true)") &&
    viewerSource.includes("lastFreshFightResetSetupSelectorOpen") &&
    viewerSource.includes("PlayerCombat.restore/NhStakerBot.prepareFreshState + client container rematch reset"),
  "RuntimeSceneViewer should restore visible containers, derive combat supplies from the same inventory slots, and reopen the setup selector on the respawn reset"
);
const disengageStateBase = createState(29, {
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
const disengageState = {
  ...disengageStateBase,
  actors: {
    ...disengageStateBase.actors,
    opponent: {
      ...disengageStateBase.actors.opponent,
      targetId: "local-player",
      lastTargetId: "local-player",
      lastTargetTimeoutTicks: 5,
      policyOffenceStyle: "magic",
      policyNextLoadoutSyncTick: 19,
      policyStalledStyle: "ranged",
      policyStalledStyleTicks: 7,
      queuedSpellId: "ice-barrage",
      activePrayers: ["protect_from_magic", "augury"],
      autocastSpellId: "blood-barrage",
      specialActive: true,
      gmaul: {
        ...disengageStateBase.actors.opponent.gmaul,
        specialEnergy: 70,
        queuedSpecs: 1,
        timeoutTicks: 4
      }
    }
  }
};
const disengaged = runtimeCombat.resetRuntimePlayerCombatActorPolicyDisengage(disengageState, "opponent").actors.opponent;
assert(
  disengaged.targetId === null &&
    disengaged.lastTargetId === null &&
    disengaged.lastTargetTimeoutTicks === 0 &&
    disengaged.policyOffenceStyle === undefined &&
    disengaged.policyNextLoadoutSyncTick === 0 &&
    disengaged.policyStalledStyle === null &&
    disengaged.policyStalledStyleTicks === 0 &&
    disengaged.queuedSpellId === null &&
    disengaged.activePrayers.length === 0 &&
    disengaged.autocastSpellId === "blood-barrage" &&
    disengaged.specialActive === true &&
    disengaged.gmaul.queuedSpecs === 1 &&
    disengaged.gmaul.specialEnergy === 70,
  `no-target policy disengage should clear Java resetCombatState fields without inventing a full respawn reset: ${JSON.stringify(disengaged)}`
);

assert(viewerSource.includes("issuePlayerAttackCommand"), "RuntimeSceneViewer should have a dedicated player attack command path");
assert(
    viewerSource.includes("manualOpponentObservedLocalAppearanceRef") &&
    viewerSource.includes("manualOpponentLiveLocalAppearanceRef") &&
    viewerSource.includes("manualOpponentObservedLocalAppearanceRef.current = nextLiveLocalAppearance") &&
    viewerSource.includes("manualOpponentLiveLocalAppearanceRef.current = nextLiveLocalAppearance") &&
    viewerSource.includes("manualOpponentLiveLocalAppearanceRef.current = unknown") &&
    viewerSource.includes("lastManualOpponentPolicyObservedLocalTile") &&
    !viewerSource.includes("promoteCurrentLocalAppearance") &&
    viewerSource.includes("const observedLocalAppearance = delayedLocalAppearance") &&
    viewerSource.includes("const policyObservedLocalInfoDelayTicks: 0 | 1 = 1") &&
    viewerSource.includes("viewport.dataset.lastManualOpponentPolicyClientPositionDelayTicks = String(response.policyObservedLocalInfoDelayTicks)") &&
    viewerSource.includes("tile: observedLocalAppearance.tile") &&
    viewerSource.includes("policyObservedLocalLoadoutId") &&
    viewerSource.includes("policyActualLocalLoadoutId") &&
    viewerSource.includes("viewport.dataset.lastManualOpponentPolicyClientAppearanceDelayTicks = String(response.policyObservedLocalInfoDelayTicks)") &&
    viewerSource.includes("loadoutId: observedLocalAppearance.loadoutId") &&
    viewerSource.includes("equipment: observedLocalAppearance.equipment") &&
    nhStakerBotSource.includes("private long opponentInfoVisibleTick(Player opponent, long tick)") &&
    nhStakerBotSource.includes("return switchTick == tick || attackSignalTick == tick ? tick : Math.max(0L, tick - 1L);") &&
    runtimePolicyOpponentSource.includes("const liveActorCombatStateVisible = policyRole === \"policy-self\";") &&
    runtimePolicyOpponentSource.includes("const spellStyle = observedInfoKnown && liveActorCombatStateVisible") &&
    runtimePolicyOpponentSource.includes("const attackStyle = observedInfoKnown && liveActorCombatStateVisible"),
  "manual opponent policy input should stay one tick delayed on every field; the trainer deliberately does not mirror Java's current-tick weapon-switch/launched-attack promotion, which would let the bot answer a switch with zero reaction latency"
);
assert(
    runtimePolicyOpponentSource.includes("readonly stats?: SimStats") &&
    runtimePolicyOpponentSource.includes("readonly locks?: EntityLockState") &&
    runtimePolicyOpponentSource.includes("readonly movedThisTick?: boolean") &&
    runtimePolicyOpponentSource.includes("stats: observedInfoKnown ? actorView.stats ?? runtimePolicyStats(actor) : runtimePolicyUnknownOpponentInfoStats(actor)") &&
    runtimePolicyOpponentSource.includes("locks: observedInfoKnown ? actorView.locks ?? actor.locks ?? createEntityLockState() : createEntityLockState()") &&
    runtimePolicyOpponentSource.includes("movedThisTick: actorView.movedThisTick ?? false") &&
    runtimePolicyOpponentSource.includes("lastMoveDx: actorView.lastMoveDx ?? 0") &&
    runtimePolicyOpponentSource.includes("lastMoveDy: actorView.lastMoveDy ?? 0") &&
    viewerSource.includes("nhClientVisibleOpponentHp") &&
    viewerSource.includes("nhClientVisibleFreezeTicks") &&
    viewerSource.includes("runtimePolicyVisibleStatsFromCombatActor") &&
    viewerSource.includes("runtimePolicyVisibleLocksFromCombatActor") &&
    viewerSource.includes("stats: observedLocalAppearance.stats") &&
    viewerSource.includes("locks: observedLocalAppearance.locks") &&
    viewerSource.includes("movedThisTick: observedLocalAppearance.movedThisTick") &&
    viewerSource.includes("localMovedThisTick || syncedLocal.serverRouteWaypoints.length > 0") &&
    viewerSource.includes("opponentMovedThisTick || syncedOpponent.serverRouteWaypoints.length > 0") &&
    viewerSource.includes("viewport.dataset.lastManualOpponentPolicyClientVitalsDelayTicks = String(response.policyObservedLocalInfoDelayTicks)") &&
    nhStakerBotSource.includes("boolean liveMoving = opponent.getMovement().hasMoved() || !opponent.getMovement().isAtDestination();"),
  "manual opponent policy input should preserve delayed client-visible vitals and mark movement while an authoritative route remains pending"
);
assert(
    nhStakerBotSource.includes("private static final int DELAYED_OPP_INFO_DELAY_TICKS = 1;") &&
    nhStakerBotSource.includes("private static final int DEFENCE_PRAYER_OPP_INFO_DELAY_TICKS = 1;") &&
    nhStakerBotSource.includes("private static final int DEFENCE_PRAYER_VISUAL_APPLY_DELAY_TICKS = 0;") &&
    nhStakerBotSource.includes("private final int x;") &&
    nhStakerBotSource.includes("private final int y;") &&
    nhStakerBotSource.includes("private final int dx;") &&
    nhStakerBotSource.includes("private final int dy;") &&
    nhStakerBotSource.includes("private final int hpEstimate;") &&
    nhStakerBotSource.includes("private final boolean moving;") &&
    nhStakerBotSource.includes("private final boolean frozen;") &&
    nhStakerBotSource.includes("private final int freezeTicksRemaining;") &&
    nhStakerBotSource.includes("int liveX = opponent.getPosition().getX();") &&
    nhStakerBotSource.includes("int liveDx = opponent.getPosition().getX() - opponent.getLastPosition().getX();") &&
    nhStakerBotSource.includes("int visibleHp = clientVisibleOpponentHp(opponent);") &&
    nhStakerBotSource.includes("int visibleFreezeTicks = clientVisibleFreezeTicks(opponent);") &&
    nhStakerBotSource.includes("return player.getPosition().distance(new Position(snapshot.x, snapshot.y, opponent.getHeight()))") &&
    nhStakerBotSource.includes("observedSelfCanMeleeReachThisTick(snapshot)") &&
    nhStakerBotSource.includes("opponentInfoHistory.addLast(live)") &&
    nhStakerBotSource.includes("candidate.isAtLeastTicksOld(tick, DELAYED_OPP_INFO_DELAY_TICKS)") &&
    nhStakerBotSource.includes("delayedInfoFor(opponent).protectionMask") &&
    nhStakerBotSource.includes("return reachableProtectionPrayerFor(opponent, normalized);") &&
    nhStakerBotSource.includes("private Prayer applyResolvedDefencePrayer(Prayer resolved)") &&
    !nhStakerBotSource.includes("queuedDefencePrayer") &&
    nhStakerBotSource.includes("clearDefencePrayerSwitchTracking()") &&
    nhStakerBotSource.includes("PlayerCombat.NH_STAKER_DEFENCE_PRAYER_SWITCH_TICK_KEY") &&
    nhStakerBotSource.includes("player.face(opponent);"),
  "NH staker bot source should use one-tick delayed opponent info without an extra defence-prayer queue delay, and refresh target facing"
);
assert(
  playerCombatSource.includes("private static final int NH_STAKER_DEFENCE_PRAYER_EFFECTIVE_DELAY_TICKS = 1;") &&
    playerCombatSource.includes("nhStakerDefencePrayerSwitchTooFreshForHit(switchTick, hit)") &&
    playerCombatSource.includes("long switchAge = hit.nhStakerAttackTick - switchTick;") &&
    runtimeCombatSource.includes("const runtimePlayerCombatPolicyDefencePrayerEffectiveDelayTicks = 1;") &&
    runtimeCombatSource.includes("attackTick - defender.policyDefencePrayerSwitchTick") &&
    runtimeCombatSource.includes("defencePrayerSwitchAge < runtimePlayerCombatPolicyDefencePrayerEffectiveDelayTicks"),
  "NH staker bot prayer switches should not protect attacks dispatched on the same tick as the switch"
);
assert(
  runtimePolicyOpponentSource.includes("readonly activePrayers?: readonly PrayerId[]") &&
    runtimePolicyOpponentSource.includes("applyRuntimePolicyObservedDefencePrayer(") &&
    runtimePolicyOpponentSource.includes("const runtimePolicyDefencePrayerOpponentInfoDelayTicks = 1;") &&
    runtimePolicyOpponentSource.includes("policyPendingDefencePrayer: null") &&
    runtimePolicyOpponentSource.includes("return runtimePolicyReachableProtectionPrayer(context, requested);") &&
    runtimePolicyOpponentSource.includes("const activePrayers = observedInfoKnown ? actorView.activePrayers ?? actor.activePrayers : []") &&
    viewerSource.includes("activePrayers: observedLocalAppearance.activePrayers") &&
    viewerSource.includes("viewport.dataset.lastManualOpponentPolicyClientPrayerDelayTicks = String(response.policyObservedLocalInfoDelayTicks)") &&
    viewerSource.includes("hudPrayersRef.current = transition.prayers"),
  "manual opponent policy input should pass the selected delayed-or-signal-promoted local prayer snapshot while keeping player state current"
);
assert(
  viewerSource.includes("function manualActorWithCombatActionFacing(") &&
    viewerSource.includes("targetActor: ManualActorState | null = null") &&
    viewerSource.includes("nhTargetOrientationUnits(") &&
    viewerSource.includes("syncManualActorActionSequence(") &&
    viewerSource.includes("opponentAuthoritativeTile") &&
    viewerSource.includes("localAuthoritativeTile"),
  "combat action facing should lock casts/attacks to the visible target actor position instead of only coarse server-tile facing"
);
assert(
  nhStakerBotSource.includes("hasClientSpecControlForSpecialThisTick()") &&
    nhStakerBotSource.includes("weaponShowsSpecialBar(tickStartWeaponId)") &&
    nhStakerBotSource.includes("maybeEquipGraniteMaulForSpec(opponent)") &&
    nhStakerBotSource.includes("maybeEquipVoidwakerForSpec(opponent)") &&
    nhStakerBotSource.includes("maybeEquipVestasLongswordForSpec(opponent)") &&
    nhStakerBotSource.includes("observedSelfCanMeleeSpecReachNextTick(delayedInfoFor(opponent), SpecialWeaponKind.GRANITE_MAUL)") &&
    nhStakerBotSource.includes("observedSelfCanMeleeSpecReachNextTick(delayedInfoFor(opponent), SpecialWeaponKind.VOIDWAKER)") &&
    nhStakerBotSource.includes("observedSelfCanMeleeSpecReachNextTick(delayedInfoFor(opponent), SpecialWeaponKind.VESTAS_LONGSWORD)") &&
    nhStakerBotSource.includes("int stepInLimit = Math.max(1, attackRange) + 2;") &&
    nhPolicyFeaturesSource.includes("hasClientSpecControlForSpecialThisTick()") &&
    nhPolicyFeaturesSource.includes("nhWeaponProfiles[context.self.weaponId].hasVisibleSpecBar") &&
    runtimePolicyOpponentSource.includes("runtimePolicyActionWithAllowedSpecIntent") &&
    runtimePolicyOpponentSource.includes("nhWeaponProfiles[context.self.weaponId].hasVisibleSpecBar") &&
    runtimePolicyOpponentSource.includes("runtimePolicyStyleWeaponCanAttackForSpec(context, action.offenceStyle)") &&
    runtimePolicyOpponentSource.includes("server weapon after switchToStyle(desiredOffence)") &&
    runtimePolicyOpponentSource.includes("canMeleeSpecialStepInReachNextTick(context, specialKind)"),
  "manual opponent policy special intents should use NH tick-start spec-control semantics before equipping gmaul/Voidwaker/VLS"
);
const browserDmmDeployedHardInventoryIds = parseRuntimeInventoryItemIds(
  viewerSource,
  "RUNTIME_DMM_DEPLOYED_HARD_INVENTORY_SLOTS"
);
assert(
  nhStakerLoadoutSource.includes("public static SelectedWeapons prepareDmmDeployedHardBot(Player player)") &&
    nhStakerLoadoutSource.includes("SelectedWeapons selected = applyDmmDeployedHard(player);") &&
    nhStakerLoadoutSource.includes("setupDmmLoadout(player, false, true);") &&
    nhStakerLoadoutSource.includes("private static void setupDmmInventory(Player player, boolean deployedHardInventory)") &&
    nhStakerLoadoutSource.includes("place(player, 12, DMM_MASORI_BODY_F, 1);") &&
    nhStakerLoadoutSource.includes("place(player, 13, DMM_ZARYTE_CROSSBOW, 1);") &&
    nhStakerLoadoutSource.includes("place(player, 17, DRAGONFIRE_SHIELD, 1);") &&
    nhStakerLoadoutSource.includes("place(player, 18, DMM_NOXIOUS_HALBERD, 1);") &&
    nhStakerLoadoutSource.includes("place(player, 21, DMM_VESTAS_LONGSWORD, 1);") &&
    nhStakerLoadoutSource.includes("place(player, 22, DMM_VOIDWAKER, 1);") &&
    nhStakerLoadoutSource.includes("place(player, 23, deployedHardInventory ? MANTA_RAY : GRANITE_MAUL, 1);") &&
    nhStakerLoadoutSource.includes("place(player, 24, DMM_VENGEANCE_TRINKET, 2);") &&
    nhStakerLoadoutSource.includes("place(player, 27, deployedHardInventory ? MANTA_RAY : RunePouch.RUNE_POUCH, 1);") &&
    viewerSource.includes("const RUNTIME_DMM_DEPLOYED_HARD_INVENTORY_SLOTS = normalizeNhInventorySlots([") &&
    viewerSource.includes("{ itemId: 27238, quantity: 1 }") &&
    viewerSource.includes("{ itemId: 26374, quantity: 1 }") &&
    viewerSource.includes("{ itemId: 11283, quantity: 1 }") &&
    viewerSource.includes("{ itemId: 29796, quantity: 1 }") &&
    viewerSource.includes("{ itemId: 22613, quantity: 1 }") &&
    viewerSource.includes("{ itemId: 27690, quantity: 1 }") &&
    browserDmmDeployedHardInventoryIds[23] === 391 &&
    browserDmmDeployedHardInventoryIds[27] === 391 &&
    !browserDmmDeployedHardInventoryIds.includes(12791) &&
    !browserDmmDeployedHardInventoryIds.includes(4153) &&
    viewerSource.includes("if (setupId === \"dmm\" && difficulty === \"deployed-hard\")") &&
    viewerSource.includes("return normalizeNhInventorySlots(RUNTIME_DMM_DEPLOYED_HARD_INVENTORY_SLOTS);"),
  "Java and browser DMM deployed-hard loadouts should use the same deployed inventory surface: VLS/Voidwaker/ZCB/DFS/trinket present, gmaul and rune pouch replaced by mantas"
);
const javaDeployedLegacySurface = {
  offence: parseJavaEnumArray(nhSelfPlayPolicyBridgeSource, "OFFENCE_STYLES"),
  defence: parseJavaEnumArray(nhSelfPlayPolicyBridgeSource, "DEFENCE_PRAYERS"),
  movement: parseJavaEnumArray(nhSelfPlayPolicyBridgeSource, "DEPLOYED_LEGACY_MOVEMENT_INTENTS").map(deployedLegacyMovementName),
  supply: parseJavaEnumArray(nhSelfPlayPolicyBridgeSource, "SUPPLY_INTENTS"),
  extraSupply: parseJavaEnumArray(nhSelfPlayPolicyBridgeSource, "EXTRA_SUPPLY_INTENTS"),
  spec: parseJavaEnumArray(nhSelfPlayPolicyBridgeSource, "SPEC_INTENTS"),
  attack: parseJavaEnumArray(nhSelfPlayPolicyBridgeSource, "ATTACK_INTENTS"),
  equipment: parseJavaEnumArray(nhSelfPlayPolicyBridgeSource, "EQUIPMENT_INTENTS")
};
const dmmDeployedPracticeProperties = parseProperties(serverPracticeDmmDeployedPropertiesSource);
const dmmDeployedPracticePolicyPath = dmmDeployedPracticeProperties.get("kronos.nh.deployed.hard.neural.policy.path") ?? "";
const dmmDeployedPracticePolicyAbsolutePath = resolveConfiguredPath(dmmDeployedPracticePolicyPath, serverProjectRoot);
const dmmDeployedPracticePolicyNormalized = dmmDeployedPracticePolicyPath.replaceAll("\\", "/");
assert(
  existsSync(serverPracticeDmmDeployedPropertiesPath) &&
    dmmDeployedPracticeProperties.get("nh_training_setup") === "dmm" &&
    dmmDeployedPracticeProperties.get("nh_loadout_profile") === "dmm" &&
    dmmDeployedPracticeProperties.get("nh_reward_profile") === "neural_sparse" &&
    dmmDeployedPracticeProperties.get("kronos.nh.deployed.hard.expected.decode") === "dmm_deployed_composite" &&
    dmmDeployedPracticeProperties.get("kronos.nh.dmm.deployed.composite.enabled") === "true" &&
    dmmDeployedPracticeProperties.get("kronos.nh.current.direct.untrained") === "false" &&
    typeof dmmDeployedPracticeProperties.get("kronos.nh.neural.policy.path") === "string" &&
    dmmDeployedPracticeProperties.get("kronos.nh.neural.policy.path").endsWith("/nh-policy-dmm-directmovement-deployed-mimic-headonly-20260620.json") &&
    dmmDeployedPracticeProperties.get("kronos.nh.neural.train.exploration") === "0" &&
    dmmDeployedPracticeProperties.get("kronos.nh.spawn.practice.deployed.hard") === "true" &&
    dmmDeployedPracticeProperties.get("kronos.nh.spawn.practice.deployed.peer") === "false" &&
    dmmDeployedPracticeProperties.get("kronos.nh.spawn.practice.current.direct") === "true" &&
    dmmDeployedPracticePolicyNormalized.endsWith("/.codex-logs/deployed-dmm-hard/nh-neural-policy-dmm-candidate.deployed-20260612.json") &&
    !/directschema|deployed-hard-direct|nh-policy-dmm-deployed-hard/.test(serverPracticeDmmDeployedPropertiesSource) &&
    existsSync(dmmDeployedPracticePolicyAbsolutePath),
  `Java DMM deployed practice profile should launch Riven deployed-composite hard plus trained Solana current-direct practice, and fail closed against directschema drift: ${JSON.stringify({
    propertiesPath: serverPracticeDmmDeployedPropertiesPath,
    trainingSetup: dmmDeployedPracticeProperties.get("nh_training_setup"),
    loadoutProfile: dmmDeployedPracticeProperties.get("nh_loadout_profile"),
    rewardProfile: dmmDeployedPracticeProperties.get("nh_reward_profile"),
    expectedDecode: dmmDeployedPracticeProperties.get("kronos.nh.deployed.hard.expected.decode"),
    compositeEnabled: dmmDeployedPracticeProperties.get("kronos.nh.dmm.deployed.composite.enabled"),
    currentDirectUntrained: dmmDeployedPracticeProperties.get("kronos.nh.current.direct.untrained"),
    currentDirectPolicyPath: dmmDeployedPracticeProperties.get("kronos.nh.neural.policy.path"),
    deployedHardSpawn: dmmDeployedPracticeProperties.get("kronos.nh.spawn.practice.deployed.hard"),
    deployedPeerSpawn: dmmDeployedPracticeProperties.get("kronos.nh.spawn.practice.deployed.peer"),
    currentDirectSpawn: dmmDeployedPracticeProperties.get("kronos.nh.spawn.practice.current.direct"),
    policyPath: dmmDeployedPracticePolicyPath,
    policyExists: existsSync(dmmDeployedPracticePolicyAbsolutePath)
  })}`
);
assertArrayEquals(
  javaDeployedLegacySurface.offence,
  [...nhPolicyBridge.nhOffenceStyles],
  "Java deployed-composite offence styles"
);
assertArrayEquals(
  javaDeployedLegacySurface.defence,
  [...nhPolicyBridge.nhDefencePrayers],
  "Java deployed-composite defence prayers"
);
assertArrayEquals(
  javaDeployedLegacySurface.movement,
  [...nhPolicyBridge.nhDeployedLegacyMovementIntents],
  "Java deployed-composite movement intents"
);
assertArrayEquals(
  javaDeployedLegacySurface.supply,
  [...nhPolicyBridge.nhSupplyIntents],
  "Java deployed-composite supply intents"
);
assertArrayEquals(
  javaDeployedLegacySurface.extraSupply,
  [...nhPolicyBridge.nhExtraSupplyIntents],
  "Java deployed-composite extra supply intents"
);
assertArrayEquals(
  javaDeployedLegacySurface.spec,
  [...nhPolicyBridge.nhLegacySpecIntents],
  "Java deployed-composite legacy spec intents"
);
assertArrayEquals(
  javaDeployedLegacySurface.attack,
  [...nhPolicyBridge.nhAttackIntents],
  "Java deployed-composite attack intents"
);
assertArrayEquals(
  javaDeployedLegacySurface.equipment,
  [...nhPolicyBridge.nhEquipmentIntents],
  "Java deployed-composite equipment intents"
);
const deployedLegacyBaseActionCount =
  javaDeployedLegacySurface.offence.length *
  javaDeployedLegacySurface.defence.length *
  javaDeployedLegacySurface.movement.length *
  javaDeployedLegacySurface.supply.length;
const deployedLegacyExtraBaseActionCount =
  javaDeployedLegacySurface.offence.length *
  javaDeployedLegacySurface.defence.length *
  javaDeployedLegacySurface.movement.length *
  javaDeployedLegacySurface.extraSupply.length;
const deployedLegacyActionCount = deployedLegacyBaseActionCount * javaDeployedLegacySurface.spec.length;
const deployedLegacyPolicyV1ActionCount =
  deployedLegacyActionCount + deployedLegacyExtraBaseActionCount * javaDeployedLegacySurface.spec.length;
const deployedLegacyPolicyActionCount =
  deployedLegacyPolicyV1ActionCount * javaDeployedLegacySurface.attack.length * javaDeployedLegacySurface.equipment.length;
assert(
  deployedLegacyPolicyActionCount === nhPolicyBridge.nhDeployedLegacyPolicyActionCount,
  `Java deployed-composite action count should match TypeScript: ${JSON.stringify({
    java: deployedLegacyPolicyActionCount,
    ts: nhPolicyBridge.nhDeployedLegacyPolicyActionCount
  })}`
);
for (const action of [...new Set([
  0,
  1,
  javaDeployedLegacySurface.supply.length - 1,
  javaDeployedLegacySurface.supply.length,
  deployedLegacyBaseActionCount - 1,
  deployedLegacyBaseActionCount,
  deployedLegacyActionCount - 1,
  deployedLegacyActionCount,
  deployedLegacyPolicyV1ActionCount - 1,
  deployedLegacyPolicyV1ActionCount,
  deployedLegacyPolicyV1ActionCount * javaDeployedLegacySurface.attack.length - 1,
  deployedLegacyPolicyV1ActionCount * javaDeployedLegacySurface.attack.length,
  58871,
  deployedLegacyPolicyActionCount - 1
])]) {
  const javaDecoded = decodeJavaStyleDeployedLegacyAction(action, javaDeployedLegacySurface);
  const tsDecoded = nhPolicyBridge.decodeNhDeployedLegacyPolicyAction(action);
  const projectedTsDecoded = {
    offenceStyle: tsDecoded.offenceStyle,
    defencePrayer: tsDecoded.defencePrayer,
    movementIntent: tsDecoded.movementIntent,
    supplyIntent: tsDecoded.supplyIntent,
    specIntent: tsDecoded.specIntent,
    extendedSupplyAction: tsDecoded.extendedSupplyAction,
    attackIntent: tsDecoded.attackIntent,
    equipmentIntent: tsDecoded.equipmentIntent
  };
  assert(
    JSON.stringify(javaDecoded) === JSON.stringify(projectedTsDecoded),
    `Java deployed-composite decode should match TypeScript for action ${action}: ${JSON.stringify({
      java: javaDecoded,
      ts: projectedTsDecoded
    })}`
  );
}
assert(
  nhStakerSelfPlayManagerSource.includes("private int[] currentPolicyCompatibleInputSizes()") &&
    /NhStakerLoadout\.isDmmProfile\(\)\s*\?\s*new int\[0\]/.test(nhStakerSelfPlayManagerSource) &&
    /DEPLOYED_LEGACY_POLICY_ACTION_COUNT,\s*V14_INPUT_SIZE,\s*V13_INPUT_SIZE/.test(nhStakerSelfPlayManagerSource) &&
    nhStakerSelfPlayManagerSource.includes("DEPLOYED_HARD_EXPECTED_DECODE_PROPERTY") &&
    nhStakerSelfPlayManagerSource.includes("normalizeExpectedDecode") &&
    nhStakerSelfPlayManagerSource.includes("DMM deployed hard decode mismatch") &&
    nhNeuralPolicyModelSource.includes("int... compatibleInputSizes") &&
    !nhNeuralPolicyModelSource.includes("|| inputSize == 92") &&
    !nhNeuralPolicyModelSource.includes("|| inputSize == 90") &&
    botPolicySource.includes("DMM deployed-composite policy produced no legal deployed-legacy rankings; refusing action fallback."),
  "DMM deployed-composite model loading should explicitly allow legacy inputs only on the deployed-hard bridge and fail closed without fallback"
);
assert(
  /private boolean supportsVectorActionLabels\(NhNeuralPolicyModel model\)[\s\S]*?for \(int action : canonicalCombatActions\(\)\)[\s\S]*?for \(int action : canonicalDefenceActions\(\)\)[\s\S]*?for \(int action : canonicalMovementActions\(\)\)[\s\S]*?for \(int action : requiredCurrentMappedSupplyActions\(\)\)/.test(nhStakerSelfPlayManagerSource),
  "current action-vector schema detection must require combat/spec, defence, movement, and supply channel actions before routing a model to the vector controller"
);
assert(
  /allowDeployedLegacyEvGuard:\s*!dmmDeployedCompositeMode/.test(runtimePolicyOpponentSource) &&
    /if\s*\(\s*deployedLegacyMode\s*&&\s*\(options\.allowDeployedLegacyEvGuard\s*\?\?\s*true\)\s*\)/.test(runtimePolicyOpponentSource) &&
    /function runtimePolicyActionWithDelayedPrayerCounter[\s\S]*?if\s*\(\s*runtimePolicyIsDmmActor\(context\.self\)\s*\)\s*\{\s*return action;\s*\}/.test(runtimePolicyOpponentSource) &&
    /if\s*\(\s*deployedLegacy\s*&&\s*!dmmDeployedComposite\s*\)/.test(nhStakerBotSource) &&
    /private OffenceStyle enforceLivePrayerCounter[\s\S]*?if\s*\(\s*NhStakerLoadout\.isDmmProfile\(\)\s*&&\s*getPolicyControlMode\(\)\s*!=\s*PolicyControlMode\.SCRIPTED\s*\)\s*\{\s*return desiredStyle;\s*\}/.test(nhStakerBotSource) &&
    /String source = isDmmDeployedCompositeModel\(neuralModel\)\s*\?\s*"selfplay_dmm_deployed_composite"\s*:\s*"selfplay_deployed_legacy";/.test(nhStakerSelfPlayManagerSource) &&
    /private boolean isDmmDeployedCompositeDecision\(CombatDecision decision\)\s*\{\s*return decision != null && decision\.controllerKind\.isDmmDeployedComposite\(\);\s*\}/.test(nhStakerBotSource),
  "DMM deployed-composite execution should bypass old deployed-legacy EV and live-prayer style overrides using typed controller identity"
);
assert(
  nhStakerSelfPlayManagerSource.includes("setModelInputValue(legacyInput, INPUT_REWARD_DELTA_INDEX") &&
    nhStakerSelfPlayManagerSource.includes("setModelInputValue(legacyInput, INPUT_REWARD_DPS_INDEX") &&
    nhStakerSelfPlayManagerSource.includes("setModelInputValue(legacyInput, INPUT_REWARD_TOTAL_INDEX") &&
    !nhStakerSelfPlayManagerSource.includes("normalizeDmmDeployedCompositeLegacyInputs") &&
    !nhStakerSelfPlayManagerSource.includes("setModelInputValue(input, INPUT_SELF_MOVING_INDEX, 0.0D);") &&
    !nhStakerSelfPlayManagerSource.includes("setModelInputValue(input, INPUT_VISIBLE_STYLE_MISMATCH_RATE_INDEX, 0.0D);") &&
    !nhStakerSelfPlayManagerSource.includes("modelInputValue(input, INPUT_VISIBLE_STYLE_LAST_OUTCOME_INDEX) < 0.0D"),
  "Java DMM deployed-composite input bridge should scale raw Java reward fields to the browser feature range without zeroing browser-live movement/reliability inputs"
);
assert(
  /nhSpecIntentIsLegacyGeneric\(action\.specIntent\)[\s\S]*?deployedLegacyMode[\s\S]*?runtimePolicyBestAvailableSpecialWeaponKind\(context,\s*nhSpecIntentIsDouble\(action\.specIntent\)\)/.test(runtimePolicyOpponentSource) &&
    /const specialKind = deployedLegacyMode\s*\?\s*runtimePolicyBestAvailableSpecialWeaponKind\(context,\s*doubleSpec\)/.test(runtimePolicyOpponentSource) &&
    /if\s*\(specIntent == SpecIntent\.USE_SPECIAL \|\| specIntent == SpecIntent\.USE_SPECIAL_DOUBLE\)\s*\{\s*return bestAvailableSpecialWeaponKind\(opponent,\s*specIntent == SpecIntent\.USE_SPECIAL_DOUBLE\);/.test(nhStakerBotSource),
  "DMM deployed-composite generic special intents should resolve through the best legal deployed-era special weapon on both browser and Java"
);
assert(
  /if\s*\(\s*deployedLegacyMode\s*&&\s*supplyResult\.consumed\.length === 0\s*\)\s*\{\s*state = runtimePolicyMaybeActivateVengeanceTrinket/.test(runtimePolicyOpponentSource) &&
    /if\s*\(!supplyConsumed\s*&&\s*isDeployedLegacyDecision\(decision\)\)\s*\{\s*maybeActivateVengeanceTrinket\(opponent\);/.test(nhStakerBotSource) &&
    /if\s*\(supplyIntent === "vengeance_trinket"\)\s*\{\s*const activated = activateRuntimePlayerCombatVengeanceTrinket/.test(runtimePolicyOpponentSource) &&
    /if\s*\(player\.vengeanceTrinketCasts >= DMM_VENGEANCE_TRINKET_MAX_CASTS\)\s*\{\s*removeRemainingVengeanceTrinkets\(\);/.test(nhStakerBotSource),
  "DMM deployed-composite vengeance trinket behavior should match browser legacy mode: explicit supply action first, then capped auto-trinket only when no supply was consumed"
);
let capturedDelayedAppearanceContext = null;
const delayedAppearanceController = {
  id: "test-policy-delayed-local-appearance",
  chooseAction: (context) => {
    capturedDelayedAppearanceContext = context;
    return {
      offenceStyle: "ranged",
      defencePrayer: "protect_from_magic",
      movementIntent: "pressure",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false
    };
  }
};
const priorLocalAppearanceState = createState(137, {
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
const currentServerAppearanceState = runtimeCombat.setRuntimePlayerCombatLoadout(
  priorLocalAppearanceState,
  "local-player",
  "kodai-robes"
);
runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: currentServerAppearanceState,
  controller: delayedAppearanceController,
  localActor: {
    tile: currentServerAppearanceState.actors["local-player"].tile,
    loadoutId: priorLocalAppearanceState.actors["local-player"].loadoutId,
    equipment: priorLocalAppearanceState.actors["local-player"].equipment
  },
  opponentActor: {
    tile: currentServerAppearanceState.actors.opponent.tile,
    loadoutId: currentServerAppearanceState.actors.opponent.loadoutId
  }
});
assert(
  capturedDelayedAppearanceContext?.opponent.loadoutId === "acb-hides" &&
    capturedDelayedAppearanceContext?.opponent.weaponId === "dragon_crossbow",
  `manual opponent policy context should honor the delayed client-visible local weapon, not the current server-applied loadout: ${JSON.stringify({
    observedLoadout: capturedDelayedAppearanceContext?.opponent.loadoutId,
    observedWeapon: capturedDelayedAppearanceContext?.opponent.weaponId,
    currentServerLoadout: currentServerAppearanceState.actors["local-player"].loadoutId
  })}`
);
let capturedDelayedPositionContext = null;
const delayedPositionController = {
  id: "test-policy-delayed-local-position",
  chooseAction: (context) => {
    capturedDelayedPositionContext = context;
    return {
      offenceStyle: "melee",
      defencePrayer: "protect_from_magic",
      movementIntent: "pressure",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false
    };
  }
};
const currentServerPositionState = createState(136, {
  localTile: { x: 1, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "gmaul-bandos"
});
runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: currentServerPositionState,
  controller: delayedPositionController,
  localActor: {
    tile: { x: 3, z: 0 },
    loadoutId: currentServerPositionState.actors["local-player"].loadoutId,
    equipment: currentServerPositionState.actors["local-player"].equipment
  },
  opponentActor: {
    tile: currentServerPositionState.actors.opponent.tile,
    loadoutId: currentServerPositionState.actors.opponent.loadoutId
  }
});
assert(
  capturedDelayedPositionContext?.opponent.tile.x === 3 &&
    capturedDelayedPositionContext?.self.tile.x === 0 &&
    capturedDelayedPositionContext?.meleeReachable === false,
  `manual opponent policy context should honor the delayed client-visible local tile, not the current server-applied tile that just stepped into range: ${JSON.stringify({
    observedTile: capturedDelayedPositionContext?.opponent.tile,
    botTile: capturedDelayedPositionContext?.self.tile,
    meleeReachable: capturedDelayedPositionContext?.meleeReachable,
    currentServerTile: currentServerPositionState.actors["local-player"].tile
  })}`
);
const currentServerSteppedOutPositionState = createState(135, {
  localTile: { x: 3, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "gmaul-bandos"
});
runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: currentServerSteppedOutPositionState,
  controller: delayedPositionController,
  localActor: {
    tile: { x: 1, z: 0 },
    loadoutId: currentServerSteppedOutPositionState.actors["local-player"].loadoutId,
    equipment: currentServerSteppedOutPositionState.actors["local-player"].equipment
  },
  opponentActor: {
    tile: currentServerSteppedOutPositionState.actors.opponent.tile,
    loadoutId: currentServerSteppedOutPositionState.actors.opponent.loadoutId
  }
});
assert(
  capturedDelayedPositionContext?.opponent.tile.x === 1 &&
    capturedDelayedPositionContext?.self.tile.x === 0 &&
    capturedDelayedPositionContext?.meleeReachable === true,
  `manual opponent policy context should not have foresight when the local player just stepped out of Gmaul range: ${JSON.stringify({
    observedTile: capturedDelayedPositionContext?.opponent.tile,
    botTile: capturedDelayedPositionContext?.self.tile,
    meleeReachable: capturedDelayedPositionContext?.meleeReachable,
    currentServerTile: currentServerSteppedOutPositionState.actors["local-player"].tile
  })}`
);
let capturedDelayedPrayerContext = null;
const delayedPrayerController = {
  id: "test-policy-delayed-local-prayer",
  chooseAction: (context) => {
    capturedDelayedPrayerContext = context;
    return {
      offenceStyle: "ranged",
      defencePrayer: "protect_from_magic",
      movementIntent: "pressure",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false
    };
  }
};
const priorLocalPrayerState = createState(138, {
  localPrayers: ["protect_from_missiles"],
  opponentLoadoutId: "kodai-robes"
});
const currentServerPrayerState = runtimeCombat.setRuntimePlayerCombatPrayers(
  priorLocalPrayerState,
  "local-player",
  ["protect_from_magic"]
);
runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: currentServerPrayerState,
  controller: delayedPrayerController,
  localActor: {
    tile: currentServerPrayerState.actors["local-player"].tile,
    loadoutId: currentServerPrayerState.actors["local-player"].loadoutId,
    equipment: currentServerPrayerState.actors["local-player"].equipment,
    activePrayers: priorLocalPrayerState.actors["local-player"].activePrayers
  },
  opponentActor: {
    tile: currentServerPrayerState.actors.opponent.tile,
    loadoutId: currentServerPrayerState.actors.opponent.loadoutId
  }
});
assert(
  capturedDelayedPrayerContext?.opponent.activePrayers.includes("protect_from_missiles") &&
    !capturedDelayedPrayerContext?.opponent.activePrayers.includes("protect_from_magic"),
  `manual opponent policy context should honor the delayed client-visible local prayer, not the current server-applied prayer: ${JSON.stringify({
    observedPrayers: capturedDelayedPrayerContext?.opponent.activePrayers,
    currentServerPrayers: currentServerPrayerState.actors["local-player"].activePrayers
  })}`
);
const prayerApplyDelayController = {
  id: "test-policy-defence-prayer-apply-delay",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const prayerRequestedMissilesController = {
  id: "test-policy-defence-prayer-requested-missiles",
  chooseAction: () => ({
    offenceStyle: "magic",
    defencePrayer: "protect_from_missiles",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
let requestedMissilesState = createState(145, {
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides",
  opponentPrayers: ["protect_from_melee"]
});
let requestedMissilesResult = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: requestedMissilesState,
  controller: prayerRequestedMissilesController,
  localActor: {
    tile: requestedMissilesState.actors["local-player"].tile,
    loadoutId: requestedMissilesState.actors["local-player"].loadoutId,
    equipment: requestedMissilesState.actors["local-player"].equipment
  },
  opponentActor: {
    tile: requestedMissilesState.actors.opponent.tile,
    loadoutId: requestedMissilesState.actors.opponent.loadoutId
  }
});
assert(
  requestedMissilesResult.state.actors.opponent.activePrayers.includes("protect_from_missiles") &&
    requestedMissilesResult.state.actors.opponent.policyPendingDefencePrayer === null,
  `normal model-selected ranged prayer should apply from the delayed observation without a pending queue: ${JSON.stringify({
    activePrayers: requestedMissilesResult.state.actors.opponent.activePrayers,
    pending: requestedMissilesResult.state.actors.opponent.policyPendingDefencePrayer
  })}`
);
const delayedMagicThreatEvent = {
  kind: "attack",
  tick: 101,
  attackerId: "local-player",
  defenderId: "opponent",
  style: "magic"
};
const delayedMagicThreatFollowupEvent = {
  ...delayedMagicThreatEvent,
  tick: 103
};
const delayedMagicThreatEvents = [delayedMagicThreatEvent, delayedMagicThreatFollowupEvent];
let prayerApplyDelayState = {
  ...createState(141, {
    localLoadoutId: "kodai-robes",
    opponentLoadoutId: "acb-hides",
    opponentPrayers: ["protect_from_missiles"]
  }),
  tick: 104,
  events: delayedMagicThreatEvents
};
let prayerApplyDelayResult = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: prayerApplyDelayState,
  controller: prayerApplyDelayController,
  localActor: {
    tile: prayerApplyDelayState.actors["local-player"].tile,
    loadoutId: prayerApplyDelayState.actors["local-player"].loadoutId,
    equipment: prayerApplyDelayState.actors["local-player"].equipment
  },
  opponentActor: {
    tile: prayerApplyDelayState.actors.opponent.tile,
    loadoutId: prayerApplyDelayState.actors.opponent.loadoutId
  }
});
assert(
  prayerApplyDelayResult.state.actors.opponent.activePrayers.includes("protect_from_magic") &&
    !prayerApplyDelayResult.state.actors.opponent.activePrayers.includes("protect_from_missiles") &&
    prayerApplyDelayResult.state.actors.opponent.policyPendingDefencePrayer === null,
  `defence prayer request should apply immediately from delayed opponent info without an extra queue delay: ${JSON.stringify({
    activePrayers: prayerApplyDelayResult.state.actors.opponent.activePrayers,
    pending: prayerApplyDelayResult.state.actors.opponent.policyPendingDefencePrayer,
    pendingTick: prayerApplyDelayResult.state.actors.opponent.policyPendingDefencePrayerTick
  })}`
);
let sameTickReactionState = null;
let sameTickReactionHit = null;
for (let seed = 1600; seed < 1900; seed += 1) {
  let candidate = createState(seed, {
    localLoadoutId: "kodai-robes",
    opponentLoadoutId: "acb-hides",
    opponentPrayers: ["protect_from_missiles"]
  });
  candidate = requestLocalSpell(candidate);
  const policyResult = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
    state: candidate,
    controller: prayerApplyDelayController,
    localActor: {
      tile: candidate.actors["local-player"].tile,
      loadoutId: candidate.actors["local-player"].loadoutId,
      equipment: candidate.actors["local-player"].equipment
    },
    opponentActor: {
      tile: candidate.actors.opponent.tile,
      loadoutId: candidate.actors.opponent.loadoutId
    }
  });
  assert(
    policyResult.state.actors.opponent.activePrayers.includes("protect_from_magic") &&
      policyResult.state.actors.opponent.policyDefencePrayerSwitchTick === policyResult.state.tick,
    `same-tick defence prayer reaction may switch visually, but the switch tick must be recorded for hit protection: ${JSON.stringify({
      activePrayers: policyResult.state.actors.opponent.activePrayers,
      switchTick: policyResult.state.actors.opponent.policyDefencePrayerSwitchTick,
      pending: policyResult.state.actors.opponent.policyPendingDefencePrayer,
      pendingTick: policyResult.state.actors.opponent.policyPendingDefencePrayerTick
    })}`
  );
  const advanced = advance(policyResult.state);
  const hit = advanced.state.queuedHits.find((queuedHit) => queuedHit.attackerId === "local-player");
  if (hit && hit.rawDamage > 0) {
    sameTickReactionState = advanced.state;
    sameTickReactionHit = hit;
    break;
  }
}
assert(sameTickReactionState && sameTickReactionHit, "same-tick prayer reaction verifier should find a positive magic queued hit");
assert(
  sameTickReactionHit.damage === sameTickReactionHit.rawDamage,
  `bot prayer queued on the same tick as a player magic attack should not protect that attack: ${JSON.stringify({
    damage: sameTickReactionHit.damage,
    rawDamage: sameTickReactionHit.rawDamage,
    defenderPrayers: sameTickReactionState.actors.opponent.activePrayers,
    attackTick: sameTickReactionHit.attackTick
  })}`
);
let capturedDelayedVitalsContext = null;
const delayedVitalsController = {
  id: "test-policy-delayed-local-vitals",
  chooseAction: (context) => {
    capturedDelayedVitalsContext = context;
    return {
      offenceStyle: "ranged",
      defencePrayer: "protect_from_magic",
      movementIntent: "pressure",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false
    };
  }
};
const delayedObservedStats = {
  attack: { current: 99, fixed: 99 },
  strength: { current: 99, fixed: 99 },
  defence: { current: 99, fixed: 99 },
  ranged: { current: 99, fixed: 99 },
  magic: { current: 99, fixed: 99 },
  hitpoints: { current: 80, fixed: 99 },
  prayer: { current: 99, fixed: 99 }
};
const delayedObservedLocks = entityLocks.createEntityLockState();
let currentServerVitalsState = createState(139, {
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
currentServerVitalsState = {
  ...currentServerVitalsState,
  actors: {
    ...currentServerVitalsState.actors,
    "local-player": {
      ...currentServerVitalsState.actors["local-player"],
      hitpoints: 25,
      locks: entityLocks.applyFreeze(
        currentServerVitalsState.actors["local-player"].locks,
        currentServerVitalsState.tick,
        20,
        "opponent"
      )
    }
  }
};
runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: currentServerVitalsState,
  controller: delayedVitalsController,
  localActor: {
    tile: currentServerVitalsState.actors["local-player"].tile,
    loadoutId: currentServerVitalsState.actors["local-player"].loadoutId,
    equipment: currentServerVitalsState.actors["local-player"].equipment,
    activePrayers: currentServerVitalsState.actors["local-player"].activePrayers,
    stats: delayedObservedStats,
    locks: delayedObservedLocks,
    movedThisTick: true,
    lastMoveDx: 1,
    lastMoveDy: -1
  },
  opponentActor: {
    tile: currentServerVitalsState.actors.opponent.tile,
    loadoutId: currentServerVitalsState.actors.opponent.loadoutId
  }
});
assert(
  capturedDelayedVitalsContext?.opponent.stats.hitpoints.current === 80 &&
    capturedDelayedVitalsContext?.opponent.locks.freezeUntilTick === -1 &&
    capturedDelayedVitalsContext?.opponent.movedThisTick === true &&
    capturedDelayedVitalsContext?.opponent.lastMoveDx === 1 &&
    capturedDelayedVitalsContext?.opponent.lastMoveDy === -1,
  `manual opponent policy context should honor delayed client-visible local HP/freeze/movement instead of current server state: ${JSON.stringify({
    observedHp: capturedDelayedVitalsContext?.opponent.stats.hitpoints.current,
    currentServerHp: currentServerVitalsState.actors["local-player"].hitpoints,
    observedFreezeUntilTick: capturedDelayedVitalsContext?.opponent.locks.freezeUntilTick,
    currentServerFreezeUntilTick: currentServerVitalsState.actors["local-player"].locks.freezeUntilTick,
    observedMoved: capturedDelayedVitalsContext?.opponent.movedThisTick,
    observedLastMoveDx: capturedDelayedVitalsContext?.opponent.lastMoveDx,
    observedLastMoveDy: capturedDelayedVitalsContext?.opponent.lastMoveDy
  })}`
);
const preMovementHitIndex = viewerSource.indexOf("applyRuntimePlayerCombatPreMovementHits(manualCombatStateRef.current");
const manualMovementGateIndex = viewerSource.indexOf("const localBeforeMovement = stopManualActorMovementIfMovementGated");
assert(
  preMovementHitIndex !== -1 &&
    manualMovementGateIndex !== -1 &&
    preMovementHitIndex < manualMovementGateIndex &&
    viewerSource.includes("preMovementHitApplied ||") &&
    runtimeCombatSource.includes("applyRuntimePlayerCombatDueHits(actors, queuedHits, currentTick, input.tileScale)") &&
    runtimeCombatSource.includes("syncRuntimePlayerCombatActorsForPreMovementHits"),
  "manual combat tick should apply due hits/freezes before movement, matching Nh Player.process() processHits-before-movement order"
);
assert(
    viewerSource.includes("const resolveManualOpponentPolicyTick = (combatState: RuntimePlayerCombatState): ManualOpponentPolicyTickGate =>") &&
    viewerSource.includes("const policyTickGate = resolveManualOpponentPolicyTick(combatStateForTick)") &&
    viewerSource.includes("combatStateForTick = policyTickGate.combatState") &&
    viewerSource.includes("const acceptedClientCycle = nhAcceptedPlayerUpdateClientCycle(") &&
    viewerSource.includes("if (policyTickGate.shouldRun)") &&
    viewerSource.includes("policyResponse = queueManualOpponentCombatResponse(") &&
    viewerSource.includes("combatStateForTick,\n            local,\n            opponent,") &&
    viewerSource.includes("opponentPolicySelfMovement,\n            acceptedClientCycle") &&
    viewerSource.includes("applyManualOpponentPolicyActorResult(opponentActor, result, acceptedClientCycle)") &&
    viewerSource.includes("lastMovementClientCycle: acceptedClientCycle") &&
    viewerSource.includes("const result = advanceRuntimePlayerCombat(combatStateForTick, {") &&
    viewerSource.includes('viewport.dataset.lastManualOpponentPolicyTickSource = "manual-combat-game-tick"') &&
    viewerSource.includes("manualOpponentFightEngagedRef") &&
    viewerSource.includes("manualOpponentTargetTrackingRef") &&
    viewerSource.includes("setManualOpponentFightEngaged(true") &&
    viewerSource.includes("manualOpponentFightEngagedRef.current = false") &&
    viewerSource.includes("resolveRuntimePolicyTargetTracking({") &&
    viewerSource.includes("runtimePolicyRecentManualCombatSignal(combatState)") &&
    viewerSource.includes("resetRuntimePlayerCombatActorPolicyDisengage(nextCombatState, \"opponent\")") &&
    viewerSource.includes("shouldRun: tracking.shouldRunPolicy") &&
    runtimeCombatSource.includes("export function resetRuntimePlayerCombatActorPolicyDisengage") &&
    runtimeCombatSource.includes("NhStakerBot.resetCombatState() clears currentOffence") &&
    nhStakerBotSource.includes("lockedTarget = opponent") &&
    nhStakerBotSource.includes("TARGET_TRACK_DISTANCE") &&
    nhStakerBotSource.includes("NO_TARGET_GRACE_TICKS") &&
    nhStakerBotSource.includes("resetCombatState(player.getCombat().getTarget() != null ? \"cant_attack\" : \"no_target\")") &&
    nhStakerBotSource.includes("player.getPrayer().deactivateAll();") &&
    nhStakerBotSource.includes("player.getCombat().reset();") &&
    nhStakerBotSource.includes("engagementLockUntilTick = tick + ENGAGEMENT_STICKY_TICKS") &&
    nhStakerBotSource.includes("return lockedTarget"),
  "manual viewport opponent should keep the NH policy engaged once combat starts, matching Nh locked-target behavior instead of waiting for another player hit"
);
assert(
  appSource.includes("<RuntimeSceneViewer") &&
    appSource.includes("policy={loadedPolicy}") &&
    appSource.includes("data-default-policy-loaded") &&
    appSource.includes("parseNhNeuralPolicyJson") &&
    !appSource.includes("parseNhPolicyTsv") &&
    viewerSource.includes("manualOpponentPolicyController") &&
    viewerSource.includes("createNhPolicyController(policy)") &&
    !viewerSource.includes("scriptedNhController") &&
    viewerSource.includes("queueManualOpponentCombatResponse") &&
    viewerSource.includes("applyRuntimeOpponentPolicyAction({") &&
    !viewerSource.includes("selectedPolicyController ?? scriptedNhController") &&
    botPolicySource.includes("produced no allowed action") &&
    !botPolicySource.includes("scriptedNhController.chooseAction(context)") &&
    viewerSource.includes("lastManualOpponentControllerId") &&
    viewerSource.includes("lastManualOpponentConsumedSupplies") &&
    !viewerSource.includes("runtime-auto-retaliate"),
  "manual viewport opponent should consume only the loaded neural controller and should not fall back to scripted policy control"
);
assert(
  viewerSource.includes("isNhPlayerContextMenuEntry(defaultEntry)") &&
    viewerSource.includes("dispatchPlayerContextEntry(defaultEntry") &&
    viewerSource.includes("issuePlayerAttackCommand(entry"),
  "left-click Attack should dispatch combat instead of falling through as a tile command"
);
assert(
  viewerSource.includes("nextNhGameTickAt") &&
    viewerSource.includes("currentNhGameTickAt") &&
    viewerSource.includes("runtimeTickOriginMsRef") &&
    viewerSource.includes("NH_GAME_TICK_CATCH_UP_LIMIT") &&
    viewerSource.includes("manualCombatStateRef.current.tick < targetTick") &&
    viewerSource.includes("const runCombatTick = (): void =>") &&
    viewerSource.includes("window.setTimeout(runCombatTick, nhGameTickDelay(runtimeTickOriginMsRef.current, now))"),
  "manual combat should advance on Nh game-tick boundaries and catch up delayed 600ms ticks instead of stretching time"
);
assert(
  viewerSource.includes('if (entry.action === "attack")') &&
    viewerSource.includes("issuePlayerAttackCommand(entry"),
  "right-click Attack should dispatch combat instead of falling through as a tile command"
);
assert(
  viewerSource.includes("routeManualActorToTarget") &&
    viewerSource.includes("findNhTargetRouteWaypoints") &&
    viewerSource.includes("nhSceneTargetRouteReached") &&
    viewerSource.includes("request.attackRange") &&
    viewerSource.includes("tileScale: NH_TILE_WORLD_UNITS") &&
    runtimeCombatSource.includes("normalizeRuntimeCombatTileScale(tileScale)") &&
    viewerSource.includes("movementGate(combatActor.locks") &&
    viewerSource.includes("lastRuntimeCombatRouteBlockedReason"),
  "manual player Attack routing should use TargetRoute-style range stopping instead of walking onto the target tile"
);
assert(
  viewerSource.includes("manualControl ? manualCombatRenderEvents : activeEvents"),
  "manual mode should feed live combat render events into the existing renderer"
);
assert(
  viewerSource.includes("setRuntimePlayerCombatAttackSet") &&
    viewerSource.includes("toggleRuntimePlayerCombatSpecial") &&
    viewerSource.includes("specialEnergy: combatState.actors[\"local-player\"].gmaul.specialEnergy") &&
    viewerSource.includes("specialActive: combatState.actors[\"local-player\"].specialActive") &&
    viewerSource.includes("attackSet: combatState.actors[\"local-player\"].attackSetIndex") &&
    viewerSource.includes("lastCombatSpecialQueuedGraniteMaulSpecs"),
  "manual combat HUD should source attack-set and special state from runtime PlayerCombat rather than stale HUD-only overrides"
);
assert(
  viewerSource.includes("runtimeManualCombatAuthoritativeHud") &&
    viewerSource.includes("hitpoints: combatHud.hitpoints") &&
    viewerSource.includes("hitpointsMax: combatHud.hitpointsMax") &&
    viewerSource.includes("hitpoints: combatHud.skills?.hitpoints") &&
    viewerSource.includes("runtimeManualCombatAuthoritativeHud(hud, inventorySnapshot.hud)"),
  "manual combat HUD should keep fixed HP orb/status overlays on the same combat actor hitpoints as overhead health bars after stale HUD overrides"
);
assert(
  viewerSource.includes("queueCombatSpecialAfterPendingItemPackets") &&
    viewerSource.includes("kind: \"special\"") &&
    viewerSource.includes("dispatchCombatSpecialAction(packet.specialCommand, \"queued\")") &&
    viewerSource.includes("Player.checkLogout() decodes queued packets before Player.process()") &&
    viewerSource.includes("TabCombat child 36 calls PlayerCombat.toggleSpecial()"),
  "manual combat special packets should wait behind pending inventory equip packets so Gmaul specs resolve against the post-equip weapon"
);
assert(
  hudSource.includes("data-special-usable") &&
    hudSource.includes("drainPercent > 0 && energy < drainPercent ? 12907") &&
    hudSource.includes("textColor = specialActive ? 16776960 : 16"),
  "fixed combat tab special bar should expose source active color and low-energy fill state"
);
assert(
  viewerSource.includes('sequenceName: "idle"') &&
    viewerSource.includes("const [playing, setPlaying] = useState(false);") &&
    viewerSource.includes("const [followLive, setFollowLive] = useState(false);") &&
    viewerSource.includes("const [manualControl, setManualControl] = useState(true);") &&
    viewerSource.includes("runtimeTickOriginMsRef.current = performance.now();"),
  "manual mode should start from idle/ready actors on a fresh tick origin instead of autoplaying the first replay attack tick"
);
assert(
    viewerSource.includes("orientationUnits") &&
    viewerSource.includes("rotationUnits") &&
    viewerSource.includes("nhTargetOrientationUnits") &&
    viewerSource.includes("rotateManualActorTowardNhOrientation") &&
    viewerSource.includes("NH_ACTOR_TURN_ANIMATION_DELAY_TICKS") &&
    viewerSource.includes("nhSequenceIsReadyMovement") &&
    viewerSource.includes('return sequenceName === "idle" || runtimeSequenceIsWeaponReady(sequenceName);') &&
    viewerSource.includes("nhTurnSequenceForReadyMovement(actor.sequenceName, turnTicks, stillTurning)") &&
    viewerSource.includes("Math.trunc(units)") &&
    viewerSource.includes("combatActor.actionStartedAtClientCycle") &&
    viewerSource.includes("manualActorBaseSequenceName(") &&
    viewerSource.includes("nhWeaponRenderSequenceName(") &&
    viewerSource.includes("nhRuntimeSequenceNameForId(sequenceId, actorSequenceDefinitions)") &&
    viewerSource.includes("runtimeSequenceIsMovement(baseSequenceName)") &&
    viewerSource.includes('sequenceMode: actionFrameActive ? "primary" : undefined') &&
    viewerSource.includes('movementAnimationCycle: movementSequenceName ? actor.animationCycle : undefined'),
  "manual combat actors should use Nh orientation/rotation turning and suppress primary-animation idle fallback after source sequence frames end"
);
assert(
  viewerSource.includes("function manualActorWeaponRenderAnimationIndex") &&
    /function manualActorBaseSequenceName[\s\S]*const weaponRenderAnimationIndex = manualActorWeaponRenderAnimationIndex\(sequenceName\);[\s\S]*if \(!loadoutId\)[\s\S]*if \(weaponRenderAnimationIndex !== null\)[\s\S]*return nhWeaponRenderSequenceName\([\s\S]*loadoutId,[\s\S]*weaponRenderAnimationIndex/.test(viewerSource) &&
    /const applyInventoryActorLoadoutMutation[\s\S]*sequenceName: manualActorBaseSequenceName\([\s\S]*sourceActor\.sequenceName,[\s\S]*loadoutId,[\s\S]*nextCombatState\.actors\["local-player"\]\.equipment/.test(viewerSource) &&
    /function manualCombatActorPose[\s\S]*manualActorBaseSequenceName\([\s\S]*manualActorVisibleSequenceName\(actor\),[\s\S]*combatActor\.loadoutId,[\s\S]*combatActor\.equipment/.test(viewerSource),
  "manual actor base sequence should remap stale weapon-ready/movement poses through the current weapon loadout after equipment switches"
);
assert(
  /function runtimeWeaponLoadoutForItemId[\s\S]*itemId === 22647[\s\S]*return "kodai-robes"/.test(viewerSource) &&
    /function runtimeWeaponLoadoutForItemId[\s\S]*itemId === 26374[\s\S]*return "acb-hides"/.test(viewerSource) &&
    /function runtimeWeaponLoadoutForItemId[\s\S]*itemId === 22613 \|\| itemId === 27690[\s\S]*return "tentacle-bandos"/.test(viewerSource) &&
    /function runtimeWeaponLoadoutForItemId[\s\S]*itemId === 29796[\s\S]*return "noxious-halberd"/.test(viewerSource) &&
    viewerSource.includes("const weaponItemId = equipment?.weapon?.itemId ?? nhLoadouts[loadoutId].equipment.weapon?.itemId"),
  "DMM weapon equips should move the actor out of stale Zaryte/crossbow loadout state while deriving the actual stance from the equipped weapon type"
);
assert(
  viewerSource.includes("function runtimeOptionsSoundVolumeForChannel") &&
    viewerSource.includes("readStoredOptionsSoundVolume(") &&
    viewerSource.includes("viewport.dataset.lastRuntimeSoundHtmlVolume") &&
    viewerSource.includes("audio.volume = htmlVolume"),
  "runtime game sounds should use the current options sound slider volume when creating Audio playback"
);
assert(
  hudSource.includes("const sourceX = ((event.clientX - rect.left) / rect.width) * trackRect.width") &&
    hudSource.includes("const sliderRange = Math.max(1, trackRect.width - knobWidth)") &&
    hudSource.includes("normalizeOptionsSoundVolumeFromSliderRatio((sourceX - knobWidth / 2) / sliderRange)") &&
    hudSource.includes("const nhOptionsSoundSliderEndpointSnapRatio = 0.02") &&
    hudSource.includes("ratio <= nhOptionsSoundSliderEndpointSnapRatio") &&
    hudSource.includes("const nhOptionsSoundSliderKnobSpriteId = 1201") &&
    hudSource.includes("data-source-sprite-alias=\"options_slider_knob\"") &&
    hudSource.includes("function nhOptionsSoundToggleKnobRect") &&
    hudSource.includes("function nhOptionsSoundToggleTrackSpriteAliasForStop") &&
    !hudSource.includes("data-slider-active") &&
    !hudSource.includes("function nhOptionsSoundToggleActiveSpriteRect") &&
    !hudSource.includes("nhOptionsSoundToggleFill") &&
    !hudSource.includes("nhOptionsSoundToggleThumb") &&
    hudSource.includes("Math.round(Math.max(0, Math.min(4, value)) * 100) / 100") &&
    hudSource.includes("applyPointerVolume(event, false)") &&
    viewerSource.includes("return normalizeStoredOptionsSoundVolume(channel === \"sound-effects\" ? current.soundEffects : current.areaSounds)") &&
    viewerSource.includes("function runtimeOptionsHtmlVolumeFromOptionsVolume") &&
    viewerSource.includes("ratio * ratio * (3 - 2 * ratio)") &&
    viewerSource.includes("command.previewSound !== false"),
  "options sound sliders should preserve continuous decimal volume, move the source knob sprite instead of cropped track UI, snap endpoints to mute/full, use a quiet-low-end audio curve, and suppress drag preview spam"
);
assert(
  viewerSource.includes("RUNTIME_ONYX_BOLT_PROC_VOLUME_SCALE = 0.2") &&
    viewerSource.includes("event.boltEffect?.id === \"onyx\"") &&
    viewerSource.includes("soundId === RUNTIME_ONYX_BOLT_PROC_SOUND_ID") &&
    viewerSource.includes("scale *= RUNTIME_ONYX_BOLT_PROC_VOLUME_SCALE"),
  "runtime should lower only the onyx bolt proc sound volume by default"
);
assert(
  viewerSource.includes("function runtimeCombatEventSoundVolumeScale") &&
    viewerSource.includes("channel === \"sound-effects\"") &&
    viewerSource.includes("actorId !== \"local-player\"") &&
    viewerSource.includes("return 0") &&
    viewerSource.includes("runtimeAreaSoundVolumeScale("),
  "runtime should keep Kronos private sound-effect semantics for remote consumables while area sounds use positional scaling"
);
assert(
  viewerSource.includes("const opponentLoadoutId = setup.loadoutId") &&
    viewerSource.includes("const opponentInventorySlots = runtimeSetupInventorySlots(setupId, runtimeDmmSetupOptionsRef.current)") &&
    viewerSource.includes("const opponentEquipmentItems = runtimeSetupEquipmentItems(setupId)") &&
    viewerSource.includes("opponentLoadoutId,") &&
    viewerSource.includes("viewport.dataset.lastFreshFightResetOpponentSetup = setupId"),
  "DMM rematch reset should respawn the opponent with the active setup preset instead of hardcoding NH stake"
);
assert(
  runtimeCombatSource.includes("actionSequenceName: \"vengeance_cast\"") &&
    runtimeCombatSource.includes("const runtimePlayerCombatVengeanceAnimationTicks = 6") &&
    runtimeCombatSource.includes("lastVengeanceTrinketCastTick: state.tick") &&
    runtimeCombatSource.includes("vengeanceTrinketCasts: actor.vengeanceTrinketCasts + 1") &&
    trinketOfVengeanceSource.includes("player.vengeanceActive = true;") &&
    trinketOfVengeanceSource.includes("Config.VENG_COOLDOWN.set(player, 1);") &&
    trinketOfVengeanceSource.includes("item.remove(1);") &&
    !trinketOfVengeanceSource.includes("player.resetActions(") &&
    !viewerSource.includes("activeSequence.sequenceName === RUNTIME_VENGEANCE_CAST_SEQUENCE_NAME"),
  "vengeance trinket activation should preserve its effect, cooldown, charge use, and cast animation without resetting Java actions or blocking browser movement"
);

const vengeanceAttackReadyState = requestLocalAttack(
  createState(0x56454e47, { localVengeanceTrinketCharges: 1 })
);
const vengeanceAttackReadyActor = vengeanceAttackReadyState.actors["local-player"];
const vengeanceActivation = runtimeCombat.activateRuntimePlayerCombatVengeanceTrinket(
  vengeanceAttackReadyState,
  "local-player",
  0
);
const vengeanceActivatedActor = vengeanceActivation.state.actors["local-player"];
assert(
  vengeanceActivation.activated &&
    vengeanceActivatedActor.attackTimer === vengeanceAttackReadyActor.attackTimer &&
    vengeanceActivatedActor.targetId === vengeanceAttackReadyActor.targetId &&
    vengeanceActivatedActor.vengeanceActive &&
    vengeanceActivatedActor.vengeanceTrinketCharges === 0 &&
    vengeanceActivatedActor.vengeanceTrinketCasts === 1 &&
    vengeanceActivatedActor.vengeanceCooldownUntilTick === 50,
  "vengeance trinket activation should not change the browser combat attack timer or target"
);
const vengeanceSameTickAttack = advance(vengeanceActivation.state);
assert(
  vengeanceSameTickAttack.state.events.some(
    (event) => event.kind === "attack" && event.attackerId === "local-player" && event.tick === 0
  ),
  "an attack queued before vengeance trinket activation should still launch on the same tick"
);
assert(
  clientActorMovementSource.includes("if(var0.field720 != 0)") &&
    clientActorMovementSource.includes("var11 = var0.orientation - var0.rotation & 2047;") &&
    clientActorMovementSource.includes("++var0.field719;") &&
    clientActorMovementSource.includes("if(var0.readySequence == var0.movementSequence && (var0.field719 > 25 || var14))") &&
    clientActorMovementSource.includes("var0.movementSequence = var0.turnLeftSequence;") &&
    clientActorMovementSource.includes("if(var0.movementSequence == var0.readySequence && (var0.field719 > 25 || var14))") &&
    clientActorMovementSource.includes("var0.movementSequence = var0.turnRightSequence;") &&
    clientPlayerSource.includes("super.turnRightSequence = super.turnLeftSequence;"),
  "Nh client actor turning source no longer matches the trainer's ready-movement turn contract"
);
assert(
    viewerSource.includes("manualActorMovementBlockedByNhSequence") &&
    viewerSource.includes("nhSequencePrecedenceAnimating(sequence) === 0") &&
    viewerSource.includes("nhSequencePriority(sequence) === 0") &&
    viewerSource.includes("nhAdvancePrimarySequenceCursor") &&
    viewerSource.includes("manualActorWithAuthoritativeSequenceCursor") &&
    viewerSource.includes("current.primarySequenceCycle > incoming.primarySequenceCycle") &&
    viewerSource.includes("incomingLooksLikeStaleActorState") &&
    viewerSource.includes("current.completedSequenceKey === incoming.activeSequenceKey") &&
    viewerSource.includes("actor.completedSequenceKey === activeSequenceKey") &&
    viewerSource.includes("Client.vmethod1937() parses player updates before class329.method6315()") &&
    viewerSource.includes("const previousCycle = actor.lastMovementClientCycle ?? animationCycle") &&
    viewerSource.includes("manualActorSequenceStartClientCycle") &&
    viewerSource.includes("const sequenceAcceptedForCycle") &&
    viewerSource.includes("cycle >= activeSequenceStartClientCycle") &&
    !viewerSource.includes("const sequenceJustAccepted =") &&
    viewerSource.includes("slot.currentActionSequenceKey !== actionSequenceKey") &&
    viewerSource.includes("animationCycle = 0") &&
    viewerSource.includes("resolvedPrimaryFrameCursor = { frameIndex: 0, frameCycle: 0 }") &&
    viewerSource.includes("primaryFrameCycle > frameLength") &&
    viewerSource.includes("completedSequenceKey: actor.activeSequenceKey") &&
    viewerSource.includes("movementStallTicks: actor.movementStallTicks + 1") &&
    viewerSource.includes("syncManualActorActionSequence") &&
    viewerSource.includes("sequencePathLengthAtStart: actor.routeWaypoints.length") &&
    viewerSource.includes("snapManualActorToCollision") &&
    viewerSource.includes("renderTile: tile") &&
    viewerSource.includes("expandNhManualRoutePath(startTile, routeSegment, collision)") &&
    viewerSource.includes("setNhManualServerRoutePath(routePath)") &&
    viewerSource.includes("manualActorRouteClientPosition(actor, startTile)") &&
    viewerSource.includes("actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile ?? startTile)") &&
    !viewerSource.includes("actor: advanceManualActorServerRouteTick({") &&
    viewerSource.includes("stopManualActorMovementIfMovementGated") &&
    viewerSource.includes("clearManualActorMovementRoute") &&
    viewerSource.includes('nextCombatState.actors["local-player"].locks') &&
    viewerSource.includes("lastTileCommandBlockedByMovementGate") &&
    viewerSource.includes("advanceManualActorServerRouteTick") &&
    viewerSource.includes("const localHasTargetRoute = manualActorHasActiveCombatTargetRoute") &&
    viewerSource.includes("const opponentHasTargetRoute = manualActorHasActiveCombatTargetRoute") &&
    viewerSource.includes("const acceptedClientCycle = nhAcceptedPlayerUpdateClientCycle(") &&
    viewerSource.includes(": advanceManualActorServerRouteTick(local, acceptedClientCycle)") &&
    viewerSource.includes(": advanceManualActorServerRouteTick(opponent, acceptedClientCycle)") &&
    viewerSource.includes("cancels a later player's queued movement before it can be consumed") &&
    viewerSource.includes("advanceManualActorTargetRouteTick") &&
    viewerSource.includes("actor.running && actor.serverRouteWaypoints.length > 1 ? 2 : 1") &&
    viewerSource.includes("const enqueuedWaypoints = actor.serverRouteWaypoints.slice(0, enqueueCount)") &&
    viewerSource.includes("manualActorHeldClientRouteStartTile") &&
    viewerSource.includes("const heldStartTile = manualActorHeldClientRouteStartTile(actor, startTile, collision)") &&
    viewerSource.includes("return enqueueManualActorClientPathSteps(actor, heldRoutePath, actor.running ? 2 : 1)") &&
    viewerSource.includes("enqueueManualActorClientPathSteps(actor, clientUpdate.routeWaypoints, traversalMode)") &&
    viewerSource.includes("tile: enqueuedWaypoints[enqueuedWaypoints.length - 1] ?? actor.tile") &&
    viewerSource.includes("const traversalMode = sourceTickStepCount > 1 ? 2 : 1") &&
    viewerSource.includes("serverRouteWaypoints") &&
    viewerSource.includes("routeTraversalModes") &&
    viewerSource.includes("lastMovementClientCycle") &&
    viewerSource.includes("deferClientPathUntilServerTick && !preserveClientPath") &&
    viewerSource.includes("acceptedClientCycle") &&
    viewerSource.includes("movementStallTicks: actor.movementStallTicks") &&
    viewerSource.includes("advanceManualActorClientCycle") &&
    viewerSource.includes("nhManualMovementSpeed(currentActor, traversalMode, hasCombatTarget)") &&
    viewerSource.includes("NH_CLIENT_MAX_CYCLES_PER_RENDER_FRAME") &&
    viewerSource.includes("lastMovementClientCycle: targetMovementCycle") &&
    viewerSource.includes("tile: actor.tile") &&
    viewerSource.includes("renderTile: runtimeTileFromNhClientPosition(clientPosition)") &&
    !viewerSource.includes("tile: collision.snapTile(renderTile)") &&
    !viewerSource.includes("tile: nextLogicalTile") &&
    viewerSource.includes("animationFixtures") &&
    viewerSource.includes("manualActorFacingTarget(localActorSource, opponentActorSource)") &&
    viewerSource.includes('lastManualOpponentPolicyTickSource = "deferred-to-game-tick"') &&
    viewerSource.includes("routeManualActorToTarget(input.actor, input.targetActor.tile, profile.attackRange, input.collision, input.now, false)") &&
    !viewerSource.includes("manualActorFacingTarget(clearManualActorRoutes(localActorSource), opponentActorSource)"),
  "manual combat movement should use Nh sequence movement-blocking metadata, route through server-tick path updates, defer opponent policy to the game tick, and avoid target-route visual backtracking"
);
assert(
  consumableSource.includes("player.resetActions(true, player.getMovement().following != null, true)") &&
    viewerSource.includes("const sourceActor = manualControlRef.current") &&
    viewerSource.includes("const consumeActor = sameNhTile(sourceActor.tile, localActor.tile)") &&
    viewerSource.includes("tile: localActor.tile") &&
    viewerSource.includes("logicalClientPosition: manualActorRouteLogicalClientPosition(sourceActor, localActor.tile)") &&
    viewerSource.includes("manualControlRef.current = true;") &&
    viewerSource.includes("const finalConsumableActorSource = equipmentChanged") &&
    viewerSource.includes("loadoutId: nextActorLoadoutId") &&
    viewerSource.includes("appearance: nextActorAppearance ?? finalConsumableSourceActor.appearance") &&
    viewerSource.includes("...finalConsumableActorSource,") &&
    !viewerSource.includes("tile: sourceActor.tile") &&
    !viewerSource.includes("renderTile: localActor.tile"),
  "manual consumable actions should mirror Nh eat/drink reset semantics without snapping the visible actor to the authoritative server tile"
);
assert(
  consumableSource.includes('ItemAction.registerInventory(id, "eat"') &&
    consumableSource.includes('ItemAction.registerInventory(id, "drink"') &&
    consumableSource.includes("player.incrementHp(heal);") &&
    viewerSource.includes("queueInventoryConsumableAction") &&
    viewerSource.includes('if (action.kind === "eat" || action.kind === "drink")') &&
    viewerSource.includes("itemActionQueueRef.current.drainReady(nowMs, NH_GAME_TICK_MS)") &&
    viewerSource.includes("if (manualControlRef.current) {\n        return;\n      }\n      processReadyItemActions();") &&
    viewerSource.includes("runtimeSimStatsFromActorAndHud(localActor, visibleSnapshotRef.current.hud)") &&
    viewerSource.includes("supplyDelays: result.delays") &&
    !viewerSource.includes("previewInventoryConsumableAction(") &&
    !viewerSource.includes("applyInventoryConsumableResult("),
  "manual inventory eat/drink clicks should queue like Nh inventory packets and apply healing/inventory changes only when the next game tick drains the queue"
);
assert(
  /const nextCombatState = resetRuntimePlayerCombatActorTarget\(manualScene\.combatState, "local-player"\);\s+const movementStatus = movementGate\(/.test(viewerSource) &&
    /if \(movementStatus\.blocked\) \{[\s\S]*manualCombatStateRef\.current = nextCombatState;[\s\S]*setManualCombatState\(nextCombatState\);[\s\S]*showClickCross\(position, color\);[\s\S]*lastTileCommandBlockedByMovementGate/.test(viewerSource) &&
    viewerSource.includes("lastTileCommandSource"),
  "manual tile commands should mirror Nh WalkHandler.resetActions before blocked routes and keep the client-side click-cross color"
);
assert(
  viewerSource.includes('activateManualActor({ loadoutId: "kodai-robes", sequenceName: "idle" })') &&
    !viewerSource.includes('activateManualActor({ loadoutId: "kodai-robes", sequenceName: "barrage_cast" })'),
  "manual style switches should change gear only; real attack events should be the only source of barrage cast animations"
);
assert(
  viewerSource.includes("createNhHitsplatRenderState") &&
    viewerSource.includes("combatHit") &&
    viewerSource.includes("createNhHealthBarRenderState") &&
    viewerSource.includes("packetCycle: event.tick * NH_CLIENT_CYCLES_PER_GAME_TICK") &&
    viewerSource.includes("clientCycle,") &&
    viewerSource.includes("latestHealthEventByActor") &&
    viewerSource.includes("slotIndex: event.slotIndex") &&
    viewerSource.includes("nhPrayerOverheadDefinition") &&
    viewerSource.includes("nhSkullOverheadDefinition"),
  "manual combat render events should feed per-hit hitsplats, a single latest health bar, prayer overheads, and skull overheads through the existing renderer"
);
assert(
  (
    viewerSource.includes("reprojectRuntimeOverlaySprites(boundary, visibleSnapshotRef.current)") ||
    viewerSource.includes("reprojectRuntimeOverlaySprites(boundary, frameSnapshot)")
  ) &&
    viewerSource.includes("if (!manualControl) {\n      applySnapshot(") &&
    viewerSource.includes("nhRuntimeOverlayAnchor") &&
    viewerSource.includes("runtimeOverlayViewport(boundary)") &&
    viewerSource.includes("buildRuntimeDomOverlays(") &&
    viewerSource.includes("nhActorOverlayPlacement(") &&
    viewerSource.includes("nhOverlayClientViewportProjection(") &&
    viewerSource.includes("nhRuntimeOverlayClientCameraState(boundary)"),
  "actor overlays should be projected into a 2D screen-space sprite layer through the Nh viewportTempX/Y client-camera path"
);
assert(viewerSource.includes("buildEffectModel"), "RuntimeSceneViewer should use a separate effect model path for projectiles and spotanims");
assert(
  viewerSource.includes("nhClientUnitsToWorldUnits(1)") &&
    !viewerSource.includes("object.scale.multiplyScalar(0.45)") &&
    !viewerSource.includes("object.scale.multiplyScalar(0.55)"),
  "projectiles and spotanims should render at natural cache scale instead of being normalized like players"
);

console.log(JSON.stringify({
  ok: true,
  outOfRangeRouteRequests: outOfRangeResult.routeRequests.length,
  frozenMeleeRouteRequests: frozenMeleeResult.routeRequests.length,
  frozenUnderGmaulRouteRequests: frozenUnderGmaulResult.routeRequests.length,
  meleeQueuedHits: meleeStepResult.state.queuedHits.length,
  magicProjectile: magicAttackEvent?.projectile?.id,
  rangedProjectile: rangedAttackEvent?.projectile?.id,
  opponentQueuedHits: opponentAttackResult.state.queuedHits.length,
  unprotectedDamage,
  protectedDamage,
  sampledMaxes,
  lethalDeathTick: lethalResult.state.actors.opponent.deadUntilTick
}, null, 2));
