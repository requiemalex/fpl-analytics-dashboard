import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchJsonMock = vi.fn();

vi.mock("./httpClient.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./httpClient.js")>();
  return { ...actual, fetchJson: fetchJsonMock };
});

// Imported AFTER the mock is registered.
const { cachedFetch } = await import("./proxy.js");
const { TtlCache } = await import("./cache.js");
const { UpstreamError } = await import("./httpClient.js");

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  fetchJsonMock.mockReset();
});

describe("cachedFetch — cache hit vs miss", () => {
  it("serves from cache without calling fetchJson when a fresh entry exists", async () => {
    const cache = new TtlCache<{ n: number }>();
    cache.set("k", { n: 1 }, 60_000);
    const result = await cachedFetch({ cache, cacheKey: "k", ttlMs: 60_000, url: "http://x" });
    expect(result).toMatchObject({ ok: true, source: "cache", data: { n: 1 } });
    expect(fetchJsonMock).not.toHaveBeenCalled();
  });

  it("fetches live and populates the cache on a miss", async () => {
    fetchJsonMock.mockResolvedValue({ n: 2 });
    const cache = new TtlCache<{ n: number }>();
    const result = await cachedFetch({ cache, cacheKey: "k2", ttlMs: 60_000, url: "http://x" });
    expect(result).toMatchObject({ ok: true, source: "live", data: { n: 2 } });
    expect(fetchJsonMock).toHaveBeenCalledTimes(1);
    expect(cache.get("k2")?.value).toEqual({ n: 2 });
  });

  it("bypassCache ignores a fresh cache entry and re-fetches", async () => {
    fetchJsonMock.mockResolvedValue({ n: 99 });
    const cache = new TtlCache<{ n: number }>();
    cache.set("k3", { n: 1 }, 60_000);
    const result = await cachedFetch({ cache, cacheKey: "k3", ttlMs: 60_000, url: "http://x", bypassCache: true });
    expect(result).toMatchObject({ ok: true, source: "live", data: { n: 99 } });
    expect(fetchJsonMock).toHaveBeenCalledTimes(1);
  });
});

describe("cachedFetch — request de-duplication / coalescing (the race-prone logic)", () => {
  it("two concurrent misses for the SAME key trigger only ONE upstream fetchJson call, and both callers get the same result", async () => {
    let resolveFetch: (v: unknown) => void;
    fetchJsonMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const cache = new TtlCache<{ n: number }>();

    const p1 = cachedFetch({ cache, cacheKey: "dedupe", ttlMs: 60_000, url: "http://x" });
    const p2 = cachedFetch({ cache, cacheKey: "dedupe", ttlMs: 60_000, url: "http://x" });

    // Both requests are in flight before the upstream call resolves.
    expect(fetchJsonMock).toHaveBeenCalledTimes(1);

    resolveFetch!({ n: 5 });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toMatchObject({ ok: true, source: "live", data: { n: 5 } });
    expect(r2).toMatchObject({ ok: true, source: "live", data: { n: 5 } });
    expect(fetchJsonMock).toHaveBeenCalledTimes(1); // still only once
  });

  it("concurrent requests for DIFFERENT keys are NOT coalesced — each gets its own upstream call", async () => {
    fetchJsonMock.mockImplementation(async (url: string) => {
      await delay(5);
      return { url };
    });
    const cache = new TtlCache<{ url: string }>();
    const [r1, r2] = await Promise.all([
      cachedFetch({ cache, cacheKey: "keyA", ttlMs: 60_000, url: "http://a" }),
      cachedFetch({ cache, cacheKey: "keyB", ttlMs: 60_000, url: "http://b" }),
    ]);
    expect(fetchJsonMock).toHaveBeenCalledTimes(2);
    expect(r1.ok && r1.data).toEqual({ url: "http://a" });
    expect(r2.ok && r2.data).toEqual({ url: "http://b" });
  });

  it("the in-flight entry is cleared after resolution — a THIRD request after the first completes triggers a fresh fetchJson call, not stale coalescing", async () => {
    fetchJsonMock.mockResolvedValueOnce({ n: 1 }).mockResolvedValueOnce({ n: 2 });
    const cache = new TtlCache<{ n: number }>();
    await cachedFetch({ cache, cacheKey: "seq", ttlMs: 0, url: "http://x" }); // ttlMs 0 -> immediately stale for next call's cache check... but invalidate manually to force miss
    cache.invalidate("seq");
    await cachedFetch({ cache, cacheKey: "seq", ttlMs: 60_000, url: "http://x" });
    expect(fetchJsonMock).toHaveBeenCalledTimes(2);
  });

  it("a bypassCache request uses a separate in-flight key (`refresh:`) so it doesn't coalesce with a concurrent normal request for the same cacheKey", async () => {
    let resolveCount = 0;
    fetchJsonMock.mockImplementation(async () => {
      resolveCount += 1;
      await delay(5);
      return { n: resolveCount };
    });
    const cache = new TtlCache<{ n: number }>();
    cache.set("shared", { n: 0 }, 60_000); // fresh cache entry present

    const normal = cachedFetch({ cache, cacheKey: "shared", ttlMs: 60_000, url: "http://x" }); // will hit cache, no fetch
    const refresh = cachedFetch({ cache, cacheKey: "shared", ttlMs: 60_000, url: "http://x", bypassCache: true }); // forces a live fetch

    const [normalResult, refreshResult] = await Promise.all([normal, refresh]);
    expect(normalResult).toMatchObject({ source: "cache", data: { n: 0 } });
    expect(refreshResult.ok && refreshResult.source).toBe("live");
    expect(fetchJsonMock).toHaveBeenCalledTimes(1);
  });
});

describe("cachedFetch — graceful degradation on upstream failure", () => {
  // FAILING — reveals a real defect (documented in the audit report as
  // "Confirmed via failing test"): this asserts the behaviour this file's
  // own comments and CLAUDE.md promise ("Graceful degradation... Server
  // routes fall back to stale cache on upstream failure rather than
  // erroring outright"). It currently fails because cachedFetch's own
  // initial `cache.get(cacheKey)` call (the normal, non-bypass cache-hit
  // check at the top of the function) silently DELETES an expired entry as
  // a side effect (TtlCache.get()'s documented expiry behaviour) before the
  // catch block ever gets a chance to call getStale() on it. So for a
  // normal (non-refresh) request whose cache has just gone stale, the
  // intended "serve stale data instead of erroring" fallback is dead code —
  // it only works via a bypassCache:true request, which skips that initial
  // get() call entirely. Per this audit's rules, the test is left asserting
  // the CORRECT/documented behaviour rather than being weakened to match
  // the bug — do not "fix" this by changing the assertion.
  it("falls back to a stale cache entry (source 'stale-cache') rather than failing, when upstream errors", async () => {
    fetchJsonMock.mockRejectedValue(new UpstreamError("boom", 500));
    const cache = new TtlCache<{ n: number }>();
    cache.set("stale-key", { n: 7 }, 1); // will be expired by the time cachedFetch's own cache.get() check runs
    await delay(5);
    const result = await cachedFetch({ cache, cacheKey: "stale-key", ttlMs: 60_000, url: "http://x" });
    expect(result).toMatchObject({ ok: true, source: "stale-cache", data: { n: 7 } });
  });

  it("maps a timeout UpstreamError to 504 when there's no cache to fall back on", async () => {
    fetchJsonMock.mockRejectedValue(new UpstreamError("timed out", null, true));
    const cache = new TtlCache<unknown>();
    const result = await cachedFetch({ cache, cacheKey: "no-cache-1", ttlMs: 60_000, url: "http://x" });
    expect(result).toMatchObject({ ok: false, status: 504 });
  });

  it("passes through a genuine 4xx upstream status as-is", async () => {
    fetchJsonMock.mockRejectedValue(new UpstreamError("not found", 404));
    const cache = new TtlCache<unknown>();
    const result = await cachedFetch({ cache, cacheKey: "no-cache-2", ttlMs: 60_000, url: "http://x" });
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("maps a 5xx (or any non-4xx) upstream status to a generic 502", async () => {
    fetchJsonMock.mockRejectedValue(new UpstreamError("server error", 503));
    const cache = new TtlCache<unknown>();
    const result = await cachedFetch({ cache, cacheKey: "no-cache-3", ttlMs: 60_000, url: "http://x" });
    expect(result).toMatchObject({ ok: false, status: 502 });
  });

  it("maps a non-UpstreamError thrown value to a generic 500", async () => {
    fetchJsonMock.mockRejectedValue(new Error("totally unexpected"));
    const cache = new TtlCache<unknown>();
    const result = await cachedFetch({ cache, cacheKey: "no-cache-4", ttlMs: 60_000, url: "http://x" });
    expect(result).toMatchObject({ ok: false, status: 500, error: "Unknown proxy error" });
  });
});
