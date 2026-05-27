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
        document.querySelector('.nhSideTabButton[data-tab-id="inventory"]') &&
        document.querySelector('.nhInventorySlot[data-slot-index="0"]')
      ))()
    `);
    if (ready) {
      return;
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the runtime inventory.");
}

async function resetRuntimeTickOrigin(window) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.dispatchEvent(new CustomEvent("nh-runtime-reset-tick-origin"));
    })()
  `);
  await delay(50);
}

async function setRuntimeCycle(window, cycle) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.dispatchEvent(new CustomEvent("nh-runtime-cycle", {
        detail: { cycle: ${JSON.stringify(cycle)} }
      }));
    })()
  `);
  await delay(150);
}

async function clickSideTab(window, tabId) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
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
      await nextFrame();
      await nextFrame();
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
}

async function pointerReleaseInventorySwitchWithoutClick(window, slotIndices) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const slotIndices = ${JSON.stringify(slotIndices)};
      const clicked = [];
      for (const slotIndex of slotIndices) {
        const slot = document.querySelector('.nhInventorySlot[data-slot-index="' + slotIndex + '"]');
        if (!slot) {
          return { ok: false, error: "missing inventory slot", slotIndex };
        }
        const rect = slot.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const target = document.elementFromPoint(clientX, clientY);
        if (!target || target.closest('.nhInventorySlot[data-slot-index="' + slotIndex + '"]') !== slot) {
          return { ok: false, error: "inventory slot is not the real pointer target", slotIndex };
        }
        const pointerId = 100 + slotIndex;
        target.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
          clientX,
          clientY
        }));
        window.dispatchEvent(new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 0,
          clientX: clientX + 2,
          clientY: clientY + 2
        }));
        clicked.push(slotIndex);
      }
      await nextFrame();
      await nextFrame();
      const viewport = document.querySelector(".runtimeViewport");
      const pending = slotIndices.map((slotIndex) => ({
        slotIndex,
        pendingEquip: document.querySelector('.nhInventorySlot[data-slot-index="' + slotIndex + '"]')?.getAttribute("data-pending-equip") ?? ""
      }));
      return { ok: true, clicked, pending, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function readRuntimeInventory(window) {
  return window.webContents.executeJavaScript(`
    (() => ({
      slots: Array.from(document.querySelectorAll(".nhInventorySlot")).map((slot) => {
        const sprite = slot.querySelector(".nhInventoryItemSprite");
        return {
          slotIndex: Number(slot.getAttribute("data-slot-index")),
          pendingEquip: slot.getAttribute("data-pending-equip") ?? "",
          itemId: sprite ? Number(sprite.getAttribute("data-item-id")) : null,
          label: sprite?.getAttribute("aria-label") ?? ""
        };
      })
    }))()
  `);
}

async function readRuntimeEquipment(window) {
  return window.webContents.executeJavaScript(`
    (() => ({
      items: Array.from(document.querySelectorAll(".nhEquipmentItemSprite")).map((item) => ({
        slotId: item.getAttribute("data-slot-id") ?? "",
        itemId: Number(item.getAttribute("data-item-id"))
      }))
    }))()
  `);
}

function sortedItemIds(slots) {
  return slots.map((slot) => slot.itemId).sort((a, b) => a - b);
}

function assertSameItemSet(context, actualSlots, expectedItemIds) {
  const actual = sortedItemIds(actualSlots);
  const expected = [...expectedItemIds].sort((a, b) => a - b);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${context} item set mismatch: ${JSON.stringify({ actual, expected, actualSlots }, null, 2)}`);
  }
}

async function waitForClickedSlotsToContain(window, slotIndices, expectedItemIds) {
  const deadline = Date.now() + 1500;
  let lastInventory = null;
  while (Date.now() < deadline) {
    lastInventory = await readRuntimeInventory(window);
    const clickedSlots = slotIndices.map((slotIndex) => lastInventory.slots[slotIndex]);
    if (JSON.stringify(sortedItemIds(clickedSlots)) === JSON.stringify([...expectedItemIds].sort((a, b) => a - b))) {
      return lastInventory;
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for clicked inventory slots to contain ${JSON.stringify(expectedItemIds)}: ${JSON.stringify(lastInventory)}`);
}

function assertEquipmentContains(context, equipment, expectedBySlot) {
  const actualBySlot = Object.fromEntries(equipment.items.map((item) => [item.slotId, item.itemId]));
  for (const [slotId, itemId] of Object.entries(expectedBySlot)) {
    if (actualBySlot[slotId] !== itemId) {
      throw new Error(`${context} missing ${slotId} item ${itemId}: ${JSON.stringify(equipment)}`);
    }
  }
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      partition: `inventory-switch-input-${Date.now()}`
    }
  });

  try {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    await waitForReady(window);
    await setRuntimeCycle(window, 0);
    await clickSideTab(window, "inventory");
    await resetRuntimeTickOrigin(window);
    await delay(560);

    const switchSlots = [0, 1, 2];
    const initialInventory = await readRuntimeInventory(window);
    assertSameItemSet(
      "Initial press/release three-way switch",
      switchSlots.map((slotIndex) => initialInventory.slots[slotIndex]),
      [21006, 21791, 12002]
    );

    const dispatch = await pointerReleaseInventorySwitchWithoutClick(window, switchSlots);
    if (
      JSON.stringify(dispatch.clicked) !== JSON.stringify([0, 1, 2]) ||
      dispatch.dataset.lastInventoryActivation !== "default" ||
      dispatch.dataset.lastInventoryQueuedForTick !== "true" ||
      dispatch.dataset.lastInventoryAction !== "Wield" ||
      dispatch.dataset.lastInventorySlot !== "2"
    ) {
      throw new Error(`Press/release inventory switch did not queue all clicks without a browser click event: ${JSON.stringify(dispatch, null, 2)}`);
    }

    const postTickInventory = await waitForClickedSlotsToContain(window, switchSlots, [11785, 22109, 19547]);

    await clickSideTab(window, "equipment");
    const equipment = await readRuntimeEquipment(window);
    assertEquipmentContains("Press/release three-way switch", equipment, {
      weapon: 21006,
      cape: 21791,
      amulet: 12002
    });

    console.log(JSON.stringify({ ok: true, dispatch, postTickInventory: postTickInventory.slots.slice(0, 3), equipment }, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
