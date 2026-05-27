import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { screenshotDir, uniqueScreenshotPath } from "./screenshot-paths.mjs";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(projectRoot, "scripts", "render-angle-validation-electron.cjs");
const screenshotRunId = path.basename(uniqueScreenshotPath("nh-nh-trainer-render-angles-run"), ".png").replace(/^nh-nh-trainer-render-angles-run-/, "");

await mkdir(screenshotDir, { recursive: true });

const child = spawn(electronPath, [validatorPath, projectRoot, screenshotDir, screenshotRunId], {
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
  throw new Error(`render angle validation failed with code ${exitCode}\n${stderr}\n${stdout}`);
}

process.stdout.write(stdout);
