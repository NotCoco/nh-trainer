const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const projectRoot = process.argv[2];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForReady(window, selector, label) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const ready = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`
    );
    if (ready) {
      return;
    }
    await delay(250);
  }
  throw new Error(`timed out waiting for ${label}`);
}

// Source: MouseHandler.copy$mousePressed stores MouseHandler_lastButton and
// MouseHandler_lastPressedX/Y, and Client.method1661 opens the menu from those
// pressed coordinates. copy$mouseReleased only clears MouseHandler_currentButton,
// so a release must never open a menu of its own. Browsers deliver the fallback
// contextmenu on the release (Windows) or on the press (macOS/Linux), and some
// input paths expose the secondary button through mouse events only, so every
// delivery order below has to end up with exactly one press-anchored menu.
const helpers = `
  window.__nhPressOpen = {
    canvas: () => document.querySelector('canvas[aria-label="Two actor runtime arena scene"]'),
    menu: () => document.querySelector(".runtimeViewport .nhContextMenu"),
    point: () => {
      const rect = window.__nhPressOpen.canvas().getBoundingClientRect();
      return {
        clientX: Math.round(rect.left + rect.width * 0.45),
        clientY: Math.round(rect.top + rect.height * 0.55)
      };
    },
    state: () => {
      const viewport = document.querySelector(".runtimeViewport");
      const menu = window.__nhPressOpen.menu();
      return {
        open: Boolean(menu),
        options: menu ? menu.querySelectorAll(".nhContextMenuOption").length : 0,
        pressedAtMs: viewport ? viewport.dataset.lastContextMenuPressedAtMs ?? "" : "",
        openDelayMs: viewport ? viewport.dataset.lastContextMenuOpenDelayMs ?? "" : ""
      };
    },
    pointerdown: (button) => {
      const point = window.__nhPressOpen.point();
      window.__nhPressOpen.canvas().dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, cancelable: true, view: window, pointerId: 71, pointerType: "mouse",
        isPrimary: true, button, buttons: button === 2 ? 2 : 1, ...point
      }));
    },
    mousedown: (button) => {
      const point = window.__nhPressOpen.point();
      window.__nhPressOpen.canvas().dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true, cancelable: true, view: window, button, buttons: button === 2 ? 2 : 1, ...point
      }));
    },
    release: (point) => {
      const at = point ?? window.__nhPressOpen.point();
      const canvas = window.__nhPressOpen.canvas();
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true, cancelable: true, view: window, pointerId: 71, pointerType: "mouse",
        isPrimary: true, button: 2, buttons: 0, ...at
      }));
      canvas.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true, cancelable: true, view: window, button: 2, buttons: 0, ...at
      }));
      const under = document.elementFromPoint(at.clientX, at.clientY);
      const target = under && under.closest(".nhContextMenu") ? under : canvas;
      target.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, view: window, button: 2, buttons: 0, ...at
      }));
    },
    contextmenu: () => {
      const point = window.__nhPressOpen.point();
      window.__nhPressOpen.canvas().dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, view: window, button: 2, buttons: 0, ...point
      }));
    },
    driftAbove: (pixels) => {
      const point = window.__nhPressOpen.point();
      const moved = { clientX: point.clientX, clientY: point.clientY - pixels };
      window.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, cancelable: true, view: window, pointerId: 71, pointerType: "mouse",
        isPrimary: true, button: -1, buttons: 2, ...moved
      }));
      window.__nhPressOpen.drifted = moved;
    },
    releaseAtDrift: () => window.__nhPressOpen.release(window.__nhPressOpen.drifted),
    closeMenu: () => {
      const point = window.__nhPressOpen.point();
      window.__nhPressOpen.canvas().dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, cancelable: true, view: window, pointerId: 72, pointerType: "mouse",
        isPrimary: true, button: 0, buttons: 1, ...point
      }));
    }
  };
  "ready";
`;

const failures = [];

function check(name, passed, detail) {
  if (!passed) {
    failures.push(`${name}: ${JSON.stringify(detail)}`);
  }
  process.stdout.write(`${passed ? "pass" : "FAIL"}  ${name} ${JSON.stringify(detail)}\n`);
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

  const run = (script) => window.webContents.executeJavaScript(script);

  try {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    await waitForReady(window, 'section[aria-labelledby="runtime-scene"]', "runtime scene");
    await waitForReady(window, 'canvas[aria-label="Two actor runtime arena scene"]', "scene canvas");
    await delay(1500);
    await run(helpers);

    // The press opens the menu, exactly like MouseHandler_lastButton == 2 does.
    await run(`window.__nhPressOpen.pointerdown(2); "ok"`);
    await delay(80);
    const afterPress = await run(`window.__nhPressOpen.state()`);
    check("press opens the menu", afterPress.open && afterPress.options > 0, afterPress);

    // Holding the button and releasing must not build a second menu.
    await delay(400);
    await run(`window.__nhPressOpen.release(); "ok"`);
    await delay(120);
    const afterRelease = await run(`window.__nhPressOpen.state()`);
    check(
      "held release does not reopen the menu",
      afterRelease.open && afterRelease.openDelayMs === afterPress.openDelayMs,
      { afterPress, afterRelease }
    );

    // Drifting past the source 10px margin closes the menu, and the release that
    // follows must stay silent instead of opening the menu the press already had.
    await run(`window.__nhPressOpen.closeMenu(); "ok"`);
    await delay(120);
    await run(`window.__nhPressOpen.pointerdown(2); "ok"`);
    await delay(80);
    const driftPress = await run(`window.__nhPressOpen.state()`);
    await run(`window.__nhPressOpen.driftAbove(60); "ok"`);
    await delay(120);
    const driftClosed = await run(`window.__nhPressOpen.state()`);
    check(
      "drifting off the menu closes it",
      driftPress.open && !driftClosed.open,
      { driftPress, driftClosed }
    );
    await delay(400);
    await run(`window.__nhPressOpen.releaseAtDrift(); "ok"`);
    await delay(150);
    const driftRelease = await run(`window.__nhPressOpen.state()`);
    check("release after drift opens nothing", !driftRelease.open, { driftClosed, driftRelease });

    // Input paths that only report the secondary button through mouse events.
    await run(`window.__nhPressOpen.closeMenu(); "ok"`);
    await delay(120);
    await run(`window.__nhPressOpen.mousedown(2); "ok"`);
    await delay(120);
    const mouseOnlyPress = await run(`window.__nhPressOpen.state()`);
    check("mousedown press opens the menu", mouseOnlyPress.open && mouseOnlyPress.options > 0, mouseOnlyPress);

    // Input paths that report neither, leaving the browser contextmenu fallback.
    await run(`window.__nhPressOpen.release(); window.__nhPressOpen.closeMenu(); "ok"`);
    await delay(150);
    await run(`window.__nhPressOpen.contextmenu(); "ok"`);
    await delay(120);
    const fallback = await run(`window.__nhPressOpen.state()`);
    check("contextmenu fallback opens the menu", fallback.open && fallback.options > 0, fallback);

    // A later press still opens its own menu after all of the above.
    await run(`window.__nhPressOpen.closeMenu(); "ok"`);
    await delay(150);
    await run(`window.__nhPressOpen.pointerdown(2); "ok"`);
    await delay(120);
    const secondPress = await run(`window.__nhPressOpen.state()`);
    check("later press opens the menu", secondPress.open && secondPress.options > 0, secondPress);

    if (failures.length > 0) {
      process.stderr.write(`${failures.join("\n")}\n`);
      app.exit(1);
      return;
    }

    process.stdout.write("context menu press-open parity verified\n");
    app.exit(0);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    app.exit(2);
  }
});
