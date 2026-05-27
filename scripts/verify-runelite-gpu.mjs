import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function readNhClient(relativePath) {
  return fs.readFileSync(path.resolve(projectRoot, "..", "Nh184-Client", relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const pluginSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/gpu/GpuPlugin.java");
const configSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/gpu/GpuPluginConfig.java");
const antiAliasingSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/gpu/config/AntiAliasingMode.java");
const anisotropicSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/gpu/config/AnisotropicFilteringMode.java");
const constantsSource = readNhClient("runelite-api/src/main/java/net/runelite/api/Constants.java");
const perspectiveSource = readNhClient("runelite-api/src/main/java/net/runelite/api/Perspective.java");
const gpuSource = read("src/ui/runeliteGpu.ts");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const shellSource = read("src/ui/RuneliteClientShell.tsx");

for (const sourceAnchor of [
  'name = "GPU"',
  'description = "Utilizes the GPU"',
  "static final int MAX_DISTANCE = 90",
  "static final int MAX_FOG_DEPTH = 100",
  "scene.setDrawDistance(drawDistance)",
  "Math.min(Constants.SCENE_SIZE / 2, drawDistance)",
  "glUniform1f(uniFogDepth, this.fogDepth * 0.01f * effectiveDrawDistance)",
  "glUniform1f(uniFogCornerRadius, this.fogCircularity * 0.01f * effectiveDrawDistance)",
  "glUniform1f(uniFogDensity, this.fogDensity * 0.1f)",
  "glUniform1i(uniDrawDistance, drawDistance * Perspective.LOCAL_TILE_SIZE)",
  "glUniform1f(uniSmoothBanding, this.smoothBanding ? 0f : 1f)"
]) {
  assert(pluginSource.includes(sourceAnchor), `RuneLite GPU source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("gpu")',
  "keyName = \"drawDistance\"",
  "keyName = \"smoothBanding\"",
  "keyName = \"antiAliasingMode\"",
  "keyName = \"anisotropicFilteringMode\"",
  "keyName = \"fogDepth\"",
  "keyName = \"fogCircularity\"",
  "keyName = \"fogDensity\""
]) {
  assert(configSource.includes(sourceAnchor), `RuneLite GPU config source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'DISABLED("Disabled", 0)',
  'MSAA_2("MSAA x2", 2)',
  'MSAA_4("MSAA x4", 4)',
  'MSAA_8("MSAA x8", 8)',
  'MSAA_16("MSAA x16", 16)'
]) {
  assert(antiAliasingSource.includes(sourceAnchor), `RuneLite GPU AA enum missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'DISABLED("Disabled", 0f)',
  'BILINEAR("Bilinear", 0.5f)',
  'TRILINEAR("Trilinear", 1f)',
  'AF_2("x2", 2f)',
  'AF_4("x4", 4f)',
  'AF_8("x8", 8f)',
  'AF_16("x16", 16f)'
]) {
  assert(anisotropicSource.includes(sourceAnchor), `RuneLite GPU anisotropic enum missing ${sourceAnchor}`);
}

assert(constantsSource.includes("public static final int SCENE_SIZE = 104"), "RuneLite scene size source changed.");
assert(perspectiveSource.includes("public static final int LOCAL_TILE_SIZE = 1 << LOCAL_COORD_BITS"), "RuneLite local tile size source changed.");

for (const implementationAnchor of [
  "export const RUNELITE_GPU_MAX_DISTANCE = 90",
  "export const RUNELITE_GPU_MAX_FOG_DEPTH = 100",
  "export const RUNELITE_GPU_SCENE_SIZE = 104",
  "export const RUNELITE_GPU_LOCAL_TILE_SIZE = 128",
  "runeliteGpuUniformSnapshot",
  "drawDistance * RUNELITE_GPU_LOCAL_TILE_SIZE",
  "RUNELITE_GPU_LOCAL_TILE_SIZE * Math.min(RUNELITE_GPU_SCENE_SIZE / 2, drawDistance)",
  "fogDepth * 0.01 * effectiveDrawDistanceLocalUnits",
  "fogCircularity * 0.01 * effectiveDrawDistanceLocalUnits",
  "fogDensity * 0.1",
  "config.smoothBanding ? 0 : 1",
  "runeliteGpuAntiAliasingSamples",
  "runeliteGpuAnisotropicFilteringSamples"
]) {
  assert(gpuSource.includes(implementationAnchor), `Trainer GPU module missing ${implementationAnchor}`);
}

for (const runtimeAnchor of [
  "runeliteGpuUniformSnapshot(gpuConfig)",
  "dataset.runeliteGpuDrawDistanceLocalUnits",
  "dataset.runeliteGpuFogDepthLocalUnits",
  "dataset.runeliteGpuFogCornerRadiusLocalUnits",
  "dataset.runeliteGpuFogDensityUniform",
  "dataset.runeliteGpuSmoothBandingUniform",
  "dataset.runeliteGpuAntiAliasingSamples",
  "dataset.runeliteGpuAnisotropicFilteringSamples",
  "applyRuneliteTextureAnisotropy(boundary.scene, uniforms.textureAnisotropySamples)"
]) {
  assert(runtimeSource.includes(runtimeAnchor), `Runtime GPU application missing ${runtimeAnchor}`);
}

for (const shellAnchor of [
  'id: "gpu"',
  'sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/gpu/GpuPluginConfig.java"',
  'keyName: "drawDistance"',
  'keyName: "smoothBanding"',
  'keyName: "antiAliasingMode"',
  'keyName: "anisotropicFilteringMode"',
  'keyName: "fogDepth"',
  'keyName: "fogCircularity"',
  'keyName: "fogDensity"'
]) {
  assert(shellSource.includes(shellAnchor), `RuneLite shell GPU config missing ${shellAnchor}`);
}

console.log("RuneLite GPU verifier passed: config, enum samples, draw-distance, fog, smooth-banding, AA, and anisotropic filtering values are source-backed.");
