import { describe, it, expect } from "vitest";
import { fmtNumber, fmtPercent, fmtPrice, roundAsDisplayed, DASH } from "./format";

describe("number formatting and filter rounding agree (audit 2026-09-25)", () => {
  it("price and percent round exactly as every other cell and the column filters do", () => {
    // 1.005 is stored as 1.00499…: toFixed(2) showed "1.00" while filters (and fmtNumber) rounded to 1.01.
    expect(fmtPercent(1.005, 2)).toBe("1.01%");
    expect(fmtNumber(1.005, 2)).toBe("1.01");
    expect(roundAsDisplayed(1.005, 2)).toBe(1.01);
    expect(fmtPrice(15.6)).toBe("£15.6m");
    expect(fmtPercent(73.7)).toBe("73.7%");
    expect(fmtPercent(72.5, 0)).toBe("73%");
  });

  it("missing values are still a dash, never 0", () => {
    expect(fmtPrice(null)).toBe(DASH);
    expect(fmtPercent(null)).toBe(DASH);
    expect(fmtPercent(Number.NaN)).toBe(DASH);
  });
});
