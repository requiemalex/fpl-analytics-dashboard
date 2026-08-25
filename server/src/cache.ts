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

export class TtlCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();

  get(key: string): { value: T; fetchedAt: number } | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
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

  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      fetchedAt: Date.now(),
    });
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
