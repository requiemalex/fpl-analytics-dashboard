import { useMemo } from "react";
import type { NormalizedPlayer } from "../types/normalized";
import type { GlobalScoutingFilters } from "./AppStateContext";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import { matchesPlayerSearch } from "../utils/playerSearch";

/**
 * The minutes eligibility threshold exists to protect against noisy
 * small-sample rate stats within a completed (or averaged) season — it
 * doesn't translate to Current Season mode, where genuinely everyone has
 * low or zero minutes until real gameweeks accumulate (see
 * <live_mode_preseason_fix> in resolvePlayerStats.ts). A fixed 450-minute
 * bar would filter out the entire player pool early in a live season,
 * not just the noisy fringe it's meant to catch. Returns 0 (no filtering)
 * for live mode; the user's actual setting otherwise.
 */
export function effectiveMinMinutes(filters: GlobalScoutingFilters, mode: AnalysisMode): number {
  return mode === "live" ? 0 : filters.minMinutes;
}

export function filterPlayers(players: NormalizedPlayer[], filters: GlobalScoutingFilters, mode: AnalysisMode): NormalizedPlayer[] {
  const search = filters.search.trim();
  const minMinutes = effectiveMinMinutes(filters, mode);

  return players.filter((p) => {
    if (search && !matchesPlayerSearch(p, search)) return false;
    if (filters.position !== "ALL" && p.position !== filters.position) return false;
    if (filters.teamId !== "ALL" && p.teamId !== filters.teamId) return false;
    // A player with no data for this mode (minutes null) isn't "a noisy
    // small sample" — they're not applicable to this bar at all. Retained,
    // not filtered out, matching <retained_not_omitted> in
    // resolvePlayerStats.ts: excluding them here would just reintroduce
    // the same vanishing-player problem through a different code path.
    if (p.minutes !== null && p.minutes < minMinutes) return false;
    return true;
  });
}

export function useFilteredPlayers(players: NormalizedPlayer[], filters: GlobalScoutingFilters, mode: AnalysisMode): NormalizedPlayer[] {
  return useMemo(() => filterPlayers(players, filters, mode), [players, filters, mode]);
}
