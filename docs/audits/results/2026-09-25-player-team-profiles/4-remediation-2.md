# Player & Team Profiles Audit — Second Remediation Pass — 2026-09-25

**Input:** `3-regression.md` in this folder (Phase 3 commit `2836b80`):
R1–R7, plus concern T2 from its section 4.

**The owner asked for every issue found in this run to be fixed and
released, in the same session as Phase 3.** So no independent Phase 3 has
checked this pass, only the checks recorded below.

**Owner decision used:** R1: Historic Average stays an average, but the
games played are a hard ceiling. Wins, draws and losses must never add up
to more than the games played, even after rounding.

---

## 1. Summary for the owner

**Everything from Phase 3 is dealt with.**
- Five items are fixed: R1, R2, R3, R4 and R6.
- The test gaps (R7) are filled.
- T2, a small wording issue, is fixed too.
- R5 turned out not to be a defect (see below).
- The build is clean and all 446 tests pass. 15 of them are new, and 13 of
  those fail on the code before this pass. The other two guard behaviour
  that was already right.
- Each fix was checked in the running app against live data.

**What you'll notice:**
- **Historic Average results add up.** A club's Historic Average wins,
  draws and losses are now whole numbers that always add up to 38. For
  example, Brentford reads "38 played · 14W 10D 14L" (it was 14W 11D 14L,
  39 games).
  - This applies wherever those figures appear: the Team Profile header,
    Team Explorer's Wins/Draws/Losses columns and filters, CSV export, and
    Dashboard team tiles and graphs.
  - League position and points stay rounded averages, as you said, so
    Arsenal and Man City both still read "2nd". The User Guide now explains
    this.
- **Refresh Data now refreshes everything already loaded.** That includes
  this season's club figures and league table, which Team Explorer and the
  Team Profile read. If no page has needed the historic data yet, Refresh
  Data doesn't start it.
- **A failed fixtures request no longer zeroes this season.** The app also
  counts a season as started once FPL marks a gameweek finished. So
  Haaland's live Career History row stays at 39 pts and 450 min, and Current
  Season stays correct, even if the fixtures list fails to load.
- **A player whose historic figures FPL failed to send** gets "Haaland's
  historic figures couldn't be fetched from FPL this session", not "No data
  for Haaland". Player Comparison no longer lists him as having no data.
  - It also no longer says anyone has "no data" while the historic data is
    still loading. This is the same problem Phase 2 fixed in the profile,
    found here in Comparison.
- **"No data … Try …" only suggests a Data View where the player actually
  played.** For example, it no longer sends Iling Jr to a season where he
  had 0 minutes.
- **User Guide:**
  - It now says exactly where a "small sample" loses its colour.
  - It notes that Player Comparison's table still colours whichever picked
    player is better on each row.
  - It says the Default view leaves small samples out of per-game tiles.
  - It explains that in Historic Average the floor is average minutes per
    counted season (T1, documented, not changed).
  - It says what Refresh Data refreshes.

**R5 was my mistake in Phase 3.** In the real flow — club pill → Team
Profile → a squad row → Escape — focus goes back to the club pill.
- My Phase 3 script opened the Team Profile by typing its address, so there
  was nothing to return focus to.
- Checked again in the app: focus lands on "View ARS team profile".
- A new test now guards this, and nothing was changed.

---

## 2. Findings

"Fails on old code" was checked by setting aside every production change
from this pass and running the new tests against `2836b80`. 13 of 15
failed; the two that passed guard behaviour that was already correct (R5,
and R2's "don't start a rebuild nobody needed").

| ID | Outcome | Root cause | Fix (files) | Test | Evidence |
|---|---|---|---|---|---|
| R1 | Fixed, per your rule | Each Historic Average mean was rounded on its own for display | `resultsWithinPlayed` (`metrics/teamStats.ts`), used inside `computeTeamAggregates`, so every screen shows the same figures. After rounding each mean down, the games still missing go to the largest remainders (ties: wins, then draws). Single seasons are unchanged. A record whose results don't add up is just rounded, never forced | `teamStats.test.ts` ×4; `profiles.audit.test.tsx` "R1" | App, all 20 clubs: W+D+L = played for every club. Brentford "14W 10D 14L", Fulham "14W 8D 16L", Chelsea "16W 10D 12L" (were 39 each) |
| R2 | Fixed | Refresh Data only re-fetched bootstrap and fixtures; the historic dataset (with this season's club figures) loaded once per session | `AppStateContext.refresh` also calls `refreshHistoricData()` if the historic data has been requested this session | `AppStateContext.test.tsx` ×2 (rebuilds when loaded; doesn't when not) | App: Refresh on `/guide` → only bootstrap and fixtures. After opening a Team Profile → also `/api/refresh/historic-bulk` (200) |
| R3 | Fixed | `currentSeasonHasStarted` was `fixtures.some(finished)`, and a failed fixtures request leaves that list empty | `seasonHasStarted(fixtures, events)` (`normalize/gameweek.ts`): a finished fixture or a finished gameweek from bootstrap | `gameweek.test.ts` ×3; `AppStateContext.test.tsx` "R3" | App, fixtures blocked (502): Career History "2026/27 (live) £15.6m 450 5 39 …" (was all 0), matching Prime Totals "39 450 5"; Current Season PPG 7.8, no "Small sample — 0 min" |
| R4 | Fixed | "No data" was allowed once the historic dataset loaded, even for a player the server skipped | `modeDataKnown` (`metrics/resolvePlayerStats.ts`), one rule for both places. Player profile: a banner saying his historic figures couldn't be fetched. Player Comparison: its "no data" note now uses the same rule, which also silences it while the data loads | `profiles.audit.test.tsx` "R4" ×2 | App, Haaland skipped: "Haaland's historic figures couldn't be fetched from FPL this session, so this mode shows —."; no "No data"; Comparison lists nobody |
| R5 | Not a defect | Phase 3's script opened the club by address, so there was no opener to return to | None | `profiles.audit.test.tsx` "R5" (pill → club → player → Escape → pill; uses Space, covering R7's Space gap) | App: focus back on "View ARS team profile" |
| R6 | Fixed | The User Guide said every fixed-floor section removes a small sample's colour | `UserGuide.tsx` Minimum minutes paragraph; README "Minimum minutes" (Comparison's head-to-head colours; the floor in Historic Average is per counted season) | Docs | Read in the running app |
| R7 | Fixed | Gaps listed in Phase 3 | The tests above. The Phase 2 header test's fixture was corrected (section 3) | — | — |
| T2 | Fixed | The suggestion listed any mode with figures, including 0 minutes | `PlayerDetailOverlay.tsx`: only modes where he has minutes | `profiles.audit.test.tsx` "T2" | App: Iling Jr no longer told to "Try Last Completed Season" (0 minutes there) |

Other checks in the running app: no console errors.

---

## 3. Judgement calls

- **R1 applies to the club figures themselves, not just the header.**
  Fixing only the header would have made it disagree with Team Explorer's
  columns by a game. Doing it once in `computeTeamAggregates` keeps the
  header, Team Explorer (cells, filters, CSV), Dashboard team tiles and
  graphs in agreement.
  - The cost is that Historic Average W/D/L are now stored as whole
    numbers. So two clubs averaging 14.25 and 14.4 wins both show 14 and
    tie when sorted. Filters already compared the displayed whole number,
    so they're unaffected.
- **A changed test fixture.** Phase 2's `teamHeaderLine` test built a
  2024/25 season of 21W 10D 8L in 38 games (39 results), which is
  impossible. Its expected line, "… 38 played · 21W 10D 8L", was the R1
  symptom. The fixture is now 21W 9D 8L. The expectation follows from it:
  "… 21W 9D 8L", which adds up to 38.
  - With the old fixture, the new rule would still return 21W 10D 8L.
    That's deliberate: data whose results don't add up is rounded, not
    forced.
- **R2's cost.** A forced historic rebuild re-requests every player from
  FPL. It took about a second in this session; the app already allows for
  up to a minute. It runs only on a manual Refresh, only if a page has
  needed the data, and the old figures stay on screen until the new ones
  arrive. The 10-minute background poll still doesn't rebuild it.
- **R4 in Player Comparison** wasn't listed in Phase 3. It's the same
  defect, and the same shared rule fixes it.
- **Saved data:** no localStorage store changed. No `STORAGE_VERSION`
  bump. Nothing was removed, so there's no HISTORY.md entry.

---

## 4. Left open (your decisions)

- **T1:** in Historic Average the floor is average minutes per counted
  season. It's now documented; say if you'd rather use total minutes.
- **T4:** Player Comparison's table still colours a small sample
  head-to-head. It's documented; say if it should be greyed like the
  radars.
- **T3:** pre-season wording ("— in table · 0 pts …", everyone a 0-minute
  small sample in Current Season) is accurate but clumsy. Unchanged.
- **Splitting `PlayerDetailOverlay.tsx`**, as in Phase 2.

---

## 5. Final results

| Check | Result |
|---|---|
| `npm run build` | Clean (exit 0; Vite's usual large-chunk warning only) |
| `npm test` | 446/446 passed (server 45, client 401: 386 before this pass, plus 15 new) |
| Real app | Production build on port 4400, Playwright (Chromium), fresh contexts, scripts outside the repo; server stopped afterwards. The dev server on 4000/5173 was left untouched |
