import { useState } from "react";
import { roundAsDisplayed } from "../utils/format";

export interface ColumnFilterSpec {
  lte: number | null;
  gte: number | null;
  eq: number | null;
  /** Excel-style "show only this value" filter for a categorical column (Team, Position) — mutually exclusive with the three numeric fields above, which stay null when this is set. See ColumnFilterControl's `categoryOptions` prop for which columns use this. */
  category: string | null;
}

export const EMPTY_COLUMN_FILTER: ColumnFilterSpec = { lte: null, gte: null, eq: null, category: null };

export function isColumnFilterActive(spec: ColumnFilterSpec | undefined): boolean {
  return !!spec && (spec.lte !== null || spec.gte !== null || spec.eq !== null || spec.category !== null);
}

/** Why a filter can't be applied, if it can't: a range no value could ever fall inside. Enter is refused (and disabled) while this returns a reason, same as the Dashboard dialog's min/max price check. */
export function columnFilterProblem(spec: ColumnFilterSpec): string | undefined {
  if (spec.gte !== null && spec.lte !== null && spec.gte > spec.lte) return "“Greater than or equal to” is above “Less than or equal to”";
  if (spec.eq !== null && ((spec.gte !== null && spec.eq < spec.gte) || (spec.lte !== null && spec.eq > spec.lte))) return "“Equal to” is outside the range";
  return undefined;
}

/**
 * A column with no value for this row fails any active filter on it — "doesn't meet the bar", same convention used everywhere else a value might be missing.
 *
 * `decimals` is how many places the column shows: the value is compared as
 * displayed (Pts/£m 15.3197 shown as "15.3" is equal to 15.3), so a number
 * typed exactly as it appears in the table always matches. Without it the
 * full-precision value is compared.
 */
export function columnFilterPasses(value: number | string | null, spec: ColumnFilterSpec | undefined, decimals?: number): boolean {
  if (!isColumnFilterActive(spec)) return true;
  if (spec!.category !== null) return value === spec!.category;
  if (typeof value !== "number") return false;
  const shown = decimals === undefined ? value : roundAsDisplayed(value, decimals);
  if (spec!.eq !== null && shown !== spec!.eq) return false;
  if (spec!.gte !== null && shown < spec!.gte) return false;
  if (spec!.lte !== null && shown > spec!.lte) return false;
  return true;
}

/**
 * One instance manages every column's filters for one table. Draft state
 * is separate from applied state — typing into the three fields doesn't
 * filter anything until `confirmFilter` (Enter) commits the draft;
 * `cancelFilter` (Cancel) discards it, leaving whatever was previously
 * applied untouched.
 */
export function useColumnFilters(initialFilters: Record<string, ColumnFilterSpec> | (() => Record<string, ColumnFilterSpec>) = {}) {
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterSpec>>(initialFilters);
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const [filterDraft, setFilterDraft] = useState<ColumnFilterSpec>(EMPTY_COLUMN_FILTER);

  function openFilter(key: string) {
    setFilterDraft(columnFilters[key] ?? EMPTY_COLUMN_FILTER);
    setOpenFilterKey(key);
  }
  function confirmFilter() {
    if (!openFilterKey || columnFilterProblem(filterDraft)) return;
    setColumnFilters((prev) => ({ ...prev, [openFilterKey]: filterDraft }));
    setOpenFilterKey(null);
  }
  function cancelFilter() {
    setOpenFilterKey(null);
  }
  /** Applies a filter directly, without the popover — e.g. Player Explorer's `?team=` hand-off from Teams. */
  function setColumnFilter(key: string, spec: ColumnFilterSpec) {
    setColumnFilters((prev) => ({ ...prev, [key]: spec }));
  }
  /** Drops one column's filter — called when that column is hidden, so no filter keeps working on a column you can't see. */
  function clearFilter(key: string) {
    setColumnFilters((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setOpenFilterKey((open) => (open === key ? null : open));
  }
  function resetAllFilters() {
    setColumnFilters({});
    setOpenFilterKey(null);
  }

  /** Resolves every active filter against one row via `getValue(key)`, so callers just supply their own column-key-to-value resolver (each table already has one, for sorting). `getDecimals(key)` gives each column's displayed precision (see columnFilterPasses). */
  function passesAllFilters(getValue: (key: string) => number | string | null, getDecimals?: (key: string) => number | undefined): boolean {
    for (const [key, spec] of Object.entries(columnFilters)) {
      if (!columnFilterPasses(getValue(key), spec, getDecimals?.(key))) return false;
    }
    return true;
  }

  return {
    columnFilters,
    openFilterKey,
    filterDraft,
    setFilterDraft,
    openFilter,
    confirmFilter,
    cancelFilter,
    setColumnFilter,
    clearFilter,
    resetAllFilters,
    passesAllFilters,
  };
}
