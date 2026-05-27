const { app, BrowserWindow } = require("electron");

const [, , targetUrl] = process.argv;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApp(window) {
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    const state = await window.webContents.executeJavaScript(`
      (() => {
        const shell = document.querySelector(".runeliteClientShell");
        const panelFrame = document.querySelector(".runeliteClientPanelFrame");
        const viewport = document.querySelector(".runtimeViewport");
        const canvas = document.querySelector(".runtimeViewport canvas");
        const bodyText = document.body?.innerText ?? "";
        const html = document.documentElement?.outerHTML ?? "";

        return {
          title: document.title,
          hasShell: Boolean(shell),
          hasPanelFrame: Boolean(panelFrame),
          hasViewport: Boolean(viewport),
          hasCanvas: Boolean(canvas),
          oldNameInDom: /nh/i.test(html) || /nh/i.test(bodyText),
          sourceDebugAttrCount: document.querySelectorAll("[data-source-plugin], [data-source-layer], [data-source-overlay]").length,
          refAttrCount: document.querySelectorAll("[data-ref-plugin], [data-ref-layer], [data-ref-overlay]").length
        };
      })()
    `);

    if (state.hasShell && state.hasPanelFrame && state.hasViewport && state.hasCanvas) {
      return state;
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for sanitized public build shell.");
}

async function main() {
  if (!targetUrl) {
    throw new Error("usage: public-build-render-electron.cjs <url>");
  }

  const consoleIssues = [];

  await app.whenReady();

  const window = new BrowserWindow({
    width: 1043,
    height: 760,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      consoleIssues.push({ level, message, line, sourceId });
    }
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    consoleIssues.push({ level: 3, message: `render-process-gone: ${details.reason}` });
  });

  const failedLoad = new Promise((_, reject) => {
    window.webContents.once("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
      reject(new Error(`failed to load ${validatedUrl}: ${errorCode} ${errorDescription}`));
    });
  });

  await Promise.race([window.loadURL(targetUrl), failedLoad]);
  const state = await waitForApp(window);

  if (state.oldNameInDom) {
    throw new Error(`sanitized public build still exposes old name in DOM: ${JSON.stringify(state)}`);
  }

  if (state.sourceDebugAttrCount !== 0) {
    throw new Error(`sanitized public build still exposes data-source debug attrs: ${JSON.stringify(state)}`);
  }

  if (consoleIssues.length > 0) {
    throw new Error(`sanitized public build emitted console errors: ${JSON.stringify(consoleIssues, null, 2)}`);
  }

  console.log(JSON.stringify({ ok: true, targetUrl, state }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    app.quit();
  });
