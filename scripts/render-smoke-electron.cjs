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

async function readCanvasPixels(window, canvasSelector) {
  return window.webContents.executeJavaScript(`
    (() => {
      const canvas = document.querySelector(${JSON.stringify(canvasSelector)});
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
      let opaque = 0;
      for (let i = 0; i < pixels.length; i += 16) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];
        if (a > 0) {
          opaque += 1;
        }
        if (Math.abs(r - 16) + Math.abs(g - 20) + Math.abs(b - 24) > 12) {
          nonBackground += 1;
        }
      }

      return {
        ok: nonBackground > 100,
        width,
        height,
        sampledPixels: Math.floor(pixels.length / 16),
        opaque,
        nonBackground
      };
    })()
    `);
}

async function waitForAnimationFrames(window, frameCount) {
  await window.webContents.executeJavaScript(`
    new Promise((resolve) => {
      let remaining = ${JSON.stringify(frameCount)};
      const tick = () => {
        remaining -= 1;
        if (remaining <= 0) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })
  `);
}

async function waitForNonblankCanvas(window, canvasSelector, label) {
  const deadline = Date.now() + 10000;
  let lastStats = null;

  while (Date.now() < deadline) {
    await waitForAnimationFrames(window, 2);
    const stats = await readCanvasPixels(window, canvasSelector);
    if (stats.ok) {
      return stats;
    }

    lastStats = stats;
    await delay(250);
  }

  throw new Error(`${label} did not render nonblank pixels: ${JSON.stringify(lastStats)}`);
}

async function readRuntimeStatusPlacement(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const section = document.querySelector('section[aria-labelledby="runtime-scene"]');
      const viewport = section?.querySelector(".runtimeViewport");
      const status = section?.querySelector(".glbStatus-ready");
      if (!section || !viewport || !status) {
        return { ok: false, reason: "missing runtime status or viewport" };
      }
      const viewportRect = viewport.getBoundingClientRect();
      const statusRect = status.getBoundingClientRect();
      const overlaps =
        statusRect.left < viewportRect.right &&
        statusRect.right > viewportRect.left &&
        statusRect.top < viewportRect.bottom &&
        statusRect.bottom > viewportRect.top;
      return {
        ok: !overlaps,
        overlaps,
        statusParentClass: status.parentElement?.className ?? "",
        statusTop: Math.round(statusRect.top),
        viewportBottom: Math.round(viewportRect.bottom)
      };
    })()
  `);
}

async function readRuntimeStartupState(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const poses = Array.from(document.querySelectorAll(".runtimeActorPose")).map((pose) => ({
        actorId: pose.getAttribute("data-actor-id") ?? "",
        loadoutId: pose.getAttribute("data-loadout-id") ?? "",
        sequenceName: pose.getAttribute("data-sequence-name") ?? "",
        text: pose.textContent ?? ""
      }));
      const manualButton = Array.from(document.querySelectorAll("button")).find((button) =>
        (button.textContent ?? "").trim() === "Manual on" || (button.textContent ?? "").trim() === "Manual"
      );
      return {
        poses,
        manualPressed: manualButton?.getAttribute("aria-pressed") ?? "",
        badActionSequences: poses
          .filter((pose) => pose.sequenceName === "barrage_cast" || pose.sequenceName === "crossbow_attack")
          .map((pose) => pose.actorId)
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
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    const hasGlbArtifactViewer = await window.webContents.executeJavaScript(`
      Boolean(document.querySelector('section[aria-labelledby="glb-artifact-viewer"]'))
    `);
    const glbReadyMessage = hasGlbArtifactViewer
      ? await waitForReady(
        window,
        'section[aria-labelledby="glb-artifact-viewer"]',
        "GLB artifact viewer"
      )
      : "GLB artifact viewer is not mounted in the client-only shell.";
    const runtimeReadyMessage = await waitForReady(
      window,
      'section[aria-labelledby="runtime-scene"]',
      "runtime scene"
    );
    await waitForAnimationFrames(window, 8);
    const runtimeStartupState = await readRuntimeStartupState(window);
    if (
      runtimeStartupState.poses.length < 2 ||
      runtimeStartupState.manualPressed !== "true" ||
      runtimeStartupState.badActionSequences.length > 0
    ) {
      throw new Error(`Runtime should start in manual idle/ready state, not the first replay attack tick: ${JSON.stringify(runtimeStartupState)}`);
    }
    const glbPixelStats = hasGlbArtifactViewer
      ? await waitForNonblankCanvas(window, ".glbViewport canvas", "GLB canvas")
      : null;
    await window.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector("#runtime-cycle");
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          setter.call(input, "4");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      })()
    `);
    const runtimePixelStats = await waitForNonblankCanvas(window, ".runtimeViewport canvas", "Runtime canvas");
    const runtimeStatusPlacement = await readRuntimeStatusPlacement(window);
    if (!runtimeStatusPlacement.ok) {
      throw new Error(`Runtime status overlaps the playable fixed client viewport: ${JSON.stringify(runtimeStatusPlacement)}`);
    }

    await window.webContents.executeJavaScript(`
      (() => {
        const section = document.querySelector('section[aria-labelledby="runtime-scene"]');
        if (section) {
          window.scrollTo(0, Math.max(0, section.getBoundingClientRect().top + window.scrollY - 80));
        }
      })()
    `);
    await delay(100);
    const screenshot = await window.capturePage();
    await fs.writeFile(screenshotPath, screenshot.toPNG());
    console.log(JSON.stringify({
      glbReadyMessage,
      runtimeReadyMessage,
      runtimeStartupState,
      glbPixelStats,
      runtimePixelStats,
      runtimeStatusPlacement,
      screenshotPath
    }, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
