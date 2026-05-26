import type { VisibleEquipment } from "../clientView";
import {
  KRONOS_PVP_MAGIC_ACCURACY_MODIFIER,
  KRONOS_PVP_MELEE_ACCURACY_MODIFIER,
  aggregateBonuses,
  estimateStyleEv,
  type BonusTable,
  type CombatLevels,
  type CombatStyle,
  type StyleEvEstimate
} from "../combat/formulas";
import {
  activeProtectionPrayer,
  aggregatePrayerBoosts,
  protectPrayerForStyle,
  pvpProtectionDamageMultiplier,
  type PrayerId
} from "../prayer/prayers";

export interface EquipmentBonusRow {
  readonly id: number;
  readonly name: string;
  readonly equipSlot: number;
  readonly weaponType: string | null;
  readonly twoHanded: boolean;
  readonly bonuses: BonusTable;
}

export interface VisibleStyleEvInput {
  readonly equipmentRows: readonly EquipmentBonusRow[];
  readonly attackerEquipment: VisibleEquipment;
  readonly defenderEquipment: VisibleEquipment;
  readonly attackerLevels: CombatLevels;
  readonly defenderLevels: CombatLevels;
  readonly attackerPrayers?: readonly PrayerId[];
  readonly defenderPrayers?: readonly PrayerId[];
  readonly styles?: readonly CombatStyle[];
  readonly maxMagicDamage?: number;
}

const kronosMagicInterferenceSlots = ["body", "legs"] as const;

export function equipmentRowsByItemId(rows: readonly EquipmentBonusRow[]): ReadonlyMap<number, EquipmentBonusRow> {
  return new Map(rows.map((row) => [row.id, row]));
}

export function aggregateVisibleEquipmentBonuses(
  equipment: VisibleEquipment,
  equipmentRows: readonly EquipmentBonusRow[]
): BonusTable {
  const rowsById = equipmentRowsByItemId(equipmentRows);
  const equippedRows = Object.values(equipment)
    .map((item) => (item ? rowsById.get(item.itemId) : undefined))
    .filter((row): row is EquipmentBonusRow => row !== undefined);
  return aggregateBonuses(equippedRows);
}

export function estimateVisibleStyleEvs(input: VisibleStyleEvInput): readonly StyleEvEstimate[] {
  const attackerBonuses = aggregateVisibleEquipmentBonuses(input.attackerEquipment, input.equipmentRows);
  const defenderBonuses = aggregateVisibleEquipmentBonuses(input.defenderEquipment, input.equipmentRows);
  const attackerPrayer = aggregatePrayerBoosts(input.attackerPrayers ?? []);
  const defenderPrayer = aggregatePrayerBoosts(input.defenderPrayers ?? []);
  const defenderProtectionPrayer = activeProtectionPrayer(input.defenderPrayers ?? []);
  const styles = input.styles ?? (["magic", "ranged", "slash"] as const);
  const magicInterference = kronosVisibleMagicInterference(input.attackerEquipment, input.equipmentRows);

  return styles.map((style) => {
    const attackBoostMultiplier =
      style === "magic"
        ? (1 + attackerPrayer.magic) * Math.max(0, 1 - magicInterference)
        : style === "ranged"
          ? 1 + attackerPrayer.rangedAttack
          : 1 + attackerPrayer.attack;
    const strengthBoostMultiplier =
      style === "ranged" ? 1 + attackerPrayer.rangedStrength : style === "magic" ? 1 : 1 + attackerPrayer.strength;

    const estimate = estimateStyleEv({
      style,
      attackerLevels: input.attackerLevels,
      defenderLevels: input.defenderLevels,
      attackerBonuses,
      defenderBonuses,
      attackBoostMultiplier,
      strengthBoostMultiplier,
      accuracyModifier: kronosVisiblePvpAccuracyModifier(style),
      defenceBoostMultiplier: 1 + defenderPrayer.defence,
      magicDefenceBoostMultiplier: 1 + defenderPrayer.magic,
      maxMagicDamage: input.maxMagicDamage
    });

    if (defenderProtectionPrayer !== protectPrayerForStyle(style)) {
      return estimate;
    }

    // Source: PlayerCombat.postDefend() applies PvP protection before XP and Hit.finish().
    // Visible EV ranking needs the prayer-final damage expectation, while runtime rolls keep raw maxDamage.
    const protectedMaxDamage = Math.trunc(estimate.maxDamage * pvpProtectionDamageMultiplier);
    return {
      ...estimate,
      expectedDamage: estimate.hitChance * (protectedMaxDamage / 2)
    };
  });
}

export function strongestVisibleStyle(input: VisibleStyleEvInput): StyleEvEstimate | undefined {
  return [...estimateVisibleStyleEvs(input)].sort((left, right) => right.expectedDamage - left.expectedDamage)[0];
}

export function kronosVisibleMagicInterference(
  equipment: VisibleEquipment,
  equipmentRows: readonly EquipmentBonusRow[]
): number {
  const rowsById = equipmentRowsByItemId(equipmentRows);
  let interferenceCount = 0;
  for (const slot of kronosMagicInterferenceSlots) {
    const item = equipment[slot];
    const row = item ? rowsById.get(item.itemId) : undefined;
    if ((row?.bonuses.magic_attack_bonus ?? 0) < 0) {
      interferenceCount += 1;
    }
  }
  return interferenceCount * 0.45;
}

function kronosVisiblePvpAccuracyModifier(style: CombatStyle): number {
  if (style === "magic") {
    return KRONOS_PVP_MAGIC_ACCURACY_MODIFIER;
  }
  if (style === "stab" || style === "slash" || style === "crush") {
    return KRONOS_PVP_MELEE_ACCURACY_MODIFIER;
  }
  return 1;
}
