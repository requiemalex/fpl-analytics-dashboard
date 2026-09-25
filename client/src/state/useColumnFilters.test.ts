import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { columnFilterPasses, columnFilterProblem, isColumnFilterActive, useColumnFilters, EMPTY_COLUMN_FILTER, type ColumnFilterSpec } from "./useColumnFilters";

const spec = (over: Partial<ColumnFilterSpec>): ColumnFilterSpec => ({ ...EMPTY_COLUMN_FILTER, ...over });

describe("columnFilterPasses", () => {
  it("an empty filter passes every value, null included", () => {
    expect(columnFilterPasses(5, EMPTY_COLUMN_FILTER)).toBe(true);
    expect(columnFilterPasses(null, EMPTY_COLUMN_FILTER)).toBe(true);
    expect(columnFilterPasses(null, undefined)).toBe(true);
  });

  it("≤ and ≥ are inclusive, and combine as a range", () => {
    expect(columnFilterPasses(10, spec({ lte: 10 }))).toBe(true);
    expect(columnFilterPasses(10.01, spec({ lte: 10 }))).toBe(false);
    expect(columnFilterPasses(10, spec({ gte: 10 }))).toBe(true);
    expect(columnFilterPasses(9.99, spec({ gte: 10 }))).toBe(false);
    expect(columnFilterPasses(15, spec({ gte: 10, lte: 20 }))).toBe(true);
    expect(columnFilterPasses(25, spec({ gte: 10, lte: 20 }))).toBe(false);
  });

  it("a missing value (—) fails any active numeric filter rather than counting as 0", () => {
    expect(columnFilterPasses(null, spec({ lte: 100 }))).toBe(false);
    expect(columnFilterPasses(null, spec({ gte: 0 }))).toBe(false);
  });

  it("a category filter keeps only the exact category", () => {
    expect(columnFilterPasses("ARS", spec({ category: "ARS" }))).toBe(true);
    expect(columnFilterPasses("CHE", spec({ category: "ARS" }))).toBe(false);
    expect(columnFilterPasses(null, spec({ category: "ARS" }))).toBe(false);
  });

  it("isColumnFilterActive is true once any field is set, 0 included", () => {
    expect(isColumnFilterActive(EMPTY_COLUMN_FILTER)).toBe(false);
    expect(isColumnFilterActive(spec({ eq: 0 }))).toBe(true);
    expect(isColumnFilterActive(spec({ category: "GKP" }))).toBe(true);
  });
});

describe("useColumnFilters — draft vs applied", () => {
  it("typing changes only the draft; Enter applies it; Cancel discards it", () => {
    const { result } = renderHook(() => useColumnFilters());
    act(() => result.current.openFilter("minutes"));
    act(() => result.current.setFilterDraft(spec({ gte: 900 })));
    expect(result.current.columnFilters.minutes).toBeUndefined();
    act(() => result.current.confirmFilter());
    expect(result.current.columnFilters.minutes).toEqual(spec({ gte: 900 }));
    expect(result.current.openFilterKey).toBeNull();

    act(() => result.current.openFilter("minutes"));
    expect(result.current.filterDraft).toEqual(spec({ gte: 900 }));
    act(() => result.current.setFilterDraft(spec({ gte: 1 })));
    act(() => result.current.cancelFilter());
    expect(result.current.columnFilters.minutes).toEqual(spec({ gte: 900 }));
  });

  it("passesAllFilters ANDs every column's filter, and resetAllFilters clears them all", () => {
    const { result } = renderHook(() => useColumnFilters());
    act(() => result.current.openFilter("minutes"));
    act(() => result.current.setFilterDraft(spec({ gte: 900 })));
    act(() => result.current.confirmFilter());
    act(() => result.current.openFilter("team"));
    act(() => result.current.setFilterDraft(spec({ category: "ARS" })));
    act(() => result.current.confirmFilter());
    const row = (minutes: number | null, team: string) => (key: string) => (key === "minutes" ? minutes : team);
    expect(result.current.passesAllFilters(row(1000, "ARS"))).toBe(true);
    expect(result.current.passesAllFilters(row(1000, "CHE"))).toBe(false);
    expect(result.current.passesAllFilters(row(100, "ARS"))).toBe(false);
    act(() => result.current.resetAllFilters());
    expect(result.current.passesAllFilters(row(null, "CHE"))).toBe(true);
  });
});

describe("column filters — 2026-09-25 audit fixes", () => {
  it("M2: with the column's decimals, values compare as displayed (Equal to, ≥ and ≤ alike)", () => {
    // Pts/£m 15.3197 shows as "15.3"; Historic Average points 227.25 show as "227".
    expect(columnFilterPasses(15.3197, spec({ eq: 15.3 }), 1)).toBe(true);
    expect(columnFilterPasses(15.3197, spec({ lte: 15.3 }), 1)).toBe(true);
    expect(columnFilterPasses(15.3197, spec({ gte: 15.3 }), 1)).toBe(true);
    expect(columnFilterPasses(227.25, spec({ eq: 227 }), 0)).toBe(true);
    expect(columnFilterPasses(15.36, spec({ eq: 15.3 }), 1)).toBe(false);
    // Same rounding as the table cell: 15.35 shows as "15.4".
    expect(columnFilterPasses(15.35, spec({ eq: 15.4 }), 1)).toBe(true);
    // Without decimals the full value is compared, as before.
    expect(columnFilterPasses(15.3197, spec({ eq: 15.3 }))).toBe(false);
  });

  it("M2: passesAllFilters takes each column's decimals from the caller", () => {
    const { result } = renderHook(() => useColumnFilters({ pointsPerMillion: spec({ eq: 15.3 }) }));
    expect(result.current.passesAllFilters(() => 15.3197, () => 1)).toBe(true);
    expect(result.current.passesAllFilters(() => 15.3197)).toBe(false);
  });

  it("L2: a minimum above the maximum, or Equal to outside the range, is a problem and Enter refuses it", () => {
    expect(columnFilterProblem(spec({ gte: 200, lte: 100 }))).toBeTruthy();
    expect(columnFilterProblem(spec({ eq: 5, gte: 10 }))).toBeTruthy();
    expect(columnFilterProblem(spec({ eq: 50, lte: 10 }))).toBeTruthy();
    expect(columnFilterProblem(spec({ gte: 100, lte: 100 }))).toBeUndefined();
    expect(columnFilterProblem(spec({ gte: -5 }))).toBeUndefined();

    const { result } = renderHook(() => useColumnFilters());
    act(() => result.current.openFilter("totalPoints"));
    act(() => result.current.setFilterDraft(spec({ gte: 200, lte: 100 })));
    act(() => result.current.confirmFilter());
    expect(result.current.columnFilters.totalPoints).toBeUndefined();
    expect(result.current.openFilterKey).toBe("totalPoints");
  });

  it("M3: clearFilter drops only that column's filter (and closes its popover); H1: setColumnFilter applies one directly", () => {
    const { result } = renderHook(() => useColumnFilters());
    act(() => result.current.setColumnFilter("team", spec({ category: "ARS" })));
    act(() => result.current.setColumnFilter("goals", spec({ gte: 10 })));
    act(() => result.current.openFilter("goals"));
    act(() => result.current.clearFilter("goals"));
    expect(result.current.columnFilters).toEqual({ team: spec({ category: "ARS" }) });
    expect(result.current.openFilterKey).toBeNull();
  });
});
