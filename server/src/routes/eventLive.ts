import { Router } from "express";
import { cachedFetch } from "../proxy.js";
import { eventLiveCache } from "../cache.js";
import { CACHE_TTL_MS, FPL_BASE_URL } from "../config.js";

/**
 * Proxies FPL's event/{id}/live/: every player's points and minutes in one
 * gameweek, one request for the whole pool — what Team Building's
 * Gameweek Log and Gameweek Summary score a squad and the captains with
 * (<gameweek_log>, <gameweek_summary>).
 */
export const eventLiveRouter = Router();

eventLiveRouter.get("/event/:eventId/live", async (req, res) => {
  const { eventId } = req.params;
  // FPL's gameweeks run 1–38; anything else never reaches the upstream API.
  if (!/^\d{1,2}$/.test(eventId) || Number(eventId) < 1 || Number(eventId) > 38) return res.status(400).json({ error: "Invalid gameweek" });
  const result = await cachedFetch({
    cache: eventLiveCache,
    cacheKey: `event-live:${eventId}`,
    ttlMs: CACHE_TTL_MS.eventLive,
    url: `${FPL_BASE_URL}/event/${eventId}/live/`,
    bypassCache: false,
  });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ data: result.data, meta: { source: result.source, fetchedAt: result.fetchedAt } });
});
