/**
 * GET /api/understat — the app's only door to Understat data, which it
 * never fetches from understat.com itself: the daily sync job
 * (scripts/understat/sync.ts) publishes data/understat/ to this project's
 * GitHub repository, and this route reads it from there (or straight from
 * disk when given `localDir`: `npm run dev` from a checkout).
 *
 * Returns the off-switch state, the sync status and the season summaries a
 * Data View can need: the live season and the last 4 completed ones,
 * fetched side by side rather than one after another (audit 2026-10-23,
 * Efficiency C). Cached like every other upstream (30 minutes; completed
 * seasons 12 hours), and like them falls back to the last good copy if
 * GitHub can't be reached, flagged "stale-cache". In the desktop app every
 * file's last good copy is also kept on disk (<disk_copies>), so a launch
 * within those times downloads none of them, and one without internet
 * still has them.
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
import { restoreDiskCopy } from "../diskCopies.js";
import { onPitchWindow, wasOnPitch, type OnPitch } from "./onPitch.js";

export const UNDERSTAT_REMOTE_BASE = "https://raw.githubusercontent.com/requiemalex/fpl-analytics-dashboard/master/data/understat";
const LIVE_TTL_MS = 30 * 60 * 1000;
const COMPLETED_TTL_MS = 12 * 60 * 60 * 1000;
/** The live season plus the 4 completed seasons a Historic Average covers. */
const SEASONS_SERVED = 5;

const cache = new TtlCache<unknown>();

interface StatusLike {
  liveSeason: string;
  seasons: string[];
  /** When the sync wrote this status — it changes with every sync that publishes. */
  generatedAt?: string;
}

type Source = "live" | "cache" | "stale-cache";

export function createUnderstatRouter(options: { localDir?: string } = {}): Router {
  const router = Router();

  /**
   * The sync each cached live-season file was read under (status.json's
   * `generatedAt`). Status and a live file are each cached 30 minutes, so
   * a fresh status could otherwise come with a live file cached just before
   * that sync landed; a file read under an older sync is read again — once
   * per sync, not per request. A failed re-read still falls back to the
   * last good copy (cachedFetch). A copy put back from disk (<disk_copies>)
   * has no record here: it's read again if it was fetched before the sync.
   */
  const readUnderSync = new Map<string, string>();

  async function load(rel: string, ttlMs: number, sync?: string): Promise<ProxyResult<unknown>> {
    if (options.localDir) {
      const path = join(options.localDir, rel);
      if (!existsSync(path)) return { ok: false, error: `${rel} not found`, status: 404 };
      return { ok: true, data: JSON.parse(readFileSync(path, "utf8")), source: "live", fetchedAt: Date.now() };
    }
    const persistAs = `understat/${rel}`;
    let stale = false;
    if (sync !== undefined) {
      restoreDiskCopy(cache, rel, persistAs, ttlMs);
      const readUnder = readUnderSync.get(rel);
      const fetchedAt = cache.getStale(rel)?.fetchedAt;
      stale = readUnder !== undefined ? readUnder !== sync : fetchedAt !== undefined && fetchedAt < Date.parse(sync);
    }
    const result = await cachedFetch({ cache, cacheKey: rel, ttlMs, url: `${UNDERSTAT_REMOTE_BASE}/${rel}`, bypassCache: stale, persistAs });
    if (sync !== undefined && result.ok && result.source !== "stale-cache") readUnderSync.set(rel, sync);
    return result;
  }

  async function build() {
    const sources: Source[] = [];
    // Side by side: status is cheap, and wasted only when Understat is switched off.
    const [control, status] = await Promise.all([load("control.json", LIVE_TTL_MS), load("status.json", LIVE_TTL_MS)]);
    if (control.ok) {
      sources.push(control.source);
      const c = control.data as { enabled?: boolean; note?: string };
      if (c.enabled === false) return { ok: true as const, body: { enabled: false, note: c.note ?? null }, sources };
    } else if (control.status !== 404) {
      return { ok: false as const, status: control.status, error: control.error };
    }
    if (!status.ok) return { ok: false as const, status: status.status, error: status.error };
    sources.push(status.source);
    const s = status.data as StatusLike;
    const wanted = (s.seasons ?? []).slice(-SEASONS_SERVED);
    const files = await Promise.all(
      wanted.map((season) => {
        const live = season === s.liveSeason;
        return load(`app/${season.replace("/", "-")}.json`, live ? LIVE_TTL_MS : COMPLETED_TTL_MS, live ? s.generatedAt : undefined);
      }),
    );
    const seasons: Record<string, unknown> = {};
    for (const [i, file] of files.entries()) {
      if (!file.ok) return { ok: false as const, status: file.status, error: file.error };
      sources.push(file.source);
      seasons[wanted[i]] = file.data;
    }
    return { ok: true as const, body: { enabled: true, status: status.data, seasons }, sources };
  }

  router.get("/understat", async (_req, res) => {
    try {
      const result = await build();
      if (!result.ok) {
        res.status(result.status).json({ error: `Understat data unavailable: ${result.error}` });
        return;
      }
      const source: Source = result.sources.includes("stale-cache") ? "stale-cache" : result.sources.every((x) => x === "cache") ? "cache" : "live";
      res.json({ data: result.body, meta: { source, fetchedAt: Date.now() } });
    } catch (err) {
      res.status(502).json({ error: `Understat data unreadable: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  /**
   * GET /api/understat/profile/(player|club)/:code/:season ("2025-26") —
   * one player's or club's slice of a season's profile file
   * (pipeline/profile.ts), never the whole file. `found: false` when the
   * season's file has nothing for that code (a player not linked, or who
   * didn't play), `available: false` when the season has no file at all.
   */
  router.get("/understat/profile/:kind/:code/:season", async (req, res) => {
    const { kind, code, season } = req.params;
    if ((kind !== "player" && kind !== "club") || !/^\d+$/.test(code) || !/^\d{4}-\d{2}$/.test(season)) {
      res.status(400).json({ error: "Invalid Understat profile request" });
      return;
    }
    try {
      const sources: Source[] = [];
      const [control, status] = await Promise.all([load("control.json", LIVE_TTL_MS), load("status.json", LIVE_TTL_MS)]);
      if (control.ok) {
        sources.push(control.source);
        if ((control.data as { enabled?: boolean }).enabled === false) {
          res.json({ data: { enabled: false }, meta: { source: control.source, fetchedAt: Date.now() } });
          return;
        }
      }
      const live = status.ok ? (status.data as StatusLike).liveSeason.replace("/", "-") === season : true;
      const sync = status.ok && live ? (status.data as StatusLike).generatedAt : undefined;
      const file = await load(`app/profile/${season}.json`, live ? LIVE_TTL_MS : COMPLETED_TTL_MS, sync);
      if (!file.ok) {
        if (file.status === 404) {
          res.json({ data: { enabled: true, available: false }, meta: { source: "live", fetchedAt: Date.now() } });
        } else {
          res.status(file.status).json({ error: `Understat profile data unavailable: ${file.error}` });
        }
        return;
      }
      sources.push(file.source);
      const source: Source = sources.includes("stale-cache") ? "stale-cache" : sources.every((x) => x === "cache") ? "cache" : "live";
      const body = kind === "player" ? playerSlice(file.data as ProfileFileLike, code) : clubSlice(file.data as ProfileFileLike, code);
      res.json({ data: { enabled: true, available: true, ...body }, meta: { source, fetchedAt: Date.now() } });
    } catch (err) {
      res.status(502).json({ error: `Understat profile data unreadable: ${err instanceof Error ? err.message : String(err)}` });
    }
  });
  return router;
}

// --- profile slices -------------------------------------------------------------

/** pipeline/types.ts AppProfileFile, as far as this route reads it (it doesn't import the pipeline). */
type ShotRow = [number, number, number, number, number, string, string, string];
/** Rows from before a field was added are shorter; a missing field is sent as null ("—"), never 0. */
type PlayerMatchRow = [number, string, number, number?, number?, number?, (number | null)?];
interface ProfileFileLike {
  players: Record<string, { matches: PlayerMatchRow[]; shots: ShotRow[] }>;
  clubs: Record<
    string,
    {
      matches: [number, number | null, number | null, number | null, number?, number?, number?, number?][];
      shots: ShotRow[];
      formations: unknown[] | null;
      lineups?: [number, [string, number | null, string][]][];
    }
  >;
}

const shotObject = ([fixture, minute, x, y, xG, result, situation, shotType]: ShotRow) => ({ fixture, minute, x, y, xG, result, situation, shotType });

/**
 * The shots a player's club faced while he was on the pitch — its
 * opponents' shots in each match he played, within his time on
 * (`onPitchWindow`, <shots_faced_on_pitch>). Null when a match row has no
 * club (a file written before it was added): unknown, never no shots.
 */
export function shotsFacedOnPitch(file: ProfileFileLike, matches: PlayerMatchRow[]): ShotRow[] | null {
  const windows = new Map<number, { club: number; on: OnPitch }>();
  for (const [fixture, position, minutes, , , , club] of matches) {
    if (club === undefined || club === null) return null;
    windows.set(fixture, { club, on: onPitchWindow(position, minutes) });
  }
  const faced: ShotRow[] = [];
  for (const [clubCode, club] of Object.entries(file.clubs)) {
    for (const s of club.shots) {
      const w = windows.get(s[0]);
      if (w && Number(clubCode) !== w.club && wasOnPitch(w.on, s[1])) faced.push(s);
    }
  }
  return faced.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function playerSlice(file: ProfileFileLike, code: string) {
  const p = file.players[code];
  if (!p) return { found: false };
  return {
    found: true,
    matches: p.matches.map(([fixture, position, minutes, xG, xA, assists]) => ({ fixture, position, minutes, xG: xG ?? null, xA: xA ?? null, assists: assists ?? null })),
    shots: p.shots.map(shotObject),
    shotsFaced: shotsFacedOnPitch(file, p.matches)?.map(shotObject) ?? null,
  };
}

/** A club's mean chance of each result over its matches that have one — null when none do. */
function meanChances(matches: ProfileFileLike["clubs"][string]["matches"]) {
  const known = matches.filter((m) => m[1] !== null && m[2] !== null && m[3] !== null);
  if (known.length === 0) return null;
  const mean = (i: 1 | 2 | 3) => known.reduce((sum, m) => sum + (m[i] as number), 0) / known.length;
  return { win: mean(1), draw: mean(2), loss: mean(3) };
}

/**
 * The club's own shots, and its opponents' in its matches (the shots it
 * faced); its starting XI in each match (`lineups`, null in a file written
 * before they were added); and every club's mean result chances that
 * season (`league`), what its Match Log Average is coloured against.
 */
function clubSlice(file: ProfileFileLike, code: string) {
  const c = file.clubs[code];
  if (!c) return { found: false };
  const fixtures = new Set(c.matches.map((m) => m[0]));
  const against: ShotRow[] = [];
  for (const [otherCode, other] of Object.entries(file.clubs)) {
    if (otherCode === code) continue;
    for (const s of other.shots) if (fixtures.has(s[0])) against.push(s);
  }
  against.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return {
    found: true,
    matches: c.matches.map(([fixture, win, draw, loss, xG, xGA, xA, assists]) => ({
      fixture,
      win,
      draw,
      loss,
      xG: xG ?? null,
      xGA: xGA ?? null,
      xA: xA ?? null,
      assists: assists ?? null,
    })),
    shots: c.shots.map(shotObject),
    shotsAgainst: against.map(shotObject),
    formations: c.formations,
    lineups: c.lineups?.map(([fixture, xi]) => ({ fixture, starters: xi.map(([position, code, name]) => ({ position, code, name })) })) ?? null,
    league: Object.values(file.clubs).flatMap((club) => {
      const m = meanChances(club.matches);
      return m ? [m] : [];
    }),
  };
}
