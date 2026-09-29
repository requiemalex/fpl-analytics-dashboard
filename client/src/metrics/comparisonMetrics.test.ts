import { describe, it, expect } from "vitest";
import { makePlayer } from "../test/fixtures";
import { getPlayerDerivedMetrics } from "./playerMetrics";
import { computePositionPercentiles } from "./percentiles";
import { COMPARISON_METRICS, comparisonMetricByKey, comparisonPercentiles } from "./comparisonMetrics";

const population = [
  makePlayer({ id: 1, position: "FWD", totalPoints: 200, minutes: 3000, xGC: 30 }),
  makePlayer({ id: 2, position: "FWD", totalPoints: 150, minutes: 2500, xGC: 40 }),
  makePlayer({ id: 3, position: "FWD", totalPoints: 150, minutes: 2000, xGC: 20 }),
  makePlayer({ id: 4, position: "FWD", totalPoints: 90, minutes: 1200, xGC: 35 }),
  makePlayer({ id: 5, position: "FWD", totalPoints: 400, minutes: 300, xGC: 5 }), // under a 450 floor
  makePlayer({ id: 6, position: "MID", totalPoints: 100, minutes: 2000, xGC: 25 }),
  makePlayer({ id: 7, position: "MID", totalPoints: 50, minutes: 1800, xGC: 30 }),
];
const derivedById = new Map(population.map((p) => [p.id, getPlayerDerivedMetrics(p)]));

describe("comparisonPercentiles", () => {
  it("gives the same within-position percentile as computePositionPercentiles, for the players asked about", () => {
    const metric = comparisonMetricByKey("totalPoints")!;
    const expected = computePositionPercentiles(population, (p) => p.totalPoints, 450);
    const targets = [population[0], population[2], population[5]];
    const got = comparisonPercentiles(metric, population, derivedById, targets, 450);
    for (const t of targets) expect(got.get(t.id)).toBeCloseTo(expected.get(t.id)!, 10);
  });

  it("ranks a player only against his own position", () => {
    const metric = comparisonMetricByKey("totalPoints")!;
    const got = comparisonPercentiles(metric, population, derivedById, [population[5]], 450);
    // MID pool is 100 and 50: 100 is the top half.
    expect(got.get(6)).toBe(75);
  });

  it("gives a player under the floor no percentile, and leaves him out of everyone else's pool", () => {
    const metric = comparisonMetricByKey("totalPoints")!;
    const got = comparisonPercentiles(metric, population, derivedById, [population[4], population[0]], 450);
    expect(got.get(5)).toBeNull();
    // Without the 400-point cameo, 200 is the top of 4 FWDs.
    expect(got.get(1)).toBe(87.5);
  });

  it("flips a lower-is-better metric, so a higher percentile is always better", () => {
    const metric = comparisonMetricByKey("xGC")!;
    expect(metric.higherIsBetter).toBe(false);
    const got = comparisonPercentiles(metric, population, derivedById, [population[2]], 450);
    // 20 xGC is the lowest of the 4 eligible FWDs: raw 12.5th, flipped to 87.5th.
    expect(got.get(3)).toBe(87.5);
  });

  it("gives null where the player has no value for the metric", () => {
    const metric = comparisonMetricByKey("xG")!;
    const got = comparisonPercentiles(metric, population, derivedById, [population[0]], 450);
    expect(got.get(1)).toBeNull();
  });
});

describe("COMPARISON_METRICS", () => {
  it("leaves out price and ownership, which are always today's figures", () => {
    const keys = COMPARISON_METRICS.map((m) => m.key);
    expect(keys).not.toContain("price");
    expect(keys).not.toContain("ownership");
    expect(keys).toContain("pointsPerMillion");
  });
});
