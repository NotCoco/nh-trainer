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

const pluginSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/stretchedmode/StretchedModePlugin.java");
const configSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/stretchedmode/StretchedModeConfig.java");
const clientSource = readNhClient("runelite-client/src/main/java/net/runelite/standalone/Client.java");
const canvasSource = readNhClient("runelite-client/src/main/java/net/runelite/standalone/Canvas.java");
const hooksSource = readNhClient("runelite-client/src/main/java/net/runelite/client/callback/Hooks.java");
const mouseSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/stretchedmode/TranslateMouseListener.java");
const wheelSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/stretchedmode/TranslateMouseWheelListener.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const hudSource = read("src/ui/NhClientHud.tsx");
const cssSource = read("src/ui/styles.css");

for (const sourceAnchor of [
  'name = "Stretched Mode"',
  'description = "Stretches the game in fixed and resizable modes."',
  "client.setStretchedEnabled(true)",
  "client.setStretchedEnabled(false)",
  "client.setStretchedIntegerScaling(config.integerScaling())",
  "client.setStretchedKeepAspectRatio(config.keepAspectRatio())",
  "client.setStretchedFast(config.increasedPerformance())",
  "client.setScalingFactor(config.scalingFactor())",
  "client.invalidateStretching(true)"
]) {
  assert(pluginSource.includes(sourceAnchor), `RuneLite StretchedModePlugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("stretchedmode")',
  'keyName = "keepAspectRatio"',
  'keyName = "increasedPerformance"',
  'keyName = "integerScaling"',
  'keyName = "scalingFactor"',
  "default boolean keepAspectRatio()",
  "return false",
  "default int scalingFactor()",
  "return 50"
]) {
  assert(configSource.includes(sourceAnchor), `RuneLite StretchedModeConfig source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "public Dimension getRealDimensions()",
  "cachedRealDimensions = Constants.GAME_FIXED_SIZE",
  "public Dimension getStretchedDimensions()",
  "if(stretchedKeepAspectRatio)",
  "if(stretchedIntegerScaling)",
  "var2 -= var2 % var4.width",
  "var3 -= var3 % var4.height"
]) {
  assert(clientSource.includes(sourceAnchor), `Nh client stretched dimension source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "ViewportMouse.client.isStretchedEnabled()",
  "super.setSize(ViewportMouse.client.getStretchedDimensions().width, ViewportMouse.client.getStretchedDimensions().height)",
  "super.setLocation((this.getParent().getWidth() - ViewportMouse.client.getStretchedDimensions().width) / 2, 0)"
]) {
  assert(canvasSource.includes(sourceAnchor), `Nh Canvas stretched source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "client.isStretchedEnabled()",
  "client.getStretchedDimensions()",
  "RenderingHints.KEY_INTERPOLATION",
  "client.isStretchedFast()",
  "RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR",
  "RenderingHints.VALUE_INTERPOLATION_BILINEAR",
  "stretchedGraphics.drawImage(image, 0, 0, stretchedDimensions.width, stretchedDimensions.height, null)"
]) {
  assert(hooksSource.includes(sourceAnchor), `RuneLite Hooks stretched render source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "Dimension stretchedDimensions = client.getStretchedDimensions()",
  "Dimension realDimensions = client.getRealDimensions()",
  "int newX = (int) (e.getX() / (stretchedDimensions.width / realDimensions.getWidth()))",
  "int newY = (int) (e.getY() / (stretchedDimensions.height / realDimensions.getHeight()))"
]) {
  assert(mouseSource.includes(sourceAnchor), `TranslateMouseListener source missing ${sourceAnchor}`);
  assert(wheelSource.includes(sourceAnchor), `TranslateMouseWheelListener source missing ${sourceAnchor}`);
}

for (const shellAnchor of [
  "RUNELITE_STRETCHED_MODE_PLUGIN_ID = \"stretched-mode\"",
  "RuneliteStretchedModeConfigSnapshot",
  "readonly stretchedMode: RuneliteStretchedModeConfigSnapshot",
  "id: RUNELITE_STRETCHED_MODE_PLUGIN_ID",
  "name: \"Stretched Mode\"",
  "group: \"stretchedmode\"",
  "keyName: \"keepAspectRatio\"",
  "keyName: \"increasedPerformance\"",
  "keyName: \"integerScaling\"",
  "keyName: \"scalingFactor\"",
  "runeliteStretchedClientLayout",
  "RUNELITE_STRETCHED_DIMENSIONS_SOURCE",
  "RUNELITE_STRETCHED_CANVAS_LOCATION_SOURCE",
  "RUNELITE_STRETCHED_MOUSE_SOURCE",
  "RUNELITE_STRETCHED_FAST_SOURCE",
  "data-runelite-stretched-fast={String(configSnapshot.stretchedMode.increasedPerformance)}",
  "data-runelite-stretched-parent-width={stretchedClientLayout.parentWidth}",
  "data-runelite-stretched-offset-x={stretchedClientLayout.offsetX}",
  "data-source-stretched-canvas-location={RUNELITE_STRETCHED_CANVAS_LOCATION_SOURCE}",
  "data-stretched-interpolation={",
  "data-source-optimization=\"trainer keeps the WebGL render target at real dimensions and CSS-stretches the composed client panel\"",
  "Client.getStretchedDimensions() uses the canvas parent width/height directly",
  "const parentWidth = Math.max(1, windowSize.width - sidebarWidth)",
  "let width = parentWidth",
  "offsetX: Math.trunc((parentWidth - width) / 2)",
  "flexBasis: layout.parentWidth",
  "style.left = stretchedLayout.offsetX",
  "style.transform = `scale(${stretchedLayout.scaleX}, ${stretchedLayout.scaleY})`",
  "imageRendering: config.increasedPerformance ? \"pixelated\" : undefined"
]) {
  assert(shellSource.includes(shellAnchor), `RuneliteClientShell stretched implementation missing ${shellAnchor}`);
}
assert(!shellSource.includes("windowSize.width - sidebarWidth - 2"), "stretched client width should not subtract a trainer shell border");
assert(!shellSource.includes("windowSize.height - 2"), "stretched client height should not subtract a trainer shell border");

for (const runtimeAnchor of [
  "function pointerEventToCanvasPosition",
  "canvas.clientWidth",
  "canvas.clientHeight",
  "((event.clientX - rect.left) / rect.width) * sourceWidth",
  "return pointerEventToCanvasPosition(boundary, event) ?? { x: 0, y: 0 }"
]) {
  assert(runtimeSource.includes(runtimeAnchor), `RuntimeSceneViewer stretched mouse translation missing ${runtimeAnchor}`);
}

for (const hudAnchor of [
  "viewport?.clientWidth",
  "viewport?.clientHeight",
  "((event.clientX - viewportRect.left) / Math.max(1, viewportRect.width)) * sourceWidth",
  "((event.clientY - viewportRect.top) / Math.max(1, viewportRect.height)) * sourceHeight",
  "function inventoryDragDelta",
  "const scale = inventoryDragScale(element)",
  "x: (state.currentX - state.startX) / scale.x",
  "y: (state.currentY - state.startY) / scale.y",
  "data-source-inventory-drag-stretched-mouse"
]) {
  assert(hudSource.includes(hudAnchor), `NhClientHud stretched HUD input translation missing ${hudAnchor}`);
}

for (const cssAnchor of [
  ".runeliteClientPanelFrame",
  ".runeliteClientShell",
  "border: 0",
  ".runeliteClientPanelFrame[data-stretched-mode=\"true\"]",
  ".runeliteClientPanelFrame > .runeliteClientPanel",
  ".shell:not(.clientOnlyShell)",
  "RuneLite Hooks uses bilinear scaling unless Stretched Mode increasedPerformance is enabled.",
  ".runeliteClientPanel[data-stretched-interpolation=\"bilinear\"] canvas",
  ".runeliteClientPanel[data-stretched-interpolation=\"bilinear\"] span",
  ".runeliteClientPanel[data-stretched-interpolation=\"nearest\"] span",
  "image-rendering: auto",
  "transform-origin: left top",
  "width: 100vw",
  "height: 100vh"
]) {
  assert(cssSource.includes(cssAnchor), `CSS stretched layout missing ${cssAnchor}`);
}

assert(
  !cssSource.includes("@media (max-width: 820px) {\n  .shell {\n    width: min(100vw - 28px, 680px);"),
  "mobile workbench shell media query should not clip the client-only RuneLite shell at Nh fixed minimum size"
);

assert(
  shellSource.includes("RUNELITE_TRAINER_DISABLED_PLUGIN_IDS = new Set([\"attack-styles\"])") &&
    shellSource.includes("runeliteTrainerAvailablePluginListItems") &&
    shellSource.includes("RUNELITE_TRAINER_DISABLED_PLUGIN_SOURCE"),
  "Attack Styles plugin should be hard-disabled at the trainer plugin manager boundary"
);

console.log("RuneLite Stretched Mode verifier passed: source anchors, fixed-target stretch optimization, and input translation are wired.");
