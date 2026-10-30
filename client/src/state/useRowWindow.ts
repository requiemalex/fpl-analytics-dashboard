import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Rows kept drawn beyond the visible ones, above and below, so a quick scroll never shows a gap. */
export const OVERSCAN_ROWS = 15;
/** The window moves this many rows at a time, so scrolling redraws a few rows now and then, not on every frame. */
export const WINDOW_STEP = 10;
/** A row's height until the drawn rows have been measured. */
const ESTIMATED_ROW_HEIGHT = 50;

export interface RowWindow {
  /** Whether the table is windowed: false where its box has no height to measure (a hidden dialog, tests), which draws every row as before. */
  active: boolean;
  /** The drawn rows: sortedRows.slice(start, end). */
  start: number;
  end: number;
  /** Heights of the empty rows standing in for the undrawn rows above and below. */
  topSpace: number;
  bottomSpace: number;
  topSpacerRef: React.RefObject<HTMLTableRowElement>;
  bottomSpacerRef: React.RefObject<HTMLTableRowElement>;
}

/**
 * <row_window>: a long table draws only the rows in its scroll box, plus
 * OVERSCAN_ROWS either side, with one empty row above and one below
 * standing in for the rest at their real height, so the scrollbar and
 * scroll position are the same as with every row drawn. Drawing all ~700
 * player rows (some 11,000 cells) made scrolling, sorting and switching
 * Data View lag. Only the drawing is windowed: sorting, filtering, colours,
 * counts and CSV export all work on the full row list, as before.
 *
 * The rows' height is measured from the drawn rows (between the two
 * spacers) after each draw. A box with no height (a hidden dialog, or
 * jsdom in tests) isn't windowed: `active` is false and the caller draws
 * every row as it did before.
 */
export function useRowWindow(wrapRef: React.RefObject<HTMLElement>, total: number): RowWindow {
  const topSpacerRef = useRef<HTMLTableRowElement>(null);
  const bottomSpacerRef = useRef<HTMLTableRowElement>(null);
  const [rowHeight, setRowHeight] = useState(ESTIMATED_ROW_HEIGHT);
  const rowHeightRef = useRef(rowHeight);
  rowHeightRef.current = rowHeight;
  // Step-aligned and not yet clamped to `total` (null: not windowed).
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);

  const update = useCallback(() => {
    const wrap = wrapRef.current;
    const viewport = wrap?.clientHeight ?? 0;
    if (!wrap || viewport <= 0) {
      setRange((prev) => (prev === null ? prev : null));
      return;
    }
    // Where the rows start inside the scroll box: under the header.
    const rowsTop = topSpacerRef.current?.offsetTop ?? 0;
    const height = rowHeightRef.current;
    const firstVisible = Math.floor(Math.max(0, wrap.scrollTop - rowsTop) / height);
    const lastVisible = Math.ceil(Math.max(0, wrap.scrollTop + viewport - rowsTop) / height);
    const start = Math.max(0, Math.floor((firstVisible - OVERSCAN_ROWS) / WINDOW_STEP) * WINDOW_STEP);
    const end = Math.ceil((lastVisible + OVERSCAN_ROWS) / WINDOW_STEP) * WINDOW_STEP;
    setRange((prev) => (prev && prev.start === start && prev.end === end ? prev : { start, end }));
  }, [wrapRef]);

  // Scrolling and any change to the box's size (a window resize, a dialog opening) move the window.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    wrap.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(wrap);
    return () => {
      wrap.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [wrapRef, update]);

  const active = range !== null;
  const start = active ? Math.min(range.start, total) : 0;
  const end = active ? Math.min(range.end, total) : total;

  // After each draw: measure the drawn rows' height, and re-place the
  // window when the row count changes (a filter can leave the scroll
  // position past the new last row; the browser pulls it back without
  // necessarily firing a scroll).
  useLayoutEffect(() => {
    const top = topSpacerRef.current;
    const bottom = bottomSpacerRef.current;
    const drawn = end - start;
    if (active && top && bottom && drawn > 0) {
      const measured = (bottom.offsetTop - top.offsetTop - top.offsetHeight) / drawn;
      if (measured > 0 && Math.abs(measured - rowHeightRef.current) > 0.5) {
        rowHeightRef.current = measured;
        setRowHeight(measured);
      }
    }
    update();
  }, [active, start, end, total, update]);

  return {
    active,
    start,
    end,
    topSpace: start * rowHeight,
    bottomSpace: (total - end) * rowHeight,
    topSpacerRef,
    bottomSpacerRef,
  };
}
