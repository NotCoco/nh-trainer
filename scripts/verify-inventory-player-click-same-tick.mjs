import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(projectRoot, "scripts", "inventory-player-click-same-tick-electron.cjs");
const workspaceRoot = path.resolve(projectRoot, "..");
const sourceRoot = process.env.NH_SOURCE_ROOT
  ? path.resolve(process.env.NH_SOURCE_ROOT)
  : path.resolve(workspaceRoot, "kronos-osrs-184-master", "kronos-osrs-184-master", "Kronos-master");
const apiRoot = process.env.NH_API_JAVA_RUIN_ROOT
  ? path.resolve(process.env.NH_API_JAVA_RUIN_ROOT)
  : path.join(sourceRoot, "kronos-api", "src", "main", "java", "io", "ruin");
const serverRoot = process.env.NH_SERVER_JAVA_RUIN_ROOT
  ? path.resolve(process.env.NH_SERVER_JAVA_RUIN_ROOT)
  : path.join(sourceRoot, "kronos-server", "src", "main", "java", "io", "ruin");

const runtimeSource = await readFile(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
for (const snippet of [
  "interface QueuedPlayerCombatPacket",
  "queuePlayerAttackAfterPendingItemPackets",
  "MessageDecoder keeps incoming packets in insertion order",
  "decoder.process(this, 250)",
  "processReadyPlayerCombatPackets(readyPlayerPackets)",
  "lastPlayerQueuedAfterPendingInventory",
  "appearance: nextActorAppearance ?? finalConsumableSourceActor.appearance"
]) {
  if (!runtimeSource.includes(snippet)) {
    throw new Error(`RuntimeSceneViewer missing same-tick inventory/player packet snippet: ${snippet}`);
  }
}

const electronVerifierSource = await readFile(scriptPath, "utf8");
for (const snippet of [
  "foodSlot",
  "state.localPose.appearanceItemIds.includes(sameTickWeaponItemId)"
]) {
  if (!electronVerifierSource.includes(snippet)) {
    throw new Error(`same-tick Electron verifier missing food/equipment appearance assertion: ${snippet}`);
  }
}

const messageDecoderSource = await readFile(
  path.join(apiRoot, "api", "netty", "MessageDecoder.java"),
  "utf8"
);
for (const snippet of [
  "ConcurrentLinkedQueue<Message> messages",
  "this.messages = queue ? new ConcurrentLinkedQueue<>() : null;",
  "while((message = messages.poll()) != null)"
]) {
  if (!messageDecoderSource.includes(snippet)) {
    throw new Error(`Nh MessageDecoder source evidence missing ${snippet}`);
  }
}

const playerSource = await readFile(
  path.join(serverRoot, "model", "entity", "player", "Player.java"),
  "utf8"
);
for (const snippet of [
  "decoder.process(this, 250)",
  "combat.preAttack();",
  "combat.attack();"
]) {
  if (!playerSource.includes(snippet)) {
    throw new Error(`Nh Player source evidence missing ${snippet}`);
  }
}

const playerActionSource = await readFile(
  path.join(serverRoot, "network", "incoming", "handlers", "PlayerActionHandler.java"),
  "utf8"
);
for (const snippet of [
  "player.resetActions(true, true, true);",
  "action.consumer.accept(player, target);"
]) {
  if (!playerActionSource.includes(snippet)) {
    throw new Error(`Nh PlayerActionHandler source evidence missing ${snippet}`);
  }
}

const actionButtonSource = await readFile(
  path.join(serverRoot, "network", "incoming", "handlers", "ActionButtonHandler.java"),
  "utf8"
);
if (!actionButtonSource.includes("handleAction(player, option, interfaceHash, slot, itemId, false);")) {
  throw new Error("Nh ActionButtonHandler source evidence missing inventory action dispatch");
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
  throw new Error(`inventory/player same-tick validation failed with code ${exitCode}\n${stderr}\n${stdout}`);
}

process.stdout.write(stdout);
