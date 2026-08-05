const { app, BrowserWindow } = require("./electron-muted.cjs");
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
      window.dispatchEvent(new CustomEvent("nh-runtime-camera", { detail: { camera: "top" } }));
      window.dispatchEvent(new CustomEvent("nh-runtime-cycle", { detail: { cycle: 200 } }));
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result;
}

async function clickStartAndWaitForGo(window) {
  const startDeadline = Date.now() + 15000;
  while (Date.now() < startDeadline) {
    const result = await window.webContents.executeJavaScript(`
      (() => {
      const button = document.querySelector(".runtimeFightStartButton");
      if (!button) {
        return { ok: true, started: false, reason: "not-pending" };
      }
      if (button.disabled) {
        return { ok: true, started: false, reason: "disabled", status: document.querySelector(".runtimeBotDifficultyStatus")?.textContent ?? "" };
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
      return { ok: true, started: true };
    })()
    `);
    if (!result.ok) {
      throw new Error(JSON.stringify(result));
    }
    if (result.started || result.reason === "not-pending") {
      break;
    }
    await delay(100);
  }
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

async function setRuntimeFollowTarget(window, target) {
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const select = document.querySelector("#runtime-follow");
      if (!select) {
        return { ok: false, error: "missing runtime follow selector" };
      }
      select.value = ${JSON.stringify(target)};
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(result.error);
  }
}

async function openPlayerContextMenu(window) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      let canvasRect = null;
      const delayFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const waitForMenu = async () => {
        const deadline = Date.now() + 700;
        while (Date.now() < deadline) {
          const menu = document.querySelector(".nhContextMenu");
          if (menu) {
            return menu;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return null;
      };
      const menuSnapshot = (menu, click, rect) => {
        const options = Array.from(menu.querySelectorAll(".nhContextMenuOption")).map((option) => {
          const optionRect = option.getBoundingClientRect();
          const glyphs = Array.from(option.querySelectorAll(".nhContextMenuGlyph"));
          return {
            text: option.textContent ?? "",
            action: option.getAttribute("data-menu-action") ?? "",
            actionKind: option.getAttribute("data-menu-action-kind") ?? "",
            opcode: Number(option.getAttribute("data-menu-opcode")),
            identifier: Number(option.getAttribute("data-menu-identifier")),
            top: Number.parseFloat(option.style.top || "0"),
            height: optionRect.height,
            glyphCount: glyphs.length
          };
        });
        const firstGlyph = menu.querySelector(".nhContextMenuGlyph");
        const firstGlyphStyle = firstGlyph ? getComputedStyle(firstGlyph) : null;
        const menuRect = menu.getBoundingClientRect();
        return {
          ok: true,
          click,
          options,
          titleGlyphCount: menu.querySelectorAll(".nhContextMenuTitle .nhContextMenuGlyph").length,
          firstGlyphMaskImage: firstGlyphStyle?.webkitMaskImage || firstGlyphStyle?.maskImage || "",
          sourceFontId: menu.getAttribute("data-source-font-id") ?? "",
          sourceFontArchive: menu.getAttribute("data-source-font-archive") ?? "",
          sourceGlyphAtlas: menu.getAttribute("data-source-glyph-atlas") ?? "",
          sourceGlyphImage: menu.getAttribute("data-source-glyph-image") ?? "",
          sourceCloseMargin: Number(menu.getAttribute("data-source-close-margin")),
          styleWidth: Number.parseFloat(getComputedStyle(menu).width),
          styleHeight: Number.parseFloat(getComputedStyle(menu).height),
          canvasRect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
          },
          menuRect: {
            left: menuRect.left,
            top: menuRect.top,
            width: menuRect.width,
            height: menuRect.height
          },
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          }
        };
      };
      try {
        const canvas = document.querySelector(".runtimeViewport canvas");
        if (!canvas) {
          return { ok: false, error: "missing runtime canvas" };
        }
        const rect = canvas.getBoundingClientRect();
        canvasRect = {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        };
        const cameraModes = ["top", "north", "south", "isometric"];
        const cameraAttempts = [];
        for (const camera of cameraModes) {
          window.dispatchEvent(new CustomEvent("nh-runtime-camera", { detail: { camera } }));
          await delayFrame();
          for (let attempt = 0; attempt < 20; attempt += 1) {
            const motion = window.__nhRuntimeDebug?.motion;
            const opponent = motion?.actors?.find((actor) => actor.actorId === "opponent");
            if (opponent?.clickbox?.dom) {
              const clientX = opponent.clickbox.dom.centerX;
              const clientY = opponent.clickbox.dom.centerY;
              canvas.dispatchEvent(new PointerEvent("pointerdown", {
                bubbles: true,
                cancelable: true,
                view: window,
                pointerId: 99,
                pointerType: "mouse",
                isPrimary: true,
                button: 2,
                buttons: 2,
                clientX,
                clientY
              }));
              let menu = await waitForMenu();
              if (!menu) {
                canvas.dispatchEvent(new MouseEvent("contextmenu", {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  button: 2,
                  buttons: 0,
                  clientX,
                  clientY
                }));
                menu = await waitForMenu();
              }
              if (!menu) {
                return { ok: false, error: "right-click at opponent debug clickbox did not open context menu", canvasRect, camera, opponent };
              }
              const snapshot = menuSnapshot(
                menu,
                {
                  x: opponent.clickbox.canvas.centerX,
                  y: opponent.clickbox.canvas.centerY,
                  clientX,
                  clientY
                },
                rect
              );
              if (snapshot.options.some((option) => option.text.includes("Opponent (level-126)"))) {
                return { ...snapshot, source: "debug-clickbox-contextmenu", camera, opponent };
              }
              return {
                ok: false,
                error: "right-click at opponent debug clickbox opened a menu without opponent entries",
                canvasRect,
                camera,
                opponent,
                options: snapshot.options.map((option) => option.text)
              };
            }
            if (attempt === 19) {
              cameraAttempts.push({ camera, opponent: opponent ?? null, layout: motion?.layout ?? null });
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }

        return {
          ok: false,
          error: "could not locate opponent debug clickbox",
          canvasRect,
          layout: window.__nhRuntimeDebug?.motion?.layout ?? null,
          opponent: window.__nhRuntimeDebug?.motion?.actors?.find((actor) => actor.actorId === "opponent") ?? null,
          cameraAttempts
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error), canvasRect };
      }
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function hoverTopContextMenuOption(window, menu) {
  window.webContents.sendInputEvent({
    type: "mouseMove",
    x: Math.round(menu.menuRect.left + 4),
    y: Math.round(menu.menuRect.top + 31)
  });
  await delay(120);
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const option = document.querySelector(".nhContextMenuOption");
      const hover = option?.querySelector(".nhContextMenuHover");
      if (!option || !hover) {
        return { ok: false, error: "missing context menu hover element" };
      }
      const style = getComputedStyle(hover);
      return {
        ok: true,
        display: style.display,
        opacity: Number.parseFloat(style.opacity),
        backgroundColor: style.backgroundColor,
        left: style.left,
        top: style.top,
        width: style.width,
        height: style.height,
        sourceHoverFillColor: option.getAttribute("data-source-hover-fill-color") ?? "",
        sourceHoverFillAlpha: Number(option.getAttribute("data-source-hover-fill-alpha"))
      };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function verifyContextMenuClosesOutsideSourceMargin(window, menu) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 82,
        pointerType: "mouse",
        isPrimary: true,
        clientX: ${JSON.stringify(Math.round(menu.menuRect.left - 24))},
        clientY: ${JSON.stringify(Math.round(menu.menuRect.top - 24))}
      }));
    })()
  `);
  await delay(80);
  const result = await window.webContents.executeJavaScript(`
    (() => ({
      ok: true,
      stillOpen: document.querySelector(".nhContextMenu") !== null
    }))()
  `);
  if (result.stillOpen) {
    throw new Error(`context menu stayed open after pointer moved outside Nh 10px close margin: ${JSON.stringify(result)}`);
  }
  return result;
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
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function clickSpell(window, spellId) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const spell = document.querySelector(${JSON.stringify(`.nhSpellbookIconSprite[data-spell-id="${spellId}"]`)});
      if (!spell) {
        return { ok: false, error: "missing spell" };
      }
      const rect = spell.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;
      spell.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX,
        clientY
      }));
      spell.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX,
        clientY
      }));
      spell.dispatchEvent(new MouseEvent("click", {
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

async function openInventoryContextMenu(window, slotIndex) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const slot = document.querySelector(${JSON.stringify(`.nhInventorySlot[data-slot-index="${slotIndex}"]`)});
      if (!slot) {
        return { ok: false, error: "missing inventory slot" };
      }
      const rect = slot.getBoundingClientRect();
      slot.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 77,
        pointerType: "mouse",
        isPrimary: true,
        button: 2,
        buttons: 2,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      }));
      let menu = document.querySelector(".nhContextMenu");
      if (!menu) {
        slot.dispatchEvent(new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 2,
          buttons: 2,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2
        }));
        menu = document.querySelector(".nhContextMenu");
      }
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
      const rect = option.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;
      option.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 81,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX,
        clientY
      }));
      option.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 81,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX,
        clientY
      }));
      option.dispatchEvent(new MouseEvent("click", {
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
    await window.webContents.executeJavaScript(`(() => { window.__NH_TRAINER_ENABLE_RUNTIME_MOTION_DEBUG = true; })()`);
    const runtimeReadyMessage = await waitForReady(
      window,
      'section[aria-labelledby="runtime-scene"]',
      "runtime scene"
    );
    await focusRuntimeSectionForCapture(window);
    await delay(300);
    await clickStartAndWaitForGo(window);
    await setRuntimeFollowTarget(window, "opponent");
    await delay(300);
    const menu = await openPlayerContextMenu(window);
    const expected = [
      "Attack Opponent (level-126)",
      "Walk here Opponent (level-126)",
      "Inspect inventory Opponent (level-126)",
      "Follow Opponent (level-126)",
      "Trade with Opponent (level-126)",
      "Cancel"
    ];
    const actual = menu.options.map((option) => option.text);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`unexpected player menu options: ${JSON.stringify(actual)}`);
    }
    if (menu.styleHeight !== menu.options.length * 15 + 22) {
      throw new Error(`unexpected source menu height: ${JSON.stringify(menu)}`);
    }
    if (menu.sourceFontId !== "496" || menu.sourceFontArchive !== "b12_full") {
      throw new Error(`player context menu did not expose exported bold12 font metrics: ${JSON.stringify(menu)}`);
    }
    if (menu.sourceGlyphAtlas !== "context_menu_font" || menu.sourceGlyphImage !== "context_menu_font.png") {
      throw new Error(`player context menu did not expose exported bold12 glyph sheet: ${JSON.stringify(menu)}`);
    }
    if (menu.sourceCloseMargin !== 10) {
      throw new Error(`player context menu did not expose Nh 10px close margin: ${JSON.stringify(menu)}`);
    }
    if (menu.titleGlyphCount <= 0 || !menu.options.every((option) => option.glyphCount > 0)) {
      throw new Error(`player context menu text did not render from glyph spans: ${JSON.stringify(menu)}`);
    }
    if (!menu.firstGlyphMaskImage.includes("context_menu_font.png")) {
      throw new Error(`player context menu glyph did not use context_menu_font mask image: ${JSON.stringify(menu)}`);
    }
    for (let index = 0; index < menu.options.length; index += 1) {
      const expectedTop = 22 + index * 15;
      if (menu.options[index].top !== expectedTop) {
        throw new Error(`unexpected option top at ${index}: ${JSON.stringify(menu.options[index])}`);
      }
    }
    const hover = await hoverTopContextMenuOption(window, menu);
    if (
      hover.display !== "block" ||
      hover.backgroundColor !== "rgb(255, 255, 255)" ||
      hover.opacity !== 0.3125 ||
      hover.left !== "3px" ||
      hover.top !== "-3px" ||
      hover.height !== "15px" ||
      hover.sourceHoverFillColor !== "#ffffff" ||
      hover.sourceHoverFillAlpha !== 0.3125
    ) {
      throw new Error(`context menu hover highlight did not match draw2010Menu fillRectangleAlpha row: ${JSON.stringify(hover)}`);
    }

    await delay(300);
    const captureRect = {
      x: Math.max(0, Math.trunc(menu.canvasRect.left - 24)),
      y: Math.max(0, Math.trunc(menu.canvasRect.top - 24)),
      width: Math.min(Math.trunc(menu.viewport.width), Math.trunc(menu.canvasRect.width + 48)),
      height: Math.min(720, Math.trunc(menu.canvasRect.height + 96))
    };
    const screenshot = await window.webContents.capturePage(captureRect);
    await fs.writeFile(screenshotPath, screenshot.toPNG());
    const closeOutside = await verifyContextMenuClosesOutsideSourceMargin(window, menu);
    const followMenu = await openPlayerContextMenu(window);
    const followIndex = followMenu.options.findIndex((option) => option.actionKind === "follow");
    if (followIndex === -1) {
      throw new Error(`player menu did not expose Follow action: ${JSON.stringify(followMenu)}`);
    }
    const followDispatch = await clickContextMenuOption(window, followIndex);
    if (
      followDispatch.lastPlayerAction !== "Follow" ||
      followDispatch.lastPlayerActionKind !== "follow" ||
      followDispatch.lastPlayerOpcode !== "2045" ||
      followDispatch.lastPlayerBaseOpcode !== "45" ||
      followDispatch.lastPlayerServerPacketId !== "43" ||
      followDispatch.lastPlayerServerPacketName !== "ClientPacket.field2383" ||
      followDispatch.lastPlayerOption !== "2" ||
      followDispatch.lastPlayerIdentifier !== "1" ||
      followDispatch.lastPlayerPacketDispatch !== "follow" ||
      followDispatch.lastTileCommandSource !== ""
    ) {
      throw new Error(`Follow player dispatch fell through or lost source metadata: ${JSON.stringify(followDispatch)}`);
    }
    const tradeMenu = await openPlayerContextMenu(window);
    const tradeIndex = tradeMenu.options.findIndex((option) => option.actionKind === "trade");
    if (tradeIndex === -1) {
      throw new Error(`player menu did not expose Trade with action: ${JSON.stringify(tradeMenu)}`);
    }
    const tradeDispatch = await clickContextMenuOption(window, tradeIndex);
    if (
      tradeDispatch.lastPlayerAction !== "Trade with" ||
      tradeDispatch.lastPlayerActionKind !== "trade" ||
      tradeDispatch.lastPlayerOpcode !== "2046" ||
      tradeDispatch.lastPlayerBaseOpcode !== "46" ||
      tradeDispatch.lastPlayerServerPacketId !== "61" ||
      tradeDispatch.lastPlayerServerPacketName !== "ClientPacket.field2362" ||
      tradeDispatch.lastPlayerOption !== "3" ||
      tradeDispatch.lastPlayerIdentifier !== "1" ||
      tradeDispatch.lastPlayerPacketDispatch !== "trade" ||
      tradeDispatch.lastTileCommandSource !== ""
    ) {
      throw new Error(`Trade with player dispatch fell through or lost source metadata: ${JSON.stringify(tradeDispatch)}`);
    }
    await clickSideTab(window, "inventory");
    await setRuntimeInventory(window, [{ itemId: 11785, quantity: 1 }]);
    const itemSourceMenu = await openInventoryContextMenu(window, 0);
    const useItemActionIndex = itemSourceMenu.options.findIndex(
      (option) => option.action === "Use" && option.actionKind === "inventory-use" && option.opcode === 38
    );
    if (useItemActionIndex === -1) {
      throw new Error(`Inventory source item menu did not expose opcode-38 Use before player targeting: ${JSON.stringify(itemSourceMenu)}`);
    }
    const itemSelection = await clickContextMenuOption(window, useItemActionIndex);
    if (
      itemSelection.selectedInventoryItemId !== "11785" ||
      itemSelection.selectedInventoryItemName !== "Armadyl crossbow" ||
      itemSelection.selectedInventorySlot !== "0" ||
      itemSelection.selectedInventoryWidgetId !== "9764864"
    ) {
      throw new Error(`Inventory Use did not enter selected-item state before player targeting: ${JSON.stringify(itemSelection)}`);
    }
    const selectedItemMenu = await openPlayerContextMenu(window);
    const selectedItemExpected = ["Use Armadyl crossbow -> Opponent (level-126)", "Cancel"];
    const selectedItemActual = selectedItemMenu.options.map((option) => option.text);
    if (JSON.stringify(selectedItemActual) !== JSON.stringify(selectedItemExpected)) {
      throw new Error(`unexpected selected-item player menu options: ${JSON.stringify(selectedItemActual)}`);
    }
    const selectedItemOption = selectedItemMenu.options[0];
    if (
      selectedItemOption.action !== "Use" ||
      selectedItemOption.actionKind !== "player-use-selected" ||
      selectedItemOption.opcode !== 14 ||
      selectedItemOption.identifier !== 1
    ) {
      throw new Error(`selected-item player row did not carry source opcode metadata: ${JSON.stringify(selectedItemOption)}`);
    }
    const selectedItemDispatch = await clickTopContextMenuOption(window);
    if (
      selectedItemDispatch.lastPlayerAction !== "Use" ||
      selectedItemDispatch.lastPlayerActionKind !== "player-use-selected" ||
      selectedItemDispatch.lastPlayerOpcode !== "14" ||
      selectedItemDispatch.lastPlayerIdentifier !== "1" ||
      selectedItemDispatch.lastPlayerServerPacketId !== "59" ||
      selectedItemDispatch.lastPlayerSelectedItemId !== "11785" ||
      selectedItemDispatch.lastPlayerSelectedSlot !== "0" ||
      selectedItemDispatch.lastPlayerSelectedWidgetId !== "9764864" ||
      selectedItemDispatch.selectedInventoryItemId !== "" ||
      selectedItemDispatch.lastInventorySelectionClear !== "player-use-selected" ||
      selectedItemDispatch.lastPlayerPacketDispatch !== "player-use-selected" ||
      selectedItemDispatch.lastTileCommandSource !== ""
    ) {
      throw new Error(`selected-item player dispatch did not preserve source metadata: ${JSON.stringify(selectedItemDispatch)}`);
    }
    await clickSideTab(window, "magic");
    const spellSelection = await clickSpell(window, "smoke-rush");
    if (
      spellSelection.selectedSpellActionName !== "Cast" ||
      spellSelection.selectedSpellFlags !== "10" ||
      spellSelection.selectedSpellId !== "smoke-rush" ||
      spellSelection.selectedSpellWidgetId !== "14286930" ||
      spellSelection.selectedSpellChildId !== "82"
    ) {
      throw new Error(`Smoke Rush did not enter selected-spell state before player targeting: ${JSON.stringify(spellSelection)}`);
    }
    const selectedSpellMenu = await openPlayerContextMenu(window);
    const selectedSpellExpected = ["Cast Smoke Rush -> Opponent (level-126)", "Cancel"];
    const selectedSpellActual = selectedSpellMenu.options.map((option) => option.text);
    if (JSON.stringify(selectedSpellActual) !== JSON.stringify(selectedSpellExpected)) {
      throw new Error(`unexpected selected-spell player menu options: ${JSON.stringify(selectedSpellActual)}`);
    }
    const selectedSpellOption = selectedSpellMenu.options[0];
    if (
      selectedSpellOption.action !== "Cast" ||
      selectedSpellOption.actionKind !== "player-spell-selected" ||
      selectedSpellOption.opcode !== 15 ||
      selectedSpellOption.identifier !== 1
    ) {
      throw new Error(`selected-spell player row did not carry source opcode metadata: ${JSON.stringify(selectedSpellOption)}`);
    }
    const selectedSpellDispatch = await clickTopContextMenuOption(window);
    if (
      selectedSpellDispatch.lastPlayerAction !== "Cast" ||
      selectedSpellDispatch.lastPlayerActionKind !== "player-spell-selected" ||
      selectedSpellDispatch.lastPlayerOpcode !== "15" ||
      selectedSpellDispatch.lastPlayerIdentifier !== "1" ||
      selectedSpellDispatch.lastPlayerServerPacketId !== "55" ||
      selectedSpellDispatch.lastPlayerSelectedSpellActionName !== "Cast" ||
      selectedSpellDispatch.lastPlayerSelectedSpellChildId !== "82" ||
      selectedSpellDispatch.lastPlayerSelectedSpellFlags !== "10" ||
      selectedSpellDispatch.lastPlayerSelectedSpellId !== "smoke-rush" ||
      selectedSpellDispatch.lastPlayerSelectedSpellItemId !== "4629" ||
      selectedSpellDispatch.lastPlayerSelectedSpellLabel !== "Smoke Rush" ||
      selectedSpellDispatch.lastPlayerSelectedSpellName !== "<col=00ff00>Smoke Rush<col=ffffff>" ||
      selectedSpellDispatch.lastPlayerSelectedSpellWidgetId !== "14286930" ||
      selectedSpellDispatch.selectedSpellId !== "" ||
      selectedSpellDispatch.lastSpellSelectionClear !== "player-spell-selected" ||
      selectedSpellDispatch.lastPlayerPacketDispatch !== "player-spell-selected" ||
      selectedSpellDispatch.lastTileCommandSource !== ""
    ) {
      throw new Error(`selected-spell player dispatch did not preserve source metadata: ${JSON.stringify(selectedSpellDispatch)}`);
    }
    console.log(JSON.stringify({
      runtimeReadyMessage,
      menu,
      hover,
      closeOutside,
      followDispatch,
      tradeDispatch,
      selectedItemMenu,
      selectedItemDispatch,
      selectedSpellMenu,
      selectedSpellDispatch,
      captureRect,
      screenshotPath
    }, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
