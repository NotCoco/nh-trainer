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

function readNhServerScript(fileName) {
  return fs.readFileSync(
    path.resolve(
      projectRoot,
      "..",
      "nh-osrs-184-master",
      "nh-osrs-184-master",
      "Nh-master",
      "scripts",
      fileName
    ),
    "utf8"
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const pluginSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/prayer/PrayerPlugin.java");
const configSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/prayer/PrayerConfig.java");
const flickLocationSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/prayer/PrayerFlickLocation.java");
const barOverlaySource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/prayer/PrayerBarOverlay.java");
const flickOverlaySource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/prayer/PrayerFlickOverlay.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const prayerSource = read("src/ui/runelitePrayer.ts");
const hudSource = read("src/ui/NhClientHud.tsx");
const cssSource = read("src/ui/styles.css");
const prayerInitSource = readNhServerScript("[clientscript,prayer_init].cs2");
const prayerUpdateButtonSource = readNhServerScript("[proc,prayer_updatebutton].cs2");

for (const sourceAnchor of [
  'name = "Prayer"',
  'description = "Show various information related to prayer"',
  'tags = {"combat", "flicking", "overlay"}',
  "overlayManager.add(flickOverlay)",
  "overlayManager.add(doseOverlay)",
  "overlayManager.add(barOverlay)",
  "getTickProgress()",
  "Duration.between(startOfLastTick, Instant.now()).toMillis()"
]) {
  assert(pluginSource.includes(sourceAnchor), `RuneLite PrayerPlugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("prayer")',
  'keyName = "prayerFlickLocation"',
  "return PrayerFlickLocation.NONE;",
  'keyName = "prayerFlickAlwaysOn"',
  'keyName = "showPrayerDoseIndicator"',
  'keyName = "showPrayerTooltip"',
  'keyName = "showPrayerBar"',
  'keyName = "prayerBarHideIfNotPraying"',
  'keyName = "prayerBarHideIfNonCombat"'
]) {
  assert(configSource.includes(sourceAnchor), `RuneLite PrayerConfig source missing ${sourceAnchor}`);
}

for (const sourceAnchor of ["NONE", "PRAYER_ORB", "PRAYER_BAR", "BOTH"]) {
  assert(flickLocationSource.includes(sourceAnchor), `RuneLite PrayerFlickLocation source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "BAR_FILL_COLOR = new Color(0, 149, 151)",
  "BAR_BG_COLOR = Color.black",
  "FLICK_HELP_COLOR = Color.white",
  "PRAYER_BAR_SIZE = new Dimension(30, 5)",
  "client.getLocalPlayer().getLogicalHeight() + 10",
  "Perspective.localToCanvas",
  "Math.ceil(Math.min((barWidth * ratio), barWidth))"
]) {
  assert(barOverlaySource.includes(sourceAnchor), `RuneLite PrayerBarOverlay source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "WidgetInfo.MINIMAP_QUICK_PRAYER_ORB",
  "bounds.getX() + 24",
  "bounds.getY() - 1",
  "double t = plugin.getTickProgress()",
  "graphics.setColor(Color.cyan)",
  "graphics.fillRect(orbInnerX + xOffset, orbInnerY + yOffset, 1, indicatorHeight)"
]) {
  assert(flickOverlaySource.includes(sourceAnchor), `RuneLite PrayerFlickOverlay source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  'id: "prayer"',
  'name: "Prayer"',
  'group: "prayer"',
  'sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/prayer/PrayerPlugin.java"',
  'sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/prayer/PrayerConfig.java"',
  'prayerFlickLocation: "NONE"',
  'showPrayerDoseIndicator: true',
  'hideIfNotPraying: true',
  "runelitePrayerFlickLocation"
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell missing Prayer anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "RUNELITE_PRAYER_BAR_WIDTH = 30",
  "RUNELITE_PRAYER_BAR_HEIGHT = 5",
  "RUNELITE_PRAYER_BAR_LOCAL_HEIGHT_OFFSET_PX = 10",
  'RUNELITE_PRAYER_ORB_FLICK_RGBA = "rgb(0, 255, 255)"',
  "RUNELITE_PRAYER_GAME_TICK_LENGTH_MS = 600",
  "runelitePrayerBarSnapshot",
  "runelitePrayerFlickOrbSnapshot",
  "nhActivePrayerIds"
]) {
  assert(prayerSource.includes(trainerAnchor), `runelitePrayer module missing source-backed anchor ${trainerAnchor}`);
}

for (const sourceAnchor of [
  "cc_setsize(34, 34, ^setsize_abs, ^setsize_abs);",
  "cc_setgraphic(\"prayerglow\");",
  ".cc_setsize(30, 30, ^setsize_abs, ^setsize_abs);",
  ".cc_setposition(0, 0, ^setpos_abs_centre, ^setpos_abs_centre);"
]) {
  assert(prayerInitSource.includes(sourceAnchor), `Nh prayer_init source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  ".cc_setgraphic(enum(int, graphic, enum_865, $int1));",
  ".cc_setgraphic(enum(int, graphic, enum_864, $int1));"
]) {
  assert(prayerUpdateButtonSource.includes(sourceAnchor), `Nh prayer_updatebutton source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  "prayerIconGraphicSize = { width: 30, height: 30 }",
  "slot.rect.width - prayerIconGraphicSize.width",
  "slot.rect.height - prayerIconGraphicSize.height",
  'data-source-graphic-widget="prayer_init child 1 cc_setsize(30, 30) cc_setposition(abs_centre, abs_centre)"'
]) {
  assert(hudSource.includes(trainerAnchor), `NhClientHud missing prayer icon placement anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  "applyRunelitePrayerConfig",
  "PrayerPlugin startUp overlayManager.add(flickOverlay/doseOverlay/barOverlay)",
  "PrayerBarOverlay setPosition(DYNAMIC) setPriority(HIGH) setLayer(ABOVE_SCENE)",
  "PrayerFlickOverlay setPosition(DYNAMIC) setLayer(ABOVE_WIDGETS)",
  "Perspective.localToCanvas(localPlayer, logicalHeight + 10)",
  "NH_PLAYER_DEFAULT_HEIGHT_CLIENT_UNITS + RUNELITE_PRAYER_BAR_LOCAL_HEIGHT_OFFSET_PX",
  "projectRuntimeActorClientOverlay(",
  "bounds.x + 24, bounds.y - 1",
  "RUNELITE_PRAYER_ORB_FLICK_RGBA",
  "runelitePrayerBarOverlay",
  "runelitePrayerFlickOrbOverlay"
]) {
  assert(runtimeSource.includes(trainerAnchor), `RuntimeSceneViewer missing Prayer runtime anchor ${trainerAnchor}`);
}

for (const cssAnchor of [
  ".runelitePrayerBarOverlay",
  "width: 30px",
  "height: 5px",
  "background: rgb(0, 149, 151)",
  "background: rgb(0, 255, 255)",
  ".runelitePrayerFlickOrbOverlay"
]) {
  assert(cssSource.includes(cssAnchor), `CSS missing Prayer anchor ${cssAnchor}`);
}

for (const asset of [
  "fixtures/runelite-plugins/prayer/front.png",
  "fixtures/runelite-plugins/prayer/back.png"
]) {
  assert(fs.existsSync(path.join(projectRoot, asset)), `Missing copied RuneLite Prayer asset ${asset}`);
}

console.log("RuneLite Prayer verifier passed: plugin/config, prayer bar, flick helper, prayer icon placement, and source assets are source-backed.");
