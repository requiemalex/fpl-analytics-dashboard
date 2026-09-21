import { useCallback, useEffect, useState } from "react";
import type { SummaryTileScope } from "../components/summaryTileMetrics";
import { DEFAULT_SUMMARY_TILES, type SummaryTileConfig } from "./useSummaryTiles";
import { loadVersioned, saveVersioned, type VersionedStore } from "./persistentStorage";

const STORAGE_KEY = "fpl-dashboard:dashboard:saved-views:v1";
/**
 * Bumped 1 -> 2 to retroactively seed the two "Default" views (below) into
 * anyone's saved-views array, even one that's already empty. Just changing
 * `fallback` isn't enough on its own: this hook's own effect persists
 * whatever it loads right on mount, so anyone who'd ever opened the
 * Dashboard before "Default" existed already had `{version: 1, data: []}`
 * written to localStorage — `loadVersioned` sees that key exists and never
 * falls back to the new seed. `migrate()` below runs once for any array
 * stored under version < 2 and adds whichever Default entries aren't
 * already present (by id), so a version-1 array — empty or not — reliably
 * picks them up on the first load after upgrading, without duplicating
 * them on every subsequent load.
 */
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
 * "Default", one per scope, exactly like any view a user saves themselves
 * (deletable, loadable, counts toward the per-scope cap). Seeded in by
 * `fallback` for a genuinely fresh install, and retroactively by
 * `migrate()` for anyone upgrading from before "Default" existed (see the
 * STORAGE_VERSION comment above) — either way, once seeded in, deleting
 * "Default" deletes it for good rather than it reappearing.
 */
const DEFAULT_SAVED_DASHBOARD_VIEWS: SavedDashboardView[] = (["player", "team"] as const).map((scope) => ({
  id: `default-view-${scope}`,
  scope,
  name: "Default",
  tiles: DEFAULT_SUMMARY_TILES.filter((t) => t.scope === scope),
  updatedAt: 0,
}));

const SAVED_VIEWS_STORE: VersionedStore<SavedDashboardView[]> = {
  version: STORAGE_VERSION,
  fallback: DEFAULT_SAVED_DASHBOARD_VIEWS,
  migrate(data, storedVersion) {
    if (!Array.isArray(data)) return null;
    const views = data as SavedDashboardView[];
    if (storedVersion !== null && storedVersion >= STORAGE_VERSION) return views;
    const existingIds = new Set(views.map((v) => v.id));
    const missingDefaults = DEFAULT_SAVED_DASHBOARD_VIEWS.filter((d) => !existingIds.has(d.id));
    return [...views, ...missingDefaults];
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
