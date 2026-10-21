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

describe("buildAppSeason: shots faced while on the pitch (<shots_faced_on_pitch>)", () => {
  // Away keeper u3 plays it all; away centre-back u4 goes off after 60; away substitute u5 comes on for the last 25.
  const away = (playerId: string, position: string, minutes: number) => ({ ...appearance, playerId, teamId: "a1", side: "a", position, minutes, goals: 0, shots: 0 }) as UsAppearance;
  const links = new Map(
    [
      [503, "u3"],
      [504, "u4"],
      [505, "u5"],
    ].map(([fplCode, understatId]) => [fplCode as number, { ...link, fplCode: fplCode as number, understatId: understatId as string }]),
  );
  const faced = { ...data, appearances: [...data.appearances, away("u3", "GK", 90), away("u4", "DC", 60), away("u5", "Sub", 25)] } as SeasonData;
  const lateShots = [...shots, shot(7, { playerId: "u6", minute: 70, result: "Goal", xG: 0.5 }), shot(8, { playerId: "u6", minute: 93, situation: "Penalty", result: "SavedShot", xG: 0.76 })];
  const file = buildAppSeason({ ...faced, shots: lateShots }, links, true, new Set(["m1"]));

  it("counts the opponents' shots in his time on, never his own club's or an own goal", () => {
    // The home side's 4 shots at 10' (2 on target), the 70' goal and the saved 93' penalty.
    expect(file.players["503"].facing).toMatchObject({ shots: 6, shotsOnTarget: 4, complete: true });
    expect(file.players["503"].facing.situations.Penalty).toEqual({ shots: 1, goals: 0, xG: 0.76 });
    expect(file.players["503"].facing.situations.OpenPlay.goals).toBe(2);
    expect(file.players["504"].facing.shots).toBe(4);
    // On from the 65th minute.
    expect(file.players["505"].facing.shots).toBe(2);
  });

  it("not complete when the opponents' shot list for one of his matches is short", () => {
    const short = buildAppSeason({ ...faced, shots: lateShots.filter((s) => s.shotId !== "s1") }, links, true, new Set(["m1"]));
    expect(short.players["503"].facing.complete).toBe(false);
  });
});
