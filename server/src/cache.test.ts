import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TtlCache } from "./cache";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TtlCache — TTL expiry logic", () => {
  it("returns the value while within the TTL window", () => {
    const cache = new TtlCache<string>();
    cache.set("k", "v", 1000);
    vi.advanceTimersByTime(999);
    expect(cache.get("k")?.value).toBe("v");
  });

  it("expires exactly at expiresAt (Date.now() > expiresAt is the check, so an entry set with ttlMs=1000 is still valid at exactly +1000ms)", () => {
    const cache = new TtlCache<string>();
    cache.set("k", "v", 1000);
    vi.advanceTimersByTime(1000); // now === expiresAt exactly
    expect(cache.get("k")?.value).toBe("v"); // strict > check, not >=
    vi.advanceTimersByTime(1); // now 1001ms, one past expiresAt
    expect(cache.get("k")).toBeUndefined();
  });

  it("get() does NOT delete the expired entry from the store (verified via getStale still finding it afterward) — regression test for M9: cachedFetch's stale-cache fallback needs the expired entry to survive a prior get() call", () => {
    const cache = new TtlCache<string>();
    cache.set("k", "v", 1000);
    vi.advanceTimersByTime(2000);
    expect(cache.get("k")).toBeUndefined(); // still refused by get() itself, per TTL
    expect(cache.getStale("k")?.value).toBe("v"); // but NOT evicted — getStale still sees it
  });

  it("getStale returns an EXPIRED entry that get() would refuse — used for graceful stale-data fallback — even after get() was already called on it", () => {
    // This is exactly the interaction proxy.test.ts's stale-cache-fallback
    // test exercises at the cachedFetch level (cachedFetch's own get() call
    // runs first, then getStale() in the catch block) — see M9 in the audit.
    const cache = new TtlCache<string>();
    cache.set("k", "v", 1000);
    vi.advanceTimersByTime(5000);
    cache.get("k");
    expect(cache.getStale("k")?.value).toBe("v");
  });

  it("getStale returns undefined for a key that was never set", () => {
    const cache = new TtlCache<string>();
    expect(cache.getStale("nope")).toBeUndefined();
  });

  it("set() overwrites an existing entry's value and resets its expiry", () => {
    const cache = new TtlCache<string>();
    cache.set("k", "v1", 1000);
    vi.advanceTimersByTime(900);
    cache.set("k", "v2", 1000); // fresh TTL from now
    vi.advanceTimersByTime(900); // total 1800ms since first set, but only 900ms since second
    expect(cache.get("k")?.value).toBe("v2");
  });

  it("fetchedAt reflects the time of the most recent set()", () => {
    const cache = new TtlCache<string>();
    cache.set("k", "v", 1000);
    const first = cache.get("k")?.fetchedAt;
    vi.advanceTimersByTime(100);
    cache.set("k", "v2", 1000);
    const second = cache.get("k")?.fetchedAt;
    expect(second).toBeGreaterThan(first!);
  });

  it("invalidate removes a single key", () => {
    const cache = new TtlCache<string>();
    cache.set("a", "1", 10000);
    cache.set("b", "2", 10000);
    cache.invalidate("a");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")?.value).toBe("2");
  });

  it("invalidatePrefix removes only keys matching the prefix", () => {
    const cache = new TtlCache<string>();
    cache.set("player:1", "a", 10000);
    cache.set("player:2", "b", 10000);
    cache.set("team:1", "c", 10000);
    cache.invalidatePrefix("player:");
    expect(cache.get("player:1")).toBeUndefined();
    expect(cache.get("player:2")).toBeUndefined();
    expect(cache.get("team:1")?.value).toBe("c");
  });

  it("get() on a never-set key returns undefined", () => {
    const cache = new TtlCache<string>();
    expect(cache.get("missing")).toBeUndefined();
  });
});
