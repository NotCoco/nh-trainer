export interface RenderFixtureManifestEntry {
  readonly path: string;
  readonly targetIds: readonly string[];
  readonly sourceAnchorIds: readonly string[];
}

export interface RenderFixtureTarget {
  readonly id: string;
  readonly sourceAnchorIds: readonly string[];
  readonly requiredArtifacts: readonly string[];
}

export interface RenderFixtureManifest {
  readonly entries: readonly RenderFixtureManifestEntry[];
  readonly targetCount: number;
  readonly artifactCount: number;
}

export interface RenderFixtureStatus extends RenderFixtureManifestEntry {
  readonly status: "present" | "missing";
}

export interface RenderFixtureCheck {
  readonly presentCount: number;
  readonly missingCount: number;
  readonly artifacts: readonly RenderFixtureStatus[];
}

export type RenderFixturePresence = Readonly<Record<string, boolean>>;

export function createRenderFixtureManifest(
  targets: readonly RenderFixtureTarget[]
): RenderFixtureManifest {
  const artifactTargets = new Map<
    string,
    { targetIds: Set<string>; sourceAnchorIds: Set<string> }
  >();

  for (const target of targets) {
    for (const artifactPath of target.requiredArtifacts) {
      const entry = artifactTargets.get(artifactPath) ?? {
        targetIds: new Set<string>(),
        sourceAnchorIds: new Set<string>()
      };

      entry.targetIds.add(target.id);
      for (const anchorId of target.sourceAnchorIds) {
        entry.sourceAnchorIds.add(anchorId);
      }

      artifactTargets.set(artifactPath, entry);
    }
  }

  const entries = [...artifactTargets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, entry]) => ({
      path,
      targetIds: [...entry.targetIds].sort(),
      sourceAnchorIds: [...entry.sourceAnchorIds].sort()
    }));

  return {
    entries,
    targetCount: targets.length,
    artifactCount: entries.length
  };
}

export function checkRenderFixtureManifest(
  manifest: RenderFixtureManifest,
  presence: RenderFixturePresence
): RenderFixtureCheck {
  const artifacts: RenderFixtureStatus[] = manifest.entries.map((entry) => {
    const status: RenderFixtureStatus["status"] =
      presence[entry.path] === true ? "present" : "missing";

    return {
      ...entry,
      status
    };
  });

  const presentCount = artifacts.filter((artifact) => artifact.status === "present").length;

  return {
    presentCount,
    missingCount: artifacts.length - presentCount,
    artifacts
  };
}
