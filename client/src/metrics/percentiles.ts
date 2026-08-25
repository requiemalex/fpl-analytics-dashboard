import type { NormalizedPlayer, Position } from "../types/normalized";

export type PercentileBand = "excellent" | "good" | "average" | "poor";

export function bandForPercentile(percentile: number): PercentileBand {
  if (percentile >= 90) return "excellent";
  if (percentile >= 70) return "good";
  if (percentile >= 30) return "average";
  return "poor";
}

/**
 * Position percentiles are calculated against the eligible player
 * population for that position — players meeting the current
 * minimum-minutes threshold, with the metric itself non-null. Team,
 * ownership, price and other display/scouting filters do NOT change this
 * reference population (<percentile_population> rule) — callers must NOT
 * pass an already-filtered-by-those-things player list in here.
 */
export function computePositionPercentiles(
  allPlayers: NormalizedPlayer[],
  metricFn: (p: NormalizedPlayer) => number | null,
  minMinutesThreshold: number,
): Map<number, number | null> {
  const byPosition = new Map<Position, NormalizedPlayer[]>();
  for (const p of allPlayers) {
    if (p.minutes === null || p.minutes < minMinutesThreshold) continue;
    if (metricFn(p) === null) continue;
    const arr = byPosition.get(p.position) ?? [];
    arr.push(p);
    byPosition.set(p.position, arr);
  }

  const result = new Map<number, number | null>();
  for (const p of allPlayers) result.set(p.id, null);

  for (const [, players] of byPosition) {
    const values = players.map((p) => metricFn(p) as number).sort((a, b) => a - b);
    const n = values.length;
    for (const p of players) {
      const v = metricFn(p) as number;
      let below = 0;
      let equal = 0;
      for (const other of values) {
        if (other < v) below += 1;
        else if (other === v) equal += 1;
      }
      const percentile = n <= 1 ? 100 : ((below + equal / 2) / n) * 100;
      result.set(p.id, percentile);
    }
  }

  return result;
}
