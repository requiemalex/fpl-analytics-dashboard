import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDashboardGraphs, DEFAULT_DASHBOARD_GRAPHS, MAX_DASHBOARD_GRAPHS, createDashboardGraph } from "./useDashboardGraphs";
import { DEFAULT_FILTERS } from "./scoutingFilters";

const STORAGE_KEY = "fpl-dashboard:dashboard:graphs:v1";

beforeEach(() => {
  localStorage.clear();
});

describe("useDashboardGraphs — <update_safety> defaults and migration", () => {
  it("with nothing in localStorage, starts from DEFAULT_DASHBOARD_GRAPHS", () => {
    const { result } = renderHook(() => useDashboardGraphs());
    expect(result.current.graphs).toEqual(DEFAULT_DASHBOARD_GRAPHS);
  });

  it("backfills missing fields on an older-shaped stored graph", () => {
    const oldShapeGraphs = [{ id: "g1", scope: "player", chartType: "scatter", xMetricKey: "xG", yMetricKey: "goals" }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: oldShapeGraphs }));

    const { result } = renderHook(() => useDashboardGraphs());
    expect(result.current.graphs).toHaveLength(1);
    const [graph] = result.current.graphs;
    expect(graph.name).toBeNull();
    expect(graph.dataView).toBe("lastSeason");
    expect(graph.showReferenceLine).toBe(false);
    expect(graph.criteria).toEqual(DEFAULT_FILTERS);
    expect(graph.playerIds).toBeNull();
    expect(graph.teamIds).toBeNull();
  });

  it("falls back to defaults for genuinely unsalvageable data (not an array at all)", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: { not: "an array" } }));
    const { result } = renderHook(() => useDashboardGraphs());
    expect(result.current.graphs).toEqual(DEFAULT_DASHBOARD_GRAPHS);
  });

  // Same "deliberate empty state" handling as useSummaryTiles.ts — a user
  // who removes every graph must have that respected on reload, not
  // silently reseeded with the packaged defaults.
  it("preserves a genuinely empty graph list rather than reseeding DEFAULT_DASHBOARD_GRAPHS", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: [] }));
    const { result } = renderHook(() => useDashboardGraphs());
    expect(result.current.graphs).toEqual([]);
  });
});

describe("useDashboardGraphs — addGraph/removeGraph/replaceScopeGraphs", () => {
  function blankGraph(scope: "player" | "team", id: string) {
    return createDashboardGraph({
      scope,
      name: "Test",
      chartType: "scatter" as const,
      xMetricKey: "xG",
      yMetricKey: "goals",
      dataView: "lastSeason" as const,
      showReferenceLine: false,
      criteria: scope === "player" ? DEFAULT_FILTERS : null,
      playerIds: null,
      teamIds: null,
    });
  }

  it("addGraph appends a graph, refusing once MAX_DASHBOARD_GRAPHS is reached", () => {
    const { result } = renderHook(() => useDashboardGraphs());
    act(() => {
      result.current.replaceScopeGraphs("player", []);
      result.current.replaceScopeGraphs("team", []);
    });
    for (let i = 0; i < MAX_DASHBOARD_GRAPHS; i++) {
      act(() => {
        result.current.addGraph(blankGraph("player", `g${i}`));
      });
    }
    expect(result.current.graphs).toHaveLength(MAX_DASHBOARD_GRAPHS);
    act(() => {
      result.current.addGraph(blankGraph("player", "overflow"));
    });
    expect(result.current.graphs).toHaveLength(MAX_DASHBOARD_GRAPHS);
  });

  it("removeGraph removes exactly the matching id", () => {
    const { result } = renderHook(() => useDashboardGraphs());
    const before = result.current.graphs;
    const idToRemove = before[0].id;
    act(() => {
      result.current.removeGraph(idToRemove);
    });
    expect(result.current.graphs.find((g) => g.id === idToRemove)).toBeUndefined();
    expect(result.current.graphs).toHaveLength(before.length - 1);
  });

  it("replaceScopeGraphs only touches the given scope", () => {
    const { result } = renderHook(() => useDashboardGraphs());
    const teamGraphsBefore = result.current.graphs.filter((g) => g.scope === "team");
    act(() => {
      result.current.replaceScopeGraphs("player", []);
    });
    expect(result.current.graphs.filter((g) => g.scope === "player")).toEqual([]);
    expect(result.current.graphs.filter((g) => g.scope === "team")).toEqual(teamGraphsBefore);
  });
});
