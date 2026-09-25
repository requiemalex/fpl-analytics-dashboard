# Audits

Two kinds of file live here, kept in separate folders:

| Folder | What it is | When to use it |
|---|---|---|
| `strategy/` | **How to audit.** Reusable prompts, not tied to any date or finding. | Running a new audit. |
| `results/` | **What past audits found and fixed.** One dated folder per run, never overwritten. | Checking what was found, fixed or left open. |

## Running an audit

Three phases, each in its own fresh session (never two in one conversation).
Name a scope (a page or feature, e.g. "Dashboard") or leave it out for the
full app.

| Phase | Prompt | Does | Writes | Commits |
|---|---|---|---|---|
| 1 | `strategy/PHASE-1-FORENSIC-AUDIT-PROMPT.md` | Investigates and reports; no fixes (may add tests) | Creates `results/<YYYY-MM-DD>-<scope>/1-audit.md` | Report + tests, as the baseline |
| 2 | `strategy/PHASE-2-REMEDIATION-PROMPT.md` | Fixes that run's confirmed findings | `2-remediation.md` | Fixes, tests, docs, report. No release unless asked |
| 3 | `strategy/PHASE-3-ADVERSARIAL-REGRESSION-PROMPT.md` | Tries to break the fixes; report only | `3-regression.md` | Report. Recommends whether to release |

Phases 2 and 3 use the run folder you name, or else the most recent
unfinished one. Every report opens with a plain-English summary.

**Finding IDs**, stable across a run's three reports:

| ID | Meaning |
|---|---|
| C | Critical |
| H | High |
| M | Medium |
| L | Low |
| V | Needs verification |
| R | New in Phase 3 |

The severity definitions are in the Phase 1 prompt. Older runs used their own
ID schemes (C/M/L on 2026-09-21, D on 2026-09-24).

## Past runs

| Run | Scope | Files | Outcome |
|---|---|---|---|
| `results/2026-09-21-full-app/` | Whole app | `1-audit.md`, `2-remediation.md`, `3-regression.md` | Standard three-phase run |
| `results/2026-09-24-dashboard/` | Dashboard page | `audit-and-remediation.md` | Audit and fixes in one session, at the owner's request (not the standard three phases). All 20 findings fixed in v1.64.0 |
| `results/2026-09-25-player-explorer/` | Player Explorer page | `1-audit.md`, `2-remediation.md`, `3-regression.md` | Phase 1: 0 C, 1 H, 6 M, 9 L, 2 V. Phase 2: all 16 confirmed findings fixed (M1, M3, M4 per the owner's decisions; M1 also removed the per-game floor from user-built Dashboard tiles/graphs); V1, V2 left for the owner. 346/346 tests. Phase 3: fixes hold; 6 new (R1 Medium: at the 1440px desktop default, Next 5 Fixtures' 190px minimum breaks column resizing; R2–R6 Low). Recommends fixing R1 before release |

Each phase adds or updates its run's row. A result file records what was true
at the time, so its text isn't updated afterwards. It may refer to files by
names they had then.
