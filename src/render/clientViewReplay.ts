import type {
  ClientViewActorId,
  ClientViewTrace,
  ClientVisibleActor,
  ClientViewEvent,
  ClientHudState,
  ClientInventorySlot,
  EquipmentSlot,
  VisibleEquipment
} from "../sim";
import type {
  RuntimeActorId,
  RuntimeActorPose,
  RuntimeClickCrossState,
  RuntimeContextMenuState,
  RuntimeHudState,
  RuntimeInventorySlot,
  RuntimeKeyframe,
  RuntimeLoadoutId,
  RuntimeMinimapEntity,
  RuntimeMinimapHint,
  RuntimeMinimapMapIcon,
  RuntimePlayerAppearance,
  RuntimeProjectileLifecycle,
  RuntimeRenderEvent,
  RuntimeSceneSnapshot,
  RuntimeSelectedInventoryItem,
  RuntimeSpriteSheetId,
  RuntimeTile
} from "./runtimeScene";
import { defaultRuntimeHudState, defaultRuntimeSkillStates, runtimeSkillIds } from "./runtimeScene";
import { kronosClickCrossFrameFromState } from "./kronosClickCross";
import {
  createKronosHitsplatRenderStateOrNull,
  kronosHitsplatPrimarySpriteId,
  type KronosHitsplatDefinitionStore
} from "./kronosHitsplats";
import {
  resolveKronosActorSequence,
  type KronosActorSequenceDefinitionStore
} from "./kronosActorSequence";
import {
  KRONOS_PLAYER_HEALTH_BAR_DEFINITION_ID,
  createKronosHealthBarRenderState,
  kronosHealthBarDefinition,
  kronosPlayerHealthBarDefinition,
  type KronosHealthBarDefinitionStore
} from "./kronosHealthBars";
import {
  decodeKronosPlayerAppearancePacket,
  kronosRuntimeAppearanceFromDecodedPacket
} from "./kronosPlayerAppearancePacket";
import {
  kronosProjectileDefinitionForGfx,
  type KronosProjectileDefinitionMap
} from "./kronosProjectileMotion";
import {
  kronosPrayerOverheadDefinition,
  kronosSkullOverheadDefinition,
  type KronosOverheadIconDefinitionStore
} from "./kronosOverheadIcons";

export interface RuntimeReplay {
  readonly id: string;
  readonly description: string;
  readonly firstCycle: number;
  readonly lastCycle: number;
  readonly timeline: readonly RuntimeKeyframe[];
  readonly events: readonly RuntimeRenderEvent[];
}

export interface ClientViewRuntimeReplayOptions {
  readonly projectileDefinitions?: KronosProjectileDefinitionMap;
  readonly spotanimDefinitions?: ReadonlyMap<number, KronosReplaySpotanimDefinition>;
  readonly hitsplatDefinitions?: KronosHitsplatDefinitionStore;
  readonly healthBarDefinitions?: KronosHealthBarDefinitionStore;
  readonly overheadIconDefinitions?: KronosOverheadIconDefinitionStore;
  readonly actorSequenceDefinitions?: KronosActorSequenceDefinitionStore;
}

export interface KronosReplaySpotanimDefinition {
  readonly id: number;
  readonly label?: string;
  readonly artifactUrl?: string;
}

const actorIdMap: Record<ClientViewActorId, RuntimeActorId> = {
  self: "local-player",
  opponent: "opponent"
};

const visibleEquipmentOrder: readonly EquipmentSlot[] = [
  "head",
  "cape",
  "amulet",
  "weapon",
  "body",
  "shield",
  "legs",
  "hands",
  "feet",
  "ring",
  "ammo"
];

const defaultPlayerBodyColors = [0, 0, 0, 0, 0] as const;

function runtimeTile(actor: ClientVisibleActor, origin: { readonly x: number; readonly y: number }): RuntimeTile {
  return {
    x: actor.tile.x - origin.x,
    z: actor.tile.y - origin.y
  };
}

function runtimeFacing(actorId: ClientViewActorId, actor: ClientVisibleActor): number {
  const units = clientAngleField(actor.rotation) ?? clientAngleField(actor.orientation);
  if (units === undefined) {
    return actorId === "self" ? 90 : -90;
  }
  return kronosOrientationUnitsToFacingDegrees(units);
}

function clientAngleField(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isInteger(value)) {
    return undefined;
  }
  return ((value % 2048) + 2048) % 2048;
}

function kronosOrientationUnitsToFacingDegrees(units: number): number {
  const degrees = ((clientAngleField(units) ?? 0) - 1024) * 360 / 2048;
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

function resolveLoadout(equipment: VisibleEquipment): RuntimeLoadoutId {
  const ids = new Set(Object.values(equipment).map((item) => item.itemId));
  if (ids.has(4153)) {
    return "gmaul-bandos";
  }
  if (ids.has(12006)) {
    return "tentacle-bandos";
  }
  if (ids.has(11802)) {
    return "ags-bandos";
  }
  if (ids.has(11785) || ids.has(21902)) {
    return "acb-hides";
  }
  if (ids.has(21006) || ids.has(6914) || ids.has(11791) || ids.has(22296) || ids.has(21021) || ids.has(21024)) {
    return "kodai-robes";
  }
  if (ids.has(11832) || ids.has(11834)) {
    return "tentacle-bandos";
  }
  if (ids.has(11828) || ids.has(11830) || ids.has(22109) || ids.has(19547)) {
    return "acb-hides";
  }
  // Mage's book is shared by the ACB and Kodai NH sets, so it is not a mage-loadout discriminator.
  if (ids.has(12002) || ids.has(21791) || ids.has(4712) || ids.has(4714)) {
    return "kodai-robes";
  }
  return "acb-hides";
}

function runtimeAppearance(actor: ClientVisibleActor): RuntimePlayerAppearance {
  if (actor.appearancePacket) {
    return kronosRuntimeAppearanceFromDecodedPacket(decodeKronosPlayerAppearancePacket(actor.appearancePacket));
  }

  return {
    itemIds: visibleEquipmentOrder
      .map((slot) => actor.equipment[slot]?.itemId)
      .filter((itemId): itemId is number => typeof itemId === "number" && Number.isInteger(itemId) && itemId >= 0),
    bodyColors: defaultPlayerBodyColors,
    source: "client-view"
  };
}

function actorPose(
  actorId: ClientViewActorId,
  actor: ClientVisibleActor,
  origin: { readonly x: number; readonly y: number },
  cycle: number,
  actorSequenceDefinitions?: KronosActorSequenceDefinitionStore
): RuntimeActorPose {
  const sequence = resolveKronosActorSequence(actor.animations, actorSequenceDefinitions);
  const blendMovement =
    sequence.actionSequenceName !== undefined &&
    sequence.movementSequenceName !== undefined &&
    sequence.movementSequenceName !== sequence.poseSequenceName
      ? sequence.movementSequenceName
      : undefined;
  const orientationUnits = clientAngleField(actor.orientation);
  const rotationUnits = clientAngleField(actor.rotation) ?? orientationUnits;
  return {
    actorId: actorIdMap[actorId],
    tile: runtimeTile(actor, origin),
    loadoutId: resolveLoadout(actor.equipment),
    appearance: runtimeAppearance(actor),
    minimapDotKind: actor.minimapDotKind,
    sequenceName: sequence.sequenceName,
    sequenceMode: sequence.playbackMode,
    movementSequenceName: blendMovement,
    facingDegrees: runtimeFacing(actorId, actor),
    orientationUnits,
    rotationUnits,
    markerLabel: actor.overheadPrayer,
    animationCycle: sequence.playbackMode === "loop" ? cycle : 0,
    movementAnimationCycle: blendMovement ? cycle : undefined
  };
}

function runtimeInventorySlot(slot: ClientInventorySlot): RuntimeInventorySlot | null {
  if (slot.widgetItemId <= 0 || slot.quantity <= 0) {
    return null;
  }
  return {
    itemId: slot.widgetItemId - 1,
    quantity: slot.quantity
  };
}

function runtimeSelectedInventoryItem(selectedItem: {
  readonly itemId: number;
  readonly itemName: string;
  readonly slotIndex: number;
  readonly widgetId: number;
}): RuntimeSelectedInventoryItem {
  return {
    itemId: selectedItem.itemId,
    itemName: selectedItem.itemName,
    slotIndex: selectedItem.slotIndex,
    widgetId: selectedItem.widgetId
  };
}

function runtimeClickCross(clickCross: {
  readonly x: number;
  readonly y: number;
  readonly color: 1 | 2;
  readonly state: number;
}): RuntimeClickCrossState {
  return {
    x: clickCross.x,
    y: clickCross.y,
    color: clickCross.color === 1 ? "yellow" : "red",
    state: clickCross.state,
    frame: kronosClickCrossFrameFromState(clickCross.state)
  };
}

function runtimeContextMenu(contextMenu: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly entries: readonly {
    readonly actionText: string;
    readonly targetText: string;
    readonly opcode: number;
    readonly identifier?: number;
    readonly argument1?: number;
    readonly argument2?: number;
    readonly shiftClick?: boolean;
  }[];
}): RuntimeContextMenuState {
  return {
    x: contextMenu.x,
    y: contextMenu.y,
    width: contextMenu.width,
    height: contextMenu.height,
    entries: contextMenu.entries.map((entry) => ({
      actionText: entry.actionText,
      targetText: entry.targetText,
      opcode: entry.opcode,
      identifier: entry.identifier,
      argument1: entry.argument1,
      argument2: entry.argument2,
      shiftClick: entry.shiftClick
    }))
  };
}

function runtimeHudState(hud: ClientHudState | undefined, self: ClientVisibleActor): RuntimeHudState {
  if (hud) {
    const skills = { ...defaultRuntimeSkillStates };
    for (const skillId of runtimeSkillIds) {
      const value = hud.skills?.[skillId];
      if (value) {
        skills[skillId] = value;
      }
    }
    skills.hitpoints = hud.hitpoints;
    skills.prayer = hud.prayer;

    return {
      hitpoints: hud.hitpoints.current,
      hitpointsMax: hud.hitpoints.fixed,
      prayer: hud.prayer.current,
      prayerMax: hud.prayer.fixed,
      runEnergy: hud.runEnergy,
      running: defaultRuntimeHudState.running,
      specialEnergy: hud.specialEnergy,
      specialActive: hud.specialActive,
      attackSet: hud.attackSet,
      autoRetaliate: hud.autoRetaliate,
      weaponTypeConfig: hud.weaponTypeConfig,
      autocast: hud.autocast,
      defensiveCast: hud.defensiveCast,
      skills
    };
  }

  return {
    ...defaultRuntimeHudState,
    hitpoints:
      self.healthRatio === undefined
        ? defaultRuntimeHudState.hitpoints
        : Math.max(0, Math.round(self.healthRatio * defaultRuntimeHudState.hitpoints))
  };
}

function eventTile(tile: { readonly x: number; readonly y: number }, origin: { readonly x: number; readonly y: number }): RuntimeTile {
  return {
    x: tile.x - origin.x,
    z: tile.y - origin.y
  };
}

function runtimeMinimapEntity(
  entity: { readonly id: string; readonly tile: { readonly x: number; readonly y: number }; readonly kind: RuntimeMinimapEntity["kind"] },
  origin: { readonly x: number; readonly y: number }
): RuntimeMinimapEntity {
  return {
    id: entity.id,
    tile: eventTile(entity.tile, origin),
    kind: entity.kind
  };
}

function runtimeMinimapMapIcon(
  icon: {
    readonly id: string;
    readonly tile: { readonly x: number; readonly y: number };
    readonly mapIconId: number;
    readonly objectId: number;
  },
  origin: { readonly x: number; readonly y: number }
): RuntimeMinimapMapIcon {
  return {
    id: icon.id,
    tile: eventTile(icon.tile, origin),
    mapIconId: icon.mapIconId,
    objectId: icon.objectId
  };
}

function runtimeMinimapHint(
  hint: { readonly id: string; readonly tile: { readonly x: number; readonly y: number } },
  origin: { readonly x: number; readonly y: number }
): RuntimeMinimapHint {
  return {
    id: hint.id,
    tile: eventTile(hint.tile, origin)
  };
}

function projectileLifecycle(
  event: Extract<ClientViewEvent, { readonly kind: "projectile" }>,
  origin: { readonly x: number; readonly y: number }
): RuntimeProjectileLifecycle {
  const sourceTile = eventTile(event.startTile, origin);
  const destinationTile = eventTile(event.targetTile, origin);
  return {
    gfxId: event.projectileId,
    plane: event.startTile.plane ?? 0,
    targetIndex: event.targetIndex,
    sourceTile,
    destinationTile,
    sourceHeight: event.startHeight,
    destinationHeight: event.endHeight,
    delayCycles: event.delayCycles,
    durationCycles: event.durationCycles,
    cycleStart: event.observedTick + event.delayCycles,
    cycleEnd: event.observedTick + event.durationCycles,
    slope: event.curve,
    startDistanceOffset: event.offset,
    packetCycle: event.observedTick,
    skipTravel: event.skipTravel
  };
}

function projectileEvent(
  event: Extract<ClientViewEvent, { readonly kind: "projectile" }>,
  origin: { readonly x: number; readonly y: number },
  projectileDefinitions?: KronosProjectileDefinitionMap
): RuntimeRenderEvent {
  const projectile = kronosProjectileDefinitionForGfx(projectileDefinitions, event.projectileId);
  const lifecycle = projectileLifecycle(event, origin);
  return {
    id: event.id,
    kind: "projectile",
    label: projectile?.label ?? `Projectile ${event.projectileId}`,
    startCycle: event.visibleWindow.firstTick,
    endCycle: event.visibleWindow.lastTick,
    projectileId: projectile?.id,
    projectile: lifecycle,
    fromTile: lifecycle.sourceTile,
    toTile: lifecycle.destinationTile,
    artifactUrl: projectile?.artifactUrl
  };
}

function hitsplatEvent(
  event: Extract<ClientViewEvent, { readonly kind: "hitsplat" }>,
  hitsplatDefinitions?: KronosHitsplatDefinitionStore
): RuntimeRenderEvent | null {
  const hitsplat = createKronosHitsplatRenderStateOrNull({
    primaryType: event.primaryType,
    primaryValue: event.primaryValue,
    secondaryType: event.secondaryType,
    secondaryValue: event.secondaryValue,
    packetCycle: event.observedTick,
    delayCycles: event.delayCycles,
    slotIndex: event.slotIndex
  }, hitsplatDefinitions);
  if (!hitsplat) {
    return null;
  }

  return {
    id: event.id,
    kind: "overlay-sprite",
    label: `${hitsplat.primary.definition.label} ${hitsplat.primary.value}`,
    startCycle: event.visibleWindow.firstTick,
    endCycle: event.visibleWindow.lastTick,
    actorId: actorIdMap[event.targetActorId],
    spriteSheetId: "hitsplats",
    spriteId: kronosHitsplatPrimarySpriteId(hitsplat),
    clientOrder: event.observedTick * 100 + overlayActorOffset(event.targetActorId) + 40,
    hitsplat
  };
}

function spotanimEvent(
  event: Extract<ClientViewEvent, { readonly kind: "spotanim" }>,
  spotanimDefinitions?: ReadonlyMap<number, KronosReplaySpotanimDefinition>
): RuntimeRenderEvent {
  const spotanim = spotanimDefinitions?.get(event.spotanimId);
  return {
    id: event.id,
    kind: "spotanim",
    label: spotanim?.label ?? `Spotanim ${event.spotanimId}`,
    startCycle: event.visibleWindow.firstTick,
    endCycle: event.visibleWindow.lastTick,
    actorId: actorIdMap[event.actorId],
    spotanimId: event.spotanimId,
    artifactUrl: spotanim?.artifactUrl
  };
}

function overlayEvent(
  tick: number,
  actorId: ClientViewActorId,
  sheetId: RuntimeSpriteSheetId,
  spriteId: number,
  label: string,
  clientOrder: number,
  healthRatio?: number,
  spriteFrame?: number
): RuntimeRenderEvent {
  const runtimeActorId = actorIdMap[actorId];
  return {
    id: clientViewOverlayEventId(tick, runtimeActorId, sheetId, spriteId, spriteFrame),
    kind: "overlay-sprite",
    label,
    startCycle: tick,
    endCycle: tick,
    actorId: runtimeActorId,
    spriteSheetId: sheetId,
    spriteId,
    spriteFrame,
    clientOrder,
    healthRatio
  };
}

function clientViewOverlayEventId(
  tick: number,
  actorId: RuntimeActorId,
  sheetId: RuntimeSpriteSheetId,
  spriteId: number,
  spriteFrame?: number
): string {
  // Source: Scene.copy$drawActor2d redraws persistent head icons from actor state every draw pass.
  // Keep the DOM identity actor-stable; camera-key motion should update Client.viewportTempX/Y placement only.
  if (sheetId === "prayer_overheads") {
    return `${actorId}-prayer-${spriteFrame ?? spriteId}`;
  }
  if (sheetId === "pk_skull") {
    return `${actorId}-skull`;
  }
  return `${tick}-${actorId}-${sheetId}-${spriteId}-${spriteFrame ?? 0}`;
}

function healthBarEvent(
  tick: number,
  actorId: ClientViewActorId,
  healthRatio: number,
  previousHealthRatio: number,
  cycleOffset: number,
  healthBarDefinitions?: KronosHealthBarDefinitionStore
): RuntimeRenderEvent {
  const definition =
    kronosHealthBarDefinition(KRONOS_PLAYER_HEALTH_BAR_DEFINITION_ID, healthBarDefinitions) ??
    kronosPlayerHealthBarDefinition;
  return {
    id: `${tick}-${actorId}-health_bars-${definition.frontSpriteId}`,
    kind: "overlay-sprite",
    label: `health ${Math.round(healthRatio * 100)}%`,
    startCycle: tick,
    endCycle: tick + definition.lifetimeCycles + cycleOffset - 1,
    actorId: actorIdMap[actorId],
    spriteSheetId: "health_bars",
    spriteId: definition.frontSpriteId,
    clientOrder: tick * 100 + overlayActorOffset(actorId) + 10,
    healthRatio,
    healthBar: createKronosHealthBarRenderState(tick, healthRatio, previousHealthRatio, cycleOffset, definition)
  };
}

function overlayActorOffset(actorId: ClientViewActorId): number {
  return actorId === "self" ? 0 : 50;
}

function healthBarEventsForTrace(
  trace: ClientViewTrace,
  healthBarDefinitions?: KronosHealthBarDefinitionStore
): readonly RuntimeRenderEvent[] {
  const events: RuntimeRenderEvent[] = [];
  const previousByActor = new Map<ClientViewActorId, { readonly ratio: number; readonly tick: number }>();
  const pendingByActor = new Map<ClientViewActorId, RuntimeRenderEvent>();

  const closePending = (actorId: ClientViewActorId, endCycle: number): void => {
    const pending = pendingByActor.get(actorId);
    if (!pending) {
      return;
    }

    events.push({
      ...pending,
      endCycle: Math.min(pending.endCycle, endCycle)
    });
    pendingByActor.delete(actorId);
  };

  for (const tick of trace.ticks) {
    for (const actorId of trace.actors) {
      const ratio = tick.actors[actorId].healthRatio;
      if (ratio === undefined) {
        continue;
      }

      const currentRatio = Math.max(0, Math.min(1, ratio));
      const previous = previousByActor.get(actorId);
      const previousRatio = previous?.ratio ?? 1;
      const previousTick = previous?.tick ?? Math.max(0, tick.tick - 1);
      const changed = Math.abs(currentRatio - previousRatio) > 0.000001;

      if (currentRatio >= 0.995) {
        closePending(actorId, tick.tick - 1);
      } else if (changed || !pendingByActor.has(actorId)) {
        closePending(actorId, tick.tick - 1);
        pendingByActor.set(
          actorId,
          healthBarEvent(
            tick.tick,
            actorId,
            currentRatio,
            previousRatio,
            Math.max(1, tick.tick - previousTick),
            healthBarDefinitions
          )
        );
      }

      previousByActor.set(actorId, {
        ratio: currentRatio,
        tick: tick.tick
      });
    }
  }

  for (const actorId of trace.actors) {
    closePending(actorId, Number.MAX_SAFE_INTEGER);
  }

  return events;
}

function originFromTrace(trace: ClientViewTrace): { readonly x: number; readonly y: number } {
  const firstTick = trace.ticks[0];
  const self = firstTick.actors.self.tile;
  const opponent = firstTick.actors.opponent.tile;
  return {
    x: Math.round((self.x + opponent.x) / 2),
    y: Math.round((self.y + opponent.y) / 2)
  };
}

export function clientViewTraceToRuntimeReplay(
  trace: ClientViewTrace,
  options: ClientViewRuntimeReplayOptions = {}
): RuntimeReplay {
  const origin = originFromTrace(trace);
  let currentInventory: readonly (RuntimeInventorySlot | null)[] | undefined;
  const timeline = trace.ticks.map((tick): RuntimeKeyframe => {
    const actors = trace.actors.map((actorId) =>
      actorPose(actorId, tick.actors[actorId], origin, tick.tick, options.actorSequenceDefinitions)
    );
    if (tick.inventory) {
      currentInventory = tick.inventory.map(runtimeInventorySlot);
    }
    return {
      cycle: tick.tick,
      camera: tick.camera,
      minimapState: tick.minimapState,
      note: `Client-view tick ${tick.tick}: ${tick.eventIds.length} visible events`,
      actors,
      minimapMapIcons: tick.minimapMapIcons?.map((icon) => runtimeMinimapMapIcon(icon, origin)),
      minimapEntities: tick.minimapEntities?.map((entity) => runtimeMinimapEntity(entity, origin)),
      minimapHints: tick.minimapHints?.map((hint) => runtimeMinimapHint(hint, origin)),
      minimapDestination: tick.minimapDestination ? eventTile(tick.minimapDestination.tile, origin) : undefined,
      inventory: currentInventory,
      selectedInventoryItem: tick.selectedInventoryItem
        ? runtimeSelectedInventoryItem(tick.selectedInventoryItem)
        : undefined,
      clickCross: tick.clickCross ? runtimeClickCross(tick.clickCross) : undefined,
      contextMenu: tick.contextMenu ? runtimeContextMenu(tick.contextMenu) : undefined,
      hud: runtimeHudState(tick.hud, tick.actors.self)
    };
  });
  const events: RuntimeRenderEvent[] = [];

  for (const event of trace.events) {
    if (event.kind === "projectile") {
      events.push(projectileEvent(event, origin, options.projectileDefinitions));
    } else if (event.kind === "hitsplat") {
      const runtimeEvent = hitsplatEvent(event, options.hitsplatDefinitions);
      if (runtimeEvent) {
        events.push(runtimeEvent);
      }
    } else {
      events.push(spotanimEvent(event, options.spotanimDefinitions));
    }
  }

  for (const tick of trace.ticks) {
    for (const actorId of trace.actors) {
      const actor = tick.actors[actorId];
      if (actor.overheadPrayer !== "none") {
        const prayer = kronosPrayerOverheadDefinition(actor.overheadPrayer, options.overheadIconDefinitions);
        if (prayer) {
          events.push(
            overlayEvent(
              tick.tick,
              actorId,
              prayer.spriteSheetId,
              prayer.spriteId,
              prayer.label,
              tick.tick * 100 + overlayActorOffset(actorId) + 30,
              undefined,
              prayer.spriteFrame
            )
          );
        }
      }
      if (actor.skullIcon !== "none") {
        const skull = kronosSkullOverheadDefinition(actor.skullIcon, options.overheadIconDefinitions);
        if (skull) {
          events.push(
            overlayEvent(
              tick.tick,
              actorId,
              skull.spriteSheetId,
              skull.spriteId,
              skull.label,
              tick.tick * 100 + overlayActorOffset(actorId) + 20,
              undefined,
              skull.spriteFrame
            )
          );
        }
      }
    }
  }
  events.push(...healthBarEventsForTrace(trace, options.healthBarDefinitions));

  const lastTraceCycle = trace.events.reduce(
    (lastCycle, event) => Math.max(lastCycle, event.visibleWindow.lastTick),
    timeline[timeline.length - 1]?.cycle ?? 0
  );

  return {
    id: trace.fixtureId,
    description: trace.description,
    firstCycle: timeline[0]?.cycle ?? 0,
    lastCycle: lastTraceCycle,
    timeline,
    events
  };
}

export function sampleRuntimeReplayScene(replay: RuntimeReplay, cycle: number): RuntimeSceneSnapshot {
  const loopLength = replay.lastCycle + 1;
  const loopedCycle = ((cycle % loopLength) + loopLength) % loopLength;
  let frame = replay.timeline[0];

  for (const candidate of replay.timeline) {
    if (candidate.cycle > loopedCycle) {
      break;
    }
    frame = candidate;
  }

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

export function sampleRuntimeReplayEvents(replay: RuntimeReplay, cycle: number): readonly RuntimeRenderEvent[] {
  const loopLength = replay.lastCycle + 1;
  const loopedCycle = ((cycle % loopLength) + loopLength) % loopLength;
  return replay.events.filter((event) => event.startCycle <= loopedCycle && event.endCycle >= loopedCycle);
}
