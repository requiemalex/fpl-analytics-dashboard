import { describe, it, expect } from "vitest";
import { filterPlayers } from "./useFilteredPlayers";
import { DEFAULT_FILTERS, type GlobalScoutingFilters } from "./scoutingFilters";
import { makePlayer } from "../test/fixtures";

describe("filterPlayers — combination filtering", () => {
  const players = [
    makePlayer({ id: 1, name: "Salah", firstName: "Mohamed", lastName: "Salah", position: "MID", teamId: 1, minutes: 2000 }),
    makePlayer({ id: 2, name: "Haaland", firstName: "Erling", lastName: "Haaland", position: "FWD", teamId: 2, minutes: 1800 }),
    makePlayer({ id: 3, name: "Saka", firstName: "Bukayo", lastName: "Saka", position: "MID", teamId: 1, minutes: 100 }),
    makePlayer({ id: 4, name: "NoMinutes", firstName: "No", lastName: "Minutes", position: "MID", teamId: 1, minutes: null }),
  ];

  it("applies search, position, team, and minMinutes together (AND, not OR)", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, search: "", position: "MID", teamId: 1, minMinutes: 500 };
    const result = filterPlayers(players, filters);
    // Saka is MID+team1 but under 500 minutes -> excluded. NoMinutes has no minutes, which counts as 0 -> excluded too.
    expect(result.map((p) => p.id).sort()).toEqual([1]);
  });

  it("position ALL includes every position", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, position: "ALL" };
    const result = filterPlayers(players, filters);
    expect(result.map((p) => p.id).sort()).toEqual([1, 2, 3, 4]);
  });

  it("team ALL includes every team", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, teamId: "ALL" };
    const result = filterPlayers(players, filters);
    expect(result).toHaveLength(4);
  });

  it("search filters by name (fuzzy/accent-aware via matchesPlayerSearch)", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, search: "haaland" };
    const result = filterPlayers(players, filters);
    expect(result.map((p) => p.id)).toEqual([2]);
  });

  it("<no_data_is_zero>: a player with no minutes for the mode counts as 0 — out once a minimum is set, kept at the default 0", () => {
    expect(filterPlayers(players, { ...DEFAULT_FILTERS, minMinutes: 1000 }).map((p) => p.id)).not.toContain(4);
    expect(filterPlayers(players, { ...DEFAULT_FILTERS, minMinutes: 1 }).map((p) => p.id)).not.toContain(4);
    expect(filterPlayers(players, DEFAULT_FILTERS).map((p) => p.id)).toContain(4);
  });

  it("a real (non-null) minutes value strictly below the bar is excluded", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, minMinutes: 500 };
    const result = filterPlayers(players, filters);
    expect(result.map((p) => p.id)).not.toContain(3); // Saka, 100 minutes
  });

  it("minutes exactly equal to the bar is included (>= not >)", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, minMinutes: 1800 };
    const result = filterPlayers(players, filters);
    expect(result.map((p) => p.id)).toContain(2); // Haaland at exactly 1800
  });
});

describe("filterPlayers — live price range (minPrice/maxPrice)", () => {
  const players = [
    makePlayer({ id: 1, name: "Cheap", position: "MID", price: 4.5 }),
    makePlayer({ id: 2, name: "Mid", position: "MID", price: 8.0 }),
    makePlayer({ id: 3, name: "Expensive", position: "FWD", price: 15.0 }),
  ];

  it("null minPrice/maxPrice (the default) applies no price filtering at all", () => {
    const result = filterPlayers(players, DEFAULT_FILTERS);
    expect(result.map((p) => p.id).sort()).toEqual([1, 2, 3]);
  });

  it("minPrice excludes anyone strictly below it", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, minPrice: 5 };
    const result = filterPlayers(players, filters);
    expect(result.map((p) => p.id).sort()).toEqual([2, 3]);
  });

  it("maxPrice excludes anyone strictly above it", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, maxPrice: 10 };
    const result = filterPlayers(players, filters);
    expect(result.map((p) => p.id).sort()).toEqual([1, 2]);
  });

  it("minPrice and maxPrice together narrow to a band (e.g. “only the best £5m players”)", () => {
    const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, minPrice: 4, maxPrice: 5 };
    const result = filterPlayers(players, filters);
    expect(result.map((p) => p.id)).toEqual([1]);
  });

  it("a stored filters object that predates minPrice/maxPrice (undefined, not null) is treated as unset, not as a phantom filter", () => {
    const staleFilters = { ...DEFAULT_FILTERS } as GlobalScoutingFilters;
    // @ts-expect-error simulating an old localStorage payload from before these fields existed
    delete staleFilters.minPrice;
    // @ts-expect-error same as above
    delete staleFilters.maxPrice;
    const result = filterPlayers(players, staleFilters);
    expect(result.map((p) => p.id).sort()).toEqual([1, 2, 3]);
  });
});

describe("Min Minutes applies in Current Season like every other Data View (the owner's rule, 2026-10-19)", () => {
  const players = [
    makePlayer({ id: 1, name: "Regular", position: "MID", minutes: 360 }),
    makePlayer({ id: 2, name: "Bench", position: "MID", minutes: 45 }),
    makePlayer({ id: 3, name: "NoData", position: "MID", minutes: null }),
  ];
  const filters: GlobalScoutingFilters = { ...DEFAULT_FILTERS, minMinutes: 270 };

  it("drops players under the threshold, and a player with no data (counted as 0)", () => {
    const result = filterPlayers(players, filters);
    expect(result.map((p) => p.id)).toEqual([1]);
  });
});
