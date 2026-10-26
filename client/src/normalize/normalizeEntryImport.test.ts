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

describe("<imported_budget> what an import keeps for its selling-price budget", () => {
  it("the players it was imported with, its purchase prices still to load", () => {
    const { squad } = normalizeEntryImport(team, history(1), picks, 7, live);
    expect(squad.importedFrom?.playerIds).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(squad.importedFrom?.purchasePrices).toBeNull();
    expect(squad.purchasePrices).toEqual({});
  });
});
