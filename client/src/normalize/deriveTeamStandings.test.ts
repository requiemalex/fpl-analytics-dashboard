import { describe, it, expect } from "vitest";
import { applyRealTeamStandings } from "./deriveTeamStandings";
import type { NormalizedFixture, NormalizedTeam } from "../types/normalized";

const team = (id: number): NormalizedTeam =>
  ({ id, code: id, name: `T${id}`, shortName: `T${id}`, position: null, played: 0, points: 0, wins: 0, draws: 0, losses: 0, unavailable: false, strengthOverallHome: null, strengthOverallAway: null }) as NormalizedTeam;
const fx = (home: number, away: number, hs: number | null, as: number | null, finished = true) =>
  ({ homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, finished }) as NormalizedFixture;

describe("applyRealTeamStandings", () => {
  it("derives league points (3 per win, 1 per draw) alongside played/W/D/L — bootstrap's own team.points stays 0", () => {
    const [a, b, c] = applyRealTeamStandings([team(1), team(2), team(3)], [fx(1, 2, 2, 0), fx(3, 1, 1, 1), fx(2, 3, 0, 3), fx(1, 3, null, null, false)]);
    expect(a).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0, points: 4 });
    expect(b).toMatchObject({ played: 2, wins: 0, draws: 0, losses: 2, points: 0 });
    expect(c).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0, points: 4 });
  });

  it("leaves a team with no finished fixtures as it is", () => {
    const [a] = applyRealTeamStandings([team(1)], []);
    expect(a).toEqual(team(1));
  });
});
