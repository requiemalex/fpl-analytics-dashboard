import { describe, it, expect } from "vitest";
import { chooseAxisScale, scalesMismatched } from "./axisScaling";

// Real 2025/26 end-of-season figures for a sample of 900+ minute players
// (vaastav snapshot players_raw), plus three real premium prices.
const PRICES = [
  6.2, 6.8, 4.4, 5.3, 4.8, 4.9, 4.3, 4.9, 4.3, 4.8, 3.9, 5.3, 10.3, 5.1, 4.7, 4.9, 5.1, 6.1, 5.3, 4.9, 6.1, 5.4, 8.0, 5.0, 4.5, 5.8, 4.9, 5.3, 4.8,
  4.6, 4.7, 6.4, 6.5, 5.7, 4.3, 5.3, 9.1, 5.0, 5.8, 5.5, 4.5, 5.3, 5.4, 14.7, 13.0, 10.5,
];
const POINTS = [
  162, 57, 100, 62, 165, 47, 52, 98, 46, 94, 34, 99, 114, 131, 45, 116, 104, 103, 36, 134, 175, 81, 131, 92, 113, 165, 59, 81, 128, 116, 90, 75, 119,
  103, 83, 107, 128, 97, 142, 135, 29, 92, 67, 239, 210, 188,
];

describe("<axis_scaling> rule 1 — different scales", () => {
  it("flags Price vs Points (≈16× apart) and club xG vs club FPL points", () => {
    expect(scalesMismatched(PRICES, POINTS)).toBe(true);
    expect(scalesMismatched([55, 70, 81], [1650, 1800, 2100])).toBe(true);
  });

  it("leaves like-for-like pairs alone (xG vs Goals, xGC vs Goals Against)", () => {
    expect(scalesMismatched([3.2, 8.1, 19.6], [2, 9, 22])).toBe(false);
    expect(scalesMismatched([38, 52, 61], [30, 55, 70])).toBe(false);
  });

  it("treats an all-zero axis against a non-zero one as mismatched, and two all-zero axes as not", () => {
    expect(scalesMismatched([0, 0], [3, 5])).toBe(true);
    expect(scalesMismatched([0, 0], [0, 0])).toBe(false);
  });
});

describe("<axis_scaling> rule 2 — long tail", () => {
  it("log-scales Price, whose middle half is crammed into a sliver by the premium tail", () => {
    const scale = chooseAxisScale(PRICES);
    expect(scale.kind).toBe("log");
    expect(scale.domain![0]).toBeLessThanOrEqual(3.9);
    expect(scale.domain![1]).toBeGreaterThanOrEqual(14.7);
    // Round, ascending ticks inside the domain.
    expect(scale.ticks!.length).toBeGreaterThanOrEqual(4);
    for (const t of scale.ticks!) expect(Math.round(t * 10) / 10).toBe(t);
    expect([...scale.ticks!].sort((a, b) => a - b)).toEqual(scale.ticks);
  });

  it("keeps Points linear — its spread already fills the axis", () => {
    expect(chooseAxisScale(POINTS).kind).toBe("linear");
  });

  it("uses √ rather than log when the axis has zeros (log can't show 0)", () => {
    const goals = [...Array(30).fill(0), ...Array(12).fill(1), 2, 3, 5, 9, 14, 22];
    expect(chooseAxisScale(goals).kind).toBe("sqrt");
  });

  it("stays linear for negative values, too few points, or a middle half that's one repeated value", () => {
    expect(chooseAxisScale([-5, -1, 0, 0.5, 1, 1.2, 1.3, 40]).kind).toBe("linear");
    expect(chooseAxisScale([4.5, 4.6, 14.7]).kind).toBe("linear");
    expect(chooseAxisScale([...Array(30).fill(0), 1, 2, 30]).kind).toBe("linear");
  });
});
