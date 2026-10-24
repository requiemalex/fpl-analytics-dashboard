import { describe, expect, it } from "vitest";
import { fitsStartingXI, openSquadSlots, validateSquad } from "./squadRules";
import { budgetLeftText } from "../components/SquadPitch";
import { makePlayer } from "../test/fixtures";
import type { Position } from "../types/normalized";

let nextId = 1;
const players = (position: Position, n: number, price = 5) => Array.from({ length: n }, () => makePlayer({ id: nextId++, position, price }));

describe("<add_to_xi> fitsStartingXI", () => {
  it("starts players while the XI has a legal place", () => {
    expect(fitsStartingXI([], makePlayer({ id: 900, position: "FWD" }))).toBe(true);
    expect(fitsStartingXI(players("GKP", 1), makePlayer({ id: 901, position: "GKP" }))).toBe(false); // one goalkeeper starts
  });

  it("benches a player whose position is at its starting maximum", () => {
    expect(fitsStartingXI(players("FWD", 3), makePlayer({ id: 902, position: "FWD" }))).toBe(false);
    expect(fitsStartingXI(players("DEF", 5), makePlayer({ id: 903, position: "DEF" }))).toBe(false);
  });

  it("benches a player who would leave no room for the positions a formation still needs", () => {
    // 1 GKP + 5 MID + 3 FWD = 9: the last two places must be defenders (3 needed, so even one more MID is out).
    const xi = [...players("GKP", 1), ...players("MID", 4), ...players("FWD", 3)];
    expect(fitsStartingXI(xi, makePlayer({ id: 904, position: "MID" }))).toBe(false);
    expect(fitsStartingXI(xi, makePlayer({ id: 905, position: "DEF" }))).toBe(true);
  });

  it("never starts a twelfth player", () => {
    const xi = [...players("GKP", 1), ...players("DEF", 4), ...players("MID", 4), ...players("FWD", 2)];
    expect(xi).toHaveLength(11);
    expect(fitsStartingXI(xi, makePlayer({ id: 906, position: "DEF" }))).toBe(false);
  });
});

describe("<open_slots> openSquadSlots", () => {
  it("an empty squad shows a 4-4-2 and a bench of GKP, DEF, MID, FWD", () => {
    expect(openSquadSlots([], [])).toEqual({ pitch: { GKP: 1, DEF: 4, MID: 4, FWD: 2 }, bench: ["GKP", "DEF", "MID", "FWD"] });
  });

  it("fills around the starters: a 5-at-the-back XI keeps its back five and takes the rest from the 4-4-2", () => {
    const xi = [...players("GKP", 1), ...players("DEF", 5)];
    const slots = openSquadSlots(xi, xi);
    expect(slots.pitch).toEqual({ GKP: 0, DEF: 0, MID: 4, FWD: 1 });
    expect(slots.bench).toEqual(["GKP", "MID", "FWD", "FWD"]);
  });

  it("never offers a place the squad's composition is already full for", () => {
    const squad = [...players("GKP", 2), ...players("FWD", 3)];
    const xi = squad.filter((p, i) => i !== 1); // the second goalkeeper is on the bench
    const slots = openSquadSlots(squad, xi);
    expect(slots.pitch.GKP + slots.pitch.FWD).toBe(0);
    expect(slots.bench).not.toContain("GKP");
    expect(slots.pitch.DEF + slots.pitch.MID + slots.bench.length).toBe(10);
  });

  it("a full squad has no open places, wherever its players sit", () => {
    const squad = [...players("GKP", 2), ...players("DEF", 5), ...players("MID", 5), ...players("FWD", 3)];
    expect(openSquadSlots(squad, squad.slice(0, 9))).toEqual({ pitch: { GKP: 0, DEF: 0, MID: 0, FWD: 0 }, bench: [] });
  });
});

describe("<imported_budget> validateSquad's budget", () => {
  it("defaults to FPL's £100m and takes a squad's own budget when given", () => {
    const squad = players("MID", 15, 6.8); // £102.0m
    expect(validateSquad(squad).budgetOk).toBe(false);
    const own = validateSquad(squad, 102.1);
    expect(own.budget).toBe(102.1);
    expect(own.budgetOk).toBe(true);
    expect(own.budgetRemaining).toBeCloseTo(0.1, 6);
  });

  it("says how far over a budget is, never a negative amount left", () => {
    expect(budgetLeftText(-2.1)).toBe("£2.1m over");
    expect(budgetLeftText(0.1)).toBe("£0.1m left");
    expect(budgetLeftText(-0.0000001)).toBe("£0.0m left");
  });
});
