import { describe, it, expect } from "vitest";
import {
  pointsPerMillion,
  xGPerMillion,
  xAPerMillion,
  xGIPerMillion,
  perGame,
  estimatedPointsPerGame,
  per90,
  minutesPerPoint,
  minutesPerGoal,
  minutesPerAssist,
  goalsMinusXG,
  assistsMinusXA,
  goalInvolvementsMinusXGI,
} from "./calculations";

// This suite guards <zero_handling> from the file's own header comment:
// division by zero -> null, any null input -> null, never NaN/Infinity.

describe("pointsPerMillion / xGPerMillion / xAPerMillion / xGIPerMillion (safeDivide)", () => {
  it("divides normally", () => {
    expect(pointsPerMillion(100, 10)).toBe(10);
    expect(xGPerMillion(9, 4.5)).toBe(2);
  });

  it("returns null, not Infinity/NaN, for a zero denominator", () => {
    expect(pointsPerMillion(50, 0)).toBeNull();
    expect(xGPerMillion(0, 0)).toBeNull();
  });

  it("returns null when either input is null", () => {
    expect(pointsPerMillion(null, 10)).toBeNull();
    expect(pointsPerMillion(50, null)).toBeNull();
    expect(xAPerMillion(null, null)).toBeNull();
    expect(xGIPerMillion(null, 5)).toBeNull();
  });
});

describe("perGame (estimated-games basis)", () => {
  // Per <per_game_not_per_90>: games = max(1, ceil(minutes/90)) for
  // minutes>0, else 0 games -> null. Always rounds UP, never nearest/down.
  it("a single full match (90 min) is exactly 1 game", () => {
    expect(perGame(9, 90)).toBe(9);
  });

  it("89 minutes (a near-full match) still counts as only 1 game", () => {
    expect(perGame(9, 89)).toBeCloseTo(9, 10);
  });

  it("91 minutes (a match plus a minute) rounds UP to 2 games, never 1 or nearest", () => {
    // ceil(91/90) = 2, so total/games = 10/2 = 5, not 10/1 = 10.
    expect(perGame(10, 91)).toBe(5);
  });

  it("a 1-minute cameo still counts as a full game (max(1, ceil(1/90)))", () => {
    expect(perGame(2, 1)).toBe(2);
  });

  it("180 minutes is exactly 2 games; 181 rounds up to 3 (never down)", () => {
    expect(perGame(180, 180)).toBe(90);
    expect(perGame(180, 181)).toBe(60); // 180/3
  });

  it("zero minutes returns null (undefined rate), not zero", () => {
    expect(perGame(0, 0)).toBeNull();
    expect(perGame(5, 0)).toBeNull();
  });

  it("null total or null minutes returns null", () => {
    expect(perGame(null, 90)).toBeNull();
    expect(perGame(5, null)).toBeNull();
  });
});

describe("estimatedPointsPerGame (the one deliberate zero-vs-null exception)", () => {
  it("zero minutes with zero points returns a genuine 0.0, not null", () => {
    expect(estimatedPointsPerGame(0, 0)).toBe(0);
  });

  it("still returns null for null inputs", () => {
    expect(estimatedPointsPerGame(null, 0)).toBeNull();
    expect(estimatedPointsPerGame(10, null)).toBeNull();
  });

  it("uses the same estimated-games-from-minutes rounding as perGame for minutes>0", () => {
    expect(estimatedPointsPerGame(10, 91)).toBe(5); // ceil(91/90) = 2 games
  });
});

describe("per90 (true per-90 rate — internal use only, expectedPointsV2)", () => {
  it("computes total/minutes*90 exactly, independent of estimated-games rounding", () => {
    // Deliberately reproduces the *documented* nonsensical case the app
    // moved away from for display metrics: 2 points in 1 minute -> 180.
    expect(per90(2, 1)).toBe(180);
  });

  it("returns null for zero minutes rather than Infinity", () => {
    expect(per90(10, 0)).toBeNull();
  });

  it("returns null for null inputs", () => {
    expect(per90(null, 90)).toBeNull();
    expect(per90(10, null)).toBeNull();
  });
});

describe("minutesPerPoint / minutesPerGoal / minutesPerAssist", () => {
  it("compute simple ratios", () => {
    expect(minutesPerPoint(900, 90)).toBe(10);
    expect(minutesPerGoal(900, 9)).toBe(100);
    expect(minutesPerAssist(450, 3)).toBe(150);
  });

  it("divide-by-zero safe (0 goals/assists/points)", () => {
    expect(minutesPerGoal(900, 0)).toBeNull();
    expect(minutesPerAssist(900, 0)).toBeNull();
    expect(minutesPerPoint(900, 0)).toBeNull();
  });
});

describe("goalsMinusXG / assistsMinusXA (safeSubtract)", () => {
  it("subtracts normally, including negative results (underperformance)", () => {
    expect(goalsMinusXG(5, 7.3)).toBeCloseTo(-2.3, 10);
    expect(assistsMinusXA(3, 1.2)).toBeCloseTo(1.8, 10);
  });

  it("returns null if either side is null, never treating missing xG as 0", () => {
    expect(goalsMinusXG(5, null)).toBeNull();
    expect(goalsMinusXG(null, 5)).toBeNull();
  });
});

describe("goalInvolvementsMinusXGI", () => {
  it("computes goals + assists - xGI, re-derived independently from the formula", () => {
    const goals = 10;
    const assists = 4;
    const xGI = 12.5;
    expect(goalInvolvementsMinusXGI(goals, assists, xGI)).toBeCloseTo(goals + assists - xGI, 10);
  });

  it("returns null if any of the three inputs is null (never treats a missing one as 0)", () => {
    expect(goalInvolvementsMinusXGI(null, 4, 12.5)).toBeNull();
    expect(goalInvolvementsMinusXGI(10, null, 12.5)).toBeNull();
    expect(goalInvolvementsMinusXGI(10, 4, null)).toBeNull();
  });
});
