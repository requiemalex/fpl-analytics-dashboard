import { describe, expect, it } from "vitest";
import { projectSquadPointsByMatch, projectionCoverageNote } from "./squadProjection";

describe("<squad_projection> projectSquadPointsByMatch", () => {
  const xi = [
    { perMatch: [4, 5, 6, 3, 2], isCaptain: false },
    { perMatch: [6, 2, 1, 1, 1], isCaptain: true },
  ];

  it("totals the starters for each match on its own, the captain's doubled, never summing across matches", () => {
    expect(projectSquadPointsByMatch(xi)).toEqual([
      { sum: 4 + 12, n: 2, of: 2 },
      { sum: 5 + 4, n: 2, of: 2 },
      { sum: 6 + 2, n: 2, of: 2 },
      { sum: 3 + 2, n: 2, of: 2 },
      { sum: 2 + 2, n: 2, of: 2 },
    ]);
  });

  it("leaves a starter with no figure for a match out, never counting it as 0, and says so", () => {
    const byMatch = projectSquadPointsByMatch([{ perMatch: [4, null], isCaptain: false }, { perMatch: [3, 2], isCaptain: false }]);
    expect(byMatch[1]).toEqual({ sum: 2, n: 1, of: 2 });
    expect(projectionCoverageNote(byMatch[1])).toContain("1 of 2 starters");
    expect(projectionCoverageNote(byMatch[0])).toBeUndefined();
  });

  it("is null for a match with no starters or no figures at all", () => {
    expect(projectSquadPointsByMatch([])).toEqual([null, null, null, null, null]);
    expect(projectSquadPointsByMatch([{ perMatch: [null, 3], isCaptain: true }]).slice(0, 2)).toEqual([null, { sum: 6, n: 1, of: 1 }]);
  });
});
