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

  it("re-syncs an older stored default graph to its current packaged definition, in place", () => {
    const oldTeamDefault = {
      ...DEFAULT_DASHBOARD_GRAPHS.find((g) => g.id === "default-graph-team-xgc-goals-against")!,
      name: "Team xGC vs Goals Conceded",
      yMetricKey: "goalsConceded",
    };
    const userGraph = { ...createDashboardGraph({ ...oldTeamDefault, name: "Mine" }), id: "graph-user" };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, data: [userGraph, oldTeamDefault] }));

    const { result } = renderHook(() => useDashboardGraphs());
    expect(result.current.graphs.map((g) => g.id)).toEqual(["graph-user", "default-graph-team-xgc-goals-against"]);
    // A user's own graph is never rewritten — its retired key is mapped at lookup time (teamColumnByKey).
    expect(result.current.graphs[0].yMetricKey).toBe("goalsConceded");
    expect(result.current.graphs[1].yMetricKey).toBe("goalsAgainst");
  });

  it("doesn't re-add a default the user removed before v2", () => {
    const kept = DEFAULT_DASHBOARD_GRAPHS[0];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: [{ ...kept, criteria: DEFAULT_FILTERS }] }));
    const { result } = renderHook(() => useDashboardGraphs());
    expect(result.current.graphs).toEqual([kept]);
  });

  it("player default graphs carry a 900-minute floor", () => {
    for (const g of DEFAULT_DASHBOARD_GRAPHS.filter((g) => g.scope === "player")) {
      expect(g.criteria?.minMinutes).toBe(900);
    }
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
