/**
 * Club history — the data model behind every team-level figure in the app.
 *
 * <club_not_squad>: a team figure always means what that CLUB did in that
 * season, whoever was playing — never what the club's current players did
 * wherever they were. The unit of record is the ledger row: one player's
 * appearance (or unused squad listing) in one fixture, for the club he was
 * registered to in that fixture. A player who later moves keeps his old
 * rows under his old club forever, so a transfer can never re-attribute
 * past club performance.
 *
 * Sources: completed seasons 2016/17-2025/26 were backfilled once from the
 * vaastav/Fantasy-Premier-League community archive (a mirror of FPL's own
 * API data — the official API doesn't serve past seasons' match data at
 * all); every season from 2026/27 on is archived weekly from the official
 * API itself (.github/workflows/club-history-archive.yml). The files live in
 * data/club-history/<season>/ at the repo root. See README → "Club history".
 *
 * Players are identified by FPL's stable `code` (element ids are reassigned
 * every season); clubs likewise by their stable team `code`.
 */

export interface LedgerTeam {
  /** That season's team id (1-20, reassigned every season). */
  id: number;
  /** Stable across seasons — the club's identity. */
  code: number;
  name: string;
  shortName: string;
}

export interface LedgerFixture {
  id: number;
  event: number | null;
  teamH: number;
  teamA: number;
  teamHScore: number | null;
  teamAScore: number | null;
  finished: boolean;
}

export interface LedgerRow {
  fixture: number;
  /** That season's element id. */
  element: number;
  /** Stable player code. */
  code: number;
  /** That season's team id — the club the player was registered to for THIS fixture. */
  team: number;
  wasHome: boolean;
  /** FPL element_type (1 GKP, 2 DEF, 3 MID, 4 FWD), when known. */
  position: number | null;
  round: number | null;
  minutes: number;
  starts: number | null;
  totalPoints: number;
  goals: number;
  assists: number;
  ownGoals: number | null;
  cleanSheets: number;
  goalsConceded: number | null;
  saves: number | null;
  bonus: number;
  bps: number | null;
  /** Null where FPL didn't track expected stats: every season before 2022/23, and 2022/23 before GW16. */
  xG: number | null;
  xA: number | null;
  xGI: number | null;
  xGC: number | null;
  /** Null where the source doesn't carry defensive contributions for this season. */
  dc: number | null;
}

/** One player's totals for one club in one season — a mid-season mover has one of these per club. */
export interface ClubPlayerSeason {
  code: number;
  minutes: number;
  starts: number | null;
  totalPoints: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  bonus: number;
  xG: number | null;
  xA: number | null;
  xGI: number | null;
  /** The player's own on-pitch xGC — NOT a share of the club's, which comes from ClubSeason.xGC. */
  xGC: number | null;
  dc: number | null;
}

/** One club's figures for one season, built from finished fixtures only. */
export interface ClubSeason {
  season: string; // "2025/26"
  code: number;
  name: string;
  shortName: string;
  /** Every fixture of the season has finished — false for the live season. */
  complete: boolean;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Matches conceding 0 — a club clean sheet, not a sum of players' clean sheets. */
  cleanSheets: number;
  leaguePoints: number;
  /** Ranked by points, then goal difference, then goals scored — the Premier League's first three tiebreakers. */
  leaguePosition: number;
  /** FPL points scored by the club's players while playing for it. */
  fantasyPoints: number;
  /** Goals scored by the club's own players (excludes opponents' own goals — the like-for-like partner for xG). */
  goals: number;
  assists: number;
  bonus: number;
  xG: number | null;
  xA: number | null;
  xGI: number | null;
  /** Summed per match: the highest xGC among the club's players in that match, i.e. that of a player on for the whole game. See aggregateClubSeason. */
  xGC: number | null;
  dc: number | null;
  players: ClubPlayerSeason[];
}
