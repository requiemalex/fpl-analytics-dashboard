import type { NormalizedPlayer, Position } from "../types/normalized";
import { EMPTY_COLUMN_FILTER, EMPTY_PLAYER_FILTER, type ColumnFilterSpec, type PlayerFilter } from "../state/useColumnFilters";
import type { ExplorerViewSettings } from "../state/useExplorerViews";
import { availabilityGroup } from "./primitives";
import { setPieceDuties, dutyFilterValue } from "./SetPieceDuties";

/**
 * <player_filter>: the filter on who a player is — position, club,
 * availability, set-piece duty — behind the ▾ on the Player header (Player
 * Explorer, Add Players). Its own filter key, not "name", so it saves,
 * clears and resets like any column's filter.
 */
export const PLAYER_FILTER_KEY = "player";

export const POSITIONS: Position[] = ["GKP", "DEF", "MID", "FWD"];
export const AVAILABILITY_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "doubtful", label: "Doubtful" },
  { value: "out", label: "Out" },
] as const;

/** What the filter reads of a player, "|"-joined: "position:MID|club:ARS|availability:out|duty:penalties:1…" (PLAYER_FILTER_SECTIONS). */
export function playerFilterTokens(p: NormalizedPlayer): string {
  const availability = availabilityGroup(p.status);
  return [
    `position:${p.position}`,
    `club:${p.teamShortName}`,
    ...(availability ? [`availability:${availability}`] : []),
    ...setPieceDuties(p).map((b) => `duty:${dutyFilterValue(b.duty, b.order)}`),
  ].join("|");
}

/** The player filter in a set of filters, or an empty one. */
export function playerFilterOf(filters: Record<string, ColumnFilterSpec>): PlayerFilter {
  return filters[PLAYER_FILTER_KEY]?.player ?? EMPTY_PLAYER_FILTER;
}

/** The filter spec holding `f`. */
export function playerFilterSpec(f: PlayerFilter): ColumnFilterSpec {
  return { ...EMPTY_COLUMN_FILTER, player: f };
}

/**
 * A saved view from when Team and Position were columns (before
 * 2026-10-31): their "show only" filters become the player filter's Club
 * and Position, so the view loses nothing.
 */
export function foldIdentityFilters(settings: ExplorerViewSettings): ExplorerViewSettings {
  const { team, position, ...rest } = settings.columnFilters;
  if (!team && !position) return settings;
  const f = playerFilterOf(settings.columnFilters);
  const folded: PlayerFilter = {
    ...f,
    clubs: team?.category ? [...new Set([...f.clubs, team.category])] : f.clubs,
    positions: position?.category ? [...new Set([...f.positions, position.category])] : f.positions,
  };
  return { ...settings, columnFilters: { ...rest, [PLAYER_FILTER_KEY]: playerFilterSpec(folded) } };
}
