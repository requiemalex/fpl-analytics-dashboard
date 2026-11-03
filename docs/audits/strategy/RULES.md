# Audit rules — every phase, every helper

Read this before any audit work. It is short on purpose: the phase prompt
says *what* to do, this says *how*, so that an audit tests the app hard
without spending the owner's usage on reading.

## Why these rules exist

The 2026-10-23 in-app audit took 426 steps in one conversation. Every step
re-reads the whole conversation, so by the end each step cost ~770k tokens
(median 447k) — 186M in all, most of it re-reading 51 full-page screenshots
and long command output. Phase 2 of 2026-10-18 cost 107M the same way. Cost
grows with **steps × conversation size**, so the rules below keep both down.

## Spend tokens on judgement, not on reading

1. **Machines first.** Run `npm run check` (build + all tests, a few lines)
   and `npm run probe` (the app under pressure, one line per problem)
   before reading any code. See `TOOLKIT.md`. Never run `npm test` or
   `npm run build` directly: their passing output is ~80 KB.
2. **Never read whole big files.** README.md is ~200 KB, CLAUDE.md ~20 KB,
   Dashboard.tsx ~100 KB. Find the section with Grep (README sections are
   `## ` headings and `<tag>` anchors), then Read with `offset`/`limit`.
   Read CLAUDE.md once (lead only). Helpers get the rules they need in their
   brief instead.
3. **No screenshots by default.** Probes check what the page shows as text.
   Take one only for a layout question text can't answer, of the one element
   (`locator.screenshot()`), never full-page, and at most 5 per helper.
4. **Cap what a command prints.** Pipe long output through `tail`/`head`/
   `grep`; write big results to a file under `audit-output/` and read only
   the lines you need.
5. **Short conversations.** The lead stays a coordinator: it delegates
   exploration to helpers (fresh conversations) and receives their short
   summaries, never their working. A helper stops at **40 tool calls**,
   reporting what it checked and what it didn't.
6. **Write each report once**, at the end, from the findings files — not
   rewritten after every finding.
7. **Reuse, don't rebuild.** Browser scripts use `scripts/audit/lib/`
   (fresh browser, saved-data seeding, error capture, page scan, monkey).
   Throwaway scripts go in `audit-output/tmp/` (not committed). A check
   worth running again becomes a probe in `scripts/audit/probe.ts`.

## How to judge (unchanged from earlier audits)

- Audit and fix are separate: an audit never changes production code (it
  may add tests). A remediation fixes only that run's confirmed findings.
- A finding needs evidence: exact steps (a probe's seed + steps count),
  actual vs expected, and for a wrong number the working from the raw API
  (`/api/bootstrap-static`, `/api/element-summary/{id}` via the app's proxy).
  Can't prove it → it's a V item, not a defect.
- Test against the built app (the probes' default), not the dev server:
  dev mode runs React effects twice, so duplicate requests there aren't real.
- Use a fresh browser (the probes always do). Never touch the owner's
  installed app or saved data, and stop any app you started.
- CLAUDE.md's rules are the spec: the owner's universal rules (minimum
  minutes, comparative colouring, whole numbers, whole words, selected
  state, same thing same way everywhere, null not 0, Understat separation)
  are checked as rules across every section, not page by page.

## Severity and IDs

| Level | ID | Meaning |
|---|---|---|
| Critical | C1… | Crash or blank page, lost user data, or wrong figures shown as correct on a core, widely used path. |
| High | H1… | Wrong or misleading output, or a broken interaction, in a specific feature — a user could act on it and be misled. |
| Medium | M1… | Works, but is confusing, fragile, inconsistent or needlessly risky; recoverable, limited impact. |
| Low | L1… | Polish, cosmetic, or a doc/wording mismatch with no effect on figures. |
| Optimisation | O1… | Faster, lighter or simpler with the same behaviour (measured where possible). |
| Needs verification | V1… | Suspected, not proven. Not counted as a defect. |
| Regression-phase | R1… | New in Phase 3. |

IDs are stable for the whole run. Confidence is High/Medium/Low with a line
on why.

## Helper findings file

Each helper writes `audit-output/<run>/<mission>.md` (not committed) in this
shape, at most ~60 lines, and replies to the lead with only a 5-line summary
and the file path:

```
## <mission> — checked: <list>; not checked: <list>
### <severity> <title>
where: file:line / page + control
now vs should: …
evidence: probe seed+steps, or commands and the numbers they gave
confidence: High/Medium/Low — why
```
