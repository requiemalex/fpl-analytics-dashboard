import type { NormalizedPlayer, Position } from "../types/normalized";
import type { PlayerDerivedMetrics } from "./playerMetrics";
import { PLAYER_COLUMNS, isStaticColumn, type ColumnGroup } from "../components/playerColumns";

/** Section names for Player Comparison's metric pickers and Outputs panels. */
export const COMPARISON_GROUP_LABELS: Record<ColumnGroup, string> = {
  "ACTUAL OUTPUT": "Output",
  "UNDERLYING PERFORMANCE": "Underlying",
  VALUE: "Value",
  ADVANCED: "Advanced",
};

export const COMPARISON_GROUP_ORDER: ColumnGroup[] = ["ACTUAL OUTPUT", "UNDERLYING PERFORMANCE", "VALUE", "ADVANCED"];

/** Fuller names than Player Explorer's column headers — a radar axis or an Outputs row has room for them. */
const LABELS: Record<string, string> = {
  pointsPerGame: "Points per Game",
  cleanSheets: "Clean Sheets",
  pointsPerMillion: "Points per £m",
  xGPerMillion: "xG per £m",
  xAPerMillion: "xA per £m",
  xGIPerMillion: "xGI per £m",
  minutes: "Minutes",
  ictIndex: "ICT Index",
  defensiveContributions: "Def. Contributions",
};

export interface ComparisonMetric {
  key: string;
  label: string;
  group: ColumnGroup;
  higherIsBetter: boolean;
  format: (v: number | null) => string;
  getValue: (p: NormalizedPlayer, d: PlayerDerivedMetrics) => number | null;
}

/**
 * What a radar chart or Outputs panel can show: every Player Explorer
 * column whose value follows the Data View. Price and ownership are left
 * out — they're always today's figure, and every player tag on the page
 * already shows both.
 */
export const COMPARISON_METRICS: ComparisonMetric[] = PLAYER_COLUMNS.filter((c) => !isStaticColumn(c)).map((c) => ({
  key: c.key,
  label: LABELS[c.key] ?? c.label,
  group: c.group,
  higherIsBetter: c.higherIsBetter !== false,
  format: c.format,
  getValue: c.getValue,
}));

export function comparisonMetricByKey(key: string): ComparisonMetric | undefined {
  return COMPARISON_METRICS.find((m) => m.key === key);
}

/** Radar charts need at least a triangle to have a shape, and more than eight axes stop being readable. */
export const RADAR_MIN_METRICS = 3;
export const RADAR_MAX_METRICS = 8;
export const OUTPUTS_MAX_METRICS = 12;

/**
 * Each target player's percentile within his own position for `metric`,
 * flipped for a lower-is-better metric so a higher percentile always means
 * better. The same figure computePositionPercentiles (metrics/percentiles.ts)
 * gives — the pool is the whole mode-resolved population at or above
 * `minMinutes` with a value (<percentile_population>) — but only the
 * targets' positions are ranked, since this runs for a handful of players.
 * Null for a target under the floor or without a value.
 */
export function comparisonPercentiles(
  metric: ComparisonMetric,
  population: NormalizedPlayer[],
  derivedById: Map<number, PlayerDerivedMetrics>,
  targets: NormalizedPlayer[],
  minMinutes: number,
): Map<number, number | null> {
  const valueOf = (p: NormalizedPlayer): number | null => {
    const d = derivedById.get(p.id);
    return d ? metric.getValue(p, d) : null;
  };
  const eligible = (p: NormalizedPlayer) => p.minutes !== null && p.minutes >= minMinutes;
  const positions = new Set(targets.map((t) => t.position));
  const pools = new Map<Position, number[]>();
  for (const p of population) {
    if (!positions.has(p.position) || !eligible(p)) continue;
    const v = valueOf(p);
    if (v === null) continue;
    const pool = pools.get(p.position) ?? [];
    pool.push(v);
    pools.set(p.position, pool);
  }

  const result = new Map<number, number | null>();
  for (const t of targets) {
    const v = valueOf(t);
    const pool = pools.get(t.position);
    if (v === null || !eligible(t) || !pool || pool.length === 0) {
      result.set(t.id, null);
      continue;
    }
    let below = 0;
    let equal = 0;
    for (const other of pool) {
      if (other < v) below += 1;
      else if (other === v) equal += 1;
    }
    const percentile = pool.length <= 1 ? 100 : ((below + equal / 2) / pool.length) * 100;
    result.set(t.id, metric.higherIsBetter ? percentile : 100 - percentile);
  }
  return result;
}
