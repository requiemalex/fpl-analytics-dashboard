import type { NormalizedFixture } from "../types/normalized";

/** A finished FPL match Understat still lacks after this long makes the Understat headers say so. */
export const BEHIND_DAYS = 2;

/**
 * How many finished FPL matches, at least BEHIND_DAYS old, Understat's
 * figures don't include yet. Judged from FPL's own fixtures as well as from
 * what the last successful sync recorded (`missingFixtures`): a sync that
 * keeps failing writes nothing, so its record would never age and the
 * headers would never say Understat is behind (audit 2026-10-18 M18).
 */
export function understatMatchesBehind(
  fixtures: Pick<NormalizedFixture, "finished" | "kickoffTime">[],
  latestMatchDate: string | null,
  missingFixtures: Record<string, string>,
  now: number,
): number {
  const daysSince = (iso: string) => (now - Date.parse(iso)) / 86_400_000;
  const byFixtures = fixtures.filter(
    (f) => f.finished && f.kickoffTime !== null && daysSince(f.kickoffTime) >= BEHIND_DAYS && (latestMatchDate === null || f.kickoffTime.slice(0, 10) > latestMatchDate),
  ).length;
  const bySync = Object.values(missingFixtures).filter((since) => daysSince(since) >= BEHIND_DAYS).length;
  return Math.max(byFixtures, bySync);
}
