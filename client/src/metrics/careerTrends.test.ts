import { describe, it, expect } from "vitest";
import { makeSeason } from "../test/fixtures";
import { buildSeasonTrend, trendAwayKey, trendBelowKey, trendBridgeKey, trendDataKey, trendMetricByKey, trendValue } from "./careerTrends";

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
    // 300 minutes is under 450: his real rate (3 xGI over 4 estimated games), with his minutes kept for the amber small-sample marker.
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

describe("buildSeasonTrend — spells out of FPL", () => {
  // João Pedro's shape: Watford 2019/20 and 2021/22 either side of a Championship season, then out again in 2022/23.
  const career = new Map([
    [
      1,
      [
        makeSeason({ seasonName: "2019/20", totalPoints: 3, minutes: 22 }),
        makeSeason({ seasonName: "2021/22", totalPoints: 60, minutes: 1634 }),
        makeSeason({ seasonName: "2023/24", totalPoints: 104, minutes: 2037, xGI: 16.65 }),
        makeSeason({ seasonName: "2024/25", totalPoints: 126, minutes: 1946, xGI: 12.06 }),
      ],
    ],
    [2, [makeSeason({ seasonName: "2022/23", totalPoints: 272, minutes: 2767, xGI: 31.65 }), makeSeason({ seasonName: "2024/25", totalPoints: 181, minutes: 2736, xGI: 23.94 })]],
  ]);

  it("gives every season from the first to the last its row, even one neither player has", () => {
    const rows = buildSeasonTrend([1], trendMetricByKey("totalPoints")!, career, 0);
    expect(rows.map((r) => r.seasonName)).toEqual(["2019/20", "2020/21", "2021/22", "2022/23", "2023/24", "2024/25"]);
    expect(rows[1][trendDataKey(1)]).toBeNull();
  });

  it("marks each season he has no FPL record for, inside or outside his career", () => {
    const rows = buildSeasonTrend([1, 2], trendMetricByKey("totalPoints")!, career, 0);
    expect(rows.filter((r) => r[trendAwayKey(1)] === true).map((r) => r.seasonName)).toEqual(["2020/21", "2022/23"]);
    expect(rows.filter((r) => r[trendAwayKey(2)] === true).map((r) => r.seasonName)).toEqual(["2019/20", "2020/21", "2021/22", "2023/24"]);
  });

  it("bridges a spell out of FPL with a straight line between the seasons either side, and nothing before his first or after his last", () => {
    const rows = buildSeasonTrend([1, 2], trendMetricByKey("totalPoints")!, career, 0);
    expect(rows.map((r) => r[trendBridgeKey(1)] ?? null)).toEqual([3, 31.5, 60, 82, 104, null]);
    expect(rows.map((r) => r[trendBridgeKey(2)] ?? null)).toEqual([null, null, null, 272, 226.5, 181]);
  });

  it("doesn't bridge to a season with no figure — a missing figure isn't a spell out of FPL", () => {
    const rows = buildSeasonTrend([1], trendMetricByKey("xGI")!, career, 0);
    expect(rows[2][trendDataKey(1)]).toBeNull();
    expect(rows.every((r) => r[trendBridgeKey(1)] === undefined)).toBe(true);
  });
});

describe("trendValue", () => {
  it("leaves a missing figure null rather than 0", () => {
    expect(trendValue(trendMetricByKey("defensiveContribution")!, makeSeason({ seasonName: "2022/23", minutes: 3000 }))).toBeNull();
  });
});
