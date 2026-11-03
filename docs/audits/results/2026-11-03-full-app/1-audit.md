# Audit 2026-11-03 — whole app — Phase 1

## 1. Summary for the owner

**What was tested, and how hard.** The built app was run on its own port in
fresh browsers (never your installed copy or your saved data):

- every page at laptop and wide-monitor widths;
- the FPL API made to fail in five ways, for shared data and for data each
  page fetches when you use it;
- every saved-data store damaged at once, then one at a time;
- an "impatient user" clicking and typing at random: 40 steps and then 80
  steps from every page, with two different seeds.

Seven helper missions then did what random clicking can't:

- pushed every limit;
- faked a gameweek in progress, a finished gameweek, pre-season and the
  season over;
- broke the FPL team import;
- loaded saved data in the shapes older versions wrote;
- read the same players and clubs on every page;
- recalculated figures by hand from FPL's raw data;
- timed the slowest page;
- checked Help against the app.

**Counts:** 0 Critical, 0 High, 7 Medium, 15 Low, 4 Optimisation, 12 to
verify (not defects).

**What matters most:**

- **Team Building's import can make duplicate squads (M2).** Pressing Enter
  a few times while an import is loading imports the team once per press. In
  the test, 4 presses saved 4 identical squads and filled the 5-squad limit.
  **Cancelling mid-import still saves the squad (M3).**
- **A player who hasn't played shows 0 in his profile's Match Log
  Totals and Average (M1)**, where your rule says "—". Every match row and
  the Explorer already show "—"; only the footer doesn't.
- **Team Building forgets which squad you were on (M4)** when you change
  page or restart. The Dashboard and Player Comparison remember their picked
  view.
- **Two picked things don't use the soft-green fill (M5, M6):** the
  current page in the side menu (a green edge) and the active Notepad tab (a
  green underline).

**What held up under pressure:** nothing crashed, went blank or showed
NaN in any probe or mission. Every API failure gave a clear message with a
working Try again. Damaged and older saved data loaded without losing
anything. All five gameweek states rendered on every page. Every figure
recalculated from FPL's raw data matched what the app shows: points, points
per game, per-£m value, Historic Average and the live 180-minute floor. Every
limit Help states is the real limit. The same three players and two clubs
agree across the Explorers, profiles and Dashboard. The palette switch
removes every rank colour on every page. The app is fast: switching Data
View takes about 16 ms and sorting the biggest table about 30 ms, and no
page re-fetches shared data.

## 2. Baseline

- Commit `3a6c30a`, last release v1.131.0, clean tree.
- `npm run check`: build ok; server 163/163, client 1443/1443, electron 6/6.
- `npm run probe` (all four probes, seed 1): 0 issues in 318 s, freshly
  built app on :4199. Details in `audit-output/2026-11-03-11-01/`.
  - pages: 5 pages at 1366 and 1920 px. First load of / 2.2 s with 3 API
    calls (a cold server; 0.9 s warm); other pages 0.3–0.4 s.
  - failures: bootstrap-static and fixtures each given a 500, a dropped
    connection, rubbish and the wrong shape, and each gave a clear message.
    On-demand routes exercised: element-summary, historic-bulk, understat.
    **Not reached by the probe:** player-seasons, entry and event. Mission A
    drove entry by hand (404/500/abort/junk/picks-500, all handled).
    player-seasons and event were not reached by anyone.
  - storage: 13 stores damaged, no issues. The 14th store
    (`scoutline:terms-accepted:v1`) is seeded by the probe itself; mission D
    damaged it by hand, also no issues.
  - monkey: 40 steps from each of the 5 pages.
- Extra monkey: seed 7, 80 steps per page, 0 issues (166 s).
- `npm run probe:selftest -- --no-build`: every planted fault reported.

## 3. Index

| ID | Severity | One line |
|---|---|---|
| M1 | Medium | Profile Match Log Totals/Average show 0 (and "Average Minutes Per Match: 0") for a player with 0 minutes, not "—" |
| M2 | Medium | Pressing Enter during a slow FPL import starts one import per press, creating duplicate squads |
| M3 | Medium | Cancel during an FPL import doesn't cancel: the squad is still saved and made active |
| M4 | Medium | Team Building forgets the active squad after a page change or reload; Dashboard and Comparison remember theirs |
| M5 | Medium | Side menu's current page: grey with a green left edge, not the soft-green fill |
| M6 | Medium | Active Notepad tab: green underline and no fill |
| M7 | Medium | The percentile rank is coded 5 times; the copies disagree for a pool of one |
| L1 | Low | The "under the minutes floor" test is written by hand in ~10 places instead of `isUnderMinimum` |
| L2 | Low | Picked Points History season: grey with a grey ring, not soft green |
| L3 | Low | Unused `.btn.active` style carries the forbidden green border |
| L4 | Low | New Squad name has no 60-character limit (every other name box has one) |
| L5 | Low | A 20-digit team ID gets "try again in a moment" instead of "Enter a valid FPL team ID" |
| L6 | Low | Unknown player ids in a comparison link silently take one of the 5 places |
| L7 | Low | Limits are enforced only when adding, never when saved data loads (30 squads, 60 tiles… kept) |
| L8 | Low | Two styles of gameweek label in the top bar ("GW 9 · final" vs "Gameweek 9") |
| L9 | Low | Saved squads drop an old hand-marked chip with no gameweek (`{chip, event:null}`) |
| L10 | Low | Exp. Pts (FPL Official) has no `metrics/dictionary.ts` entry |
| L11 | Low | Unused `computeExpPointsBreakdown` still uses a 900-minute bar and the old games rounding |
| L12 | Low | Help "The table toolbar" says five icons; Player Explorer has six (Hide) |
| L13 | Low | Help's "Clear filters" line leaves out that it also turns Hide off |
| L14 | Low | Help "What the icons mean" claims every icon but misses several |
| L15 | Low | A personal name ("vaastav") is a Help search keyword |
| O1 | Optimisation | Entry chunk 1.02 MB carries the chart library via the eagerly imported profile overlays |
| O2 | Optimisation | No HTTP compression (no action for the desktop app) |
| O3 | Optimisation | Hashed assets served `max-age=0` |
| O4 | Optimisation | Reopening a profile refetches element-summary; the Understat profile is cached |

## 4. Findings

### M1 — Match Log footer shows 0 for a player with 0 minutes
- **Confidence:** High. Seen in the app and reproduced in a test.
- **Where:** `client/src/components/PlayerDetailOverlay.tsx:195-228`
  (`logSums` turns each unplayed match into 0, so a season with no minutes
  sums to a real 0) and `:1042` (footer cells, no zero-minute guard);
  `components/playerProfile/PlayingTimeIcon.tsx:62`.
- **Now vs should:** Kusi-Asare (id 272, 0 minutes), Current Season profile.
  All 9 match rows show "—". The footer shows
  `TOTALS 0 0 0 0 0 0.00 0.00 0.00 0 0.00 0 0`, and Playing Time says
  "Average Minutes Per Match: 0". The rule (`<no_minutes_no_figures>`): a
  player with 0 minutes in a Data View has every performance figure "—".
  The Explorer shows "—" for him.
- **Why it matters:** a real-looking 0 reads as "played and did nothing",
  the exact thing the rule exists to stop.
- **Repro:** open any 0-minute player's profile on the live season. The
  test `profileMatchLog.test.tsx` "M1 …" (`it.fails`) gives
  expected "—", received "0".

### M2 — Repeated Enter during an import creates duplicate squads
- **Confidence:** High. Reproduced, and the code has no guard.
- **Where:** `client/src/pages/TeamBuilder.tsx:647-649, 665-667` (Enter
  calls `handleCreateOrImportSquad`) and `:196-219` (no "already loading"
  check). Only the button is disabled while loading.
- **Now vs should:** with `/api/entry/**` slowed to 2.5 s, typing team ID 1
  and pressing Enter 4 times 100 ms apart gave 13 `/api/entry/1` requests and
  4 identical imported squads. With one blank squad already saved, that hit
  the 5-squad limit, and the picker showed 4 entries you can't tell apart.
  It should import once.
- **Why it matters:** an ordinary impatient press on a slow connection
  fills your squad slots with copies. The limit check reads the squad list
  from before the presses, so enough presses may well go past 5 (not run).
- **Repro:** `audit-output/tmp/A-tb.ts` step 4.

### M3 — Cancel mid-import still imports
- **Confidence:** High. Reproduced.
- **Where:** `TeamBuilder.tsx:186-188` (Cancel only hides the dialog);
  `:216-218` (the running import still calls `upsert` and `setActiveId`).
- **Now vs should:** entry slowed to 3 s, ID 1, Enter, then Cancel after
  300 ms. 0 squads before; 12 s later the imported squad was saved and
  active. Cancel should drop the import's result.
- **Repro:** `audit-output/tmp/A-last.ts`.

### M4 — Team Building forgets the active squad
- **Confidence:** High. Reproduced. Whether it should remember is a
  "same thing, same way" call.
- **Where:** `TeamBuilder.tsx:85`, `useState(squads[0]?.id ?? null)`, not
  saved anywhere.
- **Now vs should:** create squads Alpha, then Bravo (active Bravo). Going
  to /players and back, or reloading, opens the first saved squad instead.
  The Dashboard and Player Comparison keep their picked view
  (`…:selected-view:v1`). Team Building should keep its active squad the
  same way.
- **Repro:** `audit-output/tmp/A-routes.ts` part 3.

### M5 — Side menu's current page doesn't use the selected look
- **Confidence:** High on the CSS. Medium on whether you count "the page
  you're on" as picked.
- **Where:** `client/src/styles/layout.css:90-94` `.nav-link.active`:
  `background: var(--surface-hover)` and
  `border-left-color: var(--accent-positive)`.
- **Now vs should:** computed background rgb(28,38,32) with a green left
  edge on every page. `<selected_state>`: filled `--accent-positive-dim`,
  no green outline. `selectedState.test.ts` checks only 6 selectors, so this
  slipped through.
- **Test:** `selectedState.test.ts` "M5 .nav-link.active" (`it.fails`).

### M6 — Active Notepad tab doesn't use the selected look
- **Confidence:** High.
- **Where:** `client/src/styles/components.css:3579-3582` `.notepad-tab.active`
  (green bottom border, no background; computed rgba(0,0,0,0)).
- **Now vs should:** like M5. It should be the soft-green fill with no
  green line.
- **Test:** `selectedState.test.ts` "M6 .notepad-tab.active" (`it.fails`).

### M7 — One rank formula, five copies, two answers
- **Confidence:** High that they differ. Low impact today, since real pools
  are large.
- **Where:** `metrics/percentiles.ts:39` and `metrics/comparisonMetrics.ts:122`
  (`pool.length <= 1 ? 100`); `metrics/comparativeColour.ts:28/71` (skips
  pools under 2); `metrics/percentiles.ts:54` `percentileInPool` (null
  under 2); `metrics/teamStats.ts:253` (its own copy).
- **Now vs should:** a lone ranked player gets 100 (full green) on the
  profile radar and in Player Comparison, but no rank in the Explorer or
  Dashboard colour. "Same thing, same way": there should be one shared
  helper with one rule.
- **Repro:** code reading. It can't be triggered in the app with today's
  pool sizes.

### L1 — Minutes-floor check written by hand
- **Confidence:** Medium.
- **Where:** `metrics/percentiles.ts:18`, `metrics/profileComparisons.ts:44`,
  `pages/Dashboard.tsx:266`, `components/PlayerDetailOverlay.tsx:566/683/685/849`,
  `pages/PlayerComparison.tsx:399/409`, `understat/comparisons.ts:38`.
- **What it is:** each place writes `minutes === null || minutes < floor`
  instead of calling `isUnderMinimum` (`fixedMinutesFloor.ts:46`). The
  results are the same today, because every fixed floor is ≥ 90. At a
  threshold of 0, `computePositionPercentiles` would drop players with no
  data, where the rule counts them as 0 minutes.

### L2 — Picked Points History season
- **Confidence:** Medium. Code only, not seen in the browser.
- **Where:** `components.css:2585` `button.points-history-col.is-selected`
  (grey `--surface-hover` with a grey inset ring).
- **Should:** the soft-green fill.
- **Test:** `selectedState.test.ts` "L2 …" (`it.fails`).

### L3 — Unused `.btn.active` has a green border
- **Where:** `layout.css`, `.btn.active { …; border-color: var(--accent-positive) }`.
- **What it is:** no component uses it (grep). Anyone who did would get the
  forbidden green outline. Remove it or fix it.

### L4 — New Squad name has no length limit
- **Confidence:** High.
- **Where:** `TeamBuilder.tsx:641-650` (`#new-squad-name` has no `maxLength`;
  every other name box uses `MAX_NAME_LENGTH` = 60).
- **Now:** an 84-character name, typed key by key, is saved. The rename box
  then shows all 84 characters.

### L5 — Over-long team ID gets the wrong message
- **Confidence:** High.
- **Where:** `TeamBuilder.tsx:206` and `:227`.
- **Now vs should:** `99999999999999999999` passes the client check. The
  server answers 400 "Invalid team ID", and the app says "FPL's servers
  didn't answer properly (error 400)… try again in a moment". It should say
  "Enter a valid FPL team ID".

### L6 — Unknown ids in a comparison link take a place
- **Confidence:** Medium.
- **Where:** `pages/PlayerComparison.tsx:187` (cuts to 5 before checking the
  ids exist).
- **Now:** `/player-comparison?players=999999,1,0,abc,2,3,…` shows 4 players
  with no note. A real player is pushed out.

### L7 — Limits not applied to loaded saved data
- **Confidence:** High on the behaviour; the severity is a judgement.
- **Where:** the loaders in `useSavedSquads`, `useSummaryTiles`,
  `useDashboardGraphs`, `useSavedDashboardViews`, `useComparisonViews`,
  `useNotepad`.
- **Now:** seeded stores came back unchanged: 30 squads (limit 5), a
  25-player squad ("£150.0m", no warning), 60 tiles (limit 20), 40 graphs
  (limit 10), 28 Dashboard views, 17 comparison views with 14 cards and 20
  radar metrics, and 20 notepad tabs. Nothing broke. This is only reachable
  through edited or newer saved data.

### L8 — Two gameweek label styles
- **Where:** `components/AppShell.tsx:71-77`.
- **What it is:** "GW 9 · final" between gameweeks; "Gameweek 9" and
  "Gameweek 38 finished" otherwise. Your call.

### L9 — Old hand-marked chip dropped by saved squads
- **Confidence:** High that it's dropped. Low that any install has one.
- **Where:** `state/useSavedSquads.ts:147` (`migrate` ignores the stored
  version) and `normalizeUsedChips`.
- **Now:** an unversioned squad with `usedChips` set to
  `[{wildcard,3},{bboost,null}]` loads as `[{wildcard,3}]`. Git history shows
  nothing wrote `event:null` before v1.128.0, so real impact is unlikely.

### L10 — Exp. Pts (FPL Official) not in the metric dictionary
- **Where:** `metrics/dictionary.ts` (65 entries; the formula lives in
  `expectedPoints.ts` `fplOfficialForFixture` and README).
- **What it is:** every other derived figure has a dictionary formula.
  Documentation only; the figures are unaffected.

### L11 — Dead Exp. Pts breakdown with an outdated rule
- **Where:** `metrics/expectedPoints.ts:203-224` `computeExpPointsBreakdown`
  (only tests use it), and `historicAnalysis.ts`
  `MIN_QUALIFYING_SEASON_MINUTES = 900` / `qualifyingSeasons`.
- **What it is:** it uses 900 minutes, not 855, and rounds games from the
  average season, the rounding removed elsewhere by the 2026-09-25 fix
  (Haaland: 7.33 here vs the app's 7.39). Delete it, or align it before any
  reuse. No figure on screen uses it (README says so; not contradicted).

### L12, L13 — Toolbar Help
- **Where:** `help/guides.tsx:439, 448-454, 452`.
- **What it is:** the guide says "Five icons above the table". Player
  Explorer shows six: Hide sits between Saved views and Export (Team
  Explorer has five). The guide's "Clear filters" line omits what the app's
  own hover says: it also turns Hide off. Read from the live app's labels.

### L14 — "What the icons mean" isn't complete
- **Where:** `help/moreGuides.tsx:96-121`.
- **What it is:** the guide says it covers every icon, but has no row for
  New Squad, Notepad's "Expand to full page" (also absent from the Notepad
  guide), the + Add cards, the Players/Teams scope icons, the ‹ › gameweek
  arrows, or the Notepad tab icons. Every icon button does have hover text.

### L15 — Personal name in Help search words
- **Where:** `help/guides.tsx:322` keyword "vaastav". Also
  `metrics/matchRecordCheck.ts:2` (a comment) and `pages/Legal.tsx:56` (the
  archive credit).
- **What it is:** your "no personal names" rule. The Help keyword isn't
  needed, since "community archive" covers it. Whether the Legal credit must
  stay as an attribution is your call.

### O1 — Profiles and charts load with every page
- **Measured / theoretical:** sizes measured; the gain is theoretical.
- **Where:** `client/src/App.tsx:7-8` (static imports of both profile
  overlays).
- **What it is:** the entry chunk is 1,020,604 B (294 KB gzipped). Page
  chunks are 0.5–69 KB. The entry carries the chart library because the
  overlays import their charts. Lazy-loading the overlays would take roughly
  300–450 KB off the entry for /players, /teams and /team-building. With only
  ~100 ms of total first-load script, expect ≤ 20–30 ms per launch. Low
  priority.

### O2 — No compression
- **Measured.**
- **What it is:** a first /players visit moves 7.6 MB of JSON, which would
  be ~0.8 MB gzipped. On the desktop app's own machine that measures ≈ 0
  gain. No action, unless the app is ever served over a network.

### O3 — Hashed files revalidated each launch
- **Theoretical.**
- **Where:** `server/src/app.ts:67`.
- **What it is:** `/assets/*-<hash>` is served `max-age=0`, so there are
  about 13 conditional requests per launch at ~1–2 ms each. Negligible; do
  it with O1 or skip it.

### O4 — Profile reopen refetches
- **Measured; small gain.**
- **Where:** `state/usePlayerHistory.ts:52-88`.
- **What it is:** opening the same player twice made 2 element-summary
  requests and showed a brief loading state. Understat's profile is cached
  on the client after the first open. A per-player cache, cleared on
  refresh, would match it.

Measured and not worth acting on: a closed player profile still works out
the whole pool 3× when data changes (≈ 0.1 ms).

## 5. To verify (not defects)

| ID | What | Why it's unproven |
|---|---|---|
| V1 | Pressing Try again while the first whole-pool history build is still running may start a second build, and whichever response lands last wins (`AppStateContext.tsx:393-411`) | Code reading only. Not run, because it would send ~670 requests to FPL |
| V2 | An install from before saved views existed (tiles store v≤2, no views key) upgrading straight to today may open on a blank My View and lose its tiles | That exact upgrade wasn't seeded; it depends on whether such an install ever shipped |
| V3 | Deleting a tile whose statistic no longer exists | The script's confirm click timed out (likely the selector) |
| V4 | Exp. Pts (FPL Official) season rate during a live gameweek may count that gameweek's unplayed matches in its denominator (`usePlayerForecasts.ts:105`) | Not traced |
| V5 | Profiles always open in Last Season, whatever the page's Data View (deliberate in code) | Your call on "same thing, same way" |
| V6 | Arsenal's FPL xGC 7.27 vs Gabriel's 7.23 over the same full-90 matches | Likely FPL's own rounding of two different fields; not traced |
| V7 | A player's DC/Game shows 2 decimals and reaches the teens (Cook 14.30); clubs' DC/Game is whole | Borderline under the whole-numbers rule; your call |
| V8 | A player's Starts and Mins are coloured, while clubs' Played and Draws aren't | Depends on whether "played" covers Starts and Mins |
| V9 | Starter Dashboard tiles are wired for Hide, which the rule gives only to tiles you build | Never visible today, because Starter tiles have nothing under the floor |
| V10 | Help says player Starts begin in 2022/23; README:580 says 2023/24 | Needs a data check |
| V11 | Clearing a squad's name saves "" (the placeholder "Untitled squad" shows) | How the picker shows it wasn't checked |
| V12 | A fresh Dashboard opens on the blank My View, not the Starter | Already left to you by the 2026-10-23 run; still the case |

Not a defect: the package `name` and the `appId` still say "fpl". CLAUDE.md
says never to change them.

## 6. Recommended fix order

1. **M2 + M3** together (one import at a time, and Cancel drops it). They
   make real duplicate or unwanted squads; small change, low risk.
2. **M1**: a null-not-0 rule breach on a core page; small, guarded by the
   new test.
3. **M5, M6, L2, L3**: CSS only. Add their selectors to the
   selected-state test's list as they're fixed.
4. **M4**: needs a saved-data change (a version bump and a `migrate()` step).
5. **M7 + L1**: one shared rank helper and `isUnderMinimum` everywhere; a
   refactor, so do it on its own with the full check.
6. Lows L4–L6 and L12–L15 (small, independent); L7, L9, L10, L11 when
   nearby.
7. O1 (with O3) if you want a lighter start-up; O4 optional; O2 none.
8. V items: your decisions on V5, V7, V8, V12; a check each for V1–V4, V6,
   V10, V11.

## 7. Tests added

- `client/src/components/profileMatchLog.test.tsx` — "M1 <no_minutes_no_figures>:
  a season with 0 minutes in every match shows — in Totals and Average,
  never 0" (`it.fails`). Run once as a plain test first: it failed with
  expected "—", received "0", so it fails for the right reason.
- `client/src/styles/selectedState.test.ts` — M5 `.nav-link.active`,
  M6 `.notepad-tab.active` and L2 `button.points-history-col.is-selected`:
  filled soft green, no green edge of any kind (`it.fails`). The edge check
  matches `border-left-color`/`border-bottom-color`, which the existing
  check doesn't.

Each will start failing once its defect is fixed; then switch it to `it`.

## 8. Final check

`npm run check`: build ok (18 s); server 163/163, client 1447/1447,
electron 6/6. The +4 are the tests above.

## 9. Cost

- **Helper missions:** 7 (A Pressure, B Consistency, B2 a second
  consistency sweep for what B's cap cut off, C Numbers, D Saved data,
  E Optimisation, F Docs), all against one shared built app on :4199.
- **Probes:** the full probe run, the selftest and one extra monkey seed.
- **Skipped to stay in budget:**
  - Not reached by any helper:
    - the player-seasons and event routes (failure handling);
    - the three players' figures in Player Comparison and Team Building;
    - the ⇄ toggle and Hide on Dashboard tiles and Comparison cards in the
      browser;
    - view-stopwatch colours on tiles;
    - whole words on tiles, Comparison cards and pitch cards;
    - React re-render counts;
    - a real summer id renumbering;
    - the notepad's v1 shape.
  - Tile and graph limits were checked in code and Help, not driven through
    the screen.
- **Lead:** about 45 of its own tool calls; no screenshots.
