import { Router } from "express";
import { cachedFetch } from "../proxy.js";
import { eventLiveCache } from "../cache.js";
import { CACHE_TTL_MS, FPL_BASE_URL } from "../config.js";

export const eventLiveRouter = Router();

function isValidGameweek(raw: string): boolean {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 38;
}

eventLiveRouter.get("/event/:gw/live", async (req, res) => {
  const { gw } = req.params;
  if (!isValidGameweek(gw)) {
    res.status(400).json({ error: "Invalid gameweek" });
    return;
  }
  const result = await cachedFetch({
    cache: eventLiveCache,
    cacheKey: `event-live:${gw}`,
    ttlMs: CACHE_TTL_MS.eventLive,
    url: `${FPL_BASE_URL}/event/${gw}/live/`,
  });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ data: result.data, meta: { source: result.source, fetchedAt: result.fetchedAt } });
});
