import type { NhInventorySelectedItem } from "./nhInventory";
import type { NhMenuEntry } from "./nhContextMenu";
import type { NhArenaObjectPlacement, NhWorldTile } from "./nhSceneCollision";

export const NH_OBJECT_USE_SELECTED_OPCODE = 1;
export const NH_OBJECT_SPELL_SELECTED_OPCODE = 2;
export const NH_OBJECT_ACTION_OPCODES = [3, 4, 5, 6, 1001] as const;
export const NH_OBJECT_EXAMINE_OPCODE = 1002;
export const NH_OBJECT_TARGET_COLOR_TAG = "<col=00ffff>";
export const NH_OBJECT_PACKET_IDS_BY_OPCODE = {
  1: 46,
  2: 68,
  3: 51,
  4: 6,
  5: 42,
  6: 95,
  1001: 50,
  1002: 36
} as const;
export const NH_OBJECT_SERVER_OPTIONS_BY_OPCODE = {
  3: 1,
  4: 2,
  5: 3,
  6: 4,
  1001: 5,
  1002: 6
} as const;

export type NhSceneObjectContextAction =
  | "walk"
  | "object-action"
  | "object-use-selected"
  | "object-spell-selected"
  | "object-examine";

export type NhSceneObjectContextMenuEntry<TTile> = NhMenuEntry & {
  readonly action: NhSceneObjectContextAction;
  readonly targetTile: TTile;
  readonly objectPlacement?: NhArenaObjectPlacement;
  readonly objectId?: number;
  readonly objectName?: string;
  readonly objectX?: number;
  readonly objectY?: number;
  readonly objectActionIndex?: number;
  readonly selectedItem?: NhInventorySelectedItem;
  readonly selectedSpell?: NhSelectedSpell;
};

export interface NhSelectedSpell {
  readonly actionName: string;
  readonly spellName: string;
  readonly flags: number;
  readonly widgetId?: number;
  readonly childId?: number;
  readonly itemId?: number;
  readonly spellId?: string;
  readonly label?: string;
}

export interface NhSceneObjectMenuTarget<TTile> {
  readonly placement: NhArenaObjectPlacement;
  readonly walkTile: TTile;
  readonly actionTile: TTile;
  readonly selectedItem?: NhInventorySelectedItem | null;
  readonly selectedSpell?: NhSelectedSpell | null;
}

export interface NhSceneObjectCommandPacket {
  readonly clientMenuOpcode: number;
  readonly serverPacketId: number;
  readonly serverOption: number | null;
  readonly objectId: number;
  readonly objectX: number;
  readonly objectY: number;
  readonly selectedItem?: NhInventorySelectedItem;
  readonly selectedSpell?: NhSelectedSpell;
}

const objectSpellTargetFlag = 4;

export function buildNhSceneObjectContextEntries<TTile>({
  placement,
  walkTile,
  actionTile,
  selectedItem,
  selectedSpell
}: NhSceneObjectMenuTarget<TTile>): readonly NhSceneObjectContextMenuEntry<TTile>[] {
  if (!isNhSceneObjectMenuable(placement)) {
    return [{ actionText: "Walk here", targetText: "", opcode: 23, action: "walk", targetTile: walkTile }];
  }

  const targetText = nhSceneObjectTargetText(placement.name);
  const baseEntry = {
    objectPlacement: placement,
    identifier: placement.id,
    argument1: placement.x,
    argument2: placement.y,
    objectId: placement.id,
    objectName: placement.name,
    objectX: placement.x,
    objectY: placement.y,
    targetTile: actionTile
  } as const;

  if (selectedItem) {
    return [
      {
        ...baseEntry,
        actionText: "Use",
        targetText: `${selectedItem.itemName} -> ${targetText}`,
        opcode: NH_OBJECT_USE_SELECTED_OPCODE,
        action: "object-use-selected",
        selectedItem
      }
    ];
  }

  if (selectedSpell) {
    if ((selectedSpell.flags & objectSpellTargetFlag) === objectSpellTargetFlag) {
      return [
        {
          ...baseEntry,
          actionText: selectedSpell.actionName,
          targetText: `${selectedSpell.spellName} -> ${targetText}`,
          opcode: NH_OBJECT_SPELL_SELECTED_OPCODE,
          action: "object-spell-selected",
          selectedSpell
        }
      ];
    }
    return [];
  }

  const entries: NhSceneObjectContextMenuEntry<TTile>[] = [
    { actionText: "Walk here", targetText: "", opcode: 23, action: "walk", targetTile: walkTile }
  ];
  const actions = placement.actions ?? [];
  for (let actionIndex = 4; actionIndex >= 0; actionIndex -= 1) {
    const actionText = actions[actionIndex];
    if (!isNhSceneObjectActionText(actionText)) {
      continue;
    }

    entries.push({
      ...baseEntry,
      actionText,
      targetText,
      opcode: NH_OBJECT_ACTION_OPCODES[actionIndex],
      action: "object-action",
      objectActionIndex: actionIndex
    });
  }

  entries.push({
    ...baseEntry,
    actionText: "Examine",
    targetText,
    opcode: NH_OBJECT_EXAMINE_OPCODE,
    action: "object-examine"
  });
  return entries;
}

export function nhSceneObjectCommandPacket(
  entry: NhSceneObjectContextMenuEntry<unknown>
): NhSceneObjectCommandPacket | null {
  if (
    entry.objectId === undefined ||
    entry.objectX === undefined ||
    entry.objectY === undefined ||
    !(entry.opcode in NH_OBJECT_PACKET_IDS_BY_OPCODE)
  ) {
    return null;
  }

  return {
    clientMenuOpcode: entry.opcode,
    serverPacketId: NH_OBJECT_PACKET_IDS_BY_OPCODE[
      entry.opcode as keyof typeof NH_OBJECT_PACKET_IDS_BY_OPCODE
    ],
    serverOption:
      entry.opcode in NH_OBJECT_SERVER_OPTIONS_BY_OPCODE
        ? NH_OBJECT_SERVER_OPTIONS_BY_OPCODE[
            entry.opcode as keyof typeof NH_OBJECT_SERVER_OPTIONS_BY_OPCODE
          ]
        : null,
    objectId: entry.objectId,
    objectX: entry.objectX,
    objectY: entry.objectY,
    selectedItem: entry.selectedItem,
    selectedSpell: entry.selectedSpell
  };
}

export function findNhSceneObjectForWorldTile(
  objects: readonly NhArenaObjectPlacement[],
  tile: NhWorldTile
): NhArenaObjectPlacement | null {
  for (const placement of objects) {
    if (isNhSceneObjectMenuable(placement) && nhSceneObjectContainsWorldTile(placement, tile)) {
      return placement;
    }
  }
  return null;
}

export function nhSceneObjectContainsWorldTile(
  placement: NhArenaObjectPlacement,
  tile: NhWorldTile
): boolean {
  if (placement.plane !== tile.plane) {
    return false;
  }

  const footprint = nhSceneObjectFootprint(placement);
  return (
    tile.x >= placement.x &&
    tile.x < placement.x + footprint.sizeX &&
    tile.y >= placement.y &&
    tile.y < placement.y + footprint.sizeY
  );
}

export function nhSceneObjectTargetText(name: string): string {
  return `${NH_OBJECT_TARGET_COLOR_TAG}${name}`;
}

export function isNhSceneObjectMenuable(placement: NhArenaObjectPlacement): boolean {
  return isNhSceneObjectName(placement.name);
}

function nhSceneObjectFootprint(placement: NhArenaObjectPlacement): { readonly sizeX: number; readonly sizeY: number } {
  const orientation = placement.orientation & 3;
  if (orientation === 1 || orientation === 3) {
    return { sizeX: placement.sizeY, sizeY: placement.sizeX };
  }
  return { sizeX: placement.sizeX, sizeY: placement.sizeY };
}

function isNhSceneObjectActionText(action: string | null | undefined): action is string {
  return typeof action === "string" && action.trim().length > 0 && action.toLowerCase() !== "hidden";
}

function isNhSceneObjectName(name: string): boolean {
  return name.trim().length > 0 && name.toLowerCase() !== "null";
}
