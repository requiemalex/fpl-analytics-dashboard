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

describe("buildAppSeason: inside or outside the box (<shot_location>) and headers", () => {
  // The box: within 16.5 m of the goal line and 20.16 m of the middle. x runs to the goal, y across.
  const at = (n: number, x: number, y: number, extra: Partial<UsShot> = {}) => shot(n, { x, y, ...extra });
  const located = [
    at(1, 0.9, 0.5, { result: "Goal", xG: 0.4 }), // 10.5 m out, central: inside
    at(2, 0.885, 0.5, { situation: "Penalty", xG: 0.76 }), // the spot (12 m): inside, penalties included
    at(3, 1 - 16.5 / 105, 0.5), // on the box's front line: inside, as the shot map has it
    at(4, 0.8, 0.5, { xG: 0.05 }), // 21 m out: outside
    at(5, 0.95, 0.05), // level with the box but out wide: outside
    at(6, 0.95, 0.5, { shotType: "Head", situation: "FromCorner", lastAction: "Aerial", xG: 0.2 }),
    at(7, 0.95, 0.5, { shotType: "Head", situation: "OpenPlay", lastAction: "Cross", xG: 0.15 }),
    // A header from a cross after a corner is a corner header, not an open-play cross.
    at(8, 0.95, 0.5, { shotType: "Head", situation: "FromCorner", lastAction: "Cross", xG: 0.1 }),
  ];
  const file = buildAppSeason({ ...data, appearances: [{ ...appearance, shots: 8 }], shots: located }, new Map([[500, link]]), true, new Set(["m1"]));

  it("every shot is inside or outside, penalties inside", () => {
    const { box, outside } = file.players["500"].shotDetail.location;
    expect(box).toEqual({ shots: 6, goals: 1, xG: 1.71 });
    expect(outside.shots).toBe(2);
    expect(box.shots + outside.shots).toBe(file.players["500"].shots);
    expect(file.clubs["1"].shotDetailFor.location.box.shots).toBe(6);
    expect(file.clubs["2"].shotDetailAgainst.location.outside.shots).toBe(2);
  });

  it("headers after corners, and headers straight from an open-play cross", () => {
    const { headers } = file.players["500"].shotDetail;
    expect(headers.corner).toEqual({ shots: 2, goals: 0, xG: 0.3 });
    expect(headers.openPlayCross).toEqual({ shots: 1, goals: 0, xG: 0.15 });
  });
});

describe("buildAppSeason: chances created by situation (<created_by_situation>)", () => {
  // u1's shots are set up by "B" (u2 on the same side); the away side's by "C".
  const setUp = (n: number, situation: string, xG: number, assistedBy = "B") => shot(n, { playerId: "u1", situation, xG, assistedBy });
  const created = [setUp(1, "FromCorner", 0.3), setUp(2, "SetPiece", 0.2), setUp(3, "OpenPlay", 0.1), setUp(4, "FromCorner", 0.05, "")];
  const b = { ...appearance, playerId: "u2", playerName: "B", goals: 0, shots: 0, xA: 0.6 } as UsAppearance;
  const links = new Map([
    [500, link],
    [502, { ...link, fplCode: 502, understatId: "u2" }],
  ]);
  const build = (appearances: UsAppearance[]) =>
    buildAppSeason({ ...data, appearances: [{ ...appearance, shots: 4 }, ...appearances], shots: created }, links, true, new Set(["m1"]));

  it("counts the shots he set up after corners, and after any set piece", () => {
    const c = build([b]).players["502"].created;
    expect(c.corner).toEqual({ chances: 1, xA: 0.3 });
    expect(c.setPiece).toEqual({ chances: 2, xA: 0.5 });
    expect(c.complete).toBe(true);
  });

  it("not complete when his matched shots don't add up to his line-up xA (never an undercount)", () => {
    expect(build([{ ...b, xA: 0.9 }]).players["502"].created.complete).toBe(false);
    // Two "B"s on one side: neither can be credited, so the one linked isn't complete.
    expect(build([b, { ...b, playerId: "u7" }]).players["502"].created.complete).toBe(false);
  });
});
