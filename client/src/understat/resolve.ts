/**
 * Understat figures for a Data View — the same rules as FPL figures
 * (metrics/resolvePlayerStats.ts, metrics/teamStats.ts), on Understat's own
 * numbers only:
 *
 *  - Current Season: this season's totals. Before a ball is kicked, a true 0.
 *  - Last Completed Season: that season's totals, however little he played.
 *  - Historic Average: the mean per season over the player's last 4
 *    completed seasons (the same window seasons as his FPL Historic
 *    Average, from his FPL history), 0-minute seasons included as 0 —
 *    the user-set-minimum-minutes side of the owner's rule, which is where
 *    the Explorers sit.
 *
 * Per-game rates divide by games estimated from UNDERSTAT's minutes
 * (<us_minutes_for_us_rates>: FPL counts stoppage time and Understat
 * doesn't, so mixing them would be wrong), from the total minutes of the
 * seasons the stat is known for (<games_from_total_minutes>).
 *
 * "Known": Understat has a row for a season only for a linked player who
 * played. With no row, a season FPL says he played 0 minutes in is a
 * provable 0; one FPL says he played in is unknown — "—", never 0 (a
 * player still being linked, or a link on hold).
 */
import type { NormalizedPlayer, NormalizedTeam } from "../types/normalized";
import type { HistoricPlayerProfile } from "../metrics/historicAnalysis";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import { clubSeasonsForMode } from "../metrics/teamStats";
import type { UnderstatData, UsClubTotals, UsPlayerTotals, UsShotDetail, UsSlice } from "./schema";

type EnabledData = Extract<UnderstatData, { enabled: true }>;

const SITUATIONS = ["OpenPlay", "FromCorner", "SetPiece", "DirectFreekick", "Penalty"] as const;
const BODY_PARTS = ["RightFoot", "LeftFoot", "Head", "OtherBodyPart"] as const;

const LAST_ACTIONS = ["Cross", "Throughball", "TakeOn", "Rebound"] as const;

const zeroSlice = (): UsSlice => ({ shots: 0, goals: 0, xG: 0 });
const zeroDetail = (): UsShotDetail => ({
  woodwork: 0,
  blocked: 0,
  assisted: 0,
  lastActions: Object.fromEntries(LAST_ACTIONS.map((k) => [k, zeroSlice()])) as UsShotDetail["lastActions"],
  location: { box: zeroSlice(), outside: zeroSlice() },
  headers: { corner: zeroSlice(), openPlayCross: zeroSlice() },
});

/** Unknown if either side is (a season file from before the sync added it), so a sum never passes for the whole. */
function both<T>(a: T | undefined, b: T | undefined, add: (a: T, b: T) => T): T | undefined {
  return a && b ? add(a, b) : undefined;
}

function addDetail(a: UsShotDetail | undefined, b: UsShotDetail | undefined): UsShotDetail | undefined {
  if (!a || !b) return undefined;
  return {
    woodwork: a.woodwork + b.woodwork,
    blocked: a.blocked + b.blocked,
    assisted: a.assisted + b.assisted,
    lastActions: addSlices(a.lastActions, b.lastActions),
    location: both(a.location, b.location, addSlices),
    headers: both(a.headers, b.headers, addSlices),
  };
}

type Created = NonNullable<UsPlayerTotals["created"]>;
const zeroCreated = (): Created => ({ corner: { chances: 0, xA: 0 }, setPiece: { chances: 0, xA: 0 }, complete: true });
const addCreatedSlice = (a: Created["corner"], b: Created["corner"]) => ({ chances: a.chances + b.chances, xA: a.xA + b.xA });

function addCreated(a: UsPlayerTotals["created"], b: UsPlayerTotals["created"]): UsPlayerTotals["created"] {
  return both(a ?? undefined, b ?? undefined, (x, y) => ({
    corner: addCreatedSlice(x.corner, y.corner),
    setPiece: addCreatedSlice(x.setPiece, y.setPiece),
    complete: x.complete && y.complete,
  }));
}

function zeroPlayer(): UsPlayerTotals {
  return {
    understatId: "",
    appearances: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    keyPasses: 0,
    xG: 0,
    xA: 0,
    npxG: 0,
    npGoals: 0,
    xGChain: 0,
    xGBuildup: 0,
    situations: Object.fromEntries(SITUATIONS.map((k) => [k, zeroSlice()])) as UsPlayerTotals["situations"],
    bodyParts: Object.fromEntries(BODY_PARTS.map((k) => [k, zeroSlice()])) as UsPlayerTotals["bodyParts"],
    shotDetail: zeroDetail(),
    shotsComplete: true,
    facing: { shots: 0, shotsOnTarget: 0, situations: Object.fromEntries(SITUATIONS.map((k) => [k, zeroSlice()])) as UsPlayerTotals["situations"], complete: true },
    created: zeroCreated(),
  };
}

/** Unknown if either side is (a season file from before the sync added it), so a sum never passes for the whole. */
function addFacing(a: UsPlayerTotals["facing"], b: UsPlayerTotals["facing"]): UsPlayerTotals["facing"] {
  if (!a || !b) return undefined;
  return { shots: a.shots + b.shots, shotsOnTarget: a.shotsOnTarget + b.shotsOnTarget, situations: addSlices(a.situations, b.situations), complete: a.complete && b.complete };
}

function addSlices<K extends string>(a: Record<K, UsSlice>, b: Record<K, UsSlice>): Record<K, UsSlice> {
  const out = { ...a };
  for (const k of Object.keys(b) as K[]) out[k] = { shots: a[k].shots + b[k].shots, goals: a[k].goals + b[k].goals, xG: a[k].xG + b[k].xG };
  return out;
}

function addPlayers(a: UsPlayerTotals, b: UsPlayerTotals): UsPlayerTotals {
  return {
    understatId: a.understatId || b.understatId,
    appearances: a.appearances + b.appearances,
    minutes: a.minutes + b.minutes,
    goals: a.goals + b.goals,
    assists: a.assists + b.assists,
    shots: a.shots + b.shots,
    shotsOnTarget: a.shotsOnTarget + b.shotsOnTarget,
    keyPasses: a.keyPasses + b.keyPasses,
    xG: a.xG + b.xG,
    xA: a.xA + b.xA,
    npxG: a.npxG + b.npxG,
    npGoals: a.npGoals + b.npGoals,
    xGChain: a.xGChain + b.xGChain,
    xGBuildup: a.xGBuildup + b.xGBuildup,
    situations: addSlices(a.situations, b.situations),
    bodyParts: addSlices(a.bodyParts, b.bodyParts),
    shotDetail: addDetail(a.shotDetail, b.shotDetail),
    shotsComplete: a.shotsComplete && b.shotsComplete,
    facing: addFacing(a.facing, b.facing),
    created: addCreated(a.created, b.created),
  };
}

/**
 * A player's Understat figures for one Data View: the totals summed over
 * the seasons that are known, and how many seasons that is. A total is
 * shown per season (sum / seasons); a rate is worked out from the summed
 * totals. Null: nothing known for this view.
 */
export interface UsPlayerResolved {
  totals: UsPlayerTotals;
  seasons: number;
}

/** Season rows summed as a Data View's (the profile's Summary, over the view's seasons): null when there are none. */
export function sumPlayerSeasons(rows: UsPlayerTotals[]): UsPlayerResolved | null {
  return rows.length === 0 ? null : { totals: rows.reduce(addPlayers, zeroPlayer()), seasons: rows.length };
}

export interface PlayerResolveContext {
  data: EnabledData;
  historicProfiles: Map<number, HistoricPlayerProfile>;
  currentSeasonHasStarted: boolean;
}

/**
 * One season's Understat row for a player: the row, "unknown" when it can't
 * be found (no link, or a held one), or null when FPL says he played 0
 * minutes that season — nothing to show (<no_minutes_no_figures>,
 * resolvePlayerStats.ts), so "—" like his FPL figures.
 */
function seasonRow(data: EnabledData, season: string, code: number | null, fplMinutes: number | null): UsPlayerTotals | null | "unknown" {
  if (code === null) return "unknown";
  const file = data.seasons.get(season);
  if (!file) return "unknown";
  const row = file.players.get(code);
  if (row) return row;
  return fplMinutes === 0 ? null : "unknown";
}

export function resolveUnderstatPlayer(player: NormalizedPlayer, mode: AnalysisMode, ctx: PlayerResolveContext): UsPlayerResolved | null {
  const { data } = ctx;
  if (mode === "live") {
    // Before a ball is kicked nobody has played: nothing to show.
    if (!ctx.currentSeasonHasStarted) return null;
    const row = seasonRow(data, data.liveSeason, player.code, player.minutes);
    return row === "unknown" || row === null ? null : { totals: row, seasons: 1 };
  }
  const profile = ctx.historicProfiles.get(player.id);
  if (!profile) return null;
  if (mode === "lastSeason") {
    const s = profile.lastCompletedSeason;
    if (!s) return null;
    const row = seasonRow(data, s.seasonName, player.code, s.minutes);
    return row === "unknown" || row === null ? null : { totals: row, seasons: 1 };
  }
  // The one Historic Average: only window seasons of 855+ FPL minutes count
  // (HistoricPlayerProfile.floorSeasonsInWindow), the same seasons as the
  // FPL figure beside it. A season Understat has nothing for is left out.
  let totals = zeroPlayer();
  let seasons = 0;
  for (const s of profile.floorSeasonsInWindow) {
    const row = seasonRow(data, s.seasonName, player.code, s.minutes);
    if (row === "unknown" || row === null) continue;
    totals = addPlayers(totals, row);
    seasons += 1;
  }
  return seasons === 0 ? null : { totals, seasons };
}

// --- clubs -----------------------------------------------------------------

export interface UsClubResolved {
  totals: UsClubTotals;
  /** Seasons the club has a record for in this view (a Historic Average is never padded with seasons it wasn't in the league). */
  seasons: number;
}

function zeroClub(): UsClubTotals {
  const s = () => Object.fromEntries(SITUATIONS.map((k) => [k, zeroSlice()])) as UsClubTotals["situationsFor"];
  return {
    understatTeamId: "",
    played: 0,
    xG: 0,
    xGA: 0,
    npxG: 0,
    npxGA: 0,
    ppdaAtt: 0,
    ppdaDef: 0,
    ppdaAllowedAtt: 0,
    ppdaAllowedDef: 0,
    deep: 0,
    deepAllowed: 0,
    xPts: 0,
    pts: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    assists: 0,
    xA: 0,
    keyPasses: 0,
    shots: 0,
    shotsOnTarget: 0,
    shotsAgainst: 0,
    shotsOnTargetAgainst: 0,
    situationsFor: s(),
    situationsAgainst: s(),
    shotDetailFor: zeroDetail(),
    shotDetailAgainst: zeroDetail(),
    shotsCompleteFor: true,
    shotsCompleteAgainst: true,
  };
}

function addClubs(a: UsClubTotals, b: UsClubTotals): UsClubTotals {
  const out = { ...a } as UsClubTotals;
  for (const k of Object.keys(a) as (keyof UsClubTotals)[]) {
    const av = a[k];
    const bv = b[k];
    if (typeof av === "number" && typeof bv === "number") (out as unknown as Record<string, number>)[k] = av + bv;
  }
  out.understatTeamId = a.understatTeamId || b.understatTeamId;
  out.situationsFor = addSlices(a.situationsFor, b.situationsFor);
  out.situationsAgainst = addSlices(a.situationsAgainst, b.situationsAgainst);
  out.shotDetailFor = addDetail(a.shotDetailFor, b.shotDetailFor);
  out.shotDetailAgainst = addDetail(a.shotDetailAgainst, b.shotDetailAgainst);
  out.shotsCompleteFor = a.shotsCompleteFor && b.shotsCompleteFor;
  out.shotsCompleteAgainst = a.shotsCompleteAgainst && b.shotsCompleteAgainst;
  return out;
}

export interface ClubResolveContext {
  data: EnabledData;
  /** AppStateContext.historicReferenceSeason — the last completed season. */
  referenceSeason: string | null;
  currentSeasonHasStarted: boolean;
}

/**
 * Same seasons as the FPL club figures (clubSeasonsForMode); a club with no
 * record for the view, or no match played in it (pre-season included), is
 * null, shown "—" (<no_matches_no_figures>, teamStats.ts).
 */
export function resolveUnderstatClub(team: NormalizedTeam, mode: AnalysisMode, ctx: ClubResolveContext): UsClubResolved | null {
  if (team.code === null) return null;
  if (mode === "live" && !ctx.currentSeasonHasStarted) return null;
  let totals = zeroClub();
  let seasons = 0;
  for (const season of clubSeasonsForMode(mode, ctx.referenceSeason)) {
    const row = ctx.data.seasons.get(season)?.clubs.get(team.code);
    if (!row || row.played === 0) continue;
    totals = addClubs(totals, row);
    seasons += 1;
  }
  return seasons === 0 ? null : { totals, seasons };
}
