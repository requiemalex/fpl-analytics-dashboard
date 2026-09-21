import { describe, it, expect } from "vitest";
import { bandForPercentile, computePositionPercentiles } from "./percentiles";
import { makePlayer } from "../test/fixtures";

describe("bandForPercentile", () => {
  it("bands per the documented thresholds (90/70/30)", () => {
    expect(bandForPercentile(100)).toBe("excellent");
    expect(bandForPercentile(90)).toBe("excellent");
    expect(bandForPercentile(89.999)).toBe("good");
    expect(bandForPercentile(70)).toBe("good");
    expect(bandForPercentile(69.999)).toBe("average");
    expect(bandForPercentile(30)).toBe("average");
    expect(bandForPercentile(29.999)).toBe("poor");
    expect(bandForPercentile(0)).toBe("poor");
  });
});

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

  it("a single eligible player in a position gets 100 (documented n<=1 special case)", () => {
    const players = [makePlayer({ id: 1, position: "GKP", totalPoints: 5 })];
    const result = computePositionPercentiles(players, (p) => p.totalPoints, 0);
    expect(result.get(1)).toBe(100);
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
    // Each is the sole player in their own position -> 100, not compared cross-position.
    expect(result.get(1)).toBe(100);
    expect(result.get(2)).toBe(100);
  });

  it("returns a full-population map with null for every player, including those never assigned a position bucket result", () => {
    const players = [makePlayer({ id: 1, position: "FWD", totalPoints: 5, minutes: 900 })];
    const result = computePositionPercentiles(players, (p) => p.totalPoints, 0);
    expect(result.size).toBe(1);
    expect(result.get(1)).toBe(100);
  });
});
