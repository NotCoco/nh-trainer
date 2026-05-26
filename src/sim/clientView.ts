import type { TilePosition } from "./world/movement";

export type ClientViewSchemaVersion = "client-view.v1";
export type ClientViewActorId = "self" | "opponent";
export type EquipmentSlot =
  | "head"
  | "cape"
  | "amulet"
  | "weapon"
  | "body"
  | "shield"
  | "legs"
  | "hands"
  | "feet"
  | "ring"
  | "ammo";
export type PrayerIcon =
  | "protect_from_magic"
  | "protect_from_missiles"
  | "protect_from_melee"
  | "retribution"
  | "smite"
  | "redemption"
  | "none";
export type SkullIcon = "white_pk" | "red_pk" | "none";
export type HitsplatKind = "damage" | "blocked" | "poison" | "venom" | "heal";
export type ClientMinimapDotKind = "item" | "npc" | "player" | "friend" | "team" | "friends-chat";

export interface VisibleEquipmentItem {
  readonly itemId: number;
  readonly name: string;
}

export type VisibleEquipment = Readonly<Partial<Record<EquipmentSlot, VisibleEquipmentItem>>>;

export interface ClientInventorySlot {
  readonly widgetItemId: number;
  readonly quantity: number;
}

export type ClientInventory = readonly ClientInventorySlot[];

export interface ClientSelectedInventoryItem {
  readonly itemId: number;
  readonly itemName: string;
  readonly slotIndex: number;
  readonly widgetId: number;
}

export interface ClientClickCrossState {
  readonly x: number;
  readonly y: number;
  readonly color: 1 | 2;
  readonly state: number;
}

export interface ClientContextMenuEntry {
  readonly actionText: string;
  readonly targetText: string;
  readonly opcode: number;
  readonly identifier?: number;
  readonly argument1?: number;
  readonly argument2?: number;
  readonly shiftClick?: boolean;
}

export interface ClientContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly entries: readonly ClientContextMenuEntry[];
}

export interface ClientSkillValue {
  readonly current: number;
  readonly fixed: number;
}

export interface ClientHudState {
  readonly hitpoints: ClientSkillValue;
  readonly prayer: ClientSkillValue;
  readonly runEnergy: number;
  readonly specialEnergy: number;
  readonly specialActive?: boolean;
  readonly attackSet?: number;
  readonly autoRetaliate?: boolean;
  readonly weaponTypeConfig?: number;
  readonly autocast?: number;
  readonly defensiveCast?: boolean;
  readonly skills?: Readonly<Record<string, ClientSkillValue>>;
}

export interface VisibleAnimationIds {
  readonly pose?: number;
  readonly movement?: number;
  readonly action?: number;
  readonly spot?: number;
}

export interface ClientVisibleActor {
  readonly actorId: ClientViewActorId;
  readonly tile: TilePosition;
  readonly equipment: VisibleEquipment;
  readonly appearancePacket?: readonly number[];
  readonly minimapDotKind?: ClientMinimapDotKind;
  readonly animations: VisibleAnimationIds;
  readonly orientation?: number;
  readonly rotation?: number;
  readonly overheadPrayer: PrayerIcon;
  readonly skullIcon: SkullIcon;
  readonly healthRatio?: number;
}

export type ClientViewActors = Readonly<Record<ClientViewActorId, ClientVisibleActor>>;

export interface ClientViewCameraState {
  readonly yaw: number;
  readonly pitch: number;
}

export interface ClientViewTick {
  readonly tick: number;
  readonly camera?: ClientViewCameraState;
  readonly minimapState?: number;
  readonly actors: ClientViewActors;
  readonly minimapMapIcons?: readonly ClientMinimapMapIcon[];
  readonly minimapEntities?: readonly ClientMinimapEntity[];
  readonly minimapHints?: readonly ClientMinimapHint[];
  readonly minimapDestination?: ClientMinimapDestination;
  readonly eventIds: readonly string[];
  readonly inventory?: ClientInventory;
  readonly selectedInventoryItem?: ClientSelectedInventoryItem;
  readonly clickCross?: ClientClickCrossState;
  readonly contextMenu?: ClientContextMenuState;
  readonly hud?: ClientHudState;
}

export interface ClientMinimapEntity {
  readonly id: string;
  readonly tile: TilePosition;
  readonly kind: ClientMinimapDotKind;
}

export interface ClientMinimapMapIcon {
  readonly id: string;
  readonly tile: TilePosition;
  readonly mapIconId: number;
  readonly objectId: number;
}

export interface ClientMinimapHint {
  readonly id: string;
  readonly tile: TilePosition;
}

export interface ClientMinimapDestination {
  readonly tile: TilePosition;
}

export interface ClientVisibleWindow {
  readonly firstTick: number;
  readonly lastTick: number;
}

interface ClientViewEventBase {
  readonly id: string;
  readonly observedTick: number;
  readonly visibleWindow: ClientVisibleWindow;
}

export interface ClientProjectileEvent extends ClientViewEventBase {
  readonly kind: "projectile";
  readonly sourceActorId: ClientViewActorId;
  readonly targetActorId: ClientViewActorId;
  readonly projectileId: number;
  readonly targetIndex: number;
  readonly startTile: TilePosition;
  readonly targetTile: TilePosition;
  readonly startHeight: number;
  readonly endHeight: number;
  readonly delayCycles: number;
  readonly durationCycles: number;
  readonly curve: number;
  readonly offset: number;
  readonly skipTravel: boolean;
}

export interface ClientHitsplatEvent extends ClientViewEventBase {
  readonly kind: "hitsplat";
  readonly targetActorId: ClientViewActorId;
  readonly primaryType: number;
  readonly primaryValue: number;
  readonly secondaryType: number;
  readonly secondaryValue: number;
  readonly delayCycles: number;
  readonly slotIndex: number;
  readonly definitionDurationCycles: number;
  readonly expiresOnClientCycle: number;
}

export interface ClientSpotanimEvent extends ClientViewEventBase {
  readonly kind: "spotanim";
  readonly actorId: ClientViewActorId;
  readonly spotanimId: number;
}

export type ClientViewEvent = ClientProjectileEvent | ClientHitsplatEvent | ClientSpotanimEvent;

export interface ClientViewTrace {
  readonly schemaVersion: ClientViewSchemaVersion;
  readonly fixtureId: string;
  readonly description: string;
  readonly actors: readonly [ClientViewActorId, ClientViewActorId];
  readonly ticks: readonly ClientViewTick[];
  readonly events: readonly ClientViewEvent[];
  readonly sourceAnchorIds: readonly string[];
}

export interface ClientViewValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

const expectedActors: readonly ClientViewActorId[] = ["self", "opponent"];
const blockedStateKeys = new Set([
  "attackRoll",
  "defenceRoll",
  "hidden",
  "internal",
  "maxHit",
  "pathQueue",
  "pid",
  "randomSeed",
  "server",
  "serverOnly",
  "trueHp"
]);

export function validateClientViewTrace(trace: ClientViewTrace): ClientViewValidationResult {
  const errors: string[] = [];

  if (trace.schemaVersion !== "client-view.v1") {
    errors.push(`schemaVersion must be client-view.v1, got ${trace.schemaVersion}`);
  }

  if (trace.actors.length !== 2 || trace.actors[0] !== "self" || trace.actors[1] !== "opponent") {
    errors.push("actors must be exactly [self, opponent]");
  }

  validateNoBlockedKeys(trace, "trace", errors);
  validateTicks(trace.ticks, errors, new Set(trace.sourceAnchorIds));
  validateEvents(trace.events, errors, new Set(trace.sourceAnchorIds));
  validateTickEventLinks(trace, errors);

  return {
    ok: errors.length === 0,
    errors
  };
}

export function assertValidClientViewTrace(trace: ClientViewTrace): void {
  const result = validateClientViewTrace(trace);

  if (!result.ok) {
    throw new Error(`Invalid client-view trace:\n${result.errors.join("\n")}`);
  }
}

function validateTicks(
  ticks: readonly ClientViewTick[],
  errors: string[],
  sourceAnchorIds: ReadonlySet<string>
): void {
  let lastTick = -1;

  for (const tick of ticks) {
    if (!Number.isInteger(tick.tick) || tick.tick < 0) {
      errors.push(`tick ${tick.tick} must be a non-negative integer`);
    }
    if (tick.tick <= lastTick) {
      errors.push(`tick ${tick.tick} must be strictly greater than previous tick ${lastTick}`);
    }
    lastTick = tick.tick;
    validateCameraState(tick.camera, `tick ${tick.tick}.camera`, errors);
    if (tick.camera !== undefined && !sourceAnchorIds.has("client-camera-held-arrow-contract")) {
      errors.push(`tick ${tick.tick}.camera requires client-camera-held-arrow-contract`);
    }
    validateMinimapState(tick.minimapState, `tick ${tick.tick}.minimapState`, errors);
    if (tick.minimapState !== undefined && !sourceAnchorIds.has("client-minimap-widget-draw-contract")) {
      errors.push(`tick ${tick.tick}.minimapState requires client-minimap-widget-draw-contract`);
    }

    for (const actorId of expectedActors) {
      const actor = tick.actors[actorId];
      if (!actor) {
        errors.push(`tick ${tick.tick} is missing actor ${actorId}`);
        continue;
      }
      if (actor.actorId !== actorId) {
        errors.push(`tick ${tick.tick} actor ${actorId} has mismatched actorId ${actor.actorId}`);
      }
      validateTile(actor.tile, `tick ${tick.tick} ${actorId}.tile`, errors);
      validateEquipment(actor.equipment, `tick ${tick.tick} ${actorId}.equipment`, errors);
      if (sourceAnchorIds.has("client-player-appearance-packet") && actor.appearancePacket === undefined) {
        errors.push(`tick ${tick.tick} ${actorId}.appearancePacket is required by client-player-appearance-packet`);
      }
      validateAppearancePacket(actor.appearancePacket, `tick ${tick.tick} ${actorId}.appearancePacket`, errors);
      validateMinimapDotKind(actor.minimapDotKind, `tick ${tick.tick} ${actorId}.minimapDotKind`, errors);
      validateClientAngle(actor.orientation, `tick ${tick.tick} ${actorId}.orientation`, errors);
      validateClientAngle(actor.rotation, `tick ${tick.tick} ${actorId}.rotation`, errors);
      validateHealthRatio(actor.healthRatio, `tick ${tick.tick} ${actorId}.healthRatio`, errors);
    }
    validateMinimapMapIcons(tick.minimapMapIcons, `tick ${tick.tick}.minimapMapIcons`, errors);
    if (
      tick.minimapMapIcons !== undefined &&
      (!sourceAnchorIds.has("client-minimap-widget-draw-contract") ||
        !sourceAnchorIds.has("client-scene-minimap-sprite-build-contract"))
    ) {
      errors.push(
        `tick ${tick.tick}.minimapMapIcons requires client-minimap-widget-draw-contract and client-scene-minimap-sprite-build-contract`
      );
    }
    validateMinimapEntities(tick.minimapEntities, `tick ${tick.tick}.minimapEntities`, errors);
    validateMinimapHints(tick.minimapHints, `tick ${tick.tick}.minimapHints`, errors);
    validateMinimapDestination(tick.minimapDestination, `tick ${tick.tick}.minimapDestination`, errors);
    if (tick.inventory !== undefined) {
      validateInventory(tick.inventory, `tick ${tick.tick}.inventory`, errors);
    }
    validateSelectedInventoryItem(
      tick.selectedInventoryItem,
      tick.inventory,
      `tick ${tick.tick}.selectedInventoryItem`,
      errors
    );
    if (tick.selectedInventoryItem !== undefined && !sourceAnchorIds.has("client-inventory-use-selection-contract")) {
      errors.push(`tick ${tick.tick}.selectedInventoryItem requires client-inventory-use-selection-contract`);
    }
    validateClickCross(tick.clickCross, `tick ${tick.tick}.clickCross`, errors);
    if (tick.clickCross !== undefined && !sourceAnchorIds.has("client-click-cross-contract")) {
      errors.push(`tick ${tick.tick}.clickCross requires client-click-cross-contract`);
    }
    validateContextMenu(tick.contextMenu, `tick ${tick.tick}.contextMenu`, errors);
    if (
      tick.contextMenu !== undefined &&
      (!sourceAnchorIds.has("client-context-menu-contract") ||
        !sourceAnchorIds.has("client-context-menu-sizing-contract"))
    ) {
      errors.push(`tick ${tick.tick}.contextMenu requires client-context-menu-contract and client-context-menu-sizing-contract`);
    }
    if (tick.hud !== undefined) {
      validateHudState(tick.hud, `tick ${tick.tick}.hud`, errors);
      if (
        !sourceAnchorIds.has("client-stat-run-state-packet-contract") ||
        !sourceAnchorIds.has("client-widget-cs1-stat-run-value-contract")
      ) {
        errors.push(
          `tick ${tick.tick}.hud requires client-stat-run-state-packet-contract and client-widget-cs1-stat-run-value-contract`
        );
      }
      if (tick.hud.skills !== undefined && !sourceAnchorIds.has("client-skill-level-array-contract")) {
        errors.push(`tick ${tick.tick}.hud.skills requires client-skill-level-array-contract`);
      }
    }

    for (const actorId of Object.keys(tick.actors)) {
      if (!isClientViewActorId(actorId)) {
        errors.push(`tick ${tick.tick} has unsupported actor id ${actorId}`);
      }
    }
  }
}

function validateInventory(inventory: ClientInventory, path: string, errors: string[]): void {
  if (inventory.length !== 28) {
    errors.push(`${path} must contain 28 fixed-mode inventory slots`);
  }
  inventory.forEach((slot, index) => {
    if (!Number.isInteger(slot.widgetItemId) || slot.widgetItemId < 0) {
      errors.push(`${path}[${index}].widgetItemId must be a non-negative integer`);
    }
    if (!Number.isInteger(slot.quantity) || slot.quantity < 0) {
      errors.push(`${path}[${index}].quantity must be a non-negative integer`);
    }
    if (slot.widgetItemId === 0 && slot.quantity !== 0) {
      errors.push(`${path}[${index}] empty slots must have quantity 0`);
    }
  });
}

function validateSelectedInventoryItem(
  selectedItem: ClientSelectedInventoryItem | undefined,
  inventory: ClientInventory | undefined,
  path: string,
  errors: string[]
): void {
  if (selectedItem === undefined) {
    return;
  }
  if (!Number.isInteger(selectedItem.itemId) || selectedItem.itemId < 0) {
    errors.push(`${path}.itemId must be a non-negative integer`);
  }
  if (typeof selectedItem.itemName !== "string" || selectedItem.itemName.length === 0) {
    errors.push(`${path}.itemName must be a non-empty string`);
  }
  if (!Number.isInteger(selectedItem.slotIndex) || selectedItem.slotIndex < 0 || selectedItem.slotIndex >= 28) {
    errors.push(`${path}.slotIndex must be a fixed-mode inventory slot index`);
  }
  if (!Number.isInteger(selectedItem.widgetId) || selectedItem.widgetId <= 0) {
    errors.push(`${path}.widgetId must be a positive widget id`);
  }
  const inventorySlot = inventory?.[selectedItem.slotIndex];
  if (inventorySlot && inventorySlot.widgetItemId !== selectedItem.itemId + 1) {
    errors.push(`${path} must match the selected source inventory slot widget item id`);
  }
}

function validateClickCross(clickCross: ClientClickCrossState | undefined, path: string, errors: string[]): void {
  if (clickCross === undefined) {
    return;
  }
  if (!Number.isInteger(clickCross.x) || clickCross.x < 0) {
    errors.push(`${path}.x must be a non-negative client canvas coordinate`);
  }
  if (!Number.isInteger(clickCross.y) || clickCross.y < 0) {
    errors.push(`${path}.y must be a non-negative client canvas coordinate`);
  }
  if (clickCross.color !== 1 && clickCross.color !== 2) {
    errors.push(`${path}.color must be client mouseCrossColor 1 or 2`);
  }
  if (!Number.isInteger(clickCross.state) || clickCross.state < 0 || clickCross.state >= 400) {
    errors.push(`${path}.state must be an active client mouseCrossState from 0 to 399`);
  }
}

function validateContextMenu(contextMenu: ClientContextMenuState | undefined, path: string, errors: string[]): void {
  if (contextMenu === undefined) {
    return;
  }
  if (!Number.isInteger(contextMenu.x) || contextMenu.x < 0) {
    errors.push(`${path}.x must be a non-negative client canvas coordinate`);
  }
  if (!Number.isInteger(contextMenu.y) || contextMenu.y < 0) {
    errors.push(`${path}.y must be a non-negative client canvas coordinate`);
  }
  if (!Number.isInteger(contextMenu.width) || contextMenu.width <= 0) {
    errors.push(`${path}.width must be a positive client menu width`);
  }
  if (!Number.isInteger(contextMenu.height) || contextMenu.height <= 0) {
    errors.push(`${path}.height must be a positive client menu height`);
  }
  if (!Array.isArray(contextMenu.entries) || contextMenu.entries.length === 0 || contextMenu.entries.length > 500) {
    errors.push(`${path}.entries must contain 1 to 500 client menu entries`);
    return;
  }
  contextMenu.entries.forEach((entry, index) => {
    const entryPath = `${path}.entries[${index}]`;
    if (typeof entry.actionText !== "string" || entry.actionText.length === 0) {
      errors.push(`${entryPath}.actionText must be a non-empty string`);
    }
    if (typeof entry.targetText !== "string") {
      errors.push(`${entryPath}.targetText must be a string`);
    }
    if (!Number.isInteger(entry.opcode)) {
      errors.push(`${entryPath}.opcode must be an integer`);
    }
    validateOptionalInteger(entry.identifier, `${entryPath}.identifier`, errors);
    validateOptionalInteger(entry.argument1, `${entryPath}.argument1`, errors);
    validateOptionalInteger(entry.argument2, `${entryPath}.argument2`, errors);
    if (entry.shiftClick !== undefined && typeof entry.shiftClick !== "boolean") {
      errors.push(`${entryPath}.shiftClick must be a boolean when present`);
    }
  });
}

function validateOptionalInteger(value: number | undefined, path: string, errors: string[]): void {
  if (value !== undefined && !Number.isInteger(value)) {
    errors.push(`${path} must be an integer when present`);
  }
}

function validateClientAngle(value: number | undefined, path: string, errors: string[]): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 2047)) {
    errors.push(`${path} must be a client angle between 0 and 2047 when present`);
  }
}

function validateHudState(hud: ClientHudState, path: string, errors: string[]): void {
  validateSkillValue(hud.hitpoints, `${path}.hitpoints`, errors);
  validateSkillValue(hud.prayer, `${path}.prayer`, errors);
  validatePercent(hud.runEnergy, `${path}.runEnergy`, errors);
  validatePercent(hud.specialEnergy, `${path}.specialEnergy`, errors);
  validateOptionalBoolean(hud.specialActive, `${path}.specialActive`, errors);
  validateOptionalInteger(hud.attackSet, `${path}.attackSet`, errors);
  validateOptionalBoolean(hud.autoRetaliate, `${path}.autoRetaliate`, errors);
  validateOptionalInteger(hud.weaponTypeConfig, `${path}.weaponTypeConfig`, errors);
  validateOptionalInteger(hud.autocast, `${path}.autocast`, errors);
  validateOptionalBoolean(hud.defensiveCast, `${path}.defensiveCast`, errors);
  if (hud.skills !== undefined) {
    if (typeof hud.skills !== "object" || Array.isArray(hud.skills)) {
      errors.push(`${path}.skills must be an object when present`);
    } else {
      for (const [skillId, value] of Object.entries(hud.skills)) {
        validateSkillValue(value, `${path}.skills.${skillId}`, errors);
      }
    }
  }
}

function validateOptionalBoolean(value: boolean | undefined, path: string, errors: string[]): void {
  if (value !== undefined && typeof value !== "boolean") {
    errors.push(`${path} must be a boolean when present`);
  }
}

function validateCameraState(camera: ClientViewCameraState | undefined, path: string, errors: string[]): void {
  if (camera === undefined) {
    return;
  }
  if (!Number.isInteger(camera.yaw) || camera.yaw < 0 || camera.yaw > 2047) {
    errors.push(`${path}.yaw must be a client angle between 0 and 2047`);
  }
  if (!Number.isInteger(camera.pitch) || camera.pitch < 128 || camera.pitch > 383) {
    errors.push(`${path}.pitch must be a client pitch between 128 and 383`);
  }
}

function validateMinimapState(minimapState: number | undefined, path: string, errors: string[]): void {
  if (minimapState === undefined) {
    return;
  }
  if (!Number.isInteger(minimapState) || minimapState < 0 || minimapState > 255) {
    errors.push(`${path} must be an unsigned byte state when present`);
  }
}

function validateSkillValue(skill: ClientSkillValue, path: string, errors: string[]): void {
  if (!Number.isInteger(skill.current) || skill.current < 0) {
    errors.push(`${path}.current must be a non-negative integer`);
  }
  if (!Number.isInteger(skill.fixed) || skill.fixed <= 0) {
    errors.push(`${path}.fixed must be a positive integer`);
  }
}

function validatePercent(value: number, path: string, errors: string[]): void {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    errors.push(`${path} must be an integer percentage between 0 and 100`);
  }
}

function validateEvents(
  events: readonly ClientViewEvent[],
  errors: string[],
  sourceAnchorIds: ReadonlySet<string>
): void {
  const ids = new Set<string>();

  for (const event of events) {
    if (ids.has(event.id)) {
      errors.push(`event id ${event.id} is duplicated`);
    }
    ids.add(event.id);

    validateWindow(event.visibleWindow, `event ${event.id}.visibleWindow`, errors);

    if (!Number.isInteger(event.observedTick) || event.observedTick < 0) {
      errors.push(`event ${event.id} observedTick must be a non-negative integer`);
    }
    if (event.observedTick > event.visibleWindow.lastTick) {
      errors.push(`event ${event.id} observedTick must not be after its visibleWindow`);
    }

    if (event.kind === "projectile") {
      if (
        !sourceAnchorIds.has("client-projectile-packet-lifecycle") ||
        !sourceAnchorIds.has("client-projectile-motion-contract")
      ) {
        errors.push(
          `event ${event.id} projectile requires client-projectile-packet-lifecycle and client-projectile-motion-contract`
        );
      }
      validateActorId(event.sourceActorId, `event ${event.id}.sourceActorId`, errors);
      validateActorId(event.targetActorId, `event ${event.id}.targetActorId`, errors);
      validateTile(event.startTile, `event ${event.id}.startTile`, errors);
      validateTile(event.targetTile, `event ${event.id}.targetTile`, errors);
      validateProjectilePacket(event, errors);
    } else if (event.kind === "hitsplat") {
      if (
        !sourceAnchorIds.has("client-hitsplat-packet-contract") ||
        !sourceAnchorIds.has("client-hitsplat-definition-contract") ||
        !sourceAnchorIds.has("client-hitsplat-draw-contract")
      ) {
        errors.push(
          `event ${event.id} hitsplat requires client-hitsplat-packet-contract, client-hitsplat-definition-contract, and client-hitsplat-draw-contract`
        );
      }
      validateActorId(event.targetActorId, `event ${event.id}.targetActorId`, errors);
      validateHitsplatPacket(event, errors);
    } else if (event.kind === "spotanim") {
      if (event.observedTick < event.visibleWindow.firstTick) {
        errors.push(`event ${event.id} observedTick must fall within spotanim visibleWindow`);
      }
      if (!sourceAnchorIds.has("client-spotanim-sequence-contract")) {
        errors.push(`event ${event.id} spotanim requires client-spotanim-sequence-contract`);
      }
      validateActorId(event.actorId, `event ${event.id}.actorId`, errors);
      if (!Number.isInteger(event.spotanimId) || event.spotanimId < 0) {
        errors.push(`event ${event.id}.spotanimId must be a non-negative integer`);
      }
    } else {
      const unknownEvent = event as { readonly id?: string; readonly kind?: string };
      errors.push(`event ${unknownEvent.id ?? "unknown"} has unsupported kind ${unknownEvent.kind}`);
    }
  }
}

function validateHitsplatPacket(event: ClientHitsplatEvent, errors: string[]): void {
  if (!Number.isInteger(event.primaryType) || event.primaryType < 0) {
    errors.push(`event ${event.id}.primaryType must be a non-negative integer hitsplat definition id`);
  }
  if (!Number.isInteger(event.primaryValue) || event.primaryValue < 0) {
    errors.push(`event ${event.id}.primaryValue must be a non-negative integer`);
  }
  if (!Number.isInteger(event.secondaryType) || event.secondaryType < -1) {
    errors.push(`event ${event.id}.secondaryType must be -1 or a non-negative integer hitsplat definition id`);
  }
  if (!Number.isInteger(event.secondaryValue) || event.secondaryValue < 0) {
    errors.push(`event ${event.id}.secondaryValue must be a non-negative integer`);
  }
  if (event.secondaryType < 0 && event.secondaryValue !== 0) {
    errors.push(`event ${event.id}.secondaryValue must be 0 when secondaryType is -1`);
  }
  if (!Number.isInteger(event.delayCycles) || event.delayCycles < 0) {
    errors.push(`event ${event.id}.delayCycles must be a non-negative integer`);
  }
  if (!Number.isInteger(event.slotIndex) || event.slotIndex < 0 || event.slotIndex > 3) {
    errors.push(`event ${event.id}.slotIndex must be an integer from 0 to 3`);
  }
  if (!Number.isInteger(event.definitionDurationCycles) || event.definitionDurationCycles <= 0) {
    errors.push(`event ${event.id}.definitionDurationCycles must be a positive integer`);
  }
  if (event.expiresOnClientCycle !== event.observedTick + event.delayCycles + event.definitionDurationCycles) {
    errors.push(
      `event ${event.id}.expiresOnClientCycle must equal observedTick + delayCycles + definitionDurationCycles`
    );
  }
  if (event.visibleWindow.firstTick !== event.observedTick + event.delayCycles) {
    errors.push(`event ${event.id}.visibleWindow.firstTick must equal observedTick + delayCycles`);
  }
  if (event.visibleWindow.lastTick !== event.expiresOnClientCycle) {
    errors.push(`event ${event.id}.visibleWindow.lastTick must equal expiresOnClientCycle`);
  }
}

function validateProjectilePacket(event: ClientProjectileEvent, errors: string[]): void {
  if (!Number.isInteger(event.projectileId) || event.projectileId < 0) {
    errors.push(`event ${event.id}.projectileId must be a non-negative integer gfx id`);
  }
  if (!Number.isInteger(event.targetIndex)) {
    errors.push(`event ${event.id}.targetIndex must be an integer`);
  }
  if (!Number.isInteger(event.startHeight) || event.startHeight < 0) {
    errors.push(`event ${event.id}.startHeight must be a non-negative integer`);
  }
  if (!Number.isInteger(event.endHeight) || event.endHeight < 0) {
    errors.push(`event ${event.id}.endHeight must be a non-negative integer`);
  }
  if (!Number.isInteger(event.delayCycles) || event.delayCycles < 0) {
    errors.push(`event ${event.id}.delayCycles must be a non-negative integer`);
  }
  if (!Number.isInteger(event.durationCycles) || event.durationCycles < event.delayCycles) {
    errors.push(`event ${event.id}.durationCycles must be an integer greater than or equal to delayCycles`);
  }
  if (event.visibleWindow.firstTick !== event.observedTick + event.delayCycles) {
    errors.push(`event ${event.id}.visibleWindow.firstTick must equal observedTick + delayCycles`);
  }
  if (event.visibleWindow.lastTick !== event.observedTick + event.durationCycles) {
    errors.push(`event ${event.id}.visibleWindow.lastTick must equal observedTick + durationCycles`);
  }
  if (!Number.isInteger(event.curve)) {
    errors.push(`event ${event.id}.curve must be an integer`);
  }
  if (!Number.isInteger(event.offset) || event.offset < 0) {
    errors.push(`event ${event.id}.offset must be a non-negative integer`);
  }
  if (typeof event.skipTravel !== "boolean") {
    errors.push(`event ${event.id}.skipTravel must be boolean`);
  }
  if (event.skipTravel && (event.startTile.x !== event.targetTile.x || event.startTile.y !== event.targetTile.y)) {
    errors.push(`event ${event.id}.skipTravel packets must start from the target tile`);
  }
}

function validateTickEventLinks(trace: ClientViewTrace, errors: string[]): void {
  const eventIds = new Set(trace.events.map((event) => event.id));

  for (const tick of trace.ticks) {
    for (const eventId of tick.eventIds) {
      if (!eventIds.has(eventId)) {
        errors.push(`tick ${tick.tick} references missing event ${eventId}`);
      }
    }
  }
}

function validateWindow(window: ClientVisibleWindow, path: string, errors: string[]): void {
  if (!Number.isInteger(window.firstTick) || !Number.isInteger(window.lastTick)) {
    errors.push(`${path} ticks must be integers`);
  }
  if (window.firstTick < 0 || window.lastTick < window.firstTick) {
    errors.push(`${path} must be a non-negative ordered tick range`);
  }
}

function validateTile(tile: TilePosition, path: string, errors: string[]): void {
  if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
    errors.push(`${path}.x and ${path}.y must be integers`);
  }
  if (tile.plane !== undefined && !Number.isInteger(tile.plane)) {
    errors.push(`${path}.plane must be an integer when present`);
  }
}

function validateEquipment(equipment: VisibleEquipment, path: string, errors: string[]): void {
  for (const [slot, item] of Object.entries(equipment)) {
    if (!isEquipmentSlot(slot)) {
      errors.push(`${path} contains unsupported slot ${slot}`);
      continue;
    }
    if (!Number.isInteger(item?.itemId) || item.itemId < 0) {
      errors.push(`${path}.${slot}.itemId must be a non-negative integer`);
    }
    if (typeof item?.name !== "string" || item.name.length === 0) {
      errors.push(`${path}.${slot}.name must be a non-empty string`);
    }
  }
}

function validateAppearancePacket(appearancePacket: readonly number[] | undefined, path: string, errors: string[]): void {
  if (appearancePacket === undefined) {
    return;
  }
  if (!Array.isArray(appearancePacket)) {
    errors.push(`${path} must be an array of unsigned bytes when present`);
    return;
  }
  if (appearancePacket.length === 0) {
    errors.push(`${path} must not be empty when present`);
  }
  appearancePacket.forEach((byte, index) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      errors.push(`${path}[${index}] must be an unsigned byte`);
    }
  });
}

function validateMinimapEntities(
  entities: readonly ClientMinimapEntity[] | undefined,
  path: string,
  errors: string[]
): void {
  if (entities === undefined) {
    return;
  }
  if (!Array.isArray(entities)) {
    errors.push(`${path} must be an array when present`);
    return;
  }
  for (const [index, entity] of entities.entries()) {
    validateMinimapSourceId(entity.id, `${path}[${index}].id`, errors);
    validateTile(entity.tile, `${path}[${index}].tile`, errors);
    validateMinimapDotKind(entity.kind, `${path}[${index}].kind`, errors);
  }
}

function validateMinimapMapIcons(
  icons: readonly ClientMinimapMapIcon[] | undefined,
  path: string,
  errors: string[]
): void {
  if (icons === undefined) {
    return;
  }
  if (!Array.isArray(icons)) {
    errors.push(`${path} must be an array when present`);
    return;
  }
  for (const [index, icon] of icons.entries()) {
    validateMinimapSourceId(icon.id, `${path}[${index}].id`, errors);
    validateTile(icon.tile, `${path}[${index}].tile`, errors);
    if (!Number.isInteger(icon.mapIconId) || icon.mapIconId < 0) {
      errors.push(`${path}[${index}].mapIconId must be a non-negative integer`);
    }
    if (!Number.isInteger(icon.objectId) || icon.objectId < 0) {
      errors.push(`${path}[${index}].objectId must be a non-negative integer`);
    }
  }
}

function validateMinimapHints(
  hints: readonly ClientMinimapHint[] | undefined,
  path: string,
  errors: string[]
): void {
  if (hints === undefined) {
    return;
  }
  if (!Array.isArray(hints)) {
    errors.push(`${path} must be an array when present`);
    return;
  }
  for (const [index, hint] of hints.entries()) {
    validateMinimapSourceId(hint.id, `${path}[${index}].id`, errors);
    validateTile(hint.tile, `${path}[${index}].tile`, errors);
  }
}

function validateMinimapDestination(
  destination: ClientMinimapDestination | undefined,
  path: string,
  errors: string[]
): void {
  if (destination === undefined) {
    return;
  }
  validateTile(destination.tile, `${path}.tile`, errors);
}

function validateMinimapSourceId(id: string, path: string, errors: string[]): void {
  if (typeof id !== "string" || id.length === 0) {
    errors.push(`${path} must be a non-empty string`);
  }
}

function validateMinimapDotKind(kind: string | undefined, path: string, errors: string[]): void {
  if (kind === undefined) {
    return;
  }
  if (!isClientMinimapDotKind(kind)) {
    errors.push(`${path} must be item, npc, player, friend, team, or friends-chat`);
  }
}

function validateHealthRatio(healthRatio: number | undefined, path: string, errors: string[]): void {
  if (healthRatio === undefined) {
    return;
  }
  if (!Number.isFinite(healthRatio) || healthRatio < 0 || healthRatio > 1) {
    errors.push(`${path} must be a finite number between 0 and 1 when present`);
  }
}

function validateActorId(actorId: string, path: string, errors: string[]): void {
  if (!isClientViewActorId(actorId)) {
    errors.push(`${path} must be self or opponent`);
  }
}

function validateNoBlockedKeys(value: unknown, path: string, errors: string[]): void {
  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (blockedStateKeys.has(key)) {
      errors.push(`${path}.${key} is server-only or hidden state and is not allowed in client-view fixtures`);
    }
    validateNoBlockedKeys(child, `${path}.${key}`, errors);
  }
}

function isClientViewActorId(value: string): value is ClientViewActorId {
  return expectedActors.includes(value as ClientViewActorId);
}

function isEquipmentSlot(value: string): value is EquipmentSlot {
  return [
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
  ].includes(value);
}

function isClientMinimapDotKind(value: string): value is ClientMinimapDotKind {
  return ["item", "npc", "player", "friend", "team", "friends-chat"].includes(value);
}
