import type { PlayerSeasonHistory } from "../types/normalized";
import { computeCareerAverages, type CareerAverages } from "./careerMetrics";

/**
 * Most recent N completed seasons are eligible for the qualifying-average
 * calculation. Rolls forward automatically — see determineReferenceSeason
 * below — rather than being pinned to a hard-coded year, per the brief.
 */
export const HISTORIC_WINDOW_SEASONS = 4;

/**
 * A season must meet this minimum before it counts toward the qualifying
 * average — roughly 10 full matches. Deliberately does NOT apply to
 * "last completed season" mode, which shows that season's actual data
 * however little the player played (an injury-hit season is real data,
 * not noise, when someone's asking "what happened last season").
 */
export const MIN_QUALIFYING_SEASON_MINUTES = 900;

function seasonStartYear(seasonName: string): number {
  return parseInt(seasonName.split("/")[0], 10);
}

/**
 * The most recent season_name across the whole player pool's history —
 * i.e. the most recently COMPLETED FPL season, derived from the data
 * itself rather than today's calendar date. This is what makes the
 * 4-season window "roll forward" on its own as real seasons complete,
 * with no yearly maintenance. Returns null only if the bulk dataset is
 * empty (e.g. every player was skipped by a failed build).
 */
export function determineReferenceSeason(seasonsByPlayer: Map<number, PlayerSeasonHistory[]>): string | null {
  let latest: string | null = null;
  for (const seasons of seasonsByPlayer.values()) {
    for (const s of seasons) {
      if (latest === null || s.seasonName.localeCompare(latest) > 0) latest = s.seasonName;
    }
  }
  return latest;
}

export interface HistoricPlayerProfile {
  /**
   * Exactly the reference season's data for this player — null if they
   * have no entry for that specific season, however much or little they
   * played. Never falls back to an older season pretending to be "last
   * season": a player with no 25/26 entry has no "last completed season"
   * data, full stop.
   */
  lastCompletedSeason: PlayerSeasonHistory | null;
  /** Seasons within the window that meet MIN_QUALIFYING_SEASON_MINUTES, oldest first. For PERFORMANCE metrics (points, xG, etc.), where a tiny sample is noise worth excluding. */
  qualifyingSeasons: PlayerSeasonHistory[];
  /** Average across qualifyingSeasons — null if there are none. */
  qualifyingAverage: CareerAverages | null;
  /**
   * EVERY season within the window, oldest first, regardless of minutes
   * played — deliberately NOT filtered like qualifyingSeasons. For
   * RELIABILITY specifically, a low-minutes season is exactly the signal
   * that matters (see minutesReliabilityBlend.ts); excluding it the same
   * way a performance metric would is what let a single strong season
   * mask several weak ones and produce an inflated reliability figure.
   */
  allSeasonsInWindow: PlayerSeasonHistory[];
}

/** Builds one player's HistoricPlayerProfile against a shared reference season. */
export function buildHistoricPlayerProfile(seasons: PlayerSeasonHistory[], referenceSeasonName: string | null): HistoricPlayerProfile {
  const lastCompletedSeason = referenceSeasonName ? (seasons.find((s) => s.seasonName === referenceSeasonName) ?? null) : null;

  let qualifyingSeasons: PlayerSeasonHistory[] = [];
  let allSeasonsInWindow: PlayerSeasonHistory[] = [];
  if (referenceSeasonName) {
    const cutoffYear = seasonStartYear(referenceSeasonName) - (HISTORIC_WINDOW_SEASONS - 1);
    allSeasonsInWindow = seasons.filter((s) => seasonStartYear(s.seasonName) >= cutoffYear).sort((a, b) => a.seasonName.localeCompare(b.seasonName));
    qualifyingSeasons = allSeasonsInWindow.filter((s) => s.minutes >= MIN_QUALIFYING_SEASON_MINUTES);
  }

  return {
    lastCompletedSeason,
    qualifyingSeasons,
    qualifyingAverage: qualifyingSeasons.length > 0 ? computeCareerAverages(qualifyingSeasons) : null,
    allSeasonsInWindow,
  };
}

/**
 * Builds HistoricPlayerProfile for every player in the bulk dataset in
 * one pass, sharing a single reference season across the whole pool (so
 * every player's "last season" means the same actual season).
 */
export function buildAllHistoricProfiles(seasonsByPlayer: Map<number, PlayerSeasonHistory[]>): {
  referenceSeason: string | null;
  profiles: Map<number, HistoricPlayerProfile>;
} {
  const referenceSeason = determineReferenceSeason(seasonsByPlayer);
  const profiles = new Map<number, HistoricPlayerProfile>();
  for (const [playerId, seasons] of seasonsByPlayer) {
    profiles.set(playerId, buildHistoricPlayerProfile(seasons, referenceSeason));
  }
  return { referenceSeason, profiles };
}
