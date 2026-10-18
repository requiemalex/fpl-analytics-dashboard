import { describe, expect, it } from "vitest";
import { barWidths } from "./statBar";

describe("tile bar widths (audit 2026-10-18 M16)", () => {
  it("Highest First: the leader is full length, the rest in proportion", () => {
    expect(barWidths([4, 2, 1])).toEqual([100, 50, 25]);
  });
  it("Lowest First on a non-negative metric: the leader (smallest) is full length, a row twice the leader's figure half length", () => {
    expect(barWidths([1, 2, 4])).toEqual([100, 50, 25]);
    expect(barWidths([0, 0, 3])).toEqual([100, 100, 4]);
  });
  it("+/- metrics keep |value| ÷ largest |value| in either order", () => {
    expect(barWidths([-2, -1, 1], true)).toEqual([100, 50, 50]);
    expect(barWidths([2, 1, -1], true)).toEqual([100, 50, 50]);
  });
  it("null rows draw nothing; all-zero rows draw nothing", () => {
    const w = barWidths([3, null, 1]);
    expect(w.slice(0, 2)).toEqual([100, 0]);
    expect(w[2]).toBeCloseTo(100 / 3, 10);
    expect(barWidths([0, 0])).toEqual([0, 0]);
  });
});
