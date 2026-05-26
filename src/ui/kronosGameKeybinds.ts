import type { KronosFixedSideTabId } from "../render/kronosFixedLayout";
import type { RuneliteKeyRemappingFunctionKey } from "./runeliteKeyRemapping";

export type KronosGameKeybindKeySlot = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface KronosGameKeybindTabSpec {
  readonly tabId: KronosFixedSideTabId;
  readonly label: string;
  readonly varbit: number;
  readonly serverVarbit?: number;
  readonly keyTextChildId: number;
  readonly selectorChildId: number;
  readonly defaultKeySlot: KronosGameKeybindKeySlot;
}

export interface KronosGameKeybindSnapshot {
  readonly keySlotsByTabId: Readonly<Record<KronosFixedSideTabId, KronosGameKeybindKeySlot>>;
  readonly escapeCloses: boolean;
}

export const KRONOS_GAME_KEYBIND_INTERFACE_ID = 121;
export const KRONOS_GAME_KEYBIND_STORAGE_KEY = "nhTrainer.gameKeybinds.v1";
const LEGACY_GAME_KEYBIND_STORAGE_KEYS = ["source.gameKeybinds.v1"] as const;
export const KRONOS_GAME_KEYBIND_SOURCE =
  "Config.KEYBINDS varbits 4675-4689, TabOptions.Keybinding interface 121, keybind_get_slot enum_1160, script984 text refresh";

export const KRONOS_GAME_KEYBIND_KEY_OPTIONS: readonly {
  readonly slot: KronosGameKeybindKeySlot;
  readonly label: string;
  readonly functionKey: RuneliteKeyRemappingFunctionKey | null;
  readonly sourceEnum1159: string;
  readonly sourceEnum1160Key: string;
}[] = [
  { slot: 0, label: "None", functionKey: null, sourceEnum1159: "None", sourceEnum1160Key: "0" },
  { slot: 1, label: "F1", functionKey: "F1", sourceEnum1159: "F1", sourceEnum1160Key: "^key_f1" },
  { slot: 2, label: "F2", functionKey: "F2", sourceEnum1159: "F2", sourceEnum1160Key: "^key_f2" },
  { slot: 3, label: "F3", functionKey: "F3", sourceEnum1159: "F3", sourceEnum1160Key: "^key_f3" },
  { slot: 4, label: "F4", functionKey: "F4", sourceEnum1159: "F4", sourceEnum1160Key: "^key_f4" },
  { slot: 5, label: "F5", functionKey: "F5", sourceEnum1159: "F5", sourceEnum1160Key: "^key_f5" },
  { slot: 6, label: "F6", functionKey: "F6", sourceEnum1159: "F6", sourceEnum1160Key: "^key_f6" },
  { slot: 7, label: "F7", functionKey: "F7", sourceEnum1159: "F7", sourceEnum1160Key: "^key_f7" },
  { slot: 8, label: "F8", functionKey: "F8", sourceEnum1159: "F8", sourceEnum1160Key: "^key_f8" },
  { slot: 9, label: "F9", functionKey: "F9", sourceEnum1159: "F9", sourceEnum1160Key: "^key_f9" },
  { slot: 10, label: "F10", functionKey: "F10", sourceEnum1159: "F10", sourceEnum1160Key: "^key_f10" },
  { slot: 11, label: "F11", functionKey: "F11", sourceEnum1159: "F11", sourceEnum1160Key: "^key_f11" },
  { slot: 12, label: "F12", functionKey: "F12", sourceEnum1159: "F12", sourceEnum1160Key: "^key_f12" },
  { slot: 13, label: "Esc", functionKey: "Escape", sourceEnum1159: "Esc", sourceEnum1160Key: "^key_escape" }
];

export const KRONOS_GAME_KEYBIND_TAB_SPECS: readonly KronosGameKeybindTabSpec[] = [
  { tabId: "combat", label: "Combat Options", varbit: 4675, keyTextChildId: 8, selectorChildId: 9, defaultKeySlot: 1 },
  { tabId: "stats", label: "Stats", varbit: 4676, keyTextChildId: 15, selectorChildId: 16, defaultKeySlot: 2 },
  { tabId: "quests", label: "Quest List", varbit: 4677, keyTextChildId: 22, selectorChildId: 23, defaultKeySlot: 3 },
  { tabId: "inventory", label: "Inventory", varbit: 4678, keyTextChildId: 29, selectorChildId: 30, defaultKeySlot: 13 },
  { tabId: "equipment", label: "Worn Equipment", varbit: 4679, keyTextChildId: 36, selectorChildId: 37, defaultKeySlot: 4 },
  { tabId: "prayer", label: "Prayer", varbit: 4680, keyTextChildId: 43, selectorChildId: 44, defaultKeySlot: 5 },
  { tabId: "magic", label: "Magic", varbit: 4682, keyTextChildId: 50, selectorChildId: 51, defaultKeySlot: 6 },
  { tabId: "friends", label: "Friends List", varbit: 4684, keyTextChildId: 57, selectorChildId: 58, defaultKeySlot: 8 },
  { tabId: "ignores", label: "Ignore List", varbit: 4685, keyTextChildId: 64, selectorChildId: 65, defaultKeySlot: 9 },
  { tabId: "logout", label: "Logout", varbit: 4689, keyTextChildId: 71, selectorChildId: 72, defaultKeySlot: 0 },
  { tabId: "options", label: "Options", varbit: 4686, keyTextChildId: 78, selectorChildId: 79, defaultKeySlot: 10 },
  { tabId: "emotes", label: "Emotes", varbit: 4687, keyTextChildId: 85, selectorChildId: 86, defaultKeySlot: 11 },
  { tabId: "clan-chat", label: "Clan Chat", varbit: 4683, keyTextChildId: 92, selectorChildId: 93, defaultKeySlot: 7 },
  { tabId: "music", label: "Music Player", varbit: 4688, keyTextChildId: 99, selectorChildId: 100, defaultKeySlot: 12 }
];

export const KRONOS_DEFAULT_GAME_KEYBINDS: KronosGameKeybindSnapshot = {
  keySlotsByTabId: Object.freeze(
    Object.fromEntries(KRONOS_GAME_KEYBIND_TAB_SPECS.map((spec) => [spec.tabId, spec.defaultKeySlot]))
  ) as Readonly<Record<KronosFixedSideTabId, KronosGameKeybindKeySlot>>,
  escapeCloses: false
};

export function kronosGameKeybindLabelForSlot(slot: KronosGameKeybindKeySlot): string {
  return KRONOS_GAME_KEYBIND_KEY_OPTIONS.find((option) => option.slot === slot)?.label ?? "None";
}

export function kronosGameKeybindSourceKeyForSlot(slot: KronosGameKeybindKeySlot): string {
  return KRONOS_GAME_KEYBIND_KEY_OPTIONS.find((option) => option.slot === slot)?.sourceEnum1160Key ?? "0";
}

export function kronosGameKeybindSideTabForFunctionKey(
  snapshot: KronosGameKeybindSnapshot,
  functionKey: RuneliteKeyRemappingFunctionKey
): KronosFixedSideTabId | null {
  const keySlot = kronosGameKeybindSlotForFunctionKey(functionKey);
  if (keySlot === null) {
    return null;
  }
  if (functionKey === "Escape" && snapshot.escapeCloses) {
    return null;
  }
  const entry = Object.entries(snapshot.keySlotsByTabId).find(([, value]) => value === keySlot);
  return (entry?.[0] as KronosFixedSideTabId | undefined) ?? null;
}

export function kronosAssignGameKeybind(
  snapshot: KronosGameKeybindSnapshot,
  tabId: KronosFixedSideTabId,
  keySlot: KronosGameKeybindKeySlot
): KronosGameKeybindSnapshot {
  const normalizedKeySlot = kronosNormalizeGameKeybindKeySlot(keySlot, 0);
  const nextEntries = Object.entries(snapshot.keySlotsByTabId).map(([entryTabId, entrySlot]) => [
    entryTabId,
    normalizedKeySlot !== 0 && entrySlot === normalizedKeySlot ? 0 : entrySlot
  ]);
  const nextKeySlotsByTabId = {
    ...(Object.fromEntries(nextEntries) as Record<KronosFixedSideTabId, KronosGameKeybindKeySlot>),
    [tabId]: normalizedKeySlot
  };
  return {
    keySlotsByTabId: nextKeySlotsByTabId,
    escapeCloses: snapshot.escapeCloses
  };
}

export function kronosGameKeybindsWithEscapeClose(
  snapshot: KronosGameKeybindSnapshot,
  escapeCloses: boolean
): KronosGameKeybindSnapshot {
  return {
    keySlotsByTabId: snapshot.keySlotsByTabId,
    escapeCloses
  };
}

export function kronosPreEocGameKeybinds(): KronosGameKeybindSnapshot {
  const keySlotsByTabId = Object.fromEntries(
    KRONOS_GAME_KEYBIND_TAB_SPECS.map((spec, index) => {
      if (index === 0) {
        return [spec.tabId, 5];
      }
      if (index >= 3 && index <= 6) {
        return [spec.tabId, index - 2];
      }
      return [spec.tabId, 0];
    })
  ) as Record<KronosFixedSideTabId, KronosGameKeybindKeySlot>;
  return {
    keySlotsByTabId,
    escapeCloses: false
  };
}

export function kronosNormalizeGameKeybindSnapshot(value: unknown): KronosGameKeybindSnapshot {
  if (!value || typeof value !== "object") {
    return KRONOS_DEFAULT_GAME_KEYBINDS;
  }
  const source = value as Partial<KronosGameKeybindSnapshot>;
  const inputSlots =
    source.keySlotsByTabId && typeof source.keySlotsByTabId === "object" ? source.keySlotsByTabId : {};
  const keySlotsByTabId = Object.fromEntries(
    KRONOS_GAME_KEYBIND_TAB_SPECS.map((spec) => [
      spec.tabId,
      kronosNormalizeGameKeybindKeySlot(
        (inputSlots as Partial<Record<KronosFixedSideTabId, unknown>>)[spec.tabId],
        spec.defaultKeySlot
      )
    ])
  ) as Record<KronosFixedSideTabId, KronosGameKeybindKeySlot>;
  return {
    keySlotsByTabId,
    escapeCloses: source.escapeCloses === true
  };
}

export function kronosReadGameKeybindsFromStorage(): KronosGameKeybindSnapshot {
  if (typeof window === "undefined") {
    return KRONOS_DEFAULT_GAME_KEYBINDS;
  }
  const raw = kronosReadLocalProfileValue(KRONOS_GAME_KEYBIND_STORAGE_KEY, LEGACY_GAME_KEYBIND_STORAGE_KEYS);
  if (!raw) {
    return KRONOS_DEFAULT_GAME_KEYBINDS;
  }
  try {
    return kronosNormalizeGameKeybindSnapshot(JSON.parse(raw));
  } catch {
    return KRONOS_DEFAULT_GAME_KEYBINDS;
  }
}

export function kronosWriteGameKeybindsToStorage(snapshot: KronosGameKeybindSnapshot): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(KRONOS_GAME_KEYBIND_STORAGE_KEY, JSON.stringify(kronosNormalizeGameKeybindSnapshot(snapshot)));
}

function kronosReadLocalProfileValue(primaryKey: string, legacyKeys: readonly string[] = []): string | null {
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

function kronosGameKeybindSlotForFunctionKey(
  functionKey: RuneliteKeyRemappingFunctionKey
): KronosGameKeybindKeySlot | null {
  return KRONOS_GAME_KEYBIND_KEY_OPTIONS.find((option) => option.functionKey === functionKey)?.slot ?? null;
}

function kronosNormalizeGameKeybindKeySlot(
  value: unknown,
  fallback: KronosGameKeybindKeySlot
): KronosGameKeybindKeySlot {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const normalized = Math.trunc(numeric);
  return normalized >= 0 && normalized <= 13 ? (normalized as KronosGameKeybindKeySlot) : fallback;
}
