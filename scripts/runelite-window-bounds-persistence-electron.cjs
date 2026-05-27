const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const [, , projectRoot, mode, appDataRoot, targetWidthArg, targetHeightArg, expectedMinWidthArg, expectedMinHeightArg] = process.argv;

const marker = "@@nh-window-bounds@@";
const targetWidth = Number(targetWidthArg);
const targetHeight = Number(targetHeightArg);
const expectedMinWidth = Number(expectedMinWidthArg);
const expectedMinHeight = Number(expectedMinHeightArg);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function boundsPath() {
  return path.join(appDataRoot, "NhNHTrainer", "client-window-bounds.json");
}

async function importBuiltMain() {
  await import(pathToFileURL(path.join(projectRoot, "dist-electron", "main.js")).href);
}

async function waitForWindow() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (window) {
      return window;
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for built NH Trainer window.");
}

async function waitForSavedPayload() {
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const payload = JSON.parse(await fs.readFile(boundsPath(), "utf8"));
      if (
        payload?.schemaVersion === 1 &&
        payload?.contentBounds?.width === targetWidth &&
        payload?.contentBounds?.height === targetHeight
      ) {
        return payload;
      }
      lastError = new Error(`saved payload has unexpected content bounds: ${JSON.stringify(payload)}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw lastError ?? new Error("Timed out waiting for saved client-window-bounds.json.");
}

function emit(value) {
  console.log(`${marker}${JSON.stringify(value)}`);
}

async function run() {
  assert(projectRoot && mode && appDataRoot, "usage: electron runelite-window-bounds-persistence-electron.cjs <projectRoot> <save|read> <appDataRoot> <width> <height>");
  assert(Number.isFinite(targetWidth) && Number.isFinite(targetHeight), "target width and height must be finite numbers");
  assert(
    Number.isFinite(expectedMinWidth) && Number.isFinite(expectedMinHeight),
    "expected minimum width and height must be finite numbers"
  );

  app.setPath("appData", appDataRoot);
  await importBuiltMain();
  const window = await waitForWindow();

  if (mode === "save") {
    window.setPosition(80, 80, false);
    window.setContentSize(1, 1, false);
    await delay(100);
    const clampedContentBounds = window.getContentBounds();
    assert(
      clampedContentBounds.width === expectedMinWidth && clampedContentBounds.height === expectedMinHeight,
      `Electron did not clamp to Nh fixed minimum content size: ${JSON.stringify({
        expectedMinWidth,
        expectedMinHeight,
        clampedContentBounds
      })}`
    );
    window.setContentSize(targetWidth, targetHeight, false);
    const contentBounds = window.getContentBounds();
    assert(
      contentBounds.width === targetWidth && contentBounds.height === targetHeight,
      `Electron did not apply requested content size: ${JSON.stringify({ targetWidth, targetHeight, contentBounds })}`
    );
    const payload = await waitForSavedPayload();
    emit({
      ok: true,
      mode,
      clampedContentBounds,
      contentBounds,
      savedContentBounds: payload.contentBounds,
      savedBounds: payload.bounds,
      boundsPath: boundsPath()
    });
    app.exit(0);
    return;
  }

  if (mode === "read") {
    const contentBounds = window.getContentBounds();
    emit({
      ok: contentBounds.width === targetWidth && contentBounds.height === targetHeight,
      mode,
      contentBounds,
      boundsPath: boundsPath()
    });
    app.exit(contentBounds.width === targetWidth && contentBounds.height === targetHeight ? 0 : 1);
    return;
  }

  throw new Error(`Unsupported mode: ${mode}`);
}

run().catch((error) => {
  console.error(error);
  app.exit(1);
});
