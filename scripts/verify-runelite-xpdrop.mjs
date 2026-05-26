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

function readKronosServerScript(fileName) {
  return fs.readFileSync(
    path.resolve(
      projectRoot,
      "..",
      "kronos-osrs-184-master",
      "kronos-osrs-184-master",
      "Kronos-master",
      "scripts",
      fileName
    ),
    "utf8"
  );
}

function readKronosServer(relativePath) {
  return fs.readFileSync(
    path.resolve(
      projectRoot,
      "..",
      "kronos-osrs-184-master",
      "kronos-osrs-184-master",
      "Kronos-master",
      relativePath
    ),
    "utf8"
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const pluginSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/experiencedrop/XpDropPlugin.java");
const configSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/experiencedrop/XpDropConfig.java");
const overlaySource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/experiencedrop/XpDropOverlay.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const hudSource = read("src/ui/KronosClientHud.tsx");
const fixedLayoutSource = read("src/render/kronosFixedLayout.ts");
const cssSource = read("src/ui/styles.css");
const combatSource = read("src/sim/runtimePlayerCombat.ts");
const statTransmitSource = readKronosServerScript("[clientscript,xpdrops_stattransmit].cs2");
const dropletMoveSource = readKronosServerScript("[clientscript,xpdrops_dropletmove].cs2");
const setPositionSource = readKronosServerScript("[proc,xpdrops_setposition].cs2");
const setDropSizeSource = readKronosServerScript("[proc,xpdrops_setdropsize].cs2");
const orbUpdateSource = readKronosServerScript("[proc,orbs_xpdrops_update].cs2");
const orbOpSource = readKronosServerScript("[clientscript,orbs_xpdrops_op].cs2");
const xpCounterSource = readKronosServer("kronos-server/src/main/java/io/ruin/model/inter/handlers/XpCounter.java");
const combatUtilsSource = readKronosServer("kronos-server/src/main/java/io/ruin/model/combat/CombatUtils.java");
const iceBarrageSource = readKronosServer("kronos-server/src/main/java/io/ruin/model/skills/magic/spells/ancient/IceBarrage.java");
const bloodBarrageSource = readKronosServer("kronos-server/src/main/java/io/ruin/model/skills/magic/spells/ancient/BloodBarrage.java");

for (const sourceAnchor of [
  'name = "XP Drop"',
  'tags = {"experience", "levels", "tick"}',
  'HITPOINT_RATIO = 1.33',
  'overlayManager.add(overlay)',
  'eventBus.subscribe(ExperienceChanged.class',
  'eventBus.subscribe(ScriptCallbackEvent.class',
  'eventName.equals("hpXpGained")',
  'tickShow = 3'
]) {
  assert(pluginSource.includes(sourceAnchor), `RuneLite XP Drop plugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("xpdrop")',
  'keyName = "hideSkillIcons"',
  'keyName = "meleePrayerColor"',
  'keyName = "rangePrayerColor"',
  'keyName = "magePrayerColor"',
  'keyName = "fakeXpDropDelay"',
  'keyName = "showdamagedrops"',
  'keyName = "damageColor"',
  'ABOVE_OPPONENT',
  'IN_XP_DROP'
]) {
  assert(configSource.includes(sourceAnchor), `RuneLite XP Drop config source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'setPosition(OverlayPosition.DYNAMIC)',
  'setPriority(OverlayPriority.MED)',
  'opponent.getLogicalHeight() + 50',
  'opponent.getCanvasTextLocation(graphics, damageStr, offset)',
  'OverlayUtil.renderTextLocation'
]) {
  assert(overlaySource.includes(sourceAnchor), `RuneLite XP Drop overlay source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  'id: "xp-drop"',
  'name: "XP Drop"',
  'group: "xpdrop"',
  'RuneliteXpDropConfigSnapshot',
  'RuneliteXpDropDamageMode',
  'RuneliteXpDropDisplayMode',
  'RuneliteXpDropTextSize',
  'RuneliteXpDropFont',
  'showDamageDrops: runeliteXpDropDamageMode',
  'trainerDisplayMode: runeliteXpDropDisplayMode',
  'nativeTextSize: runeliteXpDropTextSize',
  'trainerFont: runeliteXpDropFont',
  'trainerTextSize: runeliteConfigNumberRange',
  'trainerMoveDistance: runeliteConfigNumberRange',
  'keyName: "showdamagedrops"',
  'keyName: "trainerDisplayMode"',
  'keyName: "nativeTextSize"',
  'keyName: "trainerFont"',
  'keyName: "trainerTextSize"',
  'keyName: "trainerMoveDistance"',
  'type: "number"',
  'className="runeliteConfigNumberInput"',
  'name: "Native XP drop size"',
  'Config.XP_DROPS_SIZE varbit 4693',
  'Trainer extension: start the source-backed XP-drop plugin enabled',
  'sourcePath: "Kronos184-Client/runelite-client/src/main/java/net/runelite/client/plugins/experiencedrop/XpDropPlugin.java"'
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell missing XP Drop anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'applyRuneliteXpDropConfig',
  'buildRuneliteXpDropDamageDomOverlay',
  'syncRuneliteXpDropDomOverlays',
  'emittedQueuedHitIds: Set<string>',
  'XpDropPlugin responds once to ExperienceChanged/ScriptCallbackEvent hpXpGained',
  'activeDroplets.has(hit.id) || emittedQueuedHitIds.has(hit.id)',
  'runtimePlayerCombatQueuedHitDamage(combatState.actors, hit, combatState.tick)',
  'runtimePlayerCombatXpDropsForDamage(hit, damage)',
  'RUNELITE_XP_DROP_TEXT_SIZE_SPECS',
  'RUNELITE_XP_DROP_FONT_SPECS',
  'RUNELITE_XP_DROP_SKILL_ICONS',
  'fontArchiveName: "p11_full"',
  'fontArchiveName: "p12_full"',
  'fontArchiveName: "b12_full"',
  'varbit4693: 2',
  "RUNELITE_XP_DROP_SOURCE_WIDTH_PADDING = 3",
  "runeliteXpDropSourceWidth(textWidth, skillIcons.length, textSizeSpec.textHeight)",
  "runeliteXpDropSkillIcons(droplet.xpDrops)",
  'kronosClientFontStringWidth(font, text)',
  'RuneliteXpDropGlyphText',
  'RUNELITE_XP_DROP_DURATION_CLIENT_CYCLES = 120',
  'RUNELITE_XP_DROP_STACK_MIN_PANEL_HEIGHT = 100',
  'renderer.setClearColor(scene.background instanceof Color ? scene.background : new Color(0x0e1216), 1)',
  'data-source-plugin="XpDropPlugin"',
  'data-source-overlay="XpDropOverlay"',
  'data-source-damage-mode="DamageMode.ABOVE_OPPONENT"',
  'data-source-client-script="xpdrops_stattransmit"',
  'data-source-font-archive={overlay.fontArchiveName}',
  'data-text-size={overlay.textSize}',
  'data-text-size-varbit4693={overlay.textSizeVarbit4693}',
  'data-xp-total={overlay.xpTotal}',
  'data-skill-icons={overlay.skillIcons.map((icon) => icon.skillId).join(",")}',
  'data-trainer-text-scale={overlay.textScale.toFixed(3)}',
  'data-trainer-move-distance={overlay.moveDistance}',
  'data-source-droplet-move="xpdrops_dropletmove interpolate(0, elapsed, 0, enum_1171(varbit4722), 16384)"',
  'data-source-panel-position="xpdrops_setposition right:2 top:2 when varbit4692=0"',
  'trainerFont/trainerTextSize/trainerMoveDistance scale source font and droplet movement',
  'xpDropOrbContextEntries',
  'runelite-config-value-set',
  'applyXpDropTextSize',
  'keyName: "nativeTextSize"',
  'XpCounter child 51 Config.XP_DROPS_SIZE varbit4693',
  'buildRuntimeDomOverlays(',
  'spriteAtlasesRef.current,\n        1',
  'data-source-placement="opponent.getCanvasTextLocation(graphics, damageStr, opponent.getLogicalHeight() + 50)"',
  'event.attackerId === "local-player"',
  'config.showDamageDrops !== "ABOVE_OPPONENT"',
  'tickShow: Math.max(0, latestDamageEvent.tick + 3 - combatState.tick)'
]) {
  assert(runtimeSource.includes(trainerAnchor), `RuntimeSceneViewer missing XP Drop runtime anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "resolveKronosXpDropOrb",
  "entry.widget.childId === 1 && entry.widget.spriteId === 1196",
  "activeSpriteId: 1197",
  "hoverSpriteId: 1198",
  "activeHoverSpriteId: 1199",
  "xpDropOrb: resolveKronosXpDropOrb"
]) {
  assert(fixedLayoutSource.includes(trainerAnchor), `kronosFixedLayout missing XP orb layout anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "KronosXpDropOrb",
  "sourceLayout.xpDropOrb",
  "data-source-client-script=\"orbs_xpdrops_op\"",
  "data-source-update-script=\"orbs_xpdrops_update varbit4702 sprite orb_xp,0/1/2/3\"",
  "data-source-varbit=\"4702\"",
  "onXpDropOrbDefaultAction",
  "onXpDropOrbContextMenu"
]) {
  assert(hudSource.includes(trainerAnchor), `KronosClientHud missing XP orb anchor ${trainerAnchor}`);
}

for (const combatAnchor of [
  "export function runtimePlayerCombatQueuedHitDamage",
  "export function runtimePlayerCombatXpDropsForDamage",
  "runtimePlayerCombatHitpointXpRatio = 1.33",
  "spell.baseXp + dealt * 2",
  "const combatXp = dealt * 4",
  "hit.attackType === \"LONG_RANGED\"",
  "hit.attackType === \"CONTROLLED\"",
  "runtimePlayerCombatAttackTypeForWeapon",
  "readonly damage: number",
  "runtimePlayerCombatFinalizedHitDamage",
  "PlayerCombat.postDefend() applies PvP protection before Entity.hit() awards XP",
  "applyProtectionDamageReduction({",
  "const damage = runtimePlayerCombatQueuedHitDamage(actors, hit, tick);"
]) {
  assert(combatSource.includes(combatAnchor), `runtimePlayerCombat missing queued-hit XP drop damage anchor ${combatAnchor}`);
}

for (const sourceAnchor of [
  "double xp = damageDealt * 4D;",
  "player.getStats().addXp(StatType.Ranged, xp, multiplier);",
  "player.getStats().addXp(StatType.Defence, xp, multiplier);",
  "player.getStats().addXp(StatType.Attack, xp, multiplier);",
  "player.getStats().addXp(StatType.Strength, xp, multiplier);",
  "player.getStats().addXp(StatType.Hitpoints, damageDealt * 1.33 * monsterMod, multiplier);",
  "double xp = baseXp + (damage * 2D);",
  "player.getStats().addXp(StatType.Hitpoints, damage * 1.33, multiplier);"
]) {
  assert(combatUtilsSource.includes(sourceAnchor), `Kronos CombatUtils source missing ${sourceAnchor}`);
}

assert(iceBarrageSource.includes("setBaseXp(52.0);"), "Kronos IceBarrage source missing base XP 52.0.");
assert(bloodBarrageSource.includes("setBaseXp(51.0);"), "Kronos BloodBarrage source missing base XP 51.0.");

for (const sourceAnchor of [
  "def_int $int41 = 16;",
  "p11_full",
  "p12_full",
  "b12_full",
  "%varbit4693",
  "enum(int, int, enum_1171, %varbit4722)",
  "~xpdrops_setdropsize($component47, $int41, $fontmetrics39, $fontmetrics40, $string0)",
  'if_setontimer("xpdrops_dropletmove($component47, $int44)", $component47)'
]) {
  assert(
    statTransmitSource.includes(sourceAnchor) || setDropSizeSource.includes(sourceAnchor) || readKronosServerScript("[proc,xpdrops_redraw].cs2").includes(sourceAnchor),
    `Kronos XP drop source missing ${sourceAnchor}`
  );
}

for (const sourceAnchor of [
  "$int4 = enum(int, int, enum_1171, %varbit4722);",
  "$int2 = interpolate(0, $int1, 0, $int4, 16384);",
  "cc_setposition(cc_getx, $int2, ^setpos_abs_left, ^setpos_5);",
  "cc_sethide(true);"
]) {
  assert(dropletMoveSource.includes(sourceAnchor), `Kronos xpdrops_dropletmove source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "if_setposition(2, 2, ^setpos_abs_right, ^setpos_abs_top, $component0);",
  "if_setposition(0, 0, ^setpos_abs_right, ^setpos_abs_centre, $component0);",
  "if_setsize($int8, 0, ^setsize_abs, ^setsize_minus, $component0);"
]) {
  assert(
    setPositionSource.includes(sourceAnchor) || setDropSizeSource.includes(sourceAnchor),
    `Kronos XP drop position/size source missing ${sourceAnchor}`
  );
}

for (const sourceAnchor of [
  'def_graphic $graphic1 = "orb_xp,0";',
  'def_graphic $graphic2 = "orb_xp,2";',
  'if (%varbit4702 = 1)',
  'if_setop(1, $string0, $component0);',
  'if_setonmouserepeat("graphic_swapper(event_com, $graphic2)", $component0);'
]) {
  assert(orbUpdateSource.includes(sourceAnchor), `Kronos XP orb update source missing ${sourceAnchor}`);
}

for (const sourceAnchor of ["sound_synth(synth_2266, 1, 0);", "%varbit4702 = $int2;", "~orbs_xpdrops_update($component1);"]) {
  assert(orbOpSource.includes(sourceAnchor), `Kronos XP orb op source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "Config.XP_COUNTER_SHOWN.toggle(player)",
  "player.openInterface(InterfaceType.MAIN, 137)",
  "h.actions[50] = (SlotAction) (player, slot) -> Config.XP_COUNTER_POSITION.set(player, slot - 1);",
  "h.actions[51] = (SlotAction) (player, slot) -> Config.XP_COUNTER_SIZE.set(player, slot - 1);",
  "h.actions[57] = (SlotAction) (player, slot) -> Config.XP_COUNTER_SPEED.set(player, slot - 1);",
  "h.actions[52] = (SlotAction) (player, slot) -> Config.XP_COUNTER_DURATION.set(player, slot - 1);",
  "h.actions[53] = (SlotAction) (player, slot) -> Config.XP_COUNTER_COUNTER.set(player, slot - 1);",
  "h.actions[54] = (SlotAction) (player, slot) -> Config.XP_COUNTER_PROGRESS_BAR.set(player, slot - 1);",
  "h.actions[55] = (SlotAction) (player, slot) -> Config.XP_COUNTER_COLOUR.set(player, slot - 1);",
  "h.actions[56] = (SlotAction) (player, slot) -> Config.XP_COUNTER_GROUP.set(player, slot - 1);"
]) {
  assert(xpCounterSource.includes(sourceAnchor), `Kronos XpCounter source missing ${sourceAnchor}`);
}

assert(cssSource.includes(".runeliteXpDropDamageOverlay"), "CSS missing XP Drop damage overlay class.");
assert(cssSource.includes(".runeliteXpDropOverlay"), "CSS missing source-backed XP Drop overlay class.");
assert(cssSource.includes(".runeliteXpDropGlyphText"), "CSS missing source font XP Drop glyph text class.");
assert(cssSource.includes(".runeliteConfigNumberInput"), "CSS missing XP Drop numeric config input class.");
assert(cssSource.includes(".kronosXpDropOrb"), "CSS missing XP Drop orb class.");

console.log("RuneLite XP Drop verifier passed: source scripts, combat XP math, trainer numeric controls, and overlays are anchored.");
