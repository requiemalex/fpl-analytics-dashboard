# Player & Team Profiles Audit — Phase 2 (Remediation) — 2026-09-25

**Input:** `1-audit.md` in this folder (Phase 1 commit `ae127db`; no commits
since, clean tree at start).

**Owner decisions used** (given at the start of this session):

- **The minimum-minutes principle.** A floor exists only to stop tiny
  samples taking over.
  - Where the user can set minimum minutes (Player Explorer, Dashboard
    tiles and graphs they build, Team Building), the app adds none.
  - Where they can't (player profile, Player Comparison, Team Profile, the
    packaged Default Dashboard views), a fixed floor applies, the same as
    the Default Dashboard: 90 minutes in Current Season, 450 otherwise.
  - Record the principle in README and CLAUDE.md.
- **H1:** apply that floor to every percentile in the player profile
  (radars and tile tints, totals as well as per-game), Player Comparison's
  radars and the Team Profile's squad tints. A player below it is shown as
  a small sample, with no percentile or colour.
- **M1:** the Team Profile header follows the Data View, shown the way Team
  Explorer shows it: Historic Average as Team Explorer displays it, and "—"
  for a season the club has no record of.
- **V1:** keep "more Defensive Contributions is better" on the team Defense
  radar, and document it as intended.
- **V2:** in the fixed-floor sections only, a season with 0 minutes
  doesn't count toward Historic Average. Any minutes above 0 still count.
  - Where the user can set minimum minutes, 0-minute seasons still count.
  - The window is always the last 4 completed seasons; it never looks
    further back.

---

## 1. Summary for the owner

**Every finding is fixed: 2 High, 5 Medium, 10 Low, plus your decisions on
V1 and V2.**
- Each code fix has a test that fails on the old code and passes now.
- Everything a user sees was checked in the running app, with the steps
  Phase 1 used to find it.
- The build is clean and all 431 tests pass (section 5).

**What you'll notice:**

- **Radars and colours ignore tiny samples.** This covers the player
  profile, Player Comparison's radars and the Team Profile's squad table.
  - Only players with at least 450 minutes (90 in Current Season) are
    ranked.
  - Ben Davies's 136 minutes last season are now a **small sample**. The
    profile says "Small sample — 136 min in this mode, under the
    450-minute floor, so no percentiles or colours". His radars are marked
    "(small sample)" and hovering them says "Small sample · 0.25".
    - Before, he was at the 100th percentile of defenders for xG/Game.
    - Remi Matthews (3 minutes) and Hinshelwood (63 minutes, Current
      Season) are small samples too.
  - Regulars move a little, because cameos and 0-minute players no longer
    pad the comparison.
  - In the Team Profile's squad table, a player under the floor for that
    club is greyed out and uncoloured. Hovering the row says why. At Man
    City last season that's Lewis, Kovačić, Alleyne and Mukasa.
- **Historic Average leaves out seasons with no minutes, in those same
  places.** Ndiaye's Career History now reads "Season average (2 seasons)
  121 pts", not 3 seasons and 81 pts.
  - The 0-minute 2023/24 row is marked † with "No minutes this season —
    not counted".
  - A season lost entirely to injury also has 0 minutes, so it's dropped
    here too, as you accepted.
  - Player Explorer, your own Dashboard items and Team Building are
    unchanged.
- **The Team Profile header follows the Data View.** For Man City:

  | Data View | Header |
  |---|---|
  | Last Completed Season | "2nd in table · 78 pts · 38 played · 23W 9D 6L" |
  | Historic Average | "2nd in table · 82 pts · 38 played · 25W 7D 6L" |
  | Current Season | "1st in table · 15 pts · 5 played · 5W 0D 0L" |

  A promoted club reads "—" in a season it wasn't in the Premier League.
- **Pre-season, Career History's "(live)" season reads 0.** It no longer
  repeats last season's totals.
- **While historic data loads, or if it fails, the profile no longer
  claims the player has no data.** The Data View toggle's own
  "Building…" or error-and-Retry notice is the only message. If it fails,
  Career History still shows the seasons, just without the average.
- **The historic download no longer starts on every page.** Opening the
  User Guide now requests only the basic data. Opening a profile still
  starts the download.
- **Escape closes the Team Profile.**
- **Smaller changes:**
  - Whole numbers show as whole numbers ("90", not "90.00").
  - Radar hovers read "42nd", not "42th".
  - The Career History chart marks uncounted seasons † on hover, like the
    table.
  - Goalkeepers lose the two Defensive Contribution tiles that could only
    read 0.
  - Prime's Average row is no longer coloured.
  - Playing Time says "Matches" and "per Match". A double gameweek will be
    two rows and two matches, with no React error.
  - Squad rows and team pills open with Enter.
  - The profiles behave as dialogs for keyboard and screen-reader users.
  - A link to a player or club that doesn't exist says "not found".
- **Docs:**
  - The principle is recorded in README "Minimum minutes" and in
    CLAUDE.md "Calculations".
  - The User Guide's profile section is rewritten to match the app (L6).
  - The squad table's Historic Average (L7) and the Defense radar's DC
    (V1) are documented.

**Not done:** splitting the 920-line `PlayerDetailOverlay.tsx`. Phase 1
said it was only worth doing alongside M4 and L5, and both were small
enough without it. Details in section 4.

No saved data changed, so no storage migration was needed.

---

## 2. Findings

Tests are in `client/src/components/profiles.audit.test.tsx` ("audit
test") unless named otherwise. "Fails on old code" was checked by stashing
every non-test change and running the tests against `ae127db`. All 17 new
component tests and the 6 converted Phase 1 tests failed there. Only the 3
tests that already passed at Phase 1 passed. The new unit tests failed
because the functions they test didn't exist yet.

| ID | Outcome | Root cause | Fix (files) | Test | Evidence |
|---|---|---|---|---|---|
| H1 | Fixed | The profile, Player Comparison and Team Profile took their percentile threshold from `effectiveMinMinutes(DEFAULT_FILTERS, mode)`, always 0. `smallSample` checked `minutes < 0` | New `metrics/fixedMinutesFloor.ts` (`fixedFloorMinutes`, `isBelowFixedFloor`), the single source of 90/450 (the Dashboard's `LIVE_RATE_STAT_MIN_MINUTES`/`RATE_STAT_MIN_MINUTES` now read it). Used by `PlayerDetailOverlay.tsx` (radars, tiles, Prime Totals), `PlayerComparison.tsx`, `TeamDetailOverlay.tsx` (squad tints, greyed row). `PlayerRadarChart.tsx` says "Small sample" | Audit test "H1" ×5 (cameo banner and radar; regular's tint ignores the cameo; Current Season 60 min; Comparison; squad row). `fixedMinutesFloor.test.ts` ×3 | App: Davies banner and radar titles "(small sample)", hovers "Small sample · 0.25"; Konsa "Clean Sheets 75th percentile"; Matthews (Historic Average) and Hinshelwood (Current Season) small samples; Man City's 4 squad rows greyed; Comparison "DAVIES (SMALL SAMPLE)", Konsa not |
| H2 | Fixed | `currentSeasonEntry` read the raw live player, not `resolvePlayerStats`, so it skipped the pre-season zeroing | `PlayerDetailOverlay.tsx`: the "(live)" entry is resolved as Current Season | Audit test "H2" (was `it.fails`) | Test: Mins 0, Points 0 (were 2,750 and 209). Not visible live until next pre-season |
| M1 | Fixed | The header read the live table (`team.position`, `team.points`…) | `TeamDetailOverlay.tsx` `teamHeaderLine(clubTotals)`, formatted with Team Explorer's `TEAM_COLUMNS` formats; "—" with no record | Audit test "M1"; `teamStats.test.ts` "teamHeaderLine" ×2 (Historic Average rounding, "—") | App: Man City's three headers above |
| M2 | Fixed | The "No data" banner was gated on `smallSample`, which was true whenever minutes were null, including while data loaded. Career History treated a missing reference season as "no window" | `PlayerDetailOverlay.tsx`: no-data banner only once the mode's data has loaded (`dataSettled`), suggesting only other modes that have data. Career History has a "window unknown" state (no marks, no average); `CareerHistoryChart` accepts `countedSeasonNames: null` | Audit test "M2" (loading, was `it.fails`), plus "M2: when the historic dataset fails" ×2 (failure; suggestion never names the current mode) | App: historic-bulk delayed 6 s → after 1.5 s, no "No data", no "Small sample"; historic-bulk 502 → no "No data", toggle shows error + Retry, Career History "Season average" with no "(0 seasons)" |
| M3 | Fixed | Both overlays called `requestHistoricData()` on mount, and are mounted on every page | Both overlays request only while a profile is open | Audit test "M3" (was `it.fails`) | App: fresh `/guide` requests only `/api/bootstrap-static` and `/api/fixtures`; opening a profile then requests historic-bulk |
| M4 | Fixed | Rows keyed by `round`; counts labelled "gameweeks" were matches | `PlayerGameweekHistory.fixtureId` (from the validated `fixture` field, `normalizeElementSummary.ts`), rows keyed by it; `rotationIndicators.ts` / `PlayingTimeIcon.tsx` say "Matches" / "per Match" | Audit test "M4" (was `it.fails`), plus "M4: Playing Time counts matches" | Test: no duplicate-key error; "Matches: 3" for a double gameweek. App: Haaland "Matches: 5 · Average Minutes Per Match: 90" |
| M5 | Fixed | No `useEscapeLayer` in the Team Profile | `TeamDetailOverlay.tsx` | Audit test "M5" (was `it.fails`) | App: Escape on `/teams?teamProfile=15` clears the address |
| L1 | Fixed | `fmtDecimal` defaults to 2 decimals and was used on counts | Counts get 0 decimals in the gameweek tables, Totals, count tiles, career table and chart tooltip. Radar axes carry their own `decimals` (`radarStats.ts`, `teamStats.ts`) | Audit test "L1" (was `it.fails`) | App: Haaland Prime row "6 90 1 0 1.09 …"; radar "Points 99th percentile · 239", "ICT Index … 302.3"; chart "162 pts" |
| L2 | Fixed | `${percentile.toFixed(0)}th` | New `fmtOrdinal` (`utils/format.ts`) in the radar tooltip and team header | `format.test.ts` "fmtOrdinal" ×2 | App: "75th", "25th", "17th", "85th", "34th", "96th", "78th" — none of the "42th"/"1th" forms |
| L3 | Fixed | The chart tooltip used "*" for "not counted" | `CareerHistoryChart.tsx` uses "†" | None (Recharts tooltip isn't reachable in jsdom); app check | App: Raya "2021/22 † 95 pts", in-window seasons unmarked; Man City "2016/17 †" to "2021/22 †" |
| L4 | Fixed | The GKP tile grid copied DEF's DC tiles | `PlayerDetailOverlay.tsx` GKP tiles: Clean Sheets, xGC, xGC/Game, xGI | Audit test "L4" | App: Matthews has no "Def. Contrib." tile |
| L5 | Fixed (untinted) | The Average row reused the Totals percentile | Average row untinted (section 3) | Audit test "L5" | Test: Totals cell tinted, Average cell not |
| L6 | Fixed | User Guide out of date | `UserGuide.tsx` Player Profile section rewritten: Starts in Supplements, "Live Data", Average = total ÷ matches listed (0-minute ones included), only the Totals row tinted | Docs | Read against the app |
| L7 | Fixed (docs) | The rule wasn't written down | README "Team Explorer / Team Profile" and the User Guide: squad Historic Average = the player's seasons at this club in the window | Docs | — |
| L8 | Fixed | No key handlers or `tabIndex`; no dialog semantics | Squad rows `tabIndex=0` with Enter/Space; `TeamBadge` Enter/Space and `aria-label`; both overlays `role="dialog"`, `aria-modal`, named by their heading. New `state/useDialogFocus.ts` moves focus in, keeps Tab inside the newest dialog and restores focus on close. "Player Rankings" has an `aria-label` | Audit test "L8" ×3 (dialog + focus; squad row Enter; team pill Enter) | App: Man City dialog named "Man City", focus inside after 60 Tabs; Enter on a squad row → `?player=411`; Escape then closes it |
| L9 | Fixed | An unmatched id rendered `null` | Both overlays show a "Player not found" / "Team not found" sheet; × or Escape clears the link | Audit test "L9" ×2 | App: `?player=99999` and `?teamProfile=abc` show the messages |
| L10 | Fixed | Dead plumbing and stale comments | `filters`/`DEFAULT_FILTERS`/`effectiveMinMinutes` removed from both overlays and Player Comparison; the unreachable small-sample paths replaced by the H1 ones; "Squad Points History" comments fixed (`CareerHistoryChart.tsx`, `careerMetrics.ts`). File split not done (section 4) | Covered by H1/M2 tests | Build clean |
| V1 | Documented as intended | — | Comment on `TEAM_DEFENSE_AXES`; README and User Guide | — | — |
| V2 | Fixed per decision (proven first: Ndiaye's 0-minute 2023/24 counted, 81 → 121 pts without it) | `windowAverage` averages every window season | `HistoricPlayerProfile.playedSeasonsInWindow`/`playedWindowAverage` (`historicAnalysis.ts`); `resolvePlayerStats(…, { dropZeroMinuteSeasons })`. Used by the profile (Views, percentile pool, Career History), Player Comparison (table and radars) and the Dashboard's packaged Default view (`poolForDashboardItem`). The Team Profile's squad already excludes them (the club record lists only players with minutes) | Audit test "V2"; `fixedMinutesFloor.test.ts` V2 ×3 (1 minute counts, 0 doesn't, no reach-back; option only where asked; all-zero window → "—"); `Dashboard.helpers.test.ts` `poolForDashboardItem` ×2 | App: Ndiaye "Season average (2 seasons) 121 pts · 2,604 mins"; 2023/24 row "† … No minutes this season — not counted"; 2020/21 "† … Outside the 4-season window" |

Other checks in the running app: no console errors, and neither profile
scrolls sideways at 390px.

---

## 3. Judgement calls

- **L5: the Average row is untinted, not re-ranked.** Its divisor is the
  matches in this player's log. The pool has no equivalent: the other
  players' logs aren't loaded, and their estimated games come from
  minutes, not matches. Any tint would rank a number other than the one
  shown. Removing it is the honest fix.
- **M4: count matches, not gameweeks.** The Average row and Playing Time
  divide by matches (0-minute ones included), which suits a gauge measured
  against one 90-minute match. So the labels now say "Matches". The
  numbers didn't change.
- **M2, failure case.** Career History's 4-season window is anchored to
  the whole pool's last completed season, which only the historic dataset
  knows. The player's own latest season isn't a safe stand-in, because he
  may have missed it. So when the dataset fails, the chart and table still
  show but make no counted/uncounted claim, and the average reads "—". The
  "(live)" bar also needs that season to name itself, so it's absent in
  that case (as before).
- **H1, the no-data banner.** It now names only the other Data Views that
  have figures for the player, worked out from his own data. Current
  Season always has figures.
- **M1 formatting.** Historic Average uses Team Explorer's rounding
  (position 3.5 → "4th"). A club with no record shows a single "—" for the
  whole line, rather than "— in table · — pts…".
- **V2 on the Dashboard.** You listed the packaged Default views as a
  fixed-floor section, so their Historic Average uses the played-seasons
  pool. No current default tile or graph uses Historic Average, so nothing
  changes on screen today, just as with the existing per-game floor there.
  - The Default view's floor itself still applies only to per-game items,
    not to totals. A top-5 of totals can't be taken over by a cameo, and
    the Default view shows no percentiles.
- **Test data, not expectations, changed:**
  - `PlayerGameweekHistory` gained a required `fixtureId`, so the Phase 1
    test's `gw()` builder now sets one. Its M4 double gameweek uses two
    different fixture ids, as a real one has.
  - `HistoricPlayerProfile` gained two fields, so the hand-built profiles
    in `resolvePlayerStats.test.ts` and `minutesReliabilityBlend.test.ts`
    now include them (empty).
  - No assertion was changed.
- **Saved data:** none of this touches a localStorage store. No
  `STORAGE_VERSION` bump.

---

## 4. Left open

- **Splitting `PlayerDetailOverlay.tsx`** (L10's last point). It's now
  about 920 lines. M4 and L5 turned out small enough without a split, and
  it's architectural work you didn't ask for. Worth doing the next time
  the profile changes substantially.
- **Nothing else.** V1 and V2 were decided and are done.

---

## 5. Final results

| Check | Result |
|---|---|
| `npm run build` | Clean (exit 0; Vite's usual large-chunk warning only) |
| `npm test` | 431/431 passed (server 45, client 386: the 357 from Phase 1 plus 29 new; the 6 `it.fails` are now normal tests) |
| Real app | Production build on port 4400, Playwright (Chromium), fresh contexts, scripts in scratch space only; server stopped afterwards. The dev server already on port 4000 was left untouched |
