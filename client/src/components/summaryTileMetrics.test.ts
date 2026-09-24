import { describe, it, expect } from "vitest";
import { PLAYER_COLUMNS } from "./playerColumns";
import { PLAYER_TILE_METRICS, isRatePerMinutesColumnKey } from "./summaryTileMetrics";

describe("per-game rate metrics carry the minutes floor", () => {
  it("flags every per-game player column (so a one-cameo player can't top its leaderboard)", () => {
    const perGameColumns = PLAYER_COLUMNS.filter((c) => /PerGame$/.test(c.key)).map((c) => c.key);
    expect(perGameColumns.length).toBeGreaterThanOrEqual(7);
    for (const key of perGameColumns) {
      expect(isRatePerMinutesColumnKey(key), key).toBe(true);
      expect(PLAYER_TILE_METRICS.find((m) => m.key === key)?.ratePerMinutes, key).toBe(true);
    }
  });

  it("flags the tile-only Goals/Game and Assists/Game too", () => {
    expect(PLAYER_TILE_METRICS.find((m) => m.key === "goalsPerGame")?.ratePerMinutes).toBe(true);
    expect(PLAYER_TILE_METRICS.find((m) => m.key === "assistsPerGame")?.ratePerMinutes).toBe(true);
  });

  it("doesn't flag totals or price-based metrics", () => {
    for (const key of ["totalPoints", "xG", "xGC", "price", "pointsPerMillion", "minutes", "ownership"]) {
      expect(isRatePerMinutesColumnKey(key), key).toBe(false);
    }
  });
});
