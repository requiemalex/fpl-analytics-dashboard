/**
 * The release log: every release, newest first, with the changes it
 * shipped — each version's commits since the one before, read from git
 * like the change list (changes.ts). Shared by `npm run release-notes`
 * (writes docs/RELEASES.md; the release workflow also puts one version's
 * list on its GitHub Release page) and `npm run released` (the "now
 * released" message).
 *
 * Automatic data commits aren't listed, except when the club-history
 * archive updated the seasons bundled with the app: that's a change people
 * see (a completed season appearing), and it's released for that reason.
 */
import { changesIn, git } from "./changes.js";

export const RELEASES_FILE = "docs/RELEASES.md";

const TAG = /^v\d+\.\d+\.\d+$/;

export interface Release {
  version: string;
  /** When it was tagged; now, for one being prepared. */
  date: string;
  /** Newest first. */
  changes: { date: string; subject: string }[];
  /** The club-history archive updated the bundled seasons. */
  seasonsUpdated: boolean;
}

/** Every release tag, oldest first, with when it was made. */
export function releaseTags(): { tag: string; date: string }[] {
  return git('for-each-ref "refs/tags/v*" --sort=v:refname --format=%(refname:short)%09%(creatordate:iso-strict)')
    .split("\n")
    .map((line) => {
      const [tag, date] = line.split("\t");
      return { tag, date };
    })
    .filter((t) => TAG.test(t.tag));
}

/** The bot commits that changed the bundled club history (server/src/clubHistory/), by hash. */
function seasonUpdateCommits(): Set<string> {
  return new Set(git('log --author="github-actions\\[bot\\]" --format=%H -- server/src/clubHistory/').split("\n").filter(Boolean));
}

function release(version: string, range: string, date: string, seasonCommits: Set<string>): Release {
  const { changes, botCommits } = changesIn(range);
  return { version, date, changes, seasonsUpdated: botCommits.some((h) => seasonCommits.has(h)) };
}

/**
 * Every release, newest first; with `upcoming`, also that version, made of
 * the commits since the last tag. With `only`, just that release.
 */
export function allReleases(upcoming?: string, only?: string): Release[] {
  const tags = releaseTags();
  const seasonCommits = seasonUpdateCommits();
  const releases: Release[] = [];
  tags.forEach(({ tag, date }, i) => {
    if (!only || only === tag) releases.push(release(tag, i === 0 ? tag : `${tags[i - 1].tag}..${tag}`, date, seasonCommits));
  });
  if (upcoming) releases.push(release(upcoming, `${tags[tags.length - 1].tag}..HEAD`, new Date().toISOString(), seasonCommits));
  return releases.reverse();
}

/** One release's own lines: its changes, newest first, as a Markdown list. */
export function changeList(r: Release): string[] {
  const lines = r.changes.map((c) => `- ${c.subject}`);
  if (r.seasonsUpdated) lines.push("- Club history: completed seasons updated from the archive (automatic)");
  if (lines.length === 0) lines.push("- No app changes (a rebuild of the previous version)");
  return lines;
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** The whole of docs/RELEASES.md. */
export function releasesMarkdown(releases: Release[]): string {
  const lines = [
    "# Releases",
    "",
    "Every release of Scoutline, newest first, with the changes it shipped:",
    "each version's commits since the one before. Written from git by",
    "`npm run release-notes` (`scripts/release/notes.ts`) as each release is",
    "made, so don't edit it by hand: the next release rewrites it.",
  ];
  for (const r of releases) lines.push("", `## ${r.version} · ${day(r.date)}`, "", ...changeList(r));
  return lines.join("\n") + "\n";
}
