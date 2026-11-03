import { describe, it, expect } from "vitest";
import { computePositionPercentiles, percentileFromCounts, percentileInPool, percentileInSortedPool } from "./percentiles";
import { computeRadarDataForAxes } from "./radarStats";
import { makePlayer } from "../test/fixtures";

describe("computePositionPercentiles", () => {
  it("computes the mean-rank percentile formula independently for a simple ascending set", () => {
    // values 10,20,30,40,50 for 5 MID players, metric = totalPoints.
    const players = [10, 20, 30, 40, 50].map((pts, i) => makePlayer({ id: i + 1, position: "MID", totalPoints: pts }));
    const result = computePositionPercentiles(players, (p) => p.totalPoints, 0);
    // Independently derive expected percentile via (below + equal/2)/n*100
    const values = [10, 20, 30, 40, 50];
    for (const p of players) {
      const v = p.totalPoints as number;
      const below = values.filter((x) => x < v).length;
      const equal = values.filter((x) => x === v).length;
      const expected = ((below + equal / 2) / values.length) * 100;
      expect(result.get(p.id)).toBeCloseTo(expected, 10);
    }
    // Lowest scorer should be at 10th percentile (below=0,equal=1,n=5 -> 10)
    expect(result.get(1)).toBeCloseTo(10, 10);
    // Highest scorer should be at 90th percentile (below=4,equal=1,n=5 -> 90)
    expect(result.get(5)).toBeCloseTo(90, 10);
  });

  it("gives tied values the same midpoint percentile", () => {
    const players = [makePlayer({ id: 1, position: "FWD", totalPoints: 50 }), makePlayer({ id: 2, position: "FWD", totalPoints: 50 }), makePlayer({ id: 3, position: "FWD", totalPoints: 100 })];
    const result = computePositionPercentiles(players, (p) => p.totalPoints, 0);
    expect(result.get(1)).toBe(result.get(2));
    // below=0, equal=2, n=3 -> (0+1)/3*100 = 33.33...
    expect(result.get(1)).toBeCloseTo((0 + 2 / 2) / 3 * 100, 10);
  });

  it("a single eligible player in a position has no rank (<one_rank_rule>: a pool under 2 is null, not 100)", () => {
    const players = [makePlayer({ id: 1, position: "GKP", totalPoints: 5 })];
    const result = computePositionPercentiles(players, (p) => p.totalPoints, 0);
    expect(result.get(1)).toBeNull();
  });

  it("excludes players below the minimum-minutes threshold from the reference population", () => {
    const players = [
      makePlayer({ id: 1, position: "DEF", totalPoints: 10, minutes: 100 }), // below threshold
      makePlayer({ id: 2, position: "DEF", totalPoints: 20, minutes: 900 }),
      makePlayer({ id: 3, position: "DEF", totalPoints: 30, minutes: 900 }),
    ];
    const result = computePositionPercentiles(players, (p) => p.totalPoints, 450);
    // Player 1 excluded from the reference population entirely -> null result
    expect(result.get(1)).toBeNull();
    // Players 2 and 3 form their own 2-person population
    expect(result.get(2)).toBeCloseTo(25, 10); // below=0,equal=1,n=2 -> 25
    expect(result.get(3)).toBeCloseTo(75, 10); // below=1,equal=1,n=2 -> 75
  });

  it("excludes players whose metric itself is null from the reference population, and returns null for them", () => {
    const players = [
      makePlayer({ id: 1, position: "MID", xGI: null, minutes: 900 }),
      makePlayer({ id: 2, position: "MID", xGI: 5, minutes: 900 }),
      makePlayer({ id: 3, position: "MID", xGI: 10, minutes: 900 }),
    ];
    const result = computePositionPercentiles(players, (p) => p.xGI, 0);
    expect(result.get(1)).toBeNull();
    expect(result.get(2)).not.toBeNull();
    expect(result.get(3)).not.toBeNull();
  });

  it("computes percentiles independently per position — a MID never competes against a DEF", () => {
    const players = [
      makePlayer({ id: 1, position: "DEF", totalPoints: 100, minutes: 900 }),
      makePlayer({ id: 2, position: "MID", totalPoints: 1, minutes: 900 }),
    ];
    const result = computePositionPercentiles(players, (p) => p.totalPoints, 0);
    // Each is the sole player in their own position -> no rank, not compared cross-position.
    expect(result.get(1)).toBeNull();
    expect(result.get(2)).toBeNull();
  });

  it("returns a full-population map with null for every player, including those never assigned a position bucket result", () => {
    const players = [makePlayer({ id: 1, position: "FWD", totalPoints: 5, minutes: 900 })];
    const result = computePositionPercentiles(players, (p) => p.totalPoints, 0);
    expect(result.size).toBe(1);
    expect(result.get(1)).toBeNull();
  });
});

describe("percentileInPool", () => {
  it("ranks a value within a pool that includes it, half of ties counting as below", () => {
    expect(percentileInPool(3, [1, 2, 3, 4])).toBe(62.5);
    expect(percentileInPool(2, [2, 2])).toBe(50);
  });

  it("gives no percentile with no one else to compare against", () => {
    expect(percentileInPool(5, [5])).toBeNull();
    expect(percentileInPool(5, [])).toBeNull();
  });
});

describe("<one_rank_rule>: the one rank formula", () => {
  it("has no rank for a pool of 0 or 1", () => {
    expect(percentileFromCounts(0, 0, 0)).toBeNull();
    expect(percentileFromCounts(0, 1, 1)).toBeNull();
    expect(percentileInPool(7, [])).toBeNull();
    expect(percentileInPool(7, [7])).toBeNull();
    expect(percentileInSortedPool(7, [7])).toBeNull();
    expect(percentileInPool(7, [7], false)).toBeNull();
  });

  it("ranks a pool of 2 at 25 and 75, ties at the midpoint, and flips for lower-is-better", () => {
    expect(percentileInPool(1, [1, 2])).toBe(25);
    expect(percentileInPool(2, [1, 2])).toBe(75);
    expect(percentileInPool(4, [4, 4, 9])).toBeCloseTo((1 / 3) * 100, 10);
    expect(percentileInPool(1, [1, 2], false)).toBe(75);
    expect(percentileInPool(2, [1, 2], false)).toBe(25);
  });

  it("gives the same rank by binary search over a sorted pool as by counting", () => {
    const pool = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5];
    const sorted = [...pool].sort((a, b) => a - b);
    for (const v of pool) for (const up of [true, false]) expect(percentileInSortedPool(v, sorted, up)).toBe(percentileInPool(v, pool, up));
  });

  it("the profile radar draws nothing for a player alone in his position's pool (was a full-green 100)", () => {
    const lone = makePlayer({ id: 1, position: "GKP", totalPoints: 90, minutes: 2000 });
    const others = [makePlayer({ id: 2, position: "DEF", totalPoints: 50, minutes: 2000 }), makePlayer({ id: 3, position: "DEF", totalPoints: 60, minutes: 2000 })];
    const [point] = computeRadarDataForAxes([{ key: "pts", label: "Points", metricFn: (p) => p.totalPoints, higherIsBetter: false }], lone, [lone, ...others], 855);
    expect(point.percentile).toBeNull();
    expect(point.rawValue).toBe(90);
  });
});

describe("computePositionPercentiles and the minimum (<no_data_is_zero>)", () => {
  it("at a threshold of 0 keeps a player with no minutes data in the pool, as 0 minutes", () => {
    const players = [
      makePlayer({ id: 1, position: "MID", totalPoints: 10, minutes: null }),
      makePlayer({ id: 2, position: "MID", totalPoints: 20, minutes: 900 }),
    ];
    const result = computePositionPercentiles(players, (p) => p.totalPoints, 0);
    expect(result.get(1)).toBe(25);
    expect(result.get(2)).toBe(75);
  });

  it("drops a player with no minutes data under any positive threshold", () => {
    const players = [
      makePlayer({ id: 1, position: "MID", totalPoints: 10, minutes: null }),
      makePlayer({ id: 2, position: "MID", totalPoints: 20, minutes: 900 }),
      makePlayer({ id: 3, position: "MID", totalPoints: 30, minutes: 900 }),
    ];
    const result = computePositionPercentiles(players, (p) => p.totalPoints, 1);
    expect(result.get(1)).toBeNull();
    expect(result.get(2)).toBe(25);
  });
});
