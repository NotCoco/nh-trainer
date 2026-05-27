export type RenderTodoGateId =
  | "player-composition"
  | "sequence-playback"
  | "projectile-motion"
  | "fixed-client-viewport"
  | "tile-movement-pathing"
  | "context-menu"
  | "inventory-item-sprites"
  | "minimap"
  | "overlay-projection"
  | "arena-terrain";

export interface RenderTodoGate {
  readonly id: RenderTodoGateId;
  readonly label: string;
  readonly sourceAnchorIds: readonly string[];
  readonly blocks: readonly string[];
}

export const renderTodoGates = [
  {
    id: "player-composition",
    label: "Parity gate: compose arbitrary player models from cache-backed appearance packets",
    sourceAnchorIds: [
      "client-player-appearance-packet",
      "client-player-model-assembly",
      "client-model-geometry-contract"
    ],
    blocks: [
      "Do not draw actors until all twelve equipment slots and five body colors are exported.",
      "Do not substitute primitive geometry for missing kit or item model parts.",
      "Collect captured client-view traces with raw live appearance packet bytes before accepting full player-model parity."
    ]
  },
  {
    id: "sequence-playback",
    label: "Parity gate: play OSRS sequence frames from exported frame maps",
    sourceAnchorIds: [
      "client-sequence-frame-contract",
      "client-dual-sequence-application-contract",
      "client-model-interleaved-transform-contract",
      "client-actor-sequence-selection-contract",
      "client-actor-sequence-cycle-contract",
      "cache-render-sequence-interleave-export-contract"
    ],
    blocks: [
      "Do not invent skeletal animation timing.",
      "Use frameIds, frameLengths, frame-map label transforms, and interleave labels from the cache export.",
      "Keep idle, walk, attack, cast, primary-action termination, movement-loop acceptance, and dual primary+movement playback tied to exported sequence fixtures."
    ]
  },
  {
    id: "projectile-motion",
    label: "Parity gate: drive projectile visuals from Nh payload and client motion math",
    sourceAnchorIds: [
      "client-projectile-motion-contract",
      "client-spotanim-sequence-contract",
      "client-model-alpha-transform-contract",
      "client-projectile-packet-lifecycle",
      "cache-model-face-alpha-group-export-contract",
      "server-projectile-payload-contract",
      "server-targetspell-contract",
      "server-ice-barrage-contract"
    ],
    blocks: [
      "Compare sampled x, y, z, yaw, and pitch against captured Nh client frames before marking full parity.",
      "Keep gfx id, tiles, target index, heights, delay, duration, curve, offset, yaw, and pitch flowing from server payload fixtures.",
      "Resolve projectile and actor gfx ids through exported spotanim sequence definitions before animating effect meshes.",
      "Accept barrage only after cast, projectile, hit gfx, skip-travel, and client-delay timing agree with fixtures."
    ]
  },
  {
    id: "fixed-client-viewport",
    label: "Parity gate: render and click through the fixed-mode game viewport widget",
    sourceAnchorIds: [
      "cache-client-widget-layout-export",
      "client-widget-resize-layout-contract",
      "client-widget-position-layout-contract",
      "client-chatbox-widget-contract",
      "client-chatbox-sprite-contract",
      "client-fixed-side-tab-widget-contract",
      "client-interface-tab-order-contract",
      "server-fixed-display-tab-mapping-contract",
      "client-combat-widget-contract",
      "client-combat-specbar-redraw-contract",
      "server-combat-tab-state-contract",
      "server-combat-level-widget-contract",
      "server-combat-varp-contract",
      "client-attack-style-label-contract",
      "client-skills-widget-contract",
      "server-stats-tab-widget-contract",
      "client-skill-level-array-contract",
      "client-enabled-skills-contract",
      "client-skill-sprite-contract",
      "client-equipment-widget-slot-contract",
      "server-equipment-slot-index-contract",
      "server-equipment-tab-item-action-contract",
      "server-equipment-unequip-mutation-contract",
      "client-prayer-widget-order-contract",
      "client-prayer-icon-sprite-contract",
      "client-spellbook-redraw-layout-contract",
      "client-ancient-spellbook-widget-contract",
      "client-spell-icon-sprite-contract",
      "client-spell-selection-contract",
      "client-fixed-viewport-render-contract",
      "client-viewport-resize-contract",
      "client-camera-orbit-contract"
    ],
    blocks: [
      "Do not render the 3D scene across the whole browser canvas.",
      "Resolve the fixed viewport from InterfaceDefinition group 548 and content type 1337.",
      "Keep fixed chatbox hitboxes, labels, sprites, and default widget actions tied to group 162 child widgets.",
      "Keep fixed side-tab hitboxes and inventory mounting tied to group 548 tab child widgets.",
      "Keep side-panel mounted tab contents tied to the client InterfaceTab order and exported widget groups.",
      "Keep the fixed side-panel tab-to-interface mapping aligned with Nh DisplayHandler default-frame sends.",
      "Render combat tab group 593 weapon name, combat level, attack-style labels, special bar, and attack-set/auto-retaliate/special button clicks from exported widget geometry, runtime HUD weaponTypeConfig, Nh server WeaponType metadata, fixed-level combat formula, combat varp ids, and SpecbarRedraw active/drain behavior.",
      "Render stats tab group 320 skill icons, level text, total level, and skill-guide clicks from Nh TabStats child mappings, SpriteID constants, CS1 current/fixed/total-level operands, and runtime current/fixed skill snapshots before accepting full stats-tab coverage.",
      "Render equipment tab item sprites inside group 387 child widgets using Nh server equipSlot values and keep worn-item Remove mutation plus utility-button hitboxes/actions tied to group 387 widgets.",
      "Render prayer tab icons inside group 541 widgets using RuneLite prayer order, grid spacing, cache sprite ids, and PlayerPrayer.toggle varpbit/disallowed-group active state.",
      "Render magic tab spell icons from cache enums 1982-1985, MagicSpellBookRedraw spacing, spell null-item sprite params, and widget click-mask/target-flag selected-spell state.",
      "Route tile clicks through the same resolved viewport rectangle used by the camera."
    ]
  },
  {
    id: "tile-movement-pathing",
    label: "Parity gate: route tile clicks through Nh collision and pathing masks",
    sourceAnchorIds: [
      "client-route-finder-bfs-contract",
      "server-route-mask-contract",
      "server-object-cliputils-contract",
      "client-object-collision-placement-contract",
      "server-object-route-contract",
      "server-object-reach-contract",
      "server-movement-step-contract"
    ],
    blocks: [
      "Do not route movement through hand-picked blocked tile sets.",
      "Build movement clipping from exported object placements and Nh object mask rules.",
      "Use the client/server BFS masks, fallback behavior, and object-footprint reach checks before accepting tile/object-click movement."
    ]
  },
  {
    id: "context-menu",
    label: "Parity gate: render right-click menus with Nh menu array semantics",
    sourceAnchorIds: [
      "client-context-menu-contract",
      "client-context-menu-sizing-contract",
      "client-player-context-menu-contract",
      "client-player-menu-opcode-contract",
      "client-selected-player-target-packet-contract",
      "server-player-action-packet-contract",
      "server-player-default-actions-contract",
      "server-wilderness-attack-action-contract",
      "cache-object-action-export-contract",
      "client-scene-object-menu-contract",
      "client-selected-spell-object-menu-contract",
      "client-scene-object-packet-contract",
      "server-object-action-packet-contract",
      "server-interface-on-object-packet-contract"
    ],
    blocks: [
      "Do not invent player menu actions beyond the source-backed action list.",
      "Draw and left-click dispatch options from the same sorted client menu array order.",
      "Build player selected-item/spell rows and object action, selected-item object, and selected-spell object entries from source menu opcodes, widget target flags, and Nh packet ids/options.",
      "Resolve menu width, height, hover rows, and clamping from the client context menu path."
    ]
  },
  {
    id: "inventory-item-sprites",
    label: "Parity gate: complete inventory widget mutation and quantity rendering",
    sourceAnchorIds: [
      "client-inventory-slot-layout-contract",
      "server-equipment-equip-container-contract",
      "server-consumable-inventory-mutation-contract",
      "client-container-widget-update-contract",
      "client-inventory-widget-item-draw-contract",
      "client-inventory-selected-item-sprite-contract",
      "client-inventory-item-menu-contract",
      "client-inventory-use-selection-contract",
      "client-inventory-use-target-menu-contract",
      "client-inventory-selection-clear-after-action-contract",
      "client-inventory-item-action-opcode-contract",
      "client-inventory-item-sprite-contract",
      "cache-inventory-dose-sprite-export-contract"
    ],
    blocks: [
      "Keep inventory rendering sourced from widget itemIds and itemQuantities, including capture-bridge client-view slots, rather than fixed UI-only slots.",
      "Keep Use selection, capture-bridge selectedItem state, and item-on-item target dispatch tied to the client selectedItem slot/widget state.",
      "Clear selected inventory source slots after ordinary runtime commands so the selected-item highlight follows the client action lifecycle.",
      "Keep stack text, count-object sprite variants, and remaining inventory action dispatch tied to source itemQuantity semantics before accepting full inventory parity."
    ]
  },
  {
    id: "minimap",
    label: "Parity gate: render the minimap through client mask, state, scene sprite, and map-dot semantics",
    sourceAnchorIds: [
      "client-minimap-widget-draw-contract",
      "client-scene-minimap-sprite-build-contract",
      "client-scene-minimap-draw-tile-contract",
      "client-scene-minimap-object-stroke-contract",
      "client-minimap-dot-projection-contract",
      "client-minimap-hint-arrow-contract",
      "client-minimap-click-contract",
      "client-minimap-sprite-mask-row-contract",
      "client-sprite-mask-hit-test-contract",
      "client-minimap-default-sprite-load-contract",
      "cache-minimap-map-dot-sprite-export",
      "cache-sprite-mask-row-export",
      "cache-arena-object-minimap-metadata-export"
    ],
    blocks: [
      "Do not treat the fixed minimap frame as minimap parity by itself.",
      "Project map icons, NPCs, players, hints, and destination markers through the client SpriteMask and camAngleY math.",
      "Keep minimapState disabled-mask rendering and click gating tied to the client widget draw and minimap-click paths.",
      "Compare the client-palette sceneMinimapSprite and capture-bridge camera/minimapState/map-icon/ground-item/NPC/player/hint/destination feeds against live reference frames before accepting full minimap raster parity."
    ]
  },
  {
    id: "overlay-projection",
    label: "Parity gate: project actor overlays with cache-exported sprites in client order",
    sourceAnchorIds: [
      "client-player-appearance-packet",
      "client-actor-overlay-symbol-map",
      "client-head-icon-index-contract",
      "cache-overhead-icon-export-contract",
      "client-sprite-draw-at-symbol-map",
      "client-world-to-viewport-symbol-map",
      "client-project-actor-symbol-map",
      "client-hitsplat-packet-contract",
      "client-hitsplat-definition-contract",
      "client-hitsplat-transform-contract",
      "client-hitsplat-draw-contract",
      "client-actor-default-height-contract",
      "client-player-model-height-contract",
      "cache-hitsplat-definition-export-contract",
      "client-healthbar-definition-contract",
      "client-healthbar-update-contract",
      "client-healthbar-draw-contract",
      "cache-healthbar-definition-export-contract",
      "client-viewport-resize-contract"
    ],
    blocks: [
      "Do not draw text or placeholder icons for prayer, skull, hitsplat, or health-bar overlays.",
      "Use sprite ids from exported cache sheets.",
      "Keep actor overlay anchors tied to Actor.defaultHeight/model height, finish transformed/custom-font hitsplat behavior when source data is present, and complete live-client reference-frame comparison before accepting full overlay parity."
    ]
  },
  {
    id: "arena-terrain",
    label: "Parity gate: render tile paint/model terrain and placed objects from client scene data",
    sourceAnchorIds: [
      "client-scene-tile-container-contract",
      "client-tile-paint-contract",
      "client-tile-model-contract",
      "client-scene-tile-draw-contract",
      "cache-texture-image-export-contract",
      "client-object-placement-height-contract",
      "client-object-contour-ground-contract",
      "cache-object-render-lighting-fields",
      "client-object-lighting-contract",
      "client-modeldata-lighting-contract",
      "client-floor-decoration-layer-contract",
      "client-object-model-transform-contract",
      "client-modeldata-object-rotation-contract"
    ],
    blocks: [
      "Do not mark terrain parity from a nonblank GLB alone.",
      "Keep TilePaint and TileModel terrain tied to cache colors, texture ids, shaped faces, and source-style per-corner lightness.",
      "Keep placed object transforms, floor-decoration layering, contoured-ground handling, and ModelData ambient/contrast lighting tied to the client scene/object draw path.",
      "Collect live-client reference frames before accepting full terrain/object parity."
    ]
  }
] satisfies readonly RenderTodoGate[];
