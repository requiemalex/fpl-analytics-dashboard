import type { NormalizedPlayer } from "../types/normalized";
import type { PlayerDerivedMetrics } from "../metrics/playerMetrics";
import type { TeamAggregate } from "../metrics/teamStats";
import { PLAYER_COLUMNS, type PlayerColumn } from "./playerColumns";
import { TEAM_COLUMNS, currentTeamMetricKey, type TeamColumn } from "./teamColumns";
import { fmtDecimal, fmtSigned } from "../utils/format";

export type SummaryTileScope = "player" | "team";

export type { TeamAggregate };

export interface PlayerTileMetric {
  key: string;
  label: string;
  /** Its picker group (the column group: "FPL · Actual Output"…). */
  group?: string;
  getValue: (p: NormalizedPlayer, d: PlayerDerivedMetrics) => number | null;
  format: (v: number | null) => string;
  /** The default sort direction when this metric is first picked in the Add Tile form, and its comparative colour's direction (<comparative_colouring>). */
  higherIsBetter: boolean;
  /** What its colour ranks on when that isn't its own figure (PlayerColumn.rankBy). */
  rankBy?: (p: NormalizedPlayer, d: PlayerDerivedMetrics) => number | null;
  /** Never coloured (PlayerColumn.noColour). */
  noColour?: boolean;
  /** A +/- comparison metric (Goals vs xG, etc.): its bars measure the size of the figure either side of 0. */
  signed?: boolean;
}

export interface TeamTileMetric {
  key: string;
  label: string;
  /** Its picker group (the column group). */
  group?: string;
  getValue: (t: TeamAggregate) => number | null;
  format: (v: number | null) => string;
  higherIsBetter: boolean;
  /** Never coloured (TeamColumn.noColour). */
  noColour?: boolean;
}

const num = (decimals = 0) => (v: number | null) => fmtDecimal(v, decimals);

/**
 * Every PLAYER_COLUMNS metric (Points, Price, xG, Own% — the same catalogue
 * the tables use) plus a handful of derived comparison/rate metrics that
 * only exist as PlayerDerivedMetrics fields, not as their own table column.
 * This is the full set a user can build a Dashboard tile from.
 */
/** Tile-only metrics, and fuller tile names for three that are also columns (Goals − xG, Assists − xA, G+A − xGI: the tile's entry wins). */
const TILE_EXTRA_METRICS: PlayerTileMetric[] = [
  { key: "goalsMinusXG", label: "Goals vs xG (Goals − xG)", group: "UNDERLYING PERFORMANCE", getValue: (_p, d) => d.goalsMinusXG, format: fmtSigned, higherIsBetter: true, signed: true },
  {
    key: "assistsMinusXA",
    label: "Assists vs xA (Assists − xA)",
    group: "UNDERLYING PERFORMANCE",
    getValue: (_p, d) => d.assistsMinusXA,
    format: fmtSigned,
    higherIsBetter: true,
    signed: true,
  },
  {
    key: "goalInvolvementsMinusXGI",
    label: "G+A vs xGI (G+A − xGI)",
    group: "UNDERLYING PERFORMANCE",
    getValue: (_p, d) => d.goalInvolvementsMinusXGI,
    format: fmtSigned,
    higherIsBetter: true,
    signed: true,
  },
  // No separate "Points/Game" tile — that's just PPG (already above, via
  // PLAYER_COLUMNS' "pointsPerGame"/"PPG" entry), not a distinct metric.
  { key: "goalsPerGame", label: "Goals/Game", group: "ACTUAL OUTPUT", getValue: (_p, d) => d.goalsPerGame, format: num(2), higherIsBetter: true },
  { key: "assistsPerGame", label: "Assists/Game", group: "ACTUAL OUTPUT", getValue: (_p, d) => d.assistsPerGame, format: num(2), higherIsBetter: true },
];
const TILE_EXTRA_KEYS = new Set(TILE_EXTRA_METRICS.map((m) => m.key));

/** A player column as a tile metric — every FPL column, and a second source's (with its own key and, there, a label naming the source). */
export function playerTileMetricFromColumn(c: PlayerColumn, key = c.key, label = c.label): PlayerTileMetric {
  return {
    key,
    label,
    group: c.group,
    getValue: c.getValue,
    format: c.format,
    higherIsBetter: c.higherIsBetter ?? true,
    rankBy: c.rankBy,
    noColour: c.noColour,
    signed: c.signed,
  };
}

export const PLAYER_TILE_METRICS: PlayerTileMetric[] = [
  ...PLAYER_COLUMNS.filter((c) => !TILE_EXTRA_KEYS.has(c.key)).map((c) => playerTileMetricFromColumn(c)),
  ...TILE_EXTRA_METRICS,
];

/** Every TEAM_COLUMNS metric (League Position, Goals For/Against, FPL Points, xG/xA/xGI/xGC, etc. — the same club-figure catalogue Dashboard's team graphs use) — the full set a user can build a Dashboard Team Tile from. */
export const TEAM_TILE_METRICS: TeamTileMetric[] = TEAM_COLUMNS.map((c) => teamTileMetricFromColumn(c));

/** A club column as a tile metric (as playerTileMetricFromColumn). */
export function teamTileMetricFromColumn(c: TeamColumn, key = c.key, label = c.label): TeamTileMetric {
  return {
    key,
    label,
    group: c.group,
    getValue: c.getValue,
    format: c.format,
    higherIsBetter: c.higherIsBetter ?? true,
    noColour: c.noColour,
  };
}

export function playerTileMetricByKey(key: string): PlayerTileMetric | undefined {
  return PLAYER_TILE_METRICS.find((m) => m.key === key);
}

export function teamTileMetricByKey(key: string): TeamTileMetric | undefined {
  const current = currentTeamMetricKey(key);
  return TEAM_TILE_METRICS.find((m) => m.key === current);
}
