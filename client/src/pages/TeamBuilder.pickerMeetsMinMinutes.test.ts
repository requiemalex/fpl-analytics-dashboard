import { describe, it, expect } from "vitest";
import { pickerMeetsMinMinutes } from "./TeamBuilder";

// Team Building's Add Players Min minutes (the owner's rules, 2026-10-19):
// it applies in every Data View, Current Season included (it used to be
// greyed out there), and a player with no minutes counts as 0.
describe("pickerMeetsMinMinutes", () => {
  it("lets everyone through when no minimum is set", () => {
    expect(pickerMeetsMinMinutes(0, null)).toBe(true);
    expect(pickerMeetsMinMinutes(null, null)).toBe(true);
  });

  it("keeps a player at or above the minimum and drops one under it", () => {
    expect(pickerMeetsMinMinutes(900, 900)).toBe(true);
    expect(pickerMeetsMinMinutes(899, 900)).toBe(false);
  });

  it("<no_data_is_zero>: no minutes for the mode counts as 0", () => {
    expect(pickerMeetsMinMinutes(null, 90)).toBe(false);
    expect(pickerMeetsMinMinutes(null, 0)).toBe(true);
  });
});
