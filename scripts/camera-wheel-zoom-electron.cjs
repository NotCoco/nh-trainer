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
        document.querySelector('canvas[aria-label="Two actor runtime arena scene"]')
      ))()
    `);
    if (ready) {
      return;
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the trainer runtime canvas.");
}

async function exerciseWheelZoom(window) {
  return window.webContents.executeJavaScript(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const canvas = document.querySelector('canvas[aria-label="Two actor runtime arena scene"]');
      if (!canvas) {
        return { ok: false, error: "missing runtime canvas" };
      }

      const wheel = async (deltaY, repeats = 1) => {
        for (let i = 0; i < repeats; i += 1) {
          canvas.dispatchEvent(new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY
          }));
          await nextFrame();
        }
        await nextFrame();
        return {
          lastRotation: canvas.dataset.lastCameraWheelRotation ?? "",
          zoomHeight: Number(canvas.dataset.cameraZoomHeight),
          zoomWidth: Number(canvas.dataset.cameraZoomWidth)
        };
      };

      const afterScrollUp = await wheel(-100);
      const afterScrollDown = await wheel(100);
      const afterOuterClamp = await wheel(-100, 40);
      const afterInnerClamp = await wheel(100, 40);

      return {
        ok: true,
        afterScrollUp,
        afterScrollDown,
        afterOuterClamp,
        afterInnerClamp
      };
    })()
  `);
}

function assertWheelState(label, state, expected) {
  const mismatches = [];
  for (const [key, value] of Object.entries(expected)) {
    if (state?.[key] !== value) {
      mismatches.push(`${key}: expected ${value}, got ${state?.[key]}`);
    }
  }
  if (mismatches.length > 0) {
    throw new Error(`${label} mismatch: ${mismatches.join(", ")}\n${JSON.stringify(state, null, 2)}`);
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
      partition: `camera-wheel-zoom-${Date.now()}`
    }
  });

  try {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    await waitForReady(window);
    const state = await exerciseWheelZoom(window);
    if (!state.ok) {
      throw new Error(JSON.stringify(state));
    }
    assertWheelState("scroll up zooms in", state.afterScrollUp, {
      lastRotation: "1",
      zoomHeight: 487,
      zoomWidth: 487
    });
    assertWheelState("scroll down zooms out", state.afterScrollDown, {
      lastRotation: "-1",
      zoomHeight: 512,
      zoomWidth: 512
    });
    assertWheelState("scroll up zoom clamps at Kronos outer limit", state.afterOuterClamp, {
      lastRotation: "1",
      zoomHeight: 128,
      zoomWidth: 128
    });
    assertWheelState("scroll down zoom clamps at Kronos inner limit", state.afterInnerClamp, {
      lastRotation: "-1",
      zoomHeight: 896,
      zoomWidth: 896
    });
    console.log(JSON.stringify(state, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
