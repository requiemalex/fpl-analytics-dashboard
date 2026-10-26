import type { NormalizedPlayer, Position } from "../types/normalized";
import type { UpcomingFixture } from "./fixtureTicker";
import { MIN_QUALIFYING_SEASON_MINUTES, type HistoricPlayerProfile } from "./historicAnalysis";
import { resolvePlayerStats } from "./resolvePlayerStats";
import { computeCareerAverages } from "./careerMetrics";
import { estimatedPointsPerGame } from "./calculations";
import { availabilityModifier } from "./availability";
import { SCORING_RULES } from "./pointsModel";
import { MODEL_PARAMS } from "./pointsModelParams.generated";

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

/** How much a fixture's difficulty scales a position's expected points (FDR 3 = no change). */
export function fixtureMultiplier(difficulty: number, position: Position): number {
  return 1 + (3 - difficulty) * FDR_SENSITIVITY[position];
}

/**
 * <fpl_official>: how much of an FPL Official figure is his form (FPL's
 * `ep_next`), by how far ahead the match is in his upcoming list (0 = his
 * next); later matches keep the last share. The rest is his season
 * (fplSeasonRate). Judgement calls, not fitted coefficients — see README
 * "Exp. Pts (FPL Official)": form is three or four matches, so it says
 * more about the next match than one a month away.
 */
export const FORM_SHARE: readonly number[] = [0.2, 0.15, 0.1];

/**
 * <fpl_official>: his season so far as points per match he was registered
 * for (`registeredMatches`, his <season_matches>: a match he sat out counts
 * as a 0, as in FPL's form), his goals and assists moved toward his xG and
 * xA by Model Predicted's fitted weights (`goalXgWeight`, `assistXaWeight`)
 * at FPL's points for each, never below 0. Not FPL's `points_per_game`:
 * that's per appearance, so it skips the weeks he was benched or rotated
 * out. Null before his first match or while his matches haven't loaded.
 */
export function fplSeasonRate(
  player: Pick<NormalizedPlayer, "position" | "totalPoints" | "goals" | "assists" | "xG" | "xA">,
  registeredMatches: number | undefined,
): number | null {
  if (!registeredMatches || player.totalPoints === null) return null;
  let points = player.totalPoints;
  if (player.xG !== null && player.goals !== null) points += MODEL_PARAMS.goalXgWeight * SCORING_RULES.goal[player.position] * (player.xG - player.goals);
  if (player.xA !== null && player.assists !== null) points += MODEL_PARAMS.assistXaWeight * SCORING_RULES.assist * (player.xA - player.assists);
  return Math.max(0, points / registeredMatches);
}

/** One match's FPL Official figure, in parts (for its hover). */
export interface FplBreakdown {
  total: number;
  /** FPL's `ep_next`: his form × FPL's chance of playing. */
  epNext: number;
  /** fplSeasonRate; null when there's none, and the figure is `ep_next` alone. */
  seasonRate: number | null;
  /** FORM_SHARE for this match; 1 when seasonRate is null. */
  formShare: number;
  /** FPL's chance of playing (availabilityModifier), applied to the season part. */
  availability: number;
  /** fixtureMultiplier for this match. */
  multiplier: number;
}

/**
 * <fpl_official>: one upcoming match's FPL Official figure, from FPL's own
 * figures: `(share × ep_next + (1 − share) × season × chance of playing) ×
 * fixtureMultiplier`. `ep_next` is FPL's form × its chance of playing, with
 * no fixture or season in it (checked against every available player,
 * 2026-10-26), so the fixture scales every match, the next one included.
 * Without a season rate (or an availability), `ep_next × fixtureMultiplier`.
 * `fixtureIndexZeroBased` is the match's place in his upcoming list (a
 * double's second match is one further on). Null without `ep_next`, never 0.
 */
export function fplOfficialForFixture(
  player: NormalizedPlayer,
  fixture: UpcomingFixture,
  fixtureIndexZeroBased: number,
  seasonRate: number | null,
): FplBreakdown | null {
  if (player.epNext === null) return null;
  const multiplier = fixtureMultiplier(fixture.difficulty, player.position);
  const availability = availabilityModifier(player);
  if (seasonRate === null || availability === null) {
    return { total: player.epNext * multiplier, epNext: player.epNext, seasonRate: null, formShare: 1, availability: availability ?? 1, multiplier };
  }
  const formShare = FORM_SHARE[Math.min(fixtureIndexZeroBased, FORM_SHARE.length - 1)];
  const total = (formShare * player.epNext + (1 - formShare) * seasonRate * availability) * multiplier;
  return { total, epNext: player.epNext, seasonRate, formShare, availability, multiplier };
}

/**
 * Sums expected points across the player's next `window` fixtures (not
 * calendar gameweeks — a team with a blank gameweek simply has no
 * fixture that week and contributes nothing for it automatically, by
 * using "next N fixtures" as the unit rather than "next N gameweek
 * slots"; a double gameweek's two fixtures both count), each one
 * computeExpectedPointsForSingleFixture.
 *
 * Returns null if the player has no ep_next (shouldn't happen for an
 * active player, but never silently substitutes 0) or no upcoming
 * fixtures at all in the window (e.g. season already over).
 */
export function computeExpectedPointsForWindow(
  player: NormalizedPlayer,
  upcomingFixtures: UpcomingFixture[],
  window: ExpectedPointsWindow,
  seasonRate: number | null = null,
): number | null {
  if (player.epNext === null) return null;
  const fixtures = upcomingFixtures.slice(0, window);
  if (fixtures.length === 0) return null;

  let total = 0;
  fixtures.forEach((fixture, i) => {
    total += computeExpectedPointsForSingleFixture(player, fixture, i, seasonRate) ?? 0;
  });
  return total;
}

/** fplOfficialForFixture's figure alone. */
export function computeExpectedPointsForSingleFixture(
  player: NormalizedPlayer,
  fixture: UpcomingFixture,
  fixtureIndexZeroBased: number,
  seasonRate: number | null = null,
): number | null {
  return fplOfficialForFixture(player, fixture, fixtureIndexZeroBased, seasonRate)?.total ?? null;
}

export interface ExpPointsBreakdown {
  /** FPL's own ep_next, extended by fixture difficulty (no season rate: this breakdown isn't shown) — see computeExpectedPointsForWindow. */
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
 *
 * <expected_points_frozen>: `historicAverage` here is built directly from
 * `historicProfile.qualifyingSeasons` (via a local computeCareerAverages
 * call), not from `resolvePlayerStats(player, "historicAverage", ...)`
 * the way it briefly was — that shared helper's "historicAverage" mode
 * now averages across every season in the window, unfiltered (see
 * <no_survivorship_bias> in historicAnalysis.ts), which would silently
 * have changed this model's input too. Expected Points modeling is
 * being revisited separately, so this keeps its prior qualifying-only
 * basis byte-for-byte unchanged for now.
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

  const qualifyingSeasons = historicProfile?.qualifyingSeasons ?? [];
  const historicAvg = qualifyingSeasons.length > 0 ? computeCareerAverages(qualifyingSeasons) : null;
  const historicAvgQualifies = historicAvg !== null && historicAvg.avgMinutesPerSeason !== null && historicAvg.avgMinutesPerSeason >= MIN_QUALIFYING_SEASON_MINUTES;
  const historicAvgRate = historicAvgQualifies ? estimatedPointsPerGame(historicAvg.avgPointsPerSeason, historicAvg.avgMinutesPerSeason) : null;
  const historicAverage = historicAvgRate !== null ? historicAvgRate * window : null;

  const inputs = [fplPredicted, lastSeason, historicAverage].filter((v): v is number => v !== null);
  const overallAverage = inputs.length > 0 ? inputs.reduce((a, b) => a + b, 0) / inputs.length : null;

  return { fplPredicted, lastSeason, historicAverage, overallAverage, overallAverageComplete: inputs.length === 3 };
}
