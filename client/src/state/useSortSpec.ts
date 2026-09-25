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
 * The sort once `hiddenKey`'s column is hidden: that column drops out, so no
 * sort keeps ordering the table by a column you can't see (audit
 * 2026-09-25, alongside M3's filters). If it was the only sort, the page's
 * default sort takes over, unless that's the column being hidden.
 */
export function sortWithoutHiddenColumn(sort: SortSpec[], hiddenKey: string, fallback: SortSpec[]): SortSpec[] {
  if (!sort.some((s) => s.key === hiddenKey)) return sort;
  const remaining = sort.filter((s) => s.key !== hiddenKey);
  return remaining.length > 0 ? remaining : fallback.filter((s) => s.key !== hiddenKey);
}

const NAME_COLLATOR = new Intl.Collator("en-GB", { sensitivity: "base" });

/**
 * How to treat a null (— on screen) relative to real values:
 * - "last" (the default, used everywhere except Player Explorer): always
 *   sorts after every real value regardless of direction — a missing
 *   value isn't "low", it's unknown, and burying it at the bottom either
 *   way keeps it from masquerading as a real minimum.
 * - "belowZero" (Player Explorer, at the user's request): treated as
 *   smaller than every real value, same as any other number would be —
 *   so it sorts first ascending, last descending, rather than always last.
 *
 * Works for strings and numbers alike, which is what lets one comparator
 * handle a "Player" name-sort next to every numeric column. Strings compare
 * alphabetically, ignoring accents and case (Ángel next to Adams, Ødegaard
 * among the Os, van Ewijk among the Vs) — plain `<` compares character
 * codes, which put every accented or lower-case name after Z.
 */
export function compareSortValues(
  av: number | string | null,
  bv: number | string | null,
  direction: "asc" | "desc",
  nullHandling: "last" | "belowZero" = "last",
): number {
  if (av === null && bv === null) return 0;
  if (nullHandling === "last") {
    if (av === null) return 1;
    if (bv === null) return -1;
  }
  let cmp: number;
  if (av === null) cmp = -1; // belowZero: null < any real value
  else if (bv === null) cmp = 1;
  else if (av === bv) return 0;
  else if (typeof av === "string" && typeof bv === "string") {
    cmp = NAME_COLLATOR.compare(av, bv);
    if (cmp === 0) return 0;
  } else cmp = av < bv ? -1 : 1;
  return direction === "asc" ? cmp : -cmp;
}
