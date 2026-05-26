const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const [, , projectRoot, referenceRoot, outputRoot] = process.argv;
const manifestPath = path.join(referenceRoot, "manifest.json");
const simFixturesRoot = path.join(projectRoot, "fixtures", "sim");
const kronosRoot = path.resolve(projectRoot, "..");
const defaultPolicyPath = path.join(
  kronosRoot,
  "kronos-osrs-184-master",
  "kronos-osrs-184-master",
  "Kronos-master",
  "kronos-server",
  "data",
  "ai",
  "nhstaker-selfplay-policy-nhstake-ags.tsv"
);
const defaultTolerance = {
  changedPixelThreshold: 24,
  maxChangedPixelRatio: 0.12,
  maxMeanAbsoluteError: 18
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function sanitizeFilePart(value) {
  return value.replace(/[^a-z0-9_.-]+/gi, "-").replace(/^-+|-+$/g, "");
}

async function readJson(filePath) {
  return JSON.parse(stripJsonBom(await fs.readFile(filePath, "utf8")));
}

function stripJsonBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function readManifest() {
  try {
    const manifest = await readJson(manifestPath);
    if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.frames)) {
      throw new Error(`Invalid render reference manifest: ${manifestPath}`);
    }
    return manifest;
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        [
          `Missing render reference manifest: ${manifestPath}`,
          "Run `npm run capture:client -- --source <folder-with-real-kronos-client-pngs>` first."
        ].join("\n")
      );
    }
    throw error;
  }
}

function safeJsonFixturePath(root, fileName, suffix, label) {
  const baseName = path.basename(fileName);
  if (baseName !== fileName || !baseName.endsWith(suffix)) {
    throw new Error(`Invalid ${label} fixture name: ${fileName}`);
  }
  return path.join(root, baseName);
}

function fixtureSummary(fileName, value) {
  return {
    fileName,
    fixtureId: typeof value?.fixtureId === "string" ? value.fixtureId : fileName.replace(/\.json$/i, ""),
    description: typeof value?.description === "string" ? value.description : ""
  };
}

async function readSimFixture(fileName) {
  return readJson(safeJsonFixturePath(simFixturesRoot, fileName, ".json", "sim"));
}

async function readReferenceClientViewTrace(fileName) {
  return readJson(safeJsonFixturePath(referenceRoot, fileName, ".client-view.json", "client-view"));
}

async function withClientViewTraceFixtureIds(manifest) {
  const frames = await Promise.all(
    manifest.frames.map(async (frame) => {
      if (!frame.clientViewTraceFileName) {
        return frame;
      }
      const trace = await readReferenceClientViewTrace(frame.clientViewTraceFileName);
      if (trace?.schemaVersion !== "client-view.v1" || typeof trace.fixtureId !== "string") {
        throw new Error(`Invalid client-view trace for ${frame.id}: ${frame.clientViewTraceFileName}`);
      }
      return {
        ...frame,
        clientViewTraceFixtureId: trace.fixtureId
      };
    })
  );
  return { ...manifest, frames };
}

async function listReferenceClientViewTraceFiles() {
  const manifest = await readManifest();
  return [
    ...new Set(
      manifest.frames
        .map((frame) => frame.clientViewTraceFileName)
        .filter((fileName) => typeof fileName === "string" && fileName.endsWith(".client-view.json"))
    )
  ].sort();
}

function registerFixtureIpc() {
  ipcMain.handle("fixtures:list-sim", async () => {
    const files = (await fs.readdir(simFixturesRoot)).filter((file) => file.endsWith(".json")).sort();
    return Promise.all(files.map(async (fileName) => fixtureSummary(fileName, await readSimFixture(fileName))));
  });
  ipcMain.handle("fixtures:read-sim", async (_event, fileName) => readSimFixture(fileName));
  ipcMain.handle("reference:list-client-view", async () => {
    const files = await listReferenceClientViewTraceFiles();
    return Promise.all(
      files.map(async (fileName) => fixtureSummary(fileName, await readReferenceClientViewTrace(fileName)))
    );
  });
  ipcMain.handle("reference:read-client-view", async (_event, fileName) => readReferenceClientViewTrace(fileName));
}

function registerPolicyIpc() {
  ipcMain.handle("policy:read-default", async () => ({
    path: defaultPolicyPath,
    text: await fs.readFile(defaultPolicyPath, "utf8")
  }));
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

async function waitForPaint(window) {
  await window.webContents.executeJavaScript(`
    new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    })
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
  await waitForPaint(window);
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

async function comparePngs(window, actualDataUrl, referenceDataUrl, tolerance) {
  return window.webContents.executeJavaScript(`
    (async () => {
      const tolerance = ${JSON.stringify(tolerance)};
      const actualDataUrl = ${JSON.stringify(actualDataUrl)};
      const referenceDataUrl = ${JSON.stringify(referenceDataUrl)};
      const loadImage = (label, src) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not decode " + label + " PNG."));
        image.src = src;
      });
      const [actualImage, referenceImage] = await Promise.all([
        loadImage("actual", actualDataUrl),
        loadImage("reference", referenceDataUrl)
      ]);

      if (actualImage.width !== referenceImage.width || actualImage.height !== referenceImage.height) {
        return {
          ok: false,
          reason: "dimension mismatch",
          actualWidth: actualImage.width,
          actualHeight: actualImage.height,
          referenceWidth: referenceImage.width,
          referenceHeight: referenceImage.height
        };
      }

      const width = actualImage.width;
      const height = actualImage.height;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(actualImage, 0, 0);
      const actualPixels = context.getImageData(0, 0, width, height);
      context.clearRect(0, 0, width, height);
      context.drawImage(referenceImage, 0, 0);
      const referencePixels = context.getImageData(0, 0, width, height);
      const diff = context.createImageData(width, height);

      let changedPixels = 0;
      let totalDelta = 0;
      let maxChannelDelta = 0;

      for (let index = 0; index < actualPixels.data.length; index += 4) {
        const dr = Math.abs(actualPixels.data[index] - referencePixels.data[index]);
        const dg = Math.abs(actualPixels.data[index + 1] - referencePixels.data[index + 1]);
        const db = Math.abs(actualPixels.data[index + 2] - referencePixels.data[index + 2]);
        const pixelDelta = Math.max(dr, dg, db);
        const averageDelta = (dr + dg + db) / 3;

        totalDelta += dr + dg + db;
        maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);

        if (pixelDelta > tolerance.changedPixelThreshold) {
          changedPixels += 1;
        }

        diff.data[index] = pixelDelta;
        diff.data[index + 1] = 24;
        diff.data[index + 2] = 24;
        diff.data[index + 3] = Math.max(80, Math.min(255, Math.round(averageDelta * 4)));
      }

      context.putImageData(diff, 0, 0);
      const pixelCount = width * height;
      const meanAbsoluteError = totalDelta / (pixelCount * 3);
      const changedPixelRatio = changedPixels / pixelCount;
      const ok =
        meanAbsoluteError <= tolerance.maxMeanAbsoluteError &&
        changedPixelRatio <= tolerance.maxChangedPixelRatio;

      return {
        ok,
        width,
        height,
        pixelCount,
        changedPixels,
        changedPixelRatio,
        meanAbsoluteError,
        maxChannelDelta,
        tolerance,
        diffDataUrl: canvas.toDataURL("image/png")
      };
    })()
  `);
}

async function writeDataUrl(filePath, dataUrl) {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  await fs.writeFile(filePath, Buffer.from(base64, "base64"));
}

async function captureRuntimeFrame(window, frame) {
  await selectRuntimeReplay(window, frame.clientViewTraceFixtureId);
  await setRuntimeCamera(window, frame.camera);
  await setRuntimeCycle(window, frame.cycle);
  await scrollRuntimeIntoView(window);
  await delay(300);
  await waitForPaint(window);

  const rect = await runtimeCanvasRect(window);
  if (!rect) {
    throw new Error("Could not find runtime canvas.");
  }

  const actual = await window.capturePage(rect);
  return actual.toPNG();
}

app.whenReady().then(async () => {
  registerFixtureIpc();
  registerPolicyIpc();
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      preload: path.join(projectRoot, "dist-electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    const manifest = await withClientViewTraceFixtureIds(await readManifest());
    await fs.mkdir(outputRoot, { recursive: true });
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    const runtimeReadyMessage = await waitForReady(
      window,
      'section[aria-labelledby="runtime-scene"]',
      "runtime scene"
    );

    const results = [];
    for (const frame of manifest.frames) {
      const actualPng = await captureRuntimeFrame(window, frame);
      const referencePath = path.join(referenceRoot, frame.fileName);
      const referencePng = await fs.readFile(referencePath);
      const safeId = sanitizeFilePart(frame.id);
      const actualPath = path.join(outputRoot, `kronos-render-parity-${safeId}-actual.png`);
      const diffPath = path.join(outputRoot, `kronos-render-parity-${safeId}-diff.png`);
      const tolerance = { ...defaultTolerance, ...(frame.tolerance ?? {}) };
      const comparison = await comparePngs(window, asDataUrl(actualPng), asDataUrl(referencePng), tolerance);

      await fs.writeFile(actualPath, actualPng);
      if (comparison.diffDataUrl) {
        await writeDataUrl(diffPath, comparison.diffDataUrl);
      }

      results.push({
        id: frame.id,
        label: frame.label,
        camera: frame.camera,
        cycle: frame.cycle,
        clientViewTraceFileName: frame.clientViewTraceFileName,
        clientViewTraceFixtureId: frame.clientViewTraceFixtureId,
        ok: comparison.ok,
        reason: comparison.reason,
        width: comparison.width,
        height: comparison.height,
        changedPixelRatio: comparison.changedPixelRatio,
        meanAbsoluteError: comparison.meanAbsoluteError,
        maxChannelDelta: comparison.maxChannelDelta,
        tolerance,
        referencePath,
        actualPath,
        diffPath: comparison.diffDataUrl ? diffPath : null
      });
    }

    const failed = results.filter((result) => !result.ok);
    console.log(JSON.stringify({ runtimeReadyMessage, referenceRoot, results }, null, 2));

    if (failed.length > 0) {
      throw new Error(`${failed.length}/${results.length} render reference comparisons failed.`);
    }

    app.quit();
  } catch (error) {
    console.error(error.message);
    app.exit(1);
  }
});
