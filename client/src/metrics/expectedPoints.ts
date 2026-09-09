import type { NormalizedPlayer, Position } from "../types/normalized";
import type { UpcomingFixture } from "./fixtureTicker";
import { MIN_QUALIFYING_SEASON_MINUTES, type HistoricPlayerProfile } from "./historicAnalysis";
import { resolvePlayerStats } from "./resolvePlayerStats";

export type ExpectedPointsWindow = 1 | 3 | 5;

/**
 * How much a fixture's difficulty (1 easiest – 5 hardest) moves the
 * expected-points estimate away from FDR-3 (neutral), per position.
 * Forwards/midfielders swing more on attacking difficulty; defenders and
 * goalkeepers swing on the same FDR number but it matters relatively less
 * to their points floor (appearance points, DC points, and save points
 * aren't as fixture-dependent as goal threat is). These are judgement
 * calls, not fitted coefficients — see README.
 */
export const FDR_SENSITIVITY: Record<Position, number> = {
  GKP: 0.08,
  DEF: 0.08,
  MID: 0.1,
  FWD: 0.12,
};

/** Exported for reuse by the Chip Planner, which extends the same fixture-difficulty-scaling logic much further into the season — see metrics/chipPlanner.ts for that extension's own, more prominent caveat. */
export function fixtureMultiplier(difficulty: number, position: Position): number {
  return 1 + (3 - difficulty) * FDR_SENSITIVITY[position];
}

/**
 * Sums expected points across the player's next `window` fixtures (not
 * calendar gameweeks — a team with a blank gameweek simply has no
 * fixture that week and contributes nothing for it automatically, by
 * using "next N fixtures" as the unit rather than "next N gameweek
 * slots"; a double gameweek's two fixtures both count).
 *
 * The immediate next fixture uses FPL's own `ep_next` unmodified —
 * "just use that number", not blended with anything of ours. Fixtures
 * after that have no FPL-published estimate, so they're `ep_next`
 * scaled by that specific fixture's own difficulty rating relative to a
 * neutral FDR of 3 — the only extension applied, and it's built entirely
 * from real, FPL-published difficulty data, not a second invented model.
 *
 * Returns null if the player has no ep_next (shouldn't happen for an
 * active player, but never silently substitutes 0) or no upcoming
 * fixtures at all in the window (e.g. season already over).
 */
export function computeExpectedPointsForWindow(player: NormalizedPlayer, upcomingFixtures: UpcomingFixture[], window: ExpectedPointsWindow): number | null {
  if (player.epNext === null) return null;
  const fixtures = upcomingFixtures.slice(0, window);
  if (fixtures.length === 0) return null;

  let total = 0;
  fixtures.forEach((fixture, i) => {
    total += computeExpectedPointsForSingleFixture(player, fixture, i) ?? 0;
  });
  return total;
}

/**
 * The single-fixture building block computeExpectedPointsForWindow sums
 * across a window — exposed on its own for the gameweek navigator (Team
 * Building's pitch view and Add Players table), which shows exactly one
 * upcoming fixture's estimate at a time rather than a summed window.
 * `fixtureIndexZeroBased` is the fixture's position in the player's own
 * upcoming-fixtures list (0 = the very next one, still `ep_next`
 * unmodified; every fixture after that is `ep_next` scaled by ITS OWN
 * difficulty rating) — not a calendar gameweek number, same "next N
 * fixtures" unit used throughout this app.
 */
export function computeExpectedPointsForSingleFixture(player: NormalizedPlayer, fixture: UpcomingFixture, fixtureIndexZeroBased: number): number | null {
  if (player.epNext === null) return null;
  return fixtureIndexZeroBased === 0 ? player.epNext : player.epNext * fixtureMultiplier(fixture.difficulty, player.position);
}

export interface ExpPointsBreakdown {
  /** FPL's own ep_next, extended by fixture difficulty — see computeExpectedPointsForWindow. */
  fplPredicted: number | null;
  /** Last completed season's points-per-game × window — a flat rate extrapolation, not fixture-adjusted (that season is over; there's nothing to adjust against). */
  lastSeason: number | null;
  /** Qualifying historic-average points-per-game × window, same reasoning as lastSeason. */
  historicAverage: number | null;
  /** Mean of whichever of the three above exist — never down-weighted by a missing one. Null only if all three are missing. */
  overallAverage: number | null;
  /** False whenever fewer than all three inputs were available — shown as a marker on the cell, not hidden. */
  overallAverageComplete: boolean;
}

/**
 * Builds all four "Exp. Pts" figures for one player at once. The three
 * inputs come from genuinely different places (FPL's own forward-looking
 * prediction; two backward-looking rates re-purposed as a per-window
 * estimate), so a player can legitimately have some and not others — a
 * summer signing has no Last Completed Season figure, someone who only
 * just reached the qualifying-minutes bar has no Historic Average one.
 * The Overall Average is deliberately a mean of whatever exists, not a
 * sum divided by 3, so a missing input never drags the average toward
 * zero.
 *
 * <small_sample_fix>: `pointsPerGame` (despite the name) is points per
 * 90 *minutes played*, not points per game — an approximation this app
 * has used since early on because a directly comparable "games played"
 * figure wasn't available per historic season. For a well-sampled
 * season that's a reasonable stand-in; for a player with, say, 45
 * minutes and one lucky haul last season, it produces a wildly
 * unrepresentative rate that then gets multiplied by the GW window,
 * compounding the distortion further. `resolvePlayerStats`'s
 * "lastSeason" mode deliberately applies no minutes floor at all — by
 * design, for its own descriptive purpose elsewhere in the app (an
 * injury-hit season is real data, not noise, when the question is
 * literally "what happened last season"). That's correct there and
 * wrong here: an Exp Pts figure is a forward-looking estimate, and a
 * rate built from a handful of minutes isn't a reliable one to
 * extrapolate from. Both `lastSeason` and `historicAverage` here require
 * the season(s) behind the rate to clear `MIN_QUALIFYING_SEASON_MINUTES`
 * (the same 900-minute bar already used to decide which seasons qualify
 * for a historic average at all) before trusting the rate — below that,
 * the figure is null rather than a misleadingly precise-looking number.
 * Historic Average's qualifying seasons already individually clear this
 * bar by construction, so this rarely changes anything there; Last
 * Completed Season had no such floor at all, which is what caused the bug.
 */
export function computeExpPointsBreakdown(
  player: NormalizedPlayer,
  upcomingFixtures: UpcomingFixture[],
  window: ExpectedPointsWindow,
  historicProfile: HistoricPlayerProfile | undefined,
  currentSeasonHasStarted: boolean,
): ExpPointsBreakdown {
  const fplPredicted = computeExpectedPointsForWindow(player, upcomingFixtures, window);

  const lastSeasonPlayer = resolvePlayerStats(player, "lastSeason", historicProfile, currentSeasonHasStarted);
  const lastSeasonQualifies = lastSeasonPlayer.minutes !== null && lastSeasonPlayer.minutes >= MIN_QUALIFYING_SEASON_MINUTES;
  const lastSeasonRate = lastSeasonQualifies ? lastSeasonPlayer.pointsPerGame : null;
  const lastSeason = lastSeasonRate !== null ? lastSeasonRate * window : null;

  const historicAvgPlayer = resolvePlayerStats(player, "historicAverage", historicProfile, currentSeasonHasStarted);
  const historicAvgQualifies = historicAvgPlayer.minutes !== null && historicAvgPlayer.minutes >= MIN_QUALIFYING_SEASON_MINUTES;
  const historicAvgRate = historicAvgQualifies ? historicAvgPlayer.pointsPerGame : null;
  const historicAverage = historicAvgRate !== null ? historicAvgRate * window : null;

  const inputs = [fplPredicted, lastSeason, historicAverage].filter((v): v is number => v !== null);
  const overallAverage = inputs.length > 0 ? inputs.reduce((a, b) => a + b, 0) / inputs.length : null;

  return { fplPredicted, lastSeason, historicAverage, overallAverage, overallAverageComplete: inputs.length === 3 };
}
