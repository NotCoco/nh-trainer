import { BufferAttribute, BufferGeometry, Material, Mesh, Object3D } from "three";

export interface NhLoadoutMeshMetadata {
  readonly sourceVertexCount: number;
  readonly expandedVertexCount: number;
  readonly sourceVertexGroups: readonly number[];
  readonly expandedToSourceVertex: readonly number[];
  readonly sourceFaceCount?: number;
  readonly sourceFaceAlphaGroups?: readonly number[];
  readonly sourceFaceAlphas?: readonly number[];
  readonly expandedToSourceFace?: readonly number[];
}

export interface NhAnimationFrameTransform {
  readonly label?: number;
  readonly type: number;
  readonly groups: readonly number[];
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface NhAnimationFrameDefinition {
  readonly transforms: readonly NhAnimationFrameTransform[];
}

export interface NhAnimationFrameStore {
  readonly frames: Record<string, NhAnimationFrameDefinition>;
}

export interface NhRenderSequenceFrame {
  readonly frameKey: string;
  readonly lengthClientCycles: number;
}

export interface NhRenderSequenceDefinition {
  readonly name?: string;
  readonly sequenceId?: number;
  readonly frameStep?: number;
  readonly maxLoops?: number;
  readonly shieldOverrideId?: number;
  readonly weaponOverrideId?: number;
  readonly interleaveLeave?: readonly number[];
  readonly stretches?: boolean;
  readonly forcedPriority?: number;
  readonly precedenceAnimating?: number;
  readonly priority?: number;
  readonly replyMode?: number;
  readonly frames: readonly NhRenderSequenceFrame[];
}

export interface NhRawSequenceDefinition {
  readonly id: number;
  readonly frameIDs?: readonly number[];
  readonly frameLenghts?: readonly number[];
  readonly frameStep?: number;
  readonly maxLoops?: number;
  readonly leftHandItem?: number;
  readonly rightHandItem?: number;
  readonly interleaveLeave?: readonly number[];
  readonly stretches?: boolean;
  readonly forcedPriority?: number;
  readonly precedenceAnimating?: number;
  readonly priority?: number;
  readonly replyMode?: number;
}

export type NhRawSequenceStore = Record<string, NhRawSequenceDefinition>;

export interface NhAnimationFixtures {
  readonly frameStore: NhAnimationFrameStore;
  readonly sequences: ReadonlyMap<string, NhRenderSequenceDefinition>;
  readonly sequencesById: ReadonlyMap<number, NhRenderSequenceDefinition>;
}

export type NhSequencePlaybackMode = "loop" | "primary";

export interface NhAppliedSequenceFrames {
  readonly primaryFrame: NhRenderSequenceFrame | null;
  readonly movementFrame: NhRenderSequenceFrame | null;
}

export interface NhSequenceFrameCursorOverride {
  readonly frameIndex: number;
  readonly frameCycle: number;
}

export interface NhSequenceAnimationOptions {
  readonly interpolateFrames?: boolean;
  readonly frameCursor?: NhSequenceFrameCursorOverride;
  readonly primaryFrameCursor?: NhSequenceFrameCursorOverride;
  readonly movementFrameCursor?: NhSequenceFrameCursorOverride;
}

interface NhSequenceFrameCursor {
  readonly frame: NhRenderSequenceFrame;
  readonly frameIndex: number;
  readonly cycleInFrame: number;
  readonly frameLength: number;
  readonly nextFrame: NhRenderSequenceFrame | null;
}

interface NhAnimatedMeshUserData {
  osrsAnimation?: {
    readonly metadata: NhLoadoutMeshMetadata;
    readonly basePositions: Float32Array;
    readonly baseColors?: Float32Array;
  };
}

type NhAnimatedMesh = Mesh<BufferGeometry> & { userData: NhAnimatedMeshUserData };

export function attachNhAnimationMetadata(root: Object3D, metadata: NhLoadoutMeshMetadata): void {
  root.traverse((node) => {
    const mesh = node as NhAnimatedMesh;
    if (!mesh.isMesh || !mesh.geometry) {
      return;
    }

    const position = mesh.geometry.getAttribute("position") as BufferAttribute | undefined;
    if (!position || position.count !== metadata.expandedVertexCount) {
      return;
    }

    const baseColors = baseNhColorAlphas(mesh, metadata);
    if (baseColors) {
      setNhVertexAlphaMaterialTransparency(mesh, hasVisibleDrawnVertexAlpha(mesh));
    }

    mesh.userData.osrsAnimation = {
      metadata,
      basePositions: new Float32Array(position.array as ArrayLike<number>),
      baseColors
    };
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.computeBoundingBox();
    mesh.frustumCulled = false;
  });
}

export function sampleNhSequenceFrame(
  sequence: NhRenderSequenceDefinition,
  elapsedCycles: number,
  mode: NhSequencePlaybackMode = "loop"
): NhRenderSequenceFrame | null {
  return sampleNhSequenceFrameCursor(sequence, elapsedCycles, mode)?.frame ?? null;
}

export function nhSourceFrameCursorFromElapsedCycles(
  sequence: NhRenderSequenceDefinition,
  elapsedCycles: number,
  mode: NhSequencePlaybackMode = "loop"
): NhSequenceFrameCursorOverride | null {
  if (sequence.frames.length === 0) {
    return null;
  }

  let remaining = Number.isFinite(elapsedCycles) ? Math.max(0, elapsedCycles) : 0;
  let frameIndex = 0;
  let loopCount = 0;
  const frameStep = sequence.frameStep ?? -1;
  const maxLoops = sequence.maxLoops ?? 99;

  while (frameIndex >= 0 && frameIndex < sequence.frames.length) {
    const frameLength = Math.max(1, sequence.frames[frameIndex].lengthClientCycles);
    if (remaining <= frameLength) {
      return {
        frameIndex,
        frameCycle: remaining
      };
    }

    remaining -= frameLength;
    frameIndex += 1;

    if (frameIndex >= sequence.frames.length) {
      if (mode === "loop") {
        frameIndex = 0;
        continue;
      }
      if (frameStep < 0) {
        return null;
      }
      frameIndex -= frameStep;
      loopCount += 1;
      if (loopCount >= maxLoops) {
        return null;
      }
    }
  }

  return null;
}

function sampleNhSequenceFrameCursor(
  sequence: NhRenderSequenceDefinition,
  elapsedCycles: number,
  mode: NhSequencePlaybackMode = "loop",
  frameCursor?: NhSequenceFrameCursorOverride
): NhSequenceFrameCursor | null {
  if (sequence.frames.length === 0) {
    return null;
  }

  if (frameCursor) {
    const frameIndex = Math.max(0, Math.trunc(frameCursor.frameIndex));
    if (frameIndex >= sequence.frames.length) {
      return null;
    }

    const frame = sequence.frames[frameIndex];
    const frameLength = Math.max(1, frame.lengthClientCycles);
    const frameCycle = Number.isFinite(frameCursor.frameCycle) ? frameCursor.frameCycle : 0;
    return {
      frame,
      frameIndex,
      cycleInFrame: Math.max(0, Math.min(frameLength, frameCycle)),
      frameLength,
      nextFrame: frameIndex + 1 < sequence.frames.length ? sequence.frames[frameIndex + 1] : null
    };
  }

  const totalCycles = sequence.frames.reduce(
    (total, frame) => total + Math.max(1, frame.lengthClientCycles),
    0
  );
  const elapsedCycleCount = Number.isFinite(elapsedCycles) ? Math.trunc(elapsedCycles) : 0;
  let remaining =
    mode === "loop"
      ? ((elapsedCycleCount % totalCycles) + totalCycles) % totalCycles
      : Math.max(0, elapsedCycleCount);

  let frameIndex = 0;
  let loopCount = 0;
  const frameStep = sequence.frameStep ?? -1;
  const maxLoops = sequence.maxLoops ?? 99;

  while (frameIndex >= 0 && frameIndex < sequence.frames.length) {
    const frame = sequence.frames[frameIndex];
    const length = Math.max(1, frame.lengthClientCycles);
    if (remaining < length) {
      return {
        frame,
        frameIndex,
        cycleInFrame: remaining,
        frameLength: length,
        nextFrame: frameIndex + 1 < sequence.frames.length ? sequence.frames[frameIndex + 1] : null
      };
    }
    remaining -= length;
    frameIndex += 1;

    if (frameIndex >= sequence.frames.length) {
      if (mode === "loop") {
        frameIndex = 0;
        continue;
      }
      if (frameStep < 0) {
        return null;
      }
      frameIndex -= frameStep;
      loopCount += 1;
      if (loopCount >= maxLoops) {
        return null;
      }
    }
  }

  return null;
}

export function nhRenderSequenceFromRawSequence(
  sequence: NhRawSequenceDefinition
): NhRenderSequenceDefinition {
  return {
    sequenceId: sequence.id,
    frameStep: sequence.frameStep,
    maxLoops: sequence.maxLoops,
    shieldOverrideId: sequence.leftHandItem !== undefined && sequence.leftHandItem >= 0 ? sequence.leftHandItem : undefined,
    weaponOverrideId: sequence.rightHandItem !== undefined && sequence.rightHandItem >= 0 ? sequence.rightHandItem : undefined,
    interleaveLeave: sequence.interleaveLeave,
    stretches: sequence.stretches,
    forcedPriority: sequence.forcedPriority,
    precedenceAnimating: sequence.precedenceAnimating,
    priority: sequence.priority,
    replyMode: sequence.replyMode,
    frames: (sequence.frameIDs ?? []).map((packedFrameId, index) => ({
      frameKey: nhPackedFrameKey(packedFrameId),
      lengthClientCycles: Math.max(1, sequence.frameLenghts?.[index] ?? 1)
    }))
  };
}

export function nhSequencePrecedenceAnimating(sequence: NhRenderSequenceDefinition): number {
  if (sequence.precedenceAnimating !== undefined && sequence.precedenceAnimating >= 0) {
    return sequence.precedenceAnimating;
  }
  return sequence.interleaveLeave && sequence.interleaveLeave.length > 0 ? 2 : 0;
}

export function nhSequencePriority(sequence: NhRenderSequenceDefinition): number {
  if (sequence.priority !== undefined && sequence.priority >= 0) {
    return sequence.priority;
  }
  return sequence.interleaveLeave && sequence.interleaveLeave.length > 0 ? 2 : 0;
}

export function nhSequenceBlocksActorMovement(
  sequence: NhRenderSequenceDefinition,
  pendingPathSteps: number
): boolean {
  return pendingPathSteps > 0
    ? nhSequencePrecedenceAnimating(sequence) === 0
    : nhSequencePriority(sequence) === 0;
}

export function nhSequencePlaybackMode(sequenceName: string): NhSequencePlaybackMode {
  return sequenceName === "idle" ||
    sequenceName === "turn" ||
    sequenceName === "walk_back" ||
    sequenceName === "walk_left" ||
    sequenceName === "walk_right" ||
    sequenceName.endsWith("_ready") ||
    sequenceName.endsWith("_turn") ||
    sequenceName.endsWith("_walk") ||
    sequenceName.endsWith("_walk_back") ||
    sequenceName.endsWith("_walk_left") ||
    sequenceName.endsWith("_walk_right") ||
    sequenceName.endsWith("_run") ||
    sequenceName === "walk" ||
    sequenceName === "run"
    ? "loop"
    : "primary";
}

export function applyNhActorAnimation(
  actorRoot: Object3D,
  sequenceName: string,
  elapsedCycles: number,
  animationFixtures: NhAnimationFixtures | null,
  playbackMode: NhSequencePlaybackMode = nhSequencePlaybackMode(sequenceName),
  movementSequenceName?: string,
  movementElapsedCycles: number = elapsedCycles,
  options: NhSequenceAnimationOptions = {}
): void {
  if (!animationFixtures) {
    return;
  }

  const sequence = animationFixtures.sequences.get(sequenceName);
  const movementSequence = movementSequenceName
    ? animationFixtures.sequences.get(movementSequenceName)
    : undefined;
  if (playbackMode === "primary" && movementSequence) {
    applyNhBlendedSequenceAnimation(
      actorRoot,
      sequence,
      elapsedCycles,
      movementSequence,
      movementElapsedCycles,
      animationFixtures,
      options
    );
    return;
  }

  applyNhSequenceAnimation(
    actorRoot,
    sequence,
    elapsedCycles,
    animationFixtures,
    playbackMode,
    {
      ...options,
      frameCursor: options.primaryFrameCursor ?? options.frameCursor
    }
  );
}

export function applyNhSequenceAnimation(
  actorRoot: Object3D,
  sequence: NhRenderSequenceDefinition | null | undefined,
  elapsedCycles: number,
  animationFixtures: NhAnimationFixtures | null,
  playbackMode: NhSequencePlaybackMode,
  options: NhSequenceAnimationOptions = {}
): NhRenderSequenceFrame | null {
  if (!animationFixtures) {
    return null;
  }

  if (!sequence) {
    restoreNhActorBasePose(actorRoot);
    return null;
  }

  const sample = sampleNhSequenceAnimation(sequence, elapsedCycles, playbackMode, animationFixtures, options);
  if (!sample) {
    restoreNhActorBasePose(actorRoot);
    return null;
  }

  applyNhFrameTransformLists(actorRoot, [sample.transforms]);
  return sample.sequenceFrame;
}

export function applyNhBlendedSequenceAnimation(
  actorRoot: Object3D,
  primarySequence: NhRenderSequenceDefinition | null | undefined,
  primaryElapsedCycles: number,
  movementSequence: NhRenderSequenceDefinition | null | undefined,
  movementElapsedCycles: number,
  animationFixtures: NhAnimationFixtures | null,
  options: NhSequenceAnimationOptions = {}
): NhAppliedSequenceFrames {
  if (!animationFixtures) {
    return { primaryFrame: null, movementFrame: null };
  }

  if (!primarySequence) {
    const movementFrame = applyNhSequenceAnimation(
      actorRoot,
      movementSequence,
      movementElapsedCycles,
      animationFixtures,
      "loop",
      {
        ...options,
        frameCursor: options.movementFrameCursor ?? options.frameCursor
      }
    );
    return { primaryFrame: null, movementFrame };
  }

  const primarySample = sampleNhSequenceAnimation(
    primarySequence,
    primaryElapsedCycles,
    "primary",
    animationFixtures,
    {
      ...options,
      frameCursor: options.primaryFrameCursor ?? options.frameCursor
    }
  );
  if (!primarySample) {
    const movementFrame = applyNhSequenceAnimation(
      actorRoot,
      movementSequence,
      movementElapsedCycles,
      animationFixtures,
      "loop",
      {
        ...options,
        frameCursor: options.movementFrameCursor ?? options.frameCursor
      }
    );
    return { primaryFrame: null, movementFrame };
  }

  const interleaveLabels = nhInterleaveLabelSet(primarySequence.interleaveLeave);
  if (!movementSequence || interleaveLabels.size === 0) {
    applyNhFrameTransformLists(actorRoot, [primarySample.transforms]);
    return { primaryFrame: primarySample.sequenceFrame, movementFrame: null };
  }

  const movementSample = sampleNhSequenceAnimation(
    movementSequence,
    movementElapsedCycles,
    "loop",
    animationFixtures,
    {
      ...options,
      frameCursor: options.movementFrameCursor ?? options.frameCursor
    }
  );
  if (!movementSample) {
    applyNhFrameTransformLists(actorRoot, [primarySample.transforms]);
    return { primaryFrame: primarySample.sequenceFrame, movementFrame: null };
  }

  applyNhFrameTransformLists(actorRoot, [
    nhBlendedFrameTransforms(primarySample.transforms, interleaveLabels, "primary"),
    nhBlendedFrameTransforms(movementSample.transforms, interleaveLabels, "movement")
  ]);
  return { primaryFrame: primarySample.sequenceFrame, movementFrame: movementSample.sequenceFrame };
}

function sampleNhSequenceAnimation(
  sequence: NhRenderSequenceDefinition,
  elapsedCycles: number,
  playbackMode: NhSequencePlaybackMode,
  animationFixtures: NhAnimationFixtures,
  options: NhSequenceAnimationOptions
): { readonly sequenceFrame: NhRenderSequenceFrame; readonly transforms: readonly NhAnimationFrameTransform[] } | null {
  const cursor = sampleNhSequenceFrameCursor(sequence, elapsedCycles, playbackMode, options.frameCursor);
  const frame = cursor ? animationFixtures.frameStore.frames[cursor.frame.frameKey] : null;
  if (!cursor || !frame) {
    return null;
  }

  if (!options.interpolateFrames) {
    return { sequenceFrame: cursor.frame, transforms: frame.transforms };
  }

  const nextFrame = cursor.nextFrame ? animationFixtures.frameStore.frames[cursor.nextFrame.frameKey] : null;
  return {
    sequenceFrame: cursor.frame,
    transforms: interpolateNhSequenceFrameTransforms(frame, nextFrame, cursor.cycleInFrame, cursor.frameLength)
  };
}

function interpolateNhSequenceFrameTransforms(
  frame: NhAnimationFrameDefinition,
  nextFrame: NhAnimationFrameDefinition | null,
  cycleInFrame: number,
  frameLength: number
): readonly NhAnimationFrameTransform[] {
  if (!nextFrame || cycleInFrame <= 0 || frameLength <= 0) {
    return frame.transforms;
  }

  const currentByLabel = nhFrameTransformLabelMap(frame.transforms);
  const nextByLabel = nhFrameTransformLabelMap(nextFrame.transforms);
  const labels = [...new Set([...currentByLabel.keys(), ...nextByLabel.keys()])].sort((left, right) => left - right);
  const unlabeled = frame.transforms.filter((transform) => transform.label === undefined);
  const interpolated = labels.map((label) =>
    interpolateNhFrameTransform(currentByLabel.get(label), nextByLabel.get(label), cycleInFrame, frameLength, label)
  );

  return [...unlabeled, ...interpolated];
}

function nhFrameTransformLabelMap(
  transforms: readonly NhAnimationFrameTransform[]
): ReadonlyMap<number, NhAnimationFrameTransform> {
  const byLabel = new Map<number, NhAnimationFrameTransform>();
  for (const transform of transforms) {
    if (transform.label !== undefined) {
      byLabel.set(transform.label, transform);
    }
  }
  return byLabel;
}

function interpolateNhFrameTransform(
  current: NhAnimationFrameTransform | undefined,
  next: NhAnimationFrameTransform | undefined,
  cycleInFrame: number,
  frameLength: number,
  label: number
): NhAnimationFrameTransform {
  const template = current ?? next;
  const type = template?.type ?? 0;
  const groups = template?.groups ?? [];
  const defaultValue = type === 3 || type === 10 ? 128 : 0;
  const currentX = current?.x ?? defaultValue;
  const currentY = current?.y ?? defaultValue;
  const currentZ = current?.z ?? defaultValue;
  const nextX = next?.x ?? defaultValue;
  const nextY = next?.y ?? defaultValue;
  const nextZ = next?.z ?? defaultValue;

  if (type === 2) {
    return {
      label,
      type,
      groups,
      x: interpolateNhAngleByte(currentX, nextX, cycleInFrame, frameLength),
      y: interpolateNhAngleByte(currentY, nextY, cycleInFrame, frameLength),
      z: interpolateNhAngleByte(currentZ, nextZ, cycleInFrame, frameLength)
    };
  }

  if (type === 5) {
    return {
      label,
      type,
      groups,
      x: currentX,
      y: 0,
      z: 0
    };
  }

  return {
    label,
    type,
    groups,
    x: interpolateNhClientInt(currentX, nextX, cycleInFrame, frameLength),
    y: interpolateNhClientInt(currentY, nextY, cycleInFrame, frameLength),
    z: interpolateNhClientInt(currentZ, nextZ, cycleInFrame, frameLength)
  };
}

function interpolateNhAngleByte(from: number, to: number, cycleInFrame: number, frameLength: number): number {
  let delta = normalizeNhAnimationAngleByte(to - from);
  if (delta >= 128) {
    delta -= 256;
  }
  const scaledDelta = (delta * cycleInFrame) / frameLength;
  const interpolated = from + (Number.isInteger(cycleInFrame) ? Math.trunc(scaledDelta) : scaledDelta);
  return normalizeNhAnimationAngleByte(interpolated);
}

function interpolateNhClientInt(from: number, to: number, cycleInFrame: number, frameLength: number): number {
  const scaledDelta = ((to - from) * cycleInFrame) / frameLength;
  return from + (Number.isInteger(cycleInFrame) ? Math.trunc(scaledDelta) : scaledDelta);
}

function normalizeNhAnimationAngleByte(value: number): number {
  const normalized = value % 256;
  return normalized < 0 ? normalized + 256 : normalized;
}

function applyNhFrameTransformLists(
  actorRoot: Object3D,
  transformLists: readonly (readonly NhAnimationFrameTransform[])[]
): void {
  actorRoot.traverse((node) => {
    const mesh = node as NhAnimatedMesh;
    const animation = mesh.userData.osrsAnimation;
    if (!mesh.isMesh || !animation) {
      return;
    }

    const position = mesh.geometry.getAttribute("position") as BufferAttribute | undefined;
    if (!position) {
      return;
    }

    const sourcePositions = sourcePositionsFromMesh(animation.basePositions, animation.metadata);
    for (const transforms of transformLists) {
      applyNhFrameTransforms(sourcePositions, animation.metadata, transforms);
    }
    writeSourcePositionsToGeometry(sourcePositions, animation.metadata, position);
    restoreNhColorAlphas(mesh, animation.baseColors);
    applyNhFrameAlphaTransforms(mesh, animation.metadata, animation.baseColors, transformLists.flat());
  });
}

export function restoreNhActorBasePose(actorRoot: Object3D): void {
  actorRoot.traverse((node) => {
    const mesh = node as NhAnimatedMesh;
    const animation = mesh.userData.osrsAnimation;
    if (!mesh.isMesh || !animation) {
      return;
    }

    const position = mesh.geometry.getAttribute("position") as BufferAttribute | undefined;
    if (!position) {
      return;
    }

    const output = position.array as Float32Array;
    output.set(animation.basePositions);
    position.needsUpdate = true;
    restoreNhColorAlphas(mesh, animation.baseColors);
  });
}

function baseNhColorAlphas(
  mesh: Mesh<BufferGeometry>,
  metadata: NhLoadoutMeshMetadata
): Float32Array | undefined {
  const color = mesh.geometry.getAttribute("color") as BufferAttribute | undefined;
  const sourceFaceAlphas = metadata.sourceFaceAlphas;
  const sourceFaceAlphaGroups = metadata.sourceFaceAlphaGroups;
  const expandedToSourceFace = metadata.expandedToSourceFace;

  if (
    !color ||
    color.count !== metadata.expandedVertexCount ||
    color.itemSize !== 4 ||
    !sourceFaceAlphas ||
    !sourceFaceAlphaGroups ||
    !expandedToSourceFace ||
    sourceFaceAlphas.length !== sourceFaceAlphaGroups.length ||
    expandedToSourceFace.length !== metadata.expandedVertexCount ||
    !hasFaceAlphaPath(sourceFaceAlphas, sourceFaceAlphaGroups)
  ) {
    return undefined;
  }

  return new Float32Array(color.array as ArrayLike<number>);
}

function hasFaceAlphaPath(
  sourceFaceAlphas: readonly number[],
  sourceFaceAlphaGroups: readonly number[]
): boolean {
  return (
    sourceFaceAlphas.some((alpha) => unsignedByte(alpha) !== 0) ||
    sourceFaceAlphaGroups.some((group) => group >= 0)
  );
}

function setNhVertexAlphaMaterialTransparency(mesh: Mesh<BufferGeometry>, transparent: boolean): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials as Material[]) {
    if (material.transparent === transparent) {
      continue;
    }
    material.transparent = transparent;
    material.needsUpdate = true;
  }
}

function restoreNhColorAlphas(
  mesh: Mesh<BufferGeometry>,
  baseColors: Float32Array | undefined
): void {
  if (!baseColors) {
    return;
  }

  const color = mesh.geometry.getAttribute("color") as BufferAttribute | undefined;
  if (!color || color.itemSize !== 4 || color.array.length !== baseColors.length) {
    return;
  }

  const output = color.array as Float32Array;
  output.set(baseColors);
  color.needsUpdate = true;
  setNhVertexAlphaMaterialTransparency(mesh, hasVisibleDrawnVertexAlpha(mesh));
}

function applyNhFrameAlphaTransforms(
  mesh: Mesh<BufferGeometry>,
  metadata: NhLoadoutMeshMetadata,
  baseColors: Float32Array | undefined,
  transforms: readonly NhAnimationFrameTransform[]
): void {
  const color = mesh.geometry.getAttribute("color") as BufferAttribute | undefined;
  const sourceFaceAlphas = metadata.sourceFaceAlphas;
  const sourceFaceAlphaGroups = metadata.sourceFaceAlphaGroups;
  const expandedToSourceFace = metadata.expandedToSourceFace;

  if (
    !baseColors ||
    !color ||
    color.itemSize !== 4 ||
    !sourceFaceAlphas ||
    !sourceFaceAlphaGroups ||
    !expandedToSourceFace ||
    sourceFaceAlphas.length !== sourceFaceAlphaGroups.length ||
    expandedToSourceFace.length !== metadata.expandedVertexCount
  ) {
    return;
  }

  const alphaBySourceFace = Uint16Array.from(sourceFaceAlphas, unsignedByte);
  for (const transform of transforms) {
    if (transform.type !== 5) {
      continue;
    }

    const selectedGroups = new Set(transform.groups);
    for (let sourceFaceIndex = 0; sourceFaceIndex < sourceFaceAlphaGroups.length; sourceFaceIndex += 1) {
      if (!selectedGroups.has(sourceFaceAlphaGroups[sourceFaceIndex])) {
        continue;
      }
      alphaBySourceFace[sourceFaceIndex] = clampClientAlpha(
        alphaBySourceFace[sourceFaceIndex] + transform.x * 8
      );
    }
  }

  const output = color.array as Float32Array;
  for (let expandedIndex = 0; expandedIndex < expandedToSourceFace.length; expandedIndex += 1) {
    const sourceFaceIndex = expandedToSourceFace[expandedIndex];
    if (sourceFaceIndex < 0 || sourceFaceIndex >= alphaBySourceFace.length) {
      continue;
    }

    output[expandedIndex * 4 + 3] = clientAlphaToVertexAlpha(alphaBySourceFace[sourceFaceIndex]);
  }
  color.needsUpdate = true;
  setNhVertexAlphaMaterialTransparency(mesh, hasVisibleDrawnVertexAlpha(mesh));
}

function hasVisibleDrawnVertexAlpha(mesh: Mesh<BufferGeometry>): boolean {
  const color = mesh.geometry.getAttribute("color") as BufferAttribute | undefined;
  if (!color || color.itemSize !== 4) {
    return false;
  }

  const index = mesh.geometry.getIndex();
  if (!index) {
    return hasVisibleVertexAlpha(color.array as ArrayLike<number>);
  }

  const colors = color.array as ArrayLike<number>;
  const indices = index.array as ArrayLike<number>;
  for (let indexOffset = 0; indexOffset < indices.length; indexOffset += 1) {
    const vertexIndex = indices[indexOffset];
    if (colors[vertexIndex * 4 + 3] < 0.999) {
      return true;
    }
  }
  return false;
}

function hasVisibleVertexAlpha(colors: ArrayLike<number>): boolean {
  for (let index = 3; index < colors.length; index += 4) {
    if (colors[index] < 0.999) {
      return true;
    }
  }
  return false;
}

function nhInterleaveLabelSet(interleaveLeave: readonly number[] | undefined): ReadonlySet<number> {
  return new Set((interleaveLeave ?? []).filter((label) => label >= 0 && label !== 9999999));
}

function nhBlendedFrameTransforms(
  transforms: readonly NhAnimationFrameTransform[],
  interleaveLabels: ReadonlySet<number>,
  phase: "primary" | "movement"
): readonly NhAnimationFrameTransform[] {
  return transforms.filter((transform) => {
    const label = transform.label;
    const isInterleaved = label !== undefined && interleaveLabels.has(label);
    return transform.type === 0 || (phase === "primary" ? !isInterleaved : isInterleaved);
  });
}

function sourcePositionsFromMesh(
  basePositions: Float32Array,
  metadata: NhLoadoutMeshMetadata
): Float32Array {
  const sourcePositions = new Float32Array(metadata.sourceVertexCount * 3);
  const assigned = new Uint8Array(metadata.sourceVertexCount);

  for (let expandedIndex = 0; expandedIndex < metadata.expandedToSourceVertex.length; expandedIndex += 1) {
    const sourceIndex = metadata.expandedToSourceVertex[expandedIndex];
    if (assigned[sourceIndex]) {
      continue;
    }

    const expandedBase = expandedIndex * 3;
    const sourceBase = sourceIndex * 3;
    sourcePositions[sourceBase] = basePositions[expandedBase];
    sourcePositions[sourceBase + 1] = -basePositions[expandedBase + 1];
    sourcePositions[sourceBase + 2] = basePositions[expandedBase + 2];
    assigned[sourceIndex] = 1;
  }

  return sourcePositions;
}

function selectedSourceIndices(metadata: NhLoadoutMeshMetadata, groups: readonly number[]): number[] {
  const selectedGroups = new Set(groups);
  const selected: number[] = [];
  for (let sourceIndex = 0; sourceIndex < metadata.sourceVertexGroups.length; sourceIndex += 1) {
    if (selectedGroups.has(metadata.sourceVertexGroups[sourceIndex])) {
      selected.push(sourceIndex);
    }
  }
  return selected;
}

function rotateClientUnits(units: number): { readonly sin: number; readonly cos: number } {
  const radians = ((units & 2047) * Math.PI * 2) / 2048;
  return { sin: Math.sin(radians), cos: Math.cos(radians) };
}

function unsignedByte(value: number): number {
  return value & 0xff;
}

function clampClientAlpha(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function clientAlphaToVertexAlpha(faceAlpha: number): number {
  const alphaByte = unsignedByte(faceAlpha);
  return alphaByte === 0 ? 1 : 1 - alphaByte / 255;
}

function applyNhFrameTransforms(
  sourcePositions: Float32Array,
  metadata: NhLoadoutMeshMetadata,
  transforms: readonly NhAnimationFrameTransform[]
): void {
  let tempX = 0;
  let tempY = 0;
  let tempZ = 0;

  for (const transform of transforms) {
    const sourceIndices = selectedSourceIndices(metadata, transform.groups);

    if (transform.type === 0) {
      tempX = 0;
      tempY = 0;
      tempZ = 0;

      for (const sourceIndex of sourceIndices) {
        const base = sourceIndex * 3;
        tempX += sourcePositions[base];
        tempY += sourcePositions[base + 1];
        tempZ += sourcePositions[base + 2];
      }

      if (sourceIndices.length > 0) {
        tempX = transform.x + tempX / sourceIndices.length;
        tempY = transform.y + tempY / sourceIndices.length;
        tempZ = transform.z + tempZ / sourceIndices.length;
      } else {
        tempX = transform.x;
        tempY = transform.y;
        tempZ = transform.z;
      }
      continue;
    }

    for (const sourceIndex of sourceIndices) {
      const base = sourceIndex * 3;

      if (transform.type === 1) {
        sourcePositions[base] += transform.x;
        sourcePositions[base + 1] += transform.y;
        sourcePositions[base + 2] += transform.z;
      } else if (transform.type === 2) {
        let x = sourcePositions[base] - tempX;
        let y = sourcePositions[base + 1] - tempY;
        let z = sourcePositions[base + 2] - tempZ;
        const rotateX = normalizeNhAnimationAngleByte(transform.x) * 8;
        const rotateY = normalizeNhAnimationAngleByte(transform.y) * 8;
        const rotateZ = normalizeNhAnimationAngleByte(transform.z) * 8;

        if (rotateZ !== 0) {
          const { sin, cos } = rotateClientUnits(rotateZ);
          const nextX = sin * y + cos * x;
          y = cos * y - sin * x;
          x = nextX;
        }

        if (rotateX !== 0) {
          const { sin, cos } = rotateClientUnits(rotateX);
          const nextY = cos * y - sin * z;
          z = sin * y + cos * z;
          y = nextY;
        }

        if (rotateY !== 0) {
          const { sin, cos } = rotateClientUnits(rotateY);
          const nextX = sin * z + cos * x;
          z = cos * z - sin * x;
          x = nextX;
        }

        sourcePositions[base] = x + tempX;
        sourcePositions[base + 1] = y + tempY;
        sourcePositions[base + 2] = z + tempZ;
      } else if (transform.type === 3) {
        sourcePositions[base] = ((sourcePositions[base] - tempX) * transform.x) / 128 + tempX;
        sourcePositions[base + 1] = ((sourcePositions[base + 1] - tempY) * transform.y) / 128 + tempY;
        sourcePositions[base + 2] = ((sourcePositions[base + 2] - tempZ) * transform.z) / 128 + tempZ;
      }
    }
  }
}

function writeSourcePositionsToGeometry(
  sourcePositions: Float32Array,
  metadata: NhLoadoutMeshMetadata,
  position: BufferAttribute
): void {
  const output = position.array as Float32Array;

  for (let expandedIndex = 0; expandedIndex < metadata.expandedToSourceVertex.length; expandedIndex += 1) {
    const sourceBase = metadata.expandedToSourceVertex[expandedIndex] * 3;
    const outputBase = expandedIndex * 3;
    output[outputBase] = sourcePositions[sourceBase];
    output[outputBase + 1] = -sourcePositions[sourceBase + 1];
    output[outputBase + 2] = sourcePositions[sourceBase + 2];
  }

  position.needsUpdate = true;
}

function nhPackedFrameKey(packedFrameId: number): string {
  return `${packedFrameId >>> 16}:${packedFrameId & 0xffff}`;
}
