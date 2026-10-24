import { describe, it, expect } from "vitest";
import { understatPlayerColumns } from "./columns";
import { sumPlayerSeasons, type UsPlayerResolved } from "./resolve";
import { US_SUMMARY_FIGURES, usSummaryGroups, type UsSummaryFigure, type UsSummaryKey } from "./summary";
import { playerSummaryRanks, type UsComparisonContext } from "./comparisons";
import type { UsPlayerTotals } from "./schema";
import type { PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { perGame } from "../metrics/calculations";
import { makePlayer } from "../test/fixtures";

// The profile's Understat Summary (summary.ts): the figures that matter for a
// player's position, worked out exactly as the Explorers' Understat columns.

const slice = (shots = 0, goals = 0, xG = 0) => ({ shots, goals, xG });
const situations = (open: [number, number, number], penalty: [number, number, number] = [0, 0, 0]) => ({
  OpenPlay: slice(...open),
  FromCorner: slice(),
  SetPiece: slice(),
  DirectFreekick: slice(),
  Penalty: slice(...penalty),
});
function row(overrides: Partial<UsPlayerTotals> = {}): UsPlayerTotals {
  return {
    understatId: "u1", appearances: 20, minutes: 1700, goals: 12, assists: 4, shots: 60, shotsOnTarget: 25, keyPasses: 30, xG: 10.6, xA: 5.5, npxG: 8.32, npGoals: 9,
    xGChain: 14, xGBuildup: 3,
    situations: situations([57, 9, 8.32], [3, 3, 2.28]),
    bodyParts: { RightFoot: slice(), LeftFoot: slice(), Head: slice(), OtherBodyPart: slice() },
    shotsComplete: true,
    facing: { shots: 200, shotsOnTarget: 60, complete: true, situations: situations([190, 18, 19], [10, 8, 7.6]) },
    ...overrides,
  };
}
const figure = (key: UsSummaryKey): UsSummaryFigure => US_SUMMARY_FIGURES[key];

describe("the Understat Summary's figures", () => {
  // Two seasons, as a Historic Average sums them.
  const two = sumPlayerSeasons([row(), row({ minutes: 2500, xG: 4, xA: 2, keyPasses: 50, shots: 40, npxG: 4, npGoals: 3 })])!;
  const one: UsPlayerResolved = { totals: row(), seasons: 1 };

  it("every figure the Explorers also have is the same number as their column of that name", () => {
    const player = makePlayer({ id: 1, position: "FWD" });
    for (const r of [one, two]) {
      const set = understatPlayerColumns(() => r);
      const columns = new Map([...Object.values(set.alternates), ...set.groups.flatMap((g) => g.columns)].map((c) => [c.key, c]));
      let checked = 0;
      for (const key of Object.keys(US_SUMMARY_FIGURES) as UsSummaryKey[]) {
        const column = columns.get(key);
        if (!column) continue;
        expect(column.label).toBe(figure(key).label);
        expect(figure(key).value(r)).toBeCloseTo(column.getValue(player, {} as PlayerDerivedMetrics)!, 10);
        expect(figure(key).higherIsBetter).toBe(column.higherIsBetter !== false);
        checked += 1;
      }
      // Every figure but the four shots-faced counts and rates has a column.
      expect(checked).toBe(Object.keys(US_SUMMARY_FIGURES).length - 4);
    }
  });

  it("shots faced: a count per season, per game on Understat's minutes, fewer better — ranked per game, as xGC is", () => {
    expect(figure("us.shotsFaced").value(two)).toBe(200);
    expect(figure("us.onTargetFaced").value(two)).toBe(60);
    expect(figure("us.shotsFacedPerGame").value(two)).toBeCloseTo(perGame(400, 4200)!, 10);
    expect(figure("us.shotsFaced").higherIsBetter).toBe(false);
    expect(figure("us.shotsFaced").rankBy).toBe(figure("us.shotsFacedPerGame").value);
    expect(figure("xGC").rankBy).toBe(figure("xGCPerGame").value);
  });

  it("unknown is —, never 0: shot-list figures where that list is incomplete, shots faced where they are", () => {
    const short: UsPlayerResolved = { totals: row({ shotsComplete: false, facing: { ...row().facing!, complete: false } }), seasons: 1 };
    expect(figure("us.npxG").value(short)).toBeNull();
    expect(figure("us.npGoalsMinusNpxG").value(short)).toBeNull();
    expect(figure("us.shotsFaced").value(short)).toBeNull();
    expect(figure("xGC").value(short)).toBeNull();
    // Figures from the line-ups are unaffected.
    expect(figure("xG").value(short)).toBe(10.6);
    const before: UsPlayerResolved = { totals: row({ facing: undefined }), seasons: 1 };
    expect(figure("us.onTargetFacedPerGame").value(before)).toBeNull();
  });
});

describe("the Understat Summary's groups, by position", () => {
  const titles = (position: "GKP" | "DEF" | "MID" | "FWD") => usSummaryGroups(position).map((g) => [g.title, g.keys.length]);

  it("a goalkeeper: the shots faced while he was on the pitch, all Understat has on a keeper", () => {
    expect(titles("GKP")).toEqual([["Defensive", 6]]);
  });
  it("a defender: Defensive first, then Offensive; Actual vs Expected beside Creating", () => {
    expect(titles("DEF")).toEqual([["Defensive", 6], ["Offensive", 6], ["Actual vs Expected", 3], ["Creating", 3]]);
  });
  it("a midfielder: Offensive and Creating; Actual vs Expected beside Shooting", () => {
    expect(titles("MID")).toEqual([["Offensive", 6], ["Creating", 6], ["Actual vs Expected", 3], ["Shooting", 3]]);
  });
  it("a forward: Offensive and Shooting; Actual vs Expected beside Creating", () => {
    expect(titles("FWD")).toEqual([["Offensive", 6], ["Shooting", 6], ["Actual vs Expected", 3], ["Creating", 3]]);
  });
  it("a group of 3 beside Actual vs Expected is the per-game half of its six", () => {
    expect(usSummaryGroups("DEF")[3].keys).toEqual(usSummaryGroups("MID")[1].keys.slice(3));
    expect(usSummaryGroups("MID")[3].keys).toEqual(usSummaryGroups("FWD")[1].keys.slice(3));
  });
});

describe("the Understat Summary's colours (<comparative_colouring>)", () => {
  const ctx = (players: [number, UsPlayerTotals][], positions: [number, "DEF" | "MID"][]): UsComparisonContext => ({
    seasons: new Map([["2025/26", { season: "2025/26", complete: true, latestMatchDate: null, players: new Map(players), clubs: new Map() }]]),
    liveSeason: "2026/27",
    positionByCode: new Map(positions),
    clubCodeByPlayerCode: new Map(),
  });
  const rank = (key: UsSummaryKey) => ({ key, higherIsBetter: figure(key).higherIsBetter, rank: figure(key).rankBy ?? figure(key).value });

  it("ranked within his position among those at or above the floor; fewer shots faced better, per game", () => {
    const c = ctx(
      [
        [500, row({ minutes: 900, xG: 5 })],
        [2, row({ minutes: 1800, xG: 3 })],
        [3, row({ minutes: 1800, xG: 1 })],
        // Under the 450-minute floor, and another position: neither counts.
        [4, row({ minutes: 200, xG: 0 })],
        [5, row({ minutes: 1800, xG: 9 })],
      ],
      [[500, "DEF"], [2, "DEF"], [3, "DEF"], [4, "DEF"], [5, "MID"]],
    );
    const own = sumPlayerSeasons([c.seasons.get("2025/26")!.players.get(500)!])!;
    const ranks = playerSummaryRanks(c, 500, ["2025/26"], own, [rank("xG"), rank("us.shotsFaced")]);
    // The most xG of three: (2 + ½) ÷ 3.
    expect(ranks.xG).toBeCloseTo((2.5 / 3) * 100, 10);
    // The same 200 shots faced in half the minutes: the most per game, so the bottom of three.
    expect(ranks["us.shotsFaced"]).toBeCloseTo((0.5 / 3) * 100, 10);
  });

  it("no colour under the floor", () => {
    const c = ctx([[500, row({ minutes: 300 })], [2, row()], [3, row()]], [[500, "DEF"], [2, "DEF"], [3, "DEF"]]);
    const own = sumPlayerSeasons([c.seasons.get("2025/26")!.players.get(500)!])!;
    expect(playerSummaryRanks(c, 500, ["2025/26"], own, [rank("xG")]).xG).toBeNull();
  });
});
