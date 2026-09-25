import { describe, it, expect } from "vitest";
import { FIXED_FLOOR_LIVE_MINUTES, FIXED_FLOOR_MINUTES, fixedFloorMinutes, isBelowFixedFloor } from "./fixedMinutesFloor";
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

describe("V2: Historic Average without 0-minute seasons, only where asked", () => {
  const seasons = [
    makeSeason({ seasonName: "2021/22", minutes: 3000, totalPoints: 200 }),
    makeSeason({ seasonName: "2022/23", minutes: 0, totalPoints: 0 }),
    makeSeason({ seasonName: "2023/24", minutes: 1800, totalPoints: 90 }),
    makeSeason({ seasonName: "2024/25", minutes: 1, totalPoints: 1 }),
    makeSeason({ seasonName: "2025/26", minutes: 1800, totalPoints: 150 }),
  ];
  const profile = buildHistoricPlayerProfile(seasons, "2025/26");

  it("keeps any season with minutes (even 1), drops only 0, and never reaches back past the window", () => {
    expect(profile.playedSeasonsInWindow.map((s) => s.seasonName)).toEqual(["2023/24", "2024/25", "2025/26"]);
    expect(profile.playedWindowAverage?.seasonsPlayed).toBe(3);
    expect(profile.playedWindowAverage?.avgPointsPerSeason).toBeCloseTo(241 / 3);
    // Everywhere else still counts the 0-minute season.
    expect(profile.windowAverage?.seasonsPlayed).toBe(4);
  });

  it("resolvePlayerStats uses it only with dropZeroMinuteSeasons", () => {
    const player = makePlayer({ id: 1, position: "MID" });
    expect(resolvePlayerStats(player, "historicAverage", profile, true, { dropZeroMinuteSeasons: true }).totalPoints).toBeCloseTo(241 / 3);
    expect(resolvePlayerStats(player, "historicAverage", profile, true).totalPoints).toBeCloseTo(241 / 4);
    // No effect on the other modes.
    expect(resolvePlayerStats(player, "lastSeason", profile, true, { dropZeroMinuteSeasons: true }).totalPoints).toBe(150);
  });

  it("a window with only 0-minute seasons has no Historic Average there (shown —), not 0", () => {
    const idle = buildHistoricPlayerProfile([makeSeason({ seasonName: "2024/25", minutes: 0 }), makeSeason({ seasonName: "2025/26", minutes: 0 })], "2025/26");
    const player = makePlayer({ id: 1, position: "MID" });
    expect(resolvePlayerStats(player, "historicAverage", idle, true, { dropZeroMinuteSeasons: true }).totalPoints).toBeNull();
    expect(resolvePlayerStats(player, "historicAverage", idle, true).totalPoints).toBe(0);
  });
});
