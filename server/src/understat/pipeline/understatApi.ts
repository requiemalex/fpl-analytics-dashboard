/**
 * The only code that talks to understat.com — run by the daily sync job
 * (scripts/understat/sync.ts), never by the app. Polite by design: one
 * request at a time with a pause between them, an honest User-Agent, and a
 * hard stop (UnderstatBlockedError) the moment Understat refuses us, so a
 * block never turns into a hammering retry loop.
 *
 * Every response is shape-checked here (parseLeague/parseMatch) before
 * anything else sees it: a changed format is UnderstatFormatError, which
 * fails the run with nothing written, rather than a half-understood file
 * reaching the app.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { UsAppearance, UsFormation, UsLeague, UsMatch, UsMatchSummary, UsShot, UsTeamMatch, UsTeamSeason } from "./types.js";

const BASE = "https://understat.com";
const USER_AGENT = "fpl-analytics-dashboard data sync (+https://github.com/requiemalex/fpl-analytics-dashboard)";

/** Understat refused or challenged us (403/429, or an HTML page where data should be). Never retried past the client's attempts — the run stops. */
export class UnderstatBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnderstatBlockedError";
  }
}

/** Understat answered, but not in the shape this code understands — its format has changed. */
export class UnderstatFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnderstatFormatError";
  }
}

export interface UnderstatClientOptions {
  /** Pause between consecutive requests. */
  delayMs?: number;
  attempts?: number;
  timeoutMs?: number;
  /** Local runs only: keep each raw reply here and reuse it instead of asking again (never set in the scheduled job). */
  cacheDir?: string;
}

export interface FetchOptions {
  /** Ask Understat even if a cached copy exists (the live season, recent matches). */
  fresh?: boolean;
}

export interface UnderstatClient {
  league(seasonStartYear: number, opts?: FetchOptions): Promise<UsLeague>;
  match(matchId: string, opts?: FetchOptions): Promise<UsMatch>;
  /** One club's season page (its formation figures), by Understat's team title and id — the id is checked against the reply. */
  team(title: string, teamId: string, seasonStartYear: number, opts?: FetchOptions): Promise<UsTeamSeason>;
  /** Requests made so far — reported in the run summary. */
  requestCount(): number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createUnderstatClient(options: UnderstatClientOptions = {}): UnderstatClient {
  const delayMs = options.delayMs ?? 800;
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 20_000;
  let lastRequestAt = 0;
  let count = 0;

  const cachePath = (path: string) => (options.cacheDir ? join(options.cacheDir, `${path.replace(/[^A-Za-z0-9]+/g, "_")}.json`) : null);

  async function getJson(path: string, opts: FetchOptions = {}): Promise<unknown> {
    const cached = cachePath(path);
    if (cached && !opts.fresh && existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8"));
    const data = await request(path);
    if (cached) {
      mkdirSync(options.cacheDir!, { recursive: true });
      writeFileSync(cached, JSON.stringify(data));
    }
    return data;
  }

  async function request(path: string): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const wait = lastRequestAt + delayMs * (attempt + 1) - Date.now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = Date.now();
      count += 1;
      let res: Response;
      try {
        res = await fetch(`${BASE}${path}`, {
          headers: { "User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        lastError = err;
        continue;
      }
      if (res.status === 403 || res.status === 429) {
        lastError = new UnderstatBlockedError(`${path}: Understat answered HTTP ${res.status} (refused)`);
        await sleep(delayMs * 5 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        lastError = new Error(`${path}: HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      if (text.trimStart().startsWith("<")) {
        throw new UnderstatBlockedError(`${path}: Understat sent a web page instead of data (likely a block or challenge page)`);
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new UnderstatFormatError(`${path}: response isn't valid JSON`);
      }
    }
    throw lastError;
  }

  return {
    async league(year, opts) {
      return parseLeague(await getJson(`/getLeagueData/EPL/${year}`, opts), year);
    },
    async match(matchId, opts) {
      return parseMatch(await getJson(`/getMatchData/${matchId}`, opts), matchId);
    },
    async team(title, teamId, year, opts) {
      // Understat's team pages are named by title, spaces as underscores ("Manchester_United").
      return parseTeam(await getJson(`/getTeamData/${encodeURIComponent(title.replace(/ /g, "_"))}/${year}`, opts), teamId, year);
    },
    requestCount: () => count,
  };
}

// --- shape checks -----------------------------------------------------------

function fail(where: string, what: string): never {
  throw new UnderstatFormatError(`${where}: ${what}`);
}

function obj(v: unknown, where: string): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) fail(where, "expected an object");
  return v as Record<string, unknown>;
}

function arr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) fail(where, "expected a list");
  return v;
}

function str(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  fail(where, `missing text field "${key}"`);
}

function num(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) fail(where, `missing number field "${key}"`);
  return n;
}

export function parseLeague(raw: unknown, year: number): UsLeague {
  const where = `league ${year}`;
  const root = obj(raw, where);
  const teamsObj = obj(root.teams, `${where}.teams`);
  const teams = Object.values(teamsObj).map((t, i) => {
    const o = obj(t, `${where}.teams[${i}]`);
    const id = str(o, "id", `${where}.teams[${i}]`);
    const history: UsTeamMatch[] = arr(o.history, `${where}.teams[${id}].history`).map((h, j) => {
      const w = `${where}.teams[${id}].history[${j}]`;
      const ho = obj(h, w);
      const ppda = obj(ho.ppda, `${w}.ppda`);
      const allowed = obj(ho.ppda_allowed, `${w}.ppda_allowed`);
      const side = str(ho, "h_a", w);
      if (side !== "h" && side !== "a") fail(w, `unexpected h_a "${side}"`);
      return {
        teamId: id,
        datetime: str(ho, "date", w),
        side,
        xG: num(ho, "xG", w),
        xGA: num(ho, "xGA", w),
        npxG: num(ho, "npxG", w),
        npxGA: num(ho, "npxGA", w),
        ppdaAtt: num(ppda, "att", w),
        ppdaDef: num(ppda, "def", w),
        ppdaAllowedAtt: num(allowed, "att", w),
        ppdaAllowedDef: num(allowed, "def", w),
        deep: num(ho, "deep", w),
        deepAllowed: num(ho, "deep_allowed", w),
        scored: num(ho, "scored", w),
        missed: num(ho, "missed", w),
        xPts: num(ho, "xpts", w),
        result: str(ho, "result", w),
        pts: num(ho, "pts", w),
      };
    });
    return { id, title: str(o, "title", `${where}.teams[${id}]`), history };
  });
  const matches: UsMatchSummary[] = arr(root.dates, `${where}.dates`).map((m, i) => {
    const w = `${where}.dates[${i}]`;
    const o = obj(m, w);
    const h = obj(o.h, `${w}.h`);
    const a = obj(o.a, `${w}.a`);
    const isResult = o.isResult === true;
    const goals = isResult ? obj(o.goals, `${w}.goals`) : null;
    const xg = isResult ? obj(o.xG, `${w}.xG`) : null;
    const forecast = isResult && o.forecast ? obj(o.forecast, `${w}.forecast`) : null;
    return {
      id: str(o, "id", w),
      datetime: str(o, "datetime", w),
      isResult,
      homeTeamId: str(h, "id", `${w}.h`),
      awayTeamId: str(a, "id", `${w}.a`),
      homeGoals: goals ? num(goals, "h", w) : null,
      awayGoals: goals ? num(goals, "a", w) : null,
      homeXG: xg ? num(xg, "h", w) : null,
      awayXG: xg ? num(xg, "a", w) : null,
      forecastWin: forecast ? num(forecast, "w", w) : null,
      forecastDraw: forecast ? num(forecast, "d", w) : null,
      forecastLoss: forecast ? num(forecast, "l", w) : null,
    };
  });
  const players = arr(root.players, `${where}.players`).map((p, i) => {
    const o = obj(p, `${where}.players[${i}]`);
    return { id: str(o, "id", `${where}.players[${i}]`), name: str(o, "player_name", `${where}.players[${i}]`) };
  });
  if (teams.length === 0 || matches.length === 0) fail(where, "no teams or no matches");
  return { year, teams, matches, players };
}

export function parseMatch(raw: unknown, matchId: string): UsMatch {
  const where = `match ${matchId}`;
  const root = obj(raw, where);
  const rosters = obj(root.rosters, `${where}.rosters`);
  const shots = obj(root.shots, `${where}.shots`);
  const appearances: UsAppearance[] = [];
  for (const side of ["h", "a"] as const) {
    for (const [rosterId, r] of Object.entries(obj(rosters[side], `${where}.rosters.${side}`))) {
      const w = `${where}.rosters.${side}[${rosterId}]`;
      const o = obj(r, w);
      appearances.push({
        matchId,
        playerId: str(o, "player_id", w),
        playerName: str(o, "player", w),
        teamId: str(o, "team_id", w),
        side,
        position: str(o, "position", w),
        minutes: num(o, "time", w),
        goals: num(o, "goals", w),
        ownGoals: num(o, "own_goals", w),
        shots: num(o, "shots", w),
        xG: num(o, "xG", w),
        assists: num(o, "assists", w),
        xA: num(o, "xA", w),
        keyPasses: num(o, "key_passes", w),
        xGChain: num(o, "xGChain", w),
        xGBuildup: num(o, "xGBuildup", w),
        yellowCards: num(o, "yellow_card", w),
        redCards: num(o, "red_card", w),
      });
    }
  }
  const shotRows: UsShot[] = [];
  for (const side of ["h", "a"] as const) {
    arr(shots[side], `${where}.shots.${side}`).forEach((s, i) => {
      const w = `${where}.shots.${side}[${i}]`;
      const o = obj(s, w);
      shotRows.push({
        shotId: str(o, "id", w),
        matchId,
        playerId: str(o, "player_id", w),
        playerName: str(o, "player", w),
        side,
        minute: num(o, "minute", w),
        x: num(o, "X", w),
        y: num(o, "Y", w),
        xG: num(o, "xG", w),
        result: str(o, "result", w),
        situation: str(o, "situation", w),
        shotType: str(o, "shotType", w),
        lastAction: typeof o.lastAction === "string" ? o.lastAction : "",
        assistedBy: typeof o.player_assisted === "string" ? o.player_assisted : "",
      });
    });
  }
  if (appearances.length === 0) fail(where, "no line-ups");
  return { matchId, appearances, shots: shotRows };
}

/**
 * A club's season page. Its match list must be the club's own — every
 * match has it home or away — so a title that led to a different club's
 * page is a format failure, never another club's formations.
 */
export function parseTeam(raw: unknown, teamId: string, year: number): UsTeamSeason {
  const where = `team ${teamId} ${year}`;
  const root = obj(raw, where);
  const dates = arr(root.dates, `${where}.dates`);
  const playedMatchIds: string[] = [];
  dates.forEach((d, i) => {
    const w = `${where}.dates[${i}]`;
    const o = obj(d, w);
    const h = str(obj(o.h, `${w}.h`), "id", `${w}.h`);
    const a = str(obj(o.a, `${w}.a`), "id", `${w}.a`);
    if (h !== teamId && a !== teamId) fail(w, `match ${str(o, "id", w)} isn't this club's (${h} v ${a})`);
    if (o.isResult === true) playedMatchIds.push(str(o, "id", w));
  });
  const stats = obj(root.statistics, `${where}.statistics`);
  const formations: UsFormation[] = Object.entries(obj(stats.formation, `${where}.statistics.formation`)).map(([name, f]) => {
    const w = `${where}.statistics.formation[${name}]`;
    const o = obj(f, w);
    const against = obj(o.against, `${w}.against`);
    return {
      teamId,
      formation: name,
      minutes: num(o, "time", w),
      shots: num(o, "shots", w),
      goals: num(o, "goals", w),
      xG: num(o, "xG", w),
      shotsAgainst: num(against, "shots", w),
      goalsAgainst: num(against, "goals", w),
      xGA: num(against, "xG", w),
    };
  });
  if (playedMatchIds.length > 0 && formations.length === 0) fail(where, "played matches but no formation figures");
  return { teamId, formations, playedMatchIds };
}
