import { Router } from "express";
import { cachedFetch } from "../proxy.js";
import { fixturesCache } from "../cache.js";
import { CACHE_TTL_MS, FPL_BASE_URL } from "../config.js";

export const fixturesRouter = Router();

async function handle(bypassCache: boolean) {
  return cachedFetch({
    cache: fixturesCache,
    cacheKey: "fixtures",
    ttlMs: CACHE_TTL_MS.fixtures,
    url: `${FPL_BASE_URL}/fixtures/`,
    bypassCache,
  });
}

fixturesRouter.get("/fixtures", async (_req, res) => {
  const result = await handle(false);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ data: result.data, meta: { source: result.source, fetchedAt: result.fetchedAt } });
});

fixturesRouter.post("/refresh/fixtures", async (_req, res) => {
  const result = await handle(true);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ data: result.data, meta: { source: result.source, fetchedAt: result.fetchedAt } });
});
