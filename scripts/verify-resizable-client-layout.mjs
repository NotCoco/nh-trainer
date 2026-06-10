import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

function loadTsModule(relativePath) {
  const sourcePath = path.resolve(projectRoot, relativePath);
  const cached = moduleCache.get(sourcePath);
  if (cached) {
    return cached.exports;
  }

  const source = readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true
    },
    fileName: sourcePath
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(sourcePath, module);
  vm.runInNewContext(
    transpiled,
    { module, exports: module.exports, require: (request) => require(request), console },
    { filename: sourcePath }
  );
  return module.exports;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSame(name, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name} mismatch\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  }
}

const {
  NH_RESIZABLE_ROOT_GROUP_ID,
  NH_RESIZABLE_VIEWPORT_INTERFACE_CONTAINER_CHILD_ID,
  NH_GAME_VIEWPORT_CONTENT_TYPE,
  NH_MINIMAP_CONTENT_TYPE,
  NH_COMPASS_CONTENT_TYPE,
  resolveNhFixedClientLayout,
  scaleNhFixedClientLayout
} = loadTsModule("src/render/nhFixedLayout.ts");

const definitions = JSON.parse(
  readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "client-widgets.json"), "utf8")
);
const spellbookDefinitions = JSON.parse(
  readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "spellbooks.json"), "utf8")
);
const clientUiAtlas = JSON.parse(
  readFileSync(path.join(projectRoot, "fixtures", "render", "sprites", "client_ui.json"), "utf8")
);
const hudSource = readFileSync(path.join(projectRoot, "src", "ui", "NhClientHud.tsx"), "utf8");
const runtimeViewerSource = readFileSync(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");

const group161 = definitions.groups.find((group) => group.groupId === 161);
assert(group161, "client widget export should include resizable old-school-box root group 161");
assert(
  definitions.groups.some((group) => group.groupId === 164),
  "client widget export should include resizable bottom-line root group 164"
);

const rootViewport = group161.widgets.find((widget) => widget.childId === 1);
assert(rootViewport?.contentType === NH_GAME_VIEWPORT_CONTENT_TYPE, "group 161 child 1 should be the game viewport");
assertSame("group 161 viewport fill modes", {
  x: rootViewport?.x,
  y: rootViewport?.y,
  width: rootViewport?.width,
  height: rootViewport?.height,
  widthMode: rootViewport?.widthMode,
  heightMode: rootViewport?.heightMode
}, {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  widthMode: 1,
  heightMode: 1
});

const requiredSprites = new Map([
  [897, ["resizable_mode_side_panel_background", 88, 60]],
  [1169, ["options_windowmode_fixed_disabled", 54, 46]],
  [1170, ["options_windowmode_resizable_disabled", 54, 46]],
  [1173, ["resizable_mode_tabs_top_row", 241, 37]],
  [1174, ["resizable_mode_tabs_bottom_row", 241, 37]],
  [1175, ["resizable_mode_side_panel_edge_left", 26, 261]],
  [1176, ["resizable_mode_side_panel_edge_right", 26, 261]],
  [1177, ["resizable_mode_minimap_and_compass_frame", 181, 165]],
  [1178, ["resizable_mode_minimap_alpha_mask", 152, 152]],
  [1179, ["resizable_mode_compass_alpha_mask", 35, 35]],
  [1180, ["resizable_mode_tab_stone_middle", 33, 36]],
  [1181, ["resizable_mode_tab_stone_middle_selected", 33, 36]],
  [1572, ["options_windowmode_fixed_enabled", 54, 46]],
  [1573, ["options_windowmode_resizable_enabled", 54, 46]]
]);
for (const [spriteId, [alias, width, height]] of requiredSprites) {
  const sprite = clientUiAtlas.sprites.find((entry) => entry.spriteId === spriteId);
  assert(sprite, `missing client_ui sprite ${spriteId}`);
  assertSame(`client_ui sprite ${spriteId}`, {
    alias: sprite.alias,
    width: sprite.width,
    height: sprite.height
  }, {
    alias,
    width,
    height
  });
}

const rootSize = { width: 1000, height: 700 };
const layout = resolveNhFixedClientLayout(definitions, spellbookDefinitions, {
  displayMode: "resizable",
  rootSize
});
assert(layout.displayMode === "resizable", "resolved layout should be in resizable mode");
assert(layout.rootGroupId === NH_RESIZABLE_ROOT_GROUP_ID, "resolved layout should use group 161");
assert(layout.viewportWidget.widget.contentType === NH_GAME_VIEWPORT_CONTENT_TYPE, "resizable viewport content type mismatch");
assert(layout.minimapWidget?.widget.contentType === NH_MINIMAP_CONTENT_TYPE, "resizable minimap content type mismatch");
assert(layout.compassWidget?.widget.contentType === NH_COMPASS_CONTENT_TYPE, "resizable compass content type mismatch");
assert(layout.fixedViewportInterfaceContainer?.widget.childId === NH_RESIZABLE_VIEWPORT_INTERFACE_CONTAINER_CHILD_ID, "resizable side panel interface container mismatch");
assertSame("resizable fixedCanvas", layout.fixedCanvas, rootSize);
assertSame("resizable viewport", layout.viewport.rect, { x: 0, y: 0, width: 1000, height: 700 });
assertSame("resizable minimap", layout.minimapWidget?.rect, { x: 842, y: 8, width: 152, height: 152 });
assertSame("resizable compass", layout.compassWidget?.rect, { x: 823, y: 5, width: 35, height: 35 });
assertSame("resizable chatbox", layout.chatbox?.rect, { x: 0, y: 535, width: 519, height: 165 });
assertSame("resizable side panel", {
  backgroundSpriteId: layout.sidePanel?.backgroundSpriteId,
  rect: layout.sidePanel?.rect,
  tabCount: layout.sidePanel?.tabs.length
}, {
  backgroundSpriteId: 897,
  rect: { x: 779, y: 392, width: 200, height: 281 },
  tabCount: 14
});

const optionsInterface = layout.sidePanelInterfaces.options;
assert(optionsInterface, "resizable options tab should mount the options interface");
const fixedModeControl = optionsInterface.widgets.find((entry) => entry.widget.childId === 33);
const resizableModeControl = optionsInterface.widgets.find((entry) => entry.widget.childId === 34);
assertSame("resizable options fixed-mode control", fixedModeControl?.rect, { x: 809, y: 522, width: 62, height: 54 });
assertSame("resizable options resizable-mode control", resizableModeControl?.rect, { x: 887, y: 522, width: 62, height: 54 });

const scaled = scaleNhFixedClientLayout(layout, rootSize);
assertSame("resizable CSS layout", scaled, {
  scale: 1,
  surfaceRect: { x: 0, y: 0, width: 1000, height: 700 },
  viewportRect: { x: 0, y: 0, width: 1000, height: 700 },
  minimapRect: { x: 842, y: 8, width: 152, height: 152 },
  compassRect: { x: 823, y: 5, width: 35, height: 35 }
});

assert(hudSource.includes("function NhOptionsWindowModeLayer"), "HUD should render a settings-tab window-mode layer");
assert(!hudSource.includes("optionsSoundControlsActive"), "HUD should not hide fixed/resizable window-mode controls when options sound sliders are mounted");
assert(hudSource.includes("nhOptionsWindowModeSeparatedOffsetY = 74"), "HUD should move window-mode icons below options sliders without clipping the bottom tab row");
assert(
  hudSource.includes("nhOptionsWindowModeSuppressedChildIds.has(widget.widget.childId)") &&
    hudSource.includes("const nhOptionsWindowModeSuppressedChildIds") &&
    hudSource.includes("nhOptionsWindowModeFixedContainerChildId") &&
    hudSource.includes("nhOptionsWindowModeResizableContainerChildId"),
  "HUD should suppress source window-mode widgets when rendering the separated generated controls so they cannot overlap sound sliders"
);
assert(
  hudSource.includes("{ childId: 51, spriteId: 692, sourceVarpValue: 0 }") &&
    hudSource.includes("{ childId: 55, spriteId: 696, sourceVarpValue: 4 }") &&
    hudSource.includes("{ childId: 57, spriteId: 692, sourceVarpValue: 0 }") &&
    hudSource.includes("{ childId: 61, spriteId: 696, sourceVarpValue: 4 }") &&
    hudSource.includes("const nhOptionsSoundSliderKnobSpriteId = 1201") &&
    hudSource.includes("function nhOptionsSoundToggleKnobRect"),
  "options sound sliders should map left-to-right from muted 0 to full volume 4 using the source knob sprite"
);
assert(hudSource.includes("options_windowmode_init/options_windowmode_draw/options_windowmode_set"), "HUD should keep source script anchors for window-mode buttons");
assert(hudSource.includes("nhOptionsWindowModeFixedSpriteId = 1169"), "HUD should use the source fixed-mode disabled icon");
assert(hudSource.includes("nhOptionsWindowModeResizableSpriteId = 1170"), "HUD should use the source resizable-mode disabled icon");
assert(hudSource.includes("nhOptionsWindowModeFixedSelectedSpriteId = 1572"), "HUD should use the source fixed-mode selected icon");
assert(hudSource.includes("nhOptionsWindowModeResizableSelectedSpriteId = 1573"), "HUD should use the source resizable-mode selected icon");
assert(runtimeViewerSource.includes("nhTrainer.clientDisplayMode.v1"), "runtime should persist client display mode");
assert(runtimeViewerSource.includes("displayMode === \"resizable\" ? rootSize : undefined"), "runtime should resolve resizable layout from the live client size");

console.log("Resizable client layout verification passed.");
