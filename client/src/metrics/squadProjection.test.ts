import { describe, expect, it } from "vitest";
import { horizonLabel, projectSquadPoints, projectionCoverageNote } from "./squadProjection";

describe("<squad_projection> projectSquadPoints", () => {
  const xi = [
    { perMatch: [4, 5, 6, 3, 2], isCaptain: false },
    { perMatch: [6, 2, 1, 1, 1], isCaptain: true },
  ];

  it("adds up the starters' next N matches, the captain's doubled in each", () => {
    expect(projectSquadPoints(xi, 1)).toEqual({ sum: 4 + 12, n: 2, of: 2 });
    expect(projectSquadPoints(xi, 3)).toEqual({ sum: 4 + 5 + 6 + (6 + 2 + 1) * 2, n: 6, of: 6 });
  });

  it("leaves a starter-match with no figure out, never counting it as 0, and says so", () => {
    const sum = projectSquadPoints([{ perMatch: [4, null], isCaptain: false }, { perMatch: [3], isCaptain: false }], 2);
    expect(sum).toEqual({ sum: 7, n: 2, of: 4 });
    expect(projectionCoverageNote(sum)).toContain("2 of 4 starter-matches");
    expect(projectionCoverageNote(projectSquadPoints(xi, 2))).toBeUndefined();
  });

  it("is null with no starters or no figures at all", () => {
    expect(projectSquadPoints([], 3)).toBeNull();
    expect(projectSquadPoints([{ perMatch: [null, null], isCaptain: true }], 2)).toBeNull();
  });

  it("labels the horizon as the Match switch does", () => {
    expect(horizonLabel(1)).toBe("GW+1");
    expect(horizonLabel(4)).toBe("GW+1–4");
  });
});
