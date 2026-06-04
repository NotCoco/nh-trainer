import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const args = parseArgs(process.argv.slice(2));

const newPolicyPath = path.resolve(projectRoot, args.new ?? path.join("fixtures", "ai", "nhstaker-selfplay-policy-hard.tsv"));
const previousPolicyPath = path.resolve(
  projectRoot,
  args.previous ?? path.join("fixtures", "ai", "nhstaker-selfplay-policy-hard.tsv.before-20260529-210222-predictive-prayer-10m.bak")
);
const fightCount = clampInt(Number(args.fights ?? 20), 2, 20000);
const maxTicks = clampInt(Number(args.ticks ?? 360), 24, 2000);
const seedBase = Number(args.seed ?? 0x4e484d);
const selfPlayMode = String(args["self-play"] ?? "true").toLowerCase() !== "false";

const runtime = loadTsModule("src/sim/runtimePlayerCombat.ts");
const runtimePolicy = loadTsModule("src/sim/nh/runtime-policy-opponent.ts");
const botPolicy = loadTsModule("src/bot/policy.ts");
const gearProfile = loadTsModule("src/sim/nh/gearProfile.ts");
const loadouts = loadTsModule("src/sim/nh/loadouts.ts");
const canonicalGear = loadTsModule("src/sim/nh/canonicalGear.ts");
const runtimeScene = loadTsModule("src/render/runtimeScene.ts");
const tileMovement = loadTsModule("src/render/nhTileMovement.ts");

const runtimeTileScale = tileMovement.NH_TILE_WORLD_UNITS;
const defaultRuntimeFrame = runtimeScene.runtimeTimeline[0];
const defaultLocalStartTile =
  defaultRuntimeFrame.actors.find((actor) => actor.actorId === "local-player")?.tile ?? { x: -2, z: 0 };
const defaultOpponentStartTile =
  defaultRuntimeFrame.actors.find((actor) => actor.actorId === "opponent")?.tile ?? { x: 2, z: 0 };

const newPolicy = botPolicy.parseNhPolicyTsv(readFileSync(newPolicyPath, "utf8"), path.basename(newPolicyPath));
const previousPolicy = botPolicy.parseNhPolicyTsv(readFileSync(previousPolicyPath, "utf8"), path.basename(previousPolicyPath));

const aggregate = {
  fights: 0,
  decisive: 0,
  draws: 0,
  newWins: 0,
  previousWins: 0,
  newDeaths: 0,
  previousDeaths: 0,
  simultaneousDeaths: 0,
  timeouts: 0,
  totalTicks: 0,
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
  previousSupply: createSupplyCounts(),
  newConsumed: createConsumableCounts(),
  previousConsumed: createConsumableCounts()
};

for (let fight = 0; fight < fightCount; fight += 1) {
  const newAsOpponent = fight % 2 === 0;
  const result = runRuntimeHeadToHeadFight({
    seed: (seedBase + fight * 101) >>> 0,
    newActorId: newAsOpponent ? "opponent" : "local-player",
    previousActorId: newAsOpponent ? "local-player" : "opponent"
  });
  recordFight(result);
}

printSummary();

function runRuntimeHeadToHeadFight(input) {
  const profile = createRuntimeNhStakeGearProfile();
  const controllers = {
    [input.newActorId]: botPolicy.createNhPolicyController(newPolicy),
    [input.previousActorId]: botPolicy.createNhPolicyController(previousPolicy)
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
    localSupplies: runtime.runtimePlayerCombatDefaultSupplies,
    opponentSupplies: runtime.runtimePlayerCombatDefaultSupplies,
    localSpecialEnergy: 100,
    opponentSpecialEnergy: 100,
    combatStartTick: 0,
    seed: input.seed
  });
  state = runtime.syncRuntimePlayerCombatStateToInput(state, {
    tiles: runtimeTiles(state),
    gearProfiles: {
      "local-player": profile,
      opponent: profile
    }
  });

  const fight = {
    newActorId: input.newActorId,
    previousActorId: input.previousActorId,
    winner: null,
    newDied: false,
    previousDied: false,
    endedAtTick: 0,
    finalState: state,
    events: [],
    actions: {
      "local-player": [],
      opponent: []
    }
  };
  const nextRepositionTicks = {
    "local-player": 0,
    opponent: 0
  };
  let observedActorViews = {
    "local-player": unknownRuntimeActorView(state, "local-player", profile),
    opponent: unknownRuntimeActorView(state, "opponent", profile)
  };

  for (let step = 0; step < maxTicks; step += 1) {
    if (fight.winner !== null) {
      break;
    }
    const tilesBeforeTick = runtimeTiles(state);
    const moved = {
      "local-player": false,
      opponent: false
    };
    const order = runtime.runtimePlayerCombatProcessOrderForTick(state, state.tick);
    for (const actorId of order) {
      if (runtime.isRuntimePlayerCombatActorDead(state.actors[actorId], state.tick)) {
        continue;
      }
      const applied = applyPolicyForActor(
        state,
        actorId,
        controllers[actorId],
        profile,
        observedActorViews[actorId === "local-player" ? "opponent" : "local-player"],
        nextRepositionTicks[actorId],
        input.seed
      );
      state = applied.state;
      nextRepositionTicks[actorId] = applied.nextRepositionTick;
      moved[actorId] = applied.moved;
      fight.actions[actorId].push({
        tick: state.tick,
        action: applied.effectiveAction
      });
    }

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
        profile,
        tilesBeforeTick["local-player"],
        state.actors["local-player"].tile
      ),
      opponent: visibleRuntimeActorViewFromMovement(
        state,
        "opponent",
        profile,
        tilesBeforeTick.opponent,
        state.actors.opponent.tile
      )
    };
    const deaths = tickEvents.filter((event) => event.kind === "death");
    if (deaths.length > 0) {
      const newDead = deaths.some((event) => event.actorId === input.newActorId);
      const previousDead = deaths.some((event) => event.actorId === input.previousActorId);
      fight.newDied = fight.newDied || newDead;
      fight.previousDied = fight.previousDied || previousDead;
      fight.winner = newDead && previousDead ? "draw" : previousDead ? "new" : newDead ? "previous" : null;
      fight.endedAtTick = state.tick;
    }
  }

  fight.finalState = state;
  if (fight.winner === null) {
    const newDead = runtime.isRuntimePlayerCombatActorDead(state.actors[input.newActorId], state.tick);
    const previousDead = runtime.isRuntimePlayerCombatActorDead(state.actors[input.previousActorId], state.tick);
    fight.newDied = fight.newDied || newDead;
    fight.previousDied = fight.previousDied || previousDead;
    fight.winner = newDead && previousDead ? "draw" : previousDead ? "new" : newDead ? "previous" : "draw";
  }
  fight.endedAtTick = fight.endedAtTick || state.tick;
  return fight;
}

function applyPolicyForActor(state, actorId, controller, profile, observedTargetView, nextRepositionTick, episodeId) {
  if (actorId === "opponent") {
    const result = runtimePolicy.applyRuntimeOpponentPolicyAction({
      state,
      controller,
      localActor: observedTargetView,
      opponentActor: runtimeActorView(state, "opponent", profile),
      allowSourceLoadoutSync: false,
      inPvpCombatArea: true,
      selfPlayMode,
      nextRepositionTick,
      rewardEpisodeId: episodeId,
      rewardEpisodeActive: true,
      rewardEpisodeStartTick: 0,
      tileScale: runtimeTileScale
    });
    return {
      state: result.state,
      effectiveAction: result.effectiveAction,
      moved: result.opponentMovedThisTick,
      nextRepositionTick: result.nextRepositionTick ?? nextRepositionTick
    };
  }

  const swappedState = swapRuntimeStateRoles(state);
  const result = runtimePolicy.applyRuntimeOpponentPolicyAction({
    state: swappedState,
    controller,
    localActor: observedTargetView,
    opponentActor: runtimeActorView(swappedState, "opponent", profile),
    allowSourceLoadoutSync: false,
    inPvpCombatArea: true,
    selfPlayMode,
    nextRepositionTick,
    rewardEpisodeId: episodeId,
    rewardEpisodeActive: true,
    rewardEpisodeStartTick: 0,
    tileScale: runtimeTileScale
  });
  return {
    state: swapRuntimeStateRoles(result.state),
    effectiveAction: result.effectiveAction,
    moved: result.opponentMovedThisTick,
    nextRepositionTick: result.nextRepositionTick ?? nextRepositionTick
  };
}

function recordFight(fight) {
  aggregate.fights += 1;
  if (fight.winner === "new") {
    aggregate.newWins += 1;
    aggregate.decisive += 1;
  } else if (fight.winner === "previous") {
    aggregate.previousWins += 1;
    aggregate.decisive += 1;
  } else {
    aggregate.draws += 1;
  }
  aggregate.newDeaths += fight.newDied ? 1 : 0;
  aggregate.previousDeaths += fight.previousDied ? 1 : 0;
  aggregate.simultaneousDeaths += fight.newDied && fight.previousDied ? 1 : 0;
  aggregate.timeouts += !fight.newDied && !fight.previousDied ? 1 : 0;
  aggregate.totalTicks += fight.endedAtTick;

  for (const entry of fight.actions[fight.newActorId]) {
    recordAction(aggregate.newStyle, aggregate.newSpec, aggregate.newMovement, aggregate.newSupply, entry.action);
  }
  for (const entry of fight.actions[fight.previousActorId]) {
    recordAction(aggregate.previousStyle, aggregate.previousSpec, aggregate.previousMovement, aggregate.previousSupply, entry.action);
  }
  for (const event of fight.events) {
    if (event.kind === "hitsplat" && event.damage > 0) {
      if (event.attackerId === fight.newActorId) {
        aggregate.newDamage += event.damage;
      } else if (event.attackerId === fight.previousActorId) {
        aggregate.previousDamage += event.damage;
      }
    }
    if (event.kind === "supply" && event.healed > 0) {
      if (event.actorId === fight.newActorId) {
        aggregate.newHealing += event.healed;
      } else if (event.actorId === fight.previousActorId) {
        aggregate.previousHealing += event.healed;
      }
    }
    if (event.kind === "supply") {
      if (event.actorId === fight.newActorId) {
        aggregate.newConsumed[event.item] += 1;
      } else if (event.actorId === fight.previousActorId) {
        aggregate.previousConsumed[event.item] += 1;
      }
    }
  }
  aggregate.newFinalHp += Math.max(0, fight.finalState.actors[fight.newActorId].hitpoints);
  aggregate.previousFinalHp += Math.max(0, fight.finalState.actors[fight.previousActorId].hitpoints);
}

function printSummary() {
  const decisiveWinRate = aggregate.decisive === 0 ? 0 : aggregate.newWins / aggregate.decisive;
  const totalWinRate = aggregate.newWins / Math.max(1, aggregate.fights);
  const previousTotalWinRate = aggregate.previousWins / Math.max(1, aggregate.fights);
  console.log(
    JSON.stringify(
      {
        policies: {
          new: relativeToProject(newPolicyPath),
          previous: relativeToProject(previousPolicyPath)
        },
        engine: "runtime-policy-opponent",
        note:
          "Runtime head-to-head evaluator: both policies are applied through applyRuntimeOpponentPolicyAction; local-player control is handled by swapping actor roles before and after the runtime policy call.",
        options: {
          fights: aggregate.fights,
          maxTicks,
          seedBase,
          alternatedSides: true,
          selfPlayMode,
          opponentObservation: "unknown on first engaged tick, then one tick delayed for both policies",
          tileScale: runtimeTileScale,
          localStartTile: defaultLocalStartTile,
          opponentStartTile: defaultOpponentStartTile
        },
        result: {
          newWins: aggregate.newWins,
          previousWins: aggregate.previousWins,
          draws: aggregate.draws,
          newDeaths: aggregate.newDeaths,
          previousDeaths: aggregate.previousDeaths,
          simultaneousDeaths: aggregate.simultaneousDeaths,
          timeouts: aggregate.timeouts,
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
          previousFinalHp: round(aggregate.previousFinalHp / aggregate.fights),
          fightTicks: round(aggregate.totalTicks / aggregate.fights)
        },
        behavior: {
          new: behaviorSummary(
            aggregate.newStyle,
            aggregate.newSpec,
            aggregate.newMovement,
            aggregate.newSupply,
            aggregate.newConsumed
          ),
          previous: behaviorSummary(
            aggregate.previousStyle,
            aggregate.previousSpec,
            aggregate.previousMovement,
            aggregate.previousSupply,
            aggregate.previousConsumed
          )
        }
      },
      null,
      2
    )
  );
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
  return [...canonicalGear.canonicalNhSwitchItemIds].map((itemId) => ({ itemId, name: `Item ${itemId}` }));
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

function behaviorSummary(styleCounts, specCounts, movementCounts, supplyCounts, consumedCounts) {
  return {
    style: percentMap(styleCounts),
    spec: percentMap(specCounts),
    movement: percentMap(movementCounts),
    supply: percentMap(supplyCounts),
    consumed: countMap(consumedCounts)
  };
}

function recordAction(styleCounts, specCounts, movementCounts, supplyCounts, action) {
  styleCounts[action.offenceStyle] += 1;
  specCounts[action.specIntent] += 1;
  movementCounts[action.movementIntent] += 1;
  supplyCounts[action.supplyIntent] += 1;
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
  vm.runInNewContext(transpiled, { module, exports: module.exports, require: localRequire, console, Math }, { filename: resolved });
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

function round(value) {
  return Math.round(value * 10) / 10;
}

function roundPct(value) {
  return `${(value * 100).toFixed(1)}%`;
}
