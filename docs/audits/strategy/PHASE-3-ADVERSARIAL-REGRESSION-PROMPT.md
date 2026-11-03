# Phase 3 — Adversarial regression

Two earlier sessions audited Scoutline and fixed what they found. You are
the independent reviewer: assume the fixes are wrong until you've tried to
break them. Read `RULES.md` in this folder first. **Report only; no
production code changes.**

Use the run folder the owner names; if none, the most recent with
`1-audit.md` and `2-remediation.md` but no `3-regression.md` (say which).
Read CLAUDE.md once, the two reports' indexes and outcome tables, and the
Phase 2 diff file by file (`git diff <phase 1>..<phase 2> --stat`, then
each changed file's diff) — the code, not the reports' descriptions of it.

Being asked to run this prompt is the owner asking you to run the app (via
the probes or one-off scripts per `TOOLKIT.md`) and call the live FPL API
through the app's proxy.

## What to do

1. **Machines (lead).** `npm run check`; `npm run probe` in the background
   with the Phase 1 seed **and** again with a new `--seed`, so the monkey
   takes different paths. Every line is a candidate R-item once
   reproduced.
2. **Re-check every fix (lead or one helper).** Rerun each fixed finding's
   repro from `1-audit.md`; where a user would see it, in the app.
3. **Attack the changes (helpers, one per area Phase 2 touched, at most
   three).** Brief each with the diff of its area and these attacks:
   - boundaries: null and 0, 0-minute and one-cameo players, missing
     seasons, newly promoted clubs, ranking ties, each position;
   - gameweeks: in progress, finished, the last of the season,
     pre-season (mock `bootstrap-static`'s `events` with `page.route`);
   - refresh, stale cache, API failure or partial data;
   - race conditions and duplicate requests; long names, maximum counts,
     typing key by key;
   - collateral: every other page that uses code Phase 2 changed;
   - upgrades: saved data written by the pre-fix version and older ones
     loads without loss or change of meaning; migrations run only for
     their versions.
4. **Docs.** README sections and Help for the changed behaviour say what
   the app now does.

Every problem needs a repro or concrete evidence: steps, actual vs
expected.

## Output

`3-regression.md` in the run folder, written once:

1. **Plain-English summary first:** do the fixes hold; anything the owner
   should know before releasing.
2. Each Phase 2 finding: confirmed fixed / not fixed / regressed, with
   evidence.
3. New findings R1, R2… (severity per RULES.md): defects, test failures,
   gaps in test coverage.
4. Theoretical concerns, separate.
5. What was verified correct (including probe coverage).
6. `npm run check` and probe results, and a recommendation: release now,
   or fix the R-items first.

Update the run's row in `docs/audits/README.md`; commit the report and row
("Audit <date> <scope>: phase 3 report"). R-items are fixed in a later
Phase 2 pass, or when the owner asks.
