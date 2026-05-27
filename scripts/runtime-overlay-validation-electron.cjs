const { app, BrowserWindow } = require("electron");
const path = require("node:path");

const [, , projectRoot] = process.argv;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForReady(window) {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const status = await window.webContents.executeJavaScript(`
      (() => {
        const root = document.querySelector('section[aria-labelledby="runtime-scene"]');
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

  throw new Error("Timed out waiting for runtime scene readiness.");
}

async function focusRuntimeSection(window) {
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const section = document.querySelector('section[aria-labelledby="runtime-scene"]');
      if (!section) {
        return { ok: false, error: "missing runtime scene section" };
      }
      const shell = section.closest(".shell");
      if (shell) {
        for (const child of Array.from(shell.children)) {
          if (child !== section) {
            child.style.display = "none";
          }
        }
        shell.style.paddingTop = "24px";
        shell.style.paddingBottom = "24px";
      }
      section.style.marginTop = "0";
      section.style.paddingTop = "0";
      section.style.borderTop = "0";
      window.scrollTo(0, 0);
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(result.error);
  }
}

async function selectRuntimeReplay(window, replayId) {
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const select = document.querySelector("#runtime-replay");
      if (!select) {
        return { ok: false, error: "missing runtime replay selector" };
      }
      const option = Array.from(select.options).find((candidate) => candidate.value === ${JSON.stringify(replayId)});
      if (!option) {
        return {
          ok: false,
          error: "missing replay option",
          options: Array.from(select.options).map((candidate) => candidate.value)
        };
      }
      const tracker = select._valueTracker;
      if (tracker) {
        tracker.setValue("");
      }
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  await delay(150);
}

async function setManualControl(window, enabled) {
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const button = buttons.find((candidate) => candidate.textContent?.trim() === "Manual on" || candidate.textContent?.trim() === "Manual");
      if (!button) {
        return { ok: false, error: "missing manual control button" };
      }
      const current = button.getAttribute("aria-pressed") === "true";
      if (current !== ${JSON.stringify(enabled)}) {
        button.click();
      }
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  await delay(150);
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
      window.dispatchEvent(new CustomEvent("nh-runtime-camera", {
        detail: { camera: ${JSON.stringify(camera)} }
      }));
    })()
  `);
  await delay(100);
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
      window.dispatchEvent(new CustomEvent("nh-runtime-cycle", {
        detail: { cycle: ${JSON.stringify(cycle)} }
      }));
    })()
  `);
  await delay(120);
}

async function waitForPaint(window) {
  await window.webContents.executeJavaScript(`
    new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    })
  `);
}

async function readOverlaySnapshot(window) {
  return window.webContents.executeJavaScript(`
    (() => window.__nhRuntimeDebug ?? null)()
  `);
}

async function waitForOverlaySnapshot(window, cycle) {
  const deadline = Date.now() + 10000;
  let lastSnapshot = null;

  while (Date.now() < deadline) {
    await waitForPaint(window);
    const snapshot = await readOverlaySnapshot(window);
    if (snapshot?.cycle === cycle && Array.isArray(snapshot.overlays) && snapshot.overlays.length > 0) {
      return snapshot;
    }
    lastSnapshot = snapshot;
    await delay(150);
  }

  throw new Error(`Timed out waiting for runtime overlay debug snapshot: ${JSON.stringify(lastSnapshot)}`);
}

function spriteIds(overlay, sheetId) {
  return overlay.sprites
    .filter((sprite) => sprite.sheetId === sheetId)
    .map((sprite) => sprite.spriteId);
}

async function openPlayerContextMenu(window) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const delayFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const canvas = document.querySelector(".runtimeViewport canvas");
      if (!canvas) {
        return { ok: false, error: "missing runtime canvas" };
      }
      const rect = canvas.getBoundingClientRect();
      const offsets = [
        [260, 180],
        [240, 180],
        [280, 180],
        [260, 160],
        [260, 200],
        [220, 180],
        [300, 180],
        [260, 140],
        [260, 220]
      ];
      for (let y = 80; y <= rect.height - 80; y += 40) {
        for (let x = 80; x <= rect.width - 80; x += 40) {
          offsets.push([x, y]);
        }
      }
      const attempts = [];
      for (const [x, y] of offsets) {
        canvas.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId: 99,
          pointerType: "mouse",
          isPrimary: true,
          button: 2,
          buttons: 2,
          clientX: rect.left + x,
          clientY: rect.top + y
        }));
        await delayFrame();
        let menu = document.querySelector(".nhContextMenu");
        if (!menu) {
          canvas.dispatchEvent(new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 2,
            buttons: 2,
            clientX: rect.left + x,
            clientY: rect.top + y
          }));
          await delayFrame();
          menu = document.querySelector(".nhContextMenu");
        }
        const options = menu
          ? Array.from(menu.querySelectorAll(".nhContextMenuOption")).map((option) => ({
              text: option.textContent ?? "",
              actionKind: option.getAttribute("data-menu-action-kind") ?? "",
              opcode: Number(option.getAttribute("data-menu-opcode"))
            }))
          : [];
        attempts.push({ x, y, options });
        if (options.some((option) => option.text.includes("Attack Opponent") && option.actionKind === "attack")) {
          return { ok: true, x, y, options, attempts };
        }
      }
      return { ok: false, error: "could not open player Attack context menu", attempts };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function clickTopContextMenuOption(window) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const option = document.querySelector(".nhContextMenuOption");
      if (!option) {
        return { ok: false, error: "missing top context menu option" };
      }
      option.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        ok: true,
        dataset: { ...document.querySelector(".runtimeViewport")?.dataset }
      };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function waitForManualCombatOverlays(window) {
  const deadline = Date.now() + 8000;
  let lastSnapshot = null;

  while (Date.now() < deadline) {
    await waitForPaint(window);
    const snapshot = await readOverlaySnapshot(window);
    lastSnapshot = snapshot;
    const opponentOverlays = Array.isArray(snapshot?.overlays)
      ? snapshot.overlays.filter((overlay) => overlay.actorId === "opponent")
      : [];
    const healthBars = opponentOverlays.filter((overlay) => overlay.spriteSheetId === "health_bars");
    const hitsplats = opponentOverlays.filter((overlay) => overlay.spriteSheetId === "hitsplats");
    if (
      snapshot?.cycle >= 1 &&
      healthBars.length === 1 &&
      hitsplats.length >= 1 &&
      hitsplats.some((overlay) => overlay.hitsplat && Number.isFinite(overlay.hitsplat.value))
    ) {
      return { snapshot, healthBar: healthBars[0], hitsplat: hitsplats[0] };
    }
    await delay(150);
  }

  throw new Error(`Timed out waiting for manual combat hitsplat/health-bar overlays: ${JSON.stringify(lastSnapshot)}`);
}

async function readDomOverlaySnapshot(window) {
  return window.webContents.executeJavaScript(`
    (() => Array.from(document.querySelectorAll(".nhActorOverlay")).map((overlay) => {
      const rect = overlay.getBoundingClientRect();
      return {
        actorId: overlay.getAttribute("data-actor-id") ?? "",
        sheetId: overlay.getAttribute("data-sprite-sheet-id") ?? "",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        sprites: Array.from(overlay.querySelectorAll(".nhActorOverlaySprite")).map((sprite) => {
          const spriteRect = sprite.getBoundingClientRect();
          const style = getComputedStyle(sprite);
          return {
            sheetId: sprite.getAttribute("data-sprite-sheet-id") ?? "",
            spriteId: Number(sprite.getAttribute("data-sprite-id")),
            left: spriteRect.left,
            top: spriteRect.top,
            width: spriteRect.width,
            height: spriteRect.height,
            opacity: Number(style.opacity),
            backgroundImage: style.backgroundImage
          };
        })
      };
    }))()
  `);
}

async function waitForDomOverlaySnapshot(window, predicate, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastSnapshot = [];

  while (Date.now() < deadline) {
    await waitForPaint(window);
    const snapshot = await readDomOverlaySnapshot(window);
    lastSnapshot = snapshot;
    if (predicate(snapshot)) {
      return snapshot;
    }
    await delay(100);
  }

  throw new Error(`Timed out waiting for DOM overlays (${label}): ${JSON.stringify(lastSnapshot)}`);
}

function domOverlaysForActor(overlays, actorId) {
  return overlays.filter((overlay) => overlay.actorId === actorId);
}

function domOverlaySheetIds(overlays) {
  return overlays.map((overlay) => overlay.sheetId);
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      backgroundThrottling: false,
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    const runtimeReadyMessage = await window.loadFile(path.join(projectRoot, "dist", "index.html")).then(() => waitForReady(window));
    await setManualControl(window, false);
    await selectRuntimeReplay(window, "two-actor-barrage-into-range-v1");
    await setRuntimeCamera(window, "isometric");
    await setRuntimeCycle(window, 3);
    const snapshot = await waitForOverlaySnapshot(window, 3);

    const opponentOverlays = snapshot.overlays.filter((overlay) => overlay.actorId === "opponent");
    const healthBar = opponentOverlays.find((overlay) => overlay.spriteSheetId === "health_bars");
    const healthBars = opponentOverlays.filter((overlay) => overlay.spriteSheetId === "health_bars");
    const pkSkull = opponentOverlays.find((overlay) => overlay.spriteSheetId === "pk_skull");
    const prayer = opponentOverlays.find((overlay) => overlay.spriteSheetId === "prayer_overheads");
    const hitsplat = opponentOverlays.find((overlay) => overlay.spriteSheetId === "hitsplats");

    assert(healthBar, `missing opponent health-bar overlay: ${JSON.stringify(snapshot)}`);
    assert(healthBars.length === 1, `opponent health bars should not stack or duplicate: ${JSON.stringify(healthBars)}`);
    assert(pkSkull, `missing opponent pk skull overlay: ${JSON.stringify(snapshot)}`);
    assert(prayer, `missing opponent prayer overlay: ${JSON.stringify(snapshot)}`);
    assert(hitsplat, `missing opponent hitsplat overlay: ${JSON.stringify(snapshot)}`);

    assert(healthBar.healthBar?.definitionId === 0, `health bar should use source definition 0: ${JSON.stringify(healthBar)}`);
    assert(healthBar.healthBar.frontSpriteId === 2176 && healthBar.healthBar.backSpriteId === 2177, `health bar should use cache sprites 2176/2177: ${JSON.stringify(healthBar)}`);
    assert(healthBar.healthBar.previousHealth === 30 && healthBar.healthBar.targetHealth === 22, `health bar should carry previous-to-target source health units: ${JSON.stringify(healthBar)}`);
    assert(healthBar.healthBar.cycleOffset === 1, `health bar should carry a nonzero source-style cycleOffset: ${JSON.stringify(healthBar)}`);
    assert(spriteIds(healthBar, "health_bars").includes(2176), `health bar debug should include front sprite source: ${JSON.stringify(healthBar)}`);
    assert(spriteIds(healthBar, "health_bars").includes(2177), `health bar debug should include back sprite source: ${JSON.stringify(healthBar)}`);

    assert(pkSkull.spriteId === 439 && pkSkull.spriteFrame === 0, `pk skull should use source sprite 439 frame 0: ${JSON.stringify(pkSkull)}`);
    assert(spriteIds(pkSkull, "pk_skull").includes(439), `pk skull should expose pk_skull atlas source: ${JSON.stringify(pkSkull)}`);
    assert(prayer.spriteId === 440 && prayer.spriteFrame === 2, `protect-from-magic should use prayer sprite 440 frame 2: ${JSON.stringify(prayer)}`);
    assert(spriteIds(prayer, "prayer_overheads").includes(440), `prayer should expose prayer_overheads atlas source: ${JSON.stringify(prayer)}`);

    assert(hitsplat.hitsplat?.typeId === 1 && hitsplat.hitsplat.value === 27, `hitsplat should carry source-shaped damage packet value: ${JSON.stringify(hitsplat)}`);
    assert(spriteIds(hitsplat, "hitsplats").includes(1359), `damage hitsplat should draw cache sprite 1359: ${JSON.stringify(hitsplat)}`);
    assert(spriteIds(hitsplat, "hitsplat_digits").includes(50) && spriteIds(hitsplat, "hitsplat_digits").includes(55), `damage hitsplat should draw p11 digit sprites for 27: ${JSON.stringify(hitsplat)}`);
    assert(healthBar.sortValue < pkSkull.sortValue, `health bars should sort below skull icons: ${JSON.stringify(opponentOverlays)}`);
    assert(pkSkull.sortValue < prayer.sortValue, `skull icons should sort below prayer icons: ${JSON.stringify(opponentOverlays)}`);
    assert(prayer.sortValue < hitsplat.sortValue, `prayer icons should sort below hitsplats: ${JSON.stringify(opponentOverlays)}`);
    const replayDomOverlays = await waitForDomOverlaySnapshot(
      window,
      (overlays) => {
        const opponentDomOverlays = domOverlaysForActor(overlays, "opponent");
        const sheets = new Set(domOverlaySheetIds(opponentDomOverlays));
        return (
          opponentDomOverlays.filter((overlay) => overlay.sheetId === "health_bars").length === 1 &&
          sheets.has("hitsplats") &&
          sheets.has("pk_skull") &&
          sheets.has("prayer_overheads")
        );
      },
      "replay overhead icons and combat overlays"
    );
    const replayOpponentDomOverlays = domOverlaysForActor(replayDomOverlays, "opponent");

    await focusRuntimeSection(window);
    await setManualControl(window, true);
    await setRuntimeCamera(window, "isometric");
    await setRuntimeCycle(window, 200);
    const manualMenu = await openPlayerContextMenu(window);
    const manualAttack = await clickTopContextMenuOption(window);
    if (manualAttack.dataset.lastPlayerAttackCommand !== "Attack") {
      throw new Error(`manual Attack click did not enter PlayerCombat path: ${JSON.stringify(manualAttack)}`);
    }
    if (
      manualAttack.dataset.lastManualOpponentPolicyAction?.startsWith("magic,") &&
      manualAttack.dataset.lastManualOpponentLoadoutId !== "kodai-robes"
    ) {
      throw new Error(`manual opponent magic action must render through the Kodai robe loadout: ${JSON.stringify(manualAttack.dataset)}`);
    }
    const manualCombat = await waitForManualCombatOverlays(window);
    const domOverlays = await waitForDomOverlaySnapshot(
      window,
      (overlays) => {
        const opponentDomOverlays = domOverlaysForActor(overlays, "opponent");
        const sheets = new Set(domOverlaySheetIds(opponentDomOverlays));
        return opponentDomOverlays.filter((overlay) => overlay.sheetId === "health_bars").length === 1 && sheets.has("hitsplats") && sheets.has("pk_skull");
      },
      "manual combat health bar, hitsplat, and skull"
    );
    const opponentDomOverlays = domOverlaysForActor(domOverlays, "opponent");
    const opponentDomHealthBars = opponentDomOverlays.filter((overlay) => overlay.sheetId === "health_bars");
    const opponentDomHitsplats = opponentDomOverlays.filter((overlay) => overlay.sheetId === "hitsplats");
    const opponentDomSkull = opponentDomOverlays.find((overlay) => overlay.sheetId === "pk_skull");
    const opponentDomHealthSprites = opponentDomHealthBars.flatMap((overlay) => overlay.sprites);
    const opponentDomHitsplatSprites = opponentDomHitsplats.flatMap((overlay) => overlay.sprites);
    assert(domOverlays.length > 0, `actor overlays should be present in the Nh 2D DOM overlay layer: ${JSON.stringify(domOverlays)}`);
    assert(
      opponentDomHealthBars.length === 1,
      `opponent should have one visible DOM health bar, not missing or stacked bars: ${JSON.stringify(opponentDomOverlays)}`
    );
    assert(opponentDomHitsplats.length >= 1, `opponent should have a visible DOM hitsplat: ${JSON.stringify(opponentDomOverlays)}`);
    assert(opponentDomSkull, `opponent should have a visible DOM pk skull: ${JSON.stringify(opponentDomOverlays)}`);
    assert(
      opponentDomHealthSprites.some((sprite) => sprite.backgroundImage.includes("health_bars.png")),
      `DOM health bar should draw from the health bar atlas: ${JSON.stringify(opponentDomHealthSprites)}`
    );
    assert(
      opponentDomHitsplatSprites.some((sprite) => sprite.backgroundImage.includes("hitsplats.png")) &&
        opponentDomHitsplatSprites.some((sprite) => sprite.backgroundImage.includes("hitsplat_digits.png")),
      `DOM hitsplat should draw both the splat and digit atlases: ${JSON.stringify(opponentDomHitsplatSprites)}`
    );
    assert(
      manualCombat.healthBar.id === "opponent-runtime-health",
      `manual health bar should be sourced from live combat state: ${JSON.stringify(manualCombat.healthBar)}`
    );
    assert(
      manualCombat.hitsplat.id.includes("opponent") && manualCombat.hitsplat.hitsplat.value >= 0,
      `manual hitsplat should be sourced from live combat state: ${JSON.stringify(manualCombat.hitsplat)}`
    );

    console.log(
      JSON.stringify(
        {
          runtimeReadyMessage,
          cycle: snapshot.cycle,
          overlayCount: snapshot.overlays.length,
          opponent: {
            healthBar,
            pkSkull,
            prayer,
            hitsplat
          },
          manualCombat: {
            menu: manualMenu,
            attackDataset: manualAttack.dataset,
            cycle: manualCombat.snapshot.cycle,
            healthBar: manualCombat.healthBar,
            hitsplat: manualCombat.hitsplat,
            replayDomOverlaySheets: domOverlaySheetIds(replayOpponentDomOverlays),
            domOverlayCount: domOverlays.length,
            domOpponentOverlaySheets: opponentDomOverlays.map((overlay) => overlay.sheetId)
          }
        },
        null,
        2
      )
    );
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
