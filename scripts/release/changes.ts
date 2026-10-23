/**
 * The two halves of "what's waiting", read straight from git and shared by
 * `npm run unreleased` (printed in the terminal) and `npm run session-start`
 * (shown when a Claude Code session opens), so both always say the same thing:
 *
 *  - uncommitted: edits made since the last commit, file by file, with how
 *    many lines each adds and removes;
 *  - unreleased: every commit since the last release, newest first, plus a
 *    warning when commits haven't been pushed to GitHub yet.
 *
 * The bots' own commits (the daily Understat sync, the club-history
 * archive) are counted, not listed: the app reads Understat data from
 * GitHub directly, and the archive releases itself when it needs to.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function git(args: string): string {
  // Only trailing whitespace: `status --porcelain` lines start with a meaningful space.
  // stderr piped, not inherited: git's line-ending warnings would otherwise land in the report.
  return execSync(`git ${args}`, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
}

function when(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Lines added/removed per path, staged and unstaged together (both are "since the last commit"). */
function lineCounts(): Map<string, string> {
  const counts = new Map<string, string>();
  // -z: a rename is "added\tremoved\t\0old\0new\0"; anything else is "added\tremoved\tpath\0".
  const fields = git("diff HEAD --numstat -z").split("\0");
  for (let i = 0; i < fields.length; i++) {
    const [added, removed, path] = fields[i].split("\t");
    if (added === undefined || removed === undefined) continue;
    const target = path === "" ? fields[(i += 2)] : path;
    counts.set(target, added === "-" ? "binary" : `+${added} −${removed}`);
  }
  return counts;
}

/** A new file isn't in `git diff` until it's staged, so count its lines directly. */
function newFileCount(path: string): string {
  try {
    const text = readFileSync(join(root, path), "utf8");
    if (text.includes("\0")) return "binary";
    const lines = text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    return `+${lines}`;
  } catch {
    return "";
  }
}

/** Edits since the last commit, or nothing when the working tree is clean. */
export function uncommittedLines(): string[] {
  // -z: "XY path\0", and a rename is "XY new\0old\0".
  const fields = git("status --porcelain -z --untracked-files=all").split("\0").filter(Boolean);
  if (fields.length === 0) return [];

  const counts = lineCounts();
  const files: { label: string; path: string; count: string }[] = [];
  for (let i = 0; i < fields.length; i++) {
    const code = fields[i].slice(0, 2);
    const path = fields[i].slice(3);
    let label = "edited";
    let shown = path;
    if (code === "??" || code.includes("A")) label = "new";
    else if (code.includes("R")) {
      label = "renamed";
      shown = `${path} (was ${fields[++i]})`;
    } else if (code.includes("D")) label = "deleted";
    const count = counts.get(path) ?? (label === "new" ? newFileCount(path) : "");
    files.push({ label, path: shown, count });
  }

  const [hash, date, subject] = git("log -1 --format=%h%x1f%cI%x1f%s").split("\u001f");
  const width = Math.max(...files.map((f) => f.label.length));
  const pathWidth = Math.max(...files.map((f) => f.path.length));
  const lines = [
    `Waiting to be committed: ${plural(files.length, "file")} changed since the last commit`,
    `(${hash}, ${when(date)}: ${subject}):`,
    "",
  ];
  for (const f of files) lines.push(`  ${f.label.padEnd(width)}  ${f.path.padEnd(pathWidth)}  ${f.count}`.trimEnd());
  return lines;
}

/**
 * Commits since a release (the last one, or `sinceTag`), newest first, and a
 * warning when any aren't on GitHub yet.
 */
export function unreleasedLines(sinceTag?: string): string[] {
  const lastTag = sinceTag ?? git('describe --tags --abbrev=0 --match "v*"');
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

  const since = `${sinceTag ? "" : "the last release, "}${lastTag} (released ${when(releasedAt)})`;
  const lines: string[] = [];
  if (changes.length === 0) {
    lines.push(`Nothing changed since ${since}.`);
  } else {
    lines.push(`${plural(changes.length, "change")} since ${since}, newest first:`, "");
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
    lines.push("", `Not yet on GitHub: ${plural(unpushed, "commit")}. Push master to back ${unpushed === 1 ? "it" : "them"} up.`);
  }
  return lines;
}
