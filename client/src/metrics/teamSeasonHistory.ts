import type { PlayerSeasonHistory } from "../types/normalized";

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

/**
 * Plain mean across whichever completed seasons are present. Deliberately
 * NOT the same rolling-window average historicAnalysis.ts computes for a
 * single player (HISTORIC_WINDOW_SEASONS) — that window exists to keep a
 * player's own recency-weighted average from being dragged down by an
 * ancient season; a squad-level total has no equivalent "too old to
 * count" case, since it's a different group of contributing players each
 * season regardless of how far back it goes.
 */
export function computeSquadSeasonAverage(seasons: TeamSeasonPoints[]): number | null {
  if (seasons.length === 0) return null;
  return seasons.reduce((acc, s) => acc + s.totalPoints, 0) / seasons.length;
}
