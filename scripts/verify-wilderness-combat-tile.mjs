import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = path.resolve(
  projectRoot,
  "..",
  "kronos-osrs-184-master",
  "kronos-osrs-184-master",
  "Kronos-master",
  "kronos-server",
  "src",
  "main",
  "java",
  "io",
  "ruin"
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadSource(...segments) {
  return readFileSync(path.join(...segments), "utf8");
}

function loadTranspiledTsModule(sourcePath) {
  const source = readFileSync(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const module = { exports: {} };
  Function("exports", "module", output)(module.exports, module);
  return module.exports;
}

const botSource = loadSource(
  serverRoot,
  "model",
  "entity",
  "player",
  "ai",
  "scripts",
  "NhStakerBot.java"
);
const wildernessSource = loadSource(serverRoot, "model", "activities", "wilderness", "Wilderness.java");
const helperPath = path.join(projectRoot, "src", "render", "kronosWilderness.ts");
const helperSource = readFileSync(helperPath, "utf8");
const runtimeSceneViewerSource = loadSource(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx");

for (const snippet of [
  "private boolean isCombatTileAllowed(int x, int y, int z)",
  "player.pvpInstancePosition != null",
  "player.pvpAttackZone",
  "Wilderness.getLevel(x, y, z) > 0"
]) {
  assert(botSource.includes(snippet), `NhStakerBot combat-tile source anchor changed: ${snippet}`);
}

for (const snippet of [
  "private static final Bounds MAIN_WILDERNESS = new Bounds(2944, 3525, 3391, 4351, -1)",
  "private static final Bounds[] EDGEVILLE_SAFE_AREAS",
  "new Bounds(2998, 3525, 3026, 3536, -1)",
  "return Math.max(1, ((y - 3520) / 8) + 1)",
  "return ((y - 9920) / 8) - 1",
  "return ((y - 9920) / 8) + 1"
]) {
  assert(wildernessSource.includes(snippet), `Wilderness procedural-level source anchor changed: ${snippet}`);
}

for (const snippet of [
  "const mainWilderness: KronosBounds = { west: 2944, south: 3525, east: 3391, north: 4351, plane: anyPlane }",
  "const edgevilleSafeAreas: readonly KronosBounds[]",
  "return Math.max(1, Math.trunc((tile.y - 3520) / 8) + 1)",
  "export function kronosNhBotCombatTileAllowed",
  "options.pvpInstancePosition",
  "options.pvpAttackZone"
]) {
  assert(helperSource.includes(snippet), `TS wilderness helper is missing source-backed snippet: ${snippet}`);
}

assert(
  runtimeSceneViewerSource.includes("kronosNhBotCombatTileAllowed(policyMovementCollision.sceneToWorldTile(to))"),
  "Runtime policy canStep bridge must check the Java combat-tile gate before accepting movement"
);

const helper = loadTranspiledTsModule(helperPath);
const wildTile = { x: 3100, y: 3532, plane: 0 };
const preDitchTile = { x: 3100, y: 3518, plane: 0 };
const edgevilleSafeTile = { x: 3000, y: 3530, plane: 0 };
const wildernessEntryTile = { x: 3097, y: 3525, plane: 0 };
const gwdWildernessTile = { x: 3010, y: 10112, plane: 0 };

assert(helper.kronosWildernessLevelForWorldTile(wildTile) === 2, "main wilderness procedural level should match Java integer division");
assert(helper.kronosWildernessLevelForWorldTile(preDitchTile) === 0, "tiles south of main wilderness must remain non-combat");
assert(helper.kronosWildernessLevelForWorldTile(edgevilleSafeTile) === 0, "Edgeville safe areas must override main wilderness");
assert(helper.kronosWildernessLevelForWorldTile(wildernessEntryTile) === 1, "main wilderness entry tile should be level 1");
assert(helper.kronosWildernessLevelForWorldTile(gwdWildernessTile) === 23, "GWD wilderness procedural level should match Java");

assert(helper.kronosNhBotCombatTileAllowed(wildTile), "ordinary wilderness tile should be combat-allowed");
assert(!helper.kronosNhBotCombatTileAllowed(preDitchTile), "ordinary pre-ditch tile should be combat-blocked");
assert(!helper.kronosNhBotCombatTileAllowed(edgevilleSafeTile), "ordinary Edgeville safe area should be combat-blocked");
assert(helper.kronosNhBotCombatTileAllowed(preDitchTile, { pvpAttackZone: true }), "pvpAttackZone should allow any tile");
assert(
  !helper.kronosNhBotCombatTileAllowed(wildTile, { pvpInstancePosition: true, safePvpInstance: true }),
  "safe PvP instance tile should be combat-blocked"
);
assert(
  helper.kronosNhBotCombatTileAllowed(preDitchTile, { pvpInstancePosition: true, safePvpInstance: false }),
  "unsafe PvP instance tile should be combat-allowed"
);

console.log("verify-wilderness-combat-tile passed");
