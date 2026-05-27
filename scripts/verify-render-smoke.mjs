import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { screenshotDir, uniqueScreenshotPath } from "./screenshot-paths.mjs";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screenshotPath = uniqueScreenshotPath("nh-nh-trainer-render-smoke");
const smokeMainPath = path.join(projectRoot, "scripts", "render-smoke-electron.cjs");

const runtimeViewerSource = await readFile(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
if (
  runtimeViewerSource.includes("CylinderGeometry") ||
  runtimeViewerSource.includes("markerRoot") ||
  runtimeViewerSource.includes("rebuildMarkers")
) {
  throw new Error("RuntimeSceneViewer should not render handmade debug keyframe markers inside the playable client viewport.");
}

await mkdir(screenshotDir, { recursive: true });

const child = spawn(electronPath, [smokeMainPath, projectRoot, screenshotPath], {
  cwd: projectRoot,
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let stdout = "";
let stderr = "";

child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

const exitCode = await new Promise((resolve) => {
  child.on("close", resolve);
});

if (exitCode !== 0) {
  throw new Error(`render smoke failed with code ${exitCode}\n${stderr}\n${stdout}`);
}

process.stdout.write(stdout);
