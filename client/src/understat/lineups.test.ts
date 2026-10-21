import { describe, expect, it } from "vitest";
import { formationLineups, formationOf } from "./lineups";
import type { UsLineup } from "./profileData";

const xi = (fixture: number, starters: [string, number | null, string][]): UsLineup => ({ fixture, starters: starters.map(([position, code, name]) => ({ position, code, name })) });

/** A 4-2-3-1 XI with the given centre-backs and striker. */
const fourTwoThreeOne = (fixture: number, cbs: [number, number], striker: number): UsLineup =>
  xi(fixture, [
    ["GK", 1, "Keeper"],
    ["DL", 2, "Left Back"],
    ["DC", cbs[0], `CB ${cbs[0]}`],
    ["DC", cbs[1], `CB ${cbs[1]}`],
    ["DR", 5, "Right Back"],
    ["DMC", 6, "Holder A"],
    ["DMC", 7, "Holder B"],
    ["AML", 8, "Left Winger"],
    ["AMC", 9, "Ten"],
    ["AMR", 10, "Right Winger"],
    ["FW", striker, `Striker ${striker}`],
  ]);

describe("formationOf: an XI's slots name its formation, as Understat names them", () => {
  it.each([
    [["GK", "DR", "DC", "DC", "DL", "DMC", "DMC", "AMR", "AMC", "AML", "FW"], "4-2-3-1"],
    [["GK", "DR", "DC", "DC", "DL", "MC", "MC", "MC", "FWR", "FW", "FWL"], "4-3-3"],
    [["GK", "DR", "DC", "DC", "DL", "DMC", "MR", "MC", "MC", "ML", "FW"], "4-1-4-1"],
    // Wing-backs count in midfield; so do wide midfielders in the other 3-4-2-1.
    [["GK", "DC", "DC", "DC", "DMR", "DML", "MC", "MC", "AMC", "AMC", "FW"], "3-4-2-1"],
    [["GK", "DC", "DC", "DC", "MR", "MC", "MC", "ML", "AMC", "AMC", "FW"], "3-4-2-1"],
    [["GK", "DR", "DC", "DC", "DC", "DL", "MR", "MC", "MC", "ML", "FW"], "5-4-1"],
    [["GK", "DR", "DC", "DC", "DL", "DMC", "MC", "MC", "AMC", "FW", "FW"], "4-1-2-1-2"],
    // No forward: the 0 is kept.
    [["GK", "DR", "DC", "DC", "DL", "DMC", "DMC", "AMR", "AMC", "AMC", "AML"], "4-2-4-0"],
  ])("%j is %s", (positions, name) => {
    expect(formationOf(positions)).toBe(name);
  });

  it("a slot Understat doesn't use names nothing", () => {
    expect(formationOf(["GK", "XX"])).toBeNull();
  });
});

describe("formationLineups: who started where", () => {
  const lineups = [
    fourTwoThreeOne(1, [3, 4], 11),
    fourTwoThreeOne(2, [3, 4], 11),
    fourTwoThreeOne(3, [3, 12], 13),
    // A 4-4-2 match: not counted in the 4-2-3-1.
    xi(4, [
      ["GK", 1, "Keeper"],
      ["DL", 2, "Left Back"],
      ["DC", 3, "CB 3"],
      ["DC", 4, "CB 4"],
      ["DR", 5, "Right Back"],
      ["ML", 8, "Left Winger"],
      ["MC", 6, "Holder A"],
      ["MC", 7, "Holder B"],
      ["MR", 10, "Right Winger"],
      ["FW", 11, "Striker 11"],
      ["FW", 13, "Striker 13"],
    ]),
  ];

  it("counts only the matches the club started in that formation, and lays it out forwards first, each line left to right", () => {
    const f = formationLineups("4-2-3-1", lineups)!;
    expect(f.starts).toBe(3);
    expect(f.lines.map((line) => line.map((s) => s.position))).toEqual([["FW"], ["AML", "AMC", "AMR"], ["DMC", "DMC"], ["DL", "DC", "DC", "DR"], ["GK"]]);
    expect(f.lines[0][0].players).toEqual([
      { code: 11, name: "Striker 11", starts: 2 },
      { code: 13, name: "Striker 13", starts: 1 },
    ]);
  });

  it("two identical slots share their starters out in turn, most starts first", () => {
    const [left, right] = formationLineups("4-2-3-1", lineups)!.lines[3].filter((s) => s.position === "DC");
    expect(left.players.map((p) => [p.code, p.starts])).toEqual([
      [3, 3],
      [12, 1],
    ]);
    expect(right.players.map((p) => [p.code, p.starts])).toEqual([[4, 2]]);
  });

  it("a starter in a slot the formation's usual XI hasn't is counted in the nearest one in his line, same side first", () => {
    const wingBacks = (fixture: number) =>
      xi(fixture, [
        ["GK", 1, "Keeper"],
        ["DC", 2, "A"],
        ["DC", 3, "B"],
        ["DC", 4, "C"],
        ["DML", 5, "Left Wing-back"],
        ["MC", 6, "D"],
        ["MC", 7, "E"],
        ["DMR", 8, "Right Wing-back"],
        ["AMC", 9, "F"],
        ["AMC", 10, "G"],
        ["FW", 11, "H"],
      ]);
    const wideMidfield = xi(3, [
      ["GK", 1, "Keeper"],
      ["DC", 2, "A"],
      ["DC", 3, "B"],
      ["DC", 4, "C"],
      ["ML", 15, "Left Midfielder"],
      ["MC", 6, "D"],
      ["MC", 7, "E"],
      ["MR", 8, "Right Wing-back"],
      ["AMC", 9, "F"],
      ["AMC", 10, "G"],
      ["FW", 11, "H"],
    ]);
    const f = formationLineups("3-4-2-1", [wingBacks(1), wingBacks(2), wideMidfield])!;
    expect(f.starts).toBe(3);
    const midfield = f.lines[2];
    expect(midfield.map((s) => s.position)).toEqual(["DML", "MC", "MC", "DMR"]);
    expect(midfield[0].players.map((p) => [p.name, p.starts])).toEqual([
      ["Left Wing-back", 2],
      ["Left Midfielder", 1],
    ]);
    expect(midfield[3].players.map((p) => [p.name, p.starts])).toEqual([["Right Wing-back", 3]]);
  });

  it("a starter not linked to an FPL player is kept by his Understat name", () => {
    const f = formationLineups("4-2-3-1", [
      xi(1, [
        ["GK", null, "Unlinked Keeper"],
        ["DL", 2, "Left Back"],
        ["DC", 3, "CB 3"],
        ["DC", 4, "CB 4"],
        ["DR", 5, "Right Back"],
        ["DMC", 6, "Holder A"],
        ["DMC", 7, "Holder B"],
        ["AML", 8, "Left Winger"],
        ["AMC", 9, "Ten"],
        ["AMR", 10, "Right Winger"],
        ["FW", 11, "Striker 11"],
      ]),
    ])!;
    expect(f.lines[4][0].players).toEqual([{ code: null, name: "Unlinked Keeper", starts: 1 }]);
  });

  it("null for a formation the club never started in (used only after a change during a match)", () => {
    expect(formationLineups("5-4-1", lineups)).toBeNull();
  });
});
