import type { ClubPlayerSeason, ClubSeason, LedgerFixture, LedgerRow, LedgerTeam } from "./types.js";

function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}

/** Rounds away float noise from summing many 2-dp figures (e.g. 52.699999999 → 52.7). */
function tidy(v: number | null): number | null {
  return v === null ? null : Math.round(v * 100) / 100;
}

interface ClubTally {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
}

/**
 * Builds one ClubSeason per club that has at least one finished fixture,
 * from finished fixtures only (an unplayed or in-progress match never
 * counts, even if a source already carries rows for it).
 *
 * <club_xgc_per_match>: a player's xGC is what his club conceded while he
 * was on the pitch, so the club's xGC for a match is that of a player who
 * was on for the whole game — which is the highest xGC among the club's
 * players in that match (xGC only ever accumulates with time on the
 * pitch). Checked against every one of 2025/26's 760 club-matches: each had
 * at least one player on for 90+ minutes, so this is the real club figure,
 * not an estimate. Summing xGC across players instead counts each chance
 * once per player on the pitch (~11x).
 */
export function aggregateClubSeason(season: string, teams: LedgerTeam[], fixtures: LedgerFixture[], rows: LedgerRow[]): ClubSeason[] {
  const finished = fixtures.filter((f) => f.finished && f.teamHScore !== null && f.teamAScore !== null);
  const finishedIds = new Set(finished.map((f) => f.id));
  const complete = fixtures.length > 0 && finished.length === fixtures.length;

  const tallies = new Map<number, ClubTally>();
  const tally = (teamId: number) => {
    let t = tallies.get(teamId);
    if (!t) {
      t = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 };
      tallies.set(teamId, t);
    }
    return t;
  };
  for (const f of finished) {
    const h = f.teamHScore as number;
    const a = f.teamAScore as number;
    for (const [teamId, gf, ga] of [
      [f.teamH, h, a],
      [f.teamA, a, h],
    ] as const) {
      const t = tally(teamId);
      t.played += 1;
      t.goalsFor += gf;
      t.goalsAgainst += ga;
      if (ga === 0) t.cleanSheets += 1;
      if (gf > ga) t.wins += 1;
      else if (gf === ga) t.draws += 1;
      else t.losses += 1;
    }
  }

  const rowsByTeam = new Map<number, LedgerRow[]>();
  for (const r of rows) {
    if (!finishedIds.has(r.fixture)) continue;
    const list = rowsByTeam.get(r.team);
    if (list) list.push(r);
    else rowsByTeam.set(r.team, [r]);
  }

  const built: Omit<ClubSeason, "leaguePosition">[] = [];
  for (const team of teams) {
    const t = tallies.get(team.id);
    if (!t) continue;
    const teamRows = rowsByTeam.get(team.id) ?? [];

    const xgcByFixture = new Map<number, number>();
    for (const r of teamRows) {
      if (r.xGC === null) continue;
      xgcByFixture.set(r.fixture, Math.max(xgcByFixture.get(r.fixture) ?? 0, r.xGC));
    }

    const byPlayer = new Map<number, LedgerRow[]>();
    for (const r of teamRows) {
      const list = byPlayer.get(r.code);
      if (list) list.push(r);
      else byPlayer.set(r.code, [r]);
    }
    const players: ClubPlayerSeason[] = [];
    for (const [code, pr] of byPlayer) {
      const minutes = pr.reduce((a, r) => a + r.minutes, 0);
      // Unused-squad listings are kept in the ledger (they're the record of
      // who was at the club) but carry no stats worth shipping to the app.
      if (minutes === 0) continue;
      players.push({
        code,
        minutes,
        starts: sumOrNull(pr.map((r) => r.starts)),
        totalPoints: pr.reduce((a, r) => a + r.totalPoints, 0),
        goals: pr.reduce((a, r) => a + r.goals, 0),
        assists: pr.reduce((a, r) => a + r.assists, 0),
        cleanSheets: pr.reduce((a, r) => a + r.cleanSheets, 0),
        bonus: pr.reduce((a, r) => a + r.bonus, 0),
        xG: tidy(sumOrNull(pr.map((r) => r.xG))),
        xA: tidy(sumOrNull(pr.map((r) => r.xA))),
        xGI: tidy(sumOrNull(pr.map((r) => r.xGI))),
        xGC: tidy(sumOrNull(pr.map((r) => r.xGC))),
        dc: sumOrNull(pr.map((r) => r.dc)),
      });
    }
    players.sort((a, b) => b.minutes - a.minutes);

    built.push({
      season,
      code: team.code,
      name: team.name,
      shortName: team.shortName,
      complete,
      ...t,
      leaguePoints: t.wins * 3 + t.draws,
      fantasyPoints: teamRows.reduce((a, r) => a + r.totalPoints, 0),
      goals: teamRows.reduce((a, r) => a + r.goals, 0),
      assists: teamRows.reduce((a, r) => a + r.assists, 0),
      bonus: teamRows.reduce((a, r) => a + r.bonus, 0),
      xG: tidy(sumOrNull(teamRows.map((r) => r.xG))),
      xA: tidy(sumOrNull(teamRows.map((r) => r.xA))),
      xGI: tidy(sumOrNull(teamRows.map((r) => r.xGI))),
      xGC: xgcByFixture.size === 0 ? null : tidy([...xgcByFixture.values()].reduce((a, b) => a + b, 0)),
      dc: sumOrNull(teamRows.map((r) => r.dc)),
      players,
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
