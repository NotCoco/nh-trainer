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

const pluginSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/attackstyles/AttackStylesPlugin.java");
const configSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/attackstyles/AttackStylesConfig.java");
const overlaySource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/attackstyles/AttackStylesOverlay.java");
const attackStyleSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/attackstyles/AttackStyle.java");
const weaponTypeSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/attackstyles/WeaponType.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const hudSource = read("src/ui/NhClientHud.tsx");
const attackStylesSource = read("src/ui/runeliteAttackStyles.ts");
const cssSource = read("src/ui/styles.css");

for (const sourceAnchor of [
  'name = "Attack Styles"',
  'description = "Show your current attack style as an overlay"',
  'tags = {"combat", "defence", "magic", "overlay", "ranged", "strength", "warn", "pure"}',
  "overlayManager.add(overlay)",
  "VarPlayer.ATTACK_STYLE",
  "Varbits.EQUIPPED_WEAPON_TYPE",
  "Varbits.DEFENSIVE_CASTING_MODE",
  "updateAttackStyle(",
  "updateWarning(",
  "hideWarnedStyles(",
  "WidgetInfo.COMBAT_AUTO_RETALIATE"
]) {
  assert(pluginSource.includes(sourceAnchor), `RuneLite AttackStylesPlugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("attackIndicator")',
  'keyName = "alwaysShowStyle"',
  'keyName = "warnForDefensive"',
  'keyName = "warnForAttack"',
  'keyName = "warnForStrength"',
  'keyName = "warnForRanged"',
  'keyName = "warnForMagic"',
  'keyName = "hideAutoRetaliate"',
  'keyName = "removeWarnedStyles"'
]) {
  assert(configSource.includes(sourceAnchor), `RuneLite AttackStylesConfig source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "setPosition(OverlayPosition.ABOVE_CHATBOX_RIGHT)",
  "PanelComponent",
  "TitleComponent.builder()",
  "warnedSkillSelected ? Color.RED : Color.WHITE",
  "graphics.getFontMetrics().stringWidth(attackStyleString) + 10",
  'new OverlayMenuEntry(RUNELITE_OVERLAY_CONFIG, OPTION_CONFIGURE, "Attack style overlay")'
]) {
  assert(overlaySource.includes(sourceAnchor), `RuneLite AttackStylesOverlay source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'ACCURATE("Accurate", Skill.ATTACK)',
  'AGGRESSIVE("Aggressive", Skill.STRENGTH)',
  'DEFENSIVE("Defensive", Skill.DEFENCE)',
  'CONTROLLED("Controlled", Skill.ATTACK, Skill.STRENGTH, Skill.DEFENCE)',
  'RANGING("Ranging", Skill.RANGED)',
  'LONGRANGE("Longrange", Skill.RANGED, Skill.DEFENCE)',
  'CASTING("Casting", Skill.MAGIC)',
  'DEFENSIVE_CASTING("Defensive Casting", Skill.MAGIC, Skill.DEFENCE)'
]) {
  assert(attackStyleSource.includes(sourceAnchor), `RuneLite AttackStyle source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "TYPE_0(ACCURATE, AGGRESSIVE, null, DEFENSIVE)",
  "TYPE_3(RANGING, RANGING, null, LONGRANGE)",
  "TYPE_18(ACCURATE, AGGRESSIVE, null, DEFENSIVE, CASTING, DEFENSIVE_CASTING)",
  "TYPE_23(CASTING, CASTING, null, DEFENSIVE_CASTING)",
  "builder.put(weaponType.ordinal(), weaponType)",
  "getWeaponType(int id)"
]) {
  assert(weaponTypeSource.includes(sourceAnchor), `RuneLite WeaponType source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  'id: "attack-styles"',
  'name: "Attack Styles"',
  'group: "attackIndicator"',
  'sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/attackstyles/AttackStylesPlugin.java"',
  'sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/attackstyles/AttackStylesConfig.java"',
  'keyName: "warnForDefensive"',
  'keyName: "hideAutoRetaliate"',
  'keyName: "removeWarnedStyles"',
  "readonly attackStyles: RuneliteAttackStylesConfigSnapshot"
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell missing Attack Styles anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'RUNELITE_TRAINER_DISABLED_PLUGIN_IDS = new Set(["attack-styles"])',
  "RUNELITE_TRAINER_DISABLED_PLUGIN_SOURCE",
  "runeliteTrainerAvailablePluginListItems",
  "runeliteConfigPluginListItems.filter((item) => !RUNELITE_TRAINER_DISABLED_PLUGIN_IDS.has(item.id))"
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell should keep Attack Styles source-backed but unavailable in the trainer plugin list: ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'RUNELITE_ATTACK_STYLES_OVERLAY_POSITION = "ABOVE_CHATBOX_RIGHT"',
  "RUNELITE_ATTACK_STYLES_PANEL_PADDING_X = 10",
  'RUNELITE_ATTACK_STYLES_TEXT_NORMAL_RGBA = "rgb(255, 255, 255)"',
  'RUNELITE_ATTACK_STYLES_TEXT_WARNING_RGBA = "rgb(255, 0, 0)"',
  "RUNELITE_WEAPON_TYPE_ATTACK_STYLES",
  '["ACCURATE", "AGGRESSIVE", null, "DEFENSIVE"]',
  '["RANGING", "RANGING", null, "LONGRANGE"]',
  '["CASTING", "CASTING", null, "DEFENSIVE_CASTING"]',
  "runeliteAttackStylesOverlaySnapshot",
  "runeliteAttackStyleForWeapon",
  "runeliteAttackStyleIsWarned",
  "runeliteAttackStylesWarnsForSkill"
]) {
  assert(attackStylesSource.includes(trainerAnchor), `runeliteAttackStyles module missing source-backed anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "applyRuneliteAttackStylesConfig",
  "AttackStylesPlugin startUp overlayManager.add(overlay)",
  "AttackStylesOverlay setPosition(ABOVE_CHATBOX_RIGHT)",
  "VarPlayer.ATTACK_STYLE Varbits.EQUIPPED_WEAPON_TYPE Varbits.DEFENSIVE_CASTING_MODE",
  "WeaponType.getWeaponType(equippedWeaponType).getAttackStyles()",
  "runeliteAttackStylesOverlaySnapshot",
  "RUNELITE_ATTACK_STYLES_OVERLAY_POSITION",
  "RUNELITE_ATTACK_STYLES_TEXT_WARNING_RGBA",
  "runeliteAttackStylesOverlay"
]) {
  assert(runtimeSource.includes(trainerAnchor), `RuntimeSceneViewer missing Attack Styles runtime anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "attackStylesConfig={runeliteClientConfig.attackStyles}"
]) {
  assert(runtimeSource.includes(trainerAnchor), `RuntimeSceneViewer missing Attack Styles HUD wiring ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "attackStylesConfig?: RuneliteAttackStylesConfigSnapshot | null",
  "runeliteAttackStyleForWeapon",
  "runeliteAttackStyleIsWarned",
  "hideAutoRetaliate",
  "visibleStyleSlots",
  "visibleAutocastControls",
  "autoRetaliate && !hideAutoRetaliate",
  "nhCombatStyleHiddenByRuneliteAttackStyles",
  "nhAutocastControlHiddenByRuneliteAttackStyles",
  "config.removeWarnedStyles",
  "control.defensive ? 5 : 4"
]) {
  assert(hudSource.includes(trainerAnchor), `NhClientHud missing AttackStylesPlugin widget effect ${trainerAnchor}`);
}

for (const cssAnchor of [
  ".runeliteAttackStylesOverlay",
  ".runeliteAttackStylesTitle",
  "background: rgba(70, 61, 50, 0.612)",
  "border: 1px solid rgba(56, 48, 35, 1)"
]) {
  assert(cssSource.includes(cssAnchor), `CSS missing Attack Styles anchor ${cssAnchor}`);
}

console.log("RuneLite Attack Styles verifier passed: source-backed code remains available for combat-tab parity, but the trainer plugin is disabled.");
