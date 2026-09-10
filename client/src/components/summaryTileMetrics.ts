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
}

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
  { key: "pointsPer90", label: "Points/90", getValue: (_p, d) => d.pointsPer90, format: num(1), higherIsBetter: true },
  { key: "goalsPer90", label: "Goals/90", getValue: (_p, d) => d.goalsPer90, format: num(2), higherIsBetter: true },
  { key: "assistsPer90", label: "Assists/90", getValue: (_p, d) => d.assistsPer90, format: num(2), higherIsBetter: true },
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
