import { describe, expect, it } from "vitest";
import { placeLabels } from "./ComparisonOutputs";

describe("placeLabels: the figures above an Outputs track", () => {
  it("centres a label over its marker when there's room", () => {
    expect(placeLabels([{ x: 100, w: 20 }], 300)).toEqual([90]);
  });

  it("keeps a label at either end inside the track", () => {
    expect(placeLabels([{ x: 0, w: 20 }, { x: 300, w: 20 }], 300)).toEqual([0, 280]);
  });

  it("spreads two crowded labels evenly around their markers, 4px apart", () => {
    // Centred on 100 and 104 they'd overlap; side by side, their midpoint stays at 102.
    const [a, b] = placeLabels([{ x: 100, w: 20 }, { x: 104, w: 20 }], 300);
    expect(b - (a + 20)).toBe(4);
    expect((a + b + 20) / 2).toBe(102);
  });

  it("keeps the order of the markers, whatever order the labels come in", () => {
    const [right, left] = placeLabels([{ x: 104, w: 20 }, { x: 100, w: 20 }], 300);
    expect(left).toBeLessThan(right);
  });

  it("pushes a crowded run at the end of the track back inside it", () => {
    // Two figures tied at the leader: both would sit past the end.
    const lefts = placeLabels([{ x: 300, w: 20 }, { x: 300, w: 20 }], 300);
    expect(Math.max(...lefts) + 20).toBe(300);
    expect(Math.abs(lefts[0] - lefts[1])).toBe(24);
  });
});
