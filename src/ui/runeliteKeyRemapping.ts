export const RUNELITE_KEY_REMAPPING_PLUGIN_ID = "key-remapping";
export const RUNELITE_KEY_REMAPPING_CONFIG_GROUP = "keyremapping";

export type RuneliteKeyRemappingCameraDirection = "up" | "down" | "left" | "right";
export type RuneliteKeyRemappingFunctionKey =
  | "F1"
  | "F2"
  | "F3"
  | "F4"
  | "F5"
  | "F6"
  | "F7"
  | "F8"
  | "F9"
  | "F10"
  | "F11"
  | "F12"
  | "Escape";
export type RuneliteKeyRemappingFunctionTabKey = Exclude<RuneliteKeyRemappingFunctionKey, "Escape">;

export const RUNELITE_KEY_REMAPPING_FUNCTION_TAB_KEYS: readonly RuneliteKeyRemappingFunctionTabKey[] = [
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12"
];

export interface RuneliteKeyRemappingKeybindSnapshot {
  readonly key: string;
  readonly code: string;
  readonly sourceKeyEvent: string;
  readonly keyCode: number;
  readonly modifiers: number;
}

export interface RuneliteKeyRemappingConfigSnapshot {
  readonly enabled: boolean;
  readonly hideDisplayName: boolean;
  readonly cameraRemap: boolean;
  readonly up: RuneliteKeyRemappingKeybindSnapshot;
  readonly down: RuneliteKeyRemappingKeybindSnapshot;
  readonly left: RuneliteKeyRemappingKeybindSnapshot;
  readonly right: RuneliteKeyRemappingKeybindSnapshot;
  readonly fkeyRemap: boolean;
  readonly f1: RuneliteKeyRemappingKeybindSnapshot;
  readonly f2: RuneliteKeyRemappingKeybindSnapshot;
  readonly f3: RuneliteKeyRemappingKeybindSnapshot;
  readonly f4: RuneliteKeyRemappingKeybindSnapshot;
  readonly f5: RuneliteKeyRemappingKeybindSnapshot;
  readonly f6: RuneliteKeyRemappingKeybindSnapshot;
  readonly f7: RuneliteKeyRemappingKeybindSnapshot;
  readonly f8: RuneliteKeyRemappingKeybindSnapshot;
  readonly f9: RuneliteKeyRemappingKeybindSnapshot;
  readonly f10: RuneliteKeyRemappingKeybindSnapshot;
  readonly f11: RuneliteKeyRemappingKeybindSnapshot;
  readonly f12: RuneliteKeyRemappingKeybindSnapshot;
  readonly esc: RuneliteKeyRemappingKeybindSnapshot;
}

const sourceListener =
  "KeyRemappingListener.keyPressed/keyReleased ModifierlessKeybind.matches(e, true) remaps camera/F keys before KeyHandler.copy$keyPressed; Integer m = modified.get(e.getKeyCode()) releases remapped keys after typing changes";

const awtKeyUndefined = 0;
const awtShiftDownMask = 64;
const awtCtrlDownMask = 128;
const awtMetaDownMask = 256;
const awtAltDownMask = 512;
const awtKeyboardModifierMask = awtShiftDownMask | awtCtrlDownMask | awtMetaDownMask | awtAltDownMask;
const awtModifierMaskByKeyCode = new Map<number, number>([
  [16, awtShiftDownMask],
  [17, awtCtrlDownMask],
  [18, awtAltDownMask],
  [157, awtMetaDownMask]
]);

interface RuneliteKeyRemappingKeyboardEventLike {
  readonly altKey?: boolean;
  readonly code?: string;
  readonly ctrlKey?: boolean;
  readonly key?: string;
  readonly keyCode?: number;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly which?: number;
}

function keybind(
  key: string,
  code: string,
  sourceKeyEvent: string,
  keyCode: number,
  modifiers = 0
): RuneliteKeyRemappingKeybindSnapshot {
  return { key, code, sourceKeyEvent, keyCode, modifiers };
}

export const RUNELITE_DEFAULT_KEY_REMAPPING_CONFIG_SNAPSHOT: RuneliteKeyRemappingConfigSnapshot = {
  enabled: false,
  hideDisplayName: false,
  cameraRemap: true,
  up: keybind("W", "KeyW", "KeyEvent.VK_W", 87),
  down: keybind("S", "KeyS", "KeyEvent.VK_S", 83),
  left: keybind("A", "KeyA", "KeyEvent.VK_A", 65),
  right: keybind("D", "KeyD", "KeyEvent.VK_D", 68),
  fkeyRemap: false,
  f1: keybind("1", "Digit1", "KeyEvent.VK_1", 49),
  f2: keybind("2", "Digit2", "KeyEvent.VK_2", 50),
  f3: keybind("3", "Digit3", "KeyEvent.VK_3", 51),
  f4: keybind("4", "Digit4", "KeyEvent.VK_4", 52),
  f5: keybind("5", "Digit5", "KeyEvent.VK_5", 53),
  f6: keybind("6", "Digit6", "KeyEvent.VK_6", 54),
  f7: keybind("7", "Digit7", "KeyEvent.VK_7", 55),
  f8: keybind("8", "Digit8", "KeyEvent.VK_8", 56),
  f9: keybind("9", "Digit9", "KeyEvent.VK_9", 57),
  f10: keybind("0", "Digit0", "KeyEvent.VK_0", 48),
  f11: keybind("Minus", "Minus", "KeyEvent.VK_MINUS", 45),
  f12: keybind("Equals", "Equal", "KeyEvent.VK_EQUALS", 61),
  esc: keybind("Escape", "Escape", "KeyEvent.VK_ESCAPE", 27)
};

const directFunctionKeys = new Set<RuneliteKeyRemappingFunctionKey>([
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  "Escape"
]);

export function runeliteNormalizeKeyRemappingKeybind(
  value: string | undefined,
  fallback: RuneliteKeyRemappingKeybindSnapshot
): RuneliteKeyRemappingKeybindSnapshot {
  const key = value?.trim();
  if (!key) {
    return fallback;
  }

  const storedKeybind = runeliteKeyRemappingKeybindFromProperty(key);
  if (storedKeybind) {
    return storedKeybind;
  }

  if (key.toLowerCase() === "not set") {
    return runeliteKeyRemappingNotSetKeybind();
  }

  const sourceKeyCode = runeliteKeyRemappingAwtKeyCodeFromDisplayKey(key);
  if (sourceKeyCode !== null) {
    return runeliteKeyRemappingKeybindFromAwt(sourceKeyCode, 0);
  }

  const normalized = key.length === 1 ? key.toUpperCase() : key;
  const code =
    normalized.length === 1 && /[A-Z]/.test(normalized)
      ? `Key${normalized}`
      : normalized.length === 1 && /[0-9]/.test(normalized)
        ? `Digit${normalized}`
        : normalized === "-" || normalized.toLowerCase() === "minus"
          ? "Minus"
          : normalized === "=" || normalized.toLowerCase() === "equals"
            ? "Equal"
            : normalized.toLowerCase() === "esc" || normalized.toLowerCase() === "escape"
              ? "Escape"
              : fallback.code;

  const displayKey =
    code === "Minus" ? "Minus" : code === "Equal" ? "Equals" : code === "Escape" ? "Escape" : normalized;

  return {
    key: displayKey,
    code,
    sourceKeyEvent: fallback.sourceKeyEvent,
    keyCode: fallback.keyCode,
    modifiers: fallback.modifiers
  };
}

export function runeliteKeyRemappingKeybindDisplayText(
  value: RuneliteConfigKeybindValue,
  fallback: RuneliteKeyRemappingKeybindSnapshot
): string {
  return runeliteNormalizeKeyRemappingKeybind(String(value), fallback).key;
}

export type RuneliteConfigKeybindValue = string | number | boolean;

export function runeliteKeyRemappingKeybindPropertyFromKeyboardEvent(
  event: RuneliteKeyRemappingKeyboardEventLike
): string | null {
  const rawKeyCode = runeliteKeyRemappingAwtKeyCodeFromKeyboardEvent(event);
  if (rawKeyCode === null) {
    return null;
  }

  const rawModifiers = runeliteKeyRemappingAwtModifiersFromKeyboardEvent(event);
  const modifierMask = awtModifierMaskByKeyCode.get(rawKeyCode);
  if (modifierMask) {
    return `${awtKeyUndefined}:${(rawModifiers | modifierMask) & awtKeyboardModifierMask}`;
  }

  return `${rawKeyCode}:0`;
}

export function runeliteKeyRemappingEventTargetConsumesKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLButtonElement ||
    target.isContentEditable
  );
}

export function runeliteKeyRemappingTextEntryTargetConsumesKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

export function runeliteKeyRemappingCameraDirectionFromKeyboardEvent(
  config: RuneliteKeyRemappingConfigSnapshot,
  event: KeyboardEvent,
  typing = false
): RuneliteKeyRemappingCameraDirection | null {
  if (!config.enabled || !config.cameraRemap || typing) {
    return null;
  }

  if (runeliteKeyRemappingKeybindMatchesEvent(config.up, event)) {
    return "up";
  }
  if (runeliteKeyRemappingKeybindMatchesEvent(config.down, event)) {
    return "down";
  }
  if (runeliteKeyRemappingKeybindMatchesEvent(config.left, event)) {
    return "left";
  }
  if (runeliteKeyRemappingKeybindMatchesEvent(config.right, event)) {
    return "right";
  }
  return null;
}

export function runeliteKeyRemappingFunctionKeyFromKeyboardEvent(
  config: RuneliteKeyRemappingConfigSnapshot,
  event: KeyboardEvent,
  typing = false,
  dialogOpen = false
): RuneliteKeyRemappingFunctionKey | null {
  if (!config.enabled || !config.fkeyRemap || typing || dialogOpen) {
    return null;
  }

  if (runeliteKeyRemappingKeybindMatchesEvent(config.f1, event)) {
    return "F1";
  }
  if (runeliteKeyRemappingKeybindMatchesEvent(config.f2, event)) {
    return "F2";
  }
  if (runeliteKeyRemappingKeybindMatchesEvent(config.f3, event)) {
    return "F3";
  }
  if (runeliteKeyRemappingKeybindMatchesEvent(config.f4, event)) {
    return "F4";
  }
  if (runeliteKeyRemappingKeybindMatchesEvent(config.f5, event)) {
    return "F5";
  }
  if (runeliteKeyRemappingKeybindMatchesEvent(config.f6, event)) {
    return "F6";
  }
  if (runeliteKeyRemappingKeybindMatchesEvent(config.f7, event)) {
    return "F7";
  }
  if (runeliteKeyRemappingKeybindMatchesEvent(config.f8, event)) {
    return "F8";
  }
  if (runeliteKeyRemappingKeybindMatchesEvent(config.f9, event)) {
    return "F9";
  }
  if (runeliteKeyRemappingKeybindMatchesEvent(config.f10, event)) {
    return "F10";
  }
  if (runeliteKeyRemappingKeybindMatchesEvent(config.f11, event)) {
    return "F11";
  }
  if (runeliteKeyRemappingKeybindMatchesEvent(config.f12, event)) {
    return "F12";
  }
  if (runeliteKeyRemappingKeybindMatchesEvent(config.esc, event)) {
    return "Escape";
  }
  return null;
}

export function runeliteDirectFunctionKeyFromKeyboardEvent(event: KeyboardEvent): RuneliteKeyRemappingFunctionKey | null {
  return directFunctionKeys.has(event.key as RuneliteKeyRemappingFunctionKey)
    ? (event.key as RuneliteKeyRemappingFunctionKey)
    : null;
}

export function runeliteKeyRemappingSourceListener(): string {
  return sourceListener;
}

function runeliteKeyRemappingKeybindMatchesEvent(
  keybindSnapshot: RuneliteKeyRemappingKeybindSnapshot,
  event: KeyboardEvent
): boolean {
  const eventKeyCode = runeliteKeyRemappingAwtKeyCodeFromKeyboardEvent(event);
  if (keybindSnapshot.keyCode === awtKeyUndefined) {
    if (!keybindSnapshot.modifiers || eventKeyCode === null) {
      return false;
    }
    const modifierMask = awtModifierMaskByKeyCode.get(eventKeyCode) ?? 0;
    return modifierMask !== 0 && (keybindSnapshot.modifiers & modifierMask) !== 0;
  }

  if (eventKeyCode !== null && eventKeyCode === keybindSnapshot.keyCode) {
    return true;
  }

  if (!keybindSnapshot.code) {
    return false;
  }

  return (
    event.code === keybindSnapshot.code ||
    event.key.toLowerCase() === keybindSnapshot.key.toLowerCase() ||
    (keybindSnapshot.code === "Equal" && event.key === "=") ||
    (keybindSnapshot.code === "Minus" && event.key === "-")
  );
}

function runeliteKeyRemappingKeybindFromProperty(value: string): RuneliteKeyRemappingKeybindSnapshot | null {
  const match = /^(-?\d+):(-?\d+)$/.exec(value);
  if (!match) {
    return null;
  }

  const keyCode = Number.parseInt(match[1], 10);
  const modifiers = Number.parseInt(match[2], 10);
  if (!Number.isInteger(keyCode) || !Number.isInteger(modifiers)) {
    return null;
  }

  return runeliteKeyRemappingKeybindFromAwt(keyCode, modifiers);
}

function runeliteKeyRemappingKeybindFromAwt(
  rawKeyCode: number,
  rawModifiers: number
): RuneliteKeyRemappingKeybindSnapshot {
  let keyCode = rawKeyCode;
  let modifiers = rawModifiers & awtKeyboardModifierMask;
  const modifierMask = awtModifierMaskByKeyCode.get(keyCode);

  if (modifierMask) {
    keyCode = awtKeyUndefined;
    modifiers |= modifierMask;
  }

  if (keyCode !== awtKeyUndefined) {
    modifiers = 0;
  }

  if (keyCode === awtKeyUndefined) {
    return modifiers === 0
      ? runeliteKeyRemappingNotSetKeybind()
      : keybind(
          runeliteKeyRemappingModifierText(modifiers),
          "",
          `ModifierlessKeybind(${awtKeyUndefined}:${modifiers})`,
          awtKeyUndefined,
          modifiers
        );
  }

  const mapping = runeliteKeyRemappingBrowserKeyFromAwtKeyCode(keyCode);
  return keybind(mapping.key, mapping.code, mapping.sourceKeyEvent, keyCode, 0);
}

function runeliteKeyRemappingNotSetKeybind(): RuneliteKeyRemappingKeybindSnapshot {
  return keybind("Not set", "", "Keybind.NOT_SET", awtKeyUndefined, 0);
}

function runeliteKeyRemappingBrowserKeyFromAwtKeyCode(keyCode: number): {
  readonly key: string;
  readonly code: string;
  readonly sourceKeyEvent: string;
} {
  if (keyCode >= 65 && keyCode <= 90) {
    const letter = String.fromCharCode(keyCode);
    return { key: letter, code: `Key${letter}`, sourceKeyEvent: `KeyEvent.VK_${letter}` };
  }

  if (keyCode >= 48 && keyCode <= 57) {
    const digit = String.fromCharCode(keyCode);
    return { key: digit, code: `Digit${digit}`, sourceKeyEvent: `KeyEvent.VK_${digit}` };
  }

  if (keyCode >= 112 && keyCode <= 123) {
    const functionKey = `F${keyCode - 111}`;
    return { key: functionKey, code: functionKey, sourceKeyEvent: `KeyEvent.VK_${functionKey}` };
  }

  switch (keyCode) {
    case 8:
      return { key: "Backspace", code: "Backspace", sourceKeyEvent: "KeyEvent.VK_BACK_SPACE" };
    case 9:
      return { key: "Tab", code: "Tab", sourceKeyEvent: "KeyEvent.VK_TAB" };
    case 10:
      return { key: "Enter", code: "Enter", sourceKeyEvent: "KeyEvent.VK_ENTER" };
    case 16:
      return { key: "Shift", code: "Shift", sourceKeyEvent: "KeyEvent.VK_SHIFT" };
    case 17:
      return { key: "Ctrl", code: "Control", sourceKeyEvent: "KeyEvent.VK_CONTROL" };
    case 18:
      return { key: "Alt", code: "Alt", sourceKeyEvent: "KeyEvent.VK_ALT" };
    case 27:
      return { key: "Escape", code: "Escape", sourceKeyEvent: "KeyEvent.VK_ESCAPE" };
    case 32:
      return { key: "Space", code: "Space", sourceKeyEvent: "KeyEvent.VK_SPACE" };
    case 37:
      return { key: "Left", code: "ArrowLeft", sourceKeyEvent: "KeyEvent.VK_LEFT" };
    case 38:
      return { key: "Up", code: "ArrowUp", sourceKeyEvent: "KeyEvent.VK_UP" };
    case 39:
      return { key: "Right", code: "ArrowRight", sourceKeyEvent: "KeyEvent.VK_RIGHT" };
    case 40:
      return { key: "Down", code: "ArrowDown", sourceKeyEvent: "KeyEvent.VK_DOWN" };
    case 44:
      return { key: "Comma", code: "Comma", sourceKeyEvent: "KeyEvent.VK_COMMA" };
    case 45:
      return { key: "Minus", code: "Minus", sourceKeyEvent: "KeyEvent.VK_MINUS" };
    case 46:
      return { key: "Period", code: "Period", sourceKeyEvent: "KeyEvent.VK_PERIOD" };
    case 47:
      return { key: "Slash", code: "Slash", sourceKeyEvent: "KeyEvent.VK_SLASH" };
    case 59:
      return { key: "Semicolon", code: "Semicolon", sourceKeyEvent: "KeyEvent.VK_SEMICOLON" };
    case 61:
      return { key: "Equals", code: "Equal", sourceKeyEvent: "KeyEvent.VK_EQUALS" };
    case 91:
      return { key: "Open Bracket", code: "BracketLeft", sourceKeyEvent: "KeyEvent.VK_OPEN_BRACKET" };
    case 92:
      return { key: "Back Slash", code: "Backslash", sourceKeyEvent: "KeyEvent.VK_BACK_SLASH" };
    case 93:
      return { key: "Close Bracket", code: "BracketRight", sourceKeyEvent: "KeyEvent.VK_CLOSE_BRACKET" };
    case 157:
      return { key: "Meta", code: "Meta", sourceKeyEvent: "KeyEvent.VK_META" };
    case 192:
      return { key: "Back Quote", code: "Backquote", sourceKeyEvent: "KeyEvent.VK_BACK_QUOTE" };
    case 222:
      return { key: "Quote", code: "Quote", sourceKeyEvent: "KeyEvent.VK_QUOTE" };
    default:
      return { key: `KeyCode ${keyCode}`, code: "", sourceKeyEvent: `KeyEvent(${keyCode})` };
  }
}

function runeliteKeyRemappingAwtKeyCodeFromDisplayKey(value: string): number | null {
  const key = value.trim();
  if (!key) {
    return null;
  }

  if (/^F([1-9]|1[0-2])$/i.test(key)) {
    return 111 + Number.parseInt(key.slice(1), 10);
  }

  if (key.length === 1) {
    const upper = key.toUpperCase();
    if (upper >= "A" && upper <= "Z") {
      return upper.charCodeAt(0);
    }
    if (upper >= "0" && upper <= "9") {
      return upper.charCodeAt(0);
    }
    if (key === "-") {
      return 45;
    }
    if (key === "=") {
      return 61;
    }
    if (key === "/") {
      return 47;
    }
    if (key === ",") {
      return 44;
    }
    if (key === ".") {
      return 46;
    }
  }

  switch (key.toLowerCase()) {
    case "alt":
      return 18;
    case "back slash":
    case "backslash":
      return 92;
    case "back quote":
    case "backquote":
      return 192;
    case "backspace":
      return 8;
    case "close bracket":
    case "bracketright":
      return 93;
    case "comma":
      return 44;
    case "control":
    case "ctrl":
      return 17;
    case "down":
    case "arrowdown":
      return 40;
    case "enter":
      return 10;
    case "equals":
    case "equal":
      return 61;
    case "esc":
    case "escape":
      return 27;
    case "left":
    case "arrowleft":
      return 37;
    case "meta":
      return 157;
    case "minus":
      return 45;
    case "open bracket":
    case "bracketleft":
      return 91;
    case "period":
      return 46;
    case "quote":
      return 222;
    case "right":
    case "arrowright":
      return 39;
    case "semicolon":
      return 59;
    case "shift":
      return 16;
    case "slash":
      return 47;
    case "space":
      return 32;
    case "tab":
      return 9;
    case "up":
    case "arrowup":
      return 38;
    default:
      return null;
  }
}

function runeliteKeyRemappingAwtKeyCodeFromKeyboardEvent(
  event: RuneliteKeyRemappingKeyboardEventLike
): number | null {
  if (typeof event.keyCode === "number" && event.keyCode > 0) {
    return runeliteKeyRemappingMetaNormalizedAwtCode(event.keyCode);
  }
  if (typeof event.which === "number" && event.which > 0) {
    return runeliteKeyRemappingMetaNormalizedAwtCode(event.which);
  }

  const key = event.key ?? "";
  const fromKey = runeliteKeyRemappingAwtKeyCodeFromDisplayKey(key);
  if (fromKey !== null) {
    return fromKey;
  }

  const code = event.code ?? "";
  if (/^Key[A-Z]$/.test(code)) {
    return code.charCodeAt(3);
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.charCodeAt(5);
  }
  if (/^F([1-9]|1[0-2])$/.test(code)) {
    return 111 + Number.parseInt(code.slice(1), 10);
  }

  return runeliteKeyRemappingAwtKeyCodeFromDisplayKey(code);
}

function runeliteKeyRemappingMetaNormalizedAwtCode(keyCode: number): number {
  return keyCode === 91 || keyCode === 93 || keyCode === 224 ? 157 : keyCode;
}

function runeliteKeyRemappingAwtModifiersFromKeyboardEvent(event: RuneliteKeyRemappingKeyboardEventLike): number {
  let modifiers = 0;
  if (event.shiftKey) {
    modifiers |= awtShiftDownMask;
  }
  if (event.ctrlKey) {
    modifiers |= awtCtrlDownMask;
  }
  if (event.metaKey) {
    modifiers |= awtMetaDownMask;
  }
  if (event.altKey) {
    modifiers |= awtAltDownMask;
  }
  return modifiers;
}

function runeliteKeyRemappingModifierText(modifiers: number): string {
  const names: string[] = [];
  if ((modifiers & awtMetaDownMask) !== 0) {
    names.push("Meta");
  }
  if ((modifiers & awtCtrlDownMask) !== 0) {
    names.push("Ctrl");
  }
  if ((modifiers & awtAltDownMask) !== 0) {
    names.push("Alt");
  }
  if ((modifiers & awtShiftDownMask) !== 0) {
    names.push("Shift");
  }
  return names.length > 0 ? names.join("+") : "Not set";
}
