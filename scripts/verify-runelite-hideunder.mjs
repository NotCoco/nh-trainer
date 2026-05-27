import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const failures = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function readText(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function readNhClientSource(relativePath) {
  return readFileSync(
    path.resolve(
      projectRoot,
      "..",
      "Nh184-Client",
      "runelite-client",
      "src",
      "main",
      "java",
      "net",
      "runelite",
      "client",
      "plugins",
      "hideunder",
      relativePath
    ),
    "utf8"
  );
}

function loadTsModule(relativePath) {
  return loadAbsoluteModule(path.resolve(projectRoot, relativePath));
}

function loadAbsoluteModule(sourcePath) {
  const resolved = resolveModulePath(sourcePath);
  const cached = moduleCache.get(resolved);
  if (cached) {
    return cached.exports;
  }

  const source = readFileSync(resolved, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true
    },
    fileName: resolved
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(resolved, module);
  vm.runInNewContext(
    transpiled,
    {
      module,
      exports: module.exports,
      require: (request) => {
        if (request.startsWith(".")) {
          return loadAbsoluteModule(path.resolve(path.dirname(resolved), request));
        }
        return require(request);
      },
      console
    },
    { filename: resolved }
  );
  return module.exports;
}

function resolveModulePath(candidatePath) {
  const candidates = [
    candidatePath,
    `${candidatePath}.ts`,
    `${candidatePath}.tsx`,
    `${candidatePath}.js`,
    `${candidatePath}.json`,
    path.join(candidatePath, "index.ts")
  ];
  for (const candidate of candidates) {
    try {
      if (require("node:fs").statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(`Cannot resolve module ${candidatePath}`);
}

const hideUnderSource = readNhClientSource("HideUnder.java");
const playerContainerSource = readNhClientSource("PlayerContainer.java");
const shellSource = readText("src/ui/RuneliteClientShell.tsx");
const runtimeSource = readText("src/ui/RuntimeSceneViewer.tsx");
const moduleSource = readText("src/ui/runeliteHideUnder.ts");
const hideUnder = loadTsModule("src/ui/runeliteHideUnder.ts");

check(
  hideUnderSource.includes("@PluginDescriptor(") &&
    hideUnderSource.includes('name = "Hide Under"') &&
    hideUnderSource.includes('description = "Hide local player when under targeted players"') &&
    hideUnderSource.includes("type = PluginType.PVP") &&
    hideUnderSource.includes("enabledByDefault = false"),
  "RuneLite HideUnder source descriptor should remain a disabled-by-default PvP plugin."
);
check(
  hideUnderSource.includes("player.setTimer(16);") &&
    hideUnderSource.includes("player.setTarget(true);") &&
    playerContainerSource.includes("private boolean target;") &&
    playerContainerSource.includes("private int timer;"),
  "RuneLite HideUnder should still use PlayerContainer target state with a 16-tick timer."
);
check(
  hideUnderSource.includes("client.setLocalPlayerHidden(false);") &&
    hideUnderSource.includes("client.setLocalPlayerHidden(true);") &&
    !hideUnderSource.includes("setLocalPlayerHidden2D"),
  "RuneLite HideUnder should hide only the local player model, not 2D overheads."
);
check(
  hideUnderSource.includes("client.setIsHidingEntities(isPlayerRegionAllowed())") &&
    hideUnderSource.includes("return playerRegionID != 9520;"),
  "RuneLite HideUnder should keep the isHidingEntities region guard with Castle Wars region 9520."
);
check(
  shellSource.includes("RUNELITE_HIDE_UNDER_PLUGIN_ID") &&
    shellSource.includes('name: "Hide Under"') &&
    shellSource.includes('description: "Hide local player when under targeted players"') &&
    shellSource.includes('pluginType: "pvp"') &&
    shellSource.includes("enabledByDefault: false") &&
    shellSource.includes("configurable: false") &&
    shellSource.includes("readonly hideUnder: RuneliteHideUnderConfigSnapshot") &&
    shellSource.includes("targetTimerTicks: RUNELITE_HIDE_UNDER_TARGET_TIMER_TICKS"),
  "RuneliteClientShell should expose Hide Under as a source-backed, disabled-by-default, non-configurable PvP plugin."
);
check(
  runtimeSource.includes("applyRuneliteHideUnderConfig") &&
    runtimeSource.includes("runeliteHideUnderActorVisible(pose, snapshot, combatState, hideUnderConfig)") &&
    runtimeSource.includes("runeliteClientConfig.hideUnder") &&
    runtimeSource.includes("RUNELITE_HIDE_UNDER_SOURCE_LOCAL_VISIBILITY"),
  "RuntimeSceneViewer should apply Hide Under as render-only local-player visibility, with source anchors on the canvas."
);
check(
  moduleSource.includes('event.kind === "attack" ? event.defenderId : event.targetActorId') &&
    moduleSource.includes("sameRuneliteHideUnderTile") &&
    moduleSource.includes("combatState.tick - Math.max(0, Math.trunc(targetTimerTicks))"),
  "runeliteHideUnder should derive the target window from source-shaped combat interactions instead of hardcoding always-hide-under behavior."
);

const config = {
  enabled: true,
  isHidingEntities: true,
  inAllowedRegion: true,
  targetTimerTicks: hideUnder.RUNELITE_HIDE_UNDER_TARGET_TIMER_TICKS
};
const snapshot = {
  actors: [
    { actorId: "local-player", tile: { x: 10, z: 20 }, markerLabel: "Local" },
    { actorId: "opponent", tile: { x: 10, z: 20 }, markerLabel: "Opponent" }
  ]
};
const recentCombatState = {
  tick: 100,
  actors: {
    "local-player": {
      id: "local-player",
      targetId: null,
      lastTargetId: null
    },
    opponent: {
      id: "opponent",
      targetId: null,
      lastTargetId: null
    }
  },
  events: [
    {
      kind: "attack",
      tick: 90,
      attackerId: "local-player",
      defenderId: "opponent"
    }
  ]
};
check(
  hideUnder.runeliteHideUnderLocalPlayerHidden(snapshot, recentCombatState, config) === true,
  "Hide Under should hide the local player when sharing a tile with a recently targeted player."
);
check(
  hideUnder.runeliteHideUnderActorVisible(snapshot.actors[0], snapshot, recentCombatState, config) === false &&
    hideUnder.runeliteHideUnderActorVisible(snapshot.actors[1], snapshot, recentCombatState, config) === true,
  "Hide Under should hide only the local actor model and keep the targeted actor visible."
);
check(
  hideUnder.runeliteHideUnderLocalPlayerHidden(snapshot, recentCombatState, { ...config, enabled: false }) === false,
  "Hide Under should do nothing while the disabled-by-default plugin is off."
);
check(
  hideUnder.runeliteHideUnderLocalPlayerHidden(
    {
      actors: [
        { actorId: "local-player", tile: { x: 10, z: 20 }, markerLabel: "Local" },
        { actorId: "opponent", tile: { x: 11, z: 20 }, markerLabel: "Opponent" }
      ]
    },
    recentCombatState,
    config
  ) === false,
  "Hide Under should not hide the local actor when the targeted player is not on the same tile."
);
check(
  hideUnder.runeliteHideUnderLocalPlayerHidden(
    snapshot,
    {
      ...recentCombatState,
      events: [{ kind: "attack", tick: 80, attackerId: "local-player", defenderId: "opponent" }]
    },
    config
  ) === false,
  "Hide Under should let the 16-tick target window expire."
);

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      pluginId: hideUnder.RUNELITE_HIDE_UNDER_PLUGIN_ID,
      targetTimerTicks: hideUnder.RUNELITE_HIDE_UNDER_TARGET_TIMER_TICKS,
      sourceRegionException: hideUnder.RUNELITE_HIDE_UNDER_CASTLE_WARS_REGION_ID
    },
    null,
    2
  )
);
