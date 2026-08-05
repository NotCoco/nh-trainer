#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const trainerRoot = path.resolve(scriptDir, "..");
const kronosRoot = path.resolve(trainerRoot, "..");
const serverRoot = path.join(
  kronosRoot,
  "kronos-osrs-184-master",
  "kronos-osrs-184-master",
  "Kronos-master",
  "kronos-server"
);
const logDir = path.join(serverRoot, "data", "logs", "nhstaker");
const practicePropertiesPath = path.join(serverRoot, "server.practice.dmm.deployed.properties");
const verifierPath = path.join(scriptDir, "verify-dmm-deployed-composite-java.mjs");
const javaPath = resolveJavaPath();
const timeoutMs = Number.parseInt(process.env.NH_DMM_DEPLOYED_PROBE_TIMEOUT_MS ?? "150000", 10);
const worldId = Number.parseInt(process.env.NH_DMM_DEPLOYED_PROBE_WORLD_ID ?? "73", 10);
const port = await resolveProbePort();
const scratchDir = "C:\\codexscratch";
fs.mkdirSync(scratchDir, { recursive: true });
const probePropertiesPath = path.join(scratchDir, `nh-dmm-deployed-probe-${process.pid}.properties`);
const probeOutPath = path.join(scratchDir, `nh-dmm-deployed-probe-${process.pid}.log`);

const baseProperties = fs.readFileSync(practicePropertiesPath, "utf8");
const probeProperties = mergeProperties(baseProperties, {
  runtime_profile: "live",
  tick_ms: "300",
  world_id: String(worldId),
  world_name: "DMM Deployed Probe",
  world_address: `127.0.0.1:${port}`,
  "kronos.nh.spawn.practice.deployed.hard": "true",
  "kronos.nh.spawn.practice.deployed.peer": "true",
  "kronos.nh.spawn.practice.current.direct": "false",
  "kronos.nh.spawn.practice.autoduel": "true"
});
fs.writeFileSync(probePropertiesPath, probeProperties, "utf8");

const classpath = [
  path.join(serverRoot, "build", "classes", "java", "main"),
  path.join(serverRoot, "build", "classes", "kotlin", "main"),
  path.join(serverRoot, "build", "resources", "main"),
  path.join(serverRoot, "build", "install", "kronos-server", "lib", "*")
].join(";");

const outStream = fs.createWriteStream(probeOutPath, { flags: "w" });
const child = spawn(
  javaPath,
  [
    "-Djdk.attach.allowAttachSelf=true",
    `-Dkronos.settings.path=${probePropertiesPath}`,
    "-cp",
    classpath,
    "io.ruin.Server"
  ],
  {
    cwd: serverRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  }
);
child.stdout.pipe(outStream);
child.stderr.pipe(outStream);

try {
  const nhLog = await waitForProbeLog(child.pid, worldId, timeoutMs);
  await waitForLogEvidence(nhLog, timeoutMs);
  const verifier = spawnSync(process.execPath, [verifierPath, "--runtime-log", "--require-live-decisions", `--log=${nhLog}`], {
    cwd: trainerRoot,
    encoding: "utf8",
    windowsHide: true
  });
  if (verifier.status !== 0) {
    process.stdout.write(verifier.stdout ?? "");
    process.stderr.write(verifier.stderr ?? "");
    throw new Error(`deployed-composite verifier failed for probe log: ${nhLog}`);
  }
  const log = fs.readFileSync(nhLog, "utf8");
  const summary = summarizeProbeLog(log);
  assertProbeSummary(summary, nhLog);
  console.log("DMM deployed-composite Java probe passed:");
  console.log(`- started temporary Java server pid=${child.pid} world=${worldId} port=${port}`);
  console.log(`- log=${nhLog}`);
  console.log(`- decisions=${summary.decisions}, attacks=${summary.attackRequests}, styles=${[...summary.styles].join(",")}`);
  console.log(`- defence prayers=${[...summary.defencePrayers].join(",")}`);
  console.log(`- equipment intents=${[...summary.equipmentIntents].join(",")}, weapons=${[...summary.appliedWeapons].join(",")}`);
  console.log(`- delayed-prayer samples=${summary.delayedPrayerSamples}, violations=${summary.delayedPrayerViolations}`);
  console.log(`- facing checks=${summary.facingChecks}, violations=${summary.facingViolations}, stale markers=${summary.staleControllerMarkers}`);
  console.log(`- prayer switches=${summary.prayerSwitches}, style changes=${summary.styleChanges}, input outliers=${summary.inputOutliers}`);
} finally {
  killTree(child.pid);
  fs.rmSync(probePropertiesPath, { force: true });
  outStream.end();
}

function resolveJavaPath() {
  const preferred = "C:\\Program Files\\Amazon Corretto\\jdk11.0.25_9\\bin\\java.exe";
  if (fs.existsSync(preferred)) {
    return preferred;
  }
  return process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java")
    : "java";
}

async function resolveProbePort() {
  const requested = Number.parseInt(process.env.NH_DMM_DEPLOYED_PROBE_PORT ?? "14373", 10);
  for (let candidate = requested; candidate < requested + 100; candidate += 1) {
    if (await isPortFree(candidate)) {
      return candidate;
    }
  }
  throw new Error(`no free probe port found near ${requested}`);
}

function isPortFree(candidate) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(candidate, "127.0.0.1");
  });
}

function mergeProperties(text, overrides) {
  const seen = new Set();
  const lines = text.split(/\r?\n/).map((line) => {
    const match = /^([^#=][^=]*?)=(.*)$/.exec(line);
    if (!match) {
      return line;
    }
    const key = match[1].trim();
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      seen.add(key);
      return `${key}=${overrides[key]}`;
    }
    return line;
  });
  for (const [key, value] of Object.entries(overrides)) {
    if (!seen.has(key)) {
      lines.push(`${key}=${value}`);
    }
  }
  return `${lines.join(os.EOL)}${os.EOL}`;
}

function waitForProbeLog(pid, probeWorldId, maxMs) {
  const deadline = Date.now() + maxMs;
  const expected = `nhstaker-w${probeWorldId}-${pid}_`;
  return new Promise((resolve, reject) => {
    const poll = () => {
      const file = findLogFile(expected);
      if (file) {
        resolve(file);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`timed out waiting for NH probe log prefix ${expected}; server output: ${tailFile(probeOutPath)}`));
        return;
      }
      setTimeout(poll, 1000);
    };
    poll();
  });
}

function findLogFile(prefix) {
  if (!fs.existsSync(logDir)) {
    return "";
  }
  return fs.readdirSync(logDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".log"))
    .map((name) => path.join(logDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] ?? "";
}

function waitForLogEvidence(file, maxMs) {
  const deadline = Date.now() + maxMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      if (
        text.includes("practice_autoduel_started") &&
        text.includes("live_decision ") &&
        text.includes("live_prayer_state ") &&
        text.includes("live_applied_state ") &&
        text.includes("attackRequested=true")
      ) {
        const summary = summarizeProbeLog(text);
        const failures = probeSummaryFailures(summary);
        if (failures.length === 0) {
          resolve();
          return;
        }
      }
      if (Date.now() > deadline) {
        const summary = summarizeProbeLog(text);
        const failures = probeSummaryFailures(summary);
        reject(new Error(`timed out waiting for deployed-composite fight evidence in ${file}:\n- ${failures.join("\n- ")}\nTail:\n${tailFile(file)}`));
        return;
      }
      setTimeout(poll, 1000);
    };
    poll();
  });
}

function summarizeProbeLog(log) {
  const summary = {
    decisions: 0,
    attackRequests: 0,
    prayerSwitches: 0,
    styleChanges: 0,
    inputOutliers: 0,
    styles: new Set(),
    defencePrayers: new Set(),
    equipmentIntents: new Set(),
    appliedWeapons: new Set(),
    delayedPrayerSamples: 0,
    delayedPrayerViolations: 0,
    facingChecks: 0,
    facingViolations: 0,
    staleControllerMarkers: 0
  };
  for (const line of log.split(/\r?\n/)) {
    if (
      line.includes("policy_fallback") ||
      line.includes("script_fallback") ||
      line.includes("current_mapped") ||
      line.includes("deployed_scalar") ||
      line.includes("live_counter_override") ||
      (line.includes("cohort_") && !line.includes("COHORT_PAIR_COUNT"))
    ) {
      summary.staleControllerMarkers += 1;
    }
    if (line.includes("live_decision ") && line.includes("src=selfplay_dmm_deployed_composite")) {
      summary.decisions += 1;
      const style = /\bstyle=([A-Z_]+)/.exec(line)?.[1];
      const defence = /\bdef=([A-Z_]+)/.exec(line)?.[1];
      const equipment = /\bequipment=([A-Z_]+)/.exec(line)?.[1];
      if (style) {
        summary.styles.add(style);
      }
      if (defence) {
        summary.defencePrayers.add(defence);
      }
      if (equipment) {
        summary.equipmentIntents.add(equipment);
      }
    }
    if (line.includes("live_applied_state ") && line.includes("attackRequested=true") && line.includes("targetSet=true")) {
      summary.attackRequests += 1;
      if (line.includes("facingTarget=")) {
        summary.facingChecks += 1;
        if (!line.includes("facingTarget=true")) {
          summary.facingViolations += 1;
        }
      }
    }
    if (line.includes("live_applied_state ") && line.includes("src=selfplay_dmm_deployed_composite")) {
      const weapon = /\bweapon=(-?\d+)/.exec(line)?.[1];
      if (weapon) {
        summary.appliedWeapons.add(weapon);
      }
    }
    if (line.includes("live_prayer_state ") && line.includes("src=selfplay_dmm_deployed_composite")) {
      const visibleThreat = /\bvisibleThreat=([A-Z_]+)/.exec(line)?.[1];
      const liveThreat = /\bliveThreat=([A-Z_]+)/.exec(line)?.[1];
      const resolved = /\bresolved=([A-Z_]+)/.exec(line)?.[1];
      const expectedVisiblePrayer = protectionPrayerForThreat(visibleThreat);
      const expectedLivePrayer = protectionPrayerForThreat(liveThreat);
      if (
        expectedVisiblePrayer &&
        expectedLivePrayer &&
        expectedVisiblePrayer !== expectedLivePrayer
      ) {
        summary.delayedPrayerSamples += 1;
        if (resolved !== expectedVisiblePrayer || resolved === expectedLivePrayer) {
          summary.delayedPrayerViolations += 1;
        }
      }
    }
    if (line.includes("defence_prayer set=")) {
      summary.prayerSwitches += 1;
    }
    if (line.includes("style_change")) {
      summary.styleChanges += 1;
    }
    if (line.includes("dmm_deployed_composite_input_outlier")) {
      summary.inputOutliers += 1;
    }
  }
  return summary;
}

function probeSummaryFailures(summary) {
  const failures = [];
  if (summary.decisions < 8) {
    failures.push(`expected at least 8 deployed-composite decisions, saw ${summary.decisions}`);
  }
  if (summary.attackRequests < 2) {
    failures.push(`expected at least 2 real attack requests, saw ${summary.attackRequests}`);
  }
  if (summary.styles.size < 2) {
    failures.push(`expected at least 2 chosen attack styles, saw ${[...summary.styles].join(",") || "none"}`);
  }
  if (summary.defencePrayers.size < 2) {
    failures.push(`expected at least 2 chosen defence prayers, saw ${[...summary.defencePrayers].join(",") || "none"}`);
  }
  if (!summary.equipmentIntents.has("STYLE_LOADOUT")) {
    failures.push(`expected deployed-composite equipment intents to include STYLE_LOADOUT, saw ${[...summary.equipmentIntents].join(",") || "none"}`);
  }
  if (summary.appliedWeapons.size < 2) {
    failures.push(`expected at least 2 applied weapons from real style switches, saw ${[...summary.appliedWeapons].join(",") || "none"}`);
  }
  if (summary.facingChecks < 2) {
    failures.push(`expected at least 2 attack-applied facing checks, saw ${summary.facingChecks}`);
  }
  if (summary.facingViolations > 0) {
    failures.push(`expected attack-applied state to face the target, saw ${summary.facingViolations} violation(s)`);
  }
  if (summary.delayedPrayerSamples < 1) {
    failures.push("expected at least one live-prayer sample where delayed visible threat differs from same-tick live threat");
  }
  if (summary.delayedPrayerViolations > 0) {
    failures.push(`expected delayed visible threat to control prayer when live threat disagrees, saw ${summary.delayedPrayerViolations} violation(s)`);
  }
  if (summary.prayerSwitches < 1) {
    failures.push("expected at least one applied defence prayer switch");
  }
  if (summary.inputOutliers > 0) {
    failures.push(`expected no deployed-composite feature input outliers, saw ${summary.inputOutliers}`);
  }
  if (summary.staleControllerMarkers > 0) {
    failures.push(`expected no stale controller/fallback markers, saw ${summary.staleControllerMarkers}`);
  }
  return failures;
}

function protectionPrayerForThreat(threat) {
  if (threat === "MAGIC") {
    return "PROTECT_FROM_MAGIC";
  }
  if (threat === "RANGED") {
    return "PROTECT_FROM_MISSILES";
  }
  if (threat === "MELEE") {
    return "PROTECT_FROM_MELEE";
  }
  return "";
}

function assertProbeSummary(summary, file) {
  const failures = probeSummaryFailures(summary);
  if (failures.length > 0) {
    throw new Error(`probe evidence too weak in ${file}:\n- ${failures.join("\n- ")}\nTail:\n${tailFile(file)}`);
  }
}

function tailFile(file) {
  if (!file || !fs.existsSync(file)) {
    return "";
  }
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  return lines.slice(-80).join("\n");
}

function killTree(pid) {
  if (!pid) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Process already exited.
    }
  }
}
