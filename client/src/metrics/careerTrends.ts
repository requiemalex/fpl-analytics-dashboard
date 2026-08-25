import type { PlayerSeasonHistory } from "../types/normalized";
import { per90 } from "./calculations";

export interface PlayerTrendPoint {
  seasonName: string;
  totalPoints: number;
  minutes: number;
  goals: number;
  assists: number;
  xG: number | null;
  xA: number | null;
  xGI: number | null;
  pointsPer90: number | null;
}

/**
 * Straight season-by-season figures for one player, oldest first — no
 * windowing, no qualifying-minutes filter, unlike historicProfiles
 * elsewhere in this app. This chart is explicitly about seeing a whole
 * career's shape, including a quiet or injury-hit season; filtering those
 * out would hide exactly the dips a trend line is for.
 */
export function buildPlayerTrend(seasons: PlayerSeasonHistory[]): PlayerTrendPoint[] {
  return seasons.map((s) => ({
    seasonName: s.seasonName,
    totalPoints: s.totalPoints,
    minutes: s.minutes,
    goals: s.goals,
    assists: s.assists,
    xG: s.xG,
    xA: s.xA,
    xGI: s.xGI,
    pointsPer90: per90(s.totalPoints, s.minutes),
  }));
}
