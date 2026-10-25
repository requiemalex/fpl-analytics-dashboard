import { Router } from "express";
import { cachedFetch } from "../proxy.js";
import { bootstrapCache, elementSummaryCache, fixturesCache, historicBulkCache } from "../cache.js";
import { CACHE_TTL_MS, FPL_BASE_URL, HISTORIC_BULK_CONCURRENCY } from "../config.js";
import { mapWithConcurrency } from "../concurrency.js";
import { aggregateClubSeason } from "../clubHistory/aggregate.js";
import { COMPLETED_CLUB_SEASONS } from "../clubHistory/completedSeasons.generated.js";
import { fixturesFromOfficial, ledgerRowsFromOfficial, seasonNameFromBootstrap, teamsFromBootstrap } from "../clubHistory/official.js";
import type { ClubSeason } from "../clubHistory/types.js";

export const historicBulkRouter = Router();

interface BulkPlayerHistory {
  playerId: number;
  // Passed through verbatim, unvalidated here — the client already
  // validates element-summary's history_past shape with Zod for the
  // per-profile lazy fetch, and reuses the same schema for this payload.
  historyPast: unknown[];
  /**
   * <season_matches>: this season's matches he was registered for, oldest
   * first, as [minutes, starts] — what Model Predicted's chance of starting
   * reads (his recent starts, the last one counting most). From the same
   * element-summary response's `history`, so it costs no extra request.
   */
  seasonMatches: [number, number][];
}

/** <season_matches> from an element-summary `history` (unvalidated here, like history_past: anything unreadable is left out). */
export function seasonMatchesFrom(history: unknown[]): [number, number][] {
  return history
    .filter((h): h is { minutes?: unknown; starts?: unknown; kickoff_time?: unknown; round?: unknown } => typeof h === "object" && h !== null)
    .map((h) => ({ minutes: Number(h.minutes), starts: Number(h.starts), kickoff: typeof h.kickoff_time === "string" ? h.kickoff_time : "", round: Number(h.round) || 0 }))
    .filter((h) => Number.isFinite(h.minutes) && Number.isFinite(h.starts))
    .sort((a, b) => a.round - b.round || a.kickoff.localeCompare(b.kickoff))
    .map((h) => [h.minutes, h.starts]);
}

interface BulkResult {
  players: BulkPlayerHistory[];
  totalPlayers: number;
  skippedPlayerIds: number[];
  /**
   * Every club's figures for every season on record — the bundled completed
   * seasons (see clubHistory/types.ts) plus the live season, built here
   * from the very same element-summary responses this build already
   * fetches for history_past (each carries this season's per-fixture
   * `history`), so it costs no extra per-player requests.
   */
  clubSeasons: ClubSeason[];
}

/**
 * The live season's club figures, or [] if they can't be built (fixtures
 * unavailable, pre-season) — never fails the whole historic build, which
 * players' history_past doesn't depend on.
 */
function buildLiveClubSeasons(bootstrap: unknown, fixturesData: unknown, historyByElement: Map<number, unknown[]>): ClubSeason[] {
  try {
    const season = seasonNameFromBootstrap(bootstrap);
    if (!season) return [];
    const fixtures = fixturesFromOfficial(fixturesData);
    return aggregateClubSeason(season, teamsFromBootstrap(bootstrap), fixtures, ledgerRowsFromOfficial(bootstrap, fixtures, historyByElement));
  } catch {
    return [];
  }
}

/** Live season first; a bundled copy of the same season (possible right after a season ends) gives way to it. */
function mergeClubSeasons(live: ClubSeason[]): ClubSeason[] {
  const liveSeasons = new Set(live.map((c) => c.season));
  return [...COMPLETED_CLUB_SEASONS.filter((c) => !liveSeasons.has(c.season)), ...live];
}

// Prevents two simultaneous callers (e.g. two browser tabs both loading
// cold) from each kicking off their own several-hundred-request build.
// Keyed by bypassCache, exactly like proxy.ts's own cachedFetch's `inFlight`
// map (see its `refresh:` in-flight key) — a normal load and an explicit
// "force refresh" must never coalesce into the same build, or the refresh
// silently loses its force-refresh semantics if it lands while a normal
// (non-bypassed) build is already in flight (Phase 3 audit, R1: two normal
// loads still coalesce with each other, and two refreshes still coalesce
// with each other, but a refresh always gets its own bypassed build rather
// than riding whatever non-bypassed build happened to already be running).
const inFlightBuilds = new Map<boolean, Promise<BulkResult>>();

/**
 * Builds that used upstream data served stale (FPL failing, the proxy
 * falling back to an old cached copy). They're served as "stale-cache" and
 * kept only briefly, never presented as a fresh build for 12 hours (audit
 * 2026-10-18 M3).
 */
const builtFromStale = new WeakSet<BulkResult>();

// Exported for testing (L10 regression — see historicBulk.test.ts): whether
// a "force refresh" build actually bypasses every cache it touches, not
// just the top-level historic-bulk entry.
export async function buildBulkHistoricData(bypassCache: boolean): Promise<BulkResult> {
  const bootstrap = await cachedFetch({
    cache: bootstrapCache,
    cacheKey: "bootstrap-static",
    persistAs: "fpl/bootstrap-static.json",
    ttlMs: CACHE_TTL_MS.bootstrapStatic,
    url: `${FPL_BASE_URL}/bootstrap-static/`,
    bypassCache,
  });

  if (!bootstrap.ok) {
    throw new Error(bootstrap.error);
  }

  const bootstrapData = bootstrap.data as { elements: { id: number }[] };
  const playerIds = bootstrapData.elements.map((e) => e.id);

  // Only needed for the live season's club figures (which club each
  // fixture's sides are) — a failure here just leaves the live season out.
  const fixtures = await cachedFetch({
    cache: fixturesCache,
    cacheKey: "fixtures",
    persistAs: "fpl/fixtures.json",
    ttlMs: CACHE_TTL_MS.fixtures,
    url: `${FPL_BASE_URL}/fixtures/`,
    bypassCache,
  });

  const results = await mapWithConcurrency(playerIds, HISTORIC_BULK_CONCURRENCY, async (playerId) => {
    // Reuses the same per-player cache the lazy profile fetch uses, so a
    // player whose profile was recently opened doesn't cost a second
    // upstream request here — unless this build was itself explicitly
    // requested as a refresh (bypassCache), in which case "force refresh"
    // means force refresh all the way down, not just the top-level
    // historic-bulk entry (L10 in the Phase 1 audit).
    const summary = await cachedFetch({
      cache: elementSummaryCache,
      cacheKey: `element-summary:${playerId}`,
      ttlMs: CACHE_TTL_MS.elementSummary,
      url: `${FPL_BASE_URL}/element-summary/${playerId}/`,
      bypassCache,
    });
    if (!summary.ok) {
      throw new Error(summary.error);
    }
    const summaryData = summary.data as { history_past?: unknown[]; history?: unknown[] };
    return { historyPast: summaryData.history_past ?? [], history: summaryData.history ?? [], stale: summary.source === "stale-cache" };
  });

  const players: BulkPlayerHistory[] = [];
  const skippedPlayerIds: number[] = [];
  const historyByElement = new Map<number, unknown[]>();
  let staleCount = 0;

  for (const r of results) {
    if (r.error || r.result === null) {
      skippedPlayerIds.push(r.item);
      continue;
    }
    players.push({ playerId: r.item, historyPast: r.result.historyPast, seasonMatches: seasonMatchesFrom(r.result.history) });
    historyByElement.set(r.item, r.result.history);
    if (r.result.stale) staleCount += 1;
  }

  // A handful of stragglers (a rate-limit blip, one slow request) is
  // normal and fine to serve partial. If more than half failed, this is
  // a real upstream problem — fail the whole build rather than caching a
  // mostly-empty result that would silently look like "nobody has
  // career history" for 12 hours.
  // A player answered only from a stale cached copy counts as failed here
  // too: FPL didn't actually answer for him (audit 2026-10-18 M3).
  if (skippedPlayerIds.length + staleCount > playerIds.length * 0.5) {
    throw new Error(`Historic bulk build failed for ${skippedPlayerIds.length + staleCount}/${playerIds.length} players. The upstream API may be unavailable`);
  }

  const liveClubSeasons = fixtures.ok ? buildLiveClubSeasons(bootstrap.data, fixtures.data, historyByElement) : [];
  const result: BulkResult = { players, totalPlayers: playerIds.length, skippedPlayerIds, clubSeasons: mergeClubSeasons(liveClubSeasons) };
  const fixturesStale = fixtures.ok && fixtures.source === "stale-cache";
  if (staleCount > 0 || bootstrap.source === "stale-cache" || fixturesStale) builtFromStale.add(result);
  return result;
}

async function handle(bypassCache: boolean) {
  if (!bypassCache) {
    const cached = historicBulkCache.get("historic-bulk");
    if (cached) {
      const data = cached.value as BulkResult;
      return { ok: true as const, data, source: builtFromStale.has(data) ? ("stale-cache" as const) : ("cache" as const), fetchedAt: cached.fetchedAt };
    }
  }

  let pending = inFlightBuilds.get(bypassCache);
  if (!pending) {
    pending = buildBulkHistoricData(bypassCache).finally(() => {
      inFlightBuilds.delete(bypassCache);
    });
    inFlightBuilds.set(bypassCache, pending);
  }

  try {
    const data = await pending;
    if (builtFromStale.has(data)) {
      // Kept as briefly as one player's data would be, so the next request
      // after FPL recovers builds afresh.
      historicBulkCache.set("historic-bulk", data, CACHE_TTL_MS.elementSummary);
      return { ok: true as const, data, source: "stale-cache" as const, fetchedAt: Date.now() };
    }
    historicBulkCache.set("historic-bulk", data, CACHE_TTL_MS.historicBulk);
    return { ok: true as const, data, source: "live" as const, fetchedAt: Date.now() };
  } catch (err) {
    // Graceful degradation: serve a previous build even if stale, rather
    // than fail outright, exactly like the single-resource proxy does.
    const stale = historicBulkCache.getStale("historic-bulk");
    if (stale) {
      return { ok: true as const, data: stale.value as BulkResult, source: "stale-cache" as const, fetchedAt: stale.fetchedAt };
    }
    return { ok: false as const, error: (err as Error).message, status: 502 };
  }
}

historicBulkRouter.get("/historic-bulk", async (_req, res) => {
  const result = await handle(false);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ data: result.data, meta: { source: result.source, fetchedAt: result.fetchedAt } });
});

historicBulkRouter.post("/refresh/historic-bulk", async (_req, res) => {
  const result = await handle(true);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ data: result.data, meta: { source: result.source, fetchedAt: result.fetchedAt } });
});
