import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  kronosClientCapturePlan,
  referenceManifestFileName,
  renderReferenceTargets
} from "./render-reference-targets.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kronosRoot = path.resolve(projectRoot, "..");
const defaultClientRoot = path.join(kronosRoot, "Kronos184-Client");
const defaultSourceRoot = "C:\\codeximg\\kronos-client-reference";
const defaultOutputRoot = path.join(projectRoot, "fixtures", "reference", "client-render");

function parseArgs(argv) {
  const options = {
    clientRoot: process.env.KRONOS_CLIENT_ROOT ?? defaultClientRoot,
    sourceRoot: process.env.KRONOS_CLIENT_REFERENCE_DIR ?? defaultSourceRoot,
    outputRoot: defaultOutputRoot,
    requireCaptures: false,
    json: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--client") {
      options.clientRoot = path.resolve(argv[index + 1] ?? "");
      index += 1;
    } else if (arg === "--source") {
      options.sourceRoot = path.resolve(argv[index + 1] ?? "");
      index += 1;
    } else if (arg === "--out") {
      options.outputRoot = path.resolve(argv[index + 1] ?? "");
      index += 1;
    } else if (arg === "--require-captures") {
      options.requireCaptures = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    ...options,
    clientRoot: path.resolve(options.clientRoot),
    sourceRoot: path.resolve(options.sourceRoot),
    outputRoot: path.resolve(options.outputRoot)
  };
}

function usage() {
  return [
    "Usage: npm run capture:client:preflight -- [--source <dir>] [--client <dir>] [--require-captures] [--json]",
    "",
    "Validates the real Kronos client capture bridge and reports whether the expected",
    "viewport-cropped reference PNGs and .client-view.json traces are present.",
    "",
    `Default client: ${defaultClientRoot}`,
    `Default source: ${defaultSourceRoot}`,
    `Default imported output: ${defaultOutputRoot}`
  ].join("\n");
}

async function readText(filePath) {
  return readFile(filePath, "utf8");
}

async function fileStatus(filePath) {
  try {
    const stats = await stat(filePath);
    return { exists: true, isFile: stats.isFile(), isDirectory: stats.isDirectory(), size: stats.size };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { exists: false, isFile: false, isDirectory: false, size: 0 };
    }
    throw error;
  }
}

async function readJsonIfPresent(filePath) {
  const status = await fileStatus(filePath);
  if (!status.isFile) {
    return { status, json: null, error: null };
  }

  try {
    const text = await readText(filePath);
    return { status, json: JSON.parse(stripJsonBom(text)), error: null };
  } catch (error) {
    return { status, json: null, error: error.message };
  }
}

function stripJsonBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function clientViewTraceFileName(frameFileName) {
  return frameFileName.toLowerCase().endsWith(".png")
    ? `${frameFileName.slice(0, -4)}.client-view.json`
    : `${frameFileName}.client-view.json`;
}

function readPngSize(buffer, filePath) {
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`not a PNG file: ${filePath}`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

async function inspectPng(filePath) {
  const status = await fileStatus(filePath);
  if (!status.isFile) {
    return { exists: false, width: null, height: null, error: null };
  }

  try {
    const buffer = await readFile(filePath);
    return { exists: true, ...readPngSize(buffer, filePath), error: null };
  } catch (error) {
    return { exists: true, width: null, height: null, error: error.message };
  }
}

function assertIncludes(failures, label, source, snippet) {
  if (!source.includes(snippet)) {
    failures.push(`${label} missing ${JSON.stringify(snippet)}`);
  }
}

async function validateClientBridge(clientRoot) {
  const buildFile = path.join(clientRoot, "build.gradle.kts");
  const gradleBat = path.join(clientRoot, "gradlew.bat");
  const capturePluginFile = path.join(
    clientRoot,
    "runelite-client",
    "src",
    "main",
    "java",
    "net",
    "runelite",
    "client",
    "plugins",
    "kronosnhcapture",
    "KronosNhCapturePlugin.java"
  );
  const cameraBridgeFile = path.join(
    clientRoot,
    "runelite-client",
    "src",
    "main",
    "java",
    "net",
    "runelite",
    "standalone",
    "KronosNhCaptureSceneBridge.java"
  );
  const clientViewBridgeFile = path.join(
    clientRoot,
    "runelite-client",
    "src",
    "main",
    "java",
    "net",
    "runelite",
    "standalone",
    "KronosNhClientViewBridge.java"
  );
  const actorFile = path.join(
    clientRoot,
    "runelite-client",
    "src",
    "main",
    "java",
    "net",
    "runelite",
    "standalone",
    "Actor.java"
  );
  const projectilePacketFile = path.join(
    clientRoot,
    "runelite-client",
    "src",
    "main",
    "java",
    "net",
    "runelite",
    "standalone",
    "GrandExchangeOfferTotalQuantityComparator.java"
  );

  const failures = [];
  const files = {
    buildFile: await fileStatus(buildFile),
    gradleBat: await fileStatus(gradleBat),
    capturePluginFile: await fileStatus(capturePluginFile),
    cameraBridgeFile: await fileStatus(cameraBridgeFile),
    clientViewBridgeFile: await fileStatus(clientViewBridgeFile),
    actorFile: await fileStatus(actorFile),
    projectilePacketFile: await fileStatus(projectilePacketFile)
  };

  for (const [name, status] of Object.entries(files)) {
    if (!status.isFile) {
      failures.push(`${name} is missing`);
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures, files };
  }

  const [
    buildSource,
    captureSource,
    cameraBridgeSource,
    clientViewBridgeSource,
    actorSource,
    projectilePacketSource
  ] = await Promise.all([
    readText(buildFile),
    readText(capturePluginFile),
    readText(cameraBridgeFile),
    readText(clientViewBridgeFile),
    readText(actorFile),
    readText(projectilePacketFile)
  ]);

  assertIncludes(failures, "root Gradle run task", buildSource, 'mainClassName = "net.runelite.client.RuneLite"');
  assertIncludes(failures, "root Gradle run task", buildSource, 'named<JavaExec>("run")');
  assertIncludes(failures, "capture plugin", captureSource, 'enabledByDefault = true');
  assertIncludes(failures, "capture plugin", captureSource, 'hidden = true');
  assertIncludes(failures, "capture plugin", captureSource, 'CAPTURE_DIR_ENV = "KRONOS_NH_CAPTURE_DIR"');
  assertIncludes(failures, "capture plugin", captureSource, 'CAPTURE_PLAN_ENV = "KRONOS_NH_CAPTURE_PLAN"');
  assertIncludes(failures, "capture plugin", captureSource, "drawManager.requestNextFrameListener(imageCallback);");
  assertIncludes(failures, "capture plugin", captureSource, "BufferedImage frame = cropViewport(source, viewport);");
  assertIncludes(
    failures,
    "capture plugin",
    captureSource,
    "KronosNhClientViewBridge.snapshotClientViewTrace(clientCycle, target.fileName)"
  );
  assertIncludes(failures, "camera bridge", cameraBridgeSource, "return sourceClientPreset(256, 128);");
  assertIncludes(failures, "camera bridge", cameraBridgeSource, "return sourceClientPreset(0, 128);");
  assertIncludes(failures, "camera bridge", cameraBridgeSource, "return sourceClientPreset(1024, 128);");
  assertIncludes(failures, "camera bridge", cameraBridgeSource, "return sourceClientPreset(256, 383);");
  assertIncludes(failures, "camera bridge", cameraBridgeSource, "pitch * 3 + 600");
  assertIncludes(failures, "client-view bridge", clientViewBridgeSource, "snapshotClientViewTrace");
  assertIncludes(failures, "client-view bridge", clientViewBridgeSource, '"client-view.v1"');
  assertIncludes(failures, "client-view bridge", clientViewBridgeSource, "client-player-appearance-packet");
  assertIncludes(failures, "client-view bridge", clientViewBridgeSource, "SKILL_JSON_KEYS");
  assertIncludes(failures, "client-view bridge", clientViewBridgeSource, "appendSkillStates(json);");
  assertIncludes(failures, "client-view bridge", clientViewBridgeSource, "client-skill-level-array-contract");
  assertIncludes(failures, "client-view bridge", clientViewBridgeSource, "RECORDED_HITSPLATS");
  assertIncludes(failures, "client-view bridge", clientViewBridgeSource, "recordActorHitsplat");
  assertIncludes(failures, "client-view bridge", clientViewBridgeSource, "appendEvents(json, tick, localPlayer, opponent)");
  assertIncludes(failures, "client-view bridge", clientViewBridgeSource, "RECORDED_PROJECTILES");
  assertIncludes(failures, "client-view bridge", clientViewBridgeSource, "recordProjectile");
  assertIncludes(failures, "client-view bridge", clientViewBridgeSource, "client-projectile-packet-lifecycle");
  assertIncludes(failures, "client-view bridge", clientViewBridgeSource, "client-projectile-motion-contract");
  assertIncludes(failures, "client-view bridge", clientViewBridgeSource, "client-hitsplat-packet-contract");
  assertIncludes(failures, "client-view bridge", clientViewBridgeSource, "client-spotanim-sequence-contract");
  assertIncludes(failures, "actor hitsplat recorder", actorSource, "KronosNhClientViewBridge.recordActorHitsplat(this, var1, var2, var3, var4, var5, var6, var9, var11);");
  assertIncludes(
    failures,
    "projectile packet recorder",
    projectilePacketSource,
    "KronosNhClientViewBridge.recordProjectile(var34, Client.cycle, var14 / 4, var12, var8);"
  );

  for (const target of renderReferenceTargets) {
    assertIncludes(
      failures,
      "capture plugin default plan",
      captureSource,
      `${target.fileName}:${target.cycle}:${target.camera}`
    );
  }

  return { ok: failures.length === 0, failures, files };
}

async function inspectCaptureSource(sourceRoot) {
  const rootStatus = await fileStatus(sourceRoot);
  const frames = [];

  for (const target of renderReferenceTargets) {
    const pngPath = path.join(sourceRoot, target.fileName);
    const traceFileName = clientViewTraceFileName(target.fileName);
    const tracePath = path.join(sourceRoot, traceFileName);
    const png = await inspectPng(pngPath);
    const trace = await readJsonIfPresent(tracePath);
    const traceErrors = [];

    if (trace.error) {
      traceErrors.push(trace.error);
    }
    if (trace.json) {
      if (trace.json.schemaVersion !== "client-view.v1") {
        traceErrors.push("schemaVersion is not client-view.v1");
      }
      if (typeof trace.json.fixtureId !== "string" || trace.json.fixtureId.length === 0) {
        traceErrors.push("missing fixtureId");
      }
      if (!Array.isArray(trace.json.sourceAnchorIds) || !trace.json.sourceAnchorIds.includes("client-player-appearance-packet")) {
        traceErrors.push("missing client-player-appearance-packet source anchor");
      }
      traceErrors.push(...validateTraceExpectations(trace.json, target));
    }

    frames.push({
      id: target.id,
      fileName: target.fileName,
      traceFileName,
      pngPath,
      tracePath,
      png,
      traceExists: trace.status.isFile,
      traceErrors
    });
  }

  const missingPngs = frames.filter((frame) => !frame.png.exists).map((frame) => frame.fileName);
  const missingTraces = frames.filter((frame) => !frame.traceExists).map((frame) => frame.traceFileName);
  const invalid = frames.flatMap((frame) => [
    ...(frame.png.error ? [`${frame.fileName}: ${frame.png.error}`] : []),
    ...frame.traceErrors.map((error) => `${frame.traceFileName}: ${error}`)
  ]);

  return {
    rootStatus,
    frames,
    missingPngs,
    missingTraces,
    invalid,
    readyToImport: rootStatus.isDirectory && missingPngs.length === 0 && invalid.length === 0,
    readyForClientViewParity:
      rootStatus.isDirectory && missingPngs.length === 0 && missingTraces.length === 0 && invalid.length === 0
  };
}

function validateTraceExpectations(trace, target) {
  const errors = [];
  const expectations = target.traceExpectations ?? {};
  const captureCycle = clientViewTraceCaptureCycle(trace);

  if (expectations.requiredTick && !Number.isInteger(captureCycle)) {
    errors.push("missing captured client cycle");
  }

  if (expectations.requiredCameraPreset) {
    const tick = trace.ticks?.find((candidate) => candidate?.tick === captureCycle) ?? trace.ticks?.[0];
    if (tick?.camera?.yaw !== target.cameraPreset.yaw || tick?.camera?.pitch !== target.cameraPreset.pitch) {
      errors.push(`camera does not match ${target.camera} preset yaw ${target.cameraPreset.yaw} pitch ${target.cameraPreset.pitch}`);
    }
  }

  for (const anchorId of expectations.requiredSourceAnchorIds ?? []) {
    if (!trace.sourceAnchorIds?.includes(anchorId)) {
      errors.push(`missing required source anchor ${anchorId}`);
    }
  }

  for (const kind of expectations.requiredEventKinds ?? []) {
    if (!trace.events?.some((event) => event?.kind === kind)) {
      errors.push(`missing required ${kind} event`);
    }
  }

  return errors;
}

function clientViewTraceCaptureCycle(trace) {
  return trace.ticks?.find((tick) => Number.isInteger(tick?.tick))?.tick ?? null;
}

async function inspectImportedReferences(outputRoot) {
  const manifestPath = path.join(outputRoot, referenceManifestFileName);
  const manifest = await readJsonIfPresent(manifestPath);
  if (!manifest.status.isFile || manifest.error || !manifest.json) {
    return {
      manifestPath,
      exists: manifest.status.isFile,
      error: manifest.error,
      frameCount: 0,
      missingFrames: renderReferenceTargets.map((target) => target.fileName),
      missingTraces: renderReferenceTargets.map((target) => clientViewTraceFileName(target.fileName)),
      invalid: [],
      readyForRenderVerify: false
    };
  }

  const manifestFrames = Array.isArray(manifest.json.frames) ? manifest.json.frames : [];
  const missingFrames = [];
  const missingTraces = [];
  const invalid = [];

  for (const target of renderReferenceTargets) {
    const frame = manifestFrames.find((candidate) => candidate?.fileName === target.fileName);
    if (!frame) {
      missingFrames.push(target.fileName);
      continue;
    }
    if (frame.plannedCycle !== target.cycle || !Number.isInteger(frame.cycle) || frame.camera !== target.camera) {
      invalid.push(`${target.fileName}: manifest target does not match capture plan`);
    }
    if (JSON.stringify(frame.traceExpectations ?? {}) !== JSON.stringify(target.traceExpectations ?? {})) {
      invalid.push(`${target.fileName}: manifest trace expectations are stale`);
    }
    if (!(await fileStatus(path.join(outputRoot, target.fileName))).isFile) {
      missingFrames.push(target.fileName);
    }
    if (!frame.clientViewTraceFileName) {
      missingTraces.push(clientViewTraceFileName(target.fileName));
    } else if (!(await fileStatus(path.join(outputRoot, frame.clientViewTraceFileName))).isFile) {
      missingTraces.push(frame.clientViewTraceFileName);
    } else {
      const trace = await readJsonIfPresent(path.join(outputRoot, frame.clientViewTraceFileName));
      if (trace.error) {
        invalid.push(`${frame.clientViewTraceFileName}: ${trace.error}`);
      } else if (trace.json) {
        invalid.push(...validateTraceExpectations(trace.json, target).map((error) => `${frame.clientViewTraceFileName}: ${error}`));
      }
    }
  }

  return {
    manifestPath,
    exists: true,
    error: null,
    frameCount: manifestFrames.length,
    missingFrames,
    missingTraces,
    invalid,
    readyForRenderVerify:
      manifest.json.schemaVersion === 1 &&
      manifestFrames.length === renderReferenceTargets.length &&
      missingFrames.length === 0 &&
      missingTraces.length === 0 &&
      invalid.length === 0
  };
}

function buildLaunchCommands(options) {
  return [
    `cd ${options.clientRoot}`,
    `$env:KRONOS_NH_CAPTURE_DIR='${options.sourceRoot}'`,
    `$env:KRONOS_NH_CAPTURE_PLAN='${kronosClientCapturePlan}'`,
    ".\\gradlew.bat run --args='--rs=RSPS'"
  ];
}

function printHuman(report) {
  console.log("Kronos client capture preflight");
  console.log(`clientRoot: ${report.options.clientRoot}`);
  console.log(`sourceRoot: ${report.options.sourceRoot}`);
  console.log(`outputRoot: ${report.options.outputRoot}`);
  console.log(`capturePlan: ${kronosClientCapturePlan}`);
  console.log("");
  console.log(`clientBridge: ${report.clientBridge.ok ? "ok" : "blocked"}`);
  for (const failure of report.clientBridge.failures) {
    console.log(`  - ${failure}`);
  }
  console.log(`sourceCaptures: ${report.source.readyForClientViewParity ? "ready" : "missing"}`);
  if (!report.source.rootStatus.isDirectory) {
    console.log("  - source folder does not exist");
  }
  for (const fileName of report.source.missingPngs) {
    console.log(`  - missing PNG ${fileName}`);
  }
  for (const fileName of report.source.missingTraces) {
    console.log(`  - missing trace ${fileName}`);
  }
  for (const error of report.source.invalid) {
    console.log(`  - invalid ${error}`);
  }
  console.log(`importedReferences: ${report.imported.readyForRenderVerify ? "ready" : "missing"}`);
  if (!report.imported.exists) {
    console.log("  - manifest is missing");
  }
  if (report.imported.error) {
    console.log(`  - manifest error ${report.imported.error}`);
  }
  for (const fileName of report.imported.missingFrames) {
    console.log(`  - missing imported PNG ${fileName}`);
  }
  for (const fileName of report.imported.missingTraces) {
    console.log(`  - missing imported trace ${fileName}`);
  }
  for (const error of report.imported.invalid) {
    console.log(`  - invalid imported ${error}`);
  }
  console.log("");
  console.log("Launch command for the real client capture hook:");
  for (const command of report.launchCommands) {
    console.log(`  ${command}`);
  }
  console.log("");
  console.log("Import and verify after the client writes the captures:");
  console.log(`  npm run capture:client -- --source ${report.options.sourceRoot}`);
  console.log("  npm run verify:render");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const [clientBridge, source, imported] = await Promise.all([
    validateClientBridge(options.clientRoot),
    inspectCaptureSource(options.sourceRoot),
    inspectImportedReferences(options.outputRoot)
  ]);

  const report = {
    options,
    capturePlan: kronosClientCapturePlan,
    clientBridge,
    source,
    imported,
    launchCommands: buildLaunchCommands(options)
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  if (!clientBridge.ok || (options.requireCaptures && !source.readyForClientViewParity)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
