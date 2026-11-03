# Phase 2 — Remediation

Fix the confirmed findings of one audit run. Read `RULES.md` in this
folder first.

Use the run folder the owner names; if none, the most recent one with a
`1-audit.md` but no `2-remediation.md` (say which). Read CLAUDE.md once,
that run's `1-audit.md` index and the details of the findings you're
fixing, and `git log --oneline <phase 1 commit>..` plus `git status`.
Owner decisions given in the request override the report.

Being asked to run this prompt is the owner asking you to run the app (via
the probes, or a one-off script per `TOOLKIT.md`) to confirm fixes.

## Plan, then fix in batches

1. **Plan (lead).** Group the findings into batches of up to ~5 that touch
   the same files or rule, ordered Critical/High first, then Medium, Low,
   then O (optimisation) only if the owner asked. V items are fixed only
   once proven (they then get a new ID). Write the plan as a short list in
   your reply, not a file.
2. **Each batch in a fresh helper, one at a time** (batches share files, so
   never in parallel). The brief: the findings' full text from `1-audit.md`,
   the CLAUDE.md rules they touch (quoted), RULES.md, and the rules below.
   The helper fixes, tests, commits ("Audit <date> <scope>: fix <IDs>"),
   and replies with a few lines per finding: outcome, root cause, files,
   test, evidence. It stops at 40 tool calls; anything unfinished comes
   back to you as unfinished, never half-committed.
3. **Check each batch (lead):** `npm run check` must pass before the next
   batch starts; for anything a user sees, the probe or script that found
   it must now come back clean (`npm run probe -- <probe> --pages=<page>`).
   A batch that broke something goes back to a helper with the failure.

## Rules for every fix

- Fix the root cause, not a defensive patch on top. Prefer one shared
  source of truth to duplicated calculations. Never substitute data for
  unavailable data. Keep correct behaviour; add nothing unrelated.
- Each fix gets a regression test that fails on the old code (check that
  it does). Phase 1's `it.fails`/`it.skip` for that finding becomes a
  normal test. Never weaken, remove or rewrite a test because the code
  fails it, or hard-code a value to pass one; if an expectation is wrong
  because the intended behaviour changed, say why in the report.
- Saved data: a change to what a localStorage store holds needs a
  `STORAGE_VERSION` bump and a `migrate()` step that runs only for the
  versions it was written for; check stores that embed it (saved views
  embed tiles and graphs); test old and current versions.
- Docs per CLAUDE.md "Keeping docs current": README sections and Help in
  place, nothing left untrue, removals in `docs/HISTORY.md`.

## Output

When every batch is in: full `npm run check`, then `npm run probe --
--quick` as a regression net. Write `2-remediation.md` once, in the run
folder:

1. **Plain-English summary first:** what was fixed, what wasn't and why,
   what a user will notice.
2. Table: every finding ID, outcome, evidence (test name, before/after
   values, probe result). Nothing marked fixed without evidence.
3. Judgement calls: migrations, changed test expectations, behaviour
   changes.
4. Left open for the owner.
5. Final `npm run check` and quick probe results.

Update the run's row in `docs/audits/README.md`; commit the report and row
("Audit <date> <scope>: phase 2 report"). No release unless the owner asks
in this session; normally it follows a clean Phase 3. End with `npm run
unreleased`'s output (CLAUDE.md "Releasing").
