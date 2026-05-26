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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const pluginSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/mousehighlight/MouseHighlightPlugin.java");
const configSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/mousehighlight/MouseHighlightConfig.java");
const overlaySource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/mousehighlight/MouseHighlightOverlay.java");
const tooltipOverlaySource = readKronosClient("runelite-client/src/main/java/net/runelite/client/ui/overlay/tooltip/TooltipOverlay.java");
const tooltipComponentSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/ui/overlay/components/TooltipComponent.java");
const componentConstantsSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/ui/overlay/components/ComponentConstants.java");
const apiOpcodeSource = readKronosClient("runelite-api/src/main/java/net/runelite/api/MenuOpcode.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const hudSource = read("src/ui/KronosClientHud.tsx");
const mouseHighlightSource = read("src/ui/runeliteMouseHighlight.ts");
const cssSource = read("src/ui/styles.css");
const packageSource = read("package.json");

for (const sourceAnchor of [
  'name = "Mouse Tooltips"',
  'description = "Render default actions as a tooltip"',
  'tags = {"actions", "overlay", "tooltip", "hide"}',
  "overlayManager.add(overlay)",
  "adjustTips()",
  "WidgetInfo.SPELL_TOOLTIP",
  "WidgetInfo.COMBAT_TOOLTIP"
]) {
  assert(pluginSource.includes(sourceAnchor), `MouseHighlightPlugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("mousehighlight")',
  'keyName = "mainTooltip"',
  'keyName = "uiTooltip"',
  'keyName = "chatboxTooltip"',
  'keyName = "hideSpells"',
  'keyName = "hideCombat"',
  'keyName = "rightclickoptionTooltip"'
]) {
  assert(configSource.includes(sourceAnchor), `MouseHighlightConfig source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "client.isMenuOpen()",
  "client.getMenuEntries()",
  "menuEntries.length - 1",
  'case "Walk here":',
  'case "Cancel":',
  'case "Continue":',
  'target.contains("Sliding piece")',
  "client.getVar(VarClientInt.TOOLTIP_VISIBLE)",
  "tooltipManager.addFront(new Tooltip(sb.toString()))",
  "MenuOpcode.RUNELITE_OVERLAY.getId()",
  "MenuOpcode.EXAMINE_ITEM_BANK_EQ.getId()"
]) {
  assert(overlaySource.includes(sourceAnchor), `MouseHighlightOverlay source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "OFFSET = 24",
  "PADDING = 2",
  "OverlayPosition.TOOLTIP",
  "OverlayPriority.HIGHEST",
  "OverlayLayer.ALWAYS_ON_TOP",
  "client.getMouseCanvasPosition()"
]) {
  assert(tooltipOverlaySource.includes(sourceAnchor), `TooltipOverlay source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "OFFSET = 4",
  "STANDARD_BACKGROUND_COLOR",
  "Color.WHITE",
  "BR = Pattern.compile(\"</br>\")",
  "subLine.startsWith(\"col=\")"
]) {
  assert(tooltipComponentSource.includes(sourceAnchor), `TooltipComponent source missing ${sourceAnchor}`);
}

assert(componentConstantsSource.includes("new Color(70, 61, 50, 156)"), "ComponentConstants tooltip background changed.");
assert(apiOpcodeSource.includes("EXAMINE_ITEM_BANK_EQ(1007)") && apiOpcodeSource.includes("RUNELITE_OVERLAY(1501)"), "MenuOpcode ids changed.");

for (const trainerAnchor of [
  "RUNELITE_MOUSE_HIGHLIGHT_PLUGIN_ID",
  "RUNELITE_MOUSE_HIGHLIGHT_CONFIG_GROUP",
  "RuneliteMouseHighlightConfigSnapshot",
  'id: RUNELITE_MOUSE_HIGHLIGHT_PLUGIN_ID',
  'name: "Mouse Tooltips"',
  'sourcePath: "Kronos184-Client/runelite-client/src/main/java/net/runelite/client/plugins/mousehighlight/MouseHighlightPlugin.java"',
  'sourcePath: "Kronos184-Client/runelite-client/src/main/java/net/runelite/client/plugins/mousehighlight/MouseHighlightConfig.java"',
  "rightclickoptionTooltip",
  "mouseHighlight: {"
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell missing MouseHighlight anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "runeliteMouseHighlightTooltipSnapshot",
  "menuOpen: Boolean(contextMenu ?? sourceContextMenu)",
  "onInventoryHover",
  "onEquipmentItemHover",
  "onChatboxHover",
  "onSideTabHover",
  "RuneliteMouseHighlightTooltip",
  "MouseHighlightOverlay render client.isMenuOpen client.getMenuEntries()[last] TooltipManager.addFront",
  "TooltipOverlay position TOOLTIP priority HIGHEST layer ALWAYS_ON_TOP"
]) {
  assert(runtimeSource.includes(trainerAnchor), `RuntimeSceneViewer missing MouseHighlight runtime anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "onInventoryHover",
  "onEquipmentItemHover",
  "onChatboxHover",
  "onSideTabHover",
  "onPointerMove={(event) => onHover?.(command(event))",
  "onPointerLeave={() => onHover?.(null)}"
]) {
  assert(hudSource.includes(trainerAnchor), `KronosClientHud missing hover command anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "runeliteOverlayOpcode = 1501",
  "examineItemBankEqOpcode = 1007",
  "selectKronosDefaultMenuEntry",
  'actionText === "Walk here"',
  'actionText === "Cancel"',
  'actionText === "Continue"',
  'targetText.includes("Sliding piece")',
  "rightClickOptionTooltip"
]) {
  assert(mouseHighlightSource.includes(trainerAnchor), `runeliteMouseHighlight module missing source-backed anchor ${trainerAnchor}`);
}

for (const cssAnchor of [
  ".runeliteMouseHighlightTooltip",
  "z-index: 220",
  "rgba(70, 61, 50, 0.612)",
  ".runeliteMouseHighlightTooltipLine",
  "font: 12px Arial, sans-serif"
]) {
  assert(cssSource.includes(cssAnchor), `CSS missing MouseHighlight anchor ${cssAnchor}`);
}

assert(packageSource.includes('"verify:runelite-mousehighlight"'), "package.json missing verify:runelite-mousehighlight script.");

console.log("RuneLite MouseHighlight verifier passed: plugin/config, tooltip filtering, hover feeds, and TooltipOverlay visuals are source-backed.");
