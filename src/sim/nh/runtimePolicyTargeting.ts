export interface RuntimePolicyTargetTrackingState {
  readonly fightEngaged: boolean;
  readonly engagementLockUntilTick: number;
  readonly noTargetGraceUntilTick: number;
}

export interface RuntimePolicyTargetTrackingInput {
  readonly state: RuntimePolicyTargetTrackingState;
  readonly tick: number;
  readonly localDead: boolean;
  readonly opponentDead: boolean;
  readonly distance: number;
  readonly selfCurrentTargetSignal: boolean;
  readonly currentTargetSignal: boolean;
  readonly directCombatSignal: boolean;
  readonly pressureTargetSignal: boolean;
  readonly recentCombatSignal: boolean;
  readonly engagedSignal?: boolean;
  readonly underPressureSignal?: boolean;
  readonly canAttackSignal: boolean;
  readonly practiceTargetVisible: boolean;
}

export interface RuntimePolicyTargetTrackingResult {
  readonly state: RuntimePolicyTargetTrackingState;
  readonly shouldRunPolicy: boolean;
  readonly resetReposition: boolean;
}

export interface RuntimePolicyResetReturnToSpawnInput {
  readonly resetReposition: boolean;
  readonly actorDead: boolean;
  readonly targetDead: boolean;
  readonly movementBlocked: boolean;
  readonly movementPending: boolean;
  readonly distanceFromSpawn: number;
}

export interface RuntimePolicyFreshFightResetInput {
  readonly resetReposition: boolean;
  readonly actorDead: boolean;
  readonly targetDead: boolean;
}

export const runtimePolicyTargetTrackDistance = 16;
export const runtimePolicyNoTargetGraceTicks = 8;
export const runtimePolicyEngagementStickyTicks = 12;

export const emptyRuntimePolicyTargetTrackingState: RuntimePolicyTargetTrackingState = {
  fightEngaged: false,
  engagementLockUntilTick: 0,
  noTargetGraceUntilTick: 0
};

export function resolveRuntimePolicyTargetTracking(
  input: RuntimePolicyTargetTrackingInput
): RuntimePolicyTargetTrackingResult {
  if (input.localDead || input.opponentDead) {
    return {
      state: emptyRuntimePolicyTargetTrackingState,
      shouldRunPolicy: false,
      resetReposition: true
    };
  }

  const trackable = input.distance >= 0 && input.distance <= runtimePolicyTargetTrackDistance;
  if (input.selfCurrentTargetSignal && !trackable) {
    // Source: NhStakerBot.run() resets immediately with "disengaged" when
    // player.getCombat().getTarget() exists but canTrack(currentTarget) fails.
    return {
      state: emptyRuntimePolicyTargetTrackingState,
      shouldRunPolicy: false,
      resetReposition: true
    };
  }

  const targetSignal =
    input.currentTargetSignal ||
    input.directCombatSignal ||
    (input.canAttackSignal && input.pressureTargetSignal) ||
    input.practiceTargetVisible;
  if (trackable && targetSignal) {
    // Source: NhStakerBot.resolveOpponent() can acquire from current target,
    // lastAttacker, or a nearby player aggressing the bot. trackFailureReason()
    // treats the two-tick direct combat window as directly engaged before
    // checking PlayerCombat.canAttack(); non-direct world scans still require
    // canAttack. The browser trainer has exactly one explicit practice target
    // after the user starts the fight, so visibility is the dedicated-target
    // equivalent and PlayerCombat/TargetRoute handle range, LOS, and movement.
    return {
      state: {
        fightEngaged: true,
        engagementLockUntilTick: input.tick + runtimePolicyEngagementStickyTicks,
        noTargetGraceUntilTick: 0
      },
      shouldRunPolicy: true,
      resetReposition: false
    };
  }

  if (
    trackable &&
    input.state.fightEngaged &&
    (input.engagedSignal === true ||
      input.underPressureSignal === true ||
      input.practiceTargetVisible ||
      (input.canAttackSignal && input.recentCombatSignal && input.tick <= input.state.engagementLockUntilTick))
  ) {
    // Source: NhStakerBot.resolveOpponent() keeps lockedTarget when
    // isEngagedWith(lockedTarget) or isAggressingBot(lockedTarget) is true,
    // and only falls back to the canAttack/recent-combat sticky window when
    // neither direct signal is present. The TS trainer has one visible practice
    // target instead of a World.players scan; after engagement that visible target
    // is the lockedTarget equivalent, and applyRuntimeOpponentPolicyAction()
    // reissues attackTarget() every policy tick.
    return {
      state: {
        ...input.state,
        engagementLockUntilTick:
          input.engagedSignal === true || input.underPressureSignal === true || input.practiceTargetVisible
            ? input.tick + runtimePolicyEngagementStickyTicks
            : input.state.engagementLockUntilTick,
        noTargetGraceUntilTick: 0
      },
      shouldRunPolicy: true,
      resetReposition: false
    };
  }

  if (!input.state.fightEngaged) {
    return {
      state: emptyRuntimePolicyTargetTrackingState,
      shouldRunPolicy: false,
      resetReposition: false
    };
  }

  const noTargetGraceUntilTick =
    input.state.noTargetGraceUntilTick > 0
      ? input.state.noTargetGraceUntilTick
      : input.tick + runtimePolicyNoTargetGraceTicks;
  if (input.tick < noTargetGraceUntilTick) {
    // Source: NhStakerBot.run() returns during NO_TARGET_GRACE_TICKS before
    // resetCombatState("no_target"|"cant_attack") clears the live episode.
    return {
      state: {
        ...input.state,
        noTargetGraceUntilTick
      },
      shouldRunPolicy: false,
      resetReposition: false
    };
  }

  return {
    state: emptyRuntimePolicyTargetTrackingState,
    shouldRunPolicy: false,
    resetReposition: true
  };
}

export function shouldRuntimePolicyRouteResetToSpawn(
  input: RuntimePolicyResetReturnToSpawnInput
): boolean {
  // Source: NhStakerBot.resetCombatState() calls routeAbsolute(spawnPosition)
  // only after non-fresh no-target/disengage resets when canIssueMovement() is
  // true, the bot is more than 3 tiles from spawn, and Movement.isAtDestination().
  return (
    input.resetReposition &&
    !input.actorDead &&
    !input.targetDead &&
    !input.movementBlocked &&
    !input.movementPending &&
    input.distanceFromSpawn > 3
  );
}

export function shouldRuntimePolicyResetForFreshFight(input: RuntimePolicyFreshFightResetInput): boolean {
  // Source: NhStakerBot.shouldResetForFreshFight() returns true for a dead/dying
  // tracked target, but not when the bot itself is dead or for non-death resets.
  return input.resetReposition && input.targetDead && !input.actorDead;
}
