import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { uniqueScreenshotPath } from "./screenshot-paths.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const electronPath = require("electron");
const validatorPath = path.join(projectRoot, "scripts", "tree-texture-validation-electron.cjs");
const outputPath = uniqueScreenshotPath("kronos-tree-texture-comparison");

function glbJson(buffer) {
  if (buffer.subarray(0, 4).toString("utf8") !== "glTF") {
    throw new Error("Object arena file is not a GLB.");
  }
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
}

async function assertObjectGlbTextures() {
  const glbPath = path.join(projectRoot, "fixtures", "render", "maps", "inferno_arena_objects.glb");
  const json = glbJson(await readFile(glbPath));
  const imageUris = new Set((json.images ?? []).map((image) => image.uri));
  const materials = json.materials ?? [];
  const missing = ["../textures/texture_8.png", "../textures/texture_60.png"].filter((uri) => !imageUris.has(uri));
  if (missing.length > 0) {
    throw new Error(`Object GLB is missing tree texture images: ${missing.join(", ")}`);
  }

  const textureMaterials = materials.filter((material) => material.pbrMetallicRoughness?.baseColorTexture);
  const nonMasked = textureMaterials.filter((material) => material.alphaMode !== "MASK" || material.alphaCutoff !== 0.5);
  if (nonMasked.length > 0) {
    throw new Error(`Tree texture materials must be alpha-masked: ${nonMasked.map((material) => material.name).join(", ")}`);
  }

  return {
    primitiveCount: json.meshes?.[0]?.primitives?.length ?? 0,
    imageUris: [...imageUris].sort(),
    textureMaterials: textureMaterials.map((material) => ({
      name: material.name,
      alphaMode: material.alphaMode,
      alphaCutoff: material.alphaCutoff
    }))
  };
}

function runElectronComparison() {
  return new Promise((resolve, reject) => {
    const child = spawn(electronPath, [validatorPath, projectRoot, outputPath], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `tree texture validation exited with code ${code}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

await mkdir(path.dirname(outputPath), { recursive: true });
const glbTextureStatus = await assertObjectGlbTextures();
const visualStatus = await runElectronComparison();

console.log(JSON.stringify({
  glbTextureStatus,
  visualStatus
}, null, 2));
