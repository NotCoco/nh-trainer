import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type PropsWithChildren, type RefObject } from "react";
import {
  RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT,
  RUNELITE_KEY_REMAPPING_CONFIG_GROUP,
  RUNELITE_KEY_REMAPPING_PLUGIN_ID,
  runeliteKeyRemappingKeybindDisplayText,
  runeliteKeyRemappingKeybindPropertyFromKeyboardEvent,
  runeliteNormalizeKeyRemappingKeybind,
  type RuneliteKeyRemappingConfigSnapshot
} from "./runeliteKeyRemapping";
import {
  RUNELITE_HIDE_UNDER_PLUGIN_ID,
  RUNELITE_HIDE_UNDER_TARGET_TIMER_TICKS
} from "./runeliteHideUnder";
import {
  RUNELITE_PRAY_AGAINST_PLAYER_CONFIG_GROUP,
  RUNELITE_PRAY_AGAINST_PLAYER_PLUGIN_ID
} from "./runelitePrayAgainstPlayer";
import {
  RUNELITE_MOUSE_HIGHLIGHT_CONFIG_GROUP,
  RUNELITE_MOUSE_HIGHLIGHT_PLUGIN_ID,
  type RuneliteMouseHighlightConfigSnapshot
} from "./runeliteMouseHighlight";
import {
  RUNELITE_OVERLAY_POSITION_SOURCE,
  readRuneliteOverlayPreferredLocations,
  runeliteOverlayPreferredLocationStyle,
  saveRuneliteOverlayPreferredLocation,
  type RuneliteOverlayPreferredLocation,
  type RuneliteOverlayPreferredLocations
} from "./runeliteOverlayPosition";

export const RUNELITE_FIXED_CLIENT_WIDTH = 765;
export const RUNELITE_FIXED_CLIENT_HEIGHT = 503;
export const RUNELITE_PLUGIN_TOOLBAR_WIDTH = 36;
export const RUNELITE_PLUGIN_PANEL_WIDTH = 225;
export const RUNELITE_PLUGIN_SCROLLBAR_WIDTH = 17;
export const RUNELITE_PLUGIN_PANEL_OFFSET = 6;
export const RUNELITE_PLUGIN_WRAPPED_WIDTH = RUNELITE_PLUGIN_PANEL_WIDTH + RUNELITE_PLUGIN_SCROLLBAR_WIDTH;
export const RUNELITE_SIDEBAR_BUTTON_WIDTH = 10;
export const RUNELITE_SIDEBAR_BUTTON_HEIGHT = 20;
export const RUNELITE_SIDEBAR_BUTTON_RIGHT_OFFSET = 5;
export const RUNELITE_SIDEBAR_BUTTON_TOP_OFFSET = 5;
export const RUNELITE_SIDEBAR_HOVER_LEFT_EXTENSION = 15;
export const RUNELITE_SIDEBAR_HOVER_RIGHT_EXTENSION = 10;
export const RUNELITE_CONFIG_SEARCH_WIDTH = RUNELITE_PLUGIN_PANEL_WIDTH - 20;
export const RUNELITE_CONFIG_SEARCH_HEIGHT = 30;
export const RUNELITE_CONFIG_LIST_ITEM_HEIGHT = 20;
export const RUNELITE_CONFIG_BACK_BUTTON_WIDTH = 22;
export const RUNELITE_CONFIG_SLIDER_WIDTH = 80;
export const RUNELITE_CONFIG_SLIDER_ROW_WIDTH = 110;
export const RUNELITE_PVP_TRACKER_VERSION = "1.7.1";
export const RUNELITE_INFO_PANEL_PADDING = 10;
export const RUNELITE_INFO_ACTION_ROWS = 5;
export const RUNELITE_INFO_ACTION_GAP = 10;
export const RUNELITE_OVERLAY_STANDARD_WIDTH = 129;
export const RUNELITE_OVERLAY_BACKGROUND_RGBA = "rgba(70, 61, 50, 0.612)";
export const RUNELITE_CLIENT_TICK_MS = 20;
export const RUNELITE_ANTI_DRAG_DEFAULT_DELAY_CLIENT_TICKS = 5;
export const RUNELITE_ANTI_DRAG_ONE_GAME_TICK_DELAY_CLIENT_TICKS = 30;
export const RUNELITE_ANTI_DRAG_OVERLAY_RADIUS = 20;
const RUNELITE_CLIENT_TITLE = "NH Trainer";
const RUNELITE_CLIENT_TITLE_SOURCE = "NH Trainer branding / RuneLiteProperties.getTitle() title path";
const RUNELITE_FRAME_CONFIG_SOURCE =
  "ClientUI.updateFrameConfig sets frame title, always-on-top, resizable, expandResizeType, containInScreen, and clears remembered bounds when disabled";
const RUNELITE_STRETCHED_MODE_PLUGIN_ID = "stretched-mode";
const RUNELITE_TRAINER_DISABLED_PLUGIN_IDS = new Set(["attack-styles"]);
const RUNELITE_TRAINER_DISABLED_PLUGIN_SOURCE =
  "NH trainer disables AttackStylesPlugin at the plugin manager boundary; combat tab attack-style widgets remain source-backed.";
const RUNELITE_STRETCHED_MODE_SOURCE =
  "StretchedModePlugin startUp client.setStretchedEnabled(true), updateConfig set integerScaling/keepAspectRatio/fast/scalingFactor, invalidateStretching(true)";
const RUNELITE_STRETCHED_DIMENSIONS_SOURCE =
  "Client.getRealDimensions keeps fixed mode at Constants.GAME_FIXED_SIZE; Client.getStretchedDimensions uses parent width/height, keepAspectRatio, and integerScaling";
const RUNELITE_STRETCHED_CANVAS_LOCATION_SOURCE =
  "Canvas.setLocation centers stretched canvas horizontally with (parent.getWidth() - getStretchedDimensions().width) / 2 and y=0";
const RUNELITE_STRETCHED_MOUSE_SOURCE =
  "TranslateMouseListener divides stretched mouse X/Y by stretchedDimensions / realDimensions before dispatch";
const RUNELITE_STRETCHED_FAST_SOURCE =
  "Hooks.draw uses RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR when client.isStretchedFast()";

const RUNELITE_CUSTOM_CURSOR_ASSETS = [
  { id: "RS3_GOLD", name: "RS3 Gold", fileName: "cursor-rs3-gold.png" },
  { id: "RS3_SILVER", name: "RS3 Silver", fileName: "cursor-rs3-silver.png" },
  { id: "DRAGON_DAGGER", name: "Dragon Dagger", fileName: "cursor-dragon-dagger.png" },
  { id: "DRAGON_DAGGER_POISON", name: "Dragon Dagger (p)", fileName: "cursor-dragon-dagger-p.png" },
  { id: "TROUT", name: "Trout", fileName: "cursor-trout.png" },
  { id: "DRAGON_SCIMITAR", name: "Dragon Scimitar", fileName: "cursor-dragon-scimitar.png" },
  { id: "ARMADYL_GODSWORD", name: "Armadyl Godsword", fileName: "cursor-armadyl-godsword.png" },
  { id: "BANDOS_GODSWORD", name: "Bandos Godsword", fileName: "cursor-bandos-godsword.png" },
  { id: "MOUSE", name: "Mouse", fileName: "cursor-mouse.png" },
  { id: "SARADOMIN_GODSWORD", name: "Saradomin Godsword", fileName: "cursor-saradomin-godsword.png" },
  { id: "ZAMORAK_GODSWORD", name: "Zamorak Godsword", fileName: "cursor-zamorak-godsword.png" },
  { id: "SKILL_SPECS", name: "Skill Specs", fileName: "cursor-skill-specs.png" }
] as const;

type RuneliteNavigationButtonId = "configuration" | "pvp-tools" | "supplies-tracker" | "pvp-fight-history" | "info";
type RunelitePluginType = "important" | "external" | "pvm" | "skilling" | "pvp" | "utility" | "general-use";
type RuneliteConfigValue = boolean | number | string;
type RuneliteConfigControlType = "boolean" | "range" | "number" | "enum" | "text" | "color" | "modifierless-keybind";
type RunelitePluginSortMode = "Category" | "Alphabetically";
type RuneliteExpandResizeType = "Keep window size" | "Keep game size";
type RuneliteContainInScreenMode = "ALWAYS" | "RESIZING" | "NEVER";
type RuneliteWarningOnExit = "Always" | "Logged in" | "Never";
type RunelitePvpTrackerStatisticId =
  | "off-pray"
  | "expected-damage"
  | "damage-dealt"
  | "magic-hits"
  | "offensive-pray"
  | "hp-healed"
  | "robe-hits"
  | "ko-chances"
  | "last-ko-chance"
  | "ghost-barrages";
type RunelitePvpTrackerColor = "normal" | "good" | "bad";

interface RuneliteAntiDragHotkeyState {
  readonly toggleDrag: boolean;
  readonly holdDrag: boolean;
}

interface RuneliteAntiDragMouseCanvasPosition {
  readonly x: number;
  readonly y: number;
  readonly insideClient: boolean;
}

export interface RunelitePvpTrackerLineSnapshot {
  readonly statistic: RunelitePvpTrackerStatisticId;
  readonly acronym: string;
  readonly label: string;
  readonly left: string;
  readonly right: string;
  readonly leftColor?: RunelitePvpTrackerColor | undefined;
  readonly rightColor?: RunelitePvpTrackerColor | undefined;
  readonly leftPercent: number;
  readonly rightPercent: number;
}

export interface RunelitePvpFightHistoryEntrySnapshot {
  readonly id: string;
  readonly playerName: string;
  readonly opponentName: string;
  readonly worldLabel: string;
  readonly endedAtTick: number;
  readonly playerDead: boolean;
  readonly opponentDead: boolean;
  readonly lines: readonly RunelitePvpTrackerLineSnapshot[];
}

export interface RunelitePvpTrackerSnapshot {
  readonly fightStarted: boolean;
  readonly playerName: string;
  readonly opponentName: string;
  readonly kills: number;
  readonly deaths: number;
  readonly lines: readonly RunelitePvpTrackerLineSnapshot[];
  readonly fightHistory: readonly RunelitePvpFightHistoryEntrySnapshot[];
}

export type RuneliteSuppliesTrackerCategory = "Food" | "Potions" | "Runes" | "Ammo" | "Teleports";

export interface RuneliteSuppliesTrackerSpriteSnapshot {
  readonly imagePath: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly atlasWidth: number;
  readonly atlasHeight: number;
}

export interface RuneliteSuppliesTrackerItemSnapshot {
  readonly itemId: number;
  readonly displayItemId: number;
  readonly name: string;
  readonly quantity: number;
  readonly price: number;
  readonly category: RuneliteSuppliesTrackerCategory;
  readonly sprite: RuneliteSuppliesTrackerSpriteSnapshot | null;
}

export interface RuneliteSuppliesTrackerCategorySnapshot {
  readonly category: RuneliteSuppliesTrackerCategory;
  readonly totalSupplies: number;
  readonly totalPrice: number;
  readonly items: readonly RuneliteSuppliesTrackerItemSnapshot[];
}

export interface RuneliteSuppliesTrackerSnapshot {
  readonly totalSupplies: number;
  readonly totalPrice: number;
  readonly categories: readonly RuneliteSuppliesTrackerCategorySnapshot[];
}

export interface RunelitePvpToolsItemSnapshot {
  readonly itemId: number;
  readonly name: string;
  readonly value: number;
  readonly sprite: RuneliteSuppliesTrackerSpriteSnapshot | null;
}

export interface RunelitePvpToolsSnapshot {
  readonly friendlyPlayerCount: number;
  readonly enemyPlayerCount: number;
  readonly enemyPrayingMageCount: number;
  readonly enemyPrayingRangeCount: number;
  readonly enemyPrayingMeleeCount: number;
  readonly brewCount: number;
  readonly totalRisk: number;
  readonly riskProtectingItem: number;
  readonly mostValuableItem: RunelitePvpToolsItemSnapshot | null;
  readonly missingClanMembers: readonly string[];
  readonly currentClanMembers: readonly string[];
  readonly inPvpArea: boolean;
}

export interface RuneliteClientShellConfigSnapshot {
  readonly enableOpacity: boolean;
  readonly opacityPercentage: number;
  readonly effectiveOpacity: number;
}

export interface RuneliteFrameConfigSnapshot {
  readonly automaticResizeType: RuneliteExpandResizeType;
  readonly lockWindowSize: boolean;
  readonly containInScreen: RuneliteContainInScreenMode;
  readonly enableCustomChrome: boolean;
  readonly usernameInTitle: boolean;
  readonly rememberScreenBounds: boolean;
  readonly gameAlwaysOnTop: boolean;
  readonly warningOnExit: RuneliteWarningOnExit;
}

export interface RuneliteStretchedModeConfigSnapshot {
  readonly enabled: boolean;
  readonly keepAspectRatio: boolean;
  readonly increasedPerformance: boolean;
  readonly integerScaling: boolean;
  readonly scalingFactor: number;
}

export interface RuneliteGpuPluginConfigSnapshot {
  readonly enabled: boolean;
  readonly drawDistance: number;
  readonly smoothBanding: boolean;
  readonly antiAliasingMode: string;
  readonly anisotropicFilteringMode: string;
  readonly fogDepth: number;
  readonly fogCircularity: number;
  readonly fogDensity: number;
}

export interface RuneliteAnimationSmoothingConfigSnapshot {
  readonly enabled: boolean;
  readonly smoothPlayerAnimations: boolean;
  readonly smoothNpcAnimations: boolean;
  readonly smoothObjectAnimations: boolean;
  readonly smoothWidgetAnimations: boolean;
}

export interface RuneliteAntiDragConfigSnapshot {
  readonly enabled: boolean;
  readonly alwaysOn: boolean;
  readonly toggleKeyBind: boolean;
  readonly holdKeyBind: boolean;
  readonly key: string;
  readonly reqFocus: boolean;
  readonly overlay: boolean;
  readonly overlayColor: string;
  readonly changeCursor: boolean;
  readonly cursorStyle: string;
  readonly dragDelayClientTicks: number;
  readonly hotkeyActive: boolean;
  readonly effectiveDragDelayClientTicks: number;
}

export interface RuneliteCustomCursorConfigSnapshot {
  readonly enabled: boolean;
  readonly cursorStyle: string;
}

export interface RuneliteEntityHiderConfigSnapshot {
  readonly enabled: boolean;
  readonly isHidingEntities: boolean;
  readonly hidePlayers: boolean;
  readonly hidePlayers2D: boolean;
  readonly hideSpecificPlayers: string;
  readonly hideAttackers: boolean;
  readonly hideLocalPlayer: boolean;
  readonly hideLocalPlayer2D: boolean;
  readonly hideFriends: boolean;
  readonly hideClanMates: boolean;
  readonly hideNPCs: boolean;
  readonly hideNPCs2D: boolean;
  readonly hideNPCsNames: string;
  readonly hideDeadNPCs: boolean;
  readonly hideNPCsOnDeath: string;
  readonly hideProjectiles: boolean;
}

export interface RuneliteHideUnderConfigSnapshot {
  readonly enabled: boolean;
  readonly isHidingEntities: boolean;
  readonly inAllowedRegion: boolean;
  readonly targetTimerTicks: number;
}

export interface RunelitePrayAgainstPlayerConfigSnapshot {
  readonly enabled: boolean;
  readonly attackerPlayerColor: string;
  readonly potentialPlayerColor: string;
  readonly attackerTargetTimeoutSeconds: number;
  readonly potentialTargetTimeoutSeconds: number;
  readonly newSpawnTimeoutSeconds: number;
  readonly ignoreFriends: boolean;
  readonly ignoreClanMates: boolean;
  readonly markNewPlayer: boolean;
  readonly drawTargetPrayAgainst: boolean;
  readonly drawPotentialTargetPrayAgainst: boolean;
  readonly drawTargetPrayAgainstPrayerTab: boolean;
  readonly drawTargetsName: boolean;
  readonly drawPotentialTargetsName: boolean;
  readonly drawTargetHighlight: boolean;
  readonly drawPotentialTargetHighlight: boolean;
  readonly drawTargetTile: boolean;
  readonly drawPotentialTargetTile: boolean;
  readonly drawUnknownWeapons: boolean;
  readonly logicalHeightClientUnits: number;
}

export interface RuneliteFreezeTimersConfigSnapshot {
  readonly enabled: boolean;
  readonly showPlayers: boolean;
  readonly showNpcs: boolean;
  readonly freezeTimers: boolean;
  readonly teleblockTimers: boolean;
  readonly vengeanceTimers: boolean;
  readonly xOffset: number;
  readonly noImage: boolean;
  readonly fontStyle: string;
  readonly textSize: number;
}

export interface RuneliteTimersConfigSnapshot {
  readonly enabled: boolean;
  readonly showFreezes: boolean;
}

export interface RuneliteSpecBarConfigSnapshot {
  readonly enabled: boolean;
  readonly drawSpecbarAnyway: boolean;
}

export type RuneliteStatusBarMode = "Disabled" | "Hitpoints" | "Prayer" | "Run Energy" | "Special Attack";

export interface RuneliteStatusBarsConfigSnapshot {
  readonly enabled: boolean;
  readonly enableCounter: boolean;
  readonly enableSkillIcon: boolean;
  readonly enableRestorationBars: boolean;
  readonly leftBarMode: RuneliteStatusBarMode;
  readonly rightBarMode: RuneliteStatusBarMode;
  readonly toggleRestorationBars: boolean;
  readonly hideStatusBarDelay: number;
}

export interface RuneliteStatusOrbsConfigSnapshot {
  readonly enabled: boolean;
  readonly dynamicHpHeart: boolean;
  readonly showHitpoints: boolean;
  readonly showWhenNoChange: boolean;
  readonly notifyBeforeHpRegenSeconds: number;
  readonly showSpecial: boolean;
  readonly showRun: boolean;
  readonly replaceOrbText: boolean;
}

export type RunelitePrayerFlickLocation = "NONE" | "PRAYER_ORB" | "PRAYER_BAR" | "BOTH";

export interface RunelitePrayerConfigSnapshot {
  readonly enabled: boolean;
  readonly prayerFlickLocation: RunelitePrayerFlickLocation;
  readonly prayerFlickAlwaysOn: boolean;
  readonly prayerIndicator: boolean;
  readonly prayerIndicatorOverheads: boolean;
  readonly showPrayerDoseIndicator: boolean;
  readonly showPrayerStatistics: boolean;
  readonly showPrayerBar: boolean;
  readonly hideIfNotPraying: boolean;
  readonly hideIfOutOfCombat: boolean;
}

export interface RuneliteAttackStylesConfigSnapshot {
  readonly enabled: boolean;
  readonly alwaysShowStyle: boolean;
  readonly warnForDefence: boolean;
  readonly warnForAttack: boolean;
  readonly warnForStrength: boolean;
  readonly warnForRanged: boolean;
  readonly warnForMagic: boolean;
  readonly hideAutoRetaliate: boolean;
  readonly removeWarnedStyles: boolean;
}

export type RuneliteOpponentHitpointsDisplayStyle = "Hitpoints" | "Percentage" | "Both";

export interface RuneliteOpponentInfoConfigSnapshot {
  readonly enabled: boolean;
  readonly lookupOnInteraction: boolean;
  readonly hitpointsDisplayStyle: RuneliteOpponentHitpointsDisplayStyle;
  readonly showOpponentsOpponent: boolean;
  readonly showAttackersMenu: boolean;
  readonly showAttackingMenu: boolean;
  readonly attackingColor: string;
  readonly showHitpointsMenu: boolean;
}

export interface RunelitePlayerIndicatorsConfigSnapshot {
  readonly enabled: boolean;
  readonly highlightOwnPlayer: boolean;
  readonly ownPlayerColor: string;
  readonly highlightTargets: boolean;
  readonly targetColor: string;
  readonly showCombatLevel: boolean;
  readonly playerSkull: boolean;
  readonly highlightOtherPlayers: boolean;
  readonly otherPlayerColor: string;
}

export interface RuneliteTileIndicatorsConfigSnapshot {
  readonly enabled: boolean;
  readonly highlightDestinationColor: string;
  readonly highlightDestinationTile: boolean;
  readonly thinDestinationTile: boolean;
  readonly highlightCurrentColor: string;
  readonly highlightCurrentTile: boolean;
  readonly thinCurrentTile: boolean;
  readonly highlightHoveredColor: string;
  readonly highlightHoveredTile: boolean;
  readonly thinHoveredTile: boolean;
}

export type RuneliteBoostsDisplayChangeMode = "ALWAYS" | "BOOSTED" | "NEVER";
export type RuneliteBoostsDisplayBoosts = "NONE" | "COMBAT" | "NON_COMBAT" | "BOTH";

export interface RuneliteBoostsConfigSnapshot {
  readonly enabled: boolean;
  readonly displayBoosts: RuneliteBoostsDisplayBoosts;
  readonly useRelativeBoost: boolean;
  readonly displayInfoboxes: boolean;
  readonly displayIcons: boolean;
  readonly boldIconFont: boolean;
  readonly displayNextBuffChange: RuneliteBoostsDisplayChangeMode;
  readonly displayNextDebuffChange: RuneliteBoostsDisplayChangeMode;
  readonly boostThreshold: number;
  readonly groupNotifications: boolean;
}

export interface RuneliteInfoBoxConfigSnapshot {
  readonly vertical: boolean;
  readonly wrap: number;
  readonly size: number;
}

export interface RuneliteOverlayMenuConfigSnapshot {
  readonly requireShift: boolean;
}

export interface RunelitePvpPerformanceTrackerConfigSnapshot {
  readonly enabled: boolean;
  readonly restrictToLms: boolean;
  readonly inLastManStandingArea: boolean;
  readonly showFightHistoryPanel: boolean;
  readonly fightHistoryRenderLimit: number;
  readonly showFightOverlay: boolean;
  readonly showOverlayTitle: boolean;
  readonly showOverlayNames: boolean;
  readonly showOverlayOffPray: boolean;
  readonly showOverlayExpectedDamage: boolean;
  readonly showOverlayDamageDealt: boolean;
  readonly showOverlayMagicHits: boolean;
  readonly showOverlayOffensivePray: boolean;
  readonly showOverlayHpHealed: boolean;
  readonly showOverlayRobeHits: boolean;
  readonly showOverlayTotalKoChance: boolean;
  readonly showOverlayLastKoChance: boolean;
  readonly showOverlayGhostBarrage: boolean;
}

export interface RuneliteSuppliesTrackerConfigSnapshot {
  readonly enabled: boolean;
  readonly blowpipeAmmo: string;
}

export type RunelitePvpToolsAttackMode = "Clan" | "Friends" | "Both";

export interface RunelitePvpToolsConfigSnapshot {
  readonly enabled: boolean;
  readonly countPlayers: boolean;
  readonly countOverHeads: boolean;
  readonly renderSelfHotkey: string;
  readonly hideAttack: boolean;
  readonly hideAttackMode: RunelitePvpToolsAttackMode;
  readonly hideCast: boolean;
  readonly hideCastMode: RunelitePvpToolsAttackMode;
  readonly hideCastIgnored: string;
  readonly riskCalculator: boolean;
  readonly missingPlayers: boolean;
  readonly currentPlayers: boolean;
}

export type RuneliteXpDropDamageMode = "NONE" | "ABOVE_OPPONENT" | "IN_XP_DROP";
export type RuneliteXpDropDisplayMode = "XP" | "HIT";
export type RuneliteXpDropTextSize = "Small" | "Medium" | "Large";
export type RuneliteXpDropFont = "Plain 11" | "Plain 12" | "Bold 12";

export interface RuneliteXpDropConfigSnapshot {
  readonly enabled: boolean;
  readonly hideSkillIcons: boolean;
  readonly meleePrayerColor: string;
  readonly rangePrayerColor: string;
  readonly magePrayerColor: string;
  readonly fakeXpDropDelay: number;
  readonly showDamageDrops: RuneliteXpDropDamageMode;
  readonly damageColor: string;
  readonly trainerDisplayMode: RuneliteXpDropDisplayMode;
  readonly nativeTextSize: RuneliteXpDropTextSize;
  readonly trainerFont: RuneliteXpDropFont;
  readonly trainerTextSize: number;
  readonly trainerMoveDistance: number;
}

export interface RuneliteClientConfigSnapshot {
  readonly clientShell: RuneliteClientShellConfigSnapshot;
  readonly frame: RuneliteFrameConfigSnapshot;
  readonly stretchedMode: RuneliteStretchedModeConfigSnapshot;
  readonly infoBox: RuneliteInfoBoxConfigSnapshot;
  readonly overlayMenu: RuneliteOverlayMenuConfigSnapshot;
  readonly gpu: RuneliteGpuPluginConfigSnapshot;
  readonly animationSmoothing: RuneliteAnimationSmoothingConfigSnapshot;
  readonly antiDrag: RuneliteAntiDragConfigSnapshot;
  readonly customCursor: RuneliteCustomCursorConfigSnapshot;
  readonly keyRemapping: RuneliteKeyRemappingConfigSnapshot;
  readonly mouseHighlight: RuneliteMouseHighlightConfigSnapshot;
  readonly entityHider: RuneliteEntityHiderConfigSnapshot;
  readonly hideUnder: RuneliteHideUnderConfigSnapshot;
  readonly prayAgainstPlayer: RunelitePrayAgainstPlayerConfigSnapshot;
  readonly freezeTimers: RuneliteFreezeTimersConfigSnapshot;
  readonly timers: RuneliteTimersConfigSnapshot;
  readonly specBar: RuneliteSpecBarConfigSnapshot;
  readonly statusBars: RuneliteStatusBarsConfigSnapshot;
  readonly statusOrbs: RuneliteStatusOrbsConfigSnapshot;
  readonly prayer: RunelitePrayerConfigSnapshot;
  readonly attackStyles: RuneliteAttackStylesConfigSnapshot;
  readonly opponentInfo: RuneliteOpponentInfoConfigSnapshot;
  readonly playerIndicators: RunelitePlayerIndicatorsConfigSnapshot;
  readonly tileIndicators: RuneliteTileIndicatorsConfigSnapshot;
  readonly boosts: RuneliteBoostsConfigSnapshot;
  readonly pvpPerformanceTracker: RunelitePvpPerformanceTrackerConfigSnapshot;
  readonly suppliesTracker: RuneliteSuppliesTrackerConfigSnapshot;
  readonly pvpTools: RunelitePvpToolsConfigSnapshot;
  readonly xpDrop: RuneliteXpDropConfigSnapshot;
}

export const RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT: RuneliteClientConfigSnapshot = {
  clientShell: {
    enableOpacity: false,
    opacityPercentage: 100,
    effectiveOpacity: 1
  },
  frame: {
    automaticResizeType: "Keep game size",
    lockWindowSize: false,
    containInScreen: "RESIZING",
    enableCustomChrome: true,
    usernameInTitle: true,
    rememberScreenBounds: true,
    gameAlwaysOnTop: false,
    warningOnExit: "Logged in"
  },
  stretchedMode: {
    enabled: true,
    keepAspectRatio: false,
    increasedPerformance: false,
    integerScaling: false,
    scalingFactor: 50
  },
  infoBox: {
    vertical: false,
    wrap: 4,
    size: 35
  },
  overlayMenu: {
    requireShift: true
  },
  gpu: {
    enabled: false,
    drawDistance: 25,
    smoothBanding: false,
    antiAliasingMode: "Disabled",
    anisotropicFilteringMode: "Disabled",
    fogDepth: 30,
    fogCircularity: 30,
    fogDensity: 10
  },
  animationSmoothing: {
    enabled: false,
    smoothPlayerAnimations: true,
    smoothNpcAnimations: true,
    smoothObjectAnimations: true,
    smoothWidgetAnimations: true
  },
  antiDrag: {
    enabled: false,
    alwaysOn: false,
    toggleKeyBind: false,
    holdKeyBind: false,
    key: "Shift",
    reqFocus: false,
    overlay: false,
    overlayColor: "rgba(255, 0, 0, 0.12)",
    changeCursor: false,
    cursorStyle: "RS3_GOLD",
    dragDelayClientTicks: RUNELITE_ANTI_DRAG_ONE_GAME_TICK_DELAY_CLIENT_TICKS,
    hotkeyActive: false,
    effectiveDragDelayClientTicks: RUNELITE_ANTI_DRAG_DEFAULT_DELAY_CLIENT_TICKS
  },
  customCursor: {
    enabled: false,
    cursorStyle: "RS3_GOLD"
  },
  keyRemapping: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT,
  mouseHighlight: {
    enabled: false,
    mainTooltip: true,
    uiTooltip: true,
    chatboxTooltip: true,
    hideSpells: false,
    hideCombat: false,
    rightClickOptionTooltip: true
  },
  entityHider: {
    enabled: false,
    isHidingEntities: true,
    hidePlayers: true,
    hidePlayers2D: true,
    hideSpecificPlayers: "",
    hideAttackers: false,
    hideLocalPlayer: false,
    hideLocalPlayer2D: false,
    hideFriends: false,
    hideClanMates: false,
    hideNPCs: false,
    hideNPCs2D: false,
    hideNPCsNames: "",
    hideDeadNPCs: false,
    hideNPCsOnDeath: "",
    hideProjectiles: false
  },
  hideUnder: {
    enabled: false,
    isHidingEntities: true,
    inAllowedRegion: true,
    targetTimerTicks: RUNELITE_HIDE_UNDER_TARGET_TIMER_TICKS
  },
  prayAgainstPlayer: {
    enabled: false,
    attackerPlayerColor: "#ff0006",
    potentialPlayerColor: "#ffff00",
    attackerTargetTimeoutSeconds: 10,
    potentialTargetTimeoutSeconds: 10,
    newSpawnTimeoutSeconds: 5,
    ignoreFriends: true,
    ignoreClanMates: true,
    markNewPlayer: false,
    drawTargetPrayAgainst: true,
    drawPotentialTargetPrayAgainst: true,
    drawTargetPrayAgainstPrayerTab: false,
    drawTargetsName: true,
    drawPotentialTargetsName: true,
    drawTargetHighlight: true,
    drawPotentialTargetHighlight: true,
    drawTargetTile: false,
    drawPotentialTargetTile: false,
    drawUnknownWeapons: false,
    logicalHeightClientUnits: 200
  },
  freezeTimers: {
    enabled: false,
    showPlayers: true,
    showNpcs: false,
    freezeTimers: true,
    teleblockTimers: true,
    vengeanceTimers: true,
    xOffset: 20,
    noImage: false,
    fontStyle: "Bold",
    textSize: 11
  },
  timers: {
    enabled: true,
    showFreezes: true
  },
  specBar: {
    enabled: false,
    drawSpecbarAnyway: false
  },
  statusBars: {
    enabled: false,
    enableCounter: false,
    enableSkillIcon: true,
    enableRestorationBars: true,
    leftBarMode: "Hitpoints",
    rightBarMode: "Prayer",
    toggleRestorationBars: false,
    hideStatusBarDelay: 3
  },
  statusOrbs: {
    enabled: false,
    dynamicHpHeart: true,
    showHitpoints: true,
    showWhenNoChange: false,
    notifyBeforeHpRegenSeconds: 0,
    showSpecial: true,
    showRun: true,
    replaceOrbText: false
  },
  prayer: {
    enabled: false,
    prayerFlickLocation: "NONE",
    prayerFlickAlwaysOn: false,
    prayerIndicator: false,
    prayerIndicatorOverheads: false,
    showPrayerDoseIndicator: true,
    showPrayerStatistics: true,
    showPrayerBar: false,
    hideIfNotPraying: true,
    hideIfOutOfCombat: false
  },
  attackStyles: {
    enabled: false,
    alwaysShowStyle: true,
    warnForDefence: false,
    warnForAttack: false,
    warnForStrength: false,
    warnForRanged: false,
    warnForMagic: false,
    hideAutoRetaliate: false,
    removeWarnedStyles: false
  },
  opponentInfo: {
    enabled: false,
    lookupOnInteraction: false,
    hitpointsDisplayStyle: "Hitpoints",
    showOpponentsOpponent: true,
    showAttackersMenu: false,
    showAttackingMenu: false,
    attackingColor: "#00ff00",
    showHitpointsMenu: false
  },
  playerIndicators: {
    enabled: false,
    highlightOwnPlayer: false,
    ownPlayerColor: "#00b8d4",
    highlightTargets: false,
    targetColor: "#136ef7",
    showCombatLevel: false,
    playerSkull: false,
    highlightOtherPlayers: false,
    otherPlayerColor: "#ff0000"
  },
  tileIndicators: {
    enabled: false,
    highlightDestinationColor: "#808080",
    highlightDestinationTile: true,
    thinDestinationTile: false,
    highlightCurrentColor: "#00ffff",
    highlightCurrentTile: false,
    thinCurrentTile: false,
    highlightHoveredColor: "rgba(0, 0, 0, 0)",
    highlightHoveredTile: false,
    thinHoveredTile: false
  },
  boosts: {
    enabled: false,
    displayBoosts: "BOTH",
    useRelativeBoost: false,
    displayInfoboxes: false,
    displayIcons: false,
    boldIconFont: false,
    displayNextBuffChange: "BOOSTED",
    displayNextDebuffChange: "NEVER",
    boostThreshold: 0,
    groupNotifications: false
  },
  pvpPerformanceTracker: {
    enabled: true,
    restrictToLms: false,
    inLastManStandingArea: false,
    showFightHistoryPanel: true,
    fightHistoryRenderLimit: 200,
    showFightOverlay: true,
    showOverlayTitle: false,
    showOverlayNames: true,
    showOverlayOffPray: true,
    showOverlayExpectedDamage: true,
    showOverlayDamageDealt: false,
    showOverlayMagicHits: false,
    showOverlayOffensivePray: false,
    showOverlayHpHealed: false,
    showOverlayRobeHits: false,
    showOverlayTotalKoChance: true,
    showOverlayLastKoChance: false,
    showOverlayGhostBarrage: false
  },
  suppliesTracker: {
    enabled: false,
    blowpipeAmmo: "MITHRIL"
  },
  pvpTools: {
    enabled: false,
    countPlayers: true,
    countOverHeads: true,
    renderSelfHotkey: "Not set",
    hideAttack: false,
    hideAttackMode: "Friends",
    hideCast: false,
    hideCastMode: "Friends",
    hideCastIgnored: "cure other, energy transfer, heal other, vengeance other",
    riskCalculator: true,
    missingPlayers: true,
    currentPlayers: true
  },
  xpDrop: {
    enabled: true,
    hideSkillIcons: false,
    meleePrayerColor: "#1580ad",
    rangePrayerColor: "#1580ad",
    magePrayerColor: "#1580ad",
    fakeXpDropDelay: 0,
    showDamageDrops: "NONE",
    damageColor: "#ff0000",
    trainerDisplayMode: "HIT",
    nativeTextSize: "Small",
    trainerFont: "Plain 11",
    trainerTextSize: 16,
    trainerMoveDistance: 100
  }
};

const RUNELITE_INITIAL_ANTI_DRAG_HOTKEY_STATE: RuneliteAntiDragHotkeyState = {
  toggleDrag: false,
  holdDrag: false
};

const RUNELITE_INITIAL_ANTI_DRAG_MOUSE_CANVAS_POSITION: RuneliteAntiDragMouseCanvasPosition = {
  x: 0,
  y: 0,
  insideClient: false
};

interface RuneliteClientShellProps extends PropsWithChildren {
  readonly pvpTrackerSnapshot?: RunelitePvpTrackerSnapshot | null;
  readonly suppliesTrackerSnapshot?: RuneliteSuppliesTrackerSnapshot | null;
  readonly pvpToolsSnapshot?: RunelitePvpToolsSnapshot | null;
  readonly onConfigSnapshotChange?: (snapshot: RuneliteClientConfigSnapshot) => void;
}

interface RuneliteOpenConfigRequest {
  readonly pluginId: string;
  readonly requestId: number;
}

interface RuneliteMovingOverlayState {
  readonly overlayName: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
}

interface RuneliteNavigationButtonModel {
  readonly id: RuneliteNavigationButtonId;
  readonly tooltip: string;
  readonly iconPath: string;
  readonly priority: number;
  readonly tab: boolean;
  readonly sourcePath: string;
}

type RuneliteToolbarEntry =
  | {
      readonly kind: "button";
      readonly button: RuneliteNavigationButtonModel;
    }
  | {
      readonly kind: "delimiter";
      readonly id: "non-tab-delimiter";
    };

const RUNELITE_TOOLBAR_SORT_SOURCE = "ClientPluginToolbar TreeMap compareTrueFirst(tab) priority tooltip";
const RUNELITE_TOOLBAR_DELIMITER_SOURCE =
  "ClientPluginToolbar update Box.createVerticalGlue addSeparator before first non-tab";
const RUNELITE_NAVIGATION_BUTTON_SOURCE_FIELDS =
  "NavigationButton icon tab tooltip selected onClick onSelect panel priority popup";
const RUNELITE_NAVIGATION_BUTTON_EQUALS_SOURCE = 'NavigationButton @EqualsAndHashCode(of = {"tooltip"})';
const RUNELITE_SIDEBAR_TOGGLE_SOURCE =
  "ClientUI.paintOverlays sidebarOpen ? sidebarClosedIcon : sidebarOpenIcon";
const RUNELITE_SIDEBAR_TOGGLE_CLICK_SOURCE = "MouseListener sidebarButtonPosition.contains -> toggleSidebar";
const RUNELITE_SIDEBAR_TOGGLE_RANGE_SOURCE =
  "sidebarButtonRange x - 15 width image.getWidth() + 25 full height";
const RUNELITE_SIDEBAR_TOGGLE_FLIP_SOURCE = "ImageUtil.flipImage(sidebarOpenIcon, true, false)";
const RUNELITE_SIDEBAR_TOGGLE_STATE_SOURCE =
  "toggleSidebar removes/adds pluginToolbar and preserves currentNavButton";
const RUNELITE_SIDEBAR_HOTKEY_SOURCE =
  "HotkeyListener new Keybind(KeyEvent.VK_F11, InputEvent.CTRL_DOWN_MASK) -> toggleSidebar";
const RUNELITE_SIDEBAR_STATE_MODEL_SOURCE = "ClientUI sidebarOpen currentNavButton pluginPanel";
const RUNELITE_SIDEBAR_SELECTION_SOURCE = "ClientUI currentButton currentNavButton setSelected(sidebarOpen)";
const RUNELITE_CONFIG_PLUGIN_ORDER_SOURCE =
  "ConfigPanel.definedOrder IMPORTANT, EXTERNAL, PVM, SKILLING, PVP, UTILITY, GENERAL_USE";
const RUNELITE_CONFIG_PLUGIN_SORT_SOURCE =
  "ConfigPanel.sortPluginList clientShellConfig.pluginSortMode CATEGORY ? categoryComparator.thenComparing(name) : Comparator.comparing(name)";
const RUNELITE_CONFIG_PLUGIN_HIDDEN_SOURCE =
  "ConfigPanel.getHiddenByCategory IMPORTANT/GENERAL_USE never hidden, hidePlugins then type-specific hide flags";
const RUNELITE_CONFIG_ENTRY_VISIBILITY_SOURCE =
  "ConfigPanel.openGroupConfigPanel ConfigItem.hidden/unhide/hide/unhideValue/hideValue conditional continue";
const RUNELITE_CONFIG_DETAIL_TITLE_COLOR_SOURCE =
  "ConfigPanel.openGroupConfigPanel title.setForeground(listItem.getColor()) where PluginListItem.getColor returns category color or Color.WHITE";
const RUNELITE_CONFIG_SECTION_TOGGLE_SOURCE =
  "ConfigPanel.toggleSection setVisible(newState) SECTION_RETRACT_ICON/SECTION_EXPAND_ICON configManager.setConfiguration(group, sectionKey, newState)";
const RUNELITE_CONFIG_PLUGIN_COLOR_SOURCE =
  "ConfigPanel getColorByCategory(client shell config, pluginType) -> PluginListItem.setColor(nameLabel foreground)";
const RUNELITE_CONFIG_PLUGIN_SEARCH_SOURCE =
  "PluginListItem.matchesSearchTerms keyword contains || JaroWinklerDistance.apply(keyword, term) > 0.9";
const RUNELITE_ICON_TEXT_FIELD_LAYOUT_SOURCE =
  "IconTextField BorderLayout iconWrapperLabel preferred 30 WEST FlatTextField CENTER clearButton EAST";
const RUNELITE_ICON_TEXT_FIELD_CLEAR_SOURCE =
  "IconTextField DocumentListener clearButton visible when text present; ActionListener/mousePressed setText(null)";
const RUNELITE_ICON_TEXT_FIELD_HOVER_SOURCE =
  "IconTextField hoverEffect set hover background and clearButton Color.PINK";
const RUNELITE_FLAT_TEXT_FIELD_SOURCE =
  "FlatTextField EmptyBorder(0, 10, 0, 0) selectedTextColor WHITE selectionColor BRAND_BLUE_TRANSPARENT";
const RUNELITE_PLUGIN_LIST_ITEM_OFF_SWITCHER_SOURCE =
  "PluginListItem.OFF_SWITCHER ImageUtil.flipImage(ImageUtil.grayscaleOffset(ImageUtil.grayscaleImage(onSwitcher), 0.61f), true, false)";
const RUNELITE_PLUGIN_LIST_ITEM_OFF_STAR_SOURCE =
  "PluginListItem.OFF_STAR ImageUtil.grayscaleOffset(ImageUtil.grayscaleImage(onStar), 0.77f)";
const RUNELITE_PLUGIN_LIST_ITEM_ON_ICON_SOURCE = "PluginListItem ON_SWITCHER/ON_STAR ImageUtil.recolorImage(..., ColorScheme.BRAND_RED)";
const RUNELITE_PLUGIN_LIST_ITEM_TOGGLE_SOURCE =
  "PluginListItem.attachToggleButtonListener plugin == null -> button.setVisible(false); startPlugin/stopPlugin then updateToggleButton";
const RUNELITE_PINNED_PLUGINS_CONFIG_SOURCE =
  "ConfigPanel getPinnedPluginNames runelite/pinnedPlugins CSV; savePinnedPlugins joins PluginListItem names via configManager.setConfiguration";
const RUNELITE_PINNED_PLUGINS_STORAGE_KEY = "runelite.pinnedPlugins";
const RUNELITE_CLIENT_SHELL_CONFIG_PLUGIN_ID = "client-shell";
const RUNELITE_LEGACY_CLIENT_SHELL_CONFIG_GROUP = ["open", "osrs"].join("");
const RUNELITE_CONFIG_MANAGER_SOURCE =
  "ConfigManager properties use group.key strings through getConfiguration/setConfiguration/unsetConfiguration";
const RUNELITE_PLUGIN_ENABLED_CONFIG_SOURCE =
  "PluginManager.setPluginEnabled stores runelite.<plugin class simple name lower-case>";
const RUNELITE_CONFIG_PROPERTIES_STORAGE_KEY = "runelite.config.properties";
const RUNELITE_CHAT_COLOR_CONFIG_SOURCE =
  "ConfigPanel.initializePluginList adds CHAT_COLOR_PLUGIN with ChatColorConfig @ConfigGroup(\"textrecolor\") PluginType.GENERAL_USE tags colour/messages";
const RUNELITE_CONFIG_COLOR_PICKER_SOURCE =
  "ConfigPanel Color.class existing null -> Color.BLACK JButton(\"Pick a color\"); existing -> ColorUtil.toHexColor(existing).toUpperCase(); RuneliteColorPicker on close changeConfiguration";
const RUNELITE_OVERLAY_MENU_SOURCE =
  "OverlayRenderer bounds.contains(mouse) -> createRightClickMenuEntries; menuEntryShift requires Shift unless inMenuEntryMode";
const RUNELITE_OVERLAY_CONFIG_CLICK_SOURCE =
  "ConfigPlugin.onOverlayMenuClicked RUNELITE_OVERLAY_CONFIG opens configPanel.openConfigurationPanel(descriptor.name())";
const RUNELITE_OVERLAY_DRAG_SOURCE =
  "OverlayRenderer Alt key inOverlayDraggingMode; left drag setPreferredLocation; right click resetOverlay; mouse release saveOverlay";
const RUNELITE_INFO_PANEL_LINK_SOURCE =
  "InfoPanel.buildLinkPanel MouseAdapter mousePressed/mouseReleased/mouseEntered/mouseExited callback";
const RUNELITE_INFO_PANEL_ACTION_TARGET_SOURCE =
  "InfoPanel actionsContainer.add buildLinkPanel(GITHUB/FOLDER/DISCORD/PATREON, LinkBrowser.browse/openLocalFile)";
const RUNELITE_PVP_TRACKER_NAV_BUTTON_SOURCE =
  "PvpPerformanceTrackerPlugin adds nav button when showFightHistoryPanel && (!restrictToLms || isAtLMS())";
const RUNELITE_PVP_TRACKER_OVERLAY_RENDER_SOURCE =
  "PvpPerformanceTrackerOverlay render returns null when !showFightOverlay || fight == null || !fightStarted || restrictToLms outside LMS";
const RUNELITE_PVP_TRACKER_OVERLAY_LINE_SOURCE =
  "PvpPerformanceTrackerOverlay.setLines rebuilds title, names, and statistic lines from config toggles";
const RUNELITE_PLUGIN_TYPE_DEFINED_ORDER: readonly string[] = [
  "important",
  "external",
  "pvm",
  "skilling",
  "pvp",
  "utility",
  "general-use"
];

interface RuneliteSidebarState {
  readonly activePanelId: RuneliteNavigationButtonId | null;
  readonly visiblePanelId: RuneliteNavigationButtonId | null;
  readonly isSidebarOpen: boolean;
}

interface RuneliteWindowSize {
  readonly width: number;
  readonly height: number;
}

interface RuneliteStretchedClientLayout {
  readonly enabled: boolean;
  readonly parentWidth: number;
  readonly parentHeight: number;
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly imageRendering?: CSSProperties["imageRendering"];
}

type RuneliteSidebarAction =
  | {
      readonly type: "toggleSidebar";
    }
  | {
      readonly type: "openPanel";
      readonly id: RuneliteNavigationButtonId;
    }
  | {
      readonly type: "navigationButtonClicked";
      readonly id: RuneliteNavigationButtonId;
    };

const RUNELITE_INITIAL_SIDEBAR_STATE: RuneliteSidebarState = {
  activePanelId: null,
  visiblePanelId: null,
  isSidebarOpen: true
};

function runeliteSidebarReducer(state: RuneliteSidebarState, action: RuneliteSidebarAction): RuneliteSidebarState {
  if (action.type === "toggleSidebar") {
    if (state.isSidebarOpen) {
      return {
        ...state,
        isSidebarOpen: false,
        visiblePanelId: null
      };
    }

    return {
      ...state,
      isSidebarOpen: true,
      visiblePanelId: state.activePanelId
    };
  }

  if (action.type === "openPanel") {
    return {
      activePanelId: action.id,
      visiblePanelId: action.id,
      isSidebarOpen: true
    };
  }

  if (state.isSidebarOpen && state.visiblePanelId === action.id) {
    return {
      ...state,
      activePanelId: null,
      visiblePanelId: null
    };
  }

  return {
    activePanelId: action.id,
    visiblePanelId: action.id,
    isSidebarOpen: true
  };
}

interface RuneliteConfigPluginListItemModel {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly pluginType: RunelitePluginType;
  readonly tags: readonly string[];
  readonly pinnedByDefault: boolean;
  readonly enabledByDefault: boolean;
  readonly pluginBacked: boolean;
  readonly configurable: boolean;
  readonly sourcePath: string;
}

interface RuneliteConfigTitleSectionModel {
  readonly keyName: string;
  readonly name: string;
  readonly description: string;
  readonly position: number;
}

interface RuneliteConfigSectionModel {
  readonly keyName: string;
  readonly name: string;
  readonly description: string;
  readonly position: number;
}

interface RuneliteConfigItemModel {
  readonly keyName: string;
  readonly name: string;
  readonly description: string;
  readonly position: number;
  readonly type: RuneliteConfigControlType;
  readonly defaultValue: RuneliteConfigValue;
  readonly titleSection?: string;
  readonly section?: string;
  readonly min?: number;
  readonly max?: number;
  readonly options?: readonly string[];
  readonly hidden?: boolean;
  readonly hideWhen?: readonly string[];
  readonly unhideWhen?: readonly string[];
  readonly hideValues?: readonly string[];
  readonly unhideValues?: readonly string[];
}

interface RuneliteConfigDescriptorModel {
  readonly id: string;
  readonly group: string;
  readonly sourcePath: string;
  readonly titleSections: readonly RuneliteConfigTitleSectionModel[];
  readonly sections: readonly RuneliteConfigSectionModel[];
  readonly items: readonly RuneliteConfigItemModel[];
}

interface RuneliteInfoActionModel {
  readonly id: string;
  readonly iconPath: string;
  readonly topText: string;
  readonly bottomText: string;
  readonly sourceTarget: string;
  readonly targetKind: "url" | "local-file";
  readonly resolvedTarget?: string;
}

const runeliteNavigationButtons: readonly RuneliteNavigationButtonModel[] = [
  {
    id: "configuration",
    tooltip: "Configuration",
    iconPath: "runelite-ui/config_icon.png",
    priority: 0,
    tab: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/config/ConfigPlugin.java"
  },
  {
    id: "pvp-fight-history",
    tooltip: "PvP Fight History",
    iconPath: "runelite-ui/skull_red.png",
    priority: 6,
    tab: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/pvpperformancetracker/PvpPerformanceTrackerPlugin.java"
  },
  {
    id: "pvp-tools",
    tooltip: "PvP Tools",
    iconPath: "runelite-plugins/pvptools/skull.png",
    priority: 5,
    tab: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/pvptools/PvpToolsPlugin.java"
  },
  {
    id: "supplies-tracker",
    tooltip: "Supplies Tracker",
    iconPath: "runelite-plugins/suppliestracker/panel_icon.png",
    priority: 5,
    tab: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/suppliestracker/SuppliesTrackerPlugin.java"
  },
  {
    id: "info",
    tooltip: "Info",
    iconPath: "runelite-ui/info_icon.png",
    priority: 9,
    tab: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/info/InfoPlugin.java"
  }
];

function compareRuneliteNavigationButtons(a: RuneliteNavigationButtonModel, b: RuneliteNavigationButtonModel): number {
  if (a.tab !== b.tab) {
    return a.tab ? -1 : 1;
  }

  return a.priority - b.priority || a.tooltip.localeCompare(b.tooltip);
}

function buildRuneliteToolbarEntries(buttons: readonly RuneliteNavigationButtonModel[]): readonly RuneliteToolbarEntry[] {
  const entries: RuneliteToolbarEntry[] = [];
  let isDelimited = false;

  for (const button of [...buttons].sort(compareRuneliteNavigationButtons)) {
    if (!button.tab && !isDelimited) {
      isDelimited = true;
      entries.push({ kind: "delimiter", id: "non-tab-delimiter" });
    }

    entries.push({ kind: "button", button });
  }

  return entries;
}

function runeliteNavigationButtonsForConfig(config: RuneliteClientConfigSnapshot): readonly RuneliteNavigationButtonModel[] {
  return runeliteNavigationButtons.filter((button) => {
    if (button.id === "pvp-fight-history") {
      return runelitePvpPerformanceTrackerNavigationButtonVisible(config.pvpPerformanceTracker);
    }

    if (button.id === "supplies-tracker") {
      return config.suppliesTracker.enabled;
    }

    if (button.id === "pvp-tools") {
      return config.pvpTools.enabled;
    }

    return true;
  });
}

function runelitePvpPerformanceTrackerNavigationButtonVisible(
  config: RunelitePvpPerformanceTrackerConfigSnapshot
): boolean {
  return config.enabled && config.showFightHistoryPanel && (!config.restrictToLms || config.inLastManStandingArea);
}

function runeliteTrainerAvailablePluginListItems(): readonly RuneliteConfigPluginListItemModel[] {
  return runeliteConfigPluginListItems.filter((item) => !RUNELITE_TRAINER_DISABLED_PLUGIN_IDS.has(item.id));
}

const runeliteInfoActions: readonly RuneliteInfoActionModel[] = [
  {
    id: "license",
    iconPath: "runelite-ui/github_icon.png",
    topText: "License info",
    bottomText: "for distribution",
    sourceTarget: "https://github.com/runelite-extended/runelite/blob/master/LICENSE",
    targetKind: "url",
    resolvedTarget: "https://github.com/runelite-extended/runelite/blob/master/LICENSE"
  },
  {
    id: "logs",
    iconPath: "runelite-ui/folder_icon.png",
    topText: "Open logs directory",
    bottomText: "(for bug reports)",
    sourceTarget: "RuneLite.LOGS_DIR",
    targetKind: "local-file"
  },
  {
    id: "discord",
    iconPath: "runelite-ui/discord_icon.png",
    topText: "Talk to us on our",
    bottomText: "discord server",
    sourceTarget: "https://discord.gg/HN5gf3m",
    targetKind: "url",
    resolvedTarget: "https://discord.gg/HN5gf3m"
  },
  {
    id: "patreon",
    iconPath: "runelite-ui/patreon_icon.png",
    topText: "Patreon to support",
    bottomText: "the NH Trainer project",
    sourceTarget: "RuneLiteProperties.getPatreonLink()",
    targetKind: "url",
    resolvedTarget: "about:blank"
  }
];

const runeliteConfigPluginListItems: readonly RuneliteConfigPluginListItemModel[] = [
  {
    id: RUNELITE_CLIENT_SHELL_CONFIG_PLUGIN_ID,
    name: "Client",
    description: "Client shell settings",
    pluginType: "important",
    tags: ["client"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: false,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/config/ConfigPanel.java"
  },
  {
    id: "runelite",
    name: "RuneLite",
    description: "RuneLite client settings",
    pluginType: "important",
    tags: ["client"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: false,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/config/ConfigPanel.java"
  },
  {
    id: "gpu",
    name: "GPU",
    description: "Utilizes the GPU",
    pluginType: "utility",
    tags: ["fog", "draw distance"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/gpu/GpuPlugin.java"
  },
  {
    id: RUNELITE_STRETCHED_MODE_PLUGIN_ID,
    name: "Stretched Mode",
    description: "Stretches the game in fixed and resizable modes.",
    pluginType: "utility",
    tags: ["resize", "ui", "interface", "stretch", "scaling", "fixed"],
    pinnedByDefault: false,
    // The source plugin is disabled by default; the trainer starts it enabled so the client-only window opens stretched as requested.
    enabledByDefault: true,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/stretchedmode/StretchedModePlugin.java"
  },
  {
    id: "animation-smoothing",
    name: "Animation Smoothing",
    description: "Show smoother player, NPC, and object animations",
    pluginType: "utility",
    tags: ["npcs", "objects", "players"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/animsmoothing/AnimationSmoothingPlugin.java"
  },
  {
    id: "anti-drag",
    name: "Anti Drag",
    description: "Prevent dragging an item for a specified delay",
    pluginType: "utility",
    tags: ["antidrag", "delay", "inventory", "items"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/antidrag/AntiDragPlugin.java"
  },
  {
    id: "custom-cursor",
    name: "Custom Cursor",
    description: "Replaces your mouse cursor image",
    pluginType: "utility",
    tags: ["cursor", "mouse"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/customcursor/CustomCursorPlugin.java"
  },
  {
    id: RUNELITE_KEY_REMAPPING_PLUGIN_ID,
    name: "Key Remapping",
    description: "Allows use of WASD keys for camera movement with 'Press Enter to Chat', and remapping number keys to F-keys",
    pluginType: "utility",
    tags: ["enter", "chat", "wasd", "camera"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/keyremapping/KeyRemappingPlugin.java"
  },
  {
    id: RUNELITE_MOUSE_HIGHLIGHT_PLUGIN_ID,
    name: "Mouse Tooltips",
    description: "Render default actions as a tooltip",
    pluginType: "utility",
    tags: ["actions", "overlay", "tooltip", "hide"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/mousehighlight/MouseHighlightPlugin.java"
  },
  {
    id: "entity-hider",
    name: "Entity Hider",
    description: "Hide players, NPCs, and/or projectiles",
    pluginType: "utility",
    tags: ["npcs", "players", "projectiles"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/entityhider/EntityHiderPlugin.java"
  },
  {
    id: RUNELITE_HIDE_UNDER_PLUGIN_ID,
    name: "Hide Under",
    description: "Hide local player when under targeted players",
    pluginType: "pvp",
    tags: ["hide", "local", "player", "under"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: false,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/hideunder/HideUnder.java"
  },
  {
    id: RUNELITE_PRAY_AGAINST_PLAYER_PLUGIN_ID,
    name: "Pray Against Player",
    description: "Use plugin in PvP situations for best results!!",
    pluginType: "pvp",
    tags: ["highlight", "pvp", "overlay", "players"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/prayagainstplayer/PrayAgainstPlayerPlugin.java"
  },
  {
    id: "timers",
    name: "Timers",
    description: "Show various timers in an infobox",
    pluginType: "utility",
    tags: ["combat", "items", "magic", "potions", "prayer", "overlay"],
    pinnedByDefault: false,
    enabledByDefault: true,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/timers/TimersPlugin.java"
  },
  {
    id: "freeze-timers",
    name: "Freeze Timers",
    description: "Shows a freeze timer overlay on players",
    pluginType: "pvp",
    tags: ["freeze", "timers", "barrage", "teleblock", "pklite"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/freezetimers/FreezeTimersPlugin.java"
  },
  {
    id: "spec-bar",
    name: "Spec Bar",
    description: "Adds a spec bar to every weapon",
    pluginType: "pvp",
    tags: ["spec bar", "special attack", "spec", "bar", "pklite"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: false,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/specbar/SpecBarPlugin.java"
  },
  {
    id: "attack-styles",
    name: "Attack Styles",
    description: "Show your current attack style as an overlay",
    pluginType: "utility",
    tags: ["combat", "defence", "magic", "overlay", "ranged", "strength", "warn", "pure"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/attackstyles/AttackStylesPlugin.java"
  },
  {
    id: "status-bars",
    name: "Status Bars",
    description: "Draws status bars next to players inventory showing currentValue and restore amounts",
    pluginType: "utility",
    tags: ["status", "hitpoints", "prayer", "run energy", "special attack"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/statusbars/StatusBarsPlugin.java"
  },
  {
    id: "status-orbs",
    name: "Status Orbs",
    description: "Configure settings for the Minimap orbs",
    pluginType: "utility",
    tags: ["minimap", "orb", "regen", "energy", "special"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/statusorbs/StatusOrbsPlugin.java"
  },
  {
    id: "supplies-tracker",
    name: "Supplies Used Tracker",
    description: "Tracks supplies used during the session",
    pluginType: "utility",
    tags: ["cost", "supplies", "tracker"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/suppliestracker/SuppliesTrackerPlugin.java"
  },
  {
    id: "pvp-tools",
    name: "PvP Tools",
    description: "Enable the PvP Tools panel",
    pluginType: "pvp",
    tags: ["panel", "pvp", "pk", "pklite", "renderself"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/pvptools/PvpToolsPlugin.java"
  },
  {
    id: "xp-drop",
    name: "XP Drop",
    description: "Enable customization of the way XP drops are displayed",
    pluginType: "utility",
    tags: ["experience", "levels", "tick"],
    pinnedByDefault: false,
    // Trainer extension: start the source-backed XP-drop plugin enabled so pre-hit NH damage calls are visible by default.
    enabledByDefault: true,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/experiencedrop/XpDropPlugin.java"
  },
  {
    id: "boosts-information",
    name: "Boosts Information",
    description: "Show combat and/or skill boost information",
    pluginType: "utility",
    tags: ["combat", "notifications", "skilling", "overlay"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/boosts/BoostsPlugin.java"
  },
  {
    id: "prayer",
    name: "Prayer",
    description: "Show various information related to prayer",
    pluginType: "utility",
    tags: ["combat", "flicking", "overlay"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/prayer/PrayerPlugin.java"
  },
  {
    id: "opponent-info",
    name: "Opponent Information",
    description: "Show name and hitpoints information about the NPC you are fighting",
    pluginType: "utility",
    tags: ["combat", "health", "hitpoints", "npcs", "overlay"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/opponentinfo/OpponentInfoPlugin.java"
  },
  {
    id: "player-indicators",
    name: "Player Indicators",
    description: "Highlight players on-screen and/or on the minimap",
    pluginType: "utility",
    tags: ["highlight", "minimap", "overlay", "players", "pklite"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/playerindicators/PlayerIndicatorsPlugin.java"
  },
  {
    id: "tile-indicators",
    name: "Tile Indicators",
    description: "Highlight the tile you are currently moving to",
    pluginType: "utility",
    tags: ["highlight", "overlay"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: true,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/tileindicators/TileIndicatorsPlugin.java"
  },
  {
    id: "pvp-performance-tracker",
    name: "PvP Performance Tracker",
    description: "",
    pluginType: "pvp",
    tags: ["pvp", "fight", "history"],
    pinnedByDefault: false,
    enabledByDefault: true,
    pluginBacked: true,
    configurable: true,
    sourcePath:
      "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/pvpperformancetracker/PvpPerformanceTrackerPlugin.java"
  },
  {
    id: "info-panel",
    name: "Info Panel",
    description: "Enable the Info panel",
    pluginType: "utility",
    tags: ["info"],
    pinnedByDefault: false,
    enabledByDefault: true,
    pluginBacked: true,
    configurable: false,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/info/InfoPlugin.java"
  },
  {
    id: "chat-color",
    name: "Chat Color",
    description: "Recolor chat text",
    pluginType: "general-use",
    tags: ["colour", "messages"],
    pinnedByDefault: false,
    enabledByDefault: false,
    pluginBacked: false,
    configurable: true,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/config/ChatColorConfig.java"
  }
];

const runeliteChatColorConfigItems: readonly RuneliteConfigItemModel[] = [
  {
    keyName: "opaquePublicChat",
    name: "Public chat",
    description: "Color of Public chat",
    position: 31,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaquePublicChatHighlight",
    name: "Public chat highlight",
    description: "Color of highlights in Public chat",
    position: 32,
    type: "color",
    defaultValue: "#000000"
  },
  {
    keyName: "opaquePrivateMessageSent",
    name: "Sent private messages",
    description: "Color of Private messages you've sent",
    position: 33,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaquePrivateMessageSentHighlight",
    name: "Sent private messages highlight",
    description: "Color of highlights in Private messages you've sent",
    position: 34,
    type: "color",
    defaultValue: "#002783"
  },
  {
    keyName: "opaquePrivateMessageReceived",
    name: "Received private messages",
    description: "Color of Private messages you've received",
    position: 35,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaquePrivateMessageReceivedHighlight",
    name: "Received private messages highlight",
    description: "Color of highlights in Private messages you've received",
    position: 36,
    type: "color",
    defaultValue: "#002783"
  },
  {
    keyName: "opaqueClanChatInfo",
    name: "Clan chat info",
    description: "Clan Chat Information (eg. when joining a channel)",
    position: 37,
    type: "color",
    defaultValue: "#000000"
  },
  {
    keyName: "opaqueClanChatInfoHighlight",
    name: "Clan chat info highlight",
    description: "Clan Chat Information highlight (used for the Raids plugin)",
    position: 38,
    type: "color",
    defaultValue: "#FF0000"
  },
  {
    keyName: "opaqueClanChatMessage",
    name: "Clan chat message",
    description: "Color of Clan Chat Messages",
    position: 39,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaqueClanChatMessageHighlight",
    name: "Clan chat message highlight",
    description: "Color of highlights in Clan Chat Messages",
    position: 40,
    type: "color",
    defaultValue: "#000000"
  },
  {
    keyName: "opaqueAutochatMessage",
    name: "Autochat",
    description: "Color of Autochat messages",
    position: 41,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaqueAutochatMessageHighlight",
    name: "Autochat highlight",
    description: "Color of highlights in Autochat messages",
    position: 42,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaqueTradeChatMessage",
    name: "Trade chat",
    description: "Color of Trade Chat Messages",
    position: 43,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaqueTradeChatMessageHighlight",
    name: "Trade chat highlight",
    description: "Color of highlights in Trade Chat Messages",
    position: 44,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaqueServerMessage",
    name: "Server message",
    description: "Color of Server Messages (eg. 'Welcome to Runescape')",
    position: 45,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaqueServerMessageHighlight",
    name: "Server message highlight",
    description: "Color of highlights in Server Messages",
    position: 46,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaqueGameMessage",
    name: "Game message",
    description: "Color of Game Messages",
    position: 47,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaqueGameMessageHighlight",
    name: "Game message highlight",
    description: "Color of highlights in Game Messages",
    position: 48,
    type: "color",
    defaultValue: "#EF1020"
  },
  {
    keyName: "opaqueExamine",
    name: "Examine",
    description: "Color of Examine Text",
    position: 49,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaqueExamineHighlight",
    name: "Examine highlight",
    description: "Color of highlights in Examine Text",
    position: 50,
    type: "color",
    defaultValue: "#0000FF"
  },
  {
    keyName: "opaqueFiltered",
    name: "Filtered",
    description: "Color of Filtered Text (messages that aren't shown when Game messages are filtered)",
    position: 51,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaqueFilteredHighlight",
    name: "Filtered highlight",
    description: "Color of highlights in Filtered Text",
    position: 52,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaqueUsername",
    name: "Usernames",
    description: "Color of Usernames",
    position: 53,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaquePrivateUsernames",
    name: "Private chat usernames",
    description: "Color of Usernames in Private Chat",
    position: 54,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaqueClanChannelName",
    name: "Clan channel name",
    description: "Color of Clan Channel Name",
    position: 55,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaqueClanUsernames",
    name: "Clan usernames",
    description: "Color of Usernames in Clan Chat",
    position: 56,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "opaquePublicFriendUsernames",
    name: "Public friend usernames",
    description: "Color of Friend Usernames in Public Chat",
    position: 57,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentPublicChat",
    name: "Public chat (transparent)",
    description: "Color of Public chat (transparent)",
    position: 61,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentPublicChatHighlight",
    name: "Public chat highlight (transparent)",
    description: "Color of highlights in Public chat (transparent)",
    position: 62,
    type: "color",
    defaultValue: "#FFFFFF"
  },
  {
    keyName: "transparentPrivateMessageSent",
    name: "Sent private messages (transparent)",
    description: "Color of Private messages you've sent (transparent)",
    position: 63,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentPrivateMessageSentHighlight",
    name: "Sent private messages highlight (transparent)",
    description: "Color of highlights in Private messages you've sent (transparent)",
    position: 64,
    type: "color",
    defaultValue: "#FFFFFF"
  },
  {
    keyName: "transparentPrivateMessageReceived",
    name: "Received private messages (transparent)",
    description: "Color of Private messages you've received (transparent)",
    position: 65,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentPrivateMessageReceivedHighlight",
    name: "Received private messages highlight (transparent)",
    description: "Color of highlights in Private messages you've received (transparent)",
    position: 66,
    type: "color",
    defaultValue: "#FFFFFF"
  },
  {
    keyName: "transparentClanChatInfo",
    name: "Clan chat info (transparent)",
    description: "Clan Chat Information (eg. when joining a channel) (transparent)",
    position: 67,
    type: "color",
    defaultValue: "#FFFFFF"
  },
  {
    keyName: "transparentClanChatInfoHighlight",
    name: "Clan chat info highlight (transparent)",
    description: "Clan Chat Information highlight (used for the Raids plugin) (transparent)",
    position: 68,
    type: "color",
    defaultValue: "#FF0000"
  },
  {
    keyName: "transparentClanChatMessage",
    name: "Clan chat message (transparent)",
    description: "Color of Clan Chat Messages (transparent)",
    position: 69,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentClanChatMessageHighlight",
    name: "Clan chat message highlight (transparent)",
    description: "Color of highlights in Clan Chat Messages (transparent)",
    position: 70,
    type: "color",
    defaultValue: "#FFFFFF"
  },
  {
    keyName: "transparentAutochatMessage",
    name: "Autochat (transparent)",
    description: "Color of Autochat messages (transparent)",
    position: 71,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentAutochatMessageHighlight",
    name: "Autochat highlight",
    description: "Color of highlights in Autochat messages (transparent)",
    position: 72,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentTradeChatMessage",
    name: "Trade chat (transparent)",
    description: "Color of Trade Chat Messages (transparent)",
    position: 73,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentTradeChatMessageHighlight",
    name: "Trade chat highlight",
    description: "Color of highlights in Trade Chat Messages (transparent)",
    position: 74,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentServerMessage",
    name: "Server message (transparent)",
    description: "Color of Server Messages (eg. 'Welcome to Runescape') (transparent)",
    position: 75,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentServerMessageHighlight",
    name: "Server message highlight",
    description: "Color of highlights in Server Messages",
    position: 76,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentGameMessage",
    name: "Game message (transparent)",
    description: "Color of Game Messages (transparent)",
    position: 77,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentGameMessageHighlight",
    name: "Game message highlight (transparent)",
    description: "Color of highlights in Game Messages (transparent)",
    position: 78,
    type: "color",
    defaultValue: "#EF1020"
  },
  {
    keyName: "transparentExamine",
    name: "Examine (transparent)",
    description: "Color of Examine Text (transparent)",
    position: 79,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentExamineHighlight",
    name: "Examine highlight",
    description: "Color of highlights in Examine Text",
    position: 80,
    type: "color",
    defaultValue: "#00FF00"
  },
  {
    keyName: "transparentFiltered",
    name: "Filtered (transparent)",
    description: "Color of Filtered Text (messages that aren't shown when Game messages are filtered) (transparent)",
    position: 81,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentFilteredHighlight",
    name: "Filtered highlight",
    description: "Color of highlights in Filtered Text",
    position: 82,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentUsername",
    name: "Usernames (transparent)",
    description: "Color of Usernames (transparent)",
    position: 83,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentPrivateUsernames",
    name: "Private chat usernames (transparent)",
    description: "Color of Usernames in Private Chat (transparent)",
    position: 84,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentClanChannelName",
    name: "Clan channel name (transparent)",
    description: "Color of Clan Channel Name (transparent)",
    position: 85,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentClanUsernames",
    name: "Clan usernames",
    description: "Color of Usernames in Clan Chat",
    position: 86,
    type: "color",
    defaultValue: ""
  },
  {
    keyName: "transparentPublicFriendUsernames",
    name: "Public friend usernames (transparent)",
    description: "Color of Friend Usernames in Public Chat",
    position: 87,
    type: "color",
    defaultValue: ""
  }
];

const runeliteConfigDescriptors: readonly RuneliteConfigDescriptorModel[] = [
  {
    id: RUNELITE_CLIENT_SHELL_CONFIG_PLUGIN_ID,
    group: RUNELITE_CLIENT_SHELL_CONFIG_PLUGIN_ID,
    sourcePath: "NH Trainer/client-shell/settings",
    titleSections: [
      { keyName: "pluginSortingTitle", name: "Sorting", description: "", position: 65 },
      { keyName: "hidePluginsTitle", name: "Hide By Type", description: "", position: 89 },
      { keyName: "pluginsColorTitle", name: "Colors", description: "", position: 190 },
      { keyName: "externalPluginsTitle", name: "External", description: "", position: 256 },
      { keyName: "opacityTitle", name: "Opacity", description: "", position: 280 },
      { keyName: "miscTitle", name: "Miscellaneous", description: "", position: 319 }
    ],
    sections: [],
    items: [
      {
        keyName: "pluginSortMode",
        name: "Sorting mode",
        description: "Sorting mode for plugin list",
        position: 78,
        type: "enum",
        titleSection: "pluginSortingTitle",
        defaultValue: "Category",
        options: ["Category", "Alphabetically"]
      },
      {
        keyName: "hidePlugins",
        name: "Hide All Plugins",
        description: "Hide plugins in the plugin list",
        position: 102,
        type: "boolean",
        titleSection: "hidePluginsTitle",
        defaultValue: false,
        hideWhen: ["hideExternalPlugins", "hidePvmPlugins", "hideSkillingPlugins", "hidePvpPlugins", "hideUtilityPlugins"]
      },
      {
        keyName: "hideExternalPlugins",
        name: "Hide External Plugins",
        description: "Hide External plugins in the plugin list",
        position: 118,
        type: "boolean",
        titleSection: "hidePluginsTitle",
        defaultValue: false,
        hideWhen: ["hidePlugins"]
      },
      {
        keyName: "hidePvmPlugins",
        name: "Hide PvM Plugins",
        description: "Hide PvM plugins in the plugin list",
        position: 134,
        type: "boolean",
        titleSection: "hidePluginsTitle",
        defaultValue: false,
        hideWhen: ["hidePlugins"]
      },
      {
        keyName: "hideSkillingPlugins",
        name: "Hide Skilling Plugins",
        description: "Hide Skilling plugins in the plugin list",
        position: 150,
        type: "boolean",
        titleSection: "hidePluginsTitle",
        defaultValue: false,
        hideWhen: ["hidePlugins"]
      },
      {
        keyName: "hidePvpPlugins",
        name: "Hide PvP Plugins",
        description: "Hide PvP plugins in the plugin list",
        position: 166,
        type: "boolean",
        titleSection: "hidePluginsTitle",
        defaultValue: false,
        hideWhen: ["hidePlugins"]
      },
      {
        keyName: "hideUtilityPlugins",
        name: "Hide Utility Plugins",
        description: "Hide Utility plugins in the plugin list",
        position: 182,
        type: "boolean",
        titleSection: "hidePluginsTitle",
        defaultValue: false,
        hideWhen: ["hidePlugins"]
      },
      {
        keyName: "externalColor",
        name: "External color",
        description: "Configure the color of external plugins",
        position: 197,
        type: "color",
        titleSection: "pluginsColorTitle",
        defaultValue: "#B19CD9"
      },
      {
        keyName: "pvmColor",
        name: "PVM color",
        description: "Configure the color of PVM related plugins",
        position: 213,
        type: "color",
        titleSection: "pluginsColorTitle",
        defaultValue: "#77DD77"
      },
      {
        keyName: "pvpColor",
        name: "PVP color",
        description: "Configure the color of PVP related plugins",
        position: 229,
        type: "color",
        titleSection: "pluginsColorTitle",
        defaultValue: "#FF6961"
      },
      {
        keyName: "skillingColor",
        name: "Skilling color",
        description: "Configure the color of Skilling related plugins",
        position: 245,
        type: "color",
        titleSection: "pluginsColorTitle",
        defaultValue: "#FCFC64"
      },
      {
        keyName: "utilityColor",
        name: "Utility color",
        description: "Configure the color of Utility related plugins",
        position: 261,
        type: "color",
        titleSection: "pluginsColorTitle",
        defaultValue: "#90D4ED"
      },
      {
        keyName: "enablePlugins",
        name: "Enable loading of external plugins",
        description: "Enables loading of external plugins",
        position: 268,
        type: "boolean",
        titleSection: "externalPluginsTitle",
        defaultValue: false
      },
      {
        keyName: "enableOpacity",
        name: "Enable opacity",
        description: "Enables opacity for the whole window.",
        position: 291,
        type: "boolean",
        titleSection: "opacityTitle",
        defaultValue: false
      },
      {
        keyName: "opacityPercentage",
        name: "Opacity percentage",
        description: "Percentage value used for client opacity",
        position: 307,
        type: "range",
        titleSection: "opacityTitle",
        defaultValue: 100,
        min: 15,
        max: 100
      },
      {
        keyName: "keyboardPin",
        name: "Keyboard bank pin",
        description: "Allows you to enter your bank pin using your keyboard",
        position: 330,
        type: "boolean",
        titleSection: "miscTitle",
        defaultValue: true
      }
    ]
  },
  {
    id: "runelite",
    group: "runelite",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/config/RuneLiteConfig.java",
    titleSections: [
      { keyName: "uiTitle", name: "User interface", description: "", position: 35 },
      { keyName: "miscTitle", name: "Miscellaneous", description: "", position: 120 },
      { keyName: "notificationsTitle", name: "Notifications", description: "", position: 180 },
      { keyName: "overlayTitle", name: "Overlays", description: "", position: 310 },
      { keyName: "infoboxTitle", name: "Infoboxes", description: "", position: 330 }
    ],
    sections: [],
    items: [
      {
        keyName: "automaticResizeType",
        name: "Resize type",
        description: "Choose how the window should resize when opening and closing panels",
        position: 58,
        type: "enum",
        titleSection: "uiTitle",
        defaultValue: "Keep game size",
        options: ["Keep window size", "Keep game size"]
      },
      {
        keyName: "lockWindowSize",
        name: "Lock window size",
        description: "Lock client window size",
        position: 70,
        type: "boolean",
        titleSection: "uiTitle",
        defaultValue: false
      },
      {
        keyName: "containInScreen2",
        name: "Contain in screen",
        description: "Makes the client stay contained in the screen when attempted to move out of it.",
        position: 82,
        type: "enum",
        titleSection: "uiTitle",
        defaultValue: "RESIZING",
        options: ["ALWAYS", "RESIZING", "NEVER"]
      },
      {
        keyName: "uiEnableCustomChrome",
        name: "Enable custom window chrome",
        description: "Enable custom window chrome",
        position: 95,
        type: "boolean",
        titleSection: "uiTitle",
        defaultValue: true
      },
      {
        keyName: "usernameInTitle",
        name: "Show display name in title",
        description: "Show display name in the window title",
        position: 108,
        type: "boolean",
        titleSection: "uiTitle",
        defaultValue: true
      },
      {
        keyName: "rememberScreenBounds",
        name: "Remember client position",
        description: "Remember client window bounds",
        position: 131,
        type: "boolean",
        titleSection: "miscTitle",
        defaultValue: true
      },
      {
        keyName: "gameAlwaysOnTop",
        name: "Enable client always on top",
        description: "The game will always be on the top of the screen",
        position: 143,
        type: "boolean",
        titleSection: "miscTitle",
        defaultValue: false
      },
      {
        keyName: "warningOnExit",
        name: "Display warning on exit",
        description: "Display warning on client exit",
        position: 155,
        type: "enum",
        titleSection: "miscTitle",
        defaultValue: "Logged in",
        options: ["Always", "Never", "Logged in"]
      },
      {
        keyName: "volume",
        name: "Runelite Volume",
        description: "RuneLite notification volume",
        position: 168,
        type: "range",
        titleSection: "miscTitle",
        defaultValue: 100,
        min: 0,
        max: 100
      },
      {
        keyName: "notificationTray",
        name: "Enable tray notifications",
        description: "Enable tray notifications",
        position: 191,
        type: "boolean",
        titleSection: "notificationsTitle",
        defaultValue: true
      },
      {
        keyName: "notificationFocused",
        name: "Send notifications when focused",
        description: "Send notifications when the client is focused",
        position: 251,
        type: "boolean",
        titleSection: "notificationsTitle",
        defaultValue: false
      },
      {
        keyName: "menuEntryShift",
        name: "Require Shift for overlay menu",
        description: "Require shift for overlay menu entries",
        position: 320,
        type: "boolean",
        titleSection: "overlayTitle",
        defaultValue: true
      },
      {
        keyName: "infoBoxVertical",
        name: "Display infoboxes vertically",
        description: "Toggles the infoboxes to display vertically",
        position: 344,
        type: "boolean",
        titleSection: "infoboxTitle",
        defaultValue: false
      },
      {
        keyName: "infoBoxWrap",
        name: "Infobox wrap count",
        description: "Configures the amount of infoboxes shown before wrapping",
        position: 357,
        type: "range",
        titleSection: "infoboxTitle",
        defaultValue: 4,
        min: 1,
        max: 10
      },
      {
        keyName: "infoBoxSize",
        name: "Infobox size (px)",
        description: "Configures the size of each infobox in pixels",
        position: 357,
        type: "range",
        titleSection: "infoboxTitle",
        defaultValue: 35,
        min: 16,
        max: 64
      }
    ]
  },
  {
    id: RUNELITE_STRETCHED_MODE_PLUGIN_ID,
    group: "stretchedmode",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/stretchedmode/StretchedModeConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "keepAspectRatio",
        name: "Keep aspect ratio",
        description: "Keeps the aspect ratio when stretching.",
        position: 1,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "increasedPerformance",
        name: "Increased performance mode",
        description: "Uses a fast algorithm when stretching, lowering quality but increasing performance.",
        position: 2,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "integerScaling",
        name: "Integer Scaling",
        description: "Forces use of a whole number scale factor when stretching.",
        position: 3,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "scalingFactor",
        name: "Resizable Scaling (%)",
        description: "In resizable mode, the game is reduced in size this much before it's stretched.",
        position: 4,
        type: "range",
        defaultValue: 50,
        min: 0,
        max: 100
      }
    ]
  },
  {
    id: "chat-color",
    group: "textrecolor",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/config/ChatColorConfig.java",
    titleSections: [],
    sections: [],
    items: runeliteChatColorConfigItems
  },
  {
    id: "entity-hider",
    group: "entityhider",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/entityhider/EntityHiderConfig.java",
    titleSections: [
      { keyName: "playersTitle", name: "Other players", description: "", position: 1 },
      { keyName: "localPlayerTitle", name: "Local player", description: "", position: 6 },
      { keyName: "friendsTitle", name: "Friends / clan", description: "", position: 9 },
      { keyName: "npcsTitle", name: "NPCs", description: "", position: 12 },
      { keyName: "miscTitle", name: "Miscellaneous", description: "", position: 18 }
    ],
    sections: [],
    items: [
      {
        keyName: "hidePlayers",
        name: "Hide Players",
        description: "Configures whether or not players are hidden",
        position: 2,
        type: "boolean",
        titleSection: "playersTitle",
        defaultValue: true
      },
      {
        keyName: "hidePlayers2D",
        name: "Hide Players 2D",
        description: "Configures whether or not players 2D elements are hidden",
        position: 3,
        type: "boolean",
        titleSection: "playersTitle",
        defaultValue: true
      },
      {
        keyName: "hideSpecificPlayers",
        name: "Hide Specific Players",
        description: "Hides players you never wish to see.",
        position: 4,
        type: "text",
        titleSection: "playersTitle",
        defaultValue: ""
      },
      {
        keyName: "hideAttackers",
        name: "Hide Attackers",
        description: "Configures whether or not NPCs/players attacking you are hidden",
        position: 5,
        type: "boolean",
        titleSection: "playersTitle",
        defaultValue: false
      },
      {
        keyName: "hideLocalPlayer",
        name: "Hide Local Player",
        description: "Configures whether or not the local player is hidden",
        position: 7,
        type: "boolean",
        titleSection: "localPlayerTitle",
        defaultValue: false
      },
      {
        keyName: "hideLocalPlayer2D",
        name: "Hide Local Player 2D",
        description: "Configures whether or not the local player's 2D elements are hidden",
        position: 8,
        type: "boolean",
        titleSection: "localPlayerTitle",
        defaultValue: false
      },
      {
        keyName: "hideFriends",
        name: "Hide Friends",
        description: "Configures whether or not friends are hidden",
        position: 10,
        type: "boolean",
        titleSection: "friendsTitle",
        defaultValue: false
      },
      {
        keyName: "hideClanMates",
        name: "Hide Clan Mates",
        description: "Configures whether or not clan mates are hidden",
        position: 11,
        type: "boolean",
        titleSection: "friendsTitle",
        defaultValue: false
      },
      {
        keyName: "hideNPCs",
        name: "Hide NPCs",
        description: "Configures whether or not NPCs are hidden",
        position: 13,
        type: "boolean",
        titleSection: "npcsTitle",
        defaultValue: false
      },
      {
        keyName: "hideNPCs2D",
        name: "Hide NPCs 2D",
        description: "Configures whether or not NPCs 2D elements are hidden",
        position: 14,
        type: "boolean",
        titleSection: "npcsTitle",
        defaultValue: false
      },
      {
        keyName: "hideNPCsNames",
        name: "Hide NPCs Names",
        description: "Configures which NPCs to hide",
        position: 15,
        type: "text",
        titleSection: "npcsTitle",
        defaultValue: ""
      },
      {
        keyName: "hideDeadNPCs",
        name: "Hide Dead NPCs",
        description: "Configures whether or not NPCs that just died are hidden",
        position: 16,
        type: "boolean",
        titleSection: "npcsTitle",
        defaultValue: false
      },
      {
        keyName: "hideNPCsOnDeath",
        name: "Hide NPCs On Death",
        description: "Configures which NPCs to hide when they die",
        position: 17,
        type: "text",
        titleSection: "npcsTitle",
        defaultValue: ""
      },
      {
        keyName: "hideProjectiles",
        name: "Hide Projectiles",
        description: "Configures whether or not projectiles are hidden",
        position: 19,
        type: "boolean",
        titleSection: "miscTitle",
        defaultValue: false
      }
    ]
  },
  {
    id: "gpu",
    group: "gpu",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/gpu/GpuPluginConfig.java",
    titleSections: [
      { keyName: "drawingTitle", name: "Drawing", description: "", position: 1 },
      { keyName: "ppTitle", name: "Post processing", description: "", position: 4 },
      { keyName: "fogTitle", name: "Fog", description: "", position: 7 }
    ],
    sections: [],
    items: [
      {
        keyName: "drawDistance",
        name: "Draw Distance",
        description: "Draw distance",
        position: 2,
        type: "range",
        titleSection: "drawingTitle",
        defaultValue: 25,
        min: 20,
        max: 90
      },
      {
        keyName: "smoothBanding",
        name: "Remove Color Banding",
        description: "Smooths out the color banding that is present in the CPU renderer",
        position: 3,
        type: "boolean",
        titleSection: "drawingTitle",
        defaultValue: false
      },
      {
        keyName: "antiAliasingMode",
        name: "Anti Aliasing",
        description: "Configures the anti-aliasing mode",
        position: 5,
        type: "enum",
        titleSection: "ppTitle",
        defaultValue: "Disabled",
        options: ["Disabled", "MSAA x2", "MSAA x4", "MSAA x8", "MSAA x16"]
      },
      {
        keyName: "anisotropicFilteringMode",
        name: "Anisotropic Filtering",
        description: "Configures the anisotropic filtering mode",
        position: 6,
        type: "enum",
        titleSection: "ppTitle",
        defaultValue: "Disabled",
        options: ["Disabled", "Bilinear", "Trilinear", "x2", "x4", "x8", "x16"]
      },
      {
        keyName: "fogDepth",
        name: "Depth",
        description: "Distance from the scene edge the fog starts",
        position: 8,
        type: "range",
        titleSection: "fogTitle",
        defaultValue: 30,
        min: 0,
        max: 100
      },
      {
        keyName: "fogCircularity",
        name: "Roundness",
        description: "Fog circularity in %",
        position: 9,
        type: "range",
        titleSection: "fogTitle",
        defaultValue: 30,
        min: 0,
        max: 100
      },
      {
        keyName: "fogDensity",
        name: "Density",
        description: "Relative fog thickness",
        position: 10,
        type: "range",
        titleSection: "fogTitle",
        defaultValue: 10,
        min: 0,
        max: 100
      }
    ]
  },
  {
    id: "animation-smoothing",
    group: "animationSmoothing",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/animsmoothing/AnimationSmoothingConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "smoothPlayerAnimations",
        name: "Smooth Player Animations",
        description: "Configures whether the player animations are smooth or not",
        position: 1,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "smoothNpcAnimations",
        name: "Smooth NPC Animations",
        description: "Configures whether the npc animations are smooth or not",
        position: 2,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "smoothObjectAnimations",
        name: "Smooth Object Animations",
        description: "Configures whether the object animations are smooth or not",
        position: 3,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "smoothWidgetAnimations",
        name: "Smooth Widget Animations",
        description: "Configures whether the widget animations are smooth or not",
        position: 4,
        type: "boolean",
        defaultValue: true
      }
    ]
  },
  {
    id: "pvp-performance-tracker",
    group: "pvpperformancetracker",
    sourcePath:
      "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/pvpperformancetracker/PvpPerformanceTrackerConfig.java",
    titleSections: [],
    sections: [
      {
        keyName: "overlay",
        name: "Overlay (5 lines max)",
        description: "Contains overlay settings (MAX of 5 lines allowed)",
        position: 2000
      },
      {
        keyName: "gearAmmo",
        name: "Gear/Ammo",
        description: "Contains gear/ammo settings for fights outside LMS",
        position: 11000
      },
      {
        keyName: "levels",
        name: "Levels",
        description: "Contains level settings for fights outside of LMS (including boosts)",
        position: 15000
      }
    ],
    items: [
      {
        keyName: "settingsConfigured",
        name: "I have verified my settings",
        description: "Some settings affect damage calculations, and every player should set them based on how they're pking.",
        position: -1,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "restrictToLms",
        name: "Restrict to LMS",
        description: "Restricts functionality and visibility to the LMS areas & its lobby (Ferox Enclave).",
        position: 100,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "showFightHistoryPanel",
        name: "Show Fight History Panel",
        description: "Enables the side-panel which displays previous fight's statistics.",
        position: 1000,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "robeHitFilter",
        name: "Hits on Robes Filter",
        description: "Which part of the robe to count hits on: bottom, top, both, or either.",
        position: 1100,
        type: "enum",
        defaultValue: "EITHER",
        options: ["BOTTOM", "TOP", "BOTH", "EITHER"]
      },
      {
        keyName: "showFightOverlay",
        name: "Show Fight Overlay",
        description: "Display an overlay of statistics while fighting.",
        position: 2000,
        section: "overlay",
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "showOverlayTitle",
        name: "Overlay: Show Title",
        description: "The overlay will have a title to display that it is PvP Performance.",
        position: 4000,
        section: "overlay",
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "showOverlayNames",
        name: "Overlay: Show Names",
        description: "The overlay will display names.",
        position: 5000,
        section: "overlay",
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "showOverlayOffPray",
        name: "Overlay: Show Off-Pray",
        description: "The overlay will display off-pray stats as a fraction & percentage.",
        position: 6000,
        section: "overlay",
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "showOverlayDeservedDmg",
        name: "Overlay: Show Expected Dmg",
        description: "The overlay will display expected damage & difference.",
        position: 7000,
        section: "overlay",
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "showOverlayDmgDealt",
        name: "Overlay: Show Dmg Dealt",
        description: "The overlay will display damage dealt.",
        position: 8000,
        section: "overlay",
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "showOverlayMagicHits",
        name: "Overlay: Show Magic Hits",
        description: "The overlay will display successful magic hits and expected magic hits.",
        position: 9000,
        section: "overlay",
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "showOverlayOffensivePray",
        name: "Overlay: Show Offensive Pray",
        description: "The overlay will display offensive pray stats.",
        position: 10000,
        section: "overlay",
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "showOverlayHpHealed",
        name: "Overlay: Show HP Healed",
        description: "The overlay will display hitpoints healed.",
        position: 10500,
        section: "overlay",
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "showOverlayRobeHits",
        name: "Overlay: Show Hits on Robes",
        description: "The overlay will display hits on robes ratio.",
        position: 10700,
        section: "overlay",
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "showOverlayTotalKoChance",
        name: "Overlay: Show Total KO Chance",
        description: "The overlay will display total KO chances and sum percentage.",
        position: 10800,
        section: "overlay",
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "showOverlayLastKoChance",
        name: "Overlay: Show Last KO Chance",
        description: "The overlay will display the last KO chance percentage.",
        position: 10900,
        section: "overlay",
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "showOverlayGhostBarrage",
        name: "Overlay: Show Ghost Barrage",
        description: "(Advanced): The overlay will display ghost barrage stats.",
        position: 10950,
        section: "overlay",
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "ringChoice",
        name: "Ring Used",
        description: "Rings used for the expected damage calculations outside of LMS.",
        position: 11000,
        section: "gearAmmo",
        type: "enum",
        defaultValue: "Berserker Ring",
        options: [
          "Seers Ring",
          "Archers Ring",
          "Berserker Ring",
          "Ring of Suffering",
          "Seers Ring (i)",
          "Archers Ring (i)",
          "Berserker Ring (i)",
          "Ring of Suffering (i)",
          "Brimstone Ring",
          "Magus ring",
          "Venator ring",
          "Bellator ring",
          "Ultor ring",
          "Ring of Shadows",
          "None"
        ]
      },
      {
        keyName: "strongBoltChoice",
        name: "ACB/DCB/DHCB Ammo",
        description: "Bolts used for ACB/DCB/DHCB's expected damage calculation.",
        position: 13000,
        section: "gearAmmo",
        type: "enum",
        defaultValue: "Diamond DBolts (e)",
        options: ["Runite Bolts", "Dstone Bolts (e)", "Diamond Bolts (e)", "Dstone DBolts (e)", "Opal DBolts (e)", "Diamond DBolts (e)"]
      },
      {
        keyName: "attackLevel",
        name: "Attack Level",
        description: "Attack level used for the expected damage calculations outside of LMS (includes potion boost).",
        position: 16000,
        section: "levels",
        type: "range",
        defaultValue: 118,
        min: 1,
        max: 120
      },
      {
        keyName: "strengthLevel",
        name: "Strength Level",
        description: "Strength level used for the expected damage calculations outside of LMS (includes potion boost).",
        position: 17000,
        section: "levels",
        type: "range",
        defaultValue: 118,
        min: 1,
        max: 120
      },
      {
        keyName: "rangedLevel",
        name: "Ranged Level",
        description: "Ranged level used for the expected damage calculations outside of LMS (includes potion boost).",
        position: 19000,
        section: "levels",
        type: "range",
        defaultValue: 112,
        min: 1,
        max: 120
      },
      {
        keyName: "magicLevel",
        name: "Magic Level",
        description: "Magic level used for the expected damage calculations outside of LMS (includes potion boost).",
        position: 20000,
        section: "levels",
        type: "range",
        defaultValue: 99,
        min: 1,
        max: 120
      },
      {
        keyName: "fightHistoryRenderLimit",
        name: "Max Rendered Fights",
        description: "Maximum number of previous fights to be displayed and searchable in the fight history side-panel.",
        position: 20500,
        type: "range",
        defaultValue: 200,
        min: 1,
        max: 1000
      }
    ]
  },
  {
    id: "anti-drag",
    group: "antiDrag",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/antidrag/AntiDragConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "alwaysOn",
        name: "Always On",
        description: "Makes the anti-drag always active and disables the hotkey toggle",
        position: 0,
        type: "boolean",
        defaultValue: false,
        hideWhen: ["toggleKeyBind", "holdKeyBind"]
      },
      {
        keyName: "toggleKeyBind",
        name: "Toggle with Keybind",
        description: "Toggle anti drag on and off, rather than always on.",
        position: 1,
        type: "boolean",
        defaultValue: false,
        hideWhen: ["alwaysOn", "holdKeyBind"]
      },
      {
        keyName: "holdKeyBind",
        name: "Hold with Keybind",
        description: "Hold anti drag key to turn it on, rather than toggle it on or off.",
        position: 2,
        type: "boolean",
        defaultValue: false,
        hideWhen: ["alwaysOn", "toggleKeyBind"]
      },
      {
        keyName: "key",
        name: "Keybind",
        description: "The keybind you want to use for antidrag",
        position: 3,
        type: "text",
        defaultValue: "Shift",
        hidden: true,
        unhideWhen: ["toggleKeyBind", "holdKeyBind"]
      },
      {
        keyName: "dragDelay",
        name: "Drag Delay",
        description: "Configures the inventory drag delay in client ticks (20ms)",
        position: 4,
        type: "range",
        defaultValue: RUNELITE_ANTI_DRAG_ONE_GAME_TICK_DELAY_CLIENT_TICKS,
        min: 0,
        max: 60
      },
      {
        keyName: "reqFocus",
        name: "Reset on focus loss",
        description: "Disable antidrag when losing focus (like alt tabbing)",
        position: 5,
        type: "boolean",
        defaultValue: false,
        hidden: true,
        unhideWhen: ["toggleKeyBind", "holdKeyBind"]
      },
      {
        keyName: "overlay",
        name: "Enable overlay",
        description: "Do you really need a description?",
        position: 6,
        type: "boolean",
        defaultValue: false,
        hidden: true,
        unhideWhen: ["toggleKeyBind", "holdKeyBind"]
      },
      {
        keyName: "color",
        name: "Overlay color",
        description: "Change the overlay color, duh",
        position: 7,
        type: "color",
        defaultValue: "rgba(255, 0, 0, 0.12)",
        hidden: true,
        unhideWhen: ["toggleKeyBind", "holdKeyBind"]
      },
      {
        keyName: "changeCursor",
        name: "Change Cursor",
        description: "Change cursor when you have anti-drag enabled.",
        position: 8,
        type: "boolean",
        defaultValue: false,
        hidden: true,
        unhideWhen: ["toggleKeyBind", "holdKeyBind"]
      },
      {
        keyName: "cursorStyle",
        name: "Cursor",
        description: "Select which cursor you wish to use",
        position: 9,
        type: "enum",
        defaultValue: "RS3_GOLD",
        options: RUNELITE_CUSTOM_CURSOR_ASSETS.map((cursor) => cursor.id),
        hidden: true,
        unhideWhen: ["changeCursor"]
      }
    ]
  },
  {
    id: "custom-cursor",
    group: "customcursor",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/customcursor/CustomCursorConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "cursorStyle",
        name: "Cursor",
        description: "Select which cursor you wish to use",
        position: 0,
        type: "enum",
        defaultValue: "RS3_GOLD",
        options: RUNELITE_CUSTOM_CURSOR_ASSETS.map((cursor) => cursor.id)
      }
    ]
  },
  {
    id: RUNELITE_KEY_REMAPPING_PLUGIN_ID,
    group: RUNELITE_KEY_REMAPPING_CONFIG_GROUP,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/keyremapping/KeyRemappingConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "hideDisplayName",
        name: "Hide display name",
        description: "Hides the display name from showing before \"Press Enter to Chat...\"",
        position: 0,
        type: "boolean",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.hideDisplayName
      },
      {
        keyName: "cameraRemap",
        name: "Remap Camera",
        description: "Configures whether the camera movement uses remapped keys",
        position: 1,
        type: "boolean",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.cameraRemap
      },
      {
        keyName: "up",
        name: "Camera Up key",
        description: "The key which will replace up.",
        position: 2,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.up.key
      },
      {
        keyName: "down",
        name: "Camera Down key",
        description: "The key which will replace down.",
        position: 3,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.down.key
      },
      {
        keyName: "left",
        name: "Camera Left key",
        description: "The key which will replace left.",
        position: 4,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.left.key
      },
      {
        keyName: "right",
        name: "Camera Right key",
        description: "The key which will replace right.",
        position: 5,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.right.key
      },
      {
        keyName: "fkeyRemap",
        name: "Remap F Keys",
        description: "Configures whether F-Keys use remapped keys",
        position: 6,
        type: "boolean",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.fkeyRemap
      },
      {
        keyName: "f1",
        name: "F1",
        description: "The key which will replace {F1}.",
        position: 7,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.f1.key
      },
      {
        keyName: "f2",
        name: "F2",
        description: "The key which will replace {F2}.",
        position: 8,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.f2.key
      },
      {
        keyName: "f3",
        name: "F3",
        description: "The key which will replace {F3}.",
        position: 9,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.f3.key
      },
      {
        keyName: "f4",
        name: "F4",
        description: "The key which will replace {F4}.",
        position: 10,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.f4.key
      },
      {
        keyName: "f5",
        name: "F5",
        description: "The key which will replace {F5}.",
        position: 11,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.f5.key
      },
      {
        keyName: "f6",
        name: "F6",
        description: "The key which will replace {F6}.",
        position: 12,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.f6.key
      },
      {
        keyName: "f7",
        name: "F7",
        description: "The key which will replace {F7}.",
        position: 13,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.f7.key
      },
      {
        keyName: "f8",
        name: "F8",
        description: "The key which will replace {F8}.",
        position: 14,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.f8.key
      },
      {
        keyName: "f9",
        name: "F9",
        description: "The key which will replace {F9}.",
        position: 15,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.f9.key
      },
      {
        keyName: "f10",
        name: "F10",
        description: "The key which will replace {F10}.",
        position: 16,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.f10.key
      },
      {
        keyName: "f11",
        name: "F11",
        description: "The key which will replace {F11}.",
        position: 17,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.f11.key
      },
      {
        keyName: "f12",
        name: "F12",
        description: "The key which will replace {F12}.",
        position: 18,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.f12.key
      },
      {
        keyName: "esc",
        name: "ESC",
        description: "The key which will replace {ESC}.",
        position: 19,
        type: "modifierless-keybind",
        defaultValue: RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.esc.key
      }
    ]
  },
  {
    id: RUNELITE_MOUSE_HIGHLIGHT_PLUGIN_ID,
    group: RUNELITE_MOUSE_HIGHLIGHT_CONFIG_GROUP,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/mousehighlight/MouseHighlightConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "mainTooltip",
        name: "Main Tooltips",
        description: "Whether or not tooltips are shown on things other than interfaces or the chatbox",
        position: 0,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "uiTooltip",
        name: "Interface Tooltips",
        description: "Whether or not tooltips are shown on interfaces",
        position: 1,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "chatboxTooltip",
        name: "Chatbox Tooltips",
        description: "Whether or not tooltips are shown over the chatbox",
        position: 2,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "hideSpells",
        name: "Spellbook",
        description: "Hides vanilla client tooltips in the spellbook",
        position: 3,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "hideCombat",
        name: "Combat",
        description: "Hides vanilla client tooltips in the combat menu",
        position: 4,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "rightclickoptionTooltip",
        name: "Right Click Option Tooltips",
        description: "Whether or not tooltips are shown for options that right-click only.",
        position: 5,
        type: "boolean",
        defaultValue: true
      }
    ]
  },
  {
    id: "timers",
    group: "timers",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/timers/TimersConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "showFreezes",
        name: "Freeze timer",
        description: "Configures whether freeze timer is displayed",
        position: 28,
        type: "boolean",
        defaultValue: true
      }
    ]
  },
  {
    id: "freeze-timers",
    group: "freezetimers",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/freezetimers/FreezeTimersConfig.java",
    titleSections: [
      { keyName: "timersTitle", name: "Timers", description: "", position: 1 },
      { keyName: "overlayTitle", name: "Overlay", description: "", position: 7 }
    ],
    sections: [],
    items: [
      {
        keyName: "showOverlay",
        name: "Show Players",
        description: "Configure if the player overlay should be shown",
        position: 2,
        titleSection: "timersTitle",
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "showNpcs",
        name: "Show NPCs",
        description: "Configure if the npc overlay should be shown",
        position: 3,
        titleSection: "timersTitle",
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "FreezeTimers",
        name: "Show Freeze Timers",
        description: "Toggle overlay for Freeze timers",
        position: 4,
        titleSection: "timersTitle",
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "TB",
        name: "Show TB Timers",
        description: "Toggle overlay for TB timers",
        position: 5,
        titleSection: "timersTitle",
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "Veng",
        name: "Show Veng Timers",
        description: "Toggle overlay for Veng timers",
        position: 6,
        titleSection: "timersTitle",
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "xoffset",
        name: "X Offset",
        description: "Increasing this will push further away from model. Does not apply to text timers.",
        position: 8,
        titleSection: "overlayTitle",
        type: "range",
        defaultValue: 20,
        min: 0,
        max: 60
      },
      {
        keyName: "noImage",
        name: "Text Timers",
        description: "Remove Images from Timers",
        position: 9,
        titleSection: "overlayTitle",
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "fontStyle",
        name: "Font Style",
        description: "Bold/Italics/Plain",
        position: 10,
        titleSection: "overlayTitle",
        type: "enum",
        defaultValue: "Bold",
        options: ["Bold", "Italic", "Plain"]
      },
      {
        keyName: "textSize",
        name: "Text Size",
        description: "Text Size for Timers.",
        position: 11,
        titleSection: "overlayTitle",
        type: "range",
        defaultValue: 11,
        min: 9,
        max: 14
      }
    ]
  },
  {
    id: "attack-styles",
    group: "attackIndicator",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/attackstyles/AttackStylesConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "alwaysShowStyle",
        name: "Always show style",
        description: "Show attack style indicator at all times",
        position: 1,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "warnForDefensive",
        name: "Warn for defence",
        description: "Show warning when a Defence skill combat option is selected",
        position: 2,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "warnForAttack",
        name: "Warn for attack",
        description: "Show warning when an Attack skill combat option is selected",
        position: 3,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "warnForStrength",
        name: "Warn for strength",
        description: "Show warning when a Strength skill combat option is selected",
        position: 4,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "warnForRanged",
        name: "Warn for ranged",
        description: "Show warning when a Ranged skill combat option is selected",
        position: 5,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "warnForMagic",
        name: "Warn for magic",
        description: "Show warning when a Magic skill combat option is selected",
        position: 6,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "hideAutoRetaliate",
        name: "Hide auto retaliate",
        description: "Hide auto retaliate from the combat options tab",
        position: 7,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "removeWarnedStyles",
        name: "Remove warned styles",
        description: "Remove warned styles from the combat options tab",
        position: 8,
        type: "boolean",
        defaultValue: false
      }
    ]
  },
  {
    id: "status-bars",
    group: "statusbars",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/statusbars/StatusBarsConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "enableCounter",
        name: "Show counters",
        description: "Shows the numeric value of HP and Prayer on the status bar",
        position: 1,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "enableSkillIcon",
        name: "Show icons",
        description: "Adds skill icons at the top of the bars.",
        position: 2,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "enableRestorationBars",
        name: "Show restores",
        description: "Visually shows how much will be restored to your status bar.",
        position: 3,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "leftBarMode",
        name: "Left Status Bar",
        description: "Configures the left status bar",
        position: 4,
        type: "enum",
        defaultValue: "Hitpoints",
        options: ["Disabled", "Hitpoints", "Prayer", "Run Energy", "Special Attack"]
      },
      {
        keyName: "rightBarMode",
        name: "Right Status Bar",
        description: "Configures the right status bar",
        position: 5,
        type: "enum",
        defaultValue: "Prayer",
        options: ["Disabled", "Hitpoints", "Prayer", "Run Energy", "Special Attack"]
      },
      {
        keyName: "toggleRestorationBars",
        name: "Toggle to hide when not in combat",
        description: "Visually hides the Status Bars when player is out of combat.",
        position: 6,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "hideStatusBarDelay",
        name: "Delay (seconds)",
        description: "Number of seconds after combat to hide the status bars.",
        position: 7,
        type: "range",
        defaultValue: 3,
        min: 0,
        max: 10
      }
    ]
  },
  {
    id: "status-orbs",
    group: "statusorbs",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/statusorbs/StatusOrbsConfig.java",
    titleSections: [
      { keyName: "hp", name: "Hitpoints", description: "", position: 0 },
      { keyName: "spec", name: "Special attack", description: "", position: 5 },
      { keyName: "run", name: "Run energy", description: "", position: 7 }
    ],
    sections: [],
    items: [
      {
        keyName: "dynamicHpHeart",
        name: "Dynamic hitpoints heart",
        description: "Changes the HP heart color to match players current affliction",
        position: 1,
        type: "boolean",
        titleSection: "hp",
        defaultValue: true
      },
      {
        keyName: "showHitpoints",
        name: "Show hitpoints regen",
        description: "Show a ring around the hitpoints orb",
        position: 2,
        type: "boolean",
        titleSection: "hp",
        defaultValue: true
      },
      {
        keyName: "showWhenNoChange",
        name: "Show hitpoints regen at full hitpoints",
        description: "Always show the hitpoints regen orb, even if there will be no stat change",
        position: 3,
        type: "boolean",
        titleSection: "hp",
        defaultValue: false
      },
      {
        keyName: "notifyBeforeHpRegenDuration",
        name: "Hitpoint Regen Notification (seconds)",
        description: "Notify approximately when your next hitpoint is about to regen. A value of 0 will disable notification.",
        position: 4,
        type: "range",
        titleSection: "hp",
        defaultValue: 0,
        min: 0,
        max: 10
      },
      {
        keyName: "showSpecial",
        name: "Show Spec. Attack regen",
        description: "Show a ring around the Special Attack orb",
        position: 6,
        type: "boolean",
        titleSection: "spec",
        defaultValue: true
      },
      {
        keyName: "showRun",
        name: "Show run energy regen",
        description: "Show a ring around the run regen orb",
        position: 8,
        type: "boolean",
        titleSection: "run",
        defaultValue: true
      },
      {
        keyName: "replaceOrbText",
        name: "Replace run orb text with run time left",
        description: "Show the remaining run time (in seconds) next in the energy orb",
        position: 9,
        type: "boolean",
        titleSection: "run",
        defaultValue: false
      }
    ]
  },
  {
    id: "supplies-tracker",
    group: "suppliestracker",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/suppliestracker/SuppliesTrackerConfig.java",
    titleSections: [
      {
        keyName: "blowpipeTitle",
        name: "Blowpipe",
        description: "",
        position: 1
      }
    ],
    sections: [],
    items: [
      {
        keyName: "blowpipeAmmo",
        name: "Ammo",
        description: "What type of dart are you using in your toxic blowpipe",
        position: 0,
        titleSection: "blowpipeTitle",
        type: "enum",
        defaultValue: "MITHRIL",
        options: ["BRONZE", "IRON", "STEEL", "MITHRIL", "ADAMANT", "RUNE", "DRAGON"]
      }
    ]
  },
  {
    id: "pvp-tools",
    group: "pvptools",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/pvptools/PvpToolsConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "countPlayers",
        name: "Count Players",
        description: "When in PvP zones, counts the attackable players in and not in player's CC",
        position: 0,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "countOverHeads",
        name: "Count Enemy Overheads",
        description: "Counts the number of each protection prayer attackable targets not in your CC are currently using",
        position: 1,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "renderSelfHotkey",
        name: "Render Self Hotkey",
        description: "Toggles renderself when you press the hotkey",
        position: 2,
        type: "text",
        defaultValue: "Not set"
      },
      {
        keyName: "hideAttack",
        name: "Hide attack",
        description: "Hides the attack option for clanmates, friends, or both",
        position: 3,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "hideAttackMode",
        name: "Mode",
        description: "",
        position: 4,
        type: "enum",
        defaultValue: "Friends",
        options: ["Clan", "Friends", "Both"],
        hidden: true,
        unhideWhen: ["hideAttack"]
      },
      {
        keyName: "hideCast",
        name: "Hide cast",
        description: "Hides the cast option for clanmates, friends, or both",
        position: 5,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "hideCastMode",
        name: "Mode",
        description: "",
        position: 6,
        type: "enum",
        defaultValue: "Friends",
        options: ["Clan", "Friends", "Both"],
        hidden: true,
        unhideWhen: ["hideCast"]
      },
      {
        keyName: "hideCastIgnored",
        name: "Ignored spells",
        description: "Spells that should not be hidden from being cast, separated by a comma",
        position: 7,
        type: "text",
        defaultValue: "cure other, energy transfer, heal other, vengeance other",
        hidden: true,
        unhideWhen: ["hideCast"]
      },
      {
        keyName: "riskCalculator",
        name: "Risk Calculator",
        description: "Enables a panel in the PvP Tools Panel that shows the players current risk",
        position: 8,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "missingPlayers",
        name: "Missing CC Players",
        description: "Adds a button to the PvP Tools panel that opens a window showing which CC members are not at the current players location",
        position: 9,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "currentPlayers",
        name: "Current CC Players",
        description: "Adds a button to the PvP Tools panel that opens a window showing which CC members currently at the players location",
        position: 10,
        type: "boolean",
        defaultValue: true
      }
    ]
  },
  {
    id: RUNELITE_PRAY_AGAINST_PLAYER_PLUGIN_ID,
    group: RUNELITE_PRAY_AGAINST_PLAYER_CONFIG_GROUP,
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/prayagainstplayer/PrayAgainstPlayerConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "attackerPlayerColor",
        name: "Attacker color",
        description: "This is the color that will be used to highlight attackers.",
        position: 0,
        type: "color",
        defaultValue: "#ff0006"
      },
      {
        keyName: "potentialPlayerColor",
        name: "Potential Attacker color",
        description: "This is the color that will be used to highlight potential attackers.",
        position: 1,
        type: "color",
        defaultValue: "#ffff00"
      },
      {
        keyName: "attackerTargetTimeout",
        name: "Attacker Timeout",
        description: "Seconds until attacker is no longer highlighted.",
        position: 2,
        type: "range",
        defaultValue: 10,
        min: 0,
        max: 60
      },
      {
        keyName: "potentialTargetTimeout",
        name: "Potential Attacker Timeout",
        description: "Seconds until potential attacker is no longer highlighted.",
        position: 3,
        type: "range",
        defaultValue: 10,
        min: 0,
        max: 60
      },
      {
        keyName: "newSpawnTimeout",
        name: "New Player Timeout",
        description: "Seconds until logged in/spawned player is no longer highlighted.",
        position: 4,
        type: "range",
        defaultValue: 5,
        min: 0,
        max: 60
      },
      {
        keyName: "ignoreFriends",
        name: "Ignore Friends",
        description: "This lets you decide whether you want friends to be highlighted by this plugin.",
        position: 5,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "ignoreClanMates",
        name: "Ignore Clan Mates",
        description: "This lets you decide whether you want clan mates to be highlighted by this plugin.",
        position: 6,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "markNewPlayer",
        name: "Mark new player as potential attacker",
        description: "Marks someone that logged in or teleported as a potential attacker for your safety\nDO NOT RUN THIS IN WORLD 1-2 GRAND EXCHANGE!",
        position: 7,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "drawTargetPrayAgainst",
        name: "Draw what to pray on attacker",
        description: "Tells you what to pray from what weapon the attacker is holding",
        position: 8,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "drawPotentialTargetPrayAgainst",
        name: "Draw what to pray on potential attacker",
        description: "Tells you what to pray from what weapon the potential attacker is holding",
        position: 9,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "drawTargetPrayAgainstPrayerTab",
        name: "Draw what to pray from prayer tab",
        description: "Tells you what to pray from what weapon the attacker is holding from the prayer tab",
        position: 10,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "drawTargetsName",
        name: "Draw name on attacker",
        description: "Configures whether or not the attacker's name should be shown",
        position: 11,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "drawPotentialTargetsName",
        name: "Draw name on potential attacker",
        description: "Configures whether or not the potential attacker's name should be shown",
        position: 12,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "drawTargetHighlight",
        name: "Draw highlight around attacker",
        description: "Configures whether or not the attacker should be highlighted",
        position: 13,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "drawPotentialTargetHighlight",
        name: "Draw highlight around potential attacker",
        description: "Configures whether or not the potential attacker should be highlighted",
        position: 14,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "drawTargetTile",
        name: "Draw tile under attacker",
        description: "Configures whether or not the attacker's tile be highlighted",
        position: 15,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "drawPotentialTargetTile",
        name: "Draw tile under potential attacker",
        description: "Configures whether or not the potential attacker's tile be highlighted",
        position: 16,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "drawUnknownWeapons",
        name: "Draw unknown weapons",
        description: "Configures whether or not the unknown weapons should be shown when a player equips one",
        position: 17,
        type: "boolean",
        defaultValue: false
      }
    ]
  },
  {
    id: "xp-drop",
    group: "xpdrop",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/experiencedrop/XpDropConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "hideSkillIcons",
        name: "Hide skill icons",
        description: "Configure if XP drops will show their respective skill icons",
        position: 0,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "meleePrayerColor",
        name: "Melee Prayer Color",
        description: "XP drop color when a melee prayer is active",
        position: 1,
        type: "color",
        defaultValue: "#1580ad"
      },
      {
        keyName: "rangePrayerColor",
        name: "Range Prayer Color",
        description: "XP drop color when a range prayer is active",
        position: 2,
        type: "color",
        defaultValue: "#1580ad"
      },
      {
        keyName: "magePrayerColor",
        name: "Mage Prayer Color",
        description: "XP drop color when a mage prayer is active",
        position: 3,
        type: "color",
        defaultValue: "#1580ad"
      },
      {
        keyName: "fakeXpDropDelay",
        name: "Fake Xp Drop delay",
        description: "Configures how many ticks should pass between fake XP drops, 0 to disable",
        position: 4,
        type: "range",
        defaultValue: 0,
        min: 0,
        max: 20
      },
      {
        keyName: "showdamagedrops",
        name: "Show Damage on XP Drop",
        description: "Show what you hit next to the XP drop",
        position: 5,
        type: "enum",
        defaultValue: "NONE",
        options: ["NONE", "ABOVE_OPPONENT", "IN_XP_DROP"]
      },
      {
        keyName: "damageColor",
        name: "Damage Color",
        description: "The color you want the text to be for damage",
        position: 6,
        type: "color",
        defaultValue: "#ff0000"
      },
      {
        keyName: "trainerDisplayMode",
        name: "Trainer XP drop mode",
        description: "Trainer extension: display source HP XP, or display the queued hit number directly",
        position: 7,
        type: "enum",
        defaultValue: "HIT",
        options: ["XP", "HIT"]
      },
      {
        keyName: "nativeTextSize",
        name: "Native XP drop size",
        description: "Native XP drop size option backed by Config.XP_DROPS_SIZE varbit 4693",
        position: 8,
        type: "enum",
        defaultValue: "Small",
        options: ["Small", "Medium", "Large"]
      },
      {
        keyName: "trainerFont",
        name: "XP drop font",
        description: "Trainer extension: choose one of the client fonts used by xpdrops_setdropsize",
        position: 9,
        type: "enum",
        defaultValue: "Plain 11",
        options: ["Plain 11", "Plain 12", "Bold 12"]
      },
      {
        keyName: "trainerTextSize",
        name: "XP drop number size",
        description: "Trainer extension: numeric source-pixel height for the XP drop text and icons",
        position: 10,
        type: "number",
        defaultValue: 16,
        min: 8,
        max: 48
      },
      {
        keyName: "trainerMoveDistance",
        name: "XP drop movement",
        description: "Trainer extension: numeric client-pixel travel distance using the xpdrops_dropletmove speed path",
        position: 11,
        type: "number",
        defaultValue: 100,
        min: 20,
        max: 220
      }
    ]
  },
  {
    id: "boosts-information",
    group: "boosts",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/boosts/BoostsConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "displayBoosts",
        name: "Display Boosts",
        description: "Configures which skill boosts to display",
        position: 1,
        type: "enum",
        defaultValue: "BOTH",
        options: ["NONE", "COMBAT", "NON_COMBAT", "BOTH"]
      },
      {
        keyName: "relativeBoost",
        name: "Use Relative Boosts",
        description: "Configures whether or not relative boost is used",
        position: 2,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "displayIndicators",
        name: "Display as infoboxes",
        description: "Configures whether or not to display the boost as infoboxes",
        position: 3,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "displayIconPanel",
        name: "Icons",
        description: "Show boosts next to icons (transparent background)",
        position: 4,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "boldIconFont",
        name: "Bold Font for Icons",
        description: "",
        position: 5,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "displayNextBuffChange",
        name: "Display next buff change",
        description: "Configures whether or not to display when the next buffed stat change will be",
        position: 6,
        type: "enum",
        defaultValue: "BOOSTED",
        options: ["ALWAYS", "BOOSTED", "NEVER"]
      },
      {
        keyName: "displayNextDebuffChange",
        name: "Display next debuff change",
        description: "Configures whether or not to display when the next debuffed stat change will be",
        position: 7,
        type: "enum",
        defaultValue: "NEVER",
        options: ["ALWAYS", "BOOSTED", "NEVER"]
      },
      {
        keyName: "boostThreshold",
        name: "Boost Amount Threshold",
        description: "The amount of levels boosted to send a notification at. A value of 0 will disable notification.",
        position: 8,
        type: "range",
        defaultValue: 0,
        min: 0,
        max: 120
      },
      {
        keyName: "groupNotifications",
        name: "Group Notifications",
        description: "Configures whether or not to group notifications for multiple skills into a single notification",
        position: 9,
        type: "boolean",
        defaultValue: false
      }
    ]
  },
  {
    id: "prayer",
    group: "prayer",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/prayer/PrayerConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "prayerFlickLocation",
        name: "Pray flick location",
        description: "Choose where to display the prayer flick helper.",
        position: 0,
        type: "enum",
        defaultValue: "NONE",
        options: ["NONE", "PRAYER_ORB", "PRAYER_BAR", "BOTH"]
      },
      {
        keyName: "prayerFlickAlwaysOn",
        name: "Never hide prayer flick helper",
        description: "Show prayer flick helper regardless of if you're praying or not.",
        position: 1,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "prayerIndicator",
        name: "Boost indicator",
        description: "Enable infoboxes for prayers.",
        position: 2,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "prayerIndicatorOverheads",
        name: "Overhead indicator",
        description: "Also enable infoboxes for overheads.",
        position: 3,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "showPrayerDoseIndicator",
        name: "Show prayer dose indicator",
        description: "Enables the prayer dose indicator.",
        position: 4,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "showPrayerTooltip",
        name: "Show prayer orb tooltip",
        description: "Displays time remaining and prayer bonus as a tooltip on the quick-prayer icon.",
        position: 5,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "showPrayerBar",
        name: "Show prayer bar",
        description: "Displays prayer bar under HP bar when praying.",
        position: 6,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "prayerBarHideIfNotPraying",
        name: "Hide bar while prayer is inactive",
        description: "Prayer bar will be hidden while prayers are inactive.",
        position: 7,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "prayerBarHideIfNonCombat",
        name: "Hide bar while out-of-combat",
        description: "Prayer bar will be hidden while out-of-combat.",
        position: 8,
        type: "boolean",
        defaultValue: false
      }
    ]
  },
  {
    id: "opponent-info",
    group: "opponentinfo",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/opponentinfo/OpponentInfoConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "lookupOnInteraction",
        name: "Lookup players on interaction",
        description: "Display a combat stat comparison panel on player interaction. (follow, trade, challenge, attack, etc.)",
        position: 0,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "hitpointsDisplayStyle",
        name: "Hitpoints display style",
        description: "Show opponent's hitpoints as a value (if known), percentage, or both",
        position: 1,
        type: "enum",
        defaultValue: "Hitpoints",
        options: ["Hitpoints", "Percentage", "Both"]
      },
      {
        keyName: "showOpponentsOpponent",
        name: "Show opponent's opponent",
        description: "Toggle showing opponent's opponent if within a multi-combat area",
        position: 2,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "showAttackersMenu",
        name: "Show attackers in menu",
        description: "Marks attackers' names in menus with a *",
        position: 3,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "showAttackingMenu",
        name: "Green main target",
        description: "Display main target's name colored in menus (Players and NPCs)",
        position: 4,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "attackingColor",
        name: "Target color",
        description: "The color your target will be highlighted with",
        position: 5,
        type: "color",
        defaultValue: "#00ff00"
      },
      {
        keyName: "showHitpointsMenu",
        name: "Show NPC hp in menu",
        description: "Show NPC hp in menu. Useful when barraging",
        position: 6,
        type: "boolean",
        defaultValue: false
      }
    ]
  },
  {
    id: "player-indicators",
    group: "playerindicators",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/playerindicators/PlayerIndicatorsConfig.java",
    titleSections: [],
    sections: [
      { keyName: "yourselfSection", name: "Yourself", description: "", position: 0 },
      { keyName: "targetSection", name: "Target", description: "", position: 4 },
      { keyName: "otherSection", name: "Other", description: "", position: 5 }
    ],
    items: [
      {
        keyName: "drawOwnName",
        name: "Highlight own player",
        description: "Configures whether or not your own player should be highlighted",
        position: 0,
        section: "yourselfSection",
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "ownNameColor",
        name: "Own player color",
        description: "Color of your own player",
        position: 1,
        section: "yourselfSection",
        type: "color",
        defaultValue: "#00b8d4"
      },
      {
        keyName: "drawTargetsNames",
        name: "Highlight attackable targets",
        description: "Configures whether or not attackable targets should be highlighted",
        position: 0,
        section: "targetSection",
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "targetColor",
        name: "Target member color",
        description: "Color of attackable targets",
        position: 1,
        section: "targetSection",
        type: "color",
        defaultValue: "#136ef7"
      },
      {
        keyName: "playerSkull",
        name: "Show Skull Information",
        description: "shows",
        position: 7,
        section: "targetSection",
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "showCombat",
        name: "Show Combat Levels",
        description: "Show the combat level of attackable players next to their name.",
        position: 10,
        section: "targetSection",
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "drawOtherPlayerNames",
        name: "Highlight other players",
        description: "Configures whether or not other players should be highlighted",
        position: 0,
        section: "otherSection",
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "otherPlayerColor",
        name: "Other player color",
        description: "Color of other players' names",
        position: 1,
        section: "otherSection",
        type: "color",
        defaultValue: "#ff0000"
      }
    ]
  },
  {
    id: "tile-indicators",
    group: "tileindicators",
    sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/tileindicators/TileIndicatorsConfig.java",
    titleSections: [],
    sections: [],
    items: [
      {
        keyName: "highlightDestinationColor",
        name: "Color of current destination highlighting",
        description: "Configures the highlight color of current destination",
        position: 0,
        type: "color",
        defaultValue: "#808080"
      },
      {
        keyName: "highlightDestinationTile",
        name: "Highlight destination tile",
        description: "Highlights tile player is walking to",
        position: 1,
        type: "boolean",
        defaultValue: true
      },
      {
        keyName: "thinDestinationTile",
        name: "Thin destination tile",
        description: "Renders the tile border as 1 pixel wide instead of 2",
        position: 2,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "highlightCurrentColor",
        name: "Color of current tile highlighting",
        description: "Configures the highlight color of current tile position",
        position: 3,
        type: "color",
        defaultValue: "#00ffff"
      },
      {
        keyName: "highlightCurrentTile",
        name: "Highlight current tile",
        description: "Highlights tile player is on",
        position: 4,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "thinCurrentTile",
        name: "Thin current tile",
        description: "Renders the tile border as 1 pixel wide instead of 2",
        position: 5,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "highlightHoveredColor",
        name: "Color of current hovered highlighting",
        description: "Configures the highlight color of hovered tile",
        position: 6,
        type: "color",
        defaultValue: "rgba(0, 0, 0, 0)"
      },
      {
        keyName: "highlightHoveredTile",
        name: "Highlight hovered tile",
        description: "Highlights tile player is hovering with mouse",
        position: 7,
        type: "boolean",
        defaultValue: false
      },
      {
        keyName: "thinHoveredTile",
        name: "Thin hovered tile",
        description: "Renders the tile border as 1 pixel wide instead of 2",
        position: 8,
        type: "boolean",
        defaultValue: false
      }
    ]
  }
];

export function RuneliteClientShell({
  children,
  pvpTrackerSnapshot = null,
  suppliesTrackerSnapshot = null,
  pvpToolsSnapshot = null,
  onConfigSnapshotChange
}: RuneliteClientShellProps): JSX.Element {
  const [sidebarState, dispatchSidebar] = useReducer(runeliteSidebarReducer, RUNELITE_INITIAL_SIDEBAR_STATE);
  const [pinnedPluginIds, setPinnedPluginIds] = useState(() => defaultRunelitePinnedPluginIds());
  const [enabledPluginIds, setEnabledPluginIds] = useState(() => defaultRuneliteEnabledPluginIds());
  const [configValuesByPluginId, setConfigValuesByPluginId] = useState(() => buildInitialRuneliteConfigValues());
  const [openConfigRequest, setOpenConfigRequest] = useState<RuneliteOpenConfigRequest | null>(null);
  const [overlayLocations, setOverlayLocations] = useState<RuneliteOverlayPreferredLocations>(() =>
    readRuneliteOverlayPreferredLocations()
  );
  const clientPanelRef = useRef<HTMLDivElement | null>(null);
  const overlayDraggingModeRef = useRef(false);
  const movingOverlayRef = useRef<RuneliteMovingOverlayState | null>(null);
  const [antiDragHotkeyState, setAntiDragHotkeyState] = useState<RuneliteAntiDragHotkeyState>(
    RUNELITE_INITIAL_ANTI_DRAG_HOTKEY_STATE
  );
  const [antiDragMouseCanvasPosition, setAntiDragMouseCanvasPosition] = useState<RuneliteAntiDragMouseCanvasPosition>(
    RUNELITE_INITIAL_ANTI_DRAG_MOUSE_CANVAS_POSITION
  );
  const shellRef = useRef<HTMLDivElement | null>(null);
  const windowSize = useRuneliteWindowSize(shellRef);
  const configSnapshot = useMemo(
    () => buildRuneliteClientConfigSnapshot(enabledPluginIds, configValuesByPluginId, antiDragHotkeyState),
    [antiDragHotkeyState, configValuesByPluginId, enabledPluginIds]
  );
  const clientFrameConfig = useMemo(
    () => runeliteClientFrameConfig(configSnapshot, pvpTrackerSnapshot?.playerName ?? null),
    [configSnapshot, pvpTrackerSnapshot?.playerName]
  );
  const toolbarEntries = useMemo(
    () => buildRuneliteToolbarEntries(runeliteNavigationButtonsForConfig(configSnapshot)),
    [configSnapshot]
  );
  const navigationButtons = useMemo(
    () => toolbarEntries.flatMap((entry) => (entry.kind === "button" ? [entry.button] : [])),
    [toolbarEntries]
  );
  const visiblePanel = sidebarState.isSidebarOpen
    ? navigationButtons.find((button) => button.id === sidebarState.visiblePanelId) ?? null
    : null;
  const stretchedClientLayout = useMemo(
    () => runeliteStretchedClientLayout(configSnapshot.stretchedMode, windowSize, sidebarState, visiblePanel),
    [configSnapshot.stretchedMode, sidebarState, visiblePanel, windowSize]
  );
  const toggleSidebar = useCallback(() => dispatchSidebar({ type: "toggleSidebar" }), []);
  const updateOverlayLocations = useCallback((locations: RuneliteOverlayPreferredLocations) => {
    setOverlayLocations(locations);
    window.dispatchEvent(new CustomEvent("runelite-overlay-locations-changed", { detail: { locations } }));
  }, []);

  useEffect(() => {
    onConfigSnapshotChange?.(configSnapshot);
  }, [configSnapshot, onConfigSnapshotChange]);

  useEffect(() => {
    const handleOverlayLocationChange = (event: Event): void => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      const locations = detail?.locations as RuneliteOverlayPreferredLocations | undefined;
      setOverlayLocations(locations ?? readRuneliteOverlayPreferredLocations());
    };

    window.addEventListener("runelite-overlay-locations-changed", handleOverlayLocationChange);
    return () => window.removeEventListener("runelite-overlay-locations-changed", handleOverlayLocationChange);
  }, []);

  useEffect(() => {
    const handleOverlayConfigRequest = (event: Event): void => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      const pluginId = typeof detail?.pluginId === "string" ? detail.pluginId : "";
      if (!findRuneliteConfigDescriptor(pluginId)) {
        return;
      }

      setOpenConfigRequest((current) => ({
        pluginId,
        requestId: (current?.requestId ?? 0) + 1
      }));
      dispatchSidebar({ type: "openPanel", id: "configuration" });
    };

    window.addEventListener("runelite-overlay-config", handleOverlayConfigRequest);
    return () => window.removeEventListener("runelite-overlay-config", handleOverlayConfigRequest);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey) {
        overlayDraggingModeRef.current = true;
      }
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (!event.altKey) {
        overlayDraggingModeRef.current = false;
      }
    };

    const handleBlur = (): void => {
      overlayDraggingModeRef.current = false;
      movingOverlayRef.current = null;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  useEffect(() => {
    document.title = clientFrameConfig.title;

    const bridge = window.nhTrainer;
    if (!bridge?.applyClientShellFrameConfig) {
      return;
    }

    bridge.applyClientShellFrameConfig(clientFrameConfig).catch((error: unknown) => {
      console.warn("Failed to apply RuneLite client shell frame config", error);
    });
  }, [clientFrameConfig]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "F11") {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  useEffect(() => {
    const antiDragConfig = configSnapshot.antiDrag;
    const keybindEnabled =
      antiDragConfig.enabled && !antiDragConfig.alwaysOn && (antiDragConfig.toggleKeyBind || antiDragConfig.holdKeyBind);

    if (!keybindEnabled) {
      setAntiDragHotkeyState((current) =>
        current.toggleDrag || current.holdDrag ? RUNELITE_INITIAL_ANTI_DRAG_HOTKEY_STATE : current
      );
      return;
    }

    const handleAntiDragKeyDown = (event: KeyboardEvent): void => {
      if (!runeliteAntiDragKeyboardEventMatchesKeybind(event, antiDragConfig.key)) {
        return;
      }

      if (antiDragConfig.toggleKeyBind && !event.repeat) {
        event.preventDefault();
        setAntiDragHotkeyState((current) => ({ ...current, toggleDrag: !current.toggleDrag }));
      }

      if (antiDragConfig.holdKeyBind) {
        event.preventDefault();
        setAntiDragHotkeyState((current) => (current.holdDrag ? current : { ...current, holdDrag: true }));
      }
    };

    const handleAntiDragKeyUp = (event: KeyboardEvent): void => {
      if (!antiDragConfig.holdKeyBind || !runeliteAntiDragKeyboardEventMatchesKeybind(event, antiDragConfig.key)) {
        return;
      }

      event.preventDefault();
      setAntiDragHotkeyState((current) => (current.holdDrag ? { ...current, holdDrag: false } : current));
    };

    const handleAntiDragFocusLoss = (): void => {
      if (!antiDragConfig.reqFocus) {
        return;
      }

      setAntiDragHotkeyState((current) =>
        current.toggleDrag || current.holdDrag ? RUNELITE_INITIAL_ANTI_DRAG_HOTKEY_STATE : current
      );
    };

    window.addEventListener("keydown", handleAntiDragKeyDown);
    window.addEventListener("keyup", handleAntiDragKeyUp);
    window.addEventListener("blur", handleAntiDragFocusLoss);
    return () => {
      window.removeEventListener("keydown", handleAntiDragKeyDown);
      window.removeEventListener("keyup", handleAntiDragKeyUp);
      window.removeEventListener("blur", handleAntiDragFocusLoss);
    };
  }, [
    configSnapshot.antiDrag.alwaysOn,
    configSnapshot.antiDrag.enabled,
    configSnapshot.antiDrag.holdKeyBind,
    configSnapshot.antiDrag.key,
    configSnapshot.antiDrag.reqFocus,
    configSnapshot.antiDrag.toggleKeyBind
  ]);

  const togglePinned = (pluginId: string) => {
    setPinnedPluginIds((current) => {
      const next = new Set(current);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
      }
      saveRunelitePinnedPluginIds(next);
      return next;
    });
  };

  const toggleEnabled = (pluginId: string) => {
    const item = runeliteTrainerAvailablePluginListItems().find((candidate) => candidate.id === pluginId);
    if (!item?.pluginBacked) {
      return;
    }

    setEnabledPluginIds((current) => {
      const next = new Set(current);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
      }
      saveRunelitePluginEnabledState(item, next.has(pluginId));
      return next;
    });
  };

  const setConfigValue = useCallback((pluginId: string, keyName: string, value: RuneliteConfigValue) => {
    saveRuneliteConfigValue(pluginId, keyName, value);
    setConfigValuesByPluginId((current) => ({
      ...current,
      [pluginId]: {
        ...current[pluginId],
        [keyName]: value
      }
    }));
  }, []);

  const resetConfigValues = (pluginId: string) => {
    const descriptor = findRuneliteConfigDescriptor(pluginId);
    if (!descriptor) {
      return;
    }

    unsetRuneliteConfigDescriptorValues(descriptor);
    setConfigValuesByPluginId((current) => ({
      ...current,
      [pluginId]: buildDefaultRuneliteConfigValueMap(descriptor)
    }));
  };

  useEffect(() => {
    const handleConfigValueSet = (event: Event): void => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      const pluginId = typeof detail?.pluginId === "string" ? detail.pluginId : "";
      const keyName = typeof detail?.keyName === "string" ? detail.keyName : "";
      const descriptor = findRuneliteConfigDescriptor(pluginId);
      const item = descriptor?.items.find((candidate) => candidate.keyName === keyName);
      if (!descriptor || !item) {
        return;
      }

      const value = detail?.value;
      if (item.type === "range" || item.type === "number") {
        const numericValue = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(numericValue)) {
          return;
        }
        setConfigValue(pluginId, keyName, Math.max(item.min ?? 0, Math.min(item.max ?? 100, numericValue)));
        return;
      }
      if (item.type === "boolean" && typeof value === "boolean") {
        setConfigValue(pluginId, keyName, value);
        return;
      }
      if ((item.type === "enum" || item.type === "text" || item.type === "color" || item.type === "modifierless-keybind") && typeof value === "string") {
        setConfigValue(pluginId, keyName, item.options && !item.options.includes(value) ? item.defaultValue : value);
      }
    };

    window.addEventListener("runelite-config-value-set", handleConfigValueSet);
    return () => window.removeEventListener("runelite-config-value-set", handleConfigValueSet);
  }, [setConfigValue]);

  return (
    <div
      ref={shellRef}
      className="runeliteClientShell"
      data-source-container="ClientUI.container BoxLayout.X_AXIS"
      data-source-client-panel="ClientPanel Constants.GAME_FIXED_SIZE"
      data-source-nav-container="ClientUI.navContainer CardLayout"
      data-source-plugin-toolbar="ClientPluginToolbar"
      data-source-sidebar-hotkey={RUNELITE_SIDEBAR_HOTKEY_SOURCE}
      data-source-sidebar-state-model={RUNELITE_SIDEBAR_STATE_MODEL_SOURCE}
      data-source-sidebar-selection={RUNELITE_SIDEBAR_SELECTION_SOURCE}
      data-source-config-manager={RUNELITE_CONFIG_MANAGER_SOURCE}
      data-source-plugin-enabled-config={RUNELITE_PLUGIN_ENABLED_CONFIG_SOURCE}
      data-source-client-opacity="ClientUI.updateFrameConfig reads client opacity settings; disabled resets frame opacity to 1F"
      data-source-frame-config={RUNELITE_FRAME_CONFIG_SOURCE}
      data-source-client-title={RUNELITE_CLIENT_TITLE_SOURCE}
      data-source-overlay-menu={RUNELITE_OVERLAY_MENU_SOURCE}
      data-source-overlay-config-click={RUNELITE_OVERLAY_CONFIG_CLICK_SOURCE}
      data-source-overlay-drag={RUNELITE_OVERLAY_DRAG_SOURCE}
      data-source-overlay-position={RUNELITE_OVERLAY_POSITION_SOURCE}
      data-sidebar-open={String(sidebarState.isSidebarOpen)}
      data-current-nav-button-id={sidebarState.activePanelId ?? ""}
      data-plugin-panel-open={visiblePanel === null ? "false" : "true"}
      data-client-opacity-enabled={String(configSnapshot.clientShell.enableOpacity)}
      data-client-opacity-percentage={configSnapshot.clientShell.opacityPercentage}
      data-client-effective-opacity={configSnapshot.clientShell.effectiveOpacity}
      data-runelite-frame-title={clientFrameConfig.title}
      data-runelite-frame-always-on-top={String(clientFrameConfig.alwaysOnTop)}
      data-runelite-frame-resizable={String(clientFrameConfig.resizable)}
      data-runelite-frame-automatic-resize-type={configSnapshot.frame.automaticResizeType}
      data-runelite-frame-contain-in-screen={configSnapshot.frame.containInScreen}
      data-runelite-frame-remember-screen-bounds={String(configSnapshot.frame.rememberScreenBounds)}
      data-runelite-frame-warning-on-exit={configSnapshot.frame.warningOnExit}
      data-runelite-menu-entry-shift={String(configSnapshot.overlayMenu.requireShift)}
      data-runelite-stretched-enabled={String(configSnapshot.stretchedMode.enabled)}
      data-runelite-stretched-width={stretchedClientLayout.width}
      data-runelite-stretched-height={stretchedClientLayout.height}
      data-runelite-stretched-parent-width={stretchedClientLayout.parentWidth}
      data-runelite-stretched-parent-height={stretchedClientLayout.parentHeight}
      data-runelite-stretched-offset-x={stretchedClientLayout.offsetX}
      data-runelite-stretched-offset-y={stretchedClientLayout.offsetY}
      data-runelite-stretched-scale-x={stretchedClientLayout.scaleX.toFixed(6)}
      data-runelite-stretched-scale-y={stretchedClientLayout.scaleY.toFixed(6)}
      data-runelite-stretched-scaling-factor={configSnapshot.stretchedMode.scalingFactor}
      data-runelite-stretched-fast={String(configSnapshot.stretchedMode.increasedPerformance)}
      data-source-stretched-mode={RUNELITE_STRETCHED_MODE_SOURCE}
      data-source-stretched-dimensions={RUNELITE_STRETCHED_DIMENSIONS_SOURCE}
      data-source-stretched-canvas-location={RUNELITE_STRETCHED_CANVAS_LOCATION_SOURCE}
      data-source-stretched-mouse={RUNELITE_STRETCHED_MOUSE_SOURCE}
      data-source-stretched-fast={RUNELITE_STRETCHED_FAST_SOURCE}
      data-source-disabled-plugins={RUNELITE_TRAINER_DISABLED_PLUGIN_SOURCE}
      style={runeliteClientShellStyle(configSnapshot)}
    >
      <div
        className="runeliteClientPanelFrame"
        data-stretched-mode={String(stretchedClientLayout.enabled)}
        data-source-real-width={RUNELITE_FIXED_CLIENT_WIDTH}
        data-source-real-height={RUNELITE_FIXED_CLIENT_HEIGHT}
        data-source-stretched-width={stretchedClientLayout.width}
        data-source-stretched-height={stretchedClientLayout.height}
        data-source-stretched-parent-width={stretchedClientLayout.parentWidth}
        data-source-stretched-parent-height={stretchedClientLayout.parentHeight}
        data-source-stretched-offset-x={stretchedClientLayout.offsetX}
        data-source-stretched-offset-y={stretchedClientLayout.offsetY}
        data-source-stretched-canvas-location={RUNELITE_STRETCHED_CANVAS_LOCATION_SOURCE}
        data-source-optimization="trainer keeps the WebGL render target at real dimensions and CSS-stretches the composed client panel"
        style={runeliteClientPanelFrameStyle(stretchedClientLayout)}
      >
      <div
        ref={clientPanelRef}
        className="runeliteClientPanel"
        data-source-width={RUNELITE_FIXED_CLIENT_WIDTH}
        data-source-height={RUNELITE_FIXED_CLIENT_HEIGHT}
        data-source-anti-drag-cursor="AntiDragPlugin toggleListener/holdListener call clientUI.setCursor(selectedCursor.getCursorImage(), selectedCursor.toString()); release/reset calls clientUI.resetCursor()"
        data-source-anti-drag-cursor-assets="Nh184-Client/runelite-client/src/main/resources/net/runelite/client/plugins/customcursor/cursor-*.png"
        data-source-custom-cursor="CustomCursorPlugin startUp/updateCursor and ConfigChanged customcursor.cursorStyle call clientUI.setCursor(selectedCursor.getCursorImage(), selectedCursor.toString()); shutDown calls clientUI.resetCursor()"
        data-anti-drag-cursor-active={String(runeliteAntiDragCursorActive(configSnapshot.antiDrag))}
        data-anti-drag-cursor-style={configSnapshot.antiDrag.cursorStyle}
        data-custom-cursor-active={String(configSnapshot.customCursor.enabled)}
        data-custom-cursor-style={configSnapshot.customCursor.cursorStyle}
        data-stretched-interpolation={
          stretchedClientLayout.enabled
            ? configSnapshot.stretchedMode.increasedPerformance
              ? "nearest"
              : "bilinear"
            : "fixed"
        }
        style={runeliteClientPanelStyle(configSnapshot, stretchedClientLayout)}
        onPointerDownCapture={(event) => {
          if (!overlayDraggingModeRef.current && !event.altKey) {
            return;
          }

          const panel = clientPanelRef.current;
          const overlayElement = panel ? runeliteOverlayElementAtPoint(panel, event.clientX, event.clientY) : null;
          if (!panel || !overlayElement) {
            return;
          }

          const overlayName = overlayElement.dataset.runeliteOverlayName ?? "";
          if (!overlayName) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          if (event.button === 2) {
            movingOverlayRef.current = null;
            updateOverlayLocations(saveRuneliteOverlayPreferredLocation(overlayName, null));
            return;
          }

          if (event.button !== 0) {
            return;
          }

          const point = runeliteClientPanelPoint(panel, event.clientX, event.clientY);
          const overlayRect = overlayElement.getBoundingClientRect();
          const panelRect = panel.getBoundingClientRect();
          const scale = runeliteClientPanelScale(panelRect);
          movingOverlayRef.current = {
            overlayName,
            offsetX: point.x - (overlayRect.left - panelRect.left) / scale,
            offsetY: point.y - (overlayRect.top - panelRect.top) / scale,
            width: overlayRect.width / scale,
            height: overlayRect.height / scale
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          const nextLocation = runeliteClampedOverlayLocation(
            { x: point.x - movingOverlayRef.current.offsetX, y: point.y - movingOverlayRef.current.offsetY },
            movingOverlayRef.current
          );
          updateOverlayLocations({
            ...overlayLocations,
            [overlayName]: nextLocation
          });
        }}
        onPointerMoveCapture={(event) => {
          const movingOverlay = movingOverlayRef.current;
          const panel = clientPanelRef.current;
          if (!movingOverlay || !panel) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          const point = runeliteClientPanelPoint(panel, event.clientX, event.clientY);
          updateOverlayLocations({
            ...overlayLocations,
            [movingOverlay.overlayName]: runeliteClampedOverlayLocation(
              { x: point.x - movingOverlay.offsetX, y: point.y - movingOverlay.offsetY },
              movingOverlay
            )
          });
        }}
        onPointerUpCapture={(event) => {
          const movingOverlay = movingOverlayRef.current;
          if (!movingOverlay) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          movingOverlayRef.current = null;
          const location = overlayLocations[movingOverlay.overlayName] ?? null;
          if (location) {
            updateOverlayLocations(saveRuneliteOverlayPreferredLocation(movingOverlay.overlayName, location));
          }
        }}
        onContextMenuCapture={(event) => {
          if (!overlayDraggingModeRef.current && !event.altKey) {
            return;
          }

          const panel = clientPanelRef.current;
          const overlayElement = panel ? runeliteOverlayElementAtPoint(panel, event.clientX, event.clientY) : null;
          const overlayName = overlayElement?.dataset.runeliteOverlayName ?? "";
          if (!overlayName) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          movingOverlayRef.current = null;
          updateOverlayLocations(saveRuneliteOverlayPreferredLocation(overlayName, null));
        }}
        onMouseMove={(event) => {
          const point = runeliteClientPanelPoint(event.currentTarget, event.clientX, event.clientY);
          setAntiDragMouseCanvasPosition({
            x: point.x,
            y: point.y,
            insideClient: true
          });
        }}
        onMouseLeave={() => setAntiDragMouseCanvasPosition(RUNELITE_INITIAL_ANTI_DRAG_MOUSE_CANVAS_POSITION)}
      >
        {children}
        <RuneliteAntiDragOverlay
          config={configSnapshot.antiDrag}
          mouseCanvasPosition={antiDragMouseCanvasPosition}
        />
        <RunelitePvpPerformanceOverlay
          snapshot={pvpTrackerSnapshot}
          config={configSnapshot.pvpPerformanceTracker}
          overlayLocations={overlayLocations}
        />
        <RunelitePvpToolsPlayerCountOverlay snapshot={pvpToolsSnapshot} config={configSnapshot.pvpTools} />
        <div
          className="runeliteSidebarToggleHotZone"
          data-source-range={RUNELITE_SIDEBAR_TOGGLE_RANGE_SOURCE}
          data-source-x="client.getRealDimensions().width - sidebarOpenIcon.getWidth() - 5"
        >
          <button
            className="runeliteSidebarToggleButton"
            type="button"
            title={sidebarState.isSidebarOpen ? "Close SideBar" : "Open SideBar"}
            aria-label={sidebarState.isSidebarOpen ? "Close SideBar" : "Open SideBar"}
            aria-pressed={sidebarState.isSidebarOpen}
            data-sidebar-open={String(sidebarState.isSidebarOpen)}
            data-source-overlay={RUNELITE_SIDEBAR_TOGGLE_SOURCE}
            data-source-click={RUNELITE_SIDEBAR_TOGGLE_CLICK_SOURCE}
            data-source-flip={RUNELITE_SIDEBAR_TOGGLE_FLIP_SOURCE}
            data-source-state={RUNELITE_SIDEBAR_TOGGLE_STATE_SOURCE}
            data-source-hotkey={RUNELITE_SIDEBAR_HOTKEY_SOURCE}
            onClick={toggleSidebar}
          >
            <img src="runelite-ui/open_rs.png" alt="" draggable={false} />
          </button>
        </div>
      </div>
      </div>
      <aside
        className="runeliteNavContainer"
        aria-hidden={visiblePanel === null}
        data-open={visiblePanel === null ? "false" : "true"}
        data-sidebar-open={String(sidebarState.isSidebarOpen)}
        data-source-open-width={RUNELITE_PLUGIN_WRAPPED_WIDTH}
        data-source-closed-width={0}
        data-source-contract="ClientUI.contract navContainer preferred/min/max width 0"
        data-source-expand="ClientUI.expand navContainer preferred/min/max width panel.getWrappedPanel().getPreferredSize().width"
        data-source-card-layout="cardLayout.show(navContainer, button.getTooltip())"
      >
        {visiblePanel ? (
          <section
            className="runelitePluginPanel"
            aria-label={visiblePanel.tooltip}
            data-navigation-button-id={visiblePanel.id}
            data-navigation-source={visiblePanel.sourcePath}
            data-source-panel-width={RUNELITE_PLUGIN_PANEL_WIDTH}
            data-source-scrollbar-width={RUNELITE_PLUGIN_SCROLLBAR_WIDTH}
            data-source-offset={RUNELITE_PLUGIN_PANEL_OFFSET}
          >
            <div className="runelitePluginPanelInner">
              <RunelitePanelContent
                panel={visiblePanel}
                pvpTrackerSnapshot={pvpTrackerSnapshot}
                pvpTrackerConfig={configSnapshot.pvpPerformanceTracker}
                suppliesTrackerSnapshot={suppliesTrackerSnapshot}
                pvpToolsSnapshot={pvpToolsSnapshot}
                pvpToolsConfig={configSnapshot.pvpTools}
                openConfigRequest={openConfigRequest}
                pinnedPluginIds={pinnedPluginIds}
                enabledPluginIds={enabledPluginIds}
                configValuesByPluginId={configValuesByPluginId}
                onPinnedToggle={togglePinned}
                onEnabledToggle={toggleEnabled}
                onResetConfigValues={resetConfigValues}
                onConfigValueChange={setConfigValue}
              />
            </div>
          </section>
        ) : null}
      </aside>
      {sidebarState.isSidebarOpen ? (
        <nav
          className="runelitePluginToolbar"
          aria-label="RuneLite plugin toolbar"
          data-source-width={RUNELITE_PLUGIN_TOOLBAR_WIDTH}
          data-source-height={RUNELITE_FIXED_CLIENT_HEIGHT}
          data-source-sort={RUNELITE_TOOLBAR_SORT_SOURCE}
          data-source-delimiter={RUNELITE_TOOLBAR_DELIMITER_SOURCE}
          data-source-sidebar-state={RUNELITE_SIDEBAR_TOGGLE_STATE_SOURCE}
        >
          {toolbarEntries.map((entry) => {
            if (entry.kind === "delimiter") {
              return (
                <span
                  key={entry.id}
                  className="runeliteToolbarDelimiter"
                  role="separator"
                  data-source-glue="Box.createVerticalGlue"
                  data-source-separator="JToolBar.addSeparator"
                />
              );
            }

            const { button } = entry;

            return (
              <button
                key={button.id}
                className="runeliteToolbarButton"
                type="button"
                aria-pressed={sidebarState.isSidebarOpen && sidebarState.visiblePanelId === button.id}
                title={button.tooltip}
                data-navigation-button-id={button.id}
                data-navigation-priority={button.priority}
                data-navigation-tab={String(button.tab)}
                data-navigation-source={button.sourcePath}
                data-source-navigation-button-fields={RUNELITE_NAVIGATION_BUTTON_SOURCE_FIELDS}
                data-source-navigation-button-equality={RUNELITE_NAVIGATION_BUTTON_EQUALS_SOURCE}
                onClick={() => dispatchSidebar({ type: "navigationButtonClicked", id: button.id })}
              >
                <img src={button.iconPath} alt="" draggable={false} />
              </button>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

function RunelitePanelContent({
  panel,
  pvpTrackerSnapshot,
  pvpTrackerConfig,
  suppliesTrackerSnapshot,
  pvpToolsSnapshot,
  pvpToolsConfig,
  openConfigRequest,
  pinnedPluginIds,
  enabledPluginIds,
  configValuesByPluginId,
  onPinnedToggle,
  onEnabledToggle,
  onResetConfigValues,
  onConfigValueChange
}: {
  readonly panel: RuneliteNavigationButtonModel;
  readonly pvpTrackerSnapshot: RunelitePvpTrackerSnapshot | null;
  readonly pvpTrackerConfig: RunelitePvpPerformanceTrackerConfigSnapshot;
  readonly suppliesTrackerSnapshot: RuneliteSuppliesTrackerSnapshot | null;
  readonly pvpToolsSnapshot: RunelitePvpToolsSnapshot | null;
  readonly pvpToolsConfig: RunelitePvpToolsConfigSnapshot;
  readonly openConfigRequest: RuneliteOpenConfigRequest | null;
  readonly pinnedPluginIds: ReadonlySet<string>;
  readonly enabledPluginIds: ReadonlySet<string>;
  readonly configValuesByPluginId: Readonly<Record<string, Readonly<Record<string, RuneliteConfigValue>>>>;
  readonly onPinnedToggle: (pluginId: string) => void;
  readonly onEnabledToggle: (pluginId: string) => void;
  readonly onResetConfigValues: (pluginId: string) => void;
  readonly onConfigValueChange: (pluginId: string, keyName: string, value: RuneliteConfigValue) => void;
}): JSX.Element {
  if (panel.id === "configuration") {
    return (
      <RuneliteConfigurationPanel
        pinnedPluginIds={pinnedPluginIds}
        enabledPluginIds={enabledPluginIds}
        configValuesByPluginId={configValuesByPluginId}
        openConfigRequest={openConfigRequest}
        onPinnedToggle={onPinnedToggle}
        onEnabledToggle={onEnabledToggle}
        onResetConfigValues={onResetConfigValues}
        onConfigValueChange={onConfigValueChange}
      />
    );
  }

  if (panel.id === "pvp-fight-history") {
    return <RunelitePvpPerformanceTrackerPanel snapshot={pvpTrackerSnapshot} config={pvpTrackerConfig} />;
  }

  if (panel.id === "supplies-tracker") {
    return <RuneliteSuppliesTrackerPanel snapshot={suppliesTrackerSnapshot} />;
  }

  if (panel.id === "pvp-tools") {
    return <RunelitePvpToolsPanel snapshot={pvpToolsSnapshot} config={pvpToolsConfig} />;
  }

  if (panel.id === "info") {
    return <RuneliteInfoPanel />;
  }

  return (
    <div
      className="runelitePluginPanelTitle"
      data-navigation-source={panel.sourcePath}
      data-source-panel="PluginPanel.getPreferredSize"
    >
      {panel.tooltip}
    </div>
  );
}

function RuneliteInfoPanel(): JSX.Element {
  return (
    <div
      className="runeliteInfoPanel"
      data-source-panel="InfoPanel extends PluginPanel"
      data-source-layout="BorderLayout"
      data-navigation-source="Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/info/InfoPanel.java"
    >
      <section className="runeliteInfoVersionPanel" data-source-border="new EmptyBorder(10, 10, 10, 10)">
        <RuneliteInfoVersionLine label="RuneLite version:" value="@project.version@" />
        <RuneliteInfoVersionLine label="Client version:" value="@open.osrs.version@" />
        <RuneliteInfoVersionLine label="Oldschool revision:" value="Unknown" />
      </section>
      <div
        className="runeliteInfoActionsContainer"
        data-source-layout={`GridLayout(${RUNELITE_INFO_ACTION_ROWS}, 1, 0, ${RUNELITE_INFO_ACTION_GAP})`}
      >
        {runeliteInfoActions.map((action) => (
          <RuneliteInfoAction key={action.id} action={action} />
        ))}
      </div>
    </div>
  );
}

function RuneliteInfoVersionLine({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div className="runeliteInfoVersionLine">
      <span>{label} </span>
      <strong>{value}</strong>
    </div>
  );
}

function RunelitePvpToolsPanel({
  snapshot,
  config
}: {
  readonly snapshot: RunelitePvpToolsSnapshot | null;
  readonly config: RunelitePvpToolsConfigSnapshot;
}): JSX.Element {
  const values = snapshot ?? RUNELITE_EMPTY_PVP_TOOLS_SNAPSHOT;

  return (
    <div
      className="runelitePvpToolsPanel"
      data-source-panel="PvpToolsPanel extends PluginPanel"
      data-source-layout="BorderLayout"
      data-source-plugin="PvpToolsPlugin"
      data-source-nav-button="NavigationButton tooltip PvP Tools priority 5 panel(panel)"
      data-source-panel-file="Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/pvptools/PvpToolsPanel.java"
      data-source-plugin-file="Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/pvptools/PvpToolsPlugin.java"
    >
      <section className="runelitePvpToolsInfoPanel" data-source-layout="GridLayout(0, 1)">
        <RunelitePvpToolsHtmlLabel
          label="Friendly Player Count: "
          value={config.countPlayers ? String(values.friendlyPlayerCount) : "Disabled"}
        />
        <RunelitePvpToolsHtmlLabel
          label="Other Player Count: "
          value={config.countPlayers ? String(values.enemyPlayerCount) : "Disabled"}
        />
        <RunelitePvpToolsHtmlLabel label="Player brew count: " value={String(values.brewCount)} />
        <RunelitePvpToolsHtmlLabel
          label="Enemies Praying Mage: "
          value={config.countOverHeads ? String(values.enemyPrayingMageCount) : "disabled"}
          large
        />
        <RunelitePvpToolsHtmlLabel
          label="Enemies Praying Range: "
          value={config.countOverHeads ? String(values.enemyPrayingRangeCount) : "disabled"}
          large
        />
        <RunelitePvpToolsHtmlLabel
          label="Enemies Praying Melee: "
          value={config.countOverHeads ? String(values.enemyPrayingMeleeCount) : "disabled"}
          large
        />
      </section>
      <section className="runelitePvpToolsRiskPanel" data-source-layout="GridLayout(0, 1)">
        <RunelitePvpToolsHtmlLabel
          label="Total risk: "
          value={config.riskCalculator ? runeliteQuantityToRsDecimalStack(values.totalRisk) : "disabled"}
          large
        />
        <RunelitePvpToolsHtmlLabel
          label="Risk Protecting Item: "
          value={config.riskCalculator ? runeliteQuantityToRsDecimalStack(values.riskProtectingItem) : "disabled"}
          large
        />
        <div className="runelitePvpToolsBiggestItem" data-source-label="Most Valuable Item: ">
          <span>Most Valuable Item: </span>
          {config.riskCalculator && values.mostValuableItem?.sprite ? (
            <span
              className="runelitePvpToolsItemSprite"
              title={`${values.mostValuableItem.name}: ${runeliteQuantityToRsDecimalStack(values.mostValuableItem.value)}`}
              style={runeliteSuppliesItemSpriteStyle(values.mostValuableItem.sprite)}
            />
          ) : null}
        </div>
      </section>
      <section className="runelitePvpToolsButtonsPanel" data-source-layout="GridLayout(0, 1)">
        {config.missingPlayers ? (
          <button
            className="runelitePvpToolsButton"
            type="button"
            data-source-action-listener="playersButtonActionListener"
            title={values.missingClanMembers.join("\n")}
          >
            Show missing CC members
          </button>
        ) : null}
        {config.currentPlayers ? (
          <button
            className="runelitePvpToolsButton"
            type="button"
            data-source-action-listener="currentPlayersActionListener"
            title={values.currentClanMembers.join("\n")}
          >
            Show current CC members
          </button>
        ) : null}
      </section>
    </div>
  );
}

function RunelitePvpToolsHtmlLabel({
  label,
  value,
  large = false
}: {
  readonly label: string;
  readonly value: string;
  readonly large?: boolean;
}): JSX.Element {
  return (
    <span className={large ? "runelitePvpToolsHtmlLabel runelitePvpToolsHtmlLabel-large" : "runelitePvpToolsHtmlLabel"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function RunelitePvpToolsPlayerCountOverlay({
  snapshot,
  config
}: {
  readonly snapshot: RunelitePvpToolsSnapshot | null;
  readonly config: RunelitePvpToolsConfigSnapshot;
}): JSX.Element | null {
  if (!config.enabled || !config.countPlayers || !snapshot?.inPvpArea) {
    return null;
  }

  return (
    <aside
      className="runelitePvpToolsPlayerCountOverlay"
      data-source-overlay="PlayerCountOverlay"
      data-source-layer="OverlayLayer.ABOVE_WIDGETS"
      data-source-priority="OverlayPriority.HIGHEST"
      data-source-position="OverlayPosition.TOP_LEFT"
      data-source-condition="countPlayers && (IN_WILDERNESS || PvPWorld || clan-wars-region || Deadman)"
    >
      <div className="runelitePvpToolsOverlayRow">
        <span className="runelitePvpToolsFriendlyLabel">Friendly</span>
        <span>{snapshot.friendlyPlayerCount}</span>
      </div>
      <div className="runelitePvpToolsOverlayRow">
        <span className="runelitePvpToolsEnemyLabel">Enemy</span>
        <span>{snapshot.enemyPlayerCount}</span>
      </div>
    </aside>
  );
}

const RUNELITE_EMPTY_PVP_TOOLS_SNAPSHOT: RunelitePvpToolsSnapshot = {
  friendlyPlayerCount: 0,
  enemyPlayerCount: 0,
  enemyPrayingMageCount: 0,
  enemyPrayingRangeCount: 0,
  enemyPrayingMeleeCount: 0,
  brewCount: 0,
  totalRisk: 0,
  riskProtectingItem: 0,
  mostValuableItem: null,
  missingClanMembers: [],
  currentClanMembers: [],
  inPvpArea: false
};

function RuneliteSuppliesTrackerPanel({
  snapshot
}: {
  readonly snapshot: RuneliteSuppliesTrackerSnapshot | null;
}): JSX.Element {
  const hasSupplies = Boolean(snapshot && snapshot.totalSupplies > 0);

  return (
    <div
      className="runeliteSuppliesTrackerPanel"
      data-source-panel="SuppliesTrackerPanel extends PluginPanel"
      data-source-layout="BorderLayout"
      data-source-plugin="SuppliesTrackerPlugin"
      data-source-nav-button="NavigationButton tooltip Supplies Tracker priority 5 panel(panel)"
      data-source-panel-file="Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/suppliestracker/SuppliesTrackerPanel.java"
      data-source-box-file="Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/suppliestracker/SuppliesBox.java"
      data-source-item-type-file="Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/suppliestracker/ItemType.java"
    >
      {hasSupplies && snapshot ? (
        <>
          <section
            className="runeliteSuppliesOverallPanel"
            data-source-border="new EmptyBorder(10, 10, 10, 10)"
            data-source-layout="BorderLayout"
            data-source-reset-menu="overallPanel.setComponentPopupMenu Reset All"
          >
            <img
              className="runeliteSuppliesOverallIcon"
              src="runelite-plugins/suppliestracker/panel_icon.png"
              alt=""
              draggable={false}
            />
            <div className="runeliteSuppliesOverallInfo" data-source-layout="GridLayout(2, 1)">
              <RuneliteSuppliesHtmlLabel label="Total Supplies: " value={snapshot.totalSupplies} />
              <RuneliteSuppliesHtmlLabel label="Total Cost: " value={snapshot.totalPrice} suffix=" gp" />
            </div>
          </section>
          <div className="runeliteSuppliesLogsContainer" data-source-layout="BoxLayout.Y_AXIS">
            {snapshot.categories.map((category) => (
              <RuneliteSuppliesBox key={category.category} category={category} />
            ))}
          </div>
        </>
      ) : (
        <section
          className="runeliteSuppliesErrorPanel"
          data-source-panel="PluginErrorPanel"
          data-source-content-title="Supply trackers"
          data-source-content-body="You have not used any supplies yet."
        >
          <strong>Supply trackers</strong>
          <span>You have not used any supplies yet.</span>
        </section>
      )}
    </div>
  );
}

function RuneliteSuppliesHtmlLabel({
  label,
  value,
  suffix = ""
}: {
  readonly label: string;
  readonly value: number;
  readonly suffix?: string;
}): JSX.Element {
  return (
    <span className="runeliteSuppliesHtmlLabel" data-source-template="HTML_LABEL_TEMPLATE">
      <span>{label}</span>
      <strong>{runeliteQuantityToStackSize(value)}{suffix}</strong>
    </span>
  );
}

function RuneliteSuppliesBox({
  category
}: {
  readonly category: RuneliteSuppliesTrackerCategorySnapshot;
}): JSX.Element {
  return (
    <section
      className="runeliteSuppliesBox"
      data-category={category.category}
      data-source-items-per-row="5"
      data-source-reset-menu="SuppliesBox Reset Category"
    >
      <header className="runeliteSuppliesBoxHeader" data-source-border="new EmptyBorder(7, 7, 7, 7)">
        <span className="runeliteSuppliesBoxTitle">{category.category}</span>
        <span className="runeliteSuppliesBoxSubtitle">x {category.totalSupplies}</span>
        <span
          className="runeliteSuppliesBoxPrice"
          title={`${runeliteFormatNumber(category.totalPrice)} gp`}
        >
          {runeliteQuantityToStackSize(category.totalPrice)} gp
        </span>
      </header>
      <div className="runeliteSuppliesItemGrid" data-source-layout="GridLayout(rowSize, 5, 1, 1)">
        {category.items.map((item) => (
          <div
            key={item.itemId}
            className="runeliteSuppliesItemSlot"
            title={`${item.name} x ${item.quantity} (${runeliteQuantityToStackSize(item.price)})`}
            data-item-id={item.itemId}
            data-display-item-id={item.displayItemId}
            data-source-item="SuppliesTrackerItem"
            data-source-reset-menu="SuppliesBox item Reset"
          >
            {item.sprite ? (
              <span
                className="runeliteSuppliesItemSprite"
                aria-hidden="true"
                style={runeliteSuppliesItemSpriteStyle(item.sprite)}
              />
            ) : (
              <span className="runeliteSuppliesItemFallback" aria-hidden="true">
                {item.name.slice(0, 2)}
              </span>
            )}
            {item.quantity > 1 ? <span className="runeliteSuppliesItemQuantity">{item.quantity}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function runeliteSuppliesItemSpriteStyle(sprite: RuneliteSuppliesTrackerSpriteSnapshot): CSSProperties {
  return {
    width: sprite.width,
    height: sprite.height,
    backgroundImage: `url(${sprite.imagePath})`,
    backgroundPosition: `-${sprite.x}px -${sprite.y}px`,
    backgroundSize: `${sprite.atlasWidth}px ${sprite.atlasHeight}px`
  };
}

function runeliteQuantityToStackSize(value: number): string {
  const normalized = Math.max(0, Math.trunc(value));
  if (normalized >= 10_000_000) {
    return `${Math.trunc(normalized / 1_000_000)}M`;
  }
  if (normalized >= 100_000) {
    return `${Math.trunc(normalized / 1_000)}K`;
  }
  return runeliteFormatNumber(normalized);
}

function runeliteQuantityToRsDecimalStack(value: number): string {
  const normalized = Math.max(0, Math.trunc(value));
  if (normalized >= 10_000_000) {
    return `${(normalized / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (normalized >= 100_000) {
    return `${(normalized / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return runeliteFormatNumber(normalized);
}

function runeliteFormatNumber(value: number): string {
  return Math.max(0, Math.trunc(value)).toLocaleString("en-US");
}

function dispatchRuneliteInfoAction(action: RuneliteInfoActionModel): void {
  document.documentElement.dataset.runeliteLastInfoActionId = action.id;
  document.documentElement.dataset.runeliteLastInfoActionTarget = action.resolvedTarget ?? action.sourceTarget;
  document.documentElement.dataset.runeliteLastInfoActionKind = action.targetKind;
  window.dispatchEvent(
    new CustomEvent("runelite-info-action", {
      detail: {
        id: action.id,
        sourceTarget: action.sourceTarget,
        targetKind: action.targetKind,
        resolvedTarget: action.resolvedTarget
      }
    })
  );

  if (action.targetKind === "url" && action.resolvedTarget) {
    window.open(action.resolvedTarget, "_blank", "noopener,noreferrer");
  }
}

function RuneliteInfoAction({ action }: { readonly action: RuneliteInfoActionModel }): JSX.Element {
  return (
    <button
      className="runeliteInfoAction"
      type="button"
      data-info-action-id={action.id}
      data-info-action-kind={action.targetKind}
      data-info-resolved-target={action.resolvedTarget ?? ""}
      data-source-target={action.sourceTarget}
      data-source-link-panel={RUNELITE_INFO_PANEL_LINK_SOURCE}
      data-source-action-targets={RUNELITE_INFO_PANEL_ACTION_TARGET_SOURCE}
      onClick={() => dispatchRuneliteInfoAction(action)}
    >
      <img className="runeliteInfoActionIcon" src={action.iconPath} alt="" draggable={false} />
      <span className="runeliteInfoActionText">
        <span>{action.topText}</span>
        <span>{action.bottomText}</span>
      </span>
      <img className="runeliteInfoActionArrow" src="runelite-ui/arrow_right.png" alt="" draggable={false} />
    </button>
  );
}

function RuneliteAntiDragOverlay({
  config,
  mouseCanvasPosition
}: {
  readonly config: RuneliteAntiDragConfigSnapshot;
  readonly mouseCanvasPosition: RuneliteAntiDragMouseCanvasPosition;
}): JSX.Element | null {
  if (!runeliteAntiDragOverlayVisible(config, mouseCanvasPosition)) {
    return null;
  }

  return (
    <div
      className="runeliteAntiDragOverlay"
      aria-hidden="true"
      data-source-overlay="AntiDragOverlay"
      data-source-overlay-file="Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/antidrag/AntiDragOverlay.java"
      data-source-overlay-position="OverlayPosition.TOOLTIP"
      data-source-overlay-priority="OverlayPriority.HIGHEST"
      data-source-overlay-layer="OverlayLayer.ALWAYS_ON_TOP"
      data-source-radius="AntiDragOverlay.RADIUS = 20"
      data-source-mouse-position="client.getMouseCanvasPosition()"
      data-source-overlay-toggle="AntiDragPlugin toggleListener/holdListener overlayManager.add/remove(overlay)"
      data-anti-drag-hotkey-active={String(config.hotkeyActive)}
      data-anti-drag-overlay-enabled={String(config.overlay)}
      style={runeliteAntiDragOverlayStyle(config, mouseCanvasPosition)}
    />
  );
}

function runeliteAntiDragOverlayVisible(
  config: RuneliteAntiDragConfigSnapshot,
  mouseCanvasPosition: RuneliteAntiDragMouseCanvasPosition
): boolean {
  return config.enabled && !config.alwaysOn && config.overlay && config.hotkeyActive && mouseCanvasPosition.insideClient;
}

function runeliteAntiDragOverlayStyle(
  config: RuneliteAntiDragConfigSnapshot,
  mouseCanvasPosition: RuneliteAntiDragMouseCanvasPosition
): CSSProperties {
  const diameter = RUNELITE_ANTI_DRAG_OVERLAY_RADIUS * 2;
  return {
    left: mouseCanvasPosition.x - RUNELITE_ANTI_DRAG_OVERLAY_RADIUS,
    top: mouseCanvasPosition.y - RUNELITE_ANTI_DRAG_OVERLAY_RADIUS,
    width: diameter,
    height: diameter,
    backgroundColor: config.overlayColor
  };
}

function runeliteClientShellStyle(config: RuneliteClientConfigSnapshot): CSSProperties | undefined {
  return config.clientShell.enableOpacity ? { opacity: config.clientShell.effectiveOpacity } : undefined;
}

function runeliteClientPanelFrameStyle(layout: RuneliteStretchedClientLayout): CSSProperties {
  return {
    flexBasis: layout.parentWidth,
    width: layout.parentWidth,
    height: layout.parentHeight
  };
}

function runeliteClientPanelStyle(
  config: RuneliteClientConfigSnapshot,
  stretchedLayout: RuneliteStretchedClientLayout
): CSSProperties | undefined {
  const style: CSSProperties = {};
  const cursor = runeliteClientPanelCursorCss(config);
  if (cursor) {
    style.cursor = cursor;
  }

  if (stretchedLayout.enabled) {
    // Intentional trainer optimization: keep the WebGL render target at Nh fixed-client dimensions and stretch
    // the already-composited client panel. Input handlers translate stretched coordinates back to source pixels.
    style.left = stretchedLayout.offsetX;
    style.top = stretchedLayout.offsetY;
    style.transform = `scale(${stretchedLayout.scaleX}, ${stretchedLayout.scaleY})`;
    style.transformOrigin = "left top";
    if (stretchedLayout.imageRendering) {
      style.imageRendering = stretchedLayout.imageRendering;
    }
  }

  return Object.keys(style).length === 0 ? undefined : style;
}

function runeliteClientPanelCursorCss(config: RuneliteClientConfigSnapshot): string | undefined {
  if (runeliteAntiDragCursorActive(config.antiDrag)) {
    return runeliteCustomCursorCssFromStyle(config.antiDrag.cursorStyle);
  }

  if (config.customCursor.enabled) {
    return runeliteCustomCursorCssFromStyle(config.customCursor.cursorStyle);
  }

  return undefined;
}

function runeliteCustomCursorCssFromStyle(cursorStyle: string): string | undefined {
  const asset = RUNELITE_CUSTOM_CURSOR_ASSETS.find((cursor) => cursor.id === cursorStyle);
  return asset ? `url("runelite-ui/customcursor/${asset.fileName}") 0 0, auto` : undefined;
}

function runeliteAntiDragCursorActive(config: RuneliteAntiDragConfigSnapshot): boolean {
  return config.enabled && !config.alwaysOn && config.changeCursor && config.hotkeyActive;
}

function RunelitePvpPerformanceTrackerPanel({
  snapshot,
  config
}: {
  readonly snapshot: RunelitePvpTrackerSnapshot | null;
  readonly config: RunelitePvpPerformanceTrackerConfigSnapshot;
}): JSX.Element {
  const [nameFilter, setNameFilter] = useState("");
  const stats = runelitePvpPanelStats(snapshot);
  const fightHistoryEntries = runelitePvpFightHistoryEntries(
    snapshot?.fightHistory ?? [],
    nameFilter,
    config.fightHistoryRenderLimit
  );

  return (
    <div
      className="runelitePvpTrackerPanel"
      data-source-panel="PvpPerformanceTrackerPanel extends PluginPanel"
      data-source-layout="BoxLayout.Y_AXIS"
      data-navigation-source="Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/pvpperformancetracker/PvpPerformanceTrackerPanel.java"
      data-source-nav-button={RUNELITE_PVP_TRACKER_NAV_BUTTON_SOURCE}
      data-show-fight-history-panel={String(config.showFightHistoryPanel)}
      data-restrict-to-lms={String(config.restrictToLms)}
    >
      <section
        className="runelitePvpTotalStatsPanel"
        data-source-panel="TotalStatsPanel"
        data-source-border="new EmptyBorder(4, 6, 4, 6)"
      >
        <div className="runelitePvpTitle">PvP Performance Tracker v{RUNELITE_PVP_TRACKER_VERSION}</div>
        <div className="runelitePvpKillDeathLine">
          <span>{snapshot?.kills ?? 0} Kills</span>
          <span>{snapshot?.deaths ?? 0} Deaths</span>
        </div>
        {stats.map((stat) => (
          <RunelitePvpStatLine key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </section>
      <div className="runelitePvpFilterSpacer" aria-hidden="true" />
      <label className="runelitePvpFilterLine" data-source-label="Filter Usernames:">
        <span>Filter Usernames:</span>
        <input value={nameFilter} onChange={(event) => setNameFilter(event.currentTarget.value)} spellCheck={false} />
      </label>
      <div className="runelitePvpFilterSpacer" aria-hidden="true" />
      <div
        className="runelitePvpFightHistoryScroller"
        data-source-scrollbar-width="new Dimension(6, 0)"
        data-source-container="fightHistoryContainer BoxLayout.Y_AXIS"
        data-source-add-fight="fightHistoryContainer.add(new FightPerformancePanel(fight), 0)"
        data-source-render-limit="fightHistoryContainer.getComponentCount() > config.fightHistoryRenderLimit() remove last components"
        data-fight-history-render-limit={config.fightHistoryRenderLimit}
        data-fight-history-count={fightHistoryEntries.length}
      >
        <div className="runelitePvpFightHistoryContainer">
          {fightHistoryEntries.map((entry) => (
            <RunelitePvpFightHistoryEntry key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RunelitePvpFightHistoryEntry({ entry }: { readonly entry: RunelitePvpFightHistoryEntrySnapshot }): JSX.Element {
  return (
    <article
      className="runelitePvpFightHistoryEntry"
      title={`${entry.playerName} vs. ${entry.opponentName}${entry.worldLabel ? ` (${entry.worldLabel})` : ""}`}
      data-source-panel="FightPerformancePanel"
      data-source-layout="BorderLayout(5, 0) + BoxLayout.Y_AXIS"
      data-source-border="normalBorder MatteBorder(0,0,4,0,DARK_GRAY_COLOR) + EmptyBorder(4,6,4,6)"
      data-ended-at-tick={entry.endedAtTick}
    >
      <div className="runelitePvpFightHistoryNames" data-source-line="playerNamesLine BorderLayout.WEST/EAST">
        <span data-player-dead={String(entry.playerDead)}>
          {entry.playerDead ? <img className="runelitePvpFightDeathIcon" src="runelite-ui/skull_red.png" alt="" draggable={false} /> : null}
          {entry.playerName}
        </span>
        {entry.worldLabel ? <span className="runelitePvpFightWorld">{entry.worldLabel}</span> : null}
        <span data-player-dead={String(entry.opponentDead)}>
          {entry.opponentDead ? <img className="runelitePvpFightDeathIcon" src="runelite-ui/skull_red.png" alt="" draggable={false} /> : null}
          {entry.opponentName}
        </span>
      </div>
      {entry.lines.map((line) => (
        <RunelitePvpFightHistoryLine key={line.statistic} line={line} />
      ))}
    </article>
  );
}

function RunelitePvpFightHistoryLine({ line }: { readonly line: RunelitePvpTrackerLineSnapshot }): JSX.Element {
  return (
    <div className="runelitePvpFightHistoryLine" data-statistic={line.statistic}>
      <span className={runelitePvpOverlayTextClass(line.leftColor)}>{line.left}</span>
      <span className="runelitePvpFightHistoryAcronym">{line.acronym}</span>
      <span className={runelitePvpOverlayTextClass(line.rightColor)}>{line.right}</span>
    </div>
  );
}

function RunelitePvpStatLine({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div className="runelitePvpStatLine">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function runelitePvpFightHistoryEntries(
  entries: readonly RunelitePvpFightHistoryEntrySnapshot[],
  nameFilter: string,
  renderLimit: number
): readonly RunelitePvpFightHistoryEntrySnapshot[] {
  const normalizedFilter = nameFilter.trim().toLowerCase();
  const limit = Math.max(1, Math.trunc(renderLimit));
  const filteredEntries = normalizedFilter
    ? entries.filter((entry) => {
        const playerName = entry.playerName.toLowerCase();
        const opponentName = entry.opponentName.toLowerCase();
        return playerName.startsWith(normalizedFilter) || opponentName.startsWith(normalizedFilter);
      })
    : entries;
  return filteredEntries.slice(0, limit);
}

function RunelitePvpPerformanceOverlay({
  snapshot,
  config,
  overlayLocations
}: {
  readonly snapshot: RunelitePvpTrackerSnapshot | null;
  readonly config: RunelitePvpPerformanceTrackerConfigSnapshot;
  readonly overlayLocations: RuneliteOverlayPreferredLocations;
}): JSX.Element | null {
  if (!runelitePvpPerformanceTrackerOverlayVisible(snapshot, config)) {
    return null;
  }

  const lines = runelitePvpPerformanceTrackerOverlayLines(snapshot, config);

  return (
    <aside
      className="runelitePvpOverlay"
      aria-label="PvP Performance"
      data-source-overlay="PvpPerformanceTrackerOverlay"
      data-runelite-config-plugin-id="pvp-performance-tracker"
      data-runelite-overlay-menu-target="PvP Performance Tracker"
      data-runelite-overlay-menu-opcode-source="MenuOpcode.RUNELITE_OVERLAY(1501) wraps OverlayMenuEntry RUNELITE_OVERLAY_CONFIG"
      data-source-position="OverlayPosition.BOTTOM_RIGHT"
      data-source-priority="OverlayPriority.LOW"
      data-source-panel="PanelComponent"
      data-source-title="TitleComponent"
      data-source-name-line="LineComponent"
      data-source-width="ComponentConstants.STANDARD_WIDTH"
      data-source-background="ComponentConstants.STANDARD_BACKGROUND_COLOR"
      data-source-table-row-style="TableComponent.TableRowStyle.PERCENTAGE_BASED"
      data-source-render-gate={RUNELITE_PVP_TRACKER_OVERLAY_RENDER_SOURCE}
      data-source-line-gate={RUNELITE_PVP_TRACKER_OVERLAY_LINE_SOURCE}
      data-runelite-overlay-name="PvpPerformanceTrackerOverlay"
      data-runelite-overlay-scale={1}
      data-source-overlay-position-storage={RUNELITE_OVERLAY_POSITION_SOURCE}
      data-restrict-to-lms={String(config.restrictToLms)}
      style={runelitePvpPerformanceOverlayStyle(overlayLocations)}
    >
      {config.showOverlayTitle ? <div className="runelitePvpOverlayTitle">PvP Performance</div> : null}
      {config.showOverlayNames ? (
        <div className="runelitePvpOverlayNames">
          <span>{shortRuneliteOverlayName(snapshot.playerName)}</span>
          <span>{shortRuneliteOverlayName(snapshot.opponentName)}</span>
        </div>
      ) : null}
      {lines.map((line) => (
        <RunelitePvpOverlayLine key={line.statistic} line={line} />
      ))}
    </aside>
  );
}

function runelitePvpPerformanceOverlayStyle(overlayLocations: RuneliteOverlayPreferredLocations): CSSProperties | undefined {
  return runeliteOverlayPreferredLocationStyle("PvpPerformanceTrackerOverlay", overlayLocations, 1) ?? undefined;
}

function runelitePvpPerformanceTrackerOverlayVisible(
  snapshot: RunelitePvpTrackerSnapshot | null,
  config: RunelitePvpPerformanceTrackerConfigSnapshot
): snapshot is RunelitePvpTrackerSnapshot {
  return (
    config.enabled &&
    config.showFightOverlay &&
    Boolean(snapshot?.fightStarted) &&
    (!config.restrictToLms || config.inLastManStandingArea)
  );
}

function runelitePvpPerformanceTrackerOverlayLines(
  snapshot: RunelitePvpTrackerSnapshot,
  config: RunelitePvpPerformanceTrackerConfigSnapshot
): readonly RunelitePvpTrackerLineSnapshot[] {
  return snapshot.lines.filter((line) => {
    if (line.statistic === "off-pray") {
      return config.showOverlayOffPray;
    }
    if (line.statistic === "expected-damage") {
      return config.showOverlayExpectedDamage;
    }
    if (line.statistic === "damage-dealt") {
      return config.showOverlayDamageDealt;
    }
    if (line.statistic === "magic-hits") {
      return config.showOverlayMagicHits;
    }
    if (line.statistic === "offensive-pray") {
      return config.showOverlayOffensivePray;
    }
    if (line.statistic === "hp-healed") {
      return config.showOverlayHpHealed;
    }
    if (line.statistic === "robe-hits") {
      return config.showOverlayRobeHits;
    }
    if (line.statistic === "ko-chances") {
      return config.showOverlayTotalKoChance;
    }
    if (line.statistic === "last-ko-chance") {
      return config.showOverlayLastKoChance;
    }
    return config.showOverlayGhostBarrage;
  });
}

function RunelitePvpOverlayLine({ line }: { readonly line: RunelitePvpTrackerLineSnapshot }): JSX.Element {
  return (
    <div
      className="runelitePvpOverlayLine"
      data-statistic={line.statistic}
      data-acronym={line.acronym}
      data-source-factory="PanelFactory.createOverlayStatsLine"
      data-source-gutter="new Dimension(2, 0)"
      style={{
        gridTemplateColumns: `${line.leftPercent}fr auto ${line.rightPercent}fr`
      }}
    >
      <span className={runelitePvpOverlayTextClass(line.leftColor)}>{line.left}</span>
      <span className="runelitePvpOverlayAcronym">{line.acronym}</span>
      <span className={runelitePvpOverlayTextClass(line.rightColor)}>{line.right}</span>
    </div>
  );
}

function runelitePvpPanelStats(snapshot: RunelitePvpTrackerSnapshot | null): readonly { readonly label: string; readonly value: string }[] {
  const byStatistic = new Map(snapshot?.lines.map((line) => [line.statistic, line]) ?? []);
  return [
    { label: "Total Off-Pray:", value: panelValue(byStatistic.get("off-pray"), "0/0 (0%)") },
    { label: "Avg Expected Dmg:", value: panelValue(byStatistic.get("expected-damage"), "0 (+0)") },
    { label: "Avg Damage Dealt:", value: panelValue(byStatistic.get("damage-dealt"), "0 (+0)") },
    { label: "Magic Luck:", value: panelValue(byStatistic.get("magic-hits"), "0/0 (0%)") },
    { label: "Offensive Pray:", value: panelValue(byStatistic.get("offensive-pray"), "0/0 (0%)") },
    { label: "Avg HP Healed:", value: panelValue(byStatistic.get("hp-healed"), "0") },
    { label: "Avg Hits on Robes:", value: panelValue(byStatistic.get("robe-hits"), "0/0 (0%)") },
    { label: "Avg KO Chances:", value: panelValue(byStatistic.get("ko-chances"), "0 (0.0%)") },
    { label: "Avg Ghost Barrages:", value: panelValue(byStatistic.get("ghost-barrages"), "0 G.B. (0)") }
  ];
}

function panelValue(line: RunelitePvpTrackerLineSnapshot | undefined, fallback: string): string {
  if (!line) {
    return fallback;
  }
  if (line.right === "-") {
    return line.left;
  }
  return `${line.left} / ${line.right}`;
}

function shortRuneliteOverlayName(name: string): string {
  return name.substring(0, Math.min(6, name.length));
}

function runelitePvpOverlayTextClass(color: RunelitePvpTrackerColor = "normal"): string {
  return `runelitePvpOverlayText runelitePvpOverlayText-${color}`;
}

function runeliteOverlayElementAtPoint(panel: HTMLElement, clientX: number, clientY: number): HTMLElement | null {
  const overlays = Array.from(panel.querySelectorAll<HTMLElement>("[data-runelite-overlay-name]"));
  for (let index = overlays.length - 1; index >= 0; index -= 1) {
    const overlay = overlays[index];
    const rect = overlay.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      return overlay;
    }
  }
  return null;
}

function runeliteClientPanelPoint(panel: HTMLElement, clientX: number, clientY: number): RuneliteOverlayPreferredLocation {
  const rect = panel.getBoundingClientRect();
  const scale = runeliteClientPanelScale(rect);
  return {
    x: Math.round((clientX - rect.left) / scale),
    y: Math.round((clientY - rect.top) / scale)
  };
}

function runeliteClientPanelScale(rect: DOMRect): number {
  return rect.width > 0 ? rect.width / RUNELITE_FIXED_CLIENT_WIDTH : 1;
}

function runeliteCurrentWindowSize(element: HTMLElement | null = null): RuneliteWindowSize {
  if (element) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height))
      };
    }
  }

  if (typeof window === "undefined") {
    return { width: RUNELITE_FIXED_CLIENT_WIDTH + RUNELITE_PLUGIN_TOOLBAR_WIDTH, height: RUNELITE_FIXED_CLIENT_HEIGHT };
  }

  return {
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight)
  };
}

function useRuneliteWindowSize(elementRef: RefObject<HTMLElement | null>): RuneliteWindowSize {
  const [windowSize, setWindowSize] = useState(() => runeliteCurrentWindowSize(elementRef.current));

  useEffect(() => {
    let animationFrame = 0;
    const syncSize = (): void => {
      if (animationFrame !== 0) {
        return;
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const nextSize = runeliteCurrentWindowSize(elementRef.current);
        setWindowSize((current) =>
          current.width === nextSize.width && current.height === nextSize.height ? current : nextSize
        );
      });
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined" || !elementRef.current ? null : new ResizeObserver(syncSize);
    if (resizeObserver && elementRef.current) {
      resizeObserver.observe(elementRef.current);
    }
    syncSize();
    window.addEventListener("resize", syncSize);
    return () => {
      window.removeEventListener("resize", syncSize);
      resizeObserver?.disconnect();
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [elementRef]);

  return windowSize;
}

function runeliteStretchedClientLayout(
  config: RuneliteStretchedModeConfigSnapshot,
  windowSize: RuneliteWindowSize,
  sidebarState: RuneliteSidebarState,
  visiblePanel: RuneliteNavigationButtonModel | null
): RuneliteStretchedClientLayout {
  if (!config.enabled) {
    return {
      enabled: false,
      parentWidth: RUNELITE_FIXED_CLIENT_WIDTH,
      parentHeight: RUNELITE_FIXED_CLIENT_HEIGHT,
      width: RUNELITE_FIXED_CLIENT_WIDTH,
      height: RUNELITE_FIXED_CLIENT_HEIGHT,
      offsetX: 0,
      offsetY: 0,
      scaleX: 1,
      scaleY: 1
    };
  }

  const sidebarWidth = sidebarState.isSidebarOpen
    ? RUNELITE_PLUGIN_TOOLBAR_WIDTH + (visiblePanel ? RUNELITE_PLUGIN_WRAPPED_WIDTH : 0)
    : 0;
  // Source: Client.getStretchedDimensions() uses the canvas parent width/height directly; shell chrome is outside this area.
  const parentWidth = Math.max(1, windowSize.width - sidebarWidth);
  const parentHeight = Math.max(1, windowSize.height);
  let width = parentWidth;
  let height = parentHeight;

  if (config.keepAspectRatio) {
    const aspect = RUNELITE_FIXED_CLIENT_WIDTH / RUNELITE_FIXED_CLIENT_HEIGHT;
    const aspectWidth = Math.trunc(height * aspect);
    if (aspectWidth > width) {
      height = Math.trunc(width / aspect);
    } else {
      width = aspectWidth;
    }
  }

  if (config.integerScaling) {
    if (width > RUNELITE_FIXED_CLIENT_WIDTH) {
      width -= width % RUNELITE_FIXED_CLIENT_WIDTH;
    }
    if (height > RUNELITE_FIXED_CLIENT_HEIGHT) {
      height -= height % RUNELITE_FIXED_CLIENT_HEIGHT;
    }
  }

  return {
    enabled: true,
    parentWidth,
    parentHeight,
    width,
    height,
    offsetX: Math.trunc((parentWidth - width) / 2),
    offsetY: 0,
    scaleX: width / RUNELITE_FIXED_CLIENT_WIDTH,
    scaleY: height / RUNELITE_FIXED_CLIENT_HEIGHT,
    imageRendering: config.increasedPerformance ? "pixelated" : undefined
  };
}

function runeliteClampedOverlayLocation(
  location: RuneliteOverlayPreferredLocation,
  movingOverlay: RuneliteMovingOverlayState
): RuneliteOverlayPreferredLocation {
  const maxX = Math.max(0, RUNELITE_FIXED_CLIENT_WIDTH - Math.round(movingOverlay.width));
  const maxY = Math.max(0, RUNELITE_FIXED_CLIENT_HEIGHT - Math.round(movingOverlay.height));
  return {
    x: Math.max(0, Math.min(maxX, Math.round(location.x))),
    y: Math.max(0, Math.min(maxY, Math.round(location.y)))
  };
}

function RuneliteConfigurationPanel({
  pinnedPluginIds,
  enabledPluginIds,
  configValuesByPluginId,
  openConfigRequest,
  onPinnedToggle,
  onEnabledToggle,
  onResetConfigValues,
  onConfigValueChange
}: {
  readonly pinnedPluginIds: ReadonlySet<string>;
  readonly enabledPluginIds: ReadonlySet<string>;
  readonly configValuesByPluginId: Readonly<Record<string, Readonly<Record<string, RuneliteConfigValue>>>>;
  readonly openConfigRequest: RuneliteOpenConfigRequest | null;
  readonly onPinnedToggle: (pluginId: string) => void;
  readonly onEnabledToggle: (pluginId: string) => void;
  readonly onResetConfigValues: (pluginId: string) => void;
  readonly onConfigValueChange: (pluginId: string, keyName: string, value: RuneliteConfigValue) => void;
}): JSX.Element {
  const [search, setSearch] = useState("");
  const [activeConfigPluginId, setActiveConfigPluginId] = useState<string | null>(null);
  const clientShellConfigValues = configValuesByPluginId[RUNELITE_CLIENT_SHELL_CONFIG_PLUGIN_ID] ?? {};

  useEffect(() => {
    if (!openConfigRequest || !findRuneliteConfigDescriptor(openConfigRequest.pluginId)) {
      return;
    }

    setSearch("");
    setActiveConfigPluginId(openConfigRequest.pluginId);
  }, [openConfigRequest]);

  const matchingItems = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const sortedItems = sortRuneliteConfigPluginListItems(runeliteTrainerAvailablePluginListItems(), clientShellConfigValues);
    const visible = sortedItems.filter(
      (item) => !runeliteConfigPluginHiddenByCategory(item.pluginType, clientShellConfigValues) && matchesRunelitePluginSearchTerms(item, terms)
    );
    const pinned = visible.filter((item) => pinnedPluginIds.has(item.id));
    const unpinned = visible.filter((item) => !pinnedPluginIds.has(item.id));
    return [...pinned, ...unpinned];
  }, [clientShellConfigValues, pinnedPluginIds, search]);

  if (activeConfigPluginId) {
    const activeItem = runeliteTrainerAvailablePluginListItems().find((item) => item.id === activeConfigPluginId) ?? null;
    const descriptor = findRuneliteConfigDescriptor(activeConfigPluginId);

    if (activeItem && descriptor) {
      const activeItemColor = runeliteConfigPluginColorByCategory(activeItem.pluginType, clientShellConfigValues);
      return (
        <RuneliteConfigurationDetailPanel
          item={activeItem}
          descriptor={descriptor}
          enabled={enabledPluginIds.has(activeItem.id)}
          pluginBacked={activeItem.pluginBacked}
          pluginListColor={activeItemColor}
          values={configValuesByPluginId[activeItem.id] ?? buildDefaultRuneliteConfigValueMap(descriptor)}
          onBack={() => setActiveConfigPluginId(null)}
          onEnabledToggle={() => onEnabledToggle(activeItem.id)}
          onReset={() => onResetConfigValues(activeItem.id)}
          onValueChange={(keyName, value) => onConfigValueChange(activeItem.id, keyName, value)}
        />
      );
    }
  }

  return (
    <div
      className="runeliteConfigPanel"
      data-source-panel="ConfigPanel extends PluginPanel"
      data-source-search="IconTextField.Icon.SEARCH"
      data-source-search-match={RUNELITE_CONFIG_PLUGIN_SEARCH_SOURCE}
      data-source-list="ConfigPanel.openConfigList"
      data-source-list-sort={RUNELITE_CONFIG_PLUGIN_SORT_SOURCE}
      data-source-list-hidden={RUNELITE_CONFIG_PLUGIN_HIDDEN_SOURCE}
      data-source-pinned={RUNELITE_PINNED_PLUGINS_CONFIG_SOURCE}
    >
      <div className="runeliteConfigTopPanel" data-source-border="new EmptyBorder(10, 10, 10, 10)">
        <RuneliteIconTextField
          className="runeliteConfigSearch"
          ariaLabel="Search plugins"
          icon="search"
          value={search}
          onChange={setSearch}
          data-source-config-search="ConfigPanel searchBar.setIcon(IconTextField.Icon.SEARCH); setPreferredSize(PANEL_WIDTH - 20, 30); setBackground(DARKER_GRAY); setHoverBackgroundColor(DARK_GRAY_HOVER); getDocument().addDocumentListener(onSearchBarChanged)"
          data-source-size={`${RUNELITE_CONFIG_SEARCH_WIDTH}x${RUNELITE_CONFIG_SEARCH_HEIGHT}`}
        />
      </div>
      <div className="runeliteConfigList" data-source-layout="DynamicGridLayout(0, 1, 0, 5)">
        {matchingItems.map((item) => (
          <RuneliteConfigurationListItem
            key={item.id}
            item={item}
            pinned={pinnedPluginIds.has(item.id)}
            enabled={enabledPluginIds.has(item.id)}
            pluginBacked={item.pluginBacked}
            pluginListColor={runeliteConfigPluginColorByCategory(item.pluginType, clientShellConfigValues)}
            onPinnedToggle={() => onPinnedToggle(item.id)}
            onEnabledToggle={() => onEnabledToggle(item.id)}
            onConfigOpen={() => setActiveConfigPluginId(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function RuneliteIconTextField({
  className,
  ariaLabel,
  icon,
  value,
  onChange,
  ...dataAttributes
}: {
  readonly className?: string;
  readonly ariaLabel: string;
  readonly icon: "search";
  readonly value: string;
  readonly onChange: (value: string) => void;
} & Record<`data-${string}`, string>): JSX.Element {
  const iconPath = icon === "search" ? "runelite-ui/search.png" : "";
  return (
    <label
      className={["runeliteIconTextField", className].filter(Boolean).join(" ")}
      data-source-component="IconTextField"
      data-source-layout={RUNELITE_ICON_TEXT_FIELD_LAYOUT_SOURCE}
      data-source-clear={RUNELITE_ICON_TEXT_FIELD_CLEAR_SOURCE}
      data-source-hover={RUNELITE_ICON_TEXT_FIELD_HOVER_SOURCE}
      data-source-flat-text-field={RUNELITE_FLAT_TEXT_FIELD_SOURCE}
      data-clear-visible={value ? "true" : "false"}
      {...dataAttributes}
    >
      <span className="runeliteIconTextFieldIcon" data-source-size="iconWrapperLabel.setPreferredSize(new Dimension(30, 0))">
        <img src={iconPath} alt="" draggable={false} data-source-icon={`IconTextField.Icon.${icon.toUpperCase()}`} />
      </span>
      <span className="runeliteFlatTextField" data-source-border="new EmptyBorder(0, 10, 0, 0)">
        <input
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          spellCheck={false}
          data-source-selection="setSelectedTextColor(Color.WHITE); setSelectionColor(ColorScheme.BRAND_BLUE_TRANSPARENT)"
        />
      </span>
      {value ? (
        <button
          className="runeliteIconTextFieldClear"
          type="button"
          aria-label={`Clear ${ariaLabel}`}
          data-source-visible="DocumentListener clearButton.setVisible(!getText().isEmpty())"
          onMouseDown={(event) => {
            event.preventDefault();
            onChange("");
          }}
          onClick={() => onChange("")}
        >
          x
        </button>
      ) : null}
    </label>
  );
}

function RuneliteConfigurationListItem({
  item,
  pinned,
  enabled,
  pluginBacked,
  pluginListColor,
  onPinnedToggle,
  onEnabledToggle,
  onConfigOpen
}: {
  readonly item: RuneliteConfigPluginListItemModel;
  readonly pinned: boolean;
  readonly enabled: boolean;
  readonly pluginBacked: boolean;
  readonly pluginListColor: string | null;
  readonly onPinnedToggle: () => void;
  readonly onEnabledToggle: () => void;
  readonly onConfigOpen: () => void;
}): JSX.Element {
  return (
    <div
      className="runelitePluginListItem"
      data-plugin-list-item-id={item.id}
      data-plugin-type={item.pluginType}
      data-plugin-enabled={enabled ? "true" : "false"}
      data-plugin-pinned={pinned ? "true" : "false"}
      data-plugin-backed={pluginBacked ? "true" : "false"}
      data-navigation-source={item.sourcePath}
      data-source-size={`${RUNELITE_PLUGIN_PANEL_WIDTH}x${RUNELITE_CONFIG_LIST_ITEM_HEIGHT}`}
      data-source-list-item="PluginListItem"
      data-source-toggle={RUNELITE_PLUGIN_LIST_ITEM_TOGGLE_SOURCE}
      data-source-category-order={RUNELITE_CONFIG_PLUGIN_ORDER_SOURCE}
      data-source-category-color={RUNELITE_CONFIG_PLUGIN_COLOR_SOURCE}
      title={item.description ? `${item.name}: ${item.description}` : item.name}
    >
      <button
        className="runelitePluginPinButton"
        type="button"
        aria-label={pinned ? `Unpin ${item.name}` : `Pin ${item.name}`}
        aria-pressed={pinned}
        onClick={onPinnedToggle}
      >
        <img
          className={runelitePluginListItemStarClassName(pinned)}
          src="runelite-ui/star_on.png"
          alt=""
          draggable={false}
          data-source-icon={pinned ? "PluginListItem.ON_STAR" : "PluginListItem.OFF_STAR"}
          data-source-image-transform={pinned ? RUNELITE_PLUGIN_LIST_ITEM_ON_ICON_SOURCE : RUNELITE_PLUGIN_LIST_ITEM_OFF_STAR_SOURCE}
        />
      </button>
      <div className="runelitePluginListName" style={pluginListColor ? { color: pluginListColor } : undefined}>
        {item.name}
      </div>
      <div className="runelitePluginListActions">
        {item.configurable ? (
          <button
            className="runelitePluginConfigButton"
            type="button"
            aria-label={`Edit ${item.name} configuration`}
            onClick={onConfigOpen}
          >
            <img src="runelite-ui/config_edit_icon.png" alt="" draggable={false} />
          </button>
        ) : (
          <span className="runelitePluginConfigButton" aria-hidden="true" />
        )}
        {pluginBacked ? (
          <button
            className="runelitePluginToggleButton"
            type="button"
            aria-label={enabled ? `Disable ${item.name}` : `Enable ${item.name}`}
            aria-pressed={enabled}
            onClick={onEnabledToggle}
            data-source-toggle={RUNELITE_PLUGIN_LIST_ITEM_TOGGLE_SOURCE}
          >
            <img
              className={runelitePluginListItemSwitcherClassName(enabled)}
              src="runelite-ui/switcher_on.png"
              alt=""
              draggable={false}
              data-source-icon={enabled ? "PluginListItem.ON_SWITCHER" : "PluginListItem.OFF_SWITCHER"}
              data-source-image-transform={enabled ? RUNELITE_PLUGIN_LIST_ITEM_ON_ICON_SOURCE : RUNELITE_PLUGIN_LIST_ITEM_OFF_SWITCHER_SOURCE}
            />
          </button>
        ) : (
          <span
            className="runelitePluginToggleButton runelitePluginToggleButton-hidden"
            aria-hidden="true"
            data-source-toggle={RUNELITE_PLUGIN_LIST_ITEM_TOGGLE_SOURCE}
          />
        )}
      </div>
    </div>
  );
}

function RuneliteConfigurationDetailPanel({
  item,
  descriptor,
  enabled,
  pluginBacked,
  pluginListColor,
  values,
  onBack,
  onEnabledToggle,
  onReset,
  onValueChange
}: {
  readonly item: RuneliteConfigPluginListItemModel;
  readonly descriptor: RuneliteConfigDescriptorModel;
  readonly enabled: boolean;
  readonly pluginBacked: boolean;
  readonly pluginListColor: string | null;
  readonly values: Readonly<Record<string, RuneliteConfigValue>>;
  readonly onBack: () => void;
  readonly onEnabledToggle: () => void;
  readonly onReset: () => void;
  readonly onValueChange: (keyName: string, value: RuneliteConfigValue) => void;
}): JSX.Element {
  const [expandedSectionKeys, setExpandedSectionKeys] = useState<ReadonlySet<string>>(() => new Set());
  const visibleItems = descriptor.items
    .filter((configItem) => runeliteConfigItemVisible(configItem, values))
    .sort((a, b) => a.position - b.position);
  const rootItems = visibleItems.filter((configItem) => !configItem.titleSection && !configItem.section);
  const toggleSection = useCallback((sectionKey: string) => {
    setExpandedSectionKeys((current) => {
      const next = new Set(current);

      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }

      return next;
    });
  }, []);

  return (
    <div
      className="runeliteConfigPanel runeliteConfigDetailPanel"
      data-source-panel="ConfigPanel.openGroupConfigPanel"
      data-config-plugin-id={item.id}
      data-config-group={descriptor.group}
      data-navigation-source={descriptor.sourcePath}
      data-source-entry-visibility={RUNELITE_CONFIG_ENTRY_VISIBILITY_SOURCE}
    >
      <div className="runeliteConfigDetailTopPanel" data-source-border="new EmptyBorder(10, 10, 10, 10)">
        <button
          className="runeliteConfigBackButton"
          type="button"
          aria-label="Back"
          title="Back"
          onClick={onBack}
          data-source-preferred-width={RUNELITE_CONFIG_BACK_BUTTON_WIDTH}
        >
          <img src="runelite-ui/config_back_icon.png" alt="" draggable={false} />
        </button>
        <div
          className="runeliteConfigDetailTitle"
          title={item.description ? `${item.name}: ${item.description}` : item.name}
          style={pluginListColor ? { color: pluginListColor } : undefined}
          data-source-title-color={RUNELITE_CONFIG_DETAIL_TITLE_COLOR_SOURCE}
        >
          {item.name}
        </div>
        {pluginBacked ? (
          <button
            className="runelitePluginToggleButton runeliteConfigDetailToggleButton"
            type="button"
            aria-label={enabled ? `Disable ${item.name}` : `Enable ${item.name}`}
            aria-pressed={enabled}
            onClick={onEnabledToggle}
            data-source-toggle={RUNELITE_PLUGIN_LIST_ITEM_TOGGLE_SOURCE}
          >
            <img
              className={runelitePluginListItemSwitcherClassName(enabled)}
              src="runelite-ui/switcher_on.png"
              alt=""
              draggable={false}
              data-source-icon={enabled ? "PluginListItem.ON_SWITCHER" : "PluginListItem.OFF_SWITCHER"}
              data-source-image-transform={enabled ? RUNELITE_PLUGIN_LIST_ITEM_ON_ICON_SOURCE : RUNELITE_PLUGIN_LIST_ITEM_OFF_SWITCHER_SOURCE}
            />
          </button>
        ) : (
          <span
            className="runelitePluginToggleButton runeliteConfigDetailToggleButton runelitePluginToggleButton-hidden"
            aria-hidden="true"
            data-source-toggle={RUNELITE_PLUGIN_LIST_ITEM_TOGGLE_SOURCE}
          />
        )}
      </div>
      <div className="runeliteConfigDetailList" data-source-layout="DynamicGridLayout(0, 1, 0, 5)">
        {rootItems.map((configItem) => (
          <RuneliteConfigEntry
            key={configItem.keyName}
            item={configItem}
            value={values[configItem.keyName] ?? configItem.defaultValue}
            onValueChange={(value) => onValueChange(configItem.keyName, value)}
          />
        ))}
        {descriptor.titleSections
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((section) => (
            <RuneliteConfigTitleSection
              key={section.keyName}
              section={section}
              items={visibleItems.filter((configItem) => configItem.titleSection === section.keyName)}
              values={values}
              onValueChange={onValueChange}
            />
          ))}
        {descriptor.sections
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((section) => (
            <RuneliteConfigSection
              key={section.keyName}
              section={section}
              expanded={expandedSectionKeys.has(section.keyName)}
              items={visibleItems.filter((configItem) => configItem.section === section.keyName)}
              values={values}
              onToggle={() => toggleSection(section.keyName)}
              onValueChange={onValueChange}
            />
          ))}
        <button className="runeliteConfigFooterButton" type="button" onClick={onReset}>
          Reset
        </button>
        <button className="runeliteConfigFooterButton" type="button" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function RuneliteConfigTitleSection({
  section,
  items,
  values,
  onValueChange
}: {
  readonly section: RuneliteConfigTitleSectionModel;
  readonly items: readonly RuneliteConfigItemModel[];
  readonly values: Readonly<Record<string, RuneliteConfigValue>>;
  readonly onValueChange: (keyName: string, value: RuneliteConfigValue) => void;
}): JSX.Element | null {
  const sortedItems = items.slice().sort((a, b) => a.position - b.position);
  if (sortedItems.length === 0) {
    return null;
  }

  return (
    <section className="runeliteConfigTitleSection" data-config-title-section={section.keyName} title={section.description || undefined}>
      <div className="runeliteConfigTitleSectionHeader">{section.name}</div>
      <div className="runeliteConfigTitleSectionContents" data-source-border="new EmptyBorder(OFFSET, 5, 0, 0)">
        {sortedItems.map((configItem) => (
          <RuneliteConfigEntry
            key={configItem.keyName}
            item={configItem}
            value={values[configItem.keyName] ?? configItem.defaultValue}
            onValueChange={(value) => onValueChange(configItem.keyName, value)}
          />
        ))}
      </div>
    </section>
  );
}

function RuneliteConfigSection({
  section,
  expanded,
  items,
  values,
  onToggle,
  onValueChange
}: {
  readonly section: RuneliteConfigSectionModel;
  readonly expanded: boolean;
  readonly items: readonly RuneliteConfigItemModel[];
  readonly values: Readonly<Record<string, RuneliteConfigValue>>;
  readonly onToggle: () => void;
  readonly onValueChange: (keyName: string, value: RuneliteConfigValue) => void;
}): JSX.Element | null {
  const sortedItems = items.slice().sort((a, b) => a.position - b.position);
  if (sortedItems.length === 0) {
    return null;
  }

  return (
    <section
      className="runeliteConfigCollapsibleSection"
      data-config-section={section.keyName}
      data-section-expanded={expanded ? "true" : "false"}
      data-source-toggle={RUNELITE_CONFIG_SECTION_TOGGLE_SOURCE}
    >
      <button
        className="runeliteConfigSectionHeader"
        type="button"
        title={section.description ? `${section.name}: ${section.description}` : section.name}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="runeliteConfigSectionIcon" data-source-icon={expanded ? "SECTION_RETRACT_ICON" : "SECTION_EXPAND_ICON"}>
          <img src="runelite-ui/config_back_icon.png" alt="" draggable={false} />
        </span>
        <span>{section.name}</span>
      </button>
      <div
        className="runeliteConfigSectionContents"
        data-source-border="new EmptyBorder(OFFSET, 5, 0, 0)"
        data-source-section-visible={expanded ? "true" : "false"}
        hidden={!expanded}
      >
        {sortedItems.map((configItem) => (
          <RuneliteConfigEntry
            key={configItem.keyName}
            item={configItem}
            value={values[configItem.keyName] ?? configItem.defaultValue}
            onValueChange={(value) => onValueChange(configItem.keyName, value)}
          />
        ))}
      </div>
    </section>
  );
}

function RuneliteConfigEntry({
  item,
  value,
  onValueChange
}: {
  readonly item: RuneliteConfigItemModel;
  readonly value: RuneliteConfigValue;
  readonly onValueChange: (value: RuneliteConfigValue) => void;
}): JSX.Element {
  return (
    <label
      className={`runeliteConfigEntry runeliteConfigEntry-${item.type}`}
      data-config-item-key={item.keyName}
      title={item.description ? `${item.name}: ${item.description}` : item.name}
    >
      <span className="runeliteConfigEntryName">{item.name}</span>
      <RuneliteConfigControl item={item} value={value} onValueChange={onValueChange} />
    </label>
  );
}

function RuneliteConfigControl({
  item,
  value,
  onValueChange
}: {
  readonly item: RuneliteConfigItemModel;
  readonly value: RuneliteConfigValue;
  readonly onValueChange: (value: RuneliteConfigValue) => void;
}): JSX.Element {
  if (item.type === "boolean") {
    return (
      <input
        className="runeliteConfigCheckbox"
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => onValueChange(event.currentTarget.checked)}
        data-source-component="JCheckBox"
      />
    );
  }

  if (item.type === "range") {
    const min = item.min ?? 0;
    const max = item.max ?? 100;
    const numericValue = typeof value === "number" ? value : Number(value);
    const clampedValue = Number.isFinite(numericValue) ? Math.min(max, Math.max(min, numericValue)) : Number(item.defaultValue);

    return (
      <span className="runeliteConfigSliderRow" data-source-size={`${RUNELITE_CONFIG_SLIDER_ROW_WIDTH}x25`}>
        <span className="runeliteConfigSliderValue">{clampedValue}</span>
        <input
          className="runeliteConfigSlider"
          type="range"
          min={min}
          max={max}
          value={clampedValue}
          onChange={(event) => onValueChange(Number(event.currentTarget.value))}
          data-source-component="JSlider"
          data-source-width={RUNELITE_CONFIG_SLIDER_WIDTH}
        />
      </span>
    );
  }

  if (item.type === "number") {
    const min = item.min ?? Number.MIN_SAFE_INTEGER;
    const max = item.max ?? Number.MAX_SAFE_INTEGER;
    const numericValue = typeof value === "number" ? value : Number(value);
    const clampedValue = Number.isFinite(numericValue) ? Math.min(max, Math.max(min, numericValue)) : Number(item.defaultValue);

    return (
      <input
        className="runeliteConfigNumberInput"
        type="number"
        min={min}
        max={max}
        value={clampedValue}
        onChange={(event) => {
          const nextValue = Number(event.currentTarget.value);
          if (Number.isFinite(nextValue)) {
            onValueChange(Math.min(max, Math.max(min, nextValue)));
          }
        }}
        data-source-component="JSpinner trainer-extension"
      />
    );
  }

  if (item.type === "enum") {
    return (
      <select
        className="runeliteConfigSelect"
        value={String(value)}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        data-source-component="JComboBox"
      >
        {(item.options ?? [String(item.defaultValue)]).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (item.type === "color") {
    const colorValue = String(value).trim();
    const colorButtonColor = colorValue || "#000000";
    const colorButtonLabel = colorValue ? colorValue.toUpperCase() : "Pick a color";

    return (
      <button
        className="runeliteConfigColorButton"
        type="button"
        style={{ backgroundColor: colorButtonColor }}
        data-source-component="RuneliteColorPicker"
        data-source-color-picker={RUNELITE_CONFIG_COLOR_PICKER_SOURCE}
        onClick={() => onValueChange(colorButtonColor)}
      >
        {colorButtonLabel}
      </button>
    );
  }

  if (item.type === "modifierless-keybind") {
    const fallback = runeliteNormalizeKeyRemappingKeybind(
      String(item.defaultValue),
      RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT.esc
    );
    const displayValue = runeliteKeyRemappingKeybindDisplayText(value, fallback);

    return (
      <button
        className="runeliteConfigHotkeyButton"
        type="button"
        data-source-component="HotkeyButton"
        data-source-keybind-type="ModifierlessKeybind"
        data-source-action="addActionListener setValue(Keybind.NOT_SET); KeyAdapter.keyPressed setValue(new ModifierlessKeybind(e))"
        data-source-storage="ConfigManager.objectToString Keybind keyCode:modifiers"
        data-keybind-property={String(value)}
        onClick={() => onValueChange("0:0")}
        onKeyDown={(event) => {
          const nextValue = runeliteKeyRemappingKeybindPropertyFromKeyboardEvent(event.nativeEvent);
          if (!nextValue) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          onValueChange(nextValue);
        }}
      >
        {displayValue}
      </button>
    );
  }

  return (
    <input
      className="runeliteConfigTextInput"
      type="text"
      value={String(value)}
      onChange={(event) => onValueChange(event.currentTarget.value)}
      data-source-component="JTextArea"
    />
  );
}

function buildDefaultRuneliteConfigValues(): Record<string, Record<string, RuneliteConfigValue>> {
  return Object.fromEntries(
    runeliteConfigDescriptors.map((descriptor) => [descriptor.id, buildDefaultRuneliteConfigValueMap(descriptor)])
  );
}

function buildInitialRuneliteConfigValues(): Record<string, Record<string, RuneliteConfigValue>> {
  const valuesByPluginId = buildDefaultRuneliteConfigValues();
  const properties = readRuneliteConfigProperties();

  for (const descriptor of runeliteConfigDescriptors) {
    const values = valuesByPluginId[descriptor.id] ?? {};
    for (const item of descriptor.items) {
      const stored = properties[runeliteConfigPropertyKey(descriptor.group, item.keyName)];
      if (stored !== undefined) {
        values[item.keyName] = runeliteConfigValueFromProperty(item, stored);
      }
    }
    valuesByPluginId[descriptor.id] = values;
  }

  return valuesByPluginId;
}

function buildRuneliteClientConfigSnapshot(
  enabledPluginIds: ReadonlySet<string>,
  configValuesByPluginId: Readonly<Record<string, Readonly<Record<string, RuneliteConfigValue>>>>,
  antiDragHotkeyState: RuneliteAntiDragHotkeyState = RUNELITE_INITIAL_ANTI_DRAG_HOTKEY_STATE
): RuneliteClientConfigSnapshot {
  const clientShellValues = configValuesByPluginId[RUNELITE_CLIENT_SHELL_CONFIG_PLUGIN_ID] ?? {};
  const runeliteValues = configValuesByPluginId.runelite ?? {};
  const stretchedModeValues = configValuesByPluginId[RUNELITE_STRETCHED_MODE_PLUGIN_ID] ?? {};
  const gpuValues = configValuesByPluginId.gpu ?? {};
  const animationSmoothingValues = configValuesByPluginId["animation-smoothing"] ?? {};
  const antiDragValues = configValuesByPluginId["anti-drag"] ?? {};
  const customCursorValues = configValuesByPluginId["custom-cursor"] ?? {};
  const keyRemappingValues = configValuesByPluginId[RUNELITE_KEY_REMAPPING_PLUGIN_ID] ?? {};
  const mouseHighlightValues = configValuesByPluginId[RUNELITE_MOUSE_HIGHLIGHT_PLUGIN_ID] ?? {};
  const entityHiderValues = configValuesByPluginId["entity-hider"] ?? {};
  const freezeTimersValues = configValuesByPluginId["freeze-timers"] ?? {};
  const timersValues = configValuesByPluginId.timers ?? {};
  const attackStylesValues = configValuesByPluginId["attack-styles"] ?? {};
  const statusBarsValues = configValuesByPluginId["status-bars"] ?? {};
  const statusOrbsValues = configValuesByPluginId["status-orbs"] ?? {};
  const boostsValues = configValuesByPluginId["boosts-information"] ?? {};
  const prayerValues = configValuesByPluginId.prayer ?? {};
  const opponentInfoValues = configValuesByPluginId["opponent-info"] ?? {};
  const playerIndicatorsValues = configValuesByPluginId["player-indicators"] ?? {};
  const tileIndicatorsValues = configValuesByPluginId["tile-indicators"] ?? {};
  const pvpPerformanceTrackerValues = configValuesByPluginId["pvp-performance-tracker"] ?? {};
  const suppliesTrackerValues = configValuesByPluginId["supplies-tracker"] ?? {};
  const pvpToolsValues = configValuesByPluginId["pvp-tools"] ?? {};
  const prayAgainstPlayerValues = configValuesByPluginId[RUNELITE_PRAY_AGAINST_PLAYER_PLUGIN_ID] ?? {};
  const xpDropValues = configValuesByPluginId["xp-drop"] ?? {};
  const clientShellEnableOpacity = runeliteConfigBoolean(
    clientShellValues.enableOpacity,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.clientShell.enableOpacity
  );
  const clientShellOpacityPercentage = runeliteConfigPercentage(
    clientShellValues.opacityPercentage,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.clientShell.opacityPercentage,
    15,
    100
  );
  const runeliteAutomaticResizeType = runeliteExpandResizeType(
    runeliteValues.automaticResizeType,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.frame.automaticResizeType
  );
  const runeliteLockWindowSize = runeliteConfigBoolean(
    runeliteValues.lockWindowSize,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.frame.lockWindowSize
  );
  const runeliteContainInScreen = runeliteContainInScreenMode(
    runeliteValues.containInScreen2,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.frame.containInScreen
  );
  const runeliteEnableCustomChrome = runeliteConfigBoolean(
    runeliteValues.uiEnableCustomChrome,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.frame.enableCustomChrome
  );
  const runeliteUsernameInTitle = runeliteConfigBoolean(
    runeliteValues.usernameInTitle,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.frame.usernameInTitle
  );
  const runeliteRememberScreenBounds = runeliteConfigBoolean(
    runeliteValues.rememberScreenBounds,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.frame.rememberScreenBounds
  );
  const runeliteGameAlwaysOnTop = runeliteConfigBoolean(
    runeliteValues.gameAlwaysOnTop,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.frame.gameAlwaysOnTop
  );
  const runeliteWarningOnExitValue = runeliteWarningOnExitMode(
    runeliteValues.warningOnExit,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.frame.warningOnExit
  );
  const stretchedModeEnabled = enabledPluginIds.has(RUNELITE_STRETCHED_MODE_PLUGIN_ID);
  const antiDragEnabled = enabledPluginIds.has("anti-drag");
  const customCursorEnabled = enabledPluginIds.has("custom-cursor");
  const keyRemappingEnabled = enabledPluginIds.has(RUNELITE_KEY_REMAPPING_PLUGIN_ID);
  const mouseHighlightEnabled = enabledPluginIds.has(RUNELITE_MOUSE_HIGHLIGHT_PLUGIN_ID);
  const entityHiderEnabled = enabledPluginIds.has("entity-hider");
  const hideUnderEnabled = enabledPluginIds.has(RUNELITE_HIDE_UNDER_PLUGIN_ID);
  const freezeTimersEnabled = enabledPluginIds.has("freeze-timers");
  const timersEnabled = enabledPluginIds.has("timers");
  const attackStylesEnabled =
    enabledPluginIds.has("attack-styles") && !RUNELITE_TRAINER_DISABLED_PLUGIN_IDS.has("attack-styles");
  const statusBarsEnabled = enabledPluginIds.has("status-bars");
  const statusOrbsEnabled = enabledPluginIds.has("status-orbs");
  const boostsEnabled = enabledPluginIds.has("boosts-information");
  const prayerEnabled = enabledPluginIds.has("prayer");
  const opponentInfoEnabled = enabledPluginIds.has("opponent-info");
  const playerIndicatorsEnabled = enabledPluginIds.has("player-indicators");
  const tileIndicatorsEnabled = enabledPluginIds.has("tile-indicators");
  const pvpPerformanceTrackerEnabled = enabledPluginIds.has("pvp-performance-tracker");
  const suppliesTrackerEnabled = enabledPluginIds.has("supplies-tracker");
  const pvpToolsEnabled = enabledPluginIds.has("pvp-tools");
  const prayAgainstPlayerEnabled = enabledPluginIds.has(RUNELITE_PRAY_AGAINST_PLAYER_PLUGIN_ID);
  const xpDropEnabled = enabledPluginIds.has("xp-drop");
  const antiDragAlwaysOn = runeliteConfigBoolean(
    antiDragValues.alwaysOn,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.antiDrag.alwaysOn
  );
  const antiDragToggleKeyBind = runeliteConfigBoolean(
    antiDragValues.toggleKeyBind,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.antiDrag.toggleKeyBind
  );
  const antiDragHoldKeyBind = runeliteConfigBoolean(
    antiDragValues.holdKeyBind,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.antiDrag.holdKeyBind
  );
  const antiDragKey = runeliteConfigString(antiDragValues.key, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.antiDrag.key);
  const antiDragReqFocus = runeliteConfigBoolean(
    antiDragValues.reqFocus,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.antiDrag.reqFocus
  );
  const antiDragOverlay = runeliteConfigBoolean(
    antiDragValues.overlay,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.antiDrag.overlay
  );
  const antiDragOverlayColor = runeliteConfigString(
    antiDragValues.color,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.antiDrag.overlayColor
  );
  const antiDragChangeCursor = runeliteConfigBoolean(
    antiDragValues.changeCursor,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.antiDrag.changeCursor
  );
  const antiDragCursorStyle = runeliteConfigString(
    antiDragValues.cursorStyle,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.antiDrag.cursorStyle
  );
  const antiDragDelayClientTicks = runeliteConfigNumber(
    antiDragValues.dragDelay,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.antiDrag.dragDelayClientTicks
  );
  const antiDragHotkeyActive =
    (antiDragToggleKeyBind && antiDragHotkeyState.toggleDrag) || (antiDragHoldKeyBind && antiDragHotkeyState.holdDrag);
  const customCursorStyle = runeliteConfigString(
    customCursorValues.cursorStyle,
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.customCursor.cursorStyle
  );
  return {
    clientShell: {
      enableOpacity: clientShellEnableOpacity,
      opacityPercentage: clientShellOpacityPercentage,
      effectiveOpacity: clientShellEnableOpacity ? clientShellOpacityPercentage / 100 : 1
    },
    frame: {
      automaticResizeType: runeliteAutomaticResizeType,
      lockWindowSize: runeliteLockWindowSize,
      containInScreen: runeliteContainInScreen,
      enableCustomChrome: runeliteEnableCustomChrome,
      usernameInTitle: runeliteUsernameInTitle,
      rememberScreenBounds: runeliteRememberScreenBounds,
      gameAlwaysOnTop: runeliteGameAlwaysOnTop,
      warningOnExit: runeliteWarningOnExitValue
    },
    stretchedMode: {
      enabled: stretchedModeEnabled,
      keepAspectRatio: runeliteConfigBoolean(
        stretchedModeValues.keepAspectRatio,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.stretchedMode.keepAspectRatio
      ),
      increasedPerformance: runeliteConfigBoolean(
        stretchedModeValues.increasedPerformance,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.stretchedMode.increasedPerformance
      ),
      integerScaling: runeliteConfigBoolean(
        stretchedModeValues.integerScaling,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.stretchedMode.integerScaling
      ),
      scalingFactor: runeliteConfigPercentage(
        stretchedModeValues.scalingFactor,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.stretchedMode.scalingFactor,
        0,
        100
      )
    },
    infoBox: {
      vertical: runeliteConfigBoolean(runeliteValues.infoBoxVertical, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.infoBox.vertical),
      wrap: runeliteConfigNumber(runeliteValues.infoBoxWrap, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.infoBox.wrap),
      size: runeliteConfigNumber(runeliteValues.infoBoxSize, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.infoBox.size)
    },
    overlayMenu: {
      requireShift: runeliteConfigBoolean(runeliteValues.menuEntryShift, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.overlayMenu.requireShift)
    },
    gpu: {
      enabled: enabledPluginIds.has("gpu"),
      drawDistance: runeliteConfigNumber(gpuValues.drawDistance, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.gpu.drawDistance),
      smoothBanding: Boolean(gpuValues.smoothBanding),
      antiAliasingMode: runeliteConfigString(gpuValues.antiAliasingMode, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.gpu.antiAliasingMode),
      anisotropicFilteringMode: runeliteConfigString(
        gpuValues.anisotropicFilteringMode,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.gpu.anisotropicFilteringMode
      ),
      fogDepth: runeliteConfigNumber(gpuValues.fogDepth, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.gpu.fogDepth),
      fogCircularity: runeliteConfigNumber(gpuValues.fogCircularity, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.gpu.fogCircularity),
      fogDensity: runeliteConfigNumber(gpuValues.fogDensity, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.gpu.fogDensity)
    },
    animationSmoothing: {
      enabled: enabledPluginIds.has("animation-smoothing"),
      smoothPlayerAnimations: runeliteConfigBoolean(
        animationSmoothingValues.smoothPlayerAnimations,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.animationSmoothing.smoothPlayerAnimations
      ),
      smoothNpcAnimations: runeliteConfigBoolean(
        animationSmoothingValues.smoothNpcAnimations,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.animationSmoothing.smoothNpcAnimations
      ),
      smoothObjectAnimations: runeliteConfigBoolean(
        animationSmoothingValues.smoothObjectAnimations,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.animationSmoothing.smoothObjectAnimations
      ),
      smoothWidgetAnimations: runeliteConfigBoolean(
        animationSmoothingValues.smoothWidgetAnimations,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.animationSmoothing.smoothWidgetAnimations
      )
    },
    antiDrag: {
      enabled: antiDragEnabled,
      alwaysOn: antiDragAlwaysOn,
      toggleKeyBind: antiDragToggleKeyBind,
      holdKeyBind: antiDragHoldKeyBind,
      key: antiDragKey,
      reqFocus: antiDragReqFocus,
      overlay: antiDragOverlay,
      overlayColor: antiDragOverlayColor,
      changeCursor: antiDragChangeCursor,
      cursorStyle: antiDragCursorStyle,
      dragDelayClientTicks: antiDragDelayClientTicks,
      hotkeyActive: antiDragHotkeyActive,
      effectiveDragDelayClientTicks:
        antiDragEnabled && (antiDragAlwaysOn || antiDragHotkeyActive)
          ? antiDragDelayClientTicks
          : RUNELITE_ANTI_DRAG_DEFAULT_DELAY_CLIENT_TICKS
    },
    customCursor: {
      enabled: customCursorEnabled,
      cursorStyle: customCursorStyle
    },
    keyRemapping: {
      enabled: keyRemappingEnabled,
      hideDisplayName: runeliteConfigBoolean(
        keyRemappingValues.hideDisplayName,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.hideDisplayName
      ),
      cameraRemap: runeliteConfigBoolean(
        keyRemappingValues.cameraRemap,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.cameraRemap
      ),
      up: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.up, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.up.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.up
      ),
      down: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.down, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.down.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.down
      ),
      left: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.left, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.left.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.left
      ),
      right: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.right, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.right.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.right
      ),
      fkeyRemap: runeliteConfigBoolean(
        keyRemappingValues.fkeyRemap,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.fkeyRemap
      ),
      f1: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.f1, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f1.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f1
      ),
      f2: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.f2, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f2.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f2
      ),
      f3: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.f3, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f3.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f3
      ),
      f4: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.f4, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f4.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f4
      ),
      f5: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.f5, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f5.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f5
      ),
      f6: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.f6, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f6.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f6
      ),
      f7: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.f7, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f7.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f7
      ),
      f8: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.f8, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f8.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f8
      ),
      f9: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.f9, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f9.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f9
      ),
      f10: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.f10, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f10.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f10
      ),
      f11: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.f11, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f11.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f11
      ),
      f12: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.f12, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f12.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.f12
      ),
      esc: runeliteNormalizeKeyRemappingKeybind(
        runeliteConfigString(keyRemappingValues.esc, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.esc.key),
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.keyRemapping.esc
      )
    },
    mouseHighlight: {
      enabled: mouseHighlightEnabled,
      mainTooltip: runeliteConfigBoolean(
        mouseHighlightValues.mainTooltip,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.mouseHighlight.mainTooltip
      ),
      uiTooltip: runeliteConfigBoolean(
        mouseHighlightValues.uiTooltip,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.mouseHighlight.uiTooltip
      ),
      chatboxTooltip: runeliteConfigBoolean(
        mouseHighlightValues.chatboxTooltip,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.mouseHighlight.chatboxTooltip
      ),
      hideSpells: runeliteConfigBoolean(
        mouseHighlightValues.hideSpells,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.mouseHighlight.hideSpells
      ),
      hideCombat: runeliteConfigBoolean(
        mouseHighlightValues.hideCombat,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.mouseHighlight.hideCombat
      ),
      rightClickOptionTooltip: runeliteConfigBoolean(
        mouseHighlightValues.rightclickoptionTooltip,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.mouseHighlight.rightClickOptionTooltip
      )
    },
    entityHider: {
      enabled: entityHiderEnabled,
      isHidingEntities: RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.entityHider.isHidingEntities,
      hidePlayers: runeliteConfigBoolean(
        entityHiderValues.hidePlayers,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.entityHider.hidePlayers
      ),
      hidePlayers2D: runeliteConfigBoolean(
        entityHiderValues.hidePlayers2D,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.entityHider.hidePlayers2D
      ),
      hideSpecificPlayers: runeliteConfigString(
        entityHiderValues.hideSpecificPlayers,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.entityHider.hideSpecificPlayers
      ),
      hideAttackers: runeliteConfigBoolean(
        entityHiderValues.hideAttackers,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.entityHider.hideAttackers
      ),
      hideLocalPlayer: runeliteConfigBoolean(
        entityHiderValues.hideLocalPlayer,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.entityHider.hideLocalPlayer
      ),
      hideLocalPlayer2D: runeliteConfigBoolean(
        entityHiderValues.hideLocalPlayer2D,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.entityHider.hideLocalPlayer2D
      ),
      hideFriends: runeliteConfigBoolean(
        entityHiderValues.hideFriends,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.entityHider.hideFriends
      ),
      hideClanMates: runeliteConfigBoolean(
        entityHiderValues.hideClanMates,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.entityHider.hideClanMates
      ),
      hideNPCs: runeliteConfigBoolean(
        entityHiderValues.hideNPCs,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.entityHider.hideNPCs
      ),
      hideNPCs2D: runeliteConfigBoolean(
        entityHiderValues.hideNPCs2D,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.entityHider.hideNPCs2D
      ),
      hideNPCsNames: runeliteConfigString(
        entityHiderValues.hideNPCsNames,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.entityHider.hideNPCsNames
      ),
      hideDeadNPCs: runeliteConfigBoolean(
        entityHiderValues.hideDeadNPCs,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.entityHider.hideDeadNPCs
      ),
      hideNPCsOnDeath: runeliteConfigString(
        entityHiderValues.hideNPCsOnDeath,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.entityHider.hideNPCsOnDeath
      ),
      hideProjectiles: runeliteConfigBoolean(
        entityHiderValues.hideProjectiles,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.entityHider.hideProjectiles
      )
    },
    hideUnder: {
      enabled: hideUnderEnabled,
      isHidingEntities: RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.hideUnder.isHidingEntities,
      inAllowedRegion: RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.hideUnder.inAllowedRegion,
      targetTimerTicks: RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.hideUnder.targetTimerTicks
    },
    prayAgainstPlayer: {
      enabled: prayAgainstPlayerEnabled,
      attackerPlayerColor: runeliteConfigString(
        prayAgainstPlayerValues.attackerPlayerColor,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.attackerPlayerColor
      ),
      potentialPlayerColor: runeliteConfigString(
        prayAgainstPlayerValues.potentialPlayerColor,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.potentialPlayerColor
      ),
      attackerTargetTimeoutSeconds: runeliteConfigNumber(
        prayAgainstPlayerValues.attackerTargetTimeout,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.attackerTargetTimeoutSeconds
      ),
      potentialTargetTimeoutSeconds: runeliteConfigNumber(
        prayAgainstPlayerValues.potentialTargetTimeout,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.potentialTargetTimeoutSeconds
      ),
      newSpawnTimeoutSeconds: runeliteConfigNumber(
        prayAgainstPlayerValues.newSpawnTimeout,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.newSpawnTimeoutSeconds
      ),
      ignoreFriends: runeliteConfigBoolean(
        prayAgainstPlayerValues.ignoreFriends,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.ignoreFriends
      ),
      ignoreClanMates: runeliteConfigBoolean(
        prayAgainstPlayerValues.ignoreClanMates,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.ignoreClanMates
      ),
      markNewPlayer: runeliteConfigBoolean(
        prayAgainstPlayerValues.markNewPlayer,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.markNewPlayer
      ),
      drawTargetPrayAgainst: runeliteConfigBoolean(
        prayAgainstPlayerValues.drawTargetPrayAgainst,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.drawTargetPrayAgainst
      ),
      drawPotentialTargetPrayAgainst: runeliteConfigBoolean(
        prayAgainstPlayerValues.drawPotentialTargetPrayAgainst,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.drawPotentialTargetPrayAgainst
      ),
      drawTargetPrayAgainstPrayerTab: runeliteConfigBoolean(
        prayAgainstPlayerValues.drawTargetPrayAgainstPrayerTab,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.drawTargetPrayAgainstPrayerTab
      ),
      drawTargetsName: runeliteConfigBoolean(
        prayAgainstPlayerValues.drawTargetsName,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.drawTargetsName
      ),
      drawPotentialTargetsName: runeliteConfigBoolean(
        prayAgainstPlayerValues.drawPotentialTargetsName,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.drawPotentialTargetsName
      ),
      drawTargetHighlight: runeliteConfigBoolean(
        prayAgainstPlayerValues.drawTargetHighlight,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.drawTargetHighlight
      ),
      drawPotentialTargetHighlight: runeliteConfigBoolean(
        prayAgainstPlayerValues.drawPotentialTargetHighlight,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.drawPotentialTargetHighlight
      ),
      drawTargetTile: runeliteConfigBoolean(
        prayAgainstPlayerValues.drawTargetTile,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.drawTargetTile
      ),
      drawPotentialTargetTile: runeliteConfigBoolean(
        prayAgainstPlayerValues.drawPotentialTargetTile,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.drawPotentialTargetTile
      ),
      drawUnknownWeapons: runeliteConfigBoolean(
        prayAgainstPlayerValues.drawUnknownWeapons,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.drawUnknownWeapons
      ),
      logicalHeightClientUnits: RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayAgainstPlayer.logicalHeightClientUnits
    },
    freezeTimers: {
      enabled: freezeTimersEnabled,
      showPlayers: runeliteConfigBoolean(freezeTimersValues.showOverlay, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.freezeTimers.showPlayers),
      showNpcs: runeliteConfigBoolean(freezeTimersValues.showNpcs, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.freezeTimers.showNpcs),
      freezeTimers: runeliteConfigBoolean(
        freezeTimersValues.FreezeTimers,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.freezeTimers.freezeTimers
      ),
      teleblockTimers: runeliteConfigBoolean(freezeTimersValues.TB, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.freezeTimers.teleblockTimers),
      vengeanceTimers: runeliteConfigBoolean(freezeTimersValues.Veng, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.freezeTimers.vengeanceTimers),
      xOffset: runeliteConfigNumber(freezeTimersValues.xoffset, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.freezeTimers.xOffset),
      noImage: runeliteConfigBoolean(freezeTimersValues.noImage, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.freezeTimers.noImage),
      fontStyle: runeliteConfigString(freezeTimersValues.fontStyle, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.freezeTimers.fontStyle),
      textSize: runeliteConfigNumber(freezeTimersValues.textSize, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.freezeTimers.textSize)
    },
    timers: {
      enabled: timersEnabled,
      showFreezes: runeliteConfigBoolean(timersValues.showFreezes, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.timers.showFreezes)
    },
    specBar: {
      enabled: enabledPluginIds.has("spec-bar"),
      drawSpecbarAnyway: enabledPluginIds.has("spec-bar")
    },
    attackStyles: {
      enabled: attackStylesEnabled,
      alwaysShowStyle: runeliteConfigBoolean(
        attackStylesValues.alwaysShowStyle,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.attackStyles.alwaysShowStyle
      ),
      warnForDefence: runeliteConfigBoolean(
        attackStylesValues.warnForDefensive,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.attackStyles.warnForDefence
      ),
      warnForAttack: runeliteConfigBoolean(
        attackStylesValues.warnForAttack,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.attackStyles.warnForAttack
      ),
      warnForStrength: runeliteConfigBoolean(
        attackStylesValues.warnForStrength,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.attackStyles.warnForStrength
      ),
      warnForRanged: runeliteConfigBoolean(
        attackStylesValues.warnForRanged,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.attackStyles.warnForRanged
      ),
      warnForMagic: runeliteConfigBoolean(
        attackStylesValues.warnForMagic,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.attackStyles.warnForMagic
      ),
      hideAutoRetaliate: runeliteConfigBoolean(
        attackStylesValues.hideAutoRetaliate,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.attackStyles.hideAutoRetaliate
      ),
      removeWarnedStyles: runeliteConfigBoolean(
        attackStylesValues.removeWarnedStyles,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.attackStyles.removeWarnedStyles
      )
    },
    statusBars: {
      enabled: statusBarsEnabled,
      enableCounter: runeliteConfigBoolean(statusBarsValues.enableCounter, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.statusBars.enableCounter),
      enableSkillIcon: runeliteConfigBoolean(statusBarsValues.enableSkillIcon, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.statusBars.enableSkillIcon),
      enableRestorationBars: runeliteConfigBoolean(
        statusBarsValues.enableRestorationBars,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.statusBars.enableRestorationBars
      ),
      leftBarMode: runeliteStatusBarMode(statusBarsValues.leftBarMode, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.statusBars.leftBarMode),
      rightBarMode: runeliteStatusBarMode(statusBarsValues.rightBarMode, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.statusBars.rightBarMode),
      toggleRestorationBars: runeliteConfigBoolean(
        statusBarsValues.toggleRestorationBars,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.statusBars.toggleRestorationBars
      ),
      hideStatusBarDelay: runeliteConfigNumber(
        statusBarsValues.hideStatusBarDelay,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.statusBars.hideStatusBarDelay
      )
    },
    statusOrbs: {
      enabled: statusOrbsEnabled,
      dynamicHpHeart: runeliteConfigBoolean(
        statusOrbsValues.dynamicHpHeart,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.statusOrbs.dynamicHpHeart
      ),
      showHitpoints: runeliteConfigBoolean(
        statusOrbsValues.showHitpoints,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.statusOrbs.showHitpoints
      ),
      showWhenNoChange: runeliteConfigBoolean(
        statusOrbsValues.showWhenNoChange,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.statusOrbs.showWhenNoChange
      ),
      notifyBeforeHpRegenSeconds: runeliteConfigNumber(
        statusOrbsValues.notifyBeforeHpRegenDuration,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.statusOrbs.notifyBeforeHpRegenSeconds
      ),
      showSpecial: runeliteConfigBoolean(
        statusOrbsValues.showSpecial,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.statusOrbs.showSpecial
      ),
      showRun: runeliteConfigBoolean(
        statusOrbsValues.showRun,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.statusOrbs.showRun
      ),
      replaceOrbText: runeliteConfigBoolean(
        statusOrbsValues.replaceOrbText,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.statusOrbs.replaceOrbText
      )
    },
    prayer: {
      enabled: prayerEnabled,
      prayerFlickLocation: runelitePrayerFlickLocation(
        prayerValues.prayerFlickLocation,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayer.prayerFlickLocation
      ),
      prayerFlickAlwaysOn: runeliteConfigBoolean(
        prayerValues.prayerFlickAlwaysOn,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayer.prayerFlickAlwaysOn
      ),
      prayerIndicator: runeliteConfigBoolean(prayerValues.prayerIndicator, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayer.prayerIndicator),
      prayerIndicatorOverheads: runeliteConfigBoolean(
        prayerValues.prayerIndicatorOverheads,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayer.prayerIndicatorOverheads
      ),
      showPrayerDoseIndicator: runeliteConfigBoolean(
        prayerValues.showPrayerDoseIndicator,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayer.showPrayerDoseIndicator
      ),
      showPrayerStatistics: runeliteConfigBoolean(
        prayerValues.showPrayerTooltip,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayer.showPrayerStatistics
      ),
      showPrayerBar: runeliteConfigBoolean(prayerValues.showPrayerBar, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayer.showPrayerBar),
      hideIfNotPraying: runeliteConfigBoolean(
        prayerValues.prayerBarHideIfNotPraying,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayer.hideIfNotPraying
      ),
      hideIfOutOfCombat: runeliteConfigBoolean(
        prayerValues.prayerBarHideIfNonCombat,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.prayer.hideIfOutOfCombat
      )
    },
    boosts: {
      enabled: boostsEnabled,
      displayBoosts: runeliteBoostsDisplayBoosts(boostsValues.displayBoosts, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.boosts.displayBoosts),
      useRelativeBoost: runeliteConfigBoolean(boostsValues.relativeBoost, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.boosts.useRelativeBoost),
      displayInfoboxes: runeliteConfigBoolean(
        boostsValues.displayIndicators,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.boosts.displayInfoboxes
      ),
      displayIcons: runeliteConfigBoolean(boostsValues.displayIconPanel, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.boosts.displayIcons),
      boldIconFont: runeliteConfigBoolean(boostsValues.boldIconFont, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.boosts.boldIconFont),
      displayNextBuffChange: runeliteBoostsDisplayChangeMode(
        boostsValues.displayNextBuffChange,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.boosts.displayNextBuffChange
      ),
      displayNextDebuffChange: runeliteBoostsDisplayChangeMode(
        boostsValues.displayNextDebuffChange,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.boosts.displayNextDebuffChange
      ),
      boostThreshold: runeliteConfigNumber(boostsValues.boostThreshold, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.boosts.boostThreshold),
      groupNotifications: runeliteConfigBoolean(
        boostsValues.groupNotifications,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.boosts.groupNotifications
      )
    },
    opponentInfo: {
      enabled: opponentInfoEnabled,
      lookupOnInteraction: runeliteConfigBoolean(
        opponentInfoValues.lookupOnInteraction,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.opponentInfo.lookupOnInteraction
      ),
      hitpointsDisplayStyle: runeliteOpponentHitpointsDisplayStyle(
        opponentInfoValues.hitpointsDisplayStyle,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.opponentInfo.hitpointsDisplayStyle
      ),
      showOpponentsOpponent: runeliteConfigBoolean(
        opponentInfoValues.showOpponentsOpponent,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.opponentInfo.showOpponentsOpponent
      ),
      showAttackersMenu: runeliteConfigBoolean(
        opponentInfoValues.showAttackersMenu,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.opponentInfo.showAttackersMenu
      ),
      showAttackingMenu: runeliteConfigBoolean(
        opponentInfoValues.showAttackingMenu,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.opponentInfo.showAttackingMenu
      ),
      attackingColor: runeliteConfigString(
        opponentInfoValues.attackingColor,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.opponentInfo.attackingColor
      ),
      showHitpointsMenu: runeliteConfigBoolean(
        opponentInfoValues.showHitpointsMenu,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.opponentInfo.showHitpointsMenu
      )
    },
    playerIndicators: {
      enabled: playerIndicatorsEnabled,
      highlightOwnPlayer: runeliteConfigBoolean(
        playerIndicatorsValues.drawOwnName,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.playerIndicators.highlightOwnPlayer
      ),
      ownPlayerColor: runeliteConfigString(
        playerIndicatorsValues.ownNameColor,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.playerIndicators.ownPlayerColor
      ),
      highlightTargets: runeliteConfigBoolean(
        playerIndicatorsValues.drawTargetsNames,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.playerIndicators.highlightTargets
      ),
      targetColor: runeliteConfigString(
        playerIndicatorsValues.targetColor,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.playerIndicators.targetColor
      ),
      showCombatLevel: runeliteConfigBoolean(
        playerIndicatorsValues.showCombat,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.playerIndicators.showCombatLevel
      ),
      playerSkull: runeliteConfigBoolean(
        playerIndicatorsValues.playerSkull,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.playerIndicators.playerSkull
      ),
      highlightOtherPlayers: runeliteConfigBoolean(
        playerIndicatorsValues.drawOtherPlayerNames,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.playerIndicators.highlightOtherPlayers
      ),
      otherPlayerColor: runeliteConfigString(
        playerIndicatorsValues.otherPlayerColor,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.playerIndicators.otherPlayerColor
      )
    },
    tileIndicators: {
      enabled: tileIndicatorsEnabled,
      highlightDestinationColor: runeliteConfigString(
        tileIndicatorsValues.highlightDestinationColor,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.tileIndicators.highlightDestinationColor
      ),
      highlightDestinationTile: runeliteConfigBoolean(
        tileIndicatorsValues.highlightDestinationTile,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.tileIndicators.highlightDestinationTile
      ),
      thinDestinationTile: runeliteConfigBoolean(
        tileIndicatorsValues.thinDestinationTile,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.tileIndicators.thinDestinationTile
      ),
      highlightCurrentColor: runeliteConfigString(
        tileIndicatorsValues.highlightCurrentColor,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.tileIndicators.highlightCurrentColor
      ),
      highlightCurrentTile: runeliteConfigBoolean(
        tileIndicatorsValues.highlightCurrentTile,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.tileIndicators.highlightCurrentTile
      ),
      thinCurrentTile: runeliteConfigBoolean(
        tileIndicatorsValues.thinCurrentTile,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.tileIndicators.thinCurrentTile
      ),
      highlightHoveredColor: runeliteConfigString(
        tileIndicatorsValues.highlightHoveredColor,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.tileIndicators.highlightHoveredColor
      ),
      highlightHoveredTile: runeliteConfigBoolean(
        tileIndicatorsValues.highlightHoveredTile,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.tileIndicators.highlightHoveredTile
      ),
      thinHoveredTile: runeliteConfigBoolean(
        tileIndicatorsValues.thinHoveredTile,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.tileIndicators.thinHoveredTile
      )
    },
    pvpPerformanceTracker: {
      enabled: pvpPerformanceTrackerEnabled,
      restrictToLms: runeliteConfigBoolean(
        pvpPerformanceTrackerValues.restrictToLms,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.restrictToLms
      ),
      inLastManStandingArea: RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.inLastManStandingArea,
      showFightHistoryPanel: runeliteConfigBoolean(
        pvpPerformanceTrackerValues.showFightHistoryPanel,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.showFightHistoryPanel
      ),
      fightHistoryRenderLimit: runeliteConfigNumber(
        pvpPerformanceTrackerValues.fightHistoryRenderLimit,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.fightHistoryRenderLimit
      ),
      showFightOverlay: runeliteConfigBoolean(
        pvpPerformanceTrackerValues.showFightOverlay,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.showFightOverlay
      ),
      showOverlayTitle: runeliteConfigBoolean(
        pvpPerformanceTrackerValues.showOverlayTitle,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.showOverlayTitle
      ),
      showOverlayNames: runeliteConfigBoolean(
        pvpPerformanceTrackerValues.showOverlayNames,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.showOverlayNames
      ),
      showOverlayOffPray: runeliteConfigBoolean(
        pvpPerformanceTrackerValues.showOverlayOffPray,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.showOverlayOffPray
      ),
      showOverlayExpectedDamage: runeliteConfigBoolean(
        pvpPerformanceTrackerValues.showOverlayDeservedDmg,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.showOverlayExpectedDamage
      ),
      showOverlayDamageDealt: runeliteConfigBoolean(
        pvpPerformanceTrackerValues.showOverlayDmgDealt,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.showOverlayDamageDealt
      ),
      showOverlayMagicHits: runeliteConfigBoolean(
        pvpPerformanceTrackerValues.showOverlayMagicHits,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.showOverlayMagicHits
      ),
      showOverlayOffensivePray: runeliteConfigBoolean(
        pvpPerformanceTrackerValues.showOverlayOffensivePray,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.showOverlayOffensivePray
      ),
      showOverlayHpHealed: runeliteConfigBoolean(
        pvpPerformanceTrackerValues.showOverlayHpHealed,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.showOverlayHpHealed
      ),
      showOverlayRobeHits: runeliteConfigBoolean(
        pvpPerformanceTrackerValues.showOverlayRobeHits,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.showOverlayRobeHits
      ),
      showOverlayTotalKoChance: runeliteConfigBoolean(
        pvpPerformanceTrackerValues.showOverlayTotalKoChance,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.showOverlayTotalKoChance
      ),
      showOverlayLastKoChance: runeliteConfigBoolean(
        pvpPerformanceTrackerValues.showOverlayLastKoChance,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.showOverlayLastKoChance
      ),
      showOverlayGhostBarrage: runeliteConfigBoolean(
        pvpPerformanceTrackerValues.showOverlayGhostBarrage,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpPerformanceTracker.showOverlayGhostBarrage
      )
    },
    suppliesTracker: {
      enabled: suppliesTrackerEnabled,
      blowpipeAmmo: runeliteConfigString(
        suppliesTrackerValues.blowpipeAmmo,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.suppliesTracker.blowpipeAmmo
      )
    },
    pvpTools: {
      enabled: pvpToolsEnabled,
      countPlayers: runeliteConfigBoolean(pvpToolsValues.countPlayers, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpTools.countPlayers),
      countOverHeads: runeliteConfigBoolean(pvpToolsValues.countOverHeads, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpTools.countOverHeads),
      renderSelfHotkey: runeliteConfigString(
        pvpToolsValues.renderSelfHotkey,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpTools.renderSelfHotkey
      ),
      hideAttack: runeliteConfigBoolean(pvpToolsValues.hideAttack, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpTools.hideAttack),
      hideAttackMode: runelitePvpToolsAttackMode(
        pvpToolsValues.hideAttackMode,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpTools.hideAttackMode
      ),
      hideCast: runeliteConfigBoolean(pvpToolsValues.hideCast, RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpTools.hideCast),
      hideCastMode: runelitePvpToolsAttackMode(
        pvpToolsValues.hideCastMode,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpTools.hideCastMode
      ),
      hideCastIgnored: runeliteConfigString(
        pvpToolsValues.hideCastIgnored,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpTools.hideCastIgnored
      ),
      riskCalculator: runeliteConfigBoolean(
        pvpToolsValues.riskCalculator,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpTools.riskCalculator
      ),
      missingPlayers: runeliteConfigBoolean(
        pvpToolsValues.missingPlayers,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpTools.missingPlayers
      ),
      currentPlayers: runeliteConfigBoolean(
        pvpToolsValues.currentPlayers,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.pvpTools.currentPlayers
      )
    },
    xpDrop: {
      enabled: xpDropEnabled,
      hideSkillIcons: runeliteConfigBoolean(
        xpDropValues.hideSkillIcons,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.xpDrop.hideSkillIcons
      ),
      meleePrayerColor: runeliteConfigString(
        xpDropValues.meleePrayerColor,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.xpDrop.meleePrayerColor
      ),
      rangePrayerColor: runeliteConfigString(
        xpDropValues.rangePrayerColor,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.xpDrop.rangePrayerColor
      ),
      magePrayerColor: runeliteConfigString(
        xpDropValues.magePrayerColor,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.xpDrop.magePrayerColor
      ),
      fakeXpDropDelay: runeliteConfigNumber(
        xpDropValues.fakeXpDropDelay,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.xpDrop.fakeXpDropDelay
      ),
      showDamageDrops: runeliteXpDropDamageMode(
        xpDropValues.showdamagedrops,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.xpDrop.showDamageDrops
      ),
      damageColor: runeliteConfigString(
        xpDropValues.damageColor,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.xpDrop.damageColor
      ),
      trainerDisplayMode: runeliteXpDropDisplayMode(
        xpDropValues.trainerDisplayMode,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.xpDrop.trainerDisplayMode
      ),
      nativeTextSize: runeliteXpDropTextSize(
        xpDropValues.nativeTextSize,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.xpDrop.nativeTextSize
      ),
      trainerFont: runeliteXpDropFont(
        xpDropValues.trainerFont,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.xpDrop.trainerFont
      ),
      trainerTextSize: runeliteConfigNumberRange(
        xpDropValues.trainerTextSize,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.xpDrop.trainerTextSize,
        8,
        48
      ),
      trainerMoveDistance: runeliteConfigNumberRange(
        xpDropValues.trainerMoveDistance,
        RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT.xpDrop.trainerMoveDistance,
        20,
        220
      )
    }
  };
}

function buildDefaultRuneliteConfigValueMap(descriptor: RuneliteConfigDescriptorModel): Record<string, RuneliteConfigValue> {
  return Object.fromEntries(descriptor.items.map((item) => [item.keyName, item.defaultValue]));
}

function runeliteConfigNumber(value: RuneliteConfigValue | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function runeliteConfigNumberRange(
  value: RuneliteConfigValue | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const numericValue = runeliteConfigNumber(value, fallback);
  return Math.min(max, Math.max(min, numericValue));
}

function runeliteConfigPercentage(value: RuneliteConfigValue | undefined, fallback: number, min: number, max: number): number {
  const numericValue = runeliteConfigNumber(value, fallback);
  return Math.min(max, Math.max(min, numericValue));
}

function runeliteConfigBoolean(value: RuneliteConfigValue | undefined, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function runeliteConfigString(value: RuneliteConfigValue | undefined, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function runeliteExpandResizeType(
  value: RuneliteConfigValue | undefined,
  fallback: RuneliteExpandResizeType
): RuneliteExpandResizeType {
  return value === "Keep window size" || value === "Keep game size" ? value : fallback;
}

function runeliteContainInScreenMode(
  value: RuneliteConfigValue | undefined,
  fallback: RuneliteContainInScreenMode
): RuneliteContainInScreenMode {
  return value === "ALWAYS" || value === "RESIZING" || value === "NEVER" ? value : fallback;
}

function runeliteWarningOnExitMode(
  value: RuneliteConfigValue | undefined,
  fallback: RuneliteWarningOnExit
): RuneliteWarningOnExit {
  return value === "Always" || value === "Logged in" || value === "Never" ? value : fallback;
}

function runeliteClientFrameConfig(
  config: RuneliteClientConfigSnapshot,
  localPlayerName: string | null
): { readonly title: string; readonly alwaysOnTop: boolean; readonly resizable: boolean; readonly rememberScreenBounds: boolean } {
  const playerName = localPlayerName?.trim();
  return {
    title: config.frame.usernameInTitle && playerName ? `${RUNELITE_CLIENT_TITLE} - ${playerName}` : RUNELITE_CLIENT_TITLE,
    alwaysOnTop: config.frame.gameAlwaysOnTop,
    resizable: !config.frame.lockWindowSize,
    rememberScreenBounds: config.frame.rememberScreenBounds
  };
}

function runelitePvpToolsAttackMode(
  value: RuneliteConfigValue | undefined,
  fallback: RunelitePvpToolsAttackMode
): RunelitePvpToolsAttackMode {
  return value === "Clan" || value === "Friends" || value === "Both" ? value : fallback;
}

function runeliteXpDropDamageMode(
  value: RuneliteConfigValue | undefined,
  fallback: RuneliteXpDropDamageMode
): RuneliteXpDropDamageMode {
  return value === "NONE" || value === "ABOVE_OPPONENT" || value === "IN_XP_DROP" ? value : fallback;
}

function runeliteXpDropDisplayMode(
  value: RuneliteConfigValue | undefined,
  fallback: RuneliteXpDropDisplayMode
): RuneliteXpDropDisplayMode {
  return value === "XP" || value === "HIT" ? value : fallback;
}

function runeliteXpDropTextSize(
  value: RuneliteConfigValue | undefined,
  fallback: RuneliteXpDropTextSize
): RuneliteXpDropTextSize {
  return value === "Small" || value === "Medium" || value === "Large" ? value : fallback;
}

function runeliteXpDropFont(
  value: RuneliteConfigValue | undefined,
  fallback: RuneliteXpDropFont
): RuneliteXpDropFont {
  return value === "Plain 11" || value === "Plain 12" || value === "Bold 12" ? value : fallback;
}

function runeliteAntiDragKeyboardEventMatchesKeybind(event: KeyboardEvent, keybind: string): boolean {
  const normalizedKeybind = keybind.trim().toLowerCase();
  if (!normalizedKeybind) {
    return false;
  }

  if (normalizedKeybind === "shift") {
    return event.key === "Shift";
  }

  if (normalizedKeybind === "ctrl" || normalizedKeybind === "control") {
    return event.key === "Control";
  }

  if (normalizedKeybind === "alt") {
    return event.key === "Alt";
  }

  if (normalizedKeybind === "space") {
    return event.key === " ";
  }

  return event.key.toLowerCase() === normalizedKeybind || event.code.toLowerCase() === normalizedKeybind;
}

function runeliteStatusBarMode(value: RuneliteConfigValue | undefined, fallback: RuneliteStatusBarMode): RuneliteStatusBarMode {
  return value === "Disabled" || value === "Hitpoints" || value === "Prayer" || value === "Run Energy" || value === "Special Attack"
    ? value
    : fallback;
}

function runelitePrayerFlickLocation(
  value: RuneliteConfigValue | undefined,
  fallback: RunelitePrayerFlickLocation
): RunelitePrayerFlickLocation {
  return value === "NONE" || value === "PRAYER_ORB" || value === "PRAYER_BAR" || value === "BOTH" ? value : fallback;
}

function runeliteOpponentHitpointsDisplayStyle(
  value: RuneliteConfigValue | undefined,
  fallback: RuneliteOpponentHitpointsDisplayStyle
): RuneliteOpponentHitpointsDisplayStyle {
  return value === "Hitpoints" || value === "Percentage" || value === "Both" ? value : fallback;
}

function runeliteBoostsDisplayBoosts(
  value: RuneliteConfigValue | undefined,
  fallback: RuneliteBoostsDisplayBoosts
): RuneliteBoostsDisplayBoosts {
  return value === "NONE" || value === "COMBAT" || value === "NON_COMBAT" || value === "BOTH" ? value : fallback;
}

function runeliteBoostsDisplayChangeMode(
  value: RuneliteConfigValue | undefined,
  fallback: RuneliteBoostsDisplayChangeMode
): RuneliteBoostsDisplayChangeMode {
  return value === "ALWAYS" || value === "BOOSTED" || value === "NEVER" ? value : fallback;
}

function findRuneliteConfigDescriptor(pluginId: string): RuneliteConfigDescriptorModel | null {
  return runeliteConfigDescriptors.find((descriptor) => descriptor.id === pluginId) ?? null;
}

function defaultRuneliteEnabledPluginIds(): Set<string> {
  const properties = readRuneliteConfigProperties();
  return new Set(
    runeliteTrainerAvailablePluginListItems()
      .filter((item) => item.pluginBacked)
      .filter((item) => {
        const stored = properties[runeliteConfigPropertyKey("runelite", runelitePluginEnabledConfigKey(item))];
        return stored === undefined ? item.enabledByDefault : stored === "true";
      })
      .map((item) => item.id)
  );
}

function defaultRunelitePinnedPluginIds(): Set<string> {
  const configuredNames = readRunelitePinnedPluginNames();
  if (configuredNames) {
    const idsByName = new Map(runeliteTrainerAvailablePluginListItems().map((item) => [item.name, item.id]));
    return new Set(configuredNames.flatMap((name) => idsByName.get(name) ?? []));
  }

  return new Set(runeliteTrainerAvailablePluginListItems().filter((item) => item.pinnedByDefault).map((item) => item.id));
}

function readRunelitePinnedPluginNames(): readonly string[] | null {
  try {
    const value = window.localStorage.getItem(RUNELITE_PINNED_PLUGINS_STORAGE_KEY);
    if (value === null) {
      return null;
    }

    return value
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

function saveRunelitePinnedPluginIds(pinnedPluginIds: ReadonlySet<string>): void {
  try {
    const pinnedNames = runeliteTrainerAvailablePluginListItems()
      .filter((item) => pinnedPluginIds.has(item.id))
      .map((item) => item.name);
    window.localStorage.setItem(RUNELITE_PINNED_PLUGINS_STORAGE_KEY, pinnedNames.join(","));
  } catch {
    // RuneLite persists this through ConfigManager; localStorage is the browser-backed equivalent here.
  }
}

function saveRunelitePluginEnabledState(item: RuneliteConfigPluginListItemModel, enabled: boolean): void {
  setRuneliteConfigProperty("runelite", runelitePluginEnabledConfigKey(item), String(enabled));
}

function saveRuneliteConfigValue(pluginId: string, keyName: string, value: RuneliteConfigValue): void {
  const descriptor = findRuneliteConfigDescriptor(pluginId);
  const item = descriptor?.items.find((candidate) => candidate.keyName === keyName);
  if (!descriptor || !item) {
    return;
  }

  setRuneliteConfigProperty(descriptor.group, item.keyName, runeliteConfigValueToProperty(value));
}

function unsetRuneliteConfigDescriptorValues(descriptor: RuneliteConfigDescriptorModel): void {
  mutateRuneliteConfigProperties((properties) => {
    for (const item of descriptor.items) {
      delete properties[runeliteConfigPropertyKey(descriptor.group, item.keyName)];
    }
  });
}

function runelitePluginEnabledConfigKey(item: RuneliteConfigPluginListItemModel): string {
  const sourceName = item.sourcePath.split(/[\\/]/).pop() ?? item.id;
  return sourceName.replace(/\.java$/i, "").toLowerCase();
}

function runeliteConfigPropertyKey(group: string, key: string): string {
  return `${group}.${key}`;
}

function runeliteConfigValueToProperty(value: RuneliteConfigValue): string {
  return String(value);
}

function runeliteConfigValueFromProperty(item: RuneliteConfigItemModel, value: string): RuneliteConfigValue {
  if (item.type === "boolean") {
    return value === "true";
  }

  if (item.type === "range" || item.type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : item.defaultValue;
  }

  if (item.type === "enum" && item.options && item.options.length > 0) {
    return item.options.includes(value) ? value : item.defaultValue;
  }

  return value;
}

function readRuneliteConfigProperties(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(RUNELITE_CONFIG_PROPERTIES_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return migrateRuneliteClientShellConfigProperties(Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) =>
        typeof value === "string" ? [[key, value]] : []
      )
    ));
  } catch {
    return {};
  }
}

function migrateRuneliteClientShellConfigProperties(properties: Record<string, string>): Record<string, string> {
  const legacyPrefix = `${RUNELITE_LEGACY_CLIENT_SHELL_CONFIG_GROUP}.`;
  const currentPrefix = `${RUNELITE_CLIENT_SHELL_CONFIG_PLUGIN_ID}.`;
  const migrated = { ...properties };

  for (const [key, value] of Object.entries(properties)) {
    if (!key.startsWith(legacyPrefix)) {
      continue;
    }

    const migratedKey = `${currentPrefix}${key.slice(legacyPrefix.length)}`;
    if (migrated[migratedKey] === undefined) {
      migrated[migratedKey] = value;
    }
  }

  return migrated;
}

function setRuneliteConfigProperty(group: string, key: string, value: string): void {
  mutateRuneliteConfigProperties((properties) => {
    properties[runeliteConfigPropertyKey(group, key)] = value;
  });
}

function mutateRuneliteConfigProperties(mutator: (properties: Record<string, string>) => void): void {
  try {
    const properties = readRuneliteConfigProperties();
    mutator(properties);
    window.localStorage.setItem(RUNELITE_CONFIG_PROPERTIES_STORAGE_KEY, JSON.stringify(sortRuneliteConfigProperties(properties)));
  } catch {
    // RuneLite writes properties to disk; browser storage can fail in restricted contexts.
  }
}

function sortRuneliteConfigProperties(properties: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(properties).sort(([left], [right]) => left.localeCompare(right)));
}

function sortRuneliteConfigPluginListItems(
  items: readonly RuneliteConfigPluginListItemModel[],
  clientShellValues: Readonly<Record<string, RuneliteConfigValue>>
): readonly RuneliteConfigPluginListItemModel[] {
  const sortMode = runelitePluginSortMode(clientShellValues.pluginSortMode);

  return [...items].sort((left, right) => {
    if (sortMode === "Category") {
      const categoryDelta = runelitePluginTypeSortIndex(left.pluginType) - runelitePluginTypeSortIndex(right.pluginType);

      if (categoryDelta !== 0) {
        return categoryDelta;
      }
    }

    return left.name.localeCompare(right.name);
  });
}

function runelitePluginSortMode(value: RuneliteConfigValue | undefined): RunelitePluginSortMode {
  return value === "Alphabetically" || value === "Alphabetical" ? "Alphabetically" : "Category";
}

function runelitePluginTypeSortIndex(pluginType: RunelitePluginType): number {
  const index = RUNELITE_PLUGIN_TYPE_DEFINED_ORDER.indexOf(pluginType);
  return index === -1 ? RUNELITE_PLUGIN_TYPE_DEFINED_ORDER.length : index;
}

function runeliteConfigPluginHiddenByCategory(
  pluginType: RunelitePluginType,
  clientShellValues: Readonly<Record<string, RuneliteConfigValue>>
): boolean {
  if (pluginType === "important" || pluginType === "general-use") {
    return false;
  }

  if (runeliteConfigBoolean(clientShellValues.hidePlugins, false)) {
    return true;
  }

  if (pluginType === "external") {
    return runeliteConfigBoolean(clientShellValues.hideExternalPlugins, false);
  }

  if (pluginType === "pvm") {
    return runeliteConfigBoolean(clientShellValues.hidePvmPlugins, false);
  }

  if (pluginType === "skilling") {
    return runeliteConfigBoolean(clientShellValues.hideSkillingPlugins, false);
  }

  if (pluginType === "pvp") {
    return runeliteConfigBoolean(clientShellValues.hidePvpPlugins, false);
  }

  if (pluginType === "utility") {
    return runeliteConfigBoolean(clientShellValues.hideUtilityPlugins, false);
  }

  return false;
}

function runeliteConfigPluginColorByCategory(
  pluginType: RunelitePluginType,
  clientShellValues: Readonly<Record<string, RuneliteConfigValue>>
): string | null {
  if (pluginType === "external") {
    return runeliteConfigString(clientShellValues.externalColor, "#B19CD9");
  }

  if (pluginType === "pvm") {
    return runeliteConfigString(clientShellValues.pvmColor, "#77DD77");
  }

  if (pluginType === "pvp") {
    return runeliteConfigString(clientShellValues.pvpColor, "#FF6961");
  }

  if (pluginType === "skilling") {
    return runeliteConfigString(clientShellValues.skillingColor, "#FCFC64");
  }

  if (pluginType === "utility") {
    return runeliteConfigString(clientShellValues.utilityColor, "#90D4ED");
  }

  return null;
}

function runeliteConfigItemVisible(
  item: RuneliteConfigItemModel,
  values: Readonly<Record<string, RuneliteConfigValue>>
): boolean {
  const unhideMatched = runeliteConfigVisibilityConditionMatched(item.unhideWhen, item.unhideValues, values);
  const hideMatched = runeliteConfigVisibilityConditionMatched(item.hideWhen, item.hideValues, values);

  if (item.hidden && !unhideMatched) {
    return false;
  }

  if (item.hideWhen && hideMatched) {
    return false;
  }

  return true;
}

function runeliteConfigVisibilityConditionMatched(
  keys: readonly string[] | undefined,
  allowedValues: readonly string[] | undefined,
  values: Readonly<Record<string, RuneliteConfigValue>>
): boolean {
  if (!keys || keys.length === 0) {
    return false;
  }

  return keys.some((keyName) => {
    const value = values[keyName];

    if (typeof value === "boolean") {
      return value;
    }

    if (value === undefined) {
      return false;
    }

    if (allowedValues && allowedValues.length > 0) {
      return allowedValues.includes(String(value));
    }

    return Boolean(value);
  });
}

function matchesRunelitePluginSearchTerms(item: RuneliteConfigPluginListItemModel, searchTerms: readonly string[]): boolean {
  if (searchTerms.length === 0) {
    return true;
  }

  const keywords = [item.name, item.description, ...item.tags].flatMap((keyword) => keyword.toLowerCase().split(/\s+/));
  return searchTerms.every((term) =>
    keywords.some((keyword) => keyword.includes(term) || runeliteJaroWinklerDistance(keyword, term) > 0.9)
  );
}

function runeliteJaroWinklerDistance(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const matchWindow = Math.max(Math.floor(Math.max(left.length, right.length) / 2) - 1, 0);
  const leftMatches = new Array<boolean>(left.length).fill(false);
  const rightMatches = new Array<boolean>(right.length).fill(false);
  let matches = 0;

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const start = Math.max(0, leftIndex - matchWindow);
    const end = Math.min(right.length - 1, leftIndex + matchWindow);

    for (let rightIndex = start; rightIndex <= end; rightIndex += 1) {
      if (!rightMatches[rightIndex] && left[leftIndex] === right[rightIndex]) {
        leftMatches[leftIndex] = true;
        rightMatches[rightIndex] = true;
        matches += 1;
        break;
      }
    }
  }

  if (matches === 0) {
    return 0;
  }

  let transpositions = 0;
  let rightIndex = 0;

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    if (!leftMatches[leftIndex]) {
      continue;
    }

    while (!rightMatches[rightIndex]) {
      rightIndex += 1;
    }

    if (left[leftIndex] !== right[rightIndex]) {
      transpositions += 1;
    }

    rightIndex += 1;
  }

  const halfTranspositions = transpositions / 2;
  const jaro =
    (matches / left.length + matches / right.length + (matches - halfTranspositions) / matches) / 3;
  const prefixLength = runeliteCommonPrefixLength(left, right, 4);

  return jaro + prefixLength * 0.1 * (1 - jaro);
}

function runeliteCommonPrefixLength(left: string, right: string, maxLength: number): number {
  const length = Math.min(left.length, right.length, maxLength);

  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) {
      return index;
    }
  }

  return length;
}

function runelitePluginListItemStarClassName(pinned: boolean): string {
  return pinned ? "runelitePluginListItemStar runelitePluginListItemStarOn" : "runelitePluginListItemStar runelitePluginListItemStarOff";
}

function runelitePluginListItemSwitcherClassName(enabled: boolean): string {
  return enabled
    ? "runelitePluginListItemSwitcher runelitePluginListItemSwitcherOn"
    : "runelitePluginListItemSwitcher runelitePluginListItemSwitcherOff";
}
