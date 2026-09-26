import { describe, it, expect } from "vitest";
import { aggregateClubSeason, checkLedgerAgainstScores } from "./aggregate.js";
import { parseCsv, toCsv } from "./csv.js";
import type { LedgerFixture, LedgerRow, LedgerTeam } from "./types.js";

const teams: LedgerTeam[] = [
  { id: 1, code: 100, name: "Home FC", shortName: "HOM" },
  { id: 2, code: 200, name: "Away FC", shortName: "AWA" },
];

function row(overrides: Partial<LedgerRow> & Pick<LedgerRow, "fixture" | "code" | "team">): LedgerRow {
  return {
    element: overrides.code,
    wasHome: overrides.team === 1,
    position: 3,
    round: 1,
    minutes: 90,
    starts: 1,
    totalPoints: 2,
    goals: 0,
    assists: 0,
    ownGoals: 0,
    cleanSheets: 0,
    goalsConceded: 0,
    saves: 0,
    bonus: 0,
    bps: 0,
    xG: 0,
    xA: 0,
    xGI: 0,
    xGC: 0,
    dc: 0,
    ...overrides,
  };
}

describe("aggregateClubSeason", () => {
  const fixtures: LedgerFixture[] = [
    { id: 1, event: 1, teamH: 1, teamA: 2, teamHScore: 2, teamAScore: 0, finished: true },
    { id: 2, event: 2, teamH: 2, teamA: 1, teamHScore: 1, teamAScore: 1, finished: true },
    { id: 3, event: 3, teamH: 1, teamA: 2, teamHScore: null, teamAScore: null, finished: false },
  ];
  const rows: LedgerRow[] = [
    // Fixture 1: Home's keeper on for 90 (xGC 0.8), a sub on for 20 (xGC 0.1).
    row({ fixture: 1, code: 11, team: 1, xGC: 0.8, goals: 2, xG: 1.5, totalPoints: 13 }),
    row({ fixture: 1, code: 12, team: 1, minutes: 20, xGC: 0.1, xG: 0.2 }),
    row({ fixture: 1, code: 21, team: 2, xGC: 1.7, xG: 0.8 }),
    // Fixture 2
    row({ fixture: 2, code: 11, team: 1, xGC: 1.2, goals: 1, xG: 0.9 }),
    row({ fixture: 2, code: 21, team: 2, xGC: 0.9, goals: 1, xG: 1.2 }),
    // Unplayed fixture 3 — must never count, even with a row present.
    row({ fixture: 3, code: 11, team: 1, xGC: 9, goals: 9 }),
    // Unused squad listing — kept in the ledger, not shipped as a player record.
    row({ fixture: 2, code: 13, team: 1, minutes: 0, totalPoints: 0 }),
  ];
  const [home, away] = aggregateClubSeason("2025/26", teams, fixtures, rows);

  it("builds the club's results from finished fixtures only", () => {
    expect(home).toMatchObject({ code: 100, played: 2, wins: 1, draws: 1, losses: 0, goalsFor: 3, goalsAgainst: 1, cleanSheets: 1, leaguePoints: 4, complete: false });
    expect(away).toMatchObject({ played: 2, wins: 0, draws: 1, losses: 1, goalsFor: 1, goalsAgainst: 3, cleanSheets: 0, leaguePoints: 1 });
  });

  it("<club_xgc_per_match>: a club's xGC in a match is the opponent's players' xG summed", () => {
    // Fixture 1: Away's xG 0.8; fixture 2: Away's xG 1.2 — whatever Home's own players' xGC says.
    expect(home.matches.map((m) => m.xGC)).toEqual([0.8, 1.2]);
    expect(home.xGC).toBe(2);
    // Home's xG: 1.5 + 0.2, then 0.9.
    expect(away.matches.map((m) => m.xGC)).toEqual([1.7, 0.9]);
    expect(away.xGC).toBe(2.6);
  });

  it("<club_xgc_per_match>: one side's xG is always the other side's xGC", () => {
    for (const m of home.matches) {
      const other = away.matches.find((a) => a.fixture === m.fixture)!;
      expect(m.xG).toBe(other.xGC);
      expect(m.xGC).toBe(other.xG);
    }
  });

  it("<club_xgc_per_match>: a bad own-player xGC row (a 27-minute red card on 9.84) has no effect", () => {
    const withBadRow = [...rows, row({ fixture: 1, code: 14, team: 1, minutes: 27, xGC: 9.84, xG: 0 })];
    const [club] = aggregateClubSeason("2023/24", teams, fixtures, withBadRow);
    expect(club.matches[0].xGC).toBe(0.8);
  });

  it("sums xG, goals and FPL points across the club's players", () => {
    expect(home.xG).toBe(2.6);
    expect(home.goals).toBe(3);
    expect(home.fantasyPoints).toBe(13 + 2 + 2 + 0);
  });

  it("ranks the table by points, then goal difference, then goals", () => {
    expect(home.leaguePosition).toBe(1);
    expect(away.leaguePosition).toBe(2);
  });

  it("logs each finished match from the club's side, and the season is those matches summed", () => {
    expect(home.matches).toEqual([
      { fixture: 1, event: 1, opponentCode: 200, home: true, goalsFor: 2, goalsAgainst: 0, fantasyPoints: 15, goals: 2, assists: 0, bonus: 0, xG: 1.7, xA: 0, xGI: 0, xGC: 0.8, dc: 0 },
      { fixture: 2, event: 2, opponentCode: 200, home: false, goalsFor: 1, goalsAgainst: 1, fantasyPoints: 2, goals: 1, assists: 0, bonus: 0, xG: 0.9, xA: 0, xGI: 0, xGC: 1.2, dc: 0 },
    ]);
    expect(away.matches.map((m) => [m.fixture, m.home, m.goalsFor, m.goalsAgainst])).toEqual([
      [1, false, 0, 2],
      [2, true, 1, 1],
    ]);
    expect(home.fantasyPoints).toBe(home.matches.reduce((a, m) => a + m.fantasyPoints, 0));
  });

  it("carries no per-player records — club figures only", () => {
    expect(Object.keys(home)).not.toContain("players");
  });

  it("keeps expected stats null (not 0) for a season with none tracked", () => {
    const untracked = rows.map((r) => ({ ...r, xG: null, xA: null, xGI: null, xGC: null, dc: null }));
    const [club] = aggregateClubSeason("2019/20", teams, fixtures, untracked);
    expect(club.xG).toBeNull();
    expect(club.xGC).toBeNull();
    expect(club.dc).toBeNull();
  });

  it("keeps expected stats and starts null (not a part-season sum) when only some matches tracked them", () => {
    // 2022/23 shape: expected stats and starts only exist from GW16, so earlier rows are null.
    const partial = rows.map((r) => (r.fixture === 1 ? { ...r, starts: null, xG: null, xA: null, xGI: null, xGC: null } : r));
    const [club] = aggregateClubSeason("2022/23", teams, fixtures, partial);
    expect(club.xG).toBeNull();
    expect(club.xA).toBeNull();
    expect(club.xGI).toBeNull();
    expect(club.xGC).toBeNull();
    // The untracked match is null; the tracked one keeps its figures.
    expect(club.matches.map((m) => m.xG)).toEqual([null, 0.9]);
    // Stats every match tracked are unaffected.
    expect(club.goals).toBe(3);
    expect(club.dc).toBe(0);
  });

  it("marks a season complete only when every fixture has finished", () => {
    const allDone = fixtures.map((f) => ({ ...f, finished: true, teamHScore: f.teamHScore ?? 0, teamAScore: f.teamAScore ?? 0 }));
    expect(aggregateClubSeason("2025/26", teams, allDone, rows)[0].complete).toBe(true);
  });
});

describe("checkLedgerAgainstScores", () => {
  const fixtures: LedgerFixture[] = [{ id: 1, event: 1, teamH: 1, teamA: 2, teamHScore: 2, teamAScore: 1, finished: true }];

  it("accepts goals + opponent own goals matching the score", () => {
    const rows = [row({ fixture: 1, code: 11, team: 1, goals: 1 }), row({ fixture: 1, code: 21, team: 2, goals: 1, ownGoals: 1 })];
    expect(checkLedgerAgainstScores(fixtures, rows)).toEqual([]);
  });

  it("flags a fixture whose goals don't add up", () => {
    const rows = [row({ fixture: 1, code: 11, team: 1, goals: 2 }), row({ fixture: 1, code: 21, team: 2, goals: 2 })];
    expect(checkLedgerAgainstScores(fixtures, rows)).toHaveLength(1);
  });
});

describe("csv", () => {
  it("round-trips quoted fields and empty values", () => {
    const text = toCsv(["a", "b", "c"], [["x, y", null, 'say "hi"']]);
    expect(parseCsv(text)).toEqual([{ a: "x, y", b: "", c: 'say "hi"' }]);
  });
});
