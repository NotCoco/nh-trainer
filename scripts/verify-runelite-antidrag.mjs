import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readNhClient(relativePath) {
  return fs.readFileSync(path.resolve(root, "..", "Nh184-Client", relativePath), "utf8");
}

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

const pluginSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/antidrag/AntiDragPlugin.java");
const configSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/antidrag/AntiDragConfig.java");
const customCursorSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/antidrag/CustomCursor.java");
const overlaySource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/antidrag/AntiDragOverlay.java");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const hudSource = read("src/ui/NhClientHud.tsx");
const cssSource = read("src/ui/styles.css");
const packageSource = read("package.json");

for (const sourceAnchor of [
  'name = "Anti Drag"',
  "private static final int DEFAULT_DELAY = 5",
  "client.setInventoryDragDelay(config.dragDelay())",
  "client.setInventoryDragDelay(DEFAULT_DELAY)",
  'event.getGroup().equals("antiDrag")',
  'case "alwaysOn":',
  'case "dragDelay":',
  'case ("changeCursor"):',
  'case ("color"):',
  "!focusChanged.isFocused() && config.reqFocus() && !config.alwaysOn()",
  "keyManager.registerKeyListener(holdListener)",
  "keyManager.registerKeyListener(toggleListener)",
  "toggleDrag = !toggleDrag",
  "overlayManager.add(overlay)",
  "overlayManager.remove(overlay)",
  "clientUI.setCursor(selectedCursor.getCursorImage(), selectedCursor.toString())",
  "clientUI.resetCursor()"
]) {
  check(pluginSource.includes(sourceAnchor), `AntiDragPlugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("antiDrag")',
  'keyName = "alwaysOn"',
  'disabledBy = "toggleKeyBind || holdKeyBind"',
  'hide = "toggleKeyBind || holdKeyBind"',
  'keyName = "toggleKeyBind"',
  'disabledBy = "alwaysOn || holdKeyBind"',
  'keyName = "holdKeyBind"',
  'disabledBy = "alwaysOn || toggleKeyBind"',
  "new ModifierlessKeybind(KeyEvent.VK_SHIFT, 0)",
  "Constants.GAME_TICK_LENGTH / Constants.CLIENT_TICK_LENGTH",
  'keyName = "reqFocus"',
  'keyName = "overlay"',
  "new Color(255, 0, 0, 30)",
  'keyName = "changeCursor"',
  'keyName = "cursorStyle"',
  "return CustomCursor.RS3_GOLD"
]) {
  check(configSource.includes(sourceAnchor), `AntiDragConfig source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "public enum CustomCursor",
  'RS3_GOLD("RS3 Gold", "cursor-rs3-gold.png")',
  'RS3_SILVER("RS3 Silver", "cursor-rs3-silver.png")',
  'DRAGON_DAGGER("Dragon Dagger", "cursor-dragon-dagger.png")',
  'DRAGON_DAGGER_POISON("Dragon Dagger (p)", "cursor-dragon-dagger-p.png")',
  'TROUT("Trout", "cursor-trout.png")',
  'DRAGON_SCIMITAR("Dragon Scimitar", "cursor-dragon-scimitar.png")',
  'ARMADYL_GODSWORD("Armadyl Godsword", "cursor-armadyl-godsword.png")',
  'BANDOS_GODSWORD("Bandos Godsword", "cursor-bandos-godsword.png")',
  'MOUSE("Mouse", "cursor-mouse.png")',
  'SARADOMIN_GODSWORD("Saradomin Godsword", "cursor-saradomin-godsword.png")',
  'ZAMORAK_GODSWORD("Zamorak Godsword", "cursor-zamorak-godsword.png")',
  'SKILL_SPECS("Skill Specs", "cursor-skill-specs.png")',
  "ImageUtil.getResourceStreamFromClass(CustomCursorPlugin.class, icon)"
]) {
  check(customCursorSource.includes(sourceAnchor), `CustomCursor source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  "RADIUS = 20",
  "OverlayPosition.TOOLTIP",
  "OverlayPriority.HIGHEST",
  "OverlayLayer.ALWAYS_ON_TOP",
  "client.getMouseCanvasPosition()",
  "mouseCanvasPosition.getX() - RADIUS",
  "mouseCanvasPosition.getY() - RADIUS",
  "g.fillOval(bounds.x, bounds.y, bounds.width, bounds.height)"
]) {
  check(overlaySource.includes(sourceAnchor), `AntiDragOverlay source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  "RUNELITE_CLIENT_TICK_MS = 20",
  "RUNELITE_ANTI_DRAG_DEFAULT_DELAY_CLIENT_TICKS = 5",
  "RUNELITE_ANTI_DRAG_ONE_GAME_TICK_DELAY_CLIENT_TICKS = 30",
  "RUNELITE_ANTI_DRAG_OVERLAY_RADIUS = 20",
  "RuneliteAntiDragConfigSnapshot",
  'id: "anti-drag"',
  'group: "antiDrag"',
  'sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/antidrag/AntiDragConfig.java"',
  'keyName: "alwaysOn"',
  'hideWhen: ["toggleKeyBind", "holdKeyBind"]',
  'keyName: "toggleKeyBind"',
  'hideWhen: ["alwaysOn", "holdKeyBind"]',
  'keyName: "holdKeyBind"',
  'hideWhen: ["alwaysOn", "toggleKeyBind"]',
  'defaultValue: "Shift"',
  "defaultValue: RUNELITE_ANTI_DRAG_ONE_GAME_TICK_DELAY_CLIENT_TICKS",
  'keyName: "reqFocus"',
  'keyName: "overlay"',
  'defaultValue: "rgba(255, 0, 0, 0.12)"',
  'keyName: "changeCursor"',
  'keyName: "cursorStyle"',
  'defaultValue: "RS3_GOLD"',
  "RUNELITE_CUSTOM_CURSOR_ASSETS.map((cursor) => cursor.id)",
  "cursor-rs3-gold.png",
  "cursor-armadyl-godsword.png",
  "runeliteAntiDragKeyboardEventMatchesKeybind",
  "setAntiDragHotkeyState",
  "toggleDrag: !current.toggleDrag",
  "!event.repeat",
  "holdDrag: true",
  "holdDrag ? { ...current, holdDrag: false } : current",
  "handleAntiDragFocusLoss",
  "window.addEventListener(\"keydown\", handleAntiDragKeyDown)",
  "window.addEventListener(\"keyup\", handleAntiDragKeyUp)",
  "window.addEventListener(\"blur\", handleAntiDragFocusLoss)",
  "antiDragEnabled && (antiDragAlwaysOn || antiDragHotkeyActive)",
  "runeliteAntiDragCursorActive",
  "runeliteClientPanelStyle",
  "runeliteClientPanelCursorCss",
  'data-source-anti-drag-cursor="AntiDragPlugin toggleListener/holdListener call clientUI.setCursor(selectedCursor.getCursorImage(), selectedCursor.toString()); release/reset calls clientUI.resetCursor()"',
  'data-source-anti-drag-cursor-assets="Nh184-Client/runelite-client/src/main/resources/net/runelite/client/plugins/customcursor/cursor-*.png"',
  "config.enabled && !config.alwaysOn && config.changeCursor && config.hotkeyActive",
  'url("runelite-ui/customcursor/${asset.fileName}") 0 0, auto',
  "RUNELITE_ANTI_DRAG_DEFAULT_DELAY_CLIENT_TICKS",
  "RuneliteAntiDragOverlay",
  "data-source-overlay-file=\"Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/antidrag/AntiDragOverlay.java\"",
  "data-source-overlay-position=\"OverlayPosition.TOOLTIP\"",
  "data-source-overlay-priority=\"OverlayPriority.HIGHEST\"",
  "data-source-overlay-layer=\"OverlayLayer.ALWAYS_ON_TOP\"",
  "data-source-radius=\"AntiDragOverlay.RADIUS = 20\"",
  "config.enabled && !config.alwaysOn && config.overlay && config.hotkeyActive && mouseCanvasPosition.insideClient",
  "left: mouseCanvasPosition.x - RUNELITE_ANTI_DRAG_OVERLAY_RADIUS",
  "top: mouseCanvasPosition.y - RUNELITE_ANTI_DRAG_OVERLAY_RADIUS"
]) {
  check(shellSource.includes(trainerAnchor), `RuneliteClientShell missing AntiDrag anchor ${trainerAnchor}`);
}

for (const cursorAsset of [
  "cursor-armadyl-godsword.png",
  "cursor-bandos-godsword.png",
  "cursor-dragon-dagger-p.png",
  "cursor-dragon-dagger.png",
  "cursor-dragon-scimitar.png",
  "cursor-mouse.png",
  "cursor-rs3-gold.png",
  "cursor-rs3-silver.png",
  "cursor-saradomin-godsword.png",
  "cursor-skill-specs.png",
  "cursor-trout.png",
  "cursor-zamorak-godsword.png"
]) {
  check(
    fs.existsSync(path.join(root, "fixtures", "runelite-ui", "customcursor", cursorAsset)),
    `Missing copied RuneLite custom cursor asset ${cursorAsset}.`
  );
}

for (const runtimeAnchor of [
  "applyRuneliteAntiDragConfig",
  "canvas.dataset.runeliteAntiDragEnabled",
  "canvas.dataset.runeliteAntiDragEffectiveDelayClientTicks",
  "canvas.dataset.runeliteAntiDragEffectiveDelayMs",
  "AntiDragPlugin.DEFAULT_DELAY = 5",
  "AntiDragPlugin client.setInventoryDragDelay(config.dragDelay())",
  "AntiDragPlugin toggleListener hotkeyPressed toggleDrag client.setInventoryDragDelay(config.dragDelay())",
  "AntiDragPlugin holdListener hotkeyPressed/hotkeyReleased client.setInventoryDragDelay(config.dragDelay()/DEFAULT_DELAY)",
  "inventoryDragDelayClientTicks={runeliteClientConfig.antiDrag.effectiveDragDelayClientTicks}"
]) {
  check(runtimeSource.includes(runtimeAnchor), `RuntimeSceneViewer missing AntiDrag runtime anchor ${runtimeAnchor}`);
}

for (const hudAnchor of [
  "inventoryDragDelayClientTicks",
  "inventoryDragDelayMsFromClientTicks",
  "performance.now() - state.startedAtMs >= dragDelayMs",
  "data-source-inventory-drag-delay=\"Client.setInventoryDragDelay / AntiDragPlugin.DEFAULT_DELAY\"",
  "data-inventory-drag-delay-client-ticks",
  "onDragReorder"
]) {
  check(hudSource.includes(hudAnchor), `NhClientHud missing AntiDrag inventory anchor ${hudAnchor}`);
}

for (const cssAnchor of [
  ".runeliteAntiDragOverlay",
  "z-index: 200",
  "border-radius: 50%",
  "pointer-events: none"
]) {
  check(cssSource.includes(cssAnchor), `CSS missing AntiDrag overlay anchor ${cssAnchor}`);
}

check(
  packageSource.includes('"verify:runelite-antidrag": "node scripts/verify-runelite-antidrag.mjs"'),
  "package.json should expose verify:runelite-antidrag."
);

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      source: {
        defaultDelayClientTicks: 5,
        activeDelayClientTicks: 30,
        overlayRadius: 20
      },
      trainer: {
        inventoryDelayPath: "RuntimeSceneViewer -> NhClientHud inventoryDragDelayClientTicks",
        configGroup: "antiDrag"
      }
    },
    null,
    2
  )
);
