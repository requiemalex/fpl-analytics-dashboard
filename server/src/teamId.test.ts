import { describe, expect, it } from "vitest";
import { canonicalId, isValidGameweekId, isValidTeamId } from "./teamId.js";

// Audit 2026-11-03 phase 3 R6: the server's rule is the New Squad dialog's
// (0 rejected), a gameweek is 1-38, and leading zeros don't make a second
// cache entry for the same team.
describe("entry route IDs", () => {
  it("a team ID is whole digits, fewer than 12, above 0", () => {
    for (const ok of ["1", "1234567", "99999999999", "00012345"]) expect(isValidTeamId(ok), ok).toBe(true);
    for (const bad of ["0", "000", "999999999999", "1.5", "1e3", "-1", " 1", "", "abc"]) expect(isValidTeamId(bad), bad).toBe(false);
  });

  it("a gameweek ID is 1 to 38", () => {
    for (const ok of ["1", "9", "38", "01"]) expect(isValidGameweekId(ok), ok).toBe(true);
    for (const bad of ["0", "39", "99999999999", "1.5", "-1", ""]) expect(isValidGameweekId(bad), bad).toBe(false);
  });

  it("an ID is asked for and cached as its number", () => {
    expect(canonicalId("00012345")).toBe("12345");
    expect(canonicalId("7")).toBe("7");
  });
});
