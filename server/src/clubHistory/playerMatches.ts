import { gunzipSync, gzipSync } from "node:zlib";
import type { SeasonLedger } from "./ledgerFiles.js";

/**
 * A player's own match-by-match FPL record for every COMPLETED season — what
 * the player profile's Match Log shows when a past season is picked on its
 * Points History. The official API serves past seasons as totals only
 * (element-summary history_past), so these rows come from the same ledger
 * the club figures are built from (owner's decision, 2026-10-19: the
 * vaastav backfill for 2016/17–2025/26, the official archive after that).
 * The live season never comes from here — it's element-summary's own
 * gameweek history.
 *
 * Built once per completed season by scripts/club-history/build-aggregates.ts
 * into completedPlayerMatches.generated.ts (gzipped, base64) and read by
 * routes/playerSeasons.ts, so serving it never touches the network.
 */

/** One player in one finished fixture, for the club he was registered to in it. Null where the source didn't record the stat. */
export interface PlayerMatch {
  fixture: number;
  round: number | null;
  opponentCode: number;
  opponentShortName: string;
  home: boolean;
  teamScore: number;
  opponentScore: number;
  minutes: number;
  starts: number | null;
  totalPoints: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number | null;
  saves: number | null;
  bonus: number;
  bps: number | null;
  xG: number | null;
  xA: number | null;
  xGI: number | null;
  xGC: number | null;
  dc: number | null;
}

/** The stored row: PlayerMatch minus the opponent's name (kept once per season), as a plain list in this order. */
const FIELDS = [
  "fixture",
  "round",
  "opponentCode",
  "home",
  "teamScore",
  "opponentScore",
  "minutes",
  "starts",
  "totalPoints",
  "goals",
  "assists",
  "cleanSheets",
  "goalsConceded",
  "saves",
  "bonus",
  "bps",
  "xG",
  "xA",
  "xGI",
  "xGC",
  "dc",
] as const;

type StoredRow = (number | boolean | null)[];

export interface StoredPlayerMatches {
  schema: 1;
  fields: string[];
  /** Season -> its clubs' short names (by club code) and its players' rows (by player code). */
  seasons: Record<string, { clubs: Record<string, string>; players: Record<string, StoredRow[]> }>;
}

/** Every player's rows for one season, finished fixtures only, in fixture order. */
export function buildSeasonPlayerMatches(ledger: SeasonLedger): StoredPlayerMatches["seasons"][string] {
  const teamById = new Map(ledger.teams.map((t) => [t.id, t]));
  const fixtureById = new Map(ledger.fixtures.filter((f) => f.finished && f.teamHScore !== null && f.teamAScore !== null).map((f) => [f.id, f]));
  const clubs: Record<string, string> = {};
  for (const t of ledger.teams) clubs[String(t.code)] = t.shortName;
  const players: Record<string, StoredRow[]> = {};
  const rows = [...ledger.rows].sort((a, b) => a.fixture - b.fixture);
  for (const r of rows) {
    const f = fixtureById.get(r.fixture);
    if (!f) continue;
    const home = f.teamH === r.team;
    const opponent = teamById.get(home ? f.teamA : f.teamH);
    if (!opponent) continue;
    const row: PlayerMatch = {
      fixture: r.fixture,
      round: r.round ?? f.event,
      opponentCode: opponent.code,
      opponentShortName: opponent.shortName,
      home,
      teamScore: home ? f.teamHScore! : f.teamAScore!,
      opponentScore: home ? f.teamAScore! : f.teamHScore!,
      minutes: r.minutes,
      starts: r.starts,
      totalPoints: r.totalPoints,
      goals: r.goals,
      assists: r.assists,
      cleanSheets: r.cleanSheets,
      goalsConceded: r.goalsConceded,
      saves: r.saves,
      bonus: r.bonus,
      bps: r.bps,
      xG: r.xG,
      xA: r.xA,
      xGI: r.xGI,
      xGC: r.xGC,
      dc: r.dc,
    };
    (players[String(r.code)] ??= []).push(FIELDS.map((k) => row[k]));
  }
  return { clubs, players };
}

export function encodePlayerMatches(stored: StoredPlayerMatches): string {
  return gzipSync(JSON.stringify(stored), { level: 9 }).toString("base64");
}

export function decodePlayerMatches(encoded: string): StoredPlayerMatches {
  return JSON.parse(gunzipSync(Buffer.from(encoded, "base64")).toString("utf8")) as StoredPlayerMatches;
}

/** One player's rows, every completed season he has any, by season name. */
export function playerMatchesFor(stored: StoredPlayerMatches, code: number): Record<string, PlayerMatch[]> {
  const out: Record<string, PlayerMatch[]> = {};
  const at = (name: string) => stored.fields.indexOf(name);
  const idx = Object.fromEntries(FIELDS.map((k) => [k, at(k)])) as Record<(typeof FIELDS)[number], number>;
  for (const [season, s] of Object.entries(stored.seasons)) {
    const rows = s.players[String(code)];
    if (!rows) continue;
    out[season] = rows.map((r) => {
      const get = (k: (typeof FIELDS)[number]) => r[idx[k]];
      const opponentCode = get("opponentCode") as number;
      return {
        fixture: get("fixture") as number,
        round: get("round") as number | null,
        opponentCode,
        opponentShortName: s.clubs[String(opponentCode)] ?? "",
        home: get("home") as boolean,
        teamScore: get("teamScore") as number,
        opponentScore: get("opponentScore") as number,
        minutes: get("minutes") as number,
        starts: get("starts") as number | null,
        totalPoints: get("totalPoints") as number,
        goals: get("goals") as number,
        assists: get("assists") as number,
        cleanSheets: get("cleanSheets") as number,
        goalsConceded: get("goalsConceded") as number | null,
        saves: get("saves") as number | null,
        bonus: get("bonus") as number,
        bps: get("bps") as number | null,
        xG: get("xG") as number | null,
        xA: get("xA") as number | null,
        xGI: get("xGI") as number | null,
        xGC: get("xGC") as number | null,
        dc: get("dc") as number | null,
      };
    });
  }
  return out;
}

export const PLAYER_MATCH_FIELDS: readonly string[] = FIELDS;
