import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function readNhClient(relativePath) {
  return fs.readFileSync(path.resolve(projectRoot, "..", "Nh184-Client", relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const overlaySource = readNhClient("runelite-client/src/main/java/net/runelite/client/ui/overlay/Overlay.java");
const overlayRendererSource = readNhClient("runelite-client/src/main/java/net/runelite/client/ui/overlay/OverlayRenderer.java");
const overlayManagerSource = readNhClient("runelite-client/src/main/java/net/runelite/client/ui/overlay/OverlayManager.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const positionSource = read("src/ui/runeliteOverlayPosition.ts");
const packageSource = read("package.json");

for (const sourceAnchor of [
  "public String getName()",
  "return this.getClass().getSimpleName()",
  "private Point preferredLocation",
  "private OverlayPosition preferredPosition",
  "private Rectangle bounds = new Rectangle()"
]) {
  assert(overlaySource.includes(sourceAnchor), `Overlay source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "if (e.isAltDown())",
  "inOverlayDraggingMode = true",
  "if (!e.isAltDown())",
  "inOverlayDraggingMode = false",
  "if (!inOverlayDraggingMode)",
  "SwingUtilities.isRightMouseButton(mouseEvent)",
  "overlayManager.resetOverlay(overlay)",
  "movedOverlay = overlay",
  "movedOverlay.setPreferredPosition(null)",
  "movedOverlay.setPreferredLocation(mousePoint)",
  "overlayManager.saveOverlay(movedOverlay)",
  "MiscUtils.clamp(mousePoint.x",
  "MiscUtils.clamp(mousePoint.y",
  "movedOverlay = null"
]) {
  assert(overlayRendererSource.includes(sourceAnchor), `OverlayRenderer source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "private static final String OVERLAY_CONFIG_PREFERRED_LOCATION = \"_preferredLocation\"",
  "public synchronized void saveOverlay(final Overlay overlay)",
  "saveOverlayPosition(overlay)",
  "saveOverlaySize(overlay)",
  "saveOverlayLocation(overlay)",
  "public synchronized void resetOverlay(final Overlay overlay)",
  "overlay.setPreferredLocation(null)",
  "RUNELITE_CONFIG_GROUP_NAME",
  "overlay.getName() + OVERLAY_CONFIG_PREFERRED_LOCATION"
]) {
  assert(overlayManagerSource.includes(sourceAnchor), `OverlayManager source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  "RUNELITE_OVERLAY_CONFIG_GROUP_NAME = \"runelite\"",
  "RUNELITE_OVERLAY_CONFIG_PROPERTIES_STORAGE_KEY = \"runelite.config.properties\"",
  "RUNELITE_OVERLAY_CONFIG_PREFERRED_LOCATION_SUFFIX = \"_preferredLocation\"",
  "RUNELITE_OVERLAY_POSITION_SOURCE",
  "readRuneliteOverlayPreferredLocations",
  "saveRuneliteOverlayPreferredLocation",
  "runeliteOverlayPreferredLocationPropertyKey",
  "runeliteOverlayPreferredLocationStyle",
  "runelite.<overlayName>_preferredLocation"
]) {
  assert(positionSource.includes(trainerAnchor), `runeliteOverlayPosition missing ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "RUNELITE_OVERLAY_DRAG_SOURCE",
  "overlayDraggingModeRef",
  "movingOverlayRef",
  "runeliteOverlayElementAtPoint",
  "runeliteClientPanelPoint",
  "runeliteClampedOverlayLocation",
  "event.currentTarget.setPointerCapture(event.pointerId)",
  "event.currentTarget.releasePointerCapture(event.pointerId)",
  "saveRuneliteOverlayPreferredLocation(overlayName, null)",
  "saveRuneliteOverlayPreferredLocation(movingOverlay.overlayName, location)",
  "runelite-overlay-locations-changed",
  "data-source-overlay-drag={RUNELITE_OVERLAY_DRAG_SOURCE}",
  "data-source-overlay-position={RUNELITE_OVERLAY_POSITION_SOURCE}",
  "data-runelite-overlay-name=\"PvpPerformanceTrackerOverlay\""
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell missing overlay drag anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "readRuneliteOverlayPreferredLocations",
  "runeliteOverlayPreferredLocationStyle",
  "runeliteOverlayLocations",
  "runelite-overlay-locations-changed",
  "data-source-overlay-position-storage={RUNELITE_OVERLAY_POSITION_SOURCE}",
  "data-runelite-overlay-name=\"AttackStylesOverlay\"",
  "data-runelite-overlay-name={runeliteBoostsOverlay.mode === \"combat-icons\" ? \"CombatIconsOverlay\" : \"BoostsOverlay\"}",
  "data-runelite-overlay-name=\"InfoBoxOverlay\"",
  "data-runelite-overlay-name=\"PlayerComparisonOverlay\"",
  "data-runelite-overlay-name=\"OpponentInfoOverlay\"",
  "RUNELITE_FIGHT_START_OVERLAY_NAME",
  "runtimeFightStartOverlayStyle(fixedClientCssLayout, runeliteOverlayLocations)",
  "data-runelite-overlay-name={RUNELITE_FIGHT_START_OVERLAY_NAME}"
]) {
  assert(runtimeSource.includes(trainerAnchor), `RuntimeSceneViewer missing overlay drag anchor ${trainerAnchor}`);
}

assert(packageSource.includes('"verify:runelite-overlay-drag"'), "package.json missing verify:runelite-overlay-drag script");

console.log("RuneLite overlay-drag verifier passed: Alt drag, right-click reset, preferredLocation storage, and movable overlay names are source-backed.");
