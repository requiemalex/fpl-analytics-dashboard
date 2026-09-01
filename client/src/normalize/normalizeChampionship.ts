import rawData from "../data/championship-2025-26.json";
import type { ChampionshipSeasonData, MatchResult, PromotionRoute } from "../types/championship";

/**
 * <championship_static_source>: unlike everything else this app displays,
 * this data was computed ONCE, offline, from a downloaded CSV
 * (football-data.co.uk's E1 — EFL Championship) and committed as a plain
 * JSON asset — see build_plan in README.md. There is no live fetch, no
 * server route, no AppStateContext entry, and no refresh path. If a future
 * season's promoted teams need covering, regenerate this file from that
 * season's CSV rather than trying to wire this up to fetch anything at
 * runtime — the whole point of this shape is that a completed season's
 * results never change.
 */
export const championshipData: ChampionshipSeasonData = rawData as ChampionshipSeasonData;

export function promotionRouteLabel(route: PromotionRoute): string {
  switch (route) {
    case "champion":
      return "Champions";
    case "runner-up":
      return "Runner-up";
    case "playoff-winner":
      return "Play-off winner";
  }
}

export function resultBadgeClass(result: MatchResult): string {
  switch (result) {
    case "W":
      return "value-positive";
    case "L":
      return "value-negative";
    case "D":
      return "value-muted";
  }
}

/** 1 -> "1st", 2 -> "2nd", 6 -> "6th", 11/12/13 -> "11th"/"12th"/"13th" (the standard English exceptions). */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
