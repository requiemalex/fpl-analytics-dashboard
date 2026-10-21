/**
 * <shots_faced_on_pitch>: when a player was on the pitch in a match, from
 * Understat's line-up entry — what a defender's or goalkeeper's shots
 * faced count (his club's opponents' shots while he was on). A starter
 * from kick-off until his minutes run out (all of the match, stoppage time
 * included, at 90); a substitute ("Sub") from 90 minus his minutes to the
 * end. Understat counts a match as 90 minutes (a club's players' minutes
 * add up to 990, or a minute or two over), and shot minutes and playing
 * time are whole minutes, so a shot around a substitution can be a minute
 * out.
 *
 * Shared by the season summaries (pipeline/aggregate.ts) and the profile
 * route (route.ts), so the two always count the same shots.
 */
export const MATCH_MINUTES = 90;

export interface OnPitch {
  from: number;
  to: number;
}

export function onPitchWindow(position: string, minutes: number): OnPitch {
  if (position === "Sub") return { from: MATCH_MINUTES - minutes, to: Infinity };
  return { from: 0, to: minutes >= MATCH_MINUTES ? Infinity : minutes };
}

export function wasOnPitch(window: OnPitch, minute: number): boolean {
  return minute >= window.from && minute <= window.to;
}
