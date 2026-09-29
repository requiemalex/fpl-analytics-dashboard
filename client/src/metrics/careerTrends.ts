import type { PlayerSeasonHistory } from "../types/normalized";
import { estimatedPointsPerGame, perGame } from "./calculations";

export type TrendMetricGroup = "Output" | "Underlying" | "Playing Time" | "Advanced" | "Price";

export const TREND_METRIC_GROUP_ORDER: TrendMetricGroup[] = ["Output", "Underlying", "Playing Time", "Advanced", "Price"];

export interface TrendMetric {
  key: string;
  label: string;
  group: TrendMetricGroup;
  decimals: number;
  /** Shown as a price (£x.xm) rather than a plain number. */
  price?: boolean;
  getValue: (s: PlayerSeasonHistory) => number | null;
}

/**
 * What a Player Comparison trend graph can put on its y axis, season by
 * season (time is always the x axis). Every figure is the season's own
 * total from history_past, or a per-game rate built from those totals the
 * same way as everywhere else (`estimatedGames` from total minutes — see
 * metrics/calculations.ts), never an average of per-gameweek values.
 */
export const TREND_METRICS: TrendMetric[] = [
  { key: "totalPoints", label: "Points", group: "Output", decimals: 0, getValue: (s) => s.totalPoints },
  { key: "pointsPerGame", label: "Points per Game", group: "Output", decimals: 1, getValue: (s) => estimatedPointsPerGame(s.totalPoints, s.minutes) },
  { key: "goals", label: "Goals", group: "Output", decimals: 0, getValue: (s) => s.goals },
  { key: "assists", label: "Assists", group: "Output", decimals: 0, getValue: (s) => s.assists },
  { key: "cleanSheets", label: "Clean Sheets", group: "Output", decimals: 0, getValue: (s) => s.cleanSheets },
  { key: "bonus", label: "Bonus", group: "Output", decimals: 0, getValue: (s) => s.bonus },
  { key: "xG", label: "xG", group: "Underlying", decimals: 2, getValue: (s) => s.xG },
  { key: "xA", label: "xA", group: "Underlying", decimals: 2, getValue: (s) => s.xA },
  { key: "xGI", label: "xGI", group: "Underlying", decimals: 2, getValue: (s) => s.xGI },
  { key: "xGPerGame", label: "xG per Game", group: "Underlying", decimals: 2, getValue: (s) => perGame(s.xG, s.minutes) },
  { key: "xAPerGame", label: "xA per Game", group: "Underlying", decimals: 2, getValue: (s) => perGame(s.xA, s.minutes) },
  { key: "xGIPerGame", label: "xGI per Game", group: "Underlying", decimals: 2, getValue: (s) => perGame(s.xGI, s.minutes) },
  { key: "minutes", label: "Minutes", group: "Playing Time", decimals: 0, getValue: (s) => s.minutes },
  { key: "starts", label: "Starts", group: "Playing Time", decimals: 0, getValue: (s) => s.starts },
  { key: "bps", label: "BPS", group: "Advanced", decimals: 0, getValue: (s) => s.bps },
  { key: "ictIndex", label: "ICT Index", group: "Advanced", decimals: 1, getValue: (s) => s.ictIndex },
  { key: "defensiveContribution", label: "Defensive Contributions", group: "Advanced", decimals: 0, getValue: (s) => s.defensiveContribution },
  {
    key: "defensiveContributionPerGame",
    label: "DC per Game",
    group: "Advanced",
    decimals: 2,
    getValue: (s) => perGame(s.defensiveContribution, s.minutes),
  },
  { key: "endCost", label: "Price (Season End)", group: "Price", decimals: 1, price: true, getValue: (s) => s.endCost },
];

export function trendMetricByKey(key: string): TrendMetric | undefined {
  return TREND_METRICS.find((m) => m.key === key);
}

/** One season's figure for a trend line — null (a gap, not a 0) when the season has no value. */
export function trendValue(metric: TrendMetric, season: PlayerSeasonHistory): number | null {
  const v = metric.getValue(season);
  return v !== null && Number.isFinite(v) ? v : null;
}

/** Recharts dataKey for one player's line. */
export function trendDataKey(playerId: number): string {
  return `p${playerId}`;
}

/** Key holding a player's minutes for a season that was under the card's minimum (absent otherwise). */
export function trendBelowKey(playerId: number): string {
  return `below_${playerId}`;
}


export interface SeasonTrendRow {
  seasonName: string;
  [dataKey: string]: string | number | null;
}

/**
 * One row per completed season any of the players has on record, oldest
 * first, with each player's figure for `metric` (null — a gap — where he
 * has no season or no value). A season with fewer than `minMinutes` still
 * plots his real figure, and its minutes are kept under trendBelowKey so the
 * card can mark it (an amber ring) and say why; seasons either side plot as
 * normal. No windowing — this is about a whole career's shape.
 */
export function buildSeasonTrend(
  playerIds: number[],
  metric: TrendMetric,
  allTimeSeasonsByPlayerId: Map<number, PlayerSeasonHistory[]>,
  minMinutes: number,
): SeasonTrendRow[] {
  const seasonNames = new Set<string>();
  for (const id of playerIds) for (const s of allTimeSeasonsByPlayerId.get(id) ?? []) seasonNames.add(s.seasonName);
  return Array.from(seasonNames)
    .sort()
    .map((seasonName) => {
      const row: SeasonTrendRow = { seasonName };
      for (const id of playerIds) {
        const season = allTimeSeasonsByPlayerId.get(id)?.find((s) => s.seasonName === seasonName);
        row[trendDataKey(id)] = season ? trendValue(metric, season) : null;
        if (season && season.minutes < minMinutes) row[trendBelowKey(id)] = season.minutes;
      }
      return row;
    });
}
