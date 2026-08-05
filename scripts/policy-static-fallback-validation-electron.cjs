const { app, BrowserWindow } = require("./electron-muted.cjs");
const path = require("node:path");

const [, , projectRoot] = process.argv;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPolicy(window, rendererMessages) {
  const deadline = Date.now() + 45000;
  let last = {};
  while (Date.now() < deadline) {
    last = await window.webContents.executeJavaScript(`
      (() => {
        const shell = document.querySelector("main.clientOnlyShell");
        return {
          loaded: shell?.dataset.defaultPolicyLoaded ?? "",
          difficulty: shell?.dataset.botDifficulty ?? "",
          status: shell?.dataset.botPolicyStatus ?? ""
        };
      })()
    `);
    if (last.loaded === "true" && last.status === "loaded") {
      return last;
    }
    if (last.loaded === "false" && last.status === "error" && hasExpectedExplicitSchemaGate(rendererMessages)) {
      return { ...last, explicitSchemaGate: true };
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for static policy fallback. Last=${JSON.stringify(last)} Renderer=${JSON.stringify(rendererMessages)}`);
}

function hasExpectedExplicitSchemaGate(rendererMessages) {
  return rendererMessages.some((entry) =>
    typeof entry.message === "string" &&
    (
      entry.message.includes("missing required explicit neural spec action(s):") ||
      entry.message.includes("missing required DMM direct-gear action IDs")
    )
  );
}

async function waitForInitialIdle(window, rendererMessages) {
  const deadline = Date.now() + 15000;
  let last = {};
  while (Date.now() < deadline) {
    last = await window.webContents.executeJavaScript(`
      (() => {
        const shell = document.querySelector("main.clientOnlyShell");
        return {
          loaded: shell?.dataset.defaultPolicyLoaded ?? "",
          difficulty: shell?.dataset.botDifficulty ?? "",
          status: shell?.dataset.botPolicyStatus ?? "",
          runtimeClientSection: document.querySelector(".runtimeClientSection") !== null,
          setupSelector: document.querySelector("[data-runtime-setup-option='nh-stake']") !== null
        };
      })()
    `);
    if (
      last.loaded === "false" &&
      last.difficulty === "hard" &&
      last.status === "idle" &&
      last.runtimeClientSection &&
      last.setupSelector
    ) {
      return last;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for initial lazy policy idle state. Last=${JSON.stringify(last)} Renderer=${JSON.stringify(rendererMessages)}`);
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
  const rendererMessages = [];
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    rendererMessages.push({ level, message, line, sourceId });
  });
  window.webContents.on("did-fail-load", (_event, code, description, url) => {
    rendererMessages.push({ kind: "did-fail-load", code, description, url });
  });

  try {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    const initialStatus = await waitForInitialIdle(window, rendererMessages);
    await window.webContents.executeJavaScript(`
      (() => {
        const button = document.querySelector("[data-runtime-setup-option='nh-stake']");
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error("NH stake setup button was not available.");
        }
        button.click();
      })()
    `);
    const policyStatus = await waitForPolicy(window, rendererMessages);
    const hardStatus = await window.webContents.executeJavaScript(`
      (async () => {
        const hardButton = Array.from(document.querySelectorAll(".runtimeBotDifficultyButtons button"))
          .find((button) => button.textContent?.trim() === "Hard");
        hardButton?.click();
        const deadline = Date.now() + 15000;
        let last = {};
        while (Date.now() < deadline) {
          const shell = document.querySelector("main.clientOnlyShell");
          last = {
            loaded: shell?.dataset.defaultPolicyLoaded ?? "",
            difficulty: shell?.dataset.botDifficulty ?? "",
            status: shell?.dataset.botPolicyStatus ?? ""
          };
          if (last.loaded === "true" && last.difficulty === "hard" && last.status === "loaded") {
            return last;
          }
          if (
            last.loaded === "false" &&
            last.difficulty === "hard" &&
            last.status === "error"
          ) {
            return { ...last, explicitSchemaGate: true };
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return last;
      })()
    `);
    const selectorButtons = await window.webContents.executeJavaScript(`
      Array.from(document.querySelectorAll(".runtimeBotDifficultyButtons button"))
        .map((button) => button.textContent?.trim() ?? "")
    `);
    const result = await window.webContents.executeJavaScript(`
      (() => {
        return {
          bridgeType: typeof window.nhTrainer,
          defaultPolicyLoaded: document.querySelector("main.clientOnlyShell")?.dataset.defaultPolicyLoaded ?? "",
          botDifficulty: document.querySelector("main.clientOnlyShell")?.dataset.botDifficulty ?? "",
          botPolicyStatus: document.querySelector("main.clientOnlyShell")?.dataset.botPolicyStatus ?? "",
          difficultySelector: document.querySelector(".runtimeBotDifficultySelector") !== null,
          visiblePolicyWorkbench: document.querySelector("#policy-workbench") !== null,
          botWatchDevPanel: document.querySelector(".runtimeBotWatchDevPanel") !== null,
          runtimeClientSection: document.querySelector(".runtimeClientSection") !== null
        };
      })()
    `);
    if (result.bridgeType !== "undefined") {
      throw new Error(`Static fallback validation unexpectedly had an Electron bridge: ${JSON.stringify(result)}`);
    }
    const explicitSchemaGate =
      (policyStatus.explicitSchemaGate === true || hardStatus.explicitSchemaGate === true) &&
      hasExpectedExplicitSchemaGate(rendererMessages);
    if (!explicitSchemaGate && result.defaultPolicyLoaded !== "true") {
      throw new Error(`Default policy did not load into the client shell: ${JSON.stringify(result)}`);
    }
    if (!explicitSchemaGate && (result.botDifficulty !== "hard" || result.botPolicyStatus !== "loaded" || !result.difficultySelector)) {
      throw new Error(`Difficulty policies did not load into the client shell: ${JSON.stringify(result)}, hard=${JSON.stringify(hardStatus)}`);
    }
    if (
      explicitSchemaGate &&
      (hardStatus.difficulty !== "hard" || hardStatus.status !== "error" || !result.difficultySelector)
    ) {
      throw new Error(`Explicit schema gate did not stop the old hard policy cleanly: ${JSON.stringify(result)}, hard=${JSON.stringify(hardStatus)}`);
    }
    if (selectorButtons.includes("Easy") || selectorButtons.includes("Medium")) {
      throw new Error(`Removed TSV difficulties should not appear in the selector: ${JSON.stringify(selectorButtons)}`);
    }
    if (result.visiblePolicyWorkbench) {
      throw new Error(`Policy workbench should be internal in the client shell: ${JSON.stringify(result)}`);
    }
    if (result.botWatchDevPanel) {
      throw new Error(`Local bot watch panel should be hidden on the default client surface: ${JSON.stringify(result)}`);
    }
    if (!result.runtimeClientSection) {
      throw new Error(`Runtime client section did not render: ${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify({ initialStatus, policyStatus, hardStatus, selectorButtons, result }, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
