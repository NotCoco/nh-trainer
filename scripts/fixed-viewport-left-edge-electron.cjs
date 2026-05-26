const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const [, , projectRoot, screenshotPath] = process.argv;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForLeftEdge(window) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const state = await window.webContents.executeJavaScript(`
      (() => {
        const edge = document.querySelector('.kronosWidgetSprite[data-sprite-id="4"][data-child-id="0"]');
        const viewport = document.querySelector('.runtimeViewport canvas');
        return {
          ready: Boolean(edge && viewport),
          edgeRect: edge ? (() => {
            const rect = edge.getBoundingClientRect();
            return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
          })() : null
        };
      })()
    `);
    if (state.ready) {
      return state.edgeRect;
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for fixed viewport left-edge sprite.");
}

async function waitForReady(window) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const status = await window.webContents.executeJavaScript(`
      (() => {
        const section = document.querySelector('section[aria-labelledby="runtime-scene"]');
        const ready = section?.querySelector(".glbStatus-ready");
        const error = section?.querySelector(".glbStatus-error, .glbStatus-missing");
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

async function waitForNonblankCanvas(window) {
  const deadline = Date.now() + 10000;
  let lastStats = null;
  while (Date.now() < deadline) {
    const stats = await window.webContents.executeJavaScript(`
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
        for (let i = 0; i < pixels.length; i += 16) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          if (Math.abs(r - 16) + Math.abs(g - 20) + Math.abs(b - 24) > 12) {
            nonBackground += 1;
          }
        }
        return {
          ok: nonBackground > 100,
          width,
          height,
          sampledPixels: Math.floor(pixels.length / 16),
          nonBackground
        };
      })()
    `);
    if (stats.ok) {
      return stats;
    }
    lastStats = stats;
    await delay(250);
  }
  throw new Error(`Runtime canvas did not render nonblank pixels: ${JSON.stringify(lastStats)}`);
}

function countNonBlackPixels(image) {
  const bitmap = image.toBitmap();
  let nonBlack = 0;
  const pixels = image.getSize().width * image.getSize().height;
  for (let index = 0; index < bitmap.length; index += 4) {
    const blue = bitmap[index] ?? 0;
    const green = bitmap[index + 1] ?? 0;
    const red = bitmap[index + 2] ?? 0;
    if (red + green + blue > 24) {
      nonBlack += 1;
    }
  }
  return { nonBlack, pixels };
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 900,
    height: 650,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    const runtimeReadyMessage = await waitForReady(window);
    const runtimePixelStats = await waitForNonblankCanvas(window);
    const edgeRect = await waitForLeftEdge(window);
    await delay(250);
    const fullImage = await window.webContents.capturePage();
    await fs.writeFile(screenshotPath, fullImage.toPNG());
    const edgeImage = await window.webContents.capturePage({
      x: Math.floor(edgeRect.left),
      y: Math.floor(edgeRect.top),
      width: Math.max(1, Math.ceil(edgeRect.width)),
      height: Math.max(1, Math.ceil(edgeRect.height))
    });
    const { nonBlack, pixels } = countNonBlackPixels(edgeImage);
    assert(edgeRect.width >= 4, `left edge sprite should cover source 4px width, got ${edgeRect.width}`);
    assert(edgeRect.height >= 334, `left edge sprite should cover source 334px height, got ${edgeRect.height}`);
    assert(nonBlack / Math.max(1, pixels) > 0.8, `left edge is still mostly black: ${nonBlack}/${pixels} non-black pixels`);
    console.log(
      JSON.stringify(
        {
          ok: true,
          screenshotPath,
          runtimeReadyMessage,
          runtimePixelStats,
          edgeRect,
          nonBlack,
          pixels
        },
        null,
        2
      )
    );
  } finally {
    window.destroy();
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
