import type { EvidenceStatus } from "../assets";

export interface BotIntent {
  readonly id: string;
  readonly label: string;
  readonly evidenceStatus: EvidenceStatus;
  readonly sourceAnchorIds: readonly string[];
  readonly acceptanceGate: string;
}

export const botBoundary = {
  name: "bot",
  status: "policy parser and intent bridge implemented",
  intents: [
    {
      id: "load-trained-policy",
      label: "Load NH policy without remapping observations",
      evidenceStatus: "verified",
      sourceAnchorIds: ["server-nh-policy-bridge-contract", "server-nh-observation-contract"],
      acceptanceGate: "The same 77-input, 4950-action bridge can load the policy artifact used by the live reference server."
    },
    {
      id: "client-visible-observation",
      label: "Train/evaluate from delayed, client-visible state",
      evidenceStatus: "verified",
      sourceAnchorIds: ["server-nh-observation-contract", "server-hit-queue-contract", "server-player-process-order-contract"],
      acceptanceGate: "Reward and action inputs cannot credit instant server-only prayer or damage knowledge before the client could have seen it."
    },
    {
      id: "nh-action-intents",
      label: "Represent NH decisions as explicit gear, attack, prayer, movement, supply, and spec intents",
      evidenceStatus: "verified",
      sourceAnchorIds: ["server-nh-policy-bridge-contract", "server-player-attack-dispatch-contract", "server-food-lock-contract"],
      acceptanceGate: "The standalone trainer can decode policy actions without adding hidden hard-coded behavior."
    },
    {
      id: "policy-artifact-parser",
      label: "Parse NH self-play policy artifacts",
      evidenceStatus: "verified",
      sourceAnchorIds: ["server-nh-policy-bridge-contract"],
      acceptanceGate:
        "Electron can read the local trained TSV and the browser build can parse a user-provided TSV without changing policy semantics."
    }
  ] as const satisfies readonly BotIntent[]
} as const;

export * from "./policy";
