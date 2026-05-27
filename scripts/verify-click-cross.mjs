import { readFileSync, statSync } from "node:fs";
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

const {
  NH_MOUSE_CROSS_DRAW_OFFSET,
  NH_MOUSE_CROSS_FRAME_COUNT,
  NH_MOUSE_CROSS_FRAME_MS,
  NH_MOUSE_CROSS_FRAME_STATE_CYCLES,
  NH_MOUSE_CROSS_LIFETIME_MS,
  NH_MOUSE_CROSS_LIFETIME_STATE,
  NH_MOUSE_CROSS_RED_COLOR,
  NH_MOUSE_CROSS_STATE_STEP,
  NH_MOUSE_CROSS_YELLOW_COLOR,
  createNhClickCrossDefinitionStore,
  nhClickCrossDefinition,
  nhClickCrossExpired,
  nhClickCrossFrameFromElapsedMs,
  nhClickCrossFrameFromState,
  nhClickCrossStateFromElapsedMs
} = loadTsModule("src/render/nhClickCross.ts");
const { assertValidClientViewTrace } = loadTsModule("src/sim/clientView.ts");
const { clientViewTraceToRuntimeReplay, sampleRuntimeReplayScene } = loadTsModule("src/render/clientViewReplay.ts");
const clickCrossSource = readFileSync(path.join(projectRoot, "src", "render", "nhClickCross.ts"), "utf8");
assert(!clickCrossSource.includes("fallbackClickCrossSpriteIds"), "click-cross definitions should not keep hardcoded fallback sprite ids");
assertSame("missing click-cross atlas returns no definitions", [...createNhClickCrossDefinitionStore(null).values()], []);

const clickCrossAtlas = JSON.parse(
  readFileSync(path.join(projectRoot, "fixtures", "render", "sprites", "click_cross.json"), "utf8")
);
assertSame(
  "exported click-cross sprite order",
  clickCrossAtlas.sprites.map((sprite) => sprite.spriteId),
  [515, 516, 517, 518, 519, 520, 521, 522]
);

const definitions = createNhClickCrossDefinitionStore(clickCrossAtlas);
for (let frame = 0; frame < NH_MOUSE_CROSS_FRAME_COUNT; frame += 1) {
  const yellow = nhClickCrossDefinition(definitions, "yellow", frame);
  const red = nhClickCrossDefinition(definitions, "red", frame);
  assertSame(`yellow click-cross frame ${frame}`, yellow, {
    color: "yellow",
    mouseCrossColor: NH_MOUSE_CROSS_YELLOW_COLOR,
    frame,
    spriteId: clickCrossAtlas.sprites[frame].spriteId,
    drawOffset: NH_MOUSE_CROSS_DRAW_OFFSET
  });
  assertSame(`red click-cross frame ${frame}`, red, {
    color: "red",
    mouseCrossColor: NH_MOUSE_CROSS_RED_COLOR,
    frame,
    spriteId: clickCrossAtlas.sprites[frame + NH_MOUSE_CROSS_FRAME_COUNT].spriteId,
    drawOffset: NH_MOUSE_CROSS_DRAW_OFFSET
  });
}

assertSame("client mouse-cross timing constants", {
  frameCount: NH_MOUSE_CROSS_FRAME_COUNT,
  frameStateCycles: NH_MOUSE_CROSS_FRAME_STATE_CYCLES,
  stateStep: NH_MOUSE_CROSS_STATE_STEP,
  lifetimeState: NH_MOUSE_CROSS_LIFETIME_STATE,
  drawOffset: NH_MOUSE_CROSS_DRAW_OFFSET,
  frameMs: NH_MOUSE_CROSS_FRAME_MS,
  lifetimeMs: NH_MOUSE_CROSS_LIFETIME_MS
}, {
  frameCount: 4,
  frameStateCycles: 100,
  stateStep: 20,
  lifetimeState: 400,
  drawOffset: 8,
  frameMs: 100,
  lifetimeMs: 400
});
assert(nhClickCrossFrameFromState(0) === 0, "state 0 should draw frame 0");
assert(nhClickCrossFrameFromState(99) === 0, "state 99 should draw frame 0");
assert(nhClickCrossFrameFromState(100) === 1, "state 100 should draw frame 1");
assert(nhClickCrossFrameFromState(399) === 3, "state 399 should draw frame 3");
assert(nhClickCrossStateFromElapsedMs(99) === 80, "elapsed 99 ms should represent four client cycles");
assert(nhClickCrossFrameFromElapsedMs(100) === 1, "elapsed 100 ms should draw frame 1");
assert(nhClickCrossExpired(399) === false, "click cross should still be visible before state 400");
assert(nhClickCrossExpired(400) === true, "click cross should clear at source state 400");

const baseActor = {
  equipment: {},
  animations: {},
  overheadPrayer: "none",
  skullIcon: "none"
};
const syntheticClickCrossTrace = {
  schemaVersion: "client-view.v1",
  fixtureId: "generated-click-cross-source-v1",
  description: "Synthetic click-cross trace proving live client mouseCross fields reach the runtime scene.",
  actors: ["self", "opponent"],
  sourceAnchorIds: ["client-click-cross-contract"],
  ticks: [
    {
      tick: 0,
      actors: {
        self: {
          ...baseActor,
          actorId: "self",
          tile: { x: 3200, y: 3200, plane: 0 }
        },
        opponent: {
          ...baseActor,
          actorId: "opponent",
          tile: { x: 3201, y: 3200, plane: 0 }
        }
      },
      clickCross: { x: 321, y: 222, color: 2, state: 240 },
      eventIds: []
    }
  ],
  events: []
};
assertValidClientViewTrace(syntheticClickCrossTrace);
const syntheticReplay = clientViewTraceToRuntimeReplay(syntheticClickCrossTrace);
const syntheticSnapshot = sampleRuntimeReplayScene(syntheticReplay, 0);
assertSame("client-view click-cross runtime mapping", syntheticSnapshot.clickCross, {
  x: 321,
  y: 222,
  color: "red",
  state: 240,
  frame: 2
});

const runtimeViewer = readFileSync(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
assert(
  !runtimeViewer.includes('cross.color === "yellow" ? 515 : 519'),
  "RuntimeSceneViewer should not hardcode click-cross sprite id bases"
);
assert(!runtimeViewer.includes("elapsed / 120"), "RuntimeSceneViewer should not hardcode click-cross frame timing");
assert(!runtimeViewer.includes("elapsed >= 480"), "RuntimeSceneViewer should not hardcode click-cross lifetime");
assert(
  !runtimeViewer.includes('backgroundImage: "url(render/sprites/click_cross.png)"'),
  "RuntimeSceneViewer should use exported click-cross atlas metadata for the sprite sheet image"
);
assert(
  runtimeViewer.includes("backgroundImage: `url(render/sprites/${atlas.metadata.image})`"),
  "RuntimeSceneViewer click-cross CSS should resolve its image from the loaded source atlas metadata"
);
assert(
  runtimeViewer.includes("left: cross.x - drawOffset * scale + sprite.offsetX * scale") &&
    runtimeViewer.includes("top: cross.y - drawOffset * scale + sprite.offsetY * scale") &&
    runtimeViewer.includes("width: sprite.width") &&
    runtimeViewer.includes("height: sprite.height") &&
    !runtimeViewer.includes("width: sprite.maxWidth") &&
    !runtimeViewer.includes("height: sprite.maxHeight"),
  "RuntimeSceneViewer should mirror Sprite.method6159 by applying sprite offsets and clipping to subWidth/subHeight to avoid atlas bleed"
);
assert(
  runtimeViewer.includes('if (!layout) {\n    return { display: "none" };\n  }'),
  "RuntimeSceneViewer should suppress click-cross rendering until the source fixed layout is available"
);
assert(
  runtimeViewer.includes("loadTexture(`render/sprites/${metadata.image}`)"),
  "RuntimeSceneViewer should load sprite atlas textures from each exported atlas metadata image"
);
assert(
  runtimeViewer.includes('if (!atlas || !sprite) {\n    return { display: "none" };\n  }'),
  "RuntimeSceneViewer should suppress click-cross rendering when the exported source sprite is missing"
);
assert(
  runtimeViewer.includes("data-source-sprite-id") &&
    runtimeViewer.includes("data-source-mouse-cross-color") &&
    runtimeViewer.includes("data-source-draw-offset") &&
    runtimeViewer.includes("data-source-state") &&
    runtimeViewer.includes("data-source-sprite-width") &&
    runtimeViewer.includes("data-source-sprite-height") &&
    runtimeViewer.includes("data-source-sprite-offset-x") &&
    runtimeViewer.includes("data-source-sprite-offset-y"),
  "RuntimeSceneViewer should expose source-backed click-cross data attributes for runtime validation"
);
assert(
  runtimeViewer.includes("sourceClickCross") && runtimeViewer.includes("visibleClickCross"),
  "RuntimeSceneViewer should render click-cross state from live replay snapshots as well as local interactions"
);

const clientSource = readFileSync(
  path.resolve(
    projectRoot,
    "..",
    "Nh184-Client",
    "runelite-client",
    "src",
    "main",
    "java",
    "net",
    "runelite",
    "standalone",
    "Client.java"
  ),
  "utf8"
);
assert(clientSource.includes("mouseCrossState += 20"), "Nh Client should advance click-cross state by 20 each client cycle");
assert(clientSource.includes("if(mouseCrossState >= 400)"), "Nh Client should expire click-cross state at 400");
assert(
  clientSource.includes("UrlRequest.crossSprites[mouseCrossState / 100].method6159(mouseCrossX - 8, mouseCrossY - 8)") &&
    clientSource.includes("UrlRequest.crossSprites[mouseCrossState / 100 + 4].method6159(mouseCrossX - 8, mouseCrossY - 8)"),
  "Nh Client should draw yellow/red click crosses from mouseCrossState / 100 with an 8px draw offset"
);

const captureImporter = readFileSync(path.join(projectRoot, "scripts", "capture-client-reference.mjs"), "utf8");
assert(captureImporter.includes("validateClientViewClickCross"), "capture-client-reference should validate captured clickCross state");
assert(captureImporter.includes("client-click-cross-contract"), "capture-client-reference should require the click-cross source anchor");

console.log("verified source-backed click-cross definitions and runtime wiring");
