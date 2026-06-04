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
    [path.join(projectRoot, "scripts", "evaluate-policy-head-to-head-runtime.mjs"), ...forwardedArgs],
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

const newPolicyPath = path.resolve(
  projectRoot,
  args.new ?? path.join("fixtures", "ai", "nhstaker-selfplay-policy-hard.tsv")
);
const previousPolicyPath = path.resolve(
  projectRoot,
  args.previous ?? path.join("fixtures", "ai", "nhstaker-selfplay-policy-hard.tsv.before-20260529-210222-predictive-prayer-10m.bak")
);
const fightCount = clampInt(Number(args.fights ?? 1200), 2, 20000);
const maxTicks = clampInt(Number(args.ticks ?? 360), 24, 2000);
const seedBase = Number(args.seed ?? 0x4e484d);
const topCandidateCount = clampInt(Number(args.candidates ?? 600), 50, 4950);
const candidateMode = normalizeCandidateMode(
  args["candidate-mode"] ?? (args["include-basics"] === "true" ? "full" : "visited")
);

const duel = loadTsModule("src/sim/nh/duel.ts");
const botPolicy = loadTsModule("src/bot/policy.ts");
const policyFeatures = loadTsModule("src/sim/nh/policy-features.ts");
const policyBridge = loadTsModule("src/sim/nh/policy-bridge.ts");

const newPolicy = botPolicy.parseNhPolicyTsv(readFileSync(newPolicyPath, "utf8"), path.basename(newPolicyPath));
const previousPolicy = botPolicy.parseNhPolicyTsv(
  readFileSync(previousPolicyPath, "utf8"),
  path.basename(previousPolicyPath)
);
const candidateActions = buildCandidateActions(newPolicy, previousPolicy, topCandidateCount, candidateMode);

const aggregate = {
  fights: 0,
  decisive: 0,
  draws: 0,
  newWins: 0,
  previousWins: 0,
  newDamage: 0,
  previousDamage: 0,
  newHealing: 0,
  previousHealing: 0,
  newFinalHp: 0,
  previousFinalHp: 0,
  newStyle: createStyleCounts(),
  previousStyle: createStyleCounts(),
  newSpec: createSpecCounts(),
  previousSpec: createSpecCounts(),
  newMovement: createMovementCounts(),
  previousMovement: createMovementCounts(),
  newSupply: createSupplyCounts(),
  previousSupply: createSupplyCounts()
};

for (let fight = 0; fight < fightCount; fight += 1) {
  const newAsSelf = fight % 2 === 0;
  const selfPolicy = newAsSelf ? newPolicy : previousPolicy;
  const opponentPolicy = newAsSelf ? previousPolicy : newPolicy;
  const selfController = createCandidatePolicyController(selfPolicy, candidateActions);
  const opponentController = createCandidatePolicyController(opponentPolicy, candidateActions);
  const state = duel.runNhDuel({
    ticks: maxTicks,
    seed: (seedBase + fight * 101) >>> 0,
    selfController,
    opponentController
  });
  recordFight(state, newAsSelf);
}

printSummary();

function recordFight(state, newAsSelf) {
  const summary = duel.summarizeNhDuelState(state);
  aggregate.fights += 1;
  const newId = newAsSelf ? "self" : "opponent";
  const previousId = newAsSelf ? "opponent" : "self";

  const newDead = summary.finalHp[newId] <= 0;
  const previousDead = summary.finalHp[previousId] <= 0;
  if (newDead && previousDead) {
    aggregate.draws += 1;
  } else if (previousDead) {
    aggregate.newWins += 1;
    aggregate.decisive += 1;
  } else if (newDead) {
    aggregate.previousWins += 1;
    aggregate.decisive += 1;
  } else {
    aggregate.draws += 1;
  }

  aggregate.newDamage += summary.damage[previousId];
  aggregate.previousDamage += summary.damage[newId];
  aggregate.newHealing += summary.healing[newId];
  aggregate.previousHealing += summary.healing[previousId];
  aggregate.newFinalHp += summary.finalHp[newId];
  aggregate.previousFinalHp += summary.finalHp[previousId];

  for (const tick of state.history) {
    const newAction = newAsSelf ? tick.selfAction : tick.opponentAction;
    const previousAction = newAsSelf ? tick.opponentAction : tick.selfAction;
    recordAction(aggregate.newStyle, aggregate.newSpec, aggregate.newMovement, aggregate.newSupply, newAction);
    recordAction(
      aggregate.previousStyle,
      aggregate.previousSpec,
      aggregate.previousMovement,
      aggregate.previousSupply,
      previousAction
    );
  }
}

function recordAction(styleCounts, specCounts, movementCounts, supplyCounts, action) {
  styleCounts[action.offenceStyle] += 1;
  specCounts[action.specIntent] += 1;
  movementCounts[action.movementIntent] += 1;
  supplyCounts[action.supplyIntent] += 1;
}

function printSummary() {
  const decisiveWinRate = aggregate.decisive === 0 ? 0 : aggregate.newWins / aggregate.decisive;
  const totalWinRate = aggregate.newWins / Math.max(1, aggregate.fights);
  const previousTotalWinRate = aggregate.previousWins / Math.max(1, aggregate.fights);
  const rows = {
    policies: {
      new: relativeToProject(newPolicyPath),
      previous: relativeToProject(previousPolicyPath)
    },
    engine: "standalone-duel",
    note:
      "Standalone evaluator: uses duel.runNhDuel and does not apply the live runtime policy action layer. Use --engine runtime or omit --engine for production decisions.",
    options: {
      fights: aggregate.fights,
      maxTicks,
      seedBase,
      alternatedSides: true,
      candidateActions: candidateActions.length,
      topCandidateCount,
      candidateMode
    },
    result: {
      newWins: aggregate.newWins,
      previousWins: aggregate.previousWins,
      draws: aggregate.draws,
      decisiveNewWinRate: roundPct(decisiveWinRate),
      totalNewWinRate: roundPct(totalWinRate),
      totalPreviousWinRate: roundPct(previousTotalWinRate)
    },
    averages: {
      newDamageDealt: round(aggregate.newDamage / aggregate.fights),
      previousDamageDealt: round(aggregate.previousDamage / aggregate.fights),
      newHealing: round(aggregate.newHealing / aggregate.fights),
      previousHealing: round(aggregate.previousHealing / aggregate.fights),
      newFinalHp: round(aggregate.newFinalHp / aggregate.fights),
      previousFinalHp: round(aggregate.previousFinalHp / aggregate.fights)
    },
    behavior: {
      new: behaviorSummary(aggregate.newStyle, aggregate.newSpec, aggregate.newMovement, aggregate.newSupply),
      previous: behaviorSummary(
        aggregate.previousStyle,
        aggregate.previousSpec,
        aggregate.previousMovement,
        aggregate.previousSupply
      )
    }
  };
  console.log(JSON.stringify(rows, null, 2));
}

function behaviorSummary(styleCounts, specCounts, movementCounts, supplyCounts) {
  return {
    style: percentMap(styleCounts),
    spec: percentMap(specCounts),
    movement: percentMap(movementCounts),
    supply: percentMap(supplyCounts)
  };
}

function percentMap(counts) {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [key, total === 0 ? "0.0%" : roundPct(value / total)])
  );
}

function createStyleCounts() {
  return { magic: 0, ranged: 0, melee: 0 };
}

function createSpecCounts() {
  return { none: 0, use_special: 0, use_special_double: 0 };
}

function createMovementCounts() {
  return {
    pressure: 0,
    stand_under: 0,
    step_out: 0,
    step_north: 0,
    step_south: 0,
    step_east: 0,
    step_west: 0,
    step_north_east: 0,
    step_north_west: 0,
    step_south_east: 0,
    step_south_west: 0
  };
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

function createCandidatePolicyController(policy, candidates) {
  const featureState = policyFeatures.createNhPolicyFeatureState();
  let activeEpisodeId = null;
  let lastContextTick = null;
  return {
    id: `candidate-policy:${policy.sourceLabel}`,
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
        policy,
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

function buildCandidateActions(newPolicy, previousPolicy, topCount, mode) {
  const actions = new Set();
  addTopVisitedActions(actions, newPolicy, topCount);
  addTopVisitedActions(actions, previousPolicy, topCount);
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

function addTopVisitedActions(actions, policy, topCount) {
  [...policy.actionVisits]
    .filter((entry) => entry.visits > 0)
    .sort((left, right) => right.visits - left.visits)
    .slice(0, topCount)
    .forEach((entry) => actions.add(entry.action));
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

function round(value) {
  return Math.round(value * 10) / 10;
}

function roundPct(value) {
  return `${(value * 100).toFixed(1)}%`;
}
