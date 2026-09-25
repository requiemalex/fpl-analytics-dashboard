import { describe, it, expect } from "vitest";
import { perMatchPositionPercentile, seasonMidPrice, seasonPricePercentile, seasonPricePools, teamMatchesPlayed } from "./profileComparisons";
import { makePlayer, makeSeason } from "../test/fixtures";
import type { NormalizedFixture } from "../types/normalized";

function fixture(id: number, home: number, away: number, finished = true): NormalizedFixture {
  return { id, eventId: id, homeTeamId: home, awayTeamId: away, homeScore: null, awayScore: null, kickoffTime: null, finished, homeDifficulty: 3, awayDifficulty: 3 };
}

describe("teamMatchesPlayed", () => {
  it("counts each club's finished matches, home and away, and ignores unplayed ones", () => {
    const counts = teamMatchesPlayed([fixture(1, 1, 2), fixture(2, 2, 3), fixture(3, 1, 3, false)]);
    expect(counts.get(1)).toBe(1);
    expect(counts.get(2)).toBe(2);
    expect(counts.get(3)).toBe(1);
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

describe("season price comparison", () => {
  it("uses the middle of the start and end price, and nothing when either is missing", () => {
    expect(seasonMidPrice({ startCost: 5, endCost: 5.6 })).toBeCloseTo(5.3);
    expect(seasonMidPrice({ startCost: null, endCost: 5.6 })).toBeNull();
  });

  it("pools each season's prices from players at or above the floor, leaving out the player being compared", () => {
    const pools = seasonPricePools(
      new Map([
        [1, [makeSeason({ seasonName: "2024/25", minutes: 2000, startCost: 10, endCost: 10 })]],
        [2, [makeSeason({ seasonName: "2024/25", minutes: 2000, startCost: 5, endCost: 6 })]],
        [3, [makeSeason({ seasonName: "2024/25", minutes: 100, startCost: 4, endCost: 4 })]],
      ]),
      450,
      1,
    );
    expect(pools.get("2024/25")).toEqual([5.5]);
  });

  it("scores cheaper as better: the cheapest is near 100, the dearest near 0", () => {
    expect(seasonPricePercentile(4, [5, 6, 7])).toBe(87.5);
    expect(seasonPricePercentile(8, [5, 6, 7])).toBe(12.5);
    expect(seasonPricePercentile(8, undefined)).toBeNull();
    expect(seasonPricePercentile(8, [])).toBeNull();
  });
});
