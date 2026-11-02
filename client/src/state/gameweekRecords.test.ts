import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { recordPassedDeadlines, setGameweekDeadlines } from "./gameweekRecords";
import { loadSavedSquads, recordSavedSquadDeadlines, useSavedSquads } from "./useSavedSquads";
import type { SavedSquad } from "../types/team";

// <gameweek_log>: a squad built in Scoutline, as it stood at each deadline.

const T = (iso: string) => Date.parse(iso);
const GW8 = "2026-10-23T17:30:00Z";
const GW9 = "2026-10-31T11:00:00Z";
const GW10 = "2026-11-06T18:30:00Z";

function squad(o: Partial<SavedSquad> = {}): SavedSquad {
  return {
    id: "s1",
    name: "Draft",
    createdAt: T("2026-10-20T00:00:00Z"),
    updatedAt: T("2026-10-22T00:00:00Z"),
    playerIds: [1, 2, 3],
    startingXI: [1, 2],
    captainId: 1,
    viceCaptainId: 2,
    purchasePrices: {},
    usedChips: [],
    gameweekLog: [],
    importedFrom: null,
    ...o,
  };
}

beforeEach(() => {
  localStorage.clear();
  setGameweekDeadlines([
    { id: 8, deadlineTime: GW8 },
    { id: 9, deadlineTime: GW9 },
    { id: 10, deadlineTime: GW10 },
  ]);
});

describe("recordPassedDeadlines", () => {
  it("records the squad as it stands for every deadline passed since it last changed", () => {
    const out = recordPassedDeadlines(squad(), T("2026-11-02T00:00:00Z"));
    expect(out.gameweekLog).toEqual([
      { event: 8, playerIds: [1, 2, 3], startingXI: [1, 2], captainId: 1, viceCaptainId: 2 },
      { event: 9, playerIds: [1, 2, 3], startingXI: [1, 2], captainId: 1, viceCaptainId: 2 },
    ]);
  });

  it("can't know a deadline that passed before its last change, or before it was made", () => {
    const changedAfterGw8 = squad({ updatedAt: T("2026-10-25T00:00:00Z") });
    expect(recordPassedDeadlines(changedAfterGw8, T("2026-11-02T00:00:00Z")).gameweekLog.map((r) => r.event)).toEqual([9]);
    const madeAfterGw9 = squad({ createdAt: T("2026-11-01T00:00:00Z"), updatedAt: T("2026-11-01T00:00:00Z") });
    expect(recordPassedDeadlines(madeAfterGw9, T("2026-11-02T00:00:00Z")).gameweekLog).toEqual([]);
  });

  it("leaves an import, an empty XI and an unknown last change alone, returning the same squad", () => {
    const now = T("2026-11-02T00:00:00Z");
    for (const s of [
      squad({ importedFrom: { teamId: 1, teamName: "", managerName: "", asOfEvent: 8, bank: 0, budget: null, playerIds: null, purchasePrices: null } }),
      squad({ startingXI: [], captainId: null, viceCaptainId: null }),
      squad({ updatedAt: 0 }),
    ]) {
      expect(recordPassedDeadlines(s, now)).toBe(s);
    }
  });

  it("keeps a deadline's record once made", () => {
    const first = recordPassedDeadlines(squad(), T("2026-11-02T00:00:00Z"));
    const changed = { ...first, startingXI: [1, 3], updatedAt: T("2026-11-03T00:00:00Z") };
    expect(recordPassedDeadlines(changed, T("2026-11-07T00:00:00Z")).gameweekLog.map((r) => [r.event, r.startingXI])).toEqual([
      [8, [1, 2]],
      [9, [1, 2]],
      [10, [1, 3]],
    ]);
  });
});

describe("the saved squads' store", () => {
  it("records on load without changing when the squad last changed", () => {
    localStorage.setItem("fpl-dashboard:saved-squads:v1", JSON.stringify({ version: 5, data: [squad()] }));
    recordSavedSquadDeadlines(T("2026-11-02T00:00:00Z"));
    const [stored] = loadSavedSquads();
    expect(stored.gameweekLog.map((r) => r.event)).toEqual([8, 9]);
    expect(stored.updatedAt).toBe(squad().updatedAt);
  });

  it("an edit records the squad as it was before it, for the deadlines passed since its last change", () => {
    // An edit records against the real clock, so only deadlines already long past.
    setGameweekDeadlines([
      { id: 8, deadlineTime: GW8 },
      { id: 9, deadlineTime: GW9 },
    ]);
    localStorage.setItem("fpl-dashboard:saved-squads:v1", JSON.stringify({ version: 5, data: [squad()] }));
    const { result } = renderHook(() => useSavedSquads());
    // A copy taken before the records were made (as Team Building's is) doesn't lose them.
    act(() => result.current.upsert({ ...squad(), startingXI: [2, 3], captainId: 2 }));
    const [stored] = result.current.squads;
    expect(stored.startingXI).toEqual([2, 3]);
    expect(stored.gameweekLog.map((r) => [r.event, r.startingXI])).toEqual([
      [8, [1, 2]],
      [9, [1, 2]],
    ]);
  });

  it("a squad saved before version 5 loads with no records", () => {
    const { gameweekLog: _, ...v4 } = squad();
    localStorage.setItem("fpl-dashboard:saved-squads:v1", JSON.stringify({ version: 4, data: [v4] }));
    expect(loadSavedSquads()[0].gameweekLog).toEqual([]);
  });
});
