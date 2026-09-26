import { describe, it, expect } from "vitest";
import { aggregateClubSeason, checkLedgerAgainstScores } from "./aggregate.js";
import { mergeArchivedRows } from "./archive.js";
import { fixturesFromOfficial, ledgerRowsFromOfficial, teamsFromBootstrap } from "./official.js";
import type { ClubSeason } from "./types.js";

// A live season in the official API's own shapes, run through the same
// functions the app (routes/historicBulk.ts) and the archive
// (scripts/club-history/archive-current.ts) use. Salah plays for Liverpool
// and is then dropped from FPL's player list; Grealish moves from Arsenal
// to Everton between gameweeks 1 and 2.
const TEAMS = [
  { id: 1, code: 3, name: "Arsenal", short_name: "ARS" },
  { id: 2, code: 14, name: "Liverpool", short_name: "LIV" },
  { id: 3, code: 11, name: "Everton", short_name: "EVE" },
];
const FIXTURES = [
  { id: 10, event: 1, team_h: 2, team_a: 1, team_h_score: 2, team_a_score: 0, finished: true }, // LIV 2–0 ARS
  { id: 11, event: 2, team_h: 3, team_a: 2, team_h_score: 1, team_a_score: 1, finished: true }, // EVE 1–1 LIV
];
const SALAH = { id: 101, code: 118748, element_type: 3 };
const ELEMENTS = [
  SALAH,
  { id: 102, code: 2002, element_type: 1 }, // Liverpool keeper
  { id: 201, code: 3001, element_type: 2 }, // Arsenal defender
  { id: 202, code: 3002, element_type: 3 }, // Grealish — Arsenal in GW1, Everton in GW2 (his current club)
  { id: 301, code: 4001, element_type: 4 }, // Everton forward
];

function gw(fixture: number, wasHome: boolean, minutes: number, points: number, goals: number, xG: number) {
  return { fixture, was_home: wasHome, round: fixture - 9, minutes, total_points: points, goals_scored: goals, assists: 0, expected_goals: xG.toFixed(2) };
}
const HISTORY = new Map<number, unknown[]>([
  [101, [gw(10, true, 90, 13, 2, 1.5), gw(11, false, 90, 8, 1, 0.6)]],
  [102, [gw(10, true, 90, 6, 0, 0.1), gw(11, false, 90, 2, 0, 0)]],
  [201, [gw(10, false, 90, 2, 0, 0.4)]],
  [202, [gw(10, false, 30, 1, 0, 0.2), gw(11, true, 60, 2, 0, 0.3)]],
  [301, [gw(11, true, 90, 7, 1, 0.9)]],
]);

const fixtures = fixturesFromOfficial(FIXTURES);
function bootstrap(elements: typeof ELEMENTS) {
  return { teams: TEAMS, elements };
}
/** What one fetch of the official API gives: rows for every player FPL lists right now. */
function fetchRows(elements: typeof ELEMENTS) {
  return ledgerRowsFromOfficial(bootstrap(elements), fixtures, HISTORY);
}
function clubs(rows: ReturnType<typeof fetchRows>): Map<string, ClubSeason> {
  return new Map(aggregateClubSeason("2026/27", teamsFromBootstrap(bootstrap(ELEMENTS)), fixtures, rows).map((c) => [c.shortName, c]));
}

const withSalah = fetchRows(ELEMENTS);
const withoutSalah = fetchRows(ELEMENTS.filter((e) => e.id !== SALAH.id));
const full = clubs(withSalah);

describe("a player who moves clubs mid-season", () => {
  it("each match counts for the club he played it for, not his current club", () => {
    expect(withSalah.filter((r) => r.code === 3002).map((r) => [r.fixture, r.team])).toEqual([
      [10, 1], // Arsenal
      [11, 3], // Everton
    ]);
    expect(full.get("ARS")!.xG).toBe(0.6); // 0.4 + his 0.2
    expect(full.get("EVE")!.xG).toBe(1.2); // 0.9 + his 0.3
  });
});

describe("a player dropped from FPL's list, then re-listed", () => {
  it("while listed, his matches count for Liverpool", () => {
    const liv = full.get("LIV")!;
    expect(liv.goals).toBe(3);
    expect(liv.xG).toBe(2.2);
    expect(liv.fantasyPoints).toBe(29);
    expect(checkLedgerAgainstScores(fixtures, withSalah)).toEqual([]);
  });

  it("a fresh fetch alone loses him — and the score check flags every match he scored in", () => {
    const liv = clubs(withoutSalah).get("LIV")!;
    expect(liv.goals).toBe(0);
    expect(liv.fantasyPoints).toBe(8);
    expect(checkLedgerAgainstScores(fixtures, withoutSalah)).toHaveLength(2);
  });

  it("the archive keeps his appearances, so every club's figures are unchanged", () => {
    const archived = mergeArchivedRows(withSalah, withoutSalah);
    expect(archived.added).toBe(0);
    expect(clubs(archived.rows)).toEqual(full);
  });

  it("re-listed: his rows are replaced, not duplicated, and the figures are as before", () => {
    const archived = mergeArchivedRows(mergeArchivedRows(withSalah, withoutSalah).rows, fetchRows(ELEMENTS));
    expect(archived.added).toBe(0);
    expect(archived.rows).toHaveLength(withSalah.length);
    expect(clubs(archived.rows)).toEqual(full);
  });

  it("a late correction to a re-listed player's match flows into the archive", () => {
    const corrected = fetchRows(ELEMENTS).map((r) => (r.code === SALAH.code && r.fixture === 10 ? { ...r, totalPoints: 14 } : r));
    const archived = mergeArchivedRows(withSalah, corrected);
    expect(clubs(archived.rows).get("LIV")!.fantasyPoints).toBe(30);
  });
});
