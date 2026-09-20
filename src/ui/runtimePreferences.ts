// Saved client preferences. Keep storage keys and legacy migrations stable.
import {
  type NhClientDisplayMode,
  type NhSpellbookId
} from "../render/nhFixedLayout";
import {
  runtimeLoadouts,
  type RuntimeInventorySlot,
  type RuntimeHudState,
  type RuntimeLoadoutId
} from "../render/runtimeScene";
import {
  RUNELITE_FIXED_CLIENT_HEIGHT,
  RUNELITE_FIXED_CLIENT_WIDTH,
  RUNELITE_PLUGIN_TOOLBAR_WIDTH,
  RUNELITE_PLUGIN_WRAPPED_WIDTH,
  type RunelitePvpFightHistoryEntrySnapshot
} from "./RuneliteClientShell";
import {
  RUNTIME_NH_STAKE_ALLOWED_SETUP_ITEM_IDS,
  RUNTIME_TRAINER_SETUP_PRESETS,
  type RuntimeTrainerSetupId,
  type RuntimeTrainerSetupPreset
} from "./runtimeSetupPresets";
export interface TemporarySavedSetupSnapshot {
  readonly version: 1;
  readonly setupId?: RuntimeTrainerSetupId;
  readonly savedAt: number;
  readonly loadoutId: RuntimeLoadoutId;
  readonly inventory: readonly (RuntimeInventorySlot | null)[];
  readonly equipment: readonly (readonly [number, number])[];
}
export const NH_TRAINER_ATTACK_SET_STORAGE_KEY = "nhTrainer.attackSet.v1";
export const NH_AUTO_RETALIATE_STORAGE_KEY = "nhTrainer.autoRetaliate.v1";
export const LEGACY_AUTO_RETALIATE_STORAGE_KEYS = ["source.autoRetaliate.v1"] as const;
export const NH_SOUND_EFFECT_VOLUME_STORAGE_KEY = "nhTrainer.soundEffectVolume.var169.v1";
export const NH_AREA_SOUND_EFFECT_VOLUME_STORAGE_KEY = "nhTrainer.areaSoundEffectVolume.var872.v1";
export const NH_TEST_MUTED_STORAGE_KEY = "nhTrainer.testMuted.v1";
export const NH_TEMPORARY_SAVED_SETUP_STORAGE_KEY = "nhTrainer.temporaryNhStakeSetup.v1";
export const NH_TRAINER_PVP_FIGHT_HISTORY_STORAGE_KEY = "nhTrainer.pvpFightHistory.v1";
export const NH_TRAINER_BROWSER_CLIENT_WINDOW_STORAGE_KEY = "nhTrainer.browserClientWindow.v2";
export const NH_TRAINER_CLIENT_DISPLAY_MODE_STORAGE_KEY = "nhTrainer.clientDisplayMode.v1";
export const NH_TRAINER_PRAYER_REORDER_ENABLED_STORAGE_KEY = "nhTrainer.prayerReorder.enabled.v1";
export const NH_TRAINER_PRAYER_REORDER_ORDER_STORAGE_KEY = "nhTrainer.prayerReorder.order.v1";
export const NH_TRAINER_SPELLBOOK_REORDER_ENABLED_STORAGE_KEY = "nhTrainer.spellbookReorder.enabled.v1";
export const NH_TRAINER_SPELLBOOK_REORDER_ORDERS_STORAGE_KEY = "nhTrainer.spellbookReorder.orders.v1";
export const NH_TRAINER_PVP_FIGHT_HISTORY_LIMIT = 50;
export const BROWSER_CLIENT_WINDOW_TITLEBAR_HEIGHT = 24;
export const BROWSER_CLIENT_WINDOW_MIN_WIDTH = 420;
export const BROWSER_CLIENT_WINDOW_MIN_HEIGHT = 300;

export function isRuntimeInventorySlot(value: unknown): value is RuntimeInventorySlot | null {
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

export function isRuntimeInventory(value: unknown): value is readonly (RuntimeInventorySlot | null)[] {
  return Array.isArray(value) && value.every(isRuntimeInventorySlot);
}

export function isRuntimeLoadoutId(value: unknown): value is RuntimeLoadoutId {
  return typeof value === "string" && runtimeLoadouts.some((loadout) => loadout.id === value);
}

export function isTemporarySavedSetupSnapshot(value: unknown): value is TemporarySavedSetupSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const snapshot = value as Partial<TemporarySavedSetupSnapshot>;
  return (
    snapshot.version === 1 &&
    (snapshot.setupId === undefined || Object.prototype.hasOwnProperty.call(RUNTIME_TRAINER_SETUP_PRESETS, snapshot.setupId)) &&
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

export function readStoredAttackSetIndex(): number | null {
  try {
    const raw = window.localStorage.getItem(NH_TRAINER_ATTACK_SET_STORAGE_KEY);
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 3 ? parsed : null;
  } catch {
    // Source: Config.ATTACK_SET is persistent account state; localStorage is the trainer's local-user backing store.
  }
  return null;
}

export function writeStoredAttackSetIndex(attackSetIndex: number): void {
  try {
    window.localStorage.setItem(NH_TRAINER_ATTACK_SET_STORAGE_KEY, String(Math.max(0, Math.min(3, Math.trunc(attackSetIndex)))));
  } catch {
    // Non-fatal in restricted browser contexts.
  }
}

export function readStoredAutoRetaliate(): boolean | null {
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

export function writeStoredAutoRetaliate(enabled: boolean): void {
  try {
    window.localStorage.setItem(NH_AUTO_RETALIATE_STORAGE_KEY, String(enabled));
  } catch {
    // Non-fatal in restricted browser contexts.
  }
}

export function normalizeStoredOptionsSoundVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return 4;
  }
  return Math.round(Math.max(0, Math.min(4, value)) * 100) / 100;
}

export function readStoredOptionsSoundVolume(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 4 ? normalizeStoredOptionsSoundVolume(parsed) : null;
  } catch {
    // Non-fatal in restricted browser contexts.
  }
  return null;
}

export function writeStoredOptionsSoundVolume(key: string, volume: number): void {
  try {
    window.localStorage.setItem(key, String(normalizeStoredOptionsSoundVolume(volume)));
  } catch {
    // Non-fatal in restricted browser contexts.
  }
}

export function readStoredClientDisplayMode(): NhClientDisplayMode {
  try {
    const raw = window.localStorage.getItem(NH_TRAINER_CLIENT_DISPLAY_MODE_STORAGE_KEY);
    return raw === "resizable" ? "resizable" : "fixed";
  } catch {
    return "fixed";
  }
}

export function writeStoredClientDisplayMode(displayMode: NhClientDisplayMode): void {
  try {
    window.localStorage.setItem(NH_TRAINER_CLIENT_DISPLAY_MODE_STORAGE_KEY, displayMode);
  } catch {
    // Non-fatal in restricted browser contexts.
  }
}

export function readStoredLocalProfileValue(primaryKey: string, legacyKeys: readonly string[] = []): string | null {
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

export function readStoredBoolean(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function writeStoredBoolean(key: string, enabled: boolean): void {
  try {
    window.localStorage.setItem(key, String(enabled));
  } catch {
    // Non-fatal in restricted browser contexts.
  }
}

export function readStoredStringArray(key: string): readonly string[] {
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

export function writeStoredStringArray(key: string, values: readonly string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Non-fatal in restricted browser contexts.
  }
}

export function readStoredSpellbookOrders(): Partial<Record<NhSpellbookId, readonly string[]>> {
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

export function writeStoredSpellbookOrders(orders: Partial<Record<NhSpellbookId, readonly string[]>>): void {
  try {
    window.localStorage.setItem(NH_TRAINER_SPELLBOOK_REORDER_ORDERS_STORAGE_KEY, JSON.stringify(orders));
  } catch {
    // Non-fatal in restricted browser contexts.
  }
}

export function initialHudOverrideFromStorage(): Partial<RuntimeHudState> | null {
  const attackSet = typeof window === "undefined" ? null : readStoredAttackSetIndex();
  const autoRetaliate = typeof window === "undefined" ? null : readStoredAutoRetaliate();
  const soundEffectVolume =
    typeof window === "undefined" ? null : readStoredOptionsSoundVolume(NH_SOUND_EFFECT_VOLUME_STORAGE_KEY);
  const areaSoundEffectVolume =
    typeof window === "undefined" ? null : readStoredOptionsSoundVolume(NH_AREA_SOUND_EFFECT_VOLUME_STORAGE_KEY);
  if (
    attackSet === null &&
    autoRetaliate === null &&
    soundEffectVolume === null &&
    areaSoundEffectVolume === null
  ) {
    return null;
  }
  return {
    ...(attackSet === null ? {} : { attackSet }),
    ...(autoRetaliate === null ? {} : { autoRetaliate }),
    ...(soundEffectVolume === null ? {} : { soundEffectVolume }),
    ...(areaSoundEffectVolume === null ? {} : { areaSoundEffectVolume })
  };
}

export function temporarySavedSetupStorageKey(setupId: RuntimeTrainerSetupId): string {
  return `${NH_TEMPORARY_SAVED_SETUP_STORAGE_KEY}.${setupId}`;
}

export function temporarySavedSetupId(snapshot: TemporarySavedSetupSnapshot): RuntimeTrainerSetupId | null {
  if (snapshot.setupId) {
    return snapshot.setupId;
  }
  // Older saves shared one key without a fight type. Only reuse them when their
  // items identify a single preset, so a saved risk kit cannot become an NH/DMM kit.
  const savedItems = new Set([
    ...snapshot.inventory.flatMap((slot) => slot ? [slot.itemId] : []),
    ...snapshot.equipment.map(([, itemId]) => itemId)
  ]);
  const presets = Object.values(RUNTIME_TRAINER_SETUP_PRESETS);
  const presetItems = (setup: RuntimeTrainerSetupPreset): number[] => [
    ...setup.inventorySlots.flatMap((slot) => slot ? [slot.itemId] : []),
    ...setup.equipmentEntries.map(([, itemId]) => itemId)
  ];
  const matches = presets.filter((setup) => {
    const otherItems = new Set(presets.filter((other) => other.id !== setup.id).flatMap(presetItems));
    return presetItems(setup).some((itemId) => savedItems.has(itemId) && !otherItems.has(itemId));
  });
  return matches.length === 1 ? matches[0].id : null;
}

export function readTemporarySavedSetupSnapshot(setupId: RuntimeTrainerSetupId): TemporarySavedSetupSnapshot | null {
  try {
    for (const key of [temporarySavedSetupStorageKey(setupId), NH_TEMPORARY_SAVED_SETUP_STORAGE_KEY]) {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      const parsed = JSON.parse(raw);
      if (isTemporarySavedSetupSnapshot(parsed) && temporarySavedSetupId(parsed) === setupId) {
        return { ...parsed, setupId };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function writeTemporarySavedSetupSnapshot(snapshot: TemporarySavedSetupSnapshot): boolean {
  const setupId = temporarySavedSetupId(snapshot);
  if (!setupId || !isTemporarySavedSetupSnapshot(snapshot)) {
    return false;
  }
  try {
    window.localStorage.setItem(temporarySavedSetupStorageKey(setupId), JSON.stringify({ ...snapshot, setupId }));
    return true;
  } catch {
    return false;
  }
}

export function clearTemporarySavedSetupSnapshot(setupId: RuntimeTrainerSetupId): boolean {
  try {
    window.localStorage.removeItem(temporarySavedSetupStorageKey(setupId));
    const legacyRaw = window.localStorage.getItem(NH_TEMPORARY_SAVED_SETUP_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (isTemporarySavedSetupSnapshot(legacy) && temporarySavedSetupId(legacy) === setupId) {
        window.localStorage.removeItem(NH_TEMPORARY_SAVED_SETUP_STORAGE_KEY);
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function readStoredRunelitePvpFightHistory(): readonly RunelitePvpFightHistoryEntrySnapshot[] {
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

export function writeStoredRunelitePvpFightHistory(entries: readonly RunelitePvpFightHistoryEntrySnapshot[]): void {
  try {
    window.localStorage.setItem(
      NH_TRAINER_PVP_FIGHT_HISTORY_STORAGE_KEY,
      JSON.stringify(entries.slice(0, NH_TRAINER_PVP_FIGHT_HISTORY_LIMIT))
    );
  } catch {
    // Browser storage can be disabled; the live tracker still works for the current session.
  }
}

export function isRunelitePvpFightHistoryEntrySnapshot(value: unknown): value is RunelitePvpFightHistoryEntrySnapshot {
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

export interface BrowserClientWindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function readBrowserClientWindowBounds(): BrowserClientWindowBounds {
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

export function writeBrowserClientWindowBounds(bounds: BrowserClientWindowBounds): void {
  try {
    window.localStorage.setItem(NH_TRAINER_BROWSER_CLIENT_WINDOW_STORAGE_KEY, JSON.stringify(bounds));
  } catch {
    // Non-fatal in restricted browser contexts.
  }
}

export function isBrowserClientWindowBounds(value: unknown): value is BrowserClientWindowBounds {
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

export function defaultBrowserClientWindowBounds(): BrowserClientWindowBounds {
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

export function clampBrowserClientWindowBounds(bounds: BrowserClientWindowBounds): BrowserClientWindowBounds {
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

/**
 * Fixed-mode snap: when RuneLite Stretched Mode is off, the client stays at exactly 765x503 (1:1).
 * Resizing the window snaps it to the client size plus exactly the sidebar width on the right, so
 * there is no black padding around the fixed client.
 */
export function browserClientWindowFixedSnapSize(
  element: HTMLElement | null
): { readonly width: number; readonly height: number } | null {
  const shell = element?.querySelector<HTMLElement>(".runeliteClientShell");
  if (!shell || shell.dataset.runeliteStretchedEnabled !== "false") {
    return null;
  }
  const sidebarOpen = shell.dataset.sidebarOpen === "true";
  const panelOpen = shell.dataset.pluginPanelOpen === "true";
  const sidebarWidth = sidebarOpen
    ? RUNELITE_PLUGIN_TOOLBAR_WIDTH + (panelOpen ? RUNELITE_PLUGIN_WRAPPED_WIDTH : 0)
    : 0;
  return {
    width: RUNELITE_FIXED_CLIENT_WIDTH + sidebarWidth,
    height: RUNELITE_FIXED_CLIENT_HEIGHT + BROWSER_CLIENT_WINDOW_TITLEBAR_HEIGHT
  };
}

export function clampBrowserClientWindowBoundsWithFixedSnap(
  bounds: BrowserClientWindowBounds,
  element: HTMLElement | null
): BrowserClientWindowBounds {
  const snap = browserClientWindowFixedSnapSize(element);
  return clampBrowserClientWindowBounds(snap ? { ...bounds, width: snap.width, height: snap.height } : bounds);
}
