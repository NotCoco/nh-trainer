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
  return result;
}

async function openContextMenu(window) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      try {
        const canvas = document.querySelector(".runtimeViewport canvas");
        if (!canvas) {
          return { ok: false, error: "missing runtime canvas" };
        }
        const rect = canvas.getBoundingClientRect();
        const reactPropKey = Object.keys(canvas).find((key) => key.startsWith("__reactProps$"));
        const reactProps = reactPropKey ? canvas[reactPropKey] : null;
        if (!reactProps?.onPointerDown) {
          return { ok: false, error: "missing canvas React pointer handler", reactPropKey: reactPropKey ?? "" };
        }
        reactProps.onPointerDown({
          button: 2,
          nativeEvent: {
            clientX: rect.left + 260,
            clientY: rect.top + 180,
            target: canvas,
            shiftKey: false
          },
          preventDefault() {},
          stopPropagation() {},
          currentTarget: canvas
        });
        let menu = document.querySelector(".nhContextMenu");
        const deadline = Date.now() + 1000;
        while (!menu && Date.now() < deadline) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          menu = document.querySelector(".nhContextMenu");
        }
        if (!menu) {
          return { ok: false, error: "context menu did not open", canvasRect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
          }, reactPropKey: reactPropKey ?? "", reactProps: Object.keys(reactProps ?? {}) };
        }
        const menuRect = menu.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const title = menu.querySelector(".nhContextMenuTitle")?.textContent ?? "";
        const titleGlyphs = Array.from(menu.querySelectorAll(".nhContextMenuTitle .nhContextMenuGlyph"));
        const options = Array.from(menu.querySelectorAll(".nhContextMenuOption")).map((option) => {
          const optionRect = option.getBoundingClientRect();
          const glyphs = Array.from(option.querySelectorAll(".nhContextMenuGlyph"));
          return {
            text: option.textContent ?? "",
            top: Number.parseFloat(option.style.top || "0"),
            height: optionRect.height,
            glyphCount: glyphs.length
          };
        });
        const firstGlyph = menu.querySelector(".nhContextMenuGlyph");
        const firstGlyphStyle = firstGlyph ? getComputedStyle(firstGlyph) : null;
        const inventorySprites = Array.from(document.querySelectorAll(".nhInventoryItemSprite")).map((sprite) => {
          const style = getComputedStyle(sprite);
          return {
            label: sprite.getAttribute("aria-label") ?? "",
            backgroundImage: style.backgroundImage,
            width: sprite.getBoundingClientRect().width,
            height: sprite.getBoundingClientRect().height
          };
        });
        return {
          ok: true,
          title,
          options,
          titleGlyphCount: titleGlyphs.length,
          firstGlyphMaskImage: firstGlyphStyle?.webkitMaskImage || firstGlyphStyle?.maskImage || "",
          inventorySprites,
          sourceFontId: menu.getAttribute("data-source-font-id") ?? "",
          sourceFontArchive: menu.getAttribute("data-source-font-archive") ?? "",
          sourceGlyphAtlas: menu.getAttribute("data-source-glyph-atlas") ?? "",
          sourceGlyphImage: menu.getAttribute("data-source-glyph-image") ?? "",
          menuWidth: menuRect.width,
          menuHeight: menuRect.height,
          styleWidth: Number.parseFloat(getComputedStyle(menu).width),
          styleHeight: Number.parseFloat(getComputedStyle(menu).height),
          scrollY: window.scrollY,
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
          }
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
    await focusRuntimeSectionForCapture(window);
    await delay(1000);
    const menu = await openContextMenu(window);
    if (menu.title !== "Choose Option") {
      throw new Error(`unexpected context menu title: ${menu.title}`);
    }
    if (!menu.options.some((option) => option.text === "Walk here")) {
      throw new Error(`missing Walk here option: ${JSON.stringify(menu.options)}`);
    }
    if (menu.styleHeight !== menu.options.length * 15 + 22) {
      throw new Error(`unexpected source menu height: ${JSON.stringify(menu)}`);
    }
    if (menu.sourceFontId !== "496" || menu.sourceFontArchive !== "b12_full") {
      throw new Error(`context menu did not expose exported bold12 font metrics: ${JSON.stringify(menu)}`);
    }
    if (menu.sourceGlyphAtlas !== "context_menu_font" || menu.sourceGlyphImage !== "context_menu_font.png") {
      throw new Error(`context menu did not expose exported bold12 glyph sheet: ${JSON.stringify(menu)}`);
    }
    if (menu.titleGlyphCount <= 0 || !menu.options.every((option) => option.glyphCount > 0)) {
      throw new Error(`context menu text did not render from glyph spans: ${JSON.stringify(menu)}`);
    }
    if (!menu.firstGlyphMaskImage.includes("context_menu_font.png")) {
      throw new Error(`context menu glyph did not use context_menu_font mask image: ${JSON.stringify(menu)}`);
    }
    if (menu.inventorySprites.length !== 28) {
      throw new Error(`expected 28 inventory item sprites: ${JSON.stringify(menu.inventorySprites)}`);
    }
    if (!menu.inventorySprites.every((sprite) => sprite.backgroundImage.includes("item_sprites.png"))) {
      throw new Error(`inventory sprites did not use item_sprites atlas: ${JSON.stringify(menu.inventorySprites)}`);
    }
    for (let index = 0; index < menu.options.length; index += 1) {
      const expectedTop = 22 + index * 15;
      if (menu.options[index].top !== expectedTop) {
        throw new Error(`unexpected option top at ${index}: ${JSON.stringify(menu.options[index])}`);
      }
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
    console.log(JSON.stringify({ runtimeReadyMessage, menu, captureRect, screenshotPath }, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
