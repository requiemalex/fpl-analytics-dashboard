// Audit 2026-10-18 (Audit 8): corrupted / newer-version data in the localStorage stores.
// Asserts correct behaviour (README "Saved data", CLAUDE.md "Graceful degradation");
// defects are it.fails with their finding id.
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSavedDashboardViews } from "./useSavedDashboardViews";
import { useSummaryTiles } from "./useSummaryTiles";
import { useComparisonViews } from "./useComparisonViews";
import { useNotepad } from "./useNotepad";
import { DEFAULT_FILTERS } from "./scoutingFilters";

const VIEWS_KEY = "fpl-dashboard:dashboard:saved-views:v1";
const TILES_KEY = "fpl-dashboard:dashboard:summary-tiles:v1";
const CMP_KEY = "fpl-dashboard:comparison:views:v1";
const NOTE_KEY = "fpl-dashboard:notepad:v1";

const userTile = { id: "t1", scope: "player", metricKey: "goals", direction: "desc", dataView: "lastSeason", name: "Mine", criteria: DEFAULT_FILTERS, playerIds: null, teamIds: null };
const userView = { id: "view-1", scope: "player", name: "Mine", tiles: [userTile], graphs: [], updatedAt: 1 };

beforeEach(() => localStorage.clear());

describe("saved data — newer-version data loads without a crash", () => {
  it("views stored by a newer version (v99) keep the user's view", () => {
    localStorage.setItem(VIEWS_KEY, JSON.stringify({ version: 99, data: [userView] }));
    const { result } = renderHook(() => useSavedDashboardViews());
    expect(result.current.views.some((v) => v.id === "view-1")).toBe(true);
  });
  it("comparison views and notepad from a newer version load", () => {
    localStorage.setItem(CMP_KEY, JSON.stringify({ version: 99, data: [{ id: "v", name: "Mine", elements: [{ id: "e", kind: "radar", name: "R", dataView: "nope", metricKeys: ["goals"], minMinutes: 0 }], updatedAt: 1 }] }));
    localStorage.setItem(NOTE_KEY, JSON.stringify({ version: 99, data: { tabs: [{ id: "a", title: "x".repeat(30), body: "hi" }], activeTabId: "a" } }));
    const cmp = renderHook(() => useComparisonViews()).result.current;
    expect(cmp.views.find((v) => v.id === "v")!.elements[0].dataView).toBe("lastSeason");
    expect(renderHook(() => useNotepad()).result.current.tabs[0].body).toBe("hi");
  });
});

describe("saved data — one damaged entry must not wipe the rest", () => {
  it("[AUDIT8-2] a null entry among saved Dashboard views keeps the user's other views", () => {
    localStorage.setItem(VIEWS_KEY, JSON.stringify({ version: 6, data: [userView, null] }));
    const { result } = renderHook(() => useSavedDashboardViews());
    expect(result.current.views.some((v) => v.id === "view-1")).toBe(true);
  });
  it("[AUDIT8-2] a null entry among summary tiles keeps the user's other tiles", () => {
    localStorage.setItem(TILES_KEY, JSON.stringify({ version: 6, data: [userTile, null] }));
    const { result } = renderHook(() => useSummaryTiles());
    expect(result.current.tiles.map((t) => t.id)).toEqual(["t1"]);
  });
  it("comparison views skip an unreadable entry and keep the rest", () => {
    localStorage.setItem(CMP_KEY, JSON.stringify({ version: 2, data: [null, { id: "v", name: "Mine", elements: [null], updatedAt: 1 }] }));
    const { result } = renderHook(() => useComparisonViews());
    expect(result.current.views.map((v) => v.id)).toEqual(["comparison-starter", "v"]);
  });
});
