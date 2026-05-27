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

const pluginSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/suppliestracker/SuppliesTrackerPlugin.java");
const panelSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/suppliestracker/SuppliesTrackerPanel.java");
const boxSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/suppliestracker/SuppliesBox.java");
const itemTypeSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/suppliestracker/ItemType.java");
const configSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/suppliestracker/SuppliesTrackerConfig.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const runtimeCombatSource = read("src/sim/runtimePlayerCombat.ts");
const cssSource = read("src/ui/styles.css");

for (const sourceAnchor of [
  'name = "Supplies Used Tracker"',
  'enabledByDefault = false',
  'tooltip("Supplies Tracker")',
  '.priority(5)',
  'eventBus.subscribe(GameTick.class',
  'eventBus.subscribe(ItemContainerChanged.class',
  'eventBus.subscribe(MenuOptionClicked.class',
  'buildEntries(int itemId, int count)'
]) {
  assert(pluginSource.includes(sourceAnchor), `RuneLite SuppliesTrackerPlugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'setBorder(new EmptyBorder(6, 6, 6, 6))',
  'overallPanel.setBorder(new EmptyBorder(10, 10, 10, 10))',
  'overallInfo.setLayout(new GridLayout(2, 1))',
  'errorPanel.setContent("Supply trackers", "You have not used any supplies yet.")',
  'overallPanel.setComponentPopupMenu(popupMenu)'
]) {
  assert(panelSource.includes(sourceAnchor), `RuneLite SuppliesTrackerPanel source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'private static final int ITEMS_PER_ROW = 5',
  'itemContainer.setLayout(new GridLayout(rowSize, ITEMS_PER_ROW, 1, 1))',
  'trackedItems.add(item)',
  'items.sort((i1, i2) -> Long.compare(i2.getPrice(), i1.getPrice()))',
  'setComponentPopupMenu(popupMenu)'
]) {
  assert(boxSource.includes(sourceAnchor), `RuneLite SuppliesBox source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'FOOD("Food")',
  'POTION("Potions")',
  'RUNE("Runes")',
  'AMMO("Ammo")',
  'TELEPORT("Teleports")',
  'contains("(4)")'
]) {
  assert(itemTypeSource.includes(sourceAnchor), `RuneLite ItemType source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("suppliestracker")',
  'keyName = "blowpipeTitle"',
  'default BlowpipeDartType blowpipeAmmo()',
  'return BlowpipeDartType.MITHRIL;'
]) {
  assert(configSource.includes(sourceAnchor), `RuneLite SuppliesTrackerConfig source missing ${sourceAnchor}`);
}

for (const trainerAnchor of [
  'id: "supplies-tracker"',
  'name: "Supplies Used Tracker"',
  'tooltip: "Supplies Tracker"',
  'iconPath: "runelite-plugins/suppliestracker/panel_icon.png"',
  'group: "suppliestracker"',
  'RuneliteSuppliesTrackerPanel',
  'data-source-panel="SuppliesTrackerPanel extends PluginPanel"',
  'data-source-items-per-row="5"',
  'runeliteQuantityToStackSize'
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell missing Supplies Tracker anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'readonly kind: "supply"',
  'const supplyEvent: RuntimePlayerCombatEvent',
  'actor.supplies[item] - 1',
  'healed: result.healed'
]) {
  assert(runtimeCombatSource.includes(trainerAnchor), `runtimePlayerCombat missing Supplies Tracker event anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'runeliteSuppliesTrackerSnapshotFromCombatState',
  'event.kind !== "supply"',
  'event.actorId !== "local-player"',
  'runeliteSuppliesTrackerCanonicalName',
  'runeliteSuppliesTrackerDoseDivisor',
  'runeliteSuppliesTrackerItemSprite',
  'suppliesTrackerSnapshot={runeliteSuppliesTrackerSnapshot}'
]) {
  assert(runtimeSource.includes(trainerAnchor), `RuntimeSceneViewer missing Supplies Tracker runtime anchor ${trainerAnchor}`);
}

for (const cssAnchor of [
  '.runeliteSuppliesTrackerPanel',
  '.runeliteSuppliesOverallPanel',
  '.runeliteSuppliesBoxHeader',
  '.runeliteSuppliesItemGrid',
  'grid-template-columns: repeat(5, 1fr)'
]) {
  assert(cssSource.includes(cssAnchor), `CSS missing Supplies Tracker anchor ${cssAnchor}`);
}

assert(
  fs.existsSync(path.join(projectRoot, "fixtures", "runelite-plugins", "suppliestracker", "panel_icon.png")),
  "missing RuneLite Supplies Tracker panel_icon.png asset"
);

console.log("RuneLite Supplies Tracker verifier passed: nav/config/panel and supply-event feed are source-backed.");
