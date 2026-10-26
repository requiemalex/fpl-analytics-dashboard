import { describe, it, expect } from "vitest";
import { bestDraft, bestDraftBlocker, type DraftCandidate } from "./bestDraft";
import type { Position } from "../types/normalized";

let nextId = 1;
const p = (position: Position, points: number | null, playing = true): DraftCandidate => ({ id: nextId++, position, points, playing });

/** A full 15: 2 GKP, 5 DEF, 5 MID, 3 FWD, with these figures. */
function squad(figures: Record<Position, (number | null)[]>): DraftCandidate[] {
  nextId = 1;
  return (["GKP", "DEF", "MID", "FWD"] as Position[]).flatMap((pos) => figures[pos].map((f) => p(pos, f)));
}

const none = { startingXI: [], captainId: null, viceCaptainId: null };
const positions = (all: DraftCandidate[], ids: number[]) => {
  const counts: Record<string, number> = {};
  for (const id of ids) {
    const pos = all.find((c) => c.id === id)!.position;
    counts[pos] = (counts[pos] ?? 0) + 1;
  }
  return counts;
};

describe("<best_draft> bestDraft", () => {
  it("picks the legal formation with the most points: here 3-5-2, the defenders being the weakest", () => {
    const all = squad({ GKP: [5, 3], DEF: [4, 3.5, 3, 2, 1], MID: [7, 6, 5.5, 5, 4.5], FWD: [8, 6, 2] });
    const draft = bestDraft(all, none)!;
    expect(draft.startingXI).toHaveLength(11);
    expect(positions(all, draft.startingXI)).toEqual({ GKP: 1, DEF: 3, MID: 5, FWD: 2 });
    // The top forward (8) captains, the top midfielder (7) is vice.
    expect(all.find((c) => c.id === draft.captainId)!.points).toBe(8);
    expect(all.find((c) => c.id === draft.viceCaptainId)!.points).toBe(7);
  });

  it("never breaks FPL's formation rules, however strong one position is", () => {
    // Every forward and defender is strong, but only 3 forwards and 5 defenders can start; one goalkeeper only.
    const all = squad({ GKP: [9, 9], DEF: [8, 8, 8, 8, 8], MID: [1, 1, 1, 1, 1], FWD: [10, 10, 10] });
    const counts = positions(all, bestDraft(all, none)!.startingXI);
    expect(counts).toEqual({ GKP: 1, DEF: 5, MID: 2, FWD: 3 });
  });

  it("a blank is a real 0: a playing player outscores him", () => {
    const all = squad({ GKP: [5, 3], DEF: [4, 4, 4, 1, 1], MID: [5, 5, 5, 5, 5], FWD: [6, 6, 6] });
    // The first goalkeeper's club blanks.
    all[0].playing = false;
    const draft = bestDraft(all, none)!;
    expect(draft.startingXI).toContain(all[1].id);
    expect(draft.startingXI).not.toContain(all[0].id);
  });

  it("starts a player with no figure only when a legal XI needs him, and never gives him an armband", () => {
    const all = squad({ GKP: [null, 2], DEF: [3, 3, 3, 3, 3], MID: [4, 4, 4, 4, 4], FWD: [null, null, null] });
    const draft = bestDraft(all, none)!;
    // The goalkeeper with a figure starts; one forward must, though none has a figure.
    expect(draft.startingXI).toContain(all[1].id);
    expect(positions(all, draft.startingXI).FWD).toBe(1);
    const fwdIds = all.filter((c) => c.position === "FWD").map((c) => c.id);
    expect(fwdIds).not.toContain(draft.captainId);
    expect(fwdIds).not.toContain(draft.viceCaptainId);
  });

  it("ties keep the current arrangement: starters and armbands stay where they are", () => {
    const all = squad({ GKP: [4, 4], DEF: [3, 3, 3, 3, 3], MID: [3, 3, 3, 3, 3], FWD: [3, 3, 3] });
    const current = { startingXI: [2, 4, 5, 6, 7, 9, 10, 11, 13, 14, 15], captainId: 15, viceCaptainId: 2 };
    const draft = bestDraft(all, current)!;
    expect([...draft.startingXI].sort((a, b) => a - b)).toEqual(current.startingXI);
    // 4 is the top figure (the goalkeeper) and he's vice: the top figure still captains.
    expect(draft.captainId).toBe(2);
    expect(draft.viceCaptainId).toBe(15);
  });
});

describe("bestDraftBlocker", () => {
  it("needs enough players for a legal XI", () => {
    nextId = 1;
    expect(bestDraftBlocker([p("GKP", 1), p("DEF", 1)])).toMatch(/^Needs players for a legal starting XI/);
    // 11 players, but no forward.
    expect(bestDraftBlocker([p("GKP", 1), ...Array.from({ length: 5 }, () => p("DEF", 1)), ...Array.from({ length: 5 }, () => p("MID", 1))])).toMatch(/^Needs players/);
  });

  it("needs at least one figure for the gameweek", () => {
    const all = squad({ GKP: [null, null], DEF: [null, null, null, null, null], MID: [null, null, null, null, null], FWD: [null, null, null] });
    expect(bestDraftBlocker(all)).toBe("No player in the squad has a figure for this gameweek");
    expect(bestDraft(all, none)).toBeNull();
  });

  it("is null for a full squad with figures", () => {
    expect(bestDraftBlocker(squad({ GKP: [1, 1], DEF: [1, 1, 1, 1, 1], MID: [1, 1, 1, 1, 1], FWD: [1, 1, 1] }))).toBeNull();
  });
});
