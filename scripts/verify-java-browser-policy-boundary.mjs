import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kronosRoot = path.resolve(projectRoot, "..");
const serverRoot = path.join(
  kronosRoot,
  "kronos-osrs-184-master",
  "kronos-osrs-184-master",
  "Kronos-master",
  "kronos-server"
);
const defaultPolicyPath = path.join(projectRoot, "fixtures", "ai", "nh-neural-policy-dmm-current.json");
const defaultJavaTracePath = path.join(
  serverRoot,
  "data",
  "ai",
  "diagnostics",
  "current-direct-prayer-head-trace-t180-20260803.jsonl"
);
const javaModelSource = path.join(
  serverRoot,
  "src",
  "main",
  "java",
  "io",
  "ruin",
  "model",
  "entity",
  "player",
  "ai",
  "NhNeuralPolicyModel.java"
);
const javaProbeSource = path.join(
  serverRoot,
  "tools",
  "nh-gpu-trainer",
  "java",
  "io",
  "ruin",
  "model",
  "entity",
  "player",
  "ai",
  "NhPolicyModelProbe.java"
);
const javaProbeClass = "io.ruin.model.entity.player.ai.NhPolicyModelProbe";
const defaultCorrettoHome = "C:\\Program Files\\Amazon Corretto\\jdk11.0.25_9";

const rawInputNames = Object.freeze([
  "distance",
  "selfHp",
  "opponentHp",
  "selfPrayer",
  "foodCount",
  "brewCount",
  "restoreCount",
  "reboostCount",
  "canAttack",
  "selfAttackReady",
  "canSpecSingle",
  "canSpecDouble",
  "selfFrozen",
  "opponentFrozen",
  "selfFreezeTicks",
  "opponentFreezeTicks",
  "selfMoving",
  "opponentMoving",
  "selfAteFoodLastTick",
  "selfDrankPotionLastTick",
  "rewardDelta",
  "rewardDps",
  "rewardTotal",
  "selfLastDealtHit",
  "selfLastTakenHit",
  "selfSpecialEnergy",
  "selfSpecialActive",
  "selfMoveDx",
  "selfMoveDy",
  "opponentMoveDx",
  "opponentMoveDy",
  "targetRelDx",
  "targetRelDy",
  "targetPresent",
  "selfWeaponStyleMagic",
  "selfWeaponStyleRanged",
  "selfWeaponStyleMelee",
  "currentOffenceStyleMagic",
  "currentOffenceStyleRanged",
  "currentOffenceStyleMelee",
  "scriptedOffenceStyleMagic",
  "scriptedOffenceStyleRanged",
  "scriptedOffenceStyleMelee",
  "opponentLikelyStyleMagic",
  "opponentLikelyStyleRanged",
  "opponentLikelyStyleMelee",
  "opponentGearStyleMagic",
  "opponentGearStyleRanged",
  "opponentGearStyleMelee",
  "selfProtectMagic",
  "selfProtectRanged",
  "selfProtectMelee",
  "opponentProtectMagic",
  "opponentProtectRanged",
  "opponentProtectMelee",
  "selfWeaponSin",
  "selfWeaponCos",
  "opponentWeaponSin",
  "opponentWeaponCos",
  "opponentSpecialEnergy",
  "rewardEpisodeActive",
  "attackRatio",
  "strengthRatio",
  "defenceRatio",
  "rangedRatio",
  "magicRatio",
  "attackDeficit",
  "strengthDeficit",
  "defenceDeficit",
  "rangedDeficit",
  "magicDeficit",
  "selfMeleeReachable",
  "opponentMeleeReachable",
  "gmaulSingleKoChance",
  "gmaulDoubleKoChance",
  "gmaulSingleSetupScore",
  "gmaulDoubleSetupScore",
  "selfMagicDefence",
  "selfRangedDefence",
  "selfMeleeDefence",
  "selfMagicDefenceGain",
  "selfRangedDefenceGain",
  "selfMeleeDefenceGain",
  "opponentMagicWeakness",
  "opponentRangedWeakness",
  "opponentMeleeWeakness",
  "visibleStyleMatchRate",
  "visibleStyleMismatchRate",
  "visibleStyleConfidence",
  "visibleStyleLastOutcome",
  "opponentVengeanceTrinketRecent",
  "opponentVengeanceTrinketCasts",
  "selfGmaulSpecsUsed",
  "selfVoidwakerSpecsUsed",
  "selfVlsSpecsUsed",
  "lastSpecNone",
  "lastSpecGmaul",
  "lastSpecVoidwaker",
  "lastSpecVls",
  "lastSpecOther",
  "previousSpecNone",
  "previousSpecGmaul",
  "previousSpecVoidwaker",
  "previousSpecVls",
  "previousSpecOther",
  "ticksSinceLastSpec",
  "currentSpecEnergyDuplicate",
  "selfInventoryFreeSlots",
  "selfShieldEquipped",
  "selfCanEquipTwoHanded",
  "opponentTicksSinceObservedAttack",
  "selfAttackDelayRemaining",
  "selfClientSpecControl",
  "selfOptionalVlsSetupPending"
]);

if (rawInputNames.length !== 114) {
  throw new Error(`Verifier field-name table has ${rawInputNames.length} entries, expected 114.`);
}

const args = parseArgs(process.argv.slice(2));
const policyPath = path.resolve(args.policyPath ?? defaultPolicyPath);
const javaTracePath = path.resolve(args.javaTracePath ?? defaultJavaTracePath);
const browserTracePath = args.browserTracePath ? path.resolve(args.browserTracePath) : null;
const casesRequested = positiveInteger(args.cases ?? "6", "--cases");
const scoreTolerance = nonNegativeNumber(args.atol ?? "0.00005", "--atol");
const normalizedTolerance = nonNegativeNumber(args.normalizedAtol ?? "0.00001", "--normalized-atol");

requireFile(policyPath, "policy JSON");
requireFile(javaTracePath, "Java trace");
if (browserTracePath) {
  requireFile(browserTracePath, "browser trace");
}

const artifact = JSON.parse(readFileSync(policyPath, "utf8"));
const schema = artifact?.schema ?? {};
assert(schema.inputSize === 114, `Policy input size ${schema.inputSize} != 114.`);
assert(schema.actionCount === 86, `Policy action count ${schema.actionCount} != 86.`);
assert(Array.isArray(schema.actionIds) && schema.actionIds.length === 86, "Policy must contain 86 explicit action IDs.");
assert(String(artifact?.source?.checkpoint ?? "").toLowerCase().includes("teacher165"),
  "Default/current policy is not identified as Teacher165 by source.checkpoint.");

const {
  botPolicy,
  conditionedPolicyModule,
  policyBridge,
  nhDuel,
  nhGearProfile,
  nhLoadouts
} = loadBrowserPolicyModules();
const parsedPolicy = botPolicy.parseNhNeuralPolicyJson(readFileSync(policyPath, "utf8"), policyPath);
assert(parsedPolicy.inputSize === 114 && parsedPolicy.actionCount === 86, "Browser parser loaded the wrong policy schema.");
assert(parsedPolicy.conditionedV10, "Teacher165 policy did not load its conditioned-v10 logic.");
const actionIds = Array.from(parsedPolicy.actionIds ?? []);
assert(actionIds.length === 86, "Browser parser did not retain all explicit action IDs.");

const javaRecords = readJsonLines(javaTracePath).map((record, index) => normalizeJavaRecord(record, index));
const selectedJavaRecords = selectRepresentativeRecords(javaRecords, casesRequested);
const browserRecords = browserTracePath ? readJsonLines(browserTracePath) : null;
const pairedBrowserRecords = browserRecords
  ? pairBrowserRecords(selectedJavaRecords, browserRecords)
  : null;

const javaHome = args.javaHome
  ? path.resolve(args.javaHome)
  : existsSync(defaultCorrettoHome)
    ? defaultCorrettoHome
    : null;
const javac = resolveJavaTool("javac", javaHome);
const java = resolveJavaTool("java", javaHome);
const gsonJar = resolveGsonJar(args.gsonJar ? path.resolve(args.gsonJar) : null);
const temporary = mkdtempSync(path.join(os.tmpdir(), "nh-java-browser-boundary-"));

const report = {
  schema: "kronos.nh.java-browser-policy-boundary-parity.v1",
  pass: false,
  mode: browserTracePath ? "paired-trace-plus-snapshot-replay" : "java-snapshot-replay",
  independentSeededFightParityClaimed: false,
  modeExplanation: browserTracePath
    ? "Compares paired Java/browser boundary traces, then replays each canonical snapshot through the Java probe."
    : "Uses real Java fight snapshots as canonical inputs and replays them through current browser inference and the Java model probe. Browser and Java fight RNGs are not claimed to match.",
  policyPath,
  policySha256: sha256(policyPath),
  javaTracePath,
  javaTraceSha256: sha256(javaTracePath),
  browserTracePath,
  browserTraceSha256: browserTracePath ? sha256(browserTracePath) : null,
  rawInputFields: rawInputNames.length,
  attackHistoryCodes: 3,
  ownPrayerHistoryCodes: 2,
  priorStateLags: 16,
  priorStateFieldsPerLag: 114,
  actionCount: actionIds.length,
  scoreTolerance,
  normalizedTolerance,
  limitations: [
    "This is a policy-boundary snapshot/replay gate, not an independently seeded simulator-fight equivalence claim.",
    "The live controller case exercises browser observation construction and then asks Java to score that emitted snapshot; it does not prove the Java observation encoder would construct the same raw114 from an independently simulated fight.",
    "Without --browser-trace, retained Java cases start at Java-supplied raw114/history. True cross-simulator observation-construction comparison requires a paired browser boundary trace.",
    "The retained Java trace exposes only defence-channel legality, so full 86-action legality is compared only when a browser trace supplies it.",
    "NhPolicyModelProbe scores the neural model and conditioned-v10 heads before the separate runtime direct-gear conditioner and channel resolver.",
    "When a browser trace is supplied, its post-direct-gear scores are checked against the Java probe only on non-direct-gear rows; selected runtime actions are mapping-validated but not falsely equated to an unmasked model argmax."
  ],
  browserControllerTraceCase: null,
  cases: []
};

try {
  const classes = path.join(temporary, "classes");
  compileJavaProbe(javac, gsonJar, classes);
  const classpath = `${classes}${path.delimiter}${gsonJar}`;

  const controllerTrace = captureBrowserControllerTrace(parsedPolicy, {
    botPolicy,
    conditionedPolicyModule,
    policyBridge,
    nhDuel,
    nhGearProfile,
    nhLoadouts
  });
  const controllerCanonical = canonicalFromBrowserControllerTrace(controllerTrace, artifact, actionIds);
  const controllerReplay = replayInBrowser(parsedPolicy, controllerCanonical, {
    botPolicy,
    conditionedPolicyModule,
    policyBridge
  });
  compareExactVector(
    controllerCanonical.state114,
    controllerTrace.rawInput,
    (index) => `raw114[${index}] ${rawInputNames[index]}`,
    controllerTrace.tick
  );
  compareIntegerVector(
    controllerCanonical.attackHistoryCodes,
    controllerTrace.attackHistoryCodes,
    (index) => `attackHistoryCodes[${index}]`,
    controllerTrace.tick
  );
  compareIntegerVector(
    controllerCanonical.ownPrayerHistoryCodes,
    controllerTrace.ownPrayerHistoryCodes,
    (index) => `ownPrayerHistoryCodes[${index}]`,
    controllerTrace.tick
  );
  compareNumericVector(
    controllerReplay.normalizedInput,
    controllerTrace.normalizedInput,
    normalizedTolerance,
    (index) => `normalized114[${index}] ${rawInputNames[index]}`,
    controllerTrace.tick
  );
  comparePriorStates(
    parsedPolicy,
    controllerCanonical,
    controllerTrace.priorNormalizedInputsNewestFirst,
    normalizedTolerance,
    controllerTrace.tick
  );
  compareDefenceLegality(controllerCanonical, controllerTrace.legalActions, actionIds, controllerTrace.tick);
  const controllerJavaScores = runJavaProbe({
    java,
    classpath,
    policyPath,
    actionIds,
    canonical: controllerCanonical,
    temporary,
    caseIndex: "browser-controller"
  });
  compareNumericVector(
    controllerJavaScores,
    controllerReplay.finalScores,
    scoreTolerance,
    (index) => `finalScore[modelRow=${index},actionId=${actionIds[index]}]`,
    controllerTrace.tick
  );
  let controllerRuntimeScoreRowsCompared = 0;
  for (let modelRow = 0; modelRow < actionIds.length; modelRow += 1) {
    if (policyBridge.isNhDirectGearActionId(actionIds[modelRow])) {
      continue;
    }
    const delta = Math.abs(controllerTrace.finalScores[modelRow] - controllerReplay.finalScores[modelRow]);
    if (!Number.isFinite(delta) || delta > scoreTolerance) {
      mismatch(
        controllerTrace.tick,
        `controllerTrace.finalScore[modelRow=${modelRow},actionId=${actionIds[modelRow]}]`,
        controllerReplay.finalScores[modelRow],
        controllerTrace.finalScores[modelRow],
        `|delta|=${delta}, atol=${scoreTolerance}`
      );
    }
    controllerRuntimeScoreRowsCompared += 1;
  }
  report.browserControllerTraceCase = {
    tick: controllerTrace.tick,
    rewardEpisodeId: controllerTrace.rewardEpisodeId,
    traceExplicitlyEnabled: true,
    opponentVengeanceTrinketRecent: controllerTrace.rawInput[90],
    opponentVengeanceTrinketCasts: controllerTrace.rawInput[91],
    selfGmaulSpecsUsed: controllerTrace.rawInput[92],
    selfVoidwakerSpecsUsed: controllerTrace.rawInput[93],
    selfVlsSpecsUsed: controllerTrace.rawInput[94],
    legalActions: controllerTrace.legalActions.length,
    selectedActionId: controllerTrace.selectedActionId,
    selectedModelRow: controllerTrace.selectedModelRow,
    runtimeScoreRowsCompared: controllerRuntimeScoreRowsCompared,
    maxAbsoluteJavaReplayScoreDelta: maxAbsoluteDelta(controllerJavaScores, controllerReplay.finalScores)
  };

  for (let caseIndex = 0; caseIndex < selectedJavaRecords.length; caseIndex += 1) {
    const canonical = selectedJavaRecords[caseIndex];
    const pairedBrowser = pairedBrowserRecords?.[caseIndex] ?? null;
    const tickLabel = canonical.tick ?? `record-${canonical.sourceIndex}`;
    const browserReplay = replayInBrowser(parsedPolicy, canonical, {
      botPolicy,
      conditionedPolicyModule,
      policyBridge
    });

    compareExactVector(
      canonical.state114,
      pairedBrowser?.rawInput ?? browserReplay.rawInput,
      (index) => `raw114[${index}] ${rawInputNames[index]}`,
      tickLabel
    );
    compareIntegerVector(
      canonical.attackHistoryCodes,
      pairedBrowser?.attackHistoryCodes ?? browserReplay.attackHistoryCodes,
      (index) => `attackHistoryCodes[${index}]`,
      tickLabel
    );
    compareIntegerVector(
      canonical.ownPrayerHistoryCodes,
      pairedBrowser?.ownPrayerHistoryCodes ?? browserReplay.ownPrayerHistoryCodes,
      (index) => `ownPrayerHistoryCodes[${index}]`,
      tickLabel
    );

    const expectedCurrentNormalized = normalizeForBrowser(parsedPolicy, canonical.state114);
    compareNumericVector(
      expectedCurrentNormalized,
      pairedBrowser?.normalizedInput ?? browserReplay.normalizedInput,
      normalizedTolerance,
      (index) => `normalized114[${index}] ${rawInputNames[index]}`,
      tickLabel
    );

    const actualPrior = pairedBrowser?.priorNormalizedInputsNewestFirst ?? browserReplay.priorNormalizedInputsNewestFirst;
    comparePriorStates(parsedPolicy, canonical, actualPrior, normalizedTolerance, tickLabel);
    compareDefenceLegality(canonical, pairedBrowser?.legalActions ?? null, actionIds, tickLabel);

    const javaScores = runJavaProbe({
      java,
      classpath,
      policyPath,
      actionIds,
      canonical,
      temporary,
      caseIndex
    });
    const browserScores = browserReplay.finalScores;
    compareNumericVector(
      javaScores,
      browserScores,
      scoreTolerance,
      (index) => `finalScore[modelRow=${index},actionId=${actionIds[index]}]`,
      tickLabel
    );
    let pairedBrowserScoreRowsCompared = 0;
    if (pairedBrowser) {
      for (let modelRow = 0; modelRow < actionIds.length; modelRow += 1) {
        if (policyBridge.isNhDirectGearActionId(actionIds[modelRow])) {
          continue;
        }
        const delta = Math.abs(pairedBrowser.finalScores[modelRow] - browserReplay.finalScores[modelRow]);
        if (!Number.isFinite(delta) || delta > scoreTolerance) {
          mismatch(
            tickLabel,
            `pairedBrowserFinalScore[modelRow=${modelRow},actionId=${actionIds[modelRow]}]`,
            browserReplay.finalScores[modelRow],
            pairedBrowser.finalScores[modelRow],
            `|delta|=${delta}, atol=${scoreTolerance}`
          );
        }
        pairedBrowserScoreRowsCompared += 1;
      }
    }

    const javaGlobalRow = argmax(javaScores);
    const browserGlobalRow = argmax(browserScores);
    if (javaGlobalRow !== browserGlobalRow) {
      mismatch(tickLabel, "unmaskedModelArgmax", actionIds[javaGlobalRow], actionIds[browserGlobalRow]);
    }
    const legalDefenceRows = canonical.legalDefenceActionIds.map((actionId) => actionIds.indexOf(actionId));
    const javaDefenceRow = argmaxSubset(javaScores, legalDefenceRows);
    const browserDefenceRow = argmaxSubset(browserScores, legalDefenceRows);
    if (javaDefenceRow !== browserDefenceRow) {
      mismatch(tickLabel, "legalDefenceArgmax", actionIds[javaDefenceRow], actionIds[browserDefenceRow]);
    }
    if (pairedBrowser?.selectedModelRow !== null && pairedBrowser?.selectedModelRow !== undefined) {
      const selected = pairedBrowser.selectedModelRow;
      assert(selected >= 0 && selected < actionIds.length,
        `tick=${tickLabel} browser selectedModelRow ${selected} is outside 0..${actionIds.length - 1}.`);
      assert(actionIds[selected] === pairedBrowser.selectedActionId,
        `tick=${tickLabel} selected action/model-row mapping disagrees: row ${selected} maps to ${actionIds[selected]}, trace says ${pairedBrowser.selectedActionId}.`);
    }

    report.cases.push({
      sourceIndex: canonical.sourceIndex,
      tick: canonical.tick,
      episodeId: canonical.episodeId,
      episodeTick: canonical.episodeTick,
      validPriorStates: canonical.priorStateValid.filter((value) => value === 1).length,
      opponentVengeanceTrinketRecent: canonical.state114[90],
      opponentVengeanceTrinketCasts: canonical.state114[91],
      selfGmaulSpecsUsed: canonical.state114[92],
      selfVoidwakerSpecsUsed: canonical.state114[93],
      selfVlsSpecsUsed: canonical.state114[94],
      selfOptionalVlsSetupPending: canonical.state114[113],
      legalDefenceActionIds: canonical.legalDefenceActionIds,
      legalDefenceModelRows: legalDefenceRows,
      javaUnmaskedArgmaxActionId: actionIds[javaGlobalRow],
      browserUnmaskedArgmaxActionId: actionIds[browserGlobalRow],
      javaLegalDefenceArgmaxActionId: actionIds[javaDefenceRow],
      browserLegalDefenceArgmaxActionId: actionIds[browserDefenceRow],
      pairedBrowserScoreRowsCompared,
      maxAbsoluteScoreDelta: maxAbsoluteDelta(javaScores, browserScores)
    });
  }

  report.pass = true;
  if (args.reportPath) {
    const reportPath = path.resolve(args.reportPath);
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  const maxScoreDelta = Math.max(
    report.browserControllerTraceCase.maxAbsoluteJavaReplayScoreDelta,
    ...report.cases.map((entry) => entry.maxAbsoluteScoreDelta)
  );
  const normalizedPriorComparisons = report.cases.reduce(
    (total, entry) => total + entry.validPriorStates * 114,
    0
  );
  console.log("PASS Java/browser Teacher165 policy-boundary parity");
  console.log(`Mode: ${report.mode} (not an independent seeded-fight RNG claim)`);
  console.log(`Live browser controller trace: tick ${report.browserControllerTraceCase.tick}, explicitly enabled, ${report.browserControllerTraceCase.legalActions} legal actions`);
  console.log("Construction scope: one live browser observation is exercised; retained Java cases start from Java-supplied raw114. Use --browser-trace for true paired encoder-output comparison.");
  console.log(`Cases: ${report.cases.length}; ticks: ${report.cases.map((entry) => entry.tick).join(", ")}`);
  console.log(`Exact observed values/history/validity: ${(report.cases.length + 1) * (114 + 3 + 2 + 16)} checks; normalized prior values: ${normalizedPriorComparisons}`);
  console.log(`Scores: ${(report.cases.length + 1) * 86} Java/browser comparisons; max |delta|=${maxScoreDelta.toExponential(3)}`);
  console.log("Java trace contains defence-channel legality only; the gate does not invent a full Java legal mask or a runtime composite action.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--help" || value === "-h") {
      printHelp();
      process.exit(0);
    }
    const mapping = {
      "--policy": "policyPath",
      "--java-trace": "javaTracePath",
      "--browser-trace": "browserTracePath",
      "--cases": "cases",
      "--atol": "atol",
      "--normalized-atol": "normalizedAtol",
      "--java-home": "javaHome",
      "--gson-jar": "gsonJar",
      "--report": "reportPath"
    };
    const key = mapping[value];
    if (!key) {
      throw new Error(`Unknown argument: ${value}`);
    }
    const next = values[index + 1];
    if (next === undefined) {
      throw new Error(`${value} requires a value.`);
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/verify-java-browser-policy-boundary.mjs [options]

Options:
  --policy <json>             Current conditioned policy (default: Teacher165 browser fixture)
  --java-trace <jsonl>        Canonical Java observation trace
  --browser-trace <jsonl>     Optional independently captured browser boundary trace
  --cases <count>             Representative snapshots to replay (default: 6)
  --atol <number>             Final-score tolerance (default: 5e-5)
  --normalized-atol <number>  Normalized-input tolerance (default: 1e-5)
  --java-home <directory>     JDK home; defaults to known Corretto 11 when present
  --gson-jar <jar>            Gson jar; defaults to installed server library
  --report <json>             Optional detailed JSON report

This gate is snapshot/replay-driven. It does not claim Java and browser simulator RNGs are identical.`);
}

function loadBrowserPolicyModules() {
  const moduleCache = new Map();
  const policySourcePath = path.normalize(path.join(projectRoot, "src", "bot", "policy.ts"));

  function loadAbsoluteModule(sourcePath) {
    const resolved = path.normalize(sourcePath);
    const cached = moduleCache.get(resolved);
    if (cached) {
      return cached.exports;
    }
    if (resolved.endsWith(".json")) {
      const module = { exports: JSON.parse(readFileSync(resolved, "utf8")) };
      moduleCache.set(resolved, module);
      return module.exports;
    }
    let source = readFileSync(resolved, "utf8");
    if (resolved === policySourcePath) {
      source += `\nexport const __parityNormalizeNhNeuralInput = normalizeNhNeuralInput;\n`;
      source += `export const __parityRunNhNeuralEncoder = runNhNeuralEncoder;\n`;
      source += `export const __parityNeuralPolicyActionScore = neuralPolicyActionScore;\n`;
    }
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        strict: true,
        jsx: ts.JsxEmit.ReactJSX,
        resolveJsonModule: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      },
      fileName: resolved
    }).outputText;
    const module = { exports: {} };
    moduleCache.set(resolved, module);
    const localRequire = (request) => {
      if (request.startsWith(".")) {
        return loadAbsoluteModule(resolveRelativeModule(resolved, request));
      }
      return require(request);
    };
    vm.runInNewContext(
      transpiled,
      {
        module,
        exports: module.exports,
        require: localRequire,
        console,
        structuredClone,
        setTimeout,
        clearTimeout
      },
      { filename: resolved }
    );
    return module.exports;
  }

  return {
    botPolicy: loadAbsoluteModule(policySourcePath),
    conditionedPolicyModule: loadAbsoluteModule(path.join(projectRoot, "src", "bot", "conditioned-policy-v10.ts")),
    policyBridge: loadAbsoluteModule(path.join(projectRoot, "src", "sim", "nh", "policy-bridge.ts")),
    nhDuel: loadAbsoluteModule(path.join(projectRoot, "src", "sim", "nh", "duel.ts")),
    nhGearProfile: loadAbsoluteModule(path.join(projectRoot, "src", "sim", "nh", "gearProfile.ts")),
    nhLoadouts: loadAbsoluteModule(path.join(projectRoot, "src", "sim", "nh", "loadouts.ts"))
  };
}

function resolveRelativeModule(parentPath, request) {
  const requested = path.resolve(path.dirname(parentPath), request);
  const candidates = requested.endsWith(".ts") || requested.endsWith(".tsx") || requested.endsWith(".json")
    ? [requested]
    : [
        `${requested}.ts`,
        `${requested}.tsx`,
        `${requested}.json`,
        path.join(requested, "index.ts"),
        path.join(requested, "index.tsx")
      ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

function replayInBrowser(policy, canonical, modules) {
  const features = Array(modules.policyBridge.nhPolicyFeatureSize).fill(0);
  for (let index = 0; index < canonical.state114.length; index += 1) {
    features[modules.policyBridge.nhPolicyReservoirSize + index] = canonical.state114[index];
  }
  features[features.length - 1] = 1;
  const normalizedInput = modules.botPolicy.__parityNormalizeNhNeuralInput(policy, features);
  const encoded = modules.botPolicy.__parityRunNhNeuralEncoder(policy, normalizedInput);
  const baseScores = Array.from(
    { length: policy.actionCount },
    (_, modelRow) => modules.botPolicy.__parityNeuralPolicyActionScore(policy, modelRow, encoded)
  );
  const priorNormalizedInputs = [];
  const priorNormalizedInputsNewestFirst = [];
  for (let lag = 0; lag < 16; lag += 1) {
    const valid = canonical.priorStateValid[lag] === 1;
    const normalized = valid ? normalizeForBrowser(policy, canonical.priorState114[lag]) : null;
    if (normalized) {
      priorNormalizedInputs.push(normalized);
    }
    priorNormalizedInputsNewestFirst.push({
      valid,
      normalizedInput: normalized ? Array.from(normalized) : null
    });
  }
  const allModelRows = new Set(Array.from({ length: policy.actionCount }, (_, index) => index));
  const finalScores = modules.conditionedPolicyModule.applyNhConditionedPolicyV10Scores({
    conditioned: policy.conditionedV10,
    baseScores,
    normalizedInput,
    encoded,
    inputMean: policy.inputMean,
    inputStd: policy.inputStd,
    attackHistoryCodes: canonical.attackHistoryCodes,
    ownPrayerHistoryCodes: canonical.ownPrayerHistoryCodes,
    priorNormalizedInputs,
    legalModelActions: allModelRows
  });
  return {
    rawInput: Array.from({ length: 114 }, (_, index) => features[modules.policyBridge.nhPolicyReservoirSize + index]),
    normalizedInput: Array.from(normalizedInput),
    attackHistoryCodes: [...canonical.attackHistoryCodes],
    ownPrayerHistoryCodes: [...canonical.ownPrayerHistoryCodes],
    priorNormalizedInputsNewestFirst,
    finalScores
  };
}

function captureBrowserControllerTrace(policy, modules) {
  const tick = 32;
  const state = modules.nhDuel.createInitialNhDuelState(0x42524f57);
  const equipment = modules.nhLoadouts.nhLoadouts["noxious-halberd"].equipment;
  const gearProfile = modules.nhGearProfile.inferNhSelectedGearProfile({
    equipment,
    inventoryItems: Object.values(equipment)
  });
  const self = {
    ...state.actors.self,
    tile: { x: 0, y: 0, plane: 0 },
    loadoutId: "noxious-halberd",
    weaponId: "noxious_halberd",
    previousWeaponId: "noxious_halberd",
    equipment,
    gearProfile,
    gmaul: {
      ...state.actors.self.gmaul,
      specialEnergy: 0
    },
    gmaulSpecsUsed: 1,
    voidwakerSpecsUsed: 2,
    vlsSpecsUsed: 3,
    lastSpecKind: "voidwaker",
    previousSpecKind: "vesta_longsword",
    lastSpecTick: tick - 3
  };
  const opponent = {
    ...state.actors.opponent,
    tile: { x: 4, y: 0, plane: 0 },
    observedInfoKnown: true,
    lastVengeanceTrinketCastTick: tick - 5,
    vengeanceTrinketCasts: 8,
    lastOffenceStyle: "ranged",
    lastVisibleOpponentStyle: "ranged",
    attackTimer: {
      ...state.actors.opponent.attackTimer,
      lastAttackTick: tick - 4,
      weaponCooldownTicks: 4
    }
  };
  const context = {
    ...modules.nhDuel.createNhDuelControllerContext(tick, self, opponent),
    rewardEpisodeActive: true,
    rewardEpisodeId: 4242
  };
  const controller = modules.botPolicy.createNhPolicyController(policy);
  assert(typeof controller.setDecisionTraceEnabled === "function",
    "Browser policy controller does not expose opt-in decision tracing.");
  controller.setDecisionTraceEnabled(true);
  controller.chooseAction(context);
  const trace = controller.getLastDecisionTrace();
  assert(trace, "Browser policy controller did not publish a trace after tracing was explicitly enabled.");
  const normalized = normalizeBrowserRecord(trace, -1);
  assert(normalized.tick === tick, `Browser controller trace tick ${normalized.tick} != ${tick}.`);
  assert(trace.rewardEpisodeId === 4242,
    `Browser controller trace rewardEpisodeId ${trace.rewardEpisodeId} != 4242.`);
  assert(normalized.rawInput[90] > 0 && normalized.rawInput[91] === 1,
    "Browser controller trace did not expose the injected Vengeance recency/count state.");
  assert(normalized.rawInput[92] === 0.25 && normalized.rawInput[93] === 0.5 && normalized.rawInput[94] === 0.75,
    "Browser controller trace did not expose the injected special-attack counters.");
  return {
    ...normalized,
    rewardEpisodeId: trace.rewardEpisodeId
  };
}

function canonicalFromBrowserControllerTrace(trace, sourceArtifact, actionIds) {
  assert(trace.priorNormalizedInputsNewestFirst.every((entry) => entry.valid === false),
    "One-tick browser controller probe unexpectedly contains prior-state history.");
  const protectionPrayerActionIds = finiteVector(
    sourceArtifact?.defencePrayerHead?.actionIds,
    3,
    "Teacher165 defencePrayerHead.actionIds"
  ).map((value, index) => {
    assert(Number.isInteger(value), `Teacher165 defencePrayerHead.actionIds[${index}] must be an integer.`);
    return value;
  });
  const protectionSet = new Set(protectionPrayerActionIds);
  const legalDefenceActionIds = trace.legalActions
    .filter((entry) => protectionSet.has(entry.actionId))
    .map((entry) => entry.actionId);
  assert(legalDefenceActionIds.length > 0, "Browser controller probe exposes no legal protection prayer.");
  for (const entry of trace.legalActions) {
    assert(actionIds[entry.modelRow] === entry.actionId,
      `Browser controller legal row ${entry.modelRow} maps to ${actionIds[entry.modelRow]}, trace says ${entry.actionId}.`);
  }
  return {
    sourceIndex: -1,
    tick: trace.tick,
    episodeId: trace.rewardEpisodeId,
    episodeTick: 0,
    state114: [...trace.rawInput],
    attackHistoryCodes: [...trace.attackHistoryCodes],
    ownPrayerHistoryCodes: [...trace.ownPrayerHistoryCodes],
    priorState114: Array.from({ length: 16 }, () => Array(114).fill(0)),
    priorStateValid: Array(16).fill(0),
    protectionPrayerActionIds,
    legalDefenceActionIds
  };
}

function normalizeForBrowser(policy, raw) {
  const normalized = new Float32Array(114);
  for (let index = 0; index < 114; index += 1) {
    const std = policy.inputStd[index];
    normalized[index] = (raw[index] - policy.inputMean[index]) /
      (Number.isFinite(std) && Math.abs(std) > 1e-8 ? std : 1);
  }
  return normalized;
}

function normalizeJavaRecord(record, sourceIndex) {
  const state114 = finiteVector(record.state114, 114, `Java trace record ${sourceIndex}.state114`);
  const attackHistoryCodes = integerVector(record.attackHistoryCodes, 3, 0, 3,
    `Java trace record ${sourceIndex}.attackHistoryCodes`);
  const ownPrayerHistoryCodes = integerVector(record.ownPrayerHistoryCodes, 2, 0, 3,
    `Java trace record ${sourceIndex}.ownPrayerHistoryCodes`);
  assert(Array.isArray(record.priorState114) && record.priorState114.length === 16,
    `Java trace record ${sourceIndex}.priorState114 must have 16 entries.`);
  const priorState114 = record.priorState114.map((value, lag) =>
    finiteVector(value, 114, `Java trace record ${sourceIndex}.priorState114[${lag}]`));
  const priorStateValid = integerVector(record.priorStateValid, 16, 0, 1,
    `Java trace record ${sourceIndex}.priorStateValid`);
  validateContiguousValidity(priorStateValid, `Java trace record ${sourceIndex}.priorStateValid`);
  const protectionPrayerActionIds = integerVector(record.protectionPrayerActionIds, 3, 0, Number.MAX_SAFE_INTEGER,
    `Java trace record ${sourceIndex}.protectionPrayerActionIds`);
  const legalDefenceActionIds = integerVector(record.legalDefenceActionIds, record.legalDefenceActionIds?.length ?? -1,
    0, Number.MAX_SAFE_INTEGER, `Java trace record ${sourceIndex}.legalDefenceActionIds`);
  assert(legalDefenceActionIds.length > 0, `Java trace record ${sourceIndex} has no legal defence actions.`);
  return {
    sourceIndex,
    tick: Number.isFinite(record.tick) ? record.tick : null,
    episodeId: Number.isFinite(record.episodeId) ? record.episodeId : null,
    episodeTick: Number.isFinite(record.episodeTick) ? record.episodeTick : null,
    state114,
    attackHistoryCodes,
    ownPrayerHistoryCodes,
    priorState114,
    priorStateValid,
    protectionPrayerActionIds,
    legalDefenceActionIds
  };
}

function normalizeBrowserRecord(record, sourceIndex) {
  const rawInput = finiteVector(record.rawInput ?? record.state114, 114,
    `Browser trace record ${sourceIndex}.rawInput`);
  const normalizedInput = finiteVector(record.normalizedInput, 114,
    `Browser trace record ${sourceIndex}.normalizedInput`);
  const attackHistoryCodes = integerVector(record.attackHistoryCodes, 3, 0, 3,
    `Browser trace record ${sourceIndex}.attackHistoryCodes`);
  const ownPrayerHistoryCodes = integerVector(record.ownPrayerHistoryCodes, 2, 0, 3,
    `Browser trace record ${sourceIndex}.ownPrayerHistoryCodes`);
  assert(Array.isArray(record.priorNormalizedInputsNewestFirst) && record.priorNormalizedInputsNewestFirst.length === 16,
    `Browser trace record ${sourceIndex}.priorNormalizedInputsNewestFirst must have 16 entries.`);
  const priorNormalizedInputsNewestFirst = record.priorNormalizedInputsNewestFirst.map((entry, lag) => {
    const valid = entry?.valid === true || entry?.valid === 1;
    const normalized = valid
      ? finiteVector(entry.normalizedInput, 114,
          `Browser trace record ${sourceIndex}.priorNormalizedInputsNewestFirst[${lag}].normalizedInput`)
      : null;
    assert(valid || entry?.normalizedInput === null || entry?.normalizedInput === undefined,
      `Browser trace record ${sourceIndex} invalid prior lag ${lag} is not zero/empty padding.`);
    return { valid, normalizedInput: normalized };
  });
  validateContiguousValidity(
    priorNormalizedInputsNewestFirst.map((entry) => entry.valid ? 1 : 0),
    `Browser trace record ${sourceIndex} prior validity`
  );
  const legalActions = Array.isArray(record.legalActions)
    ? record.legalActions.map((entry, index) => ({
        actionId: exactInteger(entry?.actionId, `Browser trace record ${sourceIndex}.legalActions[${index}].actionId`),
        modelRow: exactInteger(entry?.modelRow, `Browser trace record ${sourceIndex}.legalActions[${index}].modelRow`)
      }))
    : [];
  const finalScores = finiteVector(record.finalScores, 86,
    `Browser trace record ${sourceIndex}.finalScores`);
  return {
    sourceIndex,
    tick: Number.isFinite(record.tick) ? record.tick : null,
    botIndex: Number.isFinite(record.botIndex) ? record.botIndex : null,
    rawInput,
    normalizedInput,
    attackHistoryCodes,
    ownPrayerHistoryCodes,
    priorNormalizedInputsNewestFirst,
    legalActions,
    finalScores,
    selectedActionId: Number.isInteger(record.selectedActionId) ? record.selectedActionId : null,
    selectedModelRow: Number.isInteger(record.selectedModelRow) ? record.selectedModelRow : null
  };
}

function pairBrowserRecords(selectedJava, rawBrowserRecords) {
  const browser = rawBrowserRecords.map((record, index) => normalizeBrowserRecord(record, index));
  const byTick = new Map();
  for (const record of browser) {
    if (record.tick !== null && !byTick.has(record.tick)) {
      byTick.set(record.tick, record);
    }
  }
  return selectedJava.map((javaRecord, index) => {
    const match = javaRecord.tick === null ? browser[index] : byTick.get(javaRecord.tick);
    assert(match, `No browser trace record matches Java tick ${javaRecord.tick ?? index}.`);
    return match;
  });
}

function selectRepresentativeRecords(records, requested) {
  assert(records.length > 0, "Java trace is empty.");
  const indexes = [];
  const add = (index) => {
    if (index >= 0 && index < records.length && !indexes.includes(index) && indexes.length < requested) {
      indexes.push(index);
    }
  };
  const find = (predicate) => records.findIndex(predicate);
  add(0);
  add(find((record) => record.state114[113] > 0.5));
  add(find((record) => record.attackHistoryCodes.some((code) => code !== 0)));
  add(find((record) => record.state114.slice(92, 95).some((value) => value > 0)));
  add(find((record) => record.priorStateValid.every((value) => value === 1)));
  add(find((record) => record.state114[90] <= 0 && record.state114[91] > 0));
  add(records.length - 1);
  for (let slot = 0; indexes.length < requested && slot < requested * 3; slot += 1) {
    add(Math.round((slot * (records.length - 1)) / Math.max(1, requested * 3 - 1)));
  }
  for (let index = 0; indexes.length < requested && index < records.length; index += 1) {
    add(index);
  }
  return indexes.sort((left, right) => left - right).map((index) => records[index]);
}

function comparePriorStates(policy, canonical, actualPrior, tolerance, tick) {
  assert(Array.isArray(actualPrior) && actualPrior.length === 16,
    `tick=${tick} browser prior history length ${actualPrior?.length ?? "missing"} != 16.`);
  let padding = false;
  for (let lag = 0; lag < 16; lag += 1) {
    const expectedValid = canonical.priorStateValid[lag] === 1;
    const actualValid = actualPrior[lag]?.valid === true || actualPrior[lag]?.valid === 1;
    if (expectedValid !== actualValid) {
      mismatch(tick, `priorStateValid[${lag}]`, expectedValid ? 1 : 0, actualValid ? 1 : 0);
    }
    if (!actualValid) {
      padding = true;
      continue;
    }
    if (padding) {
      throw new Error(`tick=${tick} browser priorStateValid is not newest-first contiguous at lag ${lag}.`);
    }
    compareNumericVector(
      normalizeForBrowser(policy, canonical.priorState114[lag]),
      actualPrior[lag].normalizedInput,
      tolerance,
      (index) => `priorState[lag=${lag}].normalized114[${index}] ${rawInputNames[index]}`,
      tick
    );
  }
}

function compareDefenceLegality(canonical, browserLegalActions, actionIds, tick) {
  const expectedRows = canonical.legalDefenceActionIds.map((actionId) => {
    const row = actionIds.indexOf(actionId);
    assert(row >= 0, `tick=${tick} Java legal defence action ${actionId} is absent from policy schema.`);
    return row;
  });
  if (!browserLegalActions) {
    for (let index = 0; index < expectedRows.length; index += 1) {
      assert(actionIds[expectedRows[index]] === canonical.legalDefenceActionIds[index],
        `tick=${tick} legalDefenceActionIds[${index}] row mapping failed.`);
    }
    return;
  }
  for (const entry of browserLegalActions) {
    assert(actionIds[entry.modelRow] === entry.actionId,
      `tick=${tick} browser legal action row ${entry.modelRow} maps to ${actionIds[entry.modelRow]}, trace says ${entry.actionId}.`);
  }
  const prayerSet = new Set(canonical.protectionPrayerActionIds);
  const actualDefenceIds = browserLegalActions
    .filter((entry) => prayerSet.has(entry.actionId))
    .map((entry) => entry.actionId)
    .sort((left, right) => left - right);
  const expectedDefenceIds = [...canonical.legalDefenceActionIds].sort((left, right) => left - right);
  compareIntegerVector(expectedDefenceIds, actualDefenceIds,
    (index) => `legalDefenceActionIds[${index}]`, tick);
}

function compileJavaProbe(javac, gsonJar, classes) {
  const result = spawnSync(javac, [
    "--release",
    "11",
    "-encoding",
    "UTF-8",
    "-cp",
    gsonJar,
    "-d",
    classes,
    javaModelSource,
    javaProbeSource
  ], { cwd: serverRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  assertProcess(result, "Java policy probe compilation");
}

function runJavaProbe({ java, classpath, policyPath: selectedPolicyPath, actionIds: ids, canonical, temporary: temp, caseIndex }) {
  const inputPath = path.join(temp, `input-${caseIndex}.json`);
  const historyPath = path.join(temp, `history-${caseIndex}.json`);
  const scoresPath = path.join(temp, `scores-${caseIndex}.json`);
  writeFileSync(inputPath, JSON.stringify(canonical.state114), "utf8");
  writeFileSync(historyPath, JSON.stringify({
    orderedHistoryContext: orderedHistoryContext(canonical.attackHistoryCodes, canonical.ownPrayerHistoryCodes),
    priorStateInputs: canonical.priorState114,
    priorStateValid: canonical.priorStateValid
  }), "utf8");
  const actionIdUpperBound = Math.max(...ids) + 1;
  const result = spawnSync(java, [
    "-cp",
    classpath,
    javaProbeClass,
    selectedPolicyPath,
    "114",
    String(ids.length),
    "1",
    inputPath,
    scoresPath,
    String(actionIdUpperBound),
    historyPath
  ], { cwd: serverRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  assertProcess(result, `Java policy probe at tick ${canonical.tick ?? canonical.sourceIndex}`);
  return finiteVector(JSON.parse(readFileSync(scoresPath, "utf8")), ids.length,
    `Java scores at tick ${canonical.tick ?? canonical.sourceIndex}`);
}

function orderedHistoryContext(attackCodes, ownPrayerCodes) {
  const output = [];
  for (const code of [...attackCodes, ...ownPrayerCodes]) {
    output.push(code === 1 ? 1 : 0, code === 2 ? 1 : 0, code === 3 ? 1 : 0);
  }
  return output;
}

function resolveJavaTool(tool, javaHome) {
  if (javaHome) {
    const candidate = path.join(javaHome, "bin", process.platform === "win32" ? `${tool}.exe` : tool);
    requireFile(candidate, `${tool} executable`);
    return candidate;
  }
  return tool;
}

function resolveGsonJar(explicit) {
  if (explicit) {
    requireFile(explicit, "Gson jar");
    return explicit;
  }
  const libraryRoot = path.join(serverRoot, "build", "install", "kronos-server", "lib");
  assert(existsSync(libraryRoot), `Installed server library directory not found: ${libraryRoot}`);
  const candidates = readdirSync(libraryRoot)
    .filter((name) => /^gson-.*\.jar$/i.test(name))
    .sort();
  assert(candidates.length > 0, `No Gson jar found under ${libraryRoot}.`);
  return path.join(libraryRoot, candidates[candidates.length - 1]);
}

function readJsonLines(filePath) {
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${filePath}:${index + 1} is not valid JSON: ${error.message}`);
      }
    });
}

function finiteVector(value, length, label) {
  assert(Array.isArray(value) && value.length === length,
    `${label} length ${value?.length ?? "missing"} != ${length}.`);
  return value.map((entry, index) => {
    const number = Number(entry);
    assert(Number.isFinite(number), `${label}[${index}] must be finite.`);
    return number;
  });
}

function integerVector(value, length, minimum, maximum, label) {
  assert(Number.isInteger(length) && length >= 0, `${label} expected length is invalid.`);
  assert(Array.isArray(value) && value.length === length,
    `${label} length ${value?.length ?? "missing"} != ${length}.`);
  return value.map((entry, index) => {
    const number = Number(entry);
    assert(Number.isInteger(number) && number >= minimum && number <= maximum,
      `${label}[${index}] must be an integer in ${minimum}..${maximum}.`);
    return number;
  });
}

function exactInteger(value, label) {
  const number = Number(value);
  assert(Number.isInteger(number), `${label} must be an integer.`);
  return number;
}

function validateContiguousValidity(values, label) {
  let padding = false;
  values.forEach((value, index) => {
    if (value === 0) {
      padding = true;
    } else if (padding) {
      throw new Error(`${label} is not newest-first contiguous at index ${index}.`);
    }
  });
}

function compareExactVector(expected, actual, labelForIndex, tick) {
  assert(Array.isArray(actual) || ArrayBuffer.isView(actual),
    `tick=${tick} ${labelForIndex(0)} vector is missing.`);
  assert(expected.length === actual.length,
    `tick=${tick} vector length ${actual.length} != ${expected.length} at ${labelForIndex(0)}.`);
  for (let index = 0; index < expected.length; index += 1) {
    if (!sameFloat64Bits(expected[index], actual[index])) {
      mismatch(tick, labelForIndex(index), float64Hex(expected[index]), float64Hex(actual[index]),
        `values ${expected[index]} vs ${actual[index]}`);
    }
  }
}

function compareIntegerVector(expected, actual, labelForIndex, tick) {
  assert(Array.isArray(actual) || ArrayBuffer.isView(actual),
    `tick=${tick} ${labelForIndex(0)} vector is missing.`);
  assert(expected.length === actual.length,
    `tick=${tick} ${labelForIndex(0)} vector length ${actual.length} != ${expected.length}.`);
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] !== actual[index]) {
      mismatch(tick, labelForIndex(index), expected[index], actual[index]);
    }
  }
}

function compareNumericVector(expected, actual, tolerance, labelForIndex, tick) {
  assert(Array.isArray(actual) || ArrayBuffer.isView(actual),
    `tick=${tick} ${labelForIndex(0)} vector is missing.`);
  assert(expected.length === actual.length,
    `tick=${tick} ${labelForIndex(0)} vector length ${actual.length} != ${expected.length}.`);
  for (let index = 0; index < expected.length; index += 1) {
    const delta = Math.abs(expected[index] - actual[index]);
    if (!Number.isFinite(delta) || delta > tolerance) {
      mismatch(tick, labelForIndex(index), expected[index], actual[index], `|delta|=${delta}, atol=${tolerance}`);
    }
  }
}

function sameFloat64Bits(left, right) {
  return float64Hex(left) === float64Hex(right);
}

function float64Hex(value) {
  const bytes = new Uint8Array(new Float64Array([value]).buffer);
  return Array.from(bytes, (entry) => entry.toString(16).padStart(2, "0")).join("");
}

function argmax(values) {
  let best = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > values[best]) {
      best = index;
    }
  }
  return best;
}

function argmaxSubset(values, rows) {
  assert(rows.length > 0, "Cannot select an argmax from an empty row set.");
  let best = rows[0];
  for (let index = 1; index < rows.length; index += 1) {
    if (values[rows[index]] > values[best]) {
      best = rows[index];
    }
  }
  return best;
}

function maxAbsoluteDelta(left, right) {
  let maximum = 0;
  for (let index = 0; index < left.length; index += 1) {
    maximum = Math.max(maximum, Math.abs(left[index] - right[index]));
  }
  return maximum;
}

function positiveInteger(value, label) {
  const number = Number(value);
  assert(Number.isInteger(number) && number > 0, `${label} must be a positive integer.`);
  return number;
}

function nonNegativeNumber(value, label) {
  const number = Number(value);
  assert(Number.isFinite(number) && number >= 0, `${label} must be a non-negative number.`);
  return number;
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function requireFile(filePath, label) {
  assert(existsSync(filePath), `${label} not found: ${filePath}`);
}

function assertProcess(result, label) {
  if (result.error) {
    throw new Error(`${label} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with code ${result.status}.\n${result.stderr ?? ""}\n${result.stdout ?? ""}`);
  }
}

function mismatch(tick, field, expected, actual, detail = "") {
  throw new Error(`tick=${tick} first mismatch at ${field}: expected ${expected}, actual ${actual}${detail ? ` (${detail})` : ""}.`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
