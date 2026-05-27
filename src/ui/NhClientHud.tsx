import { Fragment, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import equipmentRowsJson from "../generated/equipment-bonuses.json";
import emotesJson from "../../fixtures/assets/defs/emotes.json";
import { aggregateBonuses, zeroBonuses, type BonusKey, type BonusTable } from "../sim/combat/formulas";
import type { EquipmentBonusRow } from "../sim/equipment/equipment";
import type {
  NhCombatAutoRetaliateLayout,
  NhCombatAutocastControlLayout,
  NhCombatPanelLayout,
  NhCombatSpecialBarLayout,
  NhCombatStyleSlotLayout,
  NhCombatTextLayout,
  NhEquipmentPanelLayout,
  NhEquipmentSlotLayout,
  NhEquipmentUtilityButtonLayout,
  NhFixedClientCssLayout,
  NhFixedClientLayout,
  NhFixedOrbId,
  NhFixedOrbLayout,
  NhXpDropOrbLayout,
  NhFixedSidePanelLayout,
  NhFixedSideTabId,
  NhFixedSideTabLayout,
  NhInventoryGridLayout,
  NhMountedInterfaceLayout,
  NhPrayerPanelLayout,
  NhPrayerId,
  NhPrayerSlotLayout,
  NhRect,
  NhResolvedWidget,
  NhStatsPanelLayout,
  NhStatsSkillSlotLayout,
  NhSpellbookId,
  NhSpellbookPanelLayout,
  NhSpellbookSpellLayout
} from "../render/nhFixedLayout";
import {
  NH_CLAN_CHAT_GROUP_ID,
  NH_COMBAT_GROUP_ID,
  NH_EMOTES_GROUP_ID,
  NH_FRIENDS_GROUP_ID,
  NH_IGNORES_GROUP_ID,
  NH_NOTICEBOARD_GROUP_ID,
  NH_OPTIONS_GROUP_ID
} from "../render/nhFixedLayout";
import {
  nhAttackStyleLabel,
  nhAttackTypeLabel,
  nhCombatLevelFromHud,
  nhWeaponTypeDefinitionByConfig,
  type NhWeaponAttackSetDefinition,
  type NhWeaponTypeDefinition,
  type NhWeaponTypeDefinitionStore
} from "../render/nhCombat";
import {
  nhActivePrayerIds,
  nhPrayerDefinition,
  nhPrayerDisallowedIds,
  type NhPrayerDefinition
} from "../render/nhPrayer";
import {
  nhClientFontDefinitionById,
  nhClientFontStringWidth,
  layoutNhClientFontGlyphs,
  type NhClientFontDefinition,
  type NhClientFontStore
} from "../render/nhClientFonts";
import {
  nhInventoryQuantityText,
  normalizeNhInventorySlots,
  type NhInventoryEquipmentDefinition,
  type NhInventoryEquipmentDefinitionStore,
  type NhInventoryItemDefinition,
  type NhInventoryItemDefinitionStore,
  type NhInventorySelectedItem
} from "../render/nhInventory";
import type { NhSelectedSpell } from "../render/nhSceneObjects";
import {
  NH_MINIMAP_LOCAL_PLAYER_DOT_COLOR,
  NH_MINIMAP_LOCAL_PLAYER_DOT_SIZE,
  nhMinimapActorTile,
  nhMinimapClickToTile,
  nhMinimapDestinationMarker,
  nhMinimapDotsForSnapshot,
  nhMinimapHintMarker,
  nhMinimapLocalPlayerDot,
  nhMinimapMapIconForObject,
  nhMinimapMapIconForSource,
  nhMinimapMapMarkerSpriteIndex,
  nhMinimapMapDotSpriteIndex,
  type NhMinimapDot,
  type NhMinimapMapIcon,
  type NhMinimapMarker,
  type NhMinimapSpriteMask
} from "../render/nhMinimap";
import {
  nhMinimapSceneTransform,
  type NhMinimapSceneCell,
  type NhMinimapSceneMapSceneObject,
  type NhMinimapSceneOverlayPixel,
  type NhMinimapSceneSegment,
  type NhMinimapSceneSprite,
  type NhMinimapSceneTransform
} from "../render/nhMinimapScene";
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
  NH_GAME_KEYBIND_INTERFACE_ID,
  NH_GAME_KEYBIND_KEY_OPTIONS,
  NH_GAME_KEYBIND_SOURCE,
  NH_GAME_KEYBIND_TAB_SPECS,
  nhGameKeybindLabelForSlot,
  nhGameKeybindSourceKeyForSlot,
  type NhGameKeybindKeySlot,
  type NhGameKeybindSnapshot,
  type NhGameKeybindTabSpec
} from "./nhGameKeybinds";
import {
  NH_CAMERA_DEFAULT_ZOOM,
  nhCameraZoomFromSliderOffset,
  nhCameraZoomSliderOffset,
  type NhCameraZoom
} from "../render/nhClientCamera";
import {
  nhMagicSpellCurrentLevelCanCast,
  nhMagicSpellLevelFilterAllows,
  nhMagicSpellLevelRequirement
} from "../sim/magic/spellRequirements";

export interface NhHudSprite {
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

interface NhHudAtlasMetadata {
  readonly id?: string;
  readonly image: string;
  readonly width: number;
  readonly height: number;
  readonly sprites: readonly NhHudSprite[];
}

export interface NhHudAtlas {
  readonly metadata: NhHudAtlasMetadata;
}

interface NhEmoteDefinition {
  readonly slot: number;
  readonly sourceOrder: number;
  readonly label: string;
  readonly unlockedSpriteId: number;
  readonly lockedSpriteId: number;
}

interface NhEmoteDefinitionStore {
  readonly source: string;
  readonly nameEnumId: number;
  readonly unlockedSpriteEnumId: number;
  readonly lockedSpriteEnumId: number;
  readonly minSlot: number;
  readonly maxSlot: number;
  readonly emotes: readonly NhEmoteDefinition[];
}

interface NhEmoteServerSpec {
  readonly slot: number;
  readonly label: string;
  readonly animationId: number;
  readonly graphicsId?: number;
}

interface NhEmoteSpec extends NhEmoteServerSpec {
  readonly sourceOrder: number;
  readonly unlockedSpriteId: number;
  readonly lockedSpriteId: number;
}

const nhEquipmentBonusRows = equipmentRowsJson as readonly EquipmentBonusRow[];
const nhEmoteDefinitions = emotesJson as NhEmoteDefinitionStore;
const nhEmoteDefinitionsBySlot = new Map(nhEmoteDefinitions.emotes.map((entry) => [entry.slot, entry]));
const nhEquipmentBonusRowsByItemId = new Map(nhEquipmentBonusRows.map((row) => [row.id, row]));
const nhEquipmentStatsFontId = 494;
const equipmentStatsTextColor = "#ff981f";
const equipmentStatsValueColor = "#ffff00";
const equipmentStatsWhiteColor = "#ffffff";
const nhNoticeboardGreenTag = "<col=27ae60>";
const nhNoticeboardCloseTag = "</col>";
const combatTabVisibleSpecBarWithoutServerSpecialItemIds = new Set([21902]);
const nhNoticeboardBaseXpChildId = 17;
const nhNoticeboardVisibleTextChildIds = new Set([nhNoticeboardBaseXpChildId]);
const nhNoticeboardSourceTextChildIds = new Set([
  7, 8, 9, 10, 11, 12, 13, 43, 44, 45, 46, 47, 14, 15, 16, 17, 18, 48, 49, 50, 51, 52, 53, 19, 20, 21, 22
]);
const nhNoticeboardClipChildId = 4;
const nhEmoteScrollableChildId = 1;
const nhEmoteScrollbarChildId = 2;
const nhFriendsListRowsClipChildId = 11;
const nhFriendsListDynamicTextChildId = 13;
const nhFriendsListSwitchChildId = 1;
const nhFriendsListAddChildId = 14;
const nhFriendsListDeleteChildId = 16;
const nhIgnoreListRowsClipChildId = 9;
const nhIgnoreListDynamicTextChildId = 11;
const nhIgnoreListSwitchChildId = 1;
const nhIgnoreListAddChildId = 12;
const nhIgnoreListDeleteChildId = 14;
const nhSocialRowHeight = 15;
const nhClanChatNameChildId = 4;
const nhClanChatOwnerChildId = 6;
const nhClanChatRowsClipChildId = 16;
const nhClanChatJoinLeaveChildId = 22;
const nhClanChatSetupChildId = 24;
const nhClanChatRowHeight = 15;
const nhEmoteColumns = 4;
const nhEmoteButtonSize = { width: 42, height: 48 } as const;
const nhEmoteButtonStep = { width: 43, height: 49 } as const;
const nhEmoteFirstRowOffsetY = 6;
const nhEmoteServerSpecs: readonly NhEmoteServerSpec[] = [
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
const nhEmoteSpecs: readonly NhEmoteSpec[] = nhEmoteServerSpecs.flatMap((spec) => {
  const definition = nhEmoteDefinitionsBySlot.get(spec.slot);
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

interface NhClientHudProps {
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
  readonly layout: NhFixedClientCssLayout | null;
  readonly sourceLayout: NhFixedClientLayout | null;
  readonly snapshot: RuntimeSceneSnapshot;
  readonly minimapDestinationTile: RuntimeTile | null;
  readonly minimapCameraYaw: number;
  readonly minimapSceneSprite: NhMinimapSceneSprite | null;
  readonly cameraZoom?: NhCameraZoom;
  readonly onCameraZoomChange?: (zoom: NhCameraZoom) => void;
  readonly onCameraZoomReset?: () => void;
  readonly onMinimapTileCommand?: (command: NhMinimapTileCommand) => void;
  readonly onInventoryContextMenu?: (command: NhInventorySlotCommand) => void;
  readonly onInventoryEmptyContextMenu?: (command: NhInventoryEmptyCommand) => void;
  readonly onInventoryDefaultAction?: (command: NhInventorySlotCommand) => void;
  readonly onInventoryDragReorder?: (command: NhInventorySlotDragCommand) => void;
  readonly onInventoryHover?: (command: NhInventorySlotCommand | null) => void;
  readonly onEquipmentItemContextMenu?: (command: NhEquipmentItemCommand) => void;
  readonly onEquipmentItemDefaultAction?: (command: NhEquipmentItemCommand) => void;
  readonly onEquipmentItemHover?: (command: NhEquipmentItemCommand | null) => void;
  readonly onStatsSkillDefaultAction?: (command: NhStatsSkillCommand) => void;
  readonly onSpellDefaultAction?: (command: NhSpellbookSpellCommand) => void;
  readonly onSpellDragReorder?: (command: NhSpellbookSpellDragCommand) => void;
  readonly onCombatStyleDefaultAction?: (command: NhCombatStyleCommand) => void;
  readonly onCombatAutocastDefaultAction?: (command: NhCombatAutocastCommand) => void;
  readonly onCombatAutoRetaliateDefaultAction?: (command: NhCombatAutoRetaliateCommand) => void;
  readonly onCombatSpecialDefaultAction?: (command: NhCombatSpecialCommand) => void;
  readonly onPrayerDefaultAction?: (command: NhPrayerSlotCommand) => void;
  readonly onPrayerDragReorder?: (command: NhPrayerSlotDragCommand) => void;
  readonly onRunOrbDefaultAction?: (command: NhRunOrbCommand) => void;
  readonly onXpDropOrbDefaultAction?: (command: NhXpDropOrbCommand) => void;
  readonly onXpDropOrbContextMenu?: (command: NhXpDropOrbCommand) => void;
  readonly gameKeybinds?: NhGameKeybindSnapshot;
  readonly gameKeybindInterfaceOpen?: boolean;
  readonly gameKeybindSelectedTabId?: NhFixedSideTabId;
  readonly onGameKeybindInterfaceOpen?: () => void;
  readonly onGameKeybindInterfaceClose?: () => void;
  readonly onGameKeybindSelectedTabChange?: (tabId: NhFixedSideTabId) => void;
  readonly onGameKeybindChange?: (tabId: NhFixedSideTabId, keySlot: NhGameKeybindKeySlot) => void;
  readonly onGameKeybindEscapeCloseChange?: (escapeCloses: boolean) => void;
  readonly onGameKeybindRestoreDefaults?: (mode: "osrs" | "pre-eoc") => void;
  readonly onChatboxContextMenu?: (command: NhChatboxButtonCommand) => void;
  readonly onChatboxDefaultAction?: (command: NhChatboxButtonCommand) => void;
  readonly onChatboxHover?: (command: NhChatboxButtonCommand | null) => void;
  readonly socialLists?: NhSocialListsSnapshot;
  readonly onSocialButtonDefaultAction?: (command: NhSocialButtonCommand) => void;
  readonly clanChat?: NhClanChatSnapshot;
  readonly onClanChatButtonDefaultAction?: (command: NhClanChatButtonCommand) => void;
  readonly onEquipmentUtilityDefaultAction?: (command: NhEquipmentUtilityButtonCommand) => void;
  readonly equipmentUtilityPanelMode?: NhEquipmentUtilityPanelMode | null;
  readonly onEquipmentUtilityPanelClose?: () => void;
  readonly activeSideTabId?: NhFixedSideTabId;
  readonly activeSpellbookId?: NhSpellbookId;
  readonly onSideTabContextMenu?: (command: NhSideTabCommand) => void;
  readonly onSideTabDefaultAction?: (command: NhSideTabCommand) => void;
  readonly onSideTabHover?: (command: NhSideTabCommand | null) => void;
  readonly inventoryItemDefinitions: NhInventoryItemDefinitionStore;
  readonly inventoryEquipmentDefinitions: NhInventoryEquipmentDefinitionStore;
  readonly weaponTypeDefinitions: NhWeaponTypeDefinitionStore;
  readonly inventorySlots: readonly (RuntimeInventorySlot | null)[];
  readonly inventoryDragDelayClientTicks?: number;
  readonly drawSpecbarAnyway?: boolean;
  readonly attackStylesConfig?: RuneliteAttackStylesConfigSnapshot | null;
  readonly selectedInventoryItem?: NhInventorySelectedItem | null;
  readonly selectedSpell?: NhSelectedSpell | null;
  readonly prayerReorderingEnabled?: boolean;
  readonly prayerOrder?: readonly string[];
  readonly spellbookReorderingEnabled?: boolean;
  readonly spellbookOrder?: readonly string[];
  readonly pendingEquipSlotIndices?: ReadonlySet<number>;
  readonly pendingEquipmentRemoveSlotIds?: ReadonlySet<string>;
  readonly runOrbTextOverride?: string | null;
  readonly xpDropCounterShown?: boolean;
  readonly hud: RuntimeHudState;
  readonly clientFonts: NhClientFontStore;
}

export interface NhMinimapTileCommand {
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

export interface NhRunOrbCommand {
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

export interface NhXpDropOrbCommand {
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

export interface NhInventorySlotCommand {
  readonly slotIndex: number;
  readonly slot: RuntimeInventorySlot;
  readonly widgetId: number;
  readonly itemName?: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface NhInventoryEmptyCommand {
  readonly widgetId: number;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface NhInventorySlotDragCommand {
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

export interface NhPrayerSlotDragCommand {
  readonly sourcePrayerId: string;
  readonly destinationPrayerId: string;
  readonly sourceSlot: NhPrayerSlotLayout;
  readonly destinationSlot: NhPrayerSlotLayout;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface NhSpellbookSpellDragCommand {
  readonly spellbookId: NhSpellbookId;
  readonly sourceSpellId: string;
  readonly destinationSpellId: string;
  readonly sourceSpell: NhSpellbookSpellLayout;
  readonly destinationSpell: NhSpellbookSpellLayout;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface NhEquipmentItemCommand {
  readonly slot: NhEquipmentSlotLayout;
  readonly itemId: number;
  readonly itemName: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface NhSideTabCommand {
  readonly tab: NhFixedSideTabLayout;
  readonly actionText: string;
  readonly actionIndex: number;
  readonly menuOpcode: number;
  readonly sourceActions: readonly NhSourceWidgetAction[];
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface NhStatsSkillCommand {
  readonly slot: NhStatsSkillSlotLayout;
  readonly actionText: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface NhSpellbookSpellCommand {
  readonly spell: NhSpellbookSpellLayout;
  readonly actionName: string;
  readonly selectedSpellName: string;
  readonly targetFlags: number;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface NhCombatStyleCommand {
  readonly slot: NhCombatStyleSlotLayout;
  readonly attackSet: NhWeaponAttackSetDefinition;
  readonly weaponType: NhWeaponTypeDefinition;
  readonly actionText: string;
  readonly attackSetVarpId: number;
  readonly previousAttackSetIndex: number | null;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface NhCombatAutocastCommand {
  readonly control: NhCombatAutocastControlLayout;
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

export interface NhCombatAutoRetaliateCommand {
  readonly control: NhCombatAutoRetaliateLayout;
  readonly actionText: string;
  readonly autoRetaliateVarpId: number;
  readonly enabled: boolean | undefined;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface NhCombatSpecialCommand {
  readonly specialBar?: NhCombatSpecialBarLayout;
  readonly specialOrb?: NhFixedOrbLayout;
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

export interface NhPrayerSlotCommand {
  readonly slot: NhPrayerSlotLayout;
  readonly definition: NhPrayerDefinition;
  readonly actionText: string;
  readonly active: boolean;
  readonly activePrayerIds: readonly NhPrayerSlotLayout["id"][];
  readonly disallowedPrayerIds: readonly NhPrayerSlotLayout["id"][];
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export type NhChatboxButtonId = "all" | "game" | "public" | "private" | "clan" | "trade" | "report";

export interface NhChatboxButtonCommand {
  readonly buttonId: NhChatboxButtonId;
  readonly label: string;
  readonly widget: NhResolvedWidget;
  readonly actionText: string;
  readonly actionIndex: number;
  readonly menuOpcode: number;
  readonly actions: readonly string[];
  readonly sourceActions: readonly NhSourceWidgetAction[];
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface NhSourceWidgetAction {
  readonly actionIndex: number;
  readonly actionText: string;
  readonly menuOpcode: number;
}

export interface NhSocialMember {
  readonly name: string;
  readonly previousName?: string;
  readonly world: number;
  readonly rank?: number;
}

export interface NhSocialListsSnapshot {
  readonly friends: readonly NhSocialMember[];
  readonly ignores: readonly NhSocialMember[];
  readonly loaded: boolean;
}

export type NhSocialListKind = "friends" | "ignores";

export type NhSocialButtonAction = "switch" | "add" | "delete";

export interface NhSocialButtonCommand {
  readonly action: NhSocialButtonAction;
  readonly list: NhSocialListKind;
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

export interface NhClanChatMember {
  readonly name: string;
  readonly world: number;
  readonly rank: number;
  readonly self?: boolean;
  readonly friend?: boolean;
  readonly ignored?: boolean;
}

export interface NhClanChatSnapshot {
  readonly active: boolean;
  readonly displayName: string;
  readonly ownerName: string;
  readonly localRank: number;
  readonly minKickRank: number;
  readonly members: readonly NhClanChatMember[];
}

export type NhClanChatButtonAction = "join" | "leave" | "setup";

export interface NhClanChatButtonCommand {
  readonly action: NhClanChatButtonAction;
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

export interface NhEquipmentUtilityButtonCommand {
  readonly button: NhEquipmentUtilityButtonLayout;
  readonly actionText: string;
  readonly actionIndex: number;
  readonly menuOpcode: number;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export type NhEquipmentUtilityPanelMode = "stats" | "items-kept-on-death" | "guide-prices" | "call-follower";

interface NhSpriteProps {
  readonly atlas: NhHudAtlas;
  readonly alias: string;
  readonly className: string;
  readonly style?: CSSProperties;
}

interface NhOrbProps {
  readonly atlas: NhHudAtlas;
  readonly className: string;
  readonly clientFonts: NhClientFontStore;
  readonly id: NhFixedOrbId;
  readonly layout: NhFixedOrbLayout | null;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
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

interface NhInventorySlotProps {
  readonly atlas: NhHudAtlas | undefined;
  readonly clientFonts: NhClientFontStore;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
  readonly slot: RuntimeInventorySlot | null;
  readonly index: number;
  readonly widgetId: number;
  readonly itemDefinition: NhInventoryItemDefinition | undefined;
  readonly selectedItem: NhInventorySelectedItem | null;
  readonly pendingEquip?: boolean;
  readonly inventoryDragDelayClientTicks: number | undefined;
  readonly onContextMenu: ((command: NhInventorySlotCommand) => void) | undefined;
  readonly onDefaultAction: ((command: NhInventorySlotCommand) => void) | undefined;
  readonly onDragReorder: ((command: NhInventorySlotDragCommand) => void) | undefined;
  readonly onHover: ((command: NhInventorySlotCommand | null) => void) | undefined;
}

interface NhInventorySlotDragState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly startedAtMs: number;
  readonly active: boolean;
  readonly sourceCommand: NhInventorySlotCommand;
}

const inventorySlotCount = 28;
const inventoryQuantityFontId = 494;
const inventoryQuantityBaselineY = 9;
const inventoryQuantityShadowSourceColor = 1;
const inventoryDragThresholdPixels = 5;
const inventoryClientTickMs = 20;
const inventoryDefaultDragDelayClientTicks = 5;
const inventoryDragAlpha = 0.5;
// Nh opens right-click menus from one global last-pressed mouse position, not from later hover/drag positions.
let nhInventorySuppressContextMenuUntilMs = 0;
const inventoryContextMenuDuplicateWindowMs = 250;
const hiddenWidgetSpriteIds = new Set([1183, 1184]);
const equipmentSlotTileSpriteId = 170;
const statsTileHalfLeftSpriteId = 174;
const statsTileHalfRightWithSlashSpriteId = 175;
const statsTileHalfRightSpriteId = 176;

function nhInventoryPointerNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function nhInventorySuppressNextContextMenuEvent(): void {
  nhInventorySuppressContextMenuUntilMs =
    nhInventoryPointerNowMs() + inventoryContextMenuDuplicateWindowMs;
}

function consumeNhInventorySuppressedContextMenuEvent(): boolean {
  if (nhInventorySuppressContextMenuUntilMs <= 0) {
    return false;
  }
  if (nhInventoryPointerNowMs() <= nhInventorySuppressContextMenuUntilMs) {
    return true;
  }
  nhInventorySuppressContextMenuUntilMs = 0;
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
const statsLevelArrayIndexBySkillId: Readonly<Record<NhStatsSkillSlotLayout["id"], number>> = {
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

export function NhClientHud({
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
}: NhClientHudProps): JSX.Element | null {
  const atlas = spriteAtlases.get("client_ui");
  if (!atlas || !layout || !sourceLayout) {
    return null;
  }
  const normalizedInventorySlots = normalizeNhInventorySlots(inventorySlots);
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
  const runOrbActionText = nhSourceActionText(runOrbLayout?.actions ?? []);
  const resolvedActiveSideTabId = resolveActiveSideTabId(sourceLayout?.sidePanel ?? null, activeSideTabId);
  const resolvedActiveSpellbookId = activeSpellbookId ?? "ancient";
  const activeSidePanelInterface =
    resolvedActiveSideTabId === "inventory" ? null : sourceLayout?.sidePanelInterfaces[resolvedActiveSideTabId] ?? null;
  const equipmentPanel = resolvedActiveSideTabId === "equipment" ? sourceLayout?.equipmentPanel ?? null : null;
  const combatPanel = resolvedActiveSideTabId === "combat" ? sourceLayout?.combatPanel ?? null : null;
  const suppressedMountedWidgetIds = new Set<number>();
  if (activeSidePanelInterface?.groupId === NH_COMBAT_GROUP_ID) {
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
  if (activeSidePanelInterface?.groupId === NH_NOTICEBOARD_GROUP_ID) {
    for (const widget of activeSidePanelInterface.widgets) {
      if (nhNoticeboardSourceTextChildIds.has(widget.widget.childId)) {
        suppressedMountedWidgetIds.add(widget.widget.id);
      }
    }
  }
  if (activeSidePanelInterface?.groupId === NH_FRIENDS_GROUP_ID) {
    for (const widget of activeSidePanelInterface.widgets) {
      if (widget.widget.childId === nhFriendsListDynamicTextChildId) {
        suppressedMountedWidgetIds.add(widget.widget.id);
      }
    }
  }
  if (activeSidePanelInterface?.groupId === NH_IGNORES_GROUP_ID) {
    for (const widget of activeSidePanelInterface.widgets) {
      if (widget.widget.childId === nhIgnoreListDynamicTextChildId) {
        suppressedMountedWidgetIds.add(widget.widget.id);
      }
    }
  }
  if (activeSidePanelInterface?.groupId === NH_OPTIONS_GROUP_ID) {
    for (const widget of activeSidePanelInterface.widgets) {
      if (
        nhOptionsKeybindingSuppressedChildIds.has(widget.widget.childId) ||
        widget.widget.childId === nhOptionsZoomSliderKnobChildId
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
    activeSidePanelInterface?.groupId === NH_NOTICEBOARD_GROUP_ID ? activeSidePanelInterface : null;
  const emotePanel = activeSidePanelInterface?.groupId === NH_EMOTES_GROUP_ID ? activeSidePanelInterface : null;

  return (
    <div className="nhClientHud" aria-label="NH Trainer fixed-mode client interface">
      <div className="nhFixedClient" style={fixedClientStyle(layout)}>
        <NhMinimapOverlay
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
        <NhCompassOverlay
          clientAtlas={atlas}
          compassAtlas={spriteAtlases.get("compass")}
          cameraYaw={minimapCameraYaw}
          widget={sourceLayout?.compassWidget ?? null}
        />
        <NhWidgetSpriteLayer atlas={atlas} layout={sourceLayout} activeSideTabId={resolvedActiveSideTabId} />
        <NhXpDropOrb
          atlas={atlas}
          layout={sourceLayout.xpDropOrb}
          onDefaultAction={onXpDropOrbDefaultAction}
          onContextMenu={onXpDropOrbContextMenu}
          shown={xpDropCounterShown !== false}
        />
        <NhSideTabClickLayer
          activeSideTabId={resolvedActiveSideTabId}
          layout={sourceLayout?.sidePanel ?? null}
          onContextMenu={onSideTabContextMenu}
          onDefaultAction={onSideTabDefaultAction}
          onHover={onSideTabHover}
        />
        <NhMountedWidgetLayer
          atlas={atlas}
          clientFonts={clientFonts}
          layout={activeSidePanelInterface}
          spriteAtlases={spriteAtlases}
          suppressedWidgetIds={suppressedMountedWidgetIds.size > 0 ? suppressedMountedWidgetIds : undefined}
        />
        <NhOptionsCameraZoomLayer
          atlas={atlas}
          cameraZoom={cameraZoom ?? NH_CAMERA_DEFAULT_ZOOM}
          layout={resolvedActiveSideTabId === "options" ? activeSidePanelInterface : null}
          onChange={onCameraZoomChange}
          onReset={onCameraZoomReset}
          viewportHeight={sourceLayout.viewport.rect.height}
        />
        <NhNoticeboardLayer
          clientFonts={clientFonts}
          layout={noticeboardPanel}
          snapshot={snapshot}
          spriteAtlases={spriteAtlases}
        />
        <NhSocialPanelLayer
          clientFonts={clientFonts}
          layout={activeSidePanelInterface}
          onButtonDefaultAction={onSocialButtonDefaultAction}
          socialLists={socialLists}
          spriteAtlases={spriteAtlases}
        />
        <NhClanChatPanelLayer
          clanChat={clanChat}
          clientFonts={clientFonts}
          layout={activeSidePanelInterface}
          onButtonDefaultAction={onClanChatButtonDefaultAction}
          spriteAtlases={spriteAtlases}
        />
        <NhEmotePanelLayer layout={emotePanel} spriteAtlases={spriteAtlases} />
        <NhOptionsKeybindingControlLayer
          atlas={atlas}
          layout={resolvedActiveSideTabId === "options" ? activeSidePanelInterface : null}
          onOpen={onGameKeybindInterfaceOpen}
        />
        <NhGameKeybindingInterface
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
        <NhEquipmentItemLayer
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
        <NhEquipmentUtilityButtonLayer
          atlas={atlas}
          onDefaultAction={onEquipmentUtilityDefaultAction}
          panel={equipmentPanel}
        />
        <NhEquipmentUtilityPanel
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
        <NhCombatPanelLayer
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
        <NhStatsPanelLayer
          atlas={atlas}
          clientFonts={clientFonts}
          hud={hud}
          onDefaultAction={onStatsSkillDefaultAction}
          panel={statsPanel}
          spriteAtlases={spriteAtlases}
        />
        <NhPrayerIconLayer
          atlas={spriteAtlases.get("prayer_icons")}
          hud={hud}
          onDefaultAction={onPrayerDefaultAction}
          onDragReorder={onPrayerDragReorder}
          panel={prayerPanel}
          reorderingEnabled={prayerReorderingEnabled === true}
          reorderOrder={prayerOrder}
        />
        <NhSpellbookIconLayer
          atlas={spriteAtlases.get("spell_icons")}
          hud={hud}
          onDefaultAction={onSpellDefaultAction}
          onDragReorder={onSpellDragReorder}
          panel={spellbookPanel}
          reorderingEnabled={spellbookReorderingEnabled === true}
          reorderOrder={spellbookOrder}
          selectedSpell={selectedSpell ?? null}
        />
        <NhOrb
          atlas={atlas}
          className="nhFixedOrb nhFixedOrb-hp"
          clientFonts={clientFonts}
          id="hp"
          layout={hpOrbLayout}
          spriteAtlases={spriteAtlases}
          value={hud.hitpoints}
          maxValue={hud.hitpointsMax}
        />
        <NhOrb
          atlas={atlas}
          className="nhFixedOrb nhFixedOrb-prayer"
          clientFonts={clientFonts}
          id="prayer"
          layout={prayerOrbLayout}
          spriteAtlases={spriteAtlases}
          value={hud.prayer}
          maxValue={hud.prayerMax}
        />
        <NhOrb
          atlas={atlas}
          className="nhFixedOrb nhFixedOrb-run"
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
        <NhOrb
          atlas={atlas}
          className="nhFixedOrb nhFixedOrb-spec"
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
            className="nhInventoryGrid"
            aria-label="Inventory"
            style={inventoryGridStyle(inventoryGrid)}
            onContextMenu={(event) => {
              if (event.target !== event.currentTarget) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              if (consumeNhInventorySuppressedContextMenuEvent()) {
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
              nhInventorySuppressNextContextMenuEvent();
              onInventoryEmptyContextMenu?.({
                widgetId: inventoryGrid.widgetId,
                position: runtimeViewportPointerPosition(event)
              });
            }}
          >
            {Array.from({ length: inventorySlotCount }, (_, index) => (
              <NhInventorySlotView
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
        <NhSprite
          atlas={atlas}
          alias="chat_background"
          className="nhFixedChatbox"
          style={chatboxBackgroundStyle(sourceLayout?.chatbox ?? null)}
        />
        <NhMountedWidgetLayer
          atlas={atlas}
          clientFonts={clientFonts}
          layout={sourceLayout?.chatbox ?? null}
          spriteAtlases={spriteAtlases}
        />
        <NhChatboxClickLayer
          layout={sourceLayout?.chatbox ?? null}
          onContextMenu={onChatboxContextMenu}
          onDefaultAction={onChatboxDefaultAction}
          onHover={onChatboxHover}
        />
      </div>
    </div>
  );
}

function fixedClientStyle(layout: NhFixedClientCssLayout | null): CSSProperties | undefined {
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
  sidePanel: NhFixedSidePanelLayout | null,
  activeSideTabId: NhFixedSideTabId | undefined
): NhFixedSideTabId {
  const defaultTabId = sidePanel?.defaultTabId ?? "inventory";
  if (!activeSideTabId) {
    return defaultTabId;
  }
  return sidePanel?.tabs.some((tab) => tab.id === activeSideTabId) ? activeSideTabId : defaultTabId;
}

function nhSideTabLabel(tab: NhFixedSideTabLayout): string {
  return `Fixed viewport ${tab.id.replace("-", " ")} tab`;
}

function NhCompassOverlay({
  clientAtlas,
  compassAtlas,
  cameraYaw,
  widget
}: {
  readonly clientAtlas: NhHudAtlas;
  readonly compassAtlas: NhHudAtlas | undefined;
  readonly cameraYaw: number;
  readonly widget: NhResolvedWidget | null;
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
      className="nhCompassOverlay"
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
        className="nhCompassSpriteRotator"
        data-angle-degrees={angleDegrees}
        style={compassSpriteRotatorStyle(angleDegrees)}
      >
        <span className="nhCompassSprite" style={spriteStyle(compassAtlas, compassSprite)} />
      </span>
    </div>
  );
}

function NhMinimapOverlay({
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
  readonly clientAtlas: NhHudAtlas;
  readonly destinationTile: RuntimeTile | null;
  readonly minimapSceneSprite: NhMinimapSceneSprite | null;
  readonly mapDotAtlas: NhHudAtlas | undefined;
  readonly mapIconAtlas: NhHudAtlas | undefined;
  readonly mapMarkerAtlas: NhHudAtlas | undefined;
  readonly mapSceneAtlas: NhHudAtlas | undefined;
  readonly onTileCommand: ((command: NhMinimapTileCommand) => void) | undefined;
  readonly snapshot: RuntimeSceneSnapshot;
  readonly widget: NhResolvedWidget | null;
}): JSX.Element | null {
  if (!widget) {
    return null;
  }

  const minimapMaskSprite = findSprite(clientAtlas, "fixed_mode_minimap_alpha_mask");
  const mask = spriteMaskFromSprite(minimapMaskSprite, widget.rect.width, widget.rect.height);
  const localPlayer = nhMinimapLocalPlayerDot(mask);
  const localActor = snapshot.actors.find((actor) => actor.actorId === "local-player") ?? null;
  const localActorMinimapTile = localActor ? nhMinimapActorTile(localActor) : null;
  const drawsScene = nhMinimapDrawsScene(snapshot.minimapState);
  const activeDestinationTile = destinationTile ?? snapshot.minimapDestination;
  const sceneTransform = drawsScene && minimapSceneSprite && localActorMinimapTile
    ? nhMinimapSceneTransform(minimapSceneSprite, localActorMinimapTile, cameraYaw, mask)
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
          const icon = nhMinimapMapIconForObject(object, localActorMinimapTile, cameraYaw, mask, {
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
          const icon = nhMinimapMapIconForSource(sourceIcon, localActorMinimapTile, cameraYaw, mask, {
            width: sprite.width,
            height: sprite.height
          });
          return icon ? [icon] : [];
        })
      : [];
  const mapIcons = [...sceneMapIcons, ...snapshotMapIcons];
  const dots = drawsScene && mapDotAtlas
    ? nhMinimapDotsForSnapshot(snapshot, cameraYaw, mask, minimapDotSpriteSizeForKind)
    : [];
  const destinationMarker =
    drawsScene && localActorMinimapTile && activeDestinationTile && destinationMarkerSprite
      ? nhMinimapDestinationMarker(
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
          const marker = nhMinimapHintMarker(
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
      className="nhMinimapOverlay"
      data-camera-yaw={Math.trunc(cameraYaw)}
      data-minimap-state={snapshot.minimapState ?? ""}
      data-minimap-disabled={drawsScene ? "false" : "true"}
      data-mask-sprite-id={minimapMaskSprite?.spriteId ?? ""}
      data-mask-sprite-alias={minimapMaskSprite?.alias ?? ""}
      data-mask-row-count={mask.xStarts?.length ?? ""}
      data-mask-width-count={mask.xWidths?.length ?? ""}
      data-mask-visual-source={minimapMaskSprite?.maskXStarts?.length ? "sprite-mask-rows" : ""}
      onPointerDown={(event) => {
        if (!localActor || !localActorMinimapTile || !onTileCommand || event.button !== 0 || !nhMinimapAllowsClick(snapshot.minimapState)) {
          return;
        }

        const click = minimapSourceClick(event, widget.rect);
        if (!click) {
          return;
        }

        const target = nhMinimapClickToTile({
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
          className="nhMinimapDisabledFill"
          data-source-shape="Rasterizer2D.method6430"
          style={minimapDisabledFillStyle(mask)}
        />
      ) : null}
      {minimapSceneSprite && sceneTransform ? (
        <NhMinimapSceneSpriteView
          mapSceneAtlas={mapSceneAtlas}
          sprite={minimapSceneSprite}
          transform={sceneTransform}
        />
      ) : null}
      {mapIcons.map((icon) => (
        <NhMinimapMapIconView atlas={mapIconAtlas} icon={icon} key={icon.id} />
      ))}
      {dots.map((dot) => (
        <NhMinimapDotView atlas={mapDotAtlas} dot={dot} key={dot.actorId} />
      ))}
      {destinationMarker ? (
        <NhMinimapMarkerView atlas={mapMarkerAtlas} marker={destinationMarker} />
      ) : null}
      {hintMarkers.map((marker) => (
        <NhMinimapMarkerView atlas={mapMarkerAtlas} key={marker.id} marker={marker} />
      ))}
      {drawsScene ? (
        <span
          className="nhMinimapLocalPlayer"
          data-actor-id="local-player"
          data-source-color={NH_MINIMAP_LOCAL_PLAYER_DOT_COLOR}
          data-source-height={NH_MINIMAP_LOCAL_PLAYER_DOT_SIZE}
          data-source-shape="Rasterizer2D.fillRectangle"
          data-source-width={NH_MINIMAP_LOCAL_PLAYER_DOT_SIZE}
          style={minimapLocalPlayerDotStyle(localPlayer)}
        />
      ) : null}
    </div>
  );
}

function NhMinimapSceneSpriteView({
  mapSceneAtlas,
  sprite,
  transform
}: {
  readonly mapSceneAtlas: NhHudAtlas | undefined;
  readonly sprite: NhMinimapSceneSprite;
  readonly transform: NhMinimapSceneTransform;
}): JSX.Element {
  return (
    <div
      className="nhMinimapSceneSprite"
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
          className="nhMinimapSceneCell"
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
          className="nhMinimapSceneOverlayPixel"
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
          className="nhMinimapSceneSegment"
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
            className="nhMinimapSceneMapScene"
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
  sprite: NhHudSprite | undefined,
  width: number,
  height: number
): NhMinimapSpriteMask {
  return {
    width,
    height,
    xStarts: sprite?.maskXStarts ?? [],
    xWidths: sprite?.maskXWidths ?? []
  };
}

function minimapSourceClick(
  event: ReactPointerEvent<HTMLElement>,
  rect: NhResolvedWidget["rect"]
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

function NhMinimapDotView({
  atlas,
  dot
}: {
  readonly atlas: NhHudAtlas | undefined;
  readonly dot: NhMinimapDot;
}): JSX.Element | null {
  const sprite = atlas ? findMinimapDotSprite(atlas, dot.kind, dot.sourceSpriteIndex) : undefined;
  if (!sprite || !atlas) {
    return null;
  }

  return (
    <span
      className={`nhMinimapDot nhMinimapDot-${dot.kind}`}
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

function NhMinimapMapIconView({
  atlas,
  icon
}: {
  readonly atlas: NhHudAtlas | undefined;
  readonly icon: NhMinimapMapIcon;
}): JSX.Element | null {
  const sprite = atlas ? findMinimapMapIconSprite(atlas, icon.mapIconId) : undefined;
  if (!sprite || !atlas) {
    return null;
  }

  return (
    <span
      className="nhMinimapMapIcon"
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

function NhMinimapMarkerView({
  atlas,
  marker
}: {
  readonly atlas: NhHudAtlas | undefined;
  readonly marker: NhMinimapMarker;
}): JSX.Element | null {
  const sprite = atlas ? findMinimapMarkerSprite(atlas, marker.kind, marker.sourceSpriteIndex) : undefined;
  if (!sprite || !atlas) {
    return null;
  }

  return (
    <span
      className={`nhMinimapMarker nhMinimapMarker-${marker.kind}`}
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

function inventoryGridStyle(grid: NhInventoryGridLayout | null): CSSProperties | undefined {
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

function chatboxBackgroundStyle(layout: NhMountedInterfaceLayout | null): CSSProperties | undefined {
  if (!layout) {
    return undefined;
  }

  return {
    left: layout.rect.x,
    top: layout.rect.y
  };
}

function minimapOverlayStyle(
  rect: NhResolvedWidget["rect"],
  maskSprite: NhHudSprite | undefined
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
  rect: NhResolvedWidget["rect"],
  maskSprite: NhHudSprite | undefined
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

function spriteMaskRowsDataUrl(sprite: NhHudSprite): string | null {
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

function minimapDisabledFillStyle(mask: NhMinimapSpriteMask): CSSProperties {
  return {
    left: 0,
    top: 0,
    width: mask.width,
    height: mask.height,
    backgroundColor: "#000000"
  };
}

function nhMinimapDrawsScene(minimapState: number | null): boolean {
  return minimapState !== 2 && minimapState !== 5;
}

function nhMinimapAllowsClick(minimapState: number | null): boolean {
  return minimapState === null || minimapState === 0 || minimapState === 3;
}

function minimapLocalPlayerDotStyle(dot: { readonly left: number; readonly top: number; readonly width: number; readonly height: number }): CSSProperties {
  return {
    ...minimapDotStyle(dot),
    backgroundColor: cssRgbColor(NH_MINIMAP_LOCAL_PLAYER_DOT_COLOR, 0xffffff)
  };
}

function minimapSceneSpriteStyle(
  sprite: NhMinimapSceneSprite,
  transform: NhMinimapSceneTransform
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

function minimapSceneCellStyle(cell: NhMinimapSceneCell): CSSProperties {
  return {
    left: cell.x,
    top: cell.y,
    width: cell.width,
    height: cell.height,
    backgroundColor: cell.color
  };
}

function minimapSceneOverlayPixelStyle(pixel: NhMinimapSceneOverlayPixel): CSSProperties {
  return {
    left: pixel.x,
    top: pixel.y,
    width: 1,
    height: 1,
    backgroundColor: pixel.color
  };
}

function minimapSceneSegmentStyle(segment: NhMinimapSceneSegment): CSSProperties {
  return {
    left: segment.x,
    top: segment.y,
    width: segment.width,
    height: segment.height,
    backgroundColor: segment.color
  };
}

function minimapSceneMapSceneStyle(
  atlas: NhHudAtlas,
  sprite: NhHudSprite,
  object: NhMinimapSceneMapSceneObject
): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: object.x + Math.trunc((object.sizeX * 4 - sprite.width) / 2),
    top: object.y + Math.trunc((object.sizeY * 4 - sprite.height) / 2)
  };
}

function minimapMapIconSpriteStyle(
  atlas: NhHudAtlas,
  sprite: NhHudSprite,
  icon: NhMinimapMapIcon
): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    ...minimapDotStyle(icon)
  };
}

function minimapMarkerSpriteStyle(
  atlas: NhHudAtlas,
  sprite: NhHudSprite,
  marker: NhMinimapMarker
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

function NhWidgetSpriteLayer({
  atlas,
  layout,
  activeSideTabId
}: {
  readonly atlas: NhHudAtlas;
  readonly layout: NhFixedClientLayout | null;
  readonly activeSideTabId: NhFixedSideTabId;
}): JSX.Element | null {
  if (!layout) {
    return null;
  }
  const sideTabsByWidgetId = new Map(layout.sidePanel?.tabs.map((tab) => [tab.widgetId, tab]) ?? []);

  return (
    <div className="nhWidgetSpriteLayer" aria-hidden="true">
      {layout.widgets.map((widget, index) => {
        const sideTab = sideTabsByWidgetId.get(widget.widget.id);
        if (sideTab && sideTab.id !== activeSideTabId) {
          return null;
        }
        return <NhWidgetSprite key={`${widget.widget.id}:${index}`} atlas={atlas} widget={widget} order={index} />;
      })}
    </div>
  );
}

function NhSideTabClickLayer({
  activeSideTabId,
  layout,
  onContextMenu,
  onDefaultAction,
  onHover
}: {
  readonly activeSideTabId: NhFixedSideTabId;
  readonly layout: NhFixedSidePanelLayout | null;
  readonly onContextMenu: ((command: NhSideTabCommand) => void) | undefined;
  readonly onDefaultAction: ((command: NhSideTabCommand) => void) | undefined;
  readonly onHover: ((command: NhSideTabCommand | null) => void) | undefined;
}): JSX.Element | null {
  if (!layout) {
    return null;
  }

  return (
    <div className="nhSideTabClickLayer" data-group-id={layout.groupId}>
      {layout.tabs.map((tab) => {
        const sourceActions = sourceWidgetActionEntries(tab.actions);
        const defaultAction = sourceActions[0];
        const command = (
          event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>,
          action: NhSourceWidgetAction
        ): NhSideTabCommand => ({
          tab,
          actionText: action.actionText,
          actionIndex: action.actionIndex,
          menuOpcode: action.menuOpcode,
          sourceActions,
          position: runtimeViewportPointerPosition(event)
        });
        return (
          <button
            aria-label={nhSideTabLabel(tab)}
            className="nhSideTabButton"
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
            <span className="nhWidgetAccessibleText">{nhSideTabLabel(tab)}</span>
          </button>
        );
      })}
    </div>
  );
}

function NhOptionsCameraZoomLayer({
  atlas,
  cameraZoom,
  layout,
  onChange,
  onReset,
  viewportHeight
}: {
  readonly atlas: NhHudAtlas;
  readonly cameraZoom: NhCameraZoom;
  readonly layout: NhMountedInterfaceLayout | null;
  readonly onChange: ((zoom: NhCameraZoom) => void) | undefined;
  readonly onReset: (() => void) | undefined;
  readonly viewportHeight: number;
}): JSX.Element | null {
  if (!layout) {
    return null;
  }

  const sliderTrack = layout.widgets.find((widget) => widget.widget.childId === nhOptionsZoomSliderTrackChildId);
  const sliderKnob = layout.widgets.find((widget) => widget.widget.childId === nhOptionsZoomSliderKnobChildId);
  const resetWidget = layout.widgets.find((widget) => widget.widget.childId === nhOptionsZoomIconActionChildId);
  if (!sliderTrack || !sliderKnob) {
    return null;
  }

  const sliderRange = Math.max(1, sliderTrack.rect.width - sliderKnob.rect.width);
  const knobOffset = nhCameraZoomSliderOffset(
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
    onChange(nhCameraZoomFromSliderOffset(sourceOffset, sliderRange));
  };

  return (
    <div
      className="nhOptionsCameraZoomLayer"
      data-source-client-script="OptionsPanelZoomMouseListener.rs2asm, OptionsPanelZoomUpdater.rs2asm"
      data-source-handler="camera_do_zoom updates Client.zoomHeight/zoomWidth and cam_setfollowheight"
      data-zoom-height={cameraZoom.zoomHeight}
      data-zoom-width={cameraZoom.zoomWidth}
    >
      {resetWidget ? (
        <button
          aria-label="Restore default camera zoom"
          className="nhOptionsCameraZoomReset"
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
        className="nhOptionsCameraZoomTrack"
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
          className="nhOptionsCameraZoomKnob"
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

const nhOptionsZoomIconActionChildId = 5;
const nhOptionsZoomSliderTrackChildId = 14;
const nhOptionsZoomSliderKnobChildId = 15;

function NhOptionsKeybindingControlLayer({
  atlas,
  layout,
  onOpen
}: {
  readonly atlas: NhHudAtlas;
  readonly layout: NhMountedInterfaceLayout | null;
  readonly onOpen: (() => void) | undefined;
}): JSX.Element | null {
  if (!layout || !onOpen) {
    return null;
  }
  const keybindingWidget = layout.widgets.find((widget) => widget.widget.childId === nhOptionsKeybindingActionChildId);
  if (!keybindingWidget) {
    return null;
  }
  const placementWidget =
    layout.widgets.find((widget) => widget.widget.childId === nhOptionsKeybindingPlacementChildId) ?? keybindingWidget;
  const keybindingFrameSprite = findSpriteById(
    atlas,
    placementWidget.widget.spriteId > 0 ? placementWidget.widget.spriteId : keybindingWidget.widget.spriteId
  );

  return (
    <div className="nhOptionsKeybindingControlLayer">
      {keybindingFrameSprite ? (
        <span
          aria-hidden="true"
          className="nhOptionsKeybindingSourceFrame"
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
        className="nhOptionsKeybindingGeneratedIcon"
        data-action-child-id={keybindingWidget.widget.childId}
        data-generated-with="imagegen"
        data-icon-path={nhOptionsKeybindingGeneratedIconPath}
        data-source-interface="Interface.OPTIONS child 83 opens Interface.KEYBINDING 121"
        data-source-placement-child-id={placementWidget.widget.childId}
        style={nhOptionsKeybindingGeneratedIconStyle(placementWidget.rect)}
      />
      <button
        aria-label="Keybinding"
        className="nhOptionsKeybindingButton"
        data-action-child-id={keybindingWidget.widget.childId}
        data-action-text="Keybinding"
        data-interface-id={layout.groupId}
        data-icon-path={nhOptionsKeybindingGeneratedIconPath}
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

const nhOptionsKeybindingActionChildId = 83;
const nhOptionsKeybindingPlacementChildId = 100;
const nhOptionsKeybindingGeneratedIconPath = "render/sprites/nh_fkey_icon.png";
const nhOptionsKeybindingSuppressedChildIds = new Set([83, 84, 87, 88, 100, 101]);

function nhOptionsKeybindingGeneratedIconStyle(rect: NhRect): CSSProperties {
  return {
    left: rect.x + Math.trunc((rect.width - 32) / 2),
    top: rect.y + Math.trunc((rect.height - 32) / 2),
    width: 32,
    height: 32,
    backgroundImage: `url(${nhOptionsKeybindingGeneratedIconPath})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "32px 32px",
    zIndex: 2
  };
}

function NhGameKeybindingInterface({
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
  readonly atlas: NhHudAtlas;
  readonly clientFonts: NhClientFontStore;
  readonly keybinds: NhGameKeybindSnapshot | undefined;
  readonly onChange: ((tabId: NhFixedSideTabId, keySlot: NhGameKeybindKeySlot) => void) | undefined;
  readonly onClose: (() => void) | undefined;
  readonly onEscapeCloseChange: ((escapeCloses: boolean) => void) | undefined;
  readonly onRestoreDefaults: ((mode: "osrs" | "pre-eoc") => void) | undefined;
  readonly onSelectedTabChange: ((tabId: NhFixedSideTabId) => void) | undefined;
  readonly open: boolean;
  readonly selectedTabId: NhFixedSideTabId | undefined;
  readonly sidePanel: NhFixedSidePanelLayout | null;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
  readonly viewport: NhRect;
}): JSX.Element | null {
  const [openDropdownTabId, setOpenDropdownTabId] = useState<NhFixedSideTabId | null>(null);
  useEffect(() => {
    if (!open) {
      setOpenDropdownTabId(null);
    }
  }, [open]);
  if (!open || !keybinds) {
    return null;
  }

  const panelRect = nhGameKeybindingPanelRect(viewport);
  const selectedSpec =
    NH_GAME_KEYBIND_TAB_SPECS.find((spec) => spec.tabId === selectedTabId) ?? NH_GAME_KEYBIND_TAB_SPECS[0];
  const dropdownSpec =
    NH_GAME_KEYBIND_TAB_SPECS.find((spec) => spec.tabId === openDropdownTabId) ?? null;

  return (
    <div
      className="nhGameKeybindingInterface"
      data-interface-id={NH_GAME_KEYBIND_INTERFACE_ID}
      data-source={NH_GAME_KEYBIND_SOURCE}
      data-source-open-handler="TabOptions.Keybinding.open sends InterfaceType.MAIN, Interface.KEYBINDING"
      data-source-slot-action="Interface.KEYBINDING child 111 SlotAction clears duplicate key slots before setting selected Config.KEYBINDS entry"
      data-source-layout="Interface.KEYBINDING 121 side-stone keybind grid"
      data-escape-closes={String(keybinds.escapeCloses)}
      style={rectStyle(panelRect)}
    >
      <button
        aria-label="Close"
        className="nhGameKeybindingClose"
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
        <NhGameKeybindingGlyphText
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
      <div className="nhGameKeybindingTitle">
        <NhGameKeybindingGlyphText
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
      <div className="nhGameKeybindingRows">
        {nhGameKeybindingGridSpecs().map((spec) => {
          const keySlot = keybinds.keySlotsByTabId[spec.tabId] ?? spec.defaultKeySlot;
          const selected = spec.tabId === selectedSpec.tabId;
          return (
            <div
              className="nhGameKeybindingRow"
              data-key-text-child-id={spec.keyTextChildId}
              data-selector-child-id={spec.selectorChildId}
              data-source-script984-text-child={spec.keyTextChildId}
              data-source-varbit={spec.varbit}
              data-source-server-varbit={spec.serverVarbit ?? spec.varbit}
              data-tab-id={spec.tabId}
              key={spec.tabId}
              style={nhGameKeybindingRowStyle(spec)}
            >
              <button
                aria-label={spec.label}
                className="nhGameKeybindingIconButton"
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
                <NhGameKeybindingTabIcon atlas={atlas} sidePanel={sidePanel} spec={spec} />
                <span className="nhWidgetAccessibleText">{spec.label}</span>
              </button>
              <button
                aria-label={`${spec.label} ${nhGameKeybindLabelForSlot(keySlot)}`}
                className="nhGameKeybindingKeyButton"
                data-key-slot={keySlot}
                data-source-client-script="keybind_open_menu"
                data-source-enum-1159={nhGameKeybindLabelForSlot(keySlot)}
                data-source-enum-1160={nhGameKeybindSourceKeyForSlot(keySlot)}
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
                <span className="nhGameKeybindingKeyText">
                  <NhGameKeybindingGlyphText
                    clientFonts={clientFonts}
                    color="#ff981f"
                    fontId={494}
                    height={15}
                    spriteAtlases={spriteAtlases}
                    text={nhGameKeybindingDisplayLabelForSlot(keySlot)}
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
          className="nhGameKeybindingDropdown"
          data-source-client-script="keybind_build_dropdown"
          data-source-text-font="p12_full"
          style={nhGameKeybindingDropdownStyle(dropdownSpec)}
        >
          {NH_GAME_KEYBIND_KEY_OPTIONS.map((option) => (
            <button
              aria-label={option.label}
              className="nhGameKeybindingDropdownOption"
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
              style={nhGameKeybindingDropdownOptionStyle(option.slot)}
              type="button"
            >
              <NhGameKeybindingGlyphText
                clientFonts={clientFonts}
                color="#ff981f"
                fontId={495}
                height={15}
                spriteAtlases={spriteAtlases}
                text={nhGameKeybindingDisplayLabelForSlot(option.slot)}
                width={40}
                xTextAlignment={1}
              />
            </button>
          ))}
        </div>
      ) : null}
      <div className="nhGameKeybindingRestore">
        <button
          className="nhGameKeybindingRestoreButton"
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
          <span className="nhGameKeybindingRestoreText">
            <NhGameKeybindingGlyphText
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

const nhGameKeybindingColumnTabIds: readonly (readonly NhFixedSideTabId[])[] = [
  ["combat", "stats", "quests", "inventory", "equipment"],
  ["prayer", "magic", "friends", "ignores", "logout"],
  ["options", "emotes", "clan-chat", "music"]
];
const nhGameKeybindingColumnLefts = [28, 187, 346] as const;
const nhGameKeybindingRowsTop = 49;
const nhGameKeybindingRowStep = 43;
const nhGameKeybindingRowSize = { width: 150, height: 36 } as const;

function NhGameKeybindingTabIcon({
  atlas,
  sidePanel,
  spec
}: {
  readonly atlas: NhHudAtlas;
  readonly sidePanel: NhFixedSidePanelLayout | null;
  readonly spec: NhGameKeybindTabSpec;
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
      className="nhGameKeybindingIconSprite"
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

function nhGameKeybindingGridSpecs(): readonly NhGameKeybindTabSpec[] {
  return nhGameKeybindingColumnTabIds
    .flat()
    .flatMap((tabId) => NH_GAME_KEYBIND_TAB_SPECS.find((spec) => spec.tabId === tabId) ?? []);
}

function nhGameKeybindingCellForSpec(spec: NhGameKeybindTabSpec): {
  readonly column: number;
  readonly row: number;
} {
  for (let column = 0; column < nhGameKeybindingColumnTabIds.length; column += 1) {
    const row = nhGameKeybindingColumnTabIds[column].indexOf(spec.tabId);
    if (row !== -1) {
      return { column, row };
    }
  }
  const sourceIndex = NH_GAME_KEYBIND_TAB_SPECS.findIndex((candidate) => candidate.tabId === spec.tabId);
  return {
    column: Math.trunc(Math.max(0, sourceIndex) / 5),
    row: Math.max(0, sourceIndex) % 5
  };
}

function nhGameKeybindingRowStyle(spec: NhGameKeybindTabSpec): CSSProperties {
  const cell = nhGameKeybindingCellForSpec(spec);
  return {
    left: nhGameKeybindingColumnLefts[cell.column] ?? nhGameKeybindingColumnLefts[0],
    top: nhGameKeybindingRowsTop + cell.row * nhGameKeybindingRowStep,
    width: nhGameKeybindingRowSize.width,
    height: nhGameKeybindingRowSize.height
  };
}

function nhGameKeybindingDisplayLabelForSlot(slot: NhGameKeybindKeySlot): string {
  const sourceLabel = nhGameKeybindLabelForSlot(slot);
  return sourceLabel === "None" || sourceLabel === "Esc" ? sourceLabel.toUpperCase() : sourceLabel;
}

function NhGameKeybindingGlyphText({
  clientFonts,
  color,
  fontId,
  height,
  spriteAtlases,
  text,
  width,
  xTextAlignment = 0
}: {
  readonly clientFonts: NhClientFontStore;
  readonly color: string;
  readonly fontId: number;
  readonly height: number;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
  readonly text: string;
  readonly width: number;
  readonly xTextAlignment?: number;
}): JSX.Element {
  const font = nhClientFontDefinitionById(clientFonts, fontId);
  const atlas = font ? spriteAtlases.get(font.sheetId as RuntimeSpriteSheetId) : undefined;
  return (
    <span className="nhGameKeybindingGlyphLabel" style={{ width, height }}>
      {font && atlas ? (
        <NhSourceGlyphText
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
        <span className="nhWidgetAccessibleText" data-source-glyph-missing="true">
          {text}
        </span>
      )}
    </span>
  );
}

function nhGameKeybindingPanelRect(viewport: NhRect): NhRect {
  const width = 500;
  const height = 298;
  return {
    x: viewport.x + Math.trunc((viewport.width - width) / 2),
    y: viewport.y + Math.trunc((viewport.height - height) / 2),
    width,
    height
  };
}

function nhGameKeybindingDropdownStyle(spec: NhGameKeybindTabSpec): CSSProperties {
  const row = nhGameKeybindingRowStyle(spec);
  const top = Number(row.top) + 22;
  const safeTop = top + 110 > 286 ? Math.max(25, Number(row.top) + 6 - 110) : top;
  return {
    left: Number(row.left) + 40,
    top: safeTop,
    width: 100,
    height: 110
  };
}

function nhGameKeybindingDropdownOptionStyle(slot: NhGameKeybindKeySlot): CSSProperties {
  return {
    left: 5 + (slot % 2) * 40,
    top: 5 + Math.trunc(slot / 2) * 15,
    width: 40,
    height: 15
  };
}

interface NhChatboxButtonLayout {
  readonly buttonId: NhChatboxButtonId;
  readonly label: string;
  readonly widget: NhResolvedWidget;
  readonly actionText: string;
  readonly actionIndex: number;
  readonly menuOpcode: number;
  readonly actions: readonly string[];
  readonly sourceActions: readonly NhSourceWidgetAction[];
}

const chatboxButtonDefinitions: readonly {
  readonly buttonId: NhChatboxButtonId;
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

function NhChatboxClickLayer({
  layout,
  onContextMenu,
  onDefaultAction,
  onHover
}: {
  readonly layout: NhMountedInterfaceLayout | null;
  readonly onContextMenu: ((command: NhChatboxButtonCommand) => void) | undefined;
  readonly onDefaultAction: ((command: NhChatboxButtonCommand) => void) | undefined;
  readonly onHover: ((command: NhChatboxButtonCommand | null) => void) | undefined;
}): JSX.Element | null {
  const buttons = nhChatboxButtons(layout);
  if (!layout || buttons.length === 0) {
    return null;
  }

  return (
    <div className="nhChatboxClickLayer" data-group-id={layout.groupId}>
      {buttons.map((button) => (
        <button
          aria-label={`Chatbox ${button.label} button`}
          className="nhChatboxButton"
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
          <span className="nhWidgetAccessibleText">{button.label}</span>
        </button>
      ))}
    </div>
  );
}

function nhChatboxButtons(layout: NhMountedInterfaceLayout | null): readonly NhChatboxButtonLayout[] {
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

function sourceWidgetActionEntries(actions: readonly string[]): readonly NhSourceWidgetAction[] {
  return actions.flatMap((actionText, index) => {
    if (actionText.trim().length === 0) {
      return [];
    }
    const actionIndex = index + 1;
    return [
      {
        actionIndex,
        actionText,
        menuOpcode: nhSourceWidgetMenuOpcode(actionIndex)
      }
    ];
  });
}

function defaultSourceWidgetAction(actions: readonly string[]): NhSourceWidgetAction | null {
  return sourceWidgetActionEntries(actions)[0] ?? null;
}

function nhSourceWidgetMenuOpcode(actionIndex: number): number {
  return actionIndex >= 6 ? widgetHighActionOpcode : widgetDefaultActionOpcode;
}

function NhMountedWidgetLayer({
  atlas,
  clientFonts,
  layout,
  spriteAtlases,
  suppressedWidgetIds
}: {
  readonly atlas: NhHudAtlas;
  readonly clientFonts: NhClientFontStore;
  readonly layout: NhMountedInterfaceLayout | null;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
  readonly suppressedWidgetIds?: ReadonlySet<number>;
}): JSX.Element | null {
  if (!layout) {
    return null;
  }

  return (
    <div className="nhMountedWidgetLayer" data-group-id={layout.groupId}>
      {layout.widgets.map((widget, index) => {
        if (suppressedWidgetIds?.has(widget.widget.id)) {
          return null;
        }

        return widget.widget.type === 4 ? (
          <NhWidgetText
            key={`${widget.widget.id}:${index}`}
            clientFonts={clientFonts}
            order={index}
            spriteAtlases={spriteAtlases}
            widget={widget}
          />
        ) : widget.widget.type === 3 ? (
          <NhWidgetRectangle key={`${widget.widget.id}:${index}`} widget={widget} order={index} />
        ) : (
          <NhWidgetSprite key={`${widget.widget.id}:${index}`} atlas={atlas} widget={widget} order={index} />
        );
      })}
    </div>
  );
}

function NhNoticeboardLayer({
  clientFonts,
  layout,
  snapshot,
  spriteAtlases
}: {
  readonly clientFonts: NhClientFontStore;
  readonly layout: NhMountedInterfaceLayout | null;
  readonly snapshot: RuntimeSceneSnapshot;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
}): JSX.Element | null {
  if (!layout || layout.groupId !== NH_NOTICEBOARD_GROUP_ID) {
    return null;
  }

  const clip = layout.widgets.find((entry) => entry.widget.childId === nhNoticeboardClipChildId) ?? null;
  if (!clip) {
    return null;
  }

  const sourceTextByChildId = nhNoticeboardTextByChildId(snapshot);
  const widgets = layout.widgets.filter(
    (entry) =>
      entry.widget.type === 4 &&
      nhNoticeboardVisibleTextChildIds.has(entry.widget.childId)
  );

  return (
    <div
      className="nhNoticeboardLayer"
      data-group-id={layout.groupId}
      data-source-server-handler="TabQuest.send"
      data-source-interface="Interface.NOTICEBOARD"
    >
      <div className="nhNoticeboardClip" style={rectStyle(clip.rect)}>
        <div
          className="nhNoticeboardScrollContent"
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
              <NhWidgetText
                key={`${widget.widget.id}:${index}`}
                clientFonts={clientFonts}
                order={index}
                spriteAtlases={spriteAtlases}
                widget={nhResolvedWidgetWithText(widget, text)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NhSocialPanelLayer({
  clientFonts,
  layout,
  onButtonDefaultAction,
  socialLists,
  spriteAtlases
}: {
  readonly clientFonts: NhClientFontStore;
  readonly layout: NhMountedInterfaceLayout | null;
  readonly onButtonDefaultAction: ((command: NhSocialButtonCommand) => void) | undefined;
  readonly socialLists: NhSocialListsSnapshot | undefined;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
}): JSX.Element | null {
  const config = nhSocialPanelConfig(layout);
  if (!layout || !config) {
    return null;
  }

  const clip = layout.widgets.find((entry) => entry.widget.childId === config.rowsClipChildId) ?? null;
  if (!clip) {
    return null;
  }

  const members = config.list === "friends" ? socialLists?.friends ?? [] : socialLists?.ignores ?? [];
  const font = nhClientFontDefinitionById(clientFonts, config.fontId);
  const atlas = font ? spriteAtlases.get(font.sheetId as RuntimeSpriteSheetId) : undefined;
  const sourceActions = [
    nhSocialButton(layout, config.switchChildId, "switch", config.list),
    nhSocialButton(layout, config.addChildId, "add", config.list),
    nhSocialButton(layout, config.deleteChildId, "delete", config.list)
  ].filter((button): button is NhSocialPanelButton => button !== null);

  return (
    <div
      className="nhSocialPanelLayer"
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
        className="nhSocialRowsClip"
        data-source-scroll-child-id={clip.widget.childId}
        data-source-scroll-height={nhWidgetSourceScrollHeight(clip.widget)}
        style={rectStyle(clip.rect)}
      >
        <div
          className="nhSocialRows"
          style={{
            width: clip.rect.width,
            height: Math.max(clip.rect.height, members.length * nhSocialRowHeight)
          }}
        >
          {members.map((member, index) => (
            <div
              className="nhSocialRow"
              data-index={index}
              data-name={member.name}
              data-previous-name={member.previousName ?? ""}
              data-rank={member.rank ?? ""}
              data-source-name-opcode={config.nameOpcode}
              data-source-rank-opcode={config.rankOpcode ?? ""}
              data-source-world-opcode={config.worldOpcode ?? ""}
              data-world={member.world}
              key={`${member.name}:${index}`}
              style={nhSocialRowStyle(index, clip.rect.width)}
            >
              <span
                className="nhSocialRowName"
                style={{
                  left: 0,
                  top: 0,
                  width: nhSocialNameWidth(config.list, clip.rect.width)
                }}
              >
                {font && atlas ? (
                  <NhSourceGlyphText
                    atlas={atlas}
                    color="#ffffff"
                    font={font}
                    height={nhSocialRowHeight}
                    lineHeight={undefined}
                    shadowColor="#000000"
                    text={member.name}
                    width={nhSocialNameWidth(config.list, clip.rect.width)}
                    xTextAlignment={0}
                    yTextAlignment={0}
                  />
                ) : (
                  <span className="nhWidgetAccessibleText">{member.name}</span>
                )}
              </span>
              {config.list === "friends" ? (
                <span
                  className="nhSocialRowWorld"
                  data-source-world={member.world}
                  style={{
                    left: nhSocialWorldLeft(clip.rect.width),
                    top: 0,
                    width: Math.max(0, clip.rect.width - nhSocialWorldLeft(clip.rect.width))
                  }}
                >
                  {font && atlas ? (
                    <NhSourceGlyphText
                      atlas={atlas}
                      color={member.world > 0 ? "#00ff00" : "#ff0000"}
                      font={font}
                      height={nhSocialRowHeight}
                      lineHeight={undefined}
                      shadowColor="#000000"
                      text={member.world > 0 ? nhSocialWorldText(member.world) : "Offline"}
                      width={Math.max(0, clip.rect.width - nhSocialWorldLeft(clip.rect.width))}
                      xTextAlignment={2}
                      yTextAlignment={0}
                    />
                  ) : (
                    <span className="nhWidgetAccessibleText">
                      {member.world > 0 ? nhSocialWorldText(member.world) : "Offline"}
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
          className="nhSocialSourceButton"
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
          <span className="nhWidgetAccessibleText">{button.actionText}</span>
        </button>
      ))}
    </div>
  );
}

function NhClanChatPanelLayer({
  clanChat,
  clientFonts,
  layout,
  onButtonDefaultAction,
  spriteAtlases
}: {
  readonly clanChat: NhClanChatSnapshot | undefined;
  readonly clientFonts: NhClientFontStore;
  readonly layout: NhMountedInterfaceLayout | null;
  readonly onButtonDefaultAction: ((command: NhClanChatButtonCommand) => void) | undefined;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
}): JSX.Element | null {
  if (!layout || layout.groupId !== NH_CLAN_CHAT_GROUP_ID) {
    return null;
  }

  const displayNameWidget = layout.widgets.find((entry) => entry.widget.childId === nhClanChatNameChildId) ?? null;
  const ownerWidget = layout.widgets.find((entry) => entry.widget.childId === nhClanChatOwnerChildId) ?? null;
  const rowsClip = layout.widgets.find((entry) => entry.widget.childId === nhClanChatRowsClipChildId) ?? null;
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
    nhClanChatButton(layout, active ? "leave" : "join", active ? "Leave Chat" : "Join Chat"),
    nhClanChatButton(layout, "setup", "Clan Setup")
  ].filter((button): button is NhClanChatPanelButton => button !== null);

  return (
    <div
      className="nhClanChatPanelLayer"
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
      <NhWidgetText
        clientFonts={clientFonts}
        order={2000}
        spriteAtlases={spriteAtlases}
        widget={nhResolvedWidgetWithTextColor(displayNameWidget, displayName, displayNameColor)}
      />
      <NhWidgetText
        clientFonts={clientFonts}
        order={2001}
        spriteAtlases={spriteAtlases}
        widget={nhResolvedWidgetWithTextColor(ownerWidget, ownerName, ownerNameColor)}
      />
      <div
        className="nhClanChatRowsClip"
        data-source-scroll-child-id={rowsClip.widget.childId}
        data-source-scroll-height={nhWidgetSourceScrollHeight(rowsClip.widget)}
        style={rectStyle(rowsClip.rect)}
      >
        <div
          className="nhClanChatRows"
          style={{
            width: rowsClip.rect.width,
            height: Math.max(rowsClip.rect.height, members.length * nhClanChatRowHeight + (members.length > 0 ? 5 : 0))
          }}
        >
          {members.map((member, index) => (
            <NhClanChatMemberRow
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
        <NhWidgetText
          clientFonts={clientFonts}
          key={`${button.widget.widget.id}:label`}
          order={2100 + index}
          spriteAtlases={spriteAtlases}
          widget={nhResolvedWidgetWithText(button.widget, button.actionText)}
        />
      ))}
      {buttons.map((button) => (
        <button
          aria-label={button.actionText}
          className="nhClanChatSourceButton"
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
          <span className="nhWidgetAccessibleText">{button.actionText}</span>
        </button>
      ))}
    </div>
  );
}

function NhClanChatMemberRow({
  clientFonts,
  index,
  member,
  rowWidth,
  spriteAtlases
}: {
  readonly clientFonts: NhClientFontStore;
  readonly index: number;
  readonly member: NhClanChatMember;
  readonly rowWidth: number;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
}): JSX.Element {
  const font = nhClientFontDefinitionById(clientFonts, 495);
  const atlas = font ? spriteAtlases.get(font.sheetId as RuntimeSpriteSheetId) : undefined;
  const worldLeft = nhClanChatWorldLeft(rowWidth);
  const nameLeft = member.rank >= 0 ? 14 : 0;
  const nameWidth = Math.max(0, worldLeft - nameLeft - 2);
  const worldWidth = Math.max(0, rowWidth - worldLeft);
  const currentWorld = member.world === 1;
  const worldText = member.world > 0 ? `World ${member.world}` : "Offline";

  return (
    <div
      className="nhClanChatRow"
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
      style={nhSocialRowStyle(index, rowWidth)}
    >
      <span
        className="nhClanChatRankIcon"
        data-rank={member.rank}
        style={{
          left: 1,
          top: 3,
          width: 9,
          height: 9
        }}
      />
      <span
        className="nhClanChatRowName"
        style={{
          left: nameLeft,
          top: 0,
          width: nameWidth
        }}
      >
        {font && atlas ? (
          <NhSourceGlyphText
            atlas={atlas}
            color="#ffffff"
            font={font}
            height={nhClanChatRowHeight}
            lineHeight={undefined}
            shadowColor={null}
            text={member.name}
            width={nameWidth}
            xTextAlignment={0}
            yTextAlignment={1}
          />
        ) : (
          <span className="nhWidgetAccessibleText">{member.name}</span>
        )}
      </span>
      <span
        className="nhClanChatRowWorld"
        style={{
          left: worldLeft,
          top: 0,
          width: worldWidth
        }}
      >
        {font && atlas ? (
          <NhSourceGlyphText
            atlas={atlas}
            color={currentWorld ? "#0dc10d" : "#ffff64"}
            font={font}
            height={nhClanChatRowHeight}
            lineHeight={undefined}
            shadowColor={null}
            text={worldText}
            width={worldWidth}
            xTextAlignment={2}
            yTextAlignment={1}
          />
        ) : (
          <span className="nhWidgetAccessibleText">{worldText}</span>
        )}
      </span>
    </div>
  );
}

interface NhClanChatPanelButton {
  readonly action: NhClanChatButtonAction;
  readonly actionIndex: number;
  readonly actionText: string;
  readonly widget: NhResolvedWidget;
  readonly sourcePacketId?: 53;
  readonly sourcePacketName?: string;
  readonly sourceServerHandler: string;
}

function nhClanChatButton(
  layout: NhMountedInterfaceLayout,
  action: NhClanChatButtonAction,
  actionText: string
): NhClanChatPanelButton | null {
  const childId = action === "setup" ? nhClanChatSetupChildId : nhClanChatJoinLeaveChildId;
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

interface NhSocialPanelConfig {
  readonly list: NhSocialListKind;
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

interface NhSocialPanelButton {
  readonly action: NhSocialButtonAction;
  readonly list: NhSocialListKind;
  readonly actionIndex: number;
  readonly actionText: string;
  readonly widget: NhResolvedWidget;
  readonly sourcePacketId?: 80 | 48 | 84 | 56;
  readonly sourcePacketName?: string;
}

function nhSocialPanelConfig(layout: NhMountedInterfaceLayout | null): NhSocialPanelConfig | null {
  if (!layout) {
    return null;
  }
  if (layout.groupId === NH_FRIENDS_GROUP_ID) {
    return {
      list: "friends",
      rowsClipChildId: nhFriendsListRowsClipChildId,
      dynamicTextChildId: nhFriendsListDynamicTextChildId,
      switchChildId: nhFriendsListSwitchChildId,
      addChildId: nhFriendsListAddChildId,
      deleteChildId: nhFriendsListDeleteChildId,
      fontId: 495,
      sourceInterface: "Interface.FRIENDS_LIST",
      sourcePacket: "Player.sendFriends -> varshort packet 61",
      clientOpcodes: "3600 count, 3601 name/previousName, 3602 world, 3603 rank",
      nameOpcode: 3601,
      worldOpcode: 3602,
      rankOpcode: 3603
    };
  }
  if (layout.groupId === NH_IGNORES_GROUP_ID) {
    return {
      list: "ignores",
      rowsClipChildId: nhIgnoreListRowsClipChildId,
      dynamicTextChildId: nhIgnoreListDynamicTextChildId,
      switchChildId: nhIgnoreListSwitchChildId,
      addChildId: nhIgnoreListAddChildId,
      deleteChildId: nhIgnoreListDeleteChildId,
      fontId: 495,
      sourceInterface: "Interface.IGNORE_LIST",
      sourcePacket: "Player.sendIgnores -> varshort packet 59",
      clientOpcodes: "3621 count, 3622 name/previousName",
      nameOpcode: 3622
    };
  }
  return null;
}

function nhSocialButton(
  layout: NhMountedInterfaceLayout,
  childId: number,
  action: NhSocialButtonAction,
  list: NhSocialListKind
): NhSocialPanelButton | null {
  const widget = layout.widgets.find((entry) => entry.widget.childId === childId);
  const actionText = sourceWidgetActions(widget?.widget.actions ?? [])[0] ?? nhSocialFallbackActionText(action, list);
  if (!widget || widget.widget.hidden || widget.rect.width <= 0 || widget.rect.height <= 0) {
    return null;
  }
  return {
    action,
    list,
    actionIndex: 1,
    actionText,
    widget,
    ...nhSocialSourcePacket(action, list)
  };
}

function nhSocialSourcePacket(
  action: NhSocialButtonAction,
  list: NhSocialListKind
): Pick<NhSocialPanelButton, "sourcePacketId" | "sourcePacketName"> {
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

function nhSocialFallbackActionText(action: NhSocialButtonAction, list: NhSocialListKind): string {
  if (action === "switch") {
    return list === "friends" ? "View Ignore List" : "View Friends List";
  }
  if (list === "friends") {
    return action === "add" ? "Add Friend" : "Delete Friend";
  }
  return action === "add" ? "Add Name" : "Delete Name";
}

function nhSocialRowStyle(index: number, width: number): CSSProperties {
  return {
    left: 0,
    top: index * nhSocialRowHeight,
    width,
    height: nhSocialRowHeight
  };
}

function nhSocialNameWidth(list: NhSocialListKind, rowWidth: number): number {
  return list === "friends" ? Math.max(0, nhSocialWorldLeft(rowWidth) - 2) : rowWidth;
}

function nhSocialWorldLeft(rowWidth: number): number {
  return Math.max(82, rowWidth - 58);
}

function nhSocialWorldText(world: number): string {
  return world > 0 ? `World ${world}` : "Offline";
}

function nhWidgetSourceScrollHeight(widget: NhResolvedWidget["widget"]): number {
  return Number((widget as { readonly scrollHeight?: number }).scrollHeight ?? 0);
}

function NhEmotePanelLayer({
  layout,
  spriteAtlases
}: {
  readonly layout: NhMountedInterfaceLayout | null;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
}): JSX.Element | null {
  if (!layout || layout.groupId !== NH_EMOTES_GROUP_ID) {
    return null;
  }

  const scroll = layout.widgets.find((entry) => entry.widget.childId === nhEmoteScrollableChildId) ?? null;
  const scrollbar = layout.widgets.find((entry) => entry.widget.childId === nhEmoteScrollbarChildId) ?? null;
  if (!scroll) {
    return null;
  }

  const emoteAtlas = spriteAtlases.get("emote_icons");
  const contentHeight =
    Math.trunc((Math.max(0, nhEmoteSpecs.length - 1) / nhEmoteColumns)) * nhEmoteButtonStep.height +
    nhEmoteFirstRowOffsetY +
    nhEmoteButtonSize.height;

  return (
    <div
      className="nhEmotePanelLayer"
      data-group-id={layout.groupId}
      data-source-client-script="emote_init"
      data-source-update-proc="emote_update"
      data-source-interface="Interface.EMOTE"
    >
      <div className="nhEmoteClip" style={rectStyle(scroll.rect)}>
        <div className="nhEmoteGrid" style={{ width: scroll.rect.width, height: contentHeight }}>
          {nhEmoteSpecs.map((emote, visibleIndex) => {
            const rect = nhEmoteButtonRect(visibleIndex);
            const sprite = emoteAtlas ? findSpriteById(emoteAtlas, emote.unlockedSpriteId) : undefined;
            return (
              <Fragment key={emote.slot}>
                <button
                  aria-label={emote.label}
                  className="nhEmoteButton"
                  data-animation-id={emote.animationId}
                  data-graphics-id={emote.graphicsId ?? ""}
                  data-locked-sprite-id={emote.lockedSpriteId}
                  data-slot={emote.slot}
                  data-source-order={emote.sourceOrder}
                  data-source-client-size={`${nhEmoteButtonSize.width}x${nhEmoteButtonSize.height}`}
                  data-source-client-step={`${nhEmoteButtonStep.width}x${nhEmoteButtonStep.height}`}
                  data-source-locked-graphic-enum={nhEmoteDefinitions.lockedSpriteEnumId}
                  data-source-name-enum={nhEmoteDefinitions.nameEnumId}
                  data-source-unlocked-graphic-enum={nhEmoteDefinitions.unlockedSpriteEnumId}
                  data-unlocked-sprite-id={emote.unlockedSpriteId}
                  style={rectStyle(rect)}
                  type="button"
                >
                  {emoteAtlas && sprite ? null : <span className="nhWidgetAccessibleText">{emote.label}</span>}
                </button>
                {emoteAtlas && sprite ? (
                  <span
                    aria-hidden="true"
                    className="nhEmoteIconSprite"
                    data-sprite-id={sprite.spriteId}
                    style={nhEmoteSpriteStyle(sprite, rect)}
                  >
                    <img
                      alt=""
                      className="nhEmoteIconImage"
                      draggable={false}
                      src={`render/sprites/${emoteAtlas.metadata.image}`}
                      style={nhEmoteSpriteImageStyle(emoteAtlas, sprite, rect)}
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
          className="nhEmoteScrollbarSource"
          data-source-client-script="scrollbar_vertical"
          style={rectStyle(scrollbar.rect)}
        />
      ) : null}
    </div>
  );
}

function NhEquipmentItemLayer({
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
  readonly clientAtlas: NhHudAtlas;
  readonly equipmentDefinitions: NhInventoryEquipmentDefinitionStore;
  readonly itemAtlas: NhHudAtlas | undefined;
  readonly onContextMenu: ((command: NhEquipmentItemCommand) => void) | undefined;
  readonly onDefaultAction: ((command: NhEquipmentItemCommand) => void) | undefined;
  readonly onHover: ((command: NhEquipmentItemCommand | null) => void) | undefined;
  readonly panel: NhEquipmentPanelLayout | null;
  readonly pendingRemoveSlotIds?: ReadonlySet<string>;
  readonly snapshot: RuntimeSceneSnapshot;
}): JSX.Element | null {
  if (!panel) {
    return null;
  }

  const itemIdsBySlot = localPlayerEquipmentItemIdsBySlot(snapshot, equipmentDefinitions);
  const slotTile = findSpriteById(clientAtlas, equipmentSlotTileSpriteId);

  return (
    <div className="nhEquipmentItemLayer" data-group-id={panel.groupId}>
      {panel.slots.map((slot) => {
        const itemId = itemIdsBySlot.get(slot.serverSlot);
        const item = itemId === undefined || !itemAtlas ? undefined : findItemSprite(itemAtlas, itemId, "normal", 1);
        const itemName = itemId === undefined ? null : equipmentDefinitions.get(itemId)?.name ?? item?.name ?? `item ${itemId}`;
        const pendingRemove = pendingRemoveSlotIds?.has(slot.id) === true;
        const command = (event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>): NhEquipmentItemCommand | null =>
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
                className="nhEquipmentSlotTileSprite"
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
                className="nhEquipmentItemButton"
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
              className="nhEquipmentItemSprite"
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

function NhEquipmentUtilityButtonLayer({
  atlas,
  onDefaultAction,
  panel
}: {
  readonly atlas: NhHudAtlas;
  readonly onDefaultAction: ((command: NhEquipmentUtilityButtonCommand) => void) | undefined;
  readonly panel: NhEquipmentPanelLayout | null;
}): JSX.Element | null {
  if (!panel || panel.utilityButtons.length === 0) {
    return null;
  }

  return (
    <div className="nhEquipmentUtilityButtonLayer" data-group-id={panel.groupId}>
      {panel.utilityButtons.map((button) => {
        const action = defaultSourceWidgetAction(button.actions);
        if (!action) {
          return null;
        }
        const menuOpcode = action.menuOpcode;
        return (
          <span key={button.widgetId}>
            <NhEquipmentUtilityButtonSprite atlas={atlas} button={button} />
            <button
              aria-label={button.label}
              className="nhEquipmentUtilityButton"
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
              <span className="nhWidgetAccessibleText">{button.label}</span>
            </button>
          </span>
        );
      })}
    </div>
  );
}

function NhEquipmentUtilityButtonSprite({
  atlas,
  button
}: {
  readonly atlas: NhHudAtlas;
  readonly button: NhEquipmentUtilityButtonLayout;
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
      className="nhEquipmentUtilityButtonSprite"
      data-button-id={button.id}
      data-child-id={button.spriteChildId ?? ""}
      data-sprite-id={button.spriteId}
      data-widget-id={button.spriteWidgetId ?? ""}
      style={equipmentUtilityButtonSpriteStyle(atlas, sprite, button.spriteRect)}
    />
  );
}

function NhEquipmentUtilityPanel({
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
  readonly clientFonts: NhClientFontStore;
  readonly equipmentDefinitions: NhInventoryEquipmentDefinitionStore;
  readonly inventorySlots: readonly (RuntimeInventorySlot | null)[];
  readonly mode: NhEquipmentUtilityPanelMode | null;
  readonly onClose: (() => void) | undefined;
  readonly panel: NhEquipmentPanelLayout | null;
  readonly snapshot: RuntimeSceneSnapshot;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
  readonly viewport: NhRect;
}): JSX.Element | null {
  if (!panel || !mode) {
    return null;
  }

  const font = nhClientFontDefinitionById(clientFonts, nhEquipmentStatsFontId);
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
      className={`nhEquipmentUtilityPanel nhEquipmentUtilityPanel-${mode}`}
      data-group-id={panel.groupId}
      data-panel-mode={mode}
      data-source-equipment-interface="Interface.EQUIPMENT group 387"
      data-source-main-interface={mode === "stats" ? "Interface.EQUIPMENT_STATS = 84" : ""}
      data-source-inventory-interface={mode === "stats" ? "Interface.EQUIPMENT_STATS_INVENTORY = 85" : ""}
      data-source-server-handler={equipmentUtilityPanelServerHandler(mode)}
      style={rectStyle(viewport)}
    >
      <div className="nhEquipmentUtilityPanelFrame">
        <button
          aria-label="Close"
          className="nhEquipmentUtilityPanelClose"
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
          <span className="nhWidgetAccessibleText">Close</span>
        </button>
        <NhEquipmentPanelText
          atlas={fontAtlas}
          color={equipmentStatsTextColor}
          font={font}
          left={18}
          text={title}
          top={13}
          width={220}
        />
        {mode === "stats" ? (
          <NhEquipmentStatsPanel atlas={fontAtlas} bonuses={bonuses} font={font} />
        ) : mode === "items-kept-on-death" ? (
          <NhItemsKeptPanel
            atlas={fontAtlas}
            carriedItemIds={carriedItemIds}
            font={font}
            itemAtlas={spriteAtlases.get("item_sprites")}
          />
        ) : mode === "guide-prices" ? (
          <NhEquipmentPanelMessage
            atlas={fontAtlas}
            font={font}
            lines={["This feature will be added with", "the release of the Grand Exchange!"]}
            source="TabEquipment.java h.actions[19] guide price action disabled in reference server"
          />
        ) : (
          <NhEquipmentPanelMessage
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

function NhEquipmentStatsPanel({
  atlas,
  bonuses,
  font
}: {
  readonly atlas: NhHudAtlas | undefined;
  readonly bonuses: BonusTable;
  readonly font: NhClientFontDefinition | null;
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
            <NhEquipmentPanelText
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
          <NhEquipmentPanelText
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

function NhItemsKeptPanel({
  atlas,
  carriedItemIds,
  font,
  itemAtlas
}: {
  readonly atlas: NhHudAtlas | undefined;
  readonly carriedItemIds: readonly number[];
  readonly font: NhClientFontDefinition | null;
  readonly itemAtlas: NhHudAtlas | undefined;
}): JSX.Element {
  const kept = carriedItemIds.slice(0, 3);
  return (
    <>
      <NhEquipmentPanelMessage
        atlas={atlas}
        font={font}
        lines={["Items kept are opened by Nh", "Interface.ITEMS_KEPT_ON_DEATH = 4"]}
        source="IKOD.open sends interface 4 and clientscript 118"
      />
      <div className="nhItemsKeptIconRow" data-source-handler="IKOD.open getItems inventory/equipment">
        {kept.map((itemId, index) => {
          const sprite = itemAtlas ? findItemSprite(itemAtlas, itemId, "normal", 1) : undefined;
          return sprite && itemAtlas ? (
            <span
              aria-hidden="true"
              className="nhItemsKeptIcon"
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

function NhEquipmentPanelMessage({
  atlas,
  font,
  lines,
  source
}: {
  readonly atlas: NhHudAtlas | undefined;
  readonly font: NhClientFontDefinition | null;
  readonly lines: readonly string[];
  readonly source: string;
}): JSX.Element {
  return (
    <>
      {lines.map((line, index) => (
        <NhEquipmentPanelText
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

function NhEquipmentPanelText({
  atlas,
  color,
  dataSourceWidget,
  font,
  left,
  text,
  top,
  width
}: {
  readonly atlas: NhHudAtlas | undefined;
  readonly color: string;
  readonly dataSourceWidget?: string;
  readonly font: NhClientFontDefinition | null;
  readonly left: number;
  readonly text: string;
  readonly top: number;
  readonly width: number;
}): JSX.Element {
  return (
    <span
      className="nhEquipmentPanelText"
      data-source-font-id={font?.fontId ?? ""}
      data-source-font-archive={font?.fontArchiveName ?? ""}
      data-source-widget={dataSourceWidget ?? ""}
      style={{ left, top, width, height: 13 }}
    >
      {font && atlas ? (
        <NhSourceGlyphText
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
  equipmentDefinitions: NhInventoryEquipmentDefinitionStore
): BonusTable {
  const rows = Array.from(localPlayerEquipmentItemIdsBySlot(snapshot, equipmentDefinitions).values())
    .map((itemId) => nhEquipmentBonusRowsByItemId.get(itemId))
    .filter((row): row is EquipmentBonusRow => row !== undefined);
  return rows.length > 0 ? aggregateBonuses(rows) : zeroBonuses;
}

function equipmentStatsAsBonus(value: number, percent: boolean): string {
  return `${value >= 0 ? "+" : ""}${value}${percent ? "%" : ""}`;
}

function equipmentUtilityPanelServerHandler(mode: NhEquipmentUtilityPanelMode): string {
  if (mode === "stats") {
    return "EquipmentStats.open";
  }
  if (mode === "items-kept-on-death") {
    return "IKOD.open";
  }
  if (mode === "call-follower") {
    return "TabEquipment h.actions[23]";
  }
  return "TabEquipment h.actions[19] is commented in Nh";
}

function NhCombatPanelLayer({
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
  readonly clientFonts: NhClientFontStore;
  readonly equipmentDefinitions: NhInventoryEquipmentDefinitionStore;
  readonly hud: RuntimeHudState;
  readonly onAutocastDefaultAction: ((command: NhCombatAutocastCommand) => void) | undefined;
  readonly onAutoRetaliateDefaultAction: ((command: NhCombatAutoRetaliateCommand) => void) | undefined;
  readonly onSpecialDefaultAction: ((command: NhCombatSpecialCommand) => void) | undefined;
  readonly onStyleDefaultAction: ((command: NhCombatStyleCommand) => void) | undefined;
  readonly panel: NhCombatPanelLayout | null;
  readonly snapshot: RuntimeSceneSnapshot;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
  readonly weaponTypeDefinitions: NhWeaponTypeDefinitionStore;
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
  const hudWeaponType = weaponItemId === null ? null : nhWeaponTypeDefinitionByConfig(weaponTypeDefinitions, hud.weaponTypeConfig);
  const weaponType = equipmentWeaponType ?? hudWeaponType;
  const weaponTypeSource = equipmentWeaponType ? "equipment-definition" : hudWeaponType ? "hud-config" : "";
  const weaponName = weaponDefinition?.name ?? "Unarmed";
  const weaponHasSpecialAttack = Boolean(weaponDefinition?.specialAttack);
  const weaponHasCombatTabSpecialBar =
    weaponHasSpecialAttack || (weaponItemId !== null && combatTabVisibleSpecBarWithoutServerSpecialItemIds.has(weaponItemId));
  const combatLevel = nhCombatLevelFromHud(hud);
  const combatInterfacePanel = nhCombatInterfaceSetupLayout(panel, weaponType);
  const styleSlots = combatStyleSlots(combatInterfacePanel, weaponType);
  const selectedAttackSetIndex = normalizeCombatAttackSetIndex(hud.attackSet);
  const autoRetaliate = combatInterfacePanel.autoRetaliate;
  const clientAtlas = spriteAtlases.get("client_ui");
  const attackStylesPluginEnabled = attackStylesConfig?.enabled === true;
  const hideAutoRetaliate =
    attackStylesPluginEnabled && attackStylesConfig.hideAutoRetaliate;
  const visibleStyleSlots = styleSlots.filter(
    ({ slot }) => !nhCombatStyleHiddenByRuneliteAttackStyles(weaponType, slot.index, attackStylesConfig)
  );
  const visibleAutocastControls = combatInterfacePanel.autocastControls.filter(
    (control) => !nhAutocastControlHiddenByRuneliteAttackStyles(weaponType, control, attackStylesConfig)
  );

  return (
    <div
      className="nhCombatPanelLayer"
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
        <NhCombatText
          className="nhCombatText nhCombatWeaponName"
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
        <NhCombatText
          className="nhCombatText nhCombatLevel"
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
        const presentation = nhCombatStylePresentation(weaponType, slot, attackSet);
        return (
          <span className="nhCombatStyleControl" key={`${slot.actionChildId}:${attackSet.child}`}>
            {clientAtlas ? (
              <NhCombatOptionsButtonBackground
                atlas={clientAtlas}
                className="nhCombatButtonSprite nhCombatStyleButtonSprite"
                dataAttributes={{
                  "data-button-sprite-id": selected ? combatStyleButtonSelectedSpriteId : combatStyleButtonSpriteId,
                  "data-slot-index": slot.index
                }}
                rect={slot.actionRect}
                selected={selected}
              />
            ) : null}
            {clientAtlas && slot.iconRect && presentation.iconSpriteId !== null ? (
              <NhCombatSourceSprite
                atlas={clientAtlas}
                className="nhCombatButtonSprite nhCombatStyleIconSprite"
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
              aria-label={`${presentation.label} ${nhAttackStyleLabel(attackSet.style)} attack style`}
              aria-pressed={selected}
              className="nhCombatStyleSlot"
              data-action-text={nhSourceActionText(slot.actions)}
              data-action-child-id={slot.actionChildId}
              data-action-widget-id={slot.actionWidgetId}
              data-attack-set-child-id={attackSet.child}
              data-attack-set-index={selectedAttackSetIndex ?? ""}
              data-attack-set-varp-id={combatAttackSetVarpId}
              data-attack-style={attackSet.style}
              data-attack-style-label={nhAttackStyleLabel(attackSet.style)}
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
                  actionText: nhSourceActionText(slot.actions),
                  attackSetVarpId: combatAttackSetVarpId,
                  previousAttackSetIndex: selectedAttackSetIndex,
                  position: runtimeViewportPointerPosition(event)
                });
              }}
              style={rectStyle(slot.actionRect)}
              type="button"
            >
              <span className="nhWidgetAccessibleText">{presentation.label}</span>
            </button>
          </span>
        );
      })}
      {visibleStyleSlots.map(({ slot, attackSet }) => {
        const presentation = nhCombatStylePresentation(weaponType, slot, attackSet);
        return (
          <NhCombatText
            className="nhCombatStyleText"
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
              <span className="nhCombatAutocastControl" key={`${control.id}:${control.childId}`}>
                {clientAtlas ? (
                  <NhCombatSourceSprite
                    atlas={clientAtlas}
                    className="nhCombatButtonSprite nhCombatAutocastButtonSprite"
                    rect={control.rect}
                    spriteId={selected ? combatStyleButtonSelectedSpriteId : combatStyleButtonSpriteId}
                  />
                ) : null}
                {clientAtlas && control.magicIconSpriteId !== null && control.magicIconRect !== null ? (
                  <NhCombatSourceSprite
                    atlas={clientAtlas}
                    className="nhCombatAutocastIconSprite nhCombatAutocastMagicIconSprite"
                    rect={control.magicIconRect}
                    spriteId={control.magicIconSpriteId}
                  />
                ) : null}
                {clientAtlas && control.defensiveIconSpriteId !== null && control.defensiveIconRect !== null ? (
                  <NhCombatSourceSprite
                    atlas={clientAtlas}
                    className="nhCombatAutocastIconSprite nhCombatAutocastDefensiveIconSprite"
                    rect={control.defensiveIconRect}
                    spriteId={control.defensiveIconSpriteId}
                  />
                ) : null}
                {control.label ? (
                  <NhCombatText
                    className="nhCombatAutocastText"
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
                  className="nhCombatAutocastSource"
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
                      actionText: control.actionText || nhSourceActionText(control.actions),
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
                  <span className="nhWidgetAccessibleText">Ice Barrage</span>
                </button>
              </span>
            );
          })
        : null}
      {combatInterfacePanel.specialBar && weaponHasCombatTabSpecialBar ? (
        <NhCombatSpecialBar
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
        <span className="nhCombatAutoRetaliateControl">
          {clientAtlas ? (
            <NhCombatSourceSprite
              atlas={clientAtlas}
              className="nhCombatButtonSprite nhCombatAutoRetaliateButtonSprite"
              rect={autoRetaliate.rect}
              spriteId={hud.autoRetaliate === true ? combatAutoRetaliateButtonSelectedSpriteId : combatAutoRetaliateButtonSpriteId}
            />
          ) : null}
          <button
            aria-label={autoRetaliate.actionText || "Auto retaliate"}
            aria-pressed={hud.autoRetaliate === true}
            className="nhCombatAutoRetaliateSource"
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
                actionText: autoRetaliate.actionText || nhSourceActionText(autoRetaliate.actions),
                autoRetaliateVarpId: combatAutoRetaliateVarpId,
                enabled: hud.autoRetaliate,
                position: runtimeViewportPointerPosition(event)
              });
            }}
            style={rectStyle(autoRetaliate.rect)}
            type="button"
          >
            <span className="nhWidgetAccessibleText">{autoRetaliate.actionText || "Auto retaliate"}</span>
          </button>
        </span>
      ) : null}
    </div>
  );
}

function NhCombatText({
  className,
  clientFonts,
  dataAttributes,
  spriteAtlases,
  text,
  textLayout
}: {
  readonly className: string;
  readonly clientFonts: NhClientFontStore;
  readonly dataAttributes?: Record<string, string | number>;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
  readonly text: string;
  readonly textLayout: NhCombatTextLayout;
}): JSX.Element {
  const font = nhClientFontDefinitionById(clientFonts, textLayout.fontId);
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
        <NhSourceGlyphText
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
        <span className="nhWidgetAccessibleText" data-source-glyph-missing="true">
          {text}
        </span>
      )}
    </span>
  );
}

function NhCombatSourceSprite({
  atlas,
  className,
  dataAttributes,
  rect,
  spriteAlias,
  spriteId
}: {
  readonly atlas: NhHudAtlas;
  readonly className: string;
  readonly dataAttributes?: Record<string, string | number>;
  readonly rect: NhRect;
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
      <span className="nhCombatSourceSpriteFrame" style={spriteStyle(atlas, sprite)} />
    </span>
  );
}

function NhCombatOptionsButtonBackground({
  atlas,
  className,
  dataAttributes,
  rect,
  selected
}: {
  readonly atlas: NhHudAtlas;
  readonly className: string;
  readonly dataAttributes?: Record<string, string | number>;
  readonly rect: NhRect;
  readonly selected: boolean;
}): JSX.Element | null {
  return (
    <NhCombatSlicedStyleButtonBackground
      atlas={atlas}
      className={className}
      dataAttributes={dataAttributes}
      rect={rect}
      spriteId={selected ? combatStyleButtonSelectedSpriteId : combatStyleButtonSpriteId}
    />
  );
}

function NhCombatSlicedStyleButtonBackground({
  atlas,
  className,
  dataAttributes,
  rect,
  spriteId
}: {
  readonly atlas: NhHudAtlas;
  readonly className: string;
  readonly dataAttributes?: Record<string, string | number>;
  readonly rect: NhRect;
  readonly spriteId: number;
}): JSX.Element | null {
  const sprite = findSpriteById(atlas, spriteId);
  if (!sprite) {
    return null;
  }

  const pieces = nhCombatOptionsButtonFramePieces(rect);
  return (
    <span
      aria-hidden="true"
      className={`${className} nhCombatOptionsButtonFrame`}
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
        <NhCombatSlicedStyleButtonFramePiece
          atlas={atlas}
          key={piece.key}
          piece={piece}
          sourceRect={nhCombatStyleButtonSourcePieceRect(sprite, piece.key)}
          sprite={sprite}
        />
      ))}
    </span>
  );
}

function NhCombatSlicedStyleButtonFramePiece({
  atlas,
  piece,
  sourceRect,
  sprite
}: {
  readonly atlas: NhHudAtlas;
  readonly piece: NhCombatOptionsButtonFramePieceLayout;
  readonly sourceRect: NhRect;
  readonly sprite: NhHudSprite;
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
          className="nhCombatOptionsButtonTile"
          key={`${tileX}:${tileY}`}
          style={combatSlicedSpriteTileStyle(atlas, sprite, sourceRect, tileX * sourceRect.width, tileY * sourceRect.height)}
        />
      );
    }
  }

  return (
    <span
      aria-hidden="true"
      className="nhCombatOptionsButtonPiece"
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

function NhCombatSpecialBar({
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
  readonly clientFonts: NhClientFontStore;
  readonly drawSpecbarAnyway: boolean;
  readonly hud: RuntimeHudState;
  readonly onDefaultAction: ((command: NhCombatSpecialCommand) => void) | undefined;
  readonly specialActionAvailable: boolean;
  readonly specialBar: NhCombatSpecialBarLayout;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
  readonly weaponDefinition: NhInventoryEquipmentDefinition | undefined;
  readonly weaponItemId: number | null;
  readonly weaponName: string;
}): JSX.Element {
  const energy = normalizeSpecialEnergy(hud.specialEnergy);
  const drainPercent = normalizeSpecialDrainPercent(weaponDefinition?.specialAttack?.drainPercent ?? 0);
  const drainSource = weaponDefinition?.specialAttack?.source ?? "";
  const specialActive = hud.specialActive === true;
  const specialAvailable = specialActionAvailable;
  const specialUsable = specialAvailable && (drainPercent <= 0 || energy >= drainPercent);
  const fillWidth = nhCombatSpecialFillWidth(energy, specialBar.containerRect.width);
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
      aria-label={stripNhTags(specialBar.actionText) || text}
      aria-pressed={specialActive}
      className="nhCombatSpecialBar"
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
          actionText: specialBar.actionText || nhSourceActionText(specialBar.actions),
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
        <NhCombatSourceSprite
          atlas={clientAtlas}
          className="nhCombatButtonSprite nhCombatSpecialButtonSprite"
          rect={{ x: 0, y: 0, width: specialBar.containerRect.width, height: specialBar.containerRect.height }}
          spriteId={combatSpecialAttackButtonSpriteId}
        />
      ) : null}
      <span
        className="nhCombatSpecialBarBackground"
        style={{
          backgroundColor: cssRgbColor(specialBar.backgroundColor ?? undefined, 0x730606),
          left: 2,
          top: 7,
          width: Math.max(0, specialBar.containerRect.width - 4),
          height: 12
        }}
      />
      <span
        className="nhCombatSpecialBarFill"
        style={{
          backgroundColor: cssRgbColor(fillColor, 0x397d3b),
          left: 2,
          top: 7,
          width: fillWidth,
          height: 12
        }}
      />
      <NhCombatText
        className="nhCombatSpecialText"
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
  panel: NhCombatPanelLayout,
  weaponType: NhWeaponTypeDefinition | null
): readonly {
  readonly slot: NhCombatStyleSlotLayout;
  readonly attackSet: NhWeaponAttackSetDefinition;
}[] {
  if (!weaponType) {
    return [];
  }

  return panel.styleSlots.flatMap((slot) => {
    const attackSet = weaponType.attackSets[slot.index];
    return attackSet ? [{ slot, attackSet }] : [];
  });
}

function nhCombatInterfaceSetupLayout(
  panel: NhCombatPanelLayout,
  weaponType: NhWeaponTypeDefinition | null
): NhCombatPanelLayout {
  if (!weaponType) {
    return panel;
  }

  // Source: [clientscript,combat_interface_setup].cs2, which lays out style buttons by visible graphic order.
  if (!combatInterfaceSetupStaffConfigs.has(weaponType.config)) {
    return {
      ...panel,
      styleSlots: nhCombatInterfaceSetupDefaultStyleSlots(panel, weaponType),
      autocastControls: [],
      autoRetaliate: panel.autoRetaliate ? nhCombatInterfaceSetupDefaultAutoRetaliate(panel.rect, panel.autoRetaliate) : null,
      specialBar: panel.specialBar ? nhCombatInterfaceSetupDefaultSpecialBar(panel.rect, panel.specialBar) : null
    };
  }

  return {
    ...panel,
    styleSlots: nhCombatInterfaceSetupStaffStyleSlots(panel, weaponType),
    autocastControls: nhCombatInterfaceSetupStaffAutocastControls(panel.rect, panel.autocastControls),
    autoRetaliate: panel.autoRetaliate ? nhCombatInterfaceSetupStaffAutoRetaliate(panel.rect, panel.autoRetaliate) : null,
    specialBar: panel.specialBar ? nhCombatInterfaceSetupStaffSpecialBar(panel.rect, panel.specialBar) : null
  };
}

function nhCombatInterfaceSetupDefaultStyleSlots(
  panel: NhCombatPanelLayout,
  weaponType: NhWeaponTypeDefinition
): readonly NhCombatStyleSlotLayout[] {
  let visibleOrder = 0;

  return panel.styleSlots.map((slot) => {
    if (!weaponType.attackSets[slot.index]) {
      return slot;
    }

    const actionRect = nhCombatInterfaceSetupDefaultStyleRect(panel.rect, visibleOrder);
    visibleOrder += 1;

    return {
      ...slot,
      actionRect,
      iconRect: slot.iconRect ? nhCombatInterfaceSetupDefaultIconRect(actionRect, slot) : null,
      text: {
        ...slot.text,
        rect: nhCombatInterfaceSetupCenteredRect(actionRect, slot.text.rect.width, slot.text.rect.height, 0, 13)
      }
    };
  });
}

function nhCombatInterfaceSetupDefaultStyleRect(origin: NhRect, visibleOrder: number): NhRect {
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

function nhCombatInterfaceSetupDefaultIconRect(
  actionRect: NhRect,
  slot: NhCombatStyleSlotLayout
): NhRect {
  const width = slot.iconRect?.width ?? 34;
  const height = slot.iconRect?.height ?? 24;
  return nhCombatInterfaceSetupCenteredRect(actionRect, width, height, 0, -6);
}

function nhCombatInterfaceSetupDefaultAutoRetaliate(
  origin: NhRect,
  autoRetaliate: NhCombatAutoRetaliateLayout
): NhCombatAutoRetaliateLayout {
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

function nhCombatInterfaceSetupDefaultSpecialBar(
  origin: NhRect,
  specialBar: NhCombatSpecialBarLayout
): NhCombatSpecialBarLayout {
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

function nhCombatInterfaceSetupStaffStyleSlots(
  panel: NhCombatPanelLayout,
  weaponType: NhWeaponTypeDefinition
): readonly NhCombatStyleSlotLayout[] {
  let visibleOrder = 0;

  return panel.styleSlots.map((slot) => {
    if (!weaponType.attackSets[slot.index]) {
      return slot;
    }

    const actionRect = nhCombatInterfaceSetupStaffStyleRect(panel.rect, visibleOrder);
    visibleOrder += 1;

    return {
      ...slot,
      actionRect,
      iconRect: slot.iconRect ? nhCombatInterfaceSetupStaffIconRect(actionRect, slot) : null,
      text: {
        ...slot.text,
        rect: nhCombatInterfaceSetupCenteredRect(actionRect, slot.text.rect.width, slot.text.rect.height, 0, 10)
      }
    };
  });
}

function nhCombatInterfaceSetupStaffStyleRect(origin: NhRect, visibleOrder: number): NhRect {
  const layout = combatInterfaceSetupWandLayout;
  return {
    x: origin.x + layout.x,
    y: origin.y + layout.y + visibleOrder * (layout.slotHeight + layout.slotGap),
    width: layout.slotWidth,
    height: layout.slotHeight
  };
}

function nhCombatInterfaceSetupStaffIconRect(
  actionRect: NhRect,
  slot: NhCombatStyleSlotLayout
): NhRect {
  const width = slot.iconChildId === 6 ? 33 : slot.iconRect?.width ?? 34;
  const height = slot.iconChildId === 6 ? 23 : slot.iconRect?.height ?? 24;
  return nhCombatInterfaceSetupCenteredRect(actionRect, width, height, 0, -1);
}

function nhCombatInterfaceSetupStaffAutocastControls(
  origin: NhRect,
  controls: readonly NhCombatAutocastControlLayout[]
): readonly NhCombatAutocastControlLayout[] {
  return controls.map((control) => {
    const rect = nhCombatInterfaceSetupStaffAutocastRect(origin, control.defensive);
    return {
      ...control,
      rect,
      displayRect: control.displayRect ? rect : null,
      magicIconRect: control.magicIconRect
        ? nhCombatInterfaceSetupCenteredRect(
            rect,
            control.magicIconRect.width,
            control.magicIconRect.height,
            control.defensive ? 14 : 1,
            control.defensive ? -7 : -3
          )
        : null,
      defensiveIconRect:
        control.defensive && control.defensiveIconRect
          ? nhCombatInterfaceSetupCenteredRect(rect, control.defensiveIconRect.width, control.defensiveIconRect.height, -16, 0)
          : control.defensiveIconRect,
      label: control.label
        ? {
            ...control.label,
            rect: nhCombatInterfaceSetupCenteredRect(rect, rect.width, control.label.rect.height, 0, 15)
          }
        : null
    };
  });
}

function nhCombatInterfaceSetupStaffAutocastRect(origin: NhRect, defensive: boolean): NhRect {
  const layout = combatInterfaceSetupWandLayout;
  const x = origin.x + layout.x + layout.slotWidth + layout.autocastGap;
  return {
    x,
    y: origin.y + layout.y + (defensive ? 0 : layout.autocastHeight - layout.autocastControlHeight),
    width: layout.slotWidth,
    height: layout.autocastControlHeight
  };
}

function nhCombatInterfaceSetupStaffAutoRetaliate(
  origin: NhRect,
  autoRetaliate: NhCombatAutoRetaliateLayout
): NhCombatAutoRetaliateLayout {
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

function nhCombatInterfaceSetupStaffSpecialBar(
  origin: NhRect,
  specialBar: NhCombatSpecialBarLayout
): NhCombatSpecialBarLayout {
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

function nhCombatInterfaceSetupCenteredRect(
  parent: NhRect,
  width: number,
  height: number,
  xOffset: number,
  yOffset: number
): NhRect {
  return {
    x: parent.x + Math.trunc((parent.width - width) / 2) + xOffset,
    y: parent.y + Math.trunc((parent.height - height) / 2) + yOffset,
    width,
    height
  };
}

function nhCombatStylePresentation(
  weaponType: NhWeaponTypeDefinition | null,
  slot: NhCombatStyleSlotLayout,
  attackSet: NhWeaponAttackSetDefinition
): {
  readonly label: string;
  readonly iconSpriteAlias: string | null;
  readonly iconSpriteId: number | null;
  readonly iconSpriteSource: string;
  readonly sourceGraphic: string;
} {
  const sourcePresentation = nhCombatInterfaceSetupPresentation(weaponType?.config, slot.index);
  return {
    label: sourcePresentation?.label ?? nhAttackTypeLabel(attackSet.type),
    iconSpriteAlias: sourcePresentation?.spriteAlias ?? null,
    iconSpriteId: slot.iconSpriteId ?? nhCombatStyleFallbackIconSpriteId(attackSet),
    iconSpriteSource: sourcePresentation
      ? "client-script-graphic"
      : slot.iconSpriteId === null
        ? "runelite-attackstyle-skill"
        : "widget",
    sourceGraphic: sourcePresentation?.graphic ?? ""
  };
}

function nhCombatInterfaceSetupPresentation(
  weaponTypeConfig: number | undefined,
  slotIndex: number
): { readonly label: string; readonly graphic: string; readonly spriteAlias: string } | null {
  if (weaponTypeConfig === undefined) {
    return null;
  }

  // Source: [clientscript,combat_interface_setup].cs2 %varbit357 branches.
  return combatInterfaceSetupPresentationByConfig[weaponTypeConfig]?.[slotIndex] ?? null;
}

function nhCombatStyleFallbackIconSpriteId(attackSet: NhWeaponAttackSetDefinition): number | null {
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

function nhCombatStyleHiddenByRuneliteAttackStyles(
  weaponType: NhWeaponTypeDefinition | null,
  attackSetIndex: number,
  config: RuneliteAttackStylesConfigSnapshot | null
): boolean {
  if (!weaponType || !config?.enabled || !config.removeWarnedStyles) {
    return false;
  }

  const style = runeliteAttackStyleForWeapon(weaponType.config, attackSetIndex, false);
  return style ? runeliteAttackStyleIsWarned(style, config) : false;
}

function nhAutocastControlHiddenByRuneliteAttackStyles(
  weaponType: NhWeaponTypeDefinition | null,
  control: NhCombatAutocastControlLayout,
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

function nhComponentOpacityFromTransparency(value: number): number {
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

function nhSourceActionText(actions: readonly string[]): string {
  return actions.find((action) => action && action !== "*") ?? actions[0] ?? "*";
}

function stripNhTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function nhNoticeboardTextByChildId(snapshot: RuntimeSceneSnapshot): ReadonlyMap<number, string> {
  const green = (value: string | number): string => `${nhNoticeboardGreenTag}${value}${nhNoticeboardCloseTag}`;
  return new Map<number, string>([
    [nhNoticeboardBaseXpChildId, `Base XP: ${green(1)}`]
  ]);
}

function nhResolvedWidgetWithText(widget: NhResolvedWidget, text: string): NhResolvedWidget {
  return {
    ...widget,
    widget: {
      ...widget.widget,
      text
    }
  };
}

function nhResolvedWidgetWithTextColor(widget: NhResolvedWidget, text: string, textColor: number): NhResolvedWidget {
  return {
    ...widget,
    widget: {
      ...widget.widget,
      text,
      textColor
    }
  };
}

function nhClanChatWorldLeft(rowWidth: number): number {
  return Math.max(84, rowWidth - 58);
}

function nhEmoteButtonRect(index: number): NhRect {
  return {
    x: (index % nhEmoteColumns) * nhEmoteButtonStep.width,
    y: Math.trunc(index / nhEmoteColumns) * nhEmoteButtonStep.height + nhEmoteFirstRowOffsetY,
    width: nhEmoteButtonSize.width,
    height: nhEmoteButtonSize.height
  };
}

function nhEmoteSpriteStyle(sprite: NhHudSprite, rect: NhRect): CSSProperties {
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

function nhEmoteSpriteImageStyle(atlas: NhHudAtlas, sprite: NhHudSprite, rect: NhRect): CSSProperties {
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

function nhCombatSpecialFillWidth(energy: number, sourceWidth: number): number {
  const availableWidth = Math.max(0, Math.trunc(sourceWidth) - 4);
  return Math.trunc((normalizeSpecialEnergy(energy) * availableWidth) / 100);
}

function NhStatsPanelLayer({
  atlas,
  clientFonts,
  hud,
  onDefaultAction,
  panel,
  spriteAtlases
}: {
  readonly atlas: NhHudAtlas;
  readonly clientFonts: NhClientFontStore;
  readonly hud: RuntimeHudState;
  readonly onDefaultAction: ((command: NhStatsSkillCommand) => void) | undefined;
  readonly panel: NhStatsPanelLayout | null;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
}): JSX.Element | null {
  if (!panel) {
    return null;
  }

  const leftTile = findSpriteById(atlas, statsTileHalfLeftSpriteId);
  const totalTextFontId = panel.totalLevel?.fontId ?? 494;
  const font = nhClientFontDefinitionById(clientFonts, totalTextFontId);
  const fontAtlas = font ? spriteAtlases.get(font.sheetId as RuntimeSpriteSheetId) : undefined;
  const textColor = cssRgbColor(panel.totalLevel?.textColor, 0xffff00);
  const totalLevel = panel.slots
    .filter((slot) => isStatsEnabledSkill(slot))
    .reduce((sum, slot) => sum + skillStateForSlot(hud, slot).fixed, 0);

  return (
    <div className="nhStatsPanelLayer" data-group-id={panel.groupId}>
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
                className="nhStatsTileSprite nhStatsTileSprite-left"
                data-source-client-script="stats_init"
                data-source-graphic="miscgraphics,4"
                data-sprite-id={statsTileHalfLeftSpriteId}
                data-skill-id={slot.id}
                style={statsTileSpriteStyle(atlas, leftTile, slot, "left")}
              />
            ) : null}
            {rightTile ? (
              <span
                className="nhStatsTileSprite nhStatsTileSprite-right"
                data-source-client-script="stats_init"
                data-source-graphic={boosted ? "miscgraphics,6" : "miscgraphics,5"}
                data-sprite-id={boosted ? statsTileHalfRightWithSlashSpriteId : statsTileHalfRightSpriteId}
                data-skill-id={slot.id}
                style={statsTileSpriteStyle(atlas, rightTile, slot, "right")}
              />
            ) : null}
            {icon ? (
              <span
                className="nhStatsSkillIconSprite"
                data-source-client-script="stats_init"
                data-source-enum="enum_255"
                data-sprite-id={slot.spriteId}
                data-skill-id={slot.id}
                style={statsSkillIconSpriteStyle(atlas, icon, slot)}
              />
            ) : null}
            <NhStatsLevelText
              atlas={fontAtlas}
              className="nhStatsSkillLevelText nhStatsSkillLevelText-current"
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
            <NhStatsLevelText
              atlas={fontAtlas}
              className="nhStatsSkillLevelText nhStatsSkillLevelText-fixed"
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
              className="nhStatsSkillSlot"
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
        <NhStatsTotalLevelText
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

function NhStatsLevelText({
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
  readonly atlas: NhHudAtlas | undefined;
  readonly className: string;
  readonly color: string;
  readonly font: NhClientFontDefinition | null;
  readonly kind: "current" | "fixed";
  readonly lineHeight: number | undefined;
  readonly shadowed: boolean | undefined;
  readonly slot: NhStatsSkillSlotLayout;
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
        <NhSourceGlyphText
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
        <span className="nhWidgetAccessibleText" data-source-glyph-missing="true">
          {text}
        </span>
      )}
    </span>
  );
}

function NhStatsTotalLevelText({
  atlas,
  color,
  font,
  text,
  totalLevel
}: {
  readonly atlas: NhHudAtlas | undefined;
  readonly color: string;
  readonly font: NhClientFontDefinition | null;
  readonly text: string;
  readonly totalLevel: NhStatsPanelLayout["totalLevel"];
}): JSX.Element | null {
  if (!totalLevel) {
    return null;
  }

  const glyphCount = font && atlas ? glyphCountForText(font, atlas, text) : 0;
  return (
    <span
      className="nhStatsTotalLevelText"
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
        <NhSourceGlyphText
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
        <span className="nhWidgetAccessibleText" data-source-glyph-missing="true">
          {text}
        </span>
      )}
    </span>
  );
}

interface NhPrayerReorderDragState {
  readonly pointerId: number;
  readonly sourcePrayerId: string;
  readonly startX: number;
  readonly startY: number;
  readonly moved: boolean;
}

interface NhSpellReorderDragState {
  readonly pointerId: number;
  readonly sourceSpellId: string;
  readonly startX: number;
  readonly startY: number;
  readonly moved: boolean;
}

function orderedNhPrayerSlots(
  panel: NhPrayerPanelLayout,
  reorderOrder: readonly string[] | undefined
): readonly NhPrayerSlotLayout[] {
  if (!reorderOrder || reorderOrder.length === 0) {
    return panel.slots;
  }

  const byId = new Map(panel.slots.map((slot) => [slot.id, slot]));
  const used = new Set<string>();
  const ordered = reorderOrder.flatMap((id) => {
    const slot = byId.get(id as NhPrayerId);
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

function orderedNhSpellbookSpells(
  panel: NhSpellbookPanelLayout,
  reorderOrder: readonly string[] | undefined
): readonly NhSpellbookSpellLayout[] {
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

function NhPrayerIconLayer({
  atlas,
  hud,
  onDefaultAction,
  onDragReorder,
  panel,
  reorderingEnabled,
  reorderOrder
}: {
  readonly atlas: NhHudAtlas | undefined;
  readonly hud: RuntimeHudState;
  readonly onDefaultAction: ((command: NhPrayerSlotCommand) => void) | undefined;
  readonly onDragReorder: ((command: NhPrayerSlotDragCommand) => void) | undefined;
  readonly panel: NhPrayerPanelLayout | null;
  readonly reorderingEnabled: boolean;
  readonly reorderOrder: readonly string[] | undefined;
}): JSX.Element | null {
  const [dragState, setDragState] = useState<NhPrayerReorderDragState | null>(null);
  const dragStateRef = useRef<NhPrayerReorderDragState | null>(null);
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

  const visualSlots = orderedNhPrayerSlots(panel, reorderOrder);
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
      className="nhPrayerIconLayer"
      data-container-child-id={panel.containerChildId}
      data-container-widget-id={panel.containerWidgetId}
      data-group-id={panel.groupId}
      data-reordering-enabled={String(reorderingEnabled)}
    >
      {icons.map(({ slot, sprite }) => {
        const definition = nhPrayerDefinition(slot.id);
        const activePrayerIds = nhActivePrayerIds(hud.prayers);
        const active = hud.prayers?.[slot.id] === true;
        const disallowedPrayerIds = definition ? nhPrayerDisallowedIds(definition) : [];
        const activeBackground = active ? findSpriteById(atlas, activatedPrayerBackgroundSpriteId) : undefined;
        const dragging = dragState?.sourcePrayerId === slot.id;
        return (
          <span className="nhPrayerSlot" key={`${slot.childId}:${slot.spriteId}`}>
            <button
              aria-label={`Prayer ${slot.label}`}
              aria-pressed={active}
              className="nhPrayerSlotButton"
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
              data-source-action-text={nhSourceActionText(slot.actions)}
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
                  actionText: nhSourceActionText(slot.actions),
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
                const destinationSlot = destinationPrayerId ? slotById.get(destinationPrayerId as NhPrayerId) : undefined;
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
                  actionText: nhSourceActionText(slot.actions),
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
                className="nhPrayerActiveBackground"
                data-prayer-id={slot.id}
                data-sprite-id={activatedPrayerBackgroundSpriteId}
                style={prayerActiveBackgroundStyle(atlas, activeBackground, slot)}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={`nhPrayerIconSprite${dragging ? " nhPrayerIconSprite-reorderDragging" : ""}`}
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
              data-source-action-text={nhSourceActionText(slot.actions)}
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

function NhSpellbookIconLayer({
  atlas,
  hud,
  onDefaultAction,
  onDragReorder,
  panel,
  reorderingEnabled,
  reorderOrder,
  selectedSpell
}: {
  readonly atlas: NhHudAtlas | undefined;
  readonly hud: RuntimeHudState | undefined;
  readonly onDefaultAction: ((command: NhSpellbookSpellCommand) => void) | undefined;
  readonly onDragReorder: ((command: NhSpellbookSpellDragCommand) => void) | undefined;
  readonly panel: NhSpellbookPanelLayout | null;
  readonly reorderingEnabled: boolean;
  readonly reorderOrder: readonly string[] | undefined;
  readonly selectedSpell: NhSelectedSpell | null;
}): JSX.Element | null {
  const [dragState, setDragState] = useState<NhSpellReorderDragState | null>(null);
  const dragStateRef = useRef<NhSpellReorderDragState | null>(null);
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
  const visualSpells = orderedNhSpellbookSpells(panel, reorderOrder);
  const spellById = new Map(visualSpells.map((spell) => [spell.id, spell]));
  const icons = visualSpells.flatMap((spell) => {
    const magicLevelCanCast = nhMagicSpellCurrentLevelCanCast(spell.id, currentMagicLevel);
    const renderedSpriteId = magicLevelCanCast ? spell.enabledSpriteId : spell.disabledSpriteId;
    const sprite = findSpriteById(atlas, renderedSpriteId) ?? findSpriteById(atlas, spell.spriteId);
    const requiredMagicLevel = nhMagicSpellLevelRequirement(spell.id);
    const levelFilterAllows = nhMagicSpellLevelFilterAllows(spell.id, currentMagicLevel, fixedMagicLevel);
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
      className="nhSpellbookIconLayer"
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
            className={`nhSpellbookIconSprite${selected ? " nhSpellbookIconSprite-selected" : ""}${dragging ? " nhSpellbookIconSprite-reorderDragging" : ""}`}
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
              className="nhSpellbookIconGraphic"
              style={spellbookIconGraphicStyle(atlas, sprite)}
            />
          </button>
        );
      })}
    </div>
  );
}

function NhOrb({
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
}: NhOrbProps): JSX.Element | null {
  if (!layout) {
    return null;
  }

  const normalizedValue = normalizeOrbValue(value);
  const normalizedMax = normalizeOrbMax(maxValue);
  const fillPixels = nhOrbFillPixels(normalizedValue, normalizedMax, layout.fillRect.height);
  const clippedTop = layout.fillRect.height - fillPixels;
  const valueText = valueTextOverride ?? String(normalizedValue);
  const valueFont = nhClientFontDefinitionById(clientFonts, layout.valueText?.fontId);
  const valueFontAtlas = valueFont ? spriteAtlases.get(valueFont.sheetId as RuntimeSpriteSheetId) : undefined;
  const valueGlyphCount = valueFont && valueFontAtlas ? glyphCountForText(valueFont, valueFontAtlas, valueText) : 0;
  const sourceStateFillerSpriteId = active && layout.activeFillerSpriteId ? layout.activeFillerSpriteId : layout.fillerSpriteId;
  const displayedFillerSpriteId = fillerSpriteIdOverride ?? sourceStateFillerSpriteId;
  const actionText = nhSourceActionText(layout.actions);
  const actionLabel = ariaLabel ?? stripNhTags(actionText);
  const canUseDefaultAction = actionEnabled && Boolean(onDefaultAction && layout.actionRect);
  const fillOpacity =
    fillerTransparency === null || fillerTransparency === undefined ? undefined : nhComponentOpacityFromTransparency(fillerTransparency);
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
        if (event.button !== 0 || !actionEnabled || !onDefaultAction || !nhOrbActionPointerInside(event, layout)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onDefaultAction(event);
      }}
      style={orbStyle(layout)}
    >
      <NhSpriteById
        atlas={atlas}
        className="nhFixedOrbFrame"
        spriteId={layout.frameSpriteId}
        style={positionStyle(layout.frameRect)}
      />
      <NhSpriteById
        atlas={atlas}
        className="nhFixedOrbEmpty"
        spriteId={layout.emptySpriteId}
        style={positionStyle(layout.emptyRect)}
      />
      <span
        className="nhFixedOrbFillMask"
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
        <NhSpriteById
          atlas={atlas}
          className="nhFixedOrbFilledSlice"
          spriteId={displayedFillerSpriteId}
          style={{ left: 0, top: -clippedTop }}
        />
      </span>
      <NhSpriteById
        atlas={atlas}
        className="nhFixedOrbIcon"
        spriteId={layout.iconSpriteId}
        style={positionStyle(layout.iconRect)}
      />
      <span
        className="nhFixedOrbValue"
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
          <NhSourceGlyphText
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
          <span className="nhWidgetAccessibleText" data-source-glyph-missing="true">
            {valueText}
          </span>
        )}
      </span>
      {canUseDefaultAction ? (
        <button
          aria-label={actionLabel}
          className="nhFixedOrbHitbox"
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

function NhXpDropOrb({
  atlas,
  layout,
  onDefaultAction,
  onContextMenu,
  shown
}: {
  readonly atlas: NhHudAtlas;
  readonly layout: NhXpDropOrbLayout | null;
  readonly onDefaultAction: ((command: NhXpDropOrbCommand) => void) | undefined;
  readonly onContextMenu: ((command: NhXpDropOrbCommand) => void) | undefined;
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
      className="nhXpDropOrb"
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
      <span aria-hidden="true" className="nhXpDropOrbSprite" style={spriteStyle(atlas, sprite)} />
      <span className="nhWidgetAccessibleText">{`${actionText} XP drops`}</span>
    </button>
  );
}

function nhOrbActionPointerInside(event: ReactPointerEvent<HTMLElement>, layout: NhFixedOrbLayout): boolean {
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

function orbStyle(layout: NhFixedOrbLayout | null): CSSProperties | undefined {
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

function nhOrbFillPixels(value: number, maxValue: number, fillHeight: number): number {
  const clamped = Math.max(0, Math.min(value, maxValue));
  return Math.trunc((clamped * Math.max(1, fillHeight)) / maxValue);
}

function NhInventorySlotView({
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
}: NhInventorySlotProps): JSX.Element {
  const slotElementRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<NhInventorySlotDragState | null>(null);
  const onDefaultActionRef = useRef(onDefaultAction);
  const onDragReorderRef = useRef(onDragReorder);
  const dragDelayMsRef = useRef(inventoryDragDelayMsFromClientTicks(inventoryDragDelayClientTicks));
  const selectedItemRef = useRef(selectedItem);
  const suppressClickRef = useRef(false);
  const [dragState, setDragState] = useState<NhInventorySlotDragState | null>(null);
  const [pressed, setPressed] = useState(false);
  const suppressNextBrowserClick = (): void => {
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };
  const setInventoryDragState = (state: NhInventorySlotDragState | null): void => {
    dragStateRef.current = state;
    setDragState(state);
  };
  const selected = selectedItem?.slotIndex === index && selectedItem.widgetId === widgetId;
  const item = atlas && slot ? findItemSprite(atlas, slot.itemId, selected ? "selected" : "normal", slot.quantity) : undefined;
  const quantityText = slot ? nhInventoryQuantityText(slot.quantity, itemDefinition, 2) : null;
  const quantityFont = nhClientFontDefinitionById(clientFonts, inventoryQuantityFontId);
  const quantityFontAtlas = quantityFont ? spriteAtlases.get(quantityFont.sheetId as RuntimeSpriteSheetId) : undefined;
  const dragDelayMs = inventoryDragDelayMsFromClientTicks(inventoryDragDelayClientTicks);
  const command = (event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>): NhInventorySlotCommand | null =>
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
    state: NhInventorySlotDragState,
    clientX: number,
    clientY: number
  ): NhInventorySlotCommand => ({
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
      // Source: Nh Client releases a pressed inventory widget by sending the default
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
    // Source: Nh keeps Frames.dragInventoryWidget/dragItemSlotSource alive
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
    // Trainer optimisation: Nh stores inventory drag state globally; keep the
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
      className={`nhInventorySlot${selected ? " nhInventorySlot-selected" : ""}${pendingEquip ? " nhInventorySlot-pendingEquip" : ""}${pressed ? " nhInventorySlot-pressed" : ""}${dragState?.active ? " nhInventorySlot-dragging" : ""}`}
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
        if (consumeNhInventorySuppressedContextMenuEvent()) {
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
          nhInventorySuppressNextContextMenuEvent();
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
          // Synthetic verifier input has no browser-active pointer; Nh press state still exists.
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
            className="nhInventoryItemSprite"
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
            <NhInventoryQuantityText
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

function NhInventoryQuantityText({
  atlas,
  color,
  font,
  text
}: {
  readonly atlas: NhHudAtlas | null;
  readonly color: string;
  readonly font: NhClientFontDefinition | null;
  readonly text: string;
}): JSX.Element {
  const imageUrl = atlas ? `render/sprites/${atlas.metadata.image}` : "";
  const glyphCount = font && atlas ? glyphCountForText(font, atlas, text) : 0;
  return (
    <span
      className="nhInventoryQuantity"
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
      <span className="nhWidgetAccessibleText">{text}</span>
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

function NhSprite({ atlas, alias, className, style }: NhSpriteProps): JSX.Element | null {
  const sprite = findSprite(atlas, alias);
  if (!sprite) {
    return null;
  }
  return <span className={className} style={{ ...spriteStyle(atlas, sprite), ...style }} aria-hidden="true" />;
}

function NhSpriteById({
  atlas,
  spriteId,
  className,
  style
}: {
  readonly atlas: NhHudAtlas;
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

function NhWidgetRectangle({ widget, order }: { readonly widget: NhResolvedWidget; readonly order: number }): JSX.Element | null {
  if (widget.widget.hidden || widget.widget.type !== 3 || widget.rect.width <= 0 || widget.rect.height <= 0) {
    return null;
  }
  return (
    <span
      className="nhWidgetRectangle"
      data-child-id={widget.widget.childId}
      data-text-color={widget.widget.textColor ?? ""}
      data-widget-id={widget.widget.id}
      style={widgetRectangleStyle(widget, order)}
    />
  );
}

function NhWidgetSprite({
  atlas,
  widget,
  order
}: {
  readonly atlas: NhHudAtlas;
  readonly widget: NhResolvedWidget;
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
      className="nhWidgetSprite"
      data-child-id={widget.widget.childId}
      data-source-action-count={widget.widget.actions?.length ?? 0}
      data-sprite-id={widget.widget.spriteId}
      data-widget-id={widget.widget.id}
      style={widgetSpriteStyle(atlas, sprite, widget, order)}
    />
  );
}

function NhWidgetText({
  clientFonts,
  spriteAtlases,
  widget,
  order
}: {
  readonly clientFonts: NhClientFontStore;
  readonly spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, NhHudAtlas>;
  readonly widget: NhResolvedWidget;
  readonly order: number;
}): JSX.Element | null {
  if (widget.widget.hidden || widget.widget.type !== 4 || !widget.widget.text) {
    return null;
  }
  const font = nhClientFontDefinitionById(clientFonts, widget.widget.fontId);
  const atlas = font ? spriteAtlases.get(font.sheetId as RuntimeSpriteSheetId) : undefined;
  const text = widget.widget.text;
  const lines = splitNhWidgetTextLines(text);
  const glyphCount = font && atlas ? glyphCountForText(font, atlas, text) : 0;

  return (
    <span
      className="nhWidgetText"
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
        <NhWidgetGlyphText
          atlas={atlas}
          color={cssRgbColor(widget.widget.textColor, 0xffffff)}
          font={font}
          shadowColor={widget.widget.textShadowed === false ? null : "#000000"}
          text={text}
          widget={widget}
        />
      ) : (
        <span className="nhWidgetAccessibleText" data-source-glyph-missing="true">
          {text}
        </span>
      )}
    </span>
  );
}

function NhWidgetGlyphText({
  atlas,
  color,
  font,
  shadowColor,
  text,
  widget
}: {
  readonly atlas: NhHudAtlas;
  readonly color: string;
  readonly font: NhClientFontDefinition;
  readonly shadowColor: string | null;
  readonly text: string;
  readonly widget: NhResolvedWidget;
}): JSX.Element {
  return (
    <NhSourceGlyphText
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

function NhSourceGlyphText({
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
  readonly atlas: NhHudAtlas;
  readonly color: string;
  readonly font: NhClientFontDefinition;
  readonly height: number;
  readonly lineHeight: number | undefined;
  readonly shadowColor: string | null;
  readonly text: string;
  readonly width: number;
  readonly xTextAlignment: number | undefined;
  readonly yTextAlignment: number | undefined;
}): JSX.Element {
  const lines = splitNhWidgetTextLines(text);
  const baselines = sourceTextBaselines(height, font, lines.length, lineHeight, yTextAlignment);
  const imageUrl = `render/sprites/${atlas.metadata.image}`;
  return (
    <>
      <span className="nhWidgetAccessibleText">{text}</span>
      {lines.flatMap((line, lineIndex) => {
        const baseline = baselines[lineIndex] ?? font.maxAscent;
        const plainLine = stripNhTags(line);
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
  atlas: NhHudAtlas,
  font: NhClientFontDefinition,
  imageUrl: string,
  text: string,
  x: number,
  baseline: number,
  color: string,
  keyPrefix: string
): readonly (JSX.Element | null)[] {
  let cursor = 0;
  return nhTaggedTextRuns(text, color).flatMap((run, runIndex) => {
    const glyphs = renderWidgetGlyphRun(atlas, font, imageUrl, run.text, x + cursor, baseline, run.color, `${keyPrefix}-${runIndex}`);
    cursor += nhClientFontStringWidth(font, run.text);
    return glyphs;
  });
}

function nhTaggedTextRuns(
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
  atlas: NhHudAtlas,
  font: NhClientFontDefinition,
  imageUrl: string,
  text: string,
  x: number,
  baseline: number,
  color: string,
  keyPrefix: string
): readonly (JSX.Element | null)[] {
  return layoutNhClientFontGlyphs(font, text).map((glyph, index) => {
    const sprite = atlas.metadata.sprites.find((candidate) => candidate.spriteId === glyph.charCode);
    if (!sprite || glyph.charCode === 32) {
      return null;
    }

    return (
      <span
        key={`${keyPrefix}-${glyph.charCode}-${index}-${glyph.x}`}
        className="nhWidgetGlyph"
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

function splitNhWidgetTextLines(text: string): readonly string[] {
  const lines = text.split(/<br>/i);
  return lines.length > 0 ? lines : [text];
}

function sourceTextBaselines(
  height: number,
  font: NhClientFontDefinition,
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
  font: NhClientFontDefinition,
  text: string,
  xTextAlignment: number | undefined
): number {
  const textWidth = nhClientFontStringWidth(font, text);
  if (xTextAlignment === 1) {
    return Math.trunc((width - textWidth) / 2);
  }
  if (xTextAlignment === 2) {
    return width - textWidth;
  }
  return 0;
}

function glyphCountForText(
  font: NhClientFontDefinition,
  atlas: NhHudAtlas,
  text: string
): number {
  return splitNhWidgetTextLines(text).reduce(
    (count, line) =>
      count +
      layoutNhClientFontGlyphs(font, line).filter(
        (glyph) => glyph.charCode !== 32 && atlas.metadata.sprites.some((sprite) => sprite.spriteId === glyph.charCode)
      ).length,
    0
  );
}

function findSprite(atlas: NhHudAtlas, alias: string): NhHudSprite | undefined {
  return atlas.metadata.sprites.find((sprite) => sprite.alias === alias || sprite.name === alias);
}

function findSpriteById(atlas: NhHudAtlas, spriteId: number): NhHudSprite | undefined {
  return atlas.metadata.sprites.find((sprite) => sprite.spriteId === spriteId);
}

export function findItemSprite(
  atlas: NhHudAtlas,
  itemId: number,
  variant: "normal" | "selected",
  quantity: number
): NhHudSprite | undefined {
  const normalizedQuantity = Math.max(1, Math.trunc(quantity));
  const matches = atlas.metadata.sprites.filter((sprite) => (sprite.itemId ?? sprite.spriteId) === itemId);
  return (
    bestQuantityItemSprite(matches.filter((sprite) => sprite.variant === variant), normalizedQuantity) ??
    bestQuantityItemSprite(matches.filter((sprite) => sprite.variant === "normal"), normalizedQuantity) ??
    matches.find((sprite) => sprite.spriteId === itemId)
  );
}

function bestQuantityItemSprite(sprites: readonly NhHudSprite[], quantity: number): NhHudSprite | undefined {
  let best: NhHudSprite | undefined;
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

const nhPlayerAppearanceEquipmentContainerSlots = new Set<number>([0, 1, 2, 3, 4, 5, 7, 9, 10]);

function localPlayerEquipmentItemIdsBySlot(
  snapshot: RuntimeSceneSnapshot,
  equipmentDefinitions: NhInventoryEquipmentDefinitionStore
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
    } else if (actor.appearance?.source === "loadout" && nhPlayerAppearanceEquipmentContainerSlots.has(slot)) {
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
  atlas: NhHudAtlas,
  kind: NhMinimapDot["kind"],
  sourceSpriteIndex = nhMinimapMapDotSpriteIndex(kind)
): NhHudSprite | undefined {
  const alias = `map_dot_${kind.replace("-", "_")}`;
  return atlas.metadata.sprites.find((sprite) => sprite.alias === alias) ?? atlas.metadata.sprites.find((sprite) => sprite.frame === sourceSpriteIndex);
}

function findMinimapMarkerSprite(
  atlas: NhHudAtlas,
  kind: NhMinimapMarker["kind"],
  sourceSpriteIndex = nhMinimapMapMarkerSpriteIndex(kind)
): NhHudSprite | undefined {
  const alias = `map_marker_${kind}`;
  return atlas.metadata.sprites.find((sprite) => sprite.alias === alias) ?? atlas.metadata.sprites.find((sprite) => sprite.frame === sourceSpriteIndex);
}

function findMinimapMapSceneSprite(atlas: NhHudAtlas, mapSceneId: number): NhHudSprite | undefined {
  const alias = `map_scene_${mapSceneId}`;
  return atlas.metadata.sprites.find((sprite) => sprite.alias === alias) ?? atlas.metadata.sprites.find((sprite) => sprite.frame === mapSceneId);
}

function findMinimapMapIconSprite(atlas: NhHudAtlas, mapIconId: number): NhHudSprite | undefined {
  const alias = `map_icon_area_${mapIconId}`;
  return atlas.metadata.sprites.find((sprite) => sprite.areaId === mapIconId || sprite.alias === alias);
}

function widgetSpriteStyle(
  atlas: NhHudAtlas,
  sprite: NhHudSprite,
  widget: NhResolvedWidget,
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

function widgetTextStyle(widget: NhResolvedWidget, order: number): CSSProperties {
  return {
    left: widget.rect.x,
    top: widget.rect.y,
    width: widget.rect.width,
    height: widget.rect.height,
    zIndex: order + 1
  };
}

function widgetRectangleStyle(widget: NhResolvedWidget, order: number): CSSProperties {
  return {
    ...rectStyle(widget.rect),
    backgroundColor: cssRgbColor(widget.widget.textColor, 0x000000),
    zIndex: order + 1
  };
}

function combatSourceSpriteContainerStyle(rect: NhRect): CSSProperties {
  return {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    overflow: "hidden"
  };
}

interface NhCombatOptionsButtonFramePieceLayout {
  readonly key: string;
  readonly rect: NhRect;
  readonly tileX: boolean;
  readonly tileY: boolean;
}

function nhCombatOptionsButtonFramePieces(rect: NhRect): readonly NhCombatOptionsButtonFramePieceLayout[] {
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

function combatOptionsButtonPieceStyle(rect: NhRect): CSSProperties {
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

function nhCombatStyleButtonSourcePieceRect(sprite: NhHudSprite, key: string): NhRect {
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
  atlas: NhHudAtlas,
  sprite: NhHudSprite,
  sourceRect: NhRect,
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
  atlas: NhHudAtlas,
  sprite: NhHudSprite,
  slot: NhEquipmentSlotLayout
): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: slot.rect.x + Math.trunc((slot.rect.width - sprite.width) / 2),
    top: slot.rect.y + Math.trunc((slot.rect.height - sprite.height) / 2),
    zIndex: 3
  };
}

function equipmentSlotTileSpriteStyle(
  atlas: NhHudAtlas,
  sprite: NhHudSprite,
  slot: NhEquipmentSlotLayout
): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: slot.rect.x,
    top: slot.rect.y,
    zIndex: 1
  };
}

function equipmentItemButtonStyle(slot: NhEquipmentSlotLayout): CSSProperties {
  return {
    left: slot.rect.x,
    top: slot.rect.y,
    width: slot.rect.width,
    height: slot.rect.height,
    zIndex: 4
  };
}

function equipmentUtilityButtonSpriteStyle(atlas: NhHudAtlas, sprite: NhHudSprite, rect: NhRect): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: rect.x,
    top: rect.y
  };
}

function prayerIconSpriteStyle(
  atlas: NhHudAtlas,
  sprite: NhHudSprite,
  slot: NhPrayerSlotLayout
): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: slot.rect.x + Math.trunc((slot.rect.width - prayerIconGraphicSize.width) / 2),
    top: slot.rect.y + Math.trunc((slot.rect.height - prayerIconGraphicSize.height) / 2)
  };
}

function prayerActiveBackgroundStyle(
  atlas: NhHudAtlas,
  sprite: NhHudSprite,
  slot: NhPrayerSlotLayout
): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: slot.rect.x,
    top: slot.rect.y
  };
}

function spellbookIconButtonStyle(spell: NhSpellbookSpellLayout): CSSProperties {
  return {
    left: spell.rect.x,
    top: spell.rect.y,
    width: spell.rect.width,
    height: spell.rect.height
  };
}

function spellbookIconGraphicStyle(atlas: NhHudAtlas, sprite: NhHudSprite): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: 0,
    position: "absolute",
    pointerEvents: "none",
    top: 0
  };
}

function statsTileSpriteStyle(
  atlas: NhHudAtlas,
  sprite: NhHudSprite,
  slot: NhStatsSkillSlotLayout,
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
  atlas: NhHudAtlas,
  sprite: NhHudSprite,
  slot: NhStatsSkillSlotLayout
): CSSProperties {
  return {
    ...spriteStyle(atlas, sprite),
    left: slot.rect.x + Math.trunc((30 - sprite.width) / 2),
    top: slot.rect.y + Math.trunc((slot.rect.height - sprite.height) / 2),
    zIndex: 2
  };
}

function statsSkillButtonStyle(slot: NhStatsSkillSlotLayout): CSSProperties {
  return {
    ...rectStyle(slot.rect),
    zIndex: 4
  };
}

function statsSkillLevelTextRect(
  slot: NhStatsSkillSlotLayout,
  kind: "current" | "fixed"
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  if (kind === "current") {
    return { x: slot.rect.x + 32, y: slot.rect.y + 4, width: 15, height: 12 };
  }
  return { x: slot.rect.x + 44, y: slot.rect.y + 16, width: 15, height: 12 };
}

function isStatsEnabledSkill(slot: NhStatsSkillSlotLayout): boolean {
  const index = statsLevelArrayIndex(slot);
  return index >= 0 && index < statsEnabledSkillCount;
}

function statsLevelArrayIndex(slot: NhStatsSkillSlotLayout): number {
  return statsLevelArrayIndexBySkillId[slot.id] ?? -1;
}

function skillStateForSlot(hud: RuntimeHudState, slot: NhStatsSkillSlotLayout): RuntimeSkillState {
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

function spriteStyle(atlas: NhHudAtlas, sprite: NhHudSprite): CSSProperties {
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
  atlas: NhHudAtlas,
  sprite: NhHudSprite,
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
  atlas: NhHudAtlas,
  sprite: NhHudSprite,
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
