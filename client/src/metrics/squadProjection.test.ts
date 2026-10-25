import { describe, expect, it } from "vitest";
import { projectSquadPointsByGameweek, projectionBlankNote, projectionCoverageNote } from "./squadProjection";

const everyWeek = [true, true, true, true, true];

describe("<squad_projection> projectSquadPointsByGameweek", () => {
  const xi = [
    { perGameweek: [4, 5, 6, 3, 2], playing: everyWeek, isCaptain: false },
    { perGameweek: [6, 2, 1, 1, 1], playing: everyWeek, isCaptain: true },
  ];

  it("totals the starters for each gameweek on its own, the captain's doubled, never summing across gameweeks", () => {
    expect(projectSquadPointsByGameweek(xi, 5).map((g) => g.sum)).toEqual([
      { sum: 4 + 12, n: 2, of: 2 },
      { sum: 5 + 4, n: 2, of: 2 },
      { sum: 6 + 2, n: 2, of: 2 },
      { sum: 3 + 2, n: 2, of: 2 },
      { sum: 2 + 2, n: 2, of: 2 },
    ]);
  });

  it("counts a starter whose club blanks as a blank, not as a missing figure", () => {
    const [gw] = projectSquadPointsByGameweek([{ perGameweek: [null], playing: [false], isCaptain: false }, { perGameweek: [3], playing: [true], isCaptain: false }], 1);
    expect(gw).toEqual({ sum: { sum: 3, n: 1, of: 1 }, blanks: 1 });
    expect(projectionCoverageNote(gw.sum)).toBeUndefined();
    expect(projectionBlankNote(gw.blanks, 10)).toBe("1 starter has no match in GW10");
    expect(projectionBlankNote(0, 10)).toBeUndefined();
  });

  it("leaves a playing starter with no figure out, never counting it as 0, and says so", () => {
    const [gw] = projectSquadPointsByGameweek([{ perGameweek: [null], playing: [true], isCaptain: false }, { perGameweek: [2], playing: [true], isCaptain: false }], 1);
    expect(gw.sum).toEqual({ sum: 2, n: 1, of: 2 });
    expect(projectionCoverageNote(gw.sum)).toContain("1 of 2 playing starters");
  });

  it("is null for a gameweek with no starters, nobody playing, or no figures, and has as many entries as gameweeks left", () => {
    expect(projectSquadPointsByGameweek([], 2)).toEqual([
      { sum: null, blanks: 0 },
      { sum: null, blanks: 0 },
    ]);
    expect(projectSquadPointsByGameweek([{ perGameweek: [null], playing: [false], isCaptain: true }], 1)[0].sum).toBeNull();
    expect(projectSquadPointsByGameweek(xi, 2)).toHaveLength(2);
  });
});
