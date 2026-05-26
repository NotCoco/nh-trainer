import type { EvidenceStatus } from "../assets";

export interface VerifiedMechanicContract {
  readonly id: string;
  readonly label: string;
  readonly evidenceStatus: EvidenceStatus;
  readonly sourceAnchorIds: readonly string[];
  readonly modulePath: string;
  readonly implementationRule: string;
  readonly acceptanceGate: string;
}

export const mechanicContracts: readonly VerifiedMechanicContract[] = [
  {
    id: "tick-order",
    label: "Server tick order",
    evidenceStatus: "verified",
    sourceAnchorIds: [
      "server-tick-config-contract",
      "server-core-worker-contract",
      "server-player-process-order-contract"
    ],
    modulePath: "src/sim/engine/tick.ts",
    implementationRule: "Model the per-tick order before adding combat shortcuts.",
    acceptanceGate: "Game events, player process, NPC process, object process, and per-player combat/movement/prayer/stat ordering match the reference server."
  },
  {
    id: "delayed-hits",
    label: "Queued hits and client delay",
    evidenceStatus: "verified",
    sourceAnchorIds: ["server-hit-queue-contract", "server-hit-resolution-contract"],
    modulePath: "src/sim/engine/events.ts",
    implementationRule: "Damage, XP drops, and visual hit timing must be separate events.",
    acceptanceGate: "A hit can be queued, defended, visually delayed, and resolved without being confused with same-tick healing."
  },
  {
    id: "movement-reach",
    label: "Movement, reach, and line of sight",
    evidenceStatus: "verified",
    sourceAnchorIds: [
      "server-movement-step-contract",
      "server-route-reach-contract",
      "server-projectile-route-contract",
      "server-nh-melee-reach-contract"
    ],
    modulePath: "src/sim/world/movement.ts",
    implementationRule: "Reach must account for same tile, diagonal freeze failure, cardinal melee, step-in melee, and projectile LOS.",
    acceptanceGate: "A frozen actor cannot melee diagonal, an unfrozen actor can step into valid melee, and under-tile cases match the NH bot contract."
  },
  {
    id: "freeze-locks",
    label: "Freeze and movement locks",
    evidenceStatus: "verified",
    sourceAnchorIds: ["server-freeze-contract", "server-movement-lock-contract", "server-ice-barrage-contract"],
    modulePath: "src/sim/entity/locks.ts",
    implementationRule: "Freeze must block movement through the same entity lock checks used by the reference server.",
    acceptanceGate: "Barrage/blitz freezes apply only through successful magic hits and obey immunity/root movement blocking."
  },
  {
    id: "attack-dispatch",
    label: "Attack style dispatch and weapon timing",
    evidenceStatus: "verified",
    sourceAnchorIds: [
      "server-attack-delay-contract",
      "server-player-attack-dispatch-contract",
      "server-ranged-attack-contract",
      "server-combat-formula-contract",
      "server-hit-chance-contract",
      "server-weapon-type-contract"
    ],
    modulePath: "src/sim/combat/player-combat.ts",
    implementationRule: "The simulator must dispatch mage, range, melee, and Gmaul through reference attack delays and reach checks.",
    acceptanceGate: "Weapon ticks, attack distance, rapid style reduction, accuracy, defence, and max hit all come from reference contracts."
  },
  {
    id: "prayer-damage",
    label: "Prayer activation and PvP damage reduction",
    evidenceStatus: "verified",
    sourceAnchorIds: [
      "server-prayer-definition-contract",
      "server-player-prayer-contract",
      "server-prayer-damage-reduction-contract"
    ],
    modulePath: "src/sim/prayer/prayers.ts",
    implementationRule: "Prayer state must be explicit, delayed to the bot's client-visible observation layer, and used in damage reduction only when it would be active in the reference server.",
    acceptanceGate: "Protection prayers reduce PvP damage to the reference value and offensive prayers alter the same stat formulas."
  },
  {
    id: "supplies",
    label: "Food, karambwan, potion, brew, and restore locks",
    evidenceStatus: "verified",
    sourceAnchorIds: ["server-food-lock-contract", "server-brew-contract", "server-restore-contract"],
    modulePath: "src/sim/items/consumables.ts",
    implementationRule: "Food, karambwan, brew, restore, and potion actions must expose separate locks and stat effects.",
    acceptanceGate: "Brews can heal while preserving potion-style attack windows where the reference server allows it, while food/karambwan attack locks remain distinct."
  },
  {
    id: "gmaul-special",
    label: "Granite maul queue and spec energy",
    evidenceStatus: "verified",
    sourceAnchorIds: ["server-granite-maul-definition-contract", "server-granite-maul-contract"],
    modulePath: "src/sim/combat/gmaul.ts",
    implementationRule: "Gmaul special must use the queue, one-tick auto-attack path, timeout, and 50 percent energy cost.",
    acceptanceGate: "A spec from a weapon without a visible spec bar cannot silently become an impossible same-tick Gmaul."
  },
  {
    id: "nh-policy-bridge",
    label: "NH observation and action bridge",
    evidenceStatus: "verified",
    sourceAnchorIds: [
      "server-nh-bot-loop-contract",
      "server-nh-policy-bridge-contract",
      "server-nh-observation-contract",
      "server-nh-reward-contract"
    ],
    modulePath: "src/sim/nh/policy-bridge.ts",
    implementationRule: "The standalone trainer must preserve the 77-feature observation and 4950-action policy interface or explicitly version the bridge.",
    acceptanceGate: "A trained NH policy can be loaded and evaluated by the trainer without changing observation/action meaning."
  }
];

export * from "./engine/events";
export * from "./engine/itemActionQueue";
export * from "./engine/tick";
export * from "./world/movement";
export * from "./entity/locks";
export * from "./combat/formulas";
export * from "./combat/player-combat";
export * from "./combat/timers";
export * from "./combat/gmaul";
export * from "./equipment/equipment";
export * from "./prayer/prayers";
export * from "./items/consumables";
export * from "./nh/policy-bridge";
export * from "./nh/policy-features";
export * from "./nh/runtime-policy-opponent";
export * from "./nh/loadouts";
export * from "./nh/duel";
export * from "./runtimePlayerCombat";
export * from "./clientView";
export * from "./clientViewFixtures";
