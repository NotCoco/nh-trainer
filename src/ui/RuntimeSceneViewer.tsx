import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { unstable_batchedUpdates } from "react-dom";
import equipmentRowsJson from "../generated/equipment-bonuses.json";
import kitsJson from "../generated/kits.json";
import serverItemsJson from "../generated/server-items.json";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Fog,
  Group,
  Material,
  Mesh,
  NearestFilter,
  Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  clientViewTraceToRuntimeReplay,
  sampleRuntimeReplayEvents,
  sampleRuntimeReplayScene,
  type RuntimeReplay,
  type NhReplaySpotanimDefinition
} from "../render/clientViewReplay";
import {
  NH_CAMERA_DEFAULT_FOV_DEGREES,
  NH_CAMERA_DEFAULT_ZOOM,
  NH_CAMERA_DEFAULT_VIEWPORT_HEIGHT,
  NH_RUNTIME_CAMERA_PRESETS,
  nhCameraFollowHeightSceneUnits,
  nhClientSceneCameraOffset,
  isNhCameraKeyHeld,
  isNhCameraMoving,
  nhRuntimeCameraPreset,
  nhViewportZoomToFovDegrees,
  smoothNhCameraFocusAxis,
  updateNhCameraAngles,
  updateNhCameraAnglesFromMouseDrag,
  updateNhCameraZoomFromScrollWheel,
  type NhCameraAngles,
  type NhCameraKeyState,
  type NhCameraZoom,
  type NhMouseCameraState
} from "../render/nhClientCamera";
import {
  NH_MOUSE_CROSS_DRAW_OFFSET,
  createNhClickCrossDefinitionStore,
  nhClickCrossDefinition,
  nhClickCrossExpired,
  nhClickCrossFrameFromElapsedMs,
  type NhClickCrossColor,
  type NhClickCrossDefinitionStore
} from "../render/nhClickCross";
import {
  NH_CONTEXT_MENU_FONT_KEY,
  createNhClientFontStore,
  layoutNhClientFontGlyphs,
  nhClientFontDefinition,
  nhClientFontStringWidth,
  type NhClientFontDefinition,
  type NhClientFontStore
} from "../render/nhClientFonts";
import {
  NH_CONTEXT_MENU_OPTION_BASELINE_OFFSET,
  NH_CONTEXT_MENU_TEXT_LEFT,
  NH_CONTEXT_MENU_BODY_COLOR,
  NH_CONTEXT_MENU_BODY_BORDER_COLOR,
  NH_CONTEXT_MENU_FRAME_COLOR,
  NH_CONTEXT_MENU_HEADER_AND_PADDING_HEIGHT,
  NH_CONTEXT_MENU_HEADER_BOTTOM_COLOR,
  NH_CONTEXT_MENU_HEADER_TOP_COLOR,
  NH_CONTEXT_MENU_HOVER_FILL_ALPHA,
  NH_CONTEXT_MENU_HOVER_FILL_COLOR,
  NH_CONTEXT_MENU_HOVER_HEIGHT,
  NH_CONTEXT_MENU_HOVER_LEFT,
  NH_CONTEXT_MENU_HOVER_TOP,
  NH_CONTEXT_MENU_HOVER_WIDTH_SUBTRACT,
  NH_CONTEXT_MENU_OUTLINE_COLOR,
  NH_CONTEXT_MENU_TEXT_COLOR,
  NH_CONTEXT_MENU_TITLE,
  NH_CONTEXT_MENU_TITLE_BASELINE_OFFSET,
  NH_CANCEL_ACTION_TEXT,
  NH_CANCEL_OPCODE,
  buildNhPlayerContextEntries,
  nhPlayerCommandPacket,
  nhContextMenuOptionTop,
  nhMenuEntryText,
  resolveNhContextMenuRect,
  selectNhDefaultMenuEntry,
  visibleNhMenuEntries,
  type NhMenuEntry,
  type NhMenuRect,
  type NhPlayerContextMenuEntry
} from "../render/nhContextMenu";
import {
  createNhActorSequenceDefinitionStore,
  nhRuntimeSequenceNameForId,
  type NhActorSequenceDefinitionStore
} from "../render/nhActorSequence";
import {
  pointInNhRect,
  resolveNhFixedClientLayout,
  scaleNhFixedClientLayout,
  type NhClientWidgetDefinitions,
  type NhFixedClientCssLayout,
  type NhFixedClientLayout,
  type NhFixedSideTabId,
  type NhPrayerId,
  type NhSpellbookDefinitions,
  type NhSpellbookId
} from "../render/nhFixedLayout";
import {
  NH_PLAYER_DEFAULT_HEIGHT_CLIENT_UNITS,
  nhActorOverlayPlacement,
  nhOverlaySortValue,
  type NhActorOverlayPlacement
} from "../render/nhOverlayPlacement";
import {
  nhClientUnitsToWorldUnits,
  nhClientPixelScaleAtWorldPosition,
  nhOverlayClientViewportProjection,
  nhOverlayWorldPositionFromViewport,
  nhProjectWorldPointToViewport
} from "../render/nhOverlayProjection";
import {
  createNhHitsplatRenderState,
  createNhHitsplatDefinitionStore,
  defaultNhHitsplatDefinitions,
  nhHitsplatPrimarySpriteId,
  nhHitsplatTypeForDamage,
  NH_HITSPLAT_EMPTY_SECONDARY_TYPE,
  layoutNhHitsplat,
  type NhHitsplatDefinitionStore,
  type NhHitsplatLayout,
  type NhHitsplatSpriteMetrics
} from "../render/nhHitsplats";
import {
  createNhHealthBarRenderState,
  createNhHealthBarDefinitionStore,
  defaultNhHealthBarDefinitions,
  nhHealthBarDefinition,
  nhPlayerHealthBarDefinition,
  NH_PLAYER_HEALTH_BAR_DEFINITION_ID,
  layoutNhHealthBar,
  type NhHealthBarDefinitionStore
} from "../render/nhHealthBars";
import {
  createNhOverheadIconDefinitionStore,
  defaultNhOverheadIconDefinitions,
  nhPrayerOverheadDefinition,
  nhSkullOverheadDefinition,
  type NhOverheadIconDefinitionStore
} from "../render/nhOverheadIcons";
import {
  nhRenderCycleToProjectileClientCycle,
  sampleNhProjectileMotion,
  type NhProjectileDefinition,
  type NhProjectileDefinitionMap,
  type NhProjectileDefinitionStore
} from "../render/nhProjectileMotion";
import {
  composeNhGroundItemModel,
  composeNhPlayerModel,
  nhEquipmentSlotsFromLoadoutItems,
  updateNhAnimatedTextures,
  updateNhPlayerModelPainterOrder,
  type NhPlayerModelSources
} from "../render/nhPlayerModel";
import {
  buildNhSceneCollision,
  clientObjectFootprint,
  nhArenaTileSceneCorners,
  type NhArenaMetadata,
  type NhArenaObjectPlacement,
  type NhSceneOffset,
  type NhSceneCollision,
  type NhWorldTile
} from "../render/nhSceneCollision";
import { nhNhBotCombatTileAllowed } from "../render/nhWilderness";
import {
  buildNhSceneObjectContextEntries,
  findNhSceneObjectForWorldTile,
  isNhSceneObjectMenuable,
  nhSceneObjectCommandPacket,
  type NhSceneObjectContextMenuEntry,
  type NhSelectedSpell
} from "../render/nhSceneObjects";
import { nhPickSceneTileFromViewportPoint } from "../render/nhSceneTilePicking";
import {
  buildNhMinimapSceneSprite,
  type NhFloorDefinitionStore,
  type NhMinimapSceneSprite,
  type NhTextureDefinitionStore
} from "../render/nhMinimapScene";
import {
  applyNhActorAnimation,
  applyNhSequenceAnimation,
  attachNhAnimationMetadata,
  nhSequencePrecedenceAnimating,
  nhSequencePriority,
  nhRenderSequenceFromRawSequence,
  nhSequencePlaybackMode,
  type NhAnimationFixtures,
  type NhAnimationFrameStore,
  type NhLoadoutMeshMetadata,
  type NhRawSequenceStore,
  type NhRenderSequenceDefinition,
  type NhSequencePlaybackMode,
  type NhSequenceFrameCursorOverride
} from "../render/nhSequencePlayback";
import {
  getRuntimeSceneTodoGates,
  runtimeArena,
  runtimeActors,
  runtimeLoadouts,
  runtimeRenderEvents,
  runtimeSceneGates,
  runtimeTimeline,
  sampleRuntimeRenderEvents,
  sampleRuntimeScene,
  type RuntimeActorId,
  type RuntimeKeyframe,
  type RuntimeActorPose,
  type RuntimeInventorySlot,
  type RuntimeHudState,
  type RuntimeLoadoutId,
  type RuntimePlayerAppearance,
  type RuntimeRenderEvent,
  type RuntimeSpriteSheetId,
  type RuntimeSequenceName,
  type RuntimeSceneSnapshot,
  type RuntimeTile
} from "../render/runtimeScene";
import {
  findNhTileRouteWaypoints,
  findNhObjectRouteWaypoints,
  findNhTargetRouteWaypoints,
  nhSceneObjectRouteReached,
  nhSceneProjectileRouteClear,
  nhSceneTargetRouteReached,
  NH_GAME_TICK_MS,
  NH_TILE_WORLD_UNITS
} from "../render/nhTileMovement";
import {
  buildNhInventoryContextEntries,
  createNhInventoryEquipmentDefinitionStore,
  createNhInventoryItemDefinitionStore,
  mutateNhInventorySlotsForAction,
  normalizeNhInventorySlots,
  replaceNhInventorySlot,
  reorderNhInventorySlotsForDrag,
  type NhInventoryActionMutation,
  type NhInventoryContextMenuEntry,
  type NhInventoryDragMutation,
  type NhInventoryEquipmentDefinitionStore,
  type NhInventoryItemDefinitionStore,
  type NhInventorySelectedItem
} from "../render/nhInventory";
import {
  createNhWeaponTypeDefinitionStore,
  type NhWeaponTypeDefinitionStore
} from "../render/nhCombat";
import { nhActivePrayerIds, nhTogglePrayerState, type NhPrayerStates } from "../render/nhPrayer";
import {
  advanceRuntimePlayerCombat,
  assertValidClientViewTrace,
  applyConsumable,
  consumableItemIdForDoseCount,
  applyRuntimePlayerCombatPreMovementHits,
  clearRuntimePlayerCombatActorPolicyNoTargetGrace,
  consumableDefinitions,
  consumableUseCountForItemId,
  createItemActionQueue,
  createSupplyDelayState,
  createRuntimePlayerCombatState,
  createDefaultNhDuelClientViewTrace,
  createDisabledMinimapClientViewTrace,
  createInventorySwitchNhDuelClientViewTrace,
  createMinimapSemanticClientViewTrace,
  equipmentRowsByItemId,
  applyRuntimeOpponentPolicyAction,
  protectPrayerForStyle,
  pvpProtectionDamageMultiplier,
  requestRuntimePlayerCombatAttack,
  requestRuntimePlayerCombatSpell,
  resetRuntimePlayerCombatActorPolicyFreshFight,
  resetRuntimePlayerCombatActorPolicyDisengage,
  resetRuntimePlayerCombatActorTarget,
  runtimePlayerCombatActionDurationTicks,
  runtimePlayerCombatActorSequence,
  runtimePlayerCombatActiveProtectionPrayer,
  runtimePlayerCombatDefaultLevels,
  runtimePlayerCombatDistance,
  runtimePlayerCombatFightCountdownLabel,
  runtimePlayerCombatFightCountdownTicks,
  runtimePlayerCombatHealthBarEndTick,
  runtimePlayerCombatQueuedHitDamage,
  runtimePlayerCombatProjectileDurationCycles,
  runtimePlayerCombatHitsplatEndTick,
  runtimePlayerCombatIsFightCountdownActive,
  runtimePlayerCombatProcessOrderForTick,
  runtimePlayerCombatXpDropsForDamage,
  runtimePlayerCombatIceBarrageAutocastSlot,
  runtimePlayerCombatTargetRouteProfile,
  isRuntimePlayerCombatActorDead,
  setRuntimePlayerCombatAutocast,
  setRuntimePlayerCombatAttackSet,
  setRuntimePlayerCombatLoadout,
  setRuntimePlayerCombatPrayers,
  syncRuntimePlayerCombatStateToInput,
  toggleRuntimePlayerCombatSpecial,
  type CombatLevels,
  type CombatStyle,
  type ConsumableId,
  type EquipmentBonusRow,
  type PrayerId,
  type RuntimePlayerCombatActorState,
  type RuntimePlayerCombatEvent,
  type RuntimePlayerCombatRouteRequest,
  type RuntimePlayerCombatSpellId,
  type RuntimePlayerCombatState,
  type RuntimePlayerCombatSupplies,
  type RuntimePlayerCombatXpSkillId,
  type RuntimePolicyOpponentResult,
  type SimStats,
  type StatKey,
  type SupplyDelayState,
  type NhPolicyAction,
  type ClientViewTrace
} from "../sim";
import { canAttackThroughLock, createEntityLockState, movementGate, resetFreeze, type EntityLockState } from "../sim/entity/locks";
import type { EquipmentSlot, VisibleEquipment, VisibleEquipmentItem } from "../sim/clientView";
import { createNhPolicyController, type NhPolicyRuntimeController, type ParsedNhPolicy } from "../bot";
import { scriptedNhController, type NhDuelControllerContext } from "../sim/nh/duel";
import {
  emptyRuntimePolicyTargetTrackingState,
  resolveRuntimePolicyTargetTracking,
  shouldRuntimePolicyResetForFreshFight,
  shouldRuntimePolicyRouteResetToSpawn,
  type RuntimePolicyTargetTrackingState
} from "../sim/nh/runtimePolicyTargeting";
import { inferNhSelectedGearProfile } from "../sim/nh/gearProfile";
import { nhLoadouts } from "../sim/nh/loadouts";
import {
  NhClientHud,
  type NhChatboxButtonCommand,
  type NhClanChatButtonCommand,
  type NhClanChatSnapshot,
  type NhCombatAutoRetaliateCommand,
  type NhCombatAutocastCommand,
  type NhCombatSpecialCommand,
  type NhCombatStyleCommand,
  type NhEquipmentItemCommand,
  type NhEquipmentUtilityPanelMode,
  type NhEquipmentUtilityButtonCommand,
  type NhInventorySlotCommand,
  type NhInventorySlotDragCommand,
  type NhPrayerSlotDragCommand,
  type NhPrayerSlotCommand,
  type NhRunOrbCommand,
  type NhSideTabCommand,
  type NhSocialButtonCommand,
  type NhSocialListsSnapshot,
  type NhStatsSkillCommand,
  type NhSpellbookSpellDragCommand,
  type NhSpellbookSpellCommand,
  type NhXpDropOrbCommand
} from "./NhClientHud";
import {
  RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT,
  RUNELITE_CLIENT_TICK_MS,
  RuneliteClientShell,
  type RuneliteAntiDragConfigSnapshot,
  type RuneliteAnimationSmoothingConfigSnapshot,
  type RuneliteAttackStylesConfigSnapshot,
  type RuneliteBoostsConfigSnapshot,
  type RuneliteClientConfigSnapshot,
  type RuneliteEntityHiderConfigSnapshot,
  type RuneliteFreezeTimersConfigSnapshot,
  type RuneliteGpuPluginConfigSnapshot,
  type RuneliteHideUnderConfigSnapshot,
  type RuneliteInfoBoxConfigSnapshot,
  type RuneliteOverlayMenuConfigSnapshot,
  type RuneliteOpponentInfoConfigSnapshot,
  type RunelitePlayerIndicatorsConfigSnapshot,
  type RunelitePrayAgainstPlayerConfigSnapshot,
  type RunelitePrayerConfigSnapshot,
  type RunelitePvpFightHistoryEntrySnapshot,
  type RunelitePvpToolsConfigSnapshot,
  type RunelitePvpToolsItemSnapshot,
  type RunelitePvpToolsSnapshot,
  type RunelitePvpTrackerLineSnapshot,
  type RunelitePvpTrackerSnapshot,
  type RuneliteSuppliesTrackerCategory,
  type RuneliteSuppliesTrackerSnapshot,
  type RuneliteSuppliesTrackerSpriteSnapshot,
  type RuneliteSpecBarConfigSnapshot,
  type RuneliteStatusBarsConfigSnapshot,
  type RuneliteStatusOrbsConfigSnapshot,
  type RuneliteTimersConfigSnapshot,
  type RuneliteTileIndicatorsConfigSnapshot,
  type RuneliteXpDropConfigSnapshot
} from "./RuneliteClientShell";
import {
  runeliteDirectFunctionKeyFromKeyboardEvent,
  runeliteKeyRemappingCameraDirectionFromKeyboardEvent,
  runeliteKeyRemappingEventTargetConsumesKeys,
  runeliteKeyRemappingFunctionKeyFromKeyboardEvent,
  runeliteKeyRemappingSourceListener,
  runeliteKeyRemappingTextEntryTargetConsumesKeys,
  type RuneliteKeyRemappingCameraDirection,
  type RuneliteKeyRemappingConfigSnapshot
} from "./runeliteKeyRemapping";
import {
  NH_GAME_KEYBIND_SOURCE,
  NH_DEFAULT_GAME_KEYBINDS,
  nhAssignGameKeybind,
  nhGameKeybindSideTabForFunctionKey,
  nhGameKeybindsWithEscapeClose,
  nhNormalizeGameKeybindSnapshot,
  nhPreEocGameKeybinds,
  nhReadGameKeybindsFromStorage,
  nhWriteGameKeybindsToStorage,
  type NhGameKeybindKeySlot,
  type NhGameKeybindSnapshot
} from "./nhGameKeybinds";
import {
  RUNELITE_FREEZE_TIMERS_BARRAGE_DURATION_MS,
  RUNELITE_FREEZE_TIMERS_BARRAGE_SPOTANIM_ID,
  RUNELITE_FREEZE_TIMERS_FREEZE_IMAGE_PATH,
  RUNELITE_FREEZE_TIMERS_FREEZE_IMMUNE_IMAGE_PATH,
  RUNELITE_FREEZE_TIMERS_FREEZE_IMMUNITY_MS,
  RUNELITE_FREEZE_TIMERS_IMAGE_HEIGHT_PX,
  RUNELITE_FREEZE_TIMERS_IMAGE_TEXT_GAP_PX,
  RUNELITE_FREEZE_TIMERS_IMAGE_WIDTH_PX,
  RUNELITE_FREEZE_TIMERS_OVERLAY_Y_OFFSET_PX,
  RUNELITE_FREEZE_TIMERS_TIMER_FONT_PX,
  RUNELITE_TIMERS_ICE_BARRAGE_SPRITE_ID,
  runeliteFreezeTimerOverlaySnapshotsFromCombatState,
  runeliteLocalFreezeTimerInfoBoxSnapshot,
  type RuneliteFreezeTimerInfoBoxSnapshot,
  type RuneliteFreezeTimerOverlaySnapshot
} from "./runeliteFreezeTimers";
import {
  RUNELITE_STATUS_BARS_BACKGROUND_RGBA,
  RUNELITE_STATUS_BARS_BAR_WIDTH,
  RUNELITE_STATUS_BARS_COUNTER_ICON_HEIGHT,
  RUNELITE_STATUS_BARS_FIXED_LEFT_OFFSET,
  RUNELITE_STATUS_BARS_FIXED_RIGHT_OFFSET,
  RUNELITE_STATUS_BARS_HEAL_OFFSET,
  RUNELITE_STATUS_BARS_HEIGHT,
  RUNELITE_STATUS_BARS_ICON_AND_COUNTER_OFFSET_X,
  RUNELITE_STATUS_BARS_ICON_AND_COUNTER_OFFSET_Y,
  RUNELITE_STATUS_BARS_OVERHEAL_OFFSET,
  RUNELITE_STATUS_BARS_PADDING,
  RUNELITE_STATUS_BARS_SKILL_ICON_HEIGHT,
  runeliteStatusBarSnapshots,
  type RuneliteStatusBarSnapshot
} from "./runeliteStatusBars";
import {
  RUNELITE_STATUS_ORBS_ARC_SOURCE,
  RUNELITE_STATUS_ORBS_DIAMETER,
  RUNELITE_STATUS_ORBS_NORMAL_HP_REGEN_TICKS,
  RUNELITE_STATUS_ORBS_OFFSET,
  RUNELITE_STATUS_ORBS_OVERLAY_LAYER,
  RUNELITE_STATUS_ORBS_OVERLAY_POSITION,
  RUNELITE_STATUS_ORBS_SPECIAL_ACTIVE_OVERLAY_RGBA,
  RUNELITE_STATUS_ORBS_SPEC_REGEN_TICKS,
  RUNELITE_STATUS_ORBS_STROKE_SOURCE,
  RUNELITE_STATUS_ORBS_STROKE_WIDTH,
  runeliteStatusOrbSnapshots,
  runeliteStatusOrbsRunOrbText,
  type RuneliteStatusOrbSnapshot
} from "./runeliteStatusOrbs";
import {
  RUNELITE_OPPONENT_INFO_BACKGROUND_RGBA,
  RUNELITE_OPPONENT_INFO_HP_GREEN_RGBA,
  RUNELITE_OPPONENT_INFO_HP_RED_RGBA,
  RUNELITE_OPPONENT_INFO_INSIDE_STROKE_RGBA,
  RUNELITE_OPPONENT_INFO_OUTSIDE_STROKE_RGBA,
  RUNELITE_OPPONENT_INFO_PANEL_BORDER,
  RUNELITE_OPPONENT_INFO_PANEL_GAP_Y,
  RUNELITE_OPPONENT_INFO_PROGRESS_HEIGHT,
  RUNELITE_OPPONENT_INFO_STANDARD_WIDTH,
  RUNELITE_OPPONENT_INFO_WAIT_MS,
  RUNELITE_OPPONENT_COMPARISON_HIGHLIGHT_COLOR,
  applyRuneliteOpponentInfoMenuEntries,
  runeliteOpponentComparisonSnapshot,
  runeliteOpponentInfoSnapshot,
  type RuneliteOpponentComparisonSnapshot,
  type RuneliteOpponentInfoSnapshot
} from "./runeliteOpponentInfo";
import {
  RUNELITE_PLAYER_INDICATORS_ACTOR_OVERHEAD_TEXT_MARGIN,
  RUNELITE_PLAYER_INDICATORS_ACTOR_HORIZONTAL_TEXT_MARGIN,
  RUNELITE_PLAYER_INDICATORS_DEFAULT_LOCATIONS,
  runelitePlayerIndicatorSnapshots,
  type RunelitePlayerIndicatorRelation
} from "./runelitePlayerIndicators";
import {
  RUNELITE_BOOSTS_BACKGROUND_RGBA,
  RUNELITE_BOOSTS_COMBAT_SKILL_ORDER,
  RUNELITE_BOOSTS_ICON_PANEL_WIDTH,
  RUNELITE_BOOSTS_ICON_ROW_HEIGHT,
  RUNELITE_BOOSTS_OVERLAY_WIDTH,
  RUNELITE_BOOSTS_ROW_HEIGHT,
  RUNELITE_INFOBOX_GAP_PX,
  runeliteBoostsOverlaySnapshot,
  runeliteBoostsInfoBoxSnapshot,
  type RuneliteBoostRowSnapshot,
  type RuneliteBoostsInfoBoxItemSnapshot,
  type RuneliteBoostsInfoBoxSnapshot,
  type RuneliteBoostsOverlaySnapshot
} from "./runeliteBoosts";
import {
  RUNELITE_ATTACK_STYLES_OVERLAY_HEIGHT,
  RUNELITE_ATTACK_STYLES_OVERLAY_POSITION,
  RUNELITE_ATTACK_STYLES_PANEL_PADDING_X,
  RUNELITE_ATTACK_STYLES_TEXT_NORMAL_RGBA,
  RUNELITE_ATTACK_STYLES_TEXT_WARNING_RGBA,
  runeliteAttackStylesOverlaySnapshot,
  type RuneliteAttackStylesOverlaySnapshot
} from "./runeliteAttackStyles";
import {
  RUNELITE_PRAYER_BAR_BACKGROUND_RGBA,
  RUNELITE_PRAYER_BAR_FILL_RGBA,
  RUNELITE_PRAYER_BAR_HEIGHT,
  RUNELITE_PRAYER_BAR_LOCAL_HEIGHT_OFFSET_PX,
  RUNELITE_PRAYER_BAR_WIDTH,
  RUNELITE_PRAYER_FLICK_HELP_RGBA,
  RUNELITE_PRAYER_ORB_FLICK_RGBA,
  runelitePrayerBarSnapshot,
  runelitePrayerFlickOrbSnapshot,
  runelitePrayerTickProgressRadians,
  type RunelitePrayerBarSnapshot,
  type RunelitePrayerFlickOrbSnapshot
} from "./runelitePrayer";
import {
  RUNELITE_GPU_LOCAL_TILE_SIZE,
  runeliteGpuUniformSnapshot
} from "./runeliteGpu";
import {
  RUNELITE_TILE_INDICATORS_FILL_RGBA,
  RUNELITE_TILE_INDICATORS_OVERLAY_LAYER,
  RUNELITE_TILE_INDICATORS_OVERLAY_POSITION,
  RUNELITE_TILE_INDICATORS_OVERLAY_PRIORITY,
  runeliteTileIndicatorStrokeWidth,
  type RuneliteTileIndicatorKind
} from "./runeliteTileIndicators";
import {
  RUNELITE_ENTITY_HIDER_CASTLE_WARS_REGION_ID,
  RUNELITE_ENTITY_HIDER_CONFIG_GROUP,
  RUNELITE_ENTITY_HIDER_SOURCE_CSV,
  RUNELITE_ENTITY_HIDER_SOURCE_UPDATE_CONFIG,
  runeliteEntityHiderActorId2dVisible,
  runeliteEntityHiderActorVisible,
  runeliteEntityHiderFilterRuntimeEvents
} from "./runeliteEntityHider";
import {
  RUNELITE_HIDE_UNDER_CASTLE_WARS_REGION_ID,
  RUNELITE_HIDE_UNDER_SOURCE_DESCRIPTOR,
  RUNELITE_HIDE_UNDER_SOURCE_LOCAL_VISIBILITY,
  RUNELITE_HIDE_UNDER_SOURCE_REGION_GUARD,
  RUNELITE_HIDE_UNDER_SOURCE_TARGET_TIMER,
  runeliteHideUnderActorVisible
} from "./runeliteHideUnder";
import {
  RUNELITE_PRAY_AGAINST_PLAYER_ICON_OUTLINE_COLOR,
  RUNELITE_PRAY_AGAINST_PLAYER_PROTECTION_ICON_SIZE,
  RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_ICON,
  RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_OVERLAY,
  RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_PLUGIN,
  RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_PRAYER_TAB_OVERLAY,
  RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_WEAPON_TYPE,
  runelitePrayAgainstPlayerOverlaySnapshotsFromCombatState,
  type RunelitePrayAgainstPlayerOverlaySnapshot
} from "./runelitePrayAgainstPlayer";
import {
  RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_BACKGROUND_RGBA,
  RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_INSIDE_STROKE_RGBA,
  RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_OUTSIDE_STROKE_RGBA,
  RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_PADDING,
  runeliteMouseHighlightTooltipSnapshot,
  type RuneliteMouseHighlightConfigSnapshot,
  type RuneliteMouseHighlightTooltipRegion,
  type RuneliteMouseHighlightTooltipSnapshot
} from "./runeliteMouseHighlight";
import {
  RUNELITE_OVERLAY_POSITION_SOURCE,
  readRuneliteOverlayPreferredLocations,
  runeliteOverlayPreferredLocationStyle,
  type RuneliteOverlayPreferredLocations
} from "./runeliteOverlayPosition";

interface RuntimeSceneBoundary {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly arenaRoot: Group;
  readonly groundItemRoot: Group;
  readonly actorRoot: Group;
  readonly eventRoot: Group;
  readonly controlRoot: Group;
  readonly actorSlots: Map<RuntimeActorId, ActorRenderSlot>;
  readonly cameraRig: RuntimeCameraRig;
  sceneTilePicker: RuntimeSceneTilePicker | null;
  fixedClientLayout: NhFixedClientLayout | null;
  fixedClientCssLayout: NhFixedClientCssLayout | null;
}

interface ActorRenderSlot {
  readonly group: Group;
  currentModelKey: string | null;
  currentActionSequenceKey: string | null;
  lastActionAnimationCycle: number;
  lastActionPrimaryFrame: number | null;
  lastActionPrimaryFrameCycle: number | null;
  actionAnimationRewindCount: number;
}

type RuntimeFollowTarget = RuntimeActorId | "free";

interface RuntimeCameraRig {
  readonly target: Vector3;
  followTarget: RuntimeFollowTarget;
  clientAngles: NhCameraAngles;
  zoom: NhCameraZoom;
}

interface RuntimeSceneTilePicker {
  readonly arena: NhArenaMetadata;
  readonly sceneOffset: NhSceneOffset;
}

interface RuntimeViewportSourcePoint {
  readonly x: number;
  readonly y: number;
}

interface RuntimeSceneObjectPick {
  readonly placement: NhArenaObjectPlacement;
  readonly walkTile: RuntimeTile;
  readonly actionTile: RuntimeTile;
  readonly depthClientUnits: number;
}

interface RuntimeClientPosition {
  readonly x: number;
  readonly z: number;
}

interface ManualActorState {
  /** Snapped scene tile that represents the server-side actor position. */
  readonly tile: RuntimeTile;
  /** Visual-only tile used while the model interpolates between server ticks. */
  readonly renderTile: RuntimeTile;
  readonly routeWaypoints: readonly RuntimeTile[];
  readonly routeTraversalModes: readonly number[];
  readonly serverRouteWaypoints: readonly RuntimeTile[];
  readonly serverRouteTraversalModes: readonly number[];
  readonly clientPosition: RuntimeClientPosition | null;
  readonly lastMovementClientCycle: number | null;
  readonly movementStallTicks: number;
  readonly sequencePathLengthAtStart: number;
  readonly activeSequenceKey: string | null;
  readonly completedSequenceKey: string | null;
  readonly primaryFrame: number;
  readonly primaryFrameCycle: number;
  readonly primarySequenceLoops: number;
  readonly primarySequenceCycle: number;
  readonly movementBlockedBySequence: boolean;
  readonly movementFrame: number;
  readonly movementFrameCycle: number;
  readonly orientationUnits: number;
  readonly rotationUnits: number;
  readonly turnTicks: number;
  readonly running: boolean;
  readonly loadoutId: RuntimeLoadoutId;
  readonly appearance?: RuntimePlayerAppearance;
  readonly sequenceName: RuntimeSequenceName;
  readonly facingDegrees: number;
  readonly markerLabel: string;
  readonly animationCycle: number;
}

type RuntimeEquipmentItemIdsBySlot = ReadonlyMap<number, number>;
const runtimePlayerAppearanceKits = kitsJson as NhPlayerModelSources["kits"];
const runtimePlayerAppearanceServerItemsById = new Map(
  (serverItemsJson as NhPlayerModelSources["serverItems"]).map((item) => [item.id, item])
);

const RUNTIME_NH_STAKE_LOADOUT_ID: RuntimeLoadoutId = "kodai-robes";
const RUNTIME_NH_STAKE_INVENTORY_ITEM_IDS = [
  12695,
  22461,
  6685,
  6685,
  13441,
  391,
  391,
  10925,
  391,
  6685,
  391,
  10925,
  4736,
  21902,
  391,
  391,
  4759,
  22322,
  391,
  391,
  11802,
  12006,
  391,
  391,
  391,
  391,
  391,
  12791
] as const;
const RUNTIME_NH_STAKE_EQUIPMENT_ENTRIES = [
  [0, 10828],
  [1, 21791],
  [2, 6585],
  [3, 11791],
  [4, 4091],
  [5, 12831],
  [7, 4093],
  [9, 7462],
  [10, 11840],
  [12, 11770],
  [13, 21932]
] as const satisfies readonly (readonly [number, number])[];
const RUNTIME_NH_STAKE_EQUIPMENT_ITEMS = new Map(RUNTIME_NH_STAKE_EQUIPMENT_ENTRIES);
const RUNTIME_NH_STAKE_INVENTORY_SLOTS = normalizeNhInventorySlots(
  RUNTIME_NH_STAKE_INVENTORY_ITEM_IDS.map((itemId) => ({ itemId, quantity: 1 }))
);
function runtimeNhStakeInventorySlots(): readonly (RuntimeInventorySlot | null)[] {
  return normalizeNhInventorySlots(
    RUNTIME_NH_STAKE_INVENTORY_ITEM_IDS.map((itemId) => ({ itemId, quantity: 1 }))
  );
}

function runtimeNhStakeEquipmentItems(): RuntimeEquipmentItemIdsBySlot {
  return new Map(RUNTIME_NH_STAKE_EQUIPMENT_ENTRIES);
}

const RUNTIME_CONSUMABLE_IDS = Object.keys(consumableDefinitions) as ConsumableId[];
const EMPTY_RUNTIME_SUPPLIES: RuntimePlayerCombatSupplies = {
  manta_ray: 0,
  shark: 0,
  anglerfish: 0,
  karambwan: 0,
  saradomin_brew: 0,
  super_restore: 0,
  sanfew_serum: 0,
  super_combat: 0,
  ranging_potion: 0,
  bastion: 0
};
const RUNTIME_NH_STAKE_ALLOWED_SETUP_ITEM_IDS = new Set<number>([
  ...RUNTIME_NH_STAKE_INVENTORY_ITEM_IDS,
  ...RUNTIME_NH_STAKE_EQUIPMENT_ENTRIES.map(([, itemId]) => itemId),
  ...RUNTIME_NH_STAKE_INVENTORY_ITEM_IDS.flatMap((itemId) => {
    const consumableId = RUNTIME_CONSUMABLE_IDS.find((id) => consumableDefinitions[id].itemIds.includes(itemId));
    return consumableId ? consumableDefinitions[consumableId].itemIds : [itemId];
  })
]);

function runtimeConsumableIdForItemId(itemId: number): ConsumableId | null {
  for (const id of RUNTIME_CONSUMABLE_IDS) {
    if (consumableDefinitions[id].itemIds.includes(itemId)) {
      return id;
    }
  }
  return null;
}

function runtimeSuppliesFromInventorySlots(
  slots: readonly (RuntimeInventorySlot | null)[]
): RuntimePlayerCombatSupplies {
  // Source: sim/nh/duel.ts createSuppliesFromInventory() and runtime-policy-opponent.ts
  // runtimePolicySuppliesForInventorySlots() count usable supplies from the inventory container.
  const supplies: Record<ConsumableId, number> = { ...EMPTY_RUNTIME_SUPPLIES };
  for (const slot of slots) {
    if (!slot) {
      continue;
    }
    const item = runtimeConsumableIdForItemId(slot.itemId);
    if (item) {
      supplies[item] += consumableUseCountForItemId(slot.itemId, slot.quantity);
    }
  }
  return supplies;
}

function runtimeNhStakeSupplies(): RuntimePlayerCombatSupplies {
  return runtimeSuppliesFromInventorySlots(RUNTIME_NH_STAKE_INVENTORY_SLOTS);
}

function runtimeNhStakeInventorySlotsForSupplies(
  supplies: RuntimePlayerCombatSupplies
): readonly (RuntimeInventorySlot | null)[] {
  const remainingSupplies: Record<ConsumableId, number> = { ...supplies };
  return runtimeNhStakeInventorySlots().map((slot) => {
    if (!slot) {
      return null;
    }

    const supply = runtimeConsumableIdForItemId(slot.itemId);
    if (!supply) {
      return slot;
    }
    if (remainingSupplies[supply] <= 0) {
      return null;
    }

    const slotUses = consumableUseCountForItemId(slot.itemId, slot.quantity);
    const visibleUses = Math.min(slotUses, remainingSupplies[supply]);
    remainingSupplies[supply] -= visibleUses;
    return {
      ...slot,
      itemId: consumableItemIdForDoseCount(supply, visibleUses, slot.itemId),
      quantity: 1
    };
  });
}

const RUNTIME_NH_STAKE_ITEM_NAMES = new Map(
  (serverItemsJson as readonly { readonly id: number; readonly name: string }[]).map((item) => [item.id, item.name])
);
const RUNTIME_NH_STAKE_VISIBLE_EQUIPMENT: VisibleEquipment = {
  head: { itemId: 10828, name: RUNTIME_NH_STAKE_ITEM_NAMES.get(10828) ?? "Item 10828" },
  cape: { itemId: 21791, name: RUNTIME_NH_STAKE_ITEM_NAMES.get(21791) ?? "Item 21791" },
  amulet: { itemId: 6585, name: RUNTIME_NH_STAKE_ITEM_NAMES.get(6585) ?? "Item 6585" },
  weapon: { itemId: 11791, name: RUNTIME_NH_STAKE_ITEM_NAMES.get(11791) ?? "Item 11791" },
  body: { itemId: 4091, name: RUNTIME_NH_STAKE_ITEM_NAMES.get(4091) ?? "Item 4091" },
  shield: { itemId: 12831, name: RUNTIME_NH_STAKE_ITEM_NAMES.get(12831) ?? "Item 12831" },
  legs: { itemId: 4093, name: RUNTIME_NH_STAKE_ITEM_NAMES.get(4093) ?? "Item 4093" },
  hands: { itemId: 7462, name: RUNTIME_NH_STAKE_ITEM_NAMES.get(7462) ?? "Item 7462" },
  feet: { itemId: 11840, name: RUNTIME_NH_STAKE_ITEM_NAMES.get(11840) ?? "Item 11840" },
  ring: { itemId: 11770, name: RUNTIME_NH_STAKE_ITEM_NAMES.get(11770) ?? "Item 11770" },
  ammo: { itemId: 21932, name: RUNTIME_NH_STAKE_ITEM_NAMES.get(21932) ?? "Item 21932" }
};
const RUNTIME_NH_STAKE_VISIBLE_INVENTORY_ITEMS: readonly VisibleEquipmentItem[] = RUNTIME_NH_STAKE_INVENTORY_SLOTS.flatMap(
  (slot): VisibleEquipmentItem[] =>
    slot ? [{ itemId: slot.itemId, name: RUNTIME_NH_STAKE_ITEM_NAMES.get(slot.itemId) ?? `Item ${slot.itemId}` }] : []
);
const RUNTIME_NH_STAKE_GEAR_PROFILE = inferNhSelectedGearProfile({
  equipment: RUNTIME_NH_STAKE_VISIBLE_EQUIPMENT,
  inventoryItems: RUNTIME_NH_STAKE_VISIBLE_INVENTORY_ITEMS
});

interface RuntimeInventoryEquipmentMutation {
  readonly equipSlot: number;
  readonly equippedItemId: number;
  readonly previousItemId: number | null;
  readonly weaponType: string | null;
  readonly weaponTypeConfig: number | undefined;
  readonly serverHandler: "Equipment.equip";
}

interface RuntimeInventoryMutationResolution {
  readonly inventorySlots: readonly (RuntimeInventorySlot | null)[] | null;
  readonly equipmentItems: RuntimeEquipmentItemIdsBySlot | null;
  readonly hud: Partial<RuntimeHudState> | null;
  readonly inventoryMutation: NhInventoryActionMutation | null;
  readonly actorLoadoutId: RuntimeLoadoutId | null;
  readonly equipmentMutation: RuntimeInventoryEquipmentMutation | null;
  readonly blockedReason: string | null;
}

interface QueuedInventoryEquipContext {
  readonly entry: NhInventoryContextMenuEntry;
}

interface QueuedInventoryConsumableContext {
  readonly entry: NhInventoryContextMenuEntry;
  readonly item: ConsumableId;
}

interface RuntimeEquipmentRemoveMutationResolution {
  readonly inventorySlots: readonly (RuntimeInventorySlot | null)[] | null;
  readonly equipmentItems: RuntimeEquipmentItemIdsBySlot | null;
  readonly hud: Partial<RuntimeHudState> | null;
  readonly mutation: "equipment-unequip" | "blocked-inventory-full" | "";
  readonly freeInventorySlot: number;
  readonly equipmentSlotCleared: boolean;
}

interface QueuedEquipmentRemoveContext {
  readonly resolution: RuntimeEquipmentRemoveMutationResolution;
  readonly slotId: string;
}

interface TemporarySavedSetupSnapshot {
  readonly version: 1;
  readonly savedAt: number;
  readonly loadoutId: RuntimeLoadoutId;
  readonly inventory: readonly (RuntimeInventorySlot | null)[];
  readonly equipment: readonly (readonly [number, number])[];
}

interface ManualActorRouteResult {
  readonly actor: ManualActorState;
  readonly reached: boolean;
}

interface RuntimeActorModelAsset {
  readonly scene: Object3D;
  readonly metadata: NhLoadoutMeshMetadata;
}

interface RuntimeEffectAsset {
  readonly scene: Object3D;
  readonly metadata: NhLoadoutMeshMetadata;
}

interface NhSpotanimDefinition {
  readonly id: number;
  readonly animationId: number;
  readonly label?: string;
  readonly artifactUrl?: string;
  readonly meshMetadataUrl?: string;
}

interface NhCacheGlbManifest {
  readonly exports: readonly NhCacheGlbManifestEntry[];
}

interface NhCacheGlbManifestEntry {
  readonly output: string;
  readonly meshMetadata?: string;
  readonly label?: string;
  readonly spotanimId?: number;
}

interface NhClientReferenceManifest {
  readonly schemaVersion: number;
  readonly frames: readonly NhClientReferenceFrame[];
}

interface NhClientReferenceFrame {
  readonly clientViewTraceFileName?: string;
}

interface NhSpotanimArtifact {
  readonly label?: string;
  readonly artifactUrl: string;
  readonly meshMetadataUrl?: string;
}

interface CenteredSceneModels {
  readonly group: Group;
  readonly terrainRoot: Object3D;
  readonly offset: { readonly x: number; readonly y: number; readonly z: number };
}

interface SpriteAtlasEntry {
  readonly spriteId: number;
  readonly itemId?: number;
  readonly name?: string;
  readonly alias?: string;
  readonly variant?: "normal" | "selected";
  readonly sourceQuantity?: number;
  readonly quantityVariant?: boolean;
  readonly areaId?: number;
  readonly char?: string;
  readonly charCode?: number;
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly advance?: number;
  readonly leftBearing?: number;
  readonly topBearing?: number;
}

interface SpriteAtlasMetadata {
  readonly id: RuntimeSpriteSheetId;
  readonly image: string;
  readonly width: number;
  readonly height: number;
  readonly ascent?: number;
  readonly sprites: readonly SpriteAtlasEntry[];
}

interface RuntimeSpriteAtlas {
  readonly id: RuntimeSpriteSheetId;
  readonly texture: Texture;
  readonly metadata: SpriteAtlasMetadata;
  readonly sprites: ReadonlyMap<number, SpriteAtlasEntry>;
  readonly spriteFrames: ReadonlyMap<string, SpriteAtlasEntry>;
}

interface OverlaySpriteBuildOptions {
  readonly widthRatio?: number;
  readonly anchorLeft?: boolean;
  readonly renderOrder?: number;
  readonly spriteFrame?: number;
}

interface ClientSpritePixelData {
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

interface ClientSpriteSourceData {
  readonly sheetId: RuntimeSpriteSheetId;
  readonly spriteId: number;
  readonly spriteFrame: number;
  readonly image: string;
  readonly width: number;
  readonly height: number;
}

type ClientSprite = Sprite & {
  userData: {
    clientSpritePixels?: ClientSpritePixelData;
    nhSpriteSource?: ClientSpriteSourceData;
  };
};

interface NhRuntimeOverlayDebugEntry {
  readonly id: string;
  readonly actorId: RuntimeActorId;
  readonly spriteSheetId: RuntimeSpriteSheetId;
  readonly spriteId: number;
  readonly spriteFrame: number;
  readonly sortValue: number;
  readonly renderOrder: number;
  readonly placement: NhActorOverlayPlacement;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly sprites: readonly ClientSpriteSourceData[];
  readonly hitsplat?: {
    readonly typeId: number;
    readonly value: number;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly style?: string;
    readonly rawDamage?: number;
    readonly maxDamage?: number;
    readonly hitChance?: number;
  };
  readonly healthBar?: {
    readonly definitionId: number;
    readonly frontSpriteId: number;
    readonly backSpriteId: number;
    readonly previousHealth: number;
    readonly targetHealth: number;
    readonly cycleOffset: number;
  };
}

interface NhRuntimeDebugSnapshot {
  readonly cycle: number;
  readonly overlays: readonly NhRuntimeOverlayDebugEntry[];
  readonly motion?: NhRuntimeMotionDebugSnapshot;
  readonly manualOpponentPolicy?: readonly NhRuntimeManualOpponentPolicyDebugEntry[];
  readonly manualOpponentAudit?: readonly NhRuntimeManualOpponentTickAuditEntry[];
}

interface NhRuntimeManualOpponentPolicyDebugEntry {
  readonly tick: number;
  readonly controllerId: string | null;
  readonly action: string;
  readonly effectiveAction: string;
  readonly movementApplied: boolean;
  readonly movementBlockedReason: string | null;
  readonly nextRepositionTick: number | null;
  readonly localTile: RuntimeTile;
  readonly observedLocalTile: RuntimeTile;
  readonly opponentTile: RuntimeTile;
}

interface NhRuntimeManualOpponentRouteDebugEntry {
  readonly actorId: RuntimeActorId;
  readonly targetId: RuntimeActorId;
  readonly reason: string;
  readonly attackRange: number;
  readonly targetTile: RuntimeTile;
}

interface NhRuntimeManualOpponentTickAuditEntry {
  readonly tick: number;
  readonly controllerId: string | null;
  readonly action: string;
  readonly effectiveAction: string;
  readonly localBeforeMovementTile: RuntimeTile;
  readonly opponentBeforeMovementTile: RuntimeTile;
  readonly localAfterTickTile: RuntimeTile;
  readonly opponentAfterTickTile: RuntimeTile;
  readonly policyMovementApplied: boolean;
  readonly policyMovementBlockedReason: string | null;
  readonly policyMovedDx: number;
  readonly policyMovedDy: number;
  readonly localMovementConsumed: boolean;
  readonly opponentMovementConsumed: boolean;
  readonly preAttackRouteMoved: boolean;
  readonly routeRequests: readonly NhRuntimeManualOpponentRouteDebugEntry[];
}

interface NhRuntimeMotionDebugSnapshot {
  readonly timeMs: number;
  readonly clientCycle: number;
  readonly actors: readonly NhRuntimeMotionDebugActor[];
}

interface NhRuntimeMotionDebugActor {
  readonly actorId: RuntimeActorId;
  readonly sequenceName: RuntimeSequenceName;
  readonly sequenceMode?: NhSequencePlaybackMode;
  readonly actionSequenceKey?: string;
  readonly animationCycle?: number;
  readonly primaryFrame?: number;
  readonly primaryFrameCycle?: number;
  readonly tile: RuntimeTile;
  readonly renderTile: RuntimeTile;
  readonly world: { readonly x: number; readonly y: number; readonly z: number };
  readonly screen: { readonly x: number; readonly y: number; readonly depthClientUnits: number } | null;
  readonly movementFrame?: number;
  readonly movementFrameCycle?: number;
}

interface RuntimeOverlayAnchorData {
  readonly actorId: RuntimeActorId;
  readonly placement: NhActorOverlayPlacement;
}

interface RuntimeOverlayObject extends Object3D {
  userData: Object3D["userData"] & {
    nhRuntimeOverlayAnchor?: RuntimeOverlayAnchorData;
  };
}

interface RuntimeDomOverlaySprite {
  readonly key: string;
  readonly sheetId: RuntimeSpriteSheetId;
  readonly spriteId: number;
  readonly spriteFrame: number;
  readonly atlasImage: string;
  readonly atlasWidth: number;
  readonly atlasHeight: number;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
  readonly renderOrder: number;
}

interface RuntimeDomOverlay {
  readonly id: string;
  readonly actorId: RuntimeActorId;
  readonly spriteSheetId: RuntimeSpriteSheetId;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly renderOrder: number;
  readonly hitsplatScale?: number;
  readonly sprites: readonly RuntimeDomOverlaySprite[];
}

interface RuneliteFreezeTimerDomOverlay extends RuneliteFreezeTimerOverlaySnapshot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly renderOrder: number;
}

interface RuneliteFreezeTimerInfoBoxDomOverlay extends RuneliteFreezeTimerInfoBoxSnapshot {
  readonly atlasImage: string;
  readonly atlasWidth: number;
  readonly atlasHeight: number;
  readonly spriteX: number;
  readonly spriteY: number;
  readonly spriteWidth: number;
  readonly spriteHeight: number;
}

interface RunelitePlayerIndicatorDomOverlay {
  readonly id: string;
  readonly actorId: RuntimeActorId;
  readonly relation: RunelitePlayerIndicatorRelation;
  readonly label: string;
  readonly color: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly renderOrder: number;
}

interface RunelitePrayAgainstPlayerDomOverlay extends RunelitePrayAgainstPlayerOverlaySnapshot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly atlasImage: string;
  readonly atlasWidth: number;
  readonly atlasHeight: number;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly spriteLeft: number;
  readonly spriteTop: number;
  readonly spriteWidth: number;
  readonly spriteHeight: number;
  readonly renderOrder: number;
}

interface RuneliteTileIndicatorDomOverlay {
  readonly id: string;
  readonly kind: RuneliteTileIndicatorKind;
  readonly tile: RuntimeTile;
  readonly points: string;
  readonly strokeColor: string;
  readonly strokeWidth: number;
  readonly renderOrder: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

interface RunelitePrayerBarDomOverlay extends RunelitePrayerBarSnapshot {
  readonly id: string;
  readonly actorId: RuntimeActorId;
  readonly left: number;
  readonly top: number;
  readonly renderOrder: number;
}

interface RunelitePrayerFlickOrbDomOverlay extends RunelitePrayerFlickOrbSnapshot {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly renderOrder: number;
}

interface RuneliteAttackStylesDomOverlay extends RuneliteAttackStylesOverlaySnapshot {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly renderOrder: number;
}

interface RuneliteXpDropDamageDomOverlay {
  readonly id: string;
  readonly actorId: RuntimeActorId;
  readonly damage: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly renderOrder: number;
  readonly tickShow: number;
}

interface RuneliteXpDropActiveDroplet {
  readonly id: string;
  readonly hitId: string;
  readonly actorId: RuntimeActorId;
  readonly damage: number;
  readonly hpXp: number;
  readonly xpTotal: number;
  readonly xpDrops: readonly RuntimePlayerCombatXpDropDomValue[];
  readonly startClientCycle: number;
  readonly durationClientCycles: number;
}

interface RuneliteXpDropDomOverlay extends RuneliteXpDropActiveDroplet {
  readonly text: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly textWidth: number;
  readonly fontKey: string;
  readonly fontId: number | null;
  readonly fontArchiveName: string;
  readonly fontSheetId: RuntimeSpriteSheetId | null;
  readonly textSize: RuneliteXpDropConfigSnapshot["nativeTextSize"];
  readonly textSizeVarbit4693: number;
  readonly textScale: number;
  readonly moveDistance: number;
  readonly renderOrder: number;
  readonly displayMode: RuneliteXpDropConfigSnapshot["trainerDisplayMode"];
  readonly skillIcons: readonly RuneliteXpDropSkillIcon[];
}

interface RuntimePlayerCombatXpDropDomValue {
  readonly skillId: RuntimePlayerCombatXpSkillId;
  readonly xp: number;
}

interface RuneliteXpDropSkillIcon {
  readonly skillId: RuntimePlayerCombatXpSkillId;
  readonly path: string;
}

interface RuntimeGroundItem {
  readonly id: string;
  readonly itemId: number;
  readonly itemName: string;
  readonly quantity: number;
  readonly tile: RuntimeTile;
  readonly owner: "local-player";
  readonly droppedAtTick: number;
  readonly droppedAtMs: number;
}

interface RuneliteProjectedDomOverlay {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly renderOrder: number;
}

interface PendingGroundItemPickup {
  readonly groundItemId: string;
  readonly targetTile: RuntimeTile;
  readonly requestedAtTick: number;
}

interface RuneliteMouseHighlightHoverInput {
  readonly entries: readonly NhMenuEntry[];
  readonly region: RuneliteMouseHighlightTooltipRegion;
  readonly x: number;
  readonly y: number;
}

declare global {
  interface Window {
    __nhRuntimeDebug?: NhRuntimeDebugSnapshot;
    __nhActionSequenceApplyLog?: Array<{
      readonly atMs: number;
      readonly actorId: RuntimeActorId;
      readonly sequenceName: RuntimeSequenceName;
      readonly actionSequenceKey: string;
      readonly animationCycle: number;
      readonly sourceAnimationCycle: number;
      readonly primaryFrame?: number;
      readonly primaryFrameCycle?: number;
      readonly rewindSuppressed: boolean;
    }>;
  }
}

type RuntimeLoadState =
  | { readonly kind: "loading"; readonly message: string }
  | { readonly kind: "ready"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

interface NhClickCrossState {
  readonly x: number;
  readonly y: number;
  readonly color: NhClickCrossColor;
  readonly frame: number;
  readonly startedAt?: number;
  readonly sourceState?: number;
}

type NhSceneContextMenuEntry =
  | NhPlayerContextMenuEntry<RuntimeTile>
  | NhSceneObjectContextMenuEntry<RuntimeTile>;

interface NhGroundItemContextMenuEntry extends NhMenuEntry {
  readonly action: "ground-item-take" | "ground-item-examine";
  readonly groundItemId: string;
  readonly itemId: number;
  readonly itemName: string;
  readonly quantity: number;
  readonly targetTile: RuntimeTile;
}

interface NhSourceContextMenuEntry extends NhMenuEntry {
  readonly action: "source-menu-entry";
  readonly sourceIndex: number;
}

interface RuneliteOverlayConfigContextMenuEntry extends NhMenuEntry {
  readonly action: "runelite-overlay-config";
  readonly pluginId: string;
  readonly overlayTarget: string;
  readonly sourceOverlay: string;
  readonly sourceOverlayMenuOpcode: "RUNELITE_OVERLAY_CONFIG";
}

type NhXpDropOrbContextMenuEntry =
  | (NhMenuEntry & {
      readonly action: "xp-drop-orb-action";
      readonly xpDropAction: "toggle" | "setup";
      readonly actionIndex: 1 | 2;
      readonly command: NhXpDropOrbCommand;
    })
  | (NhMenuEntry & {
      readonly action: "xp-drop-text-size";
      readonly xpDropAction: "set-text-size";
      readonly textSize: RuneliteXpDropConfigSnapshot["nativeTextSize"];
    });

type NhHudWidgetContextMenuEntry =
  | (NhMenuEntry & {
      readonly action: "hud-widget-action";
      readonly widgetKind: "side-tab";
      readonly actionIndex: number;
      readonly command: NhSideTabCommand;
    })
  | (NhMenuEntry & {
      readonly action: "hud-widget-action";
      readonly widgetKind: "chatbox";
      readonly actionIndex: number;
      readonly command: NhChatboxButtonCommand;
    })
  | (NhMenuEntry & {
      readonly action: "hud-widget-action";
      readonly widgetKind:
        | "prayer-filtering-placeholder"
        | "prayer-reordering-toggle"
        | "spellbook-filtering-placeholder"
        | "spellbook-reordering-toggle";
      readonly actionIndex: number;
      readonly command: NhSideTabCommand;
      readonly enabled: boolean;
    });

type NhEquipmentItemContextMenuEntry = NhMenuEntry & {
  readonly action: "equipment-remove" | "equipment-action" | "equipment-examine";
  readonly actionIndex: number;
  readonly childId: number;
  readonly itemId: number;
  readonly itemName: string;
  readonly serverSlot: number;
  readonly slotId: string;
  readonly sourceActionText: string;
  readonly widgetId: number;
};

type NhOpponentInventoryInspectContextMenuEntry = NhMenuEntry & {
  readonly action: "opponent-inventory-inspect";
  readonly targetActorId: RuntimeActorId;
  readonly targetTile: RuntimeTile;
};

type NhContextMenuEntry =
  | NhSceneContextMenuEntry
  | NhInventoryContextMenuEntry
  | NhEquipmentItemContextMenuEntry
  | NhGroundItemContextMenuEntry
  | NhOpponentInventoryInspectContextMenuEntry
  | NhHudWidgetContextMenuEntry
  | NhXpDropOrbContextMenuEntry
  | RuneliteOverlayConfigContextMenuEntry
  | NhCancelContextMenuEntry
  | NhSourceContextMenuEntry;

interface NhCancelContextMenuEntry extends NhMenuEntry {
  readonly action: "cancel";
}

interface NhContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly sourceRect?: NhMenuRect;
  readonly source?: "client-view";
  readonly entries: readonly NhContextMenuEntry[];
}

type RuntimeCameraMode = keyof typeof NH_RUNTIME_CAMERA_PRESETS | "free";
type NhTileCommandSource = "scene-tile" | "scene-object" | "ground-item" | "minimap" | "context-menu";

interface QueuedPlayerCombatPacket {
  readonly kind: "attack" | "spell" | "special";
  readonly entry?: NhPlayerContextMenuEntry<RuntimeTile>;
  readonly specialCommand?: NhCombatSpecialCommand;
  readonly position: { readonly x: number; readonly y: number };
  readonly spellId?: RuntimePlayerCombatSpellId;
  readonly queuedAtMs: number;
  readonly readyAtMs: number;
}

interface RuntimeMouseCameraDragState extends NhMouseCameraState {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
}

const NH_CANCEL_CONTEXT_MENU_ENTRY: NhCancelContextMenuEntry = {
  action: "cancel",
  actionText: NH_CANCEL_ACTION_TEXT,
  targetText: "",
  opcode: NH_CANCEL_OPCODE,
  shiftClick: false
};

function withNhCancelContextMenuEntry(
  entries: readonly NhContextMenuEntry[]
): readonly NhContextMenuEntry[] {
  // Source: KeyHandler.method505() resets every client menu to a single Cancel
  // row before widgets/scene insert more rows through AttackOption.method2104().
  return [NH_CANCEL_CONTEXT_MENU_ENTRY, ...entries];
}

interface ManualOpponentPolicyTickGate {
  readonly shouldRun: boolean;
  readonly combatState: RuntimePlayerCombatState;
}

const initialClientCameraAngles = nhRuntimeCameraPreset("isometric");
const equipmentItemNameColorTag = "<col=ff9040>";
const equipmentItemDefaultActionOpcode = 57;
const equipmentItemHighActionOpcode = 1007;
const widgetHighActionOpcode = 1007;
const NH_CLIENT_CYCLE_MS = 20;
const NH_CLIENT_CYCLES_PER_GAME_TICK = NH_GAME_TICK_MS / NH_CLIENT_CYCLE_MS;
// Source-backed by Nh NanoClock.vmethod3511: the client may process up to 10 client cycles before one draw.
const NH_CLIENT_MAX_CYCLES_PER_RENDER_FRAME = 10;
// Browser timers can resume late after a busy frame; catch up bounded game ticks so the trainer hitches instead of stretching time.
const NH_GAME_TICK_CATCH_UP_LIMIT = 10;
const NH_TRAINER_ATTACK_SET_STORAGE_KEY = "nhTrainer.attackSet.v1";
const NH_AUTO_RETALIATE_STORAGE_KEY = "nhTrainer.autoRetaliate.v1";
const LEGACY_AUTO_RETALIATE_STORAGE_KEYS = ["source.autoRetaliate.v1"] as const;
const NH_TEMPORARY_SAVED_SETUP_STORAGE_KEY = "nhTrainer.temporaryNhStakeSetup.v1";
const NH_TRAINER_PVP_FIGHT_HISTORY_STORAGE_KEY = "nhTrainer.pvpFightHistory.v1";
const NH_TRAINER_BROWSER_CLIENT_WINDOW_STORAGE_KEY = "nhTrainer.browserClientWindow.v2";
const NH_TRAINER_PRAYER_REORDER_ENABLED_STORAGE_KEY = "nhTrainer.prayerReorder.enabled.v1";
const NH_TRAINER_PRAYER_REORDER_ORDER_STORAGE_KEY = "nhTrainer.prayerReorder.order.v1";
const NH_TRAINER_SPELLBOOK_REORDER_ENABLED_STORAGE_KEY = "nhTrainer.spellbookReorder.enabled.v1";
const NH_TRAINER_SPELLBOOK_REORDER_ORDERS_STORAGE_KEY = "nhTrainer.spellbookReorder.orders.v1";
const NH_TRAINER_MANUAL_START_PENDING_TICK = 1_000_000_000;
const NH_TRAINER_PVP_FIGHT_HISTORY_LIMIT = 50;
const BROWSER_CLIENT_WINDOW_TITLEBAR_HEIGHT = 24;
const BROWSER_CLIENT_WINDOW_MIN_WIDTH = 420;
const BROWSER_CLIENT_WINDOW_MIN_HEIGHT = 300;
const NH_DEV_SOCIAL_LISTS: NhSocialListsSnapshot = {
  loaded: true,
  friends: [
    {
      name: "Opponent",
      world: 1,
      rank: 0
    }
  ],
  ignores: []
};

function runtimePolicyRecentManualCombatSignal(state: RuntimePlayerCombatState): boolean {
  const earliestTick = state.tick - 12;
  return state.events.some((event) => {
    if (event.tick < earliestTick) {
      return false;
    }
    if (event.kind === "attack") {
      return runtimePolicyManualCombatPair(event.attackerId, event.defenderId);
    }
    if (event.kind === "hitsplat") {
      return runtimePolicyManualCombatPair(event.attackerId, event.targetActorId);
    }
    return false;
  });
}

function runtimePolicyRecentManualIncomingPressureSignal(state: RuntimePlayerCombatState): boolean {
  const earliestTick = state.tick - 12;
  return state.events.some((event) => {
    if (event.tick < earliestTick) {
      return false;
    }
    if (event.kind === "attack") {
      return event.attackerId === "local-player" && event.defenderId === "opponent";
    }
    if (event.kind === "hitsplat") {
      return event.attackerId === "local-player" && event.targetActorId === "opponent";
    }
    return false;
  });
}

function runtimePolicyRecentManualDirectCombatSignal(state: RuntimePlayerCombatState): boolean {
  const earliestTick = state.tick - 2;
  return state.events.some((event) => {
    if (event.tick < earliestTick) {
      return false;
    }
    if (event.kind === "attack") {
      return runtimePolicyManualCombatPair(event.attackerId, event.defenderId);
    }
    if (event.kind === "hitsplat") {
      return runtimePolicyManualCombatPair(event.attackerId, event.targetActorId);
    }
    return false;
  });
}

function runtimePolicyManualCombatPair(attackerId: RuntimeActorId, defenderId: RuntimeActorId): boolean {
  return (
    (attackerId === "local-player" && defenderId === "opponent") ||
    (attackerId === "opponent" && defenderId === "local-player")
  );
}
const NH_DEV_CLAN_CHAT: NhClanChatSnapshot = {
  active: true,
  displayName: "Nh",
  ownerName: "local-player",
  localRank: 7,
  minKickRank: 2,
  members: [
    {
      name: "local-player",
      world: 1,
      rank: 7,
      self: true,
      friend: false,
      ignored: false
    },
    {
      name: "Opponent",
      world: 1,
      rank: 0,
      self: false,
      friend: true,
      ignored: false
    }
  ]
};
const RUNELITE_XP_DROP_TEXT_SIZE_SPECS: Readonly<Record<RuneliteXpDropConfigSnapshot["nativeTextSize"], {
  readonly fontKey: string;
  readonly fontArchiveName: string;
  readonly textHeight: number;
  readonly varbit4693: number;
}>> = {
  Small: {
    fontKey: "plain11",
    fontArchiveName: "p11_full",
    textHeight: 16,
    varbit4693: 0
  },
  Medium: {
    fontKey: "plain12",
    fontArchiveName: "p12_full",
    textHeight: 25,
    varbit4693: 1
  },
  Large: {
    fontKey: "bold12",
    fontArchiveName: "b12_full",
    textHeight: 25,
    varbit4693: 2
  }
};
const RUNELITE_XP_DROP_FONT_SPECS: Readonly<Record<RuneliteXpDropConfigSnapshot["trainerFont"], {
  readonly fontKey: string;
  readonly fontArchiveName: string;
  readonly sourceTextSize: RuneliteXpDropConfigSnapshot["nativeTextSize"];
}>> = {
  "Plain 11": {
    fontKey: "plain11",
    fontArchiveName: "p11_full",
    sourceTextSize: "Small"
  },
  "Plain 12": {
    fontKey: "plain12",
    fontArchiveName: "p12_full",
    sourceTextSize: "Medium"
  },
  "Bold 12": {
    fontKey: "bold12",
    fontArchiveName: "b12_full",
    sourceTextSize: "Large"
  }
};
const RUNELITE_XP_DROP_TEXT_SIZE_OPTIONS = ["Small", "Medium", "Large"] as const;
const RUNELITE_XP_DROP_SKILL_ICONS: Readonly<Record<RuntimePlayerCombatXpSkillId, RuneliteXpDropSkillIcon>> = {
  attack: { skillId: "attack", path: "runelite-ui/skill_icons_small/attack.png" },
  strength: { skillId: "strength", path: "runelite-ui/skill_icons_small/strength.png" },
  defence: { skillId: "defence", path: "runelite-ui/skill_icons_small/defence.png" },
  ranged: { skillId: "ranged", path: "runelite-ui/skill_icons_small/ranged.png" },
  magic: { skillId: "magic", path: "runelite-ui/skill_icons_small/magic.png" },
  hitpoints: { skillId: "hitpoints", path: "runelite-ui/skill_icons_small/hitpoints.png" }
};
const RUNELITE_XP_DROP_SOURCE_WIDTH_PADDING = 3;
const RUNELITE_XP_DROP_PANEL_RIGHT = 2;
const RUNELITE_XP_DROP_PANEL_TOP = 2;
const RUNELITE_XP_DROP_TEXT_COLOR = "#ffff40";
const RUNELITE_XP_DROP_DURATION_CLIENT_CYCLES = 120;
const RUNELITE_XP_DROP_STACK_MIN_PANEL_HEIGHT = 100;
const NH_ACTOR_TILE_CLIENT_UNITS = 128;
const NH_ACTOR_ORIENTATION_UNITS = 2048;
const NH_ACTOR_TURN_SPEED_UNITS = 32;
const NH_ACTOR_TURN_ANIMATION_DELAY_TICKS = 25;
const RUNELITE_OVERLAY_MENU_OPCODE = 1501;
const RUNELITE_OVERLAY_CONFIG_MENU_OPCODE_SOURCE = "MenuOpcode.RUNELITE_OVERLAY(1501) wraps OverlayMenuEntry RUNELITE_OVERLAY_CONFIG";
const RUNELITE_FIGHT_START_OVERLAY_NAME = "TrainerStartOverlay";
const RUNELITE_FIGHT_START_OVERLAY_DRAG_SOURCE =
  "OverlayRenderer Alt key inOverlayDraggingMode; left drag setPreferredLocation; right click resetOverlay; mouse release saveOverlay";
const NH_CONTEXT_MENU_MOUSE_LEAVE_MARGIN = 10;

function runeliteXpDropTextSizeSpec(textSize: RuneliteXpDropConfigSnapshot["nativeTextSize"]) {
  return RUNELITE_XP_DROP_TEXT_SIZE_SPECS[textSize] ?? RUNELITE_XP_DROP_TEXT_SIZE_SPECS.Small;
}

function runeliteXpDropFontSpec(font: RuneliteXpDropConfigSnapshot["trainerFont"]) {
  return RUNELITE_XP_DROP_FONT_SPECS[font] ?? RUNELITE_XP_DROP_FONT_SPECS["Plain 11"];
}

function nhDevSocialListsAfterButton(
  current: NhSocialListsSnapshot,
  command: NhSocialButtonCommand
): NhSocialListsSnapshot {
  if (command.action === "switch") {
    return current;
  }

  const opponent = NH_DEV_SOCIAL_LISTS.friends[0];
  if (!opponent) {
    return current;
  }

  const hasFriend = current.friends.some((member) => member.name.toLowerCase() === opponent.name.toLowerCase());
  const hasIgnore = current.ignores.some((member) => member.name.toLowerCase() === opponent.name.toLowerCase());

  if (command.list === "friends" && command.action === "add") {
    // Nh FriendSystem.addFriend refuses names already ignored before sending FriendsHandler opcode 80.
    return hasFriend || hasIgnore ? current : { ...current, friends: [...current.friends, opponent] };
  }
  if (command.list === "friends" && command.action === "delete") {
    return hasFriend
      ? { ...current, friends: current.friends.filter((member) => member.name.toLowerCase() !== opponent.name.toLowerCase()) }
      : current;
  }
  if (command.list === "ignores" && command.action === "add") {
    // Nh FriendSystem.method900 refuses names on the friend list before sending FriendsHandler opcode 84.
    return hasIgnore || hasFriend ? current : { ...current, ignores: [...current.ignores, { ...opponent, world: 0 }] };
  }
  if (command.list === "ignores" && command.action === "delete") {
    return hasIgnore
      ? { ...current, ignores: current.ignores.filter((member) => member.name.toLowerCase() !== opponent.name.toLowerCase()) }
      : current;
  }
  return current;
}

const initialLocalPose: RuntimeActorPose =
  runtimeTimeline[0].actors.find((pose) => pose.actorId === "local-player") ?? runtimeTimeline[0].actors[0];
const initialOpponentPose: RuntimeActorPose =
  runtimeTimeline[0].actors.find((pose) => pose.actorId === "opponent") ?? runtimeTimeline[0].actors[1] ?? initialLocalPose;
const initialLocalOrientationUnits =
  initialLocalPose.orientationUnits ?? nhFacingDegreesToOrientationUnits(initialLocalPose.facingDegrees);
const initialLocalRotationUnits = initialLocalPose.rotationUnits ?? initialLocalOrientationUnits;
const initialOpponentOrientationUnits =
  initialOpponentPose.orientationUnits ?? nhFacingDegreesToOrientationUnits(initialOpponentPose.facingDegrees);
const initialOpponentRotationUnits = initialOpponentPose.rotationUnits ?? initialOpponentOrientationUnits;
const initialManualActor: ManualActorState = {
  tile: initialLocalPose.tile,
  renderTile: initialLocalPose.renderTile ?? initialLocalPose.tile,
  routeWaypoints: [],
  routeTraversalModes: [],
  serverRouteWaypoints: [],
  serverRouteTraversalModes: [],
  clientPosition: nhClientPositionFromRuntimeTile(initialLocalPose.renderTile ?? initialLocalPose.tile),
  lastMovementClientCycle: null,
  movementStallTicks: 0,
  sequencePathLengthAtStart: 0,
  activeSequenceKey: null,
  completedSequenceKey: null,
  primaryFrame: 0,
  primaryFrameCycle: 0,
  primarySequenceLoops: 0,
  primarySequenceCycle: 0,
  movementBlockedBySequence: false,
  movementFrame: 0,
  movementFrameCycle: 0,
  orientationUnits: initialLocalOrientationUnits,
  rotationUnits: initialLocalRotationUnits,
  turnTicks: 0,
  running: true,
  loadoutId: RUNTIME_NH_STAKE_LOADOUT_ID,
  appearance: runtimeAppearanceFromEquipmentItems(
    RUNTIME_NH_STAKE_EQUIPMENT_ITEMS,
    runtimeLoadoutAppearance(RUNTIME_NH_STAKE_LOADOUT_ID)
  ),
  sequenceName: "idle",
  facingDegrees: initialLocalPose.facingDegrees,
  markerLabel: "local control",
  animationCycle: 0
};
const initialManualOpponent: ManualActorState = {
  tile: initialOpponentPose.tile,
  renderTile: initialOpponentPose.renderTile ?? initialOpponentPose.tile,
  routeWaypoints: [],
  routeTraversalModes: [],
  serverRouteWaypoints: [],
  serverRouteTraversalModes: [],
  clientPosition: nhClientPositionFromRuntimeTile(initialOpponentPose.renderTile ?? initialOpponentPose.tile),
  lastMovementClientCycle: null,
  movementStallTicks: 0,
  sequencePathLengthAtStart: 0,
  activeSequenceKey: null,
  completedSequenceKey: null,
  primaryFrame: 0,
  primaryFrameCycle: 0,
  primarySequenceLoops: 0,
  primarySequenceCycle: 0,
  movementBlockedBySequence: false,
  movementFrame: 0,
  movementFrameCycle: 0,
  orientationUnits: initialOpponentOrientationUnits,
  rotationUnits: initialOpponentRotationUnits,
  turnTicks: 0,
  running: true,
  loadoutId: RUNTIME_NH_STAKE_LOADOUT_ID,
  appearance: runtimeAppearanceFromEquipmentItems(
    RUNTIME_NH_STAKE_EQUIPMENT_ITEMS,
    runtimeLoadoutAppearance(RUNTIME_NH_STAKE_LOADOUT_ID)
  ),
  sequenceName: "idle",
  facingDegrees: initialOpponentPose.facingDegrees,
  markerLabel: "opponent",
  animationCycle: 0
};
const initialRuntimePlayerCombatBaseState = createRuntimePlayerCombatState({
  localTile: initialManualActor.tile,
  opponentTile: initialManualOpponent.tile,
  localLoadoutId: initialManualActor.loadoutId,
  opponentLoadoutId: initialManualOpponent.loadoutId,
  localAttackSetIndex: typeof window === "undefined" ? 0 : (readStoredAttackSetIndex() ?? 0),
  localSupplies: runtimeNhStakeSupplies(),
  opponentSupplies: runtimeNhStakeSupplies(),
  combatStartTick: NH_TRAINER_MANUAL_START_PENDING_TICK
});
const initialRuntimePlayerCombatState = syncRuntimePlayerCombatStateToInput(initialRuntimePlayerCombatBaseState, {
  tiles: {
    "local-player": initialManualActor.tile,
    opponent: initialManualOpponent.tile
  },
  loadouts: {
    "local-player": RUNTIME_NH_STAKE_LOADOUT_ID,
    opponent: RUNTIME_NH_STAKE_LOADOUT_ID
  },
  equipment: {
    "local-player": RUNTIME_NH_STAKE_VISIBLE_EQUIPMENT,
    opponent: RUNTIME_NH_STAKE_VISIBLE_EQUIPMENT
  },
  gearProfiles: {
    "local-player": RUNTIME_NH_STAKE_GEAR_PROFILE,
    opponent: RUNTIME_NH_STAKE_GEAR_PROFILE
  }
});

function disposeObject(object: Object3D): void {
  object.traverse((node) => {
    const disposableNode = node as Object3D & {
      geometry?: { dispose: () => void };
      material?: ({ dispose: () => void; map?: { dispose: () => void } } | Array<{ dispose: () => void; map?: { dispose: () => void } }>);
    };

    disposableNode.geometry?.dispose();

    if (Array.isArray(disposableNode.material)) {
      for (const material of disposableNode.material) {
        material.map?.dispose();
        material.dispose();
      }
      return;
    }

    disposableNode.material?.map?.dispose();
    disposableNode.material?.dispose();
  });
}

function disposeGeometryAndMaterialsOnly(object: Object3D): void {
  object.traverse((node) => {
    const disposableNode = node as Object3D & {
      geometry?: { dispose: () => void };
      material?: ({ dispose: () => void } | Array<{ dispose: () => void }>);
    };

    disposableNode.geometry?.dispose();
    if (Array.isArray(disposableNode.material)) {
      for (const material of disposableNode.material) {
        material.dispose();
      }
      return;
    }
    disposableNode.material?.dispose();
  });
}

function createRuntimeBoundary(canvas: HTMLCanvasElement): RuntimeSceneBoundary {
  const scene = new Scene();
  scene.background = new Color(0x0e1216);

  const camera = new PerspectiveCamera(NH_CAMERA_DEFAULT_FOV_DEGREES, 1, 0.1, 1000);
  camera.position.set(0, 6, 8);
  camera.lookAt(0, 0, 0);

  // Source: RuneLite GPU anti-aliasing defaults to Disabled; avoid browser MSAA shimmer while moving.
  const renderer = new WebGLRenderer({ antialias: false, canvas, preserveDrawingBuffer: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(scene.background instanceof Color ? scene.background : new Color(0x0e1216), 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const arenaRoot = new Group();
  const groundItemRoot = new Group();
  const actorRoot = new Group();
  const eventRoot = new Group();
  const controlRoot = new Group();
  const actorSlots = new Map<RuntimeActorId, ActorRenderSlot>();
  const cameraRig: RuntimeCameraRig = {
    target: new Vector3(0, 0, 0),
    followTarget: "local-player",
    clientAngles: initialClientCameraAngles,
    zoom: NH_CAMERA_DEFAULT_ZOOM
  };

  for (const actor of runtimeActors) {
    const group = new Group();
    actorRoot.add(group);
    actorSlots.set(actor.id, {
      group,
      currentModelKey: null,
      currentActionSequenceKey: null,
      lastActionAnimationCycle: 0,
      lastActionPrimaryFrame: null,
      lastActionPrimaryFrameCycle: null,
      actionAnimationRewindCount: 0
    });
  }

  scene.add(arenaRoot);
  scene.add(groundItemRoot);
  scene.add(actorRoot);
  scene.add(eventRoot);
  scene.add(controlRoot);
  scene.add(new AmbientLight(0xffffff, 1.5));

  const keyLight = new DirectionalLight(0xffffff, 2.8);
  keyLight.position.set(3, 8, 5);
  scene.add(keyLight);

  return {
    scene,
    camera,
    renderer,
    arenaRoot,
    groundItemRoot,
    actorRoot,
    eventRoot,
    controlRoot,
    actorSlots,
    cameraRig,
    sceneTilePicker: null,
    fixedClientLayout: null,
    fixedClientCssLayout: null
  };
}

function applyRuntimeCameraMode(boundary: RuntimeSceneBoundary, mode: RuntimeCameraMode): void {
  if (mode === "free") {
    updateRuntimeCamera(boundary);
    return;
  }

  boundary.cameraRig.clientAngles = nhRuntimeCameraPreset(mode);
  updateRuntimeCamera(boundary);
}

function isRuntimeCameraMode(value: unknown): value is RuntimeCameraMode {
  return value === "isometric" || value === "north" || value === "south" || value === "top" || value === "free";
}

function isNhSpellbookId(value: unknown): value is NhSpellbookId {
  return value === "standard" || value === "ancient" || value === "lunar" || value === "arceuus";
}

function updateRuntimeCamera(boundary: RuntimeSceneBoundary): void {
  const { target, clientAngles, zoom } = boundary.cameraRig;
  const viewportHeight = boundary.fixedClientLayout?.viewport.rect.height ?? NH_CAMERA_DEFAULT_VIEWPORT_HEIGHT;
  const offset = nhClientSceneCameraOffset(clientAngles, viewportHeight, zoom);
  boundary.camera.position.set(
    target.x - offset.x,
    target.y + offset.y,
    target.z - offset.z
  );
  boundary.camera.lookAt(target.x, target.y, target.z);
}

function applyNhCameraProjection(camera: PerspectiveCamera): void {
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[0] *= -1;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

function applyRuneliteGpuPluginConfig(boundary: RuntimeSceneBoundary, gpuConfig: RuneliteGpuPluginConfigSnapshot): void {
  const uniforms = runeliteGpuUniformSnapshot(gpuConfig);
  const drawDistance = uniforms.drawDistance;
  const drawDistanceWorldUnits = drawDistance * NH_TILE_WORLD_UNITS;
  const effectiveDrawDistanceWorldUnits =
    (uniforms.effectiveDrawDistanceLocalUnits / RUNELITE_GPU_LOCAL_TILE_SIZE) * NH_TILE_WORLD_UNITS;
  const fogDepthWorldUnits = (uniforms.fogDepthLocalUnits / RUNELITE_GPU_LOCAL_TILE_SIZE) * NH_TILE_WORLD_UNITS;
  const fogNear = Math.max(0.1, effectiveDrawDistanceWorldUnits - fogDepthWorldUnits);
  const fogFar = Math.max(fogNear + 0.1, effectiveDrawDistanceWorldUnits);
  const canvas = boundary.renderer.domElement;

  canvas.dataset.runeliteGpuEnabled = String(gpuConfig.enabled);
  canvas.dataset.runeliteGpuDrawDistance = String(drawDistance);
  canvas.dataset.runeliteGpuDrawDistanceLocalUnits = String(uniforms.drawDistanceLocalUnits);
  canvas.dataset.runeliteGpuUseFog = String(uniforms.useFog);
  canvas.dataset.runeliteGpuFogDepth = String(uniforms.fogDepth);
  canvas.dataset.runeliteGpuFogCircularity = String(uniforms.fogCircularity);
  canvas.dataset.runeliteGpuFogDensity = String(uniforms.fogDensity);
  canvas.dataset.runeliteGpuEffectiveDrawDistanceLocalUnits = String(uniforms.effectiveDrawDistanceLocalUnits);
  canvas.dataset.runeliteGpuFogDepthLocalUnits = String(uniforms.fogDepthLocalUnits);
  canvas.dataset.runeliteGpuFogCornerRadiusLocalUnits = String(uniforms.fogCornerRadiusLocalUnits);
  canvas.dataset.runeliteGpuFogDensityUniform = String(uniforms.fogDensityUniform);
  canvas.dataset.runeliteGpuSmoothBanding = String(gpuConfig.smoothBanding);
  canvas.dataset.runeliteGpuSmoothBandingUniform = String(uniforms.smoothBandingUniform);
  canvas.dataset.runeliteGpuAntiAliasingMode = gpuConfig.antiAliasingMode;
  canvas.dataset.runeliteGpuAntiAliasingSamples = String(uniforms.antiAliasingSamples);
  canvas.dataset.runeliteGpuAnisotropicFilteringMode = gpuConfig.anisotropicFilteringMode;
  canvas.dataset.runeliteGpuAnisotropicFilteringSamples = String(uniforms.anisotropicFilteringSamples);
  canvas.dataset.runeliteGpuTextureAnisotropySamples = String(uniforms.textureAnisotropySamples);
  canvas.dataset.sourceGpuDrawDistance = "GpuPlugin.drawScene scene.setDrawDistance(drawDistance)";
  canvas.dataset.sourceGpuDrawDistanceUniform = "glUniform1i(uniDrawDistance, drawDistance * Perspective.LOCAL_TILE_SIZE)";
  canvas.dataset.sourceGpuFogUniforms = "GpuPlugin.draw glUniform fogDepth/fogCornerRadius/fogDensity";
  canvas.dataset.sourceGpuFogDepthUniform = "glUniform1f(uniFogDepth, this.fogDepth * 0.01f * effectiveDrawDistance)";
  canvas.dataset.sourceGpuFogCornerRadiusUniform = "glUniform1f(uniFogCornerRadius, this.fogCircularity * 0.01f * effectiveDrawDistance)";
  canvas.dataset.sourceGpuFogDensityUniform = "glUniform1f(uniFogDensity, this.fogDensity * 0.1f)";
  canvas.dataset.sourceGpuSmoothBandingUniform = "glUniform1f(uniSmoothBanding, this.smoothBanding ? 0f : 1f)";
  canvas.dataset.sourceGpuAntiAliasing = "GpuPlugin.draw AntiAliasingMode.getSamples";
  canvas.dataset.sourceGpuAnisotropicFiltering = "GpuPlugin.draw AnisotropicFilteringMode.getSamples";

  boundary.camera.far = gpuConfig.enabled ? Math.max(10, drawDistanceWorldUnits + 10) : 1000;
  applyNhCameraProjection(boundary.camera);

  if (gpuConfig.enabled && uniforms.useFog) {
    const backgroundColor = boundary.scene.background instanceof Color ? boundary.scene.background : new Color(0x0e1216);
    boundary.scene.fog = new Fog(backgroundColor, fogNear, fogFar);
  } else {
    boundary.scene.fog = null;
  }

  applyRuneliteTextureAnisotropy(boundary.scene, uniforms.textureAnisotropySamples);
}

function applyRuneliteAntiDragConfig(canvas: HTMLCanvasElement | null, antiDragConfig: RuneliteAntiDragConfigSnapshot): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteAntiDragEnabled = String(antiDragConfig.enabled);
  canvas.dataset.runeliteAntiDragAlwaysOn = String(antiDragConfig.alwaysOn);
  canvas.dataset.runeliteAntiDragToggleKeyBind = String(antiDragConfig.toggleKeyBind);
  canvas.dataset.runeliteAntiDragHoldKeyBind = String(antiDragConfig.holdKeyBind);
  canvas.dataset.runeliteAntiDragKey = antiDragConfig.key;
  canvas.dataset.runeliteAntiDragReqFocus = String(antiDragConfig.reqFocus);
  canvas.dataset.runeliteAntiDragOverlay = String(antiDragConfig.overlay);
  canvas.dataset.runeliteAntiDragOverlayColor = antiDragConfig.overlayColor;
  canvas.dataset.runeliteAntiDragChangeCursor = String(antiDragConfig.changeCursor);
  canvas.dataset.runeliteAntiDragCursorStyle = antiDragConfig.cursorStyle;
  canvas.dataset.runeliteAntiDragDelayClientTicks = String(antiDragConfig.dragDelayClientTicks);
  canvas.dataset.runeliteAntiDragHotkeyActive = String(antiDragConfig.hotkeyActive);
  canvas.dataset.runeliteAntiDragEffectiveDelayClientTicks = String(antiDragConfig.effectiveDragDelayClientTicks);
  canvas.dataset.runeliteAntiDragEffectiveDelayMs = String(
    Math.max(0, Math.trunc(antiDragConfig.effectiveDragDelayClientTicks)) * RUNELITE_CLIENT_TICK_MS
  );
  canvas.dataset.sourceAntiDragDefaultDelay = "AntiDragPlugin.DEFAULT_DELAY = 5";
  canvas.dataset.sourceAntiDragActiveDelay = "AntiDragPlugin client.setInventoryDragDelay(config.dragDelay())";
  canvas.dataset.sourceAntiDragToggleListener = "AntiDragPlugin toggleListener hotkeyPressed toggleDrag client.setInventoryDragDelay(config.dragDelay())";
  canvas.dataset.sourceAntiDragHoldListener =
    "AntiDragPlugin holdListener hotkeyPressed/hotkeyReleased client.setInventoryDragDelay(config.dragDelay()/DEFAULT_DELAY)";
  canvas.dataset.sourceAntiDragTickLength = "Constants.CLIENT_TICK_LENGTH = 20";
}

function applyRuneliteKeyRemappingConfig(
  canvas: HTMLCanvasElement | null,
  keyRemappingConfig: RuneliteKeyRemappingConfigSnapshot
): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteKeyRemappingEnabled = String(keyRemappingConfig.enabled);
  canvas.dataset.runeliteKeyRemappingHideDisplayName = String(keyRemappingConfig.hideDisplayName);
  canvas.dataset.runeliteKeyRemappingCameraRemap = String(keyRemappingConfig.cameraRemap);
  canvas.dataset.runeliteKeyRemappingCameraUp = keyRemappingConfig.up.key;
  canvas.dataset.runeliteKeyRemappingCameraDown = keyRemappingConfig.down.key;
  canvas.dataset.runeliteKeyRemappingCameraLeft = keyRemappingConfig.left.key;
  canvas.dataset.runeliteKeyRemappingCameraRight = keyRemappingConfig.right.key;
  canvas.dataset.runeliteKeyRemappingFkeyRemap = String(keyRemappingConfig.fkeyRemap);
  canvas.dataset.runeliteKeyRemappingF1 = keyRemappingConfig.f1.key;
  canvas.dataset.runeliteKeyRemappingF2 = keyRemappingConfig.f2.key;
  canvas.dataset.runeliteKeyRemappingF3 = keyRemappingConfig.f3.key;
  canvas.dataset.runeliteKeyRemappingF4 = keyRemappingConfig.f4.key;
  canvas.dataset.runeliteKeyRemappingF5 = keyRemappingConfig.f5.key;
  canvas.dataset.runeliteKeyRemappingF6 = keyRemappingConfig.f6.key;
  canvas.dataset.runeliteKeyRemappingF7 = keyRemappingConfig.f7.key;
  canvas.dataset.runeliteKeyRemappingF8 = keyRemappingConfig.f8.key;
  canvas.dataset.runeliteKeyRemappingF9 = keyRemappingConfig.f9.key;
  canvas.dataset.runeliteKeyRemappingF10 = keyRemappingConfig.f10.key;
  canvas.dataset.runeliteKeyRemappingF11 = keyRemappingConfig.f11.key;
  canvas.dataset.runeliteKeyRemappingF12 = keyRemappingConfig.f12.key;
  canvas.dataset.runeliteKeyRemappingEsc = keyRemappingConfig.esc.key;
  canvas.dataset.sourceKeyRemappingListener = runeliteKeyRemappingSourceListener();
  canvas.dataset.sourceKeyRemappingGroup = "KeyRemappingConfig @ConfigGroup(\"keyremapping\")";
  canvas.dataset.sourceKeyRemappingChat = "KeyRemappingPlugin lockChat/unlockChat Press Enter to Chat";
}

function applyNhGameKeybindConfig(
  canvas: HTMLCanvasElement | null,
  keybinds: NhGameKeybindSnapshot
): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.nhGameKeybindSource = NH_GAME_KEYBIND_SOURCE;
  canvas.dataset.nhGameKeybindEscapeCloses = String(keybinds.escapeCloses);
  for (const [tabId, slot] of Object.entries(keybinds.keySlotsByTabId)) {
    canvas.dataset[`nhGameKeybind${nhDatasetKey(tabId)}`] = String(slot);
  }
}

function nhDatasetKey(value: string): string {
  return value
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function applyRuneliteMouseHighlightConfig(
  canvas: HTMLCanvasElement | null,
  mouseHighlightConfig: RuneliteMouseHighlightConfigSnapshot
): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteMouseHighlightEnabled = String(mouseHighlightConfig.enabled);
  canvas.dataset.runeliteMouseHighlightMainTooltip = String(mouseHighlightConfig.mainTooltip);
  canvas.dataset.runeliteMouseHighlightUiTooltip = String(mouseHighlightConfig.uiTooltip);
  canvas.dataset.runeliteMouseHighlightChatboxTooltip = String(mouseHighlightConfig.chatboxTooltip);
  canvas.dataset.runeliteMouseHighlightHideSpells = String(mouseHighlightConfig.hideSpells);
  canvas.dataset.runeliteMouseHighlightHideCombat = String(mouseHighlightConfig.hideCombat);
  canvas.dataset.runeliteMouseHighlightRightClickOptionTooltip = String(mouseHighlightConfig.rightClickOptionTooltip);
  canvas.dataset.sourceMouseHighlightPlugin = "MouseHighlightPlugin startUp updateConfig adjustTips overlayManager.add";
  canvas.dataset.sourceMouseHighlightOverlay =
    "MouseHighlightOverlay render client.isMenuOpen client.getMenuEntries()[last] TooltipManager.addFront";
  canvas.dataset.sourceMouseHighlightTooltipOverlay =
    "TooltipOverlay OFFSET=24 PADDING=2 position TOOLTIP priority HIGHEST layer ALWAYS_ON_TOP";
  canvas.dataset.sourceMouseHighlightTipWidgets = "WidgetInfo.SPELL_TOOLTIP WidgetInfo.COMBAT_TOOLTIP setHidden";
}

function applyRuneliteAnimationSmoothingConfig(
  canvas: HTMLCanvasElement | null,
  animationSmoothingConfig: RuneliteAnimationSmoothingConfigSnapshot
): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteAnimationSmoothingEnabled = String(animationSmoothingConfig.enabled);
  canvas.dataset.runeliteAnimationSmoothingPlayers = String(animationSmoothingConfig.smoothPlayerAnimations);
  canvas.dataset.runeliteAnimationSmoothingNpcs = String(animationSmoothingConfig.smoothNpcAnimations);
  canvas.dataset.runeliteAnimationSmoothingObjects = String(animationSmoothingConfig.smoothObjectAnimations);
  canvas.dataset.runeliteAnimationSmoothingWidgets = String(animationSmoothingConfig.smoothWidgetAnimations);
  canvas.dataset.sourceAnimationSmoothingPlugin =
    "AnimationSmoothingPlugin update client.setInterpolatePlayerAnimations/Npc/Object/Widget";
  canvas.dataset.sourceAnimationSmoothingSequence =
    "SequenceDefinition interpolated path calls Model.interpolateFrames(frame,next,cycle,frameLength)";
}

function applyRuneliteFreezeTimersConfig(canvas: HTMLCanvasElement | null, freezeTimersConfig: RuneliteFreezeTimersConfigSnapshot): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteFreezeTimersEnabled = String(freezeTimersConfig.enabled);
  canvas.dataset.runeliteFreezeTimersShowPlayers = String(freezeTimersConfig.showPlayers);
  canvas.dataset.runeliteFreezeTimersShowNpcs = String(freezeTimersConfig.showNpcs);
  canvas.dataset.runeliteFreezeTimersFreezeTimers = String(freezeTimersConfig.freezeTimers);
  canvas.dataset.runeliteFreezeTimersTb = String(freezeTimersConfig.teleblockTimers);
  canvas.dataset.runeliteFreezeTimersVeng = String(freezeTimersConfig.vengeanceTimers);
  canvas.dataset.runeliteFreezeTimersXOffset = String(freezeTimersConfig.xOffset);
  canvas.dataset.runeliteFreezeTimersNoImage = String(freezeTimersConfig.noImage);
  canvas.dataset.runeliteFreezeTimersFontStyle = freezeTimersConfig.fontStyle;
  canvas.dataset.runeliteFreezeTimersTextSize = String(freezeTimersConfig.textSize);
  canvas.dataset.sourceFreezeTimersPlugin = "FreezeTimersPlugin.onSpotAnimationChanged PlayerSpellEffect.getFromSpotAnim";
  canvas.dataset.sourceFreezeTimersOverlay = "FreezeTimersOverlay setPriority(HIGHEST) setPosition(DYNAMIC) setLayer(UNDER_WIDGETS)";
  canvas.dataset.sourceFreezeTimersBarrage = "PlayerSpellEffect.BARRAGE spotAnim=369 lengthMs=19200";
  canvas.dataset.sourceFreezeTimersImmunity = "TimerType.FREEZE immunityMs=3000";
  canvas.dataset.sourceFreezeTimersPlacement = "actor.getCanvasImageLocation(image, 0) + xOffset; overlaysDrawn * 18";
}

function applyRuneliteTimersConfig(canvas: HTMLCanvasElement | null, timersConfig: RuneliteTimersConfigSnapshot): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteTimersEnabled = String(timersConfig.enabled);
  canvas.dataset.runeliteTimersShowFreezes = String(timersConfig.showFreezes);
  canvas.dataset.sourceTimersPlugin = "TimersPlugin onChatMessage(FROZEN_MESSAGE) createGameTimer(ICEBARRAGE)";
  canvas.dataset.sourceTimersIceBarrage = "GameTimer.ICEBARRAGE SpriteID.SPELL_ICE_BARRAGE duration=20s";
  canvas.dataset.sourceTimersFreezeCancel = "TimersPlugin.onGameTick removes freeze timer when local player moves";
}

function applyRunelitePvpToolsConfig(
  canvas: HTMLCanvasElement | null,
  pvpToolsConfig: RunelitePvpToolsConfigSnapshot,
  renderSelf: boolean
): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runelitePvpToolsEnabled = String(pvpToolsConfig.enabled);
  canvas.dataset.runelitePvpToolsRenderSelfHotkey = pvpToolsConfig.renderSelfHotkey;
  canvas.dataset.runelitePvpToolsRenderSelf = String(renderSelf);
  canvas.dataset.sourcePvpToolsRenderSelfListener =
    "PvpToolsPlugin renderselfHotkeyListener keyManager.registerKeyListener -> client.setRenderSelf(!client.getRenderSelf())";
}

function applyRuneliteSpecBarConfig(canvas: HTMLCanvasElement | null, specBarConfig: RuneliteSpecBarConfigSnapshot): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteSpecBarEnabled = String(specBarConfig.enabled);
  canvas.dataset.runeliteSpecBarDrawSpecbarAnyway = String(specBarConfig.drawSpecbarAnyway);
  canvas.dataset.sourceSpecBarPlugin = "SpecBarPlugin.onScriptCallbackEvent";
  canvas.dataset.sourceSpecBarScriptCallback = "drawSpecbarAnyway";
  canvas.dataset.sourceSpecBarStackMutation = "client.getIntStack()[client.getIntStackSize() - 1] = 1";
}

function applyRuneliteAttackStylesConfig(
  canvas: HTMLCanvasElement | null,
  attackStylesConfig: RuneliteAttackStylesConfigSnapshot
): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteAttackStylesEnabled = String(attackStylesConfig.enabled);
  canvas.dataset.runeliteAttackStylesAlwaysShowStyle = String(attackStylesConfig.alwaysShowStyle);
  canvas.dataset.runeliteAttackStylesWarnForDefence = String(attackStylesConfig.warnForDefence);
  canvas.dataset.runeliteAttackStylesWarnForAttack = String(attackStylesConfig.warnForAttack);
  canvas.dataset.runeliteAttackStylesWarnForStrength = String(attackStylesConfig.warnForStrength);
  canvas.dataset.runeliteAttackStylesWarnForRanged = String(attackStylesConfig.warnForRanged);
  canvas.dataset.runeliteAttackStylesWarnForMagic = String(attackStylesConfig.warnForMagic);
  canvas.dataset.runeliteAttackStylesHideAutoRetaliate = String(attackStylesConfig.hideAutoRetaliate);
  canvas.dataset.runeliteAttackStylesRemoveWarnedStyles = String(attackStylesConfig.removeWarnedStyles);
  canvas.dataset.sourceAttackStylesPlugin = "AttackStylesPlugin startUp overlayManager.add(overlay)";
  canvas.dataset.sourceAttackStylesOverlay = "AttackStylesOverlay setPosition(ABOVE_CHATBOX_RIGHT)";
  canvas.dataset.sourceAttackStylesVars = "VarPlayer.ATTACK_STYLE Varbits.EQUIPPED_WEAPON_TYPE Varbits.DEFENSIVE_CASTING_MODE";
  canvas.dataset.sourceAttackStylesWeaponType = "WeaponType.getWeaponType(equippedWeaponType).getAttackStyles()";
}

function applyRuneliteEntityHiderConfig(canvas: HTMLCanvasElement | null, entityHiderConfig: RuneliteEntityHiderConfigSnapshot): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteEntityHiderEnabled = String(entityHiderConfig.enabled);
  canvas.dataset.runeliteEntityHiderIsHidingEntities = String(entityHiderConfig.isHidingEntities);
  canvas.dataset.runeliteEntityHiderHidePlayers = String(entityHiderConfig.hidePlayers);
  canvas.dataset.runeliteEntityHiderHidePlayers2d = String(entityHiderConfig.hidePlayers2D);
  canvas.dataset.runeliteEntityHiderHideSpecificPlayers = entityHiderConfig.hideSpecificPlayers;
  canvas.dataset.runeliteEntityHiderHideAttackers = String(entityHiderConfig.hideAttackers);
  canvas.dataset.runeliteEntityHiderHideLocalPlayer = String(entityHiderConfig.hideLocalPlayer);
  canvas.dataset.runeliteEntityHiderHideLocalPlayer2d = String(entityHiderConfig.hideLocalPlayer2D);
  canvas.dataset.runeliteEntityHiderHideFriends = String(entityHiderConfig.hideFriends);
  canvas.dataset.runeliteEntityHiderHideClanMates = String(entityHiderConfig.hideClanMates);
  canvas.dataset.runeliteEntityHiderHideNpcs = String(entityHiderConfig.hideNPCs);
  canvas.dataset.runeliteEntityHiderHideNpcs2d = String(entityHiderConfig.hideNPCs2D);
  canvas.dataset.runeliteEntityHiderHideNpcsNames = entityHiderConfig.hideNPCsNames;
  canvas.dataset.runeliteEntityHiderHideDeadNpcs = String(entityHiderConfig.hideDeadNPCs);
  canvas.dataset.runeliteEntityHiderHideNpcsOnDeath = entityHiderConfig.hideNPCsOnDeath;
  canvas.dataset.runeliteEntityHiderHideProjectiles = String(entityHiderConfig.hideProjectiles);
  canvas.dataset.sourceEntityHiderGroup = RUNELITE_ENTITY_HIDER_CONFIG_GROUP;
  canvas.dataset.sourceEntityHiderUpdateConfig = RUNELITE_ENTITY_HIDER_SOURCE_UPDATE_CONFIG;
  canvas.dataset.sourceEntityHiderCsv = RUNELITE_ENTITY_HIDER_SOURCE_CSV;
  canvas.dataset.sourceEntityHiderRegionException = String(RUNELITE_ENTITY_HIDER_CASTLE_WARS_REGION_ID);
}

function applyRuneliteHideUnderConfig(canvas: HTMLCanvasElement | null, hideUnderConfig: RuneliteHideUnderConfigSnapshot): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteHideUnderEnabled = String(hideUnderConfig.enabled);
  canvas.dataset.runeliteHideUnderIsHidingEntities = String(hideUnderConfig.isHidingEntities);
  canvas.dataset.runeliteHideUnderAllowedRegion = String(hideUnderConfig.inAllowedRegion);
  canvas.dataset.runeliteHideUnderTargetTimerTicks = String(hideUnderConfig.targetTimerTicks);
  canvas.dataset.sourceHideUnderPlugin = RUNELITE_HIDE_UNDER_SOURCE_DESCRIPTOR;
  canvas.dataset.sourceHideUnderTimer = RUNELITE_HIDE_UNDER_SOURCE_TARGET_TIMER;
  canvas.dataset.sourceHideUnderVisibility = RUNELITE_HIDE_UNDER_SOURCE_LOCAL_VISIBILITY;
  canvas.dataset.sourceHideUnderRegion = RUNELITE_HIDE_UNDER_SOURCE_REGION_GUARD;
  canvas.dataset.sourceHideUnderRegionException = String(RUNELITE_HIDE_UNDER_CASTLE_WARS_REGION_ID);
}

function applyRunelitePrayAgainstPlayerConfig(
  canvas: HTMLCanvasElement | null,
  prayAgainstPlayerConfig: RunelitePrayAgainstPlayerConfigSnapshot
): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runelitePrayAgainstPlayerEnabled = String(prayAgainstPlayerConfig.enabled);
  canvas.dataset.runelitePrayAgainstPlayerAttackerColor = prayAgainstPlayerConfig.attackerPlayerColor;
  canvas.dataset.runelitePrayAgainstPlayerPotentialColor = prayAgainstPlayerConfig.potentialPlayerColor;
  canvas.dataset.runelitePrayAgainstPlayerAttackerTargetTimeout = String(prayAgainstPlayerConfig.attackerTargetTimeoutSeconds);
  canvas.dataset.runelitePrayAgainstPlayerPotentialTargetTimeout = String(prayAgainstPlayerConfig.potentialTargetTimeoutSeconds);
  canvas.dataset.runelitePrayAgainstPlayerDrawTargetPrayAgainst = String(prayAgainstPlayerConfig.drawTargetPrayAgainst);
  canvas.dataset.runelitePrayAgainstPlayerDrawPotentialTargetPrayAgainst = String(
    prayAgainstPlayerConfig.drawPotentialTargetPrayAgainst
  );
  canvas.dataset.runelitePrayAgainstPlayerDrawTargetPrayAgainstPrayerTab = String(
    prayAgainstPlayerConfig.drawTargetPrayAgainstPrayerTab
  );
  canvas.dataset.sourcePrayAgainstPlayerPlugin = RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_PLUGIN;
  canvas.dataset.sourcePrayAgainstPlayerOverlay = RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_OVERLAY;
  canvas.dataset.sourcePrayAgainstPlayerWeaponType = RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_WEAPON_TYPE;
  canvas.dataset.sourcePrayAgainstPlayerIcon = RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_ICON;
  canvas.dataset.sourcePrayAgainstPlayerPrayerTabOverlay = RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_PRAYER_TAB_OVERLAY;
}

function applyRuneliteStatusBarsConfig(canvas: HTMLCanvasElement | null, statusBarsConfig: RuneliteStatusBarsConfigSnapshot): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteStatusBarsEnabled = String(statusBarsConfig.enabled);
  canvas.dataset.runeliteStatusBarsEnableCounter = String(statusBarsConfig.enableCounter);
  canvas.dataset.runeliteStatusBarsEnableSkillIcon = String(statusBarsConfig.enableSkillIcon);
  canvas.dataset.runeliteStatusBarsEnableRestorationBars = String(statusBarsConfig.enableRestorationBars);
  canvas.dataset.runeliteStatusBarsLeftBarMode = statusBarsConfig.leftBarMode;
  canvas.dataset.runeliteStatusBarsRightBarMode = statusBarsConfig.rightBarMode;
  canvas.dataset.runeliteStatusBarsToggleRestorationBars = String(statusBarsConfig.toggleRestorationBars);
  canvas.dataset.runeliteStatusBarsHideStatusBarDelay = String(statusBarsConfig.hideStatusBarDelay);
  canvas.dataset.sourceStatusBarsPlugin = "StatusBarsPlugin startUp overlayManager.add(overlay)";
  canvas.dataset.sourceStatusBarsOverlay = "StatusBarsOverlay setPosition(DYNAMIC) setLayer(ABOVE_WIDGETS)";
  canvas.dataset.sourceStatusBarsViewport = "Viewport.FIXED WidgetInfo.FIXED_VIEWPORT_INTERFACE_CONTAINER";
  canvas.dataset.sourceStatusBarsBarRenderer = "BarRenderer BAR_WIDTH=20 HEIGHT=252 COLOR_BAR_BG";
}

function applyRuneliteStatusOrbsConfig(canvas: HTMLCanvasElement | null, statusOrbsConfig: RuneliteStatusOrbsConfigSnapshot): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteStatusOrbsEnabled = String(statusOrbsConfig.enabled);
  canvas.dataset.runeliteStatusOrbsDynamicHpHeart = String(statusOrbsConfig.dynamicHpHeart);
  canvas.dataset.runeliteStatusOrbsShowHitpoints = String(statusOrbsConfig.showHitpoints);
  canvas.dataset.runeliteStatusOrbsShowWhenNoChange = String(statusOrbsConfig.showWhenNoChange);
  canvas.dataset.runeliteStatusOrbsNotifyBeforeHpRegenSeconds = String(statusOrbsConfig.notifyBeforeHpRegenSeconds);
  canvas.dataset.runeliteStatusOrbsShowSpecial = String(statusOrbsConfig.showSpecial);
  canvas.dataset.runeliteStatusOrbsShowRun = String(statusOrbsConfig.showRun);
  canvas.dataset.runeliteStatusOrbsReplaceOrbText = String(statusOrbsConfig.replaceOrbText);
  canvas.dataset.sourceStatusOrbsPlugin = "StatusOrbsPlugin onGameTick SPEC_REGEN_TICKS=50 NORMAL_HP_REGEN_TICKS=100";
  canvas.dataset.sourceStatusOrbsOverlay = "StatusOrbsOverlay setPosition(DYNAMIC) setLayer(ABOVE_WIDGETS)";
  canvas.dataset.sourceStatusOrbsArc = RUNELITE_STATUS_ORBS_ARC_SOURCE;
  canvas.dataset.sourceStatusOrbsStroke = RUNELITE_STATUS_ORBS_STROKE_SOURCE;
}

function applyRunelitePrayerConfig(canvas: HTMLCanvasElement | null, prayerConfig: RunelitePrayerConfigSnapshot): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runelitePrayerEnabled = String(prayerConfig.enabled);
  canvas.dataset.runelitePrayerFlickLocation = prayerConfig.prayerFlickLocation;
  canvas.dataset.runelitePrayerFlickAlwaysOn = String(prayerConfig.prayerFlickAlwaysOn);
  canvas.dataset.runelitePrayerIndicator = String(prayerConfig.prayerIndicator);
  canvas.dataset.runelitePrayerIndicatorOverheads = String(prayerConfig.prayerIndicatorOverheads);
  canvas.dataset.runelitePrayerShowDoseIndicator = String(prayerConfig.showPrayerDoseIndicator);
  canvas.dataset.runelitePrayerShowStatistics = String(prayerConfig.showPrayerStatistics);
  canvas.dataset.runelitePrayerShowBar = String(prayerConfig.showPrayerBar);
  canvas.dataset.runelitePrayerHideIfNotPraying = String(prayerConfig.hideIfNotPraying);
  canvas.dataset.runelitePrayerHideIfOutOfCombat = String(prayerConfig.hideIfOutOfCombat);
  canvas.dataset.sourcePrayerPlugin = "PrayerPlugin startUp overlayManager.add(flickOverlay/doseOverlay/barOverlay)";
  canvas.dataset.sourcePrayerBarOverlay = "PrayerBarOverlay setPosition(DYNAMIC) setPriority(HIGH) setLayer(ABOVE_SCENE)";
  canvas.dataset.sourcePrayerFlickOverlay = "PrayerFlickOverlay setPosition(DYNAMIC) setLayer(ABOVE_WIDGETS)";
  canvas.dataset.sourcePrayerBarSize = `${RUNELITE_PRAYER_BAR_WIDTH}x${RUNELITE_PRAYER_BAR_HEIGHT}`;
  canvas.dataset.sourcePrayerBarColors = `${RUNELITE_PRAYER_BAR_BACKGROUND_RGBA}/${RUNELITE_PRAYER_BAR_FILL_RGBA}/${RUNELITE_PRAYER_FLICK_HELP_RGBA}`;
}

function applyRuneliteOpponentInfoConfig(canvas: HTMLCanvasElement | null, opponentInfoConfig: RuneliteOpponentInfoConfigSnapshot): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteOpponentInfoEnabled = String(opponentInfoConfig.enabled);
  canvas.dataset.runeliteOpponentInfoLookupOnInteraction = String(opponentInfoConfig.lookupOnInteraction);
  canvas.dataset.runeliteOpponentInfoHitpointsDisplayStyle = opponentInfoConfig.hitpointsDisplayStyle;
  canvas.dataset.runeliteOpponentInfoShowOpponentsOpponent = String(opponentInfoConfig.showOpponentsOpponent);
  canvas.dataset.runeliteOpponentInfoShowAttackersMenu = String(opponentInfoConfig.showAttackersMenu);
  canvas.dataset.runeliteOpponentInfoShowAttackingMenu = String(opponentInfoConfig.showAttackingMenu);
  canvas.dataset.runeliteOpponentInfoAttackingColor = opponentInfoConfig.attackingColor;
  canvas.dataset.runeliteOpponentInfoShowHitpointsMenu = String(opponentInfoConfig.showHitpointsMenu);
  canvas.dataset.sourceOpponentInfoPlugin = "OpponentInfoPlugin InteractingChanged lastOpponent WAIT=5s overlayManager.add";
  canvas.dataset.sourceOpponentInfoOverlay = "OpponentInfoOverlay setPosition(TOP_LEFT) setPriority(HIGH)";
  canvas.dataset.sourceOpponentInfoPanel = "PanelComponent border=(2,2,2,2) gap=(0,2)";
  canvas.dataset.sourceOpponentInfoProgress = "ProgressBarComponent HP_GREEN HP_RED LabelDisplayMode";
}

function applyRunelitePlayerIndicatorsConfig(canvas: HTMLCanvasElement | null, playerIndicatorsConfig: RunelitePlayerIndicatorsConfigSnapshot): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runelitePlayerIndicatorsEnabled = String(playerIndicatorsConfig.enabled);
  canvas.dataset.runelitePlayerIndicatorsHighlightOwnPlayer = String(playerIndicatorsConfig.highlightOwnPlayer);
  canvas.dataset.runelitePlayerIndicatorsOwnPlayerColor = playerIndicatorsConfig.ownPlayerColor;
  canvas.dataset.runelitePlayerIndicatorsHighlightTargets = String(playerIndicatorsConfig.highlightTargets);
  canvas.dataset.runelitePlayerIndicatorsTargetColor = playerIndicatorsConfig.targetColor;
  canvas.dataset.runelitePlayerIndicatorsShowCombatLevel = String(playerIndicatorsConfig.showCombatLevel);
  canvas.dataset.runelitePlayerIndicatorsPlayerSkull = String(playerIndicatorsConfig.playerSkull);
  canvas.dataset.runelitePlayerIndicatorsHighlightOtherPlayers = String(playerIndicatorsConfig.highlightOtherPlayers);
  canvas.dataset.runelitePlayerIndicatorsOtherPlayerColor = playerIndicatorsConfig.otherPlayerColor;
  canvas.dataset.sourcePlayerIndicatorsPlugin = "PlayerIndicatorsPlugin startUp overlayManager.add(playerIndicatorsOverlay/minimapOverlay)";
  canvas.dataset.sourcePlayerIndicatorsOverlay = "PlayerIndicatorsOverlay setPosition(DYNAMIC) setPriority(MED)";
  canvas.dataset.sourcePlayerIndicatorsMinimapOverlay = "PlayerIndicatorsMinimapOverlay setLayer(ABOVE_WIDGETS) setPosition(DYNAMIC) setPriority(HIGH)";
  canvas.dataset.sourcePlayerIndicatorsService = "PlayerIndicatorsService forEachPlayer relation order self/friend/clan/team/target/other";
  canvas.dataset.sourcePlayerIndicatorsLocations = RUNELITE_PLAYER_INDICATORS_DEFAULT_LOCATIONS.join(",");
}

function applyRuneliteTileIndicatorsConfig(canvas: HTMLCanvasElement | null, tileIndicatorsConfig: RuneliteTileIndicatorsConfigSnapshot): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteTileIndicatorsEnabled = String(tileIndicatorsConfig.enabled);
  canvas.dataset.runeliteTileIndicatorsHighlightDestinationTile = String(tileIndicatorsConfig.highlightDestinationTile);
  canvas.dataset.runeliteTileIndicatorsDestinationColor = tileIndicatorsConfig.highlightDestinationColor;
  canvas.dataset.runeliteTileIndicatorsThinDestinationTile = String(tileIndicatorsConfig.thinDestinationTile);
  canvas.dataset.runeliteTileIndicatorsHighlightCurrentTile = String(tileIndicatorsConfig.highlightCurrentTile);
  canvas.dataset.runeliteTileIndicatorsCurrentColor = tileIndicatorsConfig.highlightCurrentColor;
  canvas.dataset.runeliteTileIndicatorsThinCurrentTile = String(tileIndicatorsConfig.thinCurrentTile);
  canvas.dataset.runeliteTileIndicatorsHighlightHoveredTile = String(tileIndicatorsConfig.highlightHoveredTile);
  canvas.dataset.runeliteTileIndicatorsHoveredColor = tileIndicatorsConfig.highlightHoveredColor;
  canvas.dataset.runeliteTileIndicatorsThinHoveredTile = String(tileIndicatorsConfig.thinHoveredTile);
  canvas.dataset.sourceTileIndicatorsPlugin = "TileIndicatorsPlugin startUp updateConfig overlayManager.add(overlay)";
  canvas.dataset.sourceTileIndicatorsOverlay = "TileIndicatorsOverlay render client.getSelectedSceneTile client.getLocalDestinationLocation client.getLocalPlayer().getWorldLocation";
  canvas.dataset.sourceTileIndicatorsProjection = "Perspective.getCanvasTilePoly(client, dest)";
}

function applyRuneliteBoostsConfig(canvas: HTMLCanvasElement | null, boostsConfig: RuneliteBoostsConfigSnapshot): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteBoostsEnabled = String(boostsConfig.enabled);
  canvas.dataset.runeliteBoostsDisplayBoosts = boostsConfig.displayBoosts;
  canvas.dataset.runeliteBoostsRelativeBoost = String(boostsConfig.useRelativeBoost);
  canvas.dataset.runeliteBoostsDisplayInfoboxes = String(boostsConfig.displayInfoboxes);
  canvas.dataset.runeliteBoostsDisplayIcons = String(boostsConfig.displayIcons);
  canvas.dataset.runeliteBoostsBoldIconFont = String(boostsConfig.boldIconFont);
  canvas.dataset.runeliteBoostsDisplayNextBuffChange = boostsConfig.displayNextBuffChange;
  canvas.dataset.runeliteBoostsDisplayNextDebuffChange = boostsConfig.displayNextDebuffChange;
  canvas.dataset.runeliteBoostsBoostThreshold = String(boostsConfig.boostThreshold);
  canvas.dataset.runeliteBoostsGroupNotifications = String(boostsConfig.groupNotifications);
  canvas.dataset.sourceBoostsPlugin = "BoostsPlugin startUp overlayManager.add(boostsOverlay/combatIconsOverlay)";
  canvas.dataset.sourceBoostsOverlay = "BoostsOverlay setPosition(TOP_LEFT) setPriority(MED)";
  canvas.dataset.sourceBoostsCombatIconsOverlay = "CombatIconsOverlay setPosition(TOP_LEFT) setPriority(MED)";
  canvas.dataset.sourceBoostsSkills = RUNELITE_BOOSTS_COMBAT_SKILL_ORDER.map((skill) => skill.sourceSkill).join(",");
}

function applyRuneliteInfoBoxConfig(canvas: HTMLCanvasElement | null, infoBoxConfig: RuneliteInfoBoxConfigSnapshot): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteInfoBoxVertical = String(infoBoxConfig.vertical);
  canvas.dataset.runeliteInfoBoxWrap = String(infoBoxConfig.wrap);
  canvas.dataset.runeliteInfoBoxSize = String(infoBoxConfig.size);
  canvas.dataset.sourceInfoBoxOverlay = "InfoBoxOverlay setPosition(TOP_LEFT) PanelComponent background=null border=empty gap=(1,1)";
  canvas.dataset.sourceInfoBoxConfig = "RuneLiteConfig infoBoxVertical/infoBoxWrap/infoBoxSize";
  canvas.dataset.sourceInfoBoxManager = "InfoBoxManager updateInfoBoxImage Math.max(2, runeLiteConfig.infoBoxSize())";
}

function applyRuneliteXpDropConfig(canvas: HTMLCanvasElement | null, xpDropConfig: RuneliteXpDropConfigSnapshot): void {
  if (!canvas) {
    return;
  }

  canvas.dataset.runeliteXpDropEnabled = String(xpDropConfig.enabled);
  canvas.dataset.runeliteXpDropHideSkillIcons = String(xpDropConfig.hideSkillIcons);
  canvas.dataset.runeliteXpDropFakeDelay = String(xpDropConfig.fakeXpDropDelay);
  canvas.dataset.runeliteXpDropDamageMode = xpDropConfig.showDamageDrops;
  canvas.dataset.runeliteXpDropDamageColor = xpDropConfig.damageColor;
  canvas.dataset.runeliteXpDropTrainerDisplayMode = xpDropConfig.trainerDisplayMode;
  const textSizeSpec = runeliteXpDropTextSizeSpec(xpDropConfig.nativeTextSize);
  const fontSpec = runeliteXpDropFontSpec(xpDropConfig.trainerFont);
  canvas.dataset.runeliteXpDropNativeTextSize = xpDropConfig.nativeTextSize;
  canvas.dataset.runeliteXpDropNativeTextSizeVarbit4693 = String(textSizeSpec.varbit4693);
  canvas.dataset.runeliteXpDropNativeTextSizeFont = textSizeSpec.fontArchiveName;
  canvas.dataset.runeliteXpDropNativeTextSizeHeight = String(textSizeSpec.textHeight);
  canvas.dataset.runeliteXpDropTrainerFont = xpDropConfig.trainerFont;
  canvas.dataset.runeliteXpDropTrainerFontArchive = fontSpec.fontArchiveName;
  canvas.dataset.runeliteXpDropTrainerTextSize = String(xpDropConfig.trainerTextSize);
  canvas.dataset.runeliteXpDropTrainerMoveDistance = String(xpDropConfig.trainerMoveDistance);
  canvas.dataset.sourceXpDropPlugin = "XpDropPlugin ExperienceChanged ScriptCallbackEvent hpXpGained";
  canvas.dataset.sourceXpDropOverlay = "XpDropOverlay setPosition(DYNAMIC) setPriority(MED)";
  canvas.dataset.sourceXpDropDamageRatio = "HITPOINT_RATIO = 1.33";
  canvas.dataset.sourceXpDropCombatXp = "CombatUtils.addXp damage*4 attackType split + Hitpoints damage*1.33; TargetSpell.addMagicXp baseXp + damage*2";
  canvas.dataset.sourceXpDropClientScripts = "xpdrops_stattransmit xpdrops_setdropsize xpdrops_setposition xpdrops_dropletmove";
  canvas.dataset.sourceXpDropNativeTextSize = "XpCounter child 51 Config.XP_DROPS_SIZE varbit4693 -> xpdrops_redraw p11_full/p12_full/b12_full";
  canvas.dataset.sourceXpDropPlacement = "opponent.getCanvasTextLocation(graphics, damageStr, opponent.getLogicalHeight() + 50)";
  canvas.dataset.sourceXpDropTickShow = "tickShow = 3";
  delete canvas.dataset.runeliteXpDropTrainerHitsplatScale;
  delete canvas.dataset.trainerExtensionHitsplatScale;
}

function applyRuneliteTextureAnisotropy(root: Object3D, samples: number): void {
  root.traverse((node) => {
    const materialSource = (node as Object3D & { material?: Material | Material[] }).material;
    const materials = Array.isArray(materialSource) ? materialSource : materialSource ? [materialSource] : [];
    for (const material of materials) {
      const map = (material as Material & { map?: Texture | null }).map;
      if (!map) {
        continue;
      }
      map.anisotropy = samples;
      map.needsUpdate = true;
    }
  });
}

function advanceRuntimeCameraAnglesClientCycle(
  boundary: RuntimeSceneBoundary,
  keys: NhCameraKeyState,
  mouseCamera: RuntimeMouseCameraDragState | null = null
): RuntimeMouseCameraDragState | null {
  if (mouseCamera) {
    const update = updateNhCameraAnglesFromMouseDrag(boundary.cameraRig.clientAngles, mouseCamera, mouseCamera);
    boundary.cameraRig.clientAngles = update.angles;
    return {
      ...mouseCamera,
      ...update.mouse
    };
  }

  if (isNhCameraKeyHeld(keys) || isNhCameraMoving(boundary.cameraRig.clientAngles)) {
    boundary.cameraRig.clientAngles = updateNhCameraAngles(
      boundary.cameraRig.clientAngles,
      keys
    );
  }
  return null;
}

function updateRuntimeCameraFollowTarget(boundary: RuntimeSceneBoundary): void {
  if (boundary.cameraRig.followTarget === "free") {
    return;
  }

  const slot = boundary.actorSlots.get(boundary.cameraRig.followTarget);
  if (!slot) {
    return;
  }

  const viewportHeight = boundary.fixedClientLayout?.viewport.rect.height ?? NH_CAMERA_DEFAULT_VIEWPORT_HEIGHT;
  const targetY = slot.group.position.y + nhCameraFollowHeightSceneUnits(boundary.cameraRig.zoom, viewportHeight);
  boundary.cameraRig.target.set(
    smoothNhCameraFocusAxis(boundary.cameraRig.target.x, slot.group.position.x),
    targetY,
    smoothNhCameraFocusAxis(boundary.cameraRig.target.z, slot.group.position.z)
  );
}

function resizeRuntimeBoundary(boundary: RuntimeSceneBoundary, canvas: HTMLCanvasElement): NhFixedClientCssLayout | null {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);

  boundary.renderer.setSize(width, height, false);
  const fixedLayout = boundary.fixedClientLayout;
  boundary.fixedClientCssLayout = fixedLayout ? scaleNhFixedClientLayout(fixedLayout, { width, height }) : null;
  if (!fixedLayout || !boundary.fixedClientCssLayout) {
    return null;
  }

  const cameraRect = boundary.fixedClientCssLayout.viewportRect;
  boundary.camera.aspect = cameraRect.width / cameraRect.height;
  boundary.camera.fov = nhViewportZoomToFovDegrees(fixedLayout.viewport.rect.height, fixedLayout.viewport.zoom);
  applyNhCameraProjection(boundary.camera);
  return boundary.fixedClientCssLayout;
}

function renderRuntimeBoundary(boundary: RuntimeSceneBoundary): void {
  const canvas = boundary.renderer.domElement;
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  boundary.renderer.setScissorTest(false);
  boundary.renderer.setViewport(0, 0, width, height);
  boundary.renderer.clear(true, true, true);
  const viewportRect = boundary.fixedClientCssLayout?.viewportRect;
  if (!viewportRect) {
    return;
  }

  const viewportY = Math.max(0, height - viewportRect.y - viewportRect.height);
  boundary.renderer.setViewport(viewportRect.x, viewportY, viewportRect.width, viewportRect.height);
  boundary.renderer.setScissor(viewportRect.x, viewportY, viewportRect.width, viewportRect.height);
  boundary.renderer.setScissorTest(true);
  boundary.renderer.render(boundary.scene, boundary.camera);
  boundary.renderer.setScissorTest(false);
}

function manualActorFromSnapshot(
  snapshot: RuntimeSceneSnapshot,
  actorId: RuntimeActorId = "local-player",
  markerLabel = actorId === "local-player" ? "local control" : "opponent"
): ManualActorState {
  const localPose = snapshot.actors.find((pose) => pose.actorId === actorId) ?? snapshot.actors[0];
  const orientationUnits = localPose.orientationUnits ?? nhFacingDegreesToOrientationUnits(localPose.facingDegrees);
  const rotationUnits = localPose.rotationUnits ?? orientationUnits;
  return {
    tile: localPose.tile,
    renderTile: localPose.renderTile ?? localPose.tile,
    routeWaypoints: [],
    routeTraversalModes: [],
    serverRouteWaypoints: [],
    serverRouteTraversalModes: [],
    clientPosition: null,
    lastMovementClientCycle: null,
    movementStallTicks: 0,
    sequencePathLengthAtStart: 0,
    activeSequenceKey: null,
    completedSequenceKey: null,
    primaryFrame: 0,
    primaryFrameCycle: 0,
    primarySequenceLoops: 0,
    primarySequenceCycle: 0,
    movementBlockedBySequence: false,
    movementFrame: 0,
    movementFrameCycle: 0,
    orientationUnits,
    rotationUnits,
    turnTicks: 0,
    running: snapshot.hud.running ?? true,
    loadoutId: localPose.loadoutId,
    appearance: localPose.appearance,
    sequenceName: "idle",
    facingDegrees: localPose.facingDegrees,
    markerLabel,
    animationCycle: 0
  };
}

function snapManualActorToCollision(actor: ManualActorState, collision: NhSceneCollision): ManualActorState {
  const tile = collision.snapTile(actor.tile);
  return {
    ...actor,
    tile,
    renderTile: tile,
    clientPosition: nhClientPositionFromRuntimeTile(tile),
    routeWaypoints: [],
    routeTraversalModes: [],
    serverRouteWaypoints: [],
    serverRouteTraversalModes: [],
    movementBlockedBySequence: false
  };
}

function teleportManualActorToTile(actor: ManualActorState, tile: RuntimeTile): ManualActorState {
  return {
    ...actor,
    tile,
    renderTile: tile,
    clientPosition: nhClientPositionFromRuntimeTile(tile),
    routeWaypoints: [],
    routeTraversalModes: [],
    serverRouteWaypoints: [],
    serverRouteTraversalModes: [],
    movementBlockedBySequence: false,
    movementStallTicks: 0,
    sequenceName: "idle"
  };
}

function routeManualActor(
  actor: ManualActorState,
  destinationTile: RuntimeTile,
  collision: NhSceneCollision,
  objectPlacement: NhArenaObjectPlacement | undefined,
  now: number
): ManualActorRouteResult {
  const startTile = collision.snapTile(actor.tile);
  const destination = collision.snapTile(destinationTile);
  const routeSegment = objectPlacement
    ? findNhObjectRouteWaypoints(startTile, objectPlacement, collision)
    : findNhTileRouteWaypoints(startTile, destination, collision);
  const routePath = expandNhManualRoutePath(startTile, routeSegment, collision);
  const serverRoute = setNhManualServerRoutePath(routePath);
  const reached = objectPlacement
    ? nhSceneObjectRouteReached(startTile, objectPlacement, collision)
    : sameNhTile(startTile, destination);
  const clientPosition = manualActorRouteClientPosition(actor, startTile);
  const lastMovementClientCycle = Math.floor(now / NH_CLIENT_CYCLE_MS);
  const settlementWaypoints = nhClientSettlementWaypoints(clientPosition, startTile);
  // Source: TargetRoute.beforeMovement() recomputes the entity route from the
  // current server tile each tick before Movement.process() consumes steps.
  // Do not carry an older visual target-route tail into the new route.
  const routeWaypoints = settlementWaypoints;
  const routeTraversalModes = settlementWaypoints.map(() => actor.running ? 2 : 1);
  if (serverRoute.serverRouteWaypoints.length === 0) {
    return {
      actor: {
        ...actor,
        tile: startTile,
        renderTile: actor.renderTile,
        clientPosition,
        lastMovementClientCycle,
        routeWaypoints,
        routeTraversalModes,
        serverRouteWaypoints: [],
        serverRouteTraversalModes: [],
        movementStallTicks: actor.movementStallTicks,
        sequenceName: routeWaypoints.length > 0 ? actor.sequenceName : "idle"
      },
      reached
    };
  }

  return {
    actor: {
      ...actor,
      tile: startTile,
      renderTile: actor.renderTile,
      clientPosition,
      lastMovementClientCycle,
      routeWaypoints,
      routeTraversalModes,
      serverRouteWaypoints: serverRoute.serverRouteWaypoints,
      serverRouteTraversalModes: serverRoute.serverRouteTraversalModes,
      movementStallTicks: actor.movementStallTicks,
      sequenceName: actor.sequenceName
    },
    reached: true
  };
}

function routeManualActorToTarget(
  actor: ManualActorState,
  targetTile: RuntimeTile,
  attackRange: number,
  collision: NhSceneCollision,
  now: number,
  preserveVisualSettlement = true
): ManualActorRouteResult {
  const startTile = collision.snapTile(actor.tile);
  const routeSegment = findNhTargetRouteWaypoints(startTile, targetTile, attackRange, collision);
  const routePath = expandNhManualRoutePath(startTile, routeSegment, collision);
  const serverRoute = setNhManualServerRoutePath(routePath);
  const reached = nhSceneTargetRouteReached(startTile, targetTile, attackRange, collision);
  const clientPosition = manualActorRouteClientPosition(actor, startTile);
  const lastMovementClientCycle = Math.floor(now / NH_CLIENT_CYCLE_MS);
  const settlementWaypoints = nhClientSettlementWaypoints(clientPosition, startTile);
  // Source: RouteFinder.route() rewrites Movement.readOffset/writeOffset from
  // the actor's current server tile on each TargetRoute.beforeMovement() pass.
  // TargetRoute-driven melee/range/mage routes consume their first server step
  // before PlayerCombat.attack(); when that caller immediately advances the
  // server route, do not visually settle back to the previous tile first.
  const routeWaypoints = preserveVisualSettlement ? settlementWaypoints : [];
  const routeTraversalModes = routeWaypoints.map(() => actor.running ? 2 : 1);
  if (serverRoute.serverRouteWaypoints.length === 0) {
    return {
      actor: {
        ...actor,
        tile: startTile,
        renderTile: actor.renderTile,
        clientPosition,
        lastMovementClientCycle,
        routeWaypoints,
        routeTraversalModes,
        serverRouteWaypoints: [],
        serverRouteTraversalModes: [],
        movementStallTicks: actor.movementStallTicks,
        sequenceName: routeWaypoints.length > 0 ? actor.sequenceName : "idle"
      },
      reached
    };
  }

  return {
    actor: {
      ...actor,
      tile: startTile,
      renderTile: actor.renderTile,
      clientPosition,
      lastMovementClientCycle,
      routeWaypoints,
      routeTraversalModes,
      serverRouteWaypoints: serverRoute.serverRouteWaypoints,
      serverRouteTraversalModes: serverRoute.serverRouteTraversalModes,
      movementStallTicks: actor.movementStallTicks,
      sequenceName: actor.sequenceName
    },
    reached: true
  };
}

function manualActorRouteClientPosition(actor: ManualActorState, startTile: RuntimeTile): RuntimeClientPosition {
  return actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile ?? startTile);
}

function nhClientSettlementWaypoints(
  clientPosition: RuntimeClientPosition,
  authoritativeTile: RuntimeTile
): readonly RuntimeTile[] {
  const targetPosition = nhClientPositionFromRuntimeTile(authoritativeTile);
  if (clientPosition.x === targetPosition.x && clientPosition.z === targetPosition.z) {
    return [];
  }

  const waypoints: RuntimeTile[] = [];
  let x = clientPosition.x;
  let z = clientPosition.z;
  while ((x !== targetPosition.x || z !== targetPosition.z) && waypoints.length < 9) {
    x = nhMoveClientAxis(x, targetPosition.x, NH_ACTOR_TILE_CLIENT_UNITS);
    z = nhMoveClientAxis(z, targetPosition.z, NH_ACTOR_TILE_CLIENT_UNITS);
    waypoints.push(runtimeTileFromNhClientPosition({ x, z }));
  }
  return waypoints;
}

function expandNhManualRoutePath(
  startTile: RuntimeTile,
  routeSegment: readonly RuntimeTile[],
  collision: NhSceneCollision
): readonly RuntimeTile[] {
  const path: RuntimeTile[] = [];
  let currentTile = collision.snapTile(startTile);
  for (const waypoint of routeSegment) {
    while (!sameNhTile(currentTile, waypoint)) {
      const nextTile = nhStepTowardWaypoint(currentTile, waypoint);
      if (!collision.canStep(currentTile, nextTile)) {
        return path;
      }
      path.push(nextTile);
      currentTile = nextTile;
    }
  }
  return path;
}

function setNhManualServerRoutePath(
  routePath: readonly RuntimeTile[]
): Pick<ManualActorState, "serverRouteWaypoints" | "serverRouteTraversalModes"> {
  if (routePath.length === 0) {
    return {
      serverRouteWaypoints: [],
      serverRouteTraversalModes: []
    };
  }

  return {
    serverRouteWaypoints: routePath,
    serverRouteTraversalModes: routePath.map(() => 1)
  };
}

function advanceManualActorServerRouteTick(actor: ManualActorState): ManualActorState {
  if (actor.serverRouteWaypoints.length === 0) {
    return actor;
  }
  const sourceTickStepCount = actor.running && actor.serverRouteWaypoints.length > 1 ? 2 : 1;
  const enqueueCount = Math.min(sourceTickStepCount, actor.serverRouteWaypoints.length);
  const enqueuedWaypoints = actor.serverRouteWaypoints.slice(0, enqueueCount);
  const traversalMode = sourceTickStepCount > 1 ? 2 : 1;
  const routeWaypoints = enqueueManualActorClientPathSteps(actor.routeWaypoints, enqueuedWaypoints);
  const routeTraversalModes = enqueueManualActorClientTraversalModes(
    actor.routeTraversalModes,
    enqueueCount,
    traversalMode
  );
  return {
    ...actor,
    tile: enqueuedWaypoints[enqueuedWaypoints.length - 1] ?? actor.tile,
    routeWaypoints,
    routeTraversalModes,
    serverRouteWaypoints: actor.serverRouteWaypoints.slice(enqueueCount),
    serverRouteTraversalModes: actor.serverRouteTraversalModes.slice(enqueueCount)
  };
}

function enqueueManualActorClientPathSteps(
  current: readonly RuntimeTile[],
  nextSteps: readonly RuntimeTile[]
): readonly RuntimeTile[] {
  let queued = [...current];
  for (const step of nextSteps) {
    if (queued.length >= 9) {
      queued = queued.slice(1);
    }
    queued.push(step);
  }
  return queued;
}

function enqueueManualActorClientTraversalModes(
  current: readonly number[],
  nextStepCount: number,
  traversalMode: number
): readonly number[] {
  let queued = [...current];
  for (let index = 0; index < nextStepCount; index += 1) {
    if (queued.length >= 9) {
      queued = queued.slice(1);
    }
    queued.push(traversalMode);
  }
  return queued;
}

function nhStepTowardWaypoint(fromTile: RuntimeTile, waypoint: RuntimeTile): RuntimeTile {
  const deltaX = Math.sign(Math.round((waypoint.x - fromTile.x) / NH_TILE_WORLD_UNITS));
  const deltaZ = Math.sign(Math.round((waypoint.z - fromTile.z) / NH_TILE_WORLD_UNITS));
  return {
    x: fromTile.x + deltaX * NH_TILE_WORLD_UNITS,
    z: fromTile.z + deltaZ * NH_TILE_WORLD_UNITS
  };
}

function sameNhTile(left: RuntimeTile, right: RuntimeTile): boolean {
  return left.x === right.x && left.z === right.z;
}

function runtimeSequenceIsMovement(sequenceName: RuntimeSequenceName): boolean {
  return sequenceName === "walk" ||
    sequenceName === "run" ||
    sequenceName === "turn" ||
    sequenceName === "walk_back" ||
    sequenceName === "walk_left" ||
    sequenceName === "walk_right" ||
    sequenceName.endsWith("_walk") ||
    sequenceName.endsWith("_turn") ||
    sequenceName.endsWith("_walk_back") ||
    sequenceName.endsWith("_walk_left") ||
    sequenceName.endsWith("_walk_right") ||
    sequenceName.endsWith("_run");
}

function runtimeSequenceIsWeaponReady(sequenceName: RuntimeSequenceName): boolean {
  return sequenceName.endsWith("_ready");
}

function manualActorHasPendingMovement(actor: ManualActorState): boolean {
  return actor.routeWaypoints.length > 0 || actor.serverRouteWaypoints.length > 0;
}

function clearManualActorMovementRoute(actor: ManualActorState): ManualActorState {
  // Source: Entity.freeze() calls Movement.reset(), which clears queued steps without rewriting Position.
  // The client still has to settle smoothly to
  // that last accepted server tile, otherwise the next post-freeze route starts
  // from a hidden authoritative tile and visibly snaps.
  const clientPosition = actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile);
  const settlementWaypoints = nhClientSettlementWaypoints(clientPosition, actor.tile);
  return {
    ...actor,
    renderTile: runtimeTileFromNhClientPosition(clientPosition),
    routeWaypoints: settlementWaypoints,
    routeTraversalModes: settlementWaypoints.map(() => actor.running ? 2 : 1),
    serverRouteWaypoints: [],
    serverRouteTraversalModes: [],
    clientPosition,
    movementStallTicks: 0,
    sequencePathLengthAtStart: 0,
    movementBlockedBySequence: false,
    sequenceName: runtimeSequenceIsMovement(actor.sequenceName) ? "idle" : actor.sequenceName
  };
}

function stopManualActorMovementIfMovementGated(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState,
  tick: number
): ManualActorState {
  return movementGate(combatActor.locks, tick).blocked ? clearManualActorMovementRoute(actor) : actor;
}

function syncManualActorServerTileToCombatActor(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState
): ManualActorState {
  if (sameNhTile(actor.tile, combatActor.tile)) {
    return actor;
  }

  // Source: Entity.freeze() calls Movement.reset() during the earlier PID
  // player's process. If the visual/manual tick had already staged a later
  // actor's step, snap the authoritative server tile back and let the client
  // settle to it instead of leaving an impossible frozen-under position.
  return clearManualActorMovementRoute({
    ...actor,
    tile: combatActor.tile
  });
}

function preAttackRouteManualActorToCombatTarget(input: {
  readonly actorId: RuntimeActorId;
  readonly actor: ManualActorState;
  readonly combatActor: RuntimePlayerCombatActorState;
  readonly targetActorId: RuntimeActorId;
  readonly targetActor: ManualActorState;
  readonly targetCombatActor: RuntimePlayerCombatActorState;
  readonly collision: NhSceneCollision;
  readonly tick: number;
  readonly now: number;
  readonly movedThisTick: boolean;
}): ManualActorState {
  if (
    input.movedThisTick ||
    input.combatActor.targetId !== input.targetActorId ||
    isRuntimePlayerCombatActorDead(input.combatActor, input.tick) ||
    isRuntimePlayerCombatActorDead(input.targetCombatActor, input.tick)
  ) {
    return input.actor;
  }

  const profile = runtimePlayerCombatTargetRouteProfile(input.actorId, input.combatActor);
  if (movementGate(input.combatActor.locks, input.tick).blocked) {
    return clearManualActorMovementRoute(input.actor);
  }

  if (nhSceneTargetRouteReached(input.actor.tile, input.targetActor.tile, profile.attackRange, input.collision)) {
    return input.actor;
  }

  // Source: Nh Player.process() runs combat.preAttack(), TargetRoute.beforeMovement(), movement.process(),
  // TargetRoute.afterMovement(), then combat.attack(); target-route movement is consumed before the attack gate,
  // even when the first step has not reached attack range yet.
  const routed = routeManualActorToTarget(input.actor, input.targetActor.tile, profile.attackRange, input.collision, input.now, false);
  return advanceManualActorServerRouteTick(routed.actor);
}

function runtimeCombatProjectileLineOfSight(input: {
  readonly actorId: RuntimeActorId;
  readonly actor: ManualActorState;
  readonly combatActor: RuntimePlayerCombatActorState;
  readonly targetActor: ManualActorState;
  readonly collision: NhSceneCollision;
}): boolean {
  const profile = runtimePlayerCombatTargetRouteProfile(input.actorId, input.combatActor);
  return profile.melee || nhSceneProjectileRouteClear(input.actor.tile, input.targetActor.tile, input.collision);
}

function runtimeManualPolicyCanAttackSignal(input: {
  readonly attacker: RuntimePlayerCombatActorState;
  readonly target: RuntimePlayerCombatActorState;
  readonly tick: number;
  readonly collision: NhSceneCollision | null;
}): boolean {
  if (!canAttackThroughLock(input.attacker.locks, input.tick)) {
    return false;
  }

  if (!input.collision) {
    return true;
  }

  // Source: PlayerCombat.canAttack() delegates player-vs-player legality to
  // Wilderness.allowAttack(); in the trainer this is the combat-tile listener
  // check, not an attack-timer/range/line-of-sight gate.
  return (
    nhNhBotCombatTileAllowed(input.collision.sceneToWorldTile(input.attacker.tile)) &&
    nhNhBotCombatTileAllowed(input.collision.sceneToWorldTile(input.target.tile))
  );
}

function runtimeLoadoutWeaponTypeId(
  loadoutId: RuntimeLoadoutId,
  equipmentDefinitions: NhInventoryEquipmentDefinitionStore
): string | null {
  const weaponItemId = nhLoadouts[loadoutId].equipment.weapon?.itemId;
  return weaponItemId === undefined ? null : equipmentDefinitions.get(weaponItemId)?.weaponType ?? null;
}

function nhWeaponRenderSequenceName(
  loadoutId: RuntimeLoadoutId,
  renderAnimationIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  equipmentDefinitions: NhInventoryEquipmentDefinitionStore,
  weaponTypeDefinitions: NhWeaponTypeDefinitionStore,
  actorSequenceDefinitions: NhActorSequenceDefinitionStore
): RuntimeSequenceName {
  const weaponTypeId = runtimeLoadoutWeaponTypeId(loadoutId, equipmentDefinitions);
  const sequenceId = weaponTypeId ? weaponTypeDefinitions.get(weaponTypeId)?.renderAnimations[renderAnimationIndex] : undefined;
  return nhRuntimeSequenceNameForId(sequenceId, actorSequenceDefinitions) ?? (
    renderAnimationIndex === 1 ? "turn" :
      renderAnimationIndex === 2 ? "walk" :
        renderAnimationIndex === 3 ? "walk_back" :
          renderAnimationIndex === 4 ? "walk_left" :
            renderAnimationIndex === 5 ? "walk_right" :
              renderAnimationIndex === 6 ? "run" : "idle"
  );
}

function manualActorBaseSequenceName(
  sequenceName: RuntimeSequenceName,
  loadoutId?: RuntimeLoadoutId,
  equipmentDefinitions: NhInventoryEquipmentDefinitionStore = new Map(),
  weaponTypeDefinitions: NhWeaponTypeDefinitionStore = new Map(),
  actorSequenceDefinitions: NhActorSequenceDefinitionStore = createNhActorSequenceDefinitionStore(null)
): RuntimeSequenceName {
  if (
    runtimeSequenceIsWeaponReady(sequenceName) ||
    sequenceName.endsWith("_turn") ||
    sequenceName.endsWith("_walk") ||
    sequenceName.endsWith("_walk_back") ||
    sequenceName.endsWith("_walk_left") ||
    sequenceName.endsWith("_walk_right") ||
    sequenceName.endsWith("_run")
  ) {
    return sequenceName;
  }
  if (!loadoutId) {
    return runtimeSequenceIsMovement(sequenceName) ? sequenceName : "idle";
  }
  if (sequenceName === "turn") {
    return nhWeaponRenderSequenceName(loadoutId, 1, equipmentDefinitions, weaponTypeDefinitions, actorSequenceDefinitions);
  }
  if (sequenceName === "walk") {
    return nhWeaponRenderSequenceName(loadoutId, 2, equipmentDefinitions, weaponTypeDefinitions, actorSequenceDefinitions);
  }
  if (sequenceName === "walk_back") {
    return nhWeaponRenderSequenceName(loadoutId, 3, equipmentDefinitions, weaponTypeDefinitions, actorSequenceDefinitions);
  }
  if (sequenceName === "walk_left") {
    return nhWeaponRenderSequenceName(loadoutId, 4, equipmentDefinitions, weaponTypeDefinitions, actorSequenceDefinitions);
  }
  if (sequenceName === "walk_right") {
    return nhWeaponRenderSequenceName(loadoutId, 5, equipmentDefinitions, weaponTypeDefinitions, actorSequenceDefinitions);
  }
  if (sequenceName === "run") {
    return nhWeaponRenderSequenceName(loadoutId, 6, equipmentDefinitions, weaponTypeDefinitions, actorSequenceDefinitions);
  }
  return nhWeaponRenderSequenceName(loadoutId, 0, equipmentDefinitions, weaponTypeDefinitions, actorSequenceDefinitions);
}

function manualActorVisibleSequenceName(actor: ManualActorState): RuntimeSequenceName {
  if (actor.movementBlockedBySequence || actor.routeWaypoints.length === 0 || !nhSequenceIsReadyMovement(actor.sequenceName)) {
    return actor.sequenceName;
  }

  return nhMovementSequenceNameFromOrientation(actor);
}

function nhAdvanceMovementFrameCursor(
  actor: ManualActorState,
  movementSequenceName: RuntimeSequenceName,
  animationFixtures: NhAnimationFixtures | null
): ManualActorState {
  const sequence = animationFixtures?.sequences.get(movementSequenceName);
  if (!sequence || sequence.frames.length === 0) {
    return actor;
  }

  let movementFrame = Math.max(0, Math.trunc(actor.movementFrame));
  let movementFrameCycle = Math.max(0, Math.trunc(actor.movementFrameCycle)) + 1;
  const frameLength = movementFrame < sequence.frames.length
    ? Math.max(1, sequence.frames[movementFrame].lengthClientCycles)
    : 1;

  if (movementFrame < sequence.frames.length && movementFrameCycle > frameLength) {
    movementFrameCycle = 1;
    movementFrame += 1;
  }

  if (movementFrame >= sequence.frames.length) {
    movementFrame = 0;
    movementFrameCycle = 0;
  }

  return {
    ...actor,
    movementFrame,
    movementFrameCycle
  };
}

function nhMovementFrameCursor(actor: ManualActorState): NhSequenceFrameCursorOverride {
  return {
    frameIndex: actor.movementFrame,
    frameCycle: actor.movementFrameCycle
  };
}

function runtimePlayerCombatActionActive(
  combatActor: RuntimePlayerCombatActorState,
  combatState: RuntimePlayerCombatState
): boolean {
  return combatActor.actionSequenceName !== null && combatState.tick < combatActor.actionUntilTick;
}

function nhClientPositionFromRuntimeTile(tile: RuntimeTile): RuntimeClientPosition {
  return {
    x: Math.round((tile.x / NH_TILE_WORLD_UNITS) * NH_ACTOR_TILE_CLIENT_UNITS),
    z: Math.round((tile.z / NH_TILE_WORLD_UNITS) * NH_ACTOR_TILE_CLIENT_UNITS)
  };
}

function runtimeTileFromNhClientPosition(position: RuntimeClientPosition): RuntimeTile {
  return {
    x: Number(((position.x / NH_ACTOR_TILE_CLIENT_UNITS) * NH_TILE_WORLD_UNITS).toFixed(6)),
    z: Number(((position.z / NH_ACTOR_TILE_CLIENT_UNITS) * NH_TILE_WORLD_UNITS).toFixed(6))
  };
}

function normalizeNhOrientationUnits(units: number): number {
  const integerUnits = Number.isFinite(units) ? Math.trunc(units) : 0;
  return ((integerUnits % NH_ACTOR_ORIENTATION_UNITS) + NH_ACTOR_ORIENTATION_UNITS) % NH_ACTOR_ORIENTATION_UNITS;
}

function nhFacingDegreesToOrientationUnits(degrees: number): number {
  return normalizeNhOrientationUnits((degrees * NH_ACTOR_ORIENTATION_UNITS) / 360 + 1024);
}

function nhActorModelRotationRadiansFromFacingDegrees(degrees: number): number {
  const orientationUnits = nhFacingDegreesToOrientationUnits(degrees);
  return (orientationUnits * Math.PI * 2) / NH_ACTOR_ORIENTATION_UNITS;
}

function nhOrientationUnitsToFacingDegrees(units: number): number {
  const degrees = ((normalizeNhOrientationUnits(units) - 1024) * 360) / NH_ACTOR_ORIENTATION_UNITS;
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

function nhOrientationUnitsFromClientDelta(
  deltaX: number,
  deltaZ: number,
  fallbackUnits: number
): number {
  if (deltaX > 0) {
    if (deltaZ > 0) {
      return 1280;
    }
    if (deltaZ < 0) {
      return 1792;
    }
    return 1536;
  }
  if (deltaX < 0) {
    if (deltaZ > 0) {
      return 768;
    }
    if (deltaZ < 0) {
      return 256;
    }
    return 512;
  }
  if (deltaZ > 0) {
    return 1024;
  }
  if (deltaZ < 0) {
    return 0;
  }
  return fallbackUnits;
}

function nhTargetOrientationUnits(
  position: RuntimeClientPosition,
  target: RuntimeClientPosition,
  fallbackUnits: number
): number {
  const deltaX = position.x - target.x;
  const deltaZ = position.z - target.z;
  if (deltaX === 0 && deltaZ === 0) {
    return fallbackUnits;
  }
  return normalizeNhOrientationUnits(Math.atan2(deltaX, deltaZ) * 325.949);
}

function signedNhOrientationDelta(targetUnits: number, rotationUnits: number): number {
  let delta = normalizeNhOrientationUnits(targetUnits - rotationUnits);
  if (delta > 1024) {
    delta -= NH_ACTOR_ORIENTATION_UNITS;
  }
  return delta;
}

function nhMoveClientAxis(current: number, target: number, speed: number): number {
  if (current < target) {
    return Math.min(current + speed, target);
  }
  if (current > target) {
    return Math.max(current - speed, target);
  }
  return current;
}

function nhManualMovementSpeed(
  actor: ManualActorState,
  traversalMode: number,
  hasCombatTarget: boolean
): { readonly speed: number; readonly movementStallTicks: number } {
  let speed = 4;
  if (actor.rotationUnits !== actor.orientationUnits && !hasCombatTarget) {
    speed = 2;
  }
  if (actor.routeWaypoints.length > 2) {
    speed = 6;
  }
  if (actor.routeWaypoints.length > 3) {
    speed = 8;
  }
  let movementStallTicks = actor.movementStallTicks;
  if (movementStallTicks > 0 && actor.routeWaypoints.length > 1) {
    speed = 8;
    movementStallTicks -= 1;
  }
  if (traversalMode === 2) {
    speed <<= 1;
  }
  return { speed, movementStallTicks };
}

function nhMovementSequenceNameFromOrientation(actor: ManualActorState): RuntimeSequenceName {
  const delta = signedNhOrientationDelta(actor.orientationUnits, actor.rotationUnits);
  if (delta >= -256 && delta <= 256) {
    return "walk";
  }
  if (delta >= 256 && delta < 768) {
    return "walk_right";
  }
  if (delta >= -768 && delta <= -256) {
    return "walk_left";
  }
  return "walk_back";
}

function nhMovementSequenceNameForSpeed(
  speed: number,
  movementSequenceName: RuntimeSequenceName
): RuntimeSequenceName {
  return speed >= 8 && movementSequenceName === "walk" ? "run" : movementSequenceName;
}

function nhSequenceIsReadyMovement(sequenceName: RuntimeSequenceName): boolean {
  return sequenceName === "idle" || runtimeSequenceIsWeaponReady(sequenceName);
}

function nhTurnSequenceForReadyMovement(
  sequenceName: RuntimeSequenceName,
  turnTicks: number,
  stillTurning: boolean
): RuntimeSequenceName {
  return nhSequenceIsReadyMovement(sequenceName) &&
    (turnTicks > NH_ACTOR_TURN_ANIMATION_DELAY_TICKS || stillTurning)
    ? "turn"
    : sequenceName;
}

function rotateManualActorTowardNhOrientation(
  actor: ManualActorState,
  targetActor: ManualActorState | null,
  hasCombatTarget: boolean
): ManualActorState {
  const targetPosition = targetActor
    ? targetActor.clientPosition ?? nhClientPositionFromRuntimeTile(targetActor.renderTile)
    : null;
  const orientationUnits =
    hasCombatTarget && targetPosition
      ? nhTargetOrientationUnits(actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile), targetPosition, actor.orientationUnits)
      : actor.orientationUnits;
  const delta = normalizeNhOrientationUnits(orientationUnits - actor.rotationUnits);
  if (delta === 0) {
    return {
      ...actor,
      orientationUnits,
      turnTicks: 0,
      facingDegrees: nhOrientationUnitsToFacingDegrees(actor.rotationUnits)
    };
  }

  let rotationUnits = actor.rotationUnits;
  let stillTurning = true;
  if (delta > 1024) {
    rotationUnits -= NH_ACTOR_TURN_SPEED_UNITS;
    if (delta < NH_ACTOR_TURN_SPEED_UNITS || delta > NH_ACTOR_ORIENTATION_UNITS - NH_ACTOR_TURN_SPEED_UNITS) {
      rotationUnits = orientationUnits;
      stillTurning = false;
    }
  } else {
    rotationUnits += NH_ACTOR_TURN_SPEED_UNITS;
    if (delta < NH_ACTOR_TURN_SPEED_UNITS || delta > NH_ACTOR_ORIENTATION_UNITS - NH_ACTOR_TURN_SPEED_UNITS) {
      rotationUnits = orientationUnits;
      stillTurning = false;
    }
  }
  rotationUnits = normalizeNhOrientationUnits(rotationUnits);
  const turnTicks = actor.turnTicks + 1;
  const sequenceName = nhTurnSequenceForReadyMovement(actor.sequenceName, turnTicks, stillTurning);

  return {
    ...actor,
    orientationUnits,
    rotationUnits,
    turnTicks,
    sequenceName,
    facingDegrees: nhOrientationUnitsToFacingDegrees(rotationUnits)
  };
}

function manualActorActionSequenceKey(
  combatActor: RuntimePlayerCombatActorState,
  combatState: RuntimePlayerCombatState
): string | null {
  if (!runtimePlayerCombatActionActive(combatActor, combatState) || !combatActor.actionSequenceName) {
    return null;
  }
  const actionStartTick =
    combatActor.actionStartedAtTick ?? combatActor.actionUntilTick - combatActor.actionDurationTicks;
  const actionStartClientCycle =
    combatActor.actionStartedAtClientCycle ?? actionStartTick * NH_CLIENT_CYCLES_PER_GAME_TICK;
  return `${combatActor.actionSequenceName}:${actionStartClientCycle}`;
}

function syncManualActorActionSequence(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState,
  combatState: RuntimePlayerCombatState
): ManualActorState {
  const activeSequenceKey = manualActorActionSequenceKey(combatActor, combatState);
  if (activeSequenceKey === null) {
    return actor.activeSequenceKey === null &&
      actor.completedSequenceKey === null &&
      actor.sequencePathLengthAtStart === 0 &&
      actor.primaryFrame === 0 &&
      actor.primaryFrameCycle === 0 &&
      actor.primarySequenceLoops === 0 &&
      actor.primarySequenceCycle === 0
      ? actor
      : {
        ...actor,
        activeSequenceKey: null,
        completedSequenceKey: null,
        sequencePathLengthAtStart: 0,
        primaryFrame: 0,
        primaryFrameCycle: 0,
        primarySequenceLoops: 0,
        primarySequenceCycle: 0
      };
  }
  if (actor.completedSequenceKey === activeSequenceKey) {
    return actor.activeSequenceKey === null ? actor : { ...actor, activeSequenceKey: null };
  }
  if (actor.activeSequenceKey === activeSequenceKey) {
    return actor;
  }
  return {
    ...actor,
    activeSequenceKey,
    completedSequenceKey: null,
    sequencePathLengthAtStart: actor.routeWaypoints.length,
    // Source: Nh LoginPacket.method3722 resets sequenceFrame, sequenceFrameCycle, sequenceDelay,
    // and field703 only when a new primary sequence is accepted by the client.
    primaryFrame: 0,
    primaryFrameCycle: 0,
    primarySequenceLoops: 0,
    primarySequenceCycle: 0
  };
}

function manualActorWithAuthoritativeSequenceCursor(
  incoming: ManualActorState,
  current: ManualActorState
): ManualActorState {
  if (
    current.activeSequenceKey &&
    current.activeSequenceKey === incoming.activeSequenceKey &&
    current.primarySequenceCycle > incoming.primarySequenceCycle
  ) {
    return {
      ...incoming,
      activeSequenceKey: current.activeSequenceKey,
      completedSequenceKey: current.completedSequenceKey,
      sequencePathLengthAtStart: current.sequencePathLengthAtStart,
      primaryFrame: current.primaryFrame,
      primaryFrameCycle: current.primaryFrameCycle,
      primarySequenceLoops: current.primarySequenceLoops,
      primarySequenceCycle: current.primarySequenceCycle,
      lastMovementClientCycle: current.lastMovementClientCycle
    };
  }

  if (current.completedSequenceKey && current.completedSequenceKey === incoming.activeSequenceKey) {
    return {
      ...incoming,
      activeSequenceKey: null,
      completedSequenceKey: current.completedSequenceKey,
      sequencePathLengthAtStart: 0,
      primaryFrame: 0,
      primaryFrameCycle: 0,
      primarySequenceLoops: 0,
      primarySequenceCycle: current.primarySequenceCycle,
      lastMovementClientCycle: current.lastMovementClientCycle
    };
  }

  return incoming;
}

function nhPrimaryFrameCursor(actor: ManualActorState): NhSequenceFrameCursorOverride {
  return {
    frameIndex: actor.primaryFrame,
    frameCycle: actor.primaryFrameCycle
  };
}

function nhAdvancePrimarySequenceCursor(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState | null,
  combatState: RuntimePlayerCombatState | null,
  animationFixtures: NhAnimationFixtures | null
): ManualActorState {
  if (!combatActor || !combatState || actor.activeSequenceKey === null) {
    return actor;
  }

  const activeSequenceKey = manualActorActionSequenceKey(combatActor, combatState);
  if (activeSequenceKey !== actor.activeSequenceKey || !combatActor.actionSequenceName) {
    return actor;
  }

  const sequence = animationFixtures?.sequences.get(combatActor.actionSequenceName);
  if (!sequence || sequence.frames.length === 0) {
    return {
      ...actor,
      primarySequenceCycle: actor.primarySequenceCycle + 1
    };
  }

  let primaryFrame = Math.max(0, Math.trunc(actor.primaryFrame));
  let primaryFrameCycle = Math.max(0, Math.trunc(actor.primaryFrameCycle)) + 1;
  let primarySequenceLoops = Math.max(0, Math.trunc(actor.primarySequenceLoops));
  const primarySequenceCycle = actor.primarySequenceCycle + 1;
  const frameLength = primaryFrame < sequence.frames.length
    ? Math.max(1, sequence.frames[primaryFrame].lengthClientCycles)
    : 1;

  // Source: Nh class329 increments sequenceFrameCycle once per 20ms client cycle and
  // advances only when sequenceFrameCycle is greater than frameLengths[sequenceFrame].
  if (primaryFrame < sequence.frames.length && primaryFrameCycle > frameLength) {
    primaryFrameCycle = 1;
    primaryFrame += 1;
  }

  if (primaryFrame >= sequence.frames.length) {
    const frameStep = sequence.frameStep ?? -1;
    if (frameStep < 0) {
      return {
        ...actor,
        activeSequenceKey: null,
        completedSequenceKey: actor.activeSequenceKey,
        sequencePathLengthAtStart: 0,
        primaryFrame: 0,
        primaryFrameCycle: 0,
        primarySequenceLoops: 0,
        primarySequenceCycle
      };
    }

    primaryFrame -= frameStep;
    primarySequenceLoops += 1;
    if (
      primarySequenceLoops >= (sequence.maxLoops ?? 99) ||
      primaryFrame < 0 ||
      primaryFrame >= sequence.frames.length
    ) {
      return {
        ...actor,
        activeSequenceKey: null,
        completedSequenceKey: actor.activeSequenceKey,
        sequencePathLengthAtStart: 0,
        primaryFrame: 0,
        primaryFrameCycle: 0,
        primarySequenceLoops: 0,
        primarySequenceCycle
      };
    }
  }

  return {
    ...actor,
    primaryFrame,
    primaryFrameCycle,
    primarySequenceLoops,
    primarySequenceCycle
  };
}

function manualActorMovementBlockedByNhSequence(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState | null,
  combatState: RuntimePlayerCombatState,
  animationFixtures: NhAnimationFixtures | null,
): boolean {
  if (!combatActor || !runtimePlayerCombatActionActive(combatActor, combatState) || !combatActor.actionSequenceName) {
    return false;
  }

  const sequence = animationFixtures?.sequences.get(combatActor.actionSequenceName);
  if (!sequence) {
    return false;
  }
  if (
    actor.activeSequenceKey !== manualActorActionSequenceKey(combatActor, combatState) ||
    actor.primaryFrame < 0 ||
    actor.primaryFrame >= sequence.frames.length
  ) {
    return false;
  }

  if (actor.routeWaypoints.length === 0) {
    return false;
  }
  return actor.sequencePathLengthAtStart > 0
    ? nhSequencePrecedenceAnimating(sequence) === 0
    : nhSequencePriority(sequence) === 0;
}

function advanceManualActorClientCycle(
  actor: ManualActorState,
  _collision: NhSceneCollision,
  movementBlocked: boolean,
  targetActor: ManualActorState | null,
  hasCombatTarget: boolean,
  animationFixtures: NhAnimationFixtures | null
): ManualActorState {
  const clientPosition = actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile);
  let currentActor: ManualActorState = {
    ...actor,
    clientPosition,
    sequenceName: "idle"
  };
  if (actor.routeWaypoints.length === 0) {
    currentActor = {
      ...currentActor,
      tile: actor.tile,
      renderTile: runtimeTileFromNhClientPosition(clientPosition),
      clientPosition,
      routeTraversalModes: [],
      movementStallTicks: 0
    };
    const rotatedActor = rotateManualActorTowardNhOrientation(
      { ...currentActor, movementBlockedBySequence: false },
      targetActor,
      hasCombatTarget
    );
    return nhAdvanceMovementFrameCursor(rotatedActor, rotatedActor.sequenceName, animationFixtures);
  }

  if (movementBlocked) {
    currentActor = {
      ...currentActor,
      clientPosition,
      movementBlockedBySequence: true,
      movementStallTicks: Math.min(actor.movementStallTicks + 1, 100)
    };
    const rotatedActor = rotateManualActorTowardNhOrientation(currentActor, targetActor, hasCombatTarget);
    return nhAdvanceMovementFrameCursor(rotatedActor, rotatedActor.sequenceName, animationFixtures);
  }

  const targetTile = actor.routeWaypoints[0];
  const targetPosition = nhClientPositionFromRuntimeTile(targetTile);
  currentActor = {
    ...currentActor,
    orientationUnits: nhOrientationUnitsFromClientDelta(
      targetPosition.x - clientPosition.x,
      targetPosition.z - clientPosition.z,
      actor.orientationUnits
    )
  };
  if (
    Math.abs(targetPosition.x - clientPosition.x) > 256 ||
    Math.abs(targetPosition.z - clientPosition.z) > 256
  ) {
    const routeWaypoints = actor.routeWaypoints.slice(1);
    const routeTraversalModes = actor.routeTraversalModes.slice(1);
    const renderTile = runtimeTileFromNhClientPosition(targetPosition);
    currentActor = {
      ...currentActor,
      tile: actor.tile,
      renderTile,
      clientPosition: targetPosition,
      routeWaypoints,
      routeTraversalModes,
      sequencePathLengthAtStart: Math.max(0, actor.sequencePathLengthAtStart - 1),
      movementBlockedBySequence: false,
      sequenceName: routeWaypoints.length > 0 ? actor.sequenceName : "idle"
    };
    // Source: TargetRoute.beforeMovement() only rewrites Movement steps; PlayerCombat.faceTarget()
    // is not applied continuously during the run-in. Keep movement-facing while consuming route steps.
    const rotatedActor = rotateManualActorTowardNhOrientation(currentActor, targetActor, false);
    return nhAdvanceMovementFrameCursor(rotatedActor, rotatedActor.sequenceName, animationFixtures);
  }

  const traversalMode = actor.routeTraversalModes[0] ?? (actor.running ? 2 : 1);
  const initialMovementSequenceName = nhMovementSequenceNameFromOrientation(currentActor);
  const { speed, movementStallTicks } = nhManualMovementSpeed(currentActor, traversalMode, hasCombatTarget);
  const movementSequenceName = nhMovementSequenceNameForSpeed(speed, initialMovementSequenceName);
  const nextPosition = {
    x: nhMoveClientAxis(clientPosition.x, targetPosition.x, speed),
    z: nhMoveClientAxis(clientPosition.z, targetPosition.z, speed)
  };
  const reached = nextPosition.x === targetPosition.x && nextPosition.z === targetPosition.z;
  const routeWaypoints = reached ? actor.routeWaypoints.slice(1) : actor.routeWaypoints;
  const routeTraversalModes = reached ? actor.routeTraversalModes.slice(1) : actor.routeTraversalModes;
  const renderTile = runtimeTileFromNhClientPosition(nextPosition);
  currentActor = {
    ...currentActor,
    tile: actor.tile,
    renderTile,
    clientPosition: nextPosition,
    routeWaypoints,
    routeTraversalModes,
    movementStallTicks,
    sequencePathLengthAtStart: reached ? Math.max(0, actor.sequencePathLengthAtStart - 1) : actor.sequencePathLengthAtStart,
    movementBlockedBySequence: false,
    sequenceName: movementSequenceName
  };
  // Source: TargetRoute.beforeMovement() queues the route; combat facing is separate from
  // route-facing until the actor is no longer consuming movement steps.
  const rotatedActor = rotateManualActorTowardNhOrientation(currentActor, targetActor, false);
  return nhAdvanceMovementFrameCursor(rotatedActor, rotatedActor.sequenceName, animationFixtures);
}

function advanceManualActor(
  actor: ManualActorState,
  now: number,
  collision: NhSceneCollision,
  combatActor: RuntimePlayerCombatActorState | null = null,
  combatState: RuntimePlayerCombatState | null = null,
  animationFixtures: NhAnimationFixtures | null = null,
  targetActor: ManualActorState | null = null,
  maxClientCyclesToAdvance = Number.POSITIVE_INFINITY
): ManualActorState {
  const animationCycle = Math.floor(now / NH_CLIENT_CYCLE_MS);
  const clientPosition = actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile);
  let currentActor =
    combatActor && combatState
      ? syncManualActorActionSequence({ ...actor, clientPosition }, combatActor, combatState)
      : { ...actor, clientPosition };
  const sequenceJustAccepted =
    currentActor.activeSequenceKey !== null && currentActor.activeSequenceKey !== actor.activeSequenceKey;
  // Source: Nh LoginPacket.method3722 resets sequenceFrame and sequenceFrameCycle when a new
  // primary sequence is accepted. Do not spend an old movement catch-up backlog on the first
  // rendered frame of the newly accepted action sequence.
  const previousCycle = sequenceJustAccepted ? animationCycle : actor.lastMovementClientCycle ?? animationCycle;
  const maxCycleCatchUp = Math.max(0, Math.trunc(maxClientCyclesToAdvance));
  const targetMovementCycle = Math.min(
    animationCycle,
    previousCycle + maxCycleCatchUp
  );

  for (let cycle = previousCycle + 1; cycle <= targetMovementCycle; cycle += 1) {
    const movementBlocked =
      combatActor && combatState
        ? manualActorMovementBlockedByNhSequence(currentActor, combatActor, combatState, animationFixtures)
        : false;
    currentActor = advanceManualActorClientCycle(
      currentActor,
      collision,
      movementBlocked,
      targetActor,
      combatActor?.targetId != null,
      animationFixtures
    );
    currentActor = nhAdvancePrimarySequenceCursor(currentActor, combatActor, combatState, animationFixtures);
  }

  return {
    ...currentActor,
    animationCycle,
    lastMovementClientCycle:
      animationCycle - targetMovementCycle > maxCycleCatchUp ? animationCycle : targetMovementCycle
  };
}

function manualSourceAppearance(
  loadoutId: RuntimeLoadoutId,
  sourcePose: RuntimeActorPose
): RuntimePlayerAppearance | undefined {
  return loadoutId === sourcePose.loadoutId && (sourcePose.appearance?.itemIds.length ?? 0) >= 8 ? sourcePose.appearance : undefined;
}

function snapshotWithManualActor(snapshot: RuntimeSceneSnapshot, manualActor: ManualActorState): RuntimeSceneSnapshot {
  return {
    ...snapshot,
    note: "Manual local control over the runtime scene.",
    hud: {
      ...snapshot.hud,
      running: manualActor.running
    },
    actors: snapshot.actors.map((pose) =>
      pose.actorId === "local-player"
        ? {
          ...pose,
          tile: manualActor.tile,
          renderTile: manualActor.renderTile,
          loadoutId: manualActor.loadoutId,
          appearance: manualActor.appearance ?? manualSourceAppearance(manualActor.loadoutId, pose),
          sequenceName: manualActor.sequenceName,
          movementSequenceName: undefined,
          facingDegrees: manualActor.facingDegrees,
          markerLabel: manualActor.markerLabel,
          animationCycle: manualActor.animationCycle,
          movementAnimationCycle: undefined,
          movementFrame: manualActor.movementFrame,
          movementFrameCycle: manualActor.movementFrameCycle
        }
        : pose
    )
  };
}

function snapshotWithManualCombatActors(
  snapshot: RuntimeSceneSnapshot,
  localActor: ManualActorState,
  opponentActor: ManualActorState,
  combatState: RuntimePlayerCombatState,
  equipmentDefinitions: NhInventoryEquipmentDefinitionStore,
  weaponTypeDefinitions: NhWeaponTypeDefinitionStore,
  actorSequenceDefinitions: NhActorSequenceDefinitionStore,
  animationFixtures: NhAnimationFixtures | null
): RuntimeSceneSnapshot {
  return {
    ...snapshot,
    cycle: combatState.tick,
    keyframeCycle: combatState.tick,
    note: "Manual local control with source-backed player combat.",
    actors: snapshot.actors.map((pose) => {
      if (pose.actorId === "local-player") {
        return manualCombatActorPose(
          pose,
          localActor,
          combatState.actors["local-player"],
          combatState,
          equipmentDefinitions,
          weaponTypeDefinitions,
          actorSequenceDefinitions,
          animationFixtures
        );
      }
      if (pose.actorId === "opponent") {
        return manualCombatActorPose(
          pose,
          opponentActor,
          combatState.actors.opponent,
          combatState,
          equipmentDefinitions,
          weaponTypeDefinitions,
          actorSequenceDefinitions,
          animationFixtures
        );
      }
      return pose;
    }),
    hud: {
      ...snapshot.hud,
      hitpoints: combatState.actors["local-player"].hitpoints,
      hitpointsMax: combatState.actors["local-player"].maxHitpoints,
      running: localActor.running,
      specialEnergy: combatState.actors["local-player"].gmaul.specialEnergy,
      specialActive: combatState.actors["local-player"].specialActive,
      attackSet: combatState.actors["local-player"].attackSetIndex,
      autocast:
        combatState.actors["local-player"].autocastSpellId === "ice-barrage"
          ? runtimePlayerCombatIceBarrageAutocastSlot
          : 0,
      defensiveCast: combatState.actors["local-player"].defensiveCast,
      skills: {
        ...(snapshot.hud.skills ?? {}),
        hitpoints: {
          current: combatState.actors["local-player"].hitpoints,
          fixed: combatState.actors["local-player"].maxHitpoints
        }
      }
    }
  };
}

function manualCombatActorPose(
  sourcePose: RuntimeActorPose,
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState,
  combatState: RuntimePlayerCombatState,
  equipmentDefinitions: NhInventoryEquipmentDefinitionStore,
  weaponTypeDefinitions: NhWeaponTypeDefinitionStore,
  actorSequenceDefinitions: NhActorSequenceDefinitionStore,
  animationFixtures: NhAnimationFixtures | null
): RuntimeActorPose {
  const actionSequenceKey = manualActorActionSequenceKey(combatActor, combatState);
  const actionWindowActive = actionSequenceKey !== null && actor.activeSequenceKey === actionSequenceKey;
  const actionAnimationCycle = actor.primarySequenceCycle;
  const actionSequence =
    combatActor.actionSequenceName === null ? null : animationFixtures?.sequences.get(combatActor.actionSequenceName) ?? null;
  const primaryFrameCursor =
    actionWindowActive && actionSequence && actor.primaryFrame >= 0 && actor.primaryFrame < actionSequence.frames.length
      ? nhPrimaryFrameCursor(actor)
      : null;
  const actionFrameActive =
    actionWindowActive &&
    (
      !actionSequence ||
      primaryFrameCursor !== null
    );
  const baseSequenceName = manualActorBaseSequenceName(
    manualActorVisibleSequenceName(actor),
    combatActor.loadoutId,
    equipmentDefinitions,
    weaponTypeDefinitions,
    actorSequenceDefinitions
  );
  const movementSequenceName =
    actionFrameActive && runtimeSequenceIsMovement(baseSequenceName) ? baseSequenceName : undefined;
  const movementFrameCursor = nhMovementFrameCursor(actor);
  return {
    ...sourcePose,
    tile: actor.tile,
    renderTile: actor.renderTile,
    loadoutId: combatActor.loadoutId,
    appearance: actor.appearance ?? manualSourceAppearance(combatActor.loadoutId, sourcePose),
    sequenceName: actionFrameActive ? runtimePlayerCombatActorSequence(combatActor, combatState.tick, baseSequenceName) : baseSequenceName,
    sequenceMode: actionFrameActive ? "primary" : undefined,
    movementSequenceName,
    actionSequenceKey: actionFrameActive ? actionSequenceKey ?? undefined : undefined,
    facingDegrees: actor.facingDegrees,
    orientationUnits: actor.orientationUnits,
    rotationUnits: actor.rotationUnits,
    markerLabel: actor.markerLabel,
    animationCycle: actionFrameActive ? actionAnimationCycle : actor.animationCycle,
    movementAnimationCycle: movementSequenceName ? actor.animationCycle : undefined,
    primaryFrame: primaryFrameCursor?.frameIndex,
    primaryFrameCycle: primaryFrameCursor?.frameCycle,
    movementFrame: movementFrameCursor.frameIndex,
    movementFrameCycle: movementFrameCursor.frameCycle
  };
}

function runeliteAnimationSmoothingRuntimeReapplyEnabled(
  config: RuneliteAnimationSmoothingConfigSnapshot
): boolean {
  return config.enabled && config.smoothPlayerAnimations;
}

function runtimeAnimationSmoothingFrameSnapshot(
  snapshot: RuntimeSceneSnapshot,
  manualControl: boolean,
  now: number,
  localActor: ManualActorState,
  opponentActor: ManualActorState,
  combatState: RuntimePlayerCombatState,
  equipmentDefinitions: NhInventoryEquipmentDefinitionStore,
  weaponTypeDefinitions: NhWeaponTypeDefinitionStore,
  actorSequenceDefinitions: NhActorSequenceDefinitionStore,
  animationFixtures: NhAnimationFixtures | null,
  animationSmoothingConfig: RuneliteAnimationSmoothingConfigSnapshot
): RuntimeSceneSnapshot {
  if (!manualControl || !animationFixtures) {
    return snapshot;
  }

  const exactClientCycle = now / NH_CLIENT_CYCLE_MS;
  const clientCycle = Math.floor(exactClientCycle);
  const smoothingEnabled = runeliteAnimationSmoothingRuntimeReapplyEnabled(animationSmoothingConfig);
  const frameCycleOffset = smoothingEnabled ? Math.max(0, Math.min(0.999, exactClientCycle - clientCycle)) : 0;
  return snapshotWithManualCombatActors(
    snapshot,
    {
      ...localActor,
      animationCycle: clientCycle + frameCycleOffset,
      movementFrameCycle: localActor.movementFrameCycle + frameCycleOffset,
      primaryFrameCycle: localActor.primaryFrameCycle + (localActor.activeSequenceKey ? frameCycleOffset : 0),
      primarySequenceCycle: localActor.primarySequenceCycle + (localActor.activeSequenceKey ? frameCycleOffset : 0)
    },
    {
      ...opponentActor,
      animationCycle: clientCycle + frameCycleOffset,
      movementFrameCycle: opponentActor.movementFrameCycle + frameCycleOffset,
      primaryFrameCycle: opponentActor.primaryFrameCycle + (opponentActor.activeSequenceKey ? frameCycleOffset : 0),
      primarySequenceCycle: opponentActor.primarySequenceCycle + (opponentActor.activeSequenceKey ? frameCycleOffset : 0)
    },
    combatState,
    equipmentDefinitions,
    weaponTypeDefinitions,
    actorSequenceDefinitions,
    animationFixtures
  );
}

function manualActorFacingTarget(actor: ManualActorState, target: ManualActorState): ManualActorState {
  const actorPosition = actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile ?? actor.tile);
  const targetPosition = target.clientPosition ?? nhClientPositionFromRuntimeTile(target.renderTile ?? target.tile);
  const orientationUnits = nhTargetOrientationUnits(actorPosition, targetPosition, actor.orientationUnits);
  return {
    ...actor,
    orientationUnits
  };
}

const nhPlayerAppearanceEquipmentContainerSlots = new Set<number>([0, 1, 2, 3, 4, 5, 7, 9, 10]);

function localPlayerEquipmentItemIdsBySlot(
  snapshot: RuntimeSceneSnapshot,
  equipmentDefinitions: NhInventoryEquipmentDefinitionStore
): RuntimeEquipmentItemIdsBySlot {
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

const nhEquipmentSlotByServerSlot = new Map<number, EquipmentSlot>([
  [0, "head"],
  [1, "cape"],
  [2, "amulet"],
  [3, "weapon"],
  [4, "body"],
  [5, "shield"],
  [7, "legs"],
  [9, "hands"],
  [10, "feet"],
  [12, "ring"],
  [13, "ammo"]
]);
const nhServerSlotByEquipmentSlot = new Map<EquipmentSlot, number>(
  [...nhEquipmentSlotByServerSlot.entries()].map(([serverSlot, equipmentSlot]) => [equipmentSlot, serverSlot])
);

function visibleEquipmentFromRuntimeItemIdsBySlot(
  equipmentBySlot: RuntimeEquipmentItemIdsBySlot,
  itemDefinitions: NhInventoryItemDefinitionStore
): VisibleEquipment {
  const equipment: Partial<Record<EquipmentSlot, { readonly itemId: number; readonly name: string }>> = {};
  for (const [serverSlot, itemId] of equipmentBySlot) {
    const slot = nhEquipmentSlotByServerSlot.get(serverSlot);
    if (!slot) {
      continue;
    }
    equipment[slot] = {
      itemId,
      name: itemDefinitions.get(itemId)?.name ?? `Item ${itemId}`
    };
  }
  return equipment;
}

function runtimeItemIdsBySlotFromVisibleEquipment(equipment: VisibleEquipment): RuntimeEquipmentItemIdsBySlot {
  const itemIdsBySlot = new Map<number, number>();
  for (const [slot, item] of Object.entries(equipment) as [EquipmentSlot, VisibleEquipmentItem | undefined][]) {
    const serverSlot = nhServerSlotByEquipmentSlot.get(slot);
    if (serverSlot !== undefined && item) {
      itemIdsBySlot.set(serverSlot, item.itemId);
    }
  }
  return itemIdsBySlot;
}

function visibleEquipmentItemsFromRuntimeInventory(
  slots: readonly (RuntimeInventorySlot | null)[] | null | undefined,
  itemDefinitions: NhInventoryItemDefinitionStore
): readonly VisibleEquipmentItem[] {
  if (!slots) {
    return [];
  }
  const items: VisibleEquipmentItem[] = [];
  for (const slot of slots) {
    if (!slot || slot.itemId <= 0 || slot.quantity <= 0) {
      continue;
    }
    items.push({
      itemId: slot.itemId,
      name: itemDefinitions.get(slot.itemId)?.name ?? `Item ${slot.itemId}`
    });
  }
  return items;
}

interface ManualPolicyActorMovementView {
  readonly movedThisTick: boolean;
  readonly lastMoveDx: number;
  readonly lastMoveDy: number;
}

const manualPolicyStationaryMovementView: ManualPolicyActorMovementView = {
  movedThisTick: false,
  lastMoveDx: 0,
  lastMoveDy: 0
};

function nhClientVisibleOpponentHp(hitpoints: number): number {
  const hp = Math.max(0, Math.min(99, Math.trunc(Number.isFinite(hitpoints) ? hitpoints : 99)));
  if (hp <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(99, Math.trunc((hp + 2) / 5) * 5));
}

function nhClientVisibleFreezeTicks(locks: EntityLockState, tick: number): number {
  if (locks.freezeUntilTick < tick) {
    return 0;
  }
  const ticks = Math.max(0, locks.freezeUntilTick - tick);
  if (ticks <= 0) {
    return 0;
  }
  return Math.max(1, Math.trunc((ticks + 2) / 5) * 5);
}

function runtimePolicyVisibleStatFromLevel(value: number): SimStats["attack"] {
  const level = Math.max(1, Math.trunc(Number.isFinite(value) ? value : 99));
  return {
    current: level,
    fixed: 99
  };
}

function runtimePolicyVisibleStatsFromCombatActor(actor: RuntimePlayerCombatActorState): SimStats {
  return {
    attack: runtimePolicyVisibleStatFromLevel(actor.levels.attack),
    strength: runtimePolicyVisibleStatFromLevel(actor.levels.strength),
    defence: runtimePolicyVisibleStatFromLevel(actor.levels.defence),
    ranged: runtimePolicyVisibleStatFromLevel(actor.levels.ranged),
    magic: runtimePolicyVisibleStatFromLevel(actor.levels.magic),
    hitpoints: {
      current: nhClientVisibleOpponentHp(actor.hitpoints),
      fixed: Math.max(1, Math.min(99, Math.trunc(Number.isFinite(actor.maxHitpoints) ? actor.maxHitpoints : 99)))
    },
    prayer: {
      current: Math.max(0, Math.min(99, Math.trunc(Number.isFinite(actor.prayerPoints) ? actor.prayerPoints : 99))),
      fixed: Math.max(1, Math.min(99, Math.trunc(Number.isFinite(actor.maxPrayerPoints) ? actor.maxPrayerPoints : 99)))
    }
  };
}

function runtimePolicyVisibleLocksFromCombatActor(
  actor: RuntimePlayerCombatActorState,
  tick: number
): EntityLockState {
  const visibleFreezeTicks = nhClientVisibleFreezeTicks(actor.locks, tick);
  if (visibleFreezeTicks <= 0) {
    const { freezeSourceId: _freezeSourceId, ...locks } = actor.locks;
    return {
      ...locks,
      freezeUntilTick: -1
    };
  }
  return {
    ...actor.locks,
    freezeUntilTick: tick + visibleFreezeTicks
  };
}

function runtimePolicyLocksFrozenAtTick(locks: EntityLockState, tick: number): boolean {
  return locks.freezeUntilTick >= tick;
}

function manualPolicyActorMovementViewFromTiles(
  sourceTile: RuntimeTile,
  destinationTile: RuntimeTile,
  movedThisTick: boolean
): ManualPolicyActorMovementView {
  if (!movedThisTick) {
    return manualPolicyStationaryMovementView;
  }
  // Source: NhStakerBot.captureObservation() stores getPosition() - getLastPosition() in tile units.
  return {
    movedThisTick: true,
    lastMoveDx: Math.round((destinationTile.x - sourceTile.x) / NH_TILE_WORLD_UNITS),
    lastMoveDy: Math.round((destinationTile.z - sourceTile.z) / NH_TILE_WORLD_UNITS)
  };
}

function manualPolicyActorAppearanceView(
  actor: ManualActorState,
  combatActor: RuntimePlayerCombatActorState,
  tick: number,
  equipmentOverride: RuntimeEquipmentItemIdsBySlot | null,
  itemDefinitions: NhInventoryItemDefinitionStore,
  activePrayers: readonly PrayerId[] = [],
  movement: ManualPolicyActorMovementView = manualPolicyStationaryMovementView,
  inventorySlots?: readonly (RuntimeInventorySlot | null)[] | null
): ManualPolicyActorAppearanceView {
  return {
    tile: actor.tile,
    loadoutId: actor.loadoutId,
    equipment: equipmentOverride ? visibleEquipmentFromRuntimeItemIdsBySlot(equipmentOverride, itemDefinitions) : nhLoadouts[actor.loadoutId].equipment,
    inventoryItems: visibleEquipmentItemsFromRuntimeInventory(inventorySlots, itemDefinitions),
    inventorySlots: inventorySlots ?? [],
    activePrayers: [...activePrayers],
    stats: runtimePolicyVisibleStatsFromCombatActor(combatActor),
    locks: runtimePolicyVisibleLocksFromCombatActor(combatActor, tick),
    movedThisTick: movement.movedThisTick,
    lastMoveDx: movement.lastMoveDx,
    lastMoveDy: movement.lastMoveDy,
    observedInfoKnown: true
  };
}

function manualPolicyUnknownOpponentInfoAppearanceView(
  previous: ManualPolicyActorAppearanceView
): ManualPolicyActorAppearanceView {
  return {
    ...previous,
    tile: {
      x: -NH_TILE_WORLD_UNITS,
      z: -NH_TILE_WORLD_UNITS
    },
    equipment: {},
    inventoryItems: [],
    inventorySlots: [],
    activePrayers: [],
    stats: {
      ...previous.stats,
      hitpoints: {
        ...previous.stats.hitpoints,
        current: -1
      },
      prayer: {
        ...previous.stats.prayer,
        current: 0
      }
    },
    locks: createEntityLockState(),
    movedThisTick: false,
    lastMoveDx: 0,
    lastMoveDy: 0,
    observedInfoKnown: false
  };
}

function sortedEquipmentItemIds(equipmentBySlot: RuntimeEquipmentItemIdsBySlot): readonly number[] {
  return [...equipmentBySlot.entries()].sort((left, right) => left[0] - right[0]).map(([, itemId]) => itemId);
}

function nhAppearanceEquipmentSlotsForRuntimeEquipment(equipmentBySlot: RuntimeEquipmentItemIdsBySlot): readonly number[] {
  return nhEquipmentSlotsFromLoadoutItems(
    sortedEquipmentItemIds(equipmentBySlot),
    runtimePlayerAppearanceKits,
    runtimePlayerAppearanceServerItemsById
  );
}

function runtimeAppearanceFromEquipmentItems(
  equipmentBySlot: RuntimeEquipmentItemIdsBySlot,
  sourceAppearance: RuntimePlayerAppearance
): RuntimePlayerAppearance {
  return {
    itemIds: sortedEquipmentItemIds(equipmentBySlot),
    bodyColors: sourceAppearance.bodyColors,
    equipmentSlots: nhAppearanceEquipmentSlotsForRuntimeEquipment(equipmentBySlot),
    team: sourceAppearance.team,
    source: "loadout"
  };
}

function runtimeActorPoseWithEquipmentItems(
  pose: RuntimeActorPose,
  equipmentBySlot: RuntimeEquipmentItemIdsBySlot,
  loadoutId: RuntimeLoadoutId = pose.loadoutId
): RuntimeActorPose {
  const sourceAppearance =
    loadoutId === pose.loadoutId && pose.appearance ? pose.appearance : runtimeLoadoutAppearance(loadoutId);
  return {
    ...pose,
    loadoutId,
    appearance: runtimeAppearanceFromEquipmentItems(equipmentBySlot, sourceAppearance)
  };
}

function nhTwoHandedEquipmentAddLastItemId(
  equipSlot: number,
  selectedItemTwoHanded: boolean,
  currentEquipment: RuntimeEquipmentItemIdsBySlot,
  equipmentDefinitions: NhInventoryEquipmentDefinitionStore
): number | null {
  if (equipSlot === 5) {
    const weaponItemId = currentEquipment.get(3);
    const weaponDefinition = weaponItemId === undefined ? undefined : equipmentDefinitions.get(weaponItemId);
    return weaponDefinition?.twoHanded ? weaponItemId ?? null : null;
  }
  if (equipSlot === 3 && selectedItemTwoHanded) {
    return currentEquipment.get(5) ?? null;
  }
  return null;
}

function addNhInventoryItemToFirstFreeSlot(
  slots: readonly (RuntimeInventorySlot | null)[],
  itemId: number
): readonly (RuntimeInventorySlot | null)[] | null {
  const nextSlots = [...slots];
  const slotIndex = nextSlots.findIndex((slot) => slot === null);
  if (slotIndex < 0) {
    return null;
  }
  nextSlots[slotIndex] = { itemId, quantity: 1 };
  return nextSlots;
}

function snapshotWithLocalPlayerEquipmentItems(
  snapshot: RuntimeSceneSnapshot,
  equipmentBySlot: RuntimeEquipmentItemIdsBySlot
): RuntimeSceneSnapshot {
  return {
    ...snapshot,
    actors: snapshot.actors.map((pose) => {
      if (pose.actorId !== "local-player") {
        return pose;
      }

      const sourceAppearance = pose.appearance ?? runtimeLoadoutAppearance(pose.loadoutId);
      return {
        ...pose,
        appearance: runtimeAppearanceFromEquipmentItems(equipmentBySlot, sourceAppearance)
      };
    })
  };
}

function pointerEventToCanvasPosition(
  boundary: RuntimeSceneBoundary,
  event: PointerEvent | MouseEvent
): { readonly x: number; readonly y: number } | null {
  const canvas = boundary.renderer.domElement;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const sourceWidth = Math.max(1, canvas.clientWidth);
  const sourceHeight = Math.max(1, canvas.clientHeight);
  return {
    x: ((event.clientX - rect.left) / rect.width) * sourceWidth,
    y: ((event.clientY - rect.top) / rect.height) * sourceHeight
  };
}

function pointerEventToRuntimeTile(boundary: RuntimeSceneBoundary, event: PointerEvent | MouseEvent): RuntimeTile | null {
  const canvasPosition = pointerEventToCanvasPosition(boundary, event);
  if (!canvasPosition) {
    return null;
  }

  const canvasX = canvasPosition.x;
  const canvasY = canvasPosition.y;
  const sourceViewport = boundary.fixedClientLayout?.viewport;
  const sceneTilePicker = boundary.sceneTilePicker;
  const viewportRect = boundary.fixedClientCssLayout?.viewportRect;
  if (!sourceViewport || !sceneTilePicker || !viewportRect || !pointInNhRect(viewportRect, canvasX, canvasY)) {
    return null;
  }

  boundary.camera.updateMatrixWorld(true);
  return nhPickSceneTileFromViewportPoint({
    camera: boundary.camera,
    viewport: sourceViewport,
    arena: sceneTilePicker.arena,
    sceneOffset: sceneTilePicker.sceneOffset,
    point: {
      x: ((canvasX - viewportRect.x) / viewportRect.width) * sourceViewport.rect.width,
      y: ((canvasY - viewportRect.y) / viewportRect.height) * sourceViewport.rect.height
    }
  });
}

function pointerEventToRuntimeActor(
  boundary: RuntimeSceneBoundary,
  snapshot: RuntimeSceneSnapshot,
  event: PointerEvent | MouseEvent
): RuntimeActorPose | null {
  return pointerEventToRuntimeActorHits(boundary, snapshot, event)[0]?.actor ?? null;
}

function pointerEventToRuntimeActorHits(
  boundary: RuntimeSceneBoundary,
  snapshot: RuntimeSceneSnapshot,
  event: PointerEvent | MouseEvent
): readonly RuntimeActorPick[] {
  const point = pointerEventToSourceViewportPoint(boundary, event);
  const sourceViewport = boundary.fixedClientLayout?.viewport;
  if (!point || !sourceViewport) {
    return [];
  }

  boundary.camera.updateMatrixWorld(true);
  const posesByActorId = new Map(snapshot.actors.map((actor) => [actor.actorId, actor]));
  const hits: RuntimeActorPick[] = [];
  for (const [actorId, slot] of boundary.actorSlots.entries()) {
    const actor = posesByActorId.get(actorId);
    if (!actor) {
      continue;
    }
    const rect = actorSourceClickboxRect(boundary, slot.group, actor);
    if (!rect || !pointInSourceRect(rect, point)) {
      continue;
    }
    hits.push({ actor, rect });
  }

  return hits.sort(
    (left, right) =>
      runtimeActorMenuPickPriority(left.actor) - runtimeActorMenuPickPriority(right.actor) ||
      left.rect.depthClientUnits - right.rect.depthClientUnits
  );
}

function pointerEventToRuntimeGroundItem(
  boundary: RuntimeSceneBoundary,
  event: PointerEvent | MouseEvent,
  groundItems: readonly RuntimeGroundItem[]
): RuntimeGroundItemPick | null {
  const point = pointerEventToSourceViewportPoint(boundary, event);
  if (!point || groundItems.length === 0) {
    return null;
  }

  boundary.camera.updateMatrixWorld(true);
  boundary.groundItemRoot.updateMatrixWorld(true);
  let hit: RuntimeGroundItemPick | null = null;
  for (const item of groundItems) {
    const rect = groundItemSourceClickboxRect(boundary, item);
    if (!rect || !pointInSourceRect(rect, point)) {
      continue;
    }
    if (!hit || rect.depthClientUnits < hit.rect.depthClientUnits) {
      hit = { item, rect };
    }
  }
  return hit;
}

function pointerEventToRuntimeSceneObject(
  boundary: RuntimeSceneBoundary,
  event: PointerEvent | MouseEvent,
  placements: readonly NhArenaObjectPlacement[],
  collisionMap: NhSceneCollision | null,
  cacheModels: NhCacheModelStore | null
): RuntimeSceneObjectPick | null {
  const point = pointerEventToSourceViewportPoint(boundary, event);
  const sceneTilePicker = boundary.sceneTilePicker;
  if (!point || !sceneTilePicker || !collisionMap) {
    return null;
  }

  boundary.camera.updateMatrixWorld(true);
  let hit: RuntimeSceneObjectPick | null = null;
  for (const placement of placements) {
    if (!isNhSceneObjectMenuable(placement) || placement.plane !== sceneTilePicker.arena.bounds.plane) {
      continue;
    }
    const rect = sceneObjectSourceClickboxRect(boundary, placement, collisionMap, cacheModels);
    if (!rect || !pointInSourceRect(rect, point)) {
      continue;
    }
    if (!hit || rect.depthClientUnits < hit.depthClientUnits) {
      const actionTile = collisionMap.worldToSceneTile({ x: placement.x, y: placement.y, plane: placement.plane });
      hit = {
        placement,
        walkTile: actionTile,
        actionTile,
        depthClientUnits: rect.depthClientUnits
      };
    }
  }
  return hit;
}

const sourceSingleTileModelMinimumClientUnits = 32 + 8;
const sourceSingleTileFacePaddingPixels = 20;
const sourceDefaultFacePaddingPixels = 5;
const sourceObjectFacePaddingPixels = 5;

type NhCacheModelStore = NhPlayerModelSources["cacheModels"];
type NhCacheModelDefinition = NhCacheModelStore[string];

function pointerEventToSourceViewportPoint(
  boundary: RuntimeSceneBoundary,
  event: PointerEvent | MouseEvent
): RuntimeViewportSourcePoint | null {
  const canvasPosition = pointerEventToCanvasPosition(boundary, event);
  if (!canvasPosition) {
    return null;
  }

  const canvasX = canvasPosition.x;
  const canvasY = canvasPosition.y;
  const viewportRect = boundary.fixedClientCssLayout?.viewportRect;
  const sourceViewport = boundary.fixedClientLayout?.viewport;
  if (!viewportRect || !sourceViewport || !pointInNhRect(viewportRect, canvasX, canvasY)) {
    return null;
  }

  return {
    x: ((canvasX - viewportRect.x) / viewportRect.width) * sourceViewport.rect.width,
    y: ((canvasY - viewportRect.y) / viewportRect.height) * sourceViewport.rect.height
  };
}

function actorSourceClickboxRect(
  boundary: RuntimeSceneBoundary,
  actorRoot: Group,
  actor?: RuntimeActorPose
): RuntimeSourceHitRect | null {
  const sourceViewport = boundary.fixedClientLayout?.viewport;
  if (!sourceViewport) {
    return null;
  }
  const bounds = new Box3().setFromObject(actorRoot);
  if (bounds.isEmpty() && !actor) {
    return null;
  }

  const defaultHeight = nhClientUnitsToWorldUnits(NH_PLAYER_DEFAULT_HEIGHT_CLIENT_UNITS);
  const center = bounds.isEmpty() ? new Vector3(actor?.tile.x ?? 0, defaultHeight / 2, actor?.tile.z ?? 0) : bounds.getCenter(new Vector3());
  const size = bounds.isEmpty() ? new Vector3(0, defaultHeight, 0) : bounds.getSize(new Vector3());
  const modelHeight = Math.max(defaultHeight, size.y);
  const minY = actorRoot.position.y;
  const maxY = minY + modelHeight;
  const logicalTile = actor?.renderTile ?? actor?.tile;
  if (logicalTile) {
    center.x = logicalTile.x;
    center.z = logicalTile.z;
  }
  const minimumHalfExtent = sourceHorizontalClientUnitsToSceneUnits(sourceSingleTileModelMinimumClientUnits);
  const halfX = Math.max(size.x / 2, minimumHalfExtent);
  const halfZ = Math.max(size.z / 2, minimumHalfExtent);
  return projectWorldBoxToSourceHitRect(
    boundary,
    new Vector3(center.x - halfX, minY, center.z - halfZ),
    new Vector3(center.x + halfX, maxY, center.z + halfZ),
    sourceSingleTileFacePaddingPixels
  );
}

interface RuntimeActorPick {
  readonly actor: RuntimeActorPose;
  readonly rect: RuntimeSourceHitRect;
}

interface RuntimeGroundItemPick {
  readonly item: RuntimeGroundItem;
  readonly rect: RuntimeSourceHitRect;
}

function runtimeActorMenuPickPriority(actor: RuntimeActorPose): number {
  return actor.actorId === "local-player" ? 1 : 0;
}

function sceneObjectSourceClickboxRect(
  boundary: RuntimeSceneBoundary,
  placement: NhArenaObjectPlacement,
  collisionMap: NhSceneCollision,
  cacheModels: NhCacheModelStore | null
): RuntimeSourceHitRect | null {
  const modelClickbox = sceneObjectModelSourceClickboxRect(boundary, placement, collisionMap, cacheModels);
  if (modelClickbox) {
    return modelClickbox;
  }

  return sceneObjectFootprintSourceClickboxRect(boundary, placement, collisionMap);
}

function sceneObjectFootprintSourceClickboxRect(
  boundary: RuntimeSceneBoundary,
  placement: NhArenaObjectPlacement,
  collisionMap: NhSceneCollision
): RuntimeSourceHitRect | null {
  const sceneTilePicker = boundary.sceneTilePicker;
  if (!sceneTilePicker) {
    return null;
  }

  const footprint = clientObjectFootprint(placement);
  const arena = sceneTilePicker.arena;
  const sceneOffset = sceneTilePicker.sceneOffset;
  const west = (placement.x - arena.bounds.west) * NH_TILE_WORLD_UNITS + sceneOffset.x;
  const east = (placement.x + footprint.sizeX - arena.bounds.west) * NH_TILE_WORLD_UNITS + sceneOffset.x;
  const south = (placement.y - arena.bounds.south) * NH_TILE_WORLD_UNITS + sceneOffset.z;
  const north = (placement.y + footprint.sizeY - arena.bounds.south) * NH_TILE_WORLD_UNITS + sceneOffset.z;
  const centerTile = collisionMap.worldToSceneTile({
    x: placement.x,
    y: placement.y,
    plane: placement.plane
  });
  const baseY = collisionMap.sampleHeight(centerTile);
  const modelHeight = sourceModelHeightWorldUnits(placement);
  const padding =
    footprint.sizeX === 1 && footprint.sizeY === 1
      ? sourceSingleTileFacePaddingPixels
      : sourceDefaultFacePaddingPixels;

  return projectWorldBoxToSourceHitRect(
    boundary,
    new Vector3(Math.min(west, east), baseY, Math.min(south, north)),
    new Vector3(Math.max(west, east), baseY + modelHeight, Math.max(south, north)),
    padding
  );
}

function sceneObjectModelSourceClickboxRect(
  boundary: RuntimeSceneBoundary,
  placement: NhArenaObjectPlacement,
  collisionMap: NhSceneCollision,
  cacheModels: NhCacheModelStore | null
): RuntimeSourceHitRect | null {
  const sourceViewport = boundary.fixedClientLayout?.viewport;
  if (!sourceViewport || !boundary.sceneTilePicker || !cacheModels) {
    return null;
  }

  const modelIds = placementModelIds(placement);
  if (modelIds.length === 0) {
    return null;
  }

  const faceRects: RuntimeSourceFaceRect[] = [];
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let depthClientUnits = Number.POSITIVE_INFINITY;

  for (const modelId of modelIds) {
    const model = cacheModels[String(modelId)];
    if (!isNhCacheModelDefinition(model)) {
      continue;
    }

    const faceCount = Math.min(
      model.faceVertexIndices1.length,
      model.faceVertexIndices2.length,
      model.faceVertexIndices3.length,
      model.faceColors.length
    );
    const projectedVertices = new Map<number, ReturnType<typeof nhProjectWorldPointToViewport>>();
    const projectVertex = (vertexIndex: number): ReturnType<typeof nhProjectWorldPointToViewport> => {
      if (projectedVertices.has(vertexIndex)) {
        return projectedVertices.get(vertexIndex) ?? null;
      }

      const worldPoint = sceneObjectModelVertexWorldPosition(
        boundary,
        placement,
        collisionMap,
        model,
        vertexIndex
      );
      const projected = worldPoint ? nhProjectWorldPointToViewport(boundary.camera, sourceViewport, worldPoint) : null;
      projectedVertices.set(vertexIndex, projected);
      return projected;
    };

    for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
      if (model.faceColors[faceIndex] === -2) {
        continue;
      }

      const a = projectVertex(model.faceVertexIndices1[faceIndex]);
      const b = projectVertex(model.faceVertexIndices2[faceIndex]);
      const c = projectVertex(model.faceVertexIndices3[faceIndex]);
      if (!a || !b || !c) {
        continue;
      }

      const faceLeft = Math.min(a.x, b.x, c.x) - sourceObjectFacePaddingPixels;
      const faceTop = Math.min(a.y, b.y, c.y) - sourceObjectFacePaddingPixels;
      const faceRight = Math.max(a.x, b.x, c.x) + sourceObjectFacePaddingPixels;
      const faceBottom = Math.max(a.y, b.y, c.y) + sourceObjectFacePaddingPixels;
      faceRects.push({ left: faceLeft, top: faceTop, right: faceRight, bottom: faceBottom });
      left = Math.min(left, faceLeft);
      top = Math.min(top, faceTop);
      right = Math.max(right, faceRight);
      bottom = Math.max(bottom, faceBottom);
      depthClientUnits = Math.min(depthClientUnits, a.depthClientUnits, b.depthClientUnits, c.depthClientUnits);
    }
  }

  if (faceRects.length === 0 || !Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(depthClientUnits)) {
    return null;
  }

  return {
    left,
    top,
    right,
    bottom,
    depthClientUnits,
    sourceFaceRects: faceRects
  };
}

function groundItemSourceClickboxRect(
  boundary: RuntimeSceneBoundary,
  item: RuntimeGroundItem
): RuntimeSourceHitRect | null {
  const object = boundary.groundItemRoot.children.find((child) => child.userData.groundItemId === item.id);
  if (!object) {
    return null;
  }

  const bounds = new Box3().setFromObject(object);
  if (bounds.isEmpty()) {
    return null;
  }

  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  // Source: TileItem uses ItemDefinition.getModel(quantity); Model.method2356 enforces a 32-unit
  // x/z minimum and adds 8 more units for single-tile scene picking.
  const minimumHalfExtent = sourceHorizontalClientUnitsToSceneUnits(sourceSingleTileModelMinimumClientUnits);
  const minimumHeight = sourceHorizontalClientUnitsToSceneUnits(16);
  const halfX = Math.max(size.x / 2, minimumHalfExtent);
  const halfZ = Math.max(size.z / 2, minimumHalfExtent);
  const halfY = Math.max(size.y / 2, minimumHeight / 2);
  return projectWorldBoxToSourceHitRect(
    boundary,
    new Vector3(center.x - halfX, center.y - halfY, center.z - halfZ),
    new Vector3(center.x + halfX, center.y + halfY, center.z + halfZ),
    sourceObjectFacePaddingPixels
  );
}

function sceneObjectModelVertexWorldPosition(
  boundary: RuntimeSceneBoundary,
  placement: NhArenaObjectPlacement,
  collisionMap: NhSceneCollision,
  model: NhCacheModelDefinition,
  vertexIndex: number
): Vector3 | null {
  const sceneTilePicker = boundary.sceneTilePicker;
  if (!sceneTilePicker) {
    return null;
  }

  const sourceX = model.vertexPositionsX[vertexIndex];
  const sourceY = model.vertexPositionsY[vertexIndex];
  const sourceZ = model.vertexPositionsZ[vertexIndex];
  if (![sourceX, sourceY, sourceZ].every((value) => typeof value === "number" && Number.isFinite(value))) {
    return null;
  }

  const vertex = clientSceneObjectVertex(sourceX, sourceY, sourceZ, placement);
  const footprint = clientObjectFootprint(placement);
  const worldTileX = placement.x + footprint.sizeX / 2 + vertex.x / 128;
  const worldTileY = placement.y + footprint.sizeY / 2 + vertex.z / 128;
  const terrainY = isSceneObjectGroundContoured(placement)
    ? sampleSceneHeightForWorldTile(boundary, collisionMap, worldTileX, worldTileY)
    : sceneObjectCenterHeight(boundary, placement, collisionMap);

  return new Vector3(
    (worldTileX - sceneTilePicker.arena.bounds.west) * NH_TILE_WORLD_UNITS + sceneTilePicker.sceneOffset.x,
    terrainY - sourceHorizontalClientUnitsToSceneUnits(vertex.y),
    (worldTileY - sceneTilePicker.arena.bounds.south) * NH_TILE_WORLD_UNITS + sceneTilePicker.sceneOffset.z
  );
}

function clientSceneObjectVertex(
  x: number,
  y: number,
  z: number,
  placement: NhArenaObjectPlacement
): { readonly x: number; readonly y: number; readonly z: number } {
  let clientX = x;
  let clientZ = placementBoolean(placement, "isRotated", false) ? -z : z;
  const orientation = placement.orientation & 3;
  if (orientation === 1) {
    const previousX = clientX;
    clientX = clientZ;
    clientZ = -previousX;
  } else if (orientation === 2) {
    clientX = -clientX;
    clientZ = -clientZ;
  } else if (orientation === 3) {
    const previousZ = clientZ;
    clientZ = clientX;
    clientX = -previousZ;
  }

  return {
    x: clientX * (placementNumber(placement, "modelSizeX", 128) / 128) + placementNumber(placement, "offsetX", 0),
    y: y * (placementNumber(placement, "modelSizeHeight", 128) / 128) + placementNumber(placement, "offsetHeight", 0),
    z: clientZ * (placementNumber(placement, "modelSizeY", 128) / 128) + placementNumber(placement, "offsetY", 0)
  };
}

function sceneObjectCenterHeight(
  boundary: RuntimeSceneBoundary,
  placement: NhArenaObjectPlacement,
  collisionMap: NhSceneCollision
): number {
  const footprint = clientObjectFootprint(placement);
  const centerX = placement.x + footprint.sizeX / 2;
  const centerY = placement.y + footprint.sizeY / 2;
  const fallback = sampleSceneHeightForWorldTile(boundary, collisionMap, centerX, centerY);
  const west = placement.x + (footprint.sizeX >> 1);
  const east = placement.x + ((footprint.sizeX + 1) >> 1);
  const south = placement.y + (footprint.sizeY >> 1);
  const north = placement.y + ((footprint.sizeY + 1) >> 1);

  return (
    sampleSceneHeightForWorldTile(boundary, collisionMap, east, north, fallback) +
    sampleSceneHeightForWorldTile(boundary, collisionMap, west, south, fallback) +
    sampleSceneHeightForWorldTile(boundary, collisionMap, east, south, fallback) +
    sampleSceneHeightForWorldTile(boundary, collisionMap, west, north, fallback)
  ) / 4;
}

function sampleSceneHeightForWorldTile(
  boundary: RuntimeSceneBoundary,
  collisionMap: NhSceneCollision,
  worldX: number,
  worldY: number,
  fallback = 0
): number {
  const sceneTilePicker = boundary.sceneTilePicker;
  if (!sceneTilePicker) {
    return fallback;
  }

  const x = (worldX - sceneTilePicker.arena.bounds.west) * NH_TILE_WORLD_UNITS + sceneTilePicker.sceneOffset.x;
  const z = (worldY - sceneTilePicker.arena.bounds.south) * NH_TILE_WORLD_UNITS + sceneTilePicker.sceneOffset.z;
  const sampled = collisionMap.sampleHeight({ x, z });
  return Number.isFinite(sampled) ? sampled : fallback;
}

function placementModelIds(placement: NhArenaObjectPlacement): readonly number[] {
  const modelIds = (placement as { readonly modelIds?: unknown }).modelIds;
  return Array.isArray(modelIds) ? modelIds.filter((modelId): modelId is number => Number.isInteger(modelId)) : [];
}

function placementNumber(
  placement: NhArenaObjectPlacement,
  key: "modelSizeX" | "modelSizeHeight" | "modelSizeY" | "offsetX" | "offsetHeight" | "offsetY" | "contouredGround",
  fallback: number
): number {
  const value = (placement as unknown as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function placementBoolean(placement: NhArenaObjectPlacement, key: "isRotated", fallback: boolean): boolean {
  const value = (placement as unknown as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : fallback;
}

function isSceneObjectGroundContoured(placement: NhArenaObjectPlacement): boolean {
  return placementNumber(placement, "contouredGround", -1) >= 0;
}

function isNhCacheModelDefinition(value: unknown): value is NhCacheModelDefinition {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray((value as NhCacheModelDefinition).vertexPositionsX) &&
    Array.isArray((value as NhCacheModelDefinition).vertexPositionsY) &&
    Array.isArray((value as NhCacheModelDefinition).vertexPositionsZ) &&
    Array.isArray((value as NhCacheModelDefinition).faceVertexIndices1) &&
    Array.isArray((value as NhCacheModelDefinition).faceVertexIndices2) &&
    Array.isArray((value as NhCacheModelDefinition).faceVertexIndices3) &&
    Array.isArray((value as NhCacheModelDefinition).faceColors)
  );
}

interface RuntimeSourceHitRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly depthClientUnits: number;
  readonly sourceFaceRects?: readonly RuntimeSourceFaceRect[];
}

interface RuntimeSourceFaceRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function projectWorldBoxToSourceHitRect(
  boundary: RuntimeSceneBoundary,
  min: Vector3,
  max: Vector3,
  paddingPixels: number
): RuntimeSourceHitRect | null {
  const sourceViewport = boundary.fixedClientLayout?.viewport;
  if (!sourceViewport) {
    return null;
  }
  const corners = [
    new Vector3(min.x, min.y, min.z),
    new Vector3(max.x, min.y, min.z),
    new Vector3(max.x, min.y, max.z),
    new Vector3(min.x, min.y, max.z),
    new Vector3(min.x, max.y, min.z),
    new Vector3(max.x, max.y, min.z),
    new Vector3(max.x, max.y, max.z),
    new Vector3(min.x, max.y, max.z)
  ];

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let depthClientUnits = Number.POSITIVE_INFINITY;
  for (const corner of corners) {
    const projected = nhProjectWorldPointToViewport(boundary.camera, sourceViewport, corner);
    if (!projected) {
      continue;
    }
    left = Math.min(left, projected.x);
    top = Math.min(top, projected.y);
    right = Math.max(right, projected.x);
    bottom = Math.max(bottom, projected.y);
    depthClientUnits = Math.min(depthClientUnits, projected.depthClientUnits);
  }

  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(depthClientUnits)) {
    return null;
  }
  return {
    left: left - paddingPixels,
    top: top - paddingPixels,
    right: right + paddingPixels,
    bottom: bottom + paddingPixels,
    depthClientUnits
  };
}

function pointInSourceRect(rect: RuntimeSourceHitRect, point: RuntimeViewportSourcePoint): boolean {
  if (rect.sourceFaceRects && rect.sourceFaceRects.length > 0) {
    return rect.sourceFaceRects.some((faceRect) => pointInSourceFaceRect(faceRect, point));
  }
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function pointInSourceFaceRect(rect: RuntimeSourceFaceRect, point: RuntimeViewportSourcePoint): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function sourceHorizontalClientUnitsToSceneUnits(clientUnits: number): number {
  return (clientUnits / 128) * NH_TILE_WORLD_UNITS;
}

function sourceModelHeightWorldUnits(placement: NhArenaObjectPlacement): number {
  const height = (placement as { readonly modelSizeHeight?: number }).modelSizeHeight;
  return sourceHorizontalClientUnitsToSceneUnits(typeof height === "number" && Number.isFinite(height) ? height : 128);
}

function isRuntimeTile(value: unknown): value is RuntimeTile {
  return (
    value !== null &&
    typeof value === "object" &&
    "x" in value &&
    "z" in value &&
    typeof value.x === "number" &&
    typeof value.z === "number" &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.z)
  );
}

function isNhWorldTile(value: unknown): value is NhWorldTile {
  return (
    value !== null &&
    typeof value === "object" &&
    "x" in value &&
    "y" in value &&
    "plane" in value &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.plane === "number" &&
    Number.isInteger(value.x) &&
    Number.isInteger(value.y) &&
    Number.isInteger(value.plane)
  );
}

function isRuntimeInventorySlot(value: unknown): value is RuntimeInventorySlot | null {
  if (value === null) {
    return true;
  }
  return (
    typeof value === "object" &&
    "itemId" in value &&
    "quantity" in value &&
    typeof value.itemId === "number" &&
    typeof value.quantity === "number" &&
    Number.isInteger(value.itemId) &&
    Number.isInteger(value.quantity) &&
    value.itemId > 0 &&
    value.quantity >= 0
  );
}

function isRuntimeInventory(value: unknown): value is readonly (RuntimeInventorySlot | null)[] {
  return Array.isArray(value) && value.every(isRuntimeInventorySlot);
}

function isRuntimeLoadoutId(value: unknown): value is RuntimeLoadoutId {
  return typeof value === "string" && runtimeLoadouts.some((loadout) => loadout.id === value);
}

function isTemporarySavedSetupSnapshot(value: unknown): value is TemporarySavedSetupSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const snapshot = value as Partial<TemporarySavedSetupSnapshot>;
  return (
    snapshot.version === 1 &&
    typeof snapshot.savedAt === "number" &&
    isRuntimeLoadoutId(snapshot.loadoutId) &&
    isRuntimeInventory(snapshot.inventory) &&
    Array.isArray(snapshot.equipment) &&
    snapshot.equipment.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        Number.isInteger(entry[0]) &&
        Number.isInteger(entry[1]) &&
        entry[0] >= 0 &&
        entry[1] > 0 &&
        RUNTIME_NH_STAKE_ALLOWED_SETUP_ITEM_IDS.has(entry[1])
    ) &&
    snapshot.inventory.every((slot) => slot === null || RUNTIME_NH_STAKE_ALLOWED_SETUP_ITEM_IDS.has(slot.itemId))
  );
}

function readStoredAttackSetIndex(): number | null {
  try {
    const raw = window.localStorage.getItem(NH_TRAINER_ATTACK_SET_STORAGE_KEY);
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 3 ? parsed : null;
  } catch {
    // Source: Config.ATTACK_SET is persistent account state; localStorage is the trainer's local-user backing store.
  }
  return null;
}

function writeStoredAttackSetIndex(attackSetIndex: number): void {
  try {
    window.localStorage.setItem(NH_TRAINER_ATTACK_SET_STORAGE_KEY, String(Math.max(0, Math.min(3, Math.trunc(attackSetIndex)))));
  } catch {
    // Non-fatal in restricted browser contexts.
  }
}

function readStoredAutoRetaliate(): boolean | null {
  try {
    const raw = readStoredLocalProfileValue(NH_AUTO_RETALIATE_STORAGE_KEY, LEGACY_AUTO_RETALIATE_STORAGE_KEYS);
    if (raw === "true") {
      return true;
    }
    if (raw === "false") {
      return false;
    }
  } catch {
    // RuneLite persists this via varps; localStorage is the trainer's dev-session backing store.
  }
  return null;
}

function writeStoredAutoRetaliate(enabled: boolean): void {
  try {
    window.localStorage.setItem(NH_AUTO_RETALIATE_STORAGE_KEY, String(enabled));
  } catch {
    // Non-fatal in restricted browser contexts.
  }
}

function readStoredLocalProfileValue(primaryKey: string, legacyKeys: readonly string[] = []): string | null {
  const current = window.localStorage.getItem(primaryKey);
  if (current !== null) {
    return current;
  }
  for (const legacyKey of legacyKeys) {
    const legacy = window.localStorage.getItem(legacyKey);
    if (legacy !== null) {
      window.localStorage.setItem(primaryKey, legacy);
      return legacy;
    }
  }
  return null;
}

function readStoredBoolean(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeStoredBoolean(key: string, enabled: boolean): void {
  try {
    window.localStorage.setItem(key, String(enabled));
  } catch {
    // Non-fatal in restricted browser contexts.
  }
}

function readStoredStringArray(key: string): readonly string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function writeStoredStringArray(key: string, values: readonly string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Non-fatal in restricted browser contexts.
  }
}

function readStoredSpellbookOrders(): Partial<Record<NhSpellbookId, readonly string[]>> {
  try {
    const raw = window.localStorage.getItem(NH_TRAINER_SPELLBOOK_REORDER_ORDERS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const snapshot = parsed as Partial<Record<NhSpellbookId, unknown>>;
    const orders: Partial<Record<NhSpellbookId, readonly string[]>> = {};
    for (const bookId of ["standard", "ancient", "lunar", "arceuus"] as const) {
      if (Array.isArray(snapshot[bookId])) {
        orders[bookId] = snapshot[bookId].filter((value): value is string => typeof value === "string");
      }
    }
    return orders;
  } catch {
    return {};
  }
}

function writeStoredSpellbookOrders(orders: Partial<Record<NhSpellbookId, readonly string[]>>): void {
  try {
    window.localStorage.setItem(NH_TRAINER_SPELLBOOK_REORDER_ORDERS_STORAGE_KEY, JSON.stringify(orders));
  } catch {
    // Non-fatal in restricted browser contexts.
  }
}

function swapNhWidgetOrder(
  currentOrder: readonly string[],
  sourceId: string,
  destinationId: string,
  defaultOrder: readonly string[]
): readonly string[] {
  const validIds = new Set(defaultOrder);
  const seen = new Set<string>();
  const normalized = [
    ...currentOrder.filter((id) => {
      if (!validIds.has(id) || seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    }),
    ...defaultOrder.filter((id) => !seen.has(id))
  ];
  const sourceIndex = normalized.indexOf(sourceId);
  const destinationIndex = normalized.indexOf(destinationId);
  if (sourceIndex === -1 || destinationIndex === -1 || sourceIndex === destinationIndex) {
    return normalized;
  }
  const next = [...normalized];
  next[sourceIndex] = destinationId;
  next[destinationIndex] = sourceId;
  return next;
}

function initialHudOverrideFromStorage(): Partial<RuntimeHudState> | null {
  const attackSet = typeof window === "undefined" ? null : readStoredAttackSetIndex();
  const autoRetaliate = typeof window === "undefined" ? null : readStoredAutoRetaliate();
  if (attackSet === null && autoRetaliate === null) {
    return null;
  }
  return {
    ...(attackSet === null ? {} : { attackSet }),
    ...(autoRetaliate === null ? {} : { autoRetaliate })
  };
}

function readTemporarySavedSetupSnapshot(): TemporarySavedSetupSnapshot | null {
  try {
    const raw = window.localStorage.getItem(NH_TEMPORARY_SAVED_SETUP_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (isTemporarySavedSetupSnapshot(parsed)) {
      return parsed;
    }
    window.localStorage.removeItem(NH_TEMPORARY_SAVED_SETUP_STORAGE_KEY);
  } catch {
    return null;
  }
  return null;
}

function writeTemporarySavedSetupSnapshot(snapshot: TemporarySavedSetupSnapshot): boolean {
  try {
    window.localStorage.setItem(NH_TEMPORARY_SAVED_SETUP_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

function clearTemporarySavedSetupSnapshot(): boolean {
  try {
    window.localStorage.removeItem(NH_TEMPORARY_SAVED_SETUP_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function readStoredRunelitePvpFightHistory(): readonly RunelitePvpFightHistoryEntrySnapshot[] {
  try {
    const raw = window.localStorage.getItem(NH_TRAINER_PVP_FIGHT_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(isRunelitePvpFightHistoryEntrySnapshot).slice(0, NH_TRAINER_PVP_FIGHT_HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function writeStoredRunelitePvpFightHistory(entries: readonly RunelitePvpFightHistoryEntrySnapshot[]): void {
  try {
    window.localStorage.setItem(
      NH_TRAINER_PVP_FIGHT_HISTORY_STORAGE_KEY,
      JSON.stringify(entries.slice(0, NH_TRAINER_PVP_FIGHT_HISTORY_LIMIT))
    );
  } catch {
    // Browser storage can be disabled; the live tracker still works for the current session.
  }
}

function isRunelitePvpFightHistoryEntrySnapshot(value: unknown): value is RunelitePvpFightHistoryEntrySnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as Partial<RunelitePvpFightHistoryEntrySnapshot>;
  return (
    typeof entry.id === "string" &&
    typeof entry.playerName === "string" &&
    typeof entry.opponentName === "string" &&
    typeof entry.worldLabel === "string" &&
    typeof entry.endedAtTick === "number" &&
    typeof entry.playerDead === "boolean" &&
    typeof entry.opponentDead === "boolean" &&
    Array.isArray(entry.lines)
  );
}

function mergeRunelitePvpFightHistory(
  storedEntries: readonly RunelitePvpFightHistoryEntrySnapshot[],
  newEntries: readonly RunelitePvpFightHistoryEntrySnapshot[]
): readonly RunelitePvpFightHistoryEntrySnapshot[] {
  const merged: RunelitePvpFightHistoryEntrySnapshot[] = [];
  const seenIds = new Set<string>();
  for (const entry of [...newEntries, ...storedEntries]) {
    if (seenIds.has(entry.id)) {
      continue;
    }
    seenIds.add(entry.id);
    merged.push(entry);
    if (merged.length >= NH_TRAINER_PVP_FIGHT_HISTORY_LIMIT) {
      break;
    }
  }
  return merged;
}

interface BrowserClientWindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function readBrowserClientWindowBounds(): BrowserClientWindowBounds {
  try {
    const raw = window.localStorage.getItem(NH_TRAINER_BROWSER_CLIENT_WINDOW_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isBrowserClientWindowBounds(parsed)) {
        return clampBrowserClientWindowBounds(parsed);
      }
    }
  } catch {
    // Non-fatal in restricted browser contexts.
  }
  return defaultBrowserClientWindowBounds();
}

function writeBrowserClientWindowBounds(bounds: BrowserClientWindowBounds): void {
  try {
    window.localStorage.setItem(NH_TRAINER_BROWSER_CLIENT_WINDOW_STORAGE_KEY, JSON.stringify(bounds));
  } catch {
    // Non-fatal in restricted browser contexts.
  }
}

function isBrowserClientWindowBounds(value: unknown): value is BrowserClientWindowBounds {
  if (!value || typeof value !== "object") {
    return false;
  }
  const bounds = value as Partial<BrowserClientWindowBounds>;
  return (
    typeof bounds.x === "number" &&
    typeof bounds.y === "number" &&
    typeof bounds.width === "number" &&
    typeof bounds.height === "number" &&
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height)
  );
}

function defaultBrowserClientWindowBounds(): BrowserClientWindowBounds {
  const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
  const width = Math.max(
    BROWSER_CLIENT_WINDOW_MIN_WIDTH,
    Math.min(viewportWidth - 32, 1043)
  );
  const height = Math.max(
    BROWSER_CLIENT_WINDOW_MIN_HEIGHT,
    Math.min(viewportHeight - 32, 503 + BROWSER_CLIENT_WINDOW_TITLEBAR_HEIGHT)
  );
  return clampBrowserClientWindowBounds({
    x: Math.max(8, Math.round((viewportWidth - width) / 2)),
    y: Math.max(8, Math.round((viewportHeight - height) / 2)),
    width,
    height
  });
}

function clampBrowserClientWindowBounds(bounds: BrowserClientWindowBounds): BrowserClientWindowBounds {
  const viewportWidth = typeof window === "undefined" ? bounds.width : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? bounds.height : window.innerHeight;
  const width = Math.max(
    BROWSER_CLIENT_WINDOW_MIN_WIDTH,
    Math.min(Math.max(BROWSER_CLIENT_WINDOW_MIN_WIDTH, viewportWidth), Math.round(bounds.width))
  );
  const height = Math.max(
    BROWSER_CLIENT_WINDOW_MIN_HEIGHT,
    Math.min(Math.max(BROWSER_CLIENT_WINDOW_MIN_HEIGHT, viewportHeight), Math.round(bounds.height))
  );
  return {
    width,
    height,
    x: Math.max(0, Math.min(Math.max(0, viewportWidth - width), Math.round(bounds.x))),
    y: Math.max(0, Math.min(Math.max(0, viewportHeight - height), Math.round(bounds.y)))
  };
}

function BrowserClientWindow({ children }: { readonly children: JSX.Element }): JSX.Element {
  const [bounds, setBounds] = useState<BrowserClientWindowBounds>(() => readBrowserClientWindowBounds());
  const windowRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    readonly pointerId: number;
    readonly startClientX: number;
    readonly startClientY: number;
    readonly startBounds: BrowserClientWindowBounds;
  } | null>(null);

  useEffect(() => {
    const element = windowRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    let animationFrame = 0;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const rect = element.getBoundingClientRect();
        setBounds((current) => {
          const next = clampBrowserClientWindowBounds({
            ...current,
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          });
          if (next.width === current.width && next.height === current.height && next.x === current.x && next.y === current.y) {
            return current;
          }
          writeBrowserClientWindowBounds(next);
          return next;
        });
      });
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

  useEffect(() => {
    const handleResize = (): void => {
      setBounds((current) => {
        const next = clampBrowserClientWindowBounds(current);
        if (next.width === current.width && next.height === current.height && next.x === current.x && next.y === current.y) {
          return current;
        }
        writeBrowserClientWindowBounds(next);
        return next;
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".browserClientWindow")) {
        return;
      }
      event.preventDefault();
    };

    window.addEventListener("contextmenu", handleContextMenu, { capture: true });
    return () => window.removeEventListener("contextmenu", handleContextMenu, { capture: true });
  }, []);

  const updateBounds = (nextBounds: BrowserClientWindowBounds): void => {
    const next = clampBrowserClientWindowBounds(nextBounds);
    setBounds(next);
    writeBrowserClientWindowBounds(next);
  };

  return (
    <div
      ref={windowRef}
      className="browserClientWindow"
      data-browser-client-window="true"
      data-storage-key={NH_TRAINER_BROWSER_CLIENT_WINDOW_STORAGE_KEY}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height
      }}
      onContextMenuCapture={(event) => {
        event.preventDefault();
      }}
    >
      <div
        className="browserClientWindowTitlebar"
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startBounds: bounds
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) {
            return;
          }
          event.preventDefault();
          updateBounds({
            ...drag.startBounds,
            x: drag.startBounds.x + event.clientX - drag.startClientX,
            y: drag.startBounds.y + event.clientY - drag.startClientY
          });
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) {
            return;
          }
          event.preventDefault();
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) {
            return;
          }
          dragRef.current = null;
        }}
      >
        <span>NH Trainer</span>
      </div>
      <div className="browserClientWindowContent">{children}</div>
    </div>
  );
}

function runtimePlayerCombatStateWithLocalSpecialEnergy(
  state: RuntimePlayerCombatState,
  specialEnergy: number
): RuntimePlayerCombatState {
  const actor = state.actors["local-player"];
  const clampedSpecialEnergy = Math.max(0, Math.min(100, Math.trunc(specialEnergy)));
  return {
    ...state,
    actors: {
      ...state.actors,
      "local-player": {
        ...actor,
        specialRestoreTicks: 0,
        gmaul: {
          ...actor.gmaul,
          specialEnergy: clampedSpecialEnergy
        }
      }
    }
  };
}

function runtimePlayerCombatStateWithLocalFreezeBypass(state: RuntimePlayerCombatState): RuntimePlayerCombatState {
  const actor = state.actors["local-player"];
  if (actor.locks.freezeUntilTick < 0) {
    return state;
  }
  return {
    ...state,
    actors: {
      ...state.actors,
      "local-player": {
        ...actor,
        locks: resetFreeze(actor.locks)
      }
    }
  };
}

function pointerEventToViewportPosition(
  boundary: RuntimeSceneBoundary,
  event: PointerEvent | MouseEvent
): { readonly x: number; readonly y: number } {
  return pointerEventToCanvasPosition(boundary, event) ?? { x: 0, y: 0 };
}

function pointerEventToSourceFixedClientPosition(
  boundary: RuntimeSceneBoundary,
  event: PointerEvent | MouseEvent
): { readonly x: number; readonly y: number } | null {
  const point = pointerEventToSourceViewportPoint(boundary, event);
  const sourceViewport = boundary.fixedClientLayout?.viewport;
  const layout = boundary.fixedClientCssLayout;
  if (!point || !sourceViewport || !layout) {
    return null;
  }

  return {
    x: layout.surfaceRect.x + (sourceViewport.rect.x + point.x) * layout.scale,
    y: layout.surfaceRect.y + (sourceViewport.rect.y + point.y) * layout.scale
  };
}

function actorAtRuntimeTile(snapshot: RuntimeSceneSnapshot, tile: RuntimeTile): RuntimeActorPose | null {
  let localPose: RuntimeActorPose | null = null;
  for (const pose of snapshot.actors) {
    if (!sameNhTile(pose.tile, tile)) {
      continue;
    }
    if (pose.actorId !== "local-player") {
      return pose;
    }
    localPose = pose;
  }

  return localPose;
}

function minimapDestinationTileFromCommand(tile: RuntimeTile): RuntimeTile {
  return {
    x: Math.trunc(tile.x),
    z: Math.trunc(tile.z)
  };
}

function buildNhContextEntries(
  snapshot: RuntimeSceneSnapshot,
  tile: RuntimeTile,
  selectedInventoryItem?: NhInventorySelectedItem | null,
  selectedSpell?: NhSelectedSpell | null
): readonly NhSceneContextMenuEntry[] {
  const actor = actorAtRuntimeTile(snapshot, tile);
  if (actor && actor.actorId !== "local-player") {
    return buildNhActorContextEntries(actor, tile, selectedInventoryItem, selectedSpell);
  }

  if (selectedInventoryItem || selectedSpell) {
    return [];
  }

  return [{ actionText: "Walk here", targetText: "", opcode: 23, action: "walk", targetTile: tile }];
}

function buildNhActorContextEntries(
  actor: RuntimeActorPose,
  walkTile: RuntimeTile,
  selectedInventoryItem?: NhInventorySelectedItem | null,
  selectedSpell?: NhSelectedSpell | null
): readonly NhPlayerContextMenuEntry<RuntimeTile>[] {
  return buildNhPlayerContextEntries({
    name: runtimeActorMenuName(actor),
    combatLevel: 126,
    localCombatLevel: 126,
    identifier: actor.actorId === "opponent" ? 1 : 0,
    walkTile,
    actionTile: actor.tile,
    selectedItem: selectedInventoryItem,
    selectedSpell
  });
}

function withOpponentInventoryInspectContextEntry(
  actor: RuntimeActorPose,
  entries: readonly NhPlayerContextMenuEntry<RuntimeTile>[],
  selectedInventoryItem?: NhInventorySelectedItem | null,
  selectedSpell?: NhSelectedSpell | null
): readonly NhContextMenuEntry[] {
  if (actor.actorId !== "opponent" || selectedInventoryItem || selectedSpell) {
    return entries;
  }

  const targetText = entries.find((entry) => entry.targetText.length > 0)?.targetText ?? runtimeActorMenuName(actor);
  return [
    ...entries,
    {
      action: "opponent-inventory-inspect",
      actionText: "Inspect inventory",
      targetText,
      opcode: 1007,
      identifier: 1,
      shiftClick: false,
      targetActorId: actor.actorId,
      targetTile: actor.tile
    }
  ];
}

type RunelitePvpToolsMenuRelation = "clan" | "friends" | "other";

function filterRunelitePvpToolsPlayerContextEntries(
  entries: readonly NhPlayerContextMenuEntry<RuntimeTile>[],
  actor: RuntimeActorPose,
  config: RunelitePvpToolsConfigSnapshot
): readonly NhPlayerContextMenuEntry<RuntimeTile>[] {
  // Source: PvpToolsPlugin.setCastOptions applies client.setHideFriend/ClanAttackOptions,
  // client.setHideFriend/ClanmateCastOptions, and client.setUnhiddenCasts from hideCastIgnored.
  if (!config.enabled) {
    return entries;
  }

  const relation = runelitePvpToolsActorMenuRelation(actor);
  const hideAttack =
    config.hideAttack && runelitePvpToolsModeAppliesToRelation(config.hideAttackMode, relation);
  const hideCast =
    config.hideCast && runelitePvpToolsModeAppliesToRelation(config.hideCastMode, relation);
  const unhiddenCasts = runelitePvpToolsUnhiddenCastSet(config.hideCastIgnored);

  return entries.filter((entry) => {
    if (hideAttack && entry.action === "attack") {
      return false;
    }

    if (
      hideCast &&
      entry.action === "player-spell-selected" &&
      entry.selectedSpell &&
      !unhiddenCasts.has(entry.selectedSpell.spellName.toLowerCase())
    ) {
      return false;
    }

    return true;
  });
}

function runelitePvpToolsActorMenuRelation(actor: RuntimeActorPose): RunelitePvpToolsMenuRelation {
  if (actor.actorId === "local-player") {
    return "friends";
  }
  if (actor.actorId.includes("clan")) {
    return "clan";
  }
  if (actor.actorId.includes("friend")) {
    return "friends";
  }
  return "other";
}

function runelitePvpToolsModeAppliesToRelation(
  mode: RunelitePvpToolsConfigSnapshot["hideAttackMode"],
  relation: RunelitePvpToolsMenuRelation
): boolean {
  if (mode === "Both") {
    return relation === "clan" || relation === "friends";
  }
  if (mode === "Clan") {
    return relation === "clan";
  }
  return relation === "friends";
}

function runelitePvpToolsUnhiddenCastSet(csv: string): ReadonlySet<string> {
  return new Set(
    csv
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0)
  );
}

function runelitePvpToolsActorRenderSelfVisible(actor: RuntimeActorPose, renderSelf: boolean): boolean {
  // Source: PvpToolsPlugin renderselfHotkeyListener calls client.setRenderSelf(!client.getRenderSelf()).
  return actor.actorId !== "local-player" || renderSelf;
}

function runelitePvpToolsRenderSelfHotkeyMatches(keybind: string, event: KeyboardEvent): boolean {
  const normalized = keybind.trim();
  if (!normalized || normalized.toLowerCase() === "not set") {
    return false;
  }

  const parts = normalized
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const keyPart = parts[parts.length - 1] ?? normalized;
  const modifiers = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()));
  if (
    event.ctrlKey !== modifiers.has("ctrl") ||
    event.altKey !== modifiers.has("alt") ||
    event.shiftKey !== modifiers.has("shift")
  ) {
    return false;
  }

  const expected = runelitePvpToolsNormalizeHotkeyToken(keyPart);
  return event.code.toLowerCase() === expected || event.key.toLowerCase() === expected;
}

function runelitePvpToolsNormalizeHotkeyToken(key: string): string {
  const lower = key.trim().toLowerCase();
  if (lower === "esc") {
    return "escape";
  }
  if (lower === "minus" || lower === "-") {
    return "minus";
  }
  if (lower === "equals" || lower === "=") {
    return "equal";
  }
  if (/^[a-z]$/.test(lower)) {
    return `key${lower}`;
  }
  if (/^[0-9]$/.test(lower)) {
    return `digit${lower}`;
  }
  return lower;
}

function runtimeActorMenuName(actor: RuntimeActorPose): string {
  return actor.actorId === "opponent" ? "Opponent" : actor.actorId;
}

function isNhInventoryContextMenuEntry(entry: NhContextMenuEntry): entry is NhInventoryContextMenuEntry {
  return (
    entry.action === "inventory-action" ||
    entry.action === "inventory-use" ||
    entry.action === "inventory-use-selected" ||
    entry.action === "inventory-spell-selected" ||
    entry.action === "inventory-examine"
  );
}

function isNhEquipmentItemContextMenuEntry(entry: NhContextMenuEntry): entry is NhEquipmentItemContextMenuEntry {
  return entry.action === "equipment-remove" || entry.action === "equipment-action" || entry.action === "equipment-examine";
}

function isNhGroundItemContextMenuEntry(entry: NhContextMenuEntry): entry is NhGroundItemContextMenuEntry {
  return entry.action === "ground-item-take" || entry.action === "ground-item-examine";
}

function isNhOpponentInventoryInspectContextMenuEntry(
  entry: NhContextMenuEntry
): entry is NhOpponentInventoryInspectContextMenuEntry {
  return entry.action === "opponent-inventory-inspect";
}

function isNhSourceContextMenuEntry(entry: NhContextMenuEntry): entry is NhSourceContextMenuEntry {
  return entry.action === "source-menu-entry";
}

function isNhHudWidgetContextMenuEntry(entry: NhContextMenuEntry): entry is NhHudWidgetContextMenuEntry {
  return entry.action === "hud-widget-action";
}

function isRuneliteOverlayConfigContextMenuEntry(entry: NhContextMenuEntry): entry is RuneliteOverlayConfigContextMenuEntry {
  return entry.action === "runelite-overlay-config";
}

function isNhXpDropOrbContextMenuEntry(entry: NhContextMenuEntry): entry is NhXpDropOrbContextMenuEntry {
  return entry.action === "xp-drop-orb-action" || entry.action === "xp-drop-text-size";
}

function isNhCancelContextMenuEntry(entry: NhContextMenuEntry): entry is NhCancelContextMenuEntry {
  return entry.action === "cancel";
}

function equipmentItemOpcodeForActionIndex(actionIndex: number): number {
  return actionIndex >= 6 ? equipmentItemHighActionOpcode : equipmentItemDefaultActionOpcode;
}

function isNhSceneObjectContextMenuEntry(
  entry: NhContextMenuEntry
): entry is NhSceneObjectContextMenuEntry<RuntimeTile> {
  return (
    entry.action === "object-action" ||
    entry.action === "object-use-selected" ||
    entry.action === "object-spell-selected" ||
    entry.action === "object-examine"
  );
}

function isNhPlayerContextMenuEntry(entry: NhContextMenuEntry): entry is NhPlayerContextMenuEntry<RuntimeTile> {
  if (entry.action === "walk") {
    return entry.targetText.includes("(level-");
  }
  return (
    entry.action === "attack" ||
    entry.action === "follow" ||
    entry.action === "trade" ||
    entry.action === "player-action" ||
    entry.action === "player-use-selected" ||
    entry.action === "player-spell-selected"
  );
}

function runtimeWeaponLoadoutForItemId(itemId: number): RuntimeLoadoutId | null {
  if (itemId === 6914 || itemId === 11791 || itemId === 22296) {
    return "kodai-robes";
  }
  if (itemId === 21902) {
    return "acb-hides";
  }
  if (itemId === 11802) {
    return "ags-bandos";
  }
  for (const loadoutId of Object.keys(nhLoadouts) as RuntimeLoadoutId[]) {
    const weapon = nhLoadouts[loadoutId].equipment.weapon;
    if (weapon?.itemId === itemId) {
      return loadoutId;
    }
  }
  return null;
}

function runtimeCombatSpellIdFromSelectedSpell(spell: NhSelectedSpell | null | undefined): RuntimePlayerCombatSpellId | null {
  return spell?.spellId === "blood-blitz" ||
    spell?.spellId === "ice-blitz" ||
    spell?.spellId === "blood-barrage" ||
    spell?.spellId === "ice-barrage"
    ? spell.spellId
    : null;
}

function runtimePrayerIdsFromNhStates(states: NhPrayerStates | undefined): readonly PrayerId[] {
  return nhActivePrayerIds(states).flatMap((id): PrayerId[] => {
    const runtimeId = id.split("-").join("_");
    return isRuntimePrayerId(runtimeId) ? [runtimeId] : [];
  });
}

function runtimeCombatLevelsFromHud(hud: RuntimeHudState): CombatLevels {
  return {
    attack: hud.skills?.attack?.current ?? runtimePlayerCombatDefaultLevels.attack,
    strength: hud.skills?.strength?.current ?? runtimePlayerCombatDefaultLevels.strength,
    defence: hud.skills?.defence?.current ?? runtimePlayerCombatDefaultLevels.defence,
    ranged: hud.skills?.ranged?.current ?? runtimePlayerCombatDefaultLevels.ranged,
    magic: hud.skills?.magic?.current ?? runtimePlayerCombatDefaultLevels.magic
  };
}

const runtimeStatKeys: readonly StatKey[] = ["attack", "strength", "defence", "ranged", "magic", "hitpoints", "prayer"];

function runtimeInventoryActionConsumableId(entry: NhInventoryContextMenuEntry): ConsumableId | null {
  if (entry.action !== "inventory-action") {
    return null;
  }
  const action = entry.actionText.toLowerCase();
  if (action !== "eat" && action !== "drink") {
    return null;
  }
  return runtimeConsumableIdForItemId(entry.itemId);
}

function runtimeInventoryActionConsumableKind(entry: NhInventoryContextMenuEntry): "eat" | "drink" | null {
  if (entry.action !== "inventory-action") {
    return null;
  }
  const action = entry.actionText.toLowerCase();
  return action === "eat" || action === "drink" ? action : null;
}

function runtimeSimStatsFromActorAndHud(
  actor: RuntimePlayerCombatActorState,
  hud: RuntimeHudState
): SimStats {
  const skill = (key: StatKey, currentFallback: number, fixedFallback: number) => ({
    current: currentFallback,
    fixed: hud.skills?.[key]?.fixed ?? fixedFallback
  });
  return {
    attack: skill("attack", actor.levels.attack, runtimePlayerCombatDefaultLevels.attack),
    strength: skill("strength", actor.levels.strength, runtimePlayerCombatDefaultLevels.strength),
    defence: skill("defence", actor.levels.defence, runtimePlayerCombatDefaultLevels.defence),
    ranged: skill("ranged", actor.levels.ranged, runtimePlayerCombatDefaultLevels.ranged),
    magic: skill("magic", actor.levels.magic, runtimePlayerCombatDefaultLevels.magic),
    hitpoints: {
      current: actor.hitpoints,
      fixed: actor.maxHitpoints
    },
    prayer: {
      current: hud.prayer,
      fixed: hud.prayerMax
    }
  };
}

function runtimeCombatLevelsFromSimStats(stats: SimStats): CombatLevels {
  return {
    attack: stats.attack.current,
    strength: stats.strength.current,
    defence: stats.defence.current,
    ranged: stats.ranged.current,
    magic: stats.magic.current
  };
}

function runtimeHudOverrideFromSimStats(stats: SimStats, current: RuntimeHudState): Partial<RuntimeHudState> {
  const skills = { ...(current.skills ?? {}) };
  for (const key of runtimeStatKeys) {
    skills[key] = stats[key];
  }
  return {
    hitpoints: stats.hitpoints.current,
    hitpointsMax: stats.hitpoints.fixed,
    prayer: stats.prayer.current,
    prayerMax: stats.prayer.fixed,
    skills
  };
}

function runtimeManualCombatAuthoritativeHud(mergedHud: RuntimeHudState, combatHud: RuntimeHudState): RuntimeHudState {
  const skills = {
    ...(mergedHud.skills ?? {}),
    hitpoints: combatHud.skills?.hitpoints ?? {
      current: combatHud.hitpoints,
      fixed: combatHud.hitpointsMax
    }
  };

  return {
    ...mergedHud,
    hitpoints: combatHud.hitpoints,
    hitpointsMax: combatHud.hitpointsMax,
    specialEnergy: combatHud.specialEnergy,
    specialActive: combatHud.specialActive,
    attackSet: combatHud.attackSet,
    autocast: combatHud.autocast,
    defensiveCast: combatHud.defensiveCast,
    skills
  };
}

function runtimeCombatActorRespawnedForFreshFightReset(
  before: RuntimePlayerCombatActorState,
  after: RuntimePlayerCombatActorState,
  tick: number
): boolean {
  return before.deadUntilTick !== null &&
    before.deadUntilTick <= tick &&
    after.deadUntilTick === null &&
    after.hitpoints > 0;
}

function isRuntimePrayerId(value: string): value is PrayerId {
  return (
    value === "thick_skin" ||
    value === "burst_of_strength" ||
    value === "clarity_of_thought" ||
    value === "rock_skin" ||
    value === "superhuman_strength" ||
    value === "improved_reflexes" ||
    value === "rapid_restore" ||
    value === "rapid_heal" ||
    value === "protect_item" ||
    value === "steel_skin" ||
    value === "ultimate_strength" ||
    value === "incredible_reflexes" ||
    value === "protect_from_magic" ||
    value === "protect_from_missiles" ||
    value === "protect_from_melee" ||
    value === "retribution" ||
    value === "smite" ||
    value === "redemption" ||
    value === "sharp_eye" ||
    value === "mystic_will" ||
    value === "hawk_eye" ||
    value === "mystic_lore" ||
    value === "mystic_might" ||
    value === "eagle_eye" ||
    value === "chivalry" ||
    value === "piety" ||
    value === "rigour" ||
    value === "augury" ||
    value === "preserve"
  );
}

function clickCrossStyle(
  cross: NhClickCrossState,
  spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, RuntimeSpriteAtlas>,
  definitions: NhClickCrossDefinitionStore,
  layout: NhFixedClientCssLayout | null
): CSSProperties {
  if (!layout) {
    return { display: "none" };
  }

  const scale = layout.scale;
  const atlas = spriteAtlases.get("click_cross");
  const definition = nhClickCrossDefinition(definitions, cross.color, cross.frame);
  const sprite = definition ? atlas?.sprites.get(definition.spriteId) : undefined;
  const drawOffset = definition?.drawOffset ?? NH_MOUSE_CROSS_DRAW_OFFSET;
  if (!atlas || !sprite) {
    return { display: "none" };
  }

  return {
    left: cross.x - drawOffset * scale + sprite.offsetX * scale,
    top: cross.y - drawOffset * scale + sprite.offsetY * scale,
    width: sprite.width,
    height: sprite.height,
    backgroundImage: `url(render/sprites/${atlas.metadata.image})`,
    backgroundPosition: `-${sprite.x}px -${sprite.y}px`,
    backgroundSize: `${atlas.metadata.width}px ${atlas.metadata.height}px`,
    transform: `scale(${scale})`,
    transformOrigin: "left top"
  };
}

const NH_CONTEXT_MENU_BROWSER_X_SCALE = 0.9;

function contextMenuStyleWithFont(
  menu: NhContextMenuState,
  layout: NhFixedClientCssLayout | null,
  font: NhClientFontDefinition | null,
  atlas: RuntimeSpriteAtlas | undefined
): CSSProperties {
  if (!font || !atlas || !layout) {
    return { display: "none" };
  }

  const scale = layout.scale;
  const surface = layout.surfaceRect;
  const sourceWidth = surface.width / scale;
  const sourceHeight = surface.height / scale;
  if (menu.sourceRect) {
    const visualLeft =
      surface.x + (menu.sourceRect.x + menu.sourceRect.width * (1 - NH_CONTEXT_MENU_BROWSER_X_SCALE) / 2) * scale;
    return {
      left: visualLeft,
      top: surface.y + menu.sourceRect.y * scale,
      width: menu.sourceRect.width,
      height: menu.sourceRect.height,
      transform: `scale(${scale * NH_CONTEXT_MENU_BROWSER_X_SCALE}, ${scale})`,
      transformOrigin: "left top"
    };
  }

  const sourceX = (menu.x - surface.x) / scale;
  const sourceY = (menu.y - surface.y) / scale;
  const rect = resolveNhContextMenuRect(sourceX, sourceY, menu.entries, {
    width: sourceWidth,
    height: sourceHeight
  }, font);
  const visualLeft = surface.x + (rect.x + rect.width * (1 - NH_CONTEXT_MENU_BROWSER_X_SCALE) / 2) * scale;

  return {
    left: visualLeft,
    top: surface.y + rect.y * scale,
    width: rect.width,
    height: rect.height,
    transform: `scale(${scale * NH_CONTEXT_MENU_BROWSER_X_SCALE}, ${scale})`,
    transformOrigin: "left top"
  };
}

function runeliteOverlayConfigContextEntries(
  event: PointerEvent | MouseEvent,
  overlayMenuConfig: RuneliteOverlayMenuConfigSnapshot
): readonly RuneliteOverlayConfigContextMenuEntry[] {
  if (overlayMenuConfig.requireShift && !event.shiftKey) {
    return [];
  }

  const target = event.target instanceof Element ? event.target : null;
  const shellRoot = target?.closest(".runeliteClientPanel") ?? document.querySelector(".runeliteClientPanel");
  if (!shellRoot) {
    return [];
  }

  const overlayElements = Array.from(
    shellRoot.querySelectorAll<HTMLElement>("[data-runelite-overlay-menu-target][data-runelite-config-plugin-id]")
  );

  return overlayElements.flatMap((element, index): readonly RuneliteOverlayConfigContextMenuEntry[] => {
    const rect = element.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return [];
    }

    const pluginId = element.dataset.runeliteConfigPluginId ?? "";
    const overlayTarget = element.dataset.runeliteOverlayMenuTarget ?? "";
    if (!pluginId || !overlayTarget) {
      return [];
    }

    return [
      {
        action: "runelite-overlay-config",
        actionText: "Configure",
        targetText: overlayTarget,
        opcode: RUNELITE_OVERLAY_MENU_OPCODE,
        identifier: index,
        pluginId,
        overlayTarget,
        sourceOverlay: element.dataset.sourceOverlay ?? "",
        sourceOverlayMenuOpcode: "RUNELITE_OVERLAY_CONFIG"
      }
    ];
  });
}

function loadGlb(url: string): Promise<GLTF> {
  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to load ${url}: ${response.status}`);
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to parse ${url}: ${detail}`);
  }
}

async function loadOptionalJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (response.status === 404) {
      return null;
    }
    if (response.headers.get("content-type")?.includes("text/html")) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`failed to load ${url}: ${response.status}`);
    }
    try {
      return (await response.json()) as T;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`failed to parse ${url}: ${detail}`);
    }
  } catch (error) {
    if (error instanceof TypeError || (error instanceof Error && error.message.includes("Failed to fetch"))) {
      return null;
    }
    throw error;
  }
}

async function loadAnimationFixtures(): Promise<NhAnimationFixtures> {
  const sequenceNames: RuntimeSequenceName[] = [
    "idle",
    "walk",
    "consume",
    "whip_attack",
    "godsword_attack",
    "ags_special",
    "gmaul_special",
    "crossbow_attack",
    "blitz_cast",
    "barrage_cast"
  ];
  const [frameStore, rawSequences, sequenceEntries] = await Promise.all([
    loadJson<NhAnimationFrameStore>("assets/animations/frames.json"),
    loadJson<NhRawSequenceStore>("assets/animations/sequences.json"),
    Promise.all(
      sequenceNames.map(async (name) => {
        const sequence = await loadJson<NhRenderSequenceDefinition>(`render/sequences/${name}.json`);
        return [name, sequence] as const satisfies readonly [string, NhRenderSequenceDefinition];
      })
    )
  ]);
  const namedSequences = new Map<string, NhRenderSequenceDefinition>(
    sequenceEntries.map(([name, sequence]) => [name, mergeNhRawSequenceMetadata(sequence, rawSequences)])
  );
  const sourceReadySequences: readonly (readonly [RuntimeSequenceName, string])[] = [
    ["turn", "823"],
    ["walk_back", "820"],
    ["walk_left", "821"],
    ["walk_right", "822"],
    ["wand_ready", "813"],
    ["wand_turn", "1209"],
    ["wand_walk", "1205"],
    ["wand_walk_back", "1206"],
    ["wand_walk_left", "1207"],
    ["wand_walk_right", "1208"],
    ["wand_run", "1210"],
    ["wand_attack", "393"],
    ["whip_turn", "823"],
    ["whip_walk", "1660"],
    ["whip_walk_back", "1660"],
    ["whip_walk_left", "1660"],
    ["whip_walk_right", "1660"],
    ["whip_run", "1661"],
    ["gmaul_ready", "1662"],
    ["gmaul_turn", "823"],
    ["gmaul_walk", "1663"],
    ["gmaul_walk_back", "1663"],
    ["gmaul_walk_left", "1663"],
    ["gmaul_walk_right", "1663"],
    ["gmaul_run", "1664"],
    ["gmaul_attack", "1665"],
    ["godsword_ready", "7053"],
    ["godsword_turn", "7044"],
    ["godsword_walk", "7052"],
    ["godsword_walk_back", "7048"],
    ["godsword_walk_left", "7048"],
    ["godsword_walk_right", "7047"],
    ["godsword_run", "7043"],
    ["godsword_attack", "7045"],
    ["ags_special", "7644"],
    ["crossbow_ready", "4591"],
    ["crossbow_turn", "823"],
    ["crossbow_walk", "4226"],
    ["crossbow_walk_back", "4227"],
    ["crossbow_walk_left", "821"],
    ["crossbow_walk_right", "822"],
    ["crossbow_run", "4228"]
  ];
  for (const [name, sequenceId] of sourceReadySequences) {
    const rawSequence = rawSequences[sequenceId];
    if (rawSequence) {
      namedSequences.set(name, {
        name,
        ...nhRenderSequenceFromRawSequence(rawSequence)
      });
    }
  }
  const rawRunSequence = rawSequences["824"];
  if (rawRunSequence) {
    namedSequences.set("run", nhRenderSequenceFromRawSequence(rawRunSequence));
  }
  const rawConsumeSequence = rawSequences["829"];
  if (rawConsumeSequence) {
    namedSequences.set("consume", nhRenderSequenceFromRawSequence(rawConsumeSequence));
  }
  const sequencesById = new Map<number, NhRenderSequenceDefinition>(
    Object.values(rawSequences).map((sequence) => [sequence.id, nhRenderSequenceFromRawSequence(sequence)])
  );
  for (const [, sequence] of namedSequences) {
    if (sequence.sequenceId !== undefined) {
      sequencesById.set(sequence.sequenceId, sequence);
    }
  }

  return {
    frameStore,
    sequences: namedSequences,
    sequencesById
  };
}

function mergeNhRawSequenceMetadata(
  sequence: NhRenderSequenceDefinition,
  rawSequences: NhRawSequenceStore
): NhRenderSequenceDefinition {
  const rawSequence = sequence.sequenceId === undefined ? null : rawSequences[String(sequence.sequenceId)] ?? null;
  if (!rawSequence) {
    return sequence;
  }
  const rawRenderSequence = nhRenderSequenceFromRawSequence(rawSequence);
  return {
    ...sequence,
    stretches: rawRenderSequence.stretches,
    forcedPriority: rawRenderSequence.forcedPriority,
    precedenceAnimating: rawRenderSequence.precedenceAnimating,
    priority: rawRenderSequence.priority,
    replyMode: rawRenderSequence.replyMode
  };
}

function actorSequenceDefinitionsFromAnimationFixtures(
  fixtures: NhAnimationFixtures
): NhActorSequenceDefinitionStore {
  return createNhActorSequenceDefinitionStore([...fixtures.sequences.values()]);
}

async function loadCacheGlbManifest(): Promise<NhCacheGlbManifest> {
  return loadJson<NhCacheGlbManifest>("assets/models/cache-glb-manifest.json");
}

function runtimeUrlFromFixturePath(fixturePath: string): string {
  return fixturePath.replace(/^fixtures\//, "");
}

function spotanimArtifactsFromManifest(manifest: NhCacheGlbManifest): ReadonlyMap<number, NhSpotanimArtifact> {
  return new Map(
    manifest.exports
      .filter((entry): entry is NhCacheGlbManifestEntry & { readonly spotanimId: number } =>
        Number.isInteger(entry.spotanimId)
      )
      .map((entry) => [
        entry.spotanimId,
        {
          label: entry.label,
          artifactUrl: runtimeUrlFromFixturePath(entry.output),
          meshMetadataUrl: entry.meshMetadata ? runtimeUrlFromFixturePath(entry.meshMetadata) : undefined
        }
      ])
  );
}

async function loadProjectileDefinitions(): Promise<NhProjectileDefinitionMap> {
  const [store, manifest] = await Promise.all([
    loadJson<NhProjectileDefinitionStore>("assets/defs/projectiles.json"),
    loadCacheGlbManifest()
  ]);
  const artifacts = spotanimArtifactsFromManifest(manifest);
  return new Map(
    store.projectiles.map((projectile) => [
      projectile.id,
      {
        ...projectile,
        artifactUrl: artifacts.get(projectile.projectileGfxId)?.artifactUrl,
        impactArtifactUrl: artifacts.get(projectile.impactGfxId)?.artifactUrl
      }
    ])
  );
}

async function loadSpotanimDefinitions(): Promise<ReadonlyMap<number, NhSpotanimDefinition>> {
  const [store, manifest] = await Promise.all([
    loadJson<Record<string, NhSpotanimDefinition>>("assets/defs/spotanims.json"),
    loadCacheGlbManifest()
  ]);
  const artifacts = spotanimArtifactsFromManifest(manifest);
  return new Map(
    Object.values(store).map((spotanim) => [
      spotanim.id,
      {
        ...spotanim,
        ...artifacts.get(spotanim.id)
      }
    ])
  );
}

async function loadFixedClientLayout(): Promise<NhFixedClientLayout> {
  const [widgets, spellbooks] = await Promise.all([
    loadJson<NhClientWidgetDefinitions>("assets/defs/client-widgets.json"),
    loadJson<NhSpellbookDefinitions>("assets/defs/spellbooks.json")
  ]);
  return resolveNhFixedClientLayout(widgets, spellbooks);
}

async function loadFloorDefinitions(): Promise<NhFloorDefinitionStore> {
  return loadJson<NhFloorDefinitionStore>("assets/defs/floors.json");
}

async function loadTerrainTextureDefinitions(): Promise<NhTextureDefinitionStore> {
  return loadJson<NhTextureDefinitionStore>("assets/defs/textures.json");
}

async function loadInventoryItemDefinitions(): Promise<NhInventoryItemDefinitionStore> {
  return createNhInventoryItemDefinitionStore(await loadJson<unknown>("assets/defs/cache-items.json"));
}

async function loadInventoryEquipmentDefinitions(): Promise<NhInventoryEquipmentDefinitionStore> {
  return createNhInventoryEquipmentDefinitionStore(await loadJson<unknown>("assets/defs/server-items.json"));
}

async function loadWeaponTypeDefinitions(): Promise<NhWeaponTypeDefinitionStore> {
  return createNhWeaponTypeDefinitionStore(await loadJson<unknown>("assets/defs/weapon-types.json"));
}

async function loadHitsplatDefinitions(): Promise<NhHitsplatDefinitionStore> {
  return createNhHitsplatDefinitionStore(await loadJson<unknown>("assets/defs/hitsplats.json"));
}

async function loadHealthBarDefinitions(): Promise<NhHealthBarDefinitionStore> {
  return createNhHealthBarDefinitionStore(await loadJson<unknown>("assets/defs/healthbars.json"));
}

async function loadOverheadIconDefinitions(): Promise<NhOverheadIconDefinitionStore> {
  return createNhOverheadIconDefinitionStore(await loadJson<unknown>("assets/defs/overhead-icons.json"));
}

async function loadClientFonts(): Promise<NhClientFontStore> {
  return createNhClientFontStore(await loadJson<unknown>("assets/defs/client-fonts.json"));
}

async function loadPlayerModelSources(): Promise<NhPlayerModelSources> {
  const [cacheItems, kits, cacheModels, serverItems, bodyColors, textures] = await Promise.all([
    loadJson<NhPlayerModelSources["cacheItems"]>("assets/defs/cache-items.json"),
    loadJson<NhPlayerModelSources["kits"]>("assets/defs/kits.json"),
    loadJson<NhPlayerModelSources["cacheModels"]>("assets/models/cache-models.json"),
    loadJson<NhPlayerModelSources["serverItems"]>("assets/defs/server-items.json"),
    loadJson<NhPlayerModelSources["bodyColors"]>("assets/defs/body-colors.json"),
    loadJson<NonNullable<NhPlayerModelSources["textures"]>>("assets/defs/textures.json")
  ]);
  return { cacheItems, kits, cacheModels, serverItems, bodyColors, textures };
}

function loadTexture(url: string): Promise<Texture> {
  const loader = new TextureLoader();
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

async function loadSpriteAtlases(): Promise<ReadonlyMap<RuntimeSpriteSheetId, RuntimeSpriteAtlas>> {
  const sheetIds: RuntimeSpriteSheetId[] = [
    "prayer_overheads",
    "pk_skull",
    "click_cross",
    "client_p11_font",
    "client_p12_font",
    "context_menu_font",
    "client_ui",
    "compass",
    "item_sprites",
    "emote_icons",
    "prayer_icons",
    "spell_icons",
    "minimap_map_dots",
    "minimap_map_markers",
    "minimap_map_icons",
    "minimap_map_scenes",
    "hitsplats",
    "hitsplat_digits",
    "health_bars"
  ];
  const entries = await Promise.all(
    sheetIds.map(async (id) => {
      const metadata = await loadJson<SpriteAtlasMetadata>(`render/sprites/${id}.json`);
      const texture = await loadTexture(`render/sprites/${metadata.image}`);
      texture.magFilter = NearestFilter;
      texture.minFilter = NearestFilter;
      texture.needsUpdate = true;
      return [
        id,
        {
          id,
          texture,
          metadata,
          sprites: new Map(metadata.sprites.map((sprite) => [sprite.spriteId, sprite])),
          spriteFrames: new Map(metadata.sprites.map((sprite) => [spriteAtlasFrameKey(sprite.spriteId, sprite.frame), sprite]))
        }
      ] as const;
    })
  );

  return new Map(entries);
}

function spriteAtlasFrameKey(spriteId: number, spriteFrame: number): string {
  return `${spriteId}:${spriteFrame}`;
}

interface NhContextMenuTextProps {
  readonly text: string;
  readonly font: NhClientFontDefinition | null;
  readonly atlas: RuntimeSpriteAtlas | undefined;
  readonly left: number;
  readonly baseline: number;
  readonly color: string;
}

function NhContextMenuText({ text, font, atlas, left, baseline, color }: NhContextMenuTextProps) {
  if (!font || !atlas) {
    return (
      <span className="nhContextMenuText" data-source-glyph-missing="true">
        <span className="nhContextMenuAccessibleText">{text}</span>
      </span>
    );
  }

  const imageUrl = `render/sprites/${atlas.metadata.image}`;
  return (
    <span
      className="nhContextMenuText"
      data-source-font-id={font.fontId}
      data-source-font-archive={font.fontArchiveName}
      data-source-glyph-atlas={atlas.id}
      style={{ "--nh-context-menu-text-color": color } as CSSProperties}
    >
      <span className="nhContextMenuAccessibleText">{text}</span>
      {layoutNhClientFontGlyphs(font, text).map((glyph, index) => {
        const sprite = atlas.sprites.get(glyph.charCode);
        if (!sprite || glyph.charCode === 32) {
          return null;
        }

        return (
          <span
            key={`${glyph.charCode}-${index}-${glyph.x}`}
            className="nhContextMenuGlyph"
            data-char-code={glyph.charCode}
            data-source-sprite-id={sprite.spriteId}
            style={{
              left: left + glyph.x + (sprite.leftBearing ?? 0),
              top: baseline - font.ascent + (sprite.topBearing ?? 0),
              width: sprite.width,
              height: sprite.height,
              WebkitMaskImage: `url(${imageUrl})`,
              maskImage: `url(${imageUrl})`,
              WebkitMaskPosition: `-${sprite.x}px -${sprite.y}px`,
              maskPosition: `-${sprite.x}px -${sprite.y}px`,
              WebkitMaskSize: `${atlas.metadata.width}px ${atlas.metadata.height}px`,
              maskSize: `${atlas.metadata.width}px ${atlas.metadata.height}px`
            }}
          />
        );
      })}
    </span>
  );
}

const RUNTIME_EQUIPMENT_SLOT_ORDER: readonly EquipmentSlot[] = [
  "head",
  "cape",
  "amulet",
  "weapon",
  "body",
  "shield",
  "legs",
  "hands",
  "feet",
  "ring",
  "ammo"
];

interface RuntimeOpponentInventoryInspectSlot {
  readonly slotIndex: number;
  readonly slot: RuntimeInventorySlot | null;
  readonly itemName: string;
}

function runtimeInventoryItemName(
  itemDefinitions: NhInventoryItemDefinitionStore,
  itemId: number
): string {
  return itemDefinitions.get(itemId)?.name ?? RUNTIME_NH_STAKE_ITEM_NAMES.get(itemId) ?? `Item ${itemId}`;
}

function runtimeOpponentInventoryInspectSlots(
  actor: RuntimePlayerCombatActorState,
  itemDefinitions: NhInventoryItemDefinitionStore
): readonly RuntimeOpponentInventoryInspectSlot[] {
  return runtimeNhStakeInventorySlotsForSupplies(actor.supplies).map((slot, slotIndex) => {
    if (!slot) {
      return { slotIndex, slot: null, itemName: "" };
    }

    return {
      slotIndex,
      slot,
      itemName: runtimeInventoryItemName(itemDefinitions, slot.itemId)
    };
  });
}

function runtimeInventoryItemSprite(
  atlas: RuntimeSpriteAtlas | undefined,
  itemId: number,
  quantity: number
): SpriteAtlasEntry | null {
  if (!atlas) {
    return null;
  }

  const normalizedQuantity = Math.max(1, Math.trunc(quantity));
  const matches = atlas.metadata.sprites.filter((sprite) => (sprite.itemId ?? sprite.spriteId) === itemId);
  const normalMatches = matches.filter((sprite) => sprite.variant === "normal");
  return (
    runtimeBestQuantityItemSprite(normalMatches, normalizedQuantity) ??
    runtimeBestQuantityItemSprite(matches, normalizedQuantity) ??
    null
  );
}

function runtimeBestQuantityItemSprite(
  sprites: readonly SpriteAtlasEntry[],
  quantity: number
): SpriteAtlasEntry | null {
  let best: SpriteAtlasEntry | null = null;
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
  return best ?? sprites[0] ?? null;
}

function runtimeItemSpriteStyle(atlas: RuntimeSpriteAtlas, sprite: SpriteAtlasEntry): CSSProperties {
  return {
    width: sprite.width,
    height: sprite.height,
    backgroundImage: `url(render/sprites/${atlas.metadata.image})`,
    backgroundPosition: `-${sprite.x}px -${sprite.y}px`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${atlas.metadata.width}px ${atlas.metadata.height}px`,
    transform: `translate(${sprite.offsetX}px, ${sprite.offsetY}px)`
  };
}

function OpponentInventoryInspectPanel({
  actor,
  itemAtlas,
  itemDefinitions,
  onClose
}: {
  readonly actor: RuntimePlayerCombatActorState;
  readonly itemAtlas: RuntimeSpriteAtlas | undefined;
  readonly itemDefinitions: NhInventoryItemDefinitionStore;
  readonly onClose: () => void;
}): JSX.Element {
  const startSupplies = runtimeNhStakeSupplies();
  const inspectSlots = runtimeOpponentInventoryInspectSlots(actor, itemDefinitions);
  const supplyRows = RUNTIME_CONSUMABLE_IDS.filter(
    (id) => actor.supplies[id] > 0 || startSupplies[id] > 0
  );
  const equipmentRows = RUNTIME_EQUIPMENT_SLOT_ORDER.flatMap((slotId) => {
    const item = actor.equipment[slotId];
    return item ? [{ slotId, item }] : [];
  });

  return (
    <div
      className="opponentInventoryInspect"
      data-live-supplies={JSON.stringify(actor.supplies)}
      data-source-supply-counts="sim/nh/duel.ts createSuppliesFromInventory; runtime-policy-opponent.ts runtimePolicySuppliesForInventorySlots"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="opponentInventoryInspectHeader">
        <span>Opponent inventory</span>
        <button type="button" onClick={onClose} aria-label="Close opponent inventory inspect">
          x
        </button>
      </div>
      <div className="opponentInventoryInspectBody">
        <div className="opponentInventoryInspectGrid" aria-label="Opponent inventory slots">
          {inspectSlots.map(({ slotIndex, slot, itemName }) => {
            const sprite = slot ? runtimeInventoryItemSprite(itemAtlas, slot.itemId, slot.quantity) : null;
            return (
              <div
                key={slotIndex}
                className="opponentInventoryInspectSlot"
                data-slot-index={slotIndex}
                data-item-id={slot?.itemId ?? ""}
                title={slot ? itemName : "Empty"}
              >
                {slot && sprite && itemAtlas ? (
                  <span
                    className="opponentInventoryInspectItemSprite"
                    aria-label={itemName}
                    style={runtimeItemSpriteStyle(itemAtlas, sprite)}
                  />
                ) : slot ? (
                  <span className="opponentInventoryInspectItemText">{itemName}</span>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="opponentInventoryInspectSummary">
          <div className="opponentInventoryInspectSectionTitle">Supplies</div>
          {supplyRows.map((id) => (
            <div key={id} className="opponentInventoryInspectRow">
              <span>{consumableDefinitions[id].label}</span>
              <span>{Math.trunc(actor.supplies[id])}/{Math.trunc(startSupplies[id])}</span>
            </div>
          ))}
          <div className="opponentInventoryInspectSectionTitle">Equipment</div>
          {equipmentRows.map(({ slotId, item }) => (
            <div key={slotId} className="opponentInventoryInspectRow">
              <span>{slotId}</span>
              <span>{item.name || runtimeInventoryItemName(itemDefinitions, item.itemId)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RuneliteXpDropGlyphText({
  atlas,
  color,
  font,
  height,
  text,
  width
}: {
  readonly atlas: RuntimeSpriteAtlas | undefined;
  readonly color: string;
  readonly font: NhClientFontDefinition | null;
  readonly height: number;
  readonly text: string;
  readonly width: number;
}): JSX.Element {
  if (!font || !atlas) {
    return (
      <span className="runeliteXpDropText" data-source-glyph-missing="true" style={{ height }}>
        {text}
      </span>
    );
  }

  const imageUrl = `render/sprites/${atlas.metadata.image}`;
  const baseline = font.maxAscent;
  const left = width - nhClientFontStringWidth(font, text);
  return (
    <span
      className="runeliteXpDropGlyphText"
      data-source-font-id={font.fontId}
      data-source-font-archive={font.fontArchiveName}
      data-source-glyph-atlas={atlas.id}
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        width,
        height,
        "--runelite-xp-drop-text-color": color
      } as CSSProperties}
    >
      <span className="nhWidgetAccessibleText">{text}</span>
      {layoutNhClientFontGlyphs(font, text).map((glyph, index) => {
        const sprite = atlas.sprites.get(glyph.charCode);
        if (!sprite || glyph.charCode === 32) {
          return null;
        }
        const glyphLeft = left + glyph.x + (sprite.leftBearing ?? 0);
        const glyphTop = baseline - font.ascent + (sprite.topBearing ?? 0);
        return (
          <span
            key={`shadow-${glyph.charCode}-${index}-${glyph.x}`}
            className="runeliteXpDropGlyph runeliteXpDropGlyphShadow"
            data-char-code={glyph.charCode}
            data-source-sprite-id={sprite.spriteId}
            style={{
              left: glyphLeft + 1,
              top: glyphTop + 1,
              width: sprite.width,
              height: sprite.height,
              WebkitMaskImage: `url(${imageUrl})`,
              maskImage: `url(${imageUrl})`,
              WebkitMaskPosition: `-${sprite.x}px -${sprite.y}px`,
              maskPosition: `-${sprite.x}px -${sprite.y}px`,
              WebkitMaskSize: `${atlas.metadata.width}px ${atlas.metadata.height}px`,
              maskSize: `${atlas.metadata.width}px ${atlas.metadata.height}px`
            }}
          />
        );
      })}
      {layoutNhClientFontGlyphs(font, text).map((glyph, index) => {
        const sprite = atlas.sprites.get(glyph.charCode);
        if (!sprite || glyph.charCode === 32) {
          return null;
        }
        return (
          <span
            key={`text-${glyph.charCode}-${index}-${glyph.x}`}
            className="runeliteXpDropGlyph runeliteXpDropGlyphFill"
            data-char-code={glyph.charCode}
            data-source-sprite-id={sprite.spriteId}
            style={{
              left: left + glyph.x + (sprite.leftBearing ?? 0),
              top: baseline - font.ascent + (sprite.topBearing ?? 0),
              width: sprite.width,
              height: sprite.height,
              WebkitMaskImage: `url(${imageUrl})`,
              maskImage: `url(${imageUrl})`,
              WebkitMaskPosition: `-${sprite.x}px -${sprite.y}px`,
              maskPosition: `-${sprite.x}px -${sprite.y}px`,
              WebkitMaskSize: `${atlas.metadata.width}px ${atlas.metadata.height}px`,
              maskSize: `${atlas.metadata.width}px ${atlas.metadata.height}px`
            }}
          />
        );
      })}
    </span>
  );
}

function RuneliteMouseHighlightTooltip({
  tooltip
}: {
  readonly tooltip: RuneliteMouseHighlightTooltipSnapshot;
}): JSX.Element {
  return (
    <div
      className="runeliteMouseHighlightTooltip"
      data-menu-action={tooltip.actionText}
      data-menu-opcode={tooltip.opcode}
      data-menu-region={tooltip.region}
      data-menu-target={tooltip.targetText}
      data-source-plugin="MouseHighlightPlugin"
      data-source-overlay="MouseHighlightOverlay"
      data-source-tooltip-overlay="TooltipOverlay position TOOLTIP priority HIGHEST layer ALWAYS_ON_TOP"
      data-source-background-color={RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_BACKGROUND_RGBA}
      data-source-padding={RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_PADDING}
      style={runeliteMouseHighlightTooltipStyle(tooltip)}
    >
      {tooltip.text.split("</br>").map((line, lineIndex) => (
        <span className="runeliteMouseHighlightTooltipLine" key={`${lineIndex}-${line}`}>
          {runeliteMouseHighlightTooltipLineParts(line)}
        </span>
      ))}
    </div>
  );
}

function runeliteMouseHighlightTooltipStyle(tooltip: RuneliteMouseHighlightTooltipSnapshot): CSSProperties {
  return {
    left: tooltip.x,
    top: tooltip.y,
    "--runelite-tooltip-bg": RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_BACKGROUND_RGBA,
    "--runelite-tooltip-outside-stroke": RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_OUTSIDE_STROKE_RGBA,
    "--runelite-tooltip-inside-stroke": RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_INSIDE_STROKE_RGBA,
    "--runelite-tooltip-padding": `${RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_PADDING}px`
  } as CSSProperties;
}

function runeliteMouseHighlightTooltipLineParts(line: string): readonly JSX.Element[] {
  const parts: JSX.Element[] = [];
  let color = "#ffffff";
  let cursor = 0;
  const tagPattern = /<(col=([0-9a-fA-F]{6})|\/col)>/g;
  for (const match of line.matchAll(tagPattern)) {
    if (match.index > cursor) {
      parts.push(
        <span key={`${cursor}-${parts.length}`} style={{ color }}>
          {line.slice(cursor, match.index)}
        </span>
      );
    }
    color = match[1].startsWith("col=") && match[2] ? `#${match[2]}` : "#ffffff";
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) {
    parts.push(
      <span key={`${cursor}-${parts.length}`} style={{ color }}>
        {line.slice(cursor)}
      </span>
    );
  }
  return parts;
}

function spriteAtlasEntry(
  atlas: RuntimeSpriteAtlas,
  spriteId: number,
  spriteFrame = 0
): SpriteAtlasEntry | undefined {
  return atlas.spriteFrames.get(spriteAtlasFrameKey(spriteId, spriteFrame)) ?? atlas.sprites.get(spriteId);
}

async function loadRuntimeReplays(
  projectileDefinitions: NhProjectileDefinitionMap,
  spotanimDefinitions: ReadonlyMap<number, NhReplaySpotanimDefinition>,
  hitsplatDefinitions: NhHitsplatDefinitionStore,
  healthBarDefinitions: NhHealthBarDefinitionStore,
  overheadIconDefinitions: NhOverheadIconDefinitionStore,
  actorSequenceDefinitions: NhActorSequenceDefinitionStore
): Promise<readonly RuntimeReplay[]> {
  const traces: ClientViewTrace[] = [
    createDefaultNhDuelClientViewTrace({ ticks: 56 }),
    createInventorySwitchNhDuelClientViewTrace(),
    createMinimapSemanticClientViewTrace(),
    createDisabledMinimapClientViewTrace()
  ];
  const bridge = window.nhTrainer;
  if (bridge?.listSimFixtures && bridge.readSimFixture) {
    const fixtures = await bridge.listSimFixtures();
    const selected =
      fixtures.find((fixture) => fixture.fileName === "client-view-two-actor-duel.json") ?? fixtures[0];
    if (selected) {
      traces.push((await bridge.readSimFixture(selected.fileName)) as ClientViewTrace);
    }
  } else {
    traces.push(await loadJson<ClientViewTrace>("sim/client-view-two-actor-duel.json"));
  }
  traces.push(...(await loadCapturedReferenceClientViewTraces()));

  return traces.map((trace) => {
    assertValidClientViewTrace(trace);
    return clientViewTraceToRuntimeReplay(trace, {
      projectileDefinitions,
      spotanimDefinitions,
      hitsplatDefinitions,
      healthBarDefinitions,
      overheadIconDefinitions,
      actorSequenceDefinitions
    });
  });
}

async function loadCapturedReferenceClientViewTraces(): Promise<readonly ClientViewTrace[]> {
  const bridge = window.nhTrainer;
  if (bridge?.listCapturedClientViewTraces && bridge.readCapturedClientViewTrace) {
    try {
      const traces = await bridge.listCapturedClientViewTraces();
      return Promise.all(
        traces.map((trace) => bridge.readCapturedClientViewTrace(trace.fileName) as Promise<ClientViewTrace>)
      );
    } catch (error) {
      if (isMissingCapturedTraceIpc(error)) {
        return [];
      } else {
        throw error;
      }
    }
  }

  const manifest = await loadOptionalJson<NhClientReferenceManifest>("reference/client-render/manifest.json");
  if (!manifest) {
    return [];
  }
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.frames)) {
    throw new Error("invalid client render reference manifest");
  }

  const fileNames = [
    ...new Set(
      manifest.frames
        .map((frame) => frame.clientViewTraceFileName)
        .filter((fileName): fileName is string => typeof fileName === "string" && fileName.endsWith(".client-view.json"))
    )
  ];
  return Promise.all(
    fileNames.map((fileName) => loadJson<ClientViewTrace>(`reference/client-render/${fileName}`))
  );
}

function isMissingCapturedTraceIpc(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("reference:list-client-view") || message.includes("No handler registered");
}

function cloneRenderableGeometry(root: Object3D): void {
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.isMesh && mesh.geometry) {
      mesh.geometry = mesh.geometry.clone();
    }
  });
}

function buildActorModel(source: Object3D, metadata?: NhLoadoutMeshMetadata): Group {
  const instance = source.clone(true);
  const wrapper = new Group();
  cloneRenderableGeometry(instance);
  if (metadata) {
    attachNhAnimationMetadata(instance, metadata);
  }
  wrapper.add(instance);

  // Source anchor: client-actor-model-origin-contract.
  // Nh uses Player.getModel() as a single composed model at the actor world position;
  // per-loadout bounds.min.y floor alignment makes weapon swaps visibly change actor height.
  instance.position.set(0, 0, 0);
  wrapper.scale.setScalar(nhClientUnitsToWorldUnits(1));

  return wrapper;
}

function buildEffectModel(source: Object3D, metadata?: NhLoadoutMeshMetadata): Group {
  const instance = source.clone(true);
  const wrapper = new Group();
  cloneRenderableGeometry(instance);
  if (metadata) {
    attachNhAnimationMetadata(instance, metadata);
  }
  wrapper.add(instance);
  wrapper.scale.setScalar(nhClientUnitsToWorldUnits(1));
  return wrapper;
}

function buildGroundItemModel(source: Object3D): Group {
  const instance = source.clone(true);
  const wrapper = new Group();
  cloneRenderableGeometry(instance);
  wrapper.add(instance);
  wrapper.scale.setScalar(nhClientUnitsToWorldUnits(1));
  return wrapper;
}

function runtimeLoadoutModelKey(loadoutId: RuntimeLoadoutId): string {
  return `loadout:${loadoutId}`;
}

function runtimeLoadoutAppearance(loadoutId: RuntimeLoadoutId): RuntimePlayerAppearance {
  const loadout = runtimeLoadouts.find((candidate) => candidate.id === loadoutId);
  if (!loadout) {
    throw new Error(`unknown runtime loadout ${loadoutId}`);
  }
  return {
    itemIds: loadout.itemIds,
    bodyColors: loadout.bodyColors,
    source: "loadout"
  };
}

function runtimePrimarySequence(
  pose: RuntimeActorPose,
  animationFixtures: NhAnimationFixtures | null
): NhRenderSequenceDefinition | null {
  const playbackMode = pose.sequenceMode ?? nhSequencePlaybackMode(pose.sequenceName);
  if (playbackMode !== "primary") {
    return null;
  }
  return animationFixtures?.sequences.get(pose.sequenceName) ?? null;
}

function runtimeActorModelInput(
  pose: RuntimeActorPose,
  animationFixtures: NhAnimationFixtures | null
): Pick<RuntimePlayerAppearance, "itemIds" | "bodyColors" | "equipmentSlots"> & {
  readonly shieldOverrideId?: number;
  readonly weaponOverrideId?: number;
} {
  const appearance = pose.appearance ?? runtimeLoadoutAppearance(pose.loadoutId);
  const sequence = runtimePrimarySequence(pose, animationFixtures);
  return {
    itemIds: appearance.itemIds,
    bodyColors: appearance.bodyColors,
    equipmentSlots: appearance.equipmentSlots,
    shieldOverrideId: sequence?.shieldOverrideId,
    weaponOverrideId: sequence?.weaponOverrideId
  };
}

function runtimeAppearanceModelKey(
  appearance: Pick<RuntimePlayerAppearance, "itemIds" | "bodyColors" | "equipmentSlots"> & {
    readonly shieldOverrideId?: number;
    readonly weaponOverrideId?: number;
  }
): string {
  return [
    "appearance",
    appearance.bodyColors.join(","),
    appearance.itemIds.join(","),
    appearance.equipmentSlots?.join(",") ?? "",
    appearance.shieldOverrideId ?? "",
    appearance.weaponOverrideId ?? ""
  ].join(":");
}

function runtimeActorModelKey(
  pose: RuntimeActorPose,
  animationFixtures: NhAnimationFixtures | null
): string {
  const input = runtimeActorModelInput(pose, animationFixtures);
  return pose.appearance || input.shieldOverrideId !== undefined || input.weaponOverrideId !== undefined
    ? runtimeAppearanceModelKey(input)
    : runtimeLoadoutModelKey(pose.loadoutId);
}

function emitRuntimeActorModelSwap(
  boundary: RuntimeSceneBoundary,
  snapshot: RuntimeSceneSnapshot,
  pose: RuntimeActorPose,
  previousModelKey: string | null,
  modelKey: string
): void {
  const appearance = pose.appearance ?? runtimeLoadoutAppearance(pose.loadoutId);
  const detail = {
    actorId: pose.actorId,
    cycle: snapshot.cycle,
    loadoutId: pose.loadoutId,
    previousModelKey: previousModelKey ?? "",
    modelKey,
    appearanceItemIds: appearance.itemIds,
    appearanceEquipmentSlots: appearance.equipmentSlots ?? [],
    timestampMs: typeof performance === "undefined" ? 0 : performance.now()
  };
  if (pose.actorId === "local-player") {
    const viewport = boundary.renderer.domElement.closest(".runtimeViewport") as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastLocalActorModelKey = modelKey;
      viewport.dataset.lastLocalActorAppearanceItemIds = appearance.itemIds.join(",");
      viewport.dataset.lastLocalActorAppearanceEquipmentSlots = (appearance.equipmentSlots ?? []).join(",");
      if (viewport.dataset.captureLocalActorModelSwaps === "true") {
        let captured: unknown[] = [];
        try {
          const parsed = JSON.parse(viewport.dataset.localActorModelSwapLog ?? "[]");
          captured = Array.isArray(parsed) ? parsed : [];
        } catch {
          captured = [];
        }
        captured.push(detail);
        viewport.dataset.localActorModelSwapLog = JSON.stringify(captured);
        viewport.dataset.localActorModelSwapCount = String(captured.length);
      }
    }
  }
  if (typeof window !== "undefined") {
    const runtimeWindow = window as typeof window & {
      __nhRuntimeActorModelSwaps?: unknown[];
    };
    runtimeWindow.__nhRuntimeActorModelSwaps?.push(detail);
    runtimeWindow.dispatchEvent(new CustomEvent("nh-runtime-actor-model-swap", { detail }));
  }
}

function buildCenteredSceneModels(sources: readonly Object3D[]): CenteredSceneModels {
  const wrapper = new Group();
  const clones = sources.map((source) => source.clone(true));
  const terrainRoot = clones[0] ?? new Group();
  for (const clone of clones) {
    wrapper.add(clone);
  }

  const bounds = new Box3().setFromObject(wrapper);
  const center = bounds.getCenter(new Vector3());
  wrapper.position.set(-center.x, -bounds.min.y - 0.03, -center.z);

  return {
    group: wrapper,
    terrainRoot,
    offset: {
      x: wrapper.position.x,
      y: wrapper.position.y,
      z: wrapper.position.z
    }
  };
}

function configureNhSceneObjectMaterials(root: Object3D): void {
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) {
      return;
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      applyNhSceneObjectMaterialLayer(material);
    }
  });
}

function applyNhSceneObjectMaterialLayer(material: Material): void {
  if (!material.name.includes("cache-floor-decoration")) {
    return;
  }

  const layeredMaterial = material as Material & {
    polygonOffset: boolean;
    polygonOffsetFactor: number;
    polygonOffsetUnits: number;
  };
  layeredMaterial.polygonOffset = true;
  layeredMaterial.polygonOffsetFactor = -1;
  layeredMaterial.polygonOffsetUnits = -1;
  layeredMaterial.needsUpdate = true;
}

function clearActorSlot(slot: ActorRenderSlot): void {
  for (const child of [...slot.group.children]) {
    slot.group.remove(child);
  }
}

function eventModelKey(event: RuntimeRenderEvent): string | null {
  return event.artifactUrl ?? null;
}

function eventProgress(event: RuntimeRenderEvent, cycle: number): number {
  const duration = Math.max(1, event.endCycle - event.startCycle);
  return Math.min(1, Math.max(0, (cycle - event.startCycle) / duration));
}

function effectMeshMetadataUrl(url: string): string {
  return url.replace(/\.glb$/i, ".mesh.json");
}

function eventSpotanimId(event: RuntimeRenderEvent): number | null {
  if (event.kind === "projectile") {
    return event.projectile?.gfxId ?? null;
  }
  if (event.kind === "spotanim") {
    return event.spotanimId ?? null;
  }
  return null;
}

function eventEffectAnimationCycle(event: RuntimeRenderEvent, snapshot: RuntimeSceneSnapshot): number {
  if (event.kind === "projectile" && event.projectile) {
    return Math.max(
      0,
      Math.floor(nhRenderCycleToProjectileClientCycle(event, snapshot.cycle, event.projectile) - event.projectile.cycleStart)
    );
  }
  return Math.max(0, snapshot.cycle - event.startCycle);
}

function currentNhGameRenderCycleAt(originMs: number, nowMs: number): number {
  const elapsed = Math.max(0, nowMs - originMs);
  const clientCycle = Math.floor(elapsed / NH_CLIENT_CYCLE_MS);
  return clientCycle / NH_CLIENT_CYCLES_PER_GAME_TICK;
}

function runtimeEffectFrameSnapshot(
  snapshot: RuntimeSceneSnapshot,
  manualControl: boolean,
  originMs: number,
  nowMs: number
): RuntimeSceneSnapshot {
  if (!manualControl) {
    return snapshot;
  }

  const renderCycle = currentNhGameRenderCycleAt(originMs, nowMs);
  if (renderCycle < snapshot.cycle - 1 || renderCycle > snapshot.cycle + NH_GAME_TICK_CATCH_UP_LIMIT) {
    return snapshot;
  }

  return {
    ...snapshot,
    cycle: Math.max(snapshot.cycle, renderCycle)
  };
}

function applyRuntimeEffectAnimation(
  object: Object3D,
  event: RuntimeRenderEvent,
  snapshot: RuntimeSceneSnapshot,
  animationFixtures: NhAnimationFixtures | null,
  spotanimDefinitions: ReadonlyMap<number, NhSpotanimDefinition>
): void {
  const spotanimId = eventSpotanimId(event);
  const sequenceId = spotanimId === null ? undefined : spotanimDefinitions.get(spotanimId)?.animationId;
  if (sequenceId === undefined || sequenceId < 0) {
    return;
  }

  const playbackMode = event.kind === "projectile" ? "loop" : "primary";
  const frame = applyNhSequenceAnimation(
    object,
    animationFixtures?.sequencesById.get(sequenceId),
    eventEffectAnimationCycle(event, snapshot),
    animationFixtures,
    playbackMode
  );
  object.userData.nhEffectAnimation = {
    spotanimId,
    sequenceId,
    playbackMode,
    frameKey: frame?.frameKey ?? null
  };
}

function applyRuntimeEffectPlacement(
  object: Object3D,
  event: RuntimeRenderEvent,
  snapshot: RuntimeSceneSnapshot,
  projectileDefinitions: ReadonlyMap<string, NhProjectileDefinition>
): boolean {
  if (event.kind === "projectile" && event.fromTile && event.toTile) {
    const definition = event.projectileId ? projectileDefinitions.get(event.projectileId) : undefined;
    const sample = definition ? sampleNhProjectileMotion(event, snapshot.cycle, definition) : null;
    if (sample) {
      object.position.set(sample.x, 0.35 + sample.z, sample.y);
      object.rotation.y = (sample.yaw * Math.PI * 2) / 2048;
      object.rotation.x = (sample.pitch * Math.PI * 2) / 2048;
    } else {
      const progress = eventProgress(event, snapshot.cycle);
      object.position.set(
        lerp(event.fromTile.x, event.toTile.x, progress),
        0.7 + Math.sin(progress * Math.PI) * 0.3,
        lerp(event.fromTile.z, event.toTile.z, progress)
      );
      object.lookAt(event.toTile.x, 0.7, event.toTile.z);
    }
    return true;
  }

  if (event.actorId) {
    const pose = snapshot.actors.find((actor) => actor.actorId === event.actorId);
    const renderTile = pose ? pose.renderTile ?? pose.tile : null;
    object.position.set(renderTile?.x ?? 0, 0, renderTile?.z ?? 0);
    return true;
  }

  return false;
}

function updateRuntimeEffectObjects(
  boundary: RuntimeSceneBoundary,
  snapshot: RuntimeSceneSnapshot,
  events: readonly RuntimeRenderEvent[],
  animationFixtures: NhAnimationFixtures | null,
  spotanimDefinitions: ReadonlyMap<number, NhSpotanimDefinition>,
  projectileDefinitions: ReadonlyMap<string, NhProjectileDefinition>
): void {
  if (boundary.eventRoot.children.length === 0) {
    return;
  }

  const eventById = new Map(events.map((event) => [event.id, event]));
  for (const child of boundary.eventRoot.children) {
    const eventId = child.userData.nhRuntimeEventId;
    if (typeof eventId !== "string") {
      continue;
    }

    const event = eventById.get(eventId);
    if (!event || event.kind === "overlay-sprite") {
      child.visible = false;
      continue;
    }

    applyRuntimeEffectAnimation(child, event, snapshot, animationFixtures, spotanimDefinitions);
    child.visible = applyRuntimeEffectPlacement(child, event, snapshot, projectileDefinitions);
  }
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function buildOverlaySprite(
  atlas: RuntimeSpriteAtlas,
  spriteId: number,
  options: OverlaySpriteBuildOptions = {}
): Sprite | null {
  const spriteDefinition = spriteAtlasEntry(atlas, spriteId, options.spriteFrame);
  if (!spriteDefinition) {
    return null;
  }

  const widthRatio = Math.max(0.01, Math.min(1, options.widthRatio ?? 1));
  const texture = atlas.texture.clone();
  texture.repeat.set(
    (spriteDefinition.width * widthRatio) / atlas.metadata.width,
    spriteDefinition.height / atlas.metadata.height
  );
  texture.offset.set(
    spriteDefinition.x / atlas.metadata.width,
    1 - (spriteDefinition.y + spriteDefinition.height) / atlas.metadata.height
  );
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;

  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const sprite = new Sprite(material);
  const fullScale = Math.max(spriteDefinition.maxWidth, spriteDefinition.width) / 50;
  const clippedScale = fullScale * widthRatio;
  sprite.scale.set(clippedScale, fullScale * (spriteDefinition.height / Math.max(1, spriteDefinition.width)), 1);
  (sprite as ClientSprite).userData.clientSpritePixels = {
    width: spriteDefinition.width * widthRatio,
    height: spriteDefinition.height,
    offsetX: options.anchorLeft ? -(spriteDefinition.width - spriteDefinition.width * widthRatio) / 2 : 0,
    offsetY: 0
  };
  (sprite as ClientSprite).userData.nhSpriteSource = {
    sheetId: atlas.id,
    spriteId: spriteDefinition.spriteId,
    spriteFrame: spriteDefinition.frame,
    image: atlas.metadata.image,
    width: spriteDefinition.width,
    height: spriteDefinition.height
  };
  if (options.anchorLeft) {
    sprite.position.x = -(fullScale - clippedScale) / 2;
  }
  sprite.renderOrder = options.renderOrder ?? 20;
  return sprite;
}

function buildHealthBarOverlay(atlas: RuntimeSpriteAtlas, event: RuntimeRenderEvent, renderOrder: number, cycle: number): Group | null {
  const healthBar = event.healthBar;
  if (!healthBar) {
    return null;
  }

  const frontSprite = atlas.sprites.get(healthBar.definition.frontSpriteId);
  const layout = layoutNhHealthBar(healthBar, cycle, frontSprite?.width);
  const background = buildOverlaySprite(atlas, layout.backSpriteId, { renderOrder });
  const foreground = buildOverlaySprite(atlas, layout.frontSpriteId, {
    anchorLeft: true,
    renderOrder: renderOrder + 1,
    widthRatio: layout.widthRatio
  });
  if (!background || !foreground) {
    return null;
  }

  background.material.opacity = layout.alpha / 255;
  foreground.material.opacity = layout.alpha / 255;
  const group = new Group();
  group.add(background);
  group.add(foreground);
  return group;
}

function buildHitsplatOverlay(
  spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, RuntimeSpriteAtlas>,
  event: RuntimeRenderEvent,
  renderOrder: number,
  cycle: number
): Group | null {
  if (!event.hitsplat) {
    return null;
  }

  const layout = buildHitsplatLayout(spriteAtlases, event, cycle);
  if (!layout) {
    return null;
  }

  const group = new Group();
  const centerX = layout.width / 2;
  const centerY = layout.height / 2;
  for (const part of layout.sprites) {
    const atlas = spriteAtlases.get(part.sheetId);
    if (!atlas) {
      continue;
    }

    const sprite = buildOverlaySprite(atlas, part.spriteId, { renderOrder: renderOrder + part.renderOrderOffset });
    if (!sprite) {
      return null;
    }

    const material = sprite.material;
    material.opacity = part.alpha / 255;
    (sprite as ClientSprite).userData.clientSpritePixels = {
      width: part.width,
      height: part.height,
      offsetX: part.x + part.width / 2 - centerX,
      offsetY: centerY - (part.y + part.height / 2)
    };
    group.add(sprite);
  }

  return group;
}

function buildHitsplatLayout(
  spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, RuntimeSpriteAtlas>,
  event: RuntimeRenderEvent,
  cycle: number
): NhHitsplatLayout | null {
  if (!event.hitsplat) {
    return null;
  }

  return layoutNhHitsplat(
    event.hitsplat,
    (sheetId, spriteId): NhHitsplatSpriteMetrics | undefined => {
      const atlas = spriteAtlases.get(sheetId);
      if (!atlas) {
        return undefined;
      }
      const entry = atlas.sprites.get(spriteId);
      if (!entry) {
        return undefined;
      }

      return {
        width: entry.width,
        height: entry.height,
        offsetX: entry.offsetX,
        offsetY: entry.offsetY,
        advance: entry.advance,
        leftBearing: entry.leftBearing,
        topBearing: entry.topBearing,
        ascent: atlas.metadata.ascent
      };
    },
    cycle
  );
}

function hitsplatPlacementSprite(
  spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, RuntimeSpriteAtlas>,
  event: RuntimeRenderEvent,
  cycle: number
): NhHitsplatSpriteMetrics | undefined {
  const layout = buildHitsplatLayout(spriteAtlases, event, cycle);
  return layout
    ? {
      width: layout.width,
      height: layout.height,
      offsetX: layout.offsetX,
      offsetY: layout.offsetY
    }
    : undefined;
}

interface RuntimeDomOverlayLayout {
  readonly width: number;
  readonly height: number;
  readonly placementSprite: NhHitsplatSpriteMetrics;
  readonly sprites: readonly RuntimeDomOverlaySprite[];
}

function runtimeDomSprite(
  atlas: RuntimeSpriteAtlas,
  entry: SpriteAtlasEntry,
  options: {
    readonly key: string;
    readonly left: number;
    readonly top: number;
    readonly width?: number;
    readonly height?: number;
    readonly opacity?: number;
    readonly renderOrder?: number;
  }
): RuntimeDomOverlaySprite {
  return {
    key: options.key,
    sheetId: atlas.id,
    spriteId: entry.spriteId,
    spriteFrame: entry.frame,
    atlasImage: atlas.metadata.image,
    atlasWidth: atlas.metadata.width,
    atlasHeight: atlas.metadata.height,
    sourceX: entry.x,
    sourceY: entry.y,
    left: options.left,
    top: options.top,
    width: options.width ?? entry.width,
    height: options.height ?? entry.height,
    opacity: options.opacity ?? 1,
    renderOrder: options.renderOrder ?? 0
  };
}

function scaleRuntimeDomOverlaySprites(
  sprites: readonly RuntimeDomOverlaySprite[],
  scale: number
): readonly RuntimeDomOverlaySprite[] {
  if (scale === 1) {
    return sprites;
  }

  // Kept for one-off verifier probes only. Runtime hitsplats stay at Nh cache size.
  return sprites.map((sprite) => ({
    ...sprite,
    left: sprite.left * scale,
    top: sprite.top * scale,
    width: sprite.width * scale,
    height: sprite.height * scale
  }));
}

function runtimeDomOverlayLayoutForEvent(
  spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, RuntimeSpriteAtlas>,
  event: RuntimeRenderEvent,
  renderOrder: number,
  cycle: number,
  hitsplatScale: number
): RuntimeDomOverlayLayout | null {
  if (!event.spriteSheetId || event.spriteId === undefined) {
    return null;
  }

  if (event.spriteSheetId === "hitsplats" && event.hitsplat) {
    const layout = buildHitsplatLayout(spriteAtlases, event, cycle);
    if (!layout) {
      return null;
    }

    const sprites = layout.sprites.flatMap((part, index) => {
      const atlas = spriteAtlases.get(part.sheetId);
      const entry = atlas?.sprites.get(part.spriteId);
      return atlas && entry
        ? [
            runtimeDomSprite(atlas, entry, {
              key: `${event.id}-${part.sheetId}-${part.spriteId}-${index}`,
              left: part.x,
              top: part.y,
              width: part.width,
              height: part.height,
              opacity: part.alpha / 255,
              renderOrder: renderOrder + part.renderOrderOffset
            })
          ]
        : [];
    });
    const scale = event.spriteSheetId === "hitsplats" ? hitsplatScale : 1;
    return {
      width: layout.width * scale,
      height: layout.height * scale,
      placementSprite: {
        width: layout.width,
        height: layout.height,
        offsetX: layout.offsetX,
        offsetY: layout.offsetY
      },
      sprites: scale === 1 ? sprites : scaleRuntimeDomOverlaySprites(sprites, scale)
    };
  }

  const atlas = spriteAtlases.get(event.spriteSheetId);
  if (!atlas) {
    return null;
  }

  if (event.spriteSheetId === "health_bars" && event.healthBar) {
    const frontEntry = atlas.sprites.get(event.healthBar.definition.frontSpriteId);
    const backEntry = atlas.sprites.get(event.healthBar.definition.backSpriteId);
    if (!frontEntry || !backEntry) {
      return null;
    }

    const layout = layoutNhHealthBar(event.healthBar, cycle, frontEntry.width);
    return {
      width: frontEntry.width,
      height: frontEntry.height,
      placementSprite: frontEntry,
      sprites: [
        runtimeDomSprite(atlas, backEntry, {
          key: `${event.id}-health-back`,
          left: 0,
          top: 0,
          opacity: layout.alpha / 255,
          renderOrder
        }),
        runtimeDomSprite(atlas, frontEntry, {
          key: `${event.id}-health-front`,
          left: 0,
          top: 0,
          width: layout.clipWidthPixels,
          opacity: layout.alpha / 255,
          renderOrder: renderOrder + 1
        })
      ]
    };
  }

  const entry = spriteAtlasEntry(atlas, event.spriteId, event.spriteFrame);
  if (!entry) {
    return null;
  }

  return {
    width: entry.width,
    height: entry.height,
    placementSprite: entry,
    sprites: [
      runtimeDomSprite(atlas, entry, {
        key: `${event.id}-${event.spriteSheetId}-${event.spriteId}`,
        left: 0,
        top: 0,
        renderOrder
      })
    ]
  };
}

function buildRuntimeDomOverlays(
  boundary: RuntimeSceneBoundary,
  snapshot: RuntimeSceneSnapshot,
  events: readonly RuntimeRenderEvent[],
  spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, RuntimeSpriteAtlas>,
  hitsplatScale = 1
): readonly RuntimeDomOverlay[] {
  const fixedLayout = boundary.fixedClientLayout;
  const cssLayout = boundary.fixedClientCssLayout;
  if (!fixedLayout || !cssLayout || spriteAtlases.size === 0) {
    return [];
  }

  const sortedEvents = [...events].sort((left, right) => nhOverlaySortValue(left) - nhOverlaySortValue(right));
  const overlayEventsByActor = new Map<RuntimeActorId, RuntimeRenderEvent[]>();
  for (const event of sortedEvents) {
    if (event.kind !== "overlay-sprite" || !event.actorId) {
      continue;
    }
    const actorEvents = overlayEventsByActor.get(event.actorId) ?? [];
    actorEvents.push(event);
    overlayEventsByActor.set(event.actorId, actorEvents);
  }

  const overlays: RuntimeDomOverlay[] = [];
  const overlayStackCounts = new Map<string, number>();
  for (const event of sortedEvents) {
    if (event.kind !== "overlay-sprite" || !event.actorId || !event.spriteSheetId || event.spriteId === undefined) {
      continue;
    }

    const pose = snapshot.actors.find((actor) => actor.actorId === event.actorId);
    const slot = boundary.actorSlots.get(event.actorId);
    if (!pose || !slot) {
      continue;
    }

    const sortValue = nhOverlaySortValue(event);
    const renderOrder = 20 + sortValue;
    const layoutCycle = event.clientCycle ?? snapshot.cycle;
    const domLayout = runtimeDomOverlayLayoutForEvent(spriteAtlases, event, renderOrder, layoutCycle, hitsplatScale);
    if (!domLayout || domLayout.sprites.length === 0) {
      continue;
    }

    const stackKey = `${event.actorId}:${event.spriteSheetId}`;
    const stackIndex = overlayStackCounts.get(stackKey) ?? 0;
    overlayStackCounts.set(stackKey, stackIndex + 1);
    const placement = nhActorOverlayPlacement(
      event,
      overlayEventsByActor.get(event.actorId) ?? [],
      domLayout.placementSprite,
      stackIndex
    );
    if (!placement) {
      continue;
    }

    // Source: Scene.copy$drawActor2d calls World.method1253, which writes Client.viewportTempX/Y
    // from the integer client camera state before Sprite.method6159 draws overheads.
    const projection = nhOverlayClientViewportProjection(
      nhRuntimeOverlayClientCameraState(boundary),
      fixedLayout.viewport,
      slot.group.position,
      placement
    );
    if (!projection) {
      continue;
    }

    overlays.push({
      id: event.id,
      actorId: event.actorId,
      spriteSheetId: event.spriteSheetId,
      left: cssLayout.viewportRect.x + projection.x * cssLayout.scale - (domLayout.width * cssLayout.scale) / 2,
      top: cssLayout.viewportRect.y + projection.y * cssLayout.scale - (domLayout.height * cssLayout.scale) / 2,
      width: domLayout.width,
      height: domLayout.height,
      renderOrder,
      hitsplatScale: event.spriteSheetId === "hitsplats" && hitsplatScale !== 1 ? hitsplatScale : undefined,
      sprites: domLayout.sprites
    });
  }

  return overlays;
}

function runtimeDomOverlayStructureSignature(overlays: readonly RuntimeDomOverlay[]): string {
  return overlays
    .map((overlay) => {
      const spriteSignature = overlay.sprites
        .map(
          (sprite) =>
            `${sprite.key}:${sprite.sheetId}:${sprite.spriteId}:${sprite.spriteFrame}:${sprite.sourceX}:${sprite.sourceY}:${sprite.left}:${sprite.top}:${sprite.width}:${sprite.height}:${Math.round(sprite.opacity * 255)}:${sprite.renderOrder}`
        )
        .join(",");
      return `${overlay.id}:${overlay.actorId}:${overlay.spriteSheetId}:${overlay.width}:${overlay.height}:${overlay.renderOrder}:${spriteSignature}`;
    })
    .join("|");
}

function nhRuntimeOverlayClientCameraState(boundary: RuntimeSceneBoundary) {
  return {
    target: boundary.cameraRig.target,
    angles: boundary.cameraRig.clientAngles,
    zoom: boundary.cameraRig.zoom
  };
}

function syncRuntimeGroundItemModels(
  boundary: RuntimeSceneBoundary,
  groundItems: readonly RuntimeGroundItem[],
  playerSources: NhPlayerModelSources | null,
  collision: NhSceneCollision | null
): void {
  for (const child of [...boundary.groundItemRoot.children]) {
    boundary.groundItemRoot.remove(child);
    disposeGeometryAndMaterialsOnly(child);
  }

  if (!playerSources || !collision) {
    return;
  }

  for (const item of groundItems) {
    const model = composeNhGroundItemModel(playerSources, {
      itemId: item.itemId,
      quantity: item.quantity
    });
    if (!model) {
      continue;
    }

    const object = buildGroundItemModel(model.scene);
    object.name = item.id;
    object.position.set(item.tile.x, collision.sampleHeight(item.tile), item.tile.z);
    object.userData.groundItemId = item.id;
    object.userData.itemId = item.itemId;
    object.userData.itemName = item.itemName;
    object.userData.itemQuantity = item.quantity;
    object.userData.nhSource = model.metadata.source;
    boundary.groundItemRoot.add(object);
  }
}

function applyRuntimeDomOverlayElementStyle(
  element: HTMLElement,
  overlay: RuntimeDomOverlay,
  layout: NhFixedClientCssLayout | null
): void {
  const style = runtimeDomOverlayStyle(overlay, layout);
  element.style.left = `${style.left ?? 0}px`;
  element.style.top = `${style.top ?? 0}px`;
  element.style.width = `${style.width ?? overlay.width}px`;
  element.style.height = `${style.height ?? overlay.height}px`;
  element.style.transform = String(style.transform ?? "");
  element.style.transformOrigin = String(style.transformOrigin ?? "left top");
  element.style.zIndex = String(style.zIndex ?? overlay.renderOrder);
}

function applyRuntimeDomOverlayElementStyles(
  overlays: readonly RuntimeDomOverlay[],
  layout: NhFixedClientCssLayout | null,
  elements: Map<string, HTMLElement>
): void {
  const activeOverlayIds = new Set(overlays.map((overlay) => overlay.id));
  for (const [id, element] of elements) {
    if (!activeOverlayIds.has(id)) {
      element.style.display = "none";
    }
  }

  for (const overlay of overlays) {
    const element = elements.get(overlay.id);
    if (!element) {
      continue;
    }
    element.style.display = "";
    applyRuntimeDomOverlayElementStyle(element, overlay, layout);
  }
}

function buildRuneliteFreezeTimerDomOverlays(
  boundary: RuntimeSceneBoundary,
  combatState: RuntimePlayerCombatState,
  config: RuneliteFreezeTimersConfigSnapshot
): readonly RuneliteFreezeTimerDomOverlay[] {
  const fixedLayout = boundary.fixedClientLayout;
  const cssLayout = boundary.fixedClientCssLayout;
  if (!fixedLayout || !cssLayout) {
    return [];
  }

  const snapshots = runeliteFreezeTimerOverlaySnapshotsFromCombatState(combatState, config);
  return snapshots.flatMap((snapshot) => {
    const slot = boundary.actorSlots.get(snapshot.actorId);
    if (!slot) {
      return [];
    }

    const projection = projectRuntimeActorClientOverlay(boundary, fixedLayout, slot.group.position, 0);
    if (!projection) {
      return [];
    }

    const textWidth = Math.max(18, snapshot.text.length * 8);
    const width = snapshot.noImage
      ? textWidth
      : RUNELITE_FREEZE_TIMERS_IMAGE_WIDTH_PX + RUNELITE_FREEZE_TIMERS_IMAGE_TEXT_GAP_PX + textWidth;
    const height = snapshot.noImage ? Math.max(snapshot.textSize, 14) : RUNELITE_FREEZE_TIMERS_IMAGE_HEIGHT_PX;
    const drawX = snapshot.noImage
      ? projection.x - width / 2
      : projection.x - RUNELITE_FREEZE_TIMERS_IMAGE_WIDTH_PX / 2 + snapshot.xOffset;
    const drawY = snapshot.noImage
      ? projection.y - height / 2
      : projection.y - RUNELITE_FREEZE_TIMERS_IMAGE_HEIGHT_PX / 2 + snapshot.yOffset;

    return [
      {
        ...snapshot,
        left: cssLayout.viewportRect.x + drawX * cssLayout.scale,
        top: cssLayout.viewportRect.y + drawY * cssLayout.scale,
        width,
        height,
        renderOrder: 100000 + (snapshot.actorId === "local-player" ? 0 : 50)
      }
    ];
  });
}

function runeliteFreezeTimerDomOverlaySignature(overlays: readonly RuneliteFreezeTimerDomOverlay[]): string {
  return overlays
    .map(
      (overlay) =>
        `${overlay.id}:${overlay.state}:${overlay.text}:${overlay.width}:${overlay.height}:${overlay.xOffset}:${overlay.noImage}:${overlay.fontStyle}:${overlay.textSize}`
    )
    .join("|");
}

function buildRuneliteLocalFreezeTimerInfoBoxDomOverlay(
  combatState: RuntimePlayerCombatState,
  timersConfig: RuneliteTimersConfigSnapshot,
  infoBoxConfig: RuneliteInfoBoxConfigSnapshot,
  spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, RuntimeSpriteAtlas>
): RuneliteFreezeTimerInfoBoxDomOverlay | null {
  const snapshot = runeliteLocalFreezeTimerInfoBoxSnapshot(combatState, timersConfig, infoBoxConfig);
  const atlas = spriteAtlases.get("spell_icons");
  const sprite = atlas?.sprites.get(RUNELITE_TIMERS_ICE_BARRAGE_SPRITE_ID);
  if (!snapshot || !atlas || !sprite) {
    return null;
  }

  return {
    ...snapshot,
    atlasImage: `render/sprites/${atlas.metadata.image}`,
    atlasWidth: atlas.metadata.width,
    atlasHeight: atlas.metadata.height,
    spriteX: sprite.x,
    spriteY: sprite.y,
    spriteWidth: sprite.width,
    spriteHeight: sprite.height
  };
}

function runeliteFreezeTimerInfoBoxDomOverlaySignature(overlay: RuneliteFreezeTimerInfoBoxDomOverlay | null): string {
  return overlay ? `${overlay.id}:${overlay.text}:${overlay.freezeEndTick}:${overlay.remainingTicks}:${overlay.size}` : "";
}

function buildRunelitePlayerIndicatorDomOverlays(
  boundary: RuntimeSceneBoundary,
  snapshot: RuntimeSceneSnapshot,
  config: RunelitePlayerIndicatorsConfigSnapshot
): readonly RunelitePlayerIndicatorDomOverlay[] {
  const fixedLayout = boundary.fixedClientLayout;
  const cssLayout = boundary.fixedClientCssLayout;
  if (!fixedLayout || !cssLayout) {
    return [];
  }

  return runelitePlayerIndicatorSnapshots(snapshot, config).flatMap((indicator) => {
    const slot = boundary.actorSlots.get(indicator.actorId);
    if (!slot || !indicator.locations.includes("ABOVE_HEAD")) {
      return [];
    }

    const projection = projectRuntimeActorClientOverlay(
      boundary,
      fixedLayout,
      slot.group.position,
      NH_PLAYER_DEFAULT_HEIGHT_CLIENT_UNITS + RUNELITE_PLAYER_INDICATORS_ACTOR_OVERHEAD_TEXT_MARGIN
    );
    if (!projection) {
      return [];
    }

    const textWidth = Math.max(20, indicator.label.length * 7);
    const height = 15;
    return [
      {
        id: `player-indicator-${indicator.actorId}-${indicator.relation}`,
        actorId: indicator.actorId,
        relation: indicator.relation,
        label: indicator.label,
        color: indicator.color,
        left: cssLayout.viewportRect.x + (projection.x - textWidth / 2) * cssLayout.scale,
        top: cssLayout.viewportRect.y + (projection.y - height) * cssLayout.scale,
        width: textWidth,
        height,
        renderOrder: 100050 + (indicator.actorId === "local-player" ? 0 : 50)
      }
    ];
  });
}

function runelitePlayerIndicatorDomOverlaySignature(overlays: readonly RunelitePlayerIndicatorDomOverlay[]): string {
  return overlays
    .map(
      (overlay) =>
        `${overlay.id}:${overlay.relation}:${overlay.label}:${overlay.color}:${overlay.width}:${overlay.height}`
    )
    .join("|");
}

function buildRunelitePrayAgainstPlayerDomOverlays(
  boundary: RuntimeSceneBoundary,
  combatState: RuntimePlayerCombatState,
  config: RunelitePrayAgainstPlayerConfigSnapshot,
  spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, RuntimeSpriteAtlas>
): readonly RunelitePrayAgainstPlayerDomOverlay[] {
  const fixedLayout = boundary.fixedClientLayout;
  const cssLayout = boundary.fixedClientCssLayout;
  const atlas = spriteAtlases.get("prayer_icons");
  if (!fixedLayout || !cssLayout || !atlas) {
    return [];
  }

  return runelitePrayAgainstPlayerOverlaySnapshotsFromCombatState(combatState, config).flatMap((snapshot) => {
    const slot = boundary.actorSlots.get(snapshot.actorId);
    const entry = atlas.sprites.get(snapshot.spriteId);
    if (!slot || !entry) {
      return [];
    }

    const projection = nhOverlayClientViewportProjection(
      nhRuntimeOverlayClientCameraState(boundary),
      fixedLayout.viewport,
      slot.group.position,
      {
        anchorClientUnits: snapshot.logicalOffsetClientUnits,
        centerOffsetXPixels: 0,
        centerOffsetYPixelsDown: 0
      }
    );
    if (!projection) {
      return [];
    }

    const width = RUNELITE_PRAY_AGAINST_PLAYER_PROTECTION_ICON_SIZE;
    const height = RUNELITE_PRAY_AGAINST_PLAYER_PROTECTION_ICON_SIZE;
    const spriteLeft = Math.round((width - entry.width) / 2);
    const spriteTop = Math.round((height - entry.height) / 2);

    return [
      {
        ...snapshot,
        left: cssLayout.viewportRect.x + (projection.x - width / 2) * cssLayout.scale,
        top: cssLayout.viewportRect.y + (projection.y - height / 2) * cssLayout.scale,
        width,
        height,
        atlasImage: atlas.metadata.image,
        atlasWidth: atlas.metadata.width,
        atlasHeight: atlas.metadata.height,
        sourceX: entry.x,
        sourceY: entry.y,
        sourceWidth: entry.width,
        sourceHeight: entry.height,
        spriteLeft,
        spriteTop,
        spriteWidth: entry.width,
        spriteHeight: entry.height,
        renderOrder: 100070 + runtimePlayerCombatOverlayActorOffset(snapshot.actorId)
      }
    ];
  });
}

function runelitePrayAgainstPlayerDomOverlaySignature(overlays: readonly RunelitePrayAgainstPlayerDomOverlay[]): string {
  return overlays
    .map(
      (overlay) =>
        `${overlay.id}:${overlay.relation}:${overlay.weaponType}:${overlay.prayerId}:${overlay.spriteId}:${overlay.width}:${overlay.height}:${overlay.sourceX}:${overlay.sourceY}:${overlay.spriteLeft}:${overlay.spriteTop}:${overlay.spriteWidth}:${overlay.spriteHeight}`
    )
    .join("|");
}

function buildRuneliteTileIndicatorDomOverlays(
  boundary: RuntimeSceneBoundary,
  snapshot: RuntimeSceneSnapshot,
  config: RuneliteTileIndicatorsConfigSnapshot,
  destinationTile: RuntimeTile | null,
  hoveredTile: RuntimeTile | null,
  collisionMap: NhSceneCollision | null
): readonly RuneliteTileIndicatorDomOverlay[] {
  const fixedLayout = boundary.fixedClientLayout;
  if (!config.enabled || !fixedLayout || !collisionMap) {
    return [];
  }

  const overlays: RuneliteTileIndicatorDomOverlay[] = [];
  const addTile = (
    kind: RuneliteTileIndicatorKind,
    tile: RuntimeTile | null,
    enabled: boolean,
    color: string,
    thin: boolean
  ): void => {
    if (!enabled || !tile) {
      return;
    }

    const snappedTile = collisionMap.snapTile(tile);
    const points = runtimeTileCanvasPolygonPoints(boundary, snappedTile, collisionMap);
    if (!points) {
      return;
    }

    overlays.push({
      id: `tile-indicator-${kind}-${Math.trunc(snappedTile.x * 1000)}-${Math.trunc(snappedTile.z * 1000)}`,
      kind,
      tile: snappedTile,
      points: points.map((point) => `${point.x},${point.y}`).join(" "),
      strokeColor: color,
      strokeWidth: runeliteTileIndicatorStrokeWidth(thin),
      renderOrder: 30 + overlays.length,
      sourceWidth: fixedLayout.viewport.rect.width,
      sourceHeight: fixedLayout.viewport.rect.height
    });
  };

  const localPose = snapshot.actors.find((actor) => actor.actorId === "local-player") ?? null;
  addTile("hovered", hoveredTile, config.highlightHoveredTile, config.highlightHoveredColor, config.thinHoveredTile);
  addTile("destination", destinationTile, config.highlightDestinationTile, config.highlightDestinationColor, config.thinDestinationTile);
  addTile("current", localPose?.tile ?? null, config.highlightCurrentTile, config.highlightCurrentColor, config.thinCurrentTile);
  return overlays;
}

function runtimeTileCanvasPolygonPoints(
  boundary: RuntimeSceneBoundary,
  tile: RuntimeTile,
  collisionMap: NhSceneCollision
): readonly RuntimeViewportSourcePoint[] | null {
  const fixedLayout = boundary.fixedClientLayout;
  const sceneTilePicker = boundary.sceneTilePicker;
  if (!fixedLayout || !sceneTilePicker) {
    return null;
  }

  const world = collisionMap.sceneToWorldTile(tile);
  const arenaTile = sceneTilePicker.arena.tiles.find(
    (candidate) => candidate.x === world.x && candidate.y === world.y && candidate.plane === world.plane
  );
  if (!arenaTile) {
    return null;
  }

  boundary.camera.updateMatrixWorld(true);
  const corners = nhArenaTileSceneCorners(sceneTilePicker.arena, sceneTilePicker.sceneOffset, arenaTile);
  const projected = [corners.southWest, corners.southEast, corners.northEast, corners.northWest].map((corner) =>
    nhProjectWorldPointToViewport(boundary.camera, fixedLayout.viewport, corner)
  );
  if (projected.some((point) => !point)) {
    return null;
  }

  return projected as readonly RuntimeViewportSourcePoint[];
}

function runeliteTileIndicatorDomOverlaySignature(overlays: readonly RuneliteTileIndicatorDomOverlay[]): string {
  return overlays
    .map(
      (overlay) =>
        `${overlay.id}:${overlay.kind}:${overlay.points}:${overlay.strokeColor}:${overlay.strokeWidth}:${overlay.sourceWidth}:${overlay.sourceHeight}`
    )
    .join("|");
}

function buildRunelitePrayerBarDomOverlay(
  boundary: RuntimeSceneBoundary,
  snapshot: RuntimeSceneSnapshot,
  config: RunelitePrayerConfigSnapshot,
  tickProgressRadians: number
): RunelitePrayerBarDomOverlay | null {
  const fixedLayout = boundary.fixedClientLayout;
  const cssLayout = boundary.fixedClientCssLayout;
  const localSlot = boundary.actorSlots.get("local-player");
  if (!fixedLayout || !cssLayout || !localSlot) {
    return null;
  }

  const localPlayerInCombat = snapshot.hud.hitpoints > 0;
  const prayerBar = runelitePrayerBarSnapshot(snapshot.hud, config, tickProgressRadians, localPlayerInCombat);
  if (!prayerBar) {
    return null;
  }

  const projection = projectRuntimeActorClientOverlay(
    boundary,
    fixedLayout,
    localSlot.group.position,
    NH_PLAYER_DEFAULT_HEIGHT_CLIENT_UNITS + RUNELITE_PRAYER_BAR_LOCAL_HEIGHT_OFFSET_PX
  );
  if (!projection) {
    return null;
  }

  return {
    ...prayerBar,
    id: "runelite-prayer-bar-local-player",
    actorId: "local-player",
    left: cssLayout.viewportRect.x + (projection.x - prayerBar.width / 2) * cssLayout.scale,
    top: cssLayout.viewportRect.y + projection.y * cssLayout.scale,
    renderOrder: 100075
  };
}

function runelitePrayerBarDomOverlaySignature(overlay: RunelitePrayerBarDomOverlay | null): string {
  if (!overlay) {
    return "";
  }
  return `${overlay.id}:${overlay.currentPrayer}:${overlay.maxPrayer}:${overlay.progressFill}:${overlay.showFlickHelper}:${overlay.flickLocation}:${overlay.flickXOffset}:${overlay.width}:${overlay.height}`;
}

function buildRunelitePrayerFlickOrbDomOverlay(
  boundary: RuntimeSceneBoundary,
  snapshot: RuntimeSceneSnapshot,
  config: RunelitePrayerConfigSnapshot,
  tickProgressRadians: number
): RunelitePrayerFlickOrbDomOverlay | null {
  const cssLayout = boundary.fixedClientCssLayout;
  const prayerOrb = boundary.fixedClientLayout?.orbs.find((orb) => orb.id === "prayer");
  if (!cssLayout || !prayerOrb) {
    return null;
  }

  const orbInnerSize = prayerOrb.rect.height;
  const flick = runelitePrayerFlickOrbSnapshot(snapshot.hud, config, tickProgressRadians, orbInnerSize);
  if (!flick) {
    return null;
  }

  const innerX = prayerOrb.rect.x + 24;
  const innerY = prayerOrb.rect.y - 1;
  return {
    ...flick,
    id: "runelite-prayer-flick-orb",
    left: cssLayout.surfaceRect.x + (innerX + flick.xOffset) * cssLayout.scale,
    top: cssLayout.surfaceRect.y + (innerY + flick.yOffset) * cssLayout.scale,
    width: 1,
    height: Math.max(0, flick.indicatorHeight),
    renderOrder: 100090
  };
}

function runelitePrayerFlickOrbDomOverlaySignature(overlay: RunelitePrayerFlickOrbDomOverlay | null): string {
  if (!overlay) {
    return "";
  }
  return `${overlay.id}:${overlay.showFlickHelper}:${overlay.flickLocation}:${overlay.xOffset}:${Math.round(overlay.yOffset * 10)}:${Math.round(overlay.indicatorHeight * 10)}:${Math.round(overlay.left * 10)}:${Math.round(overlay.top * 10)}`;
}

function buildRuneliteAttackStylesDomOverlay(
  boundary: RuntimeSceneBoundary,
  snapshot: RuntimeSceneSnapshot,
  config: RuneliteAttackStylesConfigSnapshot
): RuneliteAttackStylesDomOverlay | null {
  const cssLayout = boundary.fixedClientCssLayout;
  const chatbox = boundary.fixedClientLayout?.chatbox;
  if (!cssLayout || !chatbox) {
    return null;
  }

  const overlay = runeliteAttackStylesOverlaySnapshot(snapshot.hud, config);
  if (!overlay) {
    return null;
  }

  return {
    ...overlay,
    id: "runelite-attack-styles",
    left: cssLayout.surfaceRect.x + (chatbox.rect.x + chatbox.rect.width - overlay.width) * cssLayout.scale,
    top: cssLayout.surfaceRect.y + (chatbox.rect.y - overlay.height - 4) * cssLayout.scale,
    renderOrder: 100020
  };
}

function runeliteAttackStylesDomOverlaySignature(overlay: RuneliteAttackStylesDomOverlay | null): string {
  if (!overlay) {
    return "";
  }
  return `${overlay.id}:${overlay.attackStyle.id}:${overlay.warnedSkillSelected}:${overlay.weaponTypeConfig}:${overlay.attackSetIndex}:${overlay.defensiveCastingMode}:${Math.round(overlay.left * 10)}:${Math.round(overlay.top * 10)}`;
}

function buildRuneliteXpDropDamageDomOverlay(
  boundary: RuntimeSceneBoundary,
  combatState: RuntimePlayerCombatState,
  config: RuneliteXpDropConfigSnapshot
): RuneliteXpDropDamageDomOverlay | null {
  const fixedLayout = boundary.fixedClientLayout;
  const cssLayout = boundary.fixedClientCssLayout;
  if (!config.enabled || config.showDamageDrops !== "ABOVE_OPPONENT" || !fixedLayout || !cssLayout) {
    return null;
  }

  const latestDamageEvent = [...combatState.events]
    .reverse()
    .find(
      (event): event is Extract<RuntimePlayerCombatEvent, { readonly kind: "hitsplat" }> =>
        event.kind === "hitsplat" &&
        event.attackerId === "local-player" &&
        event.damage > 0 &&
        event.tick <= combatState.tick &&
        event.tick + 3 > combatState.tick
    );
  if (!latestDamageEvent) {
    return null;
  }

  const slot = boundary.actorSlots.get(latestDamageEvent.targetActorId);
  if (!slot) {
    return null;
  }

  const text = String(latestDamageEvent.damage);
  const width = Math.max(10, text.length * 7);
  const height = 13;
  const placement: NhActorOverlayPlacement = {
    anchorClientUnits: NH_PLAYER_DEFAULT_HEIGHT_CLIENT_UNITS + 50,
    centerOffsetXPixels: 0,
    centerOffsetYPixelsDown: 0
  };
  const projection = nhOverlayClientViewportProjection(
    nhRuntimeOverlayClientCameraState(boundary),
    fixedLayout.viewport,
    slot.group.position,
    placement
  );
  if (!projection) {
    return null;
  }

  return {
    id: `runelite-xp-drop-damage-${latestDamageEvent.id}`,
    actorId: latestDamageEvent.targetActorId,
    damage: latestDamageEvent.damage,
    left: cssLayout.viewportRect.x + (projection.x - width / 2) * cssLayout.scale,
    top: cssLayout.viewportRect.y + (projection.y - height) * cssLayout.scale,
    width,
    height,
    color: config.damageColor,
    renderOrder: 100080 + runtimePlayerCombatOverlayActorOffset(latestDamageEvent.targetActorId),
    tickShow: Math.max(0, latestDamageEvent.tick + 3 - combatState.tick)
  };
}

function runeliteXpDropDamageDomOverlaySignature(overlay: RuneliteXpDropDamageDomOverlay | null): string {
  if (!overlay) {
    return "";
  }

  return `${overlay.id}:${overlay.damage}:${overlay.actorId}:${overlay.width}:${overlay.height}:${overlay.color}:${overlay.tickShow}`;
}

function syncRuneliteXpDropDomOverlays(
  boundary: RuntimeSceneBoundary,
  combatState: RuntimePlayerCombatState,
  config: RuneliteXpDropConfigSnapshot,
  counterShown: boolean,
  clientFonts: NhClientFontStore,
  clientCycle: number,
  activeDroplets: Map<string, RuneliteXpDropActiveDroplet>,
  emittedQueuedHitIds: Set<string>,
  lastStartClientCycleRef: { current: number }
): readonly RuneliteXpDropDomOverlay[] {
  const fixedLayout = boundary.fixedClientLayout;
  const cssLayout = boundary.fixedClientCssLayout;
  if (!config.enabled || !counterShown || !fixedLayout || !cssLayout) {
    activeDroplets.clear();
    emittedQueuedHitIds.clear();
    lastStartClientCycleRef.current = 0;
    return [];
  }

  for (const [id, droplet] of activeDroplets) {
    if (clientCycle >= droplet.startClientCycle + droplet.durationClientCycles) {
      activeDroplets.delete(id);
    }
  }

  // Source: XpDropPlugin responds once to ExperienceChanged/ScriptCallbackEvent hpXpGained.
  // Trainer extension: queued-hit pre-hit XP drops are emitted before damage lands, so the
  // emission guard must outlive the droplet animation while the same queued hit is pending.
  const localQueuedHits = combatState.queuedHits.filter((hit) => hit.attackerId === "local-player");
  const localQueuedHitIds = new Set(localQueuedHits.map((hit) => hit.id));
  for (const hitId of emittedQueuedHitIds) {
    if (!localQueuedHitIds.has(hitId) && !activeDroplets.has(hitId)) {
      emittedQueuedHitIds.delete(hitId);
    }
  }

  const fontSpec = runeliteXpDropFontSpec(config.trainerFont);
  const textSizeSpec = runeliteXpDropTextSizeSpec(fontSpec.sourceTextSize);
  const textScale = Math.max(0.5, Math.min(4, config.trainerTextSize / textSizeSpec.textHeight));
  const moveDistance = Math.max(20, Math.min(220, config.trainerMoveDistance));
  const stackSpacingClientCycles =
    Math.trunc(
      (textSizeSpec.textHeight * textScale * RUNELITE_XP_DROP_DURATION_CLIENT_CYCLES) /
        Math.max(1, moveDistance)
    ) + 1;
  for (const hit of localQueuedHits) {
    if (activeDroplets.has(hit.id) || emittedQueuedHitIds.has(hit.id)) {
      continue;
    }

    const damage = runtimePlayerCombatQueuedHitDamage(combatState.actors, hit, combatState.tick);
    const xpDrops = runtimePlayerCombatXpDropsForDamage(hit, damage);
    const xpTotal = Math.max(0, Math.round(xpDrops.reduce((sum, drop) => sum + drop.xp, 0)));
    if (xpTotal <= 0 && config.trainerDisplayMode === "XP") {
      continue;
    }

    const startClientCycle =
      lastStartClientCycleRef.current > clientCycle - stackSpacingClientCycles
        ? lastStartClientCycleRef.current + stackSpacingClientCycles
        : clientCycle;
    lastStartClientCycleRef.current = startClientCycle;
    activeDroplets.set(hit.id, {
      id: `runelite-xp-drop-${hit.id}`,
      hitId: hit.id,
      actorId: hit.defenderId,
      damage,
      hpXp: Math.max(0, Math.round(xpDrops.find((drop) => drop.skillId === "hitpoints")?.xp ?? 0)),
      xpTotal,
      xpDrops,
      startClientCycle,
      durationClientCycles: RUNELITE_XP_DROP_DURATION_CLIENT_CYCLES
    });
    emittedQueuedHitIds.add(hit.id);
  }

  return [...activeDroplets.values()].flatMap((droplet) => {
    const text = runeliteXpDropText(droplet, config);
    if (!text) {
      return [];
    }

    const skillIcons = config.hideSkillIcons ? [] : runeliteXpDropSkillIcons(droplet.xpDrops);
    const font = nhClientFontDefinition(clientFonts, fontSpec.fontKey);
    const textWidth = font ? nhClientFontStringWidth(font, text) : Math.max(10, text.length * 7);
    const width = runeliteXpDropSourceWidth(textWidth, skillIcons.length, textSizeSpec.textHeight);
    const right = cssLayout.viewportRect.x + (fixedLayout.viewport.rect.width - RUNELITE_XP_DROP_PANEL_RIGHT) * cssLayout.scale;
    return [
      {
        ...droplet,
        text,
        left: right - width * textScale * cssLayout.scale,
        top:
          cssLayout.viewportRect.y +
          (RUNELITE_XP_DROP_PANEL_TOP + RUNELITE_XP_DROP_STACK_MIN_PANEL_HEIGHT - textSizeSpec.textHeight * textScale) *
            cssLayout.scale,
        width,
        height: textSizeSpec.textHeight,
        color: config.trainerDisplayMode === "HIT" ? config.damageColor : RUNELITE_XP_DROP_TEXT_COLOR,
        textWidth,
        fontKey: fontSpec.fontKey,
        fontId: font?.fontId ?? null,
        fontArchiveName: font?.fontArchiveName ?? fontSpec.fontArchiveName,
        fontSheetId: (font?.sheetId as RuntimeSpriteSheetId | undefined) ?? null,
        textSize: fontSpec.sourceTextSize,
        textSizeVarbit4693: textSizeSpec.varbit4693,
        textScale,
        moveDistance,
        renderOrder: 100090 + runtimePlayerCombatOverlayActorOffset(droplet.actorId),
        displayMode: config.trainerDisplayMode,
        skillIcons
      }
    ];
  });
}

function runeliteXpDropSourceWidth(textWidth: number, iconCount: number, textHeight: number): number {
  return textWidth + RUNELITE_XP_DROP_SOURCE_WIDTH_PADDING + iconCount * (textHeight - 1);
}

function runeliteXpDropText(droplet: RuneliteXpDropActiveDroplet, config: RuneliteXpDropConfigSnapshot): string {
  if (config.trainerDisplayMode === "HIT") {
    return String(droplet.damage);
  }

  if (droplet.xpTotal <= 0) {
    return "";
  }

  const xpText = droplet.xpTotal.toLocaleString("en-US");
  return config.showDamageDrops === "IN_XP_DROP" && droplet.damage > 0 ? `${xpText} (${droplet.damage})` : xpText;
}

function runeliteXpDropSkillIcons(xpDrops: readonly RuntimePlayerCombatXpDropDomValue[]): readonly RuneliteXpDropSkillIcon[] {
  const seen = new Set<RuntimePlayerCombatXpSkillId>();
  return xpDrops.flatMap((drop) => {
    if (drop.xp <= 0 || seen.has(drop.skillId)) {
      return [];
    }
    seen.add(drop.skillId);
    return [RUNELITE_XP_DROP_SKILL_ICONS[drop.skillId]];
  });
}

function runeliteXpDropDomOverlaySignature(overlays: readonly RuneliteXpDropDomOverlay[]): string {
  return overlays
    .map(
      (overlay) =>
        `${overlay.id}:${overlay.text}:${overlay.displayMode}:${overlay.color}:${overlay.skillIcons.map((icon) => icon.skillId).join(",")}:${overlay.xpTotal}:${overlay.textSize}:${overlay.textSizeVarbit4693}:${overlay.fontKey}:${overlay.fontId ?? ""}:${overlay.textScale}:${overlay.moveDistance}:${overlay.textWidth}:${Math.round(
          overlay.left * 10
        )}:${Math.round(overlay.top * 10)}:${overlay.width}:${overlay.height}:${overlay.startClientCycle}:${
          overlay.durationClientCycles
        }`
    )
    .join("|");
}

function projectRuntimeActorClientOverlay(
  boundary: RuntimeSceneBoundary,
  fixedLayout: NhFixedClientLayout,
  actorPosition: Vector3,
  anchorClientUnits: number
) {
  return nhOverlayClientViewportProjection(
    nhRuntimeOverlayClientCameraState(boundary),
    fixedLayout.viewport,
    actorPosition,
    {
      anchorClientUnits,
      centerOffsetXPixels: 0,
      centerOffsetYPixelsDown: 0
    }
  );
}

function runtimeSceneOverlayLayerStyle(layout: NhFixedClientCssLayout | null): CSSProperties | undefined {
  if (!layout) {
    return undefined;
  }

  const surface = layout.surfaceRect;
  const viewport = layout.viewportRect;
  const top = Math.max(0, viewport.y - surface.y);
  const right = Math.max(0, surface.x + surface.width - (viewport.x + viewport.width));
  const bottom = Math.max(0, surface.y + surface.height - (viewport.y + viewport.height));
  const left = Math.max(0, viewport.x - surface.x);
  return {
    clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px)`
  };
}

function runtimeDomOverlayStyle(overlay: RuntimeDomOverlay, layout: NhFixedClientCssLayout | null): CSSProperties {
  const scale = layout?.scale ?? 1;
  return {
    left: 0,
    top: 0,
    width: overlay.width,
    height: overlay.height,
    transform: `translate3d(${nhActorOverlayCssPixel(overlay.left)}px, ${nhActorOverlayCssPixel(overlay.top)}px, 0) scale(${scale})`,
    transformOrigin: "left top",
    zIndex: overlay.renderOrder
  };
}

function runtimeDomOverlayStaticStyle(overlay: RuntimeDomOverlay): CSSProperties {
  // Source: Scene.copy$drawActor2d recomputes Client.viewportTempX/Y in the draw pass.
  // React owns the sprite structure only; the render frame applies the live projected transform.
  return {
    left: 0,
    top: 0,
    width: overlay.width,
    height: overlay.height,
    transformOrigin: "left top",
    zIndex: overlay.renderOrder
  };
}

function nhActorOverlayCssPixel(value: number): number {
  // Source: Client.viewportTempX/Y feed Sprite.method6159(int, int) after integer projection.
  // Keep that source projection intact through fixed-client CSS scaling; layout rounding here makes overhead sprites drift during camera-key motion.
  return value;
}

function runeliteProjectedDomOverlayStyle(
  overlay: RuneliteProjectedDomOverlay,
  layout: NhFixedClientCssLayout | null
): CSSProperties {
  const scale = layout?.scale ?? 1;
  return {
    left: 0,
    top: 0,
    width: overlay.width,
    height: overlay.height,
    transform: `translate3d(${nhActorOverlayCssPixel(overlay.left)}px, ${nhActorOverlayCssPixel(overlay.top)}px, 0) scale(${scale})`,
    transformOrigin: "left top",
    zIndex: overlay.renderOrder
  };
}

function applyRuneliteProjectedDomOverlayElementStyle(
  element: HTMLElement,
  overlay: RuneliteProjectedDomOverlay,
  layout: NhFixedClientCssLayout | null
): void {
  const style = runeliteProjectedDomOverlayStyle(overlay, layout);
  element.style.left = `${style.left ?? 0}px`;
  element.style.top = `${style.top ?? 0}px`;
  element.style.width = `${style.width ?? overlay.width}px`;
  element.style.height = `${style.height ?? overlay.height}px`;
  element.style.transform = String(style.transform ?? "");
  element.style.transformOrigin = String(style.transformOrigin ?? "left top");
  element.style.zIndex = String(style.zIndex ?? overlay.renderOrder);
}

function applyRuneliteProjectedDomOverlayElementStyles(
  overlays: readonly RuneliteProjectedDomOverlay[],
  layout: NhFixedClientCssLayout | null,
  elements: Map<string, HTMLElement>
): void {
  const activeOverlayIds = new Set(overlays.map((overlay) => overlay.id));
  for (const [id, element] of elements) {
    if (!activeOverlayIds.has(id)) {
      element.style.display = "none";
    }
  }

  for (const overlay of overlays) {
    const element = elements.get(overlay.id);
    if (!element) {
      continue;
    }
    element.style.display = "";
    applyRuneliteProjectedDomOverlayElementStyle(element, overlay, layout);
  }
}

function runeliteFreezeTimerOverlayStyle(overlay: RuneliteFreezeTimerDomOverlay, layout: NhFixedClientCssLayout | null): CSSProperties {
  return runeliteProjectedDomOverlayStyle(overlay, layout);
}

function runeliteFreezeTimerTextStyle(overlay: RuneliteFreezeTimerDomOverlay): CSSProperties {
  return {
    color: overlay.textColor === "yellow" ? "#ffff00" : "#ffffff",
    fontSize: overlay.noImage ? overlay.textSize : RUNELITE_FREEZE_TIMERS_TIMER_FONT_PX,
    fontStyle: overlay.fontStyle === "Italic" ? "italic" : "normal",
    fontWeight: overlay.fontStyle === "Plain" ? 400 : 700
  };
}

function runeliteFreezeTimerInfoBoxOverlayStyle(
  overlay: RuneliteFreezeTimerInfoBoxDomOverlay,
  layout: NhFixedClientCssLayout | null,
  overlayLocations: RuneliteOverlayPreferredLocations
): CSSProperties {
  const scale = layout?.scale ?? 1;
  const preferredLocation = runeliteOverlayPreferredLocationStyle("InfoBoxOverlay", overlayLocations, scale);
  const viewportRect = layout?.viewportRect;
  const defaultBottomLeftLocation = viewportRect
    ? {
        left: viewportRect.x + 2 * scale,
        top: viewportRect.y + viewportRect.height - overlay.height * scale - 2 * scale
      }
    : {};
  return {
    left: 0,
    top: 0,
    width: overlay.width,
    minHeight: overlay.height,
    gridTemplateColumns: `${overlay.size}px`,
    gridTemplateRows: `${overlay.size}px`,
    gap: overlay.gap,
    transform: `scale(${scale})`,
    transformOrigin: "left top",
    zIndex: overlay.renderOrder,
    ...(preferredLocation ?? defaultBottomLeftLocation)
  };
}

function runtimeFightCountdownOverlayStyle(layout: NhFixedClientCssLayout | null): CSSProperties {
  const viewportRect = layout?.viewportRect;
  return {
    left: viewportRect?.x ?? 0,
    top: viewportRect?.y ?? 0,
    width: viewportRect?.width ?? 0,
    height: viewportRect?.height ?? 0
  };
}

function runtimeFightStartOverlayStyle(
  layout: NhFixedClientCssLayout | null,
  overlayLocations: RuneliteOverlayPreferredLocations
): CSSProperties {
  const scale = layout?.scale ?? 1;
  const preferredLocation = runeliteOverlayPreferredLocationStyle(
    RUNELITE_FIGHT_START_OVERLAY_NAME,
    overlayLocations,
    scale
  );
  if (preferredLocation) {
    return preferredLocation;
  }
  const viewportRect = layout?.viewportRect;
  return {
    left: viewportRect ? viewportRect.x + viewportRect.width / 2 : 0,
    top: viewportRect ? viewportRect.y + viewportRect.height / 2 : 0,
    transform: `translate(-50%, -50%) scale(${scale})`,
    transformOrigin: "center center"
  };
}

function runeliteFreezeTimerInfoBoxItemStyle(overlay: RuneliteFreezeTimerInfoBoxDomOverlay): CSSProperties {
  return {
    width: overlay.size,
    height: overlay.size,
    color: "#00ff00"
  };
}

function runeliteFreezeTimerInfoBoxIconStyle(overlay: RuneliteFreezeTimerInfoBoxDomOverlay): CSSProperties {
  const spriteLeft = Math.round((overlay.size - overlay.spriteWidth) / 2);
  const spriteTop = Math.round((overlay.size - overlay.spriteHeight) / 2);
  return {
    position: "absolute",
    left: spriteLeft,
    top: spriteTop,
    width: overlay.spriteWidth,
    height: overlay.spriteHeight,
    backgroundImage: `url("${overlay.atlasImage}")`,
    backgroundPosition: `-${overlay.spriteX}px -${overlay.spriteY}px`,
    backgroundSize: `${overlay.atlasWidth}px ${overlay.atlasHeight}px`,
    imageRendering: "pixelated"
  };
}

function runelitePlayerIndicatorOverlayStyle(
  overlay: RunelitePlayerIndicatorDomOverlay,
  layout: NhFixedClientCssLayout | null
): CSSProperties {
  return {
    ...runeliteProjectedDomOverlayStyle(overlay, layout),
    color: overlay.color
  };
}

function runelitePrayAgainstPlayerOverlayStyle(
  overlay: RunelitePrayAgainstPlayerDomOverlay,
  layout: NhFixedClientCssLayout | null
): CSSProperties {
  return runeliteProjectedDomOverlayStyle(overlay, layout);
}

function runelitePrayAgainstPlayerSpriteStyle(overlay: RunelitePrayAgainstPlayerDomOverlay): CSSProperties {
  return {
    left: overlay.spriteLeft,
    top: overlay.spriteTop,
    width: overlay.spriteWidth,
    height: overlay.spriteHeight,
    backgroundImage: `url("render/sprites/${overlay.atlasImage}")`,
    backgroundPosition: `-${overlay.sourceX}px -${overlay.sourceY}px`,
    backgroundSize: `${overlay.atlasWidth}px ${overlay.atlasHeight}px`
  };
}

function runeliteTileIndicatorsSvgStyle(layout: NhFixedClientCssLayout | null): CSSProperties {
  const viewportRect = layout?.viewportRect;
  return {
    left: viewportRect?.x ?? 0,
    top: viewportRect?.y ?? 0,
    width: viewportRect?.width ?? 0,
    height: viewportRect?.height ?? 0
  };
}

function runelitePrayerBarOverlayStyle(overlay: RunelitePrayerBarDomOverlay, layout: NhFixedClientCssLayout | null): CSSProperties {
  return runeliteProjectedDomOverlayStyle(overlay, layout);
}

function runeliteXpDropDamageOverlayStyle(overlay: RuneliteXpDropDamageDomOverlay, layout: NhFixedClientCssLayout | null): CSSProperties {
  return {
    ...runeliteProjectedDomOverlayStyle(overlay, layout),
    color: overlay.color
  };
}

function runeliteXpDropOverlayProgress(overlay: RuneliteXpDropDomOverlay, clientCycle: number): number {
  return Math.max(
    0,
    Math.min(1, (clientCycle - overlay.startClientCycle) / Math.max(1, overlay.durationClientCycles))
  );
}

function runeliteXpDropOverlayStyle(
  overlay: RuneliteXpDropDomOverlay,
  layout: NhFixedClientCssLayout | null,
  clientCycle: number
): CSSProperties {
  const progress = runeliteXpDropOverlayProgress(overlay, clientCycle);
  const scale = layout?.scale ?? 1;
  const pending = clientCycle < overlay.startClientCycle;
  return {
    left: 0,
    top: 0,
    width: overlay.width,
    height: overlay.height,
    transform: `translate3d(${nhActorOverlayCssPixel(overlay.left)}px, ${nhActorOverlayCssPixel(
      overlay.top - progress * overlay.moveDistance * scale
    )}px, 0) scale(${scale * overlay.textScale})`,
    transformOrigin: "left top",
    zIndex: overlay.renderOrder,
    color: overlay.color,
    opacity: pending ? 0 : Math.max(0, 1 - progress),
    visibility: pending ? "hidden" : "visible"
  };
}

function applyRuneliteXpDropOverlayElementStyle(
  element: HTMLElement,
  overlay: RuneliteXpDropDomOverlay,
  layout: NhFixedClientCssLayout | null,
  clientCycle: number
): void {
  const style = runeliteXpDropOverlayStyle(overlay, layout, clientCycle);
  element.style.left = `${style.left ?? 0}px`;
  element.style.top = `${style.top ?? 0}px`;
  element.style.width = `${style.width ?? overlay.width}px`;
  element.style.height = `${style.height ?? overlay.height}px`;
  element.style.transform = String(style.transform ?? "");
  element.style.transformOrigin = String(style.transformOrigin ?? "left top");
  element.style.zIndex = String(style.zIndex ?? overlay.renderOrder);
  element.style.color = overlay.color;
  element.style.opacity = String(style.opacity ?? 1);
  element.style.visibility = String(style.visibility ?? "visible");
}

function applyRuneliteXpDropOverlayElementStyles(
  overlays: readonly RuneliteXpDropDomOverlay[],
  layout: NhFixedClientCssLayout | null,
  elements: Map<string, HTMLElement>,
  clientCycle: number
): void {
  const activeOverlayIds = new Set(overlays.map((overlay) => overlay.id));
  for (const [id, element] of elements) {
    if (!activeOverlayIds.has(id)) {
      element.style.display = "none";
    }
  }

  for (const overlay of overlays) {
    const element = elements.get(overlay.id);
    if (!element) {
      continue;
    }
    element.style.display = "";
    applyRuneliteXpDropOverlayElementStyle(element, overlay, layout, clientCycle);
  }
}

function runeliteXpDropIconStyle(size: number, index = 0): CSSProperties {
  return {
    left: index * (size - 1),
    width: size,
    height: size
  };
}

function runelitePrayerBarFillStyle(overlay: RunelitePrayerBarDomOverlay): CSSProperties {
  return {
    width: overlay.progressFill,
    height: overlay.height
  };
}

function runelitePrayerBarFlickStyle(overlay: RunelitePrayerBarDomOverlay): CSSProperties {
  return {
    left: overlay.flickXOffset,
    top: 0,
    height: overlay.height
  };
}

function runelitePrayerFlickOrbOverlayStyle(
  overlay: RunelitePrayerFlickOrbDomOverlay,
  layout: NhFixedClientCssLayout | null
): CSSProperties {
  const scale = layout?.scale ?? 1;
  return {
    left: overlay.left,
    top: overlay.top,
    width: overlay.width,
    height: overlay.height,
    transform: `scale(${scale})`,
    transformOrigin: "left top",
    zIndex: overlay.renderOrder
  };
}

function runeliteAttackStylesOverlayStyle(
  overlay: RuneliteAttackStylesDomOverlay,
  layout: NhFixedClientCssLayout | null,
  overlayLocations: RuneliteOverlayPreferredLocations
): CSSProperties {
  const scale = layout?.scale ?? 1;
  const preferredLocation = runeliteOverlayPreferredLocationStyle("AttackStylesOverlay", overlayLocations, scale);
  return {
    left: overlay.left,
    top: overlay.top,
    width: overlay.width,
    minHeight: overlay.height,
    transform: `scale(${scale})`,
    transformOrigin: "left top",
    zIndex: overlay.renderOrder,
    color: overlay.color,
    ...(preferredLocation ?? {})
  };
}

function runeliteBoostsOverlayStyle(
  overlay: RuneliteBoostsOverlaySnapshot,
  layout: NhFixedClientCssLayout | null,
  overlayLocations: RuneliteOverlayPreferredLocations
): CSSProperties {
  const scale = layout?.scale ?? 1;
  const overlayName = overlay.mode === "combat-icons" ? "CombatIconsOverlay" : "BoostsOverlay";
  const preferredLocation = runeliteOverlayPreferredLocationStyle(overlayName, overlayLocations, scale);
  return {
    left: 0,
    top: 0,
    width: overlay.width,
    minHeight: overlay.height,
    transform: `scale(${scale})`,
    transformOrigin: "left top",
    zIndex: overlay.renderOrder,
    ...(preferredLocation ?? {})
  };
}

function runeliteBoostsInfoBoxOverlayStyle(
  overlay: RuneliteBoostsInfoBoxSnapshot,
  layout: NhFixedClientCssLayout | null,
  overlayLocations: RuneliteOverlayPreferredLocations
): CSSProperties {
  const scale = layout?.scale ?? 1;
  const primaryCount = Math.min(overlay.boxes.length, overlay.wrap);
  const preferredLocation = runeliteOverlayPreferredLocationStyle("InfoBoxOverlay", overlayLocations, scale);
  return {
    left: 0,
    top: 0,
    width: overlay.width,
    minHeight: overlay.height,
    gridTemplateColumns:
      overlay.orientation === "horizontal" ? `repeat(${primaryCount}, ${overlay.size}px)` : `${overlay.size}px`,
    gridTemplateRows:
      overlay.orientation === "vertical" ? `repeat(${primaryCount}, ${overlay.size}px)` : `${overlay.size}px`,
    gridAutoFlow: overlay.orientation === "vertical" ? "column" : "row",
    gap: overlay.gap,
    transform: `scale(${scale})`,
    transformOrigin: "left top",
    zIndex: overlay.renderOrder,
    ...(preferredLocation ?? {})
  };
}

function runeliteBoostRowValueStyle(row: RuneliteBoostRowSnapshot): CSSProperties {
  return {
    color: row.color
  };
}

function runeliteBoostsInfoBoxItemStyle(box: RuneliteBoostsInfoBoxItemSnapshot, overlay: RuneliteBoostsInfoBoxSnapshot): CSSProperties {
  return {
    width: overlay.size,
    height: overlay.size,
    color: box.color
  };
}

function runeliteStatusBarOverlayStyle(bar: RuneliteStatusBarSnapshot, layout: NhFixedClientCssLayout | null): CSSProperties {
  const scale = layout?.scale ?? 1;
  return {
    left: bar.left,
    top: bar.top,
    width: bar.width,
    height: bar.height,
    transform: `scale(${scale})`,
    transformOrigin: "left top"
  };
}

function runeliteStatusOrbOverlayStyle(orb: RuneliteStatusOrbSnapshot, layout: NhFixedClientCssLayout | null): CSSProperties {
  const scale = layout?.scale ?? 1;
  return {
    left: orb.left,
    top: orb.top,
    width: orb.diameter,
    height: orb.diameter,
    transform: `scale(${scale})`,
    transformOrigin: "left top"
  };
}

function runeliteStatusBarFillStyle(bar: RuneliteStatusBarSnapshot): CSSProperties {
  const top = RUNELITE_STATUS_BARS_PADDING + (bar.height - bar.filledHeight);
  return {
    left: RUNELITE_STATUS_BARS_PADDING,
    top,
    width: RUNELITE_STATUS_BARS_BAR_WIDTH - RUNELITE_STATUS_BARS_PADDING * 2,
    height: Math.max(0, bar.filledHeight - RUNELITE_STATUS_BARS_PADDING * 2),
    background: bar.standardColor
  };
}

function runeliteStatusBarRestoreStyle(bar: RuneliteStatusBarSnapshot): CSSProperties {
  const restoreHeight = Math.min(
    bar.height,
    Math.max(0, Math.round((Math.max(0, bar.restoreValue) / Math.max(1, bar.maximumValue)) * bar.height))
  );
  const top =
    bar.filledHeight + restoreHeight > bar.height
      ? bar.height - bar.filledHeight - restoreHeight + RUNELITE_STATUS_BARS_HEAL_OFFSET
      : bar.height - bar.filledHeight - restoreHeight + RUNELITE_STATUS_BARS_HEAL_OFFSET - RUNELITE_STATUS_BARS_OVERHEAL_OFFSET;
  return {
    left: RUNELITE_STATUS_BARS_PADDING,
    top,
    width: RUNELITE_STATUS_BARS_BAR_WIDTH - RUNELITE_STATUS_BARS_PADDING * 2,
    height: Math.max(0, restoreHeight + RUNELITE_STATUS_BARS_OVERHEAL_OFFSET - RUNELITE_STATUS_BARS_PADDING * 2),
    background: bar.filledHeight + restoreHeight > bar.height ? "rgba(216, 255, 139, 0.588)" : bar.restoreColor
  };
}

function runeliteStatusBarIconStyle(bar: RuneliteStatusBarSnapshot): CSSProperties {
  return {
    left: RUNELITE_STATUS_BARS_ICON_AND_COUNTER_OFFSET_X + RUNELITE_STATUS_BARS_PADDING,
    top: RUNELITE_STATUS_BARS_ICON_AND_COUNTER_OFFSET_Y - bar.iconHeight,
    width: bar.iconWidth,
    height: bar.iconHeight
  };
}

function runeliteStatusBarCounterStyle(bar: RuneliteStatusBarSnapshot): CSSProperties {
  return {
    top: bar.enableSkillIcon ? RUNELITE_STATUS_BARS_SKILL_ICON_HEIGHT - RUNELITE_STATUS_BARS_COUNTER_ICON_HEIGHT : 0,
    height: RUNELITE_STATUS_BARS_COUNTER_ICON_HEIGHT
  };
}

function runeliteOpponentInfoOverlayStyle(
  snapshot: RuneliteOpponentInfoSnapshot,
  layout: NhFixedClientCssLayout | null,
  overlayLocations: RuneliteOverlayPreferredLocations
): CSSProperties {
  const scale = layout?.scale ?? 1;
  const preferredLocation = runeliteOverlayPreferredLocationStyle("OpponentInfoOverlay", overlayLocations, scale);
  return {
    left: 0,
    top: 0,
    width: snapshot.width,
    transform: `scale(${scale})`,
    transformOrigin: "left top",
    ...(preferredLocation ?? {})
  };
}

function runeliteOpponentComparisonOverlayStyle(
  snapshot: RuneliteOpponentComparisonSnapshot,
  layout: NhFixedClientCssLayout | null,
  overlayLocations: RuneliteOverlayPreferredLocations
): CSSProperties {
  const scale = layout?.scale ?? 1;
  const preferredLocation = runeliteOverlayPreferredLocationStyle("PlayerComparisonOverlay", overlayLocations, scale);
  return {
    left: 0,
    bottom: 0,
    width: RUNELITE_OPPONENT_INFO_STANDARD_WIDTH,
    transform: `scale(${scale})`,
    transformOrigin: "left bottom",
    ["--runelite-opponent-comparison-highlight" as string]: RUNELITE_OPPONENT_COMPARISON_HIGHLIGHT_COLOR,
    ["--runelite-opponent-comparison-row-count" as string]: snapshot.rows.length,
    ...(preferredLocation ?? {})
  };
}

function runeliteOpponentInfoProgressFillStyle(snapshot: RuneliteOpponentInfoSnapshot): CSSProperties {
  return {
    width: `${snapshot.fillPercent}%`
  };
}

function runtimeDomOverlaySpriteStyle(sprite: RuntimeDomOverlaySprite): CSSProperties {
  return {
    left: sprite.left,
    top: sprite.top,
    width: sprite.width,
    height: sprite.height,
    opacity: sprite.opacity,
    zIndex: sprite.renderOrder,
    backgroundImage: `url(render/sprites/${sprite.atlasImage})`,
    backgroundPosition: `-${sprite.sourceX}px -${sprite.sourceY}px`,
    backgroundSize: `${sprite.atlasWidth}px ${sprite.atlasHeight}px`
  };
}

const clientSpriteScaleCameraRight = new Vector3();
const clientSpriteScaleCameraUp = new Vector3();
const clientSpriteScaleRootWorld = new Vector3();
const clientSpriteScaleChildWorld = new Vector3();

function applyClientSpritePixelScale(root: Object3D, camera: PerspectiveCamera, viewport: NhFixedClientLayout["viewport"]): void {
  const unitsPerPixel = nhClientPixelScaleAtWorldPosition(camera, viewport, root.position);
  root.updateMatrixWorld(true);
  clientSpriteScaleCameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  clientSpriteScaleCameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  root.getWorldPosition(clientSpriteScaleRootWorld);

  root.traverse((node) => {
    if (!(node instanceof Sprite)) {
      return;
    }

    const sprite = node as ClientSprite;
    const spritePixels = sprite.userData.clientSpritePixels;
    if (!spritePixels) {
      return;
    }

    sprite.scale.set(spritePixels.width * unitsPerPixel, spritePixels.height * unitsPerPixel, 1);
    if (sprite !== root) {
      clientSpriteScaleChildWorld
        .copy(clientSpriteScaleRootWorld)
        .addScaledVector(clientSpriteScaleCameraRight, spritePixels.offsetX * unitsPerPixel)
        .addScaledVector(clientSpriteScaleCameraUp, spritePixels.offsetY * unitsPerPixel);
      sprite.position.copy(root.worldToLocal(clientSpriteScaleChildWorld));
    }
  });
}

function clientSpriteSourceEntries(root: Object3D): readonly ClientSpriteSourceData[] {
  const entries: ClientSpriteSourceData[] = [];
  root.traverse((node) => {
    if (node instanceof Sprite) {
      const source = (node as ClientSprite).userData.nhSpriteSource;
      if (source) {
        entries.push(source);
      }
    }
  });
  return entries;
}

function writeRuntimeDebugSnapshot(cycle: number, overlays: readonly NhRuntimeOverlayDebugEntry[]): void {
  window.__nhRuntimeDebug = { ...window.__nhRuntimeDebug, cycle, overlays };
}

function writeRuntimeMotionDebugSnapshot(
  boundary: RuntimeSceneBoundary,
  snapshot: RuntimeSceneSnapshot,
  now: number
): void {
  const viewport = runtimeOverlayViewport(boundary);
  const actors = snapshot.actors.map((pose) => {
    const slot = boundary.actorSlots.get(pose.actorId);
    const position = slot?.group.position;
    const renderTile = pose.renderTile ?? pose.tile;
    const projection = position
      ? nhProjectWorldPointToViewport(boundary.camera, viewport, position)
      : null;
    return {
      actorId: pose.actorId,
      sequenceName: pose.sequenceName,
      sequenceMode: pose.sequenceMode,
      actionSequenceKey: pose.actionSequenceKey,
      animationCycle: pose.animationCycle,
      primaryFrame: pose.primaryFrame,
      primaryFrameCycle: pose.primaryFrameCycle,
      tile: pose.tile,
      renderTile,
      world: {
        x: position?.x ?? renderTile.x,
        y: position?.y ?? 0,
        z: position?.z ?? renderTile.z
      },
      screen: projection
        ? {
          x: projection.x,
          y: projection.y,
          depthClientUnits: projection.depthClientUnits
        }
        : null,
      movementFrame: pose.movementFrame,
      movementFrameCycle: pose.movementFrameCycle
    };
  });
  window.__nhRuntimeDebug = {
    ...window.__nhRuntimeDebug,
    cycle: snapshot.cycle,
    overlays: window.__nhRuntimeDebug?.overlays ?? [],
    motion: {
      timeMs: now,
      clientCycle: Math.floor(now / NH_CLIENT_CYCLE_MS),
      actors
    }
  };
}

function writeManualOpponentPolicyDebugSnapshot(response: ManualOpponentCombatResponse): void {
  const entry: NhRuntimeManualOpponentPolicyDebugEntry = {
    tick: response.combatState.tick,
    controllerId: response.policyControllerId,
    action: response.policyAction ? formatManualOpponentPolicyAction(response.policyAction) : "",
    effectiveAction: response.policyEffectiveAction ? formatManualOpponentPolicyAction(response.policyEffectiveAction) : "",
    movementApplied: response.policyMovementApplied,
    movementBlockedReason: response.policyMovementBlockedReason,
    nextRepositionTick: response.policyNextRepositionTick,
    localTile: response.policyActualLocalTile,
    observedLocalTile: response.policyObservedLocalTile,
    opponentTile: response.opponentActor.tile
  };
  window.__nhRuntimeDebug = {
    ...window.__nhRuntimeDebug,
    cycle: window.__nhRuntimeDebug?.cycle ?? response.combatState.tick,
    overlays: window.__nhRuntimeDebug?.overlays ?? [],
    manualOpponentPolicy: [...(window.__nhRuntimeDebug?.manualOpponentPolicy ?? []), entry].slice(-64)
  };
}

function compactManualOpponentRouteRequests(
  routeRequests: readonly RuntimePlayerCombatRouteRequest[]
): readonly NhRuntimeManualOpponentRouteDebugEntry[] {
  return routeRequests.map((request) => ({
    actorId: request.actorId,
    targetId: request.targetId,
    reason: request.reason,
    attackRange: request.attackRange,
    targetTile: request.targetTile
  }));
}

function formatManualOpponentRouteRequestsForDataset(
  routeRequests: readonly RuntimePlayerCombatRouteRequest[]
): string {
  return routeRequests
    .map((request) => `${request.actorId}:${request.reason}:r${request.attackRange}->${formatRuntimeTileForDataset(request.targetTile)}`)
    .join("|");
}

function writeManualOpponentTickAuditSnapshot(
  viewport: HTMLElement,
  input: {
    readonly response: ManualOpponentCombatResponse;
    readonly localBeforeMovementTile: RuntimeTile;
    readonly opponentBeforeMovementTile: RuntimeTile;
    readonly localAfterTickTile: RuntimeTile;
    readonly opponentAfterTickTile: RuntimeTile;
    readonly localMovementConsumed: boolean;
    readonly opponentMovementConsumed: boolean;
    readonly preAttackRouteMoved: boolean;
    readonly routeRequests: readonly RuntimePlayerCombatRouteRequest[];
  }
): void {
  const entry: NhRuntimeManualOpponentTickAuditEntry = {
    tick: input.response.combatState.tick,
    controllerId: input.response.policyControllerId,
    action: input.response.policyAction ? formatManualOpponentPolicyAction(input.response.policyAction) : "",
    effectiveAction: input.response.policyEffectiveAction
      ? formatManualOpponentPolicyAction(input.response.policyEffectiveAction)
      : "",
    localBeforeMovementTile: input.localBeforeMovementTile,
    opponentBeforeMovementTile: input.opponentBeforeMovementTile,
    localAfterTickTile: input.localAfterTickTile,
    opponentAfterTickTile: input.opponentAfterTickTile,
    policyMovementApplied: input.response.policyMovementApplied,
    policyMovementBlockedReason: input.response.policyMovementBlockedReason,
    policyMovedDx: input.response.policyLastMoveDx,
    policyMovedDy: input.response.policyLastMoveDy,
    localMovementConsumed: input.localMovementConsumed,
    opponentMovementConsumed: input.opponentMovementConsumed,
    preAttackRouteMoved: input.preAttackRouteMoved,
    routeRequests: compactManualOpponentRouteRequests(input.routeRequests)
  };

  viewport.dataset.lastManualOpponentAuditRouteRequests = formatManualOpponentRouteRequestsForDataset(input.routeRequests);
  viewport.dataset.lastManualOpponentAuditLocalMovementConsumed = String(input.localMovementConsumed);
  viewport.dataset.lastManualOpponentAuditOpponentMovementConsumed = String(input.opponentMovementConsumed);
  viewport.dataset.lastManualOpponentAuditPreAttackRouteMoved = String(input.preAttackRouteMoved);
  window.__nhRuntimeDebug = {
    ...window.__nhRuntimeDebug,
    cycle: window.__nhRuntimeDebug?.cycle ?? input.response.combatState.tick,
    overlays: window.__nhRuntimeDebug?.overlays ?? [],
    manualOpponentAudit: [...(window.__nhRuntimeDebug?.manualOpponentAudit ?? []), entry].slice(-64)
  };
}

function runtimeOverlayViewport(boundary: RuntimeSceneBoundary): NhFixedClientLayout["viewport"] {
  return boundary.fixedClientLayout?.viewport ?? {
    rect: {
      x: 0,
      y: 0,
      width: boundary.renderer.domElement.clientWidth,
      height: boundary.renderer.domElement.clientHeight
    },
    zoom: 1
  };
}

function reprojectRuntimeOverlaySprites(boundary: RuntimeSceneBoundary, snapshot: RuntimeSceneSnapshot): void {
  const viewport = runtimeOverlayViewport(boundary);
  for (const child of boundary.eventRoot.children) {
    const anchor = (child as RuntimeOverlayObject).userData.nhRuntimeOverlayAnchor;
    if (!anchor) {
      continue;
    }

    const pose = snapshot.actors.find((actor) => actor.actorId === anchor.actorId);
    const slot = boundary.actorSlots.get(anchor.actorId);
    if (!pose || !slot) {
      child.visible = false;
      continue;
    }

    const overlayPosition = nhOverlayWorldPositionFromViewport(
      boundary.camera,
      viewport,
      slot.group.position,
      anchor.placement
    );
    if (!overlayPosition) {
      child.visible = false;
      continue;
    }

    child.visible = true;
    child.position.copy(overlayPosition);
    applyClientSpritePixelScale(child, boundary.camera, viewport);
  }
}

function applySnapshot(
  boundary: RuntimeSceneBoundary,
  snapshot: RuntimeSceneSnapshot,
  models: ReadonlyMap<string, RuntimeActorModelAsset>,
  animationFixtures: NhAnimationFixtures | null,
  collisionMap: NhSceneCollision | null,
  entityHiderConfig: RuneliteEntityHiderConfigSnapshot,
  hideUnderConfig: RuneliteHideUnderConfigSnapshot,
  pvpToolsRenderSelf: boolean,
  combatState: RuntimePlayerCombatState,
  animationSmoothingConfig: RuneliteAnimationSmoothingConfigSnapshot
): void {
  const actorAnimationOptions = {
    interpolateFrames: animationSmoothingConfig.enabled && animationSmoothingConfig.smoothPlayerAnimations
  };
  for (const pose of snapshot.actors) {
    const slot = boundary.actorSlots.get(pose.actorId);
    const modelKey = runtimeActorModelKey(pose, animationFixtures);
    const model = models.get(modelKey);

    if (!slot || !model) {
      continue;
    }

    if (slot.currentModelKey !== modelKey) {
      const previousModelKey = slot.currentModelKey;
      clearActorSlot(slot);
      slot.group.add(buildActorModel(model.scene, model.metadata));
      slot.currentModelKey = modelKey;
      emitRuntimeActorModelSwap(boundary, snapshot, pose, previousModelKey, modelKey);
    }

    const renderTile = pose.renderTile ?? pose.tile;
    slot.group.visible =
      runelitePvpToolsActorRenderSelfVisible(pose, pvpToolsRenderSelf) &&
      runeliteEntityHiderActorVisible(pose, entityHiderConfig) &&
      runeliteHideUnderActorVisible(pose, snapshot, combatState, hideUnderConfig);
    slot.group.position.set(renderTile.x, collisionMap?.sampleHeight(renderTile) ?? 0, renderTile.z);
    slot.group.rotation.y = nhActorModelRotationRadiansFromFacingDegrees(pose.facingDegrees);
    const primaryFrameCursor =
      pose.primaryFrame !== undefined && pose.primaryFrameCycle !== undefined
        ? { frameIndex: pose.primaryFrame, frameCycle: pose.primaryFrameCycle }
        : undefined;
    const movementFrameCursor =
      pose.movementFrame !== undefined && pose.movementFrameCycle !== undefined
        ? { frameIndex: pose.movementFrame, frameCycle: pose.movementFrameCycle }
        : undefined;
    const sourceAnimationCycle = pose.animationCycle ?? snapshot.cycle - snapshot.keyframeCycle;
    let animationCycle = sourceAnimationCycle;
    let resolvedPrimaryFrameCursor = primaryFrameCursor;
    const actionSequenceKey = pose.sequenceMode === "primary" ? pose.actionSequenceKey ?? null : null;
    if (slot.currentActionSequenceKey !== actionSequenceKey) {
      slot.currentActionSequenceKey = actionSequenceKey;
      if (actionSequenceKey) {
        // Source: LoginPacket.method3722 accepts a new primary sequence by resetting
        // sequenceFrame and sequenceFrameCycle. Even if the browser had a delayed draw,
        // the first applied model pose for the new action must expose that reset frame.
        animationCycle = 0;
        resolvedPrimaryFrameCursor = { frameIndex: 0, frameCycle: 0 };
      }
      slot.lastActionAnimationCycle = actionSequenceKey ? Math.max(0, animationCycle) : 0;
      slot.lastActionPrimaryFrame = resolvedPrimaryFrameCursor?.frameIndex ?? null;
      slot.lastActionPrimaryFrameCycle = resolvedPrimaryFrameCursor?.frameCycle ?? null;
    } else if (actionSequenceKey) {
      // Nh client LoginPacket.method3722 starts a sequence once, then class329 only advances
      // sequenceFrameCycle; React/equipment commits must not rewind an already-active attack sequence.
      if (sourceAnimationCycle < slot.lastActionAnimationCycle) {
        animationCycle = slot.lastActionAnimationCycle;
        slot.actionAnimationRewindCount += 1;
        resolvedPrimaryFrameCursor =
          slot.lastActionPrimaryFrame !== null && slot.lastActionPrimaryFrameCycle !== null
            ? {
              frameIndex: slot.lastActionPrimaryFrame,
              frameCycle: slot.lastActionPrimaryFrameCycle
            }
            : resolvedPrimaryFrameCursor;
      } else {
        slot.lastActionAnimationCycle = sourceAnimationCycle;
        slot.lastActionPrimaryFrame = resolvedPrimaryFrameCursor?.frameIndex ?? null;
        slot.lastActionPrimaryFrameCycle = resolvedPrimaryFrameCursor?.frameCycle ?? null;
      }
    } else {
      slot.lastActionPrimaryFrame = null;
      slot.lastActionPrimaryFrameCycle = null;
    }
    if (pose.actorId === "local-player") {
      const canvas = boundary.renderer.domElement;
      canvas.dataset.lastLocalActionSequenceKey = actionSequenceKey ?? "";
      canvas.dataset.lastLocalActionAnimationCycle = actionSequenceKey ? String(animationCycle) : "";
      canvas.dataset.lastLocalActionAnimationRewindSuppressed = String(slot.actionAnimationRewindCount);
      if (actionSequenceKey && window.__nhActionSequenceApplyLog) {
        window.__nhActionSequenceApplyLog.push({
          atMs: performance.now(),
          actorId: pose.actorId,
          sequenceName: pose.sequenceName,
          actionSequenceKey,
          animationCycle,
          sourceAnimationCycle,
          primaryFrame: resolvedPrimaryFrameCursor?.frameIndex,
          primaryFrameCycle: resolvedPrimaryFrameCursor?.frameCycle,
          rewindSuppressed: animationCycle !== sourceAnimationCycle
        });
        if (window.__nhActionSequenceApplyLog.length > 400) {
          window.__nhActionSequenceApplyLog.splice(0, window.__nhActionSequenceApplyLog.length - 400);
        }
      }
    }
    applyNhActorAnimation(
      slot.group,
      pose.sequenceName,
      animationCycle,
      animationFixtures,
      pose.sequenceMode,
      pose.movementSequenceName,
      pose.movementAnimationCycle ?? snapshot.cycle - snapshot.keyframeCycle,
      {
        ...actorAnimationOptions,
        primaryFrameCursor: resolvedPrimaryFrameCursor ?? (pose.sequenceMode === "primary" ? undefined : movementFrameCursor),
        movementFrameCursor
      }
    );
  }
}

function applyRuntimeEvents(
  boundary: RuntimeSceneBoundary,
  snapshot: RuntimeSceneSnapshot,
  events: readonly RuntimeRenderEvent[],
  effectModels: ReadonlyMap<string, RuntimeEffectAsset>,
  animationFixtures: NhAnimationFixtures | null,
  spotanimDefinitions: ReadonlyMap<number, NhSpotanimDefinition>,
  projectileDefinitions: ReadonlyMap<string, NhProjectileDefinition>,
  spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, RuntimeSpriteAtlas>
): void {
  disposeObject(boundary.eventRoot);
  boundary.eventRoot.clear();

  const sortedEvents = [...events].sort((left, right) => nhOverlaySortValue(left) - nhOverlaySortValue(right));
  const overlayStackCounts = new Map<string, number>();
  const overlayEventsByActor = new Map<RuntimeActorId, RuntimeRenderEvent[]>();
  const overlayDebugEntries: NhRuntimeOverlayDebugEntry[] = [];
  for (const event of sortedEvents) {
    if (event.kind !== "overlay-sprite" || !event.actorId) {
      continue;
    }

    const actorEvents = overlayEventsByActor.get(event.actorId) ?? [];
    actorEvents.push(event);
    overlayEventsByActor.set(event.actorId, actorEvents);
  }

  for (const event of sortedEvents) {
    if (event.kind === "overlay-sprite" && event.actorId && event.spriteSheetId && event.spriteId !== undefined) {
      const atlas = spriteAtlases.get(event.spriteSheetId);
      const sortValue = nhOverlaySortValue(event);
      const renderOrder = 20 + sortValue;
      const layoutCycle = event.clientCycle ?? snapshot.cycle;
      const overlay =
        event.spriteSheetId === "hitsplats" && event.hitsplat
          ? buildHitsplatOverlay(spriteAtlases, event, renderOrder, layoutCycle)
          : atlas && event.spriteSheetId === "health_bars" && event.healthBar
            ? buildHealthBarOverlay(atlas, event, renderOrder, layoutCycle)
            : atlas
              ? buildOverlaySprite(atlas, event.spriteId, { renderOrder, spriteFrame: event.spriteFrame })
              : null;
      const pose = snapshot.actors.find((actor) => actor.actorId === event.actorId);
      const slot = boundary.actorSlots.get(event.actorId);
      if (overlay && pose && slot) {
        const viewport = runtimeOverlayViewport(boundary);
        const stackKey = `${event.actorId}:${event.spriteSheetId}`;
        const stackIndex = overlayStackCounts.get(stackKey) ?? 0;
        overlayStackCounts.set(stackKey, stackIndex + 1);
        overlay.renderOrder = renderOrder;
        const placementSprite =
          event.spriteSheetId === "hitsplats"
            ? hitsplatPlacementSprite(spriteAtlases, event, layoutCycle)
            : event.spriteId === undefined
              ? undefined
              : atlas
                ? spriteAtlasEntry(atlas, event.spriteId, event.spriteFrame)
                : undefined;
        const placement = nhActorOverlayPlacement(
          event,
          overlayEventsByActor.get(event.actorId) ?? [],
          placementSprite,
          stackIndex
        );
        if (!placement) {
          disposeObject(overlay);
          continue;
        }
        const overlayPosition = nhOverlayWorldPositionFromViewport(
          boundary.camera,
          viewport,
          slot.group.position,
          placement
        );
        if (!overlayPosition) {
          disposeObject(overlay);
          continue;
        }

        overlay.position.copy(overlayPosition);
        applyClientSpritePixelScale(overlay, boundary.camera, viewport);
        (overlay as RuntimeOverlayObject).userData.nhRuntimeOverlayAnchor = {
          actorId: event.actorId,
          placement
        };
        overlayDebugEntries.push({
          id: event.id,
          actorId: event.actorId,
          spriteSheetId: event.spriteSheetId,
          spriteId: event.spriteId,
          spriteFrame: event.spriteFrame ?? 0,
          sortValue,
          renderOrder,
          placement,
          position: {
            x: overlay.position.x,
            y: overlay.position.y,
            z: overlay.position.z
          },
          sprites: clientSpriteSourceEntries(overlay),
          hitsplat: event.hitsplat
            ? {
              typeId: event.hitsplat.primary.typeId,
              value: event.hitsplat.primary.value,
              offsetX: placementSprite?.offsetX ?? 0,
              offsetY: placementSprite?.offsetY ?? 0,
              style: event.combatHit?.style,
              rawDamage: event.combatHit?.rawDamage,
              maxDamage: event.combatHit?.maxDamage,
              hitChance: event.combatHit?.hitChance
            }
            : undefined,
          healthBar: event.healthBar
            ? {
              definitionId: event.healthBar.definition.id,
              frontSpriteId: event.healthBar.definition.frontSpriteId,
              backSpriteId: event.healthBar.definition.backSpriteId,
              previousHealth: event.healthBar.update.health,
              targetHealth: event.healthBar.update.health2,
              cycleOffset: event.healthBar.update.cycleOffset
            }
            : undefined
        });
        // Actor overhead UI is drawn by the fixed 2D overlay layer; keep this path only for source-shaped debug metrics.
        disposeObject(overlay);
      }
      continue;
    }

    const key = eventModelKey(event);
    const model = key ? effectModels.get(key) : null;
    if (!model) {
      continue;
    }

    const object = buildEffectModel(model.scene, model.metadata);
    applyRuntimeEffectAnimation(object, event, snapshot, animationFixtures, spotanimDefinitions);
    if (!applyRuntimeEffectPlacement(object, event, snapshot, projectileDefinitions)) {
      disposeObject(object);
      continue;
    }

    object.userData.nhRuntimeEventId = event.id;
    boundary.eventRoot.add(object);
  }

  writeRuntimeDebugSnapshot(snapshot.cycle, overlayDebugEntries);
}

function runtimePlayerCombatRenderEvents(
  combatState: RuntimePlayerCombatState,
  hitsplatDefinitions: NhHitsplatDefinitionStore,
  healthBarDefinitions: NhHealthBarDefinitionStore,
  overheadIconDefinitions: NhOverheadIconDefinitionStore
): readonly RuntimeRenderEvent[] {
  const events: RuntimeRenderEvent[] = [];
  const clientCycle = combatState.tick * NH_CLIENT_CYCLES_PER_GAME_TICK;
  const activeHitsplatEvents = combatState.events.filter(
    (event): event is Extract<RuntimePlayerCombatEvent, { readonly kind: "hitsplat" }> =>
      event.kind === "hitsplat" &&
      event.tick <= combatState.tick &&
      runtimePlayerCombatHitsplatEndTick(event.tick) >= combatState.tick
  );
  const activeHealthEvents = combatState.events.filter(
    (event): event is Extract<RuntimePlayerCombatEvent, { readonly kind: "hitsplat" }> =>
      event.kind === "hitsplat" &&
      event.tick <= combatState.tick &&
      runtimePlayerCombatHealthBarEndTick(event.tick) >= combatState.tick
  );
  const latestHealthEventByActor = new Map<RuntimeActorId, Extract<RuntimePlayerCombatEvent, { readonly kind: "hitsplat" }>>();
  const activeHitsplatEventIds = new Set(activeHitsplatEvents.map((event) => event.id));
  for (const event of activeHealthEvents) {
    const latest = latestHealthEventByActor.get(event.targetActorId);
    if (!latest || event.tick >= latest.tick) {
      latestHealthEventByActor.set(event.targetActorId, event);
    }
  }

  for (const event of combatState.events) {
    if (event.kind === "attack" && event.projectile) {
      if (event.projectile.gfxId < 0 || event.projectile.artifactUrl.length === 0) {
        continue;
      }
      const distance = runtimePlayerCombatDistance(event.attackerTile, event.defenderTile, NH_TILE_WORLD_UNITS);
      const durationCycles =
        event.projectileDurationCycles ?? runtimePlayerCombatProjectileDurationCycles(event.projectile, distance);
      // Nh Ice Barrage uses Projectile.skipTravel(), which starts the packet on the target tile.
      // The trainer intentionally renders the visible ice effect from caster to defender for NH readability per user request.
      const sourceTile = event.projectile.id === "ice_barrage_projectile"
        ? event.attackerTile
        : event.projectile.skipTravel
          ? event.defenderTile
          : event.attackerTile;
      events.push({
        id: event.id,
        kind: "projectile",
        label: event.projectile.id,
        startCycle: event.tick,
        endCycle: event.tick + event.hitDelayTicks,
        projectileId: event.projectile.id,
        projectile: {
          gfxId: event.projectile.gfxId,
          plane: 0,
          targetIndex: event.defenderId === "local-player" ? -1 : -2,
          sourceTile,
          destinationTile: event.defenderTile,
          sourceHeight: event.projectile.startHeight,
          destinationHeight: event.projectile.endHeight,
          delayCycles: event.projectile.delayCycles,
          durationCycles,
          cycleStart: event.tick + event.projectile.delayCycles,
          cycleEnd: event.tick + durationCycles,
          slope: event.projectile.curve,
          startDistanceOffset: event.projectile.offset,
          packetCycle: event.tick,
          skipTravel: event.projectile.skipTravel
        },
        fromTile: sourceTile,
        toTile: event.defenderTile,
        artifactUrl: event.projectile.artifactUrl
      });
    } else if (event.kind === "spotanim") {
      events.push({
        id: event.id,
        kind: "spotanim",
        label: `spotanim ${event.spotanimId}`,
        startCycle: event.tick,
        endCycle: event.tick + 1,
        actorId: event.actorId,
        spotanimId: event.spotanimId,
        artifactUrl: event.artifactUrl
      });
    } else if (event.kind === "hitsplat") {
      if (activeHitsplatEventIds.has(event.id)) {
        const hitsplat = createNhHitsplatRenderState(
          {
            primaryType: nhHitsplatTypeForDamage(event.damage),
            primaryValue: event.damage,
            secondaryType: NH_HITSPLAT_EMPTY_SECONDARY_TYPE,
            secondaryValue: 0,
            packetCycle: event.tick * NH_CLIENT_CYCLES_PER_GAME_TICK,
            delayCycles: 0,
            slotIndex: event.slotIndex
          },
          hitsplatDefinitions
        );
        events.push({
          id: event.id,
          kind: "overlay-sprite",
          label: `${hitsplat.primary.definition.label} ${event.damage}`,
          startCycle: event.tick,
          endCycle: runtimePlayerCombatHitsplatEndTick(event.tick),
          actorId: event.targetActorId,
          spriteSheetId: "hitsplats",
          spriteId: nhHitsplatPrimarySpriteId(hitsplat),
          clientOrder: event.tick * 100 + runtimePlayerCombatOverlayActorOffset(event.targetActorId) + 40,
          clientCycle,
          hitsplat,
          combatHit: {
            attackerId: event.attackerId,
            style: event.style,
            damage: event.damage,
            rawDamage: event.rawDamage,
            maxDamage: event.maxDamage,
            hitChance: event.hitChance
          }
        });
      }
    }
  }

  for (const event of latestHealthEventByActor.values()) {
    const healthRatio = event.nextHitpoints / event.maxHitpoints;
    const previousHealthRatio = event.previousHitpoints / event.maxHitpoints;
    const healthBarDefinition =
      nhHealthBarDefinition(NH_PLAYER_HEALTH_BAR_DEFINITION_ID, healthBarDefinitions) ??
      nhPlayerHealthBarDefinition;
    const healthBar = createNhHealthBarRenderState(
      event.tick * NH_CLIENT_CYCLES_PER_GAME_TICK,
      healthRatio,
      previousHealthRatio,
      1,
      healthBarDefinition
    );
    events.push({
      id: `${event.targetActorId}-runtime-health`,
      kind: "overlay-sprite",
      label: `health ${Math.round(healthRatio * 100)}%`,
      startCycle: event.tick,
      endCycle: runtimePlayerCombatHealthBarEndTick(event.tick),
      actorId: event.targetActorId,
      spriteSheetId: "health_bars",
      spriteId: healthBar.definition.frontSpriteId,
      clientOrder: event.tick * 100 + runtimePlayerCombatOverlayActorOffset(event.targetActorId) + 10,
      clientCycle,
      healthRatio,
      healthBar
    });
  }

  for (const actor of Object.values(combatState.actors)) {
    const prayer = runtimePlayerCombatActiveProtectionPrayer(actor);
    if (prayer) {
      const definition = nhPrayerOverheadDefinition(prayer, overheadIconDefinitions);
      if (definition) {
        events.push({
          id: `${actor.id}-prayer-${definition.spriteFrame}`,
          kind: "overlay-sprite",
          label: definition.label,
          startCycle: combatState.tick,
          endCycle: combatState.tick,
          actorId: actor.id,
          spriteSheetId: definition.spriteSheetId,
          spriteId: definition.spriteId,
          spriteFrame: definition.spriteFrame,
          clientOrder: combatState.tick * 100 + runtimePlayerCombatOverlayActorOffset(actor.id) + 30
        });
      }
    }
    const skull = nhSkullOverheadDefinition("white_pk", overheadIconDefinitions);
    if (skull) {
      events.push({
        id: `${actor.id}-skull`,
        kind: "overlay-sprite",
        label: skull.label,
        startCycle: combatState.tick,
        endCycle: combatState.tick,
        actorId: actor.id,
        spriteSheetId: skull.spriteSheetId,
        spriteId: skull.spriteId,
        spriteFrame: skull.spriteFrame,
        clientOrder: combatState.tick * 100 + runtimePlayerCombatOverlayActorOffset(actor.id) + 20
      });
    }
  }

  return events.filter((event) => event.startCycle <= combatState.tick && event.endCycle >= combatState.tick);
}

function runtimePlayerCombatOverlayActorOffset(actorId: RuntimeActorId): number {
  return actorId === "local-player" ? 0 : 50;
}

function formatPose(pose: RuntimeActorPose): string {
  const loadout = runtimeLoadouts.find((candidate) => candidate.id === pose.loadoutId);
  const renderTile = pose.renderTile ?? pose.tile;
  return `${pose.actorId}: ${loadout?.label ?? pose.loadoutId}, ${pose.sequenceName} @ (${renderTile.x}, ${renderTile.z})`;
}

function isNhInventoryEquipEntry(entry: NhInventoryContextMenuEntry): boolean {
  return entry.action === "inventory-action" && ["wear", "wield"].includes(entry.actionText.toLowerCase());
}

function nextNhGameTickAt(originMs: number, nowMs: number): number {
  const elapsed = Math.max(0, nowMs - originMs);
  return originMs + (Math.floor(elapsed / NH_GAME_TICK_MS) + 1) * NH_GAME_TICK_MS;
}

function currentNhGameTickAt(originMs: number, nowMs: number): number {
  const elapsed = Math.max(0, nowMs - originMs);
  return Math.floor(elapsed / NH_GAME_TICK_MS);
}

function nhGameTickDelay(originMs: number, nowMs: number): number {
  return Math.max(0, nextNhGameTickAt(originMs, nowMs) - nowMs);
}

interface RunelitePvpTrackerActorAccumulator {
  attacks: number;
  offPraySuccesses: number;
  damageDealt: number;
  expectedDamage: number;
  magicAttempts: number;
  magicHits: number;
  magicHitExpected: number;
  offensivePraySuccesses: number;
  hpHealed: number;
  nonMagicAttacksTaken: number;
  robeHitsTaken: number;
  koChances: number;
  koSurvivalProbability: number;
  lastKoChance: number | null;
}

function createRunelitePvpTrackerActorAccumulator(): RunelitePvpTrackerActorAccumulator {
  return {
    attacks: 0,
    offPraySuccesses: 0,
    damageDealt: 0,
    expectedDamage: 0,
    magicAttempts: 0,
    magicHits: 0,
    magicHitExpected: 0,
    offensivePraySuccesses: 0,
    hpHealed: 0,
    nonMagicAttacksTaken: 0,
    robeHitsTaken: 0,
    koChances: 0,
    koSurvivalProbability: 1,
    lastKoChance: null
  };
}

const runeliteSuppliesTrackerCategoryOrder: readonly RuneliteSuppliesTrackerCategory[] = [
  "Food",
  "Potions",
  "Runes",
  "Ammo",
  "Teleports"
];

const runeliteSuppliesTrackerPriceByItemId: Readonly<Record<number, number>> = {
  385: 170,
  3144: 250,
  13441: 450,
  6685: 200,
  3024: 300,
  10925: 300,
  12695: 250,
  2444: 140,
  22461: 360
};

interface RuneliteServerItemValueRow {
  readonly id: number;
  readonly name: string;
  readonly protectValue?: number;
  readonly value?: number;
}

const runelitePvpToolsServerItemsById = new Map(
  (serverItemsJson as readonly RuneliteServerItemValueRow[]).map((item) => [item.id, item])
);

interface RuneliteSuppliesTrackerMutableItem {
  readonly itemId: number;
  readonly displayItemId: number;
  readonly name: string;
  readonly category: RuneliteSuppliesTrackerCategory;
  readonly quantity: number;
  readonly price: number;
  readonly sprite: RuneliteSuppliesTrackerSpriteSnapshot | null;
  readonly sourceDefinition: string;
}

function runeliteSuppliesTrackerSnapshotFromCombatState(
  combatState: RuntimePlayerCombatState,
  spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, RuntimeSpriteAtlas>
): RuneliteSuppliesTrackerSnapshot {
  const entries = new Map<number, RuneliteSuppliesTrackerMutableItem>();

  for (const event of combatState.events) {
    if (event.kind !== "supply" || event.actorId !== "local-player") {
      continue;
    }

    const definition = consumableDefinitions[event.item];
    const canonicalItemId = runeliteSuppliesTrackerCanonicalItemId(event.item);
    const displayItemId = runeliteSuppliesTrackerDisplayItemId(event.item);
    const existing = entries.get(canonicalItemId);
    const quantity = (existing?.quantity ?? 0) + 1;
    const name = runeliteSuppliesTrackerCanonicalName(event.item);
    const category = runeliteSuppliesTrackerCategory(event.item);
    const unitPrice = runeliteSuppliesTrackerPriceByItemId[canonicalItemId] ?? 0;
    const price = Math.round((unitPrice * quantity) / runeliteSuppliesTrackerDoseDivisor(event.item));

    entries.set(canonicalItemId, {
      itemId: canonicalItemId,
      displayItemId,
      name,
      category,
      quantity,
      price,
      sprite: runeliteSuppliesTrackerSprite(spriteAtlases.get("item_sprites"), displayItemId, quantity),
      sourceDefinition: definition.label
    });
  }

  const items = [...entries.values()]
    .map(({ sourceDefinition: _sourceDefinition, ...entry }) => entry)
    .sort((left, right) => right.price - left.price || left.name.localeCompare(right.name));

  const categories = runeliteSuppliesTrackerCategoryOrder.flatMap((category) => {
    const categoryItems = items.filter((item) => item.category === category);
    if (categoryItems.length === 0) {
      return [];
    }

    return [
      {
        category,
        totalSupplies: categoryItems.reduce((sum, item) => sum + item.quantity, 0),
        totalPrice: categoryItems.reduce((sum, item) => sum + item.price, 0),
        items: categoryItems
      }
    ];
  });

  return {
    totalSupplies: categories.reduce((sum, category) => sum + category.totalSupplies, 0),
    totalPrice: categories.reduce((sum, category) => sum + category.totalPrice, 0),
    categories
  };
}

function runeliteSuppliesTrackerCanonicalItemId(item: ConsumableId): number {
  return consumableDefinitions[item].itemIds[0] ?? 0;
}

function runeliteSuppliesTrackerDisplayItemId(item: ConsumableId): number {
  const definition = consumableDefinitions[item];
  if (definition.kind === "brew" || definition.kind === "restore" || definition.kind === "reboost") {
    return definition.itemIds[definition.itemIds.length - 1] ?? definition.itemIds[0] ?? 0;
  }

  return definition.itemIds[0] ?? 0;
}

function runeliteSuppliesTrackerCanonicalName(item: ConsumableId): string {
  const definition = consumableDefinitions[item];
  if (definition.kind === "brew" || definition.kind === "restore" || definition.kind === "reboost") {
    return `${definition.label}(4)`;
  }

  return definition.label;
}

function runeliteSuppliesTrackerDoseDivisor(item: ConsumableId): number {
  const kind = consumableDefinitions[item].kind;
  return kind === "brew" || kind === "restore" || kind === "reboost" ? 4 : 1;
}

function runeliteSuppliesTrackerCategory(item: ConsumableId): RuneliteSuppliesTrackerCategory {
  const kind = consumableDefinitions[item].kind;
  return kind === "brew" || kind === "restore" || kind === "reboost" ? "Potions" : "Food";
}

function runeliteSuppliesTrackerSprite(
  atlas: RuntimeSpriteAtlas | undefined,
  itemId: number,
  quantity: number
): RuneliteSuppliesTrackerSpriteSnapshot | null {
  const sprite = atlas ? runeliteSuppliesTrackerItemSprite(atlas, itemId, quantity) : undefined;
  if (!atlas || !sprite) {
    return null;
  }

  return {
    imagePath: `render/sprites/${atlas.metadata.image}`,
    x: sprite.x,
    y: sprite.y,
    width: sprite.width,
    height: sprite.height,
    atlasWidth: atlas.metadata.width,
    atlasHeight: atlas.metadata.height
  };
}

function runeliteSuppliesTrackerItemSprite(
  atlas: RuntimeSpriteAtlas,
  itemId: number,
  quantity: number
): SpriteAtlasEntry | undefined {
  const normalizedQuantity = Math.max(1, Math.trunc(quantity));
  const matches = atlas.metadata.sprites.filter((sprite) => (sprite.itemId ?? sprite.spriteId) === itemId);
  return (
    runeliteSuppliesTrackerBestQuantityItemSprite(
      matches.filter((sprite) => sprite.variant === "normal"),
      normalizedQuantity
    ) ?? matches[0]
  );
}

function runeliteSuppliesTrackerBestQuantityItemSprite(
  sprites: readonly SpriteAtlasEntry[],
  quantity: number
): SpriteAtlasEntry | undefined {
  let best: SpriteAtlasEntry | undefined;
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

function runelitePvpToolsSnapshotFromCombatState(
  combatState: RuntimePlayerCombatState,
  snapshot: RuntimeSceneSnapshot,
  spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, RuntimeSpriteAtlas>
): RunelitePvpToolsSnapshot {
  const enemies = Object.values(combatState.actors).filter((actor) => actor.id !== "local-player");
  const enemyPrayers = enemies.map((actor) => runtimePlayerCombatActiveProtectionPrayer(actor));
  const carriedItems = runelitePvpToolsCarriedItems(combatState, snapshot, spriteAtlases);
  const totalRisk = carriedItems.reduce((sum, item) => sum + item.value, 0);
  const protectedItemCount = 1;
  const unprotectedItems = carriedItems.slice(protectedItemCount);

  return {
    friendlyPlayerCount: 0,
    enemyPlayerCount: enemies.filter((actor) => actor.hitpoints > 0).length,
    enemyPrayingMageCount: enemyPrayers.filter((prayer) => prayer === "protect_from_magic").length,
    enemyPrayingRangeCount: enemyPrayers.filter((prayer) => prayer === "protect_from_missiles").length,
    enemyPrayingMeleeCount: enemyPrayers.filter((prayer) => prayer === "protect_from_melee").length,
    brewCount: runelitePvpToolsInventoryItemCount(snapshot.inventory, consumableDefinitions.saradomin_brew.itemIds),
    totalRisk,
    riskProtectingItem: unprotectedItems.reduce((sum, item) => sum + item.value, 0),
    mostValuableItem: carriedItems[0] ?? null,
    missingClanMembers: [],
    currentClanMembers: [],
    inPvpArea: true
  };
}

function runelitePvpToolsCarriedItems(
  combatState: RuntimePlayerCombatState,
  snapshot: RuntimeSceneSnapshot,
  spriteAtlases: ReadonlyMap<RuntimeSpriteSheetId, RuntimeSpriteAtlas>
): readonly RunelitePvpToolsItemSnapshot[] {
  const equipmentItems = Object.values(combatState.actors["local-player"]?.equipment ?? {}).map((item) => ({
    itemId: item.itemId,
    quantity: 1
  }));
  const inventoryItems = snapshot.inventory
    .filter((slot): slot is RuntimeInventorySlot => Boolean(slot && slot.itemId > 0 && slot.quantity > 0))
    .map((slot) => ({ itemId: slot.itemId, quantity: slot.quantity }));

  return [...equipmentItems, ...inventoryItems]
    .map((item) => runelitePvpToolsItemSnapshot(item.itemId, item.quantity, spriteAtlases.get("item_sprites")))
    .filter((item): item is RunelitePvpToolsItemSnapshot => item !== null)
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
}

function runelitePvpToolsItemSnapshot(
  itemId: number,
  quantity: number,
  atlas: RuntimeSpriteAtlas | undefined
): RunelitePvpToolsItemSnapshot | null {
  const item = runelitePvpToolsServerItemsById.get(itemId);
  const unitValue = runelitePvpToolsItemValue(itemId);
  if (unitValue <= 0 && !item) {
    return null;
  }

  return {
    itemId,
    name: item?.name ?? `Item ${itemId}`,
    value: Math.max(0, Math.trunc(unitValue * Math.max(1, quantity))),
    sprite: runeliteSuppliesTrackerSprite(atlas, itemId, quantity)
  };
}

function runelitePvpToolsItemValue(itemId: number): number {
  const row = runelitePvpToolsServerItemsById.get(itemId);
  const serverValue = row?.protectValue ?? row?.value;
  if (typeof serverValue === "number" && Number.isFinite(serverValue) && serverValue > 0) {
    return serverValue;
  }

  return runeliteSuppliesTrackerPriceByItemId[itemId] ?? 0;
}

function runelitePvpToolsInventoryItemCount(
  slots: readonly (RuntimeInventorySlot | null)[],
  itemIds: readonly number[]
): number {
  const itemIdSet = new Set(itemIds);
  return slots.reduce((sum, slot) => (slot && itemIdSet.has(slot.itemId) ? sum + slot.quantity : sum), 0);
}

function runelitePvpTrackerSnapshotFromCombatState(
  combatState: RuntimePlayerCombatState,
  manualControl: boolean,
  storedFightHistory: readonly RunelitePvpFightHistoryEntrySnapshot[]
): RunelitePvpTrackerSnapshot | null {
  if (!manualControl) {
    return null;
  }

  const local = createRunelitePvpTrackerActorAccumulator();
  const opponent = createRunelitePvpTrackerActorAccumulator();
  let localKills = 0;
  let localDeaths = 0;
  const currentFightEvents = runeliteCurrentPvpFightEvents(combatState.events);

  runeliteAccumulatePvpTrackerEvents(currentFightEvents, local, opponent);
  for (const event of currentFightEvents) {
    if (event.kind === "death") {
      if (event.actorId === "local-player") {
        localDeaths += 1;
      } else {
        localKills += 1;
      }
    }
  }

  const fightStarted = local.attacks + opponent.attacks + local.damageDealt + opponent.damageDealt > 0;
  return {
    fightStarted,
    playerName: "local-player",
    opponentName: "opponent",
    kills: localKills,
    deaths: localDeaths,
    lines: runelitePvpTrackerLines(local, opponent),
    fightHistory: mergeRunelitePvpFightHistory(
      storedFightHistory,
      runelitePvpFightHistoryFromCombatEvents(combatState.events)
    )
  };
}

function runeliteCurrentPvpFightEvents(
  events: readonly RuntimePlayerCombatEvent[]
): readonly RuntimePlayerCombatEvent[] {
  let startIndex = 0;
  events.forEach((event, index) => {
    if (event.kind === "death") {
      startIndex = index + 1;
    }
  });
  return startIndex <= 0 ? events : events.slice(startIndex);
}

function runeliteAccumulatePvpTrackerEvents(
  events: readonly RuntimePlayerCombatEvent[],
  local: RunelitePvpTrackerActorAccumulator,
  opponent: RunelitePvpTrackerActorAccumulator
): void {
  const actorStats = (actorId: RuntimeActorId): RunelitePvpTrackerActorAccumulator =>
    actorId === "local-player" ? local : opponent;

  for (const event of events) {
    if (event.kind === "attack") {
      const stats = actorStats(event.attackerId);
      const defenderStats = actorStats(event.defenderId);
      stats.attacks += 1;
      stats.expectedDamage += event.expectedDamage;
      if (event.defenderProtectionPrayer !== protectPrayerForStyle(event.style)) {
        stats.offPraySuccesses += 1;
      }
      if (runeliteOffensivePrayerMatchesStyle(event.attackerActivePrayers, event.style)) {
        stats.offensivePraySuccesses += 1;
      }
      if (event.style === "magic") {
        stats.magicAttempts += 1;
        stats.magicHitExpected += event.hitChance;
      } else {
        defenderStats.nonMagicAttacksTaken += 1;
        if (runeliteVisibleEquipmentHasRobePiece(event.defenderEquipment)) {
          defenderStats.robeHitsTaken += 1;
        }
      }
      continue;
    }

    if (event.kind === "hitsplat") {
      const stats = actorStats(event.attackerId);
      stats.damageDealt += event.damage;
      if (event.style === "magic" && event.rawDamage > 0) {
        stats.magicHits += 1;
      }

      const koChance = runeliteKoChanceForHitsplat(event);
      if (koChance !== null) {
        stats.koChances += 1;
        stats.koSurvivalProbability *= 1 - koChance;
        stats.lastKoChance = koChance;
      }
      continue;
    }

    if (event.kind === "supply") {
      actorStats(event.actorId).hpHealed += event.healed;
    }
  }
}

function runelitePvpTrackerLines(
  local: RunelitePvpTrackerActorAccumulator,
  opponent: RunelitePvpTrackerActorAccumulator
): readonly RunelitePvpTrackerLineSnapshot[] {
  return [
    runelitePvpTrackerLine("off-pray", "OP", "Off-pray", runeliteRatioText(local.offPraySuccesses, local.attacks), runeliteRatioText(opponent.offPraySuccesses, opponent.attacks), 50, 50, local.offPraySuccesses / Math.max(1, local.attacks), opponent.offPraySuccesses / Math.max(1, opponent.attacks)),
    runelitePvpTrackerLine("expected-damage", "eD", "Expected damage", runeliteExpectedDamageText(local), String(Math.round(opponent.expectedDamage)), 70, 30, local.expectedDamage, opponent.expectedDamage),
    runelitePvpTrackerLine("damage-dealt", "D", "Damage dealt", runeliteDamageText(local), String(opponent.damageDealt), 70, 30, local.damageDealt, opponent.damageDealt),
    runelitePvpTrackerLine("magic-hits", "M", "Magic hits luck", runeliteMagicHitText(local), runeliteMagicHitText(opponent), 70, 30, runeliteMagicLuckScore(local), runeliteMagicLuckScore(opponent)),
    runelitePvpTrackerLine("offensive-pray", "P", "Offensive pray", runeliteRatioText(local.offensivePraySuccesses, local.attacks), runeliteRatioText(opponent.offensivePraySuccesses, opponent.attacks), 80, 20, local.offensivePraySuccesses / Math.max(1, local.attacks), opponent.offensivePraySuccesses / Math.max(1, opponent.attacks)),
    runelitePvpTrackerLine("hp-healed", "HP", "HP healed", String(local.hpHealed), String(opponent.hpHealed), 80, 20, local.hpHealed, opponent.hpHealed),
    runelitePvpTrackerLine("robe-hits", "rH", "Hits on robes", runeliteRobeHitsText(local), runeliteRobeHitsText(opponent), 50, 50, runeliteRobeHitScore(local), runeliteRobeHitScore(opponent), "lower-is-better"),
    runelitePvpTrackerLine("ko-chances", "KO", "KO chances", runeliteKoChanceText(local), runeliteKoChanceText(opponent), 50, 50, runeliteTotalKoChance(local), runeliteTotalKoChance(opponent)),
    runelitePvpTrackerLine("last-ko-chance", "pKO", "Last KO chance", runeliteLastKoChanceText(local), runeliteLastKoChanceText(opponent), 50, 50, local.lastKoChance ?? undefined, opponent.lastKoChance ?? undefined),
    runelitePvpTrackerLine("ghost-barrages", "GB", "Ghost barrages", "0 G.B. (0)", "0 G.B. (0)", 80, 20)
  ];
}

function runelitePvpFightHistoryFromCombatEvents(
  events: readonly RuntimePlayerCombatEvent[]
): readonly RunelitePvpFightHistoryEntrySnapshot[] {
  const entries: RunelitePvpFightHistoryEntrySnapshot[] = [];
  let fightStartIndex = 0;

  events.forEach((event, index) => {
    if (event.kind !== "death") {
      return;
    }

    const fightEvents = events.slice(fightStartIndex, index + 1);
    const local = createRunelitePvpTrackerActorAccumulator();
    const opponent = createRunelitePvpTrackerActorAccumulator();
    runeliteAccumulatePvpTrackerEvents(fightEvents, local, opponent);

    const fightStarted = local.attacks + opponent.attacks + local.damageDealt + opponent.damageDealt > 0;
    if (fightStarted) {
      entries.unshift({
        id: event.id,
        playerName: "local-player",
        opponentName: "opponent",
        worldLabel: "",
        endedAtTick: event.tick,
        playerDead: event.actorId === "local-player",
        opponentDead: event.actorId !== "local-player",
        lines: runelitePvpTrackerLines(local, opponent)
      });
    }

    fightStartIndex = index + 1;
  });

  return entries;
}

const runelitePvpTrackerEquipmentRows = equipmentRowsJson as readonly EquipmentBonusRow[];
const runelitePvpTrackerEquipmentRowsByItemId = equipmentRowsByItemId(runelitePvpTrackerEquipmentRows);

function runeliteOffensivePrayerMatchesStyle(activePrayers: readonly PrayerId[], style: CombatStyle): boolean {
  if (style === "magic") {
    return activePrayers.includes("augury") || activePrayers.includes("mystic_might");
  }
  if (style === "ranged") {
    return activePrayers.includes("rigour") || activePrayers.includes("eagle_eye");
  }
  return activePrayers.includes("piety");
}

function runeliteVisibleEquipmentHasRobePiece(equipment: VisibleEquipment): boolean {
  return runeliteEquipmentSlotLooksLikeRobe(equipment.body?.itemId) || runeliteEquipmentSlotLooksLikeRobe(equipment.legs?.itemId);
}

function runeliteEquipmentSlotLooksLikeRobe(itemId: number | undefined): boolean {
  if (itemId === undefined) {
    return false;
  }
  const row = runelitePvpTrackerEquipmentRowsByItemId.get(itemId);
  return (row?.bonuses.range_defence_bonus ?? 1) <= 0;
}

function runeliteMagicHitText(stats: RunelitePvpTrackerActorAccumulator): string {
  return `${stats.magicHits}/${stats.magicAttempts} (${runelitePercentText(runeliteMagicLuckScore(stats))})`;
}

function runeliteMagicLuckScore(stats: RunelitePvpTrackerActorAccumulator): number {
  return stats.magicHitExpected > 0 ? stats.magicHits / stats.magicHitExpected : 0;
}

function runeliteRobeHitsText(stats: RunelitePvpTrackerActorAccumulator): string {
  return runeliteRatioText(stats.robeHitsTaken, stats.nonMagicAttacksTaken);
}

function runeliteRobeHitScore(stats: RunelitePvpTrackerActorAccumulator): number {
  return stats.nonMagicAttacksTaken > 0 ? stats.robeHitsTaken / stats.nonMagicAttacksTaken : 0;
}

function runeliteKoChanceForHitsplat(event: Extract<RuntimePlayerCombatEvent, { readonly kind: "hitsplat" }>): number | null {
  const maxDamage = runeliteEffectiveMaxDamage(event.maxDamage, event.style, event.defenderProtectionPrayer);
  if (event.previousHitpoints <= 0 || maxDamage < event.previousHitpoints) {
    return null;
  }

  const damagingRolls = maxDamage - event.previousHitpoints + 1;
  return clampRuneliteRatio(event.hitChance * (damagingRolls / (maxDamage + 1)));
}

function runeliteEffectiveMaxDamage(
  maxDamage: number,
  style: CombatStyle,
  defenderProtectionPrayer: ReturnType<typeof protectPrayerForStyle> | undefined
): number {
  return defenderProtectionPrayer === protectPrayerForStyle(style)
    ? Math.trunc(maxDamage * pvpProtectionDamageMultiplier)
    : maxDamage;
}

function runeliteRatioText(count: number, total: number): string {
  return `${count}/${total} (${runelitePercentText(total > 0 ? count / total : 0)})`;
}

function runeliteExpectedDamageText(stats: RunelitePvpTrackerActorAccumulator): string {
  const expected = Math.round(stats.expectedDamage);
  return `${expected} (${signedRuneliteNumber(stats.damageDealt - expected)})`;
}

function runeliteDamageText(stats: RunelitePvpTrackerActorAccumulator): string {
  const expected = Math.round(stats.expectedDamage);
  return `${stats.damageDealt} (${signedRuneliteNumber(stats.damageDealt - expected)})`;
}

function runeliteKoChanceText(stats: RunelitePvpTrackerActorAccumulator): string {
  const chance = runeliteTotalKoChance(stats);
  return `${stats.koChances}${chance > 0 ? ` (${runelitePercentText(chance, 1)})` : ""}`;
}

function runeliteLastKoChanceText(stats: RunelitePvpTrackerActorAccumulator): string {
  return stats.lastKoChance === null ? "-" : runelitePercentText(stats.lastKoChance, 1);
}

function runeliteTotalKoChance(stats: RunelitePvpTrackerActorAccumulator): number {
  return stats.koChances > 0 ? 1 - stats.koSurvivalProbability : 0;
}

function runelitePercentText(ratio: number, decimals = 0): string {
  return `${(clampRuneliteRatio(ratio) * 100).toFixed(decimals)}%`;
}

function signedRuneliteNumber(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function runelitePvpTrackerLine(
  statistic: RunelitePvpTrackerLineSnapshot["statistic"],
  acronym: string,
  label: string,
  left: string,
  right: string,
  leftPercent: number,
  rightPercent: number,
  leftScore?: number,
  rightScore?: number,
  comparison: "higher-is-better" | "lower-is-better" = "higher-is-better"
): RunelitePvpTrackerLineSnapshot {
  return {
    statistic,
    acronym,
    label,
    left,
    right,
    leftPercent,
    rightPercent,
    leftColor: runelitePvpScoreColor(leftScore, rightScore, comparison),
    rightColor: runelitePvpScoreColor(rightScore, leftScore, comparison)
  };
}

function runelitePvpScoreColor(
  score: number | undefined,
  otherScore: number | undefined,
  comparison: "higher-is-better" | "lower-is-better"
): "normal" | "good" | undefined {
  if (score === undefined || otherScore === undefined) {
    return undefined;
  }
  if (comparison === "lower-is-better") {
    return score < otherScore ? "good" : undefined;
  }
  if (score <= otherScore) {
    return undefined;
  }
  return "good";
}

function clampRuneliteRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function formatManualOpponentPolicyAction(action: NhPolicyAction): string {
  const spec = action.specIntent === "none" ? "" : `,${action.specIntent}`;
  return `${action.offenceStyle},${action.defencePrayer},${action.movementIntent},${action.supplyIntent}${spec}`;
}

interface ManualOpponentCombatResponse {
  readonly combatState: RuntimePlayerCombatState;
  readonly opponentActor: ManualActorState;
  readonly policyAction: NhPolicyAction | null;
  readonly policyEffectiveAction: NhPolicyAction | null;
  readonly policyControllerId: string | null;
  readonly policyContext: NhDuelControllerContext | null;
  readonly policyObservedLocalTile: RuntimeTile;
  readonly policyActualLocalTile: RuntimeTile;
  readonly policyObservedLocalLoadoutId: RuntimeLoadoutId;
  readonly policyActualLocalLoadoutId: RuntimeLoadoutId;
  readonly policyObservedLocalPrayers: readonly PrayerId[];
  readonly policyActualLocalPrayers: readonly PrayerId[];
  readonly policyObservedLocalHitpoints: number;
  readonly policyActualLocalHitpoints: number;
  readonly policyObservedLocalFrozen: boolean;
  readonly policyActualLocalFrozen: boolean;
  readonly policyObservedLocalMovedThisTick: boolean;
  readonly policyObservedLocalLastMoveDx: number;
  readonly policyObservedLocalLastMoveDy: number;
  readonly policyObservedSelfMovedThisTick: boolean;
  readonly policyObservedSelfLastMoveDx: number;
  readonly policyObservedSelfLastMoveDy: number;
  readonly policyMovementApplied: boolean;
  readonly policyMovementBlockedReason: string | null;
  readonly policyMovedThisTick: boolean;
  readonly policyLastMoveDx: number;
  readonly policyLastMoveDy: number;
  readonly policyNextRepositionTick: number | null;
  readonly policyStrippedEquipmentSlots: readonly EquipmentSlot[];
  readonly consumedSupplies: readonly ConsumableId[];
}

interface ManualPolicyActorAppearanceView {
  readonly tile: RuntimeTile;
  readonly loadoutId: RuntimeLoadoutId;
  readonly equipment: VisibleEquipment;
  readonly inventoryItems: readonly VisibleEquipmentItem[];
  readonly inventorySlots: readonly (RuntimeInventorySlot | null)[];
  readonly activePrayers: readonly PrayerId[];
  readonly stats: SimStats;
  readonly locks: EntityLockState;
  readonly movedThisTick: boolean;
  readonly lastMoveDx: number;
  readonly lastMoveDy: number;
  readonly observedInfoKnown?: boolean;
}

function formatManualOpponentVisibleStyleEvs(context: NhDuelControllerContext | null): string {
  if (!context) {
    return "";
  }
  return context.visibleStyleEvs.map((entry) => `${entry.style}:${entry.expectedDamage.toFixed(3)}`).join(",");
}

function manualOpponentSelectedVisibleStyleEv(
  context: NhDuelControllerContext | null,
  action: NhPolicyAction | null
): number | null {
  if (!context || !action) {
    return null;
  }
  const style = action.offenceStyle === "melee" ? "slash" : action.offenceStyle;
  return context.visibleStyleEvs.find((entry) => entry.style === style)?.expectedDamage ?? null;
}

function formatRuntimeTileForDataset(tile: RuntimeTile): string {
  return `${tile.x},${tile.z}`;
}

function applyManualOpponentPolicyActorResult(
  actor: ManualActorState,
  result: RuntimePolicyOpponentResult,
  now: number
): ManualActorState {
  const appearance = runtimeAppearanceFromEquipmentItems(
    runtimeItemIdsBySlotFromVisibleEquipment(result.state.actors.opponent.equipment),
    runtimeLoadoutAppearance(result.opponentLoadoutId)
  );
  if (!result.opponentMovedThisTick) {
    return {
      ...actor,
      tile: result.opponentTile,
      loadoutId: result.opponentLoadoutId,
      appearance
    };
  }

  const clientPosition = actor.clientPosition ?? nhClientPositionFromRuntimeTile(actor.renderTile ?? actor.tile);
  return {
    ...actor,
    tile: result.opponentTile,
    loadoutId: result.opponentLoadoutId,
    appearance,
    clientPosition,
    lastMovementClientCycle: Math.floor(now / NH_CLIENT_CYCLE_MS),
    routeWaypoints: enqueueManualActorClientPathSteps(actor.routeWaypoints, [result.opponentTile]),
    routeTraversalModes: enqueueManualActorClientTraversalModes(actor.routeTraversalModes, 1, 1),
    serverRouteWaypoints: [],
    serverRouteTraversalModes: []
  };
}

function manualOpponentBestVisibleStyleEv(context: NhDuelControllerContext | null): number | null {
  if (!context) {
    return null;
  }
  return context.visibleStyleEvs.reduce((best, entry) => Math.max(best, entry.expectedDamage), 0);
}

function nhCameraDirectionFromArrowKey(event: KeyboardEvent): RuneliteKeyRemappingCameraDirection | null {
  if (event.key === "ArrowLeft") {
    return "left";
  }
  if (event.key === "ArrowRight") {
    return "right";
  }
  if (event.key === "ArrowUp") {
    return "up";
  }
  if (event.key === "ArrowDown") {
    return "down";
  }
  return null;
}

function nhKeyboardEventIdentity(event: KeyboardEvent): string {
  return `${event.code}:${event.key}`;
}

function nhWheelEventRotation(event: WheelEvent): number {
  if (!Number.isFinite(event.deltaY) || event.deltaY === 0) {
    return 0;
  }
  return event.deltaY > 0 ? -1 : 1;
}

function writeManualOpponentPolicyDataset(
  viewport: HTMLElement,
  response: ManualOpponentCombatResponse
): void {
  const selectedEv = manualOpponentSelectedVisibleStyleEv(response.policyContext, response.policyAction);
  const bestEv = manualOpponentBestVisibleStyleEv(response.policyContext);
  viewport.dataset.lastManualOpponentControllerId = response.policyControllerId ?? "";
  viewport.dataset.lastManualOpponentPolicyAction = response.policyAction
    ? formatManualOpponentPolicyAction(response.policyAction)
    : "";
  viewport.dataset.lastManualOpponentPolicyEffectiveAction = response.policyEffectiveAction
    ? formatManualOpponentPolicyAction(response.policyEffectiveAction)
    : "";
  viewport.dataset.lastManualOpponentLoadoutId = response.opponentActor.loadoutId;
  viewport.dataset.lastManualOpponentPolicyObservedLocalTile = formatRuntimeTileForDataset(response.policyObservedLocalTile);
  viewport.dataset.lastManualOpponentPolicyActualLocalTile = formatRuntimeTileForDataset(response.policyActualLocalTile);
  viewport.dataset.lastManualOpponentPolicyClientPositionDelayTicks = "1";
  viewport.dataset.lastManualOpponentPolicyObservedLocalLoadoutId = response.policyObservedLocalLoadoutId;
  viewport.dataset.lastManualOpponentPolicyActualLocalLoadoutId = response.policyActualLocalLoadoutId;
  viewport.dataset.lastManualOpponentPolicyClientAppearanceDelayTicks = "1";
  viewport.dataset.lastManualOpponentPolicyObservedLocalPrayers = response.policyObservedLocalPrayers.join(",");
  viewport.dataset.lastManualOpponentPolicyActualLocalPrayers = response.policyActualLocalPrayers.join(",");
  viewport.dataset.lastManualOpponentPolicyClientPrayerDelayTicks = "1";
  viewport.dataset.lastManualOpponentPolicyObservedLocalHitpoints = String(response.policyObservedLocalHitpoints);
  viewport.dataset.lastManualOpponentPolicyActualLocalHitpoints = String(response.policyActualLocalHitpoints);
  viewport.dataset.lastManualOpponentPolicyObservedLocalFrozen = String(response.policyObservedLocalFrozen);
  viewport.dataset.lastManualOpponentPolicyActualLocalFrozen = String(response.policyActualLocalFrozen);
  viewport.dataset.lastManualOpponentPolicyObservedLocalMovedThisTick = String(response.policyObservedLocalMovedThisTick);
  viewport.dataset.lastManualOpponentPolicyObservedLocalLastMoveDx = String(response.policyObservedLocalLastMoveDx);
  viewport.dataset.lastManualOpponentPolicyObservedLocalLastMoveDy = String(response.policyObservedLocalLastMoveDy);
  viewport.dataset.lastManualOpponentPolicyObservedSelfMovedThisTick = String(response.policyObservedSelfMovedThisTick);
  viewport.dataset.lastManualOpponentPolicyObservedSelfLastMoveDx = String(response.policyObservedSelfLastMoveDx);
  viewport.dataset.lastManualOpponentPolicyObservedSelfLastMoveDy = String(response.policyObservedSelfLastMoveDy);
  viewport.dataset.lastManualOpponentPolicyClientVitalsDelayTicks = "1";
  viewport.dataset.lastManualOpponentPolicyMovementApplied = String(response.policyMovementApplied);
  viewport.dataset.lastManualOpponentPolicyMovementBlockedReason = response.policyMovementBlockedReason ?? "";
  viewport.dataset.lastManualOpponentPolicyMovedThisTick = String(response.policyMovedThisTick);
  viewport.dataset.lastManualOpponentPolicyLastMoveDx = String(response.policyLastMoveDx);
  viewport.dataset.lastManualOpponentPolicyLastMoveDy = String(response.policyLastMoveDy);
  viewport.dataset.lastManualOpponentPolicyNextRepositionTick =
    response.policyNextRepositionTick === null ? "" : String(response.policyNextRepositionTick);
  viewport.dataset.lastManualOpponentConsumedSupplies = response.consumedSupplies.join(",");
  viewport.dataset.lastManualOpponentStrippedEquipmentSlots = response.policyStrippedEquipmentSlots.join(",");
  viewport.dataset.lastManualOpponentBestVisibleStyle = response.policyContext?.bestVisibleStyle ?? "";
  viewport.dataset.lastManualOpponentVisibleStyleEvs = formatManualOpponentVisibleStyleEvs(response.policyContext);
  viewport.dataset.lastManualOpponentSelectedStyleEv = selectedEv === null ? "" : selectedEv.toFixed(3);
  viewport.dataset.lastManualOpponentSelectedStyleEvEdge =
    selectedEv === null || bestEv === null ? "" : (selectedEv - bestEv).toFixed(3);
  writeManualOpponentPolicyDebugSnapshot(response);
}

interface RuntimeSceneViewerProps {
  readonly liveTrace?: ClientViewTrace | null;
  readonly policy?: ParsedNhPolicy | null;
  readonly botDifficulty?: "easy" | "medium" | "hard";
  readonly botPolicyLoadState?: "loading" | "loaded" | "error";
  readonly onBotDifficultyChange?: (difficulty: "easy" | "medium" | "hard") => void;
}

export function RuntimeSceneViewer({
  liveTrace,
  policy,
  botDifficulty = "medium",
  botPolicyLoadState = policy ? "loaded" : "loading",
  onBotDifficultyChange
}: RuntimeSceneViewerProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boundaryRef = useRef<RuntimeSceneBoundary | null>(null);
  const cameraKeysRef = useRef<NhCameraKeyState>({ left: false, right: false, up: false, down: false });
  const cameraRemappedKeysRef = useRef(new Map<string, RuneliteKeyRemappingCameraDirection>());
  const mouseCameraDragRef = useRef<RuntimeMouseCameraDragState | null>(null);
  const suppressNextCanvasContextMenuRef = useRef(false);
  const suppressCanvasContextMenuUntilRef = useRef(0);
  const [cycle, setCycle] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [followLive, setFollowLive] = useState(false);
  const [playIntervalMs, setPlayIntervalMs] = useState(650);
  const [cameraMode, setCameraMode] = useState<RuntimeCameraMode>("isometric");
  const [cameraZoom, setCameraZoom] = useState<NhCameraZoom>(NH_CAMERA_DEFAULT_ZOOM);
  const [minimapCameraYaw, setMinimapCameraYaw] = useState(() => initialClientCameraAngles.yaw);
  const minimapCameraYawRef = useRef(minimapCameraYaw);
  const [followTarget, setFollowTarget] = useState<RuntimeFollowTarget>("local-player");
  const [runeliteClientConfig, setRuneliteClientConfig] = useState<RuneliteClientConfigSnapshot>(
    RUNELITE_DEFAULT_CLIENT_CONFIG_SNAPSHOT
  );
  const runeliteClientConfigRef = useRef(runeliteClientConfig);
  const [gameKeybinds, setGameKeybinds] = useState<NhGameKeybindSnapshot>(() => nhReadGameKeybindsFromStorage());
  const gameKeybindsRef = useRef<NhGameKeybindSnapshot>(gameKeybinds);
  const [gameKeybindInterfaceOpen, setGameKeybindInterfaceOpen] = useState(false);
  const [gameKeybindSelectedTabId, setGameKeybindSelectedTabId] = useState<NhFixedSideTabId>("combat");
  const [nhSocialLists, setNhSocialLists] = useState<NhSocialListsSnapshot>(NH_DEV_SOCIAL_LISTS);
  const [nhClanChat, setNhClanChat] = useState<NhClanChatSnapshot>(NH_DEV_CLAN_CHAT);
  const [xpDropCounterShown, setXpDropCounterShown] = useState(true);
  const xpDropCounterShownRef = useRef(true);
  const [equipmentUtilityPanelMode, setEquipmentUtilityPanelMode] = useState<NhEquipmentUtilityPanelMode | null>(null);
  const [runelitePvpToolsRenderSelf, setRunelitePvpToolsRenderSelf] = useState(true);
  const [manualControl, setManualControl] = useState(true);
  const [manualActor, setManualActor] = useState<ManualActorState>(initialManualActor);
  const [manualOpponent, setManualOpponent] = useState<ManualActorState>(initialManualOpponent);
  const [manualCombatState, setManualCombatState] = useState<RuntimePlayerCombatState>(initialRuntimePlayerCombatState);
  const [manualFightStartPending, setManualFightStartPending] = useState(true);
  const manualFightStartPendingRef = useRef(true);
  const manualControlRef = useRef(manualControl);
  const manualActorRef = useRef(initialManualActor);
  const manualOpponentRef = useRef(initialManualOpponent);
  const initialManualActorSpawnRef = useRef(initialManualActor);
  const initialManualOpponentSpawnRef = useRef(initialManualOpponent);
  const manualCombatStateRef = useRef(initialRuntimePlayerCombatState);
  const manualOpponentFightEngagedRef = useRef(false);
  const manualOpponentTargetTrackingRef = useRef<RuntimePolicyTargetTrackingState>(
    emptyRuntimePolicyTargetTrackingState
  );
  const manualOpponentPolicyEpisodeIdRef = useRef(0);
  const manualOpponentPolicyEpisodeStartTickRef = useRef(0);
  const manualOpponentNextPolicyRepositionTickRef = useRef(0);
  const manualOpponentPolicyController = useMemo<NhPolicyRuntimeController | null>(
    () => (policy ? createNhPolicyController(policy) : null),
    [policy]
  );
  const manualOpponentObservedLocalAppearanceRef = useRef<ManualPolicyActorAppearanceView>({
    tile: initialManualActor.tile,
    loadoutId: initialManualActor.loadoutId,
    equipment: RUNTIME_NH_STAKE_VISIBLE_EQUIPMENT,
    inventoryItems: RUNTIME_NH_STAKE_VISIBLE_INVENTORY_ITEMS,
    inventorySlots: RUNTIME_NH_STAKE_INVENTORY_SLOTS,
    activePrayers: initialRuntimePlayerCombatState.actors["local-player"].activePrayers,
    stats: runtimePolicyVisibleStatsFromCombatActor(initialRuntimePlayerCombatState.actors["local-player"]),
    locks: runtimePolicyVisibleLocksFromCombatActor(
      initialRuntimePlayerCombatState.actors["local-player"],
      initialRuntimePlayerCombatState.tick
    ),
    movedThisTick: false,
    lastMoveDx: 0,
    lastMoveDy: 0,
    observedInfoKnown: true
  });
  const manualOpponentObservedSelfMovementRef = useRef<ManualPolicyActorMovementView>(
    manualPolicyStationaryMovementView
  );
  const runtimeTickOriginMsRef = useRef(performance.now());
  const itemActionQueueRef = useRef(createItemActionQueue());
  const queuedPlayerCombatPacketsRef = useRef<QueuedPlayerCombatPacket[]>([]);
  const itemActionProcessingTimerRef = useRef<number | null>(null);
  const supplyDelaysRef = useRef<SupplyDelayState>(createSupplyDelayState());
  const hudPrayersRef = useRef<NhPrayerStates | undefined>(undefined);
  const hudCombatLevelsRef = useRef<CombatLevels>(runtimePlayerCombatDefaultLevels);
  const [pendingEquipSlotIndices, setPendingEquipSlotIndices] = useState<ReadonlySet<number>>(() => new Set());
  const [pendingEquipmentRemoveSlotIds, setPendingEquipmentRemoveSlotIds] = useState<ReadonlySet<string>>(() => new Set());
  const [minimapDestinationTile, setMinimapDestinationTile] = useState<RuntimeTile | null>(null);
  const minimapDestinationTileRef = useRef<RuntimeTile | null>(null);
  const hoveredSceneTileRef = useRef<RuntimeTile | null>(null);
  const [runtimeReplays, setRuntimeReplays] = useState<readonly RuntimeReplay[]>([]);
  const [selectedReplayId, setSelectedReplayId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<RuntimeLoadState>({
    kind: "loading",
    message: "Loading exported arena and loadout GLBs."
  });
  const [models, setModels] = useState<ReadonlyMap<string, RuntimeActorModelAsset>>(new Map());
  const [effectModels, setEffectModels] = useState<ReadonlyMap<string, RuntimeEffectAsset>>(new Map());
  const [playerModelSources, setPlayerModelSources] = useState<NhPlayerModelSources | null>(null);
  const [animationFixtures, setAnimationFixtures] = useState<NhAnimationFixtures | null>(null);
  const [actorSequenceDefinitions, setActorSequenceDefinitions] = useState<NhActorSequenceDefinitionStore>(
    () => createNhActorSequenceDefinitionStore(null)
  );
  const [projectileDefinitions, setProjectileDefinitions] = useState<NhProjectileDefinitionMap>(
    new Map()
  );
  const [spotanimDefinitions, setSpotanimDefinitions] = useState<ReadonlyMap<number, NhSpotanimDefinition>>(
    new Map()
  );
  const projectileDefinitionsRef = useRef<NhProjectileDefinitionMap>(new Map());
  const spotanimDefinitionsRef = useRef<ReadonlyMap<number, NhSpotanimDefinition>>(new Map());
  const [spriteAtlases, setSpriteAtlases] = useState<ReadonlyMap<RuntimeSpriteSheetId, RuntimeSpriteAtlas>>(
    new Map()
  );
  const clientFontsRef = useRef<NhClientFontStore>(new Map());
  const [collisionMap, setCollisionMap] = useState<NhSceneCollision | null>(null);
  const collisionMapRef = useRef<NhSceneCollision | null>(null);
  const [fixedClientLayout, setFixedClientLayout] = useState<NhFixedClientLayout | null>(null);
  const [fixedClientCssLayout, setFixedClientCssLayout] = useState<NhFixedClientCssLayout | null>(null);
  const [activeSideTabId, setActiveSideTabId] = useState<NhFixedSideTabId>("inventory");
  const [activeSpellbookId, setActiveSpellbookId] = useState<NhSpellbookId>("ancient");
  const [minimapSceneSprite, setMinimapSceneSprite] = useState<NhMinimapSceneSprite | null>(null);
  const [sceneObjectPlacements, setSceneObjectPlacements] = useState<readonly NhArenaObjectPlacement[]>([]);
  const [inventoryItemDefinitions, setInventoryItemDefinitions] = useState<NhInventoryItemDefinitionStore>(
    new Map()
  );
  const [inventoryEquipmentDefinitions, setInventoryEquipmentDefinitions] = useState<NhInventoryEquipmentDefinitionStore>(
    new Map()
  );
  const [weaponTypeDefinitions, setWeaponTypeDefinitions] = useState<NhWeaponTypeDefinitionStore>(new Map());
  const playerModelSourcesRef = useRef<NhPlayerModelSources | null>(playerModelSources);
  const modelsRef = useRef<ReadonlyMap<string, RuntimeActorModelAsset>>(models);
  const animationFixturesRef = useRef<NhAnimationFixtures | null>(animationFixtures);
  const actorSequenceDefinitionsRef = useRef<NhActorSequenceDefinitionStore>(actorSequenceDefinitions);
  const inventoryItemDefinitionsRef = useRef<NhInventoryItemDefinitionStore>(inventoryItemDefinitions);
  const inventoryEquipmentDefinitionsRef = useRef<NhInventoryEquipmentDefinitionStore>(inventoryEquipmentDefinitions);
  const weaponTypeDefinitionsRef = useRef<NhWeaponTypeDefinitionStore>(weaponTypeDefinitions);
  const [hitsplatDefinitions, setHitsplatDefinitions] = useState<NhHitsplatDefinitionStore>(
    defaultNhHitsplatDefinitions
  );
  const [healthBarDefinitions, setHealthBarDefinitions] = useState<NhHealthBarDefinitionStore>(
    defaultNhHealthBarDefinitions
  );
  const [overheadIconDefinitions, setOverheadIconDefinitions] = useState<NhOverheadIconDefinitionStore>(
    defaultNhOverheadIconDefinitions
  );
  const [clientFonts, setClientFonts] = useState<NhClientFontStore>(new Map());
  const [clickCross, setClickCross] = useState<NhClickCrossState | null>(null);
  const [contextMenu, setContextMenu] = useState<NhContextMenuState | null>(null);
  const [opponentInventoryInspectOpen, setOpponentInventoryInspectOpen] = useState(false);
  const [runeliteOverlayLocations, setRuneliteOverlayLocations] = useState<RuneliteOverlayPreferredLocations>(() =>
    readRuneliteOverlayPreferredLocations()
  );
  const [runeliteMouseHighlightTooltip, setRuneliteMouseHighlightTooltip] =
    useState<RuneliteMouseHighlightTooltipSnapshot | null>(null);
  const [inventoryOverride, setInventoryOverride] = useState<readonly (RuntimeInventorySlot | null)[] | null>(
    () => [...RUNTIME_NH_STAKE_INVENTORY_SLOTS]
  );
  const [groundItems, setGroundItems] = useState<readonly RuntimeGroundItem[]>([]);
  const [equipmentOverride, setEquipmentOverride] = useState<RuntimeEquipmentItemIdsBySlot | null>(
    () => new Map(RUNTIME_NH_STAKE_EQUIPMENT_ITEMS)
  );
  const [hudOverride, setHudOverride] = useState<Partial<RuntimeHudState> | null>(() => initialHudOverrideFromStorage());
  const [localFreezeBypass, setLocalFreezeBypass] = useState(false);
  const [temporarySetupStatus, setTemporarySetupStatus] = useState("");
  const [storedPvpFightHistory, setStoredPvpFightHistory] = useState<readonly RunelitePvpFightHistoryEntrySnapshot[]>(
    () => readStoredRunelitePvpFightHistory()
  );
  const [prayerReorderingEnabled, setPrayerReorderingEnabled] = useState(() =>
    readStoredBoolean(NH_TRAINER_PRAYER_REORDER_ENABLED_STORAGE_KEY)
  );
  const [prayerOrder, setPrayerOrder] = useState<readonly string[]>(() =>
    readStoredStringArray(NH_TRAINER_PRAYER_REORDER_ORDER_STORAGE_KEY)
  );
  const [spellbookReorderingEnabled, setSpellbookReorderingEnabled] = useState(() =>
    readStoredBoolean(NH_TRAINER_SPELLBOOK_REORDER_ENABLED_STORAGE_KEY)
  );
  const [spellbookOrders, setSpellbookOrders] = useState<Partial<Record<NhSpellbookId, readonly string[]>>>(() =>
    readStoredSpellbookOrders()
  );
  const inventoryOverrideRef = useRef<readonly (RuntimeInventorySlot | null)[] | null>(inventoryOverride);
  const groundItemsRef = useRef<readonly RuntimeGroundItem[]>(groundItems);
  const groundItemSequenceRef = useRef(1);
  const pendingGroundItemPickupRef = useRef<PendingGroundItemPickup | null>(null);
  const equipmentOverrideRef = useRef<RuntimeEquipmentItemIdsBySlot | null>(equipmentOverride);
  const localFreezeBypassRef = useRef(localFreezeBypass);
  const temporarySavedSetupLoadedRef = useRef(false);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<NhInventorySelectedItem | null>(null);
  const [selectedSpell, setSelectedSpell] = useState<NhSelectedSpell | null>(null);
  const clickCrossDefinitions = useMemo(
    () => createNhClickCrossDefinitionStore(spriteAtlases.get("click_cross")?.metadata),
    [spriteAtlases]
  );
  const contextMenuFont = nhClientFontDefinition(clientFonts, NH_CONTEXT_MENU_FONT_KEY);
  const contextMenuFontAtlas = spriteAtlases.get("context_menu_font");
  const liveReplay = useMemo(() => {
    if (!liveTrace || liveTrace.ticks.length === 0) {
      return null;
    }
    assertValidClientViewTrace(liveTrace);
    return clientViewTraceToRuntimeReplay(liveTrace, {
      projectileDefinitions,
      spotanimDefinitions,
      hitsplatDefinitions,
      healthBarDefinitions,
      overheadIconDefinitions,
      actorSequenceDefinitions
    });
  }, [
    actorSequenceDefinitions,
    healthBarDefinitions,
    hitsplatDefinitions,
    liveTrace,
    overheadIconDefinitions,
    projectileDefinitions,
    spotanimDefinitions
  ]);
  const availableReplays = useMemo(
    () => (liveReplay ? [liveReplay, ...runtimeReplays.filter((replay) => replay.id !== liveReplay.id)] : runtimeReplays),
    [liveReplay, runtimeReplays]
  );
  const runtimeReplay = useMemo(
    () => availableReplays.find((replay) => replay.id === selectedReplayId) ?? availableReplays[0] ?? null,
    [availableReplays, selectedReplayId]
  );
  const maxCycle = runtimeReplay?.lastCycle ?? runtimeTimeline[runtimeTimeline.length - 1].cycle;
  const snapshot = useMemo(
    () => (runtimeReplay ? sampleRuntimeReplayScene(runtimeReplay, cycle) : sampleRuntimeScene(cycle)),
    [cycle, runtimeReplay]
  );
  const activeEvents = useMemo(
    () => (runtimeReplay ? sampleRuntimeReplayEvents(runtimeReplay, cycle) : sampleRuntimeRenderEvents(cycle)),
    [cycle, runtimeReplay]
  );
  const baseVisibleSnapshot = useMemo(
    () =>
      manualControl
        ? snapshotWithManualCombatActors(
          snapshot,
          manualActor,
          manualOpponent,
          manualCombatState,
          inventoryEquipmentDefinitions,
          weaponTypeDefinitions,
          actorSequenceDefinitions,
          animationFixtures
        )
        : snapshot,
    [
      actorSequenceDefinitions,
      animationFixtures,
      inventoryEquipmentDefinitions,
      manualActor,
      manualCombatState,
      manualControl,
      manualOpponent,
      snapshot,
      weaponTypeDefinitions
    ]
  );
  const visibleSnapshot = useMemo(() => {
    const committedEquipmentOverride = equipmentOverride ?? equipmentOverrideRef.current;
    const equipmentSnapshot = committedEquipmentOverride
      ? snapshotWithLocalPlayerEquipmentItems(baseVisibleSnapshot, committedEquipmentOverride)
      : baseVisibleSnapshot;
    const inventorySnapshot = inventoryOverride
      ? { ...equipmentSnapshot, inventory: inventoryOverride }
      : equipmentSnapshot;
    if (!hudOverride) {
      return inventorySnapshot;
    }
    const hud = {
      ...inventorySnapshot.hud,
      ...hudOverride
    };
    return {
      ...inventorySnapshot,
      hud: manualControl
        ? runtimeManualCombatAuthoritativeHud(hud, inventorySnapshot.hud)
        : hud
    };
  }, [baseVisibleSnapshot, equipmentOverride, hudOverride, inventoryOverride, manualControl]);
  const visibleSnapshotRef = useRef(visibleSnapshot);
  const runtimeInteractionSnapshotRef = useRef(visibleSnapshot);
  const visibleActiveEventsRef = useRef<readonly RuntimeRenderEvent[]>([]);
  const spriteAtlasesRef = useRef<ReadonlyMap<RuntimeSpriteSheetId, RuntimeSpriteAtlas>>(new Map());
  const runelitePvpToolsRenderSelfRef = useRef(runelitePvpToolsRenderSelf);
  const runtimeDomOverlaySignatureRef = useRef("");
  const runtimeDomOverlayElementsRef = useRef(new Map<string, HTMLElement>());
  const [runtimeDomOverlays, setRuntimeDomOverlays] = useState<readonly RuntimeDomOverlay[]>([]);
  const runeliteFreezeTimerDomOverlaySignatureRef = useRef("");
  const runeliteFreezeTimerOverlayElementsRef = useRef(new Map<string, HTMLElement>());
  const [runeliteFreezeTimerOverlays, setRuneliteFreezeTimerOverlays] = useState<readonly RuneliteFreezeTimerDomOverlay[]>([]);
  const runeliteFreezeTimerInfoBoxSignatureRef = useRef("");
  const [runeliteFreezeTimerInfoBoxOverlay, setRuneliteFreezeTimerInfoBoxOverlay] = useState<RuneliteFreezeTimerInfoBoxDomOverlay | null>(null);
  const runelitePlayerIndicatorDomOverlaySignatureRef = useRef("");
  const runelitePlayerIndicatorOverlayElementsRef = useRef(new Map<string, HTMLElement>());
  const [runelitePlayerIndicatorOverlays, setRunelitePlayerIndicatorOverlays] = useState<readonly RunelitePlayerIndicatorDomOverlay[]>([]);
  const runelitePrayAgainstPlayerDomOverlaySignatureRef = useRef("");
  const runelitePrayAgainstPlayerOverlayElementsRef = useRef(new Map<string, HTMLElement>());
  const [runelitePrayAgainstPlayerOverlays, setRunelitePrayAgainstPlayerOverlays] = useState<readonly RunelitePrayAgainstPlayerDomOverlay[]>([]);
  const runeliteTileIndicatorDomOverlaySignatureRef = useRef("");
  const [runeliteTileIndicatorOverlays, setRuneliteTileIndicatorOverlays] = useState<readonly RuneliteTileIndicatorDomOverlay[]>([]);
  const runelitePrayerBarDomOverlaySignatureRef = useRef("");
  const runelitePrayerBarOverlayElementsRef = useRef(new Map<string, HTMLElement>());
  const [runelitePrayerBarOverlay, setRunelitePrayerBarOverlay] = useState<RunelitePrayerBarDomOverlay | null>(null);
  const runelitePrayerFlickOrbDomOverlaySignatureRef = useRef("");
  const [runelitePrayerFlickOrbOverlay, setRunelitePrayerFlickOrbOverlay] = useState<RunelitePrayerFlickOrbDomOverlay | null>(null);
  const runeliteAttackStylesDomOverlaySignatureRef = useRef("");
  const [runeliteAttackStylesOverlay, setRuneliteAttackStylesOverlay] = useState<RuneliteAttackStylesDomOverlay | null>(null);
  const runeliteXpDropDamageDomOverlaySignatureRef = useRef("");
  const runeliteXpDropDamageOverlayElementsRef = useRef(new Map<string, HTMLElement>());
  const [runeliteXpDropDamageOverlay, setRuneliteXpDropDamageOverlay] = useState<RuneliteXpDropDamageDomOverlay | null>(null);
  const runeliteXpDropDomOverlaySignatureRef = useRef("");
  const runeliteXpDropActiveDropletsRef = useRef(new Map<string, RuneliteXpDropActiveDroplet>());
  const runeliteXpDropEmittedQueuedHitIdsRef = useRef(new Set<string>());
  const runeliteXpDropLastStartClientCycleRef = useRef(0);
  const runeliteXpDropOverlayElementsRef = useRef(new Map<string, HTMLElement>());
  const [runeliteXpDropOverlays, setRuneliteXpDropOverlays] = useState<readonly RuneliteXpDropDomOverlay[]>([]);
  const runeliteBoostsOverlay = useMemo(
    () => runeliteBoostsOverlaySnapshot(visibleSnapshot.hud, runeliteClientConfig.boosts),
    [runeliteClientConfig.boosts, visibleSnapshot.hud]
  );
  const runeliteBoostsInfoBoxOverlay = useMemo(
    () => runeliteBoostsInfoBoxSnapshot(visibleSnapshot.hud, runeliteClientConfig.boosts, runeliteClientConfig.infoBox),
    [runeliteClientConfig.boosts, runeliteClientConfig.infoBox, visibleSnapshot.hud]
  );
  const runeliteStatusBars = useMemo(
    () => runeliteStatusBarSnapshots(fixedClientLayout, fixedClientCssLayout, visibleSnapshot.hud, runeliteClientConfig.statusBars),
    [fixedClientCssLayout, fixedClientLayout, runeliteClientConfig.statusBars, visibleSnapshot.hud]
  );
  const runeliteStatusOrbs = useMemo(
    () =>
      runeliteStatusOrbSnapshots(
        fixedClientLayout,
        fixedClientCssLayout,
        visibleSnapshot.hud,
        runeliteClientConfig.statusOrbs,
        manualCombatState.tick || visibleSnapshot.cycle
      ),
    [fixedClientCssLayout, fixedClientLayout, manualCombatState.tick, runeliteClientConfig.statusOrbs, visibleSnapshot.cycle, visibleSnapshot.hud]
  );
  const runeliteRunOrbText = useMemo(
    () => runeliteStatusOrbsRunOrbText(visibleSnapshot.hud, runeliteClientConfig.statusOrbs),
    [runeliteClientConfig.statusOrbs, visibleSnapshot.hud]
  );
  const runeliteOpponentInfo = useMemo(
    () => runeliteOpponentInfoSnapshot(manualCombatState, runeliteClientConfig.opponentInfo),
    [manualCombatState, runeliteClientConfig.opponentInfo]
  );
  const runeliteOpponentComparison = useMemo(
    () => runeliteOpponentComparisonSnapshot(manualCombatState, runeliteClientConfig.opponentInfo),
    [manualCombatState, runeliteClientConfig.opponentInfo]
  );
  const snapshotSelectedInventoryItem = visibleSnapshot.selectedInventoryItem;
  const sourceClickCross = useMemo((): NhClickCrossState | null => {
    if (!visibleSnapshot.clickCross || !fixedClientCssLayout) {
      return null;
    }
    return {
      x: fixedClientCssLayout.surfaceRect.x + visibleSnapshot.clickCross.x * fixedClientCssLayout.scale,
      y: fixedClientCssLayout.surfaceRect.y + visibleSnapshot.clickCross.y * fixedClientCssLayout.scale,
      color: visibleSnapshot.clickCross.color,
      frame: visibleSnapshot.clickCross.frame,
      sourceState: visibleSnapshot.clickCross.state
    };
  }, [fixedClientCssLayout, visibleSnapshot.clickCross]);
  const sourceContextMenu = useMemo((): NhContextMenuState | null => {
    if (!visibleSnapshot.contextMenu || !fixedClientCssLayout) {
      return null;
    }
    const surface = fixedClientCssLayout.surfaceRect;
    const scale = fixedClientCssLayout.scale;
    return {
      x: surface.x + (visibleSnapshot.contextMenu.x + visibleSnapshot.contextMenu.width / 2) * scale,
      y: surface.y + visibleSnapshot.contextMenu.y * scale,
      source: "client-view",
      sourceRect: {
        x: visibleSnapshot.contextMenu.x,
        y: visibleSnapshot.contextMenu.y,
        width: visibleSnapshot.contextMenu.width,
        height: visibleSnapshot.contextMenu.height
      },
      entries: visibleSnapshot.contextMenu.entries.map((entry, index) => ({
        action: "source-menu-entry",
        sourceIndex: index,
        actionText: entry.actionText,
        targetText: entry.targetText,
        opcode: entry.opcode,
        identifier: entry.identifier,
        argument1: entry.argument1,
        argument2: entry.argument2,
        shiftClick: entry.shiftClick
      }))
    };
  }, [fixedClientCssLayout, visibleSnapshot.contextMenu]);
  const visibleClickCross = clickCross ?? sourceClickCross;
  const clickCrossSource = visibleClickCross
    ? nhClickCrossDefinition(clickCrossDefinitions, visibleClickCross.color, visibleClickCross.frame)
    : null;
  const clickCrossSpriteSource = clickCrossSource
    ? spriteAtlases.get("click_cross")?.sprites.get(clickCrossSource.spriteId)
    : undefined;
  const visibleContextMenu = contextMenu ?? sourceContextMenu;
  const visibleMinimapCameraYaw = visibleSnapshot.camera?.yaw ?? minimapCameraYaw;
  const manualCombatRenderEvents = useMemo(
    () =>
      runtimePlayerCombatRenderEvents(
        manualCombatState,
        hitsplatDefinitions,
        healthBarDefinitions,
        overheadIconDefinitions
      ),
    [healthBarDefinitions, hitsplatDefinitions, manualCombatState, overheadIconDefinitions]
  );
  const baseVisibleActiveEvents = useMemo(
    () => (manualControl ? manualCombatRenderEvents : activeEvents),
    [activeEvents, manualCombatRenderEvents, manualControl]
  );
  const visibleActiveEvents = useMemo(
    () => runeliteEntityHiderFilterRuntimeEvents(baseVisibleActiveEvents, visibleSnapshot, runeliteClientConfig.entityHider),
    [baseVisibleActiveEvents, runeliteClientConfig.entityHider, visibleSnapshot]
  );
  const completedPvpFightHistoryFromEvents = useMemo(
    () => runelitePvpFightHistoryFromCombatEvents(manualCombatState.events),
    [manualCombatState.events]
  );
  const runelitePvpTrackerSnapshot = useMemo(
    () => runelitePvpTrackerSnapshotFromCombatState(manualCombatState, manualControl, storedPvpFightHistory),
    [manualCombatState, manualControl, storedPvpFightHistory]
  );
  const runeliteSuppliesTrackerSnapshot = useMemo(
    () => runeliteSuppliesTrackerSnapshotFromCombatState(manualCombatState, spriteAtlases),
    [manualCombatState, spriteAtlases]
  );
  const runelitePvpToolsSnapshot = useMemo(
    () => runelitePvpToolsSnapshotFromCombatState(manualCombatState, visibleSnapshot, spriteAtlases),
    [manualCombatState, spriteAtlases, visibleSnapshot]
  );
  const ensureRuntimeActorModelsForSnapshot = (renderSnapshot: RuntimeSceneSnapshot): ReadonlyMap<string, RuntimeActorModelAsset> => {
    const playerSources = playerModelSourcesRef.current;
    const animations = animationFixturesRef.current;
    let currentModels = modelsRef.current;
    if (!playerSources || !animations) {
      return currentModels;
    }

    let nextModels: Map<string, RuntimeActorModelAsset> | null = null;
    for (const pose of renderSnapshot.actors) {
      const modelKey = runtimeActorModelKey(pose, animations);
      if (currentModels.has(modelKey) || nextModels?.has(modelKey)) {
        continue;
      }

      if (!nextModels) {
        nextModels = new Map(currentModels);
      }
      nextModels.set(modelKey, composeNhPlayerModel(playerSources, runtimeActorModelInput(pose, animations)));
    }

    if (!nextModels) {
      return currentModels;
    }

    currentModels = nextModels;
    modelsRef.current = currentModels;
    setModels(currentModels);
    return currentModels;
  };
  const todoGates = useMemo(() => getRuntimeSceneTodoGates(), []);
  const actorPlayerContextEntries = (
    actor: RuntimeActorPose,
    walkTile: RuntimeTile
  ): readonly NhContextMenuEntry[] => {
    const playerEntries = filterRunelitePvpToolsPlayerContextEntries(
      buildNhActorContextEntries(actor, walkTile, selectedInventoryItem, selectedSpell),
      actor,
      runeliteClientConfig.pvpTools
    );
    return withOpponentInventoryInspectContextEntry(
      actor,
      applyRuneliteOpponentInfoMenuEntries({
        entries: playerEntries,
        targetActorId: actor.actorId,
        combatState: manualCombatState,
        config: runeliteClientConfig.opponentInfo
      }),
      selectedInventoryItem,
      selectedSpell
    );
  };

  const groundItemContextEntries = (tile: RuntimeTile): readonly NhGroundItemContextMenuEntry[] => {
    if (selectedInventoryItem || selectedSpell) {
      return [];
    }
    const items = groundItemsRef.current.filter((item) => sameNhTile(item.tile, tile));
    return items.flatMap((item) => [
      {
        action: "ground-item-examine" as const,
        actionText: "Examine",
        targetText: `<col=ff9040>${item.itemName}`,
        opcode: 1004,
        identifier: item.itemId,
        argument1: Math.trunc(item.tile.x),
        argument2: Math.trunc(item.tile.z),
        groundItemId: item.id,
        itemId: item.itemId,
        itemName: item.itemName,
        quantity: item.quantity,
        targetTile: item.tile
      },
      {
        action: "ground-item-take" as const,
        actionText: "Take",
        targetText: `<col=ff9040>${item.itemName}`,
        opcode: 18,
        identifier: item.itemId,
        argument1: Math.trunc(item.tile.x),
        argument2: Math.trunc(item.tile.z),
        groundItemId: item.id,
        itemId: item.itemId,
        itemName: item.itemName,
        quantity: item.quantity,
        targetTile: item.tile
      }
    ]);
  };

  const sceneContextEntries = (tile: RuntimeTile): readonly NhContextMenuEntry[] => {
    const interactionSnapshot = runtimeInteractionSnapshotRef.current;
    const actor = actorAtRuntimeTile(interactionSnapshot, tile);
    if (actor && actor.actorId !== "local-player") {
      return actorPlayerContextEntries(actor, tile);
    }

    const worldTile = collisionMap?.sceneToWorldTile(tile);
    const object = worldTile ? findNhSceneObjectForWorldTile(sceneObjectPlacements, worldTile) : null;
    if (object) {
      return buildNhSceneObjectContextEntries({
        placement: object,
        walkTile: tile,
        actionTile: collisionMap?.worldToSceneTile({ x: object.x, y: object.y, plane: object.plane }) ?? tile,
        selectedItem: selectedInventoryItem,
        selectedSpell
      });
    }

    return [
      ...buildNhContextEntries(interactionSnapshot, tile, selectedInventoryItem, selectedSpell),
      ...groundItemContextEntries(tile)
    ];
  };
  const sceneObjectContextEntries = (pick: RuntimeSceneObjectPick): readonly NhSceneContextMenuEntry[] =>
    buildNhSceneObjectContextEntries({
      placement: pick.placement,
      walkTile: pick.walkTile,
      actionTile: pick.actionTile,
      selectedItem: selectedInventoryItem,
      selectedSpell
    });
  const actorContextEntries = (
    actor: RuntimeActorPose,
    walkTile: RuntimeTile = actor.tile
  ): readonly NhContextMenuEntry[] =>
    actor.actorId === "local-player"
      ? [{ actionText: "Walk here", targetText: "", opcode: 23, action: "walk", targetTile: walkTile }]
      : actorPlayerContextEntries(actor, walkTile);

  useEffect(() => {
    setSelectedInventoryItem(
      snapshotSelectedInventoryItem
        ? {
          itemId: snapshotSelectedInventoryItem.itemId,
          itemName: snapshotSelectedInventoryItem.itemName,
          slotIndex: snapshotSelectedInventoryItem.slotIndex,
          widgetId: snapshotSelectedInventoryItem.widgetId
        }
        : null
    );
  }, [
    runtimeReplay?.id,
    snapshotSelectedInventoryItem?.itemId,
    snapshotSelectedInventoryItem?.itemName,
    snapshotSelectedInventoryItem?.slotIndex,
    snapshotSelectedInventoryItem?.widgetId
  ]);

  useEffect(() => {
    manualControlRef.current = manualControl;
  }, [manualControl]);

  useEffect(() => {
    manualFightStartPendingRef.current = manualFightStartPending;
  }, [manualFightStartPending]);

  useEffect(() => {
    visibleSnapshotRef.current = visibleSnapshot;
    runtimeInteractionSnapshotRef.current = visibleSnapshot;
  }, [visibleSnapshot]);

  useEffect(() => {
    groundItemsRef.current = groundItems;
  }, [groundItems]);

  useEffect(() => {
    const boundary = boundaryRef.current;
    if (!boundary) {
      return;
    }
    syncRuntimeGroundItemModels(boundary, groundItems, playerModelSources, collisionMap);
  }, [collisionMap, groundItems, playerModelSources]);

  useEffect(() => {
    writeStoredBoolean(NH_TRAINER_PRAYER_REORDER_ENABLED_STORAGE_KEY, prayerReorderingEnabled);
  }, [prayerReorderingEnabled]);

  useEffect(() => {
    writeStoredStringArray(NH_TRAINER_PRAYER_REORDER_ORDER_STORAGE_KEY, prayerOrder);
  }, [prayerOrder]);

  useEffect(() => {
    writeStoredBoolean(NH_TRAINER_SPELLBOOK_REORDER_ENABLED_STORAGE_KEY, spellbookReorderingEnabled);
  }, [spellbookReorderingEnabled]);

  useEffect(() => {
    writeStoredSpellbookOrders(spellbookOrders);
  }, [spellbookOrders]);

  useEffect(() => {
    minimapDestinationTileRef.current = minimapDestinationTile;
  }, [minimapDestinationTile]);

  useEffect(() => {
    collisionMapRef.current = collisionMap;
  }, [collisionMap]);

  useEffect(() => {
    if (!collisionMap) {
      return;
    }

    const snappedLocalSpawn = snapManualActorToCollision(initialManualActor, collisionMap);
    const snappedOpponentSpawn = snapManualActorToCollision(initialManualOpponent, collisionMap);
    initialManualActorSpawnRef.current = snappedLocalSpawn;
    initialManualOpponentSpawnRef.current = snappedOpponentSpawn;

    const currentLocal = manualActorRef.current;
    const currentOpponent = manualOpponentRef.current;
    const canSnapVisibleSpawn =
      sameNhTile(currentLocal.tile, initialManualActor.tile) &&
      sameNhTile(currentOpponent.tile, initialManualOpponent.tile) &&
      !manualActorHasPendingMovement(currentLocal) &&
      !manualActorHasPendingMovement(currentOpponent);

    if (!canSnapVisibleSpawn) {
      return;
    }

    const nextLocal = snapManualActorToCollision(currentLocal, collisionMap);
    const nextOpponent = snapManualActorToCollision(currentOpponent, collisionMap);
    if (sameNhTile(nextLocal.tile, currentLocal.tile) && sameNhTile(nextOpponent.tile, currentOpponent.tile)) {
      return;
    }

    const nextCombatState = syncRuntimePlayerCombatStateToInput(manualCombatStateRef.current, {
      tiles: {
        "local-player": nextLocal.tile,
        opponent: nextOpponent.tile
      },
      clientCycle: Math.floor(performance.now() / NH_CLIENT_CYCLE_MS)
    });
    manualActorRef.current = nextLocal;
    manualOpponentRef.current = nextOpponent;
    manualCombatStateRef.current = nextCombatState;
    manualOpponentObservedLocalAppearanceRef.current = {
      ...manualOpponentObservedLocalAppearanceRef.current,
      tile: nextLocal.tile
    };

    unstable_batchedUpdates(() => {
      setManualActor(nextLocal);
      setManualOpponent(nextOpponent);
      setManualCombatState(nextCombatState);
    });

    const viewport = canvasRef.current?.closest(".runtimeViewport") as HTMLElement | null;
    if (viewport) {
      viewport.dataset.initialSpawnSnappedToCollision = "true";
      viewport.dataset.initialSpawnLocalTile = formatRuntimeTileForDataset(nextLocal.tile);
      viewport.dataset.initialSpawnOpponentTile = formatRuntimeTileForDataset(nextOpponent.tile);
    }
  }, [collisionMap]);

  useEffect(() => {
    visibleActiveEventsRef.current = visibleActiveEvents;
  }, [visibleActiveEvents]);

  useEffect(() => {
    if (completedPvpFightHistoryFromEvents.length === 0) {
      return;
    }
    setStoredPvpFightHistory((current) => {
      const next = mergeRunelitePvpFightHistory(current, completedPvpFightHistoryFromEvents);
      if (
        next.length === current.length &&
        next.every((entry, index) => entry.id === current[index]?.id)
      ) {
        return current;
      }
      writeStoredRunelitePvpFightHistory(next);
      return next;
    });
  }, [completedPvpFightHistoryFromEvents]);

  useEffect(() => {
    projectileDefinitionsRef.current = projectileDefinitions;
  }, [projectileDefinitions]);

  useEffect(() => {
    spotanimDefinitionsRef.current = spotanimDefinitions;
  }, [spotanimDefinitions]);

  useEffect(() => {
    spriteAtlasesRef.current = spriteAtlases;
  }, [spriteAtlases]);

  useEffect(() => {
    clientFontsRef.current = clientFonts;
  }, [clientFonts]);

  useEffect(() => {
    xpDropCounterShownRef.current = xpDropCounterShown;
  }, [xpDropCounterShown]);

  useEffect(() => {
    gameKeybindsRef.current = gameKeybinds;
    nhWriteGameKeybindsToStorage(gameKeybinds);
    applyNhGameKeybindConfig(canvasRef.current, gameKeybinds);
  }, [gameKeybinds]);

  useEffect(() => {
    if (activeSideTabId !== "equipment") {
      setEquipmentUtilityPanelMode(null);
    }
  }, [activeSideTabId]);

  useLayoutEffect(() => {
    applyRuntimeDomOverlayElementStyles(
      runtimeDomOverlays,
      fixedClientCssLayout,
      runtimeDomOverlayElementsRef.current
    );
  }, [fixedClientCssLayout, runtimeDomOverlays]);

  useLayoutEffect(() => {
    applyRuneliteProjectedDomOverlayElementStyles(
      runeliteFreezeTimerOverlays,
      fixedClientCssLayout,
      runeliteFreezeTimerOverlayElementsRef.current
    );
  }, [fixedClientCssLayout, runeliteFreezeTimerOverlays]);

  useLayoutEffect(() => {
    applyRuneliteProjectedDomOverlayElementStyles(
      runelitePlayerIndicatorOverlays,
      fixedClientCssLayout,
      runelitePlayerIndicatorOverlayElementsRef.current
    );
  }, [fixedClientCssLayout, runelitePlayerIndicatorOverlays]);

  useLayoutEffect(() => {
    applyRuneliteProjectedDomOverlayElementStyles(
      runelitePrayAgainstPlayerOverlays,
      fixedClientCssLayout,
      runelitePrayAgainstPlayerOverlayElementsRef.current
    );
  }, [fixedClientCssLayout, runelitePrayAgainstPlayerOverlays]);

  useLayoutEffect(() => {
    applyRuneliteProjectedDomOverlayElementStyles(
      runelitePrayerBarOverlay ? [runelitePrayerBarOverlay] : [],
      fixedClientCssLayout,
      runelitePrayerBarOverlayElementsRef.current
    );
  }, [fixedClientCssLayout, runelitePrayerBarOverlay]);

  useLayoutEffect(() => {
    applyRuneliteProjectedDomOverlayElementStyles(
      runeliteXpDropDamageOverlay ? [runeliteXpDropDamageOverlay] : [],
      fixedClientCssLayout,
      runeliteXpDropDamageOverlayElementsRef.current
    );
  }, [fixedClientCssLayout, runeliteXpDropDamageOverlay]);

  useLayoutEffect(() => {
    applyRuneliteXpDropOverlayElementStyles(
      runeliteXpDropOverlays,
      fixedClientCssLayout,
      runeliteXpDropOverlayElementsRef.current,
      Math.floor(performance.now() / NH_CLIENT_CYCLE_MS)
    );
  }, [fixedClientCssLayout, runeliteXpDropOverlays]);

  useEffect(() => {
    runeliteClientConfigRef.current = runeliteClientConfig;
    const boundary = boundaryRef.current;
    if (boundary) {
      applyRuneliteGpuPluginConfig(boundary, runeliteClientConfig.gpu);
    }
    applyRuneliteAntiDragConfig(canvasRef.current, runeliteClientConfig.antiDrag);
    applyRuneliteKeyRemappingConfig(canvasRef.current, runeliteClientConfig.keyRemapping);
    applyRuneliteMouseHighlightConfig(canvasRef.current, runeliteClientConfig.mouseHighlight);
    applyRuneliteAnimationSmoothingConfig(canvasRef.current, runeliteClientConfig.animationSmoothing);
    applyRuneliteEntityHiderConfig(canvasRef.current, runeliteClientConfig.entityHider);
    applyRuneliteHideUnderConfig(canvasRef.current, runeliteClientConfig.hideUnder);
    applyRunelitePrayAgainstPlayerConfig(canvasRef.current, runeliteClientConfig.prayAgainstPlayer);
    applyRuneliteFreezeTimersConfig(canvasRef.current, runeliteClientConfig.freezeTimers);
    applyRuneliteTimersConfig(canvasRef.current, runeliteClientConfig.timers);
    applyRunelitePvpToolsConfig(canvasRef.current, runeliteClientConfig.pvpTools, runelitePvpToolsRenderSelf);
    applyRuneliteSpecBarConfig(canvasRef.current, runeliteClientConfig.specBar);
    applyRuneliteAttackStylesConfig(canvasRef.current, runeliteClientConfig.attackStyles);
    applyRuneliteStatusBarsConfig(canvasRef.current, runeliteClientConfig.statusBars);
    applyRuneliteStatusOrbsConfig(canvasRef.current, runeliteClientConfig.statusOrbs);
    applyRunelitePrayerConfig(canvasRef.current, runeliteClientConfig.prayer);
    applyRuneliteOpponentInfoConfig(canvasRef.current, runeliteClientConfig.opponentInfo);
    applyRunelitePlayerIndicatorsConfig(canvasRef.current, runeliteClientConfig.playerIndicators);
    applyRuneliteTileIndicatorsConfig(canvasRef.current, runeliteClientConfig.tileIndicators);
    applyRuneliteBoostsConfig(canvasRef.current, runeliteClientConfig.boosts);
    applyRuneliteInfoBoxConfig(canvasRef.current, runeliteClientConfig.infoBox);
    applyRuneliteXpDropConfig(canvasRef.current, runeliteClientConfig.xpDrop);
  }, [runeliteClientConfig, runelitePvpToolsRenderSelf]);

  useEffect(() => {
    runelitePvpToolsRenderSelfRef.current = runelitePvpToolsRenderSelf;
  }, [runelitePvpToolsRenderSelf]);

  useEffect(() => {
    const config = runeliteClientConfig.pvpTools;
    if (!config.enabled || config.renderSelfHotkey.trim().toLowerCase() === "not set") {
      return;
    }

    const onRenderSelfHotkey = (event: KeyboardEvent): void => {
      if (
        event.repeat ||
        runeliteKeyRemappingEventTargetConsumesKeys(event.target) ||
        !runelitePvpToolsRenderSelfHotkeyMatches(config.renderSelfHotkey, event)
      ) {
        return;
      }

      event.preventDefault();
      setRunelitePvpToolsRenderSelf((current) => !current);
    };

    window.addEventListener("keydown", onRenderSelfHotkey);
    return () => window.removeEventListener("keydown", onRenderSelfHotkey);
  }, [
    runeliteClientConfig.pvpTools.enabled,
    runeliteClientConfig.pvpTools.renderSelfHotkey
  ]);

  useEffect(() => {
    manualActorRef.current = manualActorWithAuthoritativeSequenceCursor(manualActor, manualActorRef.current);
  }, [manualActor]);

  useEffect(() => {
    manualOpponentRef.current = manualActorWithAuthoritativeSequenceCursor(manualOpponent, manualOpponentRef.current);
  }, [manualOpponent]);

  useEffect(() => {
    manualCombatStateRef.current = manualCombatState;
  }, [manualCombatState]);

  useEffect(() => {
    modelsRef.current = models;
  }, [models]);

  useEffect(() => {
    playerModelSourcesRef.current = playerModelSources;
  }, [playerModelSources]);

  useEffect(() => {
    animationFixturesRef.current = animationFixtures;
  }, [animationFixtures]);

  useEffect(() => {
    actorSequenceDefinitionsRef.current = actorSequenceDefinitions;
  }, [actorSequenceDefinitions]);

  useEffect(() => {
    inventoryOverrideRef.current = inventoryOverride;
  }, [inventoryOverride]);

  useEffect(() => {
    inventoryItemDefinitionsRef.current = inventoryItemDefinitions;
  }, [inventoryItemDefinitions]);

  useEffect(() => {
    inventoryEquipmentDefinitionsRef.current = inventoryEquipmentDefinitions;
  }, [inventoryEquipmentDefinitions]);

  useEffect(() => {
    weaponTypeDefinitionsRef.current = weaponTypeDefinitions;
  }, [weaponTypeDefinitions]);

  useEffect(() => {
    if (equipmentOverride !== null || equipmentOverrideRef.current === null) {
      equipmentOverrideRef.current = equipmentOverride;
    }
  }, [equipmentOverride]);

  useEffect(() => {
    const onRuntimeTickOriginReset = (): void => {
      runtimeTickOriginMsRef.current = performance.now();
    };
    window.addEventListener("nh-runtime-reset-tick-origin", onRuntimeTickOriginReset);
    return () => window.removeEventListener("nh-runtime-reset-tick-origin", onRuntimeTickOriginReset);
  }, []);

  useEffect(() => {
    hudPrayersRef.current = visibleSnapshot.hud.prayers;
  }, [visibleSnapshot.hud.prayers]);

  useEffect(() => {
    hudCombatLevelsRef.current = runtimeCombatLevelsFromHud(visibleSnapshot.hud);
  }, [visibleSnapshot.hud]);

  useEffect(() => {
    const handleOverlayLocationsChanged = (event: Event): void => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      setRuneliteOverlayLocations(detail?.locations ?? readRuneliteOverlayPreferredLocations());
    };

    window.addEventListener("runelite-overlay-locations-changed", handleOverlayLocationsChanged);
    return () => window.removeEventListener("runelite-overlay-locations-changed", handleOverlayLocationsChanged);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const boundary = createRuntimeBoundary(canvas);
    boundaryRef.current = boundary;
    applyRuntimeCameraMode(boundary, cameraMode);
    applyRuneliteGpuPluginConfig(boundary, runeliteClientConfigRef.current.gpu);
    applyRuneliteAntiDragConfig(canvas, runeliteClientConfigRef.current.antiDrag);
    applyRuneliteKeyRemappingConfig(canvas, runeliteClientConfigRef.current.keyRemapping);
    applyRuneliteMouseHighlightConfig(canvas, runeliteClientConfigRef.current.mouseHighlight);
    applyRuneliteAnimationSmoothingConfig(canvas, runeliteClientConfigRef.current.animationSmoothing);
    applyRuneliteEntityHiderConfig(canvas, runeliteClientConfigRef.current.entityHider);
    applyRuneliteHideUnderConfig(canvas, runeliteClientConfigRef.current.hideUnder);
    applyRunelitePrayAgainstPlayerConfig(canvas, runeliteClientConfigRef.current.prayAgainstPlayer);
    applyRuneliteFreezeTimersConfig(canvas, runeliteClientConfigRef.current.freezeTimers);
    applyRuneliteTimersConfig(canvas, runeliteClientConfigRef.current.timers);
    applyRunelitePvpToolsConfig(canvas, runeliteClientConfigRef.current.pvpTools, runelitePvpToolsRenderSelf);
    applyRuneliteSpecBarConfig(canvas, runeliteClientConfigRef.current.specBar);
    applyRuneliteAttackStylesConfig(canvas, runeliteClientConfigRef.current.attackStyles);
    applyRuneliteStatusBarsConfig(canvas, runeliteClientConfigRef.current.statusBars);
    applyRuneliteStatusOrbsConfig(canvas, runeliteClientConfigRef.current.statusOrbs);
    applyRunelitePrayerConfig(canvas, runeliteClientConfigRef.current.prayer);
    applyRuneliteOpponentInfoConfig(canvas, runeliteClientConfigRef.current.opponentInfo);
    applyRunelitePlayerIndicatorsConfig(canvas, runeliteClientConfigRef.current.playerIndicators);
    applyRuneliteTileIndicatorsConfig(canvas, runeliteClientConfigRef.current.tileIndicators);
    applyRuneliteBoostsConfig(canvas, runeliteClientConfigRef.current.boosts);
    applyRuneliteInfoBoxConfig(canvas, runeliteClientConfigRef.current.infoBox);
    applyRuneliteXpDropConfig(canvas, runeliteClientConfigRef.current.xpDrop);
    applyNhGameKeybindConfig(canvas, gameKeybindsRef.current);

    const resizeObserver = new ResizeObserver(() => setFixedClientCssLayout(resizeRuntimeBoundary(boundary, canvas)));
    resizeObserver.observe(canvas);
    setFixedClientCssLayout(resizeRuntimeBoundary(boundary, canvas));

    let animationFrame = 0;
    let lastCameraClientCycleMs = performance.now();
    let lastManualActorReactSyncClientCycle = -NH_CLIENT_CYCLES_PER_GAME_TICK;
    const advanceManualActorsForRenderFrame = (now: number): void => {
      const collision = collisionMapRef.current;
      if (!manualControlRef.current || !collision) {
        return;
      }

      const clientCycle = Math.floor(now / NH_CLIENT_CYCLE_MS);
      const localActor = manualActorRef.current;
      const opponentActor = manualOpponentRef.current;
      if (
        localActor.lastMovementClientCycle !== null &&
        opponentActor.lastMovementClientCycle !== null &&
        clientCycle <= localActor.lastMovementClientCycle &&
        clientCycle <= opponentActor.lastMovementClientCycle
      ) {
        return;
      }

      const combatState = manualCombatStateRef.current;
      const animationFixtures = animationFixturesRef.current;
      const nextLocalActor = advanceManualActor(
        localActor,
        now,
        collision,
        combatState.actors["local-player"],
        combatState,
        animationFixtures,
        opponentActor,
        NH_CLIENT_MAX_CYCLES_PER_RENDER_FRAME
      );
      const nextOpponentActor = advanceManualActor(
        opponentActor,
        now,
        collision,
        combatState.actors.opponent,
        combatState,
        animationFixtures,
        nextLocalActor,
        NH_CLIENT_MAX_CYCLES_PER_RENDER_FRAME
      );

      manualActorRef.current = nextLocalActor;
      manualOpponentRef.current = nextOpponentActor;
      const routeJustFinished =
        (localActor.routeWaypoints.length > 0 && nextLocalActor.routeWaypoints.length === 0) ||
        (opponentActor.routeWaypoints.length > 0 && nextOpponentActor.routeWaypoints.length === 0);
      const reachedGameTickSync =
        clientCycle - lastManualActorReactSyncClientCycle >= NH_CLIENT_CYCLES_PER_GAME_TICK;
      const actorsStillMoving =
        manualActorHasPendingMovement(nextLocalActor) || manualActorHasPendingMovement(nextOpponentActor);
      if (routeJustFinished || (reachedGameTickSync && !actorsStillMoving)) {
        lastManualActorReactSyncClientCycle = clientCycle;
        setManualActor(nextLocalActor);
        setManualOpponent(nextOpponentActor);
      }
    };
    const renderFrame = (now = performance.now()): void => {
      let cameraClientStepCount = 0;
      const elapsedMs = now - lastCameraClientCycleMs;
      if (elapsedMs >= NH_CLIENT_CYCLE_MS) {
        cameraClientStepCount = Math.min(
          NH_CLIENT_MAX_CYCLES_PER_RENDER_FRAME,
          Math.floor(elapsedMs / NH_CLIENT_CYCLE_MS)
        );
        for (let step = 0; step < cameraClientStepCount; step += 1) {
          const mouseCamera = mouseCameraDragRef.current;
          if (mouseCamera) {
            mouseCameraDragRef.current = advanceRuntimeCameraAnglesClientCycle(
              boundary,
              cameraKeysRef.current,
              mouseCamera
            );
          } else {
            advanceRuntimeCameraAnglesClientCycle(boundary, cameraKeysRef.current);
          }
        }
        if (mouseCameraDragRef.current) {
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.dataset.lastMouseCameraX = String(mouseCameraDragRef.current.x);
            canvas.dataset.lastMouseCameraY = String(mouseCameraDragRef.current.y);
            canvas.dataset.lastMouseCameraClickedX = String(mouseCameraDragRef.current.clickedX);
            canvas.dataset.lastMouseCameraClickedY = String(mouseCameraDragRef.current.clickedY);
            canvas.dataset.lastMouseCameraYaw = String(boundary.cameraRig.clientAngles.yaw);
            canvas.dataset.lastMouseCameraPitch = String(boundary.cameraRig.clientAngles.pitch);
            canvas.dataset.sourceMouseCamera =
              "Client.java MouseHandler_currentButton == 4 && WorldMapIcon_1.mouseCam: camAngleDX/DY from middle-drag deltas";
          }
        }
        lastCameraClientCycleMs += cameraClientStepCount * NH_CLIENT_CYCLE_MS;
        if (now - lastCameraClientCycleMs > NH_CLIENT_CYCLE_MS * NH_CLIENT_MAX_CYCLES_PER_RENDER_FRAME) {
          lastCameraClientCycleMs = now;
        }
      }
      advanceManualActorsForRenderFrame(now);
      const renderClientCycle = Math.floor(now / NH_CLIENT_CYCLE_MS);
      const frameSnapshot = runtimeAnimationSmoothingFrameSnapshot(
        visibleSnapshotRef.current,
        manualControlRef.current,
        now,
        manualActorRef.current,
        manualOpponentRef.current,
        manualCombatStateRef.current,
        inventoryEquipmentDefinitionsRef.current,
        weaponTypeDefinitionsRef.current,
        actorSequenceDefinitionsRef.current,
        animationFixturesRef.current,
        runeliteClientConfigRef.current.animationSmoothing
      );
      const effectFrameSnapshot = runtimeEffectFrameSnapshot(
        frameSnapshot,
        manualControlRef.current,
        runtimeTickOriginMsRef.current,
        now
      );
      runtimeInteractionSnapshotRef.current = frameSnapshot;
      const frameModels = ensureRuntimeActorModelsForSnapshot(frameSnapshot);
      if (
        (manualControlRef.current || runeliteAnimationSmoothingRuntimeReapplyEnabled(runeliteClientConfigRef.current.animationSmoothing)) &&
        frameModels.size > 0
      ) {
        applySnapshot(
          boundary,
          frameSnapshot,
          frameModels,
          animationFixturesRef.current,
          collisionMapRef.current,
          runeliteClientConfigRef.current.entityHider,
          runeliteClientConfigRef.current.hideUnder,
          runelitePvpToolsRenderSelfRef.current,
          manualCombatStateRef.current,
          runeliteClientConfigRef.current.animationSmoothing
        );
      }
      for (let step = 0; step < cameraClientStepCount; step += 1) {
        updateRuntimeCameraFollowTarget(boundary);
      }
      updateRuntimeCamera(boundary);
      updateRuntimeEffectObjects(
        boundary,
        effectFrameSnapshot,
        visibleActiveEventsRef.current,
        animationFixturesRef.current,
        spotanimDefinitionsRef.current,
        projectileDefinitionsRef.current
      );
      reprojectRuntimeOverlaySprites(boundary, frameSnapshot);
      writeRuntimeMotionDebugSnapshot(boundary, frameSnapshot, now);
      const nextDomOverlays = buildRuntimeDomOverlays(
        boundary,
        frameSnapshot,
        visibleActiveEventsRef.current,
        spriteAtlasesRef.current,
        1
      );
      const nextDomOverlaySignature = runtimeDomOverlayStructureSignature(nextDomOverlays);
      if (runtimeDomOverlaySignatureRef.current !== nextDomOverlaySignature) {
        runtimeDomOverlaySignatureRef.current = nextDomOverlaySignature;
        setRuntimeDomOverlays(nextDomOverlays);
      }
      applyRuntimeDomOverlayElementStyles(
        nextDomOverlays,
        boundary.fixedClientCssLayout,
        runtimeDomOverlayElementsRef.current
      );
      const nextFreezeTimerOverlays = buildRuneliteFreezeTimerDomOverlays(
        boundary,
        manualCombatStateRef.current,
        runeliteClientConfigRef.current.freezeTimers
      ).filter((overlay) =>
        runeliteEntityHiderActorId2dVisible(overlay.actorId, frameSnapshot, runeliteClientConfigRef.current.entityHider)
      );
      const nextFreezeTimerOverlaySignature = runeliteFreezeTimerDomOverlaySignature(nextFreezeTimerOverlays);
      if (runeliteFreezeTimerDomOverlaySignatureRef.current !== nextFreezeTimerOverlaySignature) {
        runeliteFreezeTimerDomOverlaySignatureRef.current = nextFreezeTimerOverlaySignature;
        setRuneliteFreezeTimerOverlays(nextFreezeTimerOverlays);
      }
      applyRuneliteProjectedDomOverlayElementStyles(
        nextFreezeTimerOverlays,
        boundary.fixedClientCssLayout,
        runeliteFreezeTimerOverlayElementsRef.current
      );
      const nextFreezeTimerInfoBoxOverlay = buildRuneliteLocalFreezeTimerInfoBoxDomOverlay(
        manualCombatStateRef.current,
        runeliteClientConfigRef.current.timers,
        runeliteClientConfigRef.current.infoBox,
        spriteAtlasesRef.current
      );
      const nextFreezeTimerInfoBoxSignature = runeliteFreezeTimerInfoBoxDomOverlaySignature(nextFreezeTimerInfoBoxOverlay);
      if (runeliteFreezeTimerInfoBoxSignatureRef.current !== nextFreezeTimerInfoBoxSignature) {
        runeliteFreezeTimerInfoBoxSignatureRef.current = nextFreezeTimerInfoBoxSignature;
        setRuneliteFreezeTimerInfoBoxOverlay(nextFreezeTimerInfoBoxOverlay);
      }
      const nextPlayerIndicatorOverlays = buildRunelitePlayerIndicatorDomOverlays(
        boundary,
        frameSnapshot,
        runeliteClientConfigRef.current.playerIndicators
      ).filter((overlay) =>
        runeliteEntityHiderActorId2dVisible(overlay.actorId, frameSnapshot, runeliteClientConfigRef.current.entityHider)
      );
      const nextPlayerIndicatorOverlaySignature = runelitePlayerIndicatorDomOverlaySignature(nextPlayerIndicatorOverlays);
      if (runelitePlayerIndicatorDomOverlaySignatureRef.current !== nextPlayerIndicatorOverlaySignature) {
        runelitePlayerIndicatorDomOverlaySignatureRef.current = nextPlayerIndicatorOverlaySignature;
        setRunelitePlayerIndicatorOverlays(nextPlayerIndicatorOverlays);
      }
      applyRuneliteProjectedDomOverlayElementStyles(
        nextPlayerIndicatorOverlays,
        boundary.fixedClientCssLayout,
        runelitePlayerIndicatorOverlayElementsRef.current
      );
      const nextPrayAgainstPlayerOverlays = buildRunelitePrayAgainstPlayerDomOverlays(
        boundary,
        manualCombatStateRef.current,
        runeliteClientConfigRef.current.prayAgainstPlayer,
        spriteAtlasesRef.current
      ).filter((overlay) =>
        runeliteEntityHiderActorId2dVisible(overlay.actorId, frameSnapshot, runeliteClientConfigRef.current.entityHider)
      );
      const nextPrayAgainstPlayerOverlaySignature = runelitePrayAgainstPlayerDomOverlaySignature(nextPrayAgainstPlayerOverlays);
      if (runelitePrayAgainstPlayerDomOverlaySignatureRef.current !== nextPrayAgainstPlayerOverlaySignature) {
        runelitePrayAgainstPlayerDomOverlaySignatureRef.current = nextPrayAgainstPlayerOverlaySignature;
        setRunelitePrayAgainstPlayerOverlays(nextPrayAgainstPlayerOverlays);
      }
      applyRuneliteProjectedDomOverlayElementStyles(
        nextPrayAgainstPlayerOverlays,
        boundary.fixedClientCssLayout,
        runelitePrayAgainstPlayerOverlayElementsRef.current
      );
      const nextTileIndicatorOverlays = buildRuneliteTileIndicatorDomOverlays(
        boundary,
        frameSnapshot,
        runeliteClientConfigRef.current.tileIndicators,
        minimapDestinationTileRef.current,
        hoveredSceneTileRef.current,
        collisionMapRef.current
      );
      const nextTileIndicatorOverlaySignature = runeliteTileIndicatorDomOverlaySignature(nextTileIndicatorOverlays);
      if (runeliteTileIndicatorDomOverlaySignatureRef.current !== nextTileIndicatorOverlaySignature) {
        runeliteTileIndicatorDomOverlaySignatureRef.current = nextTileIndicatorOverlaySignature;
        setRuneliteTileIndicatorOverlays(nextTileIndicatorOverlays);
      }
      const prayerTickProgress = runelitePrayerTickProgressRadians(now);
      const nextPrayerBarOverlayRaw = buildRunelitePrayerBarDomOverlay(
        boundary,
        frameSnapshot,
        runeliteClientConfigRef.current.prayer,
        prayerTickProgress
      );
      const nextPrayerBarOverlay =
        nextPrayerBarOverlayRaw && runeliteEntityHiderActorId2dVisible(
          nextPrayerBarOverlayRaw.actorId,
          frameSnapshot,
          runeliteClientConfigRef.current.entityHider
        )
          ? nextPrayerBarOverlayRaw
          : null;
      const nextPrayerBarOverlaySignature = runelitePrayerBarDomOverlaySignature(nextPrayerBarOverlay);
      if (runelitePrayerBarDomOverlaySignatureRef.current !== nextPrayerBarOverlaySignature) {
        runelitePrayerBarDomOverlaySignatureRef.current = nextPrayerBarOverlaySignature;
        setRunelitePrayerBarOverlay(nextPrayerBarOverlay);
      }
      applyRuneliteProjectedDomOverlayElementStyles(
        nextPrayerBarOverlay ? [nextPrayerBarOverlay] : [],
        boundary.fixedClientCssLayout,
        runelitePrayerBarOverlayElementsRef.current
      );
      const nextPrayerFlickOrbOverlay = buildRunelitePrayerFlickOrbDomOverlay(
        boundary,
        frameSnapshot,
        runeliteClientConfigRef.current.prayer,
        prayerTickProgress
      );
      const nextPrayerFlickOrbOverlaySignature = runelitePrayerFlickOrbDomOverlaySignature(nextPrayerFlickOrbOverlay);
      if (runelitePrayerFlickOrbDomOverlaySignatureRef.current !== nextPrayerFlickOrbOverlaySignature) {
        runelitePrayerFlickOrbDomOverlaySignatureRef.current = nextPrayerFlickOrbOverlaySignature;
        setRunelitePrayerFlickOrbOverlay(nextPrayerFlickOrbOverlay);
      }
      const nextAttackStylesOverlay = buildRuneliteAttackStylesDomOverlay(
        boundary,
        frameSnapshot,
        runeliteClientConfigRef.current.attackStyles
      );
      const nextAttackStylesOverlaySignature = runeliteAttackStylesDomOverlaySignature(nextAttackStylesOverlay);
      if (runeliteAttackStylesDomOverlaySignatureRef.current !== nextAttackStylesOverlaySignature) {
        runeliteAttackStylesDomOverlaySignatureRef.current = nextAttackStylesOverlaySignature;
        setRuneliteAttackStylesOverlay(nextAttackStylesOverlay);
      }
      const nextXpDropDamageOverlayRaw = buildRuneliteXpDropDamageDomOverlay(
        boundary,
        manualCombatStateRef.current,
        runeliteClientConfigRef.current.xpDrop
      );
      const nextXpDropDamageOverlay =
        nextXpDropDamageOverlayRaw && runeliteEntityHiderActorId2dVisible(
          nextXpDropDamageOverlayRaw.actorId,
          frameSnapshot,
          runeliteClientConfigRef.current.entityHider
        )
          ? nextXpDropDamageOverlayRaw
          : null;
      const nextXpDropDamageOverlaySignature = runeliteXpDropDamageDomOverlaySignature(nextXpDropDamageOverlay);
      if (runeliteXpDropDamageDomOverlaySignatureRef.current !== nextXpDropDamageOverlaySignature) {
        runeliteXpDropDamageDomOverlaySignatureRef.current = nextXpDropDamageOverlaySignature;
        setRuneliteXpDropDamageOverlay(nextXpDropDamageOverlay);
      }
      applyRuneliteProjectedDomOverlayElementStyles(
        nextXpDropDamageOverlay ? [nextXpDropDamageOverlay] : [],
        boundary.fixedClientCssLayout,
        runeliteXpDropDamageOverlayElementsRef.current
      );
      const nextXpDropOverlays = syncRuneliteXpDropDomOverlays(
        boundary,
        manualCombatStateRef.current,
        runeliteClientConfigRef.current.xpDrop,
        xpDropCounterShownRef.current,
        clientFontsRef.current,
        renderClientCycle,
        runeliteXpDropActiveDropletsRef.current,
        runeliteXpDropEmittedQueuedHitIdsRef.current,
        runeliteXpDropLastStartClientCycleRef
      ).filter((overlay) =>
        runeliteEntityHiderActorId2dVisible(overlay.actorId, frameSnapshot, runeliteClientConfigRef.current.entityHider)
      );
      const nextXpDropOverlaySignature = runeliteXpDropDomOverlaySignature(nextXpDropOverlays);
      if (runeliteXpDropDomOverlaySignatureRef.current !== nextXpDropOverlaySignature) {
        runeliteXpDropDomOverlaySignatureRef.current = nextXpDropOverlaySignature;
        setRuneliteXpDropOverlays(nextXpDropOverlays);
      }
      applyRuneliteXpDropOverlayElementStyles(
        nextXpDropOverlays,
        boundary.fixedClientCssLayout,
        runeliteXpDropOverlayElementsRef.current,
        renderClientCycle
      );
      updateNhAnimatedTextures(boundary.scene, renderClientCycle);
      updateNhPlayerModelPainterOrder(boundary.scene, boundary.camera);
      renderRuntimeBoundary(boundary);
      if (minimapCameraYawRef.current !== boundary.cameraRig.clientAngles.yaw) {
        minimapCameraYawRef.current = boundary.cameraRig.clientAngles.yaw;
        setMinimapCameraYaw(boundary.cameraRig.clientAngles.yaw);
      }
      animationFrame = requestAnimationFrame(renderFrame);
    };
    renderFrame();

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      disposeObject(boundary.scene);
      boundary.renderer.dispose();
      setFixedClientLayout(null);
      setFixedClientCssLayout(null);
      setMinimapSceneSprite(null);
      setSceneObjectPlacements([]);
      setRuntimeDomOverlays([]);
      runtimeDomOverlaySignatureRef.current = "";
      runtimeDomOverlayElementsRef.current.clear();
      setRuneliteFreezeTimerOverlays([]);
      runeliteFreezeTimerDomOverlaySignatureRef.current = "";
      runeliteFreezeTimerOverlayElementsRef.current.clear();
      setRunelitePlayerIndicatorOverlays([]);
      runelitePlayerIndicatorDomOverlaySignatureRef.current = "";
      runelitePlayerIndicatorOverlayElementsRef.current.clear();
      setRunelitePrayAgainstPlayerOverlays([]);
      runelitePrayAgainstPlayerDomOverlaySignatureRef.current = "";
      runelitePrayAgainstPlayerOverlayElementsRef.current.clear();
      setRunelitePrayerBarOverlay(null);
      runelitePrayerBarDomOverlaySignatureRef.current = "";
      runelitePrayerBarOverlayElementsRef.current.clear();
      setRunelitePrayerFlickOrbOverlay(null);
      runelitePrayerFlickOrbDomOverlaySignatureRef.current = "";
      setRuneliteAttackStylesOverlay(null);
      runeliteAttackStylesDomOverlaySignatureRef.current = "";
      setRuneliteXpDropDamageOverlay(null);
      runeliteXpDropDamageDomOverlaySignatureRef.current = "";
      runeliteXpDropDamageOverlayElementsRef.current.clear();
      setRuneliteXpDropOverlays([]);
      runeliteXpDropDomOverlaySignatureRef.current = "";
      runeliteXpDropActiveDropletsRef.current.clear();
      runeliteXpDropEmittedQueuedHitIdsRef.current.clear();
      runeliteXpDropLastStartClientCycleRef.current = 0;
      runeliteXpDropOverlayElementsRef.current.clear();
      boundaryRef.current = null;
      boundary.sceneTilePicker = null;
    };
  }, []);

  useEffect(() => {
    let canceled = false;

    const loadPlayerSources = loadPlayerModelSources();
    const loadArena = Promise.all([
      loadGlb(runtimeArena.artifactUrl),
      loadGlb(runtimeArena.objectArtifactUrl),
      loadJson<NhArenaMetadata>(runtimeArena.metadataUrl),
      loadJson<readonly NhArenaObjectPlacement[]>(runtimeArena.objectMetadataUrl)
    ]);
    const loadAnimations = loadAnimationFixtures();
    const loadProjectiles = loadProjectileDefinitions();
    const loadSpotanims = loadSpotanimDefinitions();
    const loadSprites = loadSpriteAtlases();
    const loadFixedLayout = loadFixedClientLayout();
    const loadFloors = loadFloorDefinitions();
    const loadTerrainTextures = loadTerrainTextureDefinitions();
    const loadInventoryItems = loadInventoryItemDefinitions();
    const loadInventoryEquipment = loadInventoryEquipmentDefinitions();
    const loadWeaponTypes = loadWeaponTypeDefinitions();
    const loadHitsplats = loadHitsplatDefinitions();
    const loadHealthBars = loadHealthBarDefinitions();
    const loadOverheadIcons = loadOverheadIconDefinitions();
    const loadFonts = loadClientFonts();
    const loadReplays = Promise.all([
      loadProjectiles,
      loadSpotanims,
      loadHitsplats,
      loadHealthBars,
      loadOverheadIcons,
      loadAnimations
    ]).then(
      ([projectiles, spotanims, hitsplats, healthBars, overheadIcons, animations]) =>
        loadRuntimeReplays(
          projectiles,
          spotanims,
          hitsplats,
          healthBars,
          overheadIcons,
          actorSequenceDefinitionsFromAnimationFixtures(animations)
        )
    );

    void Promise.all([
      loadPlayerSources,
      loadArena,
      loadAnimations,
      loadProjectiles,
      loadSpotanims,
      loadSprites,
      loadFixedLayout,
      loadFloors,
      loadTerrainTextures,
      loadInventoryItems,
      loadInventoryEquipment,
      loadWeaponTypes,
      loadHitsplats,
      loadHealthBars,
      loadOverheadIcons,
      loadFonts,
      loadReplays
    ])
      .then(
        async ([
          playerSources,
          arenaParts,
          animations,
          projectiles,
          spotanims,
          sprites,
          fixedLayout,
          floors,
          terrainTextures,
          inventoryItems,
          inventoryEquipment,
          weaponTypes,
          hitsplats,
          healthBars,
          overheadIcons,
          fonts,
          replays
        ]) => {
          const entries = new Map<string, RuntimeActorModelAsset>();
          const addActorModel = (
            key: string,
            appearance: Pick<RuntimePlayerAppearance, "itemIds" | "bodyColors" | "equipmentSlots"> & {
              readonly shieldOverrideId?: number;
              readonly weaponOverrideId?: number;
            }
          ): void => {
            if (entries.has(key)) {
              return;
            }
            entries.set(
              key,
              composeNhPlayerModel(playerSources, {
                itemIds: appearance.itemIds,
                equipmentSlots: appearance.equipmentSlots,
                bodyColors: appearance.bodyColors,
                shieldOverrideId: appearance.shieldOverrideId,
                weaponOverrideId: appearance.weaponOverrideId
              })
            );
          };

          for (const loadout of runtimeLoadouts) {
            addActorModel(runtimeLoadoutModelKey(loadout.id), {
              itemIds: loadout.itemIds,
              bodyColors: loadout.bodyColors
            });
          }
          for (const keyframe of runtimeTimeline) {
            for (const pose of keyframe.actors) {
              addActorModel(runtimeActorModelKey(pose, animations), runtimeActorModelInput(pose, animations));
            }
          }
          for (const replay of replays) {
            for (const keyframe of replay.timeline) {
              for (const pose of keyframe.actors) {
                addActorModel(runtimeActorModelKey(pose, animations), runtimeActorModelInput(pose, animations));
              }
            }
          }
          const effectUrls = [
            ...new Set(
              [
                ...runtimeRenderEvents,
                ...replays.flatMap((replay) => replay.events)
              ]
                .map((event) => event.artifactUrl)
                .filter((url): url is string => Boolean(url))
            )
          ];
          const effects = await Promise.all(
            effectUrls.map(async (url) => {
              const [gltf, metadata] = await Promise.all([
                loadGlb(url),
                loadJson<NhLoadoutMeshMetadata>(effectMeshMetadataUrl(url))
              ]);
              return [url, { scene: gltf.scene, metadata }] as const;
            })
          );

          if (canceled) {
            for (const [, asset] of entries) {
              disposeObject(asset.scene);
            }
            for (const [, asset] of effects) {
              disposeObject(asset.scene);
            }
            disposeObject(arenaParts[0].scene);
            disposeObject(arenaParts[1].scene);
            for (const atlas of sprites.values()) {
              atlas.texture.dispose();
            }
            return;
          }

          const boundary = boundaryRef.current;
          if (boundary) {
            const [terrainPart, objectPart, arenaMetadata, objectPlacements] = arenaParts;
            boundary.fixedClientLayout = fixedLayout;
            setFixedClientLayout(fixedLayout);
            setFixedClientCssLayout(resizeRuntimeBoundary(boundary, boundary.renderer.domElement));
            configureNhSceneObjectMaterials(objectPart.scene);
            const centeredArena = buildCenteredSceneModels([terrainPart.scene, objectPart.scene]);
            boundary.arenaRoot.add(centeredArena.group);
            boundary.sceneTilePicker = { arena: arenaMetadata, sceneOffset: centeredArena.offset };
            setCollisionMap(buildNhSceneCollision(arenaMetadata, objectPlacements, centeredArena.offset));
            setSceneObjectPlacements(objectPlacements);
            setMinimapSceneSprite(buildNhMinimapSceneSprite(arenaMetadata, objectPlacements, floors, terrainTextures));
          }

          setPlayerModelSources(playerSources);
          setModels(entries);
          setEffectModels(new Map(effects));
          setAnimationFixtures(animations);
          setActorSequenceDefinitions(actorSequenceDefinitionsFromAnimationFixtures(animations));
          setProjectileDefinitions(projectiles);
          setSpotanimDefinitions(spotanims);
          setSpriteAtlases(sprites);
          setInventoryItemDefinitions(inventoryItems);
          setInventoryEquipmentDefinitions(inventoryEquipment);
          setWeaponTypeDefinitions(weaponTypes);
          setHitsplatDefinitions(hitsplats);
          setHealthBarDefinitions(healthBars);
          setOverheadIconDefinitions(overheadIcons);
          setClientFonts(fonts);
          runtimeTickOriginMsRef.current = performance.now();
          setRuntimeReplays(replays);
          setSelectedReplayId((current) => current ?? replays[0]?.id ?? null);
          setCycle(replays[0]?.firstCycle ?? 0);
          setLoadState({
            kind: "ready",
            message: "Loaded generated NH duel replay, cache-composed actors, projected sprites, and runtime fixtures."
          });
        }
      )
      .catch((error: unknown) => {
        if (!canceled) {
          const detail = error instanceof Error ? error.message : String(error);
          setLoadState({
            kind: "error",
            message: `Could not load one or more exported runtime assets: ${detail}`
          });
        }
      });

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (liveReplay && selectedReplayId === null) {
      setSelectedReplayId(liveReplay.id);
      setCycle(liveReplay.firstCycle);
    }
  }, [liveReplay, selectedReplayId]);

  useEffect(() => {
    if (!followLive || !liveReplay) {
      return;
    }

    setPlaying(false);
    setSelectedReplayId(liveReplay.id);
    setCycle(liveReplay.lastCycle);
  }, [followLive, liveReplay]);

  useEffect(() => {
    if (!equipmentOverride || !playerModelSources || !animationFixtures) {
      return;
    }

    const localPose = visibleSnapshot.actors.find((pose) => pose.actorId === "local-player");
    if (!localPose) {
      return;
    }

    const modelKey = runtimeActorModelKey(localPose, animationFixtures);
    const modelInput = runtimeActorModelInput(localPose, animationFixtures);
    setModels((current) => {
      if (current.has(modelKey)) {
        return current;
      }
      const next = new Map(current);
      next.set(modelKey, composeNhPlayerModel(playerModelSources, modelInput));
      return next;
    });
  }, [animationFixtures, equipmentOverride, playerModelSources, visibleSnapshot]);

  useEffect(() => {
    const boundary = boundaryRef.current;
    if (!boundary || models.size === 0) {
      return;
    }

    const renderSnapshot = manualControl
      ? runtimeAnimationSmoothingFrameSnapshot(
        visibleSnapshot,
        true,
        performance.now(),
        manualActorRef.current,
        manualOpponentRef.current,
        manualCombatStateRef.current,
        inventoryEquipmentDefinitionsRef.current,
        weaponTypeDefinitionsRef.current,
        actorSequenceDefinitionsRef.current,
        animationFixtures,
        runeliteClientConfig.animationSmoothing
      )
      : visibleSnapshot;
    const renderModels = ensureRuntimeActorModelsForSnapshot(renderSnapshot);

    if (!manualControl) {
      applySnapshot(
        boundary,
        renderSnapshot,
        renderModels,
        animationFixtures,
        collisionMap,
        runeliteClientConfig.entityHider,
        runeliteClientConfig.hideUnder,
        runelitePvpToolsRenderSelf,
        manualCombatState,
        runeliteClientConfig.animationSmoothing
      );
    }
    applyRuntimeEvents(
      boundary,
      renderSnapshot,
      visibleActiveEvents,
      effectModels,
      animationFixtures,
      spotanimDefinitions,
      projectileDefinitions,
      spriteAtlases
    );
  }, [
    animationFixtures,
    effectModels,
    models,
    collisionMap,
    projectileDefinitions,
    runeliteClientConfig.entityHider,
    runeliteClientConfig.hideUnder,
    runeliteClientConfig.animationSmoothing,
    runelitePvpToolsRenderSelf,
    manualControl,
    manualCombatState,
    spotanimDefinitions,
    spriteAtlases,
    visibleActiveEvents,
    visibleSnapshot
  ]);

  useEffect(() => {
    const boundary = boundaryRef.current;
    if (boundary) {
      applyRuntimeCameraMode(boundary, cameraMode);
    }
  }, [cameraMode]);

  useEffect(() => {
    const boundary = boundaryRef.current;
    if (boundary) {
      boundary.cameraRig.followTarget = followTarget;
    }
  }, [followTarget]);

  useEffect(() => {
    if (!manualControl) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const runCombatTick = (): void => {
      if (cancelled) {
        return;
      }

      const targetTick = currentNhGameTickAt(runtimeTickOriginMsRef.current, performance.now());
      let ticksProcessed = 0;
      do {
        processReadyItemActions();
        const localEquipmentBySlot =
          equipmentOverrideRef.current ??
          localPlayerEquipmentItemIdsBySlot(visibleSnapshotRef.current, inventoryEquipmentDefinitionsRef.current);
        const localVisibleEquipment = visibleEquipmentFromRuntimeItemIdsBySlot(
          localEquipmentBySlot,
          inventoryItemDefinitionsRef.current
        );
        const preMovementHitResult = applyRuntimePlayerCombatPreMovementHits(manualCombatStateRef.current, {
          tiles: {
            "local-player": manualActorRef.current.tile,
            opponent: manualOpponentRef.current.tile
          },
          loadouts: {
            "local-player": manualActorRef.current.loadoutId,
            opponent: manualOpponentRef.current.loadoutId
          },
          equipment: {
            "local-player": localVisibleEquipment
          },
          levels: {
            "local-player": hudCombatLevelsRef.current
          },
          prayerPoints: {
            "local-player": {
              current: visibleSnapshotRef.current.hud.prayer,
              fixed: visibleSnapshotRef.current.hud.prayerMax
            }
          },
          prayers: {
            "local-player": runtimePrayerIdsFromNhStates(hudPrayersRef.current)
          },
          tileScale: NH_TILE_WORLD_UNITS,
          clientCycle: Math.floor(performance.now() / NH_CLIENT_CYCLE_MS)
        });
        const preMovementHitApplied = preMovementHitResult.applied;
        const combatStateBeforeMovement = localFreezeBypassRef.current
          ? runtimePlayerCombatStateWithLocalFreezeBypass(preMovementHitResult.state)
          : preMovementHitResult.state;
        manualCombatStateRef.current = combatStateBeforeMovement;
        const localBeforeMovement = stopManualActorMovementIfMovementGated(
          manualActorRef.current,
          combatStateBeforeMovement.actors["local-player"],
          combatStateBeforeMovement.tick
        );
        const opponentBeforeMovement = stopManualActorMovementIfMovementGated(
          manualOpponentRef.current,
          combatStateBeforeMovement.actors.opponent,
          combatStateBeforeMovement.tick
        );
        let local = advanceManualActorServerRouteTick(localBeforeMovement);
        let opponent = advanceManualActorServerRouteTick(opponentBeforeMovement);
        processPendingGroundItemPickup(local.tile);
        let localMovedThisTick = !sameNhTile(localBeforeMovement.tile, local.tile);
        let opponentMovedThisTick = !sameNhTile(opponentBeforeMovement.tile, opponent.tile);
        const opponentPolicySelfMovement = manualPolicyActorMovementViewFromTiles(
          opponentBeforeMovement.tile,
          opponent.tile,
          opponentMovedThisTick
        );
        let preAttackRouteMoved = false;
        manualActorRef.current = local;
        manualOpponentRef.current = opponent;
        let policyResponse: ManualOpponentCombatResponse | null = null;
        let combatStateForTick = manualCombatStateRef.current;
        const policyTickGate = resolveManualOpponentPolicyTick(combatStateForTick);
        combatStateForTick = policyTickGate.combatState;
        if (policyTickGate.shouldRun) {
          policyResponse = queueManualOpponentCombatResponse(combatStateForTick, local, opponent, opponentPolicySelfMovement);
          combatStateForTick = policyResponse.combatState;
          opponent = manualActorFacingTarget(policyResponse.opponentActor, local);
          opponentMovedThisTick = opponentMovedThisTick || policyResponse.policyMovedThisTick;
          manualOpponentRef.current = opponent;
          const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
          if (viewport) {
            viewport.dataset.lastManualOpponentPolicyTick = String(combatStateForTick.tick);
            viewport.dataset.lastManualOpponentPolicyTickSource = "manual-combat-game-tick";
            writeManualOpponentPolicyDataset(viewport, policyResponse);
          }
        }
        const tickNow = performance.now();
        if (collisionMap) {
          const localBeforePreAttackRoute = local;
          local = preAttackRouteManualActorToCombatTarget({
            actorId: "local-player",
            actor: local,
            combatActor: combatStateForTick.actors["local-player"],
            targetActorId: "opponent",
            targetActor: opponent,
            targetCombatActor: combatStateForTick.actors.opponent,
            collision: collisionMap,
            tick: combatStateForTick.tick,
            now: tickNow,
            movedThisTick: localMovedThisTick
          });
          const localPreAttackRouteMoved = !sameNhTile(localBeforePreAttackRoute.tile, local.tile);
          localMovedThisTick = localMovedThisTick || localPreAttackRouteMoved;
          preAttackRouteMoved = preAttackRouteMoved || localPreAttackRouteMoved;

          const opponentBeforePreAttackRoute = opponent;
          opponent = preAttackRouteManualActorToCombatTarget({
            actorId: "opponent",
            actor: opponent,
            combatActor: combatStateForTick.actors.opponent,
            targetActorId: "local-player",
            targetActor: local,
            targetCombatActor: combatStateForTick.actors["local-player"],
            collision: collisionMap,
            tick: combatStateForTick.tick,
            now: tickNow,
            movedThisTick: opponentMovedThisTick
          });
          const opponentPreAttackRouteMoved = !sameNhTile(opponentBeforePreAttackRoute.tile, opponent.tile);
          opponentMovedThisTick = opponentMovedThisTick || opponentPreAttackRouteMoved;
          preAttackRouteMoved = preAttackRouteMoved || opponentPreAttackRouteMoved;
          manualActorRef.current = local;
          manualOpponentRef.current = opponent;
        }
        const processOrderForTick = runtimePlayerCombatProcessOrderForTick(combatStateForTick, combatStateForTick.tick);
        const projectileLineOfSightForActor = (actorId: RuntimeActorId): boolean => {
          if (!collisionMap) {
            return true;
          }
          const actor = actorId === "local-player" ? local : opponent;
          const combatActor = combatStateForTick.actors[actorId];
          const targetActorId: RuntimeActorId = actorId === "local-player" ? "opponent" : "local-player";
          const postMovementTargetActor = targetActorId === "local-player" ? local : opponent;
          const preMovementTargetActor = targetActorId === "local-player" ? localBeforeMovement : opponentBeforeMovement;
          const targetAlreadyProcessed =
            processOrderForTick.indexOf(targetActorId) < processOrderForTick.indexOf(actorId);
          // Source: Nh processes each Player independently in CoreWorker PID order:
          // preAttack -> TargetRoute.beforeMovement -> movement.process -> combat.attack.
          // An earlier-PID attacker sees a later target's pre-movement tile, while a
          // later-PID attacker sees the target after that target has already moved.
          const targetActor = targetAlreadyProcessed ? postMovementTargetActor : preMovementTargetActor;
          return runtimeCombatProjectileLineOfSight({
            actorId,
            actor,
            combatActor,
            targetActor,
            collision: collisionMap
          });
        };
        const result = advanceRuntimePlayerCombat(combatStateForTick, {
          preMovementTiles: {
            "local-player": localBeforeMovement.tile,
            opponent: opponentBeforeMovement.tile
          },
          tiles: {
            "local-player": local.tile,
            opponent: opponent.tile
          },
          loadouts: {
            "local-player": local.loadoutId,
            opponent: opponent.loadoutId
          },
          equipment: {
            "local-player": localVisibleEquipment
          },
          levels: {
            "local-player": hudCombatLevelsRef.current
          },
          prayerPoints: {
            "local-player": {
              current: visibleSnapshotRef.current.hud.prayer,
              fixed: visibleSnapshotRef.current.hud.prayerMax
            }
          },
          prayers: {
            "local-player": runtimePrayerIdsFromNhStates(hudPrayersRef.current)
          },
          targetRouteMovementConsumed: {
            "local-player": localMovedThisTick,
            opponent: opponentMovedThisTick
          },
          projectileLineOfSight: collisionMap
            ? {
                "local-player": projectileLineOfSightForActor("local-player"),
                opponent: projectileLineOfSightForActor("opponent")
              }
            : undefined,
          tileScale: NH_TILE_WORLD_UNITS,
          clientCycle: Math.floor(tickNow / NH_CLIENT_CYCLE_MS)
        });
        let nextTickCombatState = localFreezeBypassRef.current
          ? runtimePlayerCombatStateWithLocalFreezeBypass(result.state)
          : result.state;
        const freshFightReset = applyRuntimeFullFightResetAfterRespawn(combatStateForTick, nextTickCombatState);
        if (freshFightReset) {
          nextTickCombatState = freshFightReset.combatState;
          local = freshFightReset.localActor;
          opponent = freshFightReset.opponentActor;
        }
        manualCombatStateRef.current = nextTickCombatState;
        const localAuthoritativeTile = syncManualActorServerTileToCombatActor(
          local,
          nextTickCombatState.actors["local-player"]
        );
        const opponentAuthoritativeTile = syncManualActorServerTileToCombatActor(
          opponent,
          nextTickCombatState.actors.opponent
        );
        const syncedLocal = stopManualActorMovementIfMovementGated(
          syncManualActorActionSequence(localAuthoritativeTile, nextTickCombatState.actors["local-player"], nextTickCombatState),
          nextTickCombatState.actors["local-player"],
          nextTickCombatState.tick
        );
        const syncedOpponent = stopManualActorMovementIfMovementGated(
          syncManualActorActionSequence(opponentAuthoritativeTile, nextTickCombatState.actors.opponent, nextTickCombatState),
          nextTickCombatState.actors.opponent,
          nextTickCombatState.tick
        );
        const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
        if (viewport && policyResponse) {
          writeManualOpponentTickAuditSnapshot(viewport, {
            response: policyResponse,
            localBeforeMovementTile: localBeforeMovement.tile,
            opponentBeforeMovementTile: opponentBeforeMovement.tile,
            localAfterTickTile: syncedLocal.tile,
            opponentAfterTickTile: syncedOpponent.tile,
            localMovementConsumed: localMovedThisTick,
            opponentMovementConsumed: opponentMovedThisTick,
            preAttackRouteMoved,
            routeRequests: result.routeRequests
          });
        }
        const localPolicyMovement = freshFightReset
          ? manualPolicyStationaryMovementView
          : manualPolicyActorMovementViewFromTiles(
            localBeforeMovement.tile,
            syncedLocal.tile,
            localMovedThisTick
          );
        manualOpponentObservedSelfMovementRef.current = freshFightReset
          ? manualPolicyStationaryMovementView
          : manualPolicyActorMovementViewFromTiles(
            opponentBeforeMovement.tile,
            syncedOpponent.tile,
            opponentMovedThisTick
          );
        manualOpponentObservedLocalAppearanceRef.current = manualPolicyActorAppearanceView(
          syncedLocal,
          nextTickCombatState.actors["local-player"],
          nextTickCombatState.tick,
          localEquipmentBySlot,
          inventoryItemDefinitionsRef.current,
          nextTickCombatState.actors["local-player"].activePrayers,
          localPolicyMovement,
          inventoryOverrideRef.current ?? visibleSnapshotRef.current.inventory
        );
        manualActorRef.current = syncedLocal;
        manualOpponentRef.current = syncedOpponent;
        const actorsStillMoving =
          manualActorHasPendingMovement(syncedLocal) || manualActorHasPendingMovement(syncedOpponent);
        const combatVisiblyChanged =
          preMovementHitApplied ||
          preAttackRouteMoved ||
          freshFightReset !== null ||
          policyResponse !== null ||
          result.routeRequests.length > 0 ||
          result.state.events.length !== combatStateForTick.events.length;
        if (combatVisiblyChanged || !actorsStillMoving) {
          setManualCombatState(nextTickCombatState);
        }
        if (!actorsStillMoving) {
          setManualActor(syncedLocal);
          setManualOpponent(syncedOpponent);
        }
        if (collisionMap && !freshFightReset) {
          for (const request of result.routeRequests) {
            routeRuntimeCombatActor(request, collisionMap);
          }
        }
        ticksProcessed += 1;
      } while (
        !cancelled &&
        ticksProcessed < NH_GAME_TICK_CATCH_UP_LIMIT &&
        manualCombatStateRef.current.tick < targetTick
      );
      const now = performance.now();
      timeoutId = window.setTimeout(runCombatTick, nhGameTickDelay(runtimeTickOriginMsRef.current, now));
    };

    const now = performance.now();
    timeoutId = window.setTimeout(runCombatTick, nhGameTickDelay(runtimeTickOriginMsRef.current, now));

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [collisionMap, manualControl]);

  useEffect(() => {
    const startedAt = clickCross?.startedAt;
    if (startedAt === undefined) {
      return;
    }

    let animationFrame = 0;
    const animate = (): void => {
      const elapsed = performance.now() - startedAt;
      if (nhClickCrossExpired(elapsed)) {
        setClickCross(null);
        return;
      }

      const frame = nhClickCrossFrameFromElapsedMs(elapsed);
      setClickCross((current) => (current && current.startedAt === startedAt ? { ...current, frame } : current));
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, [clickCross?.startedAt]);

  useEffect(() => {
    const updateCameraKeyState = (direction: RuneliteKeyRemappingCameraDirection, pressed: boolean): void => {
      cameraKeysRef.current = { ...cameraKeysRef.current, [direction]: pressed };
    };

    const updateArrowKeyState = (event: KeyboardEvent, pressed: boolean): boolean => {
      const keyIdentity = nhKeyboardEventIdentity(event);
      const releasedRemap = !pressed ? cameraRemappedKeysRef.current.get(keyIdentity) ?? null : null;
      if (runeliteKeyRemappingEventTargetConsumesKeys(event.target) && !releasedRemap) {
        return false;
      }

      const direction =
        releasedRemap ??
        nhCameraDirectionFromArrowKey(event) ??
        (pressed
          ? runeliteKeyRemappingCameraDirectionFromKeyboardEvent(runeliteClientConfigRef.current.keyRemapping, event)
          : null);

      if (!direction) {
        return false;
      }

      if (pressed && !nhCameraDirectionFromArrowKey(event)) {
        cameraRemappedKeysRef.current.set(keyIdentity, direction);
      } else if (!pressed) {
        cameraRemappedKeysRef.current.delete(keyIdentity);
      }

      updateCameraKeyState(direction, pressed);
      event.preventDefault();
      return true;
    };

    const dispatchFunctionKeySideTab = (event: KeyboardEvent): boolean => {
      if (event.repeat || runeliteKeyRemappingTextEntryTargetConsumesKeys(event.target)) {
        return false;
      }

      const keyRemappingConfig = runeliteClientConfigRef.current.keyRemapping;
      const functionKey =
        runeliteDirectFunctionKeyFromKeyboardEvent(event) ??
        runeliteKeyRemappingFunctionKeyFromKeyboardEvent(keyRemappingConfig, event);
      if (!functionKey) {
        return false;
      }

      const tabId = nhGameKeybindSideTabForFunctionKey(gameKeybindsRef.current, functionKey);
      if (!tabId) {
        return false;
      }

      const tab = fixedClientLayout?.sidePanel?.tabs.find((candidate) => candidate.id === (tabId as NhFixedSideTabId));
      if (!tab) {
        return false;
      }

      setActiveSideTabId(tab.id);
      const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
      if (viewport) {
        viewport.dataset.activeSideTabId = tab.id;
        viewport.dataset.lastSideTabAction = "F-key";
        viewport.dataset.lastSideTabActionIndex = "0";
        viewport.dataset.lastSideTabChildId = String(tab.childId);
        viewport.dataset.lastSideTabContainerChildId = String(tab.container.childId);
        viewport.dataset.lastSideTabContainerHidden = tab.container.hidden ? "true" : "false";
        viewport.dataset.lastSideTabContainerWidgetId = String(tab.container.widgetId);
        viewport.dataset.lastSideTabFKey = functionKey;
        viewport.dataset.lastSideTabFKeyMappedTab = tabId;
        viewport.dataset.lastSideTabFKeyMappingSource = NH_GAME_KEYBIND_SOURCE;
        viewport.dataset.lastSideTabIconChildId = String(tab.iconChildId);
        viewport.dataset.lastSideTabIconSpriteId = String(tab.iconSpriteId);
        viewport.dataset.lastSideTabId = tab.id;
        viewport.dataset.lastSideTabMenuInserter = "KeyHandler.copy$keyPressed";
        viewport.dataset.lastSideTabMenuOpcode = "0";
        viewport.dataset.lastSideTabRow = tab.row;
        viewport.dataset.lastSideTabSlotIndex = String(tab.slotIndex);
        viewport.dataset.lastSideTabSourceActionCount = String(tab.actions.length);
        viewport.dataset.lastSideTabSourceActions = tab.actions.join("||");
        viewport.dataset.lastSideTabWidgetId = String(tab.widgetId);
      }

      window.dispatchEvent(
        new CustomEvent("nh-runtime-side-tab", {
          detail: {
            childId: tab.childId,
            containerChildId: tab.container.childId,
            containerHidden: tab.container.hidden,
            containerWidgetId: tab.container.widgetId,
            fKey: functionKey,
            iconChildId: tab.iconChildId,
            iconSpriteId: tab.iconSpriteId,
            menuInserter: "KeyHandler.copy$keyPressed",
            row: tab.row,
            slotIndex: tab.slotIndex,
            sourceActions: tab.actions,
            tabId: tab.id,
            widgetId: tab.widgetId
          }
        })
      );
      event.preventDefault();
      return true;
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (dispatchFunctionKeySideTab(event)) {
        return;
      }
      if (updateArrowKeyState(event, true)) {
        setCameraMode("free");
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      updateArrowKeyState(event, false);
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [fixedClientLayout]);

  useEffect(() => {
    const onCamera = (event: Event): void => {
      const detail = (event as CustomEvent<{ readonly camera?: unknown }>).detail;
      if (isRuntimeCameraMode(detail?.camera)) {
        setCameraMode(detail.camera);
      }
    };
    const onCycle = (event: Event): void => {
      const detail = (event as CustomEvent<{ readonly cycle?: unknown }>).detail;
      if (typeof detail?.cycle === "number" && Number.isFinite(detail.cycle)) {
        setPlaying(false);
        setCycle(Math.max(0, Math.min(maxCycle, Math.trunc(detail.cycle))));
      }
    };
    window.addEventListener("nh-runtime-camera", onCamera);
    window.addEventListener("nh-runtime-cycle", onCycle);
    return () => {
      window.removeEventListener("nh-runtime-camera", onCamera);
      window.removeEventListener("nh-runtime-cycle", onCycle);
    };
  }, [maxCycle]);

  useEffect(() => {
    const onSpellbook = (event: Event): void => {
      const detail = (event as CustomEvent<{ readonly spellbookId?: unknown }>).detail;
      const spellbookId = detail?.spellbookId;
      if (!isNhSpellbookId(spellbookId) || !fixedClientLayout?.spellbookPanels[spellbookId]) {
        return;
      }
      setActiveSpellbookId(spellbookId);
      const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
      if (viewport) {
        viewport.dataset.activeSpellbookId = spellbookId;
        if (selectedSpell) {
          viewport.dataset.selectedSpellActionName = "";
          viewport.dataset.selectedSpellChildId = "";
          viewport.dataset.selectedSpellFlags = "";
          viewport.dataset.selectedSpellId = "";
          viewport.dataset.selectedSpellItemId = "";
          viewport.dataset.selectedSpellLabel = "";
          viewport.dataset.selectedSpellName = "";
          viewport.dataset.selectedSpellWidgetId = "";
          viewport.dataset.lastSpellSelectionClear = "spellbook-change";
        }
      }
      setSelectedSpell(null);
    };

    window.addEventListener("nh-runtime-spellbook", onSpellbook);
    return () => window.removeEventListener("nh-runtime-spellbook", onSpellbook);
  }, [fixedClientLayout, selectedSpell]);

  useEffect(() => {
    const clearRuntimeInventorySelection = (): void => {
      setSelectedInventoryItem(null);
      const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
      if (viewport) {
        viewport.dataset.selectedInventoryItemId = "";
        viewport.dataset.selectedInventoryItemName = "";
        viewport.dataset.selectedInventorySlot = "";
        viewport.dataset.selectedInventoryWidgetId = "";
        viewport.dataset.lastInventorySelectionClear = "inventory-reset";
      }
    };

    const onInventory = (event: Event): void => {
      const detail = (event as CustomEvent<{
        readonly clear?: unknown;
        readonly inventory?: unknown;
      }>).detail;
      if (detail?.clear === true) {
        supplyDelaysRef.current = createSupplyDelayState();
        itemActionQueueRef.current.clear();
        queuedPlayerCombatPacketsRef.current.length = 0;
        inventoryOverrideRef.current = null;
        setInventoryOverride(null);
        setPendingEquipSlotIndices(new Set());
        setPendingEquipmentRemoveSlotIds(new Set());
        clearRuntimeInventorySelection();
        return;
      }
      if (isRuntimeInventory(detail?.inventory)) {
        supplyDelaysRef.current = createSupplyDelayState();
        itemActionQueueRef.current.clear();
        queuedPlayerCombatPacketsRef.current.length = 0;
        const inventorySlots = normalizeNhInventorySlots(detail.inventory);
        inventoryOverrideRef.current = inventorySlots;
        setInventoryOverride(inventorySlots);
        setPendingEquipSlotIndices(new Set());
        setPendingEquipmentRemoveSlotIds(new Set());
        clearRuntimeInventorySelection();
      }
    };

    window.addEventListener("nh-runtime-inventory", onInventory);
    return () => window.removeEventListener("nh-runtime-inventory", onInventory);
  }, []);

  useEffect(() => {
    const onContextMenu = (event: Event): void => {
      const detail = (event as CustomEvent<{
        readonly actorId?: unknown;
        readonly tile?: unknown;
        readonly worldTile?: unknown;
        readonly x?: unknown;
        readonly y?: unknown;
      }>).detail;
      const actorId = detail?.actorId;
      const interactionSnapshot = runtimeInteractionSnapshotRef.current;
      const actor =
        actorId === "local-player" || actorId === "opponent"
          ? interactionSnapshot.actors.find((pose) => pose.actorId === actorId)
          : null;
      const worldTile = isNhWorldTile(detail?.worldTile) ? detail.worldTile : null;
      const tile = actor?.tile ?? (worldTile && collisionMap ? collisionMap.worldToSceneTile(worldTile) : detail?.tile);
      if (!isRuntimeTile(tile)) {
        return;
      }

      const viewportRect = fixedClientCssLayout?.viewportRect;
      if (!viewportRect) {
        return;
      }

      setContextMenu({
        x: typeof detail?.x === "number" && Number.isFinite(detail.x) ? detail.x : viewportRect.x + viewportRect.width / 2,
        y: typeof detail?.y === "number" && Number.isFinite(detail.y) ? detail.y : viewportRect.y + viewportRect.height / 2,
        entries: withNhCancelContextMenuEntry(
          actor && actor.actorId !== "local-player"
            ? actorPlayerContextEntries(actor, tile)
            : sceneContextEntries(tile)
        )
      });
    };

    window.addEventListener("nh-runtime-context-menu", onContextMenu);
    return () => window.removeEventListener("nh-runtime-context-menu", onContextMenu);
  }, [collisionMap, fixedClientCssLayout, sceneObjectPlacements, selectedInventoryItem, selectedSpell, visibleSnapshot]);

  useEffect(() => {
    if (!playing) {
      return;
    }

    const interval = window.setInterval(() => {
      setCycle((current) => (current >= maxCycle ? 0 : current + 1));
    }, playIntervalMs);

    return () => window.clearInterval(interval);
  }, [maxCycle, playIntervalMs, playing]);

  const activateManualActor = (
    patch: Pick<ManualActorState, "loadoutId" | "sequenceName"> & Partial<Pick<ManualActorState, "facingDegrees">>
  ): void => {
    const scene = ensureManualRuntimeScene();
    const nextCombatState = setRuntimePlayerCombatLoadout(scene.combatState, "local-player", patch.loadoutId);
    const nextAttackSetIndex = nextCombatState.actors["local-player"].attackSetIndex;
    const nextActor = {
      ...(manualControlRef.current ? manualActorRef.current : scene.localActor),
      ...patch,
      appearance: undefined,
      sequenceName: manualActorBaseSequenceName(
        patch.sequenceName,
        patch.loadoutId,
        inventoryEquipmentDefinitionsRef.current,
        weaponTypeDefinitionsRef.current,
        actorSequenceDefinitions
      )
    };
    manualCombatStateRef.current = nextCombatState;
    manualActorRef.current = nextActor;
    writeStoredAttackSetIndex(nextAttackSetIndex);
    setManualCombatState(nextCombatState);
    setPlaying(false);
    setFollowLive(false);
    setFollowTarget("local-player");
    setManualControl(true);
    setManualActor(nextActor);
  };

  const showClickCross = (position: { readonly x: number; readonly y: number }, color: NhClickCrossColor): void => {
    setClickCross({
      x: position.x,
      y: position.y,
      color,
      frame: 0,
      startedAt: performance.now()
    });
  };

  const clearSelectedInventoryItem = (reason: string): void => {
    if (!selectedInventoryItem) {
      return;
    }
    setSelectedInventoryItem(null);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.selectedInventoryItemId = "";
      viewport.dataset.selectedInventoryItemName = "";
      viewport.dataset.selectedInventorySlot = "";
      viewport.dataset.selectedInventoryWidgetId = "";
      viewport.dataset.lastInventorySelectionClear = reason;
    }
  };

  const clearSelectedSpell = (reason: string): void => {
    if (!selectedSpell) {
      return;
    }
    setSelectedSpell(null);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.selectedSpellActionName = "";
      viewport.dataset.selectedSpellChildId = "";
      viewport.dataset.selectedSpellFlags = "";
      viewport.dataset.selectedSpellId = "";
      viewport.dataset.selectedSpellItemId = "";
      viewport.dataset.selectedSpellLabel = "";
      viewport.dataset.selectedSpellName = "";
      viewport.dataset.selectedSpellWidgetId = "";
      viewport.dataset.lastSpellSelectionClear = reason;
    }
  };

  const clearSelectedTargetMode = (reason: string): boolean => {
    const hadSelection = Boolean(selectedInventoryItem || selectedSpell);
    clearSelectedInventoryItem(reason);
    clearSelectedSpell(reason);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport && hadSelection) {
      viewport.dataset.lastSelectedTargetModeCancel = reason;
      viewport.dataset.lastTileCommandSource = "";
      viewport.dataset.lastTileCommandTileX = "";
      viewport.dataset.lastTileCommandTileZ = "";
    }
    return hadSelection;
  };

  const ensureManualRuntimeScene = (): {
    readonly localActor: ManualActorState;
    readonly opponentActor: ManualActorState;
    readonly combatState: RuntimePlayerCombatState;
  } => {
    if (manualControlRef.current) {
      const syncedCombatState = syncRuntimePlayerCombatStateToInput(manualCombatStateRef.current, {
        tiles: {
          "local-player": manualActorRef.current.tile,
          opponent: manualOpponentRef.current.tile
        },
        loadouts: {
          "local-player": manualActorRef.current.loadoutId,
          opponent: manualOpponentRef.current.loadoutId
        },
        levels: {
          "local-player": hudCombatLevelsRef.current
        },
        prayerPoints: {
          "local-player": {
            current: visibleSnapshotRef.current.hud.prayer,
            fixed: visibleSnapshotRef.current.hud.prayerMax
          }
        },
        prayers: {
          "local-player": runtimePrayerIdsFromNhStates(hudPrayersRef.current)
        },
        clientCycle: Math.floor(performance.now() / NH_CLIENT_CYCLE_MS)
      });
      manualCombatStateRef.current = syncedCombatState;
      setManualCombatState(syncedCombatState);
      return {
        localActor: manualActorRef.current,
        opponentActor: manualOpponentRef.current,
        combatState: syncedCombatState
      };
    }

    const localActor = collisionMap
      ? snapManualActorToCollision(manualActorFromSnapshot(visibleSnapshot), collisionMap)
      : manualActorFromSnapshot(visibleSnapshot);
    const opponentActor = collisionMap
      ? snapManualActorToCollision(manualActorFromSnapshot(visibleSnapshot, "opponent", "opponent"), collisionMap)
      : manualActorFromSnapshot(visibleSnapshot, "opponent", "opponent");
    const combatState = createRuntimePlayerCombatState({
      localTile: localActor.tile,
      opponentTile: opponentActor.tile,
      localLoadoutId: localActor.loadoutId,
      opponentLoadoutId: opponentActor.loadoutId,
      localAttackSetIndex: visibleSnapshot.hud.attackSet ?? 0,
      localLevels: runtimeCombatLevelsFromHud(visibleSnapshot.hud),
      localPrayers: runtimePrayerIdsFromNhStates(visibleSnapshot.hud.prayers),
      localSpecialEnergy: visibleSnapshot.hud.specialEnergy,
      combatStartTick: runtimePlayerCombatFightCountdownTicks
    });
    manualActorRef.current = localActor;
    manualOpponentRef.current = opponentActor;
    manualCombatStateRef.current = combatState;
    manualOpponentObservedSelfMovementRef.current = manualPolicyStationaryMovementView;
    // Source: NhStakerBot.resetCombatState() ends the active reward episode before a new target can start one.
    manualOpponentFightEngagedRef.current = false;
    manualOpponentTargetTrackingRef.current = emptyRuntimePolicyTargetTrackingState;
    manualOpponentPolicyEpisodeStartTickRef.current = combatState.tick;
    manualOpponentNextPolicyRepositionTickRef.current = 0;
    setManualOpponent(opponentActor);
    setManualCombatState(combatState);
    return { localActor, opponentActor, combatState };
  };

  const routeRuntimeCombatActor = (
    request: RuntimePlayerCombatRouteRequest,
    collision: NhSceneCollision
  ): void => {
    const combatActor = manualCombatStateRef.current.actors[request.actorId];
    const movementStatus = movementGate(combatActor.locks, manualCombatStateRef.current.tick);
    if (movementStatus.blocked) {
      // Source: TargetRoute.afterMovement() resets combat when route movement
      // cannot establish withinDistance; a frozen melee step-in attempt must not
      // leave a stale target that fires after the freeze block.
      const nextCombatState = resetRuntimePlayerCombatActorTarget(manualCombatStateRef.current, request.actorId);
      manualCombatStateRef.current = nextCombatState;
      setManualCombatState(nextCombatState);
      if (request.actorId === "local-player") {
        const nextActor = clearManualActorMovementRoute(manualActorRef.current);
        manualActorRef.current = nextActor;
        setManualActor(nextActor);
      } else {
        const nextActor = clearManualActorMovementRoute(manualOpponentRef.current);
        manualOpponentRef.current = nextActor;
        setManualOpponent(nextActor);
      }
      const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
      if (viewport) {
        viewport.dataset.lastRuntimeCombatRouteBlockedActor = request.actorId;
        viewport.dataset.lastRuntimeCombatRouteBlockedReason = movementStatus.reason;
      }
      return;
    }

    const targetActor = request.targetId === "local-player" ? manualActorRef.current : manualOpponentRef.current;
    const targetTile = targetActor?.tile ?? request.targetTile;
    const route = (current: ManualActorState): ManualActorState =>
      routeManualActorToTarget(current, targetTile, request.attackRange, collision, performance.now(), false).actor;
    if (request.actorId === "local-player") {
      const nextActor = route(manualActorRef.current);
      manualActorRef.current = nextActor;
      setManualActor(nextActor);
    } else {
      const nextActor = route(manualOpponentRef.current);
      manualOpponentRef.current = nextActor;
      setManualOpponent(nextActor);
    }
  };

  const setManualOpponentFightEngaged = (engaged: boolean, tick: number = manualCombatStateRef.current.tick): void => {
    if (engaged && !manualOpponentFightEngagedRef.current) {
      manualOpponentPolicyEpisodeIdRef.current += 1;
      manualOpponentPolicyEpisodeStartTickRef.current = tick;
      // Source: NhStakerBot.refreshDelayedOpponentInfo() records live info immediately
      // but exposes OpponentInfoSnapshot.unknown() until a one-tick-old snapshot exists.
      manualOpponentObservedLocalAppearanceRef.current = manualPolicyUnknownOpponentInfoAppearanceView(
        manualOpponentObservedLocalAppearanceRef.current
      );
      manualOpponentObservedSelfMovementRef.current = manualPolicyStationaryMovementView;
    }
    manualOpponentFightEngagedRef.current = engaged;
    manualOpponentTargetTrackingRef.current = {
      ...manualOpponentTargetTrackingRef.current,
      fightEngaged: engaged
    };
  };

  const applyRuntimeFullFightResetAfterRespawn = (
    beforeRespawnState: RuntimePlayerCombatState,
    afterRespawnState: RuntimePlayerCombatState
  ): {
    readonly combatState: RuntimePlayerCombatState;
    readonly localActor: ManualActorState;
    readonly opponentActor: ManualActorState;
  } | null => {
    const respawned =
      runtimeCombatActorRespawnedForFreshFightReset(
        beforeRespawnState.actors["local-player"],
        afterRespawnState.actors["local-player"],
        beforeRespawnState.tick
      ) ||
      runtimeCombatActorRespawnedForFreshFightReset(
        beforeRespawnState.actors.opponent,
        afterRespawnState.actors.opponent,
        beforeRespawnState.tick
      );
    if (!respawned) {
      return null;
    }

    // Source: PlayerCombat.restore() and NhStakerBot.prepareFreshState(true) restore stats,
    // prayer, special, freeze/locks, combat targets, and supplies. The trainer's visible
    // inventory/equipment containers are client-side mirrors, so the rematch reset restores
    // them on the same respawn transition instead of leaving eaten/worn items depleted.
    const savedSetup = readTemporarySavedSetupSnapshot();
    const localLoadoutId = savedSetup?.loadoutId ?? RUNTIME_NH_STAKE_LOADOUT_ID;
    const localInventorySlots = savedSetup
      ? normalizeNhInventorySlots(savedSetup.inventory)
      : runtimeNhStakeInventorySlots();
    const localEquipmentItems = savedSetup
      ? new Map(savedSetup.equipment)
      : runtimeNhStakeEquipmentItems();
    const opponentInventorySlots = runtimeNhStakeInventorySlots();
    const opponentEquipmentItems = runtimeNhStakeEquipmentItems();
    const localVisibleEquipment = visibleEquipmentFromRuntimeItemIdsBySlot(
      localEquipmentItems,
      inventoryItemDefinitionsRef.current
    );
    const opponentVisibleEquipment = visibleEquipmentFromRuntimeItemIdsBySlot(
      opponentEquipmentItems,
      inventoryItemDefinitionsRef.current
    );
    const localInventoryItems = visibleEquipmentItemsFromRuntimeInventory(
      localInventorySlots,
      inventoryItemDefinitionsRef.current
    );
    const opponentInventoryItems = visibleEquipmentItemsFromRuntimeInventory(
      opponentInventorySlots,
      inventoryItemDefinitionsRef.current
    );
    const localSupplies = runtimeSuppliesFromInventorySlots(localInventorySlots);
    const opponentSupplies = runtimeSuppliesFromInventorySlots(opponentInventorySlots);
    const localGearProfile = inferNhSelectedGearProfile({
      equipment: localVisibleEquipment,
      inventoryItems: localInventoryItems
    });
    const opponentGearProfile = inferNhSelectedGearProfile({
      equipment: opponentVisibleEquipment,
      inventoryItems: opponentInventoryItems
    });
    const localSpawn = initialManualActorSpawnRef.current;
    const opponentSpawn = initialManualOpponentSpawnRef.current;
    const localAttackSetIndex =
      (typeof window === "undefined" ? null : readStoredAttackSetIndex()) ??
      afterRespawnState.actors["local-player"].attackSetIndex;
    const freshBaseState = createRuntimePlayerCombatState({
      localTile: localSpawn.tile,
      opponentTile: opponentSpawn.tile,
      localLoadoutId,
      opponentLoadoutId: RUNTIME_NH_STAKE_LOADOUT_ID,
      localAttackSetIndex,
      opponentAttackSetIndex: 0,
      localLevels: runtimePlayerCombatDefaultLevels,
      opponentLevels: runtimePlayerCombatDefaultLevels,
      localFixedLevels: runtimePlayerCombatDefaultLevels,
      opponentFixedLevels: runtimePlayerCombatDefaultLevels,
      localPrayerPoints: { current: 99, fixed: 99 },
      opponentPrayerPoints: { current: 99, fixed: 99 },
      localSupplies,
      opponentSupplies,
      localSpecialEnergy: 100,
      opponentSpecialEnergy: 100,
      combatStartTick: NH_TRAINER_MANUAL_START_PENDING_TICK,
      seed: afterRespawnState.randomSeed
    });
    const syncedFreshState = syncRuntimePlayerCombatStateToInput(freshBaseState, {
      tiles: {
        "local-player": localSpawn.tile,
        opponent: opponentSpawn.tile
      },
      loadouts: {
        "local-player": localLoadoutId,
        opponent: RUNTIME_NH_STAKE_LOADOUT_ID
      },
      equipment: {
        "local-player": localVisibleEquipment,
        opponent: opponentVisibleEquipment
      },
      gearProfiles: {
        "local-player": localGearProfile,
        opponent: opponentGearProfile
      },
      clientCycle: Math.floor(performance.now() / NH_CLIENT_CYCLE_MS)
    });
    const nextCombatState: RuntimePlayerCombatState = {
      ...syncedFreshState,
      tick: afterRespawnState.tick,
      combatStartTick: NH_TRAINER_MANUAL_START_PENDING_TICK,
      randomSeed: afterRespawnState.randomSeed,
      events: afterRespawnState.events
    };
    const localAppearance = runtimeAppearanceFromEquipmentItems(
      localEquipmentItems,
      runtimeLoadoutAppearance(localLoadoutId)
    );
    const opponentAppearance = runtimeAppearanceFromEquipmentItems(
      opponentEquipmentItems,
      runtimeLoadoutAppearance(RUNTIME_NH_STAKE_LOADOUT_ID)
    );
    const nextLocalActor: ManualActorState = {
      ...localSpawn,
      loadoutId: localLoadoutId,
      appearance: localAppearance,
      sequenceName: manualActorBaseSequenceName(
        "idle",
        localLoadoutId,
        inventoryEquipmentDefinitionsRef.current,
        weaponTypeDefinitionsRef.current,
        actorSequenceDefinitionsRef.current
      )
    };
    const nextOpponentActor: ManualActorState = {
      ...opponentSpawn,
      loadoutId: RUNTIME_NH_STAKE_LOADOUT_ID,
      appearance: opponentAppearance,
      sequenceName: manualActorBaseSequenceName(
        "idle",
        RUNTIME_NH_STAKE_LOADOUT_ID,
        inventoryEquipmentDefinitionsRef.current,
        weaponTypeDefinitionsRef.current,
        actorSequenceDefinitionsRef.current
      )
    };

    if (itemActionProcessingTimerRef.current !== null) {
      window.clearTimeout(itemActionProcessingTimerRef.current);
      itemActionProcessingTimerRef.current = null;
    }
    itemActionQueueRef.current.clear();
    queuedPlayerCombatPacketsRef.current.length = 0;
    supplyDelaysRef.current = createSupplyDelayState();
    hudCombatLevelsRef.current = runtimePlayerCombatDefaultLevels;
    hudPrayersRef.current = {} as NhPrayerStates;
    inventoryOverrideRef.current = localInventorySlots;
    groundItemsRef.current = [];
    pendingGroundItemPickupRef.current = null;
    equipmentOverrideRef.current = localEquipmentItems;
    manualCombatStateRef.current = nextCombatState;
    manualFightStartPendingRef.current = true;
    manualActorRef.current = nextLocalActor;
    manualOpponentRef.current = nextOpponentActor;
    manualOpponentFightEngagedRef.current = false;
    manualOpponentTargetTrackingRef.current = emptyRuntimePolicyTargetTrackingState;
    manualOpponentPolicyEpisodeStartTickRef.current = nextCombatState.tick;
    manualOpponentNextPolicyRepositionTickRef.current = 0;
    manualOpponentObservedSelfMovementRef.current = manualPolicyStationaryMovementView;
    manualOpponentObservedLocalAppearanceRef.current = manualPolicyActorAppearanceView(
      nextLocalActor,
      nextCombatState.actors["local-player"],
      nextCombatState.tick,
      localEquipmentItems,
      inventoryItemDefinitionsRef.current,
      [],
      manualPolicyStationaryMovementView,
      localInventorySlots
    );
    clearSelectedInventoryItem("fresh-fight-reset");
    clearSelectedSpell("fresh-fight-reset");
    ensureLocalActorEquipmentModel(localEquipmentItems, localLoadoutId, "local-player");
    ensureLocalActorEquipmentModel(opponentEquipmentItems, RUNTIME_NH_STAKE_LOADOUT_ID, "opponent");
    unstable_batchedUpdates(() => {
      setPlaying(false);
      setFollowLive(false);
      setManualControl(true);
      setFollowTarget("local-player");
      setInventoryOverride(localInventorySlots);
      setGroundItems([]);
      setEquipmentOverride(() => localEquipmentItems);
      setPendingEquipSlotIndices(new Set());
      setPendingEquipmentRemoveSlotIds(new Set());
      setMinimapDestinationTile(null);
      setContextMenu(null);
      setHudOverride((current) => ({
        ...(current?.attackSet === undefined ? {} : { attackSet: current.attackSet }),
        ...(current?.autoRetaliate === undefined ? {} : { autoRetaliate: current.autoRetaliate }),
        prayers: {} as NhPrayerStates
      }));
      setManualFightStartPending(true);
      setManualCombatState(nextCombatState);
      setManualActor(nextLocalActor);
      setManualOpponent(nextOpponentActor);
      setTemporarySetupStatus(savedSetup ? "Saved setup restored" : "NH stake restored");
    });

    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastFreshFightReset = "respawn";
      viewport.dataset.lastFreshFightResetTick = String(nextCombatState.tick);
      viewport.dataset.lastFreshFightResetCombatStartTick = String(nextCombatState.combatStartTick);
      viewport.dataset.lastFreshFightResetRequiresStart = "true";
      viewport.dataset.lastFreshFightResetLocalSetup = savedSetup ? "saved-setup" : "nh-stake";
      viewport.dataset.lastFreshFightResetInventoryCount = String(localInventorySlots.filter(Boolean).length);
      viewport.dataset.lastFreshFightResetEquipmentCount = String(localEquipmentItems.size);
      viewport.dataset.lastFreshFightResetOpponentEquipmentCount = String(opponentEquipmentItems.size);
      viewport.dataset.lastFreshFightResetOpponentSupplies = JSON.stringify(nextCombatState.actors.opponent.supplies);
      viewport.dataset.lastFreshFightResetOpponentInventorySupplies = JSON.stringify(opponentSupplies);
      viewport.dataset.lastFreshFightResetSource = "PlayerCombat.restore/NhStakerBot.prepareFreshState + client container rematch reset";
    }

    return {
      combatState: nextCombatState,
      localActor: nextLocalActor,
      opponentActor: nextOpponentActor
    };
  };

  const resolveManualOpponentPolicyTick = (combatState: RuntimePlayerCombatState): ManualOpponentPolicyTickGate => {
    if (manualFightStartPendingRef.current || runtimePlayerCombatIsFightCountdownActive(combatState)) {
      // Source: the trainer start gate is a local duel wrapper around the Nh
      // combat loop. Do not let the NH policy spend supplies, switch gear, or
      // issue attackTarget() before "Go"; PlayerCombat already rejects attacks
      // during countdown, and the policy should not consume the starting setup.
      return {
        shouldRun: false,
        combatState
      };
    }

    const local = combatState.actors["local-player"];
    const opponent = combatState.actors.opponent;
    const selfCurrentTargetSignal = opponent.targetId === "local-player";
    const currentTargetSignal = selfCurrentTargetSignal || local.targetId === "opponent";
    const pressureTargetSignal =
      local.lastTargetId === "opponent" || runtimePolicyRecentManualIncomingPressureSignal(combatState);
    const directCombatSignal = runtimePolicyRecentManualDirectCombatSignal(combatState);
    const engagedSignal = currentTargetSignal || runtimePolicyRecentManualCombatSignal(combatState);
    const underPressureSignal = pressureTargetSignal;
    const recentCombatSignal =
      currentTargetSignal ||
      opponent.lastTargetId === "local-player" ||
      local.lastTargetId === "opponent" ||
      runtimePolicyRecentManualCombatSignal(combatState);
    const canAttackSignal = runtimeManualPolicyCanAttackSignal({
      attacker: opponent,
      target: local,
      tick: combatState.tick,
      collision: collisionMapRef.current
    });
    const tracking = resolveRuntimePolicyTargetTracking({
      state: manualOpponentTargetTrackingRef.current,
      tick: combatState.tick,
      localDead: isRuntimePlayerCombatActorDead(local, combatState.tick),
      opponentDead: isRuntimePlayerCombatActorDead(opponent, combatState.tick),
      distance: runtimePlayerCombatDistance(opponent.tile, local.tile, NH_TILE_WORLD_UNITS),
      selfCurrentTargetSignal,
      currentTargetSignal,
      directCombatSignal,
      pressureTargetSignal,
      recentCombatSignal,
      engagedSignal,
      underPressureSignal,
      canAttackSignal,
      practiceTargetVisible: manualControlRef.current
    });

    manualOpponentTargetTrackingRef.current = tracking.state;
    setManualOpponentFightEngaged(tracking.state.fightEngaged, combatState.tick);
    let nextCombatState = combatState;
    if (!tracking.shouldRunPolicy && (tracking.state.fightEngaged || manualOpponentFightEngagedRef.current)) {
      // Source: NhStakerBot.run() clears style stall and delayed opponent info
      // during the no-target grace window before resetCombatState() fires.
      manualOpponentObservedLocalAppearanceRef.current = manualPolicyUnknownOpponentInfoAppearanceView(
        manualOpponentObservedLocalAppearanceRef.current
      );
      manualOpponentObservedSelfMovementRef.current = manualPolicyStationaryMovementView;
      nextCombatState = clearRuntimePlayerCombatActorPolicyNoTargetGrace(nextCombatState, "opponent");
    }
    if (tracking.resetReposition) {
      manualOpponentNextPolicyRepositionTickRef.current = 0;
      const resetCollision = collisionMapRef.current;
      const resetOpponentActor = manualOpponentRef.current;
      const opponentSpawn = initialManualOpponentSpawnRef.current;
      const actorDead = isRuntimePlayerCombatActorDead(opponent, combatState.tick);
      const targetDead = isRuntimePlayerCombatActorDead(local, combatState.tick);
      const resetMovementStatus = movementGate(opponent.locks, combatState.tick);
      const freshFightReset = shouldRuntimePolicyResetForFreshFight({
        resetReposition: tracking.resetReposition,
        actorDead,
        targetDead
      });
      const routeResetToSpawn =
        resetCollision !== null &&
        shouldRuntimePolicyRouteResetToSpawn({
          resetReposition: tracking.resetReposition,
          actorDead,
          targetDead,
          movementBlocked: resetMovementStatus.blocked,
          movementPending: manualActorHasPendingMovement(resetOpponentActor),
          distanceFromSpawn: runtimePlayerCombatDistance(
            resetOpponentActor.tile,
            opponentSpawn.tile,
            NH_TILE_WORLD_UNITS
          )
        });
      nextCombatState = freshFightReset
        ? resetRuntimePlayerCombatActorPolicyFreshFight(nextCombatState, "opponent", {
            tile: opponentSpawn.tile,
            gearProfile: opponent.gearProfile
          })
        : resetRuntimePlayerCombatActorPolicyDisengage(nextCombatState, "opponent");
      manualCombatStateRef.current = nextCombatState;
      if (freshFightReset) {
        const freshOpponent = nextCombatState.actors.opponent;
        const teleportedOpponent = teleportManualActorToTile(
          {
            ...resetOpponentActor,
            loadoutId: freshOpponent.loadoutId,
            appearance: runtimeAppearanceFromEquipmentItems(
              runtimeItemIdsBySlotFromVisibleEquipment(freshOpponent.equipment),
              runtimeLoadoutAppearance(freshOpponent.loadoutId)
            )
          },
          opponentSpawn.tile
        );
        manualOpponentRef.current = teleportedOpponent;
        setManualOpponent(teleportedOpponent);
      } else if (routeResetToSpawn && resetCollision) {
        const routedOpponent = routeManualActor(
          resetOpponentActor,
          opponentSpawn.tile,
          resetCollision,
          undefined,
          performance.now()
        ).actor;
        manualOpponentRef.current = routedOpponent;
        setManualOpponent(routedOpponent);
      }
    }

    return {
      shouldRun: tracking.shouldRunPolicy,
      combatState: nextCombatState
    };
  };

  const queueManualOpponentCombatResponse = (
    combatState: RuntimePlayerCombatState,
    localActor: ManualActorState,
    opponentActor: ManualActorState,
    opponentSelfMovement: ManualPolicyActorMovementView = manualOpponentObservedSelfMovementRef.current
  ): ManualOpponentCombatResponse => {
    const observedLocalAppearance = manualOpponentObservedLocalAppearanceRef.current;
    const policyMovementCollision = collisionMapRef.current;
    const opponentPolicyInventorySlots = runtimeNhStakeInventorySlotsForSupplies(combatState.actors.opponent.supplies);
    const opponentPolicyInventoryItems = visibleEquipmentItemsFromRuntimeInventory(
      opponentPolicyInventorySlots,
      inventoryItemDefinitionsRef.current
    );
    // Source: NhStakerBot.captureObservation() records selfDx/selfDy from the bot's own
    // current-vs-last server tile delta; only the opponent/local-player view is delayed.
    const observedOpponentSelfMovement = opponentSelfMovement;
    const result = applyRuntimeOpponentPolicyAction({
      state: combatState,
      controller: manualOpponentPolicyController ?? scriptedNhController,
      localActor: {
        tile: observedLocalAppearance.tile,
        loadoutId: observedLocalAppearance.loadoutId,
        equipment: observedLocalAppearance.equipment,
        inventoryItems: observedLocalAppearance.inventoryItems,
        inventorySlots: observedLocalAppearance.inventorySlots,
        activePrayers: observedLocalAppearance.activePrayers,
        stats: observedLocalAppearance.stats,
        locks: observedLocalAppearance.locks,
        movedThisTick: observedLocalAppearance.movedThisTick,
        lastMoveDx: observedLocalAppearance.lastMoveDx,
        lastMoveDy: observedLocalAppearance.lastMoveDy,
        observedInfoKnown: observedLocalAppearance.observedInfoKnown
      },
      opponentActor: {
        tile: opponentActor.tile,
        loadoutId: opponentActor.loadoutId,
        equipment: combatState.actors.opponent.equipment,
        inventoryItems: opponentPolicyInventoryItems,
        inventorySlots: opponentPolicyInventorySlots,
        gearProfile: combatState.actors.opponent.gearProfile,
        movedThisTick: observedOpponentSelfMovement.movedThisTick,
        lastMoveDx: observedOpponentSelfMovement.lastMoveDx,
        lastMoveDy: observedOpponentSelfMovement.lastMoveDy
      },
      allowSourceLoadoutSync: false,
      canStep: policyMovementCollision
        ? (from, to, stepContext) => {
            // Source: NhStakerBot.tryStep() checks isCombatTileAllowed(candidate)
            // before accepting movement, preventing wilderness-edge/safe-zone leaks.
            if (
              (stepContext.movementIntent === "pressure" || stepContext.movementIntent === "stand_under") &&
              !nhNhBotCombatTileAllowed(policyMovementCollision.sceneToWorldTile(stepContext.targetTile))
            ) {
              return false;
            }
            if (!nhNhBotCombatTileAllowed(policyMovementCollision.sceneToWorldTile(to))) {
              return false;
            }
            if (!policyMovementCollision.canStep(from, to)) {
              return false;
            }
            const targetTile = stepContext.targetTile;
            if (sameNhTile(to, targetTile)) {
              return stepContext.allowTargetTile;
            }
            // Source: NhStakerBot.tryStep() requires ProjectileRoute.allow(candidate, target)
            // before applying manual policy repositioning. This keeps tree/object LOS from
            // letting the TS bot step into tiles the Java trainer would reject.
            return nhSceneProjectileRouteClear(to, targetTile, policyMovementCollision);
          }
        : undefined,
      targetRouteStep: policyMovementCollision
        ? (from, target, distance) => {
            // Source: NhStakerBot.routeToOpponentIfAllowed() checks the target
            // combat tile before RouteFinder.routeEntity(opponent) builds the path.
            if (!nhNhBotCombatTileAllowed(policyMovementCollision.sceneToWorldTile(target))) {
              return null;
            }
            const routeSegment = findNhTargetRouteWaypoints(from, target, distance, policyMovementCollision);
            const routePath = expandNhManualRoutePath(from, routeSegment, policyMovementCollision);
            return routePath[0] ?? null;
          }
        : undefined,
      tileRouteStep: policyMovementCollision
        ? (from, target, stepContext) => {
            // Source: NhStakerBot.attemptStandUnder() uses RouteFinder.routeAbsolute()
            // to the frozen target's exact tile after the same target combat-tile gate.
            if (!nhNhBotCombatTileAllowed(policyMovementCollision.sceneToWorldTile(target))) {
              return null;
            }
            const routeSegment = findNhTileRouteWaypoints(from, target, policyMovementCollision);
            const routePath = expandNhManualRoutePath(from, routeSegment, policyMovementCollision);
            const next = routePath[0] ?? null;
            if (next && sameNhTile(next, target) && !stepContext.allowTargetTile) {
              return null;
            }
            return next;
          }
        : undefined,
      projectileLineOfSight: policyMovementCollision
        ? (from, target) => nhSceneProjectileRouteClear(from, target, policyMovementCollision)
        : undefined,
      inPvpCombatArea: policyMovementCollision
        ? nhNhBotCombatTileAllowed(policyMovementCollision.sceneToWorldTile(opponentActor.tile))
        : undefined,
      nextRepositionTick: manualOpponentNextPolicyRepositionTickRef.current,
      rewardEpisodeId: manualOpponentPolicyEpisodeIdRef.current,
      rewardEpisodeActive: manualOpponentFightEngagedRef.current,
      rewardEpisodeStartTick: manualOpponentPolicyEpisodeStartTickRef.current,
      tileScale: NH_TILE_WORLD_UNITS
    });
    manualOpponentNextPolicyRepositionTickRef.current =
      result.nextRepositionTick ?? manualOpponentNextPolicyRepositionTickRef.current;
    let nextOpponentActor = applyManualOpponentPolicyActorResult(opponentActor, result, performance.now());
    if (result.movementBlockedReason === "left-pvp" && policyMovementCollision) {
      const leftPvpMovementStatus = movementGate(result.state.actors.opponent.locks, result.state.tick);
      const opponentSpawn = initialManualOpponentSpawnRef.current;
      if (
        shouldRuntimePolicyRouteResetToSpawn({
          resetReposition: true,
          actorDead: isRuntimePlayerCombatActorDead(result.state.actors.opponent, result.state.tick),
          targetDead: isRuntimePlayerCombatActorDead(result.state.actors["local-player"], result.state.tick),
          movementBlocked: leftPvpMovementStatus.blocked,
          movementPending: manualActorHasPendingMovement(nextOpponentActor),
          distanceFromSpawn: runtimePlayerCombatDistance(
            nextOpponentActor.tile,
            opponentSpawn.tile,
            NH_TILE_WORLD_UNITS
          )
        })
      ) {
        nextOpponentActor = routeManualActor(
          nextOpponentActor,
          opponentSpawn.tile,
          policyMovementCollision,
          undefined,
          performance.now()
        ).actor;
      }
    }

    return {
      combatState: result.state,
      opponentActor: nextOpponentActor,
      policyAction: result.action,
      policyEffectiveAction: result.effectiveAction,
      policyControllerId: result.controllerId,
      policyContext: result.context,
      policyObservedLocalTile: observedLocalAppearance.tile,
      policyActualLocalTile: localActor.tile,
      policyObservedLocalLoadoutId: observedLocalAppearance.loadoutId,
      policyActualLocalLoadoutId: localActor.loadoutId,
      policyObservedLocalPrayers: observedLocalAppearance.activePrayers,
      policyActualLocalPrayers: combatState.actors["local-player"].activePrayers,
      policyObservedLocalHitpoints: observedLocalAppearance.stats.hitpoints.current,
      policyActualLocalHitpoints: combatState.actors["local-player"].hitpoints,
      policyObservedLocalFrozen: runtimePolicyLocksFrozenAtTick(observedLocalAppearance.locks, combatState.tick),
      policyActualLocalFrozen: runtimePolicyLocksFrozenAtTick(combatState.actors["local-player"].locks, combatState.tick),
      policyObservedLocalMovedThisTick: observedLocalAppearance.movedThisTick,
      policyObservedLocalLastMoveDx: observedLocalAppearance.lastMoveDx,
      policyObservedLocalLastMoveDy: observedLocalAppearance.lastMoveDy,
      policyObservedSelfMovedThisTick: observedOpponentSelfMovement.movedThisTick,
      policyObservedSelfLastMoveDx: observedOpponentSelfMovement.lastMoveDx,
      policyObservedSelfLastMoveDy: observedOpponentSelfMovement.lastMoveDy,
      policyMovementApplied: result.opponentMovedThisTick,
      policyMovementBlockedReason: result.movementBlockedReason,
      policyMovedThisTick: result.opponentMovedThisTick,
      policyLastMoveDx: result.opponentLastMoveDx,
      policyLastMoveDy: result.opponentLastMoveDy,
      policyNextRepositionTick: result.nextRepositionTick,
      policyStrippedEquipmentSlots: result.strippedEquipmentSlots,
      consumedSupplies: result.consumedSupplies
    };
  };

  const blockPlayerCombatCommandDuringCountdown = (
    kind: "attack" | "spell",
    position: { readonly x: number; readonly y: number },
    spellId?: RuntimePlayerCombatSpellId
  ): boolean => {
    const combatState = manualCombatStateRef.current;
    if (!manualFightStartPendingRef.current && !runtimePlayerCombatIsFightCountdownActive(combatState)) {
      return false;
    }

    clearSelectedInventoryItem("fight-countdown");
    clearSelectedSpell("fight-countdown");
    setPlaying(false);
    setFollowLive(false);
    setManualControl(true);
    setFollowTarget("local-player");
    showClickCross(position, "red");

    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastPlayerCombatBlocked = manualFightStartPendingRef.current ? "manual-start-pending" : "fight-countdown";
      viewport.dataset.lastPlayerCombatBlockedKind = kind;
      viewport.dataset.lastPlayerCombatBlockedSpellId = spellId ?? "";
      viewport.dataset.lastPlayerCombatBlockedUntilTick = String(combatState.combatStartTick);
      viewport.dataset.lastPlayerCombatBlockedAtTick = String(combatState.tick);
      viewport.dataset.lastPlayerCombatCountdownLabel = manualFightStartPendingRef.current
        ? "Start"
        : runtimePlayerCombatFightCountdownLabel(combatState) ?? "";
    }

    return true;
  };

  const applyPlayerAttackCommand = (
    entry: NhPlayerContextMenuEntry<RuntimeTile>,
    position: { readonly x: number; readonly y: number },
    source: "immediate" | "queued" = "immediate"
  ): void => {
    clearSelectedInventoryItem("player-attack");
    clearSelectedSpell("player-attack");
    const scene = ensureManualRuntimeScene();
    if (runtimePlayerCombatIsFightCountdownActive(scene.combatState)) {
      blockPlayerCombatCommandDuringCountdown("attack", position);
      return;
    }
    setManualOpponentFightEngaged(true, scene.combatState.tick);
    const nextCombatState = requestRuntimePlayerCombatAttack(scene.combatState, "local-player", "opponent");
    const localActorSource = manualControlRef.current ? manualActorRef.current : scene.localActor;
    const opponentActorSource = manualControlRef.current ? manualOpponentRef.current : scene.opponentActor;
    const nextLocalActor = manualActorFacingTarget(localActorSource, opponentActorSource);
    const nextOpponentActor = opponentActorSource;
    manualCombatStateRef.current = nextCombatState;
    manualActorRef.current = nextLocalActor;
    manualOpponentRef.current = nextOpponentActor;
    setPlaying(false);
    setFollowLive(false);
    setManualControl(true);
    setFollowTarget("local-player");
    setManualCombatState(nextCombatState);
    setManualActor(nextLocalActor);
    setManualOpponent(nextOpponentActor);
    if (source === "immediate") {
      showClickCross(position, "red");
    }
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastPlayerAttackCommand = entry.actionText;
      viewport.dataset.lastPlayerAttackResolvedSource = source;
      viewport.dataset.lastPlayerQueuedForTickProcessed = source === "queued" ? "true" : "false";
      viewport.dataset.lastPlayerAttackTargetTileX = String(entry.targetTile.x);
      viewport.dataset.lastPlayerAttackTargetTileZ = String(entry.targetTile.z);
      viewport.dataset.lastManualOpponentPolicyTickSource = "deferred-to-game-tick";
    }
  };

  const queuePlayerAttackAfterPendingItemPackets = (
    entry: NhPlayerContextMenuEntry<RuntimeTile>,
    position: { readonly x: number; readonly y: number }
  ): boolean => {
    const pendingItemPackets = itemActionQueueRef.current.snapshot();
    if (pendingItemPackets.length === 0) {
      return false;
    }

    const queuedAtMs = performance.now();
    const readyAtMs = nextNhGameTickAt(runtimeTickOriginMsRef.current, queuedAtMs);
    queuedPlayerCombatPacketsRef.current.push({
      kind: "attack",
      entry,
      position,
      queuedAtMs,
      readyAtMs
    });

    clearSelectedInventoryItem("player-attack");
    clearSelectedSpell("player-attack");
    setPlaying(false);
    setFollowLive(false);
    showClickCross(position, "red");
    setMinimapDestinationTile(null);

    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      // Source: Nh MessageDecoder keeps incoming packets in insertion order, and Player.checkLogout()
      // calls decoder.process(this, 250) before Player.process() combat/movement handling. If an inventory
      // equip packet is already waiting, the following attack packet must resolve after it on that game tick.
      viewport.dataset.lastPlayerQueuedForTick = "true";
      viewport.dataset.lastPlayerQueuedAfterPendingInventory = "true";
      viewport.dataset.lastPlayerQueuedPendingItemCount = String(pendingItemPackets.length);
      viewport.dataset.lastPlayerQueuedReadyAtMs = String(readyAtMs);
      viewport.dataset.lastPlayerQueuedAtMs = String(queuedAtMs);
      viewport.dataset.lastPlayerAttackResolvedSource = "queued-pending";
      viewport.dataset.lastPlayerQueuedForTickProcessed = "false";
      viewport.dataset.lastTileCommandSource = "";
      viewport.dataset.lastTileCommandTileX = "";
      viewport.dataset.lastTileCommandTileZ = "";
    }

    scheduleReadyItemActionProcessing();
    return true;
  };

  const issuePlayerAttackCommand = (
    entry: NhPlayerContextMenuEntry<RuntimeTile>,
    position: { readonly x: number; readonly y: number }
  ): void => {
    if (blockPlayerCombatCommandDuringCountdown("attack", position)) {
      return;
    }
    if (queuePlayerAttackAfterPendingItemPackets(entry, position)) {
      return;
    }
    applyPlayerAttackCommand(entry, position);
  };

  const applyPlayerSpellCommand = (
    entry: NhPlayerContextMenuEntry<RuntimeTile>,
    position: { readonly x: number; readonly y: number },
    spellId: RuntimePlayerCombatSpellId,
    source: "immediate" | "queued" = "immediate"
  ): void => {
    clearSelectedInventoryItem("player-spell-selected");
    clearSelectedSpell("player-spell-selected");
    const scene = ensureManualRuntimeScene();
    if (runtimePlayerCombatIsFightCountdownActive(scene.combatState)) {
      blockPlayerCombatCommandDuringCountdown("spell", position, spellId);
      return;
    }
    setManualOpponentFightEngaged(true, scene.combatState.tick);
    const nextCombatState = requestRuntimePlayerCombatSpell(scene.combatState, "local-player", "opponent", spellId);
    const localActorSource = manualControlRef.current ? manualActorRef.current : scene.localActor;
    const opponentActorSource = manualControlRef.current ? manualOpponentRef.current : scene.opponentActor;
    const nextLocalActor = manualActorFacingTarget(localActorSource, opponentActorSource);
    const nextOpponentActor = opponentActorSource;
    manualCombatStateRef.current = nextCombatState;
    manualActorRef.current = nextLocalActor;
    manualOpponentRef.current = nextOpponentActor;
    setPlaying(false);
    setFollowLive(false);
    setManualControl(true);
    setFollowTarget("local-player");
    setManualCombatState(nextCombatState);
    setManualActor(nextLocalActor);
    setManualOpponent(nextOpponentActor);
    if (source === "immediate") {
      showClickCross(position, "red");
    }
    setMinimapDestinationTile(null);
    const packet = nhPlayerCommandPacket(entry);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastPlayerPacketDispatch = entry.action;
      viewport.dataset.lastPlayerQueuedSpellId = spellId;
      viewport.dataset.lastPlayerQueuedSpellAutocast = "false";
      viewport.dataset.lastPlayerSpellResolvedSource = source;
      viewport.dataset.lastPlayerQueuedForTickProcessed = source === "queued" ? "true" : "false";
      viewport.dataset.lastTileCommandSource = "";
      viewport.dataset.lastTileCommandTileX = "";
      viewport.dataset.lastTileCommandTileZ = "";
      viewport.dataset.lastManualOpponentPolicyTickSource = "deferred-to-game-tick";
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-player-action", {
        detail: {
          action: entry.action,
          actionText: entry.actionText,
          opcode: entry.opcode,
          baseOpcode: packet?.clientMenuBaseOpcode ?? null,
          serverPacketId: packet?.serverPacketId ?? null,
          sourcePacketName: packet?.sourcePacketName ?? null,
          playerOption: packet?.playerOption ?? null,
          targetPlayerIndex: entry.identifier ?? null,
          targetTile: entry.targetTile,
          selectedItem: entry.selectedItem ?? null,
          selectedSpell: entry.selectedSpell ?? null,
          queuedSpellId: spellId,
          position
        }
      })
    );
  };

  const queuePlayerSpellAfterPendingItemPackets = (
    entry: NhPlayerContextMenuEntry<RuntimeTile>,
    position: { readonly x: number; readonly y: number },
    spellId: RuntimePlayerCombatSpellId
  ): boolean => {
    const pendingItemPackets = itemActionQueueRef.current.snapshot();
    if (pendingItemPackets.length === 0) {
      return false;
    }

    const queuedAtMs = performance.now();
    const readyAtMs = nextNhGameTickAt(runtimeTickOriginMsRef.current, queuedAtMs);
    queuedPlayerCombatPacketsRef.current.push({
      kind: "spell",
      entry,
      position,
      spellId,
      queuedAtMs,
      readyAtMs
    });

    clearSelectedInventoryItem("player-spell-selected");
    clearSelectedSpell("player-spell-selected");
    setPlaying(false);
    setFollowLive(false);
    showClickCross(position, "red");
    setMinimapDestinationTile(null);

    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      // Source: selecting a spell is local client state (class19.method340), but clicking a player sends
      // the spell-on-player packet with selectedSpellWidget/selectedSpellChildIndex. Nh then decodes
      // that packet after any earlier inventory equip packets during decoder.process(this, 250).
      viewport.dataset.lastPlayerQueuedForTick = "true";
      viewport.dataset.lastPlayerQueuedAfterPendingInventory = "true";
      viewport.dataset.lastPlayerQueuedCombatKind = "spell";
      viewport.dataset.lastPlayerQueuedPendingItemCount = String(pendingItemPackets.length);
      viewport.dataset.lastPlayerQueuedReadyAtMs = String(readyAtMs);
      viewport.dataset.lastPlayerQueuedAtMs = String(queuedAtMs);
      viewport.dataset.lastPlayerQueuedSpellId = spellId;
      viewport.dataset.lastPlayerQueuedSpellAutocast = "false";
      viewport.dataset.lastPlayerSpellResolvedSource = "queued-pending";
      viewport.dataset.lastPlayerQueuedForTickProcessed = "false";
      viewport.dataset.lastTileCommandSource = "";
      viewport.dataset.lastTileCommandTileX = "";
      viewport.dataset.lastTileCommandTileZ = "";
    }

    scheduleReadyItemActionProcessing();
    return true;
  };

  const issuePlayerSpellCommand = (
    entry: NhPlayerContextMenuEntry<RuntimeTile>,
    position: { readonly x: number; readonly y: number },
    spellId: RuntimePlayerCombatSpellId
  ): void => {
    if (blockPlayerCombatCommandDuringCountdown("spell", position, spellId)) {
      return;
    }
    if (queuePlayerSpellAfterPendingItemPackets(entry, position, spellId)) {
      return;
    }
    applyPlayerSpellCommand(entry, position, spellId);
  };

  const issueTileCommand = (
    targetTile: RuntimeTile,
    position: { readonly x: number; readonly y: number },
    color: NhClickCrossColor,
    source: NhTileCommandSource,
    objectPlacement?: NhArenaObjectPlacement
  ): void => {
    clearSelectedInventoryItem("tile-command");
    clearSelectedSpell("tile-command");
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastTileCommandSource = source;
      viewport.dataset.lastTileCommandTileX = String(targetTile.x);
      viewport.dataset.lastTileCommandTileZ = String(targetTile.z);
      viewport.dataset.lastTileCommandBlockedReason = "";
      viewport.dataset.lastTileCommandBlockedByMovementGate = "false";
    }
    if (!collisionMap) {
      showClickCross(position, "red");
      return;
    }

    const manualScene = ensureManualRuntimeScene();
    const nextCombatState = resetRuntimePlayerCombatActorTarget(manualScene.combatState, "local-player");
    const movementStatus = movementGate(
      nextCombatState.actors["local-player"].locks,
      nextCombatState.tick
    );
    if (movementStatus.blocked) {
      const sourceActor = manualControlRef.current ? manualActorRef.current : manualScene.localActor;
      const stoppedActor = clearManualActorMovementRoute(sourceActor);
      manualActorRef.current = stoppedActor;
      manualCombatStateRef.current = nextCombatState;
      setPlaying(false);
      setFollowLive(false);
      setManualControl(true);
      setFollowTarget("local-player");
      setManualCombatState(nextCombatState);
      setManualActor(stoppedActor);
      setMinimapDestinationTile(null);
      showClickCross(position, color);
      if (viewport) {
        viewport.dataset.lastTileCommandBlockedReason = movementStatus.reason;
        viewport.dataset.lastTileCommandBlockedByMovementGate = "true";
      }
      return;
    }
    manualCombatStateRef.current = nextCombatState;
    setPlaying(false);
    setFollowLive(false);
    setManualControl(true);
    setFollowTarget("local-player");
    setManualCombatState(nextCombatState);
    const actorSource = manualControlRef.current ? manualActorRef.current : manualScene.localActor;
    const routed = routeManualActor(actorSource, targetTile, collisionMap, objectPlacement, performance.now());
    manualActorRef.current = routed.actor;
    setManualActor(routed.actor);
    if (!routed.reached) {
      setMinimapDestinationTile(null);
      showClickCross(position, "red");
      return;
    }
    setMinimapDestinationTile(minimapDestinationTileFromCommand(targetTile));
    showClickCross(position, color);
  };

  const recordSceneObjectCommand = (entry: NhSceneObjectContextMenuEntry<RuntimeTile>): void => {
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (!viewport) {
      return;
    }
    viewport.dataset.lastSceneObjectAction = entry.actionText;
    viewport.dataset.lastSceneObjectActionKind = entry.action;
    viewport.dataset.lastSceneObjectOpcode = String(entry.opcode);
    const packet = nhSceneObjectCommandPacket(entry);
    viewport.dataset.lastSceneObjectServerPacketId = packet ? String(packet.serverPacketId) : "";
    viewport.dataset.lastSceneObjectServerOption = packet?.serverOption === null || packet === null ? "" : String(packet.serverOption);
    viewport.dataset.lastSceneObjectId = entry.objectId === undefined ? "" : String(entry.objectId);
    viewport.dataset.lastSceneObjectName = entry.objectName ?? "";
    viewport.dataset.lastSceneObjectX = entry.objectX === undefined ? "" : String(entry.objectX);
    viewport.dataset.lastSceneObjectY = entry.objectY === undefined ? "" : String(entry.objectY);
    viewport.dataset.lastSceneObjectActionIndex =
      entry.objectActionIndex === undefined ? "" : String(entry.objectActionIndex);
    viewport.dataset.lastSceneObjectSelectedItemId = entry.selectedItem ? String(entry.selectedItem.itemId) : "";
    viewport.dataset.lastSceneObjectSelectedSlot = entry.selectedItem ? String(entry.selectedItem.slotIndex) : "";
    viewport.dataset.lastSceneObjectSelectedSpellActionName = entry.selectedSpell?.actionName ?? "";
    viewport.dataset.lastSceneObjectSelectedSpellFlags = entry.selectedSpell ? String(entry.selectedSpell.flags) : "";
    viewport.dataset.lastSceneObjectSelectedSpellId = entry.selectedSpell?.spellId ?? "";
    viewport.dataset.lastSceneObjectSelectedSpellName = entry.selectedSpell?.spellName ?? "";
    viewport.dataset.lastSceneObjectSelectedSpellWidgetId = entry.selectedSpell?.widgetId === undefined ? "" : String(entry.selectedSpell.widgetId);
  };

  const recordPlayerCommand = (entry: NhPlayerContextMenuEntry<RuntimeTile>): void => {
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (!viewport) {
      return;
    }
    const packet = nhPlayerCommandPacket(entry);
    viewport.dataset.lastPlayerAction = entry.actionText;
    viewport.dataset.lastPlayerActionKind = entry.action;
    viewport.dataset.lastPlayerOpcode = String(entry.opcode);
    viewport.dataset.lastPlayerBaseOpcode = packet ? String(packet.clientMenuBaseOpcode) : "";
    viewport.dataset.lastPlayerIdentifier = entry.identifier === undefined ? "" : String(entry.identifier);
    viewport.dataset.lastPlayerServerPacketId = packet ? String(packet.serverPacketId) : "";
    viewport.dataset.lastPlayerServerPacketName = packet?.sourcePacketName ?? "";
    viewport.dataset.lastPlayerOption = packet?.playerOption === undefined ? "" : String(packet.playerOption);
    viewport.dataset.lastPlayerSelectedItemId = entry.selectedItem?.itemId === undefined ? "" : String(entry.selectedItem.itemId);
    viewport.dataset.lastPlayerSelectedSlot =
      entry.selectedItem?.slotIndex === undefined ? "" : String(entry.selectedItem.slotIndex);
    viewport.dataset.lastPlayerSelectedWidgetId =
      entry.selectedItem?.widgetId === undefined ? "" : String(entry.selectedItem.widgetId);
    viewport.dataset.lastPlayerSelectedSpellActionName = entry.selectedSpell?.actionName ?? "";
    viewport.dataset.lastPlayerSelectedSpellChildId =
      entry.selectedSpell?.childId === undefined ? "" : String(entry.selectedSpell.childId);
    viewport.dataset.lastPlayerSelectedSpellFlags = entry.selectedSpell ? String(entry.selectedSpell.flags) : "";
    viewport.dataset.lastPlayerSelectedSpellId = entry.selectedSpell?.spellId ?? "";
    viewport.dataset.lastPlayerSelectedSpellItemId =
      entry.selectedSpell?.itemId === undefined ? "" : String(entry.selectedSpell.itemId);
    viewport.dataset.lastPlayerSelectedSpellLabel = entry.selectedSpell?.label ?? "";
    viewport.dataset.lastPlayerSelectedSpellName = entry.selectedSpell?.spellName ?? "";
    viewport.dataset.lastPlayerSelectedSpellWidgetId =
      entry.selectedSpell?.widgetId === undefined ? "" : String(entry.selectedSpell.widgetId);
  };

  const issuePlayerPacketCommand = (
    entry: NhPlayerContextMenuEntry<RuntimeTile>,
    position: { readonly x: number; readonly y: number }
  ): void => {
    const clearReason = entry.action === "player-use-selected" || entry.action === "player-spell-selected" ? entry.action : "player-action";
    clearSelectedInventoryItem(clearReason);
    clearSelectedSpell(clearReason);
    setPlaying(false);
    setFollowLive(false);
    showClickCross(position, "red");
    setMinimapDestinationTile(null);
    const packet = nhPlayerCommandPacket(entry);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastPlayerPacketDispatch = entry.action;
      viewport.dataset.lastTileCommandSource = "";
      viewport.dataset.lastTileCommandTileX = "";
      viewport.dataset.lastTileCommandTileZ = "";
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-player-action", {
        detail: {
          action: entry.action,
          actionText: entry.actionText,
          opcode: entry.opcode,
          baseOpcode: packet?.clientMenuBaseOpcode ?? null,
          serverPacketId: packet?.serverPacketId ?? null,
          sourcePacketName: packet?.sourcePacketName ?? null,
          playerOption: packet?.playerOption ?? null,
          targetPlayerIndex: entry.identifier ?? null,
          targetTile: entry.targetTile,
          selectedItem: entry.selectedItem ?? null,
          selectedSpell: entry.selectedSpell ?? null,
          position
        }
      })
    );
  };

  const dispatchPlayerContextEntry = (
    entry: NhPlayerContextMenuEntry<RuntimeTile>,
    position: { readonly x: number; readonly y: number }
  ): void => {
    recordPlayerCommand(entry);
    if (entry.action === "attack") {
      issuePlayerAttackCommand(entry, position);
      return;
    }
    if (entry.action === "player-spell-selected") {
      const spellId = runtimeCombatSpellIdFromSelectedSpell(entry.selectedSpell);
      if (spellId) {
        issuePlayerSpellCommand(entry, position, spellId);
        return;
      }
    }
    if (entry.action !== "walk") {
      issuePlayerPacketCommand(entry, position);
      return;
    }
    issueTileCommand(entry.targetTile, position, "yellow", "context-menu");
  };

  const dispatchSideTabAction = (command: NhSideTabCommand): void => {
    closeContextMenu();
    setActiveSideTabId(command.tab.id);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.activeSideTabId = command.tab.id;
      viewport.dataset.lastSideTabAction = command.actionText;
      viewport.dataset.lastSideTabActionIndex = String(command.actionIndex);
      viewport.dataset.lastSideTabChildId = String(command.tab.childId);
      viewport.dataset.lastSideTabContainerChildId = String(command.tab.container.childId);
      viewport.dataset.lastSideTabContainerHidden = command.tab.container.hidden ? "true" : "false";
      viewport.dataset.lastSideTabContainerWidgetId = String(command.tab.container.widgetId);
      viewport.dataset.lastSideTabIconChildId = String(command.tab.iconChildId);
      viewport.dataset.lastSideTabIconSpriteId = String(command.tab.iconSpriteId);
      viewport.dataset.lastSideTabId = command.tab.id;
      viewport.dataset.lastSideTabMenuInserter = "AttackOption.method2104";
      viewport.dataset.lastSideTabMenuOpcode = String(command.menuOpcode);
      viewport.dataset.lastSideTabRow = command.tab.row;
      viewport.dataset.lastSideTabSlotIndex = String(command.tab.slotIndex);
      viewport.dataset.lastSideTabSourceActionCount = String(command.sourceActions.length);
      viewport.dataset.lastSideTabSourceActions = command.sourceActions.map((action) => action.actionText).join("||");
      viewport.dataset.lastSideTabWidgetId = String(command.tab.widgetId);
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-side-tab", {
        detail: {
          actionIndex: command.actionIndex,
          actionText: command.actionText,
          childId: command.tab.childId,
          containerChildId: command.tab.container.childId,
          containerHidden: command.tab.container.hidden,
          containerWidgetId: command.tab.container.widgetId,
          iconChildId: command.tab.iconChildId,
          iconSpriteId: command.tab.iconSpriteId,
          menuInserter: "AttackOption.method2104",
          menuOpcode: command.menuOpcode,
          row: command.tab.row,
          slotIndex: command.tab.slotIndex,
          sourceActionCount: command.sourceActions.length,
          sourceActions: command.sourceActions.map((action) => action.actionText),
          tabId: command.tab.id,
          widgetId: command.tab.widgetId
        }
      })
    );
  };

  const dispatchChatboxAction = (command: NhChatboxButtonCommand): void => {
    closeContextMenu();
    clearSelectedInventoryItem("chatbox-action");
    clearSelectedSpell("chatbox-action");
    setPlaying(false);
    setFollowLive(false);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastChatboxAction = command.actionText;
      viewport.dataset.lastChatboxActionIndex = String(command.actionIndex);
      viewport.dataset.lastChatboxButtonId = command.buttonId;
      viewport.dataset.lastChatboxButtonLabel = command.label;
      viewport.dataset.lastChatboxChildId = String(command.widget.widget.childId);
      viewport.dataset.lastChatboxClickMask = String(command.widget.widget.clickMask ?? 0);
      viewport.dataset.lastChatboxDefaultActionIndex = String(command.actionIndex);
      viewport.dataset.lastChatboxDefaultActionText = command.actionText;
      viewport.dataset.lastChatboxGroupId = String(command.widget.widget.groupId);
      viewport.dataset.lastChatboxMenuInserter = "AttackOption.method2104";
      viewport.dataset.lastChatboxMenuOpcode = String(command.menuOpcode);
      viewport.dataset.lastChatboxSourceActionCount = String(command.actions.length);
      viewport.dataset.lastChatboxSourceActions = command.actions.join("||");
      viewport.dataset.lastChatboxSourceActionResolver = "FaceNormal.method2908";
      viewport.dataset.lastChatboxSourceHandler = "MusicPatchNode.method3842";
      viewport.dataset.lastChatboxWidgetId = String(command.widget.widget.id);
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-chatbox-action", {
        detail: {
          actionIndex: command.actionIndex,
          actionText: command.actionText,
          buttonId: command.buttonId,
          childId: command.widget.widget.childId,
          clickMask: command.widget.widget.clickMask ?? 0,
          groupId: command.widget.widget.groupId,
          label: command.label,
          menuInserter: "AttackOption.method2104",
          menuOpcode: command.menuOpcode,
          sourceActionCount: command.actions.length,
          sourceActionResolver: "FaceNormal.method2908",
          sourceActions: command.actions,
          sourceHandler: "MusicPatchNode.method3842",
          widgetId: command.widget.widget.id,
          position: command.position
        }
      })
    );
  };

  const dispatchSocialButtonAction = (command: NhSocialButtonCommand): void => {
    closeContextMenu();
    clearSelectedInventoryItem("social-action");
    clearSelectedSpell("social-action");
    if (command.action === "switch") {
      setActiveSideTabId(command.list === "friends" ? "ignores" : "friends");
    } else {
      setNhSocialLists((current) => nhDevSocialListsAfterButton(current, command));
    }

    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastSocialAction = command.actionText;
      viewport.dataset.lastSocialActionKind = command.action;
      viewport.dataset.lastSocialActionIndex = String(command.actionIndex);
      viewport.dataset.lastSocialChildId = String(command.childId);
      viewport.dataset.lastSocialClickMask = String(command.clickMask);
      viewport.dataset.lastSocialList = command.list;
      viewport.dataset.lastSocialSourceHandler =
        command.action === "switch" ? "TabSocial.java" : "FriendsHandler -> CentralClient.sendSocialRequest";
      viewport.dataset.lastSocialSourcePacketId = command.sourcePacketId === undefined ? "" : String(command.sourcePacketId);
      viewport.dataset.lastSocialSourcePacketName = command.sourcePacketName ?? "";
      viewport.dataset.lastSocialWidgetId = String(command.widgetId);
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-social-action", {
        detail: {
          action: command.action,
          actionText: command.actionText,
          actionIndex: command.actionIndex,
          childId: command.childId,
          clickMask: command.clickMask,
          list: command.list,
          sourceHandler: command.action === "switch" ? "TabSocial.java" : "FriendsHandler",
          sourcePacketId: command.sourcePacketId ?? null,
          sourcePacketName: command.sourcePacketName ?? null,
          widgetId: command.widgetId,
          position: command.position
        }
      })
    );
  };

  const dispatchClanChatButtonAction = (command: NhClanChatButtonCommand): void => {
    closeContextMenu();
    clearSelectedInventoryItem("clan-chat-action");
    clearSelectedSpell("clan-chat-action");
    if (command.action === "leave") {
      setNhClanChat((current) => ({ ...current, active: false, members: [] }));
    } else if (command.action === "join") {
      setNhClanChat(NH_DEV_CLAN_CHAT);
    }

    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastClanChatAction = command.actionText;
      viewport.dataset.lastClanChatActionKind = command.action;
      viewport.dataset.lastClanChatActionIndex = String(command.actionIndex);
      viewport.dataset.lastClanChatChildId = String(command.childId);
      viewport.dataset.lastClanChatClickMask = String(command.clickMask);
      viewport.dataset.lastClanChatSourceHandler = command.sourceServerHandler;
      viewport.dataset.lastClanChatSourcePacketId = command.sourcePacketId === undefined ? "" : String(command.sourcePacketId);
      viewport.dataset.lastClanChatSourcePacketName = command.sourcePacketName ?? "";
      viewport.dataset.lastClanChatWidgetId = String(command.widgetId);
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-clan-chat-action", {
        detail: {
          action: command.action,
          actionText: command.actionText,
          actionIndex: command.actionIndex,
          childId: command.childId,
          clickMask: command.clickMask,
          sourceHandler: command.sourceServerHandler,
          sourcePacketId: command.sourcePacketId ?? null,
          sourcePacketName: command.sourcePacketName ?? null,
          widgetId: command.widgetId,
          position: command.position
        }
      })
    );
  };

  const dispatchEquipmentUtilityAction = (command: NhEquipmentUtilityButtonCommand): void => {
    closeContextMenu();
    clearSelectedInventoryItem("equipment-utility-action");
    clearSelectedSpell("equipment-utility-action");
    setPlaying(false);
    setFollowLive(false);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastEquipmentUtilityAction = command.actionText;
      viewport.dataset.lastEquipmentUtilityActionIndex = String(command.actionIndex);
      viewport.dataset.lastEquipmentUtilityButtonId = command.button.id;
      viewport.dataset.lastEquipmentUtilityButtonLabel = command.button.label;
      viewport.dataset.lastEquipmentUtilityChildId = String(command.button.childId);
      viewport.dataset.lastEquipmentUtilityClickMask = String(command.button.clickMask);
      viewport.dataset.lastEquipmentUtilityDefaultActionIndex = String(command.actionIndex);
      viewport.dataset.lastEquipmentUtilityDefaultActionText = command.actionText;
      viewport.dataset.lastEquipmentUtilityGroupId = String(command.button.groupId);
      viewport.dataset.lastEquipmentUtilityMenuInserter = "AttackOption.method2104";
      viewport.dataset.lastEquipmentUtilityMenuOpcode = String(command.menuOpcode);
      viewport.dataset.lastEquipmentUtilitySourceActionCount = String(
        command.button.actions.filter((action) => action.trim().length > 0).length
      );
      viewport.dataset.lastEquipmentUtilitySourceActions = command.button.actions
        .filter((action) => action.trim().length > 0)
        .join("||");
      viewport.dataset.lastEquipmentUtilitySourceActionResolver = "FaceNormal.method2908";
      viewport.dataset.lastEquipmentUtilitySourceHandler = "MusicPatchNode.method3842";
      viewport.dataset.lastEquipmentUtilitySpriteChildId = command.button.spriteChildId === null ? "" : String(command.button.spriteChildId);
      viewport.dataset.lastEquipmentUtilitySpriteId = command.button.spriteId === null ? "" : String(command.button.spriteId);
      viewport.dataset.lastEquipmentUtilitySpriteWidgetId =
        command.button.spriteWidgetId === null ? "" : String(command.button.spriteWidgetId);
      viewport.dataset.lastEquipmentUtilityWidgetId = String(command.button.widgetId);
    }

    if (command.button.id === "stats") {
      setEquipmentUtilityPanelMode("stats");
    } else if (command.button.id === "items-kept-on-death") {
      setEquipmentUtilityPanelMode("items-kept-on-death");
    } else if (command.button.id === "prices") {
      setEquipmentUtilityPanelMode("guide-prices");
    } else if (command.button.id === "call-follower") {
      setEquipmentUtilityPanelMode("call-follower");
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-equipment-utility", {
        detail: {
          actionIndex: command.actionIndex,
          actionText: command.actionText,
          buttonId: command.button.id,
          childId: command.button.childId,
          clickMask: command.button.clickMask,
          groupId: command.button.groupId,
          label: command.button.label,
          menuInserter: "AttackOption.method2104",
          menuOpcode: command.menuOpcode,
          sourceActionCount: command.button.actions.filter((action) => action.trim().length > 0).length,
          sourceActionResolver: "FaceNormal.method2908",
          sourceActions: command.button.actions.filter((action) => action.trim().length > 0),
          sourceHandler: "MusicPatchNode.method3842",
          spriteChildId: command.button.spriteChildId,
          spriteId: command.button.spriteId,
          spriteWidgetId: command.button.spriteWidgetId,
          widgetId: command.button.widgetId,
          position: command.position
        }
      })
    );
  };

  const dispatchStatsSkillAction = (command: NhStatsSkillCommand): void => {
    closeContextMenu();
    clearSelectedInventoryItem("stats-skill-action");
    clearSelectedSpell("stats-skill-action");
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastStatsSkillAction = command.actionText;
      viewport.dataset.lastStatsSkillChildId = String(command.slot.childId);
      viewport.dataset.lastStatsSkillClientId = String(command.slot.clientId);
      viewport.dataset.lastStatsSkillGroupId = String(command.slot.groupId);
      viewport.dataset.lastStatsSkillGuideCategory = "0";
      viewport.dataset.lastStatsSkillGuideInterfaceId = "214";
      viewport.dataset.lastStatsSkillGuideStat = String(command.slot.clientId);
      viewport.dataset.lastStatsSkillId = command.slot.id;
      viewport.dataset.lastStatsSkillLabel = command.slot.label;
      viewport.dataset.lastStatsSkillOpenGuideScriptArg0 = "4600861";
      viewport.dataset.lastStatsSkillOpenGuideScriptArg1 = "80";
      viewport.dataset.lastStatsSkillOpenGuideScriptId = "917";
      viewport.dataset.lastStatsSkillSourceOrder = String(command.slot.sourceOrder);
      viewport.dataset.lastStatsSkillWidgetId = String(command.slot.widgetId);
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-stats-skill", {
        detail: {
          actionText: command.actionText,
          childId: command.slot.childId,
          clientId: command.slot.clientId,
          groupId: command.slot.groupId,
          guideCategory: 0,
          guideInterfaceId: 214,
          guideStat: command.slot.clientId,
          skillId: command.slot.id,
          skillLabel: command.slot.label,
          sourceOrder: command.slot.sourceOrder,
          widgetId: command.slot.widgetId,
          openGuideScript: {
            id: 917,
            args: [4600861, 80]
          },
          position: command.position
        }
      })
    );
  };

  const dispatchSpellDefaultAction = (command: NhSpellbookSpellCommand): void => {
    closeContextMenu();
    clearSelectedInventoryItem("spell-selection");
    const selected: NhSelectedSpell = {
      actionName: command.actionName,
      spellName: command.selectedSpellName,
      flags: command.targetFlags,
      widgetId: command.spell.widgetId,
      childId: command.spell.childId,
      itemId: command.spell.itemId,
      spellId: command.spell.id,
      label: command.spell.label
    };
    setSelectedSpell(selected);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.selectedSpellActionName = selected.actionName;
      viewport.dataset.selectedSpellChildId = String(selected.childId);
      viewport.dataset.selectedSpellFlags = String(selected.flags);
      viewport.dataset.selectedSpellId = selected.spellId ?? "";
      viewport.dataset.selectedSpellItemId = selected.itemId === undefined ? "" : String(selected.itemId);
      viewport.dataset.selectedSpellLabel = selected.label ?? "";
      viewport.dataset.selectedSpellName = selected.spellName;
      viewport.dataset.selectedSpellWidgetId = selected.widgetId === undefined ? "" : String(selected.widgetId);
      viewport.dataset.lastSpellSelectionAction = command.actionName;
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-spell-selection", {
        detail: {
          actionName: selected.actionName,
          childId: selected.childId,
          flags: selected.flags,
          itemId: selected.itemId,
          label: selected.label,
          spellId: selected.spellId,
          spellName: selected.spellName,
          widgetId: selected.widgetId,
          position: command.position
        }
      })
    );
  };

  const dispatchCombatStyleAction = (command: NhCombatStyleCommand): void => {
    closeContextMenu();
    clearSelectedInventoryItem("combat-style-action");
    clearSelectedSpell("combat-style-action");
    setPlaying(false);
    setFollowLive(false);
    const scene = ensureManualRuntimeScene();
    const nextCombatState = setRuntimePlayerCombatAttackSet(scene.combatState, "local-player", command.slot.index);
    const nextAttackSetIndex = nextCombatState.actors["local-player"].attackSetIndex;
    setHudOverride((current) => ({
      ...(current ?? {}),
      attackSet: nextAttackSetIndex,
      autocast: 0
    }));
    manualCombatStateRef.current = nextCombatState;
    writeStoredAttackSetIndex(nextAttackSetIndex);
    setManualCombatState(nextCombatState);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastCombatControlKind = "attack-style";
      viewport.dataset.lastCombatStyleAction = command.actionText;
      viewport.dataset.lastCombatStyleActionChildId = String(command.slot.actionChildId);
      viewport.dataset.lastCombatStyleActionWidgetId = String(command.slot.actionWidgetId);
      viewport.dataset.lastCombatStyleAttackSetChildId = String(command.attackSet.child);
      viewport.dataset.lastCombatStyleAttackSetIndex = String(command.slot.index);
      viewport.dataset.lastCombatStyleAttackSetVarpId = String(command.attackSetVarpId);
      viewport.dataset.lastCombatStyleAttackStyle = command.attackSet.style;
      viewport.dataset.lastCombatStyleAttackType = command.attackSet.type;
      viewport.dataset.lastCombatStyleStorageKey = NH_TRAINER_ATTACK_SET_STORAGE_KEY;
      viewport.dataset.lastCombatStylePreviousAttackSetIndex =
        command.previousAttackSetIndex === null ? "" : String(command.previousAttackSetIndex);
      viewport.dataset.lastCombatStyleSourceActionCount = String(command.slot.actions.length);
      viewport.dataset.lastCombatStyleSourceHandler = "TabCombat.changeAttackSet";
      viewport.dataset.lastCombatStyleWeaponType = command.weaponType.id;
      viewport.dataset.lastCombatStyleWeaponTypeConfig = String(command.weaponType.config);
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-combat-style", {
        detail: {
          actionText: command.actionText,
          actionChildId: command.slot.actionChildId,
          actionWidgetId: command.slot.actionWidgetId,
          attackSetChildId: command.attackSet.child,
          attackSetIndex: command.slot.index,
          attackSetVarpId: command.attackSetVarpId,
          attackStyle: command.attackSet.style,
          attackType: command.attackSet.type,
          previousAttackSetIndex: command.previousAttackSetIndex,
          resetAutocast: true,
          sourceHandler: "TabCombat.changeAttackSet",
          sourceActionCount: command.slot.actions.length,
          weaponType: command.weaponType.id,
          weaponTypeConfig: command.weaponType.config,
          position: command.position
        }
      })
    );
  };

  const dispatchCombatAutocastAction = (command: NhCombatAutocastCommand): void => {
    closeContextMenu();
    clearSelectedInventoryItem("combat-autocast-action");
    clearSelectedSpell("combat-autocast-action");
    setPlaying(false);
    setFollowLive(false);
    setHudOverride((current) => ({
      ...(current ?? {}),
      autocast: command.autocastSlot,
      defensiveCast: command.defensive
    }));
    const scene = ensureManualRuntimeScene();
    const nextCombatState = setRuntimePlayerCombatAutocast(
      scene.combatState,
      "local-player",
      command.spellId,
      command.defensive
    );
    manualCombatStateRef.current = nextCombatState;
    setManualCombatState(nextCombatState);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastCombatControlKind = "autocast";
      viewport.dataset.lastCombatAutocastAction = command.actionText;
      viewport.dataset.lastCombatAutocastActionChildId = String(command.control.childId);
      viewport.dataset.lastCombatAutocastActionWidgetId = String(command.control.widgetId);
      viewport.dataset.lastCombatAutocastDefensive = String(command.defensive);
      viewport.dataset.lastCombatAutocastSlot = String(command.autocastSlot);
      viewport.dataset.lastCombatAutocastSpellId = command.spellId;
      viewport.dataset.lastCombatAutocastSpellName = command.spellName;
      viewport.dataset.lastCombatAutocastSourceHandler = "TabCombat.openAutocast/selectAutocast";
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-combat-autocast", {
        detail: {
          actionText: command.actionText,
          actionChildId: command.control.childId,
          actionWidgetId: command.control.widgetId,
          autocastSlot: command.autocastSlot,
          defensive: command.defensive,
          resetQueuedSpell: true,
          sourceHandler: "TabCombat.openAutocast/selectAutocast",
          spellId: command.spellId,
          spellName: command.spellName,
          position: command.position
        }
      })
    );
  };

  const dispatchCombatAutoRetaliateAction = (command: NhCombatAutoRetaliateCommand): void => {
    closeContextMenu();
    clearSelectedInventoryItem("combat-auto-retaliate-action");
    clearSelectedSpell("combat-auto-retaliate-action");
    setPlaying(false);
    setFollowLive(false);
    const nextEnabled = command.enabled !== true;
    setHudOverride((current) => ({
      ...(current ?? {}),
      autoRetaliate: nextEnabled
    }));
    writeStoredAutoRetaliate(nextEnabled);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastCombatAutoRetaliateAction = command.actionText;
      viewport.dataset.lastCombatAutoRetaliateActionChildId = String(command.control.childId);
      viewport.dataset.lastCombatAutoRetaliateActionWidgetId = String(command.control.widgetId);
      viewport.dataset.lastCombatAutoRetaliateEnabled = String(nextEnabled);
      viewport.dataset.lastCombatAutoRetaliatePreviousEnabled =
        command.enabled === undefined ? "" : String(command.enabled);
      viewport.dataset.lastCombatAutoRetaliateSourceActionCount = String(command.control.actions.length);
      viewport.dataset.lastCombatAutoRetaliateSourceHandler = "Config.AUTO_RETALIATE.toggle";
      viewport.dataset.lastCombatAutoRetaliateStorageKey = NH_AUTO_RETALIATE_STORAGE_KEY;
      viewport.dataset.lastCombatAutoRetaliateVarpId = String(command.autoRetaliateVarpId);
      viewport.dataset.lastCombatControlKind = "auto-retaliate";
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-combat-auto-retaliate", {
        detail: {
          actionText: command.actionText,
          actionChildId: command.control.childId,
          actionWidgetId: command.control.widgetId,
          autoRetaliateVarpId: command.autoRetaliateVarpId,
          enabled: nextEnabled,
          previousEnabled: command.enabled,
          sourceActionCount: command.control.actions.length,
          sourceHandler: "Config.AUTO_RETALIATE.toggle",
          position: command.position
        }
      })
    );
  };

  const dispatchRunOrbAction = (command: NhRunOrbCommand): void => {
    closeContextMenu();
    clearSelectedInventoryItem("run-toggle");
    clearSelectedSpell("run-toggle");
    setPlaying(false);
    setFollowLive(false);
    const nextRunning = command.previousRunning ? false : command.runEnergy > 0;
    setHudOverride((current) => ({
      ...(current ?? {}),
      running: nextRunning
    }));
    if (manualControlRef.current) {
      const nextActor = {
        ...manualActorRef.current,
        running: nextRunning
      };
      manualActorRef.current = nextActor;
      setManualActor(nextActor);
    }
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastRunToggleAction = command.actionText;
      viewport.dataset.lastRunTogglePreviousRunning = String(command.previousRunning);
      viewport.dataset.lastRunToggleRunning = String(nextRunning);
      viewport.dataset.lastRunToggleEnergy = String(command.runEnergy);
      viewport.dataset.lastRunToggleActionChildId = String(command.actionChildId);
      viewport.dataset.lastRunToggleActionWidgetId = String(command.actionWidgetId);
      viewport.dataset.lastRunToggleSourceActionCount = String(command.sourceActionCount);
      viewport.dataset.lastRunToggleSourceHandler = "PlayerMovement.toggleRunning";
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-run-toggle", {
        detail: {
          actionText: command.actionText,
          previousRunning: command.previousRunning,
          running: nextRunning,
          runEnergy: command.runEnergy,
          sourceHandler: "PlayerMovement.toggleRunning",
          position: command.position
        }
      })
    );
  };

  const dispatchXpDropOrbAction = (command: NhXpDropOrbCommand): void => {
    closeContextMenu();
    clearSelectedInventoryItem("xp-drop-orb");
    clearSelectedSpell("xp-drop-orb");
    setPlaying(false);
    setFollowLive(false);
    const nextShown = !command.previousShown;
    xpDropCounterShownRef.current = nextShown;
    setXpDropCounterShown(nextShown);
    if (!nextShown) {
      runeliteXpDropActiveDropletsRef.current.clear();
      runeliteXpDropLastStartClientCycleRef.current = 0;
      runeliteXpDropDomOverlaySignatureRef.current = "";
      setRuneliteXpDropOverlays([]);
    }

    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastXpDropOrbAction = command.actionText;
      viewport.dataset.lastXpDropOrbShown = String(nextShown);
      viewport.dataset.lastXpDropOrbPreviousShown = String(command.previousShown);
      viewport.dataset.lastXpDropOrbChildId = String(command.childId);
      viewport.dataset.lastXpDropOrbWidgetId = String(command.widgetId);
      viewport.dataset.lastXpDropOrbSpriteId = String(command.spriteId);
      viewport.dataset.lastXpDropOrbVarbit = "4702";
      viewport.dataset.lastXpDropOrbVarTransmit = "var1055";
      viewport.dataset.sourceXpDropOrbHandler = "orbs_xpdrops_op(event_opindex, event_com, 0/1)";
      viewport.dataset.sourceXpDropOrbUpdate = "orbs_xpdrops_update varbit4702 Show/Hide sprite orb_xp";
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-xp-drop-orb", {
        detail: {
          actionText: command.actionText,
          childId: command.childId,
          shown: nextShown,
          previousShown: command.previousShown,
          sourceHandler: "orbs_xpdrops_op",
          sourceUpdate: "orbs_xpdrops_update",
          varbit: 4702,
          varTransmit: 1055,
          widgetId: command.widgetId,
          position: command.position
        }
      })
    );
  };

  const xpDropOrbContextEntries = (command: NhXpDropOrbCommand): readonly NhXpDropOrbContextMenuEntry[] => {
    const toggleText = command.previousShown ? "Hide" : "Show";
    return [
      {
        action: "xp-drop-orb-action",
        actionText: toggleText,
        targetText: "XP drops",
        opcode: 57,
        identifier: 1,
        argument1: command.childId,
        argument2: command.widgetId,
        xpDropAction: "toggle",
        actionIndex: 1,
        command: {
          ...command,
          actionText: toggleText
        }
      },
      {
        action: "xp-drop-orb-action",
        actionText: "Setup",
        targetText: "XP drops",
        opcode: 57,
        identifier: 2,
        argument1: command.childId,
        argument2: command.widgetId,
        xpDropAction: "setup",
        actionIndex: 2,
        command: {
          ...command,
          actionText: "Setup"
        }
      },
      ...RUNELITE_XP_DROP_TEXT_SIZE_OPTIONS.map((textSize) => ({
        action: "xp-drop-text-size" as const,
        actionText: `Text size ${textSize}`,
        targetText: textSize === runeliteClientConfigRef.current.xpDrop.nativeTextSize ? "(active)" : "",
        opcode: 57,
        identifier: runeliteXpDropTextSizeSpec(textSize).varbit4693,
        argument1: command.childId,
        argument2: command.widgetId,
        xpDropAction: "set-text-size" as const,
        textSize
      }))
    ];
  };

  const applyXpDropTextSize = (textSize: RuneliteXpDropConfigSnapshot["nativeTextSize"]): void => {
    const textSizeSpec = runeliteXpDropTextSizeSpec(textSize);
    const trainerFont: RuneliteXpDropConfigSnapshot["trainerFont"] =
      textSize === "Large" ? "Bold 12" :
        textSize === "Medium" ? "Plain 12" :
          "Plain 11";
    const nextConfig: RuneliteClientConfigSnapshot = {
      ...runeliteClientConfigRef.current,
      xpDrop: {
        ...runeliteClientConfigRef.current.xpDrop,
        nativeTextSize: textSize,
        trainerFont,
        trainerTextSize: textSizeSpec.textHeight
      }
    };
    runeliteClientConfigRef.current = nextConfig;
    setRuneliteClientConfig(nextConfig);
    applyRuneliteXpDropConfig(canvasRef.current, nextConfig.xpDrop);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastXpDropTextSize = textSize;
      viewport.dataset.lastXpDropTextSizeVarbit4693 = String(textSizeSpec.varbit4693);
      viewport.dataset.lastXpDropTextSizeSource = "XpCounter child 51 Config.XP_DROPS_SIZE varbit4693";
    }
    window.dispatchEvent(
      new CustomEvent("runelite-config-value-set", {
        detail: {
          pluginId: "xp-drop",
          keyName: "nativeTextSize",
          value: textSize
        }
      })
    );
    window.dispatchEvent(new CustomEvent("runelite-config-value-set", { detail: { pluginId: "xp-drop", keyName: "trainerFont", value: trainerFont } }));
    window.dispatchEvent(new CustomEvent("runelite-config-value-set", { detail: { pluginId: "xp-drop", keyName: "trainerTextSize", value: textSizeSpec.textHeight } }));
  };

  const dispatchXpDropOrbContextEntry = (entry: NhXpDropOrbContextMenuEntry): void => {
    if (entry.action === "xp-drop-text-size") {
      applyXpDropTextSize(entry.textSize);
      return;
    }
    if (entry.xpDropAction === "setup") {
      const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
      if (viewport) {
        viewport.dataset.lastXpDropOrbAction = "Setup";
        viewport.dataset.sourceXpCounterSetup = "XpCounter.select option!=1 opens interface 137 with position/size/speed/duration/counter/progress/colour/group";
      }
      window.dispatchEvent(
        new CustomEvent("runelite-overlay-config", {
          detail: {
            pluginId: "xp-drop",
            overlayTarget: "XP Drop",
            sourceOverlay: "XpCounter.select setup interface 137",
            sourceOverlayMenuOpcode: "RUNELITE_OVERLAY_CONFIG"
          }
        })
      );
      return;
    }
    dispatchXpDropOrbAction(entry.command);
  };

  const setNhGameKeybindSnapshot = (nextSnapshot: NhGameKeybindSnapshot): void => {
    const normalized = nhNormalizeGameKeybindSnapshot(nextSnapshot);
    gameKeybindsRef.current = normalized;
    setGameKeybinds(normalized);
    applyNhGameKeybindConfig(canvasRef.current, normalized);
  };

  const dispatchGameKeybindChange = (tabId: NhFixedSideTabId, keySlot: NhGameKeybindKeySlot): void => {
    const nextSnapshot = nhAssignGameKeybind(gameKeybindsRef.current, tabId, keySlot);
    setNhGameKeybindSnapshot(nextSnapshot);
    setGameKeybindSelectedTabId(tabId);
  };

  const dispatchGameKeybindEscapeClose = (escapeCloses: boolean): void => {
    setNhGameKeybindSnapshot(nhGameKeybindsWithEscapeClose(gameKeybindsRef.current, escapeCloses));
  };

  const dispatchGameKeybindRestoreDefaults = (mode: "osrs" | "pre-eoc"): void => {
    setNhGameKeybindSnapshot(mode === "pre-eoc" ? nhPreEocGameKeybinds() : NH_DEFAULT_GAME_KEYBINDS);
    setGameKeybindSelectedTabId("combat");
  };

  const applyTemporarySavedSetupSnapshot = (
    snapshot: TemporarySavedSetupSnapshot,
    source: "startup" | "button"
  ): void => {
    const equipmentItems = new Map(snapshot.equipment);
    const inventorySlots = normalizeNhInventorySlots(snapshot.inventory);
    const localActor = manualActorRef.current;
    const opponentActor = manualOpponentRef.current;
    const visibleEquipment = visibleEquipmentFromRuntimeItemIdsBySlot(
      equipmentItems,
      inventoryItemDefinitionsRef.current
    );
    const nextCombatState = syncRuntimePlayerCombatStateToInput(manualCombatStateRef.current, {
      tiles: {
        "local-player": localActor.tile,
        opponent: opponentActor.tile
      },
      loadouts: {
        "local-player": snapshot.loadoutId
      },
      equipment: {
        "local-player": visibleEquipment
      },
      levels: {
        "local-player": hudCombatLevelsRef.current
      },
      prayerPoints: {
        "local-player": {
          current: visibleSnapshotRef.current.hud.prayer,
          fixed: visibleSnapshotRef.current.hud.prayerMax
        }
      },
      prayers: {
        "local-player": runtimePrayerIdsFromNhStates(hudPrayersRef.current)
      },
      clientCycle: Math.floor(performance.now() / NH_CLIENT_CYCLE_MS)
    });
    const nextAppearance = runtimeAppearanceFromEquipmentItems(
      equipmentItems,
      runtimeLoadoutAppearance(snapshot.loadoutId)
    );
    const nextActor: ManualActorState = {
      ...localActor,
      loadoutId: snapshot.loadoutId,
      appearance: nextAppearance,
      sequenceName: manualActorBaseSequenceName(
        localActor.sequenceName,
        snapshot.loadoutId,
        inventoryEquipmentDefinitionsRef.current,
        weaponTypeDefinitionsRef.current,
        actorSequenceDefinitionsRef.current
      )
    };

    inventoryOverrideRef.current = inventorySlots;
    groundItemsRef.current = [];
    pendingGroundItemPickupRef.current = null;
    equipmentOverrideRef.current = equipmentItems;
    manualCombatStateRef.current = nextCombatState;
    manualActorRef.current = nextActor;
    ensureLocalActorEquipmentModel(equipmentItems, snapshot.loadoutId);
    unstable_batchedUpdates(() => {
      setInventoryOverride(inventorySlots);
      setGroundItems([]);
      setEquipmentOverride(() => equipmentItems);
      setManualCombatState(nextCombatState);
      setManualControl(true);
      setFollowTarget("local-player");
      setManualActor(nextActor);
      setTemporarySetupStatus(source === "startup" ? "Loaded saved setup" : "Setup loaded");
    });

    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastTemporarySetupSource = source;
      viewport.dataset.lastTemporarySetupLoadoutId = snapshot.loadoutId;
      viewport.dataset.lastTemporarySetupInventoryCount = String(inventorySlots.filter(Boolean).length);
      viewport.dataset.lastTemporarySetupEquipmentCount = String(equipmentItems.size);
    }
  };

  const applyRuntimeNhStakeSetupPreset = (): void => {
    closeContextMenu();
    clearSelectedTargetMode("nh-stake-setup");
    setPlaying(false);
    setFollowLive(false);
    const loadoutId = RUNTIME_NH_STAKE_LOADOUT_ID;
    const inventorySlots = normalizeNhInventorySlots(
      RUNTIME_NH_STAKE_INVENTORY_ITEM_IDS.map((itemId) => ({ itemId, quantity: 1 }))
    );
    const equipmentItems = new Map(RUNTIME_NH_STAKE_EQUIPMENT_ENTRIES);
    const visibleEquipment = visibleEquipmentFromRuntimeItemIdsBySlot(
      equipmentItems,
      inventoryItemDefinitionsRef.current
    );
    const inventoryItems = visibleEquipmentItemsFromRuntimeInventory(inventorySlots, inventoryItemDefinitionsRef.current);
    const gearProfile = inferNhSelectedGearProfile({
      equipment: visibleEquipment,
      inventoryItems
    });
    const resetSupplies = runtimeSuppliesFromInventorySlots(inventorySlots);
    const localActor = manualActorRef.current;
    const opponentActor = manualOpponentRef.current;
    const freshCombatState = createRuntimePlayerCombatState({
      localTile: localActor.tile,
      opponentTile: opponentActor.tile,
      localLoadoutId: loadoutId,
      opponentLoadoutId: loadoutId,
      localAttackSetIndex: visibleSnapshotRef.current.hud.attackSet ?? 0,
      localLevels: runtimePlayerCombatDefaultLevels,
      opponentLevels: runtimePlayerCombatDefaultLevels,
      localFixedLevels: runtimePlayerCombatDefaultLevels,
      opponentFixedLevels: runtimePlayerCombatDefaultLevels,
      localPrayerPoints: { current: 99, fixed: 99 },
      opponentPrayerPoints: { current: 99, fixed: 99 },
      localSupplies: resetSupplies,
      opponentSupplies: resetSupplies,
      localSpecialEnergy: 100,
      opponentSpecialEnergy: 100,
      combatStartTick: NH_TRAINER_MANUAL_START_PENDING_TICK
    });
    const nextCombatState = syncRuntimePlayerCombatStateToInput(freshCombatState, {
      tiles: {
        "local-player": localActor.tile,
        opponent: opponentActor.tile
      },
      loadouts: {
        "local-player": loadoutId,
        opponent: loadoutId
      },
      equipment: {
        "local-player": visibleEquipment,
        opponent: visibleEquipment
      },
      gearProfiles: {
        "local-player": gearProfile,
        opponent: gearProfile
      },
      levels: {
        "local-player": runtimePlayerCombatDefaultLevels,
        opponent: runtimePlayerCombatDefaultLevels
      },
      fixedLevels: {
        "local-player": runtimePlayerCombatDefaultLevels,
        opponent: runtimePlayerCombatDefaultLevels
      },
      prayerPoints: {
        "local-player": { current: 99, fixed: 99 },
        opponent: { current: 99, fixed: 99 }
      },
      prayers: {
        "local-player": [],
        opponent: []
      },
      clientCycle: Math.floor(performance.now() / NH_CLIENT_CYCLE_MS)
    });
    const nextAppearance = runtimeAppearanceFromEquipmentItems(
      equipmentItems,
      runtimeLoadoutAppearance(loadoutId)
    );
    const nextLocalActor: ManualActorState = {
      ...teleportManualActorToTile(localActor, localActor.tile),
      loadoutId,
      appearance: nextAppearance,
      sequenceName: manualActorBaseSequenceName(
        localActor.sequenceName,
        loadoutId,
        inventoryEquipmentDefinitionsRef.current,
        weaponTypeDefinitionsRef.current,
        actorSequenceDefinitionsRef.current
      )
    };
    const nextOpponentActor: ManualActorState = {
      ...teleportManualActorToTile(opponentActor, opponentActor.tile),
      loadoutId,
      appearance: nextAppearance,
      sequenceName: manualActorBaseSequenceName(
        opponentActor.sequenceName,
        loadoutId,
        inventoryEquipmentDefinitionsRef.current,
        weaponTypeDefinitionsRef.current,
        actorSequenceDefinitionsRef.current
      )
    };

    inventoryOverrideRef.current = inventorySlots;
    groundItemsRef.current = [];
    pendingGroundItemPickupRef.current = null;
    equipmentOverrideRef.current = equipmentItems;
    manualCombatStateRef.current = nextCombatState;
    manualFightStartPendingRef.current = true;
    manualActorRef.current = nextLocalActor;
    manualOpponentRef.current = nextOpponentActor;
    manualOpponentFightEngagedRef.current = false;
    manualOpponentTargetTrackingRef.current = emptyRuntimePolicyTargetTrackingState;
    manualOpponentPolicyEpisodeStartTickRef.current = nextCombatState.tick;
    manualOpponentNextPolicyRepositionTickRef.current = 0;
    manualOpponentObservedSelfMovementRef.current = manualPolicyStationaryMovementView;
    manualOpponentObservedLocalAppearanceRef.current = manualPolicyActorAppearanceView(
      nextLocalActor,
      nextCombatState.actors["local-player"],
      nextCombatState.tick,
      equipmentItems,
      inventoryItemDefinitionsRef.current,
      nextCombatState.actors["local-player"].activePrayers,
      manualPolicyStationaryMovementView,
      inventorySlots
    );
    ensureLocalActorEquipmentModel(equipmentItems, loadoutId, "local-player");
    ensureLocalActorEquipmentModel(equipmentItems, loadoutId, "opponent");
    unstable_batchedUpdates(() => {
      setInventoryOverride(inventorySlots);
      setGroundItems([]);
      setEquipmentOverride(() => equipmentItems);
      setHudOverride((current) => ({
        ...(current?.attackSet === undefined ? {} : { attackSet: current.attackSet }),
        ...(current?.autoRetaliate === undefined ? {} : { autoRetaliate: current.autoRetaliate }),
        prayers: {} as NhPrayerStates
      }));
      setManualFightStartPending(true);
      setManualCombatState(nextCombatState);
      setManualControl(true);
      setFollowTarget("local-player");
      setManualActor(nextLocalActor);
      setManualOpponent(nextOpponentActor);
      setTemporarySetupStatus("NH stake loaded");
    });

    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastTemporarySetupSource = "nh-stake";
      viewport.dataset.lastTemporarySetupRequiresStart = "true";
      viewport.dataset.lastTemporarySetupLoadoutId = loadoutId;
      viewport.dataset.lastTemporarySetupInventoryCount = String(inventorySlots.filter(Boolean).length);
      viewport.dataset.lastTemporarySetupEquipmentCount = String(equipmentItems.size);
      viewport.dataset.lastNhStakeInventoryItemIds = RUNTIME_NH_STAKE_INVENTORY_ITEM_IDS.join(",");
      viewport.dataset.lastNhStakeEquipmentItemIds = [...equipmentItems.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([, itemId]) => itemId)
        .join(",");
      viewport.dataset.lastNhStakeOpponentEquipmentWeapon = String(
        nextCombatState.actors.opponent.equipment.weapon?.itemId ?? ""
      );
    }
  };

  const saveTemporaryCurrentSetup = (): void => {
    const inventorySlots = normalizeNhInventorySlots(
      inventoryOverrideRef.current ?? visibleSnapshotRef.current.inventory
    );
    const equipmentItems =
      equipmentOverrideRef.current ??
      localPlayerEquipmentItemIdsBySlot(visibleSnapshotRef.current, inventoryEquipmentDefinitionsRef.current);
    const snapshot: TemporarySavedSetupSnapshot = {
      version: 1,
      savedAt: Date.now(),
      loadoutId: manualCombatStateRef.current.actors["local-player"].loadoutId,
      inventory: inventorySlots,
      equipment: [...equipmentItems.entries()].sort((left, right) => left[0] - right[0])
    };
    const saved = writeTemporarySavedSetupSnapshot(snapshot);
    setTemporarySetupStatus(saved ? "Setup saved" : "Setup save failed");

    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastTemporarySetupSaved = String(saved);
      viewport.dataset.lastTemporarySetupSavedAt = String(snapshot.savedAt);
      viewport.dataset.lastTemporarySetupLoadoutId = snapshot.loadoutId;
      viewport.dataset.lastTemporarySetupInventoryCount = String(inventorySlots.filter(Boolean).length);
      viewport.dataset.lastTemporarySetupEquipmentCount = String(equipmentItems.size);
      viewport.dataset.temporarySetupStorageKey = NH_TEMPORARY_SAVED_SETUP_STORAGE_KEY;
    }
  };

  const resetTemporarySetupToDefault = (): void => {
    const cleared = clearTemporarySavedSetupSnapshot();
    applyRuntimeNhStakeSetupPreset();
    setTemporarySetupStatus(cleared ? "Default setup restored" : "Default setup restored; storage unchanged");
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastTemporarySetupResetDefault = "true";
      viewport.dataset.lastTemporarySetupResetClearedStorage = String(cleared);
      viewport.dataset.lastTemporarySetupResetStorageKey = NH_TEMPORARY_SAVED_SETUP_STORAGE_KEY;
    }
  };

  const startManualFightCountdown = (): void => {
    if (onBotDifficultyChange && (botPolicyLoadState !== "loaded" || policy === null)) {
      return;
    }
    const state = manualCombatStateRef.current;
    if (
      isRuntimePlayerCombatActorDead(state.actors["local-player"], state.tick) ||
      isRuntimePlayerCombatActorDead(state.actors.opponent, state.tick)
    ) {
      return;
    }
    const nextCombatState: RuntimePlayerCombatState = {
      ...state,
      combatStartTick: state.tick + runtimePlayerCombatFightCountdownTicks
    };
    manualFightStartPendingRef.current = false;
    manualCombatStateRef.current = nextCombatState;
    clearSelectedTargetMode("manual-start-countdown");
    closeContextMenu();
    unstable_batchedUpdates(() => {
      setManualFightStartPending(false);
      setManualCombatState(nextCombatState);
      setPlaying(false);
      setFollowLive(false);
      setManualControl(true);
      setFollowTarget("local-player");
    });
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastManualFightStart = "true";
      viewport.dataset.lastManualFightStartTick = String(state.tick);
      viewport.dataset.lastManualFightCombatStartTick = String(nextCombatState.combatStartTick);
    }
  };

  const restoreLocalSpecialEnergyForTesting = (): void => {
    const nextCombatState = runtimePlayerCombatStateWithLocalSpecialEnergy(manualCombatStateRef.current, 100);
    manualCombatStateRef.current = nextCombatState;
    setManualCombatState(nextCombatState);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastTemporarySpecRestore = "100";
      viewport.dataset.lastTemporarySpecRestoreSource = "temporary-dev-control";
    }
  };

  const toggleLocalFreezeBypassForTesting = (): void => {
    const nextEnabled = !localFreezeBypassRef.current;
    localFreezeBypassRef.current = nextEnabled;
    setLocalFreezeBypass(nextEnabled);
    if (nextEnabled) {
      const nextCombatState = runtimePlayerCombatStateWithLocalFreezeBypass(manualCombatStateRef.current);
      if (nextCombatState !== manualCombatStateRef.current) {
        manualCombatStateRef.current = nextCombatState;
        setManualCombatState(nextCombatState);
      }
    }
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.temporaryFreezeBypass = String(nextEnabled);
      viewport.dataset.temporaryFreezeBypassSource = "temporary-dev-control";
    }
  };

  const queueCombatSpecialAfterPendingItemPackets = (command: NhCombatSpecialCommand): boolean => {
    const pendingItemPackets = itemActionQueueRef.current.snapshot();
    if (pendingItemPackets.length === 0) {
      return false;
    }

    const queuedAtMs = performance.now();
    const readyAtMs = nextNhGameTickAt(runtimeTickOriginMsRef.current, queuedAtMs);
    queuedPlayerCombatPacketsRef.current.push({
      kind: "special",
      specialCommand: command,
      position: command.position,
      queuedAtMs,
      readyAtMs
    });

    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      // Source: Player.checkLogout() decodes queued packets before Player.process(); a pending Equipment.equip()
      // must therefore land before TabCombat child 36 calls PlayerCombat.toggleSpecial().
      viewport.dataset.lastCombatSpecialQueuedForTick = "true";
      viewport.dataset.lastCombatSpecialQueuedAfterPendingInventory = "true";
      viewport.dataset.lastCombatSpecialQueuedPendingItemCount = String(pendingItemPackets.length);
      viewport.dataset.lastCombatSpecialQueuedReadyAtMs = String(readyAtMs);
      viewport.dataset.lastCombatSpecialQueuedAtMs = String(queuedAtMs);
      viewport.dataset.lastCombatSpecialResolvedSource = "queued-pending";
      viewport.dataset.lastCombatSpecialQueuedForTickProcessed = "false";
    }

    scheduleReadyItemActionProcessing();
    return true;
  };

  const dispatchCombatSpecialAction = (
    command: NhCombatSpecialCommand,
    source: "immediate" | "queued" = "immediate"
  ): void => {
    closeContextMenu();
    clearSelectedInventoryItem("combat-special-action");
    clearSelectedSpell("combat-special-action");
    setPlaying(false);
    setFollowLive(false);
    if (source === "immediate" && queueCombatSpecialAfterPendingItemPackets(command)) {
      return;
    }
    const sourceControl = command.sourceControl;
    const specialControl = command.specialBar ?? command.specialOrb ?? null;
    const specialActionChildId = specialControl?.actionChildId ?? null;
    const specialActionWidgetId = specialControl?.actionWidgetId ?? null;
    const specialSourceActionCount = specialControl?.actions.length ?? 0;
    const scene = command.specialAvailable ? ensureManualRuntimeScene() : null;
    const toggled = scene ? toggleRuntimePlayerCombatSpecial(scene.combatState, "local-player") : null;
    const nextActive = toggled?.specialActive ?? false;
    const nextEnergy = toggled?.specialEnergy ?? command.specialEnergy;
    const mutation = toggled?.mutation ?? "noop-no-special";
    const queuedGraniteMaulSpecs = toggled?.queuedGraniteMaulSpecs ?? 0;
    if (toggled) {
      manualCombatStateRef.current = toggled.state;
      setManualCombatState(toggled.state);
      setManualControl(true);
      setFollowTarget("local-player");
      if (scene) {
        manualActorRef.current = scene.localActor;
        manualOpponentRef.current = scene.opponentActor;
        setManualActor(scene.localActor);
        setManualOpponent(scene.opponentActor);
      }
      setHudOverride((current) => {
        if (!current) {
          return current;
        }
        const { specialActive: _specialActive, specialEnergy: _specialEnergy, ...rest } = current;
        return Object.keys(rest).length === 0 ? null : rest;
      });
    }
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastCombatControlKind = "special-attack";
      viewport.dataset.lastCombatSpecialSourceControl = sourceControl;
      viewport.dataset.lastCombatSpecialAction = command.actionText;
      viewport.dataset.lastCombatSpecialActionChildId = specialActionChildId === null ? "" : String(specialActionChildId);
      viewport.dataset.lastCombatSpecialActionWidgetId = specialActionWidgetId === null ? "" : String(specialActionWidgetId);
      viewport.dataset.lastCombatSpecialActive = String(nextActive);
      viewport.dataset.lastCombatSpecialActiveVarpId = String(command.specialActiveVarpId);
      viewport.dataset.lastCombatSpecialAvailable = String(command.specialAvailable);
      viewport.dataset.lastCombatSpecialDrainPercent = String(command.specialDrainPercent);
      viewport.dataset.lastCombatSpecialDrainSource = command.specialDrainSource;
      viewport.dataset.lastCombatSpecialEnergy = String(nextEnergy);
      viewport.dataset.lastCombatSpecialEnergyVarpId = String(command.specialEnergyVarpId);
      viewport.dataset.lastCombatSpecialMutation = mutation;
      viewport.dataset.lastCombatSpecialPreviousActive = String(command.specialActive);
      viewport.dataset.lastCombatSpecialQueuedGraniteMaulSpecs = String(queuedGraniteMaulSpecs);
      viewport.dataset.lastCombatSpecialQueuedForTickProcessed = source === "queued" ? "true" : "false";
      viewport.dataset.lastCombatSpecialReason = toggled?.reason ?? "";
      viewport.dataset.lastCombatSpecialResolvedSource = source;
      viewport.dataset.lastCombatSpecialSourceActionCount = String(specialSourceActionCount);
      viewport.dataset.lastCombatSpecialSourceHandler = "PlayerCombat.toggleSpecial";
      viewport.dataset.lastCombatSpecialWeaponItemId = command.weaponItemId === null ? "" : String(command.weaponItemId);
      viewport.dataset.lastCombatSpecialWeaponName = command.weaponName;
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-combat-special", {
        detail: {
          actionText: command.actionText,
          actionChildId: specialActionChildId,
          actionWidgetId: specialActionWidgetId,
          mutation,
          sourceControl,
          specialActive: nextActive,
          specialActiveVarpId: command.specialActiveVarpId,
          specialAvailable: command.specialAvailable,
          specialDrainPercent: command.specialDrainPercent,
          specialDrainSource: command.specialDrainSource,
          specialEnergy: nextEnergy,
          specialEnergyVarpId: command.specialEnergyVarpId,
          queuedGraniteMaulSpecs,
          reason: toggled?.reason ?? null,
          sourceActionCount: specialSourceActionCount,
          sourceHandler: "PlayerCombat.toggleSpecial",
          weaponItemId: command.weaponItemId,
          weaponName: command.weaponName,
          position: command.position
        }
      })
    );
  };

  const dispatchPrayerAction = (command: NhPrayerSlotCommand): void => {
    closeContextMenu();
    clearSelectedInventoryItem("prayer-action");
    clearSelectedSpell("prayer-action");
    setPlaying(false);
    setFollowLive(false);
    const previousActivePrayerIds = command.activePrayerIds;
    const currentPrayers = Object.fromEntries(
      previousActivePrayerIds.map((id) => [id, true])
    ) as NhPrayerStates;
    const transition = nhTogglePrayerState(currentPrayers, command.definition);
    const nextActive = transition.prayers[command.definition.id] === true;
    const nextActivePrayerIds = nhActivePrayerIds(transition.prayers);
    hudPrayersRef.current = transition.prayers;
    const nextCombatState = setRuntimePlayerCombatPrayers(
      manualCombatStateRef.current,
      "local-player",
      runtimePrayerIdsFromNhStates(transition.prayers)
    );
    manualCombatStateRef.current = nextCombatState;
    setManualCombatState(nextCombatState);
    setHudOverride((current) => ({
      ...(current ?? {}),
      prayers: transition.prayers
    }));
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastPrayerAction = command.actionText;
      viewport.dataset.lastPrayerActionText = command.actionText;
      viewport.dataset.lastPrayerActive = String(nextActive);
      viewport.dataset.lastPrayerActivePrayerIds = nextActivePrayerIds.join(",");
      viewport.dataset.lastPrayerChildId = String(command.slot.childId);
      viewport.dataset.lastPrayerControlKind = "prayer-toggle";
      viewport.dataset.lastPrayerDeactivatedIds = transition.deactivatedPrayerIds.join(",");
      viewport.dataset.lastPrayerDisallowedIds = command.disallowedPrayerIds.join(",");
      viewport.dataset.lastPrayerDrain = String(command.definition.drain);
      viewport.dataset.lastPrayerGridColumn = String(command.slot.gridColumn);
      viewport.dataset.lastPrayerGridRow = String(command.slot.gridRow);
      viewport.dataset.lastPrayerHeadIcon =
        command.definition.headIcon === null ? "" : String(command.definition.headIcon);
      viewport.dataset.lastPrayerId = command.definition.id;
      viewport.dataset.lastPrayerLabel = command.slot.label;
      viewport.dataset.lastPrayerLevel = String(command.definition.level);
      viewport.dataset.lastPrayerMutation = transition.mutation;
      viewport.dataset.lastPrayerPoints = String(visibleSnapshot.hud.prayer);
      viewport.dataset.lastPrayerPreviousActive = String(command.active);
      viewport.dataset.lastPrayerPreviousActivePrayerIds = previousActivePrayerIds.join(",");
      viewport.dataset.lastPrayerSourceActionCount = String(command.slot.actions.length);
      viewport.dataset.lastPrayerSourceEnumName = command.definition.enumName;
      viewport.dataset.lastPrayerSourceHandler = "PlayerPrayer.toggle";
      viewport.dataset.lastPrayerSourceOrder = String(command.slot.sourceOrder);
      viewport.dataset.lastPrayerSourceOrdinal = String(command.definition.ordinal);
      viewport.dataset.lastPrayerSoundId = String(command.definition.soundId);
      viewport.dataset.lastPrayerTabHandler = "TabPrayer.ordinalPlusFive";
      viewport.dataset.lastPrayerVarpbitId = String(command.definition.varpbitId);
      viewport.dataset.lastPrayerWidgetId = String(command.slot.widgetId);
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-prayer-toggle", {
        detail: {
          actionText: command.actionText,
          active: nextActive,
          activePrayerIds: nextActivePrayerIds,
          childId: command.slot.childId,
          deactivatedPrayerIds: transition.deactivatedPrayerIds,
          disallowedPrayerIds: command.disallowedPrayerIds,
          drain: command.definition.drain,
          enumName: command.definition.enumName,
          gridColumn: command.slot.gridColumn,
          gridRow: command.slot.gridRow,
          headIcon: command.definition.headIcon,
          level: command.definition.level,
          mutation: transition.mutation,
          prayerId: command.definition.id,
          prayerLabel: command.slot.label,
          prayerPoints: visibleSnapshot.hud.prayer,
          previousActive: command.active,
          previousActivePrayerIds,
          sourceActionCount: command.slot.actions.length,
          sourceHandler: "PlayerPrayer.toggle",
          sourceOrder: command.slot.sourceOrder,
          sourceOrdinal: command.definition.ordinal,
          soundId: command.definition.soundId,
          tabHandler: "TabPrayer.ordinalPlusFive",
          varpbitId: command.definition.varpbitId,
          widgetId: command.slot.widgetId,
          position: command.position
        }
      })
    );
  };

  const sideTabContextEntries = (command: NhSideTabCommand): readonly NhHudWidgetContextMenuEntry[] => {
    const sourceEntries: NhHudWidgetContextMenuEntry[] = command.sourceActions.map((action) => ({
      action: "hud-widget-action",
      actionText: action.actionText,
      targetText: "",
      opcode: action.menuOpcode,
      identifier: action.actionIndex,
      argument1: command.tab.childId,
      argument2: command.tab.widgetId,
      widgetKind: "side-tab",
      actionIndex: action.actionIndex,
      command: {
        ...command,
        actionText: action.actionText,
        actionIndex: action.actionIndex,
        menuOpcode: action.menuOpcode
      }
    }));
    if (command.tab.id === "prayer") {
      return [
        {
          action: "hud-widget-action",
          actionText: prayerReorderingEnabled ? "Disable prayer reordering" : "Enable prayer reordering",
          targetText: "",
          opcode: widgetHighActionOpcode,
          identifier: 3,
          argument1: command.tab.childId,
          argument2: command.tab.widgetId,
          widgetKind: "prayer-reordering-toggle",
          actionIndex: 3,
          command,
          enabled: prayerReorderingEnabled
        },
        {
          action: "hud-widget-action",
          actionText: "Enable prayer filtering",
          targetText: "",
          opcode: widgetHighActionOpcode,
          identifier: 2,
          argument1: command.tab.childId,
          argument2: command.tab.widgetId,
          widgetKind: "prayer-filtering-placeholder",
          actionIndex: 2,
          command,
          enabled: false
        },
        ...sourceEntries
      ];
    }
    if (command.tab.id === "magic") {
      return [
        {
          action: "hud-widget-action",
          actionText: spellbookReorderingEnabled ? "Disable spell reordering" : "Enable spell reordering",
          targetText: "",
          opcode: widgetHighActionOpcode,
          identifier: 3,
          argument1: command.tab.childId,
          argument2: command.tab.widgetId,
          widgetKind: "spellbook-reordering-toggle",
          actionIndex: 3,
          command,
          enabled: spellbookReorderingEnabled
        },
        {
          action: "hud-widget-action",
          actionText: "Enable spell filtering",
          targetText: "",
          opcode: widgetHighActionOpcode,
          identifier: 2,
          argument1: command.tab.childId,
          argument2: command.tab.widgetId,
          widgetKind: "spellbook-filtering-placeholder",
          actionIndex: 2,
          command,
          enabled: false
        },
        ...sourceEntries
      ];
    }
    return sourceEntries;
  };

  const chatboxContextEntries = (command: NhChatboxButtonCommand): readonly NhHudWidgetContextMenuEntry[] =>
    command.sourceActions.map((action) => ({
      action: "hud-widget-action",
      actionText: action.actionText,
      targetText: command.widget.widget.dataText ?? "",
      opcode: action.menuOpcode,
      identifier: action.actionIndex,
      argument1: command.widget.widget.childId,
      argument2: command.widget.widget.id,
      widgetKind: "chatbox",
      actionIndex: action.actionIndex,
      command: {
        ...command,
        actionText: action.actionText,
        actionIndex: action.actionIndex,
        menuOpcode: action.menuOpcode
      }
    }));

  const dispatchHudWidgetContextEntry = (entry: NhHudWidgetContextMenuEntry): void => {
    if (entry.widgetKind === "side-tab") {
      dispatchSideTabAction(entry.command);
      return;
    }
    if (entry.widgetKind === "prayer-reordering-toggle") {
      setPrayerReorderingEnabled(!entry.enabled);
      return;
    }
    if (entry.widgetKind === "spellbook-reordering-toggle") {
      setSpellbookReorderingEnabled(!entry.enabled);
      return;
    }
    if (entry.widgetKind === "prayer-filtering-placeholder" || entry.widgetKind === "spellbook-filtering-placeholder") {
      return;
    }
    if (entry.widgetKind === "chatbox") {
      dispatchChatboxAction(entry.command);
    }
  };

  const equipmentItemContextEntries = (command: NhEquipmentItemCommand): readonly NhEquipmentItemContextMenuEntry[] => {
    const itemDefinition = inventoryItemDefinitions.get(command.itemId);
    const targetText = `${equipmentItemNameColorTag}${command.itemName}`;
    const sourceActionText = (actionIndex: number): string => command.slot.actions[actionIndex - 1] ?? "";
    const entry = (
      actionText: string,
      action: NhEquipmentItemContextMenuEntry["action"],
      actionIndex: number
    ): NhEquipmentItemContextMenuEntry => ({
      actionText,
      targetText,
      opcode: equipmentItemOpcodeForActionIndex(actionIndex),
      identifier: actionIndex,
      argument1: command.slot.childId,
      argument2: command.slot.widgetId,
      action,
      actionIndex,
      childId: command.slot.childId,
      itemId: command.itemId,
      itemName: command.itemName,
      serverSlot: command.slot.serverSlot,
      slotId: command.slot.id,
      sourceActionText: sourceActionText(actionIndex),
      widgetId: command.slot.widgetId
    });

    const entries: NhEquipmentItemContextMenuEntry[] = [
      entry("Examine", "equipment-examine", 10)
    ];
    for (let actionIndex = 6; actionIndex >= 2; actionIndex -= 1) {
      const actionText = itemDefinition?.equipmentOptions[actionIndex - 1];
      if (actionText) {
        entries.push(entry(actionText, "equipment-action", actionIndex));
      }
    }
    entries.push(entry("Remove", "equipment-remove", 1));
    return entries;
  };

  const inventoryContextEntries = (command: NhInventorySlotCommand): readonly NhInventoryContextMenuEntry[] =>
    buildNhInventoryContextEntries({
      slot: command.slot,
      slotIndex: command.slotIndex,
      widgetId: command.widgetId,
      itemName: command.itemName,
      itemDefinition: inventoryItemDefinitions.get(command.slot.itemId),
      selectedItem: selectedInventoryItem,
      selectedSpell
    });

  const emptyEquipmentRemoveMutationResolution = (
    mutation: RuntimeEquipmentRemoveMutationResolution["mutation"],
  freeInventorySlot: number
): RuntimeEquipmentRemoveMutationResolution => ({
  inventorySlots: null,
  equipmentItems: null,
  hud: null,
  mutation,
  freeInventorySlot,
  equipmentSlotCleared: false
});

  const resolveEquipmentRemoveMutation = (
    entry: NhEquipmentItemContextMenuEntry
  ): RuntimeEquipmentRemoveMutationResolution => {
    const sourceInventorySlots = normalizeNhInventorySlots(visibleSnapshot.inventory);
    const freeInventorySlot = sourceInventorySlots.findIndex((slot) => slot === null);
    if (entry.action !== "equipment-remove") {
      return emptyEquipmentRemoveMutationResolution("", freeInventorySlot);
    }
    if (freeInventorySlot === -1) {
      return emptyEquipmentRemoveMutationResolution("blocked-inventory-full", freeInventorySlot);
    }

    const nextInventorySlots = [...sourceInventorySlots];
    nextInventorySlots[freeInventorySlot] = { itemId: entry.itemId, quantity: 1 };
    const currentEquipment =
      equipmentOverride ?? localPlayerEquipmentItemIdsBySlot(visibleSnapshot, inventoryEquipmentDefinitionsRef.current);
    const nextEquipment = new Map(currentEquipment);
    nextEquipment.delete(entry.serverSlot);
    return {
      inventorySlots: nextInventorySlots,
      equipmentItems: nextEquipment,
      hud: entry.serverSlot === 3 ? { specialActive: false, weaponTypeConfig: undefined, autocast: 0, defensiveCast: false } : null,
      mutation: "equipment-unequip",
      freeInventorySlot,
      equipmentSlotCleared: true
    };
  };

  const applyResolvedEquipmentRemoveMutation = (resolution: RuntimeEquipmentRemoveMutationResolution): void => {
    if (resolution.inventorySlots) {
      inventoryOverrideRef.current = resolution.inventorySlots;
      setInventoryOverride(resolution.inventorySlots);
    }
    if (resolution.equipmentItems) {
      equipmentOverrideRef.current = resolution.equipmentItems;
      setEquipmentOverride(() => resolution.equipmentItems);
    }
    if (resolution.hud) {
      setHudOverride((current) => ({
        ...(current ?? {}),
        ...resolution.hud
      }));
    }
  };

  const queueEquipmentRemoveMutation = (
    entry: NhEquipmentItemContextMenuEntry,
    resolution: RuntimeEquipmentRemoveMutationResolution
  ): boolean => {
    if (entry.action !== "equipment-remove" || !resolution.equipmentSlotCleared) {
      return false;
    }
    const queuedAtMs = performance.now();
    const readyAtMs = nextNhGameTickAt(runtimeTickOriginMsRef.current, queuedAtMs);
    itemActionQueueRef.current.push({
      kind: "unequip",
      slotIndex: resolution.freeInventorySlot,
      itemId: entry.itemId,
      queuedAtMs,
      readyAtMs,
      contextEntry: { resolution, slotId: entry.slotId } satisfies QueuedEquipmentRemoveContext
    });
    setPendingEquipmentRemoveSlotIds(new Set([...pendingEquipmentRemoveSlotIds, entry.slotId]));
    scheduleReadyItemActionProcessing();
    return true;
  };

  const dispatchEquipmentItemAction = (
    entry: NhEquipmentItemContextMenuEntry,
    activationSource: "default" | "context-menu"
  ): void => {
    closeContextMenu();
    clearSelectedInventoryItem("equipment-item-action");
    clearSelectedSpell("equipment-item-action");
    setPlaying(false);
    setFollowLive(false);
    const removeMutation = resolveEquipmentRemoveMutation(entry);
    const freeInventorySlot = removeMutation.freeInventorySlot;
    const mutation = removeMutation.mutation;
    const serverMutationHandler =
      entry.action === "equipment-remove" ? "Equipment.unequip" : entry.action === "equipment-examine" ? "Item.examine" : "ItemAction.equipmentActions";
    if (!queueEquipmentRemoveMutation(entry, removeMutation)) {
      applyResolvedEquipmentRemoveMutation(removeMutation);
    }
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastEquipmentItemActivation = activationSource;
      viewport.dataset.lastEquipmentItemAction = entry.actionText;
      viewport.dataset.lastEquipmentItemActionIndex = String(entry.actionIndex);
      viewport.dataset.lastEquipmentItemActionKind = entry.action;
      viewport.dataset.lastEquipmentItemArgument1 = String(entry.argument1 ?? "");
      viewport.dataset.lastEquipmentItemArgument2 = String(entry.argument2 ?? "");
      viewport.dataset.lastEquipmentItemChildId = String(entry.childId);
      viewport.dataset.lastEquipmentItemEquipmentSlotCleared =
        removeMutation.equipmentSlotCleared ? "true" : "false";
      viewport.dataset.lastEquipmentItemIdentifier = String(entry.identifier ?? "");
      viewport.dataset.lastEquipmentItemInventoryFreeSlot = freeInventorySlot === -1 ? "" : String(freeInventorySlot);
      viewport.dataset.lastEquipmentItemInventoryNextItemId =
        removeMutation.equipmentSlotCleared ? String(entry.itemId) : "";
      viewport.dataset.lastEquipmentItemItemId = String(entry.itemId);
      viewport.dataset.lastEquipmentItemItemName = entry.itemName;
      viewport.dataset.lastEquipmentItemMutation = mutation;
      viewport.dataset.lastEquipmentItemOpcode = String(entry.opcode);
      viewport.dataset.lastEquipmentItemServerHandler = "TabEquipment.itemAction";
      viewport.dataset.lastEquipmentItemServerMutationHandler = serverMutationHandler;
      viewport.dataset.lastEquipmentItemServerSlot = String(entry.serverSlot);
      viewport.dataset.lastEquipmentItemSlotId = entry.slotId;
      viewport.dataset.lastEquipmentItemSourceActionText = entry.sourceActionText;
      viewport.dataset.lastEquipmentItemSourceWidgetHandler = "MusicPatchNode.method3842";
      viewport.dataset.lastEquipmentItemWidgetId = String(entry.widgetId);
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-equipment-item-action", {
        detail: {
          activationSource,
          action: entry.action,
          actionText: entry.actionText,
          actionIndex: entry.actionIndex,
          childId: entry.childId,
          equipmentSlotCleared: removeMutation.equipmentSlotCleared,
          freeInventorySlot,
          inventoryNextItemId: removeMutation.equipmentSlotCleared ? entry.itemId : undefined,
          itemId: entry.itemId,
          itemName: entry.itemName,
          mutation,
          opcode: entry.opcode,
          serverHandler: "TabEquipment.itemAction",
          serverMutationHandler,
          serverSlot: entry.serverSlot,
          slotId: entry.slotId,
          sourceActionText: entry.sourceActionText,
          sourceWidgetHandler: "MusicPatchNode.method3842",
          widgetId: entry.widgetId
        }
      })
    );
  };

  const ensureLocalActorEquipmentModel = (
    equipmentItems: RuntimeEquipmentItemIdsBySlot,
    loadoutId: RuntimeLoadoutId,
    actorId: RuntimeActorId = "local-player"
  ): void => {
    if (!playerModelSources || !animationFixtures) {
      return;
    }

    const localPose = visibleSnapshotRef.current.actors.find((pose) => pose.actorId === actorId);
    if (!localPose) {
      return;
    }

    const pose = runtimeActorPoseWithEquipmentItems(localPose, equipmentItems, loadoutId);
    const modelKey = runtimeActorModelKey(pose, animationFixtures);
    const modelInput = runtimeActorModelInput(pose, animationFixtures);
    setModels((current) => {
      if (current.has(modelKey)) {
        return current;
      }
      const next = new Map(current);
      next.set(modelKey, composeNhPlayerModel(playerModelSources, modelInput));
      return next;
    });
  };

  const applyInventoryActorLoadoutMutation = (
    loadoutId: RuntimeLoadoutId,
    appearance?: RuntimePlayerAppearance
  ): void => {
    const nextCombatState = setRuntimePlayerCombatLoadout(manualCombatStateRef.current, "local-player", loadoutId);
    const nextAttackSetIndex = nextCombatState.actors["local-player"].attackSetIndex;
    const snapshotActor = collisionMap
      ? snapManualActorToCollision(manualActorFromSnapshot(visibleSnapshotRef.current), collisionMap)
      : manualActorFromSnapshot(visibleSnapshotRef.current);
    const nextActor = {
      ...(manualControlRef.current ? manualActorRef.current : snapshotActor),
      loadoutId,
      appearance
    };
    manualCombatStateRef.current = nextCombatState;
    manualActorRef.current = nextActor;
    setManualCombatState(nextCombatState);
    writeStoredAttackSetIndex(nextAttackSetIndex);
    setPlaying(false);
    setFollowLive(false);
    setFollowTarget("local-player");
    setManualControl(true);
    setManualActor(nextActor);
    setHudOverride((current) => ({
      ...(current ?? {}),
      attackSet: nextAttackSetIndex,
      autocast: 0,
      defensiveCast: false
    }));
  };

  const emptyInventoryMutationResolution = (blockedReason: string | null = null): RuntimeInventoryMutationResolution => ({
    inventorySlots: null,
    equipmentItems: null,
    hud: null,
    inventoryMutation: null,
    actorLoadoutId: null,
    equipmentMutation: null,
    blockedReason
  });

  const resolveInventoryMutationFromState = (
    entry: NhInventoryContextMenuEntry,
    sourceSlots: readonly (RuntimeInventorySlot | null)[],
    currentEquipment: RuntimeEquipmentItemIdsBySlot,
    currentActorLoadoutId: RuntimeLoadoutId,
    validateSourceSlot = false
  ): RuntimeInventoryMutationResolution => {
    const directMutation = mutateNhInventorySlotsForAction(sourceSlots, entry);
    if (directMutation.mutation) {
      return {
        inventorySlots: directMutation.slots,
        equipmentItems: null,
        hud: null,
        inventoryMutation: directMutation.mutation,
        actorLoadoutId: null,
        equipmentMutation: null,
        blockedReason: null
      };
    }

    if (!isNhInventoryEquipEntry(entry)) {
      return emptyInventoryMutationResolution();
    }

    if (validateSourceSlot) {
      const selectedSlot = sourceSlots[entry.slotIndex];
      if (!selectedSlot || selectedSlot.itemId !== entry.itemId) {
        return emptyInventoryMutationResolution();
      }
    }

    const selectedDefinition = inventoryEquipmentDefinitionsRef.current.get(entry.itemId);
    if (!selectedDefinition || selectedDefinition.equipSlot === null) {
      return emptyInventoryMutationResolution();
    }

    const equipmentDefinitions = inventoryEquipmentDefinitionsRef.current;
    const equipSlot = selectedDefinition.equipSlot;
    const wornItemId = currentEquipment.get(equipSlot) ?? null;
    const selectedItemDefinition = inventoryItemDefinitionsRef.current.get(entry.itemId);
    const replacementItem =
      wornItemId === null || (wornItemId === entry.itemId && selectedItemDefinition?.stackable === true)
        ? null
        : { itemId: wornItemId, quantity: 1 };
    const swapMutation = replaceNhInventorySlot(
      sourceSlots,
      entry.slotIndex,
      replacementItem,
      "equipment-swap",
      entry.itemId
    );
    const nextEquipment = new Map(currentEquipment);
    let nextInventorySlots = swapMutation.slots;
    const addLastItemId = nhTwoHandedEquipmentAddLastItemId(
      equipSlot,
      selectedDefinition.twoHanded,
      currentEquipment,
      equipmentDefinitions
    );
    if (addLastItemId !== null) {
      nextEquipment.delete(equipSlot === 3 ? 5 : 3);
      const withAddedItem = addNhInventoryItemToFirstFreeSlot(nextInventorySlots, addLastItemId);
      if (!withAddedItem) {
        return emptyInventoryMutationResolution("not-enough-free-inventory-space");
      }
      nextInventorySlots = withAddedItem;
    }
    nextEquipment.set(equipSlot, entry.itemId);
    const weaponTypeConfig =
      equipSlot === 3 && selectedDefinition.weaponType
        ? weaponTypeDefinitionsRef.current.get(selectedDefinition.weaponType)?.config
        : undefined;
    const hud = weaponTypeConfig === undefined
      ? null
      : {
        specialActive: false,
        weaponTypeConfig
      };
    const nextLoadoutId = equipSlot === 3 ? runtimeWeaponLoadoutForItemId(entry.itemId) : null;
    const actorLoadoutId = nextLoadoutId && nextLoadoutId !== currentActorLoadoutId ? nextLoadoutId : null;
    return {
      inventorySlots: nextInventorySlots,
      equipmentItems: nextEquipment,
      hud,
      inventoryMutation: swapMutation.mutation,
      actorLoadoutId,
      equipmentMutation: {
        equipSlot,
        equippedItemId: entry.itemId,
        previousItemId: wornItemId,
        weaponType: selectedDefinition.weaponType ?? null,
        weaponTypeConfig,
        serverHandler: "Equipment.equip"
      },
      blockedReason: null
    };
  };

  const resolveVisibleInventoryMutation = (
    entry: NhInventoryContextMenuEntry
  ): RuntimeInventoryMutationResolution =>
    resolveInventoryMutationFromState(
      entry,
      normalizeNhInventorySlots(visibleSnapshot.inventory),
      equipmentOverride ?? localPlayerEquipmentItemIdsBySlot(visibleSnapshot, inventoryEquipmentDefinitionsRef.current),
      manualCombatStateRef.current.actors["local-player"].loadoutId
    );

  const applyResolvedInventoryMutation = (resolution: RuntimeInventoryMutationResolution): void => {
    if (resolution.inventorySlots) {
      inventoryOverrideRef.current = resolution.inventorySlots;
      setInventoryOverride(resolution.inventorySlots);
    }
    if (resolution.equipmentItems) {
      equipmentOverrideRef.current = resolution.equipmentItems;
      setEquipmentOverride(() => resolution.equipmentItems);
    }
    if (resolution.hud) {
      setHudOverride((current) => ({
        ...(current ?? {}),
        ...resolution.hud
      }));
    }
    if (resolution.actorLoadoutId) {
      applyInventoryActorLoadoutMutation(resolution.actorLoadoutId);
    }
  };

  const drainReadyPlayerCombatPackets = (nowMs: number): readonly QueuedPlayerCombatPacket[] => {
    if (queuedPlayerCombatPacketsRef.current.length === 0) {
      return [];
    }
    const readyPackets: QueuedPlayerCombatPacket[] = [];
    const waitingPackets: QueuedPlayerCombatPacket[] = [];
    for (const packet of queuedPlayerCombatPacketsRef.current) {
      if (nowMs >= packet.readyAtMs) {
        readyPackets.push(packet);
      } else {
        waitingPackets.push(packet);
      }
    }
    queuedPlayerCombatPacketsRef.current = waitingPackets;
    return readyPackets;
  };

  const processReadyPlayerCombatPackets = (packets: readonly QueuedPlayerCombatPacket[]): void => {
    for (const packet of packets) {
      if (packet.kind === "attack" && packet.entry) {
        applyPlayerAttackCommand(packet.entry, packet.position, "queued");
      }
      if (packet.kind === "spell" && packet.entry && packet.spellId) {
        applyPlayerSpellCommand(packet.entry, packet.position, packet.spellId, "queued");
      }
      if (packet.kind === "special" && packet.specialCommand) {
        dispatchCombatSpecialAction(packet.specialCommand, "queued");
      }
    }
  };

  const scheduleReadyItemActionProcessing = (): void => {
    const pendingActions = itemActionQueueRef.current.snapshot();
    const pendingPlayerPackets = queuedPlayerCombatPacketsRef.current;
    if (pendingActions.length === 0 && pendingPlayerPackets.length === 0) {
      return;
    }
    const nowMs = performance.now();
    const nextReadyAtMs = Math.min(
      ...pendingActions.map((action) => action.readyAtMs ?? action.queuedAtMs + NH_GAME_TICK_MS),
      ...pendingPlayerPackets.map((packet) => packet.readyAtMs)
    );
    if (itemActionProcessingTimerRef.current !== null) {
      window.clearTimeout(itemActionProcessingTimerRef.current);
    }
    itemActionProcessingTimerRef.current = window.setTimeout(() => {
      itemActionProcessingTimerRef.current = null;
      processReadyItemActions();
    }, Math.max(1, nextReadyAtMs - nowMs + 1));
  };

  const processReadyItemActions = (): void => {
    const nowMs = performance.now();
    const queuedActions = itemActionQueueRef.current.drainReady(nowMs, NH_GAME_TICK_MS);
    const readyPlayerPackets = drainReadyPlayerCombatPackets(nowMs);
    if (queuedActions.length === 0 && readyPlayerPackets.length === 0) {
      scheduleReadyItemActionProcessing();
      return;
    }

    let nextInventorySlots = inventoryOverrideRef.current ?? normalizeNhInventorySlots(visibleSnapshotRef.current.inventory);
    let nextEquipmentItems =
      equipmentOverrideRef.current ??
      localPlayerEquipmentItemIdsBySlot(visibleSnapshotRef.current, inventoryEquipmentDefinitionsRef.current);
    let nextHud: Partial<RuntimeHudState> | null = null;
    let nextActorLoadoutId = manualCombatStateRef.current.actors["local-player"].loadoutId;
    let inventoryChanged = false;
    let equipmentChanged = false;
    let actorLoadoutChanged = false;
    let inventoryEquipResetActions = false;
    let nextCombatState = manualCombatStateRef.current;
    let nextSupplyDelays = supplyDelaysRef.current;
    let inventoryConsumableApplied = false;
    let finalConsumableStats: SimStats | null = null;
    let finalConsumableSourceActor: ManualActorState | null = null;
    let finalConsumableItem: ConsumableId | null = null;
    let finalConsumableResult: ReturnType<typeof applyConsumable> | null = null;

    for (const action of queuedActions) {
      if (action.kind === "equip") {
        const context = action.contextEntry as QueuedInventoryEquipContext | undefined;
        if (context?.entry) {
          const resolution = resolveInventoryMutationFromState(
            context.entry,
            nextInventorySlots,
            nextEquipmentItems,
            nextActorLoadoutId,
            true
          );
          if (resolution.inventorySlots) {
            nextInventorySlots = resolution.inventorySlots;
            inventoryChanged = true;
          }
          if (resolution.equipmentItems) {
            nextEquipmentItems = resolution.equipmentItems;
            equipmentChanged = true;
          }
          if (resolution.hud) {
            nextHud = {
              ...(nextHud ?? {}),
              ...resolution.hud
            };
          }
          if (resolution.actorLoadoutId) {
            nextActorLoadoutId = resolution.actorLoadoutId;
            actorLoadoutChanged = true;
          }
          if (resolution.equipmentMutation) {
            inventoryEquipResetActions = true;
          }
        }
        continue;
      }
      if (action.kind === "eat" || action.kind === "drink") {
        const context = action.contextEntry as QueuedInventoryConsumableContext | undefined;
        if (!context?.entry) {
          continue;
        }
        const resolution = resolveInventoryMutationFromState(
          context.entry,
          nextInventorySlots,
          nextEquipmentItems,
          nextActorLoadoutId,
          true
        );
        const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
        if (!resolution.inventoryMutation || !resolution.inventorySlots) {
          if (viewport) {
            viewport.dataset.lastInventoryConsumableId = context.item;
            viewport.dataset.lastInventoryConsumableBlockedReason = "source-slot";
            viewport.dataset.lastInventoryMutation = "blocked-source-slot";
          }
          continue;
        }

        const state = nextCombatState;
        const localActor = state.actors["local-player"];
        const result = applyConsumable({
          stats: runtimeSimStatsFromActorAndHud(localActor, visibleSnapshotRef.current.hud),
          delays: nextSupplyDelays,
          attackTimer: localActor.attackTimer,
          currentTick: state.tick,
          item: context.item
        });
        if (!result.ok) {
          if (viewport) {
            viewport.dataset.lastInventoryConsumableId = context.item;
            viewport.dataset.lastInventoryConsumableBlockedReason = result.reason ?? "";
            viewport.dataset.lastInventoryMutation = `blocked-${result.reason ?? "consume"}`;
          }
          continue;
        }

        nextInventorySlots = resolution.inventorySlots;
        inventoryChanged = true;
        nextSupplyDelays = result.delays;
        const snapshot = visibleSnapshotRef.current;
        const sourceActor = manualControlRef.current
          ? manualActorRef.current
          : collisionMap
            ? snapManualActorToCollision(manualActorFromSnapshot(snapshot), collisionMap)
            : manualActorFromSnapshot(snapshot);
        // Source: Consumable.animEat() calls resetActions/animate but never rewrites the player's position.
        // Keep the combat actor's authoritative server tile if the render/manual actor is one frame behind.
        const consumeActor = sameNhTile(sourceActor.tile, localActor.tile)
          ? sourceActor
          : {
            ...sourceActor,
            tile: localActor.tile,
            renderTile: localActor.tile,
            clientPosition: nhClientPositionFromRuntimeTile(localActor.tile)
          };
        const actionDurationTicks = 3;
        const nextLocalActor: RuntimePlayerCombatActorState = {
          ...localActor,
          tile: localActor.tile,
          hitpoints: result.stats.hitpoints.current,
          maxHitpoints: result.stats.hitpoints.fixed,
          prayerPoints: result.stats.prayer.current,
          maxPrayerPoints: result.stats.prayer.fixed,
          levels: runtimeCombatLevelsFromSimStats(result.stats),
          supplyDelays: result.delays,
          attackTimer: result.attackTimer,
          actionSequenceName: "consume",
          actionStartedAtTick: state.tick,
          actionStartedAtClientCycle: Math.floor(nowMs / NH_CLIENT_CYCLE_MS),
          actionDurationTicks,
          actionUntilTick: state.tick + actionDurationTicks
        };
        nextCombatState = {
          ...state,
          actors: {
            ...state.actors,
            "local-player": nextLocalActor
          },
          events: [
            ...state.events,
            {
              kind: "supply",
              id: `${state.tick}-local-player-${context.item}-${action.slotIndex}-supply`,
              tick: state.tick,
              actorId: "local-player",
              item: context.item,
              healed: result.healed,
              previousHitpoints: localActor.hitpoints,
              nextHitpoints: result.stats.hitpoints.current,
              maxHitpoints: result.stats.hitpoints.fixed
            }
          ]
        };
        inventoryConsumableApplied = true;
        finalConsumableStats = result.stats;
        finalConsumableSourceActor = consumeActor;
        finalConsumableItem = context.item;
        finalConsumableResult = result;
        continue;
      }
      if (action.kind === "unequip") {
        const context = action.contextEntry as QueuedEquipmentRemoveContext | undefined;
        if (context?.resolution) {
          applyResolvedEquipmentRemoveMutation(context.resolution);
        }
      }
    }

    if (inventoryChanged) {
      inventoryOverrideRef.current = nextInventorySlots;
    }
    if (equipmentChanged) {
      equipmentOverrideRef.current = nextEquipmentItems;
    }
    if (inventoryEquipResetActions) {
      // Source: TabInventory.click -> Equipment.equip(item); player.resetActions(false, following != null, true).
      nextCombatState = resetRuntimePlayerCombatActorTarget(nextCombatState, "local-player");
    }
    if (inventoryConsumableApplied) {
      // Source: Consumable.eat/drink runs from queued inventory packets during the server tick.
      supplyDelaysRef.current = nextSupplyDelays;
    }
    if (nextCombatState !== manualCombatStateRef.current) {
      manualCombatStateRef.current = nextCombatState;
    }
    const nextActorAppearance = equipmentChanged
      ? runtimeAppearanceFromEquipmentItems(nextEquipmentItems, runtimeLoadoutAppearance(nextActorLoadoutId))
      : undefined;

    // Source-backed parity: Nh marks one Appearance update mask for the tick after Equipment.equip()
    // has handled the queued packets, so React and Three receive one final local-player appearance too.
    unstable_batchedUpdates(() => {
      if (equipmentChanged) {
        ensureLocalActorEquipmentModel(nextEquipmentItems, nextActorLoadoutId);
      }
      if (inventoryChanged) {
        setInventoryOverride(nextInventorySlots);
      }
      if (equipmentChanged) {
        setEquipmentOverride(() => nextEquipmentItems);
      }
      if (nextHud) {
        setHudOverride((current) => ({
          ...(current ?? {}),
          ...nextHud
        }));
      }
      if (actorLoadoutChanged || nextActorAppearance) {
        applyInventoryActorLoadoutMutation(nextActorLoadoutId, nextActorAppearance);
      }
      if (inventoryConsumableApplied && finalConsumableStats && finalConsumableSourceActor && finalConsumableItem && finalConsumableResult) {
        setManualCombatState(nextCombatState);
        setHudOverride((current) => ({
          ...(current ?? {}),
          ...runtimeHudOverrideFromSimStats(finalConsumableStats, visibleSnapshotRef.current.hud)
        }));
        hudCombatLevelsRef.current = runtimeCombatLevelsFromSimStats(finalConsumableStats);
        setPlaying(false);
        setFollowLive(false);
        manualControlRef.current = true;
        setManualControl(true);
        const nextManualActor = syncManualActorActionSequence(
          {
            ...finalConsumableSourceActor,
            sequenceName: "idle",
            animationCycle: 0
          },
          nextCombatState.actors["local-player"],
          nextCombatState
        );
        manualActorRef.current = nextManualActor;
        setManualActor(nextManualActor);
        const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
        if (viewport) {
          viewport.dataset.lastInventoryConsumableId = finalConsumableItem;
          viewport.dataset.lastInventoryConsumableHealed = String(finalConsumableResult.healed);
          viewport.dataset.lastInventoryConsumableAnimation = "829";
          viewport.dataset.lastInventoryConsumableSequence = "consume";
          viewport.dataset.lastInventoryConsumablePotDelayUntil = String(finalConsumableResult.delays.potionDelayUntilTick);
          viewport.dataset.lastInventoryConsumableEatDelayUntil = String(finalConsumableResult.delays.eatDelayUntilTick);
          viewport.dataset.lastInventoryConsumableKarambwanDelayUntil = String(finalConsumableResult.delays.karambwanDelayUntilTick);
        }
      }

      setPendingEquipSlotIndices(itemActionQueueRef.current.pendingEquipSlotIndices());
      const pendingRemoveSlotIds = new Set<string>();
      for (const action of itemActionQueueRef.current.snapshot()) {
        if (action.kind === "unequip") {
          const context = action.contextEntry as QueuedEquipmentRemoveContext | undefined;
          if (context?.slotId) {
            pendingRemoveSlotIds.add(context.slotId);
          }
        }
      }
      setPendingEquipmentRemoveSlotIds(pendingRemoveSlotIds);
    });
    processReadyPlayerCombatPackets(readyPlayerPackets);
    scheduleReadyItemActionProcessing();
  };

  const queueInventoryEquipMutation = (
    entry: NhInventoryContextMenuEntry,
    resolution: RuntimeInventoryMutationResolution
  ): boolean => {
    if (!resolution.equipmentMutation) {
      return false;
    }
    const queuedAtMs = performance.now();
    const readyAtMs = nextNhGameTickAt(runtimeTickOriginMsRef.current, queuedAtMs);
    itemActionQueueRef.current.push({
      kind: "equip",
      slotIndex: entry.slotIndex,
      itemId: entry.itemId,
      queuedAtMs,
      readyAtMs,
      equipData: {
        equipSlot: resolution.equipmentMutation.equipSlot,
        equippedItemId: resolution.equipmentMutation.equippedItemId,
        wornItemId: resolution.equipmentMutation.previousItemId,
        weaponType: resolution.equipmentMutation.weaponType,
        weaponTypeConfig: resolution.equipmentMutation.weaponTypeConfig,
        loadoutId: resolution.actorLoadoutId
      },
      contextEntry: { entry } satisfies QueuedInventoryEquipContext
    });
    setPendingEquipSlotIndices(itemActionQueueRef.current.pendingEquipSlotIndices());
    scheduleReadyItemActionProcessing();
    return true;
  };

  const queueInventoryConsumableAction = (
    entry: NhInventoryContextMenuEntry,
    item: ConsumableId
  ): boolean => {
    const actionKind = runtimeInventoryActionConsumableKind(entry);
    if (actionKind === null) {
      return false;
    }
    const queuedAtMs = performance.now();
    const readyAtMs = nextNhGameTickAt(runtimeTickOriginMsRef.current, queuedAtMs);
    itemActionQueueRef.current.push({
      kind: actionKind,
      slotIndex: entry.slotIndex,
      itemId: entry.itemId,
      queuedAtMs,
      readyAtMs,
      contextEntry: { entry, item } satisfies QueuedInventoryConsumableContext
    });
    scheduleReadyItemActionProcessing();
    return true;
  };

  const currentLocalServerTile = (): RuntimeTile => {
    const tile = manualCombatStateRef.current.actors["local-player"].tile;
    return collisionMap ? collisionMap.snapTile(tile) : tile;
  };

  const spawnGroundItemFromInventoryDrop = (
    entry: NhInventoryContextMenuEntry,
    slot: RuntimeInventorySlot | null
  ): void => {
    if (!slot) {
      return;
    }
    const itemDefinition = inventoryItemDefinitionsRef.current.get(entry.itemId);
    const tile = currentLocalServerTile();
    const quantity = Math.max(1, Math.trunc(slot.quantity));
    const droppedAtTick = manualCombatStateRef.current.tick;
    const droppedAtMs = performance.now();
    setGroundItems((current) => {
      if (itemDefinition?.stackable) {
        const existing = current.find((item) => item.itemId === entry.itemId && sameNhTile(item.tile, tile));
        if (existing) {
          const next = current.map((item) =>
            item.id === existing.id
              ? {
                  ...item,
                  quantity: item.quantity + quantity,
                  droppedAtTick,
                  droppedAtMs
                }
              : item
          );
          groundItemsRef.current = next;
          return next;
        }
      }
      const next: readonly RuntimeGroundItem[] = [
        ...current,
        {
          id: `ground-item-${entry.itemId}-${droppedAtTick}-${groundItemSequenceRef.current++}`,
          itemId: entry.itemId,
          itemName: entry.itemName,
          quantity,
          tile,
          owner: "local-player",
          droppedAtTick,
          droppedAtMs
        }
      ];
      groundItemsRef.current = next;
      return next;
    });
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastGroundItemAction = "drop";
      viewport.dataset.lastGroundItemItemId = String(entry.itemId);
      viewport.dataset.lastGroundItemItemName = entry.itemName;
      viewport.dataset.lastGroundItemQuantity = String(quantity);
      viewport.dataset.lastGroundItemTileX = String(tile.x);
      viewport.dataset.lastGroundItemTileZ = String(tile.z);
      viewport.dataset.lastGroundItemSource =
        "TabInventory.click dropOption -> item.remove; new GroundItem(item).owner(player).droppedBy(player).position(player.getPosition()).spawn";
    }
  };

  const addGroundItemToInventory = (groundItem: RuntimeGroundItem): boolean => {
    const slots = [...normalizeNhInventorySlots(inventoryOverrideRef.current ?? visibleSnapshotRef.current.inventory)];
    const itemDefinition = inventoryItemDefinitionsRef.current.get(groundItem.itemId);
    if (itemDefinition?.stackable) {
      const stackIndex = slots.findIndex((slot) => slot?.itemId === groundItem.itemId);
      if (stackIndex !== -1) {
        const current = slots[stackIndex];
        slots[stackIndex] = {
          itemId: groundItem.itemId,
          quantity: (current?.quantity ?? 0) + groundItem.quantity
        };
        inventoryOverrideRef.current = slots;
        setInventoryOverride(slots);
        return true;
      }
    }
    const freeSlotIndex = slots.findIndex((slot) => slot === null);
    if (freeSlotIndex === -1) {
      return false;
    }
    slots[freeSlotIndex] = { itemId: groundItem.itemId, quantity: groundItem.quantity };
    inventoryOverrideRef.current = slots;
    setInventoryOverride(slots);
    return true;
  };

  const pickupRuntimeGroundItem = (
    groundItem: RuntimeGroundItem,
    activationSource: "default" | "context-menu" | "route-complete"
  ): boolean => {
    const added = addGroundItemToInventory(groundItem);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastGroundItemAction = "take";
      viewport.dataset.lastGroundItemActivation = activationSource;
      viewport.dataset.lastGroundItemId = groundItem.id;
      viewport.dataset.lastGroundItemItemId = String(groundItem.itemId);
      viewport.dataset.lastGroundItemItemName = groundItem.itemName;
      viewport.dataset.lastGroundItemQuantity = String(groundItem.quantity);
      viewport.dataset.lastGroundItemBlockedReason = added ? "" : "inventory-full";
      viewport.dataset.lastGroundItemSource = "GroundItemActionHandler.routeGroundItem -> GroundItem.pickup -> Inventory.add";
    }
    if (!added) {
      pendingGroundItemPickupRef.current = null;
      return false;
    }
    setGroundItems((current) => {
      const next = current.filter((item) => item.id !== groundItem.id);
      groundItemsRef.current = next;
      return next;
    });
    pendingGroundItemPickupRef.current = null;
    window.dispatchEvent(
      new CustomEvent("nh-trainer-ground-item-pickup", {
        detail: {
          activationSource,
          groundItemId: groundItem.id,
          itemId: groundItem.itemId,
          itemName: groundItem.itemName,
          quantity: groundItem.quantity,
          tile: groundItem.tile
        }
      })
    );
    return true;
  };

  const processPendingGroundItemPickup = (actorTile: RuntimeTile): void => {
    const pending = pendingGroundItemPickupRef.current;
    if (!pending || !sameNhTile(actorTile, pending.targetTile)) {
      return;
    }
    const groundItem = groundItemsRef.current.find((item) => item.id === pending.groundItemId);
    if (!groundItem) {
      pendingGroundItemPickupRef.current = null;
      return;
    }
    pickupRuntimeGroundItem(groundItem, "route-complete");
  };

  const dispatchGroundItemContextEntry = (
    entry: NhGroundItemContextMenuEntry,
    position: { readonly x: number; readonly y: number },
    activationSource: "default" | "context-menu"
  ): void => {
    if (entry.action === "ground-item-examine") {
      const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
      if (viewport) {
        viewport.dataset.lastGroundItemAction = "examine";
        viewport.dataset.lastGroundItemItemId = String(entry.itemId);
        viewport.dataset.lastGroundItemItemName = entry.itemName;
      }
      return;
    }
    const groundItem = groundItemsRef.current.find((item) => item.id === entry.groundItemId);
    if (!groundItem) {
      pendingGroundItemPickupRef.current = null;
      return;
    }
    const targetTile = collisionMap ? collisionMap.snapTile(groundItem.tile) : groundItem.tile;
    const localTile = currentLocalServerTile();
    if (sameNhTile(localTile, targetTile)) {
      pendingGroundItemPickupRef.current = {
        groundItemId: groundItem.id,
        targetTile,
        requestedAtTick: manualCombatStateRef.current.tick
      };
      showClickCross(position, "red");
      const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
      if (viewport) {
        viewport.dataset.lastGroundItemAction = "take";
        viewport.dataset.lastGroundItemActivation = activationSource;
        viewport.dataset.lastGroundItemId = groundItem.id;
        viewport.dataset.lastGroundItemItemId = String(groundItem.itemId);
        viewport.dataset.lastGroundItemItemName = groundItem.itemName;
        viewport.dataset.lastGroundItemQuantity = String(groundItem.quantity);
        viewport.dataset.lastGroundItemTileX = String(targetTile.x);
        viewport.dataset.lastGroundItemTileZ = String(targetTile.z);
        viewport.dataset.lastGroundItemOpcode = String(entry.opcode);
        viewport.dataset.lastGroundItemClickCrossColor = "2";
        viewport.dataset.lastGroundItemSource = "Client opcode 20 sets mouseCrossColor=2; GroundItemActionHandler routes to pickup on the game tick";
      }
      return;
    }
    const movementStatus = movementGate(
      manualCombatStateRef.current.actors["local-player"].locks,
      manualCombatStateRef.current.tick
    );
    if (movementStatus.blocked || !collisionMap) {
      pendingGroundItemPickupRef.current = null;
      issueTileCommand(targetTile, position, "red", "ground-item");
      return;
    }
    pendingGroundItemPickupRef.current = {
      groundItemId: groundItem.id,
      targetTile,
      requestedAtTick: manualCombatStateRef.current.tick
    };
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastGroundItemAction = "take";
      viewport.dataset.lastGroundItemActivation = activationSource;
      viewport.dataset.lastGroundItemId = groundItem.id;
      viewport.dataset.lastGroundItemItemId = String(groundItem.itemId);
      viewport.dataset.lastGroundItemItemName = groundItem.itemName;
      viewport.dataset.lastGroundItemQuantity = String(groundItem.quantity);
      viewport.dataset.lastGroundItemTileX = String(targetTile.x);
      viewport.dataset.lastGroundItemTileZ = String(targetTile.z);
      viewport.dataset.lastGroundItemOpcode = String(entry.opcode);
      viewport.dataset.lastGroundItemClickCrossColor = "2";
      viewport.dataset.lastGroundItemSource = "Client opcode 20 sets mouseCrossColor=2 and destination tile; GroundItemActionHandler.routeGroundItem completes pickup";
    }
    issueTileCommand(targetTile, position, "red", "ground-item");
  };

  const dispatchInventoryAction = (
    entry: NhInventoryContextMenuEntry,
    activationSource: "default" | "context-menu"
  ): void => {
    if (entry.action === "inventory-spell-selected") {
      clearSelectedInventoryItem("inventory-spell-selected");
      clearSelectedSpell("inventory-spell-selected");
      const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
      if (viewport) {
        viewport.dataset.lastInventoryActivation = activationSource;
        viewport.dataset.lastInventoryAction = entry.actionText;
        viewport.dataset.lastInventoryActionKind = entry.action;
        viewport.dataset.lastInventoryOpcode = String(entry.opcode);
        viewport.dataset.lastInventoryIdentifier = entry.identifier === undefined ? "" : String(entry.identifier);
        viewport.dataset.lastInventoryArgument1 = entry.argument1 === undefined ? "" : String(entry.argument1);
        viewport.dataset.lastInventoryArgument2 = entry.argument2 === undefined ? "" : String(entry.argument2);
        viewport.dataset.lastInventoryItemId = String(entry.itemId);
        viewport.dataset.lastInventoryItemName = entry.itemName;
        viewport.dataset.lastInventorySlot = String(entry.slotIndex);
        viewport.dataset.lastInventoryWidgetId = String(entry.widgetId);
        viewport.dataset.lastInventorySelectedSpellActionName = entry.selectedSpell?.actionName ?? "";
        viewport.dataset.lastInventorySelectedSpellFlags = entry.selectedSpell ? String(entry.selectedSpell.flags) : "";
        viewport.dataset.lastInventorySelectedSpellId = entry.selectedSpell?.spellId ?? "";
        viewport.dataset.lastInventorySelectedSpellName = entry.selectedSpell?.spellName ?? "";
        viewport.dataset.lastInventoryMutation = "";
        viewport.dataset.lastInventoryBlockedReason = "";
        viewport.dataset.lastInventoryQueuedForTick = "false";
        viewport.dataset.lastInventoryConsumableQueuedForTick = "false";
      }
      return;
    }

    const consumableItem = runtimeInventoryActionConsumableId(entry);
    const queuedConsumable = consumableItem ? queueInventoryConsumableAction(entry, consumableItem) : false;
    const sourceSlotForDrop = normalizeNhInventorySlots(inventoryOverrideRef.current ?? visibleSnapshotRef.current.inventory)[entry.slotIndex] ?? null;
    const mutation = queuedConsumable ? emptyInventoryMutationResolution() : resolveVisibleInventoryMutation(entry);
    const queuedEquip = !queuedConsumable && isNhInventoryEquipEntry(entry) && queueInventoryEquipMutation(entry, mutation);
    if (!queuedConsumable && !queuedEquip) {
      applyResolvedInventoryMutation(mutation);
      if (!mutation.blockedReason && mutation.inventoryMutation?.kind === "drop-remove") {
        spawnGroundItemFromInventoryDrop(entry, sourceSlotForDrop);
      }
    }
    const selectedItem =
      entry.action === "inventory-use"
        ? {
          itemId: entry.itemId,
          itemName: entry.itemName,
          slotIndex: entry.slotIndex,
          widgetId: entry.widgetId
        }
        : selectedInventoryItem;
    clearSelectedSpell("inventory-action");
    if (entry.action === "inventory-use") {
      setSelectedInventoryItem(selectedItem);
    } else if (entry.action === "inventory-use-selected") {
      setSelectedInventoryItem(null);
    }
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastInventoryActivation = activationSource;
      viewport.dataset.lastInventoryAction = entry.actionText;
      viewport.dataset.lastInventoryActionKind = entry.action;
      viewport.dataset.lastInventoryOpcode = String(entry.opcode);
      viewport.dataset.lastInventoryIdentifier = entry.identifier === undefined ? "" : String(entry.identifier);
      viewport.dataset.lastInventoryArgument1 = entry.argument1 === undefined ? "" : String(entry.argument1);
      viewport.dataset.lastInventoryArgument2 = entry.argument2 === undefined ? "" : String(entry.argument2);
      viewport.dataset.lastInventoryActionIndex =
        entry.action === "inventory-action" && entry.actionIndex !== undefined ? String(entry.actionIndex) : "";
      viewport.dataset.lastInventoryItemId = String(entry.itemId);
      viewport.dataset.lastInventoryItemName = entry.itemName;
      viewport.dataset.lastInventorySlot = String(entry.slotIndex);
      viewport.dataset.lastInventoryWidgetId = String(entry.widgetId);
      viewport.dataset.lastInventoryMutation = mutation.inventoryMutation?.kind ?? "";
      viewport.dataset.lastInventoryBlockedReason = mutation.blockedReason ?? "";
      viewport.dataset.lastInventoryQueuedForTick = queuedEquip || queuedConsumable ? "true" : "false";
      viewport.dataset.lastInventoryConsumableQueuedForTick = queuedConsumable ? "true" : "false";
      viewport.dataset.lastInventoryConsumableId = consumableItem ?? "";
      viewport.dataset.lastInventoryMutationNextItemId =
        mutation.inventoryMutation?.nextItemId === null || mutation.inventoryMutation?.nextItemId === undefined
          ? ""
          : String(mutation.inventoryMutation.nextItemId);
      viewport.dataset.lastInventoryActorLoadoutId = mutation.actorLoadoutId ?? "";
      viewport.dataset.lastInventoryEquipmentEquipSlot =
        mutation.equipmentMutation === null ? "" : String(mutation.equipmentMutation.equipSlot);
      viewport.dataset.lastInventoryEquipmentEquippedItemId =
        mutation.equipmentMutation === null ? "" : String(mutation.equipmentMutation.equippedItemId);
      viewport.dataset.lastInventoryEquipmentPreviousItemId =
        mutation.equipmentMutation?.previousItemId === null || mutation.equipmentMutation?.previousItemId === undefined
          ? ""
          : String(mutation.equipmentMutation.previousItemId);
      viewport.dataset.lastInventoryEquipmentServerHandler = mutation.equipmentMutation?.serverHandler ?? "";
      viewport.dataset.selectedInventoryItemId = entry.action === "inventory-use-selected" ? "" : selectedItem ? String(selectedItem.itemId) : "";
      viewport.dataset.selectedInventoryItemName = entry.action === "inventory-use-selected" ? "" : selectedItem?.itemName ?? "";
      viewport.dataset.selectedInventorySlot = entry.action === "inventory-use-selected" ? "" : selectedItem ? String(selectedItem.slotIndex) : "";
      viewport.dataset.selectedInventoryWidgetId = entry.action === "inventory-use-selected" ? "" : selectedItem ? String(selectedItem.widgetId) : "";
      viewport.dataset.lastInventorySelectedItemId = entry.selectedItem ? String(entry.selectedItem.itemId) : "";
      viewport.dataset.lastInventorySelectedItemName = entry.selectedItem?.itemName ?? "";
      viewport.dataset.lastInventorySelectedSlot = entry.selectedItem ? String(entry.selectedItem.slotIndex) : "";
      viewport.dataset.lastInventorySelectedWidgetId = entry.selectedItem ? String(entry.selectedItem.widgetId) : "";
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-inventory-action", {
        detail: {
          activationSource,
          action: entry.action,
          actionText: entry.actionText,
          opcode: entry.opcode,
          identifier: entry.identifier,
          itemId: entry.itemId,
          itemName: entry.itemName,
          slotIndex: entry.slotIndex,
          widgetId: entry.widgetId,
          argument1: entry.argument1,
          argument2: entry.argument2,
          actionIndex: entry.action === "inventory-action" ? entry.actionIndex : undefined,
          mutation: mutation.inventoryMutation,
          blockedReason: mutation.blockedReason,
          actorLoadoutId: mutation.actorLoadoutId,
          equipmentMutation: mutation.equipmentMutation,
          selectedItem: entry.action === "inventory-use-selected" ? entry.selectedItem : selectedItem
        }
      })
    );
  };

  const dispatchInventoryDragReorder = (command: NhInventorySlotDragCommand): void => {
    const reordered = reorderNhInventorySlotsForDrag(
      inventoryOverrideRef.current ?? normalizeNhInventorySlots(visibleSnapshotRef.current.inventory),
      command.sourceSlotIndex,
      command.destinationSlotIndex
    );
    if (!reordered.mutation) {
      return;
    }

    inventoryOverrideRef.current = reordered.slots;
    setInventoryOverride(reordered.slots);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastInventoryActivation = "drag";
      viewport.dataset.lastInventoryAction = "Drag";
      viewport.dataset.lastInventoryActionKind = reordered.mutation.kind;
      viewport.dataset.lastInventoryDragSourceSlot = String(reordered.mutation.sourceSlotIndex);
      viewport.dataset.lastInventoryDragDestinationSlot = String(reordered.mutation.destinationSlotIndex);
      viewport.dataset.lastInventoryDragSourceItemId = String(reordered.mutation.sourceItemId);
      viewport.dataset.lastInventoryDragDestinationItemId =
        reordered.mutation.destinationItemId === null ? "" : String(reordered.mutation.destinationItemId);
      viewport.dataset.lastInventoryWidgetId = String(command.widgetId);
    }

    window.dispatchEvent(
      new CustomEvent("nh-runtime-inventory-drag", {
        detail: {
          widgetId: command.widgetId,
          sourceSlotIndex: command.sourceSlotIndex,
          destinationSlotIndex: command.destinationSlotIndex,
          mutation: reordered.mutation satisfies NhInventoryDragMutation
        }
      })
    );
  };

  const closeContextMenu = (): void => {
    setContextMenu(null);
  };

  const dispatchVisibleContextMenuEntry = (
    entry: NhContextMenuEntry,
    menu: NhContextMenuState,
    clickCrossPosition: { readonly x: number; readonly y: number } = { x: menu.x, y: menu.y }
  ): void => {
    closeContextMenu();
    if (isNhCancelContextMenuEntry(entry)) {
      return;
    }
    if (isNhSourceContextMenuEntry(entry)) {
      return;
    }
    if (isNhHudWidgetContextMenuEntry(entry)) {
      dispatchHudWidgetContextEntry(entry);
      return;
    }
    if (isRuneliteOverlayConfigContextMenuEntry(entry)) {
      window.dispatchEvent(
        new CustomEvent("runelite-overlay-config", {
          detail: {
            pluginId: entry.pluginId,
            overlayTarget: entry.overlayTarget,
            sourceOverlay: entry.sourceOverlay,
            sourceOverlayMenuOpcode: entry.sourceOverlayMenuOpcode
          }
        })
      );
      return;
    }
    if (isNhXpDropOrbContextMenuEntry(entry)) {
      dispatchXpDropOrbContextEntry(entry);
      return;
    }
    if (isNhInventoryContextMenuEntry(entry)) {
      dispatchInventoryAction(entry, "context-menu");
      return;
    }
    if (isNhEquipmentItemContextMenuEntry(entry)) {
      dispatchEquipmentItemAction(entry, "context-menu");
      return;
    }
    if (isNhGroundItemContextMenuEntry(entry)) {
      dispatchGroundItemContextEntry(entry, clickCrossPosition, "context-menu");
      return;
    }
    if (isNhOpponentInventoryInspectContextMenuEntry(entry)) {
      setOpponentInventoryInspectOpen(true);
      return;
    }
    if (isNhSceneObjectContextMenuEntry(entry)) {
      recordSceneObjectCommand(entry);
    }
    if (isNhPlayerContextMenuEntry(entry)) {
      dispatchPlayerContextEntry(entry, clickCrossPosition);
      return;
    }
    if (!("targetTile" in entry)) {
      return;
    }
    issueTileCommand(
      entry.targetTile,
      clickCrossPosition,
      entry.action === "walk" ? "yellow" : "red",
      "context-menu",
      isNhSceneObjectContextMenuEntry(entry) ? entry.objectPlacement : undefined
    );
  };

  const setRuntimeCameraZoom = (nextZoom: NhCameraZoom, source: string): void => {
    const boundary = boundaryRef.current;
    if (!boundary) {
      setCameraZoom(nextZoom);
      return;
    }

    boundary.cameraRig.zoom = nextZoom;
    setCameraZoom(nextZoom);
    updateRuntimeCameraFollowTarget(boundary);
    updateRuntimeCamera(boundary);

    const canvas = boundary.renderer.domElement;
    canvas.dataset.cameraZoomHeight = String(nextZoom.zoomHeight);
    canvas.dataset.cameraZoomWidth = String(nextZoom.zoomWidth);
    canvas.dataset.sourceCameraZoom = source;
    canvas.dataset.sourceCameraZoomScript = "ScrollWheelZoomHandler.rs2asm script 39 + ZoomHandler.rs2asm script 42";
  };

  const updateRuneliteMouseHighlightTooltip = (input: RuneliteMouseHighlightHoverInput | null): void => {
    if (!input) {
      setRuneliteMouseHighlightTooltip(null);
      return;
    }

    setRuneliteMouseHighlightTooltip(
      runeliteMouseHighlightTooltipSnapshot({
        ...input,
        config: runeliteClientConfigRef.current.mouseHighlight,
        menuOpen: Boolean(contextMenu ?? sourceContextMenu)
      })
    );
  };

  const dispatchPrayerDragReorder = (command: NhPrayerSlotDragCommand): void => {
    const defaultOrder = fixedClientLayout?.prayerPanel?.slots.map((slot) => slot.id) ?? [];
    const nextOrder = swapNhWidgetOrder(
      prayerOrder,
      command.sourcePrayerId,
      command.destinationPrayerId,
      defaultOrder
    );
    setPrayerOrder(nextOrder);
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastPrayerReorderSource = command.sourcePrayerId;
      viewport.dataset.lastPrayerReorderDestination = command.destinationPrayerId;
      viewport.dataset.lastPrayerReorderSourceWidgetId = String(command.sourceSlot.widgetId);
      viewport.dataset.lastPrayerReorderDestinationWidgetId = String(command.destinationSlot.widgetId);
      viewport.dataset.lastPrayerReorderSource =
        "ReorderPrayersPlugin.onDraggingWidgetChanged swaps prayerOrder entries and reapplies widget positions";
    }
  };

  const dispatchSpellbookDragReorder = (command: NhSpellbookSpellDragCommand): void => {
    const defaultOrder = fixedClientLayout?.spellbookPanels[command.spellbookId]?.spells.map((spell) => spell.id) ?? [];
    const currentOrder = spellbookOrders[command.spellbookId] ?? [];
    const nextOrder = swapNhWidgetOrder(
      currentOrder,
      command.sourceSpellId,
      command.destinationSpellId,
      defaultOrder
    );
    setSpellbookOrders((current) => ({
      ...current,
      [command.spellbookId]: nextOrder
    }));
    const viewport = (canvasRef.current?.closest(".runtimeViewport") ?? document.querySelector(".runtimeViewport")) as HTMLElement | null;
    if (viewport) {
      viewport.dataset.lastSpellbookReorderBook = command.spellbookId;
      viewport.dataset.lastSpellbookReorderSource = command.sourceSpellId;
      viewport.dataset.lastSpellbookReorderDestination = command.destinationSpellId;
      viewport.dataset.lastSpellbookReorderSourceWidgetId = String(command.sourceSpell.widgetId);
      viewport.dataset.lastSpellbookReorderDestinationWidgetId = String(command.destinationSpell.widgetId);
      viewport.dataset.lastSpellbookReorderSource =
        "RuneLite Spellbook plugin reordering mirrors prayer reordering with tab unlock and draggable spell widgets";
    }
  };

  const openRuntimeSceneContextMenu = (event: PointerEvent | MouseEvent): void => {
    const boundary = boundaryRef.current;
    if (!boundary) {
      return;
    }

    const position = pointerEventToViewportPosition(boundary, event);
    const overlayEntries = runeliteOverlayConfigContextEntries(event, runeliteClientConfigRef.current.overlayMenu);
    const interactionSnapshot = runtimeInteractionSnapshotRef.current;
    const rawTargetActor = pointerEventToRuntimeActor(boundary, interactionSnapshot, event);
    const clickedTile = pointerEventToRuntimeTile(boundary, event);
    const targetGroundItem = rawTargetActor?.actorId === "opponent"
      ? null
      : pointerEventToRuntimeGroundItem(boundary, event, groundItemsRef.current);
    const targetActor = targetGroundItem ? null : rawTargetActor;
    const targetObject = targetActor || targetGroundItem
      ? null
      : pointerEventToRuntimeSceneObject(
        boundary,
        event,
        sceneObjectPlacements,
        collisionMap,
        playerModelSources?.cacheModels ?? null
      );
    const targetTile = targetGroundItem?.item.tile ?? targetObject?.walkTile ?? clickedTile ?? targetActor?.tile;
    setRuneliteMouseHighlightTooltip(null);
    setContextMenu({
      x: position.x,
      y: position.y,
      entries: withNhCancelContextMenuEntry([
        ...overlayEntries,
        ...(targetActor
          ? actorContextEntries(targetActor, targetTile ?? targetActor.tile)
          : targetGroundItem
            ? groundItemContextEntries(targetGroundItem.item.tile)
          : targetObject
            ? sceneObjectContextEntries(targetObject)
            : targetTile
              ? sceneContextEntries(targetTile)
            : [])
      ])
      });
  };

  const suppressNextCanvasContextMenu = (): void => {
    const duplicateWindowMs = 250;
    suppressNextCanvasContextMenuRef.current = true;
    suppressCanvasContextMenuUntilRef.current = performance.now() + duplicateWindowMs;
    window.setTimeout(() => {
      if (performance.now() >= suppressCanvasContextMenuUntilRef.current) {
        suppressNextCanvasContextMenuRef.current = false;
        suppressCanvasContextMenuUntilRef.current = 0;
      }
    }, duplicateWindowMs + 16);
  };

  const consumeSuppressedCanvasContextMenu = (): boolean => {
    if (!suppressNextCanvasContextMenuRef.current) {
      return false;
    }
    if (performance.now() <= suppressCanvasContextMenuUntilRef.current) {
      return true;
    }
    suppressNextCanvasContextMenuRef.current = false;
    suppressCanvasContextMenuUntilRef.current = 0;
    return false;
  };

  const updateHoveredSceneTile = (tile: RuntimeTile | null): void => {
    const snappedTile = tile && collisionMap ? collisionMap.snapTile(tile) : null;
    const current = hoveredSceneTileRef.current;
    if (
      (current === null && snappedTile === null) ||
      (current !== null && snappedTile !== null && sameNhTile(current, snappedTile))
    ) {
      return;
    }

    hoveredSceneTileRef.current = snappedTile;
  };

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const onWindowPointerMove = (event: PointerEvent): void => {
      const menuElement = document.querySelector(".runtimeViewport .nhContextMenu") as HTMLElement | null;
      if (!menuElement) {
        return;
      }

      const rect = menuElement.getBoundingClientRect();
      const margin = NH_CONTEXT_MENU_MOUSE_LEAVE_MARGIN * (fixedClientCssLayout?.scale ?? 1);
      if (
        event.clientX < rect.left - margin ||
        event.clientX > rect.right + margin ||
        event.clientY < rect.top - margin ||
        event.clientY > rect.bottom + margin
      ) {
        closeContextMenu();
      }
    };

    window.addEventListener("pointermove", onWindowPointerMove);
    return () => window.removeEventListener("pointermove", onWindowPointerMove);
  }, [contextMenu, fixedClientCssLayout?.scale]);

  useEffect(() => {
    localFreezeBypassRef.current = localFreezeBypass;
    if (!localFreezeBypass) {
      return;
    }
    const nextCombatState = runtimePlayerCombatStateWithLocalFreezeBypass(manualCombatStateRef.current);
    if (nextCombatState === manualCombatStateRef.current) {
      return;
    }
    manualCombatStateRef.current = nextCombatState;
    setManualCombatState(nextCombatState);
  }, [localFreezeBypass]);

  useEffect(() => {
    if (
      temporarySavedSetupLoadedRef.current ||
      inventoryItemDefinitions.size === 0 ||
      inventoryEquipmentDefinitions.size === 0
    ) {
      return;
    }
    temporarySavedSetupLoadedRef.current = true;
    const snapshot = readTemporarySavedSetupSnapshot();
    if (snapshot) {
      applyTemporarySavedSetupSnapshot(snapshot, "startup");
    }
  }, [inventoryEquipmentDefinitions.size, inventoryItemDefinitions.size]);

  const fightCountdownLabel = manualFightStartPending ? null : runtimePlayerCombatFightCountdownLabel(manualCombatState);
  const selectedBotPolicyReady = !onBotDifficultyChange || (botPolicyLoadState === "loaded" && policy !== null);
  const selectedBotPolicyStatusLabel =
    botPolicyLoadState === "loading"
      ? "Loading"
      : botPolicyLoadState === "error"
        ? "Unavailable"
        : botDifficulty === "hard"
          ? "Hard"
          : botDifficulty === "easy"
            ? "Easy"
            : "Medium";

  return (
    <section className="workbenchSection runtimeClientSection" aria-labelledby="runtime-scene">
      <div className="sectionHeader">
        <p className="eyebrow">Runtime scene boundary</p>
        <h2 id="runtime-scene">Two actor arena scene</h2>
      </div>
      <div className="runtimeScene">
        <BrowserClientWindow>
          <RuneliteClientShell
            pvpTrackerSnapshot={runelitePvpTrackerSnapshot}
            suppliesTrackerSnapshot={runeliteSuppliesTrackerSnapshot}
            pvpToolsSnapshot={runelitePvpToolsSnapshot}
            onConfigSnapshotChange={setRuneliteClientConfig}
          >
          <div
            className="runtimeViewport"
            onContextMenuCapture={(event) => {
              if (!consumeSuppressedCanvasContextMenu()) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
            }}
          >
          <canvas
            ref={canvasRef}
            aria-label="Two actor runtime arena scene"
            onPointerMove={(event) => {
              const boundary = boundaryRef.current;
              const mouseCameraDrag = mouseCameraDragRef.current;
              if (!boundary) {
                updateHoveredSceneTile(null);
                updateRuneliteMouseHighlightTooltip(null);
                return;
              }
              if (mouseCameraDrag?.pointerId === event.pointerId) {
                const position = pointerEventToCanvasPosition(boundary, event.nativeEvent);
                if (position) {
                  mouseCameraDragRef.current = {
                    ...mouseCameraDrag,
                    x: position.x,
                    y: position.y
                  };
                }
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              const interactionSnapshot = runtimeInteractionSnapshotRef.current;
              const rawTargetActor = pointerEventToRuntimeActor(boundary, interactionSnapshot, event.nativeEvent);
              const hoveredTile = pointerEventToRuntimeTile(boundary, event.nativeEvent);
              const targetGroundItem = rawTargetActor?.actorId === "opponent"
                ? null
                : pointerEventToRuntimeGroundItem(boundary, event.nativeEvent, groundItemsRef.current);
              const targetActor = targetGroundItem ? null : rawTargetActor;
              const targetObject = targetActor || targetGroundItem
                ? null
                : pointerEventToRuntimeSceneObject(
                  boundary,
                  event.nativeEvent,
                  sceneObjectPlacements,
                  collisionMap,
                  playerModelSources?.cacheModels ?? null
                );
              const targetTile = targetGroundItem?.item.tile ?? targetObject?.walkTile ?? hoveredTile ?? targetActor?.tile ?? null;
              updateHoveredSceneTile(targetTile);
              if (!targetTile) {
                updateRuneliteMouseHighlightTooltip(null);
                return;
              }
              const position = pointerEventToViewportPosition(boundary, event.nativeEvent);
              updateRuneliteMouseHighlightTooltip({
                x: position.x,
                y: position.y,
                region: "main",
                entries: targetActor
                  ? actorContextEntries(targetActor, targetTile)
                  : targetGroundItem
                    ? groundItemContextEntries(targetGroundItem.item.tile)
                  : targetObject
                    ? sceneObjectContextEntries(targetObject)
                    : sceneContextEntries(targetTile)
              });
            }}
            onPointerLeave={() => {
              updateHoveredSceneTile(null);
              updateRuneliteMouseHighlightTooltip(null);
            }}
            onPointerDown={(event) => {
              if (event.button === 1) {
                const boundary = boundaryRef.current;
                const position = boundary ? pointerEventToCanvasPosition(boundary, event.nativeEvent) : null;
                if (!boundary || !position) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                closeContextMenu();
                updateRuneliteMouseHighlightTooltip(null);
                setCameraMode("free");
                mouseCameraDragRef.current = {
                  pointerId: event.pointerId,
                  x: position.x,
                  y: position.y,
                  clickedX: Math.trunc(position.x),
                  clickedY: Math.trunc(position.y)
                };
                return;
              }

              if (event.button === 2) {
                event.preventDefault();
                event.stopPropagation();
                suppressNextCanvasContextMenu();
                openRuntimeSceneContextMenu(event.nativeEvent);
                return;
              }

              closeContextMenu();
              updateRuneliteMouseHighlightTooltip(null);
              if (event.button !== 0) {
                return;
              }

              const boundary = boundaryRef.current;
              if (!boundary) {
                return;
              }

              const interactionSnapshot = runtimeInteractionSnapshotRef.current;
              const hitActor = pointerEventToRuntimeActor(boundary, interactionSnapshot, event.nativeEvent);
              const clickedTile = pointerEventToRuntimeTile(boundary, event.nativeEvent);
              const targetGroundItem = hitActor?.actorId === "opponent"
                ? null
                : pointerEventToRuntimeGroundItem(boundary, event.nativeEvent, groundItemsRef.current);
              const targetActor = targetGroundItem ? null : hitActor?.actorId === "local-player" ? null : hitActor;
              const targetObject = targetActor || targetGroundItem
                ? null
                : pointerEventToRuntimeSceneObject(
                  boundary,
                  event.nativeEvent,
                  sceneObjectPlacements,
                  collisionMap,
                  playerModelSources?.cacheModels ?? null
                );
              const targetTile = targetGroundItem?.item.tile ?? targetObject?.walkTile ?? clickedTile ?? targetActor?.tile;
              if (!targetTile) {
                clearSelectedTargetMode("scene-empty-left-click");
                return;
              }

              const clickCrossPosition =
                pointerEventToSourceFixedClientPosition(boundary, event.nativeEvent) ??
                pointerEventToViewportPosition(boundary, event.nativeEvent);
              const defaultEntry = selectNhDefaultMenuEntry(
                targetActor
                  ? actorContextEntries(targetActor, targetTile)
                  : targetGroundItem
                    ? groundItemContextEntries(targetGroundItem.item.tile)
                  : targetObject
                    ? sceneObjectContextEntries(targetObject)
                    : sceneContextEntries(targetTile)
              );
              if (!defaultEntry) {
                clearSelectedTargetMode("scene-selected-target-cancel");
                return;
              }
              if (isNhSceneObjectContextMenuEntry(defaultEntry)) {
                recordSceneObjectCommand(defaultEntry);
              }
              if (isNhPlayerContextMenuEntry(defaultEntry)) {
                dispatchPlayerContextEntry(defaultEntry, clickCrossPosition);
                return;
              }
              if (isNhGroundItemContextMenuEntry(defaultEntry)) {
                dispatchGroundItemContextEntry(defaultEntry, clickCrossPosition, "default");
                return;
              }
              if (isNhOpponentInventoryInspectContextMenuEntry(defaultEntry)) {
                setOpponentInventoryInspectOpen(true);
                return;
              }
              if (!("targetTile" in defaultEntry)) {
                clearSelectedTargetMode("scene-selected-target-cancel");
                return;
              }

              issueTileCommand(
                defaultEntry.targetTile,
                clickCrossPosition,
                defaultEntry.action === "walk" ? "yellow" : "red",
                isNhSceneObjectContextMenuEntry(defaultEntry) ? "scene-object" : "scene-tile",
                isNhSceneObjectContextMenuEntry(defaultEntry) ? defaultEntry.objectPlacement : undefined
              );
            }}
            onPointerUp={(event) => {
              if (mouseCameraDragRef.current?.pointerId !== event.pointerId) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.releasePointerCapture(event.pointerId);
              mouseCameraDragRef.current = null;
            }}
            onPointerCancel={(event) => {
              if (mouseCameraDragRef.current?.pointerId !== event.pointerId) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              mouseCameraDragRef.current = null;
            }}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onWheel={(event) => {
              const boundary = boundaryRef.current;
              if (!boundary) {
                return;
              }
              const wheelRotation = nhWheelEventRotation(event.nativeEvent);
              if (wheelRotation === 0) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              closeContextMenu();
              updateRuneliteMouseHighlightTooltip(null);
              setRuntimeCameraZoom(
                updateNhCameraZoomFromScrollWheel(boundary.cameraRig.zoom, wheelRotation),
                "canvas wheel"
              );
              boundary.renderer.domElement.dataset.lastCameraWheelRotation = String(wheelRotation);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (consumeSuppressedCanvasContextMenu()) {
                return;
              }
              openRuntimeSceneContextMenu(event.nativeEvent);
            }}
          />
          <NhClientHud
            spriteAtlases={spriteAtlases}
            layout={fixedClientCssLayout}
            sourceLayout={fixedClientLayout}
            snapshot={visibleSnapshot}
            minimapDestinationTile={minimapDestinationTile}
            minimapCameraYaw={visibleMinimapCameraYaw}
            minimapSceneSprite={minimapSceneSprite}
            cameraZoom={cameraZoom}
            onCameraZoomChange={(zoom) => setRuntimeCameraZoom(zoom, "options zoom slider")}
            onCameraZoomReset={() => setRuntimeCameraZoom(NH_CAMERA_DEFAULT_ZOOM, "options zoom reset")}
            onMinimapTileCommand={(command) => {
              closeContextMenu();
              issueTileCommand(command.tile, command.position, "yellow", "minimap");
            }}
            onInventoryContextMenu={(command) => {
              // Browser fallback contextmenu can be retargeted after a right-button drag; Nh opens from MouseHandler_lastPressedX/Y.
              suppressNextCanvasContextMenu();
              closeContextMenu();
              const entries = inventoryContextEntries(command);
              if (entries.length === 0) {
                return;
              }
              setContextMenu({
                x: command.position.x,
                y: command.position.y,
                entries: withNhCancelContextMenuEntry(entries)
              });
            }}
            onInventoryEmptyContextMenu={(command) => {
              suppressNextCanvasContextMenu();
              closeContextMenu();
              setContextMenu({
                x: command.position.x,
                y: command.position.y,
                entries: withNhCancelContextMenuEntry([])
              });
            }}
            onInventoryDefaultAction={(command) => {
              closeContextMenu();
              const defaultEntry = selectNhDefaultMenuEntry(inventoryContextEntries(command));
              if (!defaultEntry) {
                clearSelectedTargetMode("inventory-selected-target-cancel");
                return;
              }
              dispatchInventoryAction(defaultEntry, "default");
            }}
            onInventoryDragReorder={(command) => {
              closeContextMenu();
              dispatchInventoryDragReorder(command);
            }}
            onInventoryHover={(command) => {
              updateRuneliteMouseHighlightTooltip(
                command
                  ? {
                    x: command.position.x,
                    y: command.position.y,
                    region: "ui",
                    entries: inventoryContextEntries(command)
                  }
                  : null
              );
            }}
            onEquipmentItemContextMenu={(command) => {
              suppressNextCanvasContextMenu();
              closeContextMenu();
              const entries = equipmentItemContextEntries(command);
              if (entries.length === 0) {
                return;
              }
              setContextMenu({
                x: command.position.x,
                y: command.position.y,
                entries: withNhCancelContextMenuEntry(entries)
              });
            }}
            onEquipmentItemDefaultAction={(command) => {
              const defaultEntry = selectNhDefaultMenuEntry(equipmentItemContextEntries(command));
              if (!defaultEntry) {
                return;
              }
              dispatchEquipmentItemAction(defaultEntry, "default");
            }}
            onEquipmentItemHover={(command) => {
              updateRuneliteMouseHighlightTooltip(
                command
                  ? {
                    x: command.position.x,
                    y: command.position.y,
                    region: "ui",
                    entries: equipmentItemContextEntries(command)
                  }
                  : null
              );
            }}
            onStatsSkillDefaultAction={dispatchStatsSkillAction}
            onSpellDefaultAction={dispatchSpellDefaultAction}
            onSpellDragReorder={dispatchSpellbookDragReorder}
            onCombatStyleDefaultAction={dispatchCombatStyleAction}
            onCombatAutocastDefaultAction={dispatchCombatAutocastAction}
            onCombatAutoRetaliateDefaultAction={dispatchCombatAutoRetaliateAction}
            onCombatSpecialDefaultAction={dispatchCombatSpecialAction}
            onPrayerDefaultAction={dispatchPrayerAction}
            onPrayerDragReorder={dispatchPrayerDragReorder}
            onRunOrbDefaultAction={dispatchRunOrbAction}
            xpDropCounterShown={xpDropCounterShown}
            onXpDropOrbDefaultAction={dispatchXpDropOrbAction}
            onXpDropOrbContextMenu={(command) => {
              suppressNextCanvasContextMenu();
              closeContextMenu();
              setContextMenu({
                x: command.position.x,
                y: command.position.y,
                entries: withNhCancelContextMenuEntry(xpDropOrbContextEntries(command))
              });
            }}
            gameKeybinds={gameKeybinds}
            gameKeybindInterfaceOpen={gameKeybindInterfaceOpen}
            gameKeybindSelectedTabId={gameKeybindSelectedTabId}
            onGameKeybindInterfaceOpen={() => {
              closeContextMenu();
              setGameKeybindInterfaceOpen(true);
              setGameKeybindSelectedTabId((current) => current ?? "combat");
            }}
            onGameKeybindInterfaceClose={() => setGameKeybindInterfaceOpen(false)}
            onGameKeybindSelectedTabChange={setGameKeybindSelectedTabId}
            onGameKeybindChange={dispatchGameKeybindChange}
            onGameKeybindEscapeCloseChange={dispatchGameKeybindEscapeClose}
            onGameKeybindRestoreDefaults={dispatchGameKeybindRestoreDefaults}
            onChatboxContextMenu={(command) => {
              suppressNextCanvasContextMenu();
              closeContextMenu();
              const entries = chatboxContextEntries(command);
              if (entries.length === 0) {
                return;
              }
              setContextMenu({
                x: command.position.x,
                y: command.position.y,
                entries: withNhCancelContextMenuEntry(entries)
              });
            }}
            onChatboxDefaultAction={dispatchChatboxAction}
            onChatboxHover={(command) => {
              updateRuneliteMouseHighlightTooltip(
                command
                  ? {
                    x: command.position.x,
                    y: command.position.y,
                    region: "chatbox",
                    entries: chatboxContextEntries(command)
                  }
                  : null
              );
            }}
            socialLists={nhSocialLists}
            onSocialButtonDefaultAction={dispatchSocialButtonAction}
            clanChat={nhClanChat}
            onClanChatButtonDefaultAction={dispatchClanChatButtonAction}
            onEquipmentUtilityDefaultAction={dispatchEquipmentUtilityAction}
            equipmentUtilityPanelMode={equipmentUtilityPanelMode}
            onEquipmentUtilityPanelClose={() => setEquipmentUtilityPanelMode(null)}
            activeSideTabId={activeSideTabId}
            activeSpellbookId={activeSpellbookId}
            onSideTabContextMenu={(command) => {
              suppressNextCanvasContextMenu();
              closeContextMenu();
              const entries = sideTabContextEntries(command);
              if (entries.length === 0) {
                return;
              }
              setContextMenu({
                x: command.position.x,
                y: command.position.y,
                entries: withNhCancelContextMenuEntry(entries)
              });
            }}
            onSideTabDefaultAction={dispatchSideTabAction}
            onSideTabHover={(command) => {
              updateRuneliteMouseHighlightTooltip(
                command
                  ? {
                    x: command.position.x,
                    y: command.position.y,
                    region: "ui",
                    entries: sideTabContextEntries(command)
                  }
                  : null
              );
            }}
            inventoryItemDefinitions={inventoryItemDefinitions}
            inventoryEquipmentDefinitions={inventoryEquipmentDefinitions}
            weaponTypeDefinitions={weaponTypeDefinitions}
            inventorySlots={visibleSnapshot.inventory}
            inventoryDragDelayClientTicks={runeliteClientConfig.antiDrag.effectiveDragDelayClientTicks}
            drawSpecbarAnyway={runeliteClientConfig.specBar.drawSpecbarAnyway}
            attackStylesConfig={runeliteClientConfig.attackStyles}
            selectedInventoryItem={selectedInventoryItem}
            prayerReorderingEnabled={prayerReorderingEnabled}
            prayerOrder={prayerOrder}
            spellbookReorderingEnabled={spellbookReorderingEnabled}
            spellbookOrder={spellbookOrders[activeSpellbookId] ?? []}
            pendingEquipSlotIndices={pendingEquipSlotIndices}
            pendingEquipmentRemoveSlotIds={pendingEquipmentRemoveSlotIds}
            selectedSpell={selectedSpell}
            runOrbTextOverride={runeliteRunOrbText}
            hud={visibleSnapshot.hud}
            clientFonts={clientFonts}
          />
          {runeliteStatusOrbs.map((orb) => (
            <svg
              key={`runelite-status-orb-${orb.id}`}
              className="runeliteStatusOrbOverlay"
              viewBox={`0 0 ${RUNELITE_STATUS_ORBS_DIAMETER} ${RUNELITE_STATUS_ORBS_DIAMETER}`}
              aria-hidden="true"
              data-status-orb={orb.id}
              data-status-orb-widget={orb.sourceWidget}
              data-status-orb-percent={orb.percent.toFixed(3)}
              data-status-orb-source-x={orb.sourceX}
              data-status-orb-source-y={orb.sourceY}
              data-source-plugin="StatusOrbsPlugin"
              data-source-overlay="StatusOrbsOverlay"
              data-source-overlay-position={RUNELITE_STATUS_ORBS_OVERLAY_POSITION}
              data-source-overlay-layer={RUNELITE_STATUS_ORBS_OVERLAY_LAYER}
              data-source-widget={orb.sourceWidget}
              data-source-offset={RUNELITE_STATUS_ORBS_OFFSET}
              data-source-diameter={RUNELITE_STATUS_ORBS_DIAMETER}
              data-source-arc={RUNELITE_STATUS_ORBS_ARC_SOURCE}
              data-source-stroke={RUNELITE_STATUS_ORBS_STROKE_SOURCE}
              data-source-spec-regen-ticks={RUNELITE_STATUS_ORBS_SPEC_REGEN_TICKS}
              data-source-normal-hp-regen-ticks={RUNELITE_STATUS_ORBS_NORMAL_HP_REGEN_TICKS}
              style={runeliteStatusOrbOverlayStyle(orb, fixedClientCssLayout)}
            >
              {orb.activeOverlay ? (
                <circle
                  className="runeliteStatusOrbActiveOverlay"
                  cx={RUNELITE_STATUS_ORBS_DIAMETER / 2}
                  cy={RUNELITE_STATUS_ORBS_DIAMETER / 2}
                  r={RUNELITE_STATUS_ORBS_DIAMETER / 2}
                  fill={RUNELITE_STATUS_ORBS_SPECIAL_ACTIVE_OVERLAY_RGBA}
                  data-source-overlay-color="new Color(255, 255, 255, 60)"
                />
              ) : null}
              {orb.arcPath ? (
                <path
                  className="runeliteStatusOrbArc"
                  d={orb.arcPath}
                  fill="none"
                  stroke={orb.color}
                  strokeWidth={RUNELITE_STATUS_ORBS_STROKE_WIDTH}
                  strokeLinecap="butt"
                  strokeLinejoin="miter"
                />
              ) : null}
            </svg>
          ))}
          {manualFightStartPending ? (
            <div
              className="runtimeFightStartOverlay"
              aria-label="Pre-fight start controls"
              data-manual-fight-start-pending="true"
              data-runelite-overlay-name={RUNELITE_FIGHT_START_OVERLAY_NAME}
              data-source-overlay-drag={RUNELITE_FIGHT_START_OVERLAY_DRAG_SOURCE}
              data-source-overlay-position-storage={RUNELITE_OVERLAY_POSITION_SOURCE}
              data-combat-current-tick={manualCombatState.tick}
              data-combat-start-tick={manualCombatState.combatStartTick}
              data-trainer-overlay="pre-fight-start"
              data-trainer-countdown-rules="movement-and-supplies-allowed-before-start; player-and-opponent-attacks-blocked-until-go"
              style={runtimeFightStartOverlayStyle(fixedClientCssLayout, runeliteOverlayLocations)}
            >
              {onBotDifficultyChange ? (
                <div
                  className="runtimeBotDifficultySelector"
                  data-bot-difficulty={botDifficulty}
                  data-bot-policy-status={botPolicyLoadState}
                >
                  <span className="runtimeBotDifficultyLabel">Opponent</span>
                  <div className="runtimeBotDifficultyButtons">
                    <button
                      type="button"
                      aria-pressed={botDifficulty === "easy"}
                      onClick={() => onBotDifficultyChange("easy")}
                    >
                      Easy
                    </button>
                    <button
                      type="button"
                      aria-pressed={botDifficulty === "medium"}
                      onClick={() => onBotDifficultyChange("medium")}
                    >
                      Medium
                    </button>
                    <button
                      type="button"
                      aria-pressed={botDifficulty === "hard"}
                      onClick={() => onBotDifficultyChange("hard")}
                    >
                      Hard
                    </button>
                  </div>
                  <span className="runtimeBotDifficultyStatus">{selectedBotPolicyStatusLabel}</span>
                </div>
              ) : null}
              <button
                type="button"
                className="runtimeFightStartButton"
                onClick={startManualFightCountdown}
                disabled={!selectedBotPolicyReady}
              >
                Start
              </button>
            </div>
          ) : null}
          <div
            className="nhSceneOverlayLayer"
            data-source-layer="Scene.copy$drawActor2d viewport overlay pass"
            style={runtimeSceneOverlayLayerStyle(fixedClientCssLayout)}
          >
          {fightCountdownLabel ? (
            <div
              className="runtimeFightCountdownOverlay"
              aria-hidden="true"
              data-countdown-label={fightCountdownLabel}
              data-combat-start-tick={manualCombatState.combatStartTick}
              data-combat-current-tick={manualCombatState.tick}
              data-trainer-extension="pre-fight-countdown"
              data-trainer-countdown-rules="movement-and-supplies-allowed; player-and-opponent-attacks-blocked-until-go"
              style={runtimeFightCountdownOverlayStyle(fixedClientCssLayout)}
            >
              <div
                key={`${manualCombatState.combatStartTick}:${fightCountdownLabel}`}
                className={`runtimeFightCountdownText${fightCountdownLabel === "Go" ? " runtimeFightCountdownText-go" : ""}`}
              >
                {fightCountdownLabel}
              </div>
            </div>
          ) : null}
          {runeliteTileIndicatorOverlays.length > 0 ? (
            <svg
              className="runeliteTileIndicatorsOverlay"
              viewBox={`0 0 ${runeliteTileIndicatorOverlays[0]?.sourceWidth ?? 0} ${runeliteTileIndicatorOverlays[0]?.sourceHeight ?? 0}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              data-source-plugin="TileIndicatorsPlugin"
              data-source-overlay="TileIndicatorsOverlay"
              data-source-overlay-position={RUNELITE_TILE_INDICATORS_OVERLAY_POSITION}
              data-source-overlay-layer={RUNELITE_TILE_INDICATORS_OVERLAY_LAYER}
              data-source-overlay-priority={RUNELITE_TILE_INDICATORS_OVERLAY_PRIORITY}
              data-source-selected-scene-tile="client.getSelectedSceneTile()"
              data-source-destination-location="client.getLocalDestinationLocation()"
              data-source-current-location="LocalPoint.fromWorld(client, client.getLocalPlayer().getWorldLocation())"
              data-source-polygon="Perspective.getCanvasTilePoly(client, dest)"
              data-source-render-polygon="OverlayUtil.renderPolygon/renderPolygonThin"
              style={runeliteTileIndicatorsSvgStyle(fixedClientCssLayout)}
            >
              {runeliteTileIndicatorOverlays.map((overlay) => (
                <polygon
                  key={overlay.id}
                  className={`runeliteTileIndicatorPolygon runeliteTileIndicatorPolygon-${overlay.kind}`}
                  points={overlay.points}
                  fill={RUNELITE_TILE_INDICATORS_FILL_RGBA}
                  stroke={overlay.strokeColor}
                  strokeWidth={overlay.strokeWidth}
                  vectorEffect="non-scaling-stroke"
                  data-tile-indicator-kind={overlay.kind}
                  data-tile-x={overlay.tile.x}
                  data-tile-z={overlay.tile.z}
                  data-source-stroke-width={overlay.strokeWidth}
                />
              ))}
            </svg>
          ) : null}
          {runtimeDomOverlays.map((overlay) => (
            <div
              key={overlay.id}
              ref={(element) => {
                if (element) {
                  runtimeDomOverlayElementsRef.current.set(overlay.id, element);
                  applyRuntimeDomOverlayElementStyle(element, overlay, fixedClientCssLayout);
                } else {
                  runtimeDomOverlayElementsRef.current.delete(overlay.id);
                }
              }}
              className="nhActorOverlay"
              data-actor-id={overlay.actorId}
              data-sprite-sheet-id={overlay.spriteSheetId}
              data-trainer-hitsplat-scale={overlay.hitsplatScale ?? ""}
              data-trainer-extension={overlay.hitsplatScale ? "runtime-overlay-scale-probe" : ""}
              style={runtimeDomOverlayStaticStyle(overlay)}
            >
              {overlay.sprites.map((sprite) => (
                <span
                  key={sprite.key}
                  className="nhActorOverlaySprite"
                  data-sprite-sheet-id={sprite.sheetId}
                  data-sprite-id={sprite.spriteId}
                  data-sprite-frame={sprite.spriteFrame}
                  style={runtimeDomOverlaySpriteStyle(sprite)}
                />
              ))}
            </div>
          ))}
          {runeliteFreezeTimerOverlays.map((overlay) => (
            <div
              key={overlay.id}
              ref={(element) => {
                if (element) {
                  runeliteFreezeTimerOverlayElementsRef.current.set(overlay.id, element);
                  applyRuneliteProjectedDomOverlayElementStyle(element, overlay, fixedClientCssLayout);
                } else {
                  runeliteFreezeTimerOverlayElementsRef.current.delete(overlay.id);
                }
              }}
              className={`runeliteFreezeTimerOverlay${overlay.noImage ? " runeliteFreezeTimerOverlay-noImage" : ""}`}
              data-actor-id={overlay.actorId}
              data-freeze-timer-state={overlay.state}
              data-freeze-end-tick={overlay.freezeEndTick}
              data-freeze-reapply-end-tick={overlay.reapplyEndTick}
              data-remaining-ticks={overlay.remainingTicks}
              data-source-overlay="FreezeTimersOverlay"
              data-source-plugin="FreezeTimersPlugin.onSpotAnimationChanged"
              data-source-player-spell-effect="PlayerSpellEffect.BARRAGE spotAnimId=369 timerLengthTicks=19200"
              data-source-timer-type="TimerType.FREEZE immunityTime=3000"
              data-source-overlay-priority="OverlayPriority.HIGHEST"
              data-source-overlay-position="OverlayPosition.DYNAMIC"
              data-source-overlay-layer="OverlayLayer.UNDER_WIDGETS"
              data-source-placement="actor.getCanvasImageLocation(image, 0) + xOffset; overlaysDrawn * 18"
              style={runeliteFreezeTimerOverlayStyle(overlay, fixedClientCssLayout)}
            >
              {overlay.noImage ? null : (
                <img
                  className="runeliteFreezeTimerImage"
                  src={overlay.imagePath}
                  alt=""
                  draggable={false}
                  width={RUNELITE_FREEZE_TIMERS_IMAGE_WIDTH_PX}
                  height={RUNELITE_FREEZE_TIMERS_IMAGE_HEIGHT_PX}
                />
              )}
              <span className="runeliteFreezeTimerText" style={runeliteFreezeTimerTextStyle(overlay)}>
                {overlay.text}
              </span>
            </div>
          ))}
          {runelitePlayerIndicatorOverlays.map((overlay) => (
            <div
              key={overlay.id}
              ref={(element) => {
                if (element) {
                  runelitePlayerIndicatorOverlayElementsRef.current.set(overlay.id, element);
                  applyRuneliteProjectedDomOverlayElementStyle(element, overlay, fixedClientCssLayout);
                } else {
                  runelitePlayerIndicatorOverlayElementsRef.current.delete(overlay.id);
                }
              }}
              className="runelitePlayerIndicatorOverlay"
              data-actor-id={overlay.actorId}
              data-player-indicator-relation={overlay.relation}
              data-source-plugin="PlayerIndicatorsPlugin"
              data-source-overlay="PlayerIndicatorsOverlay"
              data-source-overlay-position="OverlayPosition.DYNAMIC"
              data-source-overlay-priority="OverlayPriority.MED"
              data-source-service="PlayerIndicatorsService.forEachPlayer"
              data-source-location="PlayerIndicationLocation.ABOVE_HEAD"
              data-source-actor-overhead-text-margin={RUNELITE_PLAYER_INDICATORS_ACTOR_OVERHEAD_TEXT_MARGIN}
              data-source-actor-horizontal-text-margin={RUNELITE_PLAYER_INDICATORS_ACTOR_HORIZONTAL_TEXT_MARGIN}
              style={runelitePlayerIndicatorOverlayStyle(overlay, fixedClientCssLayout)}
            >
              {overlay.label}
            </div>
          ))}
          {runelitePrayAgainstPlayerOverlays.map((overlay) => (
            <span
              key={overlay.id}
              ref={(element) => {
                if (element) {
                  runelitePrayAgainstPlayerOverlayElementsRef.current.set(overlay.id, element);
                  applyRuneliteProjectedDomOverlayElementStyle(element, overlay, fixedClientCssLayout);
                } else {
                  runelitePrayAgainstPlayerOverlayElementsRef.current.delete(overlay.id);
                }
              }}
              className="runelitePrayAgainstPlayerOverlay"
              data-actor-id={overlay.actorId}
              data-relation={overlay.relation}
              data-weapon-type={overlay.weaponType}
              data-weapon-name={overlay.weaponName}
              data-prayer-id={overlay.prayerId}
              data-sprite-id={overlay.spriteId}
              data-source-plugin="PrayAgainstPlayerPlugin"
              data-source-overlay="PrayAgainstPlayerOverlay"
              data-source-overlay-layer="OverlayLayer.ABOVE_SCENE"
              data-source-overlay-position="OverlayPosition.DYNAMIC"
              data-source-overlay-priority="OverlayPriority.HIGH"
              data-source-placement="player.getCanvasImageLocation(icon, player.getLogicalHeight() / 2 + 75)"
              data-source-icon={RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_ICON}
              data-source-icon-outline-color={RUNELITE_PRAY_AGAINST_PLAYER_ICON_OUTLINE_COLOR}
              data-source-weapon-type={RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_WEAPON_TYPE}
              style={runelitePrayAgainstPlayerOverlayStyle(overlay, fixedClientCssLayout)}
            >
              <span
                className="runelitePrayAgainstPlayerIcon"
                aria-hidden="true"
                style={runelitePrayAgainstPlayerSpriteStyle(overlay)}
              />
            </span>
          ))}
          {runelitePrayerBarOverlay ? (
            <div
              key={runelitePrayerBarOverlay.id}
              ref={(element) => {
                if (element) {
                  runelitePrayerBarOverlayElementsRef.current.set(runelitePrayerBarOverlay.id, element);
                  applyRuneliteProjectedDomOverlayElementStyle(element, runelitePrayerBarOverlay, fixedClientCssLayout);
                } else {
                  runelitePrayerBarOverlayElementsRef.current.delete(runelitePrayerBarOverlay.id);
                }
              }}
              className="runelitePrayerBarOverlay"
              data-actor-id={runelitePrayerBarOverlay.actorId}
              data-current-prayer={runelitePrayerBarOverlay.currentPrayer}
              data-max-prayer={runelitePrayerBarOverlay.maxPrayer}
              data-prayer-ratio={runelitePrayerBarOverlay.ratio.toFixed(3)}
              data-progress-fill={runelitePrayerBarOverlay.progressFill}
              data-show-flick-helper={runelitePrayerBarOverlay.showFlickHelper}
              data-flick-location={runelitePrayerBarOverlay.flickLocation}
              data-flick-x-offset={runelitePrayerBarOverlay.flickXOffset}
              data-source-plugin="PrayerPlugin"
              data-source-overlay="PrayerBarOverlay"
              data-source-overlay-position="OverlayPosition.DYNAMIC"
              data-source-overlay-priority="OverlayPriority.HIGH"
              data-source-overlay-layer="OverlayLayer.ABOVE_SCENE"
              data-source-placement="Perspective.localToCanvas(localPlayer, logicalHeight + 10)"
              data-source-size={`${RUNELITE_PRAYER_BAR_WIDTH}x${RUNELITE_PRAYER_BAR_HEIGHT}`}
              data-source-fill-color={RUNELITE_PRAYER_BAR_FILL_RGBA}
              data-source-background-color={RUNELITE_PRAYER_BAR_BACKGROUND_RGBA}
              data-source-flick-color={RUNELITE_PRAYER_FLICK_HELP_RGBA}
              style={runelitePrayerBarOverlayStyle(runelitePrayerBarOverlay, fixedClientCssLayout)}
            >
              <span className="runelitePrayerBarBackground" aria-hidden="true" />
              <span className="runelitePrayerBarFill" aria-hidden="true" style={runelitePrayerBarFillStyle(runelitePrayerBarOverlay)} />
              {runelitePrayerBarOverlay.showFlickHelper ? (
                <span className="runelitePrayerBarFlickMarker" aria-hidden="true" style={runelitePrayerBarFlickStyle(runelitePrayerBarOverlay)} />
              ) : null}
            </div>
          ) : null}
          </div>
          {runelitePrayerFlickOrbOverlay ? (
            <span
              className="runelitePrayerFlickOrbOverlay"
              data-source-plugin="PrayerPlugin"
              data-source-overlay="PrayerFlickOverlay"
              data-source-widget="WidgetInfo.MINIMAP_QUICK_PRAYER_ORB"
              data-source-placement="bounds.x + 24, bounds.y - 1"
              data-source-overlay-position="OverlayPosition.DYNAMIC"
              data-source-overlay-layer="OverlayLayer.ABOVE_WIDGETS"
              data-flick-location={runelitePrayerFlickOrbOverlay.flickLocation}
              data-flick-x-offset={runelitePrayerFlickOrbOverlay.xOffset}
              data-flick-y-offset={runelitePrayerFlickOrbOverlay.yOffset.toFixed(3)}
              data-flick-height={runelitePrayerFlickOrbOverlay.indicatorHeight.toFixed(3)}
              data-source-flick-color={RUNELITE_PRAYER_ORB_FLICK_RGBA}
              style={runelitePrayerFlickOrbOverlayStyle(runelitePrayerFlickOrbOverlay, fixedClientCssLayout)}
            />
          ) : null}
          <div
            className="nhSceneOverlayLayer"
            data-source-layer="xpdrops_stattransmit/xpdrops_dropletmove fixed viewport pass"
            style={runtimeSceneOverlayLayerStyle(fixedClientCssLayout)}
          >
            {runeliteXpDropOverlays.map((overlay) => (
              <span
                key={overlay.id}
                ref={(element) => {
                  if (element) {
                    runeliteXpDropOverlayElementsRef.current.set(overlay.id, element);
                    applyRuneliteXpDropOverlayElementStyle(
                      element,
                      overlay,
                      fixedClientCssLayout,
                      Math.floor(performance.now() / NH_CLIENT_CYCLE_MS)
                    );
                  } else {
                    runeliteXpDropOverlayElementsRef.current.delete(overlay.id);
                  }
                }}
                className="runeliteXpDropOverlay"
                data-actor-id={overlay.actorId}
                data-damage={overlay.damage}
                data-display-mode={overlay.displayMode}
                data-hit-id={overlay.hitId}
                data-hp-xp={overlay.hpXp}
                data-xp-total={overlay.xpTotal}
                data-xp-skills={overlay.xpDrops.map((drop) => `${drop.skillId}:${drop.xp.toFixed(2)}`).join(",")}
                data-skill-icons={overlay.skillIcons.map((icon) => icon.skillId).join(",")}
                data-source-font-id={overlay.fontId ?? ""}
                data-source-font-archive={overlay.fontArchiveName}
                data-source-glyph-atlas={overlay.fontSheetId ?? ""}
                data-source-client-script="xpdrops_stattransmit"
                data-source-combat-xp="CombatUtils.addXp damage*4 attackType split; TargetSpell.addMagicXp baseXp + damage*2; Hitpoints damage*1.33"
                data-source-damage-ratio="XpDropPlugin HITPOINT_RATIO = 1.33"
                data-source-droplet-move="xpdrops_dropletmove interpolate(0, elapsed, 0, enum_1171(varbit4722), 16384)"
                data-source-panel-position="xpdrops_setposition right:2 top:2 when varbit4692=0"
                data-source-setdropsize={`xpdrops_setdropsize varbit4693=${overlay.textSizeVarbit4693} ${overlay.fontArchiveName} height=${overlay.height}`}
                data-text-size={overlay.textSize}
                data-text-size-varbit4693={overlay.textSizeVarbit4693}
                data-trainer-text-scale={overlay.textScale.toFixed(3)}
                data-trainer-move-distance={overlay.moveDistance}
                data-trainer-extension="trainerDisplayMode HIT renders queued-hit damage; trainerFont/trainerTextSize/trainerMoveDistance scale source font and droplet movement"
                style={runeliteXpDropOverlayStyle(
                  overlay,
                  fixedClientCssLayout,
                  Math.floor(performance.now() / NH_CLIENT_CYCLE_MS)
                )}
              >
                {overlay.skillIcons.map((icon, index) => (
                  <img
                    key={icon.skillId}
                    className="runeliteXpDropSkillIcon"
                    src={icon.path}
                    alt=""
                    draggable={false}
                    style={runeliteXpDropIconStyle(overlay.height, index)}
                  />
                ))}
                <RuneliteXpDropGlyphText
                  atlas={overlay.fontSheetId ? spriteAtlases.get(overlay.fontSheetId) : undefined}
                  color={overlay.color}
                  font={nhClientFontDefinition(clientFonts, overlay.fontKey)}
                  height={overlay.height}
                  text={overlay.text}
                  width={overlay.textWidth}
                />
              </span>
            ))}
          </div>
          <div
            className="nhSceneOverlayLayer"
            data-source-layer="XpDropPlugin above-opponent viewport overlay pass"
            style={runtimeSceneOverlayLayerStyle(fixedClientCssLayout)}
          >
          {runeliteXpDropDamageOverlay ? (
            <span
              ref={(element) => {
                if (element) {
                  runeliteXpDropDamageOverlayElementsRef.current.set(runeliteXpDropDamageOverlay.id, element);
                  applyRuneliteProjectedDomOverlayElementStyle(element, runeliteXpDropDamageOverlay, fixedClientCssLayout);
                } else {
                  runeliteXpDropDamageOverlayElementsRef.current.delete(runeliteXpDropDamageOverlay.id);
                }
              }}
              className="runeliteXpDropDamageOverlay"
              data-actor-id={runeliteXpDropDamageOverlay.actorId}
              data-damage={runeliteXpDropDamageOverlay.damage}
              data-tick-show={runeliteXpDropDamageOverlay.tickShow}
              data-source-plugin="XpDropPlugin"
              data-source-overlay="XpDropOverlay"
              data-source-overlay-position="OverlayPosition.DYNAMIC"
              data-source-overlay-priority="OverlayPriority.MED"
              data-source-damage-mode="DamageMode.ABOVE_OPPONENT"
              data-source-placement="opponent.getCanvasTextLocation(graphics, damageStr, opponent.getLogicalHeight() + 50)"
              data-source-renderer="OverlayUtil.renderTextLocation"
              style={runeliteXpDropDamageOverlayStyle(runeliteXpDropDamageOverlay, fixedClientCssLayout)}
            >
              {runeliteXpDropDamageOverlay.damage}
            </span>
          ) : null}
          </div>
          {runeliteAttackStylesOverlay ? (
            <aside
              className="runeliteAttackStylesOverlay"
              aria-label="Attack Styles"
              data-attack-style-id={runeliteAttackStylesOverlay.attackStyle.id}
              data-attack-style-name={runeliteAttackStylesOverlay.attackStyle.name}
              data-attack-style-skills={runeliteAttackStylesOverlay.attackStyle.skills.join(",")}
              data-warned-skill-selected={runeliteAttackStylesOverlay.warnedSkillSelected}
              data-weapon-type-config={runeliteAttackStylesOverlay.weaponTypeConfig}
              data-attack-set-index={runeliteAttackStylesOverlay.attackSetIndex}
              data-defensive-casting-mode={runeliteAttackStylesOverlay.defensiveCastingMode}
              data-source-plugin="AttackStylesPlugin"
              data-source-overlay="AttackStylesOverlay"
              data-source-overlay-position={RUNELITE_ATTACK_STYLES_OVERLAY_POSITION}
              data-source-overlay-menu="RUNELITE_OVERLAY_CONFIG Configure Attack style overlay"
              data-runelite-overlay-name="AttackStylesOverlay"
              data-runelite-overlay-scale={fixedClientCssLayout?.scale ?? 1}
              data-source-overlay-position-storage={RUNELITE_OVERLAY_POSITION_SOURCE}
              data-runelite-config-plugin-id="attack-styles"
              data-runelite-overlay-menu-target="Attack style overlay"
              data-runelite-overlay-menu-opcode-source={RUNELITE_OVERLAY_CONFIG_MENU_OPCODE_SOURCE}
              data-source-panel="PanelComponent"
              data-source-title="TitleComponent"
              data-source-panel-padding-x={RUNELITE_ATTACK_STYLES_PANEL_PADDING_X}
              data-source-normal-color={RUNELITE_ATTACK_STYLES_TEXT_NORMAL_RGBA}
              data-source-warning-color={RUNELITE_ATTACK_STYLES_TEXT_WARNING_RGBA}
              style={runeliteAttackStylesOverlayStyle(runeliteAttackStylesOverlay, fixedClientCssLayout, runeliteOverlayLocations)}
            >
              <span className="runeliteAttackStylesTitle">{runeliteAttackStylesOverlay.attackStyle.name}</span>
            </aside>
          ) : null}
          {runeliteBoostsOverlay ? (
            <aside
              className={`runeliteBoostsOverlay runeliteBoostsOverlay-${runeliteBoostsOverlay.mode}`}
              aria-label="Boosts Information"
              data-source-plugin="BoostsPlugin"
              data-source-overlay={runeliteBoostsOverlay.mode === "combat-icons" ? "CombatIconsOverlay" : "BoostsOverlay"}
              data-runelite-overlay-name={runeliteBoostsOverlay.mode === "combat-icons" ? "CombatIconsOverlay" : "BoostsOverlay"}
              data-runelite-overlay-scale={fixedClientCssLayout?.scale ?? 1}
              data-source-overlay-position-storage={RUNELITE_OVERLAY_POSITION_SOURCE}
              data-runelite-config-plugin-id="boosts-information"
              data-runelite-overlay-menu-target="Boosts overlay"
              data-runelite-overlay-menu-opcode-source={RUNELITE_OVERLAY_CONFIG_MENU_OPCODE_SOURCE}
              data-source-position="OverlayPosition.TOP_LEFT"
              data-source-priority="OverlayPriority.MED"
              data-source-panel="PanelComponent"
              data-source-table="TableComponent"
              data-source-width={RUNELITE_BOOSTS_OVERLAY_WIDTH}
              data-source-icon-panel-width={RUNELITE_BOOSTS_ICON_PANEL_WIDTH}
              data-source-row-height={RUNELITE_BOOSTS_ROW_HEIGHT}
              data-source-icon-row-height={RUNELITE_BOOSTS_ICON_ROW_HEIGHT}
              data-source-background={RUNELITE_BOOSTS_BACKGROUND_RGBA}
              data-boosts-mode={runeliteBoostsOverlay.mode}
              data-boosts-row-count={runeliteBoostsOverlay.rows.length}
              style={runeliteBoostsOverlayStyle(runeliteBoostsOverlay, fixedClientCssLayout, runeliteOverlayLocations)}
            >
              {runeliteBoostsOverlay.rows.map((row) => (
                <div
                  key={row.skillId}
                  className="runeliteBoostsRow"
                  data-boost-skill-id={row.skillId}
                  data-source-skill={row.sourceSkill}
                  data-boost-current={row.boostedLevel}
                  data-boost-base={row.baseLevel}
                  data-boost-delta={row.boost}
                >
                  {runeliteBoostsOverlay.mode === "combat-icons" ? (
                    <img className="runeliteBoostsIcon" src={row.iconPath} alt="" draggable={false} />
                  ) : (
                    <span className="runeliteBoostsLabel">{row.label}</span>
                  )}
                  <span className="runeliteBoostsValue" style={runeliteBoostRowValueStyle(row)}>
                    {row.boostedValue}
                  </span>
                  {row.baseValue && runeliteBoostsOverlay.mode === "panel" ? (
                    <span className="runeliteBoostsBaseValue">{row.baseValue}</span>
                  ) : null}
                </div>
              ))}
            </aside>
          ) : null}
          {runeliteFreezeTimerInfoBoxOverlay ? (
            <aside
              className="runeliteInfoBoxOverlay runeliteInfoBoxOverlay-horizontal"
              aria-label="Freeze Timer"
              data-source-plugin="TimersPlugin"
              data-source-overlay="InfoBoxOverlay"
              data-runelite-overlay-name="InfoBoxOverlay"
              data-runelite-overlay-scale={fixedClientCssLayout?.scale ?? 1}
              data-source-overlay-position-storage={RUNELITE_OVERLAY_POSITION_SOURCE}
              data-source-infobox="TimerTimer(GameTimer.ICEBARRAGE)"
              data-source-position="OverlayPosition.TOP_LEFT"
              data-trainer-default-position="bottom-left fixed game viewport when no saved InfoBoxOverlay location exists"
              data-source-priority="InfoBoxPriority.MED"
              data-source-panel="PanelComponent"
              data-source-panel-background="null"
              data-source-panel-border="new Rectangle()"
              data-source-panel-gap={`new Point(${runeliteFreezeTimerInfoBoxOverlay.gap}, ${runeliteFreezeTimerInfoBoxOverlay.gap})`}
              data-source-game-timer="GameTimer.ICEBARRAGE SpriteID.SPELL_ICE_BARRAGE duration=20s"
              data-source-chat-message="TimersPlugin.onChatMessage FROZEN_MESSAGE createGameTimer(ICEBARRAGE)"
              data-infobox-size={runeliteFreezeTimerInfoBoxOverlay.size}
              data-freeze-end-tick={runeliteFreezeTimerInfoBoxOverlay.freezeEndTick}
              data-remaining-ticks={runeliteFreezeTimerInfoBoxOverlay.remainingTicks}
              style={runeliteFreezeTimerInfoBoxOverlayStyle(
                runeliteFreezeTimerInfoBoxOverlay,
                fixedClientCssLayout,
                runeliteOverlayLocations
              )}
            >
              <div
                className="runeliteInfoBox runeliteFreezeTimerInfoBox"
                title={runeliteFreezeTimerInfoBoxOverlay.tooltip}
                data-infobox-sprite-id={runeliteFreezeTimerInfoBoxOverlay.spriteId}
                data-infobox-state={runeliteFreezeTimerInfoBoxOverlay.state}
                style={runeliteFreezeTimerInfoBoxItemStyle(runeliteFreezeTimerInfoBoxOverlay)}
              >
                <span
                  className="runeliteFreezeTimerInfoBoxIcon"
                  aria-hidden="true"
                  style={runeliteFreezeTimerInfoBoxIconStyle(runeliteFreezeTimerInfoBoxOverlay)}
                />
                <span className="runeliteInfoBoxText">{runeliteFreezeTimerInfoBoxOverlay.text}</span>
              </div>
            </aside>
          ) : null}
          {runeliteBoostsInfoBoxOverlay ? (
            <aside
              className={`runeliteInfoBoxOverlay runeliteInfoBoxOverlay-${runeliteBoostsInfoBoxOverlay.orientation}`}
              aria-label="Boosts Information Infoboxes"
              data-source-plugin="BoostsPlugin"
              data-source-overlay="InfoBoxOverlay"
              data-runelite-overlay-name="InfoBoxOverlay"
              data-runelite-overlay-scale={fixedClientCssLayout?.scale ?? 1}
              data-source-overlay-position-storage={RUNELITE_OVERLAY_POSITION_SOURCE}
              data-source-infobox="BoostIndicator"
              data-source-position="OverlayPosition.TOP_LEFT"
              data-source-priority="InfoBoxPriority.HIGH"
              data-source-panel="PanelComponent"
              data-source-panel-background="null"
              data-source-panel-border="new Rectangle()"
              data-source-panel-gap={`new Point(${RUNELITE_INFOBOX_GAP_PX}, ${RUNELITE_INFOBOX_GAP_PX})`}
              data-source-wrapping="config.infoBoxWrap()"
              data-source-orientation="config.infoBoxVertical() ? ComponentOrientation.VERTICAL : ComponentOrientation.HORIZONTAL"
              data-source-preferred-size="new Dimension(config.infoBoxSize(), config.infoBoxSize())"
              data-source-image-scale="InfoBoxManager updateInfoBoxImage Math.max(2, runeLiteConfig.infoBoxSize())"
              data-infobox-orientation={runeliteBoostsInfoBoxOverlay.orientation}
              data-infobox-wrap={runeliteBoostsInfoBoxOverlay.wrap}
              data-infobox-size={runeliteBoostsInfoBoxOverlay.size}
              data-infobox-count={runeliteBoostsInfoBoxOverlay.boxes.length}
              style={runeliteBoostsInfoBoxOverlayStyle(runeliteBoostsInfoBoxOverlay, fixedClientCssLayout, runeliteOverlayLocations)}
            >
              {runeliteBoostsInfoBoxOverlay.boxes.map((box) => (
                <div
                  key={box.skillId}
                  className="runeliteInfoBox"
                  title={box.tooltip}
                  data-infobox-skill-id={box.skillId}
                  data-source-skill={box.sourceSkill}
                  data-infobox-priority={box.priority}
                  data-infobox-current={box.boostedLevel}
                  data-infobox-base={box.baseLevel}
                  data-infobox-delta={box.boost}
                  style={runeliteBoostsInfoBoxItemStyle(box, runeliteBoostsInfoBoxOverlay)}
                >
                  <img className="runeliteInfoBoxImage" src={box.iconPath} alt="" draggable={false} />
                  <span className="runeliteInfoBoxText">{box.text}</span>
                </div>
              ))}
            </aside>
          ) : null}
          {runeliteStatusBars.map((bar) => (
            <div
              key={`runelite-status-bar-${bar.side}-${bar.mode}`}
              className="runeliteStatusBarOverlay"
              data-status-bar-side={bar.side}
              data-status-bar-mode={bar.mode}
              data-status-bar-current-value={bar.currentValue}
              data-status-bar-maximum-value={bar.maximumValue}
              data-status-bar-filled-height={bar.filledHeight}
              data-source-plugin="StatusBarsPlugin"
              data-source-overlay="StatusBarsOverlay"
              data-source-renderer={bar.sourceRenderer}
              data-source-overlay-position="OverlayPosition.DYNAMIC"
              data-source-overlay-layer="OverlayLayer.ABOVE_WIDGETS"
              data-source-viewport="Viewport.FIXED WidgetInfo.FIXED_VIEWPORT_INTERFACE_CONTAINER"
              data-source-height={RUNELITE_STATUS_BARS_HEIGHT}
              data-source-bar-width={RUNELITE_STATUS_BARS_BAR_WIDTH}
              data-source-left-offset={`${RUNELITE_STATUS_BARS_FIXED_LEFT_OFFSET.x},${RUNELITE_STATUS_BARS_FIXED_LEFT_OFFSET.y}`}
              data-source-right-offset={`${RUNELITE_STATUS_BARS_FIXED_RIGHT_OFFSET.x},${RUNELITE_STATUS_BARS_FIXED_RIGHT_OFFSET.y}`}
              data-source-background-color={RUNELITE_STATUS_BARS_BACKGROUND_RGBA}
              data-source-padding={RUNELITE_STATUS_BARS_PADDING}
              data-source-icon-counter-offset={`${RUNELITE_STATUS_BARS_ICON_AND_COUNTER_OFFSET_X},${RUNELITE_STATUS_BARS_ICON_AND_COUNTER_OFFSET_Y}`}
              data-source-x={bar.sourceX}
              data-source-y={bar.sourceY}
              style={runeliteStatusBarOverlayStyle(bar, fixedClientCssLayout)}
            >
              <span className="runeliteStatusBarBackground" aria-hidden="true" />
              <span className="runeliteStatusBarFill" aria-hidden="true" style={runeliteStatusBarFillStyle(bar)} />
              {bar.enableRestorationBars && bar.restoreValue > 0 ? (
                <span className="runeliteStatusBarRestore" aria-hidden="true" style={runeliteStatusBarRestoreStyle(bar)} />
              ) : null}
              {bar.enableSkillIcon && bar.iconPath ? (
                <img
                  className="runeliteStatusBarIcon"
                  src={bar.iconPath}
                  alt=""
                  draggable={false}
                  style={runeliteStatusBarIconStyle(bar)}
                />
              ) : null}
              {bar.enableCounter ? (
                <span className="runeliteStatusBarCounter" style={runeliteStatusBarCounterStyle(bar)}>
                  {bar.currentValue}
                </span>
              ) : null}
            </div>
          ))}
          {runeliteOpponentComparison ? (
            <aside
              className="runeliteOpponentComparisonOverlay"
              aria-label="Opponent player comparison"
              data-opponent-id={runeliteOpponentComparison.opponentId}
              data-opponent-name={runeliteOpponentComparison.opponentName}
              data-row-count={runeliteOpponentComparison.rows.length}
              data-source-plugin="OpponentInfoPlugin"
              data-source-overlay="PlayerComparisonOverlay"
              data-runelite-overlay-name="PlayerComparisonOverlay"
              data-runelite-overlay-scale={fixedClientCssLayout?.scale ?? 1}
              data-source-overlay-position-storage={RUNELITE_OVERLAY_POSITION_SOURCE}
              data-runelite-config-plugin-id="opponent-info"
              data-runelite-overlay-menu-target="Opponent info overlay"
              data-runelite-overlay-menu-opcode-source={RUNELITE_OVERLAY_CONFIG_MENU_OPCODE_SOURCE}
              data-source-overlay-position={runeliteOpponentComparison.sourceOverlayPosition}
              data-source-overlay-layer={runeliteOpponentComparison.sourceOverlayLayer}
              data-source-panel="PanelComponent"
              data-source-title="TitleComponent"
              data-source-table="TableComponent"
              data-source-column-alignments="LEFT,CENTER,RIGHT"
              data-source-columns="Skill,You,Them"
              data-source-combat-skills="ATTACK,STRENGTH,DEFENCE,HITPOINTS,RANGED,MAGIC,PRAYER"
              style={runeliteOpponentComparisonOverlayStyle(runeliteOpponentComparison, fixedClientCssLayout, runeliteOverlayLocations)}
            >
              <span className="runeliteOpponentComparisonTitle">{runeliteOpponentComparison.opponentName}</span>
              <span className="runeliteOpponentComparisonTable" role="table" aria-label="Combat skill comparison">
                <span className="runeliteOpponentComparisonRow runeliteOpponentComparisonHeader" role="row">
                  <span role="columnheader">Skill</span>
                  <span role="columnheader">You</span>
                  <span role="columnheader">Them</span>
                </span>
                {runeliteOpponentComparison.rows.map((row) => (
                  <span
                    key={row.skill}
                    className="runeliteOpponentComparisonRow"
                    role="row"
                    data-skill={row.skill}
                    data-local-level={row.localLevel}
                    data-opponent-level={row.opponentLevel}
                  >
                    <span role="cell">{row.label}</span>
                    <span role="cell" style={{ color: row.localColor }}>{row.localLevel}</span>
                    <span role="cell" style={{ color: row.opponentColor }}>{row.opponentLevel}</span>
                  </span>
                ))}
              </span>
            </aside>
          ) : null}
          {runeliteOpponentInfo ? (
            <aside
              className="runeliteOpponentInfoOverlay"
              aria-label="Opponent Information"
              data-opponent-id={runeliteOpponentInfo.opponentId}
              data-opponent-name={runeliteOpponentInfo.opponentName}
              data-opponent-hitpoints={runeliteOpponentInfo.currentHitpoints}
              data-opponent-max-hitpoints={runeliteOpponentInfo.maxHitpoints}
              data-opponent-display-style={runeliteOpponentInfo.displayStyle}
              data-opponent-fill-percent={runeliteOpponentInfo.fillPercent.toFixed(3)}
              data-source-plugin="OpponentInfoPlugin"
              data-source-last-opponent={runeliteOpponentInfo.sourceLastOpponent}
              data-source-wait-ms={RUNELITE_OPPONENT_INFO_WAIT_MS}
              data-source-overlay="OpponentInfoOverlay"
              data-runelite-overlay-name="OpponentInfoOverlay"
              data-runelite-overlay-scale={fixedClientCssLayout?.scale ?? 1}
              data-source-overlay-position-storage={RUNELITE_OVERLAY_POSITION_SOURCE}
              data-runelite-config-plugin-id="opponent-info"
              data-runelite-overlay-menu-target="Opponent info overlay"
              data-runelite-overlay-menu-opcode-source={RUNELITE_OVERLAY_CONFIG_MENU_OPCODE_SOURCE}
              data-source-overlay-position="OverlayPosition.TOP_LEFT"
              data-source-overlay-priority="OverlayPriority.HIGH"
              data-source-panel="PanelComponent"
              data-source-panel-standard-width={RUNELITE_OPPONENT_INFO_STANDARD_WIDTH}
              data-source-panel-background={RUNELITE_OPPONENT_INFO_BACKGROUND_RGBA}
              data-source-panel-outside-stroke={RUNELITE_OPPONENT_INFO_OUTSIDE_STROKE_RGBA}
              data-source-panel-inside-stroke={RUNELITE_OPPONENT_INFO_INSIDE_STROKE_RGBA}
              data-source-panel-border={`${RUNELITE_OPPONENT_INFO_PANEL_BORDER.left},${RUNELITE_OPPONENT_INFO_PANEL_BORDER.top},${RUNELITE_OPPONENT_INFO_PANEL_BORDER.right},${RUNELITE_OPPONENT_INFO_PANEL_BORDER.bottom}`}
              data-source-panel-gap={`0,${RUNELITE_OPPONENT_INFO_PANEL_GAP_Y}`}
              data-source-title="TitleComponent"
              data-source-progress="ProgressBarComponent"
              data-source-progress-height={RUNELITE_OPPONENT_INFO_PROGRESS_HEIGHT}
              data-source-hp-green={RUNELITE_OPPONENT_INFO_HP_GREEN_RGBA}
              data-source-hp-red={RUNELITE_OPPONENT_INFO_HP_RED_RGBA}
              style={runeliteOpponentInfoOverlayStyle(runeliteOpponentInfo, fixedClientCssLayout, runeliteOverlayLocations)}
            >
              <span className="runeliteOpponentInfoTitle">{runeliteOpponentInfo.opponentName}</span>
              <span className="runeliteOpponentInfoProgress" aria-hidden="true">
                <span className="runeliteOpponentInfoProgressFill" style={runeliteOpponentInfoProgressFillStyle(runeliteOpponentInfo)} />
                <span className="runeliteOpponentInfoProgressLabel">{runeliteOpponentInfo.label}</span>
              </span>
              {runeliteOpponentInfo.opponentsOpponentName ? (
                <span className="runeliteOpponentInfoTitle">{runeliteOpponentInfo.opponentsOpponentName}</span>
              ) : null}
            </aside>
          ) : null}
          <div
            className="nhSceneOverlayLayer"
            data-source-layer="Client.drawMouseCross viewport overlay pass"
            style={runtimeSceneOverlayLayerStyle(fixedClientCssLayout)}
          >
            {visibleClickCross ? (
              <div
                className="nhClickCross"
                data-color={visibleClickCross.color}
                data-frame={visibleClickCross.frame}
                data-source-state={visibleClickCross.sourceState ?? ""}
                data-source-sprite-id={clickCrossSource?.spriteId ?? ""}
                data-source-mouse-cross-color={clickCrossSource?.mouseCrossColor ?? ""}
                data-source-frame={clickCrossSource?.frame ?? ""}
                data-source-draw-offset={clickCrossSource?.drawOffset ?? ""}
                data-source-sprite-width={clickCrossSpriteSource?.width ?? ""}
                data-source-sprite-height={clickCrossSpriteSource?.height ?? ""}
                data-source-sprite-offset-x={clickCrossSpriteSource?.offsetX ?? ""}
                data-source-sprite-offset-y={clickCrossSpriteSource?.offsetY ?? ""}
                style={clickCrossStyle(visibleClickCross, spriteAtlases, clickCrossDefinitions, fixedClientCssLayout)}
              />
            ) : null}
          </div>
          {runeliteMouseHighlightTooltip ? (
            <RuneliteMouseHighlightTooltip tooltip={runeliteMouseHighlightTooltip} />
          ) : null}
          {visibleContextMenu ? (
            <div
              className="nhContextMenu"
              data-menu-source={visibleContextMenu.source ?? ""}
              data-source-frame-color={NH_CONTEXT_MENU_FRAME_COLOR}
              data-source-outline-color={NH_CONTEXT_MENU_OUTLINE_COLOR}
              data-source-header-top-color={NH_CONTEXT_MENU_HEADER_TOP_COLOR}
              data-source-header-bottom-color={NH_CONTEXT_MENU_HEADER_BOTTOM_COLOR}
              data-source-body-border-color={NH_CONTEXT_MENU_BODY_BORDER_COLOR}
              data-source-body-color={NH_CONTEXT_MENU_BODY_COLOR}
              data-source-font-id={contextMenuFont?.fontId ?? ""}
              data-source-font-archive={contextMenuFont?.fontArchiveName ?? ""}
              data-source-glyph-atlas={contextMenuFontAtlas?.id ?? ""}
              data-source-glyph-image={contextMenuFontAtlas?.metadata.image ?? ""}
              data-source-close-margin={NH_CONTEXT_MENU_MOUSE_LEAVE_MARGIN}
              data-source-runelite-overlay-menu="OverlayRenderer bounds.contains(mouse) -> createRightClickMenuEntries; menuEntryShift gates insertion"
              data-source-runelite-overlay-menu-click="ConfigPlugin.onOverlayMenuClicked RUNELITE_OVERLAY_CONFIG opens plugin configuration panel"
              data-runelite-overlay-menu-count={visibleContextMenu.entries.filter(isRuneliteOverlayConfigContextMenuEntry).length}
              style={contextMenuStyleWithFont(visibleContextMenu, fixedClientCssLayout, contextMenuFont, contextMenuFontAtlas)}
            >
              <div className="nhContextMenuTitle">
                <NhContextMenuText
                  text={NH_CONTEXT_MENU_TITLE}
                  font={contextMenuFont}
                  atlas={contextMenuFontAtlas}
                  left={NH_CONTEXT_MENU_TEXT_LEFT}
                  baseline={NH_CONTEXT_MENU_TITLE_BASELINE_OFFSET}
                  color={NH_CONTEXT_MENU_TEXT_COLOR}
                />
              </div>
              {visibleNhMenuEntries(visibleContextMenu.entries).map((entry, index) => (
                <button
                  key={`${entry.action}-${entry.actionText}-${entry.targetText}-${entry.opcode}-${"sourceIndex" in entry ? entry.sourceIndex : index}`}
                  className="nhContextMenuOption"
                  type="button"
                  data-menu-action={entry.actionText}
                  data-menu-action-kind={entry.action}
                  data-menu-opcode={entry.opcode}
                  data-menu-identifier={entry.identifier ?? ""}
                  data-menu-argument1={entry.argument1 ?? ""}
                  data-menu-argument2={entry.argument2 ?? ""}
                  data-menu-source-index={"sourceIndex" in entry ? entry.sourceIndex : ""}
                  data-runelite-config-plugin-id={isRuneliteOverlayConfigContextMenuEntry(entry) ? entry.pluginId : ""}
                  data-runelite-overlay-menu-target={isRuneliteOverlayConfigContextMenuEntry(entry) ? entry.overlayTarget : ""}
                  data-runelite-overlay-menu-opcode={isRuneliteOverlayConfigContextMenuEntry(entry) ? entry.sourceOverlayMenuOpcode : ""}
                  data-runelite-overlay-source={isRuneliteOverlayConfigContextMenuEntry(entry) ? entry.sourceOverlay : ""}
                  data-source-hover-fill-color={NH_CONTEXT_MENU_HOVER_FILL_COLOR}
                  data-source-hover-fill-alpha={NH_CONTEXT_MENU_HOVER_FILL_ALPHA}
                  style={{ top: nhContextMenuOptionTop(index) }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    if (event.button !== 0) {
                      return;
                    }
                    event.preventDefault();
                    const boundary = boundaryRef.current;
                    dispatchVisibleContextMenuEntry(
                      entry,
                      visibleContextMenu,
                      boundary
                        ? pointerEventToViewportPosition(boundary, event.nativeEvent)
                        : { x: visibleContextMenu.x, y: visibleContextMenu.y }
                    );
                  }}
                  onClick={(event) => event.preventDefault()}
                >
                  <span
                    className="nhContextMenuHover"
                    aria-hidden="true"
                    style={{
                      left: NH_CONTEXT_MENU_HOVER_LEFT,
                      top: NH_CONTEXT_MENU_HOVER_TOP,
                      width: `calc(100% - ${NH_CONTEXT_MENU_HOVER_WIDTH_SUBTRACT}px)`,
                      height: NH_CONTEXT_MENU_HOVER_HEIGHT,
                      backgroundColor: NH_CONTEXT_MENU_HOVER_FILL_COLOR,
                      opacity: NH_CONTEXT_MENU_HOVER_FILL_ALPHA
                    }}
                  />
                  <NhContextMenuText
                    text={nhMenuEntryText(entry)}
                    font={contextMenuFont}
                    atlas={contextMenuFontAtlas}
                    left={NH_CONTEXT_MENU_TEXT_LEFT}
                    baseline={NH_CONTEXT_MENU_OPTION_BASELINE_OFFSET - NH_CONTEXT_MENU_HEADER_AND_PADDING_HEIGHT}
                    color={NH_CONTEXT_MENU_TEXT_COLOR}
                  />
                </button>
              ))}
            </div>
          ) : null}
          {opponentInventoryInspectOpen ? (
            <OpponentInventoryInspectPanel
              actor={manualCombatState.actors.opponent}
              itemAtlas={spriteAtlases.get("item_sprites")}
              itemDefinitions={inventoryItemDefinitions}
              onClose={() => setOpponentInventoryInspectOpen(false)}
            />
          ) : null}
          <div
            className="runtimeTemporaryDevControls"
            data-temporary-dev-controls="true"
            data-removal-note="Trainer-only test harness; remove this block plus the matching temporary helper functions when full account/bank setup exists."
          >
            <button type="button" onClick={restoreLocalSpecialEnergyForTesting}>
              Spec 100
            </button>
            <button
              type="button"
              aria-pressed={localFreezeBypass}
              onClick={toggleLocalFreezeBypassForTesting}
            >
              {localFreezeBypass ? "Freeze off" : "Freeze immune"}
            </button>
            <button type="button" onClick={saveTemporaryCurrentSetup}>
              Save setup
            </button>
            <button type="button" onClick={resetTemporarySetupToDefault}>
              Reset default
            </button>
            {temporarySetupStatus ? (
              <span className="runtimeTemporaryDevStatus">{temporarySetupStatus}</span>
            ) : null}
          </div>
          </div>
          </RuneliteClientShell>
        </BrowserClientWindow>
        <div className="runtimePanel">
          <div className={`runtimeLoadStatus glbStatus glbStatus-${loadState.kind}`}>{loadState.message}</div>
          <div className="runtimeControls">
            <div className="runtimeButtonRow">
              <button
                type="button"
                onClick={() => {
                  setFollowLive(false);
                  setPlaying(false);
                  setCycle((current) => (current <= 0 ? maxCycle : current - 1));
                }}
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => {
                  setFollowLive(false);
                  setPlaying((current) => !current);
                }}
              >
                {playing ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFollowLive(false);
                  setPlaying(false);
                  setCycle((current) => (current >= maxCycle ? 0 : current + 1));
                }}
              >
                Next
              </button>
              <button
                type="button"
                aria-pressed={manualControl}
                onClick={() => {
                  setFollowLive(false);
                  setPlaying(false);
                  setFollowTarget("local-player");
                  setManualControl((current) => {
                    if (!current) {
                      setManualActor(
                        collisionMap
                          ? snapManualActorToCollision(manualActorFromSnapshot(visibleSnapshot), collisionMap)
                          : manualActorFromSnapshot(visibleSnapshot)
                      );
                    }
                    return !current;
                  });
                }}
              >
                {manualControl ? "Manual on" : "Manual"}
              </button>
              {liveReplay ? (
                <button
                  type="button"
                  aria-pressed={followLive}
                  onClick={() => setFollowLive((current) => !current)}
                >
                  {followLive ? "Following live" : "Follow live"}
                </button>
              ) : null}
            </div>
            <label htmlFor="runtime-speed">Replay speed</label>
            <select
              id="runtime-speed"
              value={playIntervalMs}
              onChange={(event) => setPlayIntervalMs(Number(event.target.value))}
            >
              <option value="900">Slow</option>
              <option value="650">Normal</option>
              <option value="350">Fast</option>
            </select>
            <div className="runtimeButtonRow" aria-label="Manual local actor style">
              <button
                type="button"
                onClick={() => activateManualActor({ loadoutId: "kodai-robes", sequenceName: "idle" })}
              >
                Mage
              </button>
              <button
                type="button"
                onClick={() => activateManualActor({ loadoutId: "acb-hides", sequenceName: "idle" })}
              >
                Range
              </button>
              <button
                type="button"
                onClick={() => activateManualActor({ loadoutId: "tentacle-bandos", sequenceName: "idle" })}
              >
                Melee
              </button>
              <button
                type="button"
                onClick={() => activateManualActor({ loadoutId: "gmaul-bandos", sequenceName: "idle" })}
              >
                Gmaul
              </button>
            </div>
            <label htmlFor="runtime-camera">Camera</label>
            <select
              id="runtime-camera"
              value={cameraMode}
              onChange={(event) => setCameraMode(event.target.value as RuntimeCameraMode)}
            >
              <option value="isometric">Isometric</option>
              <option value="north">North</option>
              <option value="south">South</option>
              <option value="top">Top</option>
              <option value="free">Free</option>
            </select>
            <label htmlFor="runtime-follow">Follow</label>
            <select
              id="runtime-follow"
              value={followTarget}
              onChange={(event) => setFollowTarget(event.target.value as RuntimeFollowTarget)}
            >
              <option value="local-player">Local actor</option>
              <option value="opponent">Opponent actor</option>
              <option value="free">Free camera</option>
            </select>
            {availableReplays.length > 1 ? (
              <>
                <label htmlFor="runtime-replay">Replay source</label>
                <select
                  id="runtime-replay"
                  value={runtimeReplay?.id ?? ""}
                  onChange={(event) => {
                    const nextReplay = availableReplays.find((replay) => replay.id === event.target.value);
                    setSelectedReplayId(event.target.value);
                    setFollowLive(Boolean(liveReplay && event.target.value === liveReplay.id));
                    setPlaying(false);
                    setCycle(nextReplay?.firstCycle ?? 0);
                  }}
                >
                  {availableReplays.map((replay) => (
                    <option key={replay.id} value={replay.id}>
                      {replay.id}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <label htmlFor="runtime-cycle">
              {runtimeReplay?.id ?? "demo timeline"} cycle {visibleSnapshot.cycle}
            </label>
            <input
              id="runtime-cycle"
              type="range"
              min="0"
              max={maxCycle}
              step="1"
              value={cycle}
              onChange={(event) => {
                setFollowLive(false);
                setPlaying(false);
                setCycle(Number(event.target.value));
              }}
            />
          </div>
          <p>{visibleSnapshot.note}</p>
          <div className="runtimePoseList">
            {visibleActiveEvents.map((event) => (
              <code key={event.id}>{event.label}</code>
            ))}
          </div>
          <div className="runtimePoseList">
            {visibleSnapshot.actors.map((pose) => (
              <code
                className="runtimeActorPose"
                data-actor-id={pose.actorId}
                data-loadout-id={pose.loadoutId}
                data-appearance-source={pose.appearance?.source ?? "loadout"}
                data-appearance-item-ids={pose.appearance?.itemIds.join(",") ?? ""}
                data-appearance-equipment-slots={pose.appearance?.equipmentSlots?.join(",") ?? ""}
                data-sequence-name={pose.sequenceName}
                data-sequence-mode={pose.sequenceMode ?? ""}
                data-action-sequence-key={pose.actionSequenceKey ?? ""}
                data-animation-cycle={pose.animationCycle ?? ""}
                data-primary-frame={pose.primaryFrame ?? ""}
                data-primary-frame-cycle={pose.primaryFrameCycle ?? ""}
                key={pose.actorId}
              >
                {formatPose(pose)}
              </code>
            ))}
          </div>
          <div className="runtimeGateList">
            {runtimeSceneGates.map((gate) => (
              <article key={gate.id}>
                <h3>{gate.label}</h3>
                <p>{gate.reason}</p>
              </article>
            ))}
            {todoGates.map((gate) => (
              <article key={gate.id}>
                <h3>{gate.label}</h3>
                <p>{gate.blocks[0]}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
