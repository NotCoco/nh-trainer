const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const [, , projectRoot, outputPath] = process.argv;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
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

async function runtimeCanvasRect(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const canvas = document.querySelector(".runtimeViewport canvas");
      if (!canvas) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    })()
  `);
}

async function makeComparison(window, runtimeDataUrl, texture8DataUrl, texture60DataUrl) {
  return window.webContents.executeJavaScript(`
    (async () => {
      const loadImage = (src) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not decode comparison image."));
        image.src = src;
      });

      const [runtime, texture8, texture60] = await Promise.all([
        loadImage(${JSON.stringify(runtimeDataUrl)}),
        loadImage(${JSON.stringify(texture8DataUrl)}),
        loadImage(${JSON.stringify(texture60DataUrl)})
      ]);

      const crops = [
        { label: "Trainer tree crop A", x: Math.round(runtime.width * 0.78), y: Math.round(runtime.height * 0.10), w: Math.round(runtime.width * 0.18), h: Math.round(runtime.height * 0.26) },
        { label: "Trainer tree crop B", x: Math.round(runtime.width * 0.22), y: Math.round(runtime.height * 0.58), w: Math.round(runtime.width * 0.20), h: Math.round(runtime.height * 0.30) }
      ];

      const scratch = document.createElement("canvas");
      const scratchContext = scratch.getContext("2d", { willReadFrequently: true });
      const cropStats = [];

      for (const crop of crops) {
        scratch.width = crop.w;
        scratch.height = crop.h;
        scratchContext.clearRect(0, 0, crop.w, crop.h);
        scratchContext.drawImage(runtime, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
        const pixels = scratchContext.getImageData(0, 0, crop.w, crop.h).data;
        let opaque = 0;
        let whiteish = 0;
        let greenish = 0;
        let darkTextured = 0;

        for (let index = 0; index < pixels.length; index += 4) {
          const r = pixels[index];
          const g = pixels[index + 1];
          const b = pixels[index + 2];
          const a = pixels[index + 3];
          if (a < 16) {
            continue;
          }
          opaque += 1;
          if (r > 190 && g > 190 && b > 190) {
            whiteish += 1;
          }
          if (g >= r * 0.78 && g >= b * 0.78 && b < 170) {
            greenish += 1;
          }
          if (g > 45 && g < 170 && r < 150 && b < 140) {
            darkTextured += 1;
          }
        }

        cropStats.push({
          ...crop,
          opaque,
          whiteish,
          greenish,
          darkTextured,
          whiteishRatio: opaque === 0 ? 1 : whiteish / opaque,
          greenishRatio: opaque === 0 ? 0 : greenish / opaque,
          darkTexturedRatio: opaque === 0 ? 0 : darkTextured / opaque
        });
      }

      const panelWidth = 280;
      const panelHeight = 240;
      const headerHeight = 34;
      const gutter = 16;
      const canvas = document.createElement("canvas");
      canvas.width = panelWidth * 4 + gutter * 5;
      canvas.height = panelHeight + gutter * 2;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.fillStyle = "#0f1419";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.font = "14px sans-serif";
      context.textBaseline = "top";

      function drawPanel(index, title, image, sourceRect = null) {
        const x = gutter + index * (panelWidth + gutter);
        const y = gutter;
        context.fillStyle = "#182026";
        context.fillRect(x, y, panelWidth, panelHeight);
        context.strokeStyle = "#34424f";
        context.strokeRect(x + 0.5, y + 0.5, panelWidth - 1, panelHeight - 1);
        context.fillStyle = "#d7e5ee";
        context.fillText(title, x + 12, y + 10);

        const imageX = x + 12;
        const imageY = y + headerHeight;
        const imageW = panelWidth - 24;
        const imageH = panelHeight - headerHeight - 12;
        context.imageSmoothingEnabled = false;
        if (sourceRect) {
          context.drawImage(image, sourceRect.x, sourceRect.y, sourceRect.w, sourceRect.h, imageX, imageY, imageW, imageH);
        } else {
          context.drawImage(image, 0, 0, image.width, image.height, imageX, imageY, imageW, imageH);
        }
        context.imageSmoothingEnabled = true;
      }

      drawPanel(0, "Reference: Kronos texture 8", texture8);
      drawPanel(1, "Reference: Kronos texture 60", texture60);
      drawPanel(2, crops[0].label, runtime, crops[0]);
      drawPanel(3, crops[1].label, runtime, crops[1]);

      const ok = cropStats.every((stat) =>
        stat.whiteishRatio < 0.08 &&
        stat.greenishRatio > 0.35 &&
        stat.darkTexturedRatio > 0.12
      );

      return {
        ok,
        runtimeWidth: runtime.width,
        runtimeHeight: runtime.height,
        cropStats,
        comparisonDataUrl: canvas.toDataURL("image/png")
      };
    })()
  `);
}

async function writeDataUrl(filePath, dataUrl) {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  await fs.writeFile(filePath, Buffer.from(base64, "base64"));
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
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    const runtimeReadyMessage = await waitForReady(
      window,
      'section[aria-labelledby="runtime-scene"]',
      "runtime scene"
    );
    await scrollRuntimeIntoView(window);
    await setRuntimeCamera(window, "top");
    await setRuntimeCycle(window, 42);
    await delay(300);
    await waitForPaint(window);

    const rect = await runtimeCanvasRect(window);
    if (!rect) {
      throw new Error("Could not find runtime canvas.");
    }

    const runtimePng = await window.capturePage(rect);
    const texture8 = await fs.readFile(path.join(projectRoot, "fixtures", "render", "textures", "texture_8.png"));
    const texture60 = await fs.readFile(path.join(projectRoot, "fixtures", "render", "textures", "texture_60.png"));
    const comparison = await makeComparison(
      window,
      asDataUrl(runtimePng.toPNG()),
      asDataUrl(texture8),
      asDataUrl(texture60)
    );
    await writeDataUrl(outputPath, comparison.comparisonDataUrl);

    console.log(JSON.stringify({
      runtimeReadyMessage,
      outputPath,
      ...comparison,
      comparisonDataUrl: undefined
    }, null, 2));

    if (!comparison.ok) {
      throw new Error(`Tree texture validation failed: ${JSON.stringify(comparison.cropStats)}`);
    }

    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
