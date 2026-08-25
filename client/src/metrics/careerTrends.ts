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

/** Recharts dataKey for one player's line within a multi-player trend chart — collision-free since it's keyed by id, not name. */
export function playerTrendDataKey(playerId: number): string {
  return `player_${playerId}`;
}

export interface MultiPlayerTrendPoint {
  seasonName: string;
  [playerDataKey: string]: string | number | null;
}

/**
 * Same shape of data as buildPlayerTrend, but merged across up to several
 * players into one Recharts-ready dataset: one row per season that ANY of
 * them played, each player's value for the chosen metric under their own
 * key (playerTrendDataKey) so Recharts can draw one Line per player.
 * Season names are already zero-padded four-digit-year strings ("2018/19"),
 * so a plain string sort puts them in chronological order without needing
 * to parse them.
 */
export function buildMultiPlayerTrend(
  playerIds: number[],
  allTimeSeasonsByPlayerId: Map<number, PlayerSeasonHistory[]>,
  metric: keyof Omit<PlayerTrendPoint, "seasonName">,
): MultiPlayerTrendPoint[] {
  const trendsByPlayerId = new Map<number, PlayerTrendPoint[]>();
  const seasonNames = new Set<string>();
  for (const id of playerIds) {
    const trend = buildPlayerTrend(allTimeSeasonsByPlayerId.get(id) ?? []);
    trendsByPlayerId.set(id, trend);
    for (const point of trend) seasonNames.add(point.seasonName);
  }

  return Array.from(seasonNames)
    .sort()
    .map((seasonName) => {
      const row: MultiPlayerTrendPoint = { seasonName };
      for (const id of playerIds) {
        const point = trendsByPlayerId.get(id)?.find((p) => p.seasonName === seasonName);
        row[playerTrendDataKey(id)] = point ? point[metric] : null;
      }
      return row;
    });
}
