/**
 * Fetches the LIVE season's club-history record from the official FPL API:
 * fixtures, clubs and one row per player per fixture, merged into what's
 * already archived (<append_only>, mergeArchivedRows). Shared by the
 * twice-weekly archive (archive-current.ts), which writes it, and the daily
 * Understat sync (scripts/understat/sync.ts), which checks Understat against
 * it without writing it, so new matches are checked the day FPL confirms
 * them (audit 2026-10-18 H3).
 */
import { mergeArchivedRows } from "../../server/src/clubHistory/archive.js";
import { readSeasonLedger, type SeasonLedger } from "../../server/src/clubHistory/ledgerFiles.js";
import { fixturesFromOfficial, ledgerRowsFromOfficial, seasonNameFromBootstrap, teamsFromBootstrap } from "../../server/src/clubHistory/official.js";

export const FPL_API = "https://fantasy.premierleague.com/api";
const CONCURRENCY = 8;
/** More than this share of element-summary requests failing means the API is having a bad day — use nothing rather than a patchy record. */
const MAX_FAILURE_SHARE = 0.05;

export async function getJson(url: string, userAgent: string, attempts = 4): Promise<unknown> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": userAgent } });
      if (res.ok) return await res.json();
      lastError = new Error(`${url}: HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
  throw lastError;
}

export interface LiveLedgerResult {
  ledger: SeasonLedger;
  /** Rows not in the archive before. */
  added: number;
  failedRequests: number;
}

/** Null when no fixture has finished yet (nothing to record). Throws if FPL can't be read, or too many player requests fail. */
export async function fetchLiveLedger(bootstrap: unknown, archiveRoot: string, userAgent: string): Promise<LiveLedgerResult | null> {
  const season = seasonNameFromBootstrap(bootstrap);
  if (!season) throw new Error("Couldn't determine the live season's name from bootstrap-static");
  const fixtures = fixturesFromOfficial(await getJson(`${FPL_API}/fixtures/`, userAgent));
  if (!fixtures.some((f) => f.finished)) return null;

  const elementIds = ((bootstrap as { elements?: { id: number }[] }).elements ?? []).map((e) => e.id);
  const historyByElement = new Map<number, unknown[]>();
  const failed: number[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < elementIds.length) {
        const id = elementIds[next++];
        try {
          const summary = (await getJson(`${FPL_API}/element-summary/${id}/`, userAgent)) as { history?: unknown[] };
          historyByElement.set(id, summary.history ?? []);
        } catch {
          failed.push(id);
        }
      }
    }),
  );
  if (failed.length > elementIds.length * MAX_FAILURE_SHARE) {
    throw new Error(`${failed.length}/${elementIds.length} element-summary requests failed — not using a partial record`);
  }

  const fresh = ledgerRowsFromOfficial(bootstrap, fixtures, historyByElement);
  const existing = readSeasonLedger(archiveRoot, season);
  const { rows, added } = mergeArchivedRows(existing?.rows ?? [], fresh);
  return { ledger: { season, teams: teamsFromBootstrap(bootstrap), fixtures, rows }, added, failedRequests: failed.length };
}
