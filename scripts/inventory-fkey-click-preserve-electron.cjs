const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const [, , projectRoot, screenshotPath] = process.argv;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForGameTick() {
  return delay(1500);
}

async function waitForReady(window) {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const status = await window.webContents.executeJavaScript(`
      (() => {
        const root = document.querySelector('section[aria-labelledby="runtime-scene"]');
        const ready = root?.querySelector(".glbStatus-ready");
        const error = root?.querySelector(".glbStatus-error, .glbStatus-missing");
        return {
          ready: ready?.textContent ?? "",
          error: error?.textContent ?? ""
        };
      })()
    `);

    if (status.ready) {
      return status.ready;
    }
    if (status.error) {
      throw new Error(status.error);
    }
    await delay(250);
  }

  throw new Error("Timed out waiting for runtime scene readiness.");
}

async function verifyInventoryClickSurvivesFKey(window) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const inventory = [
        { itemId: 21006, quantity: 1 },
        { itemId: 4736, quantity: 1 },
        { itemId: 4738, quantity: 1 },
        { itemId: 12006, quantity: 1 },
        { itemId: 11832, quantity: 1 },
        { itemId: 11834, quantity: 1 },
        { itemId: 4153, quantity: 1 },
        { itemId: 6685, quantity: 1 },
        { itemId: 6685, quantity: 1 },
        { itemId: 6685, quantity: 1 },
        { itemId: 6685, quantity: 1 },
        { itemId: 3024, quantity: 1 },
        { itemId: 3024, quantity: 1 },
        { itemId: 3024, quantity: 1 },
        { itemId: 385, quantity: 1 },
        { itemId: 385, quantity: 1 },
        { itemId: 385, quantity: 1 },
        { itemId: 385, quantity: 1 },
        { itemId: 3144, quantity: 1 },
        { itemId: 3144, quantity: 1 },
        { itemId: 3144, quantity: 1 },
        { itemId: 3144, quantity: 1 },
        { itemId: 3144, quantity: 1 },
        { itemId: 13441, quantity: 1 },
        { itemId: 13441, quantity: 1 },
        { itemId: 13441, quantity: 1 },
        { itemId: 12695, quantity: 1 },
        { itemId: 22461, quantity: 1 }
      ];

      const inventoryTab = document.querySelector('.nhSideTabButton[data-tab-id="inventory"]');
      if (inventoryTab) {
        const tabRect = inventoryTab.getBoundingClientRect();
        inventoryTab.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId: 11,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: 1,
          clientX: tabRect.left + tabRect.width / 2,
          clientY: tabRect.top + tabRect.height / 2
        }));
        await nextFrame();
      }

      window.dispatchEvent(new CustomEvent("nh-runtime-inventory", {
        detail: { inventory }
      }));
      window.dispatchEvent(new CustomEvent("nh-runtime-reset-tick-origin"));
      await nextFrame();
      await new Promise((resolve) => setTimeout(resolve, 150));

      const slot = document.querySelector('.nhInventorySlot[data-slot-index="0"]');
      if (!slot) {
        return { ok: false, error: "missing inventory slot 0" };
      }
      const slotRect = slot.getBoundingClientRect();
      const slotItemId = Number(slot.getAttribute("data-inventory-item-id") || "0");
      if (slotItemId !== 21006) {
        return { ok: false, error: "inventory override did not put Kodai wand in slot 0", slotItemId };
      }
      const clientX = slotRect.left + slotRect.width / 2;
      const clientY = slotRect.top + slotRect.height / 2;
      const target = document.elementFromPoint(clientX, clientY);
      if (!target || target.closest('.nhInventorySlot[data-slot-index="0"]') !== slot) {
        return { ok: false, error: "slot 0 is not the real pointer target" };
      }

      target.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 91,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX,
        clientY
      }));

      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "F1",
        code: "F1",
        bubbles: true,
        cancelable: true
      }));
      await nextFrame();

      const releaseTarget = document.elementFromPoint(clientX, clientY) ?? document.body;
      releaseTarget.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 91,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX,
        clientY
      }));
      releaseTarget.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: 0,
        clientX,
        clientY
      }));
      await nextFrame();

      const viewport = document.querySelector(".runtimeViewport");
      const dataset = { ...viewport?.dataset };
      const ok =
          dataset.activeSideTabId === "combat" &&
          dataset.lastSideTabFKey === "F1" &&
          dataset.lastInventoryActivation === "default" &&
          dataset.lastInventoryAction === "Wield" &&
          dataset.lastInventoryItemId === "21006" &&
          dataset.lastInventorySlot === "0" &&
          dataset.lastInventoryWidgetId === "9764864";
      return {
        ok,
        error: ok ? "" : "inventory click did not survive F-key tab switch",
        dataset,
        slotRect: { left: slotRect.left, top: slotRect.top, width: slotRect.width, height: slotRect.height },
        releaseTargetClassName: releaseTarget.className?.toString?.() ?? "",
        releaseTargetTagName: releaseTarget.tagName ?? ""
      };
    })()
  `);

  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function clickSideTab(window, tabId) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const tab = document.querySelector(${JSON.stringify(`.nhSideTabButton[data-tab-id="${tabId}"]`)});
      if (!tab) {
        return { ok: false, error: "missing side tab", tabId: ${JSON.stringify(tabId)} };
      }
      const rect = tab.getBoundingClientRect();
      tab.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 13,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function readRuntimeEquipment(window) {
  return window.webContents.executeJavaScript(`
    (() => ({
      items: Array.from(document.querySelectorAll(".nhEquipmentItemSprite")).map((item) => ({
        slotId: item.getAttribute("data-slot-id") ?? "",
        itemId: Number(item.getAttribute("data-item-id")),
        itemName: item.getAttribute("data-item-name") ?? ""
      }))
    }))()
  `);
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      backgroundThrottling: false,
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    const runtimeReadyMessage = await waitForReady(window);
    await delay(300);
    const dispatch = await verifyInventoryClickSurvivesFKey(window);
    await waitForGameTick();
    await clickSideTab(window, "equipment");
    const equipment = await readRuntimeEquipment(window);
    const weapon = equipment.items.find((item) => item.slotId === "weapon");
    if (weapon?.itemId !== 21006) {
      throw new Error(`F-key interrupted inventory click did not equip Kodai wand after tick: ${JSON.stringify(equipment)}`);
    }
    if (screenshotPath) {
      const image = await window.webContents.capturePage();
      await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
      await fs.writeFile(screenshotPath, image.toPNG());
    }
    console.log(JSON.stringify({ runtimeReadyMessage, dispatch, equipment, screenshotPath }, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
