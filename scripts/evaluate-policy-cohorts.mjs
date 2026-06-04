import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const args = parseArgs(process.argv.slice(2));
const engine = String(args.engine ?? "runtime").trim().toLowerCase();

if (engine !== "standalone") {
  const forwardedArgs = process.argv.slice(2).filter((arg, index, all) => {
    if (arg === "--engine") {
      return false;
    }
    return all[index - 1] !== "--engine";
  });
  const result = spawnSync(
    process.execPath,
    [path.join(projectRoot, "scripts", "evaluate-policy-cohorts-runtime.mjs"), ...forwardedArgs],
    {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 64
    }
  );
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.status ?? (result.error ? 1 : 0));
}

const cohortPatterns = [
  "MELEE_CAMP_UNFROZEN",
  "AGS_REPEAT_SPEC",
  "MAGE_RANGE_ALTERNATE",
  "MAGE_MAGE_RANGE",
  "RANGE_RANGE_MAGE",
  "MAGE_HEAVY",
  "RANGE_HEAVY",
  "STAFF_BAIT_RANGE",
  "CROSSBOW_BAIT_MAGE",
  "PRAYER_CAMP_MELEE",
  "PANIC_EATER",
  "STAND_UNDER_FREEZE",
  "LONG_RANGE_CROSSBOW",
  "ONE_TICK_FAKER",
  "TWO_TICK_FAKER",
  "DELAYED_REACTOR"
];

const policyPath = path.resolve(projectRoot, args.policy ?? path.join("fixtures", "ai", "nhstaker-selfplay-policy-hard.tsv"));
const fightCount = clampInt(Number(args.fights ?? 20), 2, 20000);
const maxTicks = clampInt(Number(args.ticks ?? 160), 24, 2000);
const seedBase = Number(args.seed ?? 0x4e484d);
const topCandidateCount = clampInt(Number(args.candidates ?? 50), 50, 4950);
const candidateMode = normalizeCandidateMode(
  args["candidate-mode"] ?? (args["include-basics"] === "false" ? "visited" : "full")
);
const requestedPatterns = String(args.patterns ?? "all")
  .split(",")
  .map((entry) => entry.trim().toUpperCase())
  .filter(Boolean);

const duel = loadTsModule("src/sim/nh/duel.ts");
const botPolicy = loadTsModule("src/bot/policy.ts");
const policyFeatures = loadTsModule("src/sim/nh/policy-features.ts");
const policyBridge = loadTsModule("src/sim/nh/policy-bridge.ts");

const policy = botPolicy.parseNhPolicyTsv(readFileSync(policyPath, "utf8"), path.basename(policyPath));
const candidateActions = buildCandidateActions(policy, topCandidateCount, candidateMode);
const patterns =
  requestedPatterns.length === 1 && requestedPatterns[0] === "ALL"
    ? cohortPatterns
    : requestedPatterns.filter((pattern) => cohortPatterns.includes(pattern));

if (patterns.length === 0) {
  throw new Error(`No valid cohort patterns requested: ${requestedPatterns.join(",")}`);
}

const rows = patterns.map((pattern, patternIndex) =>
  evaluatePattern(pattern, (seedBase + patternIndex * 100_003) >>> 0)
);
const weakest = [...rows].sort((left, right) => right.weaknessScoreRaw - left.weaknessScoreRaw)[0];

console.log(
  JSON.stringify(
    {
      policy: relativeToProject(policyPath),
      engine: "standalone-duel",
      note:
        "Standalone evaluator: uses duel.runNhDuel and does not apply the live runtime policy action layer. Use --engine runtime or omit --engine for production decisions.",
      options: {
        fights: fightCount,
        maxTicks,
        seedBase,
        candidateActions: candidateActions.length,
        topCandidateCount,
        candidateMode
      },
      weakest: weakest
        ? {
            pattern: weakest.pattern,
            weaknessScore: weakest.weaknessScore,
            decisivePolicyWinRate: weakest.result.decisivePolicyWinRate,
            policyDamageDealt: weakest.averages.policyDamageDealt,
            cohortDamageDealt: weakest.averages.cohortDamageDealt
          }
        : null,
      patterns: rows.map((row) => ({
        pattern: row.pattern,
        weaknessScore: row.weaknessScore,
        result: omitRaw(row.result),
        averages: row.averages,
        policyBehavior: row.policyBehavior,
        cohortBehavior: row.cohortBehavior
      }))
    },
    null,
    2
  )
);

function evaluatePattern(pattern, seed) {
  const aggregate = {
    fights: 0,
    decisive: 0,
    draws: 0,
    policyWins: 0,
    cohortWins: 0,
    policyDamage: 0,
    cohortDamage: 0,
    policyHealing: 0,
    cohortHealing: 0,
    policyFinalHp: 0,
    cohortFinalHp: 0,
    policyStyle: createStyleCounts(),
    cohortStyle: createStyleCounts(),
    policySupply: createSupplyCounts(),
    cohortSupply: createSupplyCounts(),
    policySpec: createSpecCounts(),
    cohortSpec: createSpecCounts(),
    policyAttackStyle: createStyleCounts(),
    cohortAttackStyle: createStyleCounts(),
    prayerChecksByStyle: createStyleCounts(),
    prayerMatchesByStyle: createStyleCounts(),
    policyPrayerTicks: 0,
    policyPrayerMatches: 0
  };

  for (let fight = 0; fight < fightCount; fight += 1) {
    const policyAsSelf = fight % 2 === 0;
    const policyController = createCandidatePolicyController(policy, candidateActions);
    const cohortController = createCohortController(pattern);
    const state = duel.runNhDuel({
      ticks: maxTicks,
      seed: (seed + fight * 101) >>> 0,
      selfController: policyAsSelf ? policyController : cohortController,
      opponentController: policyAsSelf ? cohortController : policyController
    });
    recordFight(aggregate, state, policyAsSelf);
  }

  const decisiveRate = aggregate.decisive === 0 ? 0 : aggregate.policyWins / aggregate.decisive;
  const policyTotalWinRateRaw = aggregate.policyWins / Math.max(1, aggregate.fights);
  const cohortTotalWinRateRaw = aggregate.cohortWins / Math.max(1, aggregate.fights);
  const prayerMatchRateRaw =
    aggregate.policyPrayerTicks === 0 ? 0.5 : aggregate.policyPrayerMatches / aggregate.policyPrayerTicks;
  const damageTotal = aggregate.policyDamage + aggregate.cohortDamage;
  const damageDeficitRaw = damageTotal === 0 ? 0 : (aggregate.cohortDamage - aggregate.policyDamage) / damageTotal;
  const weaknessScoreRaw =
    cohortTotalWinRateRaw * 2 -
    policyTotalWinRateRaw * 1.25 +
    damageDeficitRaw +
    (1 - prayerMatchRateRaw) * 0.2;
  return {
    pattern,
    weaknessScoreRaw,
    weaknessScore: round(weaknessScoreRaw),
    result: {
      policyWins: aggregate.policyWins,
      cohortWins: aggregate.cohortWins,
      draws: aggregate.draws,
      decisivePolicyWinRate: roundPct(decisiveRate),
      decisivePolicyWinRateRaw: decisiveRate,
      policyTotalWinRate: roundPct(policyTotalWinRateRaw),
      policyTotalWinRateRaw,
      cohortTotalWinRate: roundPct(cohortTotalWinRateRaw),
      cohortTotalWinRateRaw
    },
    averages: {
      policyDamageDealt: round(aggregate.policyDamage / aggregate.fights),
      cohortDamageDealt: round(aggregate.cohortDamage / aggregate.fights),
      policyHealing: round(aggregate.policyHealing / aggregate.fights),
      cohortHealing: round(aggregate.cohortHealing / aggregate.fights),
      policyFinalHp: round(aggregate.policyFinalHp / aggregate.fights),
      cohortFinalHp: round(aggregate.cohortFinalHp / aggregate.fights)
    },
    policyBehavior: {
      style: percentMap(aggregate.policyStyle),
      attackStyle: percentMap(aggregate.policyAttackStyle),
      supply: percentMap(aggregate.policySupply),
      spec: percentMap(aggregate.policySpec),
      prayerAttackChecks: aggregate.policyPrayerTicks,
      prayerMatchOnCohortAttack: roundPct(prayerMatchRateRaw),
      prayerMatchOnCohortStyle: roundPct(prayerMatchRateRaw),
      prayerMatchByCohortStyle: prayerMatchByStyleSummary(aggregate.prayerChecksByStyle, aggregate.prayerMatchesByStyle)
    },
    cohortBehavior: {
      style: percentMap(aggregate.cohortStyle),
      attackStyle: percentMap(aggregate.cohortAttackStyle),
      supply: percentMap(aggregate.cohortSupply),
      spec: percentMap(aggregate.cohortSpec)
    }
  };
}

function recordFight(aggregate, state, policyAsSelf) {
  const summary = duel.summarizeNhDuelState(state);
  aggregate.fights += 1;
  const policyId = policyAsSelf ? "self" : "opponent";
  const cohortId = policyAsSelf ? "opponent" : "self";

  const policyDead = summary.finalHp[policyId] <= 0;
  const cohortDead = summary.finalHp[cohortId] <= 0;
  if (policyDead && cohortDead) {
    aggregate.draws += 1;
  } else if (cohortDead) {
    aggregate.policyWins += 1;
    aggregate.decisive += 1;
  } else if (policyDead) {
    aggregate.cohortWins += 1;
    aggregate.decisive += 1;
  } else {
    aggregate.draws += 1;
  }

  aggregate.policyDamage += summary.damage[cohortId];
  aggregate.cohortDamage += summary.damage[policyId];
  aggregate.policyHealing += summary.healing[policyId];
  aggregate.cohortHealing += summary.healing[cohortId];
  aggregate.policyFinalHp += summary.finalHp[policyId];
  aggregate.cohortFinalHp += summary.finalHp[cohortId];

  for (const tick of state.history) {
    const policyAction = policyAsSelf ? tick.selfAction : tick.opponentAction;
    const cohortAction = policyAsSelf ? tick.opponentAction : tick.selfAction;
    recordAction(aggregate.policyStyle, aggregate.policySupply, aggregate.policySpec, policyAction);
    recordAction(aggregate.cohortStyle, aggregate.cohortSupply, aggregate.cohortSpec, cohortAction);
    if (cohortAttackStarted(tick, policyId, policyAction)) {
      aggregate.policyAttackStyle[policyAction.offenceStyle] += 1;
    }
    if (cohortAttackStarted(tick, cohortId, cohortAction)) {
      aggregate.cohortAttackStyle[cohortAction.offenceStyle] += 1;
      aggregate.policyPrayerTicks += 1;
      aggregate.prayerChecksByStyle[cohortAction.offenceStyle] += 1;
      if (policyAction.defencePrayer === protectPrayerForOffence(cohortAction.offenceStyle)) {
        aggregate.policyPrayerMatches += 1;
        aggregate.prayerMatchesByStyle[cohortAction.offenceStyle] += 1;
      }
    }
  }
}

function cohortAttackStarted(tick, cohortId, cohortAction) {
  if (!cohortAction) {
    return false;
  }
  const style = cohortAction.offenceStyle;
  if (style === "magic" || style === "ranged") {
    return tick.visibleEvents.includes(`${tick.tick}-${cohortId}-${style}-projectile`);
  }
  if (style === "melee") {
    return tick.visibleEvents.includes(`${tick.tick}-${cohortId}-gmaul-spotanim`);
  }
  return false;
}

function createCohortController(pattern) {
  return {
    id: `cohort:${pattern}`,
    chooseAction(context) {
      const phaseTick = context.tick;
      const offenceStyle = cohortStyle(pattern, phaseTick, context);
      return {
        offenceStyle,
        defencePrayer: cohortDefencePrayer(pattern, phaseTick, context),
        movementIntent: cohortMovement(pattern, context, offenceStyle),
        supplyIntent: cohortSupply(pattern, context),
        specIntent: cohortSpec(pattern, offenceStyle, context),
        extendedSupplyAction: false
      };
    }
  };
}

function cohortStyle(pattern, phaseTick, context) {
  const phase = mod(phaseTick + actorSalt(context.self.id), 12);
  switch (pattern) {
    case "MELEE_CAMP_UNFROZEN":
      return isFrozenAt(context.self, context.tick) ? "ranged" : "melee";
    case "AGS_REPEAT_SPEC":
      return "melee";
    case "MAGE_RANGE_ALTERNATE":
      return (phase & 1) === 0 ? "magic" : "ranged";
    case "MAGE_MAGE_RANGE":
      return phase % 3 === 2 ? "ranged" : "magic";
    case "RANGE_RANGE_MAGE":
      return phase % 3 === 2 ? "magic" : "ranged";
    case "MAGE_HEAVY":
      return phase % 5 === 4 ? "ranged" : "magic";
    case "RANGE_HEAVY":
      return phase % 5 === 4 ? "magic" : "ranged";
    case "STAFF_BAIT_RANGE":
      return phase % 4 === 3 && attackReady(context.self, context.tick) ? "ranged" : "magic";
    case "CROSSBOW_BAIT_MAGE":
      return phase % 4 === 3 && attackReady(context.self, context.tick) ? "magic" : "ranged";
    case "PRAYER_CAMP_MELEE":
      return duel.scriptedNhController.chooseAction(context).offenceStyle;
    case "PANIC_EATER":
      return phase % 3 === 0 ? "ranged" : "magic";
    case "STAND_UNDER_FREEZE":
      return isFrozenAt(context.opponent, context.tick) ? "melee" : "magic";
    case "LONG_RANGE_CROSSBOW":
      return phase % 5 === 4 ? "magic" : "ranged";
    case "ONE_TICK_FAKER":
      return cohortOneTickFakerStyle(phaseTick, context);
    case "TWO_TICK_FAKER":
      return cohortTwoTickFakerStyle(phaseTick, context);
    case "DELAYED_REACTOR":
      return cohortDelayedReactorStyle(phase, context);
    default:
      return "magic";
  }
}

function cohortOneTickFakerStyle(phaseTick, context) {
  if (!attackReady(context.self, context.tick)) {
    return mod(phaseTick + actorSalt(context.self.id), 2) === 0 ? "magic" : "ranged";
  }
  return context.self.lastOffenceStyle === "ranged" ? "magic" : "ranged";
}

function cohortTwoTickFakerStyle(phaseTick, context) {
  const salt = actorSalt(context.self.id);
  const attackCycle = Math.floor((phaseTick + salt) / 4);
  const shownStyle = attackCycle % 2 === 0 ? "magic" : "ranged";
  if (!attackReady(context.self, context.tick)) {
    return shownStyle;
  }
  return attackCycle % 3 === 2 ? oppositeMageRange(shownStyle) : shownStyle;
}

function cohortDelayedReactorStyle(phase, context) {
  const likely = context.opponent.lastOffenceStyle ?? context.opponent.lastVisibleOpponentStyle;
  if (!likely) {
    return phase % 5 === 4 ? "ranged" : "magic";
  }
  if (attackReady(context.self, context.tick) && phase % 4 === 3) {
    return counterPrayerStyle(likely, false);
  }
  return likely === "melee" ? "ranged" : likely;
}

function cohortDefencePrayer(pattern, phaseTick, context) {
  switch (pattern) {
    case "PRAYER_CAMP_MELEE":
    case "MELEE_CAMP_UNFROZEN":
      return "protect_from_melee";
    case "MAGE_RANGE_ALTERNATE":
      return (phaseTick & 1) === 0 ? "protect_from_magic" : "protect_from_missiles";
    case "MAGE_MAGE_RANGE":
      return mod(phaseTick, 3) === 2 ? "protect_from_missiles" : "protect_from_magic";
    case "RANGE_RANGE_MAGE":
      return mod(phaseTick, 3) === 2 ? "protect_from_magic" : "protect_from_missiles";
    default:
      return chooseScriptedFallbackDefence(context);
  }
}

function cohortMovement(pattern, context, style) {
  const distance = chebyshevDistance(context.self.tile, context.opponent.tile);
  switch (pattern) {
    case "STAND_UNDER_FREEZE":
      return !isFrozenAt(context.self, context.tick) && isFrozenAt(context.opponent, context.tick) && distance > 0
        ? "stand_under"
        : "pressure";
    case "LONG_RANGE_CROSSBOW":
      return style === "ranged" && !isFrozenAt(context.self, context.tick) && distance >= 0 && distance < 9
        ? "step_out"
        : "pressure";
    case "MELEE_CAMP_UNFROZEN":
    case "AGS_REPEAT_SPEC":
      return style === "melee" ? "pressure" : "step_out";
    default:
      return "pressure";
  }
}

function cohortSupply(pattern, context) {
  if (pattern === "PANIC_EATER") {
    if (context.self.stats.hitpoints.current <= 45) {
      return "triple_eat";
    }
    if (context.self.stats.hitpoints.current <= 62) {
      return "double_eat";
    }
  }
  if (context.self.stats.hitpoints.current <= 38) {
    return "double_eat";
  }
  if (context.self.stats.hitpoints.current <= 58) {
    return "safe_eat";
  }
  return "none";
}

function cohortSpec(pattern, style, context) {
  if (pattern !== "AGS_REPEAT_SPEC" || style !== "melee") {
    return "none";
  }
  return context.meleeReachable ? "use_special" : "none";
}

function chooseScriptedFallbackDefence(context) {
  const likely = context.opponent.lastOffenceStyle ?? context.opponent.lastVisibleOpponentStyle;
  return likely ? protectPrayerForOffence(likely) : activeProtectionPrayer(context.self.activePrayers) ?? "protect_from_melee";
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

function counterPrayerStyle(style, wantsFreeze) {
  if (style === "magic") {
    return "ranged";
  }
  if (style === "ranged") {
    return "magic";
  }
  if (style === "melee") {
    return wantsFreeze ? "magic" : "ranged";
  }
  return "magic";
}

function isFrozenAt(actor, tick) {
  return actor.locks.freezeUntilTick !== undefined && tick < actor.locks.freezeUntilTick;
}

function attackReady(actor, tick) {
  return attackDelayRemaining(actor, tick) === 0;
}

function attackDelayRemaining(actor, tick) {
  const timer = actor.attackTimer ?? {};
  if (typeof timer.attackDelayUntilTick === "number") {
    return Math.max(0, timer.attackDelayUntilTick - tick);
  }
  const lastAttackTick = Number(timer.lastAttackTick ?? -100);
  const weaponCooldownTicks = Number(timer.weaponCooldownTicks ?? 0);
  const additiveAttackDelayTicks = Number(timer.additiveAttackDelayTicks ?? 0);
  return Math.max(0, lastAttackTick + weaponCooldownTicks + additiveAttackDelayTicks - tick);
}

function chebyshevDistance(left, right) {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function actorSalt(id) {
  return id === "opponent" ? 1 : 0;
}

function oppositeMageRange(style) {
  return style === "ranged" ? "magic" : "ranged";
}

function recordAction(styleCounts, supplyCounts, specCounts, action) {
  styleCounts[action.offenceStyle] += 1;
  supplyCounts[action.supplyIntent] += 1;
  specCounts[action.specIntent] += 1;
}

function createCandidatePolicyController(parsedPolicy, candidates) {
  const featureState = policyFeatures.createNhPolicyFeatureState();
  let activeEpisodeId = null;
  let lastContextTick = null;
  return {
    id: `candidate-policy:${parsedPolicy.sourceLabel}`,
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
      const ranking = botPolicy.rankNhPolicyCandidateActionsFromFeatures(
        parsedPolicy,
        features,
        candidates,
        1,
        context,
        () => false
      );
      lastContextTick = context.tick;
      return ranking[0]?.decoded ?? duel.scriptedNhController.chooseAction(context);
    }
  };
}

function buildCandidateActions(parsedPolicy, topCount, mode) {
  const actions = new Set();
  [...parsedPolicy.actionVisits]
    .filter((entry) => entry.visits > 0)
    .sort((left, right) => right.visits - left.visits)
    .slice(0, topCount)
    .forEach((entry) => actions.add(entry.action));
  actions.add(0);
  if (mode === "hybrid") {
    addHybridCoreActions(actions);
  } else if (mode === "full") {
    for (let action = 0; action < policyBridge.nhPolicyActionCount; action += 1) {
      actions.add(action);
    }
  }
  return [...actions].sort((left, right) => left - right);
}

function addHybridCoreActions(actions) {
  const offenceStyles = ["magic", "ranged", "melee"];
  const defencePrayers = ["protect_from_magic", "protect_from_missiles", "protect_from_melee", "smite", "redemption"];
  const movementIntents = ["pressure", "stand_under", "step_out"];
  const supplyIntents = ["none", "safe_eat", "double_eat", "triple_eat", "brew_only", "restore_reboost", "panic_full"];
  for (const offenceStyle of offenceStyles) {
    for (const defencePrayer of defencePrayers) {
      for (const movementIntent of movementIntents) {
        for (const supplyIntent of supplyIntents) {
          actions.add(policyBridge.encodeNhPolicyAction({
            offenceStyle,
            defencePrayer,
            movementIntent,
            supplyIntent,
            specIntent: "none",
            extendedSupplyAction: false
          }));
        }
        for (const specIntent of ["use_special", "use_special_double"]) {
          actions.add(policyBridge.encodeNhPolicyAction({
            offenceStyle,
            defencePrayer,
            movementIntent,
            supplyIntent: "none",
            specIntent,
            extendedSupplyAction: false
          }));
        }
        actions.add(policyBridge.encodeNhPolicyAction({
          offenceStyle,
          defencePrayer,
          movementIntent,
          supplyIntent: "regear_style",
          specIntent: "none",
          extendedSupplyAction: true
        }));
      }
    }
  }
}

function createStyleCounts() {
  return { magic: 0, ranged: 0, melee: 0 };
}

function createSupplyCounts() {
  return {
    none: 0,
    safe_eat: 0,
    double_eat: 0,
    triple_eat: 0,
    brew_only: 0,
    restore_reboost: 0,
    panic_full: 0,
    offence_strip_one: 0,
    offence_strip_two: 0,
    regear_style: 0
  };
}

function createSpecCounts() {
  return { none: 0, use_special: 0, use_special_double: 0 };
}

function percentMap(counts) {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [key, total === 0 ? "0.0%" : roundPct(value / total)])
  );
}

function prayerMatchByStyleSummary(checks, matches) {
  return Object.fromEntries(
    Object.keys(checks).map((style) => {
      const attempts = checks[style] ?? 0;
      const matched = matches[style] ?? 0;
      return [style, {
        checks: attempts,
        matches: matched,
        rate: attempts === 0 ? "0.0%" : roundPct(matched / attempts)
      }];
    })
  );
}

function omitRaw(result) {
  const { decisivePolicyWinRateRaw, policyTotalWinRateRaw, cohortTotalWinRateRaw, ...publicResult } = result;
  return publicResult;
}

function loadTsModule(relativePath) {
  return loadAbsoluteModule(path.resolve(projectRoot, relativePath));
}

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

  const source = readFileSync(resolved, "utf8");
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
    { module, exports: module.exports, require: localRequire, console, Math },
    { filename: resolved }
  );
  return module.exports;
}

function resolveRelativeModule(parentPath, request) {
  const requested = path.resolve(path.dirname(parentPath), request);
  const candidates = requested.endsWith(".ts") || requested.endsWith(".tsx") || requested.endsWith(".json")
    ? [requested]
    : [`${requested}.ts`, `${requested}.tsx`, `${requested}.json`, path.join(requested, "index.ts")];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Try the next TypeScript/JSON candidate.
    }
  }
  return candidates[0];
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

function relativeToProject(filePath) {
  return path.relative(projectRoot, filePath).replaceAll(path.sep, "/");
}

function clampInt(value, min, max) {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, normalized));
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function roundPct(value) {
  return `${(value * 100).toFixed(1)}%`;
}
