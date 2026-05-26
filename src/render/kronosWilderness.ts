import type { KronosWorldTile } from "./kronosSceneCollision";

interface KronosBounds {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
  readonly plane: number;
}

interface KronosCombatTileOptions {
  readonly pvpAttackZone?: boolean;
  readonly pvpInstancePosition?: boolean;
  readonly safePvpInstance?: boolean;
}

const anyPlane = -1;

// Source: Wilderness.MAIN_WILDERNESS / GWD_WILDERNESS / UNDERGROUND_WILDERNESS.
const mainWilderness: KronosBounds = { west: 2944, south: 3525, east: 3391, north: 4351, plane: anyPlane };
const godWarsWilderness: KronosBounds = { west: 3008, south: 10112, east: 3071, north: 10175, plane: anyPlane };
const undergroundWilderness: KronosBounds = { west: 2944, south: 9920, east: 3391, north: 10879, plane: anyPlane };
const trollheimShortcutSafe: KronosBounds = { west: 2941, south: 3676, east: 2947, north: 3681, plane: anyPlane };

// Source: Wilderness.EDGEVILLE_SAFE_AREAS.
const edgevilleSafeAreas: readonly KronosBounds[] = [
  { west: 2998, south: 3525, east: 3026, north: 3536, plane: anyPlane },
  { west: 3005, south: 3537, east: 3023, north: 3545, plane: anyPlane },
  { west: 3024, south: 3537, east: 3026, north: 3542, plane: anyPlane },
  { west: 3027, south: 3525, east: 3032, north: 3530, plane: anyPlane },
  { west: 3003, south: 3537, east: 3004, north: 3538, plane: anyPlane },
  { west: 2997, south: 3525, east: 2997, north: 3525, plane: 0 }
];

export function kronosWildernessLevelForWorldTile(tile: KronosWorldTile): number {
  for (const safeArea of edgevilleSafeAreas) {
    if (inKronosBounds(tile, safeArea)) {
      return 0;
    }
  }
  if (inKronosBounds(tile, trollheimShortcutSafe)) {
    return 0;
  }
  if (inKronosBounds(tile, mainWilderness)) {
    return Math.max(1, Math.trunc((tile.y - 3520) / 8) + 1);
  }
  if (inKronosBounds(tile, godWarsWilderness)) {
    return Math.trunc((tile.y - 9920) / 8) - 1;
  }
  if (inKronosBounds(tile, undergroundWilderness)) {
    return Math.trunc((tile.y - 9920) / 8) + 1;
  }
  return 0;
}

export function kronosNhBotCombatTileAllowed(
  tile: KronosWorldTile,
  options: KronosCombatTileOptions = {}
): boolean {
  // Source: NhStakerBot.isCombatTileAllowed().
  if (options.pvpInstancePosition) {
    return options.safePvpInstance !== true;
  }
  if (options.pvpAttackZone) {
    return true;
  }
  return kronosWildernessLevelForWorldTile(tile) > 0;
}

function inKronosBounds(tile: KronosWorldTile, bounds: KronosBounds): boolean {
  return (
    (bounds.plane === anyPlane || tile.plane === bounds.plane) &&
    tile.x >= bounds.west &&
    tile.x <= bounds.east &&
    tile.y >= bounds.south &&
    tile.y <= bounds.north
  );
}
