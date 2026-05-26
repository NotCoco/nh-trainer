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

const {
  KRONOS_FIXED_ROOT_GROUP_ID,
  KRONOS_FIXED_VIEWPORT_INTERFACE_CONTAINER_CHILD_ID,
  KRONOS_GAME_VIEWPORT_CONTENT_TYPE,
  KRONOS_MINIMAP_CONTENT_TYPE,
  KRONOS_COMPASS_CONTENT_TYPE,
  KRONOS_CHATBOX_GROUP_ID,
  KRONOS_COMBAT_GROUP_ID,
  KRONOS_SKILLS_GROUP_ID,
  KRONOS_EQUIPMENT_GROUP_ID,
  KRONOS_PRAYER_GROUP_ID,
  KRONOS_SPELLBOOK_GROUP_ID,
  KRONOS_CLAN_CHAT_GROUP_ID,
  KRONOS_NOTICEBOARD_GROUP_ID,
  KRONOS_FRIENDS_GROUP_ID,
  KRONOS_IGNORES_GROUP_ID,
  KRONOS_LOGOUT_GROUP_ID,
  KRONOS_OPTIONS_GROUP_ID,
  KRONOS_EMOTES_GROUP_ID,
  KRONOS_MUSIC_GROUP_ID,
  kronosSelectedSpellName,
  kronosSpellTargetFlagsFromClickMask,
  pointInKronosRect,
  resolveKronosFixedClientLayout,
  scaleKronosFixedClientLayout
} = loadTsModule("src/render/kronosFixedLayout.ts");
const { kronosViewportZoomToFovDegrees } = loadTsModule("src/render/kronosClientCamera.ts");

const definitions = JSON.parse(
  readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "client-widgets.json"), "utf8")
);
const spellbookDefinitions = JSON.parse(
  readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "spellbooks.json"), "utf8")
);
const emoteDefinitions = JSON.parse(
  readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "emotes.json"), "utf8")
);
const emoteIconAtlas = JSON.parse(
  readFileSync(path.join(projectRoot, "fixtures", "render", "sprites", "emote_icons.json"), "utf8")
);
const clientUiAtlas = JSON.parse(
  readFileSync(path.join(projectRoot, "fixtures", "render", "sprites", "client_ui.json"), "utf8")
);
const compassAtlas = JSON.parse(
  readFileSync(path.join(projectRoot, "fixtures", "render", "sprites", "compass.json"), "utf8")
);
const hudSource = readFileSync(path.join(projectRoot, "src", "ui", "KronosClientHud.tsx"), "utf8");
const runtimeSceneSource = readFileSync(path.join(projectRoot, "src", "render", "runtimeScene.ts"), "utf8");
const assetManifestSource = readFileSync(path.join(projectRoot, "src", "assets", "index.ts"), "utf8");
const compassDrawSource = readFileSync(
  path.resolve(projectRoot, "..", "Kronos184-Client", "runelite-client", "src", "main", "java", "net", "runelite", "standalone", "SoundSystem.java"),
  "utf8"
);
const compassLoadSource = readFileSync(
  path.resolve(projectRoot, "..", "Kronos184-Client", "runelite-client", "src", "main", "java", "net", "runelite", "standalone", "class188.java"),
  "utf8"
);

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

function assertAlmost(name, actual, expected, epsilon = 1e-9) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${name} mismatch actual=${actual} expected=${expected}`);
  }
}

const layout = resolveKronosFixedClientLayout(definitions, spellbookDefinitions);
assert(layout.viewportWidget.widget.groupId === KRONOS_FIXED_ROOT_GROUP_ID, "viewport widget root group mismatch");
assert(
  layout.viewportWidget.widget.contentType === KRONOS_GAME_VIEWPORT_CONTENT_TYPE,
  "viewport widget content type mismatch"
);
assertSame("fixed viewport interface container", {
  childId: layout.fixedViewportInterfaceContainer?.widget.childId,
  widgetId: layout.fixedViewportInterfaceContainer?.widget.id,
  rect: layout.fixedViewportInterfaceContainer?.rect
}, {
  childId: KRONOS_FIXED_VIEWPORT_INTERFACE_CONTAINER_CHILD_ID,
  widgetId: 35913793,
  rect: { x: 547, y: 205, width: 190, height: 261 }
});
assert(layout.minimapWidget?.widget.contentType === KRONOS_MINIMAP_CONTENT_TYPE, "minimap widget content type mismatch");
assert(layout.compassWidget?.widget.contentType === KRONOS_COMPASS_CONTENT_TYPE, "compass widget content type mismatch");

assertSame("fixed canvas", layout.fixedCanvas, { width: 765, height: 503 });
assertSame("game viewport rect", layout.viewport.rect, { x: 4, y: 4, width: 512, height: 334 });
assert(layout.viewport.zoom === 256, `expected fixed viewport zoom 256, got ${layout.viewport.zoom}`);
assert(
  clientUiAtlas.sprites.some((sprite) => sprite.spriteId === 4 && sprite.alias === "rs2_window_frame_edge_left"),
  "client_ui atlas should include Kronos RS2_WINDOW_FRAME_EDGE_LEFT sprite 4 for the fixed viewport left border"
);
assertSame("minimap rect", layout.minimapWidget?.rect, { x: 570, y: 9, width: 145, height: 151 });
assertSame("compass rect", layout.compassWidget?.rect, { x: 545, y: 4, width: 32, height: 33 });
const compassSprite = compassAtlas.sprites.find((sprite) => sprite.alias === "compass");
assert(compassSprite, "missing exported Kronos compass sprite");
assertSame("Kronos compass sprite metadata", {
  spriteId: compassSprite?.spriteId,
  width: compassSprite?.width,
  height: compassSprite?.height
}, {
  spriteId: 169,
  width: 51,
  height: 51
});
assert(
  compassDrawSource.includes("AttackOption.compass.method6205(var1, var2, var4.width, var4.height, 25, 25, Client.camAngleY, 256, var4.xStarts, var4.xWidths);"),
  "Kronos client compass draw contract changed"
);
assert(
  compassLoadSource.includes("AttackOption.compass = NPCDefinition.method4417(GrandExchangeOfferAgeComparator.archive8, WorldMapData_0.spriteIds.compass, 0"),
  "Kronos client compass load contract changed"
);
assert(hudSource.includes('compassAtlas={spriteAtlases.get("compass")}'), "HUD should pass the exported compass sprite atlas");
assert(hudSource.includes('findSprite(compassAtlas, "compass")'), "HUD should render the exported Kronos compass sprite");
assert(hudSource.includes("AttackOption.compass.method6205(var1,var2,mask.width,mask.height,25,25,Client.camAngleY,256,mask.xStarts,mask.xWidths)"), "HUD should keep the source compass draw contract anchored");
assert(runtimeSceneSource.includes('| "compass"'), "Runtime sprite sheet ids should include compass");
assert(assetManifestSource.includes('"fixtures/render/sprites/compass.png"'), "asset manifest should require compass sprite sheet");
assert(layout.chatbox?.groupId === KRONOS_CHATBOX_GROUP_ID, "chatbox group mismatch");
assertSame("chatbox mount", layout.chatbox?.rect, { x: 0, y: 338, width: 519, height: 165 });
const chatboxSprites = (layout.chatbox?.widgets ?? []).filter(
  (entry) => entry.widget.type === 5 && entry.widget.spriteId > 0
);
const findChatboxSprite = (spriteId, rect) =>
  chatboxSprites.find((entry) => entry.widget.spriteId === spriteId && JSON.stringify(entry.rect) === JSON.stringify(rect));
assert(findChatboxSprite(1018, { x: 0, y: 480, width: 519, height: 23 }), "missing chatbox buttons background");
assert(findChatboxSprite(1019, { x: 5, y: 480, width: 56, height: 22 }), "missing chatbox first button sprite");
assert(findChatboxSprite(1024, { x: 403, y: 480, width: 111, height: 22 }), "missing chatbox report sprite");
const chatboxTexts = new Map(
  (layout.chatbox?.widgets ?? [])
    .filter((entry) => entry.widget.type === 4 && entry.widget.text)
    .map((entry) => [
      entry.widget.text,
      {
        rect: entry.rect,
        fontId: entry.widget.fontId,
        lineHeight: entry.widget.lineHeight,
        xTextAlignment: entry.widget.xTextAlignment,
        yTextAlignment: entry.widget.yTextAlignment,
        textShadowed: entry.widget.textShadowed,
        textColor: entry.widget.textColor
      }
    ])
);
assertSame("chatbox Public text", chatboxTexts.get("Public"), {
  rect: { x: 137, y: 480, width: 56, height: 11 },
  fontId: 494,
  lineHeight: 0,
  xTextAlignment: 1,
  yTextAlignment: 1,
  textShadowed: true,
  textColor: 16777215
});
assertSame("chatbox Report text", chatboxTexts.get("Report"), {
  rect: { x: 403, y: 480, width: 111, height: 22 },
  fontId: 494,
  lineHeight: 0,
  xTextAlignment: 1,
  yTextAlignment: 1,
  textShadowed: true,
  textColor: 16777215
});
assertSame("inventory grid", layout.inventoryGrid, {
  groupId: 149,
  widgetId: 9764864,
  containerGroupId: KRONOS_FIXED_ROOT_GROUP_ID,
  containerWidgetId: 35913797,
  containerChildId: 69,
  containerRect: { x: 547, y: 205, width: 190, height: 261 },
  rect: { x: 563, y: 213, width: 162, height: 248 },
  columns: 4,
  rows: 7,
  slot: { width: 36, height: 32 },
  step: { width: 42, height: 36 },
  padding: { width: 10, height: 4 }
});
assertSame("fixed side panel", {
  groupId: layout.sidePanel?.groupId,
  rect: layout.sidePanel?.rect,
  backgroundSpriteId: layout.sidePanel?.backgroundSpriteId,
  defaultTabId: layout.sidePanel?.defaultTabId,
  tabCount: layout.sidePanel?.tabs.length
}, {
  groupId: KRONOS_FIXED_ROOT_GROUP_ID,
  rect: { x: 547, y: 205, width: 190, height: 261 },
  backgroundSpriteId: 1031,
  defaultTabId: "inventory",
  tabCount: 14
});
assertSame(
  "fixed side tab containers",
  layout.sidePanel?.tabs.map((tab) => ({
    id: tab.id,
    containerChildId: tab.container.childId,
    containerWidgetId: tab.container.widgetId,
    containerRect: tab.container.rect,
    containerHidden: tab.container.hidden
  })),
  [
    { id: "combat", containerChildId: 66, containerWidgetId: 35913794, containerRect: { x: 547, y: 205, width: 190, height: 261 }, containerHidden: true },
    { id: "stats", containerChildId: 67, containerWidgetId: 35913795, containerRect: { x: 547, y: 205, width: 190, height: 261 }, containerHidden: true },
    { id: "quests", containerChildId: 68, containerWidgetId: 35913796, containerRect: { x: 547, y: 205, width: 190, height: 261 }, containerHidden: true },
    { id: "inventory", containerChildId: 69, containerWidgetId: 35913797, containerRect: { x: 547, y: 205, width: 190, height: 261 }, containerHidden: true },
    { id: "equipment", containerChildId: 70, containerWidgetId: 35913798, containerRect: { x: 547, y: 205, width: 190, height: 261 }, containerHidden: true },
    { id: "prayer", containerChildId: 71, containerWidgetId: 35913799, containerRect: { x: 547, y: 205, width: 190, height: 261 }, containerHidden: true },
    { id: "magic", containerChildId: 72, containerWidgetId: 35913800, containerRect: { x: 547, y: 205, width: 190, height: 261 }, containerHidden: true },
    { id: "clan-chat", containerChildId: 73, containerWidgetId: 35913801, containerRect: { x: 547, y: 205, width: 190, height: 261 }, containerHidden: true },
    { id: "ignores", containerChildId: 74, containerWidgetId: 35913802, containerRect: { x: 547, y: 205, width: 190, height: 261 }, containerHidden: true },
    { id: "friends", containerChildId: 75, containerWidgetId: 35913803, containerRect: { x: 547, y: 205, width: 190, height: 261 }, containerHidden: true },
    { id: "logout", containerChildId: 76, containerWidgetId: 35913804, containerRect: { x: 547, y: 205, width: 190, height: 261 }, containerHidden: true },
    { id: "options", containerChildId: 77, containerWidgetId: 35913805, containerRect: { x: 547, y: 205, width: 190, height: 261 }, containerHidden: true },
    { id: "emotes", containerChildId: 78, containerWidgetId: 35913806, containerRect: { x: 547, y: 205, width: 190, height: 261 }, containerHidden: true },
    { id: "music", containerChildId: 79, containerWidgetId: 35913807, containerRect: { x: 547, y: 205, width: 190, height: 261 }, containerHidden: true }
  ]
);
const sidePanelInterfaceSummary = Object.fromEntries(
  Object.entries(layout.sidePanelInterfaces).map(([id, mounted]) => [
    id,
    {
      groupId: mounted.groupId,
      rect: mounted.rect,
      widgetCount: mounted.widgets.length,
      renderableSpriteCount: mounted.widgets.filter(
        (entry) => entry.widget.type === 5 && !entry.widget.hidden && entry.widget.spriteId > 0
      ).length,
      actionWidgetCount: mounted.widgets.filter((entry) => (entry.widget.actions?.length ?? 0) > 0).length
    }
  ])
);
assertSame("fixed side panel mounted interfaces", sidePanelInterfaceSummary, {
  combat: {
    groupId: KRONOS_COMBAT_GROUP_ID,
    rect: { x: 547, y: 205, width: 190, height: 261 },
    widgetCount: 43,
    renderableSpriteCount: 3,
    actionWidgetCount: 8
  },
  stats: {
    groupId: KRONOS_SKILLS_GROUP_ID,
    rect: { x: 547, y: 205, width: 190, height: 261 },
    widgetCount: 29,
    renderableSpriteCount: 2,
    actionWidgetCount: 24
  },
  quests: {
    groupId: KRONOS_NOTICEBOARD_GROUP_ID,
    rect: { x: 547, y: 205, width: 190, height: 261 },
    widgetCount: 39,
    renderableSpriteCount: 0,
    actionWidgetCount: 8
  },
  equipment: {
    groupId: KRONOS_EQUIPMENT_GROUP_ID,
    rect: { x: 547, y: 205, width: 190, height: 261 },
    widgetCount: 25,
    renderableSpriteCount: 9,
    actionWidgetCount: 15
  },
  prayer: {
    groupId: KRONOS_PRAYER_GROUP_ID,
    rect: { x: 547, y: 205, width: 190, height: 261 },
    widgetCount: 35,
    renderableSpriteCount: 0,
    actionWidgetCount: 29
  },
  magic: {
    groupId: KRONOS_SPELLBOOK_GROUP_ID,
    rect: { x: 547, y: 205, width: 190, height: 261 },
    widgetCount: 189,
    renderableSpriteCount: 0,
    actionWidgetCount: 73
  },
  "clan-chat": {
    groupId: KRONOS_CLAN_CHAT_GROUP_ID,
    rect: { x: 547, y: 205, width: 190, height: 261 },
    widgetCount: 26,
    renderableSpriteCount: 0,
    actionWidgetCount: 2
  },
  ignores: {
    groupId: KRONOS_IGNORES_GROUP_ID,
    rect: { x: 547, y: 205, width: 190, height: 261 },
    widgetCount: 17,
    renderableSpriteCount: 3,
    actionWidgetCount: 3
  },
  friends: {
    groupId: KRONOS_FRIENDS_GROUP_ID,
    rect: { x: 547, y: 205, width: 190, height: 261 },
    widgetCount: 19,
    renderableSpriteCount: 3,
    actionWidgetCount: 3
  },
  logout: {
    groupId: KRONOS_LOGOUT_GROUP_ID,
    rect: { x: 547, y: 205, width: 190, height: 261 },
    widgetCount: 40,
    renderableSpriteCount: 6,
    actionWidgetCount: 9
  },
  options: {
    groupId: KRONOS_OPTIONS_GROUP_ID,
    rect: { x: 547, y: 205, width: 190, height: 261 },
    widgetCount: 110,
    renderableSpriteCount: 20,
    actionWidgetCount: 44
  },
  emotes: {
    groupId: KRONOS_EMOTES_GROUP_ID,
    rect: { x: 547, y: 205, width: 190, height: 261 },
    widgetCount: 4,
    renderableSpriteCount: 0,
    actionWidgetCount: 0
  },
  music: {
    groupId: KRONOS_MUSIC_GROUP_ID,
    rect: { x: 547, y: 205, width: 190, height: 261 },
    widgetCount: 14,
    renderableSpriteCount: 3,
    actionWidgetCount: 3
  }
});

const kronosServerRoot = path.resolve(
  projectRoot,
  "..",
  "kronos-osrs-184-master",
  "kronos-osrs-184-master",
  "Kronos-master"
);
const interfaceSource = readFileSync(
  path.join(kronosServerRoot, "kronos-server", "src", "main", "java", "io", "ruin", "model", "inter", "Interface.java"),
  "utf8"
);
const tabSocialSource = readFileSync(
  path.join(
    kronosServerRoot,
    "kronos-server",
    "src",
    "main",
    "java",
    "io",
    "ruin",
    "model",
    "inter",
    "handlers",
    "TabSocial.java"
  ),
  "utf8"
);
const tabQuestSource = readFileSync(
  path.join(
    kronosServerRoot,
    "kronos-server",
    "src",
    "main",
    "java",
    "io",
    "ruin",
    "model",
    "inter",
    "handlers",
    "TabQuest.java"
  ),
  "utf8"
);
const assetExporterSource = readFileSync(
  path.join(
    kronosServerRoot,
    "runelite",
    "cache",
    "src",
    "main",
    "java",
    "net",
    "runelite",
    "cache",
    "tools",
    "KronosNhTrainerAssetExport.java"
  ),
  "utf8"
);
const emoteInitSource = readFileSync(path.join(kronosServerRoot, "scripts", "[clientscript,emote_init].cs2"), "utf8");
const fixedLayoutSource = readFileSync(path.join(projectRoot, "src", "render", "kronosFixedLayout.ts"), "utf8");
assert(interfaceSource.includes("public static final int IGNORE_LIST = 432;"), "Kronos Interface.IGNORE_LIST should be group 432");
assert(tabSocialSource.includes("p.openInterface(InterfaceType.SOCIAL_TAB, Interface.IGNORE_LIST);"), "friends tab should swap to Kronos ignore list");
assert(tabSocialSource.includes("p.openInterface(InterfaceType.SOCIAL_TAB, Interface.FRIENDS_LIST);"), "ignore tab should swap to Kronos friends list");
assert(fixedLayoutSource.includes("ignores: KRONOS_IGNORES_GROUP_ID"), "trainer fixed layout should mount Interface.IGNORE_LIST on the ignore tab");
assert(tabQuestSource.includes("player.getPacketSender().sendString(Interface.NOTICEBOARD"), "Kronos TabQuest should server-send noticeboard strings");
assert(tabQuestSource.includes('"Players Online: " + Color.GREEN.wrap'), "noticeboard should preserve Kronos server information text");
assert(hudSource.includes("kronosNoticeboardTextByChildId"), "trainer HUD should replace exported noticeboard placeholders with TabQuest strings");
assert(hudSource.includes("renderTaggedWidgetGlyphRun"), "trainer HUD should render Kronos <col> tagged widget text instead of showing tags");
assert(emoteInitSource.includes("while ($int6 <= 48)"), "Kronos emote clientscript should scan slots 0..48");
assert(emoteInitSource.includes("cc_setsize(42, 48"), "Kronos emote clientscript should create 42x48 emote cells");
assert(emoteInitSource.includes("cc_setposition(calc(($int4 % 4) * 43), $int5"), "Kronos emote clientscript should use four columns with 43px x-step");
assert(assetExporterSource.includes('SpriteRef.id("rs2_window_frame_edge_left", 4)'), "client_ui exporter should include Kronos RS2_WINDOW_FRAME_EDGE_LEFT sprite 4");
assert(assetExporterSource.includes("EMOTE_UNLOCKED_SPRITE_ENUM_ID = 1001"), "emote exporter should read Kronos unlocked emote sprite enum 1001");
assert(assetExporterSource.includes("emote_icons"), "emote exporter should emit a dedicated emote icon atlas");
assert(emoteDefinitions.nameEnumId === 1000, "emote names should come from Kronos enum 1000");
assert(emoteDefinitions.unlockedSpriteEnumId === 1001, "emote unlocked icons should come from Kronos enum 1001");
assert(emoteDefinitions.lockedSpriteEnumId === 1002, "emote locked icons should come from Kronos enum 1002");
assert(emoteDefinitions.emotes.length === 48, "expected 48 exported Kronos emote definitions");
assert(emoteDefinitions.emotes.some((entry) => entry.slot === 0 && entry.label === "Yes" && entry.unlockedSpriteId === 700), "expected exported Yes emote sprite 700");
assert(emoteIconAtlas.id === "emote_icons", "expected exported emote_icons atlas");
assert(emoteIconAtlas.sprites.some((sprite) => sprite.spriteId === 700 && sprite.maxWidth === 48 && sprite.maxHeight === 48), "expected Kronos emote sprite 700 in emote_icons atlas");
assert(hudSource.includes("data-source-client-script=\"emote_init\""), "trainer HUD should mount the emote clientscript-derived panel layer");
assert(hudSource.includes("spriteAtlases.get(\"emote_icons\")"), "trainer HUD should render emotes from the exported emote_icons atlas");
assert(hudSource.includes("kronosEmoteSpriteStyle"), "trainer HUD should size emote icons through the clientscript 42x48 cell geometry");

assertSame(
  "fixed combat panel static sprites",
  layout.sidePanelInterfaces.combat?.widgets
    .filter((entry) => entry.widget.type === 5 && !entry.widget.hidden && entry.widget.spriteId > 0)
    .map((entry) => ({
      childId: entry.widget.childId,
      widgetId: entry.widget.id,
      spriteId: entry.widget.spriteId,
      rect: entry.rect
    })),
  [
    { childId: 23, widgetId: 38862871, spriteId: 780, rect: { x: 681, y: 247, width: 32, height: 36 } },
    { childId: 24, widgetId: 38862872, spriteId: 760, rect: { x: 649, y: 254, width: 36, height: 36 } },
    { childId: 28, widgetId: 38862876, spriteId: 780, rect: { x: 668, y: 304, width: 32, height: 36 } }
  ]
);
assertSame(
  "fixed combat panel runtime text widgets",
  {
    groupId: layout.combatPanel?.groupId,
    weaponName: layout.combatPanel?.weaponName,
    combatLevel: layout.combatPanel?.combatLevel
  },
  {
    groupId: KRONOS_COMBAT_GROUP_ID,
    weaponName: {
      widgetId: 38862849,
      childId: 1,
      rect: { x: 547, y: 205, width: 190, height: 30 },
      fontId: 497,
      lineHeight: 0,
      xTextAlignment: 1,
      yTextAlignment: 1,
      textShadowed: true,
      textColor: 16750623
    },
    combatLevel: {
      widgetId: 38862851,
      childId: 3,
      rect: { x: 547, y: 230, width: 190, height: 12 },
      fontId: 494,
      lineHeight: 0,
      xTextAlignment: 1,
      yTextAlignment: 1,
      textShadowed: true,
      textColor: 16750623
    }
  }
);
assertSame(
  "fixed combat panel attack style widgets",
  layout.combatPanel?.styleSlots.map((slot) => ({
    index: slot.index,
    actionChildId: slot.actionChildId,
    actionWidgetId: slot.actionWidgetId,
    actionRect: slot.actionRect,
    sourceHidden: slot.sourceHidden,
    iconChildId: slot.iconChildId,
    iconWidgetId: slot.iconWidgetId,
    iconSpriteId: slot.iconSpriteId,
    iconRect: slot.iconRect,
    textChildId: slot.text.childId,
    textWidgetId: slot.text.widgetId,
    textRect: slot.text.rect,
    textFontId: slot.text.fontId,
    textColor: slot.text.textColor,
    actionCount: slot.actions.length
  })),
  [
    {
      index: 0,
      actionChildId: 4,
      actionWidgetId: 38862852,
      actionRect: { x: 567, y: 251, width: 68, height: 47 },
      sourceHidden: true,
      iconChildId: 6,
      iconWidgetId: 38862854,
      iconSpriteId: null,
      iconRect: { x: 584, y: 256, width: 34, height: 24 },
      textChildId: 7,
      textWidgetId: 38862855,
      textRect: { x: 567, y: 272, width: 68, height: 13 },
      textFontId: 494,
      textColor: 16750623,
      actionCount: 1
    },
    {
      index: 1,
      actionChildId: 8,
      actionWidgetId: 38862856,
      actionRect: { x: 649, y: 251, width: 68, height: 47 },
      sourceHidden: true,
      iconChildId: 10,
      iconWidgetId: 38862858,
      iconSpriteId: null,
      iconRect: { x: 666, y: 256, width: 34, height: 24 },
      textChildId: 11,
      textWidgetId: 38862859,
      textRect: { x: 649, y: 281, width: 68, height: 13 },
      textFontId: 494,
      textColor: 16750623,
      actionCount: 1
    },
    {
      index: 2,
      actionChildId: 12,
      actionWidgetId: 38862860,
      actionRect: { x: 567, y: 304, width: 68, height: 47 },
      sourceHidden: true,
      iconChildId: 14,
      iconWidgetId: 38862862,
      iconSpriteId: null,
      iconRect: { x: 584, y: 309, width: 34, height: 24 },
      textChildId: 15,
      textWidgetId: 38862863,
      textRect: { x: 567, y: 334, width: 68, height: 13 },
      textFontId: 494,
      textColor: 16750623,
      actionCount: 1
    },
    {
      index: 3,
      actionChildId: 16,
      actionWidgetId: 38862864,
      actionRect: { x: 649, y: 304, width: 68, height: 47 },
      sourceHidden: true,
      iconChildId: 18,
      iconWidgetId: 38862866,
      iconSpriteId: null,
      iconRect: { x: 666, y: 309, width: 34, height: 24 },
      textChildId: 19,
      textWidgetId: 38862867,
      textRect: { x: 649, y: 334, width: 68, height: 13 },
      textFontId: 494,
      textColor: 16750623,
      actionCount: 1
    }
  ]
);
assertSame(
  "fixed combat panel autocast source widgets",
  layout.combatPanel?.autocastControls.map((control) => ({
    id: control.id,
    widgetId: control.widgetId,
    childId: control.childId,
    rect: control.rect,
    actionText: control.actionText,
    actionCount: control.actions.length,
    defensive: control.defensive,
    displayWidgetId: control.displayWidgetId,
    displayChildId: control.displayChildId,
    displayRect: control.displayRect,
    magicIconWidgetId: control.magicIconWidgetId,
    magicIconChildId: control.magicIconChildId,
    magicIconSpriteId: control.magicIconSpriteId,
    magicIconRect: control.magicIconRect,
    defensiveIconWidgetId: control.defensiveIconWidgetId,
    defensiveIconChildId: control.defensiveIconChildId,
    defensiveIconSpriteId: control.defensiveIconSpriteId,
    defensiveIconRect: control.defensiveIconRect,
    labelWidgetId: control.label?.widgetId ?? null,
    labelChildId: control.label?.childId ?? null,
    labelRect: control.label?.rect ?? null,
    labelFontId: control.label?.fontId ?? null,
    labelTextColor: control.label?.textColor ?? null
  })),
  [
    {
      id: "defensive",
      widgetId: 38862869,
      childId: 21,
      rect: { x: 649, y: 250, width: 68, height: 44 },
      actionText: "Choose spell",
      actionCount: 1,
      defensive: true,
      displayWidgetId: 38862870,
      displayChildId: 22,
      displayRect: { x: 649, y: 250, width: 68, height: 44 },
      magicIconWidgetId: 38862871,
      magicIconChildId: 23,
      magicIconSpriteId: 780,
      magicIconRect: { x: 681, y: 247, width: 32, height: 36 },
      defensiveIconWidgetId: 38862872,
      defensiveIconChildId: 24,
      defensiveIconSpriteId: 760,
      defensiveIconRect: { x: 649, y: 254, width: 36, height: 36 },
      labelWidgetId: 38862873,
      labelChildId: 25,
      labelRect: { x: 649, y: 279, width: 68, height: 16 },
      labelFontId: 494,
      labelTextColor: 16750623
    },
    {
      id: "standard",
      widgetId: 38862874,
      childId: 26,
      rect: { x: 649, y: 303, width: 68, height: 44 },
      actionText: "Choose spell",
      actionCount: 1,
      defensive: false,
      displayWidgetId: 38862875,
      displayChildId: 27,
      displayRect: { x: 649, y: 303, width: 68, height: 44 },
      magicIconWidgetId: 38862876,
      magicIconChildId: 28,
      magicIconSpriteId: 780,
      magicIconRect: { x: 668, y: 304, width: 32, height: 36 },
      defensiveIconWidgetId: null,
      defensiveIconChildId: null,
      defensiveIconSpriteId: null,
      defensiveIconRect: null,
      labelWidgetId: 38862877,
      labelChildId: 29,
      labelRect: { x: 649, y: 332, width: 68, height: 16 },
      labelFontId: 494,
      labelTextColor: 16750623
    }
  ]
);
assertSame(
  "fixed combat panel special attack source widgets",
  {
    autoRetaliate: layout.combatPanel?.autoRetaliate,
    specialBar: layout.combatPanel?.specialBar
  },
  {
    autoRetaliate: {
      widgetId: 38862878,
      childId: 30,
      rect: { x: 567, y: 358, width: 150, height: 47 },
      actionText: "Auto retaliate",
      actions: ["Auto retaliate"]
    },
    specialBar: {
      containerWidgetId: 38862883,
      containerChildId: 35,
      containerRect: { x: 567, y: 405, width: 150, height: 26 },
      actionWidgetId: 38862884,
      actionChildId: 36,
      actionText: "Use <col=00ff00>Special Attack</col>",
      backgroundWidgetId: 38862885,
      backgroundChildId: 37,
      backgroundColor: 7538182,
      fillWidgetId: 38862887,
      fillChildId: 39,
      fillColor: 3767611,
      borderWidgetId: 38862889,
      borderChildId: 41,
      borderColor: 2894371,
      text: {
        widgetId: 38862888,
        childId: 40,
        rect: { x: 567, y: 405, width: 150, height: 26 },
        fontId: 494,
        lineHeight: 0,
        xTextAlignment: 1,
        yTextAlignment: 1,
        textShadowed: false,
        textColor: 16
      },
      actions: ["Use <col=00ff00>Special Attack</col>"]
    }
  }
);
const expectedStatsSlots = [
  ["attack", "Attack", 1, 1, 20971521, 197, 0, 0, 0, { x: 548, y: 206, width: 62, height: 32 }],
  ["strength", "Strength", 2, 2, 20971522, 198, 1, 0, 1, { x: 548, y: 238, width: 62, height: 32 }],
  ["defence", "Defence", 5, 3, 20971523, 199, 2, 0, 2, { x: 548, y: 270, width: 62, height: 32 }],
  ["ranged", "Ranged", 3, 4, 20971524, 200, 3, 0, 3, { x: 548, y: 302, width: 62, height: 32 }],
  ["prayer", "Prayer", 7, 5, 20971525, 201, 4, 0, 4, { x: 548, y: 334, width: 62, height: 32 }],
  ["magic", "Magic", 4, 6, 20971526, 202, 5, 0, 5, { x: 548, y: 366, width: 62, height: 32 }],
  ["runecrafting", "Runecrafting", 12, 7, 20971527, 215, 6, 0, 6, { x: 548, y: 398, width: 62, height: 32 }],
  ["construction", "Construction", 22, 8, 20971528, 221, 7, 0, 7, { x: 548, y: 430, width: 62, height: 32 }],
  ["hitpoints", "Hitpoints", 6, 9, 20971529, 203, 8, 1, 0, { x: 611, y: 206, width: 62, height: 32 }],
  ["agility", "Agility", 8, 10, 20971530, 204, 9, 1, 1, { x: 611, y: 238, width: 62, height: 32 }],
  ["herblore", "Herblore", 9, 11, 20971531, 205, 10, 1, 2, { x: 611, y: 270, width: 62, height: 32 }],
  ["thieving", "Thieving", 10, 12, 20971532, 206, 11, 1, 3, { x: 611, y: 302, width: 62, height: 32 }],
  ["crafting", "Crafting", 11, 13, 20971533, 207, 12, 1, 4, { x: 611, y: 334, width: 62, height: 32 }],
  ["fletching", "Fletching", 19, 14, 20971534, 208, 13, 1, 5, { x: 611, y: 366, width: 62, height: 32 }],
  ["slayer", "Slayer", 20, 15, 20971535, 216, 14, 1, 6, { x: 611, y: 398, width: 62, height: 32 }],
  ["hunter", "Hunter", 23, 16, 20971536, 220, 15, 1, 7, { x: 611, y: 430, width: 62, height: 32 }],
  ["mining", "Mining", 13, 17, 20971537, 209, 16, 2, 0, { x: 674, y: 206, width: 62, height: 32 }],
  ["smithing", "Smithing", 14, 18, 20971538, 210, 17, 2, 1, { x: 674, y: 238, width: 62, height: 32 }],
  ["fishing", "Fishing", 15, 19, 20971539, 211, 18, 2, 2, { x: 674, y: 270, width: 62, height: 32 }],
  ["cooking", "Cooking", 16, 20, 20971540, 212, 19, 2, 3, { x: 674, y: 302, width: 62, height: 32 }],
  ["firemaking", "Firemaking", 17, 21, 20971541, 213, 20, 2, 4, { x: 674, y: 334, width: 62, height: 32 }],
  ["woodcutting", "Woodcutting", 18, 22, 20971542, 214, 21, 2, 5, { x: 674, y: 366, width: 62, height: 32 }],
  ["farming", "Farming", 21, 23, 20971543, 217, 22, 2, 6, { x: 674, y: 398, width: 62, height: 32 }]
];
assertSame("fixed stats panel slots", {
  groupId: layout.statsPanel?.groupId,
  rect: layout.statsPanel?.rect,
  columns: layout.statsPanel?.columns,
  slot: layout.statsPanel?.slot,
  slots: layout.statsPanel?.slots.map((slot) => ({
    id: slot.id,
    label: slot.label,
    clientId: slot.clientId,
    childId: slot.childId,
    widgetId: slot.widgetId,
    spriteId: slot.spriteId,
    sourceOrder: slot.sourceOrder,
    gridColumn: slot.gridColumn,
    gridRow: slot.gridRow,
    rect: slot.rect,
    actionCount: slot.actions.length
  })),
  totalLevel: layout.statsPanel?.totalLevel
    ? {
        containerWidgetId: layout.statsPanel.totalLevel.containerWidgetId,
        containerChildId: layout.statsPanel.totalLevel.containerChildId,
        containerRect: layout.statsPanel.totalLevel.containerRect,
        leftSpriteWidgetId: layout.statsPanel.totalLevel.leftSpriteWidgetId,
        leftSpriteChildId: layout.statsPanel.totalLevel.leftSpriteChildId,
        leftSpriteId: layout.statsPanel.totalLevel.leftSpriteId,
        leftSpriteRect: layout.statsPanel.totalLevel.leftSpriteRect,
        rightSpriteWidgetId: layout.statsPanel.totalLevel.rightSpriteWidgetId,
        rightSpriteChildId: layout.statsPanel.totalLevel.rightSpriteChildId,
        rightSpriteId: layout.statsPanel.totalLevel.rightSpriteId,
        rightSpriteRect: layout.statsPanel.totalLevel.rightSpriteRect,
        textWidgetId: layout.statsPanel.totalLevel.textWidgetId,
        textChildId: layout.statsPanel.totalLevel.textChildId,
        textRect: layout.statsPanel.totalLevel.textRect,
        fontId: layout.statsPanel.totalLevel.fontId,
        lineHeight: layout.statsPanel.totalLevel.lineHeight,
        xTextAlignment: layout.statsPanel.totalLevel.xTextAlignment,
        yTextAlignment: layout.statsPanel.totalLevel.yTextAlignment,
        textShadowed: layout.statsPanel.totalLevel.textShadowed,
        textColor: layout.statsPanel.totalLevel.textColor,
        actionCount: layout.statsPanel.totalLevel.actions.length
      }
    : null
}, {
  groupId: KRONOS_SKILLS_GROUP_ID,
  rect: { x: 547, y: 205, width: 190, height: 261 },
  columns: 3,
  slot: { width: 62, height: 32 },
  slots: expectedStatsSlots.map(([id, label, clientId, childId, widgetId, spriteId, sourceOrder, gridColumn, gridRow, rect]) => ({
    id,
    label,
    clientId,
    childId,
    widgetId,
    spriteId,
    sourceOrder,
    gridColumn,
    gridRow,
    rect,
    actionCount: 2
  })),
  totalLevel: {
    containerWidgetId: 20971544,
    containerChildId: 24,
    containerRect: { x: 674, y: 430, width: 62, height: 32 },
    leftSpriteWidgetId: 20971545,
    leftSpriteChildId: 25,
    leftSpriteId: 183,
    leftSpriteRect: { x: 672, y: 428, width: 36, height: 36 },
    rightSpriteWidgetId: 20971546,
    rightSpriteChildId: 26,
    rightSpriteId: 184,
    rightSpriteRect: { x: 702, y: 428, width: 36, height: 36 },
    textWidgetId: 20971547,
    textChildId: 27,
    textRect: { x: 676, y: 433, width: 60, height: 29 },
    fontId: 494,
    lineHeight: 0,
    xTextAlignment: 1,
    yTextAlignment: 1,
    textShadowed: true,
    textColor: 16776960,
    actionCount: 1
  }
});
assertSame("fixed equipment panel slots", {
  groupId: layout.equipmentPanel?.groupId,
  rect: layout.equipmentPanel?.rect,
  slots: layout.equipmentPanel?.slots.map((slot) => ({
    id: slot.id,
    serverSlot: slot.serverSlot,
    childId: slot.childId,
    widgetId: slot.widgetId,
    rect: slot.rect,
    actionCount: slot.actions.length
  })),
  utilityButtons: layout.equipmentPanel?.utilityButtons.map((button) => ({
    id: button.id,
    label: button.label,
    childId: button.childId,
    widgetId: button.widgetId,
    rect: button.rect,
    clickMask: button.clickMask,
    actionText: button.actions[0] ?? "",
    actionCount: button.actions.length,
    spriteChildId: button.spriteChildId,
    spriteWidgetId: button.spriteWidgetId,
    spriteId: button.spriteId,
    spriteRect: button.spriteRect
  }))
}, {
  groupId: KRONOS_EQUIPMENT_GROUP_ID,
  rect: { x: 547, y: 205, width: 190, height: 261 },
  slots: [
    { id: "head", serverSlot: 0, childId: 6, widgetId: 25362438, rect: { x: 624, y: 209, width: 36, height: 36 }, actionCount: 10 },
    { id: "cape", serverSlot: 1, childId: 7, widgetId: 25362439, rect: { x: 583, y: 248, width: 36, height: 36 }, actionCount: 10 },
    { id: "amulet", serverSlot: 2, childId: 8, widgetId: 25362440, rect: { x: 624, y: 248, width: 36, height: 36 }, actionCount: 10 },
    { id: "weapon", serverSlot: 3, childId: 9, widgetId: 25362441, rect: { x: 568, y: 287, width: 36, height: 36 }, actionCount: 10 },
    { id: "body", serverSlot: 4, childId: 10, widgetId: 25362442, rect: { x: 624, y: 287, width: 36, height: 36 }, actionCount: 10 },
    { id: "shield", serverSlot: 5, childId: 11, widgetId: 25362443, rect: { x: 680, y: 287, width: 36, height: 36 }, actionCount: 10 },
    { id: "legs", serverSlot: 7, childId: 12, widgetId: 25362444, rect: { x: 624, y: 327, width: 36, height: 36 }, actionCount: 10 },
    { id: "hands", serverSlot: 9, childId: 13, widgetId: 25362445, rect: { x: 568, y: 367, width: 36, height: 36 }, actionCount: 10 },
    { id: "feet", serverSlot: 10, childId: 14, widgetId: 25362446, rect: { x: 624, y: 367, width: 36, height: 36 }, actionCount: 10 },
    { id: "ring", serverSlot: 12, childId: 15, widgetId: 25362447, rect: { x: 680, y: 367, width: 36, height: 36 }, actionCount: 10 },
    { id: "ammo", serverSlot: 13, childId: 16, widgetId: 25362448, rect: { x: 665, y: 248, width: 36, height: 36 }, actionCount: 10 }
  ],
  utilityButtons: [
    { id: "stats", label: "View equipment stats", childId: 17, widgetId: 25362449, rect: { x: 554, y: 413, width: 40, height: 40 }, clickMask: 2, actionText: "View equipment stats", actionCount: 1, spriteChildId: 18, spriteWidgetId: 25362450, spriteId: 675, spriteRect: { x: 557, y: 415, width: 32, height: 32 } },
    { id: "prices", label: "View guide prices", childId: 19, widgetId: 25362451, rect: { x: 599, y: 413, width: 40, height: 40 }, clickMask: 2, actionText: "View guide prices", actionCount: 1, spriteChildId: 20, spriteWidgetId: 25362452, spriteId: 1090, spriteRect: { x: 603, y: 417, width: 32, height: 32 } },
    { id: "items-kept-on-death", label: "View items kept on death", childId: 21, widgetId: 25362453, rect: { x: 644, y: 413, width: 40, height: 40 }, clickMask: 2, actionText: "View items kept on death", actionCount: 1, spriteChildId: 22, spriteWidgetId: 25362454, spriteId: 912, spriteRect: { x: 646, y: 416, width: 34, height: 34 } },
    { id: "call-follower", label: "Call follower", childId: 23, widgetId: 25362455, rect: { x: 689, y: 413, width: 40, height: 40 }, clickMask: 2, actionText: "Call follower", actionCount: 1, spriteChildId: 24, spriteWidgetId: 25362456, spriteId: 1343, spriteRect: { x: 692, y: 416, width: 32, height: 32 } }
  ]
});
const expectedPrayerSlots = [
  ["thick-skin", "Thick Skin", 5, 35454981, 115, 0, 0, 0],
  ["burst-of-strength", "Burst of Strength", 6, 35454982, 116, 1, 1, 0],
  ["clarity-of-thought", "Clarity of Thought", 7, 35454983, 117, 2, 2, 0],
  ["sharp-eye", "Sharp Eye", 23, 35454999, 133, 3, 3, 0],
  ["mystic-will", "Mystic Will", 24, 35455000, 134, 4, 4, 0],
  ["rock-skin", "Rock Skin", 8, 35454984, 118, 5, 0, 1],
  ["superhuman-strength", "Superhuman Strength", 9, 35454985, 119, 6, 1, 1],
  ["improved-reflexes", "Improved Reflexes", 10, 35454986, 120, 7, 2, 1],
  ["rapid-restore", "Rapid Restore", 11, 35454987, 121, 8, 3, 1],
  ["rapid-heal", "Rapid Heal", 12, 35454988, 122, 9, 4, 1],
  ["protect-item", "Protect Item", 13, 35454989, 123, 10, 0, 2],
  ["hawk-eye", "Hawk Eye", 25, 35455001, 502, 11, 1, 2],
  ["mystic-lore", "Mystic Lore", 26, 35455002, 503, 12, 2, 2],
  ["steel-skin", "Steel Skin", 14, 35454990, 124, 13, 3, 2],
  ["ultimate-strength", "Ultimate Strength", 15, 35454991, 125, 14, 4, 2],
  ["incredible-reflexes", "Incredible Reflexes", 16, 35454992, 126, 15, 0, 3],
  ["protect-from-magic", "Protect from Magic", 17, 35454993, 127, 16, 1, 3],
  ["protect-from-missiles", "Protect from Missiles", 18, 35454994, 128, 17, 2, 3],
  ["protect-from-melee", "Protect from Melee", 19, 35454995, 129, 18, 3, 3],
  ["eagle-eye", "Eagle Eye", 27, 35455003, 504, 19, 4, 3],
  ["mystic-might", "Mystic Might", 28, 35455004, 505, 20, 0, 4],
  ["retribution", "Retribution", 20, 35454996, 131, 21, 1, 4],
  ["redemption", "Redemption", 21, 35454997, 130, 22, 2, 4],
  ["smite", "Smite", 22, 35454998, 132, 23, 3, 4],
  ["preserve", "Preserve", 33, 35455009, 947, 24, 4, 4],
  ["chivalry", "Chivalry", 29, 35455005, 945, 25, 0, 5],
  ["piety", "Piety", 30, 35455006, 946, 26, 1, 5],
  ["rigour", "Rigour", 31, 35455007, 1420, 27, 2, 5],
  ["augury", "Augury", 32, 35455008, 1421, 28, 3, 5]
];
assertSame("fixed prayer panel slots", {
  groupId: layout.prayerPanel?.groupId,
  rect: layout.prayerPanel?.rect,
  containerWidgetId: layout.prayerPanel?.containerWidgetId,
  containerChildId: layout.prayerPanel?.containerChildId,
  containerRect: layout.prayerPanel?.containerRect,
  columns: layout.prayerPanel?.columns,
  slot: layout.prayerPanel?.slot,
  step: layout.prayerPanel?.step,
  slots: layout.prayerPanel?.slots.map((slot) => ({
    id: slot.id,
    label: slot.label,
    childId: slot.childId,
    widgetId: slot.widgetId,
    spriteId: slot.spriteId,
    sourceOrder: slot.sourceOrder,
    gridColumn: slot.gridColumn,
    gridRow: slot.gridRow,
    rect: slot.rect,
    actionCount: slot.actions.length
  }))
}, {
  groupId: KRONOS_PRAYER_GROUP_ID,
  rect: { x: 547, y: 205, width: 190, height: 261 },
  containerWidgetId: 35454980,
  containerChildId: 4,
  containerRect: { x: 551, y: 214, width: 182, height: 252 },
  columns: 5,
  slot: { width: 34, height: 34 },
  step: { width: 37, height: 37 },
  slots: expectedPrayerSlots.map(([id, label, childId, widgetId, spriteId, sourceOrder, gridColumn, gridRow]) => ({
    id,
    label,
    childId,
    widgetId,
    spriteId,
    sourceOrder,
    gridColumn,
    gridRow,
    rect: {
      x: 551 + gridColumn * 37,
      y: 214 + gridRow * 37,
      width: 34,
      height: 34
    },
    actionCount: 1
  }))
});
const expectedAncientSpells = [
  ["edgeville-home-teleport", "Edgeville Home Teleport", 11142, 98, 14286946, 356, 0, 0, 0, 10],
  ["smoke-rush", "Smoke Rush", 4629, 82, 14286930, 329, 1, 1, 0, 0],
  ["shadow-rush", "Shadow Rush", 4630, 86, 14286934, 337, 2, 2, 0, 0],
  ["paddewwa-teleport", "Paddewwa Teleport", 4631, 90, 14286938, 341, 3, 3, 0, 1],
  ["blood-rush", "Blood Rush", 4632, 78, 14286926, 333, 4, 0, 1, 0],
  ["ice-rush", "Ice Rush", 4633, 74, 14286922, 325, 5, 1, 1, 0],
  ["senntisten-teleport", "Senntisten Teleport", 4634, 91, 14286939, 342, 6, 2, 1, 1],
  ["smoke-burst", "Smoke Burst", 4635, 84, 14286932, 330, 7, 3, 1, 0],
  ["shadow-burst", "Shadow Burst", 4636, 88, 14286936, 338, 8, 0, 2, 0],
  ["kharyrll-teleport", "Kharyrll Teleport", 4637, 92, 14286940, 343, 9, 1, 2, 1],
  ["blood-burst", "Blood Burst", 4638, 80, 14286928, 334, 10, 2, 2, 0],
  ["ice-burst", "Ice Burst", 4639, 76, 14286924, 326, 11, 3, 2, 0],
  ["lassar-teleport", "Lassar Teleport", 4640, 93, 14286941, 344, 12, 0, 3, 1],
  ["smoke-blitz", "Smoke Blitz", 4641, 83, 14286931, 331, 13, 1, 3, 0],
  ["shadow-blitz", "Shadow Blitz", 4642, 87, 14286935, 339, 14, 2, 3, 0],
  ["dareeyak-teleport", "Dareeyak Teleport", 4643, 94, 14286942, 345, 15, 3, 3, 10],
  ["blood-blitz", "Blood Blitz", 4644, 79, 14286927, 335, 16, 0, 4, 0],
  ["ice-blitz", "Ice Blitz", 4645, 75, 14286923, 327, 17, 1, 4, 0],
  ["carrallangar-teleport", "Carrallangar Teleport", 4646, 95, 14286943, 346, 18, 2, 4, 10],
  ["teleport-to-bounty-target", "Teleport to Bounty Target", 17152, 68, 14286916, 359, 19, 3, 4, 10],
  ["smoke-barrage", "Smoke Barrage", 4647, 85, 14286933, 332, 20, 0, 5, 0],
  ["shadow-barrage", "Shadow Barrage", 4648, 89, 14286937, 340, 21, 1, 5, 0],
  ["annakarl-teleport", "Annakarl Teleport", 4649, 96, 14286944, 347, 22, 2, 5, 10],
  ["blood-barrage", "Blood Barrage", 4650, 81, 14286929, 336, 23, 3, 5, 0],
  ["ice-barrage", "Ice Barrage", 4651, 77, 14286925, 328, 24, 0, 6, 0],
  ["ghorrock-teleport", "Ghorrock Teleport", 4652, 97, 14286945, 348, 25, 1, 6, 10]
];
assertSame("fixed ancient spellbook panel", {
  id: layout.spellbookPanel?.id,
  enumId: layout.spellbookPanel?.enumId,
  spellbookVarbitId: layout.spellbookPanel?.spellbookVarbitId,
  spellbookVarbitValue: layout.spellbookPanel?.spellbookVarbitValue,
  disableFilteringVarbitId: layout.spellbookPanel?.disableFilteringVarbitId,
  disableFilteringVarbitValue: layout.spellbookPanel?.disableFilteringVarbitValue,
  layoutMode: layout.spellbookPanel?.layoutMode,
  groupId: layout.spellbookPanel?.groupId,
  rect: layout.spellbookPanel?.rect,
  parentWidgetId: layout.spellbookPanel?.parentWidgetId,
  parentChildId: layout.spellbookPanel?.parentChildId,
  parentRect: layout.spellbookPanel?.parentRect,
  boundsWidgetId: layout.spellbookPanel?.boundsWidgetId,
  boundsChildId: layout.spellbookPanel?.boundsChildId,
  spellAreaRect: layout.spellbookPanel?.spellAreaRect,
  columns: layout.spellbookPanel?.columns,
  rows: layout.spellbookPanel?.rows,
  slot: layout.spellbookPanel?.slot,
  gap: layout.spellbookPanel?.gap,
  step: layout.spellbookPanel?.step,
  spells: layout.spellbookPanel?.spells.map((spell) => ({
    id: spell.id,
    label: spell.label,
    itemId: spell.itemId,
    childId: spell.childId,
    widgetId: spell.widgetId,
    spriteId: spell.spriteId,
    sourceOrder: spell.sourceOrder,
    gridColumn: spell.gridColumn,
    gridRow: spell.gridRow,
    rect: spell.rect,
    actionCount: spell.actions.length
  }))
}, {
  id: "ancient",
  enumId: 1983,
  spellbookVarbitId: 4070,
  spellbookVarbitValue: 1,
  disableFilteringVarbitId: 6718,
  disableFilteringVarbitValue: 1,
  layoutMode: "disable-filtering-fixed",
  groupId: KRONOS_SPELLBOOK_GROUP_ID,
  rect: { x: 547, y: 205, width: 190, height: 261 },
  parentWidgetId: 14286849,
  parentChildId: 1,
  parentRect: { x: 550, y: 205, width: 184, height: 240 },
  boundsWidgetId: 14286851,
  boundsChildId: 3,
  spellAreaRect: { x: 566, y: 213, width: 156, height: 192 },
  columns: 4,
  rows: 7,
  slot: { width: 24, height: 24 },
  gap: { width: 20, height: 4 },
  step: { width: 44, height: 28 },
  spells: expectedAncientSpells.map(
    ([id, label, itemId, childId, widgetId, spriteId, sourceOrder, gridColumn, gridRow, actionCount]) => ({
      id,
      label,
      itemId,
      childId,
      widgetId,
      spriteId,
      sourceOrder,
      gridColumn,
      gridRow,
      rect: {
        x: 566 + gridColumn * 44,
        y: 213 + gridRow * 28,
        width: 24,
        height: 24
      },
      actionCount
    })
  )
});
const smokeRushSpell = layout.spellbookPanel?.spells.find((spell) => spell.id === "smoke-rush");
assertSame(
  "targetable ancient spell selected-spell fields",
  {
    clickMask: smokeRushSpell?.clickMask,
    targetFlags: smokeRushSpell?.targetFlags,
    targetFlagsFromMask: smokeRushSpell ? kronosSpellTargetFlagsFromClickMask(smokeRushSpell.clickMask) : null,
    spellActionName: smokeRushSpell?.spellActionName,
    selectedSpellName: smokeRushSpell ? kronosSelectedSpellName(smokeRushSpell) : null
  },
  {
    clickMask: 20480,
    targetFlags: 10,
    targetFlagsFromMask: 10,
    spellActionName: "Cast",
    selectedSpellName: "<col=00ff00>Smoke Rush<col=ffffff>"
  }
);
const paddewwaTeleportSpell = layout.spellbookPanel?.spells.find((spell) => spell.id === "paddewwa-teleport");
assertSame(
  "targetless ancient spell selected-spell fields",
  {
    clickMask: paddewwaTeleportSpell?.clickMask,
    targetFlags: paddewwaTeleportSpell?.targetFlags,
    spellActionName: paddewwaTeleportSpell?.spellActionName,
    actionCount: paddewwaTeleportSpell?.actions.length
  },
  {
    clickMask: 2,
    targetFlags: 0,
    spellActionName: "",
    actionCount: 1
  }
);
assertSame(
  "fixed spellbook panel coverage",
  Object.fromEntries(
    Object.entries(layout.spellbookPanels).map(([id, panel]) => [
      id,
      {
        enumId: panel.enumId,
        groupId: panel.groupId,
        spells: panel.spells.length,
        columns: panel.columns,
        rows: panel.rows
      }
    ])
  ),
  {
    standard: { enumId: 1982, groupId: KRONOS_SPELLBOOK_GROUP_ID, spells: 70, columns: 7, rows: 10 },
    ancient: { enumId: 1983, groupId: KRONOS_SPELLBOOK_GROUP_ID, spells: 26, columns: 4, rows: 7 },
    lunar: { enumId: 1984, groupId: KRONOS_SPELLBOOK_GROUP_ID, spells: 45, columns: 6, rows: 8 },
    arceuus: { enumId: 1985, groupId: KRONOS_SPELLBOOK_GROUP_ID, spells: 36, columns: 4, rows: 9 }
  }
);
const chargeWaterOrbSpell = layout.spellbookPanels.standard?.spells.find((spell) => spell.id === "charge-water-orb");
assertSame(
  "object-target standard spell selected-spell fields",
  {
    clickMask: chargeWaterOrbSpell?.clickMask,
    targetFlags: chargeWaterOrbSpell?.targetFlags,
    targetFlagsFromMask: chargeWaterOrbSpell ? kronosSpellTargetFlagsFromClickMask(chargeWaterOrbSpell.clickMask) : null,
    spellActionName: chargeWaterOrbSpell?.spellActionName,
    selectedSpellName: chargeWaterOrbSpell ? kronosSelectedSpellName(chargeWaterOrbSpell) : null,
    childId: chargeWaterOrbSpell?.childId,
    widgetId: chargeWaterOrbSpell?.widgetId,
    spriteId: chargeWaterOrbSpell?.spriteId,
    sourceOrder: chargeWaterOrbSpell?.sourceOrder,
    gridColumn: chargeWaterOrbSpell?.gridColumn,
    gridRow: chargeWaterOrbSpell?.gridRow
  },
  {
    clickMask: 8192,
    targetFlags: 4,
    targetFlagsFromMask: 4,
    spellActionName: "Cast",
    selectedSpellName: "<col=00ff00>Charge Water Orb<col=ffffff>",
    childId: 39,
    widgetId: 14286887,
    spriteId: 42,
    sourceOrder: 34,
    gridColumn: 6,
    gridRow: 4
  }
);
assertSame(
  "fixed side tabs",
  layout.sidePanel?.tabs.map((tab) => ({
    id: tab.id,
    childId: tab.childId,
    widgetId: tab.widgetId,
    row: tab.row,
    slotIndex: tab.slotIndex,
    spriteId: tab.spriteId,
    iconChildId: tab.iconChildId,
    iconSpriteId: tab.iconSpriteId,
    rect: tab.rect,
    iconRect: tab.iconRect,
    actions: tab.actions
  })),
  [
    {
      id: "combat",
      childId: 48,
      widgetId: 35913776,
      row: "top",
      slotIndex: 0,
      spriteId: 1026,
      iconChildId: 55,
      iconSpriteId: 168,
      rect: { x: 522, y: 168, width: 38, height: 36 },
      iconRect: { x: 526, y: 168, width: 33, height: 36 },
      actions: ["*"]
    },
    {
      id: "stats",
      childId: 49,
      widgetId: 35913777,
      row: "top",
      slotIndex: 1,
      spriteId: 1030,
      iconChildId: 56,
      iconSpriteId: 898,
      rect: { x: 560, y: 168, width: 33, height: 36 },
      iconRect: { x: 560, y: 168, width: 33, height: 36 },
      actions: ["*"]
    },
    {
      id: "quests",
      childId: 50,
      widgetId: 35913778,
      row: "top",
      slotIndex: 2,
      spriteId: 1030,
      iconChildId: 57,
      iconSpriteId: 899,
      rect: { x: 593, y: 168, width: 38, height: 36 },
      iconRect: { x: 593, y: 168, width: 33, height: 36 },
      actions: ["*"]
    },
    {
      id: "inventory",
      childId: 51,
      widgetId: 35913779,
      row: "top",
      slotIndex: 3,
      spriteId: 1030,
      iconChildId: 58,
      iconSpriteId: 900,
      rect: { x: 626, y: 168, width: 33, height: 36 },
      iconRect: { x: 626, y: 168, width: 33, height: 36 },
      actions: ["*"]
    },
    {
      id: "equipment",
      childId: 52,
      widgetId: 35913780,
      row: "top",
      slotIndex: 4,
      spriteId: 1030,
      iconChildId: 59,
      iconSpriteId: 901,
      rect: { x: 659, y: 168, width: 33, height: 36 },
      iconRect: { x: 659, y: 168, width: 33, height: 36 },
      actions: ["*"]
    },
    {
      id: "prayer",
      childId: 53,
      widgetId: 35913781,
      row: "top",
      slotIndex: 5,
      spriteId: 1030,
      iconChildId: 60,
      iconSpriteId: 902,
      rect: { x: 692, y: 168, width: 33, height: 36 },
      iconRect: { x: 692, y: 168, width: 33, height: 36 },
      actions: ["*"]
    },
    {
      id: "magic",
      childId: 54,
      widgetId: 35913782,
      row: "top",
      slotIndex: 6,
      spriteId: 1027,
      iconChildId: 61,
      iconSpriteId: 903,
      rect: { x: 725, y: 168, width: 38, height: 36 },
      iconRect: { x: 726, y: 168, width: 33, height: 36 },
      actions: ["*", "*"]
    },
    {
      id: "clan-chat",
      childId: 31,
      widgetId: 35913759,
      row: "bottom",
      slotIndex: 0,
      spriteId: 1028,
      iconChildId: 38,
      iconSpriteId: 904,
      rect: { x: 522, y: 466, width: 38, height: 36 },
      iconRect: { x: 526, y: 466, width: 33, height: 36 },
      actions: ["*"]
    },
    {
      id: "ignores",
      childId: 32,
      widgetId: 35913760,
      row: "bottom",
      slotIndex: 2,
      spriteId: 1030,
      iconChildId: 39,
      iconSpriteId: 1709,
      rect: { x: 593, y: 466, width: 38, height: 36 },
      iconRect: { x: 593, y: 466, width: 33, height: 36 },
      actions: ["*"]
    },
    {
      id: "friends",
      childId: 33,
      widgetId: 35913761,
      row: "bottom",
      slotIndex: 1,
      spriteId: 1030,
      iconChildId: 40,
      iconSpriteId: 905,
      rect: { x: 560, y: 466, width: 33, height: 36 },
      iconRect: { x: 560, y: 466, width: 33, height: 36 },
      actions: ["*"]
    },
    {
      id: "logout",
      childId: 34,
      widgetId: 35913762,
      row: "bottom",
      slotIndex: 3,
      spriteId: 1030,
      iconChildId: 41,
      iconSpriteId: 907,
      rect: { x: 626, y: 466, width: 33, height: 36 },
      iconRect: { x: 626, y: 466, width: 33, height: 36 },
      actions: ["*"]
    },
    {
      id: "options",
      childId: 35,
      widgetId: 35913763,
      row: "bottom",
      slotIndex: 4,
      spriteId: 1030,
      iconChildId: 42,
      iconSpriteId: 908,
      rect: { x: 659, y: 466, width: 33, height: 36 },
      iconRect: { x: 659, y: 466, width: 33, height: 36 },
      actions: ["*"]
    },
    {
      id: "emotes",
      childId: 36,
      widgetId: 35913764,
      row: "bottom",
      slotIndex: 5,
      spriteId: 1030,
      iconChildId: 43,
      iconSpriteId: 909,
      rect: { x: 692, y: 466, width: 33, height: 36 },
      iconRect: { x: 692, y: 466, width: 33, height: 36 },
      actions: ["*"]
    },
    {
      id: "music",
      childId: 37,
      widgetId: 35913765,
      row: "bottom",
      slotIndex: 6,
      spriteId: 1029,
      iconChildId: 44,
      iconSpriteId: 910,
      rect: { x: 725, y: 466, width: 38, height: 36 },
      iconRect: { x: 726, y: 466, width: 33, height: 36 },
      actions: ["*"]
    }
  ]
);
assertSame("fixed orbs", layout.orbs, [
  {
    id: "hp",
    groupId: 160,
    rect: { x: 516, y: 37, width: 57, height: 34 },
    actionWidgetId: 10485764,
    actionChildId: 4,
    actionRect: { x: 3, y: 5, width: 50, height: 26 },
    actions: ["Cure"],
    frameSpriteId: 1071,
    frameRect: { x: 0, y: 0, width: 57, height: 34 },
    fillerSpriteId: 1060,
    activeFillerSpriteId: null,
    fillRect: { x: 27, y: 4, width: 26, height: 26 },
    emptySpriteId: 1059,
    emptyRect: { x: 27, y: 4, width: 26, height: 26 },
    iconSpriteId: 1067,
    iconRect: { x: 27, y: 4, width: 26, height: 26 },
    valueTextRect: { x: 4, y: 16, width: 23, height: 13 },
    valueText: { rect: { x: 4, y: 16, width: 23, height: 13 }, fontId: 494, lineHeight: 0, xTextAlignment: 1, yTextAlignment: 1, textShadowed: true, textColor: 16776960 }
  },
  {
    id: "prayer",
    groupId: 160,
    rect: { x: 516, y: 71, width: 57, height: 34 },
    actionWidgetId: 10485774,
    actionChildId: 14,
    actionRect: { x: 3, y: 5, width: 49, height: 26 },
    actions: ["*", "Setup"],
    frameSpriteId: 1071,
    frameRect: { x: 0, y: 0, width: 57, height: 34 },
    fillerSpriteId: 1063,
    activeFillerSpriteId: 1066,
    fillRect: { x: 27, y: 4, width: 26, height: 26 },
    emptySpriteId: 1059,
    emptyRect: { x: 27, y: 4, width: 26, height: 26 },
    iconSpriteId: 1068,
    iconRect: { x: 27, y: 4, width: 26, height: 26 },
    valueTextRect: { x: 4, y: 16, width: 23, height: 13 },
    valueText: { rect: { x: 4, y: 16, width: 23, height: 13 }, fontId: 494, lineHeight: 0, xTextAlignment: 1, yTextAlignment: 1, textShadowed: true, textColor: 16776960 }
  },
  {
    id: "run",
    groupId: 160,
    rect: { x: 526, y: 103, width: 57, height: 34 },
    actionWidgetId: 10485782,
    actionChildId: 22,
    actionRect: { x: 3, y: 5, width: 50, height: 26 },
    actions: ["Toggle Run"],
    frameSpriteId: 1071,
    frameRect: { x: 0, y: 0, width: 57, height: 34 },
    fillerSpriteId: 1064,
    activeFillerSpriteId: 1065,
    fillRect: { x: 27, y: 4, width: 26, height: 26 },
    emptySpriteId: 1059,
    emptyRect: { x: 27, y: 4, width: 26, height: 26 },
    iconSpriteId: 1069,
    iconRect: { x: 27, y: 4, width: 26, height: 26 },
    valueTextRect: { x: 4, y: 16, width: 23, height: 13 },
    valueText: { rect: { x: 4, y: 16, width: 23, height: 13 }, fontId: 494, lineHeight: 0, xTextAlignment: 1, yTextAlignment: 1, textShadowed: true, textColor: 16776960 }
  },
  {
    id: "spec",
    groupId: 160,
    rect: { x: 548, y: 128, width: 57, height: 34 },
    actionWidgetId: 10485790,
    actionChildId: 30,
    actionRect: { x: 3, y: 6, width: 50, height: 25 },
    actions: ["*"],
    frameSpriteId: 1071,
    frameRect: { x: 0, y: 0, width: 57, height: 34 },
    fillerSpriteId: 1607,
    activeFillerSpriteId: 1608,
    fillRect: { x: 27, y: 4, width: 26, height: 26 },
    emptySpriteId: 1059,
    emptyRect: { x: 27, y: 4, width: 26, height: 26 },
    iconSpriteId: 1610,
    iconRect: { x: 27, y: 4, width: 26, height: 26 },
    valueTextRect: { x: 4, y: 16, width: 23, height: 13 },
    valueText: { rect: { x: 4, y: 16, width: 23, height: 13 }, fontId: 494, lineHeight: 0, xTextAlignment: 1, yTextAlignment: 1, textShadowed: true, textColor: 16776960 }
  }
]);

const fixedCss = scaleKronosFixedClientLayout(layout, { width: 1280, height: 900 });
assert(fixedCss.scale === 1, `large container should preserve 1:1 fixed canvas scale, got ${fixedCss.scale}`);
assertSame("large container viewport", fixedCss.viewportRect, layout.viewport.rect);

const halfCss = scaleKronosFixedClientLayout(layout, { width: 382.5, height: 251.5 });
assert(halfCss.scale === 0.5, `half container scale mismatch: ${halfCss.scale}`);
assertSame("half scale viewport", halfCss.viewportRect, { x: 2, y: 2, width: 256, height: 167 });

assert(pointInKronosRect(layout.viewport.rect, 4, 4), "viewport should include top-left pixel");
assert(pointInKronosRect(layout.viewport.rect, 515, 337), "viewport should include bottom-right interior pixel");
assert(!pointInKronosRect(layout.viewport.rect, 516, 337), "viewport should exclude right edge");
assert(!pointInKronosRect(layout.viewport.rect, 515, 338), "viewport should exclude bottom edge");
assert(!pointInKronosRect(layout.viewport.rect, 3, 4), "viewport should exclude left outside pixel");

const expectedFov = (Math.atan(layout.viewport.rect.height / (2 * layout.viewport.zoom)) * 360) / Math.PI;
const fixedFov = kronosViewportZoomToFovDegrees(layout.viewport.rect.height, layout.viewport.zoom);
assertAlmost("fixed viewport fov", fixedFov, expectedFov);
assertAlmost("fixed viewport fov stable value", fixedFov, 66.23633715063609);

console.log(
  JSON.stringify(
    {
      ok: true,
      fixedCanvas: layout.fixedCanvas,
      viewport: layout.viewport,
      minimapRect: layout.minimapWidget?.rect,
      compassRect: layout.compassWidget?.rect,
      sidePanel: layout.sidePanel,
      sidePanelInterfaces: sidePanelInterfaceSummary,
      equipmentPanel: layout.equipmentPanel,
      spellbookPanel: layout.spellbookPanel,
      chatbox: {
        rect: layout.chatbox?.rect,
        spriteCount: chatboxSprites.length,
        textCount: chatboxTexts.size
      },
      inventoryGrid: layout.inventoryGrid,
      orbs: layout.orbs,
      fixedFov
    },
    null,
    2
  )
);
