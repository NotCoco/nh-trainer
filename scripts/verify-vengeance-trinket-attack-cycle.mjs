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
    { module, exports: module.exports, require: localRequire, console },
    { filename: resolved }
  );
  return module.exports;
}

function resolveRelativeModule(parentPath, request) {
  const requested = path.resolve(path.dirname(parentPath), request);
  const candidates = requested.endsWith(".ts") || requested.endsWith(".json")
    ? [requested]
    : [`${requested}.ts`, `${requested}.tsx`, `${requested}.json`, path.join(requested, "index.ts")];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Try the next supported module suffix.
    }
  }
  return candidates[0];
}

const runtimeCombat = loadTsModule("src/sim/runtimePlayerCombat.ts");
const runtimePolicy = loadTsModule("src/sim/nh/runtime-policy-opponent.ts");
const nhInventory = loadTsModule("src/render/nhInventory.ts");
const conditionedPolicy = loadTsModule("src/bot/conditioned-policy-v10.ts");

function createState(seed, overrides = {}) {
  return runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 4, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "acb-hides",
    localVengeanceTrinketCharges: 1,
    opponentVengeanceTrinketCharges: 1,
    combatStartTick: 0,
    seed,
    ...overrides
  });
}

function advance(state) {
  return runtimeCombat.advanceRuntimePlayerCombat(state, {
    tiles: {
      "local-player": state.actors["local-player"].tile,
      opponent: state.actors.opponent.tile
    }
  }).state;
}

function attackEvent(state, attackerId) {
  return state.events.find((event) => event.kind === "attack" && event.attackerId === attackerId);
}

function attackTicks(state, attackerId) {
  return state.events
    .filter((event) => event.kind === "attack" && event.attackerId === attackerId)
    .map((event) => event.tick);
}

function manualTrace(useTrinket) {
  let state = createState(0x56454e47);
  if (useTrinket) {
    const activation = runtimeCombat.activateRuntimePlayerCombatVengeanceTrinket(state, "local-player", 0);
    assert(activation.activated, "manual trinket setup should activate");
    state = activation.state;
  }
  state = runtimeCombat.requestRuntimePlayerCombatAttack(state, "local-player", "opponent");
  state = advance(state);
  return {
    event: attackEvent(state, "local-player"),
    timer: state.actors["local-player"].attackTimer,
    targetId: state.actors["local-player"].targetId
  };
}

function policyTrace(useTrinket) {
  const initial = createState(0x504f4c49);
  const controller = {
    id: useTrinket ? "test-vengeance-attack" : "test-control-attack",
    chooseAction: () => ({
      offenceStyle: "ranged",
      defencePrayer: "protect_from_magic",
      movementIntent: "none",
      supplyIntent: useTrinket ? "vengeance_trinket" : "none",
      specIntent: "none",
      extendedSupplyAction: false,
      attackIntent: "attack",
      equipmentIntent: "weapon_only"
    })
  };
  const applied = runtimePolicy.applyRuntimeOpponentPolicyAction({
    state: initial,
    controller,
    localActor: {
      tile: initial.actors["local-player"].tile,
      loadoutId: initial.actors["local-player"].loadoutId
    },
    opponentActor: {
      tile: initial.actors.opponent.tile,
      loadoutId: initial.actors.opponent.loadoutId
    },
    allowSourceLoadoutSync: false
  });
  const state = advance(applied.state);
  return {
    event: attackEvent(state, "opponent"),
    timer: state.actors.opponent.attackTimer,
    targetId: state.actors.opponent.targetId,
    vengeanceActive: state.actors.opponent.vengeanceActive
  };
}

function manualRepeatedAttackTrace(useTrinket) {
  let state = createState(0x4359434c);
  state = runtimeCombat.requestRuntimePlayerCombatAttack(state, "local-player", "opponent");
  state = advance(state);
  if (useTrinket) {
    const activation = runtimeCombat.activateRuntimePlayerCombatVengeanceTrinket(state, "local-player", 30);
    assert(activation.activated, "mid-cycle manual trinket setup should activate");
    state = activation.state;
  }
  state = runtimeCombat.requestRuntimePlayerCombatAttack(state, "local-player", "opponent");
  while (state.tick <= 7) {
    state = advance(state);
  }
  return {
    attackTicks: attackTicks(state, "local-player"),
    timer: state.actors["local-player"].attackTimer,
    targetId: state.actors["local-player"].targetId
  };
}

function policyRepeatedAttackTrace(useTrinket) {
  let state = createState(0x50435943);
  const controller = {
    id: useTrinket ? "test-vengeance-cycle" : "test-control-cycle",
    chooseAction: (context) => ({
      offenceStyle: "ranged",
      defencePrayer: "protect_from_magic",
      movementIntent: "none",
      supplyIntent: useTrinket && context.tick === 1 ? "vengeance_trinket" : "none",
      specIntent: "none",
      extendedSupplyAction: false,
      attackIntent: "attack",
      equipmentIntent: "weapon_only"
    })
  };
  while (state.tick <= 7) {
    const applied = runtimePolicy.applyRuntimeOpponentPolicyAction({
      state,
      controller,
      localActor: {
        tile: state.actors["local-player"].tile,
        loadoutId: state.actors["local-player"].loadoutId
      },
      opponentActor: {
        tile: state.actors.opponent.tile,
        loadoutId: state.actors.opponent.loadoutId
      },
      allowSourceLoadoutSync: false
    });
    state = advance(applied.state);
  }
  return {
    attackTicks: attackTicks(state, "opponent"),
    timer: state.actors.opponent.attackTimer,
    targetId: state.actors.opponent.targetId,
    vengeanceActive: state.actors.opponent.vengeanceActive
  };
}

function assertSameAttackCycle(label, control, vengeance) {
  assert(control.event, `${label} control should launch an attack`);
  assert(vengeance.event, `${label} should launch an attack after activating Vengeance`);
  assert(
    vengeance.event.tick === control.event.tick &&
      vengeance.timer.lastAttackTick === control.timer.lastAttackTick &&
      vengeance.timer.weaponCooldownTicks === control.timer.weaponCooldownTicks &&
      vengeance.timer.additiveAttackDelayTicks === control.timer.additiveAttackDelayTicks &&
      vengeance.targetId === control.targetId,
    `${label} Vengeance path changed the attack cycle: ${JSON.stringify({ control, vengeance })}`
  );
}

const manualControl = manualTrace(false);
const manualVengeance = manualTrace(true);
assertSameAttackCycle("manual player", manualControl, manualVengeance);

const policyControl = policyTrace(false);
const policyVengeance = policyTrace(true);
assert(policyVengeance.vengeanceActive, "policy bot should activate Vengeance");
assertSameAttackCycle("policy bot", policyControl, policyVengeance);

const manualCycleControl = manualRepeatedAttackTrace(false);
const manualCycleVengeance = manualRepeatedAttackTrace(true);
assert(
  JSON.stringify(manualCycleVengeance) === JSON.stringify(manualCycleControl),
  `manual mid-cycle Vengeance changed repeated attack timing: ${JSON.stringify({ manualCycleControl, manualCycleVengeance })}`
);

const policyCycleControl = policyRepeatedAttackTrace(false);
const policyCycleVengeance = policyRepeatedAttackTrace(true);
assert(policyCycleVengeance.vengeanceActive, "policy bot should retain Vengeance after the mid-cycle cast");
assert(
  JSON.stringify({
    attackTicks: policyCycleVengeance.attackTicks,
    timer: policyCycleVengeance.timer,
    targetId: policyCycleVengeance.targetId
  }) === JSON.stringify({
    attackTicks: policyCycleControl.attackTicks,
    timer: policyCycleControl.timer,
    targetId: policyCycleControl.targetId
  }),
  `policy mid-cycle Vengeance changed repeated attack timing: ${JSON.stringify({ policyCycleControl, policyCycleVengeance })}`
);

// Mirror the real DMM layout after one manta has been consumed. Java's
// Teacher165 trace removes the Torva helm for a safe cast, putting that helm in
// the newly free inventory slot, then equips it again on the following tick.
const dmmInventoryAfterOneManta = [
  12695, 22461, 10925, 10925, 13441, null, 6685, 10925,
  391, 391, 6685, 6685, 27238, 26374, 391, 391,
  26386, 11283, 29796, 391, 7462, 22613, 27690, 4153,
  28561, 391, 391, 12791
].map((itemId) => itemId === null ? null : ({ itemId, quantity: itemId === 28561 ? 2 : 1 }));
const dmmStartingEquipment = [26382, 21791, 6585, 22647, 26243, 27251, 26245, 31106, 31097, 19710, 21950];
const unequippedHelmetInventory = nhInventory.reconstructNhOwnedInventorySlots({
  remainingStartingInventorySlots: dmmInventoryAfterOneManta,
  startingEquipmentItemIds: dmmStartingEquipment,
  currentEquipmentItemIds: [21791, 6585, 22647, 26243, 27251, 26245, 31106, 31097, 19710, 21950]
});
assert(
  unequippedHelmetInventory.length === 28 &&
    unequippedHelmetInventory.filter((slot) => slot?.itemId === 26382).length === 1,
  "an honestly unequipped Torva helm should occupy the freed inventory slot instead of disappearing"
);
const reequippedHelmetInventory = nhInventory.reconstructNhOwnedInventorySlots({
  remainingStartingInventorySlots: dmmInventoryAfterOneManta,
  startingEquipmentItemIds: dmmStartingEquipment,
  currentEquipmentItemIds: [26382, 21791, 6585, 22647, 27238, 11283, 26386, 31106, 31097, 19710, 21950]
});
assert(
  reequippedHelmetInventory.every((slot) => slot?.itemId !== 26382) &&
    reequippedHelmetInventory.filter((slot) => slot === null).length === 1,
  "re-equipping the Torva helm should remove it from inventory and restore the free slot"
);

const headConditioner = {
  safeMagicLegs: {
    ageInputIndex: 110,
    maxAgeExclusive: 0.5,
    actionRow: 63,
    strength: 0
  },
  magicFullOffence: {
    actionRows: Int32Array.from([63, 77, 57, 62, 71]),
    actionSigns: Int32Array.from([1, 1, -1, 1, -1]),
    maxStrength: [
      Float32Array.from([8, 8, 8, 12, 12]),
      Float32Array.from([0.05, 0.05, 0.05, 0, 0])
    ],
    strength: [
      Float32Array.from([3, 3, 3, 1.6415416, 1.6881937]),
      Float32Array.from([0.05, 0.05, 0.05, 0, 0])
    ]
  }
};
const safeMagicUnequipScore = conditionedPolicy.conditionedGearScore(
  headConditioner, 77, 1, [], 5, 1
);
const unsafeHoldUnequipScore = conditionedPolicy.conditionedGearScore(
  headConditioner, 77, 0, [], 0, 1
);
const unsafeHoldTorvaScore = conditionedPolicy.conditionedGearScore(
  headConditioner, 57, 0, [], 0, -2
);
assert(safeMagicUnequipScore > 0, "a safe magic cast should still allow helmet removal");
assert(unsafeHoldUnequipScore === -8, "an unsafe hold tick must suppress helmet removal");
assert(unsafeHoldTorvaScore === 8, "an unsafe hold tick must restore the Torva helm");

console.log(JSON.stringify({
  manualOpening: {
    controlTick: manualControl.event.tick,
    vengeanceTick: manualVengeance.event.tick,
    controlTimer: manualControl.timer,
    vengeanceTimer: manualVengeance.timer
  },
  policyOpening: {
    controlTick: policyControl.event.tick,
    vengeanceTick: policyVengeance.event.tick,
    controlTimer: policyControl.timer,
    vengeanceTimer: policyVengeance.timer
  },
  manualRepeated: { control: manualCycleControl, vengeance: manualCycleVengeance },
  policyRepeated: { control: policyCycleControl, vengeance: policyCycleVengeance },
  helmetInventory: {
    unequippedItemId: unequippedHelmetInventory.find((slot) => slot?.itemId === 26382)?.itemId ?? null,
    reequippedFreeSlots: reequippedHelmetInventory.filter((slot) => slot === null).length
  },
  helmetPolicy: {
    safeMagicUnequipScore,
    unsafeHoldUnequipScore,
    unsafeHoldTorvaScore
  }
}, null, 2));
console.log("Vengeance attack-cycle, helmet inventory, and unsafe hold restoration verified.");
