import { useCallback, useEffect, useState } from "react";
import type { SummaryTileScope } from "../components/summaryTileMetrics";
import { DEFAULT_SUMMARY_TILES, type SummaryTileConfig } from "./useSummaryTiles";
import { loadVersioned, saveVersioned, type VersionedStore } from "./persistentStorage";

const STORAGE_KEY = "fpl-dashboard:dashboard:saved-views:v1";
const STORAGE_VERSION = 2;

export interface SavedDashboardView {
  id: string;
  scope: SummaryTileScope;
  name: string;
  tiles: SummaryTileConfig[];
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
  // Runs on every load, not just once across a version bump: `remove()`
  // only blocks deleting a Default view going forward, so anyone who
  // deleted one before that guard existed (or any other way a Default
  // entry ever went missing) gets it silently restored here instead of
  // needing another version bump to repair. Cheap (two Set lookups) and a
  // no-op once both are present, which is the steady-state case.
  migrate(data) {
    if (!Array.isArray(data)) return null;
    const views = data as SavedDashboardView[];
    const existingIds = new Set(views.map((v) => v.id));
    const missingDefaults = DEFAULT_SAVED_DASHBOARD_VIEWS.filter((d) => !existingIds.has(d.id));
    return missingDefaults.length > 0 ? [...views, ...missingDefaults] : views;
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
  save: (scope: SummaryTileScope, name: string, tiles: SummaryTileConfig[]) => void;
  remove: (id: string) => void;
  /** The dropdown's current selection for each scope — see SELECTED_VIEW_STORE. */
  selectedViewIds: SelectedViewIds;
  setSelectedViewId: (scope: SummaryTileScope, id: string) => void;
}

/**
 * A saved Dashboard view is a named snapshot of one scope's tiles (which
 * metrics, in what order, each with its own data view) — not a "currently
 * active" entity the way a saved squad is. Saving takes a snapshot;
 * loading overwrites the live tiles for that scope with the snapshot.
 * Same no-account, localStorage-only persistence as saved squads and
 * saved User Analysis graphs.
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

  const save = useCallback((scope: SummaryTileScope, name: string, tiles: SummaryTileConfig[]) => {
    setViews((prev) => [
      ...prev,
      { id: `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, scope, name, tiles, updatedAt: Date.now() },
    ]);
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

  return { views, save, remove, selectedViewIds, setSelectedViewId };
}
