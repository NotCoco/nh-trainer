import type { RuneliteGpuPluginConfigSnapshot } from "./RuneliteClientShell";

export const RUNELITE_GPU_MAX_DISTANCE = 90;
export const RUNELITE_GPU_MAX_FOG_DEPTH = 100;
export const RUNELITE_GPU_SCENE_SIZE = 104;
export const RUNELITE_GPU_LOCAL_TILE_SIZE = 128;

export interface RuneliteGpuUniformSnapshot {
  readonly drawDistance: number;
  readonly drawDistanceLocalUnits: number;
  readonly effectiveDrawDistanceLocalUnits: number;
  readonly useFog: boolean;
  readonly fogDepth: number;
  readonly fogCircularity: number;
  readonly fogDensity: number;
  readonly fogDepthLocalUnits: number;
  readonly fogCornerRadiusLocalUnits: number;
  readonly fogDensityUniform: number;
  readonly smoothBandingUniform: number;
  readonly antiAliasingSamples: number;
  readonly anisotropicFilteringSamples: number;
  readonly textureAnisotropySamples: number;
}

export function runeliteGpuUniformSnapshot(config: RuneliteGpuPluginConfigSnapshot): RuneliteGpuUniformSnapshot {
  const drawDistance = runeliteGpuClampInt(config.drawDistance, 0, RUNELITE_GPU_MAX_DISTANCE);
  const fogDepth = runeliteGpuClampInt(config.fogDepth, 0, RUNELITE_GPU_MAX_FOG_DEPTH);
  const fogCircularity = runeliteGpuClampInt(config.fogCircularity, 0, RUNELITE_GPU_MAX_FOG_DEPTH);
  const fogDensity = runeliteGpuClampInt(config.fogDensity, 0, RUNELITE_GPU_MAX_FOG_DEPTH);
  const effectiveDrawDistanceLocalUnits = RUNELITE_GPU_LOCAL_TILE_SIZE * Math.min(RUNELITE_GPU_SCENE_SIZE / 2, drawDistance);
  const anisotropicFilteringSamples = runeliteGpuAnisotropicFilteringSamples(config.anisotropicFilteringMode);

  return {
    drawDistance,
    drawDistanceLocalUnits: drawDistance * RUNELITE_GPU_LOCAL_TILE_SIZE,
    effectiveDrawDistanceLocalUnits,
    useFog: fogDepth > 0,
    fogDepth,
    fogCircularity,
    fogDensity,
    fogDepthLocalUnits: fogDepth * 0.01 * effectiveDrawDistanceLocalUnits,
    fogCornerRadiusLocalUnits: fogCircularity * 0.01 * effectiveDrawDistanceLocalUnits,
    fogDensityUniform: fogDensity * 0.1,
    smoothBandingUniform: config.smoothBanding ? 0 : 1,
    antiAliasingSamples: runeliteGpuAntiAliasingSamples(config.antiAliasingMode),
    anisotropicFilteringSamples,
    textureAnisotropySamples: Math.max(1, Math.trunc(anisotropicFilteringSamples))
  };
}

export function runeliteGpuAntiAliasingSamples(mode: string): number {
  if (mode === "MSAA x16") {
    return 16;
  }
  if (mode === "MSAA x8") {
    return 8;
  }
  if (mode === "MSAA x4") {
    return 4;
  }
  if (mode === "MSAA x2") {
    return 2;
  }
  return 0;
}

export function runeliteGpuAnisotropicFilteringSamples(mode: string): number {
  if (mode === "x16") {
    return 16;
  }
  if (mode === "x8") {
    return 8;
  }
  if (mode === "x4") {
    return 4;
  }
  if (mode === "x2") {
    return 2;
  }
  if (mode === "Trilinear") {
    return 1;
  }
  if (mode === "Bilinear") {
    return 0.5;
  }
  return 0;
}

function runeliteGpuClampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
