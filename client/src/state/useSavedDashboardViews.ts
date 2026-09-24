import { useCallback, useEffect, useState } from "react";
import type { SummaryTileScope } from "../components/summaryTileMetrics";
import { DEFAULT_SUMMARY_TILES, type SummaryTileConfig } from "./useSummaryTiles";
import { DEFAULT_DASHBOARD_GRAPHS, normalizeDashboardGraph, type DashboardGraphConfig } from "./useDashboardGraphs";
import { loadVersioned, saveVersioned, type VersionedStore } from "./persistentStorage";
import { clearUnappliedLiveMinMinutes } from "./scoutingFilters";

const STORAGE_KEY = "fpl-dashboard:dashboard:saved-views:v1";
/**
 * Bumped 2 -> 3 when `graphs` was added below (a saved view now carries its
 * own set of Dashboard graphs alongside its tiles — see Dashboard.tsx's
 * Graphs section). A view saved under version 2 (or earlier) has no
 * `graphs` field at all — migrate() backfills it to `[]` for every
 * non-Default view (a pre-existing custom view had no graphs before this
 * existed, so an empty list is exactly correct, not a guess) while Default
 * entries are wholesale-replaced by the canonical DEFAULT_SAVED_DASHBOARD_VIEWS
 * regardless (see migrate() below), which already carries the packaged
 * default graphs.
 *
 * Bumped 3 -> 4 when Min Minutes started applying to Current Season tiles/
 * graphs (it used to be bypassed for them) — a non-Default view stored under
 * an older version has each live tile's/graph's never-applied minMinutes
 * zeroed by clearUnappliedLiveMinMinutes (scoutingFilters.ts), so loading it
 * shows exactly what it did when saved.
 */
const STORAGE_VERSION = 4;

export interface SavedDashboardView {
  id: string;
  scope: SummaryTileScope;
  name: string;
  tiles: SummaryTileConfig[];
  graphs: DashboardGraphConfig[];
  updatedAt: number;
}

/** Same idea as MAX_SAVED_SQUADS — a UI/localStorage-hygiene limit, applied per scope so filling up Player views doesn't block Team views. */
export const MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE = 5;

/**
 * There's no separate "Reset to Defaults" mechanism any more — the tile
 * layout the Dashboard always used to ship with is just a saved view named
 * "Default", one per scope: loadable, not deletable (see `remove()` and
 * `isDefaultSavedView` below), always occupying one of the per-scope saved
 * slots.
 */
const DEFAULT_SAVED_DASHBOARD_VIEWS: SavedDashboardView[] = (["player", "team"] as const).map((scope) => ({
  id: `default-view-${scope}`,
  scope,
  name: "Default",
  tiles: DEFAULT_SUMMARY_TILES.filter((t) => t.scope === scope),
  graphs: DEFAULT_DASHBOARD_GRAPHS.filter((g) => g.scope === scope),
  updatedAt: 0,
}));

const DEFAULT_SAVED_VIEW_IDS = new Set(DEFAULT_SAVED_DASHBOARD_VIEWS.map((v) => v.id));

/** "Default" is a permanent fallback, not a regular saved view — always there to load, never deletable, so a user can never lose every saved view for a scope. */
export function isDefaultSavedView(view: Pick<SavedDashboardView, "id">): boolean {
  return DEFAULT_SAVED_VIEW_IDS.has(view.id);
}

function defaultViewIdForScope(scope: SummaryTileScope): string {
  return `default-view-${scope}`;
}

type SelectedViewIds = Record<SummaryTileScope, string>;

const DEFAULT_SELECTED_VIEW_IDS: SelectedViewIds = {
  player: defaultViewIdForScope("player"),
  team: defaultViewIdForScope("team"),
};

const SAVED_VIEWS_STORE: VersionedStore<SavedDashboardView[]> = {
  version: STORAGE_VERSION,
  fallback: DEFAULT_SAVED_DASHBOARD_VIEWS,
  // Runs on every load, not just once across a version bump. Two things:
  // (1) restores either Default entry if missing entirely (e.g. deleted
  // before the anti-delete guard existed) — a no-op once both are present;
  // (2) re-syncs an existing Default entry's `tiles` to the current
  // DEFAULT_SAVED_DASHBOARD_VIEWS every time, not just when missing. Default
  // views are permanent and immutable now — nothing in the UI can add,
  // remove, or otherwise edit their tiles (see Dashboard.tsx) — so there's
  // no legitimate way for a Default entry's stored tiles to differ from the
  // packaged set going forward; this both performs the one-off reset back to
  // the full packaged tile set for anyone whose stored copy had drifted
  // (e.g. from before this guarantee existed) and guards against any future
  // drift (e.g. DEFAULT_SUMMARY_TILES itself changing later). A no-op once a
  // Default entry already matches, which is the steady-state case.
  migrate(data, storedVersion) {
    if (!Array.isArray(data)) return null;
    const views = data as Partial<SavedDashboardView>[];
    const existingIds = new Set(views.map((v) => v.id));
    const missingDefaults = DEFAULT_SAVED_DASHBOARD_VIEWS.filter((d) => !existingIds.has(d.id));
    const clearLiveMinMinutes = storedVersion === null || storedVersion < 4;
    const normalized = views.map((v) => {
      const canonical = DEFAULT_SAVED_DASHBOARD_VIEWS.find((d) => d.id === v.id);
      if (canonical) return canonical;
      // A non-Default view saved before `graphs` existed (version < 3) has
      // no such field — backfill to an empty list, exactly matching what
      // that view legitimately had at the time, same idea as
      // normalizeSummaryTile backfilling an older tile's missing fields.
      const graphs = Array.isArray(v.graphs) ? (v.graphs as Partial<DashboardGraphConfig>[]).map(normalizeDashboardGraph) : [];
      const view = { ...v, graphs } as SavedDashboardView;
      if (!clearLiveMinMinutes) return view;
      return {
        ...view,
        tiles: Array.isArray(view.tiles) ? view.tiles.map(clearUnappliedLiveMinMinutes) : view.tiles,
        graphs: graphs.map(clearUnappliedLiveMinMinutes),
      };
    });
    return missingDefaults.length > 0 ? [...normalized, ...missingDefaults] : normalized;
  },
};

function loadFromStorage(): SavedDashboardView[] {
  return loadVersioned(STORAGE_KEY, SAVED_VIEWS_STORE);
}

function saveToStorage(views: SavedDashboardView[]) {
  saveVersioned(STORAGE_KEY, STORAGE_VERSION, views);
}

const SELECTED_VIEW_STORAGE_KEY = "fpl-dashboard:dashboard:selected-view:v1";
const SELECTED_VIEW_STORAGE_VERSION = 1;

/**
 * Which saved view is currently picked in the dropdown, per scope — kept
 * separate from `views` itself since it's "what the user last chose to look
 * at", not saved-view data. Persisted so it survives a page reload or the
 * desktop app being closed and reopened: whichever view (Default or a named
 * one) a user leaves a scope on is the one they land back on, not always
 * Default. Self-heals like SAVED_VIEWS_STORE — a missing/malformed scope key
 * falls back to that scope's Default id rather than failing the whole load.
 */
const SELECTED_VIEW_STORE: VersionedStore<SelectedViewIds> = {
  version: SELECTED_VIEW_STORAGE_VERSION,
  fallback: DEFAULT_SELECTED_VIEW_IDS,
  migrate(data) {
    if (!data || typeof data !== "object") return null;
    const raw = data as Partial<Record<SummaryTileScope, unknown>>;
    return {
      player: typeof raw.player === "string" ? raw.player : DEFAULT_SELECTED_VIEW_IDS.player,
      team: typeof raw.team === "string" ? raw.team : DEFAULT_SELECTED_VIEW_IDS.team,
    };
  },
};

function loadSelectedViewIdsFromStorage(): SelectedViewIds {
  return loadVersioned(SELECTED_VIEW_STORAGE_KEY, SELECTED_VIEW_STORE);
}

function saveSelectedViewIdsToStorage(ids: SelectedViewIds) {
  saveVersioned(SELECTED_VIEW_STORAGE_KEY, SELECTED_VIEW_STORAGE_VERSION, ids);
}

export interface UseSavedDashboardViews {
  views: SavedDashboardView[];
  /** Creates a new named view and returns its id, so the caller can immediately select it. */
  save: (scope: SummaryTileScope, name: string, tiles: SummaryTileConfig[], graphs: DashboardGraphConfig[]) => string;
  remove: (id: string) => void;
  /** Overwrites an existing (non-Default) view's tiles+graphs in place — how a Create View'd view stays live-synced as the user edits it, with no separate Save step. Silently refuses to touch a Default view; a no-op if neither tiles nor graphs actually changed. */
  updateView: (id: string, tiles: SummaryTileConfig[], graphs: DashboardGraphConfig[]) => void;
  /** The dropdown's current selection for each scope — see SELECTED_VIEW_STORE. */
  selectedViewIds: SelectedViewIds;
  setSelectedViewId: (scope: SummaryTileScope, id: string) => void;
}

/**
 * A saved Dashboard view is a named set of one scope's tiles and graphs
 * (which metrics, in what order, each with its own data view). "Default"
 * (one per scope) is the one permanent, immutable entry — always loadable,
 * never deletable, and its tiles/graphs always match the packaged
 * DEFAULT_SUMMARY_TILES/DEFAULT_DASHBOARD_GRAPHS (see SAVED_VIEWS_STORE.migrate).
 * Every other view is created blank via Create View (Dashboard.tsx), which
 * also selects it — from then on, every tile/graph add/remove/reorder the
 * user makes while it's selected live-syncs straight into its stored
 * `tiles`/`graphs` via `updateView()`, so there's no separate Save step and
 * no way to lose edits by navigating away or closing the app. Same
 * no-account, localStorage-only persistence as saved squads.
 */
export function useSavedDashboardViews(): UseSavedDashboardViews {
  const [views, setViews] = useState<SavedDashboardView[]>(loadFromStorage);
  const [selectedViewIds, setSelectedViewIds] = useState<SelectedViewIds>(loadSelectedViewIdsFromStorage);

  useEffect(() => {
    saveToStorage(views);
  }, [views]);

  useEffect(() => {
    saveSelectedViewIdsToStorage(selectedViewIds);
  }, [selectedViewIds]);

  const save = useCallback((scope: SummaryTileScope, name: string, tiles: SummaryTileConfig[], graphs: DashboardGraphConfig[]) => {
    const id = `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setViews((prev) => [...prev, { id, scope, name, tiles, graphs, updatedAt: Date.now() }]);
    return id;
  }, []);

  const updateView = useCallback((id: string, tiles: SummaryTileConfig[], graphs: DashboardGraphConfig[]) => {
    if (DEFAULT_SAVED_VIEW_IDS.has(id)) return;
    setViews((prev) => {
      const idx = prev.findIndex((v) => v.id === id);
      if (idx === -1) return prev;
      const unchanged = JSON.stringify(prev[idx].tiles) === JSON.stringify(tiles) && JSON.stringify(prev[idx].graphs) === JSON.stringify(graphs);
      if (unchanged) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], tiles, graphs, updatedAt: Date.now() };
      return next;
    });
  }, []);

  const remove = useCallback(
    (id: string) => {
      if (DEFAULT_SAVED_VIEW_IDS.has(id)) return;
      const removedView = views.find((v) => v.id === id);
      setViews((prev) => prev.filter((v) => v.id !== id));
      // Deleting the view currently selected for its scope falls that
      // scope's selection back to Default rather than leaving it pointed at
      // a saved view that no longer exists.
      if (removedView) {
        setSelectedViewIds((prev) =>
          prev[removedView.scope] === id ? { ...prev, [removedView.scope]: defaultViewIdForScope(removedView.scope) } : prev,
        );
      }
    },
    [views],
  );

  const setSelectedViewId = useCallback((scope: SummaryTileScope, id: string) => {
    setSelectedViewIds((prev) => (prev[scope] === id ? prev : { ...prev, [scope]: id }));
  }, []);

  return { views, save, remove, updateView, selectedViewIds, setSelectedViewId };
}
