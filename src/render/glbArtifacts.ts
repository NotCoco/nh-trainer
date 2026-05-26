export interface RenderGlbArtifact {
  readonly path: string;
  readonly url: string;
  readonly targetIds: readonly string[];
}

interface RenderGlbArtifactTarget {
  readonly id: string;
  readonly requiredArtifacts: readonly string[];
}

function toArtifactUrl(path: string): string {
  const normalizedPath = path.replace(/\\/g, "/");
  const fixturePrefix = "fixtures/";

  if (normalizedPath.startsWith(fixturePrefix)) {
    return normalizedPath.slice(fixturePrefix.length);
  }

  return normalizedPath;
}

export function getRenderGlbArtifacts(
  targets: readonly RenderGlbArtifactTarget[]
): readonly RenderGlbArtifact[] {
  const artifacts = new Map<string, Set<string>>();

  for (const target of targets) {
    for (const artifactPath of target.requiredArtifacts) {
      if (!artifactPath.toLowerCase().endsWith(".glb")) {
        continue;
      }

      const targetIds = artifacts.get(artifactPath) ?? new Set<string>();
      targetIds.add(target.id);
      artifacts.set(artifactPath, targetIds);
    }
  }

  return [...artifacts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, targetIds]) => ({
      path,
      url: toArtifactUrl(path),
      targetIds: [...targetIds].sort()
    }));
}
