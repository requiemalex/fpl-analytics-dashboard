import { describe, it, expect } from "vitest";
import { FIXED_FLOOR_LIVE_MINUTES, FIXED_FLOOR_MINUTES, fixedFloorMinutes, isBelowFixedFloor, isFixedFloorSmallSample, isShortOfFixedFloor } from "./fixedMinutesFloor";
import { buildHistoricPlayerProfile } from "./historicAnalysis";
import { resolvePlayerStats } from "./resolvePlayerStats";
import { computePositionPercentiles } from "./percentiles";
import { makePlayer, makeSeason } from "../test/fixtures";
import { LIVE_RATE_STAT_MIN_MINUTES, RATE_STAT_MIN_MINUTES } from "../pages/Dashboard";

// Audit 2026-09-25 player-team-profiles: the minimum-minutes principle (H1, V2).

describe("the fixed minutes floor", () => {
  it("is one full match in Current Season and five otherwise — the same numbers as the Default Dashboard", () => {
    expect(fixedFloorMinutes("live")).toBe(90);
    expect(fixedFloorMinutes("lastSeason")).toBe(450);
    expect(fixedFloorMinutes("historicAverage")).toBe(450);
    expect(LIVE_RATE_STAT_MIN_MINUTES).toBe(FIXED_FLOOR_LIVE_MINUTES);
    expect(RATE_STAT_MIN_MINUTES).toBe(FIXED_FLOOR_MINUTES);
  });

  it("marks a small sample, but not missing data", () => {
    expect(isBelowFixedFloor(449, "lastSeason")).toBe(true);
    expect(isBelowFixedFloor(450, "lastSeason")).toBe(false);
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
describe("Historic Average counts only seasons with at least the floor (450 min), only where asked", () => {
  const seasons = [
    makeSeason({ seasonName: "2021/22", minutes: 3000, totalPoints: 200 }),
    makeSeason({ seasonName: "2022/23", minutes: 0, totalPoints: 0 }),
    makeSeason({ seasonName: "2023/24", minutes: 1800, totalPoints: 90 }),
    makeSeason({ seasonName: "2024/25", minutes: 449, totalPoints: 20 }),
    makeSeason({ seasonName: "2025/26", minutes: 450, totalPoints: 30 }),
  ];
  const profile = buildHistoricPlayerProfile(seasons, "2025/26");

  it("counts 450 but not 449 or 0, and never reaches back past the window", () => {
    expect(profile.floorSeasonsInWindow.map((s) => s.seasonName)).toEqual(["2023/24", "2025/26"]);
    expect(profile.floorWindowAverage?.seasonsPlayed).toBe(2);
    expect(profile.floorWindowAverage?.avgPointsPerSeason).toBeCloseTo(120 / 2);
    // Everywhere else still counts every window season.
    expect(profile.windowAverage?.seasonsPlayed).toBe(4);
  });

  it("resolvePlayerStats uses it only with fixedFloorSeasons", () => {
    const player = makePlayer({ id: 1, position: "MID" });
    const floored = resolvePlayerStats(player, "historicAverage", profile, true, { fixedFloorSeasons: true });
    expect(floored.totalPoints).toBeCloseTo(60);
    expect(floored.minutes).toBeCloseTo(1125); // (1800 + 450) / 2 — never under the floor
    expect(resolvePlayerStats(player, "historicAverage", profile, true).totalPoints).toBeCloseTo(140 / 4);
    // No effect on the other modes.
    expect(resolvePlayerStats(player, "lastSeason", profile, true, { fixedFloorSeasons: true }).totalPoints).toBe(30);
  });

  it("a player who played but never reached the floor has no Historic Average there, and is a small sample, not 'no data'", () => {
    const light = buildHistoricPlayerProfile([makeSeason({ seasonName: "2024/25", minutes: 300 }), makeSeason({ seasonName: "2025/26", minutes: 400 })], "2025/26");
    const player = makePlayer({ id: 1, position: "MID" });
    expect(resolvePlayerStats(player, "historicAverage", light, true, { fixedFloorSeasons: true }).minutes).toBeNull();
    expect(isShortOfFixedFloor(light)).toBe(true);
    expect(isFixedFloorSmallSample(null, "historicAverage", light)).toBe(true);
    // Where the user sets minutes himself, both seasons still count.
    expect(resolvePlayerStats(player, "historicAverage", light, true).minutes).toBe(350);
  });

  it("only 0-minute seasons is no data, not a small sample", () => {
    const idle = buildHistoricPlayerProfile([makeSeason({ seasonName: "2024/25", minutes: 0 }), makeSeason({ seasonName: "2025/26", minutes: 0 })], "2025/26");
    const player = makePlayer({ id: 1, position: "MID" });
    expect(resolvePlayerStats(player, "historicAverage", idle, true, { fixedFloorSeasons: true }).totalPoints).toBeNull();
    expect(isFixedFloorSmallSample(null, "historicAverage", idle)).toBe(false);
    expect(resolvePlayerStats(player, "historicAverage", idle, true).totalPoints).toBe(0);
  });
});
