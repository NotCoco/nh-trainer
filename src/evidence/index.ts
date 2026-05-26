import sourceAnchors from "./sourceAnchors.json";

export type EvidenceArea = "assets" | "bot" | "render" | "sim" | "tools";

export interface SourceAnchor {
  readonly id: string;
  readonly area: EvidenceArea;
  readonly title: string;
  readonly sourcePath: string;
  readonly requiredSnippets: readonly string[];
  readonly implementationRule: string;
}

export const evidenceAnchors = sourceAnchors as readonly SourceAnchor[];

export function countAnchorsFor(area: EvidenceArea): number {
  return evidenceAnchors.filter((anchor) => anchor.area === area).length;
}
