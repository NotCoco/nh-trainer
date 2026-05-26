const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const [, , projectRoot] = process.argv;
const kronosRoot = path.resolve(projectRoot, "..");
const simFixturesRoot = path.join(projectRoot, "fixtures", "sim");
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readSimFixture(fileName) {
  const baseName = path.basename(fileName);
  if (baseName !== fileName || !baseName.endsWith(".json")) {
    throw new Error(`Invalid sim fixture name: ${fileName}`);
  }
  return JSON.parse(await fs.readFile(path.join(simFixturesRoot, baseName), "utf8"));
}

function registerIpc() {
  ipcMain.handle("fixtures:list-sim", async () => {
    const files = (await fs.readdir(simFixturesRoot)).filter((file) => file.endsWith(".json")).sort();
    return Promise.all(
      files.map(async (fileName) => {
        const fixture = await readSimFixture(fileName);
        return {
          fileName,
          fixtureId: fixture.fixtureId ?? fileName.replace(/\.json$/i, ""),
          description: fixture.description ?? ""
        };
      })
    );
  });
  ipcMain.handle("fixtures:read-sim", async (_event, fileName) => readSimFixture(fileName));
  ipcMain.handle("reference:list-client-view", async () => []);
  ipcMain.handle("reference:read-client-view", async () => null);
  ipcMain.handle("policy:read-default", async () => ({
    path: defaultPolicyPath,
    text: await fs.readFile(defaultPolicyPath, "utf8")
  }));
  ipcMain.handle("client-shell:apply-frame-config", async () => undefined);
}

async function waitForValue(window, expression, predicate, label, rendererMessages) {
  const deadline = Date.now() + 15000;
  let lastValue = null;
  while (Date.now() < deadline) {
    const value = await window.webContents.executeJavaScript(expression);
    lastValue = value;
    if (predicate(value)) {
      return value;
    }
    await delay(250);
  }
  const debug = await window.webContents.executeJavaScript(`
    (() => ({
      bridge: typeof window.kronosTrainer,
      policyLoaded: document.querySelector("main.clientOnlyShell")?.getAttribute("data-default-policy-loaded") ?? "",
      viewport: { ...(document.querySelector(".runtimeViewport")?.dataset ?? {}) },
      body: document.body?.innerText?.slice(0, 1000) ?? ""
    }))()
  `);
  throw new Error(
    `Timed out waiting for ${label}. Last=${JSON.stringify(lastValue)} Debug=${JSON.stringify(debug)} Renderer=${JSON.stringify(rendererMessages)}`
  );
}

async function waitForText(window, selector, expected, label, rendererMessages) {
  const deadline = Date.now() + 15000;
  let lastValue = "";
  while (Date.now() < deadline) {
    const value = await window.webContents.executeJavaScript(`
      document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""
    `);
    lastValue = value;
    if (value.includes(expected)) {
      return value;
    }
    await delay(250);
  }
  const debug = await window.webContents.executeJavaScript(`
    (() => ({
      bridge: typeof window.kronosTrainer,
      policyText: document.querySelector(".policyStatus")?.textContent ?? "",
      body: document.body?.innerText?.slice(0, 1000) ?? ""
    }))()
  `);
  throw new Error(
    `Timed out waiting for ${label}. Last=${JSON.stringify(lastValue)} Debug=${JSON.stringify(debug)} Renderer=${JSON.stringify(rendererMessages)}`
  );
}

app.whenReady().then(async () => {
  registerIpc();
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(projectRoot, "dist-electron", "preload.cjs"),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const rendererMessages = [];
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    rendererMessages.push({ level, message, line, sourceId });
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    rendererMessages.push({ kind: "render-process-gone", details });
  });
  window.webContents.on("did-fail-load", (_event, code, description, url) => {
    rendererMessages.push({ kind: "did-fail-load", code, description, url });
  });

  try {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    await window.webContents.executeJavaScript(`
      window.__kronosValidationErrors = [];
      window.addEventListener("error", (event) => {
        window.__kronosValidationErrors.push(event.message);
      });
      window.addEventListener("unhandledrejection", (event) => {
        window.__kronosValidationErrors.push(String(event.reason));
      });
    `);
    const policyLoaded = await waitForValue(
      window,
      `document.querySelector("main.clientOnlyShell")?.getAttribute("data-default-policy-loaded") ?? ""`,
      (value) => value === "true",
      "internal default policy load",
      rendererMessages
    );
    await waitForText(
      window,
      'section[aria-labelledby="runtime-scene"] .glbStatus-ready',
      "Loaded generated NH duel replay",
      "runtime load",
      rendererMessages
    );
    await waitForValue(
      window,
      `document.querySelector(".runtimeViewport")?.dataset.lastManualOpponentControllerId ?? ""`,
      (value) => typeof value === "string" && value.includes("parsed-policy:"),
      "manual opponent parsed policy tick",
      rendererMessages
    );
    await waitForValue(
      window,
      `Number.parseInt(document.querySelector(".runtimeViewport")?.dataset.lastManualOpponentPolicyTick ?? "0", 10)`,
      (value) => Number.isFinite(value) && value >= 1,
      "manual opponent policy tick advance",
      rendererMessages
    );
    const result = await window.webContents.executeJavaScript(`
      (() => {
        const viewport = document.querySelector(".runtimeViewport");
        const dataset = viewport?.dataset ?? {};
        const replayOptions = Array.from(document.querySelectorAll("#runtime-replay option")).map((option) => option.textContent ?? "");
        const runtimeCycleValue = document.querySelector("#runtime-cycle")?.value ?? "";
        return {
          policyTick: dataset.lastManualOpponentPolicyTick ?? "",
          controllerId: dataset.lastManualOpponentControllerId ?? "",
          policyAction: dataset.lastManualOpponentPolicyAction ?? "",
          policyEffectiveAction: dataset.lastManualOpponentPolicyEffectiveAction ?? "",
          bestVisibleStyle: dataset.lastManualOpponentBestVisibleStyle ?? "",
          visibleStyleEvs: dataset.lastManualOpponentVisibleStyleEvs ?? "",
          observedTile: dataset.lastManualOpponentPolicyObservedLocalTile ?? "",
          actualTile: dataset.lastManualOpponentPolicyActualLocalTile ?? "",
          clientPositionDelayTicks: dataset.lastManualOpponentPolicyClientPositionDelayTicks ?? "",
          clientPrayerDelayTicks: dataset.lastManualOpponentPolicyClientPrayerDelayTicks ?? "",
          clientAppearanceDelayTicks: dataset.lastManualOpponentPolicyClientAppearanceDelayTicks ?? "",
          clientVitalsDelayTicks: dataset.lastManualOpponentPolicyClientVitalsDelayTicks ?? "",
          replayOptions,
          runtimeCycleValue,
          errors: window.__kronosValidationErrors ?? []
        };
      })()
    `);
    if (!result.controllerId.includes("parsed-policy:")) {
      throw new Error(`Runtime opponent did not use parsed policy controller: ${JSON.stringify(result)}`);
    }
    if (Number.parseInt(result.policyTick, 10) < 1) {
      throw new Error(`Runtime policy tick did not advance, got ${result.policyTick}.`);
    }
    if (!result.policyAction || !result.policyEffectiveAction) {
      throw new Error(`Runtime policy action dataset did not render: ${JSON.stringify(result)}`);
    }
    if (!result.visibleStyleEvs.includes("magic") || !result.visibleStyleEvs.includes("ranged")) {
      throw new Error(`Visible style EV dataset did not render: ${JSON.stringify(result)}`);
    }
    if (
      result.clientPositionDelayTicks !== "1" ||
      result.clientPrayerDelayTicks !== "1" ||
      result.clientAppearanceDelayTicks !== "1" ||
      result.clientVitalsDelayTicks !== "1"
    ) {
      throw new Error(`Runtime policy client-delay sentinels are not active: ${JSON.stringify(result)}`);
    }
    if (!result.replayOptions.some((option) => option.includes("generated-nh-duel-v1"))) {
      throw new Error(`Runtime replay selector did not include generated duel trace: ${JSON.stringify(result.replayOptions)}`);
    }
    if (result.errors.length > 0) {
      throw new Error(`Browser errors during policy duel: ${result.errors.join("; ")}`);
    }

    console.log(JSON.stringify({ policyLoaded, result }, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
