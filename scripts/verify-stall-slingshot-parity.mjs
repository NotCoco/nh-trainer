import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(projectRoot, "scripts", "stall-slingshot-comparison-electron.cjs");
const clientRoot = path.resolve(projectRoot, "..", "Kronos184-Client", "runelite-client", "src", "main", "java", "net", "runelite", "standalone");
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

const viewerSource = await readFile(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
for (const snippet of [
  "manualActorWithAuthoritativeSequenceCursor",
  "equipment updates only rebuild PlayerAppearance",
  "class329's path or field687 catch-up state",
  "clientTargetIndexUntilClientCycle",
  "motionHistory"
]) {
  if (!viewerSource.includes(snippet)) {
    throw new Error(`RuntimeSceneViewer missing stall/equip parity snippet: ${snippet}`);
  }
}

const class329Source = await readFile(path.join(clientRoot, "class329.java"), "utf8");
for (const snippet of [
  "if(var0.field726 > 0 && var2.field3436 == 0)",
  "++var0.field687;",
  "if(var0.field687 > 0 && var0.pathLength > 1)",
  "--var0.field687;"
]) {
  if (!class329Source.includes(snippet)) {
    throw new Error(`Kronos client movement source evidence missing: ${snippet}`);
  }
}

const loginPacketSource = await readFile(path.join(clientRoot, "LoginPacket.java"), "utf8");
if (!loginPacketSource.includes("var0.field726 = var0.pathLength;")) {
  throw new Error("Kronos client sequence acceptance source evidence missing field726 pathLength assignment.");
}

const tabInventorySource = await readFile(path.join(serverRoot, "model", "inter", "handlers", "TabInventory.java"), "utf8");
for (const snippet of [
  "player.getEquipment().equip(item);",
  "player.resetActions(false, player.getMovement().following != null, true);"
]) {
  if (!tabInventorySource.includes(snippet)) {
    throw new Error(`Kronos inventory equip source evidence missing: ${snippet}`);
  }
}

const child = spawn(electronPath, [scriptPath, projectRoot], {
  cwd: projectRoot,
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let stdout = "";
let stderr = "";

child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const exitCode = await new Promise((resolve) => child.on("close", resolve));
if (exitCode !== 0) {
  throw new Error(`stall/slingshot gear parity validation failed with code ${exitCode}\n${stderr}\n${stdout}`);
}

process.stdout.write(stdout);
