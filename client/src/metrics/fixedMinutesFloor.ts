import type { AnalysisMode } from "./resolvePlayerStats";

/**
 * <fixed_minutes_floor>: the minimum-minutes principle (the owner's rule,
 * README "Minimum minutes"). A floor exists only to stop a tiny sample
 * taking over. Where the user can set minimum minutes (Player Explorer's
 * MINS filter, a Dashboard tile or graph they build, Team Building) the
 * app adds nothing. Where they can't — the player profile, Player
 * Comparison, the Team Profile and the packaged Default Dashboard views —
 * this fixed floor applies: one full match in Current Season, five
 * otherwise.
 *
 * In those sections a player below it is a small sample: no percentile,
 * no colour. Their Historic Average also leaves out seasons with 0 minutes
 * (resolvePlayerStats' `dropZeroMinuteSeasons`).
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
