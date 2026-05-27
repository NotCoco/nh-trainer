const { app, BrowserWindow } = require("electron");
const path = require("node:path");

const [, , projectRoot] = process.argv;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPolicy(window, rendererMessages) {
  const deadline = Date.now() + 15000;
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
    await delay(250);
  }
  throw new Error(`Timed out waiting for static policy fallback. Last=${JSON.stringify(last)} Renderer=${JSON.stringify(rendererMessages)}`);
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
    const policyStatus = await waitForPolicy(window, rendererMessages);
    const easyStatus = await window.webContents.executeJavaScript(`
      (async () => {
        const easyButton = Array.from(document.querySelectorAll(".runtimeBotDifficultyButtons button"))
          .find((button) => button.textContent?.trim() === "Easy");
        easyButton?.click();
        const deadline = Date.now() + 15000;
        let last = {};
        while (Date.now() < deadline) {
          const shell = document.querySelector("main.clientOnlyShell");
          last = {
            loaded: shell?.dataset.defaultPolicyLoaded ?? "",
            difficulty: shell?.dataset.botDifficulty ?? "",
            status: shell?.dataset.botPolicyStatus ?? ""
          };
          if (last.loaded === "true" && last.difficulty === "easy" && last.status === "loaded") {
            return last;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return last;
      })()
    `);
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
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return last;
      })()
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
          runtimeClientSection: document.querySelector(".runtimeClientSection") !== null
        };
      })()
    `);
    if (result.bridgeType !== "undefined") {
      throw new Error(`Static fallback validation unexpectedly had an Electron bridge: ${JSON.stringify(result)}`);
    }
    if (result.defaultPolicyLoaded !== "true") {
      throw new Error(`Default policy did not load into the client shell: ${JSON.stringify(result)}`);
    }
    if (result.botDifficulty !== "hard" || result.botPolicyStatus !== "loaded" || !result.difficultySelector) {
      throw new Error(`Difficulty policies did not load into the client shell: ${JSON.stringify(result)}, easy=${JSON.stringify(easyStatus)}, hard=${JSON.stringify(hardStatus)}`);
    }
    if (result.visiblePolicyWorkbench) {
      throw new Error(`Policy workbench should be internal in the client shell: ${JSON.stringify(result)}`);
    }
    if (!result.runtimeClientSection) {
      throw new Error(`Runtime client section did not render: ${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify({ policyStatus, easyStatus, hardStatus, result }, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
