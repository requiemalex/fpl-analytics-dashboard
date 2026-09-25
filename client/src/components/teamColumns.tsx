import type { TeamAggregate } from "../metrics/teamStats";
import { fmtDecimal, fmtSigned } from "../utils/format";

export type TeamColumnGroup = "RESULTS" | "OUTPUT" | "UNDERLYING PERFORMANCE";

export interface TeamColumn {
  key: string;
  label: string;
  group: TeamColumnGroup;
  getValue: (t: TeamAggregate) => number | null;
  format: (v: number | null) => string;
  /** Whether a higher value is the "better" one for this metric. Defaults to true; false for league position, losses, goals against, and xGC. */
  higherIsBetter?: boolean;
}

const num = (decimals = 0) => (v: number | null) => fmtDecimal(v, decimals);

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
  { key: "leaguePosition", label: "League Position", group: "RESULTS", getValue: (t) => t.leaguePosition, format: num(0), higherIsBetter: false },
  { key: "leaguePoints", label: "League Points", group: "RESULTS", getValue: (t) => t.leaguePoints, format: num(0) },
  { key: "played", label: "Played", group: "RESULTS", getValue: (t) => t.played, format: num(0) },
  { key: "wins", label: "Wins", group: "RESULTS", getValue: (t) => t.wins, format: num(0) },
  { key: "draws", label: "Draws", group: "RESULTS", getValue: (t) => t.draws, format: num(0) },
  { key: "losses", label: "Losses", group: "RESULTS", getValue: (t) => t.losses, format: num(0), higherIsBetter: false },
  { key: "goalsFor", label: "Goals For", group: "RESULTS", getValue: (t) => t.goalsFor, format: num(0) },
  { key: "goalsAgainst", label: "Goals Against", group: "RESULTS", getValue: (t) => t.goalsAgainst, format: num(0), higherIsBetter: false },
  {
    key: "goalDifference",
    label: "Goal Difference",
    group: "RESULTS",
    getValue: (t) => (t.goalsFor !== null && t.goalsAgainst !== null ? t.goalsFor - t.goalsAgainst : null),
    format: (v) => fmtSigned(v, 0),
  },
  { key: "cleanSheets", label: "Clean Sheets", group: "RESULTS", getValue: (t) => t.cleanSheets, format: num(0) },

  // OUTPUT
  { key: "points", label: "FPL Points", group: "OUTPUT", getValue: (t) => t.points, format: num(0) },
  { key: "goals", label: "Goals (excl. OGs)", group: "OUTPUT", getValue: (t) => t.goals, format: num(0) },
  { key: "assists", label: "Assists", group: "OUTPUT", getValue: (t) => t.assists, format: num(0) },
  { key: "bonus", label: "Bonus Points", group: "OUTPUT", getValue: (t) => t.bonus, format: num(0) },

  // UNDERLYING PERFORMANCE
  { key: "xG", label: "xG", group: "UNDERLYING PERFORMANCE", getValue: (t) => t.xG, format: num(2) },
  { key: "xA", label: "xA", group: "UNDERLYING PERFORMANCE", getValue: (t) => t.xA, format: num(2) },
  { key: "xGI", label: "xGI", group: "UNDERLYING PERFORMANCE", getValue: (t) => t.xGI, format: num(2) },
  { key: "xGC", label: "xGC", group: "UNDERLYING PERFORMANCE", getValue: (t) => t.xGC, format: num(2), higherIsBetter: false },
  {
    key: "defensiveContributions",
    label: "Def. Contributions",
    group: "UNDERLYING PERFORMANCE",
    getValue: (t) => t.defensiveContributions,
    format: num(0),
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
