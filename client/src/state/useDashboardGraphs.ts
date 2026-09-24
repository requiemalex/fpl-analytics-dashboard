import { useCallback, useEffect, useState } from "react";
import type { SummaryTileScope } from "../components/summaryTileMetrics";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import { clearUnappliedLiveMinMinutes, DEFAULT_FILTERS, type GlobalScoutingFilters } from "./scoutingFilters";
import { loadVersioned, saveVersioned, type VersionedStore } from "./persistentStorage";

const STORAGE_KEY = "fpl-dashboard:dashboard:graphs:v1";
/**
 * Bumped 1 -> 2 when the packaged defaults changed (player defaults gained
 * a DEFAULT_GRAPH_MIN_MINUTES floor; the team xGC graph's Y axis moved from
 * this-season "Goals Against" to same-season "Goals Conceded"). Bumped
 * 2 -> 3 when club history made every team metric season-aware: "Goals
 * Against" is now the club's real goals conceded in the graph's own season,
 * so the team xGC default goes back to it. migrate() re-syncs any stored
 * graph carrying a default id to its current packaged definition when
 * loading data stored under an older version.
 *
 * Bumped 3 -> 4 when Min Minutes started applying to Current Season graphs
 * (it used to be bypassed for them) — a graph stored under an older version
 * with dataView "live" has its never-applied minMinutes zeroed by
 * clearUnappliedLiveMinMinutes (scoutingFilters.ts).
 */
const STORAGE_VERSION = 4;
const DEFAULT_DATA_VIEW: AnalysisMode = "lastSeason";

/**
 * Minimum minutes for the packaged player default graphs — about ten full
 * games. With no floor, every player in the game is plotted (~670), and
 * the hundreds with a handful of minutes pile up at 0,0 and hide the
 * players worth reading. Only the defaults carry this; a user-built graph
 * keeps whatever Min Minutes it was created with.
 */
const DEFAULT_GRAPH_MIN_MINUTES = 900;
const DEFAULT_GRAPH_PLAYER_CRITERIA: GlobalScoutingFilters = { ...DEFAULT_FILTERS, minMinutes: DEFAULT_GRAPH_MIN_MINUTES };

/**
 * A graph takes a lot more screen space than a tile to be useful (see the
 * Dashboard/Graphs divider), so this is deliberately half of
 * MAX_SUMMARY_TILES rather than matching it — same UI/localStorage-hygiene
 * reasoning, just tuned for a heavier widget.
 */
export const MAX_DASHBOARD_GRAPHS = 10;

export type DashboardGraphType = "scatter" | "bar";

export interface DashboardGraphConfig {
  id: string;
  scope: SummaryTileScope;
  /** Custom title, set once at creation — null/"" falls back to an auto-generated "<X> vs <Y>" / "Top 15 — <Y>" title (see Dashboard.tsx). */
  name: string | null;
  chartType: DashboardGraphType;
  /** X axis metric key (into PLAYER_COLUMNS/TEAM_COLUMNS depending on `scope`) — unused/ignored for a "bar" graph, which only ranks by yMetricKey. */
  xMetricKey: string;
  yMetricKey: string;
  /** This graph's own analysis mode — set once at creation, independent of every other graph's and every tile's. See SummaryTileConfig.dataView. */
  dataView: AnalysisMode;
  /** Scatter only — draws a dashed 45° "expected output" line, meaningful only when X and Y are on the same scale (e.g. xG vs Goals). Ignored for a "bar" graph. */
  showReferenceLine: boolean;
  /** Scope "player" only — same Search/Position/Team/Min Minutes criteria a Player Tile can carry. Always null for scope "team". Ignored when `playerIds` is set. */
  criteria: GlobalScoutingFilters | null;
  /** Scope "player" only — up to 5 specific player ids to plot instead of a criteria-filtered pool. Null means "use `criteria`". Always null for scope "team". */
  playerIds: number[] | null;
  /** Scope "team" only — up to 5 specific team ids to plot instead of every team. Null means "all teams". Always null for scope "player". */
  teamIds: number[] | null;
}

/** Backfills a possibly-older-shaped stored graph to the current DashboardGraphConfig shape — mirrors normalizeSummaryTile (useSummaryTiles.ts), shared by this store's migrate() and by useSavedDashboardViews' (which embeds this same graph shape inside each saved view's `graphs` array). */
export function normalizeDashboardGraph(g: Partial<DashboardGraphConfig>): DashboardGraphConfig {
  return {
    ...g,
    dataView: g.dataView ?? DEFAULT_DATA_VIEW,
    name: g.name ?? null,
    chartType: g.chartType ?? "scatter",
    showReferenceLine: g.showReferenceLine ?? false,
    criteria: g.criteria ? { ...DEFAULT_FILTERS, ...g.criteria } : g.scope === "player" ? DEFAULT_FILTERS : null,
    playerIds: g.playerIds ?? null,
    teamIds: g.teamIds ?? null,
  } as DashboardGraphConfig;
}

/**
 * The packaged default graphs — a couple of useful summary graphs per
 * scope, ported over from the old Underlying Numbers page's most broadly
 * useful "expected vs actual" and "value" charts (never its Thematic
 * Analysis line charts, which don't fit this per-graph, single-analysis-
 * mode model). Player defaults use DEFAULT_FILTERS plus a
 * DEFAULT_GRAPH_MIN_MINUTES floor; team defaults have no criteria at all,
 * same as every other team tile/graph.
 */
export const DEFAULT_DASHBOARD_GRAPHS: DashboardGraphConfig[] = [
  {
    id: "default-graph-xg-goals",
    scope: "player",
    name: "xG vs Goals",
    chartType: "scatter",
    xMetricKey: "xG",
    yMetricKey: "goals",
    dataView: DEFAULT_DATA_VIEW,
    showReferenceLine: true,
    criteria: DEFAULT_GRAPH_PLAYER_CRITERIA,
    playerIds: null,
    teamIds: null,
  },
  {
    id: "default-graph-xa-assists",
    scope: "player",
    name: "xA vs Assists",
    chartType: "scatter",
    xMetricKey: "xA",
    yMetricKey: "assists",
    dataView: DEFAULT_DATA_VIEW,
    showReferenceLine: true,
    criteria: DEFAULT_GRAPH_PLAYER_CRITERIA,
    playerIds: null,
    teamIds: null,
  },
  {
    id: "default-graph-price-points",
    scope: "player",
    name: "Price vs Points",
    chartType: "scatter",
    xMetricKey: "price",
    yMetricKey: "totalPoints",
    dataView: DEFAULT_DATA_VIEW,
    showReferenceLine: false,
    criteria: DEFAULT_GRAPH_PLAYER_CRITERIA,
    playerIds: null,
    teamIds: null,
  },
  {
    id: "default-graph-team-xg-goals",
    scope: "team",
    name: "Team xG vs Goals",
    chartType: "scatter",
    xMetricKey: "xG",
    yMetricKey: "goals",
    dataView: DEFAULT_DATA_VIEW,
    showReferenceLine: true,
    criteria: null,
    playerIds: null,
    teamIds: null,
  },
  {
    id: "default-graph-team-xgc-goals-against",
    scope: "team",
    name: "Team xGC vs Goals Against",
    chartType: "scatter",
    xMetricKey: "xGC",
    yMetricKey: "goalsAgainst",
    dataView: DEFAULT_DATA_VIEW,
    showReferenceLine: true,
    criteria: null,
    playerIds: null,
    teamIds: null,
  },
];

const DASHBOARD_GRAPHS_STORE: VersionedStore<DashboardGraphConfig[]> = {
  version: STORAGE_VERSION,
  fallback: DEFAULT_DASHBOARD_GRAPHS,
  migrate(data, storedVersion) {
    // A genuinely empty array is a legitimate, deliberate user state (every
    // graph removed) — same "is an empty array valid?" handling as
    // useSummaryTiles.ts. Only a non-array (or missing) payload means
    // there's nothing usable to migrate.
    if (!Array.isArray(data)) return null;
    const graphs = (data as Partial<DashboardGraphConfig>[]).map(normalizeDashboardGraph);
    if (storedVersion !== null && storedVersion >= STORAGE_VERSION) return graphs;
    // Older copies of a packaged default are replaced in place (same
    // position) by the current definition. Safe because a graph is never
    // edited after creation — a stored graph with a default id can only
    // ever be an unmodified default. A default the user removed stays
    // removed; nothing is re-added.
    return graphs.map((g) => DEFAULT_DASHBOARD_GRAPHS.find((d) => d.id === g.id) ?? clearUnappliedLiveMinMinutes(g));
  },
};

function loadFromStorage(): DashboardGraphConfig[] {
  return loadVersioned(STORAGE_KEY, DASHBOARD_GRAPHS_STORE);
}

function saveToStorage(graphs: DashboardGraphConfig[]) {
  saveVersioned(STORAGE_KEY, STORAGE_VERSION, graphs);
}

export function createDashboardGraph(config: Omit<DashboardGraphConfig, "id">): DashboardGraphConfig {
  return { id: `graph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...config };
}

export interface UseDashboardGraphs {
  graphs: DashboardGraphConfig[];
  addGraph: (graph: DashboardGraphConfig) => void;
  removeGraph: (id: string) => void;
  reorderGraph: (draggedId: string, targetId: string) => void;
  /** Wholesale-replaces every graph of one scope (e.g. loading a saved Dashboard view) — the other scope's graphs are untouched. Caller is responsible for checking the MAX_DASHBOARD_GRAPHS cap against the combined result first. */
  replaceScopeGraphs: (scope: SummaryTileScope, scopeGraphs: DashboardGraphConfig[]) => void;
}

/** Saved Dashboard graphs, persisted to localStorage only — same no-account, no-server-storage model as Dashboard's own summary tiles. */
export function useDashboardGraphs(): UseDashboardGraphs {
  const [graphs, setGraphs] = useState<DashboardGraphConfig[]>(loadFromStorage);

  useEffect(() => {
    saveToStorage(graphs);
  }, [graphs]);

  const addGraph = useCallback((graph: DashboardGraphConfig) => {
    setGraphs((prev) => (prev.length >= MAX_DASHBOARD_GRAPHS ? prev : [...prev, graph]));
  }, []);

  const removeGraph = useCallback((id: string) => {
    setGraphs((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const reorderGraph = useCallback((draggedId: string, targetId: string) => {
    setGraphs((prev) => {
      const from = prev.findIndex((g) => g.id === draggedId);
      const to = prev.findIndex((g) => g.id === targetId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const replaceScopeGraphs = useCallback((scope: SummaryTileScope, scopeGraphs: DashboardGraphConfig[]) => {
    setGraphs((prev) => [...prev.filter((g) => g.scope !== scope), ...scopeGraphs]);
  }, []);

  return { graphs, addGraph, removeGraph, reorderGraph, replaceScopeGraphs };
}
