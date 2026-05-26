import { kronosClientFontStringWidth, type KronosClientFontDefinition } from "./kronosClientFonts";

export interface KronosMenuEntry {
  readonly actionText: string;
  readonly targetText: string;
  readonly opcode: number;
  readonly identifier?: number;
  readonly argument1?: number;
  readonly argument2?: number;
  readonly shiftClick?: boolean;
}

export interface KronosMenuRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface KronosMenuBounds {
  readonly width: number;
  readonly height: number;
}

export const KRONOS_CONTEXT_MENU_TITLE = "Choose Option";
export const KRONOS_CONTEXT_MENU_ROW_HEIGHT = 15;
export const KRONOS_CONTEXT_MENU_HEADER_AND_PADDING_HEIGHT = 22;
export const KRONOS_CONTEXT_MENU_TEXT_LEFT = 3;
export const KRONOS_CONTEXT_MENU_TITLE_BASELINE_OFFSET = 14;
export const KRONOS_CONTEXT_MENU_OPTION_BASELINE_OFFSET = 31;
export const KRONOS_CONTEXT_MENU_HOVER_TOP_OFFSET = 13;
export const KRONOS_CONTEXT_MENU_HOVER_BOTTOM_OFFSET = 3;
export const KRONOS_CONTEXT_MENU_FRAME_COLOR = "#6d6a5b";
export const KRONOS_CONTEXT_MENU_OUTLINE_COLOR = "#2b2622";
export const KRONOS_CONTEXT_MENU_HEADER_TOP_COLOR = "#322e22";
export const KRONOS_CONTEXT_MENU_HEADER_BOTTOM_COLOR = "#090a04";
export const KRONOS_CONTEXT_MENU_BODY_BORDER_COLOR = "#524a3d";
export const KRONOS_CONTEXT_MENU_BODY_COLOR = "#2b271c";
export const KRONOS_CONTEXT_MENU_TEXT_COLOR = "#c6b895";
export const KRONOS_CONTEXT_MENU_HOVER_FILL_COLOR = "#ffffff";
export const KRONOS_CONTEXT_MENU_HOVER_FILL_ALPHA = 80 / 256;
export const KRONOS_CONTEXT_MENU_HOVER_LEFT = 3;
export const KRONOS_CONTEXT_MENU_HOVER_TOP = -3;
export const KRONOS_CONTEXT_MENU_HOVER_WIDTH_SUBTRACT = 6;
export const KRONOS_CONTEXT_MENU_HOVER_HEIGHT = 15;
export const KRONOS_WALK_HERE_OPCODE = 23;
export const KRONOS_CANCEL_OPCODE = 1006;
export const KRONOS_CANCEL_ACTION_TEXT = "Cancel";
export const KRONOS_PLAYER_MENU_OPCODES = [44, 45, 46, 47, 48, 49, 50, 51] as const;
export const KRONOS_MENU_PRIORITY_OPCODE_OFFSET = 2000;
export const KRONOS_PLAYER_USE_SELECTED_OPCODE = 14;
export const KRONOS_PLAYER_SPELL_SELECTED_OPCODE = 15;
export const KRONOS_PLAYER_SELECTED_PACKET_IDS_BY_OPCODE = {
  14: 59,
  15: 55
} as const;
export const KRONOS_PLAYER_ACTION_PACKET_IDS_BY_OPCODE = {
  44: { serverPacketId: 81, sourcePacketName: "ClientPacket.field2387" },
  45: { serverPacketId: 43, sourcePacketName: "ClientPacket.field2383" },
  46: { serverPacketId: 61, sourcePacketName: "ClientPacket.field2362" },
  47: { serverPacketId: 71, sourcePacketName: "ClientPacket.field2427" },
  48: { serverPacketId: 58, sourcePacketName: "ClientPacket.field2398" },
  49: { serverPacketId: 52, sourcePacketName: "ClientPacket.field2370" },
  50: { serverPacketId: 90, sourcePacketName: "ClientPacket.field2430" },
  51: { serverPacketId: 78, sourcePacketName: "ClientPacket.field2418" }
} as const;

export interface KronosPlayerMenuAction {
  readonly option: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly actionText: string;
  readonly top: boolean;
}

export interface KronosPlayerMenuTarget<TTile> {
  readonly name: string;
  readonly combatLevel: number;
  readonly localCombatLevel: number;
  readonly identifier: number;
  readonly walkTile: TTile;
  readonly actionTile: TTile;
  readonly selectedItem?: KronosPlayerSelectedItem | null;
  readonly selectedSpell?: KronosPlayerSelectedSpell | null;
}

export type KronosPlayerContextMenuEntry<TTile> = KronosMenuEntry & {
  readonly action:
    | "walk"
    | "attack"
    | "follow"
    | "trade"
    | "player-action"
    | "player-use-selected"
    | "player-spell-selected";
  readonly targetTile: TTile;
  readonly selectedItem?: KronosPlayerSelectedItem;
  readonly selectedSpell?: KronosPlayerSelectedSpell;
};

export interface KronosPlayerSelectedItem {
  readonly itemName: string;
  readonly itemId?: number;
  readonly slotIndex?: number;
  readonly widgetId?: number;
}

export interface KronosPlayerSelectedSpell {
  readonly actionName: string;
  readonly spellName: string;
  readonly flags: number;
  readonly widgetId?: number;
  readonly childId?: number;
  readonly itemId?: number;
  readonly spellId?: string;
  readonly label?: string;
}

export interface KronosPlayerSelectedCommandPacket {
  readonly clientMenuOpcode: number;
  readonly serverPacketId: number;
  readonly targetPlayerIndex: number;
  readonly selectedItem?: KronosPlayerSelectedItem;
  readonly selectedSpell?: KronosPlayerSelectedSpell;
}

export interface KronosPlayerCommandPacket extends KronosPlayerSelectedCommandPacket {
  readonly clientMenuBaseOpcode: number;
  readonly sourcePacketName?: string;
  readonly playerOption?: KronosPlayerMenuAction["option"];
}

export const KRONOS_DEFAULT_PLAYER_MENU_ACTIONS: readonly KronosPlayerMenuAction[] = [
  { option: 2, actionText: "Follow", top: false },
  { option: 3, actionText: "Trade with", top: false }
];

export const KRONOS_WILDERNESS_PLAYER_MENU_ACTIONS: readonly KronosPlayerMenuAction[] = [
  { option: 1, actionText: "Attack", top: true },
  ...KRONOS_DEFAULT_PLAYER_MENU_ACTIONS
];

const menuWidthPadding = 8;
const playerSpellTargetFlag = 8;

export function orderKronosMenuEntries<TEntry extends KronosMenuEntry>(entries: readonly TEntry[]): readonly TEntry[] {
  const ordered = [...entries];
  let sorted = false;
  while (!sorted) {
    sorted = true;
    for (let index = 0; index < ordered.length - 1; index += 1) {
      if (ordered[index].opcode < 1000 && ordered[index + 1].opcode > 1000) {
        const next = ordered[index + 1];
        ordered[index + 1] = ordered[index];
        ordered[index] = next;
        sorted = false;
      }
    }
  }
  return ordered;
}

export function visibleKronosMenuEntries<TEntry extends KronosMenuEntry>(entries: readonly TEntry[]): readonly TEntry[] {
  return [...orderKronosMenuEntries(entries)].reverse();
}

export function kronosMenuEntryText(entry: KronosMenuEntry): string {
  return stripKronosTextTags(entry.targetText.length > 0 ? `${entry.actionText} ${entry.targetText}` : entry.actionText);
}

export function selectKronosDefaultMenuEntry<TEntry extends KronosMenuEntry>(entries: readonly TEntry[]): TEntry | null {
  const ordered = orderKronosMenuEntries(entries);
  return ordered[ordered.length - 1] ?? null;
}

export function kronosMenuBaseOpcode(opcode: number): number {
  return opcode >= KRONOS_MENU_PRIORITY_OPCODE_OFFSET ? opcode - KRONOS_MENU_PRIORITY_OPCODE_OFFSET : opcode;
}

export function kronosContextMenuHitIndex(
  mouseX: number,
  mouseY: number,
  menu: KronosMenuRect,
  entries: readonly KronosMenuEntry[]
): number {
  const ordered = orderKronosMenuEntries(entries);
  for (let index = 0; index < ordered.length; index += 1) {
    const optionBaseline = (ordered.length - 1 - index) * KRONOS_CONTEXT_MENU_ROW_HEIGHT + menu.y + KRONOS_CONTEXT_MENU_OPTION_BASELINE_OFFSET;
    if (
      mouseX > menu.x &&
      mouseX < menu.x + menu.width &&
      mouseY > optionBaseline - KRONOS_CONTEXT_MENU_HOVER_TOP_OFFSET &&
      mouseY < optionBaseline + KRONOS_CONTEXT_MENU_HOVER_BOTTOM_OFFSET
    ) {
      return index;
    }
  }
  return -1;
}

export function buildKronosPlayerContextEntries<TTile>(
  target: KronosPlayerMenuTarget<TTile>,
  actions: readonly KronosPlayerMenuAction[] = KRONOS_WILDERNESS_PLAYER_MENU_ACTIONS
): readonly KronosPlayerContextMenuEntry<TTile>[] {
  const targetText = kronosPlayerTargetText(target.name, target.combatLevel, target.localCombatLevel);
  const baseEntry = {
    identifier: target.identifier,
    argument1:
      target.actionTile && typeof target.actionTile === "object" && "x" in target.actionTile
        ? Number(target.actionTile.x)
        : undefined,
    argument2:
      target.actionTile && typeof target.actionTile === "object" && "z" in target.actionTile
        ? Number(target.actionTile.z)
        : undefined,
    targetTile: target.actionTile
  } as const;

  if (target.selectedItem) {
    return [
      {
        ...baseEntry,
        actionText: "Use",
        targetText: `${target.selectedItem.itemName} -> ${targetText}`,
        opcode: KRONOS_PLAYER_USE_SELECTED_OPCODE,
        action: "player-use-selected",
        selectedItem: target.selectedItem
      }
    ];
  }

  if (target.selectedSpell) {
    if ((target.selectedSpell.flags & playerSpellTargetFlag) === playerSpellTargetFlag) {
      return [
        {
          ...baseEntry,
          actionText: target.selectedSpell.actionName,
          targetText: `${target.selectedSpell.spellName} -> ${targetText}`,
          opcode: KRONOS_PLAYER_SPELL_SELECTED_OPCODE,
          action: "player-spell-selected",
          selectedSpell: target.selectedSpell
        }
      ];
    }
    return [];
  }

  const entries: KronosPlayerContextMenuEntry<TTile>[] = [
    {
      actionText: "Walk here",
      targetText,
      opcode: KRONOS_WALK_HERE_OPCODE,
      action: "walk",
      targetTile: target.walkTile
    }
  ];

  const actionByOption = new Map(actions.map((action) => [action.option, action]));
  for (let option = 8; option >= 1; option -= 1) {
    const action = actionByOption.get(option as KronosPlayerMenuAction["option"]);
    if (!action) {
      continue;
    }
    const baseOpcode = KRONOS_PLAYER_MENU_OPCODES[option - 1];
    const opcode = action.top ? baseOpcode : baseOpcode + KRONOS_MENU_PRIORITY_OPCODE_OFFSET;
    entries.push({
      ...baseEntry,
      actionText: action.actionText,
      targetText,
      opcode,
      action: kronosPlayerMenuActionKind(action.actionText),
    });
  }

  return entries;
}

export function kronosPlayerSelectedCommandPacket(
  entry: KronosPlayerContextMenuEntry<unknown>
): KronosPlayerSelectedCommandPacket | null {
  if (
    entry.identifier === undefined ||
    !(entry.opcode in KRONOS_PLAYER_SELECTED_PACKET_IDS_BY_OPCODE)
  ) {
    return null;
  }

  return {
    clientMenuOpcode: entry.opcode,
    serverPacketId: KRONOS_PLAYER_SELECTED_PACKET_IDS_BY_OPCODE[
      entry.opcode as keyof typeof KRONOS_PLAYER_SELECTED_PACKET_IDS_BY_OPCODE
    ],
    targetPlayerIndex: entry.identifier,
    selectedItem: entry.selectedItem,
    selectedSpell: entry.selectedSpell
  };
}

export function kronosPlayerCommandPacket(entry: KronosPlayerContextMenuEntry<unknown>): KronosPlayerCommandPacket | null {
  if (entry.identifier === undefined) {
    return null;
  }

  const selectedPacket = kronosPlayerSelectedCommandPacket(entry);
  if (selectedPacket) {
    return {
      ...selectedPacket,
      clientMenuBaseOpcode: kronosMenuBaseOpcode(entry.opcode)
    };
  }

  const baseOpcode = kronosMenuBaseOpcode(entry.opcode);
  if (!(baseOpcode in KRONOS_PLAYER_ACTION_PACKET_IDS_BY_OPCODE)) {
    return null;
  }

  const packet =
    KRONOS_PLAYER_ACTION_PACKET_IDS_BY_OPCODE[
      baseOpcode as keyof typeof KRONOS_PLAYER_ACTION_PACKET_IDS_BY_OPCODE
    ];
  const opcodeIndex = KRONOS_PLAYER_MENU_OPCODES.findIndex((opcode) => opcode === baseOpcode);
  return {
    clientMenuOpcode: entry.opcode,
    clientMenuBaseOpcode: baseOpcode,
    serverPacketId: packet.serverPacketId,
    sourcePacketName: packet.sourcePacketName,
    targetPlayerIndex: entry.identifier,
    playerOption: opcodeIndex >= 0 ? ((opcodeIndex + 1) as KronosPlayerMenuAction["option"]) : undefined
  };
}

export function resolveKronosContextMenuRect(
  clickX: number,
  clickY: number,
  entries: readonly KronosMenuEntry[],
  bounds: KronosMenuBounds,
  font: KronosClientFontDefinition
): KronosMenuRect {
  const width = kronosContextMenuWidth(entries, font);
  const height = entries.length * KRONOS_CONTEXT_MENU_ROW_HEIGHT + KRONOS_CONTEXT_MENU_HEADER_AND_PADDING_HEIGHT;
  return {
    x: clamp(Math.trunc(clickX - width / 2), 0, Math.max(0, bounds.width - width)),
    y: clamp(Math.trunc(clickY), 0, Math.max(0, bounds.height - height)),
    width,
    height
  };
}

export function kronosContextMenuOptionTop(visibleIndex: number): number {
  return KRONOS_CONTEXT_MENU_HEADER_AND_PADDING_HEIGHT + visibleIndex * KRONOS_CONTEXT_MENU_ROW_HEIGHT;
}

export function kronosContextMenuWidth(entries: readonly KronosMenuEntry[], font: KronosClientFontDefinition): number {
  let width = kronosClientFontStringWidth(font, KRONOS_CONTEXT_MENU_TITLE);
  for (const entry of entries) {
    width = Math.max(width, kronosClientFontStringWidth(font, kronosMenuEntryText(entry)));
  }
  return width + menuWidthPadding;
}

function kronosPlayerTargetText(name: string, combatLevel: number, localCombatLevel: number): string {
  return `<col=ffffff>${name}${kronosCombatLevelColor(localCombatLevel - combatLevel)} (level-${combatLevel})`;
}

function kronosCombatLevelColor(delta: number): string {
  if (delta < -9) {
    return "<col=ff0000>";
  }
  if (delta < -6) {
    return "<col=ff3000>";
  }
  if (delta < -3) {
    return "<col=ff7000>";
  }
  if (delta < 0) {
    return "<col=ffb000>";
  }
  if (delta > 9) {
    return "<col=00ff00>";
  }
  if (delta > 6) {
    return "<col=40ff00>";
  }
  if (delta > 3) {
    return "<col=80ff00>";
  }
  if (delta > 0) {
    return "<col=c0ff00>";
  }
  return "<col=ffff00>";
}

function kronosPlayerMenuActionKind(actionText: string): KronosPlayerContextMenuEntry<unknown>["action"] {
  if (actionText === "Attack" || actionText === "Fight") {
    return "attack";
  }
  if (actionText === "Follow") {
    return "follow";
  }
  if (actionText === "Trade with") {
    return "trade";
  }
  return "player-action";
}

function stripKronosTextTags(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
