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
  const sourcePath = path.resolve(projectRoot, relativePath);
  const cached = moduleCache.get(sourcePath);
  if (cached) {
    return cached.exports;
  }

  const source = readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true
    },
    fileName: sourcePath
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(sourcePath, module);
  vm.runInNewContext(
    transpiled,
    {
      module,
      exports: module.exports,
      require: (request) => require(request),
      console
    },
    { filename: sourcePath }
  );
  return module.exports;
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
  KRONOS_HITSPLAT_BLOCK_TYPE,
  KRONOS_HITSPLAT_DAMAGE_TYPE,
  KRONOS_HITSPLAT_DEFAULT_DURATION_CYCLES,
  createKronosHitsplatDefinitionStore,
  createKronosHitsplatRenderState,
  createKronosHitsplatRenderStateOrNull,
  kronosHitsplatDefinition,
  kronosHitsplatPrimarySpriteId,
  layoutKronosHitsplat,
  resolveKronosHitsplatDefinition
} = loadTsModule("src/render/kronosHitsplats.ts");

const hitsplatDefinitionsSource = readJson("fixtures/assets/defs/hitsplats.json");
const hitsplatSprites = readJson("fixtures/render/sprites/hitsplats.json");
const digitSprites = readJson("fixtures/render/sprites/hitsplat_digits.json");
const spriteEntries = new Map(hitsplatSprites.sprites.map((sprite) => [`hitsplats:${sprite.spriteId}`, sprite]));
for (const sprite of digitSprites.sprites) {
  spriteEntries.set(`hitsplat_digits:${sprite.spriteId}`, sprite);
}

function lookup(sheetId, spriteId) {
  return spriteEntries.get(`${sheetId}:${spriteId}`);
}

const hitsplatDefinitions = createKronosHitsplatDefinitionStore(hitsplatDefinitionsSource);
const blockDefinition = kronosHitsplatDefinition(KRONOS_HITSPLAT_BLOCK_TYPE, hitsplatDefinitions);
const damageDefinition = kronosHitsplatDefinition(KRONOS_HITSPLAT_DAMAGE_TYPE, hitsplatDefinitions);
const exportedHitsplatIds = Object.keys(hitsplatDefinitionsSource).map(Number).sort((a, b) => a - b);
const expectedHitsplatIds = [0, 1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15];
assert(
  JSON.stringify(exportedHitsplatIds) === JSON.stringify(expectedHitsplatIds),
  `hitsplat export should cover the full cache config corpus for this revision: ${JSON.stringify(exportedHitsplatIds)}`
);
assert(
  hitsplatDefinitions.size === expectedHitsplatIds.length,
  `definition store should carry every exported hitsplat definition: ${hitsplatDefinitions.size}`
);
const exportedHitsplatSpriteIds = hitsplatSprites.sprites.map((sprite) => sprite.spriteId).sort((a, b) => a - b);
const definitionSpriteIds = [
  ...new Set(
    Object.values(hitsplatDefinitionsSource)
      .flatMap((definition) => Object.values(definition.sprites ?? {}))
      .filter((spriteId) => Number.isInteger(spriteId) && spriteId >= 0)
  )
].sort((a, b) => a - b);
assert(
  JSON.stringify(exportedHitsplatSpriteIds) === JSON.stringify(definitionSpriteIds),
  `hitsplat sprite atlas should be generated from all definition sprite ids: ${JSON.stringify({ exportedHitsplatSpriteIds, definitionSpriteIds })}`
);

assert(hitsplatDefinitionsSource["0"], "missing exported cache HitSplatDefinition 0");
assert(hitsplatDefinitionsSource["1"], "missing exported cache HitSplatDefinition 1");
assert(
  blockDefinition?.durationCycles === hitsplatDefinitionsSource["0"].durationCycles,
  "blocked hitsplat should use exported cache definition duration"
);
assert(
  damageDefinition?.durationCycles === hitsplatDefinitionsSource["1"].durationCycles,
  "damage hitsplat should use exported cache definition duration"
);
assert(blockDefinition?.durationCycles === 50, "blocked hitsplat should match Kronos cache duration");
assert(damageDefinition?.durationCycles === 50, "damage hitsplat should match Kronos cache duration");
assert(
  KRONOS_HITSPLAT_DEFAULT_DURATION_CYCLES === damageDefinition?.durationCycles,
  "generated NH duel hitsplat expiry should use the exported cache damage duration"
);
assert(blockDefinition?.sprites.middleSpriteId === 1358, "blocked hitsplat should resolve cache sprite 1358");
assert(damageDefinition?.sprites.middleSpriteId === 1359, "damage hitsplat should resolve cache sprite 1359");
assert(blockDefinition?.template.includes("%1"), "blocked hitsplat should preserve value template");
assert(damageDefinition?.template.includes("%1"), "damage hitsplat should preserve value template");
assert(Number.isInteger(blockDefinition?.priorityMode), "blocked hitsplat should expose source priority mode");
assert(Number.isInteger(damageDefinition?.fadeStartCycle), "damage hitsplat should expose source fade cycle");
assert(Number.isInteger(damageDefinition?.textBaselineOffset), "damage hitsplat should expose source text baseline offset");
const poisonDefinition = kronosHitsplatDefinition(6, hitsplatDefinitions);
assert(poisonDefinition?.sprites.middleSpriteId === 1419, "broader hitsplat corpus should preserve poison-style sprite 1419");
const venomedDefinition = kronosHitsplatDefinition(15, hitsplatDefinitions);
assert(venomedDefinition?.sprites.middleSpriteId === 1629, "broader hitsplat corpus should preserve venom-style sprite 1629");
const transformedDefinitions = Object.values(hitsplatDefinitionsSource).filter((definition) => definition.transforms?.length > 0);
const customFontDefinitions = Object.values(hitsplatDefinitionsSource).filter((definition) => definition.fontId >= 0);
assert(transformedDefinitions.length === 0, "this Kronos cache revision should not invent transformed hitsplat definitions");
assert(customFontDefinitions.length === 0, "this Kronos cache revision should not invent custom hitsplat fonts");

const transformedByVarbit = {
  ...damageDefinition,
  id: 9000,
  label: "Synthetic transformed varbit splat",
  durationCycles: 33,
  transformVarbit: 17,
  transformVarp: -1,
  transforms: [2, 6, -1]
};
const transformedByVarp = {
  ...damageDefinition,
  id: 9001,
  label: "Synthetic transformed varp splat",
  durationCycles: 31,
  transformVarbit: -1,
  transformVarp: 43,
  transforms: [0, 1, 15]
};
const transformStore = new Map([
  ...hitsplatDefinitions,
  [transformedByVarbit.id, transformedByVarbit],
  [transformedByVarp.id, transformedByVarp]
]);
assert(
  resolveKronosHitsplatDefinition(transformedByVarbit.id, transformStore, { varbits: { 17: 0 } })?.id === 2,
  "hitsplat transformVarbit index 0 should select transforms[0]"
);
assert(
  resolveKronosHitsplatDefinition(transformedByVarbit.id, transformStore, { varbits: new Map([[17, 1]]) })?.id === 6,
  "hitsplat transformVarbit index 1 should support Map-backed varbit state"
);
assert(
  resolveKronosHitsplatDefinition(transformedByVarbit.id, transformStore, { varbits: { 17: 2 } }) === null,
  "hitsplat transformVarbit out-of-range/default -1 should suppress the primary splat like the client"
);
assert(
  resolveKronosHitsplatDefinition(transformedByVarp.id, transformStore, { varps: { 43: 2 } })?.id === 15,
  "hitsplat transformVarp should select the matching transformed definition"
);
const transformedState = createKronosHitsplatRenderState({
  primaryType: transformedByVarp.id,
  primaryValue: 44,
  secondaryType: transformedByVarbit.id,
  secondaryValue: 3,
  packetCycle: 7,
  delayCycles: 4,
  slotIndex: 1
}, transformStore, { varps: { 43: 1 }, varbits: { 17: 0 } });
assert(transformedState.primary.typeId === 1, "primary hitsplat render state should use the transformed display definition");
assert(transformedState.secondary?.typeId === 2, "secondary hitsplat render state should use the transformed display definition");
assert(
  transformedState.expiresOnClientCycle === 42,
  "hitSplatCycles should keep the original source definition duration before display transform"
);
assert(
  createKronosHitsplatRenderStateOrNull({
    primaryType: transformedByVarbit.id,
    primaryValue: 1,
    secondaryType: -1,
    secondaryValue: 0,
    packetCycle: 1,
    delayCycles: 0,
    slotIndex: 0
  }, transformStore, { varbits: { 17: 99 } }) === null,
  "primary hitsplat transform resolving to -1 should be skipped instead of drawn with a fallback"
);

const damageHitsplat = createKronosHitsplatRenderState({
  primaryType: KRONOS_HITSPLAT_DAMAGE_TYPE,
  primaryValue: 38,
  secondaryType: -1,
  secondaryValue: 0,
  packetCycle: 12,
  delayCycles: 3,
  slotIndex: 2
}, hitsplatDefinitions);

assert(damageHitsplat.expiresOnClientCycle === 65, "hitSplatCycles should equal packet cycle + delay + definition duration");
assert(damageHitsplat.slotIndex === 2, "hitsplat slot should remain packet-shaped");
assert(kronosHitsplatPrimarySpriteId(damageHitsplat) === 1359, "primary sprite id should come from definition");

const damageLayout = layoutKronosHitsplat(damageHitsplat, lookup, 12);
assert(damageLayout?.width === 26, "single damage layout should preserve drawActor2d spacer plus middle sprite width");
assert(damageLayout?.height === 23, "single damage layout should use cache sprite height");
assert(damageLayout?.offsetX === 0 && damageLayout.offsetY === 0, "zero-offset damage layout should remain anchored at the slot base");
assert(damageLayout?.sprites.length === 3, "two-digit damage splat should draw background plus two digit sprites");
assert(damageLayout?.sprites[0]?.spriteId === 1359, "damage background should be first layout sprite");
assert(
  damageLayout?.sprites.every((sprite) => Number.isInteger(sprite.x) && Number.isInteger(sprite.y)),
  "hitsplat sprite layout should stay on integer client pixels like Scene.drawActor2d"
);
const damageDigits = damageLayout?.sprites.filter((sprite) => sprite.sheetId === "hitsplat_digits") ?? [];
assert(damageDigits.length === 2, "two-digit damage splat should expose two fontPlain11 digit sprites");
assert(
  damageDigits[0].y === damageDigits[1].y,
  `hitsplat digits should share the same Kronos font baseline: ${JSON.stringify(damageDigits)}`
);
assert(
  damageDigits[0].y === 6,
  `hitsplat digits should use fontPlain11 baseline - ascent + topBearing placement: ${JSON.stringify(damageDigits)}`
);
assert(
  damageDigits[0].x === 8 && damageDigits[1].x === 14,
  `hitsplat digits should use Kronos integer centering and leftBearing placement: ${JSON.stringify(damageDigits)}`
);

const movingDefinition = {
  ...damageDefinition,
  id: 9999,
  horizontalOffset: 10,
  verticalOffset: 20,
  durationCycles: 50
};
const movingHitsplat = createKronosHitsplatRenderState({
  primaryType: movingDefinition.id,
  primaryValue: 12,
  secondaryType: -1,
  secondaryValue: 0,
  packetCycle: 100,
  delayCycles: 0,
  slotIndex: 0
}, new Map([[movingDefinition.id, movingDefinition]]));
const movingStart = layoutKronosHitsplat(movingHitsplat, lookup, 100);
const movingMid = layoutKronosHitsplat(movingHitsplat, lookup, 125);
const movingEnd = layoutKronosHitsplat(movingHitsplat, lookup, 150);
assert(movingStart?.offsetX === 0 && movingStart.offsetY === 0, "hitsplat movement should start at the base drawActor2d slot");
assert(movingMid?.offsetX === 5 && movingMid.offsetY === -10, "hitsplat movement should interpolate source horizontal/vertical offsets by remaining cycles");
assert(movingEnd?.offsetX === 10 && movingEnd.offsetY === -20, "hitsplat movement should reach source offsets at expiry");

const secondaryHitsplat = createKronosHitsplatRenderState({
  primaryType: KRONOS_HITSPLAT_DAMAGE_TYPE,
  primaryValue: 1,
  secondaryType: KRONOS_HITSPLAT_BLOCK_TYPE,
  secondaryValue: 0,
  packetCycle: 20,
  delayCycles: 0,
  slotIndex: 0
}, hitsplatDefinitions);
const secondaryLayout = layoutKronosHitsplat(secondaryHitsplat, lookup, 20);
assert(secondaryLayout?.width === 54, "secondary hitsplat should add drawActor2d primary/secondary component gap");
assert(secondaryLayout?.sprites.some((sprite) => sprite.spriteId === 1358), "secondary layout should include blocked sprite");

const replaySource = readFileSync(path.join(projectRoot, "src", "render", "clientViewReplay.ts"), "utf8");
assert(!replaySource.includes("function hitsplatSpriteId"), "client replay must not collapse hitsplat kind directly to sprite id");
assert(!replaySource.includes("hitsplatAmount"), "runtime hitsplats must use source-shaped definition state");
const runtimeViewerSource = readFileSync(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
assert(
  runtimeViewerSource.includes("offsetX: layout.offsetX") && runtimeViewerSource.includes("offsetY: layout.offsetY"),
  "RuntimeSceneViewer should pass source HitSplatDefinition movement offsets into actor overlay placement"
);
assert(
  runtimeViewerSource.includes("clientSpriteScaleCameraRight") &&
    runtimeViewerSource.includes("clientSpriteScaleCameraUp") &&
    runtimeViewerSource.includes("root.worldToLocal(clientSpriteScaleChildWorld)") &&
    !runtimeViewerSource.includes("sprite.position.x = spritePixels.offsetX * unitsPerPixel"),
  "RuntimeSceneViewer should place multi-part hitsplats in camera pixel space so digit baselines stay level on screen"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      definitions: {
        exportedIds: exportedHitsplatIds,
        block: blockDefinition.id,
        damage: damageDefinition.id,
        sourceDefaultDurationCycles: KRONOS_HITSPLAT_DEFAULT_DURATION_CYCLES,
        exportedDurationCycles: damageDefinition.durationCycles,
        blockSprite: blockDefinition.sprites.middleSpriteId,
        damageSprite: damageDefinition.sprites.middleSpriteId,
        poisonSprite: poisonDefinition.sprites.middleSpriteId,
        venomSprite: venomedDefinition.sprites.middleSpriteId
      },
      transformSelection: {
        varbit0: resolveKronosHitsplatDefinition(transformedByVarbit.id, transformStore, { varbits: { 17: 0 } })?.id,
        varbit1: resolveKronosHitsplatDefinition(transformedByVarbit.id, transformStore, { varbits: { 17: 1 } })?.id,
        varp2: resolveKronosHitsplatDefinition(transformedByVarp.id, transformStore, { varps: { 43: 2 } })?.id,
        preservedExpiryCycle: transformedState.expiresOnClientCycle
      },
      spriteAtlas: {
        sprites: exportedHitsplatSpriteIds.length,
        spriteIds: exportedHitsplatSpriteIds
      },
      damageLayout: {
        width: damageLayout.width,
        height: damageLayout.height,
        offsetX: damageLayout.offsetX,
        offsetY: damageLayout.offsetY,
        sprites: damageLayout.sprites.length
      },
      movingLayout: {
        start: { x: movingStart.offsetX, y: movingStart.offsetY },
        mid: { x: movingMid.offsetX, y: movingMid.offsetY },
        end: { x: movingEnd.offsetX, y: movingEnd.offsetY }
      },
      secondaryLayout: {
        width: secondaryLayout.width,
        sprites: secondaryLayout.sprites.length
      }
    },
    null,
    2
  )
);
