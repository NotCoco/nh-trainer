import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readNhClient(relativePath) {
  return fs.readFileSync(path.resolve(root, "..", "Nh184-Client", relativePath), "utf8");
}

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

const runeliteConfigSource = readNhClient("runelite-client/src/main/java/net/runelite/client/config/RuneLiteConfig.java");
const runeliteConstantsSource = readNhClient("runelite-api/src/main/java/net/runelite/api/config/Constants.java");
const clientPanelSource = readNhClient("runelite-client/src/main/java/net/runelite/client/ui/ClientPanel.java");
const clientPluginToolbarSource = readNhClient("runelite-client/src/main/java/net/runelite/client/ui/ClientPluginToolbar.java");
const clientUiSource = readNhClient("runelite-client/src/main/java/net/runelite/client/ui/ClientUI.java");
const titlePropertiesSource = readNhClient("runelite-client/src/main/resources/open.osrs.properties");
const warningOnExitSource = readNhClient("runelite-client/src/main/java/net/runelite/client/config/WarningOnExit.java");
const resizeTypeSource = readNhClient("runelite-client/src/main/java/net/runelite/client/config/ExpandResizeType.java");
const containableFrameSource = readNhClient("runelite-client/src/main/java/net/runelite/client/ui/ContainableFrame.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const bridgeSource = read("src/client/bridge.ts");
const preloadSource = read("src/client/preload.cts");
const mainSource = read("src/client/main.ts");
const packageSource = read("package.json");

for (const sourceAnchor of [
  'open.osrs.title=Nh'
]) {
  check(titlePropertiesSource.includes(sourceAnchor), `open.osrs.properties missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "GAME_FIXED_WIDTH = 765",
  "GAME_FIXED_HEIGHT = 503",
  "GAME_FIXED_SIZE = new Dimension(GAME_FIXED_WIDTH, GAME_FIXED_HEIGHT)"
]) {
  check(runeliteConstantsSource.includes(sourceAnchor), `Constants source missing fixed client size anchor ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "setMinimumSize(Constants.GAME_FIXED_SIZE)",
  "setPreferredSize(Constants.GAME_FIXED_SIZE)",
  "client.setSize(Constants.GAME_FIXED_SIZE)"
]) {
  check(clientPanelSource.includes(sourceAnchor), `ClientPanel source missing fixed client minimum anchor ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "TOOLBAR_WIDTH = 36, TOOLBAR_HEIGHT = 503",
  "setMinimumSize(new Dimension(TOOLBAR_WIDTH, TOOLBAR_HEIGHT))"
]) {
  check(clientPluginToolbarSource.includes(sourceAnchor), `ClientPluginToolbar source missing toolbar minimum anchor ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'keyName = "automaticResizeType"',
  "default ExpandResizeType automaticResizeType()",
  "return ExpandResizeType.KEEP_GAME_SIZE",
  'keyName = "lockWindowSize"',
  "default boolean lockWindowSize()",
  'keyName = "containInScreen2"',
  "default ContainableFrame.Mode containInScreen()",
  "return ContainableFrame.Mode.RESIZING",
  'keyName = "uiEnableCustomChrome"',
  "default boolean enableCustomChrome()",
  'keyName = "usernameInTitle"',
  "default boolean usernameInTitle()",
  'keyName = "rememberScreenBounds"',
  "default boolean rememberScreenBounds()",
  'keyName = "gameAlwaysOnTop"',
  "default boolean gameAlwaysOnTop()",
  'keyName = "warningOnExit"',
  "default WarningOnExit warningOnExit()",
  "return WarningOnExit.LOGGED_IN",
  'keyName = "menuEntryShift"',
  "default boolean menuEntryShift()"
]) {
  check(runeliteConfigSource.includes(sourceAnchor), `RuneLiteConfig source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "frame.setTitle(RuneLiteProperties.getTitle() + \" - \" + player.getName())",
  "frame.setTitle(RuneLiteProperties.getTitle())",
  "frame.setAlwaysOnTop(config.gameAlwaysOnTop())",
  "frame.setResizable(!config.lockWindowSize())",
  "frame.setExpandResizeType(config.automaticResizeType())",
  "ContainableFrame.Mode containMode = config.containInScreen()",
  "frame.setContainedInScreen(containMode)",
  "configManager.unsetConfiguration(CONFIG_GROUP, CONFIG_CLIENT_MAXIMIZED)",
  "configManager.unsetConfiguration(CONFIG_GROUP, CONFIG_CLIENT_BOUNDS)",
  "config.warningOnExit() == WarningOnExit.ALWAYS",
  "config.warningOnExit() == WarningOnExit.LOGGED_IN"
]) {
  check(clientUiSource.includes(sourceAnchor), `ClientUI source missing frame config anchor ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'ALWAYS("Always")',
  'LOGGED_IN("Logged in")',
  'NEVER("Never")'
]) {
  check(warningOnExitSource.includes(sourceAnchor), `WarningOnExit source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'KEEP_WINDOW_SIZE("Keep window size")',
  'KEEP_GAME_SIZE("Keep game size")'
]) {
  check(resizeTypeSource.includes(sourceAnchor), `ExpandResizeType source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "ALWAYS",
  "RESIZING",
  "NEVER"
]) {
  check(containableFrameSource.includes(sourceAnchor), `ContainableFrame.Mode source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  "RUNELITE_CLIENT_TITLE = \"NH Trainer\"",
  "RUNELITE_CLIENT_TITLE_SOURCE",
  "RUNELITE_FRAME_CONFIG_SOURCE",
  "RuneliteFrameConfigSnapshot",
  'automaticResizeType: "Keep game size"',
  "lockWindowSize: false",
  'containInScreen: "RESIZING"',
  "enableCustomChrome: true",
  "usernameInTitle: true",
  "rememberScreenBounds: true",
  "gameAlwaysOnTop: false",
  'warningOnExit: "Logged in"',
  'keyName: "automaticResizeType"',
  'options: ["Keep window size", "Keep game size"]',
  'keyName: "containInScreen2"',
  'options: ["ALWAYS", "RESIZING", "NEVER"]',
  'keyName: "gameAlwaysOnTop"',
  'defaultValue: "Logged in"',
  'keyName: "menuEntryShift"',
  "defaultValue: true",
  "runeliteClientFrameConfig",
  "document.title = clientFrameConfig.title",
  "bridge.applyClientShellFrameConfig(clientFrameConfig)",
  "rememberScreenBounds: config.frame.rememberScreenBounds",
  "runeliteExpandResizeType",
  "runeliteContainInScreenMode",
  "runeliteWarningOnExitMode",
  "config.frame.usernameInTitle && playerName ? `${RUNELITE_CLIENT_TITLE} - ${playerName}` : RUNELITE_CLIENT_TITLE",
  "resizable: !config.frame.lockWindowSize",
  "data-source-frame-config={RUNELITE_FRAME_CONFIG_SOURCE}",
  "data-source-client-title={RUNELITE_CLIENT_TITLE_SOURCE}",
  "data-runelite-frame-title={clientFrameConfig.title}",
  "data-runelite-frame-always-on-top={String(clientFrameConfig.alwaysOnTop)}",
  "data-runelite-frame-resizable={String(clientFrameConfig.resizable)}",
  "data-runelite-frame-automatic-resize-type={configSnapshot.frame.automaticResizeType}",
  "data-runelite-frame-contain-in-screen={configSnapshot.frame.containInScreen}"
]) {
  check(shellSource.includes(trainerAnchor), `RuneliteClientShell missing frame config anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "ClientShellFrameConfig",
  "readonly rememberScreenBounds: boolean",
  "applyClientShellFrameConfig: (config: ClientShellFrameConfig) => Promise<void>"
]) {
  check(bridgeSource.includes(trainerAnchor), `bridge.ts missing frame config anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "ClientShellFrameConfig",
  'ipcRenderer.invoke("client-shell:apply-frame-config", config)'
]) {
  check(preloadSource.includes(trainerAnchor), `preload.cts missing frame config anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "ClientShellFrameConfig",
  "registerClientShellIpc",
  "NH_FIXED_CLIENT_WIDTH = 765",
  "NH_FIXED_CLIENT_HEIGHT = 503",
  "RUNELITE_PLUGIN_TOOLBAR_WIDTH = 36",
  "RUNELITE_SHELL_BORDER_PX = 0",
  "RUNELITE_MIN_CONTENT_WIDTH = NH_FIXED_CLIENT_WIDTH + RUNELITE_PLUGIN_TOOLBAR_WIDTH + RUNELITE_SHELL_BORDER_PX",
  "RUNELITE_MIN_CONTENT_HEIGHT = NH_FIXED_CLIENT_HEIGHT + RUNELITE_SHELL_BORDER_PX",
  'clientWindowBoundsDirectoryName = "NHTrainer"',
  'legacyClientWindowBoundsDirectoryName = "NhNHTrainer"',
  "client-window-bounds.json",
  'legacyElectronUserDataDirectoryName = "Electron"',
  "readRememberedClientWindowBounds",
  "readRememberedClientWindowBoundsFromPath",
  "saveRememberedClientWindowBounds",
  "saveRememberedClientWindowBoundsSync",
  "rememberedClientWindowBoundsPayload",
  "clearRememberedClientWindowBounds",
  "rememberClientWindowBounds = config.rememberScreenBounds",
  "screen.getDisplayMatching(bounds).workArea",
  'app.getPath("appData")',
  "legacyClientWindowBoundsPath",
  "legacyNamedClientWindowBoundsPath",
  "useContentSize: true",
  "applyRuneliteMinimumContentSize(window)",
  "window.getContentBounds()",
  "window.setMinimumSize(RUNELITE_MIN_CONTENT_WIDTH + frameWidth, RUNELITE_MIN_CONTENT_HEIGHT + frameHeight)",
  "saveRememberedClientWindowBoundsSync(window)",
  'ipcMain.handle("client-shell:apply-frame-config"',
  "BrowserWindow.fromWebContents(event.sender)",
  "window.setTitle(config.title)",
  "window.setAlwaysOnTop(config.alwaysOnTop)",
  "window.setResizable(config.resizable)"
]) {
  check(mainSource.includes(trainerAnchor), `main.ts missing frame config anchor ${trainerAnchor}`);
}

check(
  packageSource.includes('"verify:runelite-frame-config": "node scripts/verify-runelite-frame-config.mjs"'),
  "package.json should expose verify:runelite-frame-config."
);
check(
  packageSource.includes('"verify:runelite-window-bounds-persistence": "node scripts/verify-runelite-window-bounds-persistence.mjs"'),
  "package.json should expose verify:runelite-window-bounds-persistence."
);
check(
  packageSource.includes("npm run verify:runelite-frame-config"),
  "verify:all should include verify:runelite-frame-config."
);
check(
  packageSource.includes("npm run verify:runelite-window-bounds-persistence"),
  "verify:all should include verify:runelite-window-bounds-persistence."
);

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      source: "ClientUI.updateFrameConfig / RuneLiteConfig frame behavior",
      trainer: "RuneliteClientShell derives source-backed frame config and applies Electron/browser title, resizable, and always-on-top state"
    },
    null,
    2
  )
);
