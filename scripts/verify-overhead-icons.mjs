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

function atlasSprite(atlas, definition) {
  return atlas.sprites.find(
    (sprite) => sprite.spriteId === definition.spriteId && sprite.frame === definition.spriteFrame
  );
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const {
  createKronosOverheadIconDefinitionStore,
  defaultKronosOverheadIconDefinitions,
  kronosPrayerOverheadDefinition,
  kronosSkullOverheadDefinition
} = loadTsModule("src/render/kronosOverheadIcons.ts");
const { assertValidClientViewTrace } = loadTsModule("src/sim/clientView.ts");
const { clientViewTraceToRuntimeReplay } = loadTsModule("src/render/clientViewReplay.ts");

const overheadIconSource = readJson("fixtures/assets/defs/overhead-icons.json");
const prayerAtlas = readJson("fixtures/render/sprites/prayer_overheads.json");
const skullAtlas = readJson("fixtures/render/sprites/pk_skull.json");
const overheadIconDefinitions = createKronosOverheadIconDefinitionStore(overheadIconSource);

const melee = kronosPrayerOverheadDefinition("protect_from_melee", overheadIconDefinitions);
const missiles = kronosPrayerOverheadDefinition("protect_from_missiles", overheadIconDefinitions);
const magic = kronosPrayerOverheadDefinition("protect_from_magic", overheadIconDefinitions);
const retribution = kronosPrayerOverheadDefinition("retribution", overheadIconDefinitions);
const smite = kronosPrayerOverheadDefinition("smite", overheadIconDefinitions);
const redemption = kronosPrayerOverheadDefinition("redemption", overheadIconDefinitions);
const whiteSkull = kronosSkullOverheadDefinition("white_pk", overheadIconDefinitions);
const redSkull = kronosSkullOverheadDefinition("red_pk", overheadIconDefinitions);

assert(melee && missiles && magic && retribution && smite && redemption, "expected exported prayer overhead definitions for every headIconPrayer frame");
assert(whiteSkull && redSkull, "expected exported skull overhead definitions for white and red skulls");
assert(overheadIconSource.headIconPrayerSpriteArchiveId === magic.spriteId, "prayer definitions should come from the graphics-default headIconPrayer sprite archive");
assert(overheadIconSource.headIconPkSpriteArchiveId === whiteSkull.spriteId, "skull definitions should come from the graphics-default headIconPk sprite archive");
assert(melee.headIconIndex === 0, "protect from melee should preserve client headIconPrayer index 0");
assert(missiles.headIconIndex === 1, "protect from missiles should preserve client headIconPrayer index 1");
assert(magic.headIconIndex === 2, "protect from magic should preserve client headIconPrayer index 2");
assert(retribution.headIconIndex === 3, "retribution should preserve client headIconPrayer index 3");
assert(smite.headIconIndex === 4, "smite should preserve client headIconPrayer index 4");
assert(redemption.headIconIndex === 5, "redemption should preserve client headIconPrayer index 5");
assert(whiteSkull.headIconIndex === 0, "white skull should preserve client headIconPk index 0");
assert(redSkull.headIconIndex === 1, "red skull should preserve client headIconPk index 1");
assert(
  defaultKronosOverheadIconDefinitions.prayers.size === Object.keys(overheadIconSource.prayers).length,
  "default prayer overhead definitions should cover the full exported source frame corpus"
);
assert(
  defaultKronosOverheadIconDefinitions.prayers.get("protect_from_magic")?.spriteId === magic.spriteId &&
    defaultKronosOverheadIconDefinitions.prayers.get("protect_from_magic")?.spriteFrame === magic.spriteFrame,
  "default magic overhead definition should match the source archive/frame model"
);
assert(
  defaultKronosOverheadIconDefinitions.prayers.get("redemption")?.spriteFrame === redemption.spriteFrame &&
    defaultKronosOverheadIconDefinitions.prayers.get("redemption")?.width === redemption.width,
  "default redemption overhead definition should match the source frame dimensions"
);
assert(
  defaultKronosOverheadIconDefinitions.skulls.get("red_pk")?.spriteId === redSkull.spriteId &&
    defaultKronosOverheadIconDefinitions.skulls.get("red_pk")?.spriteFrame === redSkull.spriteFrame,
  "default red skull definition should match the source archive/frame model"
);
assert(atlasSprite(prayerAtlas, magic), "protect from magic definition should point at an exported prayer atlas sprite/frame");
assert(atlasSprite(prayerAtlas, missiles), "protect from missiles definition should point at an exported prayer atlas sprite/frame");
assert(atlasSprite(prayerAtlas, retribution), "retribution definition should point at an exported prayer atlas sprite/frame");
assert(atlasSprite(prayerAtlas, smite), "smite definition should point at an exported prayer atlas sprite/frame");
assert(atlasSprite(prayerAtlas, redemption), "redemption definition should point at an exported prayer atlas sprite/frame");
assert(atlasSprite(skullAtlas, whiteSkull), "white skull definition should point at an exported skull atlas sprite/frame");
assert(atlasSprite(skullAtlas, redSkull), "red skull definition should point at an exported skull atlas sprite/frame");

const fixtureTrace = readJson("fixtures/sim/client-view-two-actor-duel.json");
assertValidClientViewTrace(fixtureTrace);
const replay = clientViewTraceToRuntimeReplay(fixtureTrace, { overheadIconDefinitions });
const magicEvent = replay.events.find(
  (event) =>
    event.spriteSheetId === "prayer_overheads" &&
    event.spriteId === magic.spriteId &&
    event.spriteFrame === magic.spriteFrame
);
const whiteSkullEvent = replay.events.find(
  (event) =>
    event.spriteSheetId === "pk_skull" &&
    event.spriteId === whiteSkull.spriteId &&
    event.spriteFrame === whiteSkull.spriteFrame
);
assert(magicEvent, "client-view replay should resolve prayer overhead events through overhead icon definitions");
assert(whiteSkullEvent, "client-view replay should resolve skull overhead events through overhead icon definitions");

const redTrace = cloneJson(fixtureTrace);
for (const tick of redTrace.ticks) {
  tick.actors.self.skullIcon = "red_pk";
  tick.actors.self.overheadPrayer = "smite";
}
const redReplay = clientViewTraceToRuntimeReplay(redTrace, { overheadIconDefinitions });
const redSkullEvent = redReplay.events.find(
  (event) =>
    event.actorId === "local-player" &&
    event.spriteSheetId === "pk_skull" &&
    event.spriteId === redSkull.spriteId &&
    event.spriteFrame === redSkull.spriteFrame
);
const smiteEvent = redReplay.events.find(
  (event) =>
    event.actorId === "local-player" &&
    event.spriteSheetId === "prayer_overheads" &&
    event.spriteId === smite.spriteId &&
    event.spriteFrame === smite.spriteFrame
);
assert(redSkullEvent, "client-view replay should resolve red skull through overhead icon definitions");
assert(smiteEvent, "client-view replay should resolve smite through overhead icon definitions");

const replaySource = readFileSync(path.join(projectRoot, "src/render/clientViewReplay.ts"), "utf8");
const runtimeSceneSource = readFileSync(path.join(projectRoot, "src/render/runtimeScene.ts"), "utf8");
assert(!replaySource.includes("prayerSpriteIds"), "clientViewReplay should not keep a replay-local prayer sprite table");
assert(!replaySource.includes('"pk_skull",\n            439'), "clientViewReplay should not hardcode white skull sprite 439");
assert(!runtimeSceneSource.includes("?? 440"), "runtimeScene should not hardcode fallback prayer overhead sprite ids");
assert(!runtimeSceneSource.includes("?? 2"), "runtimeScene should not hardcode fallback prayer overhead sprite frames");
assert(
  runtimeSceneSource.includes('throw new Error("missing exported protect-from-magic overhead definition")'),
  "runtimeScene should fail closed when the exported overhead definition is missing"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      prayerArchive: overheadIconSource.headIconPrayerSpriteArchiveId,
      skullArchive: overheadIconSource.headIconPkSpriteArchiveId,
      prayerIndexes: {
        melee: melee.headIconIndex,
        missiles: missiles.headIconIndex,
        magic: magic.headIconIndex,
        retribution: retribution.headIconIndex,
        smite: smite.headIconIndex,
        redemption: redemption.headIconIndex
      },
      skullIndexes: {
        white: whiteSkull.headIconIndex,
        red: redSkull.headIconIndex
      }
    },
    null,
    2
  )
);
