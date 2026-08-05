import {
  advanceRuntimePlayerCombat,
  createRuntimePlayerCombatState,
  requestRuntimePlayerCombatAttack,
  requestRuntimePlayerCombatSpell,
  syncRuntimePlayerCombatStateToInput
} from "../src/sim/runtimePlayerCombat";
import { nhLoadouts } from "../src/sim/nh/loadouts";

let state = createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes",
  localAttackSetIndex: 1,
  combatStartTick: 0,
  seed: 906
});

state = syncRuntimePlayerCombatStateToInput(state, {
  tiles: {
    "local-player": state.actors["local-player"].tile,
    opponent: state.actors.opponent.tile
  },
  equipment: {
    "local-player": {
      ...nhLoadouts["acb-hides"].equipment,
      weapon: { itemId: 22647, name: "Zuriel's staff (Deadman Mode)" }
    }
  }
});
state = requestRuntimePlayerCombatSpell(state, "local-player", "opponent", "ice-barrage");
state = advanceRuntimePlayerCombat(state, {
  tiles: {
    "local-player": state.actors["local-player"].tile,
    opponent: state.actors.opponent.tile
  }
}).state;

state = syncRuntimePlayerCombatStateToInput(state, {
  tiles: {
    "local-player": state.actors["local-player"].tile,
    opponent: state.actors.opponent.tile
  },
  equipment: {
    "local-player": {
      ...nhLoadouts["acb-hides"].equipment,
      weapon: { itemId: 26374, name: "Zaryte crossbow" }
    }
  }
});
state = requestRuntimePlayerCombatAttack(state, "local-player", "opponent");
while (state.tick <= 9) {
  state = advanceRuntimePlayerCombat(state, {
    tiles: {
      "local-player": state.actors["local-player"].tile,
      opponent: state.actors.opponent.tile
    }
  }).state;
}

const attackTicks = state.events
  .filter((event) => event.kind === "attack" && event.attackerId === "local-player")
  .map((event) => event.tick);
const expectedTicks = [0, 4, 9];
if (JSON.stringify(attackTicks) !== JSON.stringify(expectedTicks)) {
  throw new Error(`Unexpected Zuriel-to-crossbow attack ticks: ${JSON.stringify(attackTicks)}`);
}

console.log(`Zuriel cooldown carryover verified: ${attackTicks.join(" -> ")}`);
