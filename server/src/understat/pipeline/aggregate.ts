/**
 * Turns one season's stored Understat data into the summary the app reads
 * (data/understat/app/<season>.json): season totals per FPL player (by
 * permanent code, confirmed links only) and per FPL club (by club code).
 *
 * Club figures are what the CLUB did — every player who played for it in
 * each match counts, whoever they are and wherever they are now (the
 * owner's team-analysis rule), so clubs need no player links at all.
 *
 * Totals only: every rate the app shows (per game, per shot, PPDA) is
 * worked out from these totals, never averaged from per-match rates.
 */
import { ON_TARGET_RESULTS, SHOT_BODY_PARTS, SHOT_LAST_ACTIONS, SHOT_SITUATIONS } from "./types.js";
import type {
  AppSeasonFile,
  ClubPairing,
  ClubSeasonTotals,
  PlayerLink,
  PlayerSeasonTotals,
  ShotBodyPart,
  ShotDetail,
  ShotLastAction,
  ShotSituation,
  ShotSlice,
  UsShot,
} from "./types.js";
import type { SeasonData } from "./files.js";
import { onPitchWindow, wasOnPitch, type OnPitch } from "../onPitch.js";
import { isInsideBox } from "./shotLocation.js";

const round = (v: number, dp = 4) => Math.round(v * 10 ** dp) / 10 ** dp;
const emptySlice = (): ShotSlice => ({ shots: 0, goals: 0, xG: 0 });
const slices = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, emptySlice()])) as Record<K, ShotSlice>;

function addShot(slice: ShotSlice, s: UsShot) {
  slice.shots += 1;
  if (s.result === "Goal") slice.goals += 1;
  slice.xG += s.xG;
}

function roundSlices<K extends string>(r: Record<K, ShotSlice>): Record<K, ShotSlice> {
  for (const k of Object.keys(r) as K[]) r[k].xG = round(r[k].xG);
  return r;
}

const emptyDetail = (): ShotDetail => ({
  woodwork: 0,
  blocked: 0,
  assisted: 0,
  lastActions: slices(SHOT_LAST_ACTIONS),
  location: { box: emptySlice(), outside: emptySlice() },
  headers: { corner: emptySlice(), openPlayCross: emptySlice() },
});

function addShotDetail(d: ShotDetail, s: UsShot) {
  if (s.result === "ShotOnPost") d.woodwork += 1;
  if (s.result === "BlockedShot") d.blocked += 1;
  if (s.assistedBy !== "") d.assisted += 1;
  if ((SHOT_LAST_ACTIONS as readonly string[]).includes(s.lastAction)) addShot(d.lastActions[s.lastAction as ShotLastAction], s);
  addShot(isInsideBox(s) ? d.location.box : d.location.outside, s);
  if (s.shotType === "Head") {
    if (s.situation === "FromCorner") addShot(d.headers.corner, s);
    else if (s.situation === "OpenPlay" && s.lastAction === "Cross") addShot(d.headers.openPlayCross, s);
  }
}

function roundDetail(d: ShotDetail) {
  roundSlices(d.lastActions);
  roundSlices(d.location);
  roundSlices(d.headers);
}

const emptyCreated = (): PlayerSeasonTotals["created"] => ({ corner: { chances: 0, xA: 0 }, setPiece: { chances: 0, xA: 0 }, complete: true });
/** How far a match's rebuilt xA may sit from the line-up's (Understat's own rounding). */
const XA_TOLERANCE = 0.01;

/** Own goals are listed among Understat's shots but aren't the shooter's attempt at his own goal — they count for nobody's shots. */
const isRealShot = (s: UsShot) => s.result !== "OwnGoal";

/**
 * `checkedMatchIds`: the Understat matches paired with a finished FPL
 * fixture this run, so checked against FPL (scores, goals). Only those
 * count; a result FPL hasn't confirmed yet waits for a later run rather
 * than going out unchecked (audit 2026-10-18 H3).
 */
export function buildAppSeason(data: SeasonData, links: Map<number, PlayerLink>, complete: boolean, checkedMatchIds: ReadonlySet<string>): AppSeasonFile {
  const resultMatchIds = new Set(data.matches.filter((m) => m.isResult && checkedMatchIds.has(m.id)).map((m) => m.id));
  const matchById = new Map(data.matches.map((m) => [m.id, m]));
  const appearances = data.appearances.filter((a) => resultMatchIds.has(a.matchId));
  const shots = data.shots.filter((s) => resultMatchIds.has(s.matchId) && isRealShot(s));

  // <incomplete_shot_list>: players whose line-up shot count, in some match,
  // isn't matched by Understat's shot list — and the sides they played for.
  const listedShots = new Map<string, number>();
  for (const s of shots) listedShots.set(`${s.matchId}|${s.playerId}`, (listedShots.get(`${s.matchId}|${s.playerId}`) ?? 0) + 1);
  const shortPlayers = new Set<string>();
  const shortSides = new Set<string>();
  for (const a of appearances) {
    if (a.shots !== (listedShots.get(`${a.matchId}|${a.playerId}`) ?? 0)) {
      shortPlayers.add(a.playerId);
      shortSides.add(`${a.matchId}|${a.side}`);
    }
  }

  // --- players ---
  const codeByUnderstatId = new Map<string, number>();
  for (const l of links.values()) if (l.status === "confirmed") codeByUnderstatId.set(l.understatId, l.fplCode);

  const players: Record<string, PlayerSeasonTotals> = {};
  const totalsFor = (understatId: string): PlayerSeasonTotals | null => {
    const code = codeByUnderstatId.get(understatId);
    if (code === undefined) return null;
    players[code] ??= {
      understatId,
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
      situations: slices(SHOT_SITUATIONS),
      bodyParts: slices(SHOT_BODY_PARTS),
      shotDetail: emptyDetail(),
      shotsComplete: !shortPlayers.has(understatId),
      facing: { shots: 0, shotsOnTarget: 0, situations: slices(SHOT_SITUATIONS), complete: true },
      created: emptyCreated(),
    };
    return players[code];
  };
  // Who was on the pitch for each side of each match, and when (<shots_faced_on_pitch>).
  const onPitchBySide = new Map<string, { t: PlayerSeasonTotals; on: OnPitch }[]>();
  const otherSide = (side: string) => (side === "h" ? "a" : "h");
  for (const a of appearances) {
    if (a.minutes <= 0) continue;
    const t = totalsFor(a.playerId);
    if (!t) continue;
    const key = `${a.matchId}|${a.side}`;
    onPitchBySide.set(key, [...(onPitchBySide.get(key) ?? []), { t, on: onPitchWindow(a.position, a.minutes) }]);
    if (shortSides.has(`${a.matchId}|${otherSide(a.side)}`)) t.facing.complete = false;
    t.appearances += 1;
    t.minutes += a.minutes;
    t.goals += a.goals;
    t.assists += a.assists;
    t.keyPasses += a.keyPasses;
    t.xG += a.xG;
    t.xA += a.xA;
    t.xGChain += a.xGChain;
    t.xGBuildup += a.xGBuildup;
  }
  for (const s of shots) {
    const t = totalsFor(s.playerId);
    if (!t) continue;
    t.shots += 1;
    if (ON_TARGET_RESULTS.has(s.result)) t.shotsOnTarget += 1;
    if (s.situation !== "Penalty") {
      t.npxG += s.xG;
      if (s.result === "Goal") t.npGoals += 1;
    }
    if ((SHOT_SITUATIONS as readonly string[]).includes(s.situation)) addShot(t.situations[s.situation as ShotSituation], s);
    if ((SHOT_BODY_PARTS as readonly string[]).includes(s.shotType)) addShot(t.bodyParts[s.shotType as ShotBodyPart], s);
    addShotDetail(t.shotDetail, s);
  }
  for (const s of shots) {
    for (const { t, on } of onPitchBySide.get(`${s.matchId}|${otherSide(s.side)}`) ?? []) {
      if (!wasOnPitch(on, s.minute)) continue;
      t.facing.shots += 1;
      if (ON_TARGET_RESULTS.has(s.result)) t.facing.shotsOnTarget += 1;
      if ((SHOT_SITUATIONS as readonly string[]).includes(s.situation)) addShot(t.facing.situations[s.situation as ShotSituation], s);
    }
  }
  // <created_by_situation>: a shot names its assister, matched to his side's line-up that match (null where two share the name).
  const assisterId = new Map<string, string | null>();
  for (const a of appearances) {
    const key = `${a.matchId}|${a.side}|${a.playerName}`;
    assisterId.set(key, assisterId.has(key) ? null : a.playerId);
  }
  const rebuiltXA = new Map<string, number>();
  for (const s of shots) {
    if (s.assistedBy === "") continue;
    const id = assisterId.get(`${s.matchId}|${s.side}|${s.assistedBy}`);
    if (!id) continue;
    rebuiltXA.set(`${s.matchId}|${id}`, (rebuiltXA.get(`${s.matchId}|${id}`) ?? 0) + s.xG);
    const t = totalsFor(id);
    if (!t) continue;
    for (const [slice, counts] of [
      [t.created.corner, s.situation === "FromCorner"],
      [t.created.setPiece, s.situation !== "OpenPlay"],
    ] as const) {
      if (!counts) continue;
      slice.chances += 1;
      slice.xA += s.xG;
    }
  }
  // Every match's matched shots must add up to his line-up xA, or the split would be an undercount.
  for (const a of appearances) {
    if (a.minutes <= 0) continue;
    const t = totalsFor(a.playerId);
    if (t && Math.abs((rebuiltXA.get(`${a.matchId}|${a.playerId}`) ?? 0) - a.xA) > XA_TOLERANCE) t.created.complete = false;
  }
  for (const t of Object.values(players)) {
    roundSlices(t.facing.situations);
    for (const k of ["xG", "xA", "npxG", "xGChain", "xGBuildup"] as const) t[k] = round(t[k]);
    roundSlices(t.situations);
    roundSlices(t.bodyParts);
    roundDetail(t.shotDetail);
    t.created.corner.xA = round(t.created.corner.xA);
    t.created.setPiece.xA = round(t.created.setPiece.xA);
  }

  // --- clubs ---
  const codeByTeamId = new Map(data.clubs.map((c: ClubPairing) => [c.understatTeamId, c.fplTeamCode]));
  const clubs: Record<string, ClubSeasonTotals> = {};
  const clubFor = (teamId: string): ClubSeasonTotals | null => {
    const code = codeByTeamId.get(teamId);
    if (code === undefined) return null;
    clubs[code] ??= {
      understatTeamId: teamId,
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
      situationsFor: slices(SHOT_SITUATIONS),
      situationsAgainst: slices(SHOT_SITUATIONS),
      shotDetailFor: emptyDetail(),
      shotDetailAgainst: emptyDetail(),
      shotsCompleteFor: true,
      shotsCompleteAgainst: true,
    };
    return clubs[code];
  };
  for (const tm of data.teamMatches) {
    if (!resultMatchIds.has(tm.matchId)) continue;
    const c = clubFor(tm.teamId);
    if (!c) continue;
    c.played += 1;
    c.xG += tm.xG;
    c.xGA += tm.xGA;
    c.npxG += tm.npxG;
    c.npxGA += tm.npxGA;
    c.ppdaAtt += tm.ppdaAtt;
    c.ppdaDef += tm.ppdaDef;
    c.ppdaAllowedAtt += tm.ppdaAllowedAtt;
    c.ppdaAllowedDef += tm.ppdaAllowedDef;
    c.deep += tm.deep;
    c.deepAllowed += tm.deepAllowed;
    c.xPts += tm.xPts;
    c.pts += tm.pts;
    c.goalsFor += tm.scored;
    c.goalsAgainst += tm.missed;
  }
  for (const a of appearances) {
    const c = clubFor(a.teamId);
    if (!c) continue;
    c.assists += a.assists;
    c.xA += a.xA;
    c.keyPasses += a.keyPasses;
  }
  for (const s of shots) {
    const m = matchById.get(s.matchId);
    if (!m) continue;
    const forTeam = s.side === "h" ? m.homeTeamId : m.awayTeamId;
    const againstTeam = s.side === "h" ? m.awayTeamId : m.homeTeamId;
    const attacking = clubFor(forTeam);
    const defending = clubFor(againstTeam);
    const onTarget = ON_TARGET_RESULTS.has(s.result);
    const known = (SHOT_SITUATIONS as readonly string[]).includes(s.situation);
    if (attacking) {
      attacking.shots += 1;
      if (onTarget) attacking.shotsOnTarget += 1;
      if (known) addShot(attacking.situationsFor[s.situation as ShotSituation], s);
      addShotDetail(attacking.shotDetailFor, s);
    }
    if (defending) {
      defending.shotsAgainst += 1;
      if (onTarget) defending.shotsOnTargetAgainst += 1;
      if (known) addShot(defending.situationsAgainst[s.situation as ShotSituation], s);
      addShotDetail(defending.shotDetailAgainst, s);
    }
  }
  for (const key of shortSides) {
    const [matchId, side] = key.split("|");
    const m = matchById.get(matchId);
    if (!m) continue;
    const short = clubFor(side === "h" ? m.homeTeamId : m.awayTeamId);
    const opponent = clubFor(side === "h" ? m.awayTeamId : m.homeTeamId);
    if (short) short.shotsCompleteFor = false;
    if (opponent) opponent.shotsCompleteAgainst = false;
  }
  for (const c of Object.values(clubs)) {
    for (const k of ["xG", "xGA", "npxG", "npxGA", "xPts", "xA"] as const) c[k] = round(c[k]);
    roundSlices(c.situationsFor);
    roundSlices(c.situationsAgainst);
    roundDetail(c.shotDetailFor);
    roundDetail(c.shotDetailAgainst);
  }

  const resultDates = data.matches.filter((m) => resultMatchIds.has(m.id)).map((m) => m.datetime.slice(0, 10));
  return {
    schema: 1,
    season: data.season,
    complete,
    matchesIncluded: resultMatchIds.size,
    latestMatchDate: resultDates.length > 0 ? resultDates.sort().at(-1)! : null,
    players,
    clubs,
  };
}
