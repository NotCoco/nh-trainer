import equipmentRowsJson from "../generated/equipment-bonuses.json";
import type { RuntimeActorId, RuntimeLoadoutId, RuntimeSequenceName, RuntimeTile } from "../render/runtimeScene";
import { nhPlayerHealthBarDefinition } from "../render/nhHealthBars";
import { NH_HITSPLAT_DEFAULT_DURATION_CYCLES } from "../render/nhHitsplats";
import type { CombatLevels, CombatStyle, StyleEvEstimate } from "./combat/formulas";
import { dispatchPlayerAttack, nhWeaponProfiles, playerAttackGate, type WeaponTimingProfile } from "./combat/player-combat";
import {
  clearQueuedGmaulSpecs,
  consumeQueuedGmaulSpecs,
  createGmaulSpecState,
  graniteMaulSpecEnergyCost,
  queueGmaulSpec,
  tickGmaulQueue,
  updateGmaulEquipment,
  type GmaulSpecState
} from "./combat/gmaul";
import type { AttackTimerState } from "./combat/timers";
import { consumeExpiredAttackDelay, createAttackTimerState } from "./combat/timers";
import type { EntityLockState } from "./entity/locks";
import { applyFreeze, canAttackThroughLock, createEntityLockState, isFrozen, resetFreeze, tickLocks } from "./entity/locks";
import type { VisibleEquipment } from "./clientView";
import type { EquipmentBonusRow } from "./equipment/equipment";
import { estimateVisibleStyleEvs } from "./equipment/equipment";
import { nhGearProfileCandidateEquipmentByStyle, nhGearProfileWeaponIdForEquipment, type NhSelectedGearProfile } from "./nh/gearProfile";
import type { NhOffenceStyle } from "./nh/policy-bridge";
import {
  applyConsumable,
  createSupplyDelayState,
  type ConsumableId,
  type SimStats,
  type SupplyDelayState
} from "./items/consumables";
import {
  nhMagicSpellCurrentLevelCanCast,
  nhMagicSpellLevelRequirementById
} from "./magic/spellRequirements";
import type { PrayerId, ProtectionPrayerId } from "./prayer/prayers";
import {
  activeProtectionPrayer,
  applyProtectionDamageReduction,
  compatiblePrayerSet,
  protectPrayerForStyle,
  pvpProtectionDamageMultiplier
} from "./prayer/prayers";
import type { TilePosition } from "./world/movement";
import { canMeleeReachThisTick, chebyshevDistance } from "./world/movement";
import { nhLoadouts, type NhWeaponId } from "./nh/loadouts";

export type RuntimePlayerCombatAttackReason = "ready" | "lock" | "timer" | "out-of-range" | "dead";
export type RuntimePlayerCombatSupplies = Readonly<Record<ConsumableId, number>>;

export interface RuntimePlayerCombatActorState {
  readonly id: RuntimeActorId;
  readonly tile: RuntimeTile;
  readonly loadoutId: RuntimeLoadoutId;
  readonly equipment: VisibleEquipment;
  readonly gearProfile?: NhSelectedGearProfile;
  readonly policyNextLoadoutSyncTick: number;
  readonly policyLoadoutSourceSignature: string | null;
  readonly policyNextFreezeAttemptTick: number;
  readonly policyPostBrewRecoveryUntilTick: number;
  readonly policyOffenceStyle?: NhOffenceStyle;
  readonly policyStalledStyle: NhOffenceStyle | null;
  readonly policyStalledStyleTicks: number;
  readonly attackSetIndex: number;
  readonly queuedSpellId: RuntimePlayerCombatSpellId | null;
  readonly autocastSpellId: RuntimePlayerCombatSpellId | null;
  readonly defensiveCast: boolean;
  readonly hitpoints: number;
  readonly maxHitpoints: number;
  readonly prayerPoints: number;
  readonly maxPrayerPoints: number;
  readonly levels: CombatLevels;
  readonly fixedLevels: CombatLevels;
  readonly supplies: RuntimePlayerCombatSupplies;
  readonly supplyDelays: SupplyDelayState;
  readonly activePrayers: readonly PrayerId[];
  readonly locks: EntityLockState;
  readonly attackTimer: AttackTimerState;
  readonly targetId: RuntimeActorId | null;
  readonly lastTargetId: RuntimeActorId | null;
  readonly lastTargetTimeoutTicks: number;
  readonly specialActive: boolean;
  readonly gmaul: GmaulSpecState;
  readonly specialRestoreTicks: number;
  readonly actionSequenceName: RuntimeSequenceName | null;
  readonly actionStartedAtTick: number | null;
  readonly actionStartedAtClientCycle: number | null;
  readonly actionDurationTicks: number;
  readonly actionUntilTick: number;
  readonly actionFacingDegrees: number | null;
  readonly deadUntilTick: number | null;
  readonly hitsplatSlotCursor: number;
  readonly lastHitsplatTick: number;
}

export interface RuntimePlayerQueuedHit {
  readonly id: string;
  readonly dueTick: number;
  readonly attackerId: RuntimeActorId;
  readonly defenderId: RuntimeActorId;
  readonly style: CombatStyle;
  readonly attackType: RuntimePlayerCombatAttackType;
  readonly attackSetIndex: number;
  readonly weaponId?: NhWeaponId;
  readonly spellId?: RuntimePlayerCombatSpellId;
  readonly autocast?: boolean;
  readonly defensiveCast?: boolean;
  readonly damage: number;
  readonly rawDamage: number;
  readonly maxDamage: number;
  readonly hitChance: number;
  readonly defenderProtectionPrayer?: ProtectionPrayerId;
  readonly freezeDurationTicks?: number;
  readonly bloodHealFraction?: number;
}

export interface RuntimePlayerCombatProjectileProfile {
  readonly id:
    | "ice_barrage_projectile"
    | "blood_barrage_delay"
    | "ice_blitz_delay"
    | "blood_blitz_projectile"
    | "standard_bolt"
    | "dragon_bolt"
    | "armadyl_crossbow_special";
  readonly artifactUrl: string;
  readonly gfxId: number;
  readonly startHeight: number;
  readonly endHeight: number;
  readonly delayCycles: number;
  readonly durationStartCycles: number;
  readonly durationIncrementCycles: number;
  readonly clientCycleRate: number;
  readonly curve: number;
  readonly offset: number;
  readonly skipTravel: boolean;
}

export type RuntimePlayerCombatSpecialAttackId = "armadyl_crossbow" | "armadyl_godsword" | "granite_maul";

export type RuntimePlayerCombatSpellId = "blood-blitz" | "ice-blitz" | "blood-barrage" | "ice-barrage";
export type RuntimePlayerCombatAttackType =
  | "ACCURATE"
  | "AGGRESSIVE"
  | "DEFENSIVE"
  | "CONTROLLED"
  | "RAPID_RANGED"
  | "LONG_RANGED";
export type RuntimePlayerCombatXpSkillId = "attack" | "strength" | "defence" | "ranged" | "magic" | "hitpoints";

export interface RuntimePlayerCombatXpDrop {
  readonly skillId: RuntimePlayerCombatXpSkillId;
  readonly xp: number;
}

export interface RuntimePlayerCombatSpellDefinition {
  readonly id: RuntimePlayerCombatSpellId;
  readonly label: string;
  readonly autocastSlot: number;
  readonly style: "magic";
  readonly requiredMagicLevel: number;
  readonly baseXp: number;
  readonly maxDamage: number;
  readonly cooldownTicks: number;
  readonly attackRange: number;
  readonly sequenceName: RuntimeSequenceName;
  readonly projectileProfile: RuntimePlayerCombatProjectileProfile;
  readonly hitSpotanimId: number;
  readonly hitSpotanimArtifactUrl: string;
  readonly castSpotanimId?: number;
  readonly castSpotanimArtifactUrl?: string;
  readonly freezeDurationTicks?: number;
  readonly bloodHealFraction?: number;
}

export type RuntimePlayerCombatEvent =
  | {
      readonly kind: "attack";
      readonly id: string;
      readonly tick: number;
      readonly attackerId: RuntimeActorId;
      readonly defenderId: RuntimeActorId;
      readonly attackerTile: RuntimeTile;
      readonly defenderTile: RuntimeTile;
      readonly style: CombatStyle;
      readonly spellId?: RuntimePlayerCombatSpellId;
      readonly autocast?: boolean;
      readonly sequenceName: RuntimeSequenceName;
      readonly hitDelayTicks: number;
      readonly maxDamage: number;
      readonly hitChance: number;
      readonly expectedDamage: number;
      readonly specialAttack?: RuntimePlayerCombatSpecialAttackId;
      readonly specialAttackCount?: number;
      readonly projectileDurationCycles?: number;
      readonly projectile?: RuntimePlayerCombatProjectileProfile;
      readonly defenderProtectionPrayer?: ProtectionPrayerId;
      readonly attackerActivePrayers: readonly PrayerId[];
      readonly attackerEquipment: VisibleEquipment;
      readonly defenderEquipment: VisibleEquipment;
    }
  | {
      readonly kind: "spotanim";
      readonly id: string;
      readonly tick: number;
      readonly actorId: RuntimeActorId;
      readonly spotanimId: number;
      readonly artifactUrl: string;
    }
  | {
      readonly kind: "hitsplat";
      readonly id: string;
      readonly tick: number;
      readonly attackerId: RuntimeActorId;
      readonly targetActorId: RuntimeActorId;
      readonly style: CombatStyle;
      readonly spellId?: RuntimePlayerCombatSpellId;
      readonly autocast?: boolean;
      readonly damage: number;
      readonly rawDamage: number;
      readonly maxDamage: number;
      readonly hitChance: number;
      readonly defenderProtectionPrayer?: ProtectionPrayerId;
      readonly previousHitpoints: number;
      readonly nextHitpoints: number;
      readonly maxHitpoints: number;
      readonly slotIndex: number;
    }
  | {
      readonly kind: "supply";
      readonly id: string;
      readonly tick: number;
      readonly actorId: RuntimeActorId;
      readonly item: ConsumableId;
      readonly healed: number;
      readonly previousHitpoints: number;
      readonly nextHitpoints: number;
      readonly maxHitpoints: number;
    }
  | {
      readonly kind: "death";
      readonly id: string;
      readonly tick: number;
      readonly actorId: RuntimeActorId;
      readonly respawnTick: number;
    }
  | {
      readonly kind: "policy-reward";
      readonly id: string;
      readonly tick: number;
      readonly actorId: RuntimeActorId;
      readonly reason:
        | "gmaul_spec"
        | "gmaul_missed_spec"
        | "gmaul_spec_outcome"
        | "style_pressure"
        | "gear_weakness"
        | "melee_threat"
        | "melee_telegraph"
        | "freeze_under_no_pressure"
        | "under_control"
        | "freeze_position"
        | "spec_approach"
        | "melee_range"
        | "range_spacing"
        | "frozen_cast"
        | "stat_state"
        | "death_supply"
        | "supply_reward"
        | "defence_belief"
        | "actual_prayer";
      readonly reward: number;
      readonly sourcePolicyRewardId?: string;
      readonly gmaulDoubleSpec?: boolean;
      readonly opponentStartHitpoints?: number;
      readonly recentHit?: number;
      readonly koChance?: number;
      readonly setupScore?: number;
      readonly credibleWindow?: number;
      readonly meleeProtected?: boolean;
      readonly offenceStyle?: "magic" | "ranged" | "melee";
      readonly protectedStyle?: "magic" | "ranged" | "melee";
      readonly protectedStyleStreak?: number;
      readonly styleProtected?: boolean;
      readonly meleeThreatPotential?: number;
      readonly distance?: number;
      readonly previousDistance?: number;
      readonly freezeUnderNoPressureTicks?: number;
      readonly underControlIdleTicks?: number;
      readonly controlValue?: number;
      readonly productiveControl?: boolean;
      readonly entry?: boolean;
      readonly supplyIntent?: string;
      readonly foodUses?: number;
      readonly brewUses?: number;
      readonly restoreUses?: number;
      readonly reboostUses?: number;
      readonly appliedFoodHealing?: number;
      readonly appliedBrewHealing?: number;
      readonly wastedFoodHealing?: number;
      readonly wastedBrewHealing?: number;
      readonly supplyUrgency?: number;
      readonly riskBefore?: number;
      readonly riskAfter?: number;
      readonly riskReduction?: number;
      readonly offenceOpportunity?: number;
      readonly opportunityCost?: number;
      readonly repeatPenalty?: number;
      readonly priorSupplyActions?: number;
      readonly priorLowValueSupplies?: number;
      readonly recentSupplyActions?: number;
      readonly recentLowValueSupplies?: number;
      readonly lowValueSupply?: boolean;
      readonly restoreNeeded?: boolean;
      readonly reboostNeeded?: boolean;
      readonly restoreRecovered?: boolean;
      readonly reboosted?: boolean;
      readonly offenceEvBefore?: number;
      readonly offenceEvAfter?: number;
      readonly bestOffenceEvAfter?: number;
      readonly strippedPieces?: number;
      readonly strippedGain?: number;
      readonly strippedOffenceGain?: number;
      readonly strippedDefenceLoss?: number;
      readonly defencePrayer?: ProtectionPrayerId;
      readonly magicBelief?: number;
      readonly rangedBelief?: number;
      readonly meleeBelief?: number;
      readonly beliefConfidence?: number;
      readonly beliefReadable?: boolean;
      readonly noPrayerDamage?: number;
      readonly chosenPrayerDamage?: number;
      readonly bestPrayerDamage?: number;
      readonly averagePrayerDamage?: number;
      readonly expectedRisk?: number;
      readonly pressure?: number;
      readonly onPrayerHits?: number;
      readonly offPrayerHits?: number;
      readonly onPrayerDamage?: number;
      readonly offPrayerDamage?: number;
      readonly boostedCombatLevels?: number;
      readonly brewedDownCombatLevels?: number;
      readonly pottedStateBonus?: number;
      readonly brewedDownPenalty?: number;
      readonly combatDeficitScore?: number;
      readonly combatDeficitPenalty?: number;
      readonly unusedHealingSupplies?: number;
      readonly healingSupplyEvents?: number;
      readonly goodSupplyEvents?: number;
      readonly totalDamageTaken?: number;
      readonly avoidableSupplyPenalty?: number;
    };

export interface RuntimePlayerCombatRouteRequest {
  readonly actorId: RuntimeActorId;
  readonly targetId: RuntimeActorId;
  readonly targetTile: RuntimeTile;
  readonly attackRange: number;
  readonly reason: RuntimePlayerCombatAttackReason;
}

export interface RuntimePlayerCombatTargetRouteProfile {
  readonly attackRange: number;
  readonly melee: boolean;
  readonly style: CombatStyle;
  readonly source: "queued-spell" | "autocast-spell" | "bot-autocast-spell" | "weapon";
}

export interface RuntimePlayerCombatState {
  readonly tick: number;
  readonly combatStartTick: number;
  readonly randomSeed: number;
  readonly processOrder?: RuntimePlayerCombatProcessOrder;
  readonly nextProcessOrderShuffleTick?: number;
  readonly processOrderSeed?: number;
  readonly actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>;
  readonly queuedHits: readonly RuntimePlayerQueuedHit[];
  readonly events: readonly RuntimePlayerCombatEvent[];
}

export interface RuntimePlayerCombatAdvanceInput {
  readonly preMovementTiles?: Partial<Record<RuntimeActorId, RuntimeTile>>;
  readonly tiles: Partial<Record<RuntimeActorId, RuntimeTile>>;
  readonly loadouts?: Partial<Record<RuntimeActorId, RuntimeLoadoutId>>;
  readonly equipment?: Partial<Record<RuntimeActorId, VisibleEquipment>>;
  readonly gearProfiles?: Partial<Record<RuntimeActorId, NhSelectedGearProfile>>;
  readonly attackSets?: Partial<Record<RuntimeActorId, number>>;
  readonly levels?: Partial<Record<RuntimeActorId, CombatLevels>>;
  readonly fixedLevels?: Partial<Record<RuntimeActorId, CombatLevels>>;
  readonly prayerPoints?: Partial<Record<RuntimeActorId, RuntimePlayerCombatPrayerPoints>>;
  readonly prayers?: Partial<Record<RuntimeActorId, readonly PrayerId[]>>;
  readonly targetRouteMovementConsumed?: Partial<Record<RuntimeActorId, boolean>>;
  readonly projectileLineOfSight?: Partial<Record<RuntimeActorId, boolean>>;
  readonly tileScale?: number;
  readonly clientCycle?: number;
}

export interface RuntimePlayerCombatPrayerPoints {
  readonly current: number;
  readonly fixed?: number;
}

export interface RuntimePlayerCombatAdvanceResult {
  readonly state: RuntimePlayerCombatState;
  readonly routeRequests: readonly RuntimePlayerCombatRouteRequest[];
}

export interface RuntimePlayerCombatPreMovementHitResult {
  readonly state: RuntimePlayerCombatState;
  readonly applied: boolean;
}

export interface RuntimePlayerCombatSpecialToggleResult {
  readonly state: RuntimePlayerCombatState;
  readonly mutation:
    | "activate"
    | "deactivate"
    | "queue-gmaul"
    | "deactivate-queue-gmaul"
    | "noop-no-special"
    | "failed";
  readonly specialActive: boolean;
  readonly specialEnergy: number;
  readonly queuedGraniteMaulSpecs: number;
  readonly reason?: string;
}

export interface RuntimePlayerCombatSupplyResult {
  readonly state: RuntimePlayerCombatState;
  readonly consumed: boolean;
  readonly item: ConsumableId;
  readonly healed: number;
  readonly reason?: "no-supply" | "eat-delay" | "karambwan-delay" | "potion-delay" | "no-food" | "no-drinks";
}

type RuntimePlayerCombatAttackAttempt = {
  readonly actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>;
  readonly queuedHits: readonly RuntimePlayerQueuedHit[];
  readonly events: readonly RuntimePlayerCombatEvent[];
  readonly randomSeed: number;
  readonly routeRequest?: RuntimePlayerCombatRouteRequest;
};

type RuntimePlayerGmaulSpecialAttempt =
  | (RuntimePlayerCombatAttackAttempt & { readonly handled: true })
  | {
      readonly handled: false;
      readonly actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>;
    };

export type RuntimePlayerCombatProcessOrder = readonly [RuntimeActorId, RuntimeActorId];

const equipmentRows = equipmentRowsJson as readonly EquipmentBonusRow[];
export const runtimePlayerCombatDefaultLevels: CombatLevels = {
  attack: 99,
  strength: 99,
  defence: 99,
  ranged: 99,
  magic: 99
};
export const runtimePlayerCombatDefaultSupplies: RuntimePlayerCombatSupplies = {
  manta_ray: 4,
  shark: 0,
  anglerfish: 0,
  karambwan: 4,
  saradomin_brew: 2,
  super_restore: 2,
  sanfew_serum: 0,
  super_combat: 1,
  ranging_potion: 0,
  bastion: 1
};
// Source: NhStakerBot's client-side opponent special estimate can need a full 0->100 spec regen window.
const maxRetainedEventAgeTicks = 550;
// Source: CoreWorker.index() runs EntityList.scramble() and resets scrambleTicks with Random.get(40, 60).
const runtimePlayerCombatProcessOrderShuffleMinTicks = 40;
const runtimePlayerCombatProcessOrderShuffleMaxTicks = 60;
const deathResetDelayTicks = 5;
const nhServerTickMs = 600;
const nhDefaultProjectileCycleRate = 16;
const nhMagicProjectileCycleRate = 19;
const runtimePlayerCombatHitpointXpRatio = 1.33;
export const runtimePlayerCombatIceBarrageFreezeTicks = 32;
export const runtimePlayerCombatIceBlitzFreezeTicks = 25;
export const runtimePlayerCombatFreezeBreakDistance = 12;
export const runtimePlayerCombatIceBarrageHitSpotanimId = 369;
export const runtimePlayerCombatIceBlitzCastSpotanimId = 366;
export const runtimePlayerCombatIceBlitzHitSpotanimId = 367;
export const runtimePlayerCombatActionDurationTicks = 4;
export const runtimePlayerCombatClientCyclesPerGameTick = 30;
const runtimePlayerCombatSpecialRestorePeriodTicks = 50;
const runtimePlayerCombatSpecialRestorePercent = 10;
export const runtimePlayerCombatFightCountdownTicks = 5;

const projectileProfiles = {
  magic: {
    id: "ice_barrage_projectile",
    artifactUrl: "render/spotanims/ice_barrage_projectile.glb",
    gfxId: 368,
    startHeight: 43,
    endHeight: 0,
    delayCycles: 51,
    durationStartCycles: 56,
    durationIncrementCycles: 10,
    clientCycleRate: nhMagicProjectileCycleRate,
    curve: 16,
    offset: 64,
    skipTravel: true
  },
  bloodBarrageDelay: {
    id: "blood_barrage_delay",
    artifactUrl: "",
    gfxId: -1,
    startHeight: 0,
    endHeight: 0,
    delayCycles: 51,
    durationStartCycles: 56,
    durationIncrementCycles: 10,
    clientCycleRate: nhMagicProjectileCycleRate,
    curve: 0,
    offset: 0,
    skipTravel: false
  },
  iceBlitzDelay: {
    id: "ice_blitz_delay",
    artifactUrl: "",
    gfxId: -1,
    startHeight: 0,
    endHeight: 0,
    delayCycles: 0,
    durationStartCycles: 56,
    durationIncrementCycles: 10,
    clientCycleRate: nhMagicProjectileCycleRate,
    curve: 0,
    offset: 0,
    skipTravel: false
  },
  bloodBlitz: {
    id: "blood_blitz_projectile",
    artifactUrl: "render/spotanims/blood_blitz_projectile.glb",
    gfxId: 374,
    startHeight: 43,
    endHeight: 0,
    delayCycles: 51,
    durationStartCycles: 56,
    durationIncrementCycles: 10,
    clientCycleRate: nhMagicProjectileCycleRate,
    curve: 16,
    offset: 64,
    skipTravel: false
  },
  ranged: {
    id: "dragon_bolt",
    artifactUrl: "render/spotanims/dragon_bolt_projectile.glb",
    gfxId: 1468,
    startHeight: 38,
    endHeight: 36,
    delayCycles: 41,
    durationStartCycles: 51,
    durationIncrementCycles: 5,
    clientCycleRate: nhDefaultProjectileCycleRate,
    curve: 5,
    offset: 11,
    skipTravel: false
  },
  armadylCrossbowSpecial: {
    id: "armadyl_crossbow_special",
    artifactUrl: "render/spotanims/acb_special_projectile.glb",
    gfxId: 301,
    startHeight: 38,
    endHeight: 36,
    delayCycles: 41,
    durationStartCycles: 51,
    durationIncrementCycles: 5,
    clientCycleRate: nhDefaultProjectileCycleRate,
    curve: 5,
    offset: 11,
    skipTravel: false
  }
} as const satisfies Record<
  "magic" | "bloodBarrageDelay" | "iceBlitzDelay" | "bloodBlitz" | "ranged" | "armadylCrossbowSpecial",
  RuntimePlayerCombatProjectileProfile
>;

export const runtimePlayerCombatBloodBlitzAutocastSlot = 41;
export const runtimePlayerCombatIceBlitzAutocastSlot = 42;
export const runtimePlayerCombatIceBarrageAutocastSlot = 46;
export const runtimePlayerCombatBloodBarrageAutocastSlot = 45;
export const runtimePlayerCombatBloodBlitzHitSpotanimId = 375;
export const runtimePlayerCombatBloodBarrageHitSpotanimId = 377;

export const runtimePlayerCombatSpellDefinitions: Readonly<Record<RuntimePlayerCombatSpellId, RuntimePlayerCombatSpellDefinition>> = {
  "blood-blitz": {
    id: "blood-blitz",
    label: "Blood Blitz",
    autocastSlot: runtimePlayerCombatBloodBlitzAutocastSlot,
    style: "magic",
    requiredMagicLevel: nhMagicSpellLevelRequirementById["blood-blitz"],
    // Source: BloodBlitz.java setBaseXp(45.0); CombatUtils.addMagicXp(baseXp, damage, multiplier).
    baseXp: 45,
    maxDamage: 25,
    cooldownTicks: 5,
    // Source: PlayerCombat.preAttack() uses TargetRoute distance 10 whenever useSpell() is true.
    attackRange: 10,
    sequenceName: "blitz_cast",
    projectileProfile: projectileProfiles.bloodBlitz,
    hitSpotanimId: runtimePlayerCombatBloodBlitzHitSpotanimId,
    hitSpotanimArtifactUrl: "render/spotanims/blood_blitz_hit.glb",
    bloodHealFraction: 0.25
  },
  "ice-blitz": {
    id: "ice-blitz",
    label: "Ice Blitz",
    autocastSlot: runtimePlayerCombatIceBlitzAutocastSlot,
    style: "magic",
    requiredMagicLevel: nhMagicSpellLevelRequirementById["ice-blitz"],
    // Source: IceBlitz.java setBaseXp(46.0); CombatUtils.addMagicXp(baseXp, damage, multiplier).
    baseXp: 46,
    maxDamage: 26,
    cooldownTicks: 5,
    // Source: PlayerCombat.preAttack() uses TargetRoute distance 10 whenever useSpell() is true.
    attackRange: 10,
    sequenceName: "blitz_cast",
    projectileProfile: projectileProfiles.iceBlitzDelay,
    hitSpotanimId: runtimePlayerCombatIceBlitzHitSpotanimId,
    hitSpotanimArtifactUrl: "render/spotanims/ice_blitz_hit.glb",
    castSpotanimId: runtimePlayerCombatIceBlitzCastSpotanimId,
    castSpotanimArtifactUrl: "render/spotanims/ice_blitz_cast.glb",
    freezeDurationTicks: runtimePlayerCombatIceBlitzFreezeTicks
  },
  "blood-barrage": {
    id: "blood-barrage",
    label: "Blood Barrage",
    autocastSlot: runtimePlayerCombatBloodBarrageAutocastSlot,
    style: "magic",
    requiredMagicLevel: nhMagicSpellLevelRequirementById["blood-barrage"],
    // Source: BloodBarrage.java setBaseXp(51.0); CombatUtils.addMagicXp(baseXp, damage, multiplier).
    baseXp: 51,
    maxDamage: 29,
    cooldownTicks: 5,
    // Source: PlayerCombat.preAttack() uses TargetRoute distance 10 whenever useSpell() is true.
    attackRange: 10,
    sequenceName: "barrage_cast",
    projectileProfile: projectileProfiles.bloodBarrageDelay,
    hitSpotanimId: runtimePlayerCombatBloodBarrageHitSpotanimId,
    hitSpotanimArtifactUrl: "render/spotanims/blood_barrage_hit.glb",
    bloodHealFraction: 0.25
  },
  "ice-barrage": {
    id: "ice-barrage",
    label: "Ice Barrage",
    autocastSlot: runtimePlayerCombatIceBarrageAutocastSlot,
    style: "magic",
    requiredMagicLevel: nhMagicSpellLevelRequirementById["ice-barrage"],
    // Source: IceBarrage.java setBaseXp(52.0); CombatUtils.addMagicXp(baseXp, damage, multiplier).
    baseXp: 52,
    maxDamage: 30,
    cooldownTicks: 5,
    // Source: PlayerCombat.preAttack() uses TargetRoute distance 10 whenever useSpell() is true.
    attackRange: 10,
    sequenceName: "barrage_cast",
    projectileProfile: projectileProfiles.magic,
    hitSpotanimId: runtimePlayerCombatIceBarrageHitSpotanimId,
    hitSpotanimArtifactUrl: "render/spotanims/ice_barrage_hit.glb",
    freezeDurationTicks: runtimePlayerCombatIceBarrageFreezeTicks
  }
};

export function createRuntimePlayerCombatState(input: {
  readonly localTile: RuntimeTile;
  readonly opponentTile: RuntimeTile;
  readonly localLoadoutId: RuntimeLoadoutId;
  readonly opponentLoadoutId: RuntimeLoadoutId;
  readonly localAttackSetIndex?: number;
  readonly opponentAttackSetIndex?: number;
  readonly localPrayers?: readonly PrayerId[];
  readonly opponentPrayers?: readonly PrayerId[];
  readonly localLevels?: CombatLevels;
  readonly opponentLevels?: CombatLevels;
  readonly localFixedLevels?: CombatLevels;
  readonly opponentFixedLevels?: CombatLevels;
  readonly localPrayerPoints?: RuntimePlayerCombatPrayerPoints;
  readonly opponentPrayerPoints?: RuntimePlayerCombatPrayerPoints;
  readonly localSupplies?: RuntimePlayerCombatSupplies;
  readonly opponentSupplies?: RuntimePlayerCombatSupplies;
  readonly localSpecialEnergy?: number;
  readonly opponentSpecialEnergy?: number;
  readonly combatStartTick?: number;
  readonly seed?: number;
}): RuntimePlayerCombatState {
  const randomSeed = input.seed ?? 0x4e485254;
  const processOrderState = createRuntimePlayerCombatProcessOrderState(randomSeed);
  return {
    tick: 0,
    combatStartTick: runtimePlayerCombatSafeStartTick(input.combatStartTick),
    randomSeed,
    ...processOrderState,
    actors: {
      "local-player": createRuntimePlayerCombatActor(
        "local-player",
        input.localTile,
        input.localLoadoutId,
        input.localAttackSetIndex ?? 0,
        input.localLevels ?? runtimePlayerCombatDefaultLevels,
        input.localFixedLevels ?? runtimePlayerCombatDefaultLevels,
        input.localPrayerPoints ?? { current: 99, fixed: 99 },
        input.localPrayers ?? [],
        input.localSupplies ?? runtimePlayerCombatDefaultSupplies,
        input.localSpecialEnergy ?? 100
      ),
      opponent: createRuntimePlayerCombatActor(
        "opponent",
        input.opponentTile,
        input.opponentLoadoutId,
        input.opponentAttackSetIndex ?? 0,
        input.opponentLevels ?? runtimePlayerCombatDefaultLevels,
        input.opponentFixedLevels ?? runtimePlayerCombatDefaultLevels,
        input.opponentPrayerPoints ?? { current: 99, fixed: 99 },
        input.opponentPrayers ?? [],
        input.opponentSupplies ?? runtimePlayerCombatDefaultSupplies,
        input.opponentSpecialEnergy ?? 100
      )
    },
    queuedHits: [],
    events: []
  };
}

export function requestRuntimePlayerCombatAttack(
  state: RuntimePlayerCombatState,
  attackerId: RuntimeActorId,
  defenderId: RuntimeActorId
): RuntimePlayerCombatState {
  if (
    attackerId === defenderId ||
    runtimePlayerCombatIsFightCountdownActive(state) ||
    isRuntimePlayerCombatActorDead(state.actors[attackerId], state.tick)
  ) {
    return state;
  }
  return {
    ...state,
    actors: {
      ...state.actors,
      [attackerId]: {
        ...state.actors[attackerId],
        targetId: defenderId,
        lastTargetId: defenderId,
        lastTargetTimeoutTicks: 5
      }
    }
  };
}

export function requestRuntimePlayerCombatSpell(
  state: RuntimePlayerCombatState,
  attackerId: RuntimeActorId,
  defenderId: RuntimeActorId,
  spellId: RuntimePlayerCombatSpellId
): RuntimePlayerCombatState {
  if (
    attackerId === defenderId ||
    runtimePlayerCombatIsFightCountdownActive(state) ||
    isRuntimePlayerCombatActorDead(state.actors[attackerId], state.tick)
  ) {
    return state;
  }
  const spell = runtimePlayerCombatSpellDefinitions[spellId];
  if (!spell) {
    return state;
  }
  const actor = state.actors[attackerId];
  return {
    ...state,
    actors: {
      ...state.actors,
      [attackerId]: {
        ...actor,
        queuedSpellId: spell.id,
        targetId: defenderId,
        lastTargetId: defenderId,
        lastTargetTimeoutTicks: 5
      }
    }
  };
}

export function resetRuntimePlayerCombatActorTarget(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId
): RuntimePlayerCombatState {
  const actor = state.actors[actorId];
  if (actor.targetId === null && actor.queuedSpellId === null) {
    return state;
  }

  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...actor,
        targetId: null,
        queuedSpellId: null
      }
    }
  };
}

export function resetRuntimePlayerCombatActorPolicyDisengage(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId
): RuntimePlayerCombatState {
  const actor = state.actors[actorId];
  if (
    actor.targetId === null &&
    actor.lastTargetId === null &&
    actor.queuedSpellId === null &&
    actor.policyOffenceStyle === undefined &&
    actor.policyNextLoadoutSyncTick === 0 &&
    actor.policyNextFreezeAttemptTick === 0 &&
    actor.policyPostBrewRecoveryUntilTick === 0 &&
    actor.policyStalledStyle === null &&
    actor.policyStalledStyleTicks === 0 &&
    actor.activePrayers.length === 0
  ) {
    return state;
  }

  // Source: NhStakerBot.resetCombatState() clears currentOffence, style stall,
  // BOT_STYLE_KEY, deactivates prayers, and calls clearPolicyState(); PlayerCombat.reset()
  // clears target and queuedSpell when a stale target exists.
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...actor,
        targetId: null,
        lastTargetId: null,
        lastTargetTimeoutTicks: 0,
        queuedSpellId: null,
        policyNextLoadoutSyncTick: 0,
        policyNextFreezeAttemptTick: 0,
        policyPostBrewRecoveryUntilTick: 0,
        policyOffenceStyle: undefined,
        policyStalledStyle: null,
        policyStalledStyleTicks: 0,
        activePrayers: []
      }
    }
  };
}

export function resetRuntimePlayerCombatActorPolicyFreshFight(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  input: {
    readonly tile?: RuntimeTile;
    readonly gearProfile?: NhSelectedGearProfile;
  } = {}
): RuntimePlayerCombatState {
  const actor = state.actors[actorId];
  const gearProfile = input.gearProfile ?? actor.gearProfile;
  const equipment = gearProfile
    ? nhGearProfileCandidateEquipmentByStyle(nhLoadouts["kodai-robes"].equipment, gearProfile).magic
    : nhLoadouts["kodai-robes"].equipment;
  const weaponId = weaponIdForEquipment(equipment) ?? weaponIdForLoadout("kodai-robes");
  const profile = nhWeaponProfiles[weaponId];

  // Source: NhStakerBot.resetForFreshFight() calls prepareFreshState(true),
  // NhStakerLoadout.prepareBot(), applySelectedLoadout(), then teleports back
  // to spawn. This is target-death cleanup for a live bot, not bot-death cleanup.
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...actor,
        tile: input.tile ?? actor.tile,
        loadoutId: "kodai-robes",
        equipment,
        gearProfile,
        policyNextLoadoutSyncTick: 0,
        policyNextFreezeAttemptTick: 0,
        policyPostBrewRecoveryUntilTick: 0,
        policyOffenceStyle: undefined,
        policyStalledStyle: null,
        policyStalledStyleTicks: 0,
        attackSetIndex: resolveRuntimePlayerCombatAttackSetIndexForWeapon(weaponId, 0),
        queuedSpellId: null,
        autocastSpellId: null,
        defensiveCast: false,
        hitpoints: 99,
        maxHitpoints: 99,
        prayerPoints: 99,
        maxPrayerPoints: 99,
        levels: runtimePlayerCombatDefaultLevels,
        fixedLevels: runtimePlayerCombatDefaultLevels,
        supplies: runtimePlayerCombatDefaultSupplies,
        supplyDelays: createSupplyDelayState(),
        activePrayers: [],
        locks: createEntityLockState(),
        attackTimer: createAttackTimerState(-100),
        targetId: null,
        lastTargetId: null,
        lastTargetTimeoutTicks: 0,
        specialActive: false,
        gmaul: updateGmaulEquipment(createGmaulSpecState(100), state.tick, {
          equippedGraniteMaul: weaponId === "granite_maul",
          previousWeaponHadVisibleSpecBar: profile.hasVisibleSpecBar
        }),
        specialRestoreTicks: 0,
        actionSequenceName: null,
        actionStartedAtTick: null,
        actionStartedAtClientCycle: null,
        actionDurationTicks: runtimePlayerCombatActionDurationTicks,
        actionUntilTick: -1,
        actionFacingDegrees: null,
        deadUntilTick: null
      }
    }
  };
}

function resetRuntimePlayerCombatActorPolicyDeath(actor: RuntimePlayerCombatActorState): RuntimePlayerCombatActorState {
  // Source: NhStakerBot.run() calls resetForDeath() as soon as the bot is dead;
  // resetForDeath() clears current offence/targeting/prayer/policy state and
  // PlayerCombat.reset() clears the current target plus queued target spell.
  return {
    ...actor,
    targetId: null,
    lastTargetId: null,
    lastTargetTimeoutTicks: 0,
    queuedSpellId: null,
    policyNextLoadoutSyncTick: 0,
    policyNextFreezeAttemptTick: 0,
    policyPostBrewRecoveryUntilTick: 0,
    policyOffenceStyle: undefined,
    policyStalledStyle: null,
    policyStalledStyleTicks: 0,
    activePrayers: []
  };
}

export function clearRuntimePlayerCombatActorPolicyNoTargetGrace(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId
): RuntimePlayerCombatState {
  const actor = state.actors[actorId];
  if (actor.policyStalledStyle === null && actor.policyStalledStyleTicks === 0) {
    return state;
  }

  // Source: NhStakerBot.run() calls clearStyleStall() and
  // clearDelayedOpponentInfo() as soon as resolveOpponent() returns null,
  // before NO_TARGET_GRACE_TICKS expires and before resetCombatState().
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...actor,
        policyStalledStyle: null,
        policyStalledStyleTicks: 0
      }
    }
  };
}

export function setRuntimePlayerCombatAutocast(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  spellId: RuntimePlayerCombatSpellId | null,
  defensiveCast = false
): RuntimePlayerCombatState {
  const actor = state.actors[actorId];
  if (actor.autocastSpellId === spellId && actor.defensiveCast === defensiveCast && actor.queuedSpellId === null) {
    return state;
  }
  // Source: NhStakerBot.castBarrage() calls ensureAutocast(), then clears
  // PlayerCombat.queuedSpell even when ensureAutocast() was already satisfied.
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...actor,
        autocastSpellId: spellId,
        defensiveCast: spellId === null ? false : defensiveCast,
        queuedSpellId: null
      }
    }
  };
}

export function setRuntimePlayerCombatLoadout(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  loadoutId: RuntimeLoadoutId
): RuntimePlayerCombatState {
  const actor = state.actors[actorId];
  if (actor.loadoutId === loadoutId) {
    return state;
  }
  const previousProfile = weaponProfileForRuntimeActor(actor);
  const nextWeaponId = weaponIdForLoadout(loadoutId);
  const nextAttackSetIndex = resolveRuntimePlayerCombatAttackSetIndexForWeapon(nextWeaponId, actor.attackSetIndex);
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...actor,
        loadoutId,
        equipment: nhLoadouts[loadoutId].equipment,
        attackSetIndex: nextAttackSetIndex,
        queuedSpellId: null,
        autocastSpellId: null,
        defensiveCast: false,
        specialActive: false,
        gmaul: updateGmaulEquipment(actor.gmaul, state.tick, {
          equippedGraniteMaul: nextWeaponId === "granite_maul",
          previousWeaponHadVisibleSpecBar: previousProfile.hasVisibleSpecBar
        })
      }
    }
  };
}

export function setRuntimePlayerCombatAttackSet(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  attackSetIndex: number
): RuntimePlayerCombatState {
  const actor = state.actors[actorId];
  const normalizedAttackSetIndex = resolveRuntimePlayerCombatAttackSetIndexForWeapon(
    weaponIdForRuntimeActor(actor),
    attackSetIndex
  );
  if (actor.attackSetIndex === normalizedAttackSetIndex) {
    return state;
  }

  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...actor,
        attackSetIndex: normalizedAttackSetIndex,
        queuedSpellId: null,
        autocastSpellId: null,
        defensiveCast: false
      }
    }
  };
}

export function toggleRuntimePlayerCombatSpecial(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId
): RuntimePlayerCombatSpecialToggleResult {
  const actor = state.actors[actorId];
  const special = runtimeWeaponSpecialDefinitionForActor(actor);
  if (!special) {
    return {
      state,
      mutation: "noop-no-special",
      specialActive: actor.specialActive,
      specialEnergy: actor.gmaul.specialEnergy,
      queuedGraniteMaulSpecs: actor.gmaul.queuedSpecs
    };
  }

  if (special.id === "granite_maul") {
    const queued = queueGmaulSpec(actor.gmaul, state.tick, 1, {
      requireEnergy: false,
      // Source: PlayerCombat.toggleSpecial() checks the current server weapon only; the client spec-bar
      // visibility gate is already represented by whether a button/orb action packet could be sent.
      requireSpecBarVisible: false
    });
    if (queued.event.outcome !== "queued") {
      return {
        state,
        mutation: "failed",
        specialActive: actor.specialActive,
        specialEnergy: actor.gmaul.specialEnergy,
        queuedGraniteMaulSpecs: actor.gmaul.queuedSpecs,
        reason: queued.event.reason
      };
    }

    const queuedTargetId = actor.targetId ?? actor.gmaul.queuedTargetId ?? actor.lastTargetId ?? undefined;
    const nextGmaul =
      queued.state.queuedSpecs >= 2 && queuedTargetId !== undefined
        ? {
            ...queued.state,
            queuedTargetId
          }
        : queued.state;
    const nextActor = {
      ...actor,
      specialActive: actor.specialActive ? false : true,
      gmaul: nextGmaul
    };
    const nextState = applyGmaulTripleClickAutoTarget(
      {
        ...state,
        actors: {
          ...state.actors,
          [actorId]: nextActor
        }
      },
      actorId,
      actor.gmaul.queuedSpecs
    );
    const resultActor = nextState.actors[actorId];
    return {
      state: nextState,
      mutation: actor.specialActive ? "deactivate-queue-gmaul" : "queue-gmaul",
      specialActive: resultActor.specialActive,
      specialEnergy: resultActor.gmaul.specialEnergy,
      queuedGraniteMaulSpecs: resultActor.gmaul.queuedSpecs
    };
  }

  const nextActor = {
    ...actor,
    specialActive: !actor.specialActive
  };
  const nextState = {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: nextActor
    }
  };
  return {
    state: nextState,
    mutation: nextActor.specialActive ? "activate" : "deactivate",
    specialActive: nextActor.specialActive,
    specialEnergy: nextActor.gmaul.specialEnergy,
    queuedGraniteMaulSpecs: nextActor.gmaul.queuedSpecs
  };
}

function applyGmaulTripleClickAutoTarget(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  queuedSpecsBeforeClick: number
): RuntimePlayerCombatState {
  if (queuedSpecsBeforeClick < 2) {
    return state;
  }
  const actor = state.actors[actorId];
  const targetId = (actor.targetId ?? actor.gmaul.queuedTargetId ?? actor.lastTargetId) as RuntimeActorId | null | undefined;
  if (targetId == null || targetId === actorId) {
    return state;
  }
  const target = state.actors[targetId];
  if (!target || isRuntimePlayerCombatActorDead(target, state.tick)) {
    return state;
  }
  // Trainer QoL extension: Nh queues the third maul click, then normally needs a player-click packet.
  // This promotes the existing target/last-target into that same source-backed TargetRoute path.
  return requestRuntimePlayerCombatAttack(state, actorId, targetId);
}

export function setRuntimePlayerCombatPrayers(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  prayers: readonly PrayerId[]
): RuntimePlayerCombatState {
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...state.actors[actorId],
        activePrayers: compatiblePrayerSet(prayers)
      }
    }
  };
}

export function consumeRuntimePlayerCombatSupply(
  state: RuntimePlayerCombatState,
  actorId: RuntimeActorId,
  item: ConsumableId,
  clientCycle?: number
): RuntimePlayerCombatSupplyResult {
  const actor = state.actors[actorId];
  if (actor.supplies[item] <= 0) {
    return {
      state,
      consumed: false,
      item,
      healed: 0,
      reason: "no-supply"
    };
  }

  const result = applyConsumable({
    stats: runtimePlayerCombatSimStats(actor),
    delays: actor.supplyDelays,
    attackTimer: actor.attackTimer,
    currentTick: state.tick,
    item
  });
  if (!result.ok) {
    return {
      state,
      consumed: false,
      item,
      healed: 0,
      reason: result.reason
    };
  }

  const nextActor: RuntimePlayerCombatActorState = {
    ...actor,
    hitpoints: result.stats.hitpoints.current,
    maxHitpoints: result.stats.hitpoints.fixed,
    prayerPoints: result.stats.prayer.current,
    maxPrayerPoints: result.stats.prayer.fixed,
    levels: runtimePlayerCombatLevelsFromSimStats(result.stats),
    fixedLevels: runtimePlayerCombatFixedLevelsFromSimStats(result.stats),
    attackTimer: result.attackTimer,
    supplies: {
      ...actor.supplies,
      [item]: Math.max(0, actor.supplies[item] - 1)
    },
    supplyDelays: result.delays,
    actionSequenceName: "consume",
    actionStartedAtTick: state.tick,
    actionStartedAtClientCycle: clientCycle ?? state.tick * runtimePlayerCombatClientCyclesPerGameTick,
    actionDurationTicks: 3,
    actionUntilTick: state.tick + 3,
    actionFacingDegrees: actor.actionFacingDegrees
  };
  const supplyEvent: RuntimePlayerCombatEvent = {
    kind: "supply",
    id: `${state.tick}-${actorId}-${item}-supply`,
    tick: state.tick,
    actorId,
    item,
    healed: result.healed,
    previousHitpoints: actor.hitpoints,
    nextHitpoints: result.stats.hitpoints.current,
    maxHitpoints: result.stats.hitpoints.fixed
  };

  return {
    state: {
      ...state,
      actors: {
        ...state.actors,
        [actorId]: nextActor
      },
      events: [...state.events, supplyEvent].filter((event) => event.tick >= state.tick - maxRetainedEventAgeTicks)
    },
    consumed: true,
    item,
    healed: result.healed
  };
}

export function advanceRuntimePlayerCombat(
  state: RuntimePlayerCombatState,
  input: RuntimePlayerCombatAdvanceInput
): RuntimePlayerCombatAdvanceResult {
  const currentTick = state.tick;
  const processOrderState = runtimePlayerCombatProcessOrderStateForTick(state, currentTick);
  let actors = syncRuntimePlayerCombatActors(state.actors, input, currentTick);
  actors = breakRuntimePlayerCombatDistantFreezes(actors, currentTick, input.tileScale);
  let queuedHits = [...state.queuedHits];
  let randomSeed = state.randomSeed;
  const events: RuntimePlayerCombatEvent[] = [];
  const routeRequests: RuntimePlayerCombatRouteRequest[] = [];

  const appliedHits = applyRuntimePlayerCombatDueHits(actors, queuedHits, currentTick, input.tileScale);
  actors = breakRuntimePlayerCombatDistantFreezes(appliedHits.actors, currentTick, input.tileScale);
  queuedHits = appliedHits.queuedHits;
  events.push(...appliedHits.events);

  actors = tickRuntimePlayerCombatSpecialQueues(actors, currentTick, input.tileScale);

  if (!runtimePlayerCombatIsFightCountdownActive(state, currentTick)) {
    for (const actorId of processOrderState.processOrder) {
      const processedActorIds = processOrderState.processOrder.slice(0, processOrderState.processOrder.indexOf(actorId));
      const actor = actors[actorId];
      const targetId = actor.targetId;
      if (!targetId || isRuntimePlayerCombatActorDead(actor, currentTick)) {
        continue;
      }

      const target = actors[targetId];
      if (isRuntimePlayerCombatActorDead(target, currentTick)) {
        actors = {
          ...actors,
          [actorId]: {
            ...actor,
            targetId: null,
            queuedSpellId: null
          }
        };
        continue;
      }

      const targetHasNotProcessed = !processedActorIds.includes(targetId);
      const preMovementTargetTile = input.preMovementTiles?.[targetId];
      const postMovementTargetTile = actors[targetId].tile;
      const targetMovedBeforeItsPid =
        targetHasNotProcessed &&
        preMovementTargetTile !== undefined &&
        !sameRuntimePlayerCombatTile(preMovementTargetTile, postMovementTargetTile);
      const actorsForAttempt = targetMovedBeforeItsPid
        ? {
            ...actors,
            [targetId]: {
              ...actors[targetId],
              tile: preMovementTargetTile
            }
          }
        : actors;
      const attempted = tryRuntimePlayerAttack(
        actorsForAttempt,
        actorId,
        targetId,
        currentTick,
        randomSeed,
        input.clientCycle,
        input.targetRouteMovementConsumed?.[actorId] === true,
        input.projectileLineOfSight?.[actorId],
        input.tileScale
      );
      actors = mergeRuntimePlayerCombatAttemptActorsAfterPidMovement(
        actors,
        attempted.actors,
        actorId,
        targetId,
        currentTick,
        targetMovedBeforeItsPid,
        postMovementTargetTile
      );
      queuedHits.push(...attempted.queuedHits);
      events.push(...attempted.events);
      randomSeed = attempted.randomSeed;
      if (attempted.routeRequest) {
        routeRequests.push(attempted.routeRequest);
      }
    }
  }
  actors = tickRuntimePlayerCombatSpecialRestore(actors);
  actors = breakRuntimePlayerCombatDistantFreezes(actors, currentTick, input.tileScale);
  const nextCombatStartTick = runtimePlayerCombatNextStartTickAfterDeaths(state.combatStartTick, events);

  return {
    state: {
      tick: currentTick + 1,
      combatStartTick: nextCombatStartTick,
      randomSeed,
      ...processOrderState,
      actors,
      queuedHits,
      events: [...state.events, ...events].filter((event) => event.tick >= currentTick - maxRetainedEventAgeTicks)
    },
    routeRequests
  };
}

export function applyRuntimePlayerCombatPreMovementHits(
  state: RuntimePlayerCombatState,
  input: RuntimePlayerCombatAdvanceInput
): RuntimePlayerCombatPreMovementHitResult {
  const currentTick = state.tick;
  const syncedActors = breakRuntimePlayerCombatDistantFreezes(
    syncRuntimePlayerCombatActorsForPreMovementHits(state.actors, input),
    currentTick,
    input.tileScale
  );
  const appliedHits = applyRuntimePlayerCombatDueHits(syncedActors, state.queuedHits, currentTick, input.tileScale);
  const actors = breakRuntimePlayerCombatDistantFreezes(appliedHits.actors, currentTick, input.tileScale);

  return {
    state: {
      ...state,
      combatStartTick: runtimePlayerCombatNextStartTickAfterDeaths(state.combatStartTick, appliedHits.events),
      actors,
      queuedHits: appliedHits.queuedHits,
      events: [...state.events, ...appliedHits.events].filter((event) => event.tick >= currentTick - maxRetainedEventAgeTicks)
    },
    applied: appliedHits.events.length > 0
  };
}

export function runtimePlayerCombatIsFightCountdownActive(state: RuntimePlayerCombatState, tick: number = state.tick): boolean {
  return tick < runtimePlayerCombatSafeStartTick(state.combatStartTick);
}

export function runtimePlayerCombatFightCountdownLabel(
  state: RuntimePlayerCombatState,
  tick: number = state.tick
): "3" | "2" | "1" | "Go" | null {
  if (
    isRuntimePlayerCombatActorDead(state.actors["local-player"], tick) ||
    isRuntimePlayerCombatActorDead(state.actors.opponent, tick)
  ) {
    return null;
  }
  const combatStartTick = runtimePlayerCombatSafeStartTick(state.combatStartTick);
  const remainingTicks = combatStartTick - tick;
  if (remainingTicks > 0) {
    const step = Math.ceil((remainingTicks / runtimePlayerCombatFightCountdownTicks) * 3);
    return String(Math.max(1, Math.min(3, step))) as "3" | "2" | "1";
  }
  return tick === combatStartTick ? "Go" : null;
}

export function runtimePlayerCombatProcessOrderForTick(
  state: RuntimePlayerCombatState,
  tick: number = state.tick
): RuntimePlayerCombatProcessOrder {
  return runtimePlayerCombatProcessOrderStateForTick(state, tick).processOrder;
}

function runtimePlayerCombatNextStartTickAfterDeaths(
  currentStartTick: number,
  events: readonly RuntimePlayerCombatEvent[]
): number {
  let nextStartTick = runtimePlayerCombatSafeStartTick(currentStartTick);
  for (const event of events) {
    if (event.kind === "death") {
      nextStartTick = Math.max(nextStartTick, event.respawnTick + runtimePlayerCombatFightCountdownTicks);
    }
  }
  return nextStartTick;
}

function runtimePlayerCombatSafeStartTick(tick: number | undefined): number {
  return typeof tick === "number" && Number.isFinite(tick) ? Math.max(0, Math.trunc(tick)) : 0;
}

function mergeRuntimePlayerCombatAttemptActorsAfterPidMovement(
  actorsBeforeAttempt: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>,
  attemptedActors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>,
  _attackerId: RuntimeActorId,
  defenderId: RuntimeActorId,
  tick: number,
  defenderMovedBeforeOwnPid: boolean,
  defenderPostMovementTile: RuntimeTile
): Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>> {
  if (!defenderMovedBeforeOwnPid) {
    return attemptedActors;
  }

  const defenderBeforeAttempt = actorsBeforeAttempt[defenderId];
  const defenderAfterAttempt = attemptedActors[defenderId];
  const freezeAppliedBeforeDefenderMovement =
    !isFrozen(defenderBeforeAttempt.locks, tick) && isFrozen(defenderAfterAttempt.locks, tick);
  if (freezeAppliedBeforeDefenderMovement) {
    // Source: Entity.freeze() calls Movement.reset() immediately. With Nh'
    // CoreWorker PID order, a freeze from an earlier-processed player cancels the
    // later player's queued movement before that later Player.process() can consume it.
    return attemptedActors;
  }

  return {
    ...attemptedActors,
    [defenderId]: {
      ...defenderAfterAttempt,
      tile: defenderPostMovementTile
    }
  };
}

function sameRuntimePlayerCombatTile(left: RuntimeTile, right: RuntimeTile): boolean {
  return left.x === right.x && left.z === right.z;
}

function syncRuntimePlayerCombatActorsForPreMovementHits(
  actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>,
  input: RuntimePlayerCombatAdvanceInput
): Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>> {
  return {
    "local-player": syncRuntimePlayerCombatActorForPreMovementHits(actors["local-player"], input),
    opponent: syncRuntimePlayerCombatActorForPreMovementHits(actors.opponent, input)
  };
}

function syncRuntimePlayerCombatActorForPreMovementHits(
  actor: RuntimePlayerCombatActorState,
  input: RuntimePlayerCombatAdvanceInput
): RuntimePlayerCombatActorState {
  const activePrayers = input.prayers?.[actor.id] ?? actor.activePrayers;
  const levels = input.levels?.[actor.id] ?? actor.levels;
  const fixedLevels = input.fixedLevels?.[actor.id] ?? actor.fixedLevels;
  return {
    ...actor,
    activePrayers: compatiblePrayerSet(activePrayers),
    levels,
    fixedLevels
  };
}

export function syncRuntimePlayerCombatStateToInput(
  state: RuntimePlayerCombatState,
  input: RuntimePlayerCombatAdvanceInput
): RuntimePlayerCombatState {
  return {
    ...state,
    actors: syncRuntimePlayerCombatActors(state.actors, input, state.tick)
  };
}

export function runtimePlayerCombatTargetRouteProfile(
  actorId: RuntimeActorId,
  actor: RuntimePlayerCombatActorState
): RuntimePlayerCombatTargetRouteProfile {
  const queuedSpell = actor.queuedSpellId ? runtimePlayerCombatSpellDefinitions[actor.queuedSpellId] : null;
  const explicitAutocastSpell = actor.autocastSpellId ? runtimePlayerCombatSpellDefinitions[actor.autocastSpellId] : null;
  const botAutocastSpell = explicitAutocastSpell === null ? runtimeBotDefaultAutocastSpell(actorId, actor) : null;
  const spell = queuedSpell ?? explicitAutocastSpell ?? botAutocastSpell;
  const profile = spell ? weaponProfileForRuntimeSpell(spell) : weaponProfileForRuntimeActor(actor);
  return {
    attackRange: profile.attackRange,
    melee: runtimePlayerCombatStyleIsMelee(profile.style),
    style: profile.style,
    source: queuedSpell
      ? "queued-spell"
      : explicitAutocastSpell
        ? "autocast-spell"
        : botAutocastSpell
          ? "bot-autocast-spell"
          : "weapon"
  };
}

export function runtimePlayerCombatActorSequence(
  actor: RuntimePlayerCombatActorState,
  tick: number,
  movementSequenceName: RuntimeSequenceName
): RuntimeSequenceName {
  if (actor.actionSequenceName && tick < actor.actionUntilTick) {
    return actor.actionSequenceName;
  }
  return movementSequenceName;
}

export function runtimePlayerCombatActionDurationTicksForProfile(profile: WeaponTimingProfile): number {
  return runtimePlayerCombatActionDurationTicks;
}

export function runtimePlayerCombatActiveProtectionPrayer(actor: RuntimePlayerCombatActorState): ReturnType<typeof activeProtectionPrayer> {
  return activeProtectionPrayer(actor.activePrayers);
}

export function isRuntimePlayerCombatActorDead(actor: RuntimePlayerCombatActorState, tick: number): boolean {
  return actor.hitpoints <= 0 || (actor.deadUntilTick !== null && actor.deadUntilTick > tick);
}

function runtimePlayerCombatFinalizedHitDamage(
  defender: RuntimePlayerCombatActorState,
  rawDamage: number,
  style: CombatStyle
): number {
  // Source: PlayerCombat.postDefend() applies PvP protection before Entity.hit() awards XP and queues Hit.finish().
  return applyProtectionDamageReduction({
    damage: rawDamage,
    attackStyle: style,
    defenderPrayers: defender.activePrayers,
    attackerIsPlayer: true
  });
}

export function runtimePlayerCombatQueuedHitDamage(
  actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>,
  hit: RuntimePlayerQueuedHit,
  tick: number
): number {
  const defender = actors[hit.defenderId];
  if (isRuntimePlayerCombatActorDead(defender, tick)) {
    return 0;
  }

  return hit.damage;
}

export function runtimePlayerCombatXpDropsForDamage(
  hit: RuntimePlayerQueuedHit,
  damage: number
): readonly RuntimePlayerCombatXpDrop[] {
  const dealt = Math.max(0, Math.trunc(damage));
  const drops: RuntimePlayerCombatXpDrop[] = [];

  // Sources: TargetSpell.cast awards base spell XP immediately, then CombatUtils.addMagicXp handles damage and HP XP.
  if (hit.spellId) {
    const spell = runtimePlayerCombatSpellDefinitions[hit.spellId];
    const magicXp = spell.baseXp + dealt * 2;
    if (hit.defensiveCast) {
      pushRuntimePlayerCombatXp(drops, "defence", magicXp / 2);
      pushRuntimePlayerCombatXp(drops, "magic", magicXp / 2);
    } else {
      pushRuntimePlayerCombatXp(drops, "magic", magicXp);
    }
    if (dealt > 0) {
      pushRuntimePlayerCombatXp(drops, "hitpoints", dealt * runtimePlayerCombatHitpointXpRatio);
    }
    return drops;
  }

  if (dealt <= 0) {
    return drops;
  }

  // Source: CombatUtils.addXp uses damage*4 for combat XP, split by AttackType, then adds Hitpoints at damage*1.33.
  const combatXp = dealt * 4;
  if (hit.style === "magic") {
    const magicXp = combatXp / 2;
    if (hit.attackType === "DEFENSIVE") {
      pushRuntimePlayerCombatXp(drops, "magic", magicXp / 2);
      pushRuntimePlayerCombatXp(drops, "defence", magicXp / 2);
    } else {
      pushRuntimePlayerCombatXp(drops, "magic", magicXp);
    }
  } else if (hit.style === "ranged") {
    if (hit.attackType === "LONG_RANGED") {
      pushRuntimePlayerCombatXp(drops, "ranged", combatXp / 2);
      pushRuntimePlayerCombatXp(drops, "defence", combatXp / 2);
    } else {
      pushRuntimePlayerCombatXp(drops, "ranged", combatXp);
    }
  } else if (hit.attackType === "CONTROLLED") {
    pushRuntimePlayerCombatXp(drops, "attack", combatXp / 3);
    pushRuntimePlayerCombatXp(drops, "strength", combatXp / 3);
    pushRuntimePlayerCombatXp(drops, "defence", combatXp / 3);
  } else if (hit.attackType === "AGGRESSIVE") {
    pushRuntimePlayerCombatXp(drops, "strength", combatXp);
  } else if (hit.attackType === "DEFENSIVE") {
    pushRuntimePlayerCombatXp(drops, "defence", combatXp);
  } else {
    pushRuntimePlayerCombatXp(drops, "attack", combatXp);
  }

  pushRuntimePlayerCombatXp(drops, "hitpoints", dealt * runtimePlayerCombatHitpointXpRatio);
  return drops;
}

function createRuntimePlayerCombatActor(
  id: RuntimeActorId,
  tile: RuntimeTile,
  loadoutId: RuntimeLoadoutId,
  attackSetIndex: number,
  levels: CombatLevels,
  fixedLevels: CombatLevels,
  prayerPoints: RuntimePlayerCombatPrayerPoints,
  activePrayers: readonly PrayerId[],
  supplies: RuntimePlayerCombatSupplies,
  specialEnergy: number
): RuntimePlayerCombatActorState {
  const profile = weaponProfileForRuntimeLoadout(loadoutId);
  const weaponId = weaponIdForLoadout(loadoutId);
  const normalizedPrayerPoints = normalizeRuntimePlayerCombatPrayerPoints(prayerPoints, 99, 99);
  return {
    id,
    tile,
    loadoutId,
    equipment: nhLoadouts[loadoutId].equipment,
    policyNextLoadoutSyncTick: 0,
    policyLoadoutSourceSignature: null,
    policyNextFreezeAttemptTick: 0,
    policyPostBrewRecoveryUntilTick: 0,
    policyStalledStyle: null,
    policyStalledStyleTicks: 0,
    attackSetIndex: resolveRuntimePlayerCombatAttackSetIndexForWeapon(weaponId, attackSetIndex),
    queuedSpellId: null,
    autocastSpellId: null,
    defensiveCast: false,
    hitpoints: 99,
    maxHitpoints: 99,
    prayerPoints: normalizedPrayerPoints.current,
    maxPrayerPoints: normalizedPrayerPoints.fixed,
    levels,
    fixedLevels,
    supplies,
    supplyDelays: createSupplyDelayState(),
    activePrayers: compatiblePrayerSet(activePrayers),
    locks: createEntityLockState(),
    attackTimer: createAttackTimerState(-100),
    targetId: null,
    lastTargetId: null,
    lastTargetTimeoutTicks: 0,
    specialActive: false,
    gmaul: updateGmaulEquipment(createGmaulSpecState(specialEnergy), 0, {
      equippedGraniteMaul: weaponId === "granite_maul",
      previousWeaponHadVisibleSpecBar: profile.hasVisibleSpecBar
    }),
    specialRestoreTicks: 0,
    actionSequenceName: null,
    actionStartedAtTick: null,
    actionStartedAtClientCycle: null,
    actionDurationTicks: runtimePlayerCombatActionDurationTicks,
    actionUntilTick: -1,
    actionFacingDegrees: null,
    deadUntilTick: null,
    hitsplatSlotCursor: 0,
    lastHitsplatTick: -100
  };
}

function applyRuntimePlayerCombatDueHits(
  actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>,
  queuedHits: readonly RuntimePlayerQueuedHit[],
  currentTick: number,
  tileScale: number | undefined
): {
  readonly actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>;
  readonly queuedHits: RuntimePlayerQueuedHit[];
  readonly events: RuntimePlayerCombatEvent[];
} {
  let nextActors = actors;
  const dueHits = queuedHits.filter((hit) => hit.dueTick <= currentTick);
  const remainingHits = queuedHits.filter((hit) => hit.dueTick > currentTick);
  const events: RuntimePlayerCombatEvent[] = [];
  for (const hit of dueHits) {
    const applied = applyRuntimePlayerQueuedHit(nextActors, hit, currentTick, tileScale);
    nextActors = applied.actors;
    events.push(...applied.events);
  }
  return {
    actors: nextActors,
    queuedHits: remainingHits,
    events
  };
}

function breakRuntimePlayerCombatDistantFreezes(
  actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>,
  tick: number,
  tileScale: number | undefined
): Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>> {
  let nextActors = actors;
  for (const actorId of ["local-player", "opponent"] as const) {
    const actor = nextActors[actorId];
    if (!isFrozen(actor.locks, tick) || runtimePlayerCombatFreezeSourceWithinBreakDistance(nextActors, actor, tick, tileScale)) {
      continue;
    }
    nextActors = {
      ...nextActors,
      [actorId]: {
        ...actor,
        locks: resetFreeze(actor.locks)
      }
    };
  }
  return nextActors;
}

function runtimePlayerCombatFreezeSourceWithinBreakDistance(
  actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>,
  frozenActor: RuntimePlayerCombatActorState,
  tick: number,
  tileScale: number | undefined
): boolean {
  const sourceId = frozenActor.locks.freezeSourceId as RuntimeActorId | undefined;
  if (sourceId !== "local-player" && sourceId !== "opponent") {
    return true;
  }
  const source = actors[sourceId];
  if (!source || isRuntimePlayerCombatActorDead(source, tick)) {
    return true;
  }
  // Source: Entity.isMovementBlocked() calls resetFreeze() when the freezer is not
  // Position.isWithinDistance(..., false, 12); Position uses Chebyshev x/y distance.
  return runtimePlayerCombatDistance(frozenActor.tile, source.tile, tileScale) <= runtimePlayerCombatFreezeBreakDistance;
}

function syncRuntimePlayerCombatActors(
  actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>,
  input: RuntimePlayerCombatAdvanceInput,
  tick: number
): Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>> {
  return {
    "local-player": syncRuntimePlayerCombatActor(actors["local-player"], input, tick),
    opponent: syncRuntimePlayerCombatActor(actors.opponent, input, tick)
  };
}

function syncRuntimePlayerCombatActor(
  actor: RuntimePlayerCombatActorState,
  input: RuntimePlayerCombatAdvanceInput,
  tick: number
): RuntimePlayerCombatActorState {
  const tile = input.tiles[actor.id] ?? actor.tile;
  const loadoutId = input.loadouts?.[actor.id] ?? actor.loadoutId;
  const loadoutChanged = loadoutId !== actor.loadoutId;
  const equipment = input.equipment?.[actor.id] ?? (loadoutChanged ? nhLoadouts[loadoutId].equipment : actor.equipment);
  const gearProfile = input.gearProfiles?.[actor.id] ?? actor.gearProfile;
  const previousWeaponId = weaponIdForRuntimeActor(actor);
  const nextWeaponId = weaponIdForEquipment(equipment) ?? weaponIdForLoadout(loadoutId);
  const previousProfile = nhWeaponProfiles[previousWeaponId];
  const weaponChanged = nextWeaponId !== previousWeaponId;
  const weaponSlotChanged = (actor.equipment.weapon?.itemId ?? null) !== (equipment.weapon?.itemId ?? null);
  const levels = input.levels?.[actor.id] ?? actor.levels;
  const fixedLevels = input.fixedLevels?.[actor.id] ?? actor.fixedLevels;
  const prayerPoints = normalizeRuntimePlayerCombatPrayerPoints(
    input.prayerPoints?.[actor.id],
    actor.prayerPoints,
    actor.maxPrayerPoints
  );
  const activePrayers = input.prayers?.[actor.id] ?? actor.activePrayers;
  const lastTargetTimeoutTicks = Math.max(0, actor.lastTargetTimeoutTicks - 1);
  const respawning = actor.deadUntilTick !== null && actor.deadUntilTick <= tick;
  // Source: Equipment.equip delays recentlyEquipped but does not resetAnimation(); updateWeapon(false) clears combat UI/autocast state only.
  const actionStillActive = !respawning && actor.actionSequenceName !== null && tick < actor.actionUntilTick;
  // Source: PlayerCombat.restore() and NhStakerBot.prepareFreshState() clear combat
  // targets, prayers, freeze/locks, autocast, queued spells, and active special state.
  const respawned =
    respawning
      ? {
          hitpoints: actor.maxHitpoints,
          deadUntilTick: null,
          targetId: null,
          lastTargetId: null,
          lastTargetTimeoutTicks: 0,
          policyNextLoadoutSyncTick: 0,
          policyNextFreezeAttemptTick: 0,
          policyPostBrewRecoveryUntilTick: 0,
          policyOffenceStyle: undefined,
          policyStalledStyle: null,
          policyStalledStyleTicks: 0,
          queuedSpellId: null,
          autocastSpellId: null,
          defensiveCast: false,
          levels: runtimePlayerCombatDefaultLevels,
          fixedLevels: runtimePlayerCombatDefaultLevels,
          prayerPoints: actor.maxPrayerPoints,
          activePrayers: [] as readonly PrayerId[],
          locks: createEntityLockState(),
          supplies: runtimePlayerCombatDefaultSupplies,
          supplyDelays: createSupplyDelayState(),
          specialActive: false,
          gmaul: createGmaulSpecState(100)
        }
      : {};

  return {
    ...actor,
    ...respawned,
    tile,
    loadoutId,
    equipment,
    gearProfile,
    attackSetIndex: resolveRuntimePlayerCombatAttackSetIndexForWeapon(
      nextWeaponId,
      input.attackSets?.[actor.id] ?? actor.attackSetIndex
    ),
    queuedSpellId: respawning || loadoutChanged ? null : actor.queuedSpellId,
    // Source: Equipment.sendUpdates() calls PlayerCombat.updateWeapon(false) for SLOT_WEAPON,
    // which calls TabCombat.updateAutocast(player, false) and clears autocast/defensive casting.
    autocastSpellId: respawning || loadoutChanged || weaponSlotChanged ? null : actor.autocastSpellId,
    defensiveCast: respawning || loadoutChanged || weaponSlotChanged ? false : actor.defensiveCast,
    levels: respawning ? runtimePlayerCombatDefaultLevels : levels,
    fixedLevels: respawning ? runtimePlayerCombatDefaultLevels : fixedLevels,
    prayerPoints: respawning ? actor.maxPrayerPoints : prayerPoints.current,
    maxPrayerPoints: prayerPoints.fixed,
    activePrayers: compatiblePrayerSet(respawning ? [] : activePrayers),
    locks: respawning ? createEntityLockState() : tickLocks(actor.locks, tick),
    attackTimer: consumeExpiredAttackDelay(actor.attackTimer, tick).state,
    lastTargetId: respawning ? null : lastTargetTimeoutTicks > 0 ? actor.lastTargetId : null,
    lastTargetTimeoutTicks: respawning ? 0 : lastTargetTimeoutTicks,
    specialActive: respawning || loadoutChanged ? false : actor.specialActive,
    gmaul: respawning
      ? createGmaulSpecState(100)
      : loadoutChanged || weaponChanged
      ? updateGmaulEquipment(actor.gmaul, tick, {
          equippedGraniteMaul: nextWeaponId === "granite_maul",
          previousWeaponHadVisibleSpecBar: previousProfile.hasVisibleSpecBar
        })
      : actor.gmaul,
    actionSequenceName: actionStillActive ? actor.actionSequenceName : null,
    actionStartedAtTick: actionStillActive ? actor.actionStartedAtTick : null,
    actionStartedAtClientCycle: actionStillActive ? actor.actionStartedAtClientCycle : null,
    actionDurationTicks: actionStillActive ? actor.actionDurationTicks : runtimePlayerCombatActionDurationTicks,
    actionFacingDegrees: actionStillActive ? actor.actionFacingDegrees : null
  };
}

function tickRuntimePlayerCombatSpecialQueues(
  actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>,
  tick: number,
  tileScale: number | undefined
): Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>> {
  let nextActors = actors;

  for (const actorId of ["local-player", "opponent"] as const) {
    const actor = nextActors[actorId];
    const ticked = tickGmaulQueue(actor.gmaul);
    let nextActor: RuntimePlayerCombatActorState = ticked.state === actor.gmaul ? actor : { ...actor, gmaul: ticked.state };
    const queuedTargetId = (nextActor.gmaul.queuedTargetId ?? nextActor.lastTargetId) as RuntimeActorId | null | undefined;
    if (ticked.autoAttackRequested && nextActor.targetId === null && queuedTargetId !== null && queuedTargetId !== undefined) {
      const target = nextActors[queuedTargetId];
      if (
        target &&
        !isRuntimePlayerCombatActorDead(target, tick) &&
        canRuntimePlayerGraniteMaulAutoAttackLastTarget(nextActor, target, tileScale)
      ) {
        nextActor = {
          ...nextActor,
          targetId: target.id,
          lastTargetId: target.id,
          lastTargetTimeoutTicks: 5
        };
      }
    }

    if (nextActor !== actor) {
      nextActors = {
        ...nextActors,
        [actorId]: nextActor
      };
    }
  }

  return nextActors;
}

function tickRuntimePlayerCombatSpecialRestore(
  actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>
): Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>> {
  let nextActors = actors;

  for (const actorId of ["local-player", "opponent"] as const) {
    const actor = nextActors[actorId];
    const nextRestoreTicks = actor.specialRestoreTicks + 1;
    const restoreReady = nextRestoreTicks >= runtimePlayerCombatSpecialRestorePeriodTicks;
    const specialEnergy = restoreReady
      ? Math.min(100, actor.gmaul.specialEnergy + runtimePlayerCombatSpecialRestorePercent)
      : actor.gmaul.specialEnergy;
    // Source: Player.tick() increments specialRestoreTicks after combat.attack(), then PlayerCombat.restoreSpecial(10).
    nextActors = {
      ...nextActors,
      [actorId]: {
        ...actor,
        specialRestoreTicks: restoreReady ? 0 : nextRestoreTicks,
        gmaul: specialEnergy === actor.gmaul.specialEnergy ? actor.gmaul : { ...actor.gmaul, specialEnergy }
      }
    };
  }

  return nextActors;
}

function canRuntimePlayerGraniteMaulAutoAttackLastTarget(
  attacker: RuntimePlayerCombatActorState,
  target: RuntimePlayerCombatActorState,
  tileScale: number | undefined
): boolean {
  const { attacker: attackerTile, defender: defenderTile } = runtimeTilePositionPair(attacker.tile, target.tile, tileScale);
  if ((attackerTile.plane ?? 0) !== (defenderTile.plane ?? 0)) {
    return false;
  }

  const dx = Math.abs(attackerTile.x - defenderTile.x);
  const dy = Math.abs(attackerTile.y - defenderTile.y);
  // Source: PlayerCombat.autoAttackGraniteMaul() only re-targets size-1 actors when diffX + diffY == 1.
  return dx + dy === 1;
}

function tryRuntimePlayerAttack(
  actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>,
  attackerId: RuntimeActorId,
  defenderId: RuntimeActorId,
  tick: number,
  seed: number,
  clientCycle: number | undefined,
  targetRouteMovementConsumed: boolean,
  projectileLineOfSight: boolean | undefined,
  tileScale: number | undefined
): {
  readonly actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>;
  readonly queuedHits: readonly RuntimePlayerQueuedHit[];
  readonly events: readonly RuntimePlayerCombatEvent[];
  readonly randomSeed: number;
  readonly routeRequest?: RuntimePlayerCombatRouteRequest;
} {
  let attacker = actors[attackerId];
  const defender = actors[defenderId];
  const weaponId = weaponIdForRuntimeActor(attacker);
  const queuedSpell = attacker.queuedSpellId ? runtimePlayerCombatSpellDefinitions[attacker.queuedSpellId] : null;
  const autocastSpell = attacker.autocastSpellId
    ? runtimePlayerCombatSpellDefinitions[attacker.autocastSpellId]
    : runtimeBotDefaultAutocastSpell(attackerId, attacker);
  const spell = queuedSpell ?? autocastSpell;
  const spellIsAutocast = queuedSpell === null && autocastSpell !== null;
  const profile = spell ? weaponProfileForRuntimeSpell(spell) : weaponProfileForRuntimeActor(attacker);
  if (!spell && runtimePlayerCombatStyleIsMelee(profile.style) && attacker.gmaul.queuedSpecs > 0) {
    const gmaulSpec = tryRuntimePlayerGmaulSpecial(
      actors,
      attackerId,
      defenderId,
      tick,
      seed,
      clientCycle,
      targetRouteMovementConsumed,
      tileScale
    );
    if (gmaulSpec) {
      if (gmaulSpec.handled) {
        return {
          actors: gmaulSpec.actors,
          queuedHits: gmaulSpec.queuedHits,
          events: gmaulSpec.events,
          randomSeed: gmaulSpec.randomSeed,
          routeRequest: gmaulSpec.routeRequest
        };
      }
      actors = gmaulSpec.actors;
    }
  }
  attacker = actors[attackerId];
  const combatTiles = runtimeTilePositionPair(attacker.tile, defender.tile, tileScale);
  const gate = playerAttackGate({
    currentTick: tick,
    attackerTile: combatTiles.attacker,
    defenderTile: combatTiles.defender,
    attackerFrozen: isFrozen(attacker.locks, tick),
    locks: attacker.locks,
    attackTimer: attacker.attackTimer,
    weapon: profile,
    projectileLineOfSight
  });

  if (!gate.canAttack) {
    // Source: TargetRoute.beforeMovement() only routes while Movement.isAtDestination().
    // If a policy/manual step already consumed movement this tick, Nh leaves the target
    // route pending instead of immediately counter-routing the actor back out.
    const routeRequest = gate.requiresMovement && !targetRouteMovementConsumed
      ? {
          actorId: attackerId,
          targetId: defenderId,
          targetTile: defender.tile,
          attackRange: profile.attackRange,
          reason: gate.reason
        }
      : undefined;
    return {
      actors,
      queuedHits: [],
      events: [],
      randomSeed: seed,
      routeRequest
    };
  }

  if (gate.requiresMovement) {
    // Source: Player.process() runs TargetRoute.beforeMovement(), movement.process(), then combat.attack().
    // A diagonal/step-in melee opportunity only becomes a same-tick hit after that route step has
    // already put the player in true reach; otherwise Nh keeps the target route pending.
    return {
      actors,
      queuedHits: [],
      events: [],
      randomSeed: seed,
      routeRequest: {
        actorId: attackerId,
        targetId: defenderId,
        targetTile: defender.tile,
        attackRange: profile.attackRange,
        reason: "ready"
      }
    };
  }

  if (spell && !nhMagicSpellCurrentLevelCanCast(spell.id, attacker.levels.magic)) {
    return resetRuntimePlayerCombatFailedSpellCast(actors, attackerId, defenderId, seed);
  }

  const attack = dispatchPlayerAttack({
    currentTick: tick,
    attackerTile: combatTiles.attacker,
    defenderTile: combatTiles.defender,
    attackerFrozen: isFrozen(attacker.locks, tick),
    locks: attacker.locks,
    attackTimer: attacker.attackTimer,
    weapon: profile,
    projectileLineOfSight
  });
  const specialAttack = spell ? null : runtimeSpecialAttackForNextAttack(attacker, attacker.specialActive);
  const useWeaponSpecial =
    specialAttack !== null &&
    specialAttack.id !== "granite_maul" &&
    attacker.gmaul.specialEnergy >= specialAttack.drainPercent;
  const damageRoll = rollRuntimePlayerDamage(
    attacker,
    defender,
    profile.style,
    seed,
    useWeaponSpecial ? specialAttack.accuracyMultiplier : 1,
    spell?.maxDamage,
    useWeaponSpecial ? specialAttack.damageMultiplier : 1
  );
  const sequenceName = spell?.sequenceName ?? (useWeaponSpecial ? specialAttack.sequenceName : undefined) ?? runtimeAttackSequenceName(attacker.loadoutId, profile);
  const projectile = spell?.projectileProfile ?? runtimeProjectileProfile(profile.style, useWeaponSpecial ? specialAttack.id : undefined);
  const actionDurationTicks = runtimePlayerCombatActionDurationTicksForProfile(profile);
  const distance = runtimePlayerCombatDistance(attacker.tile, defender.tile, tileScale);
  const projectileDurationCycles = projectile
    ? runtimePlayerCombatProjectileDurationCycles(projectile, distance)
    : undefined;
  const hitDelayTicks = runtimePlayerCombatHitDelayTicks(profile.style, distance, projectile);
  const sourceId = spell?.id ?? weaponId;
  const defenderProtectionPrayer = activeProtectionPrayer(defender.activePrayers);
  const damage = runtimePlayerCombatFinalizedHitDamage(defender, damageRoll.damage, profile.style);
  const freezeLandsOnCast = spell?.freezeDurationTicks !== undefined && damage > 0;
  const nextDefenderLocks = freezeLandsOnCast
    ? applyFreeze(defender.locks, tick, spell.freezeDurationTicks, attackerId)
    : defender.locks;
  const nextDefender =
    nextDefenderLocks === defender.locks
      ? defender
      : {
          ...defender,
          locks: nextDefenderLocks
        };
  const expectedDamage = runtimePlayerCombatExpectedDamage(
    damageRoll.maxDamage,
    damageRoll.hitChance,
    profile.style,
    defenderProtectionPrayer
  );
  const attackEvent: RuntimePlayerCombatEvent = {
    kind: "attack",
    id: `${tick}-${attackerId}-${defenderId}-${sourceId}-attack`,
    tick,
    attackerId,
    defenderId,
    attackerTile: attacker.tile,
    defenderTile: defender.tile,
    style: profile.style,
    spellId: spell?.id,
    autocast: spell ? spellIsAutocast : undefined,
    sequenceName,
    hitDelayTicks,
    maxDamage: damageRoll.maxDamage,
    hitChance: damageRoll.hitChance,
    expectedDamage,
    specialAttack: useWeaponSpecial ? specialAttack.id : undefined,
    projectileDurationCycles,
    projectile,
    ...(defenderProtectionPrayer ? { defenderProtectionPrayer } : {}),
    attackerActivePrayers: attacker.activePrayers,
    attackerEquipment: attacker.equipment,
    defenderEquipment: defender.equipment
  };
  const events: RuntimePlayerCombatEvent[] = [attackEvent];
  if (spell?.castSpotanimId !== undefined && spell.castSpotanimArtifactUrl !== undefined) {
    events.push({
      kind: "spotanim",
      id: `${tick}-${attackerId}-${spell.id}-cast-spotanim`,
      tick,
      actorId: attackerId,
      spotanimId: spell.castSpotanimId,
      artifactUrl: spell.castSpotanimArtifactUrl
    });
  }
  if (useWeaponSpecial && specialAttack.spotanimId !== undefined && specialAttack.spotanimArtifactUrl !== undefined) {
    events.push({
      kind: "spotanim",
      id: `${tick}-${attackerId}-${specialAttack.id}-spotanim`,
      tick,
      actorId: attackerId,
      spotanimId: specialAttack.spotanimId,
      artifactUrl: specialAttack.spotanimArtifactUrl
    });
  }
  return {
    actors: {
      ...actors,
      [attackerId]: {
        ...attacker,
        attackTimer: attack.attackTimer,
        queuedSpellId: queuedSpell ? null : attacker.queuedSpellId,
        targetId: queuedSpell ? null : attacker.targetId,
        specialActive: specialAttack ? false : attacker.specialActive,
        gmaul: useWeaponSpecial
          ? {
              ...attacker.gmaul,
              specialEnergy: clampRuntimeSpecialEnergy(attacker.gmaul.specialEnergy - specialAttack.drainPercent)
            }
          : attacker.gmaul,
        actionSequenceName: sequenceName,
        actionStartedAtTick: tick,
        actionStartedAtClientCycle: clientCycle ?? tick * runtimePlayerCombatClientCyclesPerGameTick,
        actionDurationTicks,
        actionUntilTick: tick + actionDurationTicks,
        actionFacingDegrees: runtimePlayerCombatFacingDegrees(attacker.tile, defender.tile)
      },
      // Source: TargetSpell.cast() calls target.hit(hit) to roll/queue damage, then
      // TargetSpell.afterHit()/hold() applies Ice Barrage freeze immediately on cast.
      [defenderId]: nextDefender
    },
    queuedHits: [
      {
        id: `${tick}-${attackerId}-${defenderId}-${sourceId}-hit`,
        dueTick: tick + hitDelayTicks,
        attackerId,
        defenderId,
        style: profile.style,
        attackType: spell ? "ACCURATE" : runtimePlayerCombatAttackTypeForWeapon(weaponId, attacker.attackSetIndex),
        attackSetIndex: normalizeRuntimeAttackSetIndex(attacker.attackSetIndex),
        weaponId,
        spellId: spell?.id,
        autocast: spell ? spellIsAutocast : undefined,
        defensiveCast: spell ? attacker.defensiveCast : undefined,
        damage,
        rawDamage: damageRoll.damage,
        maxDamage: damageRoll.maxDamage,
        hitChance: damageRoll.hitChance,
        ...(defenderProtectionPrayer ? { defenderProtectionPrayer } : {}),
        ...(spell?.freezeDurationTicks !== undefined && !freezeLandsOnCast
          ? { freezeDurationTicks: spell.freezeDurationTicks }
          : {}),
        bloodHealFraction: spell?.bloodHealFraction
      }
    ],
    events,
    randomSeed: damageRoll.seed,
    routeRequest: attack.requiresMovement
      ? {
          actorId: attackerId,
          targetId: defenderId,
          targetTile: defender.tile,
          attackRange: profile.attackRange,
          reason: "ready"
        }
      : undefined
  };
}

function resetRuntimePlayerCombatFailedSpellCast(
  actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>,
  attackerId: RuntimeActorId,
  defenderId: RuntimeActorId,
  seed: number
): {
  readonly actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>;
  readonly queuedHits: readonly RuntimePlayerQueuedHit[];
  readonly events: readonly RuntimePlayerCombatEvent[];
  readonly randomSeed: number;
} {
  const attacker = actors[attackerId];
  return {
    actors: {
      ...actors,
      [attackerId]: {
        ...attacker,
        queuedSpellId: null,
        targetId: null,
        lastTargetId: defenderId,
        lastTargetTimeoutTicks: 5
      }
    },
    queuedHits: [],
    events: [],
    randomSeed: seed
  };
}

function tryRuntimePlayerGmaulSpecial(
  actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>,
  attackerId: RuntimeActorId,
  defenderId: RuntimeActorId,
  tick: number,
  seed: number,
  clientCycle: number | undefined,
  targetRouteMovementConsumed: boolean,
  tileScale: number | undefined
): RuntimePlayerGmaulSpecialAttempt | null {
  const attacker = actors[attackerId];
  const defender = actors[defenderId];
  if (attacker.gmaul.queuedSpecs <= 0) {
    return null;
  }
  const equippedGraniteMaul = weaponIdForRuntimeActor(attacker) === "granite_maul";

  if (!canAttackThroughLock(attacker.locks, tick)) {
    return {
      handled: true,
      actors,
      queuedHits: [],
      events: [],
      randomSeed: seed
    };
  }

  const reach = canMeleeReachThisTick({
    ...runtimeTilePositionPair(attacker.tile, defender.tile, tileScale),
    attackerFrozen: isFrozen(attacker.locks, tick)
  });
  if (!equippedGraniteMaul) {
    if (!reach.canReach || (reach.requiresMovement && targetRouteMovementConsumed)) {
      return null;
    }
    return {
      handled: false,
      actors: {
        ...actors,
        [attackerId]: {
          ...attacker,
          gmaul: clearQueuedGmaulSpecs(attacker.gmaul)
        }
      }
    };
  }

  if (!reach.canReach) {
    return {
      handled: true,
      actors,
      queuedHits: [],
      events: [],
      randomSeed: seed,
      routeRequest: targetRouteMovementConsumed
        ? undefined
        : {
            actorId: attackerId,
            targetId: defenderId,
            targetTile: defender.tile,
            attackRange: 1,
            reason: "out-of-range"
          }
    };
  }

  if (reach.requiresMovement) {
    // Source: GraniteMaul.specialAttack() is dispatched through PlayerCombat.attack()
    // after TargetRoute has moved the player. A queued maul spec can request that route,
    // but it cannot land from diagonal/step-in reach before the movement has actually resolved.
    return {
      handled: true,
      actors,
      queuedHits: [],
      events: [],
      randomSeed: seed,
      routeRequest: {
        actorId: attackerId,
        targetId: defenderId,
        targetTile: defender.tile,
        attackRange: 1,
        reason: "ready"
      }
    };
  }

  const consumed = consumeQueuedGmaulSpecs(attacker.gmaul, tick, {
    meleeReachable: true,
    attackStyle: "crush"
  });
  if (consumed.event.outcome !== "used") {
    return {
      handled: false,
      actors: {
        ...actors,
        [attackerId]: {
          ...attacker,
          specialActive: false,
          gmaul: consumed.state
        }
      }
    };
  }

  let randomSeed = seed;
  const queuedHits: RuntimePlayerQueuedHit[] = [];
  const defenderProtectionPrayer = activeProtectionPrayer(defender.activePrayers);
  let expectedDamage = 0;
  let attackHitChance = 0;
  let attackMaxDamage = 0;
  for (let index = 0; index < consumed.event.count; index += 1) {
    const damageRoll = rollRuntimePlayerDamage(attacker, defender, "crush", randomSeed);
    const damage = runtimePlayerCombatFinalizedHitDamage(defender, damageRoll.damage, "crush");
    randomSeed = damageRoll.seed;
    attackHitChance += damageRoll.hitChance;
    attackMaxDamage = Math.max(attackMaxDamage, damageRoll.maxDamage);
    expectedDamage += runtimePlayerCombatExpectedDamage(
      damageRoll.maxDamage,
      damageRoll.hitChance,
      "crush",
      defenderProtectionPrayer
    );
    queuedHits.push({
      id: `${tick}-${attackerId}-${defenderId}-granite-maul-spec-${index}-hit`,
      dueTick: tick + 1,
      attackerId,
      defenderId,
      style: "crush",
      attackType: runtimePlayerCombatAttackTypeForWeapon("granite_maul", attacker.attackSetIndex),
      attackSetIndex: normalizeRuntimeAttackSetIndex(attacker.attackSetIndex),
      weaponId: "granite_maul",
      damage,
      rawDamage: damageRoll.damage,
      maxDamage: damageRoll.maxDamage,
      hitChance: damageRoll.hitChance,
      ...(defenderProtectionPrayer ? { defenderProtectionPrayer } : {})
    });
  }

  const actionDurationTicks = runtimePlayerCombatActionDurationTicksForProfile(weaponProfileForRuntimeActor(attacker));
  return {
    handled: true,
    actors: {
      ...actors,
      [attackerId]: {
        ...attacker,
        specialActive: false,
        gmaul: consumed.state,
        actionSequenceName: "gmaul_special",
        actionStartedAtTick: tick,
        actionStartedAtClientCycle: clientCycle ?? tick * runtimePlayerCombatClientCyclesPerGameTick,
        actionDurationTicks,
        actionUntilTick: tick + actionDurationTicks,
        actionFacingDegrees: runtimePlayerCombatFacingDegrees(attacker.tile, defender.tile),
        lastTargetId: defenderId,
        lastTargetTimeoutTicks: 5
      }
    },
    queuedHits,
    events: [
      {
        kind: "attack",
        id: `${tick}-${attackerId}-${defenderId}-granite-maul-special-attack`,
        tick,
        attackerId,
        defenderId,
        attackerTile: attacker.tile,
        defenderTile: defender.tile,
        style: "crush",
        sequenceName: "gmaul_special",
        hitDelayTicks: 1,
        maxDamage: attackMaxDamage,
        hitChance: consumed.event.count > 0 ? attackHitChance / consumed.event.count : 0,
        expectedDamage,
        specialAttack: "granite_maul",
        specialAttackCount: consumed.event.count,
        ...(defenderProtectionPrayer ? { defenderProtectionPrayer } : {}),
        attackerActivePrayers: attacker.activePrayers,
        attackerEquipment: attacker.equipment,
        defenderEquipment: defender.equipment
      },
      {
        kind: "spotanim",
        id: `${tick}-${attackerId}-gmaul-spotanim`,
        tick,
        actorId: attackerId,
        spotanimId: 340,
        artifactUrl: "render/spotanims/gmaul_special.glb"
      }
    ],
    randomSeed,
    routeRequest: reach.requiresMovement
      ? {
          actorId: attackerId,
          targetId: defenderId,
          targetTile: defender.tile,
          attackRange: 1,
          reason: "ready"
        }
      : undefined
  };
}

function runtimePlayerCombatFacingDegrees(from: RuntimeTile, to: RuntimeTile): number {
  const degrees = (Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI;
  return Number.isFinite(degrees) ? degrees : 0;
}

function applyRuntimePlayerQueuedHit(
  actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>,
  hit: RuntimePlayerQueuedHit,
  tick: number,
  tileScale: number | undefined
): {
  readonly actors: Readonly<Record<RuntimeActorId, RuntimePlayerCombatActorState>>;
  readonly events: readonly RuntimePlayerCombatEvent[];
} {
  const defender = actors[hit.defenderId];
  if (isRuntimePlayerCombatActorDead(defender, tick)) {
    return { actors, events: [] };
  }
  const defenderProtectionPrayer = hit.defenderProtectionPrayer;
  const damage = runtimePlayerCombatQueuedHitDamage(actors, hit, tick);
  const nextHitpoints = Math.max(0, defender.hitpoints - damage);
  const dead = nextHitpoints <= 0;
  const respawnTick = tick + deathResetDelayTicks;
  const hitsplatExpired = tick >= runtimePlayerCombatHitsplatEndTick(defender.lastHitsplatTick);
  const hitsplatSlotIndex = hitsplatExpired ? 0 : (defender.hitsplatSlotCursor % 4);
  const freezeLands =
    hit.freezeDurationTicks !== undefined &&
    damage > 0 &&
    runtimePlayerCombatFreezeSourceWithinBreakDistance(actors, defender, tick, tileScale);
  const resetDefender = dead ? resetRuntimePlayerCombatActorPolicyDeath(defender) : defender;
  const nextDefender: RuntimePlayerCombatActorState = {
    ...resetDefender,
    hitpoints: nextHitpoints,
    deadUntilTick: dead ? respawnTick : defender.deadUntilTick,
    locks: freezeLands ? applyFreeze(resetDefender.locks, tick, hit.freezeDurationTicks, hit.attackerId) : resetDefender.locks,
    hitsplatSlotCursor: (hitsplatSlotIndex + 1) % 4,
    lastHitsplatTick: tick
  };
  const attacker = actors[hit.attackerId];
  const bloodHeal = hit.bloodHealFraction && damage > 0 ? runtimePlayerCombatBloodSpellHeal(attacker, damage) : 0;
  const nextAttacker: RuntimePlayerCombatActorState = {
    ...attacker,
    hitpoints: bloodHeal > 0 ? Math.min(attacker.maxHitpoints, attacker.hitpoints + bloodHeal) : attacker.hitpoints,
    targetId: dead ? null : attacker.targetId
  };
  const events: RuntimePlayerCombatEvent[] = [
    {
      kind: "hitsplat",
      id: `${hit.id}-hitsplat`,
      tick,
      attackerId: hit.attackerId,
      targetActorId: hit.defenderId,
      style: hit.style,
      spellId: hit.spellId,
      autocast: hit.autocast,
      damage,
      rawDamage: hit.rawDamage,
      maxDamage: hit.maxDamage,
      hitChance: hit.hitChance,
      ...(defenderProtectionPrayer ? { defenderProtectionPrayer } : {}),
      previousHitpoints: defender.hitpoints,
      nextHitpoints,
      maxHitpoints: defender.maxHitpoints,
      slotIndex: hitsplatSlotIndex
    }
  ];
  const spell = hit.spellId ? runtimePlayerCombatSpellDefinitions[hit.spellId] : null;
  if (spell && damage > 0) {
    events.push({
      kind: "spotanim",
      id: `${hit.id}-${spell.id}-hit-spotanim`,
      tick,
      actorId: hit.defenderId,
      spotanimId: spell.hitSpotanimId,
      artifactUrl: spell.hitSpotanimArtifactUrl
    });
  }
  if (dead) {
    events.push({
      kind: "death",
      id: `${tick}-${hit.defenderId}-death`,
      tick,
      actorId: hit.defenderId,
      respawnTick
    });
  }
  return {
    actors: {
      ...actors,
      [hit.attackerId]: nextAttacker,
      [hit.defenderId]: nextDefender
    },
    events
  };
}

function runtimePlayerCombatBloodSpellHeal(attacker: RuntimePlayerCombatActorState, damage: number): number {
  // Source: BloodSpell.afterHit uses integer hit.damage / 4, with Zuriel's staff (item 22647) multiplying the heal.
  let healAmount = Math.trunc(damage / 4);
  if (runtimePlayerCombatActorHasEquipmentItem(attacker, 22647)) {
    healAmount = Math.trunc(healAmount * 1.5);
  }
  return healAmount;
}

function runtimePlayerCombatActorHasEquipmentItem(actor: RuntimePlayerCombatActorState, itemId: number): boolean {
  return Object.values(actor.equipment).some((item) => item?.itemId === itemId);
}

function rollRuntimePlayerDamage(
  attacker: RuntimePlayerCombatActorState,
  defender: RuntimePlayerCombatActorState,
  style: CombatStyle,
  seed: number,
  accuracyMultiplier = 1,
  maxMagicDamage = 30,
  damageMultiplier = 1
): { readonly damage: number; readonly seed: number; readonly maxDamage: number; readonly hitChance: number } {
  const estimate = runtimePlayerCombatDamageEstimate(attacker, defender, style, maxMagicDamage);
  const hitChance = clampRuntimeHitChance(estimate.hitChance * Math.max(0, accuracyMultiplier));
  const maxDamage = Math.max(0, Math.trunc(estimate.maxDamage * Math.max(0, damageMultiplier)));
  const hitChanceRoll = nextRuntimeCombatRandom(seed);
  const damageRoll = nextRuntimeCombatRandom(hitChanceRoll.seed);
  if (hitChanceRoll.value > hitChance || maxDamage <= 0) {
    return {
      damage: 0,
      seed: damageRoll.seed,
      maxDamage,
      hitChance
    };
  }
  return {
    damage: Math.floor(damageRoll.value * (maxDamage + 1)),
    seed: damageRoll.seed,
    maxDamage,
    hitChance
  };
}

function runtimePlayerCombatExpectedDamage(
  maxDamage: number,
  hitChance: number,
  style: CombatStyle,
  defenderProtectionPrayer: ProtectionPrayerId | undefined
): number {
  const effectiveMaxDamage =
    defenderProtectionPrayer === protectPrayerForStyle(style)
      ? Math.trunc(maxDamage * pvpProtectionDamageMultiplier)
      : maxDamage;
  return hitChance * (Math.max(0, effectiveMaxDamage) / 2);
}

export function runtimePlayerCombatDamageEstimate(
  attacker: RuntimePlayerCombatActorState,
  defender: RuntimePlayerCombatActorState,
  style: CombatStyle,
  maxMagicDamage = 30
): StyleEvEstimate {
  return estimateVisibleStyleEvs({
    equipmentRows,
    attackerEquipment: attacker.equipment,
    defenderEquipment: defender.equipment,
    attackerLevels: attacker.levels,
    defenderLevels: defender.levels,
    attackerPrayers: attacker.activePrayers,
    defenderPrayers: defender.activePrayers,
    styles: [style],
    maxMagicDamage
  })[0];
}

function runtimePlayerCombatSimStats(actor: RuntimePlayerCombatActorState): SimStats {
  return {
    attack: { current: actor.levels.attack, fixed: actor.fixedLevels.attack },
    strength: { current: actor.levels.strength, fixed: actor.fixedLevels.strength },
    defence: { current: actor.levels.defence, fixed: actor.fixedLevels.defence },
    ranged: { current: actor.levels.ranged, fixed: actor.fixedLevels.ranged },
    magic: { current: actor.levels.magic, fixed: actor.fixedLevels.magic },
    hitpoints: { current: actor.hitpoints, fixed: actor.maxHitpoints },
    prayer: { current: actor.prayerPoints, fixed: actor.maxPrayerPoints }
  };
}

function normalizeRuntimePlayerCombatPrayerPoints(
  value: RuntimePlayerCombatPrayerPoints | undefined,
  currentFallback: number,
  fixedFallback: number
): Required<RuntimePlayerCombatPrayerPoints> {
  const rawFixed = value?.fixed ?? fixedFallback;
  const fixed = Math.max(1, Math.trunc(Number.isFinite(rawFixed) ? rawFixed : fixedFallback));
  const rawCurrent = value?.current ?? currentFallback;
  const current = Math.max(0, Math.min(fixed, Math.trunc(Number.isFinite(rawCurrent) ? rawCurrent : currentFallback)));
  return { current, fixed };
}

function runtimePlayerCombatLevelsFromSimStats(stats: SimStats): CombatLevels {
  return {
    attack: stats.attack.current,
    strength: stats.strength.current,
    defence: stats.defence.current,
    ranged: stats.ranged.current,
    magic: stats.magic.current
  };
}

function runtimePlayerCombatFixedLevelsFromSimStats(stats: SimStats): CombatLevels {
  return {
    attack: stats.attack.fixed,
    strength: stats.strength.fixed,
    defence: stats.defence.fixed,
    ranged: stats.ranged.fixed,
    magic: stats.magic.fixed
  };
}

function nextRuntimeCombatRandom(seed: number): { readonly value: number; readonly seed: number } {
  const nextSeed = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
  return {
    value: nextSeed / 0x100000000,
    seed: nextSeed
  };
}

function createRuntimePlayerCombatProcessOrderState(seed: number): Required<
  Pick<RuntimePlayerCombatState, "processOrder" | "nextProcessOrderShuffleTick" | "processOrderSeed">
> {
  return nextRuntimePlayerCombatProcessOrder(seed, 0);
}

function runtimePlayerCombatProcessOrderStateForTick(
  state: RuntimePlayerCombatState,
  tick: number
): Required<Pick<RuntimePlayerCombatState, "processOrder" | "nextProcessOrderShuffleTick" | "processOrderSeed">> {
  let processOrder = normalizeRuntimePlayerCombatProcessOrder(state.processOrder);
  let nextProcessOrderShuffleTick =
    state.nextProcessOrderShuffleTick ?? runtimePlayerCombatProcessOrderShuffleMinTicks;
  let processOrderSeed = state.processOrderSeed ?? state.randomSeed;
  while (tick >= nextProcessOrderShuffleTick) {
    const next = nextRuntimePlayerCombatProcessOrder(processOrderSeed, nextProcessOrderShuffleTick);
    processOrder = next.processOrder;
    nextProcessOrderShuffleTick = next.nextProcessOrderShuffleTick;
    processOrderSeed = next.processOrderSeed;
  }
  return {
    processOrder,
    nextProcessOrderShuffleTick,
    processOrderSeed
  };
}

function nextRuntimePlayerCombatProcessOrder(
  seed: number,
  tick: number
): Required<Pick<RuntimePlayerCombatState, "processOrder" | "nextProcessOrderShuffleTick" | "processOrderSeed">> {
  const orderRoll = nextRuntimeCombatRandom(seed);
  const delayRoll = nextRuntimeCombatRandom(orderRoll.seed);
  const processOrder: RuntimePlayerCombatProcessOrder =
    orderRoll.value < 0.5 ? ["local-player", "opponent"] : ["opponent", "local-player"];
  const delayTicks =
    runtimePlayerCombatProcessOrderShuffleMinTicks +
    Math.floor(delayRoll.value * (runtimePlayerCombatProcessOrderShuffleMaxTicks - runtimePlayerCombatProcessOrderShuffleMinTicks + 1));
  return {
    processOrder,
    nextProcessOrderShuffleTick: tick + delayTicks,
    processOrderSeed: delayRoll.seed
  };
}

function normalizeRuntimePlayerCombatProcessOrder(
  processOrder: RuntimePlayerCombatState["processOrder"]
): RuntimePlayerCombatProcessOrder {
  if (
    processOrder?.length === 2 &&
    processOrder.includes("local-player") &&
    processOrder.includes("opponent") &&
    processOrder[0] !== processOrder[1]
  ) {
    return processOrder;
  }
  return ["local-player", "opponent"];
}

function runtimeTilePositionPair(
  attackerTile: RuntimeTile,
  defenderTile: RuntimeTile,
  tileScale?: number
): { readonly attacker: TilePosition; readonly defender: TilePosition } {
  const scale = normalizeRuntimeCombatTileScale(tileScale) ?? runtimeCombatTileScale(attackerTile, defenderTile);
  return {
    attacker: runtimeTilePosition(attackerTile, scale),
    defender: runtimeTilePosition(defenderTile, scale)
  };
}

function runtimeTilePosition(tile: RuntimeTile, scale: number): TilePosition {
  return {
    x: Math.round(tile.x / scale),
    y: Math.round(tile.z / scale),
    plane: 0
  };
}

function runtimeCombatTileScale(left: RuntimeTile, right: RuntimeTile): number {
  const coordinates = [left.x, left.z, right.x, right.z];
  const hasSceneScaledCoordinate = coordinates.some((coordinate) => Math.abs(coordinate - Math.round(coordinate)) > 0.0001);
  const dx = Math.abs(left.x - right.x);
  const dz = Math.abs(left.z - right.z);
  if (hasSceneScaledCoordinate || (dx > 0 && dx < 1) || (dz > 0 && dz < 1)) {
    return 0.5;
  }
  return 1;
}

function normalizeRuntimeCombatTileScale(tileScale: number | undefined): number | undefined {
  if (tileScale === undefined || !Number.isFinite(tileScale) || tileScale <= 0) {
    return undefined;
  }
  return tileScale;
}

function weaponProfileForRuntimeLoadout(loadoutId: RuntimeLoadoutId): WeaponTimingProfile {
  return nhWeaponProfiles[nhLoadouts[loadoutId].weaponId];
}

function weaponProfileForRuntimeActor(actor: RuntimePlayerCombatActorState): WeaponTimingProfile {
  const weaponId = weaponIdForRuntimeActor(actor);
  const profile = nhWeaponProfiles[weaponId];
  const attackType = runtimePlayerCombatAttackTypeForWeapon(weaponId, actor.attackSetIndex);
  return {
    ...profile,
    style: runtimePlayerCombatStyleForWeapon(weaponId, actor.attackSetIndex) ?? profile.style,
    // Source: PlayerCombat.preAttack() adds two tiles for AttackType.LONG_RANGED, capped by TargetRoute at 10.
    attackRange: attackType === "LONG_RANGED" ? Math.min(profile.attackRange + 2, 10) : profile.attackRange,
    cooldownTicks: runtimeWeaponCooldownTicks(profile, actor.attackSetIndex)
  };
}

function weaponProfileForRuntimeSpell(spell: RuntimePlayerCombatSpellDefinition): WeaponTimingProfile {
  return {
    id: spell.id,
    style: spell.style,
    cooldownTicks: spell.cooldownTicks,
    attackRange: spell.attackRange,
    hasVisibleSpecBar: false
  };
}

function runtimePlayerCombatAttackTypeForWeapon(
  weaponId: NhWeaponId,
  attackSetIndex: number
): RuntimePlayerCombatAttackType {
  const index = normalizeRuntimeAttackSetIndex(attackSetIndex);
  // Source: exported Nh WeaponType attackSets for WAND/STAFF_OF_DEAD, ARMADYL_CROSSBOW, WHIP, and GRANITE_MAUL.
  if (
    weaponId === "armadyl_crossbow" ||
    weaponId === "rune_crossbow" ||
    weaponId === "magic_shortbow" ||
    weaponId === "dragon_crossbow"
  ) {
    return index === 3 ? "LONG_RANGED" : index === 1 ? "RAPID_RANGED" : "ACCURATE";
  }
  if (weaponId === "tentacle_whip" || weaponId === "abyssal_whip") {
    return index === 1 ? "CONTROLLED" : index === 3 ? "DEFENSIVE" : "ACCURATE";
  }
  return index === 1 ? "AGGRESSIVE" : index === 3 ? "DEFENSIVE" : "ACCURATE";
}

export function resolveRuntimePlayerCombatAttackSetIndexForWeapon(
  weaponId: NhWeaponId,
  preferredIndex: number
): number {
  const index = normalizeRuntimeAttackSetIndex(preferredIndex);
  const validIndexes = runtimePlayerCombatAttackSetIndexesForWeapon(weaponId);
  if (validIndexes.includes(index)) {
    return index;
  }

  // Source: PlayerCombat.resolveAttackSetIndex() walks backward first, then forward, for null attackSets.
  for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
    if (validIndexes.includes(candidate)) {
      return candidate;
    }
  }
  for (let candidate = index + 1; candidate <= 3; candidate += 1) {
    if (validIndexes.includes(candidate)) {
      return candidate;
    }
  }
  return 0;
}

function runtimePlayerCombatAttackSetIndexesForWeapon(_weaponId: NhWeaponId): readonly number[] {
  if (_weaponId === "armadyl_godsword") {
    return [0, 1, 2, 3];
  }
  // Source: exported Nh WeaponType attackSets for WAND/STAFF_OF_DEAD, ARMADYL_CROSSBOW, WHIP, and GRANITE_MAUL
  // occupy children 3, 7, and 15, leaving child 11 / attack-set index 2 empty.
  return [0, 1, 3];
}

function runtimePlayerCombatStyleForWeapon(weaponId: NhWeaponId, attackSetIndex: number): CombatStyle | null {
  if (weaponId === "armadyl_godsword") {
    return normalizeRuntimeAttackSetIndex(attackSetIndex) === 2 ? "crush" : "slash";
  }
  return null;
}

function runtimePlayerCombatStyleIsMelee(style: CombatStyle): boolean {
  return style === "stab" || style === "slash" || style === "crush";
}

function pushRuntimePlayerCombatXp(
  drops: RuntimePlayerCombatXpDrop[],
  skillId: RuntimePlayerCombatXpSkillId,
  xp: number
): void {
  if (xp <= 0) {
    return;
  }
  drops.push({ skillId, xp });
}

function runtimeBotDefaultAutocastSpell(
  actorId: RuntimeActorId,
  actor: RuntimePlayerCombatActorState
): RuntimePlayerCombatSpellDefinition | null {
  if (actorId === "local-player" || actor.loadoutId !== "kodai-robes") {
    return null;
  }
  return runtimePlayerCombatSpellDefinitions["ice-barrage"];
}

function runtimeWeaponCooldownTicks(profile: WeaponTimingProfile, attackSetIndex: number): number {
  // Source: WeaponType.attackTicks plus PlayerCombat rapid-ranged one-tick reduction.
  if (profile.style === "ranged" && normalizeRuntimeAttackSetIndex(attackSetIndex) === 1) {
    return Math.max(0, profile.cooldownTicks - 1);
  }
  return profile.cooldownTicks;
}

function weaponIdForLoadout(loadoutId: RuntimeLoadoutId): NhWeaponId {
  return nhLoadouts[loadoutId].weaponId;
}

function weaponIdForEquipment(equipment: VisibleEquipment): NhWeaponId | null {
  const profileWeaponId = nhGearProfileWeaponIdForEquipment(equipment);
  if (profileWeaponId) {
    return profileWeaponId;
  }
  const weaponItemId = equipment.weapon?.itemId;
  if (weaponItemId === undefined) {
    return null;
  }

  for (const loadout of Object.values(nhLoadouts)) {
    if (loadout.equipment.weapon?.itemId === weaponItemId) {
      return loadout.weaponId;
    }
  }

  return null;
}

function weaponIdForRuntimeActor(actor: RuntimePlayerCombatActorState): NhWeaponId {
  return weaponIdForEquipment(actor.equipment) ?? weaponIdForLoadout(actor.loadoutId);
}

function runtimeAttackSequenceName(loadoutId: RuntimeLoadoutId, profile: WeaponTimingProfile): RuntimeSequenceName {
  if (profile.style === "magic") {
    return "barrage_cast";
  }
  const weaponId = profile.id;
  if (weaponId === "kodai") {
    return "wand_attack";
  }
  if (profile.style === "ranged") {
    return "crossbow_attack";
  }
  if (weaponId === "granite_maul") {
    return "gmaul_attack";
  }
  if (weaponId === "armadyl_godsword") {
    return "godsword_attack";
  }
  return "whip_attack";
}

function runtimeProjectileProfile(
  style: CombatStyle,
  specialAttack?: RuntimePlayerCombatSpecialAttackId
): RuntimePlayerCombatProjectileProfile | undefined {
  if (specialAttack === "armadyl_crossbow") {
    return projectileProfiles.armadylCrossbowSpecial;
  }
  if (style === "magic") {
    return projectileProfiles.magic;
  }
  if (style === "ranged") {
    return projectileProfiles.ranged;
  }
  return undefined;
}

function runtimeWeaponSpecialDefinition(
  weaponId: NhWeaponId
): {
  readonly id: RuntimePlayerCombatSpecialAttackId;
  readonly drainPercent: number;
  readonly accuracyMultiplier: number;
  readonly damageMultiplier: number;
  readonly sequenceName?: RuntimeSequenceName;
  readonly spotanimId?: number;
  readonly spotanimArtifactUrl?: string;
} | null {
  if (weaponId === "armadyl_crossbow") {
    return { id: "armadyl_crossbow", drainPercent: 40, accuracyMultiplier: 2, damageMultiplier: 1 };
  }
  if (weaponId === "armadyl_godsword") {
    return {
      id: "armadyl_godsword",
      drainPercent: 50,
      accuracyMultiplier: 2,
      damageMultiplier: 1.375,
      sequenceName: "ags_special",
      spotanimId: 1211,
      spotanimArtifactUrl: "render/spotanims/ags_special.glb"
    };
  }
  if (weaponId === "granite_maul") {
    return { id: "granite_maul", drainPercent: graniteMaulSpecEnergyCost, accuracyMultiplier: 1, damageMultiplier: 1 };
  }
  return null;
}

function runtimeWeaponSpecialDefinitionForActor(
  actor: RuntimePlayerCombatActorState
): ReturnType<typeof runtimeWeaponSpecialDefinition> {
  return runtimeWeaponSpecialDefinition(weaponIdForRuntimeActor(actor));
}

function runtimeSpecialAttackForNextAttack(
  actor: RuntimePlayerCombatActorState,
  specialActive: boolean
): ReturnType<typeof runtimeWeaponSpecialDefinition> {
  if (!specialActive) {
    return null;
  }
  return runtimeWeaponSpecialDefinitionForActor(actor);
}

function normalizeRuntimeAttackSetIndex(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(3, Math.trunc(value)));
}

function clampRuntimeSpecialEnergy(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.trunc(value)));
}

function clampRuntimeHitChance(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function runtimePlayerCombatProjectileDurationCycles(
  profile: RuntimePlayerCombatProjectileProfile,
  distance: number
): number {
  return profile.durationStartCycles + profile.durationIncrementCycles * Math.max(0, distance - 1);
}

export function runtimePlayerCombatProjectileClientDelayCycles(
  profile: RuntimePlayerCombatProjectileProfile,
  distance: number
): number {
  return profile.delayCycles + runtimePlayerCombatProjectileDurationCycles(profile, distance);
}

export function runtimePlayerCombatClientDelayTicks(delayCycles: number, cycleRate: number): number {
  return Math.max(1, Math.trunc((delayCycles * cycleRate) / nhServerTickMs));
}

export function runtimePlayerCombatHitDelayTicks(
  style: CombatStyle,
  distance: number,
  projectileOverride?: RuntimePlayerCombatProjectileProfile
): number {
  const projectile = projectileOverride ?? runtimeProjectileProfile(style);
  if (!projectile) {
    return 1;
  }
  return runtimePlayerCombatClientDelayTicks(
    runtimePlayerCombatProjectileClientDelayCycles(projectile, distance),
    projectile.clientCycleRate
  );
}

export function runtimePlayerCombatHealthBarEndTick(eventTick: number): number {
  return eventTick + runtimePlayerCombatClientCyclesToTicks(nhPlayerHealthBarDefinition.lifetimeCycles);
}

export function runtimePlayerCombatHitsplatEndTick(eventTick: number): number {
  return eventTick + runtimePlayerCombatClientCyclesToTicks(NH_HITSPLAT_DEFAULT_DURATION_CYCLES);
}

export function runtimePlayerCombatDistance(left: RuntimeTile, right: RuntimeTile, tileScale?: number): number {
  const tiles = runtimeTilePositionPair(left, right, tileScale);
  return chebyshevDistance(tiles.attacker, tiles.defender);
}

function runtimePlayerCombatClientCyclesToTicks(cycles: number): number {
  return Math.max(1, Math.ceil(Math.max(0, cycles) / runtimePlayerCombatClientCyclesPerGameTick));
}
