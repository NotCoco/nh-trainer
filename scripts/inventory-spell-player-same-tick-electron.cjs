const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const [, , projectRoot] = process.argv;
const barrageSequence = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "fixtures", "render", "sequences", "barrage_cast.json"), "utf8")
);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function expectedPrimaryCursor(sequence, elapsedCycles) {
  let remaining = Math.max(0, Number(elapsedCycles));
  for (let index = 0; index < sequence.frames.length; index += 1) {
    const length = Math.max(1, Number(sequence.frames[index].lengthClientCycles));
    if (remaining <= length) {
      return { frameIndex: index, frameCycle: remaining };
    }
    remaining -= length;
  }
  return null;
}

async function waitForReady(window) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(`
      (() => Boolean(
        document.querySelector(".runeliteClientShell") &&
        document.querySelector(".glbStatus-ready") &&
        document.querySelector(".runtimeViewport canvas") &&
        document.querySelector('.kronosInventorySlot[data-inventory-item-id="21006"]') &&
        document.querySelector('.kronosSideTabButton[data-tab-id="magic"]')
      ))()
    `);
    if (ready) {
      return;
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for runtime inventory, scene, and magic tab.");
}

async function dispatchEvent(window, eventName, detail) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}, {
        detail: ${JSON.stringify(detail)}
      }));
    })()
  `);
}

async function clickSideTab(window, tabId) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
      const tab = document.querySelector(${JSON.stringify(`.kronosSideTabButton[data-tab-id="${tabId}"]`)});
      if (!tab) {
        return { ok: false, error: "missing side tab", tabId: ${JSON.stringify(tabId)} };
      }
      const rect = tab.getBoundingClientRect();
      tab.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 20,
        pointerType: "mouse",
        button: 0,
        buttons: 1,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      }));
      await settle();
      return { ok: true, dataset: { ...document.querySelector(".runtimeViewport")?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function locateOpponentClick(window) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
      const canvas = document.querySelector(".runtimeViewport canvas");
      if (!canvas) {
        return { ok: false, error: "missing runtime canvas" };
      }
      const rect = canvas.getBoundingClientRect();
      const offsets = [
        [600, 320],
        [560, 320],
        [640, 320],
        [600, 280],
        [600, 360]
      ];
      for (let y = 80; y <= rect.height - 80; y += 40) {
        for (let x = 80; x <= rect.width - 80; x += 40) {
          offsets.push([x, y]);
        }
      }
      let attemptCount = 0;
      for (const [x, y] of offsets) {
        attemptCount += 1;
        const clientX = rect.left + x;
        const clientY = rect.top + y;
        canvas.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId: 91,
          pointerType: "mouse",
          isPrimary: true,
          button: 2,
          buttons: 2,
          clientX,
          clientY
        }));
        await settle();
        let menu = document.querySelector(".kronosContextMenu");
        if (!menu) {
          canvas.dispatchEvent(new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 2,
            buttons: 2,
            clientX,
            clientY
          }));
          await settle();
          menu = document.querySelector(".kronosContextMenu");
        }
        const options = menu
          ? Array.from(menu.querySelectorAll(".kronosContextMenuOption")).map((option) => ({
              text: option.textContent ?? "",
              actionKind: option.getAttribute("data-menu-action-kind") ?? "",
              opcode: Number(option.getAttribute("data-menu-opcode"))
            }))
          : [];
        if (options.some((option) => option.text.includes("Attack Opponent") && option.actionKind === "attack")) {
          window.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            bubbles: true,
            cancelable: true
          }));
          await settle();
          return { ok: true, x, y, clientX, clientY, options, attemptCount };
        }
      }
      return { ok: false, error: "could not locate opponent click", attemptCount };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function equipKodaiSelectBarrageAndClickOpponentBeforeTick(window, opponent) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
      const viewport = document.querySelector(".runtimeViewport");
      const kodaiSlot = document.querySelector('.kronosInventorySlot[data-inventory-item-id="21006"]');
      const magicTab = document.querySelector('.kronosSideTabButton[data-tab-id="magic"]');
      const canvas = document.querySelector(".runtimeViewport canvas");
      if (!kodaiSlot || !magicTab || !canvas) {
        return { ok: false, error: "missing Kodai slot, magic tab, or canvas" };
      }

      const slotRect = kodaiSlot.getBoundingClientRect();
      const slotX = slotRect.left + slotRect.width / 2;
      const slotY = slotRect.top + slotRect.height / 2;
      const slotTarget = document.elementFromPoint(slotX, slotY);
      if (!slotTarget || slotTarget.closest(".kronosInventorySlot") !== kodaiSlot) {
        return { ok: false, error: "Kodai slot is not the pointer target" };
      }

      slotTarget.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 131,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: slotX,
        clientY: slotY
      }));
      slotTarget.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 131,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX: slotX,
        clientY: slotY
      }));
      slotTarget.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: 0,
        clientX: slotX,
        clientY: slotY
      }));

      const magicRect = magicTab.getBoundingClientRect();
      magicTab.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 132,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: magicRect.left + magicRect.width / 2,
        clientY: magicRect.top + magicRect.height / 2
      }));
      await settle(30);

      const barrage = document.querySelector('.kronosSpellbookIconSprite[data-spell-id="ice-barrage"]');
      if (!barrage) {
        return { ok: false, error: "missing Ice Barrage icon after opening magic tab", dataset: { ...viewport?.dataset } };
      }
      const barrageRect = barrage.getBoundingClientRect();
      barrage.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 133,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: barrageRect.left + barrageRect.width / 2,
        clientY: barrageRect.top + barrageRect.height / 2
      }));
      await settle(40);

      const opponentX = ${JSON.stringify(opponent.clientX)};
      const opponentY = ${JSON.stringify(opponent.clientY)};
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 134,
        pointerType: "mouse",
        isPrimary: true,
        button: 2,
        buttons: 2,
        clientX: opponentX,
        clientY: opponentY
      }));
      await settle(20);
      const spellOption = Array.from(document.querySelectorAll(".kronosContextMenuOption")).find(
        (option) =>
          option.getAttribute("data-menu-action-kind") === "player-spell-selected" &&
          (option.textContent ?? "").includes("Ice Barrage")
      );
      if (!spellOption) {
        return {
          ok: false,
          error: "missing selected Ice Barrage player context option",
          options: Array.from(document.querySelectorAll(".kronosContextMenuOption")).map((option) => ({
            text: option.textContent ?? "",
            actionKind: option.getAttribute("data-menu-action-kind") ?? "",
            opcode: Number(option.getAttribute("data-menu-opcode"))
          })),
          dataset: { ...viewport?.dataset }
        };
      }
      spellOption.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 134,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: spellOption.getBoundingClientRect().left + 8,
        clientY: spellOption.getBoundingClientRect().top + spellOption.getBoundingClientRect().height / 2
      }));
      spellOption.click();
      await settle(30);

      return {
        ok: true,
        dataset: { ...viewport?.dataset },
        kodaiSlotIndex: Number(kodaiSlot.getAttribute("data-slot-index")),
        opponent: ${JSON.stringify(opponent)}
      };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function readRuntimeState(window) {
  return window.webContents.executeJavaScript(`
    (() => ({
      dataset: { ...document.querySelector(".runtimeViewport")?.dataset },
      localPose: (() => {
        const pose = document.querySelector('.runtimeActorPose[data-actor-id="local-player"]');
        return { loadoutId: pose?.getAttribute("data-loadout-id") ?? "" };
      })(),
      equipmentItems: Array.from(document.querySelectorAll(".kronosEquipmentItemSprite")).map((item) => ({
        slotId: item.getAttribute("data-slot-id") ?? "",
        itemId: Number(item.getAttribute("data-item-id")),
        itemName: item.getAttribute("data-item-name") ?? ""
      }))
    }))()
  `);
}

async function installXpDropObserver(window) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.__kronosXpDropRecords = [];
      window.__kronosXpDropObservedElements = new WeakSet();
      const record = () => {
        const now = performance.now();
        for (const element of document.querySelectorAll(".runeliteXpDropOverlay")) {
          const hitId = element.getAttribute("data-hit-id") ?? "";
          if (!hitId || window.__kronosXpDropObservedElements.has(element)) {
            continue;
          }
          window.__kronosXpDropObservedElements.add(element);
          window.__kronosXpDropRecords.push({
            key: hitId + "@" + window.__kronosXpDropRecords.length,
            hitId,
            damage: element.getAttribute("data-damage") ?? "",
            xpTotal: element.getAttribute("data-xp-total") ?? "",
            skills: element.getAttribute("data-xp-skills") ?? "",
            atMs: now
          });
        }
      };
      window.__kronosXpDropObserver?.disconnect?.();
      window.__kronosXpDropObserver = new MutationObserver(record);
      window.__kronosXpDropObserver.observe(document.body, { childList: true, subtree: true });
      record();
    })()
  `);
}

async function installActionSequenceObserver(window) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.__kronosActionSequenceObserver?.cancel?.();
      window.__kronosActionSequenceApplyLog = [];
      const state = {
        samples: [],
        starts: [],
        regressions: [],
        lastActiveKey: "",
        lastAnimationCycle: null,
        raf: 0,
        cancel() {
          if (this.raf) {
            cancelAnimationFrame(this.raf);
          }
          this.raf = 0;
        }
      };
      const sample = () => {
        const motion = window.__kronosRuntimeDebug?.motion;
        const local = motion?.actors?.find((actor) => actor.actorId === "local-player") ?? null;
        const actionKey = local?.actionSequenceKey ?? "";
        const animationCycle = Number(local?.animationCycle);
        const record = {
          atMs: performance.now(),
          clientCycle: motion?.clientCycle ?? null,
          sequenceName: local?.sequenceName ?? "",
          sequenceMode: local?.sequenceMode ?? "",
          actionSequenceKey: actionKey,
          animationCycle: Number.isFinite(animationCycle) ? animationCycle : null,
          primaryFrame: local?.primaryFrame ?? null,
          primaryFrameCycle: local?.primaryFrameCycle ?? null
        };
        state.samples.push(record);
        if (state.samples.length > 240) {
          state.samples.shift();
        }
        const active = record.sequenceName === "barrage_cast" && record.sequenceMode === "primary" && actionKey;
        if (active && state.lastActiveKey !== actionKey) {
          state.starts.push(record);
          state.lastActiveKey = actionKey;
          state.lastAnimationCycle = record.animationCycle;
        } else if (active) {
          if (
            typeof record.animationCycle === "number" &&
            typeof state.lastAnimationCycle === "number" &&
            record.animationCycle + 0.01 < state.lastAnimationCycle
          ) {
            state.regressions.push({
              previousAnimationCycle: state.lastAnimationCycle,
              ...record
            });
          }
          if (typeof record.animationCycle === "number") {
            state.lastAnimationCycle = Math.max(state.lastAnimationCycle ?? record.animationCycle, record.animationCycle);
          }
        } else {
          state.lastActiveKey = "";
          state.lastAnimationCycle = null;
        }
        state.raf = requestAnimationFrame(sample);
      };
      window.__kronosActionSequenceObserver = state;
      state.raf = requestAnimationFrame(sample);
    })()
  `);
}

async function readVisualCombatState(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const xpDropRecords = window.__kronosXpDropRecords ?? [];
      const xpDropCountsByHitId = {};
      for (const record of xpDropRecords) {
        xpDropCountsByHitId[record.hitId] = (xpDropCountsByHitId[record.hitId] ?? 0) + 1;
      }
      const pvpOverlay = document.querySelector(".runelitePvpOverlay");
      const pvpStyle = pvpOverlay ? getComputedStyle(pvpOverlay) : null;
      const compass = document.querySelector(".kronosCompassOverlay");
      const compassSprite = document.querySelector(".kronosCompassSprite");
      const compassSpriteStyle = compassSprite ? getComputedStyle(compassSprite) : null;
      return {
        xpDropRecords,
        xpDropCountsByHitId,
        pvpOverlay: {
          visible: Boolean(pvpOverlay),
          zIndex: pvpStyle?.zIndex ?? "",
          text: pvpOverlay?.textContent ?? ""
        },
        compass: {
          visible: Boolean(compass),
          sourceDraw: compass?.getAttribute("data-source-draw") ?? "",
          spriteId: compass?.getAttribute("data-compass-sprite-id") ?? "",
          backgroundImage: compassSpriteStyle?.backgroundImage ?? ""
        },
        actionSequence: {
          starts: window.__kronosActionSequenceObserver?.starts ?? [],
          regressions: window.__kronosActionSequenceObserver?.regressions ?? [],
          samples: window.__kronosActionSequenceObserver?.samples ?? [],
          applyLog: window.__kronosActionSequenceApplyLog ?? [],
          rewindSuppressed: Number(document.querySelector(".runtimeViewport canvas")?.dataset.lastLocalActionAnimationRewindSuppressed ?? "0")
        }
      };
    })()
  `);
}

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => {
    console.error(new Error("Timed out running inventory/spell/player same-tick Electron verifier."));
    app.exit(1);
  }, 55000);

  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      partition: `inventory-spell-player-same-tick-${Date.now()}`
    }
  });

  try {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    await waitForReady(window);
    await dispatchEvent(window, "kronos-runtime-camera", { camera: "isometric" });
    await dispatchEvent(window, "kronos-runtime-cycle", { cycle: 200 });
    await dispatchEvent(window, "kronos-runtime-spellbook", { spellbookId: "ancient" });
    await delay(200);
    await clickSideTab(window, "inventory");
    const opponent = await locateOpponentClick(window);
    await dispatchEvent(window, "kronos-runtime-reset-tick-origin", {});
    await installXpDropObserver(window);
    await installActionSequenceObserver(window);
    await delay(80);

    const dispatch = await equipKodaiSelectBarrageAndClickOpponentBeforeTick(window, opponent);
    if (
      dispatch.dataset.lastInventoryQueuedForTick !== "true" ||
      dispatch.dataset.lastInventoryAction !== "Wield" ||
      dispatch.dataset.lastInventoryItemId !== "21006" ||
      dispatch.dataset.lastPlayerActionKind !== "player-spell-selected" ||
      dispatch.dataset.lastPlayerServerPacketId !== "55" ||
      dispatch.dataset.lastPlayerSelectedSpellId !== "ice-barrage" ||
      dispatch.dataset.lastPlayerQueuedForTick !== "true" ||
      dispatch.dataset.lastPlayerQueuedAfterPendingInventory !== "true" ||
      dispatch.dataset.lastPlayerQueuedCombatKind !== "spell" ||
      dispatch.dataset.lastPlayerQueuedSpellId !== "ice-barrage"
    ) {
      throw new Error(`same-tick Kodai equip plus Ice Barrage player packet did not queue correctly: ${JSON.stringify(dispatch, null, 2)}`);
    }

    await delay(1000);
    await clickSideTab(window, "equipment");
    const state = await readRuntimeState(window);
    const weapon = state.equipmentItems.find((item) => item.slotId === "weapon");
    if (weapon?.itemId !== 21006) {
      throw new Error(`Kodai wand was not equipped before queued Ice Barrage resolved: ${JSON.stringify(state, null, 2)}`);
    }
    if (
      state.dataset.lastPlayerPacketDispatch !== "player-spell-selected" ||
      state.dataset.lastPlayerQueuedSpellId !== "ice-barrage" ||
      state.dataset.lastPlayerQueuedSpellAutocast !== "false" ||
      state.dataset.lastPlayerSpellResolvedSource !== "queued" ||
      state.dataset.lastPlayerQueuedForTickProcessed !== "true" ||
      state.dataset.lastSpellSelectionClear !== "player-spell-selected"
    ) {
      throw new Error(`queued Ice Barrage did not resolve after the equipment mutation: ${JSON.stringify(state, null, 2)}`);
    }
    if (state.localPose.loadoutId !== "kodai-robes") {
      throw new Error(`local actor did not render the Kodai mage loadout for queued Ice Barrage: ${JSON.stringify(state, null, 2)}`);
    }

    await delay(3600);
    const visualState = await readVisualCombatState(window);
    const duplicateXpDrops = Object.entries(visualState.xpDropCountsByHitId).filter(([, count]) => count > 1);
    if (visualState.xpDropRecords.length === 0 || duplicateXpDrops.length > 0) {
      throw new Error(`queued Ice Barrage should emit exactly one pre-hit XP drop per hit id: ${JSON.stringify(visualState, null, 2)}`);
    }
    const localBarrageStarts = visualState.actionSequence.starts.filter(
      (start) => start.sequenceName === "barrage_cast" && start.actionSequenceKey.includes("barrage_cast")
    );
    const uniqueBarrageActionKeys = new Set(localBarrageStarts.map((start) => start.actionSequenceKey));
    const localBarrageApplyLog = visualState.actionSequence.applyLog.filter(
      (entry) => entry.sequenceName === "barrage_cast" && entry.actionSequenceKey.includes("barrage_cast")
    );
    const uniqueAppliedBarrageActionKeys = new Set(localBarrageApplyLog.map((entry) => entry.actionSequenceKey));
    const applyRegressions = [];
    const cursorMismatches = [];
    for (let index = 1; index < localBarrageApplyLog.length; index += 1) {
      const previous = localBarrageApplyLog[index - 1];
      const current = localBarrageApplyLog[index];
      if (
        previous.actionSequenceKey === current.actionSequenceKey &&
        current.animationCycle + 0.01 < previous.animationCycle
      ) {
        applyRegressions.push({ previous, current });
      }
    }
    for (const entry of localBarrageApplyLog) {
      const expected = expectedPrimaryCursor(barrageSequence, entry.animationCycle);
      if (
        !expected ||
        entry.primaryFrame !== expected.frameIndex ||
        Math.abs(Number(entry.primaryFrameCycle) - expected.frameCycle) > 0.01
      ) {
        cursorMismatches.push({ entry, expected });
      }
    }
    const firstApply = localBarrageApplyLog[0] ?? null;
    if (
      localBarrageStarts.length > 1 ||
      uniqueBarrageActionKeys.size > 1 ||
      localBarrageApplyLog.length === 0 ||
      uniqueAppliedBarrageActionKeys.size !== 1 ||
      visualState.actionSequence.regressions.length > 0 ||
      applyRegressions.length > 0 ||
      cursorMismatches.length > 0 ||
      !firstApply ||
      firstApply.animationCycle !== 0 ||
      firstApply.primaryFrame !== 0 ||
      firstApply.primaryFrameCycle !== 0
    ) {
      throw new Error(`queued Ice Barrage should start one monotonic local cast animation: ${JSON.stringify({
        ...visualState.actionSequence,
        applyRegressions,
        cursorMismatches,
        firstApply
      }, null, 2)}`);
    }
    if (!visualState.pvpOverlay.visible || visualState.pvpOverlay.zIndex !== "30") {
      throw new Error(`PvP Performance Tracker overlay should be visible above the fixed HUD during combat: ${JSON.stringify(visualState, null, 2)}`);
    }
    if (
      !visualState.compass.visible ||
      visualState.compass.spriteId !== "169" ||
      !visualState.compass.backgroundImage.includes("compass.png") ||
      !visualState.compass.sourceDraw.includes("AttackOption.compass.method6205")
    ) {
      throw new Error(`fixed compass should render the exported Kronos compass sprite: ${JSON.stringify(visualState, null, 2)}`);
    }

    console.log(JSON.stringify({ ok: true, opponent, dispatch, state, visualState }, null, 2));
    clearTimeout(watchdog);
    app.quit();
  } catch (error) {
    clearTimeout(watchdog);
    console.error(error);
    app.exit(1);
  }
});
