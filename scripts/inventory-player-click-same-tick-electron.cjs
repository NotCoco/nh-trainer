const { app, BrowserWindow } = require("./electron-muted.cjs");
const path = require("node:path");

const [, , projectRoot] = process.argv;
const sameTickWeaponItemId = 21902;
const sameTickWeaponName = "Dragon crossbow";
const sameTickWeaponLoadoutId = "acb-hides";

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

async function clickStartAndWaitForGo(window) {
  await window.webContents.executeJavaScript(`
    (() => {
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
        pointerId: 121,
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
        pointerId: 121,
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
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(`
      (() => !document.querySelector(".runtimeFightStartButton") && !document.querySelector(".runtimeFightCountdownOverlay"))()
    `);
    if (ready) {
      return;
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for fight countdown to finish.");
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
      const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        await settle();
        const motion = window.__nhRuntimeDebug?.motion;
        const opponent = motion?.actors?.find((actor) => actor.actorId === "opponent");
        if (opponent?.clickbox?.dom && opponent?.tile) {
          return {
            ok: true,
            x: opponent.clickbox.dom.centerX,
            y: opponent.clickbox.dom.centerY,
            clientX: opponent.clickbox.dom.centerX,
            clientY: opponent.clickbox.dom.centerY,
            tile: opponent.tile,
            clickbox: opponent.clickbox,
            attemptCount: 1
          };
        }
      }
      const motion = window.__nhRuntimeDebug?.motion;
      const opponent = motion?.actors?.find((actor) => actor.actorId === "opponent") ?? null;
      return { ok: false, error: "could not locate opponent debug clickbox", layout: motion?.layout ?? null, opponent };
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
      const foodSlot = Array.from(document.querySelectorAll(".nhInventorySlot")).find((candidate) => {
        const itemId = Number(candidate.getAttribute("data-inventory-item-id") || "0");
        const itemName = (candidate.getAttribute("data-inventory-item-name") || "").toLowerCase();
        return [385, 391, 3144].includes(itemId) ||
          itemName.includes("manta") ||
          itemName.includes("shark") ||
          itemName.includes("karambwan");
      });
      const slot = Array.from(document.querySelectorAll(".nhInventorySlot")).find(
        (candidate) => candidate.getAttribute("data-inventory-item-id") === "${sameTickWeaponItemId}"
      );
      const canvas = document.querySelector(".runtimeViewport canvas");
      if (!foodSlot || !slot || !canvas) {
        return {
          ok: false,
          error: "missing same-tick food slot, ${sameTickWeaponName} inventory slot, or canvas",
          hasCanvas: Boolean(canvas),
          activeSideTabId: document.querySelector(".runtimeViewport")?.getAttribute("data-active-side-tab-id") ?? "",
          inventoryItems: Array.from(document.querySelectorAll(".nhInventorySlot")).map((candidate) => ({
            slotIndex: Number(candidate.getAttribute("data-slot-index")),
            itemId: candidate.getAttribute("data-inventory-item-id") ?? "",
            itemName: candidate.getAttribute("data-inventory-item-name") ?? ""
          }))
        };
      }
      const slotRect = slot.getBoundingClientRect();
      const slotItemId = Number(slot.getAttribute("data-inventory-item-id") || "0");
      if (slotItemId !== ${sameTickWeaponItemId}) {
        return { ok: false, error: "selected inventory slot should contain ${sameTickWeaponName} for this regression", slotItemId };
      }
      const slotIndex = Number(slot.getAttribute("data-slot-index"));
      const foodSlotIndex = Number(foodSlot.getAttribute("data-slot-index"));
      const foodItemId = Number(foodSlot.getAttribute("data-inventory-item-id") || "0");
      const foodItemName = foodSlot.getAttribute("data-inventory-item-name") || "";

      const clickSlot = (targetSlot, pointerId) => {
        const rect = targetSlot.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const target = document.elementFromPoint(x, y);
        if (!target || target.closest(".nhInventorySlot") !== targetSlot) {
          return { ok: false, x, y };
        }
        target.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId,
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
          pointerId,
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
        return { ok: true, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
      };

      const foodClick = clickSlot(foodSlot, 130);
      if (!foodClick.ok) {
        return { ok: false, error: "food slot is not the pointer target", foodSlotIndex, foodItemId, foodItemName, foodClick };
      }
      const weaponClick = clickSlot(slot, 131);
      if (!weaponClick.ok) {
        return { ok: false, error: "${sameTickWeaponName} slot is not the pointer target", slotIndex, weaponClick };
      }

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
        foodSlotIndex,
        foodItemId,
        foodItemName,
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
          loadoutId: pose?.getAttribute("data-loadout-id") ?? "",
          appearanceItemIds: (pose?.getAttribute("data-appearance-item-ids") ?? "")
            .split(",")
            .filter(Boolean)
            .map(Number),
          appearanceEquipmentSlots: (pose?.getAttribute("data-appearance-equipment-slots") ?? "")
            .split(",")
            .filter(Boolean)
            .map(Number),
          sequenceName: pose?.getAttribute("data-sequence-name") ?? "",
          sequenceMode: pose?.getAttribute("data-sequence-mode") ?? "",
          actionSequenceKey: pose?.getAttribute("data-action-sequence-key") ?? ""
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
    await window.webContents.executeJavaScript(`(() => { window.__NH_TRAINER_ENABLE_RUNTIME_MOTION_DEBUG = true; })()`);
    await waitForReady(window);
    await dispatchEvent(window, "nh-runtime-camera", { camera: "top" });
    await dispatchEvent(window, "nh-runtime-cycle", { cycle: 200 });
    await delay(200);
    await clickStartAndWaitForGo(window);
    await clickSideTab(window, "inventory");
    const opponent = await locateOpponentClick(window);
    await delay(80);

    const dispatch = await equipWeaponAndClickOpponentBeforeTick(window, opponent);
    if (
      dispatch.dataset.lastInventoryQueuedForTick !== "true" ||
      dispatch.dataset.lastInventoryAction !== "Wield" ||
      dispatch.dataset.lastInventoryItemId !== String(sameTickWeaponItemId) ||
      dispatch.dataset.lastPlayerQueuedForTick !== "true" ||
      dispatch.dataset.lastPlayerQueuedAfterPendingInventory !== "true"
    ) {
      throw new Error(`same-tick equip plus attack did not queue both packets before the tick: ${JSON.stringify(dispatch, null, 2)}`);
    }

    await delay(2000);
    await clickSideTab(window, "equipment");
    const state = await readRuntimeState(window);
    const weapon = state.equipmentItems.find((item) => item.slotId === "weapon");
    if (weapon?.itemId !== sameTickWeaponItemId) {
      throw new Error(`${sameTickWeaponName} was not equipped after same-tick attack packet: ${JSON.stringify(state, null, 2)}`);
    }
    if (
      state.dataset.lastPlayerAttackCommand !== "Attack" ||
      state.dataset.lastPlayerAttackResolvedSource !== "queued" ||
      state.dataset.lastPlayerQueuedForTickProcessed !== "true"
    ) {
      throw new Error(`queued player attack did not resolve after equipment mutation: ${JSON.stringify(state, null, 2)}`);
    }
    if (state.localPose.loadoutId !== sameTickWeaponLoadoutId) {
      throw new Error(`local actor did not render the newly equipped weapon loadout: ${JSON.stringify(state, null, 2)}`);
    }
    if (!state.localPose.appearanceItemIds.includes(sameTickWeaponItemId)) {
      throw new Error(`local actor attack appearance did not include the same-tick equipped ${sameTickWeaponName}: ${JSON.stringify(state, null, 2)}`);
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
