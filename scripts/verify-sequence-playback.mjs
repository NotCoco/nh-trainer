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

function geometryForMetadata(metadata) {
  const { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial } = require("three");
  const positions = new Float32Array(metadata.expandedVertexCount * 3);
  for (let expandedIndex = 0; expandedIndex < metadata.expandedVertexCount; expandedIndex += 1) {
    const sourceIndex = metadata.expandedToSourceVertex[expandedIndex] ?? expandedIndex;
    const base = expandedIndex * 3;
    positions[base] = (sourceIndex % 13) - 6;
    positions[base + 1] = ((sourceIndex * 5) % 17) - 8;
    positions[base + 2] = ((sourceIndex * 7) % 19) - 9;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  const root = new Group();
  root.add(mesh);
  return { root, positions };
}

function positionDelta(before, after) {
  let delta = 0;
  for (let index = 0; index < before.length; index += 1) {
    delta += Math.abs(before[index] - after[index]);
  }
  return delta;
}

function firstBlendedSequenceDelta(primarySequence, movementSequence, metadata, fixtures) {
  let primaryElapsed = 0;
  for (const primaryFrame of primarySequence.frames) {
    let movementElapsed = 0;
    for (const movementFrame of movementSequence.frames.slice(0, 3)) {
      const primaryOnly = geometryForMetadata(metadata);
      attachKronosAnimationMetadata(primaryOnly.root, metadata);
      applyKronosSequenceAnimation(primaryOnly.root, primarySequence, primaryElapsed, fixtures, "primary");

      const blended = geometryForMetadata(metadata);
      attachKronosAnimationMetadata(blended.root, metadata);
      const applied = applyKronosBlendedSequenceAnimation(
        blended.root,
        primarySequence,
        primaryElapsed,
        movementSequence,
        movementElapsed,
        fixtures
      );

      const delta = positionDelta(primaryOnly.positions, blended.positions);
      if (applied.primaryFrame && applied.movementFrame && delta > 0.001) {
        return {
          primaryFrameKey: applied.primaryFrame.frameKey,
          movementFrameKey: applied.movementFrame.frameKey,
          primaryElapsed,
          movementElapsed,
          delta
        };
      }

      movementElapsed += Math.max(1, movementFrame.lengthClientCycles);
    }
    primaryElapsed += Math.max(1, primaryFrame.lengthClientCycles);
  }
  return null;
}

function materialTransparencyByMeshName(root, name) {
  const values = [];
  root.traverse?.((node) => {
    if (!node.isMesh || node.name !== name) {
      return;
    }
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    values.push(...materials.map((material) => material.transparent));
  });
  return values;
}

const {
  createKronosActorSequenceDefinitionStore,
  resolveKronosActorSequence
} = loadTsModule("src/render/kronosActorSequence.ts");
const {
  applyKronosBlendedSequenceAnimation,
  applyKronosSequenceAnimation,
  attachKronosAnimationMetadata,
  kronosRenderSequenceFromRawSequence,
  kronosSequenceBlocksActorMovement,
  kronosSequencePrecedenceAnimating,
  kronosSequencePriority,
  kronosSequencePlaybackMode,
  kronosSourceFrameCursorFromElapsedCycles,
  restoreKronosActorBasePose,
  sampleKronosSequenceFrame
} = loadTsModule("src/render/kronosSequencePlayback.ts");
const { composeKronosPlayerModel } = loadTsModule("src/render/kronosPlayerModel.ts");
const { runtimeLoadouts } = loadTsModule("src/render/runtimeScene.ts");
const { assertValidClientViewTrace } = loadTsModule("src/sim/clientView.ts");
const { clientViewTraceToRuntimeReplay } = loadTsModule("src/render/clientViewReplay.ts");

const walkSequence = readJson("fixtures/render/sequences/walk.json");
const whipSequence = readJson("fixtures/render/sequences/whip_attack.json");
const rawSequences = readJson("fixtures/assets/animations/sequences.json");
const renderSequenceDefinitions = [
  readJson("fixtures/render/sequences/idle.json"),
  { name: "turn", ...kronosRenderSequenceFromRawSequence(rawSequences["823"]) },
  { name: "crossbow_turn", ...kronosRenderSequenceFromRawSequence(rawSequences["823"]) },
  { name: "wand_ready", ...kronosRenderSequenceFromRawSequence(rawSequences["813"]) },
  { name: "wand_walk", ...kronosRenderSequenceFromRawSequence(rawSequences["1205"]) },
  { name: "wand_run", ...kronosRenderSequenceFromRawSequence(rawSequences["1210"]) },
  walkSequence,
  whipSequence,
  { name: "whip_walk", ...kronosRenderSequenceFromRawSequence(rawSequences["1660"]) },
  { name: "whip_run", ...kronosRenderSequenceFromRawSequence(rawSequences["1661"]) },
  { name: "gmaul_ready", ...kronosRenderSequenceFromRawSequence(rawSequences["1662"]) },
  { name: "gmaul_walk", ...kronosRenderSequenceFromRawSequence(rawSequences["1663"]) },
  { name: "gmaul_run", ...kronosRenderSequenceFromRawSequence(rawSequences["1664"]) },
  readJson("fixtures/render/sequences/gmaul_special.json"),
  { name: "crossbow_ready", ...kronosRenderSequenceFromRawSequence(rawSequences["4591"]) },
  { name: "crossbow_walk", ...kronosRenderSequenceFromRawSequence(rawSequences["4226"]) },
  { name: "crossbow_run", ...kronosRenderSequenceFromRawSequence(rawSequences["4228"]) },
  readJson("fixtures/render/sequences/crossbow_attack.json"),
  readJson("fixtures/render/sequences/blitz_cast.json"),
  readJson("fixtures/render/sequences/barrage_cast.json")
];
const actorSequenceDefinitions = createKronosActorSequenceDefinitionStore(renderSequenceDefinitions);
const frameStore = readJson("fixtures/assets/animations/frames.json");
const tentacleMetadata = readJson("fixtures/render/player-loadouts/tentacle-bandos.mesh.json");
const fixtureTrace = readJson("fixtures/sim/client-view-two-actor-duel.json");
const playerModelSources = {
  cacheItems: readJson("fixtures/assets/defs/cache-items.json"),
  kits: readJson("fixtures/assets/defs/kits.json"),
  cacheModels: readJson("fixtures/assets/models/cache-models.json"),
  serverItems: readJson("fixtures/assets/defs/server-items.json"),
  bodyColors: readJson("fixtures/assets/defs/body-colors.json")
};
assertValidClientViewTrace(fixtureTrace);

assert(actorSequenceDefinitions.get(1979) === "barrage_cast", "actor sequence store should resolve barrage_cast from exported render sequence fixtures");
assert(actorSequenceDefinitions.get(1978) === "blitz_cast", "actor sequence store should resolve blitz_cast from exported render sequence fixtures");
assert(actorSequenceDefinitions.get(4230) === "crossbow_attack", "actor sequence store should resolve crossbow_attack from exported render sequence fixtures");
assert(actorSequenceDefinitions.get(823) === "turn", "shared turn sequence id should keep the canonical Kronos turn name instead of the last weapon alias");
assert(actorSequenceDefinitions.get(4591) === "crossbow_ready", "actor sequence store should resolve weapon-ready crossbow pose from Kronos render animations");
assert(actorSequenceDefinitions.get(4226) === "crossbow_walk", "actor sequence store should resolve weapon-specific crossbow walk from Kronos render animations");
assert(actorSequenceDefinitions.get(813) === "wand_ready", "actor sequence store should resolve weapon-ready wand pose from Kronos render animations");

const walking = resolveKronosActorSequence({ pose: 808, movement: 819 }, actorSequenceDefinitions);
assert(walking.sequenceName === "walk", "movement sequence should drive model when it differs from ready pose");
assert(walking.playbackMode === "loop", "movement sequence should loop");

const crossbowReady = resolveKronosActorSequence({ pose: 4591, movement: 4591 }, actorSequenceDefinitions);
assert(crossbowReady.sequenceName === "crossbow_ready", "weapon-ready pose should drive model when movement equals ready");
assert(crossbowReady.playbackMode === "loop", "weapon-ready pose should loop");

const idle = resolveKronosActorSequence({ pose: 808, movement: 808 }, actorSequenceDefinitions);
assert(idle.sequenceName === "idle", "ready pose should drive model when movement equals ready");

const attacking = resolveKronosActorSequence({ pose: 808, movement: 819, action: 4230 }, actorSequenceDefinitions);
assert(attacking.sequenceName === "crossbow_attack", "primary action should win over movement sequence");
assert(attacking.movementSequenceName === "walk", "movement sequence should remain resolved beside primary action");
assert(attacking.playbackMode === "primary", "primary action should use non-looping primary playback");

const walkTotalCycles = walkSequence.frames.reduce((total, frame) => total + frame.lengthClientCycles, 0);
const wrappedWalk = sampleKronosSequenceFrame(walkSequence, walkTotalCycles + 1, "loop");
assert(wrappedWalk?.frameKey === walkSequence.frames[0].frameKey, "movement loop should wrap to first frame");

const whipTotalCycles = whipSequence.frames.reduce((total, frame) => total + frame.lengthClientCycles, 0);
const finalWhipFrame = sampleKronosSequenceFrame(whipSequence, whipTotalCycles - 1, "primary");
assert(finalWhipFrame?.frameKey === whipSequence.frames[whipSequence.frames.length - 1].frameKey, "primary action should reach final frame");
assert(sampleKronosSequenceFrame(whipSequence, whipTotalCycles, "primary") === null, "primary action should terminate at sequence end when frameStep is -1");
assert(kronosSequencePlaybackMode("whip_attack") === "primary", "attack sequence should default to primary playback");
assert(kronosSequencePlaybackMode("walk") === "loop", "walk sequence should default to loop playback");
assert(kronosSequencePlaybackMode("crossbow_ready") === "loop", "weapon-ready sequence should default to loop playback");
assert(kronosSequencePlaybackMode("crossbow_walk") === "loop", "weapon-walk sequence should default to loop playback");
assert(kronosSequencePlaybackMode("crossbow_run") === "loop", "weapon-run sequence should default to loop playback");
assert(whipSequence.interleaveLeave?.includes(9999999), "whip attack render sequence should export client interleave labels");

const rawCrossbowSequence = kronosRenderSequenceFromRawSequence(rawSequences["4230"]);
const rawWhipSequence = kronosRenderSequenceFromRawSequence(rawSequences["1658"]);
assert(
  kronosSequencePrecedenceAnimating(rawCrossbowSequence) === 0 && kronosSequencePriority(rawCrossbowSequence) === 0,
  "crossbow sequence defaults should match client postDecode movement-blocking fields"
);
assert(
  kronosSequenceBlocksActorMovement(rawCrossbowSequence, 1),
  "crossbow action should block path movement while the client sequence says precedenceAnimating is zero"
);
assert(
  !kronosSequenceBlocksActorMovement(rawWhipSequence, 1),
  "whip action interleave labels should keep movement blending available instead of blocking path movement"
);

const blendFixtures = {
  frameStore,
  sequences: new Map([
    ["walk", walkSequence],
    ["whip_attack", whipSequence]
  ]),
  sequencesById: new Map([
    [819, walkSequence],
    [1658, whipSequence]
  ])
};
const blendedDelta = firstBlendedSequenceDelta(whipSequence, walkSequence, tentacleMetadata, blendFixtures);
assert(blendedDelta, "primary-plus-movement sequence blending should alter interleaved mesh labels");

const smoothingMetadata = {
  sourceVertexCount: 1,
  expandedVertexCount: 1,
  sourceVertexGroups: [1],
  expandedToSourceVertex: [0]
};
const smoothingSequence = {
  sequenceId: 99901,
  frames: [
    { frameKey: "smooth:0", lengthClientCycles: 10 },
    { frameKey: "smooth:1", lengthClientCycles: 10 }
  ]
};
const smoothingFixtures = {
  frameStore: {
    frames: {
      "smooth:0": { transforms: [{ label: 0, type: 1, groups: [1], x: 0, y: 0, z: 0 }] },
      "smooth:1": { transforms: [{ label: 0, type: 1, groups: [1], x: 10, y: 0, z: 0 }] }
    }
  },
  sequences: new Map([["smooth", smoothingSequence]]),
  sequencesById: new Map([[99901, smoothingSequence]])
};
const unsmoothed = geometryForMetadata(smoothingMetadata);
attachKronosAnimationMetadata(unsmoothed.root, smoothingMetadata);
applyKronosSequenceAnimation(unsmoothed.root, smoothingSequence, 5, smoothingFixtures, "primary");
const smoothed = geometryForMetadata(smoothingMetadata);
attachKronosAnimationMetadata(smoothed.root, smoothingMetadata);
applyKronosSequenceAnimation(smoothed.root, smoothingSequence, 5, smoothingFixtures, "primary", { interpolateFrames: true });
assert(
  smoothed.positions[0] - unsmoothed.positions[0] === 5,
  "RuneLite Animation Smoothing should interpolate player sequence transforms between current and next frame"
);
const unsmoothedSourceCursor = geometryForMetadata(smoothingMetadata);
attachKronosAnimationMetadata(unsmoothedSourceCursor.root, smoothingMetadata);
applyKronosSequenceAnimation(unsmoothedSourceCursor.root, smoothingSequence, 0, smoothingFixtures, "primary", {
  frameCursor: { frameIndex: 0, frameCycle: 10 }
});
const smoothedSourceCursor = geometryForMetadata(smoothingMetadata);
attachKronosAnimationMetadata(smoothedSourceCursor.root, smoothingMetadata);
applyKronosSequenceAnimation(smoothedSourceCursor.root, smoothingSequence, 0, smoothingFixtures, "primary", {
  interpolateFrames: true,
  frameCursor: { frameIndex: 0, frameCycle: 10 }
});
assert(
  smoothedSourceCursor.positions[0] - unsmoothedSourceCursor.positions[0] === 10,
  "source-style Animation Smoothing should use movementFrameCycle directly, including the final frame-length cycle"
);
const smoothedFractionalCursor = geometryForMetadata(smoothingMetadata);
attachKronosAnimationMetadata(smoothedFractionalCursor.root, smoothingMetadata);
applyKronosSequenceAnimation(smoothedFractionalCursor.root, smoothingSequence, 0, smoothingFixtures, "primary", {
  interpolateFrames: true,
  frameCursor: { frameIndex: 0, frameCycle: 5.5 }
});
assert(
  smoothedFractionalCursor.positions[0] - unsmoothedSourceCursor.positions[0] === 5.5,
  "browser-frame Animation Smoothing should preserve fractional client-cycle progress instead of truncating it"
);
const primaryEndCursor = kronosSourceFrameCursorFromElapsedCycles(smoothingSequence, 10, "primary");
assert(
  primaryEndCursor?.frameIndex === 0 && primaryEndCursor.frameCycle === 10,
  "source-style primary action cursor should keep the final cycle on the current frame before advancing"
);
const primaryFractionalCursor = kronosSourceFrameCursorFromElapsedCycles(smoothingSequence, 10.5, "primary");
assert(
  primaryFractionalCursor?.frameIndex === 1 && primaryFractionalCursor.frameCycle === 0.5,
  "source-style primary action cursor should carry fractional browser progress into the next frame"
);

const tentacleLoadout = runtimeLoadouts.find((loadout) => loadout.id === "tentacle-bandos");
assert(tentacleLoadout, "runtime loadouts should include tentacle-bandos");
const composedTentacle = composeKronosPlayerModel(playerModelSources, {
  itemIds: tentacleLoadout.itemIds,
  bodyColors: tentacleLoadout.bodyColors
});
attachKronosAnimationMetadata(composedTentacle.scene, composedTentacle.metadata);
const attachedOpaqueTransparency = materialTransparencyByMeshName(
  composedTentacle.scene,
  "cache-composed-player-appearance-opaque"
);
const attachedAlphaTransparency = materialTransparencyByMeshName(
  composedTentacle.scene,
  "cache-composed-player-appearance-alpha"
);
restoreKronosActorBasePose(composedTentacle.scene);
const opaqueTransparency = materialTransparencyByMeshName(
  composedTentacle.scene,
  "cache-composed-player-appearance-opaque"
);
const alphaTransparency = materialTransparencyByMeshName(
  composedTentacle.scene,
  "cache-composed-player-appearance-alpha"
);
assert(
  attachedOpaqueTransparency.length > 0 && attachedOpaqueTransparency.every((transparent) => transparent === false),
  "opaque player submesh must stay opaque when sequence metadata is attached"
);
assert(
  attachedAlphaTransparency.length > 0 && attachedAlphaTransparency.every((transparent) => transparent === true),
  "alpha player submesh should stay transparent when sequence metadata is attached"
);
assert(
  opaqueTransparency.length > 0 && opaqueTransparency.every((transparent) => transparent === false),
  "opaque player submesh must stay opaque after sequence alpha restore"
);
assert(
  alphaTransparency.length > 0 && alphaTransparency.every((transparent) => transparent === true),
  "alpha player submesh should remain transparent after sequence alpha restore"
);

const [walkFrameGroup, walkFrameId] = walkSequence.frames[0].frameKey.split(":").map((part) => Number(part));
const overrideSequence = kronosRenderSequenceFromRawSequence({
  id: 12345,
  frameIDs: [(walkFrameGroup << 16) + walkFrameId],
  frameLenghts: [walkSequence.frames[0].lengthClientCycles],
  leftHandItem: 6889 + 512,
  rightHandItem: 6914 + 512
});
assert(overrideSequence.shieldOverrideId === 6889 + 512, "cache leftHandItem should map to client shield override");
assert(overrideSequence.weaponOverrideId === 6914 + 512, "cache rightHandItem should map to client weapon override");

const replay = clientViewTraceToRuntimeReplay(fixtureTrace, { actorSequenceDefinitions });
const tick1Local = replay.timeline.find((tick) => tick.cycle === 1)?.actors.find((actor) => actor.actorId === "local-player");
assert(tick1Local?.sequenceName === "barrage_cast", "fixture tick 1 local actor should use primary barrage cast");
assert(tick1Local?.sequenceMode === "primary", "fixture tick 1 local actor should mark action as primary");
assert(tick1Local?.animationCycle === 0, "primary action cycle should start at zero in replay");
assert(tick1Local?.movementSequenceName === "walk", "primary action pose should retain movement sequence for blended playback");
assert(tick1Local?.movementAnimationCycle === 1, "blended movement sequence should keep advancing on the replay cycle");

const tick2Local = replay.timeline.find((tick) => tick.cycle === 2)?.actors.find((actor) => actor.actorId === "local-player");
assert(tick2Local?.sequenceName === "walk", "fixture tick 2 local actor should use walk instead of idle when movement differs from pose");
assert(tick2Local?.sequenceMode === "loop", "fixture tick 2 walk should use loop playback");
assert(tick2Local?.animationCycle === 2, "movement playback should advance on the replay cycle");

console.log(
  JSON.stringify(
    {
      ok: true,
      selection: {
        sourceDefinitions: actorSequenceDefinitions.size,
        walking: walking.sequenceName,
        attacking: attacking.sequenceName,
        attackingMovement: attacking.movementSequenceName
      },
      playback: {
        walkTotalCycles,
        wrappedWalk: wrappedWalk.frameKey,
        whipTotalCycles,
        primaryTerminates: true,
        shieldOverrideId: overrideSequence.shieldOverrideId,
        weaponOverrideId: overrideSequence.weaponOverrideId,
        blendedDelta,
        smoothingDeltaX: smoothed.positions[0] - unsmoothed.positions[0],
        smoothingSourceCursorDeltaX: smoothedSourceCursor.positions[0] - unsmoothedSourceCursor.positions[0],
        smoothingFractionalCursorDeltaX: smoothedFractionalCursor.positions[0] - unsmoothedSourceCursor.positions[0],
        primaryEndCursor,
        primaryFractionalCursor,
        tentacleAttachedOpaqueMeshTransparent: attachedOpaqueTransparency,
        tentacleAttachedAlphaMeshTransparent: attachedAlphaTransparency,
        tentacleOpaqueMeshTransparent: opaqueTransparency,
        tentacleAlphaMeshTransparent: alphaTransparency
      },
      replay: {
        tick1Local: tick1Local.sequenceName,
        tick1Movement: tick1Local.movementSequenceName,
        tick2Local: tick2Local.sequenceName,
        tick2AnimationCycle: tick2Local.animationCycle
      }
    },
    null,
    2
  )
);
