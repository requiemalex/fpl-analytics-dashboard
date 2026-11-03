# Help refresh

A focused audit: is what Help and README say still true, and does Help
search find the right guide in a user's own words? Report only (adding
tests is allowed). Read `docs/audits/strategy/RULES.md` first. Being asked
to run this prompt is the owner asking you to run the app (probes and
one-off scripts per `TOOLKIT.md`).

Argument: a page or feature; default the whole app, weighted to what
changed since the last help refresh (`git log --oneline <that run's
commit>.. -- client/src`, from `docs/audits/README.md` "Past runs").

## You are the lead — target under 40 tool calls

1. **Baseline.** Read CLAUDE.md once ("No inline explanatory captions",
   "Icons over text buttons", "Keeping docs current"). Record commit and
   version; `npm run check -- help/ --no-build`.
2. **Missions (helpers, in parallel)**, each briefed with the rules
   quoted, the run folder, and "follow `docs/audits/strategy/RULES.md`;
   stop at 40 tool calls":

| Mission | Goal |
|---|---|
| **A. Guides against the app** | Each guide in `client/src/help/` (`guides.tsx`, `moreGuides.tsx`, `statistics.tsx`, `DataHealth.tsx`) in scope: is the one-line answer true, does each point match the built app (controls exist and behave as said, stated limits are the real limits), do its visuals use the app's current icons? Check in the built app as text. Also the guide style rule: one-line answer, a visual, a few short points. |
| **B. Search** | List what a user can do on each page (from the app, not the guides) and find what has no guide. For each guide write 3 questions a user would ask in their own words (not the guide's words) and run them through `help/search.ts` with a small script: which miss or rank the wrong guide first? Each guide has a question in `help/search.test.ts`. |
| **C. README against the code** | README sections for the scope (grep the headings; never read it whole): each claim about behaviour, formula, limit or file name checked against the code. Formulas against `metrics/dictionary.ts`. List untrue, stale or missing text, and anything removed but not in `docs/HISTORY.md`. Also explanations shown under controls in the app (inline captions), which belong in Help. |

3. **Verify and write.** New run folder
   `docs/audits/results/<YYYY-MM-DD>-help-refresh/`; `1-audit.md` in the
   Phase 1 output format (most findings will be Low or Medium; a guide
   that tells users something untrue about a figure is High). Add a
   section "Search misses" listing each question that failed and the guide
   it should find, so `/audit 2` can add the keywords and tests. Add its
   row to `docs/audits/README.md` "Past runs"; commit: "Help refresh
   <date>: report".
