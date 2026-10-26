import { describe, expect, it } from "vitest";
import { normalizeEntryImport } from "./normalizeEntryImport";
import { makePlayer } from "../test/fixtures";
import type { RawEntryHistory, RawEntryPicks, RawEntryTeam } from "../types/raw";

const team: RawEntryTeam = { id: 1, name: "Solio Moose", player_first_name: "A", player_last_name: "Manager", current_event: 7 };
// 15 players priced £6.8m (£102.0m), as a squad whose players have risen since GW1 would be.
const live = new Map(Array.from({ length: 15 }, (_, i) => [i + 1, makePlayer({ id: i + 1, position: "MID", price: 6.8 })]));
const picks: RawEntryPicks = { picks: Array.from({ length: 15 }, (_, i) => ({ element: i + 1, position: i + 1 })) };
const history = (bank: number | undefined): RawEntryHistory => ({ current: [{ event: 7, bank, value: 1018 }], chips: [] });

describe("<imported_budget> an imported squad's budget", () => {
  it("is its players at today's prices plus the bank, so an unchanged import has exactly the bank left", () => {
    const { squad } = normalizeEntryImport(team, history(1), picks, 7, live);
    expect(squad.importedFrom?.bank).toBe(0.1);
    expect(squad.importedFrom?.budget).toBe(102.1);
  });

  it("is unknown (so the £100m applies) without the bank", () => {
    expect(normalizeEntryImport(team, history(undefined), picks, 7, live).squad.importedFrom?.budget).toBeNull();
  });

  it("is unknown when a pick isn't a current player, rather than a total missing his price", () => {
    const withLeaver: RawEntryPicks = { picks: [...picks.picks!.slice(0, 14), { element: 999, position: 15 }] };
    expect(normalizeEntryImport(team, history(1), withLeaver, 7, live).squad.importedFrom?.budget).toBeNull();
  });
});

describe("<purchase_prices> an imported squad's purchase prices", () => {
  // Every player £6.8m now, up £0.5m since the season started at £6.3m.
  const risen = new Map(Array.from({ length: 16 }, (_, i) => [i + 1, makePlayer({ id: i + 1, position: "MID", price: 6.8, costChangeStart: 0.5 })]));
  const gw1 = (bank: number): RawEntryHistory => ({ current: [{ event: 1, bank }, { event: 7, bank: 1, value: 1018 }], chips: [] });
  const startPicks: RawEntryPicks = { picks: [16, ...Array.from({ length: 14 }, (_, i) => i + 2)].map((element, i) => ({ element, position: i + 1 })) };
  // Player 1 replaced 16 in GW4, bought for £6.5m.
  const transfers = [{ element_in: 1, element_in_cost: 65, element_out: 16, element_out_cost: 63, event: 4, time: "2026-09-10T10:00:00Z" }];
  const startedGw1: RawEntryTeam = { ...team, started_event: 1 };

  it("come from its transfers and, for a team that started in GW1, its season-start prices", () => {
    // 15 × £6.3m = £94.5m spent, £5.5m in the bank.
    const { squad } = normalizeEntryImport(startedGw1, gw1(55), picks, 7, risen, { transfers, startPicks });
    expect(squad.purchasePrices[1]).toBe(6.5);
    expect(squad.purchasePrices[2]).toBe(6.3);
    expect(Object.keys(squad.purchasePrices)).toHaveLength(15);
  });

  it("are none without its transfers", () => {
    expect(normalizeEntryImport(startedGw1, gw1(55), picks, 7, risen).squad.purchasePrices).toEqual({});
  });
});
