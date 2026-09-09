import { useCallback, useEffect, useState } from "react";
import { createDefaultLocalViewState, type LocalViewState } from "../components/LocalViewControls";

const STORAGE_KEY = "fpl-dashboard:underlying-numbers:user-graphs:v1";

/** Hard cap on saved User Analysis graphs — a UI/localStorage-hygiene limit, matching the same idea (and number) as Team Building's saved-squad cap. */
export const MAX_USER_GRAPHS = 5;

export type UserGraphType = "scatter" | "bar";

export interface SavedUserGraph {
  id: string;
  name: string;
  chartType: UserGraphType;
  /** X axis metric key (into PLAYER_COLUMNS) — unused/ignored for a "bar" graph, which only ranks by yMetricKey. */
  xMetricKey: string;
  yMetricKey: string;
  /** This graph's own analysis-mode + filters — independent of every other saved graph's, and of the page's other sections. */
  view: LocalViewState;
}

function loadFromStorage(): SavedUserGraph[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedUserGraph[];
  } catch {
    return [];
  }
}

function saveToStorage(graphs: SavedUserGraph[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(graphs));
  } catch {
    // localStorage can throw (private browsing, quota) — graphs still work
    // for the rest of this session, they just won't persist on reload.
  }
}

export function createUserGraph(name: string, chartType: UserGraphType, xMetricKey: string, yMetricKey: string): SavedUserGraph {
  return {
    id: `usergraph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    chartType,
    xMetricKey,
    yMetricKey,
    view: createDefaultLocalViewState(),
  };
}

export interface UseSavedUserGraphs {
  graphs: SavedUserGraph[];
  addGraph: (graph: SavedUserGraph) => void;
  updateGraphView: (id: string, view: LocalViewState) => void;
  removeGraph: (id: string) => void;
}

/** Saved User Analysis graphs, persisted to localStorage only — same no-account, no-server-storage model as Team Building's saved squads. Starts empty; nothing is auto-created. */
export function useSavedUserGraphs(): UseSavedUserGraphs {
  const [graphs, setGraphs] = useState<SavedUserGraph[]>(loadFromStorage);

  useEffect(() => {
    saveToStorage(graphs);
  }, [graphs]);

  const addGraph = useCallback((graph: SavedUserGraph) => {
    setGraphs((prev) => (prev.length >= MAX_USER_GRAPHS ? prev : [...prev, graph]));
  }, []);

  const updateGraphView = useCallback((id: string, view: LocalViewState) => {
    setGraphs((prev) => prev.map((g) => (g.id === id ? { ...g, view } : g)));
  }, []);

  const removeGraph = useCallback((id: string) => {
    setGraphs((prev) => prev.filter((g) => g.id !== id));
  }, []);

  return { graphs, addGraph, updateGraphView, removeGraph };
}
