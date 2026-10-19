/**
 * The one wording for a Dashboard tile or graph (or any list or chart) with
 * nothing to show: no player, or no club, has a figure for its settings.
 * Loading and load failures have their own messages (Dashboard's
 * emptyMessageFor).
 */
export function noRowsMessage(kind: "player" | "team"): string {
  return `No ${kind === "player" ? "players" : "clubs"} have data for these settings.`;
}
