import { fetchJson, UpstreamError } from "./httpClient.js";
import { TtlCache } from "./cache.js";

export type ProxyResult<T> =
  | { ok: true; data: T; source: "live" | "cache" | "stale-cache"; fetchedAt: number }
  | { ok: false; error: string; status: number };

// Prevents duplicate concurrent upstream requests for the same cache key —
// e.g. several browser tabs refreshing at once, or a manual refresh firing
// while a background fetch is already in flight.
const inFlight = new Map<string, Promise<unknown>>();

export async function cachedFetch<T>(options: {
  cache: TtlCache<T>;
  cacheKey: string;
  ttlMs: number;
  url: string;
  bypassCache?: boolean;
}): Promise<ProxyResult<T>> {
  const { cache, cacheKey, ttlMs, url, bypassCache } = options;

  if (!bypassCache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return { ok: true, data: cached.value, source: "cache", fetchedAt: cached.fetchedAt };
    }
  }

  const inFlightKey = bypassCache ? `refresh:${cacheKey}` : cacheKey;
  let pending = inFlight.get(inFlightKey) as Promise<T> | undefined;

  if (!pending) {
    pending = fetchJson<T>(url).finally(() => {
      inFlight.delete(inFlightKey);
    });
    inFlight.set(inFlightKey, pending);
  }

  try {
    const data = await pending;
    cache.set(cacheKey, data, ttlMs);
    return { ok: true, data, source: "live", fetchedAt: Date.now() };
  } catch (err) {
    // Graceful degradation: if we have any previously-cached value (even
    // expired), serve it with a clear staleness flag rather than failing.
    const stale = cache.getStale(cacheKey);
    if (stale) {
      return { ok: true, data: stale.value, source: "stale-cache", fetchedAt: stale.fetchedAt };
    }

    if (err instanceof UpstreamError) {
      return {
        ok: false,
        error: err.message,
        status: err.isTimeout ? 504 : err.status && err.status >= 400 && err.status < 500 ? err.status : 502,
      };
    }
    return { ok: false, error: "Unknown proxy error", status: 500 };
  }
}
