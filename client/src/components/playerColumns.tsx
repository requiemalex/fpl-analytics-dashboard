import type { NormalizedPlayer, Position } from "../types/normalized";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import type { PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { defensiveRewardPerGame } from "../metrics/defensiveReward";
import { perEstimatedGame } from "../metrics/calculations";
import { fmtDecimal, fmtPrice, fmtPercent, fmtSigned } from "../utils/format";

export type ColumnGroup = "ACTUAL OUTPUT" | "UNDERLYING PERFORMANCE" | "VALUE" | "ADVANCED";

export interface PlayerColumn {
  key: string;
  label: string;
  group: ColumnGroup;
  metricKey?: string;
  getValue: (p: NormalizedPlayer, d: PlayerDerivedMetrics) => number | null;
  format: (v: number | null) => string;
  /** Decimal places `format` shows — column filters compare values as displayed (see columnFilterPasses). */
  decimals: number;
  /** Whether a higher value is the "better" one — the direction of its comparative colour (<comparative_colouring>), Player Comparison's percentiles and "best" mark. Defaults to true; false where less is better (price, ownership, xGC, cards, set-piece order). */
  higherIsBetter?: boolean;
  /** A figure that's neither better nor worse (a style statistic): never coloured (colourDirection). */
  noColour?: boolean;
  /**
   * What colour tints, percentiles and "best" marks rank this column on,
   * when that isn't its own figure. Only for a lower-is-better TOTAL, which
   * grows with minutes: ranked on itself, the fewer minutes a player played
   * the better he'd look (a 90-minute cameo out-ranking a regular). Total
   * xGC ranks on xGC per game instead (audit 2026-10-18 M13). Read it
   * through rankValue().
   */
  rankBy?: (p: NormalizedPlayer, d: PlayerDerivedMetrics) => number | null;
  /**
   * Whether this column's value actually changes with the page's
   * Last Completed Season / Historic Average / Current Season toggle
   * (or Team Building's equivalent Historic/Raw toggle) — i.e. whether
   * resolvePlayerStats (resolvePlayerStats.ts) overwrites this field per
   * mode. Defaults true (almost every performance metric does); only
   * price, ownership, form and the set-piece orders are explicitly false —
   * all are always today's live figure regardless of mode (price per
   * resolvePlayerStats.ts's own price_always_live note; FPL keeps no
   * history of the others). Drives the "always live" header styling
   * shared across every table that lists PLAYER_COLUMNS — see the
   * .col-static rule in components.css.
   */
  varies?: boolean;
  /** A +/- figure (Goals − xG): shown signed and coloured by sign. Player Comparison leaves these out (its Outputs bars start at 0). */
  signed?: boolean;
  /**
   * Set only on a column from a second data source (see
   * extensions/externalStats.ts) — its id, e.g. "understat". Unset means
   * FPL. Drives that source's header colour.
   */
  sourceId?: string;
  /**
   * The positions the figure can exist for, when that isn't every position
   * (<position_only_figures>): FPL never credits a goalkeeper with a
   * defensive contribution, and only a goalkeeper makes saves. For anyone
   * else the figure is null (so out of sorts, filters, colours and
   * rankings) and the cell is blank — not "—", which means missing data,
   * and never 0. Read it through columnApplies().
   */
  positions?: readonly Position[];
}

const OUTFIELD: readonly Position[] = ["DEF", "MID", "FWD"];
const GOALKEEPER: readonly Position[] = ["GKP"];

/** Whether a column's figure can exist for a player in this position (PlayerColumn.positions). */
export function columnApplies(c: Pick<PlayerColumn, "positions">, position: Position): boolean {
  return !c.positions || c.positions.includes(position);
}

/** Limits a column to the positions its figure exists for: anyone else's is null (PlayerColumn.positions). */
function onlyFor(positions: readonly Position[], c: PlayerColumn): PlayerColumn {
  return { ...c, positions, getValue: (p, d) => (positions.includes(p.position) ? c.getValue(p, d) : null) };
}

/** What a table cell shows: blank where the figure can't exist for his position, its formatted figure otherwise ("—" when it's missing). */
export function cellText(c: PlayerColumn, p: NormalizedPlayer, d: PlayerDerivedMetrics): string {
  return columnApplies(c, p.position) ? c.format(c.getValue(p, d)) : "";
}

/** Whole-number columns kept whole even as a Historic Average: minutes run to hundreds a season, so a fraction hides nothing. */
const WHOLE_WHEN_AVERAGED = new Set(["minutes"]);
const historicAverageColumns = new WeakMap<PlayerColumn, PlayerColumn>();

/**
 * <averaged_counts>: a column as a Data View shows it. A Historic Average
 * is a mean of seasons, so a whole-number count (goals, assists, cards,
 * saves…) shows 1 decimal there — 0.4 goals a season is "0.4", never a
 * "0" that reads as a real zero. Every other view, and every column that
 * isn't a count (rates, price, ownership, the always-live set-piece
 * orders), is unchanged. Column filters compare the figure as shown, so
 * `decimals` moves with it.
 */
/** Decimal places for a whole-number count outside a table (a profile tile): 1 in a Historic Average (<averaged_counts>), none otherwise. */
export function countDecimals(mode: AnalysisMode): number {
  return mode === "historicAverage" ? 1 : 0;
}

export function columnForMode(c: PlayerColumn, mode: AnalysisMode): PlayerColumn {
  if (mode !== "historicAverage" || c.decimals !== 0 || c.varies === false || WHOLE_WHEN_AVERAGED.has(c.key)) return c;
  let shown = historicAverageColumns.get(c);
  if (!shown) {
    shown = { ...c, decimals: 1, format: (v) => (c.signed ? fmtSigned(v, 1) : fmtDecimal(v, 1)) };
    historicAverageColumns.set(c, shown);
  }
  return shown;
}

/** The figure a column's tints, percentiles and "best" marks rank on (see PlayerColumn.rankBy). */
export function rankValue(c: Pick<PlayerColumn, "getValue" | "rankBy">, p: NormalizedPlayer, d: PlayerDerivedMetrics): number | null {
  return (c.rankBy ?? c.getValue)(p, d);
}

const num = (decimals = 0) => ({ format: (v: number | null) => fmtDecimal(v, decimals), decimals });

export const PLAYER_COLUMNS: PlayerColumn[] = [
  // ACTUAL OUTPUT
  { key: "totalPoints", label: "Points", group: "ACTUAL OUTPUT", metricKey: "totalPoints", getValue: (p) => p.totalPoints, ...num(0) },
  { key: "pointsPerGame", label: "PPG", group: "ACTUAL OUTPUT", metricKey: "pointsPerGame", getValue: (p) => p.pointsPerGame, ...num(1) },
  { key: "goals", label: "Goals", group: "ACTUAL OUTPUT", metricKey: "goals", getValue: (p) => p.goals, ...num(0) },
  { key: "assists", label: "Assists", group: "ACTUAL OUTPUT", metricKey: "assists", getValue: (p) => p.assists, ...num(0) },
  { key: "cleanSheets", label: "CS", group: "ACTUAL OUTPUT", metricKey: "cleanSheets", getValue: (p) => p.cleanSheets, ...num(0) },
  { key: "bonus", label: "Bonus", group: "ACTUAL OUTPUT", metricKey: "bonus", getValue: (p) => p.bonus, ...num(0) },
  onlyFor(GOALKEEPER, { key: "saves", label: "Saves", group: "ACTUAL OUTPUT", metricKey: "saves", getValue: (p) => p.saves, ...num(0) }),
  onlyFor(GOALKEEPER, { key: "savesPerGame", label: "Saves/Game", group: "ACTUAL OUTPUT", metricKey: "savesPerGame", getValue: (p) => p.savesPerGame, ...num(2) }),
  onlyFor(GOALKEEPER, { key: "penaltiesSaved", label: "Pens Saved", group: "ACTUAL OUTPUT", metricKey: "penaltiesSaved", getValue: (p) => p.penaltiesSaved, ...num(0) }),
  // Lower-is-better totals rank per game (see rankBy), like xGC.
  {
    key: "goalsConceded",
    label: "GC",
    group: "ACTUAL OUTPUT",
    metricKey: "goalsConceded",
    getValue: (p) => p.goalsConceded,
    ...num(0),
    higherIsBetter: false,
    rankBy: (p) => p.goalsConcededPerGame,
  },
  { key: "goalsConcededPerGame", label: "GC/Game", group: "ACTUAL OUTPUT", metricKey: "goalsConcededPerGame", getValue: (p) => p.goalsConcededPerGame, ...num(2), higherIsBetter: false },
  {
    key: "yellowCards",
    label: "Yellows",
    group: "ACTUAL OUTPUT",
    metricKey: "yellowCards",
    getValue: (p) => p.yellowCards,
    ...num(0),
    higherIsBetter: false,
    rankBy: (p) => perEstimatedGame(p.yellowCards, p.estimatedGames),
  },
  {
    key: "redCards",
    label: "Reds",
    group: "ACTUAL OUTPUT",
    metricKey: "redCards",
    getValue: (p) => p.redCards,
    ...num(0),
    higherIsBetter: false,
    rankBy: (p) => perEstimatedGame(p.redCards, p.estimatedGames),
  },
  { key: "form", label: "Form", group: "ACTUAL OUTPUT", metricKey: "form", getValue: (p) => p.form, ...num(1), varies: false },

  // UNDERLYING PERFORMANCE
  { key: "xG", label: "xG", group: "UNDERLYING PERFORMANCE", metricKey: "xG", getValue: (p) => p.xG, ...num(2) },
  { key: "xA", label: "xA", group: "UNDERLYING PERFORMANCE", metricKey: "xA", getValue: (p) => p.xA, ...num(2) },
  { key: "xGI", label: "xGI", group: "UNDERLYING PERFORMANCE", metricKey: "xGI", getValue: (p) => p.xGI, ...num(2) },
  { key: "xGPerGame", label: "xG/Game", group: "UNDERLYING PERFORMANCE", metricKey: "xGPerGame", getValue: (p) => p.xGPerGame, ...num(2) },
  { key: "xAPerGame", label: "xA/Game", group: "UNDERLYING PERFORMANCE", metricKey: "xAPerGame", getValue: (p) => p.xAPerGame, ...num(2) },
  { key: "xGIPerGame", label: "xGI/Game", group: "UNDERLYING PERFORMANCE", metricKey: "xGIPerGame", getValue: (p) => p.xGIPerGame, ...num(2) },
  // FPL's goals and assists against FPL's own xG and xA (each source against itself, never mixed).
  { key: "goalsMinusXG", label: "Goals − xG", group: "UNDERLYING PERFORMANCE", metricKey: "goalsMinusXG", getValue: (_p, d) => d.goalsMinusXG, format: (v) => fmtSigned(v, 2), decimals: 2, signed: true },
  { key: "assistsMinusXA", label: "Assists − xA", group: "UNDERLYING PERFORMANCE", metricKey: "assistsMinusXA", getValue: (_p, d) => d.assistsMinusXA, format: (v) => fmtSigned(v, 2), decimals: 2, signed: true },
  { key: "xGC", label: "xGC", group: "UNDERLYING PERFORMANCE", metricKey: "xGC", getValue: (p) => p.xGC, ...num(2), higherIsBetter: false, rankBy: (p) => p.xGCPerGame },
  { key: "xGCPerGame", label: "xGC/Game", group: "UNDERLYING PERFORMANCE", metricKey: "xGCPerGame", getValue: (p) => p.xGCPerGame, ...num(2), higherIsBetter: false },

  // VALUE
  { key: "price", label: "Price", group: "VALUE", metricKey: "price", getValue: (p) => p.price, format: (v) => fmtPrice(v), decimals: 1, higherIsBetter: false, varies: false },
  { key: "pointsPerMillion", label: "Pts/\u00a3m", group: "VALUE", metricKey: "pointsPerMillion", getValue: (_p, d) => d.pointsPerMillion, ...num(1) },
  { key: "xGPerMillion", label: "xG/\u00a3m", group: "VALUE", metricKey: "xGPerMillion", getValue: (_p, d) => d.xGPerMillion, ...num(2) },
  { key: "xAPerMillion", label: "xA/\u00a3m", group: "VALUE", metricKey: "xAPerMillion", getValue: (_p, d) => d.xAPerMillion, ...num(2) },
  { key: "xGIPerMillion", label: "xGI/\u00a3m", group: "VALUE", metricKey: "xGIPerMillion", getValue: (_p, d) => d.xGIPerMillion, ...num(2) },

  // ADVANCED
  { key: "minutes", label: "Mins", group: "ADVANCED", metricKey: "minutes", getValue: (p) => p.minutes, ...num(0) },
  { key: "starts", label: "Starts", group: "ADVANCED", metricKey: "starts", getValue: (p) => p.starts, ...num(0) },
  { key: "bps", label: "BPS", group: "ADVANCED", metricKey: "bps", getValue: (p) => p.bps, ...num(0) },
  { key: "ictIndex", label: "ICT", group: "ADVANCED", metricKey: "ictIndex", getValue: (p) => p.ictIndex, ...num(1) },
  { key: "influence", label: "Influence", group: "ADVANCED", metricKey: "influence", getValue: (p) => p.influence, ...num(1) },
  { key: "creativity", label: "Creativity", group: "ADVANCED", metricKey: "creativity", getValue: (p) => p.creativity, ...num(1) },
  { key: "threat", label: "Threat", group: "ADVANCED", metricKey: "threat", getValue: (p) => p.threat, ...num(1) },
  onlyFor(OUTFIELD, {
    key: "defensiveContributions",
    label: "DC",
    group: "ADVANCED",
    metricKey: "defensiveContributions",
    getValue: (p) => p.defensiveContributions,
    ...num(0),
  }),
  onlyFor(OUTFIELD, {
    key: "defensiveContributionsPerGame",
    label: "DC/Game",
    group: "ADVANCED",
    metricKey: "defensiveContributionsPerGame",
    getValue: (p) => p.defensiveContributionsPerGame,
    ...num(2),
  }),
  {
    key: "defensiveRewardPerGame",
    label: "Def. Reward/Game",
    group: "ADVANCED",
    metricKey: "defensiveRewardPerGame",
    getValue: (p) => defensiveRewardPerGame(p),
    ...num(2),
  },
  { key: "tackles", label: "Tackles", group: "ADVANCED", metricKey: "tackles", getValue: (p) => p.tackles, ...num(0) },
  { key: "clearancesBlocksInterceptions", label: "CBI", group: "ADVANCED", metricKey: "clearancesBlocksInterceptions", getValue: (p) => p.clearancesBlocksInterceptions, ...num(0) },
  { key: "recoveries", label: "Recoveries", group: "ADVANCED", metricKey: "recoveries", getValue: (p) => p.recoveries, ...num(0) },
  // Set-piece duties: today's order at his club (1 = first choice), whatever the Data View.
  { key: "penaltiesOrder", label: "Pen Order", group: "ADVANCED", metricKey: "penaltiesOrder", getValue: (p) => p.penaltiesOrder, ...num(0), higherIsBetter: false, varies: false },
  { key: "directFreekicksOrder", label: "FK Order", group: "ADVANCED", metricKey: "directFreekicksOrder", getValue: (p) => p.directFreekicksOrder, ...num(0), higherIsBetter: false, varies: false },
  { key: "cornersOrder", label: "Corner Order", group: "ADVANCED", metricKey: "cornersOrder", getValue: (p) => p.cornersOrder, ...num(0), higherIsBetter: false, varies: false },
  {
    key: "ownership",
    label: "Own%",
    group: "ADVANCED",
    metricKey: "ownership",
    getValue: (p) => p.ownership,
    format: (v) => fmtPercent(v, 1),
    decimals: 1,
    higherIsBetter: false,
    varies: false,
  },
];

export const DEFAULT_VISIBLE_COLUMNS = [
  "ownership",
  "totalPoints",
  "pointsPerGame",
  "goals",
  "assists",
  "price",
  "pointsPerMillion",
  "xG",
  "xA",
  "xGI",
  "minutes",
];

export function columnByKey(key: string): PlayerColumn | undefined {
  return PLAYER_COLUMNS.find((c) => c.key === key);
}

/**
 * The format a figure built from a column (a Dashboard tile, a Player
 * Comparison card) has in a Data View — the column's own, so it and the
 * tables agree (<averaged_counts>). A figure with a format of its own
 * (a tile-only metric) keeps it.
 */
export function columnFormatForMode(key: string, format: (v: number | null) => string, mode: AnalysisMode): (v: number | null) => string {
  const c = columnByKey(key);
  return c && c.format === format ? columnForMode(c, mode).format : format;
}

/** `varies` defaults to true (unset ≠ static) — this is the one place that distinction is interpreted, so every table applies the "always live" header styling identically rather than each re-deriving its own `c.varies === false` check. */
export function isStaticColumn(c: PlayerColumn): boolean {
  return c.varies === false;
}

