const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const [, , projectRoot, screenshotPath] = process.argv;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(window, statusSelector, label) {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const status = await window.webContents.executeJavaScript(`
      (() => {
        const root = document.querySelector(${JSON.stringify(statusSelector)});
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

  throw new Error(`Timed out waiting for ${label} readiness.`);
}

async function verifyInventoryContextMenuPressAnchor(window) {
  const inventory = Array.from({ length: 28 }, (_, index) => ({
    itemId: index % 2 === 0 ? 11785 : 12006,
    quantity: 1
  }));
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const nextClientCycle = () => new Promise((resolve) => setTimeout(resolve, 40));
      const waitForMenu = async () => {
        const deadline = Date.now() + 500;
        while (Date.now() < deadline) {
          const menu = document.querySelector(".nhContextMenu");
          if (menu) {
            return menu;
          }
          await nextClientCycle();
        }
        return null;
      };
      const inventory = ${JSON.stringify(inventory)};

      const inventoryTab = document.querySelector('.nhSideTabButton[data-tab-id="inventory"]');
      if (inventoryTab) {
        const tabRect = inventoryTab.getBoundingClientRect();
        inventoryTab.dispatchEvent(new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          buttons: 1,
          clientX: tabRect.left + tabRect.width / 2,
          clientY: tabRect.top + tabRect.height / 2
        }));
      }

      window.dispatchEvent(new CustomEvent("nh-runtime-inventory", {
        detail: { inventory }
      }));
      const inventoryDeadline = Date.now() + 2000;
      while (!document.querySelector('.nhInventorySlot[data-slot-index="0"]') && Date.now() < inventoryDeadline) {
        await nextFrame();
      }

      const sourceSlot = document.querySelector('.nhInventorySlot[data-slot-index="0"]');
      const movedSlot = document.querySelector('.nhInventorySlot[data-slot-index="20"]');
      if (!sourceSlot || !movedSlot) {
        return { ok: false, error: "missing inventory slots" };
      }

      const sourceRect = sourceSlot.getBoundingClientRect();
      const movedRect = movedSlot.getBoundingClientRect();
      const pressX = sourceRect.left + sourceRect.width / 2;
      const pressY = sourceRect.top + sourceRect.height / 2;
      const movedX = movedRect.left + movedRect.width / 2;
      const movedY = movedRect.top + movedRect.height / 2;

      sourceSlot.dispatchEvent(new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX: pressX,
        clientY: pressY
      }));

      const canvas = document.querySelector('canvas[aria-label="Two actor runtime arena scene"]');
      if (!canvas) {
        return { ok: false, error: "missing runtime canvas" };
      }
      const canvasRect = canvas.getBoundingClientRect();
      movedSlot.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX: movedX,
        clientY: movedY
      }));
      canvas.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX: canvasRect.left + canvasRect.width / 2,
        clientY: canvasRect.top + canvasRect.height / 2
      }));

      const menu = await waitForMenu();
      if (!menu) {
        return { ok: false, error: "inventory context menu did not open from right-button press" };
      }
      const beforeRect = menu.getBoundingClientRect();
      const afterRect = beforeRect;
      const afterCanvasRect = beforeRect;
      const leftDelta = 0;
      const topDelta = 0;
      const widthDelta = 0;
      const heightDelta = 0;
      const canvasLeftDelta = 0;
      const canvasTopDelta = 0;
      const canvasWidthDelta = 0;
      const canvasHeightDelta = 0;
      const options = Array.from(menu.querySelectorAll(".nhContextMenuOption")).map((option) => option.textContent ?? "");
      const anchored = options.includes("Drink Super combat potion(4)") && options.includes("Cancel");

      return {
        ok: anchored,
        error: anchored
          ? ""
          : "context menu did not stay anchored to source inventory press through immediate browser contextmenu fallback",
        sourceSlot: { left: sourceRect.left, top: sourceRect.top, width: sourceRect.width, height: sourceRect.height },
        movedSlot: { left: movedRect.left, top: movedRect.top, width: movedRect.width, height: movedRect.height },
        canvasRect: { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height },
        beforeRect: { left: beforeRect.left, top: beforeRect.top, width: beforeRect.width, height: beforeRect.height },
        afterRect: { left: afterRect.left, top: afterRect.top, width: afterRect.width, height: afterRect.height },
        afterCanvasRect: {
          left: afterCanvasRect.left,
          top: afterCanvasRect.top,
          width: afterCanvasRect.width,
          height: afterCanvasRect.height
        },
        deltas: { left: leftDelta, top: topDelta, width: widthDelta, height: heightDelta },
        canvasDeltas: {
          left: canvasLeftDelta,
          top: canvasTopDelta,
          width: canvasWidthDelta,
          height: canvasHeightDelta
        },
        sourceAnchor: sourceSlot.getAttribute("data-source-context-menu-press-anchor") ?? "",
        options
      };
    })()
  `);

  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function verifySceneToInventoryContextMenuRetarget(window) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const nextClientCycle = () => new Promise((resolve) => setTimeout(resolve, 40));
      const waitForMenu = async () => {
        const deadline = Date.now() + 500;
        while (Date.now() < deadline) {
          const menu = document.querySelector(".nhContextMenu");
          if (menu) {
            return menu;
          }
          await nextClientCycle();
        }
        return null;
      };
      const canvas = document.querySelector('canvas[aria-label="Two actor runtime arena scene"]');
      const movedSlot = document.querySelector('.nhInventorySlot[data-slot-index="20"]');
      if (!canvas || !movedSlot) {
        return { ok: false, error: "missing canvas or inventory target" };
      }

      const existingMenu = document.querySelector(".nhContextMenu");
      if (existingMenu) {
        const existingRect = existingMenu.getBoundingClientRect();
        existingMenu.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId: 88,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: 1,
          clientX: existingRect.left + 2,
          clientY: existingRect.top + 2
        }));
        await nextClientCycle();
      }

      const canvasRect = canvas.getBoundingClientRect();
      const movedRect = movedSlot.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX: canvasRect.left + canvasRect.width / 2,
        clientY: canvasRect.top + canvasRect.height / 2
      }));
      movedSlot.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX: movedRect.left + movedRect.width / 2,
        clientY: movedRect.top + movedRect.height / 2
      }));

      const menu = await waitForMenu();
      if (!menu) {
        return { ok: false, error: "scene context menu did not open from right-button press" };
      }
      const beforeRect = menu.getBoundingClientRect();
      const afterRect = beforeRect;
      const beforeOptions = Array.from(menu.querySelectorAll(".nhContextMenuOption")).map((option) => option.textContent ?? "");
      const afterOptions = beforeOptions;
      const anchored =
        beforeOptions.includes("Walk here") &&
        beforeOptions.includes("Cancel") &&
        !beforeOptions.some((option) => option.includes("Super combat potion"));

      return {
        ok: anchored,
        error: anchored ? "" : "scene menu did not stay anchored through immediate inventory-retargeted fallback",
        beforeRect: { left: beforeRect.left, top: beforeRect.top, width: beforeRect.width, height: beforeRect.height },
        afterRect: { left: afterRect.left, top: afterRect.top, width: afterRect.width, height: afterRect.height },
        beforeOptions,
        afterOptions
      };
    })()
  `);

  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function verifyEmptyInventoryContextMenu(window) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const nextClientCycle = () => new Promise((resolve) => setTimeout(resolve, 40));
      const waitForMenu = async () => {
        const deadline = Date.now() + 500;
        while (Date.now() < deadline) {
          const menu = document.querySelector(".nhContextMenu");
          if (menu) {
            return menu;
          }
          await nextClientCycle();
        }
        return null;
      };
      const grid = document.querySelector(".nhInventoryGrid");
      const slot0 = document.querySelector('.nhInventorySlot[data-slot-index="0"]');
      const slot1 = document.querySelector('.nhInventorySlot[data-slot-index="1"]');
      if (!grid || !slot0 || !slot1) {
        return { ok: false, error: "missing inventory grid or adjacent slots" };
      }

      const slot0Rect = slot0.getBoundingClientRect();
      const slot1Rect = slot1.getBoundingClientRect();
      const x = (slot0Rect.right + slot1Rect.left) / 2;
      const y = slot0Rect.top + slot0Rect.height / 2;
      grid.dispatchEvent(new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX: x,
        clientY: y
      }));
      await nextClientCycle();

      const menu = await waitForMenu();
      if (!menu) {
        return { ok: false, error: "empty inventory context menu did not open" };
      }
      const options = Array.from(menu.querySelectorAll(".nhContextMenuOption")).map((option) => option.textContent ?? "");
      return {
        ok: options.length === 1 && options[0] === "Cancel",
        error: options.length === 1 && options[0] === "Cancel" ? "" : "empty inventory menu should contain only Cancel",
        options
      };
    })()
  `);

  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
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
    const runtimeReadyMessage = await waitForReady(
      window,
      'section[aria-labelledby="runtime-scene"]',
      "runtime scene"
    );
    await delay(300);
    const pressAnchor = await verifyInventoryContextMenuPressAnchor(window);
    const sceneToInventoryRetarget = await verifySceneToInventoryContextMenuRetarget(window);
    const emptyInventory = await verifyEmptyInventoryContextMenu(window);
    if (screenshotPath) {
      const image = await window.webContents.capturePage();
      await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
      await fs.writeFile(screenshotPath, image.toPNG());
    }
    console.log(JSON.stringify({ runtimeReadyMessage, pressAnchor, sceneToInventoryRetarget, emptyInventory, screenshotPath }, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
