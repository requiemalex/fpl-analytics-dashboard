import { useEffect, useState } from "react";

/** Rows drawn straight away when a large table appears — enough to fill the visible part of any table. */
export const INITIAL_ROW_COUNT = 50;
/** Rows added per animation frame after that, until every row is drawn. */
export const ROWS_PER_FRAME = 100;

/**
 * How many of a table's `total` rows to draw right now. Mounting all ~700
 * player rows in one go blocked the page for most of a second before
 * anything appeared, so a large table draws its first INITIAL_ROW_COUNT
 * rows immediately and the rest over the following frames, without waiting
 * for a scroll. Only the drawing is staged: sorting, filtering, tints,
 * counts and CSV export all still work on the full row list.
 *
 * When the list shrinks (a search or filter), the count shrinks with it, so
 * clearing that filter again stages the rows back in rather than mounting
 * hundreds at once. A sort or mode change that keeps the length leaves the
 * count alone — rows already drawn stay drawn.
 */
export function useProgressiveRowCount(total: number): number {
  const [limit, setLimit] = useState(INITIAL_ROW_COUNT);

  useEffect(() => {
    const floor = Math.max(INITIAL_ROW_COUNT, total);
    if (limit > floor) {
      setLimit(floor);
      return;
    }
    if (limit >= total) return;
    const id = requestAnimationFrame(() => setLimit((l) => l + ROWS_PER_FRAME));
    return () => cancelAnimationFrame(id);
  }, [limit, total]);

  return Math.min(limit, total);
}
