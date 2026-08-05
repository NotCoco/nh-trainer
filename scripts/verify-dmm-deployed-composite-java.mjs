#!/usr/bin/env node
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const trainerRoot = path.resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const moduleCache = new Map();
const kronosRoot = path.resolve(trainerRoot, "..");
const serverRoot = path.join(
  kronosRoot,
  "kronos-osrs-184-master",
  "kronos-osrs-184-master",
  "Kronos-master",
  "kronos-server"
);
const serverJavaRoot = path.join(serverRoot, "src", "main", "java");
const nhBotPath = path.join(
  serverJavaRoot,
  "io",
  "ruin",
  "model",
  "entity",
  "player",
  "ai",
  "scripts",
  "NhStakerBot.java"
);
const selfPlayPath = path.join(
  serverJavaRoot,
  "io",
  "ruin",
  "model",
  "entity",
  "player",
  "ai",
  "NhStakerSelfPlayManager.java"
);
const playerCombatPath = path.join(
  serverJavaRoot,
  "io",
  "ruin",
  "model",
  "entity",
  "player",
  "PlayerCombat.java"
);
const entityPath = path.join(
  serverJavaRoot,
  "io",
  "ruin",
  "model",
  "entity",
  "Entity.java"
);
const equipmentPath = path.join(
  serverJavaRoot,
  "io",
  "ruin",
  "model",
  "item",
  "containers",
  "Equipment.java"
);
const targetSpellPath = path.join(
  serverJavaRoot,
  "io",
  "ruin",
  "model",
  "skills",
  "magic",
  "spells",
  "TargetSpell.java"
);
const nhLoadoutPath = path.join(
  serverJavaRoot,
  "io",
  "ruin",
  "model",
  "entity",
  "player",
  "ai",
  "NhStakerLoadout.java"
);
const nhBotLogPath = path.join(
  serverJavaRoot,
  "io",
  "ruin",
  "model",
  "entity",
  "player",
  "ai",
  "NhStakerBotLog.java"
);
const adminInventoryViewerPath = path.join(
  serverJavaRoot,
  "io",
  "ruin",
  "model",
  "entity",
  "player",
  "AdminInventoryViewer.java"
);
const browserPolicyPath = path.join(trainerRoot, "src", "bot", "policy.ts");
const browserRuntimePath = path.join(trainerRoot, "src", "sim", "nh", "runtime-policy-opponent.ts");
const browserViewerPath = path.join(trainerRoot, "src", "ui", "RuntimeSceneViewer.tsx");
const practicePropertiesPath = path.join(serverRoot, "server.practice.dmm.deployed.properties");
const runtimeLogsDir = path.join(serverRoot, "data", "logs", "nhstaker");

const args = new Set(process.argv.slice(2));
const checkRuntimeLog = args.has("--runtime-log") || args.has("--latest-log");
const requireLiveDecisions = args.has("--require-live-decisions");
const explicitLogArg = process.argv.slice(2).find((arg) => arg.startsWith("--log="));
const explicitLogPath = explicitLogArg ? explicitLogArg.slice("--log=".length) : "";

const failures = [];
const passes = [];

function pass(message) {
  passes.push(message);
}

function fail(message) {
  failures.push(message);
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    fail(`Missing or unreadable file: ${file} (${error.message})`);
    return "";
  }
}

function assert(condition, message) {
  if (condition) {
    pass(message);
  } else {
    fail(message);
  }
}

function extractMethod(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) {
    return "";
  }
  const brace = source.indexOf("{", start);
  if (brace < 0) {
    return "";
  }
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    const char = source[i];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  return "";
}

function parseProperties(text) {
  const props = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equals = line.indexOf("=");
    if (equals < 0) {
      continue;
    }
    props.set(line.slice(0, equals).trim(), line.slice(equals + 1).trim());
  }
  return props;
}

function resolveMaybeAbsolute(rawPath, baseDir) {
  if (!rawPath) {
    return "";
  }
  const normalized = rawPath.replaceAll("/", path.sep);
  return path.isAbsolute(normalized) ? normalized : path.resolve(baseDir, normalized);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`Missing or invalid JSON model: ${file} (${error.message})`);
    return null;
  }
}

function countOccurrences(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function loadTsModule(relativePath) {
  return loadAbsoluteModule(path.resolve(trainerRoot, relativePath));
}

function loadAbsoluteModule(sourcePath) {
  const resolved = path.normalize(sourcePath);
  const cached = moduleCache.get(resolved);
  if (cached) {
    return cached.exports;
  }
  if (resolved.endsWith(".json")) {
    const module = { exports: readJson(resolved) };
    moduleCache.set(resolved, module);
    return module.exports;
  }
  const source = fs.readFileSync(resolved, "utf8");
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
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

function parseJavaEnumArray(source, arrayName) {
  const match = source.match(new RegExp(`\\b${arrayName}\\s*=\\s*\\{([\\s\\S]*?)\\};`));
  if (!match) {
    fail(`missing Java enum array ${arrayName}`);
    return [];
  }
  return [...match[1].matchAll(/\.([A-Z0-9_]+)\b/g)].map((entry) => entry[1].toLowerCase());
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
    `${label} matches`
  );
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function decodeJavaStyleDeployedLegacyAction(action, surface) {
  const baseCount = surface.offence.length * surface.defence.length * surface.movement.length * surface.supply.length;
  const extraBaseCount = surface.offence.length * surface.defence.length * surface.movement.length * surface.extraSupply.length;
  const legacyActionCount = baseCount * surface.spec.length;
  const v1ActionCount = legacyActionCount + extraBaseCount * surface.spec.length;
  const policyActionCount = v1ActionCount * surface.attack.length * surface.equipment.length;
  const normalizedAction = clampInt(action, 0, policyActionCount - 1);
  const legacyAction = normalizedAction % v1ActionCount;
  const variantIndex = Math.trunc(normalizedAction / v1ActionCount);
  const attackIndex = variantIndex % surface.attack.length;
  const equipmentIndex = Math.trunc(variantIndex / surface.attack.length) % surface.equipment.length;
  const extendedSupplyAction = legacyAction >= legacyActionCount;
  const baseAction = extendedSupplyAction
    ? (legacyAction - legacyActionCount) % extraBaseCount
    : legacyAction % baseCount;
  const specIndex = extendedSupplyAction
    ? Math.trunc((legacyAction - legacyActionCount) / extraBaseCount)
    : Math.trunc(legacyAction / baseCount);
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

function projectedDeployedAction(action) {
  return {
    offenceStyle: action.offenceStyle,
    defencePrayer: action.defencePrayer,
    movementIntent: action.movementIntent,
    supplyIntent: action.supplyIntent,
    specIntent: action.specIntent,
    extendedSupplyAction: action.extendedSupplyAction,
    attackIntent: action.attackIntent,
    equipmentIntent: action.equipmentIntent
  };
}

function setEquals(actual, expected) {
  return actual.size === expected.length && expected.every((value) => actual.has(value));
}

function protectionPrayerForThreat(threat) {
  if (threat === "MAGIC") {
    return "PROTECT_FROM_MAGIC";
  }
  if (threat === "RANGED") {
    return "PROTECT_FROM_MISSILES";
  }
  if (threat === "MELEE") {
    return "PROTECT_FROM_MELEE";
  }
  return "";
}

function delayedPrayerEvidence(lines) {
  let samples = 0;
  let violations = 0;
  for (const line of lines) {
    const visibleThreat = /\bvisibleThreat=([A-Z_]+)/.exec(line)?.[1];
    const liveThreat = /\bliveThreat=([A-Z_]+)/.exec(line)?.[1];
    const resolved = /\bresolved=([A-Z_]+)/.exec(line)?.[1];
    const expectedVisiblePrayer = protectionPrayerForThreat(visibleThreat);
    const expectedLivePrayer = protectionPrayerForThreat(liveThreat);
    if (
      expectedVisiblePrayer &&
      expectedLivePrayer &&
      expectedVisiblePrayer !== expectedLivePrayer
    ) {
      samples += 1;
      if (resolved !== expectedVisiblePrayer || resolved === expectedLivePrayer) {
        violations += 1;
      }
    }
  }
  return { samples, violations };
}

function latestRuntimeLog() {
  if (explicitLogPath) {
    return explicitLogPath;
  }
  try {
    return fs.readdirSync(runtimeLogsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
      .map((entry) => {
        const file = path.join(runtimeLogsDir, entry.name);
        return { file, mtimeMs: fs.statSync(file).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.file ?? "";
  } catch {
    return "";
  }
}

const nhBot = readText(nhBotPath);
const selfPlay = readText(selfPlayPath);
const playerCombat = readText(playerCombatPath);
const entity = readText(entityPath);
const equipment = readText(equipmentPath);
const targetSpell = readText(targetSpellPath);
const nhLoadout = readText(nhLoadoutPath);
const nhBotLog = readText(nhBotLogPath);
const adminInventoryViewer = readText(adminInventoryViewerPath);
const browserPolicy = readText(browserPolicyPath);
const browserRuntime = readText(browserRuntimePath);
const browserViewer = readText(browserViewerPath);
const practicePropsText = readText(practicePropertiesPath);
const practiceProps = parseProperties(practicePropsText);
const nhPolicyBridge = loadTsModule("src/sim/nh/policy-bridge.ts");

const deployedPathRaw = practiceProps.get("kronos.nh.deployed.hard.neural.policy.path") ?? "";
const deployedModelPath = resolveMaybeAbsolute(deployedPathRaw, serverRoot);
const deployedModel = readJson(deployedModelPath);
const actionIds = deployedModel?.schema?.actionIds;
const currentDirectPathRaw = practiceProps.get("kronos.nh.neural.policy.path") ?? "";
const currentDirectModelPath = resolveMaybeAbsolute(currentDirectPathRaw, serverRoot);
const currentDirectModel = readJson(currentDirectModelPath);

assert(
  practiceProps.get("nh_training_setup") === "dmm" && practiceProps.get("nh_loadout_profile") === "dmm",
  "practice profile is pinned to DMM training/setup loadout"
);
assert(
  practiceProps.get("kronos.nh.deployed.hard.expected.decode") === "dmm_deployed_composite",
  "practice profile requires dmm_deployed_composite decode"
);
assert(
  practiceProps.get("kronos.nh.dmm.deployed.composite.enabled") === "true",
  "practice profile enables DMM deployed-composite decode"
);
assert(
  practiceProps.get("kronos.nh.neural.train.exploration") === "0",
  "practice profile disables exploration for local deployed hard"
);
assert(
  practiceProps.get("kronos.nh.spawn.practice.deployed.hard") === "true" &&
    practiceProps.get("kronos.nh.spawn.practice.current.direct") === "true" &&
    practiceProps.get("kronos.nh.current.direct.untrained") === "false" &&
    currentDirectModel?.schema?.inputSize === 110 &&
    Array.isArray(currentDirectModel?.schema?.actionIds) &&
    currentDirectModel.schema.actionIds.length === 11339,
  "practice profile spawns Riven plus the trained Solana current-direct practice bot"
);
assert(
  selfPlay.includes("CURRENT_DIRECT_UNTRAINED_PROPERTY") &&
    selfPlay.includes("createUntrainedCurrentDirectPolicy()") &&
    selfPlay.includes("NhNeuralPolicyModel.createUntrained(INPUT_SIZE, currentDirectActionIds(), seed)") &&
    selfPlay.includes("canonicalCombatActions().length") &&
    selfPlay.includes("DIRECT_GEAR_ACTION_BASE + i") &&
    selfPlay.includes("current_direct_untrained_model_ready"),
  "current_direct practice can use a fresh in-memory current action-vector model without a checkpoint"
);
assert(
  selfPlay.includes("public static boolean usesCurrentDirectPracticePolicy(Player player)") &&
    selfPlay.includes("PRACTICE_POLICY_ROLE_CURRENT_DIRECT.equals(practicePolicyRole(player))") &&
    selfPlay.includes("public static boolean hasPracticePolicyRole(Player player)"),
  "current-direct practice role is exposed without relying on bot names or UI labels"
);
assert(
  nhBotLog.includes("int at = raw.indexOf('@');") &&
    nhBotLog.includes("String pidOnly = at >= 0 ? raw.substring(0, at) : raw;") &&
    nhBot.includes("startup_diag jvm=\" + NhStakerBotLog.processToken()"),
  "NH logger uses a PID-only process token instead of pid@machine identity"
);
assert(
  adminInventoryViewer.includes("int targetIndex = target.getIndex();") &&
    adminInventoryViewer.includes("String targetName = target.getName();") &&
    adminInventoryViewer.includes("Player currentTarget = World.getPlayer(targetIndex);") &&
    adminInventoryViewer.includes("!targetName.equals(currentTarget.getName())") &&
    !adminInventoryViewer.includes("World.getPlayer(targetUserId, true)"),
  "admin check-inventory tracks spawned AI targets by live player index instead of account user id"
);

assert(deployedModel?.schema?.inputSize === 92, "deployed DMM model has the 92-input browser-deployed surface");
assert(deployedModel?.schema?.actionCount === 21906, "deployed DMM model has the 21906-action browser-deployed surface");
assert(Array.isArray(actionIds) && actionIds.length === 21906, "deployed DMM model carries schema.actionIds for every action");
const deployedMean = deployedModel?.normalization?.mean;
const deployedStd = deployedModel?.normalization?.std;
if (Array.isArray(deployedMean) && Array.isArray(deployedStd)) {
  const constantInputs = deployedStd
    .map((std, index) => (Math.abs(Number(std)) <= 0.0001001 ? { index, mean: Number(deployedMean[index]) } : null))
    .filter(Boolean);
  const constantSummary = constantInputs.map((entry) => `${entry.index}:${entry.mean}`).join(",");
  assert(
    constantSummary.includes("16:0") && constantSummary.includes("27:0") && constantSummary.includes("28:0"),
    "deployed model exposes constant movement input slots that must be clamped for inference"
  );
}
if (Array.isArray(actionIds)) {
  const minAction = Math.min(...actionIds);
  const maxAction = Math.max(...actionIds);
  assert(minAction >= 0 && maxAction < 163350, "deployed DMM model maps only deployed-composite action IDs");
  const javaSurface = {
    offence: parseJavaEnumArray(selfPlay, "OFFENCE_STYLES"),
    defence: parseJavaEnumArray(selfPlay, "DEFENCE_PRAYERS"),
    movement: parseJavaEnumArray(selfPlay, "DEPLOYED_LEGACY_MOVEMENT_INTENTS").map(deployedLegacyMovementName),
    supply: parseJavaEnumArray(selfPlay, "SUPPLY_INTENTS"),
    extraSupply: parseJavaEnumArray(selfPlay, "EXTRA_SUPPLY_INTENTS"),
    spec: parseJavaEnumArray(selfPlay, "SPEC_INTENTS"),
    attack: parseJavaEnumArray(selfPlay, "ATTACK_INTENTS"),
    equipment: parseJavaEnumArray(selfPlay, "EQUIPMENT_INTENTS")
  };
  assertArrayEquals(javaSurface.offence, [...nhPolicyBridge.nhOffenceStyles], "Java/browser deployed offence style order");
  assertArrayEquals(javaSurface.defence, [...nhPolicyBridge.nhDefencePrayers], "Java/browser deployed defence prayer order");
  assertArrayEquals(javaSurface.movement, [...nhPolicyBridge.nhDeployedLegacyMovementIntents], "Java/browser deployed movement order");
  assertArrayEquals(javaSurface.supply, [...nhPolicyBridge.nhSupplyIntents], "Java/browser deployed supply order");
  assertArrayEquals(javaSurface.extraSupply, [...nhPolicyBridge.nhExtraSupplyIntents], "Java/browser deployed extra-supply order");
  assertArrayEquals(javaSurface.spec, [...nhPolicyBridge.nhLegacySpecIntents], "Java/browser deployed spec order");
  assertArrayEquals(javaSurface.attack, [...nhPolicyBridge.nhAttackIntents], "Java/browser deployed attack intent order");
  assertArrayEquals(javaSurface.equipment, [...nhPolicyBridge.nhEquipmentIntents], "Java/browser deployed equipment intent order");

  const seen = {
    offence: new Set(),
    defence: new Set(),
    movement: new Set(),
    supply: new Set(),
    spec: new Set(),
    attack: new Set(),
    equipment: new Set()
  };
  let decodeMismatch = null;
  for (const actionId of actionIds) {
    const javaDecoded = decodeJavaStyleDeployedLegacyAction(actionId, javaSurface);
    const browserDecoded = projectedDeployedAction(nhPolicyBridge.decodeNhDeployedLegacyPolicyAction(actionId));
    if (!decodeMismatch && JSON.stringify(javaDecoded) !== JSON.stringify(browserDecoded)) {
      decodeMismatch = `Java/browser deployed-composite decode mismatch for mapped action ${actionId}: ${JSON.stringify({
        java: javaDecoded,
        browser: browserDecoded
      })}`;
    }
    seen.offence.add(javaDecoded.offenceStyle);
    seen.defence.add(javaDecoded.defencePrayer);
    seen.movement.add(javaDecoded.movementIntent);
    seen.supply.add(javaDecoded.supplyIntent);
    seen.spec.add(javaDecoded.specIntent);
    seen.attack.add(javaDecoded.attackIntent);
    seen.equipment.add(javaDecoded.equipmentIntent);
  }
  if (decodeMismatch) {
    fail(decodeMismatch);
  } else {
    pass(`Java/browser deployed-composite decode matches all ${actionIds.length} mapped model actions`);
  }
  assert(setEquals(seen.offence, [...nhPolicyBridge.nhOffenceStyles]), "deployed model action map exposes every attack style");
  assert(setEquals(seen.defence, [...nhPolicyBridge.nhDefencePrayers]), "deployed model action map exposes every defence prayer");
  assert(setEquals(seen.movement, [...nhPolicyBridge.nhDeployedLegacyMovementIntents]), "deployed model action map exposes every deployed movement intent");
  assert(
    setEquals(seen.supply, [...nhPolicyBridge.nhSupplyIntents, ...nhPolicyBridge.nhExtraSupplyIntents]),
    "deployed model action map exposes normal and extra deployed supply intents"
  );
  assert(setEquals(seen.spec, ["none", "use_special"]), "deployed model action map exposes none and single generic special intents");
  assert(setEquals(seen.attack, [...nhPolicyBridge.nhAttackIntents]), "deployed model action map exposes attack/hold/off-tick intents");
  assert(
    setEquals(seen.equipment, ["style_loadout", "weapon_only", "unequip_head"]),
    "deployed model action map exposes the browser-deployed equipment surface"
  );
}

const contextGuards = extractMethod(nhBot, "private CombatDecision applyContextGuards");
const controllerKindBlock = extractMethod(nhBot, "public enum ControllerKind");
assert(
  controllerKindBlock.includes("DMM_DEPLOYED_COMPOSITE") &&
    controllerKindBlock.includes("CURRENT_DIRECT_ACTION_VECTOR") &&
    controllerKindBlock.includes("CURRENT_MAPPED_COMPOSITE") &&
    controllerKindBlock.includes("isDmmDeployedComposite()") &&
    controllerKindBlock.includes("isCurrentDirect()"),
  "Java combat decisions expose explicit controller kinds for deployed-composite and current-direct"
);
assert(
  nhBot.includes("public final ControllerKind controllerKind;") &&
    nhBot.includes("this.controllerKind = controllerKind == null ? ControllerKind.UNKNOWN : controllerKind;"),
  "Java combat decisions carry controller kind separately from diagnostic source text"
);
assert(
  !controllerKindBlock.includes('source.startsWith("selfplay_dmm_deployed_composite")') &&
    !controllerKindBlock.includes('source.startsWith("selfplay_deployed_legacy")') &&
    !controllerKindBlock.includes('source.startsWith("selfplay_deployed_scalar")') &&
    !controllerKindBlock.includes('source.startsWith("selfplay_neural_vector")') &&
    !controllerKindBlock.includes('source.startsWith("selfplay_current_mapped_vector")'),
  "Java controller kind does not infer deployed/current neural identity from diagnostic source prefixes"
);
assert(contextGuards.includes("boolean dmmDeployedComposite = isDmmDeployedCompositeDecision(decision);"), "Java context guards identify DMM deployed-composite decisions");
assert(contextGuards.includes("if (deployedLegacy && !dmmDeployedComposite)"), "Java EV style override is disabled for DMM deployed-composite");
assert(!/if\s*\(\s*deployedLegacy\s*\)\s*\{[^}]*deployedLegacyClientEvStyle/s.test(contextGuards), "Java has no broad deployed-legacy EV override that catches DMM deployed-composite");
assert(contextGuards.includes("movement = deployedLegacy ? MovementIntent.PRESSURE : MovementIntent.NONE;"), "Java keeps the browser-equivalent deployed stand-under guard");
assert(contextGuards.includes("deployedLegacy && movement == MovementIntent.STEP_OUT"), "Java keeps the browser-equivalent deployed step-out guard");

const runMethod = extractMethod(nhBot, "public boolean run()");
assert(
  runMethod.includes("decision = maybePromoteDmmDeployedCompositeEmergencySupply(opponent, decision, tick);") &&
    runMethod.indexOf("decision = maybePromoteDmmDeployedCompositeEmergencySupply(opponent, decision, tick);") <
      runMethod.indexOf("maybeLogLiveDecision(decision, tick, opponent);"),
  "Java promotes urgent deployed-composite DMM supply before live decision logging and execution"
);
const deployedSupplyGuard = extractMethod(nhBot, "private CombatDecision maybePromoteDmmDeployedCompositeEmergencySupply");
assert(
  deployedSupplyGuard.includes("isDmmDeployedCompositeDecision(decision)") &&
    deployedSupplyGuard.includes("decision.supplyIntent != SupplyIntent.NONE") &&
    deployedSupplyGuard.includes("player.isLocked()") &&
    deployedSupplyGuard.includes("player.isStunned()"),
  "Java deployed-composite DMM supply guard only touches NONE-supply decisions that can legally use supplies"
);
assert(
  deployedSupplyGuard.includes("hp <= 34 || pressure >= 0.72D") &&
    deployedSupplyGuard.includes("hp <= 52 || pressure >= 0.52D") &&
    deployedSupplyGuard.includes("hp <= 66 || pressure >= 0.36D") &&
    deployedSupplyGuard.includes("SupplyIntent.PANIC_FULL") &&
    deployedSupplyGuard.includes("SupplyIntent.DOUBLE_EAT") &&
    deployedSupplyGuard.includes("SupplyIntent.SAFE_EAT") &&
    deployedSupplyGuard.includes("SupplyIntent.BREW_ONLY"),
  "Java deployed-composite DMM supply guard can promote critical HP/risk into real food/brew intents"
);
assert(
  deployedSupplyGuard.includes("dmm_deployed_supply_guard") &&
    deployedSupplyGuard.includes("decision.source + \"|supply_guard=\""),
  "Java deployed-composite DMM supply guard is logged and visible in decision source"
);
const applySupplyIntent = extractMethod(nhBot, "private boolean applySupplyIntent");
const noneSupplyBlock = applySupplyIntent.slice(
  applySupplyIntent.indexOf("if (intent == null || intent == SupplyIntent.NONE)"),
  applySupplyIntent.indexOf("if (player.isLocked() || player.isStunned())")
);
const dmmDeployedDecision = extractMethod(nhBot, "private boolean isDmmDeployedCompositeDecision");
const currentDirectDecision = extractMethod(nhBot, "private boolean isCurrentDirectNeuralDecision");
const deployedLegacyDecision = extractMethod(nhBot, "private boolean isDeployedLegacyDecision");
assert(
  dmmDeployedDecision.includes("decision.controllerKind.isDmmDeployedComposite()") &&
    currentDirectDecision.includes("decision.controllerKind.isCurrentDirect()") &&
    deployedLegacyDecision.includes("decision.controllerKind.isDeployedLegacyFamily()") &&
    !dmmDeployedDecision.includes("source.startsWith") &&
    !currentDirectDecision.includes("source.startsWith") &&
    !deployedLegacyDecision.includes("source.startsWith"),
  "Java helper gates use explicit controller kind instead of source-prefix parsing"
);
assert(
    noneSupplyBlock.includes("allowsPostBrewRecoveryAssist(decision)") &&
    noneSupplyBlock.includes("postBrewRecoveryUntilTick >= tick") &&
    noneSupplyBlock.includes("intent = SupplyIntent.RESTORE_REBOOST") &&
    nhBot.includes("private boolean allowsPostBrewRecoveryAssist(CombatDecision decision)") &&
    nhBot.includes("if (isCurrentDirectNeuralDecision(decision))") &&
    nhBot.includes("return isDmmDeployedCompositeDecision(decision);") &&
    noneSupplyBlock.indexOf("intent = SupplyIntent.RESTORE_REBOOST") <
      noneSupplyBlock.indexOf("NhStakerLoadout.isDmmProfile()"),
  "Java post-brew recovery assist is available to deployed-composite but blocked for current-direct neural decisions"
);
assert(
  nhBot.includes("SANFEW_SERUM4") &&
    nhBot.includes("SANFEW_SERUM4_23559") &&
    applySupplyIntent.includes("usedRestore = drinkRestorePotion();"),
  "Java restore/reboost supply path can consume Sanfew serum through the restore slot"
);
const postBrewRecovery = extractMethod(nhBot, "private boolean needsPostBrewRecovery");
assert(
  postBrewRecovery.includes("|| needsReboostNow();"),
  "Java post-brew recovery stays sticky while Bastion/Super Combat reboost is still needed"
);
const loadoutAddAndEquip = extractMethod(nhLoadout, "private static void addAndEquip");
assert(
  loadoutAddAndEquip.includes("int owned = ownedAmount(player, itemId);") &&
    loadoutAddAndEquip.includes("safeAdd(player, itemId, amount - owned);") &&
    !loadoutAddAndEquip.includes("safeAdd(player, itemId, amount);"),
  "Java DMM loadout equip does not mint duplicate unique gear such as extra Zuriel staffs"
);
assert(
  extractMethod(nhLoadout, "private static int ownedAmount").includes("player.getInventory().getAmount(itemId) + player.getEquipment().getAmount(itemId)"),
  "Java DMM loadout equip counts both inventory and worn equipment before adding gear"
);

const syncMethod = extractMethod(nhBot, "private void trySyncLoadoutFromOpponent");
assert(
  syncMethod.includes("NhStakerSelfPlayManager.usesDmmDeployedHardLoadout(player)") &&
    syncMethod.includes("NhStakerSelfPlayManager.usesCurrentDirectPracticePolicy(player)"),
  "Java deployed-hard and current-direct practice bots cannot sync/copy the opponent loadout"
);
assert(!/NhStakerLoadout\.applyBot\(player,\s*opponent\)/.test(syncMethod.split("usesDmmDeployedHardLoadout(player)")[0] ?? syncMethod), "loadout sync guard runs before applyBot(player, opponent)");
const refreshLoadoutFromSaved = extractMethod(nhBot, "private void refreshLoadoutFromSaved");
assert(
  refreshLoadoutFromSaved.includes("|| isPracticeCombatActive()") &&
    refreshLoadoutFromSaved.includes("if (!preserveFightState)") &&
    refreshLoadoutFromSaved.includes("prepareFreshState(false)") &&
    refreshLoadoutFromSaved.includes("ensureLoadoutIntegrity(\"refresh_\" + reason)") &&
    refreshLoadoutFromSaved.includes("+ \" preserveSupplies=\" + preserveFightState"),
  "practice loadout refresh preserves active fight state instead of restoring special/inventory mid-fight"
);
const ensureLoadoutIntegrity = extractMethod(nhBot, "private void ensureLoadoutIntegrity");
const needsEmergencyRecovery = extractMethod(nhBot, "private boolean needsEmergencyRecovery");
const practiceCombatActive = extractMethod(nhBot, "private boolean isPracticeCombatActive");
assert(
  ensureLoadoutIntegrity.includes("usesCurrentDirectPracticePolicy(player) && isPracticeCombatActive()") &&
    ensureLoadoutIntegrity.includes("integrity_skip_current_direct_active") &&
    needsEmergencyRecovery.includes("usesCurrentDirectPracticePolicy(player) && isPracticeCombatActive()") &&
    practiceCombatActive.includes("hasPracticePolicyRole(player)") &&
    practiceCombatActive.includes("player.getCombat().lastAttacker != null") &&
    practiceCombatActive.includes("player.getCombat().isDefending(12)") &&
    practiceCombatActive.includes("player.getCombat().isAttacking(12)"),
  "current-direct active practice fights do not get runtime recovery/loadout repair that refills special or resets inventory"
);

const modelDefencePrayer = extractMethod(nhBot, "private Prayer resolveModelControlledDefencePrayer");
assert(modelDefencePrayer.includes("return reachableProtectionPrayerFor(opponent, normalized);"), "Java DMM deployed-composite normal defence prayers use the browser-equivalent reachable-threat resolver");
assert(!modelDefencePrayer.includes("return normalized == null ? delayedProtect : normalized;"), "Java DMM deployed-composite does not bypass deployed browser prayer reachability semantics");
const resolveDecisionPrayer = extractMethod(nhBot, "private Prayer resolveDefencePrayer(Player opponent, CombatDecision decision)");
assert(
  resolveDecisionPrayer.includes("if (isCurrentDirectNeuralDecision(decision))") &&
    resolveDecisionPrayer.includes("return decision.defencePrayer;") &&
    resolveDecisionPrayer.indexOf("isCurrentDirectNeuralDecision(decision)") <
      resolveDecisionPrayer.indexOf("isDmmDeployedCompositeDecision(decision)"),
  "current-direct neural prayer resolves to the raw model choice without deployed/browser threat helper routing"
);
const applyResolvedDefencePrayer = extractMethod(nhBot, "private Prayer applyResolvedDefencePrayer(Prayer resolved, boolean strictModelChoice)");
assert(
  nhBot.includes("applyResolvedDefencePrayer(resolvedDefencePrayer, isCurrentDirectNeuralDecision(decision))") &&
    applyResolvedDefencePrayer.includes("strictModelChoice") &&
    applyResolvedDefencePrayer.includes("isDefencePrayerChoice(resolved) ? resolved : null") &&
    applyResolvedDefencePrayer.includes(": sanitizeDefencePrayer(resolved)"),
  "current-direct neural prayer application rejects invalid/null prayers instead of inventing fallback protection"
);
assert(
  selfPlay.includes("NhStakerBot.ControllerKind.CURRENT_DIRECT_ACTION_VECTOR") &&
    selfPlay.includes("NhStakerBot.ControllerKind.DMM_DEPLOYED_COMPOSITE") &&
    selfPlay.includes("NhStakerBot.ControllerKind.CURRENT_MAPPED_COMPOSITE") &&
    nhBot.includes("+ \" controller=\" + decision.controllerKind"),
  "Java practice diagnostics include explicit controller kind for deployed-composite and current-direct decisions"
);

const visibleStyleReliability = extractMethod(playerCombat, "private static void accumulateNhStakerVisibleStyleReliability");
assert(
  visibleStyleReliability.includes("nhStakerStyleCodeFromWeaponId(hit.attacker.player.getEquipment().getId(Equipment.SLOT_WEAPON))"),
  "Java visible-style reliability uses the currently visible weapon style like the browser deployed surface"
);
assert(
  !visibleStyleReliability.includes("sameTickWeaponSwitch") &&
    !visibleStyleReliability.includes("nhStakerAttackerWeaponSwitchFrom"),
  "Java visible-style reliability does not feed same-tick previous-weapon artifacts into deployed-composite inputs"
);

const recoverStyleStall = extractMethod(nhBot, "private OffenceStyle recoverStyleStall");
assert(recoverStyleStall.includes("prepareBotForAssignedPracticeRole(player)"), "style-stall recovery reloads the assigned practice-role loadout");
assert(!recoverStyleStall.includes("NhStakerLoadout.applyBot(player);"), "style-stall recovery does not fall back to generic bot loadout");
assert(
  countOccurrences(nhBot, /prepareBotForAssignedPracticeRole\(player\)/g) >= 4,
  "spawn/respawn/fresh-fight/recovery paths use the assigned practice-role loadout"
);
assert(
  nhBot.includes('BOT_PATCH_VERSION = "nhbot_deployed_composite_role_loadout_v90"'),
  "Java NH bot patch marker identifies the current deployed-composite role/loadout build"
);

assert(
  /private static final int DEFENCE_PRAYER_OPP_INFO_DELAY_TICKS\s*=\s*1\s*;/.test(nhBot),
  "Java deployed bot observes defence-prayer threats from one-tick-old opponent info"
);
assert(
  /private static final int DEFENCE_PRAYER_VISUAL_APPLY_DELAY_TICKS\s*=\s*0\s*;/.test(nhBot),
  "Java applies chosen visual prayer on the decision tick"
);
assert(
  /NH_STAKER_DEFENCE_PRAYER_EFFECTIVE_DELAY_TICKS\s*=\s*1\s*;/.test(playerCombat),
  "combat damage treats same-tick switched protection as not yet effective"
);
assert(
  equipment.includes("recordWeaponSwitch(oldWeaponId, getId(SLOT_WEAPON));") &&
    equipment.includes("PlayerCombat.NH_STAKER_WEAPON_SWITCH_TICK_KEY") &&
    equipment.includes("Server.currentTick()"),
  "Java equipment records real same-tick weapon switches for human and bot actors"
);
const captureLiveOpponentInfo = extractMethod(nhBot, "private OpponentInfoSnapshot captureLiveOpponentInfo");
const opponentInfoVisibleTick = extractMethod(nhBot, "private long opponentInfoVisibleTick");
const configurePracticePolicyRole = extractMethod(selfPlay, "public static void configurePracticePolicyRole");
assert(
  captureLiveOpponentInfo.includes("captureOpponentInfo(opponent, opponentInfoVisibleTick(opponent, tick))"),
  "Java delayed opponent snapshots are timestamped by fair visible-info timing"
);
assert(
  opponentInfoVisibleTick.includes("PlayerCombat.NH_STAKER_WEAPON_SWITCH_TICK_KEY") &&
    opponentInfoVisibleTick.includes("PlayerCombat.NH_STAKER_ATTACK_STYLE_SIGNAL_TICK_KEY") &&
    opponentInfoVisibleTick.includes("return switchTick == tick || attackSignalTick == tick ? tick : Math.max(0L, tick - 1L);"),
  "Java prayer observations reject same-tick weapon switches and same-tick attack-style signals"
);
assert(
  playerCombat.includes("NH_STAKER_ATTACK_STYLE_SIGNAL_TICK_KEY") &&
    playerCombat.includes("player.temp.put(NH_STAKER_ATTACK_STYLE_SIGNAL_TICK_KEY, Server.currentTick())"),
  "Java combat stamps actual attack-style signal ticks for fair next-tick prayer observation"
);
assert(
  configurePracticePolicyRole.includes("bot.temp.remove(NhStakerBot.BOT_COHORT_PATTERN_KEY);"),
  "Java practice policy roles clear stale cohort-pattern controller state"
);
assert(
  extractMethod(nhBot, "private OpponentInfoSnapshot liveInfoFor").includes("return captureCurrentOpponentInfo(opponent, Server.currentTick());"),
  "Java live diagnostics use actual current state, separate from fair delayed snapshots"
);
assert(
  !extractMethod(nhBot, "private void maybeLogLiveDecision").includes("tick % 2L") &&
    !extractMethod(nhBot, "private void maybeLogAppliedDefencePrayer").includes("tick % 2L") &&
    !extractMethod(nhBot, "private void maybeLogLiveAppliedState").includes("tick % 2L"),
  "Java live deployed-composite diagnostics are not throttled to every other tick"
);
assert(
  /player\.face\(opponent\);\s*[\s\S]*player\.attack\(opponent\);\s*[\s\S]*player\.face\(opponent\);/.test(extractMethod(nhBot, "private void attackTarget")),
  "Java attack helper faces the opponent before and after issuing attack"
);
assert(
  entity.includes("public boolean isFacing(Entity target)") &&
    entity.includes("getFacingEntityClientIndex() == target.getClientIndex()"),
  "Java exposes current facing target for NH live-applied diagnostics"
);
assert(
  extractMethod(nhBot, "private void maybeLogLiveAppliedState").includes("facingTarget=") &&
    extractMethod(nhBot, "private void maybeLogLiveAppliedState").includes("facingClient=") &&
    extractMethod(nhBot, "private void maybeLogLiveAppliedState").includes("targetClient="),
  "Java live-applied diagnostics include runtime facing-target evidence"
);
assert(
  /updateLastAttack\([^;]+;\s*recordNhStakerAttackStyleSignal\(\);\s*player\.face\(target\);\s*if\(handleSpecial/.test(extractMethod(playerCombat, "private void attackWithRanged")),
  "Java ranged attacks refresh entity-facing immediately before special/animation/projectile execution"
);
assert(
  /if\(castCheck != null && !castCheck\.test\(entity, target\)\)\s*return false;\s*entity\.face\(target\);\s*entity\.animate/.test(extractMethod(targetSpell, "private boolean cast")),
  "Java target spells refresh entity-facing after cast checks and before animation/projectile execution"
);

assert(
  selfPlay.includes("private boolean isDmmDeployedCompositeModel") &&
    selfPlay.includes("model.inputSize() == V14_INPUT_SIZE") &&
    selfPlay.includes("model.mapsOnlyActionsInRange(0, DEPLOYED_LEGACY_POLICY_ACTION_COUNT)"),
  "Java model classifier recognizes the 92-input deployed-composite surface"
);
assert(
  selfPlay.includes("DMM_DEPLOYED_CONSTANT_INPUT_STD_MAX") &&
    selfPlay.includes("clampDmmDeployedConstantInputsToTrainingSurface") &&
    selfPlay.includes("neuralModel.inputStdAt(index)") &&
    selfPlay.includes("neuralModel.inputMeanAt(index)"),
  "Java deployed-composite adapter clamps tiny-variance legacy inputs to the model training surface"
);
assert(
  selfPlay.includes("? isDeployedLegacyActionAllowed(input, decisionAction)") &&
    selfPlay.includes("deployedCompositeDecodeMode"),
  "Java deployed-composite selector uses deployed-era legality checks before raw model scoring"
);
assert(
  selfPlay.includes("expectedDecode") && selfPlay.includes("DMM deployed hard decode mismatch"),
  "Java model loading fail-closes on expected decode mismatch"
);
assert(
  selfPlay.includes("current_neural_policy_missing deployed_hard_only_allowed=true") &&
    selfPlay.includes("fallback=disabled"),
  "Java deployed-hard-only practice mode logs fallback-disabled behavior"
);

assert(
  browserPolicy.includes("const dmmDeployedCompositePolicy = neuralPolicy &&") &&
    browserPolicy.includes('return selected.decoded;'),
  "browser controller has a deployed-composite decode path returning deployed action semantics"
);
assert(
  browserPolicy.includes("dmmDeployedConstantInputStdMax") &&
    browserPolicy.includes("dmmDeployedComposite: true") &&
    browserPolicy.includes("policy.inputSize === nhPolicyPreviousInputSize") &&
    browserPolicy.includes("policy.inputMean[index]"),
  "browser deployed-composite scorer clamps the same tiny-variance legacy inputs as Java"
);
assert(
  extractMethod(browserPolicy, "function rankNhDeployedLegacyNeuralPolicyActionsFromFeatures").includes("normalizeNhNeuralInput(policy, features, { dmmDeployedComposite: true })") &&
    !extractMethod(browserPolicy, "export function rankNhNeuralPolicyActionsFromFeatures").includes("{ dmmDeployedComposite: true }"),
  "browser clamps tiny-variance inputs only in the deployed-composite legacy ranker"
);
assert(
  browserPolicy.includes("rankNhDeployedLegacyNeuralPolicyActionsFromFeatures") &&
    browserPolicy.includes("isNhDeployedLegacyPolicyActionAllowed(features, decoded)"),
  "browser deployed-composite policy uses deployed legacy action legality"
);
assert(
  browserRuntime.includes("{ allowDeployedLegacyEvGuard: !dmmDeployedCompositeMode }"),
  "browser runtime disables the deployed EV style guard for DMM deployed-composite"
);
assert(
  browserRuntime.includes("if (runtimePolicyIsDmmActor(context.self))") &&
    browserRuntime.includes("return action;"),
  "browser runtime does not add an extra delayed-prayer action queue for DMM actors"
);
assert(
  nhLoadout.includes("place(player, 12, DMM_MASORI_BODY_F, 1);") &&
    nhLoadout.includes("place(player, 13, DMM_ZARYTE_CROSSBOW, 1);") &&
    nhLoadout.includes("place(player, 17, DRAGONFIRE_SHIELD, 1);") &&
    nhLoadout.includes("place(player, 18, DMM_NOXIOUS_HALBERD, 1);") &&
    nhLoadout.includes("place(player, 21, DMM_VESTAS_LONGSWORD, 1);") &&
    nhLoadout.includes("place(player, 22, DMM_VOIDWAKER, 1);") &&
    nhLoadout.includes("place(player, 23, deployedHardInventory ? MANTA_RAY : GRANITE_MAUL, 1);") &&
    nhLoadout.includes("place(player, 24, DMM_VENGEANCE_TRINKET, 2);") &&
    nhLoadout.includes("place(player, 27, deployedHardInventory ? MANTA_RAY : RunePouch.RUNE_POUCH, 1);"),
  "Java deployed-hard DMM inventory surface includes ZCB/DFS/halberd/VLS/Voidwaker/trinket and replaces gmaul/rune pouch"
);
assert(
  browserViewer.includes("const RUNTIME_DMM_DEPLOYED_HARD_INVENTORY_SLOTS = normalizeNhInventorySlots([") &&
    browserViewer.includes("{ itemId: 26374, quantity: 1 }") &&
    browserViewer.includes("{ itemId: 11283, quantity: 1 }") &&
    browserViewer.includes("{ itemId: 29796, quantity: 1 }") &&
    browserViewer.includes("{ itemId: 22613, quantity: 1 }") &&
    browserViewer.includes("{ itemId: 27690, quantity: 1 }") &&
    browserViewer.includes("{ itemId: 28561, quantity: 2 }") &&
    browserViewer.includes("return normalizeNhInventorySlots(RUNTIME_DMM_DEPLOYED_HARD_INVENTORY_SLOTS);"),
  "browser deployed-hard DMM inventory surface is still present for parity"
);
assert(
  nhLoadout.includes("private static final int[] DMM_SPECIAL_WEAPON_CANDIDATES = {DMM_VOIDWAKER, DMM_VESTAS_LONGSWORD, GRANITE_MAUL};") &&
    nhBot.includes("if (specIntent == SpecIntent.USE_SPECIAL || specIntent == SpecIntent.USE_SPECIAL_DOUBLE)") &&
    nhBot.includes("return bestAvailableSpecialWeaponKind(opponent, specIntent == SpecIntent.USE_SPECIAL_DOUBLE);") &&
    nhBot.includes("SpecialWeaponKind.VOIDWAKER") &&
    nhBot.includes("SpecialWeaponKind.VESTAS_LONGSWORD"),
  "Java deployed generic special intents can resolve to Voidwaker or VLS instead of stale gmaul-only behavior"
);
assert(
  nhBot.includes("private OffenceStyle visibleProtectionThreatStyle(Player opponent, OpponentInfoSnapshot snapshot)") &&
    nhBot.includes("visibleVoidwakerSpecThreat(opponent, snapshot)") &&
    nhBot.includes("return OffenceStyle.MAGIC;") &&
    nhBot.includes("observedOpponentCanMeleeSpecReachNextTick(snapshot, SpecialWeaponKind.VOIDWAKER)") &&
    nhBot.includes("opponentLikelyDelayed = OffenceStyle.MAGIC;"),
  "Java deployed defensive prayer treats a visible, reachable Voidwaker spec threat as magic without changing melee-range mechanics"
);
assert(
  browserRuntime.includes("return deployedLegacyMode") &&
    browserRuntime.includes("? runtimePolicyBestAvailableSpecialWeaponKind(context, nhSpecIntentIsDouble(action.specIntent))") &&
    browserRuntime.includes('add("voidwaker");') &&
    browserRuntime.includes('add("vesta_longsword");'),
  "browser deployed generic special intents use the same best-legal-special concept"
);
assert(
  nhBot.includes("DMM_VENGEANCE_TRINKET_MAX_CASTS = 2") &&
    nhBot.includes("player.vengeanceTrinketCasts >= DMM_VENGEANCE_TRINKET_MAX_CASTS") &&
    nhBot.includes("removeRemainingVengeanceTrinkets();"),
  "Java deployed DMM vengeance trinket is capped at two casts and removes remaining trinkets"
);

if (checkRuntimeLog) {
  const logPath = latestRuntimeLog();
  const log = logPath ? readText(logPath) : "";
  const logLines = log.split(/\r?\n/);
  const liveDecisionLines = logLines.filter((line) =>
    line.includes("live_decision ") &&
      line.includes("src=selfplay_dmm_deployed_composite") &&
      line.includes("controller=DMM_DEPLOYED_COMPOSITE")
  );
  const livePrayerLines = logLines.filter((line) =>
    line.includes("live_prayer_state ") &&
      line.includes("src=selfplay_dmm_deployed_composite") &&
      line.includes("controller=DMM_DEPLOYED_COMPOSITE")
  );
  const liveAppliedLines = logLines.filter((line) =>
    line.includes("live_applied_state ") &&
      line.includes("src=selfplay_dmm_deployed_composite") &&
      line.includes("controller=DMM_DEPLOYED_COMPOSITE")
  );
  const liveCurrentDirectDecisionLines = logLines.filter((line) =>
    line.includes("live_decision ") &&
      line.includes("bot=NH_Bot_Solana") &&
      line.includes("src=selfplay_neural_vector") &&
      line.includes("controller=CURRENT_DIRECT_ACTION_VECTOR")
  );
  assert(Boolean(logPath), "found a latest Java NH staker runtime log");
  assert(log.includes("dmm_deployed_composite_enabled"), "runtime log enabled DMM deployed-composite decode");
  assert(log.includes("deployed_hard_model_load_ok decode=dmm_deployed_composite"), "runtime log loaded deployed hard with dmm_deployed_composite decode");
  assert(log.includes("expectedDecode=dmm_deployed_composite"), "runtime log confirms expected decode was enforced");
  assert(log.includes("fallback=disabled"), "runtime log confirms fallback disabled");
  assert(log.includes("practice_policy_role bot=NH_Bot_Riven role=deployed_hard"), "runtime log assigned Riven deployed-hard practice role");
  assert(log.includes("practice_policy_role bot=NH_Bot_Solana role=current_direct"), "runtime log assigned Solana current-direct practice role");
  assert(/bot_ready bot=NH_Bot_Riven[\s\S]*mode=dmm-deployed-hard[\s\S]*ready=true/.test(log), "runtime log says Riven deployed-hard bot is ready");
  assert(log.includes("patch=nhbot_deployed_composite"), "runtime log comes from a deployed-composite patched bot build");
  assert(log.includes("startup_diag jvm="), "runtime log identifies the live Java server process");
    assert(!log.includes("run_exception"), "runtime log has no NH bot run exceptions");
    assert(!log.includes("policy_fallback"), "runtime log has no policy fallback decisions");
    assert(!log.includes("script_fallback"), "runtime log has no script fallback decisions");
    assert(!log.includes("controller=CURRENT_MAPPED"), "runtime log has no stale current-mapped controller markers");
    assert(!log.includes("deployed_scalar"), "runtime log has no scalar deployed controller markers");
    assert(!log.includes("live_counter_override"), "runtime log has no live counter override markers");
    assert(!log.includes("policy_decision_missing"), "runtime log has no missing policy decisions");
    assert(!log.includes("policy_missing_no_fallback"), "runtime log has no fail-closed missing-policy ticks");
  assert(!log.includes("dmm_deployed_composite_input_outlier"), "runtime log has no deployed-composite feature inputs outside the trained surface");
  assert(!/loadout_sync source=.*NH_Bot_Riven|NH_Bot_Riven[\s\S]{0,120}loadout_sync/.test(log), "runtime log does not show Riven loadout sync corruption");
  if (requireLiveDecisions) {
    assert(liveDecisionLines.length > 0, "runtime log contains live deployed-composite decisions");
    assert(livePrayerLines.length > 0, "runtime log contains live deployed-composite prayer-state decisions");
    assert(liveAppliedLines.length > 0, "runtime log contains live deployed-composite applied-state decisions");
    assert(liveCurrentDirectDecisionLines.length > 0, "runtime log contains live current-direct decisions with explicit controller kind");
    assert(
      liveDecisionLines.every((line) => line.includes("target=") && !line.includes("target=none")),
      "live deployed-composite decisions have a real target"
    );
    assert(
      livePrayerLines.every((line) => line.includes("visualApplyDelay=0") && line.includes("prayerInfoDelay=1")),
      "live deployed-composite prayer logs preserve immediate visual apply and one-tick-old opponent info"
    );
    const delayedPrayer = delayedPrayerEvidence(livePrayerLines);
    assert(
      delayedPrayer.samples > 0,
      "live deployed-composite prayer logs include a delayed-visible-threat sample that differs from same-tick live threat"
    );
    assert(
      delayedPrayer.violations === 0,
      "live deployed-composite prayer resolves from delayed visible threat when same-tick live threat disagrees"
    );
    assert(
      liveAppliedLines.some((line) => line.includes("attackRequested=true") && line.includes("targetSet=true")),
      "live deployed-composite applied state includes a real attack request against the target"
    );
    const attackFacingLines = liveAppliedLines.filter((line) =>
      line.includes("attackRequested=true") && line.includes("targetSet=true")
    );
    assert(
      attackFacingLines.length > 0 &&
        attackFacingLines.every((line) => line.includes("facingTarget=true")),
      "live deployed-composite attack-applied state faces the actual target"
    );
  }
}

if (failures.length > 0) {
  console.error("DMM deployed-composite Java verifier failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("DMM deployed-composite Java verifier passed:");
for (const item of passes) {
  console.log(`- ${item}`);
}
