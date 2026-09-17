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
  assert.deepEqual(Object.keys(presets.RUNTIME_TRAINER_SETUP_PRESETS), ["nh-stake", "dmm"]);
  const setup = presets.runtimeSetupPreset("nh-stake");
  const inventory = presets.runtimeSetupInventorySlots("nh-stake");
  const snapshot = {
    version: 1, savedAt: 123, loadoutId: setup.loadoutId,
    inventory: [...inventory.slice(1), inventory[0]],
    equipment: [...presets.runtimeSetupEquipmentItems("nh-stake")]
  };
  assert(prefs.writeTemporarySavedSetupSnapshot(snapshot));
  prefs.writeStoredAttackSetIndex(2);
  prefs.writeStoredAutoRetaliate(false);
  prefs.writeStoredOptionsSoundVolume(prefs.NH_SOUND_EFFECT_VOLUME_STORAGE_KEY, 1.25);
  prefs.writeStoredClientDisplayMode("resizable");
  prefs.writeStoredSpellbookOrders({ ancient: ["ice_barrage"] });
  const customKeys = {
    ...keys.NH_DEFAULT_GAME_KEYBINDS,
    keySlotsByTabId: { ...keys.NH_DEFAULT_GAME_KEYBINDS.keySlotsByTabId, inventory: 5 },
    escapeCloses: true
  };
  keys.nhWriteGameKeybindsToStorage(customKeys);
  storage.setItem("unrelated-plugin-preference", "keep-me");
  const storedBefore = JSON.stringify([...values]);
  for (const previousMode of ["nh-stake", "dmm"]) {
    for (const nextMode of ["nh-stake", "dmm"]) {
      presets.runtimeSetupPreset(previousMode);
      assert.equal(presets.runtimeSetupPreset(nextMode).spellbookId, "ancient");
      assert.equal(JSON.stringify(prefs.readTemporarySavedSetupSnapshot()), JSON.stringify(snapshot));
      assert.equal(prefs.readStoredAttackSetIndex(), 2);
      assert.equal(prefs.readStoredAutoRetaliate(), false);
      assert.equal(prefs.readStoredClientDisplayMode(), "resizable");
      assert.equal(prefs.readStoredOptionsSoundVolume(prefs.NH_SOUND_EFFECT_VOLUME_STORAGE_KEY), 1.25);
      assert.equal(JSON.stringify(keys.nhReadGameKeybindsFromStorage()), JSON.stringify(customKeys));
    }
  }
  assert.equal(JSON.stringify([...values]), storedBefore, "Mode selection must preserve saved preferences");
  assert.equal(prefs.NH_TEMPORARY_SAVED_SETUP_STORAGE_KEY, "nhTrainer.temporaryNhStakeSetup.v1");
  values.clear();
  storage.setItem("source.autoRetaliate.v1", "false");
  assert.equal(prefs.readStoredAutoRetaliate(), false);
  assert.equal(storage.getItem("nhTrainer.autoRetaliate.v1"), "false");
  assert.equal(storage.getItem("source.autoRetaliate.v1"), "false");
}
