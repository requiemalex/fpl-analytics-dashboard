import { describe, it, expect } from "vitest";
import { filterPlayers, effectiveMinMinutes } from "./useFilteredPlayers";
import { DEFAULT_FILTERS, type GlobalScoutingFilters } from "./scoutingFilters";
import { makePlayer } from "../test/fixtures";

describe("effectiveMinMinutes", () => {
  it("returns 0 (no filtering) in live mode regardless of the user's setting — a fixed bar would empty the pool pre-season", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, minMinutes: 450 };
    expect(effectiveMinMinutes(filters, "live")).toBe(0);
  });

  it("returns the user's actual setting in lastSeason/historicAverage mode", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, minMinutes: 450 };
    expect(effectiveMinMinutes(filters, "lastSeason")).toBe(450);
    expect(effectiveMinMinutes(filters, "historicAverage")).toBe(450);
  });
});

describe("filterPlayers — combination filtering", () => {
  const players = [
    makePlayer({ id: 1, name: "Salah", firstName: "Mohamed", lastName: "Salah", position: "MID", teamId: 1, minutes: 2000 }),
    makePlayer({ id: 2, name: "Haaland", firstName: "Erling", lastName: "Haaland", position: "FWD", teamId: 2, minutes: 1800 }),
    makePlayer({ id: 3, name: "Saka", firstName: "Bukayo", lastName: "Saka", position: "MID", teamId: 1, minutes: 100 }),
    makePlayer({ id: 4, name: "NoMinutes", firstName: "No", lastName: "Minutes", position: "MID", teamId: 1, minutes: null }),
  ];

  it("applies search, position, team, and minMinutes together (AND, not OR)", () => {
    const filters: GlobalScoutingFilters = { search: "", position: "MID", teamId: 1, minMinutes: 500 };
    const result = filterPlayers(players, filters, "lastSeason");
    // Saka is MID+team1 but under 500 minutes -> excluded. NoMinutes has null minutes -> retained.
    expect(result.map((p) => p.id).sort()).toEqual([1, 4]);
  });

  it("position ALL includes every position", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, position: "ALL" };
    const result = filterPlayers(players, filters, "lastSeason");
    expect(result.map((p) => p.id).sort()).toEqual([1, 2, 3, 4]);
  });

  it("team ALL includes every team", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, teamId: "ALL" };
    const result = filterPlayers(players, filters, "lastSeason");
    expect(result).toHaveLength(4);
  });

  it("search filters by name (fuzzy/accent-aware via matchesPlayerSearch)", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, search: "haaland" };
    const result = filterPlayers(players, filters, "lastSeason");
    expect(result.map((p) => p.id)).toEqual([2]);
  });

  it("null-safe sorting/filtering: a player with null minutes is retained, not treated as a noisy small sample or dropped", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, minMinutes: 1000 };
    const result = filterPlayers(players, filters, "lastSeason");
    expect(result.map((p) => p.id)).toContain(4);
  });

  it("live mode ignores minMinutes entirely (effectiveMinMinutes returns 0), keeping every player regardless of minutes", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, minMinutes: 1000 };
    const result = filterPlayers(players, filters, "live");
    expect(result).toHaveLength(4);
  });

  it("a real (non-null) minutes value strictly below the bar is excluded", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, minMinutes: 500 };
    const result = filterPlayers(players, filters, "lastSeason");
    expect(result.map((p) => p.id)).not.toContain(3); // Saka, 100 minutes
  });

  it("minutes exactly equal to the bar is included (>= not >)", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, minMinutes: 1800 };
    const result = filterPlayers(players, filters, "lastSeason");
    expect(result.map((p) => p.id)).toContain(2); // Haaland at exactly 1800
  });
});
