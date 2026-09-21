import { describe, it, expect } from "vitest";
import { topN } from "./UnderlyingNumbers";
import type { TopListRow } from "../components/TopList";
import type { NormalizedPlayer } from "../types/normalized";

function row(id: number, value: number | null): TopListRow {
  return { player: { id } as NormalizedPlayer, value };
}

describe("UnderlyingNumbers' topN — M5 regression: comparator contract (must return 0 for ties, be transitive)", () => {
  it("sorts descending, highest value first", () => {
    const rows = [row(1, 3), row(2, 5), row(3, 1)];
    expect(topN(rows, 5).map((r) => r.player.id)).toEqual([2, 1, 3]);
  });

  it("does not drop or duplicate players on a 3-way exact tie", () => {
    const rows = [row(1, 0), row(2, 0), row(3, 0), row(4, 1)];
    const result = topN(rows, 4);
    expect(result).toHaveLength(4);
    expect(new Set(result.map((r) => r.player.id))).toEqual(new Set([1, 2, 3, 4]));
    expect(result[0].player.id).toBe(4);
  });

  it("excludes null-value rows entirely", () => {
    const rows = [row(1, null), row(2, 2)];
    expect(topN(rows, 5).map((r) => r.player.id)).toEqual([2]);
  });
});
