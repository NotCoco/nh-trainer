import { spawnSync } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultKronosRoot = path.resolve(
  "C:/Kronos/kronos-osrs-184-master/kronos-osrs-184-master/Kronos-master"
);
const defaultServerRoot = path.join(defaultKronosRoot, "kronos-server");
const defaultGradle = path.resolve(
  "C:/Users/co co/.gradle/wrapper/dists/gradle-6.4.1-all/13imxtezgn9nwzqt8rgtkunh1/gradle-6.4.1/bin/gradle.bat"
);
const defaultJavaHome = path.resolve("C:/Program Files/Java/jdk-14.0.2");
const defaultJavaRuntimeHome = path.resolve("C:/Program Files/Amazon Corretto/jdk11.0.25_9");

const args = parseArgs(process.argv.slice(2));
const timestamp = safeTimestamp(new Date());
const kronosRoot = path.resolve(args["kronos-root"] ?? defaultKronosRoot);
const serverRoot = path.resolve(args["server-root"] ?? defaultServerRoot);
const dataAiRoot = path.join(serverRoot, "data", "ai");
const reportRoot = path.resolve(projectRoot, args["report-dir"] ?? path.join(".codex-logs", `dynamic-cohort-${timestamp}`));
const basePolicy = path.resolve(
  args.base ?? path.join(dataAiRoot, "nhstaker-selfplay-policy-nhstake-ags-hard.tsv")
);
const anchorPolicy = path.resolve(
  args.anchor ?? basePolicy
);
const slices = clampInt(Number(args.slices ?? 1), 0, 24);
const trainSeconds = clampInt(Number(args.seconds ?? 600), 10, 7200);
const evalFights = clampInt(Number(args["eval-fights"] ?? 8), 2, 20000);
const evalTicks = clampInt(Number(args["eval-ticks"] ?? 120), 24, 2000);
const h2hFights = clampInt(Number(args["h2h-fights"] ?? 12), 2, 20000);
const h2hTicks = clampInt(Number(args["h2h-ticks"] ?? 120), 24, 2000);
const candidateLimit = clampInt(Number(args.candidates ?? 50), 50, 4950);
const includeBasicActions = args["include-basics"] !== "false";
const candidateMode = normalizeCandidateMode(args["candidate-mode"] ?? (includeBasicActions ? "hybrid" : "visited"));
const patterns = String(args.patterns ?? "all").trim() || "all";
const focusEligiblePatterns = new Set([
  "MELEE_CAMP_UNFROZEN",
  "AGS_REPEAT_SPEC",
  "MAGE_RANGE_ALTERNATE",
  "MAGE_MAGE_RANGE",
  "RANGE_RANGE_MAGE",
  "MAGE_HEAVY",
  "RANGE_HEAVY",
  "STAFF_BAIT_RANGE",
  "CROSSBOW_BAIT_MAGE",
  "STAND_UNDER_FREEZE",
  "LONG_RANGE_CROSSBOW",
  "ONE_TICK_FAKER",
  "TWO_TICK_FAKER",
  "DELAYED_REACTOR"
]);
const botCount = clampInt(Number(args["bot-count"] ?? 1000), 2, 4000);
const evalPairCount = clampInt(Number(args["eval-pairs"] ?? 25), 0, botCount / 2);
const fixedOpponentPairCount = clampInt(Number(args["fixed-pairs"] ?? 150), 0, botCount / 2);
const snapshotPoolPairCount = clampInt(Number(args["snapshot-pairs"] ?? 50), 0, botCount / 2);
const cohortPairCount = clampInt(Number(args["cohort-pairs"] ?? 25), 0, botCount / 2);
const maxCohortRegression = Number(args["max-cohort-regression"] ?? 0.65);
const maxWorstRegression = Number(args["max-worst-regression"] ?? 0.15);
const minAnchorDamageRatio = Number(args["min-anchor-damage-ratio"] ?? 0.97);
const policyMaxEpsilon = Number(args["policy-max-epsilon"] ?? 0.18);
const policyMinEpsilon = Number(args["policy-min-epsilon"] ?? 0.035);
const policyEpsilonReheatFloor = Number(args["policy-epsilon-reheat-floor"] ?? 0.08);
const policyLearningRate = Number(args["policy-learning-rate"] ?? 0.0025);
const policyActionNoveltyScale = Number(args["policy-action-novelty-scale"] ?? 0.008);
const policyAnchorScoreBlend = Number(args["policy-anchor-score-blend"] ?? 0.35);
const blendAlphas = parseBlendAlphas(args["blend-alphas"] ?? "1,0.5,0.25,0.1");
const minCohortPrayerRatio = Number(args["min-cohort-prayer-ratio"] ?? 0.96);
const minCohortPolicyDamageRatio = Number(args["min-cohort-policy-damage-ratio"] ?? 0.97);
const maxCohortOpponentDamageRatio = Number(args["max-cohort-opponent-damage-ratio"] ?? 1.03);
const maxAverageWeaknessRegression = Number(args["max-average-weakness-regression"] ?? 0.1);
const minH2hWinDelta = Number(args["min-h2h-win-delta"] ?? -1);
const seedBase = Number(args.seed ?? 0x4e484d);
const gradleBin = path.resolve(args.gradle ?? process.env.KRONOS_GRADLE ?? defaultGradle);
const javaHome = path.resolve(args["java-home"] ?? process.env.KRONOS_TRAINING_JAVA_HOME ?? defaultJavaHome);
const javaRuntimeHome = path.resolve(
  args["java-runtime-home"] ?? process.env.KRONOS_RUNTIME_JAVA_HOME ?? defaultJavaRuntimeHome
);
const evaluateOnly = args["evaluate-only"] === "true" || slices === 0;

for (const required of [basePolicy, anchorPolicy, kronosRoot, serverRoot, javaHome, javaRuntimeHome]) {
  if (!existsSync(required)) {
    throw new Error(`Missing required path: ${required}`);
  }
}

mkdirSync(reportRoot, { recursive: true });

let workingPolicy = basePolicy;
if (!evaluateOnly) {
  workingPolicy = path.join(dataAiRoot, `nhstaker-selfplay-policy-dynamic-cohort-${timestamp}-slice0.tsv`);
  copyFileSync(basePolicy, workingPolicy);
}

const manifest = {
  timestamp,
  basePolicy,
  anchorPolicy,
  reportRoot,
  options: {
    slices,
    trainSeconds,
    evalFights,
    evalTicks,
    h2hFights,
    h2hTicks,
    candidateLimit,
    includeBasicActions,
    candidateMode,
    patterns,
    botCount,
    javaHome,
    javaRuntimeHome,
    evalPairCount,
    fixedOpponentPairCount,
    snapshotPoolPairCount,
    cohortPairCount,
    maxCohortRegression,
    maxWorstRegression,
    minAnchorDamageRatio,
    policyMaxEpsilon,
    policyMinEpsilon,
    policyEpsilonReheatFloor,
    policyLearningRate,
    policyActionNoveltyScale,
    policyAnchorScoreBlend,
    blendAlphas,
    minCohortPrayerRatio,
    maxAverageWeaknessRegression,
    minH2hWinDelta,
    seedBase
  },
  evaluations: []
};

const baseline = evaluatePolicy("slice0", workingPolicy, seedBase);
manifest.evaluations.push({ slice: 0, policy: workingPolicy, accepted: true, baseline });
let workingEvaluation = baseline;
writeManifest(manifest);

if (evaluateOnly) {
  console.log(JSON.stringify({ mode: "evaluate-only", reportRoot, baseline: summarizeEvaluation(baseline) }, null, 2));
  process.exit(0);
}

for (let slice = 1; slice <= slices; slice += 1) {
  const focus = focusStringFromWeakness(workingEvaluation.cohorts);
  const previousPolicy = workingPolicy;
  const previousEvaluation = workingEvaluation;
  const candidatePolicy = path.join(
    dataAiRoot,
    `nhstaker-selfplay-policy-dynamic-cohort-${timestamp}-slice${slice}.tsv`
  );
  copyFileSync(previousPolicy, candidatePolicy);

  const training = runTrainingSlice({
    slice,
    policyPath: candidatePolicy,
    focus
  });
  const candidates = buildSliceCandidates(slice, previousPolicy, candidatePolicy);
  const candidateEvaluations = [];
  for (const candidate of candidates) {
    const evaluation = evaluatePolicy(candidate.label, candidate.policy, seedBase + slice * 7919 + candidate.seedOffset);
    const decision = promotionDecision(previousEvaluation, evaluation);
    candidateEvaluations.push({
      ...candidate,
      evaluation,
      decision
    });
  }
  const accepted = selectAcceptedCandidate(candidateEvaluations);
  if (accepted) {
    workingPolicy = accepted.policy;
    workingEvaluation = accepted.evaluation;
  }
  manifest.evaluations.push({
    slice,
    policy: candidatePolicy,
    focus,
    training,
    accepted: Boolean(accepted),
    acceptedVariant: accepted ? accepted.label : null,
    acceptedPolicy: accepted ? accepted.policy : null,
    candidates: candidateEvaluations,
    baseline: accepted ? accepted.evaluation : previousEvaluation
  });
  writeManifest(manifest);
}

manifest.finalPolicy = workingPolicy;
manifest.acceptedSlices = manifest.evaluations.filter((entry) => entry.accepted).map((entry) => entry.slice);
writeManifest(manifest);

console.log(
  JSON.stringify(
    {
      reportRoot,
      finalPolicy: workingPolicy,
      acceptedSlices: manifest.evaluations.filter((entry) => entry.accepted).map((entry) => entry.slice),
      latest: summarizeEvaluation(workingEvaluation)
    },
    null,
    2
  )
);

function evaluatePolicy(label, policyPath, seed) {
  const cohorts = runJsonCommand("node", [
    path.join(projectRoot, "scripts", "evaluate-policy-cohorts.mjs"),
    "--policy",
    policyPath,
    "--fights",
    String(evalFights),
    "--ticks",
    String(evalTicks),
    "--candidates",
    String(candidateLimit),
    "--include-basics",
    String(includeBasicActions),
    "--candidate-mode",
    candidateMode,
    "--patterns",
    patterns,
    "--seed",
    String(seed)
  ]);
  const h2h = runJsonCommand("node", [
    path.join(projectRoot, "scripts", "evaluate-policy-head-to-head.mjs"),
    "--new",
    policyPath,
    "--previous",
    anchorPolicy,
    "--fights",
    String(h2hFights),
    "--ticks",
    String(h2hTicks),
    "--candidates",
    String(candidateLimit),
    "--include-basics",
    String(includeBasicActions),
    "--candidate-mode",
    candidateMode,
    "--seed",
    String(seed + 31337)
  ]);
  writeFileSync(path.join(reportRoot, `${label}-cohorts.json`), JSON.stringify(cohorts, null, 2));
  writeFileSync(path.join(reportRoot, `${label}-head-to-head.json`), JSON.stringify(h2h, null, 2));
  return { cohorts, h2h };
}

function runTrainingSlice({ slice, policyPath, focus }) {
  const outPath = path.join(reportRoot, `slice${slice}-training.out.log`);
  const errPath = path.join(reportRoot, `slice${slice}-training.err.log`);
  const outFd = openSync(outPath, "w");
  const errFd = openSync(errPath, "w");
  try {
    const trainingEnv = {
      ...process.env,
      KRONOS_SETTINGS_PATH: path.join(serverRoot, "server.training.a.properties"),
      KRONOS_NH_POLICY_PATH: policyPath,
      KRONOS_NH_FIXED_OPPONENT_POLICY_PATH: anchorPolicy,
      KRONOS_NH_READY_TRAIN_SECONDS: String(trainSeconds),
      KRONOS_NH_BOT_COUNT: String(botCount),
      KRONOS_NH_EVAL_PAIR_COUNT: String(evalPairCount),
      KRONOS_NH_FIXED_OPPONENT_PAIR_COUNT: String(fixedOpponentPairCount),
      KRONOS_NH_SNAPSHOT_POOL_PAIR_COUNT: String(snapshotPoolPairCount),
      KRONOS_NH_COHORT_PAIR_COUNT: String(cohortPairCount),
      KRONOS_NH_COHORT_FOCUS_PATTERNS: focus,
      KRONOS_NH_POLICY_MAX_EPSILON: String(policyMaxEpsilon),
      KRONOS_NH_POLICY_MIN_EPSILON: String(policyMinEpsilon),
      KRONOS_NH_POLICY_EPSILON_REHEAT_FLOOR: String(policyEpsilonReheatFloor),
      KRONOS_NH_POLICY_LEARNING_RATE: String(policyLearningRate),
      KRONOS_NH_POLICY_ACTION_NOVELTY_SCALE: String(policyActionNoveltyScale),
      KRONOS_NH_POLICY_ANCHOR_SCORE_BLEND: String(policyAnchorScoreBlend)
    };
    const buildEnv = {
      ...trainingEnv,
      JAVA_HOME: javaHome,
      Path: `${path.join(javaHome, "bin")};${process.env.Path ?? ""}`
    };
    const installResult = runLoggedCommand(
      gradleBin,
      ["--no-daemon", "--console=plain", ":kronos-server:installDist"],
      {
        cwd: kronosRoot,
        env: buildEnv,
        outFd,
        errFd,
        timeout: 300000
      }
    );
    if (installResult.status !== 0) {
      throw new Error(`Training slice ${slice} install failed with exit code ${installResult.status}; see ${outPath} and ${errPath}`);
    }
    const installLib = path.join(serverRoot, "build", "install", "kronos-server", "lib");
    if (!existsSync(installLib)) {
      throw new Error(`Installed server lib directory is missing: ${installLib}`);
    }
    const javaRuntimeBin = path.join(javaRuntimeHome, "bin", "java.exe");
    const runtimeEnv = {
      ...trainingEnv,
      JAVA_HOME: javaRuntimeHome,
      Path: `${path.join(javaRuntimeHome, "bin")};${process.env.Path ?? ""}`
    };
    const runResult = runLoggedCommand(
      javaRuntimeBin,
      ["-Djdk.attach.allowAttachSelf=true", "-cp", path.join(installLib, "*"), "io.ruin.Server"],
      {
      cwd: serverRoot,
      env: runtimeEnv,
      outFd,
      errFd,
      timeout: trainSeconds * 1000 + 240000
      }
    );
    if (runResult.status !== 0) {
      throw new Error(`Training slice ${slice} failed with exit code ${runResult.status}; see ${outPath} and ${errPath}`);
    }
    return { outPath, errPath, focus };
  } finally {
    closeSync(outFd);
    closeSync(errFd);
  }
}

function runLoggedCommand(commandPath, commandArgs, options) {
  const command = isWindowsBatchFile(commandPath) ? process.env.ComSpec ?? "cmd.exe" : commandPath;
  const argsForCommand = isWindowsBatchFile(commandPath)
    ? ["/d", "/c", "call", commandPath, ...commandArgs]
    : commandArgs;
  const result = spawnSync(command, argsForCommand, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", options.outFd, options.errFd],
    timeout: options.timeout
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function isWindowsBatchFile(filePath) {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".bat") || lower.endsWith(".cmd");
}

function focusStringFromWeakness(evaluation) {
  const rows = [...evaluation.patterns].filter((row) => focusEligiblePatterns.has(row.pattern));
  const selected = [];
  addWeakestFromGroup(selected, rows, ["MAGE_HEAVY", "RANGE_HEAVY", "MAGE_MAGE_RANGE", "RANGE_RANGE_MAGE", "MAGE_RANGE_ALTERNATE"]);
  addWeakestFromGroup(selected, rows, ["ONE_TICK_FAKER", "TWO_TICK_FAKER", "STAFF_BAIT_RANGE", "CROSSBOW_BAIT_MAGE", "DELAYED_REACTOR"]);
  addWeakestFromGroup(selected, rows, ["LONG_RANGE_CROSSBOW", "MELEE_CAMP_UNFROZEN", "AGS_REPEAT_SPEC", "STAND_UNDER_FREEZE"]);
  for (const row of rows.sort((left, right) => focusScore(right) - focusScore(left))) {
    if (selected.length >= 6) {
      break;
    }
    if (!selected.some((entry) => entry.pattern === row.pattern)) {
      selected.push(row);
    }
  }
  const extras = [2, 2, 1, 1, 1, 1];
  return selected
    .slice(0, extras.length)
    .map((row, index) => `${row.pattern}:${extras[index]}`)
    .join(",");
}

function addWeakestFromGroup(selected, rows, group) {
  const candidate = rows
    .filter((row) => group.includes(row.pattern))
    .sort((left, right) => focusScore(right) - focusScore(left))[0];
  if (candidate && !selected.some((entry) => entry.pattern === candidate.pattern)) {
    selected.push(candidate);
  }
}

function focusScore(row) {
  const weakness = Number(row.weaknessScore ?? 0);
  const prayerRate = percentToRatio(row.policyBehavior?.prayerMatchOnCohortStyle);
  const damageRatio = Number(row.averages?.policyDamageDealt ?? 0) / Math.max(1, Number(row.averages?.cohortDamageDealt ?? 0));
  const prayerDeficit = Math.max(0, 0.42 - prayerRate);
  const damageDeficit = Math.max(0, 1.0 - damageRatio);
  return weakness + (prayerDeficit * 3.5) + (damageDeficit * 0.8);
}

function buildSliceCandidates(slice, previousPolicy, trainedPolicy) {
  const candidates = [];
  const uniqueAlphas = [...new Set(blendAlphas)].filter((alpha) => alpha > 0 && alpha <= 1);
  for (const alpha of uniqueAlphas) {
    if (alpha >= 0.999999) {
      candidates.push({
        label: `slice${slice}`,
        policy: trainedPolicy,
        alpha: 1,
        seedOffset: 0
      });
      continue;
    }
    const alphaLabel = String(Math.round(alpha * 1000)).padStart(3, "0");
    const policy = path.join(reportRoot, `slice${slice}-blend-${alphaLabel}.tsv`);
    writeBlendedPolicy(previousPolicy, trainedPolicy, alpha, policy);
    candidates.push({
      label: `slice${slice}-blend-${alphaLabel}`,
      policy,
      alpha,
      seedOffset: Math.round(alpha * 100000)
    });
  }
  return candidates;
}

function writeBlendedPolicy(previousPolicy, trainedPolicy, alpha, outPath) {
  const previous = readPolicyForBlend(previousPolicy);
  const trained = readPolicyForBlend(trainedPolicy);
  const keys = new Set([...previous.weights.keys(), ...trained.weights.keys()]);
  const rows = [...trained.meta];
  for (const key of [...keys].sort(compareWeightKey)) {
    const previousWeight = previous.weights.get(key) ?? 0;
    const trainedWeight = trained.weights.get(key) ?? 0;
    const value = previousWeight + ((trainedWeight - previousWeight) * alpha);
    if (Math.abs(value) <= 1e-12) {
      continue;
    }
    const [action, feature] = key.split("\t");
    rows.push(`ow\t${action}\t${feature}\t${value}`);
  }
  writeFileSync(outPath, `${rows.join("\n")}\n`);
}

function readPolicyForBlend(policyPath) {
  const meta = [];
  const weights = new Map();
  for (const line of readFileSync(policyPath, "utf8").split(/\r?\n/)) {
    if (!line) {
      continue;
    }
    const parts = line.split("\t");
    if (parts[0] === "ow") {
      weights.set(`${parts[1]}\t${parts[2]}`, Number(parts[3]));
    } else {
      meta.push(line);
    }
  }
  return { meta, weights };
}

function compareWeightKey(left, right) {
  const [leftAction, leftFeature] = left.split("\t").map(Number);
  const [rightAction, rightFeature] = right.split("\t").map(Number);
  return leftAction - rightAction || leftFeature - rightFeature;
}

function selectAcceptedCandidate(candidateEvaluations) {
  const accepted = candidateEvaluations.filter((candidate) => candidate.decision.accepted);
  if (accepted.length === 0) {
    return null;
  }
  accepted.sort((left, right) => candidateScore(right) - candidateScore(left));
  return accepted[0];
}

function candidateScore(candidate) {
  const decision = candidate.decision;
  const weaknessGain = decision.previousAverageWeakness - decision.candidateAverageWeakness;
  const damageRatio = decision.anchorDamage > 0 ? decision.candidateDamage / decision.anchorDamage : 1;
  const prayerGain = decision.candidateCohortPrayerRate - decision.previousCohortPrayerRate;
  const policyDamageGain = decision.previousCohortPolicyDamage > 0
    ? (decision.candidateCohortPolicyDamage / decision.previousCohortPolicyDamage) - 1.0
    : 0;
  const opponentDamageGain = decision.previousCohortOpponentDamage > 0
    ? 1.0 - (decision.candidateCohortOpponentDamage / decision.previousCohortOpponentDamage)
    : 0;
  return (weaknessGain * 3.0)
    + ((damageRatio - 1.0) * 1.6)
    + (prayerGain * 1.2)
    + (policyDamageGain * 1.2)
    + (opponentDamageGain * 1.8)
    + ((candidate.alpha ?? 1) >= 0.999999 ? 0.02 : 0.0);
}

function promotionDecision(previous, candidate) {
  const previousWorst = Number(previous.cohorts.weakest?.weaknessScore ?? 0);
  const candidateWorst = Number(candidate.cohorts.weakest?.weaknessScore ?? 0);
  const previousCohortSummary = summarizeCohorts(previous.cohorts);
  const candidateCohortSummary = summarizeCohorts(candidate.cohorts);
  const previousDamage = Number(candidate.h2h.averages.previousDamageDealt ?? 0);
  const candidateDamage = Number(candidate.h2h.averages.newDamageDealt ?? 0);
  const h2hWinDelta = Number(candidate.h2h.result.newWins ?? 0) - Number(candidate.h2h.result.previousWins ?? 0);
  const cohortPolicyDamageRatio = previousCohortSummary.policyDamage > 0
    ? candidateCohortSummary.policyDamage / previousCohortSummary.policyDamage
    : 1;
  const cohortOpponentDamageRatio = previousCohortSummary.opponentDamage > 0
    ? candidateCohortSummary.opponentDamage / previousCohortSummary.opponentDamage
    : 1;
  const cohortRegressions = cohortRegressionRows(previous.cohorts, candidate.cohorts);
  const worstCohortRegression = cohortRegressions.reduce(
    (worst, row) => Math.max(worst, row.regression),
    Number.NEGATIVE_INFINITY
  );
  const accepted =
    candidateWorst <= previousWorst + maxWorstRegression &&
    candidateCohortSummary.averageWeakness <= previousCohortSummary.averageWeakness + maxAverageWeaknessRegression &&
    worstCohortRegression <= maxCohortRegression &&
    candidateDamage >= previousDamage * minAnchorDamageRatio &&
    candidateCohortSummary.prayerRate >= previousCohortSummary.prayerRate * minCohortPrayerRatio &&
    cohortPolicyDamageRatio >= minCohortPolicyDamageRatio &&
    cohortOpponentDamageRatio <= maxCohortOpponentDamageRatio &&
    h2hWinDelta >= minH2hWinDelta;
  return {
    accepted,
    previousWorst,
    candidateWorst,
    maxWorstRegression,
    previousAverageWeakness: previousCohortSummary.averageWeakness,
    candidateAverageWeakness: candidateCohortSummary.averageWeakness,
    maxAverageWeaknessRegression,
    worstCohortRegression,
    maxCohortRegression,
    cohortRegressions,
    previousCohortPrayerRate: previousCohortSummary.prayerRate,
    candidateCohortPrayerRate: candidateCohortSummary.prayerRate,
    minCohortPrayerRatio,
    previousCohortPolicyDamage: previousCohortSummary.policyDamage,
    candidateCohortPolicyDamage: candidateCohortSummary.policyDamage,
    minCohortPolicyDamageRatio,
    previousCohortOpponentDamage: previousCohortSummary.opponentDamage,
    candidateCohortOpponentDamage: candidateCohortSummary.opponentDamage,
    maxCohortOpponentDamageRatio,
    candidateDamage,
    anchorDamage: previousDamage,
    minAnchorDamageRatio,
    h2hWinDelta,
    minH2hWinDelta
  };
}

function summarizeCohorts(cohorts) {
  const patternsList = cohorts?.patterns ?? [];
  if (patternsList.length === 0) {
    return {
      averageWeakness: 0,
      prayerRate: 0,
      damageRatio: 0,
      policyDamage: 0,
      opponentDamage: 0
    };
  }
  let weakness = 0;
  let prayer = 0;
  let damageRatio = 0;
  let policyDamage = 0;
  let opponentDamage = 0;
  for (const pattern of patternsList) {
    const patternPolicyDamage = Number(pattern.averages?.policyDamageDealt ?? 0);
    const patternOpponentDamage = Number(pattern.averages?.cohortDamageDealt ?? 0);
    weakness += Number(pattern.weaknessScore ?? 0);
    prayer += percentToRatio(pattern.policyBehavior?.prayerMatchOnCohortStyle);
    damageRatio += patternPolicyDamage / Math.max(1, patternOpponentDamage);
    policyDamage += patternPolicyDamage;
    opponentDamage += patternOpponentDamage;
  }
  return {
    averageWeakness: weakness / patternsList.length,
    prayerRate: prayer / patternsList.length,
    damageRatio: damageRatio / patternsList.length,
    policyDamage: policyDamage / patternsList.length,
    opponentDamage: opponentDamage / patternsList.length
  };
}

function percentToRatio(value) {
  if (typeof value === "number") {
    return value > 1 ? value / 100 : value;
  }
  if (typeof value !== "string") {
    return 0;
  }
  const parsed = Number(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed / 100 : 0;
}

function cohortRegressionRows(previous, candidate) {
  const previousByPattern = new Map((previous.patterns ?? []).map((row) => [row.pattern, row]));
  return (candidate.patterns ?? []).map((candidateRow) => {
    const previousRow = previousByPattern.get(candidateRow.pattern);
    const previousWeakness = Number(previousRow?.weaknessScore ?? 0);
    const candidateWeakness = Number(candidateRow.weaknessScore ?? 0);
    return {
      pattern: candidateRow.pattern,
      previousWeakness,
      candidateWeakness,
      regression: candidateWeakness - previousWeakness
    };
  });
}

function runJsonCommand(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${commandArgs.join(" ")} failed with exit code ${result.status}\n${result.stderr}`
    );
  }
  return JSON.parse(result.stdout);
}

function summarizeEvaluation(evaluation) {
  return {
    weakest: evaluation.cohorts.weakest,
    h2h: evaluation.h2h.result,
    averages: evaluation.h2h.averages
  };
}

function writeManifest(manifestValue) {
  writeFileSync(path.join(reportRoot, "manifest.json"), JSON.stringify(manifestValue, null, 2));
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = rawArgs[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function parseBlendAlphas(raw) {
  const parsed = String(raw)
    .split(/[,;]/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 1);
  return parsed.length > 0 ? parsed : [1];
}

function normalizeCandidateMode(raw) {
  const mode = String(raw ?? "").trim().toLowerCase();
  if (mode === "visited" || mode === "hybrid" || mode === "full") {
    return mode;
  }
  if (mode === "false" || mode === "top") {
    return "visited";
  }
  if (mode === "true" || mode === "all") {
    return "full";
  }
  return "hybrid";
}

function safeTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function clampInt(value, min, max) {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, normalized));
}
