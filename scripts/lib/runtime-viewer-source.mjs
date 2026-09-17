import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Existing Java source-parity assertions cover helpers that now live in these modules.
// New behavior checks should import the helpers, rather than assert source spelling.
export function readRuntimeViewerSource() {
  return [
    "RuntimeSceneViewer.tsx",
    "runtimeSetupPresets.ts",
    "runtimePreferences.ts",
    "runtimeMovement.ts",
    "runtimeCombatState.ts"
  ].map((file) => readFileSync(fileURLToPath(new URL(`../../src/ui/${file}`, import.meta.url)), "utf8")).join("\n");
}
