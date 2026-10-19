/**
 * <partial_totals>: the one rule for a Totals or Average row under a list
 * of matches (the owner's decision, 2026-10-19; README "Totals rows"),
 * whichever log it is — a player's or a club's, FPL's or Understat's.
 *
 * A match with no figure for a column is left out of it: Totals adds up the
 * matches that have one, and Average divides by those same matches. When
 * that's only some of the listed matches, the cell says so on hover
 * (`coverageNote`). A column none of the listed matches has a figure for is
 * "—". Never a "—" for the whole column because one match lacks it, and
 * never a missing match counted as 0.
 */
export interface PartialSum {
  /** The figures that are there, added up. */
  sum: number;
  /** How many matches had a figure. */
  n: number;
  /** How many matches were listed. */
  of: number;
}

/** The figures that are there, added up; null when there are none. */
export function sumKnown(values: readonly (number | null)[]): PartialSum | null {
  let sum = 0;
  let n = 0;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    sum += v;
    n += 1;
  }
  return n === 0 ? null : { sum, n, of: values.length };
}

/** The Totals figure: null when no match had one. */
export function partialTotal(s: PartialSum | null): number | null {
  return s === null ? null : s.sum;
}

/** The Average figure: the total over the matches that had a figure. */
export function partialAverage(s: PartialSum | null): number | null {
  return s === null ? null : s.sum / s.n;
}

/**
 * Hover text for a Totals or Average cell built from only some of the
 * listed matches; undefined when every match had a figure (or none did).
 * `source` names a second data source ("Understat") whose figures they are.
 */
export function coverageNote(s: PartialSum | null, source?: string): string | undefined {
  if (s === null || s.n === s.of) return undefined;
  return source ? `From the ${s.n} of ${s.of} matches ${source} has a figure for` : `From the ${s.n} of ${s.of} matches that have a figure`;
}
