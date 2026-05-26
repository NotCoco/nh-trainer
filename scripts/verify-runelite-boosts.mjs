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

const pluginSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/boosts/BoostsPlugin.java");
const configSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/boosts/BoostsConfig.java");
const overlaySource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/boosts/BoostsOverlay.java");
const combatIconsSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/boosts/CombatIconsOverlay.java");
const boostIndicatorSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/boosts/BoostIndicator.java");
const infoBoxOverlaySource = readKronosClient("runelite-client/src/main/java/net/runelite/client/ui/overlay/infobox/InfoBoxOverlay.java");
const infoBoxManagerSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/ui/overlay/infobox/InfoBoxManager.java");
const runeLiteConfigSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/config/RuneLiteConfig.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const boostsSource = read("src/ui/runeliteBoosts.ts");
const cssSource = read("src/ui/styles.css");

for (const sourceAnchor of [
  'name = "Boosts Information"',
  'description = "Show combat and/or skill boost information"',
  "Skill.ATTACK",
  "Skill.STRENGTH",
  "Skill.DEFENCE",
  "Skill.RANGED",
  "Skill.MAGIC",
  "overlayManager.add(boostsOverlay)",
  "overlayManager.add(combatIconsOverlay)",
  "infoBoxManager.addInfoBox(new BoostIndicator",
  "updateShownSkills",
  "updateBoostedStats"
]) {
  assert(pluginSource.includes(sourceAnchor), `RuneLite BoostsPlugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("boosts")',
  'keyName = "displayBoosts"',
  "default DisplayBoosts displayBoosts()",
  "return DisplayBoosts.BOTH;",
  'keyName = "relativeBoost"',
  'keyName = "displayIndicators"',
  'keyName = "displayIconPanel"',
  'keyName = "displayNextBuffChange"',
  "return DisplayChangeMode.BOOSTED;",
  'keyName = "displayNextDebuffChange"',
  "return DisplayChangeMode.NEVER;"
]) {
  assert(configSource.includes(sourceAnchor), `RuneLite BoostsConfig source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "setPosition(OverlayPosition.TOP_LEFT)",
  "setPriority(OverlayPriority.MED)",
  "new TableComponent()",
  "tableComponent.setColumnAlignments(TableAlignment.LEFT, TableAlignment.RIGHT)",
  "plugin.canShowBoosts()",
  "client.getBoostedSkillLevel(skill)",
  "client.getRealSkillLevel(skill)",
  "ColorUtil.prependColorTag(Integer.toString(boosted), strColor)"
]) {
  assert(overlaySource.includes(sourceAnchor), `RuneLite BoostsOverlay source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "panelComponent.setPreferredSize(new Dimension(28, 0))",
  "panelComponent.setWrapping(2)",
  "panelComponent.setBackgroundColor(null)",
  "iconManager.getSkillImage(skill, true)",
  "FontManager.getRunescapeBoldFont()"
]) {
  assert(combatIconsSource.includes(sourceAnchor), `RuneLite CombatIconsOverlay source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'setTooltip(skill.getName() + " boost")',
  "setPriority(InfoBoxPriority.HIGH)",
  "plugin.isDisplayInfoboxes()",
  "plugin.canShowBoosts()",
  "plugin.getShownSkills().contains(getSkill())",
  "client.getBoostedSkillLevel(skill) != client.getRealSkillLevel(skill)"
]) {
  assert(boostIndicatorSource.includes(sourceAnchor), `RuneLite BoostIndicator source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "setPosition(OverlayPosition.TOP_LEFT)",
  "panelComponent.setBackgroundColor(null)",
  "panelComponent.setBorder(new Rectangle())",
  "panelComponent.setGap(new Point(1, 1))",
  "panelComponent.setWrapping(config.infoBoxWrap())",
  "ComponentOrientation.VERTICAL",
  "ComponentOrientation.HORIZONTAL",
  "panelComponent.setPreferredSize(new Dimension(config.infoBoxSize(), config.infoBoxSize()))"
]) {
  assert(infoBoxOverlaySource.includes(sourceAnchor), `RuneLite InfoBoxOverlay source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'event.getGroup().equals("runelite") && event.getKey().equals("infoBoxSize")',
  "final double size = Math.max(2, runeLiteConfig.infoBoxSize())",
  "infoBoxes.sort"
]) {
  assert(infoBoxManagerSource.includes(sourceAnchor), `RuneLite InfoBoxManager source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'keyName = "infoBoxVertical"',
  "default boolean infoBoxVertical()",
  "return false;",
  'keyName = "infoBoxWrap"',
  "default int infoBoxWrap()",
  "return 4;",
  'keyName = "infoBoxSize"',
  "default int infoBoxSize()",
  "return 35;"
]) {
  assert(runeLiteConfigSource.includes(sourceAnchor), `RuneLiteConfig source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  'id: "boosts-information"',
  'name: "Boosts Information"',
  'group: "boosts"',
  'sourcePath: "Kronos184-Client/runelite-client/src/main/java/net/runelite/client/plugins/boosts/BoostsPlugin.java"',
  'sourcePath: "Kronos184-Client/runelite-client/src/main/java/net/runelite/client/plugins/boosts/BoostsConfig.java"',
  'keyName: "infoBoxVertical"',
  'keyName: "infoBoxWrap"',
  'keyName: "infoBoxSize"',
  "RuneliteInfoBoxConfigSnapshot",
  'displayBoosts: "BOTH"',
  'displayNextBuffChange: "BOOSTED"',
  'displayNextDebuffChange: "NEVER"'
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell missing Boosts anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "RUNELITE_BOOSTS_COMBAT_SKILL_ORDER",
  'sourceSkill: "Skill.ATTACK"',
  'sourceSkill: "Skill.STRENGTH"',
  'sourceSkill: "Skill.DEFENCE"',
  'sourceSkill: "Skill.RANGED"',
  'sourceSkill: "Skill.MAGIC"',
  "runeliteBoostsOverlaySnapshot",
  "runeliteBoostsInfoBoxSnapshot",
  "RuneliteBoostsInfoBoxSnapshot",
  "InfoBoxPriority.HIGH",
  "RUNELITE_INFOBOX_MIN_SIZE_PX = 2",
  "RUNELITE_BOOSTS_ICON_PANEL_WIDTH = 28"
]) {
  assert(boostsSource.includes(trainerAnchor), `runeliteBoosts module missing source-backed anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "applyRuneliteBoostsConfig",
  "BoostsPlugin startUp overlayManager.add(boostsOverlay/combatIconsOverlay)",
  "BoostsOverlay setPosition(TOP_LEFT) setPriority(MED)",
  "CombatIconsOverlay setPosition(TOP_LEFT) setPriority(MED)",
  "InfoBoxOverlay setPosition(TOP_LEFT)",
  "RuneLiteConfig infoBoxVertical/infoBoxWrap/infoBoxSize",
  "BoostIndicator",
  "runeliteBoostsOverlaySnapshot",
  "runeliteBoostsInfoBoxSnapshot",
  "runeliteInfoBoxOverlay",
  'className={`runeliteBoostsOverlay runeliteBoostsOverlay-${runeliteBoostsOverlay.mode}`}'
]) {
  assert(runtimeSource.includes(trainerAnchor), `RuntimeSceneViewer missing Boosts runtime anchor ${trainerAnchor}`);
}

for (const cssAnchor of [
  ".runeliteBoostsOverlay",
  "background: rgba(70, 61, 50, 0.612)",
  ".runeliteBoostsOverlay-combat-icons",
  "width: 28px",
  ".runeliteBoostsIcon",
  ".runeliteInfoBoxOverlay",
  ".runeliteInfoBox",
  ".runeliteInfoBoxImage",
  ".runeliteInfoBoxText"
]) {
  assert(cssSource.includes(cssAnchor), `CSS missing Boosts anchor ${cssAnchor}`);
}

for (const asset of [
  "fixtures/runelite-ui/skill_icons_small/attack.png",
  "fixtures/runelite-ui/skill_icons_small/strength.png",
  "fixtures/runelite-ui/skill_icons_small/defence.png",
  "fixtures/runelite-ui/skill_icons_small/ranged.png",
  "fixtures/runelite-ui/skill_icons_small/magic.png",
  "fixtures/runelite-plugins/boosts/buffedSmall.png",
  "fixtures/runelite-plugins/boosts/debuffedSmall.png"
]) {
  assert(fs.existsSync(path.join(projectRoot, asset)), `Missing copied RuneLite Boosts asset ${asset}`);
}

console.log("RuneLite Boosts verifier passed: plugin/config, panel/icon/infobox overlays, combat skill order, and assets are source-backed.");
