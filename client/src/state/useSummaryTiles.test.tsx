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

  it("leaves already-current-shape (v3) tiles untouched, preserving a custom name/criteria rather than overwriting them", () => {
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
    expect(result.current.tiles[0].criteria).toEqual({ search: "salah", position: "MID", teamId: "ALL", minMinutes: 900 });
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
