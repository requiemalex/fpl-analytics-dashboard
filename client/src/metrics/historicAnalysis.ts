import type { PlayerSeasonHistory } from "../types/normalized";
import { computeCareerAverages, type CareerAverages } from "./careerMetrics";
import { FIXED_FLOOR_MINUTES } from "./fixedMinutesFloor";
import { seasonNameFromStartYear, seasonStartYear } from "../utils/season";

/**
 * Most recent N completed seasons are eligible for the qualifying-average
 * calculation. Rolls forward automatically — see determineReferenceSeason
 * below — rather than being pinned to a hard-coded year, per the brief.
 */
export const HISTORIC_WINDOW_SEASONS = 4;

/**
 * Roughly 10 full matches. No longer gates the Historic Average itself
 * (see <no_survivorship_bias> below) — an injury-hit or otherwise light
 * season is real history and now counts toward the average like any
 * other, on the same reasoning "last completed season" mode has always
 * used (that season's actual data however little the player played,
 * never treated as noise). Still used for two narrower, still-valid
 * purposes: (1) flagging a season as "light" in the UI (the `*` marker
 * in Points History's detail table) so a
 * dip in the average is legible rather than mysterious, and (2)
 * `expectedPoints.ts`'s forward-looking Expected Points model, which
 * needs a season's RATE to be built from enough minutes to be worth
 * extrapolating into a future prediction — a different question from
 * "did this season really happen" and deliberately left alone.
 */
export const MIN_QUALIFYING_SEASON_MINUTES = 900;

/** "2025/26" -> "2026/27". Seasons always run consecutively, so the live season is exactly one year after the reference (last completed) season. */
export function nextSeasonName(seasonName: string): string {
  return seasonNameFromStartYear(seasonStartYear(seasonName) + 1);
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
  /**
   * Seasons within the window that meet MIN_QUALIFYING_SEASON_MINUTES,
   * oldest first. Not used for Historic Average — only for Team Building's
   * Model Predicted bonus rate (`expectedPointsV2.ts`) and
   * `expectedPoints.ts`'s forward-prediction reliability gate.
   */
  qualifyingSeasons: PlayerSeasonHistory[];
  /**
   * EVERY season within the window, oldest first, regardless of minutes
   * played. What RELIABILITY uses (see minutesReliabilityBlend.ts): a
   * low-minutes season is exactly the signal that matters there too, so
   * it was never filtered for that purpose either.
   */
  allSeasonsInWindow: PlayerSeasonHistory[];
  /**
   * The window's seasons with at least the fixed minutes floor
   * (FIXED_FLOOR_MINUTES, 450), oldest first — never reaching back past the
   * window to replace one that falls short. Historic Average counts only
   * these, everywhere in the app (the owner's rule, 2026-10-19: one Historic
   * Average, replacing a second version that counted every season, 0-minute
   * ones included, where the user sets minimum minutes). A season under the
   * floor (a cameo year, one lost to injury, or 0 minutes) is a small
   * sample, so its figures don't count at all. A light season of 450+ still
   * counts and pulls the average down (<no_survivorship_bias>).
   */
  floorSeasonsInWindow: PlayerSeasonHistory[];
  /** Historic Average: the average over floorSeasonsInWindow. Null when no window season reaches the floor. */
  floorWindowAverage: CareerAverages | null;
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

  const floorSeasonsInWindow = allSeasonsInWindow.filter((s) => s.minutes >= FIXED_FLOOR_MINUTES);

  return {
    lastCompletedSeason,
    qualifyingSeasons,
    allSeasonsInWindow,
    floorSeasonsInWindow,
    floorWindowAverage: floorSeasonsInWindow.length > 0 ? computeCareerAverages(floorSeasonsInWindow) : null,
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
