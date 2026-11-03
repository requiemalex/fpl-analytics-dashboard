import type { NormalizedPlayer, Position } from "../types/normalized";
import { isUnderMinimum } from "./fixedMinutesFloor";

/**
 * <one_rank_rule>: the one percentile formula every rank in the app uses
 * (the profile radar, Player Comparison, the Explorer's and Dashboard's
 * colours, the club pages). `below` and `equal` count the pool's values
 * under and equal to the figure; the pool must include it. Half of any
 * ties count as below. A pool of fewer than two has no rank — null: a
 * comparison with nobody isn't one, so nothing is coloured or drawn for
 * it. `higherIsBetter: false` flips it, so a higher rank is always better.
 */
export function percentileFromCounts(below: number, equal: number, poolSize: number, higherIsBetter = true): number | null {
  if (poolSize < 2) return null;
  const percentile = ((below + equal / 2) / poolSize) * 100;
  return higherIsBetter ? percentile : 100 - percentile;
}

/**
 * Where `value` ranks within `pool` (which must already include it), by
 * the one rank rule above. For any figure — a NormalizedPlayer field, a
 * per-match average, a past season's price, a club's total — so the caller
 * builds the pool it means.
 */
export function percentileInPool(value: number, pool: readonly number[], higherIsBetter = true): number | null {
  let below = 0;
  let equal = 0;
  for (const other of pool) {
    if (other < value) below += 1;
    else if (other === value) equal += 1;
  }
  return percentileFromCounts(below, equal, pool.length, higherIsBetter);
}

/** percentileInPool for a pool already sorted ascending — the same rank, found by binary search for a large pool ranked many times. */
export function percentileInSortedPool(value: number, sorted: readonly number[], higherIsBetter = true): number | null {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  const below = lo;
  hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return percentileFromCounts(below, lo - below, sorted.length, higherIsBetter);
}

/**
 * Position percentiles are calculated against the eligible player
 * population for that position — players meeting the current
 * minimum-minutes threshold (no data counts as 0 minutes), with the metric
 * itself non-null. Team, ownership, price and other display/scouting
 * filters do NOT change this reference population (<percentile_population>
 * rule) — callers must NOT pass an already-filtered-by-those-things player
 * list in here. Null for a player alone in his position's pool.
 */
export function computePositionPercentiles(
  allPlayers: NormalizedPlayer[],
  metricFn: (p: NormalizedPlayer) => number | null,
  minMinutesThreshold: number,
): Map<number, number | null> {
  const byPosition = new Map<Position, NormalizedPlayer[]>();
  for (const p of allPlayers) {
    if (isUnderMinimum(p.minutes, minMinutesThreshold)) continue;
    if (metricFn(p) === null) continue;
    const arr = byPosition.get(p.position) ?? [];
    arr.push(p);
    byPosition.set(p.position, arr);
  }

  const result = new Map<number, number | null>();
  for (const p of allPlayers) result.set(p.id, null);

  for (const [, players] of byPosition) {
    const values = players.map((p) => metricFn(p) as number);
    for (const p of players) result.set(p.id, percentileInPool(metricFn(p) as number, values));
  }

  return result;
}
