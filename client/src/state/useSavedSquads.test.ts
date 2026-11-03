import { describe, expect, it } from "vitest";
import { loadSavedSquads, normalizeSavedSquad, recordSavedSquadDeadlines } from "./useSavedSquads";
import { squadBudget } from "../types/team";

const base = { id: "squad-1", name: "Mine", createdAt: 1, updatedAt: 1, playerIds: [1, 2], startingXI: [1], captainId: 1, viceCaptainId: null, usedChips: [] };

describe("saved squads: an import's budget (<imported_budget>, store version 2)", () => {
  it("a version-1 import has no budget, so the £100m it always had still applies", () => {
    const v1 = normalizeSavedSquad({ ...base, importedFrom: { teamId: 7, teamName: "T", managerName: "M", asOfEvent: 7, bank: 0.1 } });
    expect(v1?.importedFrom).toEqual({ teamId: 7, teamName: "T", managerName: "M", asOfEvent: 7, bank: 0.1, budget: null, playerIds: null, purchasePrices: null });
    expect(squadBudget(v1)).toBe(100);
  });

  it("keeps a saved budget, and a squad built from scratch has £100m", () => {
    const v2 = normalizeSavedSquad({ ...base, importedFrom: { teamId: 7, teamName: "T", managerName: "M", asOfEvent: 7, bank: 0.1, budget: 102.1 } });
    expect(squadBudget(v2)).toBe(102.1);
    expect(squadBudget(normalizeSavedSquad({ ...base, importedFrom: null }))).toBe(100);
  });

  it("a damaged import record loads without it, never with a bad budget", () => {
    expect(normalizeSavedSquad({ ...base, importedFrom: { teamId: "x", budget: "lots" } })?.importedFrom).toBeNull();
    expect(normalizeSavedSquad({ ...base, importedFrom: { teamId: 7, budget: "lots", bank: Infinity } })?.importedFrom).toMatchObject({ budget: null, bank: null });
  });
});

describe("saved squads: purchase prices (<purchase_prices>, store version 3)", () => {
  it("a squad saved before they were kept has none, so its purchase and selling prices show —", () => {
    expect(normalizeSavedSquad({ ...base, importedFrom: null })?.purchasePrices).toEqual({});
  });

  it("keeps a real price for each squad player, and drops one for a player not in the squad or a damaged one", () => {
    const squad = normalizeSavedSquad({ ...base, importedFrom: null, purchasePrices: { 1: 7.4, 2: "lots", 3: 5.5, 4: -1 } });
    expect(squad?.purchasePrices).toEqual({ 1: 7.4 });
  });
});

describe("saved squads: an import's players and purchase prices (<imported_budget>, store version 4)", () => {
  it("an import saved before them has neither, so Team Building loads them from FPL", () => {
    expect(normalizeSavedSquad({ ...base, importedFrom: { teamId: 7, bank: 0.1, budget: 100.1 } })?.importedFrom).toMatchObject({ playerIds: null, purchasePrices: null });
  });

  it("keeps them, a purchase price only for a player it was imported with", () => {
    const squad = normalizeSavedSquad({ ...base, importedFrom: { teamId: 7, bank: 0.1, budget: 100.1, playerIds: [1, 2, 9], purchasePrices: { 1: 7.4, 3: 5 } } });
    expect(squad?.importedFrom).toMatchObject({ playerIds: [1, 2, 9], purchasePrices: { 1: 7.4 } });
  });
});

describe("saved squads: a chip marked used by hand before halves were kept (<squad_chips>, audit 2026-11-03 L9)", () => {
  const chips = [{ chip: "wildcard", event: 3 }, { chip: "bboost", event: null }];

  it("keeps it from an unversioned or version-5 squad, as it was saved", () => {
    for (const version of [null, 5]) {
      expect(normalizeSavedSquad({ ...base, usedChips: chips }, version)?.usedChips).toEqual([{ chip: "wildcard", event: 3 }, { chip: "bboost", event: null }]);
    }
  });

  it("from version 6 on, keeps one with a half and drops one with neither a gameweek nor a half", () => {
    expect(normalizeSavedSquad({ ...base, usedChips: [...chips, { chip: "3xc", event: null, half: 2 }] }, 6)?.usedChips).toEqual([{ chip: "wildcard", event: 3 }, { chip: "3xc", event: null, half: 2 }]);
  });

  it("reaches the store: an unversioned saved squad loads with the chip", () => {
    localStorage.setItem("fpl-dashboard:saved-squads:v1", JSON.stringify([{ ...base, usedChips: chips }]));
    expect(loadSavedSquads()[0].usedChips).toEqual([{ chip: "wildcard", event: 3 }, { chip: "bboost", event: null }]);
    localStorage.clear();
  });

  // Audit 2026-11-03 phase 3 R1: every live load runs recordSavedSquadDeadlines,
  // which writes the store back at version 6 with the chip still half-less, so
  // the next read (Team Building's) drops it. Remove `.fails` once fixed.
  it.fails("survives the app's first live load: a version-5 chip is still there after the deadline record writes the store back", () => {
    localStorage.setItem("fpl-dashboard:saved-squads:v1", JSON.stringify({ version: 5, data: [{ ...base, usedChips: chips }] }));
    recordSavedSquadDeadlines();
    expect(loadSavedSquads()[0].usedChips).toEqual([{ chip: "wildcard", event: 3 }, { chip: "bboost", event: null }]);
    localStorage.clear();
  });
});
