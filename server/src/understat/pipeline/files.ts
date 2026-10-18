/**
 * data/understat/ — everything the sync job keeps, as plain files:
 *
 *   control.json                 the off-switch (hand-edited; the job never writes it)
 *   status.json                  last successful run: seasons, freshness, link counts
 *   links.csv                    FPL player code <-> Understat player id, with status
 *   overrides.csv                manual link decisions (normally empty)
 *   seasons/<2025-26>/           what Understat said, per season:
 *     clubs.csv                    FPL club code <-> Understat team id
 *     matches.csv                  one row per match
 *     team_matches.csv             one row per club per match (PPDA, deep, xPts…)
 *     appearances.csv              one row per player per match
 *     shots.csv                    one row per shot
 *   app/<2025-26>.json           the season summary the app reads
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv, toCsv } from "../../clubHistory/csv.js";
import type {
  AppSeasonFile,
  ClubPairing,
  LinkOverride,
  LinkStatus,
  PlayerLink,
  Side,
  UnderstatControl,
  UnderstatStatus,
  UsAppearance,
  UsMatchSummary,
  UsShot,
  UsTeamMatch,
} from "./types.js";

export const seasonFolder = (season: string) => season.replace("/", "-");
export const seasonFromFolder = (folder: string) => folder.replace("-", "/");

/** Write to a temporary name, then rename, so a crash mid-write never leaves a half file. */
function writeAtomic(path: string, content: string): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

const n = (v: string | undefined) => (v === undefined || v === "" ? 0 : Number(v));
const nOrNull = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));
const side = (v: string): Side => (v === "a" ? "a" : "h");

function readCsvFile(path: string): Record<string, string>[] {
  return existsSync(path) ? parseCsv(readFileSync(path, "utf8")) : [];
}

// --- per-season raw data -----------------------------------------------------

export interface SeasonData {
  season: string;
  clubs: ClubPairing[];
  matches: UsMatchSummary[];
  teamMatches: (UsTeamMatch & { matchId: string })[];
  appearances: UsAppearance[];
  shots: UsShot[];
}

const MATCH_HEADER = ["match_id", "datetime", "is_result", "home_team_id", "away_team_id", "home_goals", "away_goals", "home_xg", "away_xg", "forecast_home_win", "forecast_draw", "forecast_away_win"];
const TEAM_MATCH_HEADER = ["match_id", "team_id", "datetime", "side", "xg", "xga", "npxg", "npxga", "ppda_att", "ppda_def", "ppda_allowed_att", "ppda_allowed_def", "deep", "deep_allowed", "scored", "missed", "xpts", "result", "pts"];
const APPEARANCE_HEADER = ["match_id", "player_id", "player", "team_id", "side", "position", "minutes", "goals", "own_goals", "shots", "xg", "assists", "xa", "key_passes", "xg_chain", "xg_buildup", "yellow_cards", "red_cards"];
const SHOT_HEADER = ["shot_id", "match_id", "player_id", "player", "side", "minute", "x", "y", "xg", "result", "situation", "shot_type", "last_action", "assisted_by"];
const CLUB_HEADER = ["fpl_team_code", "understat_team_id", "understat_title"];

export function seasonDir(root: string, season: string): string {
  return join(root, "seasons", seasonFolder(season));
}

export function listStoredSeasons(root: string): string[] {
  const dir = join(root, "seasons");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}$/.test(f))
    .map(seasonFromFolder)
    .sort();
}

export function readSeasonData(root: string, season: string): SeasonData | null {
  const dir = seasonDir(root, season);
  if (!existsSync(dir)) return null;
  return {
    season,
    clubs: readCsvFile(join(dir, "clubs.csv")).map((r) => ({ fplTeamCode: n(r.fpl_team_code), understatTeamId: r.understat_team_id, understatTitle: r.understat_title })),
    matches: readCsvFile(join(dir, "matches.csv")).map((r) => ({
      id: r.match_id,
      datetime: r.datetime,
      isResult: r.is_result === "true",
      homeTeamId: r.home_team_id,
      awayTeamId: r.away_team_id,
      homeGoals: nOrNull(r.home_goals),
      awayGoals: nOrNull(r.away_goals),
      homeXG: nOrNull(r.home_xg),
      awayXG: nOrNull(r.away_xg),
      forecastWin: nOrNull(r.forecast_home_win),
      forecastDraw: nOrNull(r.forecast_draw),
      forecastLoss: nOrNull(r.forecast_away_win),
    })),
    teamMatches: readCsvFile(join(dir, "team_matches.csv")).map((r) => ({
      matchId: r.match_id,
      teamId: r.team_id,
      datetime: r.datetime,
      side: side(r.side),
      xG: n(r.xg),
      xGA: n(r.xga),
      npxG: n(r.npxg),
      npxGA: n(r.npxga),
      ppdaAtt: n(r.ppda_att),
      ppdaDef: n(r.ppda_def),
      ppdaAllowedAtt: n(r.ppda_allowed_att),
      ppdaAllowedDef: n(r.ppda_allowed_def),
      deep: n(r.deep),
      deepAllowed: n(r.deep_allowed),
      scored: n(r.scored),
      missed: n(r.missed),
      xPts: n(r.xpts),
      result: r.result,
      pts: n(r.pts),
    })),
    appearances: readCsvFile(join(dir, "appearances.csv")).map((r) => ({
      matchId: r.match_id,
      playerId: r.player_id,
      playerName: r.player,
      teamId: r.team_id,
      side: side(r.side),
      position: r.position,
      minutes: n(r.minutes),
      goals: n(r.goals),
      ownGoals: n(r.own_goals),
      shots: n(r.shots),
      xG: n(r.xg),
      assists: n(r.assists),
      xA: n(r.xa),
      keyPasses: n(r.key_passes),
      xGChain: n(r.xg_chain),
      xGBuildup: n(r.xg_buildup),
      yellowCards: n(r.yellow_cards),
      redCards: n(r.red_cards),
    })),
    shots: readCsvFile(join(dir, "shots.csv")).map((r) => ({
      shotId: r.shot_id,
      matchId: r.match_id,
      playerId: r.player_id,
      playerName: r.player,
      side: side(r.side),
      minute: n(r.minute),
      x: n(r.x),
      y: n(r.y),
      xG: n(r.xg),
      result: r.result,
      situation: r.situation,
      shotType: r.shot_type,
      lastAction: r.last_action,
      assistedBy: r.assisted_by,
    })),
  };
}

/** Rows sorted by stable keys, so a re-run with nothing new writes byte-identical files (and the job commits nothing). */
export function writeSeasonData(root: string, data: SeasonData): void {
  const dir = seasonDir(root, data.season);
  mkdirSync(dir, { recursive: true });
  const byNum = (a: string, b: string) => Number(a) - Number(b) || a.localeCompare(b);
  writeAtomic(
    join(dir, "clubs.csv"),
    toCsv(CLUB_HEADER, [...data.clubs].sort((a, b) => a.fplTeamCode - b.fplTeamCode).map((c) => [c.fplTeamCode, c.understatTeamId, c.understatTitle])),
  );
  writeAtomic(
    join(dir, "matches.csv"),
    toCsv(
      MATCH_HEADER,
      [...data.matches]
        .sort((a, b) => byNum(a.id, b.id))
        .map((m) => [m.id, m.datetime, m.isResult, m.homeTeamId, m.awayTeamId, m.homeGoals, m.awayGoals, m.homeXG, m.awayXG, m.forecastWin, m.forecastDraw, m.forecastLoss]),
    ),
  );
  writeAtomic(
    join(dir, "team_matches.csv"),
    toCsv(
      TEAM_MATCH_HEADER,
      [...data.teamMatches]
        .sort((a, b) => byNum(a.matchId, b.matchId) || byNum(a.teamId, b.teamId))
        .map((t) => [t.matchId, t.teamId, t.datetime, t.side, t.xG, t.xGA, t.npxG, t.npxGA, t.ppdaAtt, t.ppdaDef, t.ppdaAllowedAtt, t.ppdaAllowedDef, t.deep, t.deepAllowed, t.scored, t.missed, t.xPts, t.result, t.pts]),
    ),
  );
  writeAtomic(
    join(dir, "appearances.csv"),
    toCsv(
      APPEARANCE_HEADER,
      [...data.appearances]
        .sort((a, b) => byNum(a.matchId, b.matchId) || a.side.localeCompare(b.side) || byNum(a.playerId, b.playerId))
        .map((a) => [a.matchId, a.playerId, a.playerName, a.teamId, a.side, a.position, a.minutes, a.goals, a.ownGoals, a.shots, a.xG, a.assists, a.xA, a.keyPasses, a.xGChain, a.xGBuildup, a.yellowCards, a.redCards]),
    ),
  );
  writeAtomic(
    join(dir, "shots.csv"),
    toCsv(
      SHOT_HEADER,
      [...data.shots]
        .sort((a, b) => byNum(a.matchId, b.matchId) || byNum(a.shotId, b.shotId))
        .map((s) => [s.shotId, s.matchId, s.playerId, s.playerName, s.side, s.minute, s.x, s.y, s.xG, s.result, s.situation, s.shotType, s.lastAction, s.assistedBy]),
    ),
  );
}

// --- links and overrides -----------------------------------------------------

const LINK_HEADER = ["fpl_code", "understat_id", "status", "fpl_name", "understat_name", "season", "since", "note"];
const STATUSES: LinkStatus[] = ["confirmed", "held", "disputed"];

export function readLinks(root: string): Map<number, PlayerLink> {
  const links = new Map<number, PlayerLink>();
  for (const r of readCsvFile(join(root, "links.csv"))) {
    const status = STATUSES.includes(r.status as LinkStatus) ? (r.status as LinkStatus) : "held";
    links.set(n(r.fpl_code), {
      fplCode: n(r.fpl_code),
      understatId: r.understat_id,
      status,
      fplName: r.fpl_name,
      understatName: r.understat_name,
      season: r.season,
      since: r.since,
      note: r.note,
    });
  }
  return links;
}

export function writeLinks(root: string, links: Map<number, PlayerLink>): void {
  const rows = [...links.values()]
    .sort((a, b) => a.fplCode - b.fplCode)
    .map((l) => [l.fplCode, l.understatId, l.status, l.fplName, l.understatName, l.season, l.since, l.note]);
  writeAtomic(join(root, "links.csv"), toCsv(LINK_HEADER, rows));
}

export function readOverrides(root: string): LinkOverride[] {
  return readCsvFile(join(root, "overrides.csv"))
    .filter((r) => r.action === "pair" || r.action === "never")
    .map((r) => ({ fplCode: n(r.fpl_code), understatId: r.understat_id, action: r.action as "pair" | "never", note: r.note ?? "" }));
}

export function ensureOverridesFile(root: string): void {
  const path = join(root, "overrides.csv");
  if (!existsSync(path)) writeAtomic(path, toCsv(["fpl_code", "understat_id", "action", "note"], []));
}

// --- status, control, app files ---------------------------------------------

export function readControl(root: string): UnderstatControl {
  const path = join(root, "control.json");
  if (!existsSync(path)) return { enabled: true };
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<UnderstatControl>;
  return { enabled: parsed.enabled !== false, note: parsed.note };
}

export function readStatus(root: string): UnderstatStatus | null {
  const path = join(root, "status.json");
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as UnderstatStatus) : null;
}

export function writeStatus(root: string, status: UnderstatStatus): void {
  writeAtomic(join(root, "status.json"), JSON.stringify(status, null, 2) + "\n");
}

export function writeAppSeason(root: string, file: AppSeasonFile): void {
  mkdirSync(join(root, "app"), { recursive: true });
  writeAtomic(join(root, "app", `${seasonFolder(file.season)}.json`), JSON.stringify(file) + "\n");
}

export function readAppSeason(root: string, season: string): AppSeasonFile | null {
  const path = join(root, "app", `${seasonFolder(season)}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as AppSeasonFile) : null;
}
