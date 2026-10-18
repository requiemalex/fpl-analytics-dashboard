import { describe, it, expect, vi, afterEach } from "vitest";
import { cachedFetch } from "./proxy.js";
import { TtlCache } from "./cache.js";
import { CACHE_TTL_MS } from "./config.js";

// README "Shared vs per-page state": the client "polls bootstrap-static silently every 10 minutes";
// User Guide: "Live figures update every 10 minutes". The client poll interval (10 min, AppStateContext)
// equals the server TTL, but the TTL clock starts when the upstream response ARRIVES, so a poll fired
// 10 min after the previous request STARTED lands inside the TTL and gets the same snapshot.
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("audit 2026-10-18 data layer: 10-minute poll vs 10-minute bootstrap TTL", () => {
  it("[DATA-3] a poll 10 minutes after the previous request started gets a fresh upstream snapshot", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const upstream = vi.fn(async () => {
      now += 1500; // upstream latency: bootstrap-static is ~1.8 MB
      return new Response(JSON.stringify({ snapshot: upstream.mock.calls.length }), { status: 200 });
    });
    vi.stubGlobal("fetch", upstream);
    const cache = new TtlCache<unknown>();
    const opts = { cache, cacheKey: "bootstrap-static", ttlMs: CACHE_TTL_MS.bootstrapStatic, url: "https://example.invalid/bootstrap-static/" };

    await cachedFetch(opts); // initial load starts at t=0, response cached at t=1.5s
    // Phase 2: 1 ms after the 10 minutes, not exactly on them. A real poll
    // always fires a moment after the request it follows started (the load
    // runs before the interval is set up), and TtlCache deliberately keeps
    // an entry valid at exactly its expiry instant (cache.test.ts). Old code
    // still fails this: its TTL ran from the response, to 10:01.5.
    now = 10 * 60 * 1000 + 1; // client setInterval fires 10 min after mount
    const poll = await cachedFetch(opts);

    expect(upstream).toHaveBeenCalledTimes(2);
    expect(poll.ok && poll.source).toBe("live");
  });
});
