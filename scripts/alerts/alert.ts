/**
 * Raises or resolves an alert by hand-written text — for a workflow with its
 * own report (the Understat sync) and for the test alert:
 *
 *   npx tsx scripts/alerts/alert.ts --key understat-sync --title "…" --body-file alert.md
 *   npx tsx scripts/alerts/alert.ts --key understat-sync --resolve "Today's sync ran cleanly."
 *
 * How alerts work: scripts/alerts/github.ts.
 */
import { readFileSync } from "node:fs";
import { arg, raiseAlert, resolveAlert } from "./github.js";

async function main() {
  const key = arg("key");
  if (!key) throw new Error("--key is required");
  const resolveNote = arg("resolve");
  if (resolveNote !== undefined) return resolveAlert(key, resolveNote);
  const bodyFile = arg("body-file");
  await raiseAlert(key, arg("title") ?? `Action needed: ${key}`, bodyFile ? readFileSync(bodyFile, "utf8") : (arg("body") ?? ""));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
