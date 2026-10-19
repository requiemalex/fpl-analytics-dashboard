import type { TeamAggregate } from "../metrics/teamStats";
import { fmtDecimal, fmtSigned } from "../utils/format";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";

export type TeamColumnGroup = "RESULTS" | "OUTPUT" | "UNDERLYING PERFORMANCE";

export interface TeamColumn {
  key: string;
  label: string;
  group: TeamColumnGroup;
  getValue: (t: TeamAggregate) => number | null;
  format: (v: number | null) => string;
  /** Decimal places `format` shows — Team Explorer's column filters compare a value as displayed (see columnFilterPasses). Whole-number columns say 0: a Historic Average figure is a mean (65.75 shown "66"), so leaving it out compared the raw mean (audit 2026-10-18 M15). */
  decimals: number;
  /** Whether a higher value is the "better" one — the direction of its comparative colour (<comparative_colouring>). Defaults to true; false for league position, losses, goals against, and xGC. */
  higherIsBetter?: boolean;
  /** A figure that's neither better nor worse (games played, draws, a style statistic): never coloured (colourDirection). */
  noColour?: boolean;
  /** Set only on a column from a second data source (extensions/externalStats.ts) — its id. Unset means FPL. */
  sourceId?: string;
}

const num = (decimals = 0) => ({ format: (v: number | null) => fmtDecimal(v, decimals), decimals });

/**
 * The full set of team-level metrics a Dashboard tile/graph, the Team Explorer
 * table, and Team Profile can use. Every one is a CLUB figure for the
 * season(s) the view's own Data View selects (see <club_not_squad> in
 * metrics/teamStats.ts) — results, output and underlying numbers alike,
 * so a tile set to Last Completed Season shows that season's league table,
 * not today's.
 */
export const TEAM_COLUMNS: TeamColumn[] = [
  // RESULTS
  { key: "leaguePosition", label: "League Position", group: "RESULTS", getValue: (t) => t.leaguePosition, ...num(0), higherIsBetter: false },
  { key: "leaguePoints", label: "League Points", group: "RESULTS", getValue: (t) => t.leaguePoints, ...num(0) },
  { key: "played", label: "Played", group: "RESULTS", getValue: (t) => t.played, ...num(0), noColour: true },
  { key: "wins", label: "Wins", group: "RESULTS", getValue: (t) => t.wins, ...num(0) },
  { key: "draws", label: "Draws", group: "RESULTS", getValue: (t) => t.draws, ...num(0), noColour: true },
  { key: "losses", label: "Losses", group: "RESULTS", getValue: (t) => t.losses, ...num(0), higherIsBetter: false },
  { key: "goalsFor", label: "Goals For", group: "RESULTS", getValue: (t) => t.goalsFor, ...num(0) },
  { key: "goalsAgainst", label: "Goals Against", group: "RESULTS", getValue: (t) => t.goalsAgainst, ...num(0), higherIsBetter: false },
  {
    key: "goalDifference",
    label: "Goal Difference",
    group: "RESULTS",
    getValue: (t) => (t.goalsFor !== null && t.goalsAgainst !== null ? t.goalsFor - t.goalsAgainst : null),
    format: (v) => fmtSigned(v, 0),
    decimals: 0,
  },
  { key: "cleanSheets", label: "Clean Sheets", group: "RESULTS", getValue: (t) => t.cleanSheets, ...num(0) },

  // OUTPUT
  { key: "points", label: "FPL Points", group: "OUTPUT", getValue: (t) => t.points, ...num(0) },
  { key: "goals", label: "Goals (excl. OGs)", group: "OUTPUT", getValue: (t) => t.goals, ...num(0) },
  { key: "assists", label: "Assists", group: "OUTPUT", getValue: (t) => t.assists, ...num(0) },
  { key: "bonus", label: "Bonus Points", group: "OUTPUT", getValue: (t) => t.bonus, ...num(0) },

  // UNDERLYING PERFORMANCE
  { key: "xG", label: "xG", group: "UNDERLYING PERFORMANCE", getValue: (t) => t.xG, ...num(2) },
  { key: "xA", label: "xA", group: "UNDERLYING PERFORMANCE", getValue: (t) => t.xA, ...num(2) },
  { key: "xGI", label: "xGI", group: "UNDERLYING PERFORMANCE", getValue: (t) => t.xGI, ...num(2) },
  { key: "xGC", label: "xGC", group: "UNDERLYING PERFORMANCE", getValue: (t) => t.xGC, ...num(2), higherIsBetter: false },
  {
    key: "defensiveContributions",
    label: "Def. Contributions",
    group: "UNDERLYING PERFORMANCE",
    getValue: (t) => t.defensiveContributions,
    ...num(0),
  },
];

/**
 * Keys a stored tile/graph may still carry from before club history
 * replaced squad sums: "goalsConceded" (v1.57.0's goalkeeper-based Goals
 * Conceded) is now exactly "goalsAgainst" — both are the club's real goals
 * conceded in the view's own season.
 */
const RETIRED_TEAM_METRIC_KEYS: Record<string, string> = { goalsConceded: "goalsAgainst" };

/** Maps a possibly-retired stored team metric key to its current equivalent — used by the tile/graph stores' migrate(). */
export function currentTeamMetricKey(key: string): string {
  return RETIRED_TEAM_METRIC_KEYS[key] ?? key;
}

export function teamColumnByKey(key: string): TeamColumn | undefined {
  const current = currentTeamMetricKey(key);
  return TEAM_COLUMNS.find((c) => c.key === current);
}

/**
 * Whole-number club columns kept whole even as a Historic Average: a league
 * position is a place, not a count; every completed season is 38 played;
 * and wins, draws and losses are shared out as whole numbers that add up
 * to the games played (<results_within_played>, the owner's rule).
 */
const WHOLE_WHEN_AVERAGED = new Set(["leaguePosition", "played", "wins", "draws", "losses"]);
const historicAverageColumns = new WeakMap<TeamColumn, TeamColumn>();

/** The format a figure built from a club column (a Dashboard team tile) has in a Data View: the column's own (playerColumns.tsx columnFormatForMode). */
export function teamColumnFormatForMode(key: string, format: (v: number | null) => string, mode: AnalysisMode): (v: number | null) => string {
  const c = teamColumnByKey(key);
  return c && c.format === format ? teamColumnForMode(c, mode).format : format;
}

/** <averaged_counts> for a club column (the player rule, playerColumns.tsx columnForMode): a Historic Average count shows 1 decimal. */
export function teamColumnForMode(c: TeamColumn, mode: AnalysisMode): TeamColumn {
  if (mode !== "historicAverage" || c.decimals !== 0 || WHOLE_WHEN_AVERAGED.has(c.key)) return c;
  let shown = historicAverageColumns.get(c);
  if (!shown) {
    shown = { ...c, decimals: 1, format: (v) => (c.key === "goalDifference" ? fmtSigned(v, 1) : fmtDecimal(v, 1)) };
    historicAverageColumns.set(c, shown);
  }
  return shown;
}
