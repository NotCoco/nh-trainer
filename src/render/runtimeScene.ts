import {
  createNhHitsplatRenderState,
  NH_HITSPLAT_DAMAGE_TYPE,
  nhHitsplatPrimarySpriteId,
  type NhHitsplatRenderState
} from "./nhHitsplats";
import {
  createNhHealthBarRenderState,
  type NhHealthBarRenderState
} from "./nhHealthBars";
import { nhPrayerOverheadDefinition } from "./nhOverheadIcons";
import type { NhPrayerStates } from "./nhPrayer";
import type { NhSequencePlaybackMode } from "./nhSequencePlayback";
import { renderTodoGates, type RenderTodoGate } from "./todoGates";
import { canonicalNhLoadoutItemIds } from "../sim/nh/canonicalGear";

export interface RuntimeTile {
  readonly x: number;
  readonly z: number;
}

export interface RuntimeActorPose {
  readonly actorId: RuntimeActorId;
  readonly tile: RuntimeTile;
  readonly renderTile?: RuntimeTile;
  readonly loadoutId: RuntimeLoadoutId;
  readonly appearance?: RuntimePlayerAppearance;
  readonly minimapDotKind?: RuntimeMinimapDotKind;
  readonly sequenceName: RuntimeSequenceName;
  readonly sequenceMode?: NhSequencePlaybackMode;
  readonly movementSequenceName?: RuntimeSequenceName;
  readonly actionSequenceKey?: string;
  readonly facingDegrees: number;
  readonly orientationUnits?: number;
  readonly rotationUnits?: number;
  readonly markerLabel: string;
  readonly animationCycle?: number;
  readonly movementAnimationCycle?: number;
  readonly primaryFrame?: number;
  readonly primaryFrameCycle?: number;
  readonly movementFrame?: number;
  readonly movementFrameCycle?: number;
}

export type RuntimeActorId = "local-player" | "opponent";
export type RuntimeLoadoutId = "kodai-robes" | "acb-hides" | "tentacle-bandos" | "ags-bandos" | "gmaul-bandos";
export type RuntimeSequenceName =
  | "idle"
  | "turn"
  | "walk_back"
  | "walk_left"
  | "walk_right"
  | "wand_ready"
  | "wand_turn"
  | "wand_walk"
  | "wand_walk_back"
  | "wand_walk_left"
  | "wand_walk_right"
  | "wand_run"
  | "crossbow_ready"
  | "crossbow_turn"
  | "crossbow_walk"
  | "crossbow_walk_back"
  | "crossbow_walk_left"
  | "crossbow_walk_right"
  | "crossbow_run"
  | "gmaul_ready"
  | "gmaul_turn"
  | "gmaul_walk"
  | "gmaul_walk_back"
  | "gmaul_walk_left"
  | "gmaul_walk_right"
  | "gmaul_run"
  | "godsword_ready"
  | "godsword_turn"
  | "godsword_walk"
  | "godsword_walk_back"
  | "godsword_walk_left"
  | "godsword_walk_right"
  | "godsword_run"
  | "whip_turn"
  | "whip_walk"
  | "whip_walk_back"
  | "whip_walk_left"
  | "whip_walk_right"
  | "whip_run"
  | "walk"
  | "run"
  | "consume"
  | "wand_attack"
  | "whip_attack"
  | "godsword_attack"
  | "ags_special"
  | "gmaul_attack"
  | "gmaul_special"
  | "crossbow_attack"
  | "blitz_cast"
  | "barrage_cast";

export interface RuntimePlayerAppearance {
  readonly itemIds: readonly number[];
  readonly bodyColors: readonly [number, number, number, number, number];
  readonly equipmentSlots?: readonly number[];
  readonly team?: number;
  readonly source: "loadout" | "client-view" | "client-packet";
}

export type RuntimeMinimapDotKind = "item" | "npc" | "player" | "friend" | "team" | "friends-chat";

export interface RuntimeMinimapEntity {
  readonly id: string;
  readonly tile: RuntimeTile;
  readonly kind: RuntimeMinimapDotKind;
}

export interface RuntimeMinimapMapIcon {
  readonly id: string;
  readonly tile: RuntimeTile;
  readonly mapIconId: number;
  readonly objectId: number;
}

export interface RuntimeMinimapHint {
  readonly id: string;
  readonly tile: RuntimeTile;
}

export interface RuntimeCameraState {
  readonly yaw: number;
  readonly pitch: number;
}

export interface RuntimeLoadout {
  readonly id: RuntimeLoadoutId;
  readonly label: string;
  readonly itemIds: readonly number[];
  readonly bodyColors: readonly [number, number, number, number, number];
  readonly artifactPath: string;
  readonly artifactUrl: string;
  readonly meshMetadataPath: string;
  readonly meshMetadataUrl: string;
}

export interface RuntimeArena {
  readonly id: string;
  readonly label: string;
  readonly artifactPath: string;
  readonly artifactUrl: string;
  readonly objectArtifactPath: string;
  readonly objectArtifactUrl: string;
  readonly metadataPath: string;
  readonly metadataUrl: string;
  readonly objectMetadataPath: string;
  readonly objectMetadataUrl: string;
}

export interface RuntimeActorDefinition {
  readonly id: RuntimeActorId;
  readonly label: string;
}

export interface RuntimeKeyframe {
  readonly cycle: number;
  readonly camera?: RuntimeCameraState;
  readonly minimapState?: number;
  readonly actors: readonly RuntimeActorPose[];
  readonly minimapMapIcons?: readonly RuntimeMinimapMapIcon[];
  readonly minimapEntities?: readonly RuntimeMinimapEntity[];
  readonly minimapHints?: readonly RuntimeMinimapHint[];
  readonly minimapDestination?: RuntimeTile;
  readonly inventory?: readonly (RuntimeInventorySlot | null)[];
  readonly selectedInventoryItem?: RuntimeSelectedInventoryItem;
  readonly clickCross?: RuntimeClickCrossState;
  readonly contextMenu?: RuntimeContextMenuState;
  readonly hud?: RuntimeHudState;
  readonly note: string;
}

export interface RuntimeSceneSnapshot {
  readonly cycle: number;
  readonly keyframeCycle: number;
  readonly camera: RuntimeCameraState | null;
  readonly minimapState: number | null;
  readonly note: string;
  readonly actors: readonly RuntimeActorPose[];
  readonly minimapMapIcons: readonly RuntimeMinimapMapIcon[];
  readonly minimapEntities: readonly RuntimeMinimapEntity[];
  readonly minimapHints: readonly RuntimeMinimapHint[];
  readonly minimapDestination: RuntimeTile | null;
  readonly inventory: readonly (RuntimeInventorySlot | null)[];
  readonly selectedInventoryItem: RuntimeSelectedInventoryItem | null;
  readonly clickCross: RuntimeClickCrossState | null;
  readonly contextMenu: RuntimeContextMenuState | null;
  readonly hud: RuntimeHudState;
}

export interface RuntimeInventorySlot {
  readonly itemId: number;
  readonly quantity: number;
}

export interface RuntimeSelectedInventoryItem {
  readonly itemId: number;
  readonly itemName: string;
  readonly slotIndex: number;
  readonly widgetId: number;
}

export interface RuntimeClickCrossState {
  readonly x: number;
  readonly y: number;
  readonly color: "yellow" | "red";
  readonly state: number;
  readonly frame: number;
}

export interface RuntimeContextMenuEntry {
  readonly actionText: string;
  readonly targetText: string;
  readonly opcode: number;
  readonly identifier?: number;
  readonly argument1?: number;
  readonly argument2?: number;
  readonly shiftClick?: boolean;
}

export interface RuntimeContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly entries: readonly RuntimeContextMenuEntry[];
}

export type RuntimeSkillId =
  | "attack"
  | "strength"
  | "defence"
  | "ranged"
  | "prayer"
  | "magic"
  | "runecrafting"
  | "construction"
  | "hitpoints"
  | "agility"
  | "herblore"
  | "thieving"
  | "crafting"
  | "fletching"
  | "slayer"
  | "hunter"
  | "mining"
  | "smithing"
  | "fishing"
  | "cooking"
  | "firemaking"
  | "woodcutting"
  | "farming";

export interface RuntimeSkillState {
  readonly current: number;
  readonly fixed: number;
}

export type RuntimeSkillStates = Readonly<Partial<Record<RuntimeSkillId, RuntimeSkillState>>>;

export interface RuntimeHudState {
  readonly hitpoints: number;
  readonly hitpointsMax: number;
  readonly prayer: number;
  readonly prayerMax: number;
  readonly runEnergy: number;
  readonly running?: boolean;
  readonly specialEnergy: number;
  readonly specialActive?: boolean;
  readonly attackSet?: number;
  readonly autoRetaliate?: boolean;
  readonly weaponTypeConfig?: number;
  readonly autocast?: number;
  readonly defensiveCast?: boolean;
  readonly prayers?: NhPrayerStates;
  readonly skills?: RuntimeSkillStates;
}

export type RuntimeEventKind = "projectile" | "spotanim" | "overlay-sprite";
export type RuntimeSpriteSheetId =
  | "prayer_overheads"
  | "pk_skull"
  | "click_cross"
  | "client_p11_font"
  | "client_p12_font"
  | "context_menu_font"
  | "client_ui"
  | "compass"
  | "item_sprites"
  | "emote_icons"
  | "prayer_icons"
  | "spell_icons"
  | "minimap_map_dots"
  | "minimap_map_markers"
  | "minimap_map_icons"
  | "minimap_map_scenes"
  | "hitsplats"
  | "hitsplat_digits"
  | "health_bars";

export interface RuntimeProjectileLifecycle {
  readonly gfxId: number;
  readonly plane: number;
  readonly targetIndex: number;
  readonly sourceTile: RuntimeTile;
  readonly destinationTile: RuntimeTile;
  readonly sourceHeight: number;
  readonly destinationHeight: number;
  readonly delayCycles: number;
  readonly durationCycles: number;
  readonly cycleStart: number;
  readonly cycleEnd: number;
  readonly slope: number;
  readonly startDistanceOffset: number;
  readonly packetCycle: number;
  readonly skipTravel: boolean;
}

export interface RuntimeRenderEvent {
  readonly id: string;
  readonly kind: RuntimeEventKind;
  readonly label: string;
  readonly startCycle: number;
  readonly endCycle: number;
  readonly actorId?: RuntimeActorId;
  readonly projectileId?: string;
  readonly projectile?: RuntimeProjectileLifecycle;
  readonly spotanimId?: number;
  readonly fromTile?: RuntimeTile;
  readonly toTile?: RuntimeTile;
  readonly artifactUrl?: string;
  readonly spriteSheetId?: RuntimeSpriteSheetId;
  readonly spriteId?: number;
  readonly spriteFrame?: number;
  readonly clientOrder?: number;
  readonly clientCycle?: number;
  readonly healthRatio?: number;
  readonly healthBar?: NhHealthBarRenderState;
  readonly hitsplat?: NhHitsplatRenderState;
  readonly combatHit?: {
    readonly attackerId: RuntimeActorId;
    readonly style: string;
    readonly damage: number;
    readonly rawDamage: number;
    readonly maxDamage: number;
    readonly hitChance: number;
  };
}

export interface RuntimeSceneGate {
  readonly id: string;
  readonly label: string;
  readonly reason: string;
}

export const runtimeLoadouts = [
  {
    id: "kodai-robes",
    label: "Kodai Ahrim's",
    itemIds: canonicalNhLoadoutItemIds["kodai-robes"],
    bodyColors: [0, 0, 0, 0, 0],
    artifactPath: "fixtures/render/player-loadouts/kodai-robes.glb",
    artifactUrl: "render/player-loadouts/kodai-robes.glb",
    meshMetadataPath: "fixtures/render/player-loadouts/kodai-robes.mesh.json",
    meshMetadataUrl: "render/player-loadouts/kodai-robes.mesh.json"
  },
  {
    id: "acb-hides",
    label: "ACB Armadyl",
    itemIds: canonicalNhLoadoutItemIds["acb-hides"],
    bodyColors: [0, 0, 0, 0, 0],
    artifactPath: "fixtures/render/player-loadouts/acb-hides.glb",
    artifactUrl: "render/player-loadouts/acb-hides.glb",
    meshMetadataPath: "fixtures/render/player-loadouts/acb-hides.mesh.json",
    meshMetadataUrl: "render/player-loadouts/acb-hides.mesh.json"
  },
  {
    id: "tentacle-bandos",
    label: "Tentacle Bandos",
    itemIds: canonicalNhLoadoutItemIds["tentacle-bandos"],
    bodyColors: [0, 0, 0, 0, 0],
    artifactPath: "fixtures/render/player-loadouts/tentacle-bandos.glb",
    artifactUrl: "render/player-loadouts/tentacle-bandos.glb",
    meshMetadataPath: "fixtures/render/player-loadouts/tentacle-bandos.mesh.json",
    meshMetadataUrl: "render/player-loadouts/tentacle-bandos.mesh.json"
  },
  {
    id: "ags-bandos",
    label: "AGS Bandos",
    itemIds: canonicalNhLoadoutItemIds["ags-bandos"],
    bodyColors: [0, 0, 0, 0, 0],
    artifactPath: "fixtures/render/player-loadouts/ags-bandos.glb",
    artifactUrl: "render/player-loadouts/ags-bandos.glb",
    meshMetadataPath: "fixtures/render/player-loadouts/ags-bandos.mesh.json",
    meshMetadataUrl: "render/player-loadouts/ags-bandos.mesh.json"
  },
  {
    id: "gmaul-bandos",
    label: "Granite maul Bandos",
    itemIds: canonicalNhLoadoutItemIds["gmaul-bandos"],
    bodyColors: [0, 0, 0, 0, 0],
    artifactPath: "fixtures/render/player-loadouts/gmaul-bandos.glb",
    artifactUrl: "render/player-loadouts/gmaul-bandos.glb",
    meshMetadataPath: "fixtures/render/player-loadouts/gmaul-bandos.mesh.json",
    meshMetadataUrl: "render/player-loadouts/gmaul-bandos.mesh.json"
  }
] satisfies readonly RuntimeLoadout[];

export const runtimeArena = {
  id: "nh-wilderness-arena",
  label: "NH wilderness arena",
  artifactPath: "fixtures/render/maps/inferno_arena.glb",
  artifactUrl: "render/maps/inferno_arena.glb",
  objectArtifactPath: "fixtures/render/maps/inferno_arena_objects.glb",
  objectArtifactUrl: "render/maps/inferno_arena_objects.glb",
  metadataPath: "fixtures/render/maps/inferno_arena.json",
  metadataUrl: "render/maps/inferno_arena.json",
  objectMetadataPath: "fixtures/render/maps/inferno_arena_objects.json",
  objectMetadataUrl: "render/maps/inferno_arena_objects.json"
} satisfies RuntimeArena;

export const runtimeActors = [
  { id: "local-player", label: "Local actor" },
  { id: "opponent", label: "Opponent actor" }
] satisfies readonly RuntimeActorDefinition[];

export const runtimeSkillIds = [
  "attack",
  "strength",
  "defence",
  "ranged",
  "prayer",
  "magic",
  "runecrafting",
  "construction",
  "hitpoints",
  "agility",
  "herblore",
  "thieving",
  "crafting",
  "fletching",
  "slayer",
  "hunter",
  "mining",
  "smithing",
  "fishing",
  "cooking",
  "firemaking",
  "woodcutting",
  "farming"
] as const satisfies readonly RuntimeSkillId[];

export const defaultRuntimeSkillStates: Readonly<Record<RuntimeSkillId, RuntimeSkillState>> = {
  attack: { current: 99, fixed: 99 },
  strength: { current: 99, fixed: 99 },
  defence: { current: 99, fixed: 99 },
  ranged: { current: 112, fixed: 99 },
  prayer: { current: 99, fixed: 99 },
  magic: { current: 99, fixed: 99 },
  runecrafting: { current: 1, fixed: 1 },
  construction: { current: 1, fixed: 1 },
  hitpoints: { current: 99, fixed: 99 },
  agility: { current: 1, fixed: 1 },
  herblore: { current: 1, fixed: 1 },
  thieving: { current: 1, fixed: 1 },
  crafting: { current: 1, fixed: 1 },
  fletching: { current: 1, fixed: 1 },
  slayer: { current: 1, fixed: 1 },
  hunter: { current: 1, fixed: 1 },
  mining: { current: 1, fixed: 1 },
  smithing: { current: 1, fixed: 1 },
  fishing: { current: 1, fixed: 1 },
  cooking: { current: 1, fixed: 1 },
  firemaking: { current: 1, fixed: 1 },
  woodcutting: { current: 1, fixed: 1 },
  farming: { current: 1, fixed: 1 }
};

export const defaultRuntimeHudState: RuntimeHudState = {
  hitpoints: 99,
  hitpointsMax: 99,
  prayer: 99,
  prayerMax: 99,
  runEnergy: 100,
  running: true,
  specialEnergy: 100,
  specialActive: false,
  attackSet: 0,
  autoRetaliate: true,
  weaponTypeConfig: 18,
  autocast: 0,
  defensiveCast: false,
  prayers: {},
  skills: defaultRuntimeSkillStates
};

export const runtimeTimeline = [
  {
    cycle: 0,
    note: "Spawn two cache-exported loadout actors over the cache-derived NH arena terrain.",
    actors: [
      {
        actorId: "local-player",
        tile: { x: -2, z: 0 },
        loadoutId: "acb-hides",
        sequenceName: "crossbow_attack",
        facingDegrees: 90,
        markerLabel: "start range"
      },
      {
        actorId: "opponent",
        tile: { x: 2, z: 0 },
        loadoutId: "acb-hides",
        sequenceName: "crossbow_attack",
        facingDegrees: -90,
        markerLabel: "start range"
      }
    ]
  },
  {
    cycle: 4,
    note: "Deterministic switch marker: local actor changes to mage while both actors step.",
    actors: [
      {
        actorId: "local-player",
        tile: { x: -1, z: 1 },
        loadoutId: "kodai-robes",
        sequenceName: "barrage_cast",
        facingDegrees: 120,
        markerLabel: "mage switch"
      },
      {
        actorId: "opponent",
        tile: { x: 1, z: -1 },
        loadoutId: "tentacle-bandos",
        sequenceName: "whip_attack",
        facingDegrees: -45,
        markerLabel: "melee switch"
      }
    ]
  },
  {
    cycle: 8,
    note: "Deterministic switch marker: local actor changes to melee and opponent changes to mage.",
    actors: [
      {
        actorId: "local-player",
        tile: { x: 0, z: 1 },
        loadoutId: "gmaul-bandos",
        sequenceName: "gmaul_special",
        facingDegrees: 180,
        markerLabel: "melee step"
      },
      {
        actorId: "opponent",
        tile: { x: 0, z: -1 },
        loadoutId: "kodai-robes",
        sequenceName: "barrage_cast",
        facingDegrees: 0,
        markerLabel: "mage reset"
      }
    ]
  },
  {
    cycle: 12,
    note: "Loop boundary: actors return to separated tiles with no combat event inferred.",
    actors: [
      {
        actorId: "local-player",
        tile: { x: -2, z: 0 },
        loadoutId: "acb-hides",
        sequenceName: "idle",
        facingDegrees: 90,
        markerLabel: "loop range"
      },
      {
        actorId: "opponent",
        tile: { x: 2, z: 0 },
        loadoutId: "acb-hides",
        sequenceName: "idle",
        facingDegrees: -90,
        markerLabel: "loop range"
      }
    ]
  }
] satisfies readonly RuntimeKeyframe[];

const protectMagicOverhead = nhPrayerOverheadDefinition("protect_from_magic");
if (!protectMagicOverhead) {
  throw new Error("missing exported protect-from-magic overhead definition");
}
const damageHitsplat = createNhHitsplatRenderState({
  primaryType: NH_HITSPLAT_DAMAGE_TYPE,
  primaryValue: 38,
  secondaryType: -1,
  secondaryValue: 0,
  packetCycle: 9,
  delayCycles: 0,
  slotIndex: 0
});
const opponentHealthBar = createNhHealthBarRenderState(9, 0.64, 1, 1);
const opponentHealthBarEndCycle =
  opponentHealthBar.update.cycle + opponentHealthBar.definition.lifetimeCycles + opponentHealthBar.update.cycleOffset - 1;

export const runtimeRenderEvents = [
  {
    id: "ice-barrage-projectile",
    kind: "projectile",
    label: "Ice barrage projectile",
    startCycle: 3,
    endCycle: 5,
    projectileId: "ice_barrage_projectile",
    projectile: {
      gfxId: 368,
      plane: 0,
      targetIndex: -2,
      sourceTile: { x: 1, z: -1 },
      destinationTile: { x: 1, z: -1 },
      sourceHeight: 43,
      destinationHeight: 0,
      delayCycles: 51,
      durationCycles: 76,
      cycleStart: 54,
      cycleEnd: 79,
      slope: 16,
      startDistanceOffset: 64,
      packetCycle: 3,
      skipTravel: true
    },
    fromTile: { x: -1, z: 1 },
    toTile: { x: 1, z: -1 },
    artifactUrl: "render/spotanims/ice_barrage_projectile.glb"
  },
  {
    id: "protect-mage-overhead",
    kind: "overlay-sprite",
    label: "Protect from magic overhead sheet",
    startCycle: 3,
    endCycle: 6,
    actorId: "opponent",
    spriteSheetId: "prayer_overheads",
    spriteId: protectMagicOverhead.spriteId,
    spriteFrame: protectMagicOverhead.spriteFrame,
    clientOrder: 30
  },
  {
    id: "gmaul-special",
    kind: "spotanim",
    label: "Granite maul special",
    startCycle: 8,
    endCycle: 9,
    actorId: "local-player",
    spotanimId: 340,
    artifactUrl: "render/spotanims/gmaul_special.glb"
  },
  {
    id: "damage-hitsplat",
    kind: "overlay-sprite",
    label: "Damage hitsplat sheet",
    startCycle: 9,
    endCycle: 11,
    actorId: "opponent",
    spriteSheetId: "hitsplats",
    spriteId: nhHitsplatPrimarySpriteId(damageHitsplat),
    clientOrder: 40,
    hitsplat: damageHitsplat
  },
  {
    id: "opponent-health-bar",
    kind: "overlay-sprite",
    label: "Opponent health bar",
    startCycle: 9,
    endCycle: opponentHealthBarEndCycle,
    actorId: "opponent",
    spriteSheetId: "health_bars",
    spriteId: opponentHealthBar.definition.frontSpriteId,
    clientOrder: 10,
    healthRatio: 0.64,
    healthBar: opponentHealthBar
  }
] satisfies readonly RuntimeRenderEvent[];

function getFrameAtOrBefore(cycle: number): RuntimeKeyframe {
  let frame = runtimeTimeline[0];

  for (const candidate of runtimeTimeline) {
    if (candidate.cycle > cycle) {
      break;
    }

    frame = candidate;
  }

  return frame;
}

export function sampleRuntimeRenderEvents(cycle: number): readonly RuntimeRenderEvent[] {
  const lastCycle = runtimeTimeline[runtimeTimeline.length - 1].cycle;
  const loopLength = lastCycle + 1;
  const loopedCycle = ((cycle % loopLength) + loopLength) % loopLength;
  return runtimeRenderEvents.filter(
    (event) => event.startCycle <= loopedCycle && event.endCycle >= loopedCycle
  );
}

export function sampleRuntimeScene(cycle: number): RuntimeSceneSnapshot {
  const lastCycle = runtimeTimeline[runtimeTimeline.length - 1].cycle;
  const loopLength = lastCycle + 1;
  const loopedCycle = ((cycle % loopLength) + loopLength) % loopLength;
  const frame = getFrameAtOrBefore(loopedCycle);

  return {
    cycle: loopedCycle,
    keyframeCycle: frame.cycle,
    camera: frame.camera ?? null,
    minimapState: frame.minimapState ?? null,
    note: frame.note,
    actors: frame.actors,
    minimapMapIcons: frame.minimapMapIcons ?? [],
    minimapEntities: frame.minimapEntities ?? [],
    minimapHints: frame.minimapHints ?? [],
    minimapDestination: frame.minimapDestination ?? null,
    inventory: frame.inventory ?? [],
    selectedInventoryItem: frame.selectedInventoryItem ?? null,
    clickCross: frame.clickCross ?? null,
    contextMenu: frame.contextMenu ?? null,
    hud: frame.hud ?? defaultRuntimeHudState
  };
}

export const runtimeSceneGates = [
  {
    id: "actors",
    label: "Player appearance composition gate",
    reason:
      "Runtime actors now compose their meshes from PlayerAppearance-style equipment slots, five body colors, raw decoded appearance-packet slots carried by generated, fixture, and capture-bridge client-view traces, cache item/kit model parts, Nh server equipment hide rules, and primary sequence weapon/shield override slots instead of loading prebuilt player GLBs; capture-bridge traces can also carry fixed inventory widget slots, selected-item state, full client currentLevels/levels skill snapshots, HUD stat/run/spec snapshots, and the fixed side-tab shell now mounts inventory through group 548 child 69 plus exported DisplayHandler side-panel groups, with the chatbox preserving group 162 button hitboxes/default actions through the source widget menu path, the combat tab rendering group 593 weapon name, fixed-level combat text, HUD weaponTypeConfig-selected WeaponType attack-style labels, HUD attackSet-selected style metadata, auto-retaliate state, SpecbarRedraw-style varp-300/301 special energy, active text color, drain-aware fill state, and source button actions for TabCombat.changeAttackSet, Config.AUTO_RETALIATE.toggle, and PlayerCombat.toggleSpecial inside source widget geometry, the stats tab rendering group 320 skill slots from Nh TabStats child mappings, SpriteID skill icons, CS1 currentLevels/levels/total-level operands, runtime current/fixed levels, the source total-level tile, and skill-tile clicks that dispatch TabStats skill-guide config/client-script metadata, inventory context menus and default actions validating Wield, Use, item-on-item, Drink, Eat, Empty, and Drop source opcodes/mutations, Wield updating the visible equipment container from the actual current worn item, the equipment tab rendering local worn item sprites in group 387 child slots from Nh server equipSlot values plus worn-item Remove dispatch, full-inventory blocking, free-slot inventory mutation, and utility-button actions from group 387 widgets, the prayer tab rendering cache prayer icons in group 541 widget order with PlayerPrayer.toggle-style active varpbits, overhead disallowed-group clearing, and active-background sprite state, and the magic tab rendering standard, ancient, lunar, and arceuus spellbooks from cache enums 1982-1985 through the MagicSpellBookRedraw layout while targetable spell clicks enter selected-spell state from widget click masks/target flags, including object-target Charge Water Orb dispatch, but remaining work is collecting live reference traces, comparing synthesized stats text placement against those traces, and comparing broader actor-frame parity."
  },
  {
    id: "arena-objects",
    label: "Arena object fidelity gate",
    reason:
      "Placed static object geometry is cache-derived, terrain emits client-style TilePaint and TileModel surface geometry with per-corner lightness and cache texture images for textured floor overlays, and object materials now preserve ObjectDefinition ambient/contrast plus ModelData normal/HSL lighting without a renderer-side lighting pass; exported object metadata retains animation and morph fields, the current arena source contains zero animated or morphed object placements, and remaining work is live-client reference-frame comparison plus future animated/morphed scene fixtures when source data appears."
  },
  {
    id: "projectiles",
    label: "Projectile motion gate",
    reason:
      "Projectile samples now carry Nh server payload fields through the client packet lifecycle, use client motion math, and apply cache spotanim geometry and alpha sequence frames to ice barrage, ACB special, standard bolt, dragon-bolt, and Gmaul effect meshes; remaining work is live-client reference-frame parity."
  },
  {
    id: "animations",
    label: "Frame transform gate",
    reason:
      "Sequence/frame fixtures, mesh vertex-group bindings, source-style action-vs-movement selection, movement looping, primary action termination, and interleaved primary+movement transform application are wired; remaining work is exact blended bounds and live-client reference-frame parity."
  },
  {
    id: "overlays",
    label: "Overlay sprite projection gate",
    reason:
      "Prayer, skull, hitsplat, digit, and health-bar sprite placement now projects through the fixed Nh viewport; actor mesh scale and overlay anchors share Actor.defaultHeight client units, and hitsplats and health bars now load the broader cache-exported definition and sprite-atlas corpus, including hitsplat duration, fade, component layout, movement offsets, transformVarbit/transformVarp display-definition selection, null-transform suppression, HealthBarDefinition width/fade variants, and HealthBarUpdate-style previous-to-target health interpolation, with remaining work in custom-font hitsplat behavior if source data appears and live-client reference-frame parity."
  },
  {
    id: "minimap",
    label: "Minimap raster and sprite export gate",
    reason:
      "The fixed-mode minimap now uses the source widget rect, cache minimap alpha mask and SpriteMask row acceptance, cache-derived sceneMinimapSprite terrain with client-palette TilePaint/TileModel colors, TileModel shape masks, object strokes, map-scene sprites exported from every loadable GraphicsDefaults map-scene frame, object map icons, client camAngleY dot/click projection math, minimapState disabled-mask handling, mapDotSprites for item/NPC/player/friend/team/friends-chat sources, hint markers, destination markers, live minimap click dispatch, and capture-bridge feeds for live camera yaw, minimapState, map icons, ground-item/NPC/player dots, hint arrows, and destination state; remaining work is live reference-frame color parity."
  },
  {
    id: "tile-movement",
    label: "Tile click and route movement gate",
    reason:
      "World clicks now use the resolved fixed viewport pixels, source Scene.containsBounds-style projected cache terrain triangles, Nh object clipping masks, 128x128 route BFS fallback, compressed route waypoints, snapped logical actor tiles split from visual-only render interpolation, one-step walk and PlayerMovement-style two-step run consumption, ObjectDefinition action-slot menus, selected-item and selected-spell object menu overrides, selected spell player-target rows, Nh object/player packet id metadata, exported client yellow/red click-cross sprite feedback, and object-footprint reach routing when action-bearing object metadata is present; real Wilderness Ditch, 2x2 Tree footprint, selected-item-on-object dispatch, selected-spell-on-player dispatch, selected-spell-on-object Charge Water Orb dispatch, plain scene-tile selected-item clearing plus yellow movement cross, object context action red cross, and non-object-target selected-spell object menu suppression are covered by runtime validation, with remaining work in live-client scene-selection frame comparison."
  }
] satisfies readonly RuntimeSceneGate[];

export function getRuntimeSceneTodoGates(): readonly RenderTodoGate[] {
  return renderTodoGates;
}
