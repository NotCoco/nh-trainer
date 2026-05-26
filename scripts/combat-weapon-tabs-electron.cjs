const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const [, , projectRoot, screenshotPath] = process.argv;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForGameTick() {
  return delay(1500);
}

async function waitForReady(window) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(`
      (() => Boolean(
        document.querySelector(".runeliteClientShell") &&
        document.querySelector(".glbStatus-ready") &&
        document.querySelector('.kronosSideTabButton[data-tab-id="combat"]') &&
        document.querySelector('.kronosSideTabButton[data-tab-id="inventory"]')
      ))()
    `);
    if (ready) {
      return;
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the trainer runtime shell.");
}

async function clickManualLoadout(window, label) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const button = Array.from(document.querySelectorAll('.runtimeButtonRow[aria-label="Manual local actor style"] button'))
        .find((candidate) => (candidate.textContent ?? "").trim() === ${JSON.stringify(label)});
      if (!button) {
        return { ok: false, error: "missing manual loadout button", label: ${JSON.stringify(label)} };
      }
      button.click();
      await nextFrame();
      await nextFrame();
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
}

async function clickSideTab(window, tabId) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const tab = document.querySelector(${JSON.stringify(`.kronosSideTabButton[data-tab-id="${tabId}"]`)});
      if (!tab) {
        return { ok: false, error: "missing side tab", tabId: ${JSON.stringify(tabId)} };
      }
      const rect = tab.getBoundingClientRect();
      tab.dispatchEvent(new PointerEvent("pointerdown", {
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
      tab.dispatchEvent(new PointerEvent("pointerup", {
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
      tab.click();
      await nextFrame();
      await nextFrame();
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
}

async function leftClickInventorySlot(window, slotIndex) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const slot = document.querySelector(${JSON.stringify(`.kronosInventorySlot[data-slot-index="${slotIndex}"]`)});
      if (!slot) {
        return { ok: false, error: "missing inventory slot", slotIndex: ${JSON.stringify(slotIndex)} };
      }
      const rect = slot.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;
      const target = document.elementFromPoint(clientX, clientY);
      if (!target || target.closest(${JSON.stringify(`.kronosInventorySlot[data-slot-index="${slotIndex}"]`)}) !== slot) {
        return { ok: false, error: "inventory slot is not target", slotIndex: ${JSON.stringify(slotIndex)} };
      }
      target.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 2,
        pointerType: "mouse",
        button: 0,
        buttons: 1,
        clientX,
        clientY
      }));
      target.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 2,
        pointerType: "mouse",
        button: 0,
        buttons: 0,
        clientX,
        clientY
      }));
      slot.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: 0,
        clientX,
        clientY
      }));
      await nextFrame();
      return { ok: true, dataset: { ...document.querySelector(".runtimeViewport")?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function setRuntimeInventory(window, inventory) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.dispatchEvent(new CustomEvent("kronos-runtime-inventory", {
        detail: { inventory: ${JSON.stringify(inventory)} }
      }));
    })()
  `);
  await delay(150);
}

async function equipStaffOfLight(window) {
  await clickManualLoadout(window, "Mage");
  await setRuntimeInventory(window, [{ itemId: 22296, quantity: 1 }, { itemId: 3144, quantity: 1 }]);
  await clickSideTab(window, "inventory");
  const dispatch = await leftClickInventorySlot(window, 0);
  if (
    dispatch.lastInventoryAction !== "Wield" ||
    dispatch.lastInventoryEquipmentEquippedItemId !== "22296" ||
    dispatch.lastInventoryEquipmentServerHandler !== "Equipment.equip"
  ) {
    throw new Error(`Staff of light Wield did not dispatch Equipment.equip: ${JSON.stringify(dispatch)}`);
  }
  await waitForGameTick();
}

async function readCombatState(window) {
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
          iconSpriteWidth: Number(icon?.getAttribute("data-source-sprite-width")),
          iconSpriteHeight: Number(icon?.getAttribute("data-source-sprite-height")),
          iconSpriteOffsetX: Number(icon?.getAttribute("data-source-sprite-offset-x")),
          iconSpriteOffsetY: Number(icon?.getAttribute("data-source-sprite-offset-y")),
          iconSpriteMaxWidth: Number(icon?.getAttribute("data-source-sprite-max-width")),
          iconSpriteMaxHeight: Number(icon?.getAttribute("data-source-sprite-max-height")),
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
      const specialBars = Array.from(document.querySelectorAll(".kronosCombatSpecialBar")).map((bar) => ({
        backgroundRect: styleRect(bar.querySelector(".kronosCombatSpecialBarBackground")),
        fillRect: styleRect(bar.querySelector(".kronosCombatSpecialBarFill")),
        weaponItemId: bar.getAttribute("data-weapon-item-id") ?? "",
        weaponName: bar.getAttribute("data-weapon-name") ?? "",
        drainPercent: Number(bar.getAttribute("data-special-drain-percent")),
        drainSource: bar.getAttribute("data-special-drain-source") ?? "",
        specialAvailable: bar.getAttribute("data-special-available") ?? "",
        rect: styleRect(bar)
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
        specialBars,
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
        autoRetaliateRect: styleRect(document.querySelector(".kronosCombatAutoRetaliateSource")),
        staleCombatWidgetCount: document.querySelectorAll(
          '.kronosMountedWidgetLayer[data-group-id="593"] .kronosWidgetRectangle[data-child-id], ' +
          '.kronosMountedWidgetLayer[data-group-id="593"] .kronosWidgetSprite[data-child-id], ' +
          '.kronosMountedWidgetLayer[data-group-id="593"] .kronosWidgetText[data-child-id]'
        ).length,
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

function assertCombatState(label, state, expected, spriteByAlias) {
  const compactStyles = state.styles.map(({ slotIndex, childId, label, attackType, attackStyle, iconAlias, sourceGraphic }) => ({
    slotIndex,
    childId,
    label,
    attackType,
    attackStyle,
    iconAlias,
    sourceGraphic
  }));
  const compactExpectedStyles = expected.styles.map(({ slotIndex, childId, label, attackType, attackStyle, iconAlias, sourceGraphic }) => ({
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
    state.panel?.weaponItemId !== expected.weaponItemId ||
    state.panel?.weaponName !== expected.weaponName ||
    state.panel?.weaponType !== expected.weaponType ||
    state.panel?.weaponTypeConfig !== String(expected.weaponTypeConfig) ||
    JSON.stringify(compactStyles) !== JSON.stringify(compactExpectedStyles) ||
    state.styles.some((style) => style.iconSource !== "client-script-graphic") ||
    state.styles.some((style) => style.iconAlias !== style.iconSpriteAlias) ||
    state.styles.some((style) => !style.iconBackground.includes("client_ui.png")) ||
    state.autocast.length !== expected.autocastCount ||
    state.staleCombatWidgetCount !== 0 ||
    state.specialBars.length !== expected.specialBarCount ||
    state.specOrbCount !== expected.specOrbCount
  ) {
    throw new Error(`${label} combat tab state mismatch: ${JSON.stringify({ state, expected: compactExpectedStyles }, null, 2)}`);
  }

  if (
    !state.specOrb ||
    state.specOrb.actionEnabled !== String(expected.specOrbActionEnabled) ||
    state.specOrb.active !== "false" ||
    state.specOrb.displayedFillerSpriteId !== expected.specOrbDisplayedFillerSpriteId ||
    state.specOrb.sourceFillerTransparency !== expected.specOrbFillerTransparency ||
    state.specOrb.sourceDrawState !== expected.specOrbSourceDrawState ||
    state.specOrb.hitboxCount !== expected.specOrbHitboxCount
  ) {
    throw new Error(`${label} special orb state mismatch: ${JSON.stringify({ specOrb: state.specOrb, expected }, null, 2)}`);
  }

  for (const style of state.styles) {
    const expectedSprite = spriteByAlias.get(style.iconAlias);
    if (
      !expectedSprite ||
      style.iconSpriteId !== expectedSprite.spriteId ||
      style.iconSpriteWidth !== expectedSprite.width ||
      style.iconSpriteHeight !== expectedSprite.height ||
      style.iconSpriteOffsetX !== expectedSprite.offsetX ||
      style.iconSpriteOffsetY !== expectedSprite.offsetY ||
      style.iconSpriteMaxWidth !== expectedSprite.maxWidth ||
      style.iconSpriteMaxHeight !== expectedSprite.maxHeight
    ) {
      throw new Error(`${label} style icon did not match exported Kronos sprite alias: ${JSON.stringify({ style, expectedSprite }, null, 2)}`);
    }
  }

  const panelOrigin = state.panel?.rect ?? { left: 0, top: 0 };
  for (const expectedStyle of expected.styles) {
    const style = state.styles.find((candidate) => candidate.slotIndex === expectedStyle.slotIndex);
    assertRect(`${label} style slot ${expectedStyle.slotIndex}`, style?.rect ?? null, offsetRect(panelOrigin, expectedStyle.rect));
  }
  assertRect(`${label} auto retaliate`, state.autoRetaliateRect, offsetRect(panelOrigin, { left: 20, top: 153, width: 150, height: 44 }));

  if (expected.autocastCount > 0) {
    const expectedAutocastRects = new Map([
      [21, offsetRect(panelOrigin, { left: 99, top: 45, width: 71, height: 50 })],
      [26, offsetRect(panelOrigin, { left: 99, top: 99, width: 71, height: 50 })]
    ]);
    for (const control of state.autocast) {
      if (control.weaponTypeConfig !== String(expected.weaponTypeConfig) || control.spellId !== "ice-barrage") {
        throw new Error(`${label} autocast control was not source-backed to the visible config: ${JSON.stringify(control)}`);
      }
      assertRect(`${label} autocast child ${control.childId}`, control.rect, expectedAutocastRects.get(control.childId));
    }
  }

  if (expected.specialBarCount > 0) {
    const bar = state.specialBars[0];
    assertRect(`${label} special bar`, bar.rect, offsetRect(panelOrigin, { left: 20, top: 204, width: 150, height: 26 }));
    if (
      bar.weaponItemId !== expected.weaponItemId ||
      bar.drainPercent !== expected.specialDrainPercent ||
      bar.drainSource !== expected.specialDrainSource ||
      bar.specialAvailable !== "true" ||
      bar.backgroundRect?.top !== 7 ||
      bar.backgroundRect?.height !== 12 ||
      bar.fillRect?.top !== 7 ||
      bar.fillRect?.height !== 12
    ) {
      throw new Error(`${label} special bar metadata mismatch: ${JSON.stringify({ bar, expected }, null, 2)}`);
    }
  }
}

function assertRect(label, actual, expected) {
  if (!expected || !actual || !rectEquals(actual, expected)) {
    throw new Error(`${label} rect mismatch: ${JSON.stringify({ actual, expected }, null, 2)}`);
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

async function loadSpriteByAlias(projectRoot) {
  const metadata = JSON.parse(await fs.readFile(path.join(projectRoot, "fixtures", "render", "sprites", "client_ui.json"), "utf8"));
  return new Map(metadata.sprites.filter((sprite) => sprite.alias).map((sprite) => [sprite.alias, sprite]));
}

const expectedCases = {
  tentacle: {
    weaponItemId: "12006",
    weaponName: "Abyssal tentacle",
    weaponType: "WHIP",
    weaponTypeConfig: 20,
    autocastCount: 0,
    specialBarCount: 1,
    specOrbCount: 1,
    specOrbActionEnabled: true,
    specOrbDisplayedFillerSpriteId: 1607,
    specOrbFillerTransparency: 25,
    specOrbSourceDrawState: "orbs_spec_draw_button:toggle",
    specOrbHitboxCount: 1,
    specialDrainPercent: 50,
    specialDrainSource: "kronos-server:combat.special.melee.AbyssalTentacle",
    styles: [
      {
        slotIndex: 0,
        childId: 3,
        label: "Flick",
        attackType: "ACCURATE",
        attackStyle: "SLASH",
        iconAlias: "combat_icon_whip_flick",
        sourceGraphic: "combaticons3,13",
        rect: { left: 20, top: 45, width: 71, height: 47 }
      },
      {
        slotIndex: 1,
        childId: 7,
        label: "Lash",
        attackType: "CONTROLLED",
        attackStyle: "SLASH",
        iconAlias: "combat_icon_whip_lash",
        sourceGraphic: "combaticons3,14",
        rect: { left: 99, top: 45, width: 71, height: 47 }
      },
      {
        slotIndex: 3,
        childId: 15,
        label: "Deflect",
        attackType: "DEFENSIVE",
        attackStyle: "SLASH",
        iconAlias: "combat_icon_whip_flick",
        sourceGraphic: "combaticons3,13",
        rect: { left: 20, top: 99, width: 71, height: 47 }
      }
    ]
  },
  gmaul: {
    weaponItemId: "4153",
    weaponName: "Granite maul",
    weaponType: "GRANITE_MAUL",
    weaponTypeConfig: 2,
    autocastCount: 0,
    specialBarCount: 1,
    specOrbCount: 1,
    specOrbActionEnabled: true,
    specOrbDisplayedFillerSpriteId: 1607,
    specOrbFillerTransparency: 25,
    specOrbSourceDrawState: "orbs_spec_draw_button:toggle",
    specOrbHitboxCount: 1,
    specialDrainPercent: 50,
    specialDrainSource: "kronos-server:combat.special.melee.GraniteMaul",
    styles: [
      {
        slotIndex: 0,
        childId: 3,
        label: "Pound",
        attackType: "ACCURATE",
        attackStyle: "CRUSH",
        iconAlias: "combat_icon_gmaul_pound",
        sourceGraphic: "combaticons2,2",
        rect: { left: 20, top: 45, width: 71, height: 47 }
      },
      {
        slotIndex: 1,
        childId: 7,
        label: "Pummel",
        attackType: "AGGRESSIVE",
        attackStyle: "CRUSH",
        iconAlias: "combat_icon_gmaul_pummel",
        sourceGraphic: "combaticons2,3",
        rect: { left: 99, top: 45, width: 71, height: 47 }
      },
      {
        slotIndex: 3,
        childId: 15,
        label: "Block",
        attackType: "DEFENSIVE",
        attackStyle: "CRUSH",
        iconAlias: "combat_icon_gmaul_block",
        sourceGraphic: "combaticons2,0",
        rect: { left: 20, top: 99, width: 71, height: 47 }
      }
    ]
  },
  acb: {
    weaponItemId: "11785",
    weaponName: "Armadyl crossbow",
    weaponType: "ARMADYL_CROSSBOW",
    weaponTypeConfig: 5,
    autocastCount: 0,
    specialBarCount: 1,
    specOrbCount: 1,
    specOrbActionEnabled: true,
    specOrbDisplayedFillerSpriteId: 1607,
    specOrbFillerTransparency: 25,
    specOrbSourceDrawState: "orbs_spec_draw_button:toggle",
    specOrbHitboxCount: 1,
    specialDrainPercent: 40,
    specialDrainSource: "kronos-server:combat.special.ranged.ArmadylCrossbow",
    styles: [
      {
        slotIndex: 0,
        childId: 3,
        label: "Accurate",
        attackType: "ACCURATE",
        attackStyle: "RANGED",
        iconAlias: "combat_icon_crossbow_accurate",
        sourceGraphic: "combaticons2,5",
        rect: { left: 20, top: 45, width: 71, height: 47 }
      },
      {
        slotIndex: 1,
        childId: 7,
        label: "Rapid",
        attackType: "RAPID_RANGED",
        attackStyle: "RANGED",
        iconAlias: "combat_icon_crossbow_rapid",
        sourceGraphic: "combaticons2,6",
        rect: { left: 99, top: 45, width: 71, height: 47 }
      },
      {
        slotIndex: 3,
        childId: 15,
        label: "Longrange",
        attackType: "LONG_RANGED",
        attackStyle: "RANGED",
        iconAlias: "combat_icon_crossbow_longrange",
        sourceGraphic: "combaticons2,7",
        rect: { left: 20, top: 99, width: 71, height: 47 }
      }
    ]
  },
  kodai: {
    weaponItemId: "21006",
    weaponName: "Kodai wand",
    weaponType: "WAND",
    weaponTypeConfig: 18,
    autocastCount: 2,
    specialBarCount: 0,
    specOrbCount: 1,
    specOrbActionEnabled: false,
    specOrbDisplayedFillerSpriteId: 1064,
    specOrbFillerTransparency: 50,
    specOrbSourceDrawState: "orbs_spec_draw_button:no-special",
    specOrbHitboxCount: 0,
    styles: [
      {
        slotIndex: 0,
        childId: 3,
        label: "Bash",
        attackType: "ACCURATE",
        attackStyle: "CRUSH",
        iconAlias: "combat_icon_wand_bash",
        sourceGraphic: "combaticons2,13",
        rect: { left: 20, top: 45, width: 71, height: 32 }
      },
      {
        slotIndex: 1,
        childId: 7,
        label: "Pound",
        attackType: "AGGRESSIVE",
        attackStyle: "CRUSH",
        iconAlias: "combat_icon_wand_pound",
        sourceGraphic: "combaticons2,14",
        rect: { left: 20, top: 81, width: 71, height: 32 }
      },
      {
        slotIndex: 3,
        childId: 15,
        label: "Focus",
        attackType: "DEFENSIVE",
        attackStyle: "CRUSH",
        iconAlias: "combat_icon_wand_focus",
        sourceGraphic: "combaticons,19",
        rect: { left: 20, top: 117, width: 71, height: 32 }
      }
    ]
  },
  staffOfLight: {
    weaponItemId: "22296",
    weaponName: "Staff of light",
    weaponType: "STAFF_OF_DEAD",
    weaponTypeConfig: 18,
    autocastCount: 2,
    specialBarCount: 1,
    specOrbCount: 1,
    specOrbActionEnabled: true,
    specOrbDisplayedFillerSpriteId: 1607,
    specOrbFillerTransparency: 25,
    specOrbSourceDrawState: "orbs_spec_draw_button:toggle",
    specOrbHitboxCount: 1,
    specialDrainPercent: 100,
    specialDrainSource: "kronos-server:combat.special.magic.StaffOfTheDead",
    styles: [
      {
        slotIndex: 0,
        childId: 3,
        label: "Bash",
        attackType: "ACCURATE",
        attackStyle: "CRUSH",
        iconAlias: "combat_icon_wand_bash",
        sourceGraphic: "combaticons2,13",
        rect: { left: 20, top: 45, width: 71, height: 32 }
      },
      {
        slotIndex: 1,
        childId: 7,
        label: "Pound",
        attackType: "AGGRESSIVE",
        attackStyle: "CRUSH",
        iconAlias: "combat_icon_wand_pound",
        sourceGraphic: "combaticons2,14",
        rect: { left: 20, top: 81, width: 71, height: 32 }
      },
      {
        slotIndex: 3,
        childId: 15,
        label: "Focus",
        attackType: "DEFENSIVE",
        attackStyle: "CRUSH",
        iconAlias: "combat_icon_wand_focus",
        sourceGraphic: "combaticons,19",
        rect: { left: 20, top: 117, width: 71, height: 32 }
      }
    ]
  }
};

app.whenReady().then(async () => {
  const spriteByAlias = await loadSpriteByAlias(projectRoot);
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      partition: `combat-weapon-tabs-${Date.now()}`
    }
  });

  try {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    await waitForReady(window);

    await clickManualLoadout(window, "Melee");
    await clickSideTab(window, "combat");
    const tentacleState = await readCombatState(window);
    assertCombatState("Abyssal tentacle", tentacleState, expectedCases.tentacle, spriteByAlias);

    await clickManualLoadout(window, "Gmaul");
    await clickSideTab(window, "combat");
    const gmaulState = await readCombatState(window);
    assertCombatState("Granite maul", gmaulState, expectedCases.gmaul, spriteByAlias);

    await clickManualLoadout(window, "Range");
    await clickSideTab(window, "combat");
    const acbState = await readCombatState(window);
    assertCombatState("Armadyl crossbow", acbState, expectedCases.acb, spriteByAlias);

    await clickManualLoadout(window, "Mage");
    await clickSideTab(window, "combat");
    const kodaiState = await readCombatState(window);
    assertCombatState("Kodai wand", kodaiState, expectedCases.kodai, spriteByAlias);

    await equipStaffOfLight(window);
    await clickSideTab(window, "combat");
    const staffState = await readCombatState(window);
    assertCombatState("Staff of light", staffState, expectedCases.staffOfLight, spriteByAlias);

    if (screenshotPath) {
      const screenshot = await window.capturePage(staffState.screenshotClip ?? undefined);
      await fs.writeFile(screenshotPath, screenshot.toPNG());
      staffState.screenshotPath = screenshotPath;
    }

    console.log(JSON.stringify({ tentacleState, gmaulState, acbState, kodaiState, staffState }, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
