export interface ToolDescriptor {
  readonly id: string;
  readonly purpose: string;
  readonly command: string;
  readonly status: "implemented" | "planned";
  readonly output: string;
  readonly writesToKronos: false;
}

export const toolRegistry: readonly ToolDescriptor[] = [
  {
    id: "verify-source-anchors",
    purpose: "Fail fast if any claimed Kronos source snippet disappears or drifts.",
    command: "npm run verify:sources",
    status: "implemented",
    output: "Console report of checked source anchors and missing snippets.",
    writesToKronos: false
  },
  {
    id: "report-render-fixtures",
    purpose: "Report which cache-exported fixtures still need to be produced before renderer parity work can be accepted.",
    command: "npm run report:fixtures",
    status: "implemented",
    output: "Console readiness report for asset and render fixture paths.",
    writesToKronos: false
  },
  {
    id: "report-animation-fixtures",
    purpose: "Validate exported OSRS frame stores and render sequence fixtures before animation playback work.",
    command: "npm run report:animations",
    status: "implemented",
    output: "Console readiness report for animation frame and sequence fixture integrity.",
    writesToKronos: false
  },
  {
    id: "verify-render-smoke",
    purpose: "Launch Electron hidden, load a cache GLB in the Three.js viewport, and check that WebGL draws nonblank pixels.",
    command: "npm run verify:render-smoke",
    status: "implemented",
    output: "Console render-smoke JSON plus a unique C:\\codeximg\\kronos-nh-trainer-render-smoke-*.png.",
    writesToKronos: false
  },
  {
    id: "export-server-defs",
    purpose: "Export NH-relevant item bonuses and weapon timing from Kronos server data into trainer fixtures.",
    command: "npm run export:server-defs",
    status: "implemented",
    output: "fixtures/assets/defs/server-items.json, equipment-bonuses.json, weapon-types.json, and nh-loadout-items.json.",
    writesToKronos: false
  },
  {
    id: "export-cache-assets",
    purpose: "Export Kronos cache models, definitions, sprites, sequences, spot animations, and map data into trainer fixtures.",
    command: "gradle ':cache:exportKronosNhTrainerAssets' '-x' ':http-api:processResources' '-Dkotlin.compiler.execution.strategy=in-process'",
    status: "implemented",
    output: "fixtures/assets/defs/cache-items.json, kits.json, cache model geometry JSON, and sequence JSON.",
    writesToKronos: false
  },
  {
    id: "export-cache-glbs",
    purpose: "Convert selected Kronos cache ModelDefinition meshes into GLB artifacts for the Three.js renderer.",
    command: "npm run export:cache-glbs",
    status: "implemented",
    output: "Selected NH gear GLBs and cache-glb-manifest.json under fixtures/assets/models/.",
    writesToKronos: false
  },
  {
    id: "capture-client-reference",
    purpose: "Capture Kronos client reference frames for player loadouts, projectiles, overheads, and map camera comparison.",
    command: "npm run capture:client -- --source C:\\codeximg\\kronos-client-reference",
    status: "implemented",
    output: "Viewport-cropped Kronos client PNGs, optional *.client-view.json traces, and fixtures/reference/client-render/manifest.json.",
    writesToKronos: false
  },
  {
    id: "run-parity-check",
    purpose: "Compare trainer render output against captured Kronos client frames for the accepted parity gates.",
    command: "npm run verify:render",
    status: "implemented",
    output: "Pixel-diff JSON plus C:\\codeximg\\kronos-render-parity-*-actual.png and *-diff.png.",
    writesToKronos: false
  },
  {
    id: "verify-player-composition",
    purpose: "Validate runtime PlayerAppearance-style equipment slots, body colors, and cache model composition.",
    command: "npm run verify:player-composition",
    status: "implemented",
    output: "Console JSON comparing source-composed player models against exported cache GLB metadata.",
    writesToKronos: false
  }
];
