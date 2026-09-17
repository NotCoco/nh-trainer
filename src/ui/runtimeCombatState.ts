// Extracted from the production runtime; shared helpers keep their existing behavior.
import {
  type RuntimePlayerCombatState,
  type SimStats,
  type RuntimePlayerCombatActorState,
  type PrayerId,
  type RuntimePlayerCombatSpellId,
  type CombatLevels,
  runtimePlayerCombatDefaultLevels
} from "../sim";
import {
  type RuntimeActorId,
  type RuntimeInventorySlot,
  type RuntimeTile,
  type RuntimeLoadoutId,
  type RuntimeHudState
} from "../render/runtimeScene";
import {
  type EquipmentSlot,
  type VisibleEquipment,
  type VisibleEquipmentItem
} from "../sim/clientView";
import {
  type RuntimeEquipmentItemIdsBySlot
} from "./runtimeSetupPresets";
import {
  type NhInventoryItemDefinitionStore
} from "../render/nhInventory";
import {
  type EntityLockState,
  createEntityLockState,
  resetFreeze
} from "../sim/entity/locks";
import {
  NH_TILE_WORLD_UNITS
} from "../render/nhTileMovement";
import {
  type ManualActorState
} from "./runtimeMovement";
import {
  nhLoadouts
} from "../sim/nh/loadouts";
import {
  type NhSelectedSpell
} from "../render/nhSceneObjects";


export function runtimePolicyRecentManualCombatSignal(state: RuntimePlayerCombatState): boolean {
  const earliestTick = state.tick - 12;
  return state.events.some((event) => {
    if (event.tick < earliestTick) {
      return false;
    }
    if (event.kind === "attack") {
      return runtimePolicyManualCombatPair(event.attackerId, event.defenderId);
    }
    if (event.kind === "hitsplat") {
      return runtimePolicyManualCombatPair(event.attackerId, event.targetActorId);
    }
    return false;
  });
}


export function runtimePolicyRecentManualIncomingPressureSignal(state: RuntimePlayerCombatState): boolean {
  const earliestTick = state.tick - 12;
  return state.events.some((event) => {
    if (event.tick < earliestTick) {
      return false;
    }
    if (event.kind === "attack") {
      return event.attackerId === "local-player" && event.defenderId === "opponent";
    }
    if (event.kind === "hitsplat") {
      return event.attackerId === "local-player" && event.targetActorId === "opponent";
    }
    return false;
  });
}


export function runtimePolicyRecentManualDirectCombatSignal(state: RuntimePlayerCombatState): boolean {
  const earliestTick = state.tick - 2;
  return state.events.some((event) => {
    if (event.tick < earliestTick) {
      return false;
    }
    if (event.kind === "attack") {
      return runtimePolicyManualCombatPair(event.attackerId, event.defenderId);
    }
    if (event.kind === "hitsplat") {
      return runtimePolicyManualCombatPair(event.attackerId, event.targetActorId);
    }
    return false;
  });
}


export function runtimePolicyManualCombatPair(attackerId: RuntimeActorId, defenderId: RuntimeActorId): boolean {
  return (
    (attackerId === "local-player" && defenderId === "opponent") ||
    (attackerId === "opponent" && defenderId === "local-player")
  );
}


export const nhEquipmentSlotByServerSlot = new Map<number, EquipmentSlot>([
  [0, "head"],
  [1, "cape"],
  [2, "amulet"],
  [3, "weapon"],
  [4, "body"],
  [5, "shield"],
  [7, "legs"],
  [9, "hands"],
  [10, "feet"],
  [12, "ring"],
  [13, "ammo"]
]);


export function visibleEquipmentFromRuntimeItemIdsBySlot(
  equipmentBySlot: RuntimeEquipmentItemIdsBySlot,
  itemDefinitions: NhInventoryItemDefinitionStore
): VisibleEquipment {
  const equipment: Partial<Record<EquipmentSlot, { readonly itemId: number; readonly name: string }>> = {};
  for (const [serverSlot, itemId] of equipmentBySlot) {
    const slot = nhEquipmentSlotByServerSlot.get(serverSlot);
    if (!slot) {
      continue;
    }
    equipment[slot] = {
      itemId,
      name: itemDefinitions.get(itemId)?.name ?? `Item ${itemId}`
    };
  }
  return equipment;
}


export function visibleEquipmentItemsFromRuntimeInventory(
  slots: readonly (RuntimeInventorySlot | null)[] | null | undefined,
  itemDefinitions: NhInventoryItemDefinitionStore
): readonly VisibleEquipmentItem[] {
  if (!slots) {
    return [];
  }
  const items: VisibleEquipmentItem[] = [];
  for (const slot of slots) {
    if (!slot || slot.itemId <= 0 || slot.quantity <= 0) {
      continue;
    }
    items.push({
      itemId: slot.itemId,
      name: itemDefinitions.get(slot.itemId)?.name ?? `Item ${slot.itemId}`
    });
  }
  return items;
}


export interface ManualPolicyActorMovementView {
  readonly movedThisTick: boolean;
  readonly lastMoveDx: number;
  readonly lastMoveDy: number;
}


export const manualPolicyStationaryMovementView: ManualPolicyActorMovementView = {
  movedThisTick: false,
  lastMoveDx: 0,
  lastMoveDy: 0
};


export function nhClientVisibleOpponentHp(hitpoints: number): number {
  const hp = Math.max(0, Math.min(99, Math.trunc(Number.isFinite(hitpoints) ? hitpoints : 99)));
  if (hp <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(99, Math.trunc((hp + 2) / 5) * 5));
}


export function nhClientVisibleFreezeTicks(locks: EntityLockState, tick: number): number {
  if (locks.freezeUntilTick < tick) {
    return 0;
  }
  const ticks = Math.max(0, locks.freezeUntilTick - tick);
  if (ticks <= 0) {
    return 0;
  }
  return Math.max(1, Math.trunc((ticks + 2) / 5) * 5);
}


export function runtimePolicyVisibleStatFromLevel(value: number): SimStats["attack"] {
  const level = Math.max(1, Math.trunc(Number.isFinite(value) ? value : 99));
  return {
    current: level,
    fixed: 99
  };
}


export function runtimePolicyVisibleStatsFromCombatActor(actor: RuntimePlayerCombatActorState): SimStats {
  return {
    attack: runtimePolicyVisibleStatFromLevel(actor.levels.attack),
    strength: runtimePolicyVisibleStatFromLevel(actor.levels.strength),
    defence: runtimePolicyVisibleStatFromLevel(actor.levels.defence),
    ranged: runtimePolicyVisibleStatFromLevel(actor.levels.ranged),
    magic: runtimePolicyVisibleStatFromLevel(actor.levels.magic),
    hitpoints: {
      current: nhClientVisibleOpponentHp(actor.hitpoints),
      fixed: Math.max(1, Math.min(99, Math.trunc(Number.isFinite(actor.maxHitpoints) ? actor.maxHitpoints : 99)))
    },
    prayer: {
      current: Math.max(0, Math.min(99, Math.trunc(Number.isFinite(actor.prayerPoints) ? actor.prayerPoints : 99))),
      fixed: Math.max(1, Math.min(99, Math.trunc(Number.isFinite(actor.maxPrayerPoints) ? actor.maxPrayerPoints : 99)))
    }
  };
}


export function runtimePolicyVisibleLocksFromCombatActor(
  actor: RuntimePlayerCombatActorState,
  tick: number
): EntityLockState {
  const visibleFreezeTicks = nhClientVisibleFreezeTicks(actor.locks, tick);
  if (visibleFreezeTicks <= 0) {
    const { freezeSourceId: _freezeSourceId, ...locks } = actor.locks;
    return {
      ...locks,
      freezeUntilTick: -1
    };
  }
  return {
    ...actor.locks,
    freezeUntilTick: tick + visibleFreezeTicks
  };
}


export function runtimePolicyLocksFrozenAtTick(locks: EntityLockState, tick: number): boolean {
  return locks.freezeUntilTick >= tick;
}


export function manualPolicyActorMovementViewFromTiles(
  sourceTile: RuntimeTile,
  destinationTile: RuntimeTile,
  moving: boolean
): ManualPolicyActorMovementView {
  if (!moving) {
    return manualPolicyStationaryMovementView;
  }
  // Source: NhStakerBot.captureObservation() stores getPosition() - getLastPosition() in tile units.
  return {
    movedThisTick: true,
    lastMoveDx: Math.round((destinationTile.x - sourceTile.x) / NH_TILE_WORLD_UNITS),
    lastMoveDy: Math.round((destinationTile.z - sourceTile.z) / NH_TILE_WORLD_UNITS)
  };
}


export function manualPolicyActorAppearanceView(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState,
  tick: number,
  equipmentOverride: RuntimeEquipmentItemIdsBySlot | null,
  itemDefinitions: NhInventoryItemDefinitionStore,
  activePrayers: readonly PrayerId[] = [],
  movement: ManualPolicyActorMovementView = manualPolicyStationaryMovementView,
  inventorySlots?: readonly (RuntimeInventorySlot | null)[] | null
): ManualPolicyActorAppearanceView {
  return {
    tile: actor.tile,
    loadoutId: actor.loadoutId,
    equipment: equipmentOverride ? visibleEquipmentFromRuntimeItemIdsBySlot(equipmentOverride, itemDefinitions) : nhLoadouts[actor.loadoutId].equipment,
    inventoryItems: visibleEquipmentItemsFromRuntimeInventory(inventorySlots, itemDefinitions),
    inventorySlots: inventorySlots ?? [],
    activePrayers: [...activePrayers],
    stats: runtimePolicyVisibleStatsFromCombatActor(combatActor),
    locks: runtimePolicyVisibleLocksFromCombatActor(combatActor, tick),
    attackTimer: combatActor.attackTimer,
    movedThisTick: movement.movedThisTick,
    lastMoveDx: movement.lastMoveDx,
    lastMoveDy: movement.lastMoveDy,
    lastVengeanceTrinketCastTick: combatActor.lastVengeanceTrinketCastTick,
    vengeanceTrinketCasts: combatActor.vengeanceTrinketCasts,
    observedInfoKnown: true
  };
}


export function manualPolicyUnknownOpponentInfoAppearanceView(
  previous: ManualPolicyActorAppearanceView
): ManualPolicyActorAppearanceView {
  return {
    ...previous,
    tile: {
      x: -NH_TILE_WORLD_UNITS,
      z: -NH_TILE_WORLD_UNITS
    },
    equipment: {},
    inventoryItems: [],
    inventorySlots: [],
    activePrayers: [],
    stats: {
      ...previous.stats,
      hitpoints: {
        ...previous.stats.hitpoints,
        current: -1
      },
      prayer: {
        ...previous.stats.prayer,
        current: 0
      }
    },
    locks: createEntityLockState(),
    movedThisTick: false,
    lastMoveDx: 0,
    lastMoveDy: 0,
    lastVengeanceTrinketCastTick: -1,
    vengeanceTrinketCasts: 0,
    observedInfoKnown: false
  };
}


export function runtimePlayerCombatStateWithLocalSpecialEnergy(
  state: RuntimePlayerCombatState,
  specialEnergy: number
): RuntimePlayerCombatState {
  const actor = state.actors["local-player"];
  const clampedSpecialEnergy = Math.max(0, Math.min(100, Math.trunc(specialEnergy)));
  return {
    ...state,
    actors: {
      ...state.actors,
      "local-player": {
        ...actor,
        specialRestoreTicks: 0,
        gmaul: {
          ...actor.gmaul,
          specialEnergy: clampedSpecialEnergy
        }
      }
    }
  };
}


export function runtimePlayerCombatStateWithLocalFreezeBypass(state: RuntimePlayerCombatState): RuntimePlayerCombatState {
  const actor = state.actors["local-player"];
  if (actor.locks.freezeUntilTick < 0) {
    return state;
  }
  return {
    ...state,
    actors: {
      ...state.actors,
      "local-player": {
        ...actor,
        locks: resetFreeze(actor.locks)
      }
    }
  };
}


export function runtimeWeaponLoadoutForItemId(itemId: number): RuntimeLoadoutId | null {
  if (itemId === 6914 || itemId === 11791 || itemId === 21006 || itemId === 22296 || itemId === 22647) {
    return "kodai-robes";
  }
  if (itemId === 11785 || itemId === 21902 || itemId === 26374) {
    return "acb-hides";
  }
  if (itemId === 22613 || itemId === 27690) {
    return "tentacle-bandos";
  }
  if (itemId === 29796) {
    return "noxious-halberd";
  }
  if (itemId === 11802) {
    return "ags-bandos";
  }
  for (const loadoutId of Object.keys(nhLoadouts) as RuntimeLoadoutId[]) {
    const weapon = nhLoadouts[loadoutId].equipment.weapon;
    if (weapon?.itemId === itemId) {
      return loadoutId;
    }
  }
  return null;
}


export function runtimeCombatSpellIdFromSelectedSpell(spell: NhSelectedSpell | null | undefined): RuntimePlayerCombatSpellId | null {
  return spell?.spellId === "blood-blitz" ||
    spell?.spellId === "ice-blitz" ||
    spell?.spellId === "blood-barrage" ||
    spell?.spellId === "ice-barrage"
    ? spell.spellId
    : null;
}


export function runtimeCombatLevelsFromHud(hud: RuntimeHudState): CombatLevels {
  return {
    attack: hud.skills?.attack?.current ?? runtimePlayerCombatDefaultLevels.attack,
    strength: hud.skills?.strength?.current ?? runtimePlayerCombatDefaultLevels.strength,
    defence: hud.skills?.defence?.current ?? runtimePlayerCombatDefaultLevels.defence,
    ranged: hud.skills?.ranged?.current ?? runtimePlayerCombatDefaultLevels.ranged,
    magic: hud.skills?.magic?.current ?? runtimePlayerCombatDefaultLevels.magic
  };
}


export function runtimeCombatLevelsFromSimStats(stats: SimStats): CombatLevels {
  return {
    attack: stats.attack.current,
    strength: stats.strength.current,
    defence: stats.defence.current,
    ranged: stats.ranged.current,
    magic: stats.magic.current
  };
}


export function runtimeManualCombatAuthoritativeHud(mergedHud: RuntimeHudState, combatHud: RuntimeHudState): RuntimeHudState {
  const skills = {
    ...(mergedHud.skills ?? {}),
    hitpoints: combatHud.skills?.hitpoints ?? {
      current: combatHud.hitpoints,
      fixed: combatHud.hitpointsMax
    }
  };

  return {
    ...mergedHud,
    hitpoints: combatHud.hitpoints,
    hitpointsMax: combatHud.hitpointsMax,
    specialEnergy: combatHud.specialEnergy,
    specialActive: combatHud.specialActive,
    attackSet: combatHud.attackSet,
    autocast: combatHud.autocast,
    defensiveCast: combatHud.defensiveCast,
    skills
  };
}


export function runtimeCombatActorRespawnedForFreshFightReset(
  before: RuntimePlayerCombatActorState,
  after: RuntimePlayerCombatActorState,
  tick: number
): boolean {
  return before.deadUntilTick !== null &&
    before.deadUntilTick <= tick &&
    after.deadUntilTick === null &&
    after.hitpoints > 0;
}


export interface ManualPolicyActorAppearanceView {
  readonly tile: RuntimeTile;
  readonly loadoutId: RuntimeLoadoutId;
  readonly equipment: VisibleEquipment;
  readonly inventoryItems: readonly VisibleEquipmentItem[];
  readonly inventorySlots: readonly (RuntimeInventorySlot | null)[];
  readonly activePrayers: readonly PrayerId[];
  readonly stats: SimStats;
  readonly locks: EntityLockState;
  readonly attackTimer: RuntimePlayerCombatActorState["attackTimer"];
  readonly movedThisTick: boolean;
  readonly lastMoveDx: number;
  readonly lastMoveDy: number;
  readonly lastVengeanceTrinketCastTick: number;
  readonly vengeanceTrinketCasts: number;
  readonly observedInfoKnown?: boolean;
}
