import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { verifyRuntimeSetupPreferences } from "./checks/runtime-setup-preferences.mjs";
import { verifyDmmRuntime } from "./checks/dmm-runtime.mjs";
import { verifyPolicyContracts } from "./checks/policy-contract.mjs";
import { verifySpellImpactTiming } from "./checks/spell-impact-timing.mjs";

// Only invoked by Node/npm. No test hooks, timers, or imports are added to the game.
verifyRuntimeSetupPreferences();
verifyDmmRuntime();
verifyPolicyContracts();
verifySpellImpactTiming();
const viewer = readFileSync(fileURLToPath(new URL("../src/ui/RuntimeSceneViewer.tsx", import.meta.url)), "utf8");
assert(viewer.includes("setActiveSpellbookId(setup.spellbookId)"), "Setup selection must apply its spellbook");
assert(viewer.includes('runtimeSetupPresetIdRef.current === "nh-stake" && shouldRuntimePolicyResetForFreshFight'),
  "Legacy NH restoration must remain scoped to NH");
await import("./verify-nh-stake-policy.mjs");
console.log("Runtime mode checks passed: all four spellbook transitions, saved preferences, decoder contracts, DMM gear, and NH movement.");
