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
const screenshotPath = uniqueScreenshotPath("kronos-nh-trainer-inventory-context-menu-anchor");
const scriptPath = path.join(projectRoot, "scripts", "inventory-context-menu-anchor-electron.cjs");

await mkdir(screenshotDir, { recursive: true });

const hudSource = await readFile(path.join(projectRoot, "src", "ui", "KronosClientHud.tsx"), "utf8");
for (const snippet of [
  "kronosInventorySuppressNextContextMenuEvent",
  "data-source-context-menu-press-anchor",
  "MouseHandler.copy$mousePressed stores MouseHandler_lastPressedX/Y",
  "Client.method1661 opens from those pressed coordinates"
]) {
  if (!hudSource.includes(snippet)) {
    throw new Error(`KronosClientHud inventory context-menu anchor fix missing source-backed snippet: ${snippet}`);
  }
}

const viewerSource = await readFile(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
for (const snippet of [
  "Browser fallback contextmenu can be retargeted after a right-button drag",
  "suppressNextCanvasContextMenuRef.current = true;"
]) {
  if (!viewerSource.includes(snippet)) {
    throw new Error(`RuntimeSceneViewer inventory context-menu fallback suppression missing snippet: ${snippet}`);
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
    "Client.java"
  ),
  "utf8"
);
if (!clientSource.includes("this.method1661(MouseHandler.MouseHandler_lastPressedX, MouseHandler.MouseHandler_lastPressedY);")) {
  throw new Error("Kronos client source must open right-click menus from MouseHandler last-pressed coordinates.");
}

const mouseHandlerSource = await readFile(
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
for (const snippet of [
  "MouseHandler_lastPressedXVolatile = var1.getX();",
  "MouseHandler_lastPressedYVolatile = var1.getY();",
  "this.mouseMoved(var1);"
]) {
  if (!mouseHandlerSource.includes(snippet)) {
    throw new Error(`MouseHandler source evidence missing ${snippet}`);
  }
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
  throw new Error(`inventory context-menu anchor validation failed with code ${exitCode}\n${stderr}\n${stdout}`);
}

process.stdout.write(stdout);
