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

  // Audit 2026-10-18 M13: this used total xGC as its example; a total that
  // grows with minutes now ranks on its per-game rate (next test), so the
  // flip is shown with xGC/Game, which ranks on itself.
  const perGamePopulation = [
    makePlayer({ id: 11, position: "DEF", minutes: 3000, xGC: 34, xGCPerGame: 1.0 }),
    makePlayer({ id: 12, position: "DEF", minutes: 2700, xGC: 45, xGCPerGame: 1.5 }),
    makePlayer({ id: 13, position: "DEF", minutes: 2700, xGC: 15, xGCPerGame: 0.5 }),
    makePlayer({ id: 14, position: "DEF", minutes: 540, xGC: 12, xGCPerGame: 2.0 }),
  ];
  const perGameDerived = new Map(perGamePopulation.map((p) => [p.id, getPlayerDerivedMetrics(p)]));

  it("flips a lower-is-better metric, so a higher percentile is always better", () => {
    const metric = comparisonMetricByKey("xGCPerGame")!;
    expect(metric.higherIsBetter).toBe(false);
    const got = comparisonPercentiles(metric, perGamePopulation, perGameDerived, [perGamePopulation[2]], 450);
    // 0.5 per game is the lowest of 4 DEFs: raw 12.5th, flipped to 87.5th.
    expect(got.get(13)).toBe(87.5);
  });

  it("ranks total xGC on xGC per game, so fewer minutes don't make a defender look better (audit 2026-10-18 M13)", () => {
    const metric = comparisonMetricByKey("xGC")!;
    const got = comparisonPercentiles(metric, perGamePopulation, perGameDerived, perGamePopulation, 450);
    // Player 14 has the smallest total (12, in 540 minutes) but the worst rate: bottom, not top.
    expect(got.get(14)).toBe(12.5);
    expect(got.get(13)).toBe(87.5);
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
