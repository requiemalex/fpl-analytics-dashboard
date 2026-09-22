import type { TeamAggregate } from "../metrics/teamStats";
import { fmtDecimal, fmtSigned } from "../utils/format";

export type TeamColumnGroup = "SQUAD OUTPUT" | "UNDERLYING PERFORMANCE" | "LEAGUE STANDING";

export interface TeamColumn {
  key: string;
  label: string;
  group: TeamColumnGroup;
  getValue: (t: TeamAggregate) => number | null;
  format: (v: number | null) => string;
  /** Whether a higher value is the "better" one for this metric. Defaults to true; false for league position, losses, and goals against. */
  higherIsBetter?: boolean;
  /**
   * Whether this column actually changes with a tile/graph's own Data
   * View (Last Completed Season / Historic Average / Current Season).
   * Defaults true for every SQUAD OUTPUT / UNDERLYING PERFORMANCE column
   * (each a sum over the mode-resolved current squad). Every LEAGUE
   * STANDING column is explicitly false — real table position, points,
   * and match results don't change depending on which player-data mode a
   * tile/graph happens to be looking at, same "always live" convention as
   * a player's price/ownership (see playerColumns.tsx).
   */
  varies?: boolean;
}

const num = (decimals = 0) => (v: number | null) => fmtDecimal(v, decimals);

/**
 * The full set of team-level metrics a Dashboard tile or graph can be
 * built from. SQUAD OUTPUT and UNDERLYING PERFORMANCE are both sums across
 * a club's current squad (same current-squad-attribution convention as
 * Teams.tsx — a transferred player's full total counts for their CURRENT
 * club) using whichever analysis mode the tile/graph itself picked.
 * LEAGUE STANDING is this season's real table — actual results, not a
 * squad aggregate, and not affected by the mode picker at all.
 */
export const TEAM_COLUMNS: TeamColumn[] = [
  // SQUAD OUTPUT
  { key: "points", label: "Squad Points", group: "SQUAD OUTPUT", getValue: (t) => t.points, format: num(0) },
  { key: "goals", label: "Goals", group: "SQUAD OUTPUT", getValue: (t) => t.goals, format: num(0) },
  { key: "assists", label: "Assists", group: "SQUAD OUTPUT", getValue: (t) => t.assists, format: num(0) },
  { key: "cleanSheets", label: "Clean Sheets", group: "SQUAD OUTPUT", getValue: (t) => t.cleanSheets, format: num(0) },
  { key: "bonus", label: "Bonus Points", group: "SQUAD OUTPUT", getValue: (t) => t.bonus, format: num(0) },

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

  // LEAGUE STANDING (always live — see TeamColumn.varies)
  { key: "leaguePosition", label: "League Position", group: "LEAGUE STANDING", getValue: (t) => t.leaguePosition, format: num(0), higherIsBetter: false, varies: false },
  { key: "leaguePoints", label: "League Points", group: "LEAGUE STANDING", getValue: (t) => t.leaguePoints, format: num(0), varies: false },
  { key: "played", label: "Played", group: "LEAGUE STANDING", getValue: (t) => t.played, format: num(0), varies: false },
  { key: "wins", label: "Wins", group: "LEAGUE STANDING", getValue: (t) => t.wins, format: num(0), varies: false },
  { key: "draws", label: "Draws", group: "LEAGUE STANDING", getValue: (t) => t.draws, format: num(0), varies: false },
  { key: "losses", label: "Losses", group: "LEAGUE STANDING", getValue: (t) => t.losses, format: num(0), higherIsBetter: false, varies: false },
  { key: "goalsFor", label: "Goals For", group: "LEAGUE STANDING", getValue: (t) => t.goalsFor, format: num(0), varies: false },
  { key: "goalsAgainst", label: "Goals Against", group: "LEAGUE STANDING", getValue: (t) => t.goalsAgainst, format: num(0), higherIsBetter: false, varies: false },
  {
    key: "goalDifference",
    label: "Goal Difference",
    group: "LEAGUE STANDING",
    getValue: (t) => (t.goalsFor !== null && t.goalsAgainst !== null ? t.goalsFor - t.goalsAgainst : null),
    format: (v) => fmtSigned(v, 0),
    varies: false,
  },
];

export function teamColumnByKey(key: string): TeamColumn | undefined {
  return TEAM_COLUMNS.find((c) => c.key === key);
}

/** Same convention as playerColumns.tsx's isStaticColumn — true for a column drawn from live league standings rather than the mode-resolved squad sum. */
export function isStaticTeamColumn(c: TeamColumn): boolean {
  return c.varies === false;
}
