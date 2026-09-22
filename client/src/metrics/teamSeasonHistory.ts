import type { PlayerSeasonHistory } from "../types/normalized";
import { HISTORIC_WINDOW_SEASONS } from "./historicAnalysis";

export interface TeamSeasonPoints {
  seasonName: string;
  totalPoints: number;
  /** How many current squad members contributed a season to this bar — informational only, never used to exclude a season. */
  playerCount: number;
}

/**
 * Sums, for every season any CURRENT squad member has history for, the FPL
 * points that player personally scored that season — not points earned
 * "for this club": history_past carries no team_id, so this app has no
 * record of which club a player was actually at in a past season (same
 * gap Teams' own aggregate has, disclosed there via its banner). A summer
 * signing's points at their previous club land in this club's bar for
 * that season; see the Team Profile section of the User Guide.
 *
 * Every season any squad member has counts equally toward its bar — no
 * qualifying-minutes bar, same <no_survivorship_bias> reasoning
 * historicAnalysis.ts uses for a single player's own history.
 */
export function computeSquadSeasonHistory(squadPlayerIds: number[], allTimeSeasonsByPlayerId: Map<number, PlayerSeasonHistory[]>): TeamSeasonPoints[] {
  const bucket = new Map<string, { totalPoints: number; playerCount: number }>();
  for (const playerId of squadPlayerIds) {
    for (const s of allTimeSeasonsByPlayerId.get(playerId) ?? []) {
      const entry = bucket.get(s.seasonName) ?? { totalPoints: 0, playerCount: 0 };
      entry.totalPoints += s.totalPoints;
      entry.playerCount += 1;
      bucket.set(s.seasonName, entry);
    }
  }
  return [...bucket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([seasonName, v]) => ({ seasonName, ...v }));
}

function seasonStartYear(seasonName: string): number {
  return parseInt(seasonName.split("/")[0], 10);
}

/**
 * Same rolling window historicAnalysis.ts uses for a single player's own
 * Historic Average (HISTORIC_WINDOW_SEASONS, anchored to the most
 * recently COMPLETED season across the whole pool) — applied here to the
 * squad-aggregated total instead, so "Season average" means the same
 * thing in both places: the last 4 completed seasons, not the squad's
 * entire recorded history. Every season inside the window counts equally
 * toward the average (no minutes-qualifying filter), same
 * <no_survivorship_bias> reasoning historicAnalysis.ts uses.
 */
export function computeSquadSeasonWindow(seasons: TeamSeasonPoints[], referenceSeasonName: string | null): { inWindowNames: Set<string>; windowAverage: number | null } {
  if (!referenceSeasonName) return { inWindowNames: new Set(), windowAverage: null };
  const cutoffYear = seasonStartYear(referenceSeasonName) - (HISTORIC_WINDOW_SEASONS - 1);
  const inWindow = seasons.filter((s) => seasonStartYear(s.seasonName) >= cutoffYear);
  const inWindowNames = new Set(inWindow.map((s) => s.seasonName));
  const windowAverage = inWindow.length > 0 ? inWindow.reduce((acc, s) => acc + s.totalPoints, 0) / inWindow.length : null;
  return { inWindowNames, windowAverage };
}
