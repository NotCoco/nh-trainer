import { nhMenuBaseOpcode, selectNhDefaultMenuEntry, type NhMenuEntry } from "../render/nhContextMenu";

export const RUNELITE_MOUSE_HIGHLIGHT_PLUGIN_ID = "mousehighlight";
export const RUNELITE_MOUSE_HIGHLIGHT_CONFIG_GROUP = "mousehighlight";
export const RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_OFFSET = 24;
export const RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_PADDING = 4;
export const RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_BACKGROUND_RGBA = "rgba(70, 61, 50, 0.612)";
export const RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_OUTSIDE_STROKE_RGBA = "rgb(56, 48, 35)";
export const RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_INSIDE_STROKE_RGBA = "rgb(90, 82, 69)";

const runeliteOverlayOpcode = 1501;
const examineItemBankEqOpcode = 1007;

export type RuneliteMouseHighlightTooltipRegion = "main" | "ui" | "chatbox";

export interface RuneliteMouseHighlightConfigSnapshot {
  readonly enabled: boolean;
  readonly mainTooltip: boolean;
  readonly uiTooltip: boolean;
  readonly chatboxTooltip: boolean;
  readonly hideSpells: boolean;
  readonly hideCombat: boolean;
  readonly rightClickOptionTooltip: boolean;
}

export interface RuneliteMouseHighlightTooltipSnapshot {
  readonly text: string;
  readonly actionText: string;
  readonly targetText: string;
  readonly opcode: number;
  readonly region: RuneliteMouseHighlightTooltipRegion;
  readonly x: number;
  readonly y: number;
}

export interface RuneliteMouseHighlightTooltipInput {
  readonly entries: readonly NhMenuEntry[];
  readonly config: RuneliteMouseHighlightConfigSnapshot;
  readonly region: RuneliteMouseHighlightTooltipRegion;
  readonly menuOpen: boolean;
  readonly x: number;
  readonly y: number;
}

export function runeliteMouseHighlightTooltipSnapshot({
  entries,
  config,
  region,
  menuOpen,
  x,
  y
}: RuneliteMouseHighlightTooltipInput): RuneliteMouseHighlightTooltipSnapshot | null {
  if (!config.enabled || menuOpen || entries.length === 0) {
    return null;
  }

  if (!runeliteMouseHighlightRegionEnabled(config, region)) {
    return null;
  }

  const entry = selectNhDefaultMenuEntry(entries);
  if (!entry || runeliteMouseHighlightShouldNotRenderMenuAction(entry.opcode, config)) {
    return null;
  }

  const actionText = entry.actionText.trim();
  if (!actionText || runeliteMouseHighlightTrivialAction(actionText, entry.targetText)) {
    return null;
  }

  return {
    text: runeliteMouseHighlightTooltipText(entry),
    actionText,
    targetText: entry.targetText,
    opcode: entry.opcode,
    region,
    x,
    y: y + RUNELITE_MOUSE_HIGHLIGHT_TOOLTIP_OFFSET
  };
}

function runeliteMouseHighlightRegionEnabled(
  config: RuneliteMouseHighlightConfigSnapshot,
  region: RuneliteMouseHighlightTooltipRegion
): boolean {
  if (region === "main") {
    return config.mainTooltip;
  }
  if (region === "chatbox") {
    return config.chatboxTooltip;
  }
  return config.uiTooltip;
}

function runeliteMouseHighlightShouldNotRenderMenuAction(
  opcode: number,
  config: RuneliteMouseHighlightConfigSnapshot
): boolean {
  return (
    nhMenuBaseOpcode(opcode) === runeliteOverlayOpcode ||
    (!config.rightClickOptionTooltip && runeliteMouseHighlightIsRightClickOnly(opcode))
  );
}

function runeliteMouseHighlightIsRightClickOnly(opcode: number): boolean {
  return nhMenuBaseOpcode(opcode) === examineItemBankEqOpcode;
}

function runeliteMouseHighlightTrivialAction(actionText: string, targetText: string): boolean {
  if (actionText === "Walk here" || actionText === "Cancel" || actionText === "Continue") {
    return true;
  }
  return actionText === "Move" && targetText.includes("Sliding piece");
}

function runeliteMouseHighlightTooltipText(entry: NhMenuEntry): string {
  const text = entry.targetText.length > 0 ? `${entry.actionText} ${entry.targetText}` : entry.actionText;
  return text.endsWith("</col>") ? text : `${text}</col>`;
}
