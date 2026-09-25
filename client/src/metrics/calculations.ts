/**
 * All derived metrics live here, centralised, so no component duplicates a
 * formula. Every function follows <zero_handling>:
 *  - division by zero → null
 *  - any null input → null
 *  - never NaN / Infinity / undefined
 */

function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  if (denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

function safeSubtract(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return a - b;
}

export function pointsPerMillion(totalPoints: number | null, priceInMillions: number | null): number | null {
  return safeDivide(totalPoints, priceInMillions);
}

export function xGPerMillion(xG: number | null, priceInMillions: number | null): number | null {
  return safeDivide(xG, priceInMillions);
}

export function xAPerMillion(xA: number | null, priceInMillions: number | null): number | null {
  return safeDivide(xA, priceInMillions);
}

export function xGIPerMillion(xGI: number | null, priceInMillions: number | null): number | null {
  return safeDivide(xGI, priceInMillions);
}

/**
 * <per_game_not_per_90>: this app used to normalize goal/assist/expected-
 * stats/defensive metrics as a per-90-minutes rate (total ÷ minutes × 90)
 * — replaced app-wide with a per-GAME basis after that formula
 * repeatedly produced nonsensical results for a low-minutes cameo (a
 * "Points/90" of 180.0 was confirmed, from a live screenshot, to be
 * exactly 2 points scored in 1 minute — 2/1*90). The ×90 multiplier is
 * greater than 1 for any minutes total below 90 and only a dampener at
 * or above it, so it structurally amplifies a tiny sample rather than
 * just describing it.
 *
 * Real games-played isn't available from the FPL API for the whole
 * player population in one request (only fetched per-player, lazily,
 * via gameweek history when a profile is opened) — so it's estimated
 * from cumulative minutes instead. Per explicit product direction: ANY
 * appearance, even a single minute, should count as a full game played,
 * so a player whose minutes are fragmented across several small cameos
 * gets divided by MORE estimated games (a lower, more conservative
 * rate) — the opposite bias from the old per-90 problem, pushing
 * low-minutes cameo players down rather than letting them spike up.
 * That means always rounding UP (`Math.ceil`), never to the nearest or
 * down: 95 minutes (a full match plus 5 more) is at least 2 separate
 * appearances, never 1.
 *
 * <estimation_limit>: this can still under-count truly fragmented
 * appearances — ten separate 1-minute cameos summing to 10 minutes look
 * identical, from cumulative minutes alone, to one 10-minute cameo, both
 * estimating to 1 game — since the app has no per-gameweek data for the
 * whole population to tell them apart. A real, disclosed limitation of
 * estimating from a cumulative total rather than counting actual
 * appearances; see README.
 */
export function estimatedGamesFromMinutes(minutes: number): number {
  return minutes > 0 ? Math.max(1, Math.ceil(minutes / 90)) : 0;
}

/**
 * <games_from_total_minutes>: estimated games per season over several
 * seasons (Historic Average) — the TOTAL minutes across them, rounded up
 * to games once, then shared across the seasons. Rounding each season's
 * average minutes up instead adds up to a whole extra game per season for
 * a player with light seasons (Reed 2022/23–2025/26: 13 vs 12.25), which
 * understated every per-game rate there (audit 2026-09-25, V1). A
 * per-season stat divided by this is exactly total stat ÷ total games.
 */
export function estimatedGamesPerSeason(totalMinutes: number, seasons: number): number {
  return seasons > 0 ? estimatedGamesFromMinutes(totalMinutes) / seasons : 0;
}

/**
 * Total ÷ an already-estimated number of games (a resolved player's
 * `estimatedGames`, set once per analysis mode by resolvePlayerStats).
 * Zero games returns null (an undefined rate, not a fake zero) per
 * <zero_handling>.
 */
export function perEstimatedGame(total: number | null, games: number | null): number | null {
  if (total === null || games === null || games === 0) return null;
  return total / games;
}

/**
 * The general per-game shape for a metric with no API-supplied per-game
 * equivalent — total ÷ estimated games (see estimatedGamesFromMinutes
 * above). Zero minutes returns null (an undefined rate, not a fake
 * zero) per <zero_handling> — see estimatedPointsPerGame below for the
 * one deliberate exception to that.
 */
export function perGame(total: number | null, minutes: number | null): number | null {
  if (minutes === null) return null;
  return perEstimatedGame(total, estimatedGamesFromMinutes(minutes));
}

/** estimatedPointsPerGame() for an already-estimated number of games: 0 games (0 minutes) divides by 1, so 0 points in 0 minutes is a real 0.0 (<ppg_vs_per90>). */
export function pointsPerEstimatedGame(totalPoints: number | null, games: number | null): number | null {
  if (totalPoints === null || games === null) return null;
  return safeDivide(totalPoints, games > 0 ? games : 1);
}

/**
 * <ppg_vs_per90>: kept as its own function rather than a plain
 * perGame() call, for one deliberate difference — a player confirmed to
 * have played zero minutes with zero points (a real, on-the-record
 * season with nothing to show, not missing data) shows a genuine "0.0"
 * here rather than perGame()'s "—", matching this metric's existing
 * behaviour from before the wider per-game rollout. Used in every analysis
 * mode, the live season included: FPL's own bootstrap `points_per_game` is
 * points per appearance (a 10-minute cameo counts as a whole game), so
 * reading it for the live season made PPG a different measure there than
 * in the historic modes and than every other per-game column.
 */
export function estimatedPointsPerGame(totalPoints: number | null, minutes: number | null): number | null {
  if (minutes === null) return null;
  return pointsPerEstimatedGame(totalPoints, estimatedGamesFromMinutes(minutes));
}

/**
 * True per-90-minutes rate (total ÷ minutes × 90) — kept only for
 * Expected Points Tier 2's minute-projection model
 * (metrics/expectedPointsV2.ts), which multiplies a rate by an expected
 * FRACTION OF MINUTES for one upcoming fixture; that projection is
 * genuinely minutes-based, since it's asking "how much of the next
 * single match will this player be on the pitch for" — a per-game
 * figure has no meaningful way to be scaled by a fraction of one match.
 * Every user-facing display metric elsewhere in the app uses perGame()
 * instead — do not add a new display consumer of this function.
 */
export function per90(total: number | null, minutes: number | null): number | null {
  const perMinute = safeDivide(total, minutes);
  if (perMinute === null) return null;
  return perMinute * 90;
}

export function minutesPerPoint(minutes: number | null, totalPoints: number | null): number | null {
  return safeDivide(minutes, totalPoints);
}

export function minutesPerGoal(minutes: number | null, goals: number | null): number | null {
  return safeDivide(minutes, goals);
}

export function minutesPerAssist(minutes: number | null, assists: number | null): number | null {
  return safeDivide(minutes, assists);
}

export function goalsMinusXG(goals: number | null, xG: number | null): number | null {
  return safeSubtract(goals, xG);
}

export function assistsMinusXA(assists: number | null, xA: number | null): number | null {
  return safeSubtract(assists, xA);
}

export function goalInvolvementsMinusXGI(goals: number | null, assists: number | null, xGI: number | null): number | null {
  if (goals === null || assists === null || xGI === null) return null;
  return goals + assists - xGI;
}
