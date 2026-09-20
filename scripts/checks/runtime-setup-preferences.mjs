import assert from "node:assert/strict";
import { createTsModuleLoader } from "../lib/load-ts-module.mjs";

export function verifyRuntimeSetupPreferences() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  const load = createTsModuleLoader({ window: { localStorage: storage, innerWidth: 1280, innerHeight: 800 } });
  const presets = load("src/ui/runtimeSetupPresets.ts");
  const prefs = load("src/ui/runtimePreferences.ts");
  const keys = load("src/ui/nhGameKeybinds.ts");
  const expectedSpellbooks = { "nh-stake": "ancient", dmm: "ancient", webweaver: "lunar" };
  const snapshots = new Map();
  for (const setupId of Object.keys(expectedSpellbooks)) {
    const setup = presets.runtimeSetupPreset(setupId);
    const inventory = presets.runtimeSetupInventorySlots(setupId);
    const snapshot = {
      version: 1, setupId, savedAt: 123, loadoutId: setup.loadoutId,
      inventory: [...inventory.slice(1), inventory[0]],
      equipment: [...presets.runtimeSetupEquipmentItems(setupId)]
    };
    assert(prefs.writeTemporarySavedSetupSnapshot(snapshot), `${setupId} saved setup must remain valid`);
    snapshots.set(setupId, JSON.stringify(snapshot));
  }
  prefs.writeStoredAttackSetIndex(2);
  prefs.writeStoredAutoRetaliate(false);
  prefs.writeStoredOptionsSoundVolume(prefs.NH_SOUND_EFFECT_VOLUME_STORAGE_KEY, 1.25);
  prefs.writeStoredClientDisplayMode("resizable");
  prefs.writeStoredSpellbookOrders({ ancient: ["ice_barrage"], lunar: ["vengeance"] });
  const customKeys = {
    ...keys.NH_DEFAULT_GAME_KEYBINDS,
    keySlotsByTabId: { ...keys.NH_DEFAULT_GAME_KEYBINDS.keySlotsByTabId, inventory: 5 },
    escapeCloses: true
  };
  keys.nhWriteGameKeybindsToStorage(customKeys);
  storage.setItem("unrelated-plugin-preference", "keep-me");
  const storedBefore = JSON.stringify([...values]);
  for (const previousMode of Object.keys(expectedSpellbooks)) {
    for (const nextMode of Object.keys(expectedSpellbooks)) {
      // Choosing a preset must be independent of the previous mode and saved item order.
      presets.runtimeSetupPreset(previousMode);
      const next = presets.runtimeSetupPreset(nextMode);
      assert.equal(next.spellbookId, expectedSpellbooks[nextMode], `${previousMode} -> ${nextMode}`);
      assert.equal(JSON.stringify(prefs.readTemporarySavedSetupSnapshot(nextMode)), snapshots.get(nextMode));
      assert.equal(prefs.readStoredAttackSetIndex(), 2);
      assert.equal(prefs.readStoredAutoRetaliate(), false);
      assert.equal(prefs.readStoredClientDisplayMode(), "resizable");
      assert.equal(prefs.readStoredOptionsSoundVolume(prefs.NH_SOUND_EFFECT_VOLUME_STORAGE_KEY), 1.25);
      assert.equal(JSON.stringify(keys.nhReadGameKeybindsFromStorage()), JSON.stringify(customKeys));
    }
  }
  assert.equal(JSON.stringify([...values]), storedBefore, "Reading/changing mode must preserve saved preferences");
  assert.equal(prefs.temporarySavedSetupStorageKey("dmm"), "nhTrainer.temporaryNhStakeSetup.v1.dmm");

  // Preserve the existing unscoped-save migration without applying one mode's gear to another.
  values.clear();
  const { setupId, ...legacyDmm } = JSON.parse(snapshots.get("dmm"));
  storage.setItem("nhTrainer.temporaryNhStakeSetup.v1", JSON.stringify(legacyDmm));
  assert.equal(prefs.readTemporarySavedSetupSnapshot("dmm")?.setupId, "dmm");
  assert.equal(prefs.readTemporarySavedSetupSnapshot("nh-stake"), null);
  assert.equal(prefs.readTemporarySavedSetupSnapshot("webweaver"), null);
  storage.setItem("source.autoRetaliate.v1", "false");
  assert.equal(prefs.readStoredAutoRetaliate(), false);
  assert.equal(storage.getItem("nhTrainer.autoRetaliate.v1"), "false");
  assert.equal(storage.getItem("source.autoRetaliate.v1"), "false");
  for (const [rune, quantity] of Object.entries(presets.RUNTIME_WEBWEAVER_POUCH_RUNES)) {
    assert.equal(quantity / presets.RUNTIME_WEBWEAVER_VENGEANCE_RUNE_COST[rune], 10);
  }
}
