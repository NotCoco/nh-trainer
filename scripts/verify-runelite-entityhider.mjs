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

const pluginSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/entityhider/EntityHiderPlugin.java");
const configSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/entityhider/EntityHiderConfig.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const entityHiderSource = read("src/ui/runeliteEntityHider.ts");
const packageSource = read("package.json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const sourceAnchor of [
  'name = "Entity Hider"',
  'description = "Hide players, NPCs, and/or projectiles"',
  'tags = {"npcs", "players", "projectiles"}',
  'client.setIsHidingEntities(isPlayerRegionAllowed())',
  'client.setPlayersHidden(config.hidePlayers())',
  'client.setPlayersHidden2D(config.hidePlayers2D())',
  'client.setHideSpecificPlayers(Text.fromCSV(config.hideSpecificPlayers()))',
  'client.setLocalPlayerHidden(config.hideLocalPlayer())',
  'client.setLocalPlayerHidden2D(config.hideLocalPlayer2D())',
  'client.setProjectilesHidden(config.hideProjectiles())',
  'playerRegionID != 9520'
]) {
  assert(pluginSource.includes(sourceAnchor), `Nh RuneLite EntityHiderPlugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("entityhider")',
  'keyName = "playersTitle"',
  'default boolean hidePlayers()',
  'default boolean hidePlayers2D()',
  'default String hideSpecificPlayers()',
  'default boolean hideLocalPlayer()',
  'default boolean hideLocalPlayer2D()',
  'default boolean hideProjectiles()'
]) {
  assert(configSource.includes(sourceAnchor), `Nh RuneLite EntityHiderConfig source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  'id: "entity-hider"',
  'name: "Entity Hider"',
  'sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/entityhider/EntityHiderPlugin.java"',
  'sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/entityhider/EntityHiderConfig.java"',
  'group: "entityhider"',
  'RuneliteEntityHiderConfigSnapshot',
  'entityHider: {',
  'hideSpecificPlayers',
  'hideProjectiles'
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell missing Entity Hider anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'RUNELITE_ENTITY_HIDER_CONFIG_GROUP = "entityhider"',
  'RUNELITE_ENTITY_HIDER_CASTLE_WARS_REGION_ID = 9520',
  'RUNELITE_ENTITY_HIDER_SOURCE_UPDATE_CONFIG',
  'RUNELITE_ENTITY_HIDER_SOURCE_CSV',
  'runeliteEntityHiderActorVisible',
  'runeliteEntityHiderActor2dVisible',
  'runeliteEntityHiderRuntimeEventVisible',
  'event.kind === "projectile" && config.hideProjectiles',
  'event.kind === "overlay-sprite"',
  'Text.fromCSV(config.hideSpecificPlayers())'
]) {
  assert(entityHiderSource.includes(trainerAnchor), `runeliteEntityHider module missing source-backed anchor ${trainerAnchor}`);
}

for (const runtimeAnchor of [
  'applyRuneliteEntityHiderConfig',
  'runeliteEntityHiderActorVisible(pose, entityHiderConfig)',
  'runeliteEntityHiderFilterRuntimeEvents(baseVisibleActiveEvents, visibleSnapshot, runeliteClientConfig.entityHider)',
  'runeliteEntityHiderActorId2dVisible(overlay.actorId',
  'nextPrayerBarOverlayRaw.actorId',
  'nextXpDropDamageOverlayRaw.actorId',
  'sourceEntityHiderUpdateConfig',
  'sourceEntityHiderRegionException'
]) {
  assert(runtimeSource.includes(runtimeAnchor), `RuntimeSceneViewer missing Entity Hider runtime anchor ${runtimeAnchor}`);
}

assert(packageSource.includes("verify:runelite-entityhider"), "package.json missing Entity Hider verifier script");

console.log("RuneLite Entity Hider verifier passed: shell config and visual-only actor/event hiding are source-backed.");
