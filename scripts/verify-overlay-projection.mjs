import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { PerspectiveCamera, Vector3 } from "three";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

function loadTsModule(relativePath) {
  return loadAbsoluteModule(path.resolve(projectRoot, relativePath));
}

function loadAbsoluteModule(sourcePath) {
  const resolved = resolveModulePath(sourcePath);
  const cached = moduleCache.get(resolved);
  if (cached) {
    return cached.exports;
  }

  if (resolved.endsWith(".json")) {
    const module = { exports: JSON.parse(readFileSync(resolved, "utf8")) };
    moduleCache.set(resolved, module);
    return module.exports;
  }

  const source = readFileSync(resolved, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      resolveJsonModule: true,
      target: ts.ScriptTarget.ES2020,
      strict: true
    },
    fileName: resolved
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(resolved, module);
  vm.runInNewContext(
    transpiled,
    {
      module,
      exports: module.exports,
      require: (request) => {
        if (request.startsWith(".")) {
          return loadAbsoluteModule(path.resolve(path.dirname(resolved), request));
        }
        return require(request);
      },
      console
    },
    { filename: resolved }
  );
  return module.exports;
}

function resolveModulePath(candidatePath) {
  const candidates = [
    candidatePath,
    `${candidatePath}.ts`,
    `${candidatePath}.tsx`,
    `${candidatePath}.js`,
    `${candidatePath}.json`,
    path.join(candidatePath, "index.ts")
  ];
  for (const candidate of candidates) {
    try {
      const stat = require("node:fs").statSync(candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(`Cannot resolve module ${candidatePath}`);
}

const {
  NH_MIN_PROJECT_DEPTH_CLIENT_UNITS,
  NH_TILE_CLIENT_UNITS,
  nhActorAnchorWorldPosition,
  nhClientPixelScaleAtWorldPosition,
  nhClientUnitsToWorldUnits,
  nhOverlayClientViewportProjection,
  nhOverlayViewportProjection,
  nhOverlayWorldPositionFromViewport,
  nhProjectWorldPointToViewport
} = loadTsModule("src/render/nhOverlayProjection.ts");
const {
  NH_CAMERA_DEFAULT_DISTANCE_ZOOM,
  nhCameraDoZoom,
  nhCameraFollowHeightSceneUnits,
  nhClientSceneCameraOffset,
  nhRuntimeCameraPreset,
  nhViewportZoomToFovDegrees
} = loadTsModule("src/render/nhClientCamera.ts");
const overlayProjectionSource = readFileSync(path.join(projectRoot, "src", "render", "nhOverlayProjection.ts"), "utf8");
const clientViewReplaySource = readFileSync(path.join(projectRoot, "src", "render", "clientViewReplay.ts"), "utf8");
const runtimeViewerSource = readFileSync(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
const runtimeStylesSource = readFileSync(path.join(projectRoot, "src", "ui", "styles.css"), "utf8");
const clientRoot = path.resolve(projectRoot, "..", "Kronos184-Client");
const runelitePerspectiveSource = readFileSync(
  path.join(
    clientRoot,
    "runelite-api",
    "src",
    "main",
    "java",
    "net",
    "runelite",
    "api",
    "Perspective.java"
  ),
  "utf8"
);
const runelitePlayerAppearanceSource = readFileSync(
  path.join(
    clientRoot,
    "runelite-client",
    "src",
    "main",
    "java",
    "net",
    "runelite",
    "standalone",
    "PlayerAppearance.java"
  ),
  "utf8"
);
const clientViewportShapeSource = readFileSync(
  path.join(
    clientRoot,
    "runelite-client",
    "src",
    "main",
    "java",
    "net",
    "runelite",
    "standalone",
    "AbstractByteArrayCopier.java"
  ),
  "utf8"
);
const clientViewportOpcodeSource = readFileSync(
  path.join(
    clientRoot,
    "runelite-client",
    "src",
    "main",
    "java",
    "net",
    "runelite",
    "standalone",
    "Entity.java"
  ),
  "utf8"
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertAlmost(name, actual, expected, tolerance = 1e-6) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${name} mismatch: actual=${actual} expected=${expected}`);
  }
}

function assertProjection(name, actual, expected) {
  assert(actual, `${name} should project`);
  for (const [key, value] of Object.entries(expected)) {
    assertAlmost(`${name}.${key}`, actual[key], value);
  }
}

const viewport = {
  rect: { x: 4, y: 4, width: 512, height: 334 },
  zoom: 256
};
const camera = new PerspectiveCamera(
  nhViewportZoomToFovDegrees(viewport.rect.height, viewport.zoom),
  viewport.rect.width / viewport.rect.height,
  0.1,
  1000
);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();
camera.updateMatrixWorld();

assert(NH_TILE_CLIENT_UNITS === 128, "client tile unit scale mismatch");
assert(NH_MIN_PROJECT_DEPTH_CLIENT_UNITS === 50, "projection minimum depth mismatch");
assert(
  runelitePerspectiveSource.includes("SINE[i] = (int) (65536.0D * Math.sin") &&
    runelitePerspectiveSource.includes("COSINE[i] = (int) (65536.0D * Math.cos"),
  "RuneLite Perspective trig tables should be source int casts"
);
assert(
  runelitePlayerAppearanceSource.includes("Client.viewportTempX = var0 * Client.viewportZoom / var1 + Client.viewportWidth / 2") &&
    runelitePlayerAppearanceSource.includes("Client.viewportTempY = Client.viewportHeight / 2 + var8 * Client.viewportZoom / var1"),
  "Nh PlayerAppearance.method4162 should still project actor overheads through Client.viewportTempX/Y"
);
assert(
  clientViewportShapeSource.includes("Client.viewportZoom = var3 * var6 / 334;") &&
    clientViewportShapeSource.includes("Client.viewportWidth = var2;") &&
    clientViewportShapeSource.includes("Client.viewportHeight = var3;"),
  "Nh setViewportShape should still derive Client.viewportZoom from viewport height and fov clamp fields"
);
assert(
  clientViewportOpcodeSource.includes("Client.zoomHeight = (short)Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize];") &&
    clientViewportOpcodeSource.includes("Client.zoomWidth = (short)Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1];") &&
    clientViewportOpcodeSource.includes("Client.field1088 = (short)PlayerAppearance.method4127"),
  "Nh viewport opcodes should keep camera distance zoom separate from projection fov clamp fields"
);
assert(
  overlayProjectionSource.includes("Math.trunc(Math.sin(clientUnitsToRadians(units)) * clientTrigAmplitude)") &&
    overlayProjectionSource.includes("Math.trunc(Math.cos(clientUnitsToRadians(units)) * clientTrigAmplitude)"),
  "overlay client-camera projection should mirror RuneLite Perspective trig int casts"
);
assert(
  overlayProjectionSource.includes("function nhSceneHeightToClientInt") &&
    overlayProjectionSource.includes("return -nhSceneUnitsToClientInt(value);"),
  "overlay client-camera projection should convert scene-up height to Nh client-down height"
);
assert(
  runtimeViewerSource.includes("translate3d(${nhActorOverlayCssPixel(overlay.left)}px, ${nhActorOverlayCssPixel(overlay.top)}px, 0) scale(${scale})") &&
    runtimeViewerSource.includes("left: 0") &&
    runtimeViewerSource.includes("top: 0") &&
    runtimeViewerSource.includes("layout rounding here makes overhead sprites drift during camera-key motion"),
  "runtime DOM overlays should apply Nh viewportTempX/Y through a single transform instead of layout-position churn during camera-key motion"
);
assert(
  runtimeViewerSource.includes("style={runtimeDomOverlayStaticStyle(overlay)}") &&
    runtimeViewerSource.includes("function runtimeDomOverlayStaticStyle") &&
    runtimeViewerSource.includes("React owns the sprite structure only; the render frame applies the live projected transform."),
  "runtime DOM overlay React nodes should keep static sprite structure so camera-key renders cannot re-apply stale transforms"
);
assert(
  runtimeViewerSource.includes("function runeliteProjectedDomOverlayStyle") &&
    runtimeViewerSource.includes("applyRuneliteProjectedDomOverlayElementStyles") &&
    runtimeViewerSource.includes("runeliteFreezeTimerOverlayElementsRef") &&
    runtimeViewerSource.includes("runelitePlayerIndicatorOverlayElementsRef") &&
    runtimeViewerSource.includes("runelitePrayAgainstPlayerOverlayElementsRef") &&
    runtimeViewerSource.includes("runelitePrayerBarOverlayElementsRef") &&
    runtimeViewerSource.includes("runeliteXpDropDamageOverlayElementsRef"),
  "actor-attached RuneLite overlays should share the stable-node render-frame transform path used for Nh overheads"
);
for (const staleSignatureAnchor of [
  '`${overlay.id}:${overlay.state}:${overlay.text}:${Math.round(overlay.left * 10)}',
  '`${overlay.id}:${overlay.relation}:${overlay.label}:${overlay.color}:${Math.round(overlay.left * 10)}',
  '`${overlay.id}:${overlay.currentPrayer}:${overlay.maxPrayer}:${overlay.progressFill}:${overlay.showFlickHelper}:${overlay.flickLocation}:${overlay.flickXOffset}:${Math.round(overlay.left * 10)}',
  '`${overlay.id}:${overlay.damage}:${overlay.actorId}:${Math.round(overlay.left * 10)}'
]) {
  assert(
    !runtimeViewerSource.includes(staleSignatureAnchor),
    `actor-attached RuneLite overlay signature should not include camera-projected coordinates: ${staleSignatureAnchor}`
  );
}
assert(
  runtimeViewerSource.includes('id: `${actor.id}-prayer-${definition.spriteFrame}`') &&
    runtimeViewerSource.includes('id: `${actor.id}-skull`') &&
    !runtimeViewerSource.includes('id: `${combatState.tick}-${actor.id}-prayer-${definition.spriteFrame}`') &&
    !runtimeViewerSource.includes('id: `${combatState.tick}-${actor.id}-skull`'),
  "persistent prayer and skull overheads should keep stable DOM identities across game ticks so arrow-key camera motion only updates the Nh projection transform"
);
assert(
  clientViewReplaySource.includes("function clientViewOverlayEventId") &&
    clientViewReplaySource.includes('return `${actorId}-prayer-${spriteFrame ?? spriteId}`;') &&
    clientViewReplaySource.includes('return `${actorId}-skull`;') &&
    clientViewReplaySource.includes("camera-key motion should update Client.viewportTempX/Y placement only") &&
    !clientViewReplaySource.includes('id: `${tick}-${actorId}-${sheetId}-${spriteId}-${spriteFrame ?? 0}`'),
  "client-view replay prayer/skull overheads should keep actor-stable identities like the manual runtime path"
);
assert(
    runtimeViewerSource.includes("const projection = nhOverlayClientViewportProjection(") &&
    runtimeViewerSource.includes("nhRuntimeOverlayClientCameraState(boundary),") &&
    runtimeViewerSource.includes("Source: Scene.copy$drawActor2d calls World.method1253") &&
    runtimeViewerSource.includes("advanceRuntimeCameraAnglesClientCycle(boundary, cameraKeysRef.current)") &&
    runtimeViewerSource.includes("updateRuntimeCamera(boundary)"),
  "runtime DOM overlays should use the Nh Client.viewportTempX/Y integer camera path so arrow-key camera motion cannot desync overheads"
);
assert(
  runtimeViewerSource.includes("boundary.camera.fov = nhViewportZoomToFovDegrees(fixedLayout.viewport.rect.height, fixedLayout.viewport.zoom)") &&
    runtimeViewerSource.includes("const offset = nhClientSceneCameraOffset(clientAngles, viewportHeight, distanceZoom);") &&
    runtimeViewerSource.includes("distanceZoom: boundary.cameraRig.distanceZoom"),
  "runtime camera should mirror Nh by using viewportZoom for projection FOV and Client.zoomHeight/zoomWidth only for camera distance"
);
assert(
  runtimeStylesSource.includes(".nhActorOverlay") &&
    runtimeStylesSource.includes("contain: layout paint style") &&
    runtimeStylesSource.includes("will-change: transform"),
  "runtime actor overlays should stay on a transform-friendly compositing path"
);
assertAlmost("200 client units to world", nhClientUnitsToWorldUnits(200), 0.78125);

const centerProjection = nhProjectWorldPointToViewport(camera, viewport, new Vector3(0, 0, 0));
assertProjection("center projection", centerProjection, {
  x: 256,
  y: 167,
  depthClientUnits: 2560
});
assert(
  nhProjectWorldPointToViewport(camera, viewport, new Vector3(0, 0, 10)) === null,
  "point at camera depth should fail the client depth guard"
);

const anchor = nhActorAnchorWorldPosition(new Vector3(0, 0, 0), 200);
assertAlmost("anchor x", anchor.x, 0);
assertAlmost("anchor y", anchor.y, 0.78125);
assertAlmost("anchor z", anchor.z, 0);

const anchorProjection = nhProjectWorldPointToViewport(camera, viewport, anchor);
assertProjection("actor anchor projection", anchorProjection, {
  x: 256,
  y: 147,
  depthClientUnits: 2560
});

const placement = {
  anchorClientUnits: 200,
  centerOffsetXPixels: 10,
  centerOffsetYPixelsDown: -20
};
assertProjection("overlay viewport projection", nhOverlayViewportProjection(camera, viewport, new Vector3(0, 0, 0), placement), {
  x: 266,
  y: 127,
  depthClientUnits: 2560
});
const clientOverlayProjection = nhOverlayClientViewportProjection(
  { target: new Vector3(0, 0, 0), angles: nhRuntimeCameraPreset("north") },
  viewport,
  new Vector3(0, 0, 0),
  placement
);
assert(clientOverlayProjection, "client-camera overlay projection should resolve");
assert(Number.isInteger(clientOverlayProjection.x), "client-camera overlay x should stay source-integer projected");
assert(Number.isInteger(clientOverlayProjection.y), "client-camera overlay y should stay source-integer projected");
assert(
  clientOverlayProjection.depthClientUnits >= NH_MIN_PROJECT_DEPTH_CLIENT_UNITS,
  "client-camera overlay projection should respect the RuneLite localToCanvas depth guard"
);

function applyRuntimeCamera(camera, target, angles, sourceViewport = viewport, distanceZoom = NH_CAMERA_DEFAULT_DISTANCE_ZOOM) {
  camera.fov = nhViewportZoomToFovDegrees(sourceViewport.rect.height, sourceViewport.zoom);
  camera.aspect = sourceViewport.rect.width / sourceViewport.rect.height;
  const offset = nhClientSceneCameraOffset(angles, sourceViewport.rect.height, distanceZoom);
  camera.position.set(target.x - offset.x, target.y + offset.y, target.z - offset.z);
  camera.lookAt(target.x, target.y, target.z);
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[0] *= -1;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.updateMatrixWorld(true);
}

const sweepTarget = new Vector3(0, nhCameraFollowHeightSceneUnits(), 0);
const sweepActorPosition = new Vector3(1, 0, 0);
const sweepPlacement = {
  anchorClientUnits: 200,
  centerOffsetXPixels: 0,
  centerOffsetYPixelsDown: 0
};
for (const yaw of [0, 256, 512, 768, 1024, 1280, 1536, 1792]) {
  const angles = { ...nhRuntimeCameraPreset("north"), yaw };
  applyRuntimeCamera(camera, sweepTarget, angles);
  const anchorPosition = nhActorAnchorWorldPosition(sweepActorPosition, sweepPlacement.anchorClientUnits);
  const renderProjection = nhProjectWorldPointToViewport(camera, viewport, anchorPosition);
  const clientProjection = nhOverlayClientViewportProjection(
    { target: sweepTarget, angles },
    viewport,
    sweepActorPosition,
    sweepPlacement
  );
  assert(renderProjection, `render projection should resolve at yaw ${yaw}`);
  assert(clientProjection, `client overlay projection should resolve at yaw ${yaw}`);
  assertAlmost(`camera sweep ${yaw}.x`, clientProjection.x, renderProjection.x, 1);
  assertAlmost(`camera sweep ${yaw}.y`, clientProjection.y, renderProjection.y, 1);
  assertAlmost(`camera sweep ${yaw}.depth`, clientProjection.depthClientUnits, renderProjection.depthClientUnits, 1);
}

function makeSourceViewport(width, height) {
  const viewportBaseHeight = 334;
  const viewportBaseZoom = 512;
  const minHeightZoom = 256;
  const maxHeightZoom = 205;
  const minAspect = 1;
  const maxAspect = 32767;
  const heightDelta = height - viewportBaseHeight;
  let zoomScale;
  if (heightDelta < 0) {
    zoomScale = minHeightZoom;
  } else if (heightDelta >= 100) {
    zoomScale = maxHeightZoom;
  } else {
    zoomScale = Math.trunc(((maxHeightZoom - minHeightZoom) * heightDelta) / 100 + minHeightZoom);
  }

  const aspect = Math.trunc((height * zoomScale * viewportBaseZoom) / (width * viewportBaseHeight));
  assert(
    aspect >= minAspect && aspect <= maxAspect,
    "source viewport test cases should avoid the black-bar aspect clamp path"
  );
  return {
    rect: { x: 0, y: 0, width, height },
    zoom: Math.trunc((height * zoomScale) / viewportBaseHeight)
  };
}

function assertRuntimeProjectionMatchesClient(sourceViewport, cameraZoom, label) {
  const cameraStateTarget = new Vector3(0, nhCameraFollowHeightSceneUnits(cameraZoom, sourceViewport.rect.height), 0);
  const cameraAngles = [
    nhRuntimeCameraPreset("north"),
    nhRuntimeCameraPreset("isometric"),
    { ...nhRuntimeCameraPreset("north"), yaw: 768 },
    { ...nhRuntimeCameraPreset("south"), pitch: 192 }
  ];
  const actorPositions = [
    new Vector3(0, 0, 0),
    new Vector3(0.3, 0, 0),
    new Vector3(-0.3, 0, 0.3),
    new Vector3(0.3, 0, -0.3),
    new Vector3(-0.3, 0, -0.3)
  ];
  const anchors = [0, 100, 200];
  let checkedVisiblePoints = 0;

  for (const [angleIndex, angles] of cameraAngles.entries()) {
    applyRuntimeCamera(camera, cameraStateTarget, angles, sourceViewport);
    for (const [positionIndex, actorPosition] of actorPositions.entries()) {
      for (const anchorClientUnits of anchors) {
        const anchorPosition = nhActorAnchorWorldPosition(actorPosition, anchorClientUnits);
        const renderProjection = nhProjectWorldPointToViewport(camera, sourceViewport, anchorPosition);
        const clientProjection = nhOverlayClientViewportProjection(
          { target: cameraStateTarget, angles, distanceZoom: NH_CAMERA_DEFAULT_DISTANCE_ZOOM },
          sourceViewport,
          actorPosition,
          { anchorClientUnits, centerOffsetXPixels: 0, centerOffsetYPixelsDown: 0 }
        );
        assert(
          Boolean(renderProjection) === Boolean(clientProjection),
          `${label} angle=${angleIndex} position=${positionIndex} anchor=${anchorClientUnits} projection visibility mismatch`
        );
        if (!renderProjection || !clientProjection) {
          continue;
        }
        const edgeMargin = 32;
        const nearVisibleViewport =
          renderProjection.x >= -edgeMargin &&
          renderProjection.x <= sourceViewport.rect.width + edgeMargin &&
          renderProjection.y >= -edgeMargin &&
          renderProjection.y <= sourceViewport.rect.height + edgeMargin &&
          clientProjection.x >= -edgeMargin &&
          clientProjection.x <= sourceViewport.rect.width + edgeMargin &&
          clientProjection.y >= -edgeMargin &&
          clientProjection.y <= sourceViewport.rect.height + edgeMargin;
        if (!nearVisibleViewport) {
          continue;
        }
        checkedVisiblePoints += 1;
        assertAlmost(`${label} angle=${angleIndex} position=${positionIndex} anchor=${anchorClientUnits}.x`, renderProjection.x, clientProjection.x, 3);
        assertAlmost(`${label} angle=${angleIndex} position=${positionIndex} anchor=${anchorClientUnits}.y`, renderProjection.y, clientProjection.y, 3);
        assertAlmost(
          `${label} angle=${angleIndex} position=${positionIndex} anchor=${anchorClientUnits}.depth`,
          renderProjection.depthClientUnits,
          clientProjection.depthClientUnits,
          3
        );
      }
    }
  }
  assert(checkedVisiblePoints >= 8, `${label} should compare multiple visible or edge-near projection points`);
}

for (const [viewportLabel, candidateViewport] of [
  ["fixed", viewport],
  ["wide-resizable", makeSourceViewport(765, 503)],
  ["short-resizable", makeSourceViewport(760, 334)]
]) {
  for (const [zoomLabel, cameraZoom] of [
    ["close", nhCameraDoZoom(64, 64)],
    ["default", nhCameraDoZoom(512, 512)],
    ["far", nhCameraDoZoom(896, 896)]
  ]) {
    assertRuntimeProjectionMatchesClient(candidateViewport, cameraZoom, `${viewportLabel}-${zoomLabel}`);
  }
}

camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();
camera.updateMatrixWorld();

const overlayWorld = nhOverlayWorldPositionFromViewport(camera, viewport, new Vector3(0, 0, 0), placement);
assert(overlayWorld, "overlay world position should resolve");
const reprojected = nhProjectWorldPointToViewport(camera, viewport, overlayWorld);
assertProjection("overlay world reproject", reprojected, {
  x: 266,
  y: 127,
  depthClientUnits: 2560
});

assertAlmost("client pixel scale", nhClientPixelScaleAtWorldPosition(camera, viewport, new Vector3(0, 0, 0)), 10 / 256);

console.log(
  JSON.stringify(
    {
      ok: true,
      viewport,
      centerProjection,
      anchorProjection,
      clientOverlayProjection,
      overlayProjection: reprojected
    },
    null,
    2
  )
);
