import { describe, it, expect } from "vitest";
import { scoreRecord, type LivePlayerGameweek } from "./gameweekScore";
import type { Position } from "../types/normalized";
import type { GameweekRecord } from "../types/team";

// <gameweek_log>: a recorded squad scored as FPL would.

// 1 GK; 2–5 DEF; 6–9 MID; 10–11 FWD (a 4-4-2), bench 12 GK, 13 DEF, 14 MID, 15 FWD.
const POS: Record<number, Position> = { 1: "GKP", 12: "GKP", 2: "DEF", 3: "DEF", 4: "DEF", 5: "DEF", 13: "DEF", 6: "MID", 7: "MID", 8: "MID", 9: "MID", 14: "MID", 10: "FWD", 11: "FWD", 15: "FWD" };
const positionOf = (id: number) => POS[id] ?? null;
const XI = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const record = (o: Partial<GameweekRecord> = {}): GameweekRecord => ({ event: 9, playerIds: [...XI, 12, 13, 14, 15], startingXI: XI, captainId: 10, viceCaptainId: 6, ...o });

/** Everyone played 90 and scored 2, except as given. */
function live(o: Record<number, Partial<LivePlayerGameweek>> = {}): Map<number, LivePlayerGameweek> {
  return new Map(Object.keys(POS).map((k) => [Number(k), { points: 2, minutes: 90, ...o[Number(k)] }]));
}

describe("scoreRecord", () => {
  it("adds the XI, the captain's counted twice, and the bench apart", () => {
    const s = scoreRecord(record(), live({ 10: { points: 10 } }), positionOf, true);
    expect(s.points).toBe(10 * 2 + 10 * 2);
    expect(s.captainId).toBe(10);
    expect(s.captainPoints).toBe(20);
    expect(s.benchPoints).toBe(8);
    expect(s.subs).toEqual([]);
  });

  it("brings on the first benched player who played and keeps the XI legal, a goalkeeper only for the goalkeeper", () => {
    const s = scoreRecord(record(), live({ 1: { minutes: 0, points: 0 }, 7: { minutes: 0, points: 0 }, 13: { minutes: 0, points: 0 } }), positionOf, true);
    // GK 12 for GK 1; MID 7 → DEF 13 didn't play, so MID 14.
    expect(s.subs).toEqual([
      { outId: 1, inId: 12 },
      { outId: 7, inId: 14 },
    ]);
    expect(s.points).toBe(11 * 2 + 2);
  });

  it("never breaks the formation's minimums: a defender out with three left needs a defender", () => {
    const threeAtBack = record({ startingXI: [1, 2, 3, 4, 6, 7, 8, 9, 14, 10, 11], playerIds: [1, 2, 3, 4, 6, 7, 8, 9, 14, 10, 11, 12, 5, 13, 15] });
    const s = scoreRecord(threeAtBack, live({ 2: { minutes: 0, points: 0 } }), positionOf, true);
    expect(s.subs).toEqual([{ outId: 2, inId: 5 }]);
  });

  it("doubles the vice-captain when the captain didn't play", () => {
    const s = scoreRecord(record(), live({ 10: { minutes: 0, points: 0 }, 6: { points: 7 } }), positionOf, true);
    expect(s.captainId).toBe(6);
    expect(s.captainPoints).toBe(14);
  });

  it("before the gameweek finishes: the XI as picked, the captain doubled, marked provisional", () => {
    const s = scoreRecord(record(), live({ 10: { minutes: 0, points: 0 }, 1: { minutes: 0, points: 0 } }), positionOf, false);
    expect(s.subs).toEqual([]);
    expect(s.captainId).toBe(10);
    expect(s.provisional).toBe(true);
    expect(s.points).toBe(9 * 2);
  });

  it("<squad_chips> Bench Boost scores all fifteen, no substitutions, nothing left on the bench", () => {
    const s = scoreRecord(record({ chip: "bboost" }), live({ 1: { minutes: 0, points: 0 }, 12: { points: 6 } }), positionOf, true);
    // 14 who played at 2 (the keeper 12 at 6), the captain's 2 again.
    expect(s.points).toBe(13 * 2 + 6 + 2);
    expect(s.benchPoints).toBe(0);
    expect(s.subs).toEqual([]);
  });

  it("<squad_chips> Triple Captain counts the captain three times", () => {
    const s = scoreRecord(record({ chip: "3xc" }), live({ 10: { points: 10 } }), positionOf, true);
    expect(s.points).toBe(10 * 2 + 10 * 3);
    expect(s.captainPoints).toBe(30);
  });

  it("a player missing from FPL's data counts as not having played", () => {
    const partial = live();
    partial.delete(11);
    const s = scoreRecord(record(), partial, positionOf, true);
    // The first benched outfielder who played, whatever his position, while the XI stays legal.
    expect(s.subs).toEqual([{ outId: 11, inId: 13 }]);
  });
});
