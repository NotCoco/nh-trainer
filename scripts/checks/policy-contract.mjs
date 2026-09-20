import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadTsModule, projectRoot } from "../lib/load-ts-module.mjs";

export function createDmmRegressionContexts() {
  const duel = loadTsModule("src/sim/nh/duel.ts");
  const gear = loadTsModule("src/sim/nh/gearProfile.ts");
  const loadouts = loadTsModule("src/sim/nh/loadouts.ts");
  const equipment = loadouts.nhLoadouts["noxious-halberd"].equipment;
  const gearProfile = gear.inferNhSelectedGearProfile({ equipment, inventoryItems: Object.values(equipment) });
  const contexts = [];
  for (const distance of [1, 4, 8]) {
    for (const cooldown of [false, true]) {
      for (const frozen of [false, true]) {
        const state = duel.createInitialNhDuelState(0x444d4d);
        const tick = 20 + contexts.length;
        contexts.push(duel.createNhDuelControllerContext(tick, {
          ...state.actors.self, tile: { x: 0, y: 0, plane: 0 },
          loadoutId: "noxious-halberd", weaponId: "noxious_halberd", previousWeaponId: "noxious_halberd",
          equipment, gearProfile,
          locks: { ...state.actors.self.locks, freezeUntilTick: frozen ? tick + 10 : -1 },
          attackTimer: cooldown
            ? { lastAttackTick: tick, weaponCooldownTicks: 4, additiveAttackDelayTicks: 0 }
            : state.actors.self.attackTimer
        }, {
          ...state.actors.opponent, observedInfoKnown: true, tile: { x: distance, y: 0, plane: 0 }
        }));
      }
    }
  }
  return contexts;
}

export function verifyPolicyContracts() {
  const policy = loadTsModule("src/bot/policy.ts");
  for (const [inputSize, featureSize, decoder] of [
    [90, 139, "nh-deployed-legacy"],
    [92, 141, "dmm-deployed-composite"]
  ]) {
    const artifact = {
      kind: "nh-neural-policy", version: 1,
      schema: { inputSize, featureSize, actionCount: 2, actionIds: [0, 385] },
      source: { step: 0, metrics: {} },
      normalization: { mean: Array(inputSize).fill(0), std: Array(inputSize).fill(1) },
      model: {
        layers: [{ activation: "silu", weight: [Array(inputSize).fill(0)], bias: [0] }],
        policy: { weight: [[0], [0]], bias: [0, 1] }
      }
    };
    const parsed = policy.parseNhNeuralPolicyJson(JSON.stringify(artifact), "arbitrary-model-label");
    assert.equal(parsed.decoder, decoder);
    assert.equal(policy.createNhPolicyController(parsed).policyDecoder, decoder);
  }
  const dmm = policy.parseNhNeuralPolicyJson(
    readFileSync(path.join(projectRoot, "fixtures/ai/nh-neural-policy-dmm-current.json"), "utf8"),
    "DMM"
  );
  assert.equal(dmm.decoder, "current-action-vector");
  const normal = policy.createNhPolicyController(dmm);
  const misleadingLabel = policy.createNhPolicyController({
    ...dmm, sourceLabel: "dmm-deployed-composite:nh-deployed-legacy"
  });
  assert.equal(normal.defencePrayerStrictModelChoice, true);
  assert.equal(misleadingLabel.policyDecoder, "current-action-vector");
  for (const context of createDmmRegressionContexts()) {
    assert.equal(JSON.stringify(normal.chooseAction(context)), JSON.stringify(misleadingLabel.chooseAction(context)));
    assert.equal(JSON.stringify(normal.getLastRankings()), JSON.stringify(misleadingLabel.getLastRankings()));
  }
}
