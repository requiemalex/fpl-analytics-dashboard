/**
 * `npm run release-notes -- vX.Y.Z`: before tagging a release, rewrites
 * docs/RELEASES.md with every release so far plus vX.Y.Z (the commits since
 * the last release), to be committed as "Release notes: vX.Y.Z" and tagged
 * (CLAUDE.md "Releasing"). That commit isn't itself listed as a change.
 * A release the club-history archive made by itself is filled in the next
 * time this runs.
 *
 * `npm run release-notes`: rewrites it for the releases already tagged.
 * `npm run release-notes -- --list vX.Y.Z`: prints just that release's
 * changes (the release workflow puts them on its GitHub Release page).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASES_FILE, allReleases, changeList, releaseTags, releasesMarkdown } from "./notes.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const versionKey = (v: string) => v.slice(1).split(".").map(Number);
function isNewer(a: string, b: string): boolean {
  const [x, y] = [versionKey(a), versionKey(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

if (args[0] === "--list") {
  const r = allReleases(undefined, args[1])[0] ?? fail(`No release ${args[1]}.`);
  console.log(changeList(r).join("\n"));
} else {
  const upcoming = args[0];
  if (upcoming !== undefined) {
    if (!/^v\d+\.\d+\.\d+$/.test(upcoming)) fail(`Give the new version as vX.Y.Z, not "${upcoming}".`);
    const last = releaseTags().at(-1)!.tag;
    if (!isNewer(upcoming, last)) fail(`${upcoming} isn't newer than the last release, ${last}.`);
  }
  const releases = allReleases(upcoming);
  if (upcoming && releases[0].changes.length === 0 && !releases[0].seasonsUpdated) fail(`Nothing to release since ${releaseTags().at(-1)!.tag}.`);
  writeFileSync(join(root, RELEASES_FILE), releasesMarkdown(releases));
  console.log(`Wrote ${RELEASES_FILE}: ${releases.length} releases${upcoming ? `, ${upcoming} with ${releases[0].changes.length} changes` : ""}.`);
}
