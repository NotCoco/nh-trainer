import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readKronosClient(relativePath) {
  return fs.readFileSync(path.resolve(root, "..", "Kronos184-Client", relativePath), "utf8");
}

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

const pluginSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/customcursor/CustomCursorPlugin.java");
const configSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/customcursor/CustomCursorConfig.java");
const enumSource = readKronosClient("runelite-client/src/main/java/net/runelite/client/plugins/customcursor/CustomCursor.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const packageSource = read("package.json");

for (const sourceAnchor of [
  'name = "Custom Cursor"',
  'description = "Replaces your mouse cursor image"',
  "event.getGroup().equals(\"customcursor\") && event.getKey().equals(\"cursorStyle\")",
  "updateCursor()",
  "clientUI.setCursor(selectedCursor.getCursorImage(), selectedCursor.toString())",
  "clientUI.resetCursor()",
  "selectedCursor == CustomCursor.SKILL_SPECS"
]) {
  check(pluginSource.includes(sourceAnchor), `CustomCursorPlugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("customcursor")',
  'keyName = "cursorStyle"',
  'name = "Cursor"',
  'description = "Select which cursor you wish to use"',
  "return CustomCursor.RS3_GOLD"
]) {
  check(configSource.includes(sourceAnchor), `CustomCursorConfig source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "public enum CustomCursor",
  'RS3_GOLD("RS3 Gold", "cursor-rs3-gold.png")',
  'RS3_SILVER("RS3 Silver", "cursor-rs3-silver.png")',
  'DRAGON_DAGGER("Dragon Dagger", "cursor-dragon-dagger.png")',
  'DRAGON_DAGGER_POISON("Dragon Dagger (p)", "cursor-dragon-dagger-p.png")',
  'TROUT("Trout", "cursor-trout.png")',
  'DRAGON_SCIMITAR("Dragon Scimitar", "cursor-dragon-scimitar.png")',
  'ARMADYL_GODSWORD("Armadyl Godsword", "cursor-armadyl-godsword.png")',
  'BANDOS_GODSWORD("Bandos Godsword", "cursor-bandos-godsword.png")',
  'MOUSE("Mouse", "cursor-mouse.png")',
  'SARADOMIN_GODSWORD("Saradomin Godsword", "cursor-saradomin-godsword.png")',
  'ZAMORAK_GODSWORD("Zamorak Godsword", "cursor-zamorak-godsword.png")',
  'SKILL_SPECS("Skill Specs", "cursor-skill-specs.png")',
  "ImageUtil.getResourceStreamFromClass(CustomCursorPlugin.class, icon)"
]) {
  check(enumSource.includes(sourceAnchor), `CustomCursor enum source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  "RuneliteCustomCursorConfigSnapshot",
  'id: "custom-cursor"',
  'name: "Custom Cursor"',
  'description: "Replaces your mouse cursor image"',
  'sourcePath: "Kronos184-Client/runelite-client/src/main/java/net/runelite/client/plugins/customcursor/CustomCursorPlugin.java"',
  'group: "customcursor"',
  'sourcePath: "Kronos184-Client/runelite-client/src/main/java/net/runelite/client/plugins/customcursor/CustomCursorConfig.java"',
  'keyName: "cursorStyle"',
  'options: RUNELITE_CUSTOM_CURSOR_ASSETS.map((cursor) => cursor.id)',
  'const customCursorValues = configValuesByPluginId["custom-cursor"] ?? {}',
  'const customCursorEnabled = enabledPluginIds.has("custom-cursor")',
  "customCursor: {",
  "cursorStyle: customCursorStyle",
  "runeliteClientPanelCursorCss",
  "config.customCursor.enabled",
  "runeliteCustomCursorCssFromStyle(config.customCursor.cursorStyle)",
  'data-source-custom-cursor="CustomCursorPlugin startUp/updateCursor and ConfigChanged customcursor.cursorStyle call clientUI.setCursor(selectedCursor.getCursorImage(), selectedCursor.toString()); shutDown calls clientUI.resetCursor()"',
  'data-custom-cursor-active={String(configSnapshot.customCursor.enabled)}',
  'data-custom-cursor-style={configSnapshot.customCursor.cursorStyle}',
  'url("runelite-ui/customcursor/${asset.fileName}") 0 0, auto'
]) {
  check(shellSource.includes(trainerAnchor), `RuneliteClientShell missing Custom Cursor anchor ${trainerAnchor}`);
}

for (const cursorAsset of [
  "cursor-armadyl-godsword.png",
  "cursor-bandos-godsword.png",
  "cursor-dragon-dagger-p.png",
  "cursor-dragon-dagger.png",
  "cursor-dragon-scimitar.png",
  "cursor-mouse.png",
  "cursor-rs3-gold.png",
  "cursor-rs3-silver.png",
  "cursor-saradomin-godsword.png",
  "cursor-skill-specs.png",
  "cursor-trout.png",
  "cursor-zamorak-godsword.png"
]) {
  check(
    fs.existsSync(path.join(root, "fixtures", "runelite-ui", "customcursor", cursorAsset)),
    `Missing copied RuneLite custom cursor asset ${cursorAsset}.`
  );
}

check(
  packageSource.includes('"verify:runelite-customcursor": "node scripts/verify-runelite-customcursor.mjs"'),
  "package.json should expose verify:runelite-customcursor."
);
check(
  packageSource.includes("npm run verify:runelite-customcursor"),
  "verify:all should include verify:runelite-customcursor."
);

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      source: "CustomCursorPlugin updateCursor -> ClientUI.setCursor",
      trainer: "Custom Cursor config applies source PNG cursor to the RuneLite client panel"
    },
    null,
    2
  )
);
