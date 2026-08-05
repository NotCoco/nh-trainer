export interface NhConditionedDenseLayer {
  readonly weight: readonly Float32Array[];
  readonly bias: Float32Array;
}

interface GroupResidual {
  readonly inputIndices: Int32Array;
  readonly attackActionRows: Int32Array;
  readonly offTickActionRows: Int32Array;
  readonly weight: readonly Float32Array[];
  readonly bias: Float32Array;
}

interface DefencePrayerHead {
  readonly actionRows: Int32Array;
  readonly baseInputSize: number;
  readonly priorStateHistoryLags: number;
  readonly priorStateStride: number;
  readonly hidden: NhConditionedDenseLayer;
  readonly output: NhConditionedDenseLayer;
}

interface FrozenUnreachablePrayerConditioner {
  readonly actionRows: Int32Array;
  readonly opponentFrozenInputIndex: number;
  readonly selfFreezeTicksInputIndex: number;
  readonly opponentFreezeTicksInputIndex: number;
  readonly targetRelDxInputIndex: number;
  readonly targetRelDyInputIndex: number;
  readonly targetPresentInputIndex: number;
  readonly freezeTicksNormalizer: number;
  readonly relativePositionNormalizer: number;
  readonly minRemainingFreezeTicksExclusive: number;
  readonly maxSwitchableMeleeStandingRange: number;
  readonly maxDefenderMovementDecisionsBeforeProtectedRoll: number;
  readonly movementSubstepsPerDecision: number;
  readonly strength: number;
}

interface HiddenGroupResidual {
  readonly actionRows: Int32Array;
  readonly layer: NhConditionedDenseLayer;
}

interface SafeWindowPrayerResidual extends HiddenGroupResidual {
  readonly shiftedRows: number;
}

interface VlsVoidwakerHead {
  readonly actionRows: Int32Array;
  readonly specEnergyInputIndex: number;
  readonly bothLegalMinSpecEnergy: number;
  readonly output: NhConditionedDenseLayer;
}

interface VlsSetupAdapter {
  readonly actionRow: number;
  readonly version: number;
  readonly attackDelayInputIndex: number;
  readonly requiredRawAttackDelay: number;
  readonly specControlInputIndex: number;
  readonly requiredRawSpecControl: number;
  readonly specEnergyInputIndex: number;
  readonly minRawSpecEnergy: number;
  readonly targetPresentInputIndex: number;
  readonly selfFrozenInputIndex: number;
  readonly targetRelDxInputIndex: number;
  readonly targetRelDyInputIndex: number;
  readonly meleeReachInputIndex: number;
  readonly rawTolerance: number;
  readonly output: NhConditionedDenseLayer;
}

interface VlsFollowthroughAdapter {
  readonly actionRows: Int32Array;
  readonly attackDelayInputIndex: number;
  readonly requiredRawAttackDelay: number;
  readonly specControlInputIndex: number;
  readonly requiredRawSpecControl: number;
  readonly specEnergyInputIndex: number;
  readonly minRawSpecEnergy: number;
  readonly pendingInputIndex: number;
  readonly requiredRawPending: number;
  readonly selfWeaponSinInputIndex: number;
  readonly selfWeaponCosInputIndex: number;
  readonly requiredWeaponSin: number;
  readonly requiredWeaponCos: number;
  readonly rawTolerance: number;
  readonly output: NhConditionedDenseLayer;
}

interface VlsProtectedMeleeConditioner {
  readonly opponentHpInputIndex: number;
  readonly opponentProtectMeleeInputIndex: number;
  readonly specEnergyInputIndex: number;
  readonly koHpMax: number;
  readonly fullStrengthHpMin: number;
  readonly followMaxSpecEnergyExclusive: number;
  readonly headActionRows: Int32Array;
  readonly headPenalizedActionRows: Int32Array;
  readonly followActionRows: Int32Array;
  readonly followPenalizedActionRows: Int32Array;
  readonly strength: Float32Array;
}

interface SafeMagicLegsConditioner {
  readonly ageInputIndex: number;
  readonly maxAgeExclusive: number;
  readonly actionRow: number;
  readonly strength: number;
}

interface MagicFullOffenceConditioner {
  readonly actionRows: Int32Array;
  readonly actionSigns: Int32Array;
  readonly maxStrength: readonly Float32Array[];
  readonly strength: readonly Float32Array[];
}

export interface NhConditionedPolicyV10 {
  readonly offensivePrayer: GroupResidual;
  readonly defencePrayer: DefencePrayerHead;
  readonly frozenUnreachablePrayer: FrozenUnreachablePrayerConditioner;
  readonly freezeBoundaryPrayer: HiddenGroupResidual;
  readonly safeWindowPrayer: SafeWindowPrayerResidual;
  readonly vlsVoidwaker: VlsVoidwakerHead;
  readonly vlsSetup: VlsSetupAdapter;
  readonly vlsFollowthrough: VlsFollowthroughAdapter;
  readonly vlsProtectedMelee: VlsProtectedMeleeConditioner;
  readonly safeMagicLegs: SafeMagicLegsConditioner;
  readonly magicFullOffence: MagicFullOffenceConditioner;
}

export interface NhConditionedPolicyRuntimeState {
  readonly priorNormalizedInputs: Float32Array[];
  lastCommittedTick: number | null;
}

export function createNhConditionedPolicyRuntimeState(): NhConditionedPolicyRuntimeState {
  return { priorNormalizedInputs: [], lastCommittedTick: null };
}

export function resetNhConditionedPolicyRuntimeState(state: NhConditionedPolicyRuntimeState): void {
  state.priorNormalizedInputs.length = 0;
  state.lastCommittedTick = null;
}

export function commitNhConditionedPolicyInput(
  state: NhConditionedPolicyRuntimeState,
  normalizedInput: Float32Array,
  tick: number,
  historyLags: number
): void {
  if (state.lastCommittedTick === tick) {
    return;
  }
  state.lastCommittedTick = tick;
  state.priorNormalizedInputs.unshift(new Float32Array(normalizedInput));
  state.priorNormalizedInputs.length = Math.min(historyLags, state.priorNormalizedInputs.length);
}

export function parseNhConditionedPolicyV10(
  rootValue: unknown,
  policyActionIds: Int32Array,
  inputSize: number,
  encodedSize: number,
  label: string
): NhConditionedPolicyV10 {
  const root = objectValue(rootValue, label);
  if (inputSize !== 114) {
    throw new Error(`${label} conditioned v10 input size must be 114.`);
  }

  const offensive = exactObject(root.offensivePrayerConditioner, "dmm-offensive-prayer-style-residual", 1, `${label}.offensivePrayerConditioner`);
  const defence = exactObject(root.defencePrayerHead, "dmm-defence-prayer-group-replacement", 3, `${label}.defencePrayerHead`);
  const frozen = exactObject(root.frozenUnreachablePrayerConditioner, "dmm-frozen-unreachable-defence-prayer-residual", 2, `${label}.frozenUnreachablePrayerConditioner`);
  const boundary = exactObject(root.freezeBoundaryPrayerResidual, "dmm-freeze-boundary-defence-prayer-residual", 2, `${label}.freezeBoundaryPrayerResidual`);
  const safeWindow = exactObject(root.safeWindowPrayerResidual, "dmm-safe-window-defence-channel-residual", 2, `${label}.safeWindowPrayerResidual`);
  const vlsHead = exactObject(root.vlsVoidwakerHead, "dmm-vls-voidwaker-group-replacement", 1, `${label}.vlsVoidwakerHead`);
  const vlsSetup = exactObject(root.vlsSetupAdapter, "dmm-vls-setup-residual", 3, `${label}.vlsSetupAdapter`);
  const vlsFollow = exactObject(root.vlsFollowthroughAdapter, "dmm-vls-followthrough-residual", 1, `${label}.vlsFollowthroughAdapter`);
  const vlsProtected = exactObject(root.vlsProtectedMeleeConditioner, "dmm-vls-protected-melee-context-residual", 2, `${label}.vlsProtectedMeleeConditioner`);
  const safeLegs = exactObject(root.safeMagicLegsConditioner, "dmm-safe-magic-legs-residual", 1, `${label}.safeMagicLegsConditioner`);
  const fullOffence = exactObject(root.magicFullOffenceConditioner, "dmm-magic-full-offence-residual", 3, `${label}.magicFullOffenceConditioner`);

  const defenceRows = mappedRows(defence, policyActionIds, 3, `${label}.defencePrayerHead`);
  const baseInputSize = exactInteger(defence.baseInputSize, `${label}.defencePrayerHead.baseInputSize`);
  const historyContextSize = exactInteger(defence.historyContextSize, `${label}.defencePrayerHead.historyContextSize`);
  const priorStateHistoryLags = exactInteger(defence.priorStateHistoryLags, `${label}.defencePrayerHead.priorStateHistoryLags`);
  const priorStateStride = exactInteger(defence.priorStateStride, `${label}.defencePrayerHead.priorStateStride`);
  if (baseInputSize !== inputSize || historyContextSize !== 1855 || priorStateHistoryLags !== 16 || priorStateStride !== 115) {
    throw new Error(`${label}.defencePrayerHead does not match the current 16-tick history contract.`);
  }
  const defenceHidden = denseLayer(defence.hidden, 32, inputSize + historyContextSize, `${label}.defencePrayerHead.hidden`);

  const frozenRows = mappedRows(frozen, policyActionIds, 3, `${label}.frozenUnreachablePrayerConditioner`);
  requireSameRows(frozenRows, defenceRows, `${label}.frozenUnreachablePrayerConditioner`);
  const boundaryRows = mappedRows(boundary, policyActionIds, 3, `${label}.freezeBoundaryPrayerResidual`);
  requireSameRows(boundaryRows, defenceRows, `${label}.freezeBoundaryPrayerResidual`);
  const safeWindowRows = mappedRows(safeWindow, policyActionIds, 5, `${label}.safeWindowPrayerResidual`);

  return {
    offensivePrayer: {
      inputIndices: integerVector(offensive.inputIndices, 3, `${label}.offensivePrayerConditioner.inputIndices`),
      attackActionRows: integerVector(offensive.attackActionRows, 3, `${label}.offensivePrayerConditioner.attackActionRows`),
      offTickActionRows: integerVector(offensive.offTickActionRows, 3, `${label}.offensivePrayerConditioner.offTickActionRows`),
      weight: numberMatrix(offensive.weight, 3, 3, `${label}.offensivePrayerConditioner.weight`),
      bias: numberVector(offensive.bias, 3, `${label}.offensivePrayerConditioner.bias`)
    },
    defencePrayer: {
      actionRows: defenceRows,
      baseInputSize,
      priorStateHistoryLags,
      priorStateStride,
      hidden: defenceHidden,
      output: denseLayer(defence.output, 3, 32, `${label}.defencePrayerHead.output`)
    },
    frozenUnreachablePrayer: {
      actionRows: frozenRows,
      opponentFrozenInputIndex: exactInteger(frozen.opponentFrozenInputIndex, `${label}.frozenUnreachablePrayerConditioner.opponentFrozenInputIndex`),
      selfFreezeTicksInputIndex: exactInteger(frozen.selfFreezeTicksInputIndex, `${label}.frozenUnreachablePrayerConditioner.selfFreezeTicksInputIndex`),
      opponentFreezeTicksInputIndex: exactInteger(frozen.opponentFreezeTicksInputIndex, `${label}.frozenUnreachablePrayerConditioner.opponentFreezeTicksInputIndex`),
      targetRelDxInputIndex: exactInteger(frozen.targetRelDxInputIndex, `${label}.frozenUnreachablePrayerConditioner.targetRelDxInputIndex`),
      targetRelDyInputIndex: exactInteger(frozen.targetRelDyInputIndex, `${label}.frozenUnreachablePrayerConditioner.targetRelDyInputIndex`),
      targetPresentInputIndex: exactInteger(frozen.targetPresentInputIndex, `${label}.frozenUnreachablePrayerConditioner.targetPresentInputIndex`),
      freezeTicksNormalizer: finiteNumber(frozen.freezeTicksNormalizer, `${label}.frozenUnreachablePrayerConditioner.freezeTicksNormalizer`),
      relativePositionNormalizer: finiteNumber(frozen.relativePositionNormalizer, `${label}.frozenUnreachablePrayerConditioner.relativePositionNormalizer`),
      minRemainingFreezeTicksExclusive: finiteNumber(frozen.minRemainingFreezeTicksExclusive, `${label}.frozenUnreachablePrayerConditioner.minRemainingFreezeTicksExclusive`),
      maxSwitchableMeleeStandingRange: exactInteger(frozen.maxSwitchableMeleeStandingRange, `${label}.frozenUnreachablePrayerConditioner.maxSwitchableMeleeStandingRange`),
      maxDefenderMovementDecisionsBeforeProtectedRoll: exactInteger(frozen.maxDefenderMovementDecisionsBeforeProtectedRoll, `${label}.frozenUnreachablePrayerConditioner.maxDefenderMovementDecisionsBeforeProtectedRoll`),
      movementSubstepsPerDecision: exactInteger(frozen.movementSubstepsPerDecision, `${label}.frozenUnreachablePrayerConditioner.movementSubstepsPerDecision`),
      strength: numberVector(frozen.strength, 1, `${label}.frozenUnreachablePrayerConditioner.strength`)[0]
    },
    freezeBoundaryPrayer: {
      actionRows: boundaryRows,
      layer: denseFromWeightBias(boundary, 3, 32, `${label}.freezeBoundaryPrayerResidual`)
    },
    safeWindowPrayer: {
      actionRows: safeWindowRows,
      shiftedRows: 2,
      layer: denseFromWeightBias(safeWindow, 1, 32, `${label}.safeWindowPrayerResidual`)
    },
    vlsVoidwaker: {
      actionRows: mappedRows(vlsHead, policyActionIds, 2, `${label}.vlsVoidwakerHead`),
      specEnergyInputIndex: exactInteger(vlsHead.specEnergyInputIndex, `${label}.vlsVoidwakerHead.specEnergyInputIndex`),
      bothLegalMinSpecEnergy: finiteNumber(vlsHead.bothLegalMinSpecEnergy, `${label}.vlsVoidwakerHead.bothLegalMinSpecEnergy`),
      output: denseLayer(vlsHead.output, 2, encodedSize, `${label}.vlsVoidwakerHead.output`)
    },
    vlsSetup: {
      actionRow: mappedSingleRow(vlsSetup, policyActionIds, `${label}.vlsSetupAdapter`),
      version: 3,
      attackDelayInputIndex: exactInteger(vlsSetup.attackDelayInputIndex, `${label}.vlsSetupAdapter.attackDelayInputIndex`),
      requiredRawAttackDelay: finiteNumber(vlsSetup.requiredRawAttackDelay, `${label}.vlsSetupAdapter.requiredRawAttackDelay`),
      specControlInputIndex: exactInteger(vlsSetup.specControlInputIndex, `${label}.vlsSetupAdapter.specControlInputIndex`),
      requiredRawSpecControl: finiteNumber(vlsSetup.requiredRawSpecControl, `${label}.vlsSetupAdapter.requiredRawSpecControl`),
      specEnergyInputIndex: exactInteger(vlsSetup.specEnergyInputIndex, `${label}.vlsSetupAdapter.specEnergyInputIndex`),
      minRawSpecEnergy: finiteNumber(vlsSetup.minRawSpecEnergy, `${label}.vlsSetupAdapter.minRawSpecEnergy`),
      targetPresentInputIndex: exactInteger(vlsSetup.targetPresentInputIndex, `${label}.vlsSetupAdapter.targetPresentInputIndex`),
      selfFrozenInputIndex: exactInteger(vlsSetup.selfFrozenInputIndex, `${label}.vlsSetupAdapter.selfFrozenInputIndex`),
      targetRelDxInputIndex: exactInteger(vlsSetup.targetRelDxInputIndex, `${label}.vlsSetupAdapter.targetRelDxInputIndex`),
      targetRelDyInputIndex: exactInteger(vlsSetup.targetRelDyInputIndex, `${label}.vlsSetupAdapter.targetRelDyInputIndex`),
      meleeReachInputIndex: exactInteger(vlsSetup.meleeReachInputIndex, `${label}.vlsSetupAdapter.meleeReachInputIndex`),
      rawTolerance: finiteNumber(vlsSetup.rawTolerance, `${label}.vlsSetupAdapter.rawTolerance`),
      output: denseLayer(vlsSetup.output, 1, encodedSize, `${label}.vlsSetupAdapter.output`)
    },
    vlsFollowthrough: parseVlsFollowthrough(vlsFollow, policyActionIds, encodedSize, `${label}.vlsFollowthroughAdapter`),
    vlsProtectedMelee: {
      opponentHpInputIndex: exactInteger(vlsProtected.opponentHpInputIndex, `${label}.vlsProtectedMeleeConditioner.opponentHpInputIndex`),
      opponentProtectMeleeInputIndex: exactInteger(vlsProtected.opponentProtectMeleeInputIndex, `${label}.vlsProtectedMeleeConditioner.opponentProtectMeleeInputIndex`),
      specEnergyInputIndex: exactInteger(vlsProtected.specEnergyInputIndex, `${label}.vlsProtectedMeleeConditioner.specEnergyInputIndex`),
      koHpMax: finiteNumber(vlsProtected.koHpMax, `${label}.vlsProtectedMeleeConditioner.koHpMax`),
      fullStrengthHpMin: finiteNumber(vlsProtected.fullStrengthHpMin, `${label}.vlsProtectedMeleeConditioner.fullStrengthHpMin`),
      followMaxSpecEnergyExclusive: finiteNumber(vlsProtected.followMaxSpecEnergyExclusive, `${label}.vlsProtectedMeleeConditioner.followMaxSpecEnergyExclusive`),
      headActionRows: integerVector(vlsProtected.headActionRows, 2, `${label}.vlsProtectedMeleeConditioner.headActionRows`),
      headPenalizedActionRows: new Int32Array([exactInteger(vlsProtected.headPenalizedActionRow, `${label}.vlsProtectedMeleeConditioner.headPenalizedActionRow`)]),
      followActionRows: integerVector(vlsProtected.followActionRows, 3, `${label}.vlsProtectedMeleeConditioner.followActionRows`),
      followPenalizedActionRows: integerVector(vlsProtected.followPenalizedActionRows, 2, `${label}.vlsProtectedMeleeConditioner.followPenalizedActionRows`),
      strength: numberVector(vlsProtected.strength, 2, `${label}.vlsProtectedMeleeConditioner.strength`)
    },
    safeMagicLegs: {
      ageInputIndex: exactInteger(safeLegs.ageInputIndex, `${label}.safeMagicLegsConditioner.ageInputIndex`),
      maxAgeExclusive: finiteNumber(safeLegs.maxAgeExclusive, `${label}.safeMagicLegsConditioner.maxAgeExclusive`),
      actionRow: mappedSingleRow(safeLegs, policyActionIds, `${label}.safeMagicLegsConditioner`),
      strength: numberVector(safeLegs.strength, 1, `${label}.safeMagicLegsConditioner.strength`)[0]
    },
    magicFullOffence: {
      actionRows: mappedRows(fullOffence, policyActionIds, 5, `${label}.magicFullOffenceConditioner`),
      actionSigns: integerVector(fullOffence.actionSigns, 5, `${label}.magicFullOffenceConditioner.actionSigns`),
      maxStrength: numberMatrix(fullOffence.maxStrength, 2, 5, `${label}.magicFullOffenceConditioner.maxStrength`),
      strength: numberMatrix(fullOffence.strength, 2, 5, `${label}.magicFullOffenceConditioner.strength`)
    }
  };
}

function parseVlsFollowthrough(
  raw: Record<string, unknown>,
  policyActionIds: Int32Array,
  encodedSize: number,
  label: string
): VlsFollowthroughAdapter {
  const requiredWeaponId = exactInteger(raw.requiredWeaponId, `${label}.requiredWeaponId`);
  const frequency = finiteNumber(raw.weaponFrequency, `${label}.weaponFrequency`);
  return {
    actionRows: mappedRows(raw, policyActionIds, 2, label),
    attackDelayInputIndex: exactInteger(raw.attackDelayInputIndex, `${label}.attackDelayInputIndex`),
    requiredRawAttackDelay: finiteNumber(raw.requiredRawAttackDelay, `${label}.requiredRawAttackDelay`),
    specControlInputIndex: exactInteger(raw.specControlInputIndex, `${label}.specControlInputIndex`),
    requiredRawSpecControl: finiteNumber(raw.requiredRawSpecControl, `${label}.requiredRawSpecControl`),
    specEnergyInputIndex: exactInteger(raw.specEnergyInputIndex, `${label}.specEnergyInputIndex`),
    minRawSpecEnergy: finiteNumber(raw.minRawSpecEnergy, `${label}.minRawSpecEnergy`),
    pendingInputIndex: exactInteger(raw.pendingInputIndex, `${label}.pendingInputIndex`),
    requiredRawPending: finiteNumber(raw.requiredRawPending, `${label}.requiredRawPending`),
    selfWeaponSinInputIndex: exactInteger(raw.selfWeaponSinInputIndex, `${label}.selfWeaponSinInputIndex`),
    selfWeaponCosInputIndex: exactInteger(raw.selfWeaponCosInputIndex, `${label}.selfWeaponCosInputIndex`),
    requiredWeaponSin: Math.sin(requiredWeaponId * frequency),
    requiredWeaponCos: Math.cos(requiredWeaponId * frequency),
    rawTolerance: finiteNumber(raw.rawTolerance, `${label}.rawTolerance`),
    output: denseLayer(raw.output, 1, encodedSize, `${label}.output`)
  };
}

export function applyNhConditionedPolicyV10Scores(args: {
  readonly conditioned: NhConditionedPolicyV10;
  readonly baseScores: readonly number[];
  readonly normalizedInput: Float32Array;
  readonly encoded: Float32Array;
  readonly inputMean: Float32Array;
  readonly inputStd: Float32Array;
  readonly attackHistoryCodes: readonly number[];
  readonly ownPrayerHistoryCodes: readonly number[];
  readonly priorNormalizedInputs: readonly Float32Array[];
  readonly legalModelActions: ReadonlySet<number>;
}): number[] {
  const { conditioned, normalizedInput, encoded, inputMean, inputStd } = args;
  const scores = Array.from(args.baseScores);
  applyOffensivePrayer(conditioned.offensivePrayer, scores, normalizedInput, inputMean, inputStd);

  const headInput = new Float32Array(conditioned.defencePrayer.hidden.weight[0].length);
  headInput.set(normalizedInput, 0);
  let offset = conditioned.defencePrayer.baseInputSize;
  offset = writeOneHotHistory(headInput, offset, args.attackHistoryCodes, 3);
  offset = writeOneHotHistory(headInput, offset, args.ownPrayerHistoryCodes, 2);
  for (let lag = 0; lag < conditioned.defencePrayer.priorStateHistoryLags; lag += 1) {
    const prior = args.priorNormalizedInputs[lag];
    if (prior) {
      headInput.set(prior, offset);
      headInput[offset + conditioned.defencePrayer.baseInputSize] = 1;
    }
    offset += conditioned.defencePrayer.priorStateStride;
  }
  const headHidden = runDenseSilu(conditioned.defencePrayer.hidden, headInput);
  replaceGroupScores(scores, conditioned.defencePrayer.actionRows, runDenseLinear(conditioned.defencePrayer.output, headHidden));

  const frozenActive = frozenUnreachableActive(conditioned.frozenUnreachablePrayer, normalizedInput, inputMean, inputStd);
  if (frozenActive && conditioned.frozenUnreachablePrayer.strength !== 0) {
    applyPenalizedGroup(scores, conditioned.frozenUnreachablePrayer.actionRows, new Int32Array([conditioned.frozenUnreachablePrayer.actionRows[2]]), -conditioned.frozenUnreachablePrayer.strength);
  }

  if (freezeBoundaryActive(conditioned, normalizedInput, inputMean, inputStd, headInput)) {
    applyResidualGroup(scores, conditioned.freezeBoundaryPrayer.actionRows, runDenseLinear(conditioned.freezeBoundaryPrayer.layer, headHidden));
  }
  if (frozenActive) {
    const lift = denseRow(conditioned.safeWindowPrayer.layer, 0, headHidden);
    applyLiftedGroup(scores, conditioned.safeWindowPrayer.actionRows, conditioned.safeWindowPrayer.shiftedRows, lift);
  }

  const vlsHeadActive = rawInput(normalizedInput, inputMean, inputStd, conditioned.vlsVoidwaker.specEnergyInputIndex) >= conditioned.vlsVoidwaker.bothLegalMinSpecEnergy &&
    Array.from(conditioned.vlsVoidwaker.actionRows).every((row) => args.legalModelActions.has(row));
  if (vlsHeadActive) {
    replaceGroupScores(scores, conditioned.vlsVoidwaker.actionRows, runDenseLinear(conditioned.vlsVoidwaker.output, encoded));
  }

  if (vlsSetupActive(conditioned.vlsSetup, normalizedInput, inputMean, inputStd)) {
    scores[conditioned.vlsSetup.actionRow] += denseRow(conditioned.vlsSetup.output, 0, encoded);
  }
  const followActive = vlsFollowthroughActive(conditioned.vlsFollowthrough, normalizedInput, inputMean, inputStd);
  if (followActive) {
    const residual = denseRow(conditioned.vlsFollowthrough.output, 0, encoded);
    for (const row of conditioned.vlsFollowthrough.actionRows) {
      scores[row] += residual;
    }
  }
  applyVlsProtectedMelee(conditioned.vlsProtectedMelee, scores, normalizedInput, inputMean, inputStd, vlsHeadActive, followActive);
  return scores;
}

export function conditionedGearScore(
  conditioned: NhConditionedPolicyV10,
  modelAction: number,
  combatStyleIndex: number,
  rawInputValues: readonly number[],
  opponentOrdinaryCooldownRemaining: number,
  baseScore: number
): number {
  let score = baseScore;
  const context = opponentOrdinaryCooldownRemaining > 0 ? 0 : 1;
  const full = conditioned.magicFullOffence;
  if (context === 1 || combatStyleIndex === 3) {
    if (modelAction === full.actionRows[1]) {
      return Math.min(score, -full.maxStrength[0][1]);
    }
    if (modelAction === full.actionRows[2]) {
      return Math.max(score, full.maxStrength[0][2]);
    }
  }
  if (combatStyleIndex !== 1) {
    return score;
  }
  const safeLegs = conditioned.safeMagicLegs;
  if (modelAction === safeLegs.actionRow && Number.isFinite(rawInputValues[safeLegs.ageInputIndex]) && rawInputValues[safeLegs.ageInputIndex] < safeLegs.maxAgeExclusive) {
    score += safeLegs.strength;
  }
  for (let index = 0; index < full.actionRows.length; index += 1) {
    if (full.actionRows[index] === modelAction) {
      score += full.strength[context][index] * full.actionSigns[index];
      break;
    }
  }
  return score;
}

function applyOffensivePrayer(
  conditioner: GroupResidual,
  scores: number[],
  normalized: Float32Array,
  mean: Float32Array,
  std: Float32Array
): void {
  const noPrayer = Array.from(conditioner.inputIndices).every((index) => Math.abs(rawInput(normalized, mean, std, index)) <= 1e-6);
  if (noPrayer) {
    return;
  }
  const residuals = Array.from(conditioner.bias, (bias, style) => {
    let value = bias;
    for (let feature = 0; feature < conditioner.inputIndices.length; feature += 1) {
      value += conditioner.weight[style][feature] * normalized[conditioner.inputIndices[feature]];
    }
    return value;
  });
  applyResidualGroup(scores, conditioner.attackActionRows, residuals);
  applyResidualGroup(scores, conditioner.offTickActionRows, residuals);
}

function frozenUnreachableActive(
  conditioner: FrozenUnreachablePrayerConditioner,
  normalized: Float32Array,
  mean: Float32Array,
  std: Float32Array
): boolean {
  const opponentFrozen = rawInput(normalized, mean, std, conditioner.opponentFrozenInputIndex);
  const remaining = Math.floor(rawInput(normalized, mean, std, conditioner.opponentFreezeTicksInputIndex) * conditioner.freezeTicksNormalizer + 0.5);
  const targetPresent = rawInput(normalized, mean, std, conditioner.targetPresentInputIndex);
  if (opponentFrozen <= 0.5 || remaining <= conditioner.minRemainingFreezeTicksExclusive || targetPresent <= 0.5) {
    return false;
  }
  const selfFreezeTicks = Math.round(rawInput(normalized, mean, std, conditioner.selfFreezeTicksInputIndex) * conditioner.freezeTicksNormalizer);
  const dx = Math.floor(Math.abs(rawInput(normalized, mean, std, conditioner.targetRelDxInputIndex)) * conditioner.relativePositionNormalizer + 0.5);
  const dy = Math.floor(Math.abs(rawInput(normalized, mean, std, conditioner.targetRelDyInputIndex)) * conditioner.relativePositionNormalizer + 0.5);
  const movable = selfFreezeTicks <= 0
    ? conditioner.maxDefenderMovementDecisionsBeforeProtectedRoll
    : selfFreezeTicks >= conditioner.maxDefenderMovementDecisionsBeforeProtectedRoll
      ? 0
      : conditioner.maxDefenderMovementDecisionsBeforeProtectedRoll - selfFreezeTicks;
  const unreachable = conditioner.maxSwitchableMeleeStandingRange + conditioner.movementSubstepsPerDecision * movable;
  return dx > unreachable || dy > unreachable || (dx === 0 && dy === 0 && selfFreezeTicks >= conditioner.maxDefenderMovementDecisionsBeforeProtectedRoll);
}

function freezeBoundaryActive(
  conditioned: NhConditionedPolicyV10,
  normalized: Float32Array,
  mean: Float32Array,
  std: Float32Array,
  headInput: Float32Array
): boolean {
  const frozen = conditioned.frozenUnreachablePrayer;
  if (rawInput(normalized, mean, std, frozen.targetPresentInputIndex) <= 0.5) {
    return false;
  }
  const opponentFrozen = rawInput(normalized, mean, std, frozen.opponentFrozenInputIndex);
  const remaining = Math.floor(rawInput(normalized, mean, std, frozen.opponentFreezeTicksInputIndex) * frozen.freezeTicksNormalizer + 0.5);
  if (opponentFrozen > 0.5 && remaining === 1) {
    return true;
  }
  if (rawInput(normalized, mean, std, 72) <= 0.5) {
    return false;
  }
  let offset = conditioned.defencePrayer.baseInputSize + 15;
  for (let lag = 0; lag < conditioned.defencePrayer.priorStateHistoryLags; lag += 1) {
    const valid = headInput[offset + conditioned.defencePrayer.baseInputSize];
    if (valid > 0.5) {
      const priorFrozen = headInput[offset + frozen.opponentFrozenInputIndex] * normalizedDivisor(std[frozen.opponentFrozenInputIndex]) + mean[frozen.opponentFrozenInputIndex];
      const priorReach = headInput[offset + 72] * normalizedDivisor(std[72]) + mean[72];
      if (priorFrozen > 0.5 && priorReach < 0.5) {
        return true;
      }
    }
    offset += conditioned.defencePrayer.priorStateStride;
  }
  return false;
}

function vlsSetupActive(adapter: VlsSetupAdapter, normalized: Float32Array, mean: Float32Array, std: Float32Array): boolean {
  const rawAttackDelay = rawInput(normalized, mean, std, adapter.attackDelayInputIndex);
  const rawSpecControl = rawInput(normalized, mean, std, adapter.specControlInputIndex);
  const rawSpecEnergy = rawInput(normalized, mean, std, adapter.specEnergyInputIndex);
  if (!approximately(rawAttackDelay, adapter.requiredRawAttackDelay, adapter.rawTolerance) ||
      !approximately(rawSpecControl, adapter.requiredRawSpecControl, adapter.rawTolerance) ||
      rawSpecEnergy + adapter.rawTolerance < adapter.minRawSpecEnergy ||
      rawInput(normalized, mean, std, adapter.targetPresentInputIndex) <= 0.5) {
    return false;
  }
  if (rawInput(normalized, mean, std, adapter.meleeReachInputIndex) > 0.5) {
    return true;
  }
  const dx = Math.abs(Math.round(rawInput(normalized, mean, std, adapter.targetRelDxInputIndex) * 16));
  const dy = Math.abs(Math.round(rawInput(normalized, mean, std, adapter.targetRelDyInputIndex) * 16));
  const selfFrozen = rawInput(normalized, mean, std, adapter.selfFrozenInputIndex) > 0.5;
  if (dx === 0 && dy === 0) return !selfFrozen;
  if (dx + dy === 1) return true;
  if (selfFrozen) return false;
  if (dx === 1 && dy === 1) return true;
  return dx <= 3 && dy <= 3 && !(dx === 3 && dy === 3);
}

function vlsFollowthroughActive(adapter: VlsFollowthroughAdapter, normalized: Float32Array, mean: Float32Array, std: Float32Array): boolean {
  return approximately(rawInput(normalized, mean, std, adapter.attackDelayInputIndex), adapter.requiredRawAttackDelay, adapter.rawTolerance) &&
    approximately(rawInput(normalized, mean, std, adapter.specControlInputIndex), adapter.requiredRawSpecControl, adapter.rawTolerance) &&
    rawInput(normalized, mean, std, adapter.specEnergyInputIndex) + adapter.rawTolerance >= adapter.minRawSpecEnergy &&
    approximately(rawInput(normalized, mean, std, adapter.pendingInputIndex), adapter.requiredRawPending, adapter.rawTolerance) &&
    approximately(rawInput(normalized, mean, std, adapter.selfWeaponSinInputIndex), adapter.requiredWeaponSin, adapter.rawTolerance) &&
    approximately(rawInput(normalized, mean, std, adapter.selfWeaponCosInputIndex), adapter.requiredWeaponCos, adapter.rawTolerance);
}

function applyVlsProtectedMelee(
  conditioner: VlsProtectedMeleeConditioner,
  scores: number[],
  normalized: Float32Array,
  mean: Float32Array,
  std: Float32Array,
  headActive: boolean,
  followActive: boolean
): void {
  const protectMelee = rawInput(normalized, mean, std, conditioner.opponentProtectMeleeInputIndex);
  const hp = rawInput(normalized, mean, std, conditioner.opponentHpInputIndex);
  if (!approximately(protectMelee, 1, 1e-6) || hp <= conditioner.koHpMax) {
    return;
  }
  const contextStrength = clamp01((hp - conditioner.koHpMax) / (conditioner.fullStrengthHpMin - conditioner.koHpMax));
  if (headActive) {
    applyPenalizedGroup(scores, conditioner.headActionRows, conditioner.headPenalizedActionRows, -contextStrength * conditioner.strength[0]);
    return;
  }
  const specEnergy = rawInput(normalized, mean, std, conditioner.specEnergyInputIndex);
  if (followActive && specEnergy < conditioner.followMaxSpecEnergyExclusive) {
    applyPenalizedGroup(scores, conditioner.followActionRows, conditioner.followPenalizedActionRows, -contextStrength * conditioner.strength[1]);
  }
}

function replaceGroupScores(scores: number[], rows: Int32Array, replacements: Float32Array): void {
  const baseMass = logSumExp(Array.from(rows, (row) => scores[row]));
  const replacementMass = logSumExp(Array.from(replacements));
  for (let index = 0; index < rows.length; index += 1) {
    scores[rows[index]] = replacements[index] - replacementMass + baseMass;
  }
}

function applyResidualGroup(scores: number[], rows: Int32Array, residuals: ArrayLike<number>): void {
  const baseMass = logSumExp(Array.from(rows, (row) => scores[row]));
  const shiftedMass = logSumExp(Array.from(rows, (row, index) => scores[row] + residuals[index]));
  const correction = baseMass - shiftedMass;
  for (let index = 0; index < rows.length; index += 1) {
    scores[rows[index]] += residuals[index] + correction;
  }
}

function applyLiftedGroup(scores: number[], rows: Int32Array, shiftedRows: number, lift: number): void {
  applyResidualGroup(scores, rows, Array.from(rows, (_, index) => index < shiftedRows ? lift : 0));
}

function applyPenalizedGroup(scores: number[], rows: Int32Array, penalizedRows: Int32Array, penalty: number): void {
  const penalized = new Set(Array.from(penalizedRows));
  applyResidualGroup(scores, rows, Array.from(rows, (row) => penalized.has(row) ? penalty : 0));
}

function writeOneHotHistory(output: Float32Array, start: number, codes: readonly number[], slots: number): number {
  let offset = start;
  for (let slot = 0; slot < slots; slot += 1) {
    const code = codes[slot] ?? 0;
    if (code >= 1 && code <= 3) output[offset + code - 1] = 1;
    offset += 3;
  }
  return offset;
}

function runDenseSilu(layer: NhConditionedDenseLayer, input: Float32Array): Float32Array {
  const output = runDenseLinear(layer, input);
  for (let index = 0; index < output.length; index += 1) output[index] = silu(output[index]);
  return output;
}

function runDenseLinear(layer: NhConditionedDenseLayer, input: Float32Array): Float32Array {
  const output = new Float32Array(layer.bias.length);
  for (let row = 0; row < output.length; row += 1) output[row] = denseRow(layer, row, input);
  return output;
}

function denseRow(layer: NhConditionedDenseLayer, row: number, input: Float32Array): number {
  let value = layer.bias[row];
  const weights = layer.weight[row];
  for (let index = 0; index < input.length; index += 1) value += weights[index] * input[index];
  return value;
}

function rawInput(normalized: Float32Array, mean: Float32Array, std: Float32Array, index: number): number {
  return normalized[index] * normalizedDivisor(std[index]) + mean[index];
}

function normalizedDivisor(value: number): number {
  return Number.isFinite(value) && Math.abs(value) > 1e-8 ? value : 1;
}

function logSumExp(values: readonly number[]): number {
  const max = Math.max(...values);
  let sum = 0;
  for (const value of values) sum += Math.exp(value - max);
  return max + Math.log(sum);
}

function silu(value: number): number { return value / (1 + Math.exp(-value)); }
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function approximately(left: number, right: number, tolerance: number): boolean {
  return Number.isFinite(left) && Math.abs(left - right) <= tolerance;
}

function exactObject(value: unknown, kind: string, version: number, label: string): Record<string, unknown> {
  const object = objectValue(value, label);
  if (object.kind !== kind || object.version !== version) throw new Error(`${label} must be ${kind} v${version}.`);
  return object;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function exactInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${label} must be an integer.`);
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function integerVector(value: unknown, length: number, label: string): Int32Array {
  if (!Array.isArray(value) || value.length !== length) throw new Error(`${label} must contain ${length} integers.`);
  return Int32Array.from(value.map((entry, index) => exactInteger(entry, `${label}[${index}]`)));
}

function numberVector(value: unknown, length: number, label: string): Float32Array {
  if (!Array.isArray(value) || value.length !== length) throw new Error(`${label} must contain ${length} numbers.`);
  return Float32Array.from(value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`)));
}

function numberMatrix(value: unknown, rows: number, columns: number, label: string): readonly Float32Array[] {
  if (!Array.isArray(value) || value.length !== rows) throw new Error(`${label} must contain ${rows} rows.`);
  return value.map((row, index) => numberVector(row, columns, `${label}[${index}]`));
}

function denseLayer(value: unknown, rows: number, columns: number, label: string): NhConditionedDenseLayer {
  const object = objectValue(value, label);
  return denseFromWeightBias(object, rows, columns, label);
}

function denseFromWeightBias(value: Record<string, unknown>, rows: number, columns: number, label: string): NhConditionedDenseLayer {
  return { weight: numberMatrix(value.weight, rows, columns, `${label}.weight`), bias: numberVector(value.bias, rows, `${label}.bias`) };
}

function mappedRows(value: Record<string, unknown>, policyActionIds: Int32Array, length: number, label: string): Int32Array {
  const ids = integerVector(value.actionIds, length, `${label}.actionIds`);
  const rows = value.actionRows === undefined
    ? Int32Array.from(Array.from(ids, (id) => policyActionIds.indexOf(id)))
    : integerVector(value.actionRows, length, `${label}.actionRows`);
  for (let index = 0; index < length; index += 1) {
    if (rows[index] < 0 || rows[index] >= policyActionIds.length || policyActionIds[rows[index]] !== ids[index]) {
      throw new Error(`${label} action ${ids[index]} does not map to row ${rows[index]}.`);
    }
  }
  return rows;
}

function mappedSingleRow(value: Record<string, unknown>, policyActionIds: Int32Array, label: string): number {
  const id = exactInteger(value.actionId, `${label}.actionId`);
  const row = exactInteger(value.actionRow, `${label}.actionRow`);
  if (row < 0 || row >= policyActionIds.length || policyActionIds[row] !== id) throw new Error(`${label} action ${id} does not map to row ${row}.`);
  return row;
}

function requireSameRows(actual: Int32Array, expected: Int32Array, label: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) throw new Error(`${label} rows do not match the defence prayer head.`);
}
