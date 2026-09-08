export type Position = "GKP" | "DEF" | "MID" | "FWD";

export interface NormalizedTeam {
  id: number;
  name: string;
  shortName: string;
  position: number | null;
  played: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  unavailable: boolean;
}

/**
 * Every numeric field is `number | null`. `null` means the metric is
 * genuinely unavailable from the live API for this player (never a
 * silently-substituted 0 or another statistic) — the UI renders "—".
 */
export interface NormalizedPlayer {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  teamId: number;
  teamName: string;
  teamShortName: string;
  position: Position;

  price: number; // £ millions
  ownership: number | null; // percent

  /**
   * These seven fields are `number` for the live/raw player (fetched
   * straight from bootstrap-static, always a real number) but become
   * `null` on a RESOLVED player (see resolvePlayerStats.ts) when there's
   * nothing to show for the selected analysis mode — e.g. no qualifying
   * historic seasons. A resolved player is still a full NormalizedPlayer
   * (same type, never a separate one, and never dropped from a list),
   * just with these specific fields null where that mode has no answer;
   * every display already renders null as "—" via utils/format.ts.
   */
  totalPoints: number | null;
  pointsPerGame: number | null;
  /** FPL's own official expected-points prediction for the next gameweek — not derived by this app. See metrics/expectedPoints.ts. */
  epNext: number | null;
  minutes: number | null;
  starts: number | null;
  goals: number | null;
  assists: number | null;
  cleanSheets: number | null;
  bonus: number | null;
  bps: number | null;
  ictIndex: number | null;

  // Expected-stats totals. API-supplied where the field exists on the live response.
  xG: number | null;
  xA: number | null;
  xGI: number | null;
  xGC: number | null;

  // API-supplied per-90 expected-stats (authoritative — see per90_validation
  // rule in README). Independently cross-checked in metrics/validation.ts.
  xGPer90: number | null;
  xAPer90: number | null;
  xGIPer90: number | null;
  xGCPer90: number | null;

  defensiveContributions: number | null;
  defensiveContributionsPer90: number | null;

  status: string;
  news: string;
  chanceOfPlayingNextRound: number | null;

  /** FPL's own short-term form rating (points/game over a recent rolling window — distinct from season-long pointsPerGame). */
  form: number | null;

  // Transfer-market fields, all API-supplied. See metrics/priceChange.ts for
  // anything derived from these (e.g. an owner-count estimate).
  transfersInEvent: number | null;
  transfersOutEvent: number | null;
  transfersInTotal: number | null;
  transfersOutTotal: number | null;
  /** Signed £m price movement since the last gameweek deadline (0 if unchanged this event). */
  costChangeEvent: number | null;
  /** Signed £m price movement since the start of the season. */
  costChangeStart: number | null;

  /** FPL's own official Price Change Predictor — new for 2026/27. Null if the live build doesn't carry this field yet (checked via AdvancedFieldAvailability, never assumed). */
  priceChange: PriceChangeInfo | null;
}

export interface PriceChangeProjection {
  /** Days ahead: 0 = today's next update, 1 = tomorrow, 2 = the day after. */
  offsetDays: number;
  projectedPercent: number;
  /** FPL's own confidence figure, observed roughly -5..5 (sign = direction, magnitude = confidence) — no official documentation of the exact scale beyond that. */
  likelihood: number;
}

export interface PriceChangeInfo {
  /** Current live progress toward today's price-change threshold — a signed percentage; FPL describes over 100 as "expected to cross the threshold at the next 00:00 UK update", still not a guarantee. */
  percent: number;
  /** FPL's own forward projections for today/tomorrow/the day after. */
  projections: PriceChangeProjection[];
  lockedUntil: string | null;
  /** True while FPL doesn't yet consider there to be enough transfer history for a reliable prediction (e.g. a brand-new signing). */
  calibrating: boolean;
}

export interface NormalizedEvent {
  id: number;
  name: string;
  deadlineTime: string;
  finished: boolean;
  isCurrent: boolean;
  isNext: boolean;
  isPrevious: boolean;
}

export type GameweekState =
  | { kind: "current"; event: NormalizedEvent }
  | { kind: "last-completed"; event: NormalizedEvent }
  | { kind: "pre-season" };

/** One chip type's availability window for one half of the season — see raw.ts RawChip. Sourced directly from bootstrap-static's top-level "chips" array, never a hard-coded gameweek assumption. */
export interface ChipWindow {
  chip: "wildcard" | "freehit" | "bboost" | "3xc";
  /** 1 = first half of the season, 2 = second half. */
  half: 1 | 2;
  startEvent: number;
  stopEvent: number;
}

export interface NormalizedFixture {
  id: number;
  eventId: number | null;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  kickoffTime: string | null;
  finished: boolean;
  /** 1 (easiest) to 5 (hardest), FPL's own rating, from each side's own perspective. */
  homeDifficulty: number;
  awayDifficulty: number;
}

export interface PlayerGameweekHistory {
  round: number;
  minutes: number;
  starts: number | null;
  totalPoints: number;
  wasHome: boolean;
  opponentTeamId: number;
  /** This player's own team's/the opponent's goals in this match, already resolved for home vs away — null only if the match's score is somehow missing (shouldn't happen for a played gameweek). */
  teamScore: number | null;
  opponentScore: number | null;
  goals: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
  ownGoals: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  bonus: number;
  bps: number;
  /** Always real for the live season (never a pre-2024/25 placeholder, unlike the same fields read from history_past). */
  defensiveContribution: number;
  tackles: number;
  clearancesBlocksInterceptions: number;
  recoveries: number;
  xG: number | null;
  xA: number | null;
  xGI: number | null;
  xGC: number | null;
}

/**
 * One prior FPL season's totals for a player — never the live/current
 * season (that's PlayerGameweekHistory). A player's full career history is
 * PlayerSeasonHistory[], oldest first; a player new to the FPL API has an
 * empty array, not a missing one.
 */
export interface PlayerSeasonHistory {
  seasonName: string; // e.g. "2023/24"
  totalPoints: number;
  minutes: number;
  starts: number | null;
  goals: number;
  assists: number;
  cleanSheets: number;
  bonus: number;
  bps: number;
  ictIndex: number | null;
  startCost: number | null; // £m, price at start of that season
  endCost: number | null; // £m, price at end of that season
  // Expected-stats fields exist as far back as the API's history_past
  // goes, but seasons before FPL tracked xG show these as a placeholder
  // "0.00" rather than omitting the field — there is no reliable way to
  // tell a real zero from "not tracked yet" for older seasons. See README.
  xG: number | null;
  xA: number | null;
  xGI: number | null;
  xGC: number | null;
  /** Null for seasons before 2024/25, when this stat was introduced — never a placeholder 0. See normalizeElementSummary.ts. */
  defensiveContribution: number | null;
}
