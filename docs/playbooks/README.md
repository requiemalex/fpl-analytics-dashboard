# Playbooks

The big repeatable jobs beyond the three audit phases, each run by one
command in Claude Code (the skills in the parent folder's
`.claude/skills/`, each a pointer to one prompt here). Every playbook
follows `docs/audits/strategy/RULES.md` (how to work without burning usage;
the severity scale) and uses the commands in
`docs/audits/strategy/TOOLKIT.md`. Run each in its own fresh session.
Smaller jobs are a plain request, not a playbook.

| Command | Prompt | When | Does | Writes | Commits |
|---|---|---|---|---|---|
| `/feature <1\|2\|3> …` | `FEATURE.md` | Building something new | 1 spec (checked against the owner's rules, questions listed), 2 build in batches, 3 try to break it | `docs/features/<date>-<slug>/` | Spec, each batch, reports |
| `/release [check] [vX.Y.Z]` | `RELEASE.md` | When the owner wants to release | Checks what's waiting (tests, quick probe, a desktop launch, notices, docs), gives a go/no-go, then releases per CLAUDE.md "Releasing". `check` stops before the tag | Nothing (the reply is the record) | Release notes, tag |
| `/season <end\|start> [preview]` | `SEASON.md` | `end`: after the last fixture (late May). `start`: after FPL's summer reset, and again after GW1. `preview`: any time, against a mocked new season | Checks the season change-over: archive and auto-release, renumbered ids, promoted clubs, pre-season state, hard-coded seasons | An audit run (`docs/audits/results/<date>-season-<part>/1-audit.md`, Phase 1 format), so `/audit 2` and `/audit 3` fix and check its findings | Report (+ tests) |

**Nothing here releases on its own** except `/release`, and nothing here
runs on a schedule: the owner starts each one.
