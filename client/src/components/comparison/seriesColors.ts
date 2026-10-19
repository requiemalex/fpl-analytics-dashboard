import type { NormalizedPlayer } from "../../types/normalized";

/**
 * One colour per compared player, in the order they were added: blue,
 * gold, orange, white, grey (tokens.css `--series-*`). Never green or red —
 * those mean better and worse everywhere in the app
 * (<comparative_colouring>), so a player drawn in them would read as one —
 * and never violet or rose, which name a data source. The same player
 * keeps the same colour on every card on the page.
 */
export const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

/** A compared player as every card draws him: his live identity (name, club, position, availability) and his colour. */
export interface ComparedPlayer {
  player: NormalizedPlayer;
  color: string;
}

/** The chart data key for one player's radar shape. */
export function seriesKey(playerId: number): string {
  return `p${playerId}`;
}
