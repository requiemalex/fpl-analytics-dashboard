import { describe, it, expect } from "vitest";
import { importedPurchasePrices, sellingPrice, squadMoney } from "./squadPrices";
import type { SavedSquad } from "../types/team";
import type { RawEntryTransfer } from "../types/raw";

describe("<selling_price> sellingPrice", () => {
  it("keeps half of a rise, rounded down to £0.1m", () => {
    expect(sellingPrice(7.4, 7.9)).toBe(7.6); // +0.5: half is 0.25, down to 0.2
    expect(sellingPrice(7.4, 7.8)).toBe(7.6);
    expect(sellingPrice(7.4, 7.5)).toBe(7.4); // +0.1: half rounds down to nothing
  });

  it("after a fall it's today's price, and unchanged it's the price paid", () => {
    expect(sellingPrice(7.4, 7.1)).toBe(7.1);
    expect(sellingPrice(7.4, 7.4)).toBe(7.4);
  });

  it("is unknown without a purchase price", () => {
    expect(sellingPrice(null, 7.4)).toBeNull();
    expect(sellingPrice(undefined, 7.4)).toBeNull();
  });
});

describe("<purchase_prices> importedPurchasePrices", () => {
  // 15 players: ids 1–15, all £5.0m at the season's start (now £5.5m, +£0.5m), and 16–17 bought later.
  const live = new Map(Array.from({ length: 17 }, (_, i) => [i + 1, { price: 5.5, costChangeStart: 0.5 }]));
  const startIds = Array.from({ length: 15 }, (_, i) => i + 1);
  const t = (event: number, out: number, inn: number, inCost: number, time: string): RawEntryTransfer => ({ element_in: inn, element_in_cost: inCost, element_out: out, element_out_cost: 50, event, time });
  const base = { eventId: 8, startedEvent: 1, startIds, startBankTenths: 250, transfers: [] as RawEntryTransfer[], freeHitEvents: [] as number[], livePlayersById: live };

  it("a player bought by transfer cost what the team paid; one it has had since GW1 his season-start price", () => {
    const prices = importedPurchasePrices({ ...base, squadIds: [16, ...startIds.slice(1)], transfers: [t(3, 1, 16, 62, "2026-09-01T10:00:00Z")] });
    expect(prices[16]).toBe(6.2);
    expect(prices[2]).toBe(5);
  });

  it("uses his latest purchase when he was bought more than once", () => {
    const transfers = [t(3, 1, 16, 62, "2026-09-01T10:00:00Z"), t(5, 16, 1, 50, "2026-09-15T10:00:00Z"), t(6, 2, 16, 66, "2026-09-25T10:00:00Z")];
    expect(importedPurchasePrices({ ...base, squadIds: [16], transfers })[16]).toBe(6.6);
  });

  it("ignores a Free Hit week's transfers (the squad goes back), unless the import is that week", () => {
    const transfers = [t(3, 1, 16, 62, "2026-09-01T10:00:00Z"), t(5, 16, 17, 70, "2026-09-15T10:00:00Z"), t(5, 2, 16, 64, "2026-09-15T10:01:00Z")];
    expect(importedPurchasePrices({ ...base, squadIds: [16], transfers, freeHitEvents: [5] })[16]).toBe(6.2);
    expect(importedPurchasePrices({ ...base, squadIds: [16, 17], eventId: 5, transfers, freeHitEvents: [5] })).toEqual({ 16: 6.4, 17: 7 });
  });

  it("ignores transfers for a later gameweek than the one imported", () => {
    expect(importedPurchasePrices({ ...base, squadIds: [1], transfers: [t(9, 2, 1, 70, "2026-10-26T10:00:00Z")] })[1]).toBe(5);
  });

  it("trusts season-start prices only when they add up to FPL's own bank that week", () => {
    // 15 × £5.0m = £75.0m, so £25.0m left: 250. Anything else and they're not what was paid.
    expect(importedPurchasePrices({ ...base, squadIds: [1], startBankTenths: 240 })).toEqual({});
    expect(importedPurchasePrices({ ...base, squadIds: [1], startBankTenths: null })).toEqual({});
  });

  it("a team that started after GW1 has no price for the players it started with, but still has its transfers'", () => {
    const prices = importedPurchasePrices({ ...base, squadIds: [16, 2], startedEvent: 6, transfers: [t(7, 1, 16, 62, "2026-10-01T10:00:00Z")] });
    expect(prices).toEqual({ 16: 6.2 });
  });

  describe("a team that started after GW1 (GW6)", () => {
    // Today all £5.5m (55). Each player's price in his matches, GW5 onwards.
    const steady = [5, 6, 7, 8].map((round) => ({ round, value: 55 }));
    const rose = [{ round: 5, value: 54 }, ...[6, 7, 8].map((round) => ({ round, value: 55 }))];
    const late = { ...base, startedEvent: 6, squadIds: startIds };

    it("a starting player whose price hasn't moved since before it joined cost today's price; one whose has, none", () => {
      const priceHistory = new Map(startIds.map((id) => [id, id <= 2 ? rose : steady]));
      const prices = importedPurchasePrices({ ...late, priceHistory });
      expect(prices[3]).toBe(5.5);
      expect(prices[1]).toBeUndefined();
      expect(prices[2]).toBeUndefined();
      expect(Object.keys(prices)).toHaveLength(13);
    });

    it("with only one left unknown, his is what the bank says the 15 cost less the others", () => {
      // 14 × £5.5m = £77.0m; £100m − £17.6m bank = £82.4m spent, so player 1 cost £5.4m.
      const priceHistory = new Map(startIds.map((id) => [id, id === 1 ? rose : steady]));
      expect(importedPurchasePrices({ ...late, priceHistory, startBankTenths: 176 })[1]).toBe(5.4);
    });

    it("needs a match from before it joined to tell", () => {
      const priceHistory = new Map(startIds.map((id) => [id, steady.filter((r) => r.round >= 6)]));
      expect(importedPurchasePrices({ ...late, priceHistory, startBankTenths: null })).toEqual({});
    });
  });
});

describe("<imported_budget> squadMoney", () => {
  // Bought 1 for £7.4m (now £7.9m: sells for £7.6m) and 2 for £5.0m (now £4.8m: sells for £4.8m); £0.5m in the bank.
  const live = new Map([
    [1, 7.9],
    [2, 4.8],
    [3, 6.0],
  ]);
  const imported = (over: Partial<NonNullable<SavedSquad["importedFrom"]>> = {}): NonNullable<SavedSquad["importedFrom"]> => ({
    teamId: 7,
    teamName: "T",
    managerName: "M",
    asOfEvent: 8,
    bank: 0.5,
    budget: 13.2,
    playerIds: [1, 2],
    purchasePrices: { 1: 7.4, 2: 5 },
    ...over,
  });
  const money = (squad: Pick<SavedSquad, "importedFrom" | "purchasePrices">) => squadMoney(squad, (id) => live.get(id));

  it("is the bank plus the imported players' selling prices, so an unchanged import has exactly its bank left", () => {
    const m = money({ importedFrom: imported(), purchasePrices: { 1: 7.4, 2: 5 } });
    expect(m.budget).toBe(12.9);
    expect(m.cost({ id: 1, price: 7.9 }) + m.cost({ id: 2, price: 4.8 })).toBeCloseTo(12.4, 9);
    expect(m.atSellingPrices).toBe(true);
  });

  it("selling an imported player frees his selling price; a player added costs today's price", () => {
    // 1 sold (£7.6m), 3 added at £6.0m.
    const m = money({ importedFrom: imported(), purchasePrices: { 2: 5, 3: 6 } });
    expect(12.9 - m.cost({ id: 2, price: 4.8 }) - m.cost({ id: 3, price: 6 })).toBeCloseTo(2.1, 9);
  });

  it("an imported player with no purchase price counts at today's price on both sides", () => {
    const m = money({ importedFrom: imported({ purchasePrices: { 2: 5 } }), purchasePrices: { 2: 5 } });
    expect(m.budget).toBe(13.2);
    expect(m.cost({ id: 1, price: 7.9 })).toBe(7.9);
  });

  it("falls back to the stored budget before its prices load, and to £100m for a squad built from scratch", () => {
    expect(money({ importedFrom: imported({ purchasePrices: null }), purchasePrices: {} })).toMatchObject({ budget: 13.2, atSellingPrices: false });
    expect(money({ importedFrom: null, purchasePrices: { 3: 6 } }).budget).toBe(100);
    expect(money({ importedFrom: null, purchasePrices: {} }).cost({ id: 3, price: 6 })).toBe(6);
  });
});
