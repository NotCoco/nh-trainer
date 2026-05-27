import type { EvidenceStatus } from "../assets";

export interface RenderParityTarget {
  readonly id: string;
  readonly label: string;
  readonly evidenceStatus: EvidenceStatus;
  readonly sourceAnchorIds: readonly string[];
  readonly requiredArtifacts: readonly string[];
  readonly acceptanceGate: string;
}

export const renderWorkbench = {
  title: "renderer parity workbench",
  targets: [
    {
      id: "player-loadout-model",
      label: "Cache-composed player loadout model",
      evidenceStatus: "unverified",
      sourceAnchorIds: [
        "client-player-appearance-packet",
        "client-player-model-assembly",
        "client-model-geometry-contract"
      ],
      requiredArtifacts: [
        "fixtures/render/player-loadouts/kodai-robes.glb",
        "fixtures/render/player-loadouts/acb-hides.glb",
        "fixtures/render/player-loadouts/tentacle-bandos.glb",
        "fixtures/render/player-loadouts/ags-bandos.glb",
        "fixtures/render/player-loadouts/gmaul-bandos.glb",
        "fixtures/render/player-loadouts/kodai-robes.mesh.json",
        "fixtures/render/player-loadouts/acb-hides.mesh.json",
        "fixtures/render/player-loadouts/tentacle-bandos.mesh.json",
        "fixtures/render/player-loadouts/ags-bandos.mesh.json",
        "fixtures/render/player-loadouts/gmaul-bandos.mesh.json"
      ],
      acceptanceGate: "A real player mesh changes helmet, body, legs, cape, weapon, shield, and body colors from a Nh appearance packet and sequence override path."
    },
    {
      id: "player-animation-playback",
      label: "OSRS sequence/frame animation playback",
      evidenceStatus: "unverified",
      sourceAnchorIds: ["client-sequence-frame-contract"],
      requiredArtifacts: [
        "fixtures/render/sequences/idle.json",
        "fixtures/render/sequences/walk.json",
        "fixtures/render/sequences/whip_attack.json",
        "fixtures/render/sequences/godsword_attack.json",
        "fixtures/render/sequences/ags_special.json",
        "fixtures/render/sequences/gmaul_special.json",
        "fixtures/render/sequences/crossbow_attack.json",
        "fixtures/render/sequences/blitz_cast.json",
        "fixtures/render/sequences/barrage_cast.json",
        "fixtures/render/player-loadouts/kodai-robes.mesh.json",
        "fixtures/render/player-loadouts/acb-hides.mesh.json",
        "fixtures/render/player-loadouts/tentacle-bandos.mesh.json",
        "fixtures/render/player-loadouts/ags-bandos.mesh.json",
        "fixtures/render/player-loadouts/gmaul-bandos.mesh.json"
      ],
      acceptanceGate: "Frame lengths, label transforms, dual sequence application, and loadout vertex-group bindings match the Nh client for idle, walk, attack, and spell casts."
    },
    {
      id: "spotanim-projectile-layer",
      label: "Spot animations and projectile layer",
      evidenceStatus: "unverified",
      sourceAnchorIds: [
        "client-projectile-motion-contract",
        "client-projectile-packet-lifecycle",
        "server-projectile-payload-contract",
        "server-targetspell-contract",
        "server-ice-barrage-contract"
      ],
      requiredArtifacts: [
        "fixtures/assets/defs/spotanims.json",
        "fixtures/assets/defs/projectiles.json",
        "fixtures/assets/models/cache-glb-manifest.json",
        "fixtures/render/spotanims/ice_barrage_projectile.glb",
        "fixtures/render/spotanims/ice_barrage_hit.glb",
        "fixtures/render/spotanims/blood_barrage_hit.glb",
        "fixtures/render/spotanims/ice_blitz_cast.glb",
        "fixtures/render/spotanims/ice_blitz_hit.glb",
        "fixtures/render/spotanims/blood_blitz_projectile.glb",
        "fixtures/render/spotanims/blood_blitz_hit.glb",
        "fixtures/render/spotanims/acb_special_projectile.glb",
        "fixtures/render/spotanims/bolt_projectile.glb",
        "fixtures/render/spotanims/dragon_bolt_projectile.glb",
        "fixtures/render/spotanims/ags_special.glb",
        "fixtures/render/spotanims/gmaul_special.glb",
        "fixtures/render/projectiles/ice_barrage_projectile.json"
      ],
      acceptanceGate: "Barrage, Blitz, ACB, standard bolt, dragon bolt, and Gmaul visuals use Nh ids, start/end heights, delay, duration, curve, yaw, pitch, frame timing, and packet lifecycle semantics."
    },
    {
      id: "actor-overlay-sprites",
      label: "Actor 2D overlays",
      evidenceStatus: "unverified",
      sourceAnchorIds: [
        "client-player-appearance-packet",
        "client-actor-overlay-symbol-map",
        "client-sprite-draw-at-symbol-map",
        "client-world-to-viewport-symbol-map",
        "client-project-actor-symbol-map",
        "client-head-icon-index-contract",
        "cache-overhead-icon-export-contract",
        "client-hitsplat-packet-contract",
        "client-hitsplat-definition-contract",
        "client-hitsplat-draw-contract",
        "cache-hitsplat-definition-export-contract",
        "client-healthbar-definition-contract",
        "client-healthbar-update-contract",
        "client-healthbar-draw-contract",
        "cache-healthbar-definition-export-contract"
      ],
      requiredArtifacts: [
        "fixtures/render/sprites/prayer_overheads.png",
        "fixtures/render/sprites/prayer_overheads.json",
        "fixtures/render/sprites/pk_skull.png",
        "fixtures/render/sprites/pk_skull.json",
        "fixtures/assets/defs/overhead-icons.json",
        "fixtures/render/sprites/hitsplats.png",
        "fixtures/render/sprites/hitsplats.json",
        "fixtures/render/sprites/hitsplat_digits.png",
        "fixtures/render/sprites/hitsplat_digits.json",
        "fixtures/assets/defs/hitsplats.json",
        "fixtures/assets/defs/healthbars.json",
        "fixtures/render/sprites/health_bars.png",
        "fixtures/render/sprites/health_bars.json"
      ],
      acceptanceGate: "Prayer/skull/hitsplat/digit/health-bar sprites are cache-exported, atlas-indexed, and projected through Nh actor overlay and viewport math in client order."
    },
    {
      id: "inferno-scene-camera",
      label: "Inferno terrain and fixed camera",
      evidenceStatus: "unverified",
      sourceAnchorIds: [
        "client-model-geometry-contract",
        "client-scene-tile-container-contract",
        "client-tile-paint-contract",
        "client-tile-model-contract",
        "client-scene-tile-draw-contract",
        "cache-client-widget-layout-export",
        "client-fixed-side-tab-widget-contract",
        "client-interface-tab-order-contract",
        "client-fixed-viewport-render-contract",
        "client-viewport-resize-contract",
        "client-camera-orbit-contract"
      ],
      requiredArtifacts: [
        "fixtures/render/maps/inferno_arena.glb",
        "fixtures/render/maps/inferno_arena.json",
        "fixtures/render/maps/inferno_arena_objects.glb",
        "fixtures/render/maps/inferno_arena_objects.json",
        "fixtures/assets/defs/client-widgets.json",
        "fixtures/assets/defs/textures.json",
        "fixtures/assets/defs/floors.json",
        "fixtures/render/textures/texture_1.png",
        "fixtures/render/textures/texture_8.png",
        "fixtures/render/textures/texture_60.png"
      ],
      acceptanceGate: "The workbench can reproduce an OSRS-like camera inside the fixed-mode 1337 viewport over real cache terrain, tile paint/model geometry, and placed object geometry, with no hand-drawn arena."
    }
  ] satisfies readonly RenderParityTarget[]
} as const;
