import { Router } from "express";
import { cachedFetch } from "../proxy.js";
import { elementSummaryCache } from "../cache.js";
import { CACHE_TTL_MS, FPL_BASE_URL } from "../config.js";

export const elementSummaryRouter = Router();

function isValidPlayerId(raw: string): boolean {
  return /^\d+$/.test(raw);
}

async function handle(playerId: string, bypassCache: boolean) {
  return cachedFetch({
    cache: elementSummaryCache,
    cacheKey: `element-summary:${playerId}`,
    ttlMs: CACHE_TTL_MS.elementSummary,
    url: `${FPL_BASE_URL}/element-summary/${playerId}/`,
    bypassCache,
  });
}

elementSummaryRouter.get("/element-summary/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidPlayerId(id)) {
    res.status(400).json({ error: "Invalid player id" });
    return;
  }
  const result = await handle(id, false);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ data: result.data, meta: { source: result.source, fetchedAt: result.fetchedAt } });
});

elementSummaryRouter.post("/refresh/element-summary/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidPlayerId(id)) {
    res.status(400).json({ error: "Invalid player id" });
    return;
  }
  const result = await handle(id, true);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ data: result.data, meta: { source: result.source, fetchedAt: result.fetchedAt } });
});
