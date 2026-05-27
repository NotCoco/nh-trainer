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

const pluginSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/pvptools/PvpToolsPlugin.java");
const panelSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/pvptools/PvpToolsPanel.java");
const configSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/pvptools/PvpToolsConfig.java");
const overlaySource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/pvptools/PlayerCountOverlay.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const cssSource = read("src/ui/styles.css");

for (const sourceAnchor of [
  'name = "PvP Tools"',
  'type = PluginType.PVP',
  'enabledByDefault = false',
  'overlayManager.add(playerCountOverlay)',
  'keyManager.registerKeyListener(renderselfHotkeyListener)',
  'tooltip("PvP Tools")',
  '.priority(5)',
  'hideAttackOptions(this.hideAttackMode)',
  'hideCastOptions(this.hideCastMode)',
  'client.setHideFriendAttackOptions(true)',
  'client.setHideClanmateAttackOptions(true)',
  'client.setHideFriendCastOptions(true)',
  'client.setHideClanmateCastOptions(true)',
  'client.setUnhiddenCasts(this.unhiddenCasts)',
  'getCarriedWealth()'
]) {
  assert(pluginSource.includes(sourceAnchor), `RuneLite PvP Tools plugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'setBorder(new EmptyBorder(10, 10, 10, 10))',
  'versionPanel.setLayout(new GridLayout(0, 1))',
  'riskPanel.setLayout(new GridLayout(0, 1))',
  'Friendly Player Count: ',
  'Other Player Count: ',
  'Enemies Praying Mage: ',
  'Risk Protecting Item: ',
  'Show missing CC members',
  'Show current CC members'
]) {
  assert(panelSource.includes(sourceAnchor), `RuneLite PvP Tools panel source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("pvptools")',
  'keyName = "countPlayers"',
  'keyName = "countOverHeads"',
  'keyName = "renderSelfHotkey"',
  'keyName = "hideAttack"',
  'keyName = "hideCast"',
  'keyName = "riskCalculator"',
  'keyName = "missingPlayers"',
  'keyName = "currentPlayers"'
]) {
  assert(configSource.includes(sourceAnchor), `RuneLite PvP Tools config source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'setLayer(OverlayLayer.ABOVE_WIDGETS)',
  'setPriority(OverlayPriority.HIGHEST)',
  'setPosition(OverlayPosition.TOP_LEFT)',
  'TableElement.builder().content("Friendly").color(Color.GREEN).build()',
  'TableElement.builder().content("Enemy").color(Color.RED).build()'
]) {
  assert(overlaySource.includes(sourceAnchor), `RuneLite PvP Tools overlay source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  'id: "pvp-tools"',
  'tooltip: "PvP Tools"',
  'iconPath: "runelite-plugins/pvptools/skull.png"',
  'group: "pvptools"',
  'RunelitePvpToolsPanel',
  'RunelitePvpToolsPlayerCountOverlay',
  'data-source-overlay="PlayerCountOverlay"',
  'runeliteQuantityToRsDecimalStack',
  'hideCastIgnored: "cure other, energy transfer, heal other, vengeance other"'
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell missing PvP Tools anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'runelitePvpToolsSnapshotFromCombatState',
  'friendlyPlayerCount: 0',
  'enemyPlayerCount: enemies.filter',
  'enemyPrayingMageCount',
  'riskProtectingItem',
  'runelitePvpToolsCarriedItems',
  'runelitePvpToolsItemValue',
  'pvpToolsSnapshot={runelitePvpToolsSnapshot}',
  'filterRunelitePvpToolsPlayerContextEntries',
  'runelitePvpToolsModeAppliesToRelation',
  'runelitePvpToolsUnhiddenCastSet',
  'applyRunelitePvpToolsConfig',
  'runelitePvpToolsRenderSelfHotkeyMatches',
  'runelitePvpToolsActorRenderSelfVisible',
  'runelitePvpToolsRenderSelf',
  'sourcePvpToolsRenderSelfListener',
  'runeliteClientConfig.pvpTools',
  'client.setHideFriend/ClanAttackOptions',
  'client.setHideFriend/ClanmateCastOptions',
  'client.setUnhiddenCasts from hideCastIgnored',
  'PvpToolsPlugin renderselfHotkeyListener keyManager.registerKeyListener -> client.setRenderSelf(!client.getRenderSelf())'
]) {
  assert(runtimeSource.includes(trainerAnchor), `RuntimeSceneViewer missing PvP Tools runtime anchor ${trainerAnchor}`);
}

for (const cssAnchor of [
  '.runelitePvpToolsPanel',
  '.runelitePvpToolsInfoPanel',
  '.runelitePvpToolsRiskPanel',
  '.runelitePvpToolsPlayerCountOverlay',
  '.runelitePvpToolsFriendlyLabel',
  '.runelitePvpToolsEnemyLabel'
]) {
  assert(cssSource.includes(cssAnchor), `CSS missing PvP Tools anchor ${cssAnchor}`);
}

assert(
  fs.existsSync(path.join(projectRoot, "fixtures", "runelite-plugins", "pvptools", "skull.png")),
  "missing RuneLite PvP Tools skull.png asset"
);

console.log("RuneLite PvP Tools verifier passed: config, panel, top-left count overlay, menu filtering, render-self hotkey, and runtime snapshot are source-backed.");
