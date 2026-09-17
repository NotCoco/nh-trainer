import {
  advanceRuntimePlayerCombat,
  createRuntimePlayerCombatState,
  requestRuntimePlayerCombatAttack,
  requestRuntimePlayerCombatSpell,
  syncRuntimePlayerCombatStateToInput,
  type RuntimePlayerCombatState,
  type RuntimePlayerCombatSpellId
} from "../src/sim/runtimePlayerCombat";
import { nhLoadouts } from "../src/sim/nh/loadouts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function initial(staff: 4 | 5 = 4, crossbow: 4 | 5 = 5): RuntimePlayerCombatState {
  return createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 }, opponentTile: { x: 4, z: 0 },
    localLoadoutId: "acb-hides", opponentLoadoutId: "kodai-robes",
    localAttackSetIndex: 1, combatStartTick: 0, seed: 906,
    zurielsStaffCastCooldownTicks: staff, crossbowRapidCooldownTicks: crossbow
  });
}

function equip(state: RuntimePlayerCombatState, itemId: number, actorId: "local-player" | "opponent" = "local-player"): RuntimePlayerCombatState {
  return syncRuntimePlayerCombatStateToInput(state, {
    tiles: {},
    loadouts: { [actorId]: "acb-hides" },
    equipment: { [actorId]: { ...nhLoadouts["acb-hides"].equipment, weapon: { itemId, name: `Item ${itemId}` } } },
    attackSets: { [actorId]: 1 }
  });
}

function advance(state: RuntimePlayerCombatState): RuntimePlayerCombatState {
  return advanceRuntimePlayerCombat(state, { tiles: {} }).state;
}

function ticks(state: RuntimePlayerCombatState, actorId: "local-player" | "opponent" = "local-player"): number[] {
  return state.events.filter(event => event.kind === "attack" && event.attackerId === actorId).map(event => event.tick);
}

let checks = 0;
for (const staff of [4, 5] as const) {
  for (const crossbow of [4, 5] as const) {
    for (const actorId of ["local-player", "opponent"] as const) {
      const targetId = actorId === "local-player" ? "opponent" : "local-player";
      for (const spell of ["ice-barrage", "ice-blitz", "blood-barrage", "blood-blitz"] as const satisfies readonly RuntimePlayerCombatSpellId[]) {
        let state = equip(initial(staff, crossbow), 22647, actorId);
        state = advance(requestRuntimePlayerCombatSpell(state, actorId, targetId, spell));
        state = requestRuntimePlayerCombatAttack(equip(state, 26374, actorId), actorId, targetId);
        while (state.tick <= staff + crossbow) state = advance(state);
        const expected = [0, staff, staff + crossbow];
        assert(JSON.stringify(ticks(state, actorId)) === JSON.stringify(expected),
          `${actorId} ${spell} ${staff}/${crossbow}: ${JSON.stringify(ticks(state, actorId))}`);
        checks++;
      }
    }
  }
}

// Changing a menu setting or equipment must not rewrite an in-flight timer.
for (const oldSpeed of [4, 5] as const) {
  const newSpeed = oldSpeed === 4 ? 5 : 4;
  let state = equip(initial(oldSpeed, oldSpeed), 22647);
  state = advance(requestRuntimePlayerCombatSpell(state, "local-player", "opponent", "ice-barrage"));
  state = { ...state, zurielsStaffCastCooldownTicks: newSpeed, crossbowRapidCooldownTicks: newSpeed };
  state = requestRuntimePlayerCombatAttack(equip(state, 26374), "local-player", "opponent");
  while (state.tick <= oldSpeed + newSpeed) state = advance(state);
  assert(JSON.stringify(ticks(state)) === JSON.stringify([0, oldSpeed, oldSpeed + newSpeed]), "Mid-cycle toggle changed an existing staff timer.");
  state = requestRuntimePlayerCombatAttack(equip(initial(oldSpeed, oldSpeed), 26374), "local-player", "opponent");
  state = advance(state);
  state = { ...state, crossbowRapidCooldownTicks: newSpeed };
  while (state.tick <= oldSpeed + newSpeed) state = advance(state);
  assert(JSON.stringify(ticks(state)) === JSON.stringify([0, oldSpeed, oldSpeed + newSpeed]), "Mid-cycle toggle changed an existing crossbow timer.");
  checks += 2;
}

// Other staves, bows, and non-Rapid crossbow modes retain their normal timers.
for (const weapon of [11791, 4675]) {
  let state = equip(initial(4, 4), weapon);
  state = advance(requestRuntimePlayerCombatSpell(state, "local-player", "opponent", "ice-barrage"));
  assert(state.actors["local-player"].attackTimer.weaponCooldownTicks === 5, "Other staff cast speed changed.");
  checks++;
}
for (const weapon of [11785, 26374, 9185, 21902]) {
  for (const attackSet of [0, 3]) {
    let state = equip(initial(5, 4), weapon);
    state = syncRuntimePlayerCombatStateToInput(state, { tiles: {}, attackSets: { "local-player": attackSet } });
    state = advance(requestRuntimePlayerCombatAttack(state, "local-player", "opponent"));
    assert(state.actors["local-player"].attackTimer.weaponCooldownTicks === 6, "Non-Rapid crossbow speed changed.");
    checks++;
  }
}
let bow = equip(initial(5, 4), 861);
bow = advance(requestRuntimePlayerCombatAttack(bow, "local-player", "opponent"));
assert(bow.actors["local-player"].attackTimer.weaponCooldownTicks === 3, "Shortbow speed changed.");
checks++;

console.log(`Attack-speed checks passed: ${checks} scenarios; four/five-tick casts and crossbows, both actors, weapon switches, mid-cycle toggles, other weapons.`);
