import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePaths = ["fixtures/sim/client-view-two-actor-duel.json"];
const expectedActors = ["self", "opponent"];
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

async function exists(relativePath) {
  try {
    await access(path.join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readJson(relativePath) {
  const text = await readFile(path.join(projectRoot, relativePath), "utf8");
  return JSON.parse(text);
}

function validateTrace(trace) {
  const errors = [];
  if (trace.schemaVersion !== "client-view.v1") {
    errors.push(`schemaVersion must be client-view.v1, got ${trace.schemaVersion}`);
  }
  if (JSON.stringify(trace.actors) !== JSON.stringify(expectedActors)) {
    errors.push("actors must be exactly [self, opponent]");
  }

  validateNoBlockedKeys(trace, "trace", errors);
  validateTicks(trace.ticks ?? [], errors, new Set(trace.sourceAnchorIds ?? []));
  validateEvents(trace.events ?? [], errors, new Set(trace.sourceAnchorIds ?? []));
  validateTickEventLinks(trace, errors);
  return errors;
}

function validateTicks(ticks, errors, sourceAnchorIds) {
  let lastTick = -1;
  for (const tick of ticks) {
    if (!Number.isInteger(tick.tick) || tick.tick < 0) {
      errors.push(`tick ${tick.tick} must be a non-negative integer`);
    }
    if (tick.tick <= lastTick) {
      errors.push(`tick ${tick.tick} must be strictly greater than previous tick ${lastTick}`);
    }
    lastTick = tick.tick;

    for (const actorId of expectedActors) {
      const actor = tick.actors?.[actorId];
      if (!actor) {
        errors.push(`tick ${tick.tick} is missing actor ${actorId}`);
        continue;
      }
      if (actor.actorId !== actorId) {
        errors.push(`tick ${tick.tick} actor ${actorId} has mismatched actorId ${actor.actorId}`);
      }
      validateTile(actor.tile, `tick ${tick.tick} ${actorId}.tile`, errors);
      if (sourceAnchorIds.has("client-player-appearance-packet")) {
        validateAppearancePacket(actor.appearancePacket, `tick ${tick.tick} ${actorId}.appearancePacket`, errors);
      }
    }

    for (const actorId of Object.keys(tick.actors ?? {})) {
      if (!expectedActors.includes(actorId)) {
        errors.push(`tick ${tick.tick} has unsupported actor id ${actorId}`);
      }
    }
  }
}

function validateAppearancePacket(appearancePacket, label, errors) {
  if (!Array.isArray(appearancePacket) || appearancePacket.length === 0) {
    errors.push(`${label} must be a non-empty byte array`);
    return;
  }
  appearancePacket.forEach((byte, index) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      errors.push(`${label}[${index}] must be an unsigned byte`);
    }
  });
}

function validateEvents(events, errors, sourceAnchorIds) {
  const ids = new Set();
  for (const event of events) {
    if (ids.has(event.id)) {
      errors.push(`event id ${event.id} is duplicated`);
    }
    ids.add(event.id);
    validateWindow(event.visibleWindow, `event ${event.id}.visibleWindow`, errors);
    if (!Number.isInteger(event.observedTick) || event.observedTick < 0) {
      errors.push(`event ${event.id} observedTick must be a non-negative integer`);
    }
    if (event.observedTick > event.visibleWindow?.lastTick) {
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
      if (event.observedTick < event.visibleWindow?.firstTick) {
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
      errors.push(`event ${event.id} has unsupported kind ${event.kind}`);
    }
  }
}

function validateHitsplatPacket(event, errors) {
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
    errors.push(`event ${event.id}.expiresOnClientCycle must equal observedTick + delayCycles + definitionDurationCycles`);
  }
  if (event.visibleWindow?.firstTick !== event.observedTick + event.delayCycles) {
    errors.push(`event ${event.id}.visibleWindow.firstTick must equal observedTick + delayCycles`);
  }
  if (event.visibleWindow?.lastTick !== event.expiresOnClientCycle) {
    errors.push(`event ${event.id}.visibleWindow.lastTick must equal expiresOnClientCycle`);
  }
}

function validateProjectilePacket(event, errors) {
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
  if (event.visibleWindow?.firstTick !== event.observedTick + event.delayCycles) {
    errors.push(`event ${event.id}.visibleWindow.firstTick must equal observedTick + delayCycles`);
  }
  if (event.visibleWindow?.lastTick !== event.observedTick + event.durationCycles) {
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
  if (event.skipTravel && (event.startTile?.x !== event.targetTile?.x || event.startTile?.y !== event.targetTile?.y)) {
    errors.push(`event ${event.id}.skipTravel packets must start from the target tile`);
  }
}

function validateTickEventLinks(trace, errors) {
  const eventIds = new Set((trace.events ?? []).map((event) => event.id));
  for (const tick of trace.ticks ?? []) {
    for (const eventId of tick.eventIds ?? []) {
      if (!eventIds.has(eventId)) {
        errors.push(`tick ${tick.tick} references missing event ${eventId}`);
      }
    }
  }
}

function validateWindow(window, label, errors) {
  if (!window || !Number.isInteger(window.firstTick) || !Number.isInteger(window.lastTick)) {
    errors.push(`${label} ticks must be integers`);
    return;
  }
  if (window.firstTick < 0 || window.lastTick < window.firstTick) {
    errors.push(`${label} must be a non-negative ordered tick range`);
  }
}

function validateTile(tile, label, errors) {
  if (!tile || !Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
    errors.push(`${label}.x and ${label}.y must be integers`);
  }
  if (tile?.plane !== undefined && !Number.isInteger(tile.plane)) {
    errors.push(`${label}.plane must be an integer when present`);
  }
}

function validateActorId(actorId, label, errors) {
  if (!expectedActors.includes(actorId)) {
    errors.push(`${label} must be self or opponent`);
  }
}

function validateNoBlockedKeys(value, label, errors) {
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (blockedStateKeys.has(key)) {
      errors.push(`${label}.${key} is server-only or hidden state and is not allowed`);
    }
    validateNoBlockedKeys(child, `${label}.${key}`, errors);
  }
}

let okCount = 0;
for (const fixturePath of fixturePaths) {
  if (!(await exists(fixturePath))) {
    console.log(`missing ${fixturePath}`);
    continue;
  }

  const trace = await readJson(fixturePath);
  const errors = validateTrace(trace);
  if (errors.length === 0) {
    okCount += 1;
    console.log(
      `ok      ${fixturePath} (${trace.ticks.length} ticks, ${trace.events.length} events, ${trace.actors.length} actors)`
    );
  } else {
    console.log(`invalid ${fixturePath}`);
    for (const error of errors) {
      console.log(`        ${error}`);
    }
  }
}

const missingCount = fixturePaths.length - okCount;
console.log(`sim fixture readiness: ${okCount}/${fixturePaths.length} valid, ${missingCount} missing or invalid`);

if (missingCount > 0) {
  process.exitCode = 1;
}
