/**
 * ONE-OFF backfill of completed seasons' club history from the
 * vaastav/Fantasy-Premier-League community archive — a mirror of FPL's own
 * API data, used because the official API doesn't serve past seasons'
 * match-level data at all. Every season from 2026/27 on comes from the
 * official API via archive-current.ts instead. See README → "Club history".
 *
 *   npx tsx scripts/club-history/backfill-vaastav.ts [2016-17 2017-18 ...]
 *
 * Writes data/club-history/<season>/{teams,fixtures,ledger}.csv, then
 * checks every finished fixture's score against the ledger's goals.
 */
import { join } from "node:path";
import { parseCsv, numOrNull, numOrZero, boolField } from "../../server/src/clubHistory/csv.js";
import { writeSeasonLedger, seasonFromFolderName } from "../../server/src/clubHistory/ledgerFiles.js";
import { checkLedgerAgainstScores } from "../../server/src/clubHistory/aggregate.js";
import type { LedgerFixture, LedgerRow, LedgerTeam } from "../../server/src/clubHistory/types.js";

const BASE = "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data";
const ROOT = join(process.cwd(), "data", "club-history");
const DEFAULT_SEASONS = ["2016-17", "2017-18", "2018-19", "2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"];

async function fetchCsv(path: string, optional = false): Promise<Record<string, string>[] | null> {
  const res = await fetch(`${BASE}/${path}`);
  if (res.status === 404 && optional) return null;
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return parseCsv(await res.text());
}

async function main() {
  const seasons = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_SEASONS;
  const masterTeams = (await fetchCsv("master_team_list.csv"))!;

  // Short names keyed by stable club code, from every archived season that
  // has a teams.csv (2019-20 on, most recent wins) plus today's live
  // bootstrap — collected up front so an older season picks up a club's
  // real short name from a later one. Clubs only ever in the PL before
  // 2019-20 fall back to their first three letters.
  const shortNameByCode = new Map<number, string>();
  for (const folder of DEFAULT_SEASONS) {
    for (const t of (await fetchCsv(`${folder}/teams.csv`, true)) ?? []) shortNameByCode.set(numOrZero(t.code), t.short_name);
  }
  const bootstrap = (await (await fetch("https://fantasy.premierleague.com/api/bootstrap-static/")).json()) as {
    teams: { code: number; short_name: string }[];
  };
  for (const t of bootstrap.teams) shortNameByCode.set(t.code, t.short_name);

  const results: string[] = [];
  for (const folder of seasons) {
    const season = seasonFromFolderName(folder);
    const [playersRaw, merged, fixturesCsv, teamsCsv] = await Promise.all([
      fetchCsv(`${folder}/players_raw.csv`),
      fetchCsv(`${folder}/gws/merged_gw.csv`),
      fetchCsv(`${folder}/fixtures.csv`, true),
      fetchCsv(`${folder}/teams.csv`, true),
    ]);

    const elementInfo = new Map(playersRaw!.map((p) => [numOrZero(p.id), { code: numOrZero(p.code), position: numOrNull(p.element_type) }]));
    const teamCodeById = new Map<number, number>();
    for (const p of playersRaw!) teamCodeById.set(numOrZero(p.team), numOrZero(p.team_code));
    for (const t of teamsCsv ?? []) teamCodeById.set(numOrZero(t.id), numOrZero(t.code));

    // teams.csv (2019-20 on) is the season's own team list; older seasons
    // only appear in master_team_list.csv (which in turn stops at 2023-24).
    const teams: LedgerTeam[] = teamsCsv
      ? teamsCsv.map((t) => ({ id: numOrZero(t.id), code: numOrZero(t.code), name: t.name, shortName: t.short_name }))
      : masterTeams
      .filter((t) => t.season === folder)
      .map((t) => {
        const id = numOrZero(t.team);
        const code = teamCodeById.get(id);
        if (code === undefined) throw new Error(`${folder}: no club code for team ${id} (${t.team_name})`);
        return { id, code, name: t.team_name, shortName: shortNameByCode.get(code) ?? t.team_name.slice(0, 3).toUpperCase() };
      });

    // Fixture sides: from fixtures.csv where the season has one; otherwise
    // (2016-17, 2017-18) rebuilt from the rows themselves — a home-side
    // row's opponent is the away team and vice versa.
    const derived = new Map<number, { teamH?: number; teamA?: number; h: number | null; a: number | null; event: number | null }>();
    for (const r of merged!) {
      const id = numOrZero(r.fixture);
      const d = derived.get(id) ?? { h: null, a: null, event: null };
      // A postponed fixture's placeholder row carries no score — take the
      // score (and gameweek) from a row that has one.
      if (r.team_h_score !== "" && r.team_a_score !== "") {
        d.h = numOrNull(r.team_h_score);
        d.a = numOrNull(r.team_a_score);
        d.event = numOrNull(r.round) ?? numOrNull(r.GW);
      } else if (d.event === null) {
        d.event = numOrNull(r.round) ?? numOrNull(r.GW);
      }
      if (boolField(r.was_home)) d.teamA = numOrZero(r.opponent_team);
      else d.teamH = numOrZero(r.opponent_team);
      derived.set(id, d);
    }
    const fixtures: LedgerFixture[] = fixturesCsv
      ? fixturesCsv.map((f) => ({
          id: numOrZero(f.id),
          event: numOrNull(f.event),
          teamH: numOrZero(f.team_h),
          teamA: numOrZero(f.team_a),
          teamHScore: numOrNull(f.team_h_score),
          teamAScore: numOrNull(f.team_a_score),
          finished: boolField(f.finished),
        }))
      : [...derived.entries()].map(([id, d]) => {
          if (d.teamH === undefined || d.teamA === undefined) throw new Error(`${folder}: can't determine both sides of fixture ${id}`);
          return { id, event: d.event, teamH: d.teamH, teamA: d.teamA, teamHScore: d.h, teamAScore: d.a, finished: d.h !== null && d.a !== null };
        });
    const fixturesById = new Map(fixtures.map((f) => [f.id, f]));

    let missingCode = 0;
    let sideMismatch = 0;
    let duplicates = 0;
    const rows: LedgerRow[] = [];
    // The archive has two kinds of duplicate row (same player, same
    // fixture): exact copies (e.g. 10 in 2025-26), and a postponed
    // fixture's placeholder from its original gameweek — no score, 0
    // minutes — alongside the real row from when it was played (e.g.
    // 2019-20's COVID-postponed games). Keep the copy with a recorded
    // score; two scored copies that disagree stop the backfill rather than
    // guessing which is right.
    const hasScore = (r: Record<string, string>) => r.team_h_score !== "" && r.team_a_score !== "";
    const chosen = new Map<string, Record<string, string>>();
    for (const r of merged!) {
      const rowKey = `${r.fixture}:${r.element}`;
      const previous = chosen.get(rowKey);
      if (previous === undefined) {
        chosen.set(rowKey, r);
        continue;
      }
      duplicates += 1;
      if (JSON.stringify(previous) === JSON.stringify(r)) continue;
      if (hasScore(previous) && hasScore(r)) throw new Error(`${folder}: conflicting duplicate rows for fixture ${r.fixture}, element ${r.element}`);
      if (hasScore(r)) chosen.set(rowKey, r);
    }
    for (const r of chosen.values()) {
      const fixture = fixturesById.get(numOrZero(r.fixture));
      if (!fixture) throw new Error(`${folder}: row references unknown fixture ${r.fixture}`);
      const wasHome = boolField(r.was_home);
      const team = wasHome ? fixture.teamH : fixture.teamA;
      if (numOrZero(r.opponent_team) !== (wasHome ? fixture.teamA : fixture.teamH)) sideMismatch += 1;
      const element = numOrZero(r.element);
      const info = elementInfo.get(element);
      // A player missing from the end-of-season players_raw snapshot still
      // counts toward his club's figures; he just gets a negative
      // placeholder code, so he can never collide with a real player.
      if (!info) missingCode += 1;
      rows.push({
        fixture: fixture.id,
        element,
        code: info?.code ?? -element,
        team,
        wasHome,
        position: info?.position ?? null,
        round: numOrNull(r.round) ?? numOrNull(r.GW),
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
      });
    }

    writeSeasonLedger(ROOT, { season, teams, fixtures, rows });
    const problems = checkLedgerAgainstScores(fixtures, rows);
    results.push(
      `${season}: ${teams.length} clubs, ${fixtures.length} fixtures, ${rows.length} rows · score mismatches ${problems.length} · side mismatches ${sideMismatch} · rows without a player code ${missingCode} · duplicate rows dropped ${duplicates}` +
        (problems.length > 0 ? `\n    e.g. ${problems.slice(0, 3).join("; ")}` : ""),
    );
    console.log(results[results.length - 1]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
