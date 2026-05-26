import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicBuildUrl =
  process.env.PUBLIC_BUILD_URL ?? pathToFileURL(path.join(projectRoot, "dist", "index.html")).href;
const electronScript = path.join(projectRoot, "scripts", "public-build-render-electron.cjs");

const child = spawn(electronPath, [electronScript, publicBuildUrl], {
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
  throw new Error(`public build render verifier failed with code ${exitCode}\n${stderr}\n${stdout}`);
}

process.stdout.write(stdout);
