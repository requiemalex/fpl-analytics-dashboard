/**
 * Catches the failure no workflow can report itself: a job that silently
 * stops running (GitHub switched its schedule off, or it never fired).
 *
 *   npx tsx scripts/alerts/watchdog.ts --key watchdog \
 *     --watch understat-sync.yml:2 --watch club-history-archive.yml:5 --release release.yml
 *
 * --watch <file>:<days>  the workflow must be switched on and have
 *                        succeeded within <days> days
 * --release <file>       its latest run must not have failed
 *
 * Run weekly by .github/workflows/watchdog.yml; the club-history archive
 * runs it twice a week on the watchdog itself, so nothing goes unwatched.
 * How alerts work: scripts/alerts/github.ts.
 */
import { args, arg, currentRunUrl, raiseAlert, resolveAlert, workflowRuns, workflowState } from "./github.js";

const DAY_MS = 86_400_000;

async function main() {
  const key = arg("key") ?? "watchdog";
  const problems: string[] = [];

  for (const spec of args("watch")) {
    const [file, days] = spec.split(":");
    const maxDays = Number(days);
    const state = await workflowState(file);
    if (state !== "active") problems.push(`**${file}** is switched off on GitHub (${state}), so it isn't running at all.`);
    const [lastSuccess] = await workflowRuns(file, 1, "&status=success");
    if (!lastSuccess) {
      problems.push(`**${file}** has never run successfully.`);
    } else {
      const age = (Date.now() - Date.parse(lastSuccess.created_at)) / DAY_MS;
      if (age > maxDays) problems.push(`**${file}** last ran successfully ${Math.floor(age)} days ago (it should every ${maxDays} days or sooner).`);
    }
  }

  for (const file of args("release")) {
    const [latest] = (await workflowRuns(file, 5)).filter((r) => r.status === "completed");
    if (latest && latest.conclusion === "failure") problems.push(`The latest app release (**${file}**) failed, so installed apps aren't getting the newest version.`);
  }

  if (problems.length === 0) {
    console.log("All watched workflows are on and ran recently.");
    await resolveAlert(key, "Every watched workflow is switched on and has run recently.");
    return;
  }
  console.log(problems.join("\n"));
  await raiseAlert(
    key,
    "Action needed: a scheduled job has stopped",
    [
      "The weekly check on this project's automatic jobs found a problem.",
      "",
      "**What happened**",
      ...problems.map((p) => `- ${p}`),
      "",
      "**Is the app affected?**",
      "- Installed apps keep working; the data that job keeps up to date (Understat figures, club history, or new app versions) stops updating until it's fixed.",
      "",
      "**What to do**",
      '- Open Claude Code in this project and say: *Look at the open "a scheduled job has stopped" GitHub issue and fix it.*',
      "",
      `[This check's run](${currentRunUrl()})`,
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
