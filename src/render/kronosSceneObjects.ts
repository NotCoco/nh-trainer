import type { KronosInventorySelectedItem } from "./kronosInventory";
import type { KronosMenuEntry } from "./kronosContextMenu";
import type { KronosArenaObjectPlacement, KronosWorldTile } from "./kronosSceneCollision";

export const KRONOS_OBJECT_USE_SELECTED_OPCODE = 1;
export const KRONOS_OBJECT_SPELL_SELECTED_OPCODE = 2;
export const KRONOS_OBJECT_ACTION_OPCODES = [3, 4, 5, 6, 1001] as const;
export const KRONOS_OBJECT_EXAMINE_OPCODE = 1002;
export const KRONOS_OBJECT_TARGET_COLOR_TAG = "<col=00ffff>";
export const KRONOS_OBJECT_PACKET_IDS_BY_OPCODE = {
  1: 46,
  2: 68,
  3: 51,
  4: 6,
  5: 42,
  6: 95,
  1001: 50,
  1002: 36
} as const;
export const KRONOS_OBJECT_SERVER_OPTIONS_BY_OPCODE = {
  3: 1,
  4: 2,
  5: 3,
  6: 4,
  1001: 5,
  1002: 6
} as const;

export type KronosSceneObjectContextAction =
  | "walk"
  | "object-action"
  | "object-use-selected"
  | "object-spell-selected"
  | "object-examine";

export type KronosSceneObjectContextMenuEntry<TTile> = KronosMenuEntry & {
  readonly action: KronosSceneObjectContextAction;
  readonly targetTile: TTile;
  readonly objectPlacement?: KronosArenaObjectPlacement;
  readonly objectId?: number;
  readonly objectName?: string;
  readonly objectX?: number;
  readonly objectY?: number;
  readonly objectActionIndex?: number;
  readonly selectedItem?: KronosInventorySelectedItem;
  readonly selectedSpell?: KronosSelectedSpell;
};

export interface KronosSelectedSpell {
  readonly actionName: string;
  readonly spellName: string;
  readonly flags: number;
  readonly widgetId?: number;
  readonly childId?: number;
  readonly itemId?: number;
  readonly spellId?: string;
  readonly label?: string;
}

export interface KronosSceneObjectMenuTarget<TTile> {
  readonly placement: KronosArenaObjectPlacement;
  readonly walkTile: TTile;
  readonly actionTile: TTile;
  readonly selectedItem?: KronosInventorySelectedItem | null;
  readonly selectedSpell?: KronosSelectedSpell | null;
}

export interface KronosSceneObjectCommandPacket {
  readonly clientMenuOpcode: number;
  readonly serverPacketId: number;
  readonly serverOption: number | null;
  readonly objectId: number;
  readonly objectX: number;
  readonly objectY: number;
  readonly selectedItem?: KronosInventorySelectedItem;
  readonly selectedSpell?: KronosSelectedSpell;
}

const objectSpellTargetFlag = 4;

export function buildKronosSceneObjectContextEntries<TTile>({
  placement,
  walkTile,
  actionTile,
  selectedItem,
  selectedSpell
}: KronosSceneObjectMenuTarget<TTile>): readonly KronosSceneObjectContextMenuEntry<TTile>[] {
  if (!isKronosSceneObjectMenuable(placement)) {
    return [{ actionText: "Walk here", targetText: "", opcode: 23, action: "walk", targetTile: walkTile }];
  }

  const targetText = kronosSceneObjectTargetText(placement.name);
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
        opcode: KRONOS_OBJECT_USE_SELECTED_OPCODE,
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
          opcode: KRONOS_OBJECT_SPELL_SELECTED_OPCODE,
          action: "object-spell-selected",
          selectedSpell
        }
      ];
    }
    return [];
  }

  const entries: KronosSceneObjectContextMenuEntry<TTile>[] = [
    { actionText: "Walk here", targetText: "", opcode: 23, action: "walk", targetTile: walkTile }
  ];
  const actions = placement.actions ?? [];
  for (let actionIndex = 4; actionIndex >= 0; actionIndex -= 1) {
    const actionText = actions[actionIndex];
    if (!isKronosSceneObjectActionText(actionText)) {
      continue;
    }

    entries.push({
      ...baseEntry,
      actionText,
      targetText,
      opcode: KRONOS_OBJECT_ACTION_OPCODES[actionIndex],
      action: "object-action",
      objectActionIndex: actionIndex
    });
  }

  entries.push({
    ...baseEntry,
    actionText: "Examine",
    targetText,
    opcode: KRONOS_OBJECT_EXAMINE_OPCODE,
    action: "object-examine"
  });
  return entries;
}

export function kronosSceneObjectCommandPacket(
  entry: KronosSceneObjectContextMenuEntry<unknown>
): KronosSceneObjectCommandPacket | null {
  if (
    entry.objectId === undefined ||
    entry.objectX === undefined ||
    entry.objectY === undefined ||
    !(entry.opcode in KRONOS_OBJECT_PACKET_IDS_BY_OPCODE)
  ) {
    return null;
  }

  return {
    clientMenuOpcode: entry.opcode,
    serverPacketId: KRONOS_OBJECT_PACKET_IDS_BY_OPCODE[
      entry.opcode as keyof typeof KRONOS_OBJECT_PACKET_IDS_BY_OPCODE
    ],
    serverOption:
      entry.opcode in KRONOS_OBJECT_SERVER_OPTIONS_BY_OPCODE
        ? KRONOS_OBJECT_SERVER_OPTIONS_BY_OPCODE[
            entry.opcode as keyof typeof KRONOS_OBJECT_SERVER_OPTIONS_BY_OPCODE
          ]
        : null,
    objectId: entry.objectId,
    objectX: entry.objectX,
    objectY: entry.objectY,
    selectedItem: entry.selectedItem,
    selectedSpell: entry.selectedSpell
  };
}

export function findKronosSceneObjectForWorldTile(
  objects: readonly KronosArenaObjectPlacement[],
  tile: KronosWorldTile
): KronosArenaObjectPlacement | null {
  for (const placement of objects) {
    if (isKronosSceneObjectMenuable(placement) && kronosSceneObjectContainsWorldTile(placement, tile)) {
      return placement;
    }
  }
  return null;
}

export function kronosSceneObjectContainsWorldTile(
  placement: KronosArenaObjectPlacement,
  tile: KronosWorldTile
): boolean {
  if (placement.plane !== tile.plane) {
    return false;
  }

  const footprint = kronosSceneObjectFootprint(placement);
  return (
    tile.x >= placement.x &&
    tile.x < placement.x + footprint.sizeX &&
    tile.y >= placement.y &&
    tile.y < placement.y + footprint.sizeY
  );
}

export function kronosSceneObjectTargetText(name: string): string {
  return `${KRONOS_OBJECT_TARGET_COLOR_TAG}${name}`;
}

export function isKronosSceneObjectMenuable(placement: KronosArenaObjectPlacement): boolean {
  return isKronosSceneObjectName(placement.name);
}

function kronosSceneObjectFootprint(placement: KronosArenaObjectPlacement): { readonly sizeX: number; readonly sizeY: number } {
  const orientation = placement.orientation & 3;
  if (orientation === 1 || orientation === 3) {
    return { sizeX: placement.sizeY, sizeY: placement.sizeX };
  }
  return { sizeX: placement.sizeX, sizeY: placement.sizeY };
}

function isKronosSceneObjectActionText(action: string | null | undefined): action is string {
  return typeof action === "string" && action.trim().length > 0 && action.toLowerCase() !== "hidden";
}

function isKronosSceneObjectName(name: string): boolean {
  return name.trim().length > 0 && name.toLowerCase() !== "null";
}
