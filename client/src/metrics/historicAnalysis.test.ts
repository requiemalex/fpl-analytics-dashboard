import { describe, it, expect } from "vitest";
import { nextSeasonName, determineReferenceSeason, buildHistoricPlayerProfile, buildAllHistoricProfiles, HISTORIC_WINDOW_SEASONS, MIN_QUALIFYING_SEASON_MINUTES } from "./historicAnalysis";
import { makeSeason } from "../test/fixtures";

describe("nextSeasonName", () => {
  it("increments both halves of a season name consecutively", () => {
    expect(nextSeasonName("2025/26")).toBe("2026/27");
    expect(nextSeasonName("2099/00")).toBe("2100/01");
  });
});

describe("determineReferenceSeason", () => {
  it("finds the lexicographically latest season_name across the whole pool", () => {
    const map = new Map([
      [1, [makeSeason({ seasonName: "2022/23" }), makeSeason({ seasonName: "2023/24" })]],
      [2, [makeSeason({ seasonName: "2024/25" })]],
    ]);
    expect(determineReferenceSeason(map)).toBe("2024/25");
  });

  it("returns null for an empty dataset", () => {
    expect(determineReferenceSeason(new Map())).toBeNull();
  });

  it("returns null when every player has an empty seasons array", () => {
    const map = new Map([[1, []]]);
    expect(determineReferenceSeason(map)).toBeNull();
  });
});

describe("buildHistoricPlayerProfile", () => {
  it("lastCompletedSeason is exactly the reference season's entry, never falling back to an older one", () => {
    const seasons = [makeSeason({ seasonName: "2022/23", totalPoints: 10 }), makeSeason({ seasonName: "2023/24", totalPoints: 20 })];
    // Player has no entry for the reference season "2024/25"
    const profile = buildHistoricPlayerProfile(seasons, "2024/25");
    expect(profile.lastCompletedSeason).toBeNull();
  });

  it("returns null lastCompletedSeason and empty windows when referenceSeasonName is null", () => {
    const seasons = [makeSeason({ seasonName: "2023/24" })];
    const profile = buildHistoricPlayerProfile(seasons, null);
    expect(profile.lastCompletedSeason).toBeNull();
    expect(profile.allSeasonsInWindow).toEqual([]);
    expect(profile.windowAverage).toBeNull();
  });

  it(`windows exactly the most recent ${HISTORIC_WINDOW_SEASONS} seasons (cutoff = referenceYear - (window-1))`, () => {
    // Reference season 2025/26 -> cutoff year = 2025 - 3 = 2022, so seasons
    // starting 2022/23 through 2025/26 are in-window; 2021/22 is excluded.
    const seasons = [
      makeSeason({ seasonName: "2021/22", totalPoints: 1 }), // excluded
      makeSeason({ seasonName: "2022/23", totalPoints: 2 }),
      makeSeason({ seasonName: "2023/24", totalPoints: 3 }),
      makeSeason({ seasonName: "2024/25", totalPoints: 4 }),
      makeSeason({ seasonName: "2025/26", totalPoints: 5 }),
    ];
    const profile = buildHistoricPlayerProfile(seasons, "2025/26");
    expect(profile.allSeasonsInWindow.map((s) => s.seasonName)).toEqual(["2022/23", "2023/24", "2024/25", "2025/26"]);
  });

  it("<no_survivorship_bias>: windowAverage is computed over EVERY season in the window, including ones below MIN_QUALIFYING_SEASON_MINUTES", () => {
    const lightSeason = makeSeason({ seasonName: "2024/25", totalPoints: 20, minutes: 300 }); // well below 900
    const fullSeason = makeSeason({ seasonName: "2025/26", totalPoints: 200, minutes: 3000 });
    const profile = buildHistoricPlayerProfile([lightSeason, fullSeason], "2025/26");
    // Both seasons counted in the average -> (20+200)/2 = 110, not 200 (which
    // is what you'd get if the light season were filtered out).
    expect(profile.windowAverage?.avgPointsPerSeason).toBe(110);
    expect(profile.allSeasonsInWindow).toHaveLength(2);
  });

  it("qualifyingSeasons still filters by MIN_QUALIFYING_SEASON_MINUTES (used for UI 'light season' flagging, not the average)", () => {
    const lightSeason = makeSeason({ seasonName: "2024/25", minutes: MIN_QUALIFYING_SEASON_MINUTES - 1 });
    const qualifyingSeason = makeSeason({ seasonName: "2025/26", minutes: MIN_QUALIFYING_SEASON_MINUTES });
    const profile = buildHistoricPlayerProfile([lightSeason, qualifyingSeason], "2025/26");
    expect(profile.qualifyingSeasons.map((s) => s.seasonName)).toEqual(["2025/26"]);
  });

  it("windowAverage is null only when the window has zero seasons", () => {
    const profile = buildHistoricPlayerProfile([], "2025/26");
    expect(profile.allSeasonsInWindow).toEqual([]);
    expect(profile.windowAverage).toBeNull();
  });
});

describe("buildAllHistoricProfiles", () => {
  it("shares a single reference season across the whole pool", () => {
    const map = new Map([
      [1, [makeSeason({ seasonName: "2023/24" })]],
      [2, [makeSeason({ seasonName: "2025/26" })]], // this player defines the pool's latest season
    ]);
    const { referenceSeason, profiles } = buildAllHistoricProfiles(map);
    expect(referenceSeason).toBe("2025/26");
    // Player 1 has no entry for 2025/26 -> lastCompletedSeason null, even though they have other history
    expect(profiles.get(1)?.lastCompletedSeason).toBeNull();
    expect(profiles.get(2)?.lastCompletedSeason?.seasonName).toBe("2025/26");
  });
});
