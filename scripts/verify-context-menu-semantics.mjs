import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

function loadTsModule(relativePath) {
  return loadModule(path.resolve(projectRoot, relativePath));
}

function loadModule(sourcePath) {
  const resolvedPath = resolveModulePath(sourcePath);
  const cached = moduleCache.get(resolvedPath);
  if (cached) {
    return cached.exports;
  }

  const source = readFileSync(resolvedPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      resolveJsonModule: true,
      target: ts.ScriptTarget.ES2020,
      strict: true
    },
    fileName: resolvedPath
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(resolvedPath, module);
  vm.runInNewContext(
    transpiled,
    {
      module,
      exports: module.exports,
      require: (request) => localRequire(resolvedPath, request),
      console
    },
    { filename: resolvedPath }
  );
  return module.exports;
}

function localRequire(parentPath, request) {
  if (request.startsWith(".")) {
    return loadModule(path.resolve(path.dirname(parentPath), request));
  }
  return require(request);
}

function resolveModulePath(candidatePath) {
  const attempts = [
    candidatePath,
    `${candidatePath}.ts`,
    `${candidatePath}.tsx`,
    `${candidatePath}.js`,
    `${candidatePath}.json`,
    path.join(candidatePath, "index.ts"),
    path.join(candidatePath, "index.tsx"),
    path.join(candidatePath, "index.js")
  ];
  for (const attempt of attempts) {
    try {
      if (statSync(attempt).isFile()) {
        return attempt;
      }
    } catch {
      // Try the next extension candidate.
    }
  }
  throw new Error(`Unable to resolve module ${candidatePath}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const {
  buildNhPlayerContextEntries,
  NH_CONTEXT_MENU_BODY_COLOR,
  NH_CONTEXT_MENU_BODY_BORDER_COLOR,
  NH_CONTEXT_MENU_FRAME_COLOR,
  NH_CONTEXT_MENU_HEADER_BOTTOM_COLOR,
  NH_CONTEXT_MENU_HEADER_TOP_COLOR,
  NH_CONTEXT_MENU_HOVER_FILL_ALPHA,
  NH_CONTEXT_MENU_HOVER_FILL_COLOR,
  NH_CONTEXT_MENU_HOVER_HEIGHT,
  NH_CONTEXT_MENU_HOVER_LEFT,
  NH_CONTEXT_MENU_HOVER_TOP,
  NH_CONTEXT_MENU_HOVER_WIDTH_SUBTRACT,
  NH_CONTEXT_MENU_OUTLINE_COLOR,
  NH_CONTEXT_MENU_TEXT_COLOR,
  NH_PLAYER_ACTION_PACKET_IDS_BY_OPCODE,
  NH_PLAYER_SELECTED_PACKET_IDS_BY_OPCODE,
  NH_PLAYER_SPELL_SELECTED_OPCODE,
  NH_PLAYER_USE_SELECTED_OPCODE,
  nhContextMenuHitIndex,
  nhContextMenuWidth,
  nhMenuBaseOpcode,
  nhMenuEntryText,
  nhPlayerCommandPacket,
  nhPlayerSelectedCommandPacket,
  orderNhMenuEntries,
  resolveNhContextMenuRect,
  selectNhDefaultMenuEntry,
  visibleNhMenuEntries
} = loadTsModule("src/render/nhContextMenu.ts");
const { applyRuneliteOpponentInfoMenuEntries } = loadTsModule("src/ui/runeliteOpponentInfo.ts");
const {
  NH_OBJECT_ACTION_OPCODES,
  NH_OBJECT_EXAMINE_OPCODE,
  NH_OBJECT_PACKET_IDS_BY_OPCODE,
  NH_OBJECT_SERVER_OPTIONS_BY_OPCODE,
  NH_OBJECT_SPELL_SELECTED_OPCODE,
  NH_OBJECT_TARGET_COLOR_TAG,
  NH_OBJECT_USE_SELECTED_OPCODE,
  buildNhSceneObjectContextEntries,
  findNhSceneObjectForWorldTile,
  nhSceneObjectCommandPacket,
  nhSceneObjectTargetText
} = loadTsModule("src/render/nhSceneObjects.ts");
const { assertValidClientViewTrace } = loadTsModule("src/sim/clientView.ts");
const { clientViewTraceToRuntimeReplay, sampleRuntimeReplayScene } = loadTsModule("src/render/clientViewReplay.ts");
const {
  NH_CONTEXT_MENU_FONT_KEY,
  createNhClientFontStore,
  nhClientFontDefinition,
  nhClientFontStringWidth
} = loadTsModule("src/render/nhClientFonts.ts");

const clientFonts = createNhClientFontStore(
  JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "client-fonts.json"), "utf8"))
);
const contextMenuFontSheet = JSON.parse(
  readFileSync(path.join(projectRoot, "fixtures", "render", "sprites", "context_menu_font.json"), "utf8")
);
const contextMenuFont = nhClientFontDefinition(clientFonts, NH_CONTEXT_MENU_FONT_KEY);
assert(contextMenuFont, "missing exported bold12 context-menu font metrics");
assert(contextMenuFont.fontId === 496, `unexpected bold12 font id: ${JSON.stringify(contextMenuFont)}`);
assert(contextMenuFont.fontArchiveName === "b12_full", `unexpected bold12 font archive: ${JSON.stringify(contextMenuFont)}`);
assert(contextMenuFontSheet.id === "context_menu_font", `unexpected context-menu glyph sheet id: ${contextMenuFontSheet.id}`);
assert(contextMenuFontSheet.fontId === contextMenuFont.fontId, `context-menu glyph sheet font id mismatch: ${JSON.stringify(contextMenuFontSheet)}`);
assert(contextMenuFontSheet.fontArchiveName === contextMenuFont.fontArchiveName, `context-menu glyph sheet archive mismatch: ${JSON.stringify(contextMenuFontSheet)}`);
assert(contextMenuFontSheet.sprites.length === 94, `expected printable ASCII glyph sheet, got ${contextMenuFontSheet.sprites.length}`);
const glyphA = contextMenuFontSheet.sprites.find((sprite) => sprite.charCode === 65);
assert(glyphA?.advance === contextMenuFont.advances[65], `A glyph advance did not match exported font metrics: ${JSON.stringify(glyphA)}`);
assert(glyphA.width > 0 && glyphA.height > 0, `A glyph missing sprite pixels: ${JSON.stringify(glyphA)}`);
assert(NH_CONTEXT_MENU_FRAME_COLOR === "#6d6a5b", `source frame color mismatch: ${NH_CONTEXT_MENU_FRAME_COLOR}`);
assert(NH_CONTEXT_MENU_OUTLINE_COLOR === "#2b2622", `source outline color mismatch: ${NH_CONTEXT_MENU_OUTLINE_COLOR}`);
assert(NH_CONTEXT_MENU_HEADER_TOP_COLOR === "#322e22", `source header top color mismatch: ${NH_CONTEXT_MENU_HEADER_TOP_COLOR}`);
assert(NH_CONTEXT_MENU_HEADER_BOTTOM_COLOR === "#090a04", `source header bottom color mismatch: ${NH_CONTEXT_MENU_HEADER_BOTTOM_COLOR}`);
assert(NH_CONTEXT_MENU_BODY_BORDER_COLOR === "#524a3d", `source body border color mismatch: ${NH_CONTEXT_MENU_BODY_BORDER_COLOR}`);
assert(NH_CONTEXT_MENU_BODY_COLOR === "#2b271c", `source body color mismatch: ${NH_CONTEXT_MENU_BODY_COLOR}`);
assert(NH_CONTEXT_MENU_TEXT_COLOR === "#c6b895", `source text color mismatch: ${NH_CONTEXT_MENU_TEXT_COLOR}`);
assert(NH_CONTEXT_MENU_HOVER_FILL_COLOR === "#ffffff", `source hover fill color mismatch: ${NH_CONTEXT_MENU_HOVER_FILL_COLOR}`);
assert(NH_CONTEXT_MENU_HOVER_FILL_ALPHA === 80 / 256, `source hover alpha mismatch: ${NH_CONTEXT_MENU_HOVER_FILL_ALPHA}`);
assert(NH_CONTEXT_MENU_HOVER_LEFT === 3, `source hover left mismatch: ${NH_CONTEXT_MENU_HOVER_LEFT}`);
assert(NH_CONTEXT_MENU_HOVER_TOP === -3, `source hover top mismatch: ${NH_CONTEXT_MENU_HOVER_TOP}`);
assert(NH_CONTEXT_MENU_HOVER_WIDTH_SUBTRACT === 6, `source hover width inset mismatch: ${NH_CONTEXT_MENU_HOVER_WIDTH_SUBTRACT}`);
assert(NH_CONTEXT_MENU_HOVER_HEIGHT === 15, `source hover height mismatch: ${NH_CONTEXT_MENU_HOVER_HEIGHT}`);

const entries = buildNhPlayerContextEntries({
  name: "Opponent",
  combatLevel: 126,
  localCombatLevel: 126,
  identifier: 1,
  walkTile: { x: 2, z: 0 },
  actionTile: { x: 4, z: 0 }
});

const visibleText = visibleNhMenuEntries(entries).map((entry) => nhMenuEntryText(entry));
const expectedText = [
  "Attack Opponent (level-126)",
  "Walk here Opponent (level-126)",
  "Follow Opponent (level-126)",
  "Trade with Opponent (level-126)"
];
assert(JSON.stringify(visibleText) === JSON.stringify(expectedText), `unexpected visible player menu order: ${JSON.stringify(visibleText)}`);

const opponentInfoCombatState = {
  tick: 0,
  randomSeed: 1,
  queuedHits: [],
  events: [],
  actors: {
    "local-player": {
      id: "local-player",
      targetId: "opponent",
      hitpoints: 99,
      maxHitpoints: 99
    },
    opponent: {
      id: "opponent",
      targetId: "local-player",
      hitpoints: 82,
      maxHitpoints: 99
    }
  }
};
const opponentInfoMenuEntries = applyRuneliteOpponentInfoMenuEntries({
  entries,
  targetActorId: "opponent",
  combatState: opponentInfoCombatState,
  config: {
    enabled: true,
    lookupOnInteraction: false,
    hitpointsDisplayStyle: "Hitpoints",
    showOpponentsOpponent: true,
    showAttackersMenu: true,
    showAttackingMenu: true,
    attackingColor: "#00ff00",
    showHitpointsMenu: true
  }
});
const opponentInfoAttackEntry = opponentInfoMenuEntries.find((entry) => entry.action === "attack");
const opponentInfoFollowEntry = opponentInfoMenuEntries.find((entry) => entry.action === "follow");
assert(
  opponentInfoAttackEntry?.targetText.startsWith("*<col=00ff00>Opponent"),
  `Opponent Information should color and star the Attack menu target like OpponentInfoPlugin.modify: ${JSON.stringify(opponentInfoAttackEntry)}`
);
assert(
  nhMenuEntryText(opponentInfoAttackEntry) === "Attack *Opponent (82/99)",
  `Opponent Information should replace the Attack row combat level with source-style HP: ${nhMenuEntryText(opponentInfoAttackEntry)}`
);
assert(
  nhMenuEntryText(opponentInfoFollowEntry) === "Follow Opponent (level-126)",
  `Opponent Information menu mutation should not rewrite non-Attack player rows: ${nhMenuEntryText(opponentInfoFollowEntry)}`
);

const defaultEntry = selectNhDefaultMenuEntry(entries);
assert(defaultEntry?.actionText === "Attack", `left-click default should be Attack, got ${JSON.stringify(defaultEntry)}`);
assert(nhMenuBaseOpcode(defaultEntry.opcode) === 44, `Attack should carry base opcode 44, got ${defaultEntry.opcode}`);

assert(NH_PLAYER_USE_SELECTED_OPCODE === 14, `player selected-item opcode mismatch: ${NH_PLAYER_USE_SELECTED_OPCODE}`);
assert(NH_PLAYER_SPELL_SELECTED_OPCODE === 15, `player selected-spell opcode mismatch: ${NH_PLAYER_SPELL_SELECTED_OPCODE}`);
assert(
  JSON.stringify(NH_PLAYER_SELECTED_PACKET_IDS_BY_OPCODE) === JSON.stringify({ 14: 59, 15: 55 }),
  `player selected target packet table mismatch: ${JSON.stringify(NH_PLAYER_SELECTED_PACKET_IDS_BY_OPCODE)}`
);
assert(
  JSON.stringify(NH_PLAYER_ACTION_PACKET_IDS_BY_OPCODE) ===
    JSON.stringify({
      44: { serverPacketId: 81, sourcePacketName: "ClientPacket.field2387" },
      45: { serverPacketId: 43, sourcePacketName: "ClientPacket.field2383" },
      46: { serverPacketId: 61, sourcePacketName: "ClientPacket.field2362" },
      47: { serverPacketId: 71, sourcePacketName: "ClientPacket.field2427" },
      48: { serverPacketId: 58, sourcePacketName: "ClientPacket.field2398" },
      49: { serverPacketId: 52, sourcePacketName: "ClientPacket.field2370" },
      50: { serverPacketId: 90, sourcePacketName: "ClientPacket.field2430" },
      51: { serverPacketId: 78, sourcePacketName: "ClientPacket.field2418" }
    }),
  `normal player action packet table mismatch: ${JSON.stringify(NH_PLAYER_ACTION_PACKET_IDS_BY_OPCODE)}`
);
const attackPlayerPacket = nhPlayerCommandPacket(defaultEntry);
assert(
  attackPlayerPacket?.serverPacketId === 81 &&
    attackPlayerPacket?.clientMenuBaseOpcode === 44 &&
    attackPlayerPacket?.playerOption === 1,
  `Attack player packet mapping mismatch: ${JSON.stringify(attackPlayerPacket)}`
);
const followPlayerEntry = entries.find((entry) => entry.action === "follow");
const followPlayerPacket = followPlayerEntry ? nhPlayerCommandPacket(followPlayerEntry) : null;
assert(
  followPlayerPacket?.serverPacketId === 43 &&
    followPlayerPacket?.clientMenuBaseOpcode === 45 &&
    followPlayerPacket?.playerOption === 2,
  `Follow player packet mapping mismatch: ${JSON.stringify(followPlayerPacket)}`
);
const tradePlayerEntry = entries.find((entry) => entry.action === "trade");
const tradePlayerPacket = tradePlayerEntry ? nhPlayerCommandPacket(tradePlayerEntry) : null;
assert(
  tradePlayerPacket?.serverPacketId === 61 &&
    tradePlayerPacket?.clientMenuBaseOpcode === 46 &&
    tradePlayerPacket?.playerOption === 3,
  `Trade player packet mapping mismatch: ${JSON.stringify(tradePlayerPacket)}`
);
const spellPlayerEntries = buildNhPlayerContextEntries({
  name: "Opponent",
  combatLevel: 126,
  localCombatLevel: 126,
  identifier: 1,
  walkTile: { x: 2, z: 0 },
  actionTile: { x: 4, z: 0 },
  selectedSpell: {
    actionName: "Cast",
    spellName: "<col=00ff00>Smoke Rush<col=ffffff>",
    flags: 10,
    widgetId: 14286930,
    childId: 82,
    itemId: 4629,
    spellId: "smoke-rush",
    label: "Smoke Rush"
  }
});
assert(spellPlayerEntries.length === 1, `selected spell should replace ordinary player actions: ${JSON.stringify(spellPlayerEntries)}`);
assert(spellPlayerEntries[0].opcode === 15, `selected spell player opcode mismatch: ${JSON.stringify(spellPlayerEntries[0])}`);
assert(
  nhMenuEntryText(spellPlayerEntries[0]) === "Cast Smoke Rush -> Opponent (level-126)",
  `selected spell player text mismatch: ${nhMenuEntryText(spellPlayerEntries[0])}`
);
const spellPlayerPacket = nhPlayerSelectedCommandPacket(spellPlayerEntries[0]);
assert(spellPlayerPacket?.serverPacketId === 55, `selected spell player packet id mismatch: ${JSON.stringify(spellPlayerPacket)}`);
assert(spellPlayerPacket?.selectedSpell?.spellId === "smoke-rush", `selected spell metadata should reach player packet mapping: ${JSON.stringify(spellPlayerPacket)}`);
const objectOnlySpellPlayerEntries = buildNhPlayerContextEntries({
  name: "Opponent",
  combatLevel: 126,
  localCombatLevel: 126,
  identifier: 1,
  walkTile: { x: 2, z: 0 },
  actionTile: { x: 4, z: 0 },
  selectedSpell: {
    actionName: "Cast",
    spellName: "<col=00ff00>Smoke Rush<col=ffffff>",
    flags: 4,
    widgetId: 14286930,
    childId: 82,
    itemId: 4629,
    spellId: "smoke-rush",
    label: "Smoke Rush"
  }
});
assert(
  objectOnlySpellPlayerEntries.length === 0,
  `selected non-player spell should not fall back to Walk/Attack player actions: ${JSON.stringify(objectOnlySpellPlayerEntries)}`
);
const itemPlayerEntries = buildNhPlayerContextEntries({
  name: "Opponent",
  combatLevel: 126,
  localCombatLevel: 126,
  identifier: 1,
  walkTile: { x: 2, z: 0 },
  actionTile: { x: 4, z: 0 },
  selectedItem: { itemName: "Armadyl crossbow", itemId: 11785, slotIndex: 0, widgetId: 9764864 }
});
assert(itemPlayerEntries.length === 1, `selected item should replace ordinary player actions: ${JSON.stringify(itemPlayerEntries)}`);
assert(itemPlayerEntries[0].opcode === 14, `selected item player opcode mismatch: ${JSON.stringify(itemPlayerEntries[0])}`);
assert(
  nhMenuEntryText(itemPlayerEntries[0]) === "Use Armadyl crossbow -> Opponent (level-126)",
  `selected item player text mismatch: ${nhMenuEntryText(itemPlayerEntries[0])}`
);
const itemPlayerPacket = nhPlayerSelectedCommandPacket(itemPlayerEntries[0]);
assert(itemPlayerPacket?.serverPacketId === 59, `selected item player packet id mismatch: ${JSON.stringify(itemPlayerPacket)}`);
assert(itemPlayerPacket?.selectedItem?.itemId === 11785, `selected item metadata should reach player packet mapping: ${JSON.stringify(itemPlayerPacket)}`);

const ordered = orderNhMenuEntries(entries);
const orderedBaseOpcodes = ordered.map((entry) => nhMenuBaseOpcode(entry.opcode));
assert(JSON.stringify(orderedBaseOpcodes) === JSON.stringify([46, 45, 23, 44]), `unexpected sorted base opcodes: ${JSON.stringify(orderedBaseOpcodes)}`);

const sourceWidth = Math.max(
  nhClientFontStringWidth(contextMenuFont, "Choose Option"),
  ...entries.map((entry) => nhClientFontStringWidth(contextMenuFont, nhMenuEntryText(entry)))
) + 8;
assert(nhContextMenuWidth(entries, contextMenuFont) === sourceWidth, `font-backed menu width mismatch: ${sourceWidth}`);

const rect = resolveNhContextMenuRect(260, 180, entries, { width: 512, height: 334 }, contextMenuFont);
assert(rect.height === entries.length * 15 + 22, `unexpected menu height: ${JSON.stringify(rect)}`);
assert(rect.width === sourceWidth, `unexpected source font menu width: ${JSON.stringify({ rect, sourceWidth })}`);
assert(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 512 && rect.y + rect.height <= 334, `menu rect did not clamp to bounds: ${JSON.stringify(rect)}`);

const topVisibleHitIndex = nhContextMenuHitIndex(rect.x + 4, rect.y + 31, rect, entries);
assert(topVisibleHitIndex === ordered.length - 1, `top visible row should hit the sorted default entry: ${topVisibleHitIndex}`);
assert(ordered[topVisibleHitIndex]?.actionText === "Attack", `top visible hit should be Attack: ${JSON.stringify(ordered[topVisibleHitIndex])}`);

assert(
  JSON.stringify(NH_OBJECT_ACTION_OPCODES) === JSON.stringify([3, 4, 5, 6, 1001]),
  `object action opcode table mismatch: ${JSON.stringify(NH_OBJECT_ACTION_OPCODES)}`
);
assert(NH_OBJECT_USE_SELECTED_OPCODE === 1, `object selected-item opcode mismatch: ${NH_OBJECT_USE_SELECTED_OPCODE}`);
assert(NH_OBJECT_SPELL_SELECTED_OPCODE === 2, `object selected-spell opcode mismatch: ${NH_OBJECT_SPELL_SELECTED_OPCODE}`);
assert(NH_OBJECT_EXAMINE_OPCODE === 1002, `object examine opcode mismatch: ${NH_OBJECT_EXAMINE_OPCODE}`);
assert(NH_OBJECT_TARGET_COLOR_TAG === "<col=00ffff>", `object target color should follow World.method1251(65535)`);
assert(
  JSON.stringify(NH_OBJECT_PACKET_IDS_BY_OPCODE) ===
    JSON.stringify({ 1: 46, 2: 68, 3: 51, 4: 6, 5: 42, 6: 95, 1001: 50, 1002: 36 }),
  `object packet id table mismatch: ${JSON.stringify(NH_OBJECT_PACKET_IDS_BY_OPCODE)}`
);
assert(
  JSON.stringify(NH_OBJECT_SERVER_OPTIONS_BY_OPCODE) ===
    JSON.stringify({ 3: 1, 4: 2, 5: 3, 6: 4, 1001: 5, 1002: 6 }),
  `object server option table mismatch: ${JSON.stringify(NH_OBJECT_SERVER_OPTIONS_BY_OPCODE)}`
);
const syntheticObjectPlacement = {
  id: 12345,
  name: "Ancient altar",
  actions: ["Pray-at", "Spellbook", null, "Practice", "Quick-start"],
  type: 10,
  orientation: 1,
  x: 3200,
  y: 3201,
  plane: 0,
  sizeX: 2,
  sizeY: 3
};
const objectEntries = buildNhSceneObjectContextEntries({
  placement: syntheticObjectPlacement,
  walkTile: { x: 1, z: 2 },
  actionTile: { x: 2, z: 3 }
});
const visibleObjectText = visibleNhMenuEntries(objectEntries).map((entry) => nhMenuEntryText(entry));
assert(
  JSON.stringify(visibleObjectText) ===
    JSON.stringify([
      "Pray-at Ancient altar",
      "Spellbook Ancient altar",
      "Practice Ancient altar",
      "Walk here",
      "Examine Ancient altar",
      "Quick-start Ancient altar"
    ]),
  `unexpected visible object menu order: ${JSON.stringify(visibleObjectText)}`
);
const objectDefault = selectNhDefaultMenuEntry(objectEntries);
assert(objectDefault?.actionText === "Pray-at", `object default should be first source action: ${JSON.stringify(objectDefault)}`);
assert(objectDefault?.opcode === 3, `object first action opcode should be 3: ${JSON.stringify(objectDefault)}`);
assert(objectDefault?.identifier === 12345, `object identifier should be object id: ${JSON.stringify(objectDefault)}`);
assert(objectDefault?.argument1 === 3200 && objectDefault?.argument2 === 3201, `object arguments should be object tile: ${JSON.stringify(objectDefault)}`);
assert(nhSceneObjectTargetText("Ancient altar") === "<col=00ffff>Ancient altar", "object target color mismatch");
const objectDefaultPacket = nhSceneObjectCommandPacket(objectDefault);
assert(
  JSON.stringify(objectDefaultPacket) ===
    JSON.stringify({
      clientMenuOpcode: 3,
      serverPacketId: 51,
      serverOption: 1,
      objectId: 12345,
      objectX: 3200,
      objectY: 3201
    }),
  `object default packet mapping mismatch: ${JSON.stringify(objectDefaultPacket)}`
);
const objectUseEntries = buildNhSceneObjectContextEntries({
  placement: syntheticObjectPlacement,
  walkTile: { x: 1, z: 2 },
  actionTile: { x: 2, z: 3 },
  selectedItem: {
    itemId: 11785,
    itemName: "Armadyl crossbow",
    slotIndex: 0,
    widgetId: 9764864
  }
});
assert(objectUseEntries.length === 1, `selected item should replace object actions: ${JSON.stringify(objectUseEntries)}`);
assert(objectUseEntries[0].opcode === 1, `selected item object opcode mismatch: ${JSON.stringify(objectUseEntries[0])}`);
assert(
  nhMenuEntryText(objectUseEntries[0]) === "Use Armadyl crossbow -> Ancient altar",
  `selected item object text mismatch: ${nhMenuEntryText(objectUseEntries[0])}`
);
const objectUsePacket = nhSceneObjectCommandPacket(objectUseEntries[0]);
assert(objectUsePacket?.serverPacketId === 46, `selected item object packet id mismatch: ${JSON.stringify(objectUsePacket)}`);
assert(objectUsePacket?.serverOption === null, `selected item object should not map to ObjectAction option: ${JSON.stringify(objectUsePacket)}`);
const objectSpellEntries = buildNhSceneObjectContextEntries({
  placement: syntheticObjectPlacement,
  walkTile: { x: 1, z: 2 },
  actionTile: { x: 2, z: 3 },
  selectedSpell: {
    actionName: "Cast",
    spellName: "<col=00ff00>Smoke Rush<col=ffffff>",
    flags: 4,
    widgetId: 14286930,
    childId: 82,
    itemId: 4629,
    spellId: "smoke-rush",
    label: "Smoke Rush"
  }
});
assert(objectSpellEntries.length === 1, `selected spell should replace object actions when object flag is set: ${JSON.stringify(objectSpellEntries)}`);
assert(objectSpellEntries[0].opcode === 2, `selected spell object opcode mismatch: ${JSON.stringify(objectSpellEntries[0])}`);
assert(
  nhMenuEntryText(objectSpellEntries[0]) === "Cast Smoke Rush -> Ancient altar",
  `selected spell object text mismatch: ${nhMenuEntryText(objectSpellEntries[0])}`
);
const objectSpellPacket = nhSceneObjectCommandPacket(objectSpellEntries[0]);
assert(objectSpellPacket?.serverPacketId === 68, `selected spell object packet id mismatch: ${JSON.stringify(objectSpellPacket)}`);
assert(objectSpellPacket?.serverOption === null, `selected spell object should not map to ObjectAction option: ${JSON.stringify(objectSpellPacket)}`);
assert(objectSpellPacket?.selectedSpell?.spellId === "smoke-rush", `selected spell metadata should reach packet mapping: ${JSON.stringify(objectSpellPacket)}`);
const playerOnlySpellObjectEntries = buildNhSceneObjectContextEntries({
  placement: syntheticObjectPlacement,
  walkTile: { x: 1, z: 2 },
  actionTile: { x: 2, z: 3 },
  selectedSpell: {
    actionName: "Cast",
    spellName: "<col=00ff00>Smoke Rush<col=ffffff>",
    flags: 8,
    widgetId: 14286930,
    childId: 82,
    itemId: 4629,
    spellId: "smoke-rush",
    label: "Smoke Rush"
  }
});
assert(
  playerOnlySpellObjectEntries.length === 0,
  `selected non-object spell should not fall back to Walk/Object actions: ${JSON.stringify(playerOnlySpellObjectEntries)}`
);
const objectExaminePacket = nhSceneObjectCommandPacket(objectEntries[objectEntries.length - 1]);
assert(objectExaminePacket?.serverPacketId === 36, `object examine packet id mismatch: ${JSON.stringify(objectExaminePacket)}`);
assert(objectExaminePacket?.serverOption === 6, `object examine server option mismatch: ${JSON.stringify(objectExaminePacket)}`);
const rotatedFootprintMatch = findNhSceneObjectForWorldTile([syntheticObjectPlacement], { x: 3202, y: 3202, plane: 0 });
assert(rotatedFootprintMatch?.id === 12345, `rotated object footprint should contain swapped size tile: ${JSON.stringify(rotatedFootprintMatch)}`);
const hiddenObjectEntries = buildNhSceneObjectContextEntries({
  placement: { ...syntheticObjectPlacement, name: "null", actions: ["Open"] },
  walkTile: { x: 1, z: 2 },
  actionTile: { x: 2, z: 3 }
});
assert(
  JSON.stringify(visibleNhMenuEntries(hiddenObjectEntries).map((entry) => nhMenuEntryText(entry))) === JSON.stringify(["Walk here"]),
  `null-name objects should not expose invented menu entries: ${JSON.stringify(hiddenObjectEntries)}`
);
const examineOnlyObjectEntries = buildNhSceneObjectContextEntries({
  placement: { ...syntheticObjectPlacement, actions: [null, null, null, null, null] },
  walkTile: { x: 1, z: 2 },
  actionTile: { x: 2, z: 3 }
});
assert(
  JSON.stringify(visibleNhMenuEntries(examineOnlyObjectEntries).map((entry) => nhMenuEntryText(entry))) ===
    JSON.stringify(["Walk here", "Examine Ancient altar"]),
  `named actionless objects should still expose source Examine: ${JSON.stringify(examineOnlyObjectEntries)}`
);

const baseActor = {
  equipment: {},
  animations: {},
  overheadPrayer: "none",
  skullIcon: "none"
};
const syntheticContextMenuTrace = {
  schemaVersion: "client-view.v1",
  fixtureId: "generated-context-menu-source-v1",
  description: "Synthetic client-view trace proving open client menu arrays reach the runtime scene.",
  actors: ["self", "opponent"],
  sourceAnchorIds: ["client-context-menu-contract", "client-context-menu-sizing-contract"],
  ticks: [
    {
      tick: 0,
      actors: {
        self: {
          ...baseActor,
          actorId: "self",
          tile: { x: 3200, y: 3200, plane: 0 }
        },
        opponent: {
          ...baseActor,
          actorId: "opponent",
          tile: { x: 3201, y: 3200, plane: 0 }
        }
      },
      contextMenu: {
        x: 120,
        y: 70,
        width: 156,
        height: 52,
        entries: [
          {
            actionText: "Walk here",
            targetText: "",
            opcode: 23,
            identifier: 0,
            argument1: 3200,
            argument2: 3200,
            shiftClick: false
          },
          {
            actionText: "Attack",
            targetText: "Opponent (level-126)",
            opcode: 44,
            identifier: 1,
            argument1: 3201,
            argument2: 3200,
            shiftClick: true
          }
        ]
      },
      eventIds: []
    }
  ],
  events: []
};
assertValidClientViewTrace(syntheticContextMenuTrace);
const contextReplay = clientViewTraceToRuntimeReplay(syntheticContextMenuTrace);
const contextSnapshot = sampleRuntimeReplayScene(contextReplay, 0);
assert(
  JSON.stringify(contextSnapshot.contextMenu) === JSON.stringify(syntheticContextMenuTrace.ticks[0].contextMenu),
  `client-view context menu did not reach runtime snapshot: ${JSON.stringify(contextSnapshot.contextMenu)}`
);

const runtimeViewerSource = readFileSync(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
assert(runtimeViewerSource.includes("sourceContextMenu"), "RuntimeSceneViewer should build context menus from client-view snapshots");
assert(runtimeViewerSource.includes("visibleContextMenu"), "RuntimeSceneViewer should render local or source context menus through one path");
assert(runtimeViewerSource.includes("data-menu-source-index"), "RuntimeSceneViewer should expose source menu entry indices for validation");
assert(runtimeViewerSource.includes("nhContextMenuHover"), "RuntimeSceneViewer should render source-shaped hover highlight rectangles");
assert(runtimeViewerSource.includes("data-source-hover-fill-alpha"), "RuntimeSceneViewer should expose source hover alpha for validation");
assert(
  !runtimeViewerSource.includes("return <span>{text}</span>;"),
  "RuntimeSceneViewer should not fall back to browser text when the exported context-menu glyph atlas is missing"
);
assert(
  runtimeViewerSource.includes("data-source-glyph-missing=\"true\""),
  "RuntimeSceneViewer should fail closed with hidden accessible text when source context-menu glyphs are unavailable"
);
assert(
  runtimeViewerSource.includes("contextMenuStyleWithFont(visibleContextMenu, fixedClientCssLayout, contextMenuFont, contextMenuFontAtlas)"),
  "RuntimeSceneViewer should hide the context menu unless the exported context-menu font and glyph atlas are both loaded"
);
assert(
  !runtimeViewerSource.includes("layout?.surfaceRect ?? { x: 0, y: 0, width: 765, height: 503 }") &&
    !runtimeViewerSource.includes("fixedClientCssLayout?.viewportRect ?? { x: 0, y: 0, width: 765, height: 503 }"),
  "RuntimeSceneViewer should not size context menus or debug-open menus against a guessed full fixed canvas"
);
assert(
  runtimeViewerSource.includes("const surface = layout.surfaceRect;") &&
    runtimeViewerSource.includes("const viewportRect = fixedClientCssLayout?.viewportRect;"),
  "RuntimeSceneViewer should use the resolved source fixed-client layout for context-menu placement"
);
assert(
  runtimeViewerSource.includes("NH_CONTEXT_MENU_OPTION_BASELINE_OFFSET - NH_CONTEXT_MENU_HEADER_AND_PADDING_HEIGHT"),
  "RuntimeSceneViewer should position context menu option glyphs inside each source row"
);
assert(
  !runtimeViewerSource.includes("NH_CONTEXT_MENU_OPTION_BASELINE_OFFSET - nhContextMenuOptionTop(index)"),
  "RuntimeSceneViewer should not subtract each option row top from an already row-local glyph baseline"
);

const stylesSource = readFileSync(path.join(projectRoot, "src", "ui", "styles.css"), "utf8");
for (const snippet of [
  "#6d6a5b",
  "#2b2622",
  "#322e22",
  "#090a04",
  "#524a3d",
  "#2b271c",
  "#c6b895",
  ".nhContextMenuOption:hover .nhContextMenuHover"
]) {
  assert(stylesSource.includes(snippet), `styles.css should include source-backed context menu style ${snippet}`);
}

const clientContextMenuSource = readFileSync(
  path.resolve(
    projectRoot,
    "..",
    "Nh184-Client",
    "runelite-client",
    "src",
    "main",
    "java",
    "net",
    "runelite",
    "standalone",
    "Client.java"
  ),
  "utf8"
);
for (const snippet of [
  "static boolean isMenuOpen;",
  "static String[] menuActions;",
  "static String[] menuTargets;",
  "static int[] menuOpcodes;",
  "UrlRequester.menuX",
  "class37.menuY",
  "FriendSystem.menuWidth",
  "WorldMapDecoration.menuHeight",
  "if(var3 < UrlRequester.menuX - 10 || var3 > FriendSystem.menuWidth + UrlRequester.menuX + 10 || var14 < class37.menuY - 10 || var14 > class37.menuY + WorldMapDecoration.menuHeight + 10)",
  "isMenuOpen = false;",
  "if(var17 == 2 && menuOptionsCount > 0)",
  "this.method1661(MouseHandler.MouseHandler_lastPressedX, MouseHandler.MouseHandler_lastPressedY);",
  "Rasterizer2D.fillRectangleAlpha(var1 + 3, var12 - 12, var3 - 6, 15, 16777215, 80);"
]) {
  assert(clientContextMenuSource.includes(snippet), `source-backed context menu evidence should include ${snippet}`);
}
for (const snippet of [
  "NH_CONTEXT_MENU_MOUSE_LEAVE_MARGIN = 10",
  "event.button === 2",
  "openRuntimeSceneContextMenu(event.nativeEvent)",
  "event.clientX < rect.left - margin",
  "event.clientX > rect.right + margin",
  "event.clientY < rect.top - margin",
  "event.clientY > rect.bottom + margin",
  "data-source-close-margin"
]) {
  assert(runtimeViewerSource.includes(snippet), `RuntimeSceneViewer should mirror Nh context-menu open/close behavior: ${snippet}`);
}
for (const snippet of [
  "clearSelectedTargetMode(\"scene-selected-target-cancel\")",
  "clearSelectedTargetMode(\"inventory-selected-target-cancel\")",
  "if (selectedInventoryItem || selectedSpell) {",
  "lastSelectedTargetModeCancel",
  "return [];"
]) {
  assert(runtimeViewerSource.includes(snippet), `RuntimeSceneViewer should cancel selected target modes without dispatching fallback actions: ${snippet}`);
}

const objectMenuSource = readFileSync(
  path.resolve(projectRoot, "..", "Nh184-Client", "runelite-client", "src", "main", "java", "net", "runelite", "standalone", "class19.java"),
  "utf8"
);
for (const snippet of [
  "ObjectDefinition var21 = GrandExchangeOfferOwnWorldComparator.getObjectDefinition(var19);",
  "static void method340(int var0, int var1, int var2, int var3) {",
  "Client.isSpellSelected = true;",
  "ItemContainer.selectedSpellFlags = var2;",
  "if(Client.isItemSelected == 0 && !Client.isSpellSelected) {",
  "WorldMapData_1.method519(\"Walk here\", \"\", 23, 0, var0 - var2, var1 - var3);",
  "WorldMapData_1.method519(\"Use\", Client.selectedItemName + \" \" + \"->\" + \" \" + World.method1251(65535) + var21.name, 1, var19, var15, var17);",
  "if((ItemContainer.selectedSpellFlags & 4) == 4) {",
  "WorldMapData_1.method519(Client.selectedSpellActionName, Client.selectedSpellName + \" \" + \"->\" + \" \" + World.method1251(65535) + var21.name, 2, var19, var15, var17);",
  "String[] var28 = var21.actions;",
  "WorldMapData_1.method519(var28[var29], World.method1251(65535) + var21.name, var24, var20, var16, var17);",
  "WorldMapData_1.method519(\"Examine\", World.method1251(65535) + var21.name, 1002, var21.id, var16, var17);"
]) {
  assert(objectMenuSource.includes(snippet), `client object menu source should include ${snippet}`);
}
const clientMenuActionSource = readFileSync(
  path.resolve(projectRoot, "..", "Nh184-Client", "runelite-client", "src", "main", "java", "net", "runelite", "standalone", "Client.java"),
  "utf8"
);
for (const snippet of [
  "if(var2 == 1)",
  "ClientPacket.field2386",
  "if(var2 == 2)",
  "ClientPacket.field2408",
  "var9.packetBuffer.writeInt(AttackOption.selectedSpellWidget);",
  "var9.packetBuffer.method5659(selectedSpellChildIndex);",
  "if(var2 == 3)",
  "ClientPacket.field2391",
  "if(var2 == 1001)",
  "ClientPacket.field2390",
  "if(var2 == 1002)",
  "ClientPacket.field2376"
]) {
  assert(clientMenuActionSource.includes(snippet), `client object menu action source should include ${snippet}`);
}
for (const snippet of [
  "if(var2 == 14)",
  "ClientPacket.field2399",
  "if(var2 == 15)",
  "ClientPacket.field2395",
  "var10.packetBuffer.method5659(selectedSpellChildIndex);",
  "var10.packetBuffer.method5543(AttackOption.selectedSpellWidget);"
]) {
  assert(clientMenuActionSource.includes(snippet), `client selected-player action source should include ${snippet}`);
}
for (const snippet of [
  "if(var2 == 25)",
  "class19.method340(var1, var0, class12.method155(class12.method148(var17)), var17.itemId);",
  "isItemSelected = 0;",
  "selectedSpellActionName = VerticalAlignment.method4441(var17);",
  "selectedSpellName = var17.dataText + World.method1251(16777215);",
  "selectedSpellName = World.method1251(65280) + var17.spellName + World.method1251(16777215);"
]) {
  assert(clientMenuActionSource.includes(snippet), `client selected-spell action source should include ${snippet}`);
}
const clientPacketSource = readFileSync(
  path.resolve(projectRoot, "..", "Nh184-Client", "runelite-client", "src", "main", "java", "net", "runelite", "standalone", "ClientPacket.java"),
  "utf8"
);
for (const snippet of [
  "field2386 = new ClientPacket(46, 17);",
  "field2408 = new ClientPacket(68, 15);",
  "field2391 = new ClientPacket(51, 7);",
  "field2346 = new ClientPacket(6, 7);",
  "field2382 = new ClientPacket(42, 7);",
  "field2422 = new ClientPacket(95, 7);",
  "field2390 = new ClientPacket(50, 7);",
  "field2376 = new ClientPacket(36, 2);",
  "field2399 = new ClientPacket(59, 11);",
  "field2395 = new ClientPacket(55, 9);"
]) {
  assert(clientPacketSource.includes(snippet), `client context packet source should include ${snippet}`);
}
const assetExportSource = readFileSync(
  path.resolve(
    projectRoot,
    "..",
    "nh-osrs-184-master",
    "nh-osrs-184-master",
    "Nh-master",
    "runelite",
    "cache",
    "src",
    "main",
    "java",
    "net",
    "runelite",
    "cache",
    "tools",
    "NhNhTrainerAssetExport.java"
  ),
  "utf8"
);
assert(assetExportSource.includes("placement.put(\"actions\", object.getActions());"), "cache exporter should carry object action slots");
assert(assetExportSource.includes("placement.put(\"accessBlockMask\", object.getAccessBlockMask());"), "cache exporter should carry object access-block masks");
assert(assetExportSource.includes("placement.put(\"animationId\", object.getAnimationID());"), "cache exporter should carry object animation ids");
assert(assetExportSource.includes("placement.put(\"transformVarbit\", object.getVarbitID());"), "cache exporter should carry object transform varbits");
assert(assetExportSource.includes("placement.put(\"transformVarp\", object.getVarpID());"), "cache exporter should carry object transform varps");
assert(assetExportSource.includes("placement.put(\"transforms\", object.getConfigChangeDest() == null ? new int[0] : object.getConfigChangeDest());"), "cache exporter should carry object transform destinations");
assert(assetExportSource.includes("dto.put(\"clickMask\", widget.clickMask);"), "cache exporter should carry widget click masks");
assert(assetExportSource.includes("dto.put(\"spellActionName\", widget.targetVerb);"), "cache exporter should carry widget target verbs for spell selection");
assert(assetExportSource.includes("dto.put(\"spellName\", widget.spellName);"), "cache exporter should carry widget spell names");
assert(runtimeViewerSource.includes("findNhSceneObjectForWorldTile"), "RuntimeSceneViewer should resolve clicked scene objects from world tiles");
assert(runtimeViewerSource.includes("recordSceneObjectCommand"), "RuntimeSceneViewer should expose source object action dispatch metadata");
assert(runtimeViewerSource.includes("lastSceneObjectServerPacketId"), "RuntimeSceneViewer should expose object command packet ids");
assert(runtimeViewerSource.includes("\"scene-object\""), "RuntimeSceneViewer should distinguish object commands from plain tile clicks");

const captureImporterSource = readFileSync(path.join(projectRoot, "scripts", "capture-client-reference.mjs"), "utf8");
assert(captureImporterSource.includes("validateClientViewContextMenu"), "capture-client-reference should validate captured context menus");
assert(captureImporterSource.includes("client-context-menu-sizing-contract"), "capture-client-reference should require context menu sizing anchors");

console.log(JSON.stringify({
  ok: true,
  visibleText,
  defaultAction: defaultEntry.actionText,
  orderedBaseOpcodes,
  sourceContextMenu: contextSnapshot.contextMenu,
  sourceColors: {
    frame: NH_CONTEXT_MENU_FRAME_COLOR,
    body: NH_CONTEXT_MENU_BODY_COLOR,
    text: NH_CONTEXT_MENU_TEXT_COLOR,
    hoverAlpha: NH_CONTEXT_MENU_HOVER_FILL_ALPHA
  },
  objectMenu: {
    visibleObjectText,
    defaultAction: objectDefault.actionText,
    selectedItemText: nhMenuEntryText(objectUseEntries[0])
  },
  font: {
    id: contextMenuFont.fontId,
    archive: contextMenuFont.fontArchiveName,
    chooseOptionWidth: nhClientFontStringWidth(contextMenuFont, "Choose Option")
  },
  glyphSheet: {
    id: contextMenuFontSheet.id,
    glyphs: contextMenuFontSheet.sprites.length,
    image: contextMenuFontSheet.image
  },
  rect,
  topVisibleHitIndex
}, null, 2));
