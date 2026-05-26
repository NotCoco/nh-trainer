import { BufferAttribute, BufferGeometry, Material, Mesh, Object3D } from "three";

export interface KronosLoadoutMeshMetadata {
  readonly sourceVertexCount: number;
  readonly expandedVertexCount: number;
  readonly sourceVertexGroups: readonly number[];
  readonly expandedToSourceVertex: readonly number[];
  readonly sourceFaceCount?: number;
  readonly sourceFaceAlphaGroups?: readonly number[];
  readonly sourceFaceAlphas?: readonly number[];
  readonly expandedToSourceFace?: readonly number[];
}

export interface KronosAnimationFrameTransform {
  readonly label?: number;
  readonly type: number;
  readonly groups: readonly number[];
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface KronosAnimationFrameDefinition {
  readonly transforms: readonly KronosAnimationFrameTransform[];
}

export interface KronosAnimationFrameStore {
  readonly frames: Record<string, KronosAnimationFrameDefinition>;
}

export interface KronosRenderSequenceFrame {
  readonly frameKey: string;
  readonly lengthClientCycles: number;
}

export interface KronosRenderSequenceDefinition {
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
  readonly frames: readonly KronosRenderSequenceFrame[];
}

export interface KronosRawSequenceDefinition {
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

export type KronosRawSequenceStore = Record<string, KronosRawSequenceDefinition>;

export interface KronosAnimationFixtures {
  readonly frameStore: KronosAnimationFrameStore;
  readonly sequences: ReadonlyMap<string, KronosRenderSequenceDefinition>;
  readonly sequencesById: ReadonlyMap<number, KronosRenderSequenceDefinition>;
}

export type KronosSequencePlaybackMode = "loop" | "primary";

export interface KronosAppliedSequenceFrames {
  readonly primaryFrame: KronosRenderSequenceFrame | null;
  readonly movementFrame: KronosRenderSequenceFrame | null;
}

export interface KronosSequenceFrameCursorOverride {
  readonly frameIndex: number;
  readonly frameCycle: number;
}

export interface KronosSequenceAnimationOptions {
  readonly interpolateFrames?: boolean;
  readonly frameCursor?: KronosSequenceFrameCursorOverride;
  readonly primaryFrameCursor?: KronosSequenceFrameCursorOverride;
  readonly movementFrameCursor?: KronosSequenceFrameCursorOverride;
}

interface KronosSequenceFrameCursor {
  readonly frame: KronosRenderSequenceFrame;
  readonly frameIndex: number;
  readonly cycleInFrame: number;
  readonly frameLength: number;
  readonly nextFrame: KronosRenderSequenceFrame | null;
}

interface KronosAnimatedMeshUserData {
  osrsAnimation?: {
    readonly metadata: KronosLoadoutMeshMetadata;
    readonly basePositions: Float32Array;
    readonly baseColors?: Float32Array;
  };
}

type KronosAnimatedMesh = Mesh<BufferGeometry> & { userData: KronosAnimatedMeshUserData };

export function attachKronosAnimationMetadata(root: Object3D, metadata: KronosLoadoutMeshMetadata): void {
  root.traverse((node) => {
    const mesh = node as KronosAnimatedMesh;
    if (!mesh.isMesh || !mesh.geometry) {
      return;
    }

    const position = mesh.geometry.getAttribute("position") as BufferAttribute | undefined;
    if (!position || position.count !== metadata.expandedVertexCount) {
      return;
    }

    const baseColors = baseKronosColorAlphas(mesh, metadata);
    if (baseColors) {
      setKronosVertexAlphaMaterialTransparency(mesh, hasVisibleDrawnVertexAlpha(mesh));
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

export function sampleKronosSequenceFrame(
  sequence: KronosRenderSequenceDefinition,
  elapsedCycles: number,
  mode: KronosSequencePlaybackMode = "loop"
): KronosRenderSequenceFrame | null {
  return sampleKronosSequenceFrameCursor(sequence, elapsedCycles, mode)?.frame ?? null;
}

export function kronosSourceFrameCursorFromElapsedCycles(
  sequence: KronosRenderSequenceDefinition,
  elapsedCycles: number,
  mode: KronosSequencePlaybackMode = "loop"
): KronosSequenceFrameCursorOverride | null {
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

function sampleKronosSequenceFrameCursor(
  sequence: KronosRenderSequenceDefinition,
  elapsedCycles: number,
  mode: KronosSequencePlaybackMode = "loop",
  frameCursor?: KronosSequenceFrameCursorOverride
): KronosSequenceFrameCursor | null {
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

export function kronosRenderSequenceFromRawSequence(
  sequence: KronosRawSequenceDefinition
): KronosRenderSequenceDefinition {
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
      frameKey: kronosPackedFrameKey(packedFrameId),
      lengthClientCycles: Math.max(1, sequence.frameLenghts?.[index] ?? 1)
    }))
  };
}

export function kronosSequencePrecedenceAnimating(sequence: KronosRenderSequenceDefinition): number {
  if (sequence.precedenceAnimating !== undefined && sequence.precedenceAnimating >= 0) {
    return sequence.precedenceAnimating;
  }
  return sequence.interleaveLeave && sequence.interleaveLeave.length > 0 ? 2 : 0;
}

export function kronosSequencePriority(sequence: KronosRenderSequenceDefinition): number {
  if (sequence.priority !== undefined && sequence.priority >= 0) {
    return sequence.priority;
  }
  return sequence.interleaveLeave && sequence.interleaveLeave.length > 0 ? 2 : 0;
}

export function kronosSequenceBlocksActorMovement(
  sequence: KronosRenderSequenceDefinition,
  pendingPathSteps: number
): boolean {
  return pendingPathSteps > 0
    ? kronosSequencePrecedenceAnimating(sequence) === 0
    : kronosSequencePriority(sequence) === 0;
}

export function kronosSequencePlaybackMode(sequenceName: string): KronosSequencePlaybackMode {
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

export function applyKronosActorAnimation(
  actorRoot: Object3D,
  sequenceName: string,
  elapsedCycles: number,
  animationFixtures: KronosAnimationFixtures | null,
  playbackMode: KronosSequencePlaybackMode = kronosSequencePlaybackMode(sequenceName),
  movementSequenceName?: string,
  movementElapsedCycles: number = elapsedCycles,
  options: KronosSequenceAnimationOptions = {}
): void {
  if (!animationFixtures) {
    return;
  }

  const sequence = animationFixtures.sequences.get(sequenceName);
  const movementSequence = movementSequenceName
    ? animationFixtures.sequences.get(movementSequenceName)
    : undefined;
  if (playbackMode === "primary" && movementSequence) {
    applyKronosBlendedSequenceAnimation(
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

  applyKronosSequenceAnimation(
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

export function applyKronosSequenceAnimation(
  actorRoot: Object3D,
  sequence: KronosRenderSequenceDefinition | null | undefined,
  elapsedCycles: number,
  animationFixtures: KronosAnimationFixtures | null,
  playbackMode: KronosSequencePlaybackMode,
  options: KronosSequenceAnimationOptions = {}
): KronosRenderSequenceFrame | null {
  if (!animationFixtures) {
    return null;
  }

  if (!sequence) {
    restoreKronosActorBasePose(actorRoot);
    return null;
  }

  const sample = sampleKronosSequenceAnimation(sequence, elapsedCycles, playbackMode, animationFixtures, options);
  if (!sample) {
    restoreKronosActorBasePose(actorRoot);
    return null;
  }

  applyKronosFrameTransformLists(actorRoot, [sample.transforms]);
  return sample.sequenceFrame;
}

export function applyKronosBlendedSequenceAnimation(
  actorRoot: Object3D,
  primarySequence: KronosRenderSequenceDefinition | null | undefined,
  primaryElapsedCycles: number,
  movementSequence: KronosRenderSequenceDefinition | null | undefined,
  movementElapsedCycles: number,
  animationFixtures: KronosAnimationFixtures | null,
  options: KronosSequenceAnimationOptions = {}
): KronosAppliedSequenceFrames {
  if (!animationFixtures) {
    return { primaryFrame: null, movementFrame: null };
  }

  if (!primarySequence) {
    const movementFrame = applyKronosSequenceAnimation(
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

  const primarySample = sampleKronosSequenceAnimation(
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
    const movementFrame = applyKronosSequenceAnimation(
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

  const interleaveLabels = kronosInterleaveLabelSet(primarySequence.interleaveLeave);
  if (!movementSequence || interleaveLabels.size === 0) {
    applyKronosFrameTransformLists(actorRoot, [primarySample.transforms]);
    return { primaryFrame: primarySample.sequenceFrame, movementFrame: null };
  }

  const movementSample = sampleKronosSequenceAnimation(
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
    applyKronosFrameTransformLists(actorRoot, [primarySample.transforms]);
    return { primaryFrame: primarySample.sequenceFrame, movementFrame: null };
  }

  applyKronosFrameTransformLists(actorRoot, [
    kronosBlendedFrameTransforms(primarySample.transforms, interleaveLabels, "primary"),
    kronosBlendedFrameTransforms(movementSample.transforms, interleaveLabels, "movement")
  ]);
  return { primaryFrame: primarySample.sequenceFrame, movementFrame: movementSample.sequenceFrame };
}

function sampleKronosSequenceAnimation(
  sequence: KronosRenderSequenceDefinition,
  elapsedCycles: number,
  playbackMode: KronosSequencePlaybackMode,
  animationFixtures: KronosAnimationFixtures,
  options: KronosSequenceAnimationOptions
): { readonly sequenceFrame: KronosRenderSequenceFrame; readonly transforms: readonly KronosAnimationFrameTransform[] } | null {
  const cursor = sampleKronosSequenceFrameCursor(sequence, elapsedCycles, playbackMode, options.frameCursor);
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
    transforms: interpolateKronosSequenceFrameTransforms(frame, nextFrame, cursor.cycleInFrame, cursor.frameLength)
  };
}

function interpolateKronosSequenceFrameTransforms(
  frame: KronosAnimationFrameDefinition,
  nextFrame: KronosAnimationFrameDefinition | null,
  cycleInFrame: number,
  frameLength: number
): readonly KronosAnimationFrameTransform[] {
  if (!nextFrame || cycleInFrame <= 0 || frameLength <= 0) {
    return frame.transforms;
  }

  const currentByLabel = kronosFrameTransformLabelMap(frame.transforms);
  const nextByLabel = kronosFrameTransformLabelMap(nextFrame.transforms);
  const labels = [...new Set([...currentByLabel.keys(), ...nextByLabel.keys()])].sort((left, right) => left - right);
  const unlabeled = frame.transforms.filter((transform) => transform.label === undefined);
  const interpolated = labels.map((label) =>
    interpolateKronosFrameTransform(currentByLabel.get(label), nextByLabel.get(label), cycleInFrame, frameLength, label)
  );

  return [...unlabeled, ...interpolated];
}

function kronosFrameTransformLabelMap(
  transforms: readonly KronosAnimationFrameTransform[]
): ReadonlyMap<number, KronosAnimationFrameTransform> {
  const byLabel = new Map<number, KronosAnimationFrameTransform>();
  for (const transform of transforms) {
    if (transform.label !== undefined) {
      byLabel.set(transform.label, transform);
    }
  }
  return byLabel;
}

function interpolateKronosFrameTransform(
  current: KronosAnimationFrameTransform | undefined,
  next: KronosAnimationFrameTransform | undefined,
  cycleInFrame: number,
  frameLength: number,
  label: number
): KronosAnimationFrameTransform {
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
      x: interpolateKronosAngleByte(currentX, nextX, cycleInFrame, frameLength),
      y: interpolateKronosAngleByte(currentY, nextY, cycleInFrame, frameLength),
      z: interpolateKronosAngleByte(currentZ, nextZ, cycleInFrame, frameLength)
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
    x: interpolateKronosClientInt(currentX, nextX, cycleInFrame, frameLength),
    y: interpolateKronosClientInt(currentY, nextY, cycleInFrame, frameLength),
    z: interpolateKronosClientInt(currentZ, nextZ, cycleInFrame, frameLength)
  };
}

function interpolateKronosAngleByte(from: number, to: number, cycleInFrame: number, frameLength: number): number {
  let delta = normalizeKronosAnimationAngleByte(to - from);
  if (delta >= 128) {
    delta -= 256;
  }
  const scaledDelta = (delta * cycleInFrame) / frameLength;
  const interpolated = from + (Number.isInteger(cycleInFrame) ? Math.trunc(scaledDelta) : scaledDelta);
  return normalizeKronosAnimationAngleByte(interpolated);
}

function interpolateKronosClientInt(from: number, to: number, cycleInFrame: number, frameLength: number): number {
  const scaledDelta = ((to - from) * cycleInFrame) / frameLength;
  return from + (Number.isInteger(cycleInFrame) ? Math.trunc(scaledDelta) : scaledDelta);
}

function normalizeKronosAnimationAngleByte(value: number): number {
  const normalized = value % 256;
  return normalized < 0 ? normalized + 256 : normalized;
}

function applyKronosFrameTransformLists(
  actorRoot: Object3D,
  transformLists: readonly (readonly KronosAnimationFrameTransform[])[]
): void {
  actorRoot.traverse((node) => {
    const mesh = node as KronosAnimatedMesh;
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
      applyKronosFrameTransforms(sourcePositions, animation.metadata, transforms);
    }
    writeSourcePositionsToGeometry(sourcePositions, animation.metadata, position);
    restoreKronosColorAlphas(mesh, animation.baseColors);
    applyKronosFrameAlphaTransforms(mesh, animation.metadata, animation.baseColors, transformLists.flat());
  });
}

export function restoreKronosActorBasePose(actorRoot: Object3D): void {
  actorRoot.traverse((node) => {
    const mesh = node as KronosAnimatedMesh;
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
    restoreKronosColorAlphas(mesh, animation.baseColors);
  });
}

function baseKronosColorAlphas(
  mesh: Mesh<BufferGeometry>,
  metadata: KronosLoadoutMeshMetadata
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

function setKronosVertexAlphaMaterialTransparency(mesh: Mesh<BufferGeometry>, transparent: boolean): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials as Material[]) {
    if (material.transparent === transparent) {
      continue;
    }
    material.transparent = transparent;
    material.needsUpdate = true;
  }
}

function restoreKronosColorAlphas(
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
  setKronosVertexAlphaMaterialTransparency(mesh, hasVisibleDrawnVertexAlpha(mesh));
}

function applyKronosFrameAlphaTransforms(
  mesh: Mesh<BufferGeometry>,
  metadata: KronosLoadoutMeshMetadata,
  baseColors: Float32Array | undefined,
  transforms: readonly KronosAnimationFrameTransform[]
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
  setKronosVertexAlphaMaterialTransparency(mesh, hasVisibleDrawnVertexAlpha(mesh));
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

function kronosInterleaveLabelSet(interleaveLeave: readonly number[] | undefined): ReadonlySet<number> {
  return new Set((interleaveLeave ?? []).filter((label) => label >= 0 && label !== 9999999));
}

function kronosBlendedFrameTransforms(
  transforms: readonly KronosAnimationFrameTransform[],
  interleaveLabels: ReadonlySet<number>,
  phase: "primary" | "movement"
): readonly KronosAnimationFrameTransform[] {
  return transforms.filter((transform) => {
    const label = transform.label;
    const isInterleaved = label !== undefined && interleaveLabels.has(label);
    return transform.type === 0 || (phase === "primary" ? !isInterleaved : isInterleaved);
  });
}

function sourcePositionsFromMesh(
  basePositions: Float32Array,
  metadata: KronosLoadoutMeshMetadata
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

function selectedSourceIndices(metadata: KronosLoadoutMeshMetadata, groups: readonly number[]): number[] {
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

function applyKronosFrameTransforms(
  sourcePositions: Float32Array,
  metadata: KronosLoadoutMeshMetadata,
  transforms: readonly KronosAnimationFrameTransform[]
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
        const rotateX = normalizeKronosAnimationAngleByte(transform.x) * 8;
        const rotateY = normalizeKronosAnimationAngleByte(transform.y) * 8;
        const rotateZ = normalizeKronosAnimationAngleByte(transform.z) * 8;

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
  metadata: KronosLoadoutMeshMetadata,
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

function kronosPackedFrameKey(packedFrameId: number): string {
  return `${packedFrameId >>> 16}:${packedFrameId & 0xffff}`;
}
