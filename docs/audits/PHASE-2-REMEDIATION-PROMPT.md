# Phase 2 — Remediation Pass

We now have a forensic audit at docs/audits/FULL_AUDIT_REPORT.md. Treat that
report as the input to this phase.

Start by reading, in order: CLAUDE.md; README.md (how the app works
now — not docs/HISTORY.md, which is archived); docs/audits/FULL_AUDIT_REPORT.md; the
current git status and recent git history.

Do not rely on prior conversation history — this is a fresh session and the
files above are the source of truth.

Your job is to systematically remediate confirmed issues from the audit.

## Rules
- Fix confirmed correctness defects before cosmetic or architectural
  improvements.
- Do not fix a "suspected"/"needs verification" issue without first verifying
  it yourself.
- Preserve correct existing behaviour.
- Do not introduce substitutes for unavailable data.
- Do not hard-code values to make tests pass.
- Do not remove, weaken, or rewrite a test merely because the current
  implementation fails it.
- Prefer one authoritative source of truth over duplicated calculations.
- Keep changes focused and reversible.
- After each logical group of fixes, run the relevant tests.
- At the end, run the full test, typecheck, lint, and build suite.
- Add a regression test for every confirmed bug you fix, where possible.
- Update project documentation when a confirmed architectural or data rule
  was previously undocumented.
- Do not introduce unrelated feature work during this pass.

## For every fixed issue, record

Issue; root cause; files changed; test added/updated; verification performed.
Don't mark an issue resolved until there's evidence the defect is actually
fixed.

## Output

Work through the audit systematically, then produce
`docs/audits/REMEDIATION_REPORT.md` listing every issue addressed and the
evidence for each, plus the final full test/typecheck/lint/build results.
