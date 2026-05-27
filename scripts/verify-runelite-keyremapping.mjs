import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function loadTsModule(relativePath) {
  const sourcePath = path.join(root, relativePath);
  const source = fs.readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true
    },
    fileName: sourcePath
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(transpiled, { module, exports: module.exports, require, console }, { filename: sourcePath });
  return module.exports;
}

const shellSource = readText("src/ui/RuneliteClientShell.tsx");
const runtimeSource = readText("src/ui/RuntimeSceneViewer.tsx");
const clientHudSource = readText("src/ui/NhClientHud.tsx");
const keyRemappingSource = readText("src/ui/runeliteKeyRemapping.ts");
const gameKeybindsSource = readText("src/ui/nhGameKeybinds.ts");
const clientWidgetDefinitions = JSON.parse(readText("fixtures/assets/defs/client-widgets.json"));
const generatedFkeyIconPath = path.join(root, "fixtures", "render", "sprites", "nh_fkey_icon.png");
const packageSource = readText("package.json");
const sourceConfig = fs.readFileSync(
  path.join(
    root,
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
    "keyremapping",
    "KeyRemappingConfig.java"
  ),
  "utf8"
);
const sourceListener = fs.readFileSync(
  path.join(
    root,
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
    "keyremapping",
    "KeyRemappingListener.java"
  ),
  "utf8"
);
const sourceHotkeyButton = fs.readFileSync(
  path.join(
    root,
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
    "config",
    "HotkeyButton.java"
  ),
  "utf8"
);
const sourceConfigPanel = fs.readFileSync(
  path.join(
    root,
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
    "config",
    "ConfigPanel.java"
  ),
  "utf8"
);

const keyRemapping = loadTsModule("src/ui/runeliteKeyRemapping.ts");
const gameKeybinds = loadTsModule("src/ui/nhGameKeybinds.ts");
const serverConfigSource = fs.readFileSync(
  path.join(
    root,
    "..",
    "nh-osrs-184-master",
    "nh-osrs-184-master",
    "Nh-master",
    "nh-server",
    "src",
    "main",
    "java",
    "io",
    "ruin",
    "model",
    "inter",
    "utils",
    "Config.java"
  ),
  "utf8"
);
const tabOptionsSource = fs.readFileSync(
  path.join(
    root,
    "..",
    "nh-osrs-184-master",
    "nh-osrs-184-master",
    "Nh-master",
    "nh-server",
    "src",
    "main",
    "java",
    "io",
    "ruin",
    "model",
    "inter",
    "handlers",
    "TabOptions.java"
  ),
  "utf8"
);
const keybindGetSlotSource = fs.readFileSync(
  path.join(root, "..", "nh-osrs-184-master", "nh-osrs-184-master", "Nh-master", "scripts", "[proc,keybind_get_slot].cs2"),
  "utf8"
);
const keybindScript984Source = fs.readFileSync(
  path.join(root, "..", "nh-osrs-184-master", "nh-osrs-184-master", "Nh-master", "scripts", "script984.cs2"),
  "utf8"
);
const keybindOpenMenuSource = fs.readFileSync(
  path.join(root, "..", "nh-osrs-184-master", "nh-osrs-184-master", "Nh-master", "scripts", "[clientscript,keybind_open_menu].cs2"),
  "utf8"
);
const keybindBuildDropdownSource = fs.readFileSync(
  path.join(root, "..", "nh-osrs-184-master", "nh-osrs-184-master", "Nh-master", "scripts", "[proc,keybind_build_dropdown].cs2"),
  "utf8"
);
const trainerAssetExportSource = fs.readFileSync(
  path.join(
    root,
    "..",
    "nh-osrs-184-master",
    "nh-osrs-184-master",
    "Nh-master",
    "runelite",
    "cache",
    "src",
    "main",
    "java",
    "net",
    "runelite",
    "cache",
    "tools",
    "NhNhTrainerAssetExport.java"
  ),
  "utf8"
);

check(sourceConfig.includes("@ConfigGroup(\"keyremapping\")"), "RuneLite source config group should remain keyremapping.");
for (const literal of [
  "new ModifierlessKeybind(KeyEvent.VK_W, 0)",
  "new ModifierlessKeybind(KeyEvent.VK_S, 0)",
  "new ModifierlessKeybind(KeyEvent.VK_A, 0)",
  "new ModifierlessKeybind(KeyEvent.VK_D, 0)",
  "new ModifierlessKeybind(KeyEvent.VK_1, 0)",
  "new ModifierlessKeybind(KeyEvent.VK_0, 0)",
  "new ModifierlessKeybind(KeyEvent.VK_MINUS, 0)",
  "new ModifierlessKeybind(KeyEvent.VK_EQUALS, 0)",
  "new ModifierlessKeybind(KeyEvent.VK_ESCAPE, 0)"
]) {
  check(sourceConfig.includes(literal), `RuneLite source config is missing ${literal}.`);
}

for (const literal of [
  "plugin.isCameraRemap()",
  "modified.put(e.getKeyCode(), KeyEvent.VK_UP)",
  "modified.put(e.getKeyCode(), KeyEvent.VK_F1)",
  "plugin.isFkeyRemap() && !plugin.isDialogOpen()",
  "Integer m = modified.get(e.getKeyCode())"
]) {
  check(sourceListener.includes(literal), `RuneLite source listener is missing ${literal}.`);
}

const defaults = keyRemapping.RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT;
check(defaults.enabled === false, "Key Remapping should be disabled by default.");
check(defaults.cameraRemap === true, "RuneLite camera remap default should be true.");
check(defaults.fkeyRemap === false, "RuneLite F-key remap default should be false.");
check(defaults.up.key === "W" && defaults.up.code === "KeyW", "Camera up default should be W/KeyW.");
check(defaults.f10.key === "0" && defaults.f10.code === "Digit0", "F10 default should be 0/Digit0.");
check(defaults.f11.key === "Minus" && defaults.f11.code === "Minus", "F11 default should be Minus.");
check(defaults.f12.key === "Equals" && defaults.f12.code === "Equal", "F12 default should be Equals.");
check(defaults.esc.key === "Escape", "ESC default should be Escape.");
check(!("f1Tab" in defaults), "RuneLite Key Remapping config should not own in-game F-key tab mappings.");
check(!keyRemappingSource.includes("runeliteKeyRemappingSideTabForFunctionKey"), "RuneLite key remapping should only emit F keys, not select side tabs.");

for (const sourceAnchor of [
  "public static final Config[] KEYBINDS",
  "varpbit(4675, true).defaultValue(1)",
  "varpbit(4678, true).defaultValue(13)",
  "varpbit(4689, true).defaultValue(0)",
  "public static final Config ESCAPE_CLOSES = varpbit(4681, true)"
]) {
  check(serverConfigSource.includes(sourceAnchor), `Nh server keybind config missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "h.actions[83] = (SimpleAction) Keybinding::open",
  "Interface.KEYBINDING",
  "h.actions[111] = (SlotAction) (p, slot) ->",
  "Config.ESCAPE_CLOSES::toggle",
  "Use Pre-EoC"
]) {
  check(tabOptionsSource.includes(sourceAnchor), `Nh TabOptions keybinding source missing ${sourceAnchor}`);
}

const optionsGroup = clientWidgetDefinitions.groups.find((group) => group.groupId === 261);
const optionsKeybindingAction = optionsGroup?.widgets.find((widget) => widget.childId === 83);
const optionsKeybindingIcon = optionsGroup?.widgets.find((widget) => widget.childId === 88);
check(optionsKeybindingAction?.actions?.includes("Keybinding"), "Nh OPTIONS child 83 should expose the Keybinding action.");
check(optionsKeybindingAction?.spriteId === 761, "Nh OPTIONS child 83 should use the source toggle frame sprite.");
check(optionsKeybindingIcon?.spriteId === 1655, "Nh OPTIONS child 88 should carry the keybinding icon sprite.");
check(
  trainerAssetExportSource.includes('SpriteRef.id("options_keybinding", 1655)'),
  "Nh trainer asset export should include the source keybinding icon sprite."
);
check(fs.existsSync(generatedFkeyIconPath), "Generated F-key icon should exist in fixtures/render/sprites.");

for (const sourceAnchor of [
  "enum(int, int, enum_1160, %varbit4675)",
  "enum(int, int, enum_1160, %varbit4688)",
  "return($int1)"
]) {
  check(keybindGetSlotSource.includes(sourceAnchor), `Nh keybind_get_slot source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "interface_121:8",
  "interface_121:29",
  "interface_121:99"
]) {
  check(keybindScript984Source.includes(sourceAnchor), `Nh script984 keybinding text source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "if_setposition(calc(if_getx($component7) + 40), calc(if_gety($component7) + 22)",
  "if_setsize(100, calc($int5 + 5)",
  "cc_setposition(calc(5 + (($int4 % 2) * 40)), $int5"
]) {
  check(
    keybindOpenMenuSource.includes(sourceAnchor) || keybindBuildDropdownSource.includes(sourceAnchor),
    `Nh keybinding dropdown source missing ${sourceAnchor}`
  );
}

for (const literal of [
  "nhGameKeybindingColumnTabIds",
  "NhGameKeybindingTabIcon",
  "nhOptionsKeybindingActionChildId = 83",
  "nhOptionsKeybindingPlacementChildId = 100",
  "nhOptionsKeybindingGeneratedIcon",
  "nhOptionsKeybindingGeneratedIconPath = \"render/sprites/nh_fkey_icon.png\"",
  "data-source-interface=\"Interface.OPTIONS child 83 opens Interface.KEYBINDING 121\"",
  "data-source-layout=\"Interface.KEYBINDING 121 side-stone keybind grid\"",
  "nhGameKeybindingDisplayLabelForSlot",
  "Set OSRS Default"
]) {
  check(clientHudSource.includes(literal), `Nh HUD keybinding interface is missing ${literal}.`);
}
check(!clientHudSource.includes("Set ROAT Default"), "Nh HUD keybinding interface should not show ROAT defaults.");

check(
  !clientHudSource.includes("nhGameKeybindingEscape"),
  "Nh HUD keybinding interface should not show the old custom Escape checkbox panel."
);

const gameDefaults = gameKeybinds.NH_DEFAULT_GAME_KEYBINDS;
const ignoreListSpec = gameKeybinds.NH_GAME_KEYBIND_TAB_SPECS.find((spec) => spec.tabId === "ignores");
check(ignoreListSpec?.varbit === 4685, "Ignore List keybind should use Config.KEYBINDS varbit 4685.");
check(gameDefaults.keySlotsByTabId.combat === 1, "Game keybind default F1 should open combat.");
check(gameDefaults.keySlotsByTabId.inventory === 13, "Game keybind default Escape should open inventory.");
check(gameDefaults.keySlotsByTabId.equipment === 4, "Game keybind default F4 should open equipment.");
check(gameKeybinds.nhGameKeybindSideTabForFunctionKey(gameDefaults, "F4") === "equipment", "Game keybind F4 resolver should use Config.KEYBINDS defaults.");
const reassigned = gameKeybinds.nhAssignGameKeybind(gameDefaults, "inventory", 1);
check(reassigned.keySlotsByTabId.inventory === 1, "Game keybind assignment should set selected tab key slot.");
check(reassigned.keySlotsByTabId.combat === 0, "Game keybind assignment should clear duplicate key slot.");
check(gameKeybinds.nhPreEocGameKeybinds().keySlotsByTabId.inventory === 1, "Pre-EoC preset should map inventory to F1.");
check(
  keyRemapping.runeliteNormalizeKeyRemappingKeybind("=", defaults.f12).code === "Equal",
  "Key remapping normalizer should parse equals as browser Equal code."
);
check(
  keyRemapping.runeliteNormalizeKeyRemappingKeybind("90:0", defaults.f1).key === "Z",
  "Key remapping normalizer should parse ConfigManager keyCode:modifiers properties."
);
check(
  keyRemapping.runeliteNormalizeKeyRemappingKeybind("0:0", defaults.f1).key === "Not set",
  "Key remapping normalizer should preserve HotkeyButton's Not set state."
);
check(
  keyRemapping.runeliteKeyRemappingKeybindPropertyFromKeyboardEvent({
    key: "Z",
    code: "KeyZ",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false
  }) === "90:0",
  "HotkeyButton key capture should store Z as ConfigManager keyCode:modifiers."
);
check(
  keyRemapping.runeliteKeyRemappingKeybindPropertyFromKeyboardEvent({
    key: "1",
    code: "Digit1",
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false
  }) === "49:0",
  "ModifierlessKeybind capture should clear modifiers for non-modifier keys."
);
check(
  keyRemapping.runeliteKeyRemappingKeybindPropertyFromKeyboardEvent({
    key: "Shift",
    code: "ShiftLeft",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true
  }) === "0:64",
  "ModifierlessKeybind capture should store pure modifier keys like RuneLite Keybind."
);

for (const literal of [
  "RUNELITE_KEY_REMAPPING_PLUGIN_ID",
  "name: \"Key Remapping\"",
  "KeyRemappingPlugin.java",
  "KeyRemappingConfig.java",
  "RUNELITE_KEY_REMAPPING_CONFIG_GROUP",
  "readonly keyRemapping: RuneliteKeyRemappingConfigSnapshot",
  "keyRemapping: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT",
  "const keyRemappingValues = configValuesByPluginId[RUNELITE_KEY_REMAPPING_PLUGIN_ID] ?? {}",
  "keyRemappingEnabled = enabledPluginIds.has(RUNELITE_KEY_REMAPPING_PLUGIN_ID)",
  "runeliteNormalizeKeyRemappingKeybind(",
  "\"modifierless-keybind\"",
  "runeliteConfigHotkeyButton",
  "runeliteKeyRemappingKeybindPropertyFromKeyboardEvent",
  "ConfigManager.objectToString Keybind keyCode:modifiers"
]) {
  check(shellSource.includes(literal), `RuneliteClientShell is missing key remapping shell wiring ${literal}.`);
}

for (const literal of [
  "class HotkeyButton extends JButton",
  "setValue(Keybind.NOT_SET)",
  "setValue(new ModifierlessKeybind(e))",
  "configManager.setConfiguration(cd.getGroup().value(), cid.getItem().keyName(), hotkeyButton.getValue())"
]) {
  check(
    sourceConfig.includes(literal) ||
      sourceListener.includes(literal) ||
      sourceHotkeyButton.includes(literal) ||
      sourceConfigPanel.includes(literal) ||
      shellSource.includes(literal) ||
      keyRemappingSource.includes(literal),
    `RuneLite HotkeyButton/source-backed keybind path is missing ${literal}.`
  );
}

check(
  packageSource.includes("\"verify:runelite-keyremapping-render\": \"node scripts/verify-runelite-keyremapping-render.mjs\""),
  "package.json should expose verify:runelite-keyremapping-render."
);

for (const literal of [
  "applyRuneliteKeyRemappingConfig",
  "runeliteKeyRemappingCameraDirectionFromKeyboardEvent",
  "runeliteKeyRemappingFunctionKeyFromKeyboardEvent",
  "applyNhGameKeybindConfig",
  "nhGameKeybindSideTabForFunctionKey",
  "runeliteDirectFunctionKeyFromKeyboardEvent",
  "runeliteKeyRemappingTextEntryTargetConsumesKeys",
  'window.addEventListener("keydown", onKeyDown, true)',
  "cameraRemappedKeysRef",
  "Integer m = modified.get(e.getKeyCode())",
  "KeyHandler.copy$keyPressed",
  "lastSideTabFKeyMappedTab",
  "NH_GAME_KEYBIND_SOURCE",
  "viewport.dataset.lastSideTabFKey"
]) {
  check(
    runtimeSource.includes(literal) || keyRemappingSource.includes(literal) || gameKeybindsSource.includes(literal),
    `Runtime key-remapping path is missing ${literal}.`
  );
}

check(
  !runtimeSource.includes("event.repeat || runeliteKeyRemappingEventTargetConsumesKeys(event.target)"),
  "Function-key tab switching must not be blocked by focused combat/inventory buttons."
);
check(
  keyRemappingSource.includes("target instanceof HTMLButtonElement") &&
    keyRemappingSource.includes("runeliteKeyRemappingTextEntryTargetConsumesKeys") &&
    !keyRemappingSource
      .slice(
        keyRemappingSource.indexOf("export function runeliteKeyRemappingTextEntryTargetConsumesKeys"),
        keyRemappingSource.indexOf("export function runeliteKeyRemappingCameraDirectionFromKeyboardEvent")
      )
      .includes("HTMLButtonElement"),
  "F-key priority should only defer to real text-entry targets, while camera remap can still respect button focus."
);

check(
  packageSource.includes("\"verify:runelite-keyremapping\": \"node scripts/verify-runelite-keyremapping.mjs\""),
  "package.json should expose verify:runelite-keyremapping."
);

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      defaults: {
        camera: {
          up: defaults.up.key,
          down: defaults.down.key,
          left: defaults.left.key,
          right: defaults.right.key
        },
        fkeys: {
          f1: defaults.f1.key,
          f10: defaults.f10.key,
          f11: defaults.f11.key,
          f12: defaults.f12.key,
          esc: defaults.esc.key
        }
      }
    },
    null,
    2
  )
);
