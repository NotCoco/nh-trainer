import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const legacySourceName = ["Kro", "nos"].join("");
const legacySourceNameLower = legacySourceName.toLowerCase();
const sourceRoot = process.env.NH_SOURCE_ROOT
  ? path.resolve(process.env.NH_SOURCE_ROOT)
  : path.join(
    workspaceRoot,
    `${legacySourceNameLower}-osrs-184-master`,
    `${legacySourceNameLower}-osrs-184-master`,
    `${legacySourceName}-master`
  );
const serverRoot = process.env.NH_SERVER_JAVA_RUIN_ROOT
  ? path.resolve(process.env.NH_SERVER_JAVA_RUIN_ROOT)
  : path.join(sourceRoot, `${legacySourceNameLower}-server`, "src", "main", "java", "io", "ruin");
const clientSourceRoot = process.env.NH_CLIENT_SOURCE_ROOT
  ? path.resolve(process.env.NH_CLIENT_SOURCE_ROOT)
  : path.join(workspaceRoot, `${legacySourceName}184-Client`, "runelite-client", "src", "main");
const clientStandaloneRoot = path.join(clientSourceRoot, "java", "net", "runelite", "standalone");
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

function extractBlockSource(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert(markerIndex !== -1, `Could not find source marker: ${marker}`);
  const openBraceIndex = source.indexOf("{", markerIndex);
  assert(openBraceIndex !== -1, `Could not find source block for marker: ${marker}`);
  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(markerIndex, index + 1);
      }
    }
  }
  throw new Error(`Could not close source block for marker: ${marker}`);
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
      attachNhAnimationMetadata(primaryOnly.root, metadata);
      applyNhSequenceAnimation(primaryOnly.root, primarySequence, primaryElapsed, fixtures, "primary");

      const blended = geometryForMetadata(metadata);
      attachNhAnimationMetadata(blended.root, metadata);
      const applied = applyNhBlendedSequenceAnimation(
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
  createNhActorSequenceDefinitionStore,
  resolveNhActorSequence
} = loadTsModule("src/render/nhActorSequence.ts");
const {
  applyNhBlendedSequenceAnimation,
  applyNhSequenceAnimation,
  attachNhAnimationMetadata,
  nhRenderSequenceFromRawSequence,
  nhSequenceBlocksActorMovement,
  nhSequencePrecedenceAnimating,
  nhSequencePriority,
  nhSequencePlaybackMode,
  nhSourceFrameCursorFromElapsedCycles,
  restoreNhActorBasePose,
  sampleNhSequenceFrame
} = loadTsModule("src/render/nhSequencePlayback.ts");
const { composeNhPlayerModel } = loadTsModule("src/render/nhPlayerModel.ts");
const { runtimeLoadouts } = loadTsModule("src/render/runtimeScene.ts");
const { assertValidClientViewTrace } = loadTsModule("src/sim/clientView.ts");
const { clientViewTraceToRuntimeReplay } = loadTsModule("src/render/clientViewReplay.ts");

const walkSequence = readJson("fixtures/render/sequences/walk.json");
const whipSequence = readJson("fixtures/render/sequences/whip_attack.json");
const rawSequences = readJson("fixtures/assets/animations/sequences.json");
const renderSequenceDefinitions = [
  readJson("fixtures/render/sequences/idle.json"),
  { name: "turn", ...nhRenderSequenceFromRawSequence(rawSequences["823"]) },
  { name: "crossbow_turn", ...nhRenderSequenceFromRawSequence(rawSequences["823"]) },
  { name: "wand_ready", ...nhRenderSequenceFromRawSequence(rawSequences["813"]) },
  { name: "wand_walk", ...nhRenderSequenceFromRawSequence(rawSequences["1205"]) },
  { name: "wand_run", ...nhRenderSequenceFromRawSequence(rawSequences["1210"]) },
  walkSequence,
  whipSequence,
  { name: "whip_walk", ...nhRenderSequenceFromRawSequence(rawSequences["1660"]) },
  { name: "whip_run", ...nhRenderSequenceFromRawSequence(rawSequences["1661"]) },
  { name: "gmaul_ready", ...nhRenderSequenceFromRawSequence(rawSequences["1662"]) },
  { name: "gmaul_walk", ...nhRenderSequenceFromRawSequence(rawSequences["1663"]) },
  { name: "gmaul_run", ...nhRenderSequenceFromRawSequence(rawSequences["1664"]) },
  readJson("fixtures/render/sequences/gmaul_special.json"),
  { name: "crossbow_ready", ...nhRenderSequenceFromRawSequence(rawSequences["4591"]) },
  { name: "crossbow_walk", ...nhRenderSequenceFromRawSequence(rawSequences["4226"]) },
  { name: "crossbow_run", ...nhRenderSequenceFromRawSequence(rawSequences["4228"]) },
  readJson("fixtures/render/sequences/crossbow_attack.json"),
  readJson("fixtures/render/sequences/blitz_cast.json"),
  readJson("fixtures/render/sequences/barrage_cast.json")
];
const actorSequenceDefinitions = createNhActorSequenceDefinitionStore(renderSequenceDefinitions);
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
const runtimeSceneViewerSource = readFileSync(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
const runtimePlayerCombatSource = readFileSync(path.join(projectRoot, "src", "sim", "runtimePlayerCombat.ts"), "utf8");
const clientActorMovementSource = readFileSync(path.join(clientStandaloneRoot, "class329.java"), "utf8");
const serverTabInventorySource = readFileSync(
  path.join(serverRoot, "model", "inter", "handlers", "TabInventory.java"),
  "utf8"
);
const serverEquipmentSource = readFileSync(
  path.join(serverRoot, "model", "item", "containers", "Equipment.java"),
  "utf8"
);
const serverPlayerCombatSource = readFileSync(
  path.join(serverRoot, "model", "entity", "player", "PlayerCombat.java"),
  "utf8"
);
const serverDirectionUpdateSource = readFileSync(
  path.join(serverRoot, "model", "entity", "shared", "masks", "EntityDirectionUpdate.java"),
  "utf8"
);
assertValidClientViewTrace(fixtureTrace);

assert(actorSequenceDefinitions.get(1979) === "barrage_cast", "actor sequence store should resolve barrage_cast from exported render sequence fixtures");
assert(actorSequenceDefinitions.get(1978) === "blitz_cast", "actor sequence store should resolve blitz_cast from exported render sequence fixtures");
assert(actorSequenceDefinitions.get(4230) === "crossbow_attack", "actor sequence store should resolve crossbow_attack from exported render sequence fixtures");
assert(actorSequenceDefinitions.get(823) === "turn", "shared turn sequence id should keep the canonical Nh turn name instead of the last weapon alias");
assert(actorSequenceDefinitions.get(4591) === "crossbow_ready", "actor sequence store should resolve weapon-ready crossbow pose from Nh render animations");
assert(actorSequenceDefinitions.get(4226) === "crossbow_walk", "actor sequence store should resolve weapon-specific crossbow walk from Nh render animations");
assert(actorSequenceDefinitions.get(813) === "wand_ready", "actor sequence store should resolve weapon-ready wand pose from Nh render animations");

const walking = resolveNhActorSequence({ pose: 808, movement: 819 }, actorSequenceDefinitions);
assert(walking.sequenceName === "walk", "movement sequence should drive model when it differs from ready pose");
assert(walking.playbackMode === "loop", "movement sequence should loop");

const crossbowReady = resolveNhActorSequence({ pose: 4591, movement: 4591 }, actorSequenceDefinitions);
assert(crossbowReady.sequenceName === "crossbow_ready", "weapon-ready pose should drive model when movement equals ready");
assert(crossbowReady.playbackMode === "loop", "weapon-ready pose should loop");

const idle = resolveNhActorSequence({ pose: 808, movement: 808 }, actorSequenceDefinitions);
assert(idle.sequenceName === "idle", "ready pose should drive model when movement equals ready");

const attacking = resolveNhActorSequence({ pose: 808, movement: 819, action: 4230 }, actorSequenceDefinitions);
assert(attacking.sequenceName === "crossbow_attack", "primary action should win over movement sequence");
assert(attacking.movementSequenceName === "walk", "movement sequence should remain resolved beside primary action");
assert(attacking.playbackMode === "primary", "primary action should use non-looping primary playback");

const walkTotalCycles = walkSequence.frames.reduce((total, frame) => total + frame.lengthClientCycles, 0);
const wrappedWalk = sampleNhSequenceFrame(walkSequence, walkTotalCycles + 1, "loop");
assert(wrappedWalk?.frameKey === walkSequence.frames[0].frameKey, "movement loop should wrap to first frame");

const whipTotalCycles = whipSequence.frames.reduce((total, frame) => total + frame.lengthClientCycles, 0);
const finalWhipFrame = sampleNhSequenceFrame(whipSequence, whipTotalCycles - 1, "primary");
assert(finalWhipFrame?.frameKey === whipSequence.frames[whipSequence.frames.length - 1].frameKey, "primary action should reach final frame");
assert(sampleNhSequenceFrame(whipSequence, whipTotalCycles, "primary") === null, "primary action should terminate at sequence end when frameStep is -1");
assert(nhSequencePlaybackMode("whip_attack") === "primary", "attack sequence should default to primary playback");
assert(nhSequencePlaybackMode("walk") === "loop", "walk sequence should default to loop playback");
assert(nhSequencePlaybackMode("crossbow_ready") === "loop", "weapon-ready sequence should default to loop playback");
assert(nhSequencePlaybackMode("crossbow_walk") === "loop", "weapon-walk sequence should default to loop playback");
assert(nhSequencePlaybackMode("crossbow_run") === "loop", "weapon-run sequence should default to loop playback");
assert(whipSequence.interleaveLeave?.includes(9999999), "whip attack render sequence should export client interleave labels");

const rawCrossbowSequence = nhRenderSequenceFromRawSequence(rawSequences["4230"]);
const rawWhipSequence = nhRenderSequenceFromRawSequence(rawSequences["1658"]);
assert(
  nhSequencePrecedenceAnimating(rawCrossbowSequence) === 0 && nhSequencePriority(rawCrossbowSequence) === 0,
  "crossbow sequence defaults should match client postDecode movement-blocking fields"
);
assert(
  nhSequenceBlocksActorMovement(rawCrossbowSequence, 1),
  "crossbow action should block path movement while the client sequence says precedenceAnimating is zero"
);
assert(
  !nhSequenceBlocksActorMovement(rawWhipSequence, 1),
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
attachNhAnimationMetadata(unsmoothed.root, smoothingMetadata);
applyNhSequenceAnimation(unsmoothed.root, smoothingSequence, 5, smoothingFixtures, "primary");
const smoothed = geometryForMetadata(smoothingMetadata);
attachNhAnimationMetadata(smoothed.root, smoothingMetadata);
applyNhSequenceAnimation(smoothed.root, smoothingSequence, 5, smoothingFixtures, "primary", { interpolateFrames: true });
assert(
  smoothed.positions[0] - unsmoothed.positions[0] === 5,
  "RuneLite Animation Smoothing should interpolate player sequence transforms between current and next frame"
);
const unsmoothedSourceCursor = geometryForMetadata(smoothingMetadata);
attachNhAnimationMetadata(unsmoothedSourceCursor.root, smoothingMetadata);
applyNhSequenceAnimation(unsmoothedSourceCursor.root, smoothingSequence, 0, smoothingFixtures, "primary", {
  frameCursor: { frameIndex: 0, frameCycle: 10 }
});
const smoothedSourceCursor = geometryForMetadata(smoothingMetadata);
attachNhAnimationMetadata(smoothedSourceCursor.root, smoothingMetadata);
applyNhSequenceAnimation(smoothedSourceCursor.root, smoothingSequence, 0, smoothingFixtures, "primary", {
  interpolateFrames: true,
  frameCursor: { frameIndex: 0, frameCycle: 10 }
});
assert(
  smoothedSourceCursor.positions[0] - unsmoothedSourceCursor.positions[0] === 10,
  "source-style Animation Smoothing should use movementFrameCycle directly, including the final frame-length cycle"
);
const smoothedFractionalCursor = geometryForMetadata(smoothingMetadata);
attachNhAnimationMetadata(smoothedFractionalCursor.root, smoothingMetadata);
applyNhSequenceAnimation(smoothedFractionalCursor.root, smoothingSequence, 0, smoothingFixtures, "primary", {
  interpolateFrames: true,
  frameCursor: { frameIndex: 0, frameCycle: 5.5 }
});
assert(
  smoothedFractionalCursor.positions[0] - unsmoothedSourceCursor.positions[0] === 5.5,
  "browser-frame Animation Smoothing should preserve fractional client-cycle progress instead of truncating it"
);
const primaryEndCursor = nhSourceFrameCursorFromElapsedCycles(smoothingSequence, 10, "primary");
assert(
  primaryEndCursor?.frameIndex === 0 && primaryEndCursor.frameCycle === 10,
  "source-style primary action cursor should keep the final cycle on the current frame before advancing"
);
const primaryFractionalCursor = nhSourceFrameCursorFromElapsedCycles(smoothingSequence, 10.5, "primary");
assert(
  primaryFractionalCursor?.frameIndex === 1 && primaryFractionalCursor.frameCycle === 0.5,
  "source-style primary action cursor should carry fractional browser progress into the next frame"
);

const tentacleLoadout = runtimeLoadouts.find((loadout) => loadout.id === "tentacle-bandos");
assert(tentacleLoadout, "runtime loadouts should include tentacle-bandos");
const composedTentacle = composeNhPlayerModel(playerModelSources, {
  itemIds: tentacleLoadout.itemIds,
  bodyColors: tentacleLoadout.bodyColors
});
attachNhAnimationMetadata(composedTentacle.scene, composedTentacle.metadata);
const attachedPlayerTransparency = materialTransparencyByMeshName(
  composedTentacle.scene,
  "cache-composed-player-appearance"
);
restoreNhActorBasePose(composedTentacle.scene);
const restoredPlayerTransparency = materialTransparencyByMeshName(
  composedTentacle.scene,
  "cache-composed-player-appearance"
);
assert(
  attachedPlayerTransparency.length > 0 && attachedPlayerTransparency.every((transparent) => transparent === true),
  "single painter-ordered player mesh should stay in the transparent render pass when sequence metadata is attached"
);
assert(
  restoredPlayerTransparency.length > 0 && restoredPlayerTransparency.every((transparent) => transparent === true),
  "single painter-ordered player mesh should remain in the transparent render pass after sequence alpha restore"
);

const [walkFrameGroup, walkFrameId] = walkSequence.frames[0].frameKey.split(":").map((part) => Number(part));
const overrideSequence = nhRenderSequenceFromRawSequence({
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

assert(
  serverTabInventorySource.includes("player.getEquipment().equip(item);") &&
    serverTabInventorySource.includes("player.resetActions(false, player.getMovement().following != null, true);") &&
    serverEquipmentSource.includes("if(!player.recentlyEquipped.isDelayed() && equipSlot == Equipment.SLOT_WEAPON)") &&
    serverEquipmentSource.includes("player.recentlyEquipped.delay(1);") &&
    serverEquipmentSource.includes("// player.resetAnimation();"),
  "Nh equipment source no longer matches the assumption that equipping does not reset the current animation sequence"
);
const applyLoadoutMutationSource = extractBlockSource(
  runtimeSceneViewerSource,
  "const applyInventoryActorLoadoutMutation ="
);
const cacheRuntimeActorModelsSource = extractBlockSource(
  runtimeSceneViewerSource,
  "const cacheRuntimeActorModels ="
);
const ensureLocalActorEquipmentModelSource = extractBlockSource(
  runtimeSceneViewerSource,
  "const ensureLocalActorEquipmentModel ="
);
const equipmentOverrideModelEffectSource = extractBlockSource(
  runtimeSceneViewerSource,
  "useEffect(() => {\n    if (!equipmentOverride"
);
for (const snippet of [
  "wasManualControl ? manualActorRef.current : snapshotActor",
  "loadoutId",
  "appearance",
  "setRuntimePlayerCombatLoadout",
  "manualActorRef.current = nextActor",
  "setManualActor(nextActor)"
]) {
  assert(
    applyLoadoutMutationSource.includes(snippet),
    `applyInventoryActorLoadoutMutation should preserve the manual actor and only patch appearance/loadout state: ${snippet}`
  );
}
for (const forbiddenSnippet of [
  "activeSequenceKey:",
  "completedSequenceKey:",
  "sequencePathLengthAtStart:",
  "primaryFrame:",
  "primaryFrameCycle:",
  "primarySequenceCycle:",
  "routeWaypoints: []",
  "logicalRouteWaypoints: []",
  "clientPosition: nhClientPositionFromRuntimeTile",
  "setManualActor((currentActor)"
]) {
  assert(
    !applyLoadoutMutationSource.includes(forbiddenSnippet),
    `applyInventoryActorLoadoutMutation must not reset source animation/path cursor state on equip: ${forbiddenSnippet}`
  );
}
assert(
  cacheRuntimeActorModelsSource.includes("modelsRef.current = currentModels") &&
    cacheRuntimeActorModelsSource.includes("setModels(currentModels)") &&
    ensureLocalActorEquipmentModelSource.includes("cacheRuntimeActorModels([pose])") &&
    !ensureLocalActorEquipmentModelSource.includes("composeNhPlayerModel(") &&
    equipmentOverrideModelEffectSource.includes("cacheRuntimeActorModels([localPose])") &&
    !equipmentOverrideModelEffectSource.includes("composeNhPlayerModel(") &&
    !equipmentOverrideModelEffectSource.includes("setModels(") &&
    runtimeSceneViewerSource.includes("RUNTIME_EQUIPMENT_MODEL_PREWARM_SEQUENCE_NAMES") &&
    runtimeSceneViewerSource.includes("runtimeSwitchableEquipmentModelSignature(equipmentItems, inventorySlots)") &&
    runtimeSceneViewerSource.includes("runtimeSwitchableEquipmentModelStates") &&
    runtimeSceneViewerSource.includes("PlayerAppearance_cachedModels") &&
    runtimeSceneViewerSource.includes("sequenceMode: sequenceName === \"idle\" ? \"loop\" : \"primary\""),
  "equipment swaps during a held primary sequence should use the shared/prewarmed model cache with a stable item-set signature instead of composing a new player model in the equip click path"
);
const advanceManualActorSource = extractBlockSource(
  runtimeSceneViewerSource,
  "function advanceManualActor(\n  actor"
);
const manualActorHasClientTargetIndexSource = extractBlockSource(
  runtimeSceneViewerSource,
  "function manualActorHasClientTargetIndex"
);
assert(
  advanceManualActorSource.includes("manualActorHasClientTargetIndex(currentActor, combatActor, cycle)") &&
    manualActorHasClientTargetIndexSource.includes("combatActor !== null && combatActor.targetId !== null") &&
    manualActorHasClientTargetIndexSource.includes("actor.clientTargetIndexUntilClientCycle >= clientCycle") &&
    runtimeSceneViewerSource.includes("manualActorWithClientTargetIndexHold") &&
    runtimeSceneViewerSource.includes("NH_CLIENT_TARGET_INDEX_RESET_HOLD_CYCLES") &&
    !manualActorHasClientTargetIndexSource.includes("lastTargetTimeoutTicks") &&
    runtimeSceneViewerSource.includes("NH_CLIENT_TARGET_INDEX_EQUIP_RESET_HOLD_CYCLES") &&
    runtimeSceneViewerSource.includes("event.kind !== \"attack\" || event.spellId === undefined || event.autocast === true") &&
    serverPlayerCombatSource.includes("if(!autocast)") &&
    serverPlayerCombatSource.includes("reset();") &&
    serverPlayerCombatSource.includes("player.faceNone(!isDead());") &&
    serverDirectionUpdateSource.includes("public void remove(boolean delay)") &&
    serverDirectionUpdateSource.includes("stage = 1;") &&
    serverDirectionUpdateSource.includes("stage = 2;"),
  "manual movement speed should use source-shaped delayed targetIndex holds for equipment resets and manual spell resets, not the trainer's broad last-target timeout"
);
const setCombatLoadoutSource = extractBlockSource(
  runtimePlayerCombatSource,
  "export function setRuntimePlayerCombatLoadout"
);
assert(
  setCombatLoadoutSource.includes("...actor") &&
    setCombatLoadoutSource.includes("loadoutId,") &&
    setCombatLoadoutSource.includes("equipment,") &&
    !setCombatLoadoutSource.includes("actionSequenceName:") &&
    !setCombatLoadoutSource.includes("actionUntilTick:") &&
    !setCombatLoadoutSource.includes("actionStartedAtTick:") &&
    !setCombatLoadoutSource.includes("actionStartedAtClientCycle:"),
  "setRuntimePlayerCombatLoadout should preserve the active action sequence fields while changing equipment"
);
const syncManualActorActionSequenceSource = extractBlockSource(
  runtimeSceneViewerSource,
  "function syncManualActorActionSequence"
);
const advancePrimarySequenceCursorSource = extractBlockSource(
  runtimeSceneViewerSource,
  "function nhAdvancePrimarySequenceCursor"
);
const authoritativeSequenceCursorSource = extractBlockSource(
  runtimeSceneViewerSource,
  "function manualActorWithAuthoritativeSequenceCursor"
);
const movementBlockedBySequenceSource = extractBlockSource(
  runtimeSceneViewerSource,
  "function manualActorMovementBlockedByNhSequence"
);
assert(
  syncManualActorActionSequenceSource.includes("if (actor.activeSequenceKey !== null)") &&
    syncManualActorActionSequenceSource.includes("return actor;") &&
    advancePrimarySequenceCursorSource.includes("manualActorActiveSequenceContext") &&
    authoritativeSequenceCursorSource.includes("incoming.activeSequenceKey === null") &&
    authoritativeSequenceCursorSource.includes("React state must not erase that client cursor") &&
    authoritativeSequenceCursorSource.includes("lastMovementClientCycle") &&
    authoritativeSequenceCursorSource.includes("same-sequence stale React state") &&
    authoritativeSequenceCursorSource.includes("routeWaypoints: current.routeWaypoints") &&
    authoritativeSequenceCursorSource.includes("logicalRouteWaypoints: current.logicalRouteWaypoints") &&
    authoritativeSequenceCursorSource.includes("serverRouteWaypoints: current.serverRouteWaypoints") &&
    authoritativeSequenceCursorSource.includes("clientTargetIndexUntilClientCycle: current.clientTargetIndexUntilClientCycle") &&
    authoritativeSequenceCursorSource.includes("movementStallTicks: current.movementStallTicks") &&
    authoritativeSequenceCursorSource.includes("movementBlockedBySequence: current.movementBlockedBySequence") &&
    movementBlockedBySequenceSource.includes("manualActorActiveSequenceContext") &&
    !movementBlockedBySequenceSource.includes("runtimePlayerCombatActionActive"),
  "client primary sequences must outlive combat action timers and keep movement/path blocking until class329-style frame playback finishes"
);
assert(
  authoritativeSequenceCursorSource.includes("current.completedSequenceKey && current.completedSequenceKey === incoming.activeSequenceKey") &&
    authoritativeSequenceCursorSource.includes("after the primary sequence ended, it must still not roll back the slingshot") &&
    authoritativeSequenceCursorSource.includes("routeWaypoints: current.routeWaypoints") &&
    authoritativeSequenceCursorSource.includes("logicalRouteWaypoints: current.logicalRouteWaypoints") &&
    authoritativeSequenceCursorSource.includes("serverRouteWaypoints: current.serverRouteWaypoints") &&
    authoritativeSequenceCursorSource.includes("clientTargetIndexUntilClientCycle: current.clientTargetIndexUntilClientCycle") &&
    authoritativeSequenceCursorSource.includes("movementStallTicks: current.movementStallTicks") &&
    authoritativeSequenceCursorSource.includes("lastMovementClientCycle: current.lastMovementClientCycle"),
  "late equipment appearance state should preserve the completed-sequence slingshot path/catch-up cursor"
);
assert(
  clientActorMovementSource.includes("var2.field3436 == 1 && var0.field726 > 0") &&
    clientActorMovementSource.includes("var0.sequenceDelay = 1") &&
    advancePrimarySequenceCursorSource.includes("primarySequenceDelayCycles") &&
    advancePrimarySequenceCursorSource.includes("nhSequencePrecedenceAnimating(sequence) === 1") &&
    advancePrimarySequenceCursorSource.includes("actor.sequencePathLengthAtStart > 0"),
  "primary sequence playback should mirror class329 sequenceDelay when precedenceAnimating=1 and field726/path length remains"
);

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
        tentacleAttachedPlayerMeshTransparent: attachedPlayerTransparency,
        tentaclePlayerMeshTransparent: restoredPlayerTransparency
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
