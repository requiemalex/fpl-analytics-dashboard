import { describe, expect, it } from "vitest";
import { pairClubsAndFixtures, type FplFinishedFixture, type UsResult } from "./pairing.js";

// Four clubs, a double round robin's first half: FPL ids 1-4 (codes 11-44),
// Understat ids "a"-"d" — deliberately not in the same order.
const teams = [
  { id: 1, code: 11 },
  { id: 2, code: 22 },
  { id: 3, code: 33 },
  { id: 4, code: 44 },
];
const usFor: Record<number, string> = { 1: "c", 2: "a", 3: "d", 4: "b" };
const fixtures: FplFinishedFixture[] = [
  { id: 101, teamH: 1, teamA: 2, homeGoals: 2, awayGoals: 0 },
  { id: 102, teamH: 3, teamA: 4, homeGoals: 1, awayGoals: 1 },
  { id: 103, teamH: 1, teamA: 3, homeGoals: 0, awayGoals: 3 },
  { id: 104, teamH: 2, teamA: 4, homeGoals: 4, awayGoals: 2 },
  { id: 105, teamH: 4, teamA: 1, homeGoals: 1, awayGoals: 0 },
  { id: 106, teamH: 2, teamA: 3, homeGoals: 2, awayGoals: 2 },
];
const results: UsResult[] = fixtures.map((f) => ({ id: `m${f.id}`, homeTeamId: usFor[f.teamH], awayTeamId: usFor[f.teamA], homeGoals: f.homeGoals, awayGoals: f.awayGoals }));
const usTeamIds = ["a", "b", "c", "d"];

describe("pairClubsAndFixtures", () => {
  it("pairs every club and fixture from results alone, no names or seeds", () => {
    const r = pairClubsAndFixtures(teams, fixtures, results, usTeamIds, new Map());
    expect(r.problems).toEqual([]);
    expect(Object.fromEntries(r.teamByFplId)).toEqual({ 1: "c", 2: "a", 3: "d", 4: "b" });
    expect(r.matchByFixture.get(104)).toBe("m104");
    expect(r.unmatchedFixtures).toEqual([]);
  });

  it("uses last season's pairings as seeds, and still checks them", () => {
    const r = pairClubsAndFixtures(teams, fixtures, results, usTeamIds, new Map([[11, "c"]]));
    expect(r.problems).toEqual([]);
    expect(r.teamByFplId.get(1)).toBe("c");
  });

  it("reports a wrong seed rather than trusting it", () => {
    const r = pairClubsAndFixtures(teams, fixtures, results, usTeamIds, new Map([[11, "a"], [22, "c"]]));
    expect(r.problems.length).toBeGreaterThan(0);
  });

  it("reports a score the two sources disagree on", () => {
    const tampered = results.map((m) => (m.id === "m103" ? { ...m, awayGoals: 2 } : m));
    const r = pairClubsAndFixtures(teams, fixtures, tampered, usTeamIds, new Map([[11, "c"], [22, "a"], [33, "d"], [44, "b"]]));
    expect(r.problems.some((p) => p.includes("fixture 103"))).toBe(true);
    expect(r.matchByFixture.has(103)).toBe(false);
  });

  it("treats a finished FPL fixture Understat hasn't published yet as pending, not a problem", () => {
    const r = pairClubsAndFixtures(teams, fixtures, results.filter((m) => m.id !== "m106"), usTeamIds, new Map([[11, "c"], [22, "a"], [33, "d"], [44, "b"]]));
    expect(r.problems).toEqual([]);
    expect(r.unmatchedFixtures).toEqual([106]);
  });
});
