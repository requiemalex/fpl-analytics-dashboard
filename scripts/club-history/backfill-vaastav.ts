/**
 * ONE-OFF backfill of completed seasons' club history from the
 * vaastav/Fantasy-Premier-League community archive — a mirror of FPL's own
 * API data, used because the official API doesn't serve past seasons'
 * match-level data at all. Every season from 2026/27 on comes from the
 * official API via archive-current.ts instead. See README → "Club history".
 *
 * Reads only the project's own frozen copy of the archive
 * (data/vaastav-snapshot, see vaastavSnapshot.ts) — never the network — so
 * it reproduces the same ledger whatever happens to the online repository.
 *
 *   npx tsx scripts/club-history/backfill-vaastav.ts [2016-17 2017-18 ...]
 *
 * Writes data/club-history/<season>/{teams,fixtures,ledger}.csv, then
 * checks every finished fixture's score against the ledger's goals.
 */
import { join } from "node:path";
import { numOrNull, numOrZero, boolField } from "../../server/src/clubHistory/csv.js";
import { writeSeasonLedger, seasonFromFolderName } from "../../server/src/clubHistory/ledgerFiles.js";
import { checkLedgerAgainstScores } from "../../server/src/clubHistory/aggregate.js";
import type { LedgerFixture, LedgerRow, LedgerTeam } from "../../server/src/clubHistory/types.js";
import { SNAPSHOT_SEASONS, readSnapshotCsv } from "./vaastavSnapshot.js";

const ROOT = join(process.cwd(), "data", "club-history");

function requiredCsv(path: string): Record<string, string>[] {
  const rows = readSnapshotCsv(path);
  if (!rows) throw new Error(`vaastav snapshot has no ${path}`);
  return rows;
}

async function main() {
  const seasons = process.argv.slice(2).length > 0 ? process.argv.slice(2) : SNAPSHOT_SEASONS;
  const masterTeams = requiredCsv("master_team_list.csv");

  // Short names keyed by stable club code, from every archived season that
  // has a teams.csv (2019-20 on, most recent wins) plus today's live
  // bootstrap (as saved with the snapshot) — collected up front so an older
  // season picks up a club's real short name from a later one. Clubs only
  // ever in the PL before 2019-20 fall back to their first three letters.
  const shortNameByCode = new Map<number, string>();
  for (const folder of SNAPSHOT_SEASONS) {
    for (const t of readSnapshotCsv(`${folder}/teams.csv`) ?? []) shortNameByCode.set(numOrZero(t.code), t.short_name);
  }
  for (const t of requiredCsv("fpl-team-short-names.csv")) shortNameByCode.set(numOrZero(t.code), t.short_name);

  const results: string[] = [];
  for (const folder of seasons) {
    const season = seasonFromFolderName(folder);
    const playersRaw = requiredCsv(`${folder}/players_raw.csv`);
    const merged = requiredCsv(`${folder}/merged_gw.csv`);
    const fixturesCsv = readSnapshotCsv(`${folder}/fixtures.csv`);
    const teamsCsv = readSnapshotCsv(`${folder}/teams.csv`);

    const elementInfo = new Map(playersRaw.map((p) => [numOrZero(p.id), { code: numOrZero(p.code), position: numOrNull(p.element_type) }]));
    const teamCodeById = new Map<number, number>();
    for (const p of playersRaw) teamCodeById.set(numOrZero(p.team), numOrZero(p.team_code));
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
    for (const r of merged) {
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
    for (const r of merged) {
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
    // <untracked_expected_rounds>: FPL started tracking starts and the
    // expected stats partway through 2022-23 (from GW16), and the archive's
    // rows for earlier gameweeks carry 0 for them rather than blank — a
    // placeholder, not a real zero. A gameweek where no row records a
    // start or any expected stat wasn't tracked, so those fields are
    // written as null for it.
    const roundOf = (r: Record<string, string>) => numOrNull(r.round) ?? numOrNull(r.GW);
    const trackedRounds = new Set<number | null>();
    for (const r of chosen.values()) {
      const values = [r.starts, r.expected_goals, r.expected_assists, r.expected_goal_involvements, r.expected_goals_conceded];
      if (values.some((v) => (numOrNull(v) ?? 0) > 0)) trackedRounds.add(roundOf(r));
    }
    const untrackedRounds = new Set([...chosen.values()].map(roundOf).filter((round) => !trackedRounds.has(round)));
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
      const tracked = trackedRounds.has(roundOf(r));
      const expected = (value: string | undefined) => (tracked ? numOrNull(value) : null);
      rows.push({
        fixture: fixture.id,
        element,
        code: info?.code ?? -element,
        team,
        wasHome,
        position: info?.position ?? null,
        round: roundOf(r),
        minutes: numOrZero(r.minutes),
        starts: expected(r.starts),
        totalPoints: numOrZero(r.total_points),
        goals: numOrZero(r.goals_scored),
        assists: numOrZero(r.assists),
        ownGoals: numOrNull(r.own_goals),
        cleanSheets: numOrZero(r.clean_sheets),
        goalsConceded: numOrNull(r.goals_conceded),
        saves: numOrNull(r.saves),
        bonus: numOrZero(r.bonus),
        bps: numOrNull(r.bps),
        xG: expected(r.expected_goals),
        xA: expected(r.expected_assists),
        xGI: expected(r.expected_goal_involvements),
        xGC: expected(r.expected_goals_conceded),
        dc: numOrNull(r.defensive_contribution),
      });
    }

    writeSeasonLedger(ROOT, { season, teams, fixtures, rows });
    const problems = checkLedgerAgainstScores(fixtures, rows);
    results.push(
      `${season}: ${teams.length} clubs, ${fixtures.length} fixtures, ${rows.length} rows · score mismatches ${problems.length} · side mismatches ${sideMismatch} · rows without a player code ${missingCode} · duplicate rows dropped ${duplicates}` +
        ` · gameweeks without starts/expected stats ${untrackedRounds.size}` +
        (problems.length > 0 ? `\n    e.g. ${problems.slice(0, 3).join("; ")}` : ""),
    );
    console.log(results[results.length - 1]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
