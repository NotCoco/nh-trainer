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
      module: ts.ModuleKind.CommonJS,
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
      require: (request) => (request.startsWith(".") ? loadModule(path.resolve(path.dirname(resolvedPath), request)) : require(request)),
      console
    },
    { filename: resolvedPath }
  );
  return module.exports;
}

function resolveModulePath(candidatePath) {
  const attempts = [
    candidatePath,
    `${candidatePath}.ts`,
    `${candidatePath}.tsx`,
    `${candidatePath}.js`,
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
      // Try the next module candidate.
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
  KRONOS_INVENTORY_WIDGET_ID,
  KRONOS_INVENTORY_SPELL_SELECTED_OPCODE,
  KRONOS_INVENTORY_USE_SELECTED_OPCODE,
  buildKronosInventoryContextEntries,
  createKronosInventoryEquipmentDefinitionStore,
  createKronosInventoryItemDefinitionStore,
  kronosInventoryQuantityText,
  mutateKronosInventorySlotsForAction,
  normalizeKronosInventorySlots
} = loadTsModule("src/render/kronosInventory.ts");
const {
  kronosMenuEntryText,
  selectKronosDefaultMenuEntry,
  visibleKronosMenuEntries
} = loadTsModule("src/render/kronosContextMenu.ts");
const { assertValidClientViewTrace } = loadTsModule("src/sim/clientView.ts");
const {
  clientViewTraceToRuntimeReplay,
  sampleRuntimeReplayScene
} = loadTsModule("src/render/clientViewReplay.ts");

const cacheItems = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "cache-items.json"), "utf8"));
const inventoryDefinitions = createKronosInventoryItemDefinitionStore(cacheItems);
const stackableCoins = inventoryDefinitions.get(995);
const nonStackableBrew = inventoryDefinitions.get(6685);
assert(stackableCoins?.name === "Coins", `missing exported coins definition: ${JSON.stringify(stackableCoins)}`);
assert(stackableCoins.stackable === true, `coins should be stackable: ${JSON.stringify(stackableCoins)}`);
assert(
  Array.isArray(stackableCoins.countObj) && Array.isArray(stackableCoins.countCo),
  `coins should preserve count-object thresholds: ${JSON.stringify(stackableCoins)}`
);
assert(nonStackableBrew?.stackable === false, `brew should remain non-stackable: ${JSON.stringify(nonStackableBrew)}`);

const cases = [
  { quantity: 1, expected: null },
  { quantity: 2, expected: { text: "2", color: "#ffff00" } },
  { quantity: 99999, expected: { text: "99999", color: "#ffff00" } },
  { quantity: 100000, expected: { text: "100K", color: "#ffffff" } },
  { quantity: 9999999, expected: { text: "9999K", color: "#ffffff" } },
  { quantity: 10000000, expected: { text: "10M", color: "#00ff80" } }
];

const results = cases.map(({ quantity, expected }) => {
  const actual = kronosInventoryQuantityText(quantity, stackableCoins, 2);
  assert(JSON.stringify(actual) === JSON.stringify(expected), `quantity text mismatch for ${quantity}: ${JSON.stringify(actual)}`);
  return { quantity, actual };
});
assert(
  kronosInventoryQuantityText(99999, nonStackableBrew, 2) === null,
  `fixed inventory quantity mode should suppress non-stackable stack text: ${JSON.stringify(nonStackableBrew)}`
);
assert(
  JSON.stringify(kronosInventoryQuantityText(99999, nonStackableBrew, 1)) ===
    JSON.stringify({ text: "99999", color: "#ffff00" }),
  "forced quantity mode should still render source stack text"
);

const normalized = normalizeKronosInventorySlots([{ itemId: 6685, quantity: 100000 }]);
assert(normalized.length === 28, `normalized inventory length mismatch: ${normalized.length}`);
assert(normalized[0]?.quantity === 100000, `normalized inventory should preserve source itemQuantity: ${JSON.stringify(normalized[0])}`);
assert(normalized[1] === null, `missing slots should remain empty: ${JSON.stringify(normalized[1])}`);

const itemSpriteAtlas = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "render", "sprites", "item_sprites.json"), "utf8"));
const serverItems = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "server-items.json"), "utf8"));
const equipmentDefinitions = createKronosInventoryEquipmentDefinitionStore(serverItems);
const armadylCrossbow = inventoryDefinitions.get(11785);
assert(armadylCrossbow?.interfaceOptions[1] === "Wield", `missing source Wield option: ${JSON.stringify(armadylCrossbow)}`);
assert(inventoryDefinitions.get(6687)?.name === "Saradomin brew(3)", "missing exported brew dose item definition");
assert(equipmentDefinitions.get(11785)?.equipSlot === 3, `missing server equip slot: ${JSON.stringify(equipmentDefinitions.get(11785))}`);
const armadylCrossbowSprites = itemSpriteAtlas.sprites.filter((sprite) => sprite.itemId === 11785);
const armadylCrossbowNormalSprite = armadylCrossbowSprites.find((sprite) => sprite.variant === "normal");
const armadylCrossbowSelectedSprite = armadylCrossbowSprites.find((sprite) => sprite.variant === "selected");
assert(armadylCrossbowNormalSprite?.sourceBorder === 1, `missing normal item sprite variant: ${JSON.stringify(armadylCrossbowSprites)}`);
assert(armadylCrossbowNormalSprite?.sourceShadowColor === 3153952, `normal item sprite shadow mismatch: ${JSON.stringify(armadylCrossbowNormalSprite)}`);
assert(armadylCrossbowSelectedSprite?.sourceBorder === 2, `missing selected item sprite variant: ${JSON.stringify(armadylCrossbowSprites)}`);
assert(armadylCrossbowSelectedSprite?.sourceShadowColor === 0, `selected item sprite shadow mismatch: ${JSON.stringify(armadylCrossbowSelectedSprite)}`);
const coinSprites = itemSpriteAtlas.sprites.filter((sprite) => sprite.itemId === 995);
const coinNormalBaseSprite = coinSprites.find((sprite) => sprite.variant === "normal" && sprite.sourceQuantity === 1 && sprite.quantityVariant === false);
const coinQuantityVariantSprites = coinSprites.filter(
  (sprite) => sprite.variant === "normal" && sprite.quantityVariant === true && sprite.sourceQuantity > 1
);
assert(coinNormalBaseSprite?.sourceBorder === 1, `missing coins base sprite variant: ${JSON.stringify(coinSprites)}`);
assert(coinQuantityVariantSprites.length > 0, `missing coins count-object sprite variants: ${JSON.stringify(coinSprites)}`);
assert(
  coinQuantityVariantSprites.some((sprite) => sprite.sourceQuantity <= 100000),
  `coins count-object variants should include usable stack thresholds: ${JSON.stringify(coinQuantityVariantSprites)}`
);
const armadylCrossbowMenu = buildKronosInventoryContextEntries({
  slot: { itemId: 11785, quantity: 1 },
  slotIndex: 0,
  widgetId: KRONOS_INVENTORY_WIDGET_ID,
  itemDefinition: armadylCrossbow
});
const visibleInventoryText = visibleKronosMenuEntries(armadylCrossbowMenu).map((entry) => kronosMenuEntryText(entry));
const expectedInventoryText = [
  "Wield Armadyl crossbow",
  "Use Armadyl crossbow",
  "Drop Armadyl crossbow",
  "Examine Armadyl crossbow"
];
assert(
  JSON.stringify(visibleInventoryText) === JSON.stringify(expectedInventoryText),
  `unexpected inventory menu text: ${JSON.stringify(visibleInventoryText)}`
);
const inventoryDefault = selectKronosDefaultMenuEntry(armadylCrossbowMenu);
assert(inventoryDefault?.actionText === "Wield", `inventory default should be Wield: ${JSON.stringify(inventoryDefault)}`);
assert(inventoryDefault?.opcode === 34, `Wield should carry source opcode 34: ${JSON.stringify(inventoryDefault)}`);
assert(inventoryDefault?.argument1 === 0, `inventory argument1 should be slot index: ${JSON.stringify(inventoryDefault)}`);
assert(inventoryDefault?.argument2 === KRONOS_INVENTORY_WIDGET_ID, `inventory argument2 should be widget id: ${JSON.stringify(inventoryDefault)}`);
const selectedCrossbow = {
  itemId: 11785,
  itemName: armadylCrossbow.name,
  slotIndex: 0,
  widgetId: KRONOS_INVENTORY_WIDGET_ID
};
const selectedUseMenu = buildKronosInventoryContextEntries({
  slot: { itemId: 385, quantity: 1 },
  slotIndex: 1,
  widgetId: KRONOS_INVENTORY_WIDGET_ID,
  itemDefinition: inventoryDefinitions.get(385),
  selectedItem: selectedCrossbow
});
const selectedUseText = visibleKronosMenuEntries(selectedUseMenu).map((entry) => kronosMenuEntryText(entry));
assert(
  JSON.stringify(selectedUseText) === JSON.stringify(["Use Armadyl crossbow -> Shark"]),
  `selected item use menu mismatch: ${JSON.stringify(selectedUseText)}`
);
const selectedUseDefault = selectKronosDefaultMenuEntry(selectedUseMenu);
assert(selectedUseDefault?.action === "inventory-use-selected", `selected target should use item-on-item action: ${JSON.stringify(selectedUseDefault)}`);
assert(selectedUseDefault?.opcode === KRONOS_INVENTORY_USE_SELECTED_OPCODE, `selected target opcode mismatch: ${JSON.stringify(selectedUseDefault)}`);
assert(selectedUseDefault?.identifier === 385, `selected target identifier should be target item id: ${JSON.stringify(selectedUseDefault)}`);
assert(selectedUseDefault?.argument1 === 1, `selected target argument1 should be target slot: ${JSON.stringify(selectedUseDefault)}`);
assert(selectedUseDefault?.argument2 === KRONOS_INVENTORY_WIDGET_ID, `selected target argument2 should be target widget: ${JSON.stringify(selectedUseDefault)}`);
assert(selectedUseDefault?.selectedItem?.itemId === 11785, `selected target should carry source selected item: ${JSON.stringify(selectedUseDefault)}`);
const sameSlotSelectedMenu = buildKronosInventoryContextEntries({
  slot: { itemId: 11785, quantity: 1 },
  slotIndex: 0,
  widgetId: KRONOS_INVENTORY_WIDGET_ID,
  itemDefinition: armadylCrossbow,
  selectedItem: selectedCrossbow
});
assert(sameSlotSelectedMenu.length === 0, `selected item source path should not add Use -> itself: ${JSON.stringify(sameSlotSelectedMenu)}`);
const selectedPlayerSpell = {
  actionName: "Cast",
  spellName: "<col=00ff00>Ice Barrage<col=ffffff>",
  flags: 8,
  widgetId: 14286925,
  childId: 77,
  itemId: 4651,
  spellId: "ice-barrage",
  label: "Ice Barrage"
};
const combatSpellInventoryMenu = buildKronosInventoryContextEntries({
  slot: { itemId: 385, quantity: 1 },
  slotIndex: 1,
  widgetId: KRONOS_INVENTORY_WIDGET_ID,
  itemDefinition: inventoryDefinitions.get(385),
  selectedSpell: selectedPlayerSpell
});
assert(
  combatSpellInventoryMenu.length === 0,
  `selected player-target spell should not fall back to item actions: ${JSON.stringify(combatSpellInventoryMenu)}`
);
const selectedInventorySpell = {
  ...selectedPlayerSpell,
  flags: 16
};
const spellOnItemMenu = buildKronosInventoryContextEntries({
  slot: { itemId: 385, quantity: 1 },
  slotIndex: 1,
  widgetId: KRONOS_INVENTORY_WIDGET_ID,
  itemDefinition: inventoryDefinitions.get(385),
  selectedSpell: selectedInventorySpell
});
const spellOnItemDefault = selectKronosDefaultMenuEntry(spellOnItemMenu);
assert(spellOnItemMenu.length === 1, `selected item-target spell should add one item spell entry: ${JSON.stringify(spellOnItemMenu)}`);
assert(spellOnItemDefault?.action === "inventory-spell-selected", `selected item-target spell default mismatch: ${JSON.stringify(spellOnItemDefault)}`);
assert(spellOnItemDefault?.opcode === KRONOS_INVENTORY_SPELL_SELECTED_OPCODE, `selected item-target spell opcode mismatch: ${JSON.stringify(spellOnItemDefault)}`);
assert(
  kronosMenuEntryText(spellOnItemDefault) === "Cast Ice Barrage -> Shark",
  `selected item-target spell text mismatch: ${spellOnItemDefault ? kronosMenuEntryText(spellOnItemDefault) : "null"}`
);
const brewMenu = buildKronosInventoryContextEntries({
  slot: { itemId: 6685, quantity: 1 },
  slotIndex: 0,
  widgetId: KRONOS_INVENTORY_WIDGET_ID,
  itemDefinition: inventoryDefinitions.get(6685)
});
const brewVisibleText = visibleKronosMenuEntries(brewMenu).map((entry) => kronosMenuEntryText(entry));
assert(
  JSON.stringify(brewVisibleText) ===
    JSON.stringify([
      "Drink Saradomin brew(4)",
      "Use Saradomin brew(4)",
      "Empty Saradomin brew(4)",
      "Drop Saradomin brew(4)",
      "Examine Saradomin brew(4)"
    ]),
  `brew source menu should include Drink, Use, Empty, Drop, Examine in client order: ${JSON.stringify(brewVisibleText)}`
);
const brewDefault = selectKronosDefaultMenuEntry(brewMenu);
assert(brewDefault?.actionText === "Drink", `brew default should be Drink: ${JSON.stringify(brewDefault)}`);
const brewMutation = mutateKronosInventorySlotsForAction([{ itemId: 6685, quantity: 1 }], brewDefault);
assert(brewMutation.mutation?.kind === "drink-dose", `brew mutation kind mismatch: ${JSON.stringify(brewMutation)}`);
assert(brewMutation.slots[0]?.itemId === 6687, `brew should mutate to dose 3: ${JSON.stringify(brewMutation)}`);
const emptyEntry = brewMenu.find((entry) => entry.actionText === "Empty");
assert(emptyEntry?.opcode === 36, `Empty should carry source opcode 36: ${JSON.stringify(emptyEntry)}`);
assert(emptyEntry?.actionIndex === 3, `Empty should preserve source action index 3: ${JSON.stringify(emptyEntry)}`);
const emptyMutation = mutateKronosInventorySlotsForAction([{ itemId: 6685, quantity: 1 }], emptyEntry);
assert(emptyMutation.mutation?.kind === "empty-vial", `empty mutation kind mismatch: ${JSON.stringify(emptyMutation)}`);
assert(emptyMutation.slots[0]?.itemId === 229, `empty should replace potion with vial: ${JSON.stringify(emptyMutation)}`);
const vialMenu = buildKronosInventoryContextEntries({
  slot: { itemId: 229, quantity: 1 },
  slotIndex: 0,
  widgetId: KRONOS_INVENTORY_WIDGET_ID,
  itemDefinition: inventoryDefinitions.get(229)
});
const dropEntry = vialMenu.find((entry) => entry.actionText === "Drop");
assert(dropEntry?.opcode === 37, `Drop should carry source opcode 37: ${JSON.stringify(dropEntry)}`);
assert(dropEntry?.actionIndex === 4, `Drop should preserve source action index 4: ${JSON.stringify(dropEntry)}`);
const dropMutation = mutateKronosInventorySlotsForAction([{ itemId: 229, quantity: 1 }], dropEntry);
assert(dropMutation.mutation?.kind === "drop-remove", `drop mutation kind mismatch: ${JSON.stringify(dropMutation)}`);
assert(dropMutation.slots[0] === null, `drop should clear the inventory slot: ${JSON.stringify(dropMutation)}`);
const sharkMenu = buildKronosInventoryContextEntries({
  slot: { itemId: 385, quantity: 1 },
  slotIndex: 0,
  widgetId: KRONOS_INVENTORY_WIDGET_ID,
  itemDefinition: inventoryDefinitions.get(385)
});
const sharkDefault = selectKronosDefaultMenuEntry(sharkMenu);
const sharkMutation = mutateKronosInventorySlotsForAction([{ itemId: 385, quantity: 1 }], sharkDefault);
assert(sharkMutation.mutation?.kind === "eat-remove", `shark mutation kind mismatch: ${JSON.stringify(sharkMutation)}`);
assert(sharkMutation.slots[0] === null, `shark should clear the inventory slot: ${JSON.stringify(sharkMutation)}`);

const selectedClientViewTrace = {
  schemaVersion: "client-view.v1",
  fixtureId: "generated-selected-inventory-source-v1",
  description: "Synthetic client-view trace for source selected inventory item state.",
  actors: ["self", "opponent"],
  sourceAnchorIds: [
    "client-container-widget-update-contract",
    "client-inventory-widget-item-draw-contract",
    "client-inventory-use-selection-contract",
    "client-inventory-selected-item-sprite-contract"
  ],
  ticks: [
    {
      tick: 0,
      actors: {
        self: {
          actorId: "self",
          tile: { x: 3094, y: 3957, plane: 0 },
          equipment: {},
          animations: { pose: 808 },
          overheadPrayer: "none",
          skullIcon: "none"
        },
        opponent: {
          actorId: "opponent",
          tile: { x: 3098, y: 3957, plane: 0 },
          equipment: {},
          animations: { pose: 808 },
          overheadPrayer: "none",
          skullIcon: "none"
        }
      },
      inventory: Array.from({ length: 28 }, (_, index) => ({
        widgetItemId: index === 0 ? 11786 : index === 1 ? 386 : 0,
        quantity: index === 0 || index === 1 ? 1 : 0
      })),
      selectedInventoryItem: {
        itemId: 11785,
        itemName: "Armadyl crossbow",
        slotIndex: 0,
        widgetId: KRONOS_INVENTORY_WIDGET_ID
      },
      eventIds: []
    }
  ],
  events: []
};
assertValidClientViewTrace(selectedClientViewTrace);
const selectedReplay = clientViewTraceToRuntimeReplay(selectedClientViewTrace);
const selectedSnapshot = sampleRuntimeReplayScene(selectedReplay, 0);
assert(
  selectedSnapshot.selectedInventoryItem?.itemId === 11785 &&
    selectedSnapshot.selectedInventoryItem.itemName === "Armadyl crossbow" &&
    selectedSnapshot.selectedInventoryItem.slotIndex === 0 &&
    selectedSnapshot.selectedInventoryItem.widgetId === KRONOS_INVENTORY_WIDGET_ID,
  `client-view selected item did not reach runtime snapshot: ${JSON.stringify(selectedSnapshot.selectedInventoryItem)}`
);
const selectedSnapshotTargetMenu = buildKronosInventoryContextEntries({
  slot: selectedSnapshot.inventory[1],
  slotIndex: 1,
  widgetId: KRONOS_INVENTORY_WIDGET_ID,
  itemDefinition: inventoryDefinitions.get(385),
  selectedItem: selectedSnapshot.selectedInventoryItem
});
assert(
  JSON.stringify(visibleKronosMenuEntries(selectedSnapshotTargetMenu).map((entry) => kronosMenuEntryText(entry))) ===
    JSON.stringify(["Use Armadyl crossbow -> Shark"]),
  `runtime snapshot selected item should drive source item-on-item menu: ${JSON.stringify(selectedSnapshotTargetMenu)}`
);

console.log(
  JSON.stringify(
    {
      ok: true,
      results,
      firstSlot: normalized[0],
      visibleInventoryText,
      selectedUseText,
      selectedSpriteVariant: armadylCrossbowSelectedSprite,
      selectedSnapshotItem: selectedSnapshot.selectedInventoryItem,
      brewMutation: brewMutation.mutation,
      emptyMutation: emptyMutation.mutation,
      dropMutation: dropMutation.mutation,
      sharkMutation: sharkMutation.mutation
    },
    null,
    2
  )
);
