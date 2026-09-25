import { describe, it, expect } from "vitest";
import { compareSortValues, sortWithoutHiddenColumn, type SortSpec } from "./useSortSpec";

describe("compareSortValues — null handling", () => {
  it("'last' (default): a null always sorts after every real value, in EITHER direction", () => {
    expect(compareSortValues(null, 5, "asc")).toBe(1); // null after 5, ascending
    expect(compareSortValues(5, null, "asc")).toBe(-1); // 5 before null
    expect(compareSortValues(null, 5, "desc")).toBe(1); // still after, even descending
    expect(compareSortValues(5, null, "desc")).toBe(-1);
  });

  it("'belowZero': null sorts as smaller than every real value, direction-sensitive like any number", () => {
    expect(compareSortValues(null, 5, "asc", "belowZero")).toBe(-1); // null first ascending
    expect(compareSortValues(5, null, "asc", "belowZero")).toBe(1);
    expect(compareSortValues(null, 5, "desc", "belowZero")).toBe(1); // null last descending
    expect(compareSortValues(5, null, "desc", "belowZero")).toBe(-1);
  });

  it("both null returns 0 regardless of nullHandling mode", () => {
    expect(compareSortValues(null, null, "asc")).toBe(0);
    expect(compareSortValues(null, null, "desc", "belowZero")).toBe(0);
  });
});

describe("compareSortValues — real-value comparison", () => {
  it("equal values return 0", () => {
    expect(compareSortValues(5, 5, "asc")).toBe(0);
    expect(compareSortValues("a", "a", "desc")).toBe(0);
  });

  it("ascending: smaller first", () => {
    expect(compareSortValues(1, 2, "asc")).toBe(-1);
    expect(compareSortValues(2, 1, "asc")).toBe(1);
  });

  it("descending is the exact inverse of ascending", () => {
    expect(compareSortValues(1, 2, "desc")).toBe(1);
    expect(compareSortValues(2, 1, "desc")).toBe(-1);
  });

  it("works for strings the same way JS's < operator does, for the shared Player-name column", () => {
    expect(compareSortValues("Alan", "Bob", "asc")).toBe(-1);
    expect(compareSortValues("Bob", "Alan", "asc")).toBe(1);
  });
});

describe("sortWithoutHiddenColumn (audit 2026-09-25: a hidden column kept ordering the table)", () => {
  const byPoints: SortSpec[] = [{ key: "totalPoints", direction: "desc" }];
  it("drops the hidden column from the sort, keeping the rest in order", () => {
    const sort: SortSpec[] = [{ key: "xG", direction: "desc" }, { key: "goals", direction: "asc" }];
    expect(sortWithoutHiddenColumn(sort, "xG", byPoints)).toEqual([{ key: "goals", direction: "asc" }]);
  });
  it("falls back to the page's default sort when that was the only one", () => {
    expect(sortWithoutHiddenColumn([{ key: "xG", direction: "asc" }], "xG", byPoints)).toEqual(byPoints);
  });
  it("hiding the default sort's own column leaves no sort rather than sorting by a hidden column", () => {
    expect(sortWithoutHiddenColumn(byPoints, "totalPoints", byPoints)).toEqual([]);
  });
  it("hiding a column that isn't sorted leaves the sort exactly as it was", () => {
    const sort: SortSpec[] = [{ key: "xG", direction: "desc" }];
    expect(sortWithoutHiddenColumn(sort, "goals", byPoints)).toBe(sort);
  });
});
