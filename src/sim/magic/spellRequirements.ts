export const nhMagicSpellLevelRequirementById = {
  "blood-blitz": 80,
  "ice-blitz": 82,
  "blood-barrage": 92,
  "ice-barrage": 94
} as const satisfies Readonly<Record<string, number>>;

export type NhLevelGatedMagicSpellId = keyof typeof nhMagicSpellLevelRequirementById;

export function nhMagicSpellLevelRequirement(spellId: string | null | undefined): number | null {
  if (!spellId) {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(nhMagicSpellLevelRequirementById, spellId)
    ? nhMagicSpellLevelRequirementById[spellId as NhLevelGatedMagicSpellId]
    : null;
}

export function nhMagicSpellCurrentLevelCanCast(
  spellId: string | null | undefined,
  currentMagicLevel: number
): boolean {
  // Source: TargetSpell.cast -> Stats.check(StatType.Magic, lvlReq, "cast this spell") uses currentLevel.
  const requirement = nhMagicSpellLevelRequirement(spellId);
  return requirement === null || currentMagicLevel >= requirement;
}

export function nhMagicSpellLevelFilterAllows(
  spellId: string | null | undefined,
  currentMagicLevel: number,
  fixedMagicLevel: number
): boolean {
  // Source: script2619 hides lack-level spells only when both stat_base(magic) and stat(magic) are below spell_levelreq.
  const requirement = nhMagicSpellLevelRequirement(spellId);
  return requirement === null || fixedMagicLevel >= requirement || currentMagicLevel >= requirement;
}

export function nhMagicSpellLowLevelMessage(requiredMagicLevel: number): string {
  return `You need Magic level of ${requiredMagicLevel} or higher to cast this spell.`;
}
