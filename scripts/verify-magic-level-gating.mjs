import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(projectRoot, "scripts", "magic-level-gating-electron.cjs");

const child = spawn(electronPath, [validatorPath, projectRoot], {
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

const timeout = setTimeout(() => {
  child.kill("SIGKILL");
}, 45000);

const exitCode = await new Promise((resolve) => {
  child.on("close", resolve);
});
clearTimeout(timeout);

if (exitCode !== 0) {
  throw new Error(`magic level gating validation failed with code ${exitCode}\n${stderr}\n${stdout}`);
}

process.stdout.write(stdout);
