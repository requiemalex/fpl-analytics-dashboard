import { describe, it, expect } from "vitest";
import { makeSeason } from "../test/fixtures";
import { buildSeasonTrend, trendBelowKey, trendDataKey, trendMetricByKey, trendValue } from "./careerTrends";

const seasons = new Map([
  [
    1,
    [
      makeSeason({ seasonName: "2023/24", totalPoints: 180, minutes: 2700, xGI: 15 }),
      makeSeason({ seasonName: "2024/25", totalPoints: 40, minutes: 300, xGI: 3 }),
      makeSeason({ seasonName: "2025/26", totalPoints: 160, minutes: 2500, xGI: 12 }),
    ],
  ],
  [2, [makeSeason({ seasonName: "2024/25", totalPoints: 120, minutes: 1800, xGI: 8 }), makeSeason({ seasonName: "2025/26", totalPoints: 150, minutes: 2400, xGI: 12 })]],
]);

describe("buildSeasonTrend", () => {
  it("has one row per season either player has, oldest first, with a gap (null) where a player has none", () => {
    const rows = buildSeasonTrend([1, 2], trendMetricByKey("totalPoints")!, seasons, 0);
    expect(rows.map((r) => r.seasonName)).toEqual(["2023/24", "2024/25", "2025/26"]);
    expect(rows[0][trendDataKey(1)]).toBe(180);
    expect(rows[0][trendDataKey(2)]).toBeNull();
    expect(rows[0][trendBelowKey(2)]).toBeUndefined();
  });

  it("with no minimum, counts every season, a short one included", () => {
    const rows = buildSeasonTrend([1], trendMetricByKey("totalPoints")!, seasons, 0);
    expect(rows[1][trendDataKey(1)]).toBe(40);
    expect(rows[1][trendBelowKey(1)]).toBeUndefined();
  });

  it("a season under the minimum keeps its real figure but is marked, and the next season back above it is shown as normal", () => {
    const rows = buildSeasonTrend([1], trendMetricByKey("xGIPerGame")!, seasons, 450);
    // 2700 minutes = 30 estimated games.
    expect(rows[0][trendDataKey(1)]).toBeCloseTo(15 / 30, 10);
    // 300 minutes is under 450: his real rate (3 xGI over 4 estimated games), with his minutes kept for the amber ring.
    expect(rows[1][trendDataKey(1)]).toBeCloseTo(3 / 4, 10);
    expect(rows[1][trendBelowKey(1)]).toBe(300);
    expect(rows[2][trendDataKey(1)]).toBeCloseTo(12 / 28, 10);
    expect(rows[2][trendBelowKey(1)]).toBeUndefined();
  });

  it("marks totals under the minimum too, without changing the figure", () => {
    const rows = buildSeasonTrend([1], trendMetricByKey("totalPoints")!, seasons, 450);
    expect(rows[1][trendDataKey(1)]).toBe(40);
    expect(rows[1][trendBelowKey(1)]).toBe(300);
  });
});

describe("trendValue", () => {
  it("leaves a missing figure null rather than 0", () => {
    expect(trendValue(trendMetricByKey("defensiveContribution")!, makeSeason({ seasonName: "2022/23", minutes: 3000 }))).toBeNull();
  });
});
