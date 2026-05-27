import {
  applyFoodAttackDelay,
  applyKarambwanAttackDelay,
  type AttackTimerState
} from "../combat/timers";

export type StatKey = "attack" | "strength" | "defence" | "ranged" | "magic" | "hitpoints" | "prayer";

export interface SimStat {
  readonly current: number;
  readonly fixed: number;
}

export type SimStats = Readonly<Record<StatKey, SimStat>>;

export interface SupplyDelayState {
  readonly eatDelayUntilTick: number;
  readonly karambwanDelayUntilTick: number;
  readonly potionDelayUntilTick: number;
}

export type ConsumableId =
  | "manta_ray"
  | "shark"
  | "anglerfish"
  | "karambwan"
  | "saradomin_brew"
  | "super_restore"
  | "sanfew_serum"
  | "super_combat"
  | "ranging_potion"
  | "bastion";

export interface ConsumableDefinition {
  readonly id: ConsumableId;
  readonly label: string;
  readonly kind: "food" | "karambwan" | "potion" | "brew" | "restore" | "reboost";
  readonly itemIds: readonly number[];
  readonly delayTicks: number;
  readonly attackDelay: "food" | "karambwan" | "none";
}

export interface ConsumeInput {
  readonly stats: SimStats;
  readonly delays: SupplyDelayState;
  readonly attackTimer: AttackTimerState;
  readonly currentTick: number;
  readonly item: ConsumableId;
  readonly noFoodRule?: boolean;
  readonly noDrinksRule?: boolean;
}

export interface ConsumeResult {
  readonly ok: boolean;
  readonly reason?: "eat-delay" | "karambwan-delay" | "potion-delay" | "no-food" | "no-drinks";
  readonly stats: SimStats;
  readonly delays: SupplyDelayState;
  readonly attackTimer: AttackTimerState;
  readonly healed: number;
}

export const consumableDefinitions: Readonly<Record<ConsumableId, ConsumableDefinition>> = {
  manta_ray: {
    id: "manta_ray",
    label: "Manta ray",
    kind: "food",
    itemIds: [391],
    delayTicks: 3,
    attackDelay: "food"
  },
  shark: {
    id: "shark",
    label: "Shark",
    kind: "food",
    itemIds: [385],
    delayTicks: 3,
    attackDelay: "food"
  },
  anglerfish: {
    id: "anglerfish",
    label: "Anglerfish",
    kind: "food",
    itemIds: [13441],
    delayTicks: 3,
    attackDelay: "food"
  },
  karambwan: {
    id: "karambwan",
    label: "Cooked karambwan",
    kind: "karambwan",
    itemIds: [3144],
    delayTicks: 3,
    attackDelay: "karambwan"
  },
  saradomin_brew: {
    id: "saradomin_brew",
    label: "Saradomin brew",
    kind: "brew",
    itemIds: [6685, 6687, 6689, 6691, 23575, 23577, 23579, 23581],
    delayTicks: 3,
    attackDelay: "none"
  },
  super_restore: {
    id: "super_restore",
    label: "Super restore",
    kind: "restore",
    itemIds: [3024, 3026, 3028, 3030],
    delayTicks: 3,
    attackDelay: "none"
  },
  sanfew_serum: {
    id: "sanfew_serum",
    label: "Sanfew serum",
    kind: "restore",
    itemIds: [10925, 10927, 10929, 10931],
    delayTicks: 3,
    attackDelay: "none"
  },
  super_combat: {
    id: "super_combat",
    label: "Super combat potion",
    kind: "reboost",
    itemIds: [12695, 12697, 12699, 12701],
    delayTicks: 3,
    attackDelay: "none"
  },
  ranging_potion: {
    id: "ranging_potion",
    label: "Ranging potion",
    kind: "reboost",
    itemIds: [2444, 169, 171, 173, 23551, 23553, 23555, 23557, 23733, 23736, 23739, 23742],
    delayTicks: 3,
    attackDelay: "none"
  },
  bastion: {
    id: "bastion",
    label: "Bastion potion",
    kind: "reboost",
    itemIds: [22461, 22464, 22467, 22470],
    delayTicks: 3,
    attackDelay: "none"
  }
};

export function consumableDoseCountForItemId(itemId: number): number {
  for (const definition of Object.values(consumableDefinitions)) {
    const index = definition.itemIds.indexOf(itemId);
    if (index < 0) {
      continue;
    }
    if (!isDoseBasedConsumable(definition)) {
      return 1;
    }
    return 4 - (index % 4);
  }
  return 0;
}

export function consumableUseCountForItemId(itemId: number, quantity = 1): number {
  const doses = consumableDoseCountForItemId(itemId);
  return doses <= 0 ? 0 : doses * Math.max(1, Math.trunc(quantity));
}

export function consumableItemIdForDoseCount(item: ConsumableId, doseCount: number, preferredItemId?: number): number {
  const definition = consumableDefinitions[item];
  if (!isDoseBasedConsumable(definition)) {
    return definition.itemIds[0] ?? preferredItemId ?? 0;
  }

  const dose = Math.max(1, Math.min(4, Math.trunc(doseCount)));
  const preferredIndex = preferredItemId === undefined ? -1 : definition.itemIds.indexOf(preferredItemId);
  const blockStart = preferredIndex >= 0 ? preferredIndex - (preferredIndex % 4) : 0;
  return definition.itemIds[blockStart + (4 - dose)] ?? definition.itemIds[4 - dose] ?? preferredItemId ?? definition.itemIds[0] ?? 0;
}

function isDoseBasedConsumable(definition: ConsumableDefinition): boolean {
  return definition.kind === "potion" || definition.kind === "brew" || definition.kind === "restore" || definition.kind === "reboost";
}

export function createSupplyDelayState(): SupplyDelayState {
  return {
    eatDelayUntilTick: -1,
    karambwanDelayUntilTick: -1,
    potionDelayUntilTick: -1
  };
}

function isNhTickDelayActive(delayUntilTick: number, currentTick: number): boolean {
  return delayUntilTick > currentTick;
}

export function canConsume(input: Pick<ConsumeInput, "currentTick" | "delays" | "item" | "noFoodRule" | "noDrinksRule">):
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ConsumeResult["reason"] } {
  const definition = consumableDefinitions[input.item];
  const foodLike = definition.kind === "food" || definition.kind === "karambwan" || definition.kind === "brew";
  const drinkLike = definition.kind === "potion" || definition.kind === "brew" || definition.kind === "restore" || definition.kind === "reboost";

  if (foodLike && input.noFoodRule) {
    return { ok: false, reason: "no-food" };
  }
  if (drinkLike && input.noDrinksRule) {
    return { ok: false, reason: "no-drinks" };
  }

  if (definition.kind === "karambwan") {
    return isNhTickDelayActive(input.delays.karambwanDelayUntilTick, input.currentTick)
      ? { ok: false, reason: "karambwan-delay" }
      : { ok: true };
  }

  if (definition.kind === "food") {
    if (isNhTickDelayActive(input.delays.eatDelayUntilTick, input.currentTick)) {
      return { ok: false, reason: "eat-delay" };
    }
    if (isNhTickDelayActive(input.delays.karambwanDelayUntilTick, input.currentTick)) {
      return { ok: false, reason: "karambwan-delay" };
    }
    if (isNhTickDelayActive(input.delays.potionDelayUntilTick, input.currentTick)) {
      return { ok: false, reason: "potion-delay" };
    }
    return { ok: true };
  }

  if (isNhTickDelayActive(input.delays.potionDelayUntilTick, input.currentTick)) {
    return { ok: false, reason: "potion-delay" };
  }
  if (isNhTickDelayActive(input.delays.karambwanDelayUntilTick, input.currentTick)) {
    return { ok: false, reason: "karambwan-delay" };
  }
  return { ok: true };
}

export function applyConsumable(input: ConsumeInput): ConsumeResult {
  const allowed = canConsume(input);
  if (!allowed.ok) {
    return {
      ok: false,
      reason: allowed.reason,
      stats: input.stats,
      delays: input.delays,
      attackTimer: input.attackTimer,
      healed: 0
    };
  }

  const definition = consumableDefinitions[input.item];
  let stats = input.stats;
  let attackTimer = input.attackTimer;
  let healed = 0;
  let delays = input.delays;

  if (definition.kind === "food") {
    const result = applyFood(input.item, stats);
    stats = result.stats;
    healed = result.healed;
    delays = {
      ...delays,
      eatDelayUntilTick: input.currentTick + definition.delayTicks
    };
    attackTimer = applyFoodAttackDelay(attackTimer);
  } else if (definition.kind === "karambwan") {
    const result = heal(stats, 18, "hitpoints");
    stats = result.stats;
    healed = result.healed;
    delays = {
      ...delays,
      karambwanDelayUntilTick: input.currentTick + definition.delayTicks
    };
    attackTimer = applyKarambwanAttackDelay(
      attackTimer,
      isNhTickDelayActive(input.delays.eatDelayUntilTick, input.currentTick)
    );
  } else {
    const result = applyPotionEffect(input.item, stats);
    stats = result.stats;
    healed = result.healed;
    delays = {
      ...delays,
      potionDelayUntilTick: input.currentTick + definition.delayTicks
    };
  }

  return {
    ok: true,
    stats,
    delays,
    attackTimer,
    healed
  };
}

export function applyFood(item: ConsumableId, stats: SimStats): { readonly stats: SimStats; readonly healed: number } {
  if (item === "manta_ray") {
    return heal(stats, 22, "hitpoints");
  }
  if (item === "shark") {
    return heal(stats, 20, "hitpoints");
  }
  if (item === "anglerfish") {
    const hitpoints = stats.hitpoints;
    const c = hitpoints.fixed <= 24 ? 2 : hitpoints.fixed <= 49 ? 4 : hitpoints.fixed <= 74 ? 6 : hitpoints.fixed <= 92 ? 8 : 13;
    const restore = Math.floor(hitpoints.fixed / 10) + c;
    const current = Math.min(hitpoints.current + restore, hitpoints.fixed + restore);
    return {
      stats: setStat(stats, "hitpoints", current),
      healed: current - hitpoints.current
    };
  }
  return { stats, healed: 0 };
}

export function applyPotionEffect(item: ConsumableId, stats: SimStats): { readonly stats: SimStats; readonly healed: number } {
  if (item === "saradomin_brew") {
    let next = boostStat(stats, "hitpoints", 2, 0.15);
    const healed = next.hitpoints.current - stats.hitpoints.current;
    next = boostStat(next, "defence", 2, 0.2);
    next = drainStat(next, "attack", 0.1);
    next = drainStat(next, "strength", 0.1);
    next = drainStat(next, "ranged", 0.1);
    next = drainStat(next, "magic", 0.1);
    return { stats: next, healed };
  }

  if (item === "super_restore" || item === "sanfew_serum") {
    return { stats: restoreStats(stats, true), healed: 0 };
  }

  if (item === "super_combat") {
    return {
      stats: boostStat(boostStat(boostStat(stats, "attack", 5, 0.15), "strength", 5, 0.15), "defence", 5, 0.15),
      healed: 0
    };
  }

  if (item === "ranging_potion") {
    return {
      stats: boostStat(stats, "ranged", 4, 0.1),
      healed: 0
    };
  }

  if (item === "bastion") {
    return {
      stats: boostStat(boostStat(stats, "ranged", 4, 0.1), "defence", 5, 0.15),
      healed: 0
    };
  }

  return { stats, healed: 0 };
}

export function visibleLevelRatio(stats: SimStats, stat: Exclude<StatKey, "hitpoints" | "prayer">): number {
  const current = stats[stat].current;
  const fixed = stats[stat].fixed;
  return fixed <= 0 ? 0 : current / fixed;
}

function heal(stats: SimStats, amount: number, stat: "hitpoints"): { readonly stats: SimStats; readonly healed: number } {
  const current = stats[stat].current;
  const next = Math.min(stats[stat].fixed, current + Math.max(0, Math.trunc(amount)));
  return {
    stats: setStat(stats, stat, next),
    healed: next - current
  };
}

function boostStat(stats: SimStats, stat: StatKey, flatBoost: number, percentBoost: number): SimStats {
  const value = stats[stat];
  const boost = flatBoost + Math.floor(value.fixed * percentBoost);
  return setStat(stats, stat, Math.min(value.current + boost, value.fixed + boost));
}

function drainStat(stats: SimStats, stat: StatKey, percent: number): SimStats {
  const value = stats[stat];
  return setStat(stats, stat, Math.max(0, value.current - Math.floor(value.fixed * percent)));
}

function restoreStats(stats: SimStats, superEffect: boolean): SimStats {
  let next = stats;
  for (const stat of Object.keys(stats) as StatKey[]) {
    if (stat === "hitpoints") {
      continue;
    }
    const value = next[stat];
    if (value.current >= value.fixed) {
      continue;
    }
    if (superEffect) {
      next = setStat(next, stat, Math.min(value.fixed, value.current + 8 + Math.floor(value.fixed * 0.25)));
    } else if (stat !== "prayer") {
      next = setStat(next, stat, Math.min(value.fixed, value.current + 10 + Math.floor(value.fixed * 0.3)));
    }
  }
  return next;
}

function setStat(stats: SimStats, stat: StatKey, current: number): SimStats {
  return {
    ...stats,
    [stat]: {
      ...stats[stat],
      current
    }
  };
}
