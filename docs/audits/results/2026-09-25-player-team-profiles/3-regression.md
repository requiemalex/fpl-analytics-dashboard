# Player & Team Profiles Audit — Phase 3 (Adversarial Regression) — 2026-09-25

**Input:** `1-audit.md` (Phase 1 commit `ae127db`) and `2-remediation.md`
(Phase 2 commit `29df1c7`) in this folder, as named by the owner. The tree
was clean at `29df1c7` at the start, and no production code was changed.

**Method:**
- Read CLAUDE.md, the README and both reports. Then read
  `git diff ae127db..29df1c7` line by line (32 files).
- Re-ran `npm run build` and `npm test`.
- Ran the fixed app's production build (`node server/dist/index.js` on port
  4400) against the live 2026/27 API: GW5 finished, GW6 next, 667 players,
  220 club-seasons.
  - Drove it with throwaway Playwright scripts (Chromium, a fresh browser
    context per check, scripts in scratch space outside the repo).
  - Used Playwright to delay, fail or rewrite API responses: historic data
    slow or failing, fixtures failing, a player skipped by the server, and a
    simulated pre-season.
  - The dev server already running on ports 4000/5173 was left untouched.
    The server started for this phase was stopped at the end.
- Loaded saved Dashboard settings in the formats written by v1.66.0 (the
  pre-fix version) and by a much older, pre-versioning build.

---

## 1. Summary for the owner

**The fixes hold.** All 17 Phase 1 findings and both of your decisions (V1,
V2) were rechecked in the running app, and each does what Phase 2 said.
- The build is clean, and all 431 tests pass.
- There were no crashes and no console errors.
- No page showed "NaN" or "Infinity", including all 20 Team Profiles in
  all three Data Views.
- The minutes floor is exact at its edges:
  - Bailey, with exactly 450 minutes last season, is ranked.
  - In Current Season, Bizot (90 minutes) is ranked, and Zubimendi (89) is
    a small sample.
- Saved Dashboard settings from before the fix load unchanged.

**Nothing new is High or Critical. There are 7 new items: 1 Medium and 6
Low.**

1. **R1 (Medium): the Team Profile header in Historic Average doesn't add
   up.** It rounds each average separately, as Team Explorer's columns do,
   which is what you asked for. Read as one sentence, though, it
   contradicts itself:
   - Brentford: "11th in table · 52 pts · **38 played · 14W 11D 14L**".
     Those results add up to 39 games and 53 points.
   - Arsenal and Man City both read "**2nd** in table", and no club is 1st.
     14 of the 18 clubs with a record share a position with another club.
   - Phase 2's own test expects one of these self-contradicting lines.
2. **R2 (Low): the Current Season header no longer updates during a
   session.** It now reads the historic dataset, which loads once per
   session. "Refresh Data" doesn't reload it. Before, the header followed
   the live table, which refreshes every 10 minutes. Team Explorer's own
   Current Season columns already worked this way before Phase 2.
3. **R3 (Low): if the fixtures request fails, Career History's live season
   shows all zeros.** Haaland reads "2026/27 (live) … 0 pts, 0 mins",
   directly under a gameweek table totalling 39 points and 450 minutes. This
   is a side effect of the H2 fix. It only happens when the server has no
   saved copy of the fixtures, and it clears at the next 10-minute refresh.
4. **R4 (Low): a player the server skipped is told he has "No data".** When
   the server couldn't build one player's history, the profile says "No
   data for Haaland in this mode". The toolbar above it says "1 player(s)
   had no historic data available this session (a transient fetch issue)".
5. **R5 (Low): keyboard focus gets lost after going from a club to a
   player.** Team Profile → Enter on a squad row → Escape leaves focus
   nowhere on the page.
6. **R6 (Low, docs): the User Guide overstates the floor.** It says a
   player under the floor "gets no percentile and no green/red colour"
   everywhere the floor applies. Two places don't work that way:
   - Player Comparison's table still colours him. Ben Davies (136 minutes)
     shows green over Konsa for PPG and xG/Game.
   - The Default Dashboard view leaves him out of per-game tiles rather than
     showing him greyed out.
7. **R7 (Low): test coverage gaps**, listed in section 3.

**Worth knowing before you release.** These are your decisions working as
designed, not defects:
- **The same player has two different "Historic Average" figures.**
  Ndiaye's is 81 points in Player Explorer and in Dashboard tiles you
  build, but 121 in his profile and in Player Comparison. The difference is
  that the profile and Comparison leave out his 0-minute 2023/24 season
  (V2). The User Guide explains this, but expect it to look odd.
- **In Historic Average, the 450-minute floor is per season.** Nwaneri has
  1,061 minutes across four seasons, which averages 265 per season, so his
  profile calls him a small sample. See section 4 (T1).

**Recommendation: fix R1 first, then release.** R1 is small, but it shows
wrong-looking sentences on a screen users will visit. It needs a quick
decision from you on the wording (options under R1). The Low items can
wait for a later pass.

---

## 2. Phase 2 findings — status

| ID | Status | Evidence (real app unless noted) |
|---|---|---|
| H1 | Confirmed fixed | `/players?player=508` (Ben Davies), Last Completed Season: banner "Small sample — 136 min in this mode, under the 450-minute floor, so no percentiles or colours". Offense radar hovers: "xG/Game \| Small sample · 0.25", "xGI/Game \| Small sample · 0.28". None of his 15 tiles is tinted. Konsa (regular): 14 tinted tiles, "Clean Sheets 75th percentile · 9". Floor edges: Bailey (exactly 450 min) ranked; Current Season Bizot (90) ranked, Zubimendi (89) small sample. Matthews (Historic Average, 3 min) and Hinshelwood (Current Season, 63 min) small samples. Man City squad, Last Completed Season: 4 greyed rows (401, 125, 135, 25 min). Player Comparison: "DAVIES DEF (SMALL SAMPLE)", Konsa unmarked |
| H2 | Confirmed fixed | Pre-season simulated (no finished fixtures): Haaland's "2026/27 (live)" row reads 0 points, 0 minutes, price £15.6m. See R3 for a side effect |
| M1 | Confirmed fixed, with side effects (R1, R2) | Man City: Last Completed "2nd in table · 78 pts · 38 played · 23W 9D 6L"; Historic Average "2nd in table · 82 pts · 38 played · 25W 7D 6L"; Current Season "1st in table · 15 pts · 5 played · 5W 0D 0L". Coventry and Hull: "—" in Last Completed and Historic Average, "18th …" / "8th …" in Current Season. The server's live positions match FPL's own table for all 20 clubs, ties included (e.g. Brentford, Leeds, Liverpool and Everton all on 9 points, separated by goal difference then goals scored) |
| M2 | Confirmed fixed, one edge case left (R4) | Historic data delayed 6 s: after 1.5 s there's no "No data" and no "Small sample"; the toolbar says "Building the historic dataset…". Historic data 502: no "No data"; the toolbar shows the error with Retry; Career History "Season average —". Retry, then success: "Season average (4 seasons) 227 pts · 2,752 mins", and the radars draw |
| M3 | Confirmed fixed | Fresh `/guide`: only `/api/bootstrap-static` and `/api/fixtures`. "Not found" profiles request nothing more. Eight profiles opened in quick succession: 1 historic request in total, and the last profile opened (Hinshelwood) is the one shown |
| M4 | Confirmed fixed | Raya and Haaland: "Matches: 5 · Average Minutes Per Match: 90". Rows are keyed by fixture id (code). A real double gameweek can't be seen yet; the test covers it |
| M5 | Confirmed fixed | Escape on `/teams?teamProfile=15` → `/teams`, sheet gone. With both profiles in the address, the team sheet is on top, holds focus, and Escape closes it first |
| L1 | Confirmed fixed | Raya's GW5 row "5 BHA (A) 0–3 1 90 0 0 0.00 0.00 0.00 0 1.31 2 6"; Totals "30 450 0 0 … 3 4.03 9 104" |
| L2 | Confirmed fixed | Radar hovers seen: "1st", "2nd", "17th", "25th", "32nd", "33rd", "72nd", "75th", "85th", "98th" |
| L3 | Confirmed fixed (code) | `CareerHistoryChart.tsx` marks an uncounted season " †" and in-window ones with nothing. Not hovered again in the app |
| L4 | Confirmed fixed | Raya's tiles: Clean Sheets, xGC, xGC/Game, xGI, Pts/£m, PPG, Min/Goal (no DC tiles) |
| L5 | Confirmed fixed | Raya: Totals cells tinted, no Average cell tinted |
| L6 | Confirmed fixed, one new overstatement (R6) | Player Profile section read against the app: Starts in Supplements, "Live Data", Average ÷ matches listed, only Totals tinted — all true |
| L7 | Confirmed (docs) | README "Team Explorer / Team Profile" and the User Guide describe the squad's Historic Average |
| L8 | Confirmed fixed, one gap (R5) | Man City dialog named "Man City", focus inside on open and after 60 Tabs. Enter on a squad row opens the player. Enter and Space on a team pill open the club (the page doesn't scroll). Escape returns focus to the pill |
| L9 | Confirmed fixed | `?player=99999`: "Player not found — This link is to a player who isn't in FPL's current player list"; Escape clears it. `?teamProfile=abc`: "Team not found" |
| L10 | Confirmed (code) | `filters`/`DEFAULT_FILTERS`/`effectiveMinMinutes` gone from both overlays and Player Comparison; stale comments fixed. The file split was deliberately left open |
| V1 | Confirmed (docs) | Comment on `TEAM_DEFENSE_AXES`; README and User Guide |
| V2 | Confirmed fixed as decided | Ndiaye: "Season average (2 seasons) 121 pts · 2,604 mins · 7.5 G · 1.5 A"; 2023/24 "†", 0 min, "No minutes this season — not counted"; 2020/21 "† … Outside the 4-season window". Historic Average PPG 4.2 (242 pts ÷ 58 games). Unchanged where it should be: Player Explorer Historic Average still 81 pts, and a user-built Dashboard tile still shows 81 (and Iling Jr 0) |

---

## 3. New findings

### R1 — Medium — Historic Average header contradicts itself

- **Confidence:** High. Recomputed for all 20 clubs from the live club
  history, and the unit test shows the same thing.
- **Where:** `TeamDetailOverlay.tsx` `teamHeaderLine`. Each figure is
  rounded on its own with Team Explorer's column format (M1, as you
  decided).
- **What happens:** the mean of each figure over the club's window seasons
  is rounded separately, then all of them are joined into one sentence:

  | Club | Header | Problem |
  |---|---|---|
  | Brentford | 11th in table · 52 pts · 38 played · 14W 11D 14L | W+D+L = 39; 3W+D = 53 pts |
  | Fulham | 12th in table · 51 pts · 38 played · 15W 8D 16L | W+D+L = 39; 53 pts |
  | Chelsea | 8th in table · 57 pts · 38 played · 16W 10D 13L | W+D+L = 39; 58 pts |
  | Tottenham | 12th in table · 51 pts · 38 played · 15W 7D 16L | 52 pts |
  | Arsenal / Man City | both "2nd in table" (means 1.75 and 1.75) | no club is 1st |

  14 of the 18 clubs with a record share a position with another club:
  2nd ×2, 7th ×3, 8th ×2, 11th ×2, 12th ×3, 14th ×2.
- **Why it matters:** "in table" reads as a real league position, and the
  line's own numbers disagree with each other. A user can't tell whether
  the app is wrong. In Team Explorer the same values sit in separate
  columns, where independent rounding is less jarring.
- **Test:** `teamStats.test.ts` "teamHeaderLine" expects
  `"4th in table · 71 pts · 38 played · 21W 10D 8L"`. That's 39 results,
  and 21W 10D would be 73 points.
- **Options (your call):**
  - (a) Label the line as an average: "Avg. position 1.8 · 82 pts · 25W 7D
    6L per season".
  - (b) Show one decimal in Historic Average only.
  - (c) Show only position and points in Historic Average.

### R2 — Low — Current Season header no longer refreshes

- **Confidence:** High (code, plus a request trace).
- **Where:** the header now reads `computeTeamAggregates(…, "live")`. That
  comes from `clubSeasons`, which arrives with the historic dataset. The
  dataset is fetched once per session (`AppStateContext.loadHistoric`) and
  cached for 12 hours on the server (`config.ts` `historicBulk`).
- **What happens:** clicking Refresh Data requested only
  `/api/refresh/bootstrap-static` and `/api/refresh/fixtures`. Nothing
  reloads the club data. If a gameweek finishes while the app stays open,
  the Current Season header keeps the old position, points and W/D/L until
  the app restarts. Before Phase 2, the header was built from finished
  fixtures, which the 10-minute poll and Refresh Data both update.
- **Context:** Team Explorer's Current Season columns already had this
  staleness before Phase 2, so the header now matches them. The broader
  question is whether Refresh Data should also reload the club data.

### R3 — Low — Fixtures failure makes the live Career History season read zero

- **Confidence:** High. Reproduced.
- **Where:** `PlayerDetailOverlay.tsx` `currentSeasonEntry` now resolves
  through `resolvePlayerStats(…, "live", …, currentSeasonHasStarted)` (the
  H2 fix). `currentSeasonHasStarted` is `fixtures.some(f => f.finished)`,
  and a failed fixtures request leaves the fixture list empty
  (`AppStateContext.load`).
- **Reproduce:** make `/api/fixtures` return 502, then open
  `/players?player=411`:

  | | Shown | Expected |
  |---|---|---|
  | Career History row | "2026/27 (live) £15.6m 0 0 0 0 0 0 0.00 0.00 0.00" | Haaland's real totals |
  | Prime Totals, same profile | "39 450 5 0 4.42 0.53 4.95 …" | (correct) |
  | Current Season banner | "Small sample — 0 min … 90-minute floor" | not a small sample |
  | Stale-data banner | none | — |

- **Scope:** this needs the server to have no cached fixtures and FPL's
  fixtures endpoint to fail, for example on a cold start. It clears at the
  next successful 10-minute poll.
  - Current Season reading zero in that situation is older than Phase 2.
  - The Career History row is new: before H2, it read the live figures
    directly and was right.
  - A signal from bootstrap would be sturdier, for example "any gameweek
    finished" from `events`.

### R4 — Low — A skipped player is told he has "No data"

- **Confidence:** High. Reproduced.
- **Where:** `PlayerDetailOverlay.tsx`: `dataSettled` is true once
  `historicStatus === "ready"`, even when this player is in
  `historicSkippedPlayerIds`.
- **Reproduce:** serve a historic dataset with Haaland removed and
  `skippedPlayerIds: [411]` (as the server does when his request fails),
  then open his profile. It shows both:
  - "1 player(s) had no historic data available this session (a transient
    fetch issue) — everyone else is unaffected."
  - "No data for Haaland in this mode — every field below shows —. Try
    Current Season."

  His Career History, from his own request, shows "Season average (4
  seasons) 227 pts" in the same profile.
- **Expected:** no "No data" claim for a skipped player. M2's stated goal
  was to say "no data" only when the player really has none.

### R5 — Low — Focus lost after team → player → Escape

- **Confidence:** High. Reproduced.
- **Where:** `state/useDialogFocus.ts` gives focus back to the element
  that had it when the dialog opened. For the player profile, that element
  is the squad row inside the Team Profile, which is removed when the
  profile swaps.
- **Reproduce:** `/teams?teamProfile=15`, focus the first squad row, press
  Enter (→ `?player=411`), then Escape. Focus is now on `<body>`, and a
  keyboard user starts again from the top of the page. From a team pill,
  focus does return to the pill.

### R6 — Low — User Guide overstates what the floor does

- **Where:** `UserGuide.tsx`, Analysis modes, "Minimum minutes" paragraph:
  "Where you can't — the player profile, Player Comparison, the Team
  Profile and the Dashboard's Default view — a fixed floor applies … A
  player under it is a small sample: he's shown, but gets no percentile and
  no green/red colour."
- **What's actually true:**
  - **Player Comparison's table still colours a small sample.** It compares
    the selected players with each other, not by percentile. Davies (136
    min) vs Konsa, Last Completed Season: Davies's PPG 5.0 and xG/Game 0.25
    are green, and Konsa's 2.9 and 0.04 are red. Only the radars follow
    the floor, which is what H1 asked for.
  - **The Default Dashboard view doesn't show him greyed out.** It leaves
    players under the floor out of per-game tiles and graphs altogether,
    and doesn't floor totals (README "Minimum minutes" states this
    correctly).
- **Fix:** reword the paragraph. Separately, you may want to decide
  whether Comparison's table should also grey a small sample (see T4).

### R7 — Low — Test coverage gaps

- `teamHeaderLine`'s test expects the self-contradicting line (R1).
- No test covers:
  - a failed fixtures request in the profile (R3);
  - a skipped player (R4);
  - focus after a team → player swap (R5);
  - Space on a squad row or team pill (only Enter is tested).
- The chart's "†" tooltip (L3) has no test. Phase 2 noted this: Recharts
  tooltips can't be reached in the test environment.
- The Current Season header's source isn't covered, so a test wouldn't
  catch it going stale (R2).

---

## 4. Theoretical concerns (not defects)

- **T1 — The Historic Average floor is per season.** The profile compares
  a player's *average minutes per played season* with 450, the same as the
  Default Dashboard view. So Nwaneri (1, 13, 882 and 165 minutes: 1,061 in
  total) is a small sample in Historic Average. So are Nelson (1,059 over
  four seasons) and Bentley (1,012). Worth confirming that's what you
  meant by "450 otherwise".
- **T2 — The "No data" message can suggest a Data View where the player
  has only zeros.** Iling Jr has only 0-minute seasons in the window, so
  Historic Average says "No data … Try Last Completed Season or Current
  Season". In Last Completed Season he has 0 minutes, which is shown as
  "Small sample — 0 min". That's accurate, but not useful.
- **T3 — Pre-season presentation.** In the simulated pre-season:
  - The Team Profile's Current Season header reads "— in table · 0 pts · 0
    played · 0W 0D 0L".
  - Its squad rows read "—", while the club's own totals read 0 (this
    predates Phase 2).
  - Every player profile in Current Season says "Small sample — 0 min".
  None of it is wrong, but it's clumsy for the summer squad-planning
  window.
- **T4 — Player Comparison's table and the floor.** The table's
  better/worse colours still let a cameo "win" per-game rows against a
  regular (R6 evidence). That's outside what you decided for H1 (radars
  only), but it's the same small-sample problem in a section where the
  user can't set minutes.
- **T5 — Two profiles open at once** is only reachable by editing the
  address. It works: the team sheet is on top, holds focus, and closes
  first.

---

## 5. Behaviour verified as correct

- **Numbers.** Ndiaye's Historic Average PPG (242 ÷ 58 = 4.17 → 4.2) and
  his 2-season career average (121 pts, 2,604 min) recompute by hand. The
  server's live league positions match FPL's own `position` for all 20
  clubs, ties included.
- **Boundaries:**
  - The floor is inclusive (450 and 90 minutes rank; 89 doesn't).
  - A player whose window seasons are all 0 minutes gets "No data" in
    Historic Average, never 0.
  - Promoted clubs read "—" for seasons outside the Premier League.
  - A new-to-FPL player's Career History handles 0 seasons.
- **Loading, failure and races:**
  - Historic data slow, failed, then retried; the profile is correct at
    each step.
  - Eight quick profile switches: the last one opened is shown, with one
    historic request and one gameweek request per player.
  - No console errors in any run.
- **Upgrades:**
  - Phase 2 changed no saved-data store: none of `useSummaryTiles`,
    `useDashboardGraphs`, `useSavedDashboardViews`, `useSavedSquads` or
    `persistentStorage` is in the diff.
  - Settings in the v1.66.0 format loaded with nothing lost or changed in
    meaning: a user-built view with Historic Average tiles, a copy of a
    Default tile's id, and picked players.
    - Its PPG tile still has no floor and counts 0-minute seasons (Esse
      13.0 at the top).
    - The Default-id copy isn't floored.
    - Picked Ndiaye still shows 81, and Iling Jr 0.
  - An unversioned, pre-envelope tile store with an unknown Data View was
    migrated to the current version, fell back to the default Data View,
    and caused no errors.
- **Collateral:**
  - Dashboard (Default and user-built views), Player Comparison, and Player
    Explorer (Historic Average unchanged; team pills open with Enter and
    Space) all work.
  - All 20 Team Profiles × 3 Data Views have no NaN, Infinity or
    "undefined".
  - Both profiles have no sideways scroll at 390 px.
- **Docs:**
  - README "Minimum minutes", "Player profile" and "Team Explorer / Team
    Profile" match the app.
  - CLAUDE.md records the principle.
  - HISTORY.md has entries for the replaced behaviour.
  - The User Guide's profile sections match the app, apart from R6.

---

## 6. Build, tests and recommendation

| Check | Result |
|---|---|
| `npm run build` | Clean (exit 0; Vite's usual large-chunk warning only) |
| `npm test` | 431/431 passed (server 45, client 386). The only console output is React Router's usual future-flag notices |
| Real app | Production build on port 4400, Playwright 1.63 (Chromium), fresh contexts, scripts outside the repo; server stopped afterwards. The dev server on 4000/5173 was left untouched |

**Recommendation: fix R1, then release.** Every Phase 2 fix holds, and
nothing new is High or Critical. R1 is the one new item that shows
wrong-looking information in normal use, and it's small once you pick a
wording. R2–R7 can go in a later Phase 2 pass. R3 and R4 happen only when
the FPL API partly fails, R5 affects only keyboard users, and R6 is
wording.
