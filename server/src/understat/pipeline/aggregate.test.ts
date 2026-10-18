import { describe, expect, it } from "vitest";
import { buildAppSeason } from "./aggregate.js";
import type { SeasonData } from "./files.js";
import type { PlayerLink, UsAppearance, UsShot } from "./types.js";

// Shot detail (woodwork, blocked, assisted, the action before a shot), for
// a player and for both clubs in the match. One match, home "h1" v away "a1".

const link: PlayerLink = { fplCode: 500, understatId: "u1", status: "confirmed", fplName: "A", understatName: "A", season: "2025/26", since: "2026-01-01", note: "" };
const shot = (n: number, extra: Partial<UsShot>): UsShot =>
  ({ shotId: `s${n}`, matchId: "m1", playerId: "u1", playerName: "A", side: "h", minute: 10, x: 0.9, y: 0.5, xG: 0.1, result: "MissedShots", situation: "OpenPlay", shotType: "RightFoot", lastAction: "Pass", assistedBy: "B", ...extra }) as UsShot;
const shots: UsShot[] = [
  shot(1, { result: "ShotOnPost", lastAction: "Cross", xG: 0.3 }),
  shot(2, { result: "BlockedShot", lastAction: "TakeOn", assistedBy: "" }),
  shot(3, { result: "Goal", lastAction: "Throughball", xG: 0.4 }),
  shot(4, { result: "SavedShot", lastAction: "Rebound", assistedBy: "" }),
  // An own goal is nobody's shot: counted nowhere.
  shot(5, { result: "OwnGoal", lastAction: "Cross", playerId: "u9", side: "a" }),
  // The away side's one shot, blocked.
  shot(6, { result: "BlockedShot", lastAction: "Cross", playerId: "u2", side: "a", assistedBy: "C" }),
];
const appearance = { matchId: "m1", playerId: "u1", playerName: "A", teamId: "h1", side: "h", position: "FW", minutes: 90, goals: 1, ownGoals: 0, shots: 4, xG: 0.9, assists: 0, xA: 0, keyPasses: 0, xGChain: 0, xGBuildup: 0, yellowCards: 0, redCards: 0 } as UsAppearance;
const data = {
  season: "2025/26",
  clubs: [
    { fplTeamCode: 1, understatTeamId: "h1", understatTitle: "Home" },
    { fplTeamCode: 2, understatTeamId: "a1", understatTitle: "Away" },
  ],
  matches: [{ id: "m1", datetime: "2025-08-16 15:00:00", isResult: true, homeTeamId: "h1", awayTeamId: "a1", homeGoals: 2, awayGoals: 0, homeXG: 0.9, awayXG: 0.1, forecastWin: null, forecastDraw: null, forecastLoss: null }],
  teamMatches: [],
  appearances: [appearance, { ...appearance, playerId: "u2", teamId: "a1", side: "a", goals: 0, shots: 1 }],
  shots,
} as unknown as SeasonData;

describe("buildAppSeason: shot detail", () => {
  const file = buildAppSeason(data, new Map([[500, link]]), true, new Set(["m1"]));

  it("a player's woodwork, blocked and assisted shots, and shots by the action before them", () => {
    const d = file.players["500"].shotDetail;
    expect(d).toMatchObject({ woodwork: 1, blocked: 1, assisted: 2 });
    expect(d.lastActions.Cross).toEqual({ shots: 1, goals: 0, xG: 0.3 });
    expect(d.lastActions.Throughball).toEqual({ shots: 1, goals: 1, xG: 0.4 });
    expect(d.lastActions.TakeOn.shots).toBe(1);
    expect(d.lastActions.Rebound.shots).toBe(1);
  });

  it("clubs: their own shots, and their opponents' (an own goal counts for neither)", () => {
    expect(file.clubs["1"].shotDetailFor).toMatchObject({ woodwork: 1, blocked: 1, assisted: 2 });
    expect(file.clubs["1"].shotDetailAgainst).toMatchObject({ woodwork: 0, blocked: 1, assisted: 1 });
    expect(file.clubs["1"].shotDetailAgainst.lastActions.Cross.shots).toBe(1);
    expect(file.clubs["2"].shotDetailFor.blocked).toBe(1);
    expect(file.clubs["2"].shotDetailAgainst.woodwork).toBe(1);
  });
});
