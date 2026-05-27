const { app, BrowserWindow } = require("electron");
const path = require("node:path");

const [, , projectRoot] = process.argv;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(window) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(`
      (() => Boolean(
        document.querySelector(".runeliteClientShell") &&
        document.querySelector(".glbStatus-ready") &&
        document.querySelector(".runtimeViewport canvas") &&
        document.querySelector('.nhInventorySlot[data-slot-index="0"]')
      ))()
    `);
    if (ready) {
      return;
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for runtime inventory and scene.");
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
      const settle = () => new Promise((resolve) => setTimeout(resolve, 25));
      const tab = document.querySelector(${JSON.stringify(`.nhSideTabButton[data-tab-id="${tabId}"]`)});
      if (!tab) {
        return { ok: false, error: "missing side tab", tabId: ${JSON.stringify(tabId)} };
      }
      const rect = tab.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;
      tab.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 20,
        pointerType: "mouse",
        button: 0,
        buttons: 1,
        clientX,
        clientY
      }));
      tab.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 20,
        pointerType: "mouse",
        button: 0,
        buttons: 0,
        clientX,
        clientY
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

async function locateOpponentClick(window) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const settle = () => new Promise((resolve) => setTimeout(resolve, 25));
      const canvas = document.querySelector(".runtimeViewport canvas");
      if (!canvas) {
        return { ok: false, error: "missing runtime canvas" };
      }
      const rect = canvas.getBoundingClientRect();
      const offsets = [
        [260, 180],
        [240, 180],
        [280, 180],
        [260, 160],
        [260, 200],
        [220, 180],
        [300, 180],
        [260, 140],
        [260, 220]
      ];
      for (let y = 80; y <= rect.height - 80; y += 40) {
        for (let x = 80; x <= rect.width - 80; x += 40) {
          offsets.push([x, y]);
        }
      }
      const attempts = [];
      for (const [x, y] of offsets) {
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
        let menu = document.querySelector(".nhContextMenu");
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
          menu = document.querySelector(".nhContextMenu");
        }
        const options = menu
          ? Array.from(menu.querySelectorAll(".nhContextMenuOption")).map((option) => ({
              text: option.textContent ?? "",
              actionKind: option.getAttribute("data-menu-action-kind") ?? "",
              opcode: Number(option.getAttribute("data-menu-opcode"))
            }))
          : [];
        attempts.push({ x, y, options });
        if (options.some((option) => option.text.includes("Attack Opponent") && option.actionKind === "attack")) {
          window.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            bubbles: true,
            cancelable: true
          }));
          await settle();
          return { ok: true, x, y, clientX, clientY, options, attemptCount: attempts.length };
        }
      }
      return { ok: false, error: "could not locate opponent Attack click", attempts };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function equipWeaponAndClickOpponentBeforeTick(window, opponent) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const settle = () => new Promise((resolve) => setTimeout(resolve, 25));
      const slot = Array.from(document.querySelectorAll(".nhInventorySlot")).find(
        (candidate) => candidate.getAttribute("data-inventory-item-id") === "21006"
      );
      const canvas = document.querySelector(".runtimeViewport canvas");
      if (!slot || !canvas) {
        return { ok: false, error: "missing Kodai wand inventory slot or canvas" };
      }
      const slotRect = slot.getBoundingClientRect();
      const slotItemId = Number(slot.getAttribute("data-inventory-item-id") || "0");
      if (slotItemId !== 21006) {
        return { ok: false, error: "selected inventory slot should contain Kodai wand for this regression", slotItemId };
      }
      const slotIndex = Number(slot.getAttribute("data-slot-index"));

      const slotX = slotRect.left + slotRect.width / 2;
      const slotY = slotRect.top + slotRect.height / 2;
      const slotTarget = document.elementFromPoint(slotX, slotY);
      if (!slotTarget || slotTarget.closest(".nhInventorySlot") !== slot) {
        return { ok: false, error: "Kodai wand slot is not the pointer target", slotIndex };
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

      const opponentX = ${JSON.stringify(opponent.clientX)};
      const opponentY = ${JSON.stringify(opponent.clientY)};
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 132,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: opponentX,
        clientY: opponentY
      }));
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 132,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX: opponentX,
        clientY: opponentY
      }));
      await settle();
      const viewport = document.querySelector(".runtimeViewport");
      return {
        ok: true,
        dataset: { ...viewport?.dataset },
        slotIndex,
        slotRect: { left: slotRect.left, top: slotRect.top, width: slotRect.width, height: slotRect.height },
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
        return {
          loadoutId: pose?.getAttribute("data-loadout-id") ?? ""
        };
      })(),
      equipmentItems: Array.from(document.querySelectorAll(".nhEquipmentItemSprite")).map((item) => ({
        slotId: item.getAttribute("data-slot-id") ?? "",
        itemId: Number(item.getAttribute("data-item-id")),
        itemName: item.getAttribute("data-item-name") ?? ""
      }))
    }))()
  `);
}

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => {
    console.error(new Error("Timed out running inventory/player same-tick Electron verifier."));
    app.exit(1);
  }, 45000);

  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      partition: `inventory-player-click-same-tick-${Date.now()}`
    }
  });

  try {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    await waitForReady(window);
    await dispatchEvent(window, "nh-runtime-camera", { camera: "isometric" });
    await dispatchEvent(window, "nh-runtime-cycle", { cycle: 200 });
    await delay(200);
    await clickSideTab(window, "inventory");
    const opponent = await locateOpponentClick(window);
    await dispatchEvent(window, "nh-runtime-reset-tick-origin", {});
    await delay(80);

    const dispatch = await equipWeaponAndClickOpponentBeforeTick(window, opponent);
    if (
      dispatch.dataset.lastInventoryQueuedForTick !== "true" ||
      dispatch.dataset.lastInventoryAction !== "Wield" ||
      dispatch.dataset.lastInventoryItemId !== "21006" ||
      dispatch.dataset.lastPlayerQueuedForTick !== "true" ||
      dispatch.dataset.lastPlayerQueuedAfterPendingInventory !== "true"
    ) {
      throw new Error(`same-tick equip plus attack did not queue both packets before the tick: ${JSON.stringify(dispatch, null, 2)}`);
    }

    await delay(1000);
    await clickSideTab(window, "equipment");
    const state = await readRuntimeState(window);
    const weapon = state.equipmentItems.find((item) => item.slotId === "weapon");
    if (weapon?.itemId !== 21006) {
      throw new Error(`Kodai wand was not equipped after same-tick attack packet: ${JSON.stringify(state, null, 2)}`);
    }
    if (
      state.dataset.lastPlayerAttackCommand !== "Attack" ||
      state.dataset.lastPlayerAttackResolvedSource !== "queued" ||
      state.dataset.lastPlayerQueuedForTickProcessed !== "true"
    ) {
      throw new Error(`queued player attack did not resolve after equipment mutation: ${JSON.stringify(state, null, 2)}`);
    }
    if (state.localPose.loadoutId !== "kodai-robes") {
      throw new Error(`local actor did not render the newly equipped weapon loadout: ${JSON.stringify(state, null, 2)}`);
    }

    console.log(JSON.stringify({ ok: true, opponent, dispatch, state }, null, 2));
    clearTimeout(watchdog);
    app.quit();
  } catch (error) {
    clearTimeout(watchdog);
    console.error(error);
    app.exit(1);
  }
});
