# Phase 2 — Remediation

The input to this phase is a Phase 1 audit: `1-audit.md` in a run folder
under `docs/audits/results/`. Use the run folder the owner names. If none is
named, use the most recent one that has a `1-audit.md` but no
`2-remediation.md`, and say which one you picked.

Start by reading, in order:
- CLAUDE.md.
- README.md (how the app works now; not docs/HISTORY.md).
- That run's `1-audit.md`.
- `git log` since the Phase 1 commit, and `git status`.

Don't rely on prior conversation history. This is a fresh session and those
files are the source of truth.

Your job is to fix the confirmed findings, using their IDs throughout.

## Permissions this prompt gives you

Being asked to run this prompt is the owner asking you to run the app
(`npm run dev`) and drive it with throwaway Playwright scripts outside the
repo, to confirm fixes. Use a fresh browser context, and stop any server you
started.

## Rules

- **Order:** Critical and High correctness defects first, then Medium, then
  Low. Only move on to cosmetic or architectural work if the owner asked for
  it.
- **Needs verification (V) items:** don't fix one until you've proven it
  yourself. It then gets a new ID in this report and in the audit's index
  row.
- **Fixes:** fix the root cause rather than adding a defensive patch on top.
  Keep correct behaviour as it is. Prefer one shared source of truth over
  duplicated calculations. Never substitute data for unavailable data. Keep
  changes focused and don't add unrelated features.
- **Tests:**
  - Add a regression test for each fix where possible. It should fail on the
    old code; check that it does.
  - Turn any `it.fails`/`it.skip` test Phase 1 left for a finding into a
    normal test once that finding is fixed.
  - Never weaken, remove or rewrite a test just because the code fails it,
    and never hard-code a value to pass one. If a test's expectation is
    genuinely wrong because the intended behaviour changed, say why in the
    report.
- **Saved data:** any change to what a localStorage store holds needs a
  `STORAGE_VERSION` bump and a `migrate()` step, and a check of the stores
  that embed it (saved views embed tiles and graphs). Make sure the bump
  doesn't re-run an earlier one-off migration step on data it wasn't written
  for, and test both the old and the current version.
- **Docs, per CLAUDE.md "Keeping docs current":**
  - Update the affected README sections and the User Guide in place.
  - Remove anything the fix makes untrue.
  - Record anything removed or replaced in `docs/HISTORY.md`.
- **Checks:** run the relevant tests after each group of fixes. At the end,
  run `npm run build` and `npm test` in full; there's no lint script.
- **Real app:** for anything a user sees, confirm the fix in the running app
  with the same steps the audit used to reproduce it, and record the result.

## For every finding, record

ID; outcome (fixed / not fixed and why / not reproducible); root cause; files
changed; test added or updated; evidence it's fixed (test output, before and
after values, the app check). Don't mark a finding fixed without that
evidence.

## Output

Write `2-remediation.md` in the same run folder:

1. **Plain-English summary first:** what was fixed, what wasn't and why, and
   anything a user will notice changing.
2. A table of every finding ID with its outcome and evidence.
3. Details for any fix that needed a judgement call, such as a migration, a
   changed test expectation or a behaviour change.
4. Anything left open, for the owner to decide.
5. The final `npm run build` and `npm test` results.

Update the run's row in `docs/audits/README.md`.

**Commit** the fixes, tests, docs and report ("Audit <date> <scope>: phase 2
fixes"). Don't tag a release unless the owner asks in this session. Normally
the release comes after Phase 3 finds no confirmed regressions. The release
steps are in CLAUDE.md "Releasing".
