import { describe, it, expect } from "vitest";
import { perMatchPositionPercentile, teamMatchesPlayed } from "./profileComparisons";
import { makePlayer } from "../test/fixtures";
import type { NormalizedFixture } from "../types/normalized";

function fixture(id: number, home: number, away: number, finished = true): NormalizedFixture {
  return { id, eventId: id, homeTeamId: home, awayTeamId: away, homeScore: null, awayScore: null, kickoffTime: null, finished, started: finished, homeDifficulty: 3, awayDifficulty: 3 };
}

describe("teamMatchesPlayed", () => {
  it("counts each club's finished matches, home and away, and ignores unplayed ones", () => {
    const counts = teamMatchesPlayed([fixture(1, 1, 2), fixture(2, 2, 3), fixture(3, 1, 3, false)]);
    expect(counts.get(1)).toBe(1);
    expect(counts.get(2)).toBe(2);
    expect(counts.get(3)).toBe(1);
  });

  it("counts a match once it has kicked off, provisional or under way, as the player's own log does", () => {
    const underWay: NormalizedFixture = { ...fixture(4, 1, 2, false), started: true };
    const counts = teamMatchesPlayed([fixture(1, 1, 2), underWay, fixture(5, 1, 2, false)]);
    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(2);
  });
});

describe("perMatchPositionPercentile", () => {
  const matches = new Map([
    [1, 10],
    [2, 10],
  ]);
  const pool = [
    makePlayer({ id: 1, position: "MID", teamId: 1, totalPoints: 10, minutes: 900 }),
    makePlayer({ id: 2, position: "MID", teamId: 2, totalPoints: 40, minutes: 900 }),
    makePlayer({ id: 3, position: "MID", teamId: 2, totalPoints: 80, minutes: 900 }),
    makePlayer({ id: 4, position: "MID", teamId: 2, totalPoints: 900, minutes: 45 }), // under the floor
    makePlayer({ id: 5, position: "FWD", teamId: 2, totalPoints: 900, minutes: 900 }), // another position
  ];

  it("ranks the shown average against others' total ÷ their club's matches, replacing the player's own entry", () => {
    // Player 1 shows 6.0 a match (his own log); others: 4.0 and 8.0.
    expect(perMatchPositionPercentile(6, pool[0], pool, (p) => p.totalPoints, matches, 90)).toBe(50);
  });

  it("leaves out anyone under the floor, in another position, or whose club has no finished matches", () => {
    const noMatches = new Map([[1, 10]]);
    expect(perMatchPositionPercentile(6, pool[0], pool, (p) => p.totalPoints, noMatches, 90)).toBeNull();
  });

  it("gives no percentile for a null average", () => {
    expect(perMatchPositionPercentile(null, pool[0], pool, (p) => p.totalPoints, matches, 90)).toBeNull();
  });
});
