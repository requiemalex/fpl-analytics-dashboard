import type { AnalysisMode } from "./resolvePlayerStats";
import type { HistoricPlayerProfile } from "./historicAnalysis";
import { finishedGameweeks } from "../state/seasonProgress";

/**
 * <fixed_minutes_floor>: the minimum-minutes principle (the owner's rule,
 * README "Minimum minutes"). A floor exists only to stop a tiny sample
 * taking over. Where the user can set minimum minutes (Player Explorer's
 * MINS filter, a Dashboard tile or graph they build, a Player Comparison
 * card in a view they build, Team Building) theirs is the only one for
 * which rows show, in every Data View. Where they can't — the player
 * profile and the packaged Starter views on the Dashboard and Player
 * Comparison — this fixed floor applies. Colours use it everywhere.
 *
 * The floor is a quarter of the minutes available (the owner's rule,
 * 2026-10-24): a completed season's 38 matches make it 855; in Current
 * Season it grows with the gameweeks finished so far, never under one
 * full match, so it keeps pace as the season goes on.
 *
 * Below it a player is a small sample: no percentile, no colour.
 * Historic Average counts only seasons that reach FIXED_FLOOR_MINUTES
 * (HistoricPlayerProfile.floorWindowAverage), everywhere.
 */
export const FLOOR_SEASON_SHARE = 0.25;
const MATCH_MINUTES = 90;
const SEASON_MATCHES = 38;
/** Current Season's floor never drops below one full match, so a cameo in the first gameweeks can't top a chart. */
export const FIXED_FLOOR_LIVE_MINIMUM = MATCH_MINUTES;
export const FIXED_FLOOR_MINUTES = Math.ceil(FLOOR_SEASON_SHARE * SEASON_MATCHES * MATCH_MINUTES);

/** Current Season's floor: a quarter of the minutes in the gameweeks finished so far, never under one full match. */
export function liveFloorMinutes(gameweeks: number = finishedGameweeks()): number {
  return Math.max(FIXED_FLOOR_LIVE_MINIMUM, Math.ceil(FLOOR_SEASON_SHARE * gameweeks * MATCH_MINUTES));
}

export function fixedFloorMinutes(mode: AnalysisMode): number {
  return mode === "live" ? liveFloorMinutes() : FIXED_FLOOR_MINUTES;
}

/**
 * <no_data_is_zero>: a player with no minutes for the mode counts as 0
 * against any minimum — the user's or the fixed floor — so he's under it
 * (the owner's rule, 2026-10-19). Every minimum-minutes check that decides
 * whether a player is shown, ranked, coloured or marked goes through this.
 */
export function isUnderMinimum(minutes: number | null, minimum: number): boolean {
  return (minutes ?? 0) < minimum;
}

/** A player with minutes for the mode, but fewer than the floor. Null minutes here is "no data" — the profile says so in words rather than calling it a small sample. */
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
 * Whether a resolved player is a small
 * sample for the mode. In Historic Average every counted season already
 * reaches the floor, so the question there is whether any season did: one
 * who played but never reached it has no figures (null minutes) and is a
 * small sample, not "no data" (isShortOfFixedFloor).
 */
export function isFixedFloorSmallSample(minutes: number | null, mode: AnalysisMode, profile: HistoricPlayerProfile | undefined): boolean {
  if (mode === "historicAverage" && minutes === null) return isShortOfFixedFloor(profile);
  return isBelowFixedFloor(minutes, mode);
}
