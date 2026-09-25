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
| `results/2026-09-25-player-explorer/` | Player Explorer page | `1-audit.md`, `2-remediation.md`, `3-regression.md`, `4-remediation-2.md` | Phase 1: 0 C, 1 H, 6 M, 9 L, 2 V. Phase 2: all 16 confirmed findings fixed (M1, M3, M4 per the owner's decisions; M1 also removed the per-game floor from user-built Dashboard tiles/graphs); V1, V2 left for the owner. 346/346 tests. Phase 3: fixes hold; 6 new (R1 Medium: at the 1440px desktop default, Next 5 Fixtures' 190px minimum breaks column resizing; R2–R6 Low). Recommends fixing R1 before release. Second remediation pass (same session as Phase 3, at the owner's request): R1–R12 fixed; V1 → M7 fixed (Historic Average games from total minutes); V2 documented as intended. 371/371 tests. Released as v1.65.0 without a separate Phase 3 of that pass |
| `results/2026-09-25-player-team-profiles/` | Player profile and Team Profile overlays | `1-audit.md`, `2-remediation.md`, `3-regression.md`, `4-remediation-2.md` | Phase 1: 0 C, 2 H, 5 M, 10 L, 2 V. H1: radars and percentile tints have no minutes threshold (cameos top per-game axes), fix needs the owner's decision; H2: pre-season, Career History's live season repeats last season. 6 `it.fails` tests added for H2, M2–M5, L1. Phase 2: all 17 findings fixed, per the owner's minimum-minutes principle (now in README and CLAUDE.md): a fixed 90/450-minute floor on every percentile where the user can't set minutes (H1), the Team Profile header follows the Data View (M1). V1 documented as intended; V2 fixed as decided (0-minute seasons dropped from Historic Average in fixed-floor sections only). Profile-file split left for later. 431/431 tests. Phase 3: fixes hold; 7 new (R1 Medium: the Team Profile header's Historic Average rounds each figure separately, so it contradicts itself, e.g. "38 played · 14W 11D 14L", and two clubs both "2nd"; R2–R7 Low: Current Season header not refreshed by Refresh Data, live Career History season reads 0 if fixtures fail, a skipped player told "No data", focus lost after team → player, User Guide overstates the floor, test gaps). Recommends fixing R1 before release. Second remediation pass (same session as Phase 3, at the owner's request): R1 fixed per the owner's rule (Historic Average W/D/L are whole numbers adding up to games played, in every team view), R2–R4, R6, R7 and T2 fixed; R5 was a test-path artefact, not a defect (guard test added). 446/446 tests. Released as v1.66.1 without a separate Phase 3 of that pass |

Each phase adds or updates its run's row. A result file records what was true
at the time, so its text isn't updated afterwards. It may refer to files by
names they had then.
