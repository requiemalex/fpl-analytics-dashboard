import { describe, it, expect, afterEach } from "vitest";
import { FIXED_FLOOR_MINUTES, fixedFloorMinutes, isBelowFixedFloor, isFixedFloorSmallSample, isShortOfFixedFloor, liveFloorMinutes } from "./fixedMinutesFloor";
import { applyDefaultViewFloor } from "../pages/Dashboard";
import { setFinishedGameweeks } from "../state/seasonProgress";
import { buildHistoricPlayerProfile } from "./historicAnalysis";
import { resolvePlayerStats } from "./resolvePlayerStats";
import { computePositionPercentiles } from "./percentiles";
import { makePlayer, makeSeason } from "../test/fixtures";

// Audit 2026-09-25 player-team-profiles: the minimum-minutes principle (H1, V2).

describe("the fixed minutes floor: a quarter of the minutes available (the owner's rule, 2026-10-24)", () => {
  afterEach(() => setFinishedGameweeks(0));

  it("is a quarter of a completed season's 38 matches: 855 minutes", () => {
    expect(FIXED_FLOOR_MINUTES).toBe(855);
    expect(fixedFloorMinutes("lastSeason")).toBe(855);
    expect(fixedFloorMinutes("historicAverage")).toBe(855);
  });

  it("in Current Season, grows with the gameweeks finished, never under one full match", () => {
    expect(fixedFloorMinutes("live")).toBe(90); // pre-season, or before the first load
    expect(liveFloorMinutes(1)).toBe(90); // a quarter would be 23
    expect(liveFloorMinutes(4)).toBe(90);
    expect(liveFloorMinutes(5)).toBe(113); // 112.5, rounded up: at least a quarter
    expect(liveFloorMinutes(20)).toBe(450);
    expect(liveFloorMinutes(38)).toBe(FIXED_FLOOR_MINUTES); // a finished season meets the completed-season floor
    setFinishedGameweeks(9);
    expect(fixedFloorMinutes("live")).toBe(203);
  });

  it("the Default Dashboard leaves out the same players, rising with the season", () => {
    const pool = [makePlayer({ id: 1, position: "MID", minutes: 150 }), makePlayer({ id: 2, position: "MID", minutes: 250 }), makePlayer({ id: 3, position: "MID", minutes: 900 })];
    expect(applyDefaultViewFloor(pool, "live").map((p) => p.id)).toEqual([1, 2, 3]);
    setFinishedGameweeks(9);
    expect(applyDefaultViewFloor(pool, "live").map((p) => p.id)).toEqual([2, 3]);
    expect(applyDefaultViewFloor(pool, "lastSeason").map((p) => p.id)).toEqual([3]);
  });

  it("marks a small sample, but not missing data", () => {
    expect(isBelowFixedFloor(854, "lastSeason")).toBe(true);
    expect(isBelowFixedFloor(855, "lastSeason")).toBe(false);
    expect(isBelowFixedFloor(89, "live")).toBe(true);
    expect(isBelowFixedFloor(0, "live")).toBe(true);
    expect(isBelowFixedFloor(null, "lastSeason")).toBe(false);
  });

  it("H1: as a percentile threshold, cameos and 0-minute players are out of the pool and get no percentile", () => {
    const pool = [
      makePlayer({ id: 1, position: "DEF", minutes: 136, xGPerGame: 0.25 }),
      makePlayer({ id: 2, position: "DEF", minutes: 0, xGPerGame: null, totalPoints: 0 }),
      makePlayer({ id: 3, position: "DEF", minutes: 3035, xGPerGame: 0.03, totalPoints: 110 }),
      makePlayer({ id: 4, position: "DEF", minutes: 2000, xGPerGame: 0.05, totalPoints: 60 }),
    ];
    const xg = computePositionPercentiles(pool, (p) => p.xGPerGame, fixedFloorMinutes("lastSeason"));
    expect(xg.get(1)).toBeNull();
    expect(xg.get(4)).toBe(75);
    const points = computePositionPercentiles(pool, (p) => p.totalPoints, fixedFloorMinutes("lastSeason"));
    expect(points.get(2)).toBeNull(); // a 0-minute player no longer pads the bottom
    expect(points.get(3)).toBe(75);
  });
});

// The owner's rule (2026-09-25), replacing V2's "leave out 0-minute seasons":
// where the user can't set minimum minutes, Historic Average counts only the
// window seasons that reach the fixed floor.
describe("Historic Average counts only seasons with at least the floor (855 min), only where asked", () => {
  const seasons = [
    makeSeason({ seasonName: "2021/22", minutes: 3000, totalPoints: 200 }),
    makeSeason({ seasonName: "2022/23", minutes: 0, totalPoints: 0 }),
    makeSeason({ seasonName: "2023/24", minutes: 1800, totalPoints: 90 }),
    makeSeason({ seasonName: "2024/25", minutes: 854, totalPoints: 20 }),
    makeSeason({ seasonName: "2025/26", minutes: 855, totalPoints: 30 }),
  ];
  const profile = buildHistoricPlayerProfile(seasons, "2025/26");

  it("counts 855 but not 854 or 0, and never reaches back past the window", () => {
    expect(profile.floorSeasonsInWindow.map((s) => s.seasonName)).toEqual(["2023/24", "2025/26"]);
    expect(profile.floorWindowAverage?.seasonsPlayed).toBe(2);
    expect(profile.floorWindowAverage?.avgPointsPerSeason).toBeCloseTo(120 / 2);
    // There's no second, every-season Historic Average any more (the owner's rule, 2026-10-19).
    expect("windowAverage" in profile).toBe(false);
  });

  it("resolvePlayerStats' Historic Average is that one, everywhere", () => {
    const player = makePlayer({ id: 1, position: "MID" });
    const resolved = resolvePlayerStats(player, "historicAverage", profile, true);
    expect(resolved.totalPoints).toBeCloseTo(60);
    expect(resolved.minutes).toBeCloseTo(1327.5); // (1800 + 855) / 2 — never under the floor
    // No effect on the other modes.
    expect(resolvePlayerStats(player, "lastSeason", profile, true).totalPoints).toBe(30);
  });

  it("a player who played but never reached the floor has no Historic Average there, and is a small sample, not 'no data'", () => {
    const light = buildHistoricPlayerProfile([makeSeason({ seasonName: "2024/25", minutes: 300 }), makeSeason({ seasonName: "2025/26", minutes: 400 })], "2025/26");
    const player = makePlayer({ id: 1, position: "MID" });
    expect(resolvePlayerStats(player, "historicAverage", light, true).minutes).toBeNull();
    expect(isShortOfFixedFloor(light)).toBe(true);
    expect(isFixedFloorSmallSample(null, "historicAverage", light)).toBe(true);
  });

  it("only 0-minute seasons is no data, not a small sample", () => {
    const idle = buildHistoricPlayerProfile([makeSeason({ seasonName: "2024/25", minutes: 0 }), makeSeason({ seasonName: "2025/26", minutes: 0 })], "2025/26");
    const player = makePlayer({ id: 1, position: "MID" });
    expect(resolvePlayerStats(player, "historicAverage", idle, true).totalPoints).toBeNull();
    expect(isFixedFloorSmallSample(null, "historicAverage", idle)).toBe(false);
  });
});
