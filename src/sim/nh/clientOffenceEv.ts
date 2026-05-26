import equipmentRowsJson from "../../generated/equipment-bonuses.json";
import type { EquipmentSlot, VisibleEquipment, VisibleEquipmentItem } from "../clientView";
import type { BonusTable, CombatStyle } from "../combat/formulas";
import { aggregateVisibleEquipmentBonuses, type EquipmentBonusRow } from "../equipment/equipment";
import type { SimStats } from "../items/consumables";
import { activeProtectionPrayer, protectPrayerForStyle } from "../prayer/prayers";
import { chebyshevDistance, samePlane } from "../world/movement";
import type { NhDuelActorState, NhDuelControllerContext } from "./duel";
import type { NhCandidateVisibleStyle } from "./gearProfile";
import { nhLoadouts, type NhLoadoutId } from "./loadouts";
import type { NhOffenceStyle } from "./policy-bridge";

const equipmentRows = equipmentRowsJson as readonly EquipmentBonusRow[];
const clientThreatRange = 8;
const offensivePrayerBoost = 0.23;
const candidateLoadoutForVisibleStyle = {
  magic: "kodai-robes",
  ranged: "acb-hides",
  slash: "tentacle-bandos"
} as const satisfies Record<NhCandidateVisibleStyle, NhLoadoutId>;

export function nhClientOffenceEv(
  context: NhDuelControllerContext,
  style: NhOffenceStyle,
  stats: SimStats = context.self.stats,
  actor: NhDuelActorState = context.self
): number {
  if (!nhStyleInOffensiveRange(context, style)) {
    return 0;
  }
  const expectedBonuses = aggregateVisibleEquipmentBonuses(nhCandidateEquipmentForStyle(actor, style), equipmentRows);
  const opponentInfoKnown = context.opponent.observedInfoKnown !== false;
  const opponentBonuses = opponentInfoKnown ? aggregateVisibleEquipmentBonuses(context.opponent.equipment, equipmentRows) : null;
  const weakness = opponentBonuses ? nhWeaknessForStyle(opponentBonuses, style) : 0;
  const defenceFactor = 0.56 + 0.58 * nhClamp01(weakness + 0.35);
  const prayerFactor =
    opponentInfoKnown &&
    activeProtectionPrayer(context.opponent.activePrayers) === protectPrayerForStyle(nhCombatStyleForOffence(style))
      ? 0.58
      : 1;
  const baseHit = nhClientStyleBaseHit(style, stats, expectedBonuses);
  const accuracyFactor = nhClientStyleAccuracyFactor(style, expectedBonuses);
  const tankFactor = nhClientStyleTankFactor(context, expectedBonuses);
  const statFactor = nhClientStyleStatFactor(style, stats);
  // Source: NhStakerBot.clientOffenceEv() multiplies selected gear bonuses,
  // defender weakness, protection prayer, stat state, accuracy, and tank value.
  return (baseHit / 42) * defenceFactor * prayerFactor * statFactor * accuracyFactor * tankFactor;
}

export function nhStyleInOffensiveRange(context: NhDuelControllerContext, style: NhOffenceStyle): boolean {
  if (context.opponent.observedInfoKnown === false) {
    return false;
  }
  if (style === "melee") {
    return context.meleeReachable;
  }
  if (!samePlane(context.self.tile, context.opponent.tile)) {
    return false;
  }
  const distance = chebyshevDistance(context.self.tile, context.opponent.tile);
  return distance > 0 && distance <= clientThreatRange;
}

export function nhCombatStyleForOffence(style: NhOffenceStyle): CombatStyle {
  return style === "melee" ? "slash" : style;
}

export function nhCandidateVisibleStyleForOffence(style: NhOffenceStyle): NhCandidateVisibleStyle {
  return style === "melee" ? "slash" : style;
}

export function nhCandidateEquipmentForStyle(actor: NhDuelActorState, style: NhOffenceStyle): VisibleEquipment {
  const candidateStyle = nhCandidateVisibleStyleForOffence(style);
  const baseEquipment =
    actor.candidateEquipmentByStyle?.[candidateStyle] ?? nhLoadouts[candidateLoadoutForVisibleStyle[candidateStyle]].equipment;
  if (actor.strippedEquipmentSlots.length === 0) {
    return baseEquipment;
  }

  const equipment: Partial<Record<EquipmentSlot, VisibleEquipmentItem>> = { ...baseEquipment };
  for (const slot of actor.strippedEquipmentSlots) {
    delete equipment[slot];
  }
  return equipment;
}

export function nhWeaknessForStyle(bonuses: BonusTable, style: NhOffenceStyle): number {
  if (style === "magic") {
    return nhWeaknessFromDefenceBonus(bonuses.magic_defence_bonus);
  }
  if (style === "ranged") {
    return nhWeaknessFromDefenceBonus(bonuses.range_defence_bonus);
  }
  return nhWeaknessFromDefenceBonus(bonuses.slash_defence_bonus);
}

export function nhDefenceScoreAgainstThreat(style: NhOffenceStyle | null, bonuses: BonusTable): number {
  if (style === null) {
    return 0;
  }
  if (style === "magic") {
    return bonuses.magic_defence_bonus;
  }
  if (style === "ranged") {
    return bonuses.range_defence_bonus;
  }
  return Math.max(bonuses.stab_defence_bonus, bonuses.slash_defence_bonus, bonuses.crush_defence_bonus);
}

function nhClientStyleBaseHit(style: NhOffenceStyle, stats: SimStats, bonuses: BonusTable): number {
  if (style === "magic") {
    const base = stats.magic.current >= 94 ? 31 : stats.magic.current >= 82 ? 26 : 3;
    return base * (1 + bonuses.magic_damage_bonus / 100);
  }
  if (style === "ranged") {
    return nhCombatUtilsStyleMaxDamage(stats.ranged.current, offensivePrayerBoost, bonuses.ranged_strength_bonus);
  }
  return nhCombatUtilsStyleMaxDamage(stats.strength.current, offensivePrayerBoost, bonuses.melee_strength_bonus);
}

function nhCombatUtilsStyleMaxDamage(level: number, prayerBoost: number, strengthBonus: number): number {
  const effectiveStrength = Math.ceil(level * (1 + prayerBoost));
  return Math.max(0, 1.3 + effectiveStrength / 10 + strengthBonus / 80 + (effectiveStrength * strengthBonus) / 640);
}

function nhClientStyleAccuracyFactor(style: NhOffenceStyle, bonuses: BonusTable): number {
  const attackBonus =
    style === "magic"
      ? bonuses.magic_attack_bonus
      : style === "ranged"
        ? bonuses.range_attack_bonus
        : Math.max(bonuses.stab_attack_bonus, bonuses.slash_attack_bonus, bonuses.crush_attack_bonus);
  return nhClampEvFactor((attackBonus + 64) / 135);
}

function nhClientStyleTankFactor(context: NhDuelControllerContext, expectedBonuses: BonusTable): number {
  // Source: NhStakerBot.resolveThreatStyle() uses delayed likely style first,
  // then delayed visible gear style when likely attack style is unknown.
  const threatStyle = context.opponent.lastOffenceStyle ?? context.opponent.lastVisibleOpponentStyle;
  const defence = nhDefenceScoreAgainstThreat(threatStyle, expectedBonuses);
  return Math.max(0.88, Math.min(1.12, 1 + defence / 900));
}

function nhClientStyleStatFactor(style: NhOffenceStyle, stats: SimStats): number {
  if (style === "magic") {
    if (stats.magic.current < 82) {
      return 0.1;
    }
    const magicRatio = nhLevelRatioForEv(stats.magic.current, stats.magic.fixed);
    return nhClampEvFactor((stats.magic.current >= 94 ? 1 : 26 / 31) * (0.56 + 0.44 * Math.min(1, magicRatio)));
  }
  if (style === "ranged") {
    return nhClampEvFactor(0.38 + 0.62 * nhLevelRatioForEv(stats.ranged.current, stats.ranged.fixed));
  }
  const attackRatio = nhLevelRatioForEv(stats.attack.current, stats.attack.fixed);
  const strengthRatio = nhLevelRatioForEv(stats.strength.current, stats.strength.fixed);
  return nhClampEvFactor((0.42 + 0.58 * attackRatio) * (0.48 + 0.52 * strengthRatio));
}

function nhLevelRatioForEv(currentLevel: number, fixedLevel: number): number {
  if (fixedLevel <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1.25, currentLevel / fixedLevel));
}

function nhWeaknessFromDefenceBonus(defenceBonus: number): number {
  return -Math.max(-1, Math.min(1, (defenceBonus - 70) / 140));
}

function nhClamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function nhClampEvFactor(value: number): number {
  return Math.max(0.1, Math.min(1.22, value));
}
