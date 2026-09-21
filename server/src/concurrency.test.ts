import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "./concurrency";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("mapWithConcurrency", () => {
  it("never runs more than `limit` workers concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await mapWithConcurrency(items, 3, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(5);
      active -= 1;
      return item * 2;
    });

    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(1); // actually ran concurrently, not serially
  });

  it("returns results in the SAME ORDER as the input, even when later items finish before earlier ones", async () => {
    const items = [50, 10, 30, 5, 40]; // delay ms per item — item 3 (5ms) finishes fastest
    const results = await mapWithConcurrency(items, 5, async (ms) => {
      await delay(ms);
      return ms;
    });
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);
    expect(results.map((r) => r.result)).toEqual([50, 10, 30, 5, 40]);
  });

  it("captures a per-item error without failing the whole batch or losing other results", async () => {
    const items = [1, 2, 3];
    const results = await mapWithConcurrency(items, 2, async (item) => {
      if (item === 2) throw new Error("item 2 failed");
      return item * 10;
    });
    expect(results[0]).toMatchObject({ result: 10, error: null });
    expect(results[1].error).toBeInstanceOf(Error);
    expect(results[1].result).toBeNull();
    expect(results[2]).toMatchObject({ result: 30, error: null });
  });

  it("pool size never exceeds the number of items, even if limit is larger", async () => {
    let active = 0;
    let maxActive = 0;
    const items = [1, 2];
    await mapWithConcurrency(items, 10, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(5);
      active -= 1;
      return item;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("an empty items array resolves to an empty results array with no worker calls", async () => {
    let calls = 0;
    const results = await mapWithConcurrency([], 5, async () => {
      calls += 1;
      return 1;
    });
    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });

  it("limit of 1 processes items strictly sequentially", async () => {
    const order: number[] = [];
    const items = [1, 2, 3];
    await mapWithConcurrency(items, 1, async (item) => {
      order.push(item);
      await delay(5);
      return item;
    });
    expect(order).toEqual([1, 2, 3]);
  });

  it("each item is passed its own value and index to the worker", async () => {
    const items = ["a", "b", "c"];
    const results = await mapWithConcurrency(items, 2, async (item, index) => `${item}-${index}`);
    expect(results.map((r) => r.result)).toEqual(["a-0", "b-1", "c-2"]);
  });
});
