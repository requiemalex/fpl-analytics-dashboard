import { describe, it, expect } from "vitest";
import { understatPlayerColumns, understatTeamColumns } from "./columns";
import { sumPlayerSeasons, type UsClubResolved, type UsPlayerResolved } from "./resolve";
import type { UsClubTotals, UsPlayerTotals } from "./schema";
import type { TeamAggregate } from "../metrics/teamStats";
import type { PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { makePlayer, makeTeam } from "../test/fixtures";

// The Understat columns built from figures already in the season summary:
// goals by situation and body part, conversion, non-penalty finishing and
// Assists − xA. Each from Understat's own numbers only (<one_source_per_figure>).

const slice = (shots = 0, goals = 0, xG = 0) => ({ shots, goals, xG });
const totals: UsPlayerTotals = {
  understatId: "u1", appearances: 20, minutes: 1700, goals: 12, assists: 4, shots: 60, shotsOnTarget: 25, keyPasses: 30, xG: 10.6, xA: 5.5, npxG: 8.32, npGoals: 9,
  xGChain: 14, xGBuildup: 3,
  situations: { OpenPlay: slice(50, 7, 7.2), FromCorner: slice(5, 1, 0.6), SetPiece: slice(1, 0, 0.12), DirectFreekick: slice(1, 1, 0.4), Penalty: slice(3, 3, 2.28) },
  bodyParts: { RightFoot: slice(40, 8, 7), LeftFoot: slice(14, 2, 2.6), Head: slice(6, 2, 1), OtherBodyPart: slice() },
  shotsComplete: true,
};
const player = makePlayer({ id: 1, position: "FWD" });
const D = {} as PlayerDerivedMetrics;

function playerValue(key: string, r: UsPlayerResolved | null) {
  const cols = understatPlayerColumns(() => r).groups.flatMap((g) => g.columns);
  const c = cols.find((x) => x.key === key);
  if (!c) throw new Error(`no column ${key}`);
  return c.getValue(player, D);
}

function alternateValue(key: string, r: UsPlayerResolved | null) {
  const c = understatPlayerColumns(() => r).alternates[key];
  if (!c) throw new Error(`no alternate ${key}`);
  return c.getValue(player, D);
}

describe("Understat player columns", () => {
  const one: UsPlayerResolved = { totals, seasons: 1 };
  it("goals by situation and body part, from the shot list", () => {
    expect(playerValue("us.openPlayGoals", one)).toBe(7);
    expect(playerValue("us.setPieceGoals", one)).toBe(2);
    expect(playerValue("us.penaltyGoals", one)).toBe(3);
    expect(playerValue("us.headedGoals", one)).toBe(2);
  });
  it("Conversion %: shot-list goals / shots", () => {
    expect(playerValue("us.conversionPct", one)).toBeCloseTo((12 / 60) * 100, 10);
  });
  it("non-penalty finishing: NPxG/Shot leaves penalties out of both sides; NP Goals − NPxG", () => {
    expect(playerValue("us.npxGPerShot", one)).toBeCloseTo(8.32 / 57, 10);
    expect(playerValue("us.npGoalsMinusNpxG", one)).toBeCloseTo(9 - 8.32, 10);
  });
  it("Goals − xG and Assists − xA are Understat's version of the FPL columns (the ⇄ toggle), Understat's own figures on both sides", () => {
    expect(alternateValue("goalsMinusXG", one)).toBeCloseTo(12 - 10.6, 10);
    expect(alternateValue("assistsMinusXA", one)).toBeCloseTo(4 - 5.5, 10);
    const ownGroups = understatPlayerColumns(() => one).groups.flatMap((g) => g.columns.map((c) => c.key));
    expect(ownGroups).not.toContain("us.goalsMinusXG");
    expect(ownGroups).not.toContain("us.assistsMinusXA");
  });
  it("NPxGI (per game from Understat's own minutes)", () => {
    expect(playerValue("us.npxGI", one)).toBeCloseTo(8.32 + 5.5, 10);
    expect(playerValue("us.npxGIPerGame", one)).toBeCloseTo((8.32 + 5.5) / 19, 10);
  });
  it("a Historic Average divides totals by the seasons known; a rate stays total ÷ total", () => {
    const two: UsPlayerResolved = { totals, seasons: 2 };
    expect(playerValue("us.penaltyGoals", two)).toBe(1.5);
    expect(playerValue("us.conversionPct", two)).toBeCloseTo(20, 10);
  });
  it("<incomplete_shot_list>: shot-built figures are —; line-up figures aren't", () => {
    const short: UsPlayerResolved = { totals: { ...totals, shotsComplete: false }, seasons: 1 };
    for (const key of ["us.conversionPct", "us.penaltyGoals", "us.headedGoals", "us.npxGPerShot", "us.npGoalsMinusNpxG", "us.npxGI"]) expect(playerValue(key, short), key).toBeNull();
    expect(alternateValue("assistsMinusXA", short)).toBeCloseTo(-1.5, 10);
  });
  it("an unlinked player is — for every new column, never 0", () => {
    for (const key of ["us.conversionPct", "us.penaltyGoals", "us.npxGI"]) expect(playerValue(key, null), key).toBeNull();
    expect(alternateValue("assistsMinusXA", null)).toBeNull();
  });
  it("no shots: Conversion % and NPxG/Shot are —, not 0 or NaN", () => {
    const none: UsPlayerResolved = { totals: { ...totals, shots: 0, npxG: 0, situations: { ...totals.situations, Penalty: slice() } }, seasons: 1 };
    expect(playerValue("us.conversionPct", none)).toBeNull();
    expect(playerValue("us.npxGPerShot", none)).toBeNull();
  });
});

describe("Understat club columns", () => {
  const club: UsClubTotals = {
    understatTeamId: "83", played: 38, xG: 70, xGA: 30, npxG: 64, npxGA: 28, ppdaAtt: 0, ppdaDef: 0, ppdaAllowedAtt: 0, ppdaAllowedDef: 0, deep: 0, deepAllowed: 0,
    xPts: 0, pts: 0, goalsFor: 70, goalsAgainst: 25, assists: 0, xA: 0, keyPasses: 0, shots: 600, shotsOnTarget: 200, shotsAgainst: 300, shotsOnTargetAgainst: 100,
    situationsFor: { OpenPlay: slice(480, 45, 50), FromCorner: slice(80, 12, 7), SetPiece: slice(20, 5, 2), DirectFreekick: slice(12, 3, 0.9), Penalty: slice(8, 6, 6.1) },
    situationsAgainst: { OpenPlay: slice(250, 15, 22), FromCorner: slice(30, 4, 2.5), SetPiece: slice(10, 2, 1), DirectFreekick: slice(6, 0, 0.3), Penalty: slice(4, 3, 3) },
    shotsCompleteFor: true, shotsCompleteAgainst: true,
  };
  const team = makeTeam({ id: 1 });
  function teamValue(key: string, r: UsClubResolved | null) {
    const cols = understatTeamColumns(new Map([[1, team]]), () => r).groups.flatMap((g) => g.columns);
    const c = cols.find((x) => x.key === key);
    if (!c) throw new Error(`no column ${key}`);
    return c.getValue({ teamId: 1 } as TeamAggregate);
  }
  const r: UsClubResolved = { totals: club, seasons: 1 };
  it("goals for and against by situation, penalties both ways, conversion, xGD", () => {
    expect(teamValue("us.openPlayGoals", r)).toBe(45);
    expect(teamValue("us.setPieceGoals", r)).toBe(20);
    expect(teamValue("us.penaltiesTaken", r)).toBe(8);
    expect(teamValue("us.openPlayGoalsAgainst", r)).toBe(15);
    expect(teamValue("us.setPieceGoalsAgainst", r)).toBe(6);
    expect(teamValue("us.penaltiesConceded", r)).toBe(4);
    expect(teamValue("us.conversionPct", r)).toBeCloseTo((71 / 600) * 100, 10);
    expect(teamValue("us.xGD", r)).toBe(40);
  });
  it("<incomplete_shot_list> per side: an incomplete opponents' list blanks only the 'against' figures", () => {
    const short: UsClubResolved = { totals: { ...club, shotsCompleteAgainst: false }, seasons: 1 };
    expect(teamValue("us.setPieceGoalsAgainst", short)).toBeNull();
    expect(teamValue("us.penaltiesConceded", short)).toBeNull();
    expect(teamValue("us.setPieceGoals", short)).toBe(20);
  });
});

describe("Understat shot detail (woodwork, blocked, assisted, shot type)", () => {
  const detail = {
    woodwork: 3, blocked: 15, assisted: 42,
    lastActions: { Cross: { shots: 9, goals: 2, xG: 1.4 }, Throughball: { shots: 4, goals: 2, xG: 1.1 }, TakeOn: { shots: 6, goals: 1, xG: 0.5 }, Rebound: { shots: 5, goals: 2, xG: 1.2 } },
  };
  const withDetail: UsPlayerResolved = { totals: { ...totals, shotDetail: detail }, seasons: 1 };
  it("reads the season file's shot detail; percentages are of all shots", () => {
    expect(playerValue("us.woodwork", withDetail)).toBe(3);
    expect(playerValue("us.blockedShots", withDetail)).toBe(15);
    expect(playerValue("us.blockedPct", withDetail)).toBeCloseTo(25, 10);
    expect(playerValue("us.assistedPct", withDetail)).toBeCloseTo(70, 10);
    expect(playerValue("us.crossShots", withDetail)).toBe(9);
    expect(playerValue("us.throughBallXG", withDetail)).toBeCloseTo(1.1, 10);
    expect(playerValue("us.dribbleShots", withDetail)).toBe(6);
    expect(playerValue("us.reboundShots", withDetail)).toBe(5);
  });
  it("a season file from before the sync added it: —, never 0", () => {
    const old: UsPlayerResolved = { totals: { ...totals, shotDetail: undefined }, seasons: 1 };
    for (const key of ["us.woodwork", "us.blockedPct", "us.assistedPct", "us.crossShots"]) expect(playerValue(key, old), key).toBeNull();
  });
  it("<incomplete_shot_list>: —", () => {
    expect(playerValue("us.woodwork", { totals: { ...totals, shotDetail: detail, shotsComplete: false }, seasons: 1 })).toBeNull();
  });
});

describe("Understat: inside or outside the box, headers after corners and crosses, chances created by situation", () => {
  const lastActions = { Cross: slice(), Throughball: slice(), TakeOn: slice(), Rebound: slice() };
  const detail = {
    woodwork: 0, blocked: 0, assisted: 0, lastActions,
    location: { box: slice(45, 11, 9.4), outside: slice(15, 1, 1.2) },
    headers: { corner: slice(3, 1, 0.5), openPlayCross: slice(2, 0, 0.3) },
  };
  const created = { corner: { chances: 12, xA: 1.4 }, setPiece: { chances: 15, xA: 1.7 }, complete: true };
  const full: UsPlayerResolved = { totals: { ...totals, shotDetail: detail, created }, seasons: 1 };

  it("inside + outside is every shot; the share is of all his shots", () => {
    expect(playerValue("us.boxShots", full)).toBe(45);
    expect(playerValue("us.outsideBoxShots", full)).toBe(15);
    expect(playerValue("us.boxShotPct", full)).toBeCloseTo(75, 10);
    expect(playerValue("us.boxGoals", full)).toBe(11);
    expect(playerValue("us.outsideBoxXG", full)).toBeCloseTo(1.2, 10);
  });

  it("headers after corners and from open-play crosses; chances he set up after corners and set pieces", () => {
    expect(playerValue("us.headedCornerXG", full)).toBeCloseTo(0.5, 10);
    expect(playerValue("us.headedCrossXG", full)).toBeCloseTo(0.3, 10);
    expect(playerValue("us.cornerChances", full)).toBe(12);
    expect(playerValue("us.cornerXA", full)).toBeCloseTo(1.4, 10);
    expect(playerValue("us.setPieceXA", full)).toBeCloseTo(1.7, 10);
  });

  it("— (never 0) in a season file from before the sync added them, and for chances that don't add up to his xA", () => {
    const old: UsPlayerResolved = { totals: { ...totals, shotDetail: { woodwork: 0, blocked: 0, assisted: 0, lastActions }, created: null }, seasons: 1 };
    for (const key of ["us.boxShots", "us.boxShotPct", "us.headedCornerXG", "us.cornerXA", "us.setPieceChances"]) expect(playerValue(key, old), key).toBeNull();
    const unsure: UsPlayerResolved = { totals: { ...totals, shotDetail: detail, created: { ...created, complete: false } }, seasons: 1 };
    expect(playerValue("us.cornerChances", unsure)).toBeNull();
  });

  it("over several seasons, a season without them makes the sum unknown, never a part-count", () => {
    const withIt = { ...totals, shotDetail: detail, created };
    const two = sumPlayerSeasons([withIt, withIt])!;
    expect(playerValue("us.boxShots", two)).toBe(45);
    expect(playerValue("us.cornerXA", two)).toBeCloseTo(1.4, 10);
    const mixed = sumPlayerSeasons([withIt, { ...totals, shotDetail: { woodwork: 0, blocked: 0, assisted: 0, lastActions }, created: null }])!;
    expect(playerValue("us.boxShots", mixed)).toBeNull();
    expect(playerValue("us.cornerXA", mixed)).toBeNull();
  });
});
