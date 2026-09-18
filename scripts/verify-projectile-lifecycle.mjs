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
  sampleNhProjectileLifecycle,
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
const webweaverDef = definitionByGfx.get(1574);
assert(webweaverDef, "exported projectile definitions should include RangedWeapon.WEBWEAVER_BOW / Projectile.arrow(1574)");
assert(webweaverDef.id === "webweaver_arrow", "normal Webweaver attacks should resolve the normal arrow definition");
assert(
  webweaverDef.artifactUrl === "render/spotanims/webweaver_arrow.glb",
  "normal Webweaver arrows should resolve the exported gfx 1574 model"
);
assert(
  webweaverDef.startHeight === 40 && webweaverDef.endHeight === 36 &&
    webweaverDef.delayCycles === 41 && webweaverDef.durationStartCycles === 51 &&
    webweaverDef.durationIncrementCycles === 5 && webweaverDef.curve === 15 &&
    webweaverDef.offset === 11 && !webweaverDef.skipTravel,
  "normal Webweaver arrow motion must retain Java Projectile.arrow regular parameters"
);
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
const boltPreEnd = sampleNhProjectileMotion(boltEvent, boltEvent.endCycle - 1, boltDef);
assert(boltStart.x < boltPreEnd.x, "bolt projectile should move toward its target over the render window");
assert(boltEnd === null, "bolt projectile should disappear at the render end instead of lingering on the target tile");
assertAlmost("bolt start height", boltStart.z, (38 * 4) / 256);

const webweaverEvent = {
  ...boltEvent,
  projectileId: webweaverDef.id,
  artifactUrl: webweaverDef.artifactUrl,
  projectile: undefined
};
const webweaverStart = sampleNhProjectileMotion(webweaverEvent, webweaverEvent.startCycle, webweaverDef);
const webweaverPreEnd = sampleNhProjectileMotion(webweaverEvent, webweaverEvent.endCycle - 1, webweaverDef);
assert(webweaverStart.x < webweaverPreEnd.x, "normal Webweaver arrow should travel toward the target");
assertAlmost("normal Webweaver arrow start height", webweaverStart.z, (40 * 4) / 256);
assert(sampleNhProjectileMotion(webweaverEvent, webweaverEvent.endCycle, webweaverDef) === null, "normal Webweaver arrow should expire at the render end");

// Exercise the actual manual-event conversion and frame updater, including a hidden
// model waiting for release between game ticks. Replay-normalized motion is separate.
const viewerPath = path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx");
const viewerSource = ts.createSourceFile(viewerPath, readFileSync(viewerPath, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const rendererFunctions = new Set(["runtimePlayerCombatRenderEvents", "applyRuntimeEffectPlacement", "applyRuntimeEvents", "updateRuntimeEffectObjects", "eventModelKey"]);
const rendererFunctionSource = viewerSource.statements.filter(statement => ts.isFunctionDeclaration(statement) && rendererFunctions.has(statement.name?.text)).map(statement => statement.getText(viewerSource)).join("\n");
const { Group } = require("three");
const runtimeCombat = loadTsModule("src/sim/runtimePlayerCombat.ts");
const rendererContext = {
  window: {},
  NH_CLIENT_CYCLES_PER_GAME_TICK: 30,
  NH_TILE_WORLD_UNITS: 0.5,
  sampleNhProjectileLifecycle,
  sampleNhProjectileMotion,
  runtimePlayerCombatDistance: runtimeCombat.runtimePlayerCombatDistance,
  runtimePlayerCombatProjectileDurationCycles: runtimeCombat.runtimePlayerCombatProjectileDurationCycles,
  applyRuntimeEffectAnimation() {},
  disposeObject() {},
  buildEffectModel: () => new Group(),
  nhOverlaySortValue: () => 0
};
vm.runInNewContext(ts.transpileModule(rendererFunctionSource, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, rendererContext);
const webweaverRenderWindows = [];
for (const distance of [1, 2, 4, 8, 10]) {
  const attack = {
    kind: "attack", id: `webweaver-distance-${distance}`, tick: 10,
    attackerId: "local-player", defenderId: "opponent",
    attackerTile: { x: 0, z: 0 }, defenderTile: { x: distance * 0.5, z: 0 },
    hitDelayTicks: distance < 6 ? 2 : 3,
    projectile: { ...webweaverDef, gfxId: 1574 }
  };
  const [event] = rendererContext.runtimePlayerCombatRenderEvents({ tick: 11, actors: {}, events: [attack] });
  const endClientCycle = 51 + 5 * (distance - 1);
  assert(event.startCycle === 11, "normal arrow starts from the completed server tick's received player-update boundary");
  assert(event.projectile.packetCycle === 330 && event.projectile.cycleStart === 371 && event.projectile.cycleEnd === 330 + endClientCycle, "normal arrow packet lifecycle should use real client-cycle units");
  assertAlmost("normal arrow render end", event.endCycle, 11 + (endClientCycle + 1) / 30);
  const boundary = { eventRoot: new Group() };
  rendererContext.applyRuntimeEvents(boundary, { cycle: 11, actors: [] }, [event], new Map([[event.artifactUrl, { scene: new Group() }]]), null, new Map(), projectileDefinitions, new Map());
  assert(boundary.eventRoot.children.length === 1 && !boundary.eventRoot.children[0].visible, "normal arrow should remain mounted but hidden before release");
  const arrow = boundary.eventRoot.children[0];
  const visibleCycles = [];
  for (let clientCycle = 0; clientCycle <= endClientCycle + 1; clientCycle++) {
    rendererContext.updateRuntimeEffectObjects(boundary, { cycle: 11 + clientCycle / 30, actors: [] }, [event], null, new Map(), projectileDefinitions);
    assert(arrow.visible === (clientCycle >= 41 && clientCycle <= endClientCycle), `distance ${distance}: normal arrow visibility at client cycle ${clientCycle}`);
    if (arrow.visible) visibleCycles.push(clientCycle);
    if (clientCycle === endClientCycle) assertAlmost("normal arrow reaches target on final visible frame", arrow.position.x, attack.defenderTile.x);
  }
  webweaverRenderWindows.push({ distance, releaseMs: visibleCycles[0] * 20, visibleFlightMs: visibleCycles.length * 20 });
}
const legacyBoltObject = new Group();
assert(rendererContext.applyRuntimeEffectPlacement(legacyBoltObject, boltEvent, { cycle: boltEvent.startCycle }, projectileDefinitions), "existing bolt remains visible on its existing start frame");
assertAlmost("existing bolt motion remains unchanged", legacyBoltObject.position.x, boltStart.x);
assert(!rendererContext.applyRuntimeEffectPlacement(legacyBoltObject, boltEvent, { cycle: boltEvent.endCycle }, projectileDefinitions), "existing bolt expiry remains unchanged");

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
      boltDeltaX: boltPreEnd.x - boltStart.x,
      webweaverRenderWindows,
      artifacts: {
        barrage: barrageEvent.artifactUrl,
        bolt: boltEvent.artifactUrl,
        webweaver: webweaverDef.artifactUrl,
        gmaul: gmaulSpotanim.artifactUrl
      }
    },
    null,
    2
  )
);
