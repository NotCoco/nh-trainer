import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function readNhClient(relativePath) {
  return fs.readFileSync(path.resolve(projectRoot, "..", "Nh184-Client", relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const pluginSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/tileindicators/TileIndicatorsPlugin.java");
const configSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/tileindicators/TileIndicatorsConfig.java");
const overlaySource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/tileindicators/TileIndicatorsOverlay.java");
const overlayUtilSource = readNhClient("runelite-client/src/main/java/net/runelite/client/ui/overlay/OverlayUtil.java");
const tileSource = read("src/ui/runeliteTileIndicators.ts");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const cssSource = read("src/ui/styles.css");
const packageSource = read("package.json");

for (const sourceAnchor of [
  'name = "Tile Indicators"',
  'description = "Highlight the tile you are currently moving to"',
  'tags = {"highlight", "overlay"}',
  "enabledByDefault = false",
  "updateConfig()",
  "overlayManager.add(overlay)",
  "overlayManager.remove(overlay)",
  '"tileindicators".equals(event.getGroup())'
]) {
  assert(pluginSource.includes(sourceAnchor), `RuneLite TileIndicatorsPlugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("tileindicators")',
  'keyName = "highlightDestinationColor"',
  "return Color.GRAY",
  'keyName = "highlightDestinationTile"',
  "return true",
  'keyName = "thinDestinationTile"',
  'keyName = "highlightCurrentColor"',
  "return Color.CYAN",
  'keyName = "highlightCurrentTile"',
  'keyName = "thinCurrentTile"',
  'keyName = "highlightHoveredColor"',
  "return new Color(0, 0, 0, 0)",
  'keyName = "highlightHoveredTile"',
  'keyName = "thinHoveredTile"'
]) {
  assert(configSource.includes(sourceAnchor), `RuneLite TileIndicatorsConfig source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "setPosition(OverlayPosition.DYNAMIC)",
  "setLayer(OverlayLayer.ABOVE_SCENE)",
  "setPriority(OverlayPriority.MED)",
  "client.getSelectedSceneTile()",
  "client.getLocalDestinationLocation()",
  "client.getLocalPlayer().getWorldLocation()",
  "LocalPoint.fromWorld(client, client.getLocalPlayer().getWorldLocation())",
  "Perspective.getCanvasTilePoly(client, dest)",
  "OverlayUtil.renderPolygon(graphics, poly, color)",
  "OverlayUtil.renderPolygonThin(graphics, poly, color)"
]) {
  assert(overlaySource.includes(sourceAnchor), `RuneLite TileIndicatorsOverlay source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "graphics.setStroke(new BasicStroke(2))",
  "graphics.setStroke(new BasicStroke(1))",
  "new Color(0, 0, 0, 50)"
]) {
  assert(overlayUtilSource.includes(sourceAnchor), `RuneLite OverlayUtil polygon source missing ${sourceAnchor}`);
}

for (const implementationAnchor of [
  'RUNELITE_TILE_INDICATORS_CONFIG_GROUP = "tileindicators"',
  'RUNELITE_TILE_INDICATORS_OVERLAY_POSITION = "OverlayPosition.DYNAMIC"',
  'RUNELITE_TILE_INDICATORS_OVERLAY_LAYER = "OverlayLayer.ABOVE_SCENE"',
  'RUNELITE_TILE_INDICATORS_OVERLAY_PRIORITY = "OverlayPriority.MED"',
  'RUNELITE_TILE_INDICATORS_FILL_RGBA = "rgba(0, 0, 0, 0.196)"',
  "RUNELITE_TILE_INDICATORS_STROKE_WIDTH = 2",
  "RUNELITE_TILE_INDICATORS_THIN_STROKE_WIDTH = 1",
  "runeliteTileIndicatorStrokeWidth"
]) {
  assert(tileSource.includes(implementationAnchor), `Trainer Tile Indicators module missing ${implementationAnchor}`);
}

for (const runtimeAnchor of [
  "applyRuneliteTileIndicatorsConfig",
  "dataset.runeliteTileIndicatorsEnabled",
  "sourceTileIndicatorsProjection",
  "buildRuneliteTileIndicatorDomOverlays",
  "runtimeTileCanvasPolygonPoints",
  "nhArenaTileSceneCorners",
  "nhProjectWorldPointToViewport(boundary.camera, fixedLayout.viewport, corner)",
  "hoveredSceneTileRef",
  "minimapDestinationTileRef",
  "client.getSelectedSceneTile()",
  "client.getLocalDestinationLocation()",
  "LocalPoint.fromWorld(client, client.getLocalPlayer().getWorldLocation())",
  "Perspective.getCanvasTilePoly(client, dest)",
  "OverlayUtil.renderPolygon/renderPolygonThin"
]) {
  assert(runtimeSource.includes(runtimeAnchor), `Runtime Tile Indicators wiring missing ${runtimeAnchor}`);
}

for (const shellAnchor of [
  "RuneliteTileIndicatorsConfigSnapshot",
  'id: "tile-indicators"',
  'group: "tileindicators"',
  'sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/tileindicators/TileIndicatorsConfig.java"',
  'keyName: "highlightDestinationColor"',
  'keyName: "highlightDestinationTile"',
  'keyName: "thinDestinationTile"',
  'keyName: "highlightCurrentColor"',
  'keyName: "highlightCurrentTile"',
  'keyName: "thinCurrentTile"',
  'keyName: "highlightHoveredColor"',
  'keyName: "highlightHoveredTile"',
  'keyName: "thinHoveredTile"',
  "tileIndicatorsValues",
  "enabledPluginIds.has(\"tile-indicators\")"
]) {
  assert(shellSource.includes(shellAnchor), `RuneLite shell Tile Indicators config missing ${shellAnchor}`);
}

for (const cssAnchor of [
  ".runeliteTileIndicatorsOverlay",
  ".runeliteTileIndicatorPolygon",
  "pointer-events: none",
  "shape-rendering: geometricPrecision"
]) {
  assert(cssSource.includes(cssAnchor), `Tile Indicators CSS missing ${cssAnchor}`);
}

assert(packageSource.includes('"verify:runelite-tile-indicators"'), "package.json must expose verify:runelite-tile-indicators.");

console.log("RuneLite Tile Indicators verifier passed: config defaults, overlay source order, canvas tile projection, and polygon stroke/fill behavior are source-backed.");
