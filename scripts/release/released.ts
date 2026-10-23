/**
 * `npm run released`: the latest release and every change in it — what
 * the owner is told once a release is out (CLAUDE.md "Releasing").
 * `npm run released -- vX.Y.Z`: that release instead.
 *
 * Says "now released" only once GitHub shows the release as public (the
 * release workflow publishes it after the build); before then, or if GitHub
 * can't be asked, it says so instead of claiming it's out.
 */
import { execSync } from "node:child_process";
import { plural, when } from "./changes.js";
import { RELEASES_FILE, allReleases, changeList, releaseTags } from "./notes.js";

const wanted = process.argv[2] ?? releaseTags().at(-1)?.tag;
const r = wanted ? allReleases(undefined, wanted)[0] : undefined;
if (!r) {
  console.error(`No release ${wanted}.`);
  process.exit(1);
}

let state: string;
try {
  const draft = execSync(`gh release view ${r.version} --json isDraft --jq .isDraft`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  state = draft === "false" ? "now released" : "tagged, but not public yet (its release build hasn't finished, or failed)";
} catch {
  state = "tagged; not on GitHub's Releases yet, or GitHub couldn't be asked";
}

const count = r.changes.length > 0 ? `${plural(r.changes.length, "change")} in this version, newest first` : "what's in this version";
console.log(
  [`${r.version} ${state} (tagged ${when(r.date)}). ${count}:`, "", ...changeList(r).map((l) => `  ${l}`), "", `Every release's changes: ${RELEASES_FILE}`].join("\n"),
);
