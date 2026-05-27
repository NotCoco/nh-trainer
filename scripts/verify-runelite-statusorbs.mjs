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

const statusOrbsPluginSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/statusorbs/StatusOrbsPlugin.java");
const statusOrbsConfigSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/statusorbs/StatusOrbsConfig.java");
const statusOrbsOverlaySource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/statusorbs/StatusOrbsOverlay.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const statusOrbsSource = read("src/ui/runeliteStatusOrbs.ts");
const cssSource = read("src/ui/styles.css");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const sourceAnchor of [
  'name = "Status Orbs"',
  'description = "Configure settings for the Minimap orbs"',
  'tags = {"minimap", "orb", "regen", "energy", "special"}',
  'private static final int SPEC_REGEN_TICKS = 50',
  'private static final int NORMAL_HP_REGEN_TICKS = 100',
  'client.getVar(VarPlayer.SPECIAL_ATTACK_PERCENT) == 1000',
  'ticksSinceSpecRegen = (ticksSinceSpecRegen + 1) % SPEC_REGEN_TICKS',
  'hitpointsPercentage = ticksSinceHPRegen / (double) ticksPerHPRegen',
  'currentHP == maxHP && !this.showWhenNoChange',
  'currentHP > maxHP',
  'runPercentage = ticksSinceRunRegen * runRegenPerTick()',
  'setRunOrbText(getEstimatedRunTimeRemaining(true))',
  'WidgetInfo.MINIMAP_RUN_ORB_TEXT',
  'String getEstimatedRunTimeRemaining(boolean inSeconds)',
  'final double secondsLeft = (client.getEnergy() * 0.6) / lossRate'
]) {
  assert(statusOrbsPluginSource.includes(sourceAnchor), `Nh RuneLite StatusOrbsPlugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("statusorbs")',
  'keyName = "dynamicHpHeart"',
  'default boolean showHitpoints()',
  'default boolean showWhenNoChange()',
  'keyName = "notifyBeforeHpRegenDuration"',
  'default boolean showSpecial()',
  'default boolean showRun()',
  'default boolean replaceOrbText()'
]) {
  assert(statusOrbsConfigSource.includes(sourceAnchor), `Nh RuneLite StatusOrbsConfig source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'setPosition(OverlayPosition.DYNAMIC)',
  'setLayer(OverlayLayer.ABOVE_WIDGETS)',
  'private static final double DIAMETER = 26D',
  'private static final int OFFSET = 27',
  'WidgetInfo.MINIMAP_HEALTH_ORB',
  'WidgetInfo.MINIMAP_SPEC_ORB',
  'WidgetInfo.MINIMAP_RUN_ORB',
  'new Color(255, 255, 255, 60)',
  'Arc2D.Double(bounds.x + OFFSET',
  'new BasicStroke(2f, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER)'
]) {
  assert(statusOrbsOverlaySource.includes(sourceAnchor), `Nh RuneLite StatusOrbsOverlay source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  'id: "status-orbs"',
  'name: "Status Orbs"',
  'sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/statusorbs/StatusOrbsPlugin.java"',
  'sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/statusorbs/StatusOrbsConfig.java"',
  'group: "statusorbs"',
  'statusOrbs: {',
  'notifyBeforeHpRegenSeconds',
  'replaceOrbText'
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell missing Status Orbs anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'RUNELITE_STATUS_ORBS_SPEC_REGEN_TICKS = 50',
  'RUNELITE_STATUS_ORBS_NORMAL_HP_REGEN_TICKS = 100',
  'RUNELITE_STATUS_ORBS_DIAMETER = 26',
  'RUNELITE_STATUS_ORBS_OFFSET = 27',
  'RUNELITE_STATUS_ORBS_ARC_SOURCE',
  'runeliteStatusOrbSnapshots',
  'runeliteStatusOrbsHitpointsPercentage',
  'hud.prayers?.["rapid-heal"]',
  'hud.specialEnergy >= 100',
  'runeliteStatusOrbsRunPercentage',
  'RUNELITE_STATUS_ORBS_RUN_ORB_TEXT_SOURCE = "WidgetInfo.MINIMAP_RUN_ORB_TEXT"',
  'runeliteStatusOrbsRunOrbText',
  'runeliteStatusOrbsEstimatedRunTimeRemaining',
  'RUNELITE_STATUS_ORBS_STAMINA_DEPLETION_MULTIPLIER = 0.3'
]) {
  assert(statusOrbsSource.includes(trainerAnchor), `runeliteStatusOrbs module missing source-backed anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'applyRuneliteStatusOrbsConfig',
  'StatusOrbsOverlay setPosition(DYNAMIC) setLayer(ABOVE_WIDGETS)',
  'runeliteStatusOrbSnapshots',
  'runeliteStatusOrbOverlayStyle',
  'className="runeliteStatusOrbOverlay"',
  'data-source-widget={orb.sourceWidget}',
  'data-source-arc={RUNELITE_STATUS_ORBS_ARC_SOURCE}',
  'data-source-stroke={RUNELITE_STATUS_ORBS_STROKE_SOURCE}',
  'runeliteRunOrbText',
  'runOrbTextOverride={runeliteRunOrbText}'
]) {
  assert(runtimeSource.includes(trainerAnchor), `RuntimeSceneViewer missing Status Orbs runtime anchor ${trainerAnchor}`);
}

for (const hudAnchor of [
  'runOrbTextOverride?: string | null',
  'valueTextOverride?: string | null',
  'valueTextOverride={runOrbTextOverride}',
  'data-value-text-source={valueTextOverride === undefined || valueTextOverride === null ? "source-widget-value" : "runelite-status-orbs"}'
]) {
  assert(read("src/ui/NhClientHud.tsx").includes(hudAnchor), `NhClientHud missing Status Orbs text anchor ${hudAnchor}`);
}

for (const cssAnchor of [
  '.runeliteStatusOrbOverlay',
  '.runeliteStatusOrbArc',
  'vector-effect: non-scaling-stroke',
  'shape-rendering: geometricPrecision'
]) {
  assert(cssSource.includes(cssAnchor), `CSS missing Status Orbs anchor ${cssAnchor}`);
}

console.log("RuneLite Status Orbs verifier passed: plugin/config/overlay constants, run-orb text mutation, and fixed minimap orb placement are source-backed.");
