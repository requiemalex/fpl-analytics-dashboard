import type { NormalizedPlayer } from "../../types/normalized";

/**
 * One colour per compared player, in the order they were added — the
 * app's own accent colours (focus blue, value gold, positive green,
 * negative red, secondary grey), not a separate chart palette. The same
 * player keeps the same colour on every card on the page.
 */
export const SERIES_COLORS = ["var(--accent-focus)", "var(--accent-value)", "var(--accent-positive)", "var(--accent-negative)", "var(--text-secondary)"];

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
