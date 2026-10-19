import { describe, expect, it } from "vitest";
import { buildSeasonPlayerMatches, decodePlayerMatches, encodePlayerMatches, PLAYER_MATCH_FIELDS, playerMatchesFor } from "./playerMatches.js";
import type { LedgerRow } from "./types.js";

const row = (fixture: number, code: number, team: number, minutes: number, extra: Partial<LedgerRow> = {}): LedgerRow => ({
  fixture, element: code, code, team, wasHome: team === 1, position: 3, round: fixture, minutes, starts: minutes > 0 ? 1 : 0, totalPoints: 2, goals: 0, assists: 0,
  ownGoals: 0, cleanSheets: 0, goalsConceded: 1, saves: 0, bonus: 0, bps: 5, xG: null, xA: null, xGI: null, xGC: null, dc: null, ...extra,
});

const ledger = {
  season: "2019/20",
  teams: [
    { id: 1, code: 3, name: "Arsenal", shortName: "ARS" },
    { id: 2, code: 8, name: "Chelsea", shortName: "CHE" },
  ],
  fixtures: [
    { id: 1, event: 1, teamH: 1, teamA: 2, teamHScore: 2, teamAScore: 1, finished: true },
    { id: 2, event: 2, teamH: 2, teamA: 1, teamHScore: 0, teamAScore: 0, finished: true },
    { id: 3, event: 3, teamH: 1, teamA: 2, teamHScore: null, teamAScore: null, finished: false },
  ],
  rows: [row(2, 500, 1, 90, { cleanSheets: 1 }), row(1, 500, 1, 75, { goals: 1, totalPoints: 7 }), row(3, 500, 1, 0), row(1, 600, 2, 90)],
};

describe("past-season player match rows", () => {
  it("gives each player his finished fixtures in order, with the opponent and score from his own side", () => {
    const stored = { schema: 1 as const, fields: [...PLAYER_MATCH_FIELDS], seasons: { "2019/20": buildSeasonPlayerMatches(ledger) } };
    const rows = playerMatchesFor(decodePlayerMatches(encodePlayerMatches(stored)), 500)["2019/20"];
    expect(rows.map((r) => r.fixture)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({ opponentShortName: "CHE", home: true, teamScore: 2, opponentScore: 1, minutes: 75, goals: 1, totalPoints: 7, xG: null });
    expect(rows[1]).toMatchObject({ opponentShortName: "CHE", home: false, teamScore: 0, opponentScore: 0, cleanSheets: 1 });
  });

  it("has nothing for a player with no rows", () => {
    const stored = { schema: 1 as const, fields: [...PLAYER_MATCH_FIELDS], seasons: { "2019/20": buildSeasonPlayerMatches(ledger) } };
    expect(playerMatchesFor(stored, 999)).toEqual({});
  });
});
