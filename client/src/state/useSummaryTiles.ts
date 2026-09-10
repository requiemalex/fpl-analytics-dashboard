import { useCallback, useEffect, useState } from "react";
import type { SummaryTileScope } from "../components/summaryTileMetrics";

const STORAGE_KEY = "fpl-dashboard:dashboard:summary-tiles:v1";

/** A UI/localStorage-hygiene limit, matching the same idea as Team Building's saved-squad cap and User Analysis's saved-graph cap. */
export const MAX_SUMMARY_TILES = 20;

export type TileDirection = "desc" | "asc";

export interface SummaryTileConfig {
  id: string;
  scope: SummaryTileScope;
  metricKey: string;
  direction: TileDirection;
}

/**
 * Matches exactly what the Dashboard showed before this customisation
 * feature existed, so a first-time visitor (nothing in localStorage yet)
 * sees the same tiles in the same order — customising is opt-in, not a
 * layout change forced on everyone.
 */
export const DEFAULT_SUMMARY_TILES: SummaryTileConfig[] = [
  { id: "default-points", scope: "player", metricKey: "totalPoints", direction: "desc" },
  { id: "default-xgi", scope: "player", metricKey: "xGI", direction: "desc" },
  { id: "default-value", scope: "player", metricKey: "pointsPerMillion", direction: "desc" },
  { id: "default-goals-above-xg", scope: "player", metricKey: "goalsMinusXG", direction: "desc" },
  { id: "default-xg-above-goals", scope: "player", metricKey: "goalsMinusXG", direction: "asc" },
  { id: "default-xgi-per-million", scope: "player", metricKey: "xGIPerMillion", direction: "desc" },
  { id: "default-ga-above-xgi", scope: "player", metricKey: "goalInvolvementsMinusXGI", direction: "desc" },
  { id: "default-team-points", scope: "team", metricKey: "points", direction: "desc" },
  { id: "default-team-xgi", scope: "team", metricKey: "xGI", direction: "desc" },
  { id: "default-team-clean-sheets", scope: "team", metricKey: "cleanSheets", direction: "desc" },
];

function loadFromStorage(): SummaryTileConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SUMMARY_TILES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_SUMMARY_TILES;
    return parsed as SummaryTileConfig[];
  } catch {
    return DEFAULT_SUMMARY_TILES;
  }
}

function saveToStorage(tiles: SummaryTileConfig[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tiles));
  } catch {
    // localStorage can throw (private browsing, quota) — tiles still work
    // for the rest of this session, they just won't persist on reload.
  }
}

export function createSummaryTile(scope: SummaryTileScope, metricKey: string, direction: TileDirection): SummaryTileConfig {
  return { id: `tile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, scope, metricKey, direction };
}

export interface UseSummaryTiles {
  tiles: SummaryTileConfig[];
  addTile: (tile: SummaryTileConfig) => void;
  removeTile: (id: string) => void;
  reorderTile: (draggedId: string, targetId: string) => void;
  resetTiles: () => void;
}

/** Saved Dashboard summary tiles, persisted to localStorage only — same no-account, no-server-storage model as Team Building's saved squads and Underlying Numbers' saved User Analysis graphs. */
export function useSummaryTiles(): UseSummaryTiles {
  const [tiles, setTiles] = useState<SummaryTileConfig[]>(loadFromStorage);

  useEffect(() => {
    saveToStorage(tiles);
  }, [tiles]);

  const addTile = useCallback((tile: SummaryTileConfig) => {
    setTiles((prev) => (prev.length >= MAX_SUMMARY_TILES ? prev : [...prev, tile]));
  }, []);

  const removeTile = useCallback((id: string) => {
    setTiles((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const reorderTile = useCallback((draggedId: string, targetId: string) => {
    setTiles((prev) => {
      const from = prev.findIndex((t) => t.id === draggedId);
      const to = prev.findIndex((t) => t.id === targetId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const resetTiles = useCallback(() => setTiles(DEFAULT_SUMMARY_TILES), []);

  return { tiles, addTile, removeTile, reorderTile, resetTiles };
}
