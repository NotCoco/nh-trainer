import { Fragment, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import equipmentRowsJson from "../generated/equipment-bonuses.json";
import emotesJson from "../../fixtures/assets/defs/emotes.json";
import { aggregateBonuses, zeroBonuses, type BonusKey, type BonusTable } from "../sim/combat/formulas";
import type { EquipmentBonusRow } from "../sim/equipment/equipment";
import type {
  KronosCombatAutoRetaliateLayout,
  KronosCombatAutocastControlLayout,
  KronosCombatPanelLayout,
  KronosCombatSpecialBarLayout,
  KronosCombatStyleSlotLayout,
  KronosCombatTextLayout,
  KronosEquipmentPanelLayout,
  KronosEquipmentSlotLayout,
  KronosEquipmentUtilityButtonLayout,
  KronosFixedClientCssLayout,
  KronosFixedClientLayout,
  KronosFixedOrbId,
  KronosFixedOrbLayout,
  KronosXpDropOrbLayout,
  KronosFixedSidePanelLayout,
  KronosFixedSideTabId,
  KronosFixedSideTabLayout,
  KronosInventoryGridLayout,
  KronosMountedInterfaceLayout,
  KronosPrayerPanelLayout,
  KronosPrayerId,
  KronosPrayerSlotLayout,
  KronosRect,
  KronosResolvedWidget,
  KronosStatsPanelLayout,
  KronosStatsSkillSlotLayout,
  KronosSpellbookId,
  KronosSpellbookPanelLayout,
  KronosSpellbookSpellLayout
} from "../render/kronosFixedLayout";
import {
  KRONOS_CLAN_CHAT_GROUP_ID,
  KRONOS_COMBAT_GROUP_ID,
  KRONOS_EMOTES_GROUP_ID,
  KRONOS_FRIENDS_GROUP_ID,
  KRONOS_IGNORES_GROUP_ID,
  KRONOS_NOTICEBOARD_GROUP_ID,
  KRONOS_OPTIONS_GROUP_ID
} from "../render/kronosFixedLayout";
import {
  kronosAttackStyleLabel,
  kronosAttackTypeLabel,
  kronosCombatLevelFromHud,
  kronosWeaponTypeDefinitionByConfig,
  type KronosWeaponAttackSetDefinition,
  type KronosWeaponTypeDefinition,
  type KronosWeaponTypeDefinitionStore
} from "../render/kronosCombat";
import {
  kronosActivePrayerIds,
  kronosPrayerDefinition,
  kronosPrayerDisallowedIds,
  type KronosPrayerDefinition
} from "../render/kronosPrayer";
import {
  kronosClientFontDefinitionById,
  kronosClientFontStringWidth,
  layoutKronosClientFontGlyphs,
  type KronosClientFontDefinition,
  type KronosClientFontStore
} from "../render/kronosClientFonts";
import {
  kronosInventoryQuantityText,
  normalizeKronosInventorySlots,
  type KronosInventoryEquipmentDefinition,
  type KronosInventoryEquipmentDefinitionStore,
  type KronosInventoryItemDefinition,
  type KronosInventoryItemDefinitionStore,
  type KronosInventorySelectedItem
} from "../render/kronosInventory";
import type { KronosSelectedSpell } from "../render/kronosSceneObjects";
import {
  KRONOS_MINIMAP_LOCAL_PLAYER_DOT_COLOR,
  KRONOS_MINIMAP_LOCAL_PLAYER_DOT_SIZE,
  kronosMinimapActorTile,
  kronosMinimapClickToTile,
  kronosMinimapDestinationMarker,
  kronosMinimapDotsForSnapshot,
  kronosMinimapHintMarker,
  kronosMinimapLocalPlayerDot,
  kronosMinimapMapIconForObject,
  kronosMinimapMapIconForSource,
  kronosMinimapMapMarkerSpriteIndex,
  kronosMinimapMapDotSpriteIndex,
  type KronosMinimapDot,
  type KronosMinimapMapIcon,
  type KronosMinimapMarker,
  type KronosMinimapSpriteMask
} from "../render/kronosMinimap";
import {
  kronosMinimapSceneTransform,
  type KronosMinimapSceneCell,
  type KronosMinimapSceneMapSceneObject,
  type KronosMinimapSceneOverlayPixel,
  type KronosMinimapSceneSegment,
  type KronosMinimapSceneSprite,
  type KronosMinimapSceneTransform
} from "../render/kronosMinimapScene";
import {
  defaultRuntimeSkillStates,
  runtimeLoadouts,
  type RuntimeHudState,
  type RuntimeInventorySlot,
  type RuntimeMinimapDotKind,
  type RuntimeSceneSnapshot,
  type RuntimeSkillId,
  type RuntimeSkillState,
  type RuntimeSpriteSheetId,
  type RuntimeTile
} from "../render/runtimeScene";
import { runeliteAttackStyleForWeapon, runeliteAttackStyleIsWarned } from "./runeliteAttackStyles";
import type { RuneliteAttackStylesConfigSnapshot } from "./RuneliteClientShell";
import {
  KRONOS_GAME_KEYBIND_INTERFACE_ID,
  KRONOS_GAME_KEYBIND_KEY_OPTIONS,
  KRONOS_GAME_KEYBIND_SOURCE,
  KRONOS_GAME_KEYBIND_TAB_SPECS,
  kronosGameKeybindLabelForSlot,
  kronosGameKeybindSourceKeyForSlot,
  type KronosGameKeybindKeySlot,
  type KronosGameKeybindSnapshot,
  type KronosGameKeybindTabSpec
} from "./kronosGameKeybinds";
import {
  KRONOS_CAMERA_DEFAULT_ZOOM,
  kronosCameraZoomFromSliderOffset,
  kronosCameraZoomSliderOffset,
  type KronosCameraZoom
} from "../render/kronosClientCamera";
import {
  kronosMagicSpellCurrentLevelCanCast,
  kronosMagicSpellLevelFilterAllows,
  kronosMagicSpellLevelRequirement
} from "../sim/magic/spellRequirements";

export interface KronosHudSprite {
  readonly spriteId: number;
  readonly itemId?: number;
  readonly name?: string;
  readonly alias?: string;
  readonly variant?: string;
  readonly selected?: boolean;
  readonly sourceBorder?: number;
  readonly sourceShadowColor?: number;
  readonly sourceQuantity?: number;
  readonly quantityVariant?: boolean;
  readonly areaId?: number;
  readonly char?: string;
  readonly charCode?: number;
  readonly advance?: number;
  readonly leftBearing?: number;
  readonly topBearing?: number;
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly maskXStarts?: readonly number[];
  readonly maskXWidths?: readonly number[];
}

interface KronosHudAtlasMetadata {
  readonly id?: string;
  readonly image: string;
  readonly width: number;
  readonly height: number;
  readonly sprites: readonly KronosHudSprite[];
}

export interface KronosHudAtlas {
  readonly metadata: KronosHudAtlasMetadata;
}

interface KronosEmoteDefinition {
  readonly slot: number;
  readonly sourceOrder: number;
  readonly label: string;
  readonly unlockedSpriteId: number;
  readonly lockedSpriteId: number;
}

interface KronosEmoteDefinitionStore {
  readonly source: string;
  readonly nameEnumId: number;
  readonly unlockedSpriteEnumId: number;
  readonly lockedSpriteEnumId: number;
  readonly minSlot: number;
  readonly maxSlot: number;
  readonly emotes: readonly KronosEmoteDefinition[];
}

interface KronosEmoteServerSpec {
  readonly slot: number;
  readonly label: string;
  readonly animationId: number;
  readonly graphicsId?: number;
}

interface KronosEmoteSpec extends KronosEmoteServerSpec {
  readonly sourceOrder: number;
  readonly unlockedSpriteId: number;
  readonly lockedSpriteId: number;
}

const kronosEquipmentBonusRows = equipmentRowsJson as readonly EquipmentBonusRow[];
const kronosEmoteDefinitions = emotesJson as KronosEmoteDefinitionStore;
const kronosEmoteDefinitionsBySlot = new Map(kronosEmoteDefinitions.emotes.map((entry) => [entry.slot, entry]));
const kronosEquipmentBonusRowsByItemId = new Map(kronosEquipmentBonusRows.map((row) => [row.id, row]));
const kronosEquipmentStatsFontId = 494;
const equipmentStatsTextColor = "#ff981f";
const equipmentStatsValueColor = "#ffff00";
const equipmentStatsWhiteColor = "#ffffff";
const kronosNoticeboardGreenTag = "<col=27ae60>";
const kronosNoticeboardRedTag = "<col=FF0000>";
const kronosNoticeboardCloseTag = "</col>";
const combatTabVisibleSpecBarWithoutServerSpecialItemIds = new Set([21902]);
const kronosNoticeboardDynamicTextChildIds = new Set([
  8, 9, 10, 11, 12, 43, 44, 45, 46, 47, 14, 15, 16, 17, 18, 49, 50, 51, 52, 19, 20, 21, 22
]);
const kronosNoticeboardSuppressedTextChildIds = new Set([16, 22]);
const kronosNoticeboardScrollTextChildIds = new Set([
  7,
  13,
  48,
  53,
  ...kronosNoticeboardDynamicTextChildIds
]);
const kronosNoticeboardClipChildId = 4;
const kronosEmoteScrollableChildId = 1;
const kronosEmoteScrollbarChildId = 2;
const kronosFriendsListRowsClipChildId = 11;
const kronosFriendsListDynamicTextChildId = 13;
const kronosFriendsListSwitchChildId = 1;
const kronosFriendsListAddChildId = 14;
const kronosFriendsListDeleteChildId = 16;
const kronosIgnoreListRowsClipChildId = 9;
const kronosIgnoreListDynamicTextChildId = 11;
const kronosIgnoreListSwitchChildId = 1;
const kronosIgnoreListAddChildId = 12;
const kronosIgnoreListDeleteChildId = 14;
const kronosSocialRowHeight = 15;
const kronosClanChatNameChildId = 4;
const kronosClanChatOwnerChildId = 6;
const kronosClanChatRowsClipChildId = 16;
const kronosClanChatJoinLeaveChildId = 22;
const kronosClanChatSetupChildId = 24;
const kronosClanChatRowHeight = 15;
const kronosEmoteColumns = 4;
const kronosEmoteButtonSize = { width: 42, height: 48 } as const;
const kronosEmoteButtonStep = { width: 43, height: 49 } as const;
const kronosEmoteFirstRowOffsetY = 6;
const kronosEmoteServerSpecs: readonly KronosEmoteServerSpec[] = [
  { slot: 0, label: "Yes", animationId: 855 },
  { slot: 1, label: "No", animationId: 856 },
  { slot: 2, label: "Bow", animationId: 858 },
  { slot: 3, label: "Angry", animationId: 859 },
  { slot: 4, label: "Think", animationId: 857 },
  { slot: 5, label: "Wave", animationId: 863 },
  { slot: 6, label: "Shrug", animationId: 2113 },
  { slot: 7, label: "Cheer", animationId: 862 },
  { slot: 8, label: "Beckon", animationId: 864 },
  { slot: 9, label: "Laugh", animationId: 861 },
  { slot: 10, label: "Jump for Joy", animationId: 2109 },
  { slot: 11, label: "Yawn", animationId: 2111 },
  { slot: 12, label: "Dance", animationId: 866 },
  { slot: 13, label: "Jig", animationId: 2106 },
  { slot: 14, label: "Spin", animationId: 2107 },
  { slot: 15, label: "Headbang", animationId: 2108 },
  { slot: 16, label: "Cry", animationId: 860 },
  { slot: 17, label: "Blow Kiss", animationId: 1374 },
  { slot: 18, label: "Panic", animationId: 2105 },
  { slot: 19, label: "Raspberry", animationId: 2110 },
  { slot: 20, label: "Clap", animationId: 865 },
  { slot: 21, label: "Salute", animationId: 2112 },
  { slot: 22, label: "Goblin Bow", animationId: 2127 },
  { slot: 23, label: "Goblin Salute", animationId: 2128 },
  { slot: 24, label: "Glass Box", animationId: 1131 },
  { slot: 25, label: "Climb Rope", animationId: 1130 },
  { slot: 26, label: "Lean", animationId: 1129 },
  { slot: 27, label: "Glass Wall", animationId: 1128 },
  { slot: 28, label: "Idea", animationId: 4276 },
  { slot: 29, label: "Stomp", animationId: 4278 },
  { slot: 30, label: "Flap", animationId: 4280 },
  { slot: 31, label: "Slap Head", animationId: 4275 },
  { slot: 32, label: "Zombie Walk", animationId: 3544 },
  { slot: 33, label: "Zombie Dance", animationId: 3543 },
  { slot: 34, label: "Scared", animationId: 2836 },
  { slot: 35, label: "Rabbit Hop", animationId: 6111 },
  { slot: 36, label: "Sit Up", animationId: 2763 },
  { slot: 37, label: "Push Up", animationId: 2762 },
  { slot: 38, label: "Star Jump", animationId: 2761 },
  { slot: 39, label: "Jog", animationId: 2764 },
  { slot: 40, label: "Zombie Hand", animationId: 1708, graphicsId: 320 },
  { slot: 41, label: "Hyper Mobile Drinker", animationId: 7131 },
  { slot: 42, label: "Skill Cape", animationId: -1 },
  { slot: 43, label: "Air Guitar", animationId: 4751, graphicsId: 1239 },
  { slot: 44, label: "URI Transform", animationId: -1 },
  { slot: 45, label: "Smooth Dance", animationId: 7533 },
  { slot: 46, label: "Crazy Dance", animationId: -1 },
  { slot: 47, label: "Premier Shield", animationId: 7751, graphicsId: 1412 }
];
const kronosEmoteSpecs: readonly KronosEmoteSpec[] = kronosEmoteServerSpecs.flatMap((spec) => {
  const definition = kronosEmoteDefinitionsBySlot.get(spec.slot);
  if (!definition) {
    return [];
  }
  return [
    {
      ...spec,
      sourceOrder: definition.sourceOrder,
      label: definition.label || spec.label,
      unlockedSpriteId: definition.unlockedSpriteId,
      lockedSpriteId: definition.lockedSpriteId
    }
  ];
});
const equipmentStatsSourceRows: readonly {
  readonly title: string;
  readonly rows: readonly {
    readonly label: string;
    readonly bonusKey?: BonusKey;
    readonly percent: boolean;
  }[];
}[] = [
  {
    title: "Attack bonuses",
    rows: [
      { label: "Stab", bonusKey: "stab_attack_bonus", percent: false },
      { label: "Slash", bonusKey: "slash_attack_bonus", percent: false },
      { label: "Crush", bonusKey: "crush_attack_bonus", percent: false },
      { label: "Magic", bonusKey: "magic_attack_bonus", percent: false },
      { label: "Range", bonusKey: "range_attack_bonus", percent: false }
    ]
  },
  {
    title: "Defence bonuses",
    rows: [
      { label: "Stab", bonusKey: "stab_defence_bonus", percent: false },
      { label: "Slash", bonusKey: "slash_defence_bonus", percent: false },
      { label: "Crush", bonusKey: "crush_defence_bonus", percent: false },
      { label: "Magic", bonusKey: "magic_defence_bonus", percent: false },
      { label: "Range", bonusKey: "range_defence_bonus", percent: false }
    ]
  },
  {
    title: "Other bonuses",
    rows: [
      { label: "Melee strength", bonusKey: "melee_strength_bonus", percent: false },
      { label: "Ranged strength", bonusKey: "ranged_strength_bonus", percent: false },
      { label: "Magic damage", bonusKey: "magic_damage_bonus", percent: true },
      { label: "Prayer", bonusKey: "prayer_bonus", percent: false }
    ]
  },
  {
    title: "Target-specific",
    rows: [
      { label: "Undead", percent: true },
      { label: "Slayer", percent: true }
    ]
  }
];

interface KronosClientHudProps {
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
  readonly layout: KronosFixedClientCssLayout | null;
  readonly sourceLayout: KronosFixedClientLayout | null;
  readonly snapshot: RuntimeSceneSnapshot;
  readonly minimapDestinationTile: RuntimeTile | null;
  readonly minimapCameraYaw: number;
  readonly minimapSceneSprite: KronosMinimapSceneSprite | null;
  readonly cameraZoom?: KronosCameraZoom;
  readonly onCameraZoomChange?: (zoom: KronosCameraZoom) => void;
  readonly onCameraZoomReset?: () => void;
  readonly onMinimapTileCommand?: (command: KronosMinimapTileCommand) => void;
  readonly onInventoryContextMenu?: (command: KronosInventorySlotCommand) => void;
  readonly onInventoryEmptyContextMenu?: (command: KronosInventoryEmptyCommand) => void;
  readonly onInventoryDefaultAction?: (command: KronosInventorySlotCommand) => void;
  readonly onInventoryDragReorder?: (command: KronosInventorySlotDragCommand) => void;
  readonly onInventoryHover?: (command: KronosInventorySlotCommand | null) => void;
  readonly onEquipmentItemContextMenu?: (command: KronosEquipmentItemCommand) => void;
  readonly onEquipmentItemDefaultAction?: (command: KronosEquipmentItemCommand) => void;
  readonly onEquipmentItemHover?: (command: KronosEquipmentItemCommand | null) => void;
  readonly onStatsSkillDefaultAction?: (command: KronosStatsSkillCommand) => void;
  readonly onSpellDefaultAction?: (command: KronosSpellbookSpellCommand) => void;
  readonly onSpellDragReorder?: (command: KronosSpellbookSpellDragCommand) => void;
  readonly onCombatStyleDefaultAction?: (command: KronosCombatStyleCommand) => void;
  readonly onCombatAutocastDefaultAction?: (command: KronosCombatAutocastCommand) => void;
  readonly onCombatAutoRetaliateDefaultAction?: (command: KronosCombatAutoRetaliateCommand) => void;
  readonly onCombatSpecialDefaultAction?: (command: KronosCombatSpecialCommand) => void;
  readonly onPrayerDefaultAction?: (command: KronosPrayerSlotCommand) => void;
  readonly onPrayerDragReorder?: (command: KronosPrayerSlotDragCommand) => void;
  readonly onRunOrbDefaultAction?: (command: KronosRunOrbCommand) => void;
  readonly onXpDropOrbDefaultAction?: (command: KronosXpDropOrbCommand) => void;
  readonly onXpDropOrbContextMenu?: (command: KronosXpDropOrbCommand) => void;
  readonly gameKeybinds?: KronosGameKeybindSnapshot;
  readonly gameKeybindInterfaceOpen?: boolean;
  readonly gameKeybindSelectedTabId?: KronosFixedSideTabId;
  readonly onGameKeybindInterfaceOpen?: () => void;
  readonly onGameKeybindInterfaceClose?: () => void;
  readonly onGameKeybindSelectedTabChange?: (tabId: KronosFixedSideTabId) => void;
  readonly onGameKeybindChange?: (tabId: KronosFixedSideTabId, keySlot: KronosGameKeybindKeySlot) => void;
  readonly onGameKeybindEscapeCloseChange?: (escapeCloses: boolean) => void;
  readonly onGameKeybindRestoreDefaults?: (mode: "osrs" | "pre-eoc") => void;
  readonly onChatboxContextMenu?: (command: KronosChatboxButtonCommand) => void;
  readonly onChatboxDefaultAction?: (command: KronosChatboxButtonCommand) => void;
  readonly onChatboxHover?: (command: KronosChatboxButtonCommand | null) => void;
  readonly socialLists?: KronosSocialListsSnapshot;
  readonly onSocialButtonDefaultAction?: (command: KronosSocialButtonCommand) => void;
  readonly clanChat?: KronosClanChatSnapshot;
  readonly onClanChatButtonDefaultAction?: (command: KronosClanChatButtonCommand) => void;
  readonly onEquipmentUtilityDefaultAction?: (command: KronosEquipmentUtilityButtonCommand) => void;
  readonly equipmentUtilityPanelMode?: KronosEquipmentUtilityPanelMode | null;
  readonly onEquipmentUtilityPanelClose?: () => void;
  readonly activeSideTabId?: KronosFixedSideTabId;
  readonly activeSpellbookId?: KronosSpellbookId;
  readonly onSideTabContextMenu?: (command: KronosSideTabCommand) => void;
  readonly onSideTabDefaultAction?: (command: KronosSideTabCommand) => void;
  readonly onSideTabHover?: (command: KronosSideTabCommand | null) => void;
  readonly inventoryItemDefinitions: KronosInventoryItemDefinitionStore;
  readonly inventoryEquipmentDefinitions: KronosInventoryEquipmentDefinitionStore;
  readonly weaponTypeDefinitions: KronosWeaponTypeDefinitionStore;
  readonly inventorySlots: readonly (RuntimeInventorySlot | null)[];
  readonly inventoryDragDelayClientTicks?: number;
  readonly drawSpecbarAnyway?: boolean;
  readonly attackStylesConfig?: RuneliteAttackStylesConfigSnapshot | null;
  readonly selectedInventoryItem?: KronosInventorySelectedItem | null;
  readonly selectedSpell?: KronosSelectedSpell | null;
  readonly prayerReorderingEnabled?: boolean;
  readonly prayerOrder?: readonly string[];
  readonly spellbookReorderingEnabled?: boolean;
  readonly spellbookOrder?: readonly string[];
  readonly pendingEquipSlotIndices?: ReadonlySet<number>;
  readonly pendingEquipmentRemoveSlotIds?: ReadonlySet<string>;
  readonly runOrbTextOverride?: string | null;
  readonly xpDropCounterShown?: boolean;
  readonly hud: RuntimeHudState;
  readonly clientFonts: KronosClientFontStore;
}

export interface KronosMinimapTileCommand {
  readonly tile: RuntimeTile;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
  readonly click: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosRunOrbCommand {
  readonly actionText: string;
  readonly actionWidgetId: number;
  readonly actionChildId: number;
  readonly sourceActionCount: number;
  readonly previousRunning: boolean;
  readonly runEnergy: number;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosXpDropOrbCommand {
  readonly actionText: string;
  readonly childId: number;
  readonly clickMask: number;
  readonly previousShown: boolean;
  readonly spriteId: number;
  readonly widgetId: number;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosInventorySlotCommand {
  readonly slotIndex: number;
  readonly slot: RuntimeInventorySlot;
  readonly widgetId: number;
  readonly itemName?: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosInventoryEmptyCommand {
  readonly widgetId: number;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosInventorySlotDragCommand {
  readonly sourceSlotIndex: number;
  readonly destinationSlotIndex: number;
  readonly sourceSlot: RuntimeInventorySlot;
  readonly destinationSlot: RuntimeInventorySlot | null;
  readonly widgetId: number;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosPrayerSlotDragCommand {
  readonly sourcePrayerId: string;
  readonly destinationPrayerId: string;
  readonly sourceSlot: KronosPrayerSlotLayout;
  readonly destinationSlot: KronosPrayerSlotLayout;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosSpellbookSpellDragCommand {
  readonly spellbookId: KronosSpellbookId;
  readonly sourceSpellId: string;
  readonly destinationSpellId: string;
  readonly sourceSpell: KronosSpellbookSpellLayout;
  readonly destinationSpell: KronosSpellbookSpellLayout;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosEquipmentItemCommand {
  readonly slot: KronosEquipmentSlotLayout;
  readonly itemId: number;
  readonly itemName: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosSideTabCommand {
  readonly tab: KronosFixedSideTabLayout;
  readonly actionText: string;
  readonly actionIndex: number;
  readonly menuOpcode: number;
  readonly sourceActions: readonly KronosSourceWidgetAction[];
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosStatsSkillCommand {
  readonly slot: KronosStatsSkillSlotLayout;
  readonly actionText: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosSpellbookSpellCommand {
  readonly spell: KronosSpellbookSpellLayout;
  readonly actionName: string;
  readonly selectedSpellName: string;
  readonly targetFlags: number;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosCombatStyleCommand {
  readonly slot: KronosCombatStyleSlotLayout;
  readonly attackSet: KronosWeaponAttackSetDefinition;
  readonly weaponType: KronosWeaponTypeDefinition;
  readonly actionText: string;
  readonly attackSetVarpId: number;
  readonly previousAttackSetIndex: number | null;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosCombatAutocastCommand {
  readonly control: KronosCombatAutocastControlLayout;
  readonly actionText: string;
  readonly autocastSlot: number;
  readonly spellId: "blood-blitz" | "ice-blitz" | "blood-barrage" | "ice-barrage";
  readonly spellName: "Blood Blitz" | "Ice Blitz" | "Blood Barrage" | "Ice Barrage";
  readonly defensive: boolean;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosCombatAutoRetaliateCommand {
  readonly control: KronosCombatAutoRetaliateLayout;
  readonly actionText: string;
  readonly autoRetaliateVarpId: number;
  readonly enabled: boolean | undefined;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosCombatSpecialCommand {
  readonly specialBar?: KronosCombatSpecialBarLayout;
  readonly specialOrb?: KronosFixedOrbLayout;
  readonly sourceControl: "combat-tab" | "minimap-orb";
  readonly actionText: string;
  readonly specialEnergyVarpId: number;
  readonly specialActiveVarpId: number;
  readonly specialActive: boolean;
  readonly specialAvailable: boolean;
  readonly specialEnergy: number;
  readonly specialDrainPercent: number;
  readonly specialDrainSource: string;
  readonly weaponItemId: number | null;
  readonly weaponName: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosPrayerSlotCommand {
  readonly slot: KronosPrayerSlotLayout;
  readonly definition: KronosPrayerDefinition;
  readonly actionText: string;
  readonly active: boolean;
  readonly activePrayerIds: readonly KronosPrayerSlotLayout["id"][];
  readonly disallowedPrayerIds: readonly KronosPrayerSlotLayout["id"][];
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export type KronosChatboxButtonId = "all" | "game" | "public" | "private" | "clan" | "trade" | "report";

export interface KronosChatboxButtonCommand {
  readonly buttonId: KronosChatboxButtonId;
  readonly label: string;
  readonly widget: KronosResolvedWidget;
  readonly actionText: string;
  readonly actionIndex: number;
  readonly menuOpcode: number;
  readonly actions: readonly string[];
  readonly sourceActions: readonly KronosSourceWidgetAction[];
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosSourceWidgetAction {
  readonly actionIndex: number;
  readonly actionText: string;
  readonly menuOpcode: number;
}

export interface KronosSocialMember {
  readonly name: string;
  readonly previousName?: string;
  readonly world: number;
  readonly rank?: number;
}

export interface KronosSocialListsSnapshot {
  readonly friends: readonly KronosSocialMember[];
  readonly ignores: readonly KronosSocialMember[];
  readonly loaded: boolean;
}

export type KronosSocialListKind = "friends" | "ignores";

export type KronosSocialButtonAction = "switch" | "add" | "delete";

export interface KronosSocialButtonCommand {
  readonly action: KronosSocialButtonAction;
  readonly list: KronosSocialListKind;
  readonly actionText: string;
  readonly actionIndex: number;
  readonly childId: number;
  readonly widgetId: number;
  readonly clickMask: number;
  readonly sourcePacketId?: 80 | 48 | 84 | 56;
  readonly sourcePacketName?: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosClanChatMember {
  readonly name: string;
  readonly world: number;
  readonly rank: number;
  readonly self?: boolean;
  readonly friend?: boolean;
  readonly ignored?: boolean;
}

export interface KronosClanChatSnapshot {
  readonly active: boolean;
  readonly displayName: string;
  readonly ownerName: string;
  readonly localRank: number;
  readonly minKickRank: number;
  readonly members: readonly KronosClanChatMember[];
}

export type KronosClanChatButtonAction = "join" | "leave" | "setup";

export interface KronosClanChatButtonCommand {
  readonly action: KronosClanChatButtonAction;
  readonly actionText: string;
  readonly actionIndex: number;
  readonly childId: number;
  readonly widgetId: number;
  readonly clickMask: number;
  readonly sourcePacketId?: 53;
  readonly sourcePacketName?: string;
  readonly sourceServerHandler: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface KronosEquipmentUtilityButtonCommand {
  readonly button: KronosEquipmentUtilityButtonLayout;
  readonly actionText: string;
  readonly actionIndex: number;
  readonly menuOpcode: number;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export type KronosEquipmentUtilityPanelMode = "stats" | "items-kept-on-death" | "guide-prices" | "call-follower";

interface KronosSpriteProps {
  readonly atlas: KronosHudAtlas;
  readonly alias: string;
  readonly className: string;
  readonly style?: CSSProperties;
}

interface KronosOrbProps {
  readonly atlas: KronosHudAtlas;
  readonly className: string;
  readonly clientFonts: KronosClientFontStore;
  readonly id: KronosFixedOrbId;
  readonly layout: KronosFixedOrbLayout | null;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
  readonly value: number;
  readonly maxValue: number;
  readonly valueTextOverride?: string | null;
  readonly active?: boolean;
  readonly actionEnabled?: boolean;
  readonly ariaLabel?: string;
  readonly fillerSpriteIdOverride?: number;
  readonly fillerTransparency?: number | null;
  readonly onDefaultAction?: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly sourceDrawState?: string;
}

interface KronosInventorySlotProps {
  readonly atlas: KronosHudAtlas | undefined;
  readonly clientFonts: KronosClientFontStore;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
  readonly slot: RuntimeInventorySlot | null;
  readonly index: number;
  readonly widgetId: number;
  readonly itemDefinition: KronosInventoryItemDefinition | undefined;
  readonly selectedItem: KronosInventorySelectedItem | null;
  readonly pendingEquip?: boolean;
  readonly inventoryDragDelayClientTicks: number | undefined;
  readonly onContextMenu: ((command: KronosInventorySlotCommand) => void) | undefined;
  readonly onDefaultAction: ((command: KronosInventorySlotCommand) => void) | undefined;
  readonly onDragReorder: ((command: KronosInventorySlotDragCommand) => void) | undefined;
  readonly onHover: ((command: KronosInventorySlotCommand | null) => void) | undefined;
}

interface KronosInventorySlotDragState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly startedAtMs: number;
  readonly active: boolean;
  readonly sourceCommand: KronosInventorySlotCommand;
}

const inventorySlotCount = 28;
const inventoryQuantityFontId = 494;
const inventoryQuantityBaselineY = 9;
const inventoryQuantityShadowSourceColor = 1;
const inventoryDragThresholdPixels = 5;
const inventoryClientTickMs = 20;
const inventoryDefaultDragDelayClientTicks = 5;
const inventoryDragAlpha = 0.5;
// Kronos opens right-click menus from one global last-pressed mouse position, not from later hover/drag positions.
let kronosInventorySuppressContextMenuUntilMs = 0;
const inventoryContextMenuDuplicateWindowMs = 250;
const hiddenWidgetSpriteIds = new Set([1183, 1184]);
const equipmentSlotTileSpriteId = 170;
const statsTileHalfLeftSpriteId = 174;
const statsTileHalfRightWithSlashSpriteId = 175;
const statsTileHalfRightSpriteId = 176;

function kronosInventoryPointerNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function kronosInventorySuppressNextContextMenuEvent(): void {
  kronosInventorySuppressContextMenuUntilMs =
    kronosInventoryPointerNowMs() + inventoryContextMenuDuplicateWindowMs;
}

function consumeKronosInventorySuppressedContextMenuEvent(): boolean {
  if (kronosInventorySuppressContextMenuUntilMs <= 0) {
    return false;
  }
  if (kronosInventoryPointerNowMs() <= kronosInventorySuppressContextMenuUntilMs) {
    return true;
  }
  kronosInventorySuppressContextMenuUntilMs = 0;
  return false;
}
const activatedPrayerBackgroundSpriteId = 155;
const prayerIconGraphicSize = { width: 30, height: 30 } as const;
const statsCurrentLevelCs1Opcode = 1;
const statsFixedLevelCs1Opcode = 2;
const statsTotalLevelCs1Opcode = 9;
const statsEnabledSkillCount = 23;
const combatAttackSetVarpId = 43;
const combatAutoRetaliateVarpId = 172;
const combatSpecialEnergyVarpId = 300;
const combatSpecialActiveVarpId = 301;
const specialOrbUnavailableFillerSpriteId = 1064;
const specialOrbAvailableTransparency = 25;
const specialOrbUnavailableTransparency = 50;
const combatIceBarrageAutocastSlot = 46;
const combatStyleButtonSpriteId = 653;
const combatStyleButtonSelectedSpriteId = 654;
const combatAutoRetaliateButtonSpriteId = 655;
const combatAutoRetaliateButtonSelectedSpriteId = 656;
const combatSpecialAttackButtonSpriteId = 657;
const combatOptionsButtonFrameBorder = 6;
const combatSkillAttackSpriteId = 197;
const combatSkillStrengthSpriteId = 198;
const combatSkillDefenceSpriteId = 199;
const combatSkillRangedSpriteId = 200;
const combatSkillMagicSpriteId = 202;
const combatInterfaceSetupStaffConfigs = new Set([18, 21]);
const combatInterfaceSetupDynamicChildIdMin = 4;
const combatInterfaceSetupDynamicChildIdMax = 42;
const combatInterfaceSetupDefaultLayout = {
  x: 20,
  y: 45,
  slotWidth: 71,
  slotHeight: 47,
  slotColumnGap: 8,
  slotRowGap: 7,
  autoRetaliateHeight: 44,
  specialHeight: 26,
  specialGap: 7
} as const;
const combatInterfaceSetupWandLayout = {
  x: 20,
  y: 45,
  slotWidth: 71,
  slotHeight: 32,
  slotGap: 4,
  autocastGap: 8,
  autocastHeight: 104,
  autocastControlHeight: 50,
  autoRetaliateHeight: 44,
  specialHeight: 26,
  specialGap: 7
} as const;
const combatInterfaceSetupPresentationByConfig: Readonly<
  Record<number, Readonly<Record<number, { readonly label: string; readonly graphic: string; readonly spriteAlias: string }>>>
> = {
  2: {
    0: { label: "Pound", graphic: "combaticons2,2", spriteAlias: "combat_icon_gmaul_pound" },
    1: { label: "Pummel", graphic: "combaticons2,3", spriteAlias: "combat_icon_gmaul_pummel" },
    3: { label: "Block", graphic: "combaticons2,0", spriteAlias: "combat_icon_gmaul_block" }
  },
  5: {
    0: { label: "Accurate", graphic: "combaticons2,5", spriteAlias: "combat_icon_crossbow_accurate" },
    1: { label: "Rapid", graphic: "combaticons2,6", spriteAlias: "combat_icon_crossbow_rapid" },
    3: { label: "Longrange", graphic: "combaticons2,7", spriteAlias: "combat_icon_crossbow_longrange" }
  },
  18: {
    0: { label: "Bash", graphic: "combaticons2,13", spriteAlias: "combat_icon_wand_bash" },
    1: { label: "Pound", graphic: "combaticons2,14", spriteAlias: "combat_icon_wand_pound" },
    3: { label: "Focus", graphic: "combaticons,19", spriteAlias: "combat_icon_wand_focus" }
  },
  20: {
    0: { label: "Flick", graphic: "combaticons3,13", spriteAlias: "combat_icon_whip_flick" },
    1: { label: "Lash", graphic: "combaticons3,14", spriteAlias: "combat_icon_whip_lash" },
    3: { label: "Deflect", graphic: "combaticons3,13", spriteAlias: "combat_icon_whip_flick" }
  },
  21: {
    0: { label: "Jab", graphic: "combaticons2,13", spriteAlias: "combat_icon_wand_bash" },
    1: { label: "Swipe", graphic: "combaticons2,14", spriteAlias: "combat_icon_wand_pound" },
    3: { label: "Fend", graphic: "combaticons,19", spriteAlias: "combat_icon_wand_focus" }
  }
};
const widgetDefaultActionOpcode = 57;
const widgetHighActionOpcode = 1007;
const statsLevelArrayIndexBySkillId: Readonly<Record<KronosStatsSkillSlotLayout["id"], number>> = {
  attack: 0,
  defence: 1,
  strength: 2,
  hitpoints: 3,
  ranged: 4,
  prayer: 5,
  magic: 6,
  cooking: 7,
  woodcutting: 8,
  fletching: 9,
  fishing: 10,
  firemaking: 11,
  crafting: 12,
  smithing: 13,
  mining: 14,
  herblore: 15,
  agility: 16,
  thieving: 17,
  slayer: 18,
  farming: 19,
  runecrafting: 20,
  hunter: 21,
  construction: 22
};

export function KronosClientHud({
  spriteAtlases,
  layout,
  sourceLayout,
  snapshot,
  minimapDestinationTile,
  minimapCameraYaw,
  minimapSceneSprite,
  cameraZoom,
  onCameraZoomChange,
  onCameraZoomReset,
  onMinimapTileCommand,
  onInventoryContextMenu,
  onInventoryEmptyContextMenu,
  onInventoryDefaultAction,
  onInventoryDragReorder,
  onInventoryHover,
  onEquipmentItemContextMenu,
  onEquipmentItemDefaultAction,
  onEquipmentItemHover,
  onStatsSkillDefaultAction,
  onSpellDefaultAction,
  onSpellDragReorder,
  onCombatStyleDefaultAction,
  onCombatAutocastDefaultAction,
  onCombatAutoRetaliateDefaultAction,
  onCombatSpecialDefaultAction,
  onPrayerDefaultAction,
  onPrayerDragReorder,
  onRunOrbDefaultAction,
  onXpDropOrbDefaultAction,
  onXpDropOrbContextMenu,
  gameKeybinds,
  gameKeybindInterfaceOpen,
  gameKeybindSelectedTabId,
  onGameKeybindInterfaceOpen,
  onGameKeybindInterfaceClose,
  onGameKeybindSelectedTabChange,
  onGameKeybindChange,
  onGameKeybindEscapeCloseChange,
  onGameKeybindRestoreDefaults,
  onChatboxContextMenu,
  onChatboxDefaultAction,
  onChatboxHover,
  socialLists,
  onSocialButtonDefaultAction,
  clanChat,
  onClanChatButtonDefaultAction,
  onEquipmentUtilityDefaultAction,
  equipmentUtilityPanelMode,
  onEquipmentUtilityPanelClose,
  activeSideTabId,
  activeSpellbookId,
  onSideTabContextMenu,
  onSideTabDefaultAction,
  onSideTabHover,
  inventoryItemDefinitions,
  inventoryEquipmentDefinitions,
  weaponTypeDefinitions,
  inventorySlots,
  inventoryDragDelayClientTicks,
  drawSpecbarAnyway,
  attackStylesConfig,
  selectedInventoryItem,
  selectedSpell,
  prayerReorderingEnabled,
  prayerOrder,
  spellbookReorderingEnabled,
  spellbookOrder,
  pendingEquipSlotIndices,
  pendingEquipmentRemoveSlotIds,
  runOrbTextOverride,
  xpDropCounterShown,
  hud,
  clientFonts
}: KronosClientHudProps): JSX.Element | null {
  const atlas = spriteAtlases.get("client_ui");
  if (!atlas || !layout || !sourceLayout) {
    return null;
  }
  const normalizedInventorySlots = normalizeKronosInventorySlots(inventorySlots);
  const localEquipmentItemIds = localPlayerEquipmentItemIdsBySlot(snapshot, inventoryEquipmentDefinitions);
  const localWeaponItemId = localEquipmentItemIds.get(3) ?? null;
  const localWeaponDefinition = localWeaponItemId === null ? undefined : inventoryEquipmentDefinitions.get(localWeaponItemId);
  const localWeaponHasSpecialAttack = Boolean(localWeaponDefinition?.specialAttack);
  const inventoryGrid = sourceLayout?.inventoryGrid ?? null;
  const orbLayouts = new Map(sourceLayout?.orbs.map((orb) => [orb.id, orb]) ?? []);
  const hpOrbLayout = orbLayouts.get("hp") ?? null;
  const prayerOrbLayout = orbLayouts.get("prayer") ?? null;
  const runOrbLayout = orbLayouts.get("run") ?? null;
  const specOrbLayout = orbLayouts.get("spec") ?? null;
  const runOrbActionText = kronosSourceActionText(runOrbLayout?.actions ?? []);
  const resolvedActiveSideTabId = resolveActiveSideTabId(sourceLayout?.sidePanel ?? null, activeSideTabId);
  const resolvedActiveSpellbookId = activeSpellbookId ?? "ancient";
  const activeSidePanelInterface =
    resolvedActiveSideTabId === "inventory" ? null : sourceLayout?.sidePanelInterfaces[resolvedActiveSideTabId] ?? null;
  const equipmentPanel = resolvedActiveSideTabId === "equipment" ? sourceLayout?.equipmentPanel ?? null : null;
  const combatPanel = resolvedActiveSideTabId === "combat" ? sourceLayout?.combatPanel ?? null : null;
  const suppressedMountedWidgetIds = new Set<number>();
  if (activeSidePanelInterface?.groupId === KRONOS_COMBAT_GROUP_ID) {
    // Source: [clientscript,combat_interface_setup].cs2 owns interface_593 dynamic children 4-42 at runtime.
    for (const widget of activeSidePanelInterface.widgets) {
      if (
        widget.widget.childId >= combatInterfaceSetupDynamicChildIdMin &&
        widget.widget.childId <= combatInterfaceSetupDynamicChildIdMax
      ) {
        suppressedMountedWidgetIds.add(widget.widget.id);
      }
    }
  }
  if (equipmentPanel !== null) {
    for (const button of equipmentPanel.utilityButtons) {
      if (button.spriteWidgetId !== null) {
        suppressedMountedWidgetIds.add(button.spriteWidgetId);
      }
    }
  }
  if (activeSidePanelInterface?.groupId === KRONOS_NOTICEBOARD_GROUP_ID) {
    for (const widget of activeSidePanelInterface.widgets) {
      if (kronosNoticeboardScrollTextChildIds.has(widget.widget.childId)) {
        suppressedMountedWidgetIds.add(widget.widget.id);
      }
    }
  }
  if (activeSidePanelInterface?.groupId === KRONOS_FRIENDS_GROUP_ID) {
    for (const widget of activeSidePanelInterface.widgets) {
      if (widget.widget.childId === kronosFriendsListDynamicTextChildId) {
        suppressedMountedWidgetIds.add(widget.widget.id);
      }
    }
  }
  if (activeSidePanelInterface?.groupId === KRONOS_IGNORES_GROUP_ID) {
    for (const widget of activeSidePanelInterface.widgets) {
      if (widget.widget.childId === kronosIgnoreListDynamicTextChildId) {
        suppressedMountedWidgetIds.add(widget.widget.id);
      }
    }
  }
  if (activeSidePanelInterface?.groupId === KRONOS_OPTIONS_GROUP_ID) {
    for (const widget of activeSidePanelInterface.widgets) {
      if (
        kronosOptionsKeybindingSuppressedChildIds.has(widget.widget.childId) ||
        widget.widget.childId === kronosOptionsZoomSliderKnobChildId
      ) {
        suppressedMountedWidgetIds.add(widget.widget.id);
      }
    }
  }
  const prayerPanel = resolvedActiveSideTabId === "prayer" ? sourceLayout?.prayerPanel ?? null : null;
  const spellbookPanel =
    resolvedActiveSideTabId === "magic"
      ? sourceLayout?.spellbookPanels[resolvedActiveSpellbookId] ?? sourceLayout?.spellbookPanel ?? null
      : null;
  const statsPanel = resolvedActiveSideTabId === "stats" ? sourceLayout?.statsPanel ?? null : null;
  const noticeboardPanel =
    activeSidePanelInterface?.groupId === KRONOS_NOTICEBOARD_GROUP_ID ? activeSidePanelInterface : null;
  const emotePanel = activeSidePanelInterface?.groupId === KRONOS_EMOTES_GROUP_ID ? activeSidePanelInterface : null;

  return (
    <div className="kronosClientHud" aria-label="NH Trainer fixed-mode client interface">
      <div className="kronosFixedClient" style={fixedClientStyle(layout)}>
        <KronosMinimapOverlay
          cameraYaw={minimapCameraYaw}
          clientAtlas={atlas}
          destinationTile={minimapDestinationTile}
          minimapSceneSprite={minimapSceneSprite}
          mapDotAtlas={spriteAtlases.get("minimap_map_dots")}
          mapIconAtlas={spriteAtlases.get("minimap_map_icons")}
          mapMarkerAtlas={spriteAtlases.get("minimap_map_markers")}
          mapSceneAtlas={spriteAtlases.get("minimap_map_scenes")}
          onTileCommand={onMinimapTileCommand}
          snapshot={snapshot}
          widget={sourceLayout?.minimapWidget ?? null}
        />
        <KronosCompassOverlay
          clientAtlas={atlas}
          compassAtlas={spriteAtlases.get("compass")}
          cameraYaw={minimapCameraYaw}
          widget={sourceLayout?.compassWidget ?? null}
        />
        <KronosWidgetSpriteLayer atlas={atlas} layout={sourceLayout} activeSideTabId={resolvedActiveSideTabId} />
        <KronosXpDropOrb
          atlas={atlas}
          layout={sourceLayout.xpDropOrb}
          onDefaultAction={onXpDropOrbDefaultAction}
          onContextMenu={onXpDropOrbContextMenu}
          shown={xpDropCounterShown !== false}
        />
        <KronosSideTabClickLayer
          activeSideTabId={resolvedActiveSideTabId}
          layout={sourceLayout?.sidePanel ?? null}
          onContextMenu={onSideTabContextMenu}
          onDefaultAction={onSideTabDefaultAction}
          onHover={onSideTabHover}
        />
        <KronosMountedWidgetLayer
          atlas={atlas}
          clientFonts={clientFonts}
          layout={activeSidePanelInterface}
          spriteAtlases={spriteAtlases}
          suppressedWidgetIds={suppressedMountedWidgetIds.size > 0 ? suppressedMountedWidgetIds : undefined}
        />
        <KronosOptionsCameraZoomLayer
          atlas={atlas}
          cameraZoom={cameraZoom ?? KRONOS_CAMERA_DEFAULT_ZOOM}
          layout={resolvedActiveSideTabId === "options" ? activeSidePanelInterface : null}
          onChange={onCameraZoomChange}
          onReset={onCameraZoomReset}
          viewportHeight={sourceLayout.viewport.rect.height}
        />
        <KronosNoticeboardLayer
          clientFonts={clientFonts}
          layout={noticeboardPanel}
          snapshot={snapshot}
          spriteAtlases={spriteAtlases}
        />
        <KronosSocialPanelLayer
          clientFonts={clientFonts}
          layout={activeSidePanelInterface}
          onButtonDefaultAction={onSocialButtonDefaultAction}
          socialLists={socialLists}
          spriteAtlases={spriteAtlases}
        />
        <KronosClanChatPanelLayer
          clanChat={clanChat}
          clientFonts={clientFonts}
          layout={activeSidePanelInterface}
          onButtonDefaultAction={onClanChatButtonDefaultAction}
          spriteAtlases={spriteAtlases}
        />
        <KronosEmotePanelLayer layout={emotePanel} spriteAtlases={spriteAtlases} />
        <KronosOptionsKeybindingControlLayer
          atlas={atlas}
          layout={resolvedActiveSideTabId === "options" ? activeSidePanelInterface : null}
          onOpen={onGameKeybindInterfaceOpen}
        />
        <KronosGameKeybindingInterface
          atlas={atlas}
          clientFonts={clientFonts}
          keybinds={gameKeybinds}
          onChange={onGameKeybindChange}
          onClose={onGameKeybindInterfaceClose}
          onEscapeCloseChange={onGameKeybindEscapeCloseChange}
          onRestoreDefaults={onGameKeybindRestoreDefaults}
          onSelectedTabChange={onGameKeybindSelectedTabChange}
          open={gameKeybindInterfaceOpen === true}
          selectedTabId={gameKeybindSelectedTabId}
          sidePanel={sourceLayout?.sidePanel ?? null}
          spriteAtlases={spriteAtlases}
          viewport={sourceLayout.viewport.rect}
        />
        <KronosEquipmentItemLayer
          clientAtlas={atlas}
          equipmentDefinitions={inventoryEquipmentDefinitions}
          itemAtlas={spriteAtlases.get("item_sprites")}
          onContextMenu={onEquipmentItemContextMenu}
          onDefaultAction={onEquipmentItemDefaultAction}
          onHover={onEquipmentItemHover}
          panel={equipmentPanel}
          pendingRemoveSlotIds={pendingEquipmentRemoveSlotIds}
          snapshot={snapshot}
        />
        <KronosEquipmentUtilityButtonLayer
          atlas={atlas}
          onDefaultAction={onEquipmentUtilityDefaultAction}
          panel={equipmentPanel}
        />
        <KronosEquipmentUtilityPanel
          clientFonts={clientFonts}
          equipmentDefinitions={inventoryEquipmentDefinitions}
          inventorySlots={normalizedInventorySlots}
          mode={equipmentUtilityPanelMode ?? null}
          onClose={onEquipmentUtilityPanelClose}
          panel={equipmentPanel}
          snapshot={snapshot}
          spriteAtlases={spriteAtlases}
          viewport={sourceLayout.viewport.rect}
        />
        <KronosCombatPanelLayer
          clientFonts={clientFonts}
          equipmentDefinitions={inventoryEquipmentDefinitions}
          hud={hud}
          onAutocastDefaultAction={onCombatAutocastDefaultAction}
          onAutoRetaliateDefaultAction={onCombatAutoRetaliateDefaultAction}
          onSpecialDefaultAction={onCombatSpecialDefaultAction}
          onStyleDefaultAction={onCombatStyleDefaultAction}
          panel={combatPanel}
          snapshot={snapshot}
          spriteAtlases={spriteAtlases}
          weaponTypeDefinitions={weaponTypeDefinitions}
          drawSpecbarAnyway={drawSpecbarAnyway === true}
          attackStylesConfig={attackStylesConfig ?? null}
        />
        <KronosStatsPanelLayer
          atlas={atlas}
          clientFonts={clientFonts}
          hud={hud}
          onDefaultAction={onStatsSkillDefaultAction}
          panel={statsPanel}
          spriteAtlases={spriteAtlases}
        />
        <KronosPrayerIconLayer
          atlas={spriteAtlases.get("prayer_icons")}
          hud={hud}
          onDefaultAction={onPrayerDefaultAction}
          onDragReorder={onPrayerDragReorder}
          panel={prayerPanel}
          reorderingEnabled={prayerReorderingEnabled === true}
          reorderOrder={prayerOrder}
        />
        <KronosSpellbookIconLayer
          atlas={spriteAtlases.get("spell_icons")}
          hud={hud}
          onDefaultAction={onSpellDefaultAction}
          onDragReorder={onSpellDragReorder}
          panel={spellbookPanel}
          reorderingEnabled={spellbookReorderingEnabled === true}
          reorderOrder={spellbookOrder}
          selectedSpell={selectedSpell ?? null}
        />
        <KronosOrb
          atlas={atlas}
          className="kronosFixedOrb kronosFixedOrb-hp"
          clientFonts={clientFonts}
          id="hp"
          layout={hpOrbLayout}
          spriteAtlases={spriteAtlases}
          value={hud.hitpoints}
          maxValue={hud.hitpointsMax}
        />
        <KronosOrb
          atlas={atlas}
          className="kronosFixedOrb kronosFixedOrb-prayer"
          clientFonts={clientFonts}
          id="prayer"
          layout={prayerOrbLayout}
          spriteAtlases={spriteAtlases}
          value={hud.prayer}
          maxValue={hud.prayerMax}
        />
        <KronosOrb
          atlas={atlas}
          className="kronosFixedOrb kronosFixedOrb-run"
          clientFonts={clientFonts}
          id="run"
          layout={runOrbLayout}
          ariaLabel="Toggle run"
          onDefaultAction={(event) => {
            const actionWidgetId = runOrbLayout?.actionWidgetId ?? null;
            const actionChildId = runOrbLayout?.actionChildId ?? null;
            if (!onRunOrbDefaultAction || actionWidgetId === null || actionChildId === null) {
              return;
            }
            const previousRunning = hud.running === true;
            onRunOrbDefaultAction({
              actionText: runOrbActionText,
              actionWidgetId,
              actionChildId,
              sourceActionCount: runOrbLayout?.actions.length ?? 0,
              previousRunning,
              runEnergy: hud.runEnergy,
              position: runtimeViewportPointerPosition(event)
            });
          }}
          spriteAtlases={spriteAtlases}
          value={hud.runEnergy}
          maxValue={100}
          valueTextOverride={runOrbTextOverride}
          active={hud.running === true}
        />
        <KronosOrb
          atlas={atlas}
          className="kronosFixedOrb kronosFixedOrb-spec"
          clientFonts={clientFonts}
          id="spec"
          layout={specOrbLayout}
          ariaLabel="Use Special Attack"
          actionEnabled={localWeaponHasSpecialAttack}
          fillerSpriteIdOverride={localWeaponHasSpecialAttack ? undefined : specialOrbUnavailableFillerSpriteId}
          fillerTransparency={localWeaponHasSpecialAttack ? specialOrbAvailableTransparency : specialOrbUnavailableTransparency}
          onDefaultAction={
            localWeaponHasSpecialAttack
              ? (event) => {
                  const actionWidgetId = specOrbLayout?.actionWidgetId ?? null;
                  const actionChildId = specOrbLayout?.actionChildId ?? null;
                  if (!onCombatSpecialDefaultAction || !specOrbLayout || actionWidgetId === null || actionChildId === null) {
                    return;
                  }
                  const specialEnergy = normalizeSpecialEnergy(hud.specialEnergy);
                  const specialDrainPercent = normalizeSpecialDrainPercent(localWeaponDefinition?.specialAttack?.drainPercent ?? 0);
                  onCombatSpecialDefaultAction({
                    sourceControl: "minimap-orb",
                    specialOrb: specOrbLayout,
                    actionText: "Use",
                    specialEnergyVarpId: combatSpecialEnergyVarpId,
                    specialActiveVarpId: combatSpecialActiveVarpId,
                    specialActive: hud.specialActive === true,
                    specialAvailable: true,
                    specialEnergy,
                    specialDrainPercent,
                    specialDrainSource: localWeaponDefinition?.specialAttack?.source ?? "",
                    weaponItemId: localWeaponItemId,
                    weaponName: localWeaponDefinition?.name ?? "Unarmed",
                    position: runtimeViewportPointerPosition(event)
                  });
                }
              : undefined
          }
          sourceDrawState={localWeaponHasSpecialAttack ? "orbs_spec_draw_button:toggle" : "orbs_spec_draw_button:no-special"}
          spriteAtlases={spriteAtlases}
          value={hud.specialEnergy}
          maxValue={100}
          active={localWeaponHasSpecialAttack && hud.specialActive === true}
        />
        {resolvedActiveSideTabId === "inventory" && inventoryGrid ? (
          <div
            className="kronosInventoryGrid"
            aria-label="Inventory"
            style={inventoryGridStyle(inventoryGrid)}
            onContextMenu={(event) => {
              if (event.target !== event.currentTarget) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              if (consumeKronosInventorySuppressedContextMenuEvent()) {
                return;
              }
              onInventoryEmptyContextMenu?.({
                widgetId: inventoryGrid.widgetId,
                position: runtimeViewportPointerPosition(event)
              });
            }}
            onPointerDown={(event) => {
              if (event.button !== 2 || event.target !== event.currentTarget) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              kronosInventorySuppressNextContextMenuEvent();
              onInventoryEmptyContextMenu?.({
                widgetId: inventoryGrid.widgetId,
                position: runtimeViewportPointerPosition(event)
              });
            }}
          >
            {Array.from({ length: inventorySlotCount }, (_, index) => (
              <KronosInventorySlotView
                atlas={spriteAtlases.get("item_sprites")}
                clientFonts={clientFonts}
                index={index}
                key={index}
                itemDefinition={
                  normalizedInventorySlots[index]
                    ? inventoryItemDefinitions.get(normalizedInventorySlots[index].itemId)
                    : undefined
                }
                onContextMenu={onInventoryContextMenu}
                onDefaultAction={onInventoryDefaultAction}
                onDragReorder={onInventoryDragReorder}
                onHover={onInventoryHover}
                inventoryDragDelayClientTicks={inventoryDragDelayClientTicks}
                pendingEquip={pendingEquipSlotIndices?.has(index) === true}
                slot={normalizedInventorySlots[index]}
                selectedItem={selectedInventoryItem ?? null}
                spriteAtlases={spriteAtlases}
                widgetId={inventoryGrid.widgetId}
              />
            ))}
          </div>
        ) : null}
        <KronosSprite
          atlas={atlas}
          alias="chat_background"
          className="kronosFixedChatbox"
          style={chatboxBackgroundStyle(sourceLayout?.chatbox ?? null)}
        />
        <KronosMountedWidgetLayer
          atlas={atlas}
          clientFonts={clientFonts}
          layout={sourceLayout?.chatbox ?? null}
          spriteAtlases={spriteAtlases}
        />
        <KronosChatboxClickLayer
          layout={sourceLayout?.chatbox ?? null}
          onContextMenu={onChatboxContextMenu}
          onDefaultAction={onChatboxDefaultAction}
          onHover={onChatboxHover}
        />
      </div>
    </div>
  );
}

function fixedClientStyle(layout: KronosFixedClientCssLayout | null): CSSProperties | undefined {
  if (!layout) {
    return undefined;
  }

  return {
    left: layout.surfaceRect.x,
    top: layout.surfaceRect.y,
    right: "auto",
    bottom: "auto",
    transform: `scale(${layout.scale})`,
    transformOrigin: "left top"
  };
}

function resolveActiveSideTabId(
  sidePanel: KronosFixedSidePanelLayout | null,
  activeSideTabId: KronosFixedSideTabId | undefined
): KronosFixedSideTabId {
  const defaultTabId = sidePanel?.defaultTabId ?? "inventory";
  if (!activeSideTabId) {
    return defaultTabId;
  }
  return sidePanel?.tabs.some((tab) => tab.id === activeSideTabId) ? activeSideTabId : defaultTabId;
}

function kronosSideTabLabel(tab: KronosFixedSideTabLayout): string {
  return `Fixed viewport ${tab.id.replace("-", " ")} tab`;
}

function KronosCompassOverlay({
  clientAtlas,
  compassAtlas,
  cameraYaw,
  widget
}: {
  readonly clientAtlas: KronosHudAtlas;
  readonly compassAtlas: KronosHudAtlas | undefined;
  readonly cameraYaw: number;
  readonly widget: KronosResolvedWidget | null;
}): JSX.Element | null {
  if (!widget) {
    return null;
  }
  const maskSprite = findSprite(clientAtlas, "fixed_mode_compass_alpha_mask");
  const compassSprite = compassAtlas ? findSprite(compassAtlas, "compass") : undefined;
  if (!compassAtlas || !compassSprite) {
    return null;
  }
  const angleDegrees = (Math.trunc(cameraYaw) / 2048) * 360;
  return (
    <div
      className="kronosCompassOverlay"
      data-camera-yaw={Math.trunc(cameraYaw)}
      data-source-draw="AttackOption.compass.method6205(var1,var2,mask.width,mask.height,25,25,Client.camAngleY,256,mask.xStarts,mask.xWidths)"
      data-source-load="AttackOption.compass = NPCDefinition.method4417(archive8, GraphicsDefaults.compass, 0)"
      data-source-center-x={25}
      data-source-center-y={25}
      data-source-scale={256}
      data-mask-sprite-id={maskSprite?.spriteId ?? ""}
      data-mask-row-count={maskSprite?.maskXStarts?.length ?? ""}
      data-compass-sprite-id={compassSprite.spriteId}
      style={compassOverlayStyle(widget.rect, maskSprite)}
    >
      <span
        className="kronosCompassSpriteRotator"
        data-angle-degrees={angleDegrees}
        style={compassSpriteRotatorStyle(angleDegrees)}
      >
        <span className="kronosCompassSprite" style={spriteStyle(compassAtlas, compassSprite)} />
      </span>
    </div>
  );
}

function KronosMinimapOverlay({
  cameraYaw,
  clientAtlas,
  destinationTile,
  minimapSceneSprite,
  mapDotAtlas,
  mapIconAtlas,
  mapMarkerAtlas,
  mapSceneAtlas,
  onTileCommand,
  snapshot,
  widget
}: {
  readonly cameraYaw: number;
  readonly clientAtlas: KronosHudAtlas;
  readonly destinationTile: RuntimeTile | null;
  readonly minimapSceneSprite: KronosMinimapSceneSprite | null;
  readonly mapDotAtlas: KronosHudAtlas | undefined;
  readonly mapIconAtlas: KronosHudAtlas | undefined;
  readonly mapMarkerAtlas: KronosHudAtlas | undefined;
  readonly mapSceneAtlas: KronosHudAtlas | undefined;
  readonly onTileCommand: ((command: KronosMinimapTileCommand) => void) | undefined;
  readonly snapshot: RuntimeSceneSnapshot;
  readonly widget: KronosResolvedWidget | null;
}): JSX.Element | null {
  if (!widget) {
    return null;
  }

  const minimapMaskSprite = findSprite(clientAtlas, "fixed_mode_minimap_alpha_mask");
  const mask = spriteMaskFromSprite(minimapMaskSprite, widget.rect.width, widget.rect.height);
  const localPlayer = kronosMinimapLocalPlayerDot(mask);
  const localActor = snapshot.actors.find((actor) => actor.actorId === "local-player") ?? null;
  const localActorMinimapTile = localActor ? kronosMinimapActorTile(localActor) : null;
  const drawsScene = kronosMinimapDrawsScene(snapshot.minimapState);
  const activeDestinationTile = destinationTile ?? snapshot.minimapDestination;
  const sceneTransform = drawsScene && minimapSceneSprite && localActorMinimapTile
    ? kronosMinimapSceneTransform(minimapSceneSprite, localActorMinimapTile, cameraYaw, mask)
    : null;
  const minimapDotSpriteSizeForKind = (kind: RuntimeMinimapDotKind) => {
    const sprite = mapDotAtlas ? findMinimapDotSprite(mapDotAtlas, kind) : undefined;
    return sprite ? { width: sprite.width, height: sprite.height } : null;
  };
  const destinationMarkerSprite = mapMarkerAtlas ? findMinimapMarkerSprite(mapMarkerAtlas, "destination") : undefined;
  const hintMarkerSprite = mapMarkerAtlas ? findMinimapMarkerSprite(mapMarkerAtlas, "hint") : undefined;
  const sceneMapIcons =
    drawsScene && localActorMinimapTile && minimapSceneSprite && mapIconAtlas
      ? minimapSceneSprite.mapIconObjects.flatMap((object) => {
          const sprite = findMinimapMapIconSprite(mapIconAtlas, object.mapIconId);
          if (!sprite) {
            return [];
          }
          const icon = kronosMinimapMapIconForObject(object, localActorMinimapTile, cameraYaw, mask, {
            width: sprite.width,
            height: sprite.height
          });
          return icon ? [icon] : [];
        })
      : [];
  const snapshotMapIcons =
    drawsScene && localActorMinimapTile && mapIconAtlas
      ? snapshot.minimapMapIcons.flatMap((sourceIcon) => {
          const sprite = findMinimapMapIconSprite(mapIconAtlas, sourceIcon.mapIconId);
          if (!sprite) {
            return [];
          }
          const icon = kronosMinimapMapIconForSource(sourceIcon, localActorMinimapTile, cameraYaw, mask, {
            width: sprite.width,
            height: sprite.height
          });
          return icon ? [icon] : [];
        })
      : [];
  const mapIcons = [...sceneMapIcons, ...snapshotMapIcons];
  const dots = drawsScene && mapDotAtlas
    ? kronosMinimapDotsForSnapshot(snapshot, cameraYaw, mask, minimapDotSpriteSizeForKind)
    : [];
  const destinationMarker =
    drawsScene && localActorMinimapTile && activeDestinationTile && destinationMarkerSprite
      ? kronosMinimapDestinationMarker(
          localActorMinimapTile,
          activeDestinationTile,
          cameraYaw,
          mask,
          { width: destinationMarkerSprite.width, height: destinationMarkerSprite.height }
        )
      : null;
  const hintMarkers =
    drawsScene && localActorMinimapTile && hintMarkerSprite
      ? snapshot.minimapHints.flatMap((hint) => {
          const marker = kronosMinimapHintMarker(
            hint.id,
            localActorMinimapTile,
            hint.tile,
            cameraYaw,
            mask,
            { width: hintMarkerSprite.width, height: hintMarkerSprite.height }
          );
          return marker ? [marker] : [];
        })
      : [];

  return (
    <div
      className="kronosMinimapOverlay"
      data-camera-yaw={Math.trunc(cameraYaw)}
      data-minimap-state={snapshot.minimapState ?? ""}
      data-minimap-disabled={drawsScene ? "false" : "true"}
      data-mask-sprite-id={minimapMaskSprite?.spriteId ?? ""}
      data-mask-sprite-alias={minimapMaskSprite?.alias ?? ""}
      data-mask-row-count={mask.xStarts?.length ?? ""}
      data-mask-width-count={mask.xWidths?.length ?? ""}
      data-mask-visual-source={minimapMaskSprite?.maskXStarts?.length ? "sprite-mask-rows" : ""}
      onPointerDown={(event) => {
        if (!localActor || !localActorMinimapTile || !onTileCommand || event.button !== 0 || !kronosMinimapAllowsClick(snapshot.minimapState)) {
          return;
        }

        const click = minimapSourceClick(event, widget.rect);
        if (!click) {
          return;
        }

        const target = kronosMinimapClickToTile({
          ...mask,
          localTile: localActor.tile,
          clickX: click.x,
          clickY: click.y,
          camAngleY: cameraYaw
        });
        if (!target) {
          return;
        }

        event.currentTarget.dataset.lastClickX = String(Math.trunc(click.x));
        event.currentTarget.dataset.lastClickY = String(Math.trunc(click.y));
        event.currentTarget.dataset.lastClickTileX = String(target.tile.x);
        event.currentTarget.dataset.lastClickTileZ = String(target.tile.z);
        event.preventDefault();
        event.stopPropagation();
        onTileCommand({
          tile: target.tile,
          position: runtimeViewportPointerPosition(event),
          click
        });
      }}
      style={minimapOverlayStyle(widget.rect, minimapMaskSprite)}
    >
      {!drawsScene ? (
        <span
          className="kronosMinimapDisabledFill"
          data-source-shape="Rasterizer2D.method6430"
          style={minimapDisabledFillStyle(mask)}
        />
      ) : null}
      {minimapSceneSprite && sceneTransform ? (
        <KronosMinimapSceneSpriteView
          mapSceneAtlas={mapSceneAtlas}
          sprite={minimapSceneSprite}
          transform={sceneTransform}
        />
      ) : null}
      {mapIcons.map((icon) => (
        <KronosMinimapMapIconView atlas={mapIconAtlas} icon={icon} key={icon.id} />
      ))}
      {dots.map((dot) => (
        <KronosMinimapDotView atlas={mapDotAtlas} dot={dot} key={dot.actorId} />
      ))}
      {destinationMarker ? (
        <KronosMinimapMarkerView atlas={mapMarkerAtlas} marker={destinationMarker} />
      ) : null}
      {hintMarkers.map((marker) => (
        <KronosMinimapMarkerView atlas={mapMarkerAtlas} key={marker.id} marker={marker} />
      ))}
      {drawsScene ? (
        <span
          className="kronosMinimapLocalPlayer"
          data-actor-id="local-player"
          data-source-color={KRONOS_MINIMAP_LOCAL_PLAYER_DOT_COLOR}
          data-source-height={KRONOS_MINIMAP_LOCAL_PLAYER_DOT_SIZE}
          data-source-shape="Rasterizer2D.fillRectangle"
          data-source-width={KRONOS_MINIMAP_LOCAL_PLAYER_DOT_SIZE}
          style={minimapLocalPlayerDotStyle(localPlayer)}
        />
      ) : null}
    </div>
  );
}

function KronosMinimapSceneSpriteView({
  mapSceneAtlas,
  sprite,
  transform
}: {
  readonly mapSceneAtlas: KronosHudAtlas | undefined;
  readonly sprite: KronosMinimapSceneSprite;
  readonly transform: KronosMinimapSceneTransform;
}): JSX.Element {
  return (
    <div
      className="kronosMinimapSceneSprite"
      data-scene-cell-count={sprite.cells.length}
      data-scene-overlay-pixel-count={sprite.overlayPixelCount}
      data-scene-segment-count={sprite.segments.length}
      data-scene-mapscene-object-count={sprite.mapSceneObjectCount}
      data-scene-mapicon-object-count={sprite.mapIconObjectCount}
      data-scene-color-mode={sprite.colorMode}
      data-origin-world-x={sprite.originWorldTile.x}
      data-origin-world-y={sprite.originWorldTile.y}
      data-scene-center-x={transform.centerX}
      data-scene-center-y={transform.centerY}
      data-scene-angle-degrees={transform.angleDegrees}
      style={minimapSceneSpriteStyle(sprite, transform)}
    >
      {sprite.cells.map((cell) => (
        <span
          className="kronosMinimapSceneCell"
          data-world-x={cell.worldX}
          data-world-y={cell.worldY}
          data-underlay-id={cell.underlayId}
          data-overlay-id={cell.overlayId}
          key={cell.key}
          style={minimapSceneCellStyle(cell)}
        />
      ))}
      {sprite.overlayPixels.map((pixel) => (
        <span
          className="kronosMinimapSceneOverlayPixel"
          data-world-x={pixel.worldX}
          data-world-y={pixel.worldY}
          data-underlay-id={pixel.underlayId}
          data-overlay-id={pixel.overlayId}
          data-tile-shape={pixel.shape}
          data-tile-rotation={pixel.rotation}
          data-mask-index={pixel.maskIndex}
          key={pixel.key}
          style={minimapSceneOverlayPixelStyle(pixel)}
        />
      ))}
      {sprite.segments.map((segment) => (
        <span
          className="kronosMinimapSceneSegment"
          data-object-id={segment.objectId}
          data-world-x={segment.worldX}
          data-world-y={segment.worldY}
          data-object-type={segment.type}
          data-orientation={segment.orientation}
          key={segment.key}
          style={minimapSceneSegmentStyle(segment)}
        />
      ))}
      {sprite.mapSceneObjects.map((object) => {
        const mapSceneSprite = mapSceneAtlas ? findMinimapMapSceneSprite(mapSceneAtlas, object.mapSceneId) : undefined;
        return mapSceneAtlas && mapSceneSprite ? (
          <span
            className="kronosMinimapSceneMapScene"
            data-object-id={object.objectId}
            data-world-x={object.worldX}
            data-world-y={object.worldY}
            data-object-type={object.type}
            data-orientation={object.orientation}
            data-map-scene-id={object.mapSceneId}
            data-sprite-alias={mapSceneSprite.alias ?? ""}
            data-sprite-frame={mapSceneSprite.frame}
            key={object.key}
            style={minimapSceneMapSceneStyle(mapSceneAtlas, mapSceneSprite, object)}
          />
        ) : null;
      })}
    </div>
  );
}

function spriteMaskFromSprite(
  sprite: KronosHudSprite | undefined,
  width: number,
  height: number
): KronosMinimapSpriteMask {
  return {
    width,
    height,
    xStarts: sprite?.maskXStarts ?? [],
    xWidths: sprite?.maskXWidths ?? []
  };
}

function minimapSourceClick(
  event: ReactPointerEvent<HTMLElement>,
  rect: KronosResolvedWidget["rect"]
): { readonly x: number; readonly y: number } | null {
  const targetRect = event.currentTarget.getBoundingClientRect();
  if (targetRect.width <= 0 || targetRect.height <= 0) {
    return null;
  }

  return {
    x: ((event.clientX - targetRect.left) / targetRect.width) * rect.width,
    y: ((event.clientY - targetRect.top) / targetRect.height) * rect.height
  };
}

function runtimeViewportPointerPosition(
  event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>
): { readonly x: number; readonly y: number } {
  const viewport = event.currentTarget.closest(".runtimeViewport") as HTMLElement | null;
  const viewportRect = viewport?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
  const sourceWidth = Math.max(1, viewport?.clientWidth ?? viewportRect.width);
  const sourceHeight = Math.max(1, viewport?.clientHeight ?? viewportRect.height);
  return {
    x: ((event.clientX - viewportRect.left) / Math.max(1, viewportRect.width)) * sourceWidth,
    y: ((event.clientY - viewportRect.top) / Math.max(1, viewportRect.height)) * sourceHeight
  };
}

function KronosMinimapDotView({
  atlas,
  dot
}: {
  readonly atlas: KronosHudAtlas | undefined;
  readonly dot: KronosMinimapDot;
}): JSX.Element | null {
  const sprite = atlas ? findMinimapDotSprite(atlas, dot.kind, dot.sourceSpriteIndex) : undefined;
  if (!sprite || !atlas) {
    return null;
  }

  return (
    <span
      className={`kronosMinimapDot kronosMinimapDot-${dot.kind}`}
      data-actor-id={dot.actorId}
      data-dot-kind={dot.kind}
      data-source-sprite-index={dot.sourceSpriteIndex}
      data-sprite-alias={sprite.alias ?? ""}
      data-sprite-frame={sprite.frame ?? ""}
      data-distance-squared={dot.distanceSquared}
      data-clipped={dot.clipped}
      data-rotated-x={dot.rotatedX}
      data-rotated-y={dot.rotatedY}
      style={{ ...spriteStyle(atlas, sprite), ...minimapDotStyle(dot) }}
    />
  );
}

function KronosMinimapMapIconView({
  atlas,
  icon
}: {
  readonly atlas: KronosHudAtlas | undefined;
  readonly icon: KronosMinimapMapIcon;
}): JSX.Element | null {
  const sprite = atlas ? findMinimapMapIconSprite(atlas, icon.mapIconId) : undefined;
  if (!sprite || !atlas) {
    return null;
  }

  return (
    <span
      className="kronosMinimapMapIcon"
      data-map-icon-id={icon.mapIconId}
      data-object-id={icon.objectId}
      data-source-area-id={sprite.areaId ?? ""}
      data-sprite-alias={sprite.alias ?? ""}
      data-sprite-id={sprite.spriteId}
      data-distance-squared={icon.distanceSquared}
      data-clipped={icon.clipped}
      data-rotated-x={icon.rotatedX}
      data-rotated-y={icon.rotatedY}
      data-world-offset-x={icon.tile.x}
      data-world-offset-z={icon.tile.z}
      style={minimapMapIconSpriteStyle(atlas, sprite, icon)}
    />
  );
}

function KronosMinimapMarkerView({
  atlas,
  marker
}: {
  readonly atlas: KronosHudAtlas | undefined;
  readonly marker: KronosMinimapMarker;
}): JSX.Element | null {
  const sprite = atlas ? findMinimapMarkerSprite(atlas, marker.kind, marker.sourceSpriteIndex) : undefined;
  if (!sprite || !atlas) {
    return null;
  }

  return (
    <span
      className={`kronosMinimapMarker kronosMinimapMarker-${marker.kind}`}
      data-marker-id={marker.id}
      data-marker-kind={marker.kind}
      data-source-sprite-index={marker.sourceSpriteIndex}
      data-sprite-alias={sprite.alias ?? ""}
      data-sprite-frame={sprite.frame}
      data-destination-x={marker.tile.x}
      data-destination-z={marker.tile.z}
      data-rotation-degrees={marker.rotationDegrees ?? ""}
      data-distance-squared={marker.distanceSquared}
      data-clipped={marker.clipped}
      data-rotated-x={marker.rotatedX}
      data-rotated-y={marker.rotatedY}
      style={minimapMarkerSpriteStyle(atlas, sprite, marker)}
    />
  );
}

function inventoryGridStyle(grid: KronosInventoryGridLayout | null): CSSProperties | undefined {
  if (!grid) {
    return undefined;
  }

  return {
    left: grid.rect.x,
    top: grid.rect.y,
    gridTemplateColumns: `repeat(${grid.columns}, ${grid.slot.width}px)`,
    gridAutoRows: grid.slot.height,
    columnGap: grid.step.width - grid.slot.width,
    rowGap: grid.step.height - grid.slot.height
  };
}

function chatboxBackgroundStyle(layout: KronosMountedInterfaceLayout | null): CSSProperties | undefined {
  if (!layout) {
    return undefined;
  }

  return {
    left: layout.rect.x,
    top: layout.rect.y
  };
}

function minimapOverlayStyle(
  rect: KronosResolvedWidget["rect"],
  maskSprite: KronosHudSprite | undefined
): CSSProperties {
  const style: CSSProperties = {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height
  };
  if (!maskSprite) {
    return style;
  }

  const maskImage = spriteMaskRowsDataUrl(maskSprite);
  if (!maskImage) {
    return style;
  }

  return {
    ...style,
    maskImage,
    WebkitMaskImage: maskImage,
    maskPosition: "0 0",
    WebkitMaskPosition: "0 0",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskSize: `${maskSprite.width}px ${maskSprite.height}px`,
    WebkitMaskSize: `${maskSprite.width}px ${maskSprite.height}px`
  };
}

function compassOverlayStyle(
  rect: KronosResolvedWidget["rect"],
  maskSprite: KronosHudSprite | undefined
): CSSProperties {
  const style: CSSProperties = {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height
  };
  if (!maskSprite) {
    return style;
  }

  const maskImage = spriteMaskRowsDataUrl(maskSprite);
  if (!maskImage) {
    return style;
  }

  return {
    ...style,
    maskImage,
    WebkitMaskImage: maskImage,
    maskPosition: "0 0",
    WebkitMaskPosition: "0 0",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskSize: `${maskSprite.width}px ${maskSprite.height}px`,
    WebkitMaskSize: `${maskSprite.width}px ${maskSprite.height}px`
  };
}

function compassSpriteRotatorStyle(angleDegrees: number): CSSProperties {
  return {
    transform: `rotate(${angleDegrees}deg)`
  };
}

function spriteMaskRowsDataUrl(sprite: KronosHudSprite): string | null {
  if (!sprite.maskXStarts?.length || !sprite.maskXWidths?.length) {
    return null;
  }

  const rows = sprite.maskXStarts
    .map((xStart, y) => {
      const width = sprite.maskXWidths?.[y] ?? 0;
      if (width <= 0) {
        return "";
      }
      return `<rect x="${Math.trunc(xStart)}" y="${y}" width="${Math.trunc(width)}" height="1"/>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sprite.width}" height="${sprite.height}" viewBox="0 0 ${sprite.width} ${sprite.height}" shape-rendering="crispEdges"><g fill="white">${rows}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function minimapDotStyle(dot: { readonly left: number; readonly top: number; readonly width: number; readonly height: number }): CSSProperties {
  return {
    left: dot.left,
    top: dot.top,
    width: dot.width,
    height: dot.height
  };
}

function minimapDisabledFillStyle(mask: KronosMinimapSpriteMask): CSSProperties {
  return {
    left: 0,
    top: 0,
    width: mask.width,
    height: mask.height,
    backgroundColor: "#000000"
  };
}

function kronosMinimapDrawsScene(minimapState: number | null): boolean {
  return minimapState !== 2 && minimapState !== 5;
}

function kronosMinimapAllowsClick(minimapState: number | null): boolean {
  return minimapState === null || minimapState === 0 || minimapState === 3;
}

function minimapLocalPlayerDotStyle(dot: { readonly left: number; readonly top: number; readonly width: number; readonly height: number }): CSSProperties {
  return {
    ...minimapDotStyle(dot),
    backgroundColor: cssRgbColor(KRONOS_MINIMAP_LOCAL_PLAYER_DOT_COLOR, 0xffffff)
  };
}

function minimapSceneSpriteStyle(
  sprite: KronosMinimapSceneSprite,
  transform: KronosMinimapSceneTransform
): CSSProperties {
  return {
    left: transform.left,
    top: transform.top,
    width: sprite.width,
    height: sprite.height,
    transform: `rotate(${transform.angleDegrees}deg)`,
    transformOrigin: `${transform.centerX}px ${transform.centerY}px`
  };
}

function minimapSceneCellStyle(cell: KronosMinimapSceneCell): CSSProperties {
  return {
    left: cell.x,
    top: cell.y,
    width: cell.width,
    height: cell.height,
    backgroundColor: cell.color
  };
}

function minimapSceneOverlayPixelStyle(pixel: KronosMinimapSceneOverlayPixel): CSSProperties {
  return {
    left: pixel.x,
    top: pixel.y,
    width: 1,
    height: 1,
    backgroundColor: pixel.color
  };
}

function minimapSceneSegmentStyle(segment: KronosMinimapSceneSegment): CSSProperties {
  return {
    left: segment.x,
    top: segment.y,
    width: segment.width,
    height: segment.height,
    backgroundColor: segment.color
  };
}

function minimapSceneMapSceneStyle(
  atlas: KronosHudAtlas,
  sprite: KronosHudSprite,
  object: KronosMinimapSceneMapSceneObject
): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: object.x + Math.trunc((object.sizeX * 4 - sprite.width) / 2),
    top: object.y + Math.trunc((object.sizeY * 4 - sprite.height) / 2)
  };
}

function minimapMapIconSpriteStyle(
  atlas: KronosHudAtlas,
  sprite: KronosHudSprite,
  icon: KronosMinimapMapIcon
): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    ...minimapDotStyle(icon)
  };
}

function minimapMarkerSpriteStyle(
  atlas: KronosHudAtlas,
  sprite: KronosHudSprite,
  marker: KronosMinimapMarker
): CSSProperties {
  const style = {
    ...spriteStyle(atlas, sprite),
    ...minimapDotStyle(marker)
  };
  if (marker.rotationDegrees === undefined) {
    return style;
  }

  return {
    ...style,
    transform: `${style.transform ?? ""} rotate(${marker.rotationDegrees}deg)`,
    transformOrigin: "center"
  };
}

function KronosWidgetSpriteLayer({
  atlas,
  layout,
  activeSideTabId
}: {
  readonly atlas: KronosHudAtlas;
  readonly layout: KronosFixedClientLayout | null;
  readonly activeSideTabId: KronosFixedSideTabId;
}): JSX.Element | null {
  if (!layout) {
    return null;
  }
  const sideTabsByWidgetId = new Map(layout.sidePanel?.tabs.map((tab) => [tab.widgetId, tab]) ?? []);

  return (
    <div className="kronosWidgetSpriteLayer" aria-hidden="true">
      {layout.widgets.map((widget, index) => {
        const sideTab = sideTabsByWidgetId.get(widget.widget.id);
        if (sideTab && sideTab.id !== activeSideTabId) {
          return null;
        }
        return <KronosWidgetSprite key={`${widget.widget.id}:${index}`} atlas={atlas} widget={widget} order={index} />;
      })}
    </div>
  );
}

function KronosSideTabClickLayer({
  activeSideTabId,
  layout,
  onContextMenu,
  onDefaultAction,
  onHover
}: {
  readonly activeSideTabId: KronosFixedSideTabId;
  readonly layout: KronosFixedSidePanelLayout | null;
  readonly onContextMenu: ((command: KronosSideTabCommand) => void) | undefined;
  readonly onDefaultAction: ((command: KronosSideTabCommand) => void) | undefined;
  readonly onHover: ((command: KronosSideTabCommand | null) => void) | undefined;
}): JSX.Element | null {
  if (!layout) {
    return null;
  }

  return (
    <div className="kronosSideTabClickLayer" data-group-id={layout.groupId}>
      {layout.tabs.map((tab) => {
        const sourceActions = sourceWidgetActionEntries(tab.actions);
        const defaultAction = sourceActions[0];
        const command = (
          event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>,
          action: KronosSourceWidgetAction
        ): KronosSideTabCommand => ({
          tab,
          actionText: action.actionText,
          actionIndex: action.actionIndex,
          menuOpcode: action.menuOpcode,
          sourceActions,
          position: runtimeViewportPointerPosition(event)
        });
        return (
          <button
            aria-label={kronosSideTabLabel(tab)}
            className="kronosSideTabButton"
            data-active={tab.id === activeSideTabId ? "true" : "false"}
            data-child-id={tab.childId}
            data-container-child-id={tab.container.childId}
            data-container-hidden={tab.container.hidden ? "true" : "false"}
            data-container-widget-id={tab.container.widgetId}
            data-default-action-index={defaultAction?.actionIndex ?? ""}
            data-default-action-text={defaultAction?.actionText ?? ""}
            data-default-menu-opcode={defaultAction?.menuOpcode ?? ""}
            data-icon-child-id={tab.iconChildId}
            data-icon-sprite-id={tab.iconSpriteId}
            data-icon-widget-id={tab.iconWidgetId}
            data-row={tab.row}
            data-slot-index={tab.slotIndex}
            data-source-action-0={tab.actions[0] ?? ""}
            data-source-action-count={sourceActions.length}
            data-source-actions={sourceActions.map((action) => action.actionText).join("||")}
            data-source-menu-inserter="AttackOption.method2104"
            data-sprite-id={tab.spriteId}
            data-tab-id={tab.id}
            data-widget-id={tab.widgetId}
            key={tab.widgetId}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onPointerMove={(event) => {
              if (defaultAction) {
                onHover?.(command(event, defaultAction));
              }
            }}
            onPointerLeave={() => onHover?.(null)}
            onPointerDown={(event) => {
              if (!defaultAction) {
                return;
              }
              if (event.button === 2) {
                event.preventDefault();
                event.stopPropagation();
                onContextMenu?.(command(event, defaultAction));
                return;
              }
              if (event.button !== 0) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              onDefaultAction?.(command(event, defaultAction));
            }}
            style={rectStyle(tab.rect)}
            type="button"
          >
            <span className="kronosWidgetAccessibleText">{kronosSideTabLabel(tab)}</span>
          </button>
        );
      })}
    </div>
  );
}

function KronosOptionsCameraZoomLayer({
  atlas,
  cameraZoom,
  layout,
  onChange,
  onReset,
  viewportHeight
}: {
  readonly atlas: KronosHudAtlas;
  readonly cameraZoom: KronosCameraZoom;
  readonly layout: KronosMountedInterfaceLayout | null;
  readonly onChange: ((zoom: KronosCameraZoom) => void) | undefined;
  readonly onReset: (() => void) | undefined;
  readonly viewportHeight: number;
}): JSX.Element | null {
  if (!layout) {
    return null;
  }

  const sliderTrack = layout.widgets.find((widget) => widget.widget.childId === kronosOptionsZoomSliderTrackChildId);
  const sliderKnob = layout.widgets.find((widget) => widget.widget.childId === kronosOptionsZoomSliderKnobChildId);
  const resetWidget = layout.widgets.find((widget) => widget.widget.childId === kronosOptionsZoomIconActionChildId);
  if (!sliderTrack || !sliderKnob) {
    return null;
  }

  const sliderRange = Math.max(1, sliderTrack.rect.width - sliderKnob.rect.width);
  const knobOffset = kronosCameraZoomSliderOffset(
    cameraZoom,
    viewportHeight,
    sliderRange
  );
  const knobSprite = findSpriteById(atlas, sliderKnob.widget.spriteId);

  const applyPointerZoom = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (!onChange) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    const sourceX = ((event.clientX - rect.left) / rect.width) * sliderTrack.rect.width;
    const sourceOffset = sourceX - sliderKnob.rect.width / 2;
    onChange(kronosCameraZoomFromSliderOffset(sourceOffset, sliderRange));
  };

  return (
    <div
      className="kronosOptionsCameraZoomLayer"
      data-source-client-script="OptionsPanelZoomMouseListener.rs2asm, OptionsPanelZoomUpdater.rs2asm"
      data-source-handler="camera_do_zoom updates Client.zoomHeight/zoomWidth and cam_setfollowheight"
      data-zoom-height={cameraZoom.zoomHeight}
      data-zoom-width={cameraZoom.zoomWidth}
    >
      {resetWidget ? (
        <button
          aria-label="Restore default camera zoom"
          className="kronosOptionsCameraZoomReset"
          data-action-child-id={resetWidget.widget.childId}
          data-action-text="Restore Default Zoom"
          data-source-client-script="zoom_mouse_toggle($component0, $component1, 2, $component3)"
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onReset?.();
          }}
          style={rectStyle(resetWidget.rect)}
          type="button"
        />
      ) : null}
      <button
        aria-label="Camera zoom"
        className="kronosOptionsCameraZoomTrack"
        data-action-child-id={sliderTrack.widget.childId}
        data-source-client-script="script1048 / zoom_position_slider"
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          applyPointerZoom(event);
        }}
        onPointerMove={(event) => {
          if ((event.buttons & 1) === 0) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          applyPointerZoom(event);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        style={rectStyle(sliderTrack.rect)}
        type="button"
      />
      {knobSprite ? (
        <span
          aria-hidden="true"
          className="kronosOptionsCameraZoomKnob"
          data-source-child-id={sliderKnob.widget.childId}
          data-source-sprite-id={sliderKnob.widget.spriteId}
          style={{
            ...spriteStyle(atlas, knobSprite),
            left: sliderTrack.rect.x + knobOffset,
            top: sliderTrack.rect.y,
            width: sliderKnob.rect.width,
            height: sliderKnob.rect.height
          }}
        />
      ) : null}
    </div>
  );
}

const kronosOptionsZoomIconActionChildId = 5;
const kronosOptionsZoomSliderTrackChildId = 14;
const kronosOptionsZoomSliderKnobChildId = 15;

function KronosOptionsKeybindingControlLayer({
  atlas,
  layout,
  onOpen
}: {
  readonly atlas: KronosHudAtlas;
  readonly layout: KronosMountedInterfaceLayout | null;
  readonly onOpen: (() => void) | undefined;
}): JSX.Element | null {
  if (!layout || !onOpen) {
    return null;
  }
  const keybindingWidget = layout.widgets.find((widget) => widget.widget.childId === kronosOptionsKeybindingActionChildId);
  if (!keybindingWidget) {
    return null;
  }
  const placementWidget =
    layout.widgets.find((widget) => widget.widget.childId === kronosOptionsKeybindingPlacementChildId) ?? keybindingWidget;
  const keybindingFrameSprite = findSpriteById(
    atlas,
    placementWidget.widget.spriteId > 0 ? placementWidget.widget.spriteId : keybindingWidget.widget.spriteId
  );

  return (
    <div className="kronosOptionsKeybindingControlLayer">
      {keybindingFrameSprite ? (
        <span
          aria-hidden="true"
          className="kronosOptionsKeybindingSourceFrame"
          data-action-child-id={keybindingWidget.widget.childId}
          data-source-handler="TabOptions h.actions[83] = Keybinding::open"
          data-source-interface="Interface.OPTIONS child 83 opens Interface.KEYBINDING 121"
          data-source-placement-child-id={placementWidget.widget.childId}
          data-sprite-id={keybindingFrameSprite.spriteId}
          data-widget-id={placementWidget.widget.id}
          style={widgetSpriteStyle(atlas, keybindingFrameSprite, placementWidget, 0)}
        />
      ) : null}
      <span
        aria-hidden="true"
        className="kronosOptionsKeybindingGeneratedIcon"
        data-action-child-id={keybindingWidget.widget.childId}
        data-generated-with="imagegen"
        data-icon-path={kronosOptionsKeybindingGeneratedIconPath}
        data-source-interface="Interface.OPTIONS child 83 opens Interface.KEYBINDING 121"
        data-source-placement-child-id={placementWidget.widget.childId}
        style={kronosOptionsKeybindingGeneratedIconStyle(placementWidget.rect)}
      />
      <button
        aria-label="Keybinding"
        className="kronosOptionsKeybindingButton"
        data-action-child-id={keybindingWidget.widget.childId}
        data-action-text="Keybinding"
        data-interface-id={layout.groupId}
        data-icon-path={kronosOptionsKeybindingGeneratedIconPath}
        data-source-client-script="options_keybind_op"
        data-source-handler="TabOptions h.actions[83] = Keybinding::open"
        data-source-interface="Interface.OPTIONS child 83 opens Interface.KEYBINDING 121"
        data-source-placement-child-id={placementWidget.widget.childId}
        data-widget-id={keybindingWidget.widget.id}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          onOpen();
        }}
        style={{ ...rectStyle(placementWidget.rect), zIndex: 3 }}
        type="button"
      />
    </div>
  );
}

const kronosOptionsKeybindingActionChildId = 83;
const kronosOptionsKeybindingPlacementChildId = 100;
const kronosOptionsKeybindingGeneratedIconPath = "render/sprites/kronos_fkey_icon.png";
const kronosOptionsKeybindingSuppressedChildIds = new Set([83, 84, 87, 88, 100, 101]);

function kronosOptionsKeybindingGeneratedIconStyle(rect: KronosRect): CSSProperties {
  return {
    left: rect.x + Math.trunc((rect.width - 32) / 2),
    top: rect.y + Math.trunc((rect.height - 32) / 2),
    width: 32,
    height: 32,
    backgroundImage: `url(${kronosOptionsKeybindingGeneratedIconPath})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "32px 32px",
    zIndex: 2
  };
}

function KronosGameKeybindingInterface({
  atlas,
  clientFonts,
  keybinds,
  onChange,
  onClose,
  onRestoreDefaults,
  onSelectedTabChange,
  open,
  selectedTabId,
  sidePanel,
  spriteAtlases,
  viewport
}: {
  readonly atlas: KronosHudAtlas;
  readonly clientFonts: KronosClientFontStore;
  readonly keybinds: KronosGameKeybindSnapshot | undefined;
  readonly onChange: ((tabId: KronosFixedSideTabId, keySlot: KronosGameKeybindKeySlot) => void) | undefined;
  readonly onClose: (() => void) | undefined;
  readonly onEscapeCloseChange: ((escapeCloses: boolean) => void) | undefined;
  readonly onRestoreDefaults: ((mode: "osrs" | "pre-eoc") => void) | undefined;
  readonly onSelectedTabChange: ((tabId: KronosFixedSideTabId) => void) | undefined;
  readonly open: boolean;
  readonly selectedTabId: KronosFixedSideTabId | undefined;
  readonly sidePanel: KronosFixedSidePanelLayout | null;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
  readonly viewport: KronosRect;
}): JSX.Element | null {
  const [openDropdownTabId, setOpenDropdownTabId] = useState<KronosFixedSideTabId | null>(null);
  useEffect(() => {
    if (!open) {
      setOpenDropdownTabId(null);
    }
  }, [open]);
  if (!open || !keybinds) {
    return null;
  }

  const panelRect = kronosGameKeybindingPanelRect(viewport);
  const selectedSpec =
    KRONOS_GAME_KEYBIND_TAB_SPECS.find((spec) => spec.tabId === selectedTabId) ?? KRONOS_GAME_KEYBIND_TAB_SPECS[0];
  const dropdownSpec =
    KRONOS_GAME_KEYBIND_TAB_SPECS.find((spec) => spec.tabId === openDropdownTabId) ?? null;

  return (
    <div
      className="kronosGameKeybindingInterface"
      data-interface-id={KRONOS_GAME_KEYBIND_INTERFACE_ID}
      data-source={KRONOS_GAME_KEYBIND_SOURCE}
      data-source-open-handler="TabOptions.Keybinding.open sends InterfaceType.MAIN, Interface.KEYBINDING"
      data-source-slot-action="Interface.KEYBINDING child 111 SlotAction clears duplicate key slots before setting selected Config.KEYBINDS entry"
      data-source-layout="Interface.KEYBINDING 121 side-stone keybind grid"
      data-escape-closes={String(keybinds.escapeCloses)}
      style={rectStyle(panelRect)}
    >
      <button
        aria-label="Close"
        className="kronosGameKeybindingClose"
        data-action-text="Close"
        data-source-action="if_close"
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          onClose?.();
        }}
        type="button"
      >
        <KronosGameKeybindingGlyphText
          clientFonts={clientFonts}
          color="#ff981f"
          fontId={495}
          height={15}
          spriteAtlases={spriteAtlases}
          text="X"
          width={12}
          xTextAlignment={1}
        />
      </button>
      <div className="kronosGameKeybindingTitle">
        <KronosGameKeybindingGlyphText
          clientFonts={clientFonts}
          color="#ff981f"
          fontId={495}
          height={16}
          spriteAtlases={spriteAtlases}
          text="Keybinding"
          width={110}
          xTextAlignment={1}
        />
      </div>
      <div className="kronosGameKeybindingRows">
        {kronosGameKeybindingGridSpecs().map((spec) => {
          const keySlot = keybinds.keySlotsByTabId[spec.tabId] ?? spec.defaultKeySlot;
          const selected = spec.tabId === selectedSpec.tabId;
          return (
            <div
              className="kronosGameKeybindingRow"
              data-key-text-child-id={spec.keyTextChildId}
              data-selector-child-id={spec.selectorChildId}
              data-source-script984-text-child={spec.keyTextChildId}
              data-source-varbit={spec.varbit}
              data-source-server-varbit={spec.serverVarbit ?? spec.varbit}
              data-tab-id={spec.tabId}
              key={spec.tabId}
              style={kronosGameKeybindingRowStyle(spec)}
            >
              <button
                aria-label={spec.label}
                className="kronosGameKeybindingIconButton"
                data-selected={selected ? "true" : "false"}
                data-source-action-child-id={spec.selectorChildId}
                data-source-action-handler="player.selectedKeybindConfig = Config.KEYBINDS[index]"
                onPointerDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectedTabChange?.(spec.tabId);
                }}
                type="button"
              >
                <KronosGameKeybindingTabIcon atlas={atlas} sidePanel={sidePanel} spec={spec} />
                <span className="kronosWidgetAccessibleText">{spec.label}</span>
              </button>
              <button
                aria-label={`${spec.label} ${kronosGameKeybindLabelForSlot(keySlot)}`}
                className="kronosGameKeybindingKeyButton"
                data-key-slot={keySlot}
                data-source-client-script="keybind_open_menu"
                data-source-enum-1159={kronosGameKeybindLabelForSlot(keySlot)}
                data-source-enum-1160={kronosGameKeybindSourceKeyForSlot(keySlot)}
                onPointerDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectedTabChange?.(spec.tabId);
                  setOpenDropdownTabId((current) => (current === spec.tabId ? null : spec.tabId));
                }}
                type="button"
              >
                <span className="kronosGameKeybindingKeyText">
                  <KronosGameKeybindingGlyphText
                    clientFonts={clientFonts}
                    color="#ff981f"
                    fontId={494}
                    height={15}
                    spriteAtlases={spriteAtlases}
                    text={kronosGameKeybindingDisplayLabelForSlot(keySlot)}
                    width={78}
                  />
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {dropdownSpec ? (
        <div
          className="kronosGameKeybindingDropdown"
          data-source-client-script="keybind_build_dropdown"
          data-source-text-font="p12_full"
          style={kronosGameKeybindingDropdownStyle(dropdownSpec)}
        >
          {KRONOS_GAME_KEYBIND_KEY_OPTIONS.map((option) => (
            <button
              aria-label={option.label}
              className="kronosGameKeybindingDropdownOption"
              data-key-slot={option.slot}
              data-source-enum-1159={option.sourceEnum1159}
              data-source-enum-1160={option.sourceEnum1160Key}
              key={option.slot}
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                onChange?.(dropdownSpec.tabId, option.slot);
                setOpenDropdownTabId(null);
              }}
              style={kronosGameKeybindingDropdownOptionStyle(option.slot)}
              type="button"
            >
              <KronosGameKeybindingGlyphText
                clientFonts={clientFonts}
                color="#ff981f"
                fontId={495}
                height={15}
                spriteAtlases={spriteAtlases}
                text={kronosGameKeybindingDisplayLabelForSlot(option.slot)}
                width={40}
                xTextAlignment={1}
              />
            </button>
          ))}
        </div>
      ) : null}
      <div className="kronosGameKeybindingRestore">
        <button
          className="kronosGameKeybindingRestoreButton"
          data-source-action-child-id="104"
          data-source-handler="reset Config.KEYBINDS then Config.ESCAPE_CLOSES"
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            setOpenDropdownTabId(null);
            onRestoreDefaults?.("osrs");
          }}
          type="button"
        >
          <span className="kronosGameKeybindingRestoreText">
            <KronosGameKeybindingGlyphText
              clientFonts={clientFonts}
              color="#ff981f"
              fontId={494}
              height={15}
              spriteAtlases={spriteAtlases}
              text="Set OSRS Default"
              width={126}
              xTextAlignment={1}
            />
          </span>
        </button>
      </div>
    </div>
  );
}

const kronosGameKeybindingColumnTabIds: readonly (readonly KronosFixedSideTabId[])[] = [
  ["combat", "stats", "quests", "inventory", "equipment"],
  ["prayer", "magic", "friends", "ignores", "logout"],
  ["options", "emotes", "clan-chat", "music"]
];
const kronosGameKeybindingColumnLefts = [28, 187, 346] as const;
const kronosGameKeybindingRowsTop = 49;
const kronosGameKeybindingRowStep = 43;
const kronosGameKeybindingRowSize = { width: 150, height: 36 } as const;

function KronosGameKeybindingTabIcon({
  atlas,
  sidePanel,
  spec
}: {
  readonly atlas: KronosHudAtlas;
  readonly sidePanel: KronosFixedSidePanelLayout | null;
  readonly spec: KronosGameKeybindTabSpec;
}): JSX.Element | null {
  const tab = sidePanel?.tabs.find((candidate) => candidate.id === spec.tabId);
  if (!tab) {
    return null;
  }
  const sprite = findSpriteById(atlas, tab.iconSpriteId);
  if (!sprite) {
    return null;
  }
  return (
    <span
      aria-hidden="true"
      className="kronosGameKeybindingIconSprite"
      data-source-icon-child-id={tab.iconChildId}
      data-source-icon-widget-id={tab.iconWidgetId}
      data-sprite-id={tab.iconSpriteId}
      style={{
        ...spriteStyle(atlas, sprite),
        left: Math.trunc((36 - sprite.maxWidth) / 2),
        top: Math.trunc((36 - sprite.maxHeight) / 2)
      }}
    />
  );
}

function kronosGameKeybindingGridSpecs(): readonly KronosGameKeybindTabSpec[] {
  return kronosGameKeybindingColumnTabIds
    .flat()
    .flatMap((tabId) => KRONOS_GAME_KEYBIND_TAB_SPECS.find((spec) => spec.tabId === tabId) ?? []);
}

function kronosGameKeybindingCellForSpec(spec: KronosGameKeybindTabSpec): {
  readonly column: number;
  readonly row: number;
} {
  for (let column = 0; column < kronosGameKeybindingColumnTabIds.length; column += 1) {
    const row = kronosGameKeybindingColumnTabIds[column].indexOf(spec.tabId);
    if (row !== -1) {
      return { column, row };
    }
  }
  const sourceIndex = KRONOS_GAME_KEYBIND_TAB_SPECS.findIndex((candidate) => candidate.tabId === spec.tabId);
  return {
    column: Math.trunc(Math.max(0, sourceIndex) / 5),
    row: Math.max(0, sourceIndex) % 5
  };
}

function kronosGameKeybindingRowStyle(spec: KronosGameKeybindTabSpec): CSSProperties {
  const cell = kronosGameKeybindingCellForSpec(spec);
  return {
    left: kronosGameKeybindingColumnLefts[cell.column] ?? kronosGameKeybindingColumnLefts[0],
    top: kronosGameKeybindingRowsTop + cell.row * kronosGameKeybindingRowStep,
    width: kronosGameKeybindingRowSize.width,
    height: kronosGameKeybindingRowSize.height
  };
}

function kronosGameKeybindingDisplayLabelForSlot(slot: KronosGameKeybindKeySlot): string {
  const sourceLabel = kronosGameKeybindLabelForSlot(slot);
  return sourceLabel === "None" || sourceLabel === "Esc" ? sourceLabel.toUpperCase() : sourceLabel;
}

function KronosGameKeybindingGlyphText({
  clientFonts,
  color,
  fontId,
  height,
  spriteAtlases,
  text,
  width,
  xTextAlignment = 0
}: {
  readonly clientFonts: KronosClientFontStore;
  readonly color: string;
  readonly fontId: number;
  readonly height: number;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
  readonly text: string;
  readonly width: number;
  readonly xTextAlignment?: number;
}): JSX.Element {
  const font = kronosClientFontDefinitionById(clientFonts, fontId);
  const atlas = font ? spriteAtlases.get(font.sheetId as RuntimeSpriteSheetId) : undefined;
  return (
    <span className="kronosGameKeybindingGlyphLabel" style={{ width, height }}>
      {font && atlas ? (
        <KronosSourceGlyphText
          atlas={atlas}
          color={color}
          font={font}
          height={height}
          lineHeight={undefined}
          shadowColor={null}
          text={text}
          width={width}
          xTextAlignment={xTextAlignment}
          yTextAlignment={0}
        />
      ) : (
        <span className="kronosWidgetAccessibleText" data-source-glyph-missing="true">
          {text}
        </span>
      )}
    </span>
  );
}

function kronosGameKeybindingPanelRect(viewport: KronosRect): KronosRect {
  const width = 500;
  const height = 298;
  return {
    x: viewport.x + Math.trunc((viewport.width - width) / 2),
    y: viewport.y + Math.trunc((viewport.height - height) / 2),
    width,
    height
  };
}

function kronosGameKeybindingDropdownStyle(spec: KronosGameKeybindTabSpec): CSSProperties {
  const row = kronosGameKeybindingRowStyle(spec);
  const top = Number(row.top) + 22;
  const safeTop = top + 110 > 286 ? Math.max(25, Number(row.top) + 6 - 110) : top;
  return {
    left: Number(row.left) + 40,
    top: safeTop,
    width: 100,
    height: 110
  };
}

function kronosGameKeybindingDropdownOptionStyle(slot: KronosGameKeybindKeySlot): CSSProperties {
  return {
    left: 5 + (slot % 2) * 40,
    top: 5 + Math.trunc(slot / 2) * 15,
    width: 40,
    height: 15
  };
}

interface KronosChatboxButtonLayout {
  readonly buttonId: KronosChatboxButtonId;
  readonly label: string;
  readonly widget: KronosResolvedWidget;
  readonly actionText: string;
  readonly actionIndex: number;
  readonly menuOpcode: number;
  readonly actions: readonly string[];
  readonly sourceActions: readonly KronosSourceWidgetAction[];
}

const chatboxButtonDefinitions: readonly {
  readonly buttonId: KronosChatboxButtonId;
  readonly childId: number;
  readonly label: string;
}[] = [
  { buttonId: "all", childId: 4, label: "All" },
  { buttonId: "game", childId: 8, label: "Game" },
  { buttonId: "public", childId: 13, label: "Public" },
  { buttonId: "private", childId: 18, label: "Private" },
  { buttonId: "clan", childId: 23, label: "Clan" },
  { buttonId: "trade", childId: 28, label: "Trade" },
  { buttonId: "report", childId: 33, label: "Report" }
];

function KronosChatboxClickLayer({
  layout,
  onContextMenu,
  onDefaultAction,
  onHover
}: {
  readonly layout: KronosMountedInterfaceLayout | null;
  readonly onContextMenu: ((command: KronosChatboxButtonCommand) => void) | undefined;
  readonly onDefaultAction: ((command: KronosChatboxButtonCommand) => void) | undefined;
  readonly onHover: ((command: KronosChatboxButtonCommand | null) => void) | undefined;
}): JSX.Element | null {
  const buttons = kronosChatboxButtons(layout);
  if (!layout || buttons.length === 0) {
    return null;
  }

  return (
    <div className="kronosChatboxClickLayer" data-group-id={layout.groupId}>
      {buttons.map((button) => (
        <button
          aria-label={`Chatbox ${button.label} button`}
          className="kronosChatboxButton"
          data-button-id={button.buttonId}
          data-chatbox-button-id={button.buttonId}
          data-child-id={button.widget.widget.childId}
          data-click-mask={button.widget.widget.clickMask ?? 0}
          data-default-action-index={button.actionIndex}
          data-default-action-text={button.actionText}
          data-default-menu-opcode={button.menuOpcode}
          data-group-id={button.widget.widget.groupId}
          data-label={button.label}
          data-source-action-count={button.actions.length}
          data-source-actions={button.actions.join("||")}
          data-source-handler="MusicPatchNode.method3842"
          data-source-action-resolver="FaceNormal.method2908"
          data-source-menu-inserter="AttackOption.method2104"
          data-widget-id={button.widget.widget.id}
          key={button.widget.widget.id}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerMove={(event) => {
            onHover?.({
              buttonId: button.buttonId,
              label: button.label,
              widget: button.widget,
              actionText: button.actionText,
              actionIndex: button.actionIndex,
              menuOpcode: button.menuOpcode,
              actions: button.actions,
              sourceActions: button.sourceActions,
              position: runtimeViewportPointerPosition(event)
            });
          }}
          onPointerLeave={() => onHover?.(null)}
          onPointerDown={(event) => {
            if (event.button === 2) {
              event.preventDefault();
              event.stopPropagation();
              onContextMenu?.({
                buttonId: button.buttonId,
                label: button.label,
                widget: button.widget,
                actionText: button.actionText,
                actionIndex: button.actionIndex,
                menuOpcode: button.menuOpcode,
                actions: button.actions,
                sourceActions: button.sourceActions,
                position: runtimeViewportPointerPosition(event)
              });
              return;
            }
            if (event.button !== 0) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            onDefaultAction?.({
              buttonId: button.buttonId,
              label: button.label,
              widget: button.widget,
              actionText: button.actionText,
              actionIndex: button.actionIndex,
              menuOpcode: button.menuOpcode,
              actions: button.actions,
              sourceActions: button.sourceActions,
              position: runtimeViewportPointerPosition(event)
            });
          }}
          style={rectStyle(button.widget.rect)}
          type="button"
        >
          <span className="kronosWidgetAccessibleText">{button.label}</span>
        </button>
      ))}
    </div>
  );
}

function kronosChatboxButtons(layout: KronosMountedInterfaceLayout | null): readonly KronosChatboxButtonLayout[] {
  if (!layout) {
    return [];
  }
  const widgetsByChildId = new Map(layout.widgets.map((entry) => [entry.widget.childId, entry]));
  return chatboxButtonDefinitions.flatMap((definition) => {
    const widget = widgetsByChildId.get(definition.childId);
    if (!widget || widget.widget.hidden || widget.rect.width <= 0 || widget.rect.height <= 0) {
      return [];
    }
    const actions = sourceWidgetActions(widget.widget.actions ?? []);
    const sourceActions = sourceWidgetActionEntries(widget.widget.actions ?? []);
    const action = sourceActions[0];
    if (!action) {
      return [];
    }
    return [
      {
        buttonId: definition.buttonId,
        label: definition.label,
        widget,
        actionText: action.actionText,
        actionIndex: action.actionIndex,
        menuOpcode: action.menuOpcode,
        actions,
        sourceActions
      }
    ];
  });
}

function sourceWidgetActions(actions: readonly string[]): readonly string[] {
  return actions.filter((action) => action.trim().length > 0);
}

function sourceWidgetActionEntries(actions: readonly string[]): readonly KronosSourceWidgetAction[] {
  return actions.flatMap((actionText, index) => {
    if (actionText.trim().length === 0) {
      return [];
    }
    const actionIndex = index + 1;
    return [
      {
        actionIndex,
        actionText,
        menuOpcode: kronosSourceWidgetMenuOpcode(actionIndex)
      }
    ];
  });
}

function defaultSourceWidgetAction(actions: readonly string[]): KronosSourceWidgetAction | null {
  return sourceWidgetActionEntries(actions)[0] ?? null;
}

function kronosSourceWidgetMenuOpcode(actionIndex: number): number {
  return actionIndex >= 6 ? widgetHighActionOpcode : widgetDefaultActionOpcode;
}

function KronosMountedWidgetLayer({
  atlas,
  clientFonts,
  layout,
  spriteAtlases,
  suppressedWidgetIds
}: {
  readonly atlas: KronosHudAtlas;
  readonly clientFonts: KronosClientFontStore;
  readonly layout: KronosMountedInterfaceLayout | null;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
  readonly suppressedWidgetIds?: ReadonlySet<number>;
}): JSX.Element | null {
  if (!layout) {
    return null;
  }

  return (
    <div className="kronosMountedWidgetLayer" data-group-id={layout.groupId}>
      {layout.widgets.map((widget, index) => {
        if (suppressedWidgetIds?.has(widget.widget.id)) {
          return null;
        }

        return widget.widget.type === 4 ? (
          <KronosWidgetText
            key={`${widget.widget.id}:${index}`}
            clientFonts={clientFonts}
            order={index}
            spriteAtlases={spriteAtlases}
            widget={widget}
          />
        ) : widget.widget.type === 3 ? (
          <KronosWidgetRectangle key={`${widget.widget.id}:${index}`} widget={widget} order={index} />
        ) : (
          <KronosWidgetSprite key={`${widget.widget.id}:${index}`} atlas={atlas} widget={widget} order={index} />
        );
      })}
    </div>
  );
}

function KronosNoticeboardLayer({
  clientFonts,
  layout,
  snapshot,
  spriteAtlases
}: {
  readonly clientFonts: KronosClientFontStore;
  readonly layout: KronosMountedInterfaceLayout | null;
  readonly snapshot: RuntimeSceneSnapshot;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
}): JSX.Element | null {
  if (!layout || layout.groupId !== KRONOS_NOTICEBOARD_GROUP_ID) {
    return null;
  }

  const clip = layout.widgets.find((entry) => entry.widget.childId === kronosNoticeboardClipChildId) ?? null;
  if (!clip) {
    return null;
  }

  const sourceTextByChildId = kronosNoticeboardTextByChildId(snapshot);
  const widgets = layout.widgets.filter(
    (entry) =>
      entry.widget.type === 4 &&
      kronosNoticeboardScrollTextChildIds.has(entry.widget.childId) &&
      !kronosNoticeboardSuppressedTextChildIds.has(entry.widget.childId)
  );

  return (
    <div
      className="kronosNoticeboardLayer"
      data-group-id={layout.groupId}
      data-source-server-handler="TabQuest.send"
      data-source-interface="Interface.NOTICEBOARD"
    >
      <div className="kronosNoticeboardClip" style={rectStyle(clip.rect)}>
        <div
          className="kronosNoticeboardScrollContent"
          style={{
            left: -clip.rect.x,
            top: -clip.rect.y,
            width: layout.rect.width,
            height: Math.max(clip.rect.height, 1000)
          }}
        >
          {widgets.map((widget, index) => {
            const text = sourceTextByChildId.get(widget.widget.childId) ?? widget.widget.text;
            if (!text) {
              return null;
            }
            return (
              <KronosWidgetText
                key={`${widget.widget.id}:${index}`}
                clientFonts={clientFonts}
                order={index}
                spriteAtlases={spriteAtlases}
                widget={kronosResolvedWidgetWithText(widget, text)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KronosSocialPanelLayer({
  clientFonts,
  layout,
  onButtonDefaultAction,
  socialLists,
  spriteAtlases
}: {
  readonly clientFonts: KronosClientFontStore;
  readonly layout: KronosMountedInterfaceLayout | null;
  readonly onButtonDefaultAction: ((command: KronosSocialButtonCommand) => void) | undefined;
  readonly socialLists: KronosSocialListsSnapshot | undefined;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
}): JSX.Element | null {
  const config = kronosSocialPanelConfig(layout);
  if (!layout || !config) {
    return null;
  }

  const clip = layout.widgets.find((entry) => entry.widget.childId === config.rowsClipChildId) ?? null;
  if (!clip) {
    return null;
  }

  const members = config.list === "friends" ? socialLists?.friends ?? [] : socialLists?.ignores ?? [];
  const font = kronosClientFontDefinitionById(clientFonts, config.fontId);
  const atlas = font ? spriteAtlases.get(font.sheetId as RuntimeSpriteSheetId) : undefined;
  const sourceActions = [
    kronosSocialButton(layout, config.switchChildId, "switch", config.list),
    kronosSocialButton(layout, config.addChildId, "add", config.list),
    kronosSocialButton(layout, config.deleteChildId, "delete", config.list)
  ].filter((button): button is KronosSocialPanelButton => button !== null);

  return (
    <div
      className="kronosSocialPanelLayer"
      data-group-id={layout.groupId}
      data-list-kind={config.list}
      data-loaded={String(socialLists?.loaded === true)}
      data-member-count={members.length}
      data-source-client-opcodes={config.clientOpcodes}
      data-source-interface={config.sourceInterface}
      data-source-packet={config.sourcePacket}
      data-source-server-handler="FriendsHandler"
      data-source-toggle-handler="TabSocial.java"
    >
      <div
        className="kronosSocialRowsClip"
        data-source-scroll-child-id={clip.widget.childId}
        data-source-scroll-height={kronosWidgetSourceScrollHeight(clip.widget)}
        style={rectStyle(clip.rect)}
      >
        <div
          className="kronosSocialRows"
          style={{
            width: clip.rect.width,
            height: Math.max(clip.rect.height, members.length * kronosSocialRowHeight)
          }}
        >
          {members.map((member, index) => (
            <div
              className="kronosSocialRow"
              data-index={index}
              data-name={member.name}
              data-previous-name={member.previousName ?? ""}
              data-rank={member.rank ?? ""}
              data-source-name-opcode={config.nameOpcode}
              data-source-rank-opcode={config.rankOpcode ?? ""}
              data-source-world-opcode={config.worldOpcode ?? ""}
              data-world={member.world}
              key={`${member.name}:${index}`}
              style={kronosSocialRowStyle(index, clip.rect.width)}
            >
              <span
                className="kronosSocialRowName"
                style={{
                  left: 0,
                  top: 0,
                  width: kronosSocialNameWidth(config.list, clip.rect.width)
                }}
              >
                {font && atlas ? (
                  <KronosSourceGlyphText
                    atlas={atlas}
                    color="#ffffff"
                    font={font}
                    height={kronosSocialRowHeight}
                    lineHeight={undefined}
                    shadowColor="#000000"
                    text={member.name}
                    width={kronosSocialNameWidth(config.list, clip.rect.width)}
                    xTextAlignment={0}
                    yTextAlignment={0}
                  />
                ) : (
                  <span className="kronosWidgetAccessibleText">{member.name}</span>
                )}
              </span>
              {config.list === "friends" ? (
                <span
                  className="kronosSocialRowWorld"
                  data-source-world={member.world}
                  style={{
                    left: kronosSocialWorldLeft(clip.rect.width),
                    top: 0,
                    width: Math.max(0, clip.rect.width - kronosSocialWorldLeft(clip.rect.width))
                  }}
                >
                  {font && atlas ? (
                    <KronosSourceGlyphText
                      atlas={atlas}
                      color={member.world > 0 ? "#00ff00" : "#ff0000"}
                      font={font}
                      height={kronosSocialRowHeight}
                      lineHeight={undefined}
                      shadowColor="#000000"
                      text={member.world > 0 ? kronosSocialWorldText(member.world) : "Offline"}
                      width={Math.max(0, clip.rect.width - kronosSocialWorldLeft(clip.rect.width))}
                      xTextAlignment={2}
                      yTextAlignment={0}
                    />
                  ) : (
                    <span className="kronosWidgetAccessibleText">
                      {member.world > 0 ? kronosSocialWorldText(member.world) : "Offline"}
                    </span>
                  )}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {sourceActions.map((button) => (
        <button
          aria-label={button.actionText}
          className="kronosSocialSourceButton"
          data-action={button.action}
          data-action-index={button.actionIndex}
          data-action-text={button.actionText}
          data-child-id={button.widget.widget.childId}
          data-click-mask={button.widget.widget.clickMask ?? 0}
          data-list-kind={button.list}
          data-source-packet-id={button.sourcePacketId ?? ""}
          data-source-packet-name={button.sourcePacketName ?? ""}
          data-widget-id={button.widget.widget.id}
          key={`${button.widget.widget.id}:${button.action}`}
          onPointerDown={(event) => {
            if (event.button !== 0 || !onButtonDefaultAction) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            onButtonDefaultAction({
              action: button.action,
              list: button.list,
              actionText: button.actionText,
              actionIndex: button.actionIndex,
              childId: button.widget.widget.childId,
              widgetId: button.widget.widget.id,
              clickMask: button.widget.widget.clickMask ?? 0,
              sourcePacketId: button.sourcePacketId,
              sourcePacketName: button.sourcePacketName,
              position: runtimeViewportPointerPosition(event)
            });
          }}
          style={rectStyle(button.widget.rect)}
          type="button"
        >
          <span className="kronosWidgetAccessibleText">{button.actionText}</span>
        </button>
      ))}
    </div>
  );
}

function KronosClanChatPanelLayer({
  clanChat,
  clientFonts,
  layout,
  onButtonDefaultAction,
  spriteAtlases
}: {
  readonly clanChat: KronosClanChatSnapshot | undefined;
  readonly clientFonts: KronosClientFontStore;
  readonly layout: KronosMountedInterfaceLayout | null;
  readonly onButtonDefaultAction: ((command: KronosClanChatButtonCommand) => void) | undefined;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
}): JSX.Element | null {
  if (!layout || layout.groupId !== KRONOS_CLAN_CHAT_GROUP_ID) {
    return null;
  }

  const displayNameWidget = layout.widgets.find((entry) => entry.widget.childId === kronosClanChatNameChildId) ?? null;
  const ownerWidget = layout.widgets.find((entry) => entry.widget.childId === kronosClanChatOwnerChildId) ?? null;
  const rowsClip = layout.widgets.find((entry) => entry.widget.childId === kronosClanChatRowsClipChildId) ?? null;
  if (!displayNameWidget || !ownerWidget || !rowsClip) {
    return null;
  }

  const active = clanChat?.active === true;
  const members = active ? clanChat?.members ?? [] : [];
  const displayName = active ? clanChat?.displayName ?? "" : "Not in chat";
  const ownerName = active ? clanChat?.ownerName ?? "" : "None";
  const displayNameColor = active ? 0xffff64 : 0x808080;
  const ownerNameColor = active ? 0xffffff : 0x808080;
  const buttons = [
    kronosClanChatButton(layout, active ? "leave" : "join", active ? "Leave Chat" : "Join Chat"),
    kronosClanChatButton(layout, "setup", "Clan Setup")
  ].filter((button): button is KronosClanChatPanelButton => button !== null);

  return (
    <div
      className="kronosClanChatPanelLayer"
      data-active={String(active)}
      data-display-name={displayName}
      data-group-id={layout.groupId}
      data-member-count={members.length}
      data-owner-name={ownerName}
      data-source-client-opcodes="3611 name, 3612 count, 3613 member name, 3614 world, 3615 rank, 3616 minKick, 3618 local rank, 3624 self, 3625 owner, 3626 friend, 3627 ignore"
      data-source-client-script="chatchannel_current_build"
      data-source-interface="Interface.CLAN_CHAT"
      data-source-packet="ClanChat.getChannelBuffer -> varshort packet 48"
      data-source-server-handler="ClanHandler ids 53 join/leave, 22 kick; TabClanChat child 24 opens Interface.CLAN_CHAT_SETTINGS"
    >
      <KronosWidgetText
        clientFonts={clientFonts}
        order={2000}
        spriteAtlases={spriteAtlases}
        widget={kronosResolvedWidgetWithTextColor(displayNameWidget, displayName, displayNameColor)}
      />
      <KronosWidgetText
        clientFonts={clientFonts}
        order={2001}
        spriteAtlases={spriteAtlases}
        widget={kronosResolvedWidgetWithTextColor(ownerWidget, ownerName, ownerNameColor)}
      />
      <div
        className="kronosClanChatRowsClip"
        data-source-scroll-child-id={rowsClip.widget.childId}
        data-source-scroll-height={kronosWidgetSourceScrollHeight(rowsClip.widget)}
        style={rectStyle(rowsClip.rect)}
      >
        <div
          className="kronosClanChatRows"
          style={{
            width: rowsClip.rect.width,
            height: Math.max(rowsClip.rect.height, members.length * kronosClanChatRowHeight + (members.length > 0 ? 5 : 0))
          }}
        >
          {members.map((member, index) => (
            <KronosClanChatMemberRow
              clientFonts={clientFonts}
              key={`${member.name}:${index}`}
              member={member}
              index={index}
              rowWidth={rowsClip.rect.width}
              spriteAtlases={spriteAtlases}
            />
          ))}
        </div>
      </div>
      {buttons.map((button, index) => (
        <KronosWidgetText
          clientFonts={clientFonts}
          key={`${button.widget.widget.id}:label`}
          order={2100 + index}
          spriteAtlases={spriteAtlases}
          widget={kronosResolvedWidgetWithText(button.widget, button.actionText)}
        />
      ))}
      {buttons.map((button) => (
        <button
          aria-label={button.actionText}
          className="kronosClanChatSourceButton"
          data-action={button.action}
          data-action-index={button.actionIndex}
          data-action-text={button.actionText}
          data-child-id={button.widget.widget.childId}
          data-click-mask={button.widget.widget.clickMask ?? 0}
          data-source-packet-id={button.sourcePacketId ?? ""}
          data-source-packet-name={button.sourcePacketName ?? ""}
          data-source-server-handler={button.sourceServerHandler}
          data-widget-id={button.widget.widget.id}
          key={`${button.widget.widget.id}:${button.action}`}
          onPointerDown={(event) => {
            if (event.button !== 0 || !onButtonDefaultAction) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            onButtonDefaultAction({
              action: button.action,
              actionText: button.actionText,
              actionIndex: button.actionIndex,
              childId: button.widget.widget.childId,
              widgetId: button.widget.widget.id,
              clickMask: button.widget.widget.clickMask ?? 0,
              sourcePacketId: button.sourcePacketId,
              sourcePacketName: button.sourcePacketName,
              sourceServerHandler: button.sourceServerHandler,
              position: runtimeViewportPointerPosition(event)
            });
          }}
          style={rectStyle(button.widget.rect)}
          type="button"
        >
          <span className="kronosWidgetAccessibleText">{button.actionText}</span>
        </button>
      ))}
    </div>
  );
}

function KronosClanChatMemberRow({
  clientFonts,
  index,
  member,
  rowWidth,
  spriteAtlases
}: {
  readonly clientFonts: KronosClientFontStore;
  readonly index: number;
  readonly member: KronosClanChatMember;
  readonly rowWidth: number;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
}): JSX.Element {
  const font = kronosClientFontDefinitionById(clientFonts, 495);
  const atlas = font ? spriteAtlases.get(font.sheetId as RuntimeSpriteSheetId) : undefined;
  const worldLeft = kronosClanChatWorldLeft(rowWidth);
  const nameLeft = member.rank >= 0 ? 14 : 0;
  const nameWidth = Math.max(0, worldLeft - nameLeft - 2);
  const worldWidth = Math.max(0, rowWidth - worldLeft);
  const currentWorld = member.world === 1;
  const worldText = member.world > 0 ? `World ${member.world}` : "Offline";

  return (
    <div
      className="kronosClanChatRow"
      data-friend={String(member.friend === true)}
      data-ignored={String(member.ignored === true)}
      data-index={index}
      data-name={member.name}
      data-rank={member.rank}
      data-self={String(member.self === true)}
      data-source-friend-opcode="3626"
      data-source-ignore-opcode="3627"
      data-source-name-opcode="3613"
      data-source-rank-graphic-enum="enum_706"
      data-source-rank-opcode="3615"
      data-source-self-opcode="3624"
      data-source-world-opcode="3614"
      data-world={member.world}
      style={kronosSocialRowStyle(index, rowWidth)}
    >
      <span
        className="kronosClanChatRankIcon"
        data-rank={member.rank}
        style={{
          left: 1,
          top: 3,
          width: 9,
          height: 9
        }}
      />
      <span
        className="kronosClanChatRowName"
        style={{
          left: nameLeft,
          top: 0,
          width: nameWidth
        }}
      >
        {font && atlas ? (
          <KronosSourceGlyphText
            atlas={atlas}
            color="#ffffff"
            font={font}
            height={kronosClanChatRowHeight}
            lineHeight={undefined}
            shadowColor={null}
            text={member.name}
            width={nameWidth}
            xTextAlignment={0}
            yTextAlignment={1}
          />
        ) : (
          <span className="kronosWidgetAccessibleText">{member.name}</span>
        )}
      </span>
      <span
        className="kronosClanChatRowWorld"
        style={{
          left: worldLeft,
          top: 0,
          width: worldWidth
        }}
      >
        {font && atlas ? (
          <KronosSourceGlyphText
            atlas={atlas}
            color={currentWorld ? "#0dc10d" : "#ffff64"}
            font={font}
            height={kronosClanChatRowHeight}
            lineHeight={undefined}
            shadowColor={null}
            text={worldText}
            width={worldWidth}
            xTextAlignment={2}
            yTextAlignment={1}
          />
        ) : (
          <span className="kronosWidgetAccessibleText">{worldText}</span>
        )}
      </span>
    </div>
  );
}

interface KronosClanChatPanelButton {
  readonly action: KronosClanChatButtonAction;
  readonly actionIndex: number;
  readonly actionText: string;
  readonly widget: KronosResolvedWidget;
  readonly sourcePacketId?: 53;
  readonly sourcePacketName?: string;
  readonly sourceServerHandler: string;
}

function kronosClanChatButton(
  layout: KronosMountedInterfaceLayout,
  action: KronosClanChatButtonAction,
  actionText: string
): KronosClanChatPanelButton | null {
  const childId = action === "setup" ? kronosClanChatSetupChildId : kronosClanChatJoinLeaveChildId;
  const widget = layout.widgets.find((entry) => entry.widget.childId === childId);
  if (!widget || widget.widget.hidden || widget.rect.width <= 0 || widget.rect.height <= 0) {
    return null;
  }
  return {
    action,
    actionIndex: action === "leave" ? 1 : 1,
    actionText,
    widget,
    sourcePacketId: action === "setup" ? undefined : 53,
    sourcePacketName: action === "setup" ? undefined : "Join / Leave clan chat",
    sourceServerHandler: action === "setup" ? "TabClanChat child 24 opens Interface.CLAN_CHAT_SETTINGS" : "ClanHandler opcode 53"
  };
}

interface KronosSocialPanelConfig {
  readonly list: KronosSocialListKind;
  readonly rowsClipChildId: number;
  readonly dynamicTextChildId: number;
  readonly switchChildId: number;
  readonly addChildId: number;
  readonly deleteChildId: number;
  readonly fontId: number;
  readonly sourceInterface: string;
  readonly sourcePacket: string;
  readonly clientOpcodes: string;
  readonly nameOpcode: number;
  readonly worldOpcode?: number;
  readonly rankOpcode?: number;
}

interface KronosSocialPanelButton {
  readonly action: KronosSocialButtonAction;
  readonly list: KronosSocialListKind;
  readonly actionIndex: number;
  readonly actionText: string;
  readonly widget: KronosResolvedWidget;
  readonly sourcePacketId?: 80 | 48 | 84 | 56;
  readonly sourcePacketName?: string;
}

function kronosSocialPanelConfig(layout: KronosMountedInterfaceLayout | null): KronosSocialPanelConfig | null {
  if (!layout) {
    return null;
  }
  if (layout.groupId === KRONOS_FRIENDS_GROUP_ID) {
    return {
      list: "friends",
      rowsClipChildId: kronosFriendsListRowsClipChildId,
      dynamicTextChildId: kronosFriendsListDynamicTextChildId,
      switchChildId: kronosFriendsListSwitchChildId,
      addChildId: kronosFriendsListAddChildId,
      deleteChildId: kronosFriendsListDeleteChildId,
      fontId: 495,
      sourceInterface: "Interface.FRIENDS_LIST",
      sourcePacket: "Player.sendFriends -> varshort packet 61",
      clientOpcodes: "3600 count, 3601 name/previousName, 3602 world, 3603 rank",
      nameOpcode: 3601,
      worldOpcode: 3602,
      rankOpcode: 3603
    };
  }
  if (layout.groupId === KRONOS_IGNORES_GROUP_ID) {
    return {
      list: "ignores",
      rowsClipChildId: kronosIgnoreListRowsClipChildId,
      dynamicTextChildId: kronosIgnoreListDynamicTextChildId,
      switchChildId: kronosIgnoreListSwitchChildId,
      addChildId: kronosIgnoreListAddChildId,
      deleteChildId: kronosIgnoreListDeleteChildId,
      fontId: 495,
      sourceInterface: "Interface.IGNORE_LIST",
      sourcePacket: "Player.sendIgnores -> varshort packet 59",
      clientOpcodes: "3621 count, 3622 name/previousName",
      nameOpcode: 3622
    };
  }
  return null;
}

function kronosSocialButton(
  layout: KronosMountedInterfaceLayout,
  childId: number,
  action: KronosSocialButtonAction,
  list: KronosSocialListKind
): KronosSocialPanelButton | null {
  const widget = layout.widgets.find((entry) => entry.widget.childId === childId);
  const actionText = sourceWidgetActions(widget?.widget.actions ?? [])[0] ?? kronosSocialFallbackActionText(action, list);
  if (!widget || widget.widget.hidden || widget.rect.width <= 0 || widget.rect.height <= 0) {
    return null;
  }
  return {
    action,
    list,
    actionIndex: 1,
    actionText,
    widget,
    ...kronosSocialSourcePacket(action, list)
  };
}

function kronosSocialSourcePacket(
  action: KronosSocialButtonAction,
  list: KronosSocialListKind
): Pick<KronosSocialPanelButton, "sourcePacketId" | "sourcePacketName"> {
  if (list === "friends" && action === "add") {
    return { sourcePacketId: 80, sourcePacketName: "Add friend" };
  }
  if (list === "friends" && action === "delete") {
    return { sourcePacketId: 48, sourcePacketName: "Delete friend" };
  }
  if (list === "ignores" && action === "add") {
    return { sourcePacketId: 84, sourcePacketName: "Add ignore" };
  }
  if (list === "ignores" && action === "delete") {
    return { sourcePacketId: 56, sourcePacketName: "Delete ignore" };
  }
  return {};
}

function kronosSocialFallbackActionText(action: KronosSocialButtonAction, list: KronosSocialListKind): string {
  if (action === "switch") {
    return list === "friends" ? "View Ignore List" : "View Friends List";
  }
  if (list === "friends") {
    return action === "add" ? "Add Friend" : "Delete Friend";
  }
  return action === "add" ? "Add Name" : "Delete Name";
}

function kronosSocialRowStyle(index: number, width: number): CSSProperties {
  return {
    left: 0,
    top: index * kronosSocialRowHeight,
    width,
    height: kronosSocialRowHeight
  };
}

function kronosSocialNameWidth(list: KronosSocialListKind, rowWidth: number): number {
  return list === "friends" ? Math.max(0, kronosSocialWorldLeft(rowWidth) - 2) : rowWidth;
}

function kronosSocialWorldLeft(rowWidth: number): number {
  return Math.max(82, rowWidth - 58);
}

function kronosSocialWorldText(world: number): string {
  return world > 0 ? `World ${world}` : "Offline";
}

function kronosWidgetSourceScrollHeight(widget: KronosResolvedWidget["widget"]): number {
  return Number((widget as { readonly scrollHeight?: number }).scrollHeight ?? 0);
}

function KronosEmotePanelLayer({
  layout,
  spriteAtlases
}: {
  readonly layout: KronosMountedInterfaceLayout | null;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
}): JSX.Element | null {
  if (!layout || layout.groupId !== KRONOS_EMOTES_GROUP_ID) {
    return null;
  }

  const scroll = layout.widgets.find((entry) => entry.widget.childId === kronosEmoteScrollableChildId) ?? null;
  const scrollbar = layout.widgets.find((entry) => entry.widget.childId === kronosEmoteScrollbarChildId) ?? null;
  if (!scroll) {
    return null;
  }

  const emoteAtlas = spriteAtlases.get("emote_icons");
  const contentHeight =
    Math.trunc((Math.max(0, kronosEmoteSpecs.length - 1) / kronosEmoteColumns)) * kronosEmoteButtonStep.height +
    kronosEmoteFirstRowOffsetY +
    kronosEmoteButtonSize.height;

  return (
    <div
      className="kronosEmotePanelLayer"
      data-group-id={layout.groupId}
      data-source-client-script="emote_init"
      data-source-update-proc="emote_update"
      data-source-interface="Interface.EMOTE"
    >
      <div className="kronosEmoteClip" style={rectStyle(scroll.rect)}>
        <div className="kronosEmoteGrid" style={{ width: scroll.rect.width, height: contentHeight }}>
          {kronosEmoteSpecs.map((emote, visibleIndex) => {
            const rect = kronosEmoteButtonRect(visibleIndex);
            const sprite = emoteAtlas ? findSpriteById(emoteAtlas, emote.unlockedSpriteId) : undefined;
            return (
              <Fragment key={emote.slot}>
                <button
                  aria-label={emote.label}
                  className="kronosEmoteButton"
                  data-animation-id={emote.animationId}
                  data-graphics-id={emote.graphicsId ?? ""}
                  data-locked-sprite-id={emote.lockedSpriteId}
                  data-slot={emote.slot}
                  data-source-order={emote.sourceOrder}
                  data-source-client-size={`${kronosEmoteButtonSize.width}x${kronosEmoteButtonSize.height}`}
                  data-source-client-step={`${kronosEmoteButtonStep.width}x${kronosEmoteButtonStep.height}`}
                  data-source-locked-graphic-enum={kronosEmoteDefinitions.lockedSpriteEnumId}
                  data-source-name-enum={kronosEmoteDefinitions.nameEnumId}
                  data-source-unlocked-graphic-enum={kronosEmoteDefinitions.unlockedSpriteEnumId}
                  data-unlocked-sprite-id={emote.unlockedSpriteId}
                  style={rectStyle(rect)}
                  type="button"
                >
                  {emoteAtlas && sprite ? null : <span className="kronosWidgetAccessibleText">{emote.label}</span>}
                </button>
                {emoteAtlas && sprite ? (
                  <span
                    aria-hidden="true"
                    className="kronosEmoteIconSprite"
                    data-sprite-id={sprite.spriteId}
                    style={kronosEmoteSpriteStyle(sprite, rect)}
                  >
                    <img
                      alt=""
                      className="kronosEmoteIconImage"
                      draggable={false}
                      src={`render/sprites/${emoteAtlas.metadata.image}`}
                      style={kronosEmoteSpriteImageStyle(emoteAtlas, sprite, rect)}
                    />
                  </span>
                ) : null}
              </Fragment>
            );
          })}
        </div>
      </div>
      {scrollbar ? (
        <span
          aria-hidden="true"
          className="kronosEmoteScrollbarSource"
          data-source-client-script="scrollbar_vertical"
          style={rectStyle(scrollbar.rect)}
        />
      ) : null}
    </div>
  );
}

function KronosEquipmentItemLayer({
  clientAtlas,
  equipmentDefinitions,
  itemAtlas,
  onContextMenu,
  onDefaultAction,
  onHover,
  panel,
  pendingRemoveSlotIds,
  snapshot
}: {
  readonly clientAtlas: KronosHudAtlas;
  readonly equipmentDefinitions: KronosInventoryEquipmentDefinitionStore;
  readonly itemAtlas: KronosHudAtlas | undefined;
  readonly onContextMenu: ((command: KronosEquipmentItemCommand) => void) | undefined;
  readonly onDefaultAction: ((command: KronosEquipmentItemCommand) => void) | undefined;
  readonly onHover: ((command: KronosEquipmentItemCommand | null) => void) | undefined;
  readonly panel: KronosEquipmentPanelLayout | null;
  readonly pendingRemoveSlotIds?: ReadonlySet<string>;
  readonly snapshot: RuntimeSceneSnapshot;
}): JSX.Element | null {
  if (!panel) {
    return null;
  }

  const itemIdsBySlot = localPlayerEquipmentItemIdsBySlot(snapshot, equipmentDefinitions);
  const slotTile = findSpriteById(clientAtlas, equipmentSlotTileSpriteId);

  return (
    <div className="kronosEquipmentItemLayer" data-group-id={panel.groupId}>
      {panel.slots.map((slot) => {
        const itemId = itemIdsBySlot.get(slot.serverSlot);
        const item = itemId === undefined || !itemAtlas ? undefined : findItemSprite(itemAtlas, itemId, "normal", 1);
        const itemName = itemId === undefined ? null : equipmentDefinitions.get(itemId)?.name ?? item?.name ?? `item ${itemId}`;
        const pendingRemove = pendingRemoveSlotIds?.has(slot.id) === true;
        const command = (event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>): KronosEquipmentItemCommand | null =>
          itemId === undefined || !itemName
            ? null
            : {
                slot,
                itemId,
                itemName,
                position: runtimeViewportPointerPosition(event)
              };
        const openContextMenu = (event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>): void => {
          const equipmentCommand = command(event);
          if (!onContextMenu || !equipmentCommand) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          onContextMenu(equipmentCommand);
        };
        return (
          <Fragment key={slot.childId}>
            {slotTile ? (
              <span
                aria-hidden="true"
                className="kronosEquipmentSlotTileSprite"
                data-source-client-script="wear_initslot"
                data-source-graphic="miscgraphics,0"
                data-sprite-id={equipmentSlotTileSpriteId}
                data-slot-id={slot.id}
                data-widget-id={slot.widgetId}
                style={equipmentSlotTileSpriteStyle(clientAtlas, slotTile, slot)}
              />
            ) : null}
            {itemId !== undefined ? (
              <button
                aria-label={`Equipment ${slot.id}: ${itemName ?? `item ${itemId}`}`}
                className="kronosEquipmentItemButton"
                data-child-id={slot.childId}
                data-default-action-index="1"
                data-default-action-text="Remove"
                data-default-menu-opcode={widgetDefaultActionOpcode}
                data-group-id={slot.groupId}
                data-item-id={itemId}
                data-item-name={itemName ?? ""}
                data-pending-remove={pendingRemove ? "true" : "false"}
                data-server-slot={slot.serverSlot}
                data-slot-id={slot.id}
                data-source-action-count={slot.actions.length}
                data-source-actions={sourceWidgetActions(slot.actions).join("||")}
                data-source-handler="MusicPatchNode.method3842"
                data-source-server-handler="TabEquipment.itemAction"
                data-widget-id={slot.widgetId}
                onContextMenu={openContextMenu}
                onPointerMove={(event) => onHover?.(command(event))}
                onPointerLeave={() => onHover?.(null)}
                onPointerDown={(event) => {
                  const equipmentCommand = command(event);
                  if (event.button === 2) {
                    openContextMenu(event);
                    return;
                  }
                  if (event.button !== 0 || !onDefaultAction || !equipmentCommand) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  onDefaultAction(equipmentCommand);
                }}
                style={equipmentItemButtonStyle(slot)}
                type="button"
              />
            ) : null}
            {item && itemAtlas && itemId !== undefined && itemName ? (
            <span
              aria-hidden="true"
              className="kronosEquipmentItemSprite"
              data-child-id={slot.childId}
              data-item-id={itemId}
              data-item-name={itemName}
              data-pending-remove={pendingRemove ? "true" : "false"}
              data-server-slot={slot.serverSlot}
              data-slot-id={slot.id}
              data-source-action-count={slot.actions.length}
              data-source-border={item.sourceBorder ?? ""}
              data-source-shadow-color={item.sourceShadowColor ?? ""}
              data-sprite-variant={item.variant ?? ""}
              data-widget-id={slot.widgetId}
                style={equipmentItemSpriteStyle(itemAtlas, item, slot)}
            />
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}

function KronosEquipmentUtilityButtonLayer({
  atlas,
  onDefaultAction,
  panel
}: {
  readonly atlas: KronosHudAtlas;
  readonly onDefaultAction: ((command: KronosEquipmentUtilityButtonCommand) => void) | undefined;
  readonly panel: KronosEquipmentPanelLayout | null;
}): JSX.Element | null {
  if (!panel || panel.utilityButtons.length === 0) {
    return null;
  }

  return (
    <div className="kronosEquipmentUtilityButtonLayer" data-group-id={panel.groupId}>
      {panel.utilityButtons.map((button) => {
        const action = defaultSourceWidgetAction(button.actions);
        if (!action) {
          return null;
        }
        const menuOpcode = action.menuOpcode;
        return (
          <span key={button.widgetId}>
            <KronosEquipmentUtilityButtonSprite atlas={atlas} button={button} />
            <button
              aria-label={button.label}
              className="kronosEquipmentUtilityButton"
              data-button-id={button.id}
              data-child-id={button.childId}
              data-click-mask={button.clickMask}
              data-default-action-index={action.actionIndex}
              data-default-action-text={action.actionText}
              data-default-menu-opcode={menuOpcode}
              data-group-id={button.groupId}
              data-label={button.label}
              data-source-action-count={sourceWidgetActions(button.actions).length}
              data-source-actions={sourceWidgetActions(button.actions).join("||")}
              data-source-action-resolver="FaceNormal.method2908"
              data-source-handler="MusicPatchNode.method3842"
              data-source-menu-inserter="AttackOption.method2104"
              data-sprite-child-id={button.spriteChildId ?? ""}
              data-sprite-id={button.spriteId ?? ""}
              data-sprite-widget-id={button.spriteWidgetId ?? ""}
              data-widget-id={button.widgetId}
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                onDefaultAction?.({
                  button,
                  actionText: action.actionText,
                  actionIndex: action.actionIndex,
                  menuOpcode,
                  position: runtimeViewportPointerPosition(event)
                });
              }}
              style={rectStyle(button.rect)}
              type="button"
            >
              <span className="kronosWidgetAccessibleText">{button.label}</span>
            </button>
          </span>
        );
      })}
    </div>
  );
}

function KronosEquipmentUtilityButtonSprite({
  atlas,
  button
}: {
  readonly atlas: KronosHudAtlas;
  readonly button: KronosEquipmentUtilityButtonLayout;
}): JSX.Element | null {
  if (button.spriteId === null || button.spriteRect === null) {
    return null;
  }

  const sprite = findSpriteById(atlas, button.spriteId);
  if (!sprite) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className="kronosEquipmentUtilityButtonSprite"
      data-button-id={button.id}
      data-child-id={button.spriteChildId ?? ""}
      data-sprite-id={button.spriteId}
      data-widget-id={button.spriteWidgetId ?? ""}
      style={equipmentUtilityButtonSpriteStyle(atlas, sprite, button.spriteRect)}
    />
  );
}

function KronosEquipmentUtilityPanel({
  clientFonts,
  equipmentDefinitions,
  inventorySlots,
  mode,
  onClose,
  panel,
  snapshot,
  spriteAtlases,
  viewport
}: {
  readonly clientFonts: KronosClientFontStore;
  readonly equipmentDefinitions: KronosInventoryEquipmentDefinitionStore;
  readonly inventorySlots: readonly (RuntimeInventorySlot | null)[];
  readonly mode: KronosEquipmentUtilityPanelMode | null;
  readonly onClose: (() => void) | undefined;
  readonly panel: KronosEquipmentPanelLayout | null;
  readonly snapshot: RuntimeSceneSnapshot;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
  readonly viewport: KronosRect;
}): JSX.Element | null {
  if (!panel || !mode) {
    return null;
  }

  const font = kronosClientFontDefinitionById(clientFonts, kronosEquipmentStatsFontId);
  const fontAtlas = font ? spriteAtlases.get(font.sheetId as RuntimeSpriteSheetId) : undefined;
  const bonuses = localPlayerEquipmentBonuses(snapshot, equipmentDefinitions);
  const equipmentItemIds = Array.from(localPlayerEquipmentItemIdsBySlot(snapshot, equipmentDefinitions).values());
  const carriedItemIds = [
    ...equipmentItemIds,
    ...inventorySlots.flatMap((slot) => (slot ? Array.from({ length: Math.max(1, Math.min(1, slot.quantity)) }, () => slot.itemId) : []))
  ];
  const title =
    mode === "stats"
      ? "Equipment Stats"
      : mode === "items-kept-on-death"
        ? "Items Kept on Death"
        : mode === "guide-prices"
          ? "Guide Prices"
          : "Call Follower";
  return (
    <div
      className={`kronosEquipmentUtilityPanel kronosEquipmentUtilityPanel-${mode}`}
      data-group-id={panel.groupId}
      data-panel-mode={mode}
      data-source-equipment-interface="Interface.EQUIPMENT group 387"
      data-source-main-interface={mode === "stats" ? "Interface.EQUIPMENT_STATS = 84" : ""}
      data-source-inventory-interface={mode === "stats" ? "Interface.EQUIPMENT_STATS_INVENTORY = 85" : ""}
      data-source-server-handler={equipmentUtilityPanelServerHandler(mode)}
      style={rectStyle(viewport)}
    >
      <div className="kronosEquipmentUtilityPanelFrame">
        <button
          aria-label="Close"
          className="kronosEquipmentUtilityPanelClose"
          data-source-client-script="sendClientScript(917, -1, -1) closes/replaces main interface"
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            onClose?.();
          }}
          type="button"
        >
          <span className="kronosWidgetAccessibleText">Close</span>
        </button>
        <KronosEquipmentPanelText
          atlas={fontAtlas}
          color={equipmentStatsTextColor}
          font={font}
          left={18}
          text={title}
          top={13}
          width={220}
        />
        {mode === "stats" ? (
          <KronosEquipmentStatsPanel atlas={fontAtlas} bonuses={bonuses} font={font} />
        ) : mode === "items-kept-on-death" ? (
          <KronosItemsKeptPanel
            atlas={fontAtlas}
            carriedItemIds={carriedItemIds}
            font={font}
            itemAtlas={spriteAtlases.get("item_sprites")}
          />
        ) : mode === "guide-prices" ? (
          <KronosEquipmentPanelMessage
            atlas={fontAtlas}
            font={font}
            lines={["This feature will be added with", "the release of the Grand Exchange!"]}
            source="TabEquipment.java h.actions[19] guide price action disabled in reference server"
          />
        ) : (
          <KronosEquipmentPanelMessage
            atlas={fontAtlas}
            font={font}
            lines={["You don't have a follower."]}
            source="TabEquipment.java h.actions[23] no-pet message"
          />
        )}
      </div>
    </div>
  );
}

function KronosEquipmentStatsPanel({
  atlas,
  bonuses,
  font
}: {
  readonly atlas: KronosHudAtlas | undefined;
  readonly bonuses: BonusTable;
  readonly font: KronosClientFontDefinition | null;
}): JSX.Element {
  let y = 40;
  return (
    <>
      {equipmentStatsSourceRows.flatMap((section) => {
        const titleTop = y;
        y += 16;
        const rows = section.rows.map((row) => {
          const top = y;
          y += 13;
          const value = row.bonusKey ? bonuses[row.bonusKey] : 0;
          return (
            <KronosEquipmentPanelText
              atlas={atlas}
              color={equipmentStatsWhiteColor}
              dataSourceWidget="EquipmentStats.update sendString"
              font={font}
              key={`${section.title}-${row.label}`}
              left={32}
              text={`${row.label}: ${equipmentStatsAsBonus(value, row.percent)}`}
              top={top}
              width={170}
            />
          );
        });
        y += 4;
        return [
          <KronosEquipmentPanelText
            atlas={atlas}
            color={equipmentStatsValueColor}
            dataSourceWidget="EquipmentStats.update section"
            font={font}
            key={`${section.title}-title`}
            left={22}
            text={section.title}
            top={titleTop}
            width={180}
          />,
          ...rows
        ];
      })}
    </>
  );
}

function KronosItemsKeptPanel({
  atlas,
  carriedItemIds,
  font,
  itemAtlas
}: {
  readonly atlas: KronosHudAtlas | undefined;
  readonly carriedItemIds: readonly number[];
  readonly font: KronosClientFontDefinition | null;
  readonly itemAtlas: KronosHudAtlas | undefined;
}): JSX.Element {
  const kept = carriedItemIds.slice(0, 3);
  return (
    <>
      <KronosEquipmentPanelMessage
        atlas={atlas}
        font={font}
        lines={["Items kept are opened by Kronos", "Interface.ITEMS_KEPT_ON_DEATH = 4"]}
        source="IKOD.open sends interface 4 and clientscript 118"
      />
      <div className="kronosItemsKeptIconRow" data-source-handler="IKOD.open getItems inventory/equipment">
        {kept.map((itemId, index) => {
          const sprite = itemAtlas ? findItemSprite(itemAtlas, itemId, "normal", 1) : undefined;
          return sprite && itemAtlas ? (
            <span
              aria-hidden="true"
              className="kronosItemsKeptIcon"
              data-item-id={itemId}
              key={`${itemId}-${index}`}
              style={{
                ...spriteStyle(itemAtlas, sprite),
                left: index * 38
              }}
            />
          ) : null;
        })}
      </div>
    </>
  );
}

function KronosEquipmentPanelMessage({
  atlas,
  font,
  lines,
  source
}: {
  readonly atlas: KronosHudAtlas | undefined;
  readonly font: KronosClientFontDefinition | null;
  readonly lines: readonly string[];
  readonly source: string;
}): JSX.Element {
  return (
    <>
      {lines.map((line, index) => (
        <KronosEquipmentPanelText
          atlas={atlas}
          color={equipmentStatsWhiteColor}
          dataSourceWidget={source}
          font={font}
          key={`${line}-${index}`}
          left={32}
          text={line}
          top={54 + index * 15}
          width={260}
        />
      ))}
    </>
  );
}

function KronosEquipmentPanelText({
  atlas,
  color,
  dataSourceWidget,
  font,
  left,
  text,
  top,
  width
}: {
  readonly atlas: KronosHudAtlas | undefined;
  readonly color: string;
  readonly dataSourceWidget?: string;
  readonly font: KronosClientFontDefinition | null;
  readonly left: number;
  readonly text: string;
  readonly top: number;
  readonly width: number;
}): JSX.Element {
  return (
    <span
      className="kronosEquipmentPanelText"
      data-source-font-id={font?.fontId ?? ""}
      data-source-font-archive={font?.fontArchiveName ?? ""}
      data-source-widget={dataSourceWidget ?? ""}
      style={{ left, top, width, height: 13 }}
    >
      {font && atlas ? (
        <KronosSourceGlyphText
          atlas={atlas}
          color={color}
          font={font}
          height={13}
          lineHeight={0}
          shadowColor="#000000"
          text={text}
          width={width}
          xTextAlignment={0}
          yTextAlignment={0}
        />
      ) : (
        <span>{text}</span>
      )}
    </span>
  );
}

function localPlayerEquipmentBonuses(
  snapshot: RuntimeSceneSnapshot,
  equipmentDefinitions: KronosInventoryEquipmentDefinitionStore
): BonusTable {
  const rows = Array.from(localPlayerEquipmentItemIdsBySlot(snapshot, equipmentDefinitions).values())
    .map((itemId) => kronosEquipmentBonusRowsByItemId.get(itemId))
    .filter((row): row is EquipmentBonusRow => row !== undefined);
  return rows.length > 0 ? aggregateBonuses(rows) : zeroBonuses;
}

function equipmentStatsAsBonus(value: number, percent: boolean): string {
  return `${value >= 0 ? "+" : ""}${value}${percent ? "%" : ""}`;
}

function equipmentUtilityPanelServerHandler(mode: KronosEquipmentUtilityPanelMode): string {
  if (mode === "stats") {
    return "EquipmentStats.open";
  }
  if (mode === "items-kept-on-death") {
    return "IKOD.open";
  }
  if (mode === "call-follower") {
    return "TabEquipment h.actions[23]";
  }
  return "TabEquipment h.actions[19] is commented in Kronos";
}

function KronosCombatPanelLayer({
  clientFonts,
  equipmentDefinitions,
  hud,
  onAutocastDefaultAction,
  onAutoRetaliateDefaultAction,
  onSpecialDefaultAction,
  onStyleDefaultAction,
  panel,
  snapshot,
  spriteAtlases,
  weaponTypeDefinitions,
  drawSpecbarAnyway,
  attackStylesConfig
}: {
  readonly clientFonts: KronosClientFontStore;
  readonly equipmentDefinitions: KronosInventoryEquipmentDefinitionStore;
  readonly hud: RuntimeHudState;
  readonly onAutocastDefaultAction: ((command: KronosCombatAutocastCommand) => void) | undefined;
  readonly onAutoRetaliateDefaultAction: ((command: KronosCombatAutoRetaliateCommand) => void) | undefined;
  readonly onSpecialDefaultAction: ((command: KronosCombatSpecialCommand) => void) | undefined;
  readonly onStyleDefaultAction: ((command: KronosCombatStyleCommand) => void) | undefined;
  readonly panel: KronosCombatPanelLayout | null;
  readonly snapshot: RuntimeSceneSnapshot;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
  readonly weaponTypeDefinitions: KronosWeaponTypeDefinitionStore;
  readonly drawSpecbarAnyway: boolean;
  readonly attackStylesConfig: RuneliteAttackStylesConfigSnapshot | null;
}): JSX.Element | null {
  if (!panel) {
    return null;
  }

  const itemIdsBySlot = localPlayerEquipmentItemIdsBySlot(snapshot, equipmentDefinitions);
  const weaponItemId = itemIdsBySlot.get(3) ?? null;
  const weaponDefinition = weaponItemId === null ? undefined : equipmentDefinitions.get(weaponItemId);
  const equipmentWeaponType =
    weaponDefinition?.weaponType === null || weaponDefinition?.weaponType === undefined
      ? null
      : weaponTypeDefinitions.get(weaponDefinition.weaponType) ?? null;
  const hudWeaponType = weaponItemId === null ? null : kronosWeaponTypeDefinitionByConfig(weaponTypeDefinitions, hud.weaponTypeConfig);
  const weaponType = equipmentWeaponType ?? hudWeaponType;
  const weaponTypeSource = equipmentWeaponType ? "equipment-definition" : hudWeaponType ? "hud-config" : "";
  const weaponName = weaponDefinition?.name ?? "Unarmed";
  const weaponHasSpecialAttack = Boolean(weaponDefinition?.specialAttack);
  const weaponHasCombatTabSpecialBar =
    weaponHasSpecialAttack || (weaponItemId !== null && combatTabVisibleSpecBarWithoutServerSpecialItemIds.has(weaponItemId));
  const combatLevel = kronosCombatLevelFromHud(hud);
  const combatInterfacePanel = kronosCombatInterfaceSetupLayout(panel, weaponType);
  const styleSlots = combatStyleSlots(combatInterfacePanel, weaponType);
  const selectedAttackSetIndex = normalizeCombatAttackSetIndex(hud.attackSet);
  const autoRetaliate = combatInterfacePanel.autoRetaliate;
  const clientAtlas = spriteAtlases.get("client_ui");
  const attackStylesPluginEnabled = attackStylesConfig?.enabled === true;
  const hideAutoRetaliate =
    attackStylesPluginEnabled && attackStylesConfig.hideAutoRetaliate;
  const visibleStyleSlots = styleSlots.filter(
    ({ slot }) => !kronosCombatStyleHiddenByRuneliteAttackStyles(weaponType, slot.index, attackStylesConfig)
  );
  const visibleAutocastControls = combatInterfacePanel.autocastControls.filter(
    (control) => !kronosAutocastControlHiddenByRuneliteAttackStyles(weaponType, control, attackStylesConfig)
  );

  return (
    <div
      className="kronosCombatPanelLayer"
      data-combat-level={combatLevel}
      data-group-id={panel.groupId}
      data-panel-height={panel.rect.height}
      data-panel-width={panel.rect.width}
      data-panel-x={panel.rect.x}
      data-panel-y={panel.rect.y}
      data-weapon-item-id={weaponItemId ?? ""}
      data-weapon-name={weaponName}
      data-weapon-type={weaponType?.id ?? ""}
      data-weapon-type-config={weaponType?.config ?? ""}
      data-weapon-type-source={weaponTypeSource}
    >
      {panel.weaponName ? (
        <KronosCombatText
          className="kronosCombatText kronosCombatWeaponName"
          clientFonts={clientFonts}
          dataAttributes={{
            "data-combat-text-kind": "weapon-name",
            "data-weapon-item-id": weaponItemId ?? "",
            "data-weapon-name": weaponName,
            "data-weapon-type": weaponType?.id ?? "",
            "data-weapon-type-config": weaponType?.config ?? ""
          }}
          spriteAtlases={spriteAtlases}
          text={weaponName}
          textLayout={panel.weaponName}
        />
      ) : null}
      {panel.combatLevel ? (
        <KronosCombatText
          className="kronosCombatText kronosCombatLevel"
          clientFonts={clientFonts}
          dataAttributes={{
            "data-combat-level": combatLevel,
            "data-combat-text-kind": "combat-level"
          }}
          spriteAtlases={spriteAtlases}
          text={`Combat Lvl: ${combatLevel}`}
          textLayout={panel.combatLevel}
        />
      ) : null}
      {visibleStyleSlots.map(({ slot, attackSet }) => {
        const selected = selectedAttackSetIndex === slot.index;
        const presentation = kronosCombatStylePresentation(weaponType, slot, attackSet);
        return (
          <span className="kronosCombatStyleControl" key={`${slot.actionChildId}:${attackSet.child}`}>
            {clientAtlas ? (
              <KronosCombatOptionsButtonBackground
                atlas={clientAtlas}
                className="kronosCombatButtonSprite kronosCombatStyleButtonSprite"
                dataAttributes={{
                  "data-button-sprite-id": selected ? combatStyleButtonSelectedSpriteId : combatStyleButtonSpriteId,
                  "data-slot-index": slot.index
                }}
                rect={slot.actionRect}
                selected={selected}
              />
            ) : null}
            {clientAtlas && slot.iconRect && presentation.iconSpriteId !== null ? (
              <KronosCombatSourceSprite
                atlas={clientAtlas}
                className="kronosCombatButtonSprite kronosCombatStyleIconSprite"
                dataAttributes={{
                  "data-icon-child-id": slot.iconChildId ?? "",
                  "data-icon-sprite-alias": presentation.iconSpriteAlias ?? "",
                  "data-icon-sprite-id": presentation.iconSpriteId,
                  "data-icon-sprite-source": presentation.iconSpriteSource,
                  "data-source-graphic": presentation.sourceGraphic,
                  "data-icon-widget-id": slot.iconWidgetId ?? "",
                  "data-slot-index": slot.index
                }}
                rect={slot.iconRect}
                spriteAlias={presentation.iconSpriteAlias ?? undefined}
                spriteId={presentation.iconSpriteId}
              />
            ) : null}
            <button
              aria-label={`${presentation.label} ${kronosAttackStyleLabel(attackSet.style)} attack style`}
              aria-pressed={selected}
              className="kronosCombatStyleSlot"
              data-action-text={kronosSourceActionText(slot.actions)}
              data-action-child-id={slot.actionChildId}
              data-action-widget-id={slot.actionWidgetId}
              data-attack-set-child-id={attackSet.child}
              data-attack-set-index={selectedAttackSetIndex ?? ""}
              data-attack-set-varp-id={combatAttackSetVarpId}
              data-attack-style={attackSet.style}
              data-attack-style-label={kronosAttackStyleLabel(attackSet.style)}
              data-attack-type={attackSet.type}
              data-attack-type-label={presentation.label}
              data-button-sprite-id={selected ? combatStyleButtonSelectedSpriteId : combatStyleButtonSpriteId}
              data-icon-child-id={slot.iconChildId ?? ""}
              data-icon-sprite-alias={presentation.iconSpriteAlias ?? ""}
              data-icon-sprite-id={presentation.iconSpriteId ?? ""}
              data-icon-sprite-source={presentation.iconSpriteId === null ? "" : presentation.iconSpriteSource}
              data-icon-widget-id={slot.iconWidgetId ?? ""}
              data-slot-index={slot.index}
              data-source-graphic={presentation.sourceGraphic}
              data-source-action-count={slot.actions.length}
              data-source-hidden={String(slot.sourceHidden)}
              data-selected={selected ? "true" : "false"}
              data-text-child-id={slot.text.childId}
              data-text-widget-id={slot.text.widgetId}
              data-weapon-type={weaponType?.id ?? ""}
              data-weapon-type-config={weaponType?.config ?? ""}
              data-weapon-type-source={weaponTypeSource}
              onPointerDown={(event) => {
                if (event.button !== 0 || !weaponType) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                onStyleDefaultAction?.({
                  slot,
                  attackSet,
                  weaponType,
                  actionText: kronosSourceActionText(slot.actions),
                  attackSetVarpId: combatAttackSetVarpId,
                  previousAttackSetIndex: selectedAttackSetIndex,
                  position: runtimeViewportPointerPosition(event)
                });
              }}
              style={rectStyle(slot.actionRect)}
              type="button"
            >
              <span className="kronosWidgetAccessibleText">{presentation.label}</span>
            </button>
          </span>
        );
      })}
      {visibleStyleSlots.map(({ slot, attackSet }) => {
        const presentation = kronosCombatStylePresentation(weaponType, slot, attackSet);
        return (
          <KronosCombatText
            className="kronosCombatStyleText"
            clientFonts={clientFonts}
            dataAttributes={{
              "data-combat-text-kind": "attack-style",
              "data-slot-index": slot.index,
              "data-attack-set-child-id": attackSet.child,
              "data-attack-type": attackSet.type,
              "data-attack-style": attackSet.style,
              "data-source-graphic": presentation.sourceGraphic
            }}
            key={`${slot.text.childId}:${attackSet.child}`}
            spriteAtlases={spriteAtlases}
            text={presentation.label}
            textLayout={slot.text}
          />
        );
      })}
      {weaponType && combatInterfaceSetupStaffConfigs.has(weaponType.config)
        ? visibleAutocastControls.map((control) => {
            const selected = hud.autocast === combatIceBarrageAutocastSlot && hud.defensiveCast === control.defensive;
            return (
              <span className="kronosCombatAutocastControl" key={`${control.id}:${control.childId}`}>
                {clientAtlas ? (
                  <KronosCombatSourceSprite
                    atlas={clientAtlas}
                    className="kronosCombatButtonSprite kronosCombatAutocastButtonSprite"
                    rect={control.rect}
                    spriteId={selected ? combatStyleButtonSelectedSpriteId : combatStyleButtonSpriteId}
                  />
                ) : null}
                {clientAtlas && control.magicIconSpriteId !== null && control.magicIconRect !== null ? (
                  <KronosCombatSourceSprite
                    atlas={clientAtlas}
                    className="kronosCombatAutocastIconSprite kronosCombatAutocastMagicIconSprite"
                    rect={control.magicIconRect}
                    spriteId={control.magicIconSpriteId}
                  />
                ) : null}
                {clientAtlas && control.defensiveIconSpriteId !== null && control.defensiveIconRect !== null ? (
                  <KronosCombatSourceSprite
                    atlas={clientAtlas}
                    className="kronosCombatAutocastIconSprite kronosCombatAutocastDefensiveIconSprite"
                    rect={control.defensiveIconRect}
                    spriteId={control.defensiveIconSpriteId}
                  />
                ) : null}
                {control.label ? (
                  <KronosCombatText
                    className="kronosCombatAutocastText"
                    clientFonts={clientFonts}
                    dataAttributes={{
                      "data-combat-text-kind": "autocast",
                      "data-autocast-control-id": control.id,
                      "data-autocast-slot": combatIceBarrageAutocastSlot
                    }}
                    spriteAtlases={spriteAtlases}
                    text="Spell"
                    textLayout={control.label}
                  />
                ) : null}
                <button
                  aria-label={`${control.defensive ? "Defensive" : "Standard"} autocast Ice Barrage`}
                  aria-pressed={selected}
                  className="kronosCombatAutocastSource"
                  data-action-child-id={control.childId}
                  data-action-text={control.actionText}
                  data-action-widget-id={control.widgetId}
                  data-autocast-slot={combatIceBarrageAutocastSlot}
                  data-autocast-spell-id="ice-barrage"
                  data-autocast-spell-name="Ice Barrage"
                  data-defensive-cast={String(control.defensive)}
                  data-defensive-icon-child-id={control.defensiveIconChildId ?? ""}
                  data-defensive-icon-sprite-id={control.defensiveIconSpriteId ?? ""}
                  data-defensive-icon-widget-id={control.defensiveIconWidgetId ?? ""}
                  data-display-child-id={control.displayChildId ?? ""}
                  data-display-widget-id={control.displayWidgetId ?? ""}
                  data-magic-icon-child-id={control.magicIconChildId ?? ""}
                  data-magic-icon-sprite-id={control.magicIconSpriteId ?? ""}
                  data-magic-icon-widget-id={control.magicIconWidgetId ?? ""}
                  data-selected={selected ? "true" : "false"}
                  data-source-action-count={control.actions.length}
                  data-source-handler="TabCombat.openAutocast/selectAutocast"
                  data-weapon-type={weaponType.id}
                  data-weapon-type-config={weaponType.config}
                  onPointerDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    onAutocastDefaultAction?.({
                      control,
                      actionText: control.actionText || kronosSourceActionText(control.actions),
                      autocastSlot: combatIceBarrageAutocastSlot,
                      spellId: "ice-barrage",
                      spellName: "Ice Barrage",
                      defensive: control.defensive,
                      position: runtimeViewportPointerPosition(event)
                    });
                  }}
                  style={rectStyle(control.rect)}
                  type="button"
                >
                  <span className="kronosWidgetAccessibleText">Ice Barrage</span>
                </button>
              </span>
            );
          })
        : null}
      {combatInterfacePanel.specialBar && weaponHasCombatTabSpecialBar ? (
        <KronosCombatSpecialBar
          clientFonts={clientFonts}
          drawSpecbarAnyway={false}
          hud={hud}
          onDefaultAction={onSpecialDefaultAction}
          specialActionAvailable={weaponHasCombatTabSpecialBar}
          specialBar={combatInterfacePanel.specialBar}
          spriteAtlases={spriteAtlases}
          weaponDefinition={weaponDefinition}
          weaponItemId={weaponItemId}
          weaponName={weaponName}
        />
      ) : null}
      {autoRetaliate && !hideAutoRetaliate ? (
        <span className="kronosCombatAutoRetaliateControl">
          {clientAtlas ? (
            <KronosCombatSourceSprite
              atlas={clientAtlas}
              className="kronosCombatButtonSprite kronosCombatAutoRetaliateButtonSprite"
              rect={autoRetaliate.rect}
              spriteId={hud.autoRetaliate === true ? combatAutoRetaliateButtonSelectedSpriteId : combatAutoRetaliateButtonSpriteId}
            />
          ) : null}
          <button
            aria-label={autoRetaliate.actionText || "Auto retaliate"}
            aria-pressed={hud.autoRetaliate === true}
            className="kronosCombatAutoRetaliateSource"
            data-action-child-id={autoRetaliate.childId}
            data-action-text={autoRetaliate.actionText}
            data-action-widget-id={autoRetaliate.widgetId}
            data-auto-retaliate-enabled={hud.autoRetaliate === undefined ? "" : String(hud.autoRetaliate)}
            data-auto-retaliate-varp-id={combatAutoRetaliateVarpId}
            data-button-sprite-id={hud.autoRetaliate === true ? combatAutoRetaliateButtonSelectedSpriteId : combatAutoRetaliateButtonSpriteId}
            data-source-action-count={autoRetaliate.actions.length}
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              onAutoRetaliateDefaultAction?.({
                control: autoRetaliate,
                actionText: autoRetaliate.actionText || kronosSourceActionText(autoRetaliate.actions),
                autoRetaliateVarpId: combatAutoRetaliateVarpId,
                enabled: hud.autoRetaliate,
                position: runtimeViewportPointerPosition(event)
              });
            }}
            style={rectStyle(autoRetaliate.rect)}
            type="button"
          >
            <span className="kronosWidgetAccessibleText">{autoRetaliate.actionText || "Auto retaliate"}</span>
          </button>
        </span>
      ) : null}
    </div>
  );
}

function KronosCombatText({
  className,
  clientFonts,
  dataAttributes,
  spriteAtlases,
  text,
  textLayout
}: {
  readonly className: string;
  readonly clientFonts: KronosClientFontStore;
  readonly dataAttributes?: Record<string, string | number>;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
  readonly text: string;
  readonly textLayout: KronosCombatTextLayout;
}): JSX.Element {
  const font = kronosClientFontDefinitionById(clientFonts, textLayout.fontId);
  const atlas = font ? spriteAtlases.get(font.sheetId as RuntimeSpriteSheetId) : undefined;
  const glyphCount = font && atlas ? glyphCountForText(font, atlas, text) : 0;

  return (
    <span
      className={className}
      data-child-id={textLayout.childId}
      data-font-id={textLayout.fontId ?? ""}
      data-glyph-count={glyphCount}
      data-line-height={textLayout.lineHeight ?? ""}
      data-source-font-archive={font?.fontArchiveName ?? ""}
      data-source-glyph-atlas={font?.sheetId ?? ""}
      data-text-color={textLayout.textColor ?? ""}
      data-text-shadowed={textLayout.textShadowed === undefined ? "" : String(textLayout.textShadowed)}
      data-widget-id={textLayout.widgetId}
      data-x-text-alignment={textLayout.xTextAlignment ?? ""}
      data-y-text-alignment={textLayout.yTextAlignment ?? ""}
      style={rectStyle(textLayout.rect)}
      {...dataAttributes}
    >
      {font && atlas ? (
        <KronosSourceGlyphText
          atlas={atlas}
          color={cssRgbColor(textLayout.textColor, 0xff981f)}
          font={font}
          height={textLayout.rect.height}
          lineHeight={textLayout.lineHeight}
          shadowColor={textLayout.textShadowed === false ? null : "#000000"}
          text={text}
          width={textLayout.rect.width}
          xTextAlignment={textLayout.xTextAlignment}
          yTextAlignment={textLayout.yTextAlignment}
        />
      ) : (
        <span className="kronosWidgetAccessibleText" data-source-glyph-missing="true">
          {text}
        </span>
      )}
    </span>
  );
}

function KronosCombatSourceSprite({
  atlas,
  className,
  dataAttributes,
  rect,
  spriteAlias,
  spriteId
}: {
  readonly atlas: KronosHudAtlas;
  readonly className: string;
  readonly dataAttributes?: Record<string, string | number>;
  readonly rect: KronosRect;
  readonly spriteAlias?: string;
  readonly spriteId: number;
}): JSX.Element | null {
  const sprite = spriteAlias ? findSprite(atlas, spriteAlias) : findSpriteById(atlas, spriteId);
  if (!sprite) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className={className}
      data-source-sprite-alias={spriteAlias ?? ""}
      data-source-sprite-height={sprite.height}
      data-source-sprite-id={sprite.spriteId}
      data-source-sprite-max-height={sprite.maxHeight}
      data-source-sprite-max-width={sprite.maxWidth}
      data-source-sprite-offset-x={sprite.offsetX}
      data-source-sprite-offset-y={sprite.offsetY}
      data-source-sprite-width={sprite.width}
      style={combatSourceSpriteContainerStyle(rect)}
      {...dataAttributes}
    >
      <span className="kronosCombatSourceSpriteFrame" style={spriteStyle(atlas, sprite)} />
    </span>
  );
}

function KronosCombatOptionsButtonBackground({
  atlas,
  className,
  dataAttributes,
  rect,
  selected
}: {
  readonly atlas: KronosHudAtlas;
  readonly className: string;
  readonly dataAttributes?: Record<string, string | number>;
  readonly rect: KronosRect;
  readonly selected: boolean;
}): JSX.Element | null {
  return (
    <KronosCombatSlicedStyleButtonBackground
      atlas={atlas}
      className={className}
      dataAttributes={dataAttributes}
      rect={rect}
      spriteId={selected ? combatStyleButtonSelectedSpriteId : combatStyleButtonSpriteId}
    />
  );
}

function KronosCombatSlicedStyleButtonBackground({
  atlas,
  className,
  dataAttributes,
  rect,
  spriteId
}: {
  readonly atlas: KronosHudAtlas;
  readonly className: string;
  readonly dataAttributes?: Record<string, string | number>;
  readonly rect: KronosRect;
  readonly spriteId: number;
}): JSX.Element | null {
  const sprite = findSpriteById(atlas, spriteId);
  if (!sprite) {
    return null;
  }

  const pieces = kronosCombatOptionsButtonFramePieces(rect);
  return (
    <span
      aria-hidden="true"
      className={`${className} kronosCombatOptionsButtonFrame`}
      data-options-button-piece-count={pieces.length}
      data-options-button-proc={spriteId === combatStyleButtonSelectedSpriteId ? "options_button_on" : "options_button_off"}
      data-options-button-source="combat_style_button_sliced"
      data-options-button-state={spriteId === combatStyleButtonSelectedSpriteId ? "on" : "off"}
      data-source-sprite-height={sprite.height}
      data-source-sprite-id={sprite.spriteId}
      data-source-sprite-max-height={sprite.maxHeight}
      data-source-sprite-max-width={sprite.maxWidth}
      data-source-sprite-offset-x={sprite.offsetX}
      data-source-sprite-offset-y={sprite.offsetY}
      data-source-sprite-width={sprite.width}
      style={{ ...rectStyle(rect), overflow: "hidden" }}
      {...dataAttributes}
    >
      {pieces.map((piece) => (
        <KronosCombatSlicedStyleButtonFramePiece
          atlas={atlas}
          key={piece.key}
          piece={piece}
          sourceRect={kronosCombatStyleButtonSourcePieceRect(sprite, piece.key)}
          sprite={sprite}
        />
      ))}
    </span>
  );
}

function KronosCombatSlicedStyleButtonFramePiece({
  atlas,
  piece,
  sourceRect,
  sprite
}: {
  readonly atlas: KronosHudAtlas;
  readonly piece: KronosCombatOptionsButtonFramePieceLayout;
  readonly sourceRect: KronosRect;
  readonly sprite: KronosHudSprite;
}): JSX.Element | null {
  if (piece.rect.width <= 0 || piece.rect.height <= 0 || sourceRect.width <= 0 || sourceRect.height <= 0) {
    return null;
  }

  const repeatX = piece.tileX ? Math.ceil(piece.rect.width / Math.max(1, sourceRect.width)) : 1;
  const repeatY = piece.tileY ? Math.ceil(piece.rect.height / Math.max(1, sourceRect.height)) : 1;
  const tiles: JSX.Element[] = [];
  for (let tileY = 0; tileY < repeatY; tileY += 1) {
    for (let tileX = 0; tileX < repeatX; tileX += 1) {
      tiles.push(
        <span
          aria-hidden="true"
          className="kronosCombatOptionsButtonTile"
          key={`${tileX}:${tileY}`}
          style={combatSlicedSpriteTileStyle(atlas, sprite, sourceRect, tileX * sourceRect.width, tileY * sourceRect.height)}
        />
      );
    }
  }

  return (
    <span
      aria-hidden="true"
      className="kronosCombatOptionsButtonPiece"
      data-options-button-piece={piece.key}
      data-source-sprite-id={sprite.spriteId}
      data-source-sprite-slice-height={sourceRect.height}
      data-source-sprite-slice-width={sourceRect.width}
      style={combatOptionsButtonPieceStyle(piece.rect)}
    >
      {tiles}
    </span>
  );
}

function KronosCombatSpecialBar({
  clientFonts,
  drawSpecbarAnyway,
  hud,
  onDefaultAction,
  specialActionAvailable,
  specialBar,
  spriteAtlases,
  weaponDefinition,
  weaponItemId,
  weaponName
}: {
  readonly clientFonts: KronosClientFontStore;
  readonly drawSpecbarAnyway: boolean;
  readonly hud: RuntimeHudState;
  readonly onDefaultAction: ((command: KronosCombatSpecialCommand) => void) | undefined;
  readonly specialActionAvailable: boolean;
  readonly specialBar: KronosCombatSpecialBarLayout;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
  readonly weaponDefinition: KronosInventoryEquipmentDefinition | undefined;
  readonly weaponItemId: number | null;
  readonly weaponName: string;
}): JSX.Element {
  const energy = normalizeSpecialEnergy(hud.specialEnergy);
  const drainPercent = normalizeSpecialDrainPercent(weaponDefinition?.specialAttack?.drainPercent ?? 0);
  const drainSource = weaponDefinition?.specialAttack?.source ?? "";
  const specialActive = hud.specialActive === true;
  const specialAvailable = specialActionAvailable;
  const specialUsable = specialAvailable && (drainPercent <= 0 || energy >= drainPercent);
  const fillWidth = kronosCombatSpecialFillWidth(energy, specialBar.containerRect.width);
  const fillColor = drainPercent > 0 && energy < drainPercent ? 12907 : specialBar.fillColor ?? undefined;
  const textColor = specialActive ? 16776960 : 16;
  const text = `Special Attack: ${energy}%`;
  const clientAtlas = spriteAtlases.get("client_ui");
  const textLayout = {
    widgetId: specialBar.text?.widgetId ?? specialBar.actionWidgetId,
    childId: specialBar.text?.childId ?? specialBar.actionChildId,
    rect: {
      x: 0,
      y: 0,
      width: specialBar.containerRect.width,
      height: specialBar.containerRect.height
    },
    fontId: specialBar.text?.fontId ?? 494,
    lineHeight: specialBar.text?.lineHeight,
    xTextAlignment: specialBar.text?.xTextAlignment ?? 1,
    yTextAlignment: specialBar.text?.yTextAlignment ?? 1,
    textShadowed: specialBar.text?.textShadowed ?? false,
    textColor
  };

  return (
    <button
      aria-label={stripKronosTags(specialBar.actionText) || text}
      aria-pressed={specialActive}
      className="kronosCombatSpecialBar"
      data-action-child-id={specialBar.actionChildId}
      data-action-text={specialBar.actionText}
      data-action-widget-id={specialBar.actionWidgetId}
      data-background-child-id={specialBar.backgroundChildId ?? ""}
      data-background-color={specialBar.backgroundColor ?? ""}
      data-background-widget-id={specialBar.backgroundWidgetId ?? ""}
      data-border-child-id={specialBar.borderChildId ?? ""}
      data-border-color={specialBar.borderColor ?? ""}
      data-border-widget-id={specialBar.borderWidgetId ?? ""}
      data-draw-specbar-anyway={String(drawSpecbarAnyway)}
      data-source-script-callback={drawSpecbarAnyway ? "SpecBarPlugin.onScriptCallbackEvent drawSpecbarAnyway -> intStack[iStackSize - 1] = 1" : ""}
      data-button-sprite-id={combatSpecialAttackButtonSpriteId}
      data-fill-child-id={specialBar.fillChildId ?? ""}
      data-fill-color={fillColor ?? ""}
      data-fill-pixels={fillWidth}
      data-fill-widget-id={specialBar.fillWidgetId ?? ""}
      data-special-active={String(specialActive)}
      data-special-active-varp-id={combatSpecialActiveVarpId}
      data-special-available={String(specialAvailable)}
      data-special-drain-percent={drainPercent}
      data-special-drain-source={drainSource}
      data-special-energy={energy}
      data-special-energy-varp-id={combatSpecialEnergyVarpId}
      data-special-usable={String(specialUsable)}
      data-source-action-count={specialBar.actions.length}
      data-varp-id={combatSpecialEnergyVarpId}
      data-weapon-item-id={weaponItemId ?? ""}
      data-weapon-name={weaponName}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onDefaultAction?.({
          sourceControl: "combat-tab",
          specialBar,
          actionText: specialBar.actionText || kronosSourceActionText(specialBar.actions),
          specialEnergyVarpId: combatSpecialEnergyVarpId,
          specialActiveVarpId: combatSpecialActiveVarpId,
          specialActive,
          specialAvailable,
          specialEnergy: energy,
          specialDrainPercent: drainPercent,
          specialDrainSource: drainSource,
          weaponItemId,
          weaponName,
          position: runtimeViewportPointerPosition(event)
        });
      }}
      style={{
        ...rectStyle(specialBar.containerRect),
        backgroundColor: "transparent"
      }}
      type="button"
    >
      {clientAtlas ? (
        <KronosCombatSourceSprite
          atlas={clientAtlas}
          className="kronosCombatButtonSprite kronosCombatSpecialButtonSprite"
          rect={{ x: 0, y: 0, width: specialBar.containerRect.width, height: specialBar.containerRect.height }}
          spriteId={combatSpecialAttackButtonSpriteId}
        />
      ) : null}
      <span
        className="kronosCombatSpecialBarBackground"
        style={{
          backgroundColor: cssRgbColor(specialBar.backgroundColor ?? undefined, 0x730606),
          left: 2,
          top: 7,
          width: Math.max(0, specialBar.containerRect.width - 4),
          height: 12
        }}
      />
      <span
        className="kronosCombatSpecialBarFill"
        style={{
          backgroundColor: cssRgbColor(fillColor, 0x397d3b),
          left: 2,
          top: 7,
          width: fillWidth,
          height: 12
        }}
      />
      <KronosCombatText
        className="kronosCombatSpecialText"
        clientFonts={clientFonts}
        dataAttributes={{
          "data-combat-text-kind": "special-attack",
          "data-special-active": String(specialActive),
          "data-special-energy": energy
        }}
        spriteAtlases={spriteAtlases}
        text={text}
        textLayout={textLayout}
      />
    </button>
  );
}

function combatStyleSlots(
  panel: KronosCombatPanelLayout,
  weaponType: KronosWeaponTypeDefinition | null
): readonly {
  readonly slot: KronosCombatStyleSlotLayout;
  readonly attackSet: KronosWeaponAttackSetDefinition;
}[] {
  if (!weaponType) {
    return [];
  }

  return panel.styleSlots.flatMap((slot) => {
    const attackSet = weaponType.attackSets[slot.index];
    return attackSet ? [{ slot, attackSet }] : [];
  });
}

function kronosCombatInterfaceSetupLayout(
  panel: KronosCombatPanelLayout,
  weaponType: KronosWeaponTypeDefinition | null
): KronosCombatPanelLayout {
  if (!weaponType) {
    return panel;
  }

  // Source: [clientscript,combat_interface_setup].cs2, which lays out style buttons by visible graphic order.
  if (!combatInterfaceSetupStaffConfigs.has(weaponType.config)) {
    return {
      ...panel,
      styleSlots: kronosCombatInterfaceSetupDefaultStyleSlots(panel, weaponType),
      autocastControls: [],
      autoRetaliate: panel.autoRetaliate ? kronosCombatInterfaceSetupDefaultAutoRetaliate(panel.rect, panel.autoRetaliate) : null,
      specialBar: panel.specialBar ? kronosCombatInterfaceSetupDefaultSpecialBar(panel.rect, panel.specialBar) : null
    };
  }

  return {
    ...panel,
    styleSlots: kronosCombatInterfaceSetupStaffStyleSlots(panel, weaponType),
    autocastControls: kronosCombatInterfaceSetupStaffAutocastControls(panel.rect, panel.autocastControls),
    autoRetaliate: panel.autoRetaliate ? kronosCombatInterfaceSetupStaffAutoRetaliate(panel.rect, panel.autoRetaliate) : null,
    specialBar: panel.specialBar ? kronosCombatInterfaceSetupStaffSpecialBar(panel.rect, panel.specialBar) : null
  };
}

function kronosCombatInterfaceSetupDefaultStyleSlots(
  panel: KronosCombatPanelLayout,
  weaponType: KronosWeaponTypeDefinition
): readonly KronosCombatStyleSlotLayout[] {
  let visibleOrder = 0;

  return panel.styleSlots.map((slot) => {
    if (!weaponType.attackSets[slot.index]) {
      return slot;
    }

    const actionRect = kronosCombatInterfaceSetupDefaultStyleRect(panel.rect, visibleOrder);
    visibleOrder += 1;

    return {
      ...slot,
      actionRect,
      iconRect: slot.iconRect ? kronosCombatInterfaceSetupDefaultIconRect(actionRect, slot) : null,
      text: {
        ...slot.text,
        rect: kronosCombatInterfaceSetupCenteredRect(actionRect, slot.text.rect.width, slot.text.rect.height, 0, 13)
      }
    };
  });
}

function kronosCombatInterfaceSetupDefaultStyleRect(origin: KronosRect, visibleOrder: number): KronosRect {
  const layout = combatInterfaceSetupDefaultLayout;
  const column = visibleOrder % 2;
  const row = Math.trunc(visibleOrder / 2);
  return {
    x: origin.x + layout.x + column * (layout.slotWidth + layout.slotColumnGap),
    y: origin.y + layout.y + row * (layout.slotHeight + layout.slotRowGap),
    width: layout.slotWidth,
    height: layout.slotHeight
  };
}

function kronosCombatInterfaceSetupDefaultIconRect(
  actionRect: KronosRect,
  slot: KronosCombatStyleSlotLayout
): KronosRect {
  const width = slot.iconRect?.width ?? 34;
  const height = slot.iconRect?.height ?? 24;
  return kronosCombatInterfaceSetupCenteredRect(actionRect, width, height, 0, -6);
}

function kronosCombatInterfaceSetupDefaultAutoRetaliate(
  origin: KronosRect,
  autoRetaliate: KronosCombatAutoRetaliateLayout
): KronosCombatAutoRetaliateLayout {
  const layout = combatInterfaceSetupDefaultLayout;
  return {
    ...autoRetaliate,
    rect: {
      x: origin.x + layout.x,
      y: origin.y + layout.y + 2 * (layout.slotHeight + layout.slotRowGap),
      width: layout.slotColumnGap + 2 * layout.slotWidth,
      height: layout.autoRetaliateHeight
    }
  };
}

function kronosCombatInterfaceSetupDefaultSpecialBar(
  origin: KronosRect,
  specialBar: KronosCombatSpecialBarLayout
): KronosCombatSpecialBarLayout {
  const layout = combatInterfaceSetupDefaultLayout;
  return {
    ...specialBar,
    containerRect: {
      x: origin.x + layout.x,
      y: origin.y + layout.y + 2 * (layout.slotHeight + layout.slotRowGap) + layout.autoRetaliateHeight + layout.specialGap,
      width: layout.slotColumnGap + 2 * layout.slotWidth,
      height: layout.specialHeight
    }
  };
}

function kronosCombatInterfaceSetupStaffStyleSlots(
  panel: KronosCombatPanelLayout,
  weaponType: KronosWeaponTypeDefinition
): readonly KronosCombatStyleSlotLayout[] {
  let visibleOrder = 0;

  return panel.styleSlots.map((slot) => {
    if (!weaponType.attackSets[slot.index]) {
      return slot;
    }

    const actionRect = kronosCombatInterfaceSetupStaffStyleRect(panel.rect, visibleOrder);
    visibleOrder += 1;

    return {
      ...slot,
      actionRect,
      iconRect: slot.iconRect ? kronosCombatInterfaceSetupStaffIconRect(actionRect, slot) : null,
      text: {
        ...slot.text,
        rect: kronosCombatInterfaceSetupCenteredRect(actionRect, slot.text.rect.width, slot.text.rect.height, 0, 10)
      }
    };
  });
}

function kronosCombatInterfaceSetupStaffStyleRect(origin: KronosRect, visibleOrder: number): KronosRect {
  const layout = combatInterfaceSetupWandLayout;
  return {
    x: origin.x + layout.x,
    y: origin.y + layout.y + visibleOrder * (layout.slotHeight + layout.slotGap),
    width: layout.slotWidth,
    height: layout.slotHeight
  };
}

function kronosCombatInterfaceSetupStaffIconRect(
  actionRect: KronosRect,
  slot: KronosCombatStyleSlotLayout
): KronosRect {
  const width = slot.iconChildId === 6 ? 33 : slot.iconRect?.width ?? 34;
  const height = slot.iconChildId === 6 ? 23 : slot.iconRect?.height ?? 24;
  return kronosCombatInterfaceSetupCenteredRect(actionRect, width, height, 0, -1);
}

function kronosCombatInterfaceSetupStaffAutocastControls(
  origin: KronosRect,
  controls: readonly KronosCombatAutocastControlLayout[]
): readonly KronosCombatAutocastControlLayout[] {
  return controls.map((control) => {
    const rect = kronosCombatInterfaceSetupStaffAutocastRect(origin, control.defensive);
    return {
      ...control,
      rect,
      displayRect: control.displayRect ? rect : null,
      magicIconRect: control.magicIconRect
        ? kronosCombatInterfaceSetupCenteredRect(
            rect,
            control.magicIconRect.width,
            control.magicIconRect.height,
            control.defensive ? 14 : 1,
            control.defensive ? -7 : -3
          )
        : null,
      defensiveIconRect:
        control.defensive && control.defensiveIconRect
          ? kronosCombatInterfaceSetupCenteredRect(rect, control.defensiveIconRect.width, control.defensiveIconRect.height, -16, 0)
          : control.defensiveIconRect,
      label: control.label
        ? {
            ...control.label,
            rect: kronosCombatInterfaceSetupCenteredRect(rect, rect.width, control.label.rect.height, 0, 15)
          }
        : null
    };
  });
}

function kronosCombatInterfaceSetupStaffAutocastRect(origin: KronosRect, defensive: boolean): KronosRect {
  const layout = combatInterfaceSetupWandLayout;
  const x = origin.x + layout.x + layout.slotWidth + layout.autocastGap;
  return {
    x,
    y: origin.y + layout.y + (defensive ? 0 : layout.autocastHeight - layout.autocastControlHeight),
    width: layout.slotWidth,
    height: layout.autocastControlHeight
  };
}

function kronosCombatInterfaceSetupStaffAutoRetaliate(
  origin: KronosRect,
  autoRetaliate: KronosCombatAutoRetaliateLayout
): KronosCombatAutoRetaliateLayout {
  const layout = combatInterfaceSetupWandLayout;
  return {
    ...autoRetaliate,
    rect: {
      x: origin.x + layout.x,
      y: origin.y + layout.y + 3 * (layout.slotHeight + layout.slotGap),
      width: layout.autocastGap + 2 * layout.slotWidth,
      height: layout.autoRetaliateHeight
    }
  };
}

function kronosCombatInterfaceSetupStaffSpecialBar(
  origin: KronosRect,
  specialBar: KronosCombatSpecialBarLayout
): KronosCombatSpecialBarLayout {
  const layout = combatInterfaceSetupWandLayout;
  return {
    ...specialBar,
    containerRect: {
      x: origin.x + layout.x,
      y: origin.y + layout.y + 3 * (layout.slotHeight + layout.slotGap) + layout.autoRetaliateHeight + layout.specialGap,
      width: layout.autocastGap + 2 * layout.slotWidth,
      height: layout.specialHeight
    }
  };
}

function kronosCombatInterfaceSetupCenteredRect(
  parent: KronosRect,
  width: number,
  height: number,
  xOffset: number,
  yOffset: number
): KronosRect {
  return {
    x: parent.x + Math.trunc((parent.width - width) / 2) + xOffset,
    y: parent.y + Math.trunc((parent.height - height) / 2) + yOffset,
    width,
    height
  };
}

function kronosCombatStylePresentation(
  weaponType: KronosWeaponTypeDefinition | null,
  slot: KronosCombatStyleSlotLayout,
  attackSet: KronosWeaponAttackSetDefinition
): {
  readonly label: string;
  readonly iconSpriteAlias: string | null;
  readonly iconSpriteId: number | null;
  readonly iconSpriteSource: string;
  readonly sourceGraphic: string;
} {
  const sourcePresentation = kronosCombatInterfaceSetupPresentation(weaponType?.config, slot.index);
  return {
    label: sourcePresentation?.label ?? kronosAttackTypeLabel(attackSet.type),
    iconSpriteAlias: sourcePresentation?.spriteAlias ?? null,
    iconSpriteId: slot.iconSpriteId ?? kronosCombatStyleFallbackIconSpriteId(attackSet),
    iconSpriteSource: sourcePresentation
      ? "client-script-graphic"
      : slot.iconSpriteId === null
        ? "runelite-attackstyle-skill"
        : "widget",
    sourceGraphic: sourcePresentation?.graphic ?? ""
  };
}

function kronosCombatInterfaceSetupPresentation(
  weaponTypeConfig: number | undefined,
  slotIndex: number
): { readonly label: string; readonly graphic: string; readonly spriteAlias: string } | null {
  if (weaponTypeConfig === undefined) {
    return null;
  }

  // Source: [clientscript,combat_interface_setup].cs2 %varbit357 branches.
  return combatInterfaceSetupPresentationByConfig[weaponTypeConfig]?.[slotIndex] ?? null;
}

function kronosCombatStyleFallbackIconSpriteId(attackSet: KronosWeaponAttackSetDefinition): number | null {
  if (attackSet.style === "MAGIC" || attackSet.style === "MAGICAL_MELEE" || attackSet.style === "MAGICAL_RANGED") {
    return combatSkillMagicSpriteId;
  }

  switch (attackSet.type) {
    case "ACCURATE":
      return combatSkillAttackSpriteId;
    case "AGGRESSIVE":
      return combatSkillStrengthSpriteId;
    case "DEFENSIVE":
      return combatSkillDefenceSpriteId;
    case "CONTROLLED":
      return combatSkillAttackSpriteId;
    case "RAPID_RANGED":
    case "LONG_RANGED":
      return combatSkillRangedSpriteId;
  }
}

function kronosCombatStyleHiddenByRuneliteAttackStyles(
  weaponType: KronosWeaponTypeDefinition | null,
  attackSetIndex: number,
  config: RuneliteAttackStylesConfigSnapshot | null
): boolean {
  if (!weaponType || !config?.enabled || !config.removeWarnedStyles) {
    return false;
  }

  const style = runeliteAttackStyleForWeapon(weaponType.config, attackSetIndex, false);
  return style ? runeliteAttackStyleIsWarned(style, config) : false;
}

function kronosAutocastControlHiddenByRuneliteAttackStyles(
  weaponType: KronosWeaponTypeDefinition | null,
  control: KronosCombatAutocastControlLayout,
  config: RuneliteAttackStylesConfigSnapshot | null
): boolean {
  if (!weaponType || !config?.enabled || !config.removeWarnedStyles) {
    return false;
  }

  const attackSetIndex = control.defensive ? 5 : 4;
  const style = runeliteAttackStyleForWeapon(weaponType.config, attackSetIndex, control.defensive);
  return style ? runeliteAttackStyleIsWarned(style, config) : false;
}

function normalizeSpecialEnergy(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.trunc(value)));
}

function normalizeSpecialDrainPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.trunc(value)));
}

function kronosComponentOpacityFromTransparency(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(1, (256 - Math.trunc(value)) / 256));
}

function normalizeCombatAttackSetIndex(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.trunc(value));
}

function kronosSourceActionText(actions: readonly string[]): string {
  return actions.find((action) => action && action !== "*") ?? actions[0] ?? "*";
}

function stripKronosTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function kronosNoticeboardTextByChildId(snapshot: RuntimeSceneSnapshot): ReadonlyMap<number, string> {
  const playerCount = Math.max(1, snapshot.actors.length);
  const green = (value: string | number): string => `${kronosNoticeboardGreenTag}${value}${kronosNoticeboardCloseTag}`;
  const red = (value: string): string => `${kronosNoticeboardRedTag}${value}${kronosNoticeboardCloseTag}`;
  return new Map<number, string>([
    [8, `Players Online: ${green(playerCount)}`],
    [9, `Online Staff: ${green(0)}`],
    [10, `Players in Wild: ${green(0)}`],
    [11, `Players in Tournament: ${green(0)}`],
    [12, `Server Uptime: ${green("0 seconds")}`],
    [43, `XP Bonus: ${green(1)}`],
    [44, `Double Drops: ${red("Disabled")}`],
    [45, `Double PK Points: ${red("Disabled")}`],
    [46, `Double Slayer Points: ${red("Disabled")}`],
    [47, `Double Pest Control: ${red("Disabled")}`],
    [14, red("Two-factor authentication")],
    [15, `Time Played: ${green("0 seconds")}`],
    [17, `Base XP: ${green(1)}`],
    [18, `Double Drop Chance: ${green("0%")}`],
    [49, `PVM Points: ${green(0)}`],
    [50, "Achievements"],
    [51, "Drop Tables"],
    [52, "Settings"],
    [19, "Website"],
    [20, "Community"],
    [21, "Discord"]
  ]);
}

function kronosResolvedWidgetWithText(widget: KronosResolvedWidget, text: string): KronosResolvedWidget {
  return {
    ...widget,
    widget: {
      ...widget.widget,
      text
    }
  };
}

function kronosResolvedWidgetWithTextColor(widget: KronosResolvedWidget, text: string, textColor: number): KronosResolvedWidget {
  return {
    ...widget,
    widget: {
      ...widget.widget,
      text,
      textColor
    }
  };
}

function kronosClanChatWorldLeft(rowWidth: number): number {
  return Math.max(84, rowWidth - 58);
}

function kronosEmoteButtonRect(index: number): KronosRect {
  return {
    x: (index % kronosEmoteColumns) * kronosEmoteButtonStep.width,
    y: Math.trunc(index / kronosEmoteColumns) * kronosEmoteButtonStep.height + kronosEmoteFirstRowOffsetY,
    width: kronosEmoteButtonSize.width,
    height: kronosEmoteButtonSize.height
  };
}

function kronosEmoteSpriteStyle(sprite: KronosHudSprite, rect: KronosRect): CSSProperties {
  const maxWidth = positiveInteger(sprite.maxWidth, sprite.width);
  const maxHeight = positiveInteger(sprite.maxHeight, sprite.height);
  const scaleX = rect.width / maxWidth;
  const scaleY = rect.height / maxHeight;
  return {
    left: rect.x + sprite.offsetX * scaleX,
    top: rect.y + sprite.offsetY * scaleY,
    width: sprite.width * scaleX,
    height: sprite.height * scaleY
  };
}

function kronosEmoteSpriteImageStyle(atlas: KronosHudAtlas, sprite: KronosHudSprite, rect: KronosRect): CSSProperties {
  const maxWidth = positiveInteger(sprite.maxWidth, sprite.width);
  const maxHeight = positiveInteger(sprite.maxHeight, sprite.height);
  const scaleX = rect.width / maxWidth;
  const scaleY = rect.height / maxHeight;
  return {
    left: -sprite.x * scaleX,
    top: -sprite.y * scaleY,
    width: atlas.metadata.width * scaleX,
    height: atlas.metadata.height * scaleY
  };
}

function kronosCombatSpecialFillWidth(energy: number, sourceWidth: number): number {
  const availableWidth = Math.max(0, Math.trunc(sourceWidth) - 4);
  return Math.trunc((normalizeSpecialEnergy(energy) * availableWidth) / 100);
}

function KronosStatsPanelLayer({
  atlas,
  clientFonts,
  hud,
  onDefaultAction,
  panel,
  spriteAtlases
}: {
  readonly atlas: KronosHudAtlas;
  readonly clientFonts: KronosClientFontStore;
  readonly hud: RuntimeHudState;
  readonly onDefaultAction: ((command: KronosStatsSkillCommand) => void) | undefined;
  readonly panel: KronosStatsPanelLayout | null;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
}): JSX.Element | null {
  if (!panel) {
    return null;
  }

  const leftTile = findSpriteById(atlas, statsTileHalfLeftSpriteId);
  const totalTextFontId = panel.totalLevel?.fontId ?? 494;
  const font = kronosClientFontDefinitionById(clientFonts, totalTextFontId);
  const fontAtlas = font ? spriteAtlases.get(font.sheetId as RuntimeSpriteSheetId) : undefined;
  const textColor = cssRgbColor(panel.totalLevel?.textColor, 0xffff00);
  const totalLevel = panel.slots
    .filter((slot) => isStatsEnabledSkill(slot))
    .reduce((sum, slot) => sum + skillStateForSlot(hud, slot).fixed, 0);

  return (
    <div className="kronosStatsPanelLayer" data-group-id={panel.groupId}>
      {panel.slots.map((slot) => {
        const state = skillStateForSlot(hud, slot);
        const boosted = state.current !== state.fixed;
        const rightTile = findSpriteById(
          atlas,
          boosted ? statsTileHalfRightWithSlashSpriteId : statsTileHalfRightSpriteId
        );
        const icon = findSpriteById(atlas, slot.spriteId);
        return (
          <Fragment key={slot.childId}>
            {leftTile ? (
              <span
                className="kronosStatsTileSprite kronosStatsTileSprite-left"
                data-source-client-script="stats_init"
                data-source-graphic="miscgraphics,4"
                data-sprite-id={statsTileHalfLeftSpriteId}
                data-skill-id={slot.id}
                style={statsTileSpriteStyle(atlas, leftTile, slot, "left")}
              />
            ) : null}
            {rightTile ? (
              <span
                className="kronosStatsTileSprite kronosStatsTileSprite-right"
                data-source-client-script="stats_init"
                data-source-graphic={boosted ? "miscgraphics,6" : "miscgraphics,5"}
                data-sprite-id={boosted ? statsTileHalfRightWithSlashSpriteId : statsTileHalfRightSpriteId}
                data-skill-id={slot.id}
                style={statsTileSpriteStyle(atlas, rightTile, slot, "right")}
              />
            ) : null}
            {icon ? (
              <span
                className="kronosStatsSkillIconSprite"
                data-source-client-script="stats_init"
                data-source-enum="enum_255"
                data-sprite-id={slot.spriteId}
                data-skill-id={slot.id}
                style={statsSkillIconSpriteStyle(atlas, icon, slot)}
              />
            ) : null}
            <KronosStatsLevelText
              atlas={fontAtlas}
              className="kronosStatsSkillLevelText kronosStatsSkillLevelText-current"
              color={textColor}
              font={font}
              kind="current"
              lineHeight={panel.totalLevel?.lineHeight}
              shadowed={panel.totalLevel?.textShadowed}
              slot={slot}
              text={String(state.current)}
              textColor={panel.totalLevel?.textColor}
              xTextAlignment={1}
              yTextAlignment={1}
            />
            <KronosStatsLevelText
              atlas={fontAtlas}
              className="kronosStatsSkillLevelText kronosStatsSkillLevelText-fixed"
              color={textColor}
              font={font}
              kind="fixed"
              lineHeight={panel.totalLevel?.lineHeight}
              shadowed={panel.totalLevel?.textShadowed}
              slot={slot}
              text={String(state.fixed)}
              textColor={panel.totalLevel?.textColor}
              xTextAlignment={1}
              yTextAlignment={1}
            />
            <button
              aria-label={`${slot.label}: ${state.current}/${state.fixed}`}
              className="kronosStatsSkillSlot"
              data-child-id={slot.childId}
              data-client-id={slot.clientId}
              data-current-level={state.current}
              data-fixed-level={state.fixed}
              data-grid-column={slot.gridColumn}
              data-grid-row={slot.gridRow}
              data-skill-id={slot.id}
              data-skill-label={slot.label}
              data-source-action-count={slot.actions.length}
              data-source-level-array-index={statsLevelArrayIndex(slot)}
              data-source-skill-enabled={String(isStatsEnabledSkill(slot))}
              data-source-order={slot.sourceOrder}
              data-sprite-id={slot.spriteId}
              data-widget-id={slot.widgetId}
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                onDefaultAction?.({
                  slot,
                  actionText: slot.actions.find((action) => action && action !== "*") ?? slot.actions[0] ?? "*",
                  position: runtimeViewportPointerPosition(event)
                });
              }}
              style={statsSkillButtonStyle(slot)}
              type="button"
            />
          </Fragment>
        );
      })}
      {panel.totalLevel ? (
        <KronosStatsTotalLevelText
          atlas={fontAtlas}
          color={textColor}
          font={font}
          text={String(totalLevel)}
          totalLevel={panel.totalLevel}
        />
      ) : null}
    </div>
  );
}

function KronosStatsLevelText({
  atlas,
  className,
  color,
  font,
  kind,
  lineHeight,
  shadowed,
  slot,
  text,
  textColor,
  xTextAlignment,
  yTextAlignment
}: {
  readonly atlas: KronosHudAtlas | undefined;
  readonly className: string;
  readonly color: string;
  readonly font: KronosClientFontDefinition | null;
  readonly kind: "current" | "fixed";
  readonly lineHeight: number | undefined;
  readonly shadowed: boolean | undefined;
  readonly slot: KronosStatsSkillSlotLayout;
  readonly text: string;
  readonly textColor: number | undefined;
  readonly xTextAlignment: number;
  readonly yTextAlignment: number;
}): JSX.Element {
  const glyphCount = font && atlas ? glyphCountForText(font, atlas, text) : 0;
  const rect = statsSkillLevelTextRect(slot, kind);
  return (
    <span
      className={className}
      data-font-id={font?.fontId ?? ""}
      data-glyph-count={glyphCount}
      data-level-kind={kind}
      data-line-height={lineHeight ?? ""}
      data-skill-id={slot.id}
      data-source-client-array={kind === "current" ? "currentLevels" : "levels"}
      data-source-cs1-opcode={kind === "current" ? statsCurrentLevelCs1Opcode : statsFixedLevelCs1Opcode}
      data-source-font-archive={font?.fontArchiveName ?? ""}
      data-source-glyph-atlas={font?.sheetId ?? ""}
      data-source-skill-array-index={statsLevelArrayIndex(slot)}
      data-source-skill-child-id={slot.childId}
      data-source-skill-client-id={slot.clientId}
      data-source-skill-widget-id={slot.widgetId}
      data-text-color={textColor ?? ""}
      data-text-shadowed={shadowed === undefined ? "" : String(shadowed)}
      data-x-text-alignment={xTextAlignment}
      data-y-text-alignment={yTextAlignment}
      style={{ ...rectStyle(rect), zIndex: 3 }}
    >
      {font && atlas ? (
        <KronosSourceGlyphText
          atlas={atlas}
          color={color}
          font={font}
          height={rect.height}
          lineHeight={lineHeight}
          shadowColor={shadowed === false ? null : "#000000"}
          text={text}
          width={rect.width}
          xTextAlignment={xTextAlignment}
          yTextAlignment={yTextAlignment}
        />
      ) : (
        <span className="kronosWidgetAccessibleText" data-source-glyph-missing="true">
          {text}
        </span>
      )}
    </span>
  );
}

function KronosStatsTotalLevelText({
  atlas,
  color,
  font,
  text,
  totalLevel
}: {
  readonly atlas: KronosHudAtlas | undefined;
  readonly color: string;
  readonly font: KronosClientFontDefinition | null;
  readonly text: string;
  readonly totalLevel: KronosStatsPanelLayout["totalLevel"];
}): JSX.Element | null {
  if (!totalLevel) {
    return null;
  }

  const glyphCount = font && atlas ? glyphCountForText(font, atlas, text) : 0;
  return (
    <span
      className="kronosStatsTotalLevelText"
      data-container-child-id={totalLevel.containerChildId}
      data-container-widget-id={totalLevel.containerWidgetId}
      data-font-id={totalLevel.fontId ?? ""}
      data-glyph-count={glyphCount}
      data-left-sprite-child-id={totalLevel.leftSpriteChildId}
      data-left-sprite-id={totalLevel.leftSpriteId}
      data-left-sprite-widget-id={totalLevel.leftSpriteWidgetId}
      data-line-height={totalLevel.lineHeight ?? ""}
      data-right-sprite-child-id={totalLevel.rightSpriteChildId}
      data-right-sprite-id={totalLevel.rightSpriteId}
      data-right-sprite-widget-id={totalLevel.rightSpriteWidgetId}
      data-source-action-count={totalLevel.actions.length}
      data-source-client-array="levels"
      data-source-cs1-opcode={statsTotalLevelCs1Opcode}
      data-source-enabled-skill-count={statsEnabledSkillCount}
      data-source-font-archive={font?.fontArchiveName ?? ""}
      data-source-glyph-atlas={font?.sheetId ?? ""}
      data-text-child-id={totalLevel.textChildId}
      data-text-color={totalLevel.textColor ?? ""}
      data-text-shadowed={totalLevel.textShadowed === undefined ? "" : String(totalLevel.textShadowed)}
      data-text-widget-id={totalLevel.textWidgetId}
      data-total-level={text}
      data-x-text-alignment={totalLevel.xTextAlignment ?? ""}
      data-y-text-alignment={totalLevel.yTextAlignment ?? ""}
      style={{ ...rectStyle(totalLevel.textRect), zIndex: 3 }}
    >
      {font && atlas ? (
        <KronosSourceGlyphText
          atlas={atlas}
          color={color}
          font={font}
          height={totalLevel.textRect.height}
          lineHeight={totalLevel.lineHeight}
          shadowColor={totalLevel.textShadowed === false ? null : "#000000"}
          text={text}
          width={totalLevel.textRect.width}
          xTextAlignment={totalLevel.xTextAlignment}
          yTextAlignment={totalLevel.yTextAlignment}
        />
      ) : (
        <span className="kronosWidgetAccessibleText" data-source-glyph-missing="true">
          {text}
        </span>
      )}
    </span>
  );
}

interface KronosPrayerReorderDragState {
  readonly pointerId: number;
  readonly sourcePrayerId: string;
  readonly startX: number;
  readonly startY: number;
  readonly moved: boolean;
}

interface KronosSpellReorderDragState {
  readonly pointerId: number;
  readonly sourceSpellId: string;
  readonly startX: number;
  readonly startY: number;
  readonly moved: boolean;
}

function orderedKronosPrayerSlots(
  panel: KronosPrayerPanelLayout,
  reorderOrder: readonly string[] | undefined
): readonly KronosPrayerSlotLayout[] {
  if (!reorderOrder || reorderOrder.length === 0) {
    return panel.slots;
  }

  const byId = new Map(panel.slots.map((slot) => [slot.id, slot]));
  const used = new Set<string>();
  const ordered = reorderOrder.flatMap((id) => {
    const slot = byId.get(id as KronosPrayerId);
    if (!slot || used.has(slot.id)) {
      return [];
    }
    used.add(slot.id);
    return [slot];
  });
  for (const slot of panel.slots) {
    if (!used.has(slot.id)) {
      ordered.push(slot);
    }
  }

  return ordered.map((slot, index) => {
    const visualSlot = panel.slots[index] ?? slot;
    return {
      ...slot,
      rect: visualSlot.rect,
      gridColumn: visualSlot.gridColumn,
      gridRow: visualSlot.gridRow
    };
  });
}

function orderedKronosSpellbookSpells(
  panel: KronosSpellbookPanelLayout,
  reorderOrder: readonly string[] | undefined
): readonly KronosSpellbookSpellLayout[] {
  if (!reorderOrder || reorderOrder.length === 0) {
    return panel.spells;
  }

  const byId = new Map(panel.spells.map((spell) => [spell.id, spell]));
  const used = new Set<string>();
  const ordered = reorderOrder.flatMap((id) => {
    const spell = byId.get(id);
    if (!spell || used.has(spell.id)) {
      return [];
    }
    used.add(spell.id);
    return [spell];
  });
  for (const spell of panel.spells) {
    if (!used.has(spell.id)) {
      ordered.push(spell);
    }
  }

  return ordered.map((spell, index) => {
    const visualSpell = panel.spells[index] ?? spell;
    return {
      ...spell,
      rect: visualSpell.rect,
      gridColumn: visualSpell.gridColumn,
      gridRow: visualSpell.gridRow
    };
  });
}

function KronosPrayerIconLayer({
  atlas,
  hud,
  onDefaultAction,
  onDragReorder,
  panel,
  reorderingEnabled,
  reorderOrder
}: {
  readonly atlas: KronosHudAtlas | undefined;
  readonly hud: RuntimeHudState;
  readonly onDefaultAction: ((command: KronosPrayerSlotCommand) => void) | undefined;
  readonly onDragReorder: ((command: KronosPrayerSlotDragCommand) => void) | undefined;
  readonly panel: KronosPrayerPanelLayout | null;
  readonly reorderingEnabled: boolean;
  readonly reorderOrder: readonly string[] | undefined;
}): JSX.Element | null {
  const [dragState, setDragState] = useState<KronosPrayerReorderDragState | null>(null);
  const dragStateRef = useRef<KronosPrayerReorderDragState | null>(null);
  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);
  useEffect(() => {
    if (!reorderingEnabled) {
      dragStateRef.current = null;
      setDragState(null);
    }
  }, [reorderingEnabled]);

  if (!atlas || !panel) {
    return null;
  }

  const visualSlots = orderedKronosPrayerSlots(panel, reorderOrder);
  const slotById = new Map(visualSlots.map((slot) => [slot.id, slot]));
  const icons = visualSlots.flatMap((slot) => {
    const sprite = findSpriteById(atlas, slot.spriteId);
    return sprite ? [{ slot, sprite }] : [];
  });

  if (icons.length === 0) {
    return null;
  }

  return (
    <div
      className="kronosPrayerIconLayer"
      data-container-child-id={panel.containerChildId}
      data-container-widget-id={panel.containerWidgetId}
      data-group-id={panel.groupId}
      data-reordering-enabled={String(reorderingEnabled)}
    >
      {icons.map(({ slot, sprite }) => {
        const definition = kronosPrayerDefinition(slot.id);
        const activePrayerIds = kronosActivePrayerIds(hud.prayers);
        const active = hud.prayers?.[slot.id] === true;
        const disallowedPrayerIds = definition ? kronosPrayerDisallowedIds(definition) : [];
        const activeBackground = active ? findSpriteById(atlas, activatedPrayerBackgroundSpriteId) : undefined;
        const dragging = dragState?.sourcePrayerId === slot.id;
        return (
          <span className="kronosPrayerSlot" key={`${slot.childId}:${slot.spriteId}`}>
            <button
              aria-label={`Prayer ${slot.label}`}
              aria-pressed={active}
              className="kronosPrayerSlotButton"
              data-active={String(active)}
              data-child-id={slot.childId}
              data-disallowed-prayer-ids={disallowedPrayerIds.join(",")}
              data-grid-column={slot.gridColumn}
              data-grid-row={slot.gridRow}
              data-head-icon={definition?.headIcon ?? ""}
              data-prayer-drain={definition?.drain ?? ""}
              data-prayer-id={slot.id}
              data-prayer-label={slot.label}
              data-prayer-level={definition?.level ?? ""}
              data-reordering-enabled={String(reorderingEnabled)}
              data-source-action-count={slot.actions.length}
              data-source-action-text={kronosSourceActionText(slot.actions)}
              data-source-enum-name={definition?.enumName ?? ""}
              data-source-order={slot.sourceOrder}
              data-source-ordinal={definition?.ordinal ?? ""}
              data-sound-id={definition?.soundId ?? ""}
              data-varpbit-id={definition?.varpbitId ?? ""}
              data-widget-id={slot.widgetId}
              disabled={!definition}
              onPointerDown={(event) => {
                if (event.button !== 0 || !definition) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                if (reorderingEnabled && onDragReorder) {
                  const nextDragState = {
                    pointerId: event.pointerId,
                    sourcePrayerId: slot.id,
                    startX: event.clientX,
                    startY: event.clientY,
                    moved: false
                  };
                  dragStateRef.current = nextDragState;
                  setDragState(nextDragState);
                  event.currentTarget.setPointerCapture(event.pointerId);
                  return;
                }
                onDefaultAction?.({
                  slot,
                  definition,
                  actionText: kronosSourceActionText(slot.actions),
                  active,
                  activePrayerIds,
                  disallowedPrayerIds,
                  position: runtimeViewportPointerPosition(event)
                });
              }}
              onPointerMove={(event) => {
                const current = dragStateRef.current;
                if (!current || current.pointerId !== event.pointerId || current.sourcePrayerId !== slot.id) {
                  return;
                }
                const moved =
                  current.moved ||
                  Math.abs(event.clientX - current.startX) >= 4 ||
                  Math.abs(event.clientY - current.startY) >= 4;
                if (moved !== current.moved) {
                  const nextDragState = { ...current, moved };
                  dragStateRef.current = nextDragState;
                  setDragState(nextDragState);
                }
                event.preventDefault();
                event.stopPropagation();
              }}
              onPointerUp={(event) => {
                const current = dragStateRef.current;
                if (!current || current.pointerId !== event.pointerId || current.sourcePrayerId !== slot.id) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                dragStateRef.current = null;
                setDragState(null);
                const targetElement = document
                  .elementFromPoint(event.clientX, event.clientY)
                  ?.closest<HTMLElement>("[data-prayer-id]");
                const destinationPrayerId = targetElement?.dataset.prayerId;
                const destinationSlot = destinationPrayerId ? slotById.get(destinationPrayerId as KronosPrayerId) : undefined;
                if (current.moved && destinationSlot && destinationSlot.id !== slot.id) {
                  onDragReorder?.({
                    sourcePrayerId: slot.id,
                    destinationPrayerId: destinationSlot.id,
                    sourceSlot: slot,
                    destinationSlot,
                    position: runtimeViewportPointerPosition(event)
                  });
                  return;
                }
                if (!definition) {
                  return;
                }
                onDefaultAction?.({
                  slot,
                  definition,
                  actionText: kronosSourceActionText(slot.actions),
                  active,
                  activePrayerIds,
                  disallowedPrayerIds,
                  position: runtimeViewportPointerPosition(event)
                });
              }}
              onPointerCancel={(event) => {
                const current = dragStateRef.current;
                if (!current || current.pointerId !== event.pointerId || current.sourcePrayerId !== slot.id) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                dragStateRef.current = null;
                setDragState(null);
              }}
              style={rectStyle(slot.rect)}
              type="button"
            />
            {activeBackground ? (
              <span
                aria-hidden="true"
                className="kronosPrayerActiveBackground"
                data-prayer-id={slot.id}
                data-sprite-id={activatedPrayerBackgroundSpriteId}
                style={prayerActiveBackgroundStyle(atlas, activeBackground, slot)}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={`kronosPrayerIconSprite${dragging ? " kronosPrayerIconSprite-reorderDragging" : ""}`}
              data-active={String(active)}
              data-child-id={slot.childId}
              data-disallowed-prayer-ids={disallowedPrayerIds.join(",")}
              data-grid-column={slot.gridColumn}
              data-grid-row={slot.gridRow}
              data-head-icon={definition?.headIcon ?? ""}
              data-prayer-drain={definition?.drain ?? ""}
              data-prayer-id={slot.id}
              data-prayer-label={slot.label}
              data-prayer-level={definition?.level ?? ""}
              data-source-action-count={slot.actions.length}
              data-source-action-text={kronosSourceActionText(slot.actions)}
              data-source-enum-name={definition?.enumName ?? ""}
              data-source-graphic-height={prayerIconGraphicSize.height}
              data-source-graphic-width={prayerIconGraphicSize.width}
              data-source-graphic-widget="prayer_init child 1 cc_setsize(30, 30) cc_setposition(abs_centre, abs_centre)"
              data-source-order={slot.sourceOrder}
              data-source-ordinal={definition?.ordinal ?? ""}
              data-sound-id={definition?.soundId ?? ""}
              data-sprite-id={slot.spriteId}
              data-varpbit-id={definition?.varpbitId ?? ""}
              data-widget-id={slot.widgetId}
              style={prayerIconSpriteStyle(atlas, sprite, slot)}
            />
          </span>
        );
      })}
    </div>
  );
}

function KronosSpellbookIconLayer({
  atlas,
  hud,
  onDefaultAction,
  onDragReorder,
  panel,
  reorderingEnabled,
  reorderOrder,
  selectedSpell
}: {
  readonly atlas: KronosHudAtlas | undefined;
  readonly hud: RuntimeHudState | undefined;
  readonly onDefaultAction: ((command: KronosSpellbookSpellCommand) => void) | undefined;
  readonly onDragReorder: ((command: KronosSpellbookSpellDragCommand) => void) | undefined;
  readonly panel: KronosSpellbookPanelLayout | null;
  readonly reorderingEnabled: boolean;
  readonly reorderOrder: readonly string[] | undefined;
  readonly selectedSpell: KronosSelectedSpell | null;
}): JSX.Element | null {
  const [dragState, setDragState] = useState<KronosSpellReorderDragState | null>(null);
  const dragStateRef = useRef<KronosSpellReorderDragState | null>(null);
  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);
  useEffect(() => {
    if (!reorderingEnabled) {
      dragStateRef.current = null;
      setDragState(null);
    }
  }, [reorderingEnabled]);

  if (!atlas || !panel) {
    return null;
  }

  const currentMagicLevel = hud?.skills?.magic?.current ?? defaultRuntimeSkillStates.magic.current;
  const fixedMagicLevel = hud?.skills?.magic?.fixed ?? defaultRuntimeSkillStates.magic.fixed;
  const visualSpells = orderedKronosSpellbookSpells(panel, reorderOrder);
  const spellById = new Map(visualSpells.map((spell) => [spell.id, spell]));
  const icons = visualSpells.flatMap((spell) => {
    const magicLevelCanCast = kronosMagicSpellCurrentLevelCanCast(spell.id, currentMagicLevel);
    const renderedSpriteId = magicLevelCanCast ? spell.enabledSpriteId : spell.disabledSpriteId;
    const sprite = findSpriteById(atlas, renderedSpriteId) ?? findSpriteById(atlas, spell.spriteId);
    const requiredMagicLevel = kronosMagicSpellLevelRequirement(spell.id);
    const levelFilterAllows = kronosMagicSpellLevelFilterAllows(spell.id, currentMagicLevel, fixedMagicLevel);
    return sprite
      ? [
          {
            levelFilterAllows,
            magicLevelCanCast,
            renderedSpriteId: sprite.spriteId,
            requiredMagicLevel,
            spell,
            sprite
          }
        ]
      : [];
  });

  if (icons.length === 0) {
    return null;
  }

  return (
    <div
      className="kronosSpellbookIconLayer"
      data-book-id={panel.id}
      data-bounds-child-id={panel.boundsChildId}
      data-bounds-widget-id={panel.boundsWidgetId}
      data-columns={panel.columns}
      data-disable-filtering-varbit-id={panel.disableFilteringVarbitId}
      data-disable-filtering-varbit-value={panel.disableFilteringVarbitValue}
      data-enum-id={panel.enumId}
      data-group-id={panel.groupId}
      data-layout-mode={panel.layoutMode}
      data-parent-child-id={panel.parentChildId}
      data-parent-widget-id={panel.parentWidgetId}
      data-reordering-enabled={String(reorderingEnabled)}
      data-rows={panel.rows}
      data-spellbook-varbit-id={panel.spellbookVarbitId}
      data-spellbook-varbit-value={panel.spellbookVarbitValue}
    >
      {icons.map(({ levelFilterAllows, magicLevelCanCast, renderedSpriteId, requiredMagicLevel, spell, sprite }) => {
        const actionName = spell.spellActionName.trim();
        const selectable = Boolean(onDefaultAction && actionName && spell.targetFlags !== 0);
        const selected = selectedSpell?.widgetId === spell.widgetId && selectedSpell.childId === spell.childId;
        const dragging = dragState?.sourceSpellId === spell.id;
        return (
          <button
            aria-disabled={!selectable}
            aria-label={`Spell ${spell.label}`}
            aria-pressed={selected}
            className={`kronosSpellbookIconSprite${selected ? " kronosSpellbookIconSprite-selected" : ""}${dragging ? " kronosSpellbookIconSprite-reorderDragging" : ""}`}
            data-child-id={spell.childId}
            data-click-mask={spell.clickMask}
            data-data-text={spell.dataText}
            data-base-magic-level={fixedMagicLevel}
            data-current-magic-level={currentMagicLevel}
            data-disabled-sprite-id={spell.disabledSpriteId}
            data-enabled-sprite-id={spell.enabledSpriteId}
            data-grid-column={spell.gridColumn}
            data-grid-row={spell.gridRow}
            data-is-if3={String(spell.isIf3)}
            data-item-id={spell.itemId}
            data-level-filter-allows={levelFilterAllows ? "true" : "false"}
            data-magic-level-can-cast={magicLevelCanCast ? "true" : "false"}
            data-menu-type={spell.menuType}
            data-required-magic-level={requiredMagicLevel ?? ""}
            data-reordering-enabled={String(reorderingEnabled)}
            data-selected={selected ? "true" : "false"}
            data-selected-spell-name={spell.selectedSpellName}
            data-selectable={selectable ? "true" : "false"}
            data-source-castable-state="script2614: stat(magic) below spell_levelreq selects spell_graphic off sprite; TargetSpell.cast checks current Magic before cast"
            data-source-level-filter="script2619: lack-level filter hides only when stat_base(magic) and stat(magic) are both below spell_levelreq"
            data-source-selected-spell-state="class19.method340 isSpellSelected selectedSpellWidget selectedSpellChildIndex WorldMapSectionType.method116"
            data-source-selected-outline="Sprite.method6104(16777215) selected border-2 outline"
            data-source-action-count={spell.actions.length}
            data-source-order={spell.sourceOrder}
            data-spell-action-name={spell.spellActionName}
            data-spell-id={spell.id}
            data-spell-label={spell.label}
            data-spell-name={spell.spellName}
            data-sprite-offset-x={sprite.offsetX}
            data-sprite-offset-y={sprite.offsetY}
            data-sprite-id={renderedSpriteId}
            data-target-flags={spell.targetFlags}
            data-widget-id={spell.widgetId}
            key={`${spell.childId}:${renderedSpriteId}`}
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              if (reorderingEnabled && onDragReorder) {
                const nextDragState = {
                  pointerId: event.pointerId,
                  sourceSpellId: spell.id,
                  startX: event.clientX,
                  startY: event.clientY,
                  moved: false
                };
                dragStateRef.current = nextDragState;
                setDragState(nextDragState);
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
              }
              if (!onDefaultAction || !actionName || spell.targetFlags === 0) {
                return;
              }
              onDefaultAction({
                spell,
                actionName,
                selectedSpellName: spell.selectedSpellName,
                targetFlags: spell.targetFlags,
                position: runtimeViewportPointerPosition(event)
              });
            }}
            onPointerMove={(event) => {
              const current = dragStateRef.current;
              if (!current || current.pointerId !== event.pointerId || current.sourceSpellId !== spell.id) {
                return;
              }
              const moved =
                current.moved ||
                Math.abs(event.clientX - current.startX) >= 4 ||
                Math.abs(event.clientY - current.startY) >= 4;
              if (moved !== current.moved) {
                const nextDragState = { ...current, moved };
                dragStateRef.current = nextDragState;
                setDragState(nextDragState);
              }
              event.preventDefault();
              event.stopPropagation();
            }}
            onPointerUp={(event) => {
              const current = dragStateRef.current;
              if (!current || current.pointerId !== event.pointerId || current.sourceSpellId !== spell.id) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              dragStateRef.current = null;
              setDragState(null);
              const targetElement = document
                .elementFromPoint(event.clientX, event.clientY)
                ?.closest<HTMLElement>("[data-spell-id]");
              const destinationSpellId = targetElement?.dataset.spellId;
              const destinationSpell = destinationSpellId ? spellById.get(destinationSpellId) : undefined;
              if (current.moved && destinationSpell && destinationSpell.id !== spell.id) {
                onDragReorder?.({
                  spellbookId: panel.id,
                  sourceSpellId: spell.id,
                  destinationSpellId: destinationSpell.id,
                  sourceSpell: spell,
                  destinationSpell,
                  position: runtimeViewportPointerPosition(event)
                });
                return;
              }
              if (!onDefaultAction || !actionName || spell.targetFlags === 0) {
                return;
              }
              onDefaultAction({
                spell,
                actionName,
                selectedSpellName: spell.selectedSpellName,
                targetFlags: spell.targetFlags,
                position: runtimeViewportPointerPosition(event)
              });
            }}
            onPointerCancel={(event) => {
              const current = dragStateRef.current;
              if (!current || current.pointerId !== event.pointerId || current.sourceSpellId !== spell.id) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              dragStateRef.current = null;
              setDragState(null);
            }}
            style={spellbookIconButtonStyle(spell)}
            type="button"
          >
            <span
              aria-hidden="true"
              className="kronosSpellbookIconGraphic"
              style={spellbookIconGraphicStyle(atlas, sprite)}
            />
          </button>
        );
      })}
    </div>
  );
}

function KronosOrb({
  active = false,
  actionEnabled = true,
  ariaLabel,
  atlas,
  className,
  clientFonts,
  fillerSpriteIdOverride,
  fillerTransparency,
  id,
  layout,
  onDefaultAction,
  sourceDrawState,
  spriteAtlases,
  value,
  maxValue,
  valueTextOverride
}: KronosOrbProps): JSX.Element | null {
  if (!layout) {
    return null;
  }

  const normalizedValue = normalizeOrbValue(value);
  const normalizedMax = normalizeOrbMax(maxValue);
  const fillPixels = kronosOrbFillPixels(normalizedValue, normalizedMax, layout.fillRect.height);
  const clippedTop = layout.fillRect.height - fillPixels;
  const valueText = valueTextOverride ?? String(normalizedValue);
  const valueFont = kronosClientFontDefinitionById(clientFonts, layout.valueText?.fontId);
  const valueFontAtlas = valueFont ? spriteAtlases.get(valueFont.sheetId as RuntimeSpriteSheetId) : undefined;
  const valueGlyphCount = valueFont && valueFontAtlas ? glyphCountForText(valueFont, valueFontAtlas, valueText) : 0;
  const sourceStateFillerSpriteId = active && layout.activeFillerSpriteId ? layout.activeFillerSpriteId : layout.fillerSpriteId;
  const displayedFillerSpriteId = fillerSpriteIdOverride ?? sourceStateFillerSpriteId;
  const actionText = kronosSourceActionText(layout.actions);
  const actionLabel = ariaLabel ?? stripKronosTags(actionText);
  const canUseDefaultAction = actionEnabled && Boolean(onDefaultAction && layout.actionRect);
  const fillOpacity =
    fillerTransparency === null || fillerTransparency === undefined ? undefined : kronosComponentOpacityFromTransparency(fillerTransparency);
  return (
    <div
      className={className}
      data-active={String(active)}
      data-action-enabled={String(canUseDefaultAction)}
      data-action-child-id={layout.actionChildId ?? ""}
      data-action-text={actionText}
      data-action-widget-id={layout.actionWidgetId ?? ""}
      data-source-draw-state={sourceDrawState ?? ""}
      data-frame-sprite-id={layout.frameSpriteId}
      data-empty-sprite-id={layout.emptySpriteId}
      data-filler-sprite-id={layout.fillerSpriteId}
      data-active-filler-sprite-id={layout.activeFillerSpriteId ?? ""}
      data-displayed-filler-sprite-id={displayedFillerSpriteId}
      data-source-filler-transparency={fillerTransparency ?? ""}
      data-icon-sprite-id={layout.iconSpriteId}
      data-source-action-count={layout.actions.length}
      data-source-action-hitbox={layout.actionRect ? JSON.stringify(layout.actionRect) : ""}
      onPointerDown={(event) => {
        if (event.button !== 0 || !actionEnabled || !onDefaultAction || !kronosOrbActionPointerInside(event, layout)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onDefaultAction(event);
      }}
      style={orbStyle(layout)}
    >
      <KronosSpriteById
        atlas={atlas}
        className="kronosFixedOrbFrame"
        spriteId={layout.frameSpriteId}
        style={positionStyle(layout.frameRect)}
      />
      <KronosSpriteById
        atlas={atlas}
        className="kronosFixedOrbEmpty"
        spriteId={layout.emptySpriteId}
        style={positionStyle(layout.emptyRect)}
      />
      <span
        className="kronosFixedOrbFillMask"
        data-orb={id}
        data-fill-pixels={fillPixels}
        data-fill-source-height={layout.fillRect.height}
        style={{
          left: layout.fillRect.x,
          top: layout.fillRect.y + clippedTop,
          width: layout.fillRect.width,
          height: fillPixels,
          opacity: fillOpacity
        }}
      >
        <KronosSpriteById
          atlas={atlas}
          className="kronosFixedOrbFilledSlice"
          spriteId={displayedFillerSpriteId}
          style={{ left: 0, top: -clippedTop }}
        />
      </span>
      <KronosSpriteById
        atlas={atlas}
        className="kronosFixedOrbIcon"
        spriteId={layout.iconSpriteId}
        style={positionStyle(layout.iconRect)}
      />
      <span
        className="kronosFixedOrbValue"
        data-orb={id}
        data-value={normalizedValue}
        data-value-text={valueText}
        data-value-text-source={valueTextOverride === undefined || valueTextOverride === null ? "source-widget-value" : "runelite-status-orbs"}
        data-max-value={normalizedMax}
        data-font-id={layout.valueText?.fontId ?? ""}
        data-source-font-archive={valueFont?.fontArchiveName ?? ""}
        data-source-glyph-atlas={valueFont?.sheetId ?? ""}
        data-line-height={layout.valueText?.lineHeight ?? ""}
        data-text-color={layout.valueText?.textColor ?? ""}
        data-text-shadowed={layout.valueText?.textShadowed === undefined ? "" : String(layout.valueText.textShadowed)}
        data-x-text-alignment={layout.valueText?.xTextAlignment ?? ""}
        data-y-text-alignment={layout.valueText?.yTextAlignment ?? ""}
        data-glyph-count={valueGlyphCount}
        style={layout.valueTextRect ? rectStyle(layout.valueTextRect) : undefined}
      >
        {layout.valueText && valueFont && valueFontAtlas ? (
          <KronosSourceGlyphText
            atlas={valueFontAtlas}
            color={cssRgbColor(layout.valueText.textColor, 0xffff00)}
            font={valueFont}
            height={layout.valueText.rect.height}
            lineHeight={layout.valueText.lineHeight}
            shadowColor={layout.valueText.textShadowed === false ? null : "#000000"}
            text={valueText}
            width={layout.valueText.rect.width}
            xTextAlignment={layout.valueText.xTextAlignment}
            yTextAlignment={layout.valueText.yTextAlignment}
          />
        ) : (
          <span className="kronosWidgetAccessibleText" data-source-glyph-missing="true">
            {valueText}
          </span>
        )}
      </span>
      {canUseDefaultAction ? (
        <button
          aria-label={actionLabel}
          className="kronosFixedOrbHitbox"
          data-action-child-id={layout.actionChildId ?? ""}
          data-action-text={actionText}
          data-action-widget-id={layout.actionWidgetId ?? ""}
          data-source-action-count={layout.actions.length}
          style={layout.actionRect ? rectStyle(layout.actionRect) : undefined}
          tabIndex={0}
          type="button"
        />
      ) : null}
    </div>
  );
}

function KronosXpDropOrb({
  atlas,
  layout,
  onDefaultAction,
  onContextMenu,
  shown
}: {
  readonly atlas: KronosHudAtlas;
  readonly layout: KronosXpDropOrbLayout | null;
  readonly onDefaultAction: ((command: KronosXpDropOrbCommand) => void) | undefined;
  readonly onContextMenu: ((command: KronosXpDropOrbCommand) => void) | undefined;
  readonly shown: boolean;
}): JSX.Element | null {
  const [hovered, setHovered] = useState(false);
  if (!layout) {
    return null;
  }

  const spriteId = shown
    ? hovered
      ? layout.activeHoverSpriteId
      : layout.activeSpriteId
    : hovered
      ? layout.hoverSpriteId
      : layout.spriteId;
  const sprite = findSpriteById(atlas, spriteId);
  if (!sprite) {
    return null;
  }

  const actionText = shown ? "Hide" : "Show";
  return (
    <button
      aria-label={`${actionText} XP drops`}
      className="kronosXpDropOrb"
      data-action-text={actionText}
      data-active={shown ? "true" : "false"}
      data-child-id={layout.childId}
      data-click-mask={layout.clickMask}
      data-group-id={layout.groupId}
      data-source-actions={layout.actions.join("||")}
      data-source-client-script="orbs_xpdrops_op"
      data-source-hover-script="graphic_swapper(event_com, orb_xp hover variant)"
      data-source-update-script="orbs_xpdrops_update varbit4702 sprite orb_xp,0/1/2/3"
      data-source-varbit="4702"
      data-source-var-transmit="var1055"
      data-sprite-id={spriteId}
      data-widget-id={layout.widgetId}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={(event) => {
        if (event.button !== 0 || !onDefaultAction) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onDefaultAction({
          actionText,
          childId: layout.childId,
          clickMask: layout.clickMask,
          previousShown: shown,
          spriteId,
          widgetId: layout.widgetId,
          position: runtimeViewportPointerPosition(event)
        });
      }}
      onContextMenu={(event) => {
        if (!onContextMenu) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onContextMenu({
          actionText,
          childId: layout.childId,
          clickMask: layout.clickMask,
          previousShown: shown,
          spriteId,
          widgetId: layout.widgetId,
          position: runtimeViewportPointerPosition(event)
        });
      }}
      style={rectStyle(layout.rect)}
      type="button"
    >
      <span aria-hidden="true" className="kronosXpDropOrbSprite" style={spriteStyle(atlas, sprite)} />
      <span className="kronosWidgetAccessibleText">{`${actionText} XP drops`}</span>
    </button>
  );
}

function kronosOrbActionPointerInside(event: ReactPointerEvent<HTMLElement>, layout: KronosFixedOrbLayout): boolean {
  if (!layout.actionRect) {
    return false;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  const sourceX = ((event.clientX - rect.left) / rect.width) * layout.rect.width;
  const sourceY = ((event.clientY - rect.top) / rect.height) * layout.rect.height;
  return (
    sourceX >= layout.actionRect.x &&
    sourceX < layout.actionRect.x + layout.actionRect.width &&
    sourceY >= layout.actionRect.y &&
    sourceY < layout.actionRect.y + layout.actionRect.height
  );
}

function orbStyle(layout: KronosFixedOrbLayout | null): CSSProperties | undefined {
  if (!layout) {
    return undefined;
  }

  return {
    left: layout.rect.x,
    top: layout.rect.y,
    width: layout.rect.width,
    height: layout.rect.height
  };
}

function positionStyle(rect: { readonly x: number; readonly y: number }): CSSProperties {
  return {
    left: rect.x,
    top: rect.y
  };
}

function rectStyle(rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): CSSProperties {
  return {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height
  };
}

function normalizeOrbValue(value: number): number {
  return Math.max(0, Math.min(999, Math.trunc(value)));
}

function normalizeOrbMax(maxValue: number): number {
  return Math.max(1, Math.min(999, Math.trunc(maxValue)));
}

function suppressNextRetargetedInventoryRelease(): void {
  const removeListeners = (): void => {
    window.removeEventListener("pointerup", suppressPointerUp, true);
    window.removeEventListener("click", suppressClick, true);
  };
  const suppressEvent = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const suppressPointerUp = (event: Event): void => {
    suppressEvent(event);
    window.removeEventListener("pointerup", suppressPointerUp, true);
  };
  const suppressClick = (event: Event): void => {
    suppressEvent(event);
    window.removeEventListener("click", suppressClick, true);
  };
  window.addEventListener("pointerup", suppressPointerUp, true);
  window.addEventListener("click", suppressClick, true);
  window.setTimeout(removeListeners, 500);
}

function kronosOrbFillPixels(value: number, maxValue: number, fillHeight: number): number {
  const clamped = Math.max(0, Math.min(value, maxValue));
  return Math.trunc((clamped * Math.max(1, fillHeight)) / maxValue);
}

function KronosInventorySlotView({
  atlas,
  clientFonts,
  spriteAtlases,
  slot,
  index,
  widgetId,
  itemDefinition,
  selectedItem,
  pendingEquip,
  inventoryDragDelayClientTicks,
  onContextMenu,
  onDefaultAction,
  onDragReorder,
  onHover
}: KronosInventorySlotProps): JSX.Element {
  const slotElementRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<KronosInventorySlotDragState | null>(null);
  const onDefaultActionRef = useRef(onDefaultAction);
  const onDragReorderRef = useRef(onDragReorder);
  const dragDelayMsRef = useRef(inventoryDragDelayMsFromClientTicks(inventoryDragDelayClientTicks));
  const selectedItemRef = useRef(selectedItem);
  const suppressClickRef = useRef(false);
  const [dragState, setDragState] = useState<KronosInventorySlotDragState | null>(null);
  const [pressed, setPressed] = useState(false);
  const suppressNextBrowserClick = (): void => {
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };
  const setInventoryDragState = (state: KronosInventorySlotDragState | null): void => {
    dragStateRef.current = state;
    setDragState(state);
  };
  const selected = selectedItem?.slotIndex === index && selectedItem.widgetId === widgetId;
  const item = atlas && slot ? findItemSprite(atlas, slot.itemId, selected ? "selected" : "normal", slot.quantity) : undefined;
  const quantityText = slot ? kronosInventoryQuantityText(slot.quantity, itemDefinition, 2) : null;
  const quantityFont = kronosClientFontDefinitionById(clientFonts, inventoryQuantityFontId);
  const quantityFontAtlas = quantityFont ? spriteAtlases.get(quantityFont.sheetId as RuntimeSpriteSheetId) : undefined;
  const dragDelayMs = inventoryDragDelayMsFromClientTicks(inventoryDragDelayClientTicks);
  const command = (event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>): KronosInventorySlotCommand | null =>
    slot
      ? {
          slotIndex: index,
          slot,
          widgetId,
          itemName: itemDefinition?.name ?? item?.name,
          position: runtimeViewportPointerPosition(event)
        }
      : null;
  const dragOffset = inventoryDragOffset(dragState, slotElementRef.current);
  const dragScale = inventoryDragScale(slotElementRef.current);
  const dispatchDefaultAction = (event: ReactPointerEvent<HTMLElement>): void => {
    const actionCommand = command(event);
    if (actionCommand && onDefaultAction) {
      onDefaultAction(actionCommand);
    }
  };
  const runtimeViewportDragPosition = (clientX: number, clientY: number): { readonly x: number; readonly y: number } => {
    const element = slotElementRef.current;
    const viewportRect =
      element?.closest(".runtimeViewport")?.getBoundingClientRect() ??
      element?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return {
      x: clientX - viewportRect.left,
      y: clientY - viewportRect.top
    };
  };
  const commandFromDragState = (
    state: KronosInventorySlotDragState,
    clientX: number,
    clientY: number
  ): KronosInventorySlotCommand => ({
    ...state.sourceCommand,
    position: runtimeViewportDragPosition(clientX, clientY)
  });
  const updateDragPosition = (pointerId: number, clientX: number, clientY: number): void => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== pointerId) {
      return;
    }
    const dragDelta = inventoryDragDelta(
      {
        ...state,
        currentX: clientX,
        currentY: clientY
      },
      slotElementRef.current
    );
    const delayed = performance.now() - state.startedAtMs >= dragDelayMsRef.current;
    const moved = Math.abs(dragDelta.x) > inventoryDragThresholdPixels || Math.abs(dragDelta.y) > inventoryDragThresholdPixels;
    setInventoryDragState({
      ...state,
      currentX: clientX,
      currentY: clientY,
      active: state.active || (delayed && moved)
    });
  };
  const finishDrag = (event: Pick<PointerEvent, "pointerId" | "clientX" | "clientY">): void => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }
    const dragDelta = inventoryDragDelta(
      {
        ...state,
        currentX: event.clientX,
        currentY: event.clientY
      },
      slotElementRef.current
    );
    const delayed = performance.now() - state.startedAtMs >= dragDelayMsRef.current;
    const moved = Math.abs(dragDelta.x) > inventoryDragThresholdPixels || Math.abs(dragDelta.y) > inventoryDragThresholdPixels;
    const active = state.active || (delayed && moved);
    const sourceSlot = state.sourceCommand.slot;
    const target = inventorySlotElementFromPoint(event.clientX, event.clientY);
    const destinationSlotIndex = target?.dataset.inventorySlotIndex
      ? Number.parseInt(target.dataset.inventorySlotIndex, 10)
      : Number.NaN;
    if (active) {
      suppressNextBrowserClick();
    }
    if (active && sourceSlot && Number.isInteger(destinationSlotIndex) && destinationSlotIndex !== state.sourceCommand.slotIndex) {
      onDragReorderRef.current?.({
        sourceSlotIndex: state.sourceCommand.slotIndex,
        destinationSlotIndex,
        sourceSlot,
        destinationSlot: normalizedInventorySlotFromElement(target),
        widgetId: state.sourceCommand.widgetId,
        position: runtimeViewportDragPosition(event.clientX, event.clientY)
      });
    } else if (!active && !selectedItemRef.current && onDefaultActionRef.current) {
      // Source: Kronos Client releases a pressed inventory widget by sending the default
      // menu action at the original press coordinates when item drag never activates.
      suppressNextBrowserClick();
      onDefaultActionRef.current(commandFromDragState(state, state.startX, state.startY));
    }
    setPressed(false);
    setInventoryDragState(null);
  };
  const flushPendingPressOnUnmount = (): void => {
    const state = dragStateRef.current;
    if (!state || state.active || selectedItemRef.current || !onDefaultActionRef.current) {
      return;
    }
    // Source: Kronos keeps Frames.dragInventoryWidget/dragItemSlotSource alive
    // globally until MouseHandler_currentButton releases, so an F-key tab change
    // cannot destroy the pending inventory click.
    suppressNextRetargetedInventoryRelease();
    onDefaultActionRef.current(commandFromDragState(state, state.startX, state.startY));
    dragStateRef.current = null;
  };

  useEffect(() => {
    onDefaultActionRef.current = onDefaultAction;
    onDragReorderRef.current = onDragReorder;
    dragDelayMsRef.current = dragDelayMs;
    selectedItemRef.current = selectedItem;
  }, [dragDelayMs, onDefaultAction, onDragReorder, selectedItem]);

  useEffect(() => {
    // Trainer optimisation: Kronos stores inventory drag state globally; keep the
    // equivalent browser listeners stable and read current callbacks from refs.
    const onWindowPointerMove = (event: PointerEvent): void => {
      updateDragPosition(event.pointerId, event.clientX, event.clientY);
    };
    const onWindowPointerUp = (event: PointerEvent): void => {
      if (dragStateRef.current?.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      finishDrag(event);
    };
    const onWindowPointerCancel = (event: PointerEvent): void => {
      if (dragStateRef.current?.pointerId === event.pointerId) {
        setPressed(false);
        setInventoryDragState(null);
      }
    };
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerCancel);
    };
  }, []);

  useEffect(() => () => flushPendingPressOnUnmount(), []);

  return (
    <div
      ref={slotElementRef}
      className={`kronosInventorySlot${selected ? " kronosInventorySlot-selected" : ""}${pendingEquip ? " kronosInventorySlot-pendingEquip" : ""}${pressed ? " kronosInventorySlot-pressed" : ""}${dragState?.active ? " kronosInventorySlot-dragging" : ""}`}
      data-selected={selected ? "true" : "false"}
      data-pending-equip={pendingEquip ? "true" : "false"}
      data-pressed={pressed ? "true" : "false"}
      data-drag-active={dragState?.active ? "true" : "false"}
      data-drag-offset-x={dragState?.active ? dragOffset.x.toFixed(3) : ""}
      data-drag-offset-y={dragState?.active ? dragOffset.y.toFixed(3) : ""}
      data-drag-scale-x={dragScale.x.toFixed(6)}
      data-drag-scale-y={dragScale.y.toFixed(6)}
      data-inventory-drag-delay-client-ticks={inventoryDragDelayClientTicks ?? inventoryDefaultDragDelayClientTicks}
      data-source-inventory-drag-delay="Client.setInventoryDragDelay / AntiDragPlugin.DEFAULT_DELAY"
      data-source-inventory-drag-stretched-mouse="TranslateMouseListener divides stretched mouse deltas by stretchedDimensions / realDimensions before widget drag rendering"
      data-inventory-item-id={slot?.itemId ?? ""}
      data-inventory-item-quantity={slot?.quantity ?? ""}
      data-inventory-slot-index={index}
      data-source-context-menu-press-anchor="MouseHandler.copy$mousePressed stores MouseHandler_lastPressedX/Y; Client.method1661 opens from those pressed coordinates"
      data-slot-index={index}
      data-widget-id={widgetId}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (consumeKronosInventorySuppressedContextMenuEvent()) {
          return;
        }
        const menuCommand = command(event);
        if (!menuCommand || !onContextMenu) {
          return;
        }
        onContextMenu(menuCommand);
      }}
      onPointerDown={(event) => {
        if (event.button === 2) {
          event.preventDefault();
          event.stopPropagation();
          kronosInventorySuppressNextContextMenuEvent();
          const menuCommand = command(event);
          if (menuCommand && onContextMenu) {
            onContextMenu(menuCommand);
          }
          return;
        }
        if (event.button !== 0) {
          return;
        }
        if (!slot || !onDefaultAction) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        setPressed(true);
        if (selectedItem) {
          dispatchDefaultAction(event);
          window.setTimeout(() => setPressed(false), dragDelayMs);
          return;
        }
        const sourceCommand = command(event);
        if (!sourceCommand) {
          return;
        }
        setInventoryDragState({
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          currentX: event.clientX,
          currentY: event.clientY,
          startedAtMs: performance.now(),
          active: false,
          sourceCommand
        });
        try {
          slotElementRef.current?.setPointerCapture(event.pointerId);
        } catch {
          // Synthetic verifier input has no browser-active pointer; Kronos press state still exists.
        }
      }}
      onPointerMove={(event) => {
        updateDragPosition(event.pointerId, event.clientX, event.clientY);
        onHover?.(command(event));
      }}
      onPointerLeave={() => onHover?.(null)}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (slotElementRef.current?.hasPointerCapture(event.pointerId)) {
          slotElementRef.current.releasePointerCapture(event.pointerId);
        }
        setPressed(false);
        finishDrag(event);
      }}
      onPointerCancel={(event) => {
        if (slotElementRef.current?.hasPointerCapture(event.pointerId)) {
          slotElementRef.current.releasePointerCapture(event.pointerId);
        }
        setPressed(false);
        setInventoryDragState(null);
      }}
      onClick={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (selectedItem) {
          return;
        }
        const actionCommand = command(event);
        if (!actionCommand || !onDefaultAction) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onDefaultAction(actionCommand);
      }}
    >
      {atlas && slot && item ? (
        <>
          <span
            aria-label={`Inventory slot ${index + 1}: ${item.name ?? `item ${slot.itemId}`}`}
            className="kronosInventoryItemSprite"
            data-item-id={slot.itemId}
            data-quantity={slot.quantity}
            data-sprite-variant={item.variant ?? ""}
            data-source-border={item.sourceBorder ?? ""}
            data-source-shadow-color={item.sourceShadowColor ?? ""}
            data-source-quantity={item.sourceQuantity ?? ""}
            data-quantity-variant={item.quantityVariant ?? ""}
            data-item-stackable={itemDefinition ? String(itemDefinition.stackable) : ""}
            style={inventoryItemSpriteStyle(atlas, item, dragState?.active ? dragOffset : null)}
          />
          {quantityText ? (
            <KronosInventoryQuantityText
              atlas={quantityFontAtlas ?? null}
              color={quantityText.color}
              font={quantityFont ?? null}
              text={quantityText.text}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function KronosInventoryQuantityText({
  atlas,
  color,
  font,
  text
}: {
  readonly atlas: KronosHudAtlas | null;
  readonly color: string;
  readonly font: KronosClientFontDefinition | null;
  readonly text: string;
}): JSX.Element {
  const imageUrl = atlas ? `render/sprites/${atlas.metadata.image}` : "";
  const glyphCount = font && atlas ? glyphCountForText(font, atlas, text) : 0;
  return (
    <span
      className="kronosInventoryQuantity"
      data-font-id={font?.fontId ?? ""}
      data-quantity-color={color}
      data-quantity-text={text}
      data-source-baseline-y={inventoryQuantityBaselineY}
      data-source-font-archive={font?.fontArchiveName ?? ""}
      data-source-glyph-atlas={font?.sheetId ?? ""}
      data-source-glyph-image={atlas?.metadata.image ?? ""}
      data-source-shadow-color={inventoryQuantityShadowSourceColor}
      data-glyph-count={glyphCount}
    >
      <span className="kronosWidgetAccessibleText">{text}</span>
      {font && atlas
        ? [
            renderWidgetGlyphRun(
              atlas,
              font,
              imageUrl,
              text,
              1,
              inventoryQuantityBaselineY + 1,
              "#000001",
              "inventory-quantity-shadow"
            ),
            renderWidgetGlyphRun(atlas, font, imageUrl, text, 0, inventoryQuantityBaselineY, color, "inventory-quantity-text")
          ]
        : null}
    </span>
  );
}

function KronosSprite({ atlas, alias, className, style }: KronosSpriteProps): JSX.Element | null {
  const sprite = findSprite(atlas, alias);
  if (!sprite) {
    return null;
  }
  return <span className={className} style={{ ...spriteStyle(atlas, sprite), ...style }} aria-hidden="true" />;
}

function KronosSpriteById({
  atlas,
  spriteId,
  className,
  style
}: {
  readonly atlas: KronosHudAtlas;
  readonly spriteId: number;
  readonly className: string;
  readonly style?: CSSProperties;
}): JSX.Element | null {
  const sprite = findSpriteById(atlas, spriteId);
  if (!sprite) {
    return null;
  }
  return <span className={className} style={{ ...spriteStyle(atlas, sprite), ...style }} aria-hidden="true" />;
}

function KronosWidgetRectangle({ widget, order }: { readonly widget: KronosResolvedWidget; readonly order: number }): JSX.Element | null {
  if (widget.widget.hidden || widget.widget.type !== 3 || widget.rect.width <= 0 || widget.rect.height <= 0) {
    return null;
  }
  return (
    <span
      className="kronosWidgetRectangle"
      data-child-id={widget.widget.childId}
      data-text-color={widget.widget.textColor ?? ""}
      data-widget-id={widget.widget.id}
      style={widgetRectangleStyle(widget, order)}
    />
  );
}

function KronosWidgetSprite({
  atlas,
  widget,
  order
}: {
  readonly atlas: KronosHudAtlas;
  readonly widget: KronosResolvedWidget;
  readonly order: number;
}): JSX.Element | null {
  if (
    widget.widget.hidden ||
    widget.widget.type !== 5 ||
    widget.widget.spriteId <= 0 ||
    hiddenWidgetSpriteIds.has(widget.widget.spriteId)
  ) {
    return null;
  }

  const sprite = findSpriteById(atlas, widget.widget.spriteId);
  if (!sprite) {
    return null;
  }
  return (
    <span
      className="kronosWidgetSprite"
      data-child-id={widget.widget.childId}
      data-source-action-count={widget.widget.actions?.length ?? 0}
      data-sprite-id={widget.widget.spriteId}
      data-widget-id={widget.widget.id}
      style={widgetSpriteStyle(atlas, sprite, widget, order)}
    />
  );
}

function KronosWidgetText({
  clientFonts,
  spriteAtlases,
  widget,
  order
}: {
  readonly clientFonts: KronosClientFontStore;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, KronosHudAtlas>;
  readonly widget: KronosResolvedWidget;
  readonly order: number;
}): JSX.Element | null {
  if (widget.widget.hidden || widget.widget.type !== 4 || !widget.widget.text) {
    return null;
  }
  const font = kronosClientFontDefinitionById(clientFonts, widget.widget.fontId);
  const atlas = font ? spriteAtlases.get(font.sheetId as RuntimeSpriteSheetId) : undefined;
  const text = widget.widget.text;
  const lines = splitKronosWidgetTextLines(text);
  const glyphCount = font && atlas ? glyphCountForText(font, atlas, text) : 0;

  return (
    <span
      className="kronosWidgetText"
      data-font-id={widget.widget.fontId ?? ""}
      data-source-font-archive={font?.fontArchiveName ?? ""}
      data-source-glyph-atlas={font?.sheetId ?? ""}
      data-line-height={widget.widget.lineHeight ?? ""}
      data-text-color={widget.widget.textColor ?? ""}
      data-text-shadowed={widget.widget.textShadowed === undefined ? "" : String(widget.widget.textShadowed)}
      data-x-text-alignment={widget.widget.xTextAlignment ?? ""}
      data-y-text-alignment={widget.widget.yTextAlignment ?? ""}
      data-glyph-count={glyphCount}
      style={widgetTextStyle(widget, order)}
    >
      {font && atlas ? (
        <KronosWidgetGlyphText
          atlas={atlas}
          color={cssRgbColor(widget.widget.textColor, 0xffffff)}
          font={font}
          shadowColor={widget.widget.textShadowed === false ? null : "#000000"}
          text={text}
          widget={widget}
        />
      ) : (
        <span className="kronosWidgetAccessibleText" data-source-glyph-missing="true">
          {text}
        </span>
      )}
    </span>
  );
}

function KronosWidgetGlyphText({
  atlas,
  color,
  font,
  shadowColor,
  text,
  widget
}: {
  readonly atlas: KronosHudAtlas;
  readonly color: string;
  readonly font: KronosClientFontDefinition;
  readonly shadowColor: string | null;
  readonly text: string;
  readonly widget: KronosResolvedWidget;
}): JSX.Element {
  return (
    <KronosSourceGlyphText
      atlas={atlas}
      color={color}
      font={font}
      height={widget.rect.height}
      lineHeight={widget.widget.lineHeight}
      shadowColor={shadowColor}
      text={text}
      width={widget.rect.width}
      xTextAlignment={widget.widget.xTextAlignment}
      yTextAlignment={widget.widget.yTextAlignment}
    />
  );
}

function KronosSourceGlyphText({
  atlas,
  color,
  font,
  height,
  lineHeight,
  shadowColor,
  text,
  width,
  xTextAlignment,
  yTextAlignment
}: {
  readonly atlas: KronosHudAtlas;
  readonly color: string;
  readonly font: KronosClientFontDefinition;
  readonly height: number;
  readonly lineHeight: number | undefined;
  readonly shadowColor: string | null;
  readonly text: string;
  readonly width: number;
  readonly xTextAlignment: number | undefined;
  readonly yTextAlignment: number | undefined;
}): JSX.Element {
  const lines = splitKronosWidgetTextLines(text);
  const baselines = sourceTextBaselines(height, font, lines.length, lineHeight, yTextAlignment);
  const imageUrl = `render/sprites/${atlas.metadata.image}`;
  return (
    <>
      <span className="kronosWidgetAccessibleText">{text}</span>
      {lines.flatMap((line, lineIndex) => {
        const baseline = baselines[lineIndex] ?? font.maxAscent;
        const plainLine = stripKronosTags(line);
        const x = sourceTextLineLeft(width, font, plainLine, xTextAlignment);
        return [
          shadowColor
            ? renderWidgetGlyphRun(atlas, font, imageUrl, plainLine, x + 1, baseline + 1, shadowColor, `shadow-${lineIndex}`)
            : null,
          renderTaggedWidgetGlyphRun(atlas, font, imageUrl, line, x, baseline, color, `text-${lineIndex}`)
        ];
      })}
    </>
  );
}

function renderTaggedWidgetGlyphRun(
  atlas: KronosHudAtlas,
  font: KronosClientFontDefinition,
  imageUrl: string,
  text: string,
  x: number,
  baseline: number,
  color: string,
  keyPrefix: string
): readonly (JSX.Element | null)[] {
  let cursor = 0;
  return kronosTaggedTextRuns(text, color).flatMap((run, runIndex) => {
    const glyphs = renderWidgetGlyphRun(atlas, font, imageUrl, run.text, x + cursor, baseline, run.color, `${keyPrefix}-${runIndex}`);
    cursor += kronosClientFontStringWidth(font, run.text);
    return glyphs;
  });
}

function kronosTaggedTextRuns(
  text: string,
  defaultColor: string
): readonly { readonly text: string; readonly color: string }[] {
  const runs: { text: string; color: string }[] = [];
  const tagPattern = /<col=([0-9a-fA-F]{6})>|<\/col>|<[^>]+>/gi;
  let activeColor = defaultColor;
  let cursor = 0;
  const flush = (end: number): void => {
    if (end <= cursor) {
      return;
    }
    const runText = text.slice(cursor, end);
    if (runText.length > 0) {
      runs.push({ text: runText, color: activeColor });
    }
  };

  for (const match of text.matchAll(tagPattern)) {
    const matchIndex = match.index ?? 0;
    flush(matchIndex);
    if (match[1]) {
      activeColor = `#${match[1].toLowerCase()}`;
    } else if (match[0].toLowerCase() === "</col>") {
      activeColor = defaultColor;
    }
    cursor = matchIndex + match[0].length;
  }
  flush(text.length);
  return runs;
}

function renderWidgetGlyphRun(
  atlas: KronosHudAtlas,
  font: KronosClientFontDefinition,
  imageUrl: string,
  text: string,
  x: number,
  baseline: number,
  color: string,
  keyPrefix: string
): readonly (JSX.Element | null)[] {
  return layoutKronosClientFontGlyphs(font, text).map((glyph, index) => {
    const sprite = atlas.metadata.sprites.find((candidate) => candidate.spriteId === glyph.charCode);
    if (!sprite || glyph.charCode === 32) {
      return null;
    }

    return (
      <span
        key={`${keyPrefix}-${glyph.charCode}-${index}-${glyph.x}`}
        className="kronosWidgetGlyph"
        data-char-code={glyph.charCode}
        data-source-sprite-id={sprite.spriteId}
        style={{
          left: x + glyph.x + (sprite.leftBearing ?? 0),
          top: baseline - font.ascent + (sprite.topBearing ?? 0),
          width: sprite.width,
          height: sprite.height,
          backgroundColor: color,
          WebkitMaskImage: `url(${imageUrl})`,
          maskImage: `url(${imageUrl})`,
          WebkitMaskPosition: `-${sprite.x}px -${sprite.y}px`,
          maskPosition: `-${sprite.x}px -${sprite.y}px`,
          WebkitMaskSize: `${atlas.metadata.width}px ${atlas.metadata.height}px`,
          maskSize: `${atlas.metadata.width}px ${atlas.metadata.height}px`
        }}
      />
    );
  });
}

function splitKronosWidgetTextLines(text: string): readonly string[] {
  const lines = text.split(/<br>/i);
  return lines.length > 0 ? lines : [text];
}

function sourceTextBaselines(
  height: number,
  font: KronosClientFontDefinition,
  lineCount: number,
  lineHeightSource: number | undefined,
  yTextAlignment: number | undefined
): readonly number[] {
  const normalizedLineCount = Math.max(1, lineCount);
  const lineHeight = positiveInteger(lineHeightSource, font.ascent);
  const yAlignment = yTextAlignment ?? 0;
  let firstBaseline: number;
  if (yAlignment === 1) {
    firstBaseline = Math.trunc((height - font.maxAscent - font.maxDescent - lineHeight * (normalizedLineCount - 1)) / 2) + font.maxAscent;
  } else if (yAlignment === 2) {
    firstBaseline = height - font.maxDescent - lineHeight * (normalizedLineCount - 1);
  } else {
    firstBaseline = font.maxAscent;
  }

  return Array.from({ length: normalizedLineCount }, (_, index) => firstBaseline + index * lineHeight);
}

function sourceTextLineLeft(
  width: number,
  font: KronosClientFontDefinition,
  text: string,
  xTextAlignment: number | undefined
): number {
  const textWidth = kronosClientFontStringWidth(font, text);
  if (xTextAlignment === 1) {
    return Math.trunc((width - textWidth) / 2);
  }
  if (xTextAlignment === 2) {
    return width - textWidth;
  }
  return 0;
}

function glyphCountForText(
  font: KronosClientFontDefinition,
  atlas: KronosHudAtlas,
  text: string
): number {
  return splitKronosWidgetTextLines(text).reduce(
    (count, line) =>
      count +
      layoutKronosClientFontGlyphs(font, line).filter(
        (glyph) => glyph.charCode !== 32 && atlas.metadata.sprites.some((sprite) => sprite.spriteId === glyph.charCode)
      ).length,
    0
  );
}

function findSprite(atlas: KronosHudAtlas, alias: string): KronosHudSprite | undefined {
  return atlas.metadata.sprites.find((sprite) => sprite.alias === alias || sprite.name === alias);
}

function findSpriteById(atlas: KronosHudAtlas, spriteId: number): KronosHudSprite | undefined {
  return atlas.metadata.sprites.find((sprite) => sprite.spriteId === spriteId);
}

export function findItemSprite(
  atlas: KronosHudAtlas,
  itemId: number,
  variant: "normal" | "selected",
  quantity: number
): KronosHudSprite | undefined {
  const normalizedQuantity = Math.max(1, Math.trunc(quantity));
  const matches = atlas.metadata.sprites.filter((sprite) => (sprite.itemId ?? sprite.spriteId) === itemId);
  return (
    bestQuantityItemSprite(matches.filter((sprite) => sprite.variant === variant), normalizedQuantity) ??
    bestQuantityItemSprite(matches.filter((sprite) => sprite.variant === "normal"), normalizedQuantity) ??
    matches.find((sprite) => sprite.spriteId === itemId)
  );
}

function bestQuantityItemSprite(sprites: readonly KronosHudSprite[], quantity: number): KronosHudSprite | undefined {
  let best: KronosHudSprite | undefined;
  let bestSourceQuantity = 0;
  for (const sprite of sprites) {
    const sourceQuantity = Math.max(1, Math.trunc(sprite.sourceQuantity ?? 1));
    if (sourceQuantity > quantity || sourceQuantity < bestSourceQuantity) {
      continue;
    }
    if (sourceQuantity > bestSourceQuantity || (sourceQuantity === bestSourceQuantity && sprite.quantityVariant && !best?.quantityVariant)) {
      best = sprite;
      bestSourceQuantity = sourceQuantity;
    }
  }
  return best ?? sprites[0];
}

function inventoryDragOffset(
  state: {
    readonly startX: number;
    readonly startY: number;
    readonly currentX: number;
    readonly currentY: number;
  } | null,
  element: HTMLElement | null
): { readonly x: number; readonly y: number } {
  if (!state) {
    return { x: 0, y: 0 };
  }
  const delta = inventoryDragDelta(state, element);
  return {
    x: Math.abs(delta.x) < inventoryDragThresholdPixels ? 0 : delta.x,
    y: Math.abs(delta.y) < inventoryDragThresholdPixels ? 0 : delta.y
  };
}

function inventoryDragDelta(
  state: {
    readonly startX: number;
    readonly startY: number;
    readonly currentX: number;
    readonly currentY: number;
  },
  element: HTMLElement | null
): { readonly x: number; readonly y: number } {
  const scale = inventoryDragScale(element);
  return {
    x: (state.currentX - state.startX) / scale.x,
    y: (state.currentY - state.startY) / scale.y
  };
}

function inventoryDragScale(element: HTMLElement | null): { readonly x: number; readonly y: number } {
  const panel = element?.closest(".runeliteClientPanel") as HTMLElement | null;
  if (panel) {
    const rect = panel.getBoundingClientRect();
    const sourceWidth = positiveInteger(Number.parseFloat(panel.dataset.sourceWidth ?? ""), panel.offsetWidth || rect.width);
    const sourceHeight = positiveInteger(Number.parseFloat(panel.dataset.sourceHeight ?? ""), panel.offsetHeight || rect.height);
    return {
      x: positiveScale(rect.width / sourceWidth),
      y: positiveScale(rect.height / sourceHeight)
    };
  }

  if (!element) {
    return { x: 1, y: 1 };
  }

  const rect = element.getBoundingClientRect();
  return {
    x: positiveScale(rect.width / (element.offsetWidth || rect.width)),
    y: positiveScale(rect.height / (element.offsetHeight || rect.height))
  };
}

function positiveScale(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function inventoryDragDelayMsFromClientTicks(clientTicks: number | undefined): number {
  const normalizedClientTicks =
    typeof clientTicks === "number" && Number.isFinite(clientTicks)
      ? Math.max(0, Math.trunc(clientTicks))
      : inventoryDefaultDragDelayClientTicks;
  return normalizedClientTicks * inventoryClientTickMs;
}

function normalizedInventorySlotFromElement(element: HTMLElement | null | undefined): RuntimeInventorySlot | null {
  const itemId = element?.dataset.inventoryItemId ? Number.parseInt(element.dataset.inventoryItemId, 10) : Number.NaN;
  const quantity = element?.dataset.inventoryItemQuantity ? Number.parseInt(element.dataset.inventoryItemQuantity, 10) : Number.NaN;
  if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isInteger(quantity) || quantity < 0) {
    return null;
  }
  return { itemId, quantity };
}

function inventorySlotElementFromPoint(clientX: number, clientY: number): HTMLElement | null {
  for (const slot of Array.from(document.querySelectorAll<HTMLElement>("[data-inventory-slot-index]"))) {
    const rect = slot.getBoundingClientRect();
    if (clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom) {
      return slot;
    }
  }
  return null;
}

const kronosPlayerAppearanceEquipmentContainerSlots = new Set<number>([0, 1, 2, 3, 4, 5, 7, 9, 10]);

function localPlayerEquipmentItemIdsBySlot(
  snapshot: RuntimeSceneSnapshot,
  equipmentDefinitions: KronosInventoryEquipmentDefinitionStore
): ReadonlyMap<number, number> {
  const actor = snapshot.actors.find((candidate) => candidate.actorId === "local-player");
  if (!actor) {
    return new Map();
  }

  const itemIdsBySlot = new Map<number, number>();
  const explicitlyEmptySlots = new Set<number>();
  for (let slot = 0; slot < (actor.appearance?.equipmentSlots?.length ?? 0); slot += 1) {
    const encoded = actor.appearance?.equipmentSlots?.[slot] ?? 0;
    if (encoded >= 512 && encoded !== 65535) {
      itemIdsBySlot.set(slot, encoded - 512);
    } else if (actor.appearance?.source === "loadout" && kronosPlayerAppearanceEquipmentContainerSlots.has(slot)) {
      explicitlyEmptySlots.add(slot);
    }
  }

  const loadoutItemIds = runtimeLoadouts.find((candidate) => candidate.id === actor.loadoutId)?.itemIds ?? [];
  const appearanceItemIds = actor.appearance?.itemIds ?? [];
  for (const itemId of appearanceItemIds) {
    const equipSlot = equipmentDefinitions.get(itemId)?.equipSlot;
    if (equipSlot !== null && equipSlot !== undefined && equipSlot >= 0 && !itemIdsBySlot.has(equipSlot)) {
      itemIdsBySlot.set(equipSlot, itemId);
    }
  }
  for (const itemId of loadoutItemIds) {
    const equipSlot = equipmentDefinitions.get(itemId)?.equipSlot;
    if (
      equipSlot !== null &&
      equipSlot !== undefined &&
      equipSlot >= 0 &&
      !itemIdsBySlot.has(equipSlot) &&
      !explicitlyEmptySlots.has(equipSlot)
    ) {
      itemIdsBySlot.set(equipSlot, itemId);
    }
  }

  return itemIdsBySlot;
}

function findMinimapDotSprite(
  atlas: KronosHudAtlas,
  kind: KronosMinimapDot["kind"],
  sourceSpriteIndex = kronosMinimapMapDotSpriteIndex(kind)
): KronosHudSprite | undefined {
  const alias = `map_dot_${kind.replace("-", "_")}`;
  return atlas.metadata.sprites.find((sprite) => sprite.alias === alias) ?? atlas.metadata.sprites.find((sprite) => sprite.frame === sourceSpriteIndex);
}

function findMinimapMarkerSprite(
  atlas: KronosHudAtlas,
  kind: KronosMinimapMarker["kind"],
  sourceSpriteIndex = kronosMinimapMapMarkerSpriteIndex(kind)
): KronosHudSprite | undefined {
  const alias = `map_marker_${kind}`;
  return atlas.metadata.sprites.find((sprite) => sprite.alias === alias) ?? atlas.metadata.sprites.find((sprite) => sprite.frame === sourceSpriteIndex);
}

function findMinimapMapSceneSprite(atlas: KronosHudAtlas, mapSceneId: number): KronosHudSprite | undefined {
  const alias = `map_scene_${mapSceneId}`;
  return atlas.metadata.sprites.find((sprite) => sprite.alias === alias) ?? atlas.metadata.sprites.find((sprite) => sprite.frame === mapSceneId);
}

function findMinimapMapIconSprite(atlas: KronosHudAtlas, mapIconId: number): KronosHudSprite | undefined {
  const alias = `map_icon_area_${mapIconId}`;
  return atlas.metadata.sprites.find((sprite) => sprite.areaId === mapIconId || sprite.alias === alias);
}

function widgetSpriteStyle(
  atlas: KronosHudAtlas,
  sprite: KronosHudSprite,
  widget: KronosResolvedWidget,
  order: number
): CSSProperties {
  const maxWidth = positiveInteger(sprite.maxWidth, sprite.width);
  const maxHeight = positiveInteger(sprite.maxHeight, sprite.height);
  const unscaled =
    (widget.rect.width === sprite.width && widget.rect.height === sprite.height) ||
    (widget.rect.width === maxWidth && widget.rect.height === maxHeight);
  const scaleX = widget.rect.width / maxWidth;
  const scaleY = widget.rect.height / maxHeight;
  const base = unscaled ? spriteStyle(atlas, sprite) : scaledSpriteStyle(atlas, sprite, scaleX, scaleY);

  return {
    ...base,
    left: widget.rect.x,
    top: widget.rect.y,
    zIndex: order + 1
  };
}

function widgetTextStyle(widget: KronosResolvedWidget, order: number): CSSProperties {
  return {
    left: widget.rect.x,
    top: widget.rect.y,
    width: widget.rect.width,
    height: widget.rect.height,
    zIndex: order + 1
  };
}

function widgetRectangleStyle(widget: KronosResolvedWidget, order: number): CSSProperties {
  return {
    ...rectStyle(widget.rect),
    backgroundColor: cssRgbColor(widget.widget.textColor, 0x000000),
    zIndex: order + 1
  };
}

function combatSourceSpriteContainerStyle(rect: KronosRect): CSSProperties {
  return {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    overflow: "hidden"
  };
}

interface KronosCombatOptionsButtonFramePieceLayout {
  readonly key: string;
  readonly rect: KronosRect;
  readonly tileX: boolean;
  readonly tileY: boolean;
}

function kronosCombatOptionsButtonFramePieces(rect: KronosRect): readonly KronosCombatOptionsButtonFramePieceLayout[] {
  const border = combatOptionsButtonFrameBorder;
  const innerWidth = Math.max(0, rect.width - 2 * border);
  const innerHeight = Math.max(0, rect.height - 2 * border);
  const right = Math.max(0, rect.width - border);
  const bottom = Math.max(0, rect.height - border);
  return [
    { key: "top-left", rect: { x: 0, y: 0, width: border, height: border }, tileX: false, tileY: false },
    { key: "top", rect: { x: border, y: 0, width: innerWidth, height: border }, tileX: true, tileY: false },
    { key: "top-right", rect: { x: right, y: 0, width: border, height: border }, tileX: false, tileY: false },
    { key: "left", rect: { x: 0, y: border, width: border, height: innerHeight }, tileX: false, tileY: true },
    { key: "middle", rect: { x: border, y: border, width: innerWidth, height: innerHeight }, tileX: true, tileY: true },
    { key: "right", rect: { x: right, y: border, width: border, height: innerHeight }, tileX: false, tileY: true },
    { key: "bottom-left", rect: { x: 0, y: bottom, width: border, height: border }, tileX: false, tileY: false },
    { key: "bottom", rect: { x: border, y: bottom, width: innerWidth, height: border }, tileX: true, tileY: false },
    { key: "bottom-right", rect: { x: right, y: bottom, width: border, height: border }, tileX: false, tileY: false }
  ];
}

function combatOptionsButtonPieceStyle(rect: KronosRect): CSSProperties {
  return {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    overflow: "hidden",
    pointerEvents: "none",
    position: "absolute"
  };
}

function kronosCombatStyleButtonSourcePieceRect(sprite: KronosHudSprite, key: string): KronosRect {
  const border = combatOptionsButtonFrameBorder;
  const innerWidth = Math.max(1, sprite.width - 2 * border);
  const innerHeight = Math.max(1, sprite.height - 2 * border);
  const right = Math.max(0, sprite.width - border);
  const bottom = Math.max(0, sprite.height - border);
  switch (key) {
    case "top-left":
      return { x: 0, y: 0, width: border, height: border };
    case "top":
      return { x: border, y: 0, width: innerWidth, height: border };
    case "top-right":
      return { x: right, y: 0, width: border, height: border };
    case "left":
      return { x: 0, y: border, width: border, height: innerHeight };
    case "middle":
      return { x: border, y: border, width: innerWidth, height: innerHeight };
    case "right":
      return { x: right, y: border, width: border, height: innerHeight };
    case "bottom-left":
      return { x: 0, y: bottom, width: border, height: border };
    case "bottom":
      return { x: border, y: bottom, width: innerWidth, height: border };
    case "bottom-right":
      return { x: right, y: bottom, width: border, height: border };
    default:
      return { x: 0, y: 0, width: sprite.width, height: sprite.height };
  }
}

function combatSlicedSpriteTileStyle(
  atlas: KronosHudAtlas,
  sprite: KronosHudSprite,
  sourceRect: KronosRect,
  left: number,
  top: number
): CSSProperties {
  return {
    backgroundImage: `url(render/sprites/${atlas.metadata.image})`,
    backgroundPosition: `${-(sprite.x + sourceRect.x)}px ${-(sprite.y + sourceRect.y)}px`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${atlas.metadata.width}px ${atlas.metadata.height}px`,
    display: "block",
    height: sourceRect.height,
    imageRendering: "pixelated",
    left,
    position: "absolute",
    top,
    width: sourceRect.width
  };
}

function equipmentItemSpriteStyle(
  atlas: KronosHudAtlas,
  sprite: KronosHudSprite,
  slot: KronosEquipmentSlotLayout
): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: slot.rect.x + Math.trunc((slot.rect.width - sprite.width) / 2),
    top: slot.rect.y + Math.trunc((slot.rect.height - sprite.height) / 2),
    zIndex: 3
  };
}

function equipmentSlotTileSpriteStyle(
  atlas: KronosHudAtlas,
  sprite: KronosHudSprite,
  slot: KronosEquipmentSlotLayout
): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: slot.rect.x,
    top: slot.rect.y,
    zIndex: 1
  };
}

function equipmentItemButtonStyle(slot: KronosEquipmentSlotLayout): CSSProperties {
  return {
    left: slot.rect.x,
    top: slot.rect.y,
    width: slot.rect.width,
    height: slot.rect.height,
    zIndex: 4
  };
}

function equipmentUtilityButtonSpriteStyle(atlas: KronosHudAtlas, sprite: KronosHudSprite, rect: KronosRect): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: rect.x,
    top: rect.y
  };
}

function prayerIconSpriteStyle(
  atlas: KronosHudAtlas,
  sprite: KronosHudSprite,
  slot: KronosPrayerSlotLayout
): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: slot.rect.x + Math.trunc((slot.rect.width - prayerIconGraphicSize.width) / 2),
    top: slot.rect.y + Math.trunc((slot.rect.height - prayerIconGraphicSize.height) / 2)
  };
}

function prayerActiveBackgroundStyle(
  atlas: KronosHudAtlas,
  sprite: KronosHudSprite,
  slot: KronosPrayerSlotLayout
): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: slot.rect.x,
    top: slot.rect.y
  };
}

function spellbookIconButtonStyle(spell: KronosSpellbookSpellLayout): CSSProperties {
  return {
    left: spell.rect.x,
    top: spell.rect.y,
    width: spell.rect.width,
    height: spell.rect.height
  };
}

function spellbookIconGraphicStyle(atlas: KronosHudAtlas, sprite: KronosHudSprite): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: 0,
    position: "absolute",
    pointerEvents: "none",
    top: 0
  };
}

function statsTileSpriteStyle(
  atlas: KronosHudAtlas,
  sprite: KronosHudSprite,
  slot: KronosStatsSkillSlotLayout,
  side: "left" | "right"
): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: side === "left" ? slot.rect.x - 2 : slot.rect.x + 28,
    top: slot.rect.y - 2,
    zIndex: 1
  };
}

function statsSkillIconSpriteStyle(
  atlas: KronosHudAtlas,
  sprite: KronosHudSprite,
  slot: KronosStatsSkillSlotLayout
): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: slot.rect.x + Math.trunc((30 - sprite.width) / 2),
    top: slot.rect.y + Math.trunc((slot.rect.height - sprite.height) / 2),
    zIndex: 2
  };
}

function statsSkillButtonStyle(slot: KronosStatsSkillSlotLayout): CSSProperties {
  return {
    ...rectStyle(slot.rect),
    zIndex: 4
  };
}

function statsSkillLevelTextRect(
  slot: KronosStatsSkillSlotLayout,
  kind: "current" | "fixed"
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  if (kind === "current") {
    return { x: slot.rect.x + 32, y: slot.rect.y + 4, width: 15, height: 12 };
  }
  return { x: slot.rect.x + 44, y: slot.rect.y + 16, width: 15, height: 12 };
}

function isStatsEnabledSkill(slot: KronosStatsSkillSlotLayout): boolean {
  const index = statsLevelArrayIndex(slot);
  return index >= 0 && index < statsEnabledSkillCount;
}

function statsLevelArrayIndex(slot: KronosStatsSkillSlotLayout): number {
  return statsLevelArrayIndexBySkillId[slot.id] ?? -1;
}

function skillStateForSlot(hud: RuntimeHudState, slot: KronosStatsSkillSlotLayout): RuntimeSkillState {
  const skillId = slot.id as RuntimeSkillId;
  const value = hud.skills?.[skillId] ?? defaultRuntimeSkillStates[skillId];
  return {
    current: normalizeSkillLevel(value.current),
    fixed: Math.max(1, normalizeSkillLevel(value.fixed))
  };
}

function normalizeSkillLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(999, Math.trunc(value)));
}

function cssRgbColor(value: number | undefined, fallback: number): string {
  const normalized = Number.isFinite(value) ? Math.trunc(value as number) : fallback;
  return `#${(normalized & 0xffffff).toString(16).padStart(6, "0")}`;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : fallback;
}

function spriteStyle(atlas: KronosHudAtlas, sprite: KronosHudSprite): CSSProperties {
  return {
    display: "block",
    width: sprite.width,
    height: sprite.height,
    backgroundImage: `url(render/sprites/${atlas.metadata.image})`,
    backgroundPosition: `-${sprite.x}px -${sprite.y}px`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${atlas.metadata.width}px ${atlas.metadata.height}px`,
    transform: `translate(${sprite.offsetX}px, ${sprite.offsetY}px)`
  };
}

function inventoryItemSpriteStyle(
  atlas: KronosHudAtlas,
  sprite: KronosHudSprite,
  dragOffset: { readonly x: number; readonly y: number } | null
): CSSProperties {
  const base = spriteStyle(atlas, sprite);
  if (!dragOffset) {
    return base;
  }
  return {
    ...base,
    opacity: inventoryDragAlpha,
    position: "relative",
    zIndex: 20,
    transform: `${base.transform ?? ""} translate(${dragOffset.x}px, ${dragOffset.y}px)`
  };
}

function scaledSpriteStyle(
  atlas: KronosHudAtlas,
  sprite: KronosHudSprite,
  scaleX: number,
  scaleY: number
): CSSProperties {
  return {
    display: "block",
    width: sprite.width * scaleX,
    height: sprite.height * scaleY,
    backgroundImage: `url(render/sprites/${atlas.metadata.image})`,
    backgroundPosition: `${-sprite.x * scaleX}px ${-sprite.y * scaleY}px`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${atlas.metadata.width * scaleX}px ${atlas.metadata.height * scaleY}px`,
    transform: `translate(${sprite.offsetX * scaleX}px, ${sprite.offsetY * scaleY}px)`
  };
}
