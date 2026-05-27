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

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(projectRoot, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const {
  NH_HEALTH_BAR_BACK_SPRITE_ID,
  NH_HEALTH_BAR_FRONT_SPRITE_ID,
  NH_HEALTH_BAR_WIDTH,
  createNhHealthBarDefinitionStore,
  createNhHealthBarRenderState,
  nhHealthBarDefinition,
  nhPlayerHealthBarDefinition,
  layoutNhHealthBar
} = loadTsModule("src/render/nhHealthBars.ts");
const { assertValidClientViewTrace } = loadTsModule("src/sim/clientView.ts");
const { clientViewTraceToRuntimeReplay } = loadTsModule("src/render/clientViewReplay.ts");
const { runtimeRenderEvents } = loadTsModule("src/render/runtimeScene.ts");

const healthBarDefinitionsSource = readJson("fixtures/assets/defs/healthbars.json");
const healthBarDefinitions = createNhHealthBarDefinitionStore(healthBarDefinitionsSource);
const sourceHealthBarDefinition = nhHealthBarDefinition(0, healthBarDefinitions);
const healthSprites = readJson("fixtures/render/sprites/health_bars.json");
const exportedHealthBarIds = Object.keys(healthBarDefinitionsSource).map(Number).sort((a, b) => a - b);
const expectedHealthBarIds = [0, 1, 7, 8, 12, 16, 17, 18, 19, 20, 21, 22];
assert(
  JSON.stringify(exportedHealthBarIds) === JSON.stringify(expectedHealthBarIds),
  `health-bar export should cover the full cache config corpus for this revision: ${JSON.stringify(exportedHealthBarIds)}`
);
assert(
  healthBarDefinitions.size === expectedHealthBarIds.length,
  `definition store should carry every exported health-bar definition: ${healthBarDefinitions.size}`
);
const exportedHealthBarSpriteIds = healthSprites.sprites.map((sprite) => sprite.spriteId).sort((a, b) => a - b);
const definitionHealthBarSpriteIds = [
  ...new Set(
    Object.values(healthBarDefinitionsSource)
      .flatMap((definition) => [definition.frontSpriteId, definition.backSpriteId])
      .filter((spriteId) => Number.isInteger(spriteId) && spriteId >= 0)
  )
].sort((a, b) => a - b);
assert(
  JSON.stringify(exportedHealthBarSpriteIds) === JSON.stringify(definitionHealthBarSpriteIds),
  `health-bar sprite atlas should be generated from all definition sprite ids: ${JSON.stringify({ exportedHealthBarSpriteIds, definitionHealthBarSpriteIds })}`
);
const frontSprite = healthSprites.sprites.find((sprite) => sprite.spriteId === NH_HEALTH_BAR_FRONT_SPRITE_ID);
const backSprite = healthSprites.sprites.find((sprite) => sprite.spriteId === NH_HEALTH_BAR_BACK_SPRITE_ID);
assert(frontSprite?.width === 30 && frontSprite.height === 5, "health front sprite 2176 should be the 30x5 cache bar");
assert(backSprite?.width === 30 && backSprite.height === 5, "health back sprite 2177 should be the 30x5 cache bar");

assert(healthBarDefinitionsSource["0"], "missing exported cache HealthBarDefinition 0");
assert(sourceHealthBarDefinition?.frontSpriteId === 2176, "source health bar should resolve front sprite 2176");
assert(sourceHealthBarDefinition?.backSpriteId === 2177, "source health bar should resolve back sprite 2177");
assert(sourceHealthBarDefinition?.width === NH_HEALTH_BAR_WIDTH, "definition width should preserve source width");
assert(
  sourceHealthBarDefinition?.lifetimeCycles === healthBarDefinitionsSource["0"].lifetimeCycles,
  "definition lifetime should preserve exported source int5"
);
assert(sourceHealthBarDefinition?.lifetimeCycles === 300, "definition lifetime should match Nh cache value");
assert(sourceHealthBarDefinition?.interpolationStep === 1, "definition interpolation step should preserve source int4");
assert(sourceHealthBarDefinition?.opacityStart === 250, "definition opacity start should match Nh cache value");
assert(sourceHealthBarDefinition?.opacityEnd === 250, "definition opacity end should match Nh cache value");
assert(nhPlayerHealthBarDefinition.width === NH_HEALTH_BAR_WIDTH, "source default definition width should preserve cache width");
assert(
  nhPlayerHealthBarDefinition.lifetimeCycles === healthBarDefinitionsSource["0"].lifetimeCycles,
  "source default definition lifetime should preserve cache int5"
);
assert(
  nhPlayerHealthBarDefinition.opacityStart === healthBarDefinitionsSource["0"].opacityStart &&
    nhPlayerHealthBarDefinition.opacityEnd === healthBarDefinitionsSource["0"].opacityEnd,
  "source default definition opacity should preserve cache fields"
);
const wideFadeDefinition = nhHealthBarDefinition(8, healthBarDefinitions);
const wideFadeSprite = healthSprites.sprites.find((sprite) => sprite.spriteId === wideFadeDefinition?.frontSpriteId);
assert(wideFadeDefinition?.frontSpriteId === 1417, "broader health-bar corpus should preserve definition 8 front sprite");
assert(wideFadeDefinition?.backSpriteId === 1418, "broader health-bar corpus should preserve definition 8 back sprite");
assert(wideFadeDefinition?.width === 120, "broader health-bar corpus should preserve definition 8 width");
assert(wideFadeDefinition?.fadeStartCycle === 40, "broader health-bar corpus should preserve definition 8 fade start");

const staticState = createNhHealthBarRenderState(10, 22 / 30, 22 / 30, 0, sourceHealthBarDefinition);
const staticLayout = layoutNhHealthBar(staticState, 10, frontSprite.width);
assert(staticLayout.clipWidthPixels === 22, "static health bar should clip front sprite by health2/definition width");
assert(staticLayout.widthRatio === 22 / 30, "static health bar ratio should match source clip width");
assert(staticLayout.alpha === 255, "default health bar should draw fully opaque");

const interpolatedLayout = layoutNhHealthBar(
  {
    definition: sourceHealthBarDefinition,
    update: {
      cycle: 20,
      health: 10,
      health2: 20,
      cycleOffset: 5
    }
  },
  22,
  frontSprite.width
);
assert(interpolatedLayout.clipWidthPixels === 14, "health bar should interpolate previous-to-target width by cycleOffset");
const wideFadeLayout = layoutNhHealthBar(
  createNhHealthBarRenderState(30, 0.5, 0.5, 0, wideFadeDefinition),
  40,
  wideFadeSprite.width
);
assert(wideFadeLayout.clipWidthPixels === 50, "definition 8 should scale its 100px sprite by health2/120 source width");
const wideFadeExpiredLayout = layoutNhHealthBar(
  createNhHealthBarRenderState(30, 0.5, 0.5, 0, wideFadeDefinition),
  91,
  wideFadeSprite.width
);
assert(wideFadeExpiredLayout.alpha === 0, "definition 8 should fade out through its exported fadeStart/lifetime fields");

const fixtureTrace = readJson("fixtures/sim/client-view-two-actor-duel.json");
assertValidClientViewTrace(fixtureTrace);
const replay = clientViewTraceToRuntimeReplay(fixtureTrace, { healthBarDefinitions });
const healthEvent = replay.events.find((event) => event.spriteSheetId === "health_bars" && event.healthBar);
assert(healthEvent, "client-view replay should emit source-shaped health bar state");
assert(healthEvent.spriteId === sourceHealthBarDefinition.frontSpriteId, "runtime health bar event should use the definition front sprite id");
assert(healthEvent.healthBar.definition.frontSpriteId === 2176, "runtime health bar should resolve front sprite from definition");
assert(healthEvent.startCycle === 3 && healthEvent.endCycle === 4, "first replay health bar should stay active until the next source-inferred update");
assert(healthEvent.healthBar.update.health === 30, "first replay health bar should preserve previous full health units");
assert(healthEvent.healthBar.update.health2 === 22, "first replay health bar should carry target health units");
assert(healthEvent.healthBar.update.cycleOffset === 1, "first replay health bar should carry a nonzero source-style cycleOffset");
const secondHealthEvent = replay.events.find(
  (event) => event.spriteSheetId === "health_bars" && event.healthBar && event.startCycle > healthEvent.startCycle
);
assert(secondHealthEvent?.healthBar?.update.health === 22, "second replay health bar should use the prior visible target as previous health");
assert(secondHealthEvent?.healthBar?.update.health2 === 16, "second replay health bar should carry the next target health units");

const demoHealthEvent = runtimeRenderEvents.find((event) => event.spriteSheetId === "health_bars" && event.healthBar);
assert(demoHealthEvent, "static runtime scene should emit source-shaped health bar state");
assert(
  demoHealthEvent.spriteId === demoHealthEvent.healthBar.definition.frontSpriteId,
  "static runtime health bar event should use the render state's definition front sprite id"
);
assert(
  demoHealthEvent.healthBar.update.health === demoHealthEvent.healthBar.definition.width,
  "static runtime health bar should keep the previous full-health HealthBarUpdate value"
);
assert(
  demoHealthEvent.healthBar.update.health2 === Math.round(0.64 * demoHealthEvent.healthBar.definition.width),
  "static runtime health bar should keep the target HealthBarUpdate value"
);
assert(demoHealthEvent.healthBar.update.cycleOffset === 1, "static runtime health bar should use source-style cycleOffset");
assert(
  demoHealthEvent.endCycle ===
    demoHealthEvent.healthBar.update.cycle +
      demoHealthEvent.healthBar.definition.lifetimeCycles +
      demoHealthEvent.healthBar.update.cycleOffset -
      1,
  "static runtime health bar should stay visible for the source definition lifetime"
);

const replaySource = readFileSync(path.join(projectRoot, "src/render/clientViewReplay.ts"), "utf8");
assert(!replaySource.includes("health_bars-2176"), "clientViewReplay should not hardcode the health-bar front sprite in event ids");
assert(!replaySource.includes("spriteId: 2176"), "clientViewReplay should not hardcode the health-bar front sprite id");
const runtimeSceneSource = readFileSync(path.join(projectRoot, "src/render/runtimeScene.ts"), "utf8");
assert(!runtimeSceneSource.includes("spriteId: 2176"), "runtimeScene should not hardcode the health-bar front sprite id");

console.log(
  JSON.stringify(
    {
      ok: true,
      definition: {
        exportedIds: exportedHealthBarIds,
        frontSpriteId: sourceHealthBarDefinition.frontSpriteId,
        backSpriteId: sourceHealthBarDefinition.backSpriteId,
        width: sourceHealthBarDefinition.width,
        lifetimeCycles: sourceHealthBarDefinition.lifetimeCycles,
        opacityStart: sourceHealthBarDefinition.opacityStart
      },
      spriteAtlas: {
        sprites: exportedHealthBarSpriteIds.length,
        spriteIds: exportedHealthBarSpriteIds
      },
      staticLayout: {
        clipWidthPixels: staticLayout.clipWidthPixels,
        widthRatio: staticLayout.widthRatio,
        alpha: staticLayout.alpha
      },
      interpolatedLayout: {
        clipWidthPixels: interpolatedLayout.clipWidthPixels
      },
      wideFadeLayout: {
        clipWidthPixels: wideFadeLayout.clipWidthPixels,
        expiredAlpha: wideFadeExpiredLayout.alpha
      }
    },
    null,
    2
  )
);
