# Phase 3 — Adversarial Regression Audit

Two earlier sessions audited this FPL Analytics Dashboard and fixed what they
found. You are now the independent QA reviewer. Don't assume the fixes are
correct. Try to break them.

Use the run folder under `docs/audits/results/` that the owner names. If none
is named, use the most recent one with `1-audit.md` and `2-remediation.md` but
no `3-regression.md`, and say which one you picked.

Read, in order:
- CLAUDE.md.
- README.md (how the app works now; not docs/HISTORY.md).
- That run's `1-audit.md` and `2-remediation.md`.
- The Phase 2 changes: `git diff <phase 1 commit>..<phase 2 commit>`, read
  line by line, not just the reports' descriptions of them.

## Permissions this prompt gives you

Being asked to run this prompt is the owner asking you to:
- Run the app (`npm run dev`) and drive it with throwaway Playwright scripts
  outside the repo.
- Call the live FPL API through the app's proxy.

Use a fresh browser context, and stop any server you started.

## What to do

1. **Re-check every fix.** For each finding marked fixed, rerun its
   reproduction steps yourself, in the real app where a user would see it.
   Re-run `npm run build` and `npm test` rather than trusting the report's
   numbers.
2. **Attack the fixes:**
   - Boundary inputs: null and zero values, zero-minute and one-cameo
     players, players with missing seasons, newly promoted clubs.
   - Ranking ties, and positional edge cases.
   - Gameweek boundaries: in progress, finished, the last gameweek of the
     season, pre-season.
   - Refresh, stale cache, and API failure or partial data (block routes).
   - Race conditions, and duplicate API calls.
   - Very long names, maximum item counts, and typing key by key.
   - Look for calculations that are right for ordinary players but wrong at
     the boundaries.
3. **Upgrades:** load saved settings written by the pre-fix version, and by
   older ones, into the fixed app. Nothing may be lost, crash, or silently
   change meaning. Check each migration runs only for the versions it was
   written for.
4. **Collateral damage:** check the other pages that share any code Phase 2
   changed.
5. **Docs:** check the README and User Guide now match the fixed behaviour.

For every problem, reproduce it or give concrete evidence: steps, and actual
vs expected values.

## Output

Write `3-regression.md` in the same run folder:

1. **Plain-English summary first:** whether the fixes hold, and anything new
   the owner should know before releasing.
2. Each Phase 2 finding ID: confirmed fixed / not fixed / regressed, with
   evidence.
3. New findings, numbered R1, R2… with the severity scale from the Phase 1
   prompt: confirmed defects, test failures, and weaknesses in test coverage.
4. Theoretical concerns, kept separate.
5. Behaviour verified as correct.
6. Your build and test results, and a recommendation: release now, or fix the
   R-items first.

Update the run's row in `docs/audits/README.md`, then commit the report and
README row ("Audit <date> <scope>: phase 3 report").

**Don't change production code in this phase.** Report only. R-items get
fixed in a later Phase 2 pass, or when the owner asks.
