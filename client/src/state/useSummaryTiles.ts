import { useCallback, useEffect, useState } from "react";
import type { SummaryTileScope } from "../components/summaryTileMetrics";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import { DEFAULT_FILTERS, type GlobalScoutingFilters } from "./scoutingFilters";
import { loadVersioned, saveVersioned, type VersionedStore } from "./persistentStorage";

const STORAGE_KEY = "fpl-dashboard:dashboard:summary-tiles:v1";
/**
 * Bumped 2 -> 3 when `name` and `criteria` were added below (a tile's own
 * Search/Position/Team/Min Minutes criteria and an optional custom title,
 * replacing the one dashboard-wide criteria bar that used to sit above
 * every Player Tile — see Dashboard.tsx). A tile saved under version 2 (or
 * earlier, or with no envelope at all) has neither field — migrate()
 * backfills `name` to null (falls back to the auto-generated title) and
 * `criteria` to DEFAULT_FILTERS for player tiles (matching the old shared
 * bar's own starting value) / null for team tiles (which never filtered),
 * so existing users' tiles keep behaving exactly as before rather than
 * crashing or silently showing zero rows.
 *
 * Bumped 3 -> 4 when `playerIds` and `teamIds` were added below (a Player
 * Tile can now track up to 5 specific players instead of a criteria-filtered
 * pool, and a Team Tile up to 5 specific teams instead of every team — see
 * the Add Tile modal in Dashboard.tsx). A tile saved under version 3 (or
 * earlier) has neither field — migrate() backfills both to null, which
 * means "use the existing criteria/all-teams behaviour", so every
 * previously-saved tile keeps rendering exactly as it did before.
 *
 * Bumped 4 -> 5 when `minPrice`/`maxPrice` were added to
 * GlobalScoutingFilters (scoutingFilters.ts) for the Add Tile modal's new
 * live-price criteria. A tile saved under version 4 (or earlier) has a
 * `criteria` object that predates those two fields — migrate() now
 * per-field-merges a present `criteria` onto DEFAULT_FILTERS (not just
 * substituting DEFAULT_FILTERS wholesale when `criteria` is entirely
 * missing, as before) so an old criteria object picks up `minPrice`/
 * `maxPrice: null` (no-op) instead of silently carrying `undefined` for
 * fields the rest of the app now expects to exist.
 */
const STORAGE_VERSION = 5;
const DEFAULT_DATA_VIEW: AnalysisMode = "lastSeason";

/** A UI/localStorage-hygiene limit, matching the same idea as Team Building's saved-squad cap and User Analysis's saved-graph cap. */
export const MAX_SUMMARY_TILES = 20;

export type TileDirection = "desc" | "asc";

export interface SummaryTileConfig {
  id: string;
  scope: SummaryTileScope;
  metricKey: string;
  direction: TileDirection;
  /** This tile's own analysis mode — set once at creation (Add Tile modal), independent of every other tile's. See Dashboard.tsx / README's "Per-tile data view". */
  dataView: AnalysisMode;
  /** Custom title, set once at creation — null/"" falls back to the auto-generated "Top 5 — <metric>" title. */
  name: string | null;
  /** This tile's own Search/Position/Team/Min Minutes criteria, set once at creation — independent of every other tile's. Always null for scope "team" (a team tile aggregates a club's whole squad regardless of any player-level filter, same as before this existed). Ignored when `playerIds` is set (see below). */
  criteria: GlobalScoutingFilters | null;
  /**
   * Scope "player" only: up to 5 specific player ids to track, chosen via
   * the Add Tile modal's "Player Search" toggle instead of "Filters". When
   * set (always non-empty — validated at creation), this tile's Top/Bottom
   * 5 sorts only these players and `criteria` is ignored entirely. Null
   * means "use `criteria`" (the original filter-based behaviour). Always
   * null for scope "team".
   */
  playerIds: number[] | null;
  /**
   * Scope "team" only: up to 5 specific team ids to track, chosen via the
   * Add Tile modal's "Team Selection" toggle instead of "All Teams". When
   * set (always non-empty — validated at creation), this tile's Top/Bottom
   * 5 sorts only these teams instead of every team. Null means "all teams"
   * (the original behaviour). Always null for scope "player".
   */
  teamIds: number[] | null;
}

/** Backfills a possibly-older-shaped stored tile to the current SummaryTileConfig shape — shared by this store's own migrate() below and by useSavedDashboardViews' (which embeds this same tile shape inside each saved view's `tiles` array and needs to stay in sync with it). */
export function normalizeSummaryTile(t: Partial<SummaryTileConfig>): SummaryTileConfig {
  return {
    ...t,
    dataView: t.dataView ?? DEFAULT_DATA_VIEW,
    name: t.name ?? null,
    criteria: t.criteria ? { ...DEFAULT_FILTERS, ...t.criteria } : t.scope === "player" ? DEFAULT_FILTERS : null,
    playerIds: t.playerIds ?? null,
    teamIds: t.teamIds ?? null,
  } as SummaryTileConfig;
}

/**
 * Matches exactly what the Dashboard showed before this customisation
 * feature existed, so a first-time visitor (nothing in localStorage yet)
 * sees the same tiles in the same order — customising is opt-in, not a
 * layout change forced on everyone.
 */
export const DEFAULT_SUMMARY_TILES: SummaryTileConfig[] = [
  { id: "default-points", scope: "player", metricKey: "totalPoints", direction: "desc", dataView: DEFAULT_DATA_VIEW, name: null, criteria: DEFAULT_FILTERS, playerIds: null, teamIds: null },
  { id: "default-xgi", scope: "player", metricKey: "xGI", direction: "desc", dataView: DEFAULT_DATA_VIEW, name: null, criteria: DEFAULT_FILTERS, playerIds: null, teamIds: null },
  { id: "default-value", scope: "player", metricKey: "pointsPerMillion", direction: "desc", dataView: DEFAULT_DATA_VIEW, name: null, criteria: DEFAULT_FILTERS, playerIds: null, teamIds: null },
  { id: "default-goals-above-xg", scope: "player", metricKey: "goalsMinusXG", direction: "desc", dataView: DEFAULT_DATA_VIEW, name: null, criteria: DEFAULT_FILTERS, playerIds: null, teamIds: null },
  { id: "default-xg-above-goals", scope: "player", metricKey: "goalsMinusXG", direction: "asc", dataView: DEFAULT_DATA_VIEW, name: null, criteria: DEFAULT_FILTERS, playerIds: null, teamIds: null },
  { id: "default-xgi-per-million", scope: "player", metricKey: "xGIPerMillion", direction: "desc", dataView: DEFAULT_DATA_VIEW, name: null, criteria: DEFAULT_FILTERS, playerIds: null, teamIds: null },
  { id: "default-ga-above-xgi", scope: "player", metricKey: "goalInvolvementsMinusXGI", direction: "desc", dataView: DEFAULT_DATA_VIEW, name: null, criteria: DEFAULT_FILTERS, playerIds: null, teamIds: null },
  { id: "default-team-points", scope: "team", metricKey: "points", direction: "desc", dataView: DEFAULT_DATA_VIEW, name: null, criteria: null, playerIds: null, teamIds: null },
  { id: "default-team-xgi", scope: "team", metricKey: "xGI", direction: "desc", dataView: DEFAULT_DATA_VIEW, name: null, criteria: null, playerIds: null, teamIds: null },
  { id: "default-team-clean-sheets", scope: "team", metricKey: "cleanSheets", direction: "desc", dataView: DEFAULT_DATA_VIEW, name: null, criteria: null, playerIds: null, teamIds: null },
];

const SUMMARY_TILES_STORE: VersionedStore<SummaryTileConfig[]> = {
  version: STORAGE_VERSION,
  fallback: DEFAULT_SUMMARY_TILES,
  migrate(data) {
    // A genuinely empty array is a legitimate, deliberate user state (every
    // tile removed) — Dashboard.tsx already renders a clean "No tiles yet"
    // empty state for it — not something to silently revert back to the
    // packaged defaults. Matches useSavedSquads.ts's own handling of the
    // same "is an empty array valid?" question. Only a non-array (or
    // missing) payload means there's nothing usable to migrate.
    if (!Array.isArray(data)) return null;
    return (data as Partial<SummaryTileConfig>[]).map(normalizeSummaryTile);
  },
};

function loadFromStorage(): SummaryTileConfig[] {
  return loadVersioned(STORAGE_KEY, SUMMARY_TILES_STORE);
}

function saveToStorage(tiles: SummaryTileConfig[]) {
  saveVersioned(STORAGE_KEY, STORAGE_VERSION, tiles);
}

export function createSummaryTile(config: {
  scope: SummaryTileScope;
  metricKey: string;
  direction: TileDirection;
  dataView: AnalysisMode;
  name: string | null;
  criteria: GlobalScoutingFilters | null;
  playerIds: number[] | null;
  teamIds: number[] | null;
}): SummaryTileConfig {
  return { id: `tile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...config };
}

export interface UseSummaryTiles {
  tiles: SummaryTileConfig[];
  addTile: (tile: SummaryTileConfig) => void;
  removeTile: (id: string) => void;
  reorderTile: (draggedId: string, targetId: string) => void;
  /** Wholesale-replaces every tile of one scope (e.g. loading a saved Dashboard view) — the other scope's tiles are untouched. Caller is responsible for checking the MAX_SUMMARY_TILES cap against the combined result first. */
  replaceScopeTiles: (scope: SummaryTileScope, scopeTiles: SummaryTileConfig[]) => void;
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

  const replaceScopeTiles = useCallback((scope: SummaryTileScope, scopeTiles: SummaryTileConfig[]) => {
    setTiles((prev) => [...prev.filter((t) => t.scope !== scope), ...scopeTiles]);
  }, []);

  return { tiles, addTile, removeTile, reorderTile, replaceScopeTiles };
}
