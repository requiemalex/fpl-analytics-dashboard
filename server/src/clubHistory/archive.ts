import type { LedgerRow } from "./types.js";

/**
 * <append_only>: merges a fresh fetch into what's already archived, keyed by
 * (fixture, player code). A fresh row replaces the archived one, so late
 * corrections such as bonus points flow in, but an archived row is never
 * deleted: a player FPL stops listing keeps every appearance already
 * archived, counted for the club he made it for, and re-listing him
 * replaces his rows rather than duplicating them.
 */
export function mergeArchivedRows(existing: LedgerRow[], fresh: LedgerRow[]): { rows: LedgerRow[]; added: number } {
  const merged = new Map<string, LedgerRow>();
  for (const r of existing) merged.set(`${r.fixture}:${r.code}`, r);
  let added = 0;
  for (const r of fresh) {
    const key = `${r.fixture}:${r.code}`;
    if (!merged.has(key)) added += 1;
    merged.set(key, r);
  }
  return { rows: [...merged.values()], added };
}
