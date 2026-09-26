import type { PlayerSeasonHistory } from "../types/normalized";
import { computeCareerAverages, type CareerAverages } from "./careerMetrics";
import { FIXED_FLOOR_MINUTES } from "./fixedMinutesFloor";

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

function seasonStartYear(seasonName: string): number {
  return parseInt(seasonName.split("/")[0], 10);
}

/** "2025/26" -> "2026/27". Seasons always run consecutively, so the live season is exactly one year after the reference (last completed) season. */
export function nextSeasonName(seasonName: string): string {
  const nextStart = seasonStartYear(seasonName) + 1;
  return `${nextStart}/${((nextStart + 1) % 100).toString().padStart(2, "0")}`;
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
   * oldest first. No longer used to build the average (see
   * <no_survivorship_bias> on windowAverage below) — kept only so the UI
   * can flag a season as "light" (the `*` marker in Points History's
   * detail table) and for `expectedPoints.ts`'s
   * forward-prediction reliability gate.
   */
  qualifyingSeasons: PlayerSeasonHistory[];
  /**
   * <no_survivorship_bias>: average across EVERY season in the window
   * (same set as allSeasonsInWindow below), not just the ones meeting
   * MIN_QUALIFYING_SEASON_MINUTES — changed directly at the user's
   * request. Filtering out light seasons before averaging meant an
   * injury-hit or lost-form season simply vanished from "Historic
   * Average" instead of dragging it down, which is exactly backwards
   * for a metric whose job is describing how much a player is really
   * worth holding across a season: a player who's reliably excellent
   * when fit but frequently hurt should show a LOWER average than one
   * who's merely good but always available, not the same or better one
   * because their bad seasons got quietly dropped. Named `windowAverage`
   * rather than `qualifyingAverage` (its old name) since nothing is
   * filtered out anymore. Null only if the window has no seasons at all.
   */
  windowAverage: CareerAverages | null;
  /**
   * EVERY season within the window, oldest first, regardless of minutes
   * played — the same array windowAverage above is now computed from.
   * Also what RELIABILITY uses (see minutesReliabilityBlend.ts): a
   * low-minutes season is exactly the signal that matters there too, so
   * it was never filtered for that purpose either.
   */
  allSeasonsInWindow: PlayerSeasonHistory[];
  /**
   * The window's seasons with at least the fixed minutes floor
   * (FIXED_FLOOR_MINUTES, 450), oldest first — never reaching back past the
   * window to replace one that falls short. Where the user can't set
   * minimum minutes (<fixed_minutes_floor>: player profile, Player
   * Comparison, the packaged Default Dashboard views), only
   * these seasons count toward Historic Average: a season under the floor
   * (a cameo year, one lost to injury, or 0 minutes) is a small sample, so
   * its figures don't count at all — the owner's rule (2026-09-25, replacing
   * "leave out 0-minute seasons"). Everywhere else keeps windowAverage,
   * every season included.
   */
  floorSeasonsInWindow: PlayerSeasonHistory[];
  /** Average over floorSeasonsInWindow. Null when no window season reaches the floor. */
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
    windowAverage: allSeasonsInWindow.length > 0 ? computeCareerAverages(allSeasonsInWindow) : null,
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
