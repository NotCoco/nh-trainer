export interface KronosCameraAngles {
  readonly yaw: number;
  readonly pitch: number;
  readonly camAngleDX: number;
  readonly camAngleDY: number;
}

export interface KronosCameraKeyState {
  readonly left: boolean;
  readonly right: boolean;
  readonly up: boolean;
  readonly down: boolean;
}

export interface KronosMouseCameraState {
  readonly clickedX: number;
  readonly clickedY: number;
}

export interface KronosMouseCameraUpdate {
  readonly angles: KronosCameraAngles;
  readonly mouse: KronosMouseCameraState;
}

export interface KronosCameraZoom {
  readonly zoomHeight: number;
  readonly zoomWidth: number;
}

export type KronosRuntimeCameraPresetName = "isometric" | "north" | "south" | "top";

export interface KronosRuntimeCameraPreset {
  readonly yaw: number;
  readonly pitch: number;
}

export const KRONOS_CAMERA_UNITS = 2048;
export const KRONOS_CAMERA_MIN_PITCH = 128;
export const KRONOS_CAMERA_MAX_PITCH = 383;
export const KRONOS_CAMERA_DEFAULT_PITCH_UNITS = 128;
export const KRONOS_CAMERA_DEFAULT_YAW_UNITS = 0;
export const KRONOS_CAMERA_DEFAULT_VIEWPORT_HEIGHT = 334;
export const KRONOS_CAMERA_DEFAULT_VIEWPORT_ZOOM = 256;
export const KRONOS_CAMERA_DEFAULT_FOV_DEGREES = kronosViewportZoomToFovDegrees(
  KRONOS_CAMERA_DEFAULT_VIEWPORT_HEIGHT,
  KRONOS_CAMERA_DEFAULT_VIEWPORT_ZOOM
);
export const KRONOS_CAMERA_OUTER_ZOOM_LIMIT = 128;
export const KRONOS_CAMERA_INNER_ZOOM_LIMIT = 896;
export const KRONOS_CAMERA_SCROLL_WHEEL_INCREMENT = 25;
export const KRONOS_CAMERA_DEFAULT_ZOOM_HEIGHT = 512;
export const KRONOS_CAMERA_DEFAULT_ZOOM_WIDTH = 512;
export const KRONOS_CAMERA_DEFAULT_ZOOM: KronosCameraZoom = {
  zoomHeight: KRONOS_CAMERA_DEFAULT_ZOOM_HEIGHT,
  zoomWidth: KRONOS_CAMERA_DEFAULT_ZOOM_WIDTH
};
export const KRONOS_CLIENT_TILE_UNITS = 128;
export const KRONOS_SCENE_TILE_UNITS = 0.5;
export const KRONOS_CLIENT_TO_SCENE_UNITS = KRONOS_SCENE_TILE_UNITS / KRONOS_CLIENT_TILE_UNITS;
export const KRONOS_CAMERA_DEFAULT_FOLLOW_HEIGHT_UNITS = 75;
export const KRONOS_CAMERA_FOCUS_RESET_DISTANCE_UNITS = 500;
export const KRONOS_CAMERA_FOCUS_RESET_DISTANCE_SCENE_UNITS =
  KRONOS_CAMERA_FOCUS_RESET_DISTANCE_UNITS * KRONOS_CLIENT_TO_SCENE_UNITS;
export const KRONOS_RUNTIME_CAMERA_PRESETS = {
  isometric: { yaw: 256, pitch: KRONOS_CAMERA_DEFAULT_PITCH_UNITS },
  north: { yaw: KRONOS_CAMERA_DEFAULT_YAW_UNITS, pitch: KRONOS_CAMERA_DEFAULT_PITCH_UNITS },
  south: { yaw: 1024, pitch: KRONOS_CAMERA_DEFAULT_PITCH_UNITS },
  top: { yaw: 256, pitch: KRONOS_CAMERA_MAX_PITCH }
} satisfies Record<KronosRuntimeCameraPresetName, KronosRuntimeCameraPreset>;

const radiansPerClientUnit = (Math.PI * 2) / KRONOS_CAMERA_UNITS;
const clientTrigAmplitude = 65536;
const viewportBaseHeight = KRONOS_CAMERA_DEFAULT_VIEWPORT_HEIGHT;

export interface KronosClientCameraOffset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly distance: number;
  readonly zoomScale: number;
}

export interface KronosClientSceneCameraOffset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly distance: number;
  readonly zoomScale: number;
}

export function createKronosCameraAngles(yawRadians: number, pitchRadians: number): KronosCameraAngles {
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

export function kronosViewportZoomToFovDegrees(viewportHeight: number, viewportZoom: number): number {
  const height = Math.max(1, viewportHeight);
  const zoom = Math.max(1, viewportZoom);
  return (Math.atan(height / (2 * zoom)) * 360) / Math.PI;
}

export function kronosClientCameraOffset(
  angles: Pick<KronosCameraAngles, "yaw" | "pitch">,
  viewportHeight: number,
  zoom: KronosCameraZoom = KRONOS_CAMERA_DEFAULT_ZOOM
): KronosClientCameraOffset {
  const pitch = clampPitch(angles.pitch);
  const yaw = wrapClientUnits(angles.yaw);
  const zoomScale = kronosCameraZoomScale(viewportHeight, zoom);
  const distance = Math.trunc((kronosClientCameraBaseDistance(pitch) * zoomScale) / 256);
  const pitchRotation = wrapClientUnits(KRONOS_CAMERA_UNITS - pitch);
  const yawRotation = wrapClientUnits(KRONOS_CAMERA_UNITS - yaw);

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

export function kronosClientSceneCameraOffset(
  angles: Pick<KronosCameraAngles, "yaw" | "pitch">,
  viewportHeight: number,
  zoom: KronosCameraZoom = KRONOS_CAMERA_DEFAULT_ZOOM
): KronosClientSceneCameraOffset {
  const offset = kronosClientCameraOffset(angles, viewportHeight, zoom);
  return {
    x: offset.x * KRONOS_CLIENT_TO_SCENE_UNITS,
    y: offset.y * KRONOS_CLIENT_TO_SCENE_UNITS,
    z: offset.z * KRONOS_CLIENT_TO_SCENE_UNITS,
    distance: offset.distance * KRONOS_CLIENT_TO_SCENE_UNITS,
    zoomScale: offset.zoomScale
  };
}

export function kronosClientCameraBaseDistance(pitch: number): number {
  return clampPitch(pitch) * 3 + 600;
}

export function kronosRuntimeCameraPreset(name: KronosRuntimeCameraPresetName): KronosCameraAngles {
  const preset = KRONOS_RUNTIME_CAMERA_PRESETS[name];
  return {
    yaw: wrapClientUnits(preset.yaw),
    pitch: clampPitch(preset.pitch),
    camAngleDX: 0,
    camAngleDY: 0
  };
}

export function kronosCameraFollowHeightUnits(
  zoom: KronosCameraZoom = KRONOS_CAMERA_DEFAULT_ZOOM,
  viewportHeight: number = KRONOS_CAMERA_DEFAULT_VIEWPORT_HEIGHT
): number {
  const zoomScale = kronosCameraZoomScale(viewportHeight, zoom);
  return 25 + Math.trunc((25 * zoomScale) / 256);
}

export function kronosCameraFollowHeightSceneUnits(
  zoom: KronosCameraZoom = KRONOS_CAMERA_DEFAULT_ZOOM,
  viewportHeight: number = KRONOS_CAMERA_DEFAULT_VIEWPORT_HEIGHT
): number {
  return kronosCameraFollowHeightUnits(zoom, viewportHeight) * KRONOS_CLIENT_TO_SCENE_UNITS;
}

export function smoothKronosCameraFocusAxis(current: number, target: number): number {
  if (target - current < -KRONOS_CAMERA_FOCUS_RESET_DISTANCE_SCENE_UNITS) {
    return target;
  }
  if (target - current > KRONOS_CAMERA_FOCUS_RESET_DISTANCE_SCENE_UNITS) {
    return target;
  }
  if (target === current) {
    return current;
  }
  return current + (target - current) / 16;
}

export function updateKronosCameraAngles(
  current: KronosCameraAngles,
  keys: KronosCameraKeyState
): KronosCameraAngles {
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

export function updateKronosCameraAnglesFromMouseDrag(
  current: KronosCameraAngles,
  mouse: KronosMouseCameraState,
  position: { readonly x: number; readonly y: number }
): KronosMouseCameraUpdate {
  // Source: Client.java mouse camera branch. This differs from key smoothing because Kronos sets
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

export function kronosClampCameraZoomValue(value: number): number {
  return Math.max(KRONOS_CAMERA_OUTER_ZOOM_LIMIT, Math.min(KRONOS_CAMERA_INNER_ZOOM_LIMIT, truncateClientInt(value)));
}

export function kronosCameraDoZoom(zoomHeight: number, zoomWidth: number): KronosCameraZoom {
  return {
    zoomHeight: kronosClampCameraZoomValue(zoomHeight),
    zoomWidth: kronosClampCameraZoomValue(zoomWidth)
  };
}

export function updateKronosCameraZoomFromScrollWheel(
  current: KronosCameraZoom,
  wheelRotation: number
): KronosCameraZoom {
  const rotation = truncateClientInt(wheelRotation);
  if (rotation === 0) {
    return current;
  }

  // Source: ScrollWheelZoomHandler.rs2asm / script 39:
  // int1 = 0 - (event_mousey * scrollWheelZoomIncrement); camera_do_zoom(current + int1).
  const delta = -rotation * KRONOS_CAMERA_SCROLL_WHEEL_INCREMENT;
  return kronosCameraDoZoom(current.zoomHeight + delta, current.zoomWidth + delta);
}

export function kronosCameraZoomFromSliderOffset(
  offset: number,
  sliderRange: number
): KronosCameraZoom {
  const range = Math.max(1, truncateClientInt(sliderRange));
  const clampedOffset = Math.max(0, Math.min(range, truncateClientInt(offset)));
  const value =
    Math.trunc(
      (clampedOffset * (KRONOS_CAMERA_INNER_ZOOM_LIMIT - KRONOS_CAMERA_OUTER_ZOOM_LIMIT)) / range
    ) + KRONOS_CAMERA_OUTER_ZOOM_LIMIT;
  return kronosCameraDoZoom(value, value);
}

export function kronosCameraZoomSliderOffset(
  zoom: KronosCameraZoom,
  viewportHeight: number,
  sliderRange: number
): number {
  const range = Math.max(1, truncateClientInt(sliderRange));
  const value = viewportHeight > KRONOS_CAMERA_DEFAULT_VIEWPORT_HEIGHT ? zoom.zoomWidth : zoom.zoomHeight;
  return Math.trunc(
    ((kronosClampCameraZoomValue(value) - KRONOS_CAMERA_OUTER_ZOOM_LIMIT) * range) /
      (KRONOS_CAMERA_INNER_ZOOM_LIMIT - KRONOS_CAMERA_OUTER_ZOOM_LIMIT)
  );
}

export function isKronosCameraKeyHeld(keys: KronosCameraKeyState): boolean {
  return keys.left || keys.right || keys.up || keys.down;
}

export function isKronosCameraMoving(angles: KronosCameraAngles): boolean {
  return angles.camAngleDX !== 0 || angles.camAngleDY !== 0;
}

function radiansToClientUnits(radians: number): number {
  return wrapClientUnits(Math.round(radians / radiansPerClientUnit));
}

function wrapClientUnits(units: number): number {
  return ((Math.round(units) % KRONOS_CAMERA_UNITS) + KRONOS_CAMERA_UNITS) % KRONOS_CAMERA_UNITS;
}

function clampPitch(units: number): number {
  return Math.max(KRONOS_CAMERA_MIN_PITCH, Math.min(KRONOS_CAMERA_MAX_PITCH, Math.round(units)));
}

function truncateClientInt(value: number): number {
  return Math.trunc(value);
}

function kronosCameraZoomScale(viewportHeight: number, zoom: KronosCameraZoom): number {
  const heightDelta = Math.max(0, Math.min(100, Math.trunc(viewportHeight) - viewportBaseHeight));
  const zoomHeight = kronosClampCameraZoomValue(zoom.zoomHeight);
  const zoomWidth = kronosClampCameraZoomValue(zoom.zoomWidth);
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
