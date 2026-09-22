import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSummaryTiles, DEFAULT_SUMMARY_TILES } from "./useSummaryTiles";
import { DEFAULT_FILTERS } from "./scoutingFilters";

// This file's own STORAGE_KEY, from useSummaryTiles.ts. Not exported, but the
// key is part of this store's documented on-disk contract (localStorage is
// the actual system under test here), so hardcoding it is testing the real
// persistence contract, not an implementation internal.
const STORAGE_KEY = "fpl-dashboard:dashboard:summary-tiles:v1";

beforeEach(() => {
  localStorage.clear();
});

describe("useSummaryTiles — <update_safety> version 2 -> 3 migration", () => {
  it("with nothing in localStorage, starts from DEFAULT_SUMMARY_TILES", () => {
    const { result } = renderHook(() => useSummaryTiles());
    expect(result.current.tiles).toEqual(DEFAULT_SUMMARY_TILES);
  });

  it("migrates version-2 (pre name/criteria) tiles forward: player tiles get DEFAULT_FILTERS as criteria, team tiles get null", () => {
    const oldShapeTiles = [
      { id: "t1", scope: "player", metricKey: "totalPoints", direction: "desc", dataView: "lastSeason" },
      { id: "t2", scope: "team", metricKey: "points", direction: "desc", dataView: "lastSeason" },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, data: oldShapeTiles }));

    const { result } = renderHook(() => useSummaryTiles());

    expect(result.current.tiles).toHaveLength(2);
    const [playerTile, teamTile] = result.current.tiles;
    expect(playerTile.name).toBeNull();
    expect(playerTile.criteria).toEqual(DEFAULT_FILTERS);
    expect(teamTile.name).toBeNull();
    expect(teamTile.criteria).toBeNull();
  });

  it("migrates data with no envelope at all (pre-versioning, storedVersion null) the same way", () => {
    const oldShapeTiles = [{ id: "t1", scope: "player", metricKey: "xGI", direction: "desc", dataView: "lastSeason" }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oldShapeTiles)); // no {version,data} wrapper

    const { result } = renderHook(() => useSummaryTiles());
    expect(result.current.tiles).toHaveLength(1);
    expect(result.current.tiles[0].criteria).toEqual(DEFAULT_FILTERS);
  });

  it("leaves already-current-shape (v3) tiles' name/criteria fields untouched, only backfilling fields missing from criteria", () => {
    const currentShapeTiles = [
      {
        id: "t1",
        scope: "player",
        metricKey: "totalPoints",
        direction: "desc",
        dataView: "lastSeason",
        name: "My custom tile",
        criteria: { search: "salah", position: "MID", teamId: "ALL", minMinutes: 900 },
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, data: currentShapeTiles }));

    const { result } = renderHook(() => useSummaryTiles());
    expect(result.current.tiles[0].name).toBe("My custom tile");
    // minPrice/maxPrice didn't exist on this pre-v5 criteria object — backfilled to null (no-op), every other field preserved exactly.
    expect(result.current.tiles[0].criteria).toEqual({ search: "salah", position: "MID", teamId: "ALL", minMinutes: 900, minPrice: null, maxPrice: null });
  });

  it("falls back to defaults for genuinely unsalvageable data (not an array at all)", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, data: { not: "an array" } }));
    const { result } = renderHook(() => useSummaryTiles());
    expect(result.current.tiles).toEqual(DEFAULT_SUMMARY_TILES);
  });

  // M7 regression: a user who deliberately removes every tile must have that
  // choice respected on reload, not silently reverted to the packaged
  // defaults. Dashboard.tsx already renders a clean "No tiles yet" state for
  // this — matches useSavedSquads.ts's own handling of an empty array.
  it("preserves a genuinely empty tile list rather than reseeding DEFAULT_SUMMARY_TILES", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, data: [] }));
    const { result } = renderHook(() => useSummaryTiles());
    expect(result.current.tiles).toEqual([]);
  });

  it("preserves an empty tile list even from an unversioned/pre-envelope payload", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    const { result } = renderHook(() => useSummaryTiles());
    expect(result.current.tiles).toEqual([]);
  });
});

describe("useSummaryTiles — <update_safety> version 3 -> 4 migration (playerIds/teamIds)", () => {
  it("migrates version-3 (pre playerIds/teamIds) tiles forward: both backfill to null, preserving existing filter-based behaviour", () => {
    const v3ShapeTiles = [
      { id: "t1", scope: "player", metricKey: "totalPoints", direction: "desc", dataView: "lastSeason", name: null, criteria: DEFAULT_FILTERS },
      { id: "t2", scope: "team", metricKey: "points", direction: "desc", dataView: "lastSeason", name: null, criteria: null },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, data: v3ShapeTiles }));

    const { result } = renderHook(() => useSummaryTiles());

    expect(result.current.tiles).toHaveLength(2);
    const [playerTile, teamTile] = result.current.tiles;
    expect(playerTile.playerIds).toBeNull();
    expect(playerTile.teamIds).toBeNull();
    expect(playerTile.criteria).toEqual(DEFAULT_FILTERS);
    expect(teamTile.playerIds).toBeNull();
    expect(teamTile.teamIds).toBeNull();
  });

  it("leaves already-current-shape (v4) tiles' playerIds/teamIds untouched", () => {
    const v4ShapeTiles = [
      { id: "t1", scope: "player", metricKey: "totalPoints", direction: "desc", dataView: "lastSeason", name: "Tracked players", criteria: null, playerIds: [1, 2, 3], teamIds: null },
      { id: "t2", scope: "team", metricKey: "points", direction: "desc", dataView: "lastSeason", name: "Tracked teams", criteria: null, playerIds: null, teamIds: [10, 20] },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 4, data: v4ShapeTiles }));

    const { result } = renderHook(() => useSummaryTiles());
    const [playerTile, teamTile] = result.current.tiles;
    expect(playerTile.playerIds).toEqual([1, 2, 3]);
    expect(teamTile.teamIds).toEqual([10, 20]);
  });
});

describe("useSummaryTiles — <update_safety> version 4 -> 5 migration (criteria.minPrice/maxPrice)", () => {
  it("migrates a version-4 tile whose criteria predates minPrice/maxPrice: those two fields backfill to null, every other criteria field is preserved", () => {
    const v4ShapeTiles = [
      {
        id: "t1",
        scope: "player",
        metricKey: "totalPoints",
        direction: "desc",
        dataView: "lastSeason",
        name: "Cheap enganche",
        criteria: { search: "", position: "MID", teamId: "ALL", minMinutes: 450 },
        playerIds: null,
        teamIds: null,
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 4, data: v4ShapeTiles }));

    const { result } = renderHook(() => useSummaryTiles());
    expect(result.current.tiles[0].criteria).toEqual({ search: "", position: "MID", teamId: "ALL", minMinutes: 450, minPrice: null, maxPrice: null });
  });

  it("leaves already-current-shape (v5) criteria untouched, including a real minPrice/maxPrice", () => {
    const v5ShapeTiles = [
      {
        id: "t1",
        scope: "player",
        metricKey: "totalPoints",
        direction: "desc",
        dataView: "lastSeason",
        name: "Best £5m players",
        criteria: { search: "", position: "ALL", teamId: "ALL", minMinutes: 0, minPrice: 4.5, maxPrice: 5.0 },
        playerIds: null,
        teamIds: null,
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 5, data: v5ShapeTiles }));

    const { result } = renderHook(() => useSummaryTiles());
    expect(result.current.tiles[0].criteria).toEqual({ search: "", position: "ALL", teamId: "ALL", minMinutes: 0, minPrice: 4.5, maxPrice: 5.0 });
  });
});
