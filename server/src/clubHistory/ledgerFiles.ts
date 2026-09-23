import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { boolField, numOrNull, numOrZero, parseCsv, toCsv } from "./csv.js";
import type { LedgerFixture, LedgerRow, LedgerTeam } from "./types.js";

/**
 * On-disk layout of the club-history record (repo root, data/club-history):
 *
 *   <season folder, e.g. 2025-26>/teams.csv     id,code,name,short_name
 *                                 fixtures.csv  id,event,team_h,team_a,team_h_score,team_a_score,finished
 *                                 ledger.csv    one row per player per fixture (see LEDGER_HEADER)
 *
 * Only used by the scripts in scripts/club-history — the app itself never
 * reads these files; it gets pre-aggregated completed seasons from
 * completedSeasons.generated.ts plus the live season computed on the fly.
 */

export const LEDGER_HEADER = [
  "fixture",
  "element",
  "code",
  "team",
  "was_home",
  "position",
  "round",
  "minutes",
  "starts",
  "total_points",
  "goals_scored",
  "assists",
  "own_goals",
  "clean_sheets",
  "goals_conceded",
  "saves",
  "bonus",
  "bps",
  "expected_goals",
  "expected_assists",
  "expected_goal_involvements",
  "expected_goals_conceded",
  "defensive_contribution",
];

export function seasonFolderName(season: string): string {
  return season.replace("/", "-");
}

export function seasonFromFolderName(folder: string): string {
  return folder.replace("-", "/");
}

export interface SeasonLedger {
  season: string;
  teams: LedgerTeam[];
  fixtures: LedgerFixture[];
  rows: LedgerRow[];
}

export function listSeasonFolders(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}$/.test(d.name))
    .map((d) => d.name)
    .sort();
}

export function readSeasonLedger(root: string, season: string): SeasonLedger | null {
  const dir = join(root, seasonFolderName(season));
  if (!existsSync(join(dir, "ledger.csv"))) return null;
  const read = (name: string) => parseCsv(readFileSync(join(dir, name), "utf8"));
  const teams = read("teams.csv").map((t) => ({ id: numOrZero(t.id), code: numOrZero(t.code), name: t.name, shortName: t.short_name }));
  const fixtures = read("fixtures.csv").map((f) => ({
    id: numOrZero(f.id),
    event: numOrNull(f.event),
    teamH: numOrZero(f.team_h),
    teamA: numOrZero(f.team_a),
    teamHScore: numOrNull(f.team_h_score),
    teamAScore: numOrNull(f.team_a_score),
    finished: boolField(f.finished),
  }));
  const rows = read("ledger.csv").map((r) => ({
    fixture: numOrZero(r.fixture),
    element: numOrZero(r.element),
    code: numOrZero(r.code),
    team: numOrZero(r.team),
    wasHome: boolField(r.was_home),
    position: numOrNull(r.position),
    round: numOrNull(r.round),
    minutes: numOrZero(r.minutes),
    starts: numOrNull(r.starts),
    totalPoints: numOrZero(r.total_points),
    goals: numOrZero(r.goals_scored),
    assists: numOrZero(r.assists),
    ownGoals: numOrNull(r.own_goals),
    cleanSheets: numOrZero(r.clean_sheets),
    goalsConceded: numOrNull(r.goals_conceded),
    saves: numOrNull(r.saves),
    bonus: numOrZero(r.bonus),
    bps: numOrNull(r.bps),
    xG: numOrNull(r.expected_goals),
    xA: numOrNull(r.expected_assists),
    xGI: numOrNull(r.expected_goal_involvements),
    xGC: numOrNull(r.expected_goals_conceded),
    dc: numOrNull(r.defensive_contribution),
  }));
  return { season, teams, fixtures, rows };
}

export function writeSeasonLedger(root: string, ledger: SeasonLedger): void {
  const dir = join(root, seasonFolderName(ledger.season));
  mkdirSync(dir, { recursive: true });
  const teams = [...ledger.teams].sort((a, b) => a.id - b.id);
  const fixtures = [...ledger.fixtures].sort((a, b) => a.id - b.id);
  const rows = [...ledger.rows].sort((a, b) => a.fixture - b.fixture || a.team - b.team || a.code - b.code);
  writeFileSync(join(dir, "teams.csv"), toCsv(["id", "code", "name", "short_name"], teams.map((t) => [t.id, t.code, t.name, t.shortName])));
  writeFileSync(
    join(dir, "fixtures.csv"),
    toCsv(
      ["id", "event", "team_h", "team_a", "team_h_score", "team_a_score", "finished"],
      fixtures.map((f) => [f.id, f.event, f.teamH, f.teamA, f.teamHScore, f.teamAScore, f.finished]),
    ),
  );
  writeFileSync(
    join(dir, "ledger.csv"),
    toCsv(
      LEDGER_HEADER,
      rows.map((r) => [
        r.fixture,
        r.element,
        r.code,
        r.team,
        r.wasHome,
        r.position,
        r.round,
        r.minutes,
        r.starts,
        r.totalPoints,
        r.goals,
        r.assists,
        r.ownGoals,
        r.cleanSheets,
        r.goalsConceded,
        r.saves,
        r.bonus,
        r.bps,
        r.xG,
        r.xA,
        r.xGI,
        r.xGC,
        r.dc,
      ]),
    ),
  );
}
