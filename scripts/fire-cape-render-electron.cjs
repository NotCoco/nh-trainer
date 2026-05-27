const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const [, , projectRoot, screenshotPath] = process.argv;
const screenshotDir = path.dirname(screenshotPath);

app.setPath("userData", path.join(screenshotDir, `electron-fire-cape-${process.pid}`));

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(window) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const status = await window.webContents.executeJavaScript(`
      (() => {
        const root = document.querySelector('section[aria-labelledby="runtime-scene"]');
        const ready = root?.querySelector(".glbStatus-ready");
        const error = root?.querySelector(".glbStatus-error, .glbStatus-missing");
        return { ready: ready?.textContent ?? "", error: error?.textContent ?? "" };
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

async function selectRuntimeReplay(window, replayId) {
  await window.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector("#runtime-replay");
      if (!input) {
        throw new Error("missing runtime replay selector");
      }
      input.value = ${JSON.stringify(replayId)};
      input.dispatchEvent(new Event("change", { bubbles: true }));
    })()
  `);
}

async function setRuntimeCamera(window, camera) {
  await window.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector("#runtime-camera");
      if (input) {
        input.value = ${JSON.stringify(camera)};
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      window.dispatchEvent(new CustomEvent("nh-runtime-camera", {
        detail: { camera: ${JSON.stringify(camera)} }
      }));
    })()
  `);
}

async function setRuntimeCycle(window, cycle) {
  await window.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector("#runtime-cycle");
      if (input) {
        input.value = ${JSON.stringify(String(cycle))};
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      window.dispatchEvent(new CustomEvent("nh-runtime-cycle", {
        detail: { cycle: ${JSON.stringify(cycle)} }
      }));
    })()
  `);
}

async function waitForPaint(window) {
  await window.webContents.executeJavaScript(`
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  `);
}

async function zoomRuntimeCanvas(window, steps) {
  await window.webContents.executeJavaScript(`
    (() => {
      const canvas = document.querySelector(".runtimeViewport canvas");
      if (!canvas) {
        throw new Error("missing runtime canvas");
      }
      for (let index = 0; index < ${JSON.stringify(steps)}; index += 1) {
        canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 }));
      }
    })()
  `);
}

function screenshotPathForView(basePath, viewName) {
  const parsed = path.parse(basePath);
  return path.join(parsed.dir, `${parsed.name}-${viewName}${parsed.ext || ".png"}`);
}

async function readCanvasStats(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const canvas = document.querySelector(".runtimeViewport canvas");
      if (!canvas) {
        return { ok: false, reason: "missing canvas" };
      }
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) {
        return { ok: false, reason: "missing WebGL context" };
      }
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let nonBackground = 0;
      let fireCapeLike = 0;
      let flatWhiteCapeLike = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        const a = pixels[index + 3];
        if (a > 0 && Math.abs(r - 16) + Math.abs(g - 20) + Math.abs(b - 24) > 12) {
          nonBackground += 1;
        }
        if (a > 0 && r >= 145 && g >= 45 && g <= 145 && b <= 90 && r > g + 35) {
          fireCapeLike += 1;
        }
        if (a > 0 && r >= 210 && g >= 210 && b >= 210) {
          flatWhiteCapeLike += 1;
        }
      }
      return {
        ok: nonBackground > 500 && fireCapeLike > 8,
        width,
        height,
        nonBackground,
        fireCapeLike,
        flatWhiteCapeLike,
        texture40Requested: performance
          .getEntriesByType("resource")
          .some((entry) => String(entry.name).includes("texture_40.png"))
      };
    })()
  `);
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    await fs.mkdir(screenshotDir, { recursive: true });
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    const runtimeReadyMessage = await waitForReady(window);
    await selectRuntimeReplay(window, "generated-nh-inventory-switch-v1");
    const views = [];
    for (const view of [
      { name: "isometric-cycle8", camera: "isometric", cycle: 8, zoomSteps: 30, expectFireCapePixels: true },
      { name: "north-cycle8", camera: "north", cycle: 8, zoomSteps: 0, expectFireCapePixels: true },
      { name: "south-cycle8-depth-occluded", camera: "south", cycle: 8, zoomSteps: 0, expectFireCapePixels: false }
    ]) {
      await setRuntimeCamera(window, view.camera);
      await setRuntimeCycle(window, view.cycle);
      if (view.zoomSteps > 0) {
        await zoomRuntimeCanvas(window, view.zoomSteps);
      }
      await delay(350);
      await waitForPaint(window);
      const canvasStats = await readCanvasStats(window);
      const viewScreenshotPath = views.length === 0 ? screenshotPath : screenshotPathForView(screenshotPath, view.name);
      const screenshot = await window.capturePage();
      await fs.writeFile(viewScreenshotPath, screenshot.toPNG());
      if (view.expectFireCapePixels && !canvasStats.ok) {
        throw new Error(`Fire cape canvas check failed for ${view.name}: ${JSON.stringify(canvasStats)}`);
      }
      if (!view.expectFireCapePixels && canvasStats.nonBackground <= 500) {
        throw new Error(`Fire cape occlusion view did not render the scene for ${view.name}: ${JSON.stringify(canvasStats)}`);
      }
      views.push({ ...view, screenshotPath: viewScreenshotPath, canvasStats });
    }
    console.log(JSON.stringify({ ok: true, runtimeReadyMessage, screenshotPath, canvasStats: views[0].canvasStats, views }, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
