import { useCallback, useEffect, useState } from "react";
import type { SummaryTileScope } from "../components/summaryTileMetrics";
import type { SummaryTileConfig } from "./useSummaryTiles";
import { loadVersioned, saveVersioned, type VersionedStore } from "./persistentStorage";

const STORAGE_KEY = "fpl-dashboard:dashboard:saved-views:v1";
const STORAGE_VERSION = 1;

export interface SavedDashboardView {
  id: string;
  scope: SummaryTileScope;
  name: string;
  tiles: SummaryTileConfig[];
  updatedAt: number;
}

/** Same idea as MAX_SAVED_SQUADS — a UI/localStorage-hygiene limit, applied per scope so filling up Player views doesn't block Team views. */
export const MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE = 5;

const SAVED_VIEWS_STORE: VersionedStore<SavedDashboardView[]> = {
  version: STORAGE_VERSION,
  fallback: [],
  migrate(data) {
    if (!Array.isArray(data)) return null;
    return data as SavedDashboardView[];
  },
};

function loadFromStorage(): SavedDashboardView[] {
  return loadVersioned(STORAGE_KEY, SAVED_VIEWS_STORE);
}

function saveToStorage(views: SavedDashboardView[]) {
  saveVersioned(STORAGE_KEY, STORAGE_VERSION, views);
}

export interface UseSavedDashboardViews {
  views: SavedDashboardView[];
  save: (scope: SummaryTileScope, name: string, tiles: SummaryTileConfig[]) => void;
  remove: (id: string) => void;
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

  useEffect(() => {
    saveToStorage(views);
  }, [views]);

  const save = useCallback((scope: SummaryTileScope, name: string, tiles: SummaryTileConfig[]) => {
    setViews((prev) => [
      ...prev,
      { id: `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, scope, name, tiles, updatedAt: Date.now() },
    ]);
  }, []);

  const remove = useCallback((id: string) => {
    setViews((prev) => prev.filter((v) => v.id !== id));
  }, []);

  return { views, save, remove };
}
