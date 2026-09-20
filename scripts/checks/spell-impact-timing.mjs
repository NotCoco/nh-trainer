import assert from "node:assert/strict";
import { loadTsModule } from "../lib/load-ts-module.mjs";

// Node-only regression checks; never imported by the playable trainer.
export function verifySpellImpactTiming() {
  const combat = loadTsModule("src/sim/runtimePlayerCombat.ts");
  const gear = loadTsModule("src/sim/nh/canonicalGear.ts").canonicalNhGear;
  function advance(state) {
    return combat.advanceRuntimePlayerCombat(state, { tiles: {}, tileScale: 1 }).state;
  }

  // Source: Projectile.send, TargetSpell.hit and Hit.clientDelay/defend/finish.
  // Emulate the Java countdown independently of the browser's absolute dueTick.
  function javaImpactTick(distance, projectileDelay, targetAlreadyProcessed) {
    let countdown = Math.max(1, Math.trunc((projectileDelay + 56 + 10 * (distance - 1)) * 19 / 600));
    if (targetAlreadyProcessed) countdown -= 1;
    for (let tick = targetAlreadyProcessed ? 1 : 0; tick < 10; tick += 1) {
      if (countdown-- <= 0) return tick;
    }
    throw new Error("Java projectile countdown did not finish");
  }

  let cases = 0;
  for (const spellId of ["ice-blitz", "ice-barrage", "blood-blitz", "blood-barrage"]) {
    for (const distance of [1, 2, 4, 7, 10]) {
      for (const targetAlreadyProcessed of [false, true]) {
        for (const useZuriel of [false, true]) {
          let state = combat.createRuntimePlayerCombatState({
            localTile: { x: 0, z: 0 }, opponentTile: { x: distance, z: 0 },
            localLoadoutId: "kodai-robes", opponentLoadoutId: "kodai-robes",
            combatStartTick: 0, seed: 220
          });
          state = {
            ...state,
            processOrder: targetAlreadyProcessed ? ["opponent", "local-player"] : ["local-player", "opponent"],
            nextProcessOrderShuffleTick: 999
          };
          if (useZuriel) {
            state = combat.syncRuntimePlayerCombatStateToInput(state, {
              tiles: {}, equipment: { "local-player": { ...state.actors["local-player"].equipment, weapon: gear.zurielsStaff } }
            });
          }
          const hpBefore = state.actors.opponent.hitpoints;
          state = advance(combat.requestRuntimePlayerCombatSpell(state, "local-player", "opponent", spellId));
          const label = `${spellId}, distance ${distance}, target processed ${targetAlreadyProcessed}, Zuriel ${useZuriel}`;
          const attack = state.events.find(event => event.kind === "attack");
          const hit = state.queuedHits[0];
          const dueTick = javaImpactTick(distance, spellId === "ice-blitz" ? 0 : 51, targetAlreadyProcessed);
          assert(attack && hit, `${label}: cast must queue a delayed hit`);
          assert.equal(hit.dueTick, dueTick, `${label}: Java impact timing`);
          assert.equal(hit.hitsplatTick, dueTick, `${label}: hitsplat timing`);
          assert.equal(state.actors.opponent.hitpoints, hpBefore, `${label}: no damage on cast tick`);
          assert(!state.events.some(event => event.kind === "hitsplat"), `${label}: no instant hitsplat`);
          if (spellId.startsWith("ice-") && hit.rawDamage > 0) {
            assert(state.actors.opponent.locks.freezeUntilTick > state.tick,
              `${label}: Java applies a successful freeze at cast time`);
          }
          assert.equal(state.actors["local-player"].attackTimer.weaponCooldownTicks, useZuriel ? 4 : 5,
            `${label}: preserve shared weapon cooldown`);

          // Make the queued outcome nonzero to test HP, effect and sound delivery
          // independently of the accuracy roll; the cast and due tick are real.
          state = { ...state, queuedHits: [{ ...hit, damage: 20, rawDamage: 20 }] };
          while (state.tick <= dueTick) {
            const processingTick = state.tick;
            state = advance(state);
            if (processingTick < dueTick) {
              assert.equal(state.actors.opponent.hitpoints, hpBefore, `${label}: damage before impact`);
              assert(!state.events.some(event => event.kind === "hitsplat"), `${label}: hitsplat before impact`);
            }
          }
          const hitsplat = state.events.find(event => event.kind === "hitsplat" && event.spellId === spellId);
          assert.equal(hitsplat?.tick, dueTick, `${label}: damage event`);
          assert.equal(state.actors.opponent.hitpoints, hpBefore - 20, `${label}: HP matches impact`);
          const hitGfx = { "ice-blitz": 367, "ice-barrage": 369, "blood-blitz": 375, "blood-barrage": 377 }[spellId];
          assert(state.events.some(event => event.kind === "spotanim" && event.spotanimId === hitGfx && event.tick === dueTick),
            `${label}: hit effect must arrive with damage`);
          cases += 1;
        }
      }
    }
  }
  console.log(`Spell impact checks passed: ${cases} distance, processing-order and NH/DMM weapon cases.`);
}
