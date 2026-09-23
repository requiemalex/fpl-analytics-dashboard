/**
 * Archives the LIVE season's club history from the official FPL API into
 * data/club-history/<season>/ — run weekly by
 * .github/workflows/club-history-archive.yml, and safe to run by hand:
 *
 *   npx tsx scripts/club-history/archive-current.ts
 *
 * Why this exists: the official API only ever serves the current season's
 * match-level data, and resets it every summer. Archiving it as the season
 * goes means every season from 2026/27 on has an exact, official club
 * record — no community backfill needed.
 *
 * <append_only>: rows are merged into what's already archived, keyed by
 * (fixture, player code) — a fresh fetch overwrites a row (so late
 * corrections like bonus points flow in), but a row is never deleted. A
 * player who leaves the FPL game mid-season keeps every appearance already
 * archived, still counted for the club he made it for.
 */
import { join } from "node:path";
import { checkLedgerAgainstScores } from "../../server/src/clubHistory/aggregate.js";
import { readSeasonLedger, writeSeasonLedger } from "../../server/src/clubHistory/ledgerFiles.js";
import { fixturesFromOfficial, ledgerRowsFromOfficial, seasonNameFromBootstrap, teamsFromBootstrap } from "../../server/src/clubHistory/official.js";
import type { LedgerRow } from "../../server/src/clubHistory/types.js";

const API = "https://fantasy.premierleague.com/api";
const ROOT = join(process.cwd(), "data", "club-history");
const CONCURRENCY = 8;
/** More than this share of element-summary requests failing means the API is having a bad day — write nothing rather than a patchy week. */
const MAX_FAILURE_SHARE = 0.05;

async function getJson(url: string, attempts = 4): Promise<unknown> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "fpl-analytics-dashboard club-history archive" } });
      if (res.ok) return await res.json();
      lastError = new Error(`${url}: HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
  throw lastError;
}

async function main() {
  const bootstrap = await getJson(`${API}/bootstrap-static/`);
  const season = seasonNameFromBootstrap(bootstrap);
  if (!season) throw new Error("Couldn't determine the live season's name from bootstrap-static");
  const fixtures = fixturesFromOfficial(await getJson(`${API}/fixtures/`));
  if (!fixtures.some((f) => f.finished)) {
    console.log(`${season}: no finished fixtures yet — nothing to archive.`);
    return;
  }

  const elementIds = ((bootstrap as { elements: { id: number }[] }).elements ?? []).map((e) => e.id);
  const historyByElement = new Map<number, unknown[]>();
  const failed: number[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < elementIds.length) {
        const id = elementIds[next++];
        try {
          const summary = (await getJson(`${API}/element-summary/${id}/`)) as { history?: unknown[] };
          historyByElement.set(id, summary.history ?? []);
        } catch {
          failed.push(id);
        }
      }
    }),
  );
  if (failed.length > elementIds.length * MAX_FAILURE_SHARE) {
    throw new Error(`${failed.length}/${elementIds.length} element-summary requests failed — not archiving a partial week`);
  }

  const fresh = ledgerRowsFromOfficial(bootstrap, fixtures, historyByElement);
  const existing = readSeasonLedger(ROOT, season);
  const merged = new Map<string, LedgerRow>();
  for (const r of existing?.rows ?? []) merged.set(`${r.fixture}:${r.code}`, r);
  let added = 0;
  for (const r of fresh) {
    const key = `${r.fixture}:${r.code}`;
    if (!merged.has(key)) added += 1;
    merged.set(key, r);
  }
  const rows = [...merged.values()];

  writeSeasonLedger(ROOT, { season, teams: teamsFromBootstrap(bootstrap), fixtures, rows });

  const problems = checkLedgerAgainstScores(fixtures, rows);
  console.log(
    `${season}: ${fixtures.filter((f) => f.finished).length}/${fixtures.length} fixtures finished · ${rows.length} rows (${added} new) · ` +
      `${failed.length} element-summary failures · score mismatches ${problems.length}`,
  );
  // Not fatal — the week's data is still archived — but surfaced in the
  // workflow log: a mismatch means a goal-scorer is missing from the API's
  // player list (e.g. removed from the game before archiving began).
  for (const p of problems.slice(0, 20)) console.warn(`  ${p}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
