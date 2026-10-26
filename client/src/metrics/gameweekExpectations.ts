import { firstPickableEventId, type UpcomingFixture } from "./fixtureTicker";
import type { ModelBreakdown } from "./pointsModel";
import type { FplBreakdown } from "./expectedPoints";
import type { NormalizedEvent } from "../types/normalized";

/** How many gameweeks Team Building looks ahead: the pitch's and Add Players' gameweek arrows. */
export const LOOKAHEAD_GAMEWEEKS = 5;

/**
 * <upcoming_gameweeks>: the real gameweeks Team Building looks ahead to,
 * by FPL's own numbering: up to `count` of them, starting at the first one
 * still open for picks (firstPickableEventId, FPL's `is_next`), and only
 * gameweeks the season has. So the labels follow the season by themselves:
 * GW1–5 before it starts, GW9–13 after the GW8 deadline, just GW37–38
 * near the end, and none once the last deadline has passed or while
 * events aren't loaded.
 */
export function upcomingGameweeks(events: Pick<NormalizedEvent, "id" | "isNext">[], count = LOOKAHEAD_GAMEWEEKS): number[] {
  const from = firstPickableEventId(events);
  if (from === null) return [];
  return events
    .map((e) => e.id)
    .filter((id) => id >= from)
    .sort((a, b) => a - b)
    .slice(0, count);
}

/** Which Exp. Pts: FPL Official or Model Predicted, never mixed. */
export type PointsSource = "fpl" | "model";

/** One player's Exp. Pts for one gameweek: his matches in it, added up. */
export interface GameweekExpectation {
  eventId: number;
  /** His club's matches that gameweek: none (a blank), one, or two (a double). */
  fixtures: UpcomingFixture[];
  /** FPL Official for each of his matches (<fpl_official>); null for a blank or with no figure. */
  fplBreakdowns: FplBreakdown[] | null;
  /** FPL Official, summed over his matches; null when fplBreakdowns is. Not captain-doubled. */
  fpl: number | null;
  /** The Model's figure for each of his matches; null for a blank or with no figure. */
  modelBreakdowns: ModelBreakdown[] | null;
  /** The Model's figures summed; null when modelBreakdowns is. Not captain-doubled. */
  model: number | null;
  /** <expected_minutes>: the minutes the Model expects him to play in his matches that gameweek, added up (a double's two); null when modelBreakdowns is. */
  expectedMinutes: number | null;
}

/** Every figure added up; null with none, or when any is missing (a part of a double can't be left out of a gameweek's figure). */
function sumAll<T>(values: T[], value: (v: T) => number | null): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) {
    const n = value(v);
    if (n === null) return null;
    sum += n;
  }
  return sum;
}

/**
 * His Exp. Pts for gameweek `eventId`: each of his matches in it worked
 * out as before (`fplFor` gets the match's place in his upcoming list, so
 * form counts for less the further ahead it is, <fpl_official>), then
 * added up — a double gameweek counts both matches, a
 * blank has none and no figure (`fixtures` empty).
 */
export function expectationForGameweek(
  upcoming: readonly UpcomingFixture[],
  eventId: number,
  fplFor: (fixture: UpcomingFixture, index: number) => FplBreakdown | null,
  modelFor: (fixture: UpcomingFixture) => ModelBreakdown | null,
): GameweekExpectation {
  const matches = upcoming.flatMap((fixture, index) => (fixture.eventId === eventId ? [{ fixture, index }] : []));
  const fplParts = matches.map((m) => fplFor(m.fixture, m.index));
  const fplBreakdowns = fplParts.length > 0 && fplParts.every((b): b is FplBreakdown => b !== null) ? fplParts : null;
  const breakdowns = matches.map((m) => modelFor(m.fixture));
  const modelBreakdowns = breakdowns.length > 0 && breakdowns.every((b): b is ModelBreakdown => b !== null) ? breakdowns : null;
  return {
    eventId,
    fixtures: matches.map((m) => m.fixture),
    fplBreakdowns,
    fpl: fplBreakdowns ? sumAll(fplBreakdowns, (b) => b.total) : null,
    modelBreakdowns,
    model: modelBreakdowns ? sumAll(modelBreakdowns, (b) => b.total) : null,
    expectedMinutes: modelBreakdowns ? sumAll(modelBreakdowns, (b) => b.expectedMinutes) : null,
  };
}

/** <points_horizon>: how many upcoming gameweeks an Exp. Pts column adds up (1 = the next one alone). */
export const HORIZONS = [1, 2, 3, 4, 5] as const;
export type Horizon = (typeof HORIZONS)[number];

/**
 * <points_horizon>: one source's Exp. Pts over his first `horizon`
 * gameweeks (`expectations`, in gameweek order, from the next one): a
 * blank counts 0 (he has no match, so no points), a gameweek with a match
 * but no figure leaves the whole sum unknown (null), never part-counted.
 * Null with no gameweek left.
 */
export function horizonTotal(expectations: readonly GameweekExpectation[], horizon: number, source: PointsSource): number | null {
  const window = expectations.slice(0, horizon);
  if (window.length === 0) return null;
  let total = 0;
  for (const g of window) {
    if (g.fixtures.length === 0) continue;
    const value = g[source];
    if (value === null) return null;
    total += value;
  }
  return total;
}
