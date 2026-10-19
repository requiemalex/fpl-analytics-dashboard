import type { NormalizedPlayer } from "../types/normalized";
import type { GlobalScoutingFilters } from "./scoutingFilters";
import { isUnderMinimum } from "../metrics/fixedMinutesFloor";
import { matchesPlayerSearch } from "../utils/playerSearch";

/**
 * A page's (or a Dashboard tile's or graph's) own criteria applied to a
 * resolved pool. The user's Min Minutes applies in every Data View,
 * Current Season included (the owner's rule, 2026-10-19 — it used to be
 * skipped there everywhere but the Dashboard), and a player with no
 * minutes for the mode counts as 0 against it (<no_data_is_zero>): left
 * out once a minimum is set, kept at the default 0.
 */
export function filterPlayers(players: NormalizedPlayer[], filters: GlobalScoutingFilters): NormalizedPlayer[] {
  const search = filters.search.trim();

  return players.filter((p) => {
    if (search && !matchesPlayerSearch(p, search)) return false;
    if (filters.position !== "ALL" && p.position !== filters.position) return false;
    if (filters.teamId !== "ALL" && p.teamId !== filters.teamId) return false;
    // Live price, always today's real price regardless of analysis mode
    // (see resolvePlayerStats.ts's <price_always_live>) — `!= null` (not
    // `!== null`) deliberately treats an old stored filter object that
    // predates these two fields (undefined) the same as "not set", so a
    // pre-existing saved tile/view never gets a phantom price filter.
    if (filters.minPrice != null && p.price < filters.minPrice) return false;
    if (filters.maxPrice != null && p.price > filters.maxPrice) return false;
    if (isUnderMinimum(p.minutes, filters.minMinutes)) return false;
    return true;
  });
}
