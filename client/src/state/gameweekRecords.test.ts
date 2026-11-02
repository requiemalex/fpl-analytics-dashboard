import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { recordPassedDeadlines, setGameweekDeadlines } from "./gameweekRecords";
import { loadSavedSquads, recordSavedSquadDeadlines, useSavedSquads } from "./useSavedSquads";
import { snapshotOf, type SavedSquad, type TransferWindow } from "../types/team";

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
    transfers: null,
    gameweekLog: [],
    importedFrom: null,
    ...o,
  };
}

/** A transfer window for `event` over the squad's own players, nothing made, no chip. */
function window(event: number, o: Partial<TransferWindow> = {}): TransferWindow {
  return { event, free: 1, made: 0, baseIds: [1, 2, 3], start: snapshotOf(squad()), chip: null, ...o };
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
    // GW8 was its first (unlimited, so untracked); GW9 it had its one free transfer, and made none.
    expect(out.gameweekLog).toEqual([
      { event: 8, playerIds: [1, 2, 3], startingXI: [1, 2], captainId: 1, viceCaptainId: 2 },
      { event: 9, playerIds: [1, 2, 3], startingXI: [1, 2], captainId: 1, viceCaptainId: 2, transfers: 0, transferCost: 0 },
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

describe("<squad_transfers> rolled on at each deadline", () => {
  const AFTER_GW9 = T("2026-11-02T00:00:00Z");
  const BEFORE_GW9 = T("2026-10-25T00:00:00Z");

  it("a squad built here has unlimited transfers until it plays a gameweek, then one a gameweek, banked", () => {
    const out = recordPassedDeadlines(squad(), AFTER_GW9);
    expect(out.transfers).toEqual(expect.objectContaining({ event: 10, free: 2, made: 0, baseIds: [1, 2, 3], chip: null }));
  });

  it("one that hasn't played its first gameweek keeps them unlimited", () => {
    const out = recordPassedDeadlines(squad({ startingXI: [], captainId: null, viceCaptainId: null, transfers: window(9, { free: null }), updatedAt: BEFORE_GW9 }), AFTER_GW9);
    expect(out.transfers).toEqual(expect.objectContaining({ event: 10, free: null }));
    expect(out.gameweekLog).toEqual([]);
  });

  it("counts the gameweek's transfers, confirmed and not, into its record, with 4 points for each past the free ones", () => {
    // One confirmed, and player 3 brought in since: two transfers on one free.
    const s = squad({ transfers: window(9, { made: 1, baseIds: [1, 2, 4] }), updatedAt: BEFORE_GW9 });
    const out = recordPassedDeadlines(s, AFTER_GW9);
    expect(out.gameweekLog).toEqual([expect.objectContaining({ event: 9, transfers: 2, transferCost: 4 })]);
    expect(out.transfers).toEqual(expect.objectContaining({ event: 10, free: 1, made: 0, baseIds: [1, 2, 3] }));
  });

  it("banks unused free transfers up to five", () => {
    const s = squad({ transfers: window(9, { free: 5 }), updatedAt: BEFORE_GW9 });
    expect(recordPassedDeadlines(s, AFTER_GW9).transfers?.free).toBe(5);
  });

  it("a Wildcard makes the gameweek's transfers free, spends the chip and keeps the bank as it was", () => {
    const s = squad({ transfers: window(9, { free: 2, baseIds: [4, 5, 6], chip: "wildcard" }), updatedAt: BEFORE_GW9 });
    const out = recordPassedDeadlines(s, AFTER_GW9);
    expect(out.gameweekLog).toEqual([expect.objectContaining({ event: 9, transfers: 3, transferCost: 0, chip: "wildcard" })]);
    expect(out.usedChips).toEqual([{ chip: "wildcard", event: 9 }]);
    expect(out.transfers?.free).toBe(2);
  });

  it("a Free Hit's squad plays its gameweek, then the squad goes back to how it was at the gameweek's start", () => {
    const start = snapshotOf({ playerIds: [7, 8], startingXI: [7], captainId: 7, viceCaptainId: null, purchasePrices: { 7: 5.5 } });
    const s = squad({ transfers: window(9, { free: 1, baseIds: [7, 8], start, chip: "freehit" }), updatedAt: BEFORE_GW9 });
    const out = recordPassedDeadlines(s, AFTER_GW9);
    expect(out.gameweekLog).toEqual([expect.objectContaining({ event: 9, playerIds: [1, 2, 3], transferCost: 0, chip: "freehit" })]);
    expect(out).toEqual(expect.objectContaining({ playerIds: [7, 8], startingXI: [7], captainId: 7, viceCaptainId: null, purchasePrices: { 7: 5.5 } }));
    expect(out.usedChips).toEqual([{ chip: "freehit", event: 9 }]);
    expect(out.transfers).toEqual(expect.objectContaining({ event: 10, free: 1, baseIds: [7, 8] }));
  });

  it("a window for a later gameweek waits for its own deadline", () => {
    const s = squad({ transfers: window(10, { free: 3 }), updatedAt: BEFORE_GW9 });
    const out = recordPassedDeadlines(s, AFTER_GW9);
    expect(out.transfers).toBe(s.transfers);
    expect(out.gameweekLog).toEqual([{ event: 9, playerIds: [1, 2, 3], startingXI: [1, 2], captainId: 1, viceCaptainId: 2 }]);
  });

  it("rolls each deadline once: a load after it changes nothing", () => {
    const once = recordPassedDeadlines(squad(), AFTER_GW9);
    expect(recordPassedDeadlines(once, AFTER_GW9)).toBe(once);
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

  it("a change made to a copy read before a deadline keeps the transfers that deadline rolled on", () => {
    setGameweekDeadlines([
      { id: 8, deadlineTime: GW8 },
      { id: 9, deadlineTime: GW9 },
      { id: 10, deadlineTime: "2099-01-01T00:00:00Z" },
    ]);
    const stale = squad({ transfers: window(9, { free: 1 }), updatedAt: T("2026-10-25T00:00:00Z") });
    localStorage.setItem("fpl-dashboard:saved-squads:v1", JSON.stringify({ version: 6, data: [stale] }));
    const { result } = renderHook(() => useSavedSquads());
    act(() => result.current.upsert({ ...stale, startingXI: [2, 3], captainId: 2 }));
    const [stored] = result.current.squads;
    expect(stored.startingXI).toEqual([2, 3]);
    expect(stored.transfers).toEqual(expect.objectContaining({ event: 10, free: 2 }));
    expect(stored.gameweekLog.map((r) => r.event)).toEqual([9]);
  });

  it("a squad saved before version 6 loads with no transfers kept, its records and chips checked", () => {
    const { transfers: _, ...v5 } = squad({
      usedChips: [{ chip: "3xc", event: 4 }, { chip: "nonsense", event: 2 } as never, { chip: "bboost", event: null, half: 1 }],
      gameweekLog: [{ event: 8, playerIds: [1, 2], startingXI: [1], captainId: 1, viceCaptainId: null, transfers: 1, transferCost: 4, chip: "bboost" }],
    });
    localStorage.setItem("fpl-dashboard:saved-squads:v1", JSON.stringify({ version: 5, data: [v5] }));
    const [loaded] = loadSavedSquads();
    expect(loaded.transfers).toBeNull();
    expect(loaded.usedChips).toEqual([{ chip: "3xc", event: 4 }, { chip: "bboost", event: null, half: 1 }]);
    expect(loaded.gameweekLog[0]).toEqual(expect.objectContaining({ transfers: 1, transferCost: 4, chip: "bboost" }));
  });

  it("keeps a version-6 squad's transfers as saved", () => {
    const saved = squad({ transfers: window(10, { free: 3, made: 1, chip: "3xc" }) });
    localStorage.setItem("fpl-dashboard:saved-squads:v1", JSON.stringify({ version: 6, data: [saved] }));
    expect(loadSavedSquads()[0].transfers).toEqual(saved.transfers);
  });

  it("a squad saved before version 5 loads with no records", () => {
    const { gameweekLog: _, ...v4 } = squad();
    localStorage.setItem("fpl-dashboard:saved-squads:v1", JSON.stringify({ version: 4, data: [v4] }));
    expect(loadSavedSquads()[0].gameweekLog).toEqual([]);
  });
});
