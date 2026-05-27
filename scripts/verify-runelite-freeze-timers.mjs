import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadTsModule(relativePath) {
  return loadAbsoluteModule(path.resolve(projectRoot, relativePath));
}

function loadAbsoluteModule(sourcePath) {
  const resolved = path.normalize(sourcePath);
  const cached = moduleCache.get(resolved);
  if (cached) {
    return cached.exports;
  }

  if (resolved.endsWith(".json")) {
    const module = { exports: JSON.parse(readFileSync(resolved, "utf8")) };
    moduleCache.set(resolved, module);
    return module.exports;
  }

  const source = readFileSync(resolved, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true,
      jsx: ts.JsxEmit.ReactJSX,
      resolveJsonModule: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true
    },
    fileName: resolved
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(resolved, module);
  const localRequire = (request) => {
    if (request.startsWith(".")) {
      return loadAbsoluteModule(resolveRelativeModule(resolved, request));
    }
    return require(request);
  };
  vm.runInNewContext(
    transpiled,
    { module, exports: module.exports, require: localRequire, console },
    { filename: resolved }
  );
  return module.exports;
}

function resolveRelativeModule(parentPath, request) {
  const requested = path.resolve(path.dirname(parentPath), request);
  const candidates = requested.endsWith(".ts") || requested.endsWith(".tsx") || requested.endsWith(".json")
    ? [requested]
    : [`${requested}.ts`, `${requested}.tsx`, `${requested}.json`, path.join(requested, "index.ts")];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return candidates[0];
}

const runtimeCombat = loadTsModule("src/sim/runtimePlayerCombat.ts");
const locks = loadTsModule("src/sim/entity/locks.ts");
const freezeTimers = loadTsModule("src/ui/runeliteFreezeTimers.ts");
const runtimeSource = readFileSync(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");

assert(
  runtimeSource.includes("actor.getCanvasImageLocation(image, 0) + xOffset; overlaysDrawn * 18") &&
    runtimeSource.includes("projectRuntimeActorClientOverlay(boundary, fixedLayout, slot.group.position, 0)"),
  "Freeze Timers actor placement should follow Actor.getCanvasImageLocation(image, 0) through the client projection path."
);

const config = {
  enabled: true,
  showPlayers: true,
  showNpcs: false,
  freezeTimers: true,
  teleblockTimers: true,
  vengeanceTimers: true,
  xOffset: 20,
  noImage: false,
  fontStyle: "Bold",
  textSize: 11
};
const timersConfig = {
  enabled: true,
  showFreezes: true
};
const infoBoxConfig = {
  vertical: false,
  wrap: 4,
  size: 35
};

const lock = locks.applyFreeze(locks.createEntityLockState(), 0, runtimeCombat.runtimePlayerCombatIceBarrageFreezeTicks, "local-player");
assert(lock.freezeUntilTick === 32, `Ice Barrage freeze should be 32 game ticks, got ${lock.freezeUntilTick}`);
const immuneLock = locks.tickLocks(lock, 33);
assert(
  immuneLock.freezeUntilTick === 32 && locks.hasFreezeImmunity(immuneLock, 33) && !locks.isFrozen(immuneLock, 33),
  `freeze immunity should survive after movement freeze expires: ${JSON.stringify(immuneLock)}`
);
const expiredLock = locks.tickLocks(lock, 38);
assert(expiredLock.freezeUntilTick === -1, `freeze immunity should expire after the five tick TimerType.FREEZE window: ${JSON.stringify(expiredLock)}`);

let state = runtimeCombat.createRuntimePlayerCombatState({
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides"
});
state = runtimeCombat.requestRuntimePlayerCombatSpell(state, "local-player", "opponent", "ice-barrage");
state = runtimeCombat.advanceRuntimePlayerCombat(state, {
  tiles: {
    "local-player": state.actors["local-player"].tile,
    opponent: state.actors.opponent.tile
  },
  clientCycle: 0
}).state;
const hit = state.queuedHits[0];
assert(
  hit?.spellId === "ice-barrage" && hit.freezeDurationTicks === undefined,
  `Ice Barrage queued damage should not carry a second delayed freeze after Nh' immediate hold: ${JSON.stringify(hit)}`
);
const castFreezeUntilTick = state.actors.opponent.locks.freezeUntilTick;
assert(
  castFreezeUntilTick === runtimeCombat.runtimePlayerCombatIceBarrageFreezeTicks,
  `Ice Barrage cast should immediately apply the freeze read by RuneLite FreezeTimers: ${JSON.stringify(state.actors.opponent.locks)}`
);
state = {
  ...state,
  tick: hit.dueTick,
  queuedHits: [
    {
      ...hit,
      damage: Math.max(1, hit.damage),
      rawDamage: Math.max(1, hit.rawDamage)
    }
  ]
};
state = runtimeCombat.advanceRuntimePlayerCombat(state, {
  tiles: {
    "local-player": state.actors["local-player"].tile,
    opponent: state.actors.opponent.tile
  },
  clientCycle: 0
}).state;
const spotanim = state.events.find((event) => event.kind === "spotanim" && event.spotanimId === freezeTimers.RUNELITE_FREEZE_TIMERS_BARRAGE_SPOTANIM_ID);
assert(spotanim, `Ice Barrage hit should emit spotanim ${freezeTimers.RUNELITE_FREEZE_TIMERS_BARRAGE_SPOTANIM_ID} for FreezeTimersPlugin.`);
assert(
  state.actors.opponent.locks.freezeUntilTick === castFreezeUntilTick,
  `Ice Barrage hit spotanim should not re-apply or extend the source immediate freeze: ${JSON.stringify(state.actors.opponent.locks)}`
);

const overlays = freezeTimers.runeliteFreezeTimerOverlaySnapshotsFromCombatState(state, config);
const opponentOverlay = overlays.find((overlay) => overlay.actorId === "opponent");
assert(opponentOverlay?.state === "freeze", `active freeze should use the freeze image overlay: ${JSON.stringify(overlays)}`);
assert(opponentOverlay?.imagePath === freezeTimers.RUNELITE_FREEZE_TIMERS_FREEZE_IMAGE_PATH, `active freeze should use copied freeze.png: ${JSON.stringify(opponentOverlay)}`);
assert(opponentOverlay?.xOffset === 20, `FreezeTimersConfig.xoffset should drive overlay x offset: ${JSON.stringify(opponentOverlay)}`);

const immuneState = {
  ...state,
  tick: state.actors.opponent.locks.freezeUntilTick + 1
};
const immuneOverlay = freezeTimers.runeliteFreezeTimerOverlaySnapshotsFromCombatState(immuneState, config).find(
  (overlay) => overlay.actorId === "opponent"
);
assert(immuneOverlay?.state === "freeze-immune", `post-freeze reapply window should use the freeze-immune overlay: ${JSON.stringify(immuneOverlay)}`);
assert(immuneOverlay?.imagePath === freezeTimers.RUNELITE_FREEZE_TIMERS_FREEZE_IMMUNE_IMAGE_PATH, `reapply window should use copied freezeimmune.png: ${JSON.stringify(immuneOverlay)}`);

assert(freezeTimers.runeliteFreezeTimerText(19200) === "20", "RuneLite processTickCounter should ceil Ice Barrage display to 20 seconds.");
assert(freezeTimers.runeliteFreezeTimerText(3000) === "04", "RuneLite processTickCounter should show 04 during the three-second immunity window.");

const localFrozenState = {
  ...state,
  actors: {
    ...state.actors,
    "local-player": {
      ...state.actors["local-player"],
      locks: locks.applyFreeze(locks.createEntityLockState(), state.tick, runtimeCombat.runtimePlayerCombatIceBarrageFreezeTicks, "opponent")
    }
  }
};
const localInfoBox = freezeTimers.runeliteLocalFreezeTimerInfoBoxSnapshot(localFrozenState, timersConfig, infoBoxConfig);
assert(localInfoBox?.spriteId === freezeTimers.RUNELITE_TIMERS_ICE_BARRAGE_SPRITE_ID, `local freeze infobox should use GameTimer.ICEBARRAGE spell sprite: ${JSON.stringify(localInfoBox)}`);
assert(localInfoBox?.text === "20", `local freeze infobox should use RuneLite timer text: ${JSON.stringify(localInfoBox)}`);
assert(
  runtimeSource.includes("TimersPlugin.onChatMessage FROZEN_MESSAGE createGameTimer(ICEBARRAGE)") &&
    runtimeSource.includes("TimerTimer(GameTimer.ICEBARRAGE)") &&
    runtimeSource.includes("InfoBoxOverlay"),
  "local freeze timer should render as the RuneLite TimersPlugin infobox overlay."
);

console.log("RuneLite Freeze Timers verifier passed: source assets, freeze lock, hit spotanim, and overlay snapshots are wired.");
