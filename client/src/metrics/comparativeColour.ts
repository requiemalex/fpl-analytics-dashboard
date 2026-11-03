import type { Position } from "../types/normalized";
import type { AnalysisMode } from "./resolvePlayerStats";
import { fixedFloorMinutes, isUnderMinimum } from "./fixedMinutesFloor";
import { percentileInPool, percentileInSortedPool } from "./percentiles";
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
 * fewer than two has no rank: a comparison with nobody isn't one. The
 * formula and that rule are percentileFromCounts (metrics/percentiles.ts),
 * the one every rank in the app goes through (<one_rank_rule>).
 */

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
    const sorted = list.map((x) => x.v).sort((a, b) => a - b);
    for (const x of list) {
      const rank = percentileInSortedPool(x.v, sorted, opts.higherIsBetter);
      if (rank !== null) out.set(x.id, rank);
    }
  }
  return out;
}

/** Whether a player's figures for the mode are coloured and compared: his minutes for it are at or above the fixed floor (no data counts as 0: isUnderMinimum). */
export function isColourEligible(minutes: number | null, mode: AnalysisMode): boolean {
  return !isUnderMinimum(minutes, fixedFloorMinutes(mode));
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
  if (value === null || !Number.isFinite(value)) return null;
  return percentileInPool(value, [...others, value], higherIsBetter);
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
 * The direction a figure is ranked in for its hover's percentile
 * (<stat_hover>): its colour direction, or higher first for a neutral
 * figure (ranked, never coloured); null for one that isn't ranked at all
 * (`unranked`: matches played, the same for nearly every club).
 */
export function rankDirection(c: { higherIsBetter?: boolean; noColour?: boolean; unranked?: boolean }): boolean | null {
  if (c.unranked) return null;
  return colourDirection(c) ?? true;
}

/**
 * Each club's average upcoming fixture difficulty ranked among every
 * club's — easier is better. A club figure, so it follows the club rule
 * wherever it's shown (a player's row shows his club's).
 */
export function fixtureDifficultyRanks(fixturesByTeamId: ReadonlyMap<number, UpcomingFixture[]>): Map<number, number> {
  return clubRanks([...fixturesByTeamId], { id: ([teamId]) => teamId, value: ([, fixtures]) => averageFixtureDifficulty(fixtures), higherIsBetter: false });
}
