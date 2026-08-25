import { useState } from "react";

export interface SortSpec {
  key: string;
  direction: "asc" | "desc";
}

/**
 * Click a header to sort by it (descending first); click again to flip
 * direction; click a different header to replace the sort entirely;
 * shift-click to add it as a secondary tiebreaker instead of replacing.
 */
export function useSortSpec(initial: SortSpec[]) {
  const [sort, setSort] = useState<SortSpec[]>(initial);

  function handleHeaderClick(key: string, shiftKey: boolean) {
    setSort((prev) => {
      const existingIdx = prev.findIndex((s) => s.key === key);
      if (shiftKey) {
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = { key, direction: next[existingIdx].direction === "asc" ? "desc" : "asc" };
          return next;
        }
        return [...prev, { key, direction: "desc" }];
      }
      if (existingIdx === 0 && prev.length === 1) {
        return [{ key, direction: prev[0].direction === "asc" ? "desc" : "asc" }];
      }
      return [{ key, direction: "desc" }];
    });
  }

  return { sort, setSort, handleHeaderClick };
}

/**
 * Nulls always sort last regardless of direction — a missing value isn't
 * "low", it's unknown, and burying it at the bottom either way keeps it
 * from masquerading as a real minimum. Works for strings and numbers
 * alike (JS's `<` does the right thing for both), which is what lets one
 * comparator handle a "Player" name-sort next to every numeric column.
 */
export function compareSortValues(av: number | string | null, bv: number | string | null, direction: "asc" | "desc"): number {
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  if (av === bv) return 0;
  const cmp = av < bv ? -1 : 1;
  return direction === "asc" ? cmp : -cmp;
}
