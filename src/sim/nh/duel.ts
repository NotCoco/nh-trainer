import equipmentRowsJson from "../../generated/equipment-bonuses.json";
import type {
  ClientHitsplatEvent,
  ClientHudState,
  ClientSpotanimEvent,
  ClientViewActorId,
  ClientViewEvent,
  ClientViewTick,
  ClientViewTrace,
  ClientVisibleActor,
  ClientInventory,
  EquipmentSlot,
  PrayerIcon,
  VisibleEquipment,
  VisibleEquipmentItem,
  VisibleAnimationIds
} from "../clientView";
import {
  KRONOS_HITSPLAT_DEFAULT_DURATION_CYCLES,
  KRONOS_HITSPLAT_EMPTY_SECONDARY_TYPE,
  kronosHitsplatTypeForDamage
} from "../../render/kronosHitsplats";
import { aggregateVisibleEquipmentBonuses, estimateVisibleStyleEvs, type EquipmentBonusRow } from "../equipment/equipment";
import type { BonusTable, CombatLevels, CombatStyle, StyleEvEstimate } from "../combat/formulas";
import { bestStyleByEv, styleAdvantage } from "../combat/formulas";
import { dispatchPlayerAttack, nhWeaponProfiles } from "../combat/player-combat";
import type { AttackTimerState } from "../combat/timers";
import { consumeExpiredAttackDelay, createAttackTimerState } from "../combat/timers";
import {
  consumeQueuedGmaulSpecs,
  createGmaulSpecState,
  type GmaulSpecState,
  queueGmaulSpec,
  tickGmaulQueue,
  updateGmaulEquipment
} from "../combat/gmaul";
import { applyFreeze, canMove, createEntityLockState, isFrozen, tickLocks, type EntityLockState } from "../entity/locks";
import {
  applyConsumable,
  consumableDefinitions,
  consumableUseCountForItemId,
  createSupplyDelayState,
  type ConsumableId,
  type SimStats,
  type SupplyDelayState
} from "../items/consumables";
import type { NhMovementIntent, NhOffenceStyle, NhPolicyAction, NhSupplyIntent } from "./policy-bridge";
import type { PrayerId, ProtectionPrayerId } from "../prayer/prayers";
import { activeProtectionPrayer, applyProtectionDamageReduction, compatiblePrayerSet, protectPrayerForStyle } from "../prayer/prayers";
import type { TilePosition } from "../world/movement";
import { canMeleeReachThisTick, chebyshevDistance, type MeleeReachResult } from "../world/movement";
import { createKronosClientAppearancePacket } from "../clientAppearancePacket";
import {
  nhLoadouts,
  type NhLoadoutId,
  type NhWeaponId
} from "./loadouts";
import { canonicalNhSwitchItemIds } from "./canonicalGear";
import { nhClientOffenceEv } from "./clientOffenceEv";
import { nhGearProfileAvailableSpecialWeaponKind, type NhCandidateVisibleStyle, type NhSelectedGearProfile } from "./gearProfile";

export interface NhDuelActorState {
  readonly id: ClientViewActorId;
  readonly label: string;
  readonly tile: TilePosition;
  readonly stats: SimStats;
  readonly activePrayers: readonly PrayerId[];
  readonly weaponId: NhWeaponId;
  readonly previousWeaponId: NhWeaponId;
  readonly loadoutId: NhLoadoutId;
  readonly equipment: VisibleEquipment;
  readonly gearProfile?: NhSelectedGearProfile;
  readonly candidateEquipmentByStyle?: Partial<Record<NhCandidateVisibleStyle, VisibleEquipment>>;
  readonly inventorySlots: NhInventory;
  readonly strippedEquipmentSlots: readonly EquipmentSlot[];
  readonly attackTimer: AttackTimerState;
  readonly locks: EntityLockState;
  readonly supplies: Readonly<Record<ConsumableId, number>>;
  readonly supplyDelays: SupplyDelayState;
  readonly gmaul: GmaulSpecState;
  readonly specialActive: boolean;
  readonly animationAction?: number;
  readonly movedThisTick: boolean;
  readonly lastMoveDx: number;
  readonly lastMoveDy: number;
  readonly ateFoodLastTick: boolean;
  readonly drankPotionLastTick: boolean;
  readonly lastDealtHit: number;
  readonly lastTakenHit: number;
  readonly rewardDelta: number;
  readonly rewardTotal: number;
  readonly rewardDps: number;
  readonly observedInfoKnown?: boolean;
  readonly lastOffenceStyle: NhOffenceStyle | null;
  readonly lastVisibleOpponentStyle: NhOffenceStyle | null;
}

export interface NhQueuedHit {
  readonly id: string;
  readonly dueTick: number;
  readonly attackerId: ClientViewActorId;
  readonly defenderId: ClientViewActorId;
  readonly style: CombatStyle;
  readonly rawDamage: number;
  readonly source: "weapon" | "gmaul";
  readonly freezeTicks?: number;
}

export interface NhDuelTickSummary {
  readonly tick: number;
  readonly selfAction: NhPolicyAction;
  readonly opponentAction: NhPolicyAction;
  readonly damage: Readonly<Record<ClientViewActorId, number>>;
  readonly healing: Readonly<Record<ClientViewActorId, number>>;
  readonly visibleEvents: readonly string[];
}

export interface NhDuelSummary {
  readonly ticks: number;
  readonly events: number;
  readonly damage: Readonly<Record<ClientViewActorId, number>>;
  readonly healing: Readonly<Record<ClientViewActorId, number>>;
  readonly finalHp: Readonly<Record<ClientViewActorId, number>>;
  readonly winner: ClientViewActorId | "draw" | null;
  readonly finished: boolean;
  readonly projectileEvents: number;
  readonly hitsplatEvents: number;
  readonly gmaulSpecEvents: number;
  readonly supplyActions: number;
}

export interface NhDuelState {
  readonly tick: number;
  readonly randomSeed: number;
  readonly actors: Readonly<Record<ClientViewActorId, NhDuelActorState>>;
  readonly queuedHits: readonly NhQueuedHit[];
  readonly events: readonly ClientViewEvent[];
  readonly ticks: readonly ClientViewTick[];
  readonly history: readonly NhDuelTickSummary[];
}

export interface NhDuelControllerContext {
  readonly tick: number;
  readonly self: NhDuelActorState;
  readonly opponent: NhDuelActorState;
  readonly rewardEpisodeId?: number;
  readonly rewardEpisodeActive?: boolean;
  readonly meleeReachable: boolean;
  readonly meleeReach: MeleeReachResult;
  readonly opponentMeleeReachable: boolean;
  readonly opponentMeleeReach: MeleeReachResult;
  readonly meleeAdvantage: number;
  readonly bestVisibleStyle: CombatStyle;
  readonly scriptedWantsFreeze?: boolean;
  readonly scriptedOffenceStyle?: NhOffenceStyle;
  readonly visibleStyleEvs: readonly StyleEvEstimate[];
}

export interface NhDuelController {
  readonly id: string;
  readonly chooseAction: (context: NhDuelControllerContext) => NhPolicyAction;
}

export interface NhDuelRunOptions {
  readonly ticks?: number;
  readonly seed?: number;
  readonly selfController?: NhDuelController;
  readonly opponentController?: NhDuelController;
}

const equipmentRows = equipmentRowsJson as readonly EquipmentBonusRow[];
const baseLevels: CombatLevels = {
  attack: 99,
  strength: 99,
  defence: 99,
  ranged: 99,
  magic: 99
};
const sourceAnchorIds = [
  "server-nh-policy-bridge-contract",
  "server-nh-observation-contract",
  "server-hit-queue-contract",
  "server-hit-resolution-contract",
  "server-projectile-payload-contract",
  "client-projectile-packet-lifecycle",
  "client-projectile-motion-contract",
  "client-hitsplat-packet-contract",
  "client-hitsplat-definition-contract",
  "client-hitsplat-draw-contract",
  "client-spotanim-sequence-contract",
  "server-player-attack-dispatch-contract",
  "server-granite-maul-contract",
  "server-food-lock-contract",
  "server-prayer-damage-reduction-contract",
  "server-equipment-equip-container-contract",
  "client-container-widget-update-contract",
  "client-stat-run-state-packet-contract",
  "client-widget-cs1-stat-run-value-contract",
  "client-skill-level-array-contract",
  "client-player-appearance-packet",
  "client-inventory-widget-item-draw-contract"
] as const;

const inventorySlotCount = 28;
const switchItemIds = canonicalNhSwitchItemIds;

const baseSupplyItemIds = [
  3144,
  3144,
  3144,
  3144,
  385,
  385,
  385,
  385,
  6685,
  6685,
  3024,
  3024,
  22461,
  12695
] as const;

interface KronosProjectileProfile {
  readonly gfxId: number;
  readonly startHeight: number;
  readonly endHeight: number;
  readonly delayCycles: number;
  readonly durationStartCycles: number;
  readonly durationIncrementCycles: number;
  readonly curve: number;
  readonly offset: number;
  readonly skipTravel: boolean;
}

const projectileProfiles = {
  magic: {
    gfxId: 368,
    startHeight: 43,
    endHeight: 0,
    delayCycles: 51,
    durationStartCycles: 56,
    durationIncrementCycles: 10,
    curve: 16,
    offset: 64,
    skipTravel: true
  },
  ranged: {
    gfxId: 27,
    startHeight: 38,
    endHeight: 36,
    delayCycles: 41,
    durationStartCycles: 51,
    durationIncrementCycles: 5,
    curve: 5,
    offset: 11,
    skipTravel: false
  }
} satisfies Record<Exclude<NhOffenceStyle, "melee">, KronosProjectileProfile>;

const supplyItemIds = {
  manta_ray: 391,
  shark: 385,
  anglerfish: 13441,
  karambwan: 3144,
  saradomin_brew: 6685,
  super_restore: 3024,
  sanfew_serum: 10925,
  super_combat: 12695,
  ranging_potion: 2444,
  bastion: 22461
} as const satisfies Readonly<Record<ConsumableId, number>>;

interface NhInventorySlot {
  readonly itemId: number;
  readonly quantity: number;
}

type NhInventory = readonly (NhInventorySlot | null)[];

const equipmentSwitchSlotOrder: readonly EquipmentSlot[] = [
  "head",
  "weapon",
  "body",
  "shield",
  "legs",
  "cape",
  "amulet",
  "hands",
  "feet",
  "ring",
  "ammo"
];

export const scriptedNhController: NhDuelController = {
  id: "scripted-nh-controller",
  chooseAction(context) {
    const style = chooseScriptedFallbackOffence(context);

    return {
      offenceStyle: style,
      defencePrayer: chooseScriptedFallbackDefence(context),
      movementIntent: chooseScriptedFallbackMovement(context),
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false
    };
  }
};

function chooseScriptedFallbackDefence(context: NhDuelControllerContext): ProtectionPrayerId {
  // Source: NhStakerBot.protectionPrayerFor() checks delayed likely style, then
  // delayed gear style, then keeps the current standard protection prayer.
  const likely = context.opponent.lastOffenceStyle ?? context.opponent.lastVisibleOpponentStyle;
  return likely
    ? protectPrayerForOffence(likely)
    : activeProtectionPrayer(context.self.activePrayers) ?? "protect_from_melee";
}

const inventorySwitchController: NhDuelController = {
  id: "inventory-switch-controller",
  chooseAction(context) {
    const sequence: readonly NhOffenceStyle[] = ["ranged", "magic", "melee", "ranged", "magic"];
    const offenceStyle = sequence[context.tick % sequence.length];
    return {
      offenceStyle,
      defencePrayer: chooseScriptedFallbackDefence(context),
      movementIntent: "pressure",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false
    };
  }
};

export function createInitialNhDuelState(seed = 0x4e484d): NhDuelState {
  return {
    tick: 0,
    randomSeed: seed >>> 0,
    actors: {
      self: createActor("self", "Local trainer", { x: 3094, y: 3957, plane: 0 }, "acb-hides", "ranged"),
      opponent: createActor("opponent", "NH policy bot", { x: 3098, y: 3957, plane: 0 }, "acb-hides", "magic")
    },
    queuedHits: [],
    events: [],
    ticks: [],
    history: []
  };
}

export function runNhDuel(options: NhDuelRunOptions = {}): NhDuelState {
  const totalTicks = Math.max(1, Math.trunc(options.ticks ?? 48));
  const selfController = options.selfController ?? scriptedNhController;
  const opponentController = options.opponentController ?? scriptedNhController;
  let state = createInitialNhDuelState(options.seed);

  for (let index = 0; index < totalTicks; index += 1) {
    state = tickNhDuel(state, selfController, opponentController);
  }

  return state;
}

export function createDefaultNhDuelClientViewTrace(options: NhDuelRunOptions = {}): ClientViewTrace {
  const state = runNhDuel(options);
  return nhDuelStateToClientViewTrace(
    state,
    "generated-nh-duel-v1",
    "Generated browser-side NH duel trace from the shared sim core: gear swaps, protection prayers, delayed hits, supplies, and Gmaul spec events."
  );
}

export function createInventorySwitchNhDuelClientViewTrace(): ClientViewTrace {
  const state = runNhDuel({
    ticks: 9,
    selfController: inventorySwitchController,
    opponentController: inventorySwitchController
  });
  return nhDuelStateToClientViewTrace(
    state,
    "generated-nh-inventory-switch-v1",
    "Generated NH trace that forces visible gear switches so inventory widget slots show equipment container swaps."
  );
}

export function nhDuelStateToClientViewTrace(
  state: NhDuelState,
  fixtureId = "live-nh-duel-v1",
  description =
    "Live browser-side NH duel trace from policy-shaped player input and the local bot controller."
): ClientViewTrace {
  return {
    schemaVersion: "client-view.v1",
    fixtureId,
    description,
    actors: ["self", "opponent"],
    ticks: state.ticks,
    events: state.events,
    sourceAnchorIds
  };
}

export function summarizeNhDuelState(state: NhDuelState): NhDuelSummary {
  const damage = { self: 0, opponent: 0 };
  const healing = { self: 0, opponent: 0 };
  let supplyActions = 0;

  for (const tick of state.history) {
    damage.self += tick.damage.self;
    damage.opponent += tick.damage.opponent;
    healing.self += tick.healing.self;
    healing.opponent += tick.healing.opponent;
    if (tick.selfAction.supplyIntent !== "none") {
      supplyActions += 1;
    }
    if (tick.opponentAction.supplyIntent !== "none") {
      supplyActions += 1;
    }
  }

  return {
    ticks: state.ticks.length,
    events: state.events.length,
    damage,
    healing,
    finalHp: {
      self: state.actors.self.stats.hitpoints.current,
      opponent: state.actors.opponent.stats.hitpoints.current
    },
    winner: nhDuelWinner(state),
    finished: isNhDuelFinished(state),
    projectileEvents: state.events.filter((event) => event.kind === "projectile").length,
    hitsplatEvents: state.events.filter((event) => event.kind === "hitsplat").length,
    gmaulSpecEvents: state.events.filter((event) => event.kind === "spotanim" && event.spotanimId === 340).length,
    supplyActions
  };
}

export function tickNhDuel(
  state: NhDuelState,
  selfController: NhDuelController,
  opponentController: NhDuelController
): NhDuelState {
  if (isNhDuelFinished(state)) {
    return state;
  }

  const currentTick = state.tick;
  let actors = resetTickActors(state.actors, currentTick);
  let randomSeed = state.randomSeed;
  let queuedHits: readonly NhQueuedHit[] = [...state.queuedHits];
  const events: ClientViewEvent[] = [...state.events];
  const visibleEventIds: string[] = [];
  const damage = { self: 0, opponent: 0 };
  const healing = { self: 0, opponent: 0 };

  const dueHits = queuedHits.filter((hit) => hit.dueTick <= currentTick);
  queuedHits = queuedHits.filter((hit) => hit.dueTick > currentTick);
  for (const hit of dueHits) {
    const result = applyQueuedHit(actors, hit, currentTick);
    actors = result.actors;
    damage[hit.defenderId] += result.damage;
    events.push(result.event);
    visibleEventIds.push(result.event.id);
  }

  const selfContext = createNhDuelControllerContext(currentTick, actors.self, actors.opponent);
  const opponentContext = createNhDuelControllerContext(currentTick, actors.opponent, actors.self);
  const selfAction = selfController.chooseAction(selfContext);
  const opponentAction = opponentController.chooseAction(opponentContext);

  let applied = applyActorAction(actors, currentTick, "self", selfAction, randomSeed, queuedHits);
  actors = applied.actors;
  randomSeed = applied.randomSeed;
  queuedHits = applied.queuedHits;
  events.push(...applied.events);
  visibleEventIds.push(...applied.events.map((event) => event.id));
  healing.self += applied.healed;

  applied = applyActorAction(actors, currentTick, "opponent", opponentAction, randomSeed, queuedHits);
  actors = applied.actors;
  randomSeed = applied.randomSeed;
  queuedHits = applied.queuedHits;
  events.push(...applied.events);
  visibleEventIds.push(...applied.events.map((event) => event.id));
  healing.opponent += applied.healed;

  actors = {
    self: rememberVisibleStyle(actors.self, actors.opponent.lastOffenceStyle),
    opponent: rememberVisibleStyle(actors.opponent, actors.self.lastOffenceStyle)
  };

  const tick: ClientViewTick = {
    tick: currentTick,
    eventIds: visibleEventIds,
    inventory: clientVisibleInventory(actors.self),
    hud: clientHudState(actors.self),
    actors: {
      self: clientVisibleActor(actors.self),
      opponent: clientVisibleActor(actors.opponent)
    }
  };
  actors = applyRewardObservation(actors, damage, healing);

  return {
    tick: currentTick + 1,
    randomSeed,
    actors,
    queuedHits,
    events,
    ticks: [...state.ticks, tick],
    history: [
      ...state.history,
      {
        tick: currentTick,
        selfAction,
        opponentAction,
        damage,
        healing,
        visibleEvents: visibleEventIds
      }
    ]
  };
}

export function isNhDuelFinished(state: NhDuelState): boolean {
  return state.actors.self.stats.hitpoints.current <= 0 || state.actors.opponent.stats.hitpoints.current <= 0;
}

export function nhDuelWinner(state: NhDuelState): ClientViewActorId | "draw" | null {
  const selfDead = state.actors.self.stats.hitpoints.current <= 0;
  const opponentDead = state.actors.opponent.stats.hitpoints.current <= 0;
  if (selfDead && opponentDead) {
    return "draw";
  }
  if (selfDead) {
    return "opponent";
  }
  if (opponentDead) {
    return "self";
  }
  return null;
}

function createActor(
  id: ClientViewActorId,
  label: string,
  tile: TilePosition,
  loadoutId: NhLoadoutId,
  observedOpponentStyle: NhOffenceStyle
): NhDuelActorState {
  const weaponId = nhLoadouts[loadoutId].weaponId;
  const equipment = nhLoadouts[loadoutId].equipment;
  const inventorySlots = createBaseInventorySlots(equipment);
  return {
    id,
    label,
    tile,
    stats: createBaseStats(),
    activePrayers: ["protect_from_missiles"],
    weaponId,
    previousWeaponId: weaponId,
    loadoutId,
    equipment,
    inventorySlots,
    strippedEquipmentSlots: [],
    attackTimer: createAttackTimerState(-100),
    locks: createEntityLockState(),
    supplies: createSuppliesFromInventory(inventorySlots),
    supplyDelays: createSupplyDelayState(),
    gmaul: createGmaulSpecState(100),
    specialActive: false,
    movedThisTick: false,
    lastMoveDx: 0,
    lastMoveDy: 0,
    ateFoodLastTick: false,
    drankPotionLastTick: false,
    lastDealtHit: 0,
    lastTakenHit: 0,
    rewardDelta: 0,
    rewardTotal: 0,
    rewardDps: 0,
    lastOffenceStyle: "ranged",
    lastVisibleOpponentStyle: observedOpponentStyle
  };
}

function createBaseStats(): SimStats {
  return {
    attack: { current: 99, fixed: 99 },
    strength: { current: 99, fixed: 99 },
    defence: { current: 99, fixed: 99 },
    ranged: { current: 112, fixed: 99 },
    magic: { current: 99, fixed: 99 },
    hitpoints: { current: 99, fixed: 99 },
    prayer: { current: 99, fixed: 99 }
  };
}

function createBaseInventorySlots(equipment: VisibleEquipment): NhInventory {
  const equippedItemIds = new Set(Object.values(equipment).map((item) => item.itemId));
  const switchItems = switchItemIds.filter((itemId) => !equippedItemIds.has(itemId));
  return normalizeInventorySlots(
    [...switchItems, ...baseSupplyItemIds]
      .slice(0, inventorySlotCount)
      .map((itemId) => ({ itemId, quantity: 1 }))
  );
}

function createSuppliesFromInventory(inventorySlots: NhInventory): Readonly<Record<ConsumableId, number>> {
  const supplies: Record<ConsumableId, number> = {
    manta_ray: 0,
    shark: 0,
    anglerfish: 0,
    karambwan: 0,
    saradomin_brew: 0,
    super_restore: 0,
    sanfew_serum: 0,
    super_combat: 0,
    ranging_potion: 0,
    bastion: 0
  };
  for (const slot of inventorySlots) {
    if (!slot) {
      continue;
    }
    const supply = supplyIdForItemId(slot.itemId);
    if (supply) {
      supplies[supply] += consumableUseCountForItemId(slot.itemId, slot.quantity);
    }
  }
  return supplies;
}

function supplyIdForItemId(itemId: number): ConsumableId | null {
  for (const [supply, supplyItemId] of Object.entries(supplyItemIds) as [ConsumableId, number][]) {
    if (supplyItemId === itemId) {
      return supply;
    }
  }
  return null;
}

function normalizeInventorySlots(slots: readonly (NhInventorySlot | null)[]): NhInventory {
  return Array.from({ length: inventorySlotCount }, (_, index) => {
    const slot = slots[index];
    if (!slot || slot.quantity <= 0) {
      return null;
    }
    return {
      itemId: Math.trunc(slot.itemId),
      quantity: Math.max(1, Math.trunc(slot.quantity))
    };
  });
}

function resetTickActors(
  actors: Readonly<Record<ClientViewActorId, NhDuelActorState>>,
  currentTick: number
): Readonly<Record<ClientViewActorId, NhDuelActorState>> {
  return {
    self: resetTickActor(actors.self, currentTick),
    opponent: resetTickActor(actors.opponent, currentTick)
  };
}

function resetTickActor(actor: NhDuelActorState, currentTick: number): NhDuelActorState {
  const gmaulTick = tickGmaulQueue(actor.gmaul);
  return {
    ...actor,
    locks: tickLocks(actor.locks, currentTick),
    attackTimer: consumeExpiredAttackDelay(actor.attackTimer, currentTick).state,
    gmaul: gmaulTick.state,
    specialActive: gmaulTick.state.queuedSpecs > 0 ? actor.specialActive : false,
    animationAction: undefined,
    movedThisTick: false
  };
}

export function createNhDuelControllerContext(
  tick: number,
  self: NhDuelActorState,
  opponent: NhDuelActorState,
  episode?: {
    readonly rewardEpisodeId?: number;
    readonly rewardEpisodeActive?: boolean;
    readonly scriptedWantsFreeze?: boolean;
  }
): NhDuelControllerContext {
  const meleeReach = canMeleeReachThisTick({
    attacker: self.tile,
    defender: opponent.tile,
    attackerFrozen: isFrozen(self.locks, tick)
  });
  const opponentMeleeReach = canMeleeReachThisTick({
    attacker: opponent.tile,
    defender: self.tile,
    attackerFrozen: isFrozen(opponent.locks, tick)
  });
  const evs = estimateCandidateVisibleStyleEvs(self, opponent);
  const melee = evs.find((estimate) => estimate.style === "slash");
  const best = bestStyleByEv(evs);
  const meleeAdvantage = melee ? styleAdvantage(melee, evs) : Number.NEGATIVE_INFINITY;
  const bestVisibleStyle = best?.style ?? "ranged";
  const context: NhDuelControllerContext = {
    tick,
    self,
    opponent,
    rewardEpisodeId: episode?.rewardEpisodeId,
    rewardEpisodeActive: episode?.rewardEpisodeActive,
    meleeReachable: meleeReach.canReach,
    meleeReach,
    opponentMeleeReachable: opponentMeleeReach.canReach,
    opponentMeleeReach,
    meleeAdvantage,
    bestVisibleStyle,
    scriptedWantsFreeze: episode?.scriptedWantsFreeze,
    // Source: NhStakerBot.captureObservation() encodes scriptedOffenceStyle from
    // scriptedFallbackDecision(), separately from the best visible EV bucket.
    scriptedOffenceStyle: "magic",
    visibleStyleEvs: evs
  };
  return {
    ...context,
    scriptedOffenceStyle: chooseScriptedFallbackOffence(context)
  };
}

const candidateLoadoutForVisibleStyle = {
  magic: "kodai-robes",
  ranged: "acb-hides",
  slash: "tentacle-bandos"
} as const satisfies Record<"magic" | "ranged" | "slash", NhLoadoutId>;

function estimateCandidateVisibleStyleEvs(
  self: NhDuelActorState,
  opponent: NhDuelActorState
): readonly StyleEvEstimate[] {
  const defenderEquipment = visibleEquipmentForActor(opponent);
  return (["magic", "ranged", "slash"] as const).map((style) => {
    const [estimate] = estimateVisibleStyleEvs({
      equipmentRows,
      attackerEquipment: visibleEquipmentForCandidateStyle(self, style),
      defenderEquipment,
      attackerLevels: levelsFromStats(self.stats),
      defenderLevels: levelsFromStats(opponent.stats),
      attackerPrayers: compatiblePrayerSet([...self.activePrayers, offensivePrayerForVisibleStyle(style)]),
      defenderPrayers: opponent.activePrayers,
      styles: [style],
      maxMagicDamage: self.stats.magic.current >= 94 ? 30 : 26
    });
    if (!estimate) {
      throw new Error(`missing visible EV estimate for ${style}`);
    }
    return estimate;
  });
}

function visibleEquipmentForCandidateStyle(
  actor: NhDuelActorState,
  style: "magic" | "ranged" | "slash"
): VisibleEquipment {
  const baseEquipment = actor.candidateEquipmentByStyle?.[style] ?? nhLoadouts[candidateLoadoutForVisibleStyle[style]].equipment;
  if (actor.strippedEquipmentSlots.length === 0) {
    return baseEquipment;
  }

  const equipment: Partial<Record<EquipmentSlot, VisibleEquipmentItem>> = { ...baseEquipment };
  for (const slot of actor.strippedEquipmentSlots) {
    delete equipment[slot];
  }
  return equipment;
}

function chooseScriptedFallbackOffence(context: NhDuelControllerContext): NhOffenceStyle {
  // Source: NhStakerBot.decideOffenceStyle() tries source EV first, then prayer
  // counters, delayed likely style, delayed gear style, freeze pressure, and defender weakness.
  const protectionMask = scriptedProtectionMask(context.opponent.activePrayers);
  const protectedStyle = scriptedProtectedStyleFromMask(protectionMask);
  const wantsFreeze = context.scriptedWantsFreeze ?? scriptedShouldAttemptFreeze(context, protectedStyle);
  const evStyle = scriptedBestExpectedOffenceStyle(context, wantsFreeze);
  if (evStyle) {
    return evStyle;
  }

  const protectionCounter = scriptedCounterFromProtectionMask(protectionMask, wantsFreeze);
  if (protectionCounter) {
    return protectionCounter;
  }

  const liveCounter = scriptedCounterPrayerStyle(context.opponent.lastOffenceStyle, wantsFreeze);
  if (liveCounter) {
    return liveCounter;
  }

  const gearCounter = scriptedCounterPrayerStyle(context.opponent.lastVisibleOpponentStyle, wantsFreeze);
  if (gearCounter) {
    return gearCounter;
  }

  if (wantsFreeze) {
    return "magic";
  }

  return scriptedBestOffenceAgainst(context, protectedStyle) ?? "magic";
}

function scriptedBestExpectedOffenceStyle(
  context: NhDuelControllerContext,
  wantsFreeze: boolean
): NhOffenceStyle | null {
  let bestStyle: NhOffenceStyle | null = null;
  let bestEv = 0;
  for (const style of ["magic", "ranged", "melee"] as const) {
    const ev = scriptedExpectedOffenceStyleEv(context, style, wantsFreeze);
    if (ev > bestEv) {
      bestStyle = style;
      bestEv = ev;
    }
  }
  return bestStyle;
}

function scriptedExpectedOffenceStyleEv(
  context: NhDuelControllerContext,
  style: NhOffenceStyle,
  wantsFreeze: boolean
): number {
  const ev = nhClientOffenceEv(context, style);
  return wantsFreeze && style === "magic" && ev > 0 ? ev + 0.16 : ev;
}

function scriptedBestOffenceAgainst(
  context: NhDuelControllerContext,
  protectedStyle: NhOffenceStyle | null
): NhOffenceStyle | null {
  const bonuses = aggregateVisibleEquipmentBonuses(visibleEquipmentForActor(context.opponent), equipmentRows);
  let best: NhOffenceStyle | null = null;
  let bestDefence = Number.POSITIVE_INFINITY;
  if (protectedStyle !== "magic" && bonuses.magic_defence_bonus < bestDefence) {
    best = "magic";
    bestDefence = bonuses.magic_defence_bonus;
  }
  if (protectedStyle !== "ranged" && bonuses.range_defence_bonus < bestDefence) {
    best = "ranged";
  }
  return best;
}

function scriptedShouldAttemptFreeze(
  context: NhDuelControllerContext,
  protectedStyle: NhOffenceStyle | null
): boolean {
  if (isFrozen(context.opponent.locks, context.tick)) {
    return false;
  }
  if (protectedStyle === "magic") {
    return false;
  }
  // Source: NhStakerBot.shouldAttemptFreeze() gates attempts with
  // nextFreezeAttemptTick = tick + FREEZE_RETRY_TICKS. The standalone duel
  // context is pure; the live runtime passes the exact stateful value.
  return context.tick % 6 === 0;
}

function scriptedProtectionMask(prayers: readonly PrayerId[]): number {
  let mask = 0;
  if (prayers.includes("protect_from_magic")) {
    mask |= 1;
  }
  if (prayers.includes("protect_from_missiles")) {
    mask |= 2;
  }
  if (prayers.includes("protect_from_melee")) {
    mask |= 4;
  }
  return mask;
}

function scriptedProtectedStyleFromMask(mask: number): NhOffenceStyle | null {
  if (mask === 1) {
    return "magic";
  }
  if (mask === 2) {
    return "ranged";
  }
  if (mask === 4) {
    return "melee";
  }
  return null;
}

function scriptedStyleProtectedByMask(style: NhOffenceStyle, mask: number): boolean {
  if (style === "magic") {
    return (mask & 1) !== 0;
  }
  if (style === "ranged") {
    return (mask & 2) !== 0;
  }
  return (mask & 4) !== 0;
}

function scriptedCounterPrayerStyle(style: NhOffenceStyle | null, wantsFreeze: boolean): NhOffenceStyle | null {
  if (style === "magic") {
    return "ranged";
  }
  if (style === "ranged") {
    return "magic";
  }
  if (style === "melee") {
    return wantsFreeze ? "magic" : "ranged";
  }
  return null;
}

function scriptedCounterFromProtectionMask(mask: number, wantsFreeze: boolean): NhOffenceStyle | null {
  if (mask === 1) {
    return scriptedCounterPrayerStyle("magic", wantsFreeze);
  }
  if (mask === 2) {
    return scriptedCounterPrayerStyle("ranged", wantsFreeze);
  }
  if (mask === 4) {
    return scriptedCounterPrayerStyle("melee", wantsFreeze);
  }
  if (mask === 3) {
    return "melee";
  }
  if (mask === 5) {
    return "ranged";
  }
  if (mask === 6) {
    return "magic";
  }
  return null;
}

function chooseScriptedFallbackMovement(context: NhDuelControllerContext): NhMovementIntent {
  // Source: NhStakerBot.scriptedFallbackDecision() only switches from PRESSURE to
  // STAND_UNDER when the delayed opponent is frozen, self can move, and distance is non-zero.
  return !isFrozen(context.self.locks, context.tick) &&
    isFrozen(context.opponent.locks, context.tick) &&
    chebyshevDistance(context.self.tile, context.opponent.tile) > 0
    ? "stand_under"
    : "pressure";
}

function applyActorAction(
  actors: Readonly<Record<ClientViewActorId, NhDuelActorState>>,
  currentTick: number,
  actorId: ClientViewActorId,
  action: NhPolicyAction,
  seed: number,
  queuedHits: readonly NhQueuedHit[]
): {
  readonly actors: Readonly<Record<ClientViewActorId, NhDuelActorState>>;
  readonly randomSeed: number;
  readonly queuedHits: readonly NhQueuedHit[];
  readonly events: readonly ClientViewEvent[];
  readonly healed: number;
} {
  const opponentId = otherActor(actorId);
  let actor = actors[actorId];
  let opponent = actors[opponentId];
  const events: ClientViewEvent[] = [];
  let randomSeed = seed;
  let nextQueuedHits = [...queuedHits];
  let healed = 0;

  actor = applyPrayerChoice(actor, action);
  actor = applyMovement(actor, opponent, currentTick, action.movementIntent);
  const weaponId = weaponForAction(action, actor);
  actor = equipWeapon(actor, currentTick, weaponId, visibleEquipmentForAction(actor, action, weaponId));
  const supply = applySupplyIntent(actor, opponent, currentTick, action);
  actor = supply.actor;
  healed += supply.healed;

  const attack = dispatchPlayerAttack({
    currentTick,
    attackerTile: actor.tile,
    defenderTile: opponent.tile,
    attackerFrozen: isFrozen(actor.locks, currentTick),
    locks: actor.locks,
    attackTimer: actor.attackTimer,
    weapon: nhWeaponProfiles[weaponId]
  });

  actor = {
    ...actor,
    attackTimer: attack.attackTimer,
    lastOffenceStyle: action.offenceStyle
  };

  if (attack.canAttack) {
    const hit = rollHit(actor, opponent, action.offenceStyle, randomSeed);
    randomSeed = hit.seed;
    nextQueuedHits.push({
      id: `${currentTick}-${actorId}-${action.offenceStyle}-hit`,
      dueTick: currentTick + hitDelayForStyle(action.offenceStyle),
      attackerId: actorId,
      defenderId: opponentId,
      style: combatStyleForOffence(action.offenceStyle),
      rawDamage: hit.damage,
      source: weaponId === "granite_maul" ? "gmaul" : "weapon",
      freezeTicks: action.offenceStyle === "magic" && hit.damage > 0 ? 32 : undefined
    });
    events.push(...attackStartEvents(currentTick, actorId, opponentId, actor.tile, opponent.tile, action.offenceStyle));
    actor = {
      ...actor,
      animationAction: animationForAttack(action.offenceStyle, weaponId === "granite_maul")
    };
  }

  if (action.specIntent !== "none") {
    const queued = queueGmaulSpec(actor.gmaul, currentTick, action.specIntent === "use_special_double" ? 2 : 1);
    actor = { ...actor, gmaul: queued.state, specialActive: queued.event.outcome === "queued" };
    if (queued.event.outcome === "queued") {
      const reachable = canMeleeReachThisTick({
        attacker: actor.tile,
        defender: opponent.tile,
        attackerFrozen: isFrozen(actor.locks, currentTick)
      }).canReach;
      const consumed = consumeQueuedGmaulSpecs(actor.gmaul, currentTick, {
        meleeReachable: reachable,
        attackStyle: "crush"
      });
      actor = { ...actor, gmaul: consumed.state, specialActive: false, animationAction: 1667 };
      if (consumed.event.outcome === "used") {
        events.push(gmaulSpotanimEvent(currentTick, actorId));
        for (let index = 0; index < consumed.event.count; index += 1) {
          const hit = rollHit(actor, opponent, "melee", randomSeed);
          randomSeed = hit.seed;
          nextQueuedHits.push({
            id: `${currentTick}-${actorId}-gmaul-${index}`,
            dueTick: currentTick + 1,
            attackerId: actorId,
            defenderId: opponentId,
            style: "crush",
            rawDamage: hit.damage,
            source: "gmaul"
          });
        }
      }
    }
  }

  return {
    actors: {
      ...actors,
      [actorId]: actor,
      [opponentId]: opponent
    },
    randomSeed,
    queuedHits: nextQueuedHits,
    events,
    healed
  };
}

function applyPrayerChoice(actor: NhDuelActorState, action: NhPolicyAction): NhDuelActorState {
  return {
    ...actor,
    activePrayers: compatiblePrayerSet([action.defencePrayer, offensivePrayerForStyle(action.offenceStyle)])
  };
}

function applyMovement(
  actor: NhDuelActorState,
  opponent: NhDuelActorState,
  tick: number,
  movement: NhMovementIntent
): NhDuelActorState {
  if (!canMove(actor.locks, tick)) {
    return {
      ...actor,
      lastMoveDx: 0,
      lastMoveDy: 0
    };
  }

  const tile = nextTileForMovement(actor.tile, opponent.tile, movement);
  const moved = tile.x !== actor.tile.x || tile.y !== actor.tile.y;
  return {
    ...actor,
    tile,
    lastMoveDx: tile.x - actor.tile.x,
    lastMoveDy: tile.y - actor.tile.y,
    movedThisTick: moved
  };
}

function nextTileForMovement(self: TilePosition, opponent: TilePosition, movement: NhMovementIntent): TilePosition {
  if (movement === "pressure") {
    return stepToward(self, opponent);
  }
  if (movement === "stand_under") {
    return { ...opponent };
  }
  if (movement === "step_out") {
    return stepAway(self, opponent);
  }

  const direction = directionForMovement(movement);
  return {
    ...self,
    x: self.x + direction.dx,
    y: self.y + direction.dy
  };
}

function directionForMovement(movement: NhMovementIntent): { readonly dx: number; readonly dy: number } {
  if (movement === "step_north") {
    return { dx: 0, dy: 1 };
  }
  if (movement === "step_south") {
    return { dx: 0, dy: -1 };
  }
  if (movement === "step_east") {
    return { dx: 1, dy: 0 };
  }
  if (movement === "step_west") {
    return { dx: -1, dy: 0 };
  }
  if (movement === "step_north_east") {
    return { dx: 1, dy: 1 };
  }
  if (movement === "step_north_west") {
    return { dx: -1, dy: 1 };
  }
  if (movement === "step_south_east") {
    return { dx: 1, dy: -1 };
  }
  if (movement === "step_south_west") {
    return { dx: -1, dy: -1 };
  }
  return { dx: 0, dy: 0 };
}

function stepToward(self: TilePosition, target: TilePosition): TilePosition {
  return {
    ...self,
    x: self.x + Math.sign(target.x - self.x),
    y: self.y + Math.sign(target.y - self.y)
  };
}

function stepAway(self: TilePosition, target: TilePosition): TilePosition {
  return {
    ...self,
    x: self.x - Math.sign(target.x - self.x),
    y: self.y - Math.sign(target.y - self.y)
  };
}

function applySupplyIntent(
  actor: NhDuelActorState,
  opponent: NhDuelActorState,
  currentTick: number,
  action: NhPolicyAction
): {
  readonly actor: NhDuelActorState;
  readonly healed: number;
  readonly ateFood: boolean;
  readonly drankPotion: boolean;
} {
  let next = actor;
  let healed = 0;
  let ateFood = false;
  let drankPotion = false;
  const supplyIntent = action.supplyIntent;

  if (supplyIntent === "offence_strip_one" || supplyIntent === "offence_strip_two") {
    next = stripEquipmentForOffence(
      next,
      action.offenceStyle,
      opponent.lastVisibleOpponentStyle,
      // Source: NhStakerBot.applySupplyIntent() passes opponent != null && isAggressingBot(opponent);
      // low HP is applied separately inside stripDefencePenaltyWeight().
      next.lastTakenHit > 0,
      supplyIntent === "offence_strip_two" ? 2 : 1
    );
  } else if (supplyIntent === "regear_style") {
    next = {
      ...next,
      strippedEquipmentSlots: []
    };
  }

  for (const items of supplyItemGroupsForIntent(supplyIntent)) {
    for (const item of items) {
      if (next.supplies[item] <= 0) {
        continue;
      }
      const result = applyConsumable({
        stats: next.stats,
        delays: next.supplyDelays,
        attackTimer: next.attackTimer,
        currentTick,
        item
      });
      if (!result.ok) {
        continue;
      }
      const actorWithConsumedSlot = consumeInventoryItem(next, item);
      if (!actorWithConsumedSlot) {
        continue;
      }
      const definition = consumableDefinitions[item];
      ateFood ||= definition.kind === "food" || definition.kind === "karambwan";
      drankPotion ||= definition.kind === "brew" || definition.kind === "restore" || definition.kind === "reboost";
      next = {
        ...actorWithConsumedSlot,
        stats: result.stats,
        supplyDelays: result.delays,
        attackTimer: result.attackTimer,
        supplies: {
          ...next.supplies,
          [item]: next.supplies[item] - 1
        }
      };
      healed += result.healed;
      break;
    }
  }
  return {
    actor: {
      ...next,
      ateFoodLastTick: ateFood,
      drankPotionLastTick: drankPotion
    },
    healed,
    ateFood,
    drankPotion
  };
}

function consumeInventoryItem(actor: NhDuelActorState, item: ConsumableId): NhDuelActorState | null {
  const itemId = supplyItemIds[item];
  const inventorySlots = [...actor.inventorySlots];
  const slotIndex = inventorySlots.findIndex((slot) => slot?.itemId === itemId && slot.quantity > 0);
  if (slotIndex === -1) {
    return null;
  }

  const slot = inventorySlots[slotIndex];
  inventorySlots[slotIndex] = slot && slot.quantity > 1 ? { ...slot, quantity: slot.quantity - 1 } : null;

  return {
    ...actor,
    inventorySlots: normalizeInventorySlots(inventorySlots)
  };
}

function supplyItemGroupsForIntent(supplyIntent: NhSupplyIntent): readonly (readonly ConsumableId[])[] {
  if (supplyIntent === "safe_eat") {
    return [["manta_ray", "shark"]];
  }
  if (supplyIntent === "double_eat") {
    return [["manta_ray", "shark"], ["karambwan"]];
  }
  if (supplyIntent === "triple_eat" || supplyIntent === "panic_full") {
    return [["manta_ray", "shark"], ["saradomin_brew"], ["karambwan"]];
  }
  if (supplyIntent === "brew_only") {
    return [["saradomin_brew"]];
  }
  if (supplyIntent === "restore_reboost") {
    // Source: NhStakerBot.RESTORE_IDS includes super restores before sanfews, and
    // drinkReboostPotionsDetailed() tries bastion/ranging before super-combat.
    return [["super_restore", "sanfew_serum"], ["bastion", "ranging_potion"], ["super_combat"]];
  }
  return [];
}

// Source: NhStakerBot.OFFENCE_STRIP_SLOTS.
const offenceStripSlots: readonly EquipmentSlot[] = ["shield", "body", "legs", "head", "cape", "amulet", "hands", "feet"];
const offenceStripMinImprovement = 0.09;

function stripEquipmentForOffence(
  actor: NhDuelActorState,
  style: NhOffenceStyle,
  threatStyle: NhOffenceStyle | null,
  underPressure: boolean,
  maxPieces: number
): NhDuelActorState {
  let strippedSlots = [...actor.strippedEquipmentSlots];
  for (let count = 0; count < Math.max(0, Math.trunc(maxPieces)); count += 1) {
    const candidate = bestOffenceStripCandidate({ ...actor, strippedEquipmentSlots: strippedSlots }, style, threatStyle, underPressure);
    if (!candidate || candidate.netGain <= offenceStripMinImprovement) {
      break;
    }
    strippedSlots = [...strippedSlots, candidate.slot];
  }

  return {
    ...actor,
    strippedEquipmentSlots: strippedSlots
  };
}

function bestOffenceStripCandidate(
  actor: NhDuelActorState,
  style: NhOffenceStyle,
  threatStyle: NhOffenceStyle | null,
  underPressure: boolean
): { readonly slot: EquipmentSlot; readonly netGain: number } | null {
  const currentEquipment = visibleEquipmentForActor(actor);
  const currentBonuses = aggregateVisibleEquipmentBonuses(currentEquipment, equipmentRows);
  const currentOffence = offensiveScoreForStyle(style, currentBonuses);
  const currentDefence = defenceScoreAgainstThreat(threatStyle, currentBonuses);
  const defenceWeight = stripDefencePenaltyWeight(threatStyle, underPressure, actor.stats.hitpoints.current);
  let best: { readonly slot: EquipmentSlot; readonly netGain: number } | null = null;

  for (const slot of offenceStripSlots) {
    if (actor.strippedEquipmentSlots.includes(slot) || !currentEquipment[slot]) {
      continue;
    }
    const withoutEquipment = { ...currentEquipment };
    delete withoutEquipment[slot];
    const withoutBonuses = aggregateVisibleEquipmentBonuses(withoutEquipment, equipmentRows);
    const offenceGain = offensiveScoreForStyle(style, withoutBonuses) - currentOffence;
    const defenceLoss = Math.max(0, currentDefence - defenceScoreAgainstThreat(threatStyle, withoutBonuses));
    const netGain = offenceGain - defenceLoss * defenceWeight;
    if (netGain > offenceStripMinImprovement && (!best || netGain > best.netGain)) {
      best = { slot, netGain };
    }
  }

  return best;
}

function offensiveScoreForStyle(style: NhOffenceStyle, bonuses: BonusTable): number {
  if (style === "magic") {
    return bonuses.magic_attack_bonus + 2 * bonuses.magic_damage_bonus;
  }
  if (style === "ranged") {
    return bonuses.range_attack_bonus + 1.8 * bonuses.ranged_strength_bonus;
  }
  return Math.max(bonuses.stab_attack_bonus, bonuses.slash_attack_bonus, bonuses.crush_attack_bonus) +
    1.8 * bonuses.melee_strength_bonus;
}

function defenceScoreAgainstThreat(style: NhOffenceStyle | null, bonuses: BonusTable): number {
  if (style === null) {
    return 0;
  }
  if (style === "magic") {
    return bonuses.magic_defence_bonus;
  }
  if (style === "ranged") {
    return bonuses.range_defence_bonus;
  }
  return Math.max(bonuses.stab_defence_bonus, bonuses.slash_defence_bonus, bonuses.crush_defence_bonus);
}

function stripDefencePenaltyWeight(style: NhOffenceStyle | null, underPressure: boolean, hp: number): number {
  let weight = style ? (underPressure ? 1.04 : 0.62) : 0.3;
  if (hp <= 45) {
    weight *= 1.3;
  } else if (hp <= 65) {
    weight *= 1.15;
  }
  return weight;
}

function equipWeapon(
  actor: NhDuelActorState,
  currentTick: number,
  weaponId: NhWeaponId,
  targetEquipment: VisibleEquipment
): NhDuelActorState {
  const previousWeapon = nhWeaponProfiles[actor.weaponId];
  const gmaul = updateGmaulEquipment(actor.gmaul, currentTick, {
    equippedGraniteMaul: weaponId === "granite_maul",
    previousWeaponHadVisibleSpecBar: previousWeapon.hasVisibleSpecBar
  });
  const loadout = loadoutForWeaponId(weaponId);
  const equipped = equipVisibleEquipment(actor, targetEquipment);

  return {
    ...equipped,
    previousWeaponId: actor.weaponId,
    weaponId,
    loadoutId: loadout,
    strippedEquipmentSlots: [],
    gmaul
  };
}

function visibleEquipmentForWeaponId(weaponId: NhWeaponId): VisibleEquipment {
  return nhLoadouts[loadoutForWeaponId(weaponId)].equipment;
}

function visibleEquipmentForAction(
  actor: NhDuelActorState,
  action: NhPolicyAction,
  weaponId: NhWeaponId
): VisibleEquipment {
  if (action.specIntent !== "none") {
    return visibleEquipmentForWeaponId(weaponId);
  }
  const candidateStyle: NhCandidateVisibleStyle = action.offenceStyle === "melee" ? "slash" : action.offenceStyle;
  return actor.candidateEquipmentByStyle?.[candidateStyle] ?? visibleEquipmentForWeaponId(weaponId);
}

function loadoutForWeaponId(weaponId: NhWeaponId): NhLoadoutId {
  if (weaponId === "kodai" || weaponId === "ancient_staff" || weaponId === "staff_of_the_dead") {
    return "kodai-robes";
  }
  if (
    weaponId === "armadyl_crossbow" ||
    weaponId === "rune_crossbow" ||
    weaponId === "magic_shortbow" ||
    weaponId === "dragon_crossbow"
  ) {
    return "acb-hides";
  }
  if (weaponId === "granite_maul") {
    return "gmaul-bandos";
  }
  if (weaponId === "armadyl_godsword") {
    return "ags-bandos";
  }
  return "tentacle-bandos";
}

function equipVisibleEquipment(actor: NhDuelActorState, targetEquipment: VisibleEquipment): NhDuelActorState {
  let inventorySlots = normalizeInventorySlots(actor.inventorySlots);
  const equipment: Partial<Record<EquipmentSlot, VisibleEquipmentItem>> = { ...actor.equipment };

  for (const slot of equipmentSwitchSlotOrder) {
    const targetItem = targetEquipment[slot];
    if (!targetItem || equipment[slot]?.itemId === targetItem.itemId) {
      continue;
    }

    const inventorySlotIndex = inventorySlots.findIndex((inventorySlot) => inventorySlot?.itemId === targetItem.itemId);
    if (inventorySlotIndex === -1) {
      continue;
    }

    const wornItem = equipment[slot];
    const nextInventorySlots = [...inventorySlots];
    nextInventorySlots[inventorySlotIndex] = wornItem ? { itemId: wornItem.itemId, quantity: 1 } : null;
    inventorySlots = normalizeInventorySlots(nextInventorySlots);
    equipment[slot] = targetItem;
  }

  return {
    ...actor,
    equipment,
    inventorySlots
  };
}

function rollHit(
  attacker: NhDuelActorState,
  defender: NhDuelActorState,
  offence: NhOffenceStyle,
  seed: number
): { readonly damage: number; readonly seed: number } {
  let nextSeed = seed;
  const ev = estimateVisibleStyleEvs({
    equipmentRows,
    attackerEquipment: visibleEquipmentForActor(attacker),
    defenderEquipment: visibleEquipmentForActor(defender),
    attackerLevels: levelsFromStats(attacker.stats),
    defenderLevels: levelsFromStats(defender.stats),
    attackerPrayers: attacker.activePrayers,
    defenderPrayers: defender.activePrayers,
    styles: [combatStyleForOffence(offence)],
    maxMagicDamage: attacker.stats.magic.current >= 94 ? 30 : 26
  })[0];
  const hitRoll = nextRandom(nextSeed);
  nextSeed = hitRoll.seed;
  if (hitRoll.value > ev.hitChance) {
    return { damage: 0, seed: nextSeed };
  }

  const damageRoll = nextRandom(nextSeed);
  nextSeed = damageRoll.seed;
  const damage = Math.max(0, Math.floor(damageRoll.value * (ev.maxDamage + 1)));
  return {
    damage,
    seed: nextSeed
  };
}

function applyQueuedHit(
  actors: Readonly<Record<ClientViewActorId, NhDuelActorState>>,
  hit: NhQueuedHit,
  currentTick: number
): { readonly actors: Readonly<Record<ClientViewActorId, NhDuelActorState>>; readonly damage: number; readonly event: ClientHitsplatEvent } {
  const attacker = actors[hit.attackerId];
  const defender = actors[hit.defenderId];
  const reducedDamage = applyProtectionDamageReduction({
    damage: hit.rawDamage,
    attackStyle: hit.style,
    defenderPrayers: defender.activePrayers,
    attackerIsPlayer: true
  });
  const damage = Math.min(defender.stats.hitpoints.current, reducedDamage);
  let nextDefender = {
    ...defender,
    stats: {
      ...defender.stats,
      hitpoints: {
        ...defender.stats.hitpoints,
        current: Math.max(0, defender.stats.hitpoints.current - damage)
      }
    },
    lastTakenHit: damage
  };

  if (hit.freezeTicks && damage > 0) {
    nextDefender = {
      ...nextDefender,
      locks: applyFreeze(nextDefender.locks, currentTick, hit.freezeTicks, hit.attackerId)
    };
  }

  return {
    actors: {
      ...actors,
      [hit.attackerId]: {
        ...attacker,
        lastDealtHit: damage
      },
      [hit.defenderId]: nextDefender
    },
    damage,
    event: hitsplatEvent(hit.id, currentTick, hit.defenderId, damage)
  };
}

function applyRewardObservation(
  actors: Readonly<Record<ClientViewActorId, NhDuelActorState>>,
  damage: Readonly<Record<ClientViewActorId, number>>,
  healing: Readonly<Record<ClientViewActorId, number>>
): Readonly<Record<ClientViewActorId, NhDuelActorState>> {
  const selfReward = rewardDelta(damage.opponent, damage.self, healing.self);
  const opponentReward = rewardDelta(damage.self, damage.opponent, healing.opponent);
  return {
    self: applyActorRewardObservation(actors.self, selfReward),
    opponent: applyActorRewardObservation(actors.opponent, opponentReward)
  };
}

function applyActorRewardObservation(actor: NhDuelActorState, rewardDeltaValue: number): NhDuelActorState {
  const rewardTotal = actor.rewardTotal + rewardDeltaValue;
  return {
    ...actor,
    rewardDelta: rewardDeltaValue,
    rewardTotal,
    rewardDps: actor.lastDealtHit
  };
}

function rewardDelta(damageDealt: number, damageTaken: number, healed: number): number {
  return damageDealt - damageTaken + healed * 0.18;
}

function attackStartEvents(
  tick: number,
  sourceActorId: ClientViewActorId,
  targetActorId: ClientViewActorId,
  sourceTile: TilePosition,
  targetTile: TilePosition,
  offence: NhOffenceStyle
): readonly ClientViewEvent[] {
  if (offence === "melee") {
    return [];
  }
  const profile = projectileProfiles[offence];
  const startTile = profile.skipTravel ? targetTile : sourceTile;
  const durationCycles = projectileDuration(profile, sourceTile, targetTile);
  return [
    {
      id: `${tick}-${sourceActorId}-${offence}-projectile`,
      kind: "projectile",
      observedTick: tick,
      visibleWindow: { firstTick: tick + profile.delayCycles, lastTick: tick + durationCycles },
      sourceActorId,
      targetActorId,
      projectileId: profile.gfxId,
      targetIndex: playerTargetIndex(targetActorId),
      startTile,
      targetTile,
      startHeight: profile.startHeight,
      endHeight: profile.endHeight,
      delayCycles: profile.delayCycles,
      durationCycles,
      curve: profile.curve,
      offset: profile.offset,
      skipTravel: profile.skipTravel
    }
  ];
}

function projectileDuration(
  profile: KronosProjectileProfile,
  startTile: TilePosition,
  targetTile: TilePosition
): number {
  const distance = chebyshevDistance(startTile, targetTile);
  return profile.durationStartCycles + profile.durationIncrementCycles * Math.max(0, distance - 1);
}

function playerTargetIndex(actorId: ClientViewActorId): number {
  return actorId === "self" ? -1 : -2;
}

function hitsplatEvent(
  id: string,
  tick: number,
  targetActorId: ClientViewActorId,
  amount: number
): ClientHitsplatEvent {
  const primaryType = kronosHitsplatTypeForDamage(amount);
  return {
    id: `${id}-hitsplat`,
    kind: "hitsplat",
    observedTick: tick,
    visibleWindow: { firstTick: tick, lastTick: tick + KRONOS_HITSPLAT_DEFAULT_DURATION_CYCLES },
    targetActorId,
    primaryType,
    primaryValue: Math.max(0, amount),
    secondaryType: KRONOS_HITSPLAT_EMPTY_SECONDARY_TYPE,
    secondaryValue: 0,
    delayCycles: 0,
    slotIndex: 0,
    definitionDurationCycles: KRONOS_HITSPLAT_DEFAULT_DURATION_CYCLES,
    expiresOnClientCycle: tick + KRONOS_HITSPLAT_DEFAULT_DURATION_CYCLES
  };
}

function gmaulSpotanimEvent(tick: number, actorId: ClientViewActorId): ClientSpotanimEvent {
  return {
    id: `${tick}-${actorId}-gmaul-spotanim`,
    kind: "spotanim",
    observedTick: tick,
    visibleWindow: { firstTick: tick, lastTick: tick + 1 },
    actorId,
    spotanimId: 340
  };
}

function clientVisibleActor(actor: NhDuelActorState): ClientVisibleActor {
  const visibleEquipment = visibleEquipmentForActor(actor);
  const visiblePrayer = prayerIcon(actor.activePrayers);
  const skullIcon = "white_pk";

  return {
    actorId: actor.id,
    tile: actor.tile,
    equipment: visibleEquipment,
    appearancePacket: createKronosClientAppearancePacket({
      equipment: visibleEquipment,
      prayerIcon: visiblePrayer,
      skullIcon,
      username: actor.label
    }),
    animations: visibleAnimations(actor),
    overheadPrayer: visiblePrayer,
    skullIcon,
    healthRatio: visibleHealthRatio(actor.stats.hitpoints.current, actor.stats.hitpoints.fixed)
  };
}

function clientVisibleInventory(actor: NhDuelActorState): ClientInventory {
  return normalizeInventorySlots(actor.inventorySlots).map((slot) => {
    if (!slot) {
      return { widgetItemId: 0, quantity: 0 };
    }
    return { widgetItemId: slot.itemId + 1, quantity: slot.quantity };
  });
}

function clientHudState(actor: NhDuelActorState): ClientHudState {
  return {
    hitpoints: {
      current: actor.stats.hitpoints.current,
      fixed: actor.stats.hitpoints.fixed
    },
    prayer: {
      current: actor.stats.prayer.current,
      fixed: actor.stats.prayer.fixed
    },
    runEnergy: 100,
    specialEnergy: actor.gmaul.specialEnergy,
    specialActive: actor.specialActive,
    attackSet: 0,
    autoRetaliate: true,
    weaponTypeConfig:
      actor.equipment.weapon?.itemId === 4153
        ? 2
        : actor.equipment.weapon?.itemId === 11785
          ? 5
          : actor.equipment.weapon?.itemId === 12006
            ? 20
            : 18,
    autocast: 0,
    defensiveCast: false,
    skills: {
      attack: actor.stats.attack,
      strength: actor.stats.strength,
      defence: actor.stats.defence,
      ranged: actor.stats.ranged,
      magic: actor.stats.magic,
      hitpoints: actor.stats.hitpoints,
      prayer: actor.stats.prayer
    }
  };
}

function visibleHealthRatio(current: number, maximum: number): number {
  if (maximum <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, current / maximum));
}

function visibleEquipmentForActor(actor: NhDuelActorState): VisibleEquipment {
  const baseEquipment = actor.equipment;
  if (actor.strippedEquipmentSlots.length === 0) {
    return baseEquipment;
  }

  const equipment: Partial<Record<EquipmentSlot, VisibleEquipmentItem>> = { ...baseEquipment };
  for (const slot of actor.strippedEquipmentSlots) {
    delete equipment[slot];
  }
  return equipment;
}

function visibleAnimations(actor: NhDuelActorState): VisibleAnimationIds {
  return {
    pose: 808,
    movement: actor.movedThisTick ? 819 : 808,
    action: actor.animationAction
  };
}

function prayerIcon(prayers: readonly PrayerId[]): PrayerIcon {
  const protection = activeProtectionPrayer(prayers);
  return protection ?? (prayers.includes("smite") ? "smite" : "none");
}

function levelsFromStats(stats: SimStats): CombatLevels {
  return {
    attack: stats.attack.current,
    strength: stats.strength.current,
    defence: stats.defence.current,
    ranged: stats.ranged.current,
    magic: stats.magic.current
  };
}

function protectPrayerForOffence(offence: NhOffenceStyle | null): ProtectionPrayerId {
  return offence ? protectPrayerForStyle(combatStyleForOffence(offence)) : "protect_from_melee";
}

function offensivePrayerForStyle(style: NhOffenceStyle): PrayerId {
  if (style === "magic") {
    return "augury";
  }
  if (style === "ranged") {
    return "rigour";
  }
  return "piety";
}

function offensivePrayerForVisibleStyle(style: "magic" | "ranged" | "slash"): PrayerId {
  return style === "slash" ? offensivePrayerForStyle("melee") : offensivePrayerForStyle(style);
}

function weaponForAction(action: NhPolicyAction, actor: NhDuelActorState): NhWeaponId {
  if (action.specIntent !== "none") {
    return actor.gearProfile ? nhGearProfileAvailableSpecialWeaponKind(actor.gearProfile) ?? "granite_maul" : "granite_maul";
  }
  if (action.offenceStyle === "magic") {
    return actor.gearProfile?.magicWeaponId ?? "kodai";
  }
  if (action.offenceStyle === "ranged") {
    return actor.gearProfile?.rangedWeaponId ?? "armadyl_crossbow";
  }
  return actor.gearProfile?.meleeWeaponId ?? "tentacle_whip";
}

function combatStyleForOffence(style: NhOffenceStyle): CombatStyle {
  if (style === "magic") {
    return "magic";
  }
  if (style === "ranged") {
    return "ranged";
  }
  return "slash";
}

function animationForAttack(style: NhOffenceStyle, graniteMaul: boolean): number {
  if (graniteMaul) {
    return 1667;
  }
  if (style === "magic") {
    return 1979;
  }
  if (style === "ranged") {
    return 4230;
  }
  return 1658;
}

function hitDelayForStyle(style: NhOffenceStyle): number {
  return style === "melee" ? 1 : 2;
}

function rememberVisibleStyle(actor: NhDuelActorState, opponentStyle: NhOffenceStyle | null): NhDuelActorState {
  return {
    ...actor,
    lastVisibleOpponentStyle: opponentStyle
  };
}

function otherActor(actorId: ClientViewActorId): ClientViewActorId {
  return actorId === "self" ? "opponent" : "self";
}

function nextRandom(seed: number): { readonly seed: number; readonly value: number } {
  const nextSeed = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
  return {
    seed: nextSeed,
    value: nextSeed / 0xffffffff
  };
}
