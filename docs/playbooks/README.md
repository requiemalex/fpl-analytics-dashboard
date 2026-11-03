# Playbooks

Repeatable jobs beyond the three audit phases, each run by one command in
Claude Code (the skills in the parent folder's `.claude/skills/`, each a
pointer to one prompt here). Every playbook follows
`docs/audits/strategy/RULES.md` (how to work without burning usage; the
severity scale) and uses the commands in `docs/audits/strategy/TOOLKIT.md`.
Run each in its own fresh session.

| Command | Prompt | When | Does | Writes | Commits |
|---|---|---|---|---|---|
| `/release [check] [vX.Y.Z]` | `RELEASE.md` | When the owner wants to release | Checks what's waiting (tests, quick probe, a desktop launch, notices, docs), gives a go/no-go, then releases per CLAUDE.md "Releasing". `check` stops before the tag | Nothing (the reply is the record) | Release notes, tag |
| `/gameweek [N]` | `GAMEWEEK.md` | After a gameweek finishes and FPL has checked its data | Checks the automatic jobs brought the gameweek in and the app shows it right | Clean: `audit-output/` only. Findings: an audit run | Only if there are findings |
| `/feature <1\|2\|3> …` | `FEATURE.md` | Building something new | 1 spec (checked against the owner's rules, questions listed), 2 build in batches, 3 try to break it | `docs/features/<date>-<slug>/` | Spec, each batch, reports |
| `/season <end\|start> [preview]` | `SEASON.md` | `end`: after the last fixture (late May). `start`: after FPL's summer reset, and again after GW1. `preview`: any time, against a mocked new season | Checks the season change-over: archive and auto-release, renumbered ids, promoted clubs, pre-season state, hard-coded seasons | An audit run | Report (+ tests) |
| `/rules-sweep [rules or page]` | `RULES-SWEEP.md` | Between full audits | Each owner rule checked across every section; proposes tests that make a rule machine-checked | An audit run | Report (+ tests) |
| `/help-refresh [page]` | `HELP-REFRESH.md` | After features change | Help and README against what the app does now; search words that don't find the right guide | An audit run | Report (+ tests) |
| `/perf` | `PERF.md` | After a release, or when something feels slow | Measures the same things the same way each run and compares with the last run | An audit run with a measurements table | Report (+ the perf script, first run) |
| `/deps [check] [major] [group]` | `DEPS.md` | Monthly, or when a security advisory appears | Updates dependencies one group at a time, each checked and committed, a failing group rolled back | Nothing (the reply is the record) | One commit per group |
| `/a11y [page]` | `A11Y.md` | Occasionally | Keyboard, screen-reader names, contrast, zoom | An audit run | Report (+ tests) |

**Review playbooks are focused audits.** `/gameweek` (with findings),
`/season`, `/rules-sweep`, `/help-refresh`, `/perf` and `/a11y` write
`docs/audits/results/<YYYY-MM-DD>-<name>/1-audit.md` in the Phase 1 output
format and add its row to `docs/audits/README.md` "Past runs". So `/audit 2`
fixes their findings and `/audit 3` tries to break the fixes, exactly as
for a full audit. They never change production code (they may add tests).

**Nothing here releases on its own** except `/release`, and nothing here
runs on a schedule: the owner starts each one.
