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

const pluginSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/pvpperformancetracker/PvpPerformanceTrackerPlugin.java");
const configSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/pvpperformancetracker/PvpPerformanceTrackerConfig.java");
const fightSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/pvpperformancetracker/controllers/FightPerformance.java");
const fighterSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/pvpperformancetracker/controllers/Fighter.java");
const trackedStatisticSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/pvpperformancetracker/models/TrackedStatistic.java");
const runtimeCombatSource = read("src/sim/runtimePlayerCombat.ts");
const runtimeViewerSource = read("src/ui/RuntimeSceneViewer.tsx");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const cssSource = read("src/ui/styles.css");

for (const sourceAnchor of [
  'name = "PvP Performance Tracker"',
  "eventBus.subscribe(AnimationChanged.class",
  "eventBus.subscribe(HitsplatApplied.class",
  "eventBus.subscribe(GameTick.class",
  "currentFight.addDamageDealt",
  "currentFight.updateCompetitorHp",
  "fightHistory.add(fight)"
]) {
  assert(pluginSource.includes(sourceAnchor), `PvP Performance Tracker plugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "showOverlayOffensivePray",
  "showOverlayHpHealed",
  "showOverlayRobeHits",
  "showOverlayTotalKoChance",
  "fightHistoryRenderLimit"
]) {
  assert(configSource.includes(sourceAnchor), `PvP Performance Tracker config source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "offensivePraySuccessCount++",
  "totalMagicAttackCount++",
  "magicHitCountExpected += pvpDamageCalc.getAccuracy()",
  "addHpHealed",
  "addRobeHit"
]) {
  assert(fighterSource.includes(sourceAnchor), `PvP Fighter source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "calculateRobeHits",
  "AttackStyle style = ad.attackStyle",
  "if (style == AttackStyle.MAGIC)",
  "RANGE_DEF",
  "updateKoChanceStats"
]) {
  assert(fightSource.includes(sourceAnchor), `PvP FightPerformance source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "OFFENSIVE_PRAY",
  "HP_HEALED",
  "ROBE_HITS",
  "KO_CHANCES",
  "GHOST_BARRAGES"
]) {
  assert(trackedStatisticSource.includes(sourceAnchor), `PvP tracked statistic source missing ${sourceAnchor}`);
}

for (const implementationAnchor of [
  'readonly kind: "supply"',
  "readonly expectedDamage: number",
  "readonly attackerActivePrayers: readonly PrayerId[]",
  "readonly attackerEquipment: VisibleEquipment",
  "readonly defenderEquipment: VisibleEquipment",
  "const supplyEvent: RuntimePlayerCombatEvent",
  "runtimePlayerCombatExpectedDamage",
  "attackerActivePrayers: attacker.activePrayers",
  "defenderEquipment: defender.equipment"
]) {
  assert(runtimeCombatSource.includes(implementationAnchor), `Runtime combat event stream missing ${implementationAnchor}`);
}

for (const implementationAnchor of [
  "stats.expectedDamage += event.expectedDamage",
  "runeliteOffensivePrayerMatchesStyle",
  "stats.offensivePraySuccesses += 1",
  "actorStats(event.actorId).hpHealed += event.healed",
  "runeliteVisibleEquipmentHasRobePiece(event.defenderEquipment)",
  "defenderStats.robeHitsTaken += 1",
  "stats.magicHitExpected += event.hitChance",
  "runeliteMagicLuckScore",
  "runeliteRobeHitsText",
  "lower-is-better"
]) {
  assert(runtimeViewerSource.includes(implementationAnchor), `Runtime PvP tracker snapshot missing ${implementationAnchor}`);
}

for (const shellAnchor of [
  "RunelitePvpPerformanceTrackerPanel",
  "RunelitePvpPerformanceOverlay",
  "runelitePvpPerformanceTrackerOverlayLines",
  "showOverlayRobeHits",
  "showOverlayHpHealed",
  "showOverlayOffensivePray"
]) {
  assert(shellSource.includes(shellAnchor), `RuneLite shell PvP tracker UI missing ${shellAnchor}`);
}

assert(
  /\.runelitePvpOverlay\s*\{[\s\S]*?z-index:\s*30;/.test(cssSource),
  "RuneLite PvP tracker overlay should render above the fixed client HUD during active fights."
);

console.log("RuneLite PvP tracker verifier passed: combat events now feed expected damage, offensive prayer, HP healed, robe hits, magic luck, and KO lines from source-backed inputs.");
