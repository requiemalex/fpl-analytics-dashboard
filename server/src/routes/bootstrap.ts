import { Router } from "express";
import { cachedFetch } from "../proxy.js";
import { bootstrapCache } from "../cache.js";
import { CACHE_TTL_MS, FPL_BASE_URL } from "../config.js";

export const bootstrapRouter = Router();

async function handle(bypassCache: boolean) {
  return cachedFetch({
    cache: bootstrapCache,
    cacheKey: "bootstrap-static",
    ttlMs: CACHE_TTL_MS.bootstrapStatic,
    url: `${FPL_BASE_URL}/bootstrap-static/`,
    bypassCache,
  });
}

bootstrapRouter.get("/bootstrap-static", async (_req, res) => {
  const result = await handle(false);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ data: result.data, meta: { source: result.source, fetchedAt: result.fetchedAt } });
});

bootstrapRouter.post("/refresh/bootstrap-static", async (_req, res) => {
  const result = await handle(true);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ data: result.data, meta: { source: result.source, fetchedAt: result.fetchedAt } });
});
