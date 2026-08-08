import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(projectRoot, "scripts", "context-menu-press-open-electron.cjs");

const viewerSource = await readFile(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
for (const snippet of [
  "handleRuntimeSceneRightButtonPress",
  "endRuntimeSceneRightButtonPress",
  "rightButtonDownRef",
  "leftButtonPressHandledRef",
  'target.dispatchEvent(new PointerEvent("pointerdown"',
  "canvasContextMenuSeenForPressRef",
  "disarmSuppressedCanvasContextMenu"
]) {
  if (!viewerSource.includes(snippet)) {
    throw new Error(`RuntimeSceneViewer right-click press handling missing snippet: ${snippet}`);
  }
}

const hudSource = await readFile(path.join(projectRoot, "src", "ui", "NhClientHud.tsx"), "utf8");
for (const snippet of ["nhRightButtonDown", "nhInventoryContextMenuSeenForPress", "nhTrackRightButtonRelease"]) {
  if (!hudSource.includes(snippet)) {
    throw new Error(`NhClientHud right-click press handling missing snippet: ${snippet}`);
  }
}

const clientSource = await readFile(
  path.resolve(
    projectRoot,
    "..",
    "Kronos184-Client",
    "runelite-client",
    "src",
    "main",
    "java",
    "net",
    "runelite",
    "standalone",
    "MouseHandler.java"
  ),
  "utf8"
);
if (
  !clientSource.includes("public final synchronized void copy$mousePressed(MouseEvent var1)") ||
  !clientSource.includes("MouseHandler_lastButtonVolatile = this.method833(var1);")
) {
  throw new Error("Nh client source must set MouseHandler_lastButton from the mouse press.");
}
if (!clientSource.includes("public final synchronized void copy$mouseReleased(MouseEvent var1)")) {
  throw new Error("Nh client source must expose the mouse release handler that only clears the current button.");
}

const child = spawn(electronPath, [scriptPath, projectRoot], {
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
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const exitCode = await new Promise((resolve) => child.on("close", resolve));
if (exitCode !== 0) {
  throw new Error(`context menu press-open validation failed with code ${exitCode}\n${stderr}\n${stdout}`);
}

process.stdout.write(stdout);
