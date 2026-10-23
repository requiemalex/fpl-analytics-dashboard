/**
 * `npm run session-start`: run by the Claude Code SessionStart hook (the
 * parent folder's `.claude/settings.local.json`). It prints the same report
 * as `npm run unreleased`, uncommitted edits first, as hook JSON:
 *
 *  - `systemMessage` is shown to the owner when the session opens (plain
 *    hook output only reaches Claude, never the screen);
 *  - `additionalContext` gives Claude the same text.
 */
import { uncommittedLines, unreleasedLines } from "./changes.js";

const uncommitted = uncommittedLines();
const lines = [
  ...(uncommitted.length > 0 ? uncommitted : ["Nothing waiting to be committed."]),
  "",
  ...unreleasedLines(),
];
const report = lines.join("\n");

console.log(
  JSON.stringify({
    systemMessage: report,
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: report },
  }),
);
