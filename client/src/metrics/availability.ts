import type { NormalizedPlayer } from "../types/normalized";

/** FPL's unavailable statuses: injured, suspended, unavailable, not available (on loan). */
const UNAVAILABLE_STATUSES = new Set(["i", "s", "u", "n"]);

/** Chance-of-playing when FPL publishes one; otherwise a status-based default (Model Predicted's availability, pointsModelLive.ts). Never invents a specific percentage for a real doubt FPL hasn't quantified. Null when neither is known (audit 2026-10-18 L4: a missing status isn't "available"). */
export function availabilityModifier(player: Pick<NormalizedPlayer, "status" | "chanceOfPlayingNextRound">): number | null {
  if (player.chanceOfPlayingNextRound !== null) return player.chanceOfPlayingNextRound / 100;
  if (player.status === "a") return 1;
  if (player.status === "d") return 0.5;
  if (UNAVAILABLE_STATUSES.has(player.status)) return 0;
  return null;
}
