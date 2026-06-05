import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const initialPolicyText = readFileSync(outPolicyPath, "utf8");
const initialPolicy = botPolicy.parseNhPolicyTsv(initialPolicyText, `${path.basename(outPolicyPath)}:initial`);
const policy = botPolicy.parseNhPolicyTsv(initialPolicyText, path.basename(outPolicyPath));
const initialBiasByAction = policyBiasMap(policy);
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

function runRuntimeFight({ policy, pattern, seed, train, epsilon, rng }) {
  const dmm = createDmmRuntimeSetup();
  const controller = train
    ? createTrainingController(policy, rng, epsilon)
    : botPolicy.createNhPolicyController(policy);
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
      const cohortDead = deaths.some((event) => event.actorId === "local-player");
      const policyDead = deaths.some((event) => event.actorId === "opponent");
      fight.winner = cohortDead && policyDead ? "draw" : cohortDead ? "policy" : "cohort";
      fight.endedAtTick = state.tick;
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

function createTrainingController(policy, rng, epsilon) {
  const featureState = policyFeatures.createNhPolicyFeatureState();
  const decisions = [];
  const dmmDiagnostics = createDmmTrainingDiagnostics();
  let activeEpisodeId = null;
  let lastContextTick = null;
  return {
    id: "dmm-runtime-training-policy",
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
      const rankings = botPolicy.rankNhPolicyActionsFromFeatures(policy, features, 96, context);
      const selected = rng.next() < epsilon
        ? rankings[Math.floor(rng.next() * rankings.length)] ?? rankings[0]
        : rankings[0];
      if (selected) {
        recordPolicyDecisionDiagnostics(dmmDiagnostics, context, selected.decoded);
        decisions.push({
          action: selected.action,
          decoded: selected.decoded,
          features,
          tick: context.tick,
          selfHp: context.self.stats.hitpoints.current,
          lastTakenHit: Math.max(0, Number(context.self.lastTakenHit ?? 0)),
          dangerState: isPolicyDangerTrainingState(context, selected.decoded)
        });
      }
      lastContextTick = context.tick;
      return selected?.decoded ?? botPolicy.scriptedNhController?.chooseAction?.(context) ?? rankings[0].decoded;
    },
    getLastRankings() {
      return [];
    }
  };
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
  for (let action = 0; action < botPolicy.nhPolicyActionCount; action += 1) {
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
    cohortAttackSpecials: {}
  };
}

function createPrayerSplitDiagnostics() {
  return {
    decisions: 0,
    prayers: {}
  };
}

function recordPolicyDecisionDiagnostics(diagnostics, context, action) {
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
    cohortAttackSpecials: sortedCountMap(diagnostics.cohortAttackSpecials)
  };
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
  for (let action = 0; action < botPolicy.nhPolicyActionCount; action += 1) {
    const visitCount = visits.get(action) ?? 0;
    if (visitCount > 0) {
      rows.push(`act\t${action}\t${Math.max(0, Math.round(visitCount))}`);
    }
  }
  for (const [action, weights] of [...policy.weightsByAction.entries()].sort((a, b) => a[0] - b[0])) {
    for (const [featureIndex, value] of [...weights.entries()].sort((a, b) => a[0] - b[0])) {
      if (Math.abs(value) >= 0.000001) {
        rows.push(`ow\t${action}\t${featureIndex}\t${Number(value).toFixed(9)}`);
      }
    }
  }
  writeFileSync(filePath, `${rows.join("\n")}\n`);
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
