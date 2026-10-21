/**
 * Understat data as this project stores it (data/understat/), plus the
 * app-ready season summaries built from it. Understat ids are kept as
 * strings, exactly as Understat sends them; FPL codes are numbers.
 *
 * Seasons are FPL-style names ("2025/26") everywhere outside
 * understatApi.ts; Understat itself labels a season by its start year.
 */

export type Side = "h" | "a";

/** One club's line in one match, from Understat's league page ("history"). */
export interface UsTeamMatch {
  teamId: string;
  datetime: string;
  side: Side;
  xG: number;
  xGA: number;
  npxG: number;
  npxGA: number;
  /** PPDA = opponent passes allowed (att) / defensive actions (def), both kept so season figures are ratios of totals. */
  ppdaAtt: number;
  ppdaDef: number;
  ppdaAllowedAtt: number;
  ppdaAllowedDef: number;
  deep: number;
  deepAllowed: number;
  scored: number;
  missed: number;
  xPts: number;
  result: string;
  pts: number;
}

export interface UsTeam {
  id: string;
  title: string;
  history: UsTeamMatch[];
}

export interface UsMatchSummary {
  id: string;
  datetime: string;
  isResult: boolean;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  homeXG: number | null;
  awayXG: number | null;
  /** Understat's home win / draw / away win chances from simulating every shot. */
  forecastWin: number | null;
  forecastDraw: number | null;
  forecastLoss: number | null;
}

export interface UsLeague {
  year: number;
  teams: UsTeam[];
  matches: UsMatchSummary[];
  players: { id: string; name: string }[];
}

/** One player's line in one match (Understat's roster entry). */
export interface UsAppearance {
  matchId: string;
  playerId: string;
  playerName: string;
  teamId: string;
  side: Side;
  /** Understat's position code for the match (GK, DC, AMR, FW, …, Sub). */
  position: string;
  minutes: number;
  goals: number;
  ownGoals: number;
  shots: number;
  xG: number;
  assists: number;
  xA: number;
  keyPasses: number;
  xGChain: number;
  xGBuildup: number;
  yellowCards: number;
  redCards: number;
}

export interface UsShot {
  shotId: string;
  matchId: string;
  playerId: string;
  playerName: string;
  /** The shooting team's side ("h" home, "a" away). */
  side: Side;
  minute: number;
  /** Pitch position, 0–1 along the length (x, towards goal) and width (y). */
  x: number;
  y: number;
  xG: number;
  /** Goal, SavedShot, MissedShots, BlockedShot, ShotOnPost, OwnGoal. */
  result: string;
  /** OpenPlay, FromCorner, SetPiece, DirectFreekick, Penalty. */
  situation: string;
  /** RightFoot, LeftFoot, Head, OtherBodyPart. */
  shotType: string;
  lastAction: string;
  /** Name of the player who made the pass, when there was one. */
  assistedBy: string;
}

export interface UsMatch {
  matchId: string;
  appearances: UsAppearance[];
  shots: UsShot[];
}

/** One club's season in one formation, from Understat's team page ("statistics.formation"): time spent in it, and the shots for and against while in it. */
export interface UsFormation {
  teamId: string;
  /** "4-2-3-1", as Understat names it. */
  formation: string;
  minutes: number;
  shots: number;
  goals: number;
  xG: number;
  shotsAgainst: number;
  goalsAgainst: number;
  xGA: number;
}

/** Understat's team page for one season: its formation figures, and the played matches they cover. */
export interface UsTeamSeason {
  teamId: string;
  formations: UsFormation[];
  playedMatchIds: string[];
}

// --- linking ------------------------------------------------------------------

export type LinkStatus = "confirmed" | "held" | "disputed";

/** One FPL player (permanent `code`) and the Understat player he is. */
export interface PlayerLink {
  fplCode: number;
  understatId: string;
  status: LinkStatus;
  /** FPL name and Understat name when the link was made — for people reading the file. */
  fplName: string;
  understatName: string;
  /** First season the link was made from. */
  season: string;
  /** Date (YYYY-MM-DD) the link reached its current status. */
  since: string;
  note: string;
}

/** A manual decision, applied on every run: "pair" forces a link, "never" forbids one. */
export interface LinkOverride {
  fplCode: number;
  understatId: string;
  action: "pair" | "never";
  note: string;
}

/** One club's pairing for one season: FPL's permanent club code to Understat's team id. */
export interface ClubPairing {
  fplTeamCode: number;
  understatTeamId: string;
  understatTitle: string;
}

// --- app-ready season summaries (data/understat/app/<season>.json) -------------

/** Shots, goals and xG for one slice of a player's or club's shots (one situation, one body part…). */
export interface ShotSlice {
  shots: number;
  goals: number;
  xG: number;
}

/**
 * More about a set of shots, from Understat's shot list: how they ended
 * (off the woodwork, blocked), whether a team-mate is named as setting
 * them up, and the action just before them (a cross, a through ball, a
 * dribble, a rebound). Counts only; own goals are nobody's shots.
 */
export interface ShotDetail {
  /** Understat's "ShotOnPost". */
  woodwork: number;
  /** Understat's "BlockedShot". */
  blocked: number;
  /** Shots with a named assisting team-mate. */
  assisted: number;
  lastActions: Record<ShotLastAction, ShotSlice>;
}

export interface PlayerSeasonTotals {
  understatId: string;
  /** Matches with minutes > 0. */
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  keyPasses: number;
  xG: number;
  xA: number;
  npxG: number;
  npGoals: number;
  xGChain: number;
  xGBuildup: number;
  situations: Record<ShotSituation, ShotSlice>;
  bodyParts: Record<ShotBodyPart, ShotSlice>;
  shotDetail: ShotDetail;
  /**
   * <incomplete_shot_list>: false when Understat's shot list for one of his
   * matches is missing shots its own line-up counts (seen once in 3,865
   * matches: McGoldrick, Sheffield Utd v Everton, 26 Dec 2020). His
   * shot-based figures for the season (shots, on target, NPxG, the
   * situation and body-part splits) are then "—"; xG, xA and the rest come
   * from the line-up and are unaffected.
   */
  shotsComplete: boolean;
  /**
   * <shots_faced_on_pitch> (../onPitch.ts): his club's opponents' shots
   * while he was on the pitch — what a defender's or goalkeeper's Shots
   * Faced map is ranked on. `complete` false when Understat's shot list
   * for one of those opponents is short (<incomplete_shot_list>).
   */
  facing: { shots: number; shotsOnTarget: number; situations: Record<ShotSituation, ShotSlice>; complete: boolean };
}

export interface ClubSeasonTotals {
  understatTeamId: string;
  played: number;
  xG: number;
  xGA: number;
  npxG: number;
  npxGA: number;
  ppdaAtt: number;
  ppdaDef: number;
  ppdaAllowedAtt: number;
  ppdaAllowedDef: number;
  deep: number;
  deepAllowed: number;
  xPts: number;
  pts: number;
  goalsFor: number;
  goalsAgainst: number;
  assists: number;
  xA: number;
  keyPasses: number;
  shots: number;
  shotsOnTarget: number;
  shotsAgainst: number;
  shotsOnTargetAgainst: number;
  situationsFor: Record<ShotSituation, ShotSlice>;
  situationsAgainst: Record<ShotSituation, ShotSlice>;
  shotDetailFor: ShotDetail;
  shotDetailAgainst: ShotDetail;
  /** <incomplete_shot_list> for the club's own shots, and for its opponents'. */
  shotsCompleteFor: boolean;
  shotsCompleteAgainst: boolean;
}

export const SHOT_SITUATIONS = ["OpenPlay", "FromCorner", "SetPiece", "DirectFreekick", "Penalty"] as const;
export type ShotSituation = (typeof SHOT_SITUATIONS)[number];
export const SHOT_BODY_PARTS = ["RightFoot", "LeftFoot", "Head", "OtherBodyPart"] as const;
export type ShotBodyPart = (typeof SHOT_BODY_PARTS)[number];
/** The actions before a shot that ShotDetail splits out (Understat's last_action; "TakeOn" is a dribble). */
export const SHOT_LAST_ACTIONS = ["Cross", "Throughball", "TakeOn", "Rebound"] as const;
export type ShotLastAction = (typeof SHOT_LAST_ACTIONS)[number];
/** Understat shot results that reached the goal frame (scored or saved) — a shot off the post didn't. */
export const ON_TARGET_RESULTS = new Set(["Goal", "SavedShot"]);

export interface AppSeasonFile {
  schema: 1;
  season: string;
  /** Every match Understat has finished for the season is in these figures. */
  complete: boolean;
  matchesIncluded: number;
  latestMatchDate: string | null;
  /** Keyed by FPL player code — confirmed links only. */
  players: Record<string, PlayerSeasonTotals>;
  /** Keyed by FPL club code. */
  clubs: Record<string, ClubSeasonTotals>;
}

// --- app-ready profile files (data/understat/app/profile/<season>.json) --------

/**
 * Per-match detail for the player and team profiles, one season per file,
 * read by the server (route.ts) and sliced to one player or club per
 * request — never sent whole. Rows are plain lists, in the order named
 * below, to keep a season's file small. Only matches paired with a
 * finished FPL fixture (so checked) are in it, and every row carries that
 * FPL fixture id, which is how the profiles' match logs line them up.
 */
/**
 * [fplFixtureId, position (Understat's code: GK, DC, AMR, FW, …, or Sub), minutes, xG, xA, assists, fplClubCode] —
 * matches he played in, and the club he played for in each (his Shots Faced are its opponents').
 */
export type ProfileMatchRow = [number, string, number, number, number, number, number | null];
/** [fplFixtureId, minute, x, y, xG, result, situation, shotType] — x, y as UsShot (from the shooter's side, x towards goal). */
export type ProfileShotRow = [number, number, number, number, number, string, string, string];
/**
 * [fplFixtureId, win, draw, loss, xG, xGA, xA, assists] — Understat's
 * chances of each result from the match's shots, worked out after it, from
 * this club's side; its xG and xG against (the club's match line, per
 * chance — <club_xg_is_per_chance>); and its players' xA and assists.
 */
export type ProfileClubMatchRow = [number, number | null, number | null, number | null, number, number, number, number];
/**
 * [fplFixtureId, starters] — a club's starting XI in one match, each
 * [position, fplCode (null when he isn't linked to an FPL player), Understat's name].
 * Understat gives each starter his slot in the formation the club started
 * in, so the XI's positions name that formation (client/src/understat/lineups.ts).
 */
export type ProfileLineupRow = [number, [string, number | null, string][]];

export interface ProfileFormation {
  formation: string;
  minutes: number;
  shots: number;
  goals: number;
  xG: number;
  shotsAgainst: number;
  goalsAgainst: number;
  xGA: number;
}

export interface AppProfileFile {
  schema: 1;
  season: string;
  /** Keyed by FPL player code — confirmed links only. */
  players: Record<string, { matches: ProfileMatchRow[]; shots: ProfileShotRow[] }>;
  /** Keyed by FPL club code. Its shots against are the opponents' shots in its matches (route.ts). */
  clubs: Record<string, { matches: ProfileClubMatchRow[]; shots: ProfileShotRow[]; formations: ProfileFormation[] | null; lineups: ProfileLineupRow[] }>;
}

export interface UnderstatStatus {
  schema: 1;
  generatedAt: string;
  liveSeason: string;
  /** Seasons with an app file, oldest first. */
  seasons: string[];
  latestMatchDate: string | null;
  /** FPL fixtures finished more than a day ago that Understat doesn't have yet: fixture id -> date first noticed missing. */
  missingFixtures: Record<string, string>;
  links: { confirmed: number; held: number; disputed: number };
}

/** Hand-edited switch (data/understat/control.json); the sync job never writes it. */
export interface UnderstatControl {
  enabled: boolean;
  note?: string;
}
