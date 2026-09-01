/**
 * Types for the Championship promoted-teams dataset — a deliberately
 * separate, static, non-live data source. See normalize/normalizeChampionship.ts
 * and README.md's "Championship data (promoted teams)" section for why this
 * doesn't go through the FPL pipeline (AppStateContext, NormalizedPlayer,
 * resolvePlayerStats, etc.) at all.
 */

export type MatchResult = "W" | "D" | "L";

export type PromotionRoute = "champion" | "runner-up" | "playoff-winner";

export interface ChampionshipTableRow {
  position: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  cleanSheets: number;
}

export interface ChampionshipFormMatch {
  date: string;
  opponent: string;
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  result: MatchResult;
}

export interface ChampionshipForm {
  /** How many of the team's most recent matches this covers (e.g. 6). */
  window: number;
  /** Oldest first, matching `matches` below. */
  results: MatchResult[];
  /** Points earned across just this window (3 per win, 1 per draw). */
  points: number;
  matches: ChampionshipFormMatch[];
}

export interface ChampionshipSplit {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface ChampionshipDiscipline {
  yellowCards: number;
  redCards: number;
  fouls: number;
  corners: number;
  shots: number;
  shotsOnTarget: number;
}

export interface PromotedTeam extends ChampionshipTableRow {
  promotionRoute: PromotionRoute;
  finalPosition: number;
  form: ChampionshipForm;
  home: ChampionshipSplit;
  away: ChampionshipSplit;
  discipline: ChampionshipDiscipline;
}

export interface ChampionshipSeasonData {
  season: string;
  division: string;
  source: string;
  generatedAt: string;
  matchCount: number;
  table: ChampionshipTableRow[];
  promotedTeams: PromotedTeam[];
}
