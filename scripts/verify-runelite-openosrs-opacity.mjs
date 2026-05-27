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

const openOsrsConfigSource = readNhClient("runelite-client/src/main/java/net/runelite/client/config/OpenOSRSConfig.java");
const clientUiSource = readNhClient("runelite-client/src/main/java/net/runelite/client/ui/ClientUI.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const packageSource = read("package.json");

for (const sourceAnchor of [
  '@ConfigGroup("openosrs")',
  'keyName = "enableOpacity"',
  'name = "Enable opacity"',
  'keyName = "opacityPercentage"',
  "min = 15",
  "max = 100",
  "default int opacityPercentage()",
  "return 100"
]) {
  check(openOsrsConfigSource.includes(sourceAnchor), `OpenOSRSConfig source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'private static final String PLUS_CONFIG_GROUP = "openosrs"',
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
  "RuneliteOpenOsrsConfigSnapshot",
  "openOsrs: {",
  "enableOpacity: false",
  "opacityPercentage: 100",
  "effectiveOpacity: 1",
  'keyName: "enableOpacity"',
  'description: "Enables opacity for the whole window."',
  'keyName: "opacityPercentage"',
  "min: 15",
  "max: 100",
  "const openOsrsValues = configValuesByPluginId.openosrs ?? {}",
  "const openOsrsEnableOpacity = runeliteConfigBoolean",
  "const openOsrsOpacityPercentage = runeliteConfigPercentage",
  "effectiveOpacity: openOsrsEnableOpacity ? openOsrsOpacityPercentage / 100 : 1",
  "function runeliteClientShellStyle",
  "return config.openOsrs.enableOpacity ? { opacity: config.openOsrs.effectiveOpacity } : undefined",
  'data-source-openosrs-opacity="ClientUI.updateFrameConfig reads openosrs.enableOpacity and openosrs.opacityPercentage; setOpacity uses opacityPercentage / 100F; disabled resets frame opacity to 1F"',
  "data-openosrs-opacity-enabled={String(configSnapshot.openOsrs.enableOpacity)}",
  "data-openosrs-opacity-percentage={configSnapshot.openOsrs.opacityPercentage}",
  "data-openosrs-effective-opacity={configSnapshot.openOsrs.effectiveOpacity}",
  "style={runeliteClientShellStyle(configSnapshot)}"
]) {
  check(shellSource.includes(trainerAnchor), `RuneliteClientShell missing OpenOSRS opacity anchor ${trainerAnchor}`);
}

check(
  packageSource.includes('"verify:runelite-openosrs-opacity": "node scripts/verify-runelite-openosrs-opacity.mjs"'),
  "package.json should expose verify:runelite-openosrs-opacity."
);
check(
  packageSource.includes("npm run verify:runelite-openosrs-opacity"),
  "verify:all should include verify:runelite-openosrs-opacity."
);

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      source: "ClientUI setOpacity uses openosrs.opacityPercentage / 100F and resets to 1F when disabled",
      trainer: "RuneliteClientShell applies OpenOSRS whole-client opacity to the shell root"
    },
    null,
    2
  )
);
