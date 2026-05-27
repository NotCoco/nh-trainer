import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { screenshotDir, uniqueScreenshotPath } from "./screenshot-paths.mjs";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screenshotPath = uniqueScreenshotPath("nh-nh-trainer-player-context-menu-v2");
const scriptPath = path.join(projectRoot, "scripts", "context-menu-player-validation-electron.cjs");

await mkdir(screenshotDir, { recursive: true });

const viewerSource = await readFile(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
if (
  !viewerSource.includes("function pointerEventToRuntimeActor") ||
  !viewerSource.includes("function pointerEventToRuntimeActorHits") ||
  !viewerSource.includes("function actorSourceClickboxRect") ||
  !viewerSource.includes("runtimeActorMenuPickPriority") ||
  !viewerSource.includes("return actor.actorId === \"local-player\" ? 1 : 0") ||
  !viewerSource.includes("if (pose.actorId !== \"local-player\")") ||
  !viewerSource.includes("sameNhTile(pose.tile, tile)") ||
  !viewerSource.includes("sourceSingleTileModelMinimumClientUnits") ||
  !viewerSource.includes("sourceSingleTileFacePaddingPixels") ||
  !viewerSource.includes("nhProjectWorldPointToViewport") ||
  !viewerSource.includes("pointerEventToRuntimeSceneObject") ||
  !viewerSource.includes("sceneObjectContextEntries(targetObject)") ||
  !viewerSource.includes("dispatchPlayerContextEntry(defaultEntry, clickCrossPosition)") ||
  !viewerSource.includes("issuePlayerPacketCommand") ||
  !viewerSource.includes("nh-runtime-player-action") ||
  !viewerSource.includes("NH_CONTEXT_MENU_MOUSE_LEAVE_MARGIN = 10") ||
  !viewerSource.includes("openRuntimeSceneContextMenu(event.nativeEvent)") ||
  !viewerSource.includes("data-source-close-margin") ||
  viewerSource.includes("raycaster.intersectObject(slot.group, true)")
) {
  throw new Error("RuntimeSceneViewer must use source-style projected actor clickboxes before falling back to object/tile context menus.");
}

const hudSource = await readFile(path.join(projectRoot, "src", "ui", "NhClientHud.tsx"), "utf8");
if (
  !hudSource.includes("event.button === 2") ||
  !hudSource.includes("onContextMenu={openContextMenu}") ||
  !hudSource.includes("onContextMenu(menuCommand)")
) {
  throw new Error("NhClientHud should open inventory/equipment context menus from right-button pointerdown as well as browser contextmenu fallback.");
}

const child = spawn(electronPath, [scriptPath, projectRoot, screenshotPath], {
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
  throw new Error(`player context menu validation failed with code ${exitCode}\n${stderr}\n${stdout}`);
}

process.stdout.write(stdout);
