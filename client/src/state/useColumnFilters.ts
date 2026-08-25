import { useState } from "react";

export interface ColumnFilterSpec {
  lte: number | null;
  gte: number | null;
  eq: number | null;
}

export const EMPTY_COLUMN_FILTER: ColumnFilterSpec = { lte: null, gte: null, eq: null };

export function isColumnFilterActive(spec: ColumnFilterSpec | undefined): boolean {
  return !!spec && (spec.lte !== null || spec.gte !== null || spec.eq !== null);
}

/** A column with no numeric value for this row fails any active filter on it — "doesn't meet the bar", same convention used everywhere else a value might be missing. */
export function columnFilterPasses(value: number | string | null, spec: ColumnFilterSpec | undefined): boolean {
  if (!isColumnFilterActive(spec)) return true;
  if (typeof value !== "number") return false;
  if (spec!.eq !== null && value !== spec!.eq) return false;
  if (spec!.gte !== null && value < spec!.gte) return false;
  if (spec!.lte !== null && value > spec!.lte) return false;
  return true;
}

/**
 * One instance manages every column's filters for one table. Draft state
 * is separate from applied state — typing into the three fields doesn't
 * filter anything until `confirmFilter` (Enter) commits the draft;
 * `cancelFilter` (Cancel) discards it, leaving whatever was previously
 * applied untouched.
 */
export function useColumnFilters() {
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterSpec>>({});
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const [filterDraft, setFilterDraft] = useState<ColumnFilterSpec>(EMPTY_COLUMN_FILTER);

  function openFilter(key: string) {
    setFilterDraft(columnFilters[key] ?? EMPTY_COLUMN_FILTER);
    setOpenFilterKey(key);
  }
  function confirmFilter() {
    if (!openFilterKey) return;
    setColumnFilters((prev) => ({ ...prev, [openFilterKey]: filterDraft }));
    setOpenFilterKey(null);
  }
  function cancelFilter() {
    setOpenFilterKey(null);
  }
  function resetAllFilters() {
    setColumnFilters({});
    setOpenFilterKey(null);
  }

  /** Resolves every active filter against one row via `getValue(key)`, so callers just supply their own column-key-to-value resolver (each table already has one, for sorting). */
  function passesAllFilters(getValue: (key: string) => number | string | null): boolean {
    for (const [key, spec] of Object.entries(columnFilters)) {
      if (!columnFilterPasses(getValue(key), spec)) return false;
    }
    return true;
  }

  return { columnFilters, openFilterKey, filterDraft, setFilterDraft, openFilter, confirmFilter, cancelFilter, resetAllFilters, passesAllFilters };
}
