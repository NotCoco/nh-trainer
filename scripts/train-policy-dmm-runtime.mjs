import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const args = parseArgs(process.argv.slice(2));

const basePolicyPath = path.resolve(projectRoot, args.base ?? path.join("fixtures", "ai", "nhstaker-selfplay-policy-hard.tsv"));
const outPolicyPath = path.resolve(projectRoot, args.out ?? path.join("fixtures", "ai", "nhstaker-selfplay-policy-dmm-hard.tsv"));
const reportPath = path.resolve(projectRoot, args.report ?? path.join(".codex-logs", `dmm-runtime-train-${safeTimestamp(new Date())}.json`));
const candidatePolicyPath = path.resolve(
  projectRoot,
  args["candidate-out"] ?? `${reportPath.replace(/\.json$/i, "")}-candidate.tsv`
);
const trainSeconds = clampInt(Number(args.seconds ?? 1200), 10, 7200);
const maxTicks = clampInt(Number(args.ticks ?? 180), 24, 2000);
const evalFights = clampInt(Number(args["eval-fights"] ?? 10), 2, 20000);
const acceptEvalFights = clampInt(Number(args["accept-eval-fights"] ?? Math.max(evalFights, 54)), 2, 20000);
const seedBase = Number(args.seed ?? 0xd44d);
const learningRate = Number(args["learning-rate"] ?? 0.0018);
const epsilonStart = Number(args["epsilon-start"] ?? 0.14);
const epsilonEnd = Number(args["epsilon-end"] ?? 0.035);
const protectedHp = Number(args["protected-hp"] ?? 74);
const maxBiasDelta = Number(args["max-bias-delta"] ?? 0.35);

if (!existsSync(basePolicyPath)) {
  throw new Error(`Missing base policy: ${basePolicyPath}`);
}
mkdirSync(path.dirname(outPolicyPath), { recursive: true });
mkdirSync(path.dirname(reportPath), { recursive: true });
mkdirSync(path.dirname(candidatePolicyPath), { recursive: true });
if (!existsSync(outPolicyPath)) {
  copyFileSync(basePolicyPath, outPolicyPath);
}

const runtime = loadTsModule("src/sim/runtimePlayerCombat.ts");
const runtimePolicy = loadTsModule("src/sim/nh/runtime-policy-opponent.ts");
const botPolicy = loadTsModule("src/bot/policy.ts");
const policyBridge = loadTsModule("src/sim/nh/policy-bridge.ts");
const policyFeatures = loadTsModule("src/sim/nh/policy-features.ts");
const gearProfile = loadTsModule("src/sim/nh/gearProfile.ts");
const loadouts = loadTsModule("src/sim/nh/loadouts.ts");
const combat = loadTsModule("src/sim/combat/player-combat.ts");
const runtimeScene = loadTsModule("src/render/runtimeScene.ts");
const tileMovement = loadTsModule("src/render/nhTileMovement.ts");
const serverItems = loadTsModule("src/generated/server-items.json");

const runtimeTileScale = tileMovement.NH_TILE_WORLD_UNITS;
const dmmAllowedEquipmentIntentList = [
  "style_loadout",
  "weapon_only",
  "unequip_head",
  "unequip_body",
  "unequip_shield",
  "unequip_legs",
  "unequip_hands"
];
const dmmAllowedAttackIntentList = ["attack", "hold", "off_tick"];
const dmmAllowedEquipmentIntents = new Set(dmmAllowedEquipmentIntentList);
const dmmAllowedAttackIntents = new Set(dmmAllowedAttackIntentList);
const dmmTrainingActionIds = createDmmTrainingActionIds();
const dmmActionIdToCompactIndex = new Map(dmmTrainingActionIds.map((action, index) => [action, index]));
const dmmLegalMaskBytes = Math.ceil(dmmTrainingActionIds.length / 8);
const dmmAllActionsLegalMask = Buffer.alloc(dmmLegalMaskBytes, 0xff);
const dmmLegalMaskRemainder = dmmTrainingActionIds.length % 8;
if (dmmLegalMaskRemainder !== 0) {
  dmmAllActionsLegalMask[dmmLegalMaskBytes - 1] = (1 << dmmLegalMaskRemainder) - 1;
}
const explorationCandidateCount = clampInt(
  Number(args["exploration-candidates"] ?? 8192),
  96,
  dmmTrainingActionIds.length
);
const rankingCandidateCount = clampInt(
  Number(args["ranking-candidates"] ?? dmmTrainingActionIds.length),
  96,
  dmmTrainingActionIds.length
);
const evaluationCandidateCount = clampInt(
  Number(args["eval-candidates"] ?? 2048),
  96,
  dmmTrainingActionIds.length
);
const dmmVoidwakerItemId = 27690;
const dmmVestaLongswordItemId = 22613;
const dmmNoxiousHalberdItemId = 29796;
const defaultRuntimeFrame = runtimeScene.runtimeTimeline[0];
const defaultLocalStartTile =
  defaultRuntimeFrame.actors.find((actor) => actor.actorId === "local-player")?.tile ?? { x: -2, z: 0 };
const defaultOpponentStartTile =
  defaultRuntimeFrame.actors.find((actor) => actor.actorId === "opponent")?.tile ?? { x: 2, z: 0 };

const dmmPatterns = [
  "ONE_TICK_FAKER",
  "MAGE_RANGE_ALTERNATE",
  "RANGE_HEAVY",
  "MAGE_HEAVY",
  "LONG_RANGE_CROSSBOW",
  "CLOSE_FAKE_RANGE_MAGE_MELEE",
  "CLOSE_FAKE_MELEE_RANGE_MAGE",
  "MELEE_CAMP_UNFROZEN",
  "STAND_UNDER_FREEZE",
  "SPEC_ROTATION",
  "SLOW_HUMAN"
];

let initialBiasByAction = new Map();

if (args["eval-activity"]) {
  runDmmRuntimeActivityEval();
} else if (args["eval-policy"]) {
  runDmmRuntimePolicyEval();
} else if (args["rollout-out"]) {
  runDmmRuntimeRolloutExport();
} else {
  runDmmRuntimeTabularTraining();
}

function runDmmRuntimeTabularTraining() {
const initialPolicyText = readFileSync(outPolicyPath, "utf8");
const initialPolicy = botPolicy.parseNhPolicyTsv(initialPolicyText, `${path.basename(outPolicyPath)}:initial`);
const policy = botPolicy.parseNhPolicyTsv(initialPolicyText, path.basename(outPolicyPath));
initialBiasByAction = policyBiasMap(policy);
const rng = createMulberry32(seedBase >>> 0);
const training = {
  fights: 0,
  updates: 0,
  policyWins: 0,
  cohortWins: 0,
  draws: 0,
  policyDamage: 0,
  cohortDamage: 0,
  policySpecs: 0,
  policyVoidwakerSpecs: 0,
  policyVlsSpecs: 0,
  cohortSpecs: 0,
  cohortVoidwakerSpecs: 0,
  cohortVlsSpecs: 0,
  decisionsSeen: 0,
  decisionsUpdated: 0,
  decisionsSkippedSupply: 0,
  decisionsSkippedDanger: 0,
  dmmDiagnostics: createDmmTrainingDiagnostics()
};

const before = evaluatePolicy(policy, seedBase + 0x5150, evalFights);
const startedAt = Date.now();
while (Date.now() - startedAt < trainSeconds * 1000) {
  const progress = Math.min(1, (Date.now() - startedAt) / Math.max(1, trainSeconds * 1000));
  const epsilon = epsilonStart + (epsilonEnd - epsilonStart) * progress;
  const pattern = dmmPatterns[training.fights % dmmPatterns.length];
  const fight = runRuntimeFight({
    policy,
    pattern,
    seed: (seedBase + training.fights * 101) >>> 0,
    train: true,
    epsilon,
    rng
  });
  const updateSummary = applyFightUpdates(policy, fight.decisions, fight, learningRate);
  training.fights += 1;
  training.updates += fight.decisions.length;
  training.policyWins += fight.winner === "policy" ? 1 : 0;
  training.cohortWins += fight.winner === "cohort" ? 1 : 0;
  training.draws += fight.winner === "draw" ? 1 : 0;
  training.policyDamage += fight.policyDamage;
  training.cohortDamage += fight.cohortDamage;
  training.policySpecs += fight.policySpecs;
  training.policyVoidwakerSpecs += fight.policyVoidwakerSpecs;
  training.policyVlsSpecs += fight.policyVlsSpecs;
  training.cohortSpecs += fight.cohortSpecs;
  training.cohortVoidwakerSpecs += fight.cohortVoidwakerSpecs;
  training.cohortVlsSpecs += fight.cohortVlsSpecs;
  training.decisionsSeen += updateSummary.seen;
  training.decisionsUpdated += updateSummary.updated;
  training.decisionsSkippedSupply += updateSummary.skippedSupply;
  training.decisionsSkippedDanger += updateSummary.skippedDanger;
  mergeDmmTrainingDiagnostics(training.dmmDiagnostics, fight.dmmDiagnostics);
}

const after = evaluatePolicy(policy, seedBase + 0xa11e, evalFights);
const baselineAfter = evaluatePolicy(initialPolicy, seedBase + 0xa11e, evalFights);
const acceptAfter = evaluatePolicy(policy, seedBase + 0xc0de, acceptEvalFights);
const acceptBaseline = evaluatePolicy(initialPolicy, seedBase + 0xc0de, acceptEvalFights);
const candidateAccepted = policyEvalScore(acceptAfter) >= policyEvalScore(acceptBaseline) - 0.001;
writePolicy(policy, candidatePolicyPath);
if (candidateAccepted) {
  writePolicy(policy, outPolicyPath);
} else {
  writeFileSync(outPolicyPath, initialPolicyText);
}
const report = {
  basePolicy: relativeToProject(basePolicyPath),
  outPolicy: relativeToProject(outPolicyPath),
  report: relativeToProject(reportPath),
  candidatePolicy: relativeToProject(candidatePolicyPath),
  options: {
    trainSeconds,
    maxTicks,
    evalFights,
    acceptEvalFights,
    seedBase,
    learningRate,
    epsilonStart,
    epsilonEnd,
    explorationCandidateCount,
    protectedHp,
    maxBiasDelta,
    setup: "dmm-runtime",
    patterns: dmmPatterns
  },
  training: summarizeAggregate(training),
  before,
  after,
  baselineAfter,
  acceptAfter,
  acceptBaseline,
  candidateAccepted,
  scoreBefore: round(policyEvalScore(before)),
  scoreAfter: round(policyEvalScore(after)),
  scoreBaselineAfter: round(policyEvalScore(baselineAfter)),
  scoreAcceptAfter: round(policyEvalScore(acceptAfter)),
  scoreAcceptBaseline: round(policyEvalScore(acceptBaseline))
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
}

function runDmmRuntimePolicyEval() {
  const policyPath = path.resolve(projectRoot, args.policy ?? path.join("fixtures", "ai", "nh-neural-policy-dmm-candidate.json"));
  const previousPath = path.resolve(projectRoot, args.previous ?? path.join("fixtures", "ai", "nhstaker-selfplay-policy-dmm-hard.tsv"));
  const policy = parseRuntimePolicy(policyPath);
  const previousPolicy = parseRuntimePolicy(previousPath);
  const fights = clampInt(Number(args.fights ?? 12), 2, 20000);
  const cohortFightsPerPattern = clampInt(Number(args["cohort-fights"] ?? Math.max(1, Math.ceil(fights / dmmPatterns.length))), 1, 20000);
  const h2h = evaluateDmmHeadToHead(policy, previousPolicy, fights, seedBase + 0x1234);
  const cohorts = evaluateDmmCohorts(policy, cohortFightsPerPattern, seedBase + 0x5678);
  console.log(JSON.stringify({
    mode: "dmm-runtime-policy-eval",
    policy: relativeToProject(policyPath),
    previous: relativeToProject(previousPath),
    options: {
      fights,
      cohortFightsPerPattern,
      maxTicks,
      seedBase
    },
    headToHead: h2h,
    cohorts
  }, null, 2));
}

function runDmmRuntimeActivityEval() {
  const policyPath = path.resolve(projectRoot, args.policy ?? path.join("fixtures", "ai", "nh-neural-policy-dmm-candidate.json"));
  const policy = parseRuntimePolicy(policyPath);
  const requestedPatterns = String(args.patterns ?? "all")
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
  const patterns =
    requestedPatterns.length === 1 && requestedPatterns[0] === "ALL"
      ? dmmPatterns
      : requestedPatterns.filter((pattern) => dmmPatterns.includes(pattern));
  if (patterns.length === 0) {
    throw new Error(`No valid DMM activity patterns requested: ${requestedPatterns.join(",")}`);
  }
  const fightsPerPattern = clampInt(Number(args.fights ?? 1), 1, 20);
  const rows = [];
  for (let patternIndex = 0; patternIndex < patterns.length; patternIndex += 1) {
    const pattern = patterns[patternIndex];
    for (let fightIndex = 0; fightIndex < fightsPerPattern; fightIndex += 1) {
      const fight = runRuntimeFight({
        policy,
        pattern,
        seed: (seedBase + patternIndex * 100_003 + fightIndex * 101) >>> 0,
        train: false,
        epsilon: 0,
        rng: createMulberry32((seedBase + patternIndex + fightIndex) >>> 0)
      });
      rows.push(summarizeFightActivity(fight, pattern, fightIndex));
    }
  }
  console.log(JSON.stringify({
    mode: "dmm-runtime-activity-eval",
    policy: relativeToProject(policyPath),
    options: {
      patterns,
      fightsPerPattern,
      maxTicks,
      seedBase,
      evaluationCandidateCount
    },
    fights: rows
  }, null, 2));
}

function evaluateDmmHeadToHead(policy, previousPolicy, fights, seed) {
  const aggregate = {
    fights: 0,
    candidateWins: 0,
    previousWins: 0,
    draws: 0,
    candidateDamage: 0,
    previousDamage: 0,
    candidateHealing: 0,
    previousHealing: 0,
    totalTicks: 0
  };
  for (let index = 0; index < fights; index += 1) {
    const candidateAsOpponent = index % 2 === 0;
    const fight = runRuntimeDmmHeadToHeadFight({
      candidatePolicy: policy,
      previousPolicy,
      candidateActorId: candidateAsOpponent ? "opponent" : "local-player",
      previousActorId: candidateAsOpponent ? "local-player" : "opponent",
      seed: (seed + index * 101) >>> 0
    });
    aggregate.fights += 1;
    aggregate.candidateWins += fight.winner === "candidate" ? 1 : 0;
    aggregate.previousWins += fight.winner === "previous" ? 1 : 0;
    aggregate.draws += fight.winner === "draw" ? 1 : 0;
    aggregate.candidateDamage += fight.damageByActor[fight.candidateActorId] ?? 0;
    aggregate.previousDamage += fight.damageByActor[fight.previousActorId] ?? 0;
    aggregate.candidateHealing += fight.healingByActor[fight.candidateActorId] ?? 0;
    aggregate.previousHealing += fight.healingByActor[fight.previousActorId] ?? 0;
    aggregate.totalTicks += fight.endedAtTick;
  }
  return {
    fights: aggregate.fights,
    candidateWins: aggregate.candidateWins,
    previousWins: aggregate.previousWins,
    draws: aggregate.draws,
    candidateWinRate: roundPct(aggregate.candidateWins / Math.max(1, aggregate.fights)),
    previousWinRate: roundPct(aggregate.previousWins / Math.max(1, aggregate.fights)),
    candidateDamage: round(aggregate.candidateDamage / Math.max(1, aggregate.fights)),
    previousDamage: round(aggregate.previousDamage / Math.max(1, aggregate.fights)),
    candidateHealing: round(aggregate.candidateHealing / Math.max(1, aggregate.fights)),
    previousHealing: round(aggregate.previousHealing / Math.max(1, aggregate.fights)),
    fightTicks: round(aggregate.totalTicks / Math.max(1, aggregate.fights))
  };
}

function evaluateDmmCohorts(policy, fightsPerPattern, seed) {
  const rows = dmmPatterns.map((pattern, patternIndex) => {
    const aggregate = {
      fights: 0,
      policyWins: 0,
      cohortWins: 0,
      draws: 0,
      policyDamage: 0,
      cohortDamage: 0,
      policyHealing: 0,
      cohortHealing: 0,
      totalTicks: 0
    };
    for (let fightIndex = 0; fightIndex < fightsPerPattern; fightIndex += 1) {
      const fight = runRuntimeFight({
        policy,
        pattern,
        seed: (seed + patternIndex * 100_003 + fightIndex * 101) >>> 0,
        train: false,
        epsilon: 0,
        rng: createMulberry32((seed + patternIndex + fightIndex) >>> 0)
      });
      aggregate.fights += 1;
      aggregate.policyWins += fight.winner === "policy" ? 1 : 0;
      aggregate.cohortWins += fight.winner === "cohort" ? 1 : 0;
      aggregate.draws += fight.winner === "draw" ? 1 : 0;
      aggregate.policyDamage += fight.policyDamage;
      aggregate.cohortDamage += fight.cohortDamage;
      aggregate.policyHealing += fight.policyHealing;
      aggregate.cohortHealing += fight.cohortHealing;
      aggregate.totalTicks += fight.endedAtTick;
    }
    return {
      pattern,
      fights: aggregate.fights,
      policyWins: aggregate.policyWins,
      cohortWins: aggregate.cohortWins,
      draws: aggregate.draws,
      policyWinRate: roundPct(aggregate.policyWins / Math.max(1, aggregate.fights)),
      cohortWinRate: roundPct(aggregate.cohortWins / Math.max(1, aggregate.fights)),
      policyDamage: round(aggregate.policyDamage / Math.max(1, aggregate.fights)),
      cohortDamage: round(aggregate.cohortDamage / Math.max(1, aggregate.fights)),
      policyHealing: round(aggregate.policyHealing / Math.max(1, aggregate.fights)),
      cohortHealing: round(aggregate.cohortHealing / Math.max(1, aggregate.fights)),
      fightTicks: round(aggregate.totalTicks / Math.max(1, aggregate.fights))
    };
  });
  const totals = rows.reduce((sum, row) => ({
    fights: sum.fights + row.fights,
    policyWins: sum.policyWins + row.policyWins,
    cohortWins: sum.cohortWins + row.cohortWins,
    draws: sum.draws + row.draws
  }), { fights: 0, policyWins: 0, cohortWins: 0, draws: 0 });
  return {
    totals: {
      ...totals,
      policyWinRate: roundPct(totals.policyWins / Math.max(1, totals.fights))
    },
    patterns: rows
  };
}

function runDmmRuntimeRolloutExport() {
  const policyPath = path.resolve(
    projectRoot,
    args.policy ?? path.join("fixtures", "ai", "nh-neural-policy-dmm-candidate.json")
  );
  const policy = parseRuntimePolicy(policyPath);
  const opponentPolicyPath = args["opponent-policy"]
    ? path.resolve(projectRoot, args["opponent-policy"])
    : null;
  const opponentPolicy = opponentPolicyPath ? parseRuntimePolicy(opponentPolicyPath) : null;
  const rolloutPath = path.resolve(projectRoot, args["rollout-out"]);
  const actionIdsPath = path.resolve(projectRoot, args["action-ids-out"] ?? `${rolloutPath}.action-ids.json`);
  const gameSeconds = clampInt(Number(args["game-seconds"] ?? 1800), 10, 86_400);
  const targetGameTicks = clampInt(Number(args["game-ticks"] ?? Math.ceil(gameSeconds / 0.6)), 1, 10_000_000);
  const wallSeconds = args["wall-seconds"] === undefined
    ? null
    : clampInt(Number(args["wall-seconds"]), 10, 86_400);
  const selfPlayRatio = clamp(Number(args["selfplay-ratio"] ?? 0.7), 0, 1);
  const rng = createMulberry32(seedBase >>> 0);
  const writer = createNhrlWriter(rolloutPath);
  const startedAt = Date.now();
  const stats = {
    fights: 0,
    selfPlayFights: 0,
    cohortFights: 0,
    gameTicks: 0,
    rows: 0,
    skippedDecisions: 0,
    selfPlayLocalWins: 0,
    selfPlayOpponentWins: 0,
    selfPlayDraws: 0,
    policyWinsVsCohort: 0,
    cohortWins: 0,
    cohortDraws: 0,
    byPattern: {}
  };

  mkdirSync(path.dirname(actionIdsPath), { recursive: true });
  writeFileSync(actionIdsPath, `${JSON.stringify({ actionIds: dmmTrainingActionIds })}\n`);

  try {
    while (wallSeconds === null ? stats.gameTicks < targetGameTicks : Date.now() - startedAt < wallSeconds * 1000) {
      const progress = wallSeconds === null
        ? Math.min(1, stats.gameTicks / Math.max(1, targetGameTicks))
        : Math.min(1, (Date.now() - startedAt) / Math.max(1, wallSeconds * 1000));
      const epsilon = epsilonStart + (epsilonEnd - epsilonStart) * progress;
      const seed = (seedBase + stats.fights * 101) >>> 0;
      if (rng.next() < selfPlayRatio) {
        const fight = runRuntimeSelfPlayFight({
          policy,
          opponentPolicy,
          seed,
          epsilon,
          rng
        });
        const opponentReward = rewardForActor(fight, "opponent");
        if (!opponentPolicy) {
          const localReward = rewardForActor(fight, "local-player");
          stats.rows += writeDecisionRows(writer, fight.localDecisions, {
            fight,
            actorId: "local-player",
            episodeId: seed,
            endedAtTick: fight.endedAtTick,
            botIndex: 0,
            targetIndex: 1,
            terminalReward: localReward
          });
        }
        stats.rows += writeDecisionRows(writer, fight.opponentDecisions, {
          fight,
          actorId: "opponent",
          episodeId: seed,
          endedAtTick: fight.endedAtTick,
          botIndex: 1,
          targetIndex: 0,
          terminalReward: opponentReward
        });
        stats.skippedDecisions += writer.skippedDecisions;
        writer.skippedDecisions = 0;
        stats.selfPlayFights += 1;
        stats.selfPlayLocalWins += fight.winner === "local-player" ? 1 : 0;
        stats.selfPlayOpponentWins += fight.winner === "opponent" ? 1 : 0;
        stats.selfPlayDraws += fight.winner === "draw" ? 1 : 0;
        stats.gameTicks += Math.max(1, fight.endedAtTick);
      } else {
        const pattern = dmmPatterns[stats.cohortFights % dmmPatterns.length];
        const fight = runRuntimeFight({
          policy,
          pattern,
          seed,
          train: true,
          epsilon,
          rng
        });
        stats.rows += writeDecisionRows(writer, fight.decisions, {
          fight,
          actorId: "opponent",
          episodeId: seed,
          endedAtTick: fight.endedAtTick,
          botIndex: 1,
          targetIndex: 0,
          terminalReward: rewardForPolicyVsCohort(fight)
        });
        stats.skippedDecisions += writer.skippedDecisions;
        writer.skippedDecisions = 0;
        stats.cohortFights += 1;
        stats.policyWinsVsCohort += fight.winner === "policy" ? 1 : 0;
        stats.cohortWins += fight.winner === "cohort" ? 1 : 0;
        stats.cohortDraws += fight.winner === "draw" ? 1 : 0;
        stats.gameTicks += Math.max(1, fight.endedAtTick);
        const patternRow = stats.byPattern[pattern] ?? { fights: 0, policyWins: 0, cohortWins: 0, draws: 0 };
        patternRow.fights += 1;
        patternRow.policyWins += fight.winner === "policy" ? 1 : 0;
        patternRow.cohortWins += fight.winner === "cohort" ? 1 : 0;
        patternRow.draws += fight.winner === "draw" ? 1 : 0;
        stats.byPattern[pattern] = patternRow;
      }
      stats.fights += 1;
    }
  } finally {
    writer.close();
  }

  const report = {
    mode: "dmm-runtime-rollout-export",
    policy: relativeToProject(policyPath),
    opponentPolicy: opponentPolicyPath ? relativeToProject(opponentPolicyPath) : null,
    rollout: rolloutPath,
    actionIds: actionIdsPath,
    options: {
      targetGameTicks: wallSeconds === null ? targetGameTicks : null,
      wallSeconds,
      gameSeconds,
      maxTicks,
      seedBase,
      epsilonStart,
      epsilonEnd,
      selfPlayRatio,
      predecessorOpponentMode: Boolean(opponentPolicy),
      actionCount: dmmTrainingActionIds.length,
      legalMaskBytes: dmmLegalMaskBytes
    },
    elapsedWallSeconds: round((Date.now() - startedAt) / 1000),
    stats: {
      ...stats,
      byPattern: Object.fromEntries(
        Object.entries(stats.byPattern).map(([pattern, row]) => [
          pattern,
          {
            ...row,
            policyWinRate: roundPct(row.policyWins / Math.max(1, row.fights))
          }
        ])
      )
    }
  };
  console.log(JSON.stringify(report, null, 2));
}

function runRuntimeFight({ policy, pattern, seed, train, epsilon, rng }) {
  const dmm = createDmmRuntimeSetup();
  const controller = train
    ? createTrainingController(policy, rng, epsilon)
    : createDmmEvaluationController(policy, seed, "dmm-runtime-eval-policy");
  let state = runtime.createRuntimePlayerCombatState({
    localTile: defaultLocalStartTile,
    opponentTile: defaultOpponentStartTile,
    localLoadoutId: "kodai-robes",
    opponentLoadoutId: "kodai-robes",
    localLevels: runtime.runtimePlayerCombatDefaultLevels,
    opponentLevels: runtime.runtimePlayerCombatDefaultLevels,
    localFixedLevels: runtime.runtimePlayerCombatDefaultLevels,
    opponentFixedLevels: runtime.runtimePlayerCombatDefaultLevels,
    localPrayerPoints: { current: 99, fixed: 99 },
    opponentPrayerPoints: { current: 99, fixed: 99 },
    localSupplies: dmm.supplies,
    opponentSupplies: dmm.supplies,
    localVengeanceTrinketCharges: dmm.vengeanceTrinketCharges,
    opponentVengeanceTrinketCharges: dmm.vengeanceTrinketCharges,
    localSpecialEnergy: 100,
    opponentSpecialEnergy: 100,
    combatStartTick: 0,
    seed
  });
  state = runtime.syncRuntimePlayerCombatStateToInput(state, {
    tiles: runtimeTiles(state),
    equipment: {
      "local-player": dmm.equipment,
      opponent: dmm.equipment
    },
    gearProfiles: {
      "local-player": dmm.profile,
      opponent: dmm.profile
    }
  });

  const fight = {
    winner: null,
    endedAtTick: 0,
    finalState: state,
    decisions: controller.decisions ?? [],
    events: [],
    policyDamage: 0,
    cohortDamage: 0,
    policyHealing: 0,
    cohortHealing: 0,
    policySpecs: 0,
    policyVoidwakerSpecs: 0,
    policyVlsSpecs: 0,
    cohortSpecs: 0,
    cohortVoidwakerSpecs: 0,
    cohortVlsSpecs: 0,
    dmmDiagnostics: controller.dmmDiagnostics ?? createDmmTrainingDiagnostics(),
    pattern
  };
  const cohortMemory = {
    lastOffenceStyle: null,
    lastVisibleOpponentStyle: null
  };
  let observedLocalActor = unknownRuntimeActorView(state, "local-player", dmm);
  let nextPolicyRepositionTick = 0;

  for (let step = 0; step < maxTicks && fight.winner === null; step += 1) {
    const localTileBeforeTick = state.actors["local-player"].tile;
    const cohortAction = chooseCohortAction(pattern, state, cohortMemory);
    state = applyLocalCohortAction(state, cohortAction, dmm);
    cohortMemory.lastOffenceStyle = cohortAction.offenceStyle;
    recordWeaponTick(fight.dmmDiagnostics.cohortWeaponTicks, state.actors["local-player"].equipment.weapon?.itemId);

    const preMovementHitResult = runtime.applyRuntimePlayerCombatPreMovementHits(state, {
      tiles: runtimeTiles(state),
      loadouts: runtimeLoadoutsForState(state),
      equipment: runtimeEquipmentForState(state),
      gearProfiles: {
        "local-player": dmm.profile,
        opponent: dmm.profile
      },
      tileScale: runtimeTileScale,
      clientCycle: state.tick * runtime.runtimePlayerCombatClientCyclesPerGameTick
    });
    state = preMovementHitResult.state;
    const preMovementTickEvents = currentTickEvents(state);
    const preMovementDeaths = preMovementTickEvents.filter((event) => event.kind === "death");
    if (preMovementDeaths.length > 0) {
      fight.events.push(...preMovementTickEvents);
      applyFightDeaths(fight, preMovementDeaths, state.tick + 1);
      fight.finalState = state;
      break;
    }

    const policyResult = runtimePolicy.applyRuntimeOpponentPolicyAction({
      state,
      controller,
      localActor: observedLocalActor,
      opponentActor: runtimeActorView(state, "opponent", dmm),
      allowSourceLoadoutSync: false,
      inPvpCombatArea: true,
      nextRepositionTick: nextPolicyRepositionTick,
      rewardEpisodeId: seed,
      rewardEpisodeActive: true,
      rewardEpisodeStartTick: 0,
      tileScale: runtimeTileScale
    });
    state = policyResult.state;
    nextPolicyRepositionTick = policyResult.nextRepositionTick ?? nextPolicyRepositionTick;
    cohortMemory.lastVisibleOpponentStyle = policyResult.effectiveAction.offenceStyle;
    recordWeaponTick(fight.dmmDiagnostics.policyWeaponTicks, state.actors.opponent.equipment.weapon?.itemId);

    const beforeAdvanceTick = state.tick;
    const cohortWeaponBeforeAdvance = state.actors["local-player"].equipment.weapon?.itemId;
    const policyWeaponBeforeAdvance = state.actors.opponent.equipment.weapon?.itemId;
    const advanced = runtime.advanceRuntimePlayerCombat(state, {
      preMovementTiles: runtimeTiles(state),
      tiles: runtimeTiles(state),
      loadouts: runtimeLoadoutsForState(state),
      equipment: runtimeEquipmentForState(state),
      gearProfiles: {
        "local-player": dmm.profile,
        opponent: dmm.profile
      },
      tileScale: runtimeTileScale,
      clientCycle: beforeAdvanceTick * runtime.runtimePlayerCombatClientCyclesPerGameTick
    });
    state = advanced.state;
    const tickEvents = state.events.filter((event) => event.tick === beforeAdvanceTick);
    fight.events.push(...tickEvents);
    recordAttackWeaponDiagnostics(fight.dmmDiagnostics, tickEvents, cohortWeaponBeforeAdvance, policyWeaponBeforeAdvance);
    observedLocalActor = visibleRuntimeActorViewFromMovement(
      state,
      "local-player",
      dmm,
      localTileBeforeTick,
      state.actors["local-player"].tile
    );
    const deaths = tickEvents.filter((event) => event.kind === "death");
    if (deaths.length > 0) {
      applyFightDeaths(fight, deaths, state.tick);
    }
  }

  fight.finalState = state;
  fight.endedAtTick = fight.endedAtTick || state.tick;
  if (fight.winner === null) {
    const cohortDead = runtime.isRuntimePlayerCombatActorDead(state.actors["local-player"], state.tick);
    const policyDead = runtime.isRuntimePlayerCombatActorDead(state.actors.opponent, state.tick);
    fight.winner = cohortDead && policyDead ? "draw" : cohortDead ? "policy" : policyDead ? "cohort" : "draw";
  }
  summarizeFightEvents(fight);
  return fight;
}

function runRuntimeSelfPlayFight({ policy, opponentPolicy, seed, epsilon, rng }) {
  const dmm = createDmmRuntimeSetup();
  const controllers = {
    "local-player": opponentPolicy
      ? createDmmEvaluationController(opponentPolicy, seed ^ 0x9e3779, "dmm-runtime-predecessor-local")
      : createTrainingController(policy, rng, epsilon, "dmm-runtime-selfplay-local"),
    opponent: createTrainingController(policy, rng, epsilon, "dmm-runtime-selfplay-opponent")
  };
  let state = runtime.createRuntimePlayerCombatState({
    localTile: defaultLocalStartTile,
    opponentTile: defaultOpponentStartTile,
    localLoadoutId: "kodai-robes",
    opponentLoadoutId: "kodai-robes",
    localLevels: runtime.runtimePlayerCombatDefaultLevels,
    opponentLevels: runtime.runtimePlayerCombatDefaultLevels,
    localFixedLevels: runtime.runtimePlayerCombatDefaultLevels,
    opponentFixedLevels: runtime.runtimePlayerCombatDefaultLevels,
    localPrayerPoints: { current: 99, fixed: 99 },
    opponentPrayerPoints: { current: 99, fixed: 99 },
    localSupplies: dmm.supplies,
    opponentSupplies: dmm.supplies,
    localVengeanceTrinketCharges: dmm.vengeanceTrinketCharges,
    opponentVengeanceTrinketCharges: dmm.vengeanceTrinketCharges,
    localSpecialEnergy: 100,
    opponentSpecialEnergy: 100,
    combatStartTick: 0,
    seed
  });
  state = runtime.syncRuntimePlayerCombatStateToInput(state, {
    tiles: runtimeTiles(state),
    equipment: {
      "local-player": dmm.equipment,
      opponent: dmm.equipment
    },
    gearProfiles: {
      "local-player": dmm.profile,
      opponent: dmm.profile
    }
  });

  const fight = {
    winner: null,
    endedAtTick: 0,
    finalState: state,
    events: [],
    localDecisions: controllers["local-player"].decisions ?? [],
    opponentDecisions: controllers.opponent.decisions ?? [],
    damageByActor: {
      "local-player": 0,
      opponent: 0
    },
    healingByActor: {
      "local-player": 0,
      opponent: 0
    }
  };
  const nextRepositionTicks = {
    "local-player": 0,
    opponent: 0
  };
  let observedActorViews = {
    "local-player": unknownRuntimeActorView(state, "local-player", dmm),
    opponent: unknownRuntimeActorView(state, "opponent", dmm)
  };

  for (let step = 0; step < maxTicks && fight.winner === null; step += 1) {
    const tilesBeforeTick = runtimeTiles(state);
    const preMovementHitResult = runtime.applyRuntimePlayerCombatPreMovementHits(state, {
      tiles: runtimeTiles(state),
      loadouts: runtimeLoadoutsForState(state),
      equipment: runtimeEquipmentForState(state),
      gearProfiles: {
        "local-player": dmm.profile,
        opponent: dmm.profile
      },
      tileScale: runtimeTileScale,
      clientCycle: state.tick * runtime.runtimePlayerCombatClientCyclesPerGameTick
    });
    state = preMovementHitResult.state;
    const preMovementTickEvents = currentTickEvents(state);
    const preMovementDeaths = preMovementTickEvents.filter((event) => event.kind === "death");
    if (preMovementDeaths.length > 0) {
      fight.events.push(...preMovementTickEvents);
      applySelfPlayDeaths(fight, preMovementDeaths, state.tick + 1);
      fight.finalState = state;
      break;
    }

    const moved = {
      "local-player": false,
      opponent: false
    };
    const order = runtime.runtimePlayerCombatProcessOrderForTick(state, state.tick);
    for (const actorId of order) {
      if (runtime.isRuntimePlayerCombatActorDead(state.actors[actorId], state.tick)) {
        continue;
      }
      const targetActorId = actorId === "local-player" ? "opponent" : "local-player";
      const applied = applyPolicyForSelfPlayActor({
        state,
        actorId,
        controller: controllers[actorId],
        dmm,
        observedTargetView: observedActorViews[targetActorId],
        nextRepositionTick: nextRepositionTicks[actorId],
        episodeId: seed
      });
      state = applied.state;
      nextRepositionTicks[actorId] = applied.nextRepositionTick;
      moved[actorId] = applied.moved;
    }

    const beforeAdvanceTick = state.tick;
    const advanced = runtime.advanceRuntimePlayerCombat(state, {
      preMovementTiles: runtimeTiles(state),
      tiles: runtimeTiles(state),
      loadouts: runtimeLoadoutsForState(state),
      equipment: runtimeEquipmentForState(state),
      gearProfiles: {
        "local-player": dmm.profile,
        opponent: dmm.profile
      },
      targetRouteMovementConsumed: moved,
      tileScale: runtimeTileScale,
      clientCycle: beforeAdvanceTick * runtime.runtimePlayerCombatClientCyclesPerGameTick
    });
    state = advanced.state;
    const tickEvents = state.events.filter((event) => event.tick === beforeAdvanceTick);
    fight.events.push(...tickEvents);
    observedActorViews = {
      "local-player": visibleRuntimeActorViewFromMovement(
        state,
        "local-player",
        dmm,
        tilesBeforeTick["local-player"],
        state.actors["local-player"].tile
      ),
      opponent: visibleRuntimeActorViewFromMovement(
        state,
        "opponent",
        dmm,
        tilesBeforeTick.opponent,
        state.actors.opponent.tile
      )
    };
    const deaths = tickEvents.filter((event) => event.kind === "death");
    if (deaths.length > 0) {
      applySelfPlayDeaths(fight, deaths, state.tick);
    }
  }

  fight.finalState = state;
  fight.endedAtTick = fight.endedAtTick || state.tick;
  if (fight.winner === null) {
    const localDead = runtime.isRuntimePlayerCombatActorDead(state.actors["local-player"], state.tick);
    const opponentDead = runtime.isRuntimePlayerCombatActorDead(state.actors.opponent, state.tick);
    fight.winner = localDead && opponentDead ? "draw" : opponentDead ? "local-player" : localDead ? "opponent" : "draw";
  }
  summarizeSelfPlayFightEvents(fight);
  return fight;
}

function runRuntimeDmmHeadToHeadFight({ candidatePolicy, previousPolicy, candidateActorId, previousActorId, seed }) {
  const dmm = createDmmRuntimeSetup();
  const controllers = {
    [candidateActorId]: createDmmEvaluationController(candidatePolicy, seed ^ 0x51f15e, "dmm-runtime-eval-candidate"),
    [previousActorId]: createDmmEvaluationController(previousPolicy, seed ^ 0x9e3779, "dmm-runtime-eval-previous")
  };
  let state = runtime.createRuntimePlayerCombatState({
    localTile: defaultLocalStartTile,
    opponentTile: defaultOpponentStartTile,
    localLoadoutId: "kodai-robes",
    opponentLoadoutId: "kodai-robes",
    localLevels: runtime.runtimePlayerCombatDefaultLevels,
    opponentLevels: runtime.runtimePlayerCombatDefaultLevels,
    localFixedLevels: runtime.runtimePlayerCombatDefaultLevels,
    opponentFixedLevels: runtime.runtimePlayerCombatDefaultLevels,
    localPrayerPoints: { current: 99, fixed: 99 },
    opponentPrayerPoints: { current: 99, fixed: 99 },
    localSupplies: dmm.supplies,
    opponentSupplies: dmm.supplies,
    localVengeanceTrinketCharges: dmm.vengeanceTrinketCharges,
    opponentVengeanceTrinketCharges: dmm.vengeanceTrinketCharges,
    localSpecialEnergy: 100,
    opponentSpecialEnergy: 100,
    combatStartTick: 0,
    seed
  });
  state = runtime.syncRuntimePlayerCombatStateToInput(state, {
    tiles: runtimeTiles(state),
    equipment: {
      "local-player": dmm.equipment,
      opponent: dmm.equipment
    },
    gearProfiles: {
      "local-player": dmm.profile,
      opponent: dmm.profile
    }
  });

  const fight = {
    candidateActorId,
    previousActorId,
    winner: null,
    endedAtTick: 0,
    finalState: state,
    events: [],
    damageByActor: {
      "local-player": 0,
      opponent: 0
    },
    healingByActor: {
      "local-player": 0,
      opponent: 0
    }
  };
  const nextRepositionTicks = {
    "local-player": 0,
    opponent: 0
  };
  let observedActorViews = {
    "local-player": unknownRuntimeActorView(state, "local-player", dmm),
    opponent: unknownRuntimeActorView(state, "opponent", dmm)
  };

  for (let step = 0; step < maxTicks && fight.winner === null; step += 1) {
    const tilesBeforeTick = runtimeTiles(state);
    const preMovementHitResult = runtime.applyRuntimePlayerCombatPreMovementHits(state, {
      tiles: runtimeTiles(state),
      loadouts: runtimeLoadoutsForState(state),
      equipment: runtimeEquipmentForState(state),
      gearProfiles: {
        "local-player": dmm.profile,
        opponent: dmm.profile
      },
      tileScale: runtimeTileScale,
      clientCycle: state.tick * runtime.runtimePlayerCombatClientCyclesPerGameTick
    });
    state = preMovementHitResult.state;
    const preMovementTickEvents = currentTickEvents(state);
    const preMovementDeaths = preMovementTickEvents.filter((event) => event.kind === "death");
    if (preMovementDeaths.length > 0) {
      fight.events.push(...preMovementTickEvents);
      applyDmmHeadToHeadDeaths(fight, preMovementDeaths, state.tick + 1);
      fight.finalState = state;
      break;
    }

    const moved = {
      "local-player": false,
      opponent: false
    };
    const order = runtime.runtimePlayerCombatProcessOrderForTick(state, state.tick);
    for (const actorId of order) {
      if (runtime.isRuntimePlayerCombatActorDead(state.actors[actorId], state.tick)) {
        continue;
      }
      const targetActorId = actorId === "local-player" ? "opponent" : "local-player";
      const applied = applyPolicyForSelfPlayActor({
        state,
        actorId,
        controller: controllers[actorId],
        dmm,
        observedTargetView: observedActorViews[targetActorId],
        nextRepositionTick: nextRepositionTicks[actorId],
        episodeId: seed
      });
      state = applied.state;
      nextRepositionTicks[actorId] = applied.nextRepositionTick;
      moved[actorId] = applied.moved;
    }

    const beforeAdvanceTick = state.tick;
    const advanced = runtime.advanceRuntimePlayerCombat(state, {
      preMovementTiles: runtimeTiles(state),
      tiles: runtimeTiles(state),
      loadouts: runtimeLoadoutsForState(state),
      equipment: runtimeEquipmentForState(state),
      gearProfiles: {
        "local-player": dmm.profile,
        opponent: dmm.profile
      },
      targetRouteMovementConsumed: moved,
      tileScale: runtimeTileScale,
      clientCycle: beforeAdvanceTick * runtime.runtimePlayerCombatClientCyclesPerGameTick
    });
    state = advanced.state;
    const tickEvents = state.events.filter((event) => event.tick === beforeAdvanceTick);
    fight.events.push(...tickEvents);
    observedActorViews = {
      "local-player": visibleRuntimeActorViewFromMovement(
        state,
        "local-player",
        dmm,
        tilesBeforeTick["local-player"],
        state.actors["local-player"].tile
      ),
      opponent: visibleRuntimeActorViewFromMovement(
        state,
        "opponent",
        dmm,
        tilesBeforeTick.opponent,
        state.actors.opponent.tile
      )
    };
    const deaths = tickEvents.filter((event) => event.kind === "death");
    if (deaths.length > 0) {
      applyDmmHeadToHeadDeaths(fight, deaths, state.tick);
    }
  }

  fight.finalState = state;
  fight.endedAtTick = fight.endedAtTick || state.tick;
  if (fight.winner === null) {
    const candidateDead = runtime.isRuntimePlayerCombatActorDead(state.actors[candidateActorId], state.tick);
    const previousDead = runtime.isRuntimePlayerCombatActorDead(state.actors[previousActorId], state.tick);
    fight.winner = candidateDead && previousDead ? "draw" : previousDead ? "candidate" : candidateDead ? "previous" : "draw";
  }
  summarizeSelfPlayFightEvents(fight);
  return fight;
}

function applyPolicyForSelfPlayActor(input) {
  if (input.actorId === "opponent") {
    const result = runtimePolicy.applyRuntimeOpponentPolicyAction({
      state: input.state,
      controller: input.controller,
      localActor: input.observedTargetView,
      opponentActor: runtimeActorView(input.state, "opponent", input.dmm),
      allowSourceLoadoutSync: false,
      inPvpCombatArea: true,
      selfPlayMode: true,
      nextRepositionTick: input.nextRepositionTick,
      rewardEpisodeId: input.episodeId,
      rewardEpisodeActive: true,
      rewardEpisodeStartTick: 0,
      tileScale: runtimeTileScale
    });
    return {
      state: result.state,
      effectiveAction: result.effectiveAction,
      moved: result.opponentMovedThisTick,
      nextRepositionTick: result.nextRepositionTick ?? input.nextRepositionTick
    };
  }

  const swappedState = swapRuntimeStateRoles(input.state);
  const result = runtimePolicy.applyRuntimeOpponentPolicyAction({
    state: swappedState,
    controller: input.controller,
    localActor: input.observedTargetView,
    opponentActor: runtimeActorView(swappedState, "opponent", input.dmm),
    allowSourceLoadoutSync: false,
    inPvpCombatArea: true,
    selfPlayMode: true,
    nextRepositionTick: input.nextRepositionTick,
    rewardEpisodeId: input.episodeId,
    rewardEpisodeActive: true,
    rewardEpisodeStartTick: 0,
    tileScale: runtimeTileScale
  });
  return {
    state: swapRuntimeStateRoles(result.state),
    effectiveAction: result.effectiveAction,
    moved: result.opponentMovedThisTick,
    nextRepositionTick: result.nextRepositionTick ?? input.nextRepositionTick
  };
}

function applyDmmHeadToHeadDeaths(fight, deaths, endedAtTick) {
  const candidateDead = deaths.some((event) => event.actorId === fight.candidateActorId);
  const previousDead = deaths.some((event) => event.actorId === fight.previousActorId);
  fight.winner = candidateDead && previousDead ? "draw" : previousDead ? "candidate" : candidateDead ? "previous" : null;
  fight.endedAtTick = endedAtTick;
}

function applySelfPlayDeaths(fight, deaths, endedAtTick) {
  const localDead = deaths.some((event) => event.actorId === "local-player");
  const opponentDead = deaths.some((event) => event.actorId === "opponent");
  fight.winner = localDead && opponentDead ? "draw" : opponentDead ? "local-player" : localDead ? "opponent" : null;
  fight.endedAtTick = endedAtTick;
}

function summarizeSelfPlayFightEvents(fight) {
  for (const event of fight.events) {
    if (event.kind === "hitsplat" && event.damage > 0 && event.attackerId in fight.damageByActor) {
      fight.damageByActor[event.attackerId] += event.damage;
    }
    if (event.kind === "supply" && event.healed > 0 && event.actorId in fight.healingByActor) {
      fight.healingByActor[event.actorId] += event.healed;
    }
  }
}

function currentTickEvents(state) {
  return state.events.filter((event) => event.tick === state.tick);
}

function applyFightDeaths(fight, deaths, endedAtTick) {
  const cohortDead = deaths.some((event) => event.actorId === "local-player");
  const policyDead = deaths.some((event) => event.actorId === "opponent");
  fight.winner = cohortDead && policyDead ? "draw" : cohortDead ? "policy" : "cohort";
  fight.endedAtTick = endedAtTick;
}

function createTrainingController(policy, rng, epsilon, id = "dmm-runtime-training-policy") {
  const featureState = policyFeatures.createNhPolicyFeatureState();
  const decisions = [];
  const dmmDiagnostics = createDmmTrainingDiagnostics();
  let activeEpisodeId = null;
  let lastContextTick = null;
  return {
    id,
    decisions,
    dmmDiagnostics,
    chooseAction(context) {
      const rewardEpisodeActive = context.rewardEpisodeActive ?? true;
      const rewardEpisodeId = context.rewardEpisodeId ?? 0;
      if (context.rewardEpisodeId === undefined && lastContextTick !== null && context.tick < lastContextTick) {
        policyFeatures.resetNhPolicyFeatureState(featureState);
        activeEpisodeId = null;
      }
      if (!rewardEpisodeActive || rewardEpisodeId < 0) {
        policyFeatures.resetNhPolicyFeatureState(featureState);
        activeEpisodeId = null;
      } else if (activeEpisodeId !== rewardEpisodeId) {
        policyFeatures.resetNhPolicyFeatureState(featureState);
        activeEpisodeId = rewardEpisodeId;
      }
      const features = policyFeatures.encodeNhPolicyFeatures(context, featureState);
      let rankings = rankDmmTrainingActions(policy, features, 96, context, rng);
      if (rankings.length === 0) {
        rankings = rankDmmTrainingCandidateActions(
          policy,
          features,
          sampledExplorationActionCandidates(rng, []),
          96,
          context
        ).filter((ranking) => isDmmTrainingActionId(ranking.action));
      }
      let selected = rankings[0];
      let exploratory = false;
      let behaviorLogProbability = 0;
      if (rng.next() < epsilon) {
        const explorationRankings = rankDmmTrainingCandidateActions(
          policy,
          features,
          sampledExplorationActionCandidates(rng, rankings),
          96,
          context
        );
        selected = explorationRankings[Math.floor(rng.next() * explorationRankings.length)] ?? rankings[0];
        exploratory = true;
        behaviorLogProbability = -Math.log(Math.max(1, explorationRankings.length));
      }
      if (selected) {
        recordPolicyDecisionDiagnostics(dmmDiagnostics, context, selected.decoded);
        decisions.push({
          action: selected.action,
          compactAction: dmmActionIdToCompactIndex.get(selected.action),
          decoded: selected.decoded,
          features: Array.from(features),
          tick: context.tick,
          selfHp: context.self.stats.hitpoints.current,
          lastTakenHit: Math.max(0, Number(context.self.lastTakenHit ?? 0)),
          dangerState: isPolicyDangerTrainingState(context, selected.decoded),
          exploratory,
          selectedScore: Number(selected.score ?? 0),
          behaviorLogProbability,
          validActionCount: dmmTrainingActionIds.length
        });
      }
      lastContextTick = context.tick;
      return selected?.decoded ?? botPolicy.scriptedNhController?.chooseAction?.(context) ?? policyBridge.decodeNhPolicyAction(0);
    },
    getLastRankings() {
      return [];
    }
  };
}

function createDmmEvaluationController(policy, seed, id = "dmm-runtime-eval-policy") {
  const featureState = policyFeatures.createNhPolicyFeatureState();
  const evaluationRng = createMulberry32(seed >>> 0);
  let activeEpisodeId = null;
  let lastContextTick = null;
  let lastRankings = [];
  return {
    id,
    chooseAction(context) {
      const rewardEpisodeActive = context.rewardEpisodeActive ?? true;
      const rewardEpisodeId = context.rewardEpisodeId ?? 0;
      if (context.rewardEpisodeId === undefined && lastContextTick !== null && context.tick < lastContextTick) {
        policyFeatures.resetNhPolicyFeatureState(featureState);
        activeEpisodeId = null;
      }
      if (!rewardEpisodeActive || rewardEpisodeId < 0) {
        policyFeatures.resetNhPolicyFeatureState(featureState);
        activeEpisodeId = null;
      } else if (activeEpisodeId !== rewardEpisodeId) {
        policyFeatures.resetNhPolicyFeatureState(featureState);
        activeEpisodeId = rewardEpisodeId;
      }
      const features = policyFeatures.encodeNhPolicyFeatures(context, featureState);
      if (policy?.kind === "neural") {
        const candidates = evaluationCandidateCount >= dmmTrainingActionIds.length
          ? dmmTrainingActionIds
          : sampledTrainingActionCandidates(evaluationRng, evaluationCandidateCount);
        lastRankings = rankDmmTrainingCandidateActions(
          policy,
          features,
          candidates,
          5,
          context
        );
      } else {
        lastRankings = botPolicy.rankNhPolicyActionsFromFeatures(policy, features, 5, context)
          .filter((ranking) => isDmmTrainingActionCandidate(ranking.action));
      }
      lastContextTick = context.tick;
      return lastRankings[0]?.decoded ?? botPolicy.scriptedNhController?.chooseAction?.(context) ?? policyBridge.decodeNhPolicyAction(0);
    },
    getLastRankings() {
      return lastRankings;
    }
  };
}

function rankDmmTrainingActions(policy, features, limit, context, rng) {
  if (policy?.kind === "neural") {
    if (rankingCandidateCount < dmmTrainingActionIds.length && rng) {
      return rankDmmTrainingCandidateActions(
        policy,
        features,
        sampledTrainingActionCandidates(rng, rankingCandidateCount),
        limit,
        context
      );
    }
    return botPolicy.rankNhNeuralPolicyActionsFromFeatures(policy, features, limit)
      .filter((ranking) => isDmmTrainingActionId(ranking.action));
  }
  return botPolicy.rankNhPolicyActionsFromFeatures(policy, features, limit, context)
    .filter((ranking) => isDmmTrainingActionId(ranking.action));
}

function rankDmmTrainingCandidateActions(policy, features, candidates, limit, context) {
  if (policy?.kind !== "neural") {
    return botPolicy.rankNhPolicyCandidateActionsFromFeatures(policy, features, candidates, limit, context)
      .filter((ranking) => isDmmTrainingActionId(ranking.action));
  }
  const candidateSet = new Set(candidates.filter(isDmmTrainingActionId));
  if (candidateSet.size === 0) {
    return [];
  }
  return botPolicy.rankNhNeuralPolicyCandidateActionsFromFeatures(policy, features, [...candidateSet], limit)
    .filter((ranking) => isDmmTrainingActionId(ranking.action));
}

function sampledExplorationActionCandidates(rng, rankings) {
  const candidates = new Set(rankings.map((ranking) => ranking.action).filter(isDmmTrainingActionId));
  for (const action of sampledTrainingActionCandidates(rng, explorationCandidateCount)) {
    candidates.add(action);
  }
  return [...candidates];
}

function sampledTrainingActionCandidates(rng, count) {
  const candidates = new Set();
  while (candidates.size < count) {
    candidates.add(dmmTrainingActionIds[Math.floor(rng.next() * dmmTrainingActionIds.length)] ?? 0);
  }
  return [...candidates];
}

function isDmmTrainingActionCandidate(action) {
  if (!Number.isInteger(action) || action < 0 || action >= policyBridge.nhPolicyActionCount) {
    return false;
  }
  const decoded = policyBridge.decodeNhPolicyAction(action);
  return (
    dmmAllowedEquipmentIntents.has(decoded.equipmentIntent ?? "style_loadout") &&
    dmmAllowedAttackIntents.has(decoded.attackIntent ?? "attack")
  );
}

function isDmmTrainingActionId(action) {
  return dmmActionIdToCompactIndex.has(action);
}

function createDmmTrainingActionIds() {
  const baseActions = new Set();
  if (existsSync(outPolicyPath)) {
    const text = readFileSync(outPolicyPath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const parts = rawLine.split("\t");
      if ((parts[0] !== "ow" && parts[0] !== "act") || parts.length < 2) {
        continue;
      }
      const action = Number(parts[1]);
      if (!Number.isInteger(action) || action < 0 || action >= policyBridge.nhPolicyActionCount) {
        continue;
      }
      const decoded = policyBridge.decodeNhPolicyAction(action);
      if (!dmmAllowedEquipmentIntents.has(decoded.equipmentIntent ?? "style_loadout")) {
        continue;
      }
      baseActions.add(policyBridge.encodeNhPolicyAction({
        ...decoded,
        equipmentIntent: "style_loadout"
      }));
    }
  }
  if (baseActions.size === 0) {
    for (let action = 0; action < policyBridge.nhPolicyV1ActionCount; action += 1) {
      baseActions.add(policyBridge.encodeNhPolicyAction({
        ...policyBridge.decodeNhPolicyAction(action),
        equipmentIntent: "style_loadout"
      }));
    }
  }

  const expanded = new Set();
  for (const action of [...baseActions].sort((left, right) => left - right)) {
    const decoded = policyBridge.decodeNhPolicyAction(action);
    for (const attackIntent of dmmAllowedAttackIntentList) {
      for (const equipmentIntent of dmmAllowedEquipmentIntentList) {
        expanded.add(policyBridge.encodeNhPolicyAction({
          ...decoded,
          attackIntent,
          equipmentIntent
        }));
      }
    }
  }
  return [...expanded].sort((left, right) => left - right);
}

function applyFightUpdates(policy, decisions, fight, lr) {
  const summary = {
    seen: decisions.length,
    updated: 0,
    skippedSupply: 0,
    skippedDanger: 0
  };
  if (decisions.length === 0) {
    return summary;
  }
  const winSignal = fight.winner === "policy" ? 1 : fight.winner === "cohort" ? -1 : 0;
  const damageSignal = clampSigned((fight.policyDamage - fight.cohortDamage) / 140);
  const healSignal = clampSigned((fight.policyHealing - fight.cohortHealing) / 160) * 0.25;
  const advantage = clampSigned(winSignal * 0.8 + damageSignal + healSignal);
  if (Math.abs(advantage) < 0.02) {
    return summary;
  }
  const step = lr * advantage / Math.sqrt(Math.max(1, decisions.length / 18));
  for (const decision of decisions) {
    if (isSupplySensitiveAction(decision.action)) {
      summary.skippedSupply += 1;
      continue;
    }
    if (decision.dangerState) {
      summary.skippedDanger += 1;
      continue;
    }
    const weights = mutableActionWeights(policy, decision.action);
    const previous = weights.get(policyFeatures.nhPolicyBiasFeatureIndex) ?? 0;
    const initialBias = initialBiasByAction.get(decision.action) ?? 0;
    const cappedDelta = Number.isFinite(maxBiasDelta) ? Math.max(0, maxBiasDelta) : 0.35;
    weights.set(
      policyFeatures.nhPolicyBiasFeatureIndex,
      clamp(previous + step, initialBias - cappedDelta, initialBias + cappedDelta)
    );
    const visits = policy.actionVisits.find((entry) => entry.action === decision.action);
    if (visits) {
      visits.visits += 1;
    }
    summary.updated += 1;
  }
  policy.counters.decisions += decisions.length;
  policy.counters.samples += decisions.length;
  return summary;
}

function policyBiasMap(policy) {
  const biases = new Map();
  for (const action of dmmTrainingActionIds) {
    biases.set(action, policy.weightsByAction.get(action)?.get(policyFeatures.nhPolicyBiasFeatureIndex) ?? 0);
  }
  return biases;
}

function isSupplySensitiveAction(action) {
  const decoded = policyBridge.decodeNhPolicyAction(action);
  return decoded.supplyIntent !== "none";
}

function isPolicyDangerTrainingState(context, action) {
  if (action.supplyIntent !== "none") {
    return true;
  }
  const selfHp = Number(context.self.stats.hitpoints.current ?? 99);
  const lastTakenHit = Math.max(0, Number(context.self.lastTakenHit ?? 0));
  const hpDanger = selfHp <= protectedHp;
  const recentDamageDanger = lastTakenHit >= 12 || (lastTakenHit > 0 && selfHp <= 82);
  return hpDanger || recentDamageDanger;
}

function mutableActionWeights(policy, action) {
  let weights = policy.weightsByAction.get(action);
  if (!weights) {
    weights = new Map();
    policy.weightsByAction.set(action, weights);
  }
  return weights;
}

function evaluatePolicy(policy, seed, fights) {
  const aggregate = {
    fights: 0,
    policyWins: 0,
    cohortWins: 0,
    draws: 0,
    policyDamage: 0,
    cohortDamage: 0,
    policyHealing: 0,
    cohortHealing: 0,
    policySpecs: 0,
    policyVoidwakerSpecs: 0,
    policyVlsSpecs: 0,
    byPattern: new Map()
  };
  for (let index = 0; index < fights; index += 1) {
    const pattern = dmmPatterns[index % dmmPatterns.length];
    const fight = runRuntimeFight({
      policy,
      pattern,
      seed: (seed + index * 101) >>> 0,
      train: false,
      epsilon: 0,
      rng: createMulberry32((seed + index) >>> 0)
    });
    aggregate.fights += 1;
    aggregate.policyWins += fight.winner === "policy" ? 1 : 0;
    aggregate.cohortWins += fight.winner === "cohort" ? 1 : 0;
    aggregate.draws += fight.winner === "draw" ? 1 : 0;
    aggregate.policyDamage += fight.policyDamage;
    aggregate.cohortDamage += fight.cohortDamage;
    aggregate.policyHealing += fight.policyHealing;
    aggregate.cohortHealing += fight.cohortHealing;
    aggregate.policySpecs += fight.policySpecs;
    aggregate.policyVoidwakerSpecs += fight.policyVoidwakerSpecs;
    aggregate.policyVlsSpecs += fight.policyVlsSpecs;
    const row = aggregate.byPattern.get(pattern) ?? { fights: 0, policyWins: 0, cohortWins: 0, draws: 0 };
    row.fights += 1;
    row.policyWins += fight.winner === "policy" ? 1 : 0;
    row.cohortWins += fight.winner === "cohort" ? 1 : 0;
    row.draws += fight.winner === "draw" ? 1 : 0;
    aggregate.byPattern.set(pattern, row);
  }
  return {
    ...summarizeAggregate(aggregate),
    byPattern: [...aggregate.byPattern.entries()].map(([pattern, row]) => ({
      pattern,
      ...row,
      policyWinRate: roundPct(row.policyWins / Math.max(1, row.fights))
    }))
  };
}

function summarizeFightEvents(fight) {
  for (const event of fight.events) {
    if (event.kind === "hitsplat" && event.damage > 0) {
      if (event.attackerId === "opponent") {
        fight.policyDamage += event.damage;
      } else if (event.attackerId === "local-player") {
        fight.cohortDamage += event.damage;
      }
    }
    if (event.kind === "supply" && event.healed > 0) {
      if (event.actorId === "opponent") {
        fight.policyHealing += event.healed;
      } else if (event.actorId === "local-player") {
        fight.cohortHealing += event.healed;
      }
    }
    if (event.kind === "attack" && event.attackerId === "opponent" && event.specialAttack) {
      fight.policySpecs += 1;
      fight.policyVoidwakerSpecs += event.specialAttack === "voidwaker" ? 1 : 0;
      fight.policyVlsSpecs += event.specialAttack === "vesta_longsword" ? 1 : 0;
    }
    if (event.kind === "attack" && event.attackerId === "local-player" && event.specialAttack) {
      fight.cohortSpecs += 1;
      fight.cohortVoidwakerSpecs += event.specialAttack === "voidwaker" ? 1 : 0;
      fight.cohortVlsSpecs += event.specialAttack === "vesta_longsword" ? 1 : 0;
    }
  }
}

function summarizeFightActivity(fight, pattern, fightIndex) {
  const halfTick = Math.floor(fight.endedAtTick / 2);
  const activity = {
    pattern,
    fightIndex,
    winner: fight.winner,
    endedAtTick: fight.endedAtTick,
    policyDamage: fight.policyDamage,
    cohortDamage: fight.cohortDamage,
    policyHealing: fight.policyHealing,
    cohortHealing: fight.cohortHealing,
    policy: createActorActivitySummary(),
    cohort: createActorActivitySummary()
  };
  for (const event of fight.events) {
    const actorKey =
      event.attackerId === "opponent" || event.actorId === "opponent"
        ? "policy"
        : event.attackerId === "local-player" || event.actorId === "local-player"
          ? "cohort"
          : null;
    if (!actorKey) {
      continue;
    }
    const row = activity[actorKey];
    const secondHalf = event.tick >= halfTick;
    if (event.kind === "attack") {
      row.attacks += 1;
      row.lastAttackTick = Math.max(row.lastAttackTick, event.tick);
      if (secondHalf) {
        row.secondHalfAttacks += 1;
      }
    } else if (event.kind === "hitsplat" && event.damage > 0) {
      row.damageHits += 1;
      row.lastDamageTick = Math.max(row.lastDamageTick, event.tick);
      row.damage += event.damage;
      if (secondHalf) {
        row.secondHalfDamageHits += 1;
        row.secondHalfDamage += event.damage;
      }
    } else if (event.kind === "supply" && event.healed > 0) {
      row.heals += 1;
      row.lastHealTick = Math.max(row.lastHealTick, event.tick);
      row.healing += event.healed;
      if (secondHalf) {
        row.secondHalfHeals += 1;
      }
    }
  }
  finalizeActorActivitySummary(activity.policy, fight.endedAtTick);
  finalizeActorActivitySummary(activity.cohort, fight.endedAtTick);
  return activity;
}

function createActorActivitySummary() {
  return {
    attacks: 0,
    secondHalfAttacks: 0,
    damageHits: 0,
    secondHalfDamageHits: 0,
    damage: 0,
    secondHalfDamage: 0,
    heals: 0,
    secondHalfHeals: 0,
    healing: 0,
    lastAttackTick: -1,
    lastDamageTick: -1,
    lastHealTick: -1,
    ticksSinceLastAttack: null,
    ticksSinceLastDamage: null,
    ticksSinceLastHeal: null
  };
}

function finalizeActorActivitySummary(row, endedAtTick) {
  row.ticksSinceLastAttack = row.lastAttackTick < 0 ? null : endedAtTick - row.lastAttackTick;
  row.ticksSinceLastDamage = row.lastDamageTick < 0 ? null : endedAtTick - row.lastDamageTick;
  row.ticksSinceLastHeal = row.lastHealTick < 0 ? null : endedAtTick - row.lastHealTick;
}

function rewardForActor(fight, actorId) {
  const targetActorId = actorId === "local-player" ? "opponent" : "local-player";
  if (fight.winner === actorId) {
    return 1;
  }
  if (fight.winner === targetActorId) {
    return -1;
  }
  const damageAdvantage = (fight.damageByActor[actorId] ?? 0) - (fight.damageByActor[targetActorId] ?? 0);
  return clampSigned(damageAdvantage / 120) * 0.25;
}

function rewardForPolicyVsCohort(fight) {
  if (fight.winner === "policy") {
    return 1;
  }
  if (fight.winner === "cohort") {
    return -1;
  }
  return clampSigned((fight.policyDamage - fight.cohortDamage) / 120) * 0.25;
}

function createNhrlWriter(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const fd = openSync(filePath, "w");
  writeNhrlHeader(fd, {
    inputSize: policyBridge.nhPolicyInputSize,
    featureSize: policyBridge.nhPolicyFeatureSize,
    actionCount: dmmTrainingActionIds.length,
    legalMaskBytes: dmmLegalMaskBytes,
    runtimeProfile: "dmm-runtime",
    trainingMode: "dmm_runtime_dataset",
    dataFolder: "runtime"
  });
  return {
    fd,
    rowId: 0,
    skippedDecisions: 0,
    write(decision, options) {
      const compactAction = Number.isInteger(decision.compactAction)
        ? decision.compactAction
        : dmmActionIdToCompactIndex.get(decision.action);
      if (!Number.isInteger(compactAction) || compactAction < 0 || compactAction >= dmmTrainingActionIds.length) {
        this.skippedDecisions += 1;
        return false;
      }
      const reward = clampSigned(Number(options.reward ?? 0));
      const buffer = Buffer.alloc(nhrlRecordSize());
      let offset = 0;
      offset = writeUInt8(buffer, offset, 1);
      offset = writeInt64(buffer, offset, this.rowId);
      offset = writeInt64(buffer, offset, decision.tick);
      offset = writeInt64(buffer, offset, options.transitionTick);
      offset = writeInt32(buffer, offset, options.botIndex);
      offset = writeInt32(buffer, offset, options.targetIndex);
      offset = writeInt32(buffer, offset, options.episodeId);
      offset = writeInt64(buffer, offset, decision.tick);
      offset = writeInt32(buffer, offset, compactAction);
      offset = writeDouble(buffer, offset, reward);
      offset = writeDouble(buffer, offset, reward);
      offset = writeUInt8(buffer, offset, options.done ? 1 : 0);
      offset = writeUInt8(buffer, offset, decision.exploratory ? 1 : 0);
      offset = writeInt32(buffer, offset, decision.validActionCount ?? dmmTrainingActionIds.length);
      offset = writeDouble(buffer, offset, decision.behaviorLogProbability ?? 0);
      offset = writeDouble(buffer, offset, 0);
      offset = writeDouble(buffer, offset, decision.selectedScore ?? 0);
      offset = writeDouble(buffer, offset, decision.selectedScore ?? 0);
      offset = writeDouble(buffer, offset, 0);
      offset = writeDouble(buffer, offset, 0);
      offset = writeFloatVector(buffer, offset, policyInputFromFeatures(decision.features));
      offset = writeFloatVector(buffer, offset, options.nextInput);
      dmmAllActionsLegalMask.copy(buffer, offset);
      writeSync(fd, buffer);
      this.rowId += 1;
      return true;
    },
    close() {
      closeSync(fd);
    }
  };
}

function writeDecisionRows(writer, decisions, options) {
  let rows = 0;
  for (let index = 0; index < decisions.length; index += 1) {
    const decision = decisions[index];
    const nextDecision = decisions[index + 1];
    const transitionTick = nextDecision?.tick ?? options.endedAtTick;
    const done = index === decisions.length - 1;
    const nextInput = nextDecision
      ? policyInputFromFeatures(nextDecision.features)
      : policyInputFromFeatures(decision.features);
    const reward = rewardForDecisionTransition({
      fight: options.fight,
      actorId: options.actorId,
      startTick: decision.tick,
      endTick: transitionTick,
      terminalReward: done ? options.terminalReward : 0
    });
    const wrote = writer.write(decision, {
      ...options,
      transitionTick,
      nextInput,
      done,
      reward
    });
    rows += wrote ? 1 : 0;
  }
  return rows;
}

function rewardForDecisionTransition(input) {
  if (!input.fight || !input.actorId) {
    return clampSigned(Number(input.terminalReward ?? 0));
  }
  const targetActorId = input.actorId === "local-player" ? "opponent" : "local-player";
  let dealt = 0;
  let taken = 0;
  let healed = 0;
  for (const event of input.fight.events) {
    if (event.tick < input.startTick || event.tick >= input.endTick) {
      continue;
    }
    if (event.kind === "hitsplat" && event.damage > 0) {
      if (event.attackerId === input.actorId) {
        dealt += event.damage;
      } else if (event.targetActorId === input.actorId) {
        taken += event.damage;
      }
    } else if (event.kind === "supply" && event.actorId === input.actorId && event.healed > 0) {
      healed += event.healed;
    }
  }
  return clampSigned((dealt - taken) / 48 + healed / 180 + Number(input.terminalReward ?? 0));
}

function writeNhrlHeader(fd, schema) {
  const header = Buffer.alloc(32);
  header.writeInt32BE(0x4e48524c, 0);
  header.writeInt32BE(2, 4);
  header.writeInt32BE(schema.inputSize, 8);
  header.writeInt32BE(schema.featureSize, 12);
  header.writeInt32BE(schema.actionCount, 16);
  header.writeInt32BE(schema.legalMaskBytes, 20);
  header.writeBigInt64BE(BigInt(Date.now()), 24);
  writeSync(fd, header);
  writeUtf(fd, schema.runtimeProfile);
  writeUtf(fd, schema.trainingMode);
  writeUtf(fd, schema.dataFolder);
}

function writeUtf(fd, value) {
  const payload = Buffer.from(String(value), "utf8");
  if (payload.length > 65535) {
    throw new Error(`NHRL UTF payload is too long: ${payload.length} bytes`);
  }
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length, 0);
  writeSync(fd, length);
  writeSync(fd, payload);
}

function nhrlRecordSize() {
  return 119 + policyBridge.nhPolicyInputSize * 8 + dmmLegalMaskBytes;
}

function policyInputFromFeatures(features) {
  return features.slice(
    policyFeatures.nhPolicyInputFeatureStart,
    policyFeatures.nhPolicyInputFeatureStart + policyBridge.nhPolicyInputSize
  );
}

function writeUInt8(buffer, offset, value) {
  buffer.writeUInt8(value, offset);
  return offset + 1;
}

function writeInt32(buffer, offset, value) {
  buffer.writeInt32BE(Math.trunc(value), offset);
  return offset + 4;
}

function writeInt64(buffer, offset, value) {
  buffer.writeBigInt64BE(BigInt(Math.trunc(value)), offset);
  return offset + 8;
}

function writeDouble(buffer, offset, value) {
  buffer.writeDoubleBE(Number.isFinite(value) ? value : 0, offset);
  return offset + 8;
}

function writeFloatVector(buffer, offset, values) {
  for (let index = 0; index < policyBridge.nhPolicyInputSize; index += 1) {
    const value = Number(values[index] ?? 0);
    buffer.writeFloatBE(Number.isFinite(value) ? value : 0, offset);
    offset += 4;
  }
  return offset;
}

function swapRuntimeStateRoles(state) {
  return {
    ...state,
    processOrder: state.processOrder ? state.processOrder.map(swapActorId) : state.processOrder,
    actors: {
      "local-player": swapRuntimeActorRole(state.actors.opponent, "local-player"),
      opponent: swapRuntimeActorRole(state.actors["local-player"], "opponent")
    },
    queuedHits: state.queuedHits.map(swapQueuedHitRoles),
    events: state.events.map(swapRuntimeEventRoles)
  };
}

function swapRuntimeActorRole(actor, id) {
  return {
    ...actor,
    id,
    targetId: swapActorIdOrNull(actor.targetId),
    lastTargetId: swapActorIdOrNull(actor.lastTargetId),
    gmaul: {
      ...actor.gmaul,
      queuedTargetId: swapActorIdOrUndefined(actor.gmaul.queuedTargetId)
    }
  };
}

function swapQueuedHitRoles(hit) {
  return {
    ...hit,
    attackerId: swapActorId(hit.attackerId),
    defenderId: swapActorId(hit.defenderId)
  };
}

function swapRuntimeEventRoles(event) {
  const next = { ...event };
  if ("actorId" in next) {
    next.actorId = swapActorId(next.actorId);
  }
  if ("attackerId" in next) {
    next.attackerId = swapActorId(next.attackerId);
  }
  if ("defenderId" in next) {
    next.defenderId = swapActorId(next.defenderId);
  }
  if ("targetActorId" in next) {
    next.targetActorId = swapActorId(next.targetActorId);
  }
  return next;
}

function swapActorId(id) {
  return id === "local-player" ? "opponent" : "local-player";
}

function swapActorIdOrNull(id) {
  return id === null || id === undefined ? null : swapActorId(id);
}

function swapActorIdOrUndefined(id) {
  return id === null || id === undefined ? undefined : swapActorId(id);
}

function summarizeAggregate(aggregate) {
  return {
    fights: aggregate.fights,
    policyWins: aggregate.policyWins,
    cohortWins: aggregate.cohortWins,
    draws: aggregate.draws,
    policyWinRate: roundPct(aggregate.policyWins / Math.max(1, aggregate.fights)),
    cohortWinRate: roundPct(aggregate.cohortWins / Math.max(1, aggregate.fights)),
    policyDamage: round(aggregate.policyDamage / Math.max(1, aggregate.fights)),
    cohortDamage: round(aggregate.cohortDamage / Math.max(1, aggregate.fights)),
    policyHealing: round((aggregate.policyHealing ?? 0) / Math.max(1, aggregate.fights)),
    cohortHealing: round((aggregate.cohortHealing ?? 0) / Math.max(1, aggregate.fights)),
    policySpecs: aggregate.policySpecs,
    policyVoidwakerSpecs: aggregate.policyVoidwakerSpecs,
    policyVlsSpecs: aggregate.policyVlsSpecs,
    cohortSpecs: aggregate.cohortSpecs ?? 0,
    cohortVoidwakerSpecs: aggregate.cohortVoidwakerSpecs ?? 0,
    cohortVlsSpecs: aggregate.cohortVlsSpecs ?? 0,
    decisionsSeen: aggregate.decisionsSeen ?? 0,
    decisionsUpdated: aggregate.decisionsUpdated ?? 0,
    decisionsSkippedSupply: aggregate.decisionsSkippedSupply ?? 0,
    decisionsSkippedDanger: aggregate.decisionsSkippedDanger ?? 0,
    dmmDiagnostics: aggregate.dmmDiagnostics ? summarizeDmmTrainingDiagnostics(aggregate.dmmDiagnostics) : undefined
  };
}

function createDmmTrainingDiagnostics() {
  return {
    observedVoidwaker: createPrayerSplitDiagnostics(),
    observedVoidwakerSpecActive: createPrayerSplitDiagnostics(),
    observedVoidwakerMeleeReachable: createPrayerSplitDiagnostics(),
    observedVestaLongsword: createPrayerSplitDiagnostics(),
    observedNoxiousHalberd: createPrayerSplitDiagnostics(),
    policyWeaponTicks: {},
    cohortWeaponTicks: {},
    policyAttackWeaponTicks: {},
    cohortAttackWeaponTicks: {},
    policyAttackSpecials: {},
    cohortAttackSpecials: {},
    policyAttackIntents: {},
    policyEquipmentIntents: {}
  };
}

function createPrayerSplitDiagnostics() {
  return {
    decisions: 0,
    prayers: {}
  };
}

function recordPolicyDecisionDiagnostics(diagnostics, context, action) {
  recordCount(diagnostics.policyAttackIntents, action.attackIntent ?? "attack");
  recordCount(diagnostics.policyEquipmentIntents, action.equipmentIntent ?? "style_loadout");
  const weaponItemId = context.opponent.equipment?.weapon?.itemId;
  if (weaponItemId === dmmVoidwakerItemId) {
    recordPrayerSplit(diagnostics.observedVoidwaker, action.defencePrayer);
    if (context.opponent.specialActive === true) {
      recordPrayerSplit(diagnostics.observedVoidwakerSpecActive, action.defencePrayer);
    }
    if (context.opponentMeleeReachable || context.meleeReachable) {
      recordPrayerSplit(diagnostics.observedVoidwakerMeleeReachable, action.defencePrayer);
    }
  } else if (weaponItemId === dmmVestaLongswordItemId) {
    recordPrayerSplit(diagnostics.observedVestaLongsword, action.defencePrayer);
  } else if (weaponItemId === dmmNoxiousHalberdItemId) {
    recordPrayerSplit(diagnostics.observedNoxiousHalberd, action.defencePrayer);
  }
}

function recordPrayerSplit(split, prayer) {
  split.decisions += 1;
  split.prayers[prayer] = (split.prayers[prayer] ?? 0) + 1;
}

function recordWeaponTick(bucket, itemId) {
  if (!itemId) {
    return;
  }
  const label = dmmWeaponLabel(itemId);
  bucket[label] = (bucket[label] ?? 0) + 1;
}

function recordAttackWeaponDiagnostics(diagnostics, events, cohortWeaponItemId, policyWeaponItemId) {
  for (const event of events) {
    if (event.kind !== "attack") {
      continue;
    }
    if (event.attackerId === "opponent") {
      recordWeaponTick(diagnostics.policyAttackWeaponTicks, policyWeaponItemId);
      if (event.specialAttack) {
        diagnostics.policyAttackSpecials[event.specialAttack] = (diagnostics.policyAttackSpecials[event.specialAttack] ?? 0) + 1;
      }
    } else if (event.attackerId === "local-player") {
      recordWeaponTick(diagnostics.cohortAttackWeaponTicks, cohortWeaponItemId);
      if (event.specialAttack) {
        diagnostics.cohortAttackSpecials[event.specialAttack] = (diagnostics.cohortAttackSpecials[event.specialAttack] ?? 0) + 1;
      }
    }
  }
}

function mergeDmmTrainingDiagnostics(target, source) {
  mergePrayerSplit(target.observedVoidwaker, source.observedVoidwaker);
  mergePrayerSplit(target.observedVoidwakerSpecActive, source.observedVoidwakerSpecActive);
  mergePrayerSplit(target.observedVoidwakerMeleeReachable, source.observedVoidwakerMeleeReachable);
  mergePrayerSplit(target.observedVestaLongsword, source.observedVestaLongsword);
  mergePrayerSplit(target.observedNoxiousHalberd, source.observedNoxiousHalberd);
  mergeCountMap(target.policyWeaponTicks, source.policyWeaponTicks);
  mergeCountMap(target.cohortWeaponTicks, source.cohortWeaponTicks);
  mergeCountMap(target.policyAttackWeaponTicks, source.policyAttackWeaponTicks);
  mergeCountMap(target.cohortAttackWeaponTicks, source.cohortAttackWeaponTicks);
  mergeCountMap(target.policyAttackSpecials, source.policyAttackSpecials);
  mergeCountMap(target.cohortAttackSpecials, source.cohortAttackSpecials);
  mergeCountMap(target.policyAttackIntents, source.policyAttackIntents);
  mergeCountMap(target.policyEquipmentIntents, source.policyEquipmentIntents);
}

function mergePrayerSplit(target, source) {
  target.decisions += source.decisions;
  mergeCountMap(target.prayers, source.prayers);
}

function mergeCountMap(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function summarizeDmmTrainingDiagnostics(diagnostics) {
  return {
    observedVoidwaker: summarizePrayerSplit(diagnostics.observedVoidwaker),
    observedVoidwakerSpecActive: summarizePrayerSplit(diagnostics.observedVoidwakerSpecActive),
    observedVoidwakerMeleeReachable: summarizePrayerSplit(diagnostics.observedVoidwakerMeleeReachable),
    observedVestaLongsword: summarizePrayerSplit(diagnostics.observedVestaLongsword),
    observedNoxiousHalberd: summarizePrayerSplit(diagnostics.observedNoxiousHalberd),
    policyWeaponTicks: sortedCountMap(diagnostics.policyWeaponTicks),
    cohortWeaponTicks: sortedCountMap(diagnostics.cohortWeaponTicks),
    policyAttackWeaponTicks: sortedCountMap(diagnostics.policyAttackWeaponTicks),
    cohortAttackWeaponTicks: sortedCountMap(diagnostics.cohortAttackWeaponTicks),
    policyAttackSpecials: sortedCountMap(diagnostics.policyAttackSpecials),
    cohortAttackSpecials: sortedCountMap(diagnostics.cohortAttackSpecials),
    policyAttackIntents: sortedCountMap(diagnostics.policyAttackIntents),
    policyEquipmentIntents: sortedCountMap(diagnostics.policyEquipmentIntents)
  };
}

function recordCount(bucket, key) {
  bucket[key] = (bucket[key] ?? 0) + 1;
}

function summarizePrayerSplit(split) {
  return {
    decisions: split.decisions,
    prayers: sortedCountMap(split.prayers).map((entry) => ({
      ...entry,
      percent: roundPct(entry.count / Math.max(1, split.decisions))
    }))
  };
}

function sortedCountMap(map) {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function dmmWeaponLabel(itemId) {
  if (itemId === dmmVoidwakerItemId) {
    return "voidwaker";
  }
  if (itemId === dmmVestaLongswordItemId) {
    return "vesta_longsword";
  }
  if (itemId === dmmNoxiousHalberdItemId) {
    return "noxious_halberd";
  }
  const row = serverItems.find((item) => item.id === itemId);
  return row?.name ? `${itemId}:${row.name}` : String(itemId);
}

function policyEvalScore(summary) {
  const fights = Math.max(1, summary.fights);
  const damageAdvantage = summary.policyDamage - summary.cohortDamage;
  const healingAdvantage = (summary.policyHealing ?? 0) - (summary.cohortHealing ?? 0);
  const winRate = summary.policyWins / fights;
  const lossRate = summary.cohortWins / fights;
  return damageAdvantage + healingAdvantage * 0.25 + winRate * 85 - lossRate * 95;
}

function applyLocalCohortAction(state, action, dmm) {
  let nextState = state;
  nextState = applyLocalCohortSupply(nextState, action.supplyIntent);
  const equipment = gearProfile.nhGearProfileActionEquipment({
    currentEquipment: nextState.actors["local-player"].equipment,
    profile: dmm.profile,
    action,
    threatStyle: action.defencePrayer === "protect_from_magic"
      ? "magic"
      : action.defencePrayer === "protect_from_missiles"
        ? "ranged"
        : "melee",
    underPressure: true,
    hitpoints: nextState.actors["local-player"].hitpoints,
    specialEnergy: nextState.actors["local-player"].gmaul.specialEnergy
  });
  nextState = runtime.setRuntimePlayerCombatLoadout(
    nextState,
    "local-player",
    runtimeLoadoutForAction(action),
    equipment
  );
  nextState = runtime.setRuntimePlayerCombatAttackSet(
    nextState,
    "local-player",
    cohortAttackSetForStyle(action.offenceStyle, nextState)
  );
  nextState = runtime.setRuntimePlayerCombatAutocast(
    nextState,
    "local-player",
    action.offenceStyle === "magic" ? "ice-barrage" : null
  );
  nextState = runtime.setRuntimePlayerCombatPrayers(nextState, "local-player", runtimePrayersForAction(action));
  if (action.specIntent !== "none") {
    nextState = runtime.toggleRuntimePlayerCombatSpecial(nextState, "local-player").state;
  }
  nextState = moveLocalCohort(nextState, action);
  if (action.holdAttack) {
    return runtime.resetRuntimePlayerCombatActorTarget(nextState, "local-player");
  }
  return action.offenceStyle === "magic"
    ? runtime.requestRuntimePlayerCombatSpell(nextState, "local-player", "opponent", "ice-barrage")
    : runtime.requestRuntimePlayerCombatAttack(nextState, "local-player", "opponent");
}

function chooseCohortAction(pattern, state, memory) {
  const context = cohortContext(state, memory);
  const phaseTick = state.tick;
  const offenceStyle = cohortStyle(pattern, phaseTick, context, memory);
  return {
    offenceStyle,
    defencePrayer: cohortDefencePrayer(pattern, phaseTick, context),
    movementIntent: cohortMovement(pattern, context, offenceStyle),
    supplyIntent: cohortSupply(pattern, context),
    specIntent: cohortSpec(pattern, offenceStyle, context),
    holdAttack: cohortHoldAttack(pattern, context, offenceStyle),
    extendedSupplyAction: false
  };
}

function cohortContext(state, memory) {
  const self = state.actors["local-player"];
  const opponent = state.actors.opponent;
  return {
    tick: state.tick,
    self: cohortActorContext("local-player", self, memory.lastOffenceStyle),
    opponent: cohortActorContext("opponent", opponent, memory.lastVisibleOpponentStyle),
    meleeReachable: chebyshevDistance(self.tile, opponent.tile) <= 1
  };
}

function cohortActorContext(id, actor, lastStyle) {
  return {
    id,
    tile: actor.tile,
    stats: { hitpoints: { current: actor.hitpoints, fixed: actor.maxHitpoints } },
    activePrayers: actor.activePrayers,
    attackTimer: actor.attackTimer,
    locks: actor.locks,
    lastOffenceStyle: lastStyle,
    lastVisibleOpponentStyle: lastStyle
  };
}

function cohortStyle(pattern, phaseTick, context, memory) {
  const phase = mod(phaseTick + actorSalt(context.self.id), 12);
  switch (pattern) {
    case "CLOSE_FAKE_RANGE_MAGE_MELEE":
    case "CLOSE_FAKE_MELEE_RANGE_MAGE":
      return cohortCloseRangeBaitStyle(pattern, phaseTick, context, memory);
    case "ONE_TICK_FAKER":
      return attackReady(context.self, context.tick)
        ? context.self.lastOffenceStyle === "ranged" ? "magic" : "ranged"
        : phase % 2 === 0 ? "magic" : "ranged";
    case "MAGE_RANGE_ALTERNATE":
      return phase % 2 === 0 ? "magic" : "ranged";
    case "RANGE_HEAVY":
      return phase % 5 === 4 ? "magic" : "ranged";
    case "MAGE_HEAVY":
      return phase % 5 === 4 ? "ranged" : "magic";
    case "LONG_RANGE_CROSSBOW":
      return phase % 5 === 4 ? "magic" : "ranged";
    case "MELEE_CAMP_UNFROZEN":
      return isFrozenAt(context.self, context.tick) ? "ranged" : "melee";
    case "STAND_UNDER_FREEZE":
      return isFrozenAt(context.opponent, context.tick) ? "melee" : "magic";
    case "SPEC_ROTATION":
      return context.meleeReachable && phase % 4 === 0 ? "melee" : phase % 2 === 0 ? "magic" : "ranged";
    case "SLOW_HUMAN":
      return phase < 5 ? "ranged" : phase < 9 ? "magic" : "melee";
    default:
      return "magic";
  }
}

function cohortCloseRangeBaitStyle(pattern, phaseTick, context, memory) {
  const bait = activeCloseRangeBait(pattern, phaseTick, context, memory);
  const readyInMeleeRange = attackReady(context.self, context.tick) && context.meleeReachable;
  if (pattern === "CLOSE_FAKE_RANGE_MAGE_MELEE") {
    if (readyInMeleeRange) {
      recordCloseRangeBaitAttack(memory, context.tick);
      return "melee";
    }
    return bait.style;
  }
  if (readyInMeleeRange) {
    recordCloseRangeBaitAttack(memory, context.tick);
    return bait.style;
  }
  return "melee";
}

function activeCloseRangeBait(pattern, phaseTick, context, memory) {
  const current = memory.closeRangeBait;
  if (current?.pattern === pattern && current.remaining > 0) {
    return current;
  }
  const generation = Number(memory.closeRangeBaitGeneration ?? 0) + 1;
  memory.closeRangeBaitGeneration = generation;
  const seed = mod(
    phaseTick + actorSalt(context.self.id) * 17 + generation * 31 + (pattern === "CLOSE_FAKE_RANGE_MAGE_MELEE" ? 101 : 211),
    997
  );
  const bait = {
    pattern,
    style: seed % 2 === 0 ? "ranged" : "magic",
    remaining: 3 + mod(Math.floor(seed / 2), 3),
    lastAttackTick: -1
  };
  memory.closeRangeBait = bait;
  return bait;
}

function recordCloseRangeBaitAttack(memory, tick) {
  const bait = memory.closeRangeBait;
  if (!bait || bait.lastAttackTick === tick) {
    return;
  }
  bait.remaining -= 1;
  bait.lastAttackTick = tick;
}

function cohortDefencePrayer(pattern, phaseTick, context) {
  if (pattern === "MELEE_CAMP_UNFROZEN") {
    return "protect_from_melee";
  }
  if (pattern === "MAGE_RANGE_ALTERNATE") {
    return phaseTick % 2 === 0 ? "protect_from_magic" : "protect_from_missiles";
  }
  const likely = context.opponent.lastOffenceStyle ?? context.opponent.lastVisibleOpponentStyle;
  return likely ? protectPrayerForOffence(likely) : activeProtectionPrayer(context.self.activePrayers) ?? "protect_from_magic";
}

function cohortMovement(pattern, context, style) {
  const distance = chebyshevDistance(context.self.tile, context.opponent.tile);
  if (pattern === "CLOSE_FAKE_RANGE_MAGE_MELEE" || pattern === "CLOSE_FAKE_MELEE_RANGE_MAGE") {
    return !isFrozenAt(context.self, context.tick) && distance > 1 ? "close_range" : "pressure";
  }
  if (pattern === "LONG_RANGE_CROSSBOW") {
    return style === "ranged" && !isFrozenAt(context.self, context.tick) && distance < 9 ? "step_out" : "pressure";
  }
  if (pattern === "STAND_UNDER_FREEZE") {
    return !isFrozenAt(context.self, context.tick) && isFrozenAt(context.opponent, context.tick) ? "stand_under" : "pressure";
  }
  if (style === "melee" && distance > 1) {
    return "pressure";
  }
  return "pressure";
}

function cohortHoldAttack(pattern, context, style) {
  if (pattern === "CLOSE_FAKE_RANGE_MAGE_MELEE") {
    return !(style === "melee" && attackReady(context.self, context.tick) && context.meleeReachable);
  }
  if (pattern === "CLOSE_FAKE_MELEE_RANGE_MAGE") {
    return !((style === "ranged" || style === "magic") && attackReady(context.self, context.tick) && context.meleeReachable);
  }
  return false;
}

function cohortSupply(pattern, context) {
  if (context.self.stats.hitpoints.current <= 38) {
    return "double_eat";
  }
  if (context.self.stats.hitpoints.current <= (pattern === "SLOW_HUMAN" ? 68 : 58)) {
    return "safe_eat";
  }
  return "none";
}

function cohortSpec(pattern, style, context) {
  if (style !== "melee" || !context.meleeReachable || !attackReady(context.self, context.tick)) {
    return "none";
  }
  return pattern === "SPEC_ROTATION" || pattern === "MELEE_CAMP_UNFROZEN" ? "use_special" : "none";
}

function applyLocalCohortSupply(state, supplyIntent) {
  let nextState = state;
  for (const group of supplyItemGroupsForIntent(supplyIntent)) {
    for (const item of group) {
      const result = runtime.consumeRuntimePlayerCombatSupply(nextState, "local-player", item);
      if (result.consumed) {
        nextState = result.state;
        break;
      }
    }
  }
  return nextState;
}

function moveLocalCohort(state, action) {
  const actor = state.actors["local-player"];
  const target = state.actors.opponent;
  if (action.movementIntent === "close_range") {
    if (!isFrozenAt(actor, state.tick) && chebyshevDistance(actor.tile, target.tile) > 1) {
      return runtime.syncRuntimePlayerCombatStateToInput(state, { tiles: { "local-player": stepToward(actor.tile, target.tile, false) } });
    }
    return state;
  }
  if (action.movementIntent === "step_out") {
    return runtime.syncRuntimePlayerCombatStateToInput(state, { tiles: { "local-player": stepAway(actor.tile, target.tile) } });
  }
  if (action.movementIntent === "stand_under") {
    return runtime.syncRuntimePlayerCombatStateToInput(state, { tiles: { "local-player": target.tile } });
  }
  if (action.offenceStyle === "melee" && chebyshevDistance(actor.tile, target.tile) > 1) {
    return runtime.syncRuntimePlayerCombatStateToInput(state, { tiles: { "local-player": stepToward(actor.tile, target.tile, false) } });
  }
  return state;
}

function createDmmRuntimeSetup() {
  const equipment = {
    head: visibleItem(26382),
    cape: visibleItem(21791),
    amulet: visibleItem(6585),
    weapon: visibleItem(22647),
    body: visibleItem(26243),
    shield: visibleItem(27251),
    legs: visibleItem(26245),
    hands: visibleItem(31106),
    feet: visibleItem(31097),
    ring: visibleItem(19710),
    ammo: visibleItem(21950)
  };
  const inventorySlots = [
    12695, 22461, 10925, 10925,
    13441, 391, 6685, 10925,
    391, 391, 6685, 6685,
    27238, 26374, 391, 391,
    26386, 11283, 29796, 391,
    7462, 22613, 27690, 391,
    28561, 28561, 391, 391
  ].map((itemId) => ({ itemId, quantity: 1 }));
  const inventoryItems = inventorySlots.map((slot) => visibleItem(slot.itemId));
  const profile = gearProfile.inferNhSelectedGearProfile({
    equipment,
    inventoryItems
  });
  return {
    equipment,
    inventorySlots,
    inventoryItems,
    profile,
    supplies: suppliesForDmmInventory(inventorySlots),
    vengeanceTrinketCharges: countDmmInventoryItem(inventorySlots, 28561)
  };
}

function suppliesForDmmInventory(slots) {
  return {
    manta_ray: countDmmInventoryItem(slots, 391),
    shark: 0,
    anglerfish: countDmmInventoryItem(slots, 13441),
    karambwan: 0,
    saradomin_brew: countDmmInventoryItem(slots, 6685) * 4,
    super_restore: 0,
    sanfew_serum: countDmmInventoryItem(slots, 10925) * 4,
    super_combat: countDmmInventoryItem(slots, 12695) * 4,
    bastion: countDmmInventoryItem(slots, 22461) * 4,
    ranging_potion: 0
  };
}

function countDmmInventoryItem(slots, itemId) {
  return slots.filter((slot) => slot.itemId === itemId).length;
}

function visibleItem(itemId) {
  const row = serverItems.find((item) => item.id === itemId);
  return { itemId, name: row?.name ?? `Item ${itemId}` };
}

function runtimeActorView(state, actorId, dmm) {
  const actor = state.actors[actorId];
  return {
    tile: actor.tile,
    loadoutId: actor.loadoutId,
    equipment: actor.equipment,
    inventoryItems: dmm.inventoryItems,
    inventorySlots: dmm.inventorySlots,
    gearProfile: dmm.profile,
    activePrayers: actor.activePrayers,
    stats: runtimeStats(actor),
    locks: actor.locks,
    movedThisTick: false,
    lastMoveDx: 0,
    lastMoveDy: 0,
    lastVengeanceTrinketCastTick: actor.lastVengeanceTrinketCastTick,
    vengeanceTrinketCasts: actor.vengeanceTrinketCasts,
    observedInfoKnown: true
  };
}

function unknownRuntimeActorView(state, actorId, dmm) {
  const previous = runtimeActorView(state, actorId, dmm);
  return {
    ...previous,
    tile: { x: -runtimeTileScale, z: -runtimeTileScale },
    equipment: {},
    inventoryItems: [],
    inventorySlots: Array.from({ length: 28 }, () => null),
    activePrayers: [],
    stats: {
      ...previous.stats,
      hitpoints: { ...previous.stats.hitpoints, current: -1 },
      prayer: { ...previous.stats.prayer, current: 0 }
    },
    locks: {},
    lastVengeanceTrinketCastTick: -1,
    vengeanceTrinketCasts: 0,
    observedInfoKnown: false
  };
}

function visibleRuntimeActorViewFromMovement(state, actorId, dmm, sourceTile, destinationTile) {
  const movedThisTick = !sameTile(sourceTile, destinationTile);
  return {
    ...runtimeActorView(state, actorId, dmm),
    movedThisTick,
    lastMoveDx: movedThisTick ? Math.round((destinationTile.x - sourceTile.x) / runtimeTileScale) : 0,
    lastMoveDy: movedThisTick ? Math.round((destinationTile.z - sourceTile.z) / runtimeTileScale) : 0,
    observedInfoKnown: true
  };
}

function runtimeStats(actor) {
  return {
    attack: { current: actor.levels.attack, fixed: actor.fixedLevels.attack },
    strength: { current: actor.levels.strength, fixed: actor.fixedLevels.strength },
    defence: { current: actor.levels.defence, fixed: actor.fixedLevels.defence },
    ranged: { current: actor.levels.ranged, fixed: actor.fixedLevels.ranged },
    magic: { current: actor.levels.magic, fixed: actor.fixedLevels.magic },
    hitpoints: { current: actor.hitpoints, fixed: actor.maxHitpoints },
    prayer: { current: actor.prayerPoints, fixed: actor.maxPrayerPoints }
  };
}

function runtimeTiles(state) {
  return {
    "local-player": state.actors["local-player"].tile,
    opponent: state.actors.opponent.tile
  };
}

function runtimeLoadoutsForState(state) {
  return {
    "local-player": state.actors["local-player"].loadoutId,
    opponent: state.actors.opponent.loadoutId
  };
}

function runtimeEquipmentForState(state) {
  return {
    "local-player": state.actors["local-player"].equipment,
    opponent: state.actors.opponent.equipment
  };
}

function runtimeLoadoutForAction(action) {
  if (action.specIntent !== "none") {
    return "tentacle-bandos";
  }
  if (action.offenceStyle === "magic") {
    return "kodai-robes";
  }
  if (action.offenceStyle === "ranged") {
    return "acb-hides";
  }
  return "noxious-halberd";
}

function cohortAttackSetForStyle(style, state) {
  if (style !== "ranged") {
    return 0;
  }
  const actor = state.actors["local-player"];
  const target = state.actors.opponent;
  const weaponId = loadouts.nhLoadouts[actor.loadoutId].weaponId;
  const equipmentWeapon = gearProfile.nhGearProfileWeaponIdForEquipment(actor.equipment) ?? weaponId;
  const baseRange = combat.nhWeaponProfiles[equipmentWeapon].attackRange;
  const longRange = Math.min(baseRange + 2, 10);
  const distance = chebyshevDistance(actor.tile, target.tile);
  return distance >= baseRange && distance <= longRange ? 3 : 1;
}

function runtimePrayersForAction(action) {
  return [action.defencePrayer, offensivePrayerForStyle(action.offenceStyle)];
}

function offensivePrayerForStyle(style) {
  if (style === "magic") {
    return "augury";
  }
  if (style === "ranged") {
    return "rigour";
  }
  return "piety";
}

function protectPrayerForOffence(style) {
  if (style === "magic") {
    return "protect_from_magic";
  }
  if (style === "ranged") {
    return "protect_from_missiles";
  }
  return "protect_from_melee";
}

function activeProtectionPrayer(prayers) {
  if (prayers.includes("protect_from_magic")) {
    return "protect_from_magic";
  }
  if (prayers.includes("protect_from_missiles")) {
    return "protect_from_missiles";
  }
  if (prayers.includes("protect_from_melee")) {
    return "protect_from_melee";
  }
  return null;
}

function supplyItemGroupsForIntent(supplyIntent) {
  if (supplyIntent === "safe_eat") {
    return [["manta_ray", "anglerfish"]];
  }
  if (supplyIntent === "double_eat") {
    return [["manta_ray", "anglerfish"], ["saradomin_brew"]];
  }
  if (supplyIntent === "triple_eat" || supplyIntent === "panic_full") {
    return [["manta_ray", "anglerfish"], ["saradomin_brew"], ["sanfew_serum"]];
  }
  if (supplyIntent === "brew_only") {
    return [["saradomin_brew"]];
  }
  if (supplyIntent === "restore_reboost") {
    return [["sanfew_serum"], ["bastion"], ["super_combat"]];
  }
  return [];
}

function attackReady(actor, tick) {
  const timer = actor.attackTimer ?? {};
  const lastAttackTick = Number(timer.lastAttackTick ?? -100);
  const weaponCooldownTicks = Number(timer.weaponCooldownTicks ?? 0);
  const additiveAttackDelayTicks = Number(timer.additiveAttackDelayTicks ?? 0);
  return Math.max(0, lastAttackTick + weaponCooldownTicks + additiveAttackDelayTicks - tick) === 0;
}

function isFrozenAt(actor, tick) {
  return actor.locks.freezeUntilTick !== undefined && tick < actor.locks.freezeUntilTick;
}

function chebyshevDistance(left, right) {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.z - right.z)) / runtimeTileScale;
}

function stepToward(from, to, allowSameTile) {
  const dx = Math.sign(to.x - from.x);
  const dz = Math.sign(to.z - from.z);
  const candidate = { x: from.x + dx * runtimeTileScale, z: from.z + dz * runtimeTileScale };
  if (!allowSameTile && candidate.x === to.x && candidate.z === to.z) {
    return from;
  }
  return candidate;
}

function stepAway(from, target) {
  const dx = from.x === target.x ? 1 : Math.sign(from.x - target.x);
  const dz = from.z === target.z ? 0 : Math.sign(from.z - target.z);
  return { x: from.x + dx * runtimeTileScale, z: from.z + dz * runtimeTileScale };
}

function sameTile(left, right) {
  return left.x === right.x && left.z === right.z;
}

function actorSalt(id) {
  return id === "local-player" ? 3 : 7;
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function writePolicy(policy, filePath) {
  const rows = [
    `version\t13`,
    `counters\t${Math.max(0, Math.round(policy.counters.decisions))}\t${Math.max(0, Math.round(policy.counters.samples))}\t${Math.max(0, Math.round(policy.counters.exploration))}`
  ];
  const visits = new Map(policy.actionVisits.map((entry) => [entry.action, entry.visits]));
  for (const action of dmmTrainingActionIds) {
    const visitCount = visits.get(action) ?? 0;
    if (visitCount > 0) {
      rows.push(`act\t${action}\t${Math.max(0, Math.round(visitCount))}`);
    }
  }
  for (const [action, weights] of [...policy.weightsByAction.entries()]
    .filter(([action]) => isDmmTrainingActionId(action))
    .sort((a, b) => a[0] - b[0])) {
    for (const [featureIndex, value] of [...weights.entries()].sort((a, b) => a[0] - b[0])) {
      if (Math.abs(value) >= 0.000001) {
        rows.push(`ow\t${action}\t${featureIndex}\t${Number(value).toFixed(9)}`);
      }
    }
  }
  writeFileSync(filePath, `${rows.join("\n")}\n`);
}

function parseRuntimePolicy(filePath) {
  const text = readFileSync(filePath, "utf8");
  const label = path.basename(filePath);
  return filePath.toLowerCase().endsWith(".json")
    ? botPolicy.parseNhNeuralPolicyJson(text, label)
    : botPolicy.parseNhPolicyTsv(text, label);
}

function loadTsModule(relativePath) {
  const resolved = resolveModulePath(path.resolve(projectRoot, relativePath));
  if (moduleCache.has(resolved)) {
    return moduleCache.get(resolved).exports;
  }
  if (resolved.endsWith(".json")) {
    const module = { exports: JSON.parse(readFileSync(resolved, "utf8")) };
    moduleCache.set(resolved, module);
    return module.exports;
  }
  const source = readFileSync(resolved, "utf8");
  const module = { exports: {} };
  moduleCache.set(resolved, module);
  const dirname = path.dirname(resolved);
  const localRequire = (request) => {
    if (request.endsWith(".json")) {
      return loadTsModule(path.relative(projectRoot, path.resolve(dirname, request)));
    }
    if (request.startsWith(".")) {
      return loadTsModule(path.relative(projectRoot, path.resolve(dirname, request)));
    }
    return require(request);
  };
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      resolveJsonModule: true
    },
    fileName: resolved
  }).outputText;
  vm.runInNewContext(output, {
    exports: module.exports,
    module,
    require: localRequire,
    __dirname: dirname,
    __filename: resolved,
    console,
    TextEncoder,
    performance,
    setTimeout,
    clearTimeout
  }, { filename: resolved });
  return module.exports;
}

function resolveModulePath(candidatePath) {
  const candidates = candidatePath.endsWith(".ts") || candidatePath.endsWith(".tsx") || candidatePath.endsWith(".json")
    ? [candidatePath]
    : [candidatePath, `${candidatePath}.ts`, `${candidatePath}.tsx`, `${candidatePath}.json`, path.join(candidatePath, "index.ts")];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return candidates[0];
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith("--")) {
      continue;
    }
    const key = entry.slice(2);
    const next = argv[index + 1];
    parsed[key] = next && !next.startsWith("--") ? next : "true";
    if (next && !next.startsWith("--")) {
      index += 1;
    }
  }
  return parsed;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.trunc(Number.isFinite(value) ? value : min)));
}

function clampSigned(value) {
  return clamp(value, -1, 1);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function roundPct(value) {
  return `${Math.round(value * 1000) / 10}%`;
}

function safeTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function relativeToProject(filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, "/");
}

function createMulberry32(initialSeed) {
  let seed = initialSeed >>> 0;
  return {
    next() {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }
  };
}
