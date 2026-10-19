/**
 * A small, dependency-free in-memory TTL cache.
 *
 * This is intentionally simple: the project brief explicitly rules out a
 * database or persistent backend storage. Entries disappear when the process
 * restarts, which is fine — bootstrap/fixtures/element-summary data is cheap
 * to re-fetch from the official API.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  fetchedAt: number;
}

/** Default size cap per cache: comfortably above the ~800 players element-summary holds, so in normal use nothing is ever evicted. */
export const DEFAULT_MAX_ENTRIES = 2000;

export class TtlCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();

  /**
   * `maxEntries`: past it, the least recently stored entry goes. Keys come
   * from request paths (any manager's team ID, any player ID), so without a
   * cap the store could only grow for as long as the process runs.
   */
  constructor(private readonly maxEntries: number = DEFAULT_MAX_ENTRIES) {}

  get(key: string): { value: T; fetchedAt: number } | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    // Deliberately does NOT delete an expired entry — callers that hit an
    // upstream failure right after a cache miss fall back to getStale() for
    // graceful degradation (see proxy.ts's cachedFetch), which needs the
    // expired entry to still be there. A fresh set() naturally overwrites
    // it later, and maxEntries bounds the store either way.
    if (Date.now() > entry.expiresAt) {
      return undefined;
    }
    return { value: entry.value, fetchedAt: entry.fetchedAt };
  }

  /** Returns the entry even if expired — used for graceful degradation (stale-data fallback). */
  getStale(key: string): { value: T; fetchedAt: number } | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    return { value: entry.value, fetchedAt: entry.fetchedAt };
  }

  /**
   * `startedAt`: when the request that produced `value` began. The TTL runs
   * from then, not from when a slow response finally arrived, so a client
   * polling every TTL always lands on a fresh copy (audit 2026-10-18 L2:
   * a 10-minute poll against a 10-minute TTL got the same snapshot every
   * other time, so live figures moved every 20 minutes). Defaults to now.
   */
  set(key: string, value: T, ttlMs: number, startedAt: number = Date.now()): void {
    // Re-inserted, so a Map's insertion order is "least recently stored first" for eviction.
    this.store.delete(key);
    this.store.set(key, {
      value,
      expiresAt: startedAt + ttlMs,
      fetchedAt: Date.now(),
    });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}

// One shared cache instance per data domain keeps key collisions impossible
// even though all of them could share a single generic cache.
export const bootstrapCache = new TtlCache<unknown>();
export const fixturesCache = new TtlCache<unknown>();
export const elementSummaryCache = new TtlCache<unknown>();
export const eventLiveCache = new TtlCache<unknown>();
export const historicBulkCache = new TtlCache<unknown>();
/** Real managers' team data — kept separate from the pool caches above, and much shorter-lived (see CACHE_TTL_MS.entryImport), since this reflects one person's live, changeable squad rather than shared, slower-moving league data. */
export const entryImportCache = new TtlCache<unknown>();
