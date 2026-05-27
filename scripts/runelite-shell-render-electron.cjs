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
      (() => {
        const shell = document.querySelector(".runeliteClientShell");
        const toolbar = document.querySelector(".runelitePluginToolbar");
        const buttons = [...document.querySelectorAll(".runeliteToolbarButton")];
        return Boolean(shell && toolbar && buttons.length > 0);
      })()
    `);

    if (ready) {
      return;
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for RuneLite client shell.");
}

async function readShellState(window) {
  return window.webContents.executeJavaScript(`
    (async () => {
      const shell = document.querySelector(".runeliteClientShell");
      if (!shell) {
        return { ok: false, reason: "missing shell" };
      }

      const queryShell = (selector) => shell.querySelector(selector);
      const queryShellAll = (selector) => [...shell.querySelectorAll(selector)];
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const readSidebarState = () => {
        const toolbarElement = queryShell(".runelitePluginToolbar");
        const navElement = queryShell(".runeliteNavContainer");
        const toggleElement = queryShell(".runeliteSidebarToggleButton");

        return {
          toolbarPresent: Boolean(toolbarElement),
          navOpen: navElement?.getAttribute("data-open") === "true",
          rootSidebarOpen: shell.getAttribute("data-sidebar-open") === "true",
          rootPluginPanelOpen: shell.getAttribute("data-plugin-panel-open") === "true",
          toggleSidebarOpen: toggleElement?.getAttribute("data-sidebar-open") === "true",
          currentNavButtonId: shell.getAttribute("data-current-nav-button-id") ?? ""
        };
      };
      shell.scrollIntoView({ block: "center", inline: "center" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const waitForSidebarState = async (expectedOpen) => {
        let latestState = readSidebarState();
        for (let i = 0; i < 60; i += 1) {
          latestState = readSidebarState();
          if (
            latestState.toolbarPresent === expectedOpen &&
            latestState.navOpen === expectedOpen &&
            latestState.rootSidebarOpen === expectedOpen &&
            latestState.rootPluginPanelOpen === expectedOpen &&
            latestState.toggleSidebarOpen === expectedOpen
          ) {
            return latestState;
          }
          await nextFrame();
        }
        throw new Error(
          "Timed out waiting for RuneLite sidebar state " +
            JSON.stringify({ expectedOpen, latestState })
        );
      };

      const button = queryShell('.runeliteToolbarButton[data-navigation-button-id="configuration"]');
      button?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const toolbar = queryShell(".runelitePluginToolbar");
      const navContainer = queryShell(".runeliteNavContainer");
      const sidebarToggle = queryShell(".runeliteSidebarToggleButton");
      const sidebarToggleImage = sidebarToggle?.querySelector("img");
      const sidebarHotZone = queryShell(".runeliteSidebarToggleHotZone");
      const sidebarHotkeySource = shell.getAttribute("data-source-sidebar-hotkey") ?? "";
      const sidebarStateModelSource = shell.getAttribute("data-source-sidebar-state-model") ?? "";
      const sidebarSelectionSource = shell.getAttribute("data-source-sidebar-selection") ?? "";
      const configPanel = queryShell(".runeliteConfigPanel");
      const configPanelSourcePinned = configPanel?.getAttribute("data-source-pinned") ?? "";
      const configSearch = queryShell(".runeliteConfigSearch");
      const initialStretchedModeEnabled = shell.getAttribute("data-runelite-stretched-enabled") ?? "";
      const initialStretchedModeSourcePlugin = shell.getAttribute("data-source-stretched-mode") ?? "";
      const initialStretchedModeSourceDimensions = shell.getAttribute("data-source-stretched-dimensions") ?? "";
      const initialStretchedModeSourceMouse = shell.getAttribute("data-source-stretched-mouse") ?? "";
      const initialDisabledPluginSource = shell.getAttribute("data-source-disabled-plugins") ?? "";
      const initialStretchedModeListItem = queryShell('.runelitePluginListItem[data-plugin-list-item-id="stretched-mode"]');
      const initialStretchedModeListEnabled = initialStretchedModeListItem?.getAttribute("data-plugin-enabled") ?? "";
      const initialAttackStylesListItem = queryShell('.runelitePluginListItem[data-plugin-list-item-id="attack-styles"]');
      const initialRuntimeCanvas = queryShell(".runtimeViewport canvas");
      const initialNhHudSprite = queryShell(".nhFixedClient span");
      const initialRuntimeCanvasImageRendering = initialRuntimeCanvas ? getComputedStyle(initialRuntimeCanvas).imageRendering : "";
      const initialNhHudSpriteImageRendering = initialNhHudSprite ? getComputedStyle(initialNhHudSprite).imageRendering : "";
      const initialStretchedModeToggle = initialStretchedModeListItem?.querySelector(".runelitePluginToggleButton");
      if (initialStretchedModeEnabled === "true" && initialStretchedModeToggle) {
        initialStretchedModeToggle.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
      const configSearchRect = configSearch?.getBoundingClientRect();
      const configSearchInput = configSearch?.querySelector("input");
      const configSearchIcon = configSearch?.querySelector(".runeliteIconTextFieldIcon");
      const configSearchFlatTextField = configSearch?.querySelector(".runeliteFlatTextField");
      const configSearchClearBefore = configSearch?.querySelector(".runeliteIconTextFieldClear");
      const configSearchFlatStyle = configSearchFlatTextField ? window.getComputedStyle(configSearchFlatTextField) : null;
      const configSearchInitial = {
        sourceComponent: configSearch?.getAttribute("data-source-component") ?? "",
        sourceLayout: configSearch?.getAttribute("data-source-layout") ?? "",
        sourceClear: configSearch?.getAttribute("data-source-clear") ?? "",
        sourceHover: configSearch?.getAttribute("data-source-hover") ?? "",
        sourceFlatTextField: configSearch?.getAttribute("data-source-flat-text-field") ?? "",
        sourceConfigSearch: configSearch?.getAttribute("data-source-config-search") ?? "",
        clearVisible: configSearch?.getAttribute("data-clear-visible") ?? "",
        iconWrapperWidth: Math.round(configSearchIcon?.getBoundingClientRect().width ?? 0),
        flatPaddingLeft: configSearchFlatStyle?.paddingLeft ?? "",
        inputValue: configSearchInput?.value ?? "",
        clearButtonPresent: Boolean(configSearchClearBefore)
      };
      const pluginListItems = queryShellAll(".runelitePluginListItem").map((item) => {
        const rect = item.getBoundingClientRect();
        const name = item.querySelector(".runelitePluginListName");
        const toggleButton = item.querySelector("button.runelitePluginToggleButton");
        const hiddenToggle = item.querySelector(".runelitePluginToggleButton-hidden");
        const computedName = name ? window.getComputedStyle(name) : null;
        return {
          id: item.getAttribute("data-plugin-list-item-id"),
          enabled: item.getAttribute("data-plugin-enabled"),
          pinned: item.getAttribute("data-plugin-pinned"),
          pluginBacked: item.getAttribute("data-plugin-backed"),
          sourceCategoryColor: item.getAttribute("data-source-category-color"),
          toggleButtonPresent: Boolean(toggleButton),
          hiddenTogglePresent: Boolean(hiddenToggle),
          toggleSource: (toggleButton ?? hiddenToggle)?.getAttribute("data-source-toggle") ?? "",
          nameColor: computedName?.color ?? "",
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      });
      if (configSearchInput) {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        valueSetter?.call(configSearchInput, "gpu");
        configSearchInput.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      const searchFilteredItems = queryShellAll(".runelitePluginListItem").map((item) => item.getAttribute("data-plugin-list-item-id"));
      const configSearchClearAfterType = queryShell(".runeliteIconTextFieldClear");
      const configSearchAfterType = {
        inputValue: configSearchInput?.value ?? "",
        clearVisible: configSearch?.getAttribute("data-clear-visible") ?? "",
        clearButtonPresent: Boolean(configSearchClearAfterType),
        clearButtonSource: configSearchClearAfterType?.getAttribute("data-source-visible") ?? "",
        filteredItems: searchFilteredItems
      };
      configSearchClearAfterType?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
      configSearchClearAfterType?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const configSearchAfterClear = {
        inputValue: configSearchInput?.value ?? "",
        clearVisible: configSearch?.getAttribute("data-clear-visible") ?? "",
        clearButtonPresent: Boolean(queryShell(".runeliteIconTextFieldClear")),
        itemCount: queryShellAll(".runelitePluginListItem").length
      };
      const buttons = queryShellAll(".runeliteToolbarButton");
      const buttonSources = buttons.map((button) => ({
        id: button.getAttribute("data-navigation-button-id"),
        priority: button.getAttribute("data-navigation-priority"),
        tab: button.getAttribute("data-navigation-tab"),
        fields: button.getAttribute("data-source-navigation-button-fields"),
        equality: button.getAttribute("data-source-navigation-button-equality")
      }));
      const toolbarSourceSort = toolbar?.getAttribute("data-source-sort") ?? "";
      const toolbarSourceDelimiter = toolbar?.getAttribute("data-source-delimiter") ?? "";
      const icons = queryShellAll(".runeliteToolbarButton img").map((image) => {
        const rect = image.getBoundingClientRect();
        return {
          src: image.getAttribute("src"),
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      });
      const panelIcons = queryShellAll(".runeliteConfigPanel img").map((image) => {
        const rect = image.getBoundingClientRect();
        return {
          src: image.getAttribute("src"),
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      });

      const openOsrsConfigButton = queryShell('.runelitePluginListItem[data-plugin-list-item-id="openosrs"] .runelitePluginConfigButton');
      openOsrsConfigButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const openOsrsConfigDetail = queryShell('.runeliteConfigDetailPanel[data-config-plugin-id="openosrs"]');
      const openOsrsDetailToggleButton = openOsrsConfigDetail?.querySelector("button.runeliteConfigDetailToggleButton");
      const openOsrsDetailHiddenToggle = openOsrsConfigDetail?.querySelector(
        ".runeliteConfigDetailToggleButton.runelitePluginToggleButton-hidden"
      );
      const openOsrsVisibilitySource = openOsrsConfigDetail?.getAttribute("data-source-entry-visibility") ?? "";
      const openOsrsInitialEntries = queryShellAll('.runeliteConfigDetailPanel[data-config-plugin-id="openosrs"] [data-config-item-key]').map(
        (entry) => entry.getAttribute("data-config-item-key")
      );
      const openOsrsDetailToggle = {
        buttonPresent: Boolean(openOsrsDetailToggleButton),
        hiddenPresent: Boolean(openOsrsDetailHiddenToggle),
        sourceToggle: openOsrsDetailHiddenToggle?.getAttribute("data-source-toggle") ?? ""
      };
      const hidePluginsCheckbox = queryShell(
        '.runeliteConfigDetailPanel[data-config-plugin-id="openosrs"] [data-config-item-key="hidePlugins"] .runeliteConfigCheckbox'
      );
      hidePluginsCheckbox?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const openOsrsAfterHidePluginsEntries = queryShellAll(
        '.runeliteConfigDetailPanel[data-config-plugin-id="openosrs"] [data-config-item-key]'
      ).map((entry) => entry.getAttribute("data-config-item-key"));
      hidePluginsCheckbox?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const openOsrsBackButton = queryShell(".runeliteConfigBackButton");
      openOsrsBackButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const chatColorConfigButton = queryShell('.runelitePluginListItem[data-plugin-list-item-id="chat-color"] .runelitePluginConfigButton');
      chatColorConfigButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const chatColorConfigDetail = queryShell('.runeliteConfigDetailPanel[data-config-plugin-id="chat-color"]');
      const chatColorDetailToggleButton = chatColorConfigDetail?.querySelector("button.runeliteConfigDetailToggleButton");
      const chatColorDetailHiddenToggle = chatColorConfigDetail?.querySelector(
        ".runeliteConfigDetailToggleButton.runelitePluginToggleButton-hidden"
      );
      const chatColorConfigTitleElement = queryShell(".runeliteConfigDetailTitle");
      const chatColorConfigTitle = chatColorConfigTitleElement?.textContent ?? "";
      const chatColorConfigTitleStyle = chatColorConfigTitleElement ? window.getComputedStyle(chatColorConfigTitleElement) : null;
      const chatColorConfigEntries = queryShellAll('.runeliteConfigDetailPanel[data-config-plugin-id="chat-color"] [data-config-item-key]').map(
        (entry) => {
          const key = entry.getAttribute("data-config-item-key");
          const colorButton = entry.querySelector(".runeliteConfigColorButton");
          return {
            key,
            sourceComponent: colorButton?.getAttribute("data-source-component") ?? "",
            sourceColorPicker: colorButton?.getAttribute("data-source-color-picker") ?? "",
            colorText: colorButton?.textContent ?? "",
            backgroundColor: colorButton ? window.getComputedStyle(colorButton).backgroundColor : ""
          };
        }
      );
      const chatColorConfigDetailState = {
        configGroup: chatColorConfigDetail?.getAttribute("data-config-group") ?? "",
        title: chatColorConfigTitle,
        titleColor: chatColorConfigTitleStyle?.color ?? "",
        sourceTitleColor: chatColorConfigTitleElement?.getAttribute("data-source-title-color") ?? "",
        toggleButtonPresent: Boolean(chatColorDetailToggleButton),
        hiddenTogglePresent: Boolean(chatColorDetailHiddenToggle),
        toggleSource: chatColorDetailHiddenToggle?.getAttribute("data-source-toggle") ?? "",
        entries: chatColorConfigEntries
      };

      const chatColorBackButton = queryShell(".runeliteConfigBackButton");
      chatColorBackButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const gpuConfigButton = queryShell('.runelitePluginListItem[data-plugin-list-item-id="gpu"] .runelitePluginConfigButton');
      gpuConfigButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const gpuConfigDetail = queryShell('.runeliteConfigDetailPanel[data-config-plugin-id="gpu"]');
      const gpuConfigTitleElement = queryShell(".runeliteConfigDetailTitle");
      const gpuConfigTitle = gpuConfigTitleElement?.textContent ?? "";
      const gpuConfigTitleStyle = gpuConfigTitleElement ? window.getComputedStyle(gpuConfigTitleElement) : null;
      const gpuConfigTitleColor = gpuConfigTitleStyle?.color ?? "";
      const gpuConfigSourceTitleColor = gpuConfigTitleElement?.getAttribute("data-source-title-color") ?? "";
      const gpuConfigBackButton = queryShell(".runeliteConfigBackButton");
      const gpuConfigBackButtonRect = gpuConfigBackButton?.getBoundingClientRect();
      const gpuConfigEntries = queryShellAll(".runeliteConfigDetailPanel [data-config-item-key]").map((entry) => {
        const key = entry.getAttribute("data-config-item-key");
        const slider = entry.querySelector(".runeliteConfigSlider");
        const sliderRow = entry.querySelector(".runeliteConfigSliderRow");
        const select = entry.querySelector(".runeliteConfigSelect");
        const checkbox = entry.querySelector(".runeliteConfigCheckbox");
        const sliderRect = slider?.getBoundingClientRect();
        const sliderRowRect = sliderRow?.getBoundingClientRect();
        return {
          key,
          sourceComponent:
            slider?.getAttribute("data-source-component") ??
            select?.getAttribute("data-source-component") ??
            checkbox?.getAttribute("data-source-component") ??
            "",
          sliderWidth: Math.round(sliderRect?.width ?? 0),
          sliderRowWidth: Math.round(sliderRowRect?.width ?? 0),
          selectValue: select?.value ?? "",
          checked: checkbox?.checked ?? null
        };
      });
      const gpuRuntimeToggle = queryShell(".runeliteConfigDetailToggleButton");
      gpuRuntimeToggle?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const runtimeCanvas = queryShell(".runtimeViewport canvas");
      const gpuRuntimeDataset = runtimeCanvas
        ? {
            enabled: runtimeCanvas.getAttribute("data-runelite-gpu-enabled"),
            drawDistance: runtimeCanvas.getAttribute("data-runelite-gpu-draw-distance"),
            drawDistanceLocalUnits: runtimeCanvas.getAttribute("data-runelite-gpu-draw-distance-local-units"),
            fogDepth: runtimeCanvas.getAttribute("data-runelite-gpu-fog-depth"),
            fogCircularity: runtimeCanvas.getAttribute("data-runelite-gpu-fog-circularity"),
            fogDensity: runtimeCanvas.getAttribute("data-runelite-gpu-fog-density"),
            antiAliasingMode: runtimeCanvas.getAttribute("data-runelite-gpu-anti-aliasing-mode"),
            anisotropicFilteringMode: runtimeCanvas.getAttribute("data-runelite-gpu-anisotropic-filtering-mode"),
            sourceDrawDistance: runtimeCanvas.getAttribute("data-source-gpu-draw-distance"),
            sourceFogUniforms: runtimeCanvas.getAttribute("data-source-gpu-fog-uniforms")
          }
        : null;

      const gpuBackButton = queryShell(".runeliteConfigBackButton");
      gpuBackButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const antiDragConfigButton = queryShell('.runelitePluginListItem[data-plugin-list-item-id="anti-drag"] .runelitePluginConfigButton');
      antiDragConfigButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const antiDragConfigDetail = queryShell('.runeliteConfigDetailPanel[data-config-plugin-id="anti-drag"]');
      const antiDragConfigTitle = queryShell(".runeliteConfigDetailTitle")?.textContent ?? "";
      const antiDragConfigEntries = queryShellAll(".runeliteConfigDetailPanel [data-config-item-key]").map((entry) => {
        const key = entry.getAttribute("data-config-item-key");
        const slider = entry.querySelector(".runeliteConfigSlider");
        const sliderRow = entry.querySelector(".runeliteConfigSliderRow");
        const checkbox = entry.querySelector(".runeliteConfigCheckbox");
        const sliderRect = slider?.getBoundingClientRect();
        const sliderRowRect = sliderRow?.getBoundingClientRect();
        return {
          key,
          sourceComponent:
            slider?.getAttribute("data-source-component") ??
            checkbox?.getAttribute("data-source-component") ??
            "",
          sliderWidth: Math.round(sliderRect?.width ?? 0),
          sliderRowWidth: Math.round(sliderRowRect?.width ?? 0),
          checked: checkbox?.checked ?? null,
          sliderValue: slider?.value ?? ""
        };
      });
      const antiDragRuntimeToggle = queryShell(".runeliteConfigDetailToggleButton");
      const antiDragAlwaysOnCheckbox = queryShell('.runeliteConfigDetailPanel [data-config-item-key="alwaysOn"] .runeliteConfigCheckbox');
      antiDragRuntimeToggle?.click();
      antiDragAlwaysOnCheckbox?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const antiDragRuntimeDataset = runtimeCanvas
        ? {
            enabled: runtimeCanvas.getAttribute("data-runelite-anti-drag-enabled"),
            alwaysOn: runtimeCanvas.getAttribute("data-runelite-anti-drag-always-on"),
            delayClientTicks: runtimeCanvas.getAttribute("data-runelite-anti-drag-delay-client-ticks"),
            effectiveDelayClientTicks: runtimeCanvas.getAttribute("data-runelite-anti-drag-effective-delay-client-ticks"),
            effectiveDelayMs: runtimeCanvas.getAttribute("data-runelite-anti-drag-effective-delay-ms"),
            sourceDefaultDelay: runtimeCanvas.getAttribute("data-source-anti-drag-default-delay"),
            sourceActiveDelay: runtimeCanvas.getAttribute("data-source-anti-drag-active-delay"),
            sourceTickLength: runtimeCanvas.getAttribute("data-source-anti-drag-tick-length")
          }
        : null;
      const antiDragInventorySlot = queryShell(".nhInventorySlot");
      const antiDragInventorySlotDataset = antiDragInventorySlot
        ? {
            delayClientTicks: antiDragInventorySlot.getAttribute("data-inventory-drag-delay-client-ticks"),
            source: antiDragInventorySlot.getAttribute("data-source-inventory-drag-delay")
          }
        : null;

      const antiDragBackButton = queryShell(".runeliteConfigBackButton");
      antiDragBackButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const freezeTimersConfigButton = queryShell('.runelitePluginListItem[data-plugin-list-item-id="freeze-timers"] .runelitePluginConfigButton');
      freezeTimersConfigButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const freezeTimersConfigDetail = queryShell('.runeliteConfigDetailPanel[data-config-plugin-id="freeze-timers"]');
      const freezeTimersConfigTitle = queryShell(".runeliteConfigDetailTitle")?.textContent ?? "";
      const freezeTimersConfigEntries = queryShellAll(".runeliteConfigDetailPanel [data-config-item-key]").map((entry) => {
        const key = entry.getAttribute("data-config-item-key");
        const slider = entry.querySelector(".runeliteConfigSlider");
        const sliderRow = entry.querySelector(".runeliteConfigSliderRow");
        const select = entry.querySelector(".runeliteConfigSelect");
        const checkbox = entry.querySelector(".runeliteConfigCheckbox");
        const sliderRect = slider?.getBoundingClientRect();
        const sliderRowRect = sliderRow?.getBoundingClientRect();
        return {
          key,
          sourceComponent:
            slider?.getAttribute("data-source-component") ??
            select?.getAttribute("data-source-component") ??
            checkbox?.getAttribute("data-source-component") ??
            "",
          sliderWidth: Math.round(sliderRect?.width ?? 0),
          sliderRowWidth: Math.round(sliderRowRect?.width ?? 0),
          selectValue: select?.value ?? "",
          checked: checkbox?.checked ?? null,
          sliderValue: slider?.value ?? ""
        };
      });
      const freezeTimersRuntimeToggle = queryShell(".runeliteConfigDetailToggleButton");
      freezeTimersRuntimeToggle?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const freezeTimersRuntimeDataset = runtimeCanvas
        ? {
            enabled: runtimeCanvas.getAttribute("data-runelite-freeze-timers-enabled"),
            showPlayers: runtimeCanvas.getAttribute("data-runelite-freeze-timers-show-players"),
            freezeTimers: runtimeCanvas.getAttribute("data-runelite-freeze-timers-freeze-timers"),
            xOffset: runtimeCanvas.getAttribute("data-runelite-freeze-timers-x-offset"),
            noImage: runtimeCanvas.getAttribute("data-runelite-freeze-timers-no-image"),
            fontStyle: runtimeCanvas.getAttribute("data-runelite-freeze-timers-font-style"),
            textSize: runtimeCanvas.getAttribute("data-runelite-freeze-timers-text-size"),
            sourcePlugin: runtimeCanvas.getAttribute("data-source-freeze-timers-plugin"),
            sourceOverlay: runtimeCanvas.getAttribute("data-source-freeze-timers-overlay"),
            sourceBarrage: runtimeCanvas.getAttribute("data-source-freeze-timers-barrage"),
            sourceImmunity: runtimeCanvas.getAttribute("data-source-freeze-timers-immunity")
          }
        : null;

      const freezeTimersBackButton = queryShell(".runeliteConfigBackButton");
      freezeTimersBackButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const specBarListItem = queryShell('.runelitePluginListItem[data-plugin-list-item-id="spec-bar"]');
      const specBarToggleButton = specBarListItem?.querySelector(".runelitePluginToggleButton");
      specBarToggleButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const specBarRuntimeDataset = runtimeCanvas
        ? {
            enabled: runtimeCanvas.getAttribute("data-runelite-spec-bar-enabled"),
            drawSpecbarAnyway: runtimeCanvas.getAttribute("data-runelite-spec-bar-draw-specbar-anyway"),
            sourcePlugin: runtimeCanvas.getAttribute("data-source-spec-bar-plugin"),
            sourceCallback: runtimeCanvas.getAttribute("data-source-spec-bar-script-callback"),
            sourceStackMutation: runtimeCanvas.getAttribute("data-source-spec-bar-stack-mutation")
          }
        : null;

      const attackStylesConfigButton = queryShell('.runelitePluginListItem[data-plugin-list-item-id="attack-styles"] .runelitePluginConfigButton');
      if (attackStylesConfigButton) {
        attackStylesConfigButton.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }

      const attackStylesConfigDetail = queryShell('.runeliteConfigDetailPanel[data-config-plugin-id="attack-styles"]');
      const attackStylesConfigTitle = attackStylesConfigDetail ? queryShell(".runeliteConfigDetailTitle")?.textContent ?? "" : "";
      const attackStylesConfigEntries = attackStylesConfigDetail
        ? queryShellAll('.runeliteConfigDetailPanel[data-config-plugin-id="attack-styles"] [data-config-item-key]').map((entry) => {
            const key = entry.getAttribute("data-config-item-key");
            const checkbox = entry.querySelector(".runeliteConfigCheckbox");
            return {
              key,
              sourceComponent: checkbox?.getAttribute("data-source-component") ?? "",
              checked: checkbox?.checked ?? null
            };
          })
        : [];
      if (attackStylesConfigDetail) {
        const attackStylesRuntimeToggle = queryShell(".runeliteConfigDetailToggleButton");
        attackStylesRuntimeToggle?.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
      const attackStylesOverlay = queryShell(".runeliteAttackStylesOverlay");
      const attackStylesOverlayRect = attackStylesOverlay?.getBoundingClientRect();
      const attackStylesRuntimeDataset = runtimeCanvas
        ? {
            enabled: runtimeCanvas.getAttribute("data-runelite-attack-styles-enabled"),
            alwaysShowStyle: runtimeCanvas.getAttribute("data-runelite-attack-styles-always-show-style"),
            warnForDefence: runtimeCanvas.getAttribute("data-runelite-attack-styles-warn-for-defence"),
            warnForAttack: runtimeCanvas.getAttribute("data-runelite-attack-styles-warn-for-attack"),
            warnForStrength: runtimeCanvas.getAttribute("data-runelite-attack-styles-warn-for-strength"),
            warnForRanged: runtimeCanvas.getAttribute("data-runelite-attack-styles-warn-for-ranged"),
            warnForMagic: runtimeCanvas.getAttribute("data-runelite-attack-styles-warn-for-magic"),
            hideAutoRetaliate: runtimeCanvas.getAttribute("data-runelite-attack-styles-hide-auto-retaliate"),
            removeWarnedStyles: runtimeCanvas.getAttribute("data-runelite-attack-styles-remove-warned-styles"),
            sourcePlugin: runtimeCanvas.getAttribute("data-source-attack-styles-plugin"),
            sourceOverlay: runtimeCanvas.getAttribute("data-source-attack-styles-overlay"),
            sourceVars: runtimeCanvas.getAttribute("data-source-attack-styles-vars"),
            sourceWeaponType: runtimeCanvas.getAttribute("data-source-attack-styles-weapon-type")
          }
        : null;
      const attackStylesOverlayDataset = attackStylesOverlay
        ? {
            attackStyleId: attackStylesOverlay.getAttribute("data-attack-style-id"),
            attackStyleName: attackStylesOverlay.getAttribute("data-attack-style-name"),
            warnedSkillSelected: attackStylesOverlay.getAttribute("data-warned-skill-selected"),
            weaponTypeConfig: attackStylesOverlay.getAttribute("data-weapon-type-config"),
            attackSetIndex: attackStylesOverlay.getAttribute("data-attack-set-index"),
            defensiveCastingMode: attackStylesOverlay.getAttribute("data-defensive-casting-mode"),
            sourceOverlay: attackStylesOverlay.getAttribute("data-source-overlay"),
            sourcePosition: attackStylesOverlay.getAttribute("data-source-overlay-position"),
            width: Math.round(attackStylesOverlayRect?.width ?? 0),
            height: Math.round(attackStylesOverlayRect?.height ?? 0),
            text: attackStylesOverlay.textContent ?? ""
          }
        : null;

      if (attackStylesConfigDetail) {
        const attackStylesBackButton = queryShell(".runeliteConfigBackButton");
        attackStylesBackButton?.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }

      const statusBarsConfigButton = queryShell('.runelitePluginListItem[data-plugin-list-item-id="status-bars"] .runelitePluginConfigButton');
      statusBarsConfigButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const statusBarsConfigDetail = queryShell('.runeliteConfigDetailPanel[data-config-plugin-id="status-bars"]');
      const statusBarsConfigTitle = queryShell(".runeliteConfigDetailTitle")?.textContent ?? "";
      const statusBarsConfigEntries = queryShellAll(".runeliteConfigDetailPanel [data-config-item-key]").map((entry) => {
        const key = entry.getAttribute("data-config-item-key");
        const slider = entry.querySelector(".runeliteConfigSlider");
        const sliderRow = entry.querySelector(".runeliteConfigSliderRow");
        const select = entry.querySelector(".runeliteConfigSelect");
        const checkbox = entry.querySelector(".runeliteConfigCheckbox");
        const sliderRect = slider?.getBoundingClientRect();
        const sliderRowRect = sliderRow?.getBoundingClientRect();
        return {
          key,
          sourceComponent:
            slider?.getAttribute("data-source-component") ??
            select?.getAttribute("data-source-component") ??
            checkbox?.getAttribute("data-source-component") ??
            "",
          sliderWidth: Math.round(sliderRect?.width ?? 0),
          sliderRowWidth: Math.round(sliderRowRect?.width ?? 0),
          selectValue: select?.value ?? "",
          checked: checkbox?.checked ?? null,
          sliderValue: slider?.value ?? ""
        };
      });
      const statusBarsRuntimeToggle = queryShell(".runeliteConfigDetailToggleButton");
      statusBarsRuntimeToggle?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const statusBarsLeftOverlay = queryShell('.runeliteStatusBarOverlay[data-status-bar-side="left"]');
      const statusBarsRightOverlay = queryShell('.runeliteStatusBarOverlay[data-status-bar-side="right"]');
      const statusBarsLeftRect = statusBarsLeftOverlay?.getBoundingClientRect();
      const statusBarsRightRect = statusBarsRightOverlay?.getBoundingClientRect();
      const statusBarsRuntimeDataset = runtimeCanvas
        ? {
            enabled: runtimeCanvas.getAttribute("data-runelite-status-bars-enabled"),
            enableCounter: runtimeCanvas.getAttribute("data-runelite-status-bars-enable-counter"),
            enableSkillIcon: runtimeCanvas.getAttribute("data-runelite-status-bars-enable-skill-icon"),
            enableRestorationBars: runtimeCanvas.getAttribute("data-runelite-status-bars-enable-restoration-bars"),
            leftBarMode: runtimeCanvas.getAttribute("data-runelite-status-bars-left-bar-mode"),
            rightBarMode: runtimeCanvas.getAttribute("data-runelite-status-bars-right-bar-mode"),
            sourcePlugin: runtimeCanvas.getAttribute("data-source-status-bars-plugin"),
            sourceOverlay: runtimeCanvas.getAttribute("data-source-status-bars-overlay"),
            sourceViewport: runtimeCanvas.getAttribute("data-source-status-bars-viewport"),
            sourceBarRenderer: runtimeCanvas.getAttribute("data-source-status-bars-bar-renderer")
          }
        : null;
      const statusBarsOverlayDataset = statusBarsLeftOverlay
        ? {
            mode: statusBarsLeftOverlay.getAttribute("data-status-bar-mode"),
            renderer: statusBarsLeftOverlay.getAttribute("data-source-renderer"),
            viewport: statusBarsLeftOverlay.getAttribute("data-source-viewport"),
            sourceX: statusBarsLeftOverlay.getAttribute("data-source-x"),
            sourceY: statusBarsLeftOverlay.getAttribute("data-source-y"),
            filledHeight: statusBarsLeftOverlay.getAttribute("data-status-bar-filled-height"),
            iconComplete: statusBarsLeftOverlay.querySelector("img")?.complete ?? false,
            iconNaturalWidth: statusBarsLeftOverlay.querySelector("img")?.naturalWidth ?? 0,
            iconNaturalHeight: statusBarsLeftOverlay.querySelector("img")?.naturalHeight ?? 0,
            width: Math.round(statusBarsLeftRect?.width ?? 0),
            height: Math.round(statusBarsLeftRect?.height ?? 0),
            rightWidth: Math.round(statusBarsRightRect?.width ?? 0),
            rightHeight: Math.round(statusBarsRightRect?.height ?? 0)
          }
        : null;

      const statusBarsBackButton = queryShell(".runeliteConfigBackButton");
      statusBarsBackButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const opponentInfoConfigButton = queryShell('.runelitePluginListItem[data-plugin-list-item-id="opponent-info"] .runelitePluginConfigButton');
      opponentInfoConfigButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const opponentInfoConfigDetail = queryShell('.runeliteConfigDetailPanel[data-config-plugin-id="opponent-info"]');
      const opponentInfoConfigTitle = queryShell(".runeliteConfigDetailTitle")?.textContent ?? "";
      const opponentInfoConfigEntries = queryShellAll(".runeliteConfigDetailPanel [data-config-item-key]").map((entry) => {
        const key = entry.getAttribute("data-config-item-key");
        const select = entry.querySelector(".runeliteConfigSelect");
        const checkbox = entry.querySelector(".runeliteConfigCheckbox");
        const colorButton = entry.querySelector(".runeliteConfigColorButton");
        return {
          key,
          sourceComponent:
            select?.getAttribute("data-source-component") ??
            checkbox?.getAttribute("data-source-component") ??
            colorButton?.getAttribute("data-source-component") ??
            "",
          selectValue: select?.value ?? "",
          checked: checkbox?.checked ?? null,
          colorText: colorButton?.textContent ?? ""
        };
      });
      const opponentInfoRuntimeToggle = queryShell(".runeliteConfigDetailToggleButton");
      opponentInfoRuntimeToggle?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const opponentInfoRuntimeDataset = runtimeCanvas
        ? {
            enabled: runtimeCanvas.getAttribute("data-runelite-opponent-info-enabled"),
            lookupOnInteraction: runtimeCanvas.getAttribute("data-runelite-opponent-info-lookup-on-interaction"),
            hitpointsDisplayStyle: runtimeCanvas.getAttribute("data-runelite-opponent-info-hitpoints-display-style"),
            showOpponentsOpponent: runtimeCanvas.getAttribute("data-runelite-opponent-info-show-opponents-opponent"),
            showAttackersMenu: runtimeCanvas.getAttribute("data-runelite-opponent-info-show-attackers-menu"),
            showAttackingMenu: runtimeCanvas.getAttribute("data-runelite-opponent-info-show-attacking-menu"),
            attackingColor: runtimeCanvas.getAttribute("data-runelite-opponent-info-attacking-color"),
            showHitpointsMenu: runtimeCanvas.getAttribute("data-runelite-opponent-info-show-hitpoints-menu"),
            sourcePlugin: runtimeCanvas.getAttribute("data-source-opponent-info-plugin"),
            sourceOverlay: runtimeCanvas.getAttribute("data-source-opponent-info-overlay"),
            sourcePanel: runtimeCanvas.getAttribute("data-source-opponent-info-panel"),
            sourceProgress: runtimeCanvas.getAttribute("data-source-opponent-info-progress")
          }
        : null;

      const opponentInfoBackButton = queryShell(".runeliteConfigBackButton");
      opponentInfoBackButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const playerIndicatorsConfigButton = queryShell('.runelitePluginListItem[data-plugin-list-item-id="player-indicators"] .runelitePluginConfigButton');
      playerIndicatorsConfigButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const playerIndicatorsConfigDetail = queryShell('.runeliteConfigDetailPanel[data-config-plugin-id="player-indicators"]');
      const playerIndicatorsConfigTitle = queryShell(".runeliteConfigDetailTitle")?.textContent ?? "";
      const readPlayerIndicatorsSections = () =>
        queryShellAll('.runeliteConfigDetailPanel[data-config-plugin-id="player-indicators"] .runeliteConfigCollapsibleSection').map((section) => {
          const contents = section.querySelector(".runeliteConfigSectionContents");
          const icon = section.querySelector(".runeliteConfigSectionIcon");
          return {
            key: section.getAttribute("data-config-section"),
            expanded: section.getAttribute("data-section-expanded"),
            toggleSource: section.getAttribute("data-source-toggle"),
            iconSource: icon?.getAttribute("data-source-icon") ?? "",
            contentsHidden: contents?.hasAttribute("hidden") ?? null,
            contentsVisibleSource: contents?.getAttribute("data-source-section-visible") ?? ""
          };
        });
      const playerIndicatorsSectionsBeforeToggle = readPlayerIndicatorsSections();
      const playerIndicatorsTargetSectionButton = queryShell(
        '.runeliteConfigDetailPanel[data-config-plugin-id="player-indicators"] .runeliteConfigCollapsibleSection[data-config-section="targetSection"] .runeliteConfigSectionHeader'
      );
      playerIndicatorsTargetSectionButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const playerIndicatorsSectionsAfterToggle = readPlayerIndicatorsSections();
      const playerIndicatorsConfigEntries = queryShellAll(".runeliteConfigDetailPanel [data-config-item-key]").map((entry) => {
        const key = entry.getAttribute("data-config-item-key");
        const checkbox = entry.querySelector(".runeliteConfigCheckbox");
        const colorButton = entry.querySelector(".runeliteConfigColorButton");
        return {
          key,
          sourceComponent:
            checkbox?.getAttribute("data-source-component") ??
            colorButton?.getAttribute("data-source-component") ??
            "",
          checked: checkbox?.checked ?? null,
          colorText: colorButton?.textContent ?? ""
        };
      });
      const playerIndicatorsRuntimeToggle = queryShell(".runeliteConfigDetailToggleButton");
      const playerIndicatorsTargetCheckbox = queryShell('.runeliteConfigDetailPanel [data-config-item-key="drawTargetsNames"] .runeliteConfigCheckbox');
      const playerIndicatorsShowCombatCheckbox = queryShell('.runeliteConfigDetailPanel [data-config-item-key="showCombat"] .runeliteConfigCheckbox');
      playerIndicatorsRuntimeToggle?.click();
      playerIndicatorsTargetCheckbox?.click();
      playerIndicatorsShowCombatCheckbox?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const playerIndicatorOverlay = queryShell('.runelitePlayerIndicatorOverlay[data-player-indicator-relation="TARGET"]');
      const playerIndicatorRect = playerIndicatorOverlay?.getBoundingClientRect();
      const playerIndicatorsRuntimeDataset = runtimeCanvas
        ? {
            enabled: runtimeCanvas.getAttribute("data-runelite-player-indicators-enabled"),
            highlightOwnPlayer: runtimeCanvas.getAttribute("data-runelite-player-indicators-highlight-own-player"),
            ownPlayerColor: runtimeCanvas.getAttribute("data-runelite-player-indicators-own-player-color"),
            highlightTargets: runtimeCanvas.getAttribute("data-runelite-player-indicators-highlight-targets"),
            targetColor: runtimeCanvas.getAttribute("data-runelite-player-indicators-target-color"),
            showCombatLevel: runtimeCanvas.getAttribute("data-runelite-player-indicators-show-combat-level"),
            playerSkull: runtimeCanvas.getAttribute("data-runelite-player-indicators-player-skull"),
            highlightOtherPlayers: runtimeCanvas.getAttribute("data-runelite-player-indicators-highlight-other-players"),
            otherPlayerColor: runtimeCanvas.getAttribute("data-runelite-player-indicators-other-player-color"),
            sourcePlugin: runtimeCanvas.getAttribute("data-source-player-indicators-plugin"),
            sourceOverlay: runtimeCanvas.getAttribute("data-source-player-indicators-overlay"),
            sourceMinimapOverlay: runtimeCanvas.getAttribute("data-source-player-indicators-minimap-overlay"),
            sourceService: runtimeCanvas.getAttribute("data-source-player-indicators-service"),
            sourceLocations: runtimeCanvas.getAttribute("data-source-player-indicators-locations")
          }
        : null;
      const playerIndicatorsOverlayDataset = playerIndicatorOverlay
        ? {
            actorId: playerIndicatorOverlay.getAttribute("data-actor-id"),
            relation: playerIndicatorOverlay.getAttribute("data-player-indicator-relation"),
            label: playerIndicatorOverlay.textContent ?? "",
            sourceOverlay: playerIndicatorOverlay.getAttribute("data-source-overlay"),
            sourceLocation: playerIndicatorOverlay.getAttribute("data-source-location"),
            width: Math.round(playerIndicatorRect?.width ?? 0),
            height: Math.round(playerIndicatorRect?.height ?? 0)
          }
        : null;

      const playerIndicatorsBackButton = queryShell(".runeliteConfigBackButton");
      playerIndicatorsBackButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const boostsConfigButton = queryShell('.runelitePluginListItem[data-plugin-list-item-id="boosts-information"] .runelitePluginConfigButton');
      boostsConfigButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const boostsConfigDetail = queryShell('.runeliteConfigDetailPanel[data-config-plugin-id="boosts-information"]');
      const boostsConfigTitle = queryShell(".runeliteConfigDetailTitle")?.textContent ?? "";
      const boostsConfigEntries = queryShellAll(".runeliteConfigDetailPanel [data-config-item-key]").map((entry) => {
        const key = entry.getAttribute("data-config-item-key");
        const select = entry.querySelector(".runeliteConfigSelect");
        const checkbox = entry.querySelector(".runeliteConfigCheckbox");
        const slider = entry.querySelector(".runeliteConfigSlider");
        return {
          key,
          sourceComponent:
            select?.getAttribute("data-source-component") ??
            checkbox?.getAttribute("data-source-component") ??
            slider?.getAttribute("data-source-component") ??
            "",
          selectValue: select?.value ?? "",
          checked: checkbox?.checked ?? null,
          sliderValue: slider?.value ?? ""
        };
      });
      const boostsRuntimeToggle = queryShell(".runeliteConfigDetailToggleButton");
      boostsRuntimeToggle?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const boostsOverlay = queryShell(".runeliteBoostsOverlay");
      const boostsRows = boostsOverlay
        ? [...boostsOverlay.querySelectorAll(".runeliteBoostsRow")].map((row) => ({
            skillId: row.getAttribute("data-boost-skill-id") ?? "",
            sourceSkill: row.getAttribute("data-source-skill") ?? "",
            current: row.getAttribute("data-boost-current") ?? "",
            base: row.getAttribute("data-boost-base") ?? ""
          }))
        : [];
      const boostsFirstRow = boostsRows[0];
      const boostsRuntimeDataset = runtimeCanvas
        ? {
            enabled: runtimeCanvas.getAttribute("data-runelite-boosts-enabled"),
            displayBoosts: runtimeCanvas.getAttribute("data-runelite-boosts-display-boosts"),
            relativeBoost: runtimeCanvas.getAttribute("data-runelite-boosts-relative-boost"),
            displayInfoboxes: runtimeCanvas.getAttribute("data-runelite-boosts-display-infoboxes"),
            displayIcons: runtimeCanvas.getAttribute("data-runelite-boosts-display-icons"),
            displayNextBuffChange: runtimeCanvas.getAttribute("data-runelite-boosts-display-next-buff-change"),
            displayNextDebuffChange: runtimeCanvas.getAttribute("data-runelite-boosts-display-next-debuff-change"),
            boostThreshold: runtimeCanvas.getAttribute("data-runelite-boosts-boost-threshold"),
            sourcePlugin: runtimeCanvas.getAttribute("data-source-boosts-plugin"),
            sourceOverlay: runtimeCanvas.getAttribute("data-source-boosts-overlay"),
            sourceCombatIconsOverlay: runtimeCanvas.getAttribute("data-source-boosts-combat-icons-overlay"),
            sourceSkills: runtimeCanvas.getAttribute("data-source-boosts-skills")
          }
        : null;
      const boostsOverlayDataset = boostsOverlay
        ? {
            mode: boostsOverlay.getAttribute("data-boosts-mode"),
            rowCount: boostsOverlay.getAttribute("data-boosts-row-count"),
            sourceOverlay: boostsOverlay.getAttribute("data-source-overlay"),
            sourcePosition: boostsOverlay.getAttribute("data-source-position"),
            firstSkillId: boostsFirstRow?.skillId ?? "",
            firstSourceSkill: boostsFirstRow?.sourceSkill ?? "",
            firstCurrent: boostsFirstRow?.current ?? "",
            firstBase: boostsFirstRow?.base ?? "",
            rows: boostsRows
          }
        : null;
      const boostsSourceSkillOrder = (boostsRuntimeDataset?.sourceSkills ?? "").split(",");
      const boostsRowsInSourceOrder =
        boostsOverlayDataset?.rows?.every((row, index, rows) => {
          const orderIndex = boostsSourceSkillOrder.indexOf(row.sourceSkill);
          const previousOrderIndex =
            index > 0 ? boostsSourceSkillOrder.indexOf(rows[index - 1].sourceSkill) : orderIndex;
          return orderIndex >= 0 && previousOrderIndex >= 0 && previousOrderIndex <= orderIndex;
        }) ?? false;

      const pvpButton = queryShell('.runeliteToolbarButton[data-navigation-button-id="pvp-fight-history"]');
      pvpButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const pvpPanel = queryShell(".runelitePvpTrackerPanel");
      const pvpTitle = queryShell(".runelitePvpTitle")?.textContent ?? "";
      const pvpStatLabels = queryShellAll(".runelitePvpStatLine span:first-child").map((element) => element.textContent ?? "");
      const pvpFilter = queryShell(".runelitePvpFilterLine");
      const pvpFilterRect = pvpFilter?.getBoundingClientRect();
      const pvpScroller = queryShell(".runelitePvpFightHistoryScroller");
      const pvpScrollerRect = pvpScroller?.getBoundingClientRect();

      const infoButton = queryShell('.runeliteToolbarButton[data-navigation-button-id="info"]');
      infoButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const infoPanel = queryShell(".runeliteInfoPanel");
      const infoVersionLabels = queryShellAll(".runeliteInfoVersionLine").map((element) => element.textContent ?? "");
      const infoActions = queryShellAll(".runeliteInfoAction").map((action) => {
        const icon = action.querySelector(".runeliteInfoActionIcon");
        const arrow = action.querySelector(".runeliteInfoActionArrow");
        const rect = action.getBoundingClientRect();
        const iconRect = icon?.getBoundingClientRect();
        const arrowRect = arrow?.getBoundingClientRect();
        return {
          id: action.getAttribute("data-info-action-id"),
          kind: action.getAttribute("data-info-action-kind"),
          target: action.getAttribute("data-source-target"),
          resolvedTarget: action.getAttribute("data-info-resolved-target"),
          sourceLinkPanel: action.getAttribute("data-source-link-panel"),
          sourceActionTargets: action.getAttribute("data-source-action-targets"),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          iconComplete: icon?.complete ?? false,
          iconNaturalWidth: icon?.naturalWidth ?? 0,
          iconNaturalHeight: icon?.naturalHeight ?? 0,
          iconWidth: Math.round(iconRect?.width ?? 0),
          iconHeight: Math.round(iconRect?.height ?? 0),
          arrowComplete: arrow?.complete ?? false,
          arrowNaturalWidth: arrow?.naturalWidth ?? 0,
          arrowNaturalHeight: arrow?.naturalHeight ?? 0,
          arrowWidth: Math.round(arrowRect?.width ?? 0),
          arrowHeight: Math.round(arrowRect?.height ?? 0)
        };
      });
      const openedInfoActionUrls = [];
      const originalWindowOpen = window.open;
      window.open = (url, target, features) => {
        openedInfoActionUrls.push({ url: String(url), target: String(target), features: String(features) });
        return null;
      };
      queryShell('.runeliteInfoAction[data-info-action-id="license"]')?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.open = originalWindowOpen;
      const infoActionDispatch = {
        id: document.documentElement.dataset.runeliteLastInfoActionId ?? "",
        target: document.documentElement.dataset.runeliteLastInfoActionTarget ?? "",
        kind: document.documentElement.dataset.runeliteLastInfoActionKind ?? "",
        openedUrls: openedInfoActionUrls
      };

      const toolbarRect = toolbar?.getBoundingClientRect();
      const sidebarToggleRect = sidebarToggle?.getBoundingClientRect();
      const sidebarHotZoneRect = sidebarHotZone?.getBoundingClientRect();
      const computedSidebarToggleImage = sidebarToggleImage ? getComputedStyle(sidebarToggleImage) : null;
      const shellRect = shell.getBoundingClientRect();
      const computedToolbar = toolbar ? getComputedStyle(toolbar) : null;
      const computedActiveButton = infoButton ? getComputedStyle(infoButton) : null;
      const toolbarBackground = computedToolbar?.backgroundColor ?? "";
      const activeButtonBackground = computedActiveButton?.backgroundColor ?? "";

      sidebarToggle?.click();
      const closedSidebarState = await waitForSidebarState(false);
      const closedToolbarPresent = Boolean(queryShell(".runelitePluginToolbar"));
      const closedNavContainer = queryShell(".runeliteNavContainer");
      const closedToggle = queryShell(".runeliteSidebarToggleButton");
      const closedToggleImage = closedToggle?.querySelector("img");
      const closedNavOpen = closedNavContainer?.getAttribute("data-open") ?? "";
      const closedToggleSidebarOpen = closedToggle?.getAttribute("data-sidebar-open") ?? "";
      const closedToggleImageTransform = closedToggleImage ? getComputedStyle(closedToggleImage).transform : "";

      closedToggle?.click();
      const reopenedSidebarState = await waitForSidebarState(true);
      const reopenedToolbar = queryShell(".runelitePluginToolbar");
      const reopenedNavContainer = queryShell(".runeliteNavContainer");
      const reopenedInfoButton = queryShell('.runeliteToolbarButton[data-navigation-button-id="info"]');

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "F11", ctrlKey: true, bubbles: true, cancelable: true }));
      const hotkeyClosedSidebarState = await waitForSidebarState(false);
      const hotkeyClosedToolbarPresent = Boolean(queryShell(".runelitePluginToolbar"));
      const hotkeyClosedNavContainer = queryShell(".runeliteNavContainer");
      const hotkeyClosedNavOpen = hotkeyClosedNavContainer?.getAttribute("data-open") ?? "";

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "F11", ctrlKey: true, bubbles: true, cancelable: true }));
      const hotkeyReopenedSidebarState = await waitForSidebarState(true);
      const hotkeyReopenedToolbar = queryShell(".runelitePluginToolbar");
      const hotkeyReopenedNavContainer = queryShell(".runeliteNavContainer");
      const hotkeyReopenedInfoButton = queryShell('.runeliteToolbarButton[data-navigation-button-id="info"]');
      const hotkeyReopenedNavOpen = hotkeyReopenedNavContainer?.getAttribute("data-open") ?? "";

      return {
        ok:
          Boolean(toolbar) &&
          Boolean(sidebarToggle) &&
          Boolean(sidebarHotZone) &&
          initialStretchedModeEnabled === "true" &&
          initialStretchedModeListEnabled === "true" &&
          initialStretchedModeSourcePlugin ===
            "StretchedModePlugin startUp client.setStretchedEnabled(true), updateConfig set integerScaling/keepAspectRatio/fast/scalingFactor, invalidateStretching(true)" &&
          initialStretchedModeSourceDimensions ===
            "Client.getRealDimensions keeps fixed mode at Constants.GAME_FIXED_SIZE; Client.getStretchedDimensions uses parent width/height, keepAspectRatio, and integerScaling" &&
          initialStretchedModeSourceMouse ===
            "TranslateMouseListener divides stretched mouse X/Y by stretchedDimensions / realDimensions before dispatch" &&
          initialRuntimeCanvasImageRendering === "auto" &&
          initialNhHudSpriteImageRendering === "auto" &&
          initialDisabledPluginSource ===
            "NH trainer disables AttackStylesPlugin at the plugin manager boundary; combat tab attack-style widgets remain source-backed." &&
          !initialAttackStylesListItem &&
          buttons.length === 3 &&
          toolbarSourceSort === "ClientPluginToolbar TreeMap compareTrueFirst(tab) priority tooltip" &&
          toolbarSourceDelimiter === "ClientPluginToolbar update Box.createVerticalGlue addSeparator before first non-tab" &&
          sidebarToggle?.getAttribute("data-source-overlay") === "ClientUI.paintOverlays sidebarOpen ? sidebarClosedIcon : sidebarOpenIcon" &&
          sidebarToggle?.getAttribute("data-source-click") === "MouseListener sidebarButtonPosition.contains -> toggleSidebar" &&
          sidebarToggle?.getAttribute("data-source-flip") === "ImageUtil.flipImage(sidebarOpenIcon, true, false)" &&
          sidebarToggle?.getAttribute("data-source-state") === "toggleSidebar removes/adds pluginToolbar and preserves currentNavButton" &&
          sidebarToggle?.getAttribute("data-source-hotkey") === "HotkeyListener new Keybind(KeyEvent.VK_F11, InputEvent.CTRL_DOWN_MASK) -> toggleSidebar" &&
          sidebarHotkeySource === "HotkeyListener new Keybind(KeyEvent.VK_F11, InputEvent.CTRL_DOWN_MASK) -> toggleSidebar" &&
          sidebarStateModelSource === "ClientUI sidebarOpen currentNavButton pluginPanel" &&
          sidebarSelectionSource === "ClientUI currentButton currentNavButton setSelected(sidebarOpen)" &&
          sidebarHotZone?.getAttribute("data-source-range") === "sidebarButtonRange x - 15 width image.getWidth() + 25 full height" &&
          Math.round(sidebarToggleRect?.width ?? 0) === 10 &&
          Math.round(sidebarToggleRect?.height ?? 0) === 20 &&
          Math.round(sidebarHotZoneRect?.width ?? 0) === 35 &&
          Math.round(sidebarHotZoneRect?.height ?? 0) === 503 &&
          sidebarToggleImage?.getAttribute("src") === "runelite-ui/open_rs.png" &&
          sidebarToggleImage?.complete === true &&
          sidebarToggleImage?.naturalWidth === 10 &&
          sidebarToggleImage?.naturalHeight === 20 &&
          computedSidebarToggleImage?.transform !== "none" &&
          closedToolbarPresent === false &&
          closedNavOpen === "false" &&
          closedSidebarState.currentNavButtonId === "info" &&
          closedToggleSidebarOpen === "false" &&
          closedToggleImageTransform === "none" &&
          Boolean(reopenedToolbar) &&
          reopenedNavContainer?.getAttribute("data-open") === "true" &&
          reopenedSidebarState.currentNavButtonId === "info" &&
          reopenedInfoButton?.getAttribute("aria-pressed") === "true" &&
          hotkeyClosedToolbarPresent === false &&
          hotkeyClosedNavOpen === "false" &&
          hotkeyClosedSidebarState.currentNavButtonId === "info" &&
          Boolean(hotkeyReopenedToolbar) &&
          hotkeyReopenedNavOpen === "true" &&
          hotkeyReopenedSidebarState.currentNavButtonId === "info" &&
          hotkeyReopenedInfoButton?.getAttribute("aria-pressed") === "true" &&
          buttonSources.every((button) => button.fields === "NavigationButton icon tab tooltip selected onClick onSelect panel priority popup") &&
          buttonSources.every((button) => button.equality === 'NavigationButton @EqualsAndHashCode(of = {"tooltip"})') &&
          icons.every((icon) => icon.complete && icon.naturalWidth > 0 && icon.naturalHeight > 0 && icon.width === 16 && icon.height === 16) &&
          icons.some((icon) => icon.src === "runelite-ui/skull_red.png") &&
          Boolean(configPanel) &&
          configPanelSourcePinned.includes("runelite/pinnedPlugins") &&
          Math.round(configSearchRect?.width ?? 0) === 205 &&
          Math.round(configSearchRect?.height ?? 0) === 30 &&
          configSearchInitial.sourceComponent === "IconTextField" &&
          configSearchInitial.sourceLayout === "IconTextField BorderLayout iconWrapperLabel preferred 30 WEST FlatTextField CENTER clearButton EAST" &&
          configSearchInitial.sourceClear === "IconTextField DocumentListener clearButton visible when text present; ActionListener/mousePressed setText(null)" &&
          configSearchInitial.sourceHover === "IconTextField hoverEffect set hover background and clearButton Color.PINK" &&
          configSearchInitial.sourceFlatTextField === "FlatTextField EmptyBorder(0, 10, 0, 0) selectedTextColor WHITE selectionColor BRAND_BLUE_TRANSPARENT" &&
          configSearchInitial.sourceConfigSearch.includes("searchBar.setIcon(IconTextField.Icon.SEARCH)") &&
          configSearchInitial.iconWrapperWidth === 30 &&
          configSearchInitial.flatPaddingLeft === "10px" &&
          configSearchInitial.clearVisible === "false" &&
          configSearchInitial.clearButtonPresent === false &&
          configSearchAfterType.inputValue === "gpu" &&
          configSearchAfterType.clearVisible === "true" &&
          configSearchAfterType.clearButtonPresent === true &&
          configSearchAfterType.clearButtonSource === "DocumentListener clearButton.setVisible(!getText().isEmpty())" &&
          configSearchAfterType.filteredItems.includes("gpu") &&
          configSearchAfterClear.inputValue === "" &&
          configSearchAfterClear.clearVisible === "false" &&
          configSearchAfterClear.clearButtonPresent === false &&
          configSearchAfterClear.itemCount >= 10 &&
          pluginListItems.length >= 10 &&
          pluginListItems.some(
            (item) =>
              item.id === "openosrs" &&
              item.enabled === "false" &&
              item.pinned === "false" &&
              item.pluginBacked === "false" &&
              item.toggleButtonPresent === false &&
              item.hiddenTogglePresent === true &&
              item.toggleSource.includes("plugin == null")
          ) &&
          pluginListItems.some((item) => item.id === "runelite" && item.enabled === "false" && item.pinned === "false" && item.pluginBacked === "false") &&
          pluginListItems.some(
            (item) =>
              item.id === "chat-color" &&
              item.enabled === "false" &&
              item.pinned === "false" &&
              item.pluginBacked === "false" &&
              item.toggleButtonPresent === false &&
              item.hiddenTogglePresent === true
          ) &&
          pluginListItems.some(
            (item) =>
              item.id === "gpu" &&
              item.pluginBacked === "true" &&
              item.toggleButtonPresent === true &&
              item.hiddenTogglePresent === false &&
              item.toggleSource.includes("startPlugin/stopPlugin")
          ) &&
          pluginListItems.some((item) => item.id === "gpu" && item.enabled === "false") &&
          pluginListItems.some((item) => item.id === "anti-drag" && item.enabled === "false") &&
          pluginListItems.some(
            (item) =>
              item.id === "hide-under" &&
              item.enabled === "false" &&
              item.pluginBacked === "true" &&
              item.toggleButtonPresent === true &&
              item.hiddenTogglePresent === false
          ) &&
          pluginListItems.some(
            (item) =>
              item.id === "pray-against-player" &&
              item.enabled === "false" &&
              item.pluginBacked === "true" &&
              item.toggleButtonPresent === true &&
              item.hiddenTogglePresent === false &&
              item.sourceCategoryColor ===
                "ConfigPanel getColorByCategory(OpenOSRSConfig, pluginType) -> PluginListItem.setColor(nameLabel foreground)"
          ) &&
          pluginListItems.some((item) => item.id === "freeze-timers" && item.enabled === "false") &&
          pluginListItems.some((item) => item.id === "spec-bar" && item.enabled === "false") &&
          !pluginListItems.some((item) => item.id === "attack-styles") &&
          pluginListItems.some((item) => item.id === "status-bars" && item.enabled === "false") &&
          pluginListItems.some((item) => item.id === "stretched-mode" && item.enabled === "false") &&
          pluginListItems.some((item) => item.id === "boosts-information" && item.enabled === "false") &&
          pluginListItems.some((item) => item.id === "opponent-info" && item.enabled === "false") &&
          pluginListItems.some((item) => item.id === "player-indicators" && item.enabled === "false") &&
          pluginListItems.some((item) => item.id === "pvp-performance-tracker" && item.enabled === "true") &&
          pluginListItems.some(
            (item) =>
              item.id === "freeze-timers" &&
              item.sourceCategoryColor ===
                "ConfigPanel getColorByCategory(OpenOSRSConfig, pluginType) -> PluginListItem.setColor(nameLabel foreground)" &&
              item.nameColor === "rgb(255, 105, 97)"
          ) &&
          pluginListItems.some((item) => item.id === "gpu" && item.nameColor === "rgb(144, 212, 237)") &&
          panelIcons.every((icon) => icon.complete && icon.naturalWidth > 0 && icon.naturalHeight > 0) &&
          panelIcons.some((icon) => icon.src === "runelite-ui/switcher_on.png" && icon.width === 25 && icon.height === 15) &&
          panelIcons.some((icon) => icon.src === "runelite-ui/star_on.png" && icon.width === 18 && icon.height === 18) &&
          Boolean(openOsrsConfigDetail) &&
          openOsrsDetailToggle.buttonPresent === false &&
          openOsrsDetailToggle.hiddenPresent === true &&
          openOsrsDetailToggle.sourceToggle.includes("plugin == null") &&
          openOsrsVisibilitySource === "ConfigPanel.openGroupConfigPanel ConfigItem.hidden/unhide/hide/unhideValue/hideValue conditional continue" &&
          openOsrsInitialEntries.includes("hidePlugins") &&
          openOsrsInitialEntries.includes("hideExternalPlugins") &&
          openOsrsInitialEntries.includes("hidePvmPlugins") &&
          openOsrsInitialEntries.includes("hideSkillingPlugins") &&
          openOsrsInitialEntries.includes("hidePvpPlugins") &&
          openOsrsInitialEntries.includes("hideUtilityPlugins") &&
          openOsrsInitialEntries.includes("externalColor") &&
          openOsrsInitialEntries.includes("pvpColor") &&
          openOsrsInitialEntries.includes("utilityColor") &&
          openOsrsAfterHidePluginsEntries.includes("hidePlugins") &&
          !openOsrsAfterHidePluginsEntries.includes("hideExternalPlugins") &&
          !openOsrsAfterHidePluginsEntries.includes("hidePvmPlugins") &&
          !openOsrsAfterHidePluginsEntries.includes("hideSkillingPlugins") &&
          !openOsrsAfterHidePluginsEntries.includes("hidePvpPlugins") &&
          !openOsrsAfterHidePluginsEntries.includes("hideUtilityPlugins") &&
          Boolean(chatColorConfigDetail) &&
          chatColorConfigDetailState.configGroup === "textrecolor" &&
          chatColorConfigDetailState.title === "Chat Color" &&
          chatColorConfigDetailState.titleColor === "rgb(255, 255, 255)" &&
          chatColorConfigDetailState.sourceTitleColor.includes("title.setForeground") &&
          chatColorConfigDetailState.toggleButtonPresent === false &&
          chatColorConfigDetailState.hiddenTogglePresent === true &&
          chatColorConfigDetailState.toggleSource.includes("plugin == null") &&
          chatColorConfigEntries.length === 54 &&
          chatColorConfigEntries.every((entry) => entry.sourceComponent === "RuneliteColorPicker") &&
          chatColorConfigEntries.every((entry) => entry.sourceColorPicker.includes("Color.class existing null")) &&
          chatColorConfigEntries.some((entry) => entry.key === "opaquePublicChat" && entry.colorText === "Pick a color") &&
          chatColorConfigEntries.some((entry) => entry.key === "opaquePublicChatHighlight" && entry.colorText === "#000000") &&
          chatColorConfigEntries.some((entry) => entry.key === "opaqueClanChatInfoHighlight" && entry.colorText === "#FF0000") &&
          chatColorConfigEntries.some((entry) => entry.key === "transparentPublicChatHighlight" && entry.colorText === "#FFFFFF") &&
          chatColorConfigEntries.some((entry) => entry.key === "transparentGameMessageHighlight" && entry.colorText === "#EF1020") &&
          Boolean(gpuConfigDetail) &&
          gpuConfigDetail?.getAttribute("data-config-group") === "gpu" &&
          gpuConfigTitle === "GPU" &&
          gpuConfigTitleColor === "rgb(144, 212, 237)" &&
          gpuConfigSourceTitleColor.includes("title.setForeground") === true &&
          Math.round(gpuConfigBackButtonRect?.width ?? 0) === 22 &&
          gpuConfigEntries.some((entry) => entry.key === "drawDistance" && entry.sourceComponent === "JSlider" && entry.sliderWidth === 80 && entry.sliderRowWidth === 110) &&
          gpuConfigEntries.some((entry) => entry.key === "smoothBanding" && entry.sourceComponent === "JCheckBox") &&
          gpuConfigEntries.some((entry) => entry.key === "antiAliasingMode" && entry.sourceComponent === "JComboBox" && entry.selectValue === "Disabled") &&
          gpuConfigEntries.some((entry) => entry.key === "fogDepth" && entry.sourceComponent === "JSlider") &&
          gpuRuntimeDataset?.enabled === "true" &&
          gpuRuntimeDataset?.drawDistance === "25" &&
          gpuRuntimeDataset?.drawDistanceLocalUnits === "3200" &&
          gpuRuntimeDataset?.fogDepth === "30" &&
          gpuRuntimeDataset?.fogCircularity === "30" &&
          gpuRuntimeDataset?.fogDensity === "10" &&
          gpuRuntimeDataset?.sourceDrawDistance === "GpuPlugin.drawScene scene.setDrawDistance(drawDistance)" &&
          gpuRuntimeDataset?.sourceFogUniforms === "GpuPlugin.draw glUniform fogDepth/fogCornerRadius/fogDensity" &&
          Boolean(antiDragConfigDetail) &&
          antiDragConfigDetail?.getAttribute("data-config-group") === "antiDrag" &&
          antiDragConfigTitle === "Anti Drag" &&
          antiDragConfigEntries.some((entry) => entry.key === "alwaysOn" && entry.sourceComponent === "JCheckBox") &&
          antiDragConfigEntries.some((entry) => entry.key === "dragDelay" && entry.sourceComponent === "JSlider" && entry.sliderWidth === 80 && entry.sliderRowWidth === 110 && entry.sliderValue === "30") &&
          antiDragRuntimeDataset?.enabled === "true" &&
          antiDragRuntimeDataset?.alwaysOn === "true" &&
          antiDragRuntimeDataset?.delayClientTicks === "30" &&
          antiDragRuntimeDataset?.effectiveDelayClientTicks === "30" &&
          antiDragRuntimeDataset?.effectiveDelayMs === "600" &&
          antiDragRuntimeDataset?.sourceDefaultDelay === "AntiDragPlugin.DEFAULT_DELAY = 5" &&
          antiDragRuntimeDataset?.sourceActiveDelay === "AntiDragPlugin client.setInventoryDragDelay(config.dragDelay())" &&
          antiDragRuntimeDataset?.sourceTickLength === "Constants.CLIENT_TICK_LENGTH = 20" &&
          antiDragInventorySlotDataset?.delayClientTicks === "30" &&
          antiDragInventorySlotDataset?.source === "Client.setInventoryDragDelay / AntiDragPlugin.DEFAULT_DELAY" &&
          Boolean(freezeTimersConfigDetail) &&
          freezeTimersConfigDetail?.getAttribute("data-config-group") === "freezetimers" &&
          freezeTimersConfigTitle === "Freeze Timers" &&
          freezeTimersConfigEntries.some((entry) => entry.key === "showOverlay" && entry.sourceComponent === "JCheckBox" && entry.checked === true) &&
          freezeTimersConfigEntries.some((entry) => entry.key === "FreezeTimers" && entry.sourceComponent === "JCheckBox" && entry.checked === true) &&
          freezeTimersConfigEntries.some((entry) => entry.key === "xoffset" && entry.sourceComponent === "JSlider" && entry.sliderWidth === 80 && entry.sliderRowWidth === 110 && entry.sliderValue === "20") &&
          freezeTimersConfigEntries.some((entry) => entry.key === "fontStyle" && entry.sourceComponent === "JComboBox" && entry.selectValue === "Bold") &&
          freezeTimersConfigEntries.some((entry) => entry.key === "textSize" && entry.sourceComponent === "JSlider" && entry.sliderValue === "11") &&
          freezeTimersRuntimeDataset?.enabled === "true" &&
          freezeTimersRuntimeDataset?.showPlayers === "true" &&
          freezeTimersRuntimeDataset?.freezeTimers === "true" &&
          freezeTimersRuntimeDataset?.xOffset === "20" &&
          freezeTimersRuntimeDataset?.noImage === "false" &&
          freezeTimersRuntimeDataset?.fontStyle === "Bold" &&
          freezeTimersRuntimeDataset?.textSize === "11" &&
          freezeTimersRuntimeDataset?.sourcePlugin === "FreezeTimersPlugin.onSpotAnimationChanged PlayerSpellEffect.getFromSpotAnim" &&
          freezeTimersRuntimeDataset?.sourceOverlay === "FreezeTimersOverlay setPriority(HIGHEST) setPosition(DYNAMIC) setLayer(UNDER_WIDGETS)" &&
          freezeTimersRuntimeDataset?.sourceBarrage === "PlayerSpellEffect.BARRAGE spotAnim=369 lengthMs=19200" &&
          freezeTimersRuntimeDataset?.sourceImmunity === "TimerType.FREEZE immunityMs=3000" &&
          specBarRuntimeDataset?.enabled === "true" &&
          specBarRuntimeDataset?.drawSpecbarAnyway === "true" &&
          specBarRuntimeDataset?.sourcePlugin === "SpecBarPlugin.onScriptCallbackEvent" &&
          specBarRuntimeDataset?.sourceCallback === "drawSpecbarAnyway" &&
          specBarRuntimeDataset?.sourceStackMutation === "client.getIntStack()[client.getIntStackSize() - 1] = 1" &&
          !attackStylesConfigDetail &&
          attackStylesConfigTitle !== "Attack Styles" &&
          attackStylesConfigEntries.length === 0 &&
          attackStylesRuntimeDataset?.enabled === "false" &&
          attackStylesRuntimeDataset?.sourcePlugin === "AttackStylesPlugin startUp overlayManager.add(overlay)" &&
          attackStylesRuntimeDataset?.sourceOverlay === "AttackStylesOverlay setPosition(ABOVE_CHATBOX_RIGHT)" &&
          attackStylesRuntimeDataset?.sourceVars === "VarPlayer.ATTACK_STYLE Varbits.EQUIPPED_WEAPON_TYPE Varbits.DEFENSIVE_CASTING_MODE" &&
          attackStylesRuntimeDataset?.sourceWeaponType === "WeaponType.getWeaponType(equippedWeaponType).getAttackStyles()" &&
          attackStylesOverlayDataset === null &&
          Boolean(statusBarsConfigDetail) &&
          statusBarsConfigDetail?.getAttribute("data-config-group") === "statusbars" &&
          statusBarsConfigTitle === "Status Bars" &&
          statusBarsConfigEntries.some((entry) => entry.key === "enableCounter" && entry.sourceComponent === "JCheckBox" && entry.checked === false) &&
          statusBarsConfigEntries.some((entry) => entry.key === "enableSkillIcon" && entry.sourceComponent === "JCheckBox" && entry.checked === true) &&
          statusBarsConfigEntries.some((entry) => entry.key === "leftBarMode" && entry.sourceComponent === "JComboBox" && entry.selectValue === "Hitpoints") &&
          statusBarsConfigEntries.some((entry) => entry.key === "rightBarMode" && entry.sourceComponent === "JComboBox" && entry.selectValue === "Prayer") &&
          statusBarsConfigEntries.some((entry) => entry.key === "hideStatusBarDelay" && entry.sourceComponent === "JSlider" && entry.sliderValue === "3") &&
          statusBarsRuntimeDataset?.enabled === "true" &&
          statusBarsRuntimeDataset?.enableCounter === "false" &&
          statusBarsRuntimeDataset?.enableSkillIcon === "true" &&
          statusBarsRuntimeDataset?.enableRestorationBars === "true" &&
          statusBarsRuntimeDataset?.leftBarMode === "Hitpoints" &&
          statusBarsRuntimeDataset?.rightBarMode === "Prayer" &&
          statusBarsRuntimeDataset?.sourceOverlay === "StatusBarsOverlay setPosition(DYNAMIC) setLayer(ABOVE_WIDGETS)" &&
          statusBarsRuntimeDataset?.sourceViewport === "Viewport.FIXED WidgetInfo.FIXED_VIEWPORT_INTERFACE_CONTAINER" &&
          statusBarsRuntimeDataset?.sourceBarRenderer === "BarRenderer BAR_WIDTH=20 HEIGHT=252 COLOR_BAR_BG" &&
          statusBarsOverlayDataset?.mode === "Hitpoints" &&
          statusBarsOverlayDataset?.renderer === "HitPointsRenderer" &&
          statusBarsOverlayDataset?.viewport === "Viewport.FIXED WidgetInfo.FIXED_VIEWPORT_INTERFACE_CONTAINER" &&
          statusBarsOverlayDataset?.sourceX === "527" &&
          statusBarsOverlayDataset?.sourceY === "209" &&
          Number(statusBarsOverlayDataset?.filledHeight ?? 0) > 0 &&
          Number(statusBarsOverlayDataset?.filledHeight ?? 0) <= 252 &&
          statusBarsOverlayDataset?.iconComplete === true &&
          statusBarsOverlayDataset?.iconNaturalWidth === 16 &&
          statusBarsOverlayDataset?.iconNaturalHeight === 16 &&
          statusBarsOverlayDataset?.width === 20 &&
          statusBarsOverlayDataset?.height === 252 &&
          statusBarsOverlayDataset?.rightWidth === 20 &&
          statusBarsOverlayDataset?.rightHeight === 252 &&
          Boolean(opponentInfoConfigDetail) &&
          opponentInfoConfigDetail?.getAttribute("data-config-group") === "opponentinfo" &&
          opponentInfoConfigTitle === "Opponent Information" &&
          opponentInfoConfigEntries.some((entry) => entry.key === "lookupOnInteraction" && entry.sourceComponent === "JCheckBox" && entry.checked === false) &&
          opponentInfoConfigEntries.some((entry) => entry.key === "hitpointsDisplayStyle" && entry.sourceComponent === "JComboBox" && entry.selectValue === "Hitpoints") &&
          opponentInfoConfigEntries.some((entry) => entry.key === "showOpponentsOpponent" && entry.sourceComponent === "JCheckBox" && entry.checked === true) &&
          opponentInfoConfigEntries.some((entry) => entry.key === "attackingColor" && entry.sourceComponent === "RuneliteColorPicker" && entry.colorText === "#00FF00") &&
          opponentInfoRuntimeDataset?.enabled === "true" &&
          opponentInfoRuntimeDataset?.lookupOnInteraction === "false" &&
          opponentInfoRuntimeDataset?.hitpointsDisplayStyle === "Hitpoints" &&
          opponentInfoRuntimeDataset?.showOpponentsOpponent === "true" &&
          opponentInfoRuntimeDataset?.attackingColor === "#00ff00" &&
          opponentInfoRuntimeDataset?.sourcePlugin === "OpponentInfoPlugin InteractingChanged lastOpponent WAIT=5s overlayManager.add" &&
          opponentInfoRuntimeDataset?.sourceOverlay === "OpponentInfoOverlay setPosition(TOP_LEFT) setPriority(HIGH)" &&
          opponentInfoRuntimeDataset?.sourcePanel === "PanelComponent border=(2,2,2,2) gap=(0,2)" &&
          opponentInfoRuntimeDataset?.sourceProgress === "ProgressBarComponent HP_GREEN HP_RED LabelDisplayMode" &&
          Boolean(playerIndicatorsConfigDetail) &&
          playerIndicatorsConfigDetail?.getAttribute("data-config-group") === "playerindicators" &&
          playerIndicatorsConfigTitle === "Player Indicators" &&
          playerIndicatorsSectionsBeforeToggle.some(
            (section) =>
              section.key === "targetSection" &&
              section.expanded === "false" &&
              section.iconSource === "SECTION_EXPAND_ICON" &&
              section.contentsHidden === true &&
              section.contentsVisibleSource === "false" &&
              section.toggleSource ===
                "ConfigPanel.toggleSection setVisible(newState) SECTION_RETRACT_ICON/SECTION_EXPAND_ICON configManager.setConfiguration(group, sectionKey, newState)"
          ) &&
          playerIndicatorsSectionsAfterToggle.some(
            (section) =>
              section.key === "targetSection" &&
              section.expanded === "true" &&
              section.iconSource === "SECTION_RETRACT_ICON" &&
              section.contentsHidden === false &&
              section.contentsVisibleSource === "true"
          ) &&
          playerIndicatorsConfigEntries.some((entry) => entry.key === "drawOwnName" && entry.sourceComponent === "JCheckBox" && entry.checked === false) &&
          playerIndicatorsConfigEntries.some((entry) => entry.key === "ownNameColor" && entry.sourceComponent === "RuneliteColorPicker" && entry.colorText === "#00B8D4") &&
          playerIndicatorsConfigEntries.some((entry) => entry.key === "drawTargetsNames" && entry.sourceComponent === "JCheckBox" && entry.checked === false) &&
          playerIndicatorsConfigEntries.some((entry) => entry.key === "targetColor" && entry.sourceComponent === "RuneliteColorPicker" && entry.colorText === "#136EF7") &&
          playerIndicatorsConfigEntries.some((entry) => entry.key === "showCombat" && entry.sourceComponent === "JCheckBox" && entry.checked === false) &&
          playerIndicatorsRuntimeDataset?.enabled === "true" &&
          playerIndicatorsRuntimeDataset?.highlightTargets === "true" &&
          playerIndicatorsRuntimeDataset?.targetColor === "#136ef7" &&
          playerIndicatorsRuntimeDataset?.showCombatLevel === "true" &&
          playerIndicatorsRuntimeDataset?.sourcePlugin === "PlayerIndicatorsPlugin startUp overlayManager.add(playerIndicatorsOverlay/minimapOverlay)" &&
          playerIndicatorsRuntimeDataset?.sourceOverlay === "PlayerIndicatorsOverlay setPosition(DYNAMIC) setPriority(MED)" &&
          playerIndicatorsRuntimeDataset?.sourceMinimapOverlay === "PlayerIndicatorsMinimapOverlay setLayer(ABOVE_WIDGETS) setPosition(DYNAMIC) setPriority(HIGH)" &&
          playerIndicatorsRuntimeDataset?.sourceService === "PlayerIndicatorsService forEachPlayer relation order self/friend/clan/team/target/other" &&
          playerIndicatorsRuntimeDataset?.sourceLocations === "ABOVE_HEAD,MINIMAP,MENU,TILE" &&
          playerIndicatorsOverlayDataset?.actorId === "opponent" &&
          playerIndicatorsOverlayDataset?.relation === "TARGET" &&
          playerIndicatorsOverlayDataset?.label === "Opponent (126)" &&
          playerIndicatorsOverlayDataset?.sourceOverlay === "PlayerIndicatorsOverlay" &&
          playerIndicatorsOverlayDataset?.sourceLocation === "PlayerIndicationLocation.ABOVE_HEAD" &&
          Number(playerIndicatorsOverlayDataset?.width ?? 0) > 20 &&
          Number(playerIndicatorsOverlayDataset?.height ?? 0) >= 15 &&
          Boolean(boostsConfigDetail) &&
          boostsConfigDetail?.getAttribute("data-config-group") === "boosts" &&
          boostsConfigTitle === "Boosts Information" &&
          boostsConfigEntries.some((entry) => entry.key === "displayBoosts" && entry.sourceComponent === "JComboBox" && entry.selectValue === "BOTH") &&
          boostsConfigEntries.some((entry) => entry.key === "relativeBoost" && entry.sourceComponent === "JCheckBox" && entry.checked === false) &&
          boostsConfigEntries.some((entry) => entry.key === "displayIndicators" && entry.sourceComponent === "JCheckBox" && entry.checked === false) &&
          boostsConfigEntries.some((entry) => entry.key === "displayIconPanel" && entry.sourceComponent === "JCheckBox" && entry.checked === false) &&
          boostsConfigEntries.some((entry) => entry.key === "displayNextBuffChange" && entry.sourceComponent === "JComboBox" && entry.selectValue === "BOOSTED") &&
          boostsConfigEntries.some((entry) => entry.key === "displayNextDebuffChange" && entry.sourceComponent === "JComboBox" && entry.selectValue === "NEVER") &&
          boostsRuntimeDataset?.enabled === "true" &&
          boostsRuntimeDataset?.displayBoosts === "BOTH" &&
          boostsRuntimeDataset?.relativeBoost === "false" &&
          boostsRuntimeDataset?.displayInfoboxes === "false" &&
          boostsRuntimeDataset?.displayIcons === "false" &&
          boostsRuntimeDataset?.displayNextBuffChange === "BOOSTED" &&
          boostsRuntimeDataset?.displayNextDebuffChange === "NEVER" &&
          boostsRuntimeDataset?.sourcePlugin === "BoostsPlugin startUp overlayManager.add(boostsOverlay/combatIconsOverlay)" &&
          boostsRuntimeDataset?.sourceOverlay === "BoostsOverlay setPosition(TOP_LEFT) setPriority(MED)" &&
          boostsRuntimeDataset?.sourceCombatIconsOverlay === "CombatIconsOverlay setPosition(TOP_LEFT) setPriority(MED)" &&
          boostsRuntimeDataset?.sourceSkills === "Skill.ATTACK,Skill.STRENGTH,Skill.DEFENCE,Skill.RANGED,Skill.MAGIC" &&
          boostsOverlayDataset?.mode === "panel" &&
          boostsOverlayDataset?.sourceOverlay === "BoostsOverlay" &&
          boostsOverlayDataset?.sourcePosition === "OverlayPosition.TOP_LEFT" &&
          Number(boostsOverlayDataset?.rowCount ?? 0) >= 1 &&
          Number(boostsOverlayDataset?.rowCount ?? 0) === boostsOverlayDataset?.rows?.length &&
          boostsRowsInSourceOrder &&
          boostsOverlayDataset?.rows?.some(
            (row) =>
              row.skillId === "ranged" &&
              row.sourceSkill === "Skill.RANGED" &&
              row.base === "99" &&
              row.current !== row.base
          ) &&
          Boolean(pvpPanel) &&
          pvpTitle === "PvP Performance Tracker v1.7.1" &&
          pvpStatLabels.includes("Avg KO Chances:") &&
          pvpStatLabels.includes("Avg Ghost Barrages:") &&
          Math.round(pvpFilterRect?.width ?? 0) === 209 &&
          Math.round(pvpScrollerRect?.width ?? 0) === 209 &&
          Boolean(infoPanel) &&
          infoVersionLabels.some((label) => label.includes("RuneLite version:")) &&
          infoVersionLabels.some((label) => label.includes("Client version:")) &&
          infoVersionLabels.some((label) => label.includes("Oldschool revision:")) &&
          infoActions.length === 4 &&
          infoActions.every((action) => action.width === 205 && action.height >= 56) &&
          infoActions.every((action) => action.iconComplete && action.iconNaturalWidth > 0 && action.iconNaturalHeight > 0) &&
          infoActions.every((action) => action.arrowComplete && action.arrowNaturalWidth > 0 && action.arrowNaturalHeight > 0) &&
          infoActions.every((action) => action.arrowWidth === 8 && action.arrowHeight === 13) &&
          infoActions.every(
            (action) =>
              action.sourceLinkPanel === "InfoPanel.buildLinkPanel MouseAdapter mousePressed/mouseReleased/mouseEntered/mouseExited callback" &&
              action.sourceActionTargets ===
                "InfoPanel actionsContainer.add buildLinkPanel(GITHUB/FOLDER/DISCORD/PATREON, LinkBrowser.browse/openLocalFile)"
          ) &&
          infoActions.some((action) => action.id === "license" && action.kind === "url" && action.target?.includes("LICENSE")) &&
          infoActions.some((action) => action.id === "logs" && action.kind === "local-file" && action.target === "RuneLite.LOGS_DIR") &&
          infoActions.some(
            (action) =>
              action.id === "patreon" &&
              action.kind === "url" &&
              action.target === "RuneLiteProperties.getPatreonLink()" &&
              action.resolvedTarget === "about:blank"
          ) &&
          infoActionDispatch.id === "license" &&
          infoActionDispatch.kind === "url" &&
          infoActionDispatch.target.includes("LICENSE") &&
          infoActionDispatch.openedUrls.some(
            (opened) => opened.url.includes("LICENSE") && opened.target === "_blank" && opened.features === "noopener,noreferrer"
          ) &&
          Math.round(toolbarRect?.width ?? 0) === 36 &&
          Math.round(toolbarRect?.height ?? 0) === 503 &&
          navContainer?.getAttribute("data-open") === "true",
        buttonCount: buttons.length,
        defaultStretchedMode: {
          enabled: initialStretchedModeEnabled,
          pluginEnabled: initialStretchedModeListEnabled,
          sourcePlugin: initialStretchedModeSourcePlugin,
          sourceDimensions: initialStretchedModeSourceDimensions,
          sourceMouse: initialStretchedModeSourceMouse,
          canvasImageRendering: initialRuntimeCanvasImageRendering,
          hudSpriteImageRendering: initialNhHudSpriteImageRendering
        },
        disabledPlugins: {
          attackStylesPresent: Boolean(initialAttackStylesListItem),
          source: initialDisabledPluginSource
        },
        toolbarWidth: Math.round(toolbarRect?.width ?? 0),
        toolbarHeight: Math.round(toolbarRect?.height ?? 0),
        toolbarBackground,
        toolbarSourceSort,
        toolbarSourceDelimiter,
        sidebarToggle: {
          width: Math.round(sidebarToggleRect?.width ?? 0),
          height: Math.round(sidebarToggleRect?.height ?? 0),
          hotZoneWidth: Math.round(sidebarHotZoneRect?.width ?? 0),
          hotZoneHeight: Math.round(sidebarHotZoneRect?.height ?? 0),
          imageSrc: sidebarToggleImage?.getAttribute("src") ?? "",
          imageNaturalWidth: sidebarToggleImage?.naturalWidth ?? 0,
          imageNaturalHeight: sidebarToggleImage?.naturalHeight ?? 0,
          openTransform: computedSidebarToggleImage?.transform ?? "",
          sourceOverlay: sidebarToggle?.getAttribute("data-source-overlay") ?? "",
          sourceClick: sidebarToggle?.getAttribute("data-source-click") ?? "",
          sourceHotkey: sidebarHotkeySource,
          sourceStateModel: sidebarStateModelSource,
          sourceSelection: sidebarSelectionSource,
          sourceRange: sidebarHotZone?.getAttribute("data-source-range") ?? "",
          closedSidebarState,
          closedToolbarPresent,
          closedNavOpen,
          closedToggleSidebarOpen,
          closedTransform: closedToggleImageTransform,
          reopenedSidebarState,
          reopenedToolbarPresent: Boolean(reopenedToolbar),
          reopenedNavOpen: reopenedNavContainer?.getAttribute("data-open"),
          reopenedInfoPressed: reopenedInfoButton?.getAttribute("aria-pressed"),
          hotkeyClosedSidebarState,
          hotkeyClosedToolbarPresent,
          hotkeyClosedNavOpen,
          hotkeyReopenedSidebarState,
          hotkeyReopenedToolbarPresent: Boolean(hotkeyReopenedToolbar),
          hotkeyReopenedNavOpen,
          hotkeyReopenedInfoPressed: hotkeyReopenedInfoButton?.getAttribute("aria-pressed")
        },
        buttonSources,
        activeButtonBackground,
        navOpen: navContainer?.getAttribute("data-open"),
        icons,
        configSearch: {
          width: Math.round(configSearchRect?.width ?? 0),
          height: Math.round(configSearchRect?.height ?? 0),
          sourcePinned: configPanelSourcePinned,
          initial: configSearchInitial,
          afterType: configSearchAfterType,
          afterClear: configSearchAfterClear
        },
        pluginListItems,
        panelIcons,
        openOsrsConfigDetail: {
          toggle: openOsrsDetailToggle,
          visibilitySource: openOsrsVisibilitySource,
          initialEntries: openOsrsInitialEntries,
          afterHidePluginsEntries: openOsrsAfterHidePluginsEntries
        },
        chatColorConfigDetail: chatColorConfigDetailState,
        gpuConfigDetail: {
          title: gpuConfigTitle,
          titleColor: gpuConfigTitleColor,
          sourceTitleColor: gpuConfigSourceTitleColor,
          backButtonWidth: Math.round(gpuConfigBackButtonRect?.width ?? 0),
          entries: gpuConfigEntries,
          runtimeDataset: gpuRuntimeDataset
        },
        antiDragConfigDetail: {
          title: antiDragConfigTitle,
          entries: antiDragConfigEntries,
          runtimeDataset: antiDragRuntimeDataset,
          inventorySlotDataset: antiDragInventorySlotDataset
        },
        freezeTimersConfigDetail: {
          title: freezeTimersConfigTitle,
          entries: freezeTimersConfigEntries,
          runtimeDataset: freezeTimersRuntimeDataset
        },
        specBarRuntimeDataset,
        attackStylesConfigDetail: {
          title: attackStylesConfigTitle,
          entries: attackStylesConfigEntries,
          runtimeDataset: attackStylesRuntimeDataset,
          overlayDataset: attackStylesOverlayDataset
        },
        statusBarsConfigDetail: {
          title: statusBarsConfigTitle,
          entries: statusBarsConfigEntries,
          runtimeDataset: statusBarsRuntimeDataset,
          overlayDataset: statusBarsOverlayDataset
        },
        opponentInfoConfigDetail: {
          title: opponentInfoConfigTitle,
          entries: opponentInfoConfigEntries,
          runtimeDataset: opponentInfoRuntimeDataset
        },
        playerIndicatorsConfigDetail: {
          title: playerIndicatorsConfigTitle,
          entries: playerIndicatorsConfigEntries,
          sectionsBeforeToggle: playerIndicatorsSectionsBeforeToggle,
          sectionsAfterToggle: playerIndicatorsSectionsAfterToggle,
          runtimeDataset: playerIndicatorsRuntimeDataset,
          overlayDataset: playerIndicatorsOverlayDataset
        },
        boostsConfigDetail: {
          title: boostsConfigTitle,
          entries: boostsConfigEntries,
          runtimeDataset: boostsRuntimeDataset,
          overlayDataset: boostsOverlayDataset
        },
        pvpPanel: {
          title: pvpTitle,
          statLabels: pvpStatLabels,
          filterWidth: Math.round(pvpFilterRect?.width ?? 0),
          scrollerWidth: Math.round(pvpScrollerRect?.width ?? 0)
        },
        infoPanel: {
          versionLabels: infoVersionLabels,
          actions: infoActions,
          dispatch: infoActionDispatch
        },
        screenshotClip: {
          x: Math.max(0, Math.floor(shellRect.left)),
          y: Math.max(0, Math.floor(shellRect.top)),
          width: Math.ceil(shellRect.width),
          height: Math.ceil(shellRect.height)
        }
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
      partition: `runelite-shell-render-${Date.now()}`
    }
  });

  try {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    await waitForShell(window);
    const shellState = await readShellState(window);

    if (!shellState.ok) {
      throw new Error(`RuneLite shell render mismatch: ${JSON.stringify(shellState, null, 2)}`);
    }

    const screenshot = await window.capturePage(shellState.screenshotClip);
    await fs.writeFile(screenshotPath, screenshot.toPNG());

    console.log(JSON.stringify({ ...shellState, screenshotPath }, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
