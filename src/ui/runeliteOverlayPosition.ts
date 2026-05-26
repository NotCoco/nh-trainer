import type { CSSProperties } from "react";

export interface RuneliteOverlayPreferredLocation {
  readonly x: number;
  readonly y: number;
}

export type RuneliteOverlayPreferredLocations = Readonly<Record<string, RuneliteOverlayPreferredLocation>>;

export const RUNELITE_OVERLAY_CONFIG_GROUP_NAME = "runelite";
export const RUNELITE_OVERLAY_CONFIG_PROPERTIES_STORAGE_KEY = "runelite.config.properties";
export const RUNELITE_OVERLAY_CONFIG_PREFERRED_LOCATION_SUFFIX = "_preferredLocation";
export const RUNELITE_OVERLAY_POSITION_SOURCE =
  "Overlay.getName() class simple name; OverlayManager stores runelite.<overlayName>_preferredLocation";

export function readRuneliteOverlayPreferredLocations(): RuneliteOverlayPreferredLocations {
  const locations: Record<string, RuneliteOverlayPreferredLocation> = {};
  for (const [key, value] of Object.entries(readRuneliteOverlayConfigProperties())) {
    const prefix = `${RUNELITE_OVERLAY_CONFIG_GROUP_NAME}.`;
    if (!key.startsWith(prefix) || !key.endsWith(RUNELITE_OVERLAY_CONFIG_PREFERRED_LOCATION_SUFFIX)) {
      continue;
    }

    const overlayName = key.slice(prefix.length, -RUNELITE_OVERLAY_CONFIG_PREFERRED_LOCATION_SUFFIX.length);
    const location = runeliteOverlayPreferredLocationFromProperty(value);
    if (overlayName && location) {
      locations[overlayName] = location;
    }
  }
  return locations;
}

export function saveRuneliteOverlayPreferredLocation(
  overlayName: string,
  location: RuneliteOverlayPreferredLocation | null
): RuneliteOverlayPreferredLocations {
  const properties = readRuneliteOverlayConfigProperties();
  const key = runeliteOverlayPreferredLocationPropertyKey(overlayName);
  if (location) {
    properties[key] = runeliteOverlayPreferredLocationToProperty(location);
  } else {
    delete properties[key];
  }
  writeRuneliteOverlayConfigProperties(sortRuneliteOverlayConfigProperties(properties));
  return readRuneliteOverlayPreferredLocations();
}

export function runeliteOverlayPreferredLocationStyle(
  overlayName: string,
  locations: RuneliteOverlayPreferredLocations,
  scale: number
): CSSProperties | null {
  const location = locations[overlayName];
  if (!location) {
    return null;
  }

  return {
    left: location.x,
    top: location.y,
    right: "auto",
    bottom: "auto",
    transform: `scale(${scale})`,
    transformOrigin: "left top"
  };
}

export function runeliteOverlayPreferredLocationPropertyKey(overlayName: string): string {
  return `${RUNELITE_OVERLAY_CONFIG_GROUP_NAME}.${overlayName}${RUNELITE_OVERLAY_CONFIG_PREFERRED_LOCATION_SUFFIX}`;
}

function runeliteOverlayPreferredLocationToProperty(location: RuneliteOverlayPreferredLocation): string {
  return `${Math.trunc(location.x)},${Math.trunc(location.y)}`;
}

function runeliteOverlayPreferredLocationFromProperty(value: string): RuneliteOverlayPreferredLocation | null {
  const commaMatch = value.trim().match(/^(-?\d+),(-?\d+)$/);
  if (commaMatch) {
    return {
      x: Number(commaMatch[1]),
      y: Number(commaMatch[2])
    };
  }

  try {
    const parsed = JSON.parse(value) as Partial<RuneliteOverlayPreferredLocation>;
    if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
      return {
        x: Number(parsed.x),
        y: Number(parsed.y)
      };
    }
  } catch {
    return null;
  }

  return null;
}

function readRuneliteOverlayConfigProperties(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(RUNELITE_OVERLAY_CONFIG_PROPERTIES_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : []))
    );
  } catch {
    return {};
  }
}

function writeRuneliteOverlayConfigProperties(properties: Record<string, string>): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(RUNELITE_OVERLAY_CONFIG_PROPERTIES_STORAGE_KEY, JSON.stringify(properties));
}

function sortRuneliteOverlayConfigProperties(properties: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(properties).sort(([left], [right]) => left.localeCompare(right)));
}
