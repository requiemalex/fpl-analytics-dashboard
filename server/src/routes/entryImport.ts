import { Router, type Response } from "express";
import { cachedFetch, type ProxyResult } from "../proxy.js";
import { entryImportCache } from "../cache.js";
import { CACHE_TTL_MS, FPL_BASE_URL } from "../config.js";

/**
 * Proxies FPL's real-manager "entry" endpoints — confirmed live against
 * the actual 2026/27 API (see README): entry/{id}/ for team identity plus
 * bank/squad value, entry/{id}/history/ for the chips-used record and
 * per-gameweek bank/value/transfers, entry/{id}/event/{event}/picks/ for
 * one gameweek's actual 15 picks. Unlike bootstrap-static and fixtures,
 * the picks shape specifically was cross-checked against several
 * independent community write-ups rather than fetched directly inside
 * this build environment — see the client-side parsing in
 * normalizeEntryImport.ts, which is written defensively for exactly that
 * reason (a missing/renamed field degrades to a clear error, never a
 * crash or a silently wrong squad).
 */
export const entryImportRouter = Router();

function isValidId(raw: string): boolean {
  return /^\d+$/.test(raw) && raw.length < 12; // guards against absurd input reaching the upstream API at all
}

async function handle(path: string, cacheKey: string, bypassCache: boolean) {
  return cachedFetch({
    cache: entryImportCache,
    cacheKey,
    ttlMs: CACHE_TTL_MS.entryImport,
    url: `${FPL_BASE_URL}${path}`,
    bypassCache,
  });
}

function respond(res: Response, result: ProxyResult<unknown>) {
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ data: result.data, meta: { source: result.source, fetchedAt: result.fetchedAt } });
}

entryImportRouter.get("/entry/:teamId", async (req, res) => {
  const { teamId } = req.params;
  if (!isValidId(teamId)) return res.status(400).json({ error: "Invalid team ID" });
  respond(res, await handle(`/entry/${teamId}/`, `entry:${teamId}`, false));
});

entryImportRouter.get("/entry/:teamId/history", async (req, res) => {
  const { teamId } = req.params;
  if (!isValidId(teamId)) return res.status(400).json({ error: "Invalid team ID" });
  respond(res, await handle(`/entry/${teamId}/history/`, `entry-history:${teamId}`, false));
});

entryImportRouter.get("/entry/:teamId/event/:eventId/picks", async (req, res) => {
  const { teamId, eventId } = req.params;
  if (!isValidId(teamId) || !isValidId(eventId)) return res.status(400).json({ error: "Invalid team or gameweek ID" });
  respond(res, await handle(`/entry/${teamId}/event/${eventId}/picks/`, `entry-picks:${teamId}:${eventId}`, false));
});
