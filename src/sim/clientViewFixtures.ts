import type { ClientViewTrace } from "./clientView";

export function createMinimapSemanticClientViewTrace(): ClientViewTrace {
  return {
    schemaVersion: "client-view.v1",
    fixtureId: "generated-minimap-semantics-v1",
    description: "Generated client-view trace with minimap-only map icon, NPC, item, friends-chat player, and hint marker sources.",
    actors: ["self", "opponent"],
    sourceAnchorIds: [
      "client-camera-held-arrow-contract",
      "client-minimap-widget-draw-contract",
      "client-scene-minimap-sprite-build-contract",
      "client-minimap-dot-projection-contract",
      "client-minimap-hint-arrow-contract",
      "cache-minimap-map-dot-sprite-export"
    ],
    ticks: [
      {
        tick: 0,
        camera: { yaw: 512, pitch: 192 },
        minimapState: 0,
        eventIds: [],
        actors: {
          self: {
            actorId: "self",
            tile: { x: 3094, y: 3957, plane: 0 },
            equipment: {},
            animations: { pose: 808 },
            overheadPrayer: "none",
            skullIcon: "none"
          },
          opponent: {
            actorId: "opponent",
            tile: { x: 3098, y: 3957, plane: 0 },
            equipment: {},
            minimapDotKind: "friends-chat",
            animations: { pose: 808 },
            overheadPrayer: "none",
            skullIcon: "none"
          }
        },
        minimapEntities: [
          { id: "npc-source", tile: { x: 3095, y: 3957, plane: 0 }, kind: "npc" },
          { id: "ground-item-source", tile: { x: 3094, y: 3958, plane: 0 }, kind: "item" }
        ],
        minimapMapIcons: [
          { id: "map-icon-source", tile: { x: 3099, y: 3958, plane: 0 }, mapIconId: 0, objectId: 12345 }
        ],
        minimapHints: [{ id: "hint-source", tile: { x: 3098, y: 3957, plane: 0 } }],
        minimapDestination: { tile: { x: 3097, y: 3958, plane: 0 } }
      }
    ],
    events: []
  };
}

export function createDisabledMinimapClientViewTrace(): ClientViewTrace {
  return {
    schemaVersion: "client-view.v1",
    fixtureId: "generated-disabled-minimap-v1",
    description: "Generated client-view trace for Nh minimapState disabled-mask rendering.",
    actors: ["self", "opponent"],
    sourceAnchorIds: [
      "client-camera-held-arrow-contract",
      "client-minimap-widget-draw-contract",
      "client-scene-minimap-sprite-build-contract",
      "client-minimap-dot-projection-contract",
      "client-minimap-hint-arrow-contract",
      "cache-minimap-map-dot-sprite-export"
    ],
    ticks: [
      {
        tick: 0,
        camera: { yaw: 0, pitch: 192 },
        minimapState: 2,
        eventIds: [],
        actors: {
          self: {
            actorId: "self",
            tile: { x: 3094, y: 3957, plane: 0 },
            equipment: {},
            animations: { pose: 808 },
            overheadPrayer: "none",
            skullIcon: "none"
          },
          opponent: {
            actorId: "opponent",
            tile: { x: 3098, y: 3957, plane: 0 },
            equipment: {},
            minimapDotKind: "friends-chat",
            animations: { pose: 808 },
            overheadPrayer: "none",
            skullIcon: "none"
          }
        },
        minimapMapIcons: [
          { id: "disabled-map-icon-source", tile: { x: 3099, y: 3958, plane: 0 }, mapIconId: 0, objectId: 12345 }
        ],
        minimapEntities: [
          { id: "disabled-npc-source", tile: { x: 3095, y: 3957, plane: 0 }, kind: "npc" }
        ],
        minimapHints: [{ id: "disabled-hint-source", tile: { x: 3098, y: 3957, plane: 0 } }],
        minimapDestination: { tile: { x: 3097, y: 3958, plane: 0 } }
      }
    ],
    events: []
  };
}
