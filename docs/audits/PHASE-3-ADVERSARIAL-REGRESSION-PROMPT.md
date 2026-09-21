# Phase 3 — Adversarial Regression Audit

The previous two sessions performed a forensic audit and a remediation pass
on this FPL Analytics Dashboard. You are now the independent QA/regression
reviewer. Your job is NOT to assume the previous fixes are correct — try to
break them.

Read, in order: CLAUDE.md; docs/PROJECT_SPEC.md if present;
docs/DATA_DICTIONARY.md if present; docs/audits/FULL_AUDIT_REPORT.md;
docs/audits/REMEDIATION_REPORT.md; the current git diff/history.

Focus specifically on: edge cases; null and zero values; inconsistent player
state; incorrect filters; stale cached data; duplicate API calls; race
conditions; current/future gameweek boundaries; players with unusual or
missing statistics; newly promoted teams; players with extremely low minutes
or zero appearances; fixture/gameweek boundaries; ranking ties; positional
edge cases; comparison edge cases; refresh behaviour; API failure; partial API
data; browser/runtime errors; calculations that are correct for ordinary
players but fail at the boundaries.

Run the actual application and the automated tests — don't just inspect the
code.

For every problem found, reproduce it or give concrete evidence.

## Output

Create `docs/audits/REGRESSION_AUDIT.md` separating: confirmed defects; test
failures; weaknesses in test coverage; theoretical concerns; and behaviour you
verified as correct.

**Do not fix production code during this phase.** Report only.
