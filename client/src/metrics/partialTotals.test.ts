import { describe, expect, it } from "vitest";
import { coverageNote, partialAverage, partialTotal, sumKnown } from "./partialTotals";

describe("<partial_totals>: a Totals or Average row over matches", () => {
  it("adds up the matches with a figure and averages over those same matches", () => {
    const s = sumKnown([2, null, 4]);
    expect(s).toEqual({ sum: 6, n: 2, of: 3 });
    expect(partialTotal(s)).toBe(6);
    // Over the 2 matches with a figure, never 6 ÷ 3.
    expect(partialAverage(s)).toBe(3);
  });

  it("is null ('—') only when no match has a figure", () => {
    expect(sumKnown([null, null])).toBeNull();
    expect(sumKnown([])).toBeNull();
    expect(partialTotal(null)).toBeNull();
    expect(partialAverage(null)).toBeNull();
  });

  it("keeps a real 0", () => {
    expect(partialTotal(sumKnown([0, 0]))).toBe(0);
  });

  it("says how many matches it's from only when that's some of them", () => {
    expect(coverageNote(sumKnown([1, 2]))).toBeUndefined();
    expect(coverageNote(sumKnown([1, null, 2]))).toBe("From the 2 of 3 matches that have a figure");
    expect(coverageNote(sumKnown([1, null]), "Understat")).toBe("From the 1 of 2 matches Understat has a figure for");
    expect(coverageNote(null)).toBeUndefined();
  });
});
