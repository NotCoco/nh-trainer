import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const framesPath = "fixtures/assets/animations/frames.json";
const sequencePaths = [
  "fixtures/render/sequences/idle.json",
  "fixtures/render/sequences/walk.json",
  "fixtures/render/sequences/consume.json",
  "fixtures/render/sequences/whip_attack.json",
  "fixtures/render/sequences/godsword_attack.json",
  "fixtures/render/sequences/ags_special.json",
  "fixtures/render/sequences/gmaul_special.json",
  "fixtures/render/sequences/crossbow_attack.json",
  "fixtures/render/sequences/blitz_cast.json",
  "fixtures/render/sequences/barrage_cast.json"
];
const meshMetadataPaths = [
  "fixtures/render/player-loadouts/kodai-robes.mesh.json",
  "fixtures/render/player-loadouts/acb-hides.mesh.json",
  "fixtures/render/player-loadouts/tentacle-bandos.mesh.json",
  "fixtures/render/player-loadouts/ags-bandos.mesh.json",
  "fixtures/render/player-loadouts/gmaul-bandos.mesh.json"
];

async function exists(relativePath) {
  try {
    await access(path.join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(projectRoot, relativePath), "utf8"));
}

function validateFrameStore(frameStore) {
  const errors = [];
  const frames = frameStore.frames ?? {};
  const frameMaps = frameStore.frameMaps ?? {};

  for (const [key, frame] of Object.entries(frames)) {
    if (!frameMaps[String(frame.frameMapId)]) {
      errors.push(`frame ${key} references missing framemap ${frame.frameMapId}`);
    }
    for (const transform of frame.transforms ?? []) {
      if (!Number.isInteger(transform.label) || !Number.isInteger(transform.type)) {
        errors.push(`frame ${key} contains malformed transform label/type`);
        break;
      }
    }
  }

  return errors;
}

function validateSequence(sequence, frameStore, relativePath) {
  const errors = [];
  const frames = frameStore.frames ?? {};

  if (!Number.isInteger(sequence.sequenceId)) {
    errors.push(`${relativePath} missing sequenceId`);
  }

  if (!Array.isArray(sequence.frames) || sequence.frames.length === 0) {
    errors.push(`${relativePath} has no frames`);
    return errors;
  }

  for (const frame of sequence.frames) {
    if (!frames[frame.frameKey]) {
      errors.push(`${relativePath} references missing frame ${frame.frameKey}`);
    }
    if (!Number.isInteger(frame.lengthClientCycles) || frame.lengthClientCycles <= 0) {
      errors.push(`${relativePath} frame ${frame.index} has invalid lengthClientCycles`);
    }
  }

  return errors;
}

function validateMeshMetadata(metadata, relativePath) {
  const errors = [];
  if (!Number.isInteger(metadata.sourceVertexCount) || metadata.sourceVertexCount <= 0) {
    errors.push(`${relativePath} has invalid sourceVertexCount`);
  }
  if (!Number.isInteger(metadata.expandedVertexCount) || metadata.expandedVertexCount <= 0) {
    errors.push(`${relativePath} has invalid expandedVertexCount`);
  }
  if (!Array.isArray(metadata.sourceVertexGroups) || metadata.sourceVertexGroups.length !== metadata.sourceVertexCount) {
    errors.push(`${relativePath} sourceVertexGroups length does not match sourceVertexCount`);
  }
  if (
    !Array.isArray(metadata.expandedToSourceVertex) ||
    metadata.expandedToSourceVertex.length !== metadata.expandedVertexCount
  ) {
    errors.push(`${relativePath} expandedToSourceVertex length does not match expandedVertexCount`);
  }
  if (
    Array.isArray(metadata.expandedToSourceVertex) &&
    metadata.expandedToSourceVertex.some(
      (sourceVertex) => !Number.isInteger(sourceVertex) || sourceVertex < 0 || sourceVertex >= metadata.sourceVertexCount
    )
  ) {
    errors.push(`${relativePath} maps an expanded vertex outside source vertex range`);
  }
  if (
    Array.isArray(metadata.sourceVertexGroups) &&
    !metadata.sourceVertexGroups.some((group) => Number.isInteger(group) && group >= 0)
  ) {
    errors.push(`${relativePath} has no usable animation vertex groups`);
  }

  return errors;
}

function sequenceCoverage(sequence, frameStore, metadata) {
  const meshGroups = new Set(metadata.sourceVertexGroups.filter((group) => Number.isInteger(group) && group >= 0));
  const touchedGroups = new Set();

  for (const sequenceFrame of sequence.frames ?? []) {
    const frame = frameStore.frames?.[sequenceFrame.frameKey];
    for (const transform of frame?.transforms ?? []) {
      for (const group of transform.groups ?? []) {
        if (meshGroups.has(group)) {
          touchedGroups.add(group);
        }
      }
    }
  }

  const touchedSourceVertices = metadata.sourceVertexGroups.filter((group) => touchedGroups.has(group)).length;
  return { touchedGroups: touchedGroups.size, touchedSourceVertices };
}

if (!(await exists(framesPath))) {
  console.log(`missing ${framesPath}`);
  process.exit(1);
}

const frameStore = await readJson(framesPath);
const frameStoreErrors = validateFrameStore(frameStore);
let okCount = frameStoreErrors.length === 0 ? 1 : 0;
let totalCount = 1;

if (frameStoreErrors.length === 0) {
  console.log(
    `ok      ${framesPath} (${Object.keys(frameStore.frames ?? {}).length} frames, ${Object.keys(frameStore.frameMaps ?? {}).length} framemaps)`
  );
} else {
  console.log(`invalid ${framesPath}`);
  for (const error of frameStoreErrors) {
    console.log(`        ${error}`);
  }
}

for (const sequencePath of sequencePaths) {
  totalCount += 1;
  if (!(await exists(sequencePath))) {
    console.log(`missing ${sequencePath}`);
    continue;
  }

  const sequence = await readJson(sequencePath);
  const errors = validateSequence(sequence, frameStore, sequencePath);
  if (errors.length === 0) {
    okCount += 1;
    console.log(`ok      ${sequencePath} (${sequence.frames.length} frames, sequence ${sequence.sequenceId})`);
  } else {
    console.log(`invalid ${sequencePath}`);
    for (const error of errors) {
      console.log(`        ${error}`);
    }
  }
}

for (const metadataPath of meshMetadataPaths) {
  totalCount += 1;
  if (!(await exists(metadataPath))) {
    console.log(`missing ${metadataPath}`);
    continue;
  }

  const metadata = await readJson(metadataPath);
  const errors = validateMeshMetadata(metadata, metadataPath);
  if (errors.length === 0) {
    okCount += 1;
    console.log(
      `ok      ${metadataPath} (${metadata.sourceVertexCount} source vertices, ${metadata.expandedVertexCount} rendered vertices)`
    );
  } else {
    console.log(`invalid ${metadataPath}`);
    for (const error of errors) {
      console.log(`        ${error}`);
    }
  }
}

for (const sequencePath of sequencePaths) {
  if (!(await exists(sequencePath))) {
    continue;
  }
  const sequence = await readJson(sequencePath);
  for (const metadataPath of meshMetadataPaths) {
    if (!(await exists(metadataPath))) {
      continue;
    }
    totalCount += 1;
    const metadata = await readJson(metadataPath);
    const coverage = sequenceCoverage(sequence, frameStore, metadata);
    if (coverage.touchedSourceVertices > 0) {
      okCount += 1;
      console.log(
        `ok      ${sequencePath} -> ${metadataPath} (${coverage.touchedSourceVertices} touched source vertices)`
      );
    } else {
      console.log(`invalid ${sequencePath} -> ${metadataPath}`);
      console.log("        sequence transforms do not touch any loadout animation groups");
    }
  }
}

console.log(`animation fixture readiness: ${okCount}/${totalCount} valid`);
if (okCount !== totalCount) {
  process.exitCode = 1;
}
