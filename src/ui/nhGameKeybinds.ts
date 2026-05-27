import type { NhFixedSideTabId } from "../render/nhFixedLayout";
import type { RuneliteKeyRemappingFunctionKey } from "./runeliteKeyRemapping";

export type NhGameKeybindKeySlot = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface NhGameKeybindTabSpec {
  readonly tabId: NhFixedSideTabId;
  readonly label: string;
  readonly varbit: number;
  readonly serverVarbit?: number;
  readonly keyTextChildId: number;
  readonly selectorChildId: number;
  readonly defaultKeySlot: NhGameKeybindKeySlot;
}

export interface NhGameKeybindSnapshot {
  readonly keySlotsByTabId: Readonly<Record<NhFixedSideTabId, NhGameKeybindKeySlot>>;
  readonly escapeCloses: boolean;
}

export const NH_GAME_KEYBIND_INTERFACE_ID = 121;
export const NH_GAME_KEYBIND_STORAGE_KEY = "nhTrainer.gameKeybinds.v1";
const LEGACY_GAME_KEYBIND_STORAGE_KEYS = ["source.gameKeybinds.v1"] as const;
export const NH_GAME_KEYBIND_SOURCE =
  "Config.KEYBINDS varbits 4675-4689, TabOptions.Keybinding interface 121, keybind_get_slot enum_1160, script984 text refresh";

export const NH_GAME_KEYBIND_KEY_OPTIONS: readonly {
  readonly slot: NhGameKeybindKeySlot;
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

export const NH_GAME_KEYBIND_TAB_SPECS: readonly NhGameKeybindTabSpec[] = [
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

export const NH_DEFAULT_GAME_KEYBINDS: NhGameKeybindSnapshot = {
  keySlotsByTabId: Object.freeze(
    Object.fromEntries(NH_GAME_KEYBIND_TAB_SPECS.map((spec) => [spec.tabId, spec.defaultKeySlot]))
  ) as Readonly<Record<NhFixedSideTabId, NhGameKeybindKeySlot>>,
  escapeCloses: false
};

export function nhGameKeybindLabelForSlot(slot: NhGameKeybindKeySlot): string {
  return NH_GAME_KEYBIND_KEY_OPTIONS.find((option) => option.slot === slot)?.label ?? "None";
}

export function nhGameKeybindSourceKeyForSlot(slot: NhGameKeybindKeySlot): string {
  return NH_GAME_KEYBIND_KEY_OPTIONS.find((option) => option.slot === slot)?.sourceEnum1160Key ?? "0";
}

export function nhGameKeybindSideTabForFunctionKey(
  snapshot: NhGameKeybindSnapshot,
  functionKey: RuneliteKeyRemappingFunctionKey
): NhFixedSideTabId | null {
  const keySlot = nhGameKeybindSlotForFunctionKey(functionKey);
  if (keySlot === null) {
    return null;
  }
  if (functionKey === "Escape" && snapshot.escapeCloses) {
    return null;
  }
  const entry = Object.entries(snapshot.keySlotsByTabId).find(([, value]) => value === keySlot);
  return (entry?.[0] as NhFixedSideTabId | undefined) ?? null;
}

export function nhAssignGameKeybind(
  snapshot: NhGameKeybindSnapshot,
  tabId: NhFixedSideTabId,
  keySlot: NhGameKeybindKeySlot
): NhGameKeybindSnapshot {
  const normalizedKeySlot = nhNormalizeGameKeybindKeySlot(keySlot, 0);
  const nextEntries = Object.entries(snapshot.keySlotsByTabId).map(([entryTabId, entrySlot]) => [
    entryTabId,
    normalizedKeySlot !== 0 && entrySlot === normalizedKeySlot ? 0 : entrySlot
  ]);
  const nextKeySlotsByTabId = {
    ...(Object.fromEntries(nextEntries) as Record<NhFixedSideTabId, NhGameKeybindKeySlot>),
    [tabId]: normalizedKeySlot
  };
  return {
    keySlotsByTabId: nextKeySlotsByTabId,
    escapeCloses: snapshot.escapeCloses
  };
}

export function nhGameKeybindsWithEscapeClose(
  snapshot: NhGameKeybindSnapshot,
  escapeCloses: boolean
): NhGameKeybindSnapshot {
  return {
    keySlotsByTabId: snapshot.keySlotsByTabId,
    escapeCloses
  };
}

export function nhPreEocGameKeybinds(): NhGameKeybindSnapshot {
  const keySlotsByTabId = Object.fromEntries(
    NH_GAME_KEYBIND_TAB_SPECS.map((spec, index) => {
      if (index === 0) {
        return [spec.tabId, 5];
      }
      if (index >= 3 && index <= 6) {
        return [spec.tabId, index - 2];
      }
      return [spec.tabId, 0];
    })
  ) as Record<NhFixedSideTabId, NhGameKeybindKeySlot>;
  return {
    keySlotsByTabId,
    escapeCloses: false
  };
}

export function nhNormalizeGameKeybindSnapshot(value: unknown): NhGameKeybindSnapshot {
  if (!value || typeof value !== "object") {
    return NH_DEFAULT_GAME_KEYBINDS;
  }
  const source = value as Partial<NhGameKeybindSnapshot>;
  const inputSlots =
    source.keySlotsByTabId && typeof source.keySlotsByTabId === "object" ? source.keySlotsByTabId : {};
  const keySlotsByTabId = Object.fromEntries(
    NH_GAME_KEYBIND_TAB_SPECS.map((spec) => [
      spec.tabId,
      nhNormalizeGameKeybindKeySlot(
        (inputSlots as Partial<Record<NhFixedSideTabId, unknown>>)[spec.tabId],
        spec.defaultKeySlot
      )
    ])
  ) as Record<NhFixedSideTabId, NhGameKeybindKeySlot>;
  return {
    keySlotsByTabId,
    escapeCloses: source.escapeCloses === true
  };
}

export function nhReadGameKeybindsFromStorage(): NhGameKeybindSnapshot {
  if (typeof window === "undefined") {
    return NH_DEFAULT_GAME_KEYBINDS;
  }
  const raw = nhReadLocalProfileValue(NH_GAME_KEYBIND_STORAGE_KEY, LEGACY_GAME_KEYBIND_STORAGE_KEYS);
  if (!raw) {
    return NH_DEFAULT_GAME_KEYBINDS;
  }
  try {
    return nhNormalizeGameKeybindSnapshot(JSON.parse(raw));
  } catch {
    return NH_DEFAULT_GAME_KEYBINDS;
  }
}

export function nhWriteGameKeybindsToStorage(snapshot: NhGameKeybindSnapshot): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(NH_GAME_KEYBIND_STORAGE_KEY, JSON.stringify(nhNormalizeGameKeybindSnapshot(snapshot)));
}

function nhReadLocalProfileValue(primaryKey: string, legacyKeys: readonly string[] = []): string | null {
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

function nhGameKeybindSlotForFunctionKey(
  functionKey: RuneliteKeyRemappingFunctionKey
): NhGameKeybindKeySlot | null {
  return NH_GAME_KEYBIND_KEY_OPTIONS.find((option) => option.functionKey === functionKey)?.slot ?? null;
}

function nhNormalizeGameKeybindKeySlot(
  value: unknown,
  fallback: NhGameKeybindKeySlot
): NhGameKeybindKeySlot {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const normalized = Math.trunc(numeric);
  return normalized >= 0 && normalized <= 13 ? (normalized as NhGameKeybindKeySlot) : fallback;
}
