import type { NormalizedFixture, NormalizedPlayer, PlayerSeasonHistory, Position } from "../types/normalized";
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

/** A season's price as one figure: the middle of its start and end price, so a range (£5.0m–£5.6m) compares as £5.3m. Null if either end is unknown. */
export function seasonMidPrice(s: Pick<PlayerSeasonHistory, "startCost" | "endCost">): number | null {
  return s.startCost !== null && s.endCost !== null ? (s.startCost + s.endCost) / 2 : null;
}

/**
 * Every player's mid-season price for each completed season on record,
 * across all positions, counting only seasons at or above `minMinutes` —
 * the Points History table's Price comparison pool. Built from current
 * players' full histories, so a past season's pool is the players still in
 * FPL today who played it. `excludePlayerId` (the player being compared)
 * is left out, so the caller adds the figure it shows (seasonPricePercentile).
 */
export function seasonPricePools(allTimeSeasonsByPlayerId: Map<number, PlayerSeasonHistory[]>, minMinutes: number, excludePlayerId: number | null): Map<string, number[]> {
  const pools = new Map<string, number[]>();
  for (const [playerId, seasons] of allTimeSeasonsByPlayerId) {
    if (playerId === excludePlayerId) continue;
    for (const s of seasons) {
      const price = seasonMidPrice(s);
      if (price === null || s.minutes < minMinutes) continue;
      const pool = pools.get(s.seasonName) ?? [];
      pool.push(price);
      pools.set(s.seasonName, pool);
    }
  }
  return pools;
}

/** Where `price` ranks among `othersPool` plus itself; lower is better, so 100 is the cheapest. Null with no one else to compare with. */
export function seasonPricePercentile(price: number | null, othersPool: number[] | undefined): number | null {
  if (price === null || !othersPool) return null;
  const raw = percentileInPool(price, [...othersPool, price]);
  return raw === null ? null : 100 - raw;
}
