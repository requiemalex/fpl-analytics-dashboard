import { createHash } from "node:crypto";

/**
 * <file_versions>: a short fingerprint of a published Understat file's
 * content. The sync lists one per app file in status.json (`fileVersions`,
 * by path); the app's route compares it with the copy it holds (in memory,
 * or put back from disk) and reads the file again when they differ. So a
 * sync that rewrites a file — a completed season given new figures, as on
 * 2026-10-31 — reaches the app with the next status, not after the file's
 * cache time (12 hours for a completed season).
 *
 * From the parsed value, so a copy read back from JSON fingerprints the
 * same as the object the sync wrote, whatever the file's formatting.
 */
const memo = new WeakMap<object, string>();

export function fileVersion(value: unknown): string {
  if (value !== null && typeof value === "object") {
    const known = memo.get(value);
    if (known) return known;
  }
  const version = createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
  if (value !== null && typeof value === "object") memo.set(value, version);
  return version;
}
