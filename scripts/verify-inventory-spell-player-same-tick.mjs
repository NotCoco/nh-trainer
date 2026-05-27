import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(projectRoot, "scripts", "inventory-spell-player-same-tick-electron.cjs");
const nhRoot = path.resolve(projectRoot, "..", "nh-osrs-184-master", "nh-osrs-184-master", "Nh-master");

const runtimeSource = await readFile(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
for (const snippet of [
  'readonly kind: "attack" | "spell"',
  "queuePlayerSpellAfterPendingItemPackets",
  "selectedSpellWidget/selectedSpellChildIndex",
  "lastPlayerQueuedCombatKind = \"spell\"",
  "applyPlayerSpellCommand(packet.entry, packet.position, packet.spellId, \"queued\")",
  "actionSequenceKey: actionFrameActive ? actionSequenceKey ?? undefined : undefined",
  "nhAdvancePrimarySequenceCursor",
  "primaryFrameCycle > frameLength",
  "completedSequenceKey: actor.activeSequenceKey",
  "lastActionAnimationCycle",
  "Nh client LoginPacket.method3722 starts a sequence once, then class329 only advances"
]) {
  if (!runtimeSource.includes(snippet)) {
    throw new Error(`RuntimeSceneViewer missing same-tick spell/player packet snippet: ${snippet}`);
  }
}

const clientSource = await readFile(
  path.join(nhRoot, "runelite", "runelite-client", "src", "main", "java", "net", "runelite", "standalone", "Client.java"),
  "utf8"
);
for (const snippet of [
  "class19.method340(var1, var0, class12.method155(class12.method148(var17)), var17.itemId);",
  "selectedSpellActionName = VerticalAlignment.method4441(var17);",
  "var10 = InterfaceParent.method1140(ClientPacket.field2395, packetWriter.isaacCipher);",
  "var10.packetBuffer.method5659(selectedSpellChildIndex);",
  "var10.packetBuffer.method5543(AttackOption.selectedSpellWidget);"
]) {
  if (!clientSource.includes(snippet)) {
    throw new Error(`Nh client selected-spell packet source evidence missing ${snippet}`);
  }
}

const loginPacketSource = await readFile(
  path.join(nhRoot, "runelite", "runelite-client", "src", "main", "java", "net", "runelite", "standalone", "LoginPacket.java"),
  "utf8"
);
const clientActorStepSource = await readFile(
  path.join(nhRoot, "runelite", "runelite-client", "src", "main", "java", "net", "runelite", "standalone", "class329.java"),
  "utf8"
);
for (const snippet of [
  "var0.sequenceFrame = 0;",
  "var0.sequenceFrameCycle = 0;",
  "++var0.sequenceFrameCycle;"
]) {
  const source = snippet.startsWith("++") ? clientActorStepSource : loginPacketSource;
  if (!source.includes(snippet)) {
    throw new Error(`Nh client animation sequence source evidence missing ${snippet}`);
  }
}

const targetSpellSource = await readFile(
  path.join(nhRoot, "nh-server", "src", "main", "java", "io", "ruin", "model", "skills", "magic", "spells", "TargetSpell.java"),
  "utf8"
);
if (!targetSpellSource.includes("entityAction = (p, e) -> p.getCombat().queueSpell(this, e);")) {
  throw new Error("Nh TargetSpell source evidence missing queueSpell entity action");
}

const playerCombatSource = await readFile(
  path.join(nhRoot, "nh-server", "src", "main", "java", "io", "ruin", "model", "entity", "player", "PlayerCombat.java"),
  "utf8"
);
for (const snippet of [
  "public void queueSpell(TargetSpell spell, Entity target)",
  "queuedSpell = spell;",
  "setTarget(target);",
  "spell = queuedSpell;",
  "if(!spell.cast(player, target))"
]) {
  if (!playerCombatSource.includes(snippet)) {
    throw new Error(`Nh PlayerCombat spell source evidence missing ${snippet}`);
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
  throw new Error(`inventory/spell/player same-tick validation failed with code ${exitCode}\n${stderr}\n${stdout}`);
}

process.stdout.write(stdout);
