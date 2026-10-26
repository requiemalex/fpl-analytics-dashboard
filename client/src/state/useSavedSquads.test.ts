import { describe, expect, it } from "vitest";
import { normalizeSavedSquad } from "./useSavedSquads";
import { squadBudget } from "../types/team";

const base = { id: "squad-1", name: "Mine", createdAt: 1, updatedAt: 1, playerIds: [1, 2], startingXI: [1], captainId: 1, viceCaptainId: null, usedChips: [] };

describe("saved squads: an import's budget (<imported_budget>, store version 2)", () => {
  it("a version-1 import has no budget, so the £100m it always had still applies", () => {
    const v1 = normalizeSavedSquad({ ...base, importedFrom: { teamId: 7, teamName: "T", managerName: "M", asOfEvent: 7, bank: 0.1 } });
    expect(v1?.importedFrom).toEqual({ teamId: 7, teamName: "T", managerName: "M", asOfEvent: 7, bank: 0.1, budget: null });
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
