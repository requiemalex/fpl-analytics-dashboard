/**
 * GET /api/understat — the app's only door to Understat data, which it
 * never fetches from understat.com itself: the daily sync job
 * (scripts/understat/sync.ts) publishes data/understat/ to this project's
 * GitHub repository, and this route reads it from there (or straight from
 * disk when given `localDir`: `npm run dev` from a checkout).
 *
 * Returns the off-switch state, the sync status and the season summaries a
 * Data View can need: the live season and the last 4 completed ones.
 * Cached like every other upstream (30 minutes; completed seasons 12 hours),
 * and like them falls back to the last good copy if GitHub can't be
 * reached, flagged "stale-cache".
 *
 * Self-contained: nothing outside server/src/understat/ imports this
 * except app.ts, which mounts it — removing Understat removes this folder
 * and that one line.
 */
import { Router } from "express";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TtlCache } from "../cache.js";
import { cachedFetch, type ProxyResult } from "../proxy.js";

export const UNDERSTAT_REMOTE_BASE = "https://raw.githubusercontent.com/requiemalex/fpl-analytics-dashboard/master/data/understat";
const LIVE_TTL_MS = 30 * 60 * 1000;
const COMPLETED_TTL_MS = 12 * 60 * 60 * 1000;
/** The live season plus the 4 completed seasons a Historic Average covers. */
const SEASONS_SERVED = 5;

const cache = new TtlCache<unknown>();

interface StatusLike {
  liveSeason: string;
  seasons: string[];
}

type Source = "live" | "cache" | "stale-cache";

export function createUnderstatRouter(options: { localDir?: string } = {}): Router {
  const router = Router();

  async function load(rel: string, ttlMs: number, bypassCache: boolean): Promise<ProxyResult<unknown>> {
    if (options.localDir) {
      const path = join(options.localDir, rel);
      if (!existsSync(path)) return { ok: false, error: `${rel} not found`, status: 404 };
      return { ok: true, data: JSON.parse(readFileSync(path, "utf8")), source: "live", fetchedAt: Date.now() };
    }
    return cachedFetch({ cache, cacheKey: rel, ttlMs, url: `${UNDERSTAT_REMOTE_BASE}/${rel}`, bypassCache });
  }

  async function build(bypassCache: boolean) {
    const sources: Source[] = [];
    const control = await load("control.json", LIVE_TTL_MS, bypassCache);
    if (control.ok) {
      sources.push(control.source);
      const c = control.data as { enabled?: boolean; note?: string };
      if (c.enabled === false) return { ok: true as const, body: { enabled: false, note: c.note ?? null }, sources };
    } else if (control.status !== 404) {
      return { ok: false as const, status: control.status, error: control.error };
    }
    const status = await load("status.json", LIVE_TTL_MS, bypassCache);
    if (!status.ok) return { ok: false as const, status: status.status, error: status.error };
    sources.push(status.source);
    const s = status.data as StatusLike;
    const wanted = (s.seasons ?? []).slice(-SEASONS_SERVED);
    const seasons: Record<string, unknown> = {};
    for (const season of wanted) {
      const file = await load(`app/${season.replace("/", "-")}.json`, season === s.liveSeason ? LIVE_TTL_MS : COMPLETED_TTL_MS, bypassCache);
      if (!file.ok) return { ok: false as const, status: file.status, error: file.error };
      sources.push(file.source);
      seasons[season] = file.data;
    }
    return { ok: true as const, body: { enabled: true, status: status.data, seasons }, sources };
  }

  async function handle(bypassCache: boolean, res: import("express").Response) {
    try {
      const result = await build(bypassCache);
      if (!result.ok) {
        res.status(result.status).json({ error: `Understat data unavailable: ${result.error}` });
        return;
      }
      const source: Source = result.sources.includes("stale-cache") ? "stale-cache" : result.sources.every((x) => x === "cache") ? "cache" : "live";
      res.json({ data: result.body, meta: { source, fetchedAt: Date.now() } });
    } catch (err) {
      res.status(502).json({ error: `Understat data unreadable: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  router.get("/understat", (_req, res) => handle(false, res));
  router.post("/refresh/understat", (_req, res) => handle(true, res));
  return router;
}
