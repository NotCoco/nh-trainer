const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const [, , projectRoot, screenshotDir, screenshotRunId = `${Date.now()}-${process.pid}`] = process.argv;

const checks = [
  {
    camera: "isometric",
    cycle: 2,
    replayId: "generated-nh-inventory-switch-v1",
    expectedAppearanceItemIds: [11832, 11834, 12006]
  },
  { camera: "isometric", cycle: 8 },
  { camera: "north", cycle: 18 },
  { camera: "south", cycle: 30 },
  { camera: "top", cycle: 42 },
  {
    camera: "isometric",
    cycle: 3,
    replayId: "two-actor-barrage-into-range-v1",
    expectedEventTexts: ["Damage 27", "health 73%"],
    expectedAppearanceItemIds: [9185, 11283, 1201]
  }
];

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

async function setRuntimeCamera(window, camera) {
  await window.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector("#runtime-camera");
      if (input) {
        const tracker = input._valueTracker;
        if (tracker) {
          tracker.setValue("");
        }
        input.value = ${JSON.stringify(camera)};
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      window.dispatchEvent(new CustomEvent("kronos-runtime-camera", {
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
        const tracker = input._valueTracker;
        if (tracker) {
          tracker.setValue("");
        }
        input.value = ${JSON.stringify(String(cycle))};
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      window.dispatchEvent(new CustomEvent("kronos-runtime-cycle", {
        detail: { cycle: ${JSON.stringify(cycle)} }
      }));
    })()
  `);
}

async function selectRuntimeReplay(window, replayId) {
  if (!replayId) {
    return;
  }

  await window.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector("#runtime-replay");
      if (!input) {
        throw new Error("missing runtime replay selector");
      }
      const option = Array.from(input.options).find((candidate) => candidate.value === ${JSON.stringify(replayId)});
      if (!option) {
        throw new Error("missing runtime replay ${replayId}");
      }
      const tracker = input._valueTracker;
      if (tracker) {
        tracker.setValue("");
      }
      input.value = ${JSON.stringify(replayId)};
      input.dispatchEvent(new Event("change", { bubbles: true }));
    })()
  `);
}

async function readRuntimeEventText(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const section = document.querySelector('section[aria-labelledby="runtime-scene"]');
      return section?.textContent ?? "";
    })()
  `);
}

async function readRuntimeActorAppearances(window) {
  return window.webContents.executeJavaScript(`
    (() => Array.from(document.querySelectorAll(".runtimeActorPose")).map((node) => ({
      actorId: node.getAttribute("data-actor-id") ?? "",
      source: node.getAttribute("data-appearance-source") ?? "",
      itemIds: (node.getAttribute("data-appearance-item-ids") ?? "")
        .split(",")
        .filter(Boolean)
        .map((value) => Number(value))
    })))()
  `);
}

async function scrollRuntimeIntoView(window) {
  await window.webContents.executeJavaScript(`
    (() => {
      const section = document.querySelector('section[aria-labelledby="runtime-scene"]');
      if (section) {
        window.scrollTo(0, Math.max(0, section.getBoundingClientRect().top + window.scrollY - 80));
      }
    })()
  `);
}

async function waitForPaint(window) {
  await window.webContents.executeJavaScript(`
    new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    })
  `);
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
      for (let index = 0; index < pixels.length; index += 16) {
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        const a = pixels[index + 3];
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
    const runtimeReadyMessage = await waitForReady(
      window,
      'section[aria-labelledby="runtime-scene"]',
      "runtime scene"
    );
    await scrollRuntimeIntoView(window);

    const results = [];
    for (const check of checks) {
      await selectRuntimeReplay(window, check.replayId);
      await setRuntimeCamera(window, check.camera);
      await setRuntimeCycle(window, check.cycle);
      await delay(300);
      await waitForPaint(window);
      const eventText = await readRuntimeEventText(window);
      for (const expectedEventText of check.expectedEventTexts ?? []) {
        if (!eventText.includes(expectedEventText)) {
          throw new Error(`Runtime event text did not include ${expectedEventText}: ${eventText.slice(0, 1000)}`);
        }
      }
      const appearances = await readRuntimeActorAppearances(window);
      if (check.expectedAppearanceItemIds) {
        const renderedItemIds = new Set(appearances.flatMap((appearance) => appearance.itemIds));
        const sources = new Set(appearances.map((appearance) => appearance.source));
        if (!sources.has("client-packet")) {
          throw new Error(`Runtime actors did not expose client-packet appearance source: ${JSON.stringify(appearances)}`);
        }
        for (const itemId of check.expectedAppearanceItemIds) {
          if (!renderedItemIds.has(itemId)) {
            throw new Error(`Runtime actors did not expose client-packet item ${itemId}: ${JSON.stringify(appearances)}`);
          }
        }
      }
      const pixelStats = await readCanvasPixels(window, ".runtimeViewport canvas");
      if (!pixelStats.ok) {
        throw new Error(`Runtime canvas failed for ${check.camera}: ${JSON.stringify(pixelStats)}`);
      }
      const screenshotSuffix = check.replayId ? `${check.camera}-${check.replayId}` : check.camera;
      const screenshotPath = path.join(screenshotDir, `kronos-nh-trainer-${screenshotSuffix}-${screenshotRunId}.png`);
      const screenshot = await window.capturePage();
      await fs.writeFile(screenshotPath, screenshot.toPNG());
      results.push({
        ...check,
        appearances,
        screenshotPath,
        pixelStats
      });
    }

    console.log(JSON.stringify({ runtimeReadyMessage, results }, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
