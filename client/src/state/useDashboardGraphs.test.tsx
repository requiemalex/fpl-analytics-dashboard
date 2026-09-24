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
      direction: "desc" as const,
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

  it("updateGraph replaces one graph's settings in place, keeping its id, scope and position", () => {
    const { result } = renderHook(() => useDashboardGraphs());
    const before = result.current.graphs;
    const target = before[1];
    const { id: _id, scope: _scope, ...rest } = target;
    act(() => {
      result.current.updateGraph(target.id, { ...rest, name: "Renamed", chartType: "bar", showReferenceLine: false });
    });
    const after = result.current.graphs;
    expect(after.map((g) => g.id)).toEqual(before.map((g) => g.id));
    expect(after[1]).toEqual({ ...target, name: "Renamed", chartType: "bar", showReferenceLine: false });
    expect(after[0]).toBe(before[0]);
  });
});

describe('useDashboardGraphs — version 3 -> 4 migration (Min Minutes now applies to Current Season graphs)', () => {
  const liveGraph = { id: 'g-live', scope: 'player', name: null, chartType: 'scatter', xMetricKey: 'xG', yMetricKey: 'goals', dataView: 'live', showReferenceLine: false, criteria: { ...DEFAULT_FILTERS, minMinutes: 900 }, playerIds: null, teamIds: null };
  const lsGraph = { ...liveGraph, id: 'g-ls', dataView: 'lastSeason' };

  it("zeroes a pre-v4 live graph's never-applied minMinutes, leaving non-live graphs untouched", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, data: [liveGraph, lsGraph] }));
    const { result } = renderHook(() => useDashboardGraphs());
    expect(result.current.graphs[0].criteria?.minMinutes).toBe(0);
    expect(result.current.graphs[1].criteria?.minMinutes).toBe(900);
  });

  it("keeps a v4 live graph's minMinutes as set", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 4, data: [liveGraph] }));
    const { result } = renderHook(() => useDashboardGraphs());
    expect(result.current.graphs[0].criteria?.minMinutes).toBe(900);
  });
});

describe("useDashboardGraphs — version 4 -> 5 migration (bar graph Order)", () => {
  const bar = (id: string, scope: "player" | "team", yMetricKey: string) => ({
    id, scope, name: id, chartType: "bar", xMetricKey: "xG", yMetricKey, dataView: "lastSeason", showReferenceLine: false,
    criteria: scope === "player" ? { ...DEFAULT_FILTERS, minMinutes: 450 } : null, playerIds: null, teamIds: null,
  });

  it("gives an older bar graph its metric's natural order — League Position and Goals Against lowest first, Points highest first", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 4, data: [bar("pos", "team", "leaguePosition"), bar("ga", "team", "goalsAgainst"), bar("pts", "team", "points"), bar("xgc", "player", "xGCPerGame")] }),
    );
    const { result } = renderHook(() => useDashboardGraphs());
    expect(result.current.graphs.map((g) => [g.id, g.direction])).toEqual([
      ["pos", "asc"],
      ["ga", "asc"],
      ["pts", "desc"],
      ["xgc", "asc"],
    ]);
  });

  it("maps a retired team metric key to its current one when picking the order", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 4, data: [bar("gc", "team", "goalsConceded")] }));
    const { result } = renderHook(() => useDashboardGraphs());
    expect(result.current.graphs[0].direction).toBe("asc");
  });

  it("doesn't re-run the 3 -> 4 live Min Minutes clear on v4 data", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 4, data: [{ ...bar("live", "player", "goals"), dataView: "live" }] }));
    const { result } = renderHook(() => useDashboardGraphs());
    expect(result.current.graphs[0].criteria?.minMinutes).toBe(450);
  });

  it("keeps a stored direction as set", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 5, data: [{ ...bar("pos", "team", "leaguePosition"), direction: "desc" }] }));
    const { result } = renderHook(() => useDashboardGraphs());
    expect(result.current.graphs[0].direction).toBe("desc");
  });

  it("falls back to the default data view for an unrecognised one rather than keeping it (it would crash the Dashboard)", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 5, data: [{ ...bar("x", "team", "points"), dataView: "nextSeason" }] }));
    const { result } = renderHook(() => useDashboardGraphs());
    expect(result.current.graphs[0].dataView).toBe("lastSeason");
  });
});
