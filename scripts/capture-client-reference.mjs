import crypto from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  nhClientCapturePlan,
  referenceManifestFileName,
  renderReferenceTargets
} from "./render-reference-targets.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSourceRoot = "C:\\codeximg\\nh-client-reference";
const defaultOutputRoot = path.join(projectRoot, "fixtures", "reference", "client-render");
const nhClientRoot = path.resolve(projectRoot, "..", "Nh184-Client");
const clientMinimapDotKinds = new Set(["item", "npc", "player", "friend", "team", "friends-chat"]);
const clientSkillKeys = [
  "attack",
  "defence",
  "strength",
  "hitpoints",
  "ranged",
  "prayer",
  "magic",
  "cooking",
  "woodcutting",
  "fletching",
  "fishing",
  "firemaking",
  "crafting",
  "smithing",
  "mining",
  "herblore",
  "agility",
  "thieving",
  "slayer",
  "farming",
  "runecrafting",
  "hunter",
  "construction"
];

function parseArgs(argv) {
  const options = {
    sourceRoot: process.env.NH_CLIENT_REFERENCE_DIR ?? defaultSourceRoot,
    outputRoot: defaultOutputRoot,
    dryRun: false,
    printPlan: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--print-plan") {
      options.printPlan = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--source") {
      options.sourceRoot = path.resolve(argv[index + 1] ?? "");
      index += 1;
    } else if (arg === "--out") {
      options.outputRoot = path.resolve(argv[index + 1] ?? "");
      index += 1;
    } else if (!arg.startsWith("--")) {
      options.sourceRoot = path.resolve(arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return [
    "Usage: npm run capture:client -- --source <client-frame-folder>",
    "",
    "The source folder must contain viewport-cropped PNGs from the real Nh client",
    "and matching .client-view.json traces from the capture bridge:",
    ...renderReferenceTargets.map(
      (target) => `  ${target.fileName}  (${target.camera}, cycle ${target.cycle})`
    ),
    "",
    "Real-client capture hook plan:",
    `  ${nhClientCapturePlan}`,
    "",
    `Default source: ${defaultSourceRoot}`,
    `Default output: ${defaultOutputRoot}`
  ].join("\n");
}

async function assertDirectory(directory) {
  try {
    const stats = await stat(directory);
    if (!stats.isDirectory()) {
      throw new Error(`${directory} is not a directory.`);
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Reference source folder does not exist: ${directory}\n\n${usage()}`);
    }
    throw error;
  }
}

function readPngSize(buffer, filePath) {
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`Not a PNG file: ${filePath}`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

async function readFrame(target, sourceRoot) {
  const sourcePath = path.join(sourceRoot, target.fileName);
  const buffer = await readFile(sourcePath);
  const size = readPngSize(buffer, sourcePath);
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const clientViewTrace = await readClientViewTrace(target, sourceRoot);
  if (!clientViewTrace) {
    throw new Error(`Missing client-view trace for ${target.fileName}: ${path.join(sourceRoot, clientViewTraceFileName(target.fileName))}`);
  }

  return {
    target,
    sourcePath,
    buffer,
    sha256,
    width: size.width,
    height: size.height,
    clientViewTrace
  };
}

async function readClientViewTrace(target, sourceRoot) {
  const fileName = clientViewTraceFileName(target.fileName);
  const sourcePath = path.join(sourceRoot, fileName);

  let text;
  try {
    text = await readFile(sourcePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  text = stripJsonBom(text);
  const trace = JSON.parse(text);
  validateClientViewTraceShape(trace, sourcePath);
  validateClientViewTraceTarget(trace, target, sourcePath);
  const captureCycle = clientViewTraceCaptureCycle(trace);
  return {
    fileName,
    sourcePath,
    text,
    fixtureId: trace.fixtureId,
    captureCycle,
    sha256: crypto.createHash("sha256").update(text).digest("hex")
  };
}

function validateClientViewTraceTarget(trace, target, sourcePath) {
  const expectations = target.traceExpectations ?? {};
  const captureCycle = clientViewTraceCaptureCycle(trace);

  if (expectations.requiredTick && !Number.isInteger(captureCycle)) {
    throw new Error(`Client-view trace must include a captured client cycle for ${target.fileName}: ${sourcePath}`);
  }

  if (expectations.requiredCameraPreset) {
    const tick = trace.ticks.find((candidate) => candidate?.tick === captureCycle) ?? trace.ticks[0];
    if (tick?.camera?.yaw !== target.cameraPreset.yaw || tick?.camera?.pitch !== target.cameraPreset.pitch) {
      throw new Error(
        `Client-view trace camera must match ${target.camera} preset yaw ${target.cameraPreset.yaw} pitch ${target.cameraPreset.pitch} for ${target.fileName}: ${sourcePath}`
      );
    }
  }

  for (const anchorId of expectations.requiredSourceAnchorIds ?? []) {
    if (!trace.sourceAnchorIds.includes(anchorId)) {
      throw new Error(`Client-view trace ${target.fileName} is missing required source anchor ${anchorId}: ${sourcePath}`);
    }
  }

  for (const kind of expectations.requiredEventKinds ?? []) {
    if (!trace.events.some((event) => event?.kind === kind)) {
      throw new Error(`Client-view trace ${target.fileName} must include a ${kind} event: ${sourcePath}`);
    }
  }
}

function stripJsonBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function clientViewTraceCaptureCycle(trace) {
  return trace.ticks.find((tick) => Number.isInteger(tick?.tick))?.tick ?? null;
}

function validateClientViewTraceShape(trace, sourcePath) {
  if (trace?.schemaVersion !== "client-view.v1") {
    throw new Error(`Invalid client-view trace schema in ${sourcePath}`);
  }
  if (typeof trace.fixtureId !== "string" || trace.fixtureId.length === 0) {
    throw new Error(`Client-view trace is missing fixtureId: ${sourcePath}`);
  }
  if (!Array.isArray(trace.sourceAnchorIds) || !trace.sourceAnchorIds.includes("client-player-appearance-packet")) {
    throw new Error(`Client-view trace is missing client-player-appearance-packet source anchor: ${sourcePath}`);
  }
  if (!Array.isArray(trace.ticks) || trace.ticks.length === 0) {
    throw new Error(`Client-view trace has no ticks: ${sourcePath}`);
  }
  if (!Array.isArray(trace.events)) {
    throw new Error(`Client-view trace events must be an array: ${sourcePath}`);
  }

  for (const [tickIndex, tick] of trace.ticks.entries()) {
    if (tick?.camera !== undefined) {
      validateClientViewCameraState(tick.camera, sourcePath, tickIndex);
      if (!trace.sourceAnchorIds.includes("client-camera-held-arrow-contract")) {
        throw new Error(`Client-view trace tick ${tickIndex} camera is missing client-camera-held-arrow-contract source anchor: ${sourcePath}`);
      }
    }
    if (tick?.minimapState !== undefined) {
      validateClientViewMinimapState(tick.minimapState, sourcePath, tickIndex);
      if (!trace.sourceAnchorIds.includes("client-minimap-widget-draw-contract")) {
        throw new Error(`Client-view trace tick ${tickIndex} minimapState is missing client-minimap-widget-draw-contract source anchor: ${sourcePath}`);
      }
    }
    if (tick?.minimapEntities !== undefined) {
      validateClientViewMinimapEntities(tick.minimapEntities, sourcePath, tickIndex);
      if (
        !trace.sourceAnchorIds.includes("client-minimap-widget-draw-contract") ||
        !trace.sourceAnchorIds.includes("client-minimap-dot-projection-contract")
      ) {
        throw new Error(`Client-view trace tick ${tickIndex} minimapEntities is missing client minimap dot source anchors: ${sourcePath}`);
      }
    }
    if (tick?.minimapMapIcons !== undefined) {
      validateClientViewMinimapMapIcons(tick.minimapMapIcons, sourcePath, tickIndex);
      if (
        !trace.sourceAnchorIds.includes("client-minimap-widget-draw-contract") ||
        !trace.sourceAnchorIds.includes("client-scene-minimap-sprite-build-contract")
      ) {
        throw new Error(`Client-view trace tick ${tickIndex} minimapMapIcons is missing client minimap map-icon source anchors: ${sourcePath}`);
      }
    }
    if (tick?.minimapHints !== undefined) {
      validateClientViewMinimapHints(tick.minimapHints, sourcePath, tickIndex);
      if (
        !trace.sourceAnchorIds.includes("client-minimap-widget-draw-contract") ||
        !trace.sourceAnchorIds.includes("client-minimap-hint-arrow-contract")
      ) {
        throw new Error(`Client-view trace tick ${tickIndex} minimapHints is missing client minimap hint source anchors: ${sourcePath}`);
      }
    }
    if (tick?.minimapDestination !== undefined) {
      validateClientViewMinimapDestination(tick.minimapDestination, sourcePath, tickIndex);
      if (!trace.sourceAnchorIds.includes("client-minimap-widget-draw-contract")) {
        throw new Error(`Client-view trace tick ${tickIndex} minimapDestination is missing client-minimap-widget-draw-contract source anchor: ${sourcePath}`);
      }
    }
    if (tick?.inventory !== undefined) {
      validateClientViewInventory(tick.inventory, sourcePath, tickIndex);
      if (!trace.sourceAnchorIds.includes("client-container-widget-update-contract")) {
        throw new Error(`Client-view trace tick ${tickIndex} inventory is missing client-container-widget-update-contract source anchor: ${sourcePath}`);
      }
    }
    if (tick?.selectedInventoryItem !== undefined) {
      validateClientViewSelectedInventoryItem(tick.selectedInventoryItem, tick.inventory, sourcePath, tickIndex);
      if (!trace.sourceAnchorIds.includes("client-inventory-use-selection-contract")) {
        throw new Error(`Client-view trace tick ${tickIndex} selectedInventoryItem is missing client-inventory-use-selection-contract source anchor: ${sourcePath}`);
      }
    }
    if (tick?.clickCross !== undefined) {
      validateClientViewClickCross(tick.clickCross, sourcePath, tickIndex);
      if (!trace.sourceAnchorIds.includes("client-click-cross-contract")) {
        throw new Error(`Client-view trace tick ${tickIndex} clickCross is missing client-click-cross-contract source anchor: ${sourcePath}`);
      }
    }
    if (tick?.contextMenu !== undefined) {
      validateClientViewContextMenu(tick.contextMenu, sourcePath, tickIndex);
      if (
        !trace.sourceAnchorIds.includes("client-context-menu-contract") ||
        !trace.sourceAnchorIds.includes("client-context-menu-sizing-contract")
      ) {
        throw new Error(`Client-view trace tick ${tickIndex} contextMenu is missing client context-menu source anchors: ${sourcePath}`);
      }
    }
    if (tick?.hud !== undefined) {
      validateClientViewHudState(tick.hud, sourcePath, tickIndex);
      if (
        !trace.sourceAnchorIds.includes("client-stat-run-state-packet-contract") ||
        !trace.sourceAnchorIds.includes("client-widget-cs1-stat-run-value-contract")
      ) {
        throw new Error(`Client-view trace tick ${tickIndex} hud is missing client stat/widget source anchors: ${sourcePath}`);
      }
      if (tick.hud.skills !== undefined && !trace.sourceAnchorIds.includes("client-skill-level-array-contract")) {
        throw new Error(`Client-view trace tick ${tickIndex} hud.skills is missing client-skill-level-array-contract source anchor: ${sourcePath}`);
      }
    }
    for (const actorId of ["self", "opponent"]) {
      const appearancePacket = tick?.actors?.[actorId]?.appearancePacket;
      if (!Array.isArray(appearancePacket) || appearancePacket.length === 0) {
        throw new Error(`Client-view trace tick ${tickIndex} ${actorId} is missing raw appearance bytes: ${sourcePath}`);
      }
    }
    if (!Array.isArray(tick?.eventIds)) {
      throw new Error(`Client-view trace tick ${tickIndex} eventIds must be an array: ${sourcePath}`);
    }
    for (const [eventIndex, eventId] of tick.eventIds.entries()) {
      if (typeof eventId !== "string" || eventId.length === 0) {
        throw new Error(`Client-view trace tick ${tickIndex} eventIds[${eventIndex}] must be a non-empty string: ${sourcePath}`);
      }
    }
  }

  validateClientViewEvents(trace.events, trace.sourceAnchorIds, sourcePath);
  validateClientViewTickEventLinks(trace, sourcePath);
}

function validateClientViewCameraState(camera, sourcePath, tickIndex) {
  if (!camera || typeof camera !== "object") {
    throw new Error(`Client-view trace tick ${tickIndex} camera must be an object: ${sourcePath}`);
  }
  if (!Number.isInteger(camera.yaw) || camera.yaw < 0 || camera.yaw > 2047) {
    throw new Error(`Client-view trace tick ${tickIndex} camera.yaw must be a client angle between 0 and 2047: ${sourcePath}`);
  }
  if (!Number.isInteger(camera.pitch) || camera.pitch < 128 || camera.pitch > 383) {
    throw new Error(`Client-view trace tick ${tickIndex} camera.pitch must be a client pitch between 128 and 383: ${sourcePath}`);
  }
}

function validateClientViewMinimapState(minimapState, sourcePath, tickIndex) {
  if (!Number.isInteger(minimapState) || minimapState < 0 || minimapState > 255) {
    throw new Error(`Client-view trace tick ${tickIndex} minimapState must be an unsigned byte state: ${sourcePath}`);
  }
}

function validateClientViewMinimapDestination(destination, sourcePath, tickIndex) {
  if (!destination || typeof destination !== "object") {
    throw new Error(`Client-view trace tick ${tickIndex} minimapDestination must be an object: ${sourcePath}`);
  }
  validateClientViewTile(destination.tile, sourcePath, tickIndex, "minimapDestination.tile");
}

function validateClientViewMinimapEntities(entities, sourcePath, tickIndex) {
  if (!Array.isArray(entities)) {
    throw new Error(`Client-view trace tick ${tickIndex} minimapEntities must be an array: ${sourcePath}`);
  }
  for (const [entityIndex, entity] of entities.entries()) {
    validateClientViewMinimapId(entity?.id, sourcePath, tickIndex, `minimapEntities[${entityIndex}].id`);
    validateClientViewTile(entity?.tile, sourcePath, tickIndex, `minimapEntities[${entityIndex}].tile`);
    validateClientViewMinimapKind(entity?.kind, sourcePath, tickIndex, `minimapEntities[${entityIndex}].kind`);
  }
}

function validateClientViewMinimapMapIcons(icons, sourcePath, tickIndex) {
  if (!Array.isArray(icons)) {
    throw new Error(`Client-view trace tick ${tickIndex} minimapMapIcons must be an array: ${sourcePath}`);
  }
  for (const [iconIndex, icon] of icons.entries()) {
    validateClientViewMinimapId(icon?.id, sourcePath, tickIndex, `minimapMapIcons[${iconIndex}].id`);
    validateClientViewTile(icon?.tile, sourcePath, tickIndex, `minimapMapIcons[${iconIndex}].tile`);
    if (!Number.isInteger(icon?.mapIconId) || icon.mapIconId < 0) {
      throw new Error(`Client-view trace tick ${tickIndex} minimapMapIcons[${iconIndex}].mapIconId must be a non-negative integer: ${sourcePath}`);
    }
    if (!Number.isInteger(icon?.objectId) || icon.objectId < 0) {
      throw new Error(`Client-view trace tick ${tickIndex} minimapMapIcons[${iconIndex}].objectId must be a non-negative integer: ${sourcePath}`);
    }
  }
}

function validateClientViewMinimapHints(hints, sourcePath, tickIndex) {
  if (!Array.isArray(hints)) {
    throw new Error(`Client-view trace tick ${tickIndex} minimapHints must be an array: ${sourcePath}`);
  }
  for (const [hintIndex, hint] of hints.entries()) {
    validateClientViewMinimapId(hint?.id, sourcePath, tickIndex, `minimapHints[${hintIndex}].id`);
    validateClientViewTile(hint?.tile, sourcePath, tickIndex, `minimapHints[${hintIndex}].tile`);
  }
}

function validateClientViewTile(tile, sourcePath, tickIndex, fieldPath) {
  if (!tile || typeof tile !== "object") {
    throw new Error(`Client-view trace tick ${tickIndex} ${fieldPath} must be an object: ${sourcePath}`);
  }
  if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
    throw new Error(`Client-view trace tick ${tickIndex} ${fieldPath}.x and ${fieldPath}.y must be integers: ${sourcePath}`);
  }
  if (tile.plane !== undefined && !Number.isInteger(tile.plane)) {
    throw new Error(`Client-view trace tick ${tickIndex} ${fieldPath}.plane must be an integer when present: ${sourcePath}`);
  }
}

function validateClientViewMinimapId(id, sourcePath, tickIndex, fieldPath) {
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`Client-view trace tick ${tickIndex} ${fieldPath} must be a non-empty string: ${sourcePath}`);
  }
}

function validateClientViewMinimapKind(kind, sourcePath, tickIndex, fieldPath) {
  if (!clientMinimapDotKinds.has(kind)) {
    throw new Error(`Client-view trace tick ${tickIndex} ${fieldPath} must be item, npc, player, friend, team, or friends-chat: ${sourcePath}`);
  }
}

function validateClientViewInventory(inventory, sourcePath, tickIndex) {
  if (!Array.isArray(inventory)) {
    throw new Error(`Client-view trace tick ${tickIndex} inventory must be an array: ${sourcePath}`);
  }
  if (inventory.length !== 28) {
    throw new Error(`Client-view trace tick ${tickIndex} inventory must contain 28 fixed-mode slots: ${sourcePath}`);
  }
  for (const [slotIndex, slot] of inventory.entries()) {
    if (!Number.isInteger(slot?.widgetItemId) || slot.widgetItemId < 0) {
      throw new Error(`Client-view trace tick ${tickIndex} inventory slot ${slotIndex} has invalid widgetItemId: ${sourcePath}`);
    }
    if (!Number.isInteger(slot?.quantity) || slot.quantity < 0) {
      throw new Error(`Client-view trace tick ${tickIndex} inventory slot ${slotIndex} has invalid quantity: ${sourcePath}`);
    }
    if (slot.widgetItemId === 0 && slot.quantity !== 0) {
      throw new Error(`Client-view trace tick ${tickIndex} inventory slot ${slotIndex} empty item has nonzero quantity: ${sourcePath}`);
    }
  }
}

function validateClientViewSelectedInventoryItem(selectedItem, inventory, sourcePath, tickIndex) {
  if (!selectedItem || typeof selectedItem !== "object" || Array.isArray(selectedItem)) {
    throw new Error(`Client-view trace tick ${tickIndex} selectedInventoryItem must be an object: ${sourcePath}`);
  }
  if (!Number.isInteger(selectedItem.itemId) || selectedItem.itemId < 0) {
    throw new Error(`Client-view trace tick ${tickIndex} selectedInventoryItem.itemId must be a non-negative integer: ${sourcePath}`);
  }
  if (typeof selectedItem.itemName !== "string" || selectedItem.itemName.length === 0) {
    throw new Error(`Client-view trace tick ${tickIndex} selectedInventoryItem.itemName must be a non-empty string: ${sourcePath}`);
  }
  if (!Number.isInteger(selectedItem.slotIndex) || selectedItem.slotIndex < 0 || selectedItem.slotIndex >= 28) {
    throw new Error(`Client-view trace tick ${tickIndex} selectedInventoryItem.slotIndex must be a fixed-mode inventory slot index: ${sourcePath}`);
  }
  if (!Number.isInteger(selectedItem.widgetId) || selectedItem.widgetId <= 0) {
    throw new Error(`Client-view trace tick ${tickIndex} selectedInventoryItem.widgetId must be a positive widget id: ${sourcePath}`);
  }
  const inventorySlot = Array.isArray(inventory) ? inventory[selectedItem.slotIndex] : null;
  if (inventorySlot && inventorySlot.widgetItemId !== selectedItem.itemId + 1) {
    throw new Error(`Client-view trace tick ${tickIndex} selectedInventoryItem must match the selected source inventory slot widget item id: ${sourcePath}`);
  }
}

function validateClientViewClickCross(clickCross, sourcePath, tickIndex) {
  if (!clickCross || typeof clickCross !== "object" || Array.isArray(clickCross)) {
    throw new Error(`Client-view trace tick ${tickIndex} clickCross must be an object: ${sourcePath}`);
  }
  if (!Number.isInteger(clickCross.x) || clickCross.x < 0) {
    throw new Error(`Client-view trace tick ${tickIndex} clickCross.x must be a non-negative client canvas coordinate: ${sourcePath}`);
  }
  if (!Number.isInteger(clickCross.y) || clickCross.y < 0) {
    throw new Error(`Client-view trace tick ${tickIndex} clickCross.y must be a non-negative client canvas coordinate: ${sourcePath}`);
  }
  if (clickCross.color !== 1 && clickCross.color !== 2) {
    throw new Error(`Client-view trace tick ${tickIndex} clickCross.color must be client mouseCrossColor 1 or 2: ${sourcePath}`);
  }
  if (!Number.isInteger(clickCross.state) || clickCross.state < 0 || clickCross.state >= 400) {
    throw new Error(`Client-view trace tick ${tickIndex} clickCross.state must be an active client mouseCrossState from 0 to 399: ${sourcePath}`);
  }
}

function validateClientViewContextMenu(contextMenu, sourcePath, tickIndex) {
  if (!contextMenu || typeof contextMenu !== "object" || Array.isArray(contextMenu)) {
    throw new Error(`Client-view trace tick ${tickIndex} contextMenu must be an object: ${sourcePath}`);
  }
  if (!Number.isInteger(contextMenu.x) || contextMenu.x < 0) {
    throw new Error(`Client-view trace tick ${tickIndex} contextMenu.x must be a non-negative client canvas coordinate: ${sourcePath}`);
  }
  if (!Number.isInteger(contextMenu.y) || contextMenu.y < 0) {
    throw new Error(`Client-view trace tick ${tickIndex} contextMenu.y must be a non-negative client canvas coordinate: ${sourcePath}`);
  }
  if (!Number.isInteger(contextMenu.width) || contextMenu.width <= 0) {
    throw new Error(`Client-view trace tick ${tickIndex} contextMenu.width must be a positive client menu width: ${sourcePath}`);
  }
  if (!Number.isInteger(contextMenu.height) || contextMenu.height <= 0) {
    throw new Error(`Client-view trace tick ${tickIndex} contextMenu.height must be a positive client menu height: ${sourcePath}`);
  }
  if (!Array.isArray(contextMenu.entries) || contextMenu.entries.length === 0 || contextMenu.entries.length > 500) {
    throw new Error(`Client-view trace tick ${tickIndex} contextMenu.entries must contain 1 to 500 client menu entries: ${sourcePath}`);
  }
  for (const [entryIndex, entry] of contextMenu.entries.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Client-view trace tick ${tickIndex} contextMenu.entries[${entryIndex}] must be an object: ${sourcePath}`);
    }
    if (typeof entry.actionText !== "string" || entry.actionText.length === 0) {
      throw new Error(`Client-view trace tick ${tickIndex} contextMenu.entries[${entryIndex}].actionText must be a non-empty string: ${sourcePath}`);
    }
    if (typeof entry.targetText !== "string") {
      throw new Error(`Client-view trace tick ${tickIndex} contextMenu.entries[${entryIndex}].targetText must be a string: ${sourcePath}`);
    }
    if (!Number.isInteger(entry.opcode)) {
      throw new Error(`Client-view trace tick ${tickIndex} contextMenu.entries[${entryIndex}].opcode must be an integer: ${sourcePath}`);
    }
    validateOptionalInteger(entry.identifier, sourcePath, tickIndex, `contextMenu.entries[${entryIndex}].identifier`);
    validateOptionalInteger(entry.argument1, sourcePath, tickIndex, `contextMenu.entries[${entryIndex}].argument1`);
    validateOptionalInteger(entry.argument2, sourcePath, tickIndex, `contextMenu.entries[${entryIndex}].argument2`);
    if (entry.shiftClick !== undefined && typeof entry.shiftClick !== "boolean") {
      throw new Error(`Client-view trace tick ${tickIndex} contextMenu.entries[${entryIndex}].shiftClick must be a boolean when present: ${sourcePath}`);
    }
  }
}

function validateOptionalInteger(value, sourcePath, tickIndex, fieldPath) {
  if (value !== undefined && !Number.isInteger(value)) {
    throw new Error(`Client-view trace tick ${tickIndex} ${fieldPath} must be an integer when present: ${sourcePath}`);
  }
}

function validateClientViewHudState(hud, sourcePath, tickIndex) {
  if (!hud || typeof hud !== "object") {
    throw new Error(`Client-view trace tick ${tickIndex} hud must be an object: ${sourcePath}`);
  }
  validateClientViewSkillValue(hud.hitpoints, sourcePath, tickIndex, "hitpoints");
  validateClientViewSkillValue(hud.prayer, sourcePath, tickIndex, "prayer");
  validateClientViewPercent(hud.runEnergy, sourcePath, tickIndex, "runEnergy");
  validateClientViewPercent(hud.specialEnergy, sourcePath, tickIndex, "specialEnergy");
  validateClientViewOptionalBoolean(hud.specialActive, sourcePath, tickIndex, "specialActive");
  validateOptionalInteger(hud.attackSet, sourcePath, tickIndex, "hud.attackSet");
  validateClientViewOptionalBoolean(hud.autoRetaliate, sourcePath, tickIndex, "autoRetaliate");
  validateOptionalInteger(hud.weaponTypeConfig, sourcePath, tickIndex, "hud.weaponTypeConfig");
  validateOptionalInteger(hud.autocast, sourcePath, tickIndex, "hud.autocast");
  validateClientViewOptionalBoolean(hud.defensiveCast, sourcePath, tickIndex, "defensiveCast");
  if (hud.skills !== undefined) {
    validateClientViewSkillStates(hud.skills, sourcePath, tickIndex);
  }
}

function validateClientViewOptionalBoolean(value, sourcePath, tickIndex, name) {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`Client-view trace tick ${tickIndex} hud ${name} must be a boolean when present: ${sourcePath}`);
  }
}

function validateClientViewSkillValue(skill, sourcePath, tickIndex, name) {
  if (!skill || typeof skill !== "object") {
    throw new Error(`Client-view trace tick ${tickIndex} hud ${name} must be an object: ${sourcePath}`);
  }
  if (!Number.isInteger(skill.current) || skill.current < 0) {
    throw new Error(`Client-view trace tick ${tickIndex} hud ${name}.current must be a non-negative integer: ${sourcePath}`);
  }
  if (!Number.isInteger(skill.fixed) || skill.fixed <= 0) {
    throw new Error(`Client-view trace tick ${tickIndex} hud ${name}.fixed must be a positive integer: ${sourcePath}`);
  }
}

function validateClientViewSkillStates(skills, sourcePath, tickIndex) {
  if (!skills || typeof skills !== "object" || Array.isArray(skills)) {
    throw new Error(`Client-view trace tick ${tickIndex} hud.skills must be an object: ${sourcePath}`);
  }
  for (const skillKey of clientSkillKeys) {
    validateClientViewSkillValue(skills[skillKey], sourcePath, tickIndex, `skills.${skillKey}`);
  }
  for (const skillKey of Object.keys(skills)) {
    if (!clientSkillKeys.includes(skillKey)) {
      throw new Error(`Client-view trace tick ${tickIndex} hud.skills contains unsupported skill ${skillKey}: ${sourcePath}`);
    }
  }
}

function validateClientViewEvents(events, sourceAnchorIds, sourcePath) {
  const eventIds = new Set();
  for (const [eventIndex, event] of events.entries()) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new Error(`Client-view trace event ${eventIndex} must be an object: ${sourcePath}`);
    }
    if (typeof event.id !== "string" || event.id.length === 0) {
      throw new Error(`Client-view trace event ${eventIndex} id must be a non-empty string: ${sourcePath}`);
    }
    if (eventIds.has(event.id)) {
      throw new Error(`Client-view trace event id is duplicated: ${event.id}: ${sourcePath}`);
    }
    eventIds.add(event.id);
    validateClientViewVisibleWindow(event.visibleWindow, sourcePath, `event ${event.id}.visibleWindow`);
    if (!Number.isInteger(event.observedTick) || event.observedTick < 0) {
      throw new Error(`Client-view trace event ${event.id} observedTick must be a non-negative integer: ${sourcePath}`);
    }
    if (event.observedTick > event.visibleWindow.lastTick) {
      throw new Error(`Client-view trace event ${event.id} observedTick must not be after visibleWindow: ${sourcePath}`);
    }

    if (event.kind === "hitsplat") {
      validateClientViewActorId(event.targetActorId, sourcePath, `event ${event.id}.targetActorId`);
      validateClientViewHitsplatEvent(event, sourceAnchorIds, sourcePath);
    } else if (event.kind === "spotanim") {
      validateClientViewActorId(event.actorId, sourcePath, `event ${event.id}.actorId`);
      if (event.observedTick < event.visibleWindow.firstTick) {
        throw new Error(`Client-view trace event ${event.id} observedTick must fall within spotanim visibleWindow: ${sourcePath}`);
      }
      if (!Number.isInteger(event.spotanimId) || event.spotanimId < 0) {
        throw new Error(`Client-view trace event ${event.id} spotanimId must be a non-negative integer: ${sourcePath}`);
      }
      if (!sourceAnchorIds.includes("client-spotanim-sequence-contract")) {
        throw new Error(`Client-view trace event ${event.id} spotanim is missing client-spotanim-sequence-contract source anchor: ${sourcePath}`);
      }
    } else if (event.kind === "projectile") {
      validateClientViewActorId(event.sourceActorId, sourcePath, `event ${event.id}.sourceActorId`);
      validateClientViewActorId(event.targetActorId, sourcePath, `event ${event.id}.targetActorId`);
      validateClientViewProjectileEvent(event, sourceAnchorIds, sourcePath);
    } else {
      throw new Error(`Client-view trace event ${event.id} has unsupported kind ${event.kind}: ${sourcePath}`);
    }
  }
}

function validateClientViewProjectileEvent(event, sourceAnchorIds, sourcePath) {
  if (
    !sourceAnchorIds.includes("client-projectile-packet-lifecycle") ||
    !sourceAnchorIds.includes("client-projectile-motion-contract")
  ) {
    throw new Error(`Client-view trace event ${event.id} projectile is missing client projectile source anchors: ${sourcePath}`);
  }
  validateClientViewEventTile(event.startTile, sourcePath, `event ${event.id}.startTile`);
  validateClientViewEventTile(event.targetTile, sourcePath, `event ${event.id}.targetTile`);
  if (!Number.isInteger(event.projectileId) || event.projectileId < 0) {
    throw new Error(`Client-view trace event ${event.id} projectileId must be a non-negative integer: ${sourcePath}`);
  }
  if (!Number.isInteger(event.targetIndex)) {
    throw new Error(`Client-view trace event ${event.id} targetIndex must be an integer: ${sourcePath}`);
  }
  if (!Number.isInteger(event.startHeight) || event.startHeight < 0) {
    throw new Error(`Client-view trace event ${event.id} startHeight must be a non-negative integer: ${sourcePath}`);
  }
  if (!Number.isInteger(event.endHeight) || event.endHeight < 0) {
    throw new Error(`Client-view trace event ${event.id} endHeight must be a non-negative integer: ${sourcePath}`);
  }
  if (!Number.isInteger(event.delayCycles) || event.delayCycles < 0) {
    throw new Error(`Client-view trace event ${event.id} delayCycles must be a non-negative integer: ${sourcePath}`);
  }
  if (!Number.isInteger(event.durationCycles) || event.durationCycles < event.delayCycles) {
    throw new Error(`Client-view trace event ${event.id} durationCycles must be an integer greater than or equal to delayCycles: ${sourcePath}`);
  }
  if (event.visibleWindow.firstTick !== event.observedTick + event.delayCycles) {
    throw new Error(`Client-view trace event ${event.id} visibleWindow.firstTick must equal observedTick + delayCycles: ${sourcePath}`);
  }
  if (event.visibleWindow.lastTick !== event.observedTick + event.durationCycles) {
    throw new Error(`Client-view trace event ${event.id} visibleWindow.lastTick must equal observedTick + durationCycles: ${sourcePath}`);
  }
  if (!Number.isInteger(event.curve)) {
    throw new Error(`Client-view trace event ${event.id} curve must be an integer: ${sourcePath}`);
  }
  if (!Number.isInteger(event.offset) || event.offset < 0) {
    throw new Error(`Client-view trace event ${event.id} offset must be a non-negative integer: ${sourcePath}`);
  }
  if (typeof event.skipTravel !== "boolean") {
    throw new Error(`Client-view trace event ${event.id} skipTravel must be boolean: ${sourcePath}`);
  }
  if (event.skipTravel && (event.startTile.x !== event.targetTile.x || event.startTile.y !== event.targetTile.y)) {
    throw new Error(`Client-view trace event ${event.id} skipTravel packets must start from the target tile: ${sourcePath}`);
  }
}

function validateClientViewHitsplatEvent(event, sourceAnchorIds, sourcePath) {
  if (
    !sourceAnchorIds.includes("client-hitsplat-packet-contract") ||
    !sourceAnchorIds.includes("client-hitsplat-definition-contract") ||
    !sourceAnchorIds.includes("client-hitsplat-draw-contract")
  ) {
    throw new Error(`Client-view trace event ${event.id} hitsplat is missing client hitsplat source anchors: ${sourcePath}`);
  }
  if (!Number.isInteger(event.primaryType) || event.primaryType < 0) {
    throw new Error(`Client-view trace event ${event.id} primaryType must be a non-negative integer: ${sourcePath}`);
  }
  if (!Number.isInteger(event.primaryValue) || event.primaryValue < 0) {
    throw new Error(`Client-view trace event ${event.id} primaryValue must be a non-negative integer: ${sourcePath}`);
  }
  if (!Number.isInteger(event.secondaryType) || event.secondaryType < -1) {
    throw new Error(`Client-view trace event ${event.id} secondaryType must be -1 or a non-negative integer: ${sourcePath}`);
  }
  if (!Number.isInteger(event.secondaryValue) || event.secondaryValue < 0) {
    throw new Error(`Client-view trace event ${event.id} secondaryValue must be a non-negative integer: ${sourcePath}`);
  }
  if (event.secondaryType < 0 && event.secondaryValue !== 0) {
    throw new Error(`Client-view trace event ${event.id} secondaryValue must be 0 when secondaryType is -1: ${sourcePath}`);
  }
  if (!Number.isInteger(event.delayCycles) || event.delayCycles < 0) {
    throw new Error(`Client-view trace event ${event.id} delayCycles must be a non-negative integer: ${sourcePath}`);
  }
  if (!Number.isInteger(event.slotIndex) || event.slotIndex < 0 || event.slotIndex > 3) {
    throw new Error(`Client-view trace event ${event.id} slotIndex must be 0 to 3: ${sourcePath}`);
  }
  if (!Number.isInteger(event.definitionDurationCycles) || event.definitionDurationCycles <= 0) {
    throw new Error(`Client-view trace event ${event.id} definitionDurationCycles must be a positive integer: ${sourcePath}`);
  }
  if (event.expiresOnClientCycle !== event.observedTick + event.delayCycles + event.definitionDurationCycles) {
    throw new Error(`Client-view trace event ${event.id} expiresOnClientCycle must equal observedTick + delayCycles + definitionDurationCycles: ${sourcePath}`);
  }
  if (event.visibleWindow.firstTick !== event.observedTick + event.delayCycles) {
    throw new Error(`Client-view trace event ${event.id} visibleWindow.firstTick must equal observedTick + delayCycles: ${sourcePath}`);
  }
  if (event.visibleWindow.lastTick !== event.expiresOnClientCycle) {
    throw new Error(`Client-view trace event ${event.id} visibleWindow.lastTick must equal expiresOnClientCycle: ${sourcePath}`);
  }
}

function validateClientViewVisibleWindow(window, sourcePath, fieldPath) {
  if (!window || typeof window !== "object" || Array.isArray(window)) {
    throw new Error(`Client-view trace ${fieldPath} must be an object: ${sourcePath}`);
  }
  if (!Number.isInteger(window.firstTick) || !Number.isInteger(window.lastTick)) {
    throw new Error(`Client-view trace ${fieldPath} ticks must be integers: ${sourcePath}`);
  }
  if (window.firstTick < 0 || window.lastTick < window.firstTick) {
    throw new Error(`Client-view trace ${fieldPath} must be a non-negative ordered tick range: ${sourcePath}`);
  }
}

function validateClientViewActorId(actorId, sourcePath, fieldPath) {
  if (actorId !== "self" && actorId !== "opponent") {
    throw new Error(`Client-view trace ${fieldPath} must be self or opponent: ${sourcePath}`);
  }
}

function validateClientViewEventTile(tile, sourcePath, fieldPath) {
  if (!tile || typeof tile !== "object" || Array.isArray(tile)) {
    throw new Error(`Client-view trace ${fieldPath} must be an object: ${sourcePath}`);
  }
  if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
    throw new Error(`Client-view trace ${fieldPath}.x and ${fieldPath}.y must be integers: ${sourcePath}`);
  }
  if (tile.plane !== undefined && !Number.isInteger(tile.plane)) {
    throw new Error(`Client-view trace ${fieldPath}.plane must be an integer when present: ${sourcePath}`);
  }
}

function validateClientViewTickEventLinks(trace, sourcePath) {
  const eventIds = new Set(trace.events.map((event) => event.id));
  for (const [tickIndex, tick] of trace.ticks.entries()) {
    for (const eventId of tick.eventIds) {
      if (!eventIds.has(eventId)) {
        throw new Error(`Client-view trace tick ${tickIndex} references missing event ${eventId}: ${sourcePath}`);
      }
    }
  }
}

function validateClientViewPercent(value, sourcePath, tickIndex, name) {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`Client-view trace tick ${tickIndex} hud ${name} must be an integer percentage: ${sourcePath}`);
  }
}

function clientViewTraceFileName(frameFileName) {
  return frameFileName.toLowerCase().endsWith(".png")
    ? `${frameFileName.slice(0, -4)}.client-view.json`
    : `${frameFileName}.client-view.json`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.printPlan) {
    console.log(nhClientCapturePlan);
    return;
  }

  await assertDirectory(options.sourceRoot);

  const frames = [];
  const missing = [];
  for (const target of renderReferenceTargets) {
    try {
      frames.push(await readFrame(target, options.sourceRoot));
    } catch (error) {
      if (error?.code === "ENOENT") {
        missing.push(path.join(options.sourceRoot, target.fileName));
      } else {
        throw error;
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      [
        "Missing one or more Nh client reference captures.",
        ...missing.map((filePath) => `missing ${filePath}`),
        "",
        usage()
      ].join("\n")
    );
  }

  const manifest = {
    schemaVersion: 1,
    source: "nh-client",
    sourceClientRoot: nhClientRoot,
    sourceDirectory: options.sourceRoot,
    capturedAt: new Date().toISOString(),
    frameCount: frames.length,
    frames: frames.map((frame) => ({
      id: frame.target.id,
      label: frame.target.label,
      camera: frame.target.camera,
      cameraPreset: frame.target.cameraPreset,
      plannedCycle: frame.target.cycle,
      cycle: frame.clientViewTrace?.captureCycle ?? frame.target.cycle,
      fileName: frame.target.fileName,
      traceExpectations: frame.target.traceExpectations,
      width: frame.width,
      height: frame.height,
      sha256: frame.sha256,
      clientViewTraceFileName: frame.clientViewTrace?.fileName,
      clientViewTraceFixtureId: frame.clientViewTrace?.fixtureId,
      clientViewTraceSha256: frame.clientViewTrace?.sha256,
      tolerance: frame.target.tolerance
    }))
  };

  if (options.dryRun) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  await mkdir(options.outputRoot, { recursive: true });
  await rm(path.join(options.outputRoot, referenceManifestFileName), { force: true });
  await Promise.all(
    renderReferenceTargets.map((target) =>
      rm(path.join(options.outputRoot, target.fileName), { force: true })
    )
  );
  await Promise.all(
    renderReferenceTargets.map((target) =>
      rm(path.join(options.outputRoot, clientViewTraceFileName(target.fileName)), { force: true })
    )
  );

  for (const frame of frames) {
    await copyFile(frame.sourcePath, path.join(options.outputRoot, frame.target.fileName));
    if (frame.clientViewTrace) {
      await writeFile(
        path.join(options.outputRoot, frame.clientViewTrace.fileName),
        frame.clientViewTrace.text,
        "utf8"
      );
    }
  }

  await writeFile(
    path.join(options.outputRoot, referenceManifestFileName),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        outputRoot: options.outputRoot,
        manifest: path.join(options.outputRoot, referenceManifestFileName),
        frames: manifest.frames.map((frame) => ({
          id: frame.id,
          fileName: frame.fileName,
          clientViewTraceFileName: frame.clientViewTraceFileName,
          clientViewTraceFixtureId: frame.clientViewTraceFixtureId,
          width: frame.width,
          height: frame.height,
          sha256: frame.sha256
        }))
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
