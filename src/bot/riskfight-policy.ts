import candidateJson from "../generated/webweaver-riskfight-candidate.json";
import type { RuntimeActorId } from "../render/runtimeScene";
import type { RuntimePlayerCombatState } from "../sim/runtimePlayerCombat";
import {
  encodeRiskFightObservation, riskFightFeatureNames, riskFightMainActions,
  riskFightPrayerActions, riskFightMovementActions, riskFightLegalMainActionMask,
  riskFightLegalMovementMask, riskFightMainActionAttacks, type RiskFightPolicyRuntimeInput
} from "../sim/nh/riskfight";
export {
  encodeRiskFightObservation, riskFightFeatureNames, riskFightMainActions,
  riskFightPrayerActions, riskFightMovementActions, riskFightLegalMainActionMask, riskFightLegalMovementMask
} from "../sim/nh/riskfight";
import type { NhPolicyAction, NhRiskFightMainAction, NhRiskFightMovementAction, NhRiskFightPrayerAction } from "../sim/nh/policy-bridge";
import type { NhDuelController, NhDuelControllerContext } from "../sim/nh/duel";

export const riskFightRuntimeProfile = "risk_webweaver_v2" as const;
export const riskFightCandidateLabel = "Risk Fight" as const;
export const riskFightCandidateCheckpointSha256 =
  "38253F5C8C9298C66986BD6D66CDC6342EF52620F4D4336E4CFC9CC0656A5954" as const;
export const riskFightCandidateParameterSha256 =
  "397924D85E60A5EDF9D5437C75531AA684619CA3021C34695C1710FE81F70FE0" as const;
export const riskFightCandidateSchemaSha256 =
  "B4FCA65553034249DB2CCE6C4E8A0970B419E60679407B4F84FEC0F91EB0157C" as const;
export const riskFightCandidateControllerId =
  `${riskFightRuntimeProfile}:${riskFightCandidateCheckpointSha256}` as const;

interface RiskFightTensorPayload {
  readonly shape: readonly number[];
  readonly values: readonly number[];
}

interface RiskFightBrowserPolicyPayload {
  readonly format: "riskfight-browser-policy-v2";
  readonly kind: "webweaver-riskfight-candidate";
  readonly schema_version: 2;
  readonly runtime_profile: typeof riskFightRuntimeProfile;
  readonly label: string;
  readonly promoted: false;
  readonly source_checkpoint: string;
  readonly source_checkpoint_sha256: string;
  readonly parameter_sha256: string;
  readonly schema_sha256: string;
  readonly feature_names: readonly string[];
  readonly action_heads: {
    readonly main: readonly string[];
    readonly prayer: readonly string[];
    readonly movement: readonly string[];
  };
  readonly network: {
    readonly hidden_size: 192;
    readonly layer_norm_epsilon: number;
    readonly activation: "silu";
    readonly tensors: Readonly<Record<string, RiskFightTensorPayload>>;
  };
}

export interface ParsedRiskFightBrowserPolicy {
  readonly identity: {
    readonly label: string;
    readonly runtimeProfile: typeof riskFightRuntimeProfile;
    readonly checkpointSha256: string;
    readonly parameterSha256: string;
    readonly schemaSha256: string;
    readonly sourceCheckpoint: string;
    readonly promoted: false;
  };
  readonly layerNormEpsilon: number;
  readonly tensors: Readonly<Record<string, { readonly shape: readonly number[]; readonly values: Float32Array }>>;
}

export type { RiskFightPolicyRuntimeInput } from "../sim/nh/riskfight";

export interface RiskFightPolicyDecision {
  readonly controllerId: typeof riskFightCandidateControllerId;
  readonly checkpointSha256: typeof riskFightCandidateCheckpointSha256;
  readonly parameterSha256: typeof riskFightCandidateParameterSha256;
  readonly schemaSha256: typeof riskFightCandidateSchemaSha256;
  readonly tick: number;
  readonly episodeTick: number;
  readonly observation: Float32Array;
  readonly legalMainActions: readonly boolean[];
  readonly mainLogits: Float32Array;
  readonly prayerLogits: Float32Array;
  readonly movementLogits: Float32Array;
  readonly value: number;
  readonly mainAction: NhRiskFightMainAction;
  readonly prayerAction: NhRiskFightPrayerAction;
  readonly movementAction: NhRiskFightMovementAction;
  readonly action: NhPolicyAction;
}

export interface RiskFightPolicyController extends NhDuelController {
  readonly runtimeProfile: typeof riskFightRuntimeProfile;
  readonly identity: ParsedRiskFightBrowserPolicy["identity"];
  readonly chooseRuntimeAction: (input: RiskFightPolicyRuntimeInput) => RiskFightPolicyDecision;
  readonly getLastDecision: () => RiskFightPolicyDecision | null;
  readonly resetEpisode: () => void;
}

interface RiskFightRewardLedgerState {
  readonly seenHitsplatIds: Set<string>;
  readonly shaping: Record<RuntimeActorId, number>;
  episodeStartTick: number | null;
  lastTick: number | null;
}

const expectedTensorShapes: Readonly<Record<string, readonly number[]>> = {
  "encoder.0.weight": [192, 53],
  "encoder.0.bias": [192],
  "encoder.1.weight": [192],
  "encoder.1.bias": [192],
  "encoder.3.weight": [192, 192],
  "encoder.3.bias": [192],
  "main_head.weight": [21, 192],
  "main_head.bias": [21],
  "prayer_head.weight": [3, 192],
  "prayer_head.bias": [3],
  "movement_head.weight": [3, 192],
  "movement_head.bias": [3],
  "value_head.weight": [1, 192],
  "value_head.bias": [1]
};

const riskFightShapingBudget = 32;

function assertArrayEqual(actual: readonly string[], expected: readonly string[], label: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} mismatch for ${riskFightRuntimeProfile}`);
  }
}

function tensorElementCount(shape: readonly number[]): number {
  return shape.reduce((total, value) => total * value, 1);
}

export function parseRiskFightBrowserPolicy(
  raw: unknown = candidateJson
): ParsedRiskFightBrowserPolicy {
  const payload = raw as Partial<RiskFightBrowserPolicyPayload>;
  if (
    payload.format !== "riskfight-browser-policy-v2" ||
    payload.kind !== "webweaver-riskfight-candidate" ||
    payload.schema_version !== 2 ||
    payload.runtime_profile !== riskFightRuntimeProfile ||
    payload.promoted !== false
  ) {
    throw new Error("invalid or promoted risk-fight browser candidate payload");
  }
  if (payload.source_checkpoint_sha256?.toUpperCase() !== riskFightCandidateCheckpointSha256) {
    throw new Error("risk-fight checkpoint SHA-256 does not match the retained candidate");
  }
  if (payload.parameter_sha256?.toUpperCase() !== riskFightCandidateParameterSha256) {
    throw new Error("risk-fight parameter SHA-256 does not match the CUDA training report");
  }
  if (payload.schema_sha256?.toUpperCase() !== riskFightCandidateSchemaSha256) {
    throw new Error("risk-fight schema SHA-256 does not match risk_webweaver_v2");
  }
  assertArrayEqual(payload.feature_names ?? [], riskFightFeatureNames, "feature order");
  assertArrayEqual(payload.action_heads?.main ?? [], riskFightMainActions, "main action order");
  assertArrayEqual(payload.action_heads?.prayer ?? [], riskFightPrayerActions, "prayer action order");
  assertArrayEqual(payload.action_heads?.movement ?? [], riskFightMovementActions, "movement action order");
  const network = payload.network;
  if (!network || network.hidden_size !== 192 || network.activation !== "silu") {
    throw new Error("risk-fight network architecture mismatch");
  }
  const tensors: Record<string, { readonly shape: readonly number[]; readonly values: Float32Array }> = {};
  for (const [name, expectedShape] of Object.entries(expectedTensorShapes)) {
    const tensor = network.tensors?.[name];
    if (
      !tensor ||
      tensor.shape.length !== expectedShape.length ||
      tensor.shape.some((value, index) => value !== expectedShape[index]) ||
      tensor.values.length !== tensorElementCount(expectedShape)
    ) {
      throw new Error(`risk-fight tensor ${name} shape/value mismatch`);
    }
    tensors[name] = {
      shape: Object.freeze([...tensor.shape]),
      values: Float32Array.from(tensor.values)
    };
  }
  return {
    identity: {
      label: payload.label ?? riskFightCandidateLabel,
      runtimeProfile: riskFightRuntimeProfile,
      checkpointSha256: riskFightCandidateCheckpointSha256,
      parameterSha256: riskFightCandidateParameterSha256,
      schemaSha256: riskFightCandidateSchemaSha256,
      sourceCheckpoint: payload.source_checkpoint ?? "",
      promoted: false
    },
    layerNormEpsilon: network.layer_norm_epsilon,
    tensors
  };
}

const embeddedRiskFightPolicy = parseRiskFightBrowserPolicy();

function f32(value: number): number {
  return Math.fround(value);
}

function dense(
  input: Float32Array,
  weight: Float32Array,
  bias: Float32Array,
  rows: number,
  columns: number
): Float32Array {
  const output = new Float32Array(rows);
  for (let row = 0; row < rows; row += 1) {
    let sum = bias[row];
    const offset = row * columns;
    for (let column = 0; column < columns; column += 1) {
      sum = f32(sum + f32(weight[offset + column] * input[column]));
    }
    output[row] = sum;
  }
  return output;
}

function silu(input: Float32Array): Float32Array {
  const output = new Float32Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const value = input[index];
    output[index] = f32(value / (1 + Math.exp(-value)));
  }
  return output;
}

function layerNorm(
  input: Float32Array,
  weight: Float32Array,
  bias: Float32Array,
  epsilon: number
): Float32Array {
  let mean = 0;
  for (const value of input) {
    mean = f32(mean + value);
  }
  mean = f32(mean / input.length);
  let variance = 0;
  for (const value of input) {
    const delta = f32(value - mean);
    variance = f32(variance + f32(delta * delta));
  }
  variance = f32(variance / input.length);
  const inverseStd = f32(1 / Math.sqrt(variance + epsilon));
  const output = new Float32Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    output[index] = f32(f32(f32(input[index] - mean) * inverseStd) * weight[index] + bias[index]);
  }
  return output;
}

export function runRiskFightBrowserPolicy(
  policy: ParsedRiskFightBrowserPolicy,
  observation: Float32Array
): {
  readonly mainLogits: Float32Array;
  readonly prayerLogits: Float32Array;
  readonly movementLogits: Float32Array;
  readonly value: number;
} {
  if (observation.length !== riskFightFeatureNames.length) {
    throw new Error(`risk-fight observation length ${observation.length} != ${riskFightFeatureNames.length}`);
  }
  const tensors = policy.tensors;
  const first = dense(
    observation,
    tensors["encoder.0.weight"].values,
    tensors["encoder.0.bias"].values,
    192,
    riskFightFeatureNames.length
  );
  const normalized = layerNorm(
    first,
    tensors["encoder.1.weight"].values,
    tensors["encoder.1.bias"].values,
    policy.layerNormEpsilon
  );
  const hidden = silu(
    dense(
      silu(normalized),
      tensors["encoder.3.weight"].values,
      tensors["encoder.3.bias"].values,
      192,
      192
    )
  );
  return {
    mainLogits: dense(hidden, tensors["main_head.weight"].values, tensors["main_head.bias"].values, riskFightMainActions.length, 192),
    prayerLogits: dense(hidden, tensors["prayer_head.weight"].values, tensors["prayer_head.bias"].values, 3, 192),
    movementLogits: dense(hidden, tensors["movement_head.weight"].values, tensors["movement_head.bias"].values, 3, 192),
    value: dense(hidden, tensors["value_head.weight"].values, tensors["value_head.bias"].values, 1, 192)[0]
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function bestIndex(values: Float32Array, legal?: readonly boolean[]): number {
  let best = -1;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < values.length; index += 1) {
    if (legal && !legal[index]) {
      continue;
    }
    if (best === -1 || values[index] > bestValue) {
      best = index;
      bestValue = values[index];
    }
  }
  if (best < 0) {
    throw new Error("risk-fight policy produced no selectable action");
  }
  return best;
}

function offenceStyleForMainAction(action: NhRiskFightMainAction): "ranged" | "melee" {
  return action === "WEBWEAVER_ATTACK" || action === "WEBWEAVER_SPEC" ? "ranged" : "melee";
}

function policyActionForDecision(
  mainAction: NhRiskFightMainAction,
  prayerAction: NhRiskFightPrayerAction,
  movementAction: NhRiskFightMovementAction
): NhPolicyAction {
  const attackAction = riskFightMainActionAttacks(mainAction);
  return {
    offenceStyle: offenceStyleForMainAction(mainAction),
    defencePrayer: prayerAction === "PROTECT_MELEE" ? "protect_from_melee" : "protect_from_missiles",
    movementIntent: movementAction === "STEP_CLOSER" ? "pressure" : movementAction === "STEP_AWAY" ? "step_out" : "none",
    supplyIntent: "none",
    specIntent: mainAction === "GMAUL_SPEC" ? "spec_granite_maul" : "none",
    extendedSupplyAction: false,
    attackIntent: attackAction ? "attack" : "hold",
    equipmentIntent: "weapon_only",
    riskFightMainAction: mainAction,
    riskFightPrayerAction: prayerAction,
    riskFightMovementAction: movementAction
  };
}

function createRewardLedgerState(): RiskFightRewardLedgerState {
  return {
    seenHitsplatIds: new Set(),
    shaping: { "local-player": 0, opponent: 0 },
    episodeStartTick: null,
    lastTick: null
  };
}

function resetRewardLedger(state: RiskFightRewardLedgerState, episodeStartTick: number): void {
  state.seenHitsplatIds.clear();
  state.shaping["local-player"] = 0;
  state.shaping.opponent = 0;
  state.episodeStartTick = episodeStartTick;
  state.lastTick = null;
}

function updateRewardLedger(
  ledger: RiskFightRewardLedgerState,
  state: RuntimePlayerCombatState,
  episodeStartTick: number
): void {
  if (
    ledger.episodeStartTick !== episodeStartTick ||
    (ledger.lastTick !== null && state.tick < ledger.lastTick)
  ) {
    resetRewardLedger(ledger, episodeStartTick);
  }
  for (const event of state.events) {
    if (
      event.kind !== "hitsplat" ||
      event.tick < episodeStartTick ||
      event.damage <= 0 ||
      ledger.seenHitsplatIds.has(event.id)
    ) {
      continue;
    }
    ledger.seenHitsplatIds.add(event.id);
    const reward = event.damage * 0.025;
    ledger.shaping[event.attackerId] = clamp(
      ledger.shaping[event.attackerId] + reward,
      -riskFightShapingBudget,
      riskFightShapingBudget
    );
    ledger.shaping[event.targetActorId] = clamp(
      ledger.shaping[event.targetActorId] - reward,
      -riskFightShapingBudget,
      riskFightShapingBudget
    );
  }
  ledger.lastTick = state.tick;
}

export function createRiskFightPolicyController(
  policy: ParsedRiskFightBrowserPolicy = embeddedRiskFightPolicy
): RiskFightPolicyController {
  const rewardLedger = createRewardLedgerState();
  let lastDecision: RiskFightPolicyDecision | null = null;
  return {
    id: riskFightCandidateControllerId,
    runtimeProfile: riskFightRuntimeProfile,
    identity: policy.identity,
    chooseAction(_context: NhDuelControllerContext): NhPolicyAction {
      throw new Error("risk_webweaver_v2 requires the profile-specific runtime adapter");
    },
    chooseRuntimeAction(input) {
      updateRewardLedger(rewardLedger, input.state, input.episodeStartTick);
      const observation = encodeRiskFightObservation({
        ...input,
        shaping: rewardLedger.shaping
      });
      const logits = runRiskFightBrowserPolicy(policy, observation);
      const legalMainActions = riskFightLegalMainActionMask(input);
      const mainAction = riskFightMainActions[bestIndex(logits.mainLogits, legalMainActions)];
      const prayerAction = "NONE" as const;
      const movementAction = riskFightMovementActions[bestIndex(logits.movementLogits, riskFightLegalMovementMask(input))];
      const episodeTick = Math.max(0, input.state.tick - input.episodeStartTick);
      lastDecision = {
        controllerId: riskFightCandidateControllerId,
        checkpointSha256: riskFightCandidateCheckpointSha256,
        parameterSha256: riskFightCandidateParameterSha256,
        schemaSha256: riskFightCandidateSchemaSha256,
        tick: input.state.tick,
        episodeTick,
        observation,
        legalMainActions: Object.freeze([...legalMainActions]),
        mainLogits: logits.mainLogits,
        prayerLogits: logits.prayerLogits,
        movementLogits: logits.movementLogits,
        value: logits.value,
        mainAction,
        prayerAction,
        movementAction,
        action: policyActionForDecision(mainAction, prayerAction, movementAction)
      };
      return lastDecision;
    },
    getLastDecision() {
      return lastDecision;
    },
    resetEpisode() {
      resetRewardLedger(rewardLedger, 0);
      lastDecision = null;
    }
  };
}

export function isRiskFightPolicyController(controller: NhDuelController): controller is RiskFightPolicyController {
  return (controller as Partial<RiskFightPolicyController>).runtimeProfile === riskFightRuntimeProfile &&
    typeof (controller as Partial<RiskFightPolicyController>).chooseRuntimeAction === "function";
}
