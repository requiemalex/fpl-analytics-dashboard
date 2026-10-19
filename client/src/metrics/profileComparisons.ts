import type { NormalizedFixture, NormalizedPlayer, Position } from "../types/normalized";
import { percentileInPool } from "./percentiles";

/**
 * Finished matches per club this season — a double gameweek is two. The
 * denominator for the rest of the pool's per-match figures in the player
 * profile's Live Data Average row, whose own figure is the total ÷ the
 * matches in his gameweek log.
 */
export function teamMatchesPlayed(fixtures: NormalizedFixture[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const f of fixtures) {
    if (!f.finished) continue;
    counts.set(f.homeTeamId, (counts.get(f.homeTeamId) ?? 0) + 1);
    counts.set(f.awayTeamId, (counts.get(f.awayTeamId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Where this player's per-match `average` (from his own gameweek log) ranks
 * against the rest of his position: everyone else at or above `minMinutes`,
 * each as their season total ÷ their club's finished matches. The player's
 * own entry in `population` is replaced by `average`, so the rank is of the
 * figure the table actually shows. Null (no colour) when there's no one to
 * compare with — e.g. the fixtures list failed to load.
 */
export function perMatchPositionPercentile(
  average: number | null,
  player: { id: number; position: Position },
  population: NormalizedPlayer[],
  total: (p: NormalizedPlayer) => number | null,
  matchesByTeam: Map<number, number>,
  minMinutes: number,
): number | null {
  if (average === null) return null;
  const pool = [average];
  for (const p of population) {
    if (p.id === player.id || p.position !== player.position) continue;
    if (p.minutes === null || p.minutes < minMinutes) continue;
    const matches = matchesByTeam.get(p.teamId);
    const value = total(p);
    if (!matches || value === null) continue;
    pool.push(value / matches);
  }
  return percentileInPool(average, pool);
}
