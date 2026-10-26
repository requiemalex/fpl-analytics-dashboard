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
  { key: "ictIndex", label: "ICT Index", group: "Advanced", decimals: 0, getValue: (s) => s.ictIndex },
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

/** What a trend graph needs to name and format its figure — an FPL TrendMetric, or a second source's. */
export type TrendDisplay = Pick<TrendMetric, "label" | "decimals" | "price">;

export function trendMetricByKey(key: string): TrendMetric | undefined {
  return TREND_METRICS.find((m) => m.key === key);
}

/** One season's figure for a trend line — null (a gap, not a 0) when the season has no value. */
export function trendValue(metric: Pick<TrendMetric, "getValue">, season: PlayerSeasonHistory): number | null {
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


/** Key set on a season where a player has no FPL record at all — not at a Premier League club that season (absent otherwise). */
export function trendAwayKey(playerId: number): string {
  return `away_${playerId}`;
}

/** Key set on a season FPL has for a player but in which he played 0 minutes: nothing to show (<no_minutes_no_figures>), so a gap (absent otherwise). */
export function trendUnplayedKey(playerId: number): string {
  return `unplayed_${playerId}`;
}

/** Recharts dataKey for a player's dotted bridge across a spell out of FPL, or of 0-minute seasons, between two of his seasons. */
export function trendBridgeKey(playerId: number): string {
  return `bridge_${playerId}`;
}

export interface SeasonTrendRow {
  seasonName: string;
  [dataKey: string]: string | number | boolean | null;
}

/** "2019/20" → "2020/21" (null for a name not in that form). */
function nextSeasonName(seasonName: string): string | null {
  const m = /^(\d{4})\/\d{2}$/.exec(seasonName);
  if (!m) return null;
  const start = Number(m[1]) + 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The most season labels (short form, "25/26") a trend card's axis fits at laptop width. */
const MAX_SEASON_TICKS = 12;

/**
 * The seasons a trend's x axis names: all of them when they fit, otherwise
 * every k-th counted back from the latest, so the labels are evenly spaced
 * and the latest season is always named. Left to Recharts, it dropped
 * whichever label crowded the last one: 2024/25 went unnamed beside
 * 2025/26 while empty seasons kept theirs (audit 2026-10-24).
 */
export function seasonAxisTicks(seasonNames: string[], max = MAX_SEASON_TICKS): string[] {
  const step = Math.max(1, Math.ceil(seasonNames.length / max));
  return seasonNames.filter((_, i) => (seasonNames.length - 1 - i) % step === 0);
}

/** Every season from the first name to the last, so a season nobody has still takes its place on the axis. */
function seasonRange(names: string[]): string[] {
  const sorted = [...names].sort();
  if (sorted.length === 0) return [];
  const last = sorted[sorted.length - 1];
  const out = [sorted[0]];
  while (out[out.length - 1] < last) {
    const next = nextSeasonName(out[out.length - 1]);
    if (!next || next > last) return sorted; // unexpected names: just the ones on record
    out.push(next);
  }
  return out;
}

/**
 * One row per season from the earliest any of the players has on record to
 * the latest, oldest first — a season none of them has still gets its row,
 * so two seasons either side of it are never drawn as back to back. Each
 * player's figure for `metric` is null (a gap) where he has no season or no
 * value. A season with fewer than `minMinutes` still plots his real figure,
 * and its minutes are kept under trendBelowKey so the card can mark it (the
 * amber small-sample stopwatch) and say why; seasons either side plot as
 * normal. A season he has no FPL record for is marked under trendAwayKey,
 * and one he has with 0 minutes is a gap marked under trendUnplayedKey
 * (<no_minutes_no_figures>: FPL's 0 points for a season on loan abroad is
 * nothing to show, never a 0 on the line). Where a run of such seasons
 * sits between two of his seasons that both have a figure, trendBridgeKey
 * holds a straight line between them (those two figures at the ends,
 * evenly stepped across the spell) for the dotted bridge. No windowing —
 * this is about a whole career's shape.
 */
export function buildSeasonTrend(
  playerIds: number[],
  metric: Pick<TrendMetric, "getValue">,
  allTimeSeasonsByPlayerId: Map<number, PlayerSeasonHistory[]>,
  minMinutes: number,
  /** A second source's figure for one of his seasons, in place of `metric`'s (null: a gap). The seasons and their minutes stay FPL's. */
  seasonValue?: (playerId: number, season: PlayerSeasonHistory) => number | null,
): SeasonTrendRow[] {
  const seasonNames = new Set<string>();
  for (const id of playerIds) for (const s of allTimeSeasonsByPlayerId.get(id) ?? []) seasonNames.add(s.seasonName);
  const rows = seasonRange(Array.from(seasonNames)).map((seasonName) => {
    const row: SeasonTrendRow = { seasonName };
    for (const id of playerIds) {
      const season = allTimeSeasonsByPlayerId.get(id)?.find((s) => s.seasonName === seasonName);
      const played = season !== undefined && season.minutes > 0;
      row[trendDataKey(id)] = played ? (seasonValue ? seasonValue(id, season) : trendValue(metric, season)) : null;
      if (!season) row[trendAwayKey(id)] = true;
      else if (!played) row[trendUnplayedKey(id)] = true;
      // A season he didn't play is under any minimum too (<no_data_is_zero>): marked, with no figure.
      if (season && season.minutes < minMinutes) row[trendBelowKey(id)] = season.minutes;
    }
    return row;
  });
  for (const id of playerIds) addBridges(rows, id);
  return rows;
}

/** Fill trendBridgeKey across each run of away or 0-minute seasons with one of his seasons either side, both with a figure. */
function addBridges(rows: SeasonTrendRow[], id: number): void {
  const away = (i: number) => rows[i][trendAwayKey(id)] === true || rows[i][trendUnplayedKey(id)] === true;
  let i = 0;
  while (i < rows.length) {
    if (!away(i)) {
      i++;
      continue;
    }
    let end = i;
    while (end < rows.length && away(end)) end++;
    const before = rows[i - 1]?.[trendDataKey(id)];
    const after = rows[end]?.[trendDataKey(id)];
    if (typeof before === "number" && typeof after === "number") {
      const steps = end - (i - 1);
      for (let k = i - 1; k <= end; k++) rows[k][trendBridgeKey(id)] = before + ((after - before) * (k - (i - 1))) / steps;
    }
    i = end;
  }
}
