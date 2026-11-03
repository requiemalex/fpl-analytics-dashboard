import { describe, expect, it } from "vitest";
import {
  chipStatuses,
  confirmTransfers,
  freeTransfersFromHistory,
  nextFreeTransfers,
  pendingTransfers,
  playChip,
  resetDraft,
  resetDraftBlocker,
  startSnapshot,
  setFreeTransfers,
  transferStanding,
} from "./squadTransfers";
import { createBlankSquad, snapshotOf, type SavedSquad, type TransferWindow } from "../types/team";
import type { ChipWindow } from "../types/normalized";
import { squadMoney } from "./squadPrices";
import type { RawEntryHistory } from "../types/raw";

// <squad_transfers>, <squad_chips>

function squad(playerIds: number[], transfers: Partial<TransferWindow> | null): SavedSquad {
  const s = { ...createBlankSquad("Draft"), playerIds, startingXI: playerIds.slice(0, 1) };
  return { ...s, transfers: transfers === null ? null : { event: 10, free: 1, made: 0, baseIds: [1, 2, 3], start: snapshotOf(s), chip: null, ...transfers } };
}

describe("transferStanding", () => {
  it("counts the players brought in since the base as pending, on top of those confirmed", () => {
    const s = squad([1, 2, 4], { free: 2, made: 1 });
    expect(pendingTransfers(s, s.transfers!)).toEqual({ inIds: [4], outIds: [3] });
    expect(transferStanding(s, 10)).toEqual(expect.objectContaining({ count: 2, left: 0, extra: 0, cost: 0 }));
  });

  it("costs 4 points for each transfer past the free ones", () => {
    const s = squad([1, 5, 6], { free: 1 });
    expect(transferStanding(s, 10)).toEqual(expect.objectContaining({ count: 2, left: 0, extra: 1, cost: 4 }));
  });

  it("is unlimited in a squad's first gameweek, and under a Wildcard or Free Hit", () => {
    expect(transferStanding(squad([1, 5, 6], null), 10)).toEqual(expect.objectContaining({ free: null, freeBecause: "first", cost: 0 }));
    expect(transferStanding(squad([1, 5, 6], { free: null }), 10)).toEqual(expect.objectContaining({ free: null, freeBecause: "first", cost: 0 }));
    expect(transferStanding(squad([1, 5, 6], { free: 0, chip: "wildcard" }), 10)).toEqual(expect.objectContaining({ free: null, freeBecause: "wildcard", cost: 0, count: 2 }));
    expect(transferStanding(squad([1, 5, 6], { free: 0, chip: "freehit" }), 10)).toEqual(expect.objectContaining({ freeBecause: "freehit", cost: 0 }));
  });

  it("isn't known for another gameweek's window, or with none left", () => {
    expect(transferStanding(squad([1, 2, 3], { event: 9 }), 10)).toBeNull();
    expect(transferStanding(squad([1, 2, 3], {}), null)).toBeNull();
  });
});

describe("nextFreeTransfers", () => {
  it("one after a first gameweek, those left plus one up to five, the bank kept under a Wildcard or Free Hit", () => {
    expect(nextFreeTransfers(null, 9, null)).toBe(1);
    expect(nextFreeTransfers(2, 0, null)).toBe(3);
    expect(nextFreeTransfers(2, 1, null)).toBe(2);
    expect(nextFreeTransfers(1, 3, null)).toBe(1);
    expect(nextFreeTransfers(5, 0, null)).toBe(5);
    expect(nextFreeTransfers(2, 6, "wildcard")).toBe(2);
    expect(nextFreeTransfers(4, 0, "freehit")).toBe(4);
    expect(nextFreeTransfers(1, 0, "bboost")).toBe(2);
  });
});

describe("freeTransfersFromHistory", () => {
  const row = (event: number, transfers = 0, cost = 0) => ({ event, event_transfers: transfers, event_transfers_cost: cost });

  it("plays FPL's rules through a real team's history (checked live 2026-11-02: a public team's GW1–9)", () => {
    // Bench Boost GW1, Wildcard GW3, Triple Captain GW4; 1, 2, 3 and 1 transfers in GW5, 7, 8 and 9, no hits.
    const history: RawEntryHistory = {
      current: [row(1), row(2), row(3), row(4), row(5, 1), row(6), row(7, 2), row(8, 3), row(9, 1)],
      chips: [
        { name: "bboost", event: 1 },
        { name: "wildcard", event: 3 },
        { name: "3xc", event: 4 },
      ],
    };
    expect(freeTransfersFromHistory(history)).toBe(1);
  });

  it("is unlimited before a team's first gameweek, and one after it", () => {
    expect(freeTransfersFromHistory({ current: [], chips: [] })).toBeNull();
    expect(freeTransfersFromHistory({ current: [row(6, 9)], chips: [] })).toBe(1);
  });

  it("is corrected by what the history says: a hit, or more transfers than counted with none", () => {
    // Two banked by GW4; a hit in GW4 says it had only one free (5 transfers, −16).
    expect(freeTransfersFromHistory({ current: [row(1), row(2), row(3), row(4, 5, 16)], chips: [] })).toBe(1);
    // Three free transfers used in GW2 with no hit: at least three were free (one FPL gave everyone, say).
    expect(freeTransfersFromHistory({ current: [row(1), row(2, 3), row(3)], chips: [] })).toBe(2);
  });
});

describe("confirm, set and play", () => {
  it("confirming counts the pending transfers as made and starts again from the squad as it stands", () => {
    const out = confirmTransfers(squad([1, 2, 4], { free: 2 }));
    expect(out.transfers).toEqual(expect.objectContaining({ made: 1, baseIds: [1, 2, 4] }));
    // Undoing a confirmed transfer is another one, as in FPL.
    expect(transferStanding({ ...out, playerIds: [1, 2, 3] }, 10)).toEqual(expect.objectContaining({ count: 2 }));
    const none = squad([1, 2, 3], {});
    expect(confirmTransfers(none)).toBe(none);
  });

  it("setting the free transfers starts tracking from the squad as it stands, keeping the gameweek's chip", () => {
    const out = setFreeTransfers(squad([1, 5, 6], { free: 1, made: 2, chip: "bboost" }), 10, 3);
    expect(out.transfers).toEqual(expect.objectContaining({ event: 10, free: 3, made: 0, baseIds: [1, 5, 6], chip: "bboost" }));
    expect(setFreeTransfers(squad([1], null), 10, null).transfers?.free).toBeNull();
  });

  it("playing a chip opens a window for a squad without one, its transfers still unlimited", () => {
    const out = playChip(squad([1, 2], null), 10, "3xc");
    expect(out.transfers).toEqual(expect.objectContaining({ event: 10, free: null, chip: "3xc" }));
    expect(playChip(out, 10, null).transfers?.chip).toBeNull();
  });
});

describe("<reset_draft> resetDraft", () => {
  const atDeadline = { playerIds: [1, 2, 3], startingXI: [1, 2], captainId: 1, viceCaptainId: 2, purchasePrices: { 1: 5, 2: 6, 3: 7 } };
  const changed = (made: number): SavedSquad => ({
    ...createBlankSquad("Draft"),
    playerIds: [1, 4, 5],
    startingXI: [4],
    captainId: 4,
    viceCaptainId: null,
    purchasePrices: { 1: 5, 4: 8, 5: 9 },
    transfers: { event: 10, free: 1, made, baseIds: [1, 4, 3], start: atDeadline, chip: "bboost" },
  });

  it("puts back the squad as it was at the deadline, undoing confirmed and pending transfers, the chip kept", () => {
    const out = resetDraft(changed(1));
    expect(snapshotOf(out)).toEqual(atDeadline);
    expect(out.transfers).toEqual(expect.objectContaining({ made: 0, baseIds: [1, 2, 3], chip: "bboost", free: 1 }));
    expect(transferStanding(out, 10)).toEqual(expect.objectContaining({ count: 0, cost: 0 }));
  });

  it("can run only once the squad has a deadline's squad to go back to, and has changed since", () => {
    expect(resetDraftBlocker(changed(0), 10)).toBeNull();
    expect(resetDraftBlocker(changed(0), 11)).toMatch(/nothing to go back to/);
    expect(resetDraftBlocker(resetDraft(changed(1)), 10)).toMatch(/already as it was/);
    // A confirmed transfer undone by hand is still a change: Reset puts its count back to 0.
    expect(resetDraftBlocker({ ...resetDraft(changed(0)), transfers: { ...changed(1).transfers!, baseIds: [1, 2, 3] }, ...atDeadline }, 10)).toBeNull();
    // A squad built here before its first deadline: every transfer free, nothing kept yet.
    expect(resetDraftBlocker(squad([1, 2], null), 10)).toMatch(/nothing to go back to/);
    expect(resetDraftBlocker(playChip(squad([1, 2], null), 10, "3xc"), 10)).toMatch(/nothing to go back to/);
  });
});

describe("<reset_draft> an import's purchase prices", () => {
  // Imported with £1.0m in the bank: player 1 bought at £6.0m, now £8.0m (sells for £7.0m); 2 and 3 unchanged at £5.0m.
  const today: Record<number, number> = { 1: 8, 2: 5, 3: 5, 4: 4.5 };
  const bought = { 1: 6, 2: 5, 3: 5 };
  const imported = (startPrices: Record<number, number>): SavedSquad => ({
    ...createBlankSquad("Import"),
    playerIds: [1, 2, 3],
    startingXI: [1, 2],
    captainId: 1,
    viceCaptainId: 2,
    purchasePrices: { ...bought },
    // An import saved before 2026-11-03: its window's start was taken before its prices loaded.
    transfers: { event: 10, free: 1, made: 0, baseIds: [1, 2, 3], start: { playerIds: [1, 2, 3], startingXI: [1, 2], captainId: 1, viceCaptainId: 2, purchasePrices: startPrices }, chip: null },
    importedFrom: { teamId: 7, teamName: "T", managerName: "M", asOfEvent: 9, bank: 1, budget: null, playerIds: [1, 2, 3], purchasePrices: { ...bought } },
  });
  const bank = (s: SavedSquad) => {
    const money = squadMoney(s, (id) => today[id]);
    const spent = s.playerIds.reduce((sum, id) => sum + money.cost({ id, price: today[id] }), 0);
    return Math.round((money.budget - spent) * 10) / 10;
  };

  it("removing a risen player and resetting gives back the bank FPL shows, not today's price for him", () => {
    const s = imported({});
    expect(bank(s)).toBe(1);
    const sold = { ...s, playerIds: [2, 3, 4], startingXI: [2], captainId: 2, viceCaptainId: null, purchasePrices: { 2: 5, 3: 5, 4: 4.5 } };
    const reset = resetDraft(sold);
    expect(reset.purchasePrices).toEqual(bought);
    expect(bank(reset)).toBe(1);
  });

  it("a player sold and bought back is a change Reset can undo (he'd cost today's price)", () => {
    const s = imported({ ...bought });
    expect(resetDraftBlocker(s, 10)).toMatch(/already as it was/);
    const rebought = { ...s, purchasePrices: { ...bought, 1: 8 } };
    expect(bank(rebought)).toBe(0);
    expect(resetDraftBlocker(rebought, 10)).toBeNull();
    expect(bank(resetDraft(rebought))).toBe(1);
  });

  it("fills only what the snapshot lacks, from FPL's own prices", () => {
    expect(startSnapshot(imported({ 2: 5 }))!.purchasePrices).toEqual(bought);
    const complete = imported({ ...bought });
    expect(startSnapshot(complete)).toBe(complete.transfers!.start);
  });
});

describe("chipStatuses", () => {
  const windows: ChipWindow[] = [
    { chip: "wildcard", half: 1, startEvent: 2, stopEvent: 19 },
    { chip: "freehit", half: 1, startEvent: 2, stopEvent: 19 },
    { chip: "bboost", half: 1, startEvent: 1, stopEvent: 19 },
    { chip: "3xc", half: 1, startEvent: 1, stopEvent: 19 },
    { chip: "wildcard", half: 2, startEvent: 20, stopEvent: 38 },
  ];
  const byChip = (list: ReturnType<typeof chipStatuses>) => Object.fromEntries(list.map((c) => [c.chip, c]));

  it("one of each chip per half: one played in it, or marked used for it by hand, is spent", () => {
    const s = byChip(chipStatuses([{ chip: "wildcard", event: 3 }, { chip: "bboost", event: null, half: 1 }], windows, 10, null));
    expect(s.wildcard.used).toEqual({ chip: "wildcard", event: 3 });
    expect(s.wildcard.blocked).toBe("Played in GW3");
    expect(s.bboost.blocked).toBe("Marked used this half of the season");
    expect(s["3xc"].blocked).toBeNull();
    // The second half's Wildcard is a new one.
    expect(byChip(chipStatuses([{ chip: "wildcard", event: 3 }], windows, 20, null)).wildcard.blocked).toBeNull();
  });

  it("one chip a gameweek, and no Free Hit the gameweek after one", () => {
    const s = byChip(chipStatuses([], windows, 10, "3xc"));
    expect(s["3xc"].playing).toBe(true);
    expect(s.bboost.blocked).toMatch(/one chip a gameweek/);
    // The first half's Free Hit in GW19 means no second-half one in GW20.
    const secondHalf: ChipWindow = { chip: "freehit", half: 2, startEvent: 20, stopEvent: 38 };
    expect(byChip(chipStatuses([{ chip: "freehit", event: 19 }], [...windows, secondHalf], 20, null)).freehit.blocked).toMatch(/two in a row/);
    expect(byChip(chipStatuses([{ chip: "freehit", event: 18 }], [...windows, secondHalf], 20, null)).freehit.blocked).toBeNull();
  });

  it("a chip with no window for the gameweek can't be played", () => {
    expect(byChip(chipStatuses([], windows, 1, null)).wildcard.blocked).toBe("Can't be played in GW1");
  });
});
