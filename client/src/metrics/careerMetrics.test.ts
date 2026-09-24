import { describe, it, expect } from "vitest";
import { computeCareerAverages } from "./careerMetrics";
import type { PlayerSeasonHistory } from "../types/normalized";

function season(seasonName: string, minutes: number, dc: number | null, xG: number | null = 0): PlayerSeasonHistory {
  return {
    seasonName,
    totalPoints: 0,
    minutes,
    starts: null,
    goals: 0,
    assists: 0,
    cleanSheets: 0,
    goalsConceded: null,
    bonus: 0,
    bps: 0,
    ictIndex: null,
    startCost: null,
    endCost: null,
    xG,
    xA: xG,
    xGI: xG,
    xGC: xG,
    defensiveContribution: dc,
  };
}

describe("computeCareerAverages — <matched_season_rates>", () => {
  // Anderson's real 2022/23–2025/26 history_past (live API, 2026-09-24):
  // DC is only tracked from 2024/25, and his two earlier seasons were light.
  const anderson = [season("2022/23", 395, null), season("2023/24", 1018, null), season("2024/25", 2726, 407), season("2025/26", 3332, 515)];

  it("divides DC by the minutes of the seasons DC was tracked in, not the whole window", () => {
    const avg = computeCareerAverages(anderson);
    // 461 DC / ceil(3029 / 90) = 461 / 34 games — was 461 / ceil(1868 / 90) = 21.95
    expect(avg.defensiveContributionPerGame).toBeCloseTo(461 / 34, 5);
    expect(avg.avgDefensiveContributionPerSeason).toBe(461);
    // The window-wide minutes average itself is unchanged.
    expect(avg.avgMinutesPerSeason).toBeCloseTo(1867.75, 5);
  });

  it("gives the same rate as before for a stat known in every season", () => {
    const seasons = [season("2024/25", 900, 20, 3), season("2025/26", 2700, 40, 9)];
    const avg = computeCareerAverages(seasons);
    // avg xG 6 over avg minutes 1800 (20 games) — every season has xG.
    expect(avg.xGPerGame).toBeCloseTo(6 / 20, 10);
    expect(avg.defensiveContributionPerGame).toBeCloseTo(30 / 20, 10);
  });

  it("is null, not 0, when no season has the stat", () => {
    const avg = computeCareerAverages([season("2022/23", 1000, null)]);
    expect(avg.defensiveContributionPerGame).toBeNull();
  });

  it("is null when the seasons with the stat have zero minutes", () => {
    const avg = computeCareerAverages([season("2025/26", 0, 0)]);
    expect(avg.defensiveContributionPerGame).toBeNull();
  });
});
