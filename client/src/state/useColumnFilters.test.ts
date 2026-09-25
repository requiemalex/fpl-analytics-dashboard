import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { columnFilterPasses, isColumnFilterActive, useColumnFilters, EMPTY_COLUMN_FILTER, type ColumnFilterSpec } from "./useColumnFilters";

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
