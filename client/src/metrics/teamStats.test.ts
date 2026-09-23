import { describe, it, expect } from "vitest";
import { computeTeamAggregates } from "./teamStats";
import { makePlayer, makeTeam } from "../test/fixtures";

describe("computeTeamAggregates — <team_xgc_from_goalkeepers>", () => {
  const team = makeTeam({ id: 1 });
  // Every player on the pitch carries the same on-pitch xGC/goals conceded,
  // so a squad-wide sum would count each chance once per player.
  const squad = [
    makePlayer({ id: 1, teamId: 1, position: "GKP", xGC: 40, goalsConceded: 38, xG: 0, goals: 0 }),
    makePlayer({ id: 2, teamId: 1, position: "GKP", xGC: 2, goalsConceded: 3, xG: 0, goals: 0 }),
    makePlayer({ id: 3, teamId: 1, position: "DEF", xGC: 39, goalsConceded: 37, xG: 3, goals: 2 }),
    makePlayer({ id: 4, teamId: 1, position: "FWD", xGC: 30, goalsConceded: 30, xG: 15, goals: 18 }),
  ];

  it("takes xGC and goals conceded from goalkeepers only", () => {
    const [agg] = computeTeamAggregates([team], squad, []);
    expect(agg.xGC).toBe(42);
    expect(agg.goalsConceded).toBe(41);
  });

  it("still sums xG and goals across the whole squad", () => {
    const [agg] = computeTeamAggregates([team], squad, []);
    expect(agg.xG).toBe(18);
    expect(agg.goals).toBe(20);
  });

  it("is null, not 0, when no goalkeeper has data for the mode", () => {
    const noKeeperData = squad.map((p) => (p.position === "GKP" ? { ...p, xGC: null, goalsConceded: null } : p));
    const [agg] = computeTeamAggregates([team], noKeeperData, []);
    expect(agg.xGC).toBeNull();
    expect(agg.goalsConceded).toBeNull();
  });
});
