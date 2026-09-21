import { describe, it, expect, vi, beforeEach } from "vitest";

const cachedFetchMock = vi.fn();

vi.mock("./proxy.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./proxy.js")>();
  return { ...actual, cachedFetch: cachedFetchMock };
});

const { buildBulkHistoricData } = await import("./routes/historicBulk.js");

function bootstrapResult(playerIds: number[]) {
  return { ok: true, data: { elements: playerIds.map((id) => ({ id })) }, source: "cache", fetchedAt: Date.now() };
}

function elementSummaryResult(historyPast: unknown[] = []) {
  return { ok: true, data: { history_past: historyPast }, source: "cache", fetchedAt: Date.now() };
}

beforeEach(() => {
  cachedFetchMock.mockReset();
});

describe("buildBulkHistoricData — L10 regression: a force-refresh build must bypass every nested cache, not just the top-level historic-bulk entry", () => {
  it("passes bypassCache=false through to both the nested bootstrap-static and element-summary cachedFetch calls on a normal (non-refresh) build", async () => {
    cachedFetchMock.mockImplementation(async (opts: { cacheKey: string }) => {
      if (opts.cacheKey === "bootstrap-static") return bootstrapResult([1, 2]);
      return elementSummaryResult();
    });

    await buildBulkHistoricData(false);

    for (const call of cachedFetchMock.mock.calls) {
      expect(call[0].bypassCache).toBe(false);
    }
    // One bootstrap call + one per player.
    expect(cachedFetchMock).toHaveBeenCalledTimes(3);
  });

  it("passes bypassCache=true through to BOTH the nested bootstrap-static call and every per-player element-summary call when the build was requested as a refresh", async () => {
    cachedFetchMock.mockImplementation(async (opts: { cacheKey: string }) => {
      if (opts.cacheKey === "bootstrap-static") return bootstrapResult([1, 2, 3]);
      return elementSummaryResult();
    });

    await buildBulkHistoricData(true);

    expect(cachedFetchMock).toHaveBeenCalledTimes(4); // 1 bootstrap + 3 players
    for (const call of cachedFetchMock.mock.calls) {
      expect(call[0].bypassCache).toBe(true);
    }
    const bootstrapCall = cachedFetchMock.mock.calls.find((c) => c[0].cacheKey === "bootstrap-static");
    expect(bootstrapCall?.[0].bypassCache).toBe(true);
    const playerCalls = cachedFetchMock.mock.calls.filter((c) => c[0].cacheKey.startsWith("element-summary:"));
    expect(playerCalls).toHaveLength(3);
    for (const call of playerCalls) {
      expect(call[0].bypassCache).toBe(true);
    }
  });
});
