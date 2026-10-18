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
 * server/src/understat/pipeline/sync.ts for what each step checks.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readStatus } from "../../server/src/understat/pipeline/files.js";
import { runSync, type SyncReport } from "../../server/src/understat/pipeline/sync.js";
import { createUnderstatClient } from "../../server/src/understat/pipeline/understatApi.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function getFplBootstrap(attempts = 4): Promise<unknown> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: { "User-Agent": "fpl-analytics-dashboard understat sync" } });
      if (res.ok) return await res.json();
      lastError = new Error(`FPL bootstrap-static: HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
  throw lastError;
}

const WHAT_HAPPENED: Record<string, string> = {
  blocked: "Understat refused our requests — it may have started blocking automated access.",
  format: "Understat changed the format of its data, so the sync no longer understands it.",
  checks: "The downloaded data failed an accuracy check (scores, goals or player links didn't add up), so none of it was saved.",
  error: "The sync couldn't run.",
};

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
    const bootstrap = await getFplBootstrap();
    report = await runSync({
      understatRoot: join(process.cwd(), "data", "understat"),
      clubHistoryRoot: join(process.cwd(), "data", "club-history"),
      bootstrap,
      client: createUnderstatClient({ cacheDir: arg("cache"), delayMs: arg("delay") ? Number(arg("delay")) : undefined }),
      today: new Date().toISOString().slice(0, 10),
      maxNewSeasons: Number(arg("max-new-seasons") ?? 2),
      log: (line) => console.log(line),
    });
  } catch (err) {
    report = { ok: false, failure: { kind: "error" as const, message: `Couldn't reach FPL: ${err instanceof Error ? err.message : String(err)}` }, attention: [], summary: [], warnings: [] };
  }
  if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const alertPath = arg("alert-body");
  if (alertPath) writeFileSync(alertPath, alertMarkdown(report, readStatus(join(process.cwd(), "data", "understat"))?.latestMatchDate ?? null));
  console.log(report.ok ? "\nSync OK." : `\nSync FAILED (${report.failure?.kind}) — nothing was written:\n${report.failure?.message}`);
  for (const line of report.summary) console.log(`  ${line}`);
  if (report.attention.length > 0) console.log(`\nNeeds attention:\n${report.attention.map((l) => `  - ${l}`).join("\n")}`);
  if (report.warnings.length > 0) console.log(`\nWarnings:\n${report.warnings.map((l) => `  - ${l}`).join("\n")}`);
  if (!report.ok) process.exit(1);
}

main();
