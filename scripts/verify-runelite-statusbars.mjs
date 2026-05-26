import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function readKronosClient(relativePath) {
  return fs.readFileSync(path.resolve(projectRoot, "..", "Kronos184-Client", relativePath), "utf8");
}

const statusBarsPluginSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/statusbars/StatusBarsPlugin.java");
const statusBarsConfigSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/statusbars/StatusBarsConfig.java");
const statusBarsOverlaySource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/statusbars/StatusBarsOverlay.java");
const statusBarsViewportSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/statusbars/Viewport.java");
const barRendererSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/statusbars/renderer/BarRenderer.java");
const hitpointsRendererSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/statusbars/renderer/HitPointsRenderer.java");
const prayerRendererSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/statusbars/renderer/PrayerRenderer.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const statusBarsSource = read("src/ui/runeliteStatusBars.ts");
const fixedLayoutSource = read("src/render/kronosFixedLayout.ts");
const cssSource = read("src/ui/styles.css");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const sourceAnchor of [
  'name = "Status Bars"',
  'enabledByDefault = false',
  'overlayManager.add(overlay)',
  '@ConfigGroup("statusbars")',
  'default BarMode leftBarMode()',
  'return BarMode.HITPOINTS;',
  'default BarMode rightBarMode()',
  'return BarMode.PRAYER;'
]) {
  assert(
    statusBarsPluginSource.includes(sourceAnchor) || statusBarsConfigSource.includes(sourceAnchor),
    `Kronos RuneLite Status Bars source missing ${sourceAnchor}`
  );
}

for (const sourceAnchor of [
  'setPosition(OverlayPosition.DYNAMIC)',
  'setLayer(OverlayLayer.ABOVE_WIDGETS)',
  'WidgetInfo.FIXED_VIEWPORT_INTERFACE_CONTAINER',
  'new Point(20, -4)',
  'new Point(0, -4)',
  'private static final int HEIGHT = 252',
  'offsetLeftBarX = (location.getX() - offsetLeft.getX())',
  'offsetRightBarX = (location.getX() - offsetRight.getX()) + curWidget.getWidth()'
]) {
  assert(
    statusBarsOverlaySource.includes(sourceAnchor) || statusBarsViewportSource.includes(sourceAnchor),
    `Kronos RuneLite Status Bars overlay source missing ${sourceAnchor}`
  );
}

for (const sourceAnchor of [
  'private static final Color COLOR_BAR_BG = new Color(0, 0, 0, 150)',
  'private static final int BAR_WIDTH = 20',
  'private static final int SKILL_ICON_HEIGHT = 35',
  'private static final int ICON_AND_COUNTER_OFFSET_X = 1',
  'private static final int ICON_AND_COUNTER_OFFSET_Y = 21',
  'private static int getBarHeight',
  'Math.round(ratio * size)'
]) {
  assert(barRendererSource.includes(sourceAnchor), `Kronos RuneLite BarRenderer source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'new Color(225, 35, 0, 125)',
  'iconManager.getSkillImage(Skill.HITPOINTS, true)',
  'new Color(255, 112, 6, 150)'
]) {
  assert(hitpointsRendererSource.includes(sourceAnchor), `Kronos RuneLite HitPointsRenderer source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'new Color(50, 200, 200, 175)',
  'ImageUtil.resizeImage(iconManager.getSkillImage(Skill.PRAYER, true), SIZE, SIZE)',
  'new Color(57, 255, 186, 75)'
]) {
  assert(prayerRendererSource.includes(sourceAnchor), `Kronos RuneLite PrayerRenderer source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  'id: "status-bars"',
  'sourcePath: "Kronos184-Client/runelite-client/src/main/java/net/runelite/client/plugins/statusbars/StatusBarsPlugin.java"',
  'sourcePath: "Kronos184-Client/runelite-client/src/main/java/net/runelite/client/plugins/statusbars/StatusBarsConfig.java"',
  'group: "statusbars"',
  'leftBarMode: "Hitpoints"',
  'rightBarMode: "Prayer"',
  'statusBars: {'
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell missing Status Bars anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'KRONOS_FIXED_VIEWPORT_INTERFACE_CONTAINER_CHILD_ID = 65',
  'fixedViewportInterfaceContainer',
  'findFixedWidgetByChildId(resolvedWidgets, KRONOS_FIXED_VIEWPORT_INTERFACE_CONTAINER_CHILD_ID)'
]) {
  assert(fixedLayoutSource.includes(trainerAnchor), `fixed layout missing source-backed Status Bars widget anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'RUNELITE_STATUS_BARS_HEIGHT = 252',
  'RUNELITE_STATUS_BARS_BAR_WIDTH = 20',
  'RUNELITE_STATUS_BARS_FIXED_LEFT_OFFSET = { x: 20, y: -4 }',
  'RUNELITE_STATUS_BARS_FIXED_RIGHT_OFFSET = { x: 0, y: -4 }',
  'runeliteStatusBarFillHeight',
  'sourceRenderer: "HitPointsRenderer"',
  'sourceRenderer: "PrayerRenderer"',
  'fixedLayout.fixedViewportInterfaceContainer?.rect'
]) {
  assert(statusBarsSource.includes(trainerAnchor), `runeliteStatusBars module missing source-backed anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'applyRuneliteStatusBarsConfig',
  'StatusBarsOverlay setPosition(DYNAMIC) setLayer(ABOVE_WIDGETS)',
  'Viewport.FIXED WidgetInfo.FIXED_VIEWPORT_INTERFACE_CONTAINER',
  'BarRenderer BAR_WIDTH=20 HEIGHT=252 COLOR_BAR_BG',
  'runeliteStatusBarSnapshots',
  'data-source-renderer={bar.sourceRenderer}'
]) {
  assert(runtimeSource.includes(trainerAnchor), `RuntimeSceneViewer missing Status Bars runtime anchor ${trainerAnchor}`);
}

for (const cssAnchor of [
  '.runeliteStatusBarOverlay',
  'width: 20px',
  'height: 252px',
  'background: rgba(0, 0, 0, 0.588)'
]) {
  assert(cssSource.includes(cssAnchor), `CSS missing Status Bars anchor ${cssAnchor}`);
}

for (const asset of [
  "fixtures/runelite-ui/skill_icons_small/hitpoints.png",
  "fixtures/runelite-ui/skill_icons_small/prayer.png"
]) {
  assert(fs.existsSync(path.join(projectRoot, asset)), `missing RuneLite Status Bars asset ${asset}`);
}

console.log("RuneLite Status Bars verifier passed: plugin config, fixed viewport placement, renderer constants, and icons are source-backed.");
