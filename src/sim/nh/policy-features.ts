import equipmentRowsJson from "../../generated/equipment-bonuses.json";
import { getAttackDelayStatus } from "../combat/timers";
import { nhWeaponProfiles } from "../combat/player-combat";
import { canAct, canAttackThroughLock, isFrozen } from "../entity/locks";
import { aggregateVisibleEquipmentBonuses, type EquipmentBonusRow } from "../equipment/equipment";
import { activeProtectionPrayer, protectPrayerForStyle } from "../prayer/prayers";
import { canMeleeReachThisTick, chebyshevDistance } from "../world/movement";
import {
  isNhArmadylGodswordItemId,
  isNhGraniteMaulItemId,
  nhGearProfileAvailableSpecialWeaponKind,
  nhGearProfileCanEquipArmadylGodsword,
  nhGearProfileCanEquipGraniteMaul
} from "./gearProfile";
import { nhPolicyFeatureSize, nhPolicyInputSize, nhPolicyReservoirSize } from "./policy-bridge";
import type { NhDuelActorState, NhDuelControllerContext } from "./duel";
import type { NhOffenceStyle } from "./policy-bridge";
import type { NhWeaponId } from "./loadouts";

export interface NhPolicyFeatureState {
  hidden: number[];
  hiddenNext: number[];
}

export const nhPolicyReservoirFeatureStart = 0;
export const nhPolicyReservoirFeatureEnd = nhPolicyReservoirSize;
export const nhPolicyInputFeatureStart = nhPolicyReservoirFeatureEnd;
export const nhPolicyInputFeatureEnd = nhPolicyInputFeatureStart + nhPolicyInputSize;
export const nhPolicyBiasFeatureIndex = nhPolicyInputFeatureEnd;

const rewardClamp = 12;
const freezeTicksNormalizer = 80;
const weaponEmbedFrequency = 0.013;
const hiddenLeak = 0.68;
const inputWeightScale = 0.24;
const recurrentWeightScale = 0.16;
const recurrentDensity = 0.2;
const biasScale = 0.06;
const reservoirSeed = 0x5eedb07a5a11n;
const equipmentRows = equipmentRowsJson as readonly EquipmentBonusRow[];
const clientThreatGmaulMax = 40;
const clientThreatGmaulDoubleMax = 72;
const clientThreatAgsMax = 74;
const clientThreatPrayerReduction = 0.6;
const policyThreatRange = 8;
type NhSpecialWeaponKind = "granite_maul" | "armadyl_godsword";

let reservoirCache: ReturnType<typeof createReservoir> | null = null;

export function createNhPolicyFeatureState(): NhPolicyFeatureState {
  return {
    hidden: Array<number>(nhPolicyReservoirSize).fill(0),
    hiddenNext: Array<number>(nhPolicyReservoirSize).fill(0)
  };
}

export function resetNhPolicyFeatureState(state: NhPolicyFeatureState): void {
  state.hidden.fill(0);
  state.hiddenNext.fill(0);
}

export function encodeNhPolicyFeatures(
  context: NhDuelControllerContext,
  state?: NhPolicyFeatureState
): number[] {
  const input = encodeNhPolicyInput(context);
  const features = Array<number>(nhPolicyFeatureSize).fill(0);
  const hidden = state ? advanceStateHidden(state, input) : advanceHiddenFrom(Array<number>(nhPolicyReservoirSize).fill(0), input);

  for (let index = 0; index < nhPolicyReservoirSize; index += 1) {
    features[nhPolicyReservoirFeatureStart + index] = hidden[index];
  }
  for (let index = 0; index < nhPolicyInputSize; index += 1) {
    features[nhPolicyInputFeatureStart + index] = input[index];
  }
  features[nhPolicyBiasFeatureIndex] = 1;
  return features;
}

export function encodeNhPolicyInput(context: NhDuelControllerContext): number[] {
  const self = context.self;
  const opponent = context.opponent;
  const opponentInfoKnown = observedOpponentInfoKnown(context);
  const distance = observedDistance(context);
  // Source: NhStakerBot.OpponentInfoSnapshot.unknown() keeps the target index
  // but encodes delayed opponent coordinates as -1, -1.
  const relDx = opponentInfoKnown ? opponent.tile.x - self.tile.x : -1 - self.tile.x;
  const relDy = opponentInfoKnown ? opponent.tile.y - self.tile.y : -1 - self.tile.y;
  const selfStyle = styleForWeapon(self.weaponId);
  // Source: NhStakerBot.captureObservation() records canAttackFromObserved(..., selfLikelyStyle)
  // separately from currentOffenceStyle; Gmaul spec equips must not make this use stale policy offence.
  const selfCanAttackFromObserved = canAttackFromObservedFeature(context, selfStyle);
  const selfAttackDelay = getAttackDelayStatus(self.attackTimer, context.tick);
  const opponentMeleeReachCanReach =
    opponentInfoKnown &&
    canMeleeReachThisTick({
      attacker: opponent.tile,
      defender: self.tile,
      attackerFrozen: isFrozen(opponent.locks, context.tick)
    }).canReach;
  const opponentStyle = opponentInfoKnown ? opponent.lastVisibleOpponentStyle : null;
  const scriptedOffenceStyle = context.scriptedOffenceStyle ?? styleBucket(context.bestVisibleStyle);
  const gmaulFeatures = gmaulFeatureWindow(context);
  const selfCanSpecSingleNow = canUseSpecialSpecFromObserved(context, false);
  const selfCanSpecDoubleNow = canUseSpecialSpecFromObserved(context, true);
  const opponentVisibleHp = clientVisibleOpponentHp(context);
  const input: number[] = [];

  input.push(clamp01(distance / 12));
  input.push(clamp01(self.stats.hitpoints.current / 99));
  input.push(clamp01(opponentVisibleHp / 99));
  input.push(clamp01(self.stats.prayer.current / 99));
  input.push(clamp01(foodCount(self) / 28));
  // Source: NhStakerBot.captureObservation() uses countAny(*_IDS), which counts
  // visible potion bottles across all dose item ids, not remaining sips. Runtime
  // supply execution stores sips so the trainer can consume (4)->(3)->(2)->(1).
  input.push(clamp01(policyPotionBottleCount(self.supplies.saradomin_brew) / 8));
  input.push(clamp01(policyPotionBottleCount(self.supplies.super_restore, self.supplies.sanfew_serum) / 8));
  input.push(clamp01(policyPotionBottleCount(self.supplies.super_combat, self.supplies.bastion, self.supplies.ranging_potion) / 8));
  input.push(boolFeature(selfCanAttackFromObserved));
  input.push(boolFeature(!selfAttackDelay.delayed));
  // Source: NhStakerBot.canUseSpecialSpecFromObserved -> hasClientSpecControlForSpecialThisTick()
  // checks the action/death gates before exposing canSpecSingle/DoubleNow to policy input.
  input.push(boolFeature(selfCanSpecSingleNow));
  input.push(boolFeature(selfCanSpecDoubleNow));
  input.push(boolFeature(isFrozen(self.locks, context.tick)));
  input.push(boolFeature(opponentInfoKnown && isFrozen(opponent.locks, context.tick)));
  input.push(remainingTicks(self.locks.freezeUntilTick, context.tick, freezeTicksNormalizer));
  input.push(remainingTicks(opponentInfoKnown ? opponent.locks.freezeUntilTick : -1, context.tick, freezeTicksNormalizer));
  input.push(boolFeature(self.movedThisTick));
  input.push(boolFeature(opponentInfoKnown && opponent.movedThisTick));
  input.push(boolFeature(self.ateFoodLastTick));
  input.push(boolFeature(self.drankPotionLastTick));
  input.push(clampSigned(self.rewardDelta / rewardClamp));
  input.push(clampSigned(self.rewardDps / 30));
  input.push(clampSigned(self.rewardTotal / 120));
  input.push(clampSigned(self.lastDealtHit / 40));
  input.push(clampSigned(self.lastTakenHit / 40));
  input.push(clamp01((self.gmaul.specialEnergy * 10) / 1000));
  input.push(boolFeature(self.specialActive));
  input.push(clampSigned(self.lastMoveDx / 4));
  input.push(clampSigned(self.lastMoveDy / 4));
  input.push(clampSigned((opponentInfoKnown ? opponent.lastMoveDx : 0) / 4));
  input.push(clampSigned((opponentInfoKnown ? opponent.lastMoveDy : 0) / 4));
  input.push(clampSigned(relDx / 16));
  input.push(clampSigned(relDy / 16));
  input.push(1);
  pushStyle(input, selfStyle);
  pushStyle(input, self.lastOffenceStyle);
  pushStyle(input, scriptedOffenceStyle);
  pushStyle(input, opponentInfoKnown ? opponent.lastOffenceStyle : null);
  pushStyle(input, opponentStyle);
  pushProtectionMask(input, self);
  pushProtectionMask(input, opponentInfoKnown ? opponent : null);
  pushWeaponEmbedding(input, self.weaponId);
  pushWeaponEmbedding(input, opponentInfoKnown ? opponent.weaponId : null);
  // Source: NhStakerBot.captureObservation() hides delayed weapon/gear/prayer on
  // OpponentInfoSnapshot.unknown(), but still writes estimateOpponentSpecialEnergyClientSide().
  input.push(clamp01((opponent.gmaul.specialEnergy * 10) / 1000));
  input.push(boolFeature(context.rewardEpisodeActive ?? true));
  pushLevelRatios(input, self);
  pushLevelDeficits(input, self);
  input.push(boolFeature(opponentInfoKnown && context.meleeReachable));
  input.push(boolFeature(opponentMeleeReachCanReach));
  input.push(gmaulFeatures.singleKoChance);
  input.push(gmaulFeatures.doubleKoChance);
  input.push(gmaulFeatures.singleSetupScore);
  input.push(gmaulFeatures.doubleSetupScore);

  if (input.length !== nhPolicyInputSize) {
    throw new Error(`NH policy input encoder produced ${input.length} inputs, expected ${nhPolicyInputSize}.`);
  }
  return input;
}

function advanceStateHidden(state: NhPolicyFeatureState, input: readonly number[]): readonly number[] {
  advanceHiddenInto(state.hidden, input, state.hiddenNext);
  const next = state.hidden;
  state.hidden = state.hiddenNext;
  state.hiddenNext = next;
  return state.hidden;
}

function advanceHiddenFrom(previous: readonly number[], input: readonly number[]): readonly number[] {
  const output = Array<number>(nhPolicyReservoirSize).fill(0);
  advanceHiddenInto(previous, input, output);
  return output;
}

function advanceHiddenInto(previous: readonly number[], input: readonly number[], output: number[]): void {
  const reservoir = getReservoir();
  for (let row = 0; row < nhPolicyReservoirSize; row += 1) {
    let sum = reservoir.hiddenBias[row];
    for (let col = 0; col < nhPolicyInputSize; col += 1) {
      sum += reservoir.inputWeights[row][col] * input[col];
    }
    for (let col = 0; col < nhPolicyReservoirSize; col += 1) {
      sum += reservoir.recurrentWeights[row][col] * previous[col];
    }
    const activated = Math.tanh(sum);
    output[row] = (1 - hiddenLeak) * previous[row] + hiddenLeak * activated;
  }
}

function getReservoir(): ReturnType<typeof createReservoir> {
  if (!reservoirCache) {
    reservoirCache = createReservoir();
  }
  return reservoirCache;
}

function createReservoir(): {
  readonly hiddenBias: readonly number[];
  readonly inputWeights: readonly (readonly number[])[];
  readonly recurrentWeights: readonly (readonly number[])[];
} {
  const rng = new JavaRandom(reservoirSeed);
  const hiddenBias: number[] = [];
  const inputWeights: number[][] = [];
  const recurrentWeights: number[][] = [];

  for (let row = 0; row < nhPolicyReservoirSize; row += 1) {
    hiddenBias[row] = randomRange(rng, -biasScale, biasScale);
    inputWeights[row] = [];
    recurrentWeights[row] = [];
    for (let col = 0; col < nhPolicyInputSize; col += 1) {
      inputWeights[row][col] = randomRange(rng, -inputWeightScale, inputWeightScale);
    }
    for (let col = 0; col < nhPolicyReservoirSize; col += 1) {
      recurrentWeights[row][col] =
        rng.nextDouble() <= recurrentDensity ? randomRange(rng, -recurrentWeightScale, recurrentWeightScale) : 0;
    }
  }

  return { hiddenBias, inputWeights, recurrentWeights };
}

class JavaRandom {
  private seed: bigint;

  constructor(seed: bigint) {
    this.seed = (seed ^ 0x5deece66dn) & ((1n << 48n) - 1n);
  }

  nextDouble(): number {
    const high = this.nextBits(26);
    const low = this.nextBits(27);
    return (high * 2 ** 27 + low) / 2 ** 53;
  }

  private nextBits(bits: number): number {
    this.seed = (this.seed * 0x5deece66dn + 0xbn) & ((1n << 48n) - 1n);
    return Number(this.seed >> BigInt(48 - bits));
  }
}

function foodCount(actor: NhDuelActorState): number {
  return actor.supplies.manta_ray + actor.supplies.shark + actor.supplies.anglerfish + actor.supplies.karambwan;
}

function policyPotionBottleCount(...remainingSips: readonly number[]): number {
  return remainingSips.reduce((total, sips) => total + Math.ceil(Math.max(0, sips) / 4), 0);
}

function observedOpponentInfoKnown(context: NhDuelControllerContext): boolean {
  return context.opponent.observedInfoKnown !== false;
}

function pushProtectionMask(output: number[], actor: NhDuelActorState | null): void {
  if (!actor) {
    output.push(0, 0, 0);
    return;
  }
  output.push(
    boolFeature(actor.activePrayers.includes("protect_from_magic")),
    boolFeature(actor.activePrayers.includes("protect_from_missiles")),
    boolFeature(actor.activePrayers.includes("protect_from_melee"))
  );
}

function pushWeaponEmbedding(output: number[], weaponId: NhWeaponId | null): void {
  if (!weaponId) {
    output.push(0, 0);
    return;
  }
  const itemId = itemIdForWeapon(weaponId);
  output.push(itemId <= 0 ? 0 : Math.sin(itemId * weaponEmbedFrequency));
  output.push(itemId <= 0 ? 0 : Math.cos(itemId * weaponEmbedFrequency));
}

function pushLevelRatios(output: number[], actor: NhDuelActorState): void {
  output.push(
    levelRatio(actor.stats.attack.current, actor.stats.attack.fixed),
    levelRatio(actor.stats.strength.current, actor.stats.strength.fixed),
    levelRatio(actor.stats.defence.current, actor.stats.defence.fixed),
    levelRatio(actor.stats.ranged.current, actor.stats.ranged.fixed),
    levelRatio(actor.stats.magic.current, actor.stats.magic.fixed)
  );
}

function pushLevelDeficits(output: number[], actor: NhDuelActorState): void {
  output.push(
    levelDeficit(actor.stats.attack.current, actor.stats.attack.fixed),
    levelDeficit(actor.stats.strength.current, actor.stats.strength.fixed),
    levelDeficit(actor.stats.defence.current, actor.stats.defence.fixed),
    levelDeficit(actor.stats.ranged.current, actor.stats.ranged.fixed),
    levelDeficit(actor.stats.magic.current, actor.stats.magic.fixed)
  );
}

function pushStyle(output: number[], style: NhOffenceStyle | null): void {
  output.push(boolFeature(style === "magic"), boolFeature(style === "ranged"), boolFeature(style === "melee"));
}

function styleForWeapon(weaponId: NhWeaponId): NhOffenceStyle {
  if (weaponId === "kodai" || weaponId === "ancient_staff" || weaponId === "staff_of_the_dead") {
    return "magic";
  }
  if (
    weaponId === "armadyl_crossbow" ||
    weaponId === "rune_crossbow" ||
    weaponId === "magic_shortbow" ||
    weaponId === "dragon_crossbow"
  ) {
    return "ranged";
  }
  return "melee";
}

function styleBucket(style: string): NhOffenceStyle {
  if (style === "magic") {
    return "magic";
  }
  if (style === "ranged") {
    return "ranged";
  }
  return "melee";
}

function itemIdForWeapon(weaponId: NhWeaponId): number {
  if (weaponId === "kodai") {
    return 21006;
  }
  if (weaponId === "ancient_staff") {
    return 4675;
  }
  if (weaponId === "staff_of_the_dead") {
    return 11791;
  }
  if (weaponId === "armadyl_crossbow") {
    return 11785;
  }
  if (weaponId === "rune_crossbow") {
    return 9185;
  }
  if (weaponId === "magic_shortbow") {
    return 861;
  }
  if (weaponId === "dragon_crossbow") {
    return 21902;
  }
  if (weaponId === "granite_maul") {
    return 4153;
  }
  if (weaponId === "armadyl_godsword") {
    return 11802;
  }
  if (weaponId === "abyssal_whip") {
    return 4151;
  }
  return 12006;
}

function canAttackFromObservedFeature(context: NhDuelControllerContext, style: NhOffenceStyle): boolean {
  // Source: NhStakerBot.captureObservation() records canAttackFromObserved()
  // separately from selfAttackReady, so the policy sees range/lock viability even
  // while the weapon timer is still delayed.
  if (
    !canAttackThroughLock(context.self.locks, context.tick) ||
    context.self.stats.hitpoints.current <= 0 ||
    context.opponent.stats.hitpoints.current <= 0
  ) {
    return false;
  }
  const distance = observedDistance(context);
  if (distance < 0) {
    return false;
  }
  if (style === "melee") {
    return context.meleeReachable;
  }
  // Source: NhStakerBot.attackRangeForThreat() returns 8 for non-melee
  // observation/risk features. The runtime combat spell route can still use the
  // real TargetSpell range elsewhere.
  return distance >= 1 && distance <= policyThreatRange;
}

interface GmaulFeatureWindow {
  readonly singleKoChance: number;
  readonly doubleKoChance: number;
  readonly singleSetupScore: number;
  readonly doubleSetupScore: number;
}

function gmaulFeatureWindow(context: NhDuelControllerContext): GmaulFeatureWindow {
  const specialKind = availableSpecialWeaponKind(context.self);
  const singleCanSpecNow = canUseSpecialSpecFromObserved(context, false);
  const doubleCanSpecNow = canUseSpecialSpecFromObserved(context, true);
  const singleCanSpecSoon = singleCanSpecNow || canApproachSpecialSpecSoon(context, false);
  const doubleCanSpecSoon = doubleCanSpecNow || canApproachSpecialSpecSoon(context, true);
  if (!singleCanSpecSoon && !doubleCanSpecSoon) {
    return {
      singleKoChance: 0,
      doubleKoChance: 0,
      singleSetupScore: 0,
      doubleSetupScore: 0
    };
  }

  const opponentHp = clientVisibleOpponentHp(context);
  const recentHit = Math.max(0, context.self.lastDealtHit);
  const exposure = specialKind ? opponentSpecialSpecExposure(context, specialKind) : 1;
  const meleeProtected = opponentProtectsFromMelee(context);
  // Source: NhStakerBot fills gmaulSingle/DoubleKoChance from clientGmaulKoChance()
  // when in melee range, otherwise clientGmaulKoChanceEstimate(..., requireMeleeRange=false).
  return {
    singleKoChance: singleCanSpecSoon
      ? clientSpecialKoChanceEstimate(context, specialKind, false, singleCanSpecNow, exposure, meleeProtected)
      : 0,
    doubleKoChance: doubleCanSpecSoon
      ? clientSpecialKoChanceEstimate(context, specialKind, true, doubleCanSpecNow, exposure, meleeProtected)
      : 0,
    singleSetupScore: singleCanSpecSoon ? specialSetupScore(specialKind, false, opponentHp, recentHit, exposure, meleeProtected) : 0,
    doubleSetupScore: doubleCanSpecSoon ? specialSetupScore(specialKind, true, opponentHp, recentHit, exposure, meleeProtected) : 0
  };
}

export function nhPolicyGmaulSpecApproachWindow(context: NhDuelControllerContext, doubleSpecOnly = false): number {
  if (
    !canAct(context.self.locks, context.tick) ||
    isFrozen(context.self.locks, context.tick) ||
    context.self.stats.hitpoints.current <= 0
  ) {
    return 0;
  }
  const specialKind = availableSpecialWeaponKind(context.self);
  if (specialKind === null || (doubleSpecOnly && specialKind !== "granite_maul")) {
    return 0;
  }
  const distance = observedDistance(context);
  if (distance < 0 || distance > 2) {
    return 0;
  }
  const energy = context.self.gmaul.specialEnergy;
  if (energy < specialRequiredEnergy(specialKind, false)) {
    return 0;
  }
  const opponentHp = clientVisibleOpponentHp(context);
  const recentHit = Math.max(0, context.self.lastDealtHit);
  const exposure = opponentSpecialSpecExposure(context, specialKind);
  const meleeProtected = opponentProtectsFromMelee(context);
  let best = 0;
  if (!doubleSpecOnly) {
    const singleKo = clientSpecialKoChanceEstimate(context, specialKind, false, false, exposure, meleeProtected);
    const singleSetup = specialSetupScore(specialKind, false, opponentHp, recentHit, exposure, meleeProtected);
    best = Math.max(best, specialCredibleSpecWindow(specialKind, false, opponentHp, recentHit, exposure, meleeProtected, singleKo, singleSetup));
  }
  if (specialKind === "granite_maul" && energy >= 100) {
    const doubleKo = clientGmaulKoChanceEstimate(context, true, false, exposure, meleeProtected);
    const doubleSetup = gmaulSetupScore(true, opponentHp, recentHit, exposure, meleeProtected);
    best = Math.max(best, gmaulCredibleSpecWindow(true, opponentHp, recentHit, exposure, meleeProtected, doubleKo, doubleSetup));
  }
  return best;
}

function canUseSpecialSpecFromObserved(context: NhDuelControllerContext, doubleSpec: boolean): boolean {
  const specialKind = availableSpecialWeaponKind(context.self);
  if (specialKind === null || (doubleSpec && specialKind !== "granite_maul")) {
    return false;
  }
  if (
    !observedOpponentInfoKnown(context) ||
    !canAct(context.self.locks, context.tick) ||
    context.self.stats.hitpoints.current <= 0 ||
    context.opponent.stats.hitpoints.current <= 0
  ) {
    return false;
  }
  if (context.self.gmaul.specialEnergy < specialRequiredEnergy(specialKind, doubleSpec)) {
    return false;
  }
  if (!context.meleeReachable) {
    return false;
  }
  if (specialKind === "armadyl_godsword" && getAttackDelayStatus(context.self.attackTimer, context.tick).delayed) {
    return false;
  }
  return nhWeaponProfiles[context.self.weaponId].hasVisibleSpecBar;
}

function canApproachSpecialSpecSoon(context: NhDuelControllerContext, doubleSpec: boolean): boolean {
  const specialKind = availableSpecialWeaponKind(context.self);
  if (specialKind === null || (doubleSpec && specialKind !== "granite_maul")) {
    return false;
  }
  if (
    !observedOpponentInfoKnown(context) ||
    !canAct(context.self.locks, context.tick) ||
    context.self.stats.hitpoints.current <= 0 ||
    context.opponent.stats.hitpoints.current <= 0 ||
    context.self.gmaul.specialEnergy < specialRequiredEnergy(specialKind, doubleSpec) ||
    isFrozen(context.self.locks, context.tick)
  ) {
    return false;
  }
  if (specialKind === "armadyl_godsword" && getAttackDelayStatus(context.self.attackTimer, context.tick).delayed) {
    return false;
  }
  return observedDistance(context) === 2;
}

function availableSpecialWeaponKind(actor: NhDuelActorState): NhSpecialWeaponKind | null {
  if (hasEquipableGraniteMaulAvailable(actor)) {
    return "granite_maul";
  }
  if (hasEquipableArmadylGodswordAvailable(actor)) {
    return "armadyl_godsword";
  }
  return null;
}

function hasEquipableGraniteMaulAvailable(actor: NhDuelActorState): boolean {
  if (actor.gearProfile && nhGearProfileAvailableSpecialWeaponKind(actor.gearProfile) === "granite_maul") {
    return true;
  }
  if (actor.equipment.weapon && isNhGraniteMaulItemId(actor.equipment.weapon.itemId)) {
    return true;
  }
  return actor.inventorySlots.some((slot) => slot !== null && slot.quantity > 0 && isNhGraniteMaulItemId(slot.itemId));
}

function hasEquipableArmadylGodswordAvailable(actor: NhDuelActorState): boolean {
  if (actor.gearProfile && nhGearProfileCanEquipArmadylGodsword(actor.gearProfile)) {
    return true;
  }
  if (actor.equipment.weapon && isNhArmadylGodswordItemId(actor.equipment.weapon.itemId)) {
    return true;
  }
  return actor.inventorySlots.some((slot) => slot !== null && slot.quantity > 0 && isNhArmadylGodswordItemId(slot.itemId));
}

function specialRequiredEnergy(specialKind: NhSpecialWeaponKind, doubleSpec: boolean): number {
  if (specialKind === "granite_maul") {
    return doubleSpec ? 100 : 50;
  }
  return 50;
}

function clientSpecialKoChanceEstimate(
  context: NhDuelControllerContext,
  specialKind: NhSpecialWeaponKind | null,
  doubleSpec: boolean,
  requireMeleeRange: boolean,
  exposure: number,
  meleeProtected: boolean
): number {
  if (specialKind === "armadyl_godsword") {
    return doubleSpec ? 0 : clientAgsKoChanceEstimate(context, requireMeleeRange, exposure, meleeProtected);
  }
  return clientGmaulKoChanceEstimate(context, doubleSpec, requireMeleeRange, exposure, meleeProtected);
}

function clientGmaulKoChanceEstimate(
  context: NhDuelControllerContext,
  doubleSpec: boolean,
  requireMeleeRange: boolean,
  exposure: number,
  meleeProtected: boolean
): number {
  if (observedDistance(context) < 0) {
    return 0;
  }
  if (requireMeleeRange && !context.meleeReachable) {
    return 0;
  }
  const opponentHp = clientVisibleOpponentHp(context);
  const recentHit = Math.max(0, context.self.lastDealtHit);
  const prayerFactor = meleeProtected ? clientThreatPrayerReduction : 1;
  const maxSpecDamage = doubleSpec ? clientThreatGmaulDoubleMax : clientThreatGmaulMax;
  const effectiveDamage = Math.max(1, Math.round(maxSpecDamage * exposure * prayerFactor));
  let chance = softKoRisk(opponentHp, effectiveDamage, doubleSpec ? 14 : 10);
  if (!meleeProtected && recentHit >= 24 && opponentHp <= 72) {
    chance += 0.08;
  }
  if (recentHit >= 30 && opponentHp <= 65) {
    chance += 0.12;
  }
  if (recentHit >= 38 && opponentHp <= 58) {
    chance += 0.1;
  }
  if (opponentHp <= 45) {
    chance += 0.08;
  }
  if (opponentHp >= 70 && recentHit < 18) {
    chance -= 0.12;
  }
  if (opponentHp >= 78 && recentHit < 24) {
    chance -= 0.14;
  }
  return clamp01(chance);
}

function clientAgsKoChanceEstimate(
  context: NhDuelControllerContext,
  requireMeleeRange: boolean,
  exposure: number,
  meleeProtected: boolean
): number {
  if (observedDistance(context) < 0) {
    return 0;
  }
  if (requireMeleeRange && !context.meleeReachable) {
    return 0;
  }
  const opponentHp = clientVisibleOpponentHp(context);
  const recentHit = Math.max(0, context.self.lastDealtHit);
  const prayerFactor = meleeProtected ? clientThreatPrayerReduction : 1;
  const effectiveDamage = Math.max(1, Math.round(clientThreatAgsMax * exposure * prayerFactor));
  let chance = softKoRisk(opponentHp, effectiveDamage, 12);
  if (!meleeProtected && recentHit >= 24 && opponentHp <= 78) {
    chance += 0.08;
  }
  if (recentHit >= 32 && opponentHp <= 72) {
    chance += 0.11;
  }
  if (opponentHp <= 52) {
    chance += 0.08;
  }
  if (opponentHp >= 86 && recentHit < 22) {
    chance -= 0.14;
  }
  return clamp01(chance);
}

function specialCredibleSpecWindow(
  specialKind: NhSpecialWeaponKind | null,
  doubleSpec: boolean,
  opponentHp: number,
  recentHit: number,
  exposure: number,
  meleeProtected: boolean,
  koChance: number,
  setupScore: number
): number {
  if (specialKind === "armadyl_godsword") {
    return agsCredibleSpecWindow(opponentHp, recentHit, exposure, meleeProtected, koChance, setupScore);
  }
  return gmaulCredibleSpecWindow(doubleSpec, opponentHp, recentHit, exposure, meleeProtected, koChance, setupScore);
}

function agsCredibleSpecWindow(
  opponentHp: number,
  recentHit: number,
  exposure: number,
  meleeProtected: boolean,
  koChance: number,
  setupScore: number
): number {
  let window = Math.max(koChance, setupScore * 0.86);
  if (recentHit >= 24 && opponentHp <= 78) {
    window += 0.09 + clamp01((recentHit - 24) / 26) * 0.11;
  }
  if (!meleeProtected && exposure >= 1.05 && opponentHp <= 76) {
    window += clamp01((exposure - 1) / 0.32) * 0.08;
  }
  if (meleeProtected && opponentHp > 44) {
    window *= 0.45;
  }
  if (opponentHp >= 86 && recentHit < 22) {
    window *= 0.45;
  }
  return clamp01(window);
}

function gmaulCredibleSpecWindow(
  doubleSpec: boolean,
  opponentHp: number,
  recentHit: number,
  exposure: number,
  meleeProtected: boolean,
  koChance: number,
  setupScore: number
): number {
  let window = Math.max(koChance, setupScore * 0.82);
  if (recentHit >= 24 && opponentHp <= (doubleSpec ? 82 : 58)) {
    window += 0.1 + clamp01((recentHit - 24) / 24) * 0.1;
  }
  if (!meleeProtected && exposure >= 1.05 && opponentHp <= (doubleSpec ? 84 : 56)) {
    window += clamp01((exposure - 1) / 0.32) * 0.08;
  }
  if (meleeProtected && opponentHp > (doubleSpec ? 46 : 30)) {
    window *= 0.42;
  }
  if (opponentHp >= 82 && recentHit < 24) {
    window *= 0.45;
  }
  return clamp01(window);
}

function specialSetupScore(
  specialKind: NhSpecialWeaponKind | null,
  doubleSpec: boolean,
  opponentHp: number,
  recentHit: number,
  exposure: number,
  meleeProtected: boolean
): number {
  if (specialKind === "armadyl_godsword") {
    return agsSetupScore(opponentHp, recentHit, exposure, meleeProtected);
  }
  return gmaulSetupScore(doubleSpec, opponentHp, recentHit, exposure, meleeProtected);
}

function agsSetupScore(
  opponentHp: number,
  recentHit: number,
  exposure: number,
  meleeProtected: boolean
): number {
  const hpScore = clamp01((76 - opponentHp) / 42);
  const recentHitScore = clamp01((recentHit - 18) / 26);
  const exposureScore = clamp01((exposure - 0.82) / 0.48);
  let setup = hpScore * 0.56 + recentHitScore * 0.28 + exposureScore * 0.16;
  if (recentHit >= 30 && opponentHp <= 68) {
    setup += 0.12;
  }
  if (recentHit <= 8 && opponentHp >= 72) {
    setup -= 0.2;
  }
  const prayerScale = meleeProtected ? 0.3 : 1;
  return clamp01(setup * prayerScale);
}

function gmaulSetupScore(
  doubleSpec: boolean,
  opponentHp: number,
  recentHit: number,
  exposure: number,
  meleeProtected: boolean
): number {
  const hpScore = doubleSpec ? clamp01((88 - opponentHp) / 42) : clamp01((54 - opponentHp) / 34);
  const recentHitScore = clamp01((recentHit - 16) / 24);
  const exposureScore = clamp01((exposure - 0.82) / 0.45);
  let setup = hpScore * 0.5 + recentHitScore * 0.32 + exposureScore * 0.18;
  if (recentHit >= 28 && opponentHp <= (doubleSpec ? 72 : 50)) {
    setup += 0.12;
  }
  if (recentHit <= 8 && opponentHp >= (doubleSpec ? 68 : 48)) {
    setup -= 0.18;
  }
  const prayerScale = meleeProtected ? 0.25 : 1;
  return clamp01(setup * prayerScale);
}

function opponentSpecialSpecExposure(context: NhDuelControllerContext, specialKind: NhSpecialWeaponKind): number {
  if (!observedOpponentInfoKnown(context)) {
    return 1;
  }
  const bonuses = aggregateVisibleEquipmentBonuses(context.opponent.equipment, equipmentRows);
  const meleeDefence = specialKind === "armadyl_godsword" ? bonuses.slash_defence_bonus : bonuses.crush_defence_bonus;
  const rangedDefence = bonuses.range_defence_bonus;
  let exposure = 1;
  if (meleeDefence <= 75) {
    exposure += 0.22;
  } else if (meleeDefence <= 115) {
    exposure += 0.1;
  } else if (meleeDefence >= 185) {
    exposure -= 0.26;
  } else if (meleeDefence >= 145) {
    exposure -= 0.14;
  }
  const gearStyle = context.opponent.lastVisibleOpponentStyle;
  if (gearStyle === "magic" && bonuses.magic_defence_bonus <= 95 && meleeDefence <= 125) {
    exposure += 0.12;
  }
  if (gearStyle === "ranged" && rangedDefence >= 125 && meleeDefence >= 125) {
    exposure -= 0.08;
  }
  return Math.max(0.62, Math.min(1.32, exposure));
}

function opponentProtectsFromMelee(context: NhDuelControllerContext): boolean {
  return activeProtectionPrayer(context.opponent.activePrayers) === protectPrayerForStyle("crush");
}

function observedDistance(context: NhDuelControllerContext): number {
  // Source: NhStakerBot.observedDistance() returns -1 for OpponentInfoSnapshot.unknown(),
  // whose x/y are hidden until a one-tick-old delayed snapshot exists.
  if (!observedOpponentInfoKnown(context)) {
    return -1;
  }
  if ((context.self.tile.plane ?? 0) !== (context.opponent.tile.plane ?? 0)) {
    return -1;
  }
  return chebyshevDistance(context.self.tile, context.opponent.tile);
}

function clientVisibleOpponentHp(context: NhDuelControllerContext): number {
  // Source: NhStakerBot.clientVisibleOpponentHp() stores a delayed client HP estimate
  // in 5-HP buckets; policy inference must not see exact server HP.
  if (!observedOpponentInfoKnown(context)) {
    return 0;
  }
  return clientVisibleHitpoints(context.opponent.stats.hitpoints.current);
}

function clientVisibleHitpoints(hitpoints: number): number {
  const hp = Math.max(0, Math.min(99, Math.trunc(Number.isFinite(hitpoints) ? hitpoints : 0)));
  if (hp <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(99, Math.trunc((hp + 2) / 5) * 5));
}

function softKoRisk(hp: number, possibleDamage: number, margin: number): number {
  if (possibleDamage <= 0) {
    return 0;
  }
  const lower = Math.max(1, possibleDamage - margin);
  const upper = Math.min(115, possibleDamage + margin);
  if (hp <= lower) {
    return 1;
  }
  if (hp >= upper) {
    return 0;
  }
  return (upper - hp) / Math.max(1, upper - lower);
}

function levelRatio(current: number, fixed: number): number {
  return fixed <= 0 ? 0 : clamp01(current / fixed);
}

function levelDeficit(current: number, fixed: number): number {
  return fixed <= 0 ? 0 : clampSigned((current - fixed) / 40);
}

function remainingTicks(untilTick: number, tick: number, scale: number): number {
  return clamp01(Math.max(0, untilTick - tick) / scale);
}

function boolFeature(value: boolean): number {
  return value ? 1 : 0;
}

function randomRange(rng: JavaRandom, min: number, max: number): number {
  return min + (max - min) * rng.nextDouble();
}

function clampSigned(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
