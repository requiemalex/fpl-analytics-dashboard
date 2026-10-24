import type { Position } from "../types/normalized";
import type { AnalysisMode } from "./resolvePlayerStats";
import { fixedFloorMinutes } from "./fixedMinutesFloor";
import { averageFixtureDifficulty, type UpcomingFixture } from "./fixtureTicker";

/**
 * <comparative_colouring>: the one rule for green/red on a stat (the
 * owner's decision, 2026-10-19; README "Comparative colouring"). Wherever a
 * figure is shown, its colour says how it ranks:
 *
 * - a player's, within his position, among every player in the view's
 *   whole pool (its Data View) — never only the rows a filter or search
 *   leaves on screen;
 * - a club's, among every club with a figure (all 20 in a season).
 *
 * A player under the fixed floor for the view's Data View (a quarter of
 * the minutes available: fixedMinutesFloor.ts) gets no colour and
 * isn't in anyone's pool — wherever the figure is, whatever minimum the
 * user has set for the rows themselves. Clubs have no floor.
 *
 * The rank is a percentile (0–100, half of any ties counted below),
 * flipped for a lower-is-better figure so a higher rank is always better;
 * percentileTint (utils/colorScale.ts) turns it into the colour. A pool of
 * fewer than two has no rank: a comparison with nobody isn't one.
 */

/** Ranks `value` within `sorted` (ascending): the share below it, plus half the share equal to it. */
function percentileInSorted(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  const below = lo;
  hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  const equal = lo - below;
  return ((below + equal / 2) / sorted.length) * 100;
}

function flip(percentile: number, higherIsBetter: boolean): number {
  return higherIsBetter ? percentile : 100 - percentile;
}

/**
 * Every eligible row's rank within its group, keyed by `id`. A row that
 * isn't eligible, has no value, or is alone in its group has no entry.
 */
export function rankWithinGroups<T>(
  rows: readonly T[],
  opts: { id: (r: T) => number; group: (r: T) => string | number; eligible: (r: T) => boolean; value: (r: T) => number | null; higherIsBetter: boolean },
): Map<number, number> {
  const byGroup = new Map<string | number, { id: number; v: number }[]>();
  for (const r of rows) {
    if (!opts.eligible(r)) continue;
    const v = opts.value(r);
    if (v === null || !Number.isFinite(v)) continue;
    const g = opts.group(r);
    const list = byGroup.get(g) ?? [];
    list.push({ id: opts.id(r), v });
    byGroup.set(g, list);
  }
  const out = new Map<number, number>();
  for (const list of byGroup.values()) {
    if (list.length < 2) continue;
    const sorted = list.map((x) => x.v).sort((a, b) => a - b);
    for (const x of list) out.set(x.id, flip(percentileInSorted(sorted, x.v), opts.higherIsBetter));
  }
  return out;
}

/** Whether a player's figures for the mode are coloured and compared: he has minutes for it, at or above the fixed floor. */
export function isColourEligible(minutes: number | null, mode: AnalysisMode): boolean {
  return minutes !== null && minutes >= fixedFloorMinutes(mode);
}

/** Players' ranks within their position for one figure (see the rule above), keyed by player id. */
export function positionRanks<T>(
  rows: readonly T[],
  opts: { id: (r: T) => number; position: (r: T) => Position; minutes: (r: T) => number | null; mode: AnalysisMode; value: (r: T) => number | null; higherIsBetter: boolean },
): Map<number, number> {
  return rankWithinGroups(rows, {
    id: opts.id,
    group: opts.position,
    eligible: (r) => isColourEligible(opts.minutes(r), opts.mode),
    value: opts.value,
    higherIsBetter: opts.higherIsBetter,
  });
}

/** Clubs' ranks among every club with a figure, keyed by club id. */
export function clubRanks<T>(rows: readonly T[], opts: { id: (r: T) => number; value: (r: T) => number | null; higherIsBetter: boolean }): Map<number, number> {
  return rankWithinGroups(rows, { id: opts.id, group: () => 0, eligible: () => true, value: opts.value, higherIsBetter: opts.higherIsBetter });
}

/**
 * Where one figure ranks among others' (the pool, which must not include
 * it), flipped for lower-is-better — for a figure that isn't a row of a
 * list: a per-match average, a past season's total, an Understat figure
 * from a shot list. Null with nobody else to compare with.
 */
export function rankAmong(value: number | null, others: readonly number[], higherIsBetter: boolean): number | null {
  if (value === null || !Number.isFinite(value) || others.length === 0) return null;
  const sorted = [...others, value].sort((a, b) => a - b);
  return flip(percentileInSorted(sorted, value), higherIsBetter);
}

/**
 * A column's colour direction: true when more is better, false when less
 * is, null when it isn't coloured at all — a figure that isn't better or
 * worse (games played, draws, a style statistic like set-piece share).
 */
export function colourDirection(c: { higherIsBetter?: boolean; noColour?: boolean }): boolean | null {
  if (c.noColour) return null;
  return c.higherIsBetter !== false;
}

/**
 * Each club's average upcoming fixture difficulty ranked among every
 * club's — easier is better. A club figure, so it follows the club rule
 * wherever it's shown (a player's row shows his club's).
 */
export function fixtureDifficultyRanks(fixturesByTeamId: ReadonlyMap<number, UpcomingFixture[]>): Map<number, number> {
  return clubRanks([...fixturesByTeamId], { id: ([teamId]) => teamId, value: ([, fixtures]) => averageFixtureDifficulty(fixtures), higherIsBetter: false });
}
