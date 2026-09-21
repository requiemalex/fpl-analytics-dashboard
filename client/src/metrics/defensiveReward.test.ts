import { describe, it, expect } from "vitest";
import { cleanSheetPointsPerGame, bonusPerGame, defensiveRewardPerGame, CLEAN_SHEET_POINTS_BY_POSITION } from "./defensiveReward";
import { perGame } from "./calculations";
import { makePlayer } from "../test/fixtures";

describe("CLEAN_SHEET_POINTS_BY_POSITION", () => {
  it("matches the current official FPL scoring rules (GKP/DEF=4, MID=1, FWD=0)", () => {
    expect(CLEAN_SHEET_POINTS_BY_POSITION).toEqual({ GKP: 4, DEF: 4, MID: 1, FWD: 0 });
  });
});

describe("cleanSheetPointsPerGame", () => {
  it("multiplies clean sheets by the position's point value, then applies perGame()", () => {
    const player = makePlayer({ id: 1, position: "DEF", cleanSheets: 10, minutes: 900 });
    expect(cleanSheetPointsPerGame(player)).toBe(perGame(10 * 4, 900));
  });

  it("forwards earn zero clean-sheet points regardless of clean sheet count", () => {
    const player = makePlayer({ id: 1, position: "FWD", cleanSheets: 5, minutes: 900 });
    expect(cleanSheetPointsPerGame(player)).toBe(0);
  });

  it("midfielders earn 1 point per clean sheet", () => {
    const player = makePlayer({ id: 1, position: "MID", cleanSheets: 3, minutes: 270 });
    expect(cleanSheetPointsPerGame(player)).toBe(perGame(3, 270));
  });

  it("returns null when cleanSheets is null (no data for this mode)", () => {
    const player = makePlayer({ id: 1, position: "DEF", cleanSheets: null, minutes: 900 });
    expect(cleanSheetPointsPerGame(player)).toBeNull();
  });

  it("returns null for zero minutes (undefined rate)", () => {
    const player = makePlayer({ id: 1, position: "DEF", cleanSheets: 0, minutes: 0 });
    expect(cleanSheetPointsPerGame(player)).toBeNull();
  });
});

describe("bonusPerGame", () => {
  it("is exactly perGame(bonus, minutes)", () => {
    const player = makePlayer({ id: 1, position: "MID", bonus: 12, minutes: 1800 });
    expect(bonusPerGame(player)).toBe(perGame(12, 1800));
  });
});

describe("defensiveRewardPerGame", () => {
  it("sums cleanSheetPointsPerGame + bonusPerGame", () => {
    const player = makePlayer({ id: 1, position: "DEF", cleanSheets: 5, bonus: 10, minutes: 900 });
    const cs = cleanSheetPointsPerGame(player) as number;
    const bonus = bonusPerGame(player) as number;
    expect(defensiveRewardPerGame(player)).toBeCloseTo(cs + bonus, 10);
  });

  it("returns null if either component is null, never silently treating one as 0", () => {
    const player = makePlayer({ id: 1, position: "DEF", cleanSheets: null, bonus: 10, minutes: 900 });
    expect(defensiveRewardPerGame(player)).toBeNull();
  });
});
