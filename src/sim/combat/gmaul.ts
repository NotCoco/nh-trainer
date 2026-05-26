import type { CombatStyle } from "./formulas";

export type GmaulSpecFailureReason =
  | "not-equipped"
  | "spec-bar-hidden"
  | "not-enough-energy"
  | "queue-empty"
  | "not-melee-reachable";

export interface GmaulSpecState {
  readonly equippedGraniteMaul: boolean;
  readonly previousWeaponHadVisibleSpecBar: boolean;
  readonly gmaulEquippedTick?: number;
  readonly specBarVisibleTick?: number;
  readonly queuedSpecs: number;
  readonly timeoutTicks: number;
  readonly specialEnergy: number;
  readonly queuedTargetId?: string;
}

export interface GmaulTickResult {
  readonly state: GmaulSpecState;
  readonly autoAttackRequested: boolean;
  readonly expired: boolean;
}

export interface GmaulSpecEvent {
  readonly kind: "gmaul-spec";
  readonly outcome: "queued" | "used" | "failed" | "expired";
  readonly count: number;
  readonly tick: number;
  readonly audible: boolean;
  readonly reason?: GmaulSpecFailureReason;
}

export interface GmaulQueueOptions {
  readonly requireEnergy?: boolean;
  readonly requireSpecBarVisible?: boolean;
}

export const graniteMaulSpecEnergyCost = 50;
export const graniteMaulQueueTimeoutTicks = 5;

export function createGmaulSpecState(specialEnergy = 100): GmaulSpecState {
  return {
    equippedGraniteMaul: false,
    previousWeaponHadVisibleSpecBar: false,
    queuedSpecs: 0,
    timeoutTicks: 0,
    specialEnergy: clampEnergy(specialEnergy)
  };
}

export function updateGmaulEquipment(
  state: GmaulSpecState,
  currentTick: number,
  input: {
    readonly equippedGraniteMaul: boolean;
    readonly previousWeaponHadVisibleSpecBar: boolean;
  }
): GmaulSpecState {
  if (!input.equippedGraniteMaul) {
    return {
      ...state,
      equippedGraniteMaul: false,
      previousWeaponHadVisibleSpecBar: input.previousWeaponHadVisibleSpecBar,
      gmaulEquippedTick: undefined,
      specBarVisibleTick: undefined,
      queuedSpecs: 0,
      timeoutTicks: 0,
      queuedTargetId: undefined
    };
  }

  if (state.equippedGraniteMaul) {
    return {
      ...state,
      previousWeaponHadVisibleSpecBar: input.previousWeaponHadVisibleSpecBar
    };
  }

  return {
    ...state,
    equippedGraniteMaul: true,
    previousWeaponHadVisibleSpecBar: input.previousWeaponHadVisibleSpecBar,
    gmaulEquippedTick: currentTick,
    specBarVisibleTick: input.previousWeaponHadVisibleSpecBar ? currentTick : currentTick + 1
  };
}

export function isGmaulSpecBarVisible(state: GmaulSpecState, currentTick: number): boolean {
  return state.equippedGraniteMaul && state.specBarVisibleTick !== undefined && state.specBarVisibleTick <= currentTick;
}

export function canQueueGmaulSpec(
  state: GmaulSpecState,
  currentTick: number,
  options: GmaulQueueOptions = {}
): { readonly ok: true } | { readonly ok: false; readonly reason: GmaulSpecFailureReason } {
  const requireEnergy = options.requireEnergy ?? true;
  const requireSpecBarVisible = options.requireSpecBarVisible ?? true;
  if (!state.equippedGraniteMaul) {
    return { ok: false, reason: "not-equipped" };
  }
  if (requireSpecBarVisible && !isGmaulSpecBarVisible(state, currentTick)) {
    return { ok: false, reason: "spec-bar-hidden" };
  }
  if (requireEnergy && state.specialEnergy < graniteMaulSpecEnergyCost) {
    return { ok: false, reason: "not-enough-energy" };
  }
  return { ok: true };
}

export function queueGmaulSpec(
  state: GmaulSpecState,
  currentTick: number,
  count = 1,
  options: GmaulQueueOptions = {}
): { readonly state: GmaulSpecState; readonly event: GmaulSpecEvent } {
  const allowed = canQueueGmaulSpec(state, currentTick, options);
  if (!allowed.ok) {
    return {
      state,
      event: {
        kind: "gmaul-spec",
        outcome: "failed",
        count: 0,
        tick: currentTick,
        audible: false,
        reason: allowed.reason
      }
    };
  }

  const queuedCount = Math.max(1, Math.trunc(count));
  return {
    state: {
      ...state,
      queuedSpecs: state.queuedSpecs + queuedCount,
      timeoutTicks: graniteMaulQueueTimeoutTicks
    },
    event: {
      kind: "gmaul-spec",
      outcome: "queued",
      count: queuedCount,
      tick: currentTick,
      audible: false
    }
  };
}

export function tickGmaulQueue(state: GmaulSpecState): GmaulTickResult {
  if (state.timeoutTicks <= 0) {
    return {
      state,
      autoAttackRequested: false,
      expired: false
    };
  }

  const timeoutTicks = state.timeoutTicks - 1;
  if (timeoutTicks === 0) {
    return {
      state: {
        ...state,
        timeoutTicks: 0,
        queuedSpecs: 0,
        queuedTargetId: undefined
      },
      autoAttackRequested: false,
      expired: state.queuedSpecs > 0
    };
  }

  return {
    state: {
      ...state,
      timeoutTicks
    },
    autoAttackRequested: timeoutTicks === graniteMaulQueueTimeoutTicks - 1,
    expired: false
  };
}

export function clearQueuedGmaulSpecs(state: GmaulSpecState): GmaulSpecState {
  if (state.queuedSpecs <= 0) {
    return state;
  }
  // Source: PlayerCombat.specialGraniteMaul() clears graniteMaulSpecials before weapon and energy checks.
  return {
    ...state,
    queuedSpecs: 0,
    queuedTargetId: undefined
  };
}

export function consumeQueuedGmaulSpecs(
  state: GmaulSpecState,
  currentTick: number,
  input: {
    readonly meleeReachable: boolean;
    readonly attackStyle?: CombatStyle;
  }
): { readonly state: GmaulSpecState; readonly event: GmaulSpecEvent } {
  if (state.queuedSpecs <= 0) {
    return {
      state,
      event: {
        kind: "gmaul-spec",
        outcome: "failed",
        count: 0,
        tick: currentTick,
        audible: false,
        reason: "queue-empty"
      }
    };
  }

  if (!input.meleeReachable || (input.attackStyle !== undefined && input.attackStyle === "magic")) {
    return {
      state: {
        ...state,
        queuedSpecs: 0,
        queuedTargetId: undefined
      },
      event: {
        kind: "gmaul-spec",
        outcome: "failed",
        count: 0,
        tick: currentTick,
        audible: false,
        reason: "not-melee-reachable"
      }
    };
  }

  const usableSpecs = Math.min(state.queuedSpecs, Math.floor(state.specialEnergy / graniteMaulSpecEnergyCost));
  if (usableSpecs <= 0) {
    return {
      state: {
        ...state,
        queuedSpecs: 0,
        queuedTargetId: undefined
      },
      event: {
        kind: "gmaul-spec",
        outcome: "failed",
        count: 0,
        tick: currentTick,
        audible: false,
        reason: "not-enough-energy"
      }
    };
  }

  return {
    state: {
      ...state,
      queuedSpecs: 0,
      timeoutTicks: 0,
      queuedTargetId: undefined,
      specialEnergy: clampEnergy(state.specialEnergy - usableSpecs * graniteMaulSpecEnergyCost)
    },
    event: {
      kind: "gmaul-spec",
      outcome: "used",
      count: usableSpecs,
      tick: currentTick,
      audible: true
    }
  };
}

function clampEnergy(value: number): number {
  return Math.max(0, Math.min(100, Math.trunc(value)));
}
