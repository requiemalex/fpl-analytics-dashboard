import { useMemo } from "react";
import type { NormalizedPlayer, NormalizedTeam } from "../types/normalized";
import type { GlobalScoutingFilters } from "./AppStateContext";
import { computeArchetypesForAllPlayers, type ArchetypeLabel } from "../metrics/archetypes";
import type { HistoricPlayerProfile } from "../metrics/historicAnalysis";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";

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

export function filterPlayers(
  players: NormalizedPlayer[],
  filters: GlobalScoutingFilters,
  mode: AnalysisMode,
  archetypeMap?: Map<number, ArchetypeLabel[]>,
): NormalizedPlayer[] {
  const search = filters.search.trim().toLowerCase();
  const minMinutes = effectiveMinMinutes(filters, mode);

  return players.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search) && !`${p.firstName} ${p.lastName}`.toLowerCase().includes(search)) return false;
    if (filters.position !== "ALL" && p.position !== filters.position) return false;
    if (filters.teamId !== "ALL" && p.teamId !== filters.teamId) return false;
    // A player with no data for this mode (minutes null) isn't "a noisy
    // small sample" — they're not applicable to this bar at all. Retained,
    // not filtered out, matching <retained_not_omitted> in
    // resolvePlayerStats.ts: excluding them here would just reintroduce
    // the same vanishing-player problem through a different code path.
    if (p.minutes !== null && p.minutes < minMinutes) return false;
    // Starts/ownership/price row-filtering moved to each column's own
    // Excel-style filter (▾ icon) — this global bar only keeps the
    // fields that either can't be replicated at the column level
    // (Archetypes has no filterable column) or drive more than row
    // filtering (Min Minutes — see effectiveMinMinutes/percentile use
    // app-wide).
    if (filters.archetypes.length > 0) {
      const playerLabels = archetypeMap?.get(p.id) ?? [];
      if (!filters.archetypes.some((a) => playerLabels.includes(a))) return false;
    }
    return true;
  });
}

export function useFilteredPlayers(
  players: NormalizedPlayer[],
  filters: GlobalScoutingFilters,
  mode: AnalysisMode,
  teamsById: Map<number, NormalizedTeam>,
  historicProfiles: Map<number, HistoricPlayerProfile>,
): NormalizedPlayer[] {
  const minMinutes = effectiveMinMinutes(filters, mode);
  // Archetypes need the whole-population percentile context (<percentile_population>),
  // so it's computed here against the unfiltered `players` list, not the result.
  const archetypeMap = useMemo(
    () => (filters.archetypes.length > 0 ? computeArchetypesForAllPlayers(players, minMinutes, teamsById, historicProfiles) : undefined),
    [players, minMinutes, filters.archetypes.length, teamsById, historicProfiles],
  );
  return useMemo(() => filterPlayers(players, filters, mode, archetypeMap), [players, filters, mode, archetypeMap]);
}
