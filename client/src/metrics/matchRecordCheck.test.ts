import { describe, it, expect } from "vitest";
import { matchRecordShortfall } from "./matchRecordCheck";

describe("<match_record_check>", () => {
  it("is null when the match record adds up to FPL's season total", () => {
    expect(matchRecordShortfall([{ minutes: 90, totalPoints: 6 }, { minutes: 45, totalPoints: 2 }], { minutes: 135, totalPoints: 8 })).toBeNull();
  });

  // Evan Ferguson 2024/25: the archive's GW24 row has 0 minutes, so its matches add up to 368 / 27 against FPL's 385 / 28.
  it("reports both sides when the record falls short", () => {
    const rows = [{ minutes: 368, totalPoints: 27 }, { minutes: 0, totalPoints: 0 }];
    expect(matchRecordShortfall(rows, { minutes: 385, totalPoints: 28 })).toEqual({ recordMinutes: 368, recordPoints: 27, fplMinutes: 385, fplPoints: 28 });
  });

  it("is null with no match record (before 2016/17 the season's totals are shown instead)", () => {
    expect(matchRecordShortfall([], { minutes: 2000, totalPoints: 100 })).toBeNull();
  });
});
