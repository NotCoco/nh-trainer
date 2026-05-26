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

function readProject(relativePath) {
  return readFileSync(path.join(projectRoot, ...relativePath.split("/")), "utf8");
}

function readKronosServerSource(relativePath) {
  return readFileSync(
    path.resolve(
      projectRoot,
      "..",
      "kronos-osrs-184-master",
      "kronos-osrs-184-master",
      "Kronos-master",
      "kronos-server",
      "src",
      "main",
      "java",
      "io",
      "ruin",
      ...relativePath.split("/")
    ),
    "utf8"
  );
}

function serverEnumName(value) {
  return value.toUpperCase();
}

function assertArrayEquals(actual, expected, label) {
  assert(
    actual.length === expected.length,
    `${label} length mismatch: expected ${expected.length}, got ${actual.length}`
  );
  for (let index = 0; index < expected.length; index += 1) {
    assert(actual[index] === expected[index], `${label}[${index}] mismatch: expected ${expected[index]}, got ${actual[index]}`);
  }
}

function extractJavaArrayValues(source, arrayName) {
  const match = source.match(new RegExp(`private static final [^=]+\\[\\]\\s+${arrayName}\\s*=\\s*\\{([\\s\\S]*?)\\};`));
  assert(match, `server bridge missing ${arrayName} array`);
  return [...match[1].matchAll(/(?:NhStakerBot\.[A-Za-z]+|Prayer)\.([A-Z_]+)/g)].map((entry) =>
    entry[1].toLowerCase()
  );
}

function extractJavaIntConstant(source, constantName) {
  const match = source.match(new RegExp(`private static final int\\s+${constantName}\\s*=\\s+(\\d+)\\s*;`));
  assert(match, `server bridge missing literal int constant ${constantName}`);
  return Number(match[1]);
}

function extractBlockAfter(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert(markerIndex >= 0, `missing source marker ${marker}`);
  const openIndex = source.indexOf("{", markerIndex);
  assert(openIndex >= 0, `missing block after source marker ${marker}`);
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex + 1, index);
      }
    }
  }
  throw new Error(`unterminated source block after marker ${marker}`);
}

function assertOrderedSnippets(source, snippets, label) {
  let cursor = 0;
  for (const snippet of snippets) {
    const index = source.indexOf(snippet, cursor);
    assert(index >= 0, `${label} missing ordered snippet ${snippet}`);
    cursor = index + snippet.length;
  }
}

const bridge = loadTsModule("src/sim/nh/policy-bridge.ts");
const policyFeatures = loadTsModule("src/sim/nh/policy-features.ts");
const botPolicy = loadTsModule("src/bot/policy.ts");
const runtimePolicy = loadTsModule("src/sim/nh/runtime-policy-opponent.ts");
const runtimePolicyTargeting = loadTsModule("src/sim/nh/runtimePolicyTargeting.ts");
const runtimeCombat = loadTsModule("src/sim/runtimePlayerCombat.ts");
const nhDuel = loadTsModule("src/sim/nh/duel.ts");
const loadouts = loadTsModule("src/sim/nh/loadouts.ts");
const gearProfile = loadTsModule("src/sim/nh/gearProfile.ts");
const clientOffenceEv = loadTsModule("src/sim/nh/clientOffenceEv.ts");
const entityLocks = loadTsModule("src/sim/entity/locks.ts");
const sceneCollision = loadTsModule("src/render/kronosSceneCollision.ts");
const coverage = runtimePolicy.assertRuntimePolicyOpponentActionCoverage();
assert(coverage.actionCount === 4950, `expected 4950 policy actions, got ${coverage.actionCount}`);
assert(coverage.offenceStyles === bridge.nhOffenceStyles.length, "offence style coverage count mismatch");
assert(coverage.defencePrayers === bridge.nhDefencePrayers.length, "defence prayer coverage count mismatch");
assert(coverage.movementIntents === bridge.nhMovementIntents.length, "movement intent coverage count mismatch");
assert(
  coverage.supplyIntents === bridge.nhSupplyIntents.length + bridge.nhExtraSupplyIntents.length,
  "supply intent coverage count mismatch"
);
assert(coverage.specIntents === bridge.nhSpecIntents.length, "spec intent coverage count mismatch");

const seen = {
  offenceStyles: new Set(),
  defencePrayers: new Set(),
  movementIntents: new Set(),
  supplyIntents: new Set(),
  specIntents: new Set()
};
for (let actionId = 0; actionId < bridge.nhPolicyActionCount; actionId += 1) {
  const decoded = bridge.decodeNhPolicyAction(actionId);
  seen.offenceStyles.add(decoded.offenceStyle);
  seen.defencePrayers.add(decoded.defencePrayer);
  seen.movementIntents.add(decoded.movementIntent);
  seen.supplyIntents.add(decoded.supplyIntent);
  seen.specIntents.add(decoded.specIntent);
  assert(bridge.encodeNhPolicyAction(decoded) === actionId, `policy action ${actionId} did not round-trip`);
}

for (const value of bridge.nhOffenceStyles) {
  assert(seen.offenceStyles.has(value), `decoded action space never emits offence style ${value}`);
}
for (const value of bridge.nhDefencePrayers) {
  assert(seen.defencePrayers.has(value), `decoded action space never emits defence prayer ${value}`);
}
for (const value of bridge.nhMovementIntents) {
  assert(seen.movementIntents.has(value), `decoded action space never emits movement intent ${value}`);
}
for (const value of [...bridge.nhSupplyIntents, ...bridge.nhExtraSupplyIntents]) {
  assert(seen.supplyIntents.has(value), `decoded action space never emits supply intent ${value}`);
}
for (const value of bridge.nhSpecIntents) {
  assert(seen.specIntents.has(value), `decoded action space never emits spec intent ${value}`);
}

const serverBridgeSource = readKronosServerSource("model/entity/player/ai/NhStakerSelfPlayManager.java");
const javaOffenceStyles = extractJavaArrayValues(serverBridgeSource, "OFFENCE_STYLES");
const javaDefencePrayers = extractJavaArrayValues(serverBridgeSource, "DEFENCE_PRAYERS");
const javaMovementIntents = extractJavaArrayValues(serverBridgeSource, "MOVEMENT_INTENTS");
const javaSupplyIntents = extractJavaArrayValues(serverBridgeSource, "SUPPLY_INTENTS");
const javaExtraSupplyIntents = extractJavaArrayValues(serverBridgeSource, "EXTRA_SUPPLY_INTENTS");
const javaSpecIntents = extractJavaArrayValues(serverBridgeSource, "SPEC_INTENTS");
const javaBaseActionCount =
  javaOffenceStyles.length * javaDefencePrayers.length * javaMovementIntents.length * javaSupplyIntents.length;
const javaExtraBaseActionCount =
  javaOffenceStyles.length * javaDefencePrayers.length * javaMovementIntents.length * javaExtraSupplyIntents.length;
const javaLegacyActionCount = javaBaseActionCount * javaSpecIntents.length;
const javaActionCount = javaLegacyActionCount + javaExtraBaseActionCount * javaSpecIntents.length;

assertArrayEquals(javaOffenceStyles, [...bridge.nhOffenceStyles], "Java/TS offence style order");
assertArrayEquals(javaDefencePrayers, [...bridge.nhDefencePrayers], "Java/TS defence prayer order");
assertArrayEquals(javaMovementIntents, [...bridge.nhMovementIntents], "Java/TS movement intent order");
assertArrayEquals(javaSupplyIntents, [...bridge.nhSupplyIntents], "Java/TS base supply intent order");
assertArrayEquals(javaExtraSupplyIntents, [...bridge.nhExtraSupplyIntents], "Java/TS extra supply intent order");
assertArrayEquals(javaSpecIntents, [...bridge.nhSpecIntents], "Java/TS spec intent order");
assert(extractJavaIntConstant(serverBridgeSource, "INPUT_SIZE") === bridge.nhPolicyInputSize, "Java/TS policy input size mismatch");
assert(
  extractJavaIntConstant(serverBridgeSource, "RESERVOIR_SIZE") === bridge.nhPolicyReservoirSize,
  "Java/TS policy reservoir size mismatch"
);
assert(javaActionCount === bridge.nhPolicyActionCount, `Java/TS policy action count mismatch: ${javaActionCount}`);

function decodeJavaBridgeAction(action) {
  const extendedSupplyAction = action >= javaLegacyActionCount;
  const baseAction = extendedSupplyAction
    ? (action - javaLegacyActionCount) % javaExtraBaseActionCount
    : action % javaBaseActionCount;
  const specIndex = extendedSupplyAction
    ? Math.floor((action - javaLegacyActionCount) / javaExtraBaseActionCount)
    : Math.floor(action / javaBaseActionCount);
  const supplyPool = extendedSupplyAction ? javaExtraSupplyIntents : javaSupplyIntents;
  const supplyIndex = baseAction % supplyPool.length;
  const movementIndex = Math.floor(baseAction / supplyPool.length) % javaMovementIntents.length;
  const defenceIndex = Math.floor(baseAction / (supplyPool.length * javaMovementIntents.length)) % javaDefencePrayers.length;
  const styleIndex =
    Math.floor(baseAction / (supplyPool.length * javaMovementIntents.length * javaDefencePrayers.length)) %
    javaOffenceStyles.length;

  return {
    offenceStyle: javaOffenceStyles[styleIndex],
    defencePrayer: javaDefencePrayers[defenceIndex],
    movementIntent: javaMovementIntents[movementIndex],
    supplyIntent: supplyPool[supplyIndex],
    specIntent: javaSpecIntents[Math.max(0, Math.min(javaSpecIntents.length - 1, specIndex))],
    extendedSupplyAction
  };
}

for (let actionId = 0; actionId < bridge.nhPolicyActionCount; actionId += 1) {
  const decodedTs = bridge.decodeNhPolicyAction(actionId);
  const decodedJava = decodeJavaBridgeAction(actionId);
  assert(decodedTs.offenceStyle === decodedJava.offenceStyle, `action ${actionId} offence style diverges from Java`);
  assert(decodedTs.defencePrayer === decodedJava.defencePrayer, `action ${actionId} defence prayer diverges from Java`);
  assert(decodedTs.movementIntent === decodedJava.movementIntent, `action ${actionId} movement intent diverges from Java`);
  assert(decodedTs.supplyIntent === decodedJava.supplyIntent, `action ${actionId} supply intent diverges from Java`);
  assert(decodedTs.specIntent === decodedJava.specIntent, `action ${actionId} spec intent diverges from Java`);
  assert(
    decodedTs.extendedSupplyAction === decodedJava.extendedSupplyAction,
    `action ${actionId} extended supply flag diverges from Java`
  );
}

const policyFeaturesSource = readProject("src/sim/nh/policy-features.ts");
const duelSource = readProject("src/sim/nh/duel.ts");
assertOrderedSnippets(
  extractBlockAfter(serverBridgeSource, "private void encodeInput(NhStakerBot.BotTickObservation obs, double[] input)"),
  [
    "int relDx = obs.targetIndex >= 0 ? (obs.opponentX - obs.selfX) : 0;",
    "int relDy = obs.targetIndex >= 0 ? (obs.opponentY - obs.selfY) : 0;",
    "input[i++] = clamp01(obs.distance < 0 ? 0.0D : (obs.distance / 12.0D));",
    "input[i++] = clamp01(obs.selfHp / 99.0D);",
    "input[i++] = clamp01(obs.opponentHp < 0 ? 0.0D : (obs.opponentHp / 99.0D));",
    "input[i++] = clamp01(obs.selfPrayerPoints / 99.0D);",
    "input[i++] = clamp01(obs.selfFoodCount / 28.0D);",
    "input[i++] = clamp01(obs.selfBrewCount / 8.0D);",
    "input[i++] = clamp01(obs.selfRestoreCount / 8.0D);",
    "input[i++] = clamp01(obs.selfReboostCount / 8.0D);",
    "input[i++] = obs.canAttack ? 1.0D : 0.0D;",
    "input[i++] = obs.selfAttackReady ? 1.0D : 0.0D;",
    "input[i++] = obs.canSpecSingleNow ? 1.0D : 0.0D;",
    "input[i++] = obs.canSpecDoubleNow ? 1.0D : 0.0D;",
    "input[i++] = obs.selfFrozen ? 1.0D : 0.0D;",
    "input[i++] = obs.opponentFrozen ? 1.0D : 0.0D;",
    "input[i++] = clamp01(obs.selfFreezeTicksRemaining / FREEZE_TICKS_NORMALIZER);",
    "input[i++] = clamp01(obs.opponentFreezeTicksRemaining / FREEZE_TICKS_NORMALIZER);",
    "input[i++] = obs.selfMoving ? 1.0D : 0.0D;",
    "input[i++] = obs.opponentMoving ? 1.0D : 0.0D;",
    "input[i++] = obs.ateFood ? 1.0D : 0.0D;",
    "input[i++] = obs.drankPotion ? 1.0D : 0.0D;",
    "input[i++] = clampSigned(obs.rewardDelta / REWARD_CLAMP);",
    "input[i++] = clampSigned(obs.rewardDps / 30.0D);",
    "input[i++] = clampSigned(obs.rewardTotal / 120.0D);",
    "input[i++] = clampSigned(obs.lastDealtHit / 40.0D);",
    "input[i++] = clampSigned(obs.lastTakenHit / 40.0D);",
    "input[i++] = clamp01(obs.selfSpecialEnergy / 1000.0D);",
    "input[i++] = obs.selfSpecialActive ? 1.0D : 0.0D;",
    "input[i++] = clampSigned(obs.selfDx / 4.0D);",
    "input[i++] = clampSigned(obs.selfDy / 4.0D);",
    "input[i++] = clampSigned(obs.opponentDx / 4.0D);",
    "input[i++] = clampSigned(obs.opponentDy / 4.0D);",
    "input[i++] = clampSigned(relDx / 16.0D);",
    "input[i++] = clampSigned(relDy / 16.0D);",
    "input[i++] = obs.targetIndex >= 0 ? 1.0D : 0.0D;",
    "i = writeStyle(obs.selfLikelyStyle, input, i);",
    "i = writeStyle(obs.currentOffenceStyle, input, i);",
    "i = writeStyle(obs.scriptedOffenceStyle, input, i);",
    "i = writeStyle(obs.opponentLikelyStyleDelayed, input, i);",
    "i = writeStyle(obs.opponentGearStyleDelayed, input, i);",
    "input[i++] = ((selfMask & PROTECT_MAGIC_MASK) != 0) ? 1.0D : 0.0D;",
    "input[i++] = ((oppMask & PROTECT_MAGIC_MASK) != 0) ? 1.0D : 0.0D;",
    "input[i++] = obs.selfWeaponId <= 0 ? 0.0D : Math.sin(obs.selfWeaponId * WEAPON_EMBED_FREQ);",
    "input[i++] = obs.opponentWeaponIdDelayed <= 0 ? 0.0D : Math.sin(obs.opponentWeaponIdDelayed * WEAPON_EMBED_FREQ);",
    "input[i++] = obs.opponentSpecialEnergyEstimate < 0 ? 0.0D : clamp01(obs.opponentSpecialEnergyEstimate / 1000.0D);",
    "input[i++] = obs.rewardEpisodeActive ? 1.0D : 0.0D;",
    "input[i++] = levelRatio(obs.selfAttackLevel, obs.selfAttackFixed);",
    "input[i++] = levelDeficit(obs.selfAttackLevel, obs.selfAttackFixed);",
    "input[i++] = canMeleeReachNow(obs) ? 1.0D : 0.0D;",
    "input[i++] = opponentCanMeleeReachNow(obs) ? 1.0D : 0.0D;",
    "input[i++] = clamp01(obs.gmaulSingleKoChance);",
    "input[i++] = clamp01(obs.gmaulDoubleKoChance);",
    "input[i++] = clamp01(obs.gmaulSingleSetupScore);",
    "input[i] = clamp01(obs.gmaulDoubleSetupScore);"
  ],
  "Java policy input layout"
);
assertOrderedSnippets(
  extractBlockAfter(policyFeaturesSource, "export function encodeNhPolicyInput(context: NhDuelControllerContext): number[]"),
  [
    "const relDx = opponentInfoKnown ? opponent.tile.x - self.tile.x : -1 - self.tile.x;",
    "const relDy = opponentInfoKnown ? opponent.tile.y - self.tile.y : -1 - self.tile.y;",
    "input.push(clamp01(distance / 12));",
    "input.push(clamp01(self.stats.hitpoints.current / 99));",
    "input.push(clamp01(opponentVisibleHp / 99));",
    "input.push(clamp01(self.stats.prayer.current / 99));",
    "input.push(clamp01(foodCount(self) / 28));",
    "input.push(clamp01(policyPotionBottleCount(self.supplies.saradomin_brew) / 8));",
    "input.push(clamp01(policyPotionBottleCount(self.supplies.super_restore, self.supplies.sanfew_serum) / 8));",
    "input.push(clamp01(policyPotionBottleCount(self.supplies.super_combat, self.supplies.bastion, self.supplies.ranging_potion) / 8));",
    "input.push(boolFeature(selfCanAttackFromObserved));",
    "input.push(boolFeature(!selfAttackDelay.delayed));",
    "input.push(boolFeature(selfCanSpecSingleNow));",
    "input.push(boolFeature(selfCanSpecDoubleNow));",
    "input.push(boolFeature(isFrozen(self.locks, context.tick)));",
    "input.push(boolFeature(opponentInfoKnown && isFrozen(opponent.locks, context.tick)));",
    "input.push(remainingTicks(self.locks.freezeUntilTick, context.tick, freezeTicksNormalizer));",
    "input.push(remainingTicks(opponentInfoKnown ? opponent.locks.freezeUntilTick : -1, context.tick, freezeTicksNormalizer));",
    "input.push(boolFeature(self.movedThisTick));",
    "input.push(boolFeature(opponentInfoKnown && opponent.movedThisTick));",
    "input.push(boolFeature(self.ateFoodLastTick));",
    "input.push(boolFeature(self.drankPotionLastTick));",
    "input.push(clampSigned(self.rewardDelta / rewardClamp));",
    "input.push(clampSigned(self.rewardDps / 30));",
    "input.push(clampSigned(self.rewardTotal / 120));",
    "input.push(clampSigned(self.lastDealtHit / 40));",
    "input.push(clampSigned(self.lastTakenHit / 40));",
    "input.push(clamp01((self.gmaul.specialEnergy * 10) / 1000));",
    "input.push(boolFeature(self.specialActive));",
    "input.push(clampSigned(self.lastMoveDx / 4));",
    "input.push(clampSigned(self.lastMoveDy / 4));",
    "input.push(clampSigned((opponentInfoKnown ? opponent.lastMoveDx : 0) / 4));",
    "input.push(clampSigned((opponentInfoKnown ? opponent.lastMoveDy : 0) / 4));",
    "input.push(clampSigned(relDx / 16));",
    "input.push(clampSigned(relDy / 16));",
    "input.push(1);",
  "pushStyle(input, selfStyle);",
  "pushStyle(input, self.lastOffenceStyle);",
  "pushStyle(input, scriptedOffenceStyle);",
  "pushStyle(input, opponentInfoKnown ? opponent.lastOffenceStyle : null);",
    "pushStyle(input, opponentStyle);",
    "pushProtectionMask(input, self);",
    "pushProtectionMask(input, opponentInfoKnown ? opponent : null);",
    "pushWeaponEmbedding(input, self.weaponId);",
    "pushWeaponEmbedding(input, opponentInfoKnown ? opponent.weaponId : null);",
    "input.push(clamp01((opponent.gmaul.specialEnergy * 10) / 1000));",
    "input.push(boolFeature(context.rewardEpisodeActive ?? true));",
    "pushLevelRatios(input, self);",
    "pushLevelDeficits(input, self);",
    "input.push(boolFeature(opponentInfoKnown && context.meleeReachable));",
    "input.push(boolFeature(opponentMeleeReachCanReach));",
    "input.push(gmaulFeatures.singleKoChance);",
    "input.push(gmaulFeatures.doubleKoChance);",
    "input.push(gmaulFeatures.singleSetupScore);",
    "input.push(gmaulFeatures.doubleSetupScore);"
  ],
  "TypeScript policy input layout"
);
for (const value of bridge.nhMovementIntents) {
  assert(serverBridgeSource.includes(`MovementIntent.${serverEnumName(value)}`), `server bridge missing movement ${value}`);
}
for (const value of bridge.nhSupplyIntents) {
  assert(serverBridgeSource.includes(`SupplyIntent.${serverEnumName(value)}`), `server bridge missing supply ${value}`);
}
for (const value of bridge.nhExtraSupplyIntents) {
  assert(serverBridgeSource.includes(`SupplyIntent.${serverEnumName(value)}`), `server bridge missing extra supply ${value}`);
}
for (const value of bridge.nhSpecIntents) {
  assert(serverBridgeSource.includes(`SpecIntent.${serverEnumName(value)}`), `server bridge missing spec ${value}`);
}

const serverLoadoutSource = readKronosServerSource("model/entity/player/ai/NhStakerLoadout.java");
for (const snippet of [
  "private static final int[] MAGIC_WEAPON_CANDIDATES = {STAFF_OF_THE_DEAD, KODAI_WAND, ANCIENT_STAFF};",
  "private static final int[] RANGED_WEAPON_CANDIDATES = {DRAGON_CROSSBOW, ARMADYL_CROSSBOW, RUNE_CROSSBOW, MAGIC_SHORTBOW};",
  "private static final int[] MELEE_WEAPON_CANDIDATES = {ABYSSAL_TENTACLE, ABYSSAL_WHIP};",
  "private static final int[] SPECIAL_WEAPON_CANDIDATES = {ARMADYL_GODSWORD, GRANITE_MAUL, GRANITE_MAUL_12848, GRANITE_MAUL_20557};",
  "private static SelectedWeapons inferSelectedWeapons(Player player) {",
  "int magicShieldId = pickOwnedBestForSlot(player, Equipment.SLOT_SHIELD, STYLE_MAGIC, BLESSED_SPIRIT_SHIELD);",
  "int rangedChestId = pickOwnedBestForSlot(player, Equipment.SLOT_CHEST, STYLE_RANGED, KARILS_LEATHERTOP);",
  "int meleeShieldId = pickOwnedBestForSlot(player, Equipment.SLOT_SHIELD, STYLE_MELEE, AVERNIC_DEFENDER);",
  "int meleeChestId = pickOwnedBestForSlot(player, Equipment.SLOT_CHEST, STYLE_MELEE, KARILS_LEATHERTOP);",
  "for (int i = 0; i < INVENTORY_SLOTS; i++)",
  "for (int i = 0; i < EQUIPMENT_SLOTS; i++)",
  "private static int styleScore(ItemDef def, int style) {"
]) {
  assert(serverLoadoutSource.includes(snippet), `server loadout source missing selected-gear anchor ${snippet}`);
}

const serverBotSource = readKronosServerSource("model/entity/player/ai/scripts/NhStakerBot.java");
const serverPlayerCombatSource = readKronosServerSource("model/entity/player/PlayerCombat.java");
for (const snippet of [
  "private static final int POLICY_HISTORY_TICKS = 16;",
  "appendObservation(observation);",
  "policyHistoryWindow.addAll(observationHistory);",
  "if (!inPvpCombatArea()) {",
  "resetCombatState(\"left_pvp\");",
  "return player.wildernessLevel > 0 || player.pvpAttackZone;",
  "player.getPrayer().deactivateAll();"
]) {
  assert(serverBotSource.includes(snippet), `server bot source missing policy history anchor ${snippet}`);
}
for (const snippet of [
  "if (!rewardEpisodeActive || rewardEpisodeId < 0) {",
  "state.reset();",
  "state.episodeId = rewardEpisodeId;",
  "private static final double DEFENCE_PRAYER_HISTORY_PRIOR_SCALE = 3.20D;",
  "private static final int DEFENCE_PRAYER_HISTORY_OBSERVATIONS = 8;",
  "private static final double OFFENCE_GEAR_WEAKNESS_PRIOR_SCALE = 8.40D;",
  "private static final double OFFENCE_GEAR_MELEE_REACH_BONUS = 60.00D;",
  "defencePrayerHistoryPrior(input, observation, historyWindow, action)",
  "offenceGearWeaknessPrior(input, observation, action)",
  "if (score > bestScore || (score == bestScore && Random.rollDie(2)))",
  "private boolean isActionAllowedFromFeatureVector(double[] features, int action)",
  "if (defence == Prayer.SMITE && !trainingMode)",
  "if (defence == Prayer.SMITE) {",
  "if (!canAttack || !selfAttackReady || selfHp < 0.55D || selfPrayer < (14.0D / 99.0D))",
  "private double offenceGearWeaknessPrior(double[] input, NhStakerBot.BotTickObservation observation, int action)",
  "double score = OFFENCE_GEAR_WEAKNESS_PRIOR_SCALE * weakness;",
  "score -= OFFENCE_GEAR_PROTECTED_STYLE_PENALTY * (0.35D + exposedWeakness);",
  "score -= OFFENCE_GEAR_COMPETITIVE_MELEE_PENALTY",
  "private double visibleStyleEv(double[] input,",
  "double defenceFactor = 0.56D + (0.58D * clamp01(weakness + 0.35D));",
  "double prayerFactor = opponentProtectsStyle(input, style) ? 0.58D : 1.0D;",
  "double effectiveBaseHit = baseHit * Math.min(1.08D, Math.max(0.0D, statFactor));",
  "double koPressure = opponentHp > 0.0D && (effectiveBaseHit / 99.0D) >= opponentHp",
  "private double defencePrayerHistoryPrior(double[] input,",
  "previous.targetIndex != observation.targetIndex",
  "previous.opponentLikelyStyleDelayed",
  "previous.opponentGearStyleDelayed",
  "weight *= 0.78D;",
  "private void rebalanceLoadedActionBiases()",
  "weights[i] = clampDouble(weights[i] * scale, -WEIGHT_CLAMP, WEIGHT_CLAMP);",
  "actionVisits[action] = Math.max(0L, Math.round(actionVisits[action] * (scale * scale)));",
  "if (version != STORE_VERSION)",
  "long activeDecisions = Math.min(Math.max(0L, loadedDecisions), EXPLORATION_REHEAT_DECISIONS_CAP);",
  "actionVisits[action] = Math.max(0L, Math.round(actionVisits[action] * reheatScale));"
]) {
  assert(serverBridgeSource.includes(snippet), `server bridge source missing policy history prior anchor ${snippet}`);
}
for (const snippet of [
  "applySupplyIntent(opponent, decision.supplyIntent, tick);",
  "OffenceStyle desiredOffence = decision.offenceStyle;",
  "desiredOffence = enforceLivePrayerCounter(opponent, desiredOffence);",
  "desiredOffence = recoverStyleStall(opponent, desiredOffence);",
  "if (desiredOffence != currentOffence || (!suppressStyleReequipThisTick && !isEquippedForStyle(desiredOffence)))",
  "optimizeFlexibleGear(desiredOffence, opponent);",
  "if (desiredOffence == OffenceStyle.MAGIC) {",
  "enforceMagicCoreArmor();",
  "applySpecIntent(opponent, decision.specIntent);",
  "applyMovementIntent(opponent, desiredOffence, decision.movementIntent, tick);",
  "castBarrage(opponent);",
  "ensureAutocast(spell, ICE_BARRAGE_AUTOCAST_SLOT);",
  "if (player.getCombat().queuedSpell != null) {",
  "player.getCombat().queuedSpell = null;",
  "if (!ensureMagicLineOfSight(opponent))",
  "if (opponent == null || rewardEpisodeActive || tick < nextLoadoutSyncTick)",
  "nextLoadoutSyncTick = tick + 2L;",
  "ensurePrayerPoints();",
  "private void ensurePrayerPoints() {",
  "player.getStats().get(StatType.Prayer).restore();",
  "if ((style == OffenceStyle.MELEE && !observedSelfCanMeleeReachThisTick(delayed))",
  "routeToOpponentIfAllowed(opponent);",
  "applySelectedLoadout(selected);",
  "if (needsEmergencyRecovery()) {",
  "performEmergencyRecovery(\"runtime_guard\");",
  "private boolean hasCriticalLoadoutGap() {",
  "private boolean hasCoreStatsGap() {",
  "player.getStats().get(StatType.Attack).fixedLevel < 90",
  "player.getEquipment().isEmpty()",
  "player.getEquipment().getId(Equipment.SLOT_WEAPON) <= 0",
  "private void performEmergencyRecovery(String reason) {",
  "restoreCoreStats();",
  "player.getCombat().restore();",
  "SpellBook.ANCIENT.setActive(player);",
  "clearAutocast();",
  "ensureLoadoutIntegrity(reason);",
  "currentOffence = null;",
  "lastDefencePrayer = null;",
  "lastOffencePrayer = null;",
  "clearStyleStall();",
  "player.temp.remove(BOT_STYLE_KEY);",
  "private void applyLoadout(OffenceStyle style) {",
  "private void enforceMagicCoreArmor() {",
  "ensureEquipped(Equipment.SLOT_CHEST, magicChestId);",
  "ensureEquipped(Equipment.SLOT_LEGS, magicLegsId);",
  "private boolean maybeEquipGraniteMaulForSpec(Player opponent) {",
  "equipOwnedSlotItem(Equipment.SLOT_WEAPON, maulId)",
  "private void optimizeFlexibleGear(OffenceStyle offenceStyle, Player opponent) {",
  "if (offenceStyle == null || player.isLocked() || player.isStunned()) {",
  "private List<Integer> collectSlotCandidates(int slot) {",
  "Item equipped = player.getEquipment().get(slot);",
  "Item item = player.getInventory().get(i);",
  "private OffenceStyle recoverStyleStall(Player opponent, OffenceStyle desiredStyle) {",
  "stalledStyleTicks++;",
  "stalledStyleTicks < STYLE_STALL_THRESHOLD_TICKS",
  "switchToStyle(desiredStyle, opponent);",
  "applyDefencePrayer(opponent);",
  "applyOffencePrayer(desiredStyle);",
  "private void clearStyleStall() {",
  "private int[] expectedBonusesForStyle(OffenceStyle style) {",
  "private static final int FREEZE_RETRY_TICKS = 6;",
  "if (tick < nextFreezeAttemptTick) {",
  "nextFreezeAttemptTick = tick + FREEZE_RETRY_TICKS;",
  "private CombatDecision applyContextGuards(Player opponent, CombatDecision decision) {",
  "if ((supply == SupplyIntent.OFFENCE_STRIP_ONE || supply == SupplyIntent.OFFENCE_STRIP_TWO)",
  "if (defence == Prayer.SMITE && !isSelfPlayBot()) {",
  "if (isAggressingBot(opponent) || player.getCombat().isDefending(3)) {",
  "OffenceStyle threatStyle = resolveThreatStyle(opponent);",
  "boolean underThreat = threatStyle != null && isLikelyUnderThreat(opponent, threatStyle);",
  "boolean underPressure = opponent != null && isAggressingBot(opponent);",
  "if (bestEv >= currentEv + CLIENT_STYLE_EV_GUARD_MARGIN) {",
  "private Prayer resolveDefencePrayer(Player opponent, Prayer requested) {",
  "private boolean shouldAttemptRedemption(Player opponent, OffenceStyle threatStyle, int hpBeforeHit) {",
  "private boolean isLikelyUnderThreat(Player opponent, OffenceStyle threatStyle) {",
  "private int estimateThreatMaxHit(Player opponent, OffenceStyle threatStyle) {",
  "private int estimateClientFirstHitMax(OffenceStyle style, int visibleWeaponId) {",
  "private static final int CLIENT_THREAT_MAGIC_MAX = 33;",
  "private static final int CLIENT_THREAT_RANGED_MAX = 46;",
  "private static final int CLIENT_THREAT_MELEE_MAX = 48;",
  "ateFoodLastTick = ateFoodThisTick;",
  "drankPotionLastTick = drankPotionThisTick;",
  "rewardLastDealtHit = dealtDelta;",
  "rewardLastTakenHit = takenDelta;",
  "canAttack = canAttackFromObserved(opponent, delayed, selfLikelyStyle);",
  "private boolean canAttackFromObserved(Player opponent, OpponentInfoSnapshot snapshot, OffenceStyle selfStyle) {",
  "private int attackRangeForThreat(OffenceStyle threatStyle) {",
  "return 8;",
  "attemptStandUnder(opponent, style, tick);",
  "player.getRouteFinder().routeAbsolute(delayed.x, delayed.y);",
  "attemptDirectionalStep(opponent, 1, 1, tick, \"policy_step_ne\");",
  "private void routeToOpponentIfAllowed(Player opponent) {",
  "if (!isCombatTileAllowed(opponent.getAbsX(), opponent.getAbsY(), opponent.getHeight()))",
  "player.getRouteFinder().routeEntity(opponent);",
  "private boolean ensureMagicLineOfSight(Player opponent) {",
  "if (!ProjectileRoute.allow(player, opponent))",
  "stepAwayFrom(opponent, \"no_los\");",
  "private void stepAwayFrom(Player opponent, String reason) {",
  "dx = Random.rollDie(2, 1) ? -1 : 1;",
  "dy = Random.rollDie(2, 1) ? -1 : 1;",
  "for (Position candidate : current.area(1))",
  "private boolean tryStep(Position current, Position target, int dx, int dy, boolean allowTargetTile) {",
  "if (!targetTile && !ProjectileRoute.allow(candidate.getX(), candidate.getY(), candidate.getZ(), 1, target.getX(), target.getY(), 1))",
  "private static final int[] MAIN_FOOD_IDS = {MANTA_RAY, SHARK};",
  "if (postBrewRecoveryUntilTick >= tick && needsPostBrewRecovery()) {",
  "if (player.isLocked() || player.isStunned()) {",
  "HealingUseResult tripleEatMain = eatMainFoodDetailed();",
  "HealingUseResult panicMain = eatMainFoodDetailed();",
  "if (needsRestoreNow()) {",
  "private int drinkReboostPotionsDetailed() {",
  "case PANIC_FULL:",
  "HealingUseResult panicBrew = drinkBrewPotionDetailed();",
  "HealingUseResult panicKaram = eatKaramFoodDetailed();",
  "if (usedBrew || usedRestore || usedReboost) {",
  "private static final int SUPPLY_RECOVERY_STICKY_TICKS = 8;",
  "private void applySupplyReward(SupplyIntent intent,",
  "double riskReduction = Math.max(0.0D, riskBefore - riskAfter);",
  "boolean brewOnlyEvWindow = brewOnlyTempo",
  "delta -= foodUses * REWARD_FOOD_USE_COST;",
  "rememberSupplyUse(tick, lowValueSupply);",
  "private double defencePrayerBeliefReward(Player opponent,",
  "ClientStyleBelief belief = clientStyleBelief(opponent, fallbackThreatStyle, distance);",
  "double actualPrayerReward = actualPrayerHitReward(onPrayerHitDelta, onPrayerDamageDelta,",
  "type=actual_prayer",
  "private int estimateOpponentSpecialEnergyClientSide(Player opponent) {",
  "private static final int DELAYED_OPP_INFO_DELAY_TICKS = 1;",
  "OpponentInfoSnapshot live = captureLiveOpponentInfo(opponent, tick);",
  "private static final double REWARD_OFFENCE_STRIP_GAIN_SCALE = 0.00D;",
  "private static final double REWARD_OFFENCE_STRIP_FAIL_PENALTY = 0.00D;",
  "private static final double REWARD_REGEAR_STYLE_BONUS = 0.00D;",
  "boolean safeStripWindow = !underPressure && !offenceStyleProtectedAtUse && hpBefore >= 72;",
  "delta += Math.min(0.55D, effectiveGain * REWARD_OFFENCE_STRIP_GAIN_SCALE);",
  "delta += underPressure ? REWARD_REGEAR_STYLE_BONUS : REWARD_REGEAR_STYLE_BONUS * 0.45D;",
  "opponentLikelyDelayed = delayed.likelyStyle;",
  "opponentGearDelayed = delayed.gearStyle;",
  "if (opponentLikelyDelayed == null) {",
  "rewardEpisodeStartTick = tick;",
  "rewardEpisodeTotal = 0.0D;",
  "rewardEpisodeTotal += rewardTick;",
  "private static final int CLIENT_SPEC_REGEN_TICKS = 50;",
  "private static final int CLIENT_SPEC_GMAUL_SINGLE_COST = 500;",
  "resetOpponentSpecialEnergyEstimate();",
  "opponentSpecEstimate = CLIENT_SPEC_MAX;",
  "private int newlyObservedGmaulSpecsFrom(Player opponent) {",
  "private Prayer protectionPrayerFor(Player opponent) {",
  "likely = getLikelyOffenceStyle(opponent);",
  "likely = getLikelyOffenceStyleFromGear(opponent);",
  "private OffenceStyle detectLikelyOffenceStyleLive(Player opponent) {",
  "OffenceStyle attackStyle = styleFromAttackStyle(style, weaponStyle);",
  "if (weaponStyle == OffenceStyle.MAGIC && attackStyle == OffenceStyle.MELEE) {",
  "private OffenceStyle styleFromAttackStyle(AttackStyle style, OffenceStyle weaponStyle) {",
  "return weaponStyle == OffenceStyle.MAGIC ? OffenceStyle.MAGIC : OffenceStyle.MELEE;",
  "case TRIDENT_OF_THE_SEAS_E:",
  "case TRIDENT_OF_THE_SWAMP_E:",
  "private OffenceStyle enforceLivePrayerCounter(Player opponent, OffenceStyle desiredStyle)",
  "boolean desiredBlocked = isStyleProtectedByMask(desiredStyle, protectionMask);",
  "boolean currentBlocked = isStyleProtectedByMask(currentOffence, protectionMask);",
  "OffenceStyle counter = counterFromProtectionMask(protectionMask, wantsFreeze);",
  "private double clientOffenceEv(Player opponent,",
  "double defenceFactor = 0.56D + (0.58D * clamp01(weakness + 0.35D));",
  "double prayerFactor = isStyleProtectedByMask(style, delayed.protectionMask) ? 0.58D : 1.0D;",
  "private double clientStyleAccuracyFactor(OffenceStyle style, int[] bonuses) {",
  "private double clientStyleTankFactor(Player opponent, int[] expectedBonuses) {",
  "private double clientStyleStatFactor(OffenceStyle style,",
  "private double clientGmaulKoChanceEstimate(Player opponent, boolean doubleSpec, int opponentHp, int recentHit,",
  "double exposure = opponentMeleeSpecExposure(delayed);",
  "boolean meleeProtected = isStyleProtectedByMask(OffenceStyle.MELEE, delayed.protectionMask);",
  "int effectiveDamage = Math.max(1, (int) Math.round(maxSpecDamage * exposure * prayerFactor));",
  "if (player.isLocked() || player.getCombat().isDead() || player.getCombat().isTruelyDead()) {",
  "if (!player.getCombat().canAttack(opponent, false)) {",
  "if (!observedSelfCanMeleeReachThisTick(delayedInfoFor(opponent))) {",
  "private static final int SPEC_QUEUE_COOLDOWN_TICKS = 10;",
  "queued_recently",
  "if (player.isFrozen() && isDiagonalAdjacent(opponent)) {",
  "if (!hasClientSpecControlForSpecialThisTick()) {",
  "maybeEquipGraniteMaulForSpec(opponent)",
  "private boolean hasClientSpecControlForSpecialThisTick() {",
  "return weaponShowsSpecialBar(tickStartWeaponId);",
  "private boolean canApproachGraniteMaulSpecSoon(Player opponent, boolean doubleSpec, int distance) {",
  "private boolean shouldApproachForSpec(Player opponent, int distance) {",
  "return specApproachWindow(opponent, false) >= SPEC_APPROACH_WINDOW_FLOOR;",
  "private double gmaulCredibleSpecWindow(boolean doubleSpec, int opponentHp, int recentHit, double exposure,",
  "private double gmaulSetupScore(boolean doubleSpec, int opponentHp, int recentHit, double exposure, boolean meleeProtected) {",
  "private int visibleHpOrDefault(OpponentInfoSnapshot delayed, int fallback) {",
  "private int clientVisibleOpponentHp(Player opponent) {",
  "return Math.max(1, Math.min(99, ((hp + 2) / 5) * 5));",
  "private double opponentMeleeSpecExposure(OpponentInfoSnapshot delayed) {",
  "private double softKoRisk(int hp, int possibleDamage, int margin) {",
  "private double stylePressureReward(Player opponent, int opponentProtectionMask, int liveDistance)",
  "private double gearWeaknessPressureReward(Player opponent, int opponentProtectionMask, int liveDistance)",
  "private double meleeThreatPotential(Player opponent, int opponentProtectionMask, int liveDistance)",
  "private double meleeTelegraphReward(Player opponent, int opponentProtectionMask, boolean practicalMeleeReach",
  "private double freezeUnderNoPressureReward(Player opponent, int liveDistance, int dealtDelta, boolean productiveControl)",
  "private double underControlReward(Player opponent,",
  "private boolean isProductiveUnderControl(Player opponent,",
  "private double underControlValue(Player opponent, int selfHp, int selfPrayerPoints, boolean selfAttackReadyNow)",
  "private static final double REWARD_GEAR_WEAKNESS_PRESSURE_SCALE = 0.082D;",
  "private static final double REWARD_MELEE_TELEGRAPH_PENALTY = 0.034D;",
  "private static final double REWARD_FREEZE_STAND_UNDER_BONUS = 0.065D;",
  "private static final double REWARD_UNDER_CONTROL_ENTRY_BONUS = 0.135D;",
  "private static final double REWARD_MELEE_OUT_OF_RANGE_PENALTY = 0.024D;",
  "private static final double REWARD_POTTED_STATE_PER_LEVEL = 0.00045D;",
  "private static final double REWARD_BREWED_DOWN_PER_LEVEL = 0.00065D;",
  "private static final double REWARD_COMBAT_DEFICIT_PENALTY_SCALE = 0.18D;",
  "private static final double REWARD_DEATH_UNUSED_HEALING_SUPPLY_PENALTY = 10.0D;",
  "private static final double REWARD_DEATH_NO_GOOD_SUPPLY_PENALTY = 4.0D;",
  "int boostedCombatLevels = totalBoostedCombatLevels();",
  "rewardTick -= combatDeficitScore() * REWARD_COMBAT_DEFICIT_PENALTY_SCALE;",
  "int unusedHealingSupplies = countAvailableFood(player) + countAny(player, BREW_IDS);",
  "rewardEpisodeHealingSupplyEvents <= 0",
  "rewardEpisodeGoodSupplyEvents <= 0",
  "private static final int SPEC_OUTCOME_WINDOW_TICKS = 4;",
  "rememberPendingSpecOutcome(opponent, tick, specialKind, doubleSpec",
  "private void applyPendingSpecOutcome(Player opponent, long tick, int dealtDelta, int opponentHp)",
  "delta += REWARD_SPEC_OUTCOME_DAMAGE_SCALE * clamp01(dealtDelta / expectedHit);",
  "clearPendingSpecOutcome();",
  "private OffenceStyle decideOffenceStyle(Player opponent) {",
  "OffenceStyle evStyle = bestExpectedOffenceStyle(opponent, wantsFreeze);",
  "OffenceStyle protectionCounter = counterFromProtectionMask(protectionMask, wantsFreeze);",
  "OffenceStyle liveStyle = getLikelyOffenceStyle(opponent);",
  "OffenceStyle gearStyle = getLikelyOffenceStyleFromGear(opponent);",
  "OffenceStyle best = bestOffenceAgainst(opponent, protectedStyle);",
  "return Random.rollDie(4, 1);",
  "private CombatDecision scriptedFallbackDecision(Player opponent) {",
  "MovementIntent movement = MovementIntent.PRESSURE;",
  "movement = MovementIntent.STAND_UNDER;",
  "SupplyIntent.NONE, SpecIntent.NONE, \"script_fallback\""
]) {
  assert(serverBotSource.includes(snippet), `server bot source missing policy executor anchor ${snippet}`);
}
for (const snippet of [
  "public boolean canAttack(Entity target, boolean message) {",
  "if(isDead())",
  "if(target == null || target.isHidden())",
  "if(player.isStunned())",
  "if(!multiCheck(target, message))",
  "if(!player.attackPlayerListener.allow(player, target.player, message))",
  "return true;",
  "WeaponType.UNARMED",
  "public AttackStyle getAttackStyle()",
  "return set == null ? AttackStyle.CRUSH : set.style;"
]) {
  assert(serverPlayerCombatSource.includes(snippet), `server PlayerCombat source missing combat anchor ${snippet}`);
}

for (const snippet of [
  "const gmaulFeatures = gmaulFeatureWindow(context);",
  "const opponentVisibleHp = clientVisibleOpponentHp(context);",
  "const policyThreatRange = 8;",
  "const selfCanAttackFromObserved = canAttackFromObservedFeature(context, selfStyle);",
  "const scriptedOffenceStyle = context.scriptedOffenceStyle ?? styleBucket(context.bestVisibleStyle);",
  "const selfCanSpecSingleNow = canUseSpecialSpecFromObserved(context, false);",
  "const selfCanSpecDoubleNow = canUseSpecialSpecFromObserved(context, true);",
  "export function resetNhPolicyFeatureState(state: NhPolicyFeatureState): void",
  "input.push(boolFeature(context.rewardEpisodeActive ?? true));",
  "function gmaulFeatureWindow(context: NhDuelControllerContext): GmaulFeatureWindow",
  "input.push(boolFeature(selfCanSpecSingleNow));",
  "input.push(boolFeature(selfCanSpecDoubleNow));",
  "canUseSpecialSpecFromObserved(context, false)",
  "canApproachSpecialSpecSoon(context, true)",
  "!canAct(context.self.locks, context.tick) ||",
  "function clientGmaulKoChanceEstimate(",
  "const effectiveDamage = Math.max(1, Math.round(maxSpecDamage * exposure * prayerFactor));",
  "export function nhPolicyGmaulSpecApproachWindow",
  "function gmaulCredibleSpecWindow(",
  "function gmaulSetupScore(",
  "function opponentSpecialSpecExposure(context: NhDuelControllerContext, specialKind: NhSpecialWeaponKind): number",
  "return Math.max(0.62, Math.min(1.32, exposure));",
  "function clientVisibleOpponentHp(context: NhDuelControllerContext): number",
  "Math.trunc((hp + 2) / 5) * 5",
  "function canAttackFromObservedFeature(context: NhDuelControllerContext, style: NhOffenceStyle): boolean",
  "function softKoRisk(hp: number, possibleDamage: number, margin: number): number"
]) {
  assert(policyFeaturesSource.includes(snippet), `policy feature source missing Gmaul inference snippet ${snippet}`);
}

for (const snippet of [
  "readonly scriptedWantsFreeze?: boolean;",
  "readonly scriptedOffenceStyle?: NhOffenceStyle;",
  "scriptedOffenceStyle: chooseScriptedFallbackOffence(context)",
  "function chooseScriptedFallbackOffence",
  "context.scriptedWantsFreeze ?? scriptedShouldAttemptFreeze(context, protectedStyle)",
  "function scriptedBestExpectedOffenceStyle",
  "function scriptedCounterFromProtectionMask",
  "function scriptedBestOffenceAgainst",
  "return context.tick % 6 === 0;",
  "Source: NhStakerBot.scriptedFallbackDecision()",
  "function chooseScriptedFallbackDefence",
  "Source: NhStakerBot.protectionPrayerFor() checks delayed likely style",
  "context.opponent.lastOffenceStyle ?? context.opponent.lastVisibleOpponentStyle",
  "activeProtectionPrayer(context.self.activePrayers) ?? \"protect_from_melee\"",
  "movementIntent: chooseScriptedFallbackMovement(context)",
  "supplyIntent: \"none\"",
  "specIntent: \"none\"",
  "function chooseScriptedFallbackMovement",
  "Source: NhStakerBot.RESTORE_IDS includes super restores before sanfews",
  "return [[\"super_restore\", \"sanfew_serum\"], [\"bastion\", \"ranging_potion\"], [\"super_combat\"]];",
  "Source: NhStakerBot.applySupplyIntent() passes opponent != null && isAggressingBot(opponent);",
  "low HP is applied separately inside stripDefencePenaltyWeight().",
  "Source: NhStakerBot.OFFENCE_STRIP_SLOTS.",
  "const offenceStripSlots: readonly EquipmentSlot[] = [\"shield\", \"body\", \"legs\", \"head\", \"cape\", \"amulet\", \"hands\", \"feet\"]"
]) {
  assert(duelSource.includes(snippet), `duel context source missing scripted fallback style snippet ${snippet}`);
}
{
  const state = nhDuel.createInitialNhDuelState();
  const self = {
    ...state.actors.self,
    stats: {
      ...state.actors.self.stats,
      hitpoints: { ...state.actors.self.stats.hitpoints, current: 30 }
    }
  };
  const opponent = {
    ...state.actors.opponent,
    lastOffenceStyle: "magic",
    lastVisibleOpponentStyle: "ranged"
  };
  const action = nhDuel.scriptedNhController.chooseAction(nhDuel.createNhDuelControllerContext(4, self, opponent));
  assert(action.defencePrayer === "protect_from_magic", `scripted fallback should protect against likely offence, got ${action.defencePrayer}`);
  assert(action.movementIntent === "pressure", `scripted fallback should default to pressure, got ${action.movementIntent}`);
  assert(action.supplyIntent === "none", `scripted fallback should not issue supply intents, got ${action.supplyIntent}`);
  assert(action.specIntent === "none", `scripted fallback should not issue spec intents, got ${action.specIntent}`);

  const gearOnlyOpponent = {
    ...opponent,
    lastOffenceStyle: null,
    lastVisibleOpponentStyle: "ranged"
  };
  const gearOnlyAction = nhDuel.scriptedNhController.chooseAction(
    nhDuel.createNhDuelControllerContext(4, self, gearOnlyOpponent)
  );
  assert(
    gearOnlyAction.defencePrayer === "protect_from_missiles",
    `scripted fallback defence should mirror Java protectionPrayerFor gear-style fallback, got ${gearOnlyAction.defencePrayer}`
  );

  const noThreatSelf = {
    ...self,
    activePrayers: ["protect_from_magic"]
  };
  const noThreatOpponent = {
    ...opponent,
    lastOffenceStyle: null,
    lastVisibleOpponentStyle: null
  };
  const noThreatAction = nhDuel.scriptedNhController.chooseAction(
    nhDuel.createNhDuelControllerContext(4, noThreatSelf, noThreatOpponent)
  );
  assert(
    noThreatAction.defencePrayer === "protect_from_magic",
    `scripted fallback defence should keep current standard protection prayer before melee fallback, got ${noThreatAction.defencePrayer}`
  );

  const farOpponent = {
    ...opponent,
    tile: { ...opponent.tile, x: self.tile.x + 10 },
    activePrayers: [],
    lastOffenceStyle: "magic",
    lastVisibleOpponentStyle: "melee"
  };
  const farContext = nhDuel.createNhDuelControllerContext(4, self, farOpponent);
  const farAction = nhDuel.scriptedNhController.chooseAction(farContext);
  assert(
    farContext.scriptedOffenceStyle === "ranged" && farAction.offenceStyle === "ranged",
    `scripted fallback should counter delayed likely magic with ranged when EV is unavailable: ${JSON.stringify({
      context: farContext.scriptedOffenceStyle,
      action: farAction.offenceStyle
    })}`
  );

  const doubleProtectedOpponent = {
    ...farOpponent,
    activePrayers: ["protect_from_magic", "protect_from_missiles"]
  };
  const doubleProtectedAction = nhDuel.scriptedNhController.chooseAction(
    nhDuel.createNhDuelControllerContext(4, self, doubleProtectedOpponent)
  );
  assert(
    doubleProtectedAction.offenceStyle === "melee",
    `scripted fallback should mirror Java counterFromProtectionMask for magic+range protection, got ${doubleProtectedAction.offenceStyle}`
  );

  const frozenOpponent = {
    ...opponent,
    locks: entityLocks.applyFreeze(opponent.locks, 4, 20, "verifier")
  };
  const standUnderAction = nhDuel.scriptedNhController.chooseAction(
    nhDuel.createNhDuelControllerContext(4, self, frozenOpponent)
  );
  assert(
    standUnderAction.movementIntent === "stand_under",
    `scripted fallback should stand under only when opponent is frozen and self can move, got ${standUnderAction.movementIntent}`
  );

  const frozenSelf = {
    ...self,
    locks: entityLocks.applyFreeze(self.locks, 4, 20, "verifier")
  };
  const frozenSelfAction = nhDuel.scriptedNhController.chooseAction(
    nhDuel.createNhDuelControllerContext(4, frozenSelf, frozenOpponent)
  );
  assert(
    frozenSelfAction.movementIntent === "pressure",
    `scripted fallback should not stand under while self is frozen, got ${frozenSelfAction.movementIntent}`
  );
}
{
  const state = nhDuel.createInitialNhDuelState();
  const self = {
    ...state.actors.self,
    tile: { x: 0, y: 0, plane: 0 },
    weaponId: "granite_maul",
    gmaul: { ...state.actors.self.gmaul, specialEnergy: 100 },
    attackTimer: { ...state.actors.self.attackTimer, readyTick: -100 }
  };
  const hiddenOpponent = {
    ...state.actors.opponent,
    observedInfoKnown: false,
    tile: { x: 1, y: 0, plane: 0 },
    equipment: {},
    activePrayers: ["protect_from_magic", "protect_from_missiles", "protect_from_melee"],
    weaponId: "armadyl_crossbow",
    stats: {
      ...state.actors.opponent.stats,
      hitpoints: { ...state.actors.opponent.stats.hitpoints, current: 42 }
    },
    locks: entityLocks.applyFreeze(state.actors.opponent.locks, 12, 20, "verifier"),
    movedThisTick: true,
    lastMoveDx: 3,
    lastMoveDy: -2,
    gmaul: { ...state.actors.opponent.gmaul, specialEnergy: 100 },
    lastOffenceStyle: "ranged",
    lastVisibleOpponentStyle: "ranged"
  };
  const input = policyFeatures.encodeNhPolicyInput(nhDuel.createNhDuelControllerContext(12, self, hiddenOpponent));
  const zeroRanges = [
    [43, 48, "delayed opponent style channels"],
    [52, 54, "delayed opponent prayer mask"],
    [57, 58, "delayed opponent weapon embedding"],
    [71, 76, "melee reach and gmaul windows"]
  ];
  assert(input[0] === 0, `unknown delayed opponent distance should encode as 0, got ${input[0]}`);
  assert(input[2] === 0, `unknown delayed opponent hp should encode as 0, got ${input[2]}`);
  assert(input[8] === 0, `unknown delayed opponent should not expose canAttack, got ${input[8]}`);
  assert(input[13] === 0 && input[15] === 0, `unknown delayed opponent should hide freeze state: ${input[13]}/${input[15]}`);
  assert(input[17] === 0 && input[29] === 0 && input[30] === 0, "unknown delayed opponent should hide movement state");
  assert(
    input[31] === -1 / 16 && input[32] === -1 / 16,
    `unknown delayed opponent rel tile should use Java unknown snapshot coords: ${input[31]}/${input[32]}`
  );
  assert(input[33] === 1, "unknown delayed opponent should still expose target presence like Java targetIndex");
  assert(input[59] === 1, `unknown delayed opponent should still expose client-side spec estimate, got ${input[59]}`);
  for (const [start, end, label] of zeroRanges) {
    for (let index = start; index <= end; index += 1) {
      assert(input[index] === 0, `${label} index ${index} should be hidden, got ${input[index]}`);
    }
  }
}
assert(
  !duelSource.includes("actor.weaponId === \"armadyl_crossbow\" ? [\"super_restore\", \"bastion\"]"),
  "duel restore/reboost should follow Java reboost potion order instead of keying off only Armadyl crossbow"
);

const runtimePolicySource = readProject("src/sim/nh/runtime-policy-opponent.ts");
const runtimePolicyTargetingSource = readProject("src/sim/nh/runtimePolicyTargeting.ts");
const runtimeSceneViewerSource = readProject("src/ui/RuntimeSceneViewer.tsx");
const runtimeCombatSource = readProject("src/sim/runtimePlayerCombat.ts");
for (const snippet of [
  "private static final int DELAYED_OPP_INFO_DELAY_TICKS = 1;",
  "private static OpponentInfoSnapshot unknown(Player opponent, long tick)",
  "return new OpponentInfoSnapshot(tick, opponent.getIndex(), 0, null, null,",
  "if (!candidate.isAtLeastTicksOld(tick, DELAYED_OPP_INFO_DELAY_TICKS))",
  "delayedOpponentInfo = delayed != null ? delayed : OpponentInfoSnapshot.unknown(opponent, tick);",
  "private int observedDistance(OpponentInfoSnapshot snapshot, Player opponent)",
  "snapshot == null || snapshot.x < 0 || snapshot.y < 0"
]) {
  assert(serverBotSource.includes(snippet), `server bot source missing delayed unknown-opponent anchor ${snippet}`);
}
for (const snippet of [
  "const opponentInfoKnown = observedOpponentInfoKnown(context);",
  "function observedOpponentInfoKnown(context: NhDuelControllerContext): boolean",
  "return context.opponent.observedInfoKnown !== false;",
  "pushStyle(input, opponentInfoKnown ? opponent.lastOffenceStyle : null);",
  "pushProtectionMask(input, opponentInfoKnown ? opponent : null);",
  "pushWeaponEmbedding(input, opponentInfoKnown ? opponent.weaponId : null);",
  "OpponentInfoSnapshot.unknown(), but still writes estimateOpponentSpecialEnergyClientSide().",
  "input.push(clamp01((opponent.gmaul.specialEnergy * 10) / 1000));",
  "if (!observedOpponentInfoKnown(context))",
  "return -1;"
]) {
  assert(policyFeaturesSource.includes(snippet), `policy feature source missing delayed unknown-opponent snippet ${snippet}`);
}
for (const snippet of [
  "readonly observedInfoKnown?: boolean;",
  "const observedInfoKnown = actorView.observedInfoKnown !== false;",
  "const equipment = observedInfoKnown ? actorView.equipment ?? actor.equipment : {};",
  "observation.estimatedSpecialEnergy === undefined",
  ": { ...actor.gmaul, specialEnergy: 0 }",
  "runtimePolicyUnknownOpponentInfoStats(actor)",
  "context.opponent.observedInfoKnown === false",
  "function runtimePolicyObservedDistance(context: NhDuelControllerContext): number",
  "return -1;",
  "runtimePolicyObservedMeleeReachable(context)",
  "runtimePolicyObservedOpponentMeleeReachable(context)",
  "return activeProtectionPrayer(context.self.activePrayers) ?? \"protect_from_melee\";"
]) {
  assert(runtimePolicySource.includes(snippet), `runtime policy source missing delayed unknown-opponent snippet ${snippet}`);
}
for (const snippet of [
  "manualPolicyUnknownOpponentInfoAppearanceView",
  "observedInfoKnown: false",
  "NhStakerBot.refreshDelayedOpponentInfo() records live info immediately",
  "observedInfoKnown: observedLocalAppearance.observedInfoKnown"
]) {
  assert(runtimeSceneViewerSource.includes(snippet), `runtime viewer source missing delayed unknown-opponent snippet ${snippet}`);
}
assertOrderedSnippets(
  runtimeSceneViewerSource,
  [
    "const policyTickGate = resolveManualOpponentPolicyTick(combatStateForTick);",
    "policyResponse = queueManualOpponentCombatResponse(combatStateForTick, local, opponent, opponentPolicySelfMovement);",
    "const result = advanceRuntimePlayerCombat(combatStateForTick,",
    "manualOpponentObservedLocalAppearanceRef.current = manualPolicyActorAppearanceView("
  ],
  "runtime viewer delayed observation tick order"
);
for (const snippet of [
  "runtimePolicyOpponentActionCoverage",
  "applyRuntimeOpponentPolicyMovementIntent",
  "runtimePolicyActionWithContextGuards",
  "runtimePolicyResolveDefencePrayer",
  "post-supply HP/prayer",
  "runtimePolicyActionWithDelayedPrayerCounter",
  "observedOpponentPrayers: readonly PrayerId[]",
  "activeProtectionPrayer(observedOpponentPrayers)",
  "runtimePolicyProtectedStyleFromPrayer",
  "runtimePolicyCounterPrayerStyle",
  "runtimePolicyAllowStepOutByContext",
  "runtimePolicyAllowOffenceStripByContext",
  "runtimePolicyIsAggressingActor",
  "runtimePolicyActorWasDefendingRecently",
  "runtimePolicyProtectionPrayerForOpponent",
  "runtimePolicyResolveThreatStyle",
  "Source: NhStakerBot.resolveThreatStyle() uses delayed likely style first",
  "selfPlayMode",
  "runtimePolicyShouldAllowSmite",
  "runtimePolicyAttackRangeForThreat",
  "runtimePolicyShouldAttemptRedemption",
  "runtimePolicyIsLikelyUnderThreat",
  "runtimePolicyEstimatedThreatMaxHit",
  "return 33;",
  "return 46;",
  "return 48;",
  "runtimePolicyBestExpectedOffenceStyle",
  "runtimePolicyStyleInOffensiveRange",
  "function runtimePolicyWantsFreeze(context: NhDuelControllerContext): boolean",
  "Source: NhStakerBot.applyContextGuards() uses a stateless wantsFreeze",
  "differs from scriptedFallbackDecision()",
  "runtimePolicyClientThreatRange",
  "runtimePolicyClientStyleEvGuardMargin",
  "runtimePolicyDirectionalStepWouldStarveTargetRoute(input, nextTile)",
  "actor.gearProfile?.rangedWeaponId",
  "runtimePolicyNextRepositionTickAfterMovement",
  "RuntimePolicyProjectileLineOfSightPredicate",
  "ensureRuntimeOpponentPolicyMagicLineOfSight",
  "runtimePolicyMagicLineOfSightStepTile",
  "runtimePolicyTryStepAwayTile",
  "runtimePolicyPressureApproachTile",
  "RuntimePolicyTargetRouteStepPredicate",
  "RuntimePolicyTileRouteStepPredicate",
  "input.targetRouteStep(input.opponentTile, input.localTile, 1",
  "runtimePolicyStandUnderRouteTile",
  "input.tileRouteStep(input.opponentTile, input.localTile",
  "input.action.offenceStyle === \"melee\" && !input.context.meleeReachable",
  "nhPolicyGmaulSpecApproachWindow",
  "runtimePolicySpecApproachWindowFloor",
  "RuntimePolicyStepPredicate",
  "allowTargetTile",
  "reposition-cooldown",
  "blockedReason: \"collision\"",
  "inferNhSelectedGearProfile",
  "nhGearProfileActionEquipment",
  "nhGearProfileCandidateEquipmentByStyle",
  "nhGearProfileUsableBotSourceProfile",
  "setRuntimePolicyOpponentGearProfile",
  "runtimePolicyActorObservation",
  "likelyOffenceStyle?: NhOffenceStyle",
  "runtimePolicyDelayedOpponentInfoDelayTicks = 1",
  "Longer attack history is only belief evidence, not the primary likely style.",
  "event.tick >= earliestLikelyOffenceTick",
  "runtimePolicyStyleForCombatStyle(event.style)",
  "const reward = runtimePolicyActorRewardSnapshot(state.events, actorId, previousTick, rewardEpisodeStartTick);",
  "runtimePolicyRewardDamageTakenWeight = 0.7",
  "runtimePolicyRewardRollingWindowTicks = 8",
  "runtimePolicyRewardDeathPenalty = 50",
  "runtimePolicySpecKoWindowScale = 4.25",
  "runtimePolicySpecCredibleWindowScale = 2.05",
  "runtimePolicySpecMissedWindowPenalty = 0.95",
  "runtimePolicyGmaulSpecReward",
  "runtimePolicyMissedGmaulSpecReward",
  "runtimePolicyApplyPendingGmaulSpecOutcome",
  "runtimePolicyPendingGmaulSpecEvent",
  "runtimePolicySpecOutcomeWindowTicks = 4",
  "runtimePolicySpecOutcomeKillBonus = 4.75",
  "RuntimePolicyRewardDetails",
  "sourcePolicyRewardId",
  "kind: \"policy-reward\"",
  "\"gmaul_spec\"",
  "\"gmaul_missed_spec\"",
  "\"gmaul_spec_outcome\"",
  "summary.policyReward",
  "runtimePolicyVisibleStyleFromEquipment",
  "runtimePolicyReliableMagicSpellStyle",
  "actor.queuedSpellId !== null || (actor.autocastSpellId !== null && weaponStyle === \"magic\")",
  "runtimePolicyVisibleGearStyleFromEquipment",
  "Source: NhStakerBot.detectLikelyOffenceStyleFromGearLive() records only",
  "runtimePolicyPrayersForAction",
  "runtimePolicyCanActivatePreferredOffencePrayer",
  "offensivePrayerForPolicyStyle(offencePrayerAction.offenceStyle, actor)",
  "actor.fixedLevels.defence >= 70",
  "applyOffencePrayer(decision.offencePrayer, desiredOffence)",
  "actor.prayerPoints <= 0",
  "[\"augury\", \"mystic_might\"]",
  "[\"rigour\", \"eagle_eye\"]",
  "[\"piety\", \"ultimate_strength\"]",
  "const definition = prayerDefinitions[prayer]",
  "Source: NhStakerBot.activateOffencePrayer() tries the preferred offence prayer",
  "runtimePolicyStyleFromOffensivePrayers",
  "Source: NhStakerBot.styleFromWeapon() checks guaranteed magic ids before",
  "22288, // TRIDENT_OF_THE_SEAS_E",
  "22292, // TRIDENT_OF_THE_SWAMP_E",
  "runtimePolicyStyleFromWeaponAttackSets",
  "Source: NhStakerBot.isReliableMagicSpellState() treats queued spells as",
  "runtimePolicyStyleFromAttackSet",
  "Source: PlayerCombat.updateWeapon() falls back to WeaponType.UNARMED",
  "Source: NhStakerBot.styleFromAttackStyle() uses PlayerCombat.getAttackStyle()",
  "Source: NhStakerBot.styleFromOffensivePrayers() uses offensive prayer cues",
  "prayers.includes(\"mystic_will\")",
  "prayers.includes(\"mystic_lore\")",
  "prayers.includes(\"mystic_might\")",
  "prayers.includes(\"sharp_eye\")",
  "prayers.includes(\"hawk_eye\")",
  "prayers.includes(\"eagle_eye\")",
  "prayers.includes(\"ultimate_strength\")",
  "prayers.includes(\"chivalry\")",
  "prayers.includes(\"superhuman_strength\")",
  "prayers.includes(\"burst_of_strength\")",
  "runtimePolicyVisibleStyleFromAttackBonuses",
  "const ammoStyle = runtimePolicyVisibleAmmoStyleFromEquipment(equipment);",
  "const attackBonusStyle = runtimePolicyVisibleStyleFromAttackBonuses(equipment);",
  "const attackStyle = observedInfoKnown ? runtimePolicyStyleFromAttackSet(actor, equipment, weaponStyle) : null;",
  "const weaponOrAttackStyle = weaponStyle === \"magic\" && attackStyle === \"melee\"",
  "const likelyOffenceStyle = observedInfoKnown",
  "? observation.likelyOffenceStyle ?? spellStyle ?? weaponOrAttackStyle ?? prayerStyle ?? ammoStyle ?? attackBonusStyle",
  ": null;",
  "const policyOffenceStyle = policyRole === \"policy-self\" ? actor.policyOffenceStyle ?? null : likelyOffenceStyle;",
  "lastOffenceStyle: policyOffenceStyle",
  "lastVisibleOpponentStyle: observedInfoKnown ? visibleGearStyle : null",
  "runtimePolicyActorRewardSnapshot",
  "runtimePolicyActorRewardEventSummary",
  "runtimePolicyApplyTickRewardShaping",
  "runtimePolicyEnsurePrayerPoints",
  "const stateWithPrayer = runtimePolicyEnsurePrayerPoints(stateWithRewardShaping, \"opponent\");",
  "readonly inPvpCombatArea?: boolean;",
  "input.selfPlayMode !== true && input.inPvpCombatArea === false",
  "resetRuntimePlayerCombatActorPolicyDisengage(stateWithPendingOutcome, \"opponent\")",
  "runtimePolicyLeftPvpNoopAction",
  "movementBlockedReason: \"left-pvp\"",
  "Source: NhStakerBot.ensurePrayerPoints() restores current prayer to fixed",
  "runtimePolicyRecoverStyleStall",
  "runtimePolicyStyleStallThresholdTicks = 6",
  "runtimePolicyClearStyleStallIfReady",
  "runtimePolicyStyleReadyForDecision",
  "Source: NhStakerBot.recoverStyleStall() retries switchToStyle()",
  "!styleStall.forceStyleSwitch",
  "runtimePolicyEnforceMagicCoreArmor",
  "Source: NhStakerBot.enforceMagicCoreArmor() runs after flexible gear",
  "if (effectiveAction.offenceStyle === \"magic\") {",
  "runtimePolicyStylePressureReward",
  "runtimePolicyGearWeaknessPressureReward",
  "runtimePolicyMeleeThreatPotential",
  "runtimePolicyMeleeTelegraphReward",
  "runtimePolicyFreezeControlRewards",
  "runtimePolicyStatStateReward",
  "runtimePolicyDeathSupplyReward",
  "runtimePolicyUnderControlValue",
  "runtimePolicySpacingRewards",
  "runtimePolicyProtectedStyleStickGraceTicks = 2",
  "runtimePolicyGearWeaknessPressureScale = 0.082",
  "runtimePolicyMeleeTelegraphPenalty = 0.034",
  "runtimePolicyFreezeStandUnderBonus = 0.065",
  "runtimePolicyUnderControlEntryBonus = 0.135",
  "runtimePolicyMeleeOutOfRangePenalty = 0.024",
  "runtimePolicyPottedStatePerLevel = 0.00045",
  "runtimePolicyBrewedDownPerLevel = 0.00065",
  "runtimePolicyCombatDeficitPenaltyScale = 0.18",
  "runtimePolicyDeathUnusedHealingSupplyPenalty = 10",
  "runtimePolicyDeathNoGoodSupplyPenalty = 4",
  "\"style_pressure\"",
  "\"gear_weakness\"",
  "\"melee_threat\"",
  "\"melee_telegraph\"",
  "\"freeze_under_no_pressure\"",
  "\"under_control\"",
  "\"freeze_position\"",
  "\"spec_approach\"",
  "\"melee_range\"",
  "\"range_spacing\"",
  "\"frozen_cast\"",
  "\"stat_state\"",
  "\"death_supply\"",
  "applyRuntimeOpponentPolicyEquipmentIntent",
  "inventoryItems: observedInfoKnown ? actorView.inventoryItems : []",
  "runtimePolicyInventorySlotsForItems",
  "runtimePolicyNormalizeBotInventorySlots",
  "runtimePolicySuppliesForInventorySlots",
  "const currentOffenceStyle = context.self.lastOffenceStyle ?? null;",
  "const desiredOrCurrentOffenceStyle = currentOffenceStyle ?? effectiveAction.offenceStyle;",
  "const contextGuardedAction = runtimePolicyActionWithContextGuards(",
  "let effectiveAction = runtimePolicyActionWithDelayedPrayerCounter(",
  "localPolicyActor.activePrayers",
  "effectiveAction = runtimePolicyActionWithAllowedSpecIntent(",
  "const sourceInventoryVisible = input.allowSourceLoadoutSync !== false && input.localActor.inventoryItems !== undefined;",
  "const sourceSyncReady =",
  "stateWithPendingOutcome.tick >= stateWithPendingOutcome.actors.opponent.policyNextLoadoutSyncTick",
  "nhGearProfileUsableBotSourceProfile(localGearProfile)",
  "runtimePolicySyncOpponentGearProfileFromSource",
  "policyNextLoadoutSyncTick",
  "runtimePolicyPerformEmergencyRecovery",
  "runtimePolicyNeedsEmergencyRecovery",
  "runtimePolicyHasCoreStatsGap",
  "runtimePolicyHasCriticalLoadoutGap",
  "runtimePolicyActorViewAfterEmergencyRecovery",
  "const stateWithRecoveredLoadout = runtimePolicyPerformEmergencyRecovery(",
  "const opponentActorViewForContext = runtimePolicyActorViewAfterEmergencyRecovery(",
  "runtimePlayerCombatDefaultLevels",
  "fixedLevels: runtimePlayerCombatDefaultLevels",
  "runtimePlayerCombatDefaultSupplies",
  "resetFreeze(actor.locks)",
  "stats: runtimePolicyStats(after)",
  "runtimePolicySourceLayoutSignature",
  "policyLoadoutSourceSignature",
  "policyOffenceStyle: undefined",
  "const supplyResult = consumeRuntimeOpponentPolicySupplies(state, contextGuardedAction, context);",
  "if (!canAct(state.actors.opponent.locks, state.tick))",
  "suppressStyleReequipThisTick",
  "setRuntimePolicyOpponentCurrentOffence",
  "style: currentOffenceStyle",
  "runtimePolicyWeaponIdForEquipment",
  "runtimePolicyResolvedSupplyIntent",
  "runtimePolicyNeedsPostBrewRecovery",
  "runtimePolicyHasPostBrewRecoveryWindow",
  "policyPostBrewRecoveryUntilTick",
  "runtimePolicyPostBrewRecoveryUntilAfterSupply",
  "runtimePolicySupplyRecoveryStickyTicks",
  "const consumeItem = (item: ConsumableId): void => {",
  "const consumeRestoreReboostIfNeeded = (): void => {",
  "runtimePolicyNeedsRestoreNow(runtimePolicyStats(nextState.actors.opponent))",
  "runtimePolicyNeedsRangedReboostNow(runtimePolicyStats(nextState.actors.opponent))",
  "runtimePolicyNeedsMeleeReboostNow(runtimePolicyStats(nextState.actors.opponent))",
  "const consumeFirstAvailable = (items: readonly ConsumableId[]): void => {",
  "runtimePolicySupplyItemGroupsForIntent",
  "return [[\"manta_ray\", \"shark\"]];",
  "consumeFirstAvailable([\"super_restore\", \"sanfew_serum\"]);",
  "consumeFirstAvailable([\"bastion\", \"ranging_potion\"]);",
  "consumeFirstAvailable([\"super_combat\"]);",
  "if (supplyIntent === \"restore_reboost\" || supplyIntent === \"panic_full\")",
  "runtimePolicyOpponentSpecialEnergyEstimate",
  "rewardEpisodeStartTick === undefined || event.tick >= rewardEpisodeStartTick",
  "runtimePolicyClientSpecRegenTicks",
  "estimatedSpecialEnergy",
  "specialActive: actor.specialActive",
  "runtimePolicyCanApplySpecialSpecIntent",
  "runtimePolicyActorQueuedGraniteMaulRecently",
  "event.reason === \"gmaul_spec\"",
  "event.reason === \"gmaul_missed_spec\"",
  "runtimePolicySpecQueueCooldownTicks",
  "SPEC_QUEUE_COOLDOWN_TICKS",
  "requireMeleeRange = true",
  "runtimePolicyClientSpecialKoChance(context, specialKind, false, exposure, meleeProtected, opponentHp, false)",
  "runtimePolicyClientGmaulKoChance(context, true, exposure, meleeProtected, opponentHp, false)",
  "runtimePolicyAvailableSpecialWeaponKind(context.self)",
  "isNhGraniteMaulItemId(actor.equipment.weapon.itemId)",
  "context.self.gmaul.specialEnergy < runtimePolicySpecialRequiredEnergy(specialKind, false)",
  "canAct(context.self.locks, context.tick) &&",
  "context.self.stats.hitpoints.current > 0",
  "context.opponent.stats.hitpoints.current > 0",
  "runtimePolicyStyleWeaponCanAttackForSpec(context, action.offenceStyle)",
  "PlayerCombat.canAttack() only checks the",
  "maybeEquipGraniteMaulForSpec() separately requires observed maul",
  "runtimePolicyObservedMeleeReachable(context)",
  "runtimePolicyFrozenDiagonalAdjacent",
  "const actorCanUseFlexibleGear = canAct(state.actors.opponent.locks, state.tick);",
  "const opponentUnderAggression = runtimePolicyIsAggressingActor(state, \"opponent\", \"local-player\");",
  "allowFlexibleGear: false",
  "allowFlexibleGear: actorCanUseFlexibleGear",
  "const javaWouldSwitchToStyle =",
  "flexibleGearPasses: javaWouldSwitchToStyle ? 2 : 1",
  "if (!canAct(actor.locks, state.tick))",
  "underPressure: boolean",
  "underPressure,",
  "low HP is applied separately inside stripDefencePenaltyWeight().",
  "const offenceStripSlots: readonly EquipmentSlot[] = [\"shield\", \"body\", \"legs\", \"head\", \"cape\", \"amulet\", \"hands\", \"feet\"]",
  "const runtimePolicyOffenceStripGainScale = 0;",
  "const runtimePolicyOffenceStripFailPenalty = 0;",
  "const runtimePolicyRegearStyleBonus = 0;",
  "const safeStripWindow = !underPressure && !offenceStyleProtectedAtUse && supply.hpBefore >= 72;",
  "delta += Math.min(0.55, effectiveGain * runtimePolicyOffenceStripGainScale);",
  "delta += underPressure ? runtimePolicyRegearStyleBonus : runtimePolicyRegearStyleBonus * 0.45;",
  "opponentLoadoutId = state.actors.opponent.loadoutId;",
  "runtimePolicyClientOffenceEv",
  'import { nhClientOffenceEv, nhStyleInOffensiveRange, nhWeaknessForStyle } from "./clientOffenceEv";',
  "return nhClientOffenceEv(context, style, stats, actor);",
  "return nhStyleInOffensiveRange(context, style);",
  "return nhWeaknessForStyle(bonuses, style);",
  "runtimePolicyOpponentVisibleHp",
  "runtimePolicyClientVisibleHitpoints",
  "runtimePolicyWeaknessForStyle",
  "runtimePolicyStepAwayDeltas",
  "Source: NhStakerBot.stepAwayFrom() computes -unitVector to the target",
  "Position.area's x-major/y-min-to-max order",
  "projectileLineOfSight: input.projectileLineOfSight",
  "blockedReason: \"projectile-line-of-sight\"",
  "input.action.movementIntent === \"step_out\" && !nextTile",
  "offence_strip_one",
  "offence_strip_two",
  "regear_style",
  "syncRuntimePlayerCombatStateToInput(input.state",
  "setRuntimePlayerCombatAutocast(state, \"opponent\", \"ice-barrage\")",
  "requestRuntimePlayerCombatAttack(state, \"opponent\", \"local-player\")",
  "rewardEpisodeId: input.rewardEpisodeId",
  "rewardEpisodeActive: input.rewardEpisodeActive"
]) {
  assert(runtimePolicySource.includes(snippet), `runtime policy adapter missing executor snippet ${snippet}`);
}
const runtimeVisibleStyleFromWeaponBlock = extractBlockAfter(
  runtimePolicySource,
  "function runtimePolicyVisibleStyleFromWeapon(item: VisibleEquipmentItem | undefined): NhOffenceStyle | null"
);
assert(
  runtimeVisibleStyleFromWeaponBlock.includes("runtimePolicyStyleFromWeaponAttackSets") &&
    !runtimeVisibleStyleFromWeaponBlock.includes("runtimePolicyStyleFromBonuses"),
  "runtimePolicyVisibleStyleFromWeapon should mirror Java styleFromWeapon attack-set detection and keep attack-bonus inference in the later likely-style fallback"
);
assert(
  !runtimePolicySource.includes("underPressure: actor.hitpoints <= 72"),
  "runtime policy offence-strip pressure must come from Java isAggressingBot, not a TS-only HP threshold"
);
const runtimeActionGuardsBlock = extractBlockAfter(
  runtimePolicySource,
  "function runtimePolicyActionWithContextGuards("
);
const runtimeWantsFreezeBlock = extractBlockAfter(
  runtimePolicySource,
  "function runtimePolicyWantsFreeze("
);
assert(
  !runtimeWantsFreezeBlock.includes("scriptedWantsFreeze"),
  "runtime policy EV guard must not use scriptedWantsFreeze; Java applyContextGuards uses its own stateless wantsFreeze"
);
assert(
  !runtimeActionGuardsBlock.includes("defencePrayer === \"redemption\""),
  "runtime policy applyContextGuards must not pre-reject Redemption; Java resolveDefencePrayer checks it after supply use"
);
assert(
  !runtimeActionGuardsBlock.includes("runtimePolicyShouldAllowSmite"),
  "runtime policy applyContextGuards must not pre-reject self-play Smite; Java resolveDefencePrayer checks it after supply use"
);
assert(
  !extractBlockAfter(runtimePolicySource, "function runtimeLoadoutForPolicyAction").includes("gmaul-bandos"),
  "runtime policy spec actions must not map to full gmaul-bandos; Java maybeEquipGraniteMaulForSpec only swaps the weapon slot"
);
assert(
  !runtimePolicySource.includes("threatStyle: context.opponent.lastOffenceStyle") &&
    !runtimePolicySource.includes("const threatStyle = context.opponent.lastOffenceStyle;"),
  "runtime policy threat-style consumers must use NhStakerBot.resolveThreatStyle() parity fallback instead of likely-style only"
);
assert(
  extractBlockAfter(runtimePolicySource, "}): RuntimePolicyOpponentResult {").includes(
    "const resolvedThreatStyle = runtimePolicyResolveThreatStyle(context);"
  ) &&
    extractBlockAfter(runtimePolicySource, "}): RuntimePolicyOpponentResult {").includes("threatStyle: resolvedThreatStyle"),
  "runtime policy flexible gear should pass the resolved likely-style/visible-gear threat fallback"
);
assert(
  extractBlockAfter(runtimePolicySource, "function applyRuntimeOpponentPolicyEquipmentIntent").includes(
    "threatStyle: runtimePolicyResolveThreatStyle(context),"
  ),
  "runtime policy offence-strip gear utility should use the same resolved threat style as Java applySupplyIntent()"
);
assert(
  runtimePolicySource.includes("function runtimePolicyDefenceBeliefReward(") &&
    runtimePolicySource.includes("const threatStyle = runtimePolicyResolveThreatStyle(context);") &&
    extractBlockAfter(runtimePolicySource, "function runtimePolicyUnderControlValue").includes(
      "const threatStyle = runtimePolicyResolveThreatStyle(context);"
    ),
  "runtime policy reward shaping should use Java resolveThreatStyle() likely-style/visible-gear fallback"
);
assertOrderedSnippets(
  extractBlockAfter(runtimePolicySource, "}): RuntimePolicyOpponentResult {"),
  [
    "const stateWithSyncedGearProfile = runtimePolicySyncOpponentGearProfileFromSource(",
    "const stateWithRecoveredLoadout = runtimePolicyPerformEmergencyRecovery(",
    "const stateWithRewardShaping = runtimePolicyApplyTickRewardShaping(",
    "const stateWithPrayer = runtimePolicyEnsurePrayerPoints(",
    "const context = createNhDuelControllerContext("
  ],
  "runtime policy pre-decision recovery order"
);
assertOrderedSnippets(
  extractBlockAfter(runtimePolicySource, "}): RuntimePolicyOpponentResult {"),
  [
    "const contextGuardedAction = runtimePolicyActionWithContextGuards(",
    "let effectiveAction = runtimePolicyActionWithDelayedPrayerCounter(",
    "localPolicyActor.activePrayers",
    "const supplyResult = consumeRuntimeOpponentPolicySupplies(state, contextGuardedAction, context);",
    "const styleStall = runtimePolicyRecoverStyleStall(state, effectiveAction.offenceStyle, context, syncedOpponentGearProfile);",
    "const equipmentResult = applyRuntimeOpponentPolicyEquipmentIntent(",
    "const targetEquipment = nhGearProfileActionEquipment(",
    "if (!suppressStyleReequipThisTick) {",
    "state = setRuntimePlayerCombatLoadout(state, \"opponent\", targetLoadoutId);",
    "if (effectiveAction.offenceStyle === \"magic\") {",
    "state = runtimePolicyEnforceMagicCoreArmor(state, syncedOpponentGearProfile);",
    "state = setRuntimePlayerCombatAutocast(state, \"opponent\", \"ice-barrage\");",
    "const contextAfterSupply = runtimePolicyContextWithSelfActor(",
    "const resolvedDefencePrayer = runtimePolicyResolveDefencePrayer(",
    "state = setRuntimePolicyOpponentCurrentOffence(state, effectiveAction.offenceStyle);",
    "runtimePolicyPrayersForAction(state.actors.opponent, effectiveAction, contextGuardedAction)",
    "if (effectiveAction.specIntent !== \"none\") {",
    "state = appendRuntimePolicyRewardEvent(",
    "} else if (action.specIntent === \"none\" && input.rewardEpisodeActive) {",
    "const movementResult = applyRuntimeOpponentPolicyMovementIntent({",
    "const magicLineOfSightResult = ensureRuntimeOpponentPolicyMagicLineOfSight({",
    "state = requestRuntimePlayerCombatAttack(state, \"opponent\", \"local-player\");"
  ],
  "runtime policy live execution order"
);
for (const snippet of [
  "private static final int TARGET_TRACK_DISTANCE = 16;",
  "private static final int NO_TARGET_GRACE_TICKS = 8;",
  "private static final int ENGAGEMENT_STICKY_TICKS = 12;",
  "private Player resolveOpponent() {",
  "boolean canAttack = player.getCombat().canAttack(lockedTarget, false);",
  "canAttack && recentCombatSignal && tick <= engagementLockUntilTick",
  "cant_attack_relock",
  "if (currentTarget != null && currentTarget.player != null && !canTrack(currentTarget.player))",
  "resetCombatState(\"disengaged\");",
  "resetCombatState(\"left_pvp\");",
  "clearStyleStall();",
  "clearDelayedOpponentInfo();",
  "engagementLockUntilTick = tick + ENGAGEMENT_STICKY_TICKS;",
  "noTargetGraceUntilTick = tick + NO_TARGET_GRACE_TICKS;",
  "!player.getPosition().isWithinDistance(spawnPosition, 3)",
  "player.getMovement().isAtDestination()",
  "player.getRouteFinder().routeAbsolute(spawnPosition.getX(), spawnPosition.getY());",
  "boolean freshFightReset = shouldResetForFreshFight(reason);",
  "private boolean shouldResetForFreshFight(String reason)",
  "private void resetForFreshFight(String reason)",
  "prepareFreshState(true);",
  "player.getMovement().teleport(spawnPosition.copy());",
  "if (distance > TARGET_TRACK_DISTANCE) {",
  "player.getCombat().lastAttacker == opponent && player.getCombat().isDefending(2)",
  "opponent.getCombat().lastAttacker == player && opponent.getCombat().isDefending(2)",
  "return lockedTarget;"
]) {
  assert(serverBotSource.includes(snippet), `server bot source missing target tracking anchor ${snippet}`);
}
for (const snippet of [
  "export const runtimePolicyTargetTrackDistance = 16;",
  "export const runtimePolicyNoTargetGraceTicks = 8;",
  "export const runtimePolicyEngagementStickyTicks = 12;",
  "export function resolveRuntimePolicyTargetTracking(",
  "input.tick + runtimePolicyEngagementStickyTicks",
  "input.tick + runtimePolicyNoTargetGraceTicks",
  "input.distance >= 0 && input.distance <= runtimePolicyTargetTrackDistance",
  "readonly selfCurrentTargetSignal: boolean;",
  "readonly directCombatSignal: boolean;",
  "input.selfCurrentTargetSignal && !trackable",
  "input.directCombatSignal",
  "resetReposition: true",
  "readonly canAttackSignal: boolean;",
  "input.canAttackSignal",
  "manualOpponentTargetTrackingRef",
  "resolveRuntimePolicyTargetTracking({",
  "pressureTargetSignal",
  "const canAttackSignal = runtimeManualPolicyCanAttackSignal({",
  "PlayerCombat.canAttack() delegates player-vs-player legality",
  "clearRuntimePlayerCombatActorPolicyNoTargetGrace(nextCombatState, \"opponent\")",
  "manualPolicyUnknownOpponentInfoAppearanceView(",
  "runtimePolicyRecentManualIncomingPressureSignal(combatState)",
  "runtimePolicyRecentManualCombatSignal(combatState)",
  "runtimePolicyRecentManualDirectCombatSignal(combatState)",
  "export function shouldRuntimePolicyRouteResetToSpawn(",
  "export function shouldRuntimePolicyResetForFreshFight(",
  "distanceFromSpawn > 3",
  "input.targetDead && !input.actorDead",
  "resetRuntimePlayerCombatActorPolicyFreshFight",
  "teleportManualActorToTile(",
  "shouldRuntimePolicyRouteResetToSpawn({",
  "shouldRuntimePolicyResetForFreshFight({",
  "manualActorHasPendingMovement(resetOpponentActor)",
  "result.movementBlockedReason === \"left-pvp\"",
  "initialManualOpponent.tile",
  "routeManualActor("
]) {
  assert(
    runtimePolicyTargetingSource.includes(snippet) || runtimeSceneViewerSource.includes(snippet),
    `runtime target tracking source missing Java parity snippet ${snippet}`
  );
}
const targetTrackingStart = runtimePolicyTargeting.resolveRuntimePolicyTargetTracking({
  state: runtimePolicyTargeting.emptyRuntimePolicyTargetTrackingState,
  tick: 10,
  localDead: false,
  opponentDead: false,
  distance: 6,
  selfCurrentTargetSignal: true,
  currentTargetSignal: true,
  directCombatSignal: false,
  pressureTargetSignal: false,
  recentCombatSignal: true,
  canAttackSignal: true,
  practiceTargetVisible: false
});
assert(
  targetTrackingStart.shouldRunPolicy &&
    targetTrackingStart.state.fightEngaged &&
    targetTrackingStart.state.engagementLockUntilTick === 22 &&
    targetTrackingStart.state.noTargetGraceUntilTick === 0,
  `target tracking should start and lock for Java ENGAGEMENT_STICKY_TICKS: ${JSON.stringify(targetTrackingStart)}`
);
const targetTrackingPressureStart = runtimePolicyTargeting.resolveRuntimePolicyTargetTracking({
  state: runtimePolicyTargeting.emptyRuntimePolicyTargetTrackingState,
  tick: 10,
  localDead: false,
  opponentDead: false,
  distance: 6,
  selfCurrentTargetSignal: false,
  currentTargetSignal: false,
  directCombatSignal: false,
  pressureTargetSignal: true,
  recentCombatSignal: true,
  canAttackSignal: true,
  practiceTargetVisible: false
});
assert(
  targetTrackingPressureStart.shouldRunPolicy &&
    targetTrackingPressureStart.state.fightEngaged &&
    targetTrackingPressureStart.state.engagementLockUntilTick === 22,
  `target tracking should acquire from Java lastAttacker/isAggressingBot pressure even without a current-target pointer: ${JSON.stringify(targetTrackingPressureStart)}`
);
const targetTrackingDirectCombatCantAttack = runtimePolicyTargeting.resolveRuntimePolicyTargetTracking({
  state: runtimePolicyTargeting.emptyRuntimePolicyTargetTrackingState,
  tick: 10,
  localDead: false,
  opponentDead: false,
  distance: 6,
  selfCurrentTargetSignal: false,
  currentTargetSignal: false,
  directCombatSignal: true,
  pressureTargetSignal: false,
  recentCombatSignal: true,
  canAttackSignal: false,
  practiceTargetVisible: false
});
assert(
  targetTrackingDirectCombatCantAttack.shouldRunPolicy &&
    targetTrackingDirectCombatCantAttack.state.fightEngaged &&
    targetTrackingDirectCombatCantAttack.state.engagementLockUntilTick === 22,
  `target tracking should acquire from Java's two-tick directly-engaged combat window even when canAttack is currently false: ${JSON.stringify(targetTrackingDirectCombatCantAttack)}`
);
const targetTrackingSticky = runtimePolicyTargeting.resolveRuntimePolicyTargetTracking({
  state: targetTrackingStart.state,
  tick: 17,
  localDead: false,
  opponentDead: false,
  distance: 6,
  selfCurrentTargetSignal: false,
  currentTargetSignal: false,
  directCombatSignal: false,
  pressureTargetSignal: false,
  recentCombatSignal: true,
  canAttackSignal: true,
  practiceTargetVisible: false
});
assert(
  targetTrackingSticky.shouldRunPolicy &&
    targetTrackingSticky.state.fightEngaged &&
    targetTrackingSticky.state.engagementLockUntilTick === 22,
  `target tracking should keep locked target during the sticky recent-combat window: ${JSON.stringify(targetTrackingSticky)}`
);
const targetTrackingCantAttackSticky = runtimePolicyTargeting.resolveRuntimePolicyTargetTracking({
  state: targetTrackingStart.state,
  tick: 17,
  localDead: false,
  opponentDead: false,
  distance: 6,
  selfCurrentTargetSignal: false,
  currentTargetSignal: false,
  directCombatSignal: false,
  pressureTargetSignal: false,
  recentCombatSignal: true,
  canAttackSignal: false,
  practiceTargetVisible: false
});
assert(
  !targetTrackingCantAttackSticky.shouldRunPolicy &&
    targetTrackingCantAttackSticky.state.fightEngaged &&
    targetTrackingCantAttackSticky.state.noTargetGraceUntilTick === 25,
  `target tracking should not keep a stale locked target when Java PlayerCombat.canAttack(lockedTarget,false) is false: ${JSON.stringify(targetTrackingCantAttackSticky)}`
);
const targetTrackingGrace = runtimePolicyTargeting.resolveRuntimePolicyTargetTracking({
  state: targetTrackingSticky.state,
  tick: 23,
  localDead: false,
  opponentDead: false,
  distance: 6,
  selfCurrentTargetSignal: false,
  currentTargetSignal: false,
  directCombatSignal: false,
  pressureTargetSignal: false,
  recentCombatSignal: false,
  canAttackSignal: true,
  practiceTargetVisible: false
});
assert(
  !targetTrackingGrace.shouldRunPolicy &&
    targetTrackingGrace.state.fightEngaged &&
    targetTrackingGrace.state.noTargetGraceUntilTick === 31,
  `target tracking should pause during Java NO_TARGET_GRACE_TICKS before reset: ${JSON.stringify(targetTrackingGrace)}`
);
const noTargetGraceStalledState = patchOpponentActor(runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 6, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 26031
}), {
  targetId: "local-player",
  policyStalledStyle: "ranged",
  policyStalledStyleTicks: 3
});
const noTargetGraceCleared = runtimeCombat.clearRuntimePlayerCombatActorPolicyNoTargetGrace(
  noTargetGraceStalledState,
  "opponent"
);
assert(
  noTargetGraceCleared.actors.opponent.targetId === "local-player" &&
    noTargetGraceCleared.actors.opponent.policyStalledStyle === null &&
    noTargetGraceCleared.actors.opponent.policyStalledStyleTicks === 0,
  `no-target grace should clear Java style stall without doing a full resetCombatState(): ${JSON.stringify(noTargetGraceCleared.actors.opponent)}`
);
const targetTrackingReset = runtimePolicyTargeting.resolveRuntimePolicyTargetTracking({
  state: targetTrackingGrace.state,
  tick: 31,
  localDead: false,
  opponentDead: false,
  distance: 6,
  selfCurrentTargetSignal: false,
  currentTargetSignal: false,
  directCombatSignal: false,
  pressureTargetSignal: false,
  recentCombatSignal: false,
  canAttackSignal: true,
  practiceTargetVisible: false
});
assert(
  !targetTrackingReset.shouldRunPolicy &&
    targetTrackingReset.resetReposition &&
    !targetTrackingReset.state.fightEngaged,
  `target tracking should reset after the no-target grace expires: ${JSON.stringify(targetTrackingReset)}`
);
const targetTrackingRouteResetToSpawn = runtimePolicyTargeting.shouldRuntimePolicyRouteResetToSpawn({
  resetReposition: targetTrackingReset.resetReposition,
  actorDead: false,
  targetDead: false,
  movementBlocked: false,
  movementPending: false,
  distanceFromSpawn: 4
});
assert(
  targetTrackingRouteResetToSpawn,
  "reset routing should mirror Java resetCombatState(): route to spawn after non-death reset when movable, idle, and more than 3 tiles away"
);
for (const [label, override] of [
  ["death", { actorDead: true }],
  ["target-death", { targetDead: true }],
  ["movement-blocked", { movementBlocked: true }],
  ["movement-pending", { movementPending: true }],
  ["within-spawn-distance", { distanceFromSpawn: 3 }]
]) {
  const shouldRoute = runtimePolicyTargeting.shouldRuntimePolicyRouteResetToSpawn({
    resetReposition: true,
    actorDead: false,
    targetDead: false,
    movementBlocked: false,
    movementPending: false,
    distanceFromSpawn: 4,
    ...override
  });
  assert(!shouldRoute, `reset routing should not route to spawn for Java-blocked case ${label}`);
}
const targetDeathFreshFightReset = runtimePolicyTargeting.shouldRuntimePolicyResetForFreshFight({
  resetReposition: true,
  actorDead: false,
  targetDead: true
});
assert(targetDeathFreshFightReset, "target death should trigger Java resetForFreshFight() for a live NH bot");
for (const [label, override] of [
  ["non-reset", { resetReposition: false }],
  ["bot-death", { actorDead: true }],
  ["non-death-reset", { targetDead: false }]
]) {
  const shouldFreshReset = runtimePolicyTargeting.shouldRuntimePolicyResetForFreshFight({
    resetReposition: true,
    actorDead: false,
    targetDead: true,
    ...override
  });
  assert(!shouldFreshReset, `fresh fight reset should not trigger for Java-blocked case ${label}`);
}
const staleFreshFightBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 6, z: 0 },
  opponentTile: { x: 12, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "tentacle-bandos",
  seed: 26144
});
const staleFreshFightState = patchOpponentActor(staleFreshFightBase, {
  targetId: "local-player",
  lastTargetId: "local-player",
  lastTargetTimeoutTicks: 4,
  policyOffenceStyle: "melee",
  policyNextLoadoutSyncTick: 21,
  policyNextFreezeAttemptTick: 25,
  policyPostBrewRecoveryUntilTick: 27,
  policyStalledStyle: "ranged",
  policyStalledStyleTicks: 3,
  queuedSpellId: "ice-barrage",
  autocastSpellId: "blood-barrage",
  defensiveCast: true,
  hitpoints: 38,
  maxHitpoints: 99,
  prayerPoints: 13,
  supplies: {
    ...runtimeCombat.runtimePlayerCombatDefaultSupplies,
    manta_ray: 0,
    saradomin_brew: 0
  },
  supplyDelays: {
    ...staleFreshFightBase.actors.opponent.supplyDelays,
    eatDelayUntilTick: 99,
    karambwanDelayUntilTick: 99,
    potionDelayUntilTick: 99
  },
  activePrayers: ["protect_from_magic", "augury"],
  locks: entityLocks.applyFreeze(entityLocks.createEntityLockState(), 0, 10, "local-player"),
  specialActive: true,
  gmaul: {
    ...staleFreshFightBase.actors.opponent.gmaul,
    equippedGraniteMaul: true,
    previousWeaponHadVisibleSpecBar: true,
    queuedSpecs: 2,
    timeoutTicks: 4,
    specialEnergy: 0,
    queuedTargetId: "local-player"
  }
});
const freshFightReset = runtimeCombat.resetRuntimePlayerCombatActorPolicyFreshFight(staleFreshFightState, "opponent", {
  tile: { x: 0, z: 0 }
});
const freshFightOpponent = freshFightReset.actors.opponent;
assert(
  runtimeCombatSource.includes("resetRuntimePlayerCombatActorPolicyFreshFight") &&
    runtimeCombatSource.includes("NhStakerBot.resetForFreshFight() calls prepareFreshState(true)") &&
    runtimeCombatSource.includes("loadoutId: \"kodai-robes\"") &&
    runtimeCombatSource.includes("supplies: runtimePlayerCombatDefaultSupplies"),
  "fresh fight reset helper should remain source-anchored to Java resetForFreshFight/prepareBot"
);
assert(
  freshFightOpponent.tile.x === 0 &&
    freshFightOpponent.tile.z === 0 &&
    freshFightOpponent.loadoutId === "kodai-robes" &&
    freshFightOpponent.hitpoints === 99 &&
    freshFightOpponent.prayerPoints === 99 &&
    freshFightOpponent.targetId === null &&
    freshFightOpponent.lastTargetId === null &&
    freshFightOpponent.policyOffenceStyle === undefined &&
    freshFightOpponent.policyNextLoadoutSyncTick === 0 &&
    freshFightOpponent.policyNextFreezeAttemptTick === 0 &&
    freshFightOpponent.policyPostBrewRecoveryUntilTick === 0 &&
    freshFightOpponent.policyStalledStyle === null &&
    freshFightOpponent.queuedSpellId === null &&
    freshFightOpponent.autocastSpellId === null &&
    freshFightOpponent.defensiveCast === false &&
    freshFightOpponent.activePrayers.length === 0 &&
    freshFightOpponent.locks.freezeUntilTick === -1 &&
    freshFightOpponent.supplies.manta_ray === runtimeCombat.runtimePlayerCombatDefaultSupplies.manta_ray &&
    freshFightOpponent.specialActive === false &&
    freshFightOpponent.gmaul.queuedSpecs === 0 &&
    freshFightOpponent.gmaul.specialEnergy === 100,
  `target-death fresh fight reset should restore Java bot state and teleport to spawn: ${JSON.stringify(freshFightOpponent)}`
);
const targetTrackingOutOfRange = runtimePolicyTargeting.resolveRuntimePolicyTargetTracking({
  state: targetTrackingStart.state,
  tick: 18,
  localDead: false,
  opponentDead: false,
  distance: 17,
  selfCurrentTargetSignal: false,
  currentTargetSignal: true,
  directCombatSignal: false,
  pressureTargetSignal: true,
  recentCombatSignal: true,
  canAttackSignal: true,
  practiceTargetVisible: true
});
assert(
  !targetTrackingOutOfRange.shouldRunPolicy &&
    targetTrackingOutOfRange.state.fightEngaged &&
    targetTrackingOutOfRange.state.noTargetGraceUntilTick === 26,
  `target tracking should reject targets beyond Java TARGET_TRACK_DISTANCE before grace reset: ${JSON.stringify(targetTrackingOutOfRange)}`
);
const targetTrackingSelfTargetOutOfRange = runtimePolicyTargeting.resolveRuntimePolicyTargetTracking({
  state: targetTrackingStart.state,
  tick: 18,
  localDead: false,
  opponentDead: false,
  distance: 17,
  selfCurrentTargetSignal: true,
  currentTargetSignal: true,
  directCombatSignal: false,
  pressureTargetSignal: true,
  recentCombatSignal: true,
  canAttackSignal: true,
  practiceTargetVisible: true
});
assert(
  !targetTrackingSelfTargetOutOfRange.shouldRunPolicy &&
    targetTrackingSelfTargetOutOfRange.resetReposition &&
    !targetTrackingSelfTargetOutOfRange.state.fightEngaged,
  `target tracking should immediately reset when Java player.getCombat().getTarget() is no longer trackable: ${JSON.stringify(targetTrackingSelfTargetOutOfRange)}`
);
const targetTrackingPracticeVisible = runtimePolicyTargeting.resolveRuntimePolicyTargetTracking({
  state: runtimePolicyTargeting.emptyRuntimePolicyTargetTrackingState,
  tick: 40,
  localDead: false,
  opponentDead: false,
  distance: 8,
  selfCurrentTargetSignal: false,
  currentTargetSignal: false,
  directCombatSignal: false,
  pressureTargetSignal: false,
  recentCombatSignal: false,
  canAttackSignal: true,
  practiceTargetVisible: true
});
assert(
  targetTrackingPracticeVisible.shouldRunPolicy &&
    targetTrackingPracticeVisible.state.fightEngaged &&
    targetTrackingPracticeVisible.state.engagementLockUntilTick === 52,
  `two-player trainer target discovery should still start a nearby practice target like Java world/local scan: ${JSON.stringify(targetTrackingPracticeVisible)}`
);
const targetTrackingPracticeCantAttack = runtimePolicyTargeting.resolveRuntimePolicyTargetTracking({
  state: runtimePolicyTargeting.emptyRuntimePolicyTargetTrackingState,
  tick: 40,
  localDead: false,
  opponentDead: false,
  distance: 8,
  selfCurrentTargetSignal: false,
  currentTargetSignal: false,
  directCombatSignal: false,
  pressureTargetSignal: false,
  recentCombatSignal: false,
  canAttackSignal: false,
  practiceTargetVisible: true
});
assert(
  targetTrackingPracticeCantAttack.shouldRunPolicy &&
    targetTrackingPracticeCantAttack.state.fightEngaged &&
    targetTrackingPracticeCantAttack.state.engagementLockUntilTick === 52,
  `two-player trainer target discovery should keep the dedicated visible target running while PlayerCombat/TargetRoute handle current attack legality: ${JSON.stringify(targetTrackingPracticeCantAttack)}`
);
const targetTrackingDead = runtimePolicyTargeting.resolveRuntimePolicyTargetTracking({
  state: targetTrackingStart.state,
  tick: 19,
  localDead: true,
  opponentDead: false,
  distance: 6,
  selfCurrentTargetSignal: true,
  currentTargetSignal: true,
  directCombatSignal: false,
  pressureTargetSignal: true,
  recentCombatSignal: true,
  canAttackSignal: true,
  practiceTargetVisible: true
});
assert(
  !targetTrackingDead.shouldRunPolicy &&
    targetTrackingDead.resetReposition &&
    !targetTrackingDead.state.fightEngaged,
  `target tracking should reset immediately on death: ${JSON.stringify(targetTrackingDead)}`
);

const botPolicySource = readProject("src/bot/policy.ts");
for (const snippet of [
  "const policyHistoryTicks = 16;",
  "const defencePrayerHistoryObservationLimit = 8;",
  "const nhPolicyStoreVersion = 11;",
  "const explorationReheatDecisionsCap = 350_000;",
  "resetNhPolicyFeatureState(featureState);",
  "context.rewardEpisodeActive ?? true",
  "context.rewardEpisodeId ?? 0",
  "context.tick < lastContextTick",
  "for (let action = 0; action < nhPolicyActionCount; action += 1)",
  "const weights = policy.weightsByAction.get(action);",
  "function actionVisitMap(policy: ParsedNhPolicy): ReadonlyMap<number, number>",
  "rebalanceLoadedNhPolicyActionBiases(mutableWeights, actionVisits);",
  "function rebalanceLoadedNhPolicyActionBiases(",
  "throw new Error(`NH policy version ${version} does not match expected version ${nhPolicyStoreVersion}.`);",
  "function normalizeLoadedNhPolicyCounters(",
  "visitsByAction.set(action, Math.max(0, Math.round(visits * reheatScale)));",
  "function loadedPolicyActionScale(action: number): number",
  "weights.set(featureIndex, clampDouble(value * scale, -loadedPolicyWeightClamp, loadedPolicyWeightClamp));",
  "visitsByAction.set(action, Math.max(0, Math.round(visits * scale * scale)));",
  "javaStyleEqualScoreTieBreaker",
  "function rankWithJavaEqualScoreTieBreak(",
  "candidate.score === best.score && equalScoreTieBreaker()",
  "offenceGearWeaknessPrior(features, action, context)",
  "rejects Smite during live inference",
  "function offenceGearWeaknessPrior(",
  "let score = 8.4 * weakness;",
  "score -= 5.5 * (0.35 + exposedWeakness);",
  "score += 60 * reachableExposure;",
  "score -= 24.5 * (distance > 1.25 ? 0.76 : 1) * (0.25 + Math.max(0, meleeWeakness) + meleeEdge);",
  "function opponentWeaknessForStyle(",
  "function opponentGmaulWeakness(context: NhDuelControllerContext | undefined): number",
  "const defenceFactor = 0.56 + 0.58 * clamp01(weakness + 0.35);",
  "const effectiveBaseHit = baseHit * Math.min(1.08, Math.max(0, statFactor));",
  "const koPressure = opponentHp > 0 && effectiveBaseHit / 99 >= opponentHp ? 1.1 : 1;",
  "return (baseHit / 42) * defenceFactor * prayerFactor * rangeFactor * statFactor * koPressure;",
  "return -0.35;",
  "readonly targetId: string | null;",
  "context.opponent.id",
  "function defencePrayerHistoryPrior(",
  "(previous.targetId ?? null) !== observation.targetId",
  "previous.opponentLikelyStyle",
  "previous.opponentGearStyle",
  "weight *= 0.78;",
  "return 3.2 * (protectedBelief - 1 / 3) * (0.5 + pressure) * (0.45 + confidence);"
]) {
  assert(botPolicySource.includes(snippet), `bot policy source missing history prior snippet ${snippet}`);
}
for (const snippet of [
  "private static final double REGEAR_STYLE_IDLE_PRIOR_PENALTY = 0.35D;",
  "return -REGEAR_STYLE_IDLE_PRIOR_PENALTY;"
]) {
  assert(serverBridgeSource.includes(snippet), `server policy bridge source missing regear prior snippet ${snippet}`);
}

const gearProfileSource = readProject("src/sim/nh/gearProfile.ts");
for (const snippet of [
  "export interface NhSelectedGearProfile",
  "readonly equipmentItemCount: number;",
  "readonly inventoryItemCount: number;",
  "readonly equipmentWeaponItemId: number | null;",
  "inferNhSelectedGearProfile",
  "readonly inventoryItems?: readonly VisibleEquipmentItem[];",
  "const strictInventory = input.inventoryItems !== undefined;",
  "const styleSelectionItems = collectStyleSelectionItems(input.equipment, input.inventoryItems, ownedItems);",
  "equipmentItemCount: countVisibleEquipmentItems(input.equipment)",
  "inventoryItemCount: input.inventoryItems?.length ?? input.previousProfile?.inventoryItemCount ?? 0",
  "equipmentWeaponItemId: input.equipment.weapon?.itemId ?? null",
  "nhGearProfileCandidateEquipmentByStyle",
  "nhGearProfileActionEquipment",
  "nhGearProfileForBotPreferredSource",
  "nhGearProfileNormalizeBotSourceEquipment",
  "Source: NhStakerLoadout.normalizeBotCommandLayout() replaces Vesta's",
  "Source: NhStakerLoadout.normalizeBotCommandLayout() replaces Granite mauls",
  "with Armadyl godsword and ensures an AGS exists in the NH stake template.",
  "Source: NhStakerLoadout.hasUsableBotLoadout() requires a populated saved",
  "profile.equipmentItemCount >= 8",
  "profile.inventoryItemCount >= 12",
  "profile.equipmentWeaponItemId !== null",
  "readonly allowFlexibleGear?: boolean;",
  "readonly flexibleGearPasses?: number;",
  "let equipment = applyJavaStyleLoadout(input.currentEquipment, input.profile, { ...input.action, specIntent: \"none\" });",
  "if (input.allowFlexibleGear ?? true) {",
  "const passes = Math.max(1, Math.trunc(input.flexibleGearPasses ?? 1));",
  "for (let pass = 0; pass < passes; pass += 1) {",
  "if (input.action.specIntent !== \"none\" && nhGearProfileCanEquipGraniteMaul(input.profile))",
  "const javaBotMagicWeaponCandidates: readonly NhWeaponId[] = [\"staff_of_the_dead\", \"kodai\", \"ancient_staff\"]",
  "const javaBotRangedWeaponCandidates: readonly NhWeaponId[] = [\"dragon_crossbow\", \"armadyl_crossbow\", \"rune_crossbow\", \"magic_shortbow\"]",
  "const javaBotMeleeWeaponCandidates: readonly NhWeaponId[] = [\"tentacle_whip\", \"abyssal_whip\"]",
  "const magicWeaponCandidates: readonly NhWeaponId[] = javaBotMagicWeaponCandidates",
  "const rangedWeaponCandidates: readonly NhWeaponId[] = javaBotRangedWeaponCandidates",
  "styleScore(item: VisibleEquipmentItem, style: NhOffenceStyle)",
  "bonuses.magic_attack_bonus * 100 + bonuses.magic_damage_bonus * 30 + bonuses.magic_defence_bonus * 15",
  "bonuses.range_attack_bonus * 100 + bonuses.ranged_strength_bonus * 35 + bonuses.range_defence_bonus * 15",
  "bonuses.melee_strength_bonus * 35",
  "Source: NhStakerLoadout.pickOwnedBestForSlot() scans inventory before",
  "let defenceWeight = underPressure ? 1.2 : 0.68",
  "if (hp <= 45) {",
  "swaps >= 3"
]) {
  assert(gearProfileSource.includes(snippet), `gear profile source missing Java parity snippet ${snippet}`);
}
assertOrderedSnippets(
  gearProfileSource,
  [
    "let equipment = applyJavaStyleLoadout(input.currentEquipment, input.profile, { ...input.action, specIntent: \"none\" });",
    "if (input.allowFlexibleGear ?? true) {",
    "if (input.action.offenceStyle === \"magic\") {",
    "if (input.action.specIntent !== \"none\" && nhGearProfileCanEquipGraniteMaul(input.profile)) {",
    "weapon: weaponItemById.granite_maul"
  ],
  "gear profile Java style loadout before weapon-only Gmaul spec"
);

for (const snippet of [
  "specialAttackCount?: number",
  "specialAttackCount: consumed.event.count",
  "const maxRetainedEventAgeTicks = 550;",
  "readonly prayerPoints: number;",
  "readonly policyOffenceStyle?: NhOffenceStyle;",
  "readonly policyStalledStyle: NhOffenceStyle | null;",
  "readonly policyStalledStyleTicks: number;",
  "export function clearRuntimePlayerCombatActorPolicyNoTargetGrace(",
  "clearStyleStall()",
  "before NO_TARGET_GRACE_TICKS expires",
  "actor.autocastSpellId === spellId && actor.defensiveCast === defensiveCast && actor.queuedSpellId === null",
  "even when ensureAutocast() was already satisfied",
  "prayer: { current: actor.prayerPoints, fixed: actor.maxPrayerPoints }"
]) {
  assert(runtimeCombatSource.includes(snippet), `runtime combat source missing runtime inference state snippet ${snippet}`);
}

const prayerSource = readProject("src/sim/prayer/prayers.ts");
for (const snippet of [
  '"mystic_will"',
  '"mystic_lore"',
  '"sharp_eye"',
  '"hawk_eye"',
  '"ultimate_strength"',
  '"chivalry"',
  'mystic_will: definePrayer("mystic_will", 9, 3, "magic", { magic: 0.05 })',
  'hawk_eye: definePrayer("hawk_eye", 26, 6, "ranged", { rangedAttack: 0.1, rangedStrength: 0.1 })',
  'chivalry: definePrayer("chivalry", 60, 24, "mixed", { attack: 0.15, strength: 0.18, defence: 0.2 })'
]) {
  assert(prayerSource.includes(snippet), `prayer source missing Java Prayer enum parity snippet ${snippet}`);
}

const viewerSource = readProject("src/ui/RuntimeSceneViewer.tsx");
for (const snippet of [
  "inventoryItems: observedLocalAppearance.inventoryItems",
  "visibleEquipmentItemsFromRuntimeInventory",
  "inventoryOverrideRef.current ?? visibleSnapshotRef.current.inventory",
  "runtimePrayerIdsFromKronosStates",
  'value === "mystic_will"',
  'value === "mystic_lore"',
  'value === "sharp_eye"',
  'value === "hawk_eye"',
  'value === "ultimate_strength"',
  'value === "chivalry"'
]) {
  assert(viewerSource.includes(snippet), `viewer source missing policy inventory/prayer bridge snippet ${snippet}`);
}
for (const snippet of [
  "applyManualOpponentPolicyActorResult",
  "policyMovementCollision.canStep",
  "kronosSceneProjectileRouteClear(to, targetTile, policyMovementCollision)",
  "projectileLineOfSight: policyMovementCollision",
  "kronosSceneProjectileRouteClear(from, target, policyMovementCollision)",
  "targetRouteStep: policyMovementCollision",
  "findKronosTargetRouteWaypoints(from, target, distance, policyMovementCollision)",
  "tileRouteStep: policyMovementCollision",
  "findKronosTileRouteWaypoints(from, target, policyMovementCollision)",
  "expandKronosManualRoutePath(from, routeSegment, policyMovementCollision)",
  "inPvpCombatArea: policyMovementCollision",
  "kronosNhBotCombatTileAllowed(policyMovementCollision.sceneToWorldTile(opponentActor.tile))",
  'stepContext.movementIntent === "pressure" || stepContext.movementIntent === "stand_under"',
  "kronosNhBotCombatTileAllowed(policyMovementCollision.sceneToWorldTile(stepContext.targetTile))",
  "manualOpponentNextPolicyRepositionTickRef",
  "writeManualOpponentPolicyDebugSnapshot",
  "manualOpponentPolicy:",
  "const clientPosition = actor.clientPosition ?? kronosClientPositionFromRuntimeTile(actor.renderTile ?? actor.tile)",
  "policyEffectiveAction",
  "opponentMovedThisTick = opponentMovedThisTick || policyResponse.policyMovedThisTick",
  "lastMoveDx: Math.round((destinationTile.x - sourceTile.x) / KRONOS_TILE_WORLD_UNITS)",
  "lastMoveDy: Math.round((destinationTile.z - sourceTile.z) / KRONOS_TILE_WORLD_UNITS)",
  "const opponentPolicySelfMovement = manualPolicyActorMovementViewFromTiles(",
  "queueManualOpponentCombatResponse(combatStateForTick, local, opponent, opponentPolicySelfMovement)",
  "movedThisTick: observedOpponentSelfMovement.movedThisTick",
  "manualOpponentObservedSelfMovementRef.current = freshFightReset",
  "manualOpponentObservedSelfMovementRef.current = manualPolicyStationaryMovementView",
  "lastManualOpponentPolicyMovementApplied",
  "lastManualOpponentStrippedEquipmentSlots"
]) {
  assert(viewerSource.includes(snippet), `runtime scene bridge missing policy result snippet ${snippet}`);
}

const policyFixture = readProject("fixtures/ai/nhstaker-selfplay-policy-nhstake-ags.tsv");
let visitedActions = 0;
for (const line of policyFixture.split(/\r?\n/)) {
  const fields = line.split("\t");
  if (fields[0] !== "act") {
    continue;
  }
  const actionId = Number(fields[1]);
  assert(Number.isInteger(actionId), `invalid policy fixture action id ${fields[1]}`);
  assert(actionId >= 0 && actionId < bridge.nhPolicyActionCount, `policy fixture action ${actionId} outside action space`);
  bridge.decodeNhPolicyAction(actionId);
  visitedActions += 1;
}
assert(visitedActions > 0, "policy fixture did not contain any action rows");

const arenaMetadata = JSON.parse(readProject("fixtures/render/maps/inferno_arena.json"));
const objectPlacements = JSON.parse(readProject("fixtures/render/maps/inferno_arena_objects.json"));
assert(
  objectPlacements.some((object) => object.name === "Wilderness Ditch" && object.actions?.includes("Cross")),
  "arena object metadata should include the source-exported Wilderness Ditch object action"
);
const collision = sceneCollision.buildKronosSceneCollision(arenaMetadata, objectPlacements, { x: 0, y: 0, z: 0 });
const northOfDitch = sceneCollision.kronosArenaWorldTileCenterToScene(arenaMetadata, { x: 0, y: 0, z: 0 }, 3100, 3523);
const ditchTile = sceneCollision.kronosArenaWorldTileCenterToScene(arenaMetadata, { x: 0, y: 0, z: 0 }, 3100, 3522);
assert(!collision.canStand(ditchTile), "ordinary combat movement should not stand on the Wilderness Ditch object tile");
assert(!collision.canStep(northOfDitch, ditchTile), "ordinary combat movement should not step into the Wilderness Ditch");

const forcedDitchStepController = {
  id: "test-policy-forced-ditch-step",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "step_south",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const localTile = sceneCollision.kronosArenaWorldTileCenterToScene(arenaMetadata, { x: 0, y: 0, z: 0 }, 3100, 3524);
const ditchState = runtimeCombat.createRuntimePlayerCombatState({
  localTile,
  opponentTile: northOfDitch,
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 23271
});
const blockedPolicyMove = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: ditchState,
  controller: forcedDitchStepController,
  localActor: {
    tile: localTile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: northOfDitch,
    loadoutId: "acb-hides"
  },
  canStep: (from, to) => collision.canStep(from, to)
});
assert(blockedPolicyMove.movementBlockedReason === "collision", "policy step into ditch should be blocked by collision");
assert(!blockedPolicyMove.opponentMovedThisTick, "policy step into ditch should not consume movement");
assert(
  blockedPolicyMove.opponentTile.x === northOfDitch.x && blockedPolicyMove.opponentTile.z === northOfDitch.z,
  "policy step into ditch should keep the opponent on the original tile"
);
assert(
  blockedPolicyMove.state.actors.opponent.tile.x === northOfDitch.x &&
    blockedPolicyMove.state.actors.opponent.tile.z === northOfDitch.z,
  "blocked policy movement should keep runtime combat state tile in sync"
);

const farStepOutController = {
  id: "test-policy-far-step-out",
  chooseAction: () => ({
    offenceStyle: "magic",
    defencePrayer: "protect_from_missiles",
    movementIntent: "step_out",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const farStepOut = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 4, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "acb-hides",
    seed: 2401
  }),
  controller: farStepOutController,
  localActor: {
    tile: { x: 0, z: 0 },
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: { x: 4, z: 0 },
    loadoutId: "acb-hides"
  }
});
assert(
  farStepOut.action.movementIntent === "step_out" &&
    farStepOut.effectiveAction.movementIntent === "pressure" &&
    !farStepOut.opponentMovedThisTick,
  "far step_out should be guarded back to pressure like NhStakerBot.applyContextGuards"
);

const likelyMeleeStepOutController = {
  id: "test-policy-likely-melee-step-out",
  chooseAction: () => ({
    offenceStyle: "magic",
    defencePrayer: "protect_from_missiles",
    movementIntent: "step_out",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const likelyMeleeStepOutBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 2403
});
const likelyMeleeStepOutState = {
  ...likelyMeleeStepOutBase,
  tick: 3,
  actors: {
    ...likelyMeleeStepOutBase.actors,
    opponent: {
      ...likelyMeleeStepOutBase.actors.opponent,
      hitpoints: 40
    }
  },
  events: [
    ...likelyMeleeStepOutBase.events,
    {
      kind: "attack",
      id: "verifier-local-melee-threat",
      tick: 2,
      attackerId: "local-player",
      defenderId: "opponent",
      attackerTile: likelyMeleeStepOutBase.actors["local-player"].tile,
      defenderTile: likelyMeleeStepOutBase.actors.opponent.tile,
      style: "slash",
      sequenceName: "melee_attack",
      hitDelayTicks: 1,
      maxDamage: 20,
      hitChance: 1,
      expectedDamage: 10,
      attackerActivePrayers: [],
      attackerEquipment: likelyMeleeStepOutBase.actors["local-player"].equipment,
      defenderEquipment: likelyMeleeStepOutBase.actors.opponent.equipment
    }
  ]
};
const likelyMeleeStepOut = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: likelyMeleeStepOutState,
  controller: likelyMeleeStepOutController,
  localActor: {
    tile: likelyMeleeStepOutState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    equipment: likelyMeleeStepOutState.actors["local-player"].equipment
  },
  opponentActor: {
    tile: likelyMeleeStepOutState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  likelyMeleeStepOut.action.movementIntent === "step_out" &&
    likelyMeleeStepOut.effectiveAction.movementIntent === "step_out",
  `likely melee step_out should be allowed from delayed attack style even when visible gear is ranged: ${JSON.stringify({
    action: likelyMeleeStepOut.action,
    effectiveAction: likelyMeleeStepOut.effectiveAction
  })}`
);
assert(
  likelyMeleeStepOut.opponentMovedThisTick &&
    likelyMeleeStepOut.opponentTile.x === 2 &&
    Math.abs(likelyMeleeStepOut.opponentTile.z) === 1 &&
    likelyMeleeStepOut.nextRepositionTick === likelyMeleeStepOutState.tick + 2,
  `same-row step_out should port NhStakerBot.stepAwayFrom() zero-axis diagonal roll: ${JSON.stringify({
    moved: likelyMeleeStepOut.opponentMovedThisTick,
    tile: likelyMeleeStepOut.opponentTile,
    nextRepositionTick: likelyMeleeStepOut.nextRepositionTick
  })}`
);

const fallbackStepOut = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: likelyMeleeStepOutState,
  controller: likelyMeleeStepOutController,
  localActor: {
    tile: likelyMeleeStepOutState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    equipment: likelyMeleeStepOutState.actors["local-player"].equipment
  },
  opponentActor: {
    tile: likelyMeleeStepOutState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  canStep: (_from, to) => to.x !== 2
});
assert(
  fallbackStepOut.opponentMovedThisTick &&
    fallbackStepOut.opponentTile.x === 0 &&
    fallbackStepOut.opponentTile.z === -1 &&
    fallbackStepOut.nextRepositionTick === likelyMeleeStepOutState.tick + 2,
  `blocked primary step_out should scan current.area(1) fallback order like NhStakerBot.stepAwayFrom(): ${JSON.stringify({
    moved: fallbackStepOut.opponentMovedThisTick,
    tile: fallbackStepOut.opponentTile,
    nextRepositionTick: fallbackStepOut.nextRepositionTick
  })}`
);

const projectileFallbackStepOut = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: likelyMeleeStepOutState,
  controller: likelyMeleeStepOutController,
  localActor: {
    tile: likelyMeleeStepOutState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    equipment: likelyMeleeStepOutState.actors["local-player"].equipment
  },
  opponentActor: {
    tile: likelyMeleeStepOutState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  canStep: () => true,
  projectileLineOfSight: (from) => from.x === 0 && from.z === -1
});
assert(
  projectileFallbackStepOut.opponentMovedThisTick &&
    projectileFallbackStepOut.opponentTile.x === 0 &&
    projectileFallbackStepOut.opponentTile.z === -1 &&
    projectileFallbackStepOut.nextRepositionTick === likelyMeleeStepOutState.tick + 2,
  `step_out should reject fallback candidates without ProjectileRoute.allow() like NhStakerBot.tryStep(): ${JSON.stringify({
    moved: projectileFallbackStepOut.opponentMovedThisTick,
    tile: projectileFallbackStepOut.opponentTile,
    nextRepositionTick: projectileFallbackStepOut.nextRepositionTick
  })}`
);

const magicNoLineOfSightController = {
  id: "test-policy-magic-no-los-step-away",
  chooseAction: () => ({
    offenceStyle: "magic",
    defencePrayer: "protect_from_missiles",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const magicNoLineOfSightState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 2, z: 1 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes",
  seed: 2402
});
const magicNoLineOfSight = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: magicNoLineOfSightState,
  controller: magicNoLineOfSightController,
  localActor: {
    tile: magicNoLineOfSightState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: magicNoLineOfSightState.actors.opponent.tile,
    loadoutId: "kodai-robes"
  },
  canStep: (_from, to, context) =>
    context.movementIntent === "step_out" &&
    !context.allowTargetTile &&
    to.x === 3 &&
    to.z === 2,
  projectileLineOfSight: (from) => from.x === 3 && from.z === 2
});
assert(
  magicNoLineOfSight.opponentMovedThisTick &&
    magicNoLineOfSight.opponentTile.x === 3 &&
    magicNoLineOfSight.opponentTile.z === 2 &&
    magicNoLineOfSight.nextRepositionTick === magicNoLineOfSightState.tick + 2,
  `blocked magic LOS should port NhStakerBot.ensureMagicLineOfSight() stepAwayFrom(), got ${JSON.stringify({
    moved: magicNoLineOfSight.opponentMovedThisTick,
    tile: magicNoLineOfSight.opponentTile,
    nextRepositionTick: magicNoLineOfSight.nextRepositionTick
  })}`
);
assert(
  magicNoLineOfSight.state.actors.opponent.targetId === "local-player",
  "blocked magic LOS should keep the target request like castBarrage() before ensureMagicLineOfSight()"
);

const delayedPrayerCounterController = {
  id: "test-policy-delayed-prayer-counter",
  chooseAction: () => ({
    offenceStyle: "melee",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const delayedPrayerCounterStateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "tentacle-bandos",
  seed: 2406
});
const delayedPrayerCounterState = runtimeCombat.setRuntimePlayerCombatPrayers(
  delayedPrayerCounterStateBase,
  "local-player",
  ["protect_from_melee"]
);
const delayedPrayerCounter = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: delayedPrayerCounterState,
  controller: delayedPrayerCounterController,
  localActor: {
    tile: delayedPrayerCounterState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    activePrayers: delayedPrayerCounterState.actors["local-player"].activePrayers
  },
  opponentActor: {
    tile: delayedPrayerCounterState.actors.opponent.tile,
    loadoutId: "tentacle-bandos"
  }
});
assert(
  delayedPrayerCounter.effectiveAction.offenceStyle === "magic" &&
    delayedPrayerCounter.opponentLoadoutId === "kodai-robes",
  "delayed protect-melee should override a melee decision to the Java freeze counter style"
);
const currentOnlyPrayerCounter = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: delayedPrayerCounterState,
  controller: delayedPrayerCounterController,
  localActor: {
    tile: delayedPrayerCounterState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    activePrayers: []
  },
  opponentActor: {
    tile: delayedPrayerCounterState.actors.opponent.tile,
    loadoutId: "tentacle-bandos"
  }
});
assert(
  currentOnlyPrayerCounter.effectiveAction.offenceStyle === "melee",
  `delayed prayer counter should not read current prayers before they are client-visible to the bot: ${JSON.stringify({
    effective: currentOnlyPrayerCounter.effectiveAction,
    currentPrayers: delayedPrayerCounterState.actors["local-player"].activePrayers
  })}`
);
assert(
  delayedPrayerCounter.state.actors.opponent.activePrayers.includes("augury") &&
    !delayedPrayerCounter.state.actors.opponent.activePrayers.includes("piety"),
  `delayed prayer counter should apply Java offence prayer from the resolved desired style: ${JSON.stringify({
    effective: delayedPrayerCounter.effectiveAction,
    activePrayers: delayedPrayerCounter.state.actors.opponent.activePrayers
  })}`
);

function applyOpponentPrayerProbe({
  style,
  prayerPoints = { current: 60, fixed: 99 },
  levels = { attack: 99, strength: 99, defence: 99, ranged: 99, magic: 99 }
}) {
  const tile = style === "melee" ? { x: 1, z: 0 } : { x: 5, z: 0 };
  const state = runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: tile,
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "acb-hides",
    opponentLevels: levels,
    opponentPrayerPoints: prayerPoints,
    seed: 24061
  });
  return runtimePolicy.applyRuntimeOpponentPolicyAction({
    state,
    controller: {
      id: `test-policy-${style}-prayer-probe`,
      chooseAction: () => ({
        offenceStyle: style,
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      })
    },
    localActor: {
      tile: state.actors["local-player"].tile,
      loadoutId: "acb-hides"
    },
    opponentActor: {
      tile: state.actors.opponent.tile,
      loadoutId: "acb-hides"
    }
  }).state.actors.opponent;
}

for (const [style, preferred, fallback] of [
  ["magic", "augury", "mystic_might"],
  ["ranged", "rigour", "eagle_eye"],
  ["melee", "piety", "ultimate_strength"]
]) {
  const activePrayers = applyOpponentPrayerProbe({ style }).activePrayers;
  assert(
    activePrayers.includes(preferred) && !activePrayers.includes(fallback),
    `low current prayer should be restored to fixed before Java offence-prayer activation for ${style}: ${JSON.stringify(activePrayers)}`
  );
}
for (const [style, preferred, fallback] of [
  ["magic", "augury", "mystic_might"],
  ["ranged", "rigour", "eagle_eye"],
  ["melee", "piety", "ultimate_strength"]
]) {
  const activePrayers = applyOpponentPrayerProbe({
    style,
    levels: { attack: 99, strength: 99, defence: 60, ranged: 99, magic: 99 }
  }).activePrayers;
  assert(
    activePrayers.includes(preferred) && !activePrayers.includes(fallback),
    `drained current Defence should still use Java fixed-level unlock for ${style}: ${JSON.stringify(activePrayers)}`
  );
}
const noPrayerOpponent = applyOpponentPrayerProbe({
  style: "ranged",
  prayerPoints: { current: 0, fixed: 99 }
});
assert(
  noPrayerOpponent.prayerPoints === 99 &&
    noPrayerOpponent.activePrayers.includes("protect_from_magic") &&
    noPrayerOpponent.activePrayers.includes("rigour"),
  `policy inference should restore current prayer to fixed before prayer activation like NhStakerBot.ensurePrayerPoints(): ${JSON.stringify({
    prayerPoints: noPrayerOpponent.prayerPoints,
    activePrayers: noPrayerOpponent.activePrayers
  })}`
);

const rangedStyleStallController = {
  id: "test-policy-style-stall-ranged",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_missiles",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
function patchOpponentActor(state, patch) {
  return {
    ...state,
    actors: {
      ...state.actors,
      opponent: {
        ...state.actors.opponent,
        ...patch
      }
    }
  };
}
function patchLocalActor(state, patch) {
  return {
    ...state,
    actors: {
      ...state.actors,
      "local-player": {
        ...state.actors["local-player"],
        ...patch
      }
    }
  };
}
function removeOpponentAmmo(state) {
  const { ammo, ...equipmentWithoutAmmo } = state.actors.opponent.equipment;
  return patchOpponentActor(state, { equipment: equipmentWithoutAmmo });
}
function applyStyleStallProbe(state) {
  return runtimePolicy.applyRuntimeOpponentPolicyAction({
    state,
    controller: rangedStyleStallController,
    localActor: {
      tile: state.actors["local-player"].tile,
      loadoutId: "acb-hides"
    },
    opponentActor: {
      tile: state.actors.opponent.tile,
      loadoutId: "acb-hides"
    }
  });
}
const styleStallBaseState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 24062
});
const styleStallFirst = applyStyleStallProbe(
  patchOpponentActor(removeOpponentAmmo(styleStallBaseState), {
    policyOffenceStyle: "ranged",
    activePrayers: []
  })
);
assert(
  styleStallFirst.state.actors.opponent.policyStalledStyle === "ranged" &&
    styleStallFirst.state.actors.opponent.policyStalledStyleTicks === 1,
  `first not-ready style tick should persist Java stalledStyle state, got ${JSON.stringify({
    style: styleStallFirst.state.actors.opponent.policyStalledStyle,
    ticks: styleStallFirst.state.actors.opponent.policyStalledStyleTicks
  })}`
);
const styleStallCleared = applyStyleStallProbe(styleStallFirst.state);
assert(
  styleStallCleared.state.actors.opponent.policyStalledStyle === null &&
    styleStallCleared.state.actors.opponent.policyStalledStyleTicks === 0,
  `ready style should clear Java stalledStyle state on the next policy tick, got ${JSON.stringify({
    style: styleStallCleared.state.actors.opponent.policyStalledStyle,
    ticks: styleStallCleared.state.actors.opponent.policyStalledStyleTicks
  })}`
);
const styleStallRecovered = applyStyleStallProbe(
  patchOpponentActor(removeOpponentAmmo(styleStallBaseState), {
    policyOffenceStyle: "ranged",
    policyStalledStyle: "ranged",
    policyStalledStyleTicks: 5,
    activePrayers: []
  })
);
assert(
  styleStallRecovered.state.actors.opponent.policyStalledStyle === null &&
    styleStallRecovered.state.actors.opponent.policyStalledStyleTicks === 0 &&
    styleStallRecovered.state.actors.opponent.equipment.ammo?.itemId === loadouts.nhLoadouts["acb-hides"].equipment.ammo.itemId &&
    styleStallRecovered.state.actors.opponent.activePrayers.includes("protect_from_missiles") &&
    styleStallRecovered.state.actors.opponent.activePrayers.includes("rigour"),
  `STYLE_STALL_THRESHOLD_TICKS should force source-style reapply and clear once ready, got ${JSON.stringify({
    style: styleStallRecovered.state.actors.opponent.policyStalledStyle,
    ticks: styleStallRecovered.state.actors.opponent.policyStalledStyleTicks,
    ammo: styleStallRecovered.state.actors.opponent.equipment.ammo,
    prayers: styleStallRecovered.state.actors.opponent.activePrayers
  })}`
);

const acbGmaulSpecController = {
  id: "test-policy-acb-current-weapon-gmaul-spec",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "use_special",
    extendedSupplyAction: false
  })
};
const acbGmaulSpecState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 2, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentSpecialEnergy: 100,
  seed: 2407
});
const acbGmaulSpec = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: acbGmaulSpecState,
  controller: acbGmaulSpecController,
  localActor: {
    tile: acbGmaulSpecState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: acbGmaulSpecState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
const acbNoSpecSameDecision = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: acbGmaulSpecState,
  controller: {
    id: "test-policy-acb-current-weapon-no-spec-equipment-baseline",
    chooseAction: () => ({
      offenceStyle: "ranged",
      defencePrayer: "protect_from_magic",
      movementIntent: "pressure",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false
    })
  },
  localActor: {
    tile: acbGmaulSpecState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: acbGmaulSpecState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
const acbGmaulSpecNonWeaponSlotsMatch = Object.keys(acbNoSpecSameDecision.state.actors.opponent.equipment)
  .filter((slot) => slot !== "weapon")
  .every(
    (slot) =>
      acbGmaulSpec.state.actors.opponent.equipment[slot]?.itemId ===
      acbNoSpecSameDecision.state.actors.opponent.equipment[slot]?.itemId
  );
assert(
  acbGmaulSpec.effectiveAction.specIntent === "use_special" &&
    acbGmaulSpec.opponentLoadoutId === "acb-hides" &&
    acbGmaulSpec.state.actors.opponent.equipment.weapon?.itemId === loadouts.nhLoadouts["gmaul-bandos"].equipment.weapon?.itemId &&
    acbGmaulSpecNonWeaponSlotsMatch &&
    acbGmaulSpec.state.actors.opponent.gmaul.queuedSpecs === 1,
  `ACB Gmaul spec intent should survive while Java maybeEquipGraniteMaulForSpec swaps only the weapon slot, got ${JSON.stringify({
    specIntent: acbGmaulSpec.effectiveAction.specIntent,
    loadout: acbGmaulSpec.opponentLoadoutId,
    weapon: acbGmaulSpec.state.actors.opponent.equipment.weapon?.itemId,
    specEquipment: acbGmaulSpec.state.actors.opponent.equipment,
    noSpecEquipment: acbNoSpecSameDecision.state.actors.opponent.equipment,
    queuedSpecs: acbGmaulSpec.state.actors.opponent.gmaul.queuedSpecs
  })}`
);
let observedPostGmaulPolicyStyle = null;
let observedPostGmaulVisibleWeapon = null;
const postGmaulCurrentOffenceState = {
  ...acbGmaulSpec.state,
  tick: acbGmaulSpec.state.tick + 1
};
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: postGmaulCurrentOffenceState,
  controller: {
    id: "test-policy-gmaul-current-offence-carry",
    chooseAction: (context) => {
      observedPostGmaulPolicyStyle = context.self.lastOffenceStyle;
      observedPostGmaulVisibleWeapon = context.self.weaponId;
      return {
        offenceStyle: "ranged",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: postGmaulCurrentOffenceState.actors["local-player"].tile,
    loadoutId: postGmaulCurrentOffenceState.actors["local-player"].loadoutId
  },
  opponentActor: {
    tile: postGmaulCurrentOffenceState.actors.opponent.tile,
    loadoutId: postGmaulCurrentOffenceState.actors.opponent.loadoutId
  }
});
assert(
  observedPostGmaulVisibleWeapon === "granite_maul" && observedPostGmaulPolicyStyle === "ranged",
  `after a ranged Gmaul spec, policy current offence should stay Java currentOffence=ranged while visible weapon is Gmaul, got ${observedPostGmaulVisibleWeapon}/${observedPostGmaulPolicyStyle}`
);
const acbGmaulOutOfMeleeReachState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 3, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentSpecialEnergy: 100,
  seed: 24072
});
const acbGmaulOutOfMeleeReach = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: acbGmaulOutOfMeleeReachState,
  controller: acbGmaulSpecController,
  localActor: {
    tile: acbGmaulOutOfMeleeReachState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: acbGmaulOutOfMeleeReachState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  acbGmaulOutOfMeleeReach.effectiveAction.specIntent === "none" &&
    acbGmaulOutOfMeleeReach.state.actors.opponent.gmaul.queuedSpecs === 0,
  `ACB range should not queue Gmaul until NhStakerBot.maybeEquipGraniteMaulForSpec observes melee reach: ${JSON.stringify({
    action: acbGmaulOutOfMeleeReach.effectiveAction,
    opponentLoadoutId: acbGmaulOutOfMeleeReach.opponentLoadoutId,
    weapon: acbGmaulOutOfMeleeReach.state.actors.opponent.equipment.weapon?.itemId,
    queuedSpecs: acbGmaulOutOfMeleeReach.state.actors.opponent.gmaul.queuedSpecs
  })}`
);
const acbSameTileRangedSpecStateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentSpecialEnergy: 100,
  seed: 240721
});
const acbSameTileRangedSpecState = runtimeCombat.setRuntimePlayerCombatPrayers(
  acbSameTileRangedSpecStateBase,
  "local-player",
  ["protect_from_melee"]
);
const acbSameTileRangedSpec = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: acbSameTileRangedSpecState,
  controller: acbGmaulSpecController,
  localActor: {
    tile: acbSameTileRangedSpecState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    activePrayers: acbSameTileRangedSpecState.actors["local-player"].activePrayers
  },
  opponentActor: {
    tile: acbSameTileRangedSpecState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  acbSameTileRangedSpec.effectiveAction.specIntent === "use_special" &&
    acbSameTileRangedSpec.state.actors.opponent.gmaul.queuedSpecs === 1,
  `same-tile non-melee Gmaul spec should pass Java PlayerCombat.canAttack() and rely on observed maul melee reach, got ${JSON.stringify({
    action: acbSameTileRangedSpec.effectiveAction,
    queuedSpecs: acbSameTileRangedSpec.state.actors.opponent.gmaul.queuedSpecs
  })}`
);
const sameTileMagicSpecGuardController = {
  id: "test-policy-same-tile-magic-spec-guarded-melee",
  chooseAction: () => ({
    offenceStyle: "magic",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "use_special",
    extendedSupplyAction: false
  })
};
const sameTileMagicSpecGuardState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentSpecialEnergy: 100,
  seed: 24073
});
const sameTileMagicSpecGuard = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: sameTileMagicSpecGuardState,
  controller: sameTileMagicSpecGuardController,
  localActor: {
    tile: sameTileMagicSpecGuardState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: sameTileMagicSpecGuardState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  sameTileMagicSpecGuard.effectiveAction.offenceStyle === "melee" &&
    sameTileMagicSpecGuard.effectiveAction.specIntent === "use_special" &&
    sameTileMagicSpecGuard.state.actors.opponent.gmaul.queuedSpecs === 1,
  `same-tile magic policy spec should be context-guarded to melee before the Java applySpecIntent gate: ${JSON.stringify({
    action: sameTileMagicSpecGuard.effectiveAction,
    weapon: sameTileMagicSpecGuard.state.actors.opponent.equipment.weapon?.itemId,
    queuedSpecs: sameTileMagicSpecGuard.state.actors.opponent.gmaul.queuedSpecs
  })}`
);
const shortRangeRangedProfile = {
  ...gearProfile.inferNhSelectedGearProfile({
    equipment: acbGmaulOutOfMeleeReachState.actors.opponent.equipment
  }),
  rangedWeaponId: "magic_shortbow"
};
const acbTickStartShortRangeRangedSpecState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 8, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentSpecialEnergy: 100,
  seed: 24074
});
const acbTickStartShortRangeRangedSpec = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: acbTickStartShortRangeRangedSpecState,
  controller: acbGmaulSpecController,
  localActor: {
    tile: acbTickStartShortRangeRangedSpecState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: acbTickStartShortRangeRangedSpecState.actors.opponent.tile,
    loadoutId: "acb-hides",
    gearProfile: shortRangeRangedProfile
  }
});
assert(
  acbTickStartShortRangeRangedSpec.effectiveAction.specIntent === "none" &&
    acbTickStartShortRangeRangedSpec.state.actors.opponent.gmaul.queuedSpecs === 0,
  `tick-start ACB spec control should not bypass Java canAttack() after switching to a shorter selected ranged weapon: ${JSON.stringify({
    action: acbTickStartShortRangeRangedSpec.effectiveAction,
    selectedRangedWeapon: shortRangeRangedProfile.rangedWeaponId,
    queuedSpecs: acbTickStartShortRangeRangedSpec.state.actors.opponent.gmaul.queuedSpecs
  })}`
);
const staffGmaulSpecStateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 2, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes",
  opponentSpecialEnergy: 100,
  seed: 24071
});
const staffOfTheDeadEquipment = {
  ...staffGmaulSpecStateBase.actors.opponent.equipment,
  weapon: { itemId: 11791, name: "Staff of the dead" }
};
const staffGmaulSpecState = {
  ...staffGmaulSpecStateBase,
  actors: {
    ...staffGmaulSpecStateBase.actors,
    opponent: {
      ...staffGmaulSpecStateBase.actors.opponent,
      equipment: staffOfTheDeadEquipment,
      gearProfile: gearProfile.inferNhSelectedGearProfile({
        equipment: staffOfTheDeadEquipment
      })
    }
  }
};
const staffGmaulSpec = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: staffGmaulSpecState,
  controller: acbGmaulSpecController,
  localActor: {
    tile: staffGmaulSpecState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: staffGmaulSpecState.actors.opponent.tile,
    loadoutId: "kodai-robes",
    equipment: staffOfTheDeadEquipment
  }
});
assert(
  staffGmaulSpec.effectiveAction.specIntent === "use_special" &&
    staffGmaulSpec.state.actors.opponent.gmaul.queuedSpecs === 1,
  "staff magic current-weapon Gmaul spec should still require Java observed maul melee reach after the spell-range canAttack gate"
);
const recentGmaulSpecState = {
  ...acbGmaulSpecState,
  tick: acbGmaulSpecState.tick + 6,
  events: [
    {
      kind: "attack",
      id: "test-recent-policy-gmaul-spec",
      tick: acbGmaulSpecState.tick,
      attackerId: "opponent",
      defenderId: "local-player",
      attackerTile: acbGmaulSpecState.actors.opponent.tile,
      defenderTile: acbGmaulSpecState.actors["local-player"].tile,
      style: "crush",
      sequenceName: "gmaul_special",
      hitDelayTicks: 1,
      maxDamage: 40,
      hitChance: 1,
      expectedDamage: 20,
      specialAttack: "granite_maul",
      specialAttackCount: 1,
      attackerActivePrayers: acbGmaulSpecState.actors.opponent.activePrayers,
      attackerEquipment: acbGmaulSpecState.actors.opponent.equipment,
      defenderEquipment: acbGmaulSpecState.actors["local-player"].equipment
    }
  ]
};
const recentGmaulSpec = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: recentGmaulSpecState,
  controller: acbGmaulSpecController,
  localActor: {
    tile: recentGmaulSpecState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: recentGmaulSpecState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeStartTick: acbGmaulSpecState.tick
});
assert(
  recentGmaulSpec.effectiveAction.specIntent === "none" &&
    recentGmaulSpec.state.actors.opponent.gmaul.queuedSpecs === 0,
  "recent policy Gmaul spec should be suppressed for SPEC_QUEUE_COOLDOWN_TICKS like NhStakerBot.applySpecIntent"
);
const staleOpponentSpecEstimateController = {
  id: "test-policy-stale-opponent-spec-estimate",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const staleOpponentSpecEstimateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "gmaul-bandos",
  opponentLoadoutId: "acb-hides",
  seed: 24073
});
const staleOpponentSpecEstimateState = {
  ...staleOpponentSpecEstimateBase,
  tick: 80,
  events: [
    {
      kind: "attack",
      id: "test-stale-local-gmaul-spec-before-current-episode",
      tick: 10,
      attackerId: "local-player",
      defenderId: "opponent",
      attackerTile: staleOpponentSpecEstimateBase.actors["local-player"].tile,
      defenderTile: staleOpponentSpecEstimateBase.actors.opponent.tile,
      style: "crush",
      sequenceName: "gmaul_special",
      hitDelayTicks: 1,
      maxDamage: 40,
      hitChance: 1,
      expectedDamage: 20,
      specialAttack: "granite_maul",
      specialAttackCount: 2,
      attackerActivePrayers: staleOpponentSpecEstimateBase.actors["local-player"].activePrayers,
      attackerEquipment: staleOpponentSpecEstimateBase.actors["local-player"].equipment,
      defenderEquipment: staleOpponentSpecEstimateBase.actors.opponent.equipment
    }
  ]
};
const staleOpponentSpecEstimateUnbounded = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: staleOpponentSpecEstimateState,
  controller: staleOpponentSpecEstimateController,
  localActor: {
    tile: staleOpponentSpecEstimateState.actors["local-player"].tile,
    loadoutId: "gmaul-bandos"
  },
  opponentActor: {
    tile: staleOpponentSpecEstimateState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
const staleOpponentSpecEstimateFreshEpisode = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: staleOpponentSpecEstimateState,
  controller: staleOpponentSpecEstimateController,
  localActor: {
    tile: staleOpponentSpecEstimateState.actors["local-player"].tile,
    loadoutId: "gmaul-bandos"
  },
  opponentActor: {
    tile: staleOpponentSpecEstimateState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeStartTick: 80
});
assert(
  staleOpponentSpecEstimateUnbounded.context.opponent.gmaul.specialEnergy === 10 &&
    staleOpponentSpecEstimateFreshEpisode.context.opponent.gmaul.specialEnergy === 100,
  `opponent special-energy estimate should reset at the current policy episode like NhStakerBot.resetOpponentSpecialEnergyEstimate, got ${JSON.stringify({
    unbounded: staleOpponentSpecEstimateUnbounded.context.opponent.gmaul.specialEnergy,
    freshEpisode: staleOpponentSpecEstimateFreshEpisode.context.opponent.gmaul.specialEnergy
  })}`
);
const lockedGmaulSpecState = {
  ...acbGmaulSpecState,
  actors: {
    ...acbGmaulSpecState.actors,
    opponent: {
      ...acbGmaulSpecState.actors.opponent,
      locks: entityLocks.setLock(acbGmaulSpecState.actors.opponent.locks, "full")
    }
  }
};
const lockedGmaulSpec = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: lockedGmaulSpecState,
  controller: acbGmaulSpecController,
  localActor: {
    tile: lockedGmaulSpecState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: lockedGmaulSpecState.actors.opponent.tile,
    loadoutId: "acb-hides",
    locks: lockedGmaulSpecState.actors.opponent.locks
  }
});
assert(
  lockedGmaulSpec.effectiveAction.specIntent === "none" &&
    lockedGmaulSpec.state.actors.opponent.gmaul.queuedSpecs === 0,
  "locked Gmaul spec intent should be rejected before queueing like NhStakerBot.applySpecIntent"
);
const stunnedGmaulSpecState = {
  ...acbGmaulSpecState,
  actors: {
    ...acbGmaulSpecState.actors,
    opponent: {
      ...acbGmaulSpecState.actors.opponent,
      locks: entityLocks.applyStun(acbGmaulSpecState.actors.opponent.locks, acbGmaulSpecState.tick, 3)
    }
  }
};
const stunnedGmaulSpec = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: stunnedGmaulSpecState,
  controller: acbGmaulSpecController,
  localActor: {
    tile: stunnedGmaulSpecState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: stunnedGmaulSpecState.actors.opponent.tile,
    loadoutId: "acb-hides",
    locks: stunnedGmaulSpecState.actors.opponent.locks
  }
});
assert(
  stunnedGmaulSpec.effectiveAction.specIntent === "none" &&
    stunnedGmaulSpec.state.actors.opponent.gmaul.queuedSpecs === 0,
  "stunned Gmaul spec intent should be rejected through the Java canAttack gate before queueing"
);
const deadTargetGmaulSpecState = {
  ...acbGmaulSpecState,
  actors: {
    ...acbGmaulSpecState.actors,
    "local-player": {
      ...acbGmaulSpecState.actors["local-player"],
      hitpoints: 0
    }
  }
};
const deadTargetGmaulSpec = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: deadTargetGmaulSpecState,
  controller: acbGmaulSpecController,
  localActor: {
    tile: deadTargetGmaulSpecState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: deadTargetGmaulSpecState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  deadTargetGmaulSpec.effectiveAction.specIntent === "none" &&
    deadTargetGmaulSpec.state.actors.opponent.gmaul.queuedSpecs === 0,
  "Gmaul spec intent should not queue against a dead target because Java canAttack rejects dead targets"
);

const frozenDiagonalGmaulSpecStateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 1 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentSpecialEnergy: 100,
  seed: 2408
});
const frozenDiagonalGmaulSpecState = {
  ...frozenDiagonalGmaulSpecStateBase,
  actors: {
    ...frozenDiagonalGmaulSpecStateBase.actors,
    opponent: {
      ...frozenDiagonalGmaulSpecStateBase.actors.opponent,
      locks: entityLocks.applyFreeze(
        frozenDiagonalGmaulSpecStateBase.actors.opponent.locks,
        frozenDiagonalGmaulSpecStateBase.tick,
        10
      )
    }
  }
};
const frozenDiagonalGmaulSpec = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: frozenDiagonalGmaulSpecState,
  controller: acbGmaulSpecController,
  localActor: {
    tile: frozenDiagonalGmaulSpecState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: frozenDiagonalGmaulSpecState.actors.opponent.tile,
    loadoutId: "acb-hides",
    locks: frozenDiagonalGmaulSpecState.actors.opponent.locks
  }
});
assert(
  frozenDiagonalGmaulSpec.effectiveAction.specIntent === "none" &&
    frozenDiagonalGmaulSpec.state.actors.opponent.gmaul.queuedSpecs === 0,
  "frozen diagonal Gmaul spec intent should be rejected like NhStakerBot.applySpecIntent"
);

const pressureSpecApproachController = {
  id: "test-policy-pressure-spec-approach",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const pressureSpecApproachState = withRecentOpponentHit(
  setActorHitpoints(
    runtimeCombat.createRuntimePlayerCombatState({
      localTile: { x: 0, z: 0 },
      opponentTile: { x: 2, z: 0 },
      localLoadoutId: "kodai-robes",
      opponentLoadoutId: "kodai-robes",
      opponentSpecialEnergy: 100,
      seed: 2409
    }),
    "local-player",
    45
  ),
  32
);
const pressureSpecApproach = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: pressureSpecApproachState,
  controller: pressureSpecApproachController,
  localActor: {
    tile: pressureSpecApproachState.actors["local-player"].tile,
    loadoutId: pressureSpecApproachState.actors["local-player"].loadoutId
  },
  opponentActor: {
    tile: pressureSpecApproachState.actors.opponent.tile,
    loadoutId: pressureSpecApproachState.actors.opponent.loadoutId
  }
});
assert(
  pressureSpecApproach.opponentMovedThisTick &&
    pressureSpecApproach.opponentTile.x === 1 &&
    pressureSpecApproach.opponentTile.z === 0,
  "pressure movement should route one tile in for a credible distance-two Gmaul approach like NhStakerBot.shouldApproachForSpec"
);
const pressureSpecNoWindowState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 2, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "kodai-robes",
  opponentSpecialEnergy: 100,
  seed: 2410
});
const pressureSpecNoWindow = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: pressureSpecNoWindowState,
  controller: pressureSpecApproachController,
  localActor: {
    tile: pressureSpecNoWindowState.actors["local-player"].tile,
    loadoutId: pressureSpecNoWindowState.actors["local-player"].loadoutId
  },
  opponentActor: {
    tile: pressureSpecNoWindowState.actors.opponent.tile,
    loadoutId: pressureSpecNoWindowState.actors.opponent.loadoutId
  }
});
assert(
  !pressureSpecNoWindow.opponentMovedThisTick &&
    pressureSpecNoWindow.opponentTile.x === 2 &&
    pressureSpecNoWindow.opponentTile.z === 0,
  "pressure movement should not approach for Gmaul when the source specApproachWindow is below SPEC_APPROACH_WINDOW_FLOOR"
);

const directionalIntoTargetController = {
  id: "test-policy-directional-into-target",
  chooseAction: () => ({
    offenceStyle: "melee",
    defencePrayer: "protect_from_magic",
    movementIntent: "step_west",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const directionalIntoTarget = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 1, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "tentacle-bandos",
    seed: 2404
  }),
  controller: directionalIntoTargetController,
  localActor: {
    tile: { x: 0, z: 0 },
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: { x: 1, z: 0 },
    loadoutId: "tentacle-bandos"
  }
});
assert(
  directionalIntoTarget.movementBlockedReason === "source-gated" && !directionalIntoTarget.opponentMovedThisTick,
  "ordinary directional policy movement should not step onto the opponent tile"
);

let policyStepContext = null;
const projectileBlockedStep = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 3, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "tentacle-bandos",
    seed: 2405
  }),
  controller: directionalIntoTargetController,
  localActor: {
    tile: { x: 0, z: 0 },
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: { x: 3, z: 0 },
    loadoutId: "tentacle-bandos"
  },
  canStep: (_from, _to, context) => {
    policyStepContext = context;
    return false;
  }
});
assert(policyStepContext?.targetTile.x === 0 && policyStepContext?.allowTargetTile === false, "policy canStep should receive source tryStep context");
assert(
  projectileBlockedStep.movementBlockedReason === "collision" && !projectileBlockedStep.opponentMovedThisTick,
  "policy step rejected by ProjectileRoute/collision predicate should not consume movement"
);

const maxRangeSideStepController = {
  id: "test-policy-max-range-side-step",
  chooseAction: () => ({
    offenceStyle: "magic",
    defencePrayer: "protect_from_missiles",
    movementIntent: "step_north",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const maxRangeSideStep = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 10, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "kodai-robes",
    seed: 2402
  }),
  controller: maxRangeSideStepController,
  localActor: {
    tile: { x: 0, z: 0 },
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: { x: 10, z: 0 },
    loadoutId: "kodai-robes"
  }
});
assert(
  maxRangeSideStep.movementBlockedReason === "source-gated" &&
    !maxRangeSideStep.opponentMovedThisTick &&
    maxRangeSideStep.nextRepositionTick === maxRangeSideStep.state.tick + 1,
  "policy directional side-step at max magic TargetRoute range should not consume movement and starve the attack route"
);

const maxRangeCloserStepController = {
  id: "test-policy-max-range-closer-step",
  chooseAction: () => ({
    offenceStyle: "magic",
    defencePrayer: "protect_from_missiles",
    movementIntent: "step_west",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const maxRangeCloserStep = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 10, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "kodai-robes",
    seed: 2403
  }),
  controller: maxRangeCloserStepController,
  localActor: {
    tile: { x: 0, z: 0 },
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: { x: 10, z: 0 },
    loadoutId: "kodai-robes"
  }
});
assert(
  maxRangeCloserStep.opponentMovedThisTick &&
    maxRangeCloserStep.opponentTile.x === 9 &&
    maxRangeCloserStep.movementBlockedReason === null,
  "policy directional step that moves back inside TargetRoute range should remain allowed"
);

const localFrozenStateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 2501
});
const localFrozenState = {
  ...localFrozenStateBase,
  actors: {
    ...localFrozenStateBase.actors,
    "local-player": {
      ...localFrozenStateBase.actors["local-player"],
      locks: entityLocks.applyFreeze(localFrozenStateBase.actors["local-player"].locks, localFrozenStateBase.tick, 10)
    }
  }
};
const standUnderController = {
  id: "test-policy-stand-under",
  chooseAction: () => ({
    offenceStyle: "magic",
    defencePrayer: "protect_from_missiles",
    movementIntent: "stand_under",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const standUnderApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: localFrozenState,
  controller: standUnderController,
  localActor: {
    tile: localFrozenState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    locks: localFrozenState.actors["local-player"].locks
  },
  opponentActor: {
    tile: localFrozenState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  nextRepositionTick: 0
});
assert(
  standUnderApplied.opponentMovedThisTick &&
    standUnderApplied.nextRepositionTick === localFrozenState.tick + 1,
  "stand_under should move onto a frozen target and set the source-backed reposition cooldown"
);
const standUnderCooldownBlocked = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: localFrozenState,
  controller: standUnderController,
  localActor: {
    tile: localFrozenState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    locks: localFrozenState.actors["local-player"].locks
  },
  opponentActor: {
    tile: localFrozenState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  nextRepositionTick: localFrozenState.tick + 1
});
assert(
  standUnderCooldownBlocked.movementBlockedReason === "reposition-cooldown" &&
    !standUnderCooldownBlocked.opponentMovedThisTick,
  "policy movement should honor NhStakerBot.nextRepositionTick instead of oscillating every tick"
);

const localFrozenFarStateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 3, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 2502
});
const localFrozenFarState = {
  ...localFrozenFarStateBase,
  actors: {
    ...localFrozenFarStateBase.actors,
    "local-player": {
      ...localFrozenFarStateBase.actors["local-player"],
      locks: entityLocks.applyFreeze(localFrozenFarStateBase.actors["local-player"].locks, localFrozenFarStateBase.tick, 10)
    }
  }
};
let standUnderRouteStepContext = null;
let standUnderDirectCanStepCalled = false;
const standUnderFarRoute = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: localFrozenFarState,
  controller: standUnderController,
  localActor: {
    tile: localFrozenFarState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    locks: localFrozenFarState.actors["local-player"].locks
  },
  opponentActor: {
    tile: localFrozenFarState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  tileRouteStep: (from, target, stepContext) => {
    standUnderRouteStepContext = stepContext;
    assert(target.x === 3 && target.z === 0, `stand_under routeAbsolute should target the frozen player's exact tile: ${JSON.stringify(target)}`);
    return { x: from.x, z: from.z + 1 };
  },
  canStep: () => {
    standUnderDirectCanStepCalled = true;
    return false;
  },
  nextRepositionTick: 0
});
assert(
  standUnderFarRoute.opponentMovedThisTick &&
    standUnderFarRoute.opponentTile.x === 0 &&
    standUnderFarRoute.opponentTile.z === 1 &&
    standUnderFarRoute.nextRepositionTick === localFrozenFarState.tick + 1 &&
    standUnderRouteStepContext?.movementIntent === "stand_under" &&
    standUnderRouteStepContext?.allowTargetTile === true &&
    !standUnderDirectCanStepCalled,
  `stand_under at observed distance > 1 should use Java routeAbsolute exact-tile path, not a direct tryStep fallback: ${JSON.stringify({
    moved: standUnderFarRoute.opponentMovedThisTick,
    tile: standUnderFarRoute.opponentTile,
    blocked: standUnderFarRoute.movementBlockedReason,
    directCanStepCalled: standUnderDirectCanStepCalled
  })}`
);
const standUnderFarNoRoute = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: localFrozenFarState,
  controller: standUnderController,
  localActor: {
    tile: localFrozenFarState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    locks: localFrozenFarState.actors["local-player"].locks
  },
  opponentActor: {
    tile: localFrozenFarState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  tileRouteStep: () => null,
  nextRepositionTick: 0
});
assert(
  !standUnderFarNoRoute.opponentMovedThisTick &&
    standUnderFarNoRoute.nextRepositionTick === localFrozenFarState.tick + 1 &&
    standUnderFarNoRoute.movementBlockedReason === "collision",
  `stand_under routeAbsolute with no path should not invent direct movement and should still consume the source reposition tick: ${JSON.stringify({
    moved: standUnderFarNoRoute.opponentMovedThisTick,
    tile: standUnderFarNoRoute.opponentTile,
    blocked: standUnderFarNoRoute.movementBlockedReason,
    nextRepositionTick: standUnderFarNoRoute.nextRepositionTick
  })}`
);
let standUnderNoRouteProviderCanStepCalled = false;
const standUnderFarNoRouteProvider = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: localFrozenFarState,
  controller: standUnderController,
  localActor: {
    tile: localFrozenFarState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    locks: localFrozenFarState.actors["local-player"].locks
  },
  opponentActor: {
    tile: localFrozenFarState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  canStep: () => {
    standUnderNoRouteProviderCanStepCalled = true;
    return true;
  },
  nextRepositionTick: 0
});
assert(
  !standUnderFarNoRouteProvider.opponentMovedThisTick &&
    standUnderFarNoRouteProvider.nextRepositionTick === localFrozenFarState.tick + 1 &&
    standUnderFarNoRouteProvider.movementBlockedReason === "source-gated" &&
    !standUnderNoRouteProviderCanStepCalled,
  `stand_under at observed distance > 1 must not fall through to direct tryStep when exact tile route support is absent: ${JSON.stringify({
    moved: standUnderFarNoRouteProvider.opponentMovedThisTick,
    tile: standUnderFarNoRouteProvider.opponentTile,
    blocked: standUnderFarNoRouteProvider.movementBlockedReason,
    nextRepositionTick: standUnderFarNoRouteProvider.nextRepositionTick,
    directCanStepCalled: standUnderNoRouteProviderCanStepCalled
  })}`
);

const lowHpSupplyStateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 2601
});
const lowHpSupplyState = {
  ...lowHpSupplyStateBase,
  actors: {
    ...lowHpSupplyStateBase.actors,
    opponent: {
      ...lowHpSupplyStateBase.actors.opponent,
      hitpoints: 38
    }
  }
};
const tripleEatController = {
  id: "test-policy-triple-main-food",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "triple_eat",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const tripleEat = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: lowHpSupplyState,
  controller: tripleEatController,
  localActor: {
    tile: lowHpSupplyState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: lowHpSupplyState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  tripleEat.consumedSupplies.join(",") === "manta_ray,saradomin_brew,karambwan",
  `triple_eat should execute Java main-food/brew/karambwan order, got ${tripleEat.consumedSupplies.join(",")}`
);
const sharkFallbackSupplyState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentSupplies: {
    manta_ray: 0,
    shark: 1,
    anglerfish: 0,
    karambwan: 1,
    saradomin_brew: 1,
    super_restore: 0,
    sanfew_serum: 0,
    super_combat: 0,
    ranging_potion: 0,
    bastion: 0
  },
  seed: 26011
});
const sharkFallbackTripleEat = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...sharkFallbackSupplyState,
    actors: {
      ...sharkFallbackSupplyState.actors,
      opponent: {
        ...sharkFallbackSupplyState.actors.opponent,
        hitpoints: 38
      }
    }
  },
  controller: tripleEatController,
  localActor: {
    tile: sharkFallbackSupplyState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: sharkFallbackSupplyState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  sharkFallbackTripleEat.consumedSupplies.join(",") === "shark,saradomin_brew,karambwan",
  `triple_eat should fall back to shark only when no manta ray exists, got ${sharkFallbackTripleEat.consumedSupplies.join(",")}`
);
const lowHpLockedSupplyState = {
  ...lowHpSupplyState,
  actors: {
    ...lowHpSupplyState.actors,
    opponent: {
      ...lowHpSupplyState.actors.opponent,
      locks: entityLocks.setLock(lowHpSupplyState.actors.opponent.locks, "full")
    }
  }
};
const lockedTripleEat = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: lowHpLockedSupplyState,
  controller: tripleEatController,
  localActor: {
    tile: lowHpLockedSupplyState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: lowHpLockedSupplyState.actors.opponent.tile,
    loadoutId: "acb-hides",
    locks: lowHpLockedSupplyState.actors.opponent.locks
  }
});
assert(
  lockedTripleEat.consumedSupplies.length === 0 &&
    lockedTripleEat.state.actors.opponent.hitpoints === lowHpLockedSupplyState.actors.opponent.hitpoints,
  "locked opponent supply intent should follow NhStakerBot.applySupplyIntent() and consume nothing"
);

const fullStatsRestoreController = {
  id: "test-policy-full-stats-restore-noop",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "restore_reboost",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const fullStatsRestore = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 5, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "acb-hides",
    seed: 2602
  }),
  controller: fullStatsRestoreController,
  localActor: {
    tile: { x: 0, z: 0 },
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: { x: 5, z: 0 },
    loadoutId: "acb-hides"
  }
});
assert(
  fullStatsRestore.consumedSupplies.length === 0,
  "restore_reboost should not burn supplies while source stat/prayer thresholds are full"
);
const lowPrayerRestoreState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentPrayerPoints: { current: 40, fixed: 99 },
  seed: 26021
});
const lowPrayerRestore = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: lowPrayerRestoreState,
  controller: fullStatsRestoreController,
  localActor: {
    tile: lowPrayerRestoreState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: lowPrayerRestoreState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  lowPrayerRestore.consumedSupplies.length === 0 &&
    lowPrayerRestore.state.actors.opponent.prayerPoints === 99 &&
    lowPrayerRestore.state.actors.opponent.supplies.super_restore === lowPrayerRestoreState.actors.opponent.supplies.super_restore,
  `policy inference should restore low prayer before restore_reboost supply logic, got ${JSON.stringify({
    consumed: lowPrayerRestore.consumedSupplies,
    prayerBefore: lowPrayerRestoreState.actors.opponent.prayerPoints,
    prayerAfter: lowPrayerRestore.state.actors.opponent.prayerPoints,
    restores: lowPrayerRestore.state.actors.opponent.supplies.super_restore
  })}`
);

const supplyRewardLowHp = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: lowHpSupplyState,
  controller: tripleEatController,
  localActor: {
    tile: lowHpSupplyState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: lowHpSupplyState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 0
});
const supplyRewardLowHpEvent = supplyRewardLowHp.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "supply_reward"
);
assert(
  supplyRewardLowHpEvent &&
    supplyRewardLowHpEvent.supplyIntent === "triple_eat" &&
    supplyRewardLowHpEvent.foodUses === 2 &&
    supplyRewardLowHpEvent.brewUses === 1 &&
    supplyRewardLowHpEvent.riskReduction > 0.5 &&
    supplyRewardLowHpEvent.reward > 0,
  `low-HP triple eat should receive Java supply risk-reduction reward, got ${JSON.stringify(supplyRewardLowHpEvent)}`
);

const highHpSafeEatController = {
  id: "test-policy-high-hp-safe-eat-reward",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "safe_eat",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const highHpSafeEatBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 26022
});
const highHpSafeEatState = {
  ...highHpSafeEatBase,
  actors: {
    ...highHpSafeEatBase.actors,
    opponent: {
      ...highHpSafeEatBase.actors.opponent,
      hitpoints: 90
    }
  }
};
const highHpSafeEat = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: highHpSafeEatState,
  controller: highHpSafeEatController,
  localActor: {
    tile: highHpSafeEatState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: highHpSafeEatState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 0
});
const highHpSafeEatReward = highHpSafeEat.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "supply_reward"
);
assert(
  highHpSafeEatReward &&
    highHpSafeEatReward.supplyIntent === "safe_eat" &&
    highHpSafeEatReward.foodUses === 1 &&
    highHpSafeEatReward.wastedFoodHealing === 13 &&
    highHpSafeEatReward.lowValueSupply === true &&
    highHpSafeEatReward.reward < 0,
  `high-HP safe eat should receive Java low-value/waste supply penalty, got ${JSON.stringify(highHpSafeEatReward)}`
);

const lowStatRestoreState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentLevels: {
    attack: 80,
    strength: 80,
    defence: 99,
    ranged: 80,
    magic: 80
  },
  opponentPrayerPoints: { current: 99, fixed: 99 },
  seed: 26022
});
const lowStatRestoreReward = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: lowStatRestoreState,
  controller: fullStatsRestoreController,
  localActor: {
    tile: lowStatRestoreState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: lowStatRestoreState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 0
});
const lowStatRestoreRewardEvent = lowStatRestoreReward.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "supply_reward"
);
assert(
  lowStatRestoreRewardEvent &&
    lowStatRestoreRewardEvent.supplyIntent === "restore_reboost" &&
    lowStatRestoreRewardEvent.restoreUses === 1 &&
    lowStatRestoreRewardEvent.restoreNeeded === true &&
    lowStatRestoreRewardEvent.restoreRecovered === true &&
    lowStatRestoreRewardEvent.reward > 0,
  `needed stat restore should receive Java restore recovery reward after use cost, got ${JSON.stringify(lowStatRestoreRewardEvent)}`
);

const lowRangedRangingPotionState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentLevels: {
    attack: 99,
    strength: 99,
    defence: 99,
    ranged: 80,
    magic: 99
  },
  opponentSupplies: {
    manta_ray: 0,
    shark: 0,
    anglerfish: 0,
    karambwan: 0,
    saradomin_brew: 0,
    super_restore: 0,
    sanfew_serum: 0,
    super_combat: 0,
    ranging_potion: 1,
    bastion: 0
  },
  seed: 26023
});
const lowRangedRangingPotion = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: lowRangedRangingPotionState,
  controller: fullStatsRestoreController,
  localActor: {
    tile: lowRangedRangingPotionState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: lowRangedRangingPotionState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  lowRangedRangingPotion.consumedSupplies.join(",") === "ranging_potion" &&
    lowRangedRangingPotion.state.actors.opponent.levels.ranged === 93 &&
    lowRangedRangingPotion.state.actors.opponent.supplies.ranging_potion === 0,
  `restore_reboost should fall back from missing bastion to Java RANGING_POTION_IDS before super combat, got ${JSON.stringify({
    consumed: lowRangedRangingPotion.consumedSupplies,
    ranged: lowRangedRangingPotion.state.actors.opponent.levels.ranged,
    supplies: lowRangedRangingPotion.state.actors.opponent.supplies
  })}`
);

const restorePriorityState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentLevels: {
    attack: 80,
    strength: 80,
    defence: 99,
    ranged: 99,
    magic: 99
  },
  opponentSupplies: {
    manta_ray: 0,
    shark: 0,
    anglerfish: 0,
    karambwan: 0,
    saradomin_brew: 0,
    super_restore: 1,
    sanfew_serum: 1,
    super_combat: 0,
    ranging_potion: 0,
    bastion: 0
  },
  seed: 26024
});
const restorePriority = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: restorePriorityState,
  controller: fullStatsRestoreController,
  localActor: {
    tile: restorePriorityState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: restorePriorityState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  restorePriority.consumedSupplies.join(",") === "super_restore" &&
    restorePriority.state.actors.opponent.supplies.super_restore === 0 &&
    restorePriority.state.actors.opponent.supplies.sanfew_serum === 1,
  `restore_reboost should consume only the first Java RESTORE_IDS match, got ${JSON.stringify({
    consumed: restorePriority.consumedSupplies,
    supplies: restorePriority.state.actors.opponent.supplies
  })}`
);

const reboostPriorityState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentLevels: {
    attack: 99,
    strength: 99,
    defence: 99,
    ranged: 80,
    magic: 99
  },
  opponentSupplies: {
    manta_ray: 0,
    shark: 0,
    anglerfish: 0,
    karambwan: 0,
    saradomin_brew: 0,
    super_restore: 0,
    sanfew_serum: 0,
    super_combat: 1,
    ranging_potion: 1,
    bastion: 1
  },
  seed: 26025
});
const reboostPriority = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: reboostPriorityState,
  controller: fullStatsRestoreController,
  localActor: {
    tile: reboostPriorityState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: reboostPriorityState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  reboostPriority.consumedSupplies.join(",") === "bastion" &&
    reboostPriority.state.actors.opponent.supplies.bastion === 0 &&
    reboostPriority.state.actors.opponent.supplies.ranging_potion === 1 &&
    reboostPriority.state.actors.opponent.supplies.super_combat === 1,
  `restore_reboost should prefer bastion before ranging and respect potion delay before super combat, got ${JSON.stringify({
    consumed: reboostPriority.consumedSupplies,
    supplies: reboostPriority.state.actors.opponent.supplies
  })}`
);

const brewedDownLevels = {
  attack: 90,
  strength: 90,
  defence: 99,
  ranged: 90,
  magic: 90
};
const brewedDownState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentLevels: brewedDownLevels,
  seed: 2603
});
const noneRecoveryController = {
  id: "test-policy-none-post-brew-recovery",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const noneRecovery = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: brewedDownState,
  controller: noneRecoveryController,
  localActor: {
    tile: brewedDownState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: brewedDownState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  noneRecovery.consumedSupplies.length === 0,
  `NONE supply should not promote restore/reboost outside Java postBrewRecoveryUntilTick, got ${noneRecovery.consumedSupplies.join(",")}`
);
const stickyBrewedDownState = {
  ...brewedDownState,
  tick: 4,
  actors: {
    ...brewedDownState.actors,
    opponent: {
      ...brewedDownState.actors.opponent,
      policyPostBrewRecoveryUntilTick: 11
    }
  }
};
const stickyNoneRecovery = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: stickyBrewedDownState,
  controller: noneRecoveryController,
  localActor: {
    tile: stickyBrewedDownState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: stickyBrewedDownState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  stickyNoneRecovery.consumedSupplies[0] === "super_restore",
  `NONE supply should promote to source post-brew restore/reboost only inside sticky recovery, got ${stickyNoneRecovery.consumedSupplies.join(",")}`
);
assert(
  stickyNoneRecovery.state.actors.opponent.policyPostBrewRecoveryUntilTick === 0,
  `post-brew recovery should clear after restore fully recovers Java needsPostBrewRecovery(), got ${stickyNoneRecovery.state.actors.opponent.policyPostBrewRecoveryUntilTick}`
);
const stickyStillNeedsRecoveryState = {
  ...brewedDownState,
  tick: 4,
  actors: {
    ...brewedDownState.actors,
    opponent: {
      ...brewedDownState.actors.opponent,
      levels: {
        attack: 40,
        strength: 99,
        defence: 99,
        ranged: 40,
        magic: 40
      },
      policyPostBrewRecoveryUntilTick: 11
    }
  }
};
const stickyStillNeedsRecovery = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: stickyStillNeedsRecoveryState,
  controller: noneRecoveryController,
  localActor: {
    tile: stickyStillNeedsRecoveryState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: stickyStillNeedsRecoveryState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  stickyStillNeedsRecovery.consumedSupplies[0] === "super_restore" &&
    stickyStillNeedsRecovery.state.actors.opponent.policyPostBrewRecoveryUntilTick === 12,
  `post-brew recovery should extend when restore/reboost is used but recovery is still needed, got ${JSON.stringify({
    consumed: stickyStillNeedsRecovery.consumedSupplies,
    until: stickyStillNeedsRecovery.state.actors.opponent.policyPostBrewRecoveryUntilTick,
    levels: stickyStillNeedsRecovery.state.actors.opponent.levels
  })}`
);
const clearedRecoveryStatsDrainedState = {
  ...stickyNoneRecovery.state,
  tick: 5,
  actors: {
    ...stickyNoneRecovery.state.actors,
    opponent: {
      ...stickyNoneRecovery.state.actors.opponent,
      levels: brewedDownLevels
    }
  }
};
const clearedRecoveryNoPromote = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: clearedRecoveryStatsDrainedState,
  controller: noneRecoveryController,
  localActor: {
    tile: clearedRecoveryStatsDrainedState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: clearedRecoveryStatsDrainedState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  clearedRecoveryNoPromote.consumedSupplies.length === 0,
  `cleared Java postBrewRecoveryUntilTick should not be recreated from recent restore events, got ${clearedRecoveryNoPromote.consumedSupplies.join(",")}`
);

let observedPolicySelfWeapon = null;
let observedPolicySelfStyle = null;
let observedPolicyOpponentWeapon = null;
const visibleEquipmentContextController = {
  id: "test-policy-visible-equipment-context",
  chooseAction: (context) => {
    observedPolicySelfWeapon = context.self.weaponId;
    observedPolicySelfStyle = context.self.lastOffenceStyle;
    observedPolicyOpponentWeapon = context.opponent.weaponId;
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
const staleLoadoutEquipmentState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes",
  seed: 2604
});
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: staleLoadoutEquipmentState,
  controller: visibleEquipmentContextController,
  localActor: {
    tile: staleLoadoutEquipmentState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    equipment: loadouts.nhLoadouts["tentacle-bandos"].equipment
  },
  opponentActor: {
    tile: staleLoadoutEquipmentState.actors.opponent.tile,
    loadoutId: "kodai-robes",
    equipment: loadouts.nhLoadouts["acb-hides"].equipment
  }
});
assert(
  observedPolicySelfWeapon === "armadyl_crossbow" && observedPolicySelfStyle === null,
  `policy self context should infer visible ACB equipment while preserving Java currentOffence=null, got ${observedPolicySelfWeapon}/${observedPolicySelfStyle}`
);
assert(
  observedPolicyOpponentWeapon === "tentacle_whip",
  `policy opponent context should infer visible local weapon despite stale loadout, got ${observedPolicyOpponentWeapon}`
);

let observedPolicySelfStyleAfterStaleAttack = null;
const staleSelfAttackEventState = {
  ...staleLoadoutEquipmentState,
  tick: 12,
  events: [
    {
      kind: "attack",
      tick: 11,
      attackerId: "opponent",
      defenderId: "local-player",
      style: "magic"
    }
  ]
};
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: staleSelfAttackEventState,
  controller: {
    id: "test-policy-self-current-style-not-stale-attack",
    chooseAction: (context) => {
      observedPolicySelfStyleAfterStaleAttack = context.self.lastOffenceStyle;
      return {
        offenceStyle: "ranged",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: staleSelfAttackEventState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: staleSelfAttackEventState.actors.opponent.tile,
    loadoutId: "kodai-robes",
    equipment: loadouts.nhLoadouts["acb-hides"].equipment
  }
});
assert(
  observedPolicySelfStyleAfterStaleAttack === null,
  `policy self current offence should preserve Java currentOffence=null and ignore stale previous attack events, got ${observedPolicySelfStyleAfterStaleAttack}`
);

const inferredStandardProfile = gearProfile.inferNhSelectedGearProfile({
  equipment: loadouts.nhLoadouts["tentacle-bandos"].equipment
});
const profileCandidateEquipment = gearProfile.nhGearProfileCandidateEquipmentByStyle(
  loadouts.nhLoadouts["tentacle-bandos"].equipment,
  inferredStandardProfile
);
assert(
  profileCandidateEquipment.magic.weapon.itemId === 21006 &&
    profileCandidateEquipment.magic.body.itemId === 4712 &&
    profileCandidateEquipment.magic.legs.itemId === 4714,
  "selected gear profile should build Java-style magic candidate equipment from selected weapon/body/legs"
);
assert(
  profileCandidateEquipment.ranged.weapon.itemId === 11785 &&
    profileCandidateEquipment.ranged.body.itemId === 11828 &&
    profileCandidateEquipment.ranged.legs.itemId === 11830,
  "selected gear profile should build Java-style ranged candidate equipment from selected weapon/body/legs"
);
assert(
  profileCandidateEquipment.slash.weapon.itemId === 12006 &&
    profileCandidateEquipment.slash.body.itemId === 11832 &&
    profileCandidateEquipment.slash.legs.itemId === 11834,
  "selected gear profile should build Java-style melee candidate equipment from selected weapon/body/legs"
);
const strictNoInventoryProfile = gearProfile.inferNhSelectedGearProfile({
  equipment: loadouts.nhLoadouts["tentacle-bandos"].equipment,
  inventoryItems: []
});
const strictNoInventoryCandidates = gearProfile.nhGearProfileCandidateEquipmentByStyle(
  loadouts.nhLoadouts["tentacle-bandos"].equipment,
  strictNoInventoryProfile
);
assert(
  strictNoInventoryCandidates.magic.weapon.itemId === 12006 &&
    strictNoInventoryCandidates.ranged.weapon.itemId === 12006 &&
    strictNoInventoryCandidates.ranged.body.itemId === 11832,
  "strict inventory profile should not invent missing Kodai/ACB/Armadyl items when Java-visible inventory does not contain them"
);
const strictRangedInventoryProfile = gearProfile.inferNhSelectedGearProfile({
  equipment: loadouts.nhLoadouts["tentacle-bandos"].equipment,
  inventoryItems: [
    loadouts.nhLoadouts["acb-hides"].equipment.weapon,
    loadouts.nhLoadouts["acb-hides"].equipment.body,
    loadouts.nhLoadouts["acb-hides"].equipment.legs
  ]
});
const strictRangedCandidates = gearProfile.nhGearProfileCandidateEquipmentByStyle(
  loadouts.nhLoadouts["tentacle-bandos"].equipment,
  strictRangedInventoryProfile
);
assert(
  strictRangedCandidates.ranged.weapon.itemId === 11785 &&
    strictRangedCandidates.ranged.body.itemId === 11828 &&
    strictRangedCandidates.ranged.legs.itemId === 11830 &&
    strictRangedCandidates.magic.weapon.itemId !== 21006,
  "strict inventory profile should use owned ranged gear while still refusing to invent missing magic gear"
);
const nhStakeItem = (itemId, name = `Item ${itemId}`) => ({ itemId, name });
const inventoryTieMagicAmuletProfile = gearProfile.inferNhSelectedGearProfile({
  equipment: {
    ...loadouts.nhLoadouts["tentacle-bandos"].equipment,
    amulet: nhStakeItem(19553, "Amulet of torture")
  },
  inventoryItems: [nhStakeItem(19547, "Necklace of anguish")]
});
assert(
  inventoryTieMagicAmuletProfile.magicAmuletItem.itemId === 19547,
  `Java pickOwnedBestForSlot tie ordering should prefer inventory before equipment for equal styleScore: ${JSON.stringify(inventoryTieMagicAmuletProfile.magicAmuletItem)}`
);
const javaFallbackEquipment = {
  ...loadouts.nhLoadouts["tentacle-bandos"].equipment,
  weapon: nhStakeItem(4675, "Ancient staff")
};
const javaFallbackInventoryItems = [
  nhStakeItem(9185, "Rune crossbow"),
  nhStakeItem(861, "Magic shortbow"),
  nhStakeItem(4151, "Abyssal whip")
];
const javaFallbackProfile = gearProfile.inferNhSelectedGearProfile({
  equipment: javaFallbackEquipment,
  inventoryItems: javaFallbackInventoryItems
});
const javaFallbackCandidates = gearProfile.nhGearProfileCandidateEquipmentByStyle(
  javaFallbackEquipment,
  javaFallbackProfile
);
assert(
  javaFallbackProfile.strictInventory &&
    javaFallbackProfile.magicWeaponId === "ancient_staff" &&
    javaFallbackProfile.rangedWeaponId === "rune_crossbow" &&
    javaFallbackProfile.meleeWeaponId === "abyssal_whip",
  `Java fallback weapon candidates should be inferred in NhStakerLoadout order: ${JSON.stringify(javaFallbackProfile)}`
);
assert(
  javaFallbackCandidates.magic.weapon.itemId === 4675 &&
    javaFallbackCandidates.ranged.weapon.itemId === 9185 &&
    javaFallbackCandidates.slash.weapon.itemId === 4151,
  `Java fallback candidate equipment should use Ancient staff/Rune crossbow/Abyssal whip: ${JSON.stringify(javaFallbackCandidates)}`
);
const javaFallbackRangeState = runtimeCombat.syncRuntimePlayerCombatStateToInput(
  runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 7, z: 0 },
    localLoadoutId: "kodai-robes",
    opponentLoadoutId: "tentacle-bandos",
    seed: 26054
  }),
  {
    tiles: {
      "local-player": { x: 0, z: 0 },
      opponent: { x: 7, z: 0 }
    },
    equipment: {
      opponent: javaFallbackEquipment
    },
    gearProfiles: {
      opponent: javaFallbackProfile
    }
  }
);
const javaFallbackRangeController = {
  id: "test-policy-rune-crossbow-range-route",
  chooseAction: (context) => {
    assert(
      context.self.gearProfile?.rangedWeaponId === "rune_crossbow" &&
        context.self.candidateEquipmentByStyle?.ranged?.weapon?.itemId === 9185,
      `policy context should expose the Java fallback ranged weapon: ${JSON.stringify(context.self.gearProfile)}`
    );
    return {
      offenceStyle: "ranged",
      defencePrayer: "protect_from_magic",
      movementIntent: "step_east",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false
    };
  }
};
const javaFallbackRangeApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: javaFallbackRangeState,
  controller: javaFallbackRangeController,
  localActor: {
    tile: javaFallbackRangeState.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: javaFallbackRangeState.actors.opponent.tile,
    loadoutId: "tentacle-bandos",
    equipment: javaFallbackEquipment,
    inventoryItems: javaFallbackInventoryItems
  }
});
assert(
  javaFallbackRangeApplied.state.actors.opponent.equipment.weapon?.itemId === 9185 &&
    javaFallbackRangeApplied.movementBlockedReason === "source-gated" &&
    javaFallbackRangeApplied.opponentMovedThisTick === false &&
    javaFallbackRangeApplied.opponentTile.x === 7,
  `Rune crossbow policy movement should use the selected weapon's 7-tile route range, not ACB range 8: ${JSON.stringify({
    weapon: javaFallbackRangeApplied.state.actors.opponent.equipment.weapon,
    movementBlockedReason: javaFallbackRangeApplied.movementBlockedReason,
    moved: javaFallbackRangeApplied.opponentMovedThisTick,
    tile: javaFallbackRangeApplied.opponentTile
  })}`
);
const nhStakeInventoryItems = [
  12695,
  22461,
  6685,
  6685,
  13441,
  391,
  391,
  10925,
  391,
  6685,
  391,
  10925,
  4736,
  21902,
  391,
  391,
  4759,
  22322,
  391,
  391,
  11802,
  12006,
  391,
  391,
  391,
  391,
  391,
  12791
].map((itemId) => nhStakeItem(itemId));
const nhStakeInventorySlots = nhStakeInventoryItems.map((item) => ({ itemId: item.itemId, quantity: 1 }));
const nhStakeEquipment = {
  head: nhStakeItem(10828, "Helm of neitiznot"),
  cape: nhStakeItem(21791, "Imbued saradomin cape"),
  amulet: nhStakeItem(6585, "Amulet of fury"),
  weapon: nhStakeItem(11791, "Staff of the dead"),
  body: nhStakeItem(4091, "Mystic robe top"),
  shield: nhStakeItem(12831, "Blessed spirit shield"),
  legs: nhStakeItem(4093, "Mystic robe bottom"),
  hands: nhStakeItem(7462, "Barrows gloves"),
  feet: nhStakeItem(11840, "Dragon boots"),
  ring: nhStakeItem(11770, "Berserker ring (i)"),
  ammo: nhStakeItem(21932, "Opal dragon bolts (e)")
};
const javaAcceptedSourceInventoryItems = nhStakeInventoryItems.map((item, index) => {
  if (index === 13) {
    return nhStakeItem(9185, "Rune crossbow");
  }
  if (index === 20) {
    return nhStakeItem(4675, "Ancient staff");
  }
  return item;
});
const javaAcceptedSourceInventorySlots = javaAcceptedSourceInventoryItems.map((item) => ({
  itemId: item.itemId,
  quantity: 1
}));
const nhStakeProfile = gearProfile.inferNhSelectedGearProfile({
  equipment: nhStakeEquipment,
  inventoryItems: nhStakeInventoryItems
});
const nhStakeCandidates = gearProfile.nhGearProfileCandidateEquipmentByStyle(nhStakeEquipment, nhStakeProfile);
assert(
  nhStakeProfile.strictInventory &&
    nhStakeProfile.magicWeaponId === "staff_of_the_dead" &&
    nhStakeProfile.rangedWeaponId === "dragon_crossbow" &&
    nhStakeProfile.meleeWeaponId === "tentacle_whip" &&
    nhStakeProfile.rangedAmmoItem.itemId === 21932 &&
    !gearProfile.nhGearProfileCanEquipGraniteMaul(nhStakeProfile),
  `NH stake profile should only expose owned Staff/DCB/Tent inventory and no Gmaul: ${JSON.stringify(nhStakeProfile)}`
);
assert(
  nhStakeCandidates.magic.weapon.itemId === 11791 &&
    nhStakeCandidates.ranged.weapon.itemId === 21902 &&
    nhStakeCandidates.slash.weapon.itemId === 12006 &&
    nhStakeCandidates.slash.shield?.itemId === 22322,
  `NH stake candidate equipment should use owned DCB and Tentacle+Avernic instead of canonical ACB/Gmaul: ${JSON.stringify(nhStakeCandidates)}`
);
const vestaSourceEquipment = {
  ...nhStakeEquipment,
  weapon: nhStakeItem(22613, "Vesta's longsword")
};
const vestaSourceInventoryItems = javaAcceptedSourceInventoryItems.map((item, index) =>
  index === 21 ? nhStakeItem(391, "Manta ray") : item
);
const vestaSourceProfile = gearProfile.inferNhSelectedGearProfile({
  equipment: vestaSourceEquipment,
  inventoryItems: vestaSourceInventoryItems
});
const normalizedVestaSourceProfile = gearProfile.nhGearProfileUsableBotSourceProfile(vestaSourceProfile);
const normalizedVestaEquipment = gearProfile.nhGearProfileNormalizeBotSourceEquipment(vestaSourceEquipment);
assert(
  normalizedVestaSourceProfile?.meleeWeaponId === "tentacle_whip" &&
    normalizedVestaSourceProfile.ownedItems.some((item) => item.itemId === 12006) &&
    gearProfile.nhGearProfileCanEquipArmadylGodsword(normalizedVestaSourceProfile) &&
    normalizedVestaEquipment.weapon?.itemId === 12006,
  `Vesta source layouts should normalize to the Java bot melee candidate and AGS special before acceptance: ${JSON.stringify({
    profile: normalizedVestaSourceProfile,
    equipment: normalizedVestaEquipment
  })}`
);
const nhStakeGmaulIntentController = {
  id: "test-policy-nh-stake-reject-impossible-gmaul",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "use_special_double",
    extendedSupplyAction: false
  })
};
const nhStakeRangedController = {
  id: "test-policy-nh-stake-dragon-crossbow",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const nhStakeBaseState = runtimeCombat.syncRuntimePlayerCombatStateToInput(
  runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 5, z: 0 },
    localLoadoutId: "kodai-robes",
    opponentLoadoutId: "kodai-robes",
    opponentSpecialEnergy: 100,
    seed: 26052
  }),
  {
    tiles: {
      "local-player": { x: 0, z: 0 },
      opponent: { x: 5, z: 0 }
    },
    equipment: {
      opponent: nhStakeEquipment
    },
    gearProfiles: {
      opponent: nhStakeProfile
    },
    prayers: {
      "local-player": ["protect_from_magic"]
    }
  }
);
const nhStakeGmaulRejected = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: nhStakeBaseState,
  controller: nhStakeGmaulIntentController,
  localActor: {
    tile: nhStakeBaseState.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    activePrayers: nhStakeBaseState.actors["local-player"].activePrayers
  },
  opponentActor: {
    tile: nhStakeBaseState.actors.opponent.tile,
    loadoutId: "kodai-robes",
    equipment: nhStakeEquipment
  }
});
assert(
  nhStakeGmaulRejected.effectiveAction.specIntent === "none" &&
    nhStakeGmaulRejected.opponentLoadoutId !== "gmaul-bandos" &&
    nhStakeGmaulRejected.state.actors.opponent.gmaul.queuedSpecs === 0 &&
    nhStakeGmaulRejected.state.actors.opponent.equipment.weapon?.itemId !== 4153,
  `NH stake policy must reject impossible Gmaul specs when no maul is owned: ${JSON.stringify({
    effectiveAction: nhStakeGmaulRejected.effectiveAction,
    loadout: nhStakeGmaulRejected.opponentLoadoutId,
    queuedSpecs: nhStakeGmaulRejected.state.actors.opponent.gmaul.queuedSpecs,
    weapon: nhStakeGmaulRejected.state.actors.opponent.equipment.weapon
  })}`
);
const nhStakeRangedApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: nhStakeBaseState,
  controller: nhStakeRangedController,
  localActor: {
    tile: nhStakeBaseState.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    activePrayers: nhStakeBaseState.actors["local-player"].activePrayers
  },
  opponentActor: {
    tile: nhStakeBaseState.actors.opponent.tile,
    loadoutId: "kodai-robes",
    equipment: nhStakeEquipment
  }
});
assert(
  nhStakeRangedApplied.state.actors.opponent.equipment.weapon?.itemId === 21902 &&
    nhStakeRangedApplied.state.actors.opponent.equipment.weapon?.itemId !== 11785,
  `NH stake ranged policy should use Dragon crossbow instead of invisible ACB: ${JSON.stringify(nhStakeRangedApplied.state.actors.opponent.equipment.weapon)}`
);
const sourceLayoutSyncState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides",
  opponentSpecialEnergy: 100,
  seed: 26053
});
const trainerOnlySourceLayoutRejected = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: sourceLayoutSyncState,
  controller: nhStakeRangedController,
  localActor: {
    tile: sourceLayoutSyncState.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    equipment: nhStakeEquipment,
    inventoryItems: nhStakeInventoryItems,
    inventorySlots: nhStakeInventorySlots
  },
  opponentActor: {
    tile: sourceLayoutSyncState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: false
});
assert(
  trainerOnlySourceLayoutRejected.state.actors.opponent.gearProfile?.magicWeaponId === "staff_of_the_dead" &&
    trainerOnlySourceLayoutRejected.state.actors.opponent.gearProfile?.rangedWeaponId === "dragon_crossbow",
  `copied bot source layouts should accept Staff/DCB weapon sets now present in Java NhStakerLoadout candidates: ${JSON.stringify({
    profile: trainerOnlySourceLayoutRejected.state.actors.opponent.gearProfile,
    weapon: trainerOnlySourceLayoutRejected.state.actors.opponent.equipment.weapon
  })}`
);
const sourceLayoutSynced = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: sourceLayoutSyncState,
  controller: nhStakeRangedController,
  localActor: {
    tile: sourceLayoutSyncState.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    equipment: nhStakeEquipment,
    inventoryItems: javaAcceptedSourceInventoryItems,
    inventorySlots: javaAcceptedSourceInventorySlots
  },
  opponentActor: {
    tile: sourceLayoutSyncState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: false
});
assert(
  sourceLayoutSynced.state.actors.opponent.gearProfile?.magicWeaponId === "staff_of_the_dead" &&
    sourceLayoutSynced.state.actors.opponent.gearProfile?.rangedWeaponId === "rune_crossbow" &&
    sourceLayoutSynced.state.actors.opponent.equipment.weapon?.itemId === 11791 &&
    sourceLayoutSynced.state.actors.opponent.supplies.manta_ray === 12 &&
    sourceLayoutSynced.state.actors.opponent.supplies.saradomin_brew === 3 &&
    sourceLayoutSynced.state.actors.opponent.supplies.sanfew_serum === 2 &&
    sourceLayoutSynced.state.actors.opponent.supplies.super_combat === 1 &&
    sourceLayoutSynced.state.actors.opponent.supplies.bastion === 1 &&
    sourceLayoutSynced.state.actors.opponent.policyNextLoadoutSyncTick === sourceLayoutSyncState.tick + 2 &&
    gearProfile.nhGearProfileCanEquipArmadylGodsword(sourceLayoutSynced.state.actors.opponent.gearProfile),
  `idle runtime policy should copy the local saved command layout into the bot and normalize AGS like Java: ${JSON.stringify({
    profile: sourceLayoutSynced.state.actors.opponent.gearProfile,
    weapon: sourceLayoutSynced.state.actors.opponent.equipment.weapon,
    supplies: sourceLayoutSynced.state.actors.opponent.supplies,
    nextLoadoutSyncTick: sourceLayoutSynced.state.actors.opponent.policyNextLoadoutSyncTick
  })}`
);
const incompleteSourceLayoutState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides",
  opponentSpecialEnergy: 100,
  seed: 26058
});
const incompleteSourceEquipment = {
  weapon: nhStakeItem(11791, "Staff of the dead")
};
const incompleteSourceInventoryItems = [
  nhStakeItem(21006, "Kodai wand"),
  nhStakeItem(21902, "Dragon crossbow"),
  nhStakeItem(12006, "Abyssal tentacle"),
  nhStakeItem(4153, "Granite maul")
];
const incompleteSourceLayoutRejected = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: incompleteSourceLayoutState,
  controller: nhStakeRangedController,
  localActor: {
    tile: incompleteSourceLayoutState.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    equipment: incompleteSourceEquipment,
    inventoryItems: incompleteSourceInventoryItems
  },
  opponentActor: {
    tile: incompleteSourceLayoutState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: false
});
assert(
  incompleteSourceLayoutRejected.state.actors.opponent.gearProfile?.rangedWeaponId === "armadyl_crossbow" &&
    incompleteSourceLayoutRejected.state.actors.opponent.equipment.weapon?.itemId === 11785,
  `idle source layout sync should reject incomplete command layouts like NhStakerLoadout.hasUsableBotLoadout(): ${JSON.stringify({
    profile: incompleteSourceLayoutRejected.state.actors.opponent.gearProfile,
    weapon: incompleteSourceLayoutRejected.state.actors.opponent.equipment.weapon
  })}`
);
const acbSourceInventoryItems = Object.values(loadouts.nhLoadouts)
  .flatMap((loadout) => Object.values(loadout.equipment))
  .filter(Boolean);
const sourceLayoutCooldownBlocked = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...sourceLayoutSynced.state,
    tick: sourceLayoutSynced.state.tick + 1
  },
  controller: nhStakeRangedController,
  localActor: {
    tile: sourceLayoutSynced.state.actors["local-player"].tile,
    loadoutId: "acb-hides",
    equipment: loadouts.nhLoadouts["acb-hides"].equipment,
    inventoryItems: acbSourceInventoryItems
  },
  opponentActor: {
    tile: sourceLayoutSynced.state.actors.opponent.tile,
    loadoutId: sourceLayoutSynced.state.actors.opponent.loadoutId
  },
  rewardEpisodeActive: false
});
assert(
  sourceLayoutCooldownBlocked.state.actors.opponent.gearProfile?.rangedWeaponId === "rune_crossbow" &&
    sourceLayoutCooldownBlocked.state.actors.opponent.policyNextLoadoutSyncTick === sourceLayoutSynced.state.actors.opponent.policyNextLoadoutSyncTick,
  `idle source layout sync should follow Java nextLoadoutSyncTick and ignore changed layouts during cooldown: ${JSON.stringify({
    tick: sourceLayoutCooldownBlocked.state.tick,
    profile: sourceLayoutCooldownBlocked.state.actors.opponent.gearProfile,
    nextLoadoutSyncTick: sourceLayoutCooldownBlocked.state.actors.opponent.policyNextLoadoutSyncTick
  })}`
);
const sourceLayoutSupplyOnlySlots = javaAcceptedSourceInventorySlots.map((slot, index) =>
  index === 6 ? { ...slot, quantity: 2 } : slot
);
const sourceLayoutSupplyOnlyChange = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...sourceLayoutSynced.state,
    tick: sourceLayoutSynced.state.tick + 2
  },
  controller: nhStakeRangedController,
  localActor: {
    tile: sourceLayoutSynced.state.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    equipment: nhStakeEquipment,
    inventoryItems: javaAcceptedSourceInventoryItems,
    inventorySlots: sourceLayoutSupplyOnlySlots
  },
  opponentActor: {
    tile: sourceLayoutSynced.state.actors.opponent.tile,
    loadoutId: sourceLayoutSynced.state.actors.opponent.loadoutId
  },
  rewardEpisodeActive: false
});
assert(
  sourceLayoutSupplyOnlyChange.state.actors.opponent.gearProfile?.rangedWeaponId === "rune_crossbow" &&
    sourceLayoutSupplyOnlyChange.state.actors.opponent.supplies.manta_ray === 13 &&
    sourceLayoutSupplyOnlyChange.state.actors.opponent.policyNextLoadoutSyncTick === sourceLayoutSynced.state.tick + 4,
  `idle source layout sync should follow Java savedLayoutSignature and recopy supply-only/amount changes: ${JSON.stringify({
    profile: sourceLayoutSupplyOnlyChange.state.actors.opponent.gearProfile,
    supplies: sourceLayoutSupplyOnlyChange.state.actors.opponent.supplies,
    sourceSignature: sourceLayoutSupplyOnlyChange.state.actors.opponent.policyLoadoutSourceSignature,
    nextLoadoutSyncTick: sourceLayoutSupplyOnlyChange.state.actors.opponent.policyNextLoadoutSyncTick
  })}`
);
const sourceLayoutAfterCooldown = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...sourceLayoutSynced.state,
    tick: sourceLayoutSynced.state.tick + 2
  },
  controller: nhStakeRangedController,
  localActor: {
    tile: sourceLayoutSynced.state.actors["local-player"].tile,
    loadoutId: "acb-hides",
    equipment: loadouts.nhLoadouts["acb-hides"].equipment,
    inventoryItems: acbSourceInventoryItems
  },
  opponentActor: {
    tile: sourceLayoutSynced.state.actors.opponent.tile,
    loadoutId: sourceLayoutSynced.state.actors.opponent.loadoutId
  },
  rewardEpisodeActive: false
});
assert(
  sourceLayoutAfterCooldown.state.actors.opponent.gearProfile?.rangedWeaponId === "armadyl_crossbow" &&
    sourceLayoutAfterCooldown.state.actors.opponent.policyNextLoadoutSyncTick === sourceLayoutSynced.state.tick + 4,
  `idle source layout sync should accept changed layouts once Java nextLoadoutSyncTick has elapsed: ${JSON.stringify({
    tick: sourceLayoutAfterCooldown.state.tick,
    profile: sourceLayoutAfterCooldown.state.actors.opponent.gearProfile,
    nextLoadoutSyncTick: sourceLayoutAfterCooldown.state.actors.opponent.policyNextLoadoutSyncTick
  })}`
);
let observedSourceSyncCurrentOffence = null;
const sourceLayoutStaleStyleState = {
  ...sourceLayoutSyncState,
  actors: {
    ...sourceLayoutSyncState.actors,
    opponent: {
      ...sourceLayoutSyncState.actors.opponent,
      policyOffenceStyle: "melee",
      policyStalledStyle: "magic",
      policyStalledStyleTicks: 5
    }
  }
};
const sourceLayoutResetsStyle = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: sourceLayoutStaleStyleState,
  controller: {
    id: "test-policy-source-layout-clears-current-offence",
    chooseAction: (context) => {
      observedSourceSyncCurrentOffence = context.self.lastOffenceStyle;
      return {
        offenceStyle: "ranged",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: sourceLayoutSyncState.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    equipment: nhStakeEquipment,
    inventoryItems: nhStakeInventoryItems
  },
  opponentActor: {
    tile: sourceLayoutSyncState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: false
});
assert(
  observedSourceSyncCurrentOffence !== "melee" &&
    sourceLayoutResetsStyle.state.actors.opponent.policyStalledStyleTicks < 5,
  `idle source layout sync should clear stale Java currentOffence/style-stall state before the next decision, got ${JSON.stringify({
    currentOffence: observedSourceSyncCurrentOffence,
    stalledStyle: sourceLayoutResetsStyle.state.actors.opponent.policyStalledStyle,
    stalledTicks: sourceLayoutResetsStyle.state.actors.opponent.policyStalledStyleTicks
  })}`
);
const sourceLayoutActiveEpisode = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: sourceLayoutSyncState,
  controller: nhStakeRangedController,
  localActor: {
    tile: sourceLayoutSyncState.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    equipment: nhStakeEquipment,
    inventoryItems: nhStakeInventoryItems
  },
  opponentActor: {
    tile: sourceLayoutSyncState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: true
});
assert(
  sourceLayoutActiveEpisode.state.actors.opponent.gearProfile?.rangedWeaponId === "armadyl_crossbow" &&
    sourceLayoutActiveEpisode.state.actors.opponent.gearProfile?.rangedWeaponId !== "dragon_crossbow",
  `active reward episodes should not resync the bot profile from a changed local layout: ${JSON.stringify(sourceLayoutActiveEpisode.state.actors.opponent.gearProfile)}`
);
const emergencyRecoveryBaseState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides",
  opponentLevels: { attack: 43, strength: 42, defence: 41, ranged: 44, magic: 45 },
  opponentSupplies: {
    manta_ray: 0,
    shark: 0,
    anglerfish: 0,
    karambwan: 0,
    saradomin_brew: 0,
    super_restore: 0,
    sanfew_serum: 0,
    super_combat: 0,
    ranging_potion: 0,
    bastion: 0
  },
  opponentSpecialEnergy: 0,
  seed: 26057
});
const emergencyRecoveryState = {
  ...emergencyRecoveryBaseState,
  actors: {
    ...emergencyRecoveryBaseState.actors,
    opponent: {
      ...emergencyRecoveryBaseState.actors.opponent,
      equipment: {},
      hitpoints: 17,
      activePrayers: ["protect_from_magic"],
      locks: entityLocks.applyFreeze(emergencyRecoveryBaseState.actors.opponent.locks, 0, 8, "local-player"),
      queuedSpellId: "ice-barrage",
      autocastSpellId: "blood-barrage",
      defensiveCast: true,
      specialActive: true,
      gmaul: {
        ...emergencyRecoveryBaseState.actors.opponent.gmaul,
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
let emergencyRecoveryContextSelf = null;
const emergencyRecoveryApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: emergencyRecoveryState,
  controller: {
    id: "test-policy-critical-loadout-emergency-recovery",
    chooseAction: (context) => {
      emergencyRecoveryContextSelf = context.self;
      return {
        offenceStyle: "magic",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: emergencyRecoveryState.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: emergencyRecoveryState.actors.opponent.tile,
    loadoutId: "acb-hides",
    equipment: {}
  },
  rewardEpisodeActive: false
});
assert(
  emergencyRecoveryContextSelf?.stats.hitpoints.current === 99 &&
    emergencyRecoveryContextSelf?.stats.magic.current === 99 &&
    emergencyRecoveryContextSelf?.activePrayers.length === 0 &&
    emergencyRecoveryContextSelf?.loadoutId === "kodai-robes" &&
    emergencyRecoveryContextSelf?.equipment.weapon?.itemId === 21006,
  `critical loadout recovery should happen before policy context capture like Java runtime_guard: ${JSON.stringify({
    hp: emergencyRecoveryContextSelf?.stats.hitpoints,
    magic: emergencyRecoveryContextSelf?.stats.magic,
    prayers: emergencyRecoveryContextSelf?.activePrayers,
    loadout: emergencyRecoveryContextSelf?.loadoutId,
    weapon: emergencyRecoveryContextSelf?.equipment.weapon
  })}`
);
assert(
    emergencyRecoveryApplied.state.actors.opponent.equipment.head?.itemId === 12929 &&
    emergencyRecoveryApplied.state.actors.opponent.hitpoints === 99 &&
    emergencyRecoveryApplied.state.actors.opponent.prayerPoints === 99 &&
    emergencyRecoveryApplied.state.actors.opponent.supplies.manta_ray === 4 &&
    emergencyRecoveryApplied.state.actors.opponent.supplies.saradomin_brew === 2 &&
    emergencyRecoveryApplied.state.actors.opponent.queuedSpellId === null &&
    emergencyRecoveryApplied.state.actors.opponent.autocastSpellId === null &&
    emergencyRecoveryApplied.state.actors.opponent.defensiveCast === false &&
    emergencyRecoveryApplied.state.actors.opponent.specialActive === false &&
    emergencyRecoveryApplied.state.actors.opponent.gmaul.queuedSpecs === 0 &&
    emergencyRecoveryApplied.state.actors.opponent.gmaul.specialEnergy === 100 &&
    emergencyRecoveryApplied.state.actors.opponent.locks.freezeUntilTick === -1,
  `critical loadout recovery should rebuild mage setup and clear source runtime state: ${JSON.stringify(emergencyRecoveryApplied.state.actors.opponent)}`
);
const fixedCoreStatsGapState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "kodai-robes",
  opponentLevels: { attack: 88, strength: 87, defence: 86, ranged: 85, magic: 84 },
  opponentFixedLevels: { attack: 88, strength: 87, defence: 86, ranged: 85, magic: 84 },
  seed: 26059
});
let fixedCoreStatsContextSelf = null;
const fixedCoreStatsRecovered = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: fixedCoreStatsGapState,
  controller: {
    id: "test-policy-fixed-core-stats-emergency-recovery",
    chooseAction: (context) => {
      fixedCoreStatsContextSelf = context.self;
      return {
        offenceStyle: "magic",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: fixedCoreStatsGapState.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: fixedCoreStatsGapState.actors.opponent.tile,
    loadoutId: "kodai-robes"
  },
  rewardEpisodeActive: false
});
assert(
  fixedCoreStatsContextSelf?.stats.attack.current === 99 &&
    fixedCoreStatsContextSelf?.stats.attack.fixed === 99 &&
    fixedCoreStatsContextSelf?.stats.magic.current === 99 &&
    fixedCoreStatsContextSelf?.stats.magic.fixed === 99 &&
    fixedCoreStatsRecovered.state.actors.opponent.fixedLevels.magic === 99 &&
    fixedCoreStatsRecovered.state.actors.opponent.hitpoints === 99 &&
    fixedCoreStatsRecovered.state.actors.opponent.prayerPoints === 99,
  `fixed/base combat levels below Java's 90 threshold should trigger runtime_guard recovery before policy context: ${JSON.stringify({
    contextStats: fixedCoreStatsContextSelf?.stats,
    actor: fixedCoreStatsRecovered.state.actors.opponent
  })}`
);
const brewedCurrentStatsState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "kodai-robes",
  opponentLevels: { attack: 43, strength: 42, defence: 41, ranged: 44, magic: 45 },
  seed: 26058
});
let brewedCurrentStatsContextSelf = null;
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...brewedCurrentStatsState,
    actors: {
      ...brewedCurrentStatsState.actors,
      opponent: {
        ...brewedCurrentStatsState.actors.opponent,
        hitpoints: 17
      }
    }
  },
  controller: {
    id: "test-policy-brewed-current-stats-not-emergency",
    chooseAction: (context) => {
      brewedCurrentStatsContextSelf = context.self;
      return {
        offenceStyle: "magic",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: brewedCurrentStatsState.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: brewedCurrentStatsState.actors.opponent.tile,
    loadoutId: "kodai-robes"
  },
  rewardEpisodeActive: false
});
assert(
  brewedCurrentStatsContextSelf?.stats.hitpoints.current === 17 &&
    brewedCurrentStatsContextSelf?.stats.magic.current === 45,
  `current brewed/down levels should not trigger Java fixed-level emergency recovery: ${JSON.stringify({
    hp: brewedCurrentStatsContextSelf?.stats.hitpoints,
    magic: brewedCurrentStatsContextSelf?.stats.magic
  })}`
);
const strictRuntimeNoInventoryState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "tentacle-bandos",
  opponentLoadoutId: "tentacle-bandos",
  seed: 26051
});
const strictRuntimeRangedController = {
  id: "test-policy-strict-inventory-no-canonical-equip",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const strictRuntimeNoInventoryApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: strictRuntimeNoInventoryState,
  controller: strictRuntimeRangedController,
  localActor: {
    tile: strictRuntimeNoInventoryState.actors["local-player"].tile,
    loadoutId: "tentacle-bandos"
  },
  opponentActor: {
    tile: strictRuntimeNoInventoryState.actors.opponent.tile,
    loadoutId: "tentacle-bandos",
    equipment: loadouts.nhLoadouts["tentacle-bandos"].equipment,
    inventoryItems: []
  }
});
assert(
  strictRuntimeNoInventoryApplied.state.actors.opponent.equipment.weapon?.itemId !== 11785 &&
    strictRuntimeNoInventoryApplied.state.actors.opponent.equipment.body?.itemId !== 11828 &&
    strictRuntimeNoInventoryApplied.state.actors.opponent.equipment.legs?.itemId !== 11830,
  `runtime strict inventory action should not re-seed canonical ACB/Armadyl gear through setRuntimePlayerCombatLoadout: ${JSON.stringify(strictRuntimeNoInventoryApplied.state.actors.opponent.equipment)}`
);
const flexibleGearProfile = gearProfile.inferNhSelectedGearProfile({
  equipment: loadouts.nhLoadouts["kodai-robes"].equipment
});
const flexibleMagicAction = {
  offenceStyle: "magic",
  defencePrayer: "protect_from_magic",
  movementIntent: "pressure",
  supplyIntent: "none",
  specIntent: "none",
  extendedSupplyAction: false
};
const flexibleGearAllowed = gearProfile.nhGearProfileActionEquipment({
  currentEquipment: loadouts.nhLoadouts["kodai-robes"].equipment,
  profile: flexibleGearProfile,
  action: flexibleMagicAction,
  threatStyle: "melee",
  underPressure: false,
  hitpoints: 99,
  allowFlexibleGear: true
});
const flexibleGearBlocked = gearProfile.nhGearProfileActionEquipment({
  currentEquipment: loadouts.nhLoadouts["kodai-robes"].equipment,
  profile: flexibleGearProfile,
  action: flexibleMagicAction,
  threatStyle: "melee",
  underPressure: false,
  hitpoints: 99,
  allowFlexibleGear: false
});
assert(
  flexibleGearAllowed.shield?.itemId === flexibleGearBlocked.shield?.itemId &&
    flexibleGearBlocked.shield?.itemId === loadouts.nhLoadouts["kodai-robes"].equipment.shield.itemId,
  "flexible gear optimization should not invent defensive swaps when no live source inventory exposes better slot candidates"
);
const flexibleRangedAction = {
  ...flexibleMagicAction,
  offenceStyle: "ranged"
};
const flexibleGearOnePass = gearProfile.nhGearProfileActionEquipment({
  currentEquipment: loadouts.nhLoadouts["kodai-robes"].equipment,
  profile: flexibleGearProfile,
  action: flexibleRangedAction,
  threatStyle: "melee",
  underPressure: false,
  hitpoints: 99,
  allowFlexibleGear: true,
  flexibleGearPasses: 1
});
const flexibleGearTwoPass = gearProfile.nhGearProfileActionEquipment({
  currentEquipment: loadouts.nhLoadouts["kodai-robes"].equipment,
  profile: flexibleGearProfile,
  action: flexibleRangedAction,
  threatStyle: "melee",
  underPressure: false,
  hitpoints: 99,
  allowFlexibleGear: true,
  flexibleGearPasses: 2
});
assert(
  flexibleGearOnePass.legs?.itemId === flexibleGearTwoPass.legs?.itemId,
  "style-switch flexible gear should not invent a second-pass leg swap without live source inventory candidates"
);

const profileRuntimeState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "tentacle-bandos",
  seed: 2605
});
const profileRuntimeController = {
  id: "test-policy-profile-action-equipment",
  chooseAction: (context) => {
    assert(
      context.self.candidateEquipmentByStyle?.magic?.body?.itemId === 4712,
      "policy context should expose inferred magic candidate equipment for EV ranking"
    );
    assert(
      context.self.candidateEquipmentByStyle?.ranged?.weapon?.itemId === 11785,
      "policy context should expose inferred ranged candidate equipment for EV ranking"
    );
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
const profileRuntimeApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: profileRuntimeState,
  controller: profileRuntimeController,
  localActor: {
    tile: profileRuntimeState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: profileRuntimeState.actors.opponent.tile,
    loadoutId: "tentacle-bandos"
  }
});
assert(
  profileRuntimeApplied.state.actors.opponent.gearProfile?.rangedWeaponId === "armadyl_crossbow",
  "runtime opponent should persist the inferred selected gear profile on the actor"
);
assert(
  profileRuntimeApplied.state.actors.opponent.equipment.weapon?.itemId === 11785 &&
    profileRuntimeApplied.state.actors.opponent.equipment.ammo?.itemId === 21948,
  "runtime policy action should apply the selected ranged weapon/ammo from the inferred profile"
);

const smiteGuardController = {
  id: "test-policy-smite-guard",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "smite",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const smiteGuardState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 2606
});
const smiteGuardApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: smiteGuardState,
  controller: smiteGuardController,
  localActor: {
    tile: smiteGuardState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: smiteGuardState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  smiteGuardApplied.effectiveAction.defencePrayer === "protect_from_missiles" &&
    !smiteGuardApplied.state.actors.opponent.activePrayers.includes("smite"),
  `playable practice bot should reject Smite outside Java isSelfPlayBot mode, got ${smiteGuardApplied.effectiveAction.defencePrayer}`
);
const smiteSelfPlayApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: smiteGuardState,
  controller: smiteGuardController,
  localActor: {
    tile: smiteGuardState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: smiteGuardState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  selfPlayMode: true
});
assert(
  smiteSelfPlayApplied.effectiveAction.defencePrayer === "smite" &&
    smiteSelfPlayApplied.state.actors.opponent.activePrayers.includes("smite"),
  `self-play smite should remain executable in safe Java shouldAllowSmite windows, got ${smiteSelfPlayApplied.effectiveAction.defencePrayer}`
);

const smiteLowHpState = {
  ...smiteGuardState,
  actors: {
    ...smiteGuardState.actors,
    opponent: {
      ...smiteGuardState.actors.opponent,
      hitpoints: 50
    }
  }
};
const smiteLowHpApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: smiteLowHpState,
  controller: smiteGuardController,
  localActor: {
    tile: smiteLowHpState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: smiteLowHpState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  smiteLowHpApplied.effectiveAction.defencePrayer === "protect_from_missiles",
  `unsafe low-HP smite should resolve to source protection prayer, got ${smiteLowHpApplied.effectiveAction.defencePrayer}`
);

const smitePostSupplyController = {
  id: "test-policy-smite-post-supply",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "smite",
    movementIntent: "pressure",
    supplyIntent: "triple_eat",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const smitePostSupplyApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: smiteLowHpState,
  controller: smitePostSupplyController,
  localActor: {
    tile: smiteLowHpState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: smiteLowHpState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  selfPlayMode: true
});
assert(
  smitePostSupplyApplied.effectiveAction.defencePrayer === "smite" &&
    smitePostSupplyApplied.state.actors.opponent.activePrayers.includes("smite"),
  `self-play Smite should survive applyContextGuards and resolve after Java supply order, got ${smitePostSupplyApplied.effectiveAction.defencePrayer}/${smitePostSupplyApplied.consumedSupplies.join(",")}`
);

const smiteUnknownOpponentState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides",
  seed: 26062
});
const smiteUnknownOpponentApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: smiteUnknownOpponentState,
  controller: smiteGuardController,
  localActor: {
    tile: smiteUnknownOpponentState.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    observedInfoKnown: false
  },
  opponentActor: {
    tile: smiteUnknownOpponentState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  smiteUnknownOpponentApplied.effectiveAction.defencePrayer === "protect_from_melee",
  `unknown delayed opponent should fall back to Java protectionPrayerFor default melee, got ${smiteUnknownOpponentApplied.effectiveAction.defencePrayer}`
);

const smiteUnknownRememberedPrayerState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides",
  opponentPrayers: ["protect_from_missiles"],
  seed: 26063
});
const smiteUnknownRememberedPrayerApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: smiteUnknownRememberedPrayerState,
  controller: smiteGuardController,
  localActor: {
    tile: smiteUnknownRememberedPrayerState.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    observedInfoKnown: false
  },
  opponentActor: {
    tile: smiteUnknownRememberedPrayerState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  smiteUnknownRememberedPrayerApplied.effectiveAction.defencePrayer === "protect_from_missiles",
  `unknown delayed opponent should keep existing standard protection prayer like Java lastDefencePrayer, got ${smiteUnknownRememberedPrayerApplied.effectiveAction.defencePrayer}`
);

let smiteLikelyObservedStyle = null;
let smiteLikelyVisibleStyle = null;
const smiteLikelyStyleBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 26061
});
const smiteLikelyStyleState = {
  ...smiteLikelyStyleBase,
  tick: 12,
  events: [
    {
      kind: "attack",
      id: "test-local-magic-attack",
      tick: 11,
      attackerId: "local-player",
      defenderId: "opponent",
      attackerTile: smiteLikelyStyleBase.actors["local-player"].tile,
      defenderTile: smiteLikelyStyleBase.actors.opponent.tile,
      style: "magic",
      sequenceName: "magic",
      hitDelayTicks: 2,
      maxDamage: 31,
      hitChance: 1,
      expectedDamage: 31,
      attackerActivePrayers: [],
      attackerEquipment: smiteLikelyStyleBase.actors["local-player"].equipment,
      defenderEquipment: smiteLikelyStyleBase.actors.opponent.equipment
    }
  ]
};
const smiteLikelyStyleApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: smiteLikelyStyleState,
  controller: {
    id: "test-policy-smite-likely-style-guard",
    chooseAction: (context) => {
      smiteLikelyObservedStyle = context.opponent.lastOffenceStyle;
      smiteLikelyVisibleStyle = context.opponent.lastVisibleOpponentStyle;
      return smiteGuardController.chooseAction(context);
    }
  },
  localActor: {
    tile: smiteLikelyStyleState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: smiteLikelyStyleState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  smiteLikelyObservedStyle === "magic" && smiteLikelyVisibleStyle === "ranged",
  `runtime policy should keep delayed likely style separate from visible gear style, got ${smiteLikelyObservedStyle}/${smiteLikelyVisibleStyle}`
);
assert(
  smiteLikelyStyleApplied.effectiveAction.defencePrayer === "protect_from_magic",
  `smite fallback should pray against delayed likely attack style before gear fallback, got ${smiteLikelyStyleApplied.effectiveAction.defencePrayer}`
);

let staleLocalAttackLikelyStyle = null;
let staleLocalAttackVisibleStyle = null;
const staleLocalAttackState = {
  ...smiteLikelyStyleBase,
  tick: 12,
  events: [
    {
      kind: "attack",
      id: "test-stale-local-magic-attack",
      tick: 10,
      attackerId: "local-player",
      defenderId: "opponent",
      attackerTile: smiteLikelyStyleBase.actors["local-player"].tile,
      defenderTile: smiteLikelyStyleBase.actors.opponent.tile,
      style: "magic",
      sequenceName: "magic",
      hitDelayTicks: 2,
      maxDamage: 31,
      hitChance: 1,
      expectedDamage: 31,
      attackerActivePrayers: [],
      attackerEquipment: smiteLikelyStyleBase.actors["local-player"].equipment,
      defenderEquipment: smiteLikelyStyleBase.actors.opponent.equipment
    }
  ]
};
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: staleLocalAttackState,
  controller: {
    id: "test-policy-stale-local-attack-does-not-shadow-gear",
    chooseAction: (context) => {
      staleLocalAttackLikelyStyle = context.opponent.lastOffenceStyle;
      staleLocalAttackVisibleStyle = context.opponent.lastVisibleOpponentStyle;
      return smiteGuardController.chooseAction(context);
    }
  },
  localActor: {
    tile: staleLocalAttackState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: staleLocalAttackState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  staleLocalAttackLikelyStyle === "ranged" && staleLocalAttackVisibleStyle === "ranged",
  `runtime policy should not let attacks older than the one-tick delayed info snapshot shadow visible gear, got ${staleLocalAttackLikelyStyle}/${staleLocalAttackVisibleStyle}`
);

let genericStaffVisibleStyle = null;
let genericStaffLikelyStyle = null;
const genericStaffEquipment = {
  ...loadouts.nhLoadouts["acb-hides"].equipment,
  weapon: { itemId: 990001, name: "Staff of light" }
};
const genericStaffState = runtimeCombat.syncRuntimePlayerCombatStateToInput(
  runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 5, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "acb-hides",
    seed: 260615
  }),
  {
    tiles: {
      "local-player": { x: 0, z: 0 },
      opponent: { x: 5, z: 0 }
    },
    equipment: {
      "local-player": genericStaffEquipment
    }
  }
);
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: genericStaffState,
  controller: {
    id: "test-policy-generic-staff-visible-style",
    chooseAction: (context) => {
      genericStaffVisibleStyle = context.opponent.lastVisibleOpponentStyle;
      genericStaffLikelyStyle = context.opponent.lastOffenceStyle;
      return {
        offenceStyle: "ranged",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: genericStaffState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    equipment: genericStaffEquipment
  },
  opponentActor: {
    tile: genericStaffState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  genericStaffVisibleStyle === "magic" && genericStaffLikelyStyle === "magic",
  `runtime policy should port Java styleFromWeapon name inference for generic staff/wand weapons, got ${genericStaffVisibleStyle}/${genericStaffLikelyStyle}`
);

for (const guaranteedMagicWeaponId of [21006, 11907, 22288, 12899, 22292, 12904, 11791, 22323, 4675]) {
  let guaranteedMagicVisibleStyle = null;
  let guaranteedMagicLikelyStyle = null;
  const guaranteedMagicEquipment = {
    ...loadouts.nhLoadouts["kodai-robes"].equipment,
    weapon: { itemId: guaranteedMagicWeaponId, name: "Unknown weapon" }
  };
  const guaranteedMagicState = runtimeCombat.syncRuntimePlayerCombatStateToInput(
    runtimeCombat.createRuntimePlayerCombatState({
      localTile: { x: 0, z: 0 },
      opponentTile: { x: 5, z: 0 },
      localLoadoutId: "kodai-robes",
      opponentLoadoutId: "acb-hides",
      seed: 2606151 + guaranteedMagicWeaponId
    }),
    {
      tiles: {
        "local-player": { x: 0, z: 0 },
        opponent: { x: 5, z: 0 }
      },
      equipment: {
        "local-player": guaranteedMagicEquipment
      }
    }
  );
  runtimePolicy.applyRuntimeOpponentPolicyAction({
    state: guaranteedMagicState,
    controller: {
      id: `test-policy-guaranteed-magic-weapon-${guaranteedMagicWeaponId}`,
      chooseAction: (context) => {
        guaranteedMagicVisibleStyle = context.opponent.lastVisibleOpponentStyle;
        guaranteedMagicLikelyStyle = context.opponent.lastOffenceStyle;
        return {
          offenceStyle: "ranged",
          defencePrayer: "protect_from_magic",
          movementIntent: "pressure",
          supplyIntent: "none",
          specIntent: "none",
          extendedSupplyAction: false
        };
      }
    },
    localActor: {
      tile: guaranteedMagicState.actors["local-player"].tile,
      loadoutId: "kodai-robes",
      equipment: guaranteedMagicEquipment
    },
    opponentActor: {
      tile: guaranteedMagicState.actors.opponent.tile,
      loadoutId: "acb-hides"
    }
  });
  assert(
    guaranteedMagicVisibleStyle === "magic" && guaranteedMagicLikelyStyle === "magic",
    `runtime policy should port Java isGuaranteedMagicWeapon id ${guaranteedMagicWeaponId}, got ${guaranteedMagicVisibleStyle}/${guaranteedMagicLikelyStyle}`
  );
}

let prayerOnlyLikelyStyle = null;
let prayerOnlyVisibleStyle = null;
const prayerOnlyState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides",
  seed: 260616
});
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: prayerOnlyState,
  controller: {
    id: "test-policy-offensive-prayer-likely-style",
    chooseAction: (context) => {
      prayerOnlyLikelyStyle = context.opponent.lastOffenceStyle;
      prayerOnlyVisibleStyle = context.opponent.lastVisibleOpponentStyle;
      return {
        offenceStyle: "ranged",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: prayerOnlyState.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    equipment: {},
    activePrayers: ["rigour"]
  },
  opponentActor: {
    tile: prayerOnlyState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  prayerOnlyLikelyStyle === "melee" && prayerOnlyVisibleStyle === null,
  `unarmed PlayerCombat attack style should beat offensive-prayer fallback and keep gearStyle empty, got ${prayerOnlyLikelyStyle}/${prayerOnlyVisibleStyle}`
);

let prayerBeforeAmmoLikelyStyle = null;
let prayerBeforeAmmoVisibleStyle = null;
const prayerBeforeAmmoState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "tentacle-bandos",
  opponentLoadoutId: "acb-hides",
  seed: 2606161
});
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: prayerBeforeAmmoState,
  controller: {
    id: "test-policy-offensive-prayer-before-ammo-fallback",
    chooseAction: (context) => {
      prayerBeforeAmmoLikelyStyle = context.opponent.lastOffenceStyle;
      prayerBeforeAmmoVisibleStyle = context.opponent.lastVisibleOpponentStyle;
      return {
        offenceStyle: "ranged",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: prayerBeforeAmmoState.actors["local-player"].tile,
    loadoutId: "tentacle-bandos",
    equipment: {
      ammo: loadouts.nhLoadouts["acb-hides"].equipment.ammo
    },
    activePrayers: ["augury"]
  },
  opponentActor: {
    tile: prayerBeforeAmmoState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  prayerBeforeAmmoLikelyStyle === "melee" && prayerBeforeAmmoVisibleStyle === "ranged",
  `Java detectLikelyOffenceStyleLive should use unarmed attack style before prayer/ammo fallback while gearStyle still records ammo, got ${prayerBeforeAmmoLikelyStyle}/${prayerBeforeAmmoVisibleStyle}`
);

const lowerTierPrayerStyleCases = [
  ["mystic_will", "magic"],
  ["mystic_lore", "magic"],
  ["mystic_might", "magic"],
  ["sharp_eye", "ranged"],
  ["hawk_eye", "ranged"],
  ["eagle_eye", "ranged"],
  ["ultimate_strength", "melee"],
  ["chivalry", "melee"],
  ["superhuman_strength", "melee"],
  ["burst_of_strength", "melee"]
];
for (const [prayer, expectedStyle] of lowerTierPrayerStyleCases) {
  let observedLikelyStyle = null;
  let observedVisibleStyle = null;
  const state = runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 5, z: 0 },
    localLoadoutId: "kodai-robes",
    opponentLoadoutId: "acb-hides",
    seed: 260617
  });
  runtimePolicy.applyRuntimeOpponentPolicyAction({
    state,
    controller: {
      id: `test-policy-lower-tier-prayer-${prayer}`,
      chooseAction: (context) => {
        observedLikelyStyle = context.opponent.lastOffenceStyle;
        observedVisibleStyle = context.opponent.lastVisibleOpponentStyle;
        return {
          offenceStyle: "ranged",
          defencePrayer: "protect_from_magic",
          movementIntent: "pressure",
          supplyIntent: "none",
          specIntent: "none",
          extendedSupplyAction: false
        };
      }
    },
    localActor: {
      tile: state.actors["local-player"].tile,
      loadoutId: "kodai-robes",
      equipment: {},
      activePrayers: [prayer]
    },
    opponentActor: {
      tile: state.actors.opponent.tile,
      loadoutId: "acb-hides"
    }
  });
  assert(
    observedLikelyStyle === "melee" && observedVisibleStyle === null,
    `runtime policy should port Java unarmed attack-style priority before lower-tier offensive prayer ${prayer}, got ${observedLikelyStyle}/${observedVisibleStyle}; prayer maps to ${expectedStyle} only after attack-style evidence fails`
  );
}

let queuedSpellLikelyStyle = null;
let queuedSpellVisibleStyle = null;
const queuedSpellBaseState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 260618
});
const queuedSpellState = runtimeCombat.requestRuntimePlayerCombatSpell(
  queuedSpellBaseState,
  "local-player",
  "opponent",
  "ice-barrage"
);
const sameAutocastQueuedSpellState = runtimeCombat.requestRuntimePlayerCombatSpell(
  runtimeCombat.setRuntimePlayerCombatAutocast(queuedSpellBaseState, "local-player", "ice-barrage"),
  "local-player",
  "opponent",
  "blood-barrage"
);
const sameAutocastQueuedSpellCleared = runtimeCombat.setRuntimePlayerCombatAutocast(
  sameAutocastQueuedSpellState,
  "local-player",
  "ice-barrage"
);
assert(
  sameAutocastQueuedSpellCleared.actors["local-player"].autocastSpellId === "ice-barrage" &&
    sameAutocastQueuedSpellCleared.actors["local-player"].queuedSpellId === null,
  `same-autocast castBarrage parity should still clear stale queuedSpell: ${JSON.stringify(sameAutocastQueuedSpellCleared.actors["local-player"])}`
);
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: queuedSpellState,
  controller: {
    id: "test-policy-queued-spell-style-priority",
    chooseAction: (context) => {
      queuedSpellLikelyStyle = context.opponent.lastOffenceStyle;
      queuedSpellVisibleStyle = context.opponent.lastVisibleOpponentStyle;
      return {
        offenceStyle: "ranged",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: queuedSpellState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: queuedSpellState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  queuedSpellLikelyStyle === "magic" && queuedSpellVisibleStyle === "ranged",
  `queued spell should follow NhStakerBot.isReliableMagicSpellState before ranged gear fallback, got ${queuedSpellLikelyStyle}/${queuedSpellVisibleStyle}`
);

let nonMagicAutocastLikelyStyle = null;
let nonMagicAutocastVisibleStyle = null;
const nonMagicAutocastState = runtimeCombat.setRuntimePlayerCombatAutocast(
  queuedSpellBaseState,
  "local-player",
  "ice-barrage"
);
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: nonMagicAutocastState,
  controller: {
    id: "test-policy-autocast-needs-magic-weapon",
    chooseAction: (context) => {
      nonMagicAutocastLikelyStyle = context.opponent.lastOffenceStyle;
      nonMagicAutocastVisibleStyle = context.opponent.lastVisibleOpponentStyle;
      return {
        offenceStyle: "ranged",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: nonMagicAutocastState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: nonMagicAutocastState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  nonMagicAutocastLikelyStyle === "ranged" && nonMagicAutocastVisibleStyle === "ranged",
  `autocast should only count as reliable magic when Java sees a magic weapon, got ${nonMagicAutocastLikelyStyle}/${nonMagicAutocastVisibleStyle}`
);

let bonusOnlyLikelyStyle = null;
let bonusOnlyVisibleStyle = null;
const bonusOnlyGearState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "tentacle-bandos",
  opponentLoadoutId: "acb-hides",
  seed: 260619
});
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: bonusOnlyGearState,
  controller: {
    id: "test-policy-gear-style-channel-excludes-attack-bonuses",
    chooseAction: (context) => {
      bonusOnlyLikelyStyle = context.opponent.lastOffenceStyle;
      bonusOnlyVisibleStyle = context.opponent.lastVisibleOpponentStyle;
      return {
        offenceStyle: "ranged",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: bonusOnlyGearState.actors["local-player"].tile,
    loadoutId: "tentacle-bandos",
    equipment: {
      body: loadouts.nhLoadouts["kodai-robes"].equipment.body
    }
  },
  opponentActor: {
    tile: bonusOnlyGearState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  bonusOnlyLikelyStyle === "melee" && bonusOnlyVisibleStyle === null,
  `unarmed PlayerCombat attack style should beat attack-bonus fallback and not rewrite Java gearStyle channel, got ${bonusOnlyLikelyStyle}/${bonusOnlyVisibleStyle}`
);

const redemptionMagicThreatBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 5, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides",
  seed: 26062
});
const redemptionMagicThreatState = setActorHitpoints(
  {
    ...redemptionMagicThreatBase,
    actors: {
      ...redemptionMagicThreatBase.actors,
      "local-player": {
        ...redemptionMagicThreatBase.actors["local-player"],
        targetId: "opponent"
      }
    }
  },
  "opponent",
  42
);
const redemptionMagicThreat = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: redemptionMagicThreatState,
  controller: {
    id: "test-policy-redemption-java-threat-max",
    chooseAction: () => ({
      offenceStyle: "ranged",
      defencePrayer: "redemption",
      movementIntent: "pressure",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false
    })
  },
  localActor: {
    tile: redemptionMagicThreatState.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: redemptionMagicThreatState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  redemptionMagicThreat.effectiveAction.defencePrayer === "redemption",
  `redemption should use Java CLIENT_THREAT_MAGIC_MAX=33, so 42 hp can proc; got ${redemptionMagicThreat.effectiveAction.defencePrayer}`
);

const redemptionPostSupply = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: redemptionMagicThreatState,
  controller: {
    id: "test-policy-redemption-post-supply-resolve",
    chooseAction: () => ({
      offenceStyle: "ranged",
      defencePrayer: "redemption",
      movementIntent: "pressure",
      supplyIntent: "safe_eat",
      specIntent: "none",
      extendedSupplyAction: false
    })
  },
  localActor: {
    tile: redemptionMagicThreatState.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: redemptionMagicThreatState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  redemptionPostSupply.consumedSupplies.includes("manta_ray") &&
    redemptionPostSupply.effectiveAction.defencePrayer === "protect_from_magic" &&
    !redemptionPostSupply.state.actors.opponent.activePrayers.includes("redemption"),
  `Java resolves Redemption after eating; expected protect_from_magic after safe_eat, got ${redemptionPostSupply.effectiveAction.defencePrayer}/${redemptionPostSupply.consumedSupplies.join(",")}`
);

const redemptionLowHpFoodBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 5, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides",
  seed: 260621
});
const redemptionLowHpFoodState = setActorHitpoints(
  {
    ...redemptionLowHpFoodBase,
    actors: {
      ...redemptionLowHpFoodBase.actors,
      "local-player": {
        ...redemptionLowHpFoodBase.actors["local-player"],
        targetId: "opponent"
      }
    }
  },
  "opponent",
  5
);
const redemptionAfterLowHpFood = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: redemptionLowHpFoodState,
  controller: {
    id: "test-policy-redemption-post-food-resolve",
    chooseAction: () => ({
      offenceStyle: "ranged",
      defencePrayer: "redemption",
      movementIntent: "pressure",
      supplyIntent: "safe_eat",
      specIntent: "none",
      extendedSupplyAction: false
    })
  },
  localActor: {
    tile: redemptionLowHpFoodState.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: redemptionLowHpFoodState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  redemptionAfterLowHpFood.consumedSupplies.includes("manta_ray") &&
    redemptionAfterLowHpFood.effectiveAction.defencePrayer === "redemption" &&
    redemptionAfterLowHpFood.state.actors.opponent.activePrayers.includes("redemption"),
  `Java does not pre-guard Redemption; safe_eat can move low HP into the valid resolveDefencePrayer window, got ${redemptionAfterLowHpFood.effectiveAction.defencePrayer}/${redemptionAfterLowHpFood.consumedSupplies.join(",")}`
);

const stripGuardController = {
  id: "test-policy-offence-strip-context-guard",
  chooseAction: () => ({
    offenceStyle: "melee",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "offence_strip_two",
    specIntent: "none",
    extendedSupplyAction: true
  })
};
const stripGuardBaseState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "tentacle-bandos",
  seed: 2607
});
const stripGuardState = {
  ...stripGuardBaseState,
  actors: {
    ...stripGuardBaseState.actors,
    opponent: {
      ...stripGuardBaseState.actors.opponent,
      hitpoints: 50
    }
  }
};
const stripGuardApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: stripGuardState,
  controller: stripGuardController,
  localActor: {
    tile: stripGuardState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: stripGuardState.actors.opponent.tile,
    loadoutId: "tentacle-bandos"
  }
});
assert(
  stripGuardApplied.effectiveAction.supplyIntent === "none" && stripGuardApplied.strippedEquipmentSlots.length === 0,
  `low-hp offence strip should be guarded to NONE, got ${stripGuardApplied.effectiveAction.supplyIntent}/${stripGuardApplied.strippedEquipmentSlots.join(",")}`
);
const stripAggressedBaseState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes",
  seed: 26071
});
const stripAggressedState = {
  ...stripAggressedBaseState,
  actors: {
    ...stripAggressedBaseState.actors,
    "local-player": {
      ...stripAggressedBaseState.actors["local-player"],
      targetId: "opponent",
      lastTargetId: "opponent",
      lastTargetTimeoutTicks: 5
    },
    opponent: {
      ...stripAggressedBaseState.actors.opponent,
      hitpoints: 99
    }
  }
};
const stripAggressedApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: stripAggressedState,
  controller: stripGuardController,
  localActor: {
    tile: stripAggressedState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: stripAggressedState.actors.opponent.tile,
    loadoutId: "kodai-robes"
  }
});
assert(
  stripAggressedApplied.effectiveAction.supplyIntent === "none" &&
    stripAggressedApplied.strippedEquipmentSlots.length === 0,
  `offence strip should be guarded while the opponent is aggressing like NhStakerBot.allowOffenceStripByContext, got ${stripAggressedApplied.effectiveAction.supplyIntent}/${stripAggressedApplied.strippedEquipmentSlots.join(",")}`
);

const stripRecentlyDefendedState = {
  ...stripAggressedBaseState,
  tick: 12,
  actors: {
    ...stripAggressedBaseState.actors,
    opponent: {
      ...stripAggressedBaseState.actors.opponent,
      hitpoints: 99
    }
  },
  events: [
    {
      kind: "hitsplat",
      tick: 11,
      attackerId: "local-player",
      targetActorId: "opponent",
      damage: 1
    }
  ]
};
const stripRecentlyDefendedApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: stripRecentlyDefendedState,
  controller: stripGuardController,
  localActor: {
    tile: stripRecentlyDefendedState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: stripRecentlyDefendedState.actors.opponent.tile,
    loadoutId: "kodai-robes"
  }
});
assert(
  stripRecentlyDefendedApplied.effectiveAction.supplyIntent === "none" &&
    stripRecentlyDefendedApplied.strippedEquipmentSlots.length === 0,
  `offence strip should be guarded for recent defending ticks like player.getCombat().isDefending(3), got ${stripRecentlyDefendedApplied.effectiveAction.supplyIntent}/${stripRecentlyDefendedApplied.strippedEquipmentSlots.join(",")}`
);
const stripLockController = {
  id: "test-policy-offence-strip-lock-gate",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "offence_strip_two",
    specIntent: "none",
    extendedSupplyAction: true
  })
};
const stripLockBaseState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "tentacle-bandos",
  opponentLoadoutId: "kodai-robes",
  seed: 26075
});
const stripLockReadyState = {
  ...stripLockBaseState,
  actors: {
    ...stripLockBaseState.actors,
    opponent: {
      ...stripLockBaseState.actors.opponent,
      hitpoints: 99,
      policyOffenceStyle: "ranged"
    }
  }
};
const stripLockUnlocked = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: stripLockReadyState,
  controller: stripLockController,
  localActor: {
    tile: stripLockReadyState.actors["local-player"].tile,
    loadoutId: "tentacle-bandos"
  },
  opponentActor: {
    tile: stripLockReadyState.actors.opponent.tile,
    loadoutId: "kodai-robes"
  }
});
const stripLockLockedState = {
  ...stripLockReadyState,
  actors: {
    ...stripLockReadyState.actors,
    opponent: {
      ...stripLockReadyState.actors.opponent,
      locks: entityLocks.setLock(stripLockReadyState.actors.opponent.locks, "full")
    }
  }
};
const stripLockLocked = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: stripLockLockedState,
  controller: stripLockController,
  localActor: {
    tile: stripLockLockedState.actors["local-player"].tile,
    loadoutId: "tentacle-bandos"
  },
  opponentActor: {
    tile: stripLockLockedState.actors.opponent.tile,
    loadoutId: "kodai-robes",
    locks: stripLockLockedState.actors.opponent.locks
  }
});
assert(
  stripLockUnlocked.strippedEquipmentSlots.length > 0 && stripLockLocked.strippedEquipmentSlots.length === 0,
  `OFFENCE_STRIP should run only through the unlocked Java supply gate, got unlocked=${stripLockUnlocked.strippedEquipmentSlots.join(",")} locked=${stripLockLocked.strippedEquipmentSlots.join(",")}`
);
const stripNullCurrentBaseState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "tentacle-bandos",
  opponentLoadoutId: "acb-hides",
  seed: 260751
});
const stripNullCurrentState = {
  ...stripNullCurrentBaseState,
  actors: {
    ...stripNullCurrentBaseState.actors,
    opponent: {
      ...stripNullCurrentBaseState.actors.opponent,
      hitpoints: 99,
      policyOffenceStyle: undefined
    }
  }
};
const stripNullCurrentApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: stripNullCurrentState,
  controller: stripLockController,
  localActor: {
    tile: stripNullCurrentState.actors["local-player"].tile,
    loadoutId: "tentacle-bandos"
  },
  opponentActor: {
    tile: stripNullCurrentState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  stripNullCurrentApplied.effectiveAction.supplyIntent === "offence_strip_two" &&
    stripNullCurrentApplied.strippedEquipmentSlots.length === 0,
  `Java stripForOffence(currentOffence=null) should leave OFFENCE_STRIP as a no-op, got intent=${stripNullCurrentApplied.effectiveAction.supplyIntent} slots=${stripNullCurrentApplied.strippedEquipmentSlots.join(",")}`
);
const stripPreserveMixedEquipment = {
  ...loadouts.nhLoadouts["acb-hides"].equipment,
  weapon: loadouts.nhLoadouts["kodai-robes"].equipment.weapon,
  shield: loadouts.nhLoadouts["kodai-robes"].equipment.shield
};
const stripPreserveProfile = gearProfile.inferNhSelectedGearProfile({
  equipment: stripPreserveMixedEquipment
});
const stripPreserveBaseState = runtimeCombat.syncRuntimePlayerCombatStateToInput(
  patchOpponentActor(runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 5, z: 0 },
    localLoadoutId: "tentacle-bandos",
    opponentLoadoutId: "kodai-robes",
    seed: 26076
  }), { policyOffenceStyle: "magic" }),
  {
    tiles: {
      "local-player": { x: 0, z: 0 },
      opponent: { x: 5, z: 0 }
    },
    equipment: {
      opponent: stripPreserveMixedEquipment
    },
    gearProfiles: {
      opponent: stripPreserveProfile
    }
  }
);
const stripPreserveApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: stripPreserveBaseState,
  controller: {
    id: "test-policy-offence-strip-suppresses-same-style-reequip",
    chooseAction: () => ({
      offenceStyle: "magic",
      defencePrayer: "protect_from_magic",
      movementIntent: "pressure",
      supplyIntent: "offence_strip_two",
      specIntent: "none",
      extendedSupplyAction: true
    })
  },
  localActor: {
    tile: stripPreserveBaseState.actors["local-player"].tile,
    loadoutId: "tentacle-bandos"
  },
  opponentActor: {
    tile: stripPreserveBaseState.actors.opponent.tile,
    loadoutId: "kodai-robes",
    equipment: stripPreserveMixedEquipment,
    gearProfile: stripPreserveProfile
  }
});
assert(
  stripPreserveApplied.strippedEquipmentSlots.length > 0 &&
    stripPreserveApplied.strippedEquipmentSlots.every((slot) => stripPreserveApplied.state.actors.opponent.equipment[slot] === undefined) &&
    stripPreserveApplied.opponentLoadoutId === stripPreserveBaseState.actors.opponent.loadoutId,
  `same-style OFFENCE_STRIP should suppress Java re-equip for the tick and preserve stripped slots, got ${JSON.stringify({
    slots: stripPreserveApplied.strippedEquipmentSlots,
    equipment: stripPreserveApplied.state.actors.opponent.equipment,
    loadout: stripPreserveApplied.opponentLoadoutId
  })}`
);
const stripMagicMissingCoreEquipment = {
  ...loadouts.nhLoadouts["kodai-robes"].equipment,
  shield: loadouts.nhLoadouts["tentacle-bandos"].equipment.shield
};
delete stripMagicMissingCoreEquipment.body;
delete stripMagicMissingCoreEquipment.legs;
const stripMagicCoreProfile = gearProfile.inferNhSelectedGearProfile({
  equipment: stripMagicMissingCoreEquipment
});
const stripMagicCoreBaseState = patchOpponentActor(
  runtimeCombat.syncRuntimePlayerCombatStateToInput(
    runtimeCombat.createRuntimePlayerCombatState({
      localTile: { x: 0, z: 0 },
      opponentTile: { x: 5, z: 0 },
      localLoadoutId: "tentacle-bandos",
      opponentLoadoutId: "kodai-robes",
      seed: 26077
    }),
    {
      tiles: {
        "local-player": { x: 0, z: 0 },
        opponent: { x: 5, z: 0 }
      },
      equipment: {
        opponent: stripMagicMissingCoreEquipment
      },
      gearProfiles: {
        opponent: stripMagicCoreProfile
      }
    }
  ),
  {
    policyOffenceStyle: "magic"
  }
);
const stripMagicCoreApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: stripMagicCoreBaseState,
  controller: {
    id: "test-policy-magic-core-after-strip-suppression",
    chooseAction: () => ({
      offenceStyle: "magic",
      defencePrayer: "protect_from_magic",
      movementIntent: "pressure",
      supplyIntent: "offence_strip_one",
      specIntent: "none",
      extendedSupplyAction: true
    })
  },
  localActor: {
    tile: stripMagicCoreBaseState.actors["local-player"].tile,
    loadoutId: "tentacle-bandos"
  },
  opponentActor: {
    tile: stripMagicCoreBaseState.actors.opponent.tile,
    loadoutId: "kodai-robes",
    equipment: stripMagicMissingCoreEquipment,
    gearProfile: stripMagicCoreProfile
  }
});
assert(
  stripMagicCoreApplied.strippedEquipmentSlots.length > 0 &&
    stripMagicCoreApplied.strippedEquipmentSlots.every((slot) => stripMagicCoreApplied.state.actors.opponent.equipment[slot] === undefined) &&
    stripMagicCoreApplied.state.actors.opponent.equipment.body?.itemId === stripMagicCoreProfile.magicChestItem.itemId &&
    stripMagicCoreApplied.state.actors.opponent.equipment.legs?.itemId === stripMagicCoreProfile.magicLegsItem.itemId,
  `magic OFFENCE_STRIP suppression should still run Java enforceMagicCoreArmor(), got ${JSON.stringify({
    stripped: stripMagicCoreApplied.strippedEquipmentSlots,
    equipment: stripMagicCoreApplied.state.actors.opponent.equipment,
    magicCore: {
      body: stripMagicCoreProfile.magicChestItem,
      legs: stripMagicCoreProfile.magicLegsItem
    }
  })}`
);

const evGuardController = {
  id: "test-policy-style-ev-context-guard",
  chooseAction: () => ({
    offenceStyle: "magic",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const evGuardState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 2608
});
const evGuardApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: evGuardState,
  controller: evGuardController,
  localActor: {
    tile: evGuardState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    activePrayers: ["protect_from_magic"]
  },
  opponentActor: {
    tile: evGuardState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  evGuardApplied.effectiveAction.offenceStyle === "ranged",
  `style EV guard should override protected magic to ranged at crossbow distance, got ${evGuardApplied.effectiveAction.offenceStyle}`
);

const freezeRetryObserved = [];
const freezeRetryController = {
  id: "test-policy-freeze-retry-cooldown",
  chooseAction: (context) => {
    freezeRetryObserved.push({
      tick: context.tick,
      wantsFreeze: context.scriptedWantsFreeze,
      scriptedOffenceStyle: context.scriptedOffenceStyle
    });
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
const freezeRetryBaseState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes",
  seed: 26108
});
const freezeRetryFirst = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: freezeRetryBaseState,
  controller: freezeRetryController,
  localActor: {
    tile: freezeRetryBaseState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    activePrayers: ["protect_from_missiles"]
  },
  opponentActor: {
    tile: freezeRetryBaseState.actors.opponent.tile,
    loadoutId: "kodai-robes"
  }
});
assert(freezeRetryObserved.at(-1)?.wantsFreeze === true, "first unfrozen non-magic-prayer decision should want a freeze");
assert(
  freezeRetryFirst.state.actors.opponent.policyNextFreezeAttemptTick === 6,
  `first freeze attempt should set source FREEZE_RETRY_TICKS cooldown to 6, got ${freezeRetryFirst.state.actors.opponent.policyNextFreezeAttemptTick}`
);
const freezeRetrySecond = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: { ...freezeRetryFirst.state, tick: 1 },
  controller: freezeRetryController,
  localActor: {
    tile: freezeRetryFirst.state.actors["local-player"].tile,
    loadoutId: "acb-hides",
    activePrayers: ["protect_from_missiles"]
  },
  opponentActor: {
    tile: freezeRetryFirst.state.actors.opponent.tile,
    loadoutId: "kodai-robes"
  }
});
assert(freezeRetryObserved.at(-1)?.wantsFreeze === false, "freeze desire should stay false before nextFreezeAttemptTick");
assert(
  freezeRetrySecond.state.actors.opponent.policyNextFreezeAttemptTick === 6,
  "freeze cooldown should not advance while the retry gate is still closed"
);
const freezeRetryEvGuard = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: { ...freezeRetryFirst.state, tick: 2 },
  controller: freezeRetryController,
  localActor: {
    tile: freezeRetryFirst.state.actors["local-player"].tile,
    loadoutId: "acb-hides",
    activePrayers: []
  },
  opponentActor: {
    tile: freezeRetryFirst.state.actors.opponent.tile,
    loadoutId: "kodai-robes"
  }
});
assert(freezeRetryObserved.at(-1)?.wantsFreeze === false, "EV guard check should still be inside freeze cooldown");
assert(
  freezeRetryEvGuard.state.actors.opponent.policyNextFreezeAttemptTick === 6,
  "style EV guard check must not consume the scripted fallback freeze retry window"
);
const freezeRetryThird = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: { ...freezeRetrySecond.state, tick: 6 },
  controller: freezeRetryController,
  localActor: {
    tile: freezeRetrySecond.state.actors["local-player"].tile,
    loadoutId: "acb-hides",
    activePrayers: ["protect_from_missiles"]
  },
  opponentActor: {
    tile: freezeRetrySecond.state.actors.opponent.tile,
    loadoutId: "kodai-robes"
  }
});
assert(freezeRetryObserved.at(-1)?.wantsFreeze === true, "freeze desire should reopen at nextFreezeAttemptTick");
assert(
  freezeRetryThird.state.actors.opponent.policyNextFreezeAttemptTick === 12,
  `second freeze attempt should advance cooldown to 12, got ${freezeRetryThird.state.actors.opponent.policyNextFreezeAttemptTick}`
);
const freezeRetryProtected = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: { ...freezeRetryThird.state, tick: 12 },
  controller: freezeRetryController,
  localActor: {
    tile: freezeRetryThird.state.actors["local-player"].tile,
    loadoutId: "acb-hides",
    activePrayers: ["protect_from_magic"]
  },
  opponentActor: {
    tile: freezeRetryThird.state.actors.opponent.tile,
    loadoutId: "kodai-robes"
  }
});
assert(freezeRetryObserved.at(-1)?.wantsFreeze === false, "magic protection should block scripted freeze desire");
assert(
  freezeRetryProtected.state.actors.opponent.policyNextFreezeAttemptTick === 12,
  "magic-protected target should not consume the next freeze retry window"
);

let observedPolicyAteFood = false;
let observedPolicyDrankPotion = false;
let observedPolicyLastDealt = 0;
let observedPolicyLastTaken = 0;
let observedPolicyRewardDelta = 0;
let observedPolicyRewardTotal = 0;
let observedPolicyRewardDps = 0;
const observationStateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 5, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 2609
});
const observationState = {
  ...observationStateBase,
  tick: 12,
  events: [
    {
      kind: "hitsplat",
      tick: 11,
      attackerId: "opponent",
      targetActorId: "local-player",
      damage: 24
    },
    {
      kind: "hitsplat",
      tick: 11,
      attackerId: "local-player",
      targetActorId: "opponent",
      damage: 7
    },
    {
      kind: "supply",
      tick: 11,
      actorId: "opponent",
      item: "shark",
      healed: 20
    },
    {
      kind: "supply",
      tick: 11,
      actorId: "opponent",
      item: "super_restore",
      healed: 0
    }
  ]
};
const observationController = {
  id: "test-policy-runtime-observation-fields",
  chooseAction: (context) => {
    observedPolicyAteFood = context.self.ateFoodLastTick;
    observedPolicyDrankPotion = context.self.drankPotionLastTick;
    observedPolicyLastDealt = context.self.lastDealtHit;
    observedPolicyLastTaken = context.self.lastTakenHit;
    observedPolicyRewardDelta = context.self.rewardDelta;
    observedPolicyRewardTotal = context.self.rewardTotal;
    observedPolicyRewardDps = context.self.rewardDps;
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
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: observationState,
  controller: observationController,
  localActor: {
    tile: observationState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: observationState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(observedPolicyAteFood, "runtime policy context should expose previous-tick food consumption");
assert(observedPolicyDrankPotion, "runtime policy context should expose previous-tick potion consumption");
assert(
  observedPolicyLastDealt === 24 && observedPolicyLastTaken === 7,
  `runtime policy context should expose recent dealt/taken hits, got ${observedPolicyLastDealt}/${observedPolicyLastTaken}`
);
assert(
  Math.abs(observedPolicyRewardDelta - 19.6125) < 0.001 &&
    Math.abs(observedPolicyRewardTotal - 19.6125) < 0.001 &&
    Math.abs(observedPolicyRewardDps - 3) < 0.001,
  `runtime policy context should expose reward observation fields, got ${observedPolicyRewardDelta}/${observedPolicyRewardTotal}/${observedPolicyRewardDps}`
);

let observedRollingRewardDelta = null;
let observedRollingRewardTotal = null;
let observedRollingRewardDps = null;
const rollingRewardState = {
  ...observationStateBase,
  tick: 14,
  events: [
    {
      kind: "hitsplat",
      tick: 11,
      attackerId: "opponent",
      targetActorId: "local-player",
      damage: 24
    }
  ]
};
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: rollingRewardState,
  controller: {
    id: "test-policy-runtime-rolling-reward",
    chooseAction: (context) => {
      observedRollingRewardDelta = context.self.rewardDelta;
      observedRollingRewardTotal = context.self.rewardTotal;
      observedRollingRewardDps = context.self.rewardDps;
      return {
        offenceStyle: "ranged",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: rollingRewardState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: rollingRewardState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeStartTick: 11
});
assert(
  Math.abs(observedRollingRewardDps - 3) < 0.001 &&
    Math.abs(observedRollingRewardDelta - 0.6) < 0.001 &&
    Math.abs(observedRollingRewardTotal - 25.8) < 0.001,
  `runtime policy reward should keep Java rolling DPS across zero-damage ticks, got ${observedRollingRewardDelta}/${observedRollingRewardTotal}/${observedRollingRewardDps}`
);

const specRewardController = {
  id: "test-policy-gmaul-spec-reward",
  chooseAction: () => ({
    offenceStyle: "melee",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "use_special",
    extendedSupplyAction: false
  })
};
const goodSpecRewardState = setActorHitpoints(
  withRecentOpponentHit(
    runtimeCombat.createRuntimePlayerCombatState({
      localTile: { x: 1, z: 0 },
      opponentTile: { x: 0, z: 0 },
      localLoadoutId: "kodai-robes",
      opponentLoadoutId: "gmaul-bandos",
      opponentSpecialEnergy: 100,
      seed: 2606
    }),
    32
  ),
  "local-player",
  30
);
const goodSpecRewardApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: goodSpecRewardState,
  controller: specRewardController,
  localActor: {
    tile: goodSpecRewardState.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: goodSpecRewardState.actors.opponent.tile,
    loadoutId: "gmaul-bandos"
  },
  rewardEpisodeId: 1,
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 11
});
const goodSpecRewardEvent = goodSpecRewardApplied.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "gmaul_spec"
);
assert(
  goodSpecRewardEvent && goodSpecRewardEvent.reward > 0,
  `credible Gmaul spec should add Java-style positive policy reward, got ${JSON.stringify(goodSpecRewardEvent)}`
);
function applyGmaulSpecRewardAtOpponentHp(hitpoints) {
  const state = setActorHitpoints(
    withRecentOpponentHit(
      runtimeCombat.createRuntimePlayerCombatState({
        localTile: { x: 1, z: 0 },
        opponentTile: { x: 0, z: 0 },
        localLoadoutId: "kodai-robes",
        opponentLoadoutId: "gmaul-bandos",
        opponentSpecialEnergy: 100,
        seed: 26061
      }),
      32
    ),
    "local-player",
    hitpoints
  );
  return runtimePolicy.applyRuntimeOpponentPolicyAction({
    state,
    controller: specRewardController,
    localActor: {
      tile: state.actors["local-player"].tile,
      loadoutId: "kodai-robes"
    },
    opponentActor: {
      tile: state.actors.opponent.tile,
      loadoutId: "gmaul-bandos"
    },
    rewardEpisodeId: 1,
    rewardEpisodeActive: true,
    rewardEpisodeStartTick: 11
  }).state.events.find(
    (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "gmaul_spec"
  );
}
const specRewardHp55 = applyGmaulSpecRewardAtOpponentHp(55);
const specRewardHp57 = applyGmaulSpecRewardAtOpponentHp(57);
assert(
  specRewardHp55 &&
    specRewardHp57 &&
    specRewardHp55.opponentStartHitpoints === 55 &&
    specRewardHp57.opponentStartHitpoints === 55 &&
    Math.abs(specRewardHp55.reward - specRewardHp57.reward) < 1e-12 &&
    Math.abs(specRewardHp55.koChance - specRewardHp57.koChance) < 1e-12 &&
    Math.abs(specRewardHp55.setupScore - specRewardHp57.setupScore) < 1e-12,
  `Gmaul reward/window helpers should use Java visibleHpOrDefault 5-HP buckets, got ${JSON.stringify({
    hp55: specRewardHp55,
    hp57: specRewardHp57
  })}`
);
const pendingOutcomeNoopController = {
  id: "test-policy-gmaul-pending-outcome-noop",
  chooseAction: () => ({
    offenceStyle: "melee",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const goodSpecDamageOutcomeApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: setActorHitpoints(
    {
      ...goodSpecRewardApplied.state,
      tick: 13,
      events: [
        ...goodSpecRewardApplied.state.events,
        {
          kind: "hitsplat",
          id: "test-gmaul-outcome-hit",
          tick: 12,
          attackerId: "opponent",
          targetActorId: "local-player",
          style: "crush",
          damage: 20
        }
      ]
    },
    "local-player",
    10
  ),
  controller: pendingOutcomeNoopController,
  localActor: {
    tile: goodSpecRewardApplied.state.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: goodSpecRewardApplied.state.actors.opponent.tile,
    loadoutId: "gmaul-bandos"
  },
  rewardEpisodeId: 1,
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 11
});
const goodSpecOutcomeEvent = goodSpecDamageOutcomeApplied.state.events.find(
  (event) =>
    event.kind === "policy-reward" &&
    event.actorId === "opponent" &&
    event.reason === "gmaul_spec_outcome" &&
    event.sourcePolicyRewardId === goodSpecRewardEvent.id
);
assert(
  goodSpecOutcomeEvent &&
    goodSpecOutcomeEvent.reward > 0 &&
    goodSpecOutcomeEvent.tick === 12 &&
    goodSpecDamageOutcomeApplied.context.self.rewardDelta > 20 + goodSpecRewardEvent.reward,
  `next policy tick should apply and observe Java pending Gmaul damage/pressure outcome, got ${JSON.stringify({
    event: goodSpecOutcomeEvent,
    rewardDelta: goodSpecDamageOutcomeApplied.context.self.rewardDelta
  })}`
);
const repeatedGoodSpecOutcomeApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...goodSpecDamageOutcomeApplied.state,
    tick: 14
  },
  controller: pendingOutcomeNoopController,
  localActor: {
    tile: goodSpecDamageOutcomeApplied.state.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: goodSpecDamageOutcomeApplied.state.actors.opponent.tile,
    loadoutId: "gmaul-bandos"
  },
  rewardEpisodeId: 1,
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 11
});
assert(
  repeatedGoodSpecOutcomeApplied.state.events.filter(
    (event) =>
      event.kind === "policy-reward" &&
      event.actorId === "opponent" &&
      event.reason === "gmaul_spec_outcome" &&
      event.sourcePolicyRewardId === goodSpecRewardEvent.id
  ).length === 1,
  "Java pending Gmaul spec outcome should clear after the first outcome reward"
);
const badSpecRewardState = setActorHitpoints(
  runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 1, z: 0 },
    opponentTile: { x: 0, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "gmaul-bandos",
    localPrayers: ["protect_from_melee"],
    opponentSpecialEnergy: 100,
    seed: 2607
  }),
  "local-player",
  99
);
const badSpecRewardApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: badSpecRewardState,
  controller: specRewardController,
  localActor: {
    tile: badSpecRewardState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: badSpecRewardState.actors.opponent.tile,
    loadoutId: "gmaul-bandos"
  },
  rewardEpisodeId: 2,
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 0
});
const badSpecRewardEvent = badSpecRewardApplied.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "gmaul_spec"
);
assert(
  badSpecRewardEvent && badSpecRewardEvent.reward < 0,
  `dry protected high-HP Gmaul spec should add Java-style negative policy reward, got ${JSON.stringify(badSpecRewardEvent)}`
);
const badSpecWhiffOutcomeApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...badSpecRewardApplied.state,
    tick: badSpecRewardApplied.state.tick + 4
  },
  controller: pendingOutcomeNoopController,
  localActor: {
    tile: badSpecRewardApplied.state.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: badSpecRewardApplied.state.actors.opponent.tile,
    loadoutId: "gmaul-bandos"
  },
  rewardEpisodeId: 2,
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 0
});
const badSpecWhiffOutcomeEvent = badSpecWhiffOutcomeApplied.state.events.find(
  (event) =>
    event.kind === "policy-reward" &&
    event.actorId === "opponent" &&
    event.reason === "gmaul_spec_outcome" &&
    event.sourcePolicyRewardId === badSpecRewardEvent.id
);
assert(
  badSpecWhiffOutcomeEvent &&
    badSpecWhiffOutcomeEvent.reward < 0 &&
    badSpecWhiffOutcomeEvent.tick === badSpecRewardApplied.state.tick + 3 &&
    badSpecWhiffOutcomeApplied.context.self.rewardDelta < 0,
  `age-4 dry Gmaul should receive Java whiff outcome penalty, got ${JSON.stringify({
    event: badSpecWhiffOutcomeEvent,
    rewardDelta: badSpecWhiffOutcomeApplied.context.self.rewardDelta
  })}`
);
const repeatedSpecRewardApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...badSpecRewardApplied.state,
    tick: badSpecRewardApplied.state.tick + 1
  },
  controller: specRewardController,
  localActor: {
    tile: badSpecRewardApplied.state.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: badSpecRewardApplied.state.actors.opponent.tile,
    loadoutId: "gmaul-bandos"
  },
  rewardEpisodeId: 2,
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 0
});
assert(
  repeatedSpecRewardApplied.effectiveAction.specIntent === "none",
  `policy Gmaul spec reward event should enforce Java SPEC_QUEUE_COOLDOWN_TICKS, got ${repeatedSpecRewardApplied.effectiveAction.specIntent}`
);
assert(
  !repeatedSpecRewardApplied.state.events.some((event) => event.kind === "policy-reward" && event.reason === "gmaul_missed_spec"),
  "a rejected non-NONE spec intent should not also receive Java missed-spec penalty"
);
const noSpecController = {
  id: "test-policy-gmaul-missed-spec-reward",
  chooseAction: () => ({
    offenceStyle: "melee",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const missedSpecRewardState = setActorHitpoints(
  withRecentOpponentHit(
    runtimeCombat.createRuntimePlayerCombatState({
      localTile: { x: 1, z: 0 },
      opponentTile: { x: 0, z: 0 },
      localLoadoutId: "kodai-robes",
      opponentLoadoutId: "gmaul-bandos",
      opponentSpecialEnergy: 100,
      seed: 2608
    }),
    32
  ),
  "local-player",
  30
);
const missedSpecRewardApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: missedSpecRewardState,
  controller: noSpecController,
  localActor: {
    tile: missedSpecRewardState.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: missedSpecRewardState.actors.opponent.tile,
    loadoutId: "gmaul-bandos"
  },
  rewardEpisodeId: 3,
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 11
});
const missedSpecRewardEvent = missedSpecRewardApplied.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "gmaul_missed_spec"
);
assert(
  missedSpecRewardEvent && missedSpecRewardEvent.reward < 0,
  `NONE spec intent should receive Java missed-spec penalty for a credible Gmaul window, got ${JSON.stringify(missedSpecRewardEvent)}`
);
const missedSpecRewardContext = capturePolicyContext(
  {
    ...missedSpecRewardApplied.state,
    tick: 13
  },
  { rewardEpisodeId: 3, rewardEpisodeActive: true, rewardEpisodeStartTick: 11 }
);
assert(
  missedSpecRewardContext.self.rewardDelta < 0 &&
    missedSpecRewardContext.self.rewardTotal < 32.8,
  `next policy tick should observe missed-spec penalty alongside Java per-tick shaping, got delta=${missedSpecRewardContext.self.rewardDelta} total=${missedSpecRewardContext.self.rewardTotal}`
);
const repeatedMissedSpecRewardApplied = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...missedSpecRewardApplied.state,
    tick: missedSpecRewardApplied.state.tick + 1
  },
  controller: noSpecController,
  localActor: {
    tile: missedSpecRewardApplied.state.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: missedSpecRewardApplied.state.actors.opponent.tile,
    loadoutId: "gmaul-bandos"
  },
  rewardEpisodeId: 3,
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 11
});
const repeatedMissedSpecRewards = repeatedMissedSpecRewardApplied.state.events.filter(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "gmaul_missed_spec"
);
assert(
  repeatedMissedSpecRewards.length === 1,
  `Java missed-spec penalty should not repeat within four ticks, got ${repeatedMissedSpecRewards.length}`
);

let observedEstimatedOpponentSpec = -1;
let observedExactSelfSpec = -1;
const opponentSpecEstimateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos",
  opponentLoadoutId: "gmaul-bandos",
  seed: 2610,
  specialEnergy: 100
});
const opponentSpecEstimateState = {
  ...opponentSpecEstimateBase,
  tick: 12,
  actors: {
    ...opponentSpecEstimateBase.actors,
    opponent: {
      ...opponentSpecEstimateBase.actors.opponent,
      gmaul: {
        ...opponentSpecEstimateBase.actors.opponent.gmaul,
        specialEnergy: 80
      }
    }
  },
  events: [
    {
      kind: "attack",
      tick: 11,
      attackerId: "local-player",
      defenderId: "opponent",
      specialAttack: "granite_maul",
      specialAttackCount: 2
    }
  ]
};
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: opponentSpecEstimateState,
  controller: {
    id: "test-policy-opponent-special-energy-estimate",
    chooseAction: (context) => {
      observedEstimatedOpponentSpec = context.opponent.gmaul.specialEnergy;
      observedExactSelfSpec = context.self.gmaul.specialEnergy;
      return {
        offenceStyle: "melee",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: opponentSpecEstimateState.actors["local-player"].tile,
    loadoutId: "gmaul-bandos"
  },
  opponentActor: {
    tile: opponentSpecEstimateState.actors.opponent.tile,
    loadoutId: "gmaul-bandos"
  }
});
assert(
  observedEstimatedOpponentSpec === 0,
  `policy should estimate opponent special energy from observed double gmaul, got ${observedEstimatedOpponentSpec}`
);
assert(
  observedExactSelfSpec === 80,
  `policy self special energy should remain exact for the bot actor, got ${observedExactSelfSpec}`
);

let observedUnknownSnapshotSpecEstimate = -1;
const unknownSnapshotSpecState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos",
  opponentLoadoutId: "gmaul-bandos",
  localSpecialEnergy: 20,
  opponentSpecialEnergy: 100,
  seed: 2611
});
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: unknownSnapshotSpecState,
  controller: {
    id: "test-policy-unknown-snapshot-special-estimate",
    chooseAction: (context) => {
      observedUnknownSnapshotSpecEstimate = context.opponent.gmaul.specialEnergy;
      return {
        offenceStyle: "ranged",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: unknownSnapshotSpecState.actors["local-player"].tile,
    loadoutId: "gmaul-bandos",
    observedInfoKnown: false
  },
  opponentActor: {
    tile: unknownSnapshotSpecState.actors.opponent.tile,
    loadoutId: "gmaul-bandos"
  }
});
assert(
  observedUnknownSnapshotSpecEstimate === 100,
  `unknown delayed opponent snapshot should expose Java client-side spec estimate, not exact live ${unknownSnapshotSpecState.actors["local-player"].gmaul.specialEnergy}: got ${observedUnknownSnapshotSpecEstimate}`
);

let observedRegeneratedOpponentSpec = -1;
const opponentSpecRegenState = {
  ...opponentSpecEstimateBase,
  tick: 61,
  events: [
    {
      kind: "attack",
      tick: 10,
      attackerId: "local-player",
      defenderId: "opponent",
      specialAttack: "granite_maul",
      specialAttackCount: 1
    }
  ]
};
runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: opponentSpecRegenState,
  controller: {
    id: "test-policy-opponent-special-energy-regen-estimate",
    chooseAction: (context) => {
      observedRegeneratedOpponentSpec = context.opponent.gmaul.specialEnergy;
      return {
        offenceStyle: "ranged",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: opponentSpecRegenState.actors["local-player"].tile,
    loadoutId: "gmaul-bandos"
  },
  opponentActor: {
    tile: opponentSpecRegenState.actors.opponent.tile,
    loadoutId: "gmaul-bandos"
  }
});
assert(
  observedRegeneratedOpponentSpec === 60,
  `policy should regen observed opponent special estimate by 10 after 50 ticks, got ${observedRegeneratedOpponentSpec}`
);

const gmaulFeatureStart = bridge.nhPolicyInputSize - 4;
function capturePolicyContext(state, episode = {}) {
  let capturedContext = null;
  runtimePolicy.applyRuntimeOpponentPolicyAction({
    state,
    controller: {
      id: "test-policy-context-capture",
      chooseAction: (context) => {
        capturedContext = context;
        return {
          offenceStyle: "melee",
          defencePrayer: "protect_from_magic",
          movementIntent: "pressure",
          supplyIntent: "none",
          specIntent: "none",
          extendedSupplyAction: false
        };
      }
    },
    localActor: {
      tile: state.actors["local-player"].tile,
      loadoutId: state.actors["local-player"].loadoutId
    },
    opponentActor: {
      tile: state.actors.opponent.tile,
      loadoutId: state.actors.opponent.loadoutId
    },
    rewardEpisodeId: episode.rewardEpisodeId,
    rewardEpisodeActive: episode.rewardEpisodeActive,
    rewardEpisodeStartTick: episode.rewardEpisodeStartTick
  });
  assert(capturedContext, "policy context capture did not run");
  return capturedContext;
}

function capturePolicyInput(state) {
  let capturedInput = null;
  const context = capturePolicyContext(state);
  capturedInput = policyFeatures.encodeNhPolicyInput(context);
  assert(Array.isArray(capturedInput), "policy feature capture did not run");
  return capturedInput;
}

const policyOpponentHpInputIndex = 2;
const visibleHpBucketStateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "gmaul-bandos",
  seed: 26091
});
const visibleHpBucketInput = capturePolicyInput(setActorHitpoints(visibleHpBucketStateBase, "local-player", 97));
assert(
  Math.abs(visibleHpBucketInput[policyOpponentHpInputIndex] - 95 / 99) < 1e-12,
  `policy input should encode Java client-visible 5-HP opponent buckets, got ${visibleHpBucketInput[policyOpponentHpInputIndex]}`
);
const gmaulHp55Input = capturePolicyInput(
  withRecentOpponentHit(setActorHitpoints(visibleHpBucketStateBase, "local-player", 55), 32)
);
const gmaulHp57Input = capturePolicyInput(
  withRecentOpponentHit(setActorHitpoints(visibleHpBucketStateBase, "local-player", 57), 32)
);
assertArrayEquals(
  gmaulHp55Input.slice(gmaulFeatureStart),
  gmaulHp57Input.slice(gmaulFeatureStart),
  "Gmaul policy features should use the same client-visible HP bucket for exact HP values 55 and 57"
);

const policySelfSpecialActiveInputIndex = 26;
const specialActiveFeatureBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "gmaul-bandos",
  seed: 26101
});
const queuedButInactiveSpecInput = capturePolicyInput({
  ...specialActiveFeatureBase,
  actors: {
    ...specialActiveFeatureBase.actors,
    opponent: {
      ...specialActiveFeatureBase.actors.opponent,
      specialActive: false,
      gmaul: {
        ...specialActiveFeatureBase.actors.opponent.gmaul,
        queuedSpecs: 2
      }
    }
  }
});
assert(
  queuedButInactiveSpecInput[policySelfSpecialActiveInputIndex] === 0,
  `policy input selfSpecialActive should follow RuntimePlayerCombat.specialActive, not queued Gmaul specs, got ${queuedButInactiveSpecInput[policySelfSpecialActiveInputIndex]}`
);
const activeWithoutQueuedSpecInput = capturePolicyInput({
  ...specialActiveFeatureBase,
  actors: {
    ...specialActiveFeatureBase.actors,
    opponent: {
      ...specialActiveFeatureBase.actors.opponent,
      specialActive: true,
      gmaul: {
        ...specialActiveFeatureBase.actors.opponent.gmaul,
        queuedSpecs: 0
      }
    }
  }
});
assert(
  activeWithoutQueuedSpecInput[policySelfSpecialActiveInputIndex] === 1,
  `policy input selfSpecialActive should stay set even when no Gmaul specs are queued, got ${activeWithoutQueuedSpecInput[policySelfSpecialActiveInputIndex]}`
);

const magicCanAttackDelayedStateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 8, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes",
  seed: 2611
});
const magicCanAttackDelayedState = {
  ...magicCanAttackDelayedStateBase,
  tick: 4,
  actors: {
    ...magicCanAttackDelayedStateBase.actors,
    opponent: {
      ...magicCanAttackDelayedStateBase.actors.opponent,
      attackTimer: {
        lastAttackTick: 0,
        weaponCooldownTicks: 12,
        additiveAttackDelayTicks: 0
      }
    }
  }
};
const magicCanAttackDelayedInput = capturePolicyInput(magicCanAttackDelayedState);
assert(
  magicCanAttackDelayedInput[8] === 1 && magicCanAttackDelayedInput[9] === 0,
  "policy input should encode Java canAttackFromObserved separately from selfAttackReady for delayed magic"
);

const magicOutOfObservedRangeInput = capturePolicyInput(
  runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 9, z: 0 },
    opponentTile: { x: 0, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "kodai-robes",
    seed: 2612
  })
);
assert(
  magicOutOfObservedRangeInput[8] === 0,
  "policy input should use NhStakerBot.attackRangeForThreat() distance 8 for magic canAttack observation"
);

const lockedSpecFeatureStateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 1, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  opponentSpecialEnergy: 100,
  seed: 26120
});
const lockedSpecFeatureState = {
  ...lockedSpecFeatureStateBase,
  actors: {
    ...lockedSpecFeatureStateBase.actors,
    opponent: {
      ...lockedSpecFeatureStateBase.actors.opponent,
      locks: entityLocks.setLock(lockedSpecFeatureStateBase.actors.opponent.locks, "full")
    }
  }
};
const lockedSpecFeatureInput = capturePolicyInput(lockedSpecFeatureState);
assert(
  lockedSpecFeatureInput[10] === 0 &&
    lockedSpecFeatureInput[11] === 0 &&
    lockedSpecFeatureInput.slice(gmaulFeatureStart).every((value) => value === 0),
  `locked policy actor should expose Java canUseGraniteMaulSpecFromObserved false in canSpec inputs and setup windows: ${JSON.stringify({
    canSpecSingle: lockedSpecFeatureInput[10],
    canSpecDouble: lockedSpecFeatureInput[11],
    gmaulWindow: lockedSpecFeatureInput.slice(gmaulFeatureStart)
  })}`
);

const visibleGmaulPersistedRangedStateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 3, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "gmaul-bandos",
  seed: 26121
});
const visibleGmaulPersistedRangedContext = capturePolicyContext({
  ...visibleGmaulPersistedRangedStateBase,
  actors: {
    ...visibleGmaulPersistedRangedStateBase.actors,
    opponent: {
      ...visibleGmaulPersistedRangedStateBase.actors.opponent,
      policyOffenceStyle: "ranged"
    }
  }
});
const visibleGmaulPersistedRangedInput = policyFeatures.encodeNhPolicyInput(visibleGmaulPersistedRangedContext);
assert(
  visibleGmaulPersistedRangedContext.self.weaponId === "granite_maul" &&
    visibleGmaulPersistedRangedContext.self.lastOffenceStyle === "ranged",
  `test setup should expose visible Gmaul with persisted currentOffence ranged: ${JSON.stringify({
    weaponId: visibleGmaulPersistedRangedContext.self.weaponId,
    lastOffenceStyle: visibleGmaulPersistedRangedContext.self.lastOffenceStyle
  })}`
);
assert(
  visibleGmaulPersistedRangedInput[8] === 0,
  "policy canAttack observation should use Java selfLikelyStyle/live weapon style, not persisted currentOffence after Gmaul equip"
);
const scriptedStyleInputStart = 40;
const scriptedOffenceOverridesBestVisibleInput = policyFeatures.encodeNhPolicyInput({
  ...visibleGmaulPersistedRangedContext,
  bestVisibleStyle: "slash",
  scriptedOffenceStyle: "ranged"
});
assertArrayEquals(
  scriptedOffenceOverridesBestVisibleInput.slice(scriptedStyleInputStart, scriptedStyleInputStart + 3),
  [0, 1, 0],
  "policy input scriptedOffenceStyle bucket"
);

const distanceNineEvGuardController = {
  id: "test-policy-distance-nine-ev-guard",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const distanceNineEvGuard = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 9, z: 0 },
    opponentTile: { x: 0, z: 0 },
    localLoadoutId: "tentacle-bandos",
    opponentLoadoutId: "acb-hides",
    seed: 2613
  }),
  controller: distanceNineEvGuardController,
  localActor: {
    tile: { x: 9, z: 0 },
    loadoutId: "tentacle-bandos"
  },
  opponentActor: {
    tile: { x: 0, z: 0 },
    loadoutId: "acb-hides"
  }
});
assert(
  distanceNineEvGuard.effectiveAction.offenceStyle === "ranged",
  `style EV guard should not promote magic at distance 9 because Java clientOffenceEv uses attackRangeForThreat=8, got ${distanceNineEvGuard.effectiveAction.offenceStyle}`
);

const rewardShapingNoopController = {
  id: "test-policy-reward-shaping-noop",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const openStyleRewardBase = patchOpponentActor(runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 5, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides",
  localPrayers: ["protect_from_magic"],
  seed: 26131
}), { policyOffenceStyle: "ranged" });
const openStyleReward = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: { ...openStyleRewardBase, tick: 12 },
  controller: rewardShapingNoopController,
  localActor: {
    tile: openStyleRewardBase.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: openStyleRewardBase.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const openStyleRewardEvent = openStyleReward.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "style_pressure"
);
assert(
  openStyleRewardEvent &&
    Math.abs(openStyleRewardEvent.reward - 0.101) < 1e-9,
  `open off-prayer ranged pressure should match Java 0.075+0.026 reward, got ${JSON.stringify({
    event: openStyleRewardEvent,
    delta: openStyleReward.context.self.rewardDelta
  })}`
);

const defenceBeliefBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 5, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes",
  opponentPrayers: ["protect_from_missiles"],
  seed: 261310
});
const defenceBeliefReward = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: { ...defenceBeliefBase, tick: 12 },
  controller: rewardShapingNoopController,
  localActor: {
    tile: defenceBeliefBase.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: defenceBeliefBase.actors.opponent.tile,
    loadoutId: "kodai-robes"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const defenceBeliefEvent = defenceBeliefReward.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "defence_belief"
);
assert(
  defenceBeliefEvent &&
    defenceBeliefEvent.defencePrayer === "protect_from_missiles" &&
    defenceBeliefEvent.rangedBelief > defenceBeliefEvent.magicBelief &&
    defenceBeliefEvent.rangedBelief > defenceBeliefEvent.meleeBelief &&
    defenceBeliefEvent.reward > 0,
  `ranged-readable defence belief should reward protect-from-missiles like NhStakerBot.defencePrayerBeliefReward, got ${JSON.stringify(defenceBeliefEvent)}`
);

const actualPrayerBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 5, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes",
  opponentPrayers: ["protect_from_missiles"],
  seed: 261311
});
const actualPrayerReward = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...actualPrayerBase,
    tick: 12,
    events: [
      {
        kind: "hitsplat",
        id: "test-on-prayer-hit",
        tick: 11,
        attackerId: "local-player",
        targetActorId: "opponent",
        style: "ranged",
        damage: 7,
        rawDamage: 12,
        maxDamage: 33,
        hitChance: 0.8,
        defenderProtectionPrayer: "protect_from_missiles",
        previousHitpoints: 99,
        nextHitpoints: 92,
        maxHitpoints: 99,
        slotIndex: 0
      },
      {
        kind: "hitsplat",
        id: "test-off-prayer-hit",
        tick: 11,
        attackerId: "local-player",
        targetActorId: "opponent",
        style: "magic",
        damage: 12,
        rawDamage: 20,
        maxDamage: 31,
        hitChance: 0.8,
        defenderProtectionPrayer: "protect_from_missiles",
        previousHitpoints: 92,
        nextHitpoints: 80,
        maxHitpoints: 99,
        slotIndex: 1
      }
    ]
  },
  controller: rewardShapingNoopController,
  localActor: {
    tile: actualPrayerBase.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: actualPrayerBase.actors.opponent.tile,
    loadoutId: "kodai-robes"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const actualPrayerEvent = actualPrayerReward.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "actual_prayer"
);
assert(
  actualPrayerEvent &&
    actualPrayerEvent.onPrayerHits === 1 &&
    actualPrayerEvent.offPrayerHits === 1 &&
    actualPrayerEvent.onPrayerDamage === 7 &&
    actualPrayerEvent.offPrayerDamage === 12 &&
    Math.abs(actualPrayerEvent.reward + 1.724) < 1e-9,
  `actual prayer hit reward should match Java on/off-prayer constants, got ${JSON.stringify(actualPrayerEvent)}`
);

const boostedStatStateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 5, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 261312
});
const boostedStatStateReward = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: { ...boostedStatStateBase, tick: 12 },
  controller: rewardShapingNoopController,
  localActor: {
    tile: boostedStatStateBase.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: boostedStatStateBase.actors.opponent.tile,
    loadoutId: "acb-hides",
    stats: combatStats({ attack: 111, strength: 109, defence: 105, ranged: 104, magic: 118 })
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const boostedStatStateEvent = boostedStatStateReward.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "stat_state"
);
assert(
  boostedStatStateEvent &&
    boostedStatStateEvent.boostedCombatLevels === 33 &&
    boostedStatStateEvent.brewedDownCombatLevels === 0 &&
    Math.abs(boostedStatStateEvent.pottedStateBonus - 0.01485) < 1e-9 &&
    Math.abs(boostedStatStateEvent.reward - 0.01485) < 1e-9,
  `boosted combat stats should receive Java potted-state reward and ignore boosted magic in totalBoostedCombatLevels, got ${JSON.stringify(boostedStatStateEvent)}`
);

const brewedDownStatStateBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 5, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 261313
});
const brewedDownStatStateReward = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: { ...brewedDownStatStateBase, tick: 12 },
  controller: rewardShapingNoopController,
  localActor: {
    tile: brewedDownStatStateBase.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: brewedDownStatStateBase.actors.opponent.tile,
    loadoutId: "acb-hides",
    stats: combatStats({ attack: 98, strength: 98, defence: 98, ranged: 98, magic: 50 })
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const brewedDownStatStateEvent = brewedDownStatStateReward.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "stat_state"
);
const expectedBrewedDeficitScore = 1 + 3 / 35;
const expectedBrewedReward = -(4 * 0.00065) - expectedBrewedDeficitScore * 0.18;
assert(
  brewedDownStatStateEvent &&
    brewedDownStatStateEvent.boostedCombatLevels === 0 &&
    brewedDownStatStateEvent.brewedDownCombatLevels === 4 &&
    Math.abs(brewedDownStatStateEvent.brewedDownPenalty - 0.0026) < 1e-9 &&
    Math.abs(brewedDownStatStateEvent.combatDeficitScore - expectedBrewedDeficitScore) < 1e-9 &&
    Math.abs(brewedDownStatStateEvent.reward - expectedBrewedReward) < 1e-9,
  `brewed-down combat stats should receive Java brewed-down and combat-deficit penalty, got ${JSON.stringify(brewedDownStatStateEvent)}`
);

const deathSupplyBase = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 5, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  seed: 261314
});
const noSupplyDeathPenalty = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...deathSupplyBase,
    tick: 12,
    events: [
      {
        kind: "hitsplat",
        tick: 10,
        attackerId: "local-player",
        targetActorId: "opponent",
        damage: 35
      },
      {
        kind: "hitsplat",
        tick: 11,
        attackerId: "local-player",
        targetActorId: "opponent",
        damage: 30
      },
      {
        kind: "death",
        id: "test-opponent-death-no-supply",
        tick: 11,
        actorId: "opponent",
        respawnTick: 16
      }
    ]
  },
  controller: rewardShapingNoopController,
  localActor: {
    tile: deathSupplyBase.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: deathSupplyBase.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const noSupplyDeathPenaltyEvent = noSupplyDeathPenalty.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "death_supply"
);
assert(
  noSupplyDeathPenaltyEvent &&
    noSupplyDeathPenaltyEvent.unusedHealingSupplies === 10 &&
    noSupplyDeathPenaltyEvent.healingSupplyEvents === 0 &&
    noSupplyDeathPenaltyEvent.goodSupplyEvents === 0 &&
    noSupplyDeathPenaltyEvent.totalDamageTaken === 65 &&
    noSupplyDeathPenaltyEvent.avoidableSupplyPenalty === 10 &&
    noSupplyDeathPenaltyEvent.reward === -10,
  `death with unused supplies and no healing events should apply Java REWARD_DEATH_UNUSED_HEALING_SUPPLY_PENALTY, got ${JSON.stringify(noSupplyDeathPenaltyEvent)}`
);

const lowValueSupplyDeathPenalty = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...deathSupplyBase,
    tick: 12,
    events: [
      {
        kind: "policy-reward",
        id: "test-low-value-supply-before-death",
        tick: 10,
        actorId: "opponent",
        reason: "supply_reward",
        reward: -1,
        foodUses: 1,
        brewUses: 0,
        riskReduction: 0.01
      },
      {
        kind: "hitsplat",
        tick: 10,
        attackerId: "local-player",
        targetActorId: "opponent",
        damage: 35
      },
      {
        kind: "hitsplat",
        tick: 11,
        attackerId: "local-player",
        targetActorId: "opponent",
        damage: 30
      },
      {
        kind: "death",
        id: "test-opponent-death-low-value-supply",
        tick: 11,
        actorId: "opponent",
        respawnTick: 16
      }
    ]
  },
  controller: rewardShapingNoopController,
  localActor: {
    tile: deathSupplyBase.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: deathSupplyBase.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const lowValueSupplyDeathPenaltyEvent = lowValueSupplyDeathPenalty.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "death_supply"
);
assert(
  lowValueSupplyDeathPenaltyEvent &&
    lowValueSupplyDeathPenaltyEvent.healingSupplyEvents === 1 &&
    lowValueSupplyDeathPenaltyEvent.goodSupplyEvents === 0 &&
    lowValueSupplyDeathPenaltyEvent.avoidableSupplyPenalty === 4 &&
    lowValueSupplyDeathPenaltyEvent.reward === -4,
  `death after only low-value healing should apply Java REWARD_DEATH_NO_GOOD_SUPPLY_PENALTY, got ${JSON.stringify(lowValueSupplyDeathPenaltyEvent)}`
);

const goodSupplyDeathPenalty = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...deathSupplyBase,
    tick: 12,
    events: [
      {
        kind: "policy-reward",
        id: "test-good-supply-before-death",
        tick: 10,
        actorId: "opponent",
        reason: "supply_reward",
        reward: 1,
        foodUses: 1,
        brewUses: 0,
        riskReduction: 0.08
      },
      {
        kind: "hitsplat",
        tick: 10,
        attackerId: "local-player",
        targetActorId: "opponent",
        damage: 35
      },
      {
        kind: "hitsplat",
        tick: 11,
        attackerId: "local-player",
        targetActorId: "opponent",
        damage: 30
      },
      {
        kind: "death",
        id: "test-opponent-death-good-supply",
        tick: 11,
        actorId: "opponent",
        respawnTick: 16
      }
    ]
  },
  controller: rewardShapingNoopController,
  localActor: {
    tile: deathSupplyBase.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: deathSupplyBase.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
assert(
  !goodSupplyDeathPenalty.state.events.some(
    (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "death_supply"
  ),
  "death after a Java-good supply event should not receive an avoidable death-supply penalty"
);

const intoPrayerPenaltyBase = patchOpponentActor(runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 5, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides",
  localPrayers: ["protect_from_missiles"],
  seed: 26132
}), { policyOffenceStyle: "ranged" });
const intoPrayerPenalty = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...intoPrayerPenaltyBase,
    tick: 13,
    events: [
      {
        kind: "policy-reward",
        id: "test-style-pressure-streak-1",
        tick: 10,
        actorId: "opponent",
        reason: "style_pressure",
        reward: 0,
        offenceStyle: "ranged",
        protectedStyle: "ranged",
        protectedStyleStreak: 1,
        styleProtected: true
      },
      {
        kind: "policy-reward",
        id: "test-style-pressure-streak-2",
        tick: 11,
        actorId: "opponent",
        reason: "style_pressure",
        reward: 0,
        offenceStyle: "ranged",
        protectedStyle: "ranged",
        protectedStyleStreak: 2,
        styleProtected: true
      }
    ]
  },
  controller: rewardShapingNoopController,
  localActor: {
    tile: intoPrayerPenaltyBase.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: intoPrayerPenaltyBase.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const intoPrayerPenaltyEvent = intoPrayerPenalty.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "style_pressure" && event.tick === 12
);
assert(
  intoPrayerPenaltyEvent &&
    intoPrayerPenaltyEvent.protectedStyleStreak === 3 &&
    Math.abs(intoPrayerPenaltyEvent.reward + 0.218) < 1e-9,
  `into-prayer style pressure should apply Java grace/sticky penalty on third protected tick, got ${JSON.stringify({
    event: intoPrayerPenaltyEvent,
    delta: intoPrayerPenalty.context.self.rewardDelta
  })}`
);

const gearWeaknessRewardBase = patchOpponentActor(runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 1, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "tentacle-bandos",
  localPrayers: ["protect_from_magic"],
  seed: 26133
}), { policyOffenceStyle: "melee" });
const gearWeaknessReward = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: { ...gearWeaknessRewardBase, tick: 12 },
  controller: rewardShapingNoopController,
  localActor: {
    tile: gearWeaknessRewardBase.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    equipment: {}
  },
  opponentActor: {
    tile: gearWeaknessRewardBase.actors.opponent.tile,
    loadoutId: "tentacle-bandos"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const gearWeaknessRewardEvent = gearWeaknessReward.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "gear_weakness"
);
assert(
  gearWeaknessRewardEvent &&
    gearWeaknessRewardEvent.reward > 0,
  `melee into weak visible gear should receive Java gear weakness reward alongside open-style pressure, got ${JSON.stringify({
    event: gearWeaknessRewardEvent,
    delta: gearWeaknessReward.context.self.rewardDelta
  })}`
);

const meleeThreatBase = patchOpponentActor(runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 1, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "tentacle-bandos",
  localPrayers: ["protect_from_magic"],
  seed: 26134
}), { policyOffenceStyle: "melee" });
const meleeThreatReward = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...meleeThreatBase,
    tick: 12,
    events: [
      {
        kind: "policy-reward",
        id: "test-melee-threat-prev",
        tick: 10,
        actorId: "opponent",
        reason: "melee_threat",
        reward: 0,
        meleeThreatPotential: 0
      }
    ]
  },
  controller: rewardShapingNoopController,
  localActor: {
    tile: meleeThreatBase.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    equipment: {}
  },
  opponentActor: {
    tile: meleeThreatBase.actors.opponent.tile,
    loadoutId: "tentacle-bandos"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const meleeThreatRewardEvent = meleeThreatReward.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "melee_threat" && event.tick === 11
);
assert(
  meleeThreatRewardEvent &&
    meleeThreatRewardEvent.meleeThreatPotential > 0 &&
    meleeThreatRewardEvent.reward > 0,
  `Java meleeThreatPotential delta reward should become positive as melee opens, got ${JSON.stringify(meleeThreatRewardEvent)}`
);

const meleeTelegraphPenaltyBase = patchOpponentActor(runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 5, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "tentacle-bandos",
  localPrayers: ["protect_from_magic"],
  seed: 26135
}), { policyOffenceStyle: "melee" });
const meleeTelegraphPenalty = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: { ...meleeTelegraphPenaltyBase, tick: 12 },
  controller: rewardShapingNoopController,
  localActor: {
    tile: meleeTelegraphPenaltyBase.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: meleeTelegraphPenaltyBase.actors.opponent.tile,
    loadoutId: "tentacle-bandos"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const meleeTelegraphPenaltyEvent = meleeTelegraphPenalty.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "melee_telegraph"
);
assert(
  meleeTelegraphPenaltyEvent && Math.abs(meleeTelegraphPenaltyEvent.reward + 0.034) < 1e-9,
  `out-of-range melee should receive Java melee telegraph penalty, got ${JSON.stringify(meleeTelegraphPenaltyEvent)}`
);

const freezePositionBase = freezeActor(
  {
    ...runtimeCombat.createRuntimePlayerCombatState({
      localTile: { x: 0, z: 0 },
      opponentTile: { x: 0, z: 0 },
      localLoadoutId: "kodai-robes",
      opponentLoadoutId: "acb-hides",
      seed: 26136
    }),
    tick: 12
  },
  "local-player"
);
const freezePositionReward = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...freezePositionBase,
    tick: 12,
    events: [
      {
        kind: "policy-reward",
        id: "test-prev-distance-freeze-position",
        tick: 10,
        actorId: "opponent",
        reason: "style_pressure",
        reward: 0,
        distance: 1
      }
    ]
  },
  controller: rewardShapingNoopController,
  localActor: {
    tile: freezePositionBase.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    locks: freezePositionBase.actors["local-player"].locks
  },
  opponentActor: {
    tile: freezePositionBase.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const freezePositionRewardEvent = freezePositionReward.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "freeze_position"
);
assert(
  freezePositionRewardEvent && Math.abs(freezePositionRewardEvent.reward - 0.065) < 1e-9,
  `standing under a frozen opponent should receive Java freeze-position reward, got ${JSON.stringify(freezePositionRewardEvent)}`
);

const freezeNoPressureBase = freezeActor(
  {
    ...runtimeCombat.createRuntimePlayerCombatState({
      localTile: { x: 0, z: 0 },
      opponentTile: { x: 0, z: 0 },
      localLoadoutId: "kodai-robes",
      opponentLoadoutId: "acb-hides",
      seed: 26137
    }),
    tick: 12
  },
  "local-player"
);
const freezeNoPressurePenalty = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...freezeNoPressureBase,
    tick: 12,
    events: [
      {
        kind: "policy-reward",
        id: "test-prev-freeze-under-no-pressure",
        tick: 10,
        actorId: "opponent",
        reason: "freeze_under_no_pressure",
        reward: 0,
        distance: 0,
        freezeUnderNoPressureTicks: 3,
        productiveControl: false
      }
    ]
  },
  controller: rewardShapingNoopController,
  localActor: {
    tile: freezeNoPressureBase.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    locks: freezeNoPressureBase.actors["local-player"].locks
  },
  opponentActor: {
    tile: freezeNoPressureBase.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const freezeNoPressurePenaltyEvent = freezeNoPressurePenalty.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "freeze_under_no_pressure" && event.tick === 11
);
assert(
  freezeNoPressurePenaltyEvent &&
    freezeNoPressurePenaltyEvent.freezeUnderNoPressureTicks === 4 &&
    Math.abs(freezeNoPressurePenaltyEvent.reward + 0.03) < 1e-9,
  `unproductive under-tile freeze control should receive Java no-pressure penalty after grace, got ${JSON.stringify(freezeNoPressurePenaltyEvent)}`
);

const underControlBase = freezeActor(
  {
    ...setActorHitpoints(
      runtimeCombat.createRuntimePlayerCombatState({
      localTile: { x: 0, z: 0 },
      opponentTile: { x: 0, z: 0 },
      localLoadoutId: "gmaul-bandos",
      opponentLoadoutId: "acb-hides",
      seed: 26138
      }),
      "opponent",
      55
    ),
    tick: 12
  },
  "local-player"
);
const underControlReward = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: {
    ...underControlBase,
    tick: 12,
    events: [
      {
        kind: "policy-reward",
        id: "test-prev-under-control-distance",
        tick: 10,
        actorId: "opponent",
        reason: "style_pressure",
        reward: 0,
        distance: 1
      }
    ]
  },
  controller: rewardShapingNoopController,
  localActor: {
    tile: underControlBase.actors["local-player"].tile,
    loadoutId: "gmaul-bandos",
    locks: underControlBase.actors["local-player"].locks
  },
  opponentActor: {
    tile: underControlBase.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const underControlRewardEvent = underControlReward.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "under_control"
);
assert(
  underControlRewardEvent &&
    underControlRewardEvent.entry === true &&
    underControlRewardEvent.productiveControl === true &&
    underControlRewardEvent.reward > 0.1,
  `productive frozen under-control should receive Java entry/productive reward, got ${JSON.stringify(underControlRewardEvent)}`
);

const meleeRangeBase = patchOpponentActor(runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 5, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "tentacle-bandos",
  localPrayers: ["protect_from_magic"],
  seed: 26139
}), { policyOffenceStyle: "melee" });
const meleeRangePenalty = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: { ...meleeRangeBase, tick: 12 },
  controller: rewardShapingNoopController,
  localActor: {
    tile: meleeRangeBase.actors["local-player"].tile,
    loadoutId: "kodai-robes"
  },
  opponentActor: {
    tile: meleeRangeBase.actors.opponent.tile,
    loadoutId: "tentacle-bandos"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const meleeRangePenaltyEvent = meleeRangePenalty.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "melee_range"
);
assert(
  meleeRangePenaltyEvent && Math.abs(meleeRangePenaltyEvent.reward + 0.072) < 1e-9,
  `out-of-range melee should receive Java melee-range penalty, got ${JSON.stringify(meleeRangePenaltyEvent)}`
);

const unknownObservedRewardBase = freezeActor(
  {
    ...runtimeCombat.createRuntimePlayerCombatState({
      localTile: { x: 5, z: 0 },
      opponentTile: { x: 0, z: 0 },
      localLoadoutId: "kodai-robes",
      opponentLoadoutId: "acb-hides",
      seed: 261391
    }),
    tick: 12
  },
  "opponent"
);
const unknownObservedReward = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: unknownObservedRewardBase,
  controller: rewardShapingNoopController,
  localActor: {
    tile: unknownObservedRewardBase.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    observedInfoKnown: false,
    activePrayers: ["protect_from_missiles"],
    locks: unknownObservedRewardBase.actors["local-player"].locks
  },
  opponentActor: {
    tile: unknownObservedRewardBase.actors.opponent.tile,
    loadoutId: "acb-hides",
    locks: unknownObservedRewardBase.actors.opponent.locks
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const unknownObservedStylePressure = unknownObservedReward.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "style_pressure"
);
assert(
  unknownObservedStylePressure?.distance === -1,
  `unknown delayed opponent reward shaping should use Java observedDistance=-1, got ${JSON.stringify(unknownObservedStylePressure)}`
);
assert(
  !unknownObservedReward.state.events.some(
    (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "frozen_cast"
  ),
  "unknown delayed opponent should not fabricate frozen-cast spacing from the placeholder/current tile"
);
assert(
  !unknownObservedReward.state.events.some(
    (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "defence_belief"
  ),
  "unknown delayed opponent should not fabricate readable defence-belief threat from hidden gear/style"
);

const unknownObservedMeleeController = {
  id: "test-policy-unknown-observed-melee",
  chooseAction: () => ({
    offenceStyle: "melee",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const unknownObservedMeleeBase = patchOpponentActor(runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 5, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "tentacle-bandos",
  seed: 261392
}), { policyOffenceStyle: "melee" });
const unknownObservedMelee = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: { ...unknownObservedMeleeBase, tick: 12 },
  controller: unknownObservedMeleeController,
  localActor: {
    tile: unknownObservedMeleeBase.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    observedInfoKnown: false
  },
  opponentActor: {
    tile: unknownObservedMeleeBase.actors.opponent.tile,
    loadoutId: "tentacle-bandos"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const unknownObservedMeleeRange = unknownObservedMelee.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "melee_range"
);
assert(
  unknownObservedMeleeRange?.distance === -1 && Math.abs(unknownObservedMeleeRange.reward + 0.024) < 1e-9,
  `unknown delayed melee range reward should use Java distance=-1 one-step penalty, got ${JSON.stringify(unknownObservedMeleeRange)}`
);
const unknownObservedMeleeThreat = unknownObservedMelee.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "melee_threat"
);
assert(
  unknownObservedMeleeThreat?.meleeThreatPotential === 0,
  `unknown delayed opponent should not create melee-threat potential from the current tile, got ${JSON.stringify(unknownObservedMeleeThreat)}`
);

const rangeSpacingBase = freezeActor(
  {
    ...patchOpponentActor(runtimeCombat.createRuntimePlayerCombatState({
      localTile: { x: 4, z: 0 },
      opponentTile: { x: 0, z: 0 },
      localLoadoutId: "kodai-robes",
      opponentLoadoutId: "acb-hides",
      seed: 26140
    }), { policyOffenceStyle: "ranged" }),
    tick: 12
  },
  "local-player"
);
const rangeSpacingReward = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: { ...rangeSpacingBase, tick: 12 },
  controller: rewardShapingNoopController,
  localActor: {
    tile: rangeSpacingBase.actors["local-player"].tile,
    loadoutId: "kodai-robes",
    locks: rangeSpacingBase.actors["local-player"].locks
  },
  opponentActor: {
    tile: rangeSpacingBase.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 10
});
const rangeSpacingRewardEvent = rangeSpacingReward.state.events.find(
  (event) => event.kind === "policy-reward" && event.actorId === "opponent" && event.reason === "range_spacing"
);
assert(
  rangeSpacingRewardEvent && Math.abs(rangeSpacingRewardEvent.reward - 0.03) < 1e-9,
  `ranged/magic spacing on a frozen opponent should receive Java spacing reward, got ${JSON.stringify(rangeSpacingRewardEvent)}`
);

const meleePressureRouteController = {
  id: "test-policy-melee-pressure-route",
  chooseAction: () => ({
    offenceStyle: "melee",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const meleePressureRouteState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 9, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "tentacle-bandos",
  seed: 2614
});
const meleePressureRoute = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: meleePressureRouteState,
  controller: meleePressureRouteController,
  localActor: {
    tile: meleePressureRouteState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: meleePressureRouteState.actors.opponent.tile,
    loadoutId: "tentacle-bandos",
    inventoryItems: []
  }
});
assert(
  meleePressureRoute.effectiveAction.offenceStyle === "melee" &&
    meleePressureRoute.opponentMovedThisTick &&
    meleePressureRoute.opponentTile.x === 1 &&
    meleePressureRoute.opponentTile.z === 0,
  `pressure melee should route toward the target when Java observedSelfCanMeleeReachThisTick is false: ${JSON.stringify({
    effectiveAction: meleePressureRoute.effectiveAction,
    moved: meleePressureRoute.opponentMovedThisTick,
    tile: meleePressureRoute.opponentTile,
    blocked: meleePressureRoute.movementBlockedReason
  })}`
);
const meleePressureRouteDetour = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: meleePressureRouteState,
  controller: meleePressureRouteController,
  localActor: {
    tile: meleePressureRouteState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: meleePressureRouteState.actors.opponent.tile,
    loadoutId: "tentacle-bandos",
    inventoryItems: []
  },
  targetRouteStep: (from, _target, distance, stepContext) => {
    assert(distance === 1, `Java routeEntity pressure should use size-1 reach distance, got ${distance}`);
    assert(stepContext.movementIntent === "pressure", `pressure route callback got wrong intent: ${stepContext.movementIntent}`);
    return { x: from.x, z: from.z + 1 };
  }
});
assert(
  meleePressureRouteDetour.opponentMovedThisTick &&
    meleePressureRouteDetour.opponentTile.x === 0 &&
    meleePressureRouteDetour.opponentTile.z === 1,
  `pressure melee should use Java RouteFinder.routeEntity next step instead of direct stepToward when supplied: ${JSON.stringify({
    moved: meleePressureRouteDetour.opponentMovedThisTick,
    tile: meleePressureRouteDetour.opponentTile,
    blocked: meleePressureRouteDetour.movementBlockedReason
  })}`
);
const meleePressureRouteNoPath = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: meleePressureRouteState,
  controller: meleePressureRouteController,
  localActor: {
    tile: meleePressureRouteState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: meleePressureRouteState.actors.opponent.tile,
    loadoutId: "tentacle-bandos",
    inventoryItems: []
  },
  targetRouteStep: () => null
});
assert(
  !meleePressureRouteNoPath.opponentMovedThisTick &&
    meleePressureRouteNoPath.opponentTile.x === meleePressureRouteState.actors.opponent.tile.x &&
    meleePressureRouteNoPath.opponentTile.z === meleePressureRouteState.actors.opponent.tile.z,
  `pressure melee should not fall back to an invented direct step when Java routeEntity has no path: ${JSON.stringify({
    moved: meleePressureRouteNoPath.opponentMovedThisTick,
    tile: meleePressureRouteNoPath.opponentTile,
    blocked: meleePressureRouteNoPath.movementBlockedReason
  })}`
);
const meleePressureRouteTargetBlocked = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: meleePressureRouteState,
  controller: meleePressureRouteController,
  localActor: {
    tile: meleePressureRouteState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: meleePressureRouteState.actors.opponent.tile,
    loadoutId: "tentacle-bandos",
    inventoryItems: []
  },
  canStep: (_from, _to, stepContext) =>
    !(stepContext.movementIntent === "pressure" && stepContext.targetTile.x === meleePressureRouteState.actors["local-player"].tile.x)
});
assert(
  !meleePressureRouteTargetBlocked.opponentMovedThisTick &&
    meleePressureRouteTargetBlocked.movementBlockedReason === "collision" &&
    meleePressureRouteTargetBlocked.opponentTile.x === meleePressureRouteState.actors.opponent.tile.x,
  `pressure melee should not start a route when Java routeToOpponentIfAllowed() would reject the target combat tile: ${JSON.stringify({
    moved: meleePressureRouteTargetBlocked.opponentMovedThisTick,
    tile: meleePressureRouteTargetBlocked.opponentTile,
    blocked: meleePressureRouteTargetBlocked.movementBlockedReason
  })}`
);

function setActorHitpoints(state, actorId, hitpoints) {
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...state.actors[actorId],
        hitpoints
      }
    }
  };
}

function combatStats(levels = {}) {
  return {
    attack: combatStat(levels.attack),
    strength: combatStat(levels.strength),
    defence: combatStat(levels.defence),
    ranged: combatStat(levels.ranged),
    magic: combatStat(levels.magic),
    hitpoints: { current: levels.hitpoints ?? 99, fixed: levels.maxHitpoints ?? 99 },
    prayer: { current: levels.prayer ?? 99, fixed: levels.maxPrayer ?? 99 }
  };
}

function combatStat(current = 99) {
  return { current, fixed: 99 };
}

function withRecentOpponentHit(state, damage) {
  return {
    ...state,
    tick: 12,
    events: [
      {
        kind: "hitsplat",
        tick: 11,
        attackerId: "opponent",
        targetActorId: "local-player",
        damage
      }
    ]
  };
}

function freezeOpponent(state) {
  return freezeActor(state, "opponent");
}

function freezeActor(state, actorId) {
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...state.actors[actorId],
        locks: entityLocks.applyFreeze(state.actors[actorId].locks, state.tick, 10)
      }
    }
  };
}

const leftPvpBaseState = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 4, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes",
  seed: 2604
});
const leftPvpState = {
  ...leftPvpBaseState,
  actors: {
    ...leftPvpBaseState.actors,
    opponent: {
      ...leftPvpBaseState.actors.opponent,
      targetId: "local-player",
      lastTargetId: "local-player",
      lastTargetTimeoutTicks: 4,
      policyOffenceStyle: "ranged",
      policyNextLoadoutSyncTick: 17,
      policyStalledStyle: "magic",
      policyStalledStyleTicks: 3,
      queuedSpellId: "ice-barrage",
      activePrayers: ["protect_from_missiles", "rigour"]
    }
  }
};
let leftPvpChooseCalls = 0;
const leftPvpMutatingController = {
  id: "test-policy-left-pvp-mutating",
  chooseAction: () => {
    leftPvpChooseCalls += 1;
    return {
      offenceStyle: "melee",
      defencePrayer: "protect_from_melee",
      movementIntent: "stand_under",
      supplyIntent: "triple_eat",
      specIntent: "use_special_double",
      extendedSupplyAction: false
    };
  }
};
const leftPvpResult = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: leftPvpState,
  controller: leftPvpMutatingController,
  localActor: {
    tile: leftPvpState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: leftPvpState.actors.opponent.tile,
    loadoutId: "kodai-robes"
  },
  inPvpCombatArea: false,
  rewardEpisodeActive: true,
  rewardEpisodeStartTick: 1
});
assert(leftPvpChooseCalls === 0, "left-PvP reset should return before controller.chooseAction like NhStakerBot.tick()");
assert(
  leftPvpResult.movementBlockedReason === "left-pvp" &&
    !leftPvpResult.opponentMovedThisTick &&
    leftPvpResult.consumedSupplies.length === 0 &&
    leftPvpResult.strippedEquipmentSlots.length === 0 &&
    leftPvpResult.state.events.length === leftPvpState.events.length,
  `left-PvP reset should not apply policy supplies, movement, equipment, attacks, or rewards: ${JSON.stringify({
    blocked: leftPvpResult.movementBlockedReason,
    moved: leftPvpResult.opponentMovedThisTick,
    consumed: leftPvpResult.consumedSupplies,
    stripped: leftPvpResult.strippedEquipmentSlots,
    events: leftPvpResult.state.events
  })}`
);
assert(
  leftPvpResult.state.actors.opponent.targetId === null &&
    leftPvpResult.state.actors.opponent.lastTargetId === null &&
    leftPvpResult.state.actors.opponent.queuedSpellId === null &&
    leftPvpResult.state.actors.opponent.policyOffenceStyle === undefined &&
    leftPvpResult.state.actors.opponent.policyNextLoadoutSyncTick === 0 &&
    leftPvpResult.state.actors.opponent.policyStalledStyle === null &&
    leftPvpResult.state.actors.opponent.policyStalledStyleTicks === 0 &&
    leftPvpResult.state.actors.opponent.activePrayers.length === 0,
  `left-PvP reset should clear the Java resetCombatState fields: ${JSON.stringify(leftPvpResult.state.actors.opponent)}`
);

let selfPlayLeftPvpChooseCalls = 0;
const selfPlayLeftPvpResult = runtimePolicy.applyRuntimeOpponentPolicyAction({
  state: leftPvpBaseState,
  controller: {
    id: "test-policy-left-pvp-selfplay",
    chooseAction: () => {
      selfPlayLeftPvpChooseCalls += 1;
      return {
        offenceStyle: "ranged",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      };
    }
  },
  localActor: {
    tile: leftPvpBaseState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: leftPvpBaseState.actors.opponent.tile,
    loadoutId: "acb-hides"
  },
  inPvpCombatArea: false,
  selfPlayMode: true
});
assert(
  selfPlayLeftPvpChooseCalls === 1 && selfPlayLeftPvpResult.movementBlockedReason !== "left-pvp",
  `self-play mode should bypass the left-PvP gate like inPvpCombatArea(), got calls=${selfPlayLeftPvpChooseCalls}, blocked=${selfPlayLeftPvpResult.movementBlockedReason}`
);

const policyLifecycleContext = capturePolicyContext(
  runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 3, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "kodai-robes",
    seed: 2601
  }),
  { rewardEpisodeId: 12, rewardEpisodeActive: true }
);
const activeEpisodeInput = policyFeatures.encodeNhPolicyInput(policyLifecycleContext);
const inactiveEpisodeInput = policyFeatures.encodeNhPolicyInput({
  ...policyLifecycleContext,
  rewardEpisodeActive: false
});
assert(activeEpisodeInput[60] === 1, "policy input should encode an active reward episode as one");
assert(inactiveEpisodeInput[60] === 0, "policy input should encode an inactive reward episode as zero");

const lifecycleFeatureState = policyFeatures.createNhPolicyFeatureState();
const firstLifecycleFeatures = policyFeatures
  .encodeNhPolicyFeatures(policyLifecycleContext, lifecycleFeatureState)
  .slice(policyFeatures.nhPolicyReservoirFeatureStart, policyFeatures.nhPolicyReservoirFeatureEnd);
const carriedLifecycleFeatures = policyFeatures
  .encodeNhPolicyFeatures(policyLifecycleContext, lifecycleFeatureState)
  .slice(policyFeatures.nhPolicyReservoirFeatureStart, policyFeatures.nhPolicyReservoirFeatureEnd);
assert(
  carriedLifecycleFeatures.some((value, index) => Math.abs(value - firstLifecycleFeatures[index]) > 1e-9),
  "policy recurrent reservoir should carry state between same-episode decisions"
);
policyFeatures.resetNhPolicyFeatureState(lifecycleFeatureState);
const resetLifecycleFeatures = policyFeatures
  .encodeNhPolicyFeatures(policyLifecycleContext, lifecycleFeatureState)
  .slice(policyFeatures.nhPolicyReservoirFeatureStart, policyFeatures.nhPolicyReservoirFeatureEnd);
assertArrayEquals(
  resetLifecycleFeatures.map((value) => Number(value.toFixed(12))),
  firstLifecycleFeatures.map((value) => Number(value.toFixed(12))),
  "policy recurrent reservoir reset"
);

const delayedLikelyStyleState = {
  ...runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 3, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "kodai-robes",
    seed: 2602
  }),
  tick: 12,
  events: [
    {
      kind: "attack",
      tick: 11,
      attackerId: "local-player",
      defenderId: "opponent",
      style: "magic"
    }
  ]
};
const delayedLikelyStyleInput = capturePolicyInput(delayedLikelyStyleState);
assert(
  delayedLikelyStyleInput[43] === 1 && delayedLikelyStyleInput[44] === 0 && delayedLikelyStyleInput[45] === 0,
  "policy opponent likely style should come from the one-tick delayed visible attack event"
);
assert(
  delayedLikelyStyleInput[46] === 0 && delayedLikelyStyleInput[47] === 1 && delayedLikelyStyleInput[48] === 0,
  "policy opponent gear style should remain separate from delayed likely style"
);

const currentRewardInput = capturePolicyInput(
  withRecentOpponentHit(
    runtimeCombat.createRuntimePlayerCombatState({
      localTile: { x: 0, z: 0 },
      opponentTile: { x: 1, z: 0 },
      localLoadoutId: "kodai-robes",
      opponentLoadoutId: "gmaul-bandos",
      seed: 2603
    }),
    32
  )
);
assert(
  currentRewardInput[20] > 0 && currentRewardInput[21] > 0 && currentRewardInput[22] > 0 && currentRewardInput[23] === 32 / 40,
  "policy reward inputs should include damage from the just-visible tick"
);
const staleRewardInput = capturePolicyInput({
  ...runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 1, z: 0 },
    localLoadoutId: "kodai-robes",
    opponentLoadoutId: "gmaul-bandos",
    seed: 2604
  }),
  tick: 12,
  events: [
    {
      kind: "hitsplat",
      tick: 10,
      attackerId: "opponent",
      targetActorId: "local-player",
      damage: 32
    }
  ]
});
assert(
  staleRewardInput[20] > 0 &&
    staleRewardInput[21] > 0 &&
    staleRewardInput[23] === 0 &&
    Math.abs(staleRewardInput[22] - 33.6 / 120) < 0.001,
  "policy reward delta/DPS should follow Java rolling reward after the visible damage tick while last hit resets"
);
const episodeScopedRewardContext = capturePolicyContext(
  {
    ...runtimeCombat.createRuntimePlayerCombatState({
      localTile: { x: 0, z: 0 },
      opponentTile: { x: 1, z: 0 },
      localLoadoutId: "kodai-robes",
      opponentLoadoutId: "gmaul-bandos",
      seed: 2605
    }),
    tick: 12,
    events: [
      {
        kind: "hitsplat",
        tick: 7,
        attackerId: "opponent",
        targetActorId: "local-player",
        damage: 10
      },
      {
        kind: "hitsplat",
        tick: 11,
        attackerId: "opponent",
        targetActorId: "local-player",
        damage: 20
      }
    ]
  },
  { rewardEpisodeId: 2, rewardEpisodeActive: true, rewardEpisodeStartTick: 10 }
);
const episodeScopedRewardInput = policyFeatures.encodeNhPolicyInput(episodeScopedRewardContext);
const episodeScopedRewardNoStaleContext = capturePolicyContext(
  {
    ...runtimeCombat.createRuntimePlayerCombatState({
      localTile: { x: 0, z: 0 },
      opponentTile: { x: 1, z: 0 },
      localLoadoutId: "kodai-robes",
      opponentLoadoutId: "gmaul-bandos",
      seed: 26051
    }),
    tick: 12,
    events: [
      {
        kind: "hitsplat",
        tick: 11,
        attackerId: "opponent",
        targetActorId: "local-player",
        damage: 20
      }
    ]
  },
  { rewardEpisodeId: 2, rewardEpisodeActive: true, rewardEpisodeStartTick: 10 }
);
const episodeScopedRewardNoStaleInput = policyFeatures.encodeNhPolicyInput(episodeScopedRewardNoStaleContext);
assert(
  Math.abs(episodeScopedRewardInput[22] - episodeScopedRewardNoStaleInput[22]) < 0.001,
  "policy reward total should reset to the active episode start like NhStakerBot.rewardEpisodeTotal"
);

const gmaulUnprotectedInput = capturePolicyInput(
  withRecentOpponentHit(
    setActorHitpoints(
      runtimeCombat.createRuntimePlayerCombatState({
        localTile: { x: 0, z: 0 },
        opponentTile: { x: 1, z: 0 },
        localLoadoutId: "kodai-robes",
        opponentLoadoutId: "gmaul-bandos",
        opponentSpecialEnergy: 100,
        seed: 2701
      }),
      "local-player",
      55
    ),
    32
  )
);
const gmaulProtectedInput = capturePolicyInput(
  withRecentOpponentHit(
    setActorHitpoints(
      runtimeCombat.createRuntimePlayerCombatState({
        localTile: { x: 0, z: 0 },
        opponentTile: { x: 1, z: 0 },
        localLoadoutId: "kodai-robes",
        opponentLoadoutId: "gmaul-bandos",
        localPrayers: ["protect_from_melee"],
        opponentSpecialEnergy: 100,
        seed: 2702
      }),
      "local-player",
      55
    ),
    32
  )
);
assert(
  gmaulUnprotectedInput[gmaulFeatureStart] > gmaulProtectedInput[gmaulFeatureStart],
  "Gmaul single KO feature should drop when the observed opponent protects melee"
);
assert(
  gmaulUnprotectedInput[gmaulFeatureStart + 2] > gmaulProtectedInput[gmaulFeatureStart + 2],
  "Gmaul setup feature should be prayer-scaled like NhStakerBot.gmaulSetupScore"
);

const { weapon: _hiddenWeapon, ammo: _hiddenAmmo, ...visibleBandosNoWeaponOrAmmo } =
  loadouts.nhLoadouts["tentacle-bandos"].equipment;
const hiddenGearStyleGmaulContext = capturePolicyContext(
  withRecentOpponentHit(
    setActorHitpoints(
      patchLocalActor(
        runtimeCombat.createRuntimePlayerCombatState({
          localTile: { x: 0, z: 0 },
          opponentTile: { x: 1, z: 0 },
          localLoadoutId: "acb-hides",
          opponentLoadoutId: "gmaul-bandos",
          opponentSpecialEnergy: 100,
          seed: 27021
        }),
        { equipment: visibleBandosNoWeaponOrAmmo }
      ),
      "local-player",
      55
    ),
    32
  )
);
const hiddenGearStyleGmaulInput = policyFeatures.encodeNhPolicyInput(hiddenGearStyleGmaulContext);
const forcedRangedGearStyleGmaulInput = policyFeatures.encodeNhPolicyInput({
  ...hiddenGearStyleGmaulContext,
  opponent: {
    ...hiddenGearStyleGmaulContext.opponent,
    lastVisibleOpponentStyle: "ranged"
  }
});
assert(
  hiddenGearStyleGmaulContext.opponent.weaponId === "armadyl_crossbow" &&
    hiddenGearStyleGmaulContext.opponent.lastVisibleOpponentStyle === null,
  `test setup should preserve TS loadout fallback weapon while hiding Java delayed gear style: ${JSON.stringify({
    weaponId: hiddenGearStyleGmaulContext.opponent.weaponId,
    gearStyle: hiddenGearStyleGmaulContext.opponent.lastVisibleOpponentStyle
  })}`
);
assert(
  hiddenGearStyleGmaulInput[gmaulFeatureStart + 1] > forcedRangedGearStyleGmaulInput[gmaulFeatureStart + 1],
  `Gmaul KO exposure should use Java delayed gear style, not TS loadout fallback weapon: ${JSON.stringify({
    hidden: hiddenGearStyleGmaulInput.slice(gmaulFeatureStart),
    forcedRanged: forcedRangedGearStyleGmaulInput.slice(gmaulFeatureStart)
  })}`
);

const gmaulApproachInput = capturePolicyInput(
  withRecentOpponentHit(
    setActorHitpoints(
      runtimeCombat.createRuntimePlayerCombatState({
        localTile: { x: 0, z: 0 },
        opponentTile: { x: 2, z: 0 },
        localLoadoutId: "kodai-robes",
        opponentLoadoutId: "kodai-robes",
        opponentSpecialEnergy: 100,
        seed: 2703
      }),
      "local-player",
      55
    ),
    32
  )
);
assert(
  gmaulApproachInput[gmaulFeatureStart] > 0 && gmaulApproachInput[gmaulFeatureStart + 1] > 0,
  "Gmaul approach window should expose KO features at distance two even before the current weapon shows a spec bar"
);

const frozenGmaulApproachInput = capturePolicyInput(
  freezeOpponent(
    withRecentOpponentHit(
      setActorHitpoints(
        runtimeCombat.createRuntimePlayerCombatState({
          localTile: { x: 0, z: 0 },
          opponentTile: { x: 2, z: 0 },
          localLoadoutId: "kodai-robes",
          opponentLoadoutId: "kodai-robes",
          opponentSpecialEnergy: 100,
          seed: 2704
        }),
        "local-player",
        55
      ),
      32
    )
  )
);
assert(
  frozenGmaulApproachInput.slice(gmaulFeatureStart).every((value) => value === 0),
  "Gmaul approach features should close when the policy actor is frozen out of melee reach"
);

const protectMagicAction = bridge.encodeNhPolicyAction({
  offenceStyle: "ranged",
  defencePrayer: "protect_from_magic",
  movementIntent: "pressure",
  supplyIntent: "none",
  specIntent: "none",
  extendedSupplyAction: false
});
const protectMissilesAction = bridge.encodeNhPolicyAction({
  offenceStyle: "ranged",
  defencePrayer: "protect_from_missiles",
  movementIntent: "pressure",
  supplyIntent: "none",
  specIntent: "none",
  extendedSupplyAction: false
});
const historyPriorPolicy = {
  version: 1,
  counters: { decisions: 0, samples: 0, exploration: 0 },
  actionVisits: [
    { action: protectMagicAction, visits: 1 },
    { action: protectMissilesAction, visits: 1 }
  ],
  weightsByAction: new Map([
    [protectMagicAction, new Map()],
    [protectMissilesAction, new Map()]
  ]),
  weightEntryCount: 0,
  sourceLabel: "test-history-prior"
};
const historyPriorFeatures = Array(bridge.nhPolicyFeatureSize).fill(0);
const setHistoryPriorInput = (index, value) => {
  historyPriorFeatures[policyFeatures.nhPolicyInputFeatureStart + index] = value;
};
setHistoryPriorInput(0, 4 / 12);
setHistoryPriorInput(1, 90 / 99);
setHistoryPriorInput(3, 99 / 99);
setHistoryPriorInput(8, 1);
setHistoryPriorInput(9, 1);
setHistoryPriorInput(33, 1);
const historyMagicObservations = Array.from({ length: 8 }, (_entry, index) => ({
  tick: index,
  targetId: null,
  targetPresent: true,
  distance: 4,
  opponentLikelyStyle: "magic",
  opponentGearStyle: null
}));
const historyPrayerRankings = botPolicy.rankNhPolicyActionsFromFeatures(
  historyPriorPolicy,
  historyPriorFeatures,
  bridge.nhPolicyActionCount,
  undefined,
  historyMagicObservations
);
const historyMagicRanking = historyPrayerRankings.find((ranking) => ranking.action === protectMagicAction);
const historyRangeRanking = historyPrayerRankings.find((ranking) => ranking.action === protectMissilesAction);
assert(
  historyMagicRanking && historyRangeRanking && historyMagicRanking.score > historyRangeRanking.score,
  "history prior should give protect magic a higher score than protect missiles after repeated magic observations"
);
const protectMissilesMagicOffenceAction = bridge.encodeNhPolicyAction({
  offenceStyle: "magic",
  defencePrayer: "protect_from_missiles",
  movementIntent: "pressure",
  supplyIntent: "none",
  specIntent: "none",
  extendedSupplyAction: false
});
const targetFilteredHistoryPolicy = {
  version: 1,
  counters: { decisions: 0, samples: 0, exploration: 0 },
  actionVisits: [
    { action: protectMagicAction, visits: 1 },
    { action: protectMissilesMagicOffenceAction, visits: 1 }
  ],
  weightsByAction: new Map([
    [protectMagicAction, new Map()],
    [protectMissilesMagicOffenceAction, new Map()]
  ]),
  weightEntryCount: 0,
  sourceLabel: "test-history-target-filter"
};
const targetFilteredContext = {
  tick: 9,
  opponent: { id: "current-target", observedInfoKnown: false },
  meleeReachable: false
};
const oldTargetMagicObservations = Array.from({ length: 8 }, (_entry, index) => ({
  tick: index,
  targetId: "old-target",
  targetPresent: true,
  distance: 4,
  opponentLikelyStyle: "magic",
  opponentGearStyle: null
}));
const noHistoryTargetRankings = botPolicy.rankNhPolicyActionsFromFeatures(
  targetFilteredHistoryPolicy,
  historyPriorFeatures,
  bridge.nhPolicyActionCount,
  targetFilteredContext,
  []
);
const noHistoryProtectMagic = noHistoryTargetRankings.find((ranking) => ranking.action === protectMagicAction);
const noHistoryProtectMissiles = noHistoryTargetRankings.find((ranking) => ranking.action === protectMissilesMagicOffenceAction);
const oldTargetHistoryRankings = botPolicy.rankNhPolicyActionsFromFeatures(
  targetFilteredHistoryPolicy,
  historyPriorFeatures,
  bridge.nhPolicyActionCount,
  targetFilteredContext,
  oldTargetMagicObservations
);
const oldTargetProtectMagic = oldTargetHistoryRankings.find((ranking) => ranking.action === protectMagicAction);
const oldTargetProtectMissiles = oldTargetHistoryRankings.find((ranking) => ranking.action === protectMissilesMagicOffenceAction);
assert(
  oldTargetProtectMagic &&
    oldTargetProtectMissiles &&
    noHistoryProtectMagic &&
    noHistoryProtectMissiles &&
    Math.abs(oldTargetProtectMagic.score - noHistoryProtectMagic.score) < 1e-9 &&
    Math.abs(oldTargetProtectMissiles.score - noHistoryProtectMissiles.score) < 1e-9,
  `history prior should ignore observations from a different Java targetIndex: ${JSON.stringify({
    protectMagic: oldTargetProtectMagic?.score,
    protectMissiles: oldTargetProtectMissiles?.score,
    baselineMagic: noHistoryProtectMagic?.score,
    baselineMissiles: noHistoryProtectMissiles?.score
  })}`
);
const currentTargetMagicObservations = oldTargetMagicObservations.map((observation) => ({
  ...observation,
  targetId: "current-target"
}));
const currentTargetHistoryRankings = botPolicy.rankNhPolicyActionsFromFeatures(
  targetFilteredHistoryPolicy,
  historyPriorFeatures,
  bridge.nhPolicyActionCount,
  targetFilteredContext,
  currentTargetMagicObservations
);
const currentTargetProtectMagic = currentTargetHistoryRankings.find((ranking) => ranking.action === protectMagicAction);
const currentTargetProtectMissiles = currentTargetHistoryRankings.find(
  (ranking) => ranking.action === protectMissilesMagicOffenceAction
);
assert(
  currentTargetProtectMagic &&
    currentTargetProtectMissiles &&
    noHistoryProtectMagic &&
    currentTargetProtectMagic.score > noHistoryProtectMagic.score &&
    currentTargetProtectMagic.score > currentTargetProtectMissiles.score,
  `history prior should still apply observations from the same Java targetIndex: ${JSON.stringify({
    protectMagic: currentTargetProtectMagic?.score,
    protectMissiles: currentTargetProtectMissiles?.score,
    baselineMagic: noHistoryProtectMagic?.score
  })}`
);

const offenceMagicAction = bridge.encodeNhPolicyAction({
  offenceStyle: "magic",
  defencePrayer: "protect_from_magic",
  movementIntent: "pressure",
  supplyIntent: "none",
  specIntent: "none",
  extendedSupplyAction: false
});
const offenceRangedAction = bridge.encodeNhPolicyAction({
  offenceStyle: "ranged",
  defencePrayer: "protect_from_magic",
  movementIntent: "pressure",
  supplyIntent: "none",
  specIntent: "none",
  extendedSupplyAction: false
});
const offenceWeaknessPolicy = {
  version: 1,
  counters: { decisions: 0, samples: 0, exploration: 0 },
  actionVisits: [
    { action: offenceMagicAction, visits: 1 },
    { action: offenceRangedAction, visits: 1 }
  ],
  weightsByAction: new Map([
    [offenceMagicAction, new Map()],
    [offenceRangedAction, new Map()]
  ]),
  weightEntryCount: 0,
  sourceLabel: "test-offence-weakness-prior"
};
function createOffenceWeaknessFeatures(opponentProtectMagic = false) {
  const features = Array(bridge.nhPolicyFeatureSize).fill(0);
  const setInput = (index, value) => {
    features[policyFeatures.nhPolicyInputFeatureStart + index] = value;
  };
  setInput(0, 4 / 12);
  setInput(1, 99 / 99);
  setInput(3, 99 / 99);
  setInput(8, 1);
  setInput(9, 1);
  setInput(33, 1);
  if (opponentProtectMagic) {
    setInput(52, 1);
  }
  return features;
}
const bandosDefenderContext = {
  tick: 1,
  meleeReachable: false,
  opponent: {
    equipment: {
      body: { itemId: 11832, name: "Bandos chestplate" },
      legs: { itemId: 11834, name: "Bandos tassets" }
    }
  },
  visibleStyleEvs: [
    { style: "magic", expectedDamage: 12 },
    { style: "ranged", expectedDamage: 12 },
    { style: "slash", expectedDamage: 12 }
  ]
};
const weaknessRankings = botPolicy.rankNhPolicyActionsFromFeatures(
  offenceWeaknessPolicy,
  createOffenceWeaknessFeatures(false),
  bridge.nhPolicyActionCount,
  bandosDefenderContext
);
const unprotectedMagicScore = weaknessRankings.find((ranking) => ranking.action === offenceMagicAction)?.score ?? Number.NEGATIVE_INFINITY;
const unprotectedRangedScore = weaknessRankings.find((ranking) => ranking.action === offenceRangedAction)?.score ?? Number.NEGATIVE_INFINITY;
assert(
  unprotectedMagicScore > unprotectedRangedScore,
  "offence gear weakness prior should prefer magic into Bandos-style low magic defence when visible EV is tied"
);
const protectedWeaknessRankings = botPolicy.rankNhPolicyActionsFromFeatures(
  offenceWeaknessPolicy,
  createOffenceWeaknessFeatures(true),
  bridge.nhPolicyActionCount,
  bandosDefenderContext
);
const protectedMagicScore = protectedWeaknessRankings.find((ranking) => ranking.action === offenceMagicAction)?.score ?? Number.POSITIVE_INFINITY;
assert(
  protectedMagicScore < unprotectedMagicScore,
  "offence gear weakness prior should penalize attacking into the opponent's protection prayer"
);
const selfPlayBridgeStats = Object.fromEntries(
  ["attack", "strength", "defence", "ranged", "magic", "hitpoints", "prayer"].map((stat) => [stat, { current: 99, fixed: 99 }])
);
const selfPlayBridgeContext = (rangedCandidateEquipment) => ({
  tick: 1,
  meleeReachable: false,
  self: {
    tile: { x: 0, y: 0, plane: 0 },
    stats: selfPlayBridgeStats,
    candidateEquipmentByStyle: {
      magic: loadouts.nhLoadouts["kodai-robes"].equipment,
      ranged: rangedCandidateEquipment,
      slash: loadouts.nhLoadouts["tentacle-bandos"].equipment
    },
    strippedEquipmentSlots: []
  },
  opponent: {
    tile: { x: 4, y: 0, plane: 0 },
    equipment: {
      body: { itemId: 11832, name: "Bandos chestplate" },
      legs: { itemId: 11834, name: "Bandos tassets" }
    },
    activePrayers: [],
    lastOffenceStyle: "ranged",
    observedInfoKnown: true
  }
});
const bridgeEvFullRangedCandidate = botPolicy.rankNhPolicyActionsFromFeatures(
  offenceWeaknessPolicy,
  createOffenceWeaknessFeatures(false),
  bridge.nhPolicyActionCount,
  selfPlayBridgeContext(loadouts.nhLoadouts["acb-hides"].equipment)
);
const bridgeEvEmptyRangedCandidate = botPolicy.rankNhPolicyActionsFromFeatures(
  offenceWeaknessPolicy,
  createOffenceWeaknessFeatures(false),
  bridge.nhPolicyActionCount,
  selfPlayBridgeContext({})
);
const bridgeFullRangedScore = bridgeEvFullRangedCandidate.find((ranking) => ranking.action === offenceRangedAction)?.score;
const bridgeEmptyRangedScore = bridgeEvEmptyRangedCandidate.find((ranking) => ranking.action === offenceRangedAction)?.score;
assert(
  bridgeFullRangedScore !== undefined &&
    bridgeEmptyRangedScore !== undefined &&
    Math.abs(bridgeFullRangedScore - bridgeEmptyRangedScore) < 1e-9,
  `policy visibleStyleEv should match NhStakerSelfPlayManager bridge priors instead of clientOffenceEv candidate gear scoring: ${bridgeFullRangedScore}/${bridgeEmptyRangedScore}`
);
const fullRangedClientEv = clientOffenceEv.nhClientOffenceEv(
  selfPlayBridgeContext(loadouts.nhLoadouts["acb-hides"].equipment),
  "ranged"
);
const emptyRangedClientEv = clientOffenceEv.nhClientOffenceEv(selfPlayBridgeContext({}), "ranged");
assert(
  fullRangedClientEv > emptyRangedClientEv,
  `runtime clientOffenceEv should keep NhStakerBot.clientOffenceEv candidate-gear bonus scoring, got full=${fullRangedClientEv} empty=${emptyRangedClientEv}`
);
const rangedGearThreatContext = {
  ...selfPlayBridgeContext(loadouts.nhLoadouts["acb-hides"].equipment),
  opponent: {
    ...selfPlayBridgeContext(loadouts.nhLoadouts["acb-hides"].equipment).opponent,
    lastOffenceStyle: null,
    lastVisibleOpponentStyle: "ranged"
  }
};
const unknownThreatContext = {
  ...rangedGearThreatContext,
  opponent: {
    ...rangedGearThreatContext.opponent,
    lastVisibleOpponentStyle: null
  }
};
const rangedGearThreatEv = clientOffenceEv.nhClientOffenceEv(rangedGearThreatContext, "ranged");
const unknownThreatEv = clientOffenceEv.nhClientOffenceEv(unknownThreatContext, "ranged");
assert(
  rangedGearThreatEv > unknownThreatEv,
  `runtime clientOffenceEv tank factor should fall back to delayed visible gear style like NhStakerBot.resolveThreatStyle(), got rangedGear=${rangedGearThreatEv} unknown=${unknownThreatEv}`
);

const noWeightFullActionPolicy = {
  version: 1,
  counters: { decisions: 0, samples: 0, exploration: 0 },
  actionVisits: [],
  weightsByAction: new Map(),
  weightEntryCount: 0,
  sourceLabel: "test-full-action-space"
};
const noWeightFeatures = Array(bridge.nhPolicyFeatureSize).fill(0);
const setNoWeightInput = (index, value) => {
  noWeightFeatures[policyFeatures.nhPolicyInputFeatureStart + index] = value;
};
setNoWeightInput(0, 5 / 12);
setNoWeightInput(1, 90 / 99);
setNoWeightInput(3, 99 / 99);
setNoWeightInput(8, 1);
setNoWeightInput(9, 1);
setNoWeightInput(33, 1);
setNoWeightInput(44, 1);
const noWeightRankings = botPolicy.rankNhPolicyActionsFromFeatures(noWeightFullActionPolicy, noWeightFeatures, 5);
assert(
  noWeightRankings.length > 0 && noWeightRankings[0].decoded.defencePrayer === "protect_from_missiles",
  "policy ranker should evaluate no-weight valid actions through Java-style priors instead of falling back to action zero"
);
assert(
  noWeightRankings.some((ranking) => !noWeightFullActionPolicy.weightsByAction.has(ranking.action)),
  "policy rankings should include valid actions even when the policy file has no weight row for them"
);
let rejectedStalePolicyVersion = false;
try {
  botPolicy.parseNhPolicyTsv("version\t10\ncounters\t0\t0\t0", "test-stale-policy-version");
} catch (error) {
  rejectedStalePolicyVersion = String(error).includes("does not match expected version 11");
}
assert(
  rejectedStalePolicyVersion,
  "policy parser should reject stale TSV versions like NhStakerSelfPlayManager.loadFromDisk"
);
const reheatedLoadedPolicy = botPolicy.parseNhPolicyTsv(
  [
    "version\t11",
    "counters\t1000000\t-5\t200",
    `act\t${protectMagicAction}\t1000`
  ].join("\n"),
  "test-loaded-policy-reheat"
);
assert(
  reheatedLoadedPolicy.counters.decisions === 350000 &&
    reheatedLoadedPolicy.counters.samples === 0 &&
    reheatedLoadedPolicy.counters.exploration === 70,
  `loaded policy counters should follow Java reheat normalization, got ${JSON.stringify(reheatedLoadedPolicy.counters)}`
);
assert(
  reheatedLoadedPolicy.actionVisits.find((entry) => entry.action === protectMagicAction)?.visits === 350,
  `loaded policy visits should be reheated after parsing, got ${JSON.stringify(reheatedLoadedPolicy.actionVisits)}`
);
const rebalancedLoadedAction = bridge.encodeNhPolicyAction({
  offenceStyle: "magic",
  defencePrayer: "redemption",
  movementIntent: "pressure",
  supplyIntent: "triple_eat",
  specIntent: "use_special_double",
  extendedSupplyAction: false
});
const rebalancedLoadedScale = 0.62 * 0.56 * 0.7;
const rebalancedLoadedPolicy = botPolicy.parseNhPolicyTsv(
  [
    "version\t11",
    "counters\t0\t0\t0",
    `act\t${rebalancedLoadedAction}\t100`,
    `ow\t${rebalancedLoadedAction}\t5\t10`,
    `ow\t${rebalancedLoadedAction}\t6\t-10`
  ].join("\n"),
  "test-loaded-policy-rebalance"
);
const rebalancedLoadedVisits = rebalancedLoadedPolicy.actionVisits.find(
  (entry) => entry.action === rebalancedLoadedAction
)?.visits;
const rebalancedLoadedWeights = rebalancedLoadedPolicy.weightsByAction.get(rebalancedLoadedAction);
assert(
  rebalancedLoadedVisits === Math.round(100 * rebalancedLoadedScale * rebalancedLoadedScale),
  `loaded policy visits should be Java-rebalanced before TS inference, got ${rebalancedLoadedVisits}`
);
assert(
  rebalancedLoadedWeights &&
    Math.abs((rebalancedLoadedWeights.get(5) ?? 0) - 10 * rebalancedLoadedScale) < 1e-12 &&
    Math.abs((rebalancedLoadedWeights.get(6) ?? 0) + 10 * rebalancedLoadedScale) < 1e-12,
  `loaded policy weights should be Java-rebalanced before TS inference, got ${JSON.stringify([
    rebalancedLoadedWeights?.get(5),
    rebalancedLoadedWeights?.get(6)
  ])}`
);
const smiteAllowedAction = bridge.encodeNhPolicyAction({
  offenceStyle: "ranged",
  defencePrayer: "smite",
  movementIntent: "pressure",
  supplyIntent: "none",
  specIntent: "none",
  extendedSupplyAction: false
});
const smiteAllowedFeatures = Array(bridge.nhPolicyFeatureSize).fill(0);
const setSmiteAllowedInput = (index, value) => {
  smiteAllowedFeatures[policyFeatures.nhPolicyInputFeatureStart + index] = value;
};
setSmiteAllowedInput(0, 5 / 12);
setSmiteAllowedInput(1, 90 / 99);
setSmiteAllowedInput(3, 99 / 99);
setSmiteAllowedInput(8, 1);
setSmiteAllowedInput(9, 1);
setSmiteAllowedInput(33, 1);
const smiteLiveRankings = botPolicy.rankNhPolicyActionsFromFeatures(
  noWeightFullActionPolicy,
  smiteAllowedFeatures,
  bridge.nhPolicyActionCount
);
assert(
  !smiteLiveRankings.some((ranking) => ranking.action === smiteAllowedAction),
  "policy ranker should reject Smite during live inference because Java isActionAllowed(..., trainingMode=false) rejects it before the HP/prayer gate"
);
const smiteBlockedFeatures = [...smiteAllowedFeatures];
smiteBlockedFeatures[policyFeatures.nhPolicyInputFeatureStart + 1] = 54 / 99;
const smiteBlockedRankings = botPolicy.rankNhPolicyActionsFromFeatures(
  noWeightFullActionPolicy,
  smiteBlockedFeatures,
  bridge.nhPolicyActionCount
);
assert(
  !smiteBlockedRankings.some((ranking) => ranking.action === smiteAllowedAction),
  "policy ranker should reject Smite below Java's 55 percent HP gate as a consequence of the broader live-inference Smite block"
);
const noTargetTieFeatures = Array(bridge.nhPolicyFeatureSize).fill(0);
const deterministicTieRanking = botPolicy.rankNhPolicyActionsFromFeatures(
  noWeightFullActionPolicy,
  noTargetTieFeatures,
  1
)[0];
const javaTieRanking = botPolicy.rankNhPolicyActionsFromFeatures(
  noWeightFullActionPolicy,
  noTargetTieFeatures,
  1,
  undefined,
  [],
  () => true
)[0];
assert(
  deterministicTieRanking &&
    javaTieRanking &&
    deterministicTieRanking.score === javaTieRanking.score &&
    javaTieRanking.action > deterministicTieRanking.action,
  `Java equal-score tie breaker should be able to promote later equal valid actions, got deterministic=${JSON.stringify(deterministicTieRanking)} java=${JSON.stringify(javaTieRanking)}`
);

const regearIdleAction = bridge.encodeNhPolicyAction({
  offenceStyle: "ranged",
  defencePrayer: "protect_from_magic",
  movementIntent: "pressure",
  supplyIntent: "regear_style",
  specIntent: "none",
  extendedSupplyAction: true
});
const noneIdleAction = bridge.encodeNhPolicyAction({
  offenceStyle: "ranged",
  defencePrayer: "protect_from_magic",
  movementIntent: "pressure",
  supplyIntent: "none",
  specIntent: "none",
  extendedSupplyAction: false
});
const regearIdlePriorPolicy = {
  version: 1,
  counters: { decisions: 0, samples: 0, exploration: 0 },
  actionVisits: [
    { action: regearIdleAction, visits: 1 },
    { action: noneIdleAction, visits: 1 }
  ],
  weightsByAction: new Map([
    [regearIdleAction, new Map()],
    [noneIdleAction, new Map()]
  ]),
  weightEntryCount: 0,
  sourceLabel: "test-regear-idle-prior"
};
const regearIdleFeatures = Array(bridge.nhPolicyFeatureSize).fill(0);
const setRegearIdleInput = (index, value) => {
  regearIdleFeatures[policyFeatures.nhPolicyInputFeatureStart + index] = value;
};
setRegearIdleInput(0, 4 / 12);
setRegearIdleInput(1, 90 / 99);
setRegearIdleInput(3, 99 / 99);
setRegearIdleInput(4, 1 / 28);
setRegearIdleInput(8, 1);
setRegearIdleInput(9, 1);
setRegearIdleInput(33, 1);
setRegearIdleInput(38, 1);
const regearIdleRankings = botPolicy.rankNhPolicyActionsFromFeatures(
  regearIdlePriorPolicy,
  regearIdleFeatures,
  bridge.nhPolicyActionCount
);
const regearIdleScore = regearIdleRankings.find((ranking) => ranking.action === regearIdleAction)?.score;
const noneIdleScore = regearIdleRankings.find((ranking) => ranking.action === noneIdleAction)?.score;
assert(
  regearIdleScore !== undefined &&
    noneIdleScore !== undefined &&
    Math.abs((regearIdleScore - noneIdleScore) + 0.35) < 1e-9,
  `regear idle prior should match Java REGEAR_STYLE_IDLE_PRIOR_PENALTY=0.35, got regear=${regearIdleScore} none=${noneIdleScore}`
);

console.log(
  `verified NH policy action coverage: ${bridge.nhPolicyActionCount} actions, ` +
  `${bridge.nhMovementIntents.length} movement intents, ` +
  `${bridge.nhSupplyIntents.length + bridge.nhExtraSupplyIntents.length} supply intents, ` +
  `${bridge.nhSpecIntents.length} spec intents, ${visitedActions} fixture action rows, ditch/projectile movement gates`
);
