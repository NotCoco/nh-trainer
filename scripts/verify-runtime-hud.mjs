import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(projectRoot, "scripts", "runtime-hud-validation-electron.cjs");
const timeoutMs = Number.parseInt(process.env.NH_RUNTIME_HUD_VERIFY_TIMEOUT_MS ?? "300000", 10);

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
let timedOut = false;

child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

const timeout =
  Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => {
        timedOut = true;
        terminateChildTree(child.pid);
      }, timeoutMs)
    : null;

const exitCode = await new Promise((resolve) => {
  child.on("close", resolve);
});
if (timeout) {
  clearTimeout(timeout);
}

if (timedOut) {
  throw new Error(`runtime HUD validation timed out after ${timeoutMs}ms\n${stderr}\n${stdout}`);
}

if (exitCode !== 0) {
  throw new Error(`runtime HUD validation failed with code ${exitCode}\n${stderr}\n${stdout}`);
}

process.stdout.write(stdout);

function terminateChildTree(pid) {
  if (!pid) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // The process may already have exited.
  }
}
