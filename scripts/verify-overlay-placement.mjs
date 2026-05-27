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

const {
  NH_PLAYER_DEFAULT_HEIGHT_CLIENT_UNITS,
  nhActorOverlayPlacement,
  nhOverlaySortValue
} = loadTsModule("src/render/nhOverlayPlacement.ts");
const overlayPlacementSource = readFileSync(path.join(projectRoot, "src/render/nhOverlayPlacement.ts"), "utf8");
const runtimeViewerSource = readFileSync(path.join(projectRoot, "src/ui/RuntimeSceneViewer.tsx"), "utf8");
const runtimeSceneSource = readFileSync(path.join(projectRoot, "src/render/runtimeScene.ts"), "utf8");
const clientViewReplaySource = readFileSync(path.join(projectRoot, "src/render/clientViewReplay.ts"), "utf8");
const sourceAnchors = JSON.parse(readFileSync(path.join(projectRoot, "src/evidence/sourceAnchors.json"), "utf8"));

const baseSprite = {
  width: 25,
  height: 25,
  offsetX: 0,
  offsetY: 0
};

function event(spriteSheetId, overrides = {}) {
  return {
    id: `${spriteSheetId}-event`,
    kind: "overlay-sprite",
    label: spriteSheetId,
    startCycle: 0,
    endCycle: 1,
    actorId: "opponent",
    spriteSheetId,
    spriteId: 1,
    ...overrides
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertPlacement(name, actual, expected) {
  assert(actual, `${name} should produce overlay placement`);
  for (const key of Object.keys(expected)) {
    if (actual[key] !== expected[key]) {
      throw new Error(`${name} ${key} mismatch: actual=${actual[key]} expected=${expected[key]}`);
    }
  }
}

function assertNoPlacement(name, actual) {
  assert(actual === null, `${name} should suppress placement when cache sprite metrics are missing`);
}

assert(NH_PLAYER_DEFAULT_HEIGHT_CLIENT_UNITS === 200, "player default overlay height should match client defaultHeight");
assert(!overlayPlacementSource.includes("fallbackWidth"), "overlay placement must not keep handmade fallback sprite widths");
assert(!overlayPlacementSource.includes("fallbackHeight"), "overlay placement must not keep handmade fallback sprite heights");
assert(!runtimeViewerSource.includes("const targetHeight = 1.35"), "runtime actor model height should not use the old handmade 1.35 world-unit scale");
assert(
  runtimeViewerSource.includes("nhClientUnitsToWorldUnits(NH_PLAYER_DEFAULT_HEIGHT_CLIENT_UNITS)"),
  "runtime actor model height should derive from Actor.defaultHeight client units"
);
assert(!runtimeSceneSource.includes("spriteUrl"), "runtime scene overlay events should resolve sprite sheets through source atlas ids, not stale hardcoded URLs");
assert(!clientViewReplaySource.includes("spriteUrl"), "client-view replay overlay events should resolve sprite sheets through source atlas ids, not stale hardcoded URLs");
const sourceAnchorIds = new Set(sourceAnchors.map((anchor) => anchor.id));
assert(sourceAnchorIds.has("client-actor-default-height-contract"), "missing Actor.defaultHeight source anchor");
assert(sourceAnchorIds.has("client-player-model-height-contract"), "missing Player model-height source anchor");
assert(nhOverlaySortValue(event("health_bars")) === 10, "health bars should draw below head icons");
assert(nhOverlaySortValue(event("pk_skull")) === 20, "pk skull sort value mismatch");
assert(nhOverlaySortValue(event("prayer_overheads")) === 30, "prayer overhead sort value mismatch");
assert(nhOverlaySortValue(event("hitsplats")) === 40, "hitsplat sort value mismatch");
assert(nhOverlaySortValue(event("hitsplats", { clientOrder: 1234 })) === 1234, "clientOrder should override default order");

assertPlacement(
  "pk skull",
  nhActorOverlayPlacement(event("pk_skull"), [event("pk_skull")], baseSprite, 0),
  {
    anchorClientUnits: 215,
    centerOffsetXPixels: 0.5,
    centerOffsetYPixelsDown: -17.5
  }
);

assertPlacement(
  "prayer without pk skull",
  nhActorOverlayPlacement(event("prayer_overheads"), [event("prayer_overheads")], baseSprite, 0),
  {
    anchorClientUnits: 215,
    centerOffsetXPixels: 0.5,
    centerOffsetYPixelsDown: -17.5
  }
);

assertPlacement(
  "prayer above pk skull",
  nhActorOverlayPlacement(event("prayer_overheads"), [event("pk_skull"), event("prayer_overheads")], baseSprite, 0),
  {
    anchorClientUnits: 215,
    centerOffsetXPixels: 0.5,
    centerOffsetYPixelsDown: -42.5
  }
);

assertPlacement(
  "sprite draw offset",
  nhActorOverlayPlacement(
    event("pk_skull"),
    [event("pk_skull")],
    { width: 20, height: 20, offsetX: 2, offsetY: 3 },
    0
  ),
  {
    anchorClientUnits: 215,
    centerOffsetXPixels: 0,
    centerOffsetYPixelsDown: -17
  }
);

assertPlacement(
  "health bar first stack",
  nhActorOverlayPlacement(event("health_bars"), [event("health_bars")], { ...baseSprite, height: 5 }, 0),
  {
    anchorClientUnits: 215,
    centerOffsetXPixels: 0,
    centerOffsetYPixelsDown: -0.5
  }
);

assertPlacement(
  "health bar second stack",
  nhActorOverlayPlacement(event("health_bars"), [event("health_bars")], { ...baseSprite, height: 5 }, 1),
  {
    anchorClientUnits: 215,
    centerOffsetXPixels: 0,
    centerOffsetYPixelsDown: -7.5
  }
);

const hitsplatEvent = event("hitsplats");
const hitsplatSlotEvent = event("hitsplats", { hitsplat: { slotIndex: 3 } });
const expectedHitsplatSlots = [
  { centerOffsetXPixels: 0, centerOffsetYPixelsDown: -0.5 },
  { centerOffsetXPixels: 0, centerOffsetYPixelsDown: -20.5 },
  { centerOffsetXPixels: -15, centerOffsetYPixelsDown: -10.5 },
  { centerOffsetXPixels: 15, centerOffsetYPixelsDown: -10.5 },
  { centerOffsetXPixels: 0, centerOffsetYPixelsDown: -0.5 }
];

for (let index = 0; index < expectedHitsplatSlots.length; index += 1) {
  assertPlacement(
    `hitsplat slot ${index}`,
    nhActorOverlayPlacement(hitsplatEvent, [hitsplatEvent], { width: 23, height: 23, offsetX: 0, offsetY: 0 }, index),
    {
      anchorClientUnits: 100,
      ...expectedHitsplatSlots[index]
    }
  );
}

assertPlacement(
  "hitsplat source slot override",
  nhActorOverlayPlacement(hitsplatSlotEvent, [hitsplatSlotEvent], { width: 23, height: 23, offsetX: 0, offsetY: 0 }, 0),
  {
    anchorClientUnits: 100,
    centerOffsetXPixels: 15,
    centerOffsetYPixelsDown: -10.5
  }
);

assertNoPlacement("pk skull without source sprite", nhActorOverlayPlacement(event("pk_skull"), [event("pk_skull")], undefined, 0));
assertNoPlacement(
  "prayer without source sprite",
  nhActorOverlayPlacement(event("prayer_overheads"), [event("prayer_overheads")], undefined, 0)
);
assertNoPlacement(
  "health bar without source sprite",
  nhActorOverlayPlacement(event("health_bars"), [event("health_bars")], undefined, 0)
);
assertNoPlacement("hitsplat without source sprite", nhActorOverlayPlacement(hitsplatEvent, [hitsplatEvent], undefined, 0));

console.log(
  JSON.stringify(
    {
      ok: true,
      playerHeight: NH_PLAYER_DEFAULT_HEIGHT_CLIENT_UNITS,
      sortValues: {
        health: nhOverlaySortValue(event("health_bars")),
        pkSkull: nhOverlaySortValue(event("pk_skull")),
        prayer: nhOverlaySortValue(event("prayer_overheads")),
        hitsplat: nhOverlaySortValue(event("hitsplats"))
      },
      hitsplatSlots: expectedHitsplatSlots.length
    },
    null,
    2
  )
);
