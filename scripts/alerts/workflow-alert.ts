/**
 * The last step of a workflow: alert the owner if it failed, or close its
 * alert if it worked again.
 *
 *   npx tsx scripts/alerts/workflow-alert.ts --key release --workflow release.yml \
 *     --outcome failure --policy immediate --title "Action needed: app release failed" \
 *     --what "…" --impact "…"
 *
 * --policy immediate   alert on the first failure (something that won't fix
 *                      itself, like a failed release)
 * --policy repeat      alert only on the second failure in a row (a blip —
 *                      the next scheduled run usually fixes it)
 *
 * How alerts work: scripts/alerts/github.ts.
 */
import { arg, currentRunUrl, previousConclusion, raiseAlert, resolveAlert } from "./github.js";

async function main() {
  const key = arg("key");
  const workflow = arg("workflow");
  const outcome = arg("outcome");
  if (!key || !workflow || !outcome) throw new Error("--key, --workflow and --outcome are required");

  if (outcome === "success") {
    await resolveAlert(key, "The next run worked.");
    return;
  }
  const policy = arg("policy") ?? "repeat";
  if (policy === "repeat") {
    const previous = await previousConclusion(workflow);
    if (previous !== "failure") {
      console.log(`First failure in a row (the run before ended: ${previous ?? "no earlier run"}) — the next run retries before anyone is alerted.`);
      return;
    }
  }
  const title = arg("title") ?? `Action needed: ${workflow} failed`;
  const text = [
    `The **${workflow}** workflow needs you.`,
    "",
    "**What happened**",
    `- ${arg("what") ?? "It failed."}${policy === "repeat" ? " This is the second run in a row to fail." : ""}`,
    "",
    "**Is the app affected?**",
    `- ${arg("impact") ?? "See the run for details."}`,
    "",
    "**What to do**",
    `- Open Claude Code in this project and say: *Look at the open "${title}" GitHub issue and fix it.*`,
    "",
    `[The failed run](${currentRunUrl()})`,
  ].join("\n");
  await raiseAlert(key, title, text);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
