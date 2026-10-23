import type { AnalysisMode } from "../metrics/resolvePlayerStats";

/**
 * Shape shared by every page's own independent search/position/team/
 * min-minutes criteria — NOT app-wide state. Each page (and each saved
 * User Analysis graph) holds its own `GlobalScoutingFilters` value in
 * local `useState`; nothing here is read from or written to
 * `AppStateContext`. The "Global" in the name is a holdover from when
 * this genuinely was one shared value across the whole app — kept
 * because renaming the type would touch every page for no behavioural
 * gain — but the state itself is deliberately per-page now, so changing
 * one page's criteria can never change what another page shows. See
 * README → "Architecture" (shared vs per-page state).
 */
export interface GlobalScoutingFilters {
  search: string;
  position: "ALL" | "GKP" | "DEF" | "MID" | "FWD";
  teamId: number | "ALL";
  minMinutes: number;
  /** Live price (£m) range — null means unbounded on that side. Always today's real live price, same as every other live-identity field (see resolvePlayerStats.ts's <price_always_live>), never a per-analysis-mode figure. Currently only surfaced in the Dashboard Add Tile modal (FiltersBar's `showPrice`); harmless elsewhere since it defaults to no-op. */
  minPrice: number | null;
  maxPrice: number | null;
}

export const DEFAULT_MIN_MINUTES = 0;

export const DEFAULT_FILTERS: GlobalScoutingFilters = {
  search: "",
  position: "ALL",
  teamId: "ALL",
  minMinutes: DEFAULT_MIN_MINUTES,
  minPrice: null,
  maxPrice: null,
};

/**
 * One-off storage migration for Dashboard tiles/graphs saved before Min
 * Minutes applied in Current Season mode. Back then a live tile's stored
 * `minMinutes` was greyed out and never used — but could still be non-zero
 * (typed before switching the Data View to Current Season). Honouring it now
 * would silently start filtering a tile that never filtered before, so it's
 * zeroed instead, keeping every existing tile/graph showing exactly what it
 * did. Non-live items are returned untouched.
 */
export function clearUnappliedLiveMinMinutes<T extends { dataView?: AnalysisMode; criteria?: GlobalScoutingFilters | null }>(item: T): T {
  if (item.dataView !== "live" || !item.criteria || !item.criteria.minMinutes) return item;
  return { ...item, criteria: { ...item.criteria, minMinutes: 0 } };
}
