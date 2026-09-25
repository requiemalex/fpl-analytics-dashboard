import { describe, it, expect } from "vitest";
import { fmtNumber, fmtOrdinal, fmtPercent, fmtPrice, roundAsDisplayed, DASH } from "./format";

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

describe("fmtOrdinal (audit 2026-09-25 player-team-profiles L2: the radar said \"42th\", \"1th\")", () => {
  it("uses st/nd/rd/th, with 11–13 as th", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 42, 100, 101, 111].map(fmtOrdinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "42nd", "100th", "101st", "111th",
    ]);
  });

  it("rounds first, and shows — for no value", () => {
    expect(fmtOrdinal(41.6)).toBe("42nd");
    expect(fmtOrdinal(0.4)).toBe("0th");
    expect(fmtOrdinal(null)).toBe(DASH);
  });
});
