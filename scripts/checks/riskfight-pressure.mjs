import assert from "node:assert/strict";
import { BrowserRiskFight } from "../riskfight-training-bridge.mjs";
import { loadTsModule } from "../lib/load-ts-module.mjs";
import { pressureRewardContract as contract, chanceRewardPotential, pressureRewardPotential, missedAttackCost } from "../lib/riskfight-pressure-reward.mjs";

export function verifyRiskFightPressure() {
  const history = [];
  assert.equal(missedAttackCost(history, 0, true), .025);
  assert.equal(missedAttackCost(history, 1, false), 0);
  assert.equal(missedAttackCost(history, 2, true), .03); // One attack cannot reset debt.
  assert.equal(missedAttackCost(history, 22, true), .025); // Time really does expire it.
  const totalCost = misses => {
    const recent = [];
    return Array.from({ length: 40 }, (_, tick) => missedAttackCost(recent, tick, misses(tick))).reduce((a, b) => a + b, 0);
  };
  assert.ok(totalCost(tick => tick % 2 === 0) > 20 * .025);
  assert.ok(totalCost(() => true) > totalCost(tick => tick % 2 === 0));
  assert.equal(totalCost(() => false), 0);
  for (const value of [0, .1, 1, 1000]) {
    assert.equal(chanceRewardPotential(value, 0), -chanceRewardPotential(0, value) || 0);
    assert.ok(Math.abs(chanceRewardPotential(value, 0)) <= contract.chance_reward_limit);
    assert.ok(pressureRewardPotential(value) <= contract.pressure_reward_limit);
  }
  // A one-tick tactical hold is cheap compared with avoiding a 1% lethal chance.
  assert.ok(chanceRewardPotential(0.01, 0) > .025);
  // Even worst-case shaping over a full 360-tick fight cannot make a win worse
  // than a draw or make a loss better than a draw. DPS farming cannot beat a KO.
  const maxStall = 360 * (contract.missed_attack_base_cost + 20 * contract.missed_attack_recent_cost);
  assert.ok(100 - contract.chance_reward_limit - maxStall > contract.chance_reward_limit + contract.pressure_reward_limit);
  assert.ok(-100 + contract.chance_reward_limit + contract.pressure_reward_limit < -contract.chance_reward_limit - maxStall);

  const risk = loadTsModule("src/sim/nh/riskfight.ts");
  const attack = risk.riskFightMainActions.indexOf("WEBWEAVER_ATTACK");
  const fight = new BrowserRiskFight({ seed: 25_700_001, startDistance: 1, maxTicks: 30 });
  fight.step([[attack, 0], [0, 0]]);
  const misses = fight.stats.missedAttackTicks[0];
  fight.step([[0, 0], [0, 0]]);
  assert.equal(fight.stats.missedAttackTicks[0], misses, "normal weapon cooldown was charged as stalling");
  while (!fight.frame()[0].main[attack]) fight.step([[0, 0], [0, 0]]);
  const attacks = fight.stats.attacks[0];
  fight.step([[0, 0], [0, 0]]);
  assert.equal(fight.stats.attacks[0], attacks, "WAIT did not cancel the attack target");
  assert.equal(fight.stats.missedAttackTicks[0], misses + 1);
  assert.equal(fight.stats.readyWaitTicks[0], 1);
  const eating = new BrowserRiskFight({ seed: 25_700_002, startDistance: 1, maxTicks: 30 });
  eating.state = { ...eating.state, actors: { ...eating.state.actors,
    "local-player": { ...eating.state.actors["local-player"], hitpoints: 70,
      attackTimer: { lastAttackTick: 0, weaponCooldownTicks: 0, additiveAttackDelayTicks: 0 } } } };
  eating.step([[risk.riskFightMainActions.indexOf("EAT_MARLIN"), 0], [0, 0]]);
  assert.equal(eating.stats.healingReadyTicks[0], 1);
  assert.equal(eating.stats.missedAttackTicks[0], 1);
  eating.step([[0, 0], [0, 0]]);
  assert.equal(eating.stats.missedAttackTicks[0], 1, "food-imposed cooldown charged an extra missed attack");
  const idle = new BrowserRiskFight({ seed: 25_700_003, startDistance: 1, maxTicks: 30 });
  while (!idle.done) idle.step([[0, 0], [0, 0]]);
  assert.equal(idle.report.pressureReward[0], 0);
  assert.equal(idle.report.chanceReward[0], 0);
  assert.ok(idle.report.objectiveReturn[0] < -30, "full-HP passivity can farm reward");
  return { briefHoldCost: .025, sustainedHoldCost: totalCost(() => true), alternatingHoldCost: totalCost(tick => tick % 2 === 0) };
}
