import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sourceSpecBarPlugin = fs.readFileSync(
  "C:\\Nh\\Nh184-Client\\runelite-client\\src\\main\\java\\net\\runelite\\client\\plugins\\specbar\\SpecBarPlugin.java",
  "utf8"
);
const sourceSpecOrbDrawButton = fs.readFileSync(
  "C:\\Nh\\nh-osrs-184-master\\nh-osrs-184-master\\Nh-master\\scripts\\[proc,orbs_spec_draw_button].cs2",
  "utf8"
);
const shellSource = readText("src/ui/RuneliteClientShell.tsx");
const runtimeSource = readText("src/ui/RuntimeSceneViewer.tsx");
const hudSource = readText("src/ui/NhClientHud.tsx");
const runtimeCombatSource = readText("src/sim/runtimePlayerCombat.ts");

assert(sourceSpecBarPlugin.includes('name = "Spec Bar"'), "RuneLite source plugin descriptor should be the Spec Bar plugin.");
assert(sourceSpecBarPlugin.includes('description = "Adds a spec bar to every weapon"'), "RuneLite source plugin description should match.");
assert(sourceSpecBarPlugin.includes('enabledByDefault = false'), "RuneLite Spec Bar should stay disabled by default.");
assert(sourceSpecBarPlugin.includes('"drawSpecbarAnyway".equals(event.getEventName())'), "RuneLite Spec Bar source callback name changed.");
assert(
  sourceSpecBarPlugin.includes("iStack[iStackSize - 1] = 1;"),
  "RuneLite Spec Bar should set the script stack result to draw the specbar."
);
assert(
  sourceSpecOrbDrawButton.includes('if_sethide(true, $component5)') &&
    sourceSpecOrbDrawButton.includes('if_setgraphic("orb_filler,5", $component3)') &&
    sourceSpecOrbDrawButton.includes('if_setonop("orbs_toggle_spec_op'),
  "Nh orbs_spec_draw_button should keep the special orb graphics dimmed but disable the op when no special is available."
);

assert(shellSource.includes('id: "spec-bar"'), "RuneLite shell plugin list should include Spec Bar.");
assert(shellSource.includes('sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/specbar/SpecBarPlugin.java"'), "Spec Bar plugin item should carry the source path.");
assert(shellSource.includes('configurable: false'), "Spec Bar has no config descriptor and should not expose a fake config panel.");
assert(shellSource.includes("readonly specBar: RuneliteSpecBarConfigSnapshot"), "Config snapshot should include Spec Bar state.");
assert(shellSource.includes("drawSpecbarAnyway: enabledPluginIds.has(\"spec-bar\")"), "Spec Bar snapshot should be driven by plugin enabled state.");

assert(runtimeSource.includes("applyRuneliteSpecBarConfig"), "Runtime should write Spec Bar plugin state to the client canvas.");
assert(runtimeSource.includes("SpecBarPlugin.onScriptCallbackEvent"), "Runtime should preserve the RuneLite Spec Bar source callback anchor.");
assert(runtimeSource.includes("drawSpecbarAnyway"), "Runtime should preserve the RuneLite Spec Bar callback name.");
assert(
  runtimeSource.includes("client.getIntStack()[client.getIntStackSize() - 1] = 1"),
  "Runtime should expose the RuneLite Spec Bar stack mutation."
);
assert(runtimeSource.includes("drawSpecbarAnyway={runeliteClientConfig.specBar.drawSpecbarAnyway}"), "HUD should receive the RuneLite Spec Bar plugin state.");

assert(hudSource.includes("drawSpecbarAnyway?: boolean"), "HUD props should accept drawSpecbarAnyway.");
assert(
  hudSource.includes("combatInterfacePanel.specialBar && weaponHasCombatTabSpecialBar") &&
    hudSource.includes("combatTabVisibleSpecBarWithoutServerSpecialItemIds = new Set([21902])") &&
    hudSource.includes("const specialAvailable = specialActionAvailable"),
  "HUD should let Dragon crossbow keep the combat-tab special bar for one-tick spec packets without adding a server special."
);
assert(
  hudSource.includes("specialOrbUnavailableFillerSpriteId = 1064") &&
    hudSource.includes("fillerSpriteIdOverride={localWeaponHasSpecialAttack ? undefined : specialOrbUnavailableFillerSpriteId}") &&
    hudSource.includes("actionEnabled={localWeaponHasSpecialAttack}") &&
    hudSource.includes("active={localWeaponHasSpecialAttack && hud.specialActive === true}"),
  "HUD should keep the minimap spec orb visible but dimmed/inert for no-special weapons per orbs_spec_draw_button."
);
assert(!hudSource.includes('data-draw-specbar-anyway="true"'), "HUD should not hardcode drawSpecbarAnyway as always true.");
assert(
  hudSource.includes("drawSpecbarAnyway={false}"),
  "HUD should not let the RuneLite Spec Bar plugin force bars onto no-special weapons in the trainer client view."
);

assert(runtimeCombatSource.includes("runtimeBotDefaultAutocastSpell"), "Runtime combat should retain the bot-only default autocast hook.");
assert(runtimeCombatSource.includes('actorId === "local-player"'), "Local/player Kodai should stay excluded from bot default autocast.");
assert(runtimeCombatSource.includes('actor.loadoutId !== "kodai-robes"'), "Bot default autocast should only apply to Kodai robes.");
assert(runtimeCombatSource.includes('runtimePlayerCombatSpellDefinitions["ice-barrage"]'), "Bot default Kodai autocast should use Ice Barrage.");

console.log("RuneLite Spec Bar verifier passed: source callback, HUD gating, and bot-only Kodai autocast split are wired.");
