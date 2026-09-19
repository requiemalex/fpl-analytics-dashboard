import type { NormalizedPlayer } from "../types/normalized";
import type { PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { PLAYER_COLUMNS } from "./playerColumns";
import { fmtDecimal, fmtSigned } from "../utils/format";

export type SummaryTileScope = "player" | "team";

/** Same shape Dashboard.tsx has always aggregated per team from the resolved player list — exported here so it's the one place both the tile catalogue and Dashboard.tsx agree on what a team stat actually is (a sum across that team's current squad, not FPL's own league-table `points`). */
export interface TeamAggregate {
  teamId: number;
  name: string;
  shortName: string;
  points: number | null;
  xGI: number | null;
  cleanSheets: number | null;
  goals: number | null;
  assists: number | null;
  bonus: number | null;
}

export interface PlayerTileMetric {
  key: string;
  label: string;
  getValue: (p: NormalizedPlayer, d: PlayerDerivedMetrics) => number | null;
  format: (v: number | null) => string;
  /** Used only to pick a sensible default sort direction when this metric is first selected in the Add Tile form. */
  higherIsBetter: boolean;
  /**
   * True for a metric divided by an estimate of games played (see
   * <per_game_not_per_90> in metrics/calculations.ts) — PPG, Goals/Game,
   * Assists/Game, DC/Game. Even with that estimated-games basis (rather
   * than the old, more easily-amplified per-90-minutes one), a genuinely
   * tiny sample can still read as a better rate than a player's normal
   * output. Dashboard.tsx uses this flag to apply a minimum-minutes floor
   * to exactly these metrics' Top-5 leaderboards (see RATE_STAT_MIN_MINUTES
   * there), leaving count-based and price-based metrics (Points, Goals,
   * Points/£m, etc.) — which aren't distorted by a small sample the same
   * way — ungated by anything beyond the page's own Min Minutes setting.
   */
  ratePerMinutes?: boolean;
}

/** See `PlayerTileMetric.ratePerMinutes` — the set of PLAYER_COLUMNS keys that need the flag, since those are spread in below rather than declared with it directly. */
const RATE_PER_MINUTES_COLUMN_KEYS = new Set(["pointsPerGame", "defensiveContributionsPerGame"]);

export interface TeamTileMetric {
  key: string;
  label: string;
  getValue: (t: TeamAggregate) => number | null;
  format: (v: number | null) => string;
  higherIsBetter: boolean;
}

const num = (decimals = 0) => (v: number | null) => fmtDecimal(v, decimals);

/**
 * Every PLAYER_COLUMNS metric (Points, Price, xG, Own% — the same catalogue
 * the tables use) plus a handful of derived comparison/rate metrics that
 * only exist as PlayerDerivedMetrics fields, not as their own table column.
 * This is the full set a user can build a Dashboard tile from.
 */
export const PLAYER_TILE_METRICS: PlayerTileMetric[] = [
  ...PLAYER_COLUMNS.map((c) => ({
    key: c.key,
    label: c.label,
    getValue: c.getValue,
    format: c.format,
    higherIsBetter: c.higherIsBetter ?? true,
    ratePerMinutes: RATE_PER_MINUTES_COLUMN_KEYS.has(c.key),
  })),
  { key: "goalsMinusXG", label: "Goals vs xG (Goals − xG)", getValue: (_p, d) => d.goalsMinusXG, format: fmtSigned, higherIsBetter: true },
  { key: "assistsMinusXA", label: "Assists vs xA (Assists − xA)", getValue: (_p, d) => d.assistsMinusXA, format: fmtSigned, higherIsBetter: true },
  {
    key: "goalInvolvementsMinusXGI",
    label: "G+A vs xGI (G+A − xGI)",
    getValue: (_p, d) => d.goalInvolvementsMinusXGI,
    format: fmtSigned,
    higherIsBetter: true,
  },
  // No separate "Points/Game" tile — that's just PPG (already above, via
  // PLAYER_COLUMNS' "pointsPerGame"/"PPG" entry), not a distinct metric.
  { key: "goalsPerGame", label: "Goals/Game", getValue: (_p, d) => d.goalsPerGame, format: num(2), higherIsBetter: true, ratePerMinutes: true },
  { key: "assistsPerGame", label: "Assists/Game", getValue: (_p, d) => d.assistsPerGame, format: num(2), higherIsBetter: true, ratePerMinutes: true },
];

export const TEAM_TILE_METRICS: TeamTileMetric[] = [
  { key: "points", label: "Squad Points", getValue: (t) => t.points, format: num(0), higherIsBetter: true },
  { key: "xGI", label: "Squad xGI", getValue: (t) => t.xGI, format: num(2), higherIsBetter: true },
  { key: "cleanSheets", label: "Clean Sheets", getValue: (t) => t.cleanSheets, format: num(0), higherIsBetter: true },
  { key: "goals", label: "Goals", getValue: (t) => t.goals, format: num(0), higherIsBetter: true },
  { key: "assists", label: "Assists", getValue: (t) => t.assists, format: num(0), higherIsBetter: true },
  { key: "bonus", label: "Bonus Points", getValue: (t) => t.bonus, format: num(0), higherIsBetter: true },
];

export function playerTileMetricByKey(key: string): PlayerTileMetric | undefined {
  return PLAYER_TILE_METRICS.find((m) => m.key === key);
}

export function teamTileMetricByKey(key: string): TeamTileMetric | undefined {
  return TEAM_TILE_METRICS.find((m) => m.key === key);
}
