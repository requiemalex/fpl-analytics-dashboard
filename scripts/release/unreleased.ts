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
 * `npm run unreleased -- v1.99.0`: everything since that release instead of the last one.
 */
import { uncommittedLines, unreleasedLines } from "./changes.js";

const lines = unreleasedLines(process.argv[2]);
const uncommitted = uncommittedLines();
if (uncommitted.length > 0) {
  lines.push("", ...uncommitted, "", "(Not on the change list above until committed.)");
}
console.log(lines.join("\n"));
