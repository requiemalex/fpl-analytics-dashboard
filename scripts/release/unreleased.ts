/**
 * `npm run unreleased`: every change made since the last release, newest
 * first, with when it was committed — what the next release would ship.
 *
 * Read straight from git, never from anyone's memory of a past session:
 * a change is on this list once it's committed, for as long as it takes
 * to release it (CLAUDE.md "Releasing"). It also warns about the two ways
 * a change could still go missing: edits not yet committed, and commits
 * not yet pushed to GitHub (the only copy off this computer).
 *
 * The bots' own commits (the daily Understat sync, the club-history
 * archive) are counted, not listed: the app reads Understat data from
 * GitHub directly, and the archive releases itself when it needs to.
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function git(args: string): string {
  // Only trailing whitespace: `status --porcelain` lines start with a meaningful space.
  return execSync(`git ${args}`, { cwd: root, encoding: "utf8" }).trimEnd();
}

function when(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

/** `npm run unreleased -- v1.99.0`: everything since that release instead of the last one. */
const lastTag = process.argv[2] ?? git('describe --tags --abbrev=0 --match "v*"');
const releasedAt = git(`for-each-ref refs/tags/${lastTag} --format=%(creatordate:iso-strict)`);

const SEP = "\u001f";
const commits = git(`log ${lastTag}..HEAD --format=%cI${SEP}%ae${SEP}%s`)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [date, email, subject] = line.split(SEP);
    return { date, subject, bot: email.includes("[bot]") };
  });
const changes = commits.filter((c) => !c.bot);
const botCount = commits.length - changes.length;

const since = `${process.argv[2] ? "" : "the last release, "}${lastTag} (released ${when(releasedAt)})`;
const lines: string[] = [];
if (changes.length === 0) {
  lines.push(`Nothing changed since ${since}.`);
} else {
  lines.push(`${changes.length} change${changes.length === 1 ? "" : "s"} since ${since}, newest first:`, "");
  for (const c of changes) lines.push(`  ${when(c.date)}  ${c.subject}`);
}
if (botCount > 0) {
  lines.push("", `Also ${botCount} automatic data commit${botCount === 1 ? ", which needs" : "s, which need"} no release (Understat sync, club-history archive).`);
}

let unpushed = 0;
try {
  unpushed = Number(git("rev-list --count origin/master..HEAD"));
} catch {
  // no origin/master (a fresh clone mid-setup): nothing to compare against
}
if (unpushed > 0) {
  lines.push("", `Not yet on GitHub: ${unpushed} commit${unpushed === 1 ? "" : "s"}. Push master to back ${unpushed === 1 ? "it" : "them"} up.`);
}

const uncommitted = git("status --porcelain").split("\n").filter(Boolean);
if (uncommitted.length > 0) {
  lines.push("", `Edited but not committed (not on the list above until committed):`);
  for (const entry of uncommitted) lines.push(`  ${entry.slice(3)}`);
}

console.log(lines.join("\n"));
