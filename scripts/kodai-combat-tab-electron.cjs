const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const [, , projectRoot, screenshotPath] = process.argv;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(window) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(`
      (() => Boolean(
        document.querySelector(".runeliteClientShell") &&
        document.querySelector(".glbStatus-ready") &&
        document.querySelector('.kronosSideTabButton[data-tab-id="combat"]')
      ))()
    `);
    if (ready) {
      return;
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the trainer runtime shell.");
}

async function openCombatTabWithKodai(window) {
  return window.webContents.executeJavaScript(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const mageButton = Array.from(document.querySelectorAll('.runtimeButtonRow[aria-label="Manual local actor style"] button'))
        .find((button) => (button.textContent ?? "").trim() === "Mage");
      if (!mageButton) {
        return { ok: false, error: "missing manual Mage loadout button" };
      }
      mageButton.click();
      await nextFrame();
      await nextFrame();

      const combatTab = document.querySelector('.kronosSideTabButton[data-tab-id="combat"]');
      if (!combatTab) {
        return { ok: false, error: "missing combat side tab" };
      }
      const rect = combatTab.getBoundingClientRect();
      combatTab.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        buttons: 1,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      }));
      combatTab.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        buttons: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      }));
      combatTab.click();
      await nextFrame();
      await nextFrame();
      return { ok: true };
    })()
  `);
}

async function readKodaiCombatState(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const styleRect = (element) => {
        if (!element) {
          return null;
        }
        const style = getComputedStyle(element);
        return {
          left: Number.parseFloat(style.left),
          top: Number.parseFloat(style.top),
          width: Number.parseFloat(style.width),
          height: Number.parseFloat(style.height)
        };
      };
      const shell = document.querySelector(".runeliteClientShell");
      const shellRect = shell?.getBoundingClientRect();
      const panel = document.querySelector(".kronosCombatPanelLayer");
      const styles = Array.from(document.querySelectorAll(".kronosCombatStyleSlot")).map((slot) => {
        const slotIndex = slot.getAttribute("data-slot-index") ?? "";
        const icon = document.querySelector('.kronosCombatStyleIconSprite[data-slot-index="' + slotIndex + '"]');
        const iconFrame = icon?.querySelector(".kronosCombatSourceSpriteFrame") ?? null;
        const text = document.querySelector('.kronosCombatStyleText[data-slot-index="' + slotIndex + '"]');
        const buttonFrame = document.querySelector('.kronosCombatStyleButtonSprite[data-slot-index="' + slotIndex + '"]');
        const buttonPieces = Array.from(buttonFrame?.querySelectorAll(".kronosCombatOptionsButtonPiece") ?? []).map((piece) => ({
          key: piece.getAttribute("data-options-button-piece") ?? "",
          rect: styleRect(piece)
        }));
        const iconStyle = iconFrame ? getComputedStyle(iconFrame) : null;
        return {
          slotIndex: Number(slotIndex),
          childId: Number(slot.getAttribute("data-attack-set-child-id")),
          label: slot.getAttribute("data-attack-type-label") ?? "",
          attackType: slot.getAttribute("data-attack-type") ?? "",
          attackStyle: slot.getAttribute("data-attack-style") ?? "",
          iconAlias: slot.getAttribute("data-icon-sprite-alias") ?? "",
          iconSource: slot.getAttribute("data-icon-sprite-source") ?? "",
          sourceGraphic: slot.getAttribute("data-source-graphic") ?? "",
          iconSpriteId: Number(icon?.getAttribute("data-source-sprite-id")),
          iconSpriteAlias: icon?.getAttribute("data-source-sprite-alias") ?? "",
          iconBackground: iconStyle?.backgroundImage ?? "",
          iconFrameRect: styleRect(iconFrame),
          iconSpriteWidth: Number(icon?.getAttribute("data-source-sprite-width")),
          iconSpriteHeight: Number(icon?.getAttribute("data-source-sprite-height")),
          iconSpriteOffsetX: Number(icon?.getAttribute("data-source-sprite-offset-x")),
          iconSpriteOffsetY: Number(icon?.getAttribute("data-source-sprite-offset-y")),
          iconSpriteMaxWidth: Number(icon?.getAttribute("data-source-sprite-max-width")),
          iconSpriteMaxHeight: Number(icon?.getAttribute("data-source-sprite-max-height")),
          buttonFrameRect: styleRect(buttonFrame),
          buttonFrameSource: buttonFrame?.getAttribute("data-options-button-source") ?? "",
          buttonPieceCount: Number(buttonFrame?.getAttribute("data-options-button-piece-count")),
          buttonPieces,
          rect: styleRect(slot),
          iconRect: styleRect(icon),
          textRect: styleRect(text)
        };
      });
      const autocast = Array.from(document.querySelectorAll(".kronosCombatAutocastSource")).map((control) => ({
        childId: Number(control.getAttribute("data-action-child-id")),
        weaponType: control.getAttribute("data-weapon-type") ?? "",
        weaponTypeConfig: control.getAttribute("data-weapon-type-config") ?? "",
        spellId: control.getAttribute("data-autocast-spell-id") ?? "",
        selected: control.getAttribute("data-selected") ?? "",
        rect: styleRect(control)
      }));
      const specOrb = document.querySelector(".kronosFixedOrb-spec");
      return {
        activeSideTab: document.querySelector(".runtimeViewport")?.getAttribute("data-active-side-tab-id") ?? "",
        panel: panel ? {
          rect: {
            left: Number(panel.getAttribute("data-panel-x")),
            top: Number(panel.getAttribute("data-panel-y")),
            width: Number(panel.getAttribute("data-panel-width")),
            height: Number(panel.getAttribute("data-panel-height"))
          },
          weaponItemId: panel.getAttribute("data-weapon-item-id") ?? "",
          weaponName: panel.getAttribute("data-weapon-name") ?? "",
          weaponType: panel.getAttribute("data-weapon-type") ?? "",
          weaponTypeConfig: panel.getAttribute("data-weapon-type-config") ?? "",
          weaponTypeSource: panel.getAttribute("data-weapon-type-source") ?? ""
        } : null,
        styles,
        autocast,
        autoRetaliateRect: styleRect(document.querySelector(".kronosCombatAutoRetaliateSource")),
        specOrb: specOrb ? {
          active: specOrb.getAttribute("data-active") ?? "",
          actionEnabled: specOrb.getAttribute("data-action-enabled") ?? "",
          displayedFillerSpriteId: Number(specOrb.getAttribute("data-displayed-filler-sprite-id")),
          fillerSpriteId: Number(specOrb.getAttribute("data-filler-sprite-id")),
          activeFillerSpriteId: Number(specOrb.getAttribute("data-active-filler-sprite-id")),
          sourceFillerTransparency: Number(specOrb.getAttribute("data-source-filler-transparency")),
          sourceDrawState: specOrb.getAttribute("data-source-draw-state") ?? "",
          hitboxCount: specOrb.querySelectorAll(".kronosFixedOrbHitbox").length
        } : null,
        staleCombatWidgetCount: document.querySelectorAll(
          '.kronosMountedWidgetLayer[data-group-id="593"] .kronosWidgetRectangle[data-child-id], ' +
          '.kronosMountedWidgetLayer[data-group-id="593"] .kronosWidgetSprite[data-child-id], ' +
          '.kronosMountedWidgetLayer[data-group-id="593"] .kronosWidgetText[data-child-id]'
        ).length,
        specialBarCount: document.querySelectorAll(".kronosCombatSpecialBar").length,
        specOrbCount: document.querySelectorAll(".kronosFixedOrb-spec").length,
        screenshotClip: shellRect
          ? {
              x: Math.max(0, Math.floor(shellRect.left)),
              y: Math.max(0, Math.floor(shellRect.top)),
              width: Math.ceil(shellRect.width),
              height: Math.ceil(shellRect.height)
            }
          : null
      };
    })()
  `);
}

function assertKodaiCombatState(state) {
  const expectedStyles = [
    {
      slotIndex: 0,
      childId: 3,
      label: "Bash",
      attackType: "ACCURATE",
      attackStyle: "CRUSH",
      iconAlias: "combat_icon_wand_bash",
      sourceGraphic: "combaticons2,13",
      spriteRect: { width: 32, height: 16, offsetX: 1, offsetY: 1, maxWidth: 34, maxHeight: 24 }
    },
    {
      slotIndex: 1,
      childId: 7,
      label: "Pound",
      attackType: "AGGRESSIVE",
      attackStyle: "CRUSH",
      iconAlias: "combat_icon_wand_pound",
      sourceGraphic: "combaticons2,14",
      spriteRect: { width: 23, height: 23, offsetX: 7, offsetY: 1, maxWidth: 34, maxHeight: 24 }
    },
    {
      slotIndex: 3,
      childId: 15,
      label: "Focus",
      attackType: "DEFENSIVE",
      attackStyle: "CRUSH",
      iconAlias: "combat_icon_wand_focus",
      sourceGraphic: "combaticons,19",
      spriteRect: { width: 25, height: 23, offsetX: 5, offsetY: 1, maxWidth: 34, maxHeight: 24 }
    }
  ];
  const compactStyles = state.styles.map(({ slotIndex, childId, label, attackType, attackStyle, iconAlias, sourceGraphic }) => ({
    slotIndex,
    childId,
    label,
    attackType,
    attackStyle,
    iconAlias,
    sourceGraphic
  }));
  const compactExpectedStyles = expectedStyles.map(({ slotIndex, childId, label, attackType, attackStyle, iconAlias, sourceGraphic }) => ({
    slotIndex,
    childId,
    label,
    attackType,
    attackStyle,
    iconAlias,
    sourceGraphic
  }));
  if (
    state.activeSideTab !== "combat" ||
    state.panel?.weaponItemId !== "21006" ||
    state.panel?.weaponName !== "Kodai wand" ||
    state.panel?.weaponType !== "WAND" ||
    state.panel?.weaponTypeConfig !== "18" ||
    JSON.stringify(compactStyles) !== JSON.stringify(compactExpectedStyles) ||
    state.styles.some((style) => style.slotIndex === 2) ||
    state.styles.some((style) => style.iconSource !== "client-script-graphic") ||
    state.styles.some((style) => style.iconAlias !== style.iconSpriteAlias) ||
    state.styles.some((style) => !Number.isInteger(style.iconSpriteId) || style.iconSpriteId <= 0) ||
    state.styles.some((style) => !style.iconBackground.includes("client_ui.png")) ||
    state.styles.some((style) => style.buttonPieceCount !== 9) ||
    state.styles.some((style) => style.buttonFrameSource !== "combat_style_button_sliced") ||
    state.styles.some((style) => !["bottom-left", "bottom", "bottom-right"].every((key) => style.buttonPieces.some((piece) => piece.key === key))) ||
    state.autocast.length < 1 ||
    state.autocast.some((control) => control.weaponType !== "WAND" || control.weaponTypeConfig !== "18" || control.spellId !== "ice-barrage") ||
    state.staleCombatWidgetCount !== 0 ||
    state.specialBarCount !== 0 ||
    state.specOrbCount !== 1 ||
    !state.specOrb ||
    state.specOrb.actionEnabled !== "false" ||
    state.specOrb.active !== "false" ||
    state.specOrb.displayedFillerSpriteId !== 1064 ||
    state.specOrb.fillerSpriteId !== 1607 ||
    state.specOrb.activeFillerSpriteId !== 1608 ||
    state.specOrb.sourceFillerTransparency !== 50 ||
    state.specOrb.sourceDrawState !== "orbs_spec_draw_button:no-special" ||
    state.specOrb.hitboxCount !== 0
  ) {
    throw new Error(`Kodai combat tab state mismatch: ${JSON.stringify(state, null, 2)}`);
  }

  for (const expectedStyle of expectedStyles) {
    const style = state.styles.find((candidate) => candidate.slotIndex === expectedStyle.slotIndex);
    if (
      !style ||
      style.iconSpriteWidth !== expectedStyle.spriteRect.width ||
      style.iconSpriteHeight !== expectedStyle.spriteRect.height ||
      style.iconSpriteOffsetX !== expectedStyle.spriteRect.offsetX ||
      style.iconSpriteOffsetY !== expectedStyle.spriteRect.offsetY ||
      style.iconSpriteMaxWidth !== expectedStyle.spriteRect.maxWidth ||
      style.iconSpriteMaxHeight !== expectedStyle.spriteRect.maxHeight
    ) {
      throw new Error(`Kodai combat tab sprite frame mismatch: ${JSON.stringify({ style, expectedStyle }, null, 2)}`);
    }
  }

  const panelOrigin = state.panel?.rect ?? { left: 0, top: 0 };
  const expectedStyleRects = new Map([
    [0, offsetRect(panelOrigin, { left: 20, top: 45, width: 71, height: 32 })],
    [1, offsetRect(panelOrigin, { left: 20, top: 81, width: 71, height: 32 })],
    [3, offsetRect(panelOrigin, { left: 20, top: 117, width: 71, height: 32 })]
  ]);
  for (const style of state.styles) {
    assertRect(`style slot ${style.slotIndex}`, style.rect, expectedStyleRects.get(style.slotIndex));
    assertRect(`style button frame ${style.slotIndex}`, style.buttonFrameRect, expectedStyleRects.get(style.slotIndex));
  }

  const expectedAutocastRects = new Map([
    [21, offsetRect(panelOrigin, { left: 99, top: 45, width: 71, height: 50 })],
    [26, offsetRect(panelOrigin, { left: 99, top: 99, width: 71, height: 50 })]
  ]);
  for (const control of state.autocast) {
    assertRect(`autocast child ${control.childId}`, control.rect, expectedAutocastRects.get(control.childId));
  }
  assertRect("auto retaliate", state.autoRetaliateRect, offsetRect(panelOrigin, { left: 20, top: 153, width: 150, height: 44 }));

  for (const style of state.styles) {
    for (const control of state.autocast) {
      if (rectsOverlap(style.rect, control.rect) || rectsOverlap(style.iconRect, control.rect) || rectsOverlap(style.textRect, control.rect)) {
        throw new Error(`Kodai combat tab layout overlap: ${JSON.stringify({ style, control }, null, 2)}`);
      }
    }
  }
}

function assertRect(label, actual, expected) {
  if (!expected || !actual || !rectEquals(actual, expected)) {
    throw new Error(`Kodai combat tab ${label} rect mismatch: ${JSON.stringify({ actual, expected }, null, 2)}`);
  }
}

function offsetRect(origin, rect) {
  return {
    left: origin.left + rect.left,
    top: origin.top + rect.top,
    width: rect.width,
    height: rect.height
  };
}

function rectEquals(actual, expected) {
  return (
    Math.round(actual.left) === expected.left &&
    Math.round(actual.top) === expected.top &&
    Math.round(actual.width) === expected.width &&
    Math.round(actual.height) === expected.height
  );
}

function rectsOverlap(a, b) {
  if (!a || !b) {
    return false;
  }
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      partition: `kodai-combat-tab-${Date.now()}`
    }
  });

  try {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    await waitForReady(window);
    const openResult = await openCombatTabWithKodai(window);
    if (!openResult.ok) {
      throw new Error(JSON.stringify(openResult));
    }
    const state = await readKodaiCombatState(window);
    assertKodaiCombatState(state);
    if (screenshotPath) {
      const screenshot = await window.capturePage(state.screenshotClip ?? undefined);
      await fs.writeFile(screenshotPath, screenshot.toPNG());
      state.screenshotPath = screenshotPath;
    }
    console.log(JSON.stringify(state, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
