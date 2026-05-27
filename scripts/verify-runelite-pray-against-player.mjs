import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function readNhClient(relativePath) {
  return readFileSync(
    path.resolve(
      projectRoot,
      "..",
      "Nh184-Client",
      "runelite-client",
      "src",
      "main",
      "java",
      "net",
      "runelite",
      "client",
      "plugins",
      "prayagainstplayer",
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

function loadTsModule(relativePath) {
  return loadAbsoluteModule(path.resolve(projectRoot, relativePath));
}

function loadAbsoluteModule(sourcePath) {
  const resolved = resolveModulePath(sourcePath);
  const cached = moduleCache.get(resolved);
  if (cached) {
    return cached.exports;
  }

  const source = readFileSync(resolved, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true
    },
    fileName: resolved
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(resolved, module);
  vm.runInNewContext(
    transpiled,
    {
      module,
      exports: module.exports,
      require: (request) => {
        if (request.startsWith(".")) {
          return loadAbsoluteModule(path.resolve(path.dirname(resolved), request));
        }
        return require(request);
      },
      console
    },
    { filename: resolved }
  );
  return module.exports;
}

function resolveModulePath(candidatePath) {
  const candidates = [
    candidatePath,
    `${candidatePath}.ts`,
    `${candidatePath}.tsx`,
    `${candidatePath}.js`,
    `${candidatePath}.json`,
    path.join(candidatePath, "index.ts")
  ];
  for (const candidate of candidates) {
    try {
      if (require("node:fs").statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(`Cannot resolve module ${candidatePath}`);
}

const pluginSource = readNhClient("PrayAgainstPlayerPlugin.java");
const configSource = readNhClient("PrayAgainstPlayerConfig.java");
const overlaySource = readNhClient("PrayAgainstPlayerOverlay.java");
const prayerTabOverlaySource = readNhClient("PrayAgainstPlayerOverlayPrayerTab.java");
const weaponTypeSource = readNhClient("WeaponType.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const cssSource = read("src/ui/styles.css");
const moduleSource = read("src/ui/runelitePrayAgainstPlayer.ts");
const prayAgainstPlayer = loadTsModule("src/ui/runelitePrayAgainstPlayer.ts");

for (const sourceAnchor of [
  'name = "Pray Against Player"',
  'type = PluginType.PVP',
  'enabledByDefault = false',
  'eventBus.subscribe(AnimationChanged.class',
  'eventBus.subscribe(InteractingChanged.class',
  'overlayManager.add(overlay)',
  'overlayManager.add(overlayPrayerTab)',
  'SpriteID.PRAYER_PROTECT_FROM_MISSILES',
  'SpriteID.PRAYER_PROTECT_FROM_MELEE',
  'SpriteID.PRAYER_PROTECT_FROM_MAGIC'
]) {
  assert(pluginSource.includes(sourceAnchor), `RuneLite Pray Against Player plugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("prayagainstplayer")',
  'keyName = "attackerPlayerColor"',
  'keyName = "potentialPlayerColor"',
  'keyName = "drawTargetPrayAgainst"',
  'keyName = "drawPotentialTargetPrayAgainst"',
  'keyName = "drawTargetPrayAgainstPrayerTab"',
  'keyName = "drawUnknownWeapons"'
]) {
  assert(configSource.includes(sourceAnchor), `RuneLite Pray Against Player config source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'setLayer(OverlayLayer.ABOVE_SCENE)',
  'setPosition(OverlayPosition.DYNAMIC)',
  'setPriority(OverlayPriority.HIGH)',
  'player.getLogicalHeight() / 2) + 75',
  'player.getCanvasImageLocation(icon, offset)',
  'OverlayUtil.renderImageLocation'
]) {
  assert(overlaySource.includes(sourceAnchor), `RuneLite Pray Against Player scene overlay source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'setPosition(OverlayPosition.DETACHED)',
  'setLayer(OverlayLayer.ALWAYS_ON_TOP)',
  'WidgetInfo.PRAYER_PROTECT_FROM_MAGIC',
  'WidgetInfo.PRAYER_PROTECT_FROM_MISSILES',
  'WidgetInfo.PRAYER_PROTECT_FROM_MELEE'
]) {
  assert(prayerTabOverlaySource.includes(sourceAnchor), `RuneLite Pray Against Player prayer-tab overlay source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'weaponNameGivenLowerCase.contains(meleeWeaponName)',
  'weaponNameGivenLowerCase.contains(rangedWeaponName)',
  'weaponNameGivenLowerCase.contains(magicWeaponName)',
  '"whip"',
  '"tentacle"',
  '"bow"',
  '"wand"',
  '"staff"'
]) {
  assert(weaponTypeSource.includes(sourceAnchor), `RuneLite Pray Against Player weapon type source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  'RUNELITE_PRAY_AGAINST_PLAYER_PLUGIN_ID',
  'name: "Pray Against Player"',
  'group: RUNELITE_PRAY_AGAINST_PLAYER_CONFIG_GROUP',
  'RunelitePrayAgainstPlayerConfigSnapshot',
  'drawTargetPrayAgainstPrayerTab',
  'sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/prayagainstplayer/PrayAgainstPlayerPlugin.java"'
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell missing Pray Against Player anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'applyRunelitePrayAgainstPlayerConfig',
  'buildRunelitePrayAgainstPlayerDomOverlays',
  'runelitePrayAgainstPlayerOverlaySnapshotsFromCombatState',
  'data-source-plugin="PrayAgainstPlayerPlugin"',
  'data-source-overlay="PrayAgainstPlayerOverlay"',
  'data-source-placement="player.getCanvasImageLocation(icon, player.getLogicalHeight() / 2 + 75)"',
  'runeliteEntityHiderActorId2dVisible(overlay.actorId',
  'runelitePrayAgainstPlayerOverlayElementsRef',
  'applyRuneliteProjectedDomOverlayElementStyles',
  'translate3d(${nhActorOverlayCssPixel(overlay.left)}px, ${nhActorOverlayCssPixel(overlay.top)}px, 0) scale(${scale})'
]) {
  assert(runtimeSource.includes(trainerAnchor), `RuntimeSceneViewer missing Pray Against Player runtime anchor ${trainerAnchor}`);
}

assert(
  !runtimeSource.includes(
    '`${overlay.id}:${overlay.relation}:${overlay.weaponType}:${overlay.prayerId}:${overlay.spriteId}:${Math.round(overlay.left * 10)}:${Math.round(overlay.top * 10)}'
  ),
  "Pray Against Player overlay structure signature should not include camera-projected coordinates."
);

assert(cssSource.includes(".runelitePrayAgainstPlayerOverlay"), "CSS missing Pray Against Player overlay class.");
assert(moduleSource.includes("meleeWeaponNames") && moduleSource.includes("rangedWeaponNames") && moduleSource.includes("magicWeaponNames"), "Pray Against Player module should preserve source weapon name tables.");

const ranged = prayAgainstPlayer.runelitePrayAgainstPlayerWeaponTypeFromEquipment({
  weapon: { itemId: 11785, name: "Armadyl crossbow" }
});
assert(ranged.weaponType === "WEAPON_RANGED", `Armadyl crossbow should be classified as ranged: ${JSON.stringify(ranged)}`);
const magic = prayAgainstPlayer.runelitePrayAgainstPlayerWeaponTypeFromEquipment({
  weapon: { itemId: 21006, name: "Kodai wand" }
});
assert(magic.weaponType === "WEAPON_MAGIC", `Kodai wand should be classified as magic: ${JSON.stringify(magic)}`);
const melee = prayAgainstPlayer.runelitePrayAgainstPlayerWeaponTypeFromEquipment({
  weapon: { itemId: 12006, name: "Abyssal tentacle" }
});
assert(melee.weaponType === "WEAPON_MELEE", `Abyssal tentacle should be classified as melee: ${JSON.stringify(melee)}`);

const config = {
  enabled: true,
  attackerPlayerColor: "#ff0006",
  potentialPlayerColor: "#ffff00",
  attackerTargetTimeoutSeconds: 10,
  potentialTargetTimeoutSeconds: 10,
  newSpawnTimeoutSeconds: 5,
  ignoreFriends: true,
  ignoreClanMates: true,
  markNewPlayer: false,
  drawTargetPrayAgainst: true,
  drawPotentialTargetPrayAgainst: true,
  drawTargetPrayAgainstPrayerTab: false,
  drawTargetsName: true,
  drawPotentialTargetsName: true,
  drawTargetHighlight: true,
  drawPotentialTargetHighlight: true,
  drawTargetTile: false,
  drawPotentialTargetTile: false,
  drawUnknownWeapons: false,
  logicalHeightClientUnits: 200
};
const combatState = {
  tick: 100,
  actors: {
    "local-player": { id: "local-player", equipment: {}, targetId: null, lastTargetId: null },
    opponent: {
      id: "opponent",
      equipment: { weapon: { itemId: 11785, name: "Armadyl crossbow" } },
      targetId: "local-player",
      lastTargetId: "local-player"
    }
  },
  events: [{ kind: "attack", tick: 99, attackerId: "opponent", defenderId: "local-player" }]
};
const overlays = prayAgainstPlayer.runelitePrayAgainstPlayerOverlaySnapshotsFromCombatState(combatState, config);
assert(overlays.length === 1, `Expected one Pray Against Player overlay: ${JSON.stringify(overlays)}`);
assert(overlays[0].relation === "attacker", `Recent attack should mark opponent as attacker: ${JSON.stringify(overlays[0])}`);
assert(overlays[0].prayerId === "protect_from_missiles", `Ranged weapon should recommend Protect from Missiles: ${JSON.stringify(overlays[0])}`);
assert(overlays[0].spriteId === 128, `Protect from Missiles should use SpriteID 128: ${JSON.stringify(overlays[0])}`);

console.log(
  JSON.stringify(
    {
      ok: true,
      pluginId: prayAgainstPlayer.RUNELITE_PRAY_AGAINST_PLAYER_PLUGIN_ID,
      configGroup: prayAgainstPlayer.RUNELITE_PRAY_AGAINST_PLAYER_CONFIG_GROUP,
      protectionIconSize: prayAgainstPlayer.RUNELITE_PRAY_AGAINST_PLAYER_PROTECTION_ICON_SIZE
    },
    null,
    2
  )
);
