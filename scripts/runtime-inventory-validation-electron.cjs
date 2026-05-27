const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const verifyUserDataDir = process.env.NH_ELECTRON_VERIFY_USER_DATA_DIR;
if (verifyUserDataDir) {
  app.setPath("userData", verifyUserDataDir);
}

const [, , projectRoot, screenshotPath, targetUrl] = process.argv;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for one Nh game tick boundary (600ms) plus an offscreen Electron
 * render buffer. Hidden verifier windows can run timers later than the visible
 * app, so this is intentionally looser than the runtime tick itself.
 * In Nh, widget button click packets are decoded during the LOGIC phase
 * of the next tick — so equip mutations don't apply until the tick fires.
 */
function waitForGameTick() {
  return delay(1500);
}

async function readInventoryPendingEquip(window, slotIndex) {
  return window.webContents.executeJavaScript(`
    (() => {
      const slot = document.querySelector('.nhInventorySlot[data-slot-index="${slotIndex}"]');
      return {
        pendingEquip: slot?.getAttribute("data-pending-equip") ?? "",
        itemId: slot?.querySelector(".nhInventoryItemSprite")
          ? Number(slot.querySelector(".nhInventoryItemSprite").getAttribute("data-item-id"))
          : null
      };
    })()
  `);
}

function assertManualBaseSequence(actor, context) {
  if (
    !["idle", "wand_ready", "crossbow_ready", "gmaul_ready", "walk", "run"].includes(actor?.sequenceName) &&
    !actor?.sequenceName?.endsWith("_walk") &&
    !actor?.sequenceName?.endsWith("_run")
  ) {
    throw new Error(`${context} should not keep a replay attack animation as manual base movement: ${JSON.stringify(actor)}`);
  }
}

function assertEquipmentContains(context, equipment, expectedBySlot) {
  const actualBySlot = Object.fromEntries(equipment.items.map((item) => [item.slotId, item.itemId]));
  for (const [slotId, itemId] of Object.entries(expectedBySlot)) {
    if (actualBySlot[slotId] !== itemId) {
      throw new Error(`${context} should preserve ${slotId} item ${itemId}: ${JSON.stringify(equipment)}`);
    }
  }
}

function parseNumberList(value) {
  if (!value) {
    return [];
  }
  return value.split(",").filter(Boolean).map((entry) => Number.parseInt(entry, 10));
}

function assertActorAppearanceContains(context, actor, expectedItemIds) {
  const itemIds = new Set(actor?.appearanceItemIds ?? []);
  for (const itemId of expectedItemIds) {
    if (!itemIds.has(itemId)) {
      throw new Error(`${context} should keep item ${itemId} in the local player appearance: ${JSON.stringify(actor)}`);
    }
  }
  if ((actor?.appearanceEquipmentSlots ?? []).length !== 12) {
    throw new Error(`${context} should expose the 12-slot Nh appearance encoding after an equip mutation: ${JSON.stringify(actor)}`);
  }
}

function assertSingleLocalAppearanceModelSwap(context, swaps, expectedItemIds) {
  const localSwaps = swaps.filter((swap) => swap.actorId === "local-player");
  if (localSwaps.length !== 1) {
    throw new Error(`${context} should swap the rendered local-player model exactly once for the tick: ${JSON.stringify(localSwaps)}`);
  }
  const itemIds = new Set(localSwaps[0].appearanceItemIds ?? []);
  for (const itemId of expectedItemIds) {
    if (!itemIds.has(itemId)) {
      throw new Error(`${context} visual model swap missed final item ${itemId}: ${JSON.stringify(localSwaps[0])}`);
    }
  }
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

async function loadRuntimeWindow(window) {
  if (targetUrl) {
    await window.loadURL(targetUrl);
  } else {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
  }
  return waitForReady(window);
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

async function resetRuntimeTickOrigin(window) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.dispatchEvent(new CustomEvent("nh-runtime-reset-tick-origin"));
    })()
  `);
  await delay(50);
}

async function focusRuntimeSectionForCapture(window) {
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const section = document.querySelector('section[aria-labelledby="runtime-scene"]');
      if (!section) {
        return { ok: false, error: "missing runtime scene section" };
      }
      const shell = section.closest(".shell");
      if (shell) {
        for (const child of Array.from(shell.children)) {
          if (child !== section) {
            child.style.display = "none";
          }
        }
        shell.style.paddingTop = "24px";
        shell.style.paddingBottom = "24px";
      }
      section.style.marginTop = "0";
      section.style.paddingTop = "0";
      section.style.borderTop = "0";
      window.scrollTo(0, 0);
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(result.error);
  }
}

async function selectRuntimeReplay(window, replayId) {
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const select = document.querySelector("#runtime-replay");
      if (!select) {
        return { ok: false, error: "missing runtime replay selector" };
      }
      const option = Array.from(select.options).find((candidate) => candidate.value === ${JSON.stringify(replayId)});
      if (!option) {
        return {
          ok: false,
          error: "missing replay option",
          options: Array.from(select.options).map((candidate) => candidate.value)
        };
      }
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  await delay(150);
}

async function setManualControl(window, enabled) {
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) => {
        const text = candidate.textContent?.trim() ?? "";
        return text === "Manual on" || text === "Manual";
      });
      if (!button) {
        return { ok: false, error: "missing manual control button" };
      }
      const current = button.getAttribute("aria-pressed") === "true";
      if (current !== ${JSON.stringify(enabled)}) {
        button.click();
      }
      return { ok: true, current, requested: ${JSON.stringify(enabled)}, clicked: current !== ${JSON.stringify(enabled)} };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  await delay(150);
  return result;
}

async function clickManualStyle(window, label) {
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
      if (!button) {
        return { ok: false, error: "missing manual style button", label: ${JSON.stringify(label)} };
      }
      button.click();
      return { ok: true, label: ${JSON.stringify(label)} };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  await delay(150);
  return result;
}

async function readRuntimeInventory(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const slots = Array.from(document.querySelectorAll(".nhInventorySlot")).map((slot, index) => {
        const sprite = slot.querySelector(".nhInventoryItemSprite");
        const quantity = slot.querySelector(".nhInventoryQuantity");
        const quantityGlyphs = quantity ? Array.from(quantity.querySelectorAll(".nhWidgetGlyph")) : [];
        return {
          index,
          itemId: sprite ? Number(sprite.getAttribute("data-item-id")) : null,
          quantity: sprite ? Number(sprite.getAttribute("data-quantity")) : 0,
          selected: slot.getAttribute("data-selected") ?? "",
          label: sprite?.getAttribute("aria-label") ?? "",
          spriteVariant: sprite?.getAttribute("data-sprite-variant") ?? "",
          sourceBorder: sprite?.getAttribute("data-source-border") ?? "",
          sourceShadowColor: sprite?.getAttribute("data-source-shadow-color") ?? "",
          sourceQuantity: sprite?.getAttribute("data-source-quantity") ?? "",
          quantityVariant: sprite?.getAttribute("data-quantity-variant") ?? "",
          itemStackable: sprite?.getAttribute("data-item-stackable") ?? "",
          backgroundImage: sprite ? getComputedStyle(sprite).backgroundImage : "",
          quantityText: quantity?.textContent ?? "",
          quantityDataText: quantity?.getAttribute("data-quantity-text") ?? "",
          quantityDataColor: quantity?.getAttribute("data-quantity-color") ?? "",
          quantityColor: quantity ? getComputedStyle(quantity).color : "",
          quantityFontId: quantity ? Number(quantity.getAttribute("data-font-id")) : null,
          quantitySourceFontArchive: quantity?.getAttribute("data-source-font-archive") ?? "",
          quantitySourceGlyphAtlas: quantity?.getAttribute("data-source-glyph-atlas") ?? "",
          quantitySourceGlyphImage: quantity?.getAttribute("data-source-glyph-image") ?? "",
          quantitySourceBaselineY: quantity ? Number(quantity.getAttribute("data-source-baseline-y")) : null,
          quantitySourceShadowColor: quantity ? Number(quantity.getAttribute("data-source-shadow-color")) : null,
          quantityGlyphCount: quantity ? Number(quantity.getAttribute("data-glyph-count")) : 0,
          quantityGlyphDomCount: quantityGlyphs.length,
          quantityFirstGlyphMaskImage: quantityGlyphs[0] ? getComputedStyle(quantityGlyphs[0]).maskImage : ""
        };
      });
      const sprites = slots.filter((slot) => slot.itemId !== null);
      const grid = document.querySelector(".nhInventoryGrid");
      const gridStyle = grid ? getComputedStyle(grid) : null;
      const counts = {};
      for (const sprite of sprites) {
        counts[sprite.itemId] = (counts[sprite.itemId] ?? 0) + 1;
      }
      const cycleInput = document.querySelector("#runtime-cycle");
      return {
        cycle: cycleInput?.value ?? "",
        maxCycle: cycleInput?.getAttribute("max") ?? "",
        slots,
        sprites,
        grid: gridStyle
          ? {
              left: gridStyle.left,
              top: gridStyle.top,
              columnGap: gridStyle.columnGap,
              rowGap: gridStyle.rowGap,
              gridTemplateColumns: gridStyle.gridTemplateColumns,
              gridAutoRows: gridStyle.gridAutoRows
            }
          : null,
        counts
      };
    })()
  `);
}

async function readRuntimeActors(window) {
  return window.webContents.executeJavaScript(`
    (() => Array.from(document.querySelectorAll(".runtimeActorPose")).map((pose) => ({
      actorId: pose.getAttribute("data-actor-id") ?? "",
      loadoutId: pose.getAttribute("data-loadout-id") ?? "",
      sequenceName: pose.getAttribute("data-sequence-name") ?? "",
      appearanceSource: pose.getAttribute("data-appearance-source") ?? "",
      appearanceItemIds: (${parseNumberList.toString()})(pose.getAttribute("data-appearance-item-ids") ?? ""),
      appearanceEquipmentSlots: (${parseNumberList.toString()})(pose.getAttribute("data-appearance-equipment-slots") ?? ""),
      text: pose.textContent ?? ""
    })))()
  `);
}

async function resetActorModelSwapCapture(window) {
  await window.webContents.executeJavaScript(`
    (() => {
      const viewport = document.querySelector(".runtimeViewport");
      if (viewport) {
        viewport.dataset.captureLocalActorModelSwaps = "true";
        viewport.dataset.localActorModelSwapLog = "[]";
        viewport.dataset.localActorModelSwapCount = "0";
      }
      window.__nhRuntimeActorModelSwaps = [];
      if (window.__nhRuntimeActorModelSwapHandler) {
        window.removeEventListener("nh-runtime-actor-model-swap", window.__nhRuntimeActorModelSwapHandler);
      }
      window.__nhRuntimeActorModelSwapHandler = (event) => {
        window.__nhRuntimeActorModelSwaps.push(event.detail);
      };
      window.addEventListener("nh-runtime-actor-model-swap", window.__nhRuntimeActorModelSwapHandler);
    })()
  `);
}

async function readActorModelSwapCapture(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const viewport = document.querySelector(".runtimeViewport");
      let swaps = [];
      try {
        const parsed = JSON.parse(viewport?.dataset.localActorModelSwapLog ?? "[]");
        swaps = Array.isArray(parsed) ? parsed : [];
      } catch {
        swaps = [];
      }
      if (swaps.length === 0 && Array.isArray(window.__nhRuntimeActorModelSwaps)) {
        swaps = window.__nhRuntimeActorModelSwaps;
      }
      return swaps.map((swap) => ({
        actorId: swap.actorId ?? "",
        cycle: Number(swap.cycle),
        loadoutId: swap.loadoutId ?? "",
        previousModelKey: swap.previousModelKey ?? "",
        modelKey: swap.modelKey ?? "",
        appearanceItemIds: Array.isArray(swap.appearanceItemIds) ? swap.appearanceItemIds.map(Number) : [],
        appearanceEquipmentSlots: Array.isArray(swap.appearanceEquipmentSlots) ? swap.appearanceEquipmentSlots.map(Number) : [],
        timestampMs: Number(swap.timestampMs)
      }));
    })()
  `);
}

async function readRuntimeEquipment(window) {
  return window.webContents.executeJavaScript(`
    (() => ({
      items: Array.from(document.querySelectorAll(".nhEquipmentItemSprite")).map((item) => ({
        slotId: item.getAttribute("data-slot-id") ?? "",
        serverSlot: Number(item.getAttribute("data-server-slot")),
        childId: Number(item.getAttribute("data-child-id")),
        widgetId: Number(item.getAttribute("data-widget-id")),
        itemId: Number(item.getAttribute("data-item-id")),
        itemName: item.getAttribute("data-item-name") ?? "",
        usesItemAtlas: getComputedStyle(item).backgroundImage.includes("item_sprites.png")
      })),
      buttons: Array.from(document.querySelectorAll(".nhEquipmentItemButton")).map((button) => ({
        slotId: button.getAttribute("data-slot-id") ?? "",
        serverSlot: Number(button.getAttribute("data-server-slot")),
        itemId: Number(button.getAttribute("data-item-id")),
        itemName: button.getAttribute("data-item-name") ?? "",
        sourceServerHandler: button.getAttribute("data-source-server-handler") ?? ""
      }))
    }))()
  `);
}

async function readEquipmentPendingRemove(window, slotId) {
  return window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector(${JSON.stringify(`.nhEquipmentItemButton[data-slot-id="${slotId}"]`)});
      const sprite = document.querySelector(${JSON.stringify(`.nhEquipmentItemSprite[data-slot-id="${slotId}"]`)});
      return {
        pendingRemove: button?.getAttribute("data-pending-remove") ?? "false",
        itemId: button ? Number(button.getAttribute("data-item-id")) : null,
        spriteVariant: sprite?.getAttribute("data-sprite-variant") ?? ""
      };
    })()
  `);
}

async function readRuntimeCombatPanel(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const panel = document.querySelector(".nhCombatPanelLayer");
      return {
        weaponItemId: panel?.getAttribute("data-weapon-item-id") ?? "",
        weaponName: panel?.getAttribute("data-weapon-name") ?? "",
        weaponType: panel?.getAttribute("data-weapon-type") ?? "",
        weaponTypeConfig: panel?.getAttribute("data-weapon-type-config") ?? "",
        weaponTypeSource: panel?.getAttribute("data-weapon-type-source") ?? "",
        attackStyles: Array.from(document.querySelectorAll(".nhCombatStyleSlot")).map((slot) => ({
          attackStyle: slot.getAttribute("data-attack-style") ?? "",
          attackType: slot.getAttribute("data-attack-type") ?? "",
          selected: slot.getAttribute("data-selected") ?? "",
          weaponType: slot.getAttribute("data-weapon-type") ?? "",
          weaponTypeConfig: slot.getAttribute("data-weapon-type-config") ?? "",
          weaponTypeSource: slot.getAttribute("data-weapon-type-source") ?? ""
        }))
      };
    })()
  `);
}

async function setRuntimeInventory(window, inventory) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.dispatchEvent(new CustomEvent("nh-runtime-inventory", {
        detail: { inventory: ${JSON.stringify(inventory)} }
      }));
    })()
  `);
  await delay(150);
}

async function clickSideTab(window, tabId) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const tab = document.querySelector(${JSON.stringify(`.nhSideTabButton[data-tab-id="${tabId}"]`)});
      if (!tab) {
        return { ok: false, error: "missing side tab" };
      }
      const rect = tab.getBoundingClientRect();
      tab.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        buttons: 1,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function leftClickEquipmentItem(window, slotId) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const button = document.querySelector(${JSON.stringify(`.nhEquipmentItemButton[data-slot-id="${slotId}"]`)});
      if (!button) {
        return { ok: false, error: "missing equipment item button", slotId: ${JSON.stringify(slotId)} };
      }
      const rect = button.getBoundingClientRect();
      button.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        buttons: 1,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function clearRuntimeInventory(window) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.dispatchEvent(new CustomEvent("nh-runtime-inventory", {
        detail: { clear: true }
      }));
    })()
  `);
  await delay(150);
}

async function openInventoryContextMenu(window, slotIndex) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const slot = document.querySelector(${JSON.stringify(`.nhInventorySlot[data-slot-index="${slotIndex}"]`)});
      if (!slot) {
        return { ok: false, error: "missing inventory slot" };
      }
      const rect = slot.getBoundingClientRect();
      slot.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      }));

      let menu = document.querySelector(".nhContextMenu");
      const deadline = Date.now() + 1000;
      while (!menu && Date.now() < deadline) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        menu = document.querySelector(".nhContextMenu");
      }
      if (!menu) {
        return { ok: false, error: "inventory context menu did not open" };
      }
      return {
        ok: true,
        title: menu.querySelector(".nhContextMenuTitle")?.textContent ?? "",
        options: Array.from(menu.querySelectorAll(".nhContextMenuOption")).map((option) => ({
          text: option.textContent ?? "",
          action: option.getAttribute("data-menu-action") ?? "",
          actionKind: option.getAttribute("data-menu-action-kind") ?? "",
          opcode: Number(option.getAttribute("data-menu-opcode")),
          identifier: Number(option.getAttribute("data-menu-identifier")),
          argument1: Number(option.getAttribute("data-menu-argument1")),
          argument2: Number(option.getAttribute("data-menu-argument2"))
        }))
      };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function clickTopContextMenuOption(window) {
  return clickContextMenuOption(window, 0);
}

async function clickContextMenuOption(window, optionIndex) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const option = Array.from(document.querySelectorAll(".nhContextMenuOption"))[${JSON.stringify(optionIndex)}];
      if (!option) {
        return { ok: false, error: "missing context menu option" };
      }
      option.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function leftClickInventorySlot(window, slotIndex) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const slot = document.querySelector(${JSON.stringify(`.nhInventorySlot[data-slot-index="${slotIndex}"]`)});
      if (!slot) {
        return { ok: false, error: "missing inventory slot" };
      }
      const rect = slot.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;
      const target = document.elementFromPoint(clientX, clientY);
      if (!target || target.closest(${JSON.stringify(`.nhInventorySlot[data-slot-index="${slotIndex}"]`)}) !== slot) {
        const grid = slot.closest(".nhInventoryGrid");
        const viewport = slot.closest(".runtimeViewport");
        return {
          ok: false,
          error: "inventory slot is not the real pointer target",
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          clientX,
          clientY,
          slotRect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            right: rect.right,
            bottom: rect.bottom
          },
          gridRect: grid
            ? (() => {
                const gridRect = grid.getBoundingClientRect();
                return {
                  left: gridRect.left,
                  top: gridRect.top,
                  width: gridRect.width,
                  height: gridRect.height,
                  right: gridRect.right,
                  bottom: gridRect.bottom
                };
              })()
            : null,
          viewportRect: viewport
            ? (() => {
                const viewportRect = viewport.getBoundingClientRect();
                return {
                  left: viewportRect.left,
                  top: viewportRect.top,
                  width: viewportRect.width,
                  height: viewportRect.height,
                  right: viewportRect.right,
                  bottom: viewportRect.bottom
                };
              })()
            : null,
          targetClassName: target?.className?.toString?.() ?? "",
          targetTagName: target?.tagName ?? "",
          slotPointerEvents: getComputedStyle(slot).pointerEvents,
          gridPointerEvents: grid ? getComputedStyle(grid).pointerEvents : ""
        };
      }
      target.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        buttons: 1,
        clientX,
        clientY
      }));
      target.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        buttons: 0,
        clientX,
        clientY
      }));
      slot.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: 0,
        clientX,
        clientY
      }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function leftClickInventorySlotsSameFrame(window, slotIndices) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
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
        const pointerId = slotIndex + 1;
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
        target.dispatchEvent(new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 0,
          clientX,
          clientY
        }));
        slot.dispatchEvent(new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          buttons: 0,
          clientX,
          clientY
        }));
        clicked.push(slotIndex);
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, clicked, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function readRuntimeViewportDataset(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const viewport = document.querySelector(".runtimeViewport");
      return { ...viewport?.dataset };
    })()
  `);
}

async function dragInventorySlot(window, sourceSlotIndex, destinationSlotIndex) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const source = document.querySelector('.nhInventorySlot[data-slot-index="' + ${JSON.stringify(sourceSlotIndex)} + '"]');
      const destination = document.querySelector('.nhInventorySlot[data-slot-index="' + ${JSON.stringify(destinationSlotIndex)} + '"]');
      if (!source || !destination) {
        return { ok: false, error: "missing drag slot", source: Boolean(source), destination: Boolean(destination) };
      }
      const sourceRect = source.getBoundingClientRect();
      const destinationRect = destination.getBoundingClientRect();
      const panel = source.closest(".runeliteClientPanel");
      const panelRect = panel?.getBoundingClientRect();
      const sourceWidth = Number.parseFloat(panel?.getAttribute("data-source-width") ?? "") || panel?.offsetWidth || panelRect?.width || 1;
      const sourceHeight = Number.parseFloat(panel?.getAttribute("data-source-height") ?? "") || panel?.offsetHeight || panelRect?.height || 1;
      const scaleX = panelRect && panelRect.width > 0 ? panelRect.width / sourceWidth : 1;
      const scaleY = panelRect && panelRect.height > 0 ? panelRect.height / sourceHeight : 1;
      const spriteBefore = source.querySelector(".nhInventoryItemSprite")?.getBoundingClientRect();
      const startX = sourceRect.left + sourceRect.width / 2;
      const startY = sourceRect.top + sourceRect.height / 2;
      const endX = destinationRect.left + destinationRect.width / 2;
      const endY = destinationRect.top + destinationRect.height / 2;
      const pointerId = 1;
      source.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId,
        pointerType: "mouse",
        button: 0,
        buttons: 1,
        clientX: startX,
        clientY: startY
      }));
      await new Promise((resolve) => setTimeout(resolve, 130));
      const pointerMoveInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId,
        pointerType: "mouse",
        button: 0,
        buttons: 1,
        clientX: endX,
        clientY: endY
      };
      source.dispatchEvent(new PointerEvent("pointermove", pointerMoveInit));
      window.dispatchEvent(new PointerEvent("pointermove", pointerMoveInit));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const spriteDuring = source.querySelector(".nhInventoryItemSprite")?.getBoundingClientRect();
      const rawDeltaX = endX - startX;
      const rawDeltaY = endY - startY;
      const dragVisual = {
        scaleX,
        scaleY,
        rawDeltaX,
        rawDeltaY,
        sourceOffsetX: Number.parseFloat(source.getAttribute("data-drag-offset-x") || "0"),
        sourceOffsetY: Number.parseFloat(source.getAttribute("data-drag-offset-y") || "0"),
        expectedSourceOffsetX: rawDeltaX / Math.max(0.0001, scaleX),
        expectedSourceOffsetY: rawDeltaY / Math.max(0.0001, scaleY),
        visualDeltaX: spriteBefore && spriteDuring ? spriteDuring.left - spriteBefore.left : 0,
        visualDeltaY: spriteBefore && spriteDuring ? spriteDuring.top - spriteBefore.top : 0
      };
      source.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId,
        pointerType: "mouse",
        button: 0,
        buttons: 0,
        clientX: endX,
        clientY: endY
      }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset }, dragVisual };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return { ...result.dataset, dragVisual: result.dragVisual };
}

async function leftClickRuntimeCanvas(window) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const canvas = document.querySelector('canvas[aria-label="Two actor runtime arena scene"]');
      if (!canvas) {
        return { ok: false, error: "missing runtime canvas" };
      }
      const rect = canvas.getBoundingClientRect();
      const points = [
        [0.18, 0.72],
        [0.35, 0.72],
        [0.65, 0.72],
        [0.22, 0.58],
        [0.78, 0.58],
        [0.5, 0.5]
      ];
      let dataset = {};
      for (const [xRatio, yRatio] of points) {
        const clientX = rect.left + rect.width * xRatio;
        const clientY = rect.top + rect.height * yRatio;
        canvas.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId: 1,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
          clientX,
          clientY
        }));
        canvas.dispatchEvent(new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId: 1,
          pointerType: "mouse",
          button: 0,
          buttons: 0,
          clientX,
          clientY
        }));
        canvas.dispatchEvent(new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          buttons: 0,
          clientX,
          clientY
        }));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const viewport = document.querySelector(".runtimeViewport");
        dataset = { ...viewport?.dataset, attemptedCanvasClickRatio: xRatio + "," + yRatio };
        if (dataset.lastInventorySelectionClear || dataset.lastSelectedTargetModeCancel) {
          return { ok: true, dataset };
        }
      }
      return { ok: true, dataset };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function readRuntimeClickCross(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const cross = document.querySelector(".nhClickCross");
      if (!cross) {
        return null;
      }
      const style = getComputedStyle(cross);
      const numeric = (name) => cross.hasAttribute(name) ? Number(cross.getAttribute(name)) : null;
      return {
        color: cross.getAttribute("data-color") ?? "",
        frame: Number(cross.getAttribute("data-frame")),
        sourceState: cross.getAttribute("data-source-state") ?? "",
        sourceSpriteId: numeric("data-source-sprite-id"),
        sourceMouseCrossColor: numeric("data-source-mouse-cross-color"),
        sourceFrame: numeric("data-source-frame"),
        sourceDrawOffset: numeric("data-source-draw-offset"),
        sourceSpriteWidth: numeric("data-source-sprite-width"),
        sourceSpriteHeight: numeric("data-source-sprite-height"),
        sourceSpriteOffsetX: numeric("data-source-sprite-offset-x"),
        sourceSpriteOffsetY: numeric("data-source-sprite-offset-y"),
        left: Number.parseFloat(style.left),
        top: Number.parseFloat(style.top),
        width: Number.parseInt(style.width, 10),
        height: Number.parseInt(style.height, 10),
        backgroundImage: style.backgroundImage,
        backgroundPosition: style.backgroundPosition,
        backgroundSize: style.backgroundSize
      };
    })()
  `);
}

function countItem(inventory, itemId) {
  return inventory.counts[String(itemId)] ?? inventory.counts[itemId] ?? 0;
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
    const runtimeReadyMessage = await loadRuntimeWindow(window);
    await selectRuntimeReplay(window, "two-actor-barrage-into-range-v1");
    await setRuntimeCycle(window, 0);
    await focusRuntimeSectionForCapture(window);
    const initialInventory = await readRuntimeInventory(window);
    const maxCycle = Number.parseInt(initialInventory.maxCycle, 10);
    if (!Number.isInteger(maxCycle) || maxCycle < 1) {
      throw new Error(`Invalid runtime cycle max: ${JSON.stringify(initialInventory)}`);
    }
    if (initialInventory.sprites.length !== 26) {
      throw new Error(`Initial inventory did not render the 26-item NH switch setup: ${JSON.stringify(initialInventory)}`);
    }
    const expectedInitialSwitchSlots = [
      { index: 0, itemId: 21006, label: "Inventory slot 1: Kodai wand" },
      { index: 1, itemId: 21791, label: "Inventory slot 2: Imbued saradomin cape" },
      { index: 2, itemId: 12002, label: "Inventory slot 3: Occult necklace" },
      { index: 3, itemId: 4712, label: "Inventory slot 4: Ahrim's robetop" },
      { index: 4, itemId: 4714, label: "Inventory slot 5: Ahrim's robeskirt" },
      { index: 5, itemId: 12006, label: "Inventory slot 6: Abyssal tentacle" },
      { index: 6, itemId: 12954, label: "Inventory slot 7: Dragon defender" },
      { index: 7, itemId: 6570, label: "Inventory slot 8: Fire cape" },
      { index: 8, itemId: 19553, label: "Inventory slot 9: Amulet of torture" },
      { index: 9, itemId: 11832, label: "Inventory slot 10: Bandos chestplate" },
      { index: 10, itemId: 11834, label: "Inventory slot 11: Bandos tassets" },
      { index: 11, itemId: 4153, label: "Inventory slot 12: Granite maul" }
    ];
    for (const expected of expectedInitialSwitchSlots) {
      const slot = initialInventory.slots[expected.index];
      if (slot.itemId !== expected.itemId || slot.label !== expected.label) {
        throw new Error(`Initial inventory should expose mage and melee switch gear while Armadyl is worn: ${JSON.stringify({ expected, slot, initialInventory })}`);
      }
    }
    if (!initialInventory.sprites.every((sprite) => sprite.backgroundImage.includes("item_sprites.png"))) {
      throw new Error(`Initial inventory sprites did not use item_sprites atlas: ${JSON.stringify(initialInventory)}`);
    }
    if (
      initialInventory.grid?.left !== "563px" ||
      initialInventory.grid?.top !== "213px" ||
      initialInventory.grid?.columnGap !== "6px" ||
      initialInventory.grid?.rowGap !== "4px" ||
      !initialInventory.grid?.gridTemplateColumns.includes("36px")
    ) {
      throw new Error(`Inventory grid did not use the fixed source-backed 149 layout: ${JSON.stringify(initialInventory.grid)}`);
    }
    await clickSideTab(window, "equipment");
    const initialEquipment = await readRuntimeEquipment(window);
    assertEquipmentContains("Initial Armadyl range setup", initialEquipment, {
      head: 12929,
      cape: 22109,
      amulet: 19547,
      weapon: 11785,
      body: 11828,
      shield: 6889,
      legs: 11830,
      hands: 7462,
      feet: 11840,
      ring: 19710,
      ammo: 21948
    });
    await clickSideTab(window, "inventory");
    await setRuntimeCycle(window, 1);
    const carriedInventory = await readRuntimeInventory(window);
    if (
      carriedInventory.slots[0].itemId !== 21006 ||
      carriedInventory.slots[1].itemId !== 21791 ||
      carriedInventory.slots[2].itemId !== 12002 ||
      carriedInventory.slots[3].itemId !== 4712 ||
      carriedInventory.slots[4].itemId !== 4714
    ) {
      throw new Error(`Client-view replay ticks without container updates should carry the NH switch inventory forward: ${JSON.stringify(carriedInventory.slots.slice(0, 6))}`);
    }
    await setRuntimeCycle(window, 0);

    await resetRuntimeTickOrigin(window);
    await resetActorModelSwapCapture(window);
    const mageSwitchDispatch = await leftClickInventorySlotsSameFrame(window, [0, 1, 2, 3, 4]);
    if (
      JSON.stringify(mageSwitchDispatch.clicked) !== JSON.stringify([0, 1, 2, 3, 4]) ||
      mageSwitchDispatch.dataset.lastInventoryActivation !== "default" ||
      mageSwitchDispatch.dataset.lastInventoryAction !== "Wear" ||
      mageSwitchDispatch.dataset.lastInventoryItemId !== "4714" ||
      mageSwitchDispatch.dataset.lastInventorySlot !== "4"
    ) {
      throw new Error(`Full mage switch did not queue all five clicked gear pieces in packet order: ${JSON.stringify(mageSwitchDispatch)}`);
    }
    await waitForGameTick();
    const mageSwitchVisualSwaps = await readActorModelSwapCapture(window);
    assertSingleLocalAppearanceModelSwap(
      "Full mage switch",
      mageSwitchVisualSwaps,
      [12929, 21791, 12002, 21006, 4712, 6889, 4714, 7462, 11840, 19710, 21948]
    );
    const mageSwitchInventory = await readRuntimeInventory(window);
    const expectedMageSwappedSlots = [
      { index: 0, itemId: 11785, label: "Inventory slot 1: Armadyl crossbow" },
      { index: 1, itemId: 22109, label: "Inventory slot 2: Ava's assembler" },
      { index: 2, itemId: 19547, label: "Inventory slot 3: Necklace of anguish" },
      { index: 3, itemId: 11828, label: "Inventory slot 4: Armadyl chestplate" },
      { index: 4, itemId: 11830, label: "Inventory slot 5: Armadyl chainskirt" }
    ];
    for (const expected of expectedMageSwappedSlots) {
      const slot = mageSwitchInventory.slots[expected.index];
      if (slot.itemId !== expected.itemId || slot.label !== expected.label) {
        throw new Error(`Full mage switch should swap old Armadyl gear into inventory slot ${expected.index}: ${JSON.stringify({ expected, slot, mageSwitchInventory })}`);
      }
    }
    if (countItem(mageSwitchInventory, 21006) !== 0 || countItem(mageSwitchInventory, 4712) !== 0 || countItem(mageSwitchInventory, 4714) !== 0) {
      throw new Error(`Full mage switch should not leave clicked mage gear duplicated in inventory: ${JSON.stringify(mageSwitchInventory.counts)}`);
    }
    if (countItem(mageSwitchInventory, 11785) !== 1 || countItem(mageSwitchInventory, 11828) !== 1 || countItem(mageSwitchInventory, 11830) !== 1) {
      throw new Error(`Full mage switch should leave exactly one Armadyl range switch in inventory: ${JSON.stringify(mageSwitchInventory.counts)}`);
    }
    await clickSideTab(window, "equipment");
    const mageSwitchEquipment = await readRuntimeEquipment(window);
    assertEquipmentContains("Full mage switch", mageSwitchEquipment, {
      head: 12929,
      cape: 21791,
      amulet: 12002,
      weapon: 21006,
      body: 4712,
      shield: 6889,
      legs: 4714,
      hands: 7462,
      feet: 11840,
      ring: 19710,
      ammo: 21948
    });
    const mageSwitchActors = await readRuntimeActors(window);
    assertActorAppearanceContains(
      "Full mage switch",
      mageSwitchActors.find((actor) => actor.actorId === "local-player"),
      [12929, 21791, 12002, 21006, 4712, 6889, 4714, 7462, 11840, 19710, 21948]
    );
    await clickSideTab(window, "inventory");
    await resetRuntimeTickOrigin(window);
    await resetActorModelSwapCapture(window);
    const meleeSwitchDispatch = await leftClickInventorySlotsSameFrame(window, [5, 6, 7, 8, 9, 10]);
    if (
      JSON.stringify(meleeSwitchDispatch.clicked) !== JSON.stringify([5, 6, 7, 8, 9, 10]) ||
      meleeSwitchDispatch.dataset.lastInventoryActivation !== "default" ||
      meleeSwitchDispatch.dataset.lastInventoryAction !== "Wear" ||
      meleeSwitchDispatch.dataset.lastInventoryItemId !== "11834" ||
      meleeSwitchDispatch.dataset.lastInventorySlot !== "10"
    ) {
      throw new Error(`Full melee switch did not queue all six clicked gear pieces in packet order: ${JSON.stringify(meleeSwitchDispatch)}`);
    }
    await waitForGameTick();
    const meleeSwitchVisualSwaps = await readActorModelSwapCapture(window);
    assertSingleLocalAppearanceModelSwap(
      "Full melee switch",
      meleeSwitchVisualSwaps,
      [12929, 6570, 19553, 12006, 11832, 12954, 11834, 7462, 11840, 19710, 21948]
    );
    const meleeSwitchInventory = await readRuntimeInventory(window);
    const expectedMeleeSwappedSlots = [
      { index: 5, itemId: 21006, label: "Inventory slot 6: Kodai wand" },
      { index: 6, itemId: 6889, label: "Inventory slot 7: Mage's book" },
      { index: 7, itemId: 21791, label: "Inventory slot 8: Imbued saradomin cape" },
      { index: 8, itemId: 12002, label: "Inventory slot 9: Occult necklace" },
      { index: 9, itemId: 4712, label: "Inventory slot 10: Ahrim's robetop" },
      { index: 10, itemId: 4714, label: "Inventory slot 11: Ahrim's robeskirt" }
    ];
    for (const expected of expectedMeleeSwappedSlots) {
      const slot = meleeSwitchInventory.slots[expected.index];
      if (slot.itemId !== expected.itemId || slot.label !== expected.label) {
        throw new Error(`Full melee switch should swap old mage gear into inventory slot ${expected.index}: ${JSON.stringify({ expected, slot, meleeSwitchInventory })}`);
      }
    }
    if (countItem(meleeSwitchInventory, 12006) !== 0 || countItem(meleeSwitchInventory, 11832) !== 0 || countItem(meleeSwitchInventory, 11834) !== 0) {
      throw new Error(`Full melee switch should not leave clicked melee gear duplicated in inventory: ${JSON.stringify(meleeSwitchInventory.counts)}`);
    }
    await clickSideTab(window, "equipment");
    const meleeSwitchEquipment = await readRuntimeEquipment(window);
    assertEquipmentContains("Full melee switch", meleeSwitchEquipment, {
      head: 12929,
      cape: 6570,
      amulet: 19553,
      weapon: 12006,
      body: 11832,
      shield: 12954,
      legs: 11834,
      hands: 7462,
      feet: 11840,
      ring: 19710,
      ammo: 21948
    });
    const meleeSwitchActors = await readRuntimeActors(window);
    assertActorAppearanceContains(
      "Full melee switch",
      meleeSwitchActors.find((actor) => actor.actorId === "local-player"),
      [12929, 6570, 19553, 12006, 11832, 12954, 11834, 7462, 11840, 19710, 21948]
    );

    await loadRuntimeWindow(window);
    await selectRuntimeReplay(window, "two-actor-barrage-into-range-v1");
    await setRuntimeCycle(window, 0);
    await focusRuntimeSectionForCapture(window);
    await clickManualStyle(window, "Mage");
    await clickSideTab(window, "inventory");
    await setRuntimeInventory(window, [
      { itemId: 11785, quantity: 1 },
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
    ]);

    await resetRuntimeTickOrigin(window);
    await resetActorModelSwapCapture(window);
    const multiEquipDispatch = await leftClickInventorySlotsSameFrame(window, [4, 5]);
    if (
      JSON.stringify(multiEquipDispatch.clicked) !== JSON.stringify([4, 5]) ||
      multiEquipDispatch.dataset.lastInventoryActivation !== "default" ||
      multiEquipDispatch.dataset.lastInventoryAction !== "Wear" ||
      multiEquipDispatch.dataset.lastInventoryItemId !== "11834" ||
      multiEquipDispatch.dataset.lastInventorySlot !== "5"
    ) {
      throw new Error(`Fast Bandos body/legs switch did not dispatch both inventory clicks in one frame: ${JSON.stringify(multiEquipDispatch)}`);
    }
    const multiBodyPending = await readInventoryPendingEquip(window, 4);
    const multiLegsPending = await readInventoryPendingEquip(window, 5);
    if (multiBodyPending.pendingEquip !== "true" || multiLegsPending.pendingEquip !== "true") {
      throw new Error(`Fast Bandos body/legs switch should keep both slots pending before the tick: ${JSON.stringify({ multiBodyPending, multiLegsPending })}`);
    }
    const multiPreTickInventory = await readRuntimeInventory(window);
    if (multiPreTickInventory.slots[4].itemId !== 11832 || multiPreTickInventory.slots[5].itemId !== 11834) {
      throw new Error(`Fast Bandos body/legs switch should not mutate either slot before the tick: ${JSON.stringify([multiPreTickInventory.slots[4], multiPreTickInventory.slots[5]])}`);
    }
    await waitForGameTick();
    const multiVisualSwaps = await readActorModelSwapCapture(window);
    assertSingleLocalAppearanceModelSwap(
      "Fast Bandos body/legs switch",
      multiVisualSwaps,
      [12929, 21791, 12002, 21006, 11832, 6889, 11834, 7462, 11840, 19710, 21948]
    );
    const multiPostTickDispatch = await window.webContents.executeJavaScript(`
      (() => {
        const viewport = document.querySelector(".runtimeViewport");
        return { ...viewport?.dataset };
      })()
    `);
    const multiPostTickInventory = await readRuntimeInventory(window);
    if (multiPostTickInventory.slots[4].itemId !== 4712 || multiPostTickInventory.slots[5].itemId !== 4714) {
      throw new Error(`Fast Bandos body/legs switch should process both queued Wears on the same tick in packet order: ${JSON.stringify({ slots: [multiPostTickInventory.slots[4], multiPostTickInventory.slots[5]], dataset: multiPostTickDispatch })}`);
    }
    await clickSideTab(window, "equipment");
    const multiPostTickEquipment = await readRuntimeEquipment(window);
    const multiPostTickBody = multiPostTickEquipment.items.find((item) => item.slotId === "body");
    const multiPostTickLegs = multiPostTickEquipment.items.find((item) => item.slotId === "legs");
    if (multiPostTickBody?.itemId !== 11832 || multiPostTickLegs?.itemId !== 11834) {
      throw new Error(`Fast Bandos body/legs switch should equip both items on one tick: ${JSON.stringify(multiPostTickEquipment)}`);
    }
    assertEquipmentContains("Fast Bandos body/legs switch", multiPostTickEquipment, {
      head: 12929,
      cape: 21791,
      amulet: 12002,
      weapon: 21006,
      body: 11832,
      shield: 6889,
      legs: 11834,
      hands: 7462,
      feet: 11840,
      ring: 19710,
      ammo: 21948
    });
    const multiPostTickActors = await readRuntimeActors(window);
    assertActorAppearanceContains(
      "Fast Bandos body/legs switch",
      multiPostTickActors.find((actor) => actor.actorId === "local-player"),
      [12929, 21791, 12002, 21006, 11832, 6889, 11834, 7462, 11840, 19710, 21948]
    );
    await clickSideTab(window, "inventory");
    const inventoryMenu = await openInventoryContextMenu(window, 0);
    const expectedInventoryMenuOptions = [
      { text: "Wield Armadyl crossbow", action: "Wield", actionKind: "inventory-action", opcode: 34, identifier: 11785, argument1: 0, argument2: 9764864 },
      { text: "Use Armadyl crossbow", action: "Use", actionKind: "inventory-use", opcode: 38, identifier: 11785, argument1: 0, argument2: 9764864 },
      { text: "Drop Armadyl crossbow", action: "Drop", actionKind: "inventory-action", opcode: 37, identifier: 11785, argument1: 0, argument2: 9764864 },
      { text: "Examine Armadyl crossbow", action: "Examine", actionKind: "inventory-examine", opcode: 1005, identifier: 11785, argument1: 0, argument2: 9764864 }
    ];
    if (inventoryMenu.title !== "Choose Option") {
      throw new Error(`Unexpected inventory context menu title: ${JSON.stringify(inventoryMenu)}`);
    }
    if (JSON.stringify(inventoryMenu.options) !== JSON.stringify(expectedInventoryMenuOptions)) {
      throw new Error(`Inventory context menu did not match cache item actions: ${JSON.stringify(inventoryMenu)}`);
    }
    await resetRuntimeTickOrigin(window);
    const menuDispatch = await clickTopContextMenuOption(window);
    if (
      menuDispatch.lastInventoryActivation !== "context-menu" ||
      menuDispatch.lastInventoryAction !== "Wield" ||
      menuDispatch.lastInventoryActionKind !== "inventory-action" ||
      menuDispatch.lastInventoryOpcode !== "34" ||
      menuDispatch.lastInventoryIdentifier !== "11785" ||
      menuDispatch.lastInventoryArgument1 !== "0" ||
      menuDispatch.lastInventoryArgument2 !== "9764864" ||
      menuDispatch.lastInventoryActionIndex !== "1" ||
      menuDispatch.lastInventoryItemId !== "11785" ||
      menuDispatch.lastInventorySlot !== "0" ||
      menuDispatch.lastInventoryWidgetId !== "9764864" ||
      menuDispatch.lastInventoryMutation !== "equipment-swap" ||
      menuDispatch.lastInventoryMutationNextItemId !== "21006" ||
      menuDispatch.lastInventoryActorLoadoutId !== "acb-hides" ||
      menuDispatch.lastInventoryEquipmentEquipSlot !== "3" ||
      menuDispatch.lastInventoryEquipmentEquippedItemId !== "11785" ||
      menuDispatch.lastInventoryEquipmentPreviousItemId !== "21006" ||
      menuDispatch.lastInventoryEquipmentServerHandler !== "Equipment.equip"
    ) {
      throw new Error(`Inventory context menu click did not dispatch the top source action: ${JSON.stringify(menuDispatch)}`);
    }
    /* Verify the equip is queued but NOT applied yet (tick-deferred) */
    const menuPendingEquip = await readInventoryPendingEquip(window, 0);
    if (menuPendingEquip.pendingEquip !== "true") {
      throw new Error(`Inventory context menu Wield should set data-pending-equip on the clicked slot: ${JSON.stringify(menuPendingEquip)}`);
    }
    const menuPreTickInventory = await readRuntimeInventory(window);
    if (menuPreTickInventory.slots[0].itemId !== 11785) {
      throw new Error(`Inventory context menu Wield should NOT mutate inventory before game tick: ${JSON.stringify(menuPreTickInventory.slots[0])}`);
    }
    const menuPreTickActors = await readRuntimeActors(window);
    const menuPreTickLocalActor = menuPreTickActors.find((actor) => actor.actorId === "local-player");
    if (menuPreTickLocalActor?.loadoutId === "acb-hides") {
      throw new Error(`Inventory context menu Wield should NOT switch actor loadout before game tick: ${JSON.stringify(menuPreTickActors)}`);
    }

    /* Wait for game tick boundary — equip resolves here */
    await waitForGameTick();

    const menuMutatedInventory = await readRuntimeInventory(window);
    if (menuMutatedInventory.slots[0].itemId !== 21006 || menuMutatedInventory.slots[0].label !== "Inventory slot 1: Kodai wand") {
      throw new Error(`Inventory context menu Wield did not swap the worn weapon back into slot 0 after tick: ${JSON.stringify(menuMutatedInventory.slots[0])}`);
    }
    const menuPostTickPendingEquip = await readInventoryPendingEquip(window, 0);
    if (menuPostTickPendingEquip.pendingEquip !== "false") {
      throw new Error(`Inventory context menu Wield should clear data-pending-equip after tick: ${JSON.stringify(menuPostTickPendingEquip)}`);
    }
    const menuMutatedActors = await readRuntimeActors(window);
    const menuMutatedLocalActor = menuMutatedActors.find((actor) => actor.actorId === "local-player");
    if (menuMutatedLocalActor?.loadoutId !== "acb-hides") {
      throw new Error(`Inventory context menu Wield did not switch the local actor to the equipped ACB loadout after tick: ${JSON.stringify(menuMutatedActors)}`);
    }
    assertManualBaseSequence(menuMutatedLocalActor, "Inventory context menu Wield");
    await clickSideTab(window, "equipment");
    const menuMutatedEquipment = await readRuntimeEquipment(window);
    const menuMutatedWeapon = menuMutatedEquipment.items.find((item) => item.slotId === "weapon");
    if (
      menuMutatedWeapon?.itemId !== 11785 ||
      menuMutatedWeapon?.itemName !== "Armadyl crossbow" ||
      !menuMutatedWeapon?.usesItemAtlas
    ) {
      throw new Error(`Inventory Wield did not update the source-backed equipment weapon slot after tick: ${JSON.stringify(menuMutatedEquipment)}`);
    }
    assertEquipmentContains("Inventory context menu ACB Wield", menuMutatedEquipment, {
      head: 12929,
      cape: 21791,
      amulet: 12002,
      weapon: 11785,
      body: 11832,
      shield: 6889,
      legs: 11834,
      hands: 7462,
      feet: 11840,
      ring: 19710,
      ammo: 21948
    });
    assertActorAppearanceContains(
      "Inventory context menu ACB Wield",
      menuMutatedLocalActor,
      [12929, 21791, 12002, 11785, 11832, 6889, 11834, 7462, 11840, 19710, 21948]
    );
    await clickSideTab(window, "combat");
    const menuMutatedCombat = await readRuntimeCombatPanel(window);
    if (
      menuMutatedCombat.weaponItemId !== "11785" ||
      menuMutatedCombat.weaponType !== "ARMADYL_CROSSBOW" ||
      menuMutatedCombat.weaponTypeConfig !== "5" ||
      !menuMutatedCombat.attackStyles.every((slot) => slot.weaponType === "ARMADYL_CROSSBOW")
    ) {
      throw new Error(`Inventory Wield did not update combat-tab weapon config to ACB after tick: ${JSON.stringify(menuMutatedCombat)}`);
    }
    await clickSideTab(window, "inventory");
    await resetRuntimeTickOrigin(window);
    const defaultDispatch = await leftClickInventorySlot(window, 0);
    if (
      defaultDispatch.lastInventoryActivation !== "default" ||
      defaultDispatch.lastInventoryAction !== "Wield" ||
      defaultDispatch.lastInventoryActionKind !== "inventory-action" ||
      defaultDispatch.lastInventoryOpcode !== "34" ||
      defaultDispatch.lastInventoryIdentifier !== "21006" ||
      defaultDispatch.lastInventoryArgument1 !== "0" ||
      defaultDispatch.lastInventoryArgument2 !== "9764864" ||
      defaultDispatch.lastInventoryActionIndex !== "1" ||
      defaultDispatch.lastInventoryItemId !== "21006" ||
      defaultDispatch.lastInventorySlot !== "0" ||
      defaultDispatch.lastInventoryWidgetId !== "9764864" ||
      defaultDispatch.lastInventoryMutation !== "equipment-swap" ||
      defaultDispatch.lastInventoryMutationNextItemId !== "11785" ||
      defaultDispatch.lastInventoryActorLoadoutId !== "kodai-robes" ||
      defaultDispatch.lastInventoryEquipmentEquipSlot !== "3" ||
      defaultDispatch.lastInventoryEquipmentEquippedItemId !== "21006" ||
      defaultDispatch.lastInventoryEquipmentPreviousItemId !== "11785" ||
      defaultDispatch.lastInventoryEquipmentServerHandler !== "Equipment.equip"
    ) {
      throw new Error(`Inventory left-click did not dispatch the source default action: ${JSON.stringify(defaultDispatch)}`);
    }
    /* Verify default click equip is queued but NOT applied yet */
    const defaultPendingEquip = await readInventoryPendingEquip(window, 0);
    if (defaultPendingEquip.pendingEquip !== "true") {
      throw new Error(`Inventory left-click Wield should set data-pending-equip: ${JSON.stringify(defaultPendingEquip)}`);
    }
    const defaultPreTickInventory = await readRuntimeInventory(window);
    if (defaultPreTickInventory.slots[0].itemId !== 21006) {
      throw new Error(`Inventory left-click Wield should NOT mutate inventory before game tick: ${JSON.stringify(defaultPreTickInventory.slots[0])}`);
    }

    /* Wait for game tick boundary */
    await waitForGameTick();

    const defaultMutatedInventory = await readRuntimeInventory(window);
    if (defaultMutatedInventory.slots[0].itemId !== 11785 || defaultMutatedInventory.slots[0].label !== "Inventory slot 1: Armadyl crossbow") {
      throw new Error(`Inventory left-click Wield did not swap the worn weapon back into slot 0 after tick: ${JSON.stringify(defaultMutatedInventory.slots[0])}`);
    }
    const defaultMutatedActors = await readRuntimeActors(window);
    const defaultMutatedLocalActor = defaultMutatedActors.find((actor) => actor.actorId === "local-player");
    if (defaultMutatedLocalActor?.loadoutId !== "kodai-robes") {
      throw new Error(`Inventory left-click Wield did not switch the local actor back to the equipped Kodai loadout after tick: ${JSON.stringify(defaultMutatedActors)}`);
    }
    assertManualBaseSequence(defaultMutatedLocalActor, "Inventory left-click Wield");
    await clickSideTab(window, "equipment");
    const defaultMutatedEquipment = await readRuntimeEquipment(window);
    const defaultMutatedWeapon = defaultMutatedEquipment.items.find((item) => item.slotId === "weapon");
    if (
      defaultMutatedWeapon?.itemId !== 21006 ||
      defaultMutatedWeapon?.itemName !== "Kodai wand" ||
      !defaultMutatedWeapon?.usesItemAtlas
    ) {
      throw new Error(`Inventory Wield did not restore the source-backed equipment weapon slot after tick: ${JSON.stringify(defaultMutatedEquipment)}`);
    }
    assertEquipmentContains("Inventory left-click Kodai Wield", defaultMutatedEquipment, {
      head: 12929,
      cape: 21791,
      amulet: 12002,
      weapon: 21006,
      body: 11832,
      shield: 6889,
      legs: 11834,
      hands: 7462,
      feet: 11840,
      ring: 19710,
      ammo: 21948
    });
    assertActorAppearanceContains(
      "Inventory left-click Kodai Wield",
      defaultMutatedLocalActor,
      [12929, 21791, 12002, 21006, 11832, 6889, 11834, 7462, 11840, 19710, 21948]
    );
    await clickSideTab(window, "combat");
    const defaultMutatedCombat = await readRuntimeCombatPanel(window);
    if (
      defaultMutatedCombat.weaponItemId !== "21006" ||
      defaultMutatedCombat.weaponType !== "WAND" ||
      defaultMutatedCombat.weaponTypeConfig !== "18" ||
      !defaultMutatedCombat.attackStyles.every((slot) => slot.weaponType === "WAND")
    ) {
      throw new Error(`Inventory Wield did not restore combat-tab weapon config to wand after tick: ${JSON.stringify(defaultMutatedCombat)}`);
    }
    await clickSideTab(window, "inventory");
    await resetRuntimeTickOrigin(window);
    const blockedGmaulDispatch = await leftClickInventorySlot(window, 6);
    if (
      blockedGmaulDispatch.lastInventoryActivation !== "default" ||
      blockedGmaulDispatch.lastInventoryAction !== "Wield" ||
      blockedGmaulDispatch.lastInventoryActionKind !== "inventory-action" ||
      blockedGmaulDispatch.lastInventoryOpcode !== "34" ||
      blockedGmaulDispatch.lastInventoryIdentifier !== "4153" ||
      blockedGmaulDispatch.lastInventoryArgument1 !== "6" ||
      blockedGmaulDispatch.lastInventoryArgument2 !== "9764864" ||
      blockedGmaulDispatch.lastInventoryActionIndex !== "1" ||
      blockedGmaulDispatch.lastInventoryItemId !== "4153" ||
      blockedGmaulDispatch.lastInventorySlot !== "6" ||
      blockedGmaulDispatch.lastInventoryWidgetId !== "9764864" ||
      blockedGmaulDispatch.lastInventoryMutation !== "" ||
      blockedGmaulDispatch.lastInventoryBlockedReason !== "not-enough-free-inventory-space" ||
      blockedGmaulDispatch.lastInventoryQueuedForTick !== "false"
    ) {
      throw new Error(`Inventory Gmaul Wield should be source-blocked when a 2h weapon would displace shield with no free inventory slot: ${JSON.stringify(blockedGmaulDispatch)}`);
    }
    const blockedGmaulPendingEquip = await readInventoryPendingEquip(window, 6);
    if (blockedGmaulPendingEquip.pendingEquip === "true") {
      throw new Error(`Blocked Inventory Gmaul Wield should not set data-pending-equip: ${JSON.stringify(blockedGmaulPendingEquip)}`);
    }
    const blockedGmaulInventory = await readRuntimeInventory(window);
    if (blockedGmaulInventory.slots[6].itemId !== 4153) {
      throw new Error(`Blocked Inventory Gmaul Wield should leave the inventory untouched: ${JSON.stringify(blockedGmaulInventory.slots[6])}`);
    }

    await setRuntimeInventory(window, [
      { itemId: 11785, quantity: 1 },
      { itemId: 4736, quantity: 1 },
      { itemId: 4738, quantity: 1 },
      { itemId: 12006, quantity: 1 },
      { itemId: 11832, quantity: 1 },
      { itemId: 11834, quantity: 1 },
      { itemId: 4153, quantity: 1 }
    ]);
    await resetRuntimeTickOrigin(window);
    const gmaulDispatch = await leftClickInventorySlot(window, 6);
    if (
      gmaulDispatch.lastInventoryActivation !== "default" ||
      gmaulDispatch.lastInventoryAction !== "Wield" ||
      gmaulDispatch.lastInventoryActionKind !== "inventory-action" ||
      gmaulDispatch.lastInventoryOpcode !== "34" ||
      gmaulDispatch.lastInventoryIdentifier !== "4153" ||
      gmaulDispatch.lastInventoryArgument1 !== "6" ||
      gmaulDispatch.lastInventoryArgument2 !== "9764864" ||
      gmaulDispatch.lastInventoryActionIndex !== "1" ||
      gmaulDispatch.lastInventoryItemId !== "4153" ||
      gmaulDispatch.lastInventorySlot !== "6" ||
      gmaulDispatch.lastInventoryWidgetId !== "9764864" ||
      gmaulDispatch.lastInventoryMutation !== "equipment-swap" ||
      gmaulDispatch.lastInventoryMutationNextItemId !== "21006" ||
      gmaulDispatch.lastInventoryActorLoadoutId !== "gmaul-bandos" ||
      gmaulDispatch.lastInventoryEquipmentEquipSlot !== "3" ||
      gmaulDispatch.lastInventoryEquipmentEquippedItemId !== "4153" ||
      gmaulDispatch.lastInventoryEquipmentPreviousItemId !== "21006" ||
      gmaulDispatch.lastInventoryEquipmentServerHandler !== "Equipment.equip" ||
      gmaulDispatch.lastInventoryQueuedForTick !== "true"
    ) {
      throw new Error(`Inventory Gmaul Wield did not dispatch the source default action: ${JSON.stringify(gmaulDispatch)}`);
    }
    /* Verify gmaul equip is queued but NOT applied yet */
    const gmaulPendingEquip = await readInventoryPendingEquip(window, 6);
    if (gmaulPendingEquip.pendingEquip !== "true") {
      throw new Error(`Inventory Gmaul Wield should set data-pending-equip on slot 6: ${JSON.stringify(gmaulPendingEquip)}`);
    }
    const gmaulPreTickInventory = await readRuntimeInventory(window);
    if (gmaulPreTickInventory.slots[6].itemId !== 4153) {
      throw new Error(`Inventory Gmaul Wield should NOT mutate inventory before game tick: ${JSON.stringify(gmaulPreTickInventory.slots[6])}`);
    }

    /* Wait for game tick boundary */
    await waitForGameTick();

    const gmaulMutatedInventory = await readRuntimeInventory(window);
    if (gmaulMutatedInventory.slots[6].itemId !== 21006 || gmaulMutatedInventory.slots[6].label !== "Inventory slot 7: Kodai wand") {
      throw new Error(`Inventory Gmaul Wield did not swap the worn weapon back into slot 6 after tick: ${JSON.stringify(gmaulMutatedInventory.slots[6])}`);
    }
    const gmaulMutatedActors = await readRuntimeActors(window);
    const gmaulMutatedLocalActor = gmaulMutatedActors.find((actor) => actor.actorId === "local-player");
    if (gmaulMutatedLocalActor?.loadoutId !== "gmaul-bandos") {
      throw new Error(`Inventory Gmaul Wield did not switch the local actor to the exported Granite maul loadout after tick: ${JSON.stringify(gmaulMutatedActors)}`);
    }
    assertManualBaseSequence(gmaulMutatedLocalActor, "Inventory Gmaul Wield");
    await clickSideTab(window, "equipment");
    const gmaulMutatedEquipment = await readRuntimeEquipment(window);
    const gmaulMutatedWeapon = gmaulMutatedEquipment.items.find((item) => item.slotId === "weapon");
    if (
      gmaulMutatedWeapon?.itemId !== 4153 ||
      gmaulMutatedWeapon?.itemName !== "Granite maul" ||
      !gmaulMutatedWeapon?.usesItemAtlas
    ) {
      throw new Error(`Inventory Gmaul Wield did not update the source-backed equipment weapon slot after tick: ${JSON.stringify(gmaulMutatedEquipment)}`);
    }
    if (gmaulMutatedEquipment.items.some((item) => item.slotId === "shield")) {
      throw new Error(`Inventory Gmaul Wield should clear the shield slot for a two-handed weapon like Equipment.equip: ${JSON.stringify(gmaulMutatedEquipment)}`);
    }
    assertEquipmentContains("Inventory Gmaul Wield", gmaulMutatedEquipment, {
      head: 12929,
      cape: 21791,
      amulet: 12002,
      weapon: 4153,
      body: 11832,
      legs: 11834,
      hands: 7462,
      feet: 11840,
      ring: 19710,
      ammo: 21948
    });
    assertActorAppearanceContains(
      "Inventory Gmaul Wield",
      gmaulMutatedLocalActor,
      [12929, 21791, 12002, 4153, 11832, 11834, 7462, 11840, 19710, 21948]
    );
    await clickSideTab(window, "combat");
    const gmaulMutatedCombat = await readRuntimeCombatPanel(window);
    if (
      gmaulMutatedCombat.weaponItemId !== "4153" ||
      gmaulMutatedCombat.weaponType !== "GRANITE_MAUL" ||
      gmaulMutatedCombat.weaponTypeConfig !== "2" ||
      !gmaulMutatedCombat.attackStyles.every((slot) => slot.weaponType === "GRANITE_MAUL")
    ) {
      throw new Error(`Inventory Gmaul Wield did not update combat-tab weapon config to Granite maul after tick: ${JSON.stringify(gmaulMutatedCombat)}`);
    }
    await clickSideTab(window, "inventory");

    await setRuntimeInventory(window, [{ itemId: 11785, quantity: 1 }, { itemId: 385, quantity: 1 }]);
    await clickSideTab(window, "equipment");
    const removeDispatch = await leftClickEquipmentItem(window, "weapon");
    if (
      removeDispatch.lastEquipmentItemActivation !== "default" ||
      removeDispatch.lastEquipmentItemAction !== "Remove" ||
      removeDispatch.lastEquipmentItemActionKind !== "equipment-remove" ||
      removeDispatch.lastEquipmentItemMutation !== "equipment-unequip" ||
      removeDispatch.lastEquipmentItemServerMutationHandler !== "Equipment.unequip" ||
      removeDispatch.lastEquipmentItemInventoryFreeSlot !== "2" ||
      removeDispatch.lastEquipmentItemInventoryNextItemId !== "4153" ||
      removeDispatch.lastEquipmentItemItemId !== "4153" ||
      removeDispatch.lastEquipmentItemServerSlot !== "3"
    ) {
      throw new Error(`Equipment Remove did not dispatch the source-backed mutation: ${JSON.stringify(removeDispatch)}`);
    }
    await clickSideTab(window, "equipment");
    await delay(50);
    const removePending = await readEquipmentPendingRemove(window, "weapon");
    if (removePending.pendingRemove !== "true" || removePending.itemId !== 4153 || removePending.spriteVariant !== "normal") {
      throw new Error(`Equipment Remove should show pending non-Use feedback before tick: ${JSON.stringify(removePending)}`);
    }
    await clickSideTab(window, "inventory");
    const removePreTickInventory = await readRuntimeInventory(window);
    if (removePreTickInventory.slots[2].itemId !== null) {
      throw new Error(`Equipment Remove should NOT mutate inventory before game tick: ${JSON.stringify(removePreTickInventory.slots[2])}`);
    }
    await clickSideTab(window, "equipment");
    const removePreTickEquipment = await readRuntimeEquipment(window);
    const removePreTickWeapon = removePreTickEquipment.items.find((item) => item.slotId === "weapon");
    if (removePreTickWeapon?.itemId !== 4153) {
      throw new Error(`Equipment Remove should NOT clear the worn weapon before game tick: ${JSON.stringify(removePreTickEquipment)}`);
    }
    await waitForGameTick();
    await clickSideTab(window, "inventory");
    const removePostTickInventory = await readRuntimeInventory(window);
    if (removePostTickInventory.slots[2].itemId !== 4153 || removePostTickInventory.slots[2].label !== "Inventory slot 3: Granite maul") {
      throw new Error(`Equipment Remove did not put the weapon into the first free inventory slot after tick: ${JSON.stringify(removePostTickInventory.slots[2])}`);
    }
    await clickSideTab(window, "equipment");
    const removePostTickEquipment = await readRuntimeEquipment(window);
    const removePostTickWeapon = removePostTickEquipment.items.find((item) => item.slotId === "weapon");
    if (removePostTickWeapon) {
      throw new Error(`Equipment Remove did not clear the worn weapon after tick: ${JSON.stringify(removePostTickEquipment)}`);
    }
    await clickSideTab(window, "combat");
    const removePostTickCombat = await readRuntimeCombatPanel(window);
    if (
      removePostTickCombat.weaponItemId !== "" ||
      removePostTickCombat.weaponName !== "Unarmed" ||
      removePostTickCombat.weaponType !== "" ||
      removePostTickCombat.weaponTypeConfig !== ""
    ) {
      throw new Error(`Equipment Remove did not clear the combat-tab weapon state after tick: ${JSON.stringify(removePostTickCombat)}`);
    }
    await clickSideTab(window, "inventory");

    const useSourceMenu = await openInventoryContextMenu(window, 0);
    const useActionIndex = useSourceMenu.options.findIndex(
      (option) => option.action === "Use" && option.actionKind === "inventory-use" && option.opcode === 38
    );
    if (useActionIndex === -1) {
      throw new Error(`Inventory source item menu did not expose opcode-38 Use: ${JSON.stringify(useSourceMenu)}`);
    }
    const useSelectDispatch = await clickContextMenuOption(window, useActionIndex);
    await delay(150);
    if (
      useSelectDispatch.lastInventoryAction !== "Use" ||
      useSelectDispatch.lastInventoryActionKind !== "inventory-use" ||
      useSelectDispatch.lastInventoryOpcode !== "38" ||
      useSelectDispatch.lastInventoryIdentifier !== "11785" ||
      useSelectDispatch.lastInventoryArgument1 !== "0" ||
      useSelectDispatch.lastInventoryArgument2 !== "9764864" ||
      useSelectDispatch.lastInventoryActionIndex !== "" ||
      useSelectDispatch.selectedInventoryItemId !== "11785" ||
      useSelectDispatch.selectedInventoryItemName !== "Armadyl crossbow" ||
      useSelectDispatch.selectedInventorySlot !== "0" ||
      useSelectDispatch.selectedInventoryWidgetId !== "9764864"
    ) {
      throw new Error(`Inventory Use did not enter selected-item state: ${JSON.stringify(useSelectDispatch)}`);
    }
    const selectedSlotState = await readRuntimeInventory(window);
    if (selectedSlotState.slots[0].itemId !== 11785) {
      throw new Error(`Inventory Use should not mutate the selected source slot: ${JSON.stringify(selectedSlotState.slots[0])}`);
    }
    if (
      selectedSlotState.slots[0].selected !== "true" ||
      selectedSlotState.slots[0].spriteVariant !== "selected" ||
      selectedSlotState.slots[0].sourceBorder !== "2" ||
      selectedSlotState.slots[0].sourceShadowColor !== "0"
    ) {
      throw new Error(`Inventory Use should render the client selected-item sprite variant: ${JSON.stringify(selectedSlotState.slots[0])}`);
    }
    const worldClickClearDispatch = await leftClickRuntimeCanvas(window);
    if (
      worldClickClearDispatch.selectedInventoryItemId !== "" ||
      worldClickClearDispatch.selectedInventorySlot !== "" ||
      worldClickClearDispatch.selectedInventoryWidgetId !== "" ||
      !["scene-empty-left-click", "scene-selected-target-cancel"].includes(worldClickClearDispatch.lastInventorySelectionClear) ||
      worldClickClearDispatch.lastSelectedTargetModeCancel !== worldClickClearDispatch.lastInventorySelectionClear ||
      worldClickClearDispatch.lastTileCommandSource !== "" ||
      worldClickClearDispatch.lastTileCommandTileX !== "" ||
      worldClickClearDispatch.lastTileCommandTileZ !== ""
    ) {
      throw new Error(`World click should cancel selected inventory item state without dispatching movement: ${JSON.stringify(worldClickClearDispatch)}`);
    }
    const worldClickClearedSlotState = await readRuntimeInventory(window);
    if (worldClickClearedSlotState.slots[0].selected !== "false" || worldClickClearedSlotState.slots[0].spriteVariant !== "normal") {
      throw new Error(`World tile command should clear the selected source sprite: ${JSON.stringify(worldClickClearedSlotState.slots[0])}`);
    }
    const useSourceMenuAfterWorldClick = await openInventoryContextMenu(window, 0);
    const useActionIndexAfterWorldClick = useSourceMenuAfterWorldClick.options.findIndex(
      (option) => option.action === "Use" && option.actionKind === "inventory-use" && option.opcode === 38
    );
    if (useActionIndexAfterWorldClick === -1) {
      throw new Error(`Inventory source item menu did not expose opcode-38 Use after world-click clear: ${JSON.stringify(useSourceMenuAfterWorldClick)}`);
    }
    const useReselectDispatch = await clickContextMenuOption(window, useActionIndexAfterWorldClick);
    await delay(150);
    if (
      useReselectDispatch.selectedInventoryItemId !== "11785" ||
      useReselectDispatch.selectedInventorySlot !== "0" ||
      useReselectDispatch.selectedInventoryWidgetId !== "9764864"
    ) {
      throw new Error(`Inventory Use did not re-enter selected-item state after world-click clear: ${JSON.stringify(useReselectDispatch)}`);
    }
    const useTargetMenu = await openInventoryContextMenu(window, 1);
    const expectedUseTargetMenuOptions = [
      {
        text: "Use Armadyl crossbow -> Shark",
        action: "Use",
        actionKind: "inventory-use-selected",
        opcode: 31,
        identifier: 385,
        argument1: 1,
        argument2: 9764864
      }
    ];
    if (JSON.stringify(useTargetMenu.options) !== JSON.stringify(expectedUseTargetMenuOptions)) {
      throw new Error(`Selected inventory item did not replace target menu with item-on-item use: ${JSON.stringify(useTargetMenu)}`);
    }
    const useTargetDispatch = await clickTopContextMenuOption(window);
    if (
      useTargetDispatch.lastInventoryAction !== "Use" ||
      useTargetDispatch.lastInventoryActionKind !== "inventory-use-selected" ||
      useTargetDispatch.lastInventoryOpcode !== "31" ||
      useTargetDispatch.lastInventoryIdentifier !== "385" ||
      useTargetDispatch.lastInventoryArgument1 !== "1" ||
      useTargetDispatch.lastInventoryArgument2 !== "9764864" ||
      useTargetDispatch.lastInventoryActionIndex !== "" ||
      useTargetDispatch.lastInventoryItemId !== "385" ||
      useTargetDispatch.lastInventorySlot !== "1" ||
      useTargetDispatch.lastInventorySelectedItemId !== "11785" ||
      useTargetDispatch.lastInventorySelectedItemName !== "Armadyl crossbow" ||
      useTargetDispatch.lastInventorySelectedSlot !== "0" ||
      useTargetDispatch.lastInventorySelectedWidgetId !== "9764864" ||
      useTargetDispatch.selectedInventoryItemId !== ""
    ) {
      throw new Error(`Selected inventory item target dispatch did not match opcode-31 source shape: ${JSON.stringify(useTargetDispatch)}`);
    }
    const useClearedSlotState = await readRuntimeInventory(window);
    if (useClearedSlotState.slots[0].selected !== "false" || useClearedSlotState.slots[0].spriteVariant !== "normal") {
      throw new Error(`Selected inventory item target dispatch should clear the source selected sprite: ${JSON.stringify(useClearedSlotState.slots[0])}`);
    }

    const useBeforeInventoryResetMenu = await openInventoryContextMenu(window, 0);
    const useBeforeResetIndex = useBeforeInventoryResetMenu.options.findIndex(
      (option) => option.action === "Use" && option.actionKind === "inventory-use" && option.opcode === 38
    );
    if (useBeforeResetIndex === -1) {
      throw new Error(`Inventory source item menu did not expose opcode-38 Use before reset: ${JSON.stringify(useBeforeInventoryResetMenu)}`);
    }
    await clickContextMenuOption(window, useBeforeResetIndex);
    await setRuntimeInventory(window, [{ itemId: 11785, quantity: 1 }, { itemId: 385, quantity: 1 }]);
    await resetRuntimeTickOrigin(window);
    const equipAfterInventoryResetDispatch = await leftClickInventorySlot(window, 0);
    if (
      equipAfterInventoryResetDispatch.lastInventoryAction !== "Wield" ||
      equipAfterInventoryResetDispatch.lastInventoryActionKind !== "inventory-action" ||
      equipAfterInventoryResetDispatch.lastInventoryOpcode !== "34" ||
      equipAfterInventoryResetDispatch.lastInventoryIdentifier !== "11785" ||
      equipAfterInventoryResetDispatch.lastInventorySlot !== "0" ||
      equipAfterInventoryResetDispatch.selectedInventoryItemId !== "" ||
      equipAfterInventoryResetDispatch.lastInventorySelectionClear !== "inventory-reset"
    ) {
      throw new Error(`Runtime inventory reset did not clear stale selected-item state before left-click Wield: ${JSON.stringify(equipAfterInventoryResetDispatch)}`);
    }
    const equipAfterResetPending = await readInventoryPendingEquip(window, 0);
    if (equipAfterResetPending.pendingEquip !== "true") {
      throw new Error(`Left-click Wield after inventory reset should queue the equip until the next tick: ${JSON.stringify(equipAfterResetPending)}`);
    }

    await setRuntimeInventory(window, [{ itemId: 6685, quantity: 1 }, { itemId: 385, quantity: 1 }]);
    const drinkDispatch = await leftClickInventorySlot(window, 0);
    if (
      drinkDispatch.lastInventoryAction !== "Drink" ||
      drinkDispatch.lastInventoryOpcode !== "33" ||
      drinkDispatch.lastInventoryIdentifier !== "6685" ||
      drinkDispatch.lastInventoryArgument1 !== "0" ||
      drinkDispatch.lastInventoryArgument2 !== "9764864" ||
      drinkDispatch.lastInventoryActionIndex !== "0" ||
      drinkDispatch.lastInventoryMutation !== "" ||
      drinkDispatch.lastInventoryMutationNextItemId !== "" ||
      drinkDispatch.lastInventoryConsumableId !== "saradomin_brew" ||
      drinkDispatch.lastInventoryQueuedForTick !== "true" ||
      drinkDispatch.lastInventoryConsumableQueuedForTick !== "true"
    ) {
      throw new Error(`Inventory Drink should queue the source-backed dose mutation until the next game tick: ${JSON.stringify(drinkDispatch)}`);
    }
    const drinkPreTickInventory = await readRuntimeInventory(window);
    if (drinkPreTickInventory.slots[0].itemId !== 6685) {
      throw new Error(`Inventory Drink mutated before the next game tick: ${JSON.stringify(drinkPreTickInventory.slots[0])}`);
    }
    await waitForGameTick();
    const drinkInventory = await readRuntimeInventory(window);
    const drinkPostTickDataset = await readRuntimeViewportDataset(window);
    if (
      drinkInventory.slots[0].itemId !== 6687 ||
      drinkInventory.slots[0].label !== "Inventory slot 1: Saradomin brew(3)" ||
      drinkPostTickDataset.lastInventoryConsumableId !== "saradomin_brew" ||
      drinkPostTickDataset.lastInventoryConsumableAnimation !== "829" ||
      drinkPostTickDataset.lastInventoryConsumableSequence !== "consume"
    ) {
      throw new Error(`Inventory Drink did not apply the next dose and consume animation on the game tick: ${JSON.stringify({ slot: drinkInventory.slots[0], dataset: drinkPostTickDataset })}`);
    }
    await setRuntimeInventory(window, [{ itemId: 6687, quantity: 1 }, { itemId: 385, quantity: 1 }]);
    const eatDispatch = await leftClickInventorySlot(window, 1);
    if (
      eatDispatch.lastInventoryAction !== "Eat" ||
      eatDispatch.lastInventoryOpcode !== "33" ||
      eatDispatch.lastInventoryIdentifier !== "385" ||
      eatDispatch.lastInventoryArgument1 !== "1" ||
      eatDispatch.lastInventoryArgument2 !== "9764864" ||
      eatDispatch.lastInventoryActionIndex !== "0" ||
      eatDispatch.lastInventoryMutation !== "" ||
      eatDispatch.lastInventoryMutationNextItemId !== "" ||
      eatDispatch.lastInventoryConsumableId !== "shark" ||
      eatDispatch.lastInventoryQueuedForTick !== "true" ||
      eatDispatch.lastInventoryConsumableQueuedForTick !== "true"
    ) {
      throw new Error(`Inventory Eat should queue the source-backed item removal until the next game tick: ${JSON.stringify(eatDispatch)}`);
    }
    const eatPreTickInventory = await readRuntimeInventory(window);
    if (eatPreTickInventory.slots[1].itemId !== 385) {
      throw new Error(`Inventory Eat mutated before the next game tick: ${JSON.stringify(eatPreTickInventory.slots[1])}`);
    }
    await waitForGameTick();
    const eatInventory = await readRuntimeInventory(window);
    const eatPostTickDataset = await readRuntimeViewportDataset(window);
    if (
      eatInventory.slots[1].itemId !== null ||
      eatPostTickDataset.lastInventoryConsumableId !== "shark" ||
      eatPostTickDataset.lastInventoryConsumableAnimation !== "829" ||
      eatPostTickDataset.lastInventoryConsumableSequence !== "consume"
    ) {
      throw new Error(`Inventory Eat did not clear the consumed food slot on the game tick: ${JSON.stringify({ slot: eatInventory.slots[1], dataset: eatPostTickDataset })}`);
    }
    const emptySourceMenu = await openInventoryContextMenu(window, 0);
    const emptyActionIndex = emptySourceMenu.options.findIndex(
      (option) => option.action === "Empty" && option.actionKind === "inventory-action" && option.opcode === 36
    );
    if (emptyActionIndex === -1) {
      throw new Error(`Inventory source potion menu did not expose opcode-36 Empty: ${JSON.stringify(emptySourceMenu)}`);
    }
    const emptyDispatch = await clickContextMenuOption(window, emptyActionIndex);
    if (
      emptyDispatch.lastInventoryActivation !== "context-menu" ||
      emptyDispatch.lastInventoryAction !== "Empty" ||
      emptyDispatch.lastInventoryActionKind !== "inventory-action" ||
      emptyDispatch.lastInventoryOpcode !== "36" ||
      emptyDispatch.lastInventoryIdentifier !== "6687" ||
      emptyDispatch.lastInventoryArgument1 !== "0" ||
      emptyDispatch.lastInventoryArgument2 !== "9764864" ||
      emptyDispatch.lastInventoryActionIndex !== "3" ||
      emptyDispatch.lastInventoryMutation !== "empty-vial" ||
      emptyDispatch.lastInventoryMutationNextItemId !== "229"
    ) {
      throw new Error(`Inventory Empty did not dispatch a source-backed vial mutation: ${JSON.stringify(emptyDispatch)}`);
    }
    const emptyInventory = await readRuntimeInventory(window);
    if (emptyInventory.slots[0].itemId !== 229 || emptyInventory.slots[0].label !== "Inventory slot 1: Vial") {
      throw new Error(`Inventory Empty did not render the vial replacement sprite: ${JSON.stringify(emptyInventory.slots[0])}`);
    }
    const dropSourceMenu = await openInventoryContextMenu(window, 0);
    const dropActionIndex = dropSourceMenu.options.findIndex(
      (option) => option.action === "Drop" && option.actionKind === "inventory-action" && option.opcode === 37
    );
    if (dropActionIndex === -1) {
      throw new Error(`Inventory source vial menu did not expose opcode-37 Drop: ${JSON.stringify(dropSourceMenu)}`);
    }
    const dropDispatch = await clickContextMenuOption(window, dropActionIndex);
    if (
      dropDispatch.lastInventoryActivation !== "context-menu" ||
      dropDispatch.lastInventoryAction !== "Drop" ||
      dropDispatch.lastInventoryActionKind !== "inventory-action" ||
      dropDispatch.lastInventoryOpcode !== "37" ||
      dropDispatch.lastInventoryIdentifier !== "229" ||
      dropDispatch.lastInventoryArgument1 !== "0" ||
      dropDispatch.lastInventoryArgument2 !== "9764864" ||
      dropDispatch.lastInventoryActionIndex !== "4" ||
      dropDispatch.lastInventoryMutation !== "drop-remove" ||
      dropDispatch.lastInventoryMutationNextItemId !== ""
    ) {
      throw new Error(`Inventory Drop did not dispatch a source-backed slot clear: ${JSON.stringify(dropDispatch)}`);
    }
    const dropInventory = await readRuntimeInventory(window);
    if (dropInventory.slots[0].itemId !== null) {
      throw new Error(`Inventory Drop did not clear the source slot: ${JSON.stringify(dropInventory.slots[0])}`);
    }
    await clearRuntimeInventory(window);
    await setRuntimeCycle(window, 0);

    await setRuntimeCycle(window, maxCycle);
    const finalInventory = await readRuntimeInventory(window);
    const supplyIds = [6685, 3024, 385, 3144, 13441, 12695, 22461];
    const depletedSupplyIds = supplyIds.filter((itemId) => countItem(finalInventory, itemId) < countItem(initialInventory, itemId));

    if (depletedSupplyIds.length === 0) {
      throw new Error(
        `Runtime inventory did not reflect supply depletion between cycle 0 and ${maxCycle}: ` +
          JSON.stringify({ initialInventory, finalInventory })
      );
    }
    if (!finalInventory.sprites.every((sprite) => sprite.backgroundImage.includes("item_sprites.png"))) {
      throw new Error(`Final inventory sprites did not use item_sprites atlas: ${JSON.stringify(finalInventory)}`);
    }

    await selectRuntimeReplay(window, "generated-nh-inventory-switch-v1");
    await setRuntimeCycle(window, 0);
    const generatedInitialInventory = await readRuntimeInventory(window);
    const generatedMaxCycle = Number.parseInt(generatedInitialInventory.maxCycle, 10);
    if (!Number.isInteger(generatedMaxCycle) || generatedMaxCycle < 1) {
      throw new Error(`Invalid generated runtime cycle max: ${JSON.stringify(generatedInitialInventory)}`);
    }
    const generatedSnapshots = [];
    for (let cycle = 0; cycle <= generatedMaxCycle; cycle += 1) {
      await setRuntimeCycle(window, cycle);
      generatedSnapshots.push(await readRuntimeInventory(window));
    }
    const rangeEquippedSnapshot = generatedSnapshots.find(
      (inventory) => countItem(inventory, 11785) === 0 && countItem(inventory, 21006) > 0
    );
    const mageEquippedSnapshot = generatedSnapshots.find(
      (inventory) => countItem(inventory, 21006) === 0 && countItem(inventory, 11785) > 0
    );
    if (!rangeEquippedSnapshot || !mageEquippedSnapshot) {
      throw new Error(
        "Generated runtime inventory did not reflect server-style gear slot swaps: " +
          JSON.stringify({
            rangeEquippedSnapshot,
            mageEquippedSnapshot,
            generatedSnapshots: generatedSnapshots.map((inventory) => ({
              cycle: inventory.cycle,
              counts: inventory.counts,
              slots: inventory.slots
            }))
          })
      );
    }

    await setRuntimeInventory(window, [
      { itemId: 995, quantity: 99999 },
      { itemId: 995, quantity: 100000 },
      { itemId: 995, quantity: 10000000 },
      { itemId: 6685, quantity: 99999 },
      { itemId: 3144, quantity: 1 }
    ]);
    const quantityInventory = await readRuntimeInventory(window);
    const expectedQuantitySlots = [
      { index: 0, text: "99999", color: "#ffff00" },
      { index: 1, text: "100K", color: "#ffffff" },
      { index: 2, text: "10M", color: "#00ff80" }
    ];
    for (const expected of expectedQuantitySlots) {
      const slot = quantityInventory.slots[expected.index];
      if (
        slot.quantityText !== expected.text ||
        slot.quantityDataText !== expected.text ||
        slot.quantityDataColor !== expected.color ||
        slot.quantityFontId !== 494 ||
        slot.quantitySourceFontArchive !== "p11_full" ||
        slot.quantitySourceGlyphAtlas !== "client_p11_font" ||
        slot.quantitySourceGlyphImage !== "client_p11_font.png" ||
        slot.quantitySourceBaselineY !== 9 ||
        slot.quantitySourceShadowColor !== 1 ||
        slot.quantityGlyphCount !== expected.text.length ||
        slot.quantityGlyphDomCount < slot.quantityGlyphCount * 2 ||
        !slot.quantityFirstGlyphMaskImage.includes("client_p11_font.png") ||
        slot.itemStackable !== "true" ||
        slot.quantityVariant !== "true" ||
        Number(slot.sourceQuantity) <= 1
      ) {
        throw new Error(`Inventory quantity text mismatch: ${JSON.stringify({ expected, slot, quantityInventory })}`);
      }
    }
    if (quantityInventory.slots[3].quantityText !== "" || quantityInventory.slots[3].itemStackable !== "false") {
      throw new Error(`Non-stackable quantity inventory slot should not render stack text: ${JSON.stringify(quantityInventory.slots[3])}`);
    }
    if (quantityInventory.slots[4].quantityText !== "") {
      throw new Error(`Quantity 1 inventory slot should not render stack text: ${JSON.stringify(quantityInventory.slots[4])}`);
    }

    await setRuntimeInventory(window, [
      { itemId: 11785, quantity: 1 },
      { itemId: 6685, quantity: 1 },
      { itemId: 3144, quantity: 1 }
    ]);
    const dragDispatch = await dragInventorySlot(window, 0, 1);
    if (
      dragDispatch.lastInventoryActivation !== "drag" ||
      dragDispatch.lastInventoryActionKind !== "inventory-drag-swap" ||
      dragDispatch.lastInventoryDragSourceSlot !== "0" ||
      dragDispatch.lastInventoryDragDestinationSlot !== "1" ||
      dragDispatch.lastInventoryDragSourceItemId !== "11785" ||
      dragDispatch.lastInventoryDragDestinationItemId !== "6685"
    ) {
      throw new Error(`Inventory drag did not dispatch source-style slot swap metadata: ${JSON.stringify(dragDispatch)}`);
    }
    if (
      dragDispatch.dragVisual.scaleX > 1.01 &&
      Math.abs(dragDispatch.dragVisual.sourceOffsetX - dragDispatch.dragVisual.expectedSourceOffsetX) > 1.5
    ) {
      throw new Error(`Inventory drag should divide horizontal movement by stretched-mode scale before applying the widget offset: ${JSON.stringify(dragDispatch.dragVisual)}`);
    }
    if (
      dragDispatch.dragVisual.scaleY > 1.01 &&
      Math.abs(dragDispatch.dragVisual.sourceOffsetY - dragDispatch.dragVisual.expectedSourceOffsetY) > 1.5
    ) {
      throw new Error(`Inventory drag should divide vertical movement by stretched-mode scale before applying the widget offset: ${JSON.stringify(dragDispatch.dragVisual)}`);
    }
    if (
      dragDispatch.dragVisual.scaleX > 1.01 &&
      Math.abs(dragDispatch.dragVisual.visualDeltaX - dragDispatch.dragVisual.rawDeltaX) > 2
    ) {
      throw new Error(`Inventory drag sprite should visually track the mouse in stretched mode, not outrun it: ${JSON.stringify(dragDispatch.dragVisual)}`);
    }
    const dragInventory = await readRuntimeInventory(window);
    if (dragInventory.slots[0].itemId !== 6685 || dragInventory.slots[1].itemId !== 11785) {
      throw new Error(`Inventory drag did not swap the source and destination slots: ${JSON.stringify(dragInventory.slots.slice(0, 3))}`);
    }

    const sparseReplayReadyMessage = await loadRuntimeWindow(window);
    await selectRuntimeReplay(window, "two-actor-barrage-into-range-v1");
    await setRuntimeCycle(window, 0);
    await setManualControl(window, false);
    await focusRuntimeSectionForCapture(window);
    const sparsePreActors = await readRuntimeActors(window);
    const sparsePreLocalActor = sparsePreActors.find((actor) => actor.actorId === "local-player");
    if (
      sparsePreLocalActor?.appearanceSource !== "client-packet" ||
      sparsePreLocalActor.appearanceItemIds.length >= 11 ||
      !sparsePreLocalActor.appearanceItemIds.includes(6914) ||
      !sparsePreLocalActor.appearanceItemIds.includes(21021) ||
      !sparsePreLocalActor.appearanceItemIds.includes(21024)
    ) {
      throw new Error(`Sparse client appearance replay did not expose the expected partial mage gear source: ${JSON.stringify(sparsePreLocalActor)}`);
    }
    await clickSideTab(window, "equipment");
    const sparsePreEquipment = await readRuntimeEquipment(window);
    assertEquipmentContains("Sparse client appearance before ACB Wield", sparsePreEquipment, {
      head: 12929,
      cape: 21791,
      amulet: 12002,
      weapon: 6914,
      body: 21021,
      shield: 6889,
      legs: 21024,
      hands: 7462,
      feet: 11840,
      ring: 19710,
      ammo: 21948
    });
    await clickSideTab(window, "inventory");
    await setRuntimeInventory(window, [{ itemId: 11785, quantity: 1 }, { itemId: 385, quantity: 1 }]);
    await resetRuntimeTickOrigin(window);
    const sparseEquipDispatch = await leftClickInventorySlot(window, 0);
    if (
      sparseEquipDispatch.lastInventoryActivation !== "default" ||
      sparseEquipDispatch.lastInventoryAction !== "Wield" ||
      sparseEquipDispatch.lastInventoryActionKind !== "inventory-action" ||
      sparseEquipDispatch.lastInventoryOpcode !== "34" ||
      sparseEquipDispatch.lastInventoryIdentifier !== "11785" ||
      sparseEquipDispatch.lastInventoryMutation !== "equipment-swap" ||
      sparseEquipDispatch.lastInventoryMutationNextItemId !== "6914" ||
      !["", "acb-hides"].includes(sparseEquipDispatch.lastInventoryActorLoadoutId) ||
      sparseEquipDispatch.lastInventoryEquipmentEquipSlot !== "3" ||
      sparseEquipDispatch.lastInventoryEquipmentEquippedItemId !== "11785" ||
      sparseEquipDispatch.lastInventoryEquipmentPreviousItemId !== "6914" ||
      sparseEquipDispatch.lastInventoryEquipmentServerHandler !== "Equipment.equip"
    ) {
      throw new Error(`Sparse client appearance ACB Wield did not dispatch a container-preserving swap: ${JSON.stringify(sparseEquipDispatch)}`);
    }
    await waitForGameTick();
    const sparsePostInventory = await readRuntimeInventory(window);
    if (sparsePostInventory.slots[0].itemId !== 6914 || sparsePostInventory.slots[0].label !== "Inventory slot 1: Master wand") {
      throw new Error(`Sparse client appearance ACB Wield should return the previous weapon to inventory slot 0: ${JSON.stringify(sparsePostInventory.slots[0])}`);
    }
    const sparsePostActors = await readRuntimeActors(window);
    const sparsePostLocalActor = sparsePostActors.find((actor) => actor.actorId === "local-player");
    await clickSideTab(window, "equipment");
    const sparsePostEquipment = await readRuntimeEquipment(window);
    assertEquipmentContains("Sparse client appearance after ACB Wield", sparsePostEquipment, {
      head: 12929,
      cape: 21791,
      amulet: 12002,
      weapon: 11785,
      body: 21021,
      shield: 6889,
      legs: 21024,
      hands: 7462,
      feet: 11840,
      ring: 19710,
      ammo: 21948
    });
    assertActorAppearanceContains(
      "Sparse client appearance after ACB Wield",
      sparsePostLocalActor,
      [12929, 21791, 12002, 11785, 21021, 6889, 21024, 7462, 11840, 19710, 21948]
    );

    await setRuntimeInventory(window, [{ itemId: 11785, quantity: 1 }, { itemId: 385, quantity: 1 }]);
    await clickSideTab(window, "inventory");
    await resetRuntimeTickOrigin(window);
    const sameAcbDispatch = await leftClickInventorySlot(window, 0);
    if (
      sameAcbDispatch.lastInventoryAction !== "Wield" ||
      sameAcbDispatch.lastInventoryIdentifier !== "11785" ||
      sameAcbDispatch.lastInventoryMutation !== "equipment-swap" ||
      sameAcbDispatch.lastInventoryMutationNextItemId !== "11785" ||
      sameAcbDispatch.lastInventoryEquipmentEquipSlot !== "3" ||
      sameAcbDispatch.lastInventoryEquipmentEquippedItemId !== "11785" ||
      sameAcbDispatch.lastInventoryEquipmentPreviousItemId !== "11785" ||
      sameAcbDispatch.lastInventoryQueuedForTick !== "true"
    ) {
      throw new Error(`Same-item ACB Wield should queue a Nh non-stackable swap instead of deleting the inventory copy: ${JSON.stringify(sameAcbDispatch)}`);
    }
    await waitForGameTick();
    const sameAcbInventory = await readRuntimeInventory(window);
    if (sameAcbInventory.slots[0].itemId !== 11785 || sameAcbInventory.slots[0].label !== "Inventory slot 1: Armadyl crossbow") {
      throw new Error(`Same-item ACB Wield should keep the non-stackable ACB in inventory slot 0 like Nh Equipment.equip: ${JSON.stringify(sameAcbInventory.slots[0])}`);
    }
    await clickSideTab(window, "equipment");
    const sameAcbEquipment = await readRuntimeEquipment(window);
    const sameAcbWeapon = sameAcbEquipment.items.find((item) => item.slotId === "weapon");
    if (sameAcbWeapon?.itemId !== 11785 || sameAcbWeapon?.itemName !== "Armadyl crossbow") {
      throw new Error(`Same-item ACB Wield should leave the worn ACB equipped: ${JSON.stringify(sameAcbEquipment)}`);
    }

    if (screenshotPath) {
      await focusRuntimeSectionForCapture(window);
      await delay(300);
      const screenshot = await window.webContents.capturePage({ x: 0, y: 0, width: 900, height: 720 });
      await fs.writeFile(screenshotPath, screenshot.toPNG());
    }

    console.log(
      JSON.stringify(
        {
          runtimeReadyMessage,
          maxCycle,
          initialInventory,
          inventoryMenu,
          menuDispatch,
          menuMutatedInventory,
          menuMutatedActors,
          defaultDispatch,
          defaultMutatedInventory,
          defaultMutatedActors,
          gmaulDispatch,
          gmaulMutatedInventory,
          gmaulMutatedActors,
          useSourceMenu,
          useSelectDispatch,
          selectedSlotState,
          worldClickClearDispatch,
          worldClickClearedSlotState,
          useReselectDispatch,
          useTargetMenu,
          useTargetDispatch,
          useClearedSlotState,
          drinkDispatch,
          drinkInventory,
          emptySourceMenu,
          emptyDispatch,
          emptyInventory,
          dropSourceMenu,
          dropDispatch,
          dropInventory,
          eatDispatch,
          eatInventory,
          finalInventory,
          depletedSupplyIds,
          generatedGearMutation: {
            maxCycle: generatedMaxCycle,
            rangeEquippedCycle: rangeEquippedSnapshot.cycle,
            mageEquippedCycle: mageEquippedSnapshot.cycle
          },
          quantityInventory,
          dragDispatch,
          dragInventory,
          sparseReplayReadyMessage,
          sparsePreActors,
          sparsePreEquipment,
          sparseEquipDispatch,
          sparsePostInventory,
          sparsePostActors,
          sparsePostEquipment,
          sameAcbDispatch,
          sameAcbInventory,
          sameAcbEquipment,
          screenshotPath
        },
        null,
        2
      )
    );
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
