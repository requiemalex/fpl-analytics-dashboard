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
 * <append_only>: rows are merged into what's already archived and never
 * deleted (mergeArchivedRows, server/src/clubHistory/archive.ts; the fetch
 * and merge are in liveLedger.ts, shared with the Understat sync).
 */
import { join } from "node:path";
import { checkLedgerAgainstScores } from "../../server/src/clubHistory/aggregate.js";
import { writeSeasonLedger } from "../../server/src/clubHistory/ledgerFiles.js";
import { seasonNameFromBootstrap } from "../../server/src/clubHistory/official.js";
import { fetchLiveLedger, FPL_API, getJson } from "./liveLedger.js";

const ROOT = join(process.cwd(), "data", "club-history");
const USER_AGENT = "Scoutline club-history archive (+https://github.com/requiemalex/fpl-analytics-dashboard)";

async function main() {
  const bootstrap = await getJson(`${FPL_API}/bootstrap-static/`, USER_AGENT);
  const result = await fetchLiveLedger(bootstrap, ROOT, USER_AGENT);
  if (!result) {
    console.log(`${seasonNameFromBootstrap(bootstrap)}: no finished fixtures yet — nothing to archive.`);
    return;
  }
  const { ledger, added, failedRequests } = result;
  const { season, fixtures, rows } = ledger;

  writeSeasonLedger(ROOT, ledger);

  const problems = checkLedgerAgainstScores(fixtures, rows);
  console.log(
    `${season}: ${fixtures.filter((f) => f.finished).length}/${fixtures.length} fixtures finished · ${rows.length} rows (${added} new) · ` +
      `${failedRequests} element-summary failures · score mismatches ${problems.length}`,
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
