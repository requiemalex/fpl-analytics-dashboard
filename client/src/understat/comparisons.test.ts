import { describe, it, expect } from "vitest";
import { clubLogRanks, clubShotRanks, leagueChanceRank, playerLogRanks, playerShotRanks, type UsComparisonContext } from "./comparisons";
import type { UsClubTotals, UsPlayerTotals, UsSeason, UsSlice } from "./schema";
import type { Position } from "../types/normalized";

const slice = (shots = 0, goals = 0, xG = 0): UsSlice => ({ shots, goals, xG });
const situations = (open: UsSlice, penalty: UsSlice = slice()) => ({ OpenPlay: open, FromCorner: slice(), SetPiece: slice(), DirectFreekick: slice(), Penalty: penalty });

function player(minutes: number, xG: number, extra: Partial<UsPlayerTotals> = {}): UsPlayerTotals {
  return { minutes, xG, xA: 0, assists: 0, shots: 10, shotsOnTarget: 4, situations: situations(slice(10, 1, xG)), shotsComplete: true, ...extra } as UsPlayerTotals;
}
function club(played: number, xGA: number, extra: Partial<UsClubTotals> = {}): UsClubTotals {
  return { played, xGA, xG: 0, assists: 0, xA: 0, ...extra } as UsClubTotals;
}
function season(name: string, complete: boolean, players: [number, UsPlayerTotals][], clubs: [number, UsClubTotals][] = []): UsSeason {
  return { season: name, complete, latestMatchDate: null, players: new Map(players), clubs: new Map(clubs) };
}
function ctx(seasons: UsSeason[], positions: [number, Position][], clubOf: [number, number][] = []): UsComparisonContext {
  return { seasons: new Map(seasons.map((s) => [s.season, s])), liveSeason: "2026/27", positionByCode: new Map(positions), clubCodeByPlayerCode: new Map(clubOf) };
}

describe("Understat Match Log ranks (players)", () => {
  // Player 1 is compared; 2 and 3 are midfielders like him; 4 is a defender; 5 a midfielder under the floor.
  const c = ctx(
    [season("2025/26", true, [[1, player(2000, 8)], [2, player(2000, 4)], [3, player(2000, 12)], [4, player(2000, 1)], [5, player(300, 30)]])],
    [
      [1, "MID"],
      [2, "MID"],
      [3, "MID"],
      [4, "DEF"],
      [5, "MID"],
    ],
  );
  const xg = (t: UsPlayerTotals) => t.xG;

  it("ranks his total within his position among those at or above the floor, on Understat's own minutes", () => {
    // 8 among the other midfielders' 4 and 12 (the defender and the 300-minute 30 left out): middle of three.
    expect(playerLogRanks(c, 1, "2025/26", xg, { total: 8, average: null }, true).total).toBe(50);
    expect(playerLogRanks(c, 1, "2025/26", xg, { total: 13, average: null }, true).total).toBeCloseTo((2.5 / 3) * 100);
  });

  it("ranks his per-match average against each other's total ÷ 38 in a completed season", () => {
    // Others: 4/38 and 12/38. His 0.2 sits between them.
    expect(playerLogRanks(c, 1, "2025/26", xg, { total: null, average: 0.2 }, true).average).toBe(50);
    expect(playerLogRanks(c, 1, "2025/26", xg, { total: null, average: 0.5 }, true).average).toBeCloseTo((2.5 / 3) * 100);
  });

  it("gives him no colour under the floor", () => {
    expect(playerLogRanks(c, 5, "2025/26", xg, { total: 30, average: 1 }, true)).toEqual({ total: null, average: null });
  });

  it("in the live season, the floor is 90 and a per-match average divides by the club's matches so far", () => {
    const live = ctx(
      [season("2026/27", false, [[1, player(95, 2)], [2, player(400, 3)], [3, player(80, 9)]], [[10, club(5, 0)], [11, club(4, 0)]])],
      [
        [1, "FWD"],
        [2, "FWD"],
        [3, "FWD"],
      ],
      [
        [2, 11],
        [3, 10],
      ],
    );
    // Only player 2 qualifies beside him (player 3's 80 minutes are under 90): 3 ÷ 4 matches = 0.75.
    const ranks = playerLogRanks(live, 1, "2026/27", (t) => t.xG, { total: 2, average: 0.8 }, true);
    expect(ranks.total).toBe(25);
    expect(ranks.average).toBe(75);
  });
});

describe("Understat Match Log ranks (clubs)", () => {
  it("ranks a club's total and per-match average among every other club's that season; xGC fewer is better", () => {
    const c = ctx([season("2025/26", true, [], [[1, club(38, 40)], [2, club(38, 30)], [3, club(38, 60)]])], []);
    const ranks = clubLogRanks(c, 1, "2025/26", (t) => t.xGA, { total: 40, average: 40 / 38 }, false);
    expect(ranks.total).toBe(50);
    expect(ranks.average).toBe(50);
  });
});

describe("Understat shot panel ranks", () => {
  it("a player's shot figures rank within his position; a Historic Average pools each other player's qualifying seasons per season", () => {
    const shooter = (minutes: number, shots: number, xG: number) => player(minutes, xG, { shots, shotsOnTarget: 0, situations: situations(slice(shots, 0, xG)) });
    const c = ctx(
      [
        season("2023/24", true, [[2, shooter(2000, 40, 4)], [3, shooter(2000, 80, 8)]]),
        season("2024/25", true, [[2, shooter(2000, 60, 6)], [3, shooter(100, 99, 9)], [1, shooter(2000, 50, 5)]]),
      ],
      [
        [1, "FWD"],
        [2, "FWD"],
        [3, "FWD"],
      ],
    );
    // Per season: player 2 (40 + 60) ÷ 2 = 50 shots; player 3 only 2023/24 counts (100 minutes in 2024/25): 80.
    const ranks = playerShotRanks(c, 1, ["2023/24", "2024/25"], [
      { key: "shots", higherIsBetter: true, perSeason: true, shown: 60, get: (t) => [t.shots, 1] },
      { key: "xGPerShot", higherIsBetter: true, perSeason: false, shown: 0.1, get: (t) => (t.shots > 0 ? [t.xG, t.shots] : null) },
    ]);
    expect(ranks.shots).toBe(50);
    // xG/shot from summed parts: everyone's is exactly 0.1 → all tied.
    expect(ranks.xGPerShot).toBe(50);
  });

  it("shots faced rank fewer as better among every other club", () => {
    const c = ctx([season("2025/26", true, [], [[1, club(38, 0, { shotsAgainst: 400 } as Partial<UsClubTotals>)], [2, club(38, 0, { shotsAgainst: 500 } as Partial<UsClubTotals>)]])], []);
    const ranks = clubShotRanks(c, 3, ["2025/26"], () => true, [{ key: "shots", higherIsBetter: false, perSeason: true, shown: 300, get: (t) => [t.shotsAgainst, 1] }]);
    expect(ranks.shots).toBeCloseTo(100 - (0.5 / 3) * 100);
  });
});

describe("leagueChanceRank", () => {
  it("takes the club's own league entry out before ranking; under two clubs, nothing", () => {
    expect(leagueChanceRank(0.45, [0.45, 0.2, 0.7, 0.3], true)).toBe(62.5);
    expect(leagueChanceRank(0.45, [0.45], true)).toBeNull();
    expect(leagueChanceRank(null, [0.1, 0.2], true)).toBeNull();
  });
});
