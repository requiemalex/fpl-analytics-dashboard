/**
 * Syncs Understat data into data/understat/ — run daily by
 * .github/workflows/understat-sync.yml, and safe to run by hand:
 *
 *   npx tsx scripts/understat/sync.ts [--max-new-seasons 2] [--report report.json] [--cache <dir>]
 *
 * --max-new-seasons  completed seasons not yet stored to download this run
 *                    (about 380 requests each); the scheduled job does 2, so
 *                    a first backfill spreads over a few days.
 * --report           also write the run report as JSON (the workflow reads it
 *                    to open or close its alert issue).
 * --alert-body       also write the plain-English alert text (Markdown) the
 *                    workflow posts when the run needs the owner.
 * --cache            local runs only: keep Understat's raw replies here and
 *                    reuse them rather than asking again.
 *
 * Exits 1 when the run failed (nothing was written); see
 * server/src/understat/pipeline/sync.ts for what each step checks. Inside
 * GitHub Actions it also writes the outcome to the run's page (the job
 * summary). When a site didn't answer, it then checks whether Understat and
 * FPL answer at all, which tells "Understat is down" apart from "GitHub's
 * network had a problem".
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SeasonLedger } from "../../server/src/clubHistory/ledgerFiles.js";
import { describeFetchError } from "../../server/src/fetchError.js";
import { readStatus } from "../../server/src/understat/pipeline/files.js";
import { runSync, type SyncReport } from "../../server/src/understat/pipeline/sync.js";
import { createUnderstatClient } from "../../server/src/understat/pipeline/understatApi.js";
import { fetchLiveLedger, FPL_API, getJson } from "../club-history/liveLedger.js";

const USER_AGENT = "Scoutline understat sync (+https://github.com/requiemalex/fpl-analytics-dashboard)";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const WHAT_HAPPENED: Record<string, string> = {
  blocked: "Understat refused our requests — it may have started blocking automated access.",
  unreachable:
    "A site the sync reads (Understat or FPL — the technical details say which) didn't answer, or its server had an error. That's usually the site being down for a while, and a later run catches up by itself.",
  format: "Understat changed the format of its data, so the sync no longer understands it.",
  checks: "The downloaded data failed an accuracy check (scores, goals or player links didn't add up), so none of it was saved.",
  error: "The sync couldn't run.",
};

/**
 * Run just after a site didn't answer: does each one answer at all now?
 * Understat failing while FPL answers means Understat is down; both failing
 * points at GitHub's network.
 */
async function reachabilityCheck(): Promise<string> {
  const timeoutMs = 20_000;
  const sites: [string, string][] = [
    ["understat.com", "https://understat.com/"],
    ["FPL", `${FPL_API}/bootstrap-static/`],
  ];
  const lines = await Promise.all(
    sites.map(async ([name, url]) => {
      const started = Date.now();
      try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
        await res.body?.cancel();
        return `${name}: answered HTTP ${res.status} in ${((Date.now() - started) / 1000).toFixed(1)}s`;
      } catch (err) {
        return `${name}: ${describeFetchError(err, { timeoutMs })}`;
      }
    }),
  );
  return `Checked again just after the failure:\n${lines.map((l) => `  - ${l}`).join("\n")}`;
}

/** The run's outcome on its GitHub Actions page, so nobody has to open the log to see what happened. */
function jobSummaryMarkdown(report: SyncReport): string {
  const lines = [report.ok ? "## Understat sync: OK" : `## Understat sync: FAILED (${report.failure?.kind}) — nothing was written`, ""];
  if (!report.ok) lines.push(WHAT_HAPPENED[report.failure?.kind ?? "error"], "", "```", report.failure?.message ?? "", "```", "");
  const list = (title: string, items: string[]) => {
    if (items.length > 0) lines.push(`**${title}**`, "", ...items.map((l) => `- ${l}`), "");
  };
  list("Summary", report.summary);
  list("Needs attention", report.attention);
  list("Warnings", report.warnings);
  return lines.join("\n");
}

/** The issue text the owner reads: what happened, whether app users are affected, what to do. */
function alertMarkdown(report: SyncReport, latestMatchDate: string | null): string {
  const lines: string[] = ["The daily Understat sync needs you.", "", "**What happened**"];
  if (!report.ok) lines.push(`- ${WHAT_HAPPENED[report.failure?.kind ?? "error"]}`);
  for (const a of report.attention) lines.push(`- ${a}`);
  lines.push("", "**Is the app affected?**");
  lines.push(
    report.ok
      ? '- Only what is listed above: those players or matches show "—" in Understat columns. Everything else is up to date.'
      : `- Installed apps keep showing the last good Understat data (matches up to ${latestMatchDate ?? "the last good run"}); once it's two days behind, Understat column headers get a small amber dot. Everything from FPL is unaffected.`,
  );
  lines.push(
    "",
    "**What to do**",
    "- Open Claude Code in this project and say: *Look at the open \"Understat\" GitHub issue and fix it.*",
    "- If Understat can't be fixed, it can be switched off for every installed app by setting `\"enabled\": false` in `data/understat/control.json` (or ask Claude to). The FPL side of the app doesn't depend on it.",
  );
  const details = [report.failure?.message, ...report.warnings].filter(Boolean).join("\n");
  if (details) lines.push("", "<details><summary>Technical details</summary>", "", "```", details, "```", "</details>");
  return lines.join("\n");
}

async function main() {
  const reportPath = arg("report");
  let report: SyncReport;
  try {
    const bootstrap = await getJson(`${FPL_API}/bootstrap-static/`, USER_AGENT);
    const clubHistoryRoot = join(process.cwd(), "data", "club-history");
    // The live season is checked against FPL's record as of now, not the
    // twice-weekly archive. If that can't be fetched, runSync falls back to
    // the archive and says so in its warnings; why it failed is added here.
    let liveLedger: SeasonLedger | null = null;
    let liveLedgerError: string | null = null;
    try {
      liveLedger = (await fetchLiveLedger(bootstrap, clubHistoryRoot, USER_AGENT))?.ledger ?? null;
    } catch (err) {
      liveLedgerError = err instanceof Error ? err.message : String(err);
      console.warn(`Couldn't fetch FPL's live record: ${liveLedgerError}`);
    }
    report = await runSync({
      understatRoot: join(process.cwd(), "data", "understat"),
      clubHistoryRoot,
      bootstrap,
      liveLedger,
      client: createUnderstatClient({ cacheDir: arg("cache"), delayMs: arg("delay") ? Number(arg("delay")) : undefined }),
      today: new Date().toISOString().slice(0, 10),
      maxNewSeasons: Number(arg("max-new-seasons") ?? 2),
      log: (line) => console.log(line),
    });
    if (liveLedgerError) report.warnings.push(`Why FPL's live record couldn't be fetched: ${liveLedgerError}`);
  } catch (err) {
    report = { ok: false, failure: { kind: "unreachable" as const, message: `Couldn't read FPL: ${err instanceof Error ? err.message : String(err)}` }, attention: [], summary: [], warnings: [] };
  }
  if (report.failure?.kind === "unreachable") report.failure.message += `\n\n${await reachabilityCheck()}`;
  if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const alertPath = arg("alert-body");
  if (alertPath) writeFileSync(alertPath, alertMarkdown(report, readStatus(join(process.cwd(), "data", "understat"))?.latestMatchDate ?? null));
  console.log(report.ok ? "\nSync OK." : `\nSync FAILED (${report.failure?.kind}) — nothing was written:\n${report.failure?.message}`);
  for (const line of report.summary) console.log(`  ${line}`);
  if (report.attention.length > 0) console.log(`\nNeeds attention:\n${report.attention.map((l) => `  - ${l}`).join("\n")}`);
  if (report.warnings.length > 0) console.log(`\nWarnings:\n${report.warnings.map((l) => `  - ${l}`).join("\n")}`);
  const jobSummary = process.env.GITHUB_STEP_SUMMARY;
  if (jobSummary) appendFileSync(jobSummary, jobSummaryMarkdown(report));
  if (!report.ok) process.exit(1);
}

main();
