import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const cssSource = read("src/ui/styles.css");

for (const anchor of [
  'NH_TRAINER_ATTACK_SET_STORAGE_KEY = "nhTrainer.attackSet.v1"',
  "readStoredAttackSetIndex()",
  "writeStoredAttackSetIndex(nextAttackSetIndex)",
  'KRONOS_AUTO_RETALIATE_STORAGE_KEY = "nhTrainer.autoRetaliate.v1"',
  'LEGACY_AUTO_RETALIATE_STORAGE_KEYS = ["source.autoRetaliate.v1"]',
  "initialHudOverrideFromStorage()",
  "writeStoredAutoRetaliate(nextEnabled)",
  'KRONOS_TEMPORARY_SAVED_SETUP_STORAGE_KEY = "nhTrainer.temporaryNhStakeSetup.v1"',
  "interface TemporarySavedSetupSnapshot",
  "readTemporarySavedSetupSnapshot()",
  "writeTemporarySavedSetupSnapshot(snapshot)",
  "applyTemporarySavedSetupSnapshot(snapshot, \"startup\")",
  "saveTemporaryCurrentSetup",
  "RUNTIME_NH_STAKE_INVENTORY_ITEM_IDS",
  "RUNTIME_NH_STAKE_EQUIPMENT_ENTRIES",
  "RUNTIME_NH_STAKE_EQUIPMENT_ITEMS",
  "RUNTIME_NH_STAKE_INVENTORY_SLOTS",
  "RUNTIME_NH_STAKE_GEAR_PROFILE",
  "const initialRuntimePlayerCombatBaseState = createRuntimePlayerCombatState({",
  "const initialRuntimePlayerCombatState = syncRuntimePlayerCombatStateToInput(initialRuntimePlayerCombatBaseState",
  "equipment: RUNTIME_NH_STAKE_VISIBLE_EQUIPMENT",
  "inventoryItems: RUNTIME_NH_STAKE_VISIBLE_INVENTORY_ITEMS",
  "inventorySlots: RUNTIME_NH_STAKE_INVENTORY_SLOTS",
  "() => [...RUNTIME_NH_STAKE_INVENTORY_SLOTS]",
  "() => new Map(RUNTIME_NH_STAKE_EQUIPMENT_ITEMS)",
  "applyRuntimeNhStakeSetupPreset",
  "const freshCombatState = createRuntimePlayerCombatState({",
  "syncRuntimePlayerCombatStateToInput(freshCombatState",
  "manualOpponentTargetTrackingRef.current = emptyRuntimePolicyTargetTrackingState",
  "manualOpponentNextPolicyRepositionTickRef.current = 0",
  "lastNhStakeOpponentEquipmentWeapon",
  "restoreLocalSpecialEnergyForTesting",
  "runtimePlayerCombatStateWithLocalSpecialEnergy(manualCombatStateRef.current, 100)",
  "toggleLocalFreezeBypassForTesting",
  "runtimePlayerCombatStateWithLocalFreezeBypass(result.state)",
  "resetFreeze(actor.locks)",
  "data-temporary-dev-controls=\"true\"",
  "new WebGLRenderer({ antialias: false"
]) {
  assert(runtimeSource.includes(anchor), `RuntimeSceneViewer missing temporary runtime/control anchor: ${anchor}`);
}

assert(
  !runtimeSource.includes('<button type="button" onClick={applyRuntimeNhStakeSetupPreset}>'),
  "NH stake setup is now the startup baseline and should not be exposed as a visible temporary button."
);

for (const anchor of [
  ".runtimeTemporaryDevControls",
  ".runtimeTemporaryDevControls button",
  ".runtimeTemporaryDevStatus"
]) {
  assert(cssSource.includes(anchor), `styles.css missing temporary dev control style: ${anchor}`);
}

console.log("Runtime dev controls verifier passed: NH stake startup baseline, auto-retaliate persistence, temporary spec/freeze controls, saved setup load, and source-like renderer AA are wired.");
