import { describe, it, expect } from "vitest";
import { topN } from "./Dashboard";

interface Row {
  id: number;
  value: number | null;
}

describe("Dashboard's topN — M5 regression: comparator contract (must return 0 for ties, be transitive)", () => {
  it("sorts descending by default, highest value first", () => {
    const rows: Row[] = [
      { id: 1, value: 3 },
      { id: 2, value: 5 },
      { id: 3, value: 1 },
    ];
    expect(topN(rows, 5).map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it("sorts ascending when requested, lowest value first", () => {
    const rows: Row[] = [
      { id: 1, value: 3 },
      { id: 2, value: 5 },
      { id: 3, value: 1 },
    ];
    expect(topN(rows, 5, true).map((r) => r.id)).toEqual([3, 1, 2]);
  });

  it("does not drop or duplicate players on a 3-way exact tie (the old (a,b) => a<b?1:-1 comparator was non-transitive here)", () => {
    const rows: Row[] = [
      { id: 1, value: 0 },
      { id: 2, value: 0 },
      { id: 3, value: 0 },
      { id: 4, value: 1 },
    ];
    const result = topN(rows, 4);
    expect(result).toHaveLength(4);
    expect(new Set(result.map((r) => r.id))).toEqual(new Set([1, 2, 3, 4]));
    expect(result[0].id).toBe(4); // the only non-tied, higher value sorts first
  });

  it("excludes null-value rows entirely", () => {
    const rows: Row[] = [
      { id: 1, value: null },
      { id: 2, value: 2 },
    ];
    expect(topN(rows, 5).map((r) => r.id)).toEqual([2]);
  });

  it("caps at n", () => {
    const rows: Row[] = [1, 2, 3, 4, 5].map((v) => ({ id: v, value: v }));
    expect(topN(rows, 2)).toHaveLength(2);
  });
});
