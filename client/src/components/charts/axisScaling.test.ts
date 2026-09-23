import { describe, it, expect } from "vitest";
import { chooseScaleKind, planAxis, planScatterAxes, scalesMismatched } from "./axisScaling";

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
  it("log-scales Price, whose middle half is crammed into a sliver by the premium tail — with round ticks", () => {
    const axis = planAxis(PRICES);
    expect(axis.kind).toBe("log");
    expect(axis.ticks).toEqual([4, 5, 7.5, 10, 15]);
    expect(axis.domain[0]).toBeGreaterThan(3); // hugs the cheapest player, not £0 or £2m
    expect(axis.domain[0]).toBeLessThan(3.9);
    expect(axis.domain[1]).toBeGreaterThan(14.7);
  });

  it("keeps Points linear — its spread already fills the axis", () => {
    expect(chooseScaleKind(POINTS)).toBe("linear");
  });

  it("uses √ rather than log when the axis has zeros (log can't show 0)", () => {
    const goals = [...Array(30).fill(0), ...Array(12).fill(1), 2, 3, 5, 9, 14, 22];
    const axis = planAxis(goals);
    expect(axis.kind).toBe("sqrt");
    expect(axis.domain[0]).toBe(0);
    for (const t of axis.ticks) expect(Number.isInteger(t)).toBe(true);
  });

  it("stays linear for negative values, too few points, or a middle half that's one repeated value", () => {
    expect(chooseScaleKind([-5, -1, 0, 0.5, 1, 1.2, 1.3, 40])).toBe("linear");
    expect(chooseScaleKind([4.5, 4.6, 14.7])).toBe("linear");
    expect(chooseScaleKind([...Array(30).fill(0), 1, 2, 30])).toBe("linear");
  });
});

describe("<axis_scaling> rule 3 — fit the data", () => {
  it("fits a range well clear of 0 with a small margin, not from 0 (clubs' goals against 27–58)", () => {
    const axis = planAxis([27, 35, 46, 48, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
    expect(axis.kind).toBe("linear");
    expect(axis.domain[0]).toBeCloseTo(25.45);
    expect(axis.domain[1]).toBeCloseTo(59.55);
    expect(axis.ticks).toEqual([30, 35, 40, 45, 50, 55]);
  });

  it("starts at 0 when the lowest value is already close to it (Points from 19 of 0–239)", () => {
    expect(planAxis(POINTS).domain[0]).toBe(0);
  });

  it("never crosses 0 when the data doesn't, and spans it when it does", () => {
    expect(planAxis([0, 1, 3, 8, 12]).domain[0]).toBe(0);
    const gd = planAxis([-40, -12, 3, 20, 45]);
    expect(gd.domain[0]).toBeLessThan(-40);
    expect(gd.ticks).toContain(0);
  });
});

describe("planScatterAxes", () => {
  it("gives both axes one shared plan when the reference line is drawn, so y = x stays the diagonal", () => {
    const xs = [38, 41, 46, 47, 49, 50, 54, 58, 58, 61, 62, 65, 67, 72];
    const ys = [38, 47, 45, 47, 43, 53, 48, 51, 40, 61, 57, 66, 57, 74];
    const plan = planScatterAxes(xs, ys, true);
    expect(plan.drawReferenceLine).toBe(true);
    expect(plan.x).toEqual(plan.y);
    expect(plan.x.domain[0]).toBeGreaterThan(30); // not from 0
  });

  it("stretches both axes together when the shared axis is crowded near 0 (xG vs Goals)", () => {
    const xg = [...Array(40).fill(0.3), ...Array(30).fill(1.2), 2.5, 3.1, 4, 6, 8.5, 11, 14.2, 19.8, 25.6];
    const goals = [...Array(40).fill(0), ...Array(30).fill(1), 2, 4, 3, 7, 9, 10, 15, 22, 27];
    const plan = planScatterAxes(xg, goals, true);
    expect(plan.x.kind).toBe("sqrt");
    expect(plan.y).toEqual(plan.x);
  });

  it("drops the line and plans each axis alone for mismatched scales", () => {
    const plan = planScatterAxes(PRICES, POINTS, true);
    expect(plan).toMatchObject({ lineSuppressed: true, drawReferenceLine: false });
    expect(plan.x.kind).toBe("log");
    expect(plan.y.kind).toBe("linear");
  });
});
