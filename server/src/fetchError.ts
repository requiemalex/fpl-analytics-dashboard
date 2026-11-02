/**
 * Why a fetch() failed, in plain English with the technical detail kept.
 * Node reports every network failure as a bare "fetch failed"; the real
 * reason (address lookup, refused, dropped, timed out, certificate) is in
 * its `cause`, sometimes an AggregateError of one error per address tried.
 * Used by the app's FPL client and by the scheduled jobs, so a failure in a
 * log or alert says what actually went wrong.
 */

const REASON_BY_CODE: [RegExp, string][] = [
  [/^(ENOTFOUND|EAI_AGAIN)$/, "the site's address couldn't be looked up (DNS)"],
  [/^ECONNREFUSED$/, "the connection was refused"],
  [/^(ECONNRESET|EPIPE|UND_ERR_SOCKET|UND_ERR_CLOSED)$/, "the connection was dropped"],
  [/^(ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT)$/, "couldn't connect in time (the site didn't accept the connection)"],
  [/^(UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT)$/, "connected, but the reply didn't arrive in time"],
  [/^(ENETUNREACH|EHOSTUNREACH)$/, "the network couldn't reach the site"],
  [/^(CERT_|ERR_TLS|UNABLE_TO_|DEPTH_ZERO|SELF_SIGNED|ERR_SSL)/, "the secure (HTTPS) connection failed"],
];

/** Every error in the chain: the error, its causes, and each error an AggregateError holds. */
function chain(err: unknown, depth = 0): Error[] {
  if (!(err instanceof Error) || depth > 5) return [];
  const inner = err instanceof AggregateError ? err.errors.flatMap((e) => chain(e, depth + 1)) : [];
  return [err, ...inner, ...chain(err.cause, depth + 1)];
}

/**
 * e.g. "couldn't connect in time (the site didn't accept the connection) — fetch failed: Connect
 * Timeout Error (attempted address: understat.com:443, timeout: 10000ms)". `timeoutMs` is the
 * caller's own time limit (AbortSignal.timeout), named in the text when that's what fired.
 */
export function describeFetchError(err: unknown, opts: { timeoutMs?: number } = {}): string {
  const errors = chain(err);
  if (errors.length === 0) return String(err);
  const technical = [...new Set(errors.map((e) => e.message).filter(Boolean))].join(": ");
  if (errors.some((e) => e.name === "TimeoutError" || e.name === "AbortError")) {
    return `no reply ${opts.timeoutMs ? `within ${Math.round(opts.timeoutMs / 1000)}s` : "in time"} (timed out) — ${technical}`;
  }
  const codes = errors.map((e) => (e as { code?: unknown }).code).filter((c): c is string => typeof c === "string");
  for (const [pattern, reason] of REASON_BY_CODE) {
    if (codes.some((c) => pattern.test(c))) return `${reason} — ${technical}`;
  }
  return technical;
}

/** The current time as "HH:MM:SS UTC", for each attempt in a failure message. */
export function utcTime(): string {
  return `${new Date().toISOString().slice(11, 19)} UTC`;
}

/** "<what>: no usable answer after N attempts:" then one line per attempt. */
export function attemptsFailed(what: string, failures: string[]): string {
  return `${what}: no usable answer after ${failures.length} attempt${failures.length === 1 ? "" : "s"}:\n${failures.map((f, i) => `  - attempt ${i + 1} at ${f}`).join("\n")}`;
}
