import type { NormalizedPlayer } from "../types/normalized";
import type { PlayerDerivedMetrics } from "../metrics/playerMetrics";
import type { TeamAggregate } from "../metrics/teamStats";
import { PLAYER_COLUMNS } from "./playerColumns";
import { TEAM_COLUMNS, currentTeamMetricKey } from "./teamColumns";
import { fmtDecimal, fmtSigned } from "../utils/format";

export type SummaryTileScope = "player" | "team";

export type { TeamAggregate };

export interface PlayerTileMetric {
  key: string;
  label: string;
  getValue: (p: NormalizedPlayer, d: PlayerDerivedMetrics) => number | null;
  format: (v: number | null) => string;
  /** Used only to pick a sensible default sort direction when this metric is first selected in the Add Tile form. */
  higherIsBetter: boolean;
  /** True for a +/- comparison metric (Goals vs xG, etc.) — Dashboard's tile bar colours these green/red per row by sign, rather than a single accent colour for the whole tile. */
  signed?: boolean;
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
  { key: "goalsMinusXG", label: "Goals vs xG (Goals − xG)", getValue: (_p, d) => d.goalsMinusXG, format: fmtSigned, higherIsBetter: true, signed: true },
  {
    key: "assistsMinusXA",
    label: "Assists vs xA (Assists − xA)",
    getValue: (_p, d) => d.assistsMinusXA,
    format: fmtSigned,
    higherIsBetter: true,
    signed: true,
  },
  {
    key: "goalInvolvementsMinusXGI",
    label: "G+A vs xGI (G+A − xGI)",
    getValue: (_p, d) => d.goalInvolvementsMinusXGI,
    format: fmtSigned,
    higherIsBetter: true,
    signed: true,
  },
  // No separate "Points/Game" tile — that's just PPG (already above, via
  // PLAYER_COLUMNS' "pointsPerGame"/"PPG" entry), not a distinct metric.
  { key: "goalsPerGame", label: "Goals/Game", getValue: (_p, d) => d.goalsPerGame, format: num(2), higherIsBetter: true },
  { key: "assistsPerGame", label: "Assists/Game", getValue: (_p, d) => d.assistsPerGame, format: num(2), higherIsBetter: true },
];

/** Every TEAM_COLUMNS metric (League Position, Goals For/Against, FPL Points, xG/xA/xGI/xGC, etc. — the same club-figure catalogue Dashboard's team graphs use) — the full set a user can build a Dashboard Team Tile from. */
export const TEAM_TILE_METRICS: TeamTileMetric[] = TEAM_COLUMNS.map((c) => ({
  key: c.key,
  label: c.label,
  getValue: c.getValue,
  format: c.format,
  higherIsBetter: c.higherIsBetter ?? true,
}));

export function playerTileMetricByKey(key: string): PlayerTileMetric | undefined {
  return PLAYER_TILE_METRICS.find((m) => m.key === key);
}

export function teamTileMetricByKey(key: string): TeamTileMetric | undefined {
  const current = currentTeamMetricKey(key);
  return TEAM_TILE_METRICS.find((m) => m.key === current);
}
