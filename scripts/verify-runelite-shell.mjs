import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const shellSource = readText("src/ui/RuneliteClientShell.tsx");
const runtimeSource = readText("src/ui/RuntimeSceneViewer.tsx");
const hudSource = readText("src/ui/NhClientHud.tsx");
const gpuSource = readText("src/ui/runeliteGpu.ts");
const entityHiderSource = readText("src/ui/runeliteEntityHider.ts");
const tileIndicatorsSource = readText("src/ui/runeliteTileIndicators.ts");
const cssSource = readText("src/ui/styles.css");
const packageSource = readText("package.json");
const failures = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

check(runtimeSource.includes("RuneliteClientShell"), "RuntimeSceneViewer must render through RuneliteClientShell.");
check(!runtimeSource.includes("RunelitePluginLayer"), "Fake RuneLite plugin overlay must not be rendered.");
check(!runtimeSource.includes("../render/runeliteClient"), "Fake runeliteClient render model must not be imported.");
check(!cssSource.includes(".runelitePluginLayer"), "Fake RuneLite plugin layer CSS must be removed.");
check(!cssSource.includes(".runelitePluginChip"), "Fake RuneLite plugin chip CSS must be removed.");
check(!packageSource.includes("verify-runelite-client"), "Old fake RuneLite client verifier must not be referenced.");

for (const sourceAnchor of [
  "ClientUI.container BoxLayout.X_AXIS",
  "ClientPanel Constants.GAME_FIXED_SIZE",
  "ClientUI.navContainer CardLayout",
  "ClientUI.contract navContainer preferred/min/max width 0",
  "ClientUI.expand navContainer preferred/min/max width panel.getWrappedPanel().getPreferredSize().width",
  "cardLayout.show(navContainer, button.getTooltip())",
  "ClientPluginToolbar",
  "ClientPluginToolbar TreeMap compareTrueFirst(tab) priority tooltip",
  "ClientPluginToolbar update Box.createVerticalGlue addSeparator before first non-tab",
  "NavigationButton icon tab tooltip selected onClick onSelect panel priority popup",
  "NavigationButton @EqualsAndHashCode(of = {\"tooltip\"})",
  "ClientUI.paintOverlays sidebarOpen ? sidebarClosedIcon : sidebarOpenIcon",
  "MouseListener sidebarButtonPosition.contains -> toggleSidebar",
  "sidebarButtonRange x - 15 width image.getWidth() + 25 full height",
  "ImageUtil.flipImage(sidebarOpenIcon, true, false)",
  "toggleSidebar removes/adds pluginToolbar and preserves currentNavButton",
  "HotkeyListener new Keybind(KeyEvent.VK_F11, InputEvent.CTRL_DOWN_MASK) -> toggleSidebar",
  "ClientUI sidebarOpen currentNavButton pluginPanel",
  "ClientUI currentButton currentNavButton setSelected(sidebarOpen)",
  "runeliteSidebarReducer",
  "RUNELITE_INITIAL_SIDEBAR_STATE",
  "ConfigPanel extends PluginPanel",
  "ConfigPanel.openConfigList",
  "ConfigPanel.openGroupConfigPanel",
  "ConfigPanel.definedOrder IMPORTANT, EXTERNAL, PVM, SKILLING, PVP, UTILITY, GENERAL_USE",
  "ConfigPanel.sortPluginList clientShellConfig.pluginSortMode CATEGORY ? categoryComparator.thenComparing(name) : Comparator.comparing(name)",
  "ConfigPanel.getHiddenByCategory IMPORTANT/GENERAL_USE never hidden, hidePlugins then type-specific hide flags",
  "ConfigPanel.openGroupConfigPanel ConfigItem.hidden/unhide/hide/unhideValue/hideValue conditional continue",
  "ConfigPanel.openGroupConfigPanel title.setForeground(listItem.getColor()) where PluginListItem.getColor returns category color or Color.WHITE",
  "ConfigPanel.toggleSection setVisible(newState) SECTION_RETRACT_ICON/SECTION_EXPAND_ICON configManager.setConfiguration(group, sectionKey, newState)",
  "ConfigPanel getColorByCategory(client shell config, pluginType) -> PluginListItem.setColor(nameLabel foreground)",
  "ConfigPanel getPinnedPluginNames runelite/pinnedPlugins CSV; savePinnedPlugins joins PluginListItem names via configManager.setConfiguration",
  "ConfigManager properties use group.key strings through getConfiguration/setConfiguration/unsetConfiguration",
  "PluginManager.setPluginEnabled stores runelite.<plugin class simple name lower-case>",
  "ConfigPanel.initializePluginList adds CHAT_COLOR_PLUGIN with ChatColorConfig @ConfigGroup(\\\"textrecolor\\\") PluginType.GENERAL_USE tags colour/messages",
  "ConfigPanel Color.class existing null -> Color.BLACK JButton(\\\"Pick a color\\\"); existing -> ColorUtil.toHexColor(existing).toUpperCase(); RuneliteColorPicker on close changeConfiguration",
  "PluginListItem",
  "PluginListItem.attachToggleButtonListener plugin == null -> button.setVisible(false); startPlugin/stopPlugin then updateToggleButton",
  "PluginListItem.matchesSearchTerms keyword contains || JaroWinklerDistance.apply(keyword, term) > 0.9",
  "PluginListItem.OFF_SWITCHER ImageUtil.flipImage(ImageUtil.grayscaleOffset(ImageUtil.grayscaleImage(onSwitcher), 0.61f), true, false)",
  "PluginListItem.OFF_STAR ImageUtil.grayscaleOffset(ImageUtil.grayscaleImage(onStar), 0.77f)",
  "PluginListItem ON_SWITCHER/ON_STAR ImageUtil.recolorImage(..., ColorScheme.BRAND_RED)",
  "PvpPerformanceTrackerPanel extends PluginPanel",
  "FightPerformancePanel",
  "PvpPerformanceTrackerOverlay",
  "PvpPerformanceTrackerPlugin adds nav button when showFightHistoryPanel && (!restrictToLms || isAtLMS())",
  "PvpPerformanceTrackerOverlay render returns null when !showFightOverlay || fight == null || !fightStarted || restrictToLms outside LMS",
  "PvpPerformanceTrackerOverlay.setLines rebuilds title, names, and statistic lines from config toggles",
  "OverlayPosition.BOTTOM_RIGHT",
  "OverlayPriority.LOW",
  "PanelComponent",
  "TitleComponent",
  "LineComponent",
  "TableComponent.TableRowStyle.PERCENTAGE_BASED",
  "PanelFactory.createOverlayStatsLine",
  "TotalStatsPanel",
  "InfoPanel extends PluginPanel",
  "RUNELITE_INFO_PANEL_LINK_SOURCE",
  "RUNELITE_INFO_PANEL_ACTION_TARGET_SOURCE",
  "dispatchRuneliteInfoAction",
  "window.dispatchEvent(\n    new CustomEvent(\"runelite-info-action\"",
  "window.open(action.resolvedTarget, \"_blank\", \"noopener,noreferrer\")",
  "ConfigPlugin.java",
  "GpuPlugin.java",
  "GpuPluginConfig.java",
  "AnimationSmoothingPlugin.java",
  "AnimationSmoothingConfig.java",
  "RuneliteAnimationSmoothingConfigSnapshot",
  "AntiDragPlugin.java",
  "AntiDragConfig.java",
  "AntiDragOverlay.java",
  "CustomCursorPlugin.java",
  "CustomCursorConfig.java",
  "RuneliteCustomCursorConfigSnapshot",
  "EntityHiderPlugin.java",
  "EntityHiderConfig.java",
  "HideUnder.java",
  "PrayAgainstPlayerPlugin.java",
  "PrayAgainstPlayerConfig.java",
  "FreezeTimersPlugin.java",
  "FreezeTimersConfig.java",
  "SpecBarPlugin.java",
  "AttackStylesPlugin.java",
  "AttackStylesConfig.java",
  "StatusBarsPlugin.java",
  "StatusBarsConfig.java",
  "StatusOrbsPlugin.java",
  "StatusOrbsConfig.java",
  "OpponentInfoPlugin.java",
  "OpponentInfoConfig.java",
  "PlayerIndicatorsPlugin.java",
  "PlayerIndicatorsConfig.java",
  "TileIndicatorsPlugin.java",
  "TileIndicatorsConfig.java",
  "BoostsPlugin.java",
  "BoostsConfig.java",
  "PrayerPlugin.java",
  "PrayerConfig.java",
  "XpDropPlugin.java",
  "XpDropConfig.java",
  "PvpPerformanceTrackerPlugin.java",
  "PvpPerformanceTrackerConfig.java",
  "RuneliteEntityHiderConfigSnapshot",
  "RuneliteHideUnderConfigSnapshot",
  "RunelitePrayAgainstPlayerConfigSnapshot",
  "RuneliteTileIndicatorsConfigSnapshot",
  "RuneliteStatusOrbsConfigSnapshot",
  "RunelitePvpPerformanceTrackerConfigSnapshot",
  "RuneliteXpDropConfigSnapshot",
  "runelitePvpPerformanceTrackerNavigationButtonVisible",
  "runelitePvpPerformanceTrackerOverlayVisible",
  "runelitePvpPerformanceTrackerOverlayLines",
  "InfoPlugin.java"
]) {
  check(shellSource.includes(sourceAnchor), `RuneliteClientShell is missing source anchor ${sourceAnchor}.`);
}

for (const literal of [
  "RUNELITE_FIXED_CLIENT_WIDTH = 765",
  "RUNELITE_FIXED_CLIENT_HEIGHT = 503",
  "RUNELITE_PLUGIN_TOOLBAR_WIDTH = 36",
  "RUNELITE_PLUGIN_PANEL_WIDTH = 225",
  "RUNELITE_PLUGIN_SCROLLBAR_WIDTH = 17",
  "RUNELITE_PLUGIN_PANEL_OFFSET = 6",
  "RUNELITE_SIDEBAR_BUTTON_WIDTH = 10",
  "RUNELITE_SIDEBAR_BUTTON_HEIGHT = 20",
  "RUNELITE_SIDEBAR_BUTTON_RIGHT_OFFSET = 5",
  "RUNELITE_SIDEBAR_BUTTON_TOP_OFFSET = 5",
  "RUNELITE_SIDEBAR_HOVER_LEFT_EXTENSION = 15",
  "RUNELITE_SIDEBAR_HOVER_RIGHT_EXTENSION = 10",
  "RUNELITE_CONFIG_SEARCH_WIDTH = RUNELITE_PLUGIN_PANEL_WIDTH - 20",
  "RUNELITE_CONFIG_SEARCH_HEIGHT = 30",
  "RUNELITE_CONFIG_LIST_ITEM_HEIGHT = 20",
  "RUNELITE_CONFIG_BACK_BUTTON_WIDTH = 22",
  "RUNELITE_CONFIG_SLIDER_WIDTH = 80",
  "RUNELITE_CONFIG_SLIDER_ROW_WIDTH = 110",
  "RUNELITE_PVP_TRACKER_VERSION = \"1.7.1\"",
  "RUNELITE_INFO_PANEL_PADDING = 10",
  "RUNELITE_INFO_ACTION_ROWS = 5",
  "RUNELITE_INFO_ACTION_GAP = 10",
  "RUNELITE_OVERLAY_STANDARD_WIDTH = 129",
  "RUNELITE_OVERLAY_BACKGROUND_RGBA = \"rgba(70, 61, 50, 0.612)\"",
  "RUNELITE_CLIENT_TICK_MS = 20",
  "RUNELITE_ANTI_DRAG_DEFAULT_DELAY_CLIENT_TICKS = 5",
  "RUNELITE_ANTI_DRAG_ONE_GAME_TICK_DELAY_CLIENT_TICKS = 30"
]) {
  check(shellSource.includes(literal), `RuneliteClientShell is missing RuneLite source constant ${literal}.`);
}

for (const cssLiteral of [
  "flex: 0 0 765px",
  "height: 503px",
  ".runeliteSidebarToggleHotZone",
  "width: 35px",
  ".runeliteSidebarToggleButton",
  "right: 5px",
  "top: 5px",
  "width: 10px",
  "height: 20px",
  "transform: scaleX(-1)",
  "flex: 0 0 36px",
  "flex-basis: 242px",
  "width: 225px",
  "padding: 6px",
  "width: 205px",
  "height: 30px",
  "height: 20px",
  "width: 25px",
  "height: 15px",
  "width: 18px",
  "height: 18px",
  ".runeliteToolbarDelimiter",
  "flex: 1 1 auto",
  "width: 26px",
  "border-top: 1px solid rgb(30, 30, 30)",
  "grid-template-columns: 22px minmax(0, 1fr) 25px",
  "grid-template-columns: 24px 80px",
  "width: 110px",
  "width: 80px",
  "grid-template-columns: 21px minmax(0, 1fr) 50px",
  ".runelitePluginListItemStarOff",
  ".runelitePluginListItemSwitcherOff",
  "brightness(1.77)",
  "brightness(1.61)",
  ".runeliteConfigSectionIcon[data-source-icon=\"SECTION_RETRACT_ICON\"] img",
  ".runeliteConfigSectionIcon[data-source-icon=\"SECTION_EXPAND_ICON\"] img",
  "grid-template-columns: auto minmax(0, 1fr) auto",
  "min-height: 56px",
  "width: 8px",
  "height: 13px",
  "background: rgb(40, 40, 40)",
  "background: rgb(60, 60, 60)",
  "background: rgb(30, 30, 30)",
  "background: rgb(35, 35, 35)",
  "width: 209px",
  "width: 6px",
  "width: 129px",
  "background: rgba(70, 61, 50, 0.612)",
  "right: 5px",
  "bottom: 5px",
  "font: 8px Monospace, monospace",
  "color: rgba(255, 255, 255, 0.2)",
  "runelitePluginToggleButton-hidden",
  "visibility: hidden",
  "pointer-events: none",
  ".runeliteAntiDragOverlay",
  ".runeliteTileIndicatorsOverlay",
  "border-radius: 50%"
]) {
  check(cssSource.includes(cssLiteral), `RuneLite shell CSS is missing ${cssLiteral}.`);
}

for (const trackerLiteral of [
  "RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT",
  "buildRuneliteClientConfigSnapshot",
  "RuneliteClientShellConfigSnapshot",
  "RuneliteFrameConfigSnapshot",
  "ClientUI.updateFrameConfig reads client opacity settings",
  "ClientUI.updateFrameConfig sets frame title, always-on-top, resizable, expandResizeType, containInScreen",
  "runeliteClientFrameConfig",
  "bridge.applyClientShellFrameConfig(clientFrameConfig)",
  "data-runelite-frame-title={clientFrameConfig.title}",
  "runeliteClientShellStyle",
  "effectiveOpacity: clientShellEnableOpacity ? clientShellOpacityPercentage / 100 : 1",
  "defenderProtectionPrayer",
  "protectPrayerForStyle(event.style)",
  "pvpProtectionDamageMultiplier",
  "applyRuneliteGpuPluginConfig",
  "GpuPlugin.drawScene scene.setDrawDistance(drawDistance)",
  "GpuPlugin.draw glUniform fogDepth/fogCornerRadius/fogDensity",
  "RUNELITE_GPU_MAX_DISTANCE = 90",
  "RUNELITE_GPU_MAX_FOG_DEPTH = 100",
  "RUNELITE_GPU_SCENE_SIZE = 104",
  "RUNELITE_GPU_LOCAL_TILE_SIZE = 128",
  "applyRuneliteAnimationSmoothingConfig",
  "AnimationSmoothingPlugin update client.setInterpolatePlayerAnimations/Npc/Object/Widget",
  "SequenceDefinition interpolated path calls Model.interpolateFrames(frame,next,cycle,frameLength)",
  "runeliteAnimationSmoothingRuntimeReapplyEnabled",
  "runtimeAnimationSmoothingFrameSnapshot",
  "modelsRef.current",
  "actorSequenceDefinitionsRef.current",
  "animationSmoothing: {",
  "smoothPlayerAnimations",
  "runeliteClientConfig.animationSmoothing",
  "interpolateFrames: animationSmoothingConfig.enabled && animationSmoothingConfig.smoothPlayerAnimations",
  "applyRuneliteAntiDragConfig",
  "AntiDragPlugin.DEFAULT_DELAY = 5",
  "AntiDragPlugin client.setInventoryDragDelay(config.dragDelay())",
  "AntiDragPlugin toggleListener hotkeyPressed toggleDrag client.setInventoryDragDelay(config.dragDelay())",
  "AntiDragPlugin holdListener hotkeyPressed/hotkeyReleased client.setInventoryDragDelay(config.dragDelay()/DEFAULT_DELAY)",
  "Constants.CLIENT_TICK_LENGTH = 20",
  "runeliteAntiDragKeyboardEventMatchesKeybind",
  "RUNELITE_INITIAL_ANTI_DRAG_HOTKEY_STATE",
  "runeliteAntiDragReqFocus",
  "handleAntiDragFocusLoss",
  "RUNELITE_ANTI_DRAG_OVERLAY_RADIUS = 20",
  "runeliteAntiDragOverlayVisible",
  "runeliteAntiDragOverlayStyle",
  "AntiDragOverlay.RADIUS = 20",
  "client.getMouseCanvasPosition()",
  "OverlayLayer.ALWAYS_ON_TOP",
  "effectiveDragDelayClientTicks",
  "CustomCursorPlugin startUp/updateCursor and ConfigChanged customcursor.cursorStyle",
  "runeliteClientPanelCursorCss",
  "runeliteCustomCursorCssFromStyle(config.customCursor.cursorStyle)",
  "data-custom-cursor-active={String(configSnapshot.customCursor.enabled)}",
  "applyRuneliteEntityHiderConfig",
  "EntityHiderPlugin.java",
  "client.setPlayersHidden(config.hidePlayers())",
  "runeliteEntityHiderFilterRuntimeEvents",
  "applyRuneliteFreezeTimersConfig",
  "FreezeTimersPlugin.onSpotAnimationChanged",
  "FreezeTimersOverlay setPriority(HIGHEST) setPosition(DYNAMIC) setLayer(UNDER_WIDGETS)",
  "PlayerSpellEffect.BARRAGE spotAnim=369 lengthMs=19200",
  "TimerType.FREEZE immunityMs=3000",
  "runeliteFreezeTimerOverlaySnapshotsFromCombatState",
  "actor.getCanvasImageLocation(image, 0) + xOffset; overlaysDrawn * 18",
  "applyRuneliteSpecBarConfig",
  "SpecBarPlugin.onScriptCallbackEvent",
  "drawSpecbarAnyway",
  "client.getIntStack()[client.getIntStackSize() - 1] = 1",
  "applyRuneliteAttackStylesConfig",
  "AttackStylesPlugin startUp overlayManager.add(overlay)",
  "AttackStylesOverlay setPosition(ABOVE_CHATBOX_RIGHT)",
  "VarPlayer.ATTACK_STYLE Varbits.EQUIPPED_WEAPON_TYPE Varbits.DEFENSIVE_CASTING_MODE",
  "runeliteAttackStylesOverlaySnapshot",
  "applyRuneliteStatusBarsConfig",
  "StatusBarsOverlay setPosition(DYNAMIC) setLayer(ABOVE_WIDGETS)",
  "Viewport.FIXED WidgetInfo.FIXED_VIEWPORT_INTERFACE_CONTAINER",
  "BarRenderer BAR_WIDTH=20 HEIGHT=252 COLOR_BAR_BG",
  "runeliteStatusBarSnapshots",
  "applyRuneliteStatusOrbsConfig",
  "StatusOrbsOverlay setPosition(DYNAMIC) setLayer(ABOVE_WIDGETS)",
  "StatusOrbsPlugin onGameTick SPEC_REGEN_TICKS=50 NORMAL_HP_REGEN_TICKS=100",
  "runeliteStatusOrbSnapshots",
  "applyRuneliteOpponentInfoConfig",
  "OpponentInfoOverlay setPosition(TOP_LEFT) setPriority(HIGH)",
  "runeliteOpponentInfoSnapshot",
  "applyRunelitePlayerIndicatorsConfig",
  "PlayerIndicatorsOverlay setPosition(DYNAMIC) setPriority(MED)",
  "runelitePlayerIndicatorSnapshots",
  "applyRuneliteTileIndicatorsConfig",
  "TileIndicatorsPlugin startUp updateConfig overlayManager.add(overlay)",
  "TileIndicatorsOverlay render client.getSelectedSceneTile client.getLocalDestinationLocation client.getLocalPlayer().getWorldLocation",
  "Perspective.getCanvasTilePoly(client, dest)",
  "RUNELITE_TILE_INDICATORS_STROKE_WIDTH = 2",
  "RUNELITE_TILE_INDICATORS_THIN_STROKE_WIDTH = 1",
  "applyRuneliteBoostsConfig",
  "BoostsOverlay setPosition(TOP_LEFT) setPriority(MED)",
  "CombatIconsOverlay setPosition(TOP_LEFT) setPriority(MED)",
  "runeliteBoostsOverlaySnapshot",
  "applyRunelitePrayerConfig",
  "PrayerBarOverlay setPosition(DYNAMIC) setPriority(HIGH) setLayer(ABOVE_SCENE)",
  "PrayerFlickOverlay setPosition(DYNAMIC) setLayer(ABOVE_WIDGETS)",
  "runelitePrayerBarSnapshot",
  "buildRuneliteXpDropDamageDomOverlay",
  "data-source-overlay=\"XpDropOverlay\"",
  "runelitePvpTrackerSnapshotFromCombatState",
  "runelitePvpFightHistoryFromCombatEvents",
  "RunelitePvpFightHistoryEntry",
  "fightHistoryContainer.add(new FightPerformancePanel(fight), 0)",
  "config.fightHistoryRenderLimit()",
  "data-fight-history-render-limit",
  "\"last-ko-chance\"",
  "runeliteLastKoChanceText",
  "onConfigSnapshotChange={setRuneliteClientConfig}",
  "\"OP\"",
  "\"eD\"",
  "\"KO\"",
  "\"GB\""
]) {
  check(
      runtimeSource.includes(trackerLiteral) ||
      shellSource.includes(trackerLiteral) ||
      entityHiderSource.includes(trackerLiteral) ||
      gpuSource.includes(trackerLiteral) ||
      tileIndicatorsSource.includes(trackerLiteral),
    `RuneLite shell wiring is missing ${trackerLiteral}.`
  );
}

for (const configPanelLiteral of [
  "sortRuneliteConfigPluginListItems",
  "runelitePluginSortMode",
  "runelitePluginTypeSortIndex",
  "runeliteConfigPluginHiddenByCategory",
  "runeliteConfigPluginColorByCategory",
  "defaultRunelitePinnedPluginIds",
  "readRunelitePinnedPluginNames",
  "saveRunelitePinnedPluginIds",
  "runeliteChatColorConfigItems",
  "runeliteConfigItemVisible",
  "runeliteConfigVisibilityConditionMatched",
  "unhideWhen: [\"toggleKeyBind\", \"holdKeyBind\"]",
  "hideWhen: [\"alwaysOn\", \"holdKeyBind\"]",
  "hideWhen: [\"alwaysOn\", \"toggleKeyBind\"]",
  "RUNELITE_CONFIG_SECTION_TOGGLE_SOURCE",
  "RUNELITE_ICON_TEXT_FIELD_LAYOUT_SOURCE",
  "RUNELITE_ICON_TEXT_FIELD_CLEAR_SOURCE",
  "RUNELITE_ICON_TEXT_FIELD_HOVER_SOURCE",
  "RUNELITE_FLAT_TEXT_FIELD_SOURCE",
  "function RuneliteIconTextField",
  "expandedSectionKeys",
  "runeliteJaroWinklerDistance",
  "runeliteCommonPrefixLength",
  "runelitePluginListItemStarClassName",
  "runelitePluginListItemSwitcherClassName",
  "data-source-search-match={RUNELITE_CONFIG_PLUGIN_SEARCH_SOURCE}",
  "data-source-list-sort={RUNELITE_CONFIG_PLUGIN_SORT_SOURCE}",
  "data-source-list-hidden={RUNELITE_CONFIG_PLUGIN_HIDDEN_SOURCE}",
  "data-source-pinned={RUNELITE_PINNED_PLUGINS_CONFIG_SOURCE}",
  "RUNELITE_PINNED_PLUGINS_STORAGE_KEY = \"runelite.pinnedPlugins\"",
  "RUNELITE_CONFIG_PROPERTIES_STORAGE_KEY = \"runelite.config.properties\"",
  "defaultRuneliteEnabledPluginIds",
  "buildInitialRuneliteConfigValues",
  "saveRunelitePluginEnabledState(item, next.has(pluginId))",
  "saveRuneliteConfigValue(pluginId, keyName, value)",
  "unsetRuneliteConfigDescriptorValues(descriptor)",
  "readRuneliteConfigProperties",
  "setRuneliteConfigProperty",
  "runelitePluginEnabledConfigKey",
  "data-source-config-manager={RUNELITE_CONFIG_MANAGER_SOURCE}",
  "data-source-plugin-enabled-config={RUNELITE_PLUGIN_ENABLED_CONFIG_SOURCE}",
  "data-client-effective-opacity={configSnapshot.clientShell.effectiveOpacity}",
  "window.localStorage.setItem(RUNELITE_PINNED_PLUGINS_STORAGE_KEY, pinnedNames.join(\",\"))",
  "window.localStorage.setItem(RUNELITE_CONFIG_PROPERTIES_STORAGE_KEY, JSON.stringify(sortRuneliteConfigProperties(properties)))",
  "id: \"chat-color\"",
  "name: \"Chat Color\"",
  "description: \"Recolor chat text\"",
  "pluginType: \"general-use\"",
  "tags: [\"colour\", \"messages\"]",
  "group: \"textrecolor\"",
  "items: runeliteChatColorConfigItems",
  "keyName: \"opaquePublicChat\"",
  "keyName: \"opaquePublicChatHighlight\"",
  "keyName: \"opaqueClanChatInfo\"",
  "keyName: \"transparentPublicChat\"",
  "keyName: \"transparentGameMessageHighlight\"",
  "keyName: \"transparentPublicFriendUsernames\"",
  "data-source-color-picker={RUNELITE_CONFIG_COLOR_PICKER_SOURCE}",
  "colorValue ? colorValue.toUpperCase() : \"Pick a color\"",
  "data-source-component=\"IconTextField\"",
  "data-source-icon={`IconTextField.Icon.${icon.toUpperCase()}`}",
  "data-source-visible=\"DocumentListener clearButton.setVisible(!getText().isEmpty())\"",
  "onMouseDown={(event) =>",
  "data-source-entry-visibility={RUNELITE_CONFIG_ENTRY_VISIBILITY_SOURCE}",
  "data-source-title-color={RUNELITE_CONFIG_DETAIL_TITLE_COLOR_SOURCE}",
  "pluginListColor={activeItemColor}",
  "style={pluginListColor ? { color: pluginListColor } : undefined}",
  "data-source-toggle={RUNELITE_CONFIG_SECTION_TOGGLE_SOURCE}",
  "data-source-section-visible={expanded ? \"true\" : \"false\"}",
  "data-source-icon={expanded ? \"SECTION_RETRACT_ICON\" : \"SECTION_EXPAND_ICON\"}",
  "data-source-category-color={RUNELITE_CONFIG_PLUGIN_COLOR_SOURCE}",
  "data-source-icon={pinned ? \"PluginListItem.ON_STAR\" : \"PluginListItem.OFF_STAR\"}",
  "data-source-icon={enabled ? \"PluginListItem.ON_SWITCHER\" : \"PluginListItem.OFF_SWITCHER\"}",
  "runeliteConfigBoolean(clientShellValues.hidePlugins, false)",
  "runeliteConfigBoolean(clientShellValues.hideExternalPlugins, false)",
  "runeliteConfigBoolean(clientShellValues.hidePvmPlugins, false)",
  "runeliteConfigBoolean(clientShellValues.hideSkillingPlugins, false)",
  "runeliteConfigBoolean(clientShellValues.hidePvpPlugins, false)",
  "runeliteConfigBoolean(clientShellValues.hideUtilityPlugins, false)",
  "hideWhen: [\"hideExternalPlugins\", \"hidePvmPlugins\", \"hideSkillingPlugins\", \"hidePvpPlugins\", \"hideUtilityPlugins\"]",
  "hideWhen: [\"hidePlugins\"]",
  "keyName: \"externalColor\"",
  "keyName: \"pvmColor\"",
  "keyName: \"pvpColor\"",
  "keyName: \"skillingColor\"",
  "keyName: \"utilityColor\"",
  "keyword.includes(term) || runeliteJaroWinklerDistance(keyword, term) > 0.9",
  "readonly pluginBacked: boolean",
  "stored === undefined ? item.enabledByDefault : stored === \"true\"",
  "if (!item?.pluginBacked)",
  "pluginBacked={item.pluginBacked}",
  "data-plugin-backed={pluginBacked ? \"true\" : \"false\"}",
  "runelitePluginToggleButton-hidden"
]) {
  check(shellSource.includes(configPanelLiteral), `RuneliteClientShell is missing ConfigPanel source-backed behavior ${configPanelLiteral}.`);
}

for (const hudLiteral of [
  "inventoryDragDelayClientTicks",
  "inventoryDragDelayMsFromClientTicks",
  "inventoryDefaultDragDelayClientTicks = 5",
  "inventoryClientTickMs = 20",
  "Client.setInventoryDragDelay / AntiDragPlugin.DEFAULT_DELAY"
]) {
  check(hudSource.includes(hudLiteral), `NhClientHud is missing RuneLite Anti Drag inventory behavior ${hudLiteral}.`);
}

for (const hudLiteral of [
  "drawSpecbarAnyway?: boolean",
  "panel.specialBar && weaponHasSpecialAttack",
  "specialOrbUnavailableFillerSpriteId",
  "actionEnabled={localWeaponHasSpecialAttack}",
  "data-source-script-callback",
  "drawSpecbarAnyway={false}"
]) {
  check(hudSource.includes(hudLiteral), `NhClientHud is missing RuneLite Spec Bar behavior ${hudLiteral}.`);
}

for (const asset of [
  "config_icon.png",
  "skull_red.png",
  "info_icon.png",
  "open_rs.png",
  "search.png",
  "config_back_icon.png",
  "config_edit_icon.png",
  "star_on.png",
  "switcher_on.png",
  "skill_icons_small/hitpoints.png",
  "skill_icons_small/prayer.png",
  "skill_icons_small/attack.png",
  "skill_icons_small/strength.png",
  "skill_icons_small/defence.png",
  "skill_icons_small/ranged.png",
  "skill_icons_small/magic.png",
  "github_icon.png",
  "folder_icon.png",
  "discord_icon.png",
  "patreon_icon.png",
  "import_icon.png",
  "arrow_right.png"
]) {
  check(fs.existsSync(path.join(root, "fixtures", "runelite-ui", asset)), `Missing copied RuneLite UI asset ${asset}.`);
}

for (const asset of [
  "freeze.png",
  "freezeimmune.png",
  "teleblock.png",
  "teleblockimmune.png",
  "veng.png"
]) {
  check(
    fs.existsSync(path.join(root, "fixtures", "runelite-plugins", "freezetimers", asset)),
    `Missing copied RuneLite FreezeTimers asset ${asset}.`
  );
}

for (const asset of [
  "buffed.png",
  "buffedSmall.png",
  "debuffed.png",
  "debuffedSmall.png"
]) {
  check(
    fs.existsSync(path.join(root, "fixtures", "runelite-plugins", "boosts", asset)),
    `Missing copied RuneLite Boosts asset ${asset}.`
  );
}

for (const asset of [
  "front.png",
  "back.png"
]) {
  check(
    fs.existsSync(path.join(root, "fixtures", "runelite-plugins", "prayer", asset)),
    `Missing copied RuneLite Prayer asset ${asset}.`
  );
}

check(
  fs.existsSync(path.join(root, "fixtures", "runelite-plugins", "suppliestracker", "panel_icon.png")),
  "Missing copied RuneLite Supplies Tracker asset panel_icon.png."
);

check(
  fs.existsSync(path.join(root, "fixtures", "runelite-plugins", "pvptools", "skull.png")),
  "Missing copied RuneLite PvP Tools asset skull.png."
);

for (const asset of [
  "cursor-armadyl-godsword.png",
  "cursor-bandos-godsword.png",
  "cursor-dragon-dagger-p.png",
  "cursor-dragon-dagger.png",
  "cursor-dragon-scimitar.png",
  "cursor-mouse.png",
  "cursor-rs3-gold.png",
  "cursor-rs3-silver.png",
  "cursor-saradomin-godsword.png",
  "cursor-skill-specs.png",
  "cursor-trout.png",
  "cursor-zamorak-godsword.png"
]) {
  check(
    fs.existsSync(path.join(root, "fixtures", "runelite-ui", "customcursor", asset)),
    `Missing copied RuneLite Custom Cursor asset ${asset}.`
  );
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("RuneLite shell verifier passed: source-backed shell present, fake GPU/combat overlay removed.");
