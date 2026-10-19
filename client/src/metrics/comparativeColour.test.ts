import { describe, it, expect } from "vitest";
import { clubRanks, colourDirection, fixtureDifficultyRanks, isColourEligible, positionRanks, rankAmong, rankWithinGroups } from "./comparativeColour";
import type { Position } from "../types/normalized";
import type { UpcomingFixture } from "./fixtureTicker";

type Row = { id: number; position: Position; minutes: number | null; goals: number | null };
const row = (id: number, position: Position, minutes: number | null, goals: number | null): Row => ({ id, position, minutes, goals });
const ranksOf = (rows: Row[], mode: "live" | "lastSeason" | "historicAverage" = "lastSeason", higherIsBetter = true) =>
  positionRanks(rows, { id: (r) => r.id, position: (r) => r.position, minutes: (r) => r.minutes, mode, value: (r) => r.goals, higherIsBetter });

describe("<comparative_colouring>: players ranked within their position", () => {
  it("ranks a defender against defenders only: the top-scoring defender is green even far below the top forward", () => {
    // The audit's case: Van Dijk's 6 goals, the most by a defender, beside Haaland's 27.
    const ranks = ranksOf([row(1, "DEF", 3000, 6), row(2, "DEF", 3000, 2), row(3, "DEF", 3000, 1), row(4, "FWD", 3000, 27), row(5, "FWD", 3000, 10)]);
    expect(ranks.get(1)).toBeCloseTo(((2 + 0.5) / 3) * 100);
    expect(ranks.get(1)!).toBeGreaterThan(50);
    expect(ranks.get(4)).toBe(75);
  });

  it("leaves anyone under the fixed floor out of the pool and uncoloured: 450 minutes, or 90 in Current Season", () => {
    const rows = [row(1, "MID", 449, 30), row(2, "MID", 450, 5), row(3, "MID", 2000, 3)];
    const completed = ranksOf(rows, "lastSeason");
    expect(completed.has(1)).toBe(false);
    expect(completed.get(2)).toBe(75); // top of the two who qualify — the 449-minute 30 goals doesn't push him down
    const live = ranksOf([row(1, "MID", 89, 3), row(2, "MID", 90, 1), row(3, "MID", 400, 0)], "live");
    expect(live.has(1)).toBe(false);
    expect(live.get(2)).toBe(75);
  });

  it("gives no rank for no minutes (no data), no value, or a pool of one", () => {
    const ranks = ranksOf([row(1, "GKP", null, 0), row(2, "GKP", 3000, null), row(3, "GKP", 3000, 0), row(4, "FWD", 3000, 9)]);
    expect(ranks.size).toBe(0);
  });

  it("counts half of any ties below, and flips a lower-is-better figure so higher is always better", () => {
    const rows = [row(1, "DEF", 900, 1), row(2, "DEF", 900, 1), row(3, "DEF", 900, 4), row(4, "DEF", 900, 0)];
    const more = ranksOf(rows);
    expect(more.get(1)).toBe(50); // one below, two equal: (1 + 1) ÷ 4
    expect(more.get(3)).toBe(87.5);
    const fewer = ranksOf(rows, "lastSeason", false);
    expect(fewer.get(3)).toBe(12.5);
    expect(fewer.get(4)).toBe(87.5);
  });

  it("isColourEligible: minutes at or above the mode's floor; null minutes never", () => {
    expect(isColourEligible(90, "live")).toBe(true);
    expect(isColourEligible(89, "live")).toBe(false);
    expect(isColourEligible(450, "historicAverage")).toBe(true);
    expect(isColourEligible(449, "lastSeason")).toBe(false);
    expect(isColourEligible(null, "live")).toBe(false);
  });
});

describe("<comparative_colouring>: clubs ranked among every club", () => {
  it("ranks each club with a figure; a club with none has no rank", () => {
    const clubs = [
      { id: 1, xGC: 30 },
      { id: 2, xGC: 50 },
      { id: 3, xGC: 40 },
      { id: 4, xGC: null },
    ];
    const ranks = clubRanks(clubs, { id: (c) => c.id, value: (c) => c.xGC, higherIsBetter: false });
    expect(ranks.get(1)).toBeCloseTo(100 - (0.5 / 3) * 100);
    expect(ranks.get(2)).toBeCloseTo(100 - (2.5 / 3) * 100);
    expect(ranks.has(4)).toBe(false);
  });

  it("fixture difficulty: easier upcoming fixtures rank higher", () => {
    const fx = (difficulty: number) => ({ difficulty }) as UpcomingFixture;
    const ranks = fixtureDifficultyRanks(
      new Map([
        [1, [fx(2), fx(2)]],
        [2, [fx(4), fx(5)]],
        [3, []],
      ]),
    );
    expect(ranks.get(1)).toBe(75);
    expect(ranks.get(2)).toBe(25);
    expect(ranks.has(3)).toBe(false);
  });
});

describe("rankAmong and colourDirection", () => {
  it("ranks one figure among others' (which don't include it); nothing to compare with is no rank", () => {
    expect(rankAmong(4, [5, 6, 7], false)).toBe(87.5);
    expect(rankAmong(7, [5, 6, 7], true)).toBe(75);
    expect(rankAmong(null, [1, 2], true)).toBeNull();
    expect(rankAmong(3, [], true)).toBeNull();
  });

  it("is null for a figure that's never coloured, else its direction", () => {
    expect(colourDirection({ noColour: true })).toBeNull();
    expect(colourDirection({ higherIsBetter: false })).toBe(false);
    expect(colourDirection({})).toBe(true);
  });

  it("rankWithinGroups ignores non-finite values", () => {
    const ranks = rankWithinGroups([1, 2, 3], { id: (x) => x, group: () => 0, eligible: () => true, value: (x) => (x === 1 ? Infinity : x), higherIsBetter: true });
    expect(ranks.has(1)).toBe(false);
    expect(ranks.get(3)).toBe(75);
  });
});
