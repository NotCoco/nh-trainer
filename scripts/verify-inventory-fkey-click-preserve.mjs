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
const screenshotPath = uniqueScreenshotPath("kronos-nh-trainer-inventory-fkey-click-preserve");
const scriptPath = path.join(projectRoot, "scripts", "inventory-fkey-click-preserve-electron.cjs");

await mkdir(screenshotDir, { recursive: true });

const hudSource = await readFile(path.join(projectRoot, "src", "ui", "KronosClientHud.tsx"), "utf8");
for (const snippet of [
  "flushPendingPressOnUnmount",
  "Frames.dragInventoryWidget/dragItemSlotSource",
  "cannot destroy the pending inventory click",
  "suppressNextRetargetedInventoryRelease"
]) {
  if (!hudSource.includes(snippet)) {
    throw new Error(`KronosClientHud missing inventory F-key click preservation snippet: ${snippet}`);
  }
}

const runtimeSource = await readFile(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
for (const snippet of [
  "runeliteKeyRemappingFunctionKeyFromKeyboardEvent",
  "kronosGameKeybindSideTabForFunctionKey",
  "setActiveSideTabId(tab.id)"
]) {
  if (!runtimeSource.includes(snippet)) {
    throw new Error(`RuntimeSceneViewer missing F-key tab dispatch snippet: ${snippet}`);
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
for (const snippet of [
  "static Widget clickedWidget;",
  "Frames.dragInventoryWidget = Canvas.getWidget(var6);",
  "dragItemSlotSource = var15;",
  "field953 = MouseHandler.MouseHandler_lastPressedX;",
  "field954 = MouseHandler.MouseHandler_lastPressedY;",
  "if(Frames.dragInventoryWidget != null)",
  "if(MouseHandler.MouseHandler_currentButton == 0)",
  "class11.method137(field953, field954);"
]) {
  if (!clientSource.includes(snippet)) {
    throw new Error(`Kronos client source evidence missing ${snippet}`);
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
  throw new Error(`inventory F-key click preservation validation failed with code ${exitCode}\n${stderr}\n${stdout}`);
}

process.stdout.write(stdout);
