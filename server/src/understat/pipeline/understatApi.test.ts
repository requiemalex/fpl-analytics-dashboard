import { describe, expect, it } from "vitest";
import { parseTeam, UnderstatFormatError } from "./understatApi.js";

// The shape of Understat's /getTeamData reply, trimmed to what parseTeam reads.
const page = (h: string, a: string) => ({
  dates: [
    { id: "31180", isResult: true, h: { id: h }, a: { id: a } },
    { id: "31254", isResult: false, h: { id: "83" }, a: { id: "72" } },
  ],
  statistics: {
    formation: {
      "4-2-3-1": { stat: "4-2-3-1", time: 669, shots: 87, goals: 11, xG: 12.75, against: { shots: 78, goals: 5, xG: 7.53 } },
    },
  },
});

describe("parseTeam", () => {
  it("reads each formation's time and shots for and against, and the played matches", () => {
    const t = parseTeam(page("83", "294"), "83", 2026);
    expect(t.playedMatchIds).toEqual(["31180"]);
    expect(t.formations).toEqual([{ teamId: "83", formation: "4-2-3-1", minutes: 669, shots: 87, goals: 11, xG: 12.75, shotsAgainst: 78, goalsAgainst: 5, xGA: 7.53 }]);
  });

  it("refuses another club's page", () => {
    expect(() => parseTeam(page("71", "294"), "83", 2026)).toThrow(UnderstatFormatError);
  });
});
