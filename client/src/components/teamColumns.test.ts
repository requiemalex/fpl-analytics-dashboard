import { describe, it, expect } from "vitest";
import { teamColumnByKey, teamColumnForMode } from "./teamColumns";
import { colourDirection } from "../metrics/comparativeColour";
import type { TeamAggregate } from "../metrics/teamStats";

// The club columns added for the Team Profile's Summary (also Team Explorer's, off by default).

const club = (overrides: Partial<TeamAggregate> = {}): TeamAggregate => ({
  teamId: 1, name: "Club", shortName: "CLB", points: 1900, goals: 58, assists: 45, bonus: 120, xG: 55, xA: 40, xGI: 95, xGC: 42,
  defensiveContributions: 2800, cleanSheets: 12, goalsFor: 60, goalsAgainst: 40, leaguePosition: 4, leaguePoints: 70, played: 38, wins: 20, draws: 10, losses: 8,
  ...overrides,
});
const value = (key: string, t = club()) => teamColumnByKey(key)!.getValue(t);

describe("the Summary's club columns", () => {
  it("per match: ÷ matches played", () => {
    expect(value("goalsAgainstPerGame")).toBeCloseTo(40 / 38, 10);
    expect(value("xGPerGame")).toBeCloseTo(55 / 38, 10);
    expect(value("pointsPerGame")).toBeCloseTo(1900 / 38, 10);
    expect(value("cleanSheetRate")).toBeCloseTo((12 / 38) * 100, 10);
  });

  it("differences: xGD is xG − xGC; Goals − xG uses the club's own goals (own goals in its favour left out, as xG does)", () => {
    expect(value("xGD")).toBeCloseTo(13, 10);
    expect(value("goalsMinusXG")).toBeCloseTo(3, 10);
    expect(value("goalsAgainstMinusXGC")).toBeCloseTo(-2, 10);
    expect(teamColumnByKey("xGD")!.format(13)).toBe("+13.00");
  });

  it("fewer conceded is better, conceding below xGC included", () => {
    for (const key of ["goalsAgainstPerGame", "xGCPerGame", "goalsAgainstMinusXGC"]) expect(colourDirection(teamColumnByKey(key)!), key).toBe(false);
    for (const key of ["xGD", "goalsMinusXG", "cleanSheetRate"]) expect(colourDirection(teamColumnByKey(key)!), key).toBe(true);
  });

  it("unknown is —, never 0: no matches, or a figure FPL doesn't have that season", () => {
    expect(value("xGPerGame", club({ played: 0 }))).toBeNull();
    expect(value("xGD", club({ xG: null }))).toBeNull();
    expect(value("cleanSheetRate", club({ played: null }))).toBeNull();
  });

  it("rates keep their decimals in a Historic Average; a percentage stays a percentage", () => {
    const rate = teamColumnByKey("cleanSheetRate")!;
    expect(teamColumnForMode(rate, "historicAverage").format(31.58)).toBe(rate.format(31.58));
    expect(rate.format(31.58)).toMatch(/%$/);
  });
});
