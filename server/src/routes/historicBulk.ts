import { Router } from "express";
import { cachedFetch } from "../proxy.js";
import { bootstrapCache, elementSummaryCache, historicBulkCache } from "../cache.js";
import { CACHE_TTL_MS, FPL_BASE_URL, HISTORIC_BULK_CONCURRENCY } from "../config.js";
import { mapWithConcurrency } from "../concurrency.js";

export const historicBulkRouter = Router();

interface BulkPlayerHistory {
  playerId: number;
  // Passed through verbatim, unvalidated here — the client already
  // validates element-summary's history_past shape with Zod for the
  // per-profile lazy fetch, and reuses the same schema for this payload.
  historyPast: unknown[];
}

interface BulkResult {
  players: BulkPlayerHistory[];
  totalPlayers: number;
  skippedPlayerIds: number[];
}

// Prevents two simultaneous callers (e.g. two browser tabs both loading
// cold) from each kicking off their own several-hundred-request build.
let inFlightBuild: Promise<BulkResult> | null = null;

async function buildBulkHistoricData(): Promise<BulkResult> {
  const bootstrap = await cachedFetch({
    cache: bootstrapCache,
    cacheKey: "bootstrap-static",
    ttlMs: CACHE_TTL_MS.bootstrapStatic,
    url: `${FPL_BASE_URL}/bootstrap-static/`,
  });

  if (!bootstrap.ok) {
    throw new Error(bootstrap.error);
  }

  const bootstrapData = bootstrap.data as { elements: { id: number }[] };
  const playerIds = bootstrapData.elements.map((e) => e.id);

  const results = await mapWithConcurrency(playerIds, HISTORIC_BULK_CONCURRENCY, async (playerId) => {
    // Reuses the same per-player cache the lazy profile fetch uses, so a
    // player whose profile was recently opened doesn't cost a second
    // upstream request here.
    const summary = await cachedFetch({
      cache: elementSummaryCache,
      cacheKey: `element-summary:${playerId}`,
      ttlMs: CACHE_TTL_MS.elementSummary,
      url: `${FPL_BASE_URL}/element-summary/${playerId}/`,
    });
    if (!summary.ok) {
      throw new Error(summary.error);
    }
    const summaryData = summary.data as { history_past?: unknown[] };
    return summaryData.history_past ?? [];
  });

  const players: BulkPlayerHistory[] = [];
  const skippedPlayerIds: number[] = [];

  for (const r of results) {
    if (r.error || r.result === null) {
      skippedPlayerIds.push(r.item);
      continue;
    }
    players.push({ playerId: r.item, historyPast: r.result });
  }

  // A handful of stragglers (a rate-limit blip, one slow request) is
  // normal and fine to serve partial. If more than half failed, this is
  // a real upstream problem — fail the whole build rather than caching a
  // mostly-empty result that would silently look like "nobody has
  // career history" for 12 hours.
  if (skippedPlayerIds.length > playerIds.length * 0.5) {
    throw new Error(`Historic bulk build failed for ${skippedPlayerIds.length}/${playerIds.length} players — the upstream API may be unavailable`);
  }

  return { players, totalPlayers: playerIds.length, skippedPlayerIds };
}

async function handle(bypassCache: boolean) {
  if (!bypassCache) {
    const cached = historicBulkCache.get("historic-bulk");
    if (cached) {
      return { ok: true as const, data: cached.value as BulkResult, source: "cache" as const, fetchedAt: cached.fetchedAt };
    }
  }

  if (!inFlightBuild) {
    inFlightBuild = buildBulkHistoricData().finally(() => {
      inFlightBuild = null;
    });
  }

  try {
    const data = await inFlightBuild;
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
