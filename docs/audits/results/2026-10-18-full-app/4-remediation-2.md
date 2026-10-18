# Full App Audit — Second Remediation Pass — 2026-10-18

**Input:** `3-regression.md` in this folder (report commit `d72ab55`). Run
in the same session as Phase 3, at the owner's request, as in earlier
runs.

**Owner's instructions for this pass:**
- **Fix R2 and R3.**
- **R1 is not a defect.** The owner clarified the decision recorded during
  Phase 3. Some stats come only from FPL, some only from Understat, and some
  from both. A stat both sources record may differ between them, because the
  two record it differently: a goal FPL credits to a player that Understat
  calls an own goal is fine. So Understat's goal-based columns rightly use
  Understat's count.
- **Remove anything built that stops that.** The work to undo is Phase 2's
  H2 change, under which any goals difference stopped the daily sync unless
  hand-listed in `accepted-differences.csv`.
- **Then commit, tag and release.**

---

## 1. Summary for the owner

- **R2 fixed.** After next summer's renumbering, a tile or graph whose
  picked players (or clubs) have all left FPL:
  - shows nobody, not the whole league;
  - gets "(players no longer in FPL)" or "(clubs no longer in FPL)" added
    to its name.

  Checked in the app with a simulated previous season.
- **R3 fixed.** A player left out only because his history couldn't be read
  in the app no longer blanks every club's Current Season figures. The
  server had his data, so its club figures are complete. In the app with one
  bad 2021/22 record, Arsenal shows 10.83 xG, 4.69 xGC, 7.74 xA and 336
  points, the same as with clean data. A player the server really couldn't
  fetch still blanks them, with the note, as M4 intended.
- **H2 undone; the goals rule is relaxed.**
  - The sync's goals comparison is back to how it was before the audit. A
    few differences (such as Madueke/Darlow, 2 of 9,386 player-matches in
    2025/26) are listed in the run report, but the sync carries on and
    publishes.
  - Only a share above 0.5% of a season's player-matches stops it. That
    many can only come from player links gone wrong, not from the sources
    recording goals differently.
  - `accepted-differences.csv` and the code that read it are removed. You
    no longer need to list anything.
- **Docs follow the new rule:** CLAUDE.md, the README and the in-app
  Understat guide (R4) now say a stat both sources record may differ, and
  that Understat's Goals − xG and NP Goals use Understat's count.
- **Not done:** R5 (the rollover only reports to the browser console) and
  R6's remaining test gaps (M5, L15, L17 have no automated test). Both are
  Low.

---

## 2. Changes

| ID | Outcome | Change | Tests | Evidence |
|---|---|---|---|---|
| R1 | Not a defect (owner) | None to the columns | — | — |
| R2 | Fixed | `seasonIdRollover.ts`: a picked list that the rollover empties stays `[]`, and the item's name gets a suffix. `Dashboard.tsx`: a picked list counts whenever it isn't `null`, so `[]` means "these players: nobody". Before, `[]` fell back to the item's criteria. The tile dialog has never allowed saving an empty pick list (blocked since `61d78c8`), so `[]` can only come from the rollover. Editing such a tile opens on its (empty) pick list | `seasonIdRollover.test.ts` +1, `Dashboard.helpers.test.ts` +1 | Old code: both fail. App: "ONLY LEAVERS (players no longer in FPL)" → "No eligible players."; "PROMOTED LAST YEAR (clubs no longer in FPL)" → "No data available."; "MY TRACKED" still → Haaland |
| R3 | Fixed | `schema.ts` also returns `unreadablePlayerIds`. `AppStateContext` adds `historicFetchSkippedPlayerIds` (server-skipped only). `livePlayerSumsPartial` and the team views' Current Season note use it (Teams, Dashboard, Team Profile). The historic-mode notes now say "a fetch failed, or FPL sent data the app couldn't read" | `schema.audit1018.test.ts` (extended) | Old code: fails. App: bad 2021/22 season → figures and no note; server-skipped player → "—" and the note; control unchanged |
| R4 | Fixed (docs) | `understat/guide.tsx`: goals "almost always agree"; Goals − xG and NP Goals use Understat's count. `columns.ts` comment likewise | — | — |
| H2 | Reverted (owner) | `checks.ts` and `files.ts` restored from `cd191ab`, with comments now stating the new rule. `sync.ts`: the accepted-differences lines removed, H3 kept. `accepted-differences.csv` deleted. `checks.test.ts` rewritten | `checks.test.ts` (3) | Tests: agreement → quiet; a Madueke-style goal/own-goal pair (2 of 400) → warning, no stop; 3 of 400 → stop. Phase 2's H3 test, where FPL's live record disagrees with Understat on a goal, still stops: 2 of 8 is far above 0.5% |
| R5 | Not done | — | — | Low |
| R6 | Partly | Tests for R2, R3 and the restored goals check added. M5, L15, L17 still untested | — | — |

Test mocks of the app state in 8 test files gained
`historicFetchSkippedPlayerIds: []`, alongside their existing
`historicSkippedPlayerIds: []`.

---

## 3. Judgement call

**The 0.5% guard stays.** The owner asked to remove anything that stops a
goal from differing between the sources. A 0.5% guard doesn't do that:
- real differences run at about 0.02% (2 of 9,386);
- 0.5% is about 47 player-matches in a full season, which only happens when
  Understat data is attached to the wrong players, and that would also
  corrupt their xG.

This is the check as it stood before the audit. If the owner wants no goals
check at all, it is one constant and one test to remove.

---

## 4. Final build and tests

| | |
|---|---|
| `npm run build` | Passed (same chunk-size notice) |
| `npm test` | Passed: server 15 files / 101 tests, client 64 files / 592 tests (693 total) |
| Old-code check | The three new or extended R2/R3 tests fail with the fixes removed and pass with them |
| Real app | R2 (rollover), R3 (bad past season, server-skipped player, control), and C1, H1 and saved-data upgrades re-run for collateral damage: all as expected; servers stopped |

Released as v1.83.0.
