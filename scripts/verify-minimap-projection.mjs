import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nhClientRoot = path.resolve(projectRoot, "..", "Nh184-Client");
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

  const source = readFileSync(resolvedPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
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
      require: (request) => (request.startsWith(".") ? loadModule(path.resolve(path.dirname(resolvedPath), request)) : require(request)),
      console
    },
    { filename: resolvedPath }
  );
  return module.exports;
}

function resolveModulePath(candidatePath) {
  const attempts = [
    candidatePath,
    `${candidatePath}.ts`,
    `${candidatePath}.tsx`,
    `${candidatePath}.js`,
    path.join(candidatePath, "index.ts"),
    path.join(candidatePath, "index.tsx"),
    path.join(candidatePath, "index.js")
  ];
  for (const attempt of attempts) {
    try {
      if (statSync(attempt).isFile()) {
        return attempt;
      }
    } catch {
      // Try the next module candidate.
    }
  }
  throw new Error(`Unable to resolve module ${candidatePath}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSame(name, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name} mismatch\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  }
}

function readProjectSource(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function readNhClientSource(relativePath) {
  return readFileSync(path.join(nhClientRoot, relativePath), "utf8");
}

function assertSourceIncludes(source, snippet, label) {
  assert(source.includes(snippet), `${label} should include ${snippet}`);
}

const {
  NH_MINIMAP_DOT_SIZE,
  NH_MINIMAP_LOCAL_PLAYER_DOT_COLOR,
  NH_MINIMAP_LOCAL_PLAYER_DOT_SIZE,
  nhMinimapActorTile,
  nhMinimapActorDeltas,
  nhMinimapClickToTile,
  nhMinimapDestinationDeltas,
  nhMinimapDestinationMarker,
  nhMinimapDotOffset,
  nhMinimapDotsForSnapshot,
  nhMinimapHintMarker,
  nhMinimapLocalPlayerDot,
  nhMinimapMaskContains,
  nhMinimapMapIconForObject,
  nhMinimapMapIconForSource,
  nhMinimapMapDotSpriteIndex,
  nhMinimapMapMarkerSpriteIndex
} = loadTsModule("src/render/nhMinimap.ts");
const {
  buildNhMinimapSceneSprite,
  nhMinimapSceneCenter,
  nhMinimapSceneTransform
} = loadTsModule("src/render/nhMinimapScene.ts");
const { assertValidClientViewTrace } = loadTsModule("src/sim/clientView.ts");
const { createDisabledMinimapClientViewTrace, createMinimapSemanticClientViewTrace } = loadTsModule("src/sim/clientViewFixtures.ts");
const { clientViewTraceToRuntimeReplay, sampleRuntimeReplayScene } = loadTsModule("src/render/clientViewReplay.ts");

const clientSource = readNhClientSource("runelite-client/src/main/java/net/runelite/standalone/Client.java");
const clientSceneSource = readNhClientSource("runelite-client/src/main/java/net/runelite/standalone/Scene.java");
const spriteMaskSource = readNhClientSource("runelite-client/src/main/java/net/runelite/standalone/SpriteMask.java");
const minimapSceneSource = readProjectSource("src/render/nhMinimapScene.ts");
const minimapProjectionSource = readProjectSource("src/render/nhMinimap.ts");
for (const snippet of [
  "static int camAngleY;",
  "static int minimapState;",
  "static int mapIconCount;",
  "static NodeDeque[][][] groundItems;",
  "static int npcCount;",
  "Players.Players_count",
  "static int hintArrowType;",
  "static int destinationX;"
]) {
  assertSourceIncludes(clientSource, snippet, "Nh Client minimap source fields");
}
assertSourceIncludes(clientSceneSource, "if(var9 != 0)", "Nh scene minimap TilePaint draw");
assertSourceIncludes(clientSceneSource, "if(var12 != 0)", "Nh scene minimap TileModel draw");
assertSourceIncludes(spriteMaskSource, "var1 <= var3 + this.xWidths[var2]", "Nh SpriteMask row hit test");
assert(
  !minimapSceneSource.includes("fallbackTerrainColor"),
  "minimap terrain should leave blank source pixels untouched instead of using a handmade fallback terrain color"
);
assert(
  !minimapProjectionSource.includes("fallbackMinimapDotSize"),
  "minimap dots should require exported class17.mapDotSprites dimensions instead of a handmade fallback dot size"
);

const captureReferenceSource = readProjectSource("scripts/capture-client-reference.mjs");
assertSourceIncludes(captureReferenceSource, "validateClientViewCameraState", "client reference capture importer");
assertSourceIncludes(captureReferenceSource, "validateClientViewMinimapState", "client reference capture importer");
assertSourceIncludes(captureReferenceSource, "validateClientViewMinimapMapIcons", "client reference capture importer");
assertSourceIncludes(captureReferenceSource, "validateClientViewMinimapEntities", "client reference capture importer");
assertSourceIncludes(captureReferenceSource, "validateClientViewMinimapHints", "client reference capture importer");
assertSourceIncludes(captureReferenceSource, "validateClientViewMinimapDestination", "client reference capture importer");
assertSourceIncludes(captureReferenceSource, "client-camera-held-arrow-contract", "client reference capture importer");
assertSourceIncludes(captureReferenceSource, "client-minimap-widget-draw-contract", "client reference capture importer");
assertSourceIncludes(captureReferenceSource, "client-scene-minimap-sprite-build-contract", "client reference capture importer");
assertSourceIncludes(captureReferenceSource, "client-minimap-dot-projection-contract", "client reference capture importer");
assertSourceIncludes(captureReferenceSource, "client-minimap-hint-arrow-contract", "client reference capture importer");

const clientUiAtlas = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "render", "sprites", "client_ui.json"), "utf8"));
const fixedMinimapMaskSprite = clientUiAtlas.sprites.find((sprite) => sprite.alias === "fixed_mode_minimap_alpha_mask");
assert(fixedMinimapMaskSprite, "expected exported client_ui atlas to include fixed_mode_minimap_alpha_mask");
assertSame("fixed minimap SpriteMask metadata", {
  spriteId: fixedMinimapMaskSprite.spriteId,
  width: fixedMinimapMaskSprite.width,
  height: fixedMinimapMaskSprite.height,
  rowCount: fixedMinimapMaskSprite.maskXStarts?.length,
  widthCount: fixedMinimapMaskSprite.maskXWidths?.length
}, {
  spriteId: 1183,
  width: 145,
  height: 151,
  rowCount: 151,
  widthCount: 151
});
const mask = {
  width: fixedMinimapMaskSprite.width,
  height: fixedMinimapMaskSprite.height,
  xStarts: fixedMinimapMaskSprite.maskXStarts,
  xWidths: fixedMinimapMaskSprite.maskXWidths
};
const mapDotAtlas = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "render", "sprites", "minimap_map_dots.json"), "utf8"));
const playerMapDot = mapDotAtlas.sprites.find((sprite) => sprite.alias === "map_dot_player");
assert(playerMapDot, "expected exported minimap_map_dots atlas to include map_dot_player");
function mapDotSpriteSizeForKind(kind) {
  const alias = `map_dot_${kind.replace("-", "_")}`;
  const sprite = mapDotAtlas.sprites.find((candidate) => candidate.alias === alias)
    ?? mapDotAtlas.sprites.find((candidate) => candidate.frame === nhMinimapMapDotSpriteIndex(kind));
  return sprite ? { width: sprite.width, height: sprite.height } : null;
}
assertSame("cache player map dot frame", {
  spriteId: playerMapDot.spriteId,
  frame: playerMapDot.frame,
  width: playerMapDot.width,
  height: playerMapDot.height
}, {
  spriteId: 300,
  frame: 2,
  width: 4,
  height: 5
});
const mapMarkerAtlas = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "render", "sprites", "minimap_map_markers.json"), "utf8"));
const destinationMarkerSprite = mapMarkerAtlas.sprites.find((sprite) => sprite.alias === "map_marker_destination");
assert(destinationMarkerSprite, "expected exported minimap_map_markers atlas to include map_marker_destination");
assertSame("cache destination marker frame", {
  spriteId: destinationMarkerSprite.spriteId,
  frame: destinationMarkerSprite.frame,
  width: destinationMarkerSprite.width,
  height: destinationMarkerSprite.height
}, {
  spriteId: 422,
  frame: 0,
  width: 8,
  height: 15
});
const mapIconAtlas = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "render", "sprites", "minimap_map_icons.json"), "utf8"));
const sampleMapIconSprite = mapIconAtlas.sprites.find((sprite) => Number.isInteger(sprite.areaId) && sprite.alias === `map_icon_area_${sprite.areaId}`);
assert(sampleMapIconSprite, "expected exported minimap_map_icons atlas to include area-keyed map icon sprites");
const arena = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "render", "maps", "inferno_arena.json"), "utf8"));
const arenaObjects = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "render", "maps", "inferno_arena_objects.json"), "utf8"));
const floors = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "floors.json"), "utf8"));
const textures = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "textures.json"), "utf8"));
const sceneSprite = buildNhMinimapSceneSprite(arena, arenaObjects, floors, textures);
assertSame("cache scene minimap sprite shape", {
  width: sceneSprite.width,
  height: sceneSprite.height,
  colorMode: sceneSprite.colorMode,
  sourceSceneSizeTiles: sceneSprite.sourceSceneSizeTiles,
  sourceInsetPixels: sceneSprite.sourceInsetPixels,
  pixelsPerTile: sceneSprite.pixelsPerTile,
  cellCount: sceneSprite.cells.length,
  overlayPixelCount: sceneSprite.overlayPixelCount,
  overlayPixelShapes: [...new Set(sceneSprite.overlayPixels.map((pixel) => pixel.shape))],
  segmentCount: sceneSprite.segments.length,
  mapSceneObjectFrames: [...new Set(sceneSprite.mapSceneObjects.map((object) => object.mapSceneId))],
  mapSceneObjectCount: sceneSprite.mapSceneObjectCount,
  mapIconObjectCount: sceneSprite.mapIconObjectCount
}, {
  width: 512,
  height: 512,
  colorMode: "client-palette",
  sourceSceneSizeTiles: 104,
  sourceInsetPixels: 48,
  pixelsPerTile: 4,
  cellCount: 702,
  overlayPixelCount: 425,
  overlayPixelShapes: [7, 4, 3, 10, 2, 8, 9, 6],
  segmentCount: 5,
  mapSceneObjectFrames: [0, 1],
  mapSceneObjectCount: 6,
  mapIconObjectCount: 0
});
assertSame("cache scene minimap TileModel overlay pixel", sceneSprite.overlayPixels[0], {
  key: "tile-overlay:3090:3521:0:7:1:0:0",
  x: 204,
  y: 296,
  color: "#54441a",
  worldX: 3090,
  worldY: 3521,
  underlayId: 64,
  overlayId: 42,
  shape: 7,
  rotation: 1,
  maskIndex: 12
});
const blankTerrainScene = buildNhMinimapSceneSprite(
  {
    ...arena,
    bounds: {
      west: sceneSprite.originWorldTile.x,
      east: sceneSprite.originWorldTile.x,
      south: sceneSprite.originWorldTile.y,
      north: sceneSprite.originWorldTile.y,
      plane: sceneSprite.originWorldTile.plane
    },
    tiles: [
      {
        ...arena.tiles[0],
        x: sceneSprite.originWorldTile.x,
        y: sceneSprite.originWorldTile.y,
        plane: sceneSprite.originWorldTile.plane,
        overlayId: 0,
        overlayPath: 0,
        overlayRotation: 0,
        underlayId: 0
      }
    ]
  },
  [],
  { underlays: [], overlays: [] },
  { textures: [] }
);
assertSame("blank scene minimap tile preserves untouched source pixels", {
  cellCount: blankTerrainScene.cells.length,
  overlayPixelCount: blankTerrainScene.overlayPixelCount
}, {
  cellCount: 0,
  overlayPixelCount: 0
});
assertSame("cache scene minimap map-scene placement", sceneSprite.mapSceneObjects[0], {
  key: "mapscene:1276:3104:3533:11:0:0",
  x: 260,
  y: 244,
  mapSceneId: 0,
  objectId: 1276,
  worldX: 3104,
  worldY: 3533,
  sizeX: 2,
  sizeY: 2,
  type: 11,
  orientation: 0
});
const syntheticMapIconObject = {
  id: 12345,
  name: "synthetic map icon object",
  type: 10,
  orientation: 0,
  x: sceneSprite.originWorldTile.x + 1,
  y: sceneSprite.originWorldTile.y,
  plane: sceneSprite.originWorldTile.plane,
  sizeX: 1,
  sizeY: 1,
  blocksProjectile: false,
  mapSceneId: -1,
  mapIconId: sampleMapIconSprite.areaId
};
const syntheticMapIconScene = buildNhMinimapSceneSprite(arena, [syntheticMapIconObject], floors, textures);
assertSame("cache scene minimap map-icon object", syntheticMapIconScene.mapIconObjects[0], {
  key: `mapicon:12345:${syntheticMapIconObject.x}:${syntheticMapIconObject.y}:10:0:${sampleMapIconSprite.areaId}`,
  x: 260,
  y: 252,
  mapIconId: sampleMapIconSprite.areaId,
  objectId: 12345,
  worldX: syntheticMapIconObject.x,
  worldY: syntheticMapIconObject.y,
  tile: { x: 1, z: 0 },
  type: 10,
  orientation: 0
});
assertSame("cache scene minimap origin", sceneSprite.originWorldTile, { x: 3103, y: 3532, plane: 0 });
assertSame("cache scene minimap local center", nhMinimapSceneCenter(sceneSprite, { x: -2, z: 0 }), {
  x: 250,
  y: 254
});
assertSame("cache scene minimap north transform", nhMinimapSceneTransform(sceneSprite, { x: -2, z: 0 }, 0, mask), {
  centerX: 250,
  centerY: 254,
  angleDegrees: 0,
  left: -178,
  top: -179
});
assertSame("cache scene minimap south transform", nhMinimapSceneTransform(sceneSprite, { x: -2, z: 0 }, 1024, mask), {
  centerX: 250,
  centerY: 254,
  angleDegrees: 180,
  left: -178,
  top: -179
});

const east = nhMinimapDotOffset({
  ...mask,
  deltaX: 4,
  deltaY: 0,
  camAngleY: 0,
  spriteWidth: NH_MINIMAP_DOT_SIZE,
  spriteHeight: NH_MINIMAP_DOT_SIZE
});
assertSame("east dot projection", east, {
  left: 74,
  top: 73,
  rotatedX: 4,
  rotatedY: 0,
  distanceSquared: 16,
  clipped: false
});

const north = nhMinimapDotOffset({
  ...mask,
  deltaX: 0,
  deltaY: 4,
  camAngleY: 0,
  spriteWidth: NH_MINIMAP_DOT_SIZE,
  spriteHeight: NH_MINIMAP_DOT_SIZE
});
assertSame("north dot projection", north, {
  left: 70,
  top: 69,
  rotatedX: 0,
  rotatedY: 4,
  distanceSquared: 16,
  clipped: false
});

const rotated = nhMinimapDotOffset({
  ...mask,
  deltaX: 4,
  deltaY: 0,
  camAngleY: 512,
  spriteWidth: NH_MINIMAP_DOT_SIZE,
  spriteHeight: NH_MINIMAP_DOT_SIZE
});
assertSame("quarter-turn dot projection", rotated, {
  left: 70,
  top: 77,
  rotatedX: 0,
  rotatedY: -4,
  distanceSquared: 16,
  clipped: false
});

const clipped = nhMinimapDotOffset({
  ...mask,
  deltaX: 51,
  deltaY: 0,
  camAngleY: 0,
  spriteWidth: NH_MINIMAP_DOT_SIZE,
  spriteHeight: NH_MINIMAP_DOT_SIZE
});
assert(clipped?.clipped === true, `expected clipped dot beyond 2500 distance squared: ${JSON.stringify(clipped)}`);
assert(
  nhMinimapDotOffset({
    ...mask,
    deltaX: 81,
    deltaY: 0,
    camAngleY: 0,
    spriteWidth: NH_MINIMAP_DOT_SIZE,
    spriteHeight: NH_MINIMAP_DOT_SIZE
  }) === null,
  "expected dots beyond 6400 distance squared to be hidden"
);

const local = nhMinimapLocalPlayerDot(mask);
assertSame("local player center dot", local, { left: 71, top: 74, width: 3, height: 3 });
assert(NH_MINIMAP_LOCAL_PLAYER_DOT_SIZE === 3, "local player dot should use the client fillRectangle width/height");
assert(NH_MINIMAP_LOCAL_PLAYER_DOT_COLOR === 16777215, "local player dot should use the client fillRectangle color");
assertSame("runtime tile to minimap units", nhMinimapActorDeltas({ x: -2, z: 0 }, { x: 2, z: -1 }), {
  deltaX: 16,
  deltaY: -4
});
assertSame(
  "actor minimap position prefers render tile",
  nhMinimapActorTile({ tile: { x: -2, z: 0 }, renderTile: { x: -1.5, z: 0 } }),
  { x: -1.5, z: 0 }
);
assertSame(
  "actor dots use rendered local tile",
  nhMinimapDotsForSnapshot(
    {
      actors: [
        {
          actorId: "local-player",
          tile: { x: -2, z: 0 },
          renderTile: { x: -1.5, z: 0 },
          loadoutId: "kodai-robes",
          sequenceName: "idle",
          facingDegrees: 0,
          markerLabel: "local"
        },
        {
          actorId: "opponent",
          tile: { x: -1, z: 0 },
          loadoutId: "kodai-robes",
          sequenceName: "idle",
          facingDegrees: 0,
          markerLabel: "opponent"
        }
      ],
      minimapEntities: []
    },
    0,
    mask,
    mapDotSpriteSizeForKind
  )[0],
  {
    left: 72,
    top: 73,
    rotatedX: 2,
    rotatedY: 0,
    distanceSquared: 4,
    clipped: false,
    actorId: "opponent",
    kind: "player",
    sourceSpriteIndex: 2,
    width: 4,
    height: 5
  }
);
assert(nhMinimapMapDotSpriteIndex("player") === 2, "plain player dots should use class17.mapDotSprites[2]");
assert(nhMinimapMapDotSpriteIndex("item") === 0, "ground item dots should use class17.mapDotSprites[0]");
assert(nhMinimapMapDotSpriteIndex("npc") === 1, "NPC dots should use class17.mapDotSprites[1]");
assert(nhMinimapMapDotSpriteIndex("friend") === 3, "friend player dots should use class17.mapDotSprites[3]");
assert(nhMinimapMapDotSpriteIndex("team") === 4, "team player dots should use class17.mapDotSprites[4]");
assert(nhMinimapMapDotSpriteIndex("friends-chat") === 5, "friends-chat player dots should use class17.mapDotSprites[5]");
assert(nhMinimapMapMarkerSpriteIndex("destination") === 0, "destination markers should use GameObject.mapMarkerSprites[0]");
assert(nhMinimapMapMarkerSpriteIndex("hint") === 1, "hint markers should use GameObject.mapMarkerSprites[1]");
assertSame(
  "destination tile to minimap units",
  nhMinimapDestinationDeltas({ x: -1, z: 0 }, { x: 0, z: 0 }),
  {
    deltaX: 6,
    deltaY: 2
  }
);
assertSame(
  "destination marker projection",
  nhMinimapDestinationMarker(
    { x: -1, z: 0 },
    { x: 0, z: 0 },
    0,
    mask,
    { width: destinationMarkerSprite.width, height: destinationMarkerSprite.height }
  ),
  {
    left: 74,
    top: 66,
    rotatedX: 6,
    rotatedY: 2,
    distanceSquared: 40,
    clipped: false,
    id: "destination",
    tile: { x: 0, z: 0 },
    kind: "destination",
    sourceSpriteIndex: 0,
    width: 8,
    height: 15
  }
);
const syntheticProjectedMapIcon = nhMinimapMapIconForObject(
  syntheticMapIconScene.mapIconObjects[0],
  { x: 0, z: 0 },
  0,
  mask,
  { width: sampleMapIconSprite.width, height: sampleMapIconSprite.height }
);
assertSame("map-icon object projection", syntheticProjectedMapIcon, {
  left: 6 + Math.trunc(mask.width / 2) - Math.trunc(sampleMapIconSprite.width / 2),
  top: Math.trunc(mask.height / 2) - 2 - Math.trunc(sampleMapIconSprite.height / 2),
  rotatedX: 6,
  rotatedY: 2,
  distanceSquared: 40,
  clipped: false,
  id: syntheticMapIconScene.mapIconObjects[0].key,
  objectId: 12345,
  mapIconId: sampleMapIconSprite.areaId,
  tile: { x: 1, z: 0 },
  width: sampleMapIconSprite.width,
  height: sampleMapIconSprite.height
});
assertSame(
  "client-view source map-icon projection",
  nhMinimapMapIconForSource(
    { id: "live-map-icon-0", objectId: 12345, mapIconId: sampleMapIconSprite.areaId, tile: { x: 1, z: 0 } },
    { x: 0, z: 0 },
    0,
    mask,
    { width: sampleMapIconSprite.width, height: sampleMapIconSprite.height }
  ),
  {
    left: 6 + Math.trunc(mask.width / 2) - Math.trunc(sampleMapIconSprite.width / 2),
    top: Math.trunc(mask.height / 2) - 2 - Math.trunc(sampleMapIconSprite.height / 2),
    rotatedX: 6,
    rotatedY: 2,
    distanceSquared: 40,
    clipped: false,
    id: "live-map-icon-0",
    objectId: 12345,
    mapIconId: sampleMapIconSprite.areaId,
    tile: { x: 1, z: 0 },
    width: sampleMapIconSprite.width,
    height: sampleMapIconSprite.height
  }
);
assertSame(
  "near hint marker projection",
  nhMinimapHintMarker(
    "near-target",
    { x: -1, z: 0 },
    { x: 0, z: 0 },
    0,
    mask,
    { width: 15, height: 15 }
  ),
  {
    left: 71,
    top: 66,
    rotatedX: 6,
    rotatedY: 2,
    distanceSquared: 40,
    clipped: false,
    id: "near-target",
    tile: { x: 0, z: 0 },
    kind: "hint",
    sourceSpriteIndex: 1,
    width: 15,
    height: 15
  }
);
const edgeHint = nhMinimapHintMarker(
  "far-target",
  { x: -2, z: 0 },
  { x: 20, z: 0 },
  0,
  mask,
  { width: 15, height: 15 }
);
assert(edgeHint, "expected far hint marker to render as clipped red hint arrow");
assertSame("far hint marker clipped edge projection", {
  left: edgeHint.left,
  top: edgeHint.top,
  rotatedX: edgeHint.rotatedX,
  rotatedY: edgeHint.rotatedY,
  distanceSquared: edgeHint.distanceSquared,
  clipped: edgeHint.clipped,
  id: edgeHint.id,
  kind: edgeHint.kind,
  sourceSpriteIndex: edgeHint.sourceSpriteIndex,
  width: edgeHint.width,
  height: edgeHint.height,
  rotationDegrees: Math.round(edgeHint.rotationDegrees * 1000) / 1000
}, {
  left: 108,
  top: 54,
  rotatedX: 90,
  rotatedY: 2,
  distanceSquared: 8104,
  clipped: true,
  id: "far-target",
  kind: "hint",
  sourceSpriteIndex: 1,
  width: 20,
  height: 20,
  rotationDegrees: 88.727
});
assert(
  nhMinimapHintMarker("too-far-target", { x: -2, z: 0 }, { x: 80, z: 0 }, 0, mask, { width: 15, height: 15 }) === null,
  "hint markers beyond the client 90000 distance gate should be hidden"
);
assertSame(
  "center minimap click",
  nhMinimapClickToTile({ ...mask, localTile: { x: -2, z: 0 }, clickX: 72, clickY: 75, camAngleY: 0 }),
  {
    tile: { x: -2, z: 0 },
    centeredX: 0,
    centeredY: 0,
    rotatedLocalX: 0,
    rotatedLocalY: 0
  }
);
assertSame(
  "east minimap click",
  nhMinimapClickToTile({ ...mask, localTile: { x: -2, z: 0 }, clickX: 76, clickY: 75, camAngleY: 0 }),
  {
    tile: { x: -1, z: 0 },
    centeredX: 4,
    centeredY: 0,
    rotatedLocalX: 128,
    rotatedLocalY: 0
  }
);
assertSame(
  "north minimap click",
  nhMinimapClickToTile({ ...mask, localTile: { x: -2, z: 0 }, clickX: 72, clickY: 71, camAngleY: 0 }),
  {
    tile: { x: -2, z: 1 },
    centeredX: 0,
    centeredY: -4,
    rotatedLocalX: 0,
    rotatedLocalY: -128
  }
);
assertSame(
  "south camera minimap click",
  nhMinimapClickToTile({ ...mask, localTile: { x: -2, z: 0 }, clickX: 76, clickY: 75, camAngleY: 1024 }),
  {
    tile: { x: -3, z: 0 },
    centeredX: 4,
    centeredY: 0,
    rotatedLocalX: -128,
    rotatedLocalY: 0
  }
);
assert(
  nhMinimapClickToTile({ ...mask, localTile: { x: -2, z: 0 }, clickX: 145, clickY: 75, camAngleY: 0 }) === null,
  "outside minimap click should be rejected before dispatch"
);
assert(nhMinimapMaskContains(mask, 72, 75), "center minimap click should be accepted by SpriteMask rows");
assert(
  nhMinimapMaskContains({ width: 4, height: 1, xStarts: [2], xWidths: [3] }, 5, 0),
  "SpriteMask rows should accept the inclusive source right edge"
);
assert(
  !nhMinimapMaskContains({ width: 4, height: 1, xStarts: [2], xWidths: [3] }, 6, 0),
  "SpriteMask rows should reject points beyond the inclusive source right edge"
);
const rejectedMaskRow = mask.xStarts.findIndex((xStart, y) => xStart > 0 || mask.xWidths[y] < mask.width);
assert(rejectedMaskRow >= 0, "expected fixed minimap SpriteMask rows to contain a clipped row");
const rejectedMaskX = mask.xStarts[rejectedMaskRow] > 0
  ? mask.xStarts[rejectedMaskRow] - 1
  : mask.xStarts[rejectedMaskRow] + mask.xWidths[rejectedMaskRow] + 1;
assert(
  rejectedMaskX >= 0 && rejectedMaskX < mask.width,
  `derived rejected SpriteMask test point must remain inside the minimap rectangle: ${JSON.stringify({ rejectedMaskX, rejectedMaskRow })}`
);
assert(
  !nhMinimapMaskContains(mask, rejectedMaskX, rejectedMaskRow),
  `inside-rect point should be rejected by SpriteMask rows: ${JSON.stringify({ rejectedMaskX, rejectedMaskRow })}`
);
assert(
  nhMinimapClickToTile({
    ...mask,
    localTile: { x: -2, z: 0 },
    clickX: rejectedMaskX,
    clickY: rejectedMaskRow,
    camAngleY: 0
  }) === null,
  "SpriteMask-rejected minimap click should not dispatch movement"
);

const snapshotDots = nhMinimapDotsForSnapshot(
  {
    cycle: 0,
    keyframeCycle: 0,
    camera: null,
    note: "projection fixture",
    actors: [
      {
        actorId: "local-player",
        tile: { x: -2, z: 0 },
        loadoutId: "kodai-robes",
        sequenceName: "idle",
        facingDegrees: 90,
        markerLabel: "local"
      },
      {
        actorId: "opponent",
        tile: { x: 2, z: -1 },
        loadoutId: "acb-hides",
        sequenceName: "idle",
        facingDegrees: -90,
        markerLabel: "opponent"
      }
    ],
    minimapMapIcons: [],
    minimapEntities: [],
    minimapHints: [],
    minimapDestination: null,
    inventory: [],
    hud: {
      hitpoints: 99,
      hitpointsMax: 99,
      prayer: 99,
      prayerMax: 99,
      runEnergy: 100,
      specialEnergy: 100
    }
  },
  0,
  mask,
  mapDotSpriteSizeForKind
);
assert(snapshotDots.length === 1, `expected one non-local player minimap dot: ${JSON.stringify(snapshotDots)}`);
assert(snapshotDots[0].actorId === "opponent", `expected opponent minimap dot: ${JSON.stringify(snapshotDots)}`);
assert(snapshotDots[0].sourceSpriteIndex === 2, `expected player source sprite index 2: ${JSON.stringify(snapshotDots)}`);
assert(snapshotDots[0].width === 4 && snapshotDots[0].height === 5, `expected cache player dot dimensions: ${JSON.stringify(snapshotDots)}`);
assertSame(
  "missing minimap dot sprite suppresses fallback dot",
  nhMinimapDotsForSnapshot(
    {
      cycle: 0,
      keyframeCycle: 0,
      camera: null,
      note: "missing dot sprite fixture",
      actors: [
        {
          actorId: "local-player",
          tile: { x: -2, z: 0 },
          loadoutId: "kodai-robes",
          sequenceName: "idle",
          facingDegrees: 90,
          markerLabel: "local"
        },
        {
          actorId: "opponent",
          tile: { x: 2, z: -1 },
          loadoutId: "acb-hides",
          sequenceName: "idle",
          facingDegrees: -90,
          markerLabel: "opponent"
        }
      ],
      minimapMapIcons: [],
      minimapEntities: [],
      minimapHints: [],
      minimapDestination: null,
      inventory: [],
      hud: {
        hitpoints: 99,
        hitpointsMax: 99,
        prayer: 99,
        prayerMax: 99,
        runEnergy: 100,
        specialEnergy: 100
      }
    },
    0,
    mask,
    () => null
  ),
  []
);
const semanticDots = nhMinimapDotsForSnapshot(
  {
    cycle: 0,
    keyframeCycle: 0,
    camera: null,
    note: "semantic projection fixture",
    actors: [
      {
        actorId: "local-player",
        tile: { x: -2, z: 0 },
        loadoutId: "kodai-robes",
        appearance: { itemIds: [], bodyColors: [0, 0, 0, 0, 0], team: 7, source: "client-view" },
        sequenceName: "idle",
        facingDegrees: 90,
        markerLabel: "local"
      },
      {
        actorId: "opponent",
        tile: { x: 2, z: -1 },
        loadoutId: "acb-hides",
        appearance: { itemIds: [], bodyColors: [0, 0, 0, 0, 0], team: 7, source: "client-view" },
        sequenceName: "idle",
        facingDegrees: -90,
        markerLabel: "opponent"
      }
    ],
    minimapMapIcons: [],
    minimapEntities: [
      { id: "npc-1", tile: { x: -1, z: 0 }, kind: "npc" },
      { id: "item-1", tile: { x: -2, z: 1 }, kind: "item" }
    ],
    minimapHints: [],
    minimapDestination: null,
    inventory: [],
    hud: {
      hitpoints: 99,
      hitpointsMax: 99,
      prayer: 99,
      prayerMax: 99,
      runEnergy: 100,
      specialEnergy: 100
    }
  },
  0,
  mask,
  mapDotSpriteSizeForKind
);
assertSame(
  "minimap semantic dot kinds",
  semanticDots.map((dot) => ({ actorId: dot.actorId, kind: dot.kind, sourceSpriteIndex: dot.sourceSpriteIndex })),
  [
    { actorId: "npc-1", kind: "npc", sourceSpriteIndex: 1 },
    { actorId: "item-1", kind: "item", sourceSpriteIndex: 0 },
    { actorId: "opponent", kind: "team", sourceSpriteIndex: 4 }
  ]
);
const minimapTrace = createMinimapSemanticClientViewTrace();
assertValidClientViewTrace(minimapTrace);
const minimapReplay = clientViewTraceToRuntimeReplay(minimapTrace);
const minimapSnapshot = sampleRuntimeReplayScene(minimapReplay, 0);
assertSame("client-view minimap source conversion", {
  camera: minimapSnapshot.camera,
  minimapState: minimapSnapshot.minimapState,
  minimapMapIcons: minimapSnapshot.minimapMapIcons,
  minimapEntities: minimapSnapshot.minimapEntities,
  minimapHints: minimapSnapshot.minimapHints,
  minimapDestination: minimapSnapshot.minimapDestination,
  opponentDotKind: minimapSnapshot.actors.find((actor) => actor.actorId === "opponent")?.minimapDotKind
}, {
  camera: { yaw: 512, pitch: 192 },
  minimapState: 0,
  minimapMapIcons: [
    { id: "map-icon-source", tile: { x: 3, z: 1 }, mapIconId: 0, objectId: 12345 }
  ],
  minimapEntities: [
    { id: "npc-source", tile: { x: -1, z: 0 }, kind: "npc" },
    { id: "ground-item-source", tile: { x: -2, z: 1 }, kind: "item" }
  ],
  minimapHints: [
    { id: "hint-source", tile: { x: 2, z: 0 } }
  ],
  minimapDestination: { x: 1, z: 1 },
  opponentDotKind: "friends-chat"
});
const disabledMinimapTrace = createDisabledMinimapClientViewTrace();
assertValidClientViewTrace(disabledMinimapTrace);
const disabledMinimapSnapshot = sampleRuntimeReplayScene(clientViewTraceToRuntimeReplay(disabledMinimapTrace), 0);
assertSame("client-view disabled minimap state conversion", {
  minimapState: disabledMinimapSnapshot.minimapState,
  minimapMapIcons: disabledMinimapSnapshot.minimapMapIcons.length,
  minimapEntities: disabledMinimapSnapshot.minimapEntities.length,
  minimapHints: disabledMinimapSnapshot.minimapHints.length,
  minimapDestination: disabledMinimapSnapshot.minimapDestination
}, {
  minimapState: 2,
  minimapMapIcons: 1,
  minimapEntities: 1,
  minimapHints: 1,
  minimapDestination: { x: 1, z: 1 }
});

console.log(
  JSON.stringify(
    {
      ok: true,
      mask,
      east,
      north,
      rotated,
      clipped,
      local,
      syntheticProjectedMapIcon,
      snapshotDots
    },
    null,
    2
  )
);
