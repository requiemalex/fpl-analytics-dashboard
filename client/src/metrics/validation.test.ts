import { describe, it, expect, vi } from "vitest";
import { runMetricValidation } from "./validation";
import { makePlayer } from "../test/fixtures";

describe("runMetricValidation (xGI = xG + xA cross-check)", () => {
  it("reports no discrepancy when xGI matches xG+xA within tolerance", () => {
    const players = [makePlayer({ id: 1, position: "MID", xG: 5.2, xA: 3.1, xGI: 8.3 })];
    const report = runMetricValidation(players);
    expect(report.discrepancies).toHaveLength(0);
    expect(report.playersChecked).toBe(1);
    expect(report.checkedMetrics).toEqual(["xGI vs xG+xA"]);
  });

  it("tolerates floating-point noise up to and including 0.01", () => {
    // xG+xA = 8.30000000001 vs xGI 8.31 -> diff ~0.00999... within 0.01 tolerance? verify boundary precisely instead.
    const players = [makePlayer({ id: 1, position: "MID", xG: 5.0, xA: 3.0, xGI: 8.01 })];
    const report = runMetricValidation(players);
    // diff = |8.01 - 8.0| = 0.01, not > tolerance (0.01), so should NOT be flagged.
    expect(report.discrepancies).toHaveLength(0);
  });

  it("L4 regression: does not false-positive on IEEE-754 representation noise exactly at the tolerance boundary (0.4 - 0.39 === 0.010000000000000009 in JS, which is > 0.01 unrounded)", () => {
    const players = [makePlayer({ id: 1, position: "MID", xG: 0.39, xA: 0, xGI: 0.4 })];
    expect(0.4 - 0.39).toBeGreaterThan(0.01); // sanity-check the raw JS float artifact this test guards against
    const report = runMetricValidation(players);
    expect(report.discrepancies).toHaveLength(0);
  });

  it("flags a discrepancy strictly beyond the 0.01 tolerance", () => {
    const players = [makePlayer({ id: 1, position: "MID", xG: 5.0, xA: 3.0, xGI: 8.02 })];
    const report = runMetricValidation(players);
    expect(report.discrepancies).toHaveLength(1);
    expect(report.discrepancies[0]).toMatchObject({
      playerId: 1,
      metric: "xGI vs xG+xA",
      apiValue: 8.02,
      derivedValue: 8.0,
    });
    expect(report.discrepancies[0].diff).toBeCloseTo(0.02, 10);
  });

  it("skips the check entirely (no discrepancy raised) when any of xG/xA/xGI is null", () => {
    const players = [
      makePlayer({ id: 1, position: "FWD", xG: null, xA: 3, xGI: 3 }),
      makePlayer({ id: 2, position: "FWD", xG: 5, xA: null, xGI: 5 }),
      makePlayer({ id: 3, position: "FWD", xG: 5, xA: 3, xGI: null }),
    ];
    const report = runMetricValidation(players);
    expect(report.discrepancies).toHaveLength(0);
    expect(report.playersChecked).toBe(3);
  });

  it("checks every player independently across a mixed list", () => {
    const players = [
      makePlayer({ id: 1, position: "MID", xG: 1, xA: 1, xGI: 2 }), // matches
      makePlayer({ id: 2, position: "MID", xG: 1, xA: 1, xGI: 5 }), // way off
    ];
    const report = runMetricValidation(players);
    expect(report.discrepancies).toHaveLength(1);
    expect(report.discrepancies[0].playerId).toBe(2);
  });

  it("warns to the console when a discrepancy is found — never silently concealed", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const players = [makePlayer({ id: 1, position: "MID", xG: 1, xA: 1, xGI: 5 })];
    runMetricValidation(players);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("does not warn when there are no discrepancies", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const players = [makePlayer({ id: 1, position: "MID", xG: 1, xA: 1, xGI: 2 })];
    runMetricValidation(players);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
