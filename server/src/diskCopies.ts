import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { TtlCache } from "./cache.js";

/**
 * <disk_copies>: the desktop app keeps the last good copy of the data a
 * launch needs (FPL's bootstrap-static and fixtures, and the Understat
 * files) on disk, in its data folder. The caches only live in memory, so
 * before this every launch started with nothing to fall back on: no
 * internet, FPL's "the game is being updated" spells around deadlines, or a
 * slow connection meant "Couldn't load live FPL data" (audit 2026-10-23,
 * finding 7), and every launch downloaded Understat's completed seasons
 * again although they rarely change (Efficiency C).
 *
 * A copy goes back into its memory cache the first time its key is asked
 * for, with the time it was really fetched, so the caches' own rules apply
 * unchanged: within its TTL it's served as cached (a relaunch soon after
 * needs no download at all); past it, a live fetch is tried first and the
 * copy is only the stale-cache fallback, flagged as such, never passed off
 * as live. A copy older than MAX_COPY_AGE_MS is never used. Each copy is
 * the latest that was fetched, so it's never from an earlier season than
 * the app has already seen.
 *
 * Off unless a folder is given (createApp's `dataCacheDir`, which only the
 * desktop app passes): `npm run dev` and the reference Dockerfile keep
 * memory-only caches.
 */
export const MAX_COPY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let folder: string | null = null;
/** Keys already looked up on disk this run (restored or not): each is read at most once. */
const restored = new Set<string>();

export function useDiskCopies(dir: string | undefined): void {
  folder = dir ?? null;
  restored.clear();
}

interface StoredCopy {
  fetchedAt: number;
  value: unknown;
}

/** `name` is a fixed name chosen by the caller (e.g. "fpl/bootstrap-static.json"), never request input. */
function fileFor(name: string): string | null {
  return folder ? join(folder, name) : null;
}

/** Puts the disk copy `name` into `cache` under `cacheKey`, once per run, unless the cache already has the key or the copy is too old. */
export function restoreDiskCopy(cache: TtlCache<unknown>, cacheKey: string, name: string, ttlMs: number): void {
  const file = fileFor(name);
  if (!file || restored.has(name)) return;
  restored.add(name);
  if (cache.getStale(cacheKey) || !existsSync(file)) return;
  try {
    const copy = JSON.parse(readFileSync(file, "utf8")) as StoredCopy;
    if (typeof copy.fetchedAt !== "number" || Date.now() - copy.fetchedAt > MAX_COPY_AGE_MS) return;
    cache.restore(cacheKey, copy.value, ttlMs, copy.fetchedAt);
  } catch (err) {
    console.warn(`Saved copy ${name} unreadable, ignored:`, err);
  }
}

/** Saves `value` as the disk copy `name`. Written whole then renamed into place, so a crash mid-write never leaves half a copy. */
export function saveDiskCopy(name: string, value: unknown, fetchedAt: number): void {
  const file = fileFor(name);
  if (!file) return;
  restored.add(name); // a newer copy than any on disk is already in memory
  try {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify({ fetchedAt, value } satisfies StoredCopy));
    renameSync(temp, file);
  } catch (err) {
    console.warn(`Couldn't save copy ${name}:`, err);
  }
}

/** For tests: when the copy was written, or null. */
export function diskCopyWrittenAt(name: string): number | null {
  const file = fileFor(name);
  return file && existsSync(file) ? statSync(file).mtimeMs : null;
}
