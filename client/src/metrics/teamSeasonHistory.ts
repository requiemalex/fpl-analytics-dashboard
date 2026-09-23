import { HISTORIC_WINDOW_SEASONS } from "./historicAnalysis";

function seasonStartYear(seasonName: string): number {
  return parseInt(seasonName.split("/")[0], 10);
}

/**
 * Same rolling window historicAnalysis.ts uses for a single player's own
 * Historic Average (HISTORIC_WINDOW_SEASONS, anchored to the most
 * recently COMPLETED season across the whole pool) — applied here to a
 * club's per-season totals (metrics/teamStats.ts' clubSeasonHistory), so
 * "Season average" means the same thing in both places: the last 4
 * completed seasons. A season the club wasn't in the Premier League has no
 * entry, so the average is over the seasons it was — never padded with a
 * zero, same <no_survivorship_bias> reasoning historicAnalysis.ts uses.
 */
export function computeClubSeasonWindow(seasons: { seasonName: string; totalPoints: number }[], referenceSeasonName: string | null): { inWindowNames: Set<string>; windowAverage: number | null } {
  if (!referenceSeasonName) return { inWindowNames: new Set(), windowAverage: null };
  const cutoffYear = seasonStartYear(referenceSeasonName) - (HISTORIC_WINDOW_SEASONS - 1);
  const inWindow = seasons.filter((s) => seasonStartYear(s.seasonName) >= cutoffYear);
  const inWindowNames = new Set(inWindow.map((s) => s.seasonName));
  const windowAverage = inWindow.length > 0 ? inWindow.reduce((acc, s) => acc + s.totalPoints, 0) / inWindow.length : null;
  return { inWindowNames, windowAverage };
}
