import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

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
    const module = { exports: JSON.parse(readFileSync(resolvedPath, "utf8")) };
    moduleCache.set(resolvedPath, module);
    return module.exports;
  }

  const source = readFileSync(resolvedPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      resolveJsonModule: true,
      target: ts.ScriptTarget.ES2020,
      strict: true
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
      // Continue through extension fallbacks.
    }
  }
  throw new Error(`Cannot resolve module ${candidatePath}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertAlmost(name, actual, expected, tolerance = 1e-6) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${name} mismatch: actual=${actual} expected=${expected}`);
  }
}

const { assertValidClientViewTrace } = loadTsModule("src/sim/clientView.ts");
const { createDefaultNhDuelClientViewTrace } = loadTsModule("src/sim/nh/duel.ts");
const { clientViewTraceToRuntimeReplay } = loadTsModule("src/render/clientViewReplay.ts");
const {
  nhRenderCycleToProjectileClientCycle,
  sampleNhProjectileMotion
} = loadTsModule("src/render/nhProjectileMotion.ts");
const fixtureTrace = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "sim", "client-view-two-actor-duel.json"), "utf8"));
const projectileDefs = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "projectiles.json"), "utf8"));
const spotanimDefs = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "spotanims.json"), "utf8"));
const glbManifest = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "assets", "models", "cache-glb-manifest.json"), "utf8"));
const spotanimArtifacts = new Map(
  glbManifest.exports
    .filter((entry) => Number.isInteger(entry.spotanimId))
    .map((entry) => [
      entry.spotanimId,
      {
        label: entry.label,
        artifactUrl: entry.output.replace(/^fixtures\//, ""),
        meshMetadataUrl: entry.meshMetadata.replace(/^fixtures\//, "")
      }
    ])
);
const projectileDefinitions = new Map(
  projectileDefs.projectiles.map((projectile) => [
    projectile.id,
    {
      ...projectile,
      artifactUrl: spotanimArtifacts.get(projectile.projectileGfxId)?.artifactUrl,
      impactArtifactUrl: spotanimArtifacts.get(projectile.impactGfxId)?.artifactUrl
    }
  ])
);
const spotanimDefinitions = new Map(
  Object.values(spotanimDefs).map((spotanim) => [
    spotanim.id,
    {
      ...spotanim,
      ...spotanimArtifacts.get(spotanim.id)
    }
  ])
);
const definitionByGfx = new Map([...projectileDefinitions.values()].map((projectile) => [projectile.projectileGfxId, projectile]));
const dragonBoltDef = definitionByGfx.get(1468);
assert(dragonBoltDef, "exported projectile definitions should include Nh Projectile.DRAGON_BOLT gfx 1468");
assert(dragonBoltDef.id === "dragon_bolt", "dragon bolt projectile definition should use the dragon_bolt runtime id");
assert(
  dragonBoltDef.artifactUrl === "render/spotanims/dragon_bolt_projectile.glb",
  "dragon bolt projectile should render from the cache-exported dragon bolt GLB"
);
const acbSpecialDef = definitionByGfx.get(301);
assert(acbSpecialDef, "exported projectile definitions should include ArmadylCrossbow.java projectile gfx 301");
assert(acbSpecialDef.id === "armadyl_crossbow_special", "ACB special projectile definition should use the runtime Armadyl crossbow special id");
assert(
  acbSpecialDef.artifactUrl === "render/spotanims/acb_special_projectile.glb",
  "ACB special projectile should render from the cache-exported Armadyl crossbow special GLB"
);
const bloodBlitzDef = definitionByGfx.get(374);
assert(bloodBlitzDef, "exported projectile definitions should include BloodBlitz.java projectile gfx 374");
assert(bloodBlitzDef.id === "blood_blitz_projectile", "Blood Blitz projectile definition should use the runtime blood_blitz_projectile id");
assert(
  bloodBlitzDef.artifactUrl === "render/spotanims/blood_blitz_projectile.glb" &&
    bloodBlitzDef.impactArtifactUrl === "render/spotanims/blood_blitz_hit.glb",
  "Blood Blitz projectile and impact should render from cache-exported GLBs"
);

assertValidClientViewTrace(fixtureTrace);

const generatedTrace = createDefaultNhDuelClientViewTrace({ ticks: 20, seed: 7 });
assertValidClientViewTrace(generatedTrace);

const generatedProjectiles = generatedTrace.events.filter((event) => event.kind === "projectile");
assert(generatedProjectiles.length > 0, "generated duel should emit projectile packets");

const magicPacket = fixtureTrace.events.find((event) => event.kind === "projectile" && event.projectileId === 368);
assert(magicPacket, "source-backed projectile fixture should include an ice barrage projectile");
assert(magicPacket.targetIndex === -2 || magicPacket.targetIndex === -1, "magic projectile should target a player index");
assert(magicPacket.delayCycles === 51, "ice barrage delay must match Nh server projectile");
assert(magicPacket.curve === 16, "ice barrage curve must match Nh server projectile");
assert(magicPacket.offset === 64, "ice barrage offset/idk must match Nh server projectile");
assert(magicPacket.skipTravel === true, "ice barrage should preserve skipTravel");
assert(
  magicPacket.startTile.x === magicPacket.targetTile.x && magicPacket.startTile.y === magicPacket.targetTile.y,
  "skipTravel packet should use the target tile as the packet source"
);
assert(magicPacket.durationCycles >= magicPacket.delayCycles, "projectile duration must be a client cycle end, not a travel length shortcut");

const fixtureReplay = clientViewTraceToRuntimeReplay(fixtureTrace, { projectileDefinitions, spotanimDefinitions });
const barrageEvent = fixtureReplay.events.find((event) => event.kind === "projectile" && event.projectile?.gfxId === 368);
assert(barrageEvent, "fixture replay should carry projectile lifecycle data");
assert(barrageEvent.projectileId === "ice_barrage_projectile", "replay projectile id should come from exported projectile definition");
assert(
  barrageEvent.artifactUrl === "render/spotanims/ice_barrage_projectile.glb",
  "replay projectile artifact should come from cache GLB manifest"
);
assert(barrageEvent.projectile.cycleStart === barrageEvent.projectile.packetCycle + 51, "cycleStart should be packet cycle plus delay");
assert(barrageEvent.projectile.cycleEnd === barrageEvent.projectile.packetCycle + 76, "cycleEnd should be packet cycle plus duration");
assert(barrageEvent.projectile.startDistanceOffset === 64, "runtime lifecycle should preserve client Projectile startHeight/offset");

const barrageDef = definitionByGfx.get(368);
const startClientCycle = nhRenderCycleToProjectileClientCycle(barrageEvent, barrageEvent.startCycle, barrageEvent.projectile);
assertAlmost("mapped barrage start cycle", startClientCycle, barrageEvent.projectile.cycleStart);
const startSample = sampleNhProjectileMotion(barrageEvent, barrageEvent.startCycle, barrageDef);
assertAlmost("barrage source x", startSample.x, barrageEvent.projectile.destinationTile.x);
assertAlmost("barrage source y", startSample.y, barrageEvent.projectile.destinationTile.z);
assertAlmost("barrage source z", startSample.z, (43 * 4) / 256);

const boltEvent = fixtureReplay.events.find((event) => event.kind === "projectile" && event.projectile?.gfxId === 27);
assert(boltEvent, "fixture replay should carry bolt projectile lifecycle data");
assert(boltEvent.projectileId === "standard_bolt", "bolt replay id should come from exported projectile definition");
assert(boltEvent.artifactUrl === "render/spotanims/bolt_projectile.glb", "bolt artifact should come from cache GLB manifest");
assert(boltEvent.projectile.cycleStart === boltEvent.projectile.packetCycle + 41, "bolt cycleStart should preserve packet delay");
assert(boltEvent.projectile.cycleEnd === boltEvent.projectile.packetCycle + 61, "bolt cycleEnd should preserve packet duration");
const boltDef = definitionByGfx.get(27);
const boltStart = sampleNhProjectileMotion(boltEvent, boltEvent.startCycle, boltDef);
const boltEnd = sampleNhProjectileMotion(boltEvent, boltEvent.endCycle, boltDef);
assert(boltStart.x < boltEnd.x, "bolt projectile should move toward its target over the render window");
assertAlmost("bolt start height", boltStart.z, (38 * 4) / 256);

const spotanimTrace = {
  ...fixtureTrace,
  fixtureId: "spotanim-artifact-source-v1",
  sourceAnchorIds: [...new Set([...fixtureTrace.sourceAnchorIds, "client-spotanim-sequence-contract"])],
  ticks: fixtureTrace.ticks.map((tick, index) => ({
    ...tick,
    eventIds: index === 0 ? ["manual-gmaul-spotanim"] : []
  })),
  events: [
    {
      id: "manual-gmaul-spotanim",
      kind: "spotanim",
      observedTick: 0,
      visibleWindow: { firstTick: 0, lastTick: 3 },
      actorId: "self",
      spotanimId: 340
    }
  ]
};
assertValidClientViewTrace(spotanimTrace);
const spotanimReplay = clientViewTraceToRuntimeReplay(spotanimTrace, { projectileDefinitions, spotanimDefinitions });
const gmaulSpotanim = spotanimReplay.events.find((event) => event.kind === "spotanim" && event.spotanimId === 340);
assert(gmaulSpotanim, "generated replay should carry gmaul spotanim event");
assert(gmaulSpotanim.artifactUrl === "render/spotanims/gmaul_special.glb", "spotanim artifact should come from cache GLB manifest");
assert(gmaulSpotanim.label === "Granite maul special spotanim", "spotanim label should come from cache GLB manifest");

const replaySource = readFileSync(path.join(projectRoot, "src", "render", "clientViewReplay.ts"), "utf8");
assert(!replaySource.includes("const projectileMap"), "client replay must not hardcode projectile artifact maps");
assert(!replaySource.includes("const spotanimMap"), "client replay must not hardcode spotanim artifact maps");

console.log(
  JSON.stringify(
    {
      ok: true,
      generatedProjectiles: generatedProjectiles.length,
      magicPacket: {
        delayCycles: magicPacket.delayCycles,
        durationCycles: magicPacket.durationCycles,
        curve: magicPacket.curve,
        offset: magicPacket.offset,
        skipTravel: magicPacket.skipTravel
      },
      barrageLifecycle: barrageEvent.projectile,
      boltDeltaX: boltEnd.x - boltStart.x,
      artifacts: {
        barrage: barrageEvent.artifactUrl,
        bolt: boltEvent.artifactUrl,
        gmaul: gmaulSpotanim.artifactUrl
      }
    },
    null,
    2
  )
);
