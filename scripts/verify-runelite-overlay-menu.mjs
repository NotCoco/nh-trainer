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

const overlayRendererSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/ui/overlay/OverlayRenderer.java");
const overlayManagerSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/ui/overlay/OverlayManager.java");
const overlayMenuEntrySource = readKronosClient("runelite-client/src/main/java/net/runelite/client/ui/overlay/OverlayMenuEntry.java");
const configPluginSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/config/ConfigPlugin.java");
const runeliteConfigSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/config/RuneLiteConfig.java");
const menuOpcodeSource = readKronosClient("runelite-api/src/main/java/net/runelite/api/MenuOpcode.java");
const attackStylesOverlaySource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/attackstyles/AttackStylesOverlay.java");
const boostsOverlaySource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/boosts/BoostsOverlay.java");
const combatIconsOverlaySource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/boosts/CombatIconsOverlay.java");
const opponentInfoOverlaySource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/opponentinfo/OpponentInfoOverlay.java");
const playerComparisonOverlaySource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/opponentinfo/PlayerComparisonOverlay.java");
const pvpPerformanceOverlaySource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/pvpperformancetracker/PvpPerformanceTrackerOverlay.java");

const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const packageSource = read("package.json");

for (const sourceAnchor of [
  "if (!inMenuEntryMode && runeLiteConfig.menuEntryShift())",
  "if (e.isShiftDown() && runeLiteConfig.menuEntryShift())",
  "bounds.contains(mouse)",
  "menuEntries = createRightClickMenuEntries(overlay)",
  "entry.setOpcode(MenuOpcode.RUNELITE_OVERLAY.getId())",
  "overlayManager.getOverlays().indexOf(overlay)"
]) {
  assert(overlayRendererSource.includes(sourceAnchor), `OverlayRenderer source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "if (event.getMenuOpcode() != MenuOpcode.RUNELITE_OVERLAY)",
  "new OverlayMenuClicked(overlayMenuEntry, overlay)"
]) {
  assert(overlayManagerSource.includes(sourceAnchor), `OverlayManager source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "@Value",
  "private MenuOpcode menuOpcode",
  "private String option",
  "private String target"
]) {
  assert(overlayMenuEntrySource.includes(sourceAnchor), `OverlayMenuEntry source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "eventBus.subscribe(OverlayMenuClicked.class, this, this::onOverlayMenuClicked)",
  "overlayMenuEntry.getMenuOpcode() == MenuOpcode.RUNELITE_OVERLAY_CONFIG",
  "configPanel.openConfigurationPanel(descriptor.name())"
]) {
  assert(configPluginSource.includes(sourceAnchor), `ConfigPlugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'keyName = "menuEntryShift"',
  "default boolean menuEntryShift()",
  "return true;"
]) {
  assert(runeliteConfigSource.includes(sourceAnchor), `RuneLiteConfig source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "RUNELITE_OVERLAY(1501)",
  "RUNELITE_OVERLAY_CONFIG(1502)"
]) {
  assert(menuOpcodeSource.includes(sourceAnchor), `MenuOpcode source missing ${sourceAnchor}`);
}

for (const [name, source, target] of [
  ["AttackStylesOverlay", attackStylesOverlaySource, "Attack style overlay"],
  ["BoostsOverlay", boostsOverlaySource, "Boosts overlay"],
  ["CombatIconsOverlay", combatIconsOverlaySource, "Boosts overlay"],
  ["OpponentInfoOverlay", opponentInfoOverlaySource, "Opponent info overlay"],
  ["PlayerComparisonOverlay", playerComparisonOverlaySource, "Opponent info overlay"],
  ["PvpPerformanceTrackerOverlay", pvpPerformanceOverlaySource, "PvP Performance Tracker"]
]) {
  assert(source.includes("RUNELITE_OVERLAY_CONFIG"), `${name} source missing RUNELITE_OVERLAY_CONFIG`);
  assert(source.includes(`"${target}"`), `${name} source missing target ${target}`);
}

for (const trainerAnchor of [
  "RuneliteOverlayMenuConfigSnapshot",
  "overlayMenu: {",
  "requireShift: true",
  "runeliteValues.menuEntryShift",
  "RUNELITE_OVERLAY_MENU_SOURCE",
  "RUNELITE_OVERLAY_CONFIG_CLICK_SOURCE",
  "runelite-overlay-config",
  "openConfigRequest",
  'dispatchSidebar({ type: "openPanel", id: "configuration" })',
  "ConfigPlugin.onOverlayMenuClicked RUNELITE_OVERLAY_CONFIG opens configPanel.openConfigurationPanel"
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell missing overlay-menu anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "RuneliteOverlayConfigContextMenuEntry",
  "RUNELITE_OVERLAY_MENU_OPCODE = 1501",
  "runeliteOverlayConfigContextEntries",
  "overlayMenuConfig.requireShift && !event.shiftKey",
  "data-runelite-overlay-menu-target",
  "data-runelite-config-plugin-id",
  "data-source-runelite-overlay-menu",
  "data-source-runelite-overlay-menu-click",
  'sourceOverlayMenuOpcode: "RUNELITE_OVERLAY_CONFIG"',
  'new CustomEvent("runelite-overlay-config"',
  'data-runelite-overlay-menu-target="Attack style overlay"',
  'data-runelite-overlay-menu-target="Boosts overlay"',
  'data-runelite-overlay-menu-target="Opponent info overlay"'
]) {
  assert(runtimeSource.includes(trainerAnchor), `RuntimeSceneViewer missing overlay-menu anchor ${trainerAnchor}`);
}

assert(packageSource.includes('"verify:runelite-overlay-menu"'), "package.json missing verify:runelite-overlay-menu script");

console.log("RuneLite overlay-menu verifier passed: menuEntryShift, overlay bounds, RUNELITE_OVERLAY_CONFIG rows, and config-panel dispatch are source-backed.");
