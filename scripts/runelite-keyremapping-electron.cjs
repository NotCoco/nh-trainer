const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const [, , projectRoot, screenshotPath] = process.argv;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForShell(window) {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(`
      (() => Boolean(
        document.querySelector(".runeliteClientShell") &&
        document.querySelector('.runeliteToolbarButton[data-navigation-button-id="configuration"]') &&
        document.querySelector(".runtimeViewport")
      ))()
    `);

    if (ready) {
      return;
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for RuneLite shell.");
}

async function verifyKeyRemapping(window) {
  return window.webContents.executeJavaScript(`
    (async () => {
      const shell = document.querySelector(".runeliteClientShell");
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const click = async (element) => {
        if (!element) {
          return false;
        }
        element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: "mouse" }));
        element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: "mouse" }));
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
        element.click();
        await nextFrame();
        return true;
      };

      window.localStorage.clear();
      await nextFrame();

      const configButton = shell?.querySelector('.runeliteToolbarButton[data-navigation-button-id="configuration"]');
      await click(configButton);

      const keyRemapConfigButton = shell?.querySelector(
        '.runelitePluginListItem[data-plugin-list-item-id="key-remapping"] .runelitePluginConfigButton'
      );
      await click(keyRemapConfigButton);

      const detail = shell?.querySelector('.runeliteConfigDetailPanel[data-config-plugin-id="key-remapping"]');
      const pluginToggle = detail?.querySelector(".runeliteConfigDetailToggleButton");
      await click(pluginToggle);

      const fkeyRemapCheckbox = detail?.querySelector('[data-config-item-key="fkeyRemap"] .runeliteConfigCheckbox');
      if (fkeyRemapCheckbox && !fkeyRemapCheckbox.checked) {
        fkeyRemapCheckbox.click();
        fkeyRemapCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
        await nextFrame();
      }

      const f1Button = detail?.querySelector('[data-config-item-key="f1"] .runeliteConfigHotkeyButton');
      await click(f1Button);
      f1Button?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Z", code: "KeyZ", bubbles: true, cancelable: true })
      );
      await nextFrame();

      const upButton = detail?.querySelector('[data-config-item-key="up"] .runeliteConfigHotkeyButton');
      await click(upButton);
      upButton?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "I", code: "KeyI", bubbles: true, cancelable: true })
      );
      await nextFrame();

      const storage = JSON.parse(window.localStorage.getItem("runelite.config.properties") || "{}");
      const runtimeCanvas = shell?.querySelector(".runtimeViewport canvas");
      const viewport = shell?.querySelector(".runtimeViewport");

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "F4", code: "F4", bubbles: true, cancelable: true }));
      await nextFrame();
      const directF4Tab = viewport?.getAttribute("data-active-side-tab-id") ?? "";

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Z", code: "KeyZ", bubbles: true, cancelable: true }));
      await nextFrame();
      const remappedZDefaultTab = viewport?.getAttribute("data-active-side-tab-id") ?? "";
      const lastFKey = viewport?.getAttribute("data-last-side-tab-f-key") ?? "";

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", code: "F10", bubbles: true, cancelable: true }));
      await nextFrame();
      const sourceKeybindingButton = document.querySelector(".nhOptionsKeybindingButton");
      const sourceKeybindingIcon = document.querySelector(".nhOptionsKeybindingGeneratedIcon");
      await click(sourceKeybindingButton);
      const keybindInterface = document.querySelector(".nhGameKeybindingInterface");
      await click(keybindInterface?.querySelector('.nhGameKeybindingRow[data-tab-id="inventory"] .nhGameKeybindingKeyButton'));
      await click(keybindInterface?.querySelector('.nhGameKeybindingDropdownOption[data-key-slot="1"]'));
      await nextFrame();
      const gameKeybindStorage = JSON.parse(window.localStorage.getItem("nhTrainer.gameKeybinds.v1") || "{}");

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Z", code: "KeyZ", bubbles: true, cancelable: true }));
      await nextFrame();
      const remappedZChangedTab = viewport?.getAttribute("data-active-side-tab-id") ?? "";

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "I", code: "KeyI", bubbles: true, cancelable: true }));
      await nextFrame();
      const cameraMode = document.querySelector("#runtime-camera")?.value ?? "";

      return {
        ok:
          detail?.getAttribute("data-config-group") === "keyremapping" &&
          f1Button?.textContent === "Z" &&
          upButton?.textContent === "I" &&
          f1Button?.getAttribute("data-source-component") === "HotkeyButton" &&
          f1Button?.getAttribute("data-source-keybind-type") === "ModifierlessKeybind" &&
          f1Button?.getAttribute("data-source-storage") === "ConfigManager.objectToString Keybind keyCode:modifiers" &&
          storage["runelite.keyremappingplugin"] === "true" &&
          storage["keyremapping.fkeyRemap"] === "true" &&
          storage["keyremapping.f1"] === "90:0" &&
          storage["keyremapping.up"] === "73:0" &&
          runtimeCanvas?.getAttribute("data-runelite-key-remapping-enabled") === "true" &&
          runtimeCanvas?.getAttribute("data-runelite-key-remapping-fkey-remap") === "true" &&
          runtimeCanvas?.getAttribute("data-runelite-key-remapping-f1") === "Z" &&
          runtimeCanvas?.getAttribute("data-runelite-key-remapping-camera-up") === "I" &&
          runtimeCanvas?.getAttribute("data-nh-game-keybind-inventory") === "1" &&
          runtimeCanvas?.getAttribute("data-nh-game-keybind-combat") === "0" &&
          sourceKeybindingButton?.getAttribute("data-action-child-id") === "83" &&
          sourceKeybindingButton?.getAttribute("data-source-placement-child-id") === "100" &&
          sourceKeybindingIcon?.getAttribute("data-generated-with") === "imagegen" &&
          sourceKeybindingIcon?.getAttribute("data-icon-path") === "render/sprites/nh_fkey_icon.png" &&
          directF4Tab === "equipment" &&
          remappedZDefaultTab === "combat" &&
          remappedZChangedTab === "inventory" &&
          lastFKey === "F1" &&
          cameraMode === "free",
        detail: {
          f1Text: f1Button?.textContent ?? "",
          upText: upButton?.textContent ?? "",
          storage,
          runtimeDataset: {
            enabled: runtimeCanvas?.getAttribute("data-runelite-key-remapping-enabled") ?? "",
            fkeyRemap: runtimeCanvas?.getAttribute("data-runelite-key-remapping-fkey-remap") ?? "",
            f1: runtimeCanvas?.getAttribute("data-runelite-key-remapping-f1") ?? "",
            gameInventorySlot: runtimeCanvas?.getAttribute("data-nh-game-keybind-inventory") ?? "",
            gameCombatSlot: runtimeCanvas?.getAttribute("data-nh-game-keybind-combat") ?? "",
            up: runtimeCanvas?.getAttribute("data-runelite-key-remapping-camera-up") ?? ""
          },
          sideTabs: {
            directF4Tab,
            remappedZDefaultTab,
            remappedZChangedTab,
            lastFKey
          },
          gameKeybindStorage,
          sourceKeybindingControl: {
            actionChildId: sourceKeybindingButton?.getAttribute("data-action-child-id") ?? "",
            generatedWith: sourceKeybindingIcon?.getAttribute("data-generated-with") ?? "",
            iconPath: sourceKeybindingIcon?.getAttribute("data-icon-path") ?? "",
            placementChildId: sourceKeybindingButton?.getAttribute("data-source-placement-child-id") ?? ""
          },
          cameraMode
        }
      };
    })()
  `);
}

async function openKeybindingVisualState(window) {
  return window.webContents.executeJavaScript(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const click = async (element) => {
        if (!element) {
          return false;
        }
        element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: "mouse" }));
        element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: "mouse" }));
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
        element.click();
        await nextFrame();
        return true;
      };

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", code: "F10", bubbles: true, cancelable: true }));
      await nextFrame();
      const sourceKeybindingButton = document.querySelector(".nhOptionsKeybindingButton");
      const sourceKeybindingFrame = document.querySelector(".nhOptionsKeybindingSourceFrame");
      const sourceKeybindingIcon = document.querySelector(".nhOptionsKeybindingGeneratedIcon");
      const sourceKeybindingButtonRect = sourceKeybindingButton?.getBoundingClientRect();
      const sourceKeybindingIconRect = sourceKeybindingIcon?.getBoundingClientRect();
      const sourceKeybindingIconStyle = sourceKeybindingIcon ? getComputedStyle(sourceKeybindingIcon) : null;
      const rectsOverlap = (a, b) =>
        Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
      const sliderChildIds = new Set([
        "18",
        "19",
        "20",
        "21",
        "24",
        "26",
        "28",
        "30",
        "45",
        "46",
        "47",
        "48",
        "49",
        "51",
        "52",
        "53",
        "54",
        "55",
        "57",
        "58",
        "59",
        "60",
        "61"
      ]);
      const keybindingSliderOverlapCount = Array.from(document.querySelectorAll(".nhWidgetSprite"))
        .filter((element) => sliderChildIds.has(element.getAttribute("data-child-id") ?? ""))
        .filter((element) => rectsOverlap(sourceKeybindingButtonRect, element.getBoundingClientRect())).length;
      await click(sourceKeybindingButton);
      await nextFrame();

      const shellRect = document.querySelector(".runeliteClientShell")?.getBoundingClientRect();
      const navContainer = document.querySelector(".runeliteNavContainer");
      const pluginPanel = document.querySelector(".runelitePluginPanel");
      const pluginToolbar = document.querySelector(".runelitePluginToolbar");
      const optionsButton = document.querySelector('.nhSideTabButton[data-tab-id="options"]');
      const keybindInterface = document.querySelector(".nhGameKeybindingInterface");
      const keybindingRows = Array.from(keybindInterface?.querySelectorAll(".nhGameKeybindingRow") ?? []);
      const keybindingIconButtons = Array.from(keybindInterface?.querySelectorAll(".nhGameKeybindingIconButton") ?? []);
      const keybindingIconSprites = Array.from(keybindInterface?.querySelectorAll(".nhGameKeybindingIconSprite") ?? []);
      const keybindingRestoreButtons = Array.from(keybindInterface?.querySelectorAll(".nhGameKeybindingRestoreButton") ?? []);
      const inventoryKeyButton = keybindInterface?.querySelector('.nhGameKeybindingRow[data-tab-id="inventory"] .nhGameKeybindingKeyButton');
      const canvas = document.querySelector(".runtimeViewport canvas");
      const viewport = document.querySelector(".runtimeViewport");
      const navRect = navContainer?.getBoundingClientRect();
      const pluginPanelRect = pluginPanel?.getBoundingClientRect();
      const pluginToolbarRect = pluginToolbar?.getBoundingClientRect();
      const resolvedBackgroundAt = (x, y) => {
        let element = document.elementFromPoint(x, y);
        while (element) {
          const background = getComputedStyle(element).backgroundColor;
          if (background && background !== "rgba(0, 0, 0, 0)" && background !== "transparent") {
            return background;
          }
          element = element.parentElement;
        }
        return "";
      };
      const navBottomBackground =
        navRect && shellRect ? resolvedBackgroundAt(navRect.left + 12, shellRect.bottom - 12) : "";
      const toolbarBottomBackground =
        pluginToolbarRect && shellRect ? resolvedBackgroundAt(pluginToolbarRect.left + 18, shellRect.bottom - 12) : "";
      return {
        activeSideTab: viewport?.getAttribute("data-active-side-tab-id") ?? "",
        combatSlot: canvas?.getAttribute("data-nh-game-keybind-combat") ?? "",
        inventorySlot: canvas?.getAttribute("data-nh-game-keybind-inventory") ?? "",
        keybindingVisible: Boolean(keybindInterface),
        keybindingIconButtonCount: keybindingIconButtons.length,
        keybindingIconSpriteCount: keybindingIconSprites.length,
        keybindingInterfaceId: keybindInterface?.getAttribute("data-interface-id") ?? "",
        keybindingOldEscapeCheckboxVisible: Boolean(keybindInterface?.querySelector(".nhGameKeybindingEscape")),
        keybindingRestoreButtonCount: keybindingRestoreButtons.length,
        keybindingRowCount: keybindingRows.length,
        keybindingSourceActionChildId: sourceKeybindingButton?.getAttribute("data-action-child-id") ?? "",
        keybindingSourceButtonHeight: Math.round(sourceKeybindingButtonRect?.height ?? 0),
        keybindingSourceButtonLeft: Math.round(sourceKeybindingButtonRect?.left ?? 0),
        keybindingSourceButtonTop: Math.round(sourceKeybindingButtonRect?.top ?? 0),
        keybindingSourceButtonVisible: Boolean(sourceKeybindingButton),
        keybindingSourceButtonWidth: Math.round(sourceKeybindingButtonRect?.width ?? 0),
        keybindingSourceFrameSpriteId: sourceKeybindingFrame?.getAttribute("data-sprite-id") ?? "",
        keybindingSourceGeneratedWith: sourceKeybindingIcon?.getAttribute("data-generated-with") ?? "",
        keybindingSourceIconBackground: sourceKeybindingIconStyle?.backgroundImage ?? "",
        keybindingSourceIconHeight: Math.round(sourceKeybindingIconRect?.height ?? 0),
        keybindingSourceIconPath: sourceKeybindingIcon?.getAttribute("data-icon-path") ?? "",
        keybindingSourceIconVisible: Boolean(sourceKeybindingIcon),
        keybindingSourceIconWidth: Math.round(sourceKeybindingIconRect?.width ?? 0),
        keybindingSourceIconZIndex: sourceKeybindingIconStyle?.zIndex ?? "",
        keybindingSourceLayout: keybindInterface?.getAttribute("data-source-layout") ?? "",
        keybindingSourcePlacementChildId: sourceKeybindingButton?.getAttribute("data-source-placement-child-id") ?? "",
        keybindingSliderOverlapCount,
        keybindingInventoryKeyButtonWidth: Math.round(inventoryKeyButton?.getBoundingClientRect().width ?? 0),
        navBottomBackground,
        navHeight: Math.round(navRect?.height ?? 0),
        optionsTabActive: optionsButton?.getAttribute("data-active") ?? "",
        pluginPanelHeight: Math.round(pluginPanelRect?.height ?? 0),
        shellHeight: Math.round(shellRect?.height ?? 0),
        toolbarBottomBackground,
        toolbarHeight: Math.round(pluginToolbarRect?.height ?? 0),
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

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      partition: `runelite-keyremapping-${Date.now()}`
    }
  });

  try {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    await waitForShell(window);
    const result = await verifyKeyRemapping(window);
    if (!result.ok) {
      throw new Error(`RuneLite key remapping interaction mismatch: ${JSON.stringify(result, null, 2)}`);
    }
    if (screenshotPath) {
      const visualState = await openKeybindingVisualState(window);
      if (
        !visualState.keybindingVisible ||
        visualState.keybindingInterfaceId !== "121" ||
        visualState.keybindingSourceLayout !== "Nh Interface.KEYBINDING 121 side-stone keybind grid" ||
        visualState.keybindingRowCount !== 14 ||
        visualState.keybindingIconButtonCount !== 14 ||
        visualState.keybindingIconSpriteCount !== 14 ||
        visualState.keybindingRestoreButtonCount !== 1 ||
        visualState.keybindingOldEscapeCheckboxVisible ||
        visualState.keybindingInventoryKeyButtonWidth < 95 ||
        !visualState.keybindingSourceButtonVisible ||
        !visualState.keybindingSourceIconVisible ||
        visualState.keybindingSourceActionChildId !== "83" ||
        visualState.keybindingSourceFrameSpriteId !== "761" ||
        visualState.keybindingSourceGeneratedWith !== "imagegen" ||
        !visualState.keybindingSourceIconBackground.includes("nh_fkey_icon.png") ||
        visualState.keybindingSourceIconPath !== "render/sprites/nh_fkey_icon.png" ||
        visualState.keybindingSourceIconZIndex !== "2" ||
        visualState.keybindingSourcePlacementChildId !== "100" ||
        visualState.keybindingSliderOverlapCount !== 0 ||
        visualState.keybindingSourceButtonWidth < 39 ||
        visualState.keybindingSourceButtonHeight < 39 ||
        visualState.keybindingSourceIconWidth < 31 ||
        visualState.keybindingSourceIconHeight < 31 ||
        visualState.activeSideTab !== "options" ||
        visualState.optionsTabActive !== "true" ||
        visualState.navBottomBackground !== "rgb(40, 40, 40)" ||
        visualState.toolbarBottomBackground !== "rgb(40, 40, 40)" ||
        visualState.navHeight < visualState.shellHeight - 2 ||
        visualState.pluginPanelHeight < visualState.shellHeight - 2 ||
        visualState.toolbarHeight < visualState.shellHeight - 2
      ) {
        throw new Error(`RuneLite key remapping visual state mismatch: ${JSON.stringify(visualState, null, 2)}`);
      }
      const screenshot = await window.capturePage(visualState.screenshotClip ?? undefined);
      await fs.writeFile(screenshotPath, screenshot.toPNG());
      result.visualState = visualState;
      result.screenshotPath = screenshotPath;
    }
    console.log(JSON.stringify(result, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
