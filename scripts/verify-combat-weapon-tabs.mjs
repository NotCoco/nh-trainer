import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { screenshotDir, uniqueScreenshotPath } from "./screenshot-paths.mjs";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verifierPath = path.join(projectRoot, "scripts", "combat-weapon-tabs-electron.cjs");
const screenshotPath = uniqueScreenshotPath("nh-nh-trainer-combat-weapon-tabs");

await mkdir(screenshotDir, { recursive: true });

const electronEnv = {
  ...process.env,
  ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
};
delete electronEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [verifierPath, projectRoot, screenshotPath], {
  cwd: projectRoot,
  env: electronEnv,
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
  throw new Error(`Combat weapon tab verifier failed with code ${exitCode}\n${stderr}\n${stdout}`);
}

process.stdout.write(stdout);
