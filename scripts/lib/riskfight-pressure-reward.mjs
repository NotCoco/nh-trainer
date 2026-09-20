// Training-only shaping. None of these quantities select or mask an action.
export const pressureRewardContract = {
  chance_probability_scale: 30, chance_reward_limit: 20,
  damage_reward: .01, pressure_reward_limit: 5,
  missed_attack_window_ticks: 20, missed_attack_base_cost: .02,
  missed_attack_recent_cost: .005
};

export function chanceRewardPotential(created, received) {
  const { chance_probability_scale: scale, chance_reward_limit: limit } = pressureRewardContract;
  return limit * Math.tanh(scale * (created - received) / limit);
}

export function pressureRewardPotential(damage) {
  const { damage_reward: scale, pressure_reward_limit: limit } = pressureRewardContract;
  return limit * -Math.expm1(-scale * damage / limit);
}

// Every missed ready tick has a cost. The rolling surcharge expires with time,
// never with an attack, so attack/wait/attack cannot erase accumulated cost.
// Normal weapon/food cooldowns and forced inability to attack add no misses.
export function missedAttackCost(history, tick, missed) {
  const contract = pressureRewardContract;
  while (history.length && history[0] <= tick - contract.missed_attack_window_ticks) history.shift();
  if (missed) history.push(tick);
  return missed ? contract.missed_attack_base_cost + contract.missed_attack_recent_cost * history.length : 0;
}
