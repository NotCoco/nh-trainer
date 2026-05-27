import { nhClientFontStringWidth, type NhClientFontDefinition } from "./nhClientFonts";

export interface NhMenuEntry {
  readonly actionText: string;
  readonly targetText: string;
  readonly opcode: number;
  readonly identifier?: number;
  readonly argument1?: number;
  readonly argument2?: number;
  readonly shiftClick?: boolean;
}

export interface NhMenuRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface NhMenuBounds {
  readonly width: number;
  readonly height: number;
}

export const NH_CONTEXT_MENU_TITLE = "Choose Option";
export const NH_CONTEXT_MENU_ROW_HEIGHT = 15;
export const NH_CONTEXT_MENU_HEADER_AND_PADDING_HEIGHT = 22;
export const NH_CONTEXT_MENU_TEXT_LEFT = 3;
export const NH_CONTEXT_MENU_TITLE_BASELINE_OFFSET = 14;
export const NH_CONTEXT_MENU_OPTION_BASELINE_OFFSET = 31;
export const NH_CONTEXT_MENU_HOVER_TOP_OFFSET = 13;
export const NH_CONTEXT_MENU_HOVER_BOTTOM_OFFSET = 3;
export const NH_CONTEXT_MENU_FRAME_COLOR = "#6d6a5b";
export const NH_CONTEXT_MENU_OUTLINE_COLOR = "#2b2622";
export const NH_CONTEXT_MENU_HEADER_TOP_COLOR = "#322e22";
export const NH_CONTEXT_MENU_HEADER_BOTTOM_COLOR = "#090a04";
export const NH_CONTEXT_MENU_BODY_BORDER_COLOR = "#524a3d";
export const NH_CONTEXT_MENU_BODY_COLOR = "#2b271c";
export const NH_CONTEXT_MENU_TEXT_COLOR = "#c6b895";
export const NH_CONTEXT_MENU_HOVER_FILL_COLOR = "#ffffff";
export const NH_CONTEXT_MENU_HOVER_FILL_ALPHA = 80 / 256;
export const NH_CONTEXT_MENU_HOVER_LEFT = 3;
export const NH_CONTEXT_MENU_HOVER_TOP = -3;
export const NH_CONTEXT_MENU_HOVER_WIDTH_SUBTRACT = 6;
export const NH_CONTEXT_MENU_HOVER_HEIGHT = 15;
export const NH_WALK_HERE_OPCODE = 23;
export const NH_CANCEL_OPCODE = 1006;
export const NH_CANCEL_ACTION_TEXT = "Cancel";
export const NH_PLAYER_MENU_OPCODES = [44, 45, 46, 47, 48, 49, 50, 51] as const;
export const NH_MENU_PRIORITY_OPCODE_OFFSET = 2000;
export const NH_PLAYER_USE_SELECTED_OPCODE = 14;
export const NH_PLAYER_SPELL_SELECTED_OPCODE = 15;
export const NH_PLAYER_SELECTED_PACKET_IDS_BY_OPCODE = {
  14: 59,
  15: 55
} as const;
export const NH_PLAYER_ACTION_PACKET_IDS_BY_OPCODE = {
  44: { serverPacketId: 81, sourcePacketName: "ClientPacket.field2387" },
  45: { serverPacketId: 43, sourcePacketName: "ClientPacket.field2383" },
  46: { serverPacketId: 61, sourcePacketName: "ClientPacket.field2362" },
  47: { serverPacketId: 71, sourcePacketName: "ClientPacket.field2427" },
  48: { serverPacketId: 58, sourcePacketName: "ClientPacket.field2398" },
  49: { serverPacketId: 52, sourcePacketName: "ClientPacket.field2370" },
  50: { serverPacketId: 90, sourcePacketName: "ClientPacket.field2430" },
  51: { serverPacketId: 78, sourcePacketName: "ClientPacket.field2418" }
} as const;

export interface NhPlayerMenuAction {
  readonly option: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly actionText: string;
  readonly top: boolean;
}

export interface NhPlayerMenuTarget<TTile> {
  readonly name: string;
  readonly combatLevel: number;
  readonly localCombatLevel: number;
  readonly identifier: number;
  readonly walkTile: TTile;
  readonly actionTile: TTile;
  readonly selectedItem?: NhPlayerSelectedItem | null;
  readonly selectedSpell?: NhPlayerSelectedSpell | null;
}

export type NhPlayerContextMenuEntry<TTile> = NhMenuEntry & {
  readonly action:
    | "walk"
    | "attack"
    | "follow"
    | "trade"
    | "player-action"
    | "player-use-selected"
    | "player-spell-selected";
  readonly targetTile: TTile;
  readonly selectedItem?: NhPlayerSelectedItem;
  readonly selectedSpell?: NhPlayerSelectedSpell;
};

export interface NhPlayerSelectedItem {
  readonly itemName: string;
  readonly itemId?: number;
  readonly slotIndex?: number;
  readonly widgetId?: number;
}

export interface NhPlayerSelectedSpell {
  readonly actionName: string;
  readonly spellName: string;
  readonly flags: number;
  readonly widgetId?: number;
  readonly childId?: number;
  readonly itemId?: number;
  readonly spellId?: string;
  readonly label?: string;
}

export interface NhPlayerSelectedCommandPacket {
  readonly clientMenuOpcode: number;
  readonly serverPacketId: number;
  readonly targetPlayerIndex: number;
  readonly selectedItem?: NhPlayerSelectedItem;
  readonly selectedSpell?: NhPlayerSelectedSpell;
}

export interface NhPlayerCommandPacket extends NhPlayerSelectedCommandPacket {
  readonly clientMenuBaseOpcode: number;
  readonly sourcePacketName?: string;
  readonly playerOption?: NhPlayerMenuAction["option"];
}

export const NH_DEFAULT_PLAYER_MENU_ACTIONS: readonly NhPlayerMenuAction[] = [
  { option: 2, actionText: "Follow", top: false },
  { option: 3, actionText: "Trade with", top: false }
];

export const NH_WILDERNESS_PLAYER_MENU_ACTIONS: readonly NhPlayerMenuAction[] = [
  { option: 1, actionText: "Attack", top: true },
  ...NH_DEFAULT_PLAYER_MENU_ACTIONS
];

const menuWidthPadding = 8;
const playerSpellTargetFlag = 8;

export function orderNhMenuEntries<TEntry extends NhMenuEntry>(entries: readonly TEntry[]): readonly TEntry[] {
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

export function visibleNhMenuEntries<TEntry extends NhMenuEntry>(entries: readonly TEntry[]): readonly TEntry[] {
  return [...orderNhMenuEntries(entries)].reverse();
}

export function nhMenuEntryText(entry: NhMenuEntry): string {
  return stripNhTextTags(entry.targetText.length > 0 ? `${entry.actionText} ${entry.targetText}` : entry.actionText);
}

export function selectNhDefaultMenuEntry<TEntry extends NhMenuEntry>(entries: readonly TEntry[]): TEntry | null {
  const ordered = orderNhMenuEntries(entries);
  return ordered[ordered.length - 1] ?? null;
}

export function nhMenuBaseOpcode(opcode: number): number {
  return opcode >= NH_MENU_PRIORITY_OPCODE_OFFSET ? opcode - NH_MENU_PRIORITY_OPCODE_OFFSET : opcode;
}

export function nhContextMenuHitIndex(
  mouseX: number,
  mouseY: number,
  menu: NhMenuRect,
  entries: readonly NhMenuEntry[]
): number {
  const ordered = orderNhMenuEntries(entries);
  for (let index = 0; index < ordered.length; index += 1) {
    const optionBaseline = (ordered.length - 1 - index) * NH_CONTEXT_MENU_ROW_HEIGHT + menu.y + NH_CONTEXT_MENU_OPTION_BASELINE_OFFSET;
    if (
      mouseX > menu.x &&
      mouseX < menu.x + menu.width &&
      mouseY > optionBaseline - NH_CONTEXT_MENU_HOVER_TOP_OFFSET &&
      mouseY < optionBaseline + NH_CONTEXT_MENU_HOVER_BOTTOM_OFFSET
    ) {
      return index;
    }
  }
  return -1;
}

export function buildNhPlayerContextEntries<TTile>(
  target: NhPlayerMenuTarget<TTile>,
  actions: readonly NhPlayerMenuAction[] = NH_WILDERNESS_PLAYER_MENU_ACTIONS
): readonly NhPlayerContextMenuEntry<TTile>[] {
  const targetText = nhPlayerTargetText(target.name, target.combatLevel, target.localCombatLevel);
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
        opcode: NH_PLAYER_USE_SELECTED_OPCODE,
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
          opcode: NH_PLAYER_SPELL_SELECTED_OPCODE,
          action: "player-spell-selected",
          selectedSpell: target.selectedSpell
        }
      ];
    }
    return [];
  }

  const entries: NhPlayerContextMenuEntry<TTile>[] = [
    {
      actionText: "Walk here",
      targetText,
      opcode: NH_WALK_HERE_OPCODE,
      action: "walk",
      targetTile: target.walkTile
    }
  ];

  const actionByOption = new Map(actions.map((action) => [action.option, action]));
  for (let option = 8; option >= 1; option -= 1) {
    const action = actionByOption.get(option as NhPlayerMenuAction["option"]);
    if (!action) {
      continue;
    }
    const baseOpcode = NH_PLAYER_MENU_OPCODES[option - 1];
    const opcode = action.top ? baseOpcode : baseOpcode + NH_MENU_PRIORITY_OPCODE_OFFSET;
    entries.push({
      ...baseEntry,
      actionText: action.actionText,
      targetText,
      opcode,
      action: nhPlayerMenuActionKind(action.actionText),
    });
  }

  return entries;
}

export function nhPlayerSelectedCommandPacket(
  entry: NhPlayerContextMenuEntry<unknown>
): NhPlayerSelectedCommandPacket | null {
  if (
    entry.identifier === undefined ||
    !(entry.opcode in NH_PLAYER_SELECTED_PACKET_IDS_BY_OPCODE)
  ) {
    return null;
  }

  return {
    clientMenuOpcode: entry.opcode,
    serverPacketId: NH_PLAYER_SELECTED_PACKET_IDS_BY_OPCODE[
      entry.opcode as keyof typeof NH_PLAYER_SELECTED_PACKET_IDS_BY_OPCODE
    ],
    targetPlayerIndex: entry.identifier,
    selectedItem: entry.selectedItem,
    selectedSpell: entry.selectedSpell
  };
}

export function nhPlayerCommandPacket(entry: NhPlayerContextMenuEntry<unknown>): NhPlayerCommandPacket | null {
  if (entry.identifier === undefined) {
    return null;
  }

  const selectedPacket = nhPlayerSelectedCommandPacket(entry);
  if (selectedPacket) {
    return {
      ...selectedPacket,
      clientMenuBaseOpcode: nhMenuBaseOpcode(entry.opcode)
    };
  }

  const baseOpcode = nhMenuBaseOpcode(entry.opcode);
  if (!(baseOpcode in NH_PLAYER_ACTION_PACKET_IDS_BY_OPCODE)) {
    return null;
  }

  const packet =
    NH_PLAYER_ACTION_PACKET_IDS_BY_OPCODE[
      baseOpcode as keyof typeof NH_PLAYER_ACTION_PACKET_IDS_BY_OPCODE
    ];
  const opcodeIndex = NH_PLAYER_MENU_OPCODES.findIndex((opcode) => opcode === baseOpcode);
  return {
    clientMenuOpcode: entry.opcode,
    clientMenuBaseOpcode: baseOpcode,
    serverPacketId: packet.serverPacketId,
    sourcePacketName: packet.sourcePacketName,
    targetPlayerIndex: entry.identifier,
    playerOption: opcodeIndex >= 0 ? ((opcodeIndex + 1) as NhPlayerMenuAction["option"]) : undefined
  };
}

export function resolveNhContextMenuRect(
  clickX: number,
  clickY: number,
  entries: readonly NhMenuEntry[],
  bounds: NhMenuBounds,
  font: NhClientFontDefinition
): NhMenuRect {
  const width = nhContextMenuWidth(entries, font);
  const height = entries.length * NH_CONTEXT_MENU_ROW_HEIGHT + NH_CONTEXT_MENU_HEADER_AND_PADDING_HEIGHT;
  return {
    x: clamp(Math.trunc(clickX - width / 2), 0, Math.max(0, bounds.width - width)),
    y: clamp(Math.trunc(clickY), 0, Math.max(0, bounds.height - height)),
    width,
    height
  };
}

export function nhContextMenuOptionTop(visibleIndex: number): number {
  return NH_CONTEXT_MENU_HEADER_AND_PADDING_HEIGHT + visibleIndex * NH_CONTEXT_MENU_ROW_HEIGHT;
}

export function nhContextMenuWidth(entries: readonly NhMenuEntry[], font: NhClientFontDefinition): number {
  let width = nhClientFontStringWidth(font, NH_CONTEXT_MENU_TITLE);
  for (const entry of entries) {
    width = Math.max(width, nhClientFontStringWidth(font, nhMenuEntryText(entry)));
  }
  return width + menuWidthPadding;
}

function nhPlayerTargetText(name: string, combatLevel: number, localCombatLevel: number): string {
  return `<col=ffffff>${name}${nhCombatLevelColor(localCombatLevel - combatLevel)} (level-${combatLevel})`;
}

function nhCombatLevelColor(delta: number): string {
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

function nhPlayerMenuActionKind(actionText: string): NhPlayerContextMenuEntry<unknown>["action"] {
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

function stripNhTextTags(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
