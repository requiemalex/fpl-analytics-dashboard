import { REQUEST_TIMEOUT_MS, RETRY_POLICY } from "./config.js";

export class UpstreamError extends Error {
  status: number | null;
  isTimeout: boolean;

  constructor(message: string, status: number | null, isTimeout: boolean = false) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
    this.isTimeout = isTimeout;
  }
}

function isTransient(status: number | null, isTimeout: boolean): boolean {
  if (isTimeout) return true;
  if (status === null) return true; // network-level failure
  return status >= 500 && status < 600;
}

function delayFor(attempt: number): number {
  const exp = RETRY_POLICY.baseDelayMs * Math.pow(2, attempt);
  return Math.min(exp, RETRY_POLICY.maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches JSON from the official FPL API with:
 *  - an explicit request timeout (REQUEST_TIMEOUT_MS)
 *  - a small, capped exponential backoff retry — ONLY for transient
 *    network failures and 5xx responses. 4xx responses are never retried.
 */
export async function fetchJson<T>(url: string): Promise<T> {
  let lastError: UpstreamError | null = null;

  for (let attempt = 0; attempt <= RETRY_POLICY.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          // The official FPL API blocks requests with no user agent from some hosts.
          "User-Agent": "fpl-analytics-dashboard/1.0 (local development proxy)",
        },
      });

      clearTimeout(timer);

      if (!res.ok) {
        const err = new UpstreamError(`FPL API responded ${res.status} for ${url}`, res.status);
        if (isTransient(res.status, false) && attempt < RETRY_POLICY.maxRetries) {
          lastError = err;
          await sleep(delayFor(attempt));
          continue;
        }
        throw err;
      }

      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);

      const isTimeout = err instanceof Error && err.name === "AbortError";
      const upstreamErr =
        err instanceof UpstreamError
          ? err
          : new UpstreamError(
              isTimeout ? `Request to ${url} timed out after ${REQUEST_TIMEOUT_MS}ms` : `Network error fetching ${url}: ${(err as Error).message}`,
              null,
              isTimeout,
            );

      if (isTransient(upstreamErr.status, upstreamErr.isTimeout) && attempt < RETRY_POLICY.maxRetries) {
        lastError = upstreamErr;
        await sleep(delayFor(attempt));
        continue;
      }
      throw upstreamErr;
    }
  }

  // Unreachable in practice, but keeps TypeScript happy.
  throw lastError ?? new UpstreamError("Unknown upstream failure", null);
}
