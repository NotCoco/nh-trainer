export interface ToolDescriptor {
  readonly id: string;
  readonly purpose: string;
  readonly command: string;
  readonly status: "implemented" | "planned";
  readonly output: string;
  readonly writesToNh: false;
}

export const toolRegistry: readonly ToolDescriptor[] = [
  {
    id: "verify-source-anchors",
    purpose: "Fail fast if any claimed Nh source snippet disappears or drifts.",
    command: "npm run verify:sources",
    status: "implemented",
    output: "Console report of checked source anchors and missing snippets.",
    writesToNh: false
  },
  {
    id: "report-render-fixtures",
    purpose: "Report which cache-exported fixtures still need to be produced before renderer parity work can be accepted.",
    command: "npm run report:fixtures",
    status: "implemented",
    output: "Console readiness report for asset and render fixture paths.",
    writesToNh: false
  },
  {
    id: "report-animation-fixtures",
    purpose: "Validate exported OSRS frame stores and render sequence fixtures before animation playback work.",
    command: "npm run report:animations",
    status: "implemented",
    output: "Console readiness report for animation frame and sequence fixture integrity.",
    writesToNh: false
  },
  {
    id: "verify-render-smoke",
    purpose: "Launch Electron hidden, load a cache GLB in the Three.js viewport, and check that WebGL draws nonblank pixels.",
    command: "npm run verify:render-smoke",
    status: "implemented",
    output: "Console render-smoke JSON plus a unique C:\\nh-trainer-artifacts\\nh-nh-trainer-render-smoke-*.png.",
    writesToNh: false
  },
  {
    id: "export-server-defs",
    purpose: "Export NH-relevant item bonuses and weapon timing from Nh server data into trainer fixtures.",
    command: "npm run export:server-defs",
    status: "implemented",
    output: "fixtures/assets/defs/server-items.json, equipment-bonuses.json, weapon-types.json, and nh-loadout-items.json.",
    writesToNh: false
  },
  {
    id: "export-cache-assets",
    purpose: "Export Nh cache models, definitions, sprites, sequences, spot animations, and map data into trainer fixtures.",
    command: "gradle ':cache:exportNhNhTrainerAssets' '-x' ':http-api:processResources' '-Dkotlin.compiler.execution.strategy=in-process'",
    status: "implemented",
    output: "fixtures/assets/defs/cache-items.json, kits.json, cache model geometry JSON, and sequence JSON.",
    writesToNh: false
  },
  {
    id: "export-cache-glbs",
    purpose: "Convert selected Nh cache ModelDefinition meshes into GLB artifacts for the Three.js renderer.",
    command: "npm run export:cache-glbs",
    status: "implemented",
    output: "Selected NH gear GLBs and cache-glb-manifest.json under fixtures/assets/models/.",
    writesToNh: false
  },
  {
    id: "capture-client-reference",
    purpose: "Capture Nh client reference frames for player loadouts, projectiles, overheads, and map camera comparison.",
    command: "npm run capture:client -- --source C:\\nh-trainer-artifacts\\nh-client-reference",
    status: "implemented",
    output: "Viewport-cropped Nh client PNGs, optional *.client-view.json traces, and fixtures/reference/client-render/manifest.json.",
    writesToNh: false
  },
  {
    id: "run-parity-check",
    purpose: "Compare trainer render output against captured Nh client frames for the accepted parity gates.",
    command: "npm run verify:render",
    status: "implemented",
    output: "Pixel-diff JSON plus C:\\nh-trainer-artifacts\\nh-render-parity-*-actual.png and *-diff.png.",
    writesToNh: false
  },
  {
    id: "verify-player-composition",
    purpose: "Validate runtime PlayerAppearance-style equipment slots, body colors, and cache model composition.",
    command: "npm run verify:player-composition",
    status: "implemented",
    output: "Console JSON comparing source-composed player models against exported cache GLB metadata.",
    writesToNh: false
  }
];
