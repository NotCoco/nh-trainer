import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { nhClientCameraPresets } from "./render-reference-targets.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "src", "render", "nhClientCamera.ts");
const runtimeViewerPath = path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx");
const clientRoot = path.resolve(projectRoot, "..", "Nh184-Client");
const clientCameraSourcePath = path.join(
  clientRoot,
  "runelite-client",
  "src",
  "main",
  "java",
  "net",
  "runelite",
  "standalone",
  "Client.java"
);
const clientRasterizerSourcePath = path.join(
  clientRoot,
  "runelite-client",
  "src",
  "main",
  "java",
  "net",
  "runelite",
  "standalone",
  "Rasterizer3D.java"
);
const clientKeyHandlerSourcePath = path.join(
  clientRoot,
  "runelite-client",
  "src",
  "main",
  "java",
  "net",
  "runelite",
  "standalone",
  "KeyHandler.java"
);
const clientScrollWheelZoomScriptPath = path.join(
  clientRoot,
  "runelite-client",
  "src",
  "main",
  "scripts",
  "ScrollWheelZoomHandler.rs2asm"
);
const clientZoomHandlerScriptPath = path.join(
  clientRoot,
  "runelite-client",
  "src",
  "main",
  "scripts",
  "ZoomHandler.rs2asm"
);
const clientOptionsZoomUpdaterScriptPath = path.join(
  clientRoot,
  "runelite-client",
  "src",
  "main",
  "scripts",
  "OptionsPanelZoomUpdater.rs2asm"
);

const source = await readFile(sourcePath, "utf8");
const runtimeViewerSource = await readFile(runtimeViewerPath, "utf8");
const clientCameraSource = await readFile(clientCameraSourcePath, "utf8");
const clientRasterizerSource = await readFile(clientRasterizerSourcePath, "utf8");
const clientKeyHandlerSource = await readFile(clientKeyHandlerSourcePath, "utf8");
const clientScrollWheelZoomScript = await readFile(clientScrollWheelZoomScriptPath, "utf8");
const clientZoomHandlerScript = await readFile(clientZoomHandlerScriptPath, "utf8");
const clientOptionsZoomUpdaterScript = await readFile(clientOptionsZoomUpdaterScriptPath, "utf8");
if (
  runtimeViewerSource.includes("Math.hypot(5.8, 6.4, 7.4)") ||
  runtimeViewerSource.includes("Math.atan2(4.8, 9)") ||
  runtimeViewerSource.includes("target.y + 0.45") ||
  runtimeViewerSource.includes("boundary.cameraRig.clientAngles.yaw, NH_CAMERA_MAX_PITCH") ||
  runtimeViewerSource.includes("NH_CAMERA_FALLBACK_FOV_DEGREES") ||
  runtimeViewerSource.includes("?? 334") ||
  runtimeViewerSource.includes("fixedClientCssLayout?.viewportRect ?? { x: 0, y: 0, width, height }") ||
  runtimeViewerSource.includes("fixedClientCssLayout?.viewportRect ?? { x: 0, y: 0, width: rect.width, height: rect.height }")
) {
  throw new Error("RuntimeSceneViewer should use source-backed Nh client camera constants instead of handmade orbit/FOV fallbacks.");
}
if (!runtimeViewerSource.includes("const viewportRect = boundary.fixedClientCssLayout?.viewportRect;")) {
  throw new Error("RuntimeSceneViewer should fail closed until the source fixed viewport rectangle is available.");
}

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    strict: true
  },
  fileName: sourcePath
}).outputText;

const module = { exports: {} };
vm.runInNewContext(transpiled, { module, exports: module.exports }, { filename: sourcePath });

const {
  NH_CAMERA_MIN_PITCH,
  NH_CAMERA_MAX_PITCH,
  NH_CAMERA_DEFAULT_PITCH_UNITS,
  NH_CAMERA_DEFAULT_YAW_UNITS,
  NH_CAMERA_DEFAULT_FOV_DEGREES,
  NH_CAMERA_DEFAULT_VIEWPORT_HEIGHT,
  NH_CAMERA_DEFAULT_VIEWPORT_ZOOM,
  NH_CAMERA_DEFAULT_ZOOM,
  NH_CAMERA_OUTER_ZOOM_LIMIT,
  NH_CAMERA_INNER_ZOOM_LIMIT,
  NH_CAMERA_SCROLL_WHEEL_INCREMENT,
  NH_CLIENT_TO_SCENE_UNITS,
  NH_CAMERA_DEFAULT_FOLLOW_HEIGHT_UNITS,
  NH_CAMERA_FOCUS_RESET_DISTANCE_SCENE_UNITS,
  NH_RUNTIME_CAMERA_PRESETS,
  nhClientCameraOffset,
  nhClientSceneCameraOffset,
  nhClientCameraBaseDistance,
  nhCameraFollowHeightUnits,
  nhCameraFollowHeightSceneUnits,
  nhCameraZoomFromSliderOffset,
  nhCameraZoomSliderOffset,
  nhViewportZoomToFovDegrees,
  nhRuntimeCameraPreset,
  smoothNhCameraFocusAxis,
  updateNhCameraAngles,
  updateNhCameraAnglesFromMouseDrag,
  updateNhCameraZoomFromScrollWheel,
  isNhCameraMoving
} = module.exports;

const noKeys = { left: false, right: false, up: false, down: false };
const left = { ...noKeys, left: true };
const right = { ...noKeys, right: true };
const up = { ...noKeys, up: true };
const down = { ...noKeys, down: true };

function javaTrunc(value) {
  return Math.trunc(value);
}

function wrap(units) {
  return ((Math.round(units) % 2048) + 2048) % 2048;
}

function clampPitch(units) {
  return Math.max(NH_CAMERA_MIN_PITCH, Math.min(NH_CAMERA_MAX_PITCH, Math.round(units)));
}

function clientTrig(units, fn) {
  return Math.trunc(fn((units * Math.PI * 2) / 2048) * 65536);
}

function shift16(value) {
  return Math.floor(value / 65536);
}

function referenceCameraOffset(angles, viewportHeight, zoom = { zoomHeight: 512, zoomWidth: 512 }) {
  const pitch = clampPitch(angles.pitch);
  const yaw = wrap(angles.yaw);
  const heightDelta = Math.max(0, Math.min(100, Math.trunc(viewportHeight) - 334));
  const zoomHeight = Math.max(128, Math.min(896, Math.trunc(zoom.zoomHeight)));
  const zoomWidth = Math.max(128, Math.min(896, Math.trunc(zoom.zoomWidth)));
  const zoomScale = Math.trunc(((zoomWidth - zoomHeight) * heightDelta) / 100 + zoomHeight);
  const distance = Math.trunc(((pitch * 3 + 600) * zoomScale) / 256);
  const pitchRotation = wrap(2048 - pitch);
  const yawRotation = wrap(2048 - yaw);
  let x = 0;
  let y = 0;
  let z = distance;
  if (pitchRotation !== 0) {
    const sine = clientTrig(pitchRotation, Math.sin);
    const cosine = clientTrig(pitchRotation, Math.cos);
    const nextY = shift16(y * cosine - distance * sine);
    z = shift16(cosine * distance + sine * y);
    y = nextY;
  }
  if (yawRotation !== 0) {
    const sine = clientTrig(yawRotation, Math.sin);
    const cosine = clientTrig(yawRotation, Math.cos);
    const nextX = shift16(x * cosine + sine * z);
    z = shift16(z * cosine - x * sine);
    x = nextX;
  }
  return { x, y, z, distance, zoomScale };
}

function referenceWheelZoom(current, wheelRotation) {
  const rotation = javaTrunc(wheelRotation);
  if (rotation === 0) {
    return current;
  }
  const delta = -rotation * 25;
  return {
    zoomHeight: Math.max(128, Math.min(896, javaTrunc(current.zoomHeight + delta))),
    zoomWidth: Math.max(128, Math.min(896, javaTrunc(current.zoomWidth + delta)))
  };
}

function referenceSliderZoom(offset, sliderRange) {
  const range = Math.max(1, javaTrunc(sliderRange));
  const clampedOffset = Math.max(0, Math.min(range, javaTrunc(offset)));
  const value = Math.trunc((clampedOffset * (896 - 128)) / range) + 128;
  return { zoomHeight: value, zoomWidth: value };
}

function referenceSliderOffset(zoom, viewportHeight, sliderRange) {
  const range = Math.max(1, javaTrunc(sliderRange));
  const value = viewportHeight > 334 ? zoom.zoomWidth : zoom.zoomHeight;
  return Math.trunc(((Math.max(128, Math.min(896, javaTrunc(value))) - 128) * range) / (896 - 128));
}

function referenceFollowHeight(zoom, viewportHeight) {
  const heightDelta = Math.max(0, Math.min(100, Math.trunc(viewportHeight) - 334));
  const zoomScale = Math.trunc(((zoom.zoomWidth - zoom.zoomHeight) * heightDelta) / 100 + zoom.zoomHeight);
  return 25 + Math.trunc((25 * zoomScale) / 256);
}

function referenceStep(current, keys) {
  let camAngleDY = current.camAngleDY;
  if (keys.left) {
    camAngleDY += javaTrunc((-24 - camAngleDY) / 2);
  } else if (keys.right) {
    camAngleDY += javaTrunc((24 - camAngleDY) / 2);
  } else {
    camAngleDY = javaTrunc(camAngleDY / 2);
  }

  let camAngleDX = current.camAngleDX;
  if (keys.up) {
    camAngleDX += javaTrunc((12 - camAngleDX) / 2);
  } else if (keys.down) {
    camAngleDX += javaTrunc((-12 - camAngleDX) / 2);
  } else {
    camAngleDX = javaTrunc(camAngleDX / 2);
  }

  return {
    yaw: wrap(current.yaw + javaTrunc(camAngleDY / 2)),
    pitch: clampPitch(current.pitch + javaTrunc(camAngleDX / 2)),
    camAngleDX,
    camAngleDY
  };
}

function referenceMouseStep(current, mouse, position) {
  const mouseX = javaTrunc(position.x);
  const mouseY = javaTrunc(position.y);
  const deltaY = mouseY - mouse.clickedY;
  const camAngleDX = deltaY * 2;
  const clickedY = deltaY !== -1 && deltaY !== 1 ? javaTrunc((mouse.clickedY + mouseY) / 2) : mouseY;
  const deltaX = mouse.clickedX - mouseX;
  const camAngleDY = deltaX * 2;
  const clickedX = deltaX !== -1 && deltaX !== 1 ? javaTrunc((mouseX + mouse.clickedX) / 2) : mouseX;

  return {
    angles: {
      yaw: wrap(current.yaw + javaTrunc(camAngleDY / 2)),
      pitch: clampPitch(current.pitch + javaTrunc(camAngleDX / 2)),
      camAngleDX,
      camAngleDY
    },
    mouse: {
      clickedX,
      clickedY
    }
  };
}

function runSequence(initial, sequence) {
  return sequence.reduce(
    (state, keys) => ({
      actual: updateNhCameraAngles(state.actual, keys),
      expected: referenceStep(state.expected, keys)
    }),
    { actual: initial, expected: initial }
  );
}

function assertSame(name, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name} mismatch\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  }
}

function assertIncludes(name, sourceText, expected) {
  if (!sourceText.includes(expected)) {
    throw new Error(`${name} missing ${expected}`);
  }
}

const heldThenReleased = runSequence(
  { yaw: 0, pitch: 200, camAngleDX: 0, camAngleDY: 0 },
  [left, left, left, noKeys, noKeys, noKeys, noKeys, noKeys]
);
assertSame("left held and release decay", heldThenReleased.actual, heldThenReleased.expected);

const opposingKeys = runSequence(
  { yaw: 96, pitch: 180, camAngleDX: 0, camAngleDY: 0 },
  [right, right, left, left, noKeys, noKeys]
);
assertSame("right-to-left smoothing", opposingKeys.actual, opposingKeys.expected);

let actualMouse = {
  angles: { yaw: 256, pitch: 192, camAngleDX: 0, camAngleDY: 0 },
  mouse: { clickedX: 320, clickedY: 180 }
};
let expectedMouse = JSON.parse(JSON.stringify(actualMouse));
for (const position of [
  { x: 300, y: 184 },
  { x: 290, y: 190 },
  { x: 289, y: 191 }
]) {
  actualMouse = updateNhCameraAnglesFromMouseDrag(actualMouse.angles, actualMouse.mouse, position);
  expectedMouse = referenceMouseStep(expectedMouse.angles, expectedMouse.mouse, position);
}
assertSame("middle mouse drag camera branch", actualMouse, expectedMouse);

const pitchUpperClamp = runSequence({ yaw: 0, pitch: 382, camAngleDX: 0, camAngleDY: 0 }, [up, up, up]);
assertSame("pitch upper clamp", pitchUpperClamp.actual, pitchUpperClamp.expected);
if (pitchUpperClamp.actual.pitch !== NH_CAMERA_MAX_PITCH) {
  throw new Error(`expected upper pitch clamp ${NH_CAMERA_MAX_PITCH}, got ${pitchUpperClamp.actual.pitch}`);
}

const pitchLowerClamp = runSequence({ yaw: 0, pitch: 129, camAngleDX: 0, camAngleDY: 0 }, [down, down, down]);
assertSame("pitch lower clamp", pitchLowerClamp.actual, pitchLowerClamp.expected);
if (pitchLowerClamp.actual.pitch !== NH_CAMERA_MIN_PITCH) {
  throw new Error(`expected lower pitch clamp ${NH_CAMERA_MIN_PITCH}, got ${pitchLowerClamp.actual.pitch}`);
}

const releaseStart = updateNhCameraAngles({ yaw: 0, pitch: 200, camAngleDX: 0, camAngleDY: 0 }, left);
if (!isNhCameraMoving(releaseStart)) {
  throw new Error("camera velocity should remain active immediately after a held key tick");
}
let releaseEnd = releaseStart;
for (let index = 0; index < 8; index += 1) {
  releaseEnd = updateNhCameraAngles(releaseEnd, noKeys);
}
if (isNhCameraMoving(releaseEnd)) {
  throw new Error(`camera velocity should decay to zero after release, got ${JSON.stringify(releaseEnd)}`);
}

const fixedCameraOffset = nhClientCameraOffset({ yaw: 256, pitch: NH_CAMERA_DEFAULT_PITCH_UNITS }, 334);
assertSame(
  "fixed viewport camera orbit offset",
  fixedCameraOffset,
  referenceCameraOffset({ yaw: 256, pitch: NH_CAMERA_DEFAULT_PITCH_UNITS }, 334)
);
const tallCameraOffset = nhClientCameraOffset({ yaw: 640, pitch: 383 }, 434);
assertSame("tall viewport camera orbit offset", tallCameraOffset, referenceCameraOffset({ yaw: 640, pitch: 383 }, 434));

const zoomedCameraOffset = nhClientCameraOffset({ yaw: 256, pitch: NH_CAMERA_DEFAULT_PITCH_UNITS }, 334, {
  zoomHeight: 128,
  zoomWidth: 128
});
assertSame(
  "inner scroll zoom camera orbit offset",
  zoomedCameraOffset,
  referenceCameraOffset({ yaw: 256, pitch: NH_CAMERA_DEFAULT_PITCH_UNITS }, 334, { zoomHeight: 128, zoomWidth: 128 })
);

const sceneOffset = nhClientSceneCameraOffset({ yaw: 256, pitch: NH_CAMERA_DEFAULT_PITCH_UNITS }, 334);
assertSame("scene camera offset scaling", sceneOffset, {
  x: fixedCameraOffset.x * NH_CLIENT_TO_SCENE_UNITS,
  y: fixedCameraOffset.y * NH_CLIENT_TO_SCENE_UNITS,
  z: fixedCameraOffset.z * NH_CLIENT_TO_SCENE_UNITS,
  distance: fixedCameraOffset.distance * NH_CLIENT_TO_SCENE_UNITS,
  zoomScale: fixedCameraOffset.zoomScale
});

const wheelZoomIn = updateNhCameraZoomFromScrollWheel({ zoomHeight: 512, zoomWidth: 512 }, 1);
assertSame("scroll wheel zoom step", wheelZoomIn, referenceWheelZoom({ zoomHeight: 512, zoomWidth: 512 }, 1));
const wheelZoomClamp = updateNhCameraZoomFromScrollWheel({ zoomHeight: 138, zoomWidth: 138 }, 1);
assertSame("scroll wheel zoom outer clamp", wheelZoomClamp, { zoomHeight: 128, zoomWidth: 128 });
const wheelZoomOut = updateNhCameraZoomFromScrollWheel({ zoomHeight: 512, zoomWidth: 512 }, -1);
assertSame("scroll wheel zoom out step", wheelZoomOut, { zoomHeight: 537, zoomWidth: 537 });
const wheelZoomInnerClamp = updateNhCameraZoomFromScrollWheel({ zoomHeight: 886, zoomWidth: 886 }, -1);
assertSame("scroll wheel zoom inner clamp", wheelZoomInnerClamp, { zoomHeight: 896, zoomWidth: 896 });
assertSame("options zoom slider midpoint", nhCameraZoomFromSliderOffset(48, 96), referenceSliderZoom(48, 96));
if (nhCameraZoomSliderOffset({ zoomHeight: 512, zoomWidth: 512 }, 334, 96) !== referenceSliderOffset({ zoomHeight: 512, zoomWidth: 512 }, 334, 96)) {
  throw new Error("options zoom slider offset drifted from OptionsPanelZoomUpdater.rs2asm");
}
if (nhCameraFollowHeightUnits({ zoomHeight: 512, zoomWidth: 512 }, 334) !== referenceFollowHeight({ zoomHeight: 512, zoomWidth: 512 }, 334)) {
  throw new Error("camera follow height should be derived from ZoomHandler.rs2asm cam_setfollowheight formula");
}

for (const [name, expected] of Object.entries(nhClientCameraPresets)) {
  const runtimePreset = NH_RUNTIME_CAMERA_PRESETS[name];
  assertSame(`runtime camera preset ${name}`, runtimePreset, { yaw: expected.yaw, pitch: expected.pitch });
  assertSame(`runtime camera preset state ${name}`, nhRuntimeCameraPreset(name), {
    yaw: expected.yaw,
    pitch: expected.pitch,
    camAngleDX: 0,
    camAngleDY: 0
  });
  const expectedZoomedDistance = Math.trunc((nhClientCameraBaseDistance(expected.pitch) * NH_CAMERA_DEFAULT_ZOOM.zoomHeight) / 256);
  if (expectedZoomedDistance !== expected.distance) {
    throw new Error(`camera zoomed distance for ${name} should be source base distance scaled by Client.zoomHeight`);
  }
  if (expected.focalHeightOffset !== NH_CAMERA_DEFAULT_FOLLOW_HEIGHT_UNITS) {
    throw new Error(`capture focal height for ${name} should match the client camFollowHeight bridge constant`);
  }
}

assertIncludes("client normal follow source local x", clientCameraSource, "var4 = class215.localPlayer.x;");
assertIncludes("client normal follow source local y", clientCameraSource, "var5 = class215.localPlayer.y * 682054857;");
assertIncludes("client default pitch source", clientCameraSource, "camAngleX = 128;");
assertIncludes("client default yaw source", clientCameraSource, "camAngleY = 0;");
assertIncludes(
  "client arrow key-code source mapping",
  clientKeyHandlerSource,
  "83, 104, 105, 103, 102, 96, 98, 97, 99"
);
assertIncludes(
  "client normal follow source reset window",
  clientCameraSource,
  "if(ObjectSound.oculusOrbFocalPointX - var4 < -500 || ObjectSound.oculusOrbFocalPointX - var4 > 500 || class125.oculusOrbFocalPointY - var5 < -500 || class125.oculusOrbFocalPointY - var5 > 500)"
);
assertIncludes(
  "client normal follow source x smoothing",
  clientCameraSource,
  "ObjectSound.oculusOrbFocalPointX += (var4 - ObjectSound.oculusOrbFocalPointX) / 16;"
);
assertIncludes(
  "client normal follow source y smoothing",
  clientCameraSource,
  "class125.oculusOrbFocalPointY += (var5 - class125.oculusOrbFocalPointY) / 16;"
);
assertIncludes("client scroll wheel zoom source callback", clientScrollWheelZoomScript, "sconst                 \"scrollWheelZoom\"");
assertIncludes("client scroll wheel zoom increment", clientScrollWheelZoomScript, "sconst                 \"scrollWheelZoomIncrement\"");
assertIncludes("client scroll wheel zoom source delta", clientScrollWheelZoomScript, "sub");
assertIncludes("client zoom handler source fov clamp", clientZoomHandlerScript, "sconst                 \"innerZoomLimit\"");
assertIncludes("client zoom handler source varc height", clientZoomHandlerScript, "set_varc_int           74");
assertIncludes("client zoom handler source varc width", clientZoomHandlerScript, "set_varc_int           73");
assertIncludes("client options zoom updater source varc", clientOptionsZoomUpdaterScript, "get_varc_int           74");
assertIncludes("runtime default camera fov", runtimeViewerSource, "new PerspectiveCamera(NH_CAMERA_DEFAULT_FOV_DEGREES");
assertIncludes("runtime default camera viewport height", runtimeViewerSource, "NH_CAMERA_DEFAULT_VIEWPORT_HEIGHT");
assertIncludes(
  "runtime render projection handedness bridge",
  runtimeViewerSource,
  "camera.projectionMatrix.elements[0] *= -1;"
);
assertIncludes(
  "runtime camera source yaw orbit",
  runtimeViewerSource,
  "const offset = nhClientSceneCameraOffset(clientAngles, viewportHeight, zoom);"
);
assertIncludes(
  "client trig table source",
  clientRasterizerSource,
  "Rasterizer3D_sine[var0] = (int)(65536.0D * Math.sin"
);
assertIncludes(
  "runtime camera trig table cast",
  source,
  "Math.trunc(Math.sin(clientUnitsToRadians(units)) * clientTrigAmplitude)"
);
assertIncludes(
  "runtime camera source x placement",
  runtimeViewerSource,
  "target.x - offset.x"
);
assertIncludes(
  "runtime camera client-cycle cadence",
  runtimeViewerSource,
  "Math.floor(elapsedMs / NH_CLIENT_CYCLE_MS)"
);
assertIncludes(
  "client mouse camera source branch",
  clientCameraSource,
  "if(MouseHandler.MouseHandler_currentButton == 4 && WorldMapIcon_1.mouseCam)"
);
assertIncludes("client mouse camera source dx", clientCameraSource, "camAngleDX = var4 * 2;");
assertIncludes("client mouse camera source dy", clientCameraSource, "camAngleDY = var5 * 2;");
assertIncludes("runtime middle mouse capture", runtimeViewerSource, "if (event.button === 1)");
assertIncludes("runtime mouse camera drag state", runtimeViewerSource, "mouseCameraDragRef.current");
assertIncludes("runtime mouse camera source update", source, "updateNhCameraAnglesFromMouseDrag");
assertIncludes("runtime wheel camera zoom source update", runtimeViewerSource, "updateNhCameraZoomFromScrollWheel");
assertIncludes("runtime browser wheel zoom direction", runtimeViewerSource, "return event.deltaY > 0 ? -1 : 1;");
assertIncludes("runtime camera zoom dataset", runtimeViewerSource, "canvas.dataset.cameraZoomHeight");
assertIncludes("runtime options camera zoom slider", runtimeViewerSource, "onCameraZoomChange={(zoom) => setRuntimeCameraZoom(zoom, \"options zoom slider\")}");
assertIncludes(
  "runtime normal follow x smoothing",
  runtimeViewerSource,
  "smoothNhCameraFocusAxis(boundary.cameraRig.target.x, slot.group.position.x)"
);
assertIncludes(
  "runtime normal follow z smoothing",
  runtimeViewerSource,
  "smoothNhCameraFocusAxis(boundary.cameraRig.target.z, slot.group.position.z)"
);

if (nhCameraFollowHeightSceneUnits() !== NH_CAMERA_DEFAULT_FOLLOW_HEIGHT_UNITS * NH_CLIENT_TO_SCENE_UNITS) {
  throw new Error("camera follow height scene conversion drifted from the client default follow-height constant");
}
if (NH_CAMERA_DEFAULT_VIEWPORT_HEIGHT !== 334 || NH_CAMERA_DEFAULT_VIEWPORT_ZOOM !== 256 || NH_CAMERA_DEFAULT_ZOOM.zoomHeight !== 512 || NH_CAMERA_DEFAULT_ZOOM.zoomWidth !== 512) {
  throw new Error("default runtime camera constants should match fixed viewport projection plus camera_do_zoom fallback");
}
if (NH_CAMERA_OUTER_ZOOM_LIMIT !== 128 || NH_CAMERA_INNER_ZOOM_LIMIT !== 896 || NH_CAMERA_SCROLL_WHEEL_INCREMENT !== 25) {
  throw new Error("camera zoom limits and wheel increment should match the source client scripts");
}
if (NH_CAMERA_DEFAULT_PITCH_UNITS !== 128 || NH_CAMERA_DEFAULT_YAW_UNITS !== 0) {
  throw new Error("default runtime camera angle constants should match Client.java camAngleX/camAngleY initialization");
}
if (NH_RUNTIME_CAMERA_PRESETS.isometric.pitch !== NH_CAMERA_DEFAULT_PITCH_UNITS) {
  throw new Error("default trainer camera pitch should use the client initial camAngleX value instead of a handmade farther orbit");
}
if (nhViewportZoomToFovDegrees(NH_CAMERA_DEFAULT_VIEWPORT_HEIGHT, NH_CAMERA_DEFAULT_VIEWPORT_ZOOM) !== NH_CAMERA_DEFAULT_FOV_DEGREES) {
  throw new Error("default runtime camera FOV should be derived from Nh viewport zoom");
}
if (Math.abs(NH_CAMERA_DEFAULT_FOV_DEGREES - 66.23633715063609) > 1e-12) {
  throw new Error(`default runtime camera FOV drifted from fixed viewport source value: ${NH_CAMERA_DEFAULT_FOV_DEGREES}`);
}
if (smoothNhCameraFocusAxis(0, NH_CAMERA_FOCUS_RESET_DISTANCE_SCENE_UNITS + 0.001) !== NH_CAMERA_FOCUS_RESET_DISTANCE_SCENE_UNITS + 0.001) {
  throw new Error("camera focus should snap when it exceeds the source 500-unit reset window");
}
if (smoothNhCameraFocusAxis(0, 1.6) !== 0.1) {
  throw new Error("camera focus should move by one sixteenth inside the source reset window");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      sourcePath,
      runtimeViewerPath,
      clientCameraSourcePath,
      heldThenReleased: heldThenReleased.actual,
      opposingKeys: opposingKeys.actual,
      mouseDrag: actualMouse,
      pitchUpperClamp: pitchUpperClamp.actual,
      pitchLowerClamp: pitchLowerClamp.actual,
      releaseEnd,
      fixedCameraOffset,
      tallCameraOffset,
      zoomedCameraOffset,
      wheelZoomIn,
      wheelZoomClamp,
      sceneOffset,
      capturePresets: nhClientCameraPresets
    },
    null,
    2
  )
);
