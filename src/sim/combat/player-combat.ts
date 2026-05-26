import type { EntityLockState } from "../entity/locks";
import { canAttackThroughLock } from "../entity/locks";
import { canMeleeReachThisTick, chebyshevDistance, type TilePosition } from "../world/movement";
import type { AttackTimerState } from "./timers";
import { canAttack, updateLastAttack } from "./timers";
import type { CombatStyle } from "./formulas";

export interface WeaponTimingProfile {
  readonly id: string;
  readonly style: CombatStyle;
  readonly cooldownTicks: number;
  readonly attackRange: number;
  readonly hasVisibleSpecBar: boolean;
  readonly graniteMaul?: boolean;
}

export interface PlayerAttackGateInput {
  readonly currentTick: number;
  readonly attackerTile: TilePosition;
  readonly defenderTile: TilePosition;
  readonly attackerFrozen: boolean;
  readonly locks: EntityLockState;
  readonly attackTimer: AttackTimerState;
  readonly weapon: WeaponTimingProfile;
  readonly projectileLineOfSight?: boolean;
}

export interface PlayerAttackGateResult {
  readonly canAttack: boolean;
  readonly reason: "ready" | "lock" | "timer" | "out-of-range";
  readonly requiresMovement: boolean;
}

export interface DispatchAttackResult extends PlayerAttackGateResult {
  readonly attackTimer: AttackTimerState;
}

// Source: WeaponType.attackTicks/maxDistance for the NH weapons; runtime combat applies the ranged rapid-tick reduction.
export const nhWeaponProfiles: Readonly<
  Record<
    | "kodai"
    | "ancient_staff"
    | "staff_of_the_dead"
    | "armadyl_crossbow"
    | "rune_crossbow"
    | "magic_shortbow"
    | "dragon_crossbow"
    | "tentacle_whip"
    | "abyssal_whip"
    | "armadyl_godsword"
    | "granite_maul",
    WeaponTimingProfile
  >
> = {
  kodai: {
    id: "kodai",
    style: "crush",
    cooldownTicks: 4,
    attackRange: 1,
    hasVisibleSpecBar: false
  },
  ancient_staff: {
    id: "ancient_staff",
    style: "crush",
    cooldownTicks: 5,
    attackRange: 1,
    hasVisibleSpecBar: false
  },
  staff_of_the_dead: {
    id: "staff_of_the_dead",
    style: "slash",
    cooldownTicks: 4,
    attackRange: 1,
    hasVisibleSpecBar: true
  },
  armadyl_crossbow: {
    id: "armadyl_crossbow",
    style: "ranged",
    cooldownTicks: 6,
    attackRange: 8,
    hasVisibleSpecBar: true
  },
  rune_crossbow: {
    id: "rune_crossbow",
    style: "ranged",
    cooldownTicks: 6,
    attackRange: 7,
    hasVisibleSpecBar: false
  },
  magic_shortbow: {
    id: "magic_shortbow",
    style: "ranged",
    cooldownTicks: 4,
    attackRange: 7,
    hasVisibleSpecBar: true
  },
  dragon_crossbow: {
    id: "dragon_crossbow",
    style: "ranged",
    cooldownTicks: 6,
    attackRange: 8,
    hasVisibleSpecBar: true
  },
  tentacle_whip: {
    id: "tentacle_whip",
    style: "slash",
    cooldownTicks: 4,
    attackRange: 1,
    hasVisibleSpecBar: true
  },
  abyssal_whip: {
    id: "abyssal_whip",
    style: "slash",
    cooldownTicks: 4,
    attackRange: 1,
    hasVisibleSpecBar: true
  },
  armadyl_godsword: {
    id: "armadyl_godsword",
    style: "slash",
    cooldownTicks: 6,
    attackRange: 1,
    hasVisibleSpecBar: true
  },
  granite_maul: {
    id: "granite_maul",
    style: "crush",
    cooldownTicks: 7,
    attackRange: 1,
    hasVisibleSpecBar: true,
    graniteMaul: true
  }
};

export function playerAttackGate(input: PlayerAttackGateInput): PlayerAttackGateResult {
  if (!canAttackThroughLock(input.locks, input.currentTick)) {
    return { canAttack: false, reason: "lock", requiresMovement: false };
  }

  const attackReady = canAttack(input.attackTimer, input.currentTick);

  if (isMeleeStyle(input.weapon.style)) {
    const reach = canMeleeReachThisTick({
      attacker: input.attackerTile,
      defender: input.defenderTile,
      attackerFrozen: input.attackerFrozen
    });

    if (!reach.canReach) {
      return {
        canAttack: false,
        reason: "out-of-range",
        requiresMovement: reach.relation !== "different-plane"
      };
    }

    if (!attackReady) {
      return {
        canAttack: false,
        reason: "timer",
        requiresMovement: reach.requiresMovement
      };
    }

    return {
      canAttack: true,
      reason: "ready",
      requiresMovement: reach.requiresMovement
    };
  }

  const distance = chebyshevDistance(input.attackerTile, input.defenderTile);
  const inRange = distance >= 1 && distance <= input.weapon.attackRange && input.projectileLineOfSight !== false;
  if (!inRange) {
    return {
      canAttack: false,
      reason: "out-of-range",
      requiresMovement: true
    };
  }

  if (!attackReady) {
    return {
      canAttack: false,
      reason: "timer",
      requiresMovement: false
    };
  }

  return {
    canAttack: true,
    reason: "ready",
    requiresMovement: false
  };
}

export function dispatchPlayerAttack(input: PlayerAttackGateInput): DispatchAttackResult {
  const gate = playerAttackGate(input);
  if (!gate.canAttack) {
    return {
      ...gate,
      attackTimer: input.attackTimer
    };
  }

  return {
    ...gate,
    attackTimer: updateLastAttack(input.attackTimer, input.currentTick, input.weapon.cooldownTicks)
  };
}

function isMeleeStyle(style: CombatStyle): boolean {
  return style === "stab" || style === "slash" || style === "crush";
}
