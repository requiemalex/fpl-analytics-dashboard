import type { PlayerSeasonHistory } from "../types/normalized";

export interface PlayerTrendPoint {
  seasonName: string;
  totalPoints: number;
  minutes: number;
  goals: number;
  assists: number;
  xG: number | null;
  xA: number | null;
  xGI: number | null;
}

/**
 * Straight season-by-season figures for one player, oldest first — no
 * windowing, no qualifying-minutes filter, unlike historicProfiles
 * elsewhere in this app. This chart is explicitly about seeing a whole
 * career's shape, including a quiet or injury-hit season; filtering those
 * out would hide exactly the dips a trend line is for.
 */
export function buildPlayerTrend(seasons: PlayerSeasonHistory[]): PlayerTrendPoint[] {
  return seasons.map((s) => ({
    seasonName: s.seasonName,
    totalPoints: s.totalPoints,
    minutes: s.minutes,
    goals: s.goals,
    assists: s.assists,
    xG: s.xG,
    xA: s.xA,
    xGI: s.xGI,
  }));
}

export type TrendMetricKey = keyof Omit<PlayerTrendPoint, "seasonName">;

/** Recharts dataKey for one player+metric line within a multi-metric trend chart. */
export function playerMetricTrendDataKey(playerId: number, metric: TrendMetricKey): string {
  return `pm_${playerId}_${metric}`;
}

export interface MultiSeriesTrendPoint {
  seasonName: string;
  [dataKey: string]: string | number | null;
}

/**
 * Like buildMultiPlayerTrend, but for one or more METRICS at once (each
 * player × metric pair becomes its own line) rather than a single metric
 * across players. When `normalize` is on, each metric is independently
 * min-max scaled to 0-100 across every value actually present for it (in
 * this selection, not some fixed absolute scale) — the same "relative to
 * what's currently shown" approach the rest of this app uses for
 * comparative colouring and percentiles. This is what makes overlaying,
 * say, Minutes (hundreds-to-thousands) against xG (low single digits) on
 * one axis mean anything: without it the smaller-scale metric would just
 * read as a flat line near zero. Normalizing is opt-in (not automatic)
 * because a single metric plotted in its own real units is the more
 * useful default when there's nothing else on the chart to reconcile it
 * against.
 */
export function buildMultiSeriesTrend(
  playerIds: number[],
  metrics: TrendMetricKey[],
  allTimeSeasonsByPlayerId: Map<number, PlayerSeasonHistory[]>,
  normalize: boolean,
): MultiSeriesTrendPoint[] {
  const trendsByPlayerId = new Map<number, PlayerTrendPoint[]>();
  const seasonNames = new Set<string>();
  for (const id of playerIds) {
    const trend = buildPlayerTrend(allTimeSeasonsByPlayerId.get(id) ?? []);
    trendsByPlayerId.set(id, trend);
    for (const point of trend) seasonNames.add(point.seasonName);
  }

  const rangeByMetric = new Map<TrendMetricKey, { min: number; max: number }>();
  if (normalize) {
    for (const metric of metrics) {
      const values: number[] = [];
      for (const id of playerIds) {
        for (const point of trendsByPlayerId.get(id) ?? []) {
          const v = point[metric];
          if (v !== null) values.push(v);
        }
      }
      if (values.length > 0) rangeByMetric.set(metric, { min: Math.min(...values), max: Math.max(...values) });
    }
  }

  return Array.from(seasonNames)
    .sort()
    .map((seasonName) => {
      const row: MultiSeriesTrendPoint = { seasonName };
      for (const id of playerIds) {
        const point = trendsByPlayerId.get(id)?.find((p) => p.seasonName === seasonName);
        for (const metric of metrics) {
          const raw = point ? point[metric] : null;
          if (!normalize || raw === null) {
            row[playerMetricTrendDataKey(id, metric)] = raw;
            continue;
          }
          const range = rangeByMetric.get(metric);
          row[playerMetricTrendDataKey(id, metric)] = range && range.max > range.min ? ((raw - range.min) / (range.max - range.min)) * 100 : 50;
        }
      }
      return row;
    });
}
