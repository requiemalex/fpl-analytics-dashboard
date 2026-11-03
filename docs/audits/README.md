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
| 1 | `strategy/PHASE-1-FORENSIC-AUDIT-PROMPT.md` | Puts the app under pressure (probes), then helper missions: pressure, consistency, numbers, saved data, optimisation, docs. No fixes (may add tests) | Creates `results/<YYYY-MM-DD>-<scope>/1-audit.md` | Report + tests, as the baseline |
| 2 | `strategy/PHASE-2-REMEDIATION-PROMPT.md` | Fixes that run's confirmed findings, in batches, each in a fresh helper | `2-remediation.md` | Each batch, then the report. No release unless asked |
| 3 | `strategy/PHASE-3-ADVERSARIAL-REGRESSION-PROMPT.md` | Tries to break the fixes; report only | `3-regression.md` | Report. Recommends whether to release |

Every phase follows `strategy/RULES.md` (how to work without burning usage;
severity scale) and uses the commands in `strategy/TOOLKIT.md`:
`npm run check` (build + all tests in a few lines), `npm run probe` (the
built app under pressure in a fresh browser: every page, API failures,
damaged saved data, a seeded "impatient user"), `npm run probe:selftest`.

Phases 2 and 3 use the run folder you name, or else the most recent
unfinished one. Every report opens with a plain-English summary.

**Season checks** (`/season`, `docs/playbooks/SEASON.md`) write a run
folder here too, with a `1-audit.md` in the Phase 1 format and a row in
"Past runs", so Phases 2 and 3 work on them unchanged.

**Finding IDs**, stable across a run's three reports:

| ID | Meaning |
|---|---|
| C | Critical |
| H | High |
| M | Medium |
| L | Low |
| O | Optimisation (from 2026-11-03) |
| V | Needs verification |
| R | New in Phase 3 |

The severity definitions are in `strategy/RULES.md`. Older runs used their
own ID schemes (C/M/L on 2026-09-21, D on 2026-09-24).

## Past runs

| Run | Scope | Files | Outcome |
|---|---|---|---|
| `results/2026-09-21-full-app/` | Whole app | `1-audit.md`, `2-remediation.md`, `3-regression.md` | Standard three-phase run |
| `results/2026-09-24-dashboard/` | Dashboard page | `audit-and-remediation.md` | Audit and fixes in one session, at the owner's request (not the standard three phases). All 20 findings fixed in v1.64.0 |
| `results/2026-09-25-player-explorer/` | Player Explorer page | `1-audit.md`, `2-remediation.md`, `3-regression.md`, `4-remediation-2.md` | Phase 1: 0 C, 1 H, 6 M, 9 L, 2 V. Phase 2: all 16 confirmed findings fixed (M1, M3, M4 per the owner's decisions; M1 also removed the per-game floor from user-built Dashboard tiles/graphs); V1, V2 left for the owner. 346/346 tests. Phase 3: fixes hold; 6 new (R1 Medium: at the 1440px desktop default, Next 5 Fixtures' 190px minimum breaks column resizing; R2–R6 Low). Recommends fixing R1 before release. Second remediation pass (same session as Phase 3, at the owner's request): R1–R12 fixed; V1 → M7 fixed (Historic Average games from total minutes); V2 documented as intended. 371/371 tests. Released as v1.65.0 without a separate Phase 3 of that pass |
| `results/2026-09-25-player-team-profiles/` | Player profile and Team Profile overlays | `1-audit.md`, `2-remediation.md`, `3-regression.md`, `4-remediation-2.md` | Phase 1: 0 C, 2 H, 5 M, 10 L, 2 V. H1: radars and percentile tints have no minutes threshold (cameos top per-game axes), fix needs the owner's decision; H2: pre-season, Career History's live season repeats last season. 6 `it.fails` tests added for H2, M2–M5, L1. Phase 2: all 17 findings fixed, per the owner's minimum-minutes principle (now in README and CLAUDE.md): a fixed 90/450-minute floor on every percentile where the user can't set minutes (H1), the Team Profile header follows the Data View (M1). V1 documented as intended; V2 fixed as decided (0-minute seasons dropped from Historic Average in fixed-floor sections only). Profile-file split left for later. 431/431 tests. Phase 3: fixes hold; 7 new (R1 Medium: the Team Profile header's Historic Average rounds each figure separately, so it contradicts itself, e.g. "38 played · 14W 11D 14L", and two clubs both "2nd"; R2–R7 Low: Current Season header not refreshed by Refresh Data, live Career History season reads 0 if fixtures fail, a skipped player told "No data", focus lost after team → player, User Guide overstates the floor, test gaps). Recommends fixing R1 before release. Second remediation pass (same session as Phase 3, at the owner's request): R1 fixed per the owner's rule (Historic Average W/D/L are whole numbers adding up to games played, in every team view), R2–R4, R6, R7 and T2 fixed; R5 was a test-path artefact, not a defect (guard test added). 446/446 tests. Released as v1.66.1 without a separate Phase 3 of that pass |
| `results/2026-10-18-full-app/` | Whole app | `1-audit.md`, `2-remediation.md`, `3-regression.md`, `4-remediation-2.md` | Phase 1 (baseline `3b61448`, v1.82.1): 1 C, 3 H, 20 M, 18 L, 10 V. C1: deleting a Dashboard view overwrites My View with the deleted view's tiles and graphs (reproduced live). H1: during a live gameweek Team Building's GW+1 is a played-but-unconfirmed match and FPL Official is a gameweek out. H2/H3: the Understat sync publishes small goal disagreements and matches newer than the ledger without the stop-and-alert the rule requires. Owner decisions needed on M1 (provisional matches in club figures), M12 (ownership in predicted minutes), V1. 48 tests added (`*.audit1018.test.*`), 20 `it.fails`. 640/640 tests. Helpers stopped early by a usage limit; gaps listed in §9. Phase 2: C1, H1–H3, 18 of 20 M and 16 of 18 L fixed (L4, L10 partly); M1 unchanged and V1 intended, per the owner; M12 per the owner (ownership out of predicted minutes); M11 documented (FPL gives next-round availability only). H2 adds `data/understat/accepted-differences.csv`, pre-filled with one real case (Madueke/Darlow, 2025/26) for the owner to confirm. M6 adds an id ledger that translates saved ids at the summer renumbering. V2–V10 open. 691/691 tests; 11 real-app checks. No release. Phase 3: fixes hold (C1, H1, saved-data repair and upgrades re-run in the app). Owner decided FPL is the source of truth where FPL and Understat disagree; Madueke/Darlow entry confirmed (CLAUDE.md, README). 6 new: R1 Medium (Understat "Goals − xG"/"NP Goals" use Understat's goals, against that decision), R2 Medium (after the summer renumbering, a tile tracking only departed players or relegated clubs silently shows the whole league), R3 Medium (one unreadable past season for one player blanks every club's Current Season figures), R4–R6 Low. Recommends release now; R2 before July 2027. Second remediation pass (same session as Phase 3, at the owner's request): the owner clarified that a stat both sources record may differ between them, so R1 is not a defect, and H2 was reverted (goals differences are reported, only over 0.5% stops the sync; `accepted-differences.csv` removed). R2, R3, R4 fixed; R5 and part of R6 left. 693/693 tests. Released as v1.83.0 without a separate Phase 3 of that pass |
| `results/2026-10-23-in-app/` | Whole app, used in the browser and the desktop app | `audit-and-remediation.md` | Hands-on audit and fixes in one session, at the owner's request (not the standard three phases). Baseline `3416140` (v1.101.0). C1: v1.101.0 opened to a blank window (Origin header refused by Electron's `net.fetch`); fixed and released as v1.101.1 the same hour. H1 imported squads judged against a flat £100m; H2 Clear Draft without confirmation; 12 M and 20 L, mostly usability and consistency (keyboard, search, headers at laptop widths, confirmations, small samples on graphs, plain errors). All fixed except L18–L20; five items left for the owner (full-screen window, FPL Official's GW+1 ignoring the opponent, comparison colours, coarse clean-sheet inputs, blank My View). 136 + 870 + 6 tests |
| `results/2026-11-03-full-app/` | Whole app | `1-audit.md`, `owner-decisions.md`, `2-remediation.md`, `3-regression.md`, `4-remediation-2.md` | Phase 1 (baseline `3a6c30a`, v1.131.0), the first run with `npm run check`/`npm run probe` and helper missions under `strategy/RULES.md`: all probes clean (pages, failures, storage, monkey seeds 1 and 7) and nothing crashed in 7 missions. 0 C, 0 H, 7 M, 15 L, 4 O, 12 V. M1: a 0-minute player's profile Match Log Totals/Average show 0, not "—". M2/M3: repeated Enter during an FPL import makes duplicate squads, and Cancel doesn't stop the import. M4: Team Building forgets the active squad. M5/M6: the side menu's current page and the active Notepad tab break the selected-state rule. M7: the percentile rank is coded 5 times. Every figure recalculated from the raw API matched. 4 `it.fails` tests added. 163 + 1447 + 6 tests. Phase 2 (six batches, each in a helper): M1–M8 and 15 Lows fixed, each with a test that fails on the old code and a check in the built app. M8 (was V12) opens the Dashboard and Player Comparison on Starter (selected-view stores v2→3 and v1→2; a blank My View moves once), and L16 (was V7) makes a player's DC/Game whole, both per the owner. L17 is the "a club's played" wording, and L18 (was V10) the README's player Starts season. M7 makes one rank rule (a pool under 2 has no rank). M4 adds the `saved-squads:active` store. L7 left for the owner; L8 fixed after the report ("Gameweek 9 finished", the owner's choice); L15, V5, V8 not defects; O1–O4 not done. V2 more likely (old custom tiles not shown on a pre-views upgrade). Three more "on" styles found off the selected-state rule, kept by the owner as exceptions. 163 + 1483 + 6 tests; quick probe clean. No release. Phase 3: of 22 fixes rerun, 17 hold in full; L1, L2 and L16 hold with a leftover (R7, R2, R3); L5 holds in the app (the server's rule is looser, R6); L9 is not fixed in the app (R1, Medium: the deadline record rewrites saved squads at v6 on every live load, so an old hand-marked chip is dropped on the first launch; `it.fails` test added). 0 C, 0 H, 1 M, 7 L (R2 hover loses the picked green on Points History, R3 Match Log DC average 2 decimals, R4 comparison Help's + card, R5 a vanished view falls to My View, R6 server team-ID rule, R7 two hand-written floor checks, R8 a cameo's average minutes "0"). Probes clean at seeds 1 and 42. 163 + 1488 + 6 tests. Recommends fixing R1 before release. Second remediation (the owner asked for all of them): R1–R8 fixed. Old hand-marked chips are kept at every version, the picked Points History season keeps its green on hover (new cascade test), the Match Log DC average is whole, the comparison Help is corrected, a vanished saved view falls back to Starter, the server's team-ID rule is the app's (0 rejected, gameweeks 1–38, one cache entry per number), two more floor checks call `isUnderMinimum`, and a cameo's average minutes reads "<1". 166 + 1490 + 6 tests |

Each phase adds or updates its run's row. A result file records what was true
at the time, so its text isn't updated afterwards. It may refer to files by
names they had then.
