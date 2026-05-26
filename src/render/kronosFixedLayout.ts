export interface KronosSize {
  readonly width: number;
  readonly height: number;
}

export interface KronosRect extends KronosSize {
  readonly x: number;
  readonly y: number;
}

export interface KronosInterfaceWidget {
  readonly groupId: number;
  readonly childId: number;
  readonly id: number;
  readonly type: number;
  readonly contentType: number;
  readonly parentId: number;
  readonly isIf3?: boolean;
  readonly menuType?: number;
  readonly clickMask?: number;
  readonly hidden: boolean;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly xPositionMode: number;
  readonly yPositionMode: number;
  readonly widthMode: number;
  readonly heightMode: number;
  readonly spriteId: number;
  readonly alternateSpriteId?: number;
  readonly fontId?: number;
  readonly lineHeight?: number;
  readonly xTextAlignment?: number;
  readonly yTextAlignment?: number;
  readonly textShadowed?: boolean;
  readonly textColor?: number;
  readonly xPitch: number;
  readonly yPitch: number;
  readonly text?: string;
  readonly name?: string;
  readonly dataText?: string;
  readonly spellActionName?: string;
  readonly spellName?: string;
  readonly tooltip?: string;
  readonly actions?: readonly string[];
}

export interface KronosInterfaceGroup {
  readonly groupId: number;
  readonly widgets: readonly KronosInterfaceWidget[];
}

export interface KronosClientWidgetDefinitions {
  readonly source: string;
  readonly fixedCanvas: KronosSize;
  readonly groups: readonly KronosInterfaceGroup[];
}

export interface KronosSpellbookDefinitions {
  readonly source: string;
  readonly spellbooks: readonly KronosSpellbookDefinition[];
}

export type KronosSpellbookId = "standard" | "ancient" | "lunar" | "arceuus";

export interface KronosSpellbookDefinition {
  readonly id: KronosSpellbookId;
  readonly enumId: number;
  readonly groupId: number;
  readonly widgetParamId: number;
  readonly smallEnabledSpriteParamId: number;
  readonly smallDisabledSpriteParamId: number;
  readonly largeEnabledSpriteParamId: number;
  readonly largeDisabledSpriteParamId: number;
  readonly spellNameParamId: number;
  readonly spells: readonly KronosSpellbookDefinitionSpell[];
}

export interface KronosSpellbookDefinitionSpell {
  readonly id: string;
  readonly sourceOrder: number;
  readonly itemId: number;
  readonly widgetId: number;
  readonly childId: number;
  readonly label: string;
  readonly enabledSpriteId: number;
  readonly disabledSpriteId: number;
  readonly largeEnabledSpriteId: number;
  readonly largeDisabledSpriteId: number;
}

export interface KronosResolvedWidget {
  readonly widget: KronosInterfaceWidget;
  readonly rect: KronosRect;
}

export interface KronosViewport {
  readonly rect: KronosRect;
  readonly zoom: number;
}

export interface KronosInventoryGridLayout {
  readonly groupId: number;
  readonly widgetId: number;
  readonly containerGroupId: number;
  readonly containerWidgetId: number;
  readonly containerChildId: number;
  readonly containerRect: KronosRect;
  readonly rect: KronosRect;
  readonly columns: number;
  readonly rows: number;
  readonly slot: KronosSize;
  readonly step: KronosSize;
  readonly padding: KronosSize;
}

export type KronosFixedOrbId = "hp" | "prayer" | "run" | "spec";

export interface KronosFixedOrbLayout {
  readonly id: KronosFixedOrbId;
  readonly groupId: number;
  readonly rect: KronosRect;
  readonly actionWidgetId: number | null;
  readonly actionChildId: number | null;
  readonly actionRect: KronosRect | null;
  readonly actions: readonly string[];
  readonly frameSpriteId: number;
  readonly frameRect: KronosRect;
  readonly fillerSpriteId: number;
  readonly activeFillerSpriteId: number | null;
  readonly fillRect: KronosRect;
  readonly emptySpriteId: number;
  readonly emptyRect: KronosRect;
  readonly iconSpriteId: number;
  readonly iconRect: KronosRect;
  readonly valueTextRect: KronosRect | null;
  readonly valueText: KronosFixedOrbValueText | null;
}

export interface KronosXpDropOrbLayout {
  readonly groupId: number;
  readonly widgetId: number;
  readonly childId: number;
  readonly rect: KronosRect;
  readonly clickMask: number;
  readonly actions: readonly string[];
  readonly spriteId: number;
  readonly activeSpriteId: number;
  readonly hoverSpriteId: number;
  readonly activeHoverSpriteId: number;
}

export interface KronosFixedOrbValueText {
  readonly rect: KronosRect;
  readonly fontId?: number;
  readonly lineHeight?: number;
  readonly xTextAlignment?: number;
  readonly yTextAlignment?: number;
  readonly textShadowed?: boolean;
  readonly textColor?: number;
}

export interface KronosMountedInterfaceLayout {
  readonly groupId: number;
  readonly rect: KronosRect;
  readonly widgets: readonly KronosResolvedWidget[];
}

export type KronosEquipmentSlotId =
  | "head"
  | "cape"
  | "amulet"
  | "weapon"
  | "body"
  | "shield"
  | "legs"
  | "hands"
  | "feet"
  | "ring"
  | "ammo";

export interface KronosEquipmentSlotLayout {
  readonly id: KronosEquipmentSlotId;
  readonly serverSlot: number;
  readonly groupId: number;
  readonly widgetId: number;
  readonly childId: number;
  readonly rect: KronosRect;
  readonly actions: readonly string[];
}

export type KronosEquipmentUtilityButtonId = "stats" | "prices" | "items-kept-on-death" | "call-follower";

export interface KronosEquipmentUtilityButtonLayout {
  readonly id: KronosEquipmentUtilityButtonId;
  readonly label: string;
  readonly groupId: number;
  readonly widgetId: number;
  readonly childId: number;
  readonly rect: KronosRect;
  readonly clickMask: number;
  readonly actions: readonly string[];
  readonly spriteWidgetId: number | null;
  readonly spriteChildId: number | null;
  readonly spriteId: number | null;
  readonly spriteRect: KronosRect | null;
}

export interface KronosEquipmentPanelLayout {
  readonly groupId: number;
  readonly rect: KronosRect;
  readonly slots: readonly KronosEquipmentSlotLayout[];
  readonly utilityButtons: readonly KronosEquipmentUtilityButtonLayout[];
}

export interface KronosCombatTextLayout {
  readonly widgetId: number;
  readonly childId: number;
  readonly rect: KronosRect;
  readonly fontId?: number;
  readonly lineHeight?: number;
  readonly xTextAlignment?: number;
  readonly yTextAlignment?: number;
  readonly textShadowed?: boolean;
  readonly textColor?: number;
}

export interface KronosCombatStyleSlotLayout {
  readonly index: number;
  readonly actionWidgetId: number;
  readonly actionChildId: number;
  readonly actionRect: KronosRect;
  readonly sourceHidden: boolean;
  readonly iconWidgetId: number | null;
  readonly iconChildId: number | null;
  readonly iconSpriteId: number | null;
  readonly iconRect: KronosRect | null;
  readonly text: KronosCombatTextLayout;
  readonly actions: readonly string[];
}

export interface KronosCombatSpecialBarLayout {
  readonly containerWidgetId: number;
  readonly containerChildId: number;
  readonly containerRect: KronosRect;
  readonly actionWidgetId: number;
  readonly actionChildId: number;
  readonly actionText: string;
  readonly backgroundWidgetId: number | null;
  readonly backgroundChildId: number | null;
  readonly backgroundColor: number | null;
  readonly fillWidgetId: number | null;
  readonly fillChildId: number | null;
  readonly fillColor: number | null;
  readonly borderWidgetId: number | null;
  readonly borderChildId: number | null;
  readonly borderColor: number | null;
  readonly text: KronosCombatTextLayout | null;
  readonly actions: readonly string[];
}

export interface KronosCombatAutoRetaliateLayout {
  readonly widgetId: number;
  readonly childId: number;
  readonly rect: KronosRect;
  readonly actionText: string;
  readonly actions: readonly string[];
}

export interface KronosCombatAutocastControlLayout {
  readonly id: "standard" | "defensive";
  readonly widgetId: number;
  readonly childId: number;
  readonly rect: KronosRect;
  readonly actionText: string;
  readonly actions: readonly string[];
  readonly defensive: boolean;
  readonly displayWidgetId: number | null;
  readonly displayChildId: number | null;
  readonly displayRect: KronosRect | null;
  readonly magicIconWidgetId: number | null;
  readonly magicIconChildId: number | null;
  readonly magicIconSpriteId: number | null;
  readonly magicIconRect: KronosRect | null;
  readonly defensiveIconWidgetId: number | null;
  readonly defensiveIconChildId: number | null;
  readonly defensiveIconSpriteId: number | null;
  readonly defensiveIconRect: KronosRect | null;
  readonly label: KronosCombatTextLayout | null;
}

export interface KronosCombatPanelLayout {
  readonly groupId: number;
  readonly rect: KronosRect;
  readonly weaponName: KronosCombatTextLayout | null;
  readonly combatLevel: KronosCombatTextLayout | null;
  readonly styleSlots: readonly KronosCombatStyleSlotLayout[];
  readonly autocastControls: readonly KronosCombatAutocastControlLayout[];
  readonly autoRetaliate: KronosCombatAutoRetaliateLayout | null;
  readonly specialBar: KronosCombatSpecialBarLayout | null;
}

export type KronosPrayerId =
  | "thick-skin"
  | "burst-of-strength"
  | "clarity-of-thought"
  | "sharp-eye"
  | "mystic-will"
  | "rock-skin"
  | "superhuman-strength"
  | "improved-reflexes"
  | "rapid-restore"
  | "rapid-heal"
  | "protect-item"
  | "hawk-eye"
  | "mystic-lore"
  | "steel-skin"
  | "ultimate-strength"
  | "incredible-reflexes"
  | "protect-from-magic"
  | "protect-from-missiles"
  | "protect-from-melee"
  | "eagle-eye"
  | "mystic-might"
  | "retribution"
  | "redemption"
  | "smite"
  | "preserve"
  | "chivalry"
  | "piety"
  | "rigour"
  | "augury";

export interface KronosPrayerSlotLayout {
  readonly id: KronosPrayerId;
  readonly label: string;
  readonly spriteId: number;
  readonly groupId: number;
  readonly widgetId: number;
  readonly childId: number;
  readonly sourceOrder: number;
  readonly gridColumn: number;
  readonly gridRow: number;
  readonly rect: KronosRect;
  readonly actions: readonly string[];
}

export interface KronosPrayerPanelLayout {
  readonly groupId: number;
  readonly rect: KronosRect;
  readonly containerWidgetId: number;
  readonly containerChildId: number;
  readonly containerRect: KronosRect;
  readonly columns: number;
  readonly slot: KronosSize;
  readonly step: KronosSize;
  readonly slots: readonly KronosPrayerSlotLayout[];
}

export interface KronosSpellbookSpellLayout {
  readonly id: string;
  readonly label: string;
  readonly itemId: number;
  readonly spriteId: number;
  readonly enabledSpriteId: number;
  readonly disabledSpriteId: number;
  readonly groupId: number;
  readonly widgetId: number;
  readonly childId: number;
  readonly isIf3: boolean;
  readonly menuType: number;
  readonly clickMask: number;
  readonly targetFlags: number;
  readonly spellActionName: string;
  readonly selectedSpellName: string;
  readonly spellName: string;
  readonly dataText: string;
  readonly sourceOrder: number;
  readonly gridColumn: number;
  readonly gridRow: number;
  readonly rect: KronosRect;
  readonly actions: readonly string[];
}

export type KronosSpellbookLayoutMode = "disable-filtering-fixed";

export interface KronosSpellbookPanelLayout {
  readonly id: KronosSpellbookId;
  readonly enumId: number;
  readonly spellbookVarbitId: number;
  readonly spellbookVarbitValue: number;
  readonly disableFilteringVarbitId: number;
  readonly disableFilteringVarbitValue: number;
  readonly layoutMode: KronosSpellbookLayoutMode;
  readonly groupId: number;
  readonly rect: KronosRect;
  readonly parentWidgetId: number;
  readonly parentChildId: number;
  readonly parentRect: KronosRect;
  readonly boundsWidgetId: number;
  readonly boundsChildId: number;
  readonly spellAreaRect: KronosRect;
  readonly columns: number;
  readonly rows: number;
  readonly slot: KronosSize;
  readonly gap: KronosSize;
  readonly step: KronosSize;
  readonly spells: readonly KronosSpellbookSpellLayout[];
}

export type KronosStatsSkillId =
  | "attack"
  | "strength"
  | "defence"
  | "ranged"
  | "prayer"
  | "magic"
  | "runecrafting"
  | "construction"
  | "hitpoints"
  | "agility"
  | "herblore"
  | "thieving"
  | "crafting"
  | "fletching"
  | "slayer"
  | "hunter"
  | "mining"
  | "smithing"
  | "fishing"
  | "cooking"
  | "firemaking"
  | "woodcutting"
  | "farming";

export interface KronosStatsSkillSlotLayout {
  readonly id: KronosStatsSkillId;
  readonly label: string;
  readonly clientId: number;
  readonly spriteId: number;
  readonly groupId: number;
  readonly widgetId: number;
  readonly childId: number;
  readonly sourceOrder: number;
  readonly gridColumn: number;
  readonly gridRow: number;
  readonly rect: KronosRect;
  readonly actions: readonly string[];
}

export interface KronosStatsTotalLevelLayout {
  readonly containerWidgetId: number;
  readonly containerChildId: number;
  readonly containerRect: KronosRect;
  readonly leftSpriteWidgetId: number;
  readonly leftSpriteChildId: number;
  readonly leftSpriteId: number;
  readonly leftSpriteRect: KronosRect;
  readonly rightSpriteWidgetId: number;
  readonly rightSpriteChildId: number;
  readonly rightSpriteId: number;
  readonly rightSpriteRect: KronosRect;
  readonly textWidgetId: number;
  readonly textChildId: number;
  readonly textRect: KronosRect;
  readonly fontId?: number;
  readonly lineHeight?: number;
  readonly xTextAlignment?: number;
  readonly yTextAlignment?: number;
  readonly textShadowed?: boolean;
  readonly textColor?: number;
  readonly actions: readonly string[];
}

export interface KronosStatsPanelLayout {
  readonly groupId: number;
  readonly rect: KronosRect;
  readonly columns: number;
  readonly slot: KronosSize;
  readonly slots: readonly KronosStatsSkillSlotLayout[];
  readonly totalLevel: KronosStatsTotalLevelLayout | null;
}

export type KronosFixedSideTabId =
  | "combat"
  | "stats"
  | "quests"
  | "inventory"
  | "equipment"
  | "prayer"
  | "magic"
  | "clan-chat"
  | "ignores"
  | "friends"
  | "logout"
  | "options"
  | "emotes"
  | "music";

export interface KronosFixedSidePanelTabContainerLayout {
  readonly groupId: number;
  readonly widgetId: number;
  readonly childId: number;
  readonly rect: KronosRect;
  readonly hidden: boolean;
}

export interface KronosFixedSideTabLayout {
  readonly id: KronosFixedSideTabId;
  readonly groupId: number;
  readonly widgetId: number;
  readonly childId: number;
  readonly rect: KronosRect;
  readonly row: "top" | "bottom";
  readonly slotIndex: number;
  readonly spriteId: number;
  readonly iconWidgetId: number;
  readonly iconChildId: number;
  readonly iconSpriteId: number;
  readonly iconRect: KronosRect;
  readonly container: KronosFixedSidePanelTabContainerLayout;
  readonly actions: readonly string[];
}

export interface KronosFixedSidePanelLayout {
  readonly groupId: number;
  readonly rect: KronosRect;
  readonly backgroundSpriteId: number;
  readonly defaultTabId: KronosFixedSideTabId;
  readonly tabs: readonly KronosFixedSideTabLayout[];
}

export interface KronosFixedClientLayout {
  readonly fixedCanvas: KronosSize;
  readonly widgets: readonly KronosResolvedWidget[];
  readonly viewportWidget: KronosResolvedWidget;
  readonly fixedViewportInterfaceContainer: KronosResolvedWidget | null;
  readonly viewport: KronosViewport;
  readonly minimapWidget: KronosResolvedWidget | null;
  readonly compassWidget: KronosResolvedWidget | null;
  readonly chatbox: KronosMountedInterfaceLayout | null;
  readonly sidePanel: KronosFixedSidePanelLayout | null;
  readonly sidePanelInterfaces: Partial<Record<KronosFixedSideTabId, KronosMountedInterfaceLayout>>;
  readonly combatPanel: KronosCombatPanelLayout | null;
  readonly equipmentPanel: KronosEquipmentPanelLayout | null;
  readonly prayerPanel: KronosPrayerPanelLayout | null;
  readonly spellbookPanel: KronosSpellbookPanelLayout | null;
  readonly spellbookPanels: Partial<Record<KronosSpellbookId, KronosSpellbookPanelLayout>>;
  readonly statsPanel: KronosStatsPanelLayout | null;
  readonly inventoryGrid: KronosInventoryGridLayout | null;
  readonly orbs: readonly KronosFixedOrbLayout[];
  readonly xpDropOrb: KronosXpDropOrbLayout | null;
}

export interface KronosFixedClientCssLayout {
  readonly scale: number;
  readonly surfaceRect: KronosRect;
  readonly viewportRect: KronosRect;
  readonly minimapRect: KronosRect | null;
  readonly compassRect: KronosRect | null;
}

export const KRONOS_FIXED_ROOT_GROUP_ID = 548;
export const KRONOS_FIXED_VIEWPORT_INTERFACE_CONTAINER_CHILD_ID = 65;
export const KRONOS_GAME_VIEWPORT_CONTENT_TYPE = 1337;
export const KRONOS_MINIMAP_CONTENT_TYPE = 1338;
export const KRONOS_COMPASS_CONTENT_TYPE = 1339;
export const KRONOS_INVENTORY_GROUP_ID = 149;
export const KRONOS_ORB_GROUP_ID = 160;
export const KRONOS_CHATBOX_GROUP_ID = 162;
export const KRONOS_COMBAT_GROUP_ID = 593;
export const KRONOS_SKILLS_GROUP_ID = 320;
export const KRONOS_EQUIPMENT_GROUP_ID = 387;
export const KRONOS_PRAYER_GROUP_ID = 541;
export const KRONOS_SPELLBOOK_GROUP_ID = 218;
export const KRONOS_CLAN_CHAT_GROUP_ID = 7;
export const KRONOS_NOTICEBOARD_GROUP_ID = 720;
export const KRONOS_FRIENDS_GROUP_ID = 429;
export const KRONOS_IGNORES_GROUP_ID = 432;
export const KRONOS_LOGOUT_GROUP_ID = 182;
export const KRONOS_OPTIONS_GROUP_ID = 261;
export const KRONOS_EMOTES_GROUP_ID = 216;
export const KRONOS_MUSIC_GROUP_ID = 239;

const viewportBaseHeight = 334;
const viewportBaseZoom = 512;
const fixedModeSidePanelSpriteId = 1031;
const minimapOrbFrameSpriteId = 1071;
const minimapOrbEmptySpriteId = 1059;
const inventoryClientDrawSlotSize = 32;
const inventorySlotWidth = 36;
const inventorySlotHeight = 32;
const combatWeaponNameChildId = 1;
const combatLevelChildId = 3;
const combatAutocastContainerChildId = 20;
const combatDefensiveAutocastActionChildId = 21;
const combatDefensiveAutocastDisplayChildId = 22;
const combatDefensiveAutocastMagicIconChildId = 23;
const combatDefensiveAutocastShieldIconChildId = 24;
const combatDefensiveAutocastLabelChildId = 25;
const combatStandardAutocastActionChildId = 26;
const combatStandardAutocastDisplayChildId = 27;
const combatStandardAutocastMagicIconChildId = 28;
const combatStandardAutocastLabelChildId = 29;
const combatAutoRetaliateChildId = 30;
const combatSpecialBarContainerChildId = 35;
const combatSpecialBarActionChildId = 36;
const combatSpecialBarBackgroundChildId = 37;
const combatSpecialBarFillChildId = 39;
const combatSpecialBarTextChildId = 40;
const combatSpecialBarBorderChildId = 41;

const viewportZoomFields = {
  minHeightZoom: 256,
  maxHeightZoom: 205,
  minAspect: 1,
  maxAspect: 32767,
  minWidthZoom: 32767,
  maxWidthZoom: 1
} as const;

const fixedSideTabDefaultId: KronosFixedSideTabId = "inventory";
const prayerContainerChildId = 4;
const prayerColumnCount = 5;
const prayerSlotSize = { width: 34, height: 34 } as const;
const prayerSlotStep = { width: 37, height: 37 } as const;
const spellbookDefaultId: KronosSpellbookId = "ancient";
const spellbookParentChildId = 1;
const spellbookBoundsChildId = 3;
const spellbookSlotSize = { width: 24, height: 24 } as const;
const spellbookSourceParentWidth = 190 - 6;
const magicBookVarbitId = 4070;
const disableSpellFilteringVarbitId = 6718;
const disabledSpellFilteringValue = 1;
const spellTargetFlagShift = 11;
const spellTargetFlagMask = 63;
const selectedSpellNameColorTag = "<col=00ff00>";
const selectedSpellNameSuffix = "<col=ffffff>";
const spellbookVarbitValueById: Readonly<Record<KronosSpellbookId, number>> = {
  standard: 0,
  ancient: 1,
  lunar: 2,
  arceuus: 3
};
const disabledFilteringSpellbookLayoutSpecs: Readonly<
  Record<
    KronosSpellbookId,
    {
      readonly columns: number;
      readonly rows: number;
      readonly gap: KronosSize;
      readonly position: { readonly x: number; readonly y: number; readonly xMode: number; readonly yMode: number };
    }
  >
> = {
  standard: {
    columns: 7,
    rows: 10,
    gap: { width: 0, height: 0 },
    position: { x: 1, y: 15, xMode: 1, yMode: 0 }
  },
  ancient: {
    columns: 4,
    rows: 7,
    gap: { width: 20, height: 4 },
    position: { x: 2, y: 8, xMode: 1, yMode: 0 }
  },
  lunar: {
    columns: 6,
    rows: 8,
    gap: { width: 6, height: 5 },
    position: { x: 0, y: 8, xMode: 1, yMode: 0 }
  },
  arceuus: {
    columns: 4,
    rows: 9,
    gap: { width: 21, height: 5 },
    position: { x: 0, y: 3, xMode: 1, yMode: 0 }
  }
};
const fixedEquipmentSlotSpecs: readonly {
  readonly id: KronosEquipmentSlotId;
  readonly serverSlot: number;
  readonly childId: number;
}[] = [
  { id: "head", serverSlot: 0, childId: 6 },
  { id: "cape", serverSlot: 1, childId: 7 },
  { id: "amulet", serverSlot: 2, childId: 8 },
  { id: "weapon", serverSlot: 3, childId: 9 },
  { id: "body", serverSlot: 4, childId: 10 },
  { id: "shield", serverSlot: 5, childId: 11 },
  { id: "legs", serverSlot: 7, childId: 12 },
  { id: "hands", serverSlot: 9, childId: 13 },
  { id: "feet", serverSlot: 10, childId: 14 },
  { id: "ring", serverSlot: 12, childId: 15 },
  { id: "ammo", serverSlot: 13, childId: 16 }
];
const fixedEquipmentUtilityButtonSpecs: readonly {
  readonly id: KronosEquipmentUtilityButtonId;
  readonly label: string;
  readonly childId: number;
  readonly spriteChildId: number;
}[] = [
  { id: "stats", label: "View equipment stats", childId: 17, spriteChildId: 18 },
  { id: "prices", label: "View guide prices", childId: 19, spriteChildId: 20 },
  { id: "items-kept-on-death", label: "View items kept on death", childId: 21, spriteChildId: 22 },
  { id: "call-follower", label: "Call follower", childId: 23, spriteChildId: 24 }
];
const fixedCombatStyleSlotSpecs: readonly {
  readonly index: number;
  readonly actionChildId: number;
  readonly iconChildId: number;
  readonly textChildId: number;
}[] = [
  { index: 0, actionChildId: 4, iconChildId: 6, textChildId: 7 },
  { index: 1, actionChildId: 8, iconChildId: 10, textChildId: 11 },
  { index: 2, actionChildId: 12, iconChildId: 14, textChildId: 15 },
  { index: 3, actionChildId: 16, iconChildId: 18, textChildId: 19 }
];
const fixedStatsSlotSpecs: readonly {
  readonly id: KronosStatsSkillId;
  readonly label: string;
  readonly clientId: number;
  readonly childId: number;
  readonly spriteId: number;
}[] = [
  { id: "attack", label: "Attack", clientId: 1, childId: 1, spriteId: 197 },
  { id: "strength", label: "Strength", clientId: 2, childId: 2, spriteId: 198 },
  { id: "defence", label: "Defence", clientId: 5, childId: 3, spriteId: 199 },
  { id: "ranged", label: "Ranged", clientId: 3, childId: 4, spriteId: 200 },
  { id: "prayer", label: "Prayer", clientId: 7, childId: 5, spriteId: 201 },
  { id: "magic", label: "Magic", clientId: 4, childId: 6, spriteId: 202 },
  { id: "runecrafting", label: "Runecrafting", clientId: 12, childId: 7, spriteId: 215 },
  { id: "construction", label: "Construction", clientId: 22, childId: 8, spriteId: 221 },
  { id: "hitpoints", label: "Hitpoints", clientId: 6, childId: 9, spriteId: 203 },
  { id: "agility", label: "Agility", clientId: 8, childId: 10, spriteId: 204 },
  { id: "herblore", label: "Herblore", clientId: 9, childId: 11, spriteId: 205 },
  { id: "thieving", label: "Thieving", clientId: 10, childId: 12, spriteId: 206 },
  { id: "crafting", label: "Crafting", clientId: 11, childId: 13, spriteId: 207 },
  { id: "fletching", label: "Fletching", clientId: 19, childId: 14, spriteId: 208 },
  { id: "slayer", label: "Slayer", clientId: 20, childId: 15, spriteId: 216 },
  { id: "hunter", label: "Hunter", clientId: 23, childId: 16, spriteId: 220 },
  { id: "mining", label: "Mining", clientId: 13, childId: 17, spriteId: 209 },
  { id: "smithing", label: "Smithing", clientId: 14, childId: 18, spriteId: 210 },
  { id: "fishing", label: "Fishing", clientId: 15, childId: 19, spriteId: 211 },
  { id: "cooking", label: "Cooking", clientId: 16, childId: 20, spriteId: 212 },
  { id: "firemaking", label: "Firemaking", clientId: 17, childId: 21, spriteId: 213 },
  { id: "woodcutting", label: "Woodcutting", clientId: 18, childId: 22, spriteId: 214 },
  { id: "farming", label: "Farming", clientId: 21, childId: 23, spriteId: 217 }
];
const fixedPrayerSlotSpecs: readonly {
  readonly id: KronosPrayerId;
  readonly label: string;
  readonly childId: number;
  readonly spriteId: number;
}[] = [
  { id: "thick-skin", label: "Thick Skin", childId: 5, spriteId: 115 },
  { id: "burst-of-strength", label: "Burst of Strength", childId: 6, spriteId: 116 },
  { id: "clarity-of-thought", label: "Clarity of Thought", childId: 7, spriteId: 117 },
  { id: "sharp-eye", label: "Sharp Eye", childId: 23, spriteId: 133 },
  { id: "mystic-will", label: "Mystic Will", childId: 24, spriteId: 134 },
  { id: "rock-skin", label: "Rock Skin", childId: 8, spriteId: 118 },
  { id: "superhuman-strength", label: "Superhuman Strength", childId: 9, spriteId: 119 },
  { id: "improved-reflexes", label: "Improved Reflexes", childId: 10, spriteId: 120 },
  { id: "rapid-restore", label: "Rapid Restore", childId: 11, spriteId: 121 },
  { id: "rapid-heal", label: "Rapid Heal", childId: 12, spriteId: 122 },
  { id: "protect-item", label: "Protect Item", childId: 13, spriteId: 123 },
  { id: "hawk-eye", label: "Hawk Eye", childId: 25, spriteId: 502 },
  { id: "mystic-lore", label: "Mystic Lore", childId: 26, spriteId: 503 },
  { id: "steel-skin", label: "Steel Skin", childId: 14, spriteId: 124 },
  { id: "ultimate-strength", label: "Ultimate Strength", childId: 15, spriteId: 125 },
  { id: "incredible-reflexes", label: "Incredible Reflexes", childId: 16, spriteId: 126 },
  { id: "protect-from-magic", label: "Protect from Magic", childId: 17, spriteId: 127 },
  { id: "protect-from-missiles", label: "Protect from Missiles", childId: 18, spriteId: 128 },
  { id: "protect-from-melee", label: "Protect from Melee", childId: 19, spriteId: 129 },
  { id: "eagle-eye", label: "Eagle Eye", childId: 27, spriteId: 504 },
  { id: "mystic-might", label: "Mystic Might", childId: 28, spriteId: 505 },
  { id: "retribution", label: "Retribution", childId: 20, spriteId: 131 },
  { id: "redemption", label: "Redemption", childId: 21, spriteId: 130 },
  { id: "smite", label: "Smite", childId: 22, spriteId: 132 },
  { id: "preserve", label: "Preserve", childId: 33, spriteId: 947 },
  { id: "chivalry", label: "Chivalry", childId: 29, spriteId: 945 },
  { id: "piety", label: "Piety", childId: 30, spriteId: 946 },
  { id: "rigour", label: "Rigour", childId: 31, spriteId: 1420 },
  { id: "augury", label: "Augury", childId: 32, spriteId: 1421 }
];
const fixedSideTabSpecs: readonly {
  readonly id: KronosFixedSideTabId;
  readonly childId: number;
  readonly iconChildId: number;
  readonly containerChildId: number;
  readonly row: "top" | "bottom";
  readonly slotIndex: number;
}[] = [
  { id: "combat", childId: 48, iconChildId: 55, containerChildId: 66, row: "top", slotIndex: 0 },
  { id: "stats", childId: 49, iconChildId: 56, containerChildId: 67, row: "top", slotIndex: 1 },
  { id: "quests", childId: 50, iconChildId: 57, containerChildId: 68, row: "top", slotIndex: 2 },
  { id: "inventory", childId: 51, iconChildId: 58, containerChildId: 69, row: "top", slotIndex: 3 },
  { id: "equipment", childId: 52, iconChildId: 59, containerChildId: 70, row: "top", slotIndex: 4 },
  { id: "prayer", childId: 53, iconChildId: 60, containerChildId: 71, row: "top", slotIndex: 5 },
  { id: "magic", childId: 54, iconChildId: 61, containerChildId: 72, row: "top", slotIndex: 6 },
  { id: "clan-chat", childId: 31, iconChildId: 38, containerChildId: 73, row: "bottom", slotIndex: 0 },
  { id: "ignores", childId: 32, iconChildId: 39, containerChildId: 74, row: "bottom", slotIndex: 2 },
  { id: "friends", childId: 33, iconChildId: 40, containerChildId: 75, row: "bottom", slotIndex: 1 },
  { id: "logout", childId: 34, iconChildId: 41, containerChildId: 76, row: "bottom", slotIndex: 3 },
  { id: "options", childId: 35, iconChildId: 42, containerChildId: 77, row: "bottom", slotIndex: 4 },
  { id: "emotes", childId: 36, iconChildId: 43, containerChildId: 78, row: "bottom", slotIndex: 5 },
  { id: "music", childId: 37, iconChildId: 44, containerChildId: 79, row: "bottom", slotIndex: 6 }
];

export function resolveKronosFixedClientLayout(
  definitions: KronosClientWidgetDefinitions,
  spellbooks: KronosSpellbookDefinitions | null = null
): KronosFixedClientLayout {
  const rootGroup = definitions.groups.find((group) => group.groupId === KRONOS_FIXED_ROOT_GROUP_ID);
  if (!rootGroup) {
    throw new Error(`missing Kronos fixed root interface group ${KRONOS_FIXED_ROOT_GROUP_ID}`);
  }

  const resolvedWidgets = resolveInterfaceGroupWidgets(rootGroup, {
    x: 0,
    y: 0,
    width: definitions.fixedCanvas.width,
    height: definitions.fixedCanvas.height
  });

  const viewportWidget = findWidgetByContentType(resolvedWidgets, KRONOS_GAME_VIEWPORT_CONTENT_TYPE);
  if (!viewportWidget) {
    throw new Error(`missing Kronos game viewport widget content type ${KRONOS_GAME_VIEWPORT_CONTENT_TYPE}`);
  }

  const sidePanel = resolveKronosFixedSidePanel(resolvedWidgets);
  const sidePanelInterfaces = resolveKronosSidePanelInterfaces(definitions, sidePanel);
  const spellbookPanels = resolveKronosSpellbookPanels(sidePanelInterfaces.magic ?? null, spellbooks);

  return {
    fixedCanvas: definitions.fixedCanvas,
    widgets: resolvedWidgets,
    viewportWidget,
    fixedViewportInterfaceContainer:
      findFixedWidgetByChildId(resolvedWidgets, KRONOS_FIXED_VIEWPORT_INTERFACE_CONTAINER_CHILD_ID) ?? null,
    viewport: resolveKronosViewport(viewportWidget.rect),
    minimapWidget: findWidgetByContentType(resolvedWidgets, KRONOS_MINIMAP_CONTENT_TYPE),
    compassWidget: findWidgetByContentType(resolvedWidgets, KRONOS_COMPASS_CONTENT_TYPE),
    chatbox: resolveKronosChatbox(definitions, resolvedWidgets),
    sidePanel,
    sidePanelInterfaces,
    combatPanel: resolveKronosCombatPanel(sidePanelInterfaces.combat ?? null),
    equipmentPanel: resolveKronosEquipmentPanel(sidePanelInterfaces.equipment ?? null),
    prayerPanel: resolveKronosPrayerPanel(sidePanelInterfaces.prayer ?? null),
    spellbookPanel: spellbookPanels[spellbookDefaultId] ?? null,
    spellbookPanels,
    statsPanel: resolveKronosStatsPanel(sidePanelInterfaces.stats ?? null),
    inventoryGrid: resolveKronosInventoryGrid(definitions, sidePanel),
    orbs: resolveKronosFixedOrbs(definitions, resolvedWidgets),
    xpDropOrb: resolveKronosXpDropOrb(definitions, resolvedWidgets)
  };
}

export function scaleKronosFixedClientLayout(
  layout: KronosFixedClientLayout,
  container: KronosSize
): KronosFixedClientCssLayout {
  const scale = Math.max(
    0.01,
    Math.min(1, container.width / layout.fixedCanvas.width, container.height / layout.fixedCanvas.height)
  );
  const surfaceRect = {
    x: 0,
    y: 0,
    width: Math.round(layout.fixedCanvas.width * scale),
    height: Math.round(layout.fixedCanvas.height * scale)
  };

  return {
    scale,
    surfaceRect,
    viewportRect: scaleRect(layout.viewport.rect, surfaceRect, scale),
    minimapRect: layout.minimapWidget ? scaleRect(layout.minimapWidget.rect, surfaceRect, scale) : null,
    compassRect: layout.compassWidget ? scaleRect(layout.compassWidget.rect, surfaceRect, scale) : null
  };
}

export function pointInKronosRect(rect: KronosRect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

export function kronosSpellTargetFlagsFromClickMask(clickMask: number): number {
  return (Math.trunc(clickMask) >> spellTargetFlagShift) & spellTargetFlagMask;
}

export function kronosSelectedSpellName(spell: Pick<KronosSpellbookSpellLayout, "dataText" | "isIf3" | "label" | "spellName">): string {
  if (spell.isIf3 && spell.dataText.length > 0) {
    return `${spell.dataText}${selectedSpellNameSuffix}`;
  }
  const sourceName = spell.spellName.length > 0 ? spell.spellName : spell.label;
  return `${selectedSpellNameColorTag}${sourceName}${selectedSpellNameSuffix}`;
}

function resolveKronosViewport(rawRect: KronosRect): KronosViewport {
  let x = Math.round(rawRect.x);
  let y = Math.round(rawRect.y);
  let width = Math.max(1, Math.round(rawRect.width));
  let height = Math.max(1, Math.round(rawRect.height));

  const heightDelta = height - viewportBaseHeight;
  let zoomScale: number;
  if (heightDelta < 0) {
    zoomScale = viewportZoomFields.minHeightZoom;
  } else if (heightDelta >= 100) {
    zoomScale = viewportZoomFields.maxHeightZoom;
  } else {
    zoomScale = Math.trunc(
      ((viewportZoomFields.maxHeightZoom - viewportZoomFields.minHeightZoom) * heightDelta) / 100 +
        viewportZoomFields.minHeightZoom
    );
  }

  const aspect = Math.trunc((height * zoomScale * viewportBaseZoom) / (width * viewportBaseHeight));
  if (aspect < viewportZoomFields.minAspect) {
    zoomScale = Math.trunc((viewportZoomFields.minAspect * width * viewportBaseHeight) / (height * viewportBaseZoom));
    if (zoomScale > viewportZoomFields.minWidthZoom) {
      zoomScale = viewportZoomFields.minWidthZoom;
      const adjustedWidth = Math.trunc((height * zoomScale * viewportBaseZoom) / (viewportZoomFields.minAspect * viewportBaseHeight));
      const margin = Math.trunc((width - adjustedWidth) / 2);
      x += margin;
      width -= margin * 2;
    }
  } else if (aspect > viewportZoomFields.maxAspect) {
    zoomScale = Math.trunc((viewportZoomFields.maxAspect * width * viewportBaseHeight) / (height * viewportBaseZoom));
    if (zoomScale < viewportZoomFields.maxWidthZoom) {
      zoomScale = viewportZoomFields.maxWidthZoom;
      const adjustedHeight = Math.trunc((viewportZoomFields.maxAspect * width * viewportBaseHeight) / (zoomScale * viewportBaseZoom));
      const margin = Math.trunc((height - adjustedHeight) / 2);
      y += margin;
      height -= margin * 2;
    }
  }

  return {
    rect: { x, y, width, height },
    zoom: Math.trunc((height * zoomScale) / viewportBaseHeight)
  };
}

function resolveWidgetSize(widget: KronosInterfaceWidget, parentRect: KronosRect): KronosSize {
  return {
    width: resolveWidgetExtent(widget.width, parentRect.width, widget.widthMode),
    height: resolveWidgetExtent(widget.height, parentRect.height, widget.heightMode)
  };
}

function resolveWidgetExtent(rawExtent: number, parentExtent: number, mode: number): number {
  if (mode === 0) {
    return rawExtent;
  }

  if (mode === 1) {
    return parentExtent - rawExtent;
  }

  if (mode === 2) {
    return (rawExtent * parentExtent) >> 14;
  }

  return rawExtent;
}

function resolveWidgetPosition(widget: KronosInterfaceWidget, parentRect: KronosRect, size: KronosSize): { x: number; y: number } {
  return {
    x: resolveWidgetAxisPosition(widget.x, parentRect.width, size.width, widget.xPositionMode),
    y: resolveWidgetAxisPosition(widget.y, parentRect.height, size.height, widget.yPositionMode)
  };
}

function resolveWidgetAxisPosition(rawPosition: number, parentExtent: number, extent: number, mode: number): number {
  if (mode === 0) {
    return rawPosition;
  }

  if (mode === 1) {
    return rawPosition + Math.trunc((parentExtent - extent) / 2);
  }

  if (mode === 2) {
    return parentExtent - extent - rawPosition;
  }

  if (mode === 3) {
    return (rawPosition * parentExtent) >> 14;
  }

  if (mode === 4) {
    return Math.trunc((parentExtent - extent) / 2) + ((rawPosition * parentExtent) >> 14);
  }

  return parentExtent - extent - ((rawPosition * parentExtent) >> 14);
}

function resolveInterfaceGroupWidgets(group: KronosInterfaceGroup, rootRect: KronosRect): readonly KronosResolvedWidget[] {
  const widgetsByParent = new Map<number, KronosInterfaceWidget[]>();
  for (const widget of group.widgets) {
    const children = widgetsByParent.get(widget.parentId) ?? [];
    children.push(widget);
    widgetsByParent.set(widget.parentId, children);
  }

  const resolvedWidgets: KronosResolvedWidget[] = [];
  const resolveChildren = (parentId: number, parentRect: KronosRect, parentHidden = false): void => {
    for (const widget of widgetsByParent.get(parentId) ?? []) {
      const hidden = parentHidden || widget.hidden;
      const resolvedWidget = hidden === widget.hidden ? widget : { ...widget, hidden };
      const size = resolveWidgetSize(widget, parentRect);
      const position = resolveWidgetPosition(widget, parentRect, size);
      const rect = {
        x: parentRect.x + position.x,
        y: parentRect.y + position.y,
        width: size.width,
        height: size.height
      };

      resolvedWidgets.push({ widget: resolvedWidget, rect });
      resolveChildren(widget.id, rect, hidden);
    }
  };

  resolveChildren(-1, rootRect);
  return resolvedWidgets;
}

function findWidgetByContentType(
  widgets: readonly KronosResolvedWidget[],
  contentType: number
): KronosResolvedWidget | null {
  return widgets.find((entry) => entry.widget.contentType === contentType) ?? null;
}

function resolveKronosChatbox(
  definitions: KronosClientWidgetDefinitions,
  fixedWidgets: readonly KronosResolvedWidget[]
): KronosMountedInterfaceLayout | null {
  const chatboxGroup = definitions.groups.find((group) => group.groupId === KRONOS_CHATBOX_GROUP_ID);
  const chatboxMount = fixedWidgets.find(
    (entry) =>
      entry.widget.parentId === -1 &&
      entry.widget.type === 0 &&
      entry.rect.x === 0 &&
      entry.rect.y === 338 &&
      entry.rect.width === 519 &&
      entry.rect.height === 165
  );
  if (!chatboxGroup || !chatboxMount) {
    return null;
  }

  return {
    groupId: KRONOS_CHATBOX_GROUP_ID,
    rect: chatboxMount.rect,
    widgets: resolveInterfaceGroupWidgets(chatboxGroup, chatboxMount.rect)
  };
}

function resolveKronosInventoryGrid(
  definitions: KronosClientWidgetDefinitions,
  sidePanel: KronosFixedSidePanelLayout | null
): KronosInventoryGridLayout | null {
  const inventoryGroup = definitions.groups.find((group) => group.groupId === KRONOS_INVENTORY_GROUP_ID);
  const inventoryRoot = inventoryGroup?.widgets.find((widget) => widget.parentId === -1 && widget.type === 2);
  const inventoryContainer = sidePanel?.tabs.find((tab) => tab.id === "inventory")?.container;
  if (!inventoryRoot || !inventoryContainer) {
    return null;
  }

  const columns = Math.max(1, inventoryRoot.width);
  const rows = Math.max(1, inventoryRoot.height);
  const padding = {
    width: Math.max(0, Math.trunc(inventoryRoot.xPitch)),
    height: Math.max(0, Math.trunc(inventoryRoot.yPitch))
  };
  const step = {
    width: inventoryClientDrawSlotSize + padding.width,
    height: inventoryClientDrawSlotSize + padding.height
  };
  return {
    groupId: KRONOS_INVENTORY_GROUP_ID,
    widgetId: inventoryRoot.id,
    containerGroupId: inventoryContainer.groupId,
    containerWidgetId: inventoryContainer.widgetId,
    containerChildId: inventoryContainer.childId,
    containerRect: inventoryContainer.rect,
    rect: {
      x: inventoryContainer.rect.x + inventoryRoot.x,
      y: inventoryContainer.rect.y + inventoryRoot.y,
      width: (columns - 1) * step.width + inventorySlotWidth,
      height: (rows - 1) * step.height + inventorySlotHeight
    },
    columns,
    rows,
    slot: { width: inventorySlotWidth, height: inventorySlotHeight },
    step,
    padding
  };
}

function resolveKronosSidePanelInterfaces(
  definitions: KronosClientWidgetDefinitions,
  sidePanel: KronosFixedSidePanelLayout | null
): Partial<Record<KronosFixedSideTabId, KronosMountedInterfaceLayout>> {
  if (!sidePanel) {
    return {};
  }

  const mountedGroups: Partial<Record<KronosFixedSideTabId, number>> = {
    combat: KRONOS_COMBAT_GROUP_ID,
    stats: KRONOS_SKILLS_GROUP_ID,
    quests: KRONOS_NOTICEBOARD_GROUP_ID,
    equipment: KRONOS_EQUIPMENT_GROUP_ID,
    prayer: KRONOS_PRAYER_GROUP_ID,
    magic: KRONOS_SPELLBOOK_GROUP_ID,
    "clan-chat": KRONOS_CLAN_CHAT_GROUP_ID,
    ignores: KRONOS_IGNORES_GROUP_ID,
    friends: KRONOS_FRIENDS_GROUP_ID,
    logout: KRONOS_LOGOUT_GROUP_ID,
    options: KRONOS_OPTIONS_GROUP_ID,
    emotes: KRONOS_EMOTES_GROUP_ID,
    music: KRONOS_MUSIC_GROUP_ID
  };
  const layouts: Partial<Record<KronosFixedSideTabId, KronosMountedInterfaceLayout>> = {};

  for (const tab of sidePanel.tabs) {
    const groupId = mountedGroups[tab.id];
    if (groupId === undefined) {
      continue;
    }
    const group = definitions.groups.find((candidate) => candidate.groupId === groupId);
    if (!group) {
      continue;
    }

    layouts[tab.id] = {
      groupId,
      rect: tab.container.rect,
      widgets: resolveInterfaceGroupWidgets(group, tab.container.rect)
    };
  }

  return layouts;
}

function resolveKronosCombatPanel(combatLayout: KronosMountedInterfaceLayout | null): KronosCombatPanelLayout | null {
  if (!combatLayout) {
    return null;
  }

  const findCombatWidget = (childId: number): KronosResolvedWidget | undefined =>
    combatLayout.widgets.find((entry) => entry.widget.groupId === KRONOS_COMBAT_GROUP_ID && entry.widget.childId === childId);
  const weaponName = combatTextLayout(findCombatWidget(combatWeaponNameChildId));
  const combatLevel = combatTextLayout(findCombatWidget(combatLevelChildId));
  const styleSlots = fixedCombatStyleSlotSpecs.flatMap((spec) => {
    const action = findCombatWidget(spec.actionChildId);
    const text = combatTextLayout(findCombatWidget(spec.textChildId));
    if (!action || !text) {
      return [];
    }
    const icon = findCombatWidget(spec.iconChildId);
    return [
      {
        index: spec.index,
        actionWidgetId: action.widget.id,
        actionChildId: action.widget.childId,
        actionRect: action.rect,
        sourceHidden: action.widget.hidden,
        iconWidgetId: icon?.widget.id ?? null,
        iconChildId: icon?.widget.childId ?? null,
        iconSpriteId: positiveSpriteId(icon),
        iconRect: icon?.rect ?? null,
        text,
        actions: action.widget.actions ?? []
      }
    ];
  });

  const autocastContainer = findCombatWidget(combatAutocastContainerChildId);
  const defensiveAutocastAction = findCombatWidget(combatDefensiveAutocastActionChildId);
  const defensiveAutocastDisplay = findCombatWidget(combatDefensiveAutocastDisplayChildId);
  const defensiveAutocastMagicIcon = findCombatWidget(combatDefensiveAutocastMagicIconChildId);
  const defensiveAutocastShieldIcon = findCombatWidget(combatDefensiveAutocastShieldIconChildId);
  const defensiveAutocastLabel = combatTextLayout(findCombatWidget(combatDefensiveAutocastLabelChildId));
  const standardAutocastAction = findCombatWidget(combatStandardAutocastActionChildId);
  const standardAutocastDisplay = findCombatWidget(combatStandardAutocastDisplayChildId);
  const standardAutocastMagicIcon = findCombatWidget(combatStandardAutocastMagicIconChildId);
  const standardAutocastLabel = combatTextLayout(findCombatWidget(combatStandardAutocastLabelChildId));
  const autoRetaliate = findCombatWidget(combatAutoRetaliateChildId);
  const specialContainer = findCombatWidget(combatSpecialBarContainerChildId);
  const specialAction = findCombatWidget(combatSpecialBarActionChildId);
  const specialBackground = findCombatWidget(combatSpecialBarBackgroundChildId);
  const specialFill = findCombatWidget(combatSpecialBarFillChildId);
  const specialBorder = findCombatWidget(combatSpecialBarBorderChildId);
  const specialText = combatTextLayout(findCombatWidget(combatSpecialBarTextChildId));
  const autocastControls: readonly (KronosCombatAutocastControlLayout | null)[] = [
    defensiveAutocastAction
      ? {
          id: "defensive",
          widgetId: defensiveAutocastAction.widget.id,
          childId: defensiveAutocastAction.widget.childId,
          rect: combatAutocastActionRect(defensiveAutocastAction.rect, autocastContainer?.rect ?? defensiveAutocastAction.rect),
          actionText: defensiveAutocastAction.widget.actions?.[0] ?? "",
          actions: defensiveAutocastAction.widget.actions ?? [],
          defensive: true,
          displayWidgetId: defensiveAutocastDisplay?.widget.id ?? null,
          displayChildId: defensiveAutocastDisplay?.widget.childId ?? null,
          displayRect: defensiveAutocastDisplay?.rect ?? null,
          magicIconWidgetId: defensiveAutocastMagicIcon?.widget.id ?? null,
          magicIconChildId: defensiveAutocastMagicIcon?.widget.childId ?? null,
          magicIconSpriteId: positiveSpriteId(defensiveAutocastMagicIcon),
          magicIconRect: defensiveAutocastMagicIcon?.rect ?? null,
          defensiveIconWidgetId: defensiveAutocastShieldIcon?.widget.id ?? null,
          defensiveIconChildId: defensiveAutocastShieldIcon?.widget.childId ?? null,
          defensiveIconSpriteId: positiveSpriteId(defensiveAutocastShieldIcon),
          defensiveIconRect: defensiveAutocastShieldIcon?.rect ?? null,
          label: defensiveAutocastLabel
        }
      : null,
    standardAutocastAction
      ? {
          id: "standard",
          widgetId: standardAutocastAction.widget.id,
          childId: standardAutocastAction.widget.childId,
          rect: combatAutocastActionRect(standardAutocastAction.rect, autocastContainer?.rect ?? standardAutocastAction.rect),
          actionText: standardAutocastAction.widget.actions?.[0] ?? "",
          actions: standardAutocastAction.widget.actions ?? [],
          defensive: false,
          displayWidgetId: standardAutocastDisplay?.widget.id ?? null,
          displayChildId: standardAutocastDisplay?.widget.childId ?? null,
          displayRect: standardAutocastDisplay?.rect ?? null,
          magicIconWidgetId: standardAutocastMagicIcon?.widget.id ?? null,
          magicIconChildId: standardAutocastMagicIcon?.widget.childId ?? null,
          magicIconSpriteId: positiveSpriteId(standardAutocastMagicIcon),
          magicIconRect: standardAutocastMagicIcon?.rect ?? null,
          defensiveIconWidgetId: null,
          defensiveIconChildId: null,
          defensiveIconSpriteId: null,
          defensiveIconRect: null,
          label: standardAutocastLabel
        }
      : null
  ];

  return {
    groupId: combatLayout.groupId,
    rect: combatLayout.rect,
    weaponName,
    combatLevel,
    styleSlots,
    autocastControls: autocastControls.filter((control): control is KronosCombatAutocastControlLayout => control !== null),
    autoRetaliate: autoRetaliate
      ? {
          widgetId: autoRetaliate.widget.id,
          childId: autoRetaliate.widget.childId,
          rect: autoRetaliate.rect,
          actionText: autoRetaliate.widget.actions?.[0] ?? "",
          actions: autoRetaliate.widget.actions ?? []
        }
      : null,
    specialBar:
      specialContainer && specialAction
        ? {
            containerWidgetId: specialContainer.widget.id,
            containerChildId: specialContainer.widget.childId,
            containerRect: specialContainer.rect,
            actionWidgetId: specialAction.widget.id,
            actionChildId: specialAction.widget.childId,
            actionText: specialAction.widget.actions?.[0] ?? "",
            backgroundWidgetId: specialBackground?.widget.id ?? null,
            backgroundChildId: specialBackground?.widget.childId ?? null,
            backgroundColor: specialBackground?.widget.textColor ?? null,
            fillWidgetId: specialFill?.widget.id ?? null,
            fillChildId: specialFill?.widget.childId ?? null,
            fillColor: specialFill?.widget.textColor ?? null,
            borderWidgetId: specialBorder?.widget.id ?? null,
            borderChildId: specialBorder?.widget.childId ?? null,
            borderColor: specialBorder?.widget.textColor ?? null,
            text: specialText,
            actions: specialAction.widget.actions ?? []
          }
        : null
  };
}

function combatAutocastActionRect(actionRect: KronosRect, fallbackRect: KronosRect): KronosRect {
  if (actionRect.width > 0 && actionRect.height > 0) {
    return actionRect;
  }
  return fallbackRect;
}

function positiveSpriteId(widget: KronosResolvedWidget | undefined): number | null {
  if (!widget || widget.widget.spriteId <= 0) {
    return null;
  }
  return widget.widget.spriteId;
}

function combatTextLayout(widget: KronosResolvedWidget | undefined): KronosCombatTextLayout | null {
  if (!widget || widget.widget.type !== 4) {
    return null;
  }

  return {
    widgetId: widget.widget.id,
    childId: widget.widget.childId,
    rect: widget.rect,
    fontId: widget.widget.fontId,
    lineHeight: widget.widget.lineHeight,
    xTextAlignment: widget.widget.xTextAlignment,
    yTextAlignment: widget.widget.yTextAlignment,
    textShadowed: widget.widget.textShadowed,
    textColor: widget.widget.textColor
  };
}

function resolveKronosEquipmentPanel(
  equipmentLayout: KronosMountedInterfaceLayout | null
): KronosEquipmentPanelLayout | null {
  if (!equipmentLayout) {
    return null;
  }

  const slots = fixedEquipmentSlotSpecs.flatMap((spec) => {
    const widget = equipmentLayout.widgets.find(
      (entry) => entry.widget.groupId === KRONOS_EQUIPMENT_GROUP_ID && entry.widget.childId === spec.childId
    );
    if (!widget) {
      return [];
    }

    return [
      {
        id: spec.id,
        serverSlot: spec.serverSlot,
        groupId: KRONOS_EQUIPMENT_GROUP_ID,
        widgetId: widget.widget.id,
        childId: widget.widget.childId,
        rect: widget.rect,
        actions: widget.widget.actions ?? []
      }
    ];
  });
  const utilityButtons = fixedEquipmentUtilityButtonSpecs.flatMap((spec) => {
    const widget = equipmentLayout.widgets.find(
      (entry) => entry.widget.groupId === KRONOS_EQUIPMENT_GROUP_ID && entry.widget.childId === spec.childId
    );
    if (!widget) {
      return [];
    }
    const sprite = equipmentLayout.widgets.find(
      (entry) => entry.widget.groupId === KRONOS_EQUIPMENT_GROUP_ID && entry.widget.childId === spec.spriteChildId
    );

    return [
      {
        id: spec.id,
        label: spec.label,
        groupId: KRONOS_EQUIPMENT_GROUP_ID,
        widgetId: widget.widget.id,
        childId: widget.widget.childId,
        rect: widget.rect,
        clickMask: widget.widget.clickMask ?? 0,
        actions: widget.widget.actions ?? [],
        spriteWidgetId: sprite?.widget.id ?? null,
        spriteChildId: sprite?.widget.childId ?? null,
        spriteId: sprite && sprite.widget.spriteId > 0 ? sprite.widget.spriteId : null,
        spriteRect: sprite?.rect ?? null
      }
    ];
  });

  return {
    groupId: equipmentLayout.groupId,
    rect: equipmentLayout.rect,
    slots,
    utilityButtons
  };
}

function resolveKronosStatsPanel(statsLayout: KronosMountedInterfaceLayout | null): KronosStatsPanelLayout | null {
  if (!statsLayout) {
    return null;
  }

  const slots = fixedStatsSlotSpecs.flatMap((spec, sourceOrder) => {
    const widget = statsLayout.widgets.find(
      (entry) => entry.widget.groupId === KRONOS_SKILLS_GROUP_ID && entry.widget.childId === spec.childId
    );
    if (!widget) {
      return [];
    }

    const zeroBasedChild = Math.max(0, spec.childId - 1);
    return [
      {
        id: spec.id,
        label: spec.label,
        clientId: spec.clientId,
        spriteId: spec.spriteId,
        groupId: KRONOS_SKILLS_GROUP_ID,
        widgetId: widget.widget.id,
        childId: widget.widget.childId,
        sourceOrder,
        gridColumn: Math.trunc(zeroBasedChild / 8),
        gridRow: zeroBasedChild % 8,
        rect: widget.rect,
        actions: widget.widget.actions ?? []
      }
    ];
  });

  const totalContainer = statsLayout.widgets.find(
    (entry) => entry.widget.groupId === KRONOS_SKILLS_GROUP_ID && entry.widget.childId === 24
  );
  const leftSprite = statsLayout.widgets.find(
    (entry) => entry.widget.groupId === KRONOS_SKILLS_GROUP_ID && entry.widget.childId === 25
  );
  const rightSprite = statsLayout.widgets.find(
    (entry) => entry.widget.groupId === KRONOS_SKILLS_GROUP_ID && entry.widget.childId === 26
  );
  const textWidget = statsLayout.widgets.find(
    (entry) => entry.widget.groupId === KRONOS_SKILLS_GROUP_ID && entry.widget.childId === 27
  );
  const totalLevel =
    totalContainer && leftSprite && rightSprite && textWidget
      ? {
          containerWidgetId: totalContainer.widget.id,
          containerChildId: totalContainer.widget.childId,
          containerRect: totalContainer.rect,
          leftSpriteWidgetId: leftSprite.widget.id,
          leftSpriteChildId: leftSprite.widget.childId,
          leftSpriteId: leftSprite.widget.spriteId,
          leftSpriteRect: leftSprite.rect,
          rightSpriteWidgetId: rightSprite.widget.id,
          rightSpriteChildId: rightSprite.widget.childId,
          rightSpriteId: rightSprite.widget.spriteId,
          rightSpriteRect: rightSprite.rect,
          textWidgetId: textWidget.widget.id,
          textChildId: textWidget.widget.childId,
          textRect: textWidget.rect,
          fontId: textWidget.widget.fontId,
          lineHeight: textWidget.widget.lineHeight,
          xTextAlignment: textWidget.widget.xTextAlignment,
          yTextAlignment: textWidget.widget.yTextAlignment,
          textShadowed: textWidget.widget.textShadowed,
          textColor: textWidget.widget.textColor,
          actions: textWidget.widget.actions ?? []
        }
      : null;

  return {
    groupId: statsLayout.groupId,
    rect: statsLayout.rect,
    columns: 3,
    slot: slots[0]?.rect ? { width: slots[0].rect.width, height: slots[0].rect.height } : { width: 62, height: 32 },
    slots,
    totalLevel
  };
}

function resolveKronosPrayerPanel(prayerLayout: KronosMountedInterfaceLayout | null): KronosPrayerPanelLayout | null {
  if (!prayerLayout) {
    return null;
  }

  const container = prayerLayout.widgets.find(
    (entry) => entry.widget.groupId === KRONOS_PRAYER_GROUP_ID && entry.widget.childId === prayerContainerChildId
  );
  if (!container) {
    return null;
  }

  const slots = fixedPrayerSlotSpecs.flatMap((spec, sourceOrder) => {
    const widget = prayerLayout.widgets.find(
      (entry) => entry.widget.groupId === KRONOS_PRAYER_GROUP_ID && entry.widget.childId === spec.childId
    );
    if (!widget) {
      return [];
    }

    const gridColumn = sourceOrder % prayerColumnCount;
    const gridRow = Math.trunc(sourceOrder / prayerColumnCount);
    return [
      {
        id: spec.id,
        label: spec.label,
        spriteId: spec.spriteId,
        groupId: KRONOS_PRAYER_GROUP_ID,
        widgetId: widget.widget.id,
        childId: widget.widget.childId,
        sourceOrder,
        gridColumn,
        gridRow,
        rect: {
          x: container.rect.x + gridColumn * prayerSlotStep.width,
          y: container.rect.y + gridRow * prayerSlotStep.height,
          width: prayerSlotSize.width,
          height: prayerSlotSize.height
        },
        actions: widget.widget.actions ?? []
      }
    ];
  });

  return {
    groupId: prayerLayout.groupId,
    rect: prayerLayout.rect,
    containerWidgetId: container.widget.id,
    containerChildId: container.widget.childId,
    containerRect: container.rect,
    columns: prayerColumnCount,
    slot: prayerSlotSize,
    step: prayerSlotStep,
    slots
  };
}

function resolveKronosSpellbookPanels(
  spellbookLayout: KronosMountedInterfaceLayout | null,
  definitions: KronosSpellbookDefinitions | null
): Partial<Record<KronosSpellbookId, KronosSpellbookPanelLayout>> {
  const panels: Partial<Record<KronosSpellbookId, KronosSpellbookPanelLayout>> = {};
  if (!spellbookLayout || !definitions) {
    return panels;
  }

  for (const spellbook of definitions.spellbooks) {
    if (spellbook.groupId !== KRONOS_SPELLBOOK_GROUP_ID) {
      continue;
    }
    const panel = resolveKronosSpellbookPanel(spellbookLayout, spellbook);
    if (panel) {
      panels[spellbook.id] = panel;
    }
  }
  return panels;
}

function resolveKronosSpellbookPanel(
  spellbookLayout: KronosMountedInterfaceLayout,
  spellbook: KronosSpellbookDefinition
): KronosSpellbookPanelLayout | null {
  if (spellbook.spells.length === 0) {
    return null;
  }

  const parent = spellbookLayout.widgets.find(
    (entry) => entry.widget.groupId === KRONOS_SPELLBOOK_GROUP_ID && entry.widget.childId === spellbookParentChildId
  );
  const bounds = spellbookLayout.widgets.find(
    (entry) => entry.widget.groupId === KRONOS_SPELLBOOK_GROUP_ID && entry.widget.childId === spellbookBoundsChildId
  );
  if (!parent || !bounds) {
    return null;
  }

  const sourceLayout = resolveDisabledFilteringSpellbookLayout(spellbook.id, parent.rect);
  const { columns, rows, gap, spellAreaRect, step } = sourceLayout;
  const widgetsById = new Map(spellbookLayout.widgets.map((entry) => [entry.widget.id, entry]));
  const spells = spellbook.spells.flatMap((spell) => {
    const widget = widgetsById.get(spell.widgetId);
    if (!widget) {
      return [];
    }

    const gridColumn = spell.sourceOrder % columns;
    const gridRow = Math.trunc(spell.sourceOrder / columns);
    const clickMask = widget.widget.clickMask ?? 0;
    const dataText = widget.widget.dataText ?? widget.widget.name ?? "";
    const spellName = widget.widget.spellName ?? spell.label;
    const spellLayout = {
      id: spell.id,
      label: spell.label,
      itemId: spell.itemId,
      spriteId: spell.enabledSpriteId,
      enabledSpriteId: spell.enabledSpriteId,
      disabledSpriteId: spell.disabledSpriteId,
      groupId: KRONOS_SPELLBOOK_GROUP_ID,
      widgetId: widget.widget.id,
      childId: widget.widget.childId,
      isIf3: widget.widget.isIf3 ?? false,
      menuType: widget.widget.menuType ?? 0,
      clickMask,
      targetFlags: kronosSpellTargetFlagsFromClickMask(clickMask),
      spellActionName: widget.widget.spellActionName ?? "",
      selectedSpellName: "",
      spellName,
      dataText,
      sourceOrder: spell.sourceOrder,
      gridColumn,
      gridRow,
      rect: {
        x: spellAreaRect.x + gridColumn * step.width,
        y: spellAreaRect.y + gridRow * step.height,
        width: sourceLayout.slot.width,
        height: sourceLayout.slot.height
      },
      actions: widget.widget.actions ?? []
    };
    return [
      {
        ...spellLayout,
        selectedSpellName: kronosSelectedSpellName(spellLayout)
      }
    ];
  });

  return {
    id: spellbook.id,
    enumId: spellbook.enumId,
    spellbookVarbitId: magicBookVarbitId,
    spellbookVarbitValue: spellbookVarbitValueById[spellbook.id],
    disableFilteringVarbitId: disableSpellFilteringVarbitId,
    disableFilteringVarbitValue: disabledSpellFilteringValue,
    layoutMode: sourceLayout.layoutMode,
    groupId: spellbookLayout.groupId,
    rect: spellbookLayout.rect,
    parentWidgetId: parent.widget.id,
    parentChildId: parent.widget.childId,
    parentRect: parent.rect,
    boundsWidgetId: bounds.widget.id,
    boundsChildId: bounds.widget.childId,
    spellAreaRect,
    columns,
    rows,
    slot: sourceLayout.slot,
    gap,
    step,
    spells
  };
}

function resolveDisabledFilteringSpellbookLayout(
  spellbookId: KronosSpellbookId,
  parentRect: KronosRect
): {
  readonly layoutMode: KronosSpellbookLayoutMode;
  readonly columns: number;
  readonly rows: number;
  readonly slot: KronosSize;
  readonly gap: KronosSize;
  readonly step: KronosSize;
  readonly spellAreaRect: KronosRect;
} {
  const spec = disabledFilteringSpellbookLayoutSpecs[spellbookId];
  const width = spec.columns * spellbookSlotSize.width + (spec.columns - 1) * spec.gap.width;
  const height = spec.rows * spellbookSlotSize.height + (spec.rows - 1) * spec.gap.height;
  const resolvedParentRect = {
    ...parentRect,
    width: Math.min(parentRect.width, spellbookSourceParentWidth)
  };
  const offset = {
    x: resolveWidgetAxisPosition(spec.position.x, resolvedParentRect.width, width, spec.position.xMode),
    y: resolveWidgetAxisPosition(spec.position.y, resolvedParentRect.height, height, spec.position.yMode)
  };

  return {
    layoutMode: "disable-filtering-fixed",
    columns: spec.columns,
    rows: spec.rows,
    slot: spellbookSlotSize,
    gap: spec.gap,
    step: {
      width: spellbookSlotSize.width + spec.gap.width,
      height: spellbookSlotSize.height + spec.gap.height
    },
    spellAreaRect: {
      x: resolvedParentRect.x + offset.x,
      y: resolvedParentRect.y + offset.y,
      width,
      height
    }
  };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveKronosFixedSidePanel(
  fixedWidgets: readonly KronosResolvedWidget[]
): KronosFixedSidePanelLayout | null {
  const background = fixedWidgets.find((entry) => entry.widget.spriteId === fixedModeSidePanelSpriteId);
  if (!background) {
    return null;
  }

  const tabs = fixedSideTabSpecs.flatMap((spec) => {
    const tab = findFixedWidgetByChildId(fixedWidgets, spec.childId);
    const icon = findFixedWidgetByChildId(fixedWidgets, spec.iconChildId);
    const container = findFixedWidgetByChildId(fixedWidgets, spec.containerChildId);
    if (
      !tab ||
      !icon ||
      !container ||
      tab.widget.type !== 5 ||
      icon.widget.type !== 5 ||
      container.widget.type !== 0 ||
      tab.widget.spriteId <= 0 ||
      icon.widget.spriteId <= 0
    ) {
      return [];
    }

    return [
      {
        id: spec.id,
        groupId: KRONOS_FIXED_ROOT_GROUP_ID,
        widgetId: tab.widget.id,
        childId: tab.widget.childId,
        rect: tab.rect,
        row: spec.row,
        slotIndex: spec.slotIndex,
        spriteId: tab.widget.spriteId,
        iconWidgetId: icon.widget.id,
        iconChildId: icon.widget.childId,
        iconSpriteId: icon.widget.spriteId,
        iconRect: icon.rect,
        container: {
          groupId: KRONOS_FIXED_ROOT_GROUP_ID,
          widgetId: container.widget.id,
          childId: container.widget.childId,
          rect: container.rect,
          hidden: container.widget.hidden
        },
        actions: tab.widget.actions ?? []
      }
    ];
  });

  return {
    groupId: KRONOS_FIXED_ROOT_GROUP_ID,
    rect: background.rect,
    backgroundSpriteId: background.widget.spriteId,
    defaultTabId: fixedSideTabDefaultId,
    tabs
  };
}

function findFixedWidgetByChildId(
  fixedWidgets: readonly KronosResolvedWidget[],
  childId: number
): KronosResolvedWidget | undefined {
  return fixedWidgets.find((entry) => entry.widget.groupId === KRONOS_FIXED_ROOT_GROUP_ID && entry.widget.childId === childId);
}

function resolveKronosFixedOrbs(
  definitions: KronosClientWidgetDefinitions,
  fixedWidgets: readonly KronosResolvedWidget[]
): readonly KronosFixedOrbLayout[] {
  const orbGroup = definitions.groups.find((group) => group.groupId === KRONOS_ORB_GROUP_ID);
  const minimapWidget = findWidgetByContentType(fixedWidgets, KRONOS_MINIMAP_CONTENT_TYPE);
  const minimapRoot = minimapWidget
    ? fixedWidgets.find((entry) => entry.widget.id === minimapWidget.widget.parentId)
    : null;
  if (!orbGroup || !minimapRoot) {
    return [];
  }

  const orbWidgets = resolveInterfaceGroupWidgets(orbGroup, { x: 0, y: 0, width: 0, height: 0 });
  const rawWidgetsById = new Map(orbGroup.widgets.map((widget) => [widget.id, widget]));
  const origin = { x: minimapRoot.rect.x, y: 0 };
  const specs: readonly {
    readonly id: KronosFixedOrbId;
    readonly fillerSpriteId: number;
    readonly activeFillerSpriteId: number | null;
    readonly iconSpriteId: number;
  }[] = [
    { id: "hp", fillerSpriteId: 1060, activeFillerSpriteId: null, iconSpriteId: 1067 },
    { id: "prayer", fillerSpriteId: 1063, activeFillerSpriteId: 1066, iconSpriteId: 1068 },
    { id: "run", fillerSpriteId: 1064, activeFillerSpriteId: 1065, iconSpriteId: 1069 },
    { id: "spec", fillerSpriteId: 1607, activeFillerSpriteId: 1608, iconSpriteId: 1610 }
  ];

  return specs.flatMap((spec) => {
    const filler = findResolvedDescendantSprite(orbWidgets, rawWidgetsById, spec.fillerSpriteId);
    const container = filler ? orbWidgets.find((entry) => entry.widget.id === filler.widget.parentId) : undefined;
    const frame = container
      ? findResolvedDescendantSprite(orbWidgets, rawWidgetsById, minimapOrbFrameSpriteId, container.widget.id)
      : undefined;
    const empty = container
      ? findResolvedDescendantSprite(orbWidgets, rawWidgetsById, minimapOrbEmptySpriteId, container.widget.id)
      : undefined;
    const icon = container
      ? findResolvedDescendantSprite(orbWidgets, rawWidgetsById, spec.iconSpriteId, container.widget.id)
      : undefined;
    const action = container
      ? findResolvedDescendant(
          orbWidgets,
          rawWidgetsById,
          container.widget.id,
          (widget) => widget.type === 0 && (widget.actions?.length ?? 0) > 0 && widget.width > 0 && widget.height > 0
        )
      : undefined;
    const valueText = container
      ? findResolvedDescendant(orbWidgets, rawWidgetsById, container.widget.id, (widget) => widget.type === 4)
      : undefined;
    if (!container || !frame || !filler || !empty || !icon) {
      return [];
    }

    return [
      {
        id: spec.id,
        groupId: KRONOS_ORB_GROUP_ID,
        rect: {
          x: origin.x + container.rect.x,
          y: origin.y + container.rect.y,
          width: frame.rect.width,
          height: frame.rect.height
        },
        actionWidgetId: action?.widget.id ?? null,
        actionChildId: action?.widget.childId ?? null,
        actionRect: action ? relativeWidgetRect(action, container) : null,
        actions: action?.widget.actions ?? [],
        frameSpriteId: minimapOrbFrameSpriteId,
        frameRect: relativeWidgetRect(frame, container),
        fillerSpriteId: spec.fillerSpriteId,
        activeFillerSpriteId: spec.activeFillerSpriteId,
        fillRect: relativeWidgetRect(filler, container),
        emptySpriteId: minimapOrbEmptySpriteId,
        emptyRect: relativeWidgetRect(empty, container),
        iconSpriteId: spec.iconSpriteId,
        iconRect: relativeWidgetRect(icon, container),
        valueTextRect: valueText ? relativeWidgetRect(valueText, container) : null,
        valueText: valueText
          ? {
              rect: relativeWidgetRect(valueText, container),
              fontId: valueText.widget.fontId,
              lineHeight: valueText.widget.lineHeight,
              xTextAlignment: valueText.widget.xTextAlignment,
              yTextAlignment: valueText.widget.yTextAlignment,
              textShadowed: valueText.widget.textShadowed,
              textColor: valueText.widget.textColor
            }
          : null
      }
    ];
  });
}

function resolveKronosXpDropOrb(
  definitions: KronosClientWidgetDefinitions,
  fixedWidgets: readonly KronosResolvedWidget[]
): KronosXpDropOrbLayout | null {
  const orbGroup = definitions.groups.find((group) => group.groupId === KRONOS_ORB_GROUP_ID);
  const minimapWidget = findWidgetByContentType(fixedWidgets, KRONOS_MINIMAP_CONTENT_TYPE);
  const minimapRoot = minimapWidget
    ? fixedWidgets.find((entry) => entry.widget.id === minimapWidget.widget.parentId)
    : null;
  if (!orbGroup || !minimapRoot) {
    return null;
  }

  const orbWidgets = resolveInterfaceGroupWidgets(orbGroup, { x: 0, y: 0, width: 0, height: 0 });
  const widget = orbWidgets.find(
    (entry) => entry.widget.groupId === KRONOS_ORB_GROUP_ID && entry.widget.childId === 1 && entry.widget.spriteId === 1196
  );
  if (!widget) {
    return null;
  }

  return {
    groupId: KRONOS_ORB_GROUP_ID,
    widgetId: widget.widget.id,
    childId: widget.widget.childId,
    rect: {
      x: minimapRoot.rect.x + widget.rect.x,
      y: widget.rect.y,
      width: widget.rect.width,
      height: widget.rect.height
    },
    clickMask: widget.widget.clickMask ?? 0,
    actions: widget.widget.actions ?? [],
    spriteId: 1196,
    activeSpriteId: 1197,
    hoverSpriteId: 1198,
    activeHoverSpriteId: 1199
  };
}

function findResolvedDescendantSprite(
  widgets: readonly KronosResolvedWidget[],
  widgetsById: ReadonlyMap<number, KronosInterfaceWidget>,
  spriteId: number,
  ancestorId = widgets.find((entry) => entry.widget.parentId === -1)?.widget.id ?? -1
): KronosResolvedWidget | undefined {
  return findResolvedDescendant(
    widgets,
    widgetsById,
    ancestorId,
    (widget) => widget.type === 5 && widget.spriteId === spriteId
  );
}

function findResolvedDescendant(
  widgets: readonly KronosResolvedWidget[],
  widgetsById: ReadonlyMap<number, KronosInterfaceWidget>,
  ancestorId: number,
  predicate: (widget: KronosInterfaceWidget) => boolean
): KronosResolvedWidget | undefined {
  return widgets.find(
    (entry) =>
      entry.widget.id !== ancestorId &&
      isWidgetDescendantOf(entry.widget, ancestorId, widgetsById) &&
      predicate(entry.widget)
  );
}

function isWidgetDescendantOf(
  widget: KronosInterfaceWidget,
  ancestorId: number,
  widgetsById: ReadonlyMap<number, KronosInterfaceWidget>
): boolean {
  let parentId = widget.parentId;
  while (parentId !== -1) {
    if (parentId === ancestorId) {
      return true;
    }
    parentId = widgetsById.get(parentId)?.parentId ?? -1;
  }
  return false;
}

function relativeWidgetRect(widget: KronosResolvedWidget, parent: KronosResolvedWidget): KronosRect {
  return {
    x: widget.rect.x - parent.rect.x,
    y: widget.rect.y - parent.rect.y,
    width: widget.rect.width,
    height: widget.rect.height
  };
}

function scaleRect(rect: KronosRect, surfaceRect: KronosRect, scale: number): KronosRect {
  return {
    x: surfaceRect.x + Math.round(rect.x * scale),
    y: surfaceRect.y + Math.round(rect.y * scale),
    width: Math.max(1, Math.round(rect.width * scale)),
    height: Math.max(1, Math.round(rect.height * scale))
  };
}
