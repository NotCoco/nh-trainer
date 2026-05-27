export interface NhCameraAngles {
  readonly yaw: number;
  readonly pitch: number;
  readonly camAngleDX: number;
  readonly camAngleDY: number;
}

export interface NhCameraKeyState {
  readonly left: boolean;
  readonly right: boolean;
  readonly up: boolean;
  readonly down: boolean;
}

export interface NhMouseCameraState {
  readonly clickedX: number;
  readonly clickedY: number;
}

export interface NhMouseCameraUpdate {
  readonly angles: NhCameraAngles;
  readonly mouse: NhMouseCameraState;
}

export interface NhCameraZoom {
  readonly zoomHeight: number;
  readonly zoomWidth: number;
}

export type NhRuntimeCameraPresetName = "isometric" | "north" | "south" | "top";

export interface NhRuntimeCameraPreset {
  readonly yaw: number;
  readonly pitch: number;
}

export const NH_CAMERA_UNITS = 2048;
export const NH_CAMERA_MIN_PITCH = 128;
export const NH_CAMERA_MAX_PITCH = 383;
export const NH_CAMERA_DEFAULT_PITCH_UNITS = 128;
export const NH_CAMERA_DEFAULT_YAW_UNITS = 0;
export const NH_CAMERA_DEFAULT_VIEWPORT_HEIGHT = 334;
export const NH_CAMERA_DEFAULT_VIEWPORT_ZOOM = 256;
export const NH_CAMERA_DEFAULT_FOV_DEGREES = nhViewportZoomToFovDegrees(
  NH_CAMERA_DEFAULT_VIEWPORT_HEIGHT,
  NH_CAMERA_DEFAULT_VIEWPORT_ZOOM
);
export const NH_CAMERA_OUTER_ZOOM_LIMIT = 128;
export const NH_CAMERA_INNER_ZOOM_LIMIT = 896;
export const NH_CAMERA_SCROLL_WHEEL_INCREMENT = 25;
export const NH_CAMERA_DEFAULT_ZOOM_HEIGHT = 512;
export const NH_CAMERA_DEFAULT_ZOOM_WIDTH = 512;
export const NH_CAMERA_DEFAULT_ZOOM: NhCameraZoom = {
  zoomHeight: NH_CAMERA_DEFAULT_ZOOM_HEIGHT,
  zoomWidth: NH_CAMERA_DEFAULT_ZOOM_WIDTH
};
export const NH_CLIENT_TILE_UNITS = 128;
export const NH_SCENE_TILE_UNITS = 0.5;
export const NH_CLIENT_TO_SCENE_UNITS = NH_SCENE_TILE_UNITS / NH_CLIENT_TILE_UNITS;
export const NH_CAMERA_DEFAULT_FOLLOW_HEIGHT_UNITS = 75;
export const NH_CAMERA_FOCUS_RESET_DISTANCE_UNITS = 500;
export const NH_CAMERA_FOCUS_RESET_DISTANCE_SCENE_UNITS =
  NH_CAMERA_FOCUS_RESET_DISTANCE_UNITS * NH_CLIENT_TO_SCENE_UNITS;
export const NH_RUNTIME_CAMERA_PRESETS = {
  isometric: { yaw: 256, pitch: NH_CAMERA_DEFAULT_PITCH_UNITS },
  north: { yaw: NH_CAMERA_DEFAULT_YAW_UNITS, pitch: NH_CAMERA_DEFAULT_PITCH_UNITS },
  south: { yaw: 1024, pitch: NH_CAMERA_DEFAULT_PITCH_UNITS },
  top: { yaw: 256, pitch: NH_CAMERA_MAX_PITCH }
} satisfies Record<NhRuntimeCameraPresetName, NhRuntimeCameraPreset>;

const radiansPerClientUnit = (Math.PI * 2) / NH_CAMERA_UNITS;
const clientTrigAmplitude = 65536;
const viewportBaseHeight = NH_CAMERA_DEFAULT_VIEWPORT_HEIGHT;

export interface NhClientCameraOffset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly distance: number;
  readonly zoomScale: number;
}

export interface NhClientSceneCameraOffset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly distance: number;
  readonly zoomScale: number;
}

export function createNhCameraAngles(yawRadians: number, pitchRadians: number): NhCameraAngles {
  return {
    yaw: radiansToClientUnits(yawRadians),
    pitch: clampPitch(radiansToClientUnits(pitchRadians)),
    camAngleDX: 0,
    camAngleDY: 0
  };
}

export function clientUnitsToRadians(units: number): number {
  return units * radiansPerClientUnit;
}

export function nhViewportZoomToFovDegrees(viewportHeight: number, viewportZoom: number): number {
  const height = Math.max(1, viewportHeight);
  const zoom = Math.max(1, viewportZoom);
  return (Math.atan(height / (2 * zoom)) * 360) / Math.PI;
}

export function nhClientCameraOffset(
  angles: Pick<NhCameraAngles, "yaw" | "pitch">,
  viewportHeight: number,
  zoom: NhCameraZoom = NH_CAMERA_DEFAULT_ZOOM
): NhClientCameraOffset {
  const pitch = clampPitch(angles.pitch);
  const yaw = wrapClientUnits(angles.yaw);
  const zoomScale = nhCameraZoomScale(viewportHeight, zoom);
  const distance = Math.trunc((nhClientCameraBaseDistance(pitch) * zoomScale) / 256);
  const pitchRotation = wrapClientUnits(NH_CAMERA_UNITS - pitch);
  const yawRotation = wrapClientUnits(NH_CAMERA_UNITS - yaw);

  let offsetX = 0;
  let offsetY = 0;
  let offsetZ = distance;
  if (pitchRotation !== 0) {
    const sine = clientSine(pitchRotation);
    const cosine = clientCosine(pitchRotation);
    const nextY = arithmeticShift16(offsetY * cosine - distance * sine);
    offsetZ = arithmeticShift16(cosine * distance + sine * offsetY);
    offsetY = nextY;
  }

  if (yawRotation !== 0) {
    const sine = clientSine(yawRotation);
    const cosine = clientCosine(yawRotation);
    const nextX = arithmeticShift16(offsetX * cosine + sine * offsetZ);
    offsetZ = arithmeticShift16(offsetZ * cosine - offsetX * sine);
    offsetX = nextX;
  }

  return {
    x: offsetX,
    y: offsetY,
    z: offsetZ,
    distance,
    zoomScale
  };
}

export function nhClientSceneCameraOffset(
  angles: Pick<NhCameraAngles, "yaw" | "pitch">,
  viewportHeight: number,
  zoom: NhCameraZoom = NH_CAMERA_DEFAULT_ZOOM
): NhClientSceneCameraOffset {
  const offset = nhClientCameraOffset(angles, viewportHeight, zoom);
  return {
    x: offset.x * NH_CLIENT_TO_SCENE_UNITS,
    y: offset.y * NH_CLIENT_TO_SCENE_UNITS,
    z: offset.z * NH_CLIENT_TO_SCENE_UNITS,
    distance: offset.distance * NH_CLIENT_TO_SCENE_UNITS,
    zoomScale: offset.zoomScale
  };
}

export function nhClientCameraBaseDistance(pitch: number): number {
  return clampPitch(pitch) * 3 + 600;
}

export function nhRuntimeCameraPreset(name: NhRuntimeCameraPresetName): NhCameraAngles {
  const preset = NH_RUNTIME_CAMERA_PRESETS[name];
  return {
    yaw: wrapClientUnits(preset.yaw),
    pitch: clampPitch(preset.pitch),
    camAngleDX: 0,
    camAngleDY: 0
  };
}

export function nhCameraFollowHeightUnits(
  zoom: NhCameraZoom = NH_CAMERA_DEFAULT_ZOOM,
  viewportHeight: number = NH_CAMERA_DEFAULT_VIEWPORT_HEIGHT
): number {
  const zoomScale = nhCameraZoomScale(viewportHeight, zoom);
  return 25 + Math.trunc((25 * zoomScale) / 256);
}

export function nhCameraFollowHeightSceneUnits(
  zoom: NhCameraZoom = NH_CAMERA_DEFAULT_ZOOM,
  viewportHeight: number = NH_CAMERA_DEFAULT_VIEWPORT_HEIGHT
): number {
  return nhCameraFollowHeightUnits(zoom, viewportHeight) * NH_CLIENT_TO_SCENE_UNITS;
}

export function smoothNhCameraFocusAxis(current: number, target: number): number {
  if (target - current < -NH_CAMERA_FOCUS_RESET_DISTANCE_SCENE_UNITS) {
    return target;
  }
  if (target - current > NH_CAMERA_FOCUS_RESET_DISTANCE_SCENE_UNITS) {
    return target;
  }
  if (target === current) {
    return current;
  }
  return current + (target - current) / 16;
}

export function updateNhCameraAngles(
  current: NhCameraAngles,
  keys: NhCameraKeyState
): NhCameraAngles {
  let camAngleDY = current.camAngleDY;
  if (keys.left) {
    camAngleDY += truncateClientInt((-24 - camAngleDY) / 2);
  } else if (keys.right) {
    camAngleDY += truncateClientInt((24 - camAngleDY) / 2);
  } else {
    camAngleDY = truncateClientInt(camAngleDY / 2);
  }

  let camAngleDX = current.camAngleDX;
  if (keys.up) {
    camAngleDX += truncateClientInt((12 - camAngleDX) / 2);
  } else if (keys.down) {
    camAngleDX += truncateClientInt((-12 - camAngleDX) / 2);
  } else {
    camAngleDX = truncateClientInt(camAngleDX / 2);
  }

  return {
    yaw: wrapClientUnits(current.yaw + truncateClientInt(camAngleDY / 2)),
    pitch: clampPitch(current.pitch + truncateClientInt(camAngleDX / 2)),
    camAngleDX,
    camAngleDY
  };
}

export function updateNhCameraAnglesFromMouseDrag(
  current: NhCameraAngles,
  mouse: NhMouseCameraState,
  position: { readonly x: number; readonly y: number }
): NhMouseCameraUpdate {
  // Source: Client.java mouse camera branch. This differs from key smoothing because Nh sets
  // camAngleDX/DY directly from middle-button mouse deltas before applying the same /2 angle step.
  const mouseX = truncateClientInt(position.x);
  const mouseY = truncateClientInt(position.y);
  const deltaY = mouseY - mouse.clickedY;
  const camAngleDX = deltaY * 2;
  const clickedY = deltaY !== -1 && deltaY !== 1 ? truncateClientInt((mouse.clickedY + mouseY) / 2) : mouseY;
  const deltaX = mouse.clickedX - mouseX;
  const camAngleDY = deltaX * 2;
  const clickedX = deltaX !== -1 && deltaX !== 1 ? truncateClientInt((mouseX + mouse.clickedX) / 2) : mouseX;

  return {
    angles: {
      yaw: wrapClientUnits(current.yaw + truncateClientInt(camAngleDY / 2)),
      pitch: clampPitch(current.pitch + truncateClientInt(camAngleDX / 2)),
      camAngleDX,
      camAngleDY
    },
    mouse: {
      clickedX,
      clickedY
    }
  };
}

export function nhClampCameraZoomValue(value: number): number {
  return Math.max(NH_CAMERA_OUTER_ZOOM_LIMIT, Math.min(NH_CAMERA_INNER_ZOOM_LIMIT, truncateClientInt(value)));
}

export function nhCameraDoZoom(zoomHeight: number, zoomWidth: number): NhCameraZoom {
  return {
    zoomHeight: nhClampCameraZoomValue(zoomHeight),
    zoomWidth: nhClampCameraZoomValue(zoomWidth)
  };
}

export function updateNhCameraZoomFromScrollWheel(
  current: NhCameraZoom,
  wheelRotation: number
): NhCameraZoom {
  const rotation = truncateClientInt(wheelRotation);
  if (rotation === 0) {
    return current;
  }

  // Source: ScrollWheelZoomHandler.rs2asm / script 39:
  // int1 = 0 - (event_mousey * scrollWheelZoomIncrement); camera_do_zoom(current + int1).
  const delta = -rotation * NH_CAMERA_SCROLL_WHEEL_INCREMENT;
  return nhCameraDoZoom(current.zoomHeight + delta, current.zoomWidth + delta);
}

export function nhCameraZoomFromSliderOffset(
  offset: number,
  sliderRange: number
): NhCameraZoom {
  const range = Math.max(1, truncateClientInt(sliderRange));
  const clampedOffset = Math.max(0, Math.min(range, truncateClientInt(offset)));
  const value =
    Math.trunc(
      (clampedOffset * (NH_CAMERA_INNER_ZOOM_LIMIT - NH_CAMERA_OUTER_ZOOM_LIMIT)) / range
    ) + NH_CAMERA_OUTER_ZOOM_LIMIT;
  return nhCameraDoZoom(value, value);
}

export function nhCameraZoomSliderOffset(
  zoom: NhCameraZoom,
  viewportHeight: number,
  sliderRange: number
): number {
  const range = Math.max(1, truncateClientInt(sliderRange));
  const value = viewportHeight > NH_CAMERA_DEFAULT_VIEWPORT_HEIGHT ? zoom.zoomWidth : zoom.zoomHeight;
  return Math.trunc(
    ((nhClampCameraZoomValue(value) - NH_CAMERA_OUTER_ZOOM_LIMIT) * range) /
      (NH_CAMERA_INNER_ZOOM_LIMIT - NH_CAMERA_OUTER_ZOOM_LIMIT)
  );
}

export function isNhCameraKeyHeld(keys: NhCameraKeyState): boolean {
  return keys.left || keys.right || keys.up || keys.down;
}

export function isNhCameraMoving(angles: NhCameraAngles): boolean {
  return angles.camAngleDX !== 0 || angles.camAngleDY !== 0;
}

function radiansToClientUnits(radians: number): number {
  return wrapClientUnits(Math.round(radians / radiansPerClientUnit));
}

function wrapClientUnits(units: number): number {
  return ((Math.round(units) % NH_CAMERA_UNITS) + NH_CAMERA_UNITS) % NH_CAMERA_UNITS;
}

function clampPitch(units: number): number {
  return Math.max(NH_CAMERA_MIN_PITCH, Math.min(NH_CAMERA_MAX_PITCH, Math.round(units)));
}

function truncateClientInt(value: number): number {
  return Math.trunc(value);
}

function nhCameraZoomScale(viewportHeight: number, zoom: NhCameraZoom): number {
  const heightDelta = Math.max(0, Math.min(100, Math.trunc(viewportHeight) - viewportBaseHeight));
  const zoomHeight = nhClampCameraZoomValue(zoom.zoomHeight);
  const zoomWidth = nhClampCameraZoomValue(zoom.zoomWidth);
  return Math.trunc(((zoomWidth - zoomHeight) * heightDelta) / 100 + zoomHeight);
}

function clientSine(units: number): number {
  // Source: Perspective.SINE/Rasterizer3D_sine cast the scaled trig value to int.
  return Math.trunc(Math.sin(clientUnitsToRadians(units)) * clientTrigAmplitude);
}

function clientCosine(units: number): number {
  // Source: Perspective.COSINE/Rasterizer3D_cosine cast the scaled trig value to int.
  return Math.trunc(Math.cos(clientUnitsToRadians(units)) * clientTrigAmplitude);
}

function arithmeticShift16(value: number): number {
  return Math.floor(value / clientTrigAmplitude);
}
