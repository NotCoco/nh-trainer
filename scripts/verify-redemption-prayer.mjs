import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const sourceRoot = path.join(workspaceRoot, "kronos-osrs-184-master", "kronos-osrs-184-master", "Kronos-master");
const serverRuinRoot = path.join(sourceRoot, "kronos-server", "src", "main", "java", "io", "ruin");
const moduleCache = new Map();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readProject(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function readServer(relativePath) {
  return readFileSync(path.join(serverRuinRoot, relativePath), "utf8");
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

function resolveRelativeModule(fromPath, request) {
  const base = path.resolve(path.dirname(fromPath), request);
  const candidates = request.endsWith(".ts") || request.endsWith(".tsx") || request.endsWith(".json")
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, `${base}.json`, path.join(base, "index.ts")];
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error(`cannot resolve ${request} from ${fromPath}`);
  }
  return match;
}

const kronosRedemptionSource = readServer("model/skills/prayer/Redemption.java");
const kronosPrayerSource = readServer("model/skills/prayer/Prayer.java");
const runtimeSource = readProject("src/sim/runtimePlayerCombat.ts");
const prayersSource = readProject("src/sim/prayer/prayers.ts");
const duelSource = readProject("src/sim/nh/duel.ts");
const viewerSource = readProject("src/ui/RuntimeSceneViewer.tsx");
const assetSource = readProject("src/assets/index.ts");
const spotanims = JSON.parse(readProject("fixtures/assets/defs/spotanims.json"));
const manifest = JSON.parse(readProject("fixtures/assets/models/cache-glb-manifest.json"));
const packageSource = readProject("package.json");

for (const sourceAnchor of [
  "player.getHp() <= player.getMaxHp() * 0.10",
  "!player.getCombat().isDead()",
  "player.getPrayer().isActive(Prayer.REDEMPTION)",
  "player.getPrayer().drain(99)",
  "player.getPrayer().deactivateAll()",
  "player.graphics(436, 0, 0)",
  "fixedLevel * 0.25"
]) {
  assert(kronosRedemptionSource.includes(sourceAnchor), `Kronos Redemption source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "REDEMPTION(4120, 2680",
  "p.level = 49",
  "p.drain = 6",
  "p.headIcon = 5",
  "new Prayer[]{PROTECT_FROM_MAGIC, PROTECT_FROM_MISSILES, PROTECT_FROM_MELEE, RETRIBUTION, REDEMPTION, SMITE}"
]) {
  assert(kronosPrayerSource.includes(sourceAnchor), `Kronos Prayer source missing ${sourceAnchor}`);
}

for (const implementationAnchor of [
  "export type OverheadPrayerId",
  "activeOverheadPrayer",
  "activePrayers.includes(\"redemption\")",
  "definePrayer(\"redemption\", 49, 6, \"overhead\", {}, 5)"
]) {
  assert(prayersSource.includes(implementationAnchor), `Prayer implementation missing ${implementationAnchor}`);
}

for (const implementationAnchor of [
  "runtimePlayerCombatRedemptionSpotanimId = 436",
  'runtimePlayerCombatRedemptionSpotanimArtifactUrl = "render/spotanims/redemption_proc.glb"',
  "runtimePlayerCombatRedemptionPrayerDrain = 99",
  "runtimePlayerCombatRedemptionThresholdFraction = 0.1",
  "runtimePlayerCombatRedemptionPrayerHealFraction = 0.25",
  "redemptionProc",
  "nextHitpoints <= defender.maxHitpoints * runtimePlayerCombatRedemptionThresholdFraction",
  "Math.trunc(defender.maxPrayerPoints * runtimePlayerCombatRedemptionPrayerHealFraction)",
  "Math.max(0, resetDefender.prayerPoints - runtimePlayerCombatRedemptionPrayerDrain)",
  "activePrayers: redemptionProc ? [] : resetDefender.activePrayers",
  "spotanimId: runtimePlayerCombatRedemptionSpotanimId",
  "artifactUrl: runtimePlayerCombatRedemptionSpotanimArtifactUrl"
]) {
  assert(runtimeSource.includes(implementationAnchor), `Runtime Redemption implementation missing ${implementationAnchor}`);
}

assert(duelSource.includes("activeOverheadPrayer(prayers) ?? \"none\""), "NH duel traces should serialize Redemption overheads.");
assert(viewerSource.includes("runtimePlayerCombatActiveOverheadPrayer(actor)"), "Runtime renderer should draw Redemption overheads.");
assert(assetSource.includes("fixtures/render/spotanims/redemption_proc.glb"), "Asset index should require the Redemption proc GLB.");
assert(packageSource.includes('"verify:redemption-prayer"'), "package.json must expose verify:redemption-prayer.");

assert(existsSync(path.join(projectRoot, "fixtures", "render", "spotanims", "redemption_proc.glb")), "redemption_proc.glb should exist.");
assert(existsSync(path.join(projectRoot, "fixtures", "render", "spotanims", "redemption_proc.mesh.json")), "redemption_proc.mesh.json should exist.");
assert(spotanims["436"]?.id === 436, "spotanim 436 should be present in spotanims.json.");
assert(spotanims["436"]?.modelId === 9249, "spotanim 436 should use imported cache model 9249.");
assert(spotanims["436"]?.animationId === 2596, "spotanim 436 should use imported cache sequence 2596.");
assert(
  manifest.exports.some((entry) => entry.output === "fixtures/render/spotanims/redemption_proc.glb" && entry.spotanimId === 436),
  "cache GLB manifest should include redemption_proc.glb with spotanimId 436."
);

const runtimeCombat = loadTsModule("src/sim/runtimePlayerCombat.ts");
const prayers = loadTsModule("src/sim/prayer/prayers.ts");

assert(prayers.activeOverheadPrayer(["redemption"]) === "redemption", "activeOverheadPrayer should expose Redemption.");

const localTile = { x: 0, z: 0 };
const opponentTile = { x: 1, z: 0 };
const baseState = runtimeCombat.createRuntimePlayerCombatState({
  localTile,
  opponentTile,
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "kodai-robes",
  opponentPrayers: ["redemption"],
  opponentPrayerPoints: { current: 99, fixed: 99 }
});

const redemptionState = {
  ...baseState,
  actors: {
    ...baseState.actors,
    opponent: {
      ...baseState.actors.opponent,
      hitpoints: 20,
      activePrayers: ["redemption"],
      prayerPoints: 99,
      maxPrayerPoints: 99
    }
  },
  queuedHits: [
    {
      id: "verify-redemption",
      dueTick: baseState.tick,
      attackerId: "local-player",
      defenderId: "opponent",
      style: "ranged",
      attackType: "RAPID_RANGED",
      attackSetIndex: 0,
      damage: 15,
      rawDamage: 15,
      maxDamage: 15,
      hitChance: 1
    }
  ]
};

const redemptionResult = runtimeCombat.advanceRuntimePlayerCombat(redemptionState, {
  tiles: {
    "local-player": localTile,
    opponent: opponentTile
  }
});
const redemptionActor = redemptionResult.state.actors.opponent;
const redemptionSpotanim = redemptionResult.state.events.find(
  (event) => event.kind === "spotanim" && event.actorId === "opponent" && event.spotanimId === 436
);
const redemptionHitsplat = redemptionResult.state.events.find(
  (event) => event.kind === "hitsplat" && event.targetActorId === "opponent"
);

assert(redemptionActor.hitpoints === 29, `Redemption should heal 20-15+floor(99*0.25)=29 HP, got ${redemptionActor.hitpoints}.`);
assert(redemptionActor.prayerPoints === 0, `Redemption should drain 99 prayer points, got ${redemptionActor.prayerPoints}.`);
assert(redemptionActor.activePrayers.length === 0, "Redemption should deactivate all prayers after proccing.");
assert(redemptionSpotanim?.artifactUrl === "render/spotanims/redemption_proc.glb", "Redemption should emit gfx 436 with the cache GLB.");
assert(redemptionHitsplat?.damage === 15, "Redemption should not change the incoming hitsplat damage.");
assert(redemptionHitsplat?.nextHitpoints === 29, "Redemption health overlay should reflect the post-proc HP state.");

const lethalState = {
  ...redemptionState,
  actors: {
    ...redemptionState.actors,
    opponent: {
      ...redemptionState.actors.opponent,
      hitpoints: 20,
      activePrayers: ["redemption"],
      prayerPoints: 99
    }
  },
  queuedHits: [
    {
      ...redemptionState.queuedHits[0],
      id: "verify-redemption-lethal",
      damage: 25,
      rawDamage: 25,
      maxDamage: 25
    }
  ],
  events: []
};
const lethalResult = runtimeCombat.advanceRuntimePlayerCombat(lethalState, {
  tiles: {
    "local-player": localTile,
    opponent: opponentTile
  }
});
assert(lethalResult.state.actors.opponent.hitpoints === 0, "Redemption should not save a lethal hit.");
assert(
  !lethalResult.state.events.some((event) => event.kind === "spotanim" && event.spotanimId === 436),
  "Redemption gfx should not play for a lethal hit."
);

console.log("Redemption verifier passed: Kronos anchors, overhead rendering, gfx 436 asset, prayer drain, prayer clear, capped heal, and lethal-hit behavior are covered.");
