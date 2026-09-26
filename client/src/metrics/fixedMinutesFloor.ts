import type { AnalysisMode } from "./resolvePlayerStats";
import type { HistoricPlayerProfile } from "./historicAnalysis";

/**
 * <fixed_minutes_floor>: the minimum-minutes principle (the owner's rule,
 * README "Minimum minutes"). A floor exists only to stop a tiny sample
 * taking over. Where the user can set minimum minutes (Player Explorer's
 * MINS filter, a Dashboard tile or graph they build, Team Building) the
 * app adds nothing. Where they can't — the player profile, Player
 * Comparison and the packaged Default Dashboard views —
 * this fixed floor applies: one full match in Current Season, five
 * otherwise.
 *
 * In those sections a player below it is a small sample: no percentile,
 * no colour. Their Historic Average counts only seasons that reach
 * FIXED_FLOOR_MINUTES (resolvePlayerStats' `fixedFloorSeasons`), so every
 * Historic Average there is built from real samples.
 */
export const FIXED_FLOOR_LIVE_MINUTES = 90;
export const FIXED_FLOOR_MINUTES = 450;

export function fixedFloorMinutes(mode: AnalysisMode): number {
  return mode === "live" ? FIXED_FLOOR_LIVE_MINUTES : FIXED_FLOOR_MINUTES;
}

/** A player (or club-attributed figures) with minutes for the mode, but fewer than the floor. Null minutes is "no data", not a small sample. */
export function isBelowFixedFloor(minutes: number | null, mode: AnalysisMode): boolean {
  return minutes !== null && minutes < fixedFloorMinutes(mode);
}

/**
 * A player who played in the Historic Average window but never reached the
 * floor in any one season: in the fixed-floor sections he has no Historic
 * Average (nothing counts), and he's a small sample rather than "no data".
 * Only 0 minutes throughout is no data.
 */
export function isShortOfFixedFloor(profile: HistoricPlayerProfile | undefined): boolean {
  return !!profile && profile.floorWindowAverage === null && profile.allSeasonsInWindow.some((s) => s.minutes > 0);
}

/**
 * Whether a resolved player (resolved with `fixedFloorSeasons`) is a small
 * sample for the mode. In Historic Average every counted season already
 * reaches the floor, so the question there is whether any season did: one
 * who played but never reached it has no figures (null minutes) and is a
 * small sample, not "no data" (isShortOfFixedFloor).
 */
export function isFixedFloorSmallSample(minutes: number | null, mode: AnalysisMode, profile: HistoricPlayerProfile | undefined): boolean {
  if (mode === "historicAverage" && minutes === null) return isShortOfFixedFloor(profile);
  return isBelowFixedFloor(minutes, mode);
}
