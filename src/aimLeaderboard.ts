export type AimLeaderboardScope = "recent" | "week" | "all";

export interface AimCompletedRun {
  readonly score: number;
  readonly misses: number;
  readonly streak: number;
  readonly completedAtMs: number;
}

export interface AimLeaderboardEntry extends AimCompletedRun {
  readonly id: string;
  readonly name: string;
  readonly savedAtMs: number;
}

export interface AimLeaderboardSnapshot {
  readonly recent: readonly AimLeaderboardEntry[];
  readonly week: readonly AimLeaderboardEntry[];
  readonly all: readonly AimLeaderboardEntry[];
}

export const aimLeaderboardStorageKey = "kronos-nh-aim-trainer-leaderboard";
export const aimPlayerNameStorageKey = "kronos-nh-aim-trainer-player-name";
export const aimLeaderboardMaxEntries = 80;
export const aimLeaderboardVisibleEntries = 8;
export const aimPlayerNameMaxLength = 18;
export const aimWeekMs = 7 * 24 * 60 * 60 * 1000;

export function createEmptyAimLeaderboardSnapshot(): AimLeaderboardSnapshot {
  return { recent: [], week: [], all: [] };
}

export function addAimLeaderboardEntry(
  snapshot: AimLeaderboardSnapshot,
  entry: AimLeaderboardEntry,
  nowMs = Date.now()
): AimLeaderboardSnapshot {
  const recent = normalizeAimLeaderboardEntries([entry, ...snapshot.recent]).slice(0, aimLeaderboardMaxEntries);
  const week = normalizeAimLeaderboardEntries([entry, ...snapshot.week])
    .filter((candidate) => nowMs - candidate.savedAtMs <= aimWeekMs)
    .sort(aimLeaderboardBestSort)
    .slice(0, aimLeaderboardMaxEntries);
  const all = [...normalizeAimLeaderboardEntries([entry, ...snapshot.all])]
    .sort(aimLeaderboardBestSort)
    .slice(0, aimLeaderboardMaxEntries);
  return { recent, week, all };
}

export function normalizeAimLeaderboardSnapshot(value: unknown, nowMs = Date.now()): AimLeaderboardSnapshot {
  if (Array.isArray(value)) {
    return createAimLeaderboardSnapshotFromEntries(normalizeAimLeaderboardEntries(value), nowMs);
  }
  if (typeof value !== "object" || value === null) {
    return createEmptyAimLeaderboardSnapshot();
  }
  const candidate = value as Partial<{
    readonly recent: unknown;
    readonly week: unknown;
    readonly all: unknown;
  }>;
  const recent = normalizeAimLeaderboardEntries(Array.isArray(candidate.recent) ? candidate.recent : []);
  const week = normalizeAimLeaderboardEntries(Array.isArray(candidate.week) ? candidate.week : [])
    .filter((entry) => nowMs - entry.savedAtMs <= aimWeekMs)
    .sort(aimLeaderboardBestSort)
    .slice(0, aimLeaderboardMaxEntries);
  const all = [...normalizeAimLeaderboardEntries(Array.isArray(candidate.all) ? candidate.all : [])]
    .sort(aimLeaderboardBestSort)
    .slice(0, aimLeaderboardMaxEntries);
  return { recent, week, all };
}

export function createAimLeaderboardSnapshotFromEntries(
  entries: readonly unknown[],
  nowMs = Date.now()
): AimLeaderboardSnapshot {
  const normalizedEntries = normalizeAimLeaderboardEntries(entries);
  return {
    recent: normalizedEntries.slice(0, aimLeaderboardMaxEntries),
    week: normalizedEntries
      .filter((entry) => nowMs - entry.savedAtMs <= aimWeekMs)
      .sort(aimLeaderboardBestSort)
      .slice(0, aimLeaderboardMaxEntries),
    all: [...normalizedEntries].sort(aimLeaderboardBestSort).slice(0, aimLeaderboardMaxEntries)
  };
}

export function normalizeAimLeaderboardEntries(entries: readonly unknown[]): readonly AimLeaderboardEntry[] {
  const uniqueEntries = new Map<string, AimLeaderboardEntry>();
  for (const entry of entries) {
    if (isAimLeaderboardEntry(entry)) {
      uniqueEntries.set(entry.id, {
        ...entry,
        name: normalizeAimPlayerName(entry.name),
        score: Math.trunc(entry.score),
        misses: Math.trunc(entry.misses),
        streak: Math.trunc(entry.streak),
        completedAtMs: Math.trunc(entry.completedAtMs),
        savedAtMs: Math.trunc(entry.savedAtMs)
      });
    }
  }
  return [...uniqueEntries.values()].sort((left, right) => right.savedAtMs - left.savedAtMs);
}

export function isAimLeaderboardEntry(entry: unknown): entry is AimLeaderboardEntry {
  if (typeof entry !== "object" || entry === null) {
    return false;
  }
  const candidate = entry as Partial<AimLeaderboardEntry>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.name === "string" &&
    typeof candidate.score === "number" &&
    Number.isFinite(candidate.score) &&
    candidate.score >= 0 &&
    candidate.score <= 1000 &&
    typeof candidate.misses === "number" &&
    Number.isFinite(candidate.misses) &&
    candidate.misses >= 0 &&
    candidate.misses <= 1000 &&
    typeof candidate.streak === "number" &&
    Number.isFinite(candidate.streak) &&
    candidate.streak >= 0 &&
    candidate.streak <= 1000 &&
    typeof candidate.completedAtMs === "number" &&
    Number.isFinite(candidate.completedAtMs) &&
    typeof candidate.savedAtMs === "number" &&
    Number.isFinite(candidate.savedAtMs)
  );
}

export function aimLeaderboardRows(
  snapshot: AimLeaderboardSnapshot,
  scope: AimLeaderboardScope
): readonly AimLeaderboardEntry[] {
  return snapshot[scope].slice(0, aimLeaderboardVisibleEntries);
}

export function cleanAimPlayerNameInput(value: string): string {
  return value.replace(/[\x00-\x1f\x7f]/g, "").slice(0, aimPlayerNameMaxLength);
}

export function normalizeAimPlayerName(value: string): string {
  const name = cleanAimPlayerNameInput(value).replace(/\s+/g, " ").trim();
  return name.length > 0 ? name : "Anonymous";
}

export function aimLeaderboardEntryId(): string {
  return `${Date.now().toString(36)}-${Math.trunc(Math.random() * 1_000_000).toString(36)}`;
}

export function formatAimLeaderboardDate(savedAtMs: number): string {
  const elapsedMs = Math.max(0, Date.now() - savedAtMs);
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) {
    return "now";
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h`;
  }
  return `${Math.floor(elapsedHours / 24)}d`;
}

function aimLeaderboardBestSort(left: AimLeaderboardEntry, right: AimLeaderboardEntry): number {
  return right.score - left.score || left.misses - right.misses || right.streak - left.streak || right.savedAtMs - left.savedAtMs;
}
