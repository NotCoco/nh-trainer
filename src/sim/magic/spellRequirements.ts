export const kronosMagicSpellLevelRequirementById = {
  "blood-blitz": 80,
  "ice-blitz": 82,
  "blood-barrage": 92,
  "ice-barrage": 94
} as const satisfies Readonly<Record<string, number>>;

export type KronosLevelGatedMagicSpellId = keyof typeof kronosMagicSpellLevelRequirementById;

export function kronosMagicSpellLevelRequirement(spellId: string | null | undefined): number | null {
  if (!spellId) {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(kronosMagicSpellLevelRequirementById, spellId)
    ? kronosMagicSpellLevelRequirementById[spellId as KronosLevelGatedMagicSpellId]
    : null;
}

export function kronosMagicSpellCurrentLevelCanCast(
  spellId: string | null | undefined,
  currentMagicLevel: number
): boolean {
  // Source: TargetSpell.cast -> Stats.check(StatType.Magic, lvlReq, "cast this spell") uses currentLevel.
  const requirement = kronosMagicSpellLevelRequirement(spellId);
  return requirement === null || currentMagicLevel >= requirement;
}

export function kronosMagicSpellLevelFilterAllows(
  spellId: string | null | undefined,
  currentMagicLevel: number,
  fixedMagicLevel: number
): boolean {
  // Source: script2619 hides lack-level spells only when both stat_base(magic) and stat(magic) are below spell_levelreq.
  const requirement = kronosMagicSpellLevelRequirement(spellId);
  return requirement === null || fixedMagicLevel >= requirement || currentMagicLevel >= requirement;
}

export function kronosMagicSpellLowLevelMessage(requiredMagicLevel: number): string {
  return `You need Magic level of ${requiredMagicLevel} or higher to cast this spell.`;
}
