import { describe, expect, it } from "vitest";
import { buildSeasonPlayerMatches, decodePlayerMatches, encodePlayerMatches, PEER_FIELDS, peersFor, PLAYER_MATCH_FIELDS, playerMatchesFor } from "./playerMatches.js";
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
  rows: [
    row(2, 500, 1, 90, { cleanSheets: 1 }),
    row(1, 500, 1, 75, { goals: 1, totalPoints: 7 }),
    row(3, 500, 1, 0),
    row(1, 600, 2, 90, { xG: 0.4 }),
    row(2, 600, 2, 30, { xG: 0.1 }),
    row(1, 700, 2, 90, { position: 2 }),
    row(2, 800, 2, 0),
  ],
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

describe("a past season's comparison pool", () => {
  const stored = () => ({ schema: 1 as const, fields: [...PLAYER_MATCH_FIELDS], seasons: { "2019/20": buildSeasonPlayerMatches(ledger) } });
  const at = (field: string) => PEER_FIELDS.indexOf(field as (typeof PEER_FIELDS)[number]);

  it("is everyone else in his position that season who played, with totals over their own match rows", () => {
    const peers = peersFor(stored(), 500)["2019/20"];
    expect(peers.position).toBe(3);
    // 600 is a midfielder who played; 700 a defender; 800 never played.
    expect(peers.players).toHaveLength(1);
    const [p] = peers.players;
    expect(p[at("minutes")]).toBe(120);
    expect(p[at("matches")]).toBe(2);
    expect(p[at("xG")]).toBe(0.5);
  });

  it("gives a stat any match he played lacks as null, never a part-sum", () => {
    const peers = peersFor(stored(), 600)["2019/20"];
    // 500 played two matches with no xG recorded.
    expect(peers.players[0][at("xG")]).toBeNull();
    expect(peers.players[0][at("totalPoints")]).toBe(9);
  });
});
