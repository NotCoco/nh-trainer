const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const [, , projectRoot, screenshotPath] = process.argv;

const objectActionOpcodes = [3, 4, 5, 6, 1001];
const objectPacketIdsByOpcode = {
  1: 46,
  2: 68,
  3: 51,
  4: 6,
  5: 42,
  6: 95,
  1001: 50,
  1002: 36
};
const objectServerOptionsByOpcode = {
  3: 1,
  4: 2,
  5: 3,
  6: 4,
  1001: 5,
  1002: 6
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertDatasetSubset(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(`${label} mismatch for ${key}: ${JSON.stringify({ expected, actual })}`);
    }
  }
}

function objectExpectation(object, menuTile = { x: object.x, y: object.y, plane: object.plane }) {
  const actionIndex = object.actions.findIndex((action) => typeof action === "string" && action.trim().length > 0);
  const actionText = object.actions[actionIndex];
  const opcode = objectActionOpcodes[actionIndex];
  return {
    id: object.id,
    name: object.name,
    x: object.x,
    y: object.y,
    plane: object.plane,
    menuTile,
    actionIndex,
    actionText,
    actionKind: "object-action",
    opcode,
    serverPacketId: objectPacketIdsByOpcode[opcode],
    serverOption: objectServerOptionsByOpcode[opcode]
  };
}

async function readExpectedObjects() {
  const objects = JSON.parse(
    await fs.readFile(path.join(projectRoot, "fixtures", "assets", "defs", "arena-objects.json"), "utf8")
  );
  const ditch = objects.find(
    (placement) =>
      placement.id === 23271 &&
      placement.name === "Wilderness Ditch" &&
      placement.x === 3100 &&
      placement.y === 3521 &&
      placement.plane === 0 &&
      placement.actions?.[0] === "Cross"
  );
  if (!ditch) {
    throw new Error("missing expected exported Wilderness Ditch object placement");
  }
  const tree = objects.find(
    (placement) =>
      placement.id === 1278 &&
      placement.name === "Tree" &&
      placement.x === 3098 &&
      placement.y === 3533 &&
      placement.plane === 0 &&
      placement.sizeX === 2 &&
      placement.sizeY === 2 &&
      placement.actions?.[0] === "Chop down"
  );
  if (!tree) {
    throw new Error("missing expected exported 2x2 Tree object placement");
  }
  return {
    ditch: objectExpectation(ditch),
    tree: objectExpectation(tree, { x: tree.x + 1, y: tree.y + 1, plane: tree.plane })
  };
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
      window.dispatchEvent(new CustomEvent("kronos-runtime-camera", { detail: { camera: "isometric" } }));
      window.dispatchEvent(new CustomEvent("kronos-runtime-cycle", { detail: { cycle: 3 } }));
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result;
}

async function openObjectContextMenu(window, object) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const object = ${JSON.stringify(object)};
      try {
        const canvas = document.querySelector(".runtimeViewport canvas");
        if (!canvas) {
          return { ok: false, error: "missing runtime canvas" };
        }
        const rect = canvas.getBoundingClientRect();
        window.dispatchEvent(new CustomEvent("kronos-runtime-context-menu", {
          detail: {
            worldTile: object.menuTile ?? { x: object.x, y: object.y, plane: object.plane },
            x: 260,
            y: 180
          }
        }));

        let menu = document.querySelector(".kronosContextMenu");
        const deadline = Date.now() + 1000;
        while (!menu && Date.now() < deadline) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          menu = document.querySelector(".kronosContextMenu");
        }
        if (!menu) {
          return { ok: false, error: "object context menu did not open" };
        }

        const options = Array.from(menu.querySelectorAll(".kronosContextMenuOption")).map((option) => {
          const glyphs = Array.from(option.querySelectorAll(".kronosContextMenuGlyph"));
          const glyphTops = glyphs.map((glyph) => Number.parseFloat(glyph.style.top || "0"));
          return {
            text: option.textContent ?? "",
            action: option.getAttribute("data-menu-action") ?? "",
            kind: option.getAttribute("data-menu-action-kind") ?? "",
            opcode: Number(option.getAttribute("data-menu-opcode")),
            identifier: Number(option.getAttribute("data-menu-identifier")),
            argument1: Number(option.getAttribute("data-menu-argument1")),
            argument2: Number(option.getAttribute("data-menu-argument2")),
            sourceIndex: option.getAttribute("data-menu-source-index") ?? "",
            top: Number.parseFloat(option.style.top || "0"),
            glyphCount: glyphs.length,
            glyphMinTop: glyphTops.length > 0 ? Math.min(...glyphTops) : null,
            glyphMaxTop: glyphTops.length > 0 ? Math.max(...glyphTops) : null
          };
        });
        const menuRect = menu.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        return {
          ok: true,
          title: menu.querySelector(".kronosContextMenuTitle")?.textContent ?? "",
          options,
          sourceFontId: menu.getAttribute("data-source-font-id") ?? "",
          sourceFontArchive: menu.getAttribute("data-source-font-archive") ?? "",
          sourceGlyphAtlas: menu.getAttribute("data-source-glyph-atlas") ?? "",
          sourceGlyphImage: menu.getAttribute("data-source-glyph-image") ?? "",
          styleHeight: Number.parseFloat(getComputedStyle(menu).height),
          canvasRect: {
            left: canvasRect.left,
            top: canvasRect.top,
            width: canvasRect.width,
            height: canvasRect.height
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
          },
          requestedWorldTile: object.menuTile ?? { x: object.x, y: object.y, plane: object.plane }
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function setRuntimeInventory(window, inventory) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.dispatchEvent(new CustomEvent("kronos-runtime-inventory", {
        detail: { inventory: ${JSON.stringify(inventory)} }
      }));
    })()
  `);
  await delay(150);
}

async function selectInventoryUseOption(window, slotIndex) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const slot = document.querySelector(${JSON.stringify(`.kronosInventorySlot[data-slot-index="${slotIndex}"]`)});
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

      let menu = document.querySelector(".kronosContextMenu");
      const deadline = Date.now() + 1000;
      while (!menu && Date.now() < deadline) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        menu = document.querySelector(".kronosContextMenu");
      }
      if (!menu) {
        return { ok: false, error: "inventory context menu did not open" };
      }
      const option = Array.from(menu.querySelectorAll(".kronosContextMenuOption")).find((candidate) =>
        candidate.getAttribute("data-menu-action") === "Use" &&
        candidate.getAttribute("data-menu-action-kind") === "inventory-use" &&
        Number(candidate.getAttribute("data-menu-opcode")) === 38
      );
      if (!option) {
        return {
          ok: false,
          error: "missing inventory Use option",
          options: Array.from(menu.querySelectorAll(".kronosContextMenuOption")).map((candidate) => ({
            text: candidate.textContent ?? "",
            action: candidate.getAttribute("data-menu-action") ?? "",
            kind: candidate.getAttribute("data-menu-action-kind") ?? "",
            opcode: Number(candidate.getAttribute("data-menu-opcode"))
          }))
        };
      }
      option.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return {
        ok: true,
        dataset: {
          selectedInventoryItemId: viewport?.dataset.selectedInventoryItemId ?? "",
          selectedInventoryItemName: viewport?.dataset.selectedInventoryItemName ?? "",
          selectedInventorySlot: viewport?.dataset.selectedInventorySlot ?? "",
          selectedInventoryWidgetId: viewport?.dataset.selectedInventoryWidgetId ?? "",
          lastInventoryActionKind: viewport?.dataset.lastInventoryActionKind ?? "",
          lastInventoryOpcode: viewport?.dataset.lastInventoryOpcode ?? ""
        }
      };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function clickSideTab(window, tabId) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const tab = document.querySelector(${JSON.stringify(`.kronosSideTabButton[data-tab-id="${tabId}"]`)});
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

async function setRuntimeSpellbook(window, spellbookId) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const spellbookId = ${JSON.stringify(spellbookId)};
      window.dispatchEvent(new CustomEvent("kronos-runtime-spellbook", {
        detail: { spellbookId }
      }));
      const deadline = Date.now() + 1000;
      let layer = document.querySelector(".kronosSpellbookIconLayer");
      while ((!layer || layer.getAttribute("data-book-id") !== spellbookId) && Date.now() < deadline) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        layer = document.querySelector(".kronosSpellbookIconLayer");
      }
      const viewport = document.querySelector(".runtimeViewport");
      if (!layer || layer.getAttribute("data-book-id") !== spellbookId) {
        return {
          ok: false,
          error: "spellbook did not switch",
          activeSpellbookId: viewport?.dataset.activeSpellbookId ?? "",
          bookId: layer?.getAttribute("data-book-id") ?? ""
        };
      }
      return {
        ok: true,
        activeSpellbookId: viewport?.dataset.activeSpellbookId ?? "",
        bookId: layer.getAttribute("data-book-id") ?? "",
        enumId: layer.getAttribute("data-enum-id") ?? "",
        iconCount: document.querySelectorAll(".kronosSpellbookIconSprite").length
      };
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
      const spell = document.querySelector(${JSON.stringify(`.kronosSpellbookIconSprite[data-spell-id="${spellId}"]`)});
      if (!spell) {
        return { ok: false, error: "missing spell" };
      }
      const rect = spell.getBoundingClientRect();
      spell.dispatchEvent(new PointerEvent("pointerdown", {
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

async function clickObjectAction(window, object) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const object = ${JSON.stringify(object)};
      const options = Array.from(document.querySelectorAll(".kronosContextMenuOption"));
      const option = options.find((candidate) =>
        candidate.getAttribute("data-menu-action") === object.actionText &&
        Number(candidate.getAttribute("data-menu-opcode")) === object.opcode &&
        Number(candidate.getAttribute("data-menu-identifier")) === object.id &&
        Number(candidate.getAttribute("data-menu-argument1")) === object.x &&
        Number(candidate.getAttribute("data-menu-argument2")) === object.y
      );
      if (!option) {
        return { ok: false, error: "missing object action menu option" };
      }
      option.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      if (!viewport) {
        return { ok: false, error: "missing runtime viewport" };
      }
      return {
        ok: true,
        menuStillOpen: Boolean(document.querySelector(".kronosContextMenu")),
        dataset: {
          lastTileCommandSource: viewport.dataset.lastTileCommandSource ?? "",
          lastSceneObjectAction: viewport.dataset.lastSceneObjectAction ?? "",
          lastSceneObjectActionKind: viewport.dataset.lastSceneObjectActionKind ?? "",
          lastSceneObjectOpcode: viewport.dataset.lastSceneObjectOpcode ?? "",
          lastSceneObjectServerPacketId: viewport.dataset.lastSceneObjectServerPacketId ?? "",
          lastSceneObjectServerOption: viewport.dataset.lastSceneObjectServerOption ?? "",
          lastSceneObjectId: viewport.dataset.lastSceneObjectId ?? "",
          lastSceneObjectName: viewport.dataset.lastSceneObjectName ?? "",
          lastSceneObjectX: viewport.dataset.lastSceneObjectX ?? "",
          lastSceneObjectY: viewport.dataset.lastSceneObjectY ?? "",
          lastSceneObjectActionIndex: viewport.dataset.lastSceneObjectActionIndex ?? "",
          lastSceneObjectSelectedItemId: viewport.dataset.lastSceneObjectSelectedItemId ?? "",
          lastSceneObjectSelectedSlot: viewport.dataset.lastSceneObjectSelectedSlot ?? "",
          lastSceneObjectSelectedSpellActionName: viewport.dataset.lastSceneObjectSelectedSpellActionName ?? "",
          lastSceneObjectSelectedSpellFlags: viewport.dataset.lastSceneObjectSelectedSpellFlags ?? "",
          lastSceneObjectSelectedSpellId: viewport.dataset.lastSceneObjectSelectedSpellId ?? "",
          lastSceneObjectSelectedSpellName: viewport.dataset.lastSceneObjectSelectedSpellName ?? "",
          lastSceneObjectSelectedSpellWidgetId: viewport.dataset.lastSceneObjectSelectedSpellWidgetId ?? "",
          selectedInventoryItemId: viewport.dataset.selectedInventoryItemId ?? "",
          selectedInventorySlot: viewport.dataset.selectedInventorySlot ?? "",
          selectedSpellId: viewport.dataset.selectedSpellId ?? "",
          lastSpellSelectionClear: viewport.dataset.lastSpellSelectionClear ?? ""
        }
      };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function readRuntimeClickCross(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const cross = document.querySelector(".kronosClickCross");
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
        width: Number.parseInt(style.width, 10),
        height: Number.parseInt(style.height, 10),
        backgroundImage: style.backgroundImage,
        backgroundPosition: style.backgroundPosition
      };
    })()
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
    const objects = await readExpectedObjects();
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    const runtimeReadyMessage = await waitForReady(
      window,
      'section[aria-labelledby="runtime-scene"]',
      "runtime scene"
    );
    await focusRuntimeSectionForCapture(window);
    await delay(300);
    const menu = await openObjectContextMenu(window, objects.ditch);
    const expectedOptions = [
      `${objects.ditch.actionText} ${objects.ditch.name}`,
      "Walk here",
      `Examine ${objects.ditch.name}`
    ];
    const actualOptions = menu.options.map((option) => option.text);
    if (JSON.stringify(actualOptions) !== JSON.stringify(expectedOptions)) {
      throw new Error(`unexpected object menu options: ${JSON.stringify(menu.options)}`);
    }
    const actionOption = menu.options[0];
    if (
      actionOption.action !== objects.ditch.actionText ||
      actionOption.kind !== objects.ditch.actionKind ||
      actionOption.opcode !== objects.ditch.opcode ||
      actionOption.identifier !== objects.ditch.id ||
      actionOption.argument1 !== objects.ditch.x ||
      actionOption.argument2 !== objects.ditch.y
    ) {
      throw new Error(`object action option did not expose source metadata: ${JSON.stringify(actionOption)}`);
    }
    const examineOption = menu.options.find((option) => option.action === "Examine");
    if (!examineOption || examineOption.opcode !== 1002 || examineOption.identifier !== objects.ditch.id) {
      throw new Error(`object examine option did not expose source metadata: ${JSON.stringify(menu.options)}`);
    }
    if (menu.styleHeight !== menu.options.length * 15 + 22) {
      throw new Error(`unexpected source menu height: ${JSON.stringify(menu)}`);
    }
    if (menu.sourceFontId !== "496" || menu.sourceFontArchive !== "b12_full") {
      throw new Error(`object context menu did not expose exported bold12 font metrics: ${JSON.stringify(menu)}`);
    }
    if (menu.sourceGlyphAtlas !== "context_menu_font" || menu.sourceGlyphImage !== "context_menu_font.png") {
      throw new Error(`object context menu did not expose exported bold12 glyph sheet: ${JSON.stringify(menu)}`);
    }
    if (!menu.options.every((option) => option.glyphCount > 0)) {
      throw new Error(`object context menu text did not render from glyph spans: ${JSON.stringify(menu)}`);
    }
    if (!menu.options.every((option) => option.glyphMinTop >= -2 && option.glyphMaxTop < 15)) {
      throw new Error(`object context menu option glyphs should stay inside their source rows: ${JSON.stringify(menu.options)}`);
    }
    for (let index = 0; index < menu.options.length; index += 1) {
      const expectedTop = 22 + index * 15;
      if (menu.options[index].top !== expectedTop) {
        throw new Error(`unexpected option top at ${index}: ${JSON.stringify(menu.options[index])}`);
      }
    }
    await delay(150);

    const captureRect = {
      x: Math.max(0, Math.trunc(menu.canvasRect.left - 24)),
      y: Math.max(0, Math.trunc(menu.canvasRect.top - 24)),
      width: Math.min(Math.trunc(menu.viewport.width), Math.trunc(menu.canvasRect.width + 48)),
      height: Math.min(720, Math.trunc(menu.canvasRect.height + 96))
    };
    const screenshot = await window.webContents.capturePage(captureRect);
    await fs.writeFile(screenshotPath, screenshot.toPNG());

    const click = await clickObjectAction(window, objects.ditch);
    assertDatasetSubset(click.dataset, {
      lastTileCommandSource: "context-menu",
      lastSceneObjectAction: objects.ditch.actionText,
      lastSceneObjectActionKind: objects.ditch.actionKind,
      lastSceneObjectOpcode: String(objects.ditch.opcode),
      lastSceneObjectServerPacketId: String(objects.ditch.serverPacketId),
      lastSceneObjectServerOption: String(objects.ditch.serverOption),
      lastSceneObjectId: String(objects.ditch.id),
      lastSceneObjectName: objects.ditch.name,
      lastSceneObjectX: String(objects.ditch.x),
      lastSceneObjectY: String(objects.ditch.y),
      lastSceneObjectActionIndex: String(objects.ditch.actionIndex)
    }, "ditch object action click metadata");
    if (click.menuStillOpen) {
      throw new Error(`object context menu should close after action click: ${JSON.stringify(click)}`);
    }
    const actionClickCross = await readRuntimeClickCross(window);
    if (
      !actionClickCross ||
      actionClickCross.color !== "red" ||
      actionClickCross.sourceMouseCrossColor !== 2 ||
      actionClickCross.sourceFrame !== actionClickCross.frame ||
      actionClickCross.sourceSpriteId !== 519 + actionClickCross.sourceFrame ||
      actionClickCross.sourceDrawOffset !== 8 ||
      actionClickCross.width !== actionClickCross.sourceSpriteWidth ||
      actionClickCross.height !== actionClickCross.sourceSpriteHeight ||
      actionClickCross.sourceSpriteOffsetX === null ||
      actionClickCross.sourceSpriteOffsetY === null ||
      !actionClickCross.backgroundImage.includes("click_cross.png")
    ) {
      throw new Error(`Object context action should render the source red action click cross: ${JSON.stringify(actionClickCross)}`);
    }

    const treeMenu = await openObjectContextMenu(window, objects.tree);
    const expectedTreeOptions = [
      `${objects.tree.actionText} ${objects.tree.name}`,
      "Walk here",
      `Examine ${objects.tree.name}`
    ];
    if (JSON.stringify(treeMenu.options.map((option) => option.text)) !== JSON.stringify(expectedTreeOptions)) {
      throw new Error(`unexpected footprint tree menu options: ${JSON.stringify(treeMenu.options)}`);
    }
    if (JSON.stringify(treeMenu.requestedWorldTile) !== JSON.stringify(objects.tree.menuTile)) {
      throw new Error(`object context menu did not use the requested footprint tile: ${JSON.stringify(treeMenu)}`);
    }
    const treeClick = await clickObjectAction(window, objects.tree);
    assertDatasetSubset(treeClick.dataset, {
      lastTileCommandSource: "context-menu",
      lastSceneObjectAction: objects.tree.actionText,
      lastSceneObjectActionKind: objects.tree.actionKind,
      lastSceneObjectOpcode: String(objects.tree.opcode),
      lastSceneObjectServerPacketId: String(objects.tree.serverPacketId),
      lastSceneObjectServerOption: String(objects.tree.serverOption),
      lastSceneObjectId: String(objects.tree.id),
      lastSceneObjectName: objects.tree.name,
      lastSceneObjectX: String(objects.tree.x),
      lastSceneObjectY: String(objects.tree.y),
      lastSceneObjectActionIndex: String(objects.tree.actionIndex)
    }, "tree footprint object action click metadata");

    await setRuntimeInventory(window, [{ itemId: 11785, quantity: 1 }, { itemId: 385, quantity: 1 }]);
    const selectedItem = await selectInventoryUseOption(window, 0);
    assertDatasetSubset(selectedItem, {
      selectedInventoryItemId: "11785",
      selectedInventoryItemName: "Armadyl crossbow",
      selectedInventorySlot: "0",
      selectedInventoryWidgetId: "9764864",
      lastInventoryActionKind: "inventory-use",
      lastInventoryOpcode: "38"
    }, "inventory Use selection before object target");
    const selectedItemTree = {
      ...objects.tree,
      actionText: "Use",
      actionKind: "object-use-selected",
      opcode: 1,
      serverPacketId: objectPacketIdsByOpcode[1],
      serverOption: null
    };
    const selectedItemTreeMenu = await openObjectContextMenu(window, selectedItemTree);
    const selectedItemTreeOptions = selectedItemTreeMenu.options.map((option) => option.text);
    if (JSON.stringify(selectedItemTreeOptions) !== JSON.stringify(["Use Armadyl crossbow -> Tree"])) {
      throw new Error(`selected item should replace real object actions: ${JSON.stringify(selectedItemTreeMenu.options)}`);
    }
    const selectedItemTreeClick = await clickObjectAction(window, selectedItemTree);
    assertDatasetSubset(selectedItemTreeClick.dataset, {
      lastTileCommandSource: "context-menu",
      lastSceneObjectAction: "Use",
      lastSceneObjectActionKind: "object-use-selected",
      lastSceneObjectOpcode: "1",
      lastSceneObjectServerPacketId: "46",
      lastSceneObjectServerOption: "",
      lastSceneObjectId: String(objects.tree.id),
      lastSceneObjectName: objects.tree.name,
      lastSceneObjectX: String(objects.tree.x),
      lastSceneObjectY: String(objects.tree.y),
      lastSceneObjectActionIndex: "",
      lastSceneObjectSelectedItemId: "11785",
      lastSceneObjectSelectedSlot: "0",
      selectedInventoryItemId: "",
      selectedInventorySlot: ""
    }, "selected item real-object click metadata");

    await clickSideTab(window, "magic");
    const spellSelection = await clickSpell(window, "smoke-rush");
    assertDatasetSubset(spellSelection, {
      selectedSpellActionName: "Cast",
      selectedSpellFlags: "10",
      selectedSpellId: "smoke-rush",
      selectedSpellWidgetId: "14286930",
      selectedSpellChildId: "82"
    }, "Smoke Rush selected-spell state before object menu");
    if ((Number(spellSelection.selectedSpellFlags) & 4) === 4) {
      throw new Error(`Smoke Rush unexpectedly exposed the object-target flag: ${JSON.stringify(spellSelection)}`);
    }

    const nonObjectSpellTreeMenu = await openObjectContextMenu(window, objects.tree);
    const nonObjectSpellTreeOptions = nonObjectSpellTreeMenu.options.map((option) => option.text);
    if (JSON.stringify(nonObjectSpellTreeOptions) !== JSON.stringify(expectedTreeOptions)) {
      throw new Error(`non-object-target spell should not replace real object actions: ${JSON.stringify(nonObjectSpellTreeMenu.options)}`);
    }
    const nonObjectSpellTreeAction = nonObjectSpellTreeMenu.options[0];
    if (
      nonObjectSpellTreeAction.action !== objects.tree.actionText ||
      nonObjectSpellTreeAction.kind !== "object-action" ||
      nonObjectSpellTreeAction.opcode !== objects.tree.opcode
    ) {
      throw new Error(`non-object-target spell object row should stay on source object action metadata: ${JSON.stringify(nonObjectSpellTreeAction)}`);
    }
    const nonObjectSpellTreeClick = await clickObjectAction(window, objects.tree);
    assertDatasetSubset(nonObjectSpellTreeClick.dataset, {
      lastTileCommandSource: "context-menu",
      lastSceneObjectAction: objects.tree.actionText,
      lastSceneObjectActionKind: objects.tree.actionKind,
      lastSceneObjectOpcode: String(objects.tree.opcode),
      lastSceneObjectServerPacketId: String(objects.tree.serverPacketId),
      lastSceneObjectServerOption: String(objects.tree.serverOption),
      lastSceneObjectId: String(objects.tree.id),
      lastSceneObjectName: objects.tree.name,
      lastSceneObjectSelectedSpellActionName: "",
      lastSceneObjectSelectedSpellFlags: "",
      lastSceneObjectSelectedSpellId: "",
      selectedSpellId: "",
      lastSpellSelectionClear: "tile-command"
    }, "non-object-target spell object action click metadata");

    const standardSpellbook = await setRuntimeSpellbook(window, "standard");
    if (
      standardSpellbook.bookId !== "standard" ||
      standardSpellbook.enumId !== "1982" ||
      standardSpellbook.iconCount !== 70
    ) {
      throw new Error(`standard spellbook did not expose source enum 1982 icons: ${JSON.stringify(standardSpellbook)}`);
    }
    const objectSpellSelection = await clickSpell(window, "charge-water-orb");
    assertDatasetSubset(objectSpellSelection, {
      selectedSpellActionName: "Cast",
      selectedSpellFlags: "4",
      selectedSpellId: "charge-water-orb",
      selectedSpellWidgetId: "14286887",
      selectedSpellChildId: "39"
    }, "Charge Water Orb object-target selected-spell state before object menu");
    if ((Number(objectSpellSelection.selectedSpellFlags) & 4) !== 4) {
      throw new Error(`Charge Water Orb did not expose the object-target flag: ${JSON.stringify(objectSpellSelection)}`);
    }
    const objectSpellTree = {
      ...objects.tree,
      actionText: "Cast",
      actionKind: "object-spell-selected",
      opcode: 2,
      serverPacketId: objectPacketIdsByOpcode[2],
      serverOption: null
    };
    const objectSpellTreeMenu = await openObjectContextMenu(window, objectSpellTree);
    const objectSpellTreeOptions = objectSpellTreeMenu.options.map((option) => option.text);
    if (JSON.stringify(objectSpellTreeOptions) !== JSON.stringify(["Cast Charge Water Orb -> Tree"])) {
      throw new Error(`object-target spell should replace real object actions: ${JSON.stringify(objectSpellTreeMenu.options)}`);
    }
    const objectSpellTreeClick = await clickObjectAction(window, objectSpellTree);
    assertDatasetSubset(objectSpellTreeClick.dataset, {
      lastTileCommandSource: "context-menu",
      lastSceneObjectAction: "Cast",
      lastSceneObjectActionKind: "object-spell-selected",
      lastSceneObjectOpcode: "2",
      lastSceneObjectServerPacketId: "68",
      lastSceneObjectServerOption: "",
      lastSceneObjectId: String(objects.tree.id),
      lastSceneObjectName: objects.tree.name,
      lastSceneObjectX: String(objects.tree.x),
      lastSceneObjectY: String(objects.tree.y),
      lastSceneObjectActionIndex: "",
      lastSceneObjectSelectedSpellActionName: "Cast",
      lastSceneObjectSelectedSpellFlags: "4",
      lastSceneObjectSelectedSpellId: "charge-water-orb",
      lastSceneObjectSelectedSpellName: "<col=00ff00>Charge Water Orb<col=ffffff>",
      lastSceneObjectSelectedSpellWidgetId: "14286887",
      selectedSpellId: "",
      lastSpellSelectionClear: "tile-command"
    }, "object-target spell real-object click metadata");

    console.log(
      JSON.stringify(
        {
          runtimeReadyMessage,
          objects,
          menu,
          click,
          treeMenu,
          treeClick,
          selectedItem,
          selectedItemTreeMenu,
          selectedItemTreeClick,
          spellSelection,
          nonObjectSpellTreeMenu,
          nonObjectSpellTreeClick,
          standardSpellbook,
          objectSpellSelection,
          objectSpellTreeMenu,
          objectSpellTreeClick,
          captureRect,
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
