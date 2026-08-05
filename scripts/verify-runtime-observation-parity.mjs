import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function resolveRelativeModule(parentPath, request) {
  const requested = path.resolve(path.dirname(parentPath), request);
  const candidates = [
    `${requested}.ts`,
    `${requested}.tsx`,
    `${requested}.json`,
    path.join(requested, "index.ts")
  ];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Try the next source form.
    }
  }
  return requested;
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

  const transpiled = ts.transpileModule(readFileSync(resolved, "utf8"), {
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
  const localRequire = (request) =>
    request.startsWith(".") ? loadAbsoluteModule(resolveRelativeModule(resolved, request)) : require(request);
  vm.runInNewContext(
    transpiled,
    { module, exports: module.exports, require: localRequire, console },
    { filename: resolved }
  );
  return module.exports;
}

const runtimeCombat = loadTsModule("src/sim/runtimePlayerCombat.ts");
const runtimePolicyOpponent = loadTsModule("src/sim/nh/runtime-policy-opponent.ts");
const nhLoadouts = loadTsModule("src/sim/nh/loadouts.ts");
const nhPolicyFeatures = loadTsModule("src/sim/nh/policy-features.ts");
const viewerSource = readFileSync(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
const runtimePolicyOpponentSource = readFileSync(
  path.join(projectRoot, "src", "sim", "nh", "runtime-policy-opponent.ts"),
  "utf8"
);

function createState(seed, overrides = {}) {
  return runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 4, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "kodai-robes",
    combatStartTick: 0,
    seed,
    ...overrides
  });
}

function advance(state, input) {
  return runtimeCombat.advanceRuntimePlayerCombat(state, {
    tileScale: 1,
    ...input
  });
}

const voidwakerEquipment = {
  ...nhLoadouts.nhLoadouts["tentacle-bandos"].equipment,
  weapon: { itemId: 27690, name: "Voidwaker" }
};

let localVoidwakerState = runtimeCombat.syncRuntimePlayerCombatStateToInput(createState(1, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "tentacle-bandos",
  localSpecialEnergy: 100
}), {
  tiles: {
    "local-player": { x: 0, z: 0 },
    opponent: { x: 1, z: 0 }
  },
  equipment: {
    "local-player": voidwakerEquipment
  }
});
assert(
  localVoidwakerState.actors["local-player"].weaponSwitchTick === localVoidwakerState.tick,
  "same-tick weapon changes should stamp the browser actor weapon-switch signal"
);

const ordinaryVoidwakerResult = advance(
  runtimeCombat.requestRuntimePlayerCombatAttack(localVoidwakerState, "local-player", "opponent"),
  {
    tiles: {
      "local-player": { x: 0, z: 0 },
      opponent: { x: 1, z: 0 }
    },
    loadouts: {
      "local-player": "tentacle-bandos",
      opponent: "kodai-robes"
    },
    equipment: {
      "local-player": voidwakerEquipment
    }
  }
);
const ordinaryVoidwakerAttack = ordinaryVoidwakerResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "local-player"
);
assert(
  ordinaryVoidwakerAttack &&
    ordinaryVoidwakerAttack.style !== "magic" &&
    ordinaryVoidwakerAttack.style !== "ranged" &&
    ordinaryVoidwakerAttack.specialAttack === undefined,
  `ordinary Voidwaker attack should be a base melee hit: ${JSON.stringify(ordinaryVoidwakerAttack)}`
);

const activatedVoidwaker = runtimeCombat.toggleRuntimePlayerCombatSpecial(localVoidwakerState, "local-player");
assert(
  activatedVoidwaker.mutation === "activate" &&
    activatedVoidwaker.state.actors["local-player"].voidwakerSpecsUsed === 1 &&
    activatedVoidwaker.state.actors["local-player"].lastSpecKind === "voidwaker" &&
    activatedVoidwaker.state.actors["local-player"].lastSpecTick === activatedVoidwaker.state.tick,
  "accepted non-Gmaul activation should record its count, kind, and tick immediately"
);
const launchedVoidwaker = advance(
  runtimeCombat.requestRuntimePlayerCombatAttack(activatedVoidwaker.state, "local-player", "opponent"),
  {
    tiles: {
      "local-player": { x: 0, z: 0 },
      opponent: { x: 1, z: 0 }
    },
    loadouts: {
      "local-player": "tentacle-bandos",
      opponent: "kodai-robes"
    },
    equipment: {
      "local-player": voidwakerEquipment
    }
  }
);
const voidwakerSpecialAttack = launchedVoidwaker.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "local-player"
);
const voidwakerBaseEstimate = runtimeCombat.runtimePlayerCombatDamageEstimate(
  activatedVoidwaker.state.actors["local-player"],
  activatedVoidwaker.state.actors.opponent,
  "slash"
);
const voidwakerSpecialDamage =
  activatedVoidwaker.state.actors.opponent.hitpoints - launchedVoidwaker.state.actors.opponent.hitpoints;
assert(
  voidwakerSpecialAttack?.specialAttack === "voidwaker" &&
    voidwakerSpecialAttack.style === "magic" &&
    voidwakerSpecialAttack.hitChance === 1 &&
    voidwakerSpecialAttack.maxDamage === Math.trunc(voidwakerBaseEstimate.maxDamage * 1.5) &&
    voidwakerSpecialDamage >= Math.trunc(voidwakerBaseEstimate.maxDamage * 0.5) &&
    voidwakerSpecialDamage <= Math.trunc(voidwakerBaseEstimate.maxDamage * 1.5) &&
    launchedVoidwaker.state.actors["local-player"].gmaul.specialEnergy === 50 &&
    launchedVoidwaker.state.actors["local-player"].voidwakerSpecsUsed === 1 &&
    launchedVoidwaker.state.actors["local-player"].attackStyleSignalTick === voidwakerSpecialAttack.tick,
  `Voidwaker special should be guaranteed 50-150% Magic damage, drain 50%, stamp the attack signal, and not double-count activation history: ${JSON.stringify({
    event: voidwakerSpecialAttack,
    baseMaxDamage: voidwakerBaseEstimate.maxDamage,
    damage: voidwakerSpecialDamage,
    specialEnergy: launchedVoidwaker.state.actors["local-player"].gmaul.specialEnergy,
    specsUsed: launchedVoidwaker.state.actors["local-player"].voidwakerSpecsUsed,
    attackStyleSignalTick: launchedVoidwaker.state.actors["local-player"].attackStyleSignalTick
  })}`
);

const offTickVoidwakerController = {
  id: "focused-off-tick-voidwaker",
  chooseAction: () => ({
    offenceStyle: "melee",
    defencePrayer: "protect_from_melee",
    movementIntent: "none",
    supplyIntent: "none",
    specIntent: "spec_voidwaker",
    extendedSupplyAction: false,
    attackIntent: "off_tick"
  })
};
let offTickState = runtimeCombat.syncRuntimePlayerCombatStateToInput(createState(2, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  opponentLoadoutId: "tentacle-bandos",
  opponentSpecialEnergy: 100
}), {
  tiles: {
    "local-player": { x: 0, z: 0 },
    opponent: { x: 1, z: 0 }
  },
  equipment: {
    opponent: voidwakerEquipment
  }
});
offTickState = {
  ...offTickState,
  actors: {
    ...offTickState.actors,
    opponent: {
      ...offTickState.actors.opponent,
      attackTimer: {
        lastAttackTick: -4,
        weaponCooldownTicks: 4,
        additiveAttackDelayTicks: 0
      }
    }
  }
};
const offTickApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: offTickState,
  controller: offTickVoidwakerController,
  localActor: {
    tile: offTickState.actors["local-player"].tile,
    loadoutId: offTickState.actors["local-player"].loadoutId,
    equipment: offTickState.actors["local-player"].equipment
  },
  opponentActor: {
    tile: offTickState.actors.opponent.tile,
    loadoutId: offTickState.actors.opponent.loadoutId,
    equipment: offTickState.actors.opponent.equipment
  }
});
const offTickDeferred = advance(offTickApplied.state, {
  tiles: {
    "local-player": { x: 0, z: 0 },
    opponent: { x: 1, z: 0 }
  },
  loadouts: {
    "local-player": "acb-hides",
    opponent: "tentacle-bandos"
  },
  equipment: {
    opponent: voidwakerEquipment
  }
});
assert(
  offTickApplied.effectiveAction.specIntent === "spec_voidwaker" &&
    offTickApplied.state.actors.opponent.voidwakerSpecsUsed === 1 &&
    offTickApplied.state.actors.opponent.lastSpecKind === "voidwaker" &&
    offTickApplied.state.actors.opponent.lastSpecTick === offTickApplied.state.tick &&
    !offTickDeferred.state.events.some(
      (event) => event.kind === "attack" && event.attackerId === "opponent" && event.tick === offTickApplied.state.tick
    ),
  "accepted off-tick Voidwaker should record history before its deferred launch"
);

const visibleThreatController = {
  id: "focused-visible-voidwaker-threat",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_melee",
    movementIntent: "none",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false,
    attackIntent: "hold"
  })
};

function applyVisibleVoidwakerThreat(distance, drainedEstimate = false) {
  let state = runtimeCombat.syncRuntimePlayerCombatStateToInput(createState(20 + distance, {
    localTile: { x: 0, z: 0 },
    opponentTile: { x: distance, z: 0 },
    localLoadoutId: "tentacle-bandos",
    opponentLoadoutId: "acb-hides",
    localSpecialEnergy: 100
  }), {
    tiles: {
      "local-player": { x: 0, z: 0 },
      opponent: { x: distance, z: 0 }
    },
    equipment: {
      "local-player": voidwakerEquipment
    }
  });
  if (drainedEstimate) {
    const localActor = state.actors["local-player"];
    const opponentActor = state.actors.opponent;
    state = {
      ...state,
      tick: 1,
      events: [
        {
          kind: "attack",
          id: "observed-double-gmaul-drain",
          tick: 0,
          attackerId: "local-player",
          defenderId: "opponent",
          attackerTile: localActor.tile,
          defenderTile: opponentActor.tile,
          style: "crush",
          sequenceName: "gmaul_special",
          hitDelayTicks: 0,
          maxDamage: 0,
          hitChance: 1,
          expectedDamage: 0,
          specialAttack: "granite_maul",
          specialAttackCount: 2,
          attackerActivePrayers: [],
          attackerEquipment: localActor.equipment,
          defenderEquipment: opponentActor.equipment
        }
      ]
    };
  }
  return runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
    state,
    controller: visibleThreatController,
    localActor: {
      tile: state.actors["local-player"].tile,
      loadoutId: state.actors["local-player"].loadoutId,
      equipment: state.actors["local-player"].equipment
    },
    opponentActor: {
      tile: state.actors.opponent.tile,
      loadoutId: state.actors.opponent.loadoutId,
      equipment: state.actors.opponent.equipment
    }
  });
}

const drainedVoidwakerThreat = applyVisibleVoidwakerThreat(1, true);
const unreachableVoidwakerThreat = applyVisibleVoidwakerThreat(4);
const reachableVoidwakerThreat = applyVisibleVoidwakerThreat(1);
const drainedVoidwakerInput = nhPolicyFeatures.encodeNhPolicyInput(drainedVoidwakerThreat.context);
const unreachableVoidwakerInput = nhPolicyFeatures.encodeNhPolicyInput(unreachableVoidwakerThreat.context);
const reachableVoidwakerInput = nhPolicyFeatures.encodeNhPolicyInput(reachableVoidwakerThreat.context);
assert(
  drainedVoidwakerThreat.context.opponent.lastVisibleOpponentStyle === "melee" &&
  unreachableVoidwakerThreat.context.opponent.weaponId === "voidwaker" &&
    unreachableVoidwakerThreat.context.opponent.lastVisibleOpponentStyle === "melee" &&
    reachableVoidwakerThreat.context.opponent.lastVisibleOpponentStyle === "melee" &&
    drainedVoidwakerThreat.context.opponent.lastOffenceStyle === "melee" &&
    unreachableVoidwakerThreat.context.opponent.lastOffenceStyle === "melee" &&
    reachableVoidwakerThreat.context.opponent.lastOffenceStyle === "magic" &&
    JSON.stringify(drainedVoidwakerInput.slice(43, 46)) === JSON.stringify([0, 0, 1]) &&
    JSON.stringify(unreachableVoidwakerInput.slice(43, 46)) === JSON.stringify([0, 0, 1]) &&
    JSON.stringify(reachableVoidwakerInput.slice(43, 46)) === JSON.stringify([1, 0, 0]),
  `Voidwaker visible gear should remain Melee while only an energized reachable spec threat promotes raw114 likely style to Magic: ${JSON.stringify({
    drainedLikely: drainedVoidwakerThreat.context.opponent.lastOffenceStyle,
    drainedRawLikely: drainedVoidwakerInput.slice(43, 46),
    unreachableStyle: unreachableVoidwakerThreat.context.opponent.lastVisibleOpponentStyle,
    unreachableLikely: unreachableVoidwakerThreat.context.opponent.lastOffenceStyle,
    unreachableRawLikely: unreachableVoidwakerInput.slice(43, 46),
    reachableStyle: reachableVoidwakerThreat.context.opponent.lastVisibleOpponentStyle,
    reachableLikely: reachableVoidwakerThreat.context.opponent.lastOffenceStyle,
    reachableRawLikely: reachableVoidwakerInput.slice(43, 46)
  })}`
);
assert(
  !runtimePolicyOpponentSource.includes("27690 // VOIDWAKER spec threat") &&
    runtimePolicyOpponentSource.includes('context.opponent.weaponId === "voidwaker"') &&
    runtimePolicyOpponentSource.includes("canMeleeStepInReachNextTick({"),
  "Voidwaker must not remain in the generic Magic-weapon set"
);

assert(
  !viewerSource.includes("promoteCurrentLocalAppearance") &&
    viewerSource.includes("const observedLocalAppearance = delayedLocalAppearance") &&
    viewerSource.includes("const policyObservedLocalInfoDelayTicks: 0 | 1 = 1") &&
    viewerSource.includes("lastVengeanceTrinketCastTick: combatActor.lastVengeanceTrinketCastTick") &&
    viewerSource.includes("vengeanceTrinketCasts: combatActor.vengeanceTrinketCasts"),
  "runtime viewer must never promote a current-tick snapshot: a weapon switch or launched attack has to reach the bot on the following tick so prayer is predicted, not same-tick reacted"
);
assert(
  viewerSource.includes("localMovedThisTick || syncedLocal.serverRouteWaypoints.length > 0") &&
    viewerSource.includes("opponentMovedThisTick || syncedOpponent.serverRouteWaypoints.length > 0"),
  "runtime viewer movement features should remain set while the authoritative route is pending"
);
assert(
  viewerSource.includes("__NH_TRAINER_ENABLE_MANUAL_OPPONENT_POLICY_TRACE === true") &&
    viewerSource.includes("selectedPolicyController.setDecisionTraceEnabled(policyDecisionTraceEnabled)") &&
    viewerSource.includes("decisionTrace: response.policyDecisionTrace"),
  "full browser decision traces should be exposed only through the explicit opt-in diagnostic gate"
);

console.log("Runtime observation/Voidwaker parity verification passed.");
