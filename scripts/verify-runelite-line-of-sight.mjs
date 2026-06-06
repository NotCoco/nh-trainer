import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const lineOfSightSource = read("src/ui/runeliteLineOfSight.ts");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const cssSource = read("src/ui/styles.css");
const packageSource = read("package.json");

for (const sourceAnchor of [
  'RUNELITE_LINE_OF_SIGHT_PLUGIN_ID = "line-of-sight"',
  'RUNELITE_LINE_OF_SIGHT_CONFIG_GROUP = "lineofsight"',
  'RUNELITE_LINE_OF_SIGHT_SOURCE_REPOSITORY = "https://github.com/Krazune/LineOfSight"',
  "repository=https://github.com/Krazune/LineOfSight.git",
  "commit=13e1a7fea214cb04ff6dd7b0441f455f96f94d27",
  'RUNELITE_LINE_OF_SIGHT_OVERLAY_POSITION = "OverlayPosition.DYNAMIC"',
  'RUNELITE_LINE_OF_SIGHT_OVERLAY_LAYER = "OverlayLayer.ABOVE_SCENE"',
  "RUNELITE_LINE_OF_SIGHT_DEFAULT_RANGE = 10",
  'RUNELITE_LINE_OF_SIGHT_DEFAULT_BORDER_COLOR = "#ffff00"',
  'RUNELITE_LINE_OF_SIGHT_DEFAULT_ASYMMETRICAL_BORDER_COLOR = "#ff0000"',
  "runeliteLineOfSightClampedRange",
  "runeliteLineOfSightClampedBorderWidth"
]) {
  assert(lineOfSightSource.includes(sourceAnchor), `Line of Sight constants missing ${sourceAnchor}`);
}

for (const shellAnchor of [
  "RuneliteLineOfSightConfigSnapshot",
  'name: "Line of Sight"',
  "description: \"Shows the player's line of sight.\"",
  'group: RUNELITE_LINE_OF_SIGHT_CONFIG_GROUP',
  'keyName: "overlayRange"',
  'keyName: "outlineOnly"',
  'keyName: "includePlayerTile"',
  'keyName: "borderColor"',
  'keyName: "borderWidth"',
  'keyName: "showFill"',
  'keyName: "includeAsymmetrical"',
  'keyName: "showAsymmetricalFill"',
  "lineOfSightValues",
  "lineOfSightEnabled",
  "runeliteLineOfSightClampedRange",
  "runeliteLineOfSightClampedBorderWidth"
]) {
  assert(shellSource.includes(shellAnchor), `RuneLite shell Line of Sight wiring missing ${shellAnchor}`);
}

for (const runtimeAnchor of [
  "applyRuneliteLineOfSightConfig",
  "dataset.runeliteLineOfSightEnabled",
  "buildRuneliteLineOfSightDomOverlays",
  "nhSceneProjectileRouteClear(sourceTile, candidateTile, collisionMap)",
  "nhSceneProjectileRouteClear(candidateTile, sourceTile, collisionMap)",
  "NH_PROJECTILE_MASK",
  "runeliteLineOfSightRenderableTiles",
  "config.outlineOnly",
  "addOutlineOnly",
  "topBorder",
  "rightBorder",
  "bottomBorder",
  "leftBorder",
  "runtimeTileCanvasPolygonPoints",
  "data-source-overlay=\"TilesOverlay\"",
  "data-source-los=\"WorldArea.hasLineOfSightTo / ProjectileRoute-backed trainer collision\"",
  "<polyline",
  "runeliteLineOfSightLine",
  "runeliteLineOfSightPolygon"
]) {
  assert(runtimeSource.includes(runtimeAnchor), `Runtime Line of Sight overlay missing ${runtimeAnchor}`);
}

for (const cssAnchor of [
  ".runeliteLineOfSightOverlay",
  ".runeliteLineOfSightPolygon",
  ".runeliteLineOfSightLine",
  "pointer-events: none",
  "shape-rendering: geometricPrecision"
]) {
  assert(cssSource.includes(cssAnchor), `Line of Sight CSS missing ${cssAnchor}`);
}

assert(packageSource.includes('"verify:runelite-line-of-sight"'), "package.json must expose verify:runelite-line-of-sight.");

console.log("RuneLite Line of Sight verifier passed: plugin-hub source, config defaults, LOS/asym LOS, outline mode, and DOM overlay wiring are present.");
