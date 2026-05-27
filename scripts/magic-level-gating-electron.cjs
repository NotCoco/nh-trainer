const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const [, , projectRoot] = process.argv;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(window, script, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await window.webContents.executeJavaScript(script);
    if (ok) {
      return;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function clickSelector(window, selector) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) {
        return { ok: false, error: "missing element", selector: ${JSON.stringify(selector)} };
      }
      const rect = element.getBoundingClientRect();
      const eventBase = {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        buttons: 1,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      };
      element.dispatchEvent(new PointerEvent("pointerdown", eventBase));
      element.dispatchEvent(new PointerEvent("pointerup", { ...eventBase, buttons: 0 }));
      element.dispatchEvent(new MouseEvent("click", eventBase));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
}

async function readSpellIcons(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const icon = (spellId) => {
        const element = document.querySelector('.nhSpellbookIconSprite[data-spell-id="' + spellId + '"]');
        if (!element) {
          return null;
        }
        const style = getComputedStyle(element);
        return {
          spellId,
          spriteId: Number(element.getAttribute("data-sprite-id")),
          enabledSpriteId: Number(element.getAttribute("data-enabled-sprite-id")),
          disabledSpriteId: Number(element.getAttribute("data-disabled-sprite-id")),
          currentMagicLevel: Number(element.getAttribute("data-current-magic-level")),
          baseMagicLevel: Number(element.getAttribute("data-base-magic-level")),
          requiredMagicLevel: Number(element.getAttribute("data-required-magic-level")),
          canCast: element.getAttribute("data-magic-level-can-cast") === "true",
          selectable: element.getAttribute("data-selectable") === "true",
          levelFilterAllows: element.getAttribute("data-level-filter-allows") === "true",
          width: Math.round(element.getBoundingClientRect().width),
          height: Math.round(element.getBoundingClientRect().height),
          backgroundImage: style.backgroundImage
        };
      };
      return {
        bloodBlitz: icon("blood-blitz"),
        iceBlitz: icon("ice-blitz"),
        bloodBarrage: icon("blood-barrage"),
        iceBarrage: icon("ice-barrage")
      };
    })()
  `);
}

function assertEnabledIcons(icons) {
  assert(icons.bloodBlitz?.spriteId === 335, `Blood Blitz should start on enabled sprite 335: ${JSON.stringify(icons)}`);
  assert(icons.iceBlitz?.spriteId === 327, `Ice Blitz should start on enabled sprite 327: ${JSON.stringify(icons)}`);
  assert(icons.bloodBarrage?.spriteId === 336, `Blood Barrage should start on enabled sprite 336: ${JSON.stringify(icons)}`);
  assert(icons.iceBarrage?.spriteId === 328, `Ice Barrage should start on enabled sprite 328: ${JSON.stringify(icons)}`);
  assert(
    icons.bloodBlitz.canCast && icons.iceBlitz.canCast && icons.bloodBarrage.canCast && icons.iceBarrage.canCast,
    `99 Magic should render Blitz and Barrage spells castable: ${JSON.stringify(icons)}`
  );
}

function assertBrewDrainedIcons(icons) {
  assert(icons.bloodBlitz?.requiredMagicLevel === 80, `Blood Blitz should expose Nh requirement 80: ${JSON.stringify(icons)}`);
  assert(icons.iceBlitz?.requiredMagicLevel === 82, `Ice Blitz should expose Nh requirement 82: ${JSON.stringify(icons)}`);
  assert(icons.bloodBarrage?.requiredMagicLevel === 92, `Blood Barrage should expose Nh requirement 92: ${JSON.stringify(icons)}`);
  assert(icons.iceBarrage?.requiredMagicLevel === 94, `Ice Barrage should expose Nh requirement 94: ${JSON.stringify(icons)}`);
  assert(icons.bloodBarrage.currentMagicLevel === 90, `Saradomin brew should drain current Magic from 99 to 90 in the HUD path: ${JSON.stringify(icons)}`);
  assert(icons.iceBarrage.currentMagicLevel === 90, `Ice Barrage should see the same brew-drained current Magic level: ${JSON.stringify(icons)}`);
  assert(icons.bloodBlitz.spriteId === 335, `Blood Blitz should remain enabled at current Magic 90: ${JSON.stringify(icons)}`);
  assert(icons.iceBlitz.spriteId === 327, `Ice Blitz should remain enabled at current Magic 90: ${JSON.stringify(icons)}`);
  assert(icons.bloodBarrage.spriteId === 386, `Blood Barrage should render disabled sprite 386 below current Magic 92: ${JSON.stringify(icons)}`);
  assert(icons.iceBarrage.spriteId === 378, `Ice Barrage should render disabled sprite 378 below current Magic 94: ${JSON.stringify(icons)}`);
  assert(icons.bloodBlitz.canCast && icons.iceBlitz.canCast, `Blitz spells should remain castable after brew-drained current Magic 90: ${JSON.stringify(icons)}`);
  assert(!icons.bloodBarrage.canCast && !icons.iceBarrage.canCast, `Barrage spells should not be castable after brew-drained current Magic: ${JSON.stringify(icons)}`);
  assert(
    icons.bloodBlitz.selectable && icons.iceBlitz.selectable && icons.bloodBarrage.selectable && icons.iceBarrage.selectable,
    `Nh keeps the Cast op selectable; server combat rejects low-level casts: ${JSON.stringify(icons)}`
  );
  assert(
    icons.bloodBlitz.levelFilterAllows && icons.iceBlitz.levelFilterAllows && icons.bloodBarrage.levelFilterAllows && icons.iceBarrage.levelFilterAllows,
    `script2619 should not hide spells when base Magic is still 99: ${JSON.stringify(icons)}`
  );
  assert(
    icons.bloodBlitz.backgroundImage.includes("spell_icons") &&
      icons.iceBlitz.backgroundImage.includes("spell_icons") &&
      icons.bloodBarrage.backgroundImage.includes("spell_icons") &&
      icons.iceBarrage.backgroundImage.includes("spell_icons"),
    `Rendered buttons should still use the cache spell icon atlas: ${JSON.stringify(icons)}`
  );
}

function assertSourceGuards() {
  const hudSource = fs.readFileSync(path.join(projectRoot, "src", "ui", "NhClientHud.tsx"), "utf8");
  const combatSource = fs.readFileSync(path.join(projectRoot, "src", "sim", "runtimePlayerCombat.ts"), "utf8");
  assert(hudSource.includes("data-source-castable-state"), "NhClientHud should document script2614 spell disabled sprite behavior");
  assert(combatSource.includes("resetRuntimePlayerCombatFailedSpellCast"), "runtime combat should reset failed low-level spell casts like PlayerCombat.attackWithMagic");
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const hardTimeout = setTimeout(() => {
    app.exit(2);
  }, 40000);

  try {
    assertSourceGuards();
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    await waitFor(
      window,
      `Boolean(document.querySelector('.runtimeViewport') && document.querySelector('.nhInventorySlot[data-inventory-item-id="6685"]'))`,
      "runtime inventory HUD"
    );

    await clickSelector(window, '.nhSideTabButton[data-tab-id="magic"]');
    await waitFor(window, `document.querySelectorAll('.nhSpellbookIconSprite').length >= 26`, "magic spellbook icons");
    const enabledIcons = await readSpellIcons(window);
    assertEnabledIcons(enabledIcons);

    await clickSelector(window, '.nhSideTabButton[data-tab-id="inventory"]');
    await clickSelector(window, '.nhInventorySlot[data-inventory-item-id="6685"]');
    await clickSelector(window, '.nhSideTabButton[data-tab-id="magic"]');
    await waitFor(
      window,
      `document.querySelector('.nhSpellbookIconSprite[data-spell-id="ice-barrage"]')?.getAttribute('data-current-magic-level') === "90"`,
      "brew-drained spellbook state"
    );
    const drainedIcons = await readSpellIcons(window);
    assertBrewDrainedIcons(drainedIcons);

    clearTimeout(hardTimeout);
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          enabledIcons,
          drainedIcons
        },
        null,
        2
      )}\n`,
      () => app.exit(0)
    );
  } catch (error) {
    clearTimeout(hardTimeout);
    console.error(error);
    app.exit(1);
  }
});
