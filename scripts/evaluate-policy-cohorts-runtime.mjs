import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

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

const args = parseArgs(process.argv.slice(2));
const policyPath = path.resolve(projectRoot, args.policy ?? path.join("fixtures", "ai", "nhstaker-selfplay-policy-hard.tsv"));
const fightCount = clampInt(Number(args.fights ?? 20), 2, 20000);
const maxTicks = clampInt(Number(args.ticks ?? 160), 24, 2000);
const seedBase = Number(args.seed ?? 0x4e484d);
const requestedPatterns = String(args.patterns ?? "all")
  .split(",")
  .map((entry) => entry.trim().toUpperCase())
  .filter(Boolean);
const patterns =
  requestedPatterns.length === 1 && requestedPatterns[0] === "ALL"
    ? cohortPatterns
    : requestedPatterns.filter((pattern) => cohortPatterns.includes(pattern));

if (patterns.length === 0) {
  throw new Error(`No valid cohort patterns requested: ${requestedPatterns.join(",")}`);
}

const runtime = loadTsModule("src/sim/runtimePlayerCombat.ts");
const runtimePolicy = loadTsModule("src/sim/nh/runtime-policy-opponent.ts");
const botPolicy = loadTsModule("src/bot/policy.ts");
const gearProfile = loadTsModule("src/sim/nh/gearProfile.ts");
const loadouts = loadTsModule("src/sim/nh/loadouts.ts");
const canonicalGear = loadTsModule("src/sim/nh/canonicalGear.ts");
const combat = loadTsModule("src/sim/combat/player-combat.ts");
const runtimeScene = loadTsModule("src/render/runtimeScene.ts");
const tileMovement = loadTsModule("src/render/nhTileMovement.ts");

const runtimeTileScale = tileMovement.NH_TILE_WORLD_UNITS;
const defaultRuntimeFrame = runtimeScene.runtimeTimeline[0];
const defaultLocalStartTile =
  defaultRuntimeFrame.actors.find((actor) => actor.actorId === "local-player")?.tile ?? { x: -2, z: 0 };
const defaultOpponentStartTile =
  defaultRuntimeFrame.actors.find((actor) => actor.actorId === "opponent")?.tile ?? { x: 2, z: 0 };

const policy = botPolicy.parseNhPolicyTsv(readFileSync(policyPath, "utf8"), path.basename(policyPath));
const rows = patterns.map((pattern, patternIndex) =>
  evaluatePattern(pattern, (seedBase + patternIndex * 100_003) >>> 0)
);
const weakest = [...rows].sort((left, right) => right.weaknessScoreRaw - left.weaknessScoreRaw)[0];

console.log(
  JSON.stringify(
    {
      policy: relativeToProject(policyPath),
      engine: "runtime-policy-opponent",
      note:
        "Runtime evaluator: policy is driven through createNhPolicyController + applyRuntimeOpponentPolicyAction, matching the live trainer opponent path more closely than the old standalone duel evaluator.",
      options: {
        fights: fightCount,
        maxTicks,
        seedBase,
        policyRole: "opponent",
        cohortRole: "local-player",
        policyOpponentObservation: "unknown on first engaged tick, then one tick delayed",
        tileScale: runtimeTileScale,
        localStartTile: defaultLocalStartTile,
        opponentStartTile: defaultOpponentStartTile
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
    policyDeaths: 0,
    cohortDeaths: 0,
    simultaneousDeaths: 0,
    timeouts: 0,
    totalTicks: 0,
    policyDamage: 0,
    cohortDamage: 0,
    policyHealing: 0,
    cohortHealing: 0,
    policyFinalHp: 0,
    cohortFinalHp: 0,
    policyStyle: createStyleCounts(),
    cohortStyle: createStyleCounts(),
    policyAttackStyle: createStyleCounts(),
    cohortAttackStyle: createStyleCounts(),
    policySupply: createSupplyCounts(),
    cohortSupply: createSupplyCounts(),
    policySpec: createSpecCounts(),
    cohortSpec: createSpecCounts(),
    policyConsumed: createConsumableCounts(),
    cohortConsumed: createConsumableCounts(),
    policyPrayerTicks: 0,
    policyPrayerMatches: 0,
    prayerChecksByStyle: createStyleCounts(),
    prayerMatchesByStyle: createStyleCounts()
  };

  for (let fight = 0; fight < fightCount; fight += 1) {
    const state = runRuntimeFight(pattern, (seed + fight * 101) >>> 0);
    recordRuntimeFight(aggregate, state);
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
      policyDeaths: aggregate.policyDeaths,
      cohortDeaths: aggregate.cohortDeaths,
      simultaneousDeaths: aggregate.simultaneousDeaths,
      timeouts: aggregate.timeouts,
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
      cohortFinalHp: round(aggregate.cohortFinalHp / aggregate.fights),
      fightTicks: round(aggregate.totalTicks / aggregate.fights)
    },
    policyBehavior: {
      style: percentMap(aggregate.policyStyle),
      attackStyle: percentMap(aggregate.policyAttackStyle),
      supply: percentMap(aggregate.policySupply),
      spec: percentMap(aggregate.policySpec),
      consumed: countMap(aggregate.policyConsumed),
      prayerAttackChecks: aggregate.policyPrayerTicks,
      prayerMatchOnCohortAttack: roundPct(prayerMatchRateRaw),
      prayerMatchOnCohortStyle: roundPct(prayerMatchRateRaw),
      prayerMatchByCohortStyle: prayerMatchByStyleSummary(aggregate.prayerChecksByStyle, aggregate.prayerMatchesByStyle)
    },
    cohortBehavior: {
      style: percentMap(aggregate.cohortStyle),
      attackStyle: percentMap(aggregate.cohortAttackStyle),
      supply: percentMap(aggregate.cohortSupply),
      consumed: countMap(aggregate.cohortConsumed),
      spec: percentMap(aggregate.cohortSpec)
    }
  };
}

function runRuntimeFight(pattern, seed) {
  const policyController = botPolicy.createNhPolicyController(policy);
  const profile = createRuntimeNhStakeGearProfile();
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
    localSupplies: runtime.runtimePlayerCombatDefaultSupplies,
    opponentSupplies: runtime.runtimePlayerCombatDefaultSupplies,
    localSpecialEnergy: 100,
    opponentSpecialEnergy: 100,
    combatStartTick: 0,
    seed
  });
  state = runtime.syncRuntimePlayerCombatStateToInput(state, {
    tiles: runtimeTiles(state),
    gearProfiles: {
      "local-player": profile,
      opponent: profile
    }
  });

  const fight = {
    finalState: state,
    events: [],
    policyActions: [],
    cohortActions: [],
    winner: null,
    policyDied: false,
    cohortDied: false,
    endedAtTick: 0
  };
  const localMemory = {
    lastOffenceStyle: null,
    lastVisibleOpponentStyle: null
  };
  let observedLocalActor = unknownRuntimeActorView(state, "local-player", profile);
  let nextPolicyRepositionTick = 0;

  for (let step = 0; step < maxTicks; step += 1) {
    if (fight.winner !== null) {
      break;
    }
    const localTileBeforeTick = state.actors["local-player"].tile;
    const cohortAction = chooseCohortAction(pattern, state, localMemory);
    state = applyLocalCohortAction(state, cohortAction);
    localMemory.lastOffenceStyle = cohortAction.offenceStyle;
    fight.cohortActions.push({ tick: state.tick, action: cohortAction });

    const policyResult = runtimePolicy.applyRuntimeOpponentPolicyAction({
      state,
      controller: policyController,
      localActor: observedLocalActor,
      opponentActor: runtimeActorView(state, "opponent", profile),
      allowSourceLoadoutSync: false,
      inPvpCombatArea: true,
      nextRepositionTick: nextPolicyRepositionTick,
      rewardEpisodeId: fight.seed ?? 0,
      rewardEpisodeActive: true,
      rewardEpisodeStartTick: 0,
      tileScale: runtimeTileScale
    });
    state = policyResult.state;
    nextPolicyRepositionTick = policyResult.nextRepositionTick ?? nextPolicyRepositionTick;
    localMemory.lastVisibleOpponentStyle = policyResult.effectiveAction.offenceStyle;
    fight.policyActions.push({
      tick: state.tick,
      action: policyResult.action,
      effectiveAction: policyResult.effectiveAction,
      consumedSupplies: policyResult.consumedSupplies
    });

    const beforeAdvanceTick = state.tick;
    const advanced = runtime.advanceRuntimePlayerCombat(state, {
      preMovementTiles: runtimeTiles(state),
      tiles: runtimeTiles(state),
      loadouts: runtimeLoadoutsForState(state),
      equipment: runtimeEquipmentForState(state),
      gearProfiles: {
        "local-player": profile,
        opponent: profile
      },
      tileScale: runtimeTileScale,
      clientCycle: beforeAdvanceTick * runtime.runtimePlayerCombatClientCyclesPerGameTick
    });
    state = advanced.state;
    const tickEvents = state.events.filter((event) => event.tick === beforeAdvanceTick);
    fight.events.push(...tickEvents);
    observedLocalActor = visibleRuntimeActorViewFromMovement(
      state,
      "local-player",
      profile,
      localTileBeforeTick,
      state.actors["local-player"].tile
    );
    const deaths = tickEvents.filter((event) => event.kind === "death");
    if (deaths.length > 0) {
      const localDead = deaths.some((event) => event.actorId === "local-player");
      const opponentDead = deaths.some((event) => event.actorId === "opponent");
      fight.cohortDied = fight.cohortDied || localDead;
      fight.policyDied = fight.policyDied || opponentDead;
      fight.winner = localDead && opponentDead ? "draw" : localDead ? "policy" : "cohort";
      fight.endedAtTick = state.tick;
    }
  }

  fight.finalState = state;
  if (fight.winner === null) {
    const localDead = runtime.isRuntimePlayerCombatActorDead(state.actors["local-player"], state.tick);
    const opponentDead = runtime.isRuntimePlayerCombatActorDead(state.actors.opponent, state.tick);
    fight.cohortDied = fight.cohortDied || localDead;
    fight.policyDied = fight.policyDied || opponentDead;
    fight.winner = localDead && opponentDead ? "draw" : localDead ? "policy" : opponentDead ? "cohort" : "draw";
  }
  fight.endedAtTick = fight.endedAtTick || state.tick;
  return fight;
}

function applyLocalCohortAction(state, action) {
  const loadoutId = runtimeLoadoutForOffence(action.offenceStyle);
  let nextState = runtime.setRuntimePlayerCombatLoadout(
    state,
    "local-player",
    loadoutId,
    loadouts.nhLoadouts[loadoutId].equipment
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
  nextState = runtime.setRuntimePlayerCombatPrayers(
    nextState,
    "local-player",
    runtimePrayersForAction(action)
  );
  nextState = applyLocalCohortSupply(nextState, action.supplyIntent);
  nextState = moveLocalCohort(nextState, action);
  return action.offenceStyle === "magic"
    ? runtime.requestRuntimePlayerCombatSpell(nextState, "local-player", "opponent", "ice-barrage")
    : runtime.requestRuntimePlayerCombatAttack(nextState, "local-player", "opponent");
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
  if (action.movementIntent === "step_out") {
    const nextTile = stepAway(actor.tile, target.tile);
    return runtime.syncRuntimePlayerCombatStateToInput(state, { tiles: { "local-player": nextTile } });
  }
  if (action.movementIntent === "stand_under") {
    return runtime.syncRuntimePlayerCombatStateToInput(state, { tiles: { "local-player": target.tile } });
  }
  if (action.offenceStyle === "melee" && chebyshevDistance(actor.tile, target.tile) > 1) {
    const nextTile = stepToward(actor.tile, target.tile, false);
    return runtime.syncRuntimePlayerCombatStateToInput(state, { tiles: { "local-player": nextTile } });
  }
  return state;
}

function chooseCohortAction(pattern, state, memory) {
  const context = cohortContext(state, memory);
  const phaseTick = state.tick;
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
    stats: {
      hitpoints: {
        current: actor.hitpoints,
        fixed: actor.maxHitpoints
      }
    },
    activePrayers: actor.activePrayers,
    attackTimer: actor.attackTimer,
    locks: actor.locks,
    lastOffenceStyle: lastStyle,
    lastVisibleOpponentStyle: lastStyle
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
    case "PRAYER_CAMP_MELEE":
      return phase % 5 === 4 ? "magic" : "ranged";
    case "STAFF_BAIT_RANGE":
      return phase % 4 === 3 && attackReady(context.self, context.tick) ? "ranged" : "magic";
    case "CROSSBOW_BAIT_MAGE":
      return phase % 4 === 3 && attackReady(context.self, context.tick) ? "magic" : "ranged";
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

function recordRuntimeFight(aggregate, fight) {
  aggregate.fights += 1;
  if (fight.winner === "policy") {
    aggregate.policyWins += 1;
    aggregate.decisive += 1;
  } else if (fight.winner === "cohort") {
    aggregate.cohortWins += 1;
    aggregate.decisive += 1;
  } else {
    aggregate.draws += 1;
  }
  aggregate.policyDeaths += fight.policyDied ? 1 : 0;
  aggregate.cohortDeaths += fight.cohortDied ? 1 : 0;
  aggregate.simultaneousDeaths += fight.policyDied && fight.cohortDied ? 1 : 0;
  aggregate.timeouts += !fight.policyDied && !fight.cohortDied ? 1 : 0;
  aggregate.totalTicks += fight.endedAtTick;

  for (const entry of fight.policyActions) {
    recordAction(aggregate.policyStyle, aggregate.policySupply, aggregate.policySpec, entry.effectiveAction);
  }
  for (const entry of fight.cohortActions) {
    recordAction(aggregate.cohortStyle, aggregate.cohortSupply, aggregate.cohortSpec, entry.action);
  }
  for (const event of fight.events) {
    if (event.kind === "hitsplat" && event.damage > 0) {
      if (event.attackerId === "opponent") {
        aggregate.policyDamage += event.damage;
      } else if (event.attackerId === "local-player") {
        aggregate.cohortDamage += event.damage;
      }
    }
    if (event.kind === "supply" && event.healed > 0) {
      if (event.actorId === "opponent") {
        aggregate.policyHealing += event.healed;
      } else if (event.actorId === "local-player") {
        aggregate.cohortHealing += event.healed;
      }
    }
    if (event.kind === "supply") {
      if (event.actorId === "opponent") {
        aggregate.policyConsumed[event.item] += 1;
      } else if (event.actorId === "local-player") {
        aggregate.cohortConsumed[event.item] += 1;
      }
    }
    if (event.kind === "attack") {
      const style = runtimeStyleToOffence(event.style);
      if (event.attackerId === "opponent") {
        aggregate.policyAttackStyle[style] += 1;
      } else if (event.attackerId === "local-player") {
        aggregate.cohortAttackStyle[style] += 1;
        aggregate.policyPrayerTicks += 1;
        aggregate.prayerChecksByStyle[style] += 1;
        if (event.defenderProtectionPrayer === protectPrayerForOffence(style)) {
          aggregate.policyPrayerMatches += 1;
          aggregate.prayerMatchesByStyle[style] += 1;
        }
      }
    }
  }

  aggregate.policyFinalHp += Math.max(0, fight.finalState.actors.opponent.hitpoints);
  aggregate.cohortFinalHp += Math.max(0, fight.finalState.actors["local-player"].hitpoints);
}

function runtimeActorView(state, actorId, profile) {
  const actor = state.actors[actorId];
  return {
    tile: actor.tile,
    loadoutId: actor.loadoutId,
    equipment: actor.equipment,
    gearProfile: profile,
    inventoryItems: runtimeInventoryItems(),
    activePrayers: actor.activePrayers,
    stats: runtimeStats(actor),
    locks: actor.locks,
    movedThisTick: false,
    lastMoveDx: 0,
    lastMoveDy: 0,
    observedInfoKnown: true
  };
}

function unknownRuntimeActorView(state, actorId, profile) {
  const previous = runtimeActorView(state, actorId, profile);
  return {
    ...previous,
    tile: {
      x: -runtimeTileScale,
      z: -runtimeTileScale
    },
    equipment: {},
    inventoryItems: [],
    activePrayers: [],
    stats: {
      ...previous.stats,
      hitpoints: {
        ...previous.stats.hitpoints,
        current: -1
      },
      prayer: {
        ...previous.stats.prayer,
        current: 0
      }
    },
    locks: {},
    movedThisTick: false,
    lastMoveDx: 0,
    lastMoveDy: 0,
    observedInfoKnown: false
  };
}

function visibleRuntimeActorViewFromMovement(state, actorId, profile, sourceTile, destinationTile) {
  const movedThisTick = !sameTile(sourceTile, destinationTile);
  return {
    ...runtimeActorView(state, actorId, profile),
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

function createRuntimeNhStakeGearProfile() {
  return gearProfile.inferNhSelectedGearProfile({
    equipment: loadouts.nhLoadouts["kodai-robes"].equipment,
    inventoryItems: runtimeInventoryItems()
  });
}

function runtimeInventoryItems() {
  return [...canonicalGear.canonicalNhSwitchItemIds].map((itemId) => ({
    itemId,
    name: `Item ${itemId}`
  }));
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

function sameTile(left, right) {
  return left.x === right.x && left.z === right.z;
}

function runtimeLoadoutForOffence(style) {
  if (style === "magic") {
    return "kodai-robes";
  }
  if (style === "ranged") {
    return "acb-hides";
  }
  return "tentacle-bandos";
}

function cohortAttackSetForStyle(style, state) {
  if (style !== "ranged") {
    return 0;
  }
  const actor = state.actors["local-player"];
  const target = state.actors.opponent;
  const weaponId = loadouts.nhLoadouts[actor.loadoutId].weaponId;
  const baseRange = combat.nhWeaponProfiles[weaponId].attackRange;
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

function supplyItemGroupsForIntent(supplyIntent) {
  if (supplyIntent === "safe_eat") {
    return [["manta_ray", "shark"]];
  }
  if (supplyIntent === "double_eat") {
    return [["manta_ray", "shark"], ["karambwan"]];
  }
  if (supplyIntent === "triple_eat" || supplyIntent === "panic_full") {
    return [["manta_ray", "shark"], ["saradomin_brew"], ["karambwan"]];
  }
  if (supplyIntent === "brew_only") {
    return [["saradomin_brew"]];
  }
  if (supplyIntent === "restore_reboost") {
    return [["super_restore", "sanfew_serum"], ["bastion", "ranging_potion"], ["super_combat"]];
  }
  return [];
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

function runtimeStyleToOffence(style) {
  return style === "ranged" ? "ranged" : style === "magic" ? "magic" : "melee";
}

function isFrozenAt(actor, tick) {
  return actor.locks.freezeUntilTick !== undefined && tick < actor.locks.freezeUntilTick;
}

function attackReady(actor, tick) {
  return attackDelayRemaining(actor, tick) === 0;
}

function attackDelayRemaining(actor, tick) {
  const timer = actor.attackTimer ?? {};
  const lastAttackTick = Number(timer.lastAttackTick ?? -100);
  const weaponCooldownTicks = Number(timer.weaponCooldownTicks ?? 0);
  const additiveAttackDelayTicks = Number(timer.additiveAttackDelayTicks ?? 0);
  return Math.max(0, lastAttackTick + weaponCooldownTicks + additiveAttackDelayTicks - tick);
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

function createStyleCounts() {
  return { magic: 0, ranged: 0, melee: 0 };
}

function createSpecCounts() {
  return { none: 0, use_special: 0, use_special_double: 0 };
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

function createConsumableCounts() {
  return {
    manta_ray: 0,
    shark: 0,
    karambwan: 0,
    saradomin_brew: 0,
    super_restore: 0,
    sanfew_serum: 0,
    super_combat: 0,
    bastion: 0,
    ranging_potion: 0
  };
}

function percentMap(counts) {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [key, total === 0 ? "0.0%" : roundPct(value / total)])
  );
}

function countMap(counts) {
  return Object.fromEntries(Object.entries(counts).filter(([, value]) => value > 0));
}

function prayerMatchByStyleSummary(checks, matches) {
  return Object.fromEntries(
    Object.keys(checks).map((style) => {
      const attempts = checks[style] ?? 0;
      const matched = matches[style] ?? 0;
      return [
        style,
        {
          checks: attempts,
          matches: matched,
          rate: attempts === 0 ? "0.0%" : roundPct(matched / attempts)
        }
      ];
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
