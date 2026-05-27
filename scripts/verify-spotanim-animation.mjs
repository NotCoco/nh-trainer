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
    const module = { exports: readJson(path.relative(projectRoot, resolvedPath)) };
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
  const colors = new Float32Array(metadata.expandedVertexCount * 4);
  for (let expandedIndex = 0; expandedIndex < metadata.expandedVertexCount; expandedIndex += 1) {
    const sourceIndex = metadata.expandedToSourceVertex[expandedIndex] ?? expandedIndex;
    const base = expandedIndex * 3;
    positions[base] = (sourceIndex % 11) - 5;
    positions[base + 1] = ((sourceIndex * 3) % 13) - 6;
    positions[base + 2] = ((sourceIndex * 5) % 17) - 8;

    const colorBase = expandedIndex * 4;
    const sourceFaceIndex = metadata.expandedToSourceFace?.[expandedIndex] ?? -1;
    const faceAlpha = sourceFaceIndex >= 0 ? metadata.sourceFaceAlphas?.[sourceFaceIndex] ?? 0 : 0;
    colors[colorBase] = 1;
    colors[colorBase + 1] = 1;
    colors[colorBase + 2] = 1;
    colors[colorBase + 3] = clientAlphaToVertexAlpha(faceAlpha);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 4));
  const material = new MeshBasicMaterial({ vertexColors: true });
  const mesh = new Mesh(geometry, material);
  const root = new Group();
  root.add(mesh);
  return { root, positions, colors, material };
}

function positionDelta(before, after) {
  let delta = 0;
  for (let index = 0; index < before.length; index += 1) {
    delta += Math.abs(before[index] - after[index]);
  }
  return delta;
}

function colorAlphaDelta(before, after) {
  let delta = 0;
  for (let index = 3; index < before.length; index += 4) {
    delta += Math.abs(before[index] - after[index]);
  }
  return delta;
}

function unsignedByte(value) {
  return value & 0xff;
}

function clientAlphaToVertexAlpha(faceAlpha) {
  const alphaByte = unsignedByte(faceAlpha);
  return alphaByte === 0 ? 1 : 1 - alphaByte / 255;
}

function firstAnimatedDelta(sequence, metadata, fixtures, playbackMode) {
  let elapsed = 0;
  for (const sequenceFrame of sequence.frames) {
    const { root, positions } = geometryForMetadata(metadata);
    attachNhAnimationMetadata(root, metadata);
    const before = Float32Array.from(positions);
    const frame = applyNhSequenceAnimation(root, sequence, elapsed, fixtures, playbackMode);
    const delta = positionDelta(before, positions);
    if (frame && delta > 0.001) {
      return { frameKey: frame.frameKey, elapsed, delta };
    }
    elapsed += Math.max(1, sequenceFrame.lengthClientCycles);
  }
  return null;
}

function firstAlphaDelta(sequence, metadata, fixtures, playbackMode) {
  let elapsed = 0;
  for (const sequenceFrame of sequence.frames) {
    const { root, colors, material } = geometryForMetadata(metadata);
    attachNhAnimationMetadata(root, metadata);
    const before = Float32Array.from(colors);
    const frame = applyNhSequenceAnimation(root, sequence, elapsed, fixtures, playbackMode);
    const delta = colorAlphaDelta(before, colors);
    if (frame && delta > 0.001) {
      return { frameKey: frame.frameKey, elapsed, delta, materialTransparent: material.transparent };
    }
    elapsed += Math.max(1, sequenceFrame.lengthClientCycles);
  }
  return null;
}

function matchingTransformTypes(sequence, metadata, frameStore) {
  const meshGroups = new Set(metadata.sourceVertexGroups.filter((group) => group >= 0));
  const types = new Set();
  for (const sequenceFrame of sequence.frames) {
    const frame = frameStore.frames[sequenceFrame.frameKey];
    for (const transform of frame.transforms) {
      if (transform.groups.some((group) => meshGroups.has(group))) {
        types.add(transform.type);
      }
    }
  }
  return types;
}

function matchingAlphaTransformTypes(sequence, metadata, frameStore) {
  const meshGroups = new Set((metadata.sourceFaceAlphaGroups ?? []).filter((group) => group >= 0));
  const types = new Set();
  if (meshGroups.size === 0) {
    return types;
  }

  for (const sequenceFrame of sequence.frames) {
    const frame = frameStore.frames[sequenceFrame.frameKey];
    for (const transform of frame.transforms) {
      if (transform.type === 5 && transform.groups.some((group) => meshGroups.has(group))) {
        types.add(transform.type);
      }
    }
  }
  return types;
}

const {
  applyNhSequenceAnimation,
  attachNhAnimationMetadata,
  nhRenderSequenceFromRawSequence,
  sampleNhSequenceFrame
} = loadTsModule("src/render/nhSequencePlayback.ts");

const rawSequences = readJson("fixtures/assets/animations/sequences.json");
const frameStore = readJson("fixtures/assets/animations/frames.json");
const spotanims = readJson("fixtures/assets/defs/spotanims.json");
const projectileDefs = readJson("fixtures/assets/defs/projectiles.json");
const meshBySpotanim = new Map([
  [27, { meshPath: "fixtures/render/spotanims/bolt_projectile.mesh.json", playbackMode: "static" }],
  [301, { meshPath: "fixtures/render/spotanims/acb_special_projectile.mesh.json", playbackMode: "loop" }],
  [340, { meshPath: "fixtures/render/spotanims/gmaul_special.mesh.json", playbackMode: "primary" }],
  [366, { meshPath: "fixtures/render/spotanims/ice_blitz_cast.mesh.json", playbackMode: "primary" }],
  [367, { meshPath: "fixtures/render/spotanims/ice_blitz_hit.mesh.json", playbackMode: "primary" }],
  [368, { meshPath: "fixtures/render/spotanims/ice_barrage_projectile.mesh.json", playbackMode: "loop" }],
  [369, { meshPath: "fixtures/render/spotanims/ice_barrage_hit.mesh.json", playbackMode: "primary" }],
  [374, { meshPath: "fixtures/render/spotanims/blood_blitz_projectile.mesh.json", playbackMode: "loop" }],
  [375, { meshPath: "fixtures/render/spotanims/blood_blitz_hit.mesh.json", playbackMode: "primary" }],
  [377, { meshPath: "fixtures/render/spotanims/blood_barrage_hit.mesh.json", playbackMode: "primary" }],
  [1468, { meshPath: "fixtures/render/spotanims/dragon_bolt_projectile.mesh.json", playbackMode: "static" }]
]);

const sequencesById = new Map(
  Object.values(rawSequences).map((sequence) => [sequence.id, nhRenderSequenceFromRawSequence(sequence)])
);
const fixtures = {
  frameStore,
  sequences: new Map(),
  sequencesById
};
const summary = [];

for (const projectile of projectileDefs.projectiles) {
  assert(meshBySpotanim.has(projectile.projectileGfxId), `missing projectile spotanim mesh coverage for gfx ${projectile.projectileGfxId}`);
  if (projectile.impactGfxId >= 0) {
    assert(meshBySpotanim.has(projectile.impactGfxId), `missing impact spotanim mesh coverage for gfx ${projectile.impactGfxId}`);
  }
}

for (const [spotanimId, spec] of meshBySpotanim) {
  const spotanim = spotanims[String(spotanimId)];
  assert(spotanim, `missing spotanim ${spotanimId}`);
  const metadata = readJson(spec.meshPath);
  assert(metadata.expandedVertexCount > 0, `spotanim ${spotanimId} should export visible mesh vertices`);
  assert(
    metadata.sourceModels?.some((source) => source.kind === "spotanim" && source.spotanimId === spotanimId),
    `spotanim ${spotanimId} mesh metadata should preserve its source model binding`
  );

  if (spec.playbackMode === "static") {
    assert(spotanim.animationId < 0, `static spotanim ${spotanimId} should not use an animation sequence`);
    summary.push({
      spotanimId,
      sequenceId: null,
      playbackMode: "static",
      transformTypes: [],
      alphaTransformTypes: [],
      animated: null,
      alphaAnimated: null
    });
    continue;
  }

  assert(spotanim.animationId > 0, `spotanim ${spotanimId} should use an animation sequence`);

  const sequence = sequencesById.get(spotanim.animationId);
  assert(sequence, `missing sequence ${spotanim.animationId} for spotanim ${spotanimId}`);
  assert(sequence.frames.length > 0, `sequence ${spotanim.animationId} should have frames`);
  for (const frame of sequence.frames) {
    assert(frameStore.frames[frame.frameKey], `missing frame ${frame.frameKey} for sequence ${spotanim.animationId}`);
  }

  const transformTypes = matchingTransformTypes(sequence, metadata, frameStore);
  const alphaTransformTypes = matchingAlphaTransformTypes(sequence, metadata, frameStore);
  const expectsGeometry = [1, 2, 3].some((type) => transformTypes.has(type));
  const expectsAlpha = alphaTransformTypes.has(5);
  const animated = expectsGeometry ? firstAnimatedDelta(sequence, metadata, fixtures, spec.playbackMode) : null;
  const alphaAnimated = expectsAlpha ? firstAlphaDelta(sequence, metadata, fixtures, spec.playbackMode) : null;
  if (expectsGeometry) {
    assert(animated, `spotanim ${spotanimId} sequence ${spotanim.animationId} did not move its mesh groups`);
  }
  if (expectsAlpha) {
    assert(alphaAnimated, `spotanim ${spotanimId} sequence ${spotanim.animationId} did not update face alpha groups`);
    assert(alphaAnimated.materialTransparent, `spotanim ${spotanimId} material did not enable vertex alpha rendering`);
  }
  assert(expectsGeometry || expectsAlpha, `spotanim ${spotanimId} should expose a geometry or alpha transform`);
  summary.push({
    spotanimId,
    sequenceId: spotanim.animationId,
    playbackMode: spec.playbackMode,
    transformTypes: [...transformTypes].sort((left, right) => left - right),
    alphaTransformTypes: [...alphaTransformTypes].sort((left, right) => left - right),
    animated,
    alphaAnimated
  });
}

const barrageSequence = sequencesById.get(1964);
const barrageTotalCycles = barrageSequence.frames.reduce((total, frame) => total + frame.lengthClientCycles, 0);
const wrappedBarrage = sampleNhSequenceFrame(barrageSequence, barrageTotalCycles + 1, "loop");
assert(wrappedBarrage?.frameKey === barrageSequence.frames[0].frameKey, "projectile spotanim playback should loop");

const gmaulSequence = sequencesById.get(1668);
const gmaulTotalCycles = gmaulSequence.frames.reduce((total, frame) => total + frame.lengthClientCycles, 0);
assert(sampleNhSequenceFrame(gmaulSequence, gmaulTotalCycles, "primary") === null, "actor spotanim playback should terminate");

console.log(
  JSON.stringify(
    {
      ok: true,
      animatedSpotanims: summary,
      loopedProjectileSequence: 1964,
      terminatingActorSequence: 1668
    },
    null,
    2
  )
);
