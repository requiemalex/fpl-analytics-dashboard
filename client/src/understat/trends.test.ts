import { describe, expect, it } from "vitest";
import { buildSeasonTrend, trendDataKey, trendBelowKey, trendMetricByKey } from "../metrics/careerTrends";
import { makeSeason } from "../test/fixtures";
import { understatTrends } from "./trends";
import type { UsPlayerTotals } from "./schema";

// Understat's season-by-season figures for Player Comparison's trend graphs.

const slice = (shots = 0, goals = 0, xG = 0) => ({ shots, goals, xG });
function totals(overrides: Partial<UsPlayerTotals>): UsPlayerTotals {
  return {
    understatId: "u1", appearances: 30, minutes: 2700, goals: 10, assists: 5, shots: 80, shotsOnTarget: 30, keyPasses: 40, xG: 9, xA: 4, npxG: 8, npGoals: 9,
    xGChain: 15, xGBuildup: 5, situations: { OpenPlay: slice(70, 8, 7), FromCorner: slice(5, 1, 0.5), SetPiece: slice(), DirectFreekick: slice(4, 0, 0.5), Penalty: slice(1, 1, 1) },
    bodyParts: { RightFoot: slice(60, 8, 7), LeftFoot: slice(15, 1, 1.5), Head: slice(5, 1, 0.5), OtherBodyPart: slice() },
    shotsComplete: true,
    ...overrides,
  };
}

type Data = NonNullable<Parameters<typeof understatTrends>[0]>;
const CODE = 1001;
const data = {
  seasons: new Map([
    ["2023/24", { players: new Map([[CODE, totals({ xG: 6, minutes: 1800, keyPasses: 20 })]]) }],
    ["2024/25", { players: new Map([[CODE, totals({ xG: 9, shotsComplete: false })]]) }],
  ]),
} as unknown as Data;

const all = (set: ReturnType<typeof understatTrends>) => [...Object.values(set.alternates), ...set.groups.flatMap((g) => g.columns)];
const metric = (key: string) => all(understatTrends(data)).find((m) => m.key === key)!;

describe("Understat trend figures", () => {
  it("are a player's own season totals, by his permanent code and the season", () => {
    expect(metric("xG").value(CODE, "2023/24")).toBe(6);
    expect(metric("xG").value(CODE, "2024/25")).toBe(9);
  });

  it("build per-game rates on Understat's own minutes", () => {
    // 20 key passes in 1,800 Understat minutes: 20 games, 1.0 a game.
    expect(metric("us.keyPassesPerGame").value(CODE, "2023/24")).toBeCloseTo(1, 5);
  });

  it("leave a gap, never 0, for a season Understat has nothing for", () => {
    expect(metric("xG").value(CODE, "2022/23")).toBeNull();
    expect(metric("xG").value(9999, "2023/24")).toBeNull();
  });

  it("leave shot-list figures out of a season whose shot list is incomplete", () => {
    expect(metric("us.shots").value(CODE, "2024/25")).toBeNull();
    expect(metric("us.shots").value(CODE, "2023/24")).toBe(80);
    // Line-up figures are unaffected.
    expect(metric("xG").value(CODE, "2024/25")).toBe(9);
  });

  it("are all gaps while the data is loading", () => {
    expect(all(understatTrends(null)).every((m) => m.value(CODE, "2023/24") === null)).toBe(true);
  });

  it("give its version of an FPL trend figure under the FPL trend key, for that figure's ⇄ toggle", () => {
    const { alternates } = understatTrends(data);
    for (const key of Object.keys(alternates)) expect(trendMetricByKey(key), key).toBeTruthy();
    expect(Object.keys(alternates)).toEqual(expect.arrayContaining(["xG", "xA", "xGI", "xGPerGame", "assists", "minutes"]));
  });

  it("offer no +/- figure, like FPL's trends", () => {
    const labels = all(understatTrends(data)).map((m) => m.label);
    expect(labels.some((l) => l.includes("−"))).toBe(false);
  });
});

describe("buildSeasonTrend with a second source's figures", () => {
  it("plots that source's figure on the player's FPL seasons, keeping FPL's minutes for the small-sample mark", () => {
    const seasons = new Map([[1, [makeSeason({ seasonName: "2023/24", minutes: 300 }), makeSeason({ seasonName: "2024/25", minutes: 2700 })]]]);
    const rows = buildSeasonTrend([1], { getValue: () => null }, seasons, 450, (_id, s) => metric("xG").value(CODE, s.seasonName));
    expect(rows.map((r) => r[trendDataKey(1)])).toEqual([6, 9]);
    expect(rows[0][trendBelowKey(1)]).toBe(300);
    expect(rows[1][trendBelowKey(1)]).toBeUndefined();
  });
});
