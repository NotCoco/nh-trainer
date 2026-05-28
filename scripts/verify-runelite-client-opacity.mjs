import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readNhClient(relativePath) {
  return fs.readFileSync(path.resolve(root, "..", "Kronos184-Client", relativePath), "utf8");
}

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

const legacyClientShellConfigGroup = ["open", "osrs"].join("");
const legacyClientShellConfigFile = ["Open", "OSRSConfig.java"].join("");
const legacyClientShellConfigSource = readNhClient(
  ["runelite-client/src/main/java/net/runelite/client/config", legacyClientShellConfigFile].join("/")
);
const clientUiSource = readNhClient("runelite-client/src/main/java/net/runelite/client/ui/ClientUI.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const packageSource = read("package.json");

for (const sourceAnchor of [
  `@ConfigGroup("${legacyClientShellConfigGroup}")`,
  'keyName = "enableOpacity"',
  'name = "Enable opacity"',
  'keyName = "opacityPercentage"',
  "min = 15",
  "max = 100",
  "default int opacityPercentage()",
  "return 100"
]) {
  check(legacyClientShellConfigSource.includes(sourceAnchor), `client shell config source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  `private static final String PLUS_CONFIG_GROUP = "${legacyClientShellConfigGroup}"`,
  'private static final String CONFIG_OPACITY = "enableOpacity"',
  'private static final String CONFIG_OPACITY_AMOUNT = "opacityPercentage"',
  "configManager.getConfiguration(PLUS_CONFIG_GROUP, CONFIG_OPACITY, boolean.class)",
  "setOpacity()",
  "frame.setOpacity(1F)",
  'Float.parseFloat(configManager.getConfiguration(PLUS_CONFIG_GROUP, CONFIG_OPACITY_AMOUNT)) / 100F',
  "opacity > 0F && opacity <= 1F"
]) {
  check(clientUiSource.includes(sourceAnchor), `ClientUI source missing opacity anchor ${sourceAnchor}`);
}

for (const trainerAnchor of [
  "RuneliteClientShellConfigSnapshot",
  "clientShell: {",
  "enableOpacity: false",
  "opacityPercentage: 100",
  "effectiveOpacity: 1",
  'const RUNELITE_CLIENT_SHELL_CONFIG_PLUGIN_ID = "client-shell"',
  'const RUNELITE_LEGACY_CLIENT_SHELL_CONFIG_GROUP = ["open", "osrs"].join("")',
  'keyName: "enableOpacity"',
  'description: "Enables opacity for the whole window."',
  'keyName: "opacityPercentage"',
  "min: 15",
  "max: 100",
  "const clientShellValues = configValuesByPluginId[RUNELITE_CLIENT_SHELL_CONFIG_PLUGIN_ID] ?? {}",
  "const clientShellEnableOpacity = runeliteConfigBoolean",
  "const clientShellOpacityPercentage = runeliteConfigPercentage",
  "effectiveOpacity: clientShellEnableOpacity ? clientShellOpacityPercentage / 100 : 1",
  "function runeliteClientShellStyle",
  "return config.clientShell.enableOpacity ? { opacity: config.clientShell.effectiveOpacity } : undefined",
  'data-source-client-opacity="ClientUI.updateFrameConfig reads client opacity settings; disabled resets frame opacity to 1F"',
  "data-client-opacity-enabled={String(configSnapshot.clientShell.enableOpacity)}",
  "data-client-opacity-percentage={configSnapshot.clientShell.opacityPercentage}",
  "data-client-effective-opacity={configSnapshot.clientShell.effectiveOpacity}",
  "style={runeliteClientShellStyle(configSnapshot)}"
]) {
  check(shellSource.includes(trainerAnchor), `RuneliteClientShell missing client opacity anchor ${trainerAnchor}`);
}

check(
  packageSource.includes('"verify:runelite-client-opacity": "node scripts/verify-runelite-client-opacity.mjs"'),
  "package.json should expose verify:runelite-client-opacity."
);
check(
  packageSource.includes("npm run verify:runelite-client-opacity"),
  "verify:all should include verify:runelite-client-opacity."
);

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      source: "ClientUI setOpacity uses the client opacity percentage / 100F and resets to 1F when disabled",
      trainer: "RuneliteClientShell applies whole-client opacity to the shell root"
    },
    null,
    2
  )
);
