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

const pluginSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/playerindicators/PlayerIndicatorsPlugin.java");
const configSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/playerindicators/PlayerIndicatorsConfig.java");
const overlaySource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/playerindicators/PlayerIndicatorsOverlay.java");
const minimapOverlaySource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/playerindicators/PlayerIndicatorsMinimapOverlay.java");
const serviceSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/playerindicators/PlayerIndicatorsService.java");
const locationSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/playerindicators/PlayerIndicationLocation.java");
const relationSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/playerindicators/PlayerRelation.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const indicatorsSource = read("src/ui/runelitePlayerIndicators.ts");
const cssSource = read("src/ui/styles.css");

for (const sourceAnchor of [
  'name = "Player Indicators"',
  'description = "Highlight players on-screen and/or on the minimap"',
  'enabledByDefault = false',
  'overlayManager.add(playerIndicatorsOverlay)',
  'overlayManager.add(playerIndicatorsMinimapOverlay)',
  'private final Map<PlayerRelation, Color> relationColorHashMap',
  'private final Map<PlayerRelation, Object[]> locationHashMap'
]) {
  assert(pluginSource.includes(sourceAnchor), `RuneLite PlayerIndicatorsPlugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("playerindicators")',
  'EnumSet<PlayerIndicationLocation> defaultPlayerIndicatorMode = EnumSet.complementOf(EnumSet.of(PlayerIndicationLocation.HULL))',
  'keyName = "drawOwnName"',
  'return new Color(0, 184, 212);',
  'keyName = "drawTargetsNames"',
  'return new Color(19, 110, 247);',
  'keyName = "showCombat"',
  'keyName = "drawOtherPlayerNames"',
  'return Color.RED;'
]) {
  assert(configSource.includes(sourceAnchor), `RuneLite PlayerIndicatorsConfig source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'private static final int ACTOR_OVERHEAD_TEXT_MARGIN = 40',
  'private static final int ACTOR_HORIZONTAL_TEXT_MARGIN = 10',
  'setPosition(OverlayPosition.DYNAMIC)',
  'setPriority(OverlayPriority.MED)',
  'playerIndicatorsService.forEachPlayer',
  'PlayerIndicationLocation.ABOVE_HEAD',
  'OverlayUtil.renderActorTextOverlay'
]) {
  assert(overlaySource.includes(sourceAnchor), `RuneLite PlayerIndicatorsOverlay source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'setLayer(OverlayLayer.ABOVE_WIDGETS)',
  'setPosition(OverlayPosition.DYNAMIC)',
  'setPriority(OverlayPriority.HIGH)',
  'PlayerIndicationLocation.MINIMAP',
  'actor.getMinimapLocation()',
  'OverlayUtil.renderTextLocation'
]) {
  assert(minimapOverlaySource.includes(sourceAnchor), `RuneLite PlayerIndicatorsMinimapOverlay source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'public void forEachPlayer',
  'PvPUtil.isAttackable(client, player)',
  'plugin.getLocationHashMap().containsKey(PlayerRelation.TARGET)',
  'plugin.isHighlightOwnPlayer() || plugin.isHighlightClan()'
]) {
  assert(serviceSource.includes(sourceAnchor), `RuneLite PlayerIndicatorsService source missing ${sourceAnchor}`);
}

for (const sourceAnchor of ['ABOVE_HEAD', 'HULL', 'MINIMAP', 'MENU', 'TILE']) {
  assert(locationSource.includes(sourceAnchor), `RuneLite PlayerIndicationLocation source missing ${sourceAnchor}`);
}

for (const sourceAnchor of ['SELF', 'TARGET', 'OTHER']) {
  assert(relationSource.includes(sourceAnchor), `RuneLite PlayerRelation source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  'id: "player-indicators"',
  'name: "Player Indicators"',
  'sourcePath: "Kronos184-Client/runelite-client/src/main/java/net/runelite/client/plugins/playerindicators/PlayerIndicatorsPlugin.java"',
  'sourcePath: "Kronos184-Client/runelite-client/src/main/java/net/runelite/client/plugins/playerindicators/PlayerIndicatorsConfig.java"',
  'group: "playerindicators"',
  'drawTargetsNames',
  'targetColor: "#136ef7"',
  'ownPlayerColor: "#00b8d4"'
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell missing Player Indicators anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'RUNELITE_PLAYER_INDICATORS_ACTOR_OVERHEAD_TEXT_MARGIN = 40',
  'RUNELITE_PLAYER_INDICATORS_ACTOR_HORIZONTAL_TEXT_MARGIN = 10',
  'RUNELITE_PLAYER_INDICATORS_DEFAULT_LOCATIONS',
  'RUNELITE_PLAYER_INDICATORS_TARGET_COLOR = "#136ef7"',
  'runelitePlayerIndicatorSnapshots'
]) {
  assert(indicatorsSource.includes(trainerAnchor), `runelitePlayerIndicators module missing source-backed anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'applyRunelitePlayerIndicatorsConfig',
  'PlayerIndicatorsPlugin startUp overlayManager.add(playerIndicatorsOverlay/minimapOverlay)',
  'PlayerIndicatorsOverlay setPosition(DYNAMIC) setPriority(MED)',
  'PlayerIndicatorsMinimapOverlay setLayer(ABOVE_WIDGETS) setPosition(DYNAMIC) setPriority(HIGH)',
  'PlayerIndicatorsService forEachPlayer',
  'buildRunelitePlayerIndicatorDomOverlays',
  'projectRuntimeActorClientOverlay(',
  'KRONOS_PLAYER_DEFAULT_HEIGHT_CLIENT_UNITS + RUNELITE_PLAYER_INDICATORS_ACTOR_OVERHEAD_TEXT_MARGIN',
  'className="runelitePlayerIndicatorOverlay"'
]) {
  assert(runtimeSource.includes(trainerAnchor), `RuntimeSceneViewer missing Player Indicators runtime anchor ${trainerAnchor}`);
}

for (const cssAnchor of [
  '.runelitePlayerIndicatorOverlay',
  'font: 12px Arial, sans-serif',
  'text-shadow: 1px 1px 0 #000000',
  'white-space: nowrap'
]) {
  assert(cssSource.includes(cssAnchor), `CSS missing Player Indicators anchor ${cssAnchor}`);
}

console.log("RuneLite Player Indicators verifier passed: plugin/config, service relation, dynamic overlay, and NH-relevant target/self wiring are source-backed.");
