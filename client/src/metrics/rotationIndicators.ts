import type { PlayerGameweekHistory } from "../types/normalized";

export interface SeasonAverageMinutes {
  averageMinutes: number | null;
  /** Matches in the player's log so far, 0-minute ones included — a double gameweek counts two. */
  matches: number;
}

/**
 * Average minutes per match across the whole current season so far — not
 * a rolling recent-form window — used to drive the player profile's
 * single-icon Playing Time summary (see README → "Metric methodology",
 * Playing Time). Per match, not per gameweek: a double gameweek is two
 * matches, and the gauge measures against one 90-minute match.
 */
export function computeSeasonAverageMinutes(history: Pick<PlayerGameweekHistory, "minutes">[]): SeasonAverageMinutes {
  const matches = history.length;
  if (matches === 0) return { averageMinutes: null, matches: 0 };
  const totalMinutes = history.reduce((sum, g) => sum + g.minutes, 0);
  return { averageMinutes: totalMinutes / matches, matches };
}
