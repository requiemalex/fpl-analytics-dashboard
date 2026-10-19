/**
 * Centralised, easily-changeable configuration for the FPL API proxy.
 *
 * Per the project brief: cache TTLs are recommended defaults, not immutable
 * requirements. Keep them all in one place so they can be tuned without
 * hunting through route handlers.
 */

export const FPL_BASE_URL = "https://fantasy.premierleague.com/api";

export const PORT = Number(process.env.PORT ?? 4000);

/** Milliseconds before an outbound request to the FPL API is aborted. */
export const REQUEST_TIMEOUT_MS = 8000;

/** Retry policy for transient network errors / 5xx responses only. */
export const RETRY_POLICY = {
  maxRetries: 2,
  // Capped exponential backoff: 300ms, 600ms, then give up.
  baseDelayMs: 300,
  maxDelayMs: 2000,
};

/** Cache TTLs, in milliseconds. See <cache_policy> in the project brief. */
export const CACHE_TTL_MS = {
  bootstrapStatic: 10 * 60 * 1000, // 10 minutes
  // The client polls every 10 minutes; at 30 a finished match or a new
  // score could take half an hour to reach the app. One request, so cheap.
  fixtures: 10 * 60 * 1000, // 10 minutes
  elementSummary: 30 * 60 * 1000, // 30 minutes
  eventLive: 60 * 1000, // 60 seconds
  // The bulk build carries the live season's club figures and every
  // player's live gameweek log as well as history_past, so it goes out of
  // date with every match — kept no longer than the per-player data it's
  // built from. It costs one request per player, so the client asks for it
  // only once a session, on Refresh Data, and when the fixtures show newly
  // finished matches (at most hourly: AppStateContext).
  historicBulk: 30 * 60 * 1000, // 30 minutes
  // Short: a real manager's bank/picks/chips can change the moment they
  // make a transfer, unlike the shared pool data above.
  entryImport: 2 * 60 * 1000, // 2 minutes
};

/** Simultaneous element-summary requests when building the whole-pool historic dataset — a courtesy limit on the official API, not a hard requirement it imposes. */
export const HISTORIC_BULK_CONCURRENCY = 15;

export const CORS_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
