import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verifierMainPath = path.join(projectRoot, "scripts", "runelite-window-bounds-persistence-electron.cjs");
const marker = "@@nh-window-bounds@@";
const targetContentSize = {
  width: 936,
  height: 584
};
const expectedMinimumContentSize = {
  width: 801,
  height: 503
};

function parseMarkedPayload(stdout, mode) {
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.startsWith(marker));
  if (!line) {
    throw new Error(`Missing ${mode} verifier payload.\n${stdout}`);
  }
  return JSON.parse(line.slice(marker.length));
}

async function runElectronMode(mode, appDataRoot) {
  const child = spawn(
    electronPath,
    [
      verifierMainPath,
      projectRoot,
      mode,
      appDataRoot,
      String(targetContentSize.width),
      String(targetContentSize.height),
      String(expectedMinimumContentSize.width),
      String(expectedMinimumContentSize.height)
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

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
    throw new Error(`window bounds persistence ${mode} verifier failed with code ${exitCode}\n${stderr}\n${stdout}`);
  }

  const payload = parseMarkedPayload(stdout, mode);
  if (!payload.ok) {
    throw new Error(`window bounds persistence ${mode} verifier returned not ok: ${JSON.stringify(payload, null, 2)}`);
  }
  return payload;
}

const appDataRoot = await mkdtemp(path.join(os.tmpdir(), "nh-nh-window-bounds-"));

try {
  const saved = await runElectronMode("save", appDataRoot);
  const restored = await runElectronMode("read", appDataRoot);
  console.log(
    JSON.stringify(
      {
        ok: true,
        source: "ClientUI.show restores CONFIG_CLIENT_BOUNDS when rememberScreenBounds is enabled; trainer persists Electron contentBounds for useContentSize windows",
        minimumSource: "Nh Constants.GAME_FIXED_SIZE 765x503 plus ClientPluginToolbar.TOOLBAR_WIDTH 36x503",
        appDataRoot,
        expectedMinimumContentSize,
        targetContentSize,
        saved,
        restored
      },
      null,
      2
    )
  );
} finally {
  const tempRoot = path.resolve(os.tmpdir());
  const resolvedAppDataRoot = path.resolve(appDataRoot);
  if (resolvedAppDataRoot.startsWith(tempRoot + path.sep)) {
    await rm(resolvedAppDataRoot, { recursive: true, force: true });
  }
}
