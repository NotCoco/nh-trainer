const { app, BrowserWindow } = require("./electron-muted.cjs");
const path = require("node:path");

const [, , projectRoot] = process.argv;
const NH_GAME_TICK_MS = 600;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function execute(window, script) {
  return window.webContents.executeJavaScript(script);
}

async function waitFor(window, label, predicate, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) {
      return last;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`);
}

async function waitForReady(window) {
  await waitFor(window, "runtime scene", () =>
    execute(window, `
      (() => Boolean(
        document.querySelector(".runeliteClientShell") &&
        document.querySelector(".glbStatus-ready") &&
        document.querySelector(".runtimeViewport canvas") &&
        document.querySelector('.nhSideTabButton[data-tab-id="magic"]') &&
        document.querySelector('.nhInventorySlot[data-slot-index="12"]')
      ))()
    `)
  );
}

async function dispatchRuntimeEvent(window, eventName, detail = {}) {
  await execute(window, `
    (() => {
      window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}, {
        detail: ${JSON.stringify(detail)}
      }));
    })()
  `);
}

async function clickStartAndWaitForGo(window) {
  await execute(window, `
    (async () => {
      const button = document.querySelector(".runtimeFightStartButton");
      if (!button) {
        return;
      }
      const rect = button.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      button.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 401,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y
      }));
      button.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 401,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX: x,
        clientY: y
      }));
      button.click();
    })()
  `);
  await waitFor(window, "fight countdown to finish", () =>
    execute(window, `
      (() => {
        const viewport = document.querySelector(".runtimeViewport");
        const pending = Boolean(document.querySelector(".runtimeFightStartButton"));
        const countdown = Boolean(document.querySelector(".runtimeFightCountdownOverlay"));
        return !pending && !countdown ? { ok: true, dataset: { ...viewport?.dataset } } : null;
      })()
    `),
    7000
  );
}

async function clickSideTab(window, tabId) {
  const result = await execute(window, `
    (async () => {
      const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const tab = document.querySelector(${JSON.stringify(`.nhSideTabButton[data-tab-id="${tabId}"]`)});
      if (!tab) {
        return { ok: false, error: "missing side tab", tabId: ${JSON.stringify(tabId)} };
      }
      const rect = tab.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      tab.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 402,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y
      }));
      tab.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 402,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX: x,
        clientY: y
      }));
      tab.click();
      await settle();
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
}

async function enableInternalRuntimeCommands(window) {
  await execute(window, `(() => { window.__NH_TRAINER_ENABLE_INTERNAL_TEST_COMMANDS = true; window.__NH_TRAINER_ENABLE_RUNTIME_MOTION_DEBUG = true; })()`);
}

async function clickSelector(window, selector, pointerId) {
  const result = await execute(window, `
    (async () => {
      const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) {
        return { ok: false, error: "missing element", selector: ${JSON.stringify(selector)} };
      }
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const target = document.elementFromPoint(x, y);
      if (!target || !target.closest(${JSON.stringify(selector)})) {
        return { ok: false, error: "element is not pointer target", selector: ${JSON.stringify(selector)} };
      }
      target.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: ${JSON.stringify(pointerId)},
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y
      }));
      target.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: ${JSON.stringify(pointerId)},
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX: x,
        clientY: y
      }));
      target.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: 0,
        clientX: x,
        clientY: y
      }));
      await settle();
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
}

async function readActors(window) {
  return execute(window, `
    (() => {
      const motion = window.__nhRuntimeDebug?.motion;
      const actors = motion?.actors ?? [];
      const local = actors.find((actor) => actor.actorId === "local-player") ?? null;
      const opponent = actors.find((actor) => actor.actorId === "opponent") ?? null;
      return { local, opponent };
    })()
  `);
}

async function openRuntimeContextMenu(window, detail) {
  await execute(window, `
    (async () => {
      window.dispatchEvent(new CustomEvent("nh-runtime-context-menu", {
        detail: ${JSON.stringify(detail)}
      }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()
  `);
}

async function chooseContextOption(window, matcher, pointerId) {
  const result = await execute(window, `
    (async () => {
      const options = Array.from(document.querySelectorAll(".nhContextMenuOption"));
      const option = options.find((candidate) => {
        const text = candidate.textContent ?? "";
        const actionKind = candidate.getAttribute("data-menu-action-kind") ?? "";
        return (${matcher})(text, actionKind, candidate);
      });
      if (!option) {
        return {
          ok: false,
          error: "missing context option",
          options: options.map((candidate) => ({
            text: candidate.textContent ?? "",
            actionKind: candidate.getAttribute("data-menu-action-kind") ?? ""
          }))
        };
      }
      const rect = option.getBoundingClientRect();
      const x = rect.left + Math.min(24, rect.width / 2);
      const y = rect.top + rect.height / 2;
      option.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: ${JSON.stringify(pointerId)},
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y
      }));
      option.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: ${JSON.stringify(pointerId)},
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX: x,
        clientY: y
      }));
      option.click();
      return { ok: true, text: option.textContent ?? "" };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function castIceBarrage(window) {
  await clickSideTab(window, "magic");
  await clickSelector(window, '.nhSpellbookIconSprite[data-spell-id="ice-barrage"]', 410);
  const { opponent } = await waitFor(window, "opponent debug projection", async () => {
    const actors = await readActors(window);
    return actors.opponent?.screen ? actors : null;
  });
  await openRuntimeContextMenu(window, {
    actorId: "opponent",
    tile: opponent.tile,
    x: opponent.screen.x,
    y: opponent.screen.y
  });
  await chooseContextOption(
    window,
    `(text, actionKind) => actionKind === "player-spell-selected" && text.includes("Ice Barrage")`,
    411
  );
  const deadline = Date.now() + 2500;
  let lastDebug = null;
  while (Date.now() < deadline) {
    lastDebug = await execute(window, `
      (() => {
        const debug = window.__nhRuntimeDebug ?? {};
        const motion = debug.motion;
        const local = motion?.actors?.find((actor) => actor.actorId === "local-player") ?? null;
        const viewport = document.querySelector(".runtimeViewport");
        const recentCombatTicks = (debug.manualCombatTicks ?? []).slice(-4);
        const attackEvent = recentCombatTicks
          .flatMap((tick) => tick.currentTickEvents ?? [])
          .find((event) =>
            event.kind === "attack" &&
            event.attackerId === "local-player" &&
            event.sequenceName === "barrage_cast"
          ) ?? null;
        return {
          actionReady: Boolean(attackEvent || (local?.actionSequenceKey && String(local.actionSequenceKey).startsWith("barrage_cast:"))),
          actionSequenceKey: local?.actionSequenceKey ?? "",
          attackEvent,
          sequenceName: local?.sequenceName ?? "",
          routeCount: local?.routeCount ?? null,
          serverRouteCount: local?.serverRouteCount ?? null,
          movementStallTicks: local?.movementStallTicks ?? null,
          clientCycle: motion?.clientCycle ?? null,
          dataset: { ...viewport?.dataset },
          actionLog: (window.__nhActionSequenceApplyLog ?? []).slice(-8),
          recentCombatTicks
        };
      })()
    `);
    if (lastDebug.actionReady) {
      return;
    }
    await delay(10);
  }
  throw new Error(`Timed out waiting for local barrage action sequence: ${JSON.stringify(lastDebug, null, 2)}`);
}

async function dispatchWalkHere(window, tile, pointerId) {
  const actors = await readActors(window);
  const position = actors.local?.screen ?? { x: 320 + pointerId % 13, y: 260 };
  await execute(window, `
    (() => {
      window.dispatchEvent(new CustomEvent("nh-runtime-internal-tile-command", {
        detail: {
          tile: ${JSON.stringify(tile)},
          position: ${JSON.stringify(position)},
          color: "yellow"
        }
      }));
    })()
  `);
}

async function markScenarioTimeline(window, label) {
  await execute(window, `
    (() => {
      window.__stallSlingshotTimeline = [
        ...(window.__stallSlingshotTimeline ?? []),
        { label: ${JSON.stringify(label)}, timeMs: performance.now() }
      ];
    })()
  `);
}

async function clickWalkHere(window, tile, pointerId) {
  const actors = await readActors(window);
  const localScreen = actors.local?.screen ?? { x: 320, y: 260 };
  await openRuntimeContextMenu(window, {
    tile,
    x: localScreen.x,
    y: localScreen.y
  });
  await chooseContextOption(window, `(text, actionKind) => actionKind === "walk" && text.includes("Walk here")`, pointerId);
}

async function equipGearDuringStall(window) {
  await clickSideTab(window, "inventory");
  await clickSelector(window, '.nhInventorySlot[data-slot-index="12"]', 430);
}

async function readTrace(window, label) {
  return execute(window, `
    (() => {
      const debug = window.__nhRuntimeDebug ?? {};
      const history = debug.motionHistory ?? [];
      const slot12 = document.querySelector('.nhInventorySlot[data-slot-index="12"]');
      const slot12Items = Array.from(document.querySelectorAll('.nhInventorySlot[data-slot-index="12"]')).map((slot) => ({
        itemId: Number(slot.getAttribute("data-inventory-item-id") || "0"),
        visible: Boolean(slot.offsetWidth || slot.offsetHeight || slot.getClientRects().length)
      }));
      const equipmentBody = document.querySelector('.nhEquipmentItemButton[data-slot-id="body"], .nhEquipmentItemSprite[data-slot-id="body"]');
      const localSamples = history
        .map((entry) => {
          const actor = entry.actors.find((candidate) => candidate.actorId === "local-player");
          return actor ? {
            clientCycle: entry.clientCycle,
            timeMs: entry.timeMs,
            sequenceName: actor.sequenceName,
            actionSequenceKey: actor.actionSequenceKey ?? "",
            tile: actor.tile,
            renderTile: actor.renderTile,
            world: actor.world,
            movementFrame: actor.movementFrame,
            movementFrameCycle: actor.movementFrameCycle,
            primaryFrame: actor.primaryFrame,
            primaryFrameCycle: actor.primaryFrameCycle,
            routeCount: actor.routeCount ?? null,
            serverRouteCount: actor.serverRouteCount ?? null,
            movementStallTicks: actor.movementStallTicks ?? null,
            clientTargetIndexUntilClientCycle: actor.clientTargetIndexUntilClientCycle ?? null,
            lastMovementClientCycle: actor.lastMovementClientCycle ?? null
          } : null;
        })
        .filter(Boolean);
      const slot12History = history.map((entry) => entry.inventory?.[12] ?? null);
      const combatTicks = debug.manualCombatTicks ?? [];
      const viewport = document.querySelector(".runtimeViewport");
      return {
        label: ${JSON.stringify(label)},
        dataset: { ...viewport?.dataset },
        slot12ItemId: Number(slot12?.getAttribute("data-inventory-item-id") || "0"),
        slot12Items,
        slot12History,
        equipmentBodyItemId: Number(equipmentBody?.getAttribute("data-item-id") || "0"),
        debugInventory: debug.motion?.inventory ?? null,
        timeline: window.__stallSlingshotTimeline ?? [],
        localSamples,
        combatTicks: combatTicks.slice(-16),
        actionLog: (window.__nhActionSequenceApplyLog ?? []).slice(-80)
      };
    })()
  `);
}

function summarizeTrace(trace) {
  const samples = trace.localSamples;
  const actionSamples = samples.filter((sample) => sample.actionSequenceKey);
  const actionStartCycle = actionSamples[0]?.clientCycle ?? null;
  const afterActionIndex = samples.findIndex((sample, index) =>
    index > 0 && samples[index - 1].actionSequenceKey && !sample.actionSequenceKey
  );
  const releaseSample = afterActionIndex === -1 ? null : samples[afterActionIndex];
  const movingSamples = samples.filter((sample, index) => {
    if (index === 0) {
      return false;
    }
    const previous = samples[index - 1];
    return sample.world.x !== previous.world.x || sample.world.z !== previous.world.z;
  });
  const firstMovingIndex = samples.findIndex((sample, index) => {
    if (index === 0) {
      return false;
    }
    const previous = samples[index - 1];
    return sample.world.x !== previous.world.x || sample.world.z !== previous.world.z;
  });
  const firstMovingAfterActionIndex = samples.findIndex((sample, index) => {
    if (index === 0 || afterActionIndex === -1 || index < afterActionIndex) {
      return false;
    }
    const previous = samples[index - 1];
    return sample.world.x !== previous.world.x || sample.world.z !== previous.world.z;
  });
  const routeStartIndex = samples.findIndex((sample) => (sample.routeCount ?? 0) > 0);
  const routeDoneIndex = samples.findIndex((sample, index) =>
    routeStartIndex !== -1 &&
    index > routeStartIndex &&
    (sample.routeCount ?? 0) === 0 &&
    (sample.serverRouteCount ?? 0) === 0
  );
  const routeSegments = [];
  let currentRouteSegment = null;
  for (const sample of samples) {
    const hasRoute = (sample.routeCount ?? 0) > 0 || (sample.serverRouteCount ?? 0) > 0;
    if (hasRoute && !currentRouteSegment) {
      currentRouteSegment = {
        startCycle: sample.clientCycle,
        endCycle: sample.clientCycle,
        maxRouteCount: sample.routeCount ?? 0,
        maxServerRouteCount: sample.serverRouteCount ?? 0
      };
      continue;
    }
    if (hasRoute && currentRouteSegment) {
      currentRouteSegment.endCycle = sample.clientCycle;
      currentRouteSegment.maxRouteCount = Math.max(currentRouteSegment.maxRouteCount, sample.routeCount ?? 0);
      currentRouteSegment.maxServerRouteCount = Math.max(currentRouteSegment.maxServerRouteCount, sample.serverRouteCount ?? 0);
      continue;
    }
    if (!hasRoute && currentRouteSegment) {
      routeSegments.push(currentRouteSegment);
      currentRouteSegment = null;
    }
  }
  if (currentRouteSegment) {
    routeSegments.push(currentRouteSegment);
  }
  const actionHeldRouteSamples = samples.filter((sample) =>
    sample.actionSequenceKey && (sample.routeCount ?? 0) > 0
  );
  const actionHeldWorlds = new Set(actionHeldRouteSamples.map((sample) => `${sample.world.x.toFixed(4)},${sample.world.z.toFixed(4)}`));
  const uniqueWorlds = new Set(samples.map((sample) => `${sample.world.x.toFixed(3)},${sample.world.z.toFixed(3)}`));
  const compactActor = (actor) => actor ? ({
    tile: actor.tile,
    renderTile: actor.renderTile,
    routeCount: actor.routeWaypoints?.length ?? 0,
    serverRouteCount: actor.serverRouteWaypoints?.length ?? 0,
    movementStallTicks: actor.movementStallTicks,
    sequenceName: actor.sequenceName,
    activeSequenceKey: actor.activeSequenceKey
  }) : null;
  return {
    actionSampleCount: actionSamples.length,
    actionStartCycle,
    afterActionIndex,
    releaseCycle: releaseSample?.clientCycle ?? null,
    releaseCycleDelta: actionStartCycle === null || !releaseSample ? null : releaseSample.clientCycle - actionStartCycle,
    firstMovingCycle: firstMovingIndex === -1 ? null : samples[firstMovingIndex].clientCycle,
    firstMovingAfterActionCycle:
      firstMovingAfterActionIndex === -1 ? null : samples[firstMovingAfterActionIndex].clientCycle,
    firstMovingAfterActionCycleDelta:
      actionStartCycle === null || firstMovingAfterActionIndex === -1
        ? null
        : samples[firstMovingAfterActionIndex].clientCycle - actionStartCycle,
    routeStartCycle: routeStartIndex === -1 ? null : samples[routeStartIndex].clientCycle,
    routeDoneCycle: routeDoneIndex === -1 ? null : samples[routeDoneIndex].clientCycle,
    routeDoneCycleDelta:
      routeStartIndex === -1 || routeDoneIndex === -1
        ? null
        : samples[routeDoneIndex].clientCycle - samples[routeStartIndex].clientCycle,
    routeSegments,
    actionHeldRouteSampleCount: actionHeldRouteSamples.length,
    actionHeldWorldCount: actionHeldWorlds.size,
    maxMovementStallTicks: Math.max(0, ...samples.map((sample) => sample.movementStallTicks ?? 0)),
    movingSampleCount: movingSamples.length,
    uniqueWorldCount: uniqueWorlds.size,
    firstWorld: samples[0]?.world ?? null,
    lastWorld: samples[samples.length - 1]?.world ?? null,
    lastSequenceName: samples[samples.length - 1]?.sequenceName ?? "",
    sampleRows: samples.map((sample) => ({
      cycle: sample.clientCycle,
      cycleDelta: actionStartCycle === null ? null : sample.clientCycle - actionStartCycle,
      sequenceName: sample.sequenceName,
      action: sample.actionSequenceKey || "",
      x: Number(sample.world.x.toFixed(4)),
      z: Number(sample.world.z.toFixed(4)),
      routeCount: sample.routeCount,
      serverRouteCount: sample.serverRouteCount,
      stall: sample.movementStallTicks,
      lastMoveCycle: sample.lastMovementClientCycle
    })),
    sampleTail: samples.slice(-12).map((sample) => ({
      clientCycle: sample.clientCycle,
      sequenceName: sample.sequenceName,
      action: sample.actionSequenceKey || "",
      x: Number(sample.world.x.toFixed(4)),
      z: Number(sample.world.z.toFixed(4)),
      routeCount: sample.routeCount,
      serverRouteCount: sample.serverRouteCount,
      stall: sample.movementStallTicks,
      targetHold: sample.clientTargetIndexUntilClientCycle,
      lastMoveCycle: sample.lastMovementClientCycle
    })),
    slot12ItemId: trace.slot12ItemId,
    slot12Items: trace.slot12Items,
    slot12EverEquippedDuringTrace: trace.slot12History?.includes(4091) ?? false,
    equipmentBodyItemId: trace.equipmentBodyItemId,
    debugInventorySlot12: trace.debugInventory?.[12] ?? null,
    timeline: trace.timeline?.map((entry, index, entries) => ({
      label: entry.label,
      deltaMs: index === 0 ? 0 : Number((entry.timeMs - entries[0].timeMs).toFixed(1))
    })) ?? [],
    lastInventoryAction: trace.dataset.lastInventoryAction ?? "",
    lastInventoryItemId: trace.dataset.lastInventoryItemId ?? "",
    lastInventoryQueuedForTick: trace.dataset.lastInventoryQueuedForTick ?? "",
    lastInventoryBlockedReason: trace.dataset.lastInventoryBlockedReason ?? "",
    lastInventoryEquipmentPreviousItemId: trace.dataset.lastInventoryEquipmentPreviousItemId ?? "",
    lastInventoryMutationNextItemId: trace.dataset.lastInventoryMutationNextItemId ?? "",
    lastReadyItemActionCount: trace.dataset.lastReadyItemActionCount ?? "",
    lastReadyItemActionTick: trace.dataset.lastReadyItemActionTick ?? "",
    lastProcessedEquipItemId: trace.dataset.lastProcessedEquipItemId ?? "",
    lastProcessedEquipSlot: trace.dataset.lastProcessedEquipSlot ?? "",
    lastProcessedEquipSourceSlotItemId: trace.dataset.lastProcessedEquipSourceSlotItemId ?? "",
    lastProcessedEquipBlockedReason: trace.dataset.lastProcessedEquipBlockedReason ?? "",
    lastProcessedEquipMutation: trace.dataset.lastProcessedEquipMutation ?? "",
    lastProcessedEquipTick: trace.dataset.lastProcessedEquipTick ?? "",
    activeSideTabId: trace.dataset.activeSideTabId ?? "",
    combatTickCount: trace.combatTicks.length,
    combatTicks: trace.combatTicks.slice(-6).map((tick) => ({
      tick: tick.tick,
      localBefore: compactActor(tick.localBeforeMovement),
      localAfterPreRoute: compactActor(tick.localAfterPreRoute),
      localAfterSync: compactActor(tick.localAfterSync)
    }))
  };
}

function assertComparableSlingshot(noGear, withGear) {
  const noGearSummary = summarizeTrace(noGear);
  const withGearSummary = summarizeTrace(withGear);
  if (withGear.slot12ItemId === 4736 && !(withGear.slot12History?.includes(4091) ?? false)) {
    throw new Error(`gear scenario did not actually equip the body slot during the stall: ${JSON.stringify({ withGearSummary }, null, 2)}`);
  }
  if (noGearSummary.actionStartCycle === null || withGearSummary.actionStartCycle === null) {
    throw new Error(`barrage action sequence was not observed: ${JSON.stringify({ noGearSummary, withGearSummary }, null, 2)}`);
  }
  if (noGearSummary.maxMovementStallTicks <= 0 || withGearSummary.maxMovementStallTicks <= 0) {
    throw new Error(`stalled route did not accumulate class329-style field687 catch-up: ${JSON.stringify({ noGearSummary, withGearSummary }, null, 2)}`);
  }
  if (withGearSummary.maxMovementStallTicks + 6 < noGearSummary.maxMovementStallTicks) {
    throw new Error(`gear equip changed the held movement catch-up budget: ${JSON.stringify({ noGearSummary, withGearSummary }, null, 2)}`);
  }
  if (
    noGearSummary.firstMovingAfterActionCycleDelta === null ||
    withGearSummary.firstMovingAfterActionCycleDelta === null ||
    Math.abs(withGearSummary.firstMovingAfterActionCycleDelta - noGearSummary.firstMovingAfterActionCycleDelta) > 60
  ) {
    throw new Error(`gear equip retimed the first post-action movement release: ${JSON.stringify({ noGearSummary, withGearSummary }, null, 2)}`);
  }
  if (
    noGearSummary.routeDoneCycleDelta !== null &&
    withGearSummary.routeDoneCycleDelta !== null &&
    withGearSummary.routeDoneCycleDelta > noGearSummary.routeDoneCycleDelta + 90
  ) {
    throw new Error(`gear equip stretched the route release window: ${JSON.stringify({ noGearSummary, withGearSummary }, null, 2)}`);
  }
  if (withGearSummary.routeSegments.length > noGearSummary.routeSegments.length) {
    throw new Error(`gear equip split the held route into a later route segment: ${JSON.stringify({ noGearSummary, withGearSummary }, null, 2)}`);
  }
  if (withGearSummary.movingSampleCount < Math.max(2, noGearSummary.movingSampleCount - 3)) {
    throw new Error(`gear equip cut down stalled movement playback: ${JSON.stringify({ noGearSummary, withGearSummary }, null, 2)}`);
  }
  if (withGearSummary.uniqueWorldCount < Math.max(2, noGearSummary.uniqueWorldCount - 3)) {
    throw new Error(`gear equip collapsed local render positions during stall release: ${JSON.stringify({ noGearSummary, withGearSummary }, null, 2)}`);
  }
}

async function runScenario(label, withGear) {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      nodeIntegration: false,
      contextIsolation: true,
      partition: `temp-stall-slingshot-${process.pid}-${Date.now()}-${Math.random()}`
    }
  });
  try {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    await waitForReady(window);
    await enableInternalRuntimeCommands(window);
    await dispatchRuntimeEvent(window, "nh-runtime-camera", { camera: "isometric" });
    await dispatchRuntimeEvent(window, "nh-runtime-spellbook", { spellbookId: "ancient" });
    await dispatchRuntimeEvent(window, "nh-runtime-reset-tick-origin");
    await delay(150);
    await clickStartAndWaitForGo(window);
    await delay(150);
    await execute(window, `(() => { window.__nhRuntimeDebug = { ...(window.__nhRuntimeDebug ?? {}), motionHistory: [] }; window.__nhActionSequenceApplyLog = []; window.__stallSlingshotTimeline = []; })()`);
    await castIceBarrage(window);
    await markScenarioTimeline(window, `${label}:after-barrage`);
    const actors = await readActors(window);
    const localTile = actors.local?.tile;
    if (!localTile) {
      throw new Error("missing local tile after barrage");
    }
    const firstTile = { x: localTile.x + 2, z: localTile.z };
    const secondTile = { x: localTile.x, z: localTile.z };
    const thirdTile = { x: localTile.x + 2, z: localTile.z };
    const gearPromise = withGear
      ? (async () => {
          await delay(120);
          await markScenarioTimeline(window, `${label}:equip-start`);
          await equipGearDuringStall(window);
          await markScenarioTimeline(window, `${label}:equip-end`);
        })()
      : Promise.resolve();
    const firstWalkAt = Date.now();
    await dispatchWalkHere(window, firstTile, 420);
    await markScenarioTimeline(window, `${label}:first-walk`);
    await delay(Math.max(0, NH_GAME_TICK_MS - (Date.now() - firstWalkAt)));
    const secondWalkAt = Date.now();
    await dispatchWalkHere(window, secondTile, 421);
    await markScenarioTimeline(window, `${label}:second-walk`);
    await delay(Math.max(0, NH_GAME_TICK_MS - (Date.now() - secondWalkAt)));
    await dispatchWalkHere(window, thirdTile, 422);
    await markScenarioTimeline(window, `${label}:third-walk`);
    await gearPromise;
    await delay(2600);
    return await readTrace(window, label);
  } finally {
    window.close();
  }
}

app.whenReady().then(async () => {
  let failed = false;
  try {
    const noGear = await runScenario("no-gear", false);
    const withGear = await runScenario("with-gear", true);
    assertComparableSlingshot(noGear, withGear);
    process.stdout.write(JSON.stringify({
      ok: true,
      noGear: summarizeTrace(noGear),
      withGear: summarizeTrace(withGear)
    }, null, 2));
  } catch (error) {
    failed = true;
    console.error(error?.stack ?? error);
  } finally {
    app.exit(failed ? 1 : 0);
  }
});
