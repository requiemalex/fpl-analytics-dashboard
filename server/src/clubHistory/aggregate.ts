import type { ClubMatch, ClubSeason, LedgerFixture, LedgerRow, LedgerTeam } from "./types.js";

/**
 * Null unless every value is present: a sum over only the matches that
 * tracked a stat isn't the season's total (2022/23's starts and expected
 * stats only exist from GW16 — see <untracked_expected_rounds> in
 * scripts/club-history/backfill-vaastav.ts).
 */
function sumOrNull(values: (number | null)[]): number | null {
  if (values.length === 0 || values.some((v) => v === null)) return null;
  return (values as number[]).reduce((a, b) => a + b, 0);
}

/** Rounds away float noise from summing many 2-dp figures (e.g. 52.699999999 → 52.7). */
function tidy(v: number | null): number | null {
  return v === null ? null : Math.round(v * 100) / 100;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * One side's figures for one finished fixture: the score from the fixture,
 * everything else summed from that side's ledger rows for it.
 *
 * <club_xgc_per_match>: the club's xGC for a match is the opponent's xG in
 * it — the opponent's players' xG summed (the owner's rule, 2026-09-26), so
 * one side's xG and the other's xGC are always the same number. It used to
 * be the highest xGC among the club's own players, which picked up bad
 * source rows: in 2023/24 GW38 a Wolves defender sent off after 27 minutes
 * carries 9.84 xGC against 5.24 for everyone who played the full match
 * (Liverpool's players' xG: 5.35). A player's own xGC is untouched.
 */
function buildMatch(fixture: LedgerFixture, home: boolean, opponentCode: number, rows: LedgerRow[], opponentRows: LedgerRow[]): ClubMatch {
  const goalsFor = (home ? fixture.teamHScore : fixture.teamAScore) as number;
  const goalsAgainst = (home ? fixture.teamAScore : fixture.teamHScore) as number;
  return {
    fixture: fixture.id,
    event: fixture.event,
    opponentCode,
    home,
    goalsFor,
    goalsAgainst,
    fantasyPoints: sum(rows.map((r) => r.totalPoints)),
    goals: sum(rows.map((r) => r.goals)),
    assists: sum(rows.map((r) => r.assists)),
    bonus: sum(rows.map((r) => r.bonus)),
    xG: tidy(sumOrNull(rows.map((r) => r.xG))),
    xA: tidy(sumOrNull(rows.map((r) => r.xA))),
    xGI: tidy(sumOrNull(rows.map((r) => r.xGI))),
    xGC: tidy(sumOrNull(opponentRows.map((r) => r.xG))),
    dc: sumOrNull(rows.map((r) => r.dc)),
  };
}

/**
 * Builds one ClubSeason per club that has at least one finished fixture,
 * from finished fixtures only (an unplayed or in-progress match never
 * counts, even if a source already carries rows for it). Each club gets a
 * ClubMatch per finished fixture, and its season figures are those matches
 * summed — a stat is null for the season if any match lacks it.
 */
export function aggregateClubSeason(season: string, teams: LedgerTeam[], fixtures: LedgerFixture[], rows: LedgerRow[]): ClubSeason[] {
  const finished = fixtures
    .filter((f) => f.finished && f.teamHScore !== null && f.teamAScore !== null)
    .sort((a, b) => (a.event ?? 0) - (b.event ?? 0) || a.id - b.id);
  const complete = fixtures.length > 0 && finished.length === fixtures.length;
  const codeById = new Map(teams.map((t) => [t.id, t.code]));

  const rowsBySide = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    const key = `${r.fixture}:${r.team}`;
    const list = rowsBySide.get(key);
    if (list) list.push(r);
    else rowsBySide.set(key, [r]);
  }

  const matchesByTeam = new Map<number, ClubMatch[]>();
  for (const f of finished) {
    for (const [teamId, opponentId, home] of [
      [f.teamH, f.teamA, true],
      [f.teamA, f.teamH, false],
    ] as const) {
      const opponentCode = codeById.get(opponentId);
      if (opponentCode === undefined) continue;
      const match = buildMatch(f, home, opponentCode, rowsBySide.get(`${f.id}:${teamId}`) ?? [], rowsBySide.get(`${f.id}:${opponentId}`) ?? []);
      const list = matchesByTeam.get(teamId);
      if (list) list.push(match);
      else matchesByTeam.set(teamId, [match]);
    }
  }

  const built: Omit<ClubSeason, "leaguePosition">[] = [];
  for (const team of teams) {
    const matches = matchesByTeam.get(team.id);
    if (!matches) continue;
    const wins = matches.filter((m) => m.goalsFor > m.goalsAgainst).length;
    const draws = matches.filter((m) => m.goalsFor === m.goalsAgainst).length;
    built.push({
      season,
      code: team.code,
      name: team.name,
      shortName: team.shortName,
      complete,
      played: matches.length,
      wins,
      draws,
      losses: matches.length - wins - draws,
      goalsFor: sum(matches.map((m) => m.goalsFor)),
      goalsAgainst: sum(matches.map((m) => m.goalsAgainst)),
      cleanSheets: matches.filter((m) => m.goalsAgainst === 0).length,
      leaguePoints: wins * 3 + draws,
      fantasyPoints: sum(matches.map((m) => m.fantasyPoints)),
      goals: sum(matches.map((m) => m.goals)),
      assists: sum(matches.map((m) => m.assists)),
      bonus: sum(matches.map((m) => m.bonus)),
      xG: tidy(sumOrNull(matches.map((m) => m.xG))),
      xA: tidy(sumOrNull(matches.map((m) => m.xA))),
      xGI: tidy(sumOrNull(matches.map((m) => m.xGI))),
      xGC: tidy(sumOrNull(matches.map((m) => m.xGC))),
      dc: sumOrNull(matches.map((m) => m.dc)),
      matches,
    });
  }

  const ranked = [...built].sort(
    (a, b) =>
      b.leaguePoints - a.leaguePoints ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor ||
      a.name.localeCompare(b.name),
  );
  const positionByCode = new Map(ranked.map((c, i) => [c.code, i + 1]));
  return built.map((c) => ({ ...c, leaguePosition: positionByCode.get(c.code) as number }));
}

/**
 * Sanity check run by the archive/backfill scripts: for every finished
 * fixture, each side's players' goals plus the opponent's own goals must
 * equal that side's score. Returns human-readable mismatches (empty = all
 * good). Skipped for a side when own goals aren't recorded.
 */
export function checkLedgerAgainstScores(fixtures: LedgerFixture[], rows: LedgerRow[]): string[] {
  const goals = new Map<string, number>();
  const ownGoals = new Map<string, number | null>();
  for (const r of rows) {
    const key = `${r.fixture}:${r.team}`;
    goals.set(key, (goals.get(key) ?? 0) + r.goals);
    const og = ownGoals.has(key) ? ownGoals.get(key)! : 0;
    ownGoals.set(key, og === null || r.ownGoals === null ? null : og + r.ownGoals);
  }
  const problems: string[] = [];
  for (const f of fixtures) {
    if (!f.finished || f.teamHScore === null || f.teamAScore === null) continue;
    for (const [side, opp, score] of [
      [f.teamH, f.teamA, f.teamHScore],
      [f.teamA, f.teamH, f.teamAScore],
    ] as const) {
      const og = ownGoals.get(`${f.id}:${opp}`) ?? 0;
      if (og === null) continue;
      const scored = (goals.get(`${f.id}:${side}`) ?? 0) + og;
      if (scored !== score) problems.push(`fixture ${f.id}: team ${side} scored ${score} but ledger has ${scored}`);
    }
  }
  return problems;
}
