# Full App Audit — Phase 1 (Forensic) — 2026-10-18

**Scope:** full app. **Baseline:** commit `3b61448`, version `v1.82.1`. That
is 36 commits and 16 releases since the last audited release (v1.66.1).
**Method:**
- Read CLAUDE.md, the README, the User Guide, `docs/audits/README.md` and the
  2026-09-25 run.
- Ran the app under `npm run dev` (ports 4000/5173) and its production build
  (port 4400), against the live 2026/27 API: GW7 in progress, GW6 finished,
  667 players.
- Drove both with throwaway Playwright scripts. Each check used a fresh
  browser context; all scripts lived in scratch space outside the repo.
- Six helpers read the code area by area, at the same time:
  - data layer and server
  - calculations
  - Team Building
  - saved data
  - Understat
  - pages and docs

  Each helper finding below was checked by me against the code, the live
  data or a test before it went in. Both servers were stopped at the end.

The helpers were stopped early by a usage limit, so some corners got a
lighter pass than the audit terms ask for. Section 9 lists them.

---

## 1. Summary for the owner

**What was checked:**
- every page in all three Data Views
- every saved-data store
- the Understat source added this morning
- the Team Building model
- the server and its caching
- the docs against the app

**Found fine:**
- No page crashed or showed "NaN", "Infinity" or "undefined" in any Data View.
- There were no console errors.
- Losing the live API gives a clear error and a working "Try again".
- Losing the historic data gives a Retry, not a false "no data".
- An unknown player address says "Player not found".
- Notepad keeps its notes after a restart.
- The production build fetches each endpoint once, however many pages you
  visit.

**Figures recomputed by hand from FPL's raw data all matched**:
- All seven Starter Dashboard player tiles (2025/26 totals, today's price, the
  450-minute floor).
- This season's club figures for all 20 clubs: played, goals, points, xG, xGC
  and DC, summed from FPL's own match-by-match data.
- A full Model Predicted estimate for Gabriel: 4.1522 by hand, 4.1522 from
  the app.

**Findings:** 1 Critical, 3 High, 20 Medium, 18 Low, 10 to verify.

The ones that matter most:

1. **C1: deleting a Dashboard view wipes your My View.** You build tiles in
   My View, create a second view, then delete that second view. My View now
   holds the deleted view's tiles, and your own are gone for good. I
   reproduced this in the running app. It came in with My View on
   2026-09-29.
2. **H1: during a live gameweek, Team Building's GW+1 points at a match that
   has already been played.** FPL only marks a match "finished" hours after
   full time.
   - Until it does, the app counts it as upcoming. So GW+1 shows Haaland
     against Ipswich, a match played yesterday.
   - The FPL Official figure is FPL's estimate for the *next* gameweek, so it
     is attached to the wrong match. Each later step is shifted by one.
   - This applies most weekends, which is when you pick transfers.
3. **H2 and H3: the Understat checks are looser than your rule.** Your rule:
   the sync stops and alerts you if Understat disagrees with FPL on goals.
   What happens:
   - Up to 0.5% disagreement only produces a warning: the data is published
     and no alert is raised (H2).
   - Matches newer than the club-history archive (archived twice a week) are
     published without being compared with FPL at all. This morning that was
     5 of 65 matches (H3).
   - No wrong figures are in the app today: all 439 linked players' goals
     agree with FPL. The safety net is weaker than described, though.
4. **Saved data that can break:**
   - One damaged entry in the Dashboard's saved views or tiles throws the
     whole store away (M7).
   - One damaged saved squad blanks the Team Building page (M8).
   - Saved squads and "track these players" tiles store FPL's player and
     club numbers. FPL renumbers those every summer, so after the 2027/28
     reset they will silently point at different players and clubs (M6).
5. **Club figures run a round behind players' during a gameweek** (M1). Five
   GW7 matches ended at full time yesterday, but FPL hasn't marked them
   finished. Player totals include them; the league table and club totals
   don't.
   - Chelsea shows 10 points; with yesterday's win it's 13.
   - Even after FPL confirms them, club figures don't update for up to 12
     hours unless you press Refresh.
6. **Display problems that could mislead:**
   - On a "Lowest First" tile the leader gets the *shortest* bar (M16).
   - A defender's total xGC tile turns greener the less he plays (M13).
   - Seasons before 2022/23 show FPL's placeholder 0 starts and 0.00 xG as
     real figures, e.g. "0 starts in 3,420 minutes" (M14).

**What I need from you (decisions, not fixes):**
- M1: whether club figures should count matches at full time before FPL
  confirms them.
- M12: ownership currently lowers every low-owned player's predicted
  minutes. Is that intended?
- V1: should Historic Average count at least one game per season played?

---

## 2. Baseline

| | |
|---|---|
| Commit | `3b61448` (clean tree) |
| Version | `v1.82.1` (latest tag) |
| `npm run build` | Passed. Only Vite's existing "chunk larger than 500 kB" notice (`index-*.js` 733 kB) |
| `npm test` | Passed: server 11 files / 88 tests, client 51 files / 504 tests (592 total) |
| Live data | GW7 is current and in progress (5 matches at full time but not `finished`, 5 not started); GW6 finished; 667 players; historic bulk 667 players, 0 skipped, 220 club-seasons |

---

## 3. Master index

| ID | Severity | One line |
|---|---|---|
| C1 | Critical | Deleting a Dashboard view overwrites My View's saved tiles and graphs with the deleted view's |
| H1 | High | Team Building GW+1..GW+5 counts played-but-unconfirmed matches as upcoming; FPL Official GW+1 is attached to the wrong match |
| H2 | High | Understat sync publishes, without alert, when up to 0.5% of player-matches disagree with FPL on goals |
| H3 | High | Understat matches newer than the club-history ledger are published without any FPL check |
| M1 | Medium | Club figures leave out matches at full time but not yet `finished`, and stay up to 12 h old after; two league tables can disagree |
| M2 | Medium | One invalid record in historic-bulk, fixtures or a gameweek log fails that whole dataset (README promises per-record) |
| M3 | Medium | Stale fixtures, and a refresh that silently fell back to stale data, are shown as current |
| M4 | Medium | A player skipped by the historic build makes his clubs' live-season totals partial sums, unflagged |
| M5 | Medium | Desktop app: no single-instance lock or port-error handling; port from `PORT` env changes the saved-data origin |
| M6 | Medium | Saved player/club ids aren't season-safe; after the 2027/28 reset they will point at different players and clubs |
| M7 | Medium | One unreadable entry in saved views or summary tiles makes the whole store fall back to defaults and be overwritten |
| M8 | Medium | A malformed saved squad crashes the Team Building page |
| M9 | Medium | A saved starter no longer in FPL blocks the 11th XI slot and can't be removed |
| M10 | Medium | Importing a Bench Boost gameweek puts all 15 players in the starting XI |
| M11 | Medium | Next-round availability (e.g. a one-match ban) zeroes all five navigator steps |
| M12 | Medium | Ownership lowers every low-owned player's predicted minutes by up to 15% (owner decision) |
| M13 | Medium | Total xGC is ranked "lower is better", so fewer minutes give a greener tile and percentile |
| M14 | Medium | Pre-2022/23 starts and xG-family placeholder zeros are shown as real values |
| M15 | Medium | Team Explorer filters in Historic Average compare raw means, not the figure shown |
| M16 | Medium | On a Lowest First tile, the top row gets the shortest bar |
| M17 | Medium | Reset on the Explorers keeps sorting by a column Reset just hid |
| M18 | Medium | Understat's amber "out of date" dot never appears when the sync has stopped writing |
| M19 | Medium | An Understat `never` override doesn't break an existing confirmed link |
| M20 | Medium | The Understat separation test can be bypassed by several import forms |
| L1–L18 | Low | See §5 |
| V1–V10 | Verify | See §6 |

---

## 4. Findings in detail

Format for each finding: **Where** · **Now** · **Should** · **Why it matters** · **Reproduce**.

### Saved data (Audit 8)

**C1 — Deleting a Dashboard view overwrites My View.**
- **Severity / confidence:** Critical (lost user data). Confidence High: reproduced in the running app and by a test.
- **Where:** `pages/Dashboard.tsx`: `handleDeleteSelectedView` (~l.555), and the live-sync effect (~l.446–451); `state/useSavedDashboardViews.ts` `remove()` (l.300–316).
- **Now:** `remove()` moves the selection to My View, but nothing loads My View's tiles and graphs onto the screen. `hydratedScopes` is already true, so the on-screen copy is still the deleted view's. The live-sync effect then writes that copy into My View.
- **Should:** My View keeps its own contents (README "Saved data": selection "falls back to My View"). The deleted view's contents go with it.
- **Why it matters:** silent, permanent loss of everything built in My View, in either scope. The confirmation dialog says "Delete 'Foo' and all its tiles and graphs?" and says nothing about My View.
- **Regression:** introduced in `1a4ecb6` (2026-09-29). Before that, delete fell back to Starter, which re-syncs the screen.
- **Reproduce** (live app, fresh browser):
  1. In My View, add tile "MINE A".
  2. Create View "Foo" and add tile "FOO B".
  3. Delete View, then Delete.
  - Actual: My View shows "FOO B". After a reload, the store holds `["My View",["FOO B"]]`.
  - Expected: My View holds `["MINE A"]`.
- **Tests:** `pages/Dashboard.storage.audit1018.test.tsx` and `pages/Dashboard.audit1018.test.tsx`, both `it.fails`.

**M6 — Saved ids aren't season-safe.**
- **Severity / confidence:** Medium. Confidence High that FPL ids change. Not triggered until the 2027/28 reset.
- **Where:** `playerIds`, `teamIds`, `criteria.teamId` in `useSummaryTiles.ts` / `useDashboardGraphs.ts` (and the copies inside saved views); `SavedSquad.playerIds`, `startingXI`, `captainId`, `viceCaptainId` (`types/team.ts`, `useSavedSquads.ts`). No store records a season.
- **Now:** FPL renumbers players and clubs each summer:
  - Live id 430 is Mount today; it was Haaland in 2025/26 (Haaland is 411 now).
  - Id 381 was Salah (code 118748) in 2025/26; it is Koumas (code 514514) now.
  - Team id 14 was Man Utd in 2025/26; it is Liverpool now.

  After the reset, a "track these 5 players" tile, a saved squad or a team-filtered tile silently shows different players or clubs.
- **Should:** warn or fall back, never silently substitute (CLAUDE.md "Graceful degradation"). The stable `code` exists for this purpose.
- **Why it matters:** wrong players shown as if correct, in Team Building and on tiles.
- **Reproduce:** compare a saved id against last season's and this season's bootstrap.

**M7 — One bad entry wipes a store.**
- **Severity / confidence:** Medium. Confidence High: proven by tests.
- **Where:** `useSavedDashboardViews.ts` `SAVED_VIEWS_STORE.migrate`, where `views.map(v => v.id)` throws on a `null` entry; `useSummaryTiles.ts` `normalizeSummaryTile` (same pattern in `normalizeDashboardGraph`).
- **Now:** the throw is caught in `loadVersioned` (`persistentStorage.ts:51`), which returns the fallback. The save effect then writes the fallback over the stored data.
- **Should:** skip the unreadable entry and keep the rest, as `useComparisonViews` and `useNotepad` already do.
- **Why it matters:** low likelihood (needs a damaged file), but when it happens every user view or tile is lost for good.
- **Reproduce:** set `saved-views` to `{"version":6,"data":[<valid view>,null]}` and reload. Only Starter and My View remain.
- **Tests:** `state/savedData.audit1018.test.tsx`, two `it.fails`.

**M8 — A malformed saved squad crashes Team Building.**
- **Severity / confidence:** Medium. Confidence High: proven by test.
- **Where:** `useSavedSquads.ts` `migrate()` checks only `Array.isArray` and ignores `storedVersion`; `TeamBuilder.tsx` `squadPlayers` calls `active.playerIds.map`. The app has no error boundary.
- **Now:** `[{id:"s1",name:"Broken"}]` throws "Cannot read properties of undefined (reading 'map')" and the page blanks. Data from a newer version is loaded unchecked and re-saved stamped v1.
- **Should:** repair or drop the bad entry with a warning.
- **Why it matters:** the page goes blank.
- **Reproduce:** load the bad entry above into the saved-squads store.
- **Test:** `pages/TeamBuilder.audit1018.test.tsx`, `it.fails [TB-3]`.

**M9 — A saved starter no longer in FPL blocks the 11th slot.**
- **Severity / confidence:** Medium. Confidence High: proven by test.
- **Where:** `TeamBuilder.tsx` `toggleStartingCore` counts raw `startingXI` ids; missing players are filtered out of the display (l.~682).
- **Now:** the pitch shows 10 cards and says "10 of 11", but nothing can be added. The ghost can't be removed except with Clear Draft, which wipes the squad. A ghost captain silently stops captain doubling.
- **Should:** a missing item is flagged and removable (audit terms, Audit 8).
- **Why it matters:** the squad can't be completed without wiping it.
- **Reproduce:** save 10 real starters plus id 9999.
- **Test:** `it.fails [TB-5]`.

### Team Building and Expected Points (Audit 3)

**H1 — The navigator counts played matches as upcoming during a gameweek.**
- **Severity / confidence:** High. Confidence High: live data plus test.
- **Where:** `metrics/fixtureTicker.ts:20` `getUpcomingFixtures` filters `!f.finished` only. It feeds `fixturesByTeamId`, `expectedPointsByPlayerId` and `pickerBuiltRows` in `TeamBuilder.tsx`.
- **Now:** live today, five GW7 matches are at full time with `finished_provisional: true` but `finished: false`:
  - EVE 0–2 CHE, BRE 1–2 LIV, FUL 1–0 HUL, MCI 3–2 IPS, NEW 0–1 AVL.

  Their clubs' GW+1 is that played match. Haaland's GW+1 is "vs IPS", the 3–2 on 17 Oct.
- **The FPL Official figure is shifted too:** Tier 1's GW+1 is `ep_next`, which FPL gives for the next gameweek, GW8.
  - Proof: Janelt is "Suspended until 31 Oct", with `ep_this` 1.7 and `ep_next` 0.0.
  - So GW+1 pairs GW8's estimate with a GW7 match, and every later step is a gameweek out.
- **Clubs disagree:** once FPL marks a club's match finished, that club's GW+1 jumps to GW8 while others stay on GW7. The same "GW+1" means different gameweeks for different players.
- **Should:** the Nth upcoming fixture (README, User Guide) is one not yet kicked off, aligned with the `is_next` event that `ep_next` describes.
- **Why it matters:** both Expected Points figures are mislabelled and shifted from each deadline until the round is confirmed, which is when users choose transfers and captains.
- **Reproduce:** see above, or the test `metrics/expectedPointsV2.audit1018.test.ts`, `it.fails [TB-1]`.

**M10 — Bench Boost import fills the XI with 15 players.**
- **Severity / confidence:** Medium. Confidence Medium: the code path is certain; FPL's live bboost picks shape wasn't fetched.
- **Where:** `normalize/normalizeEntryImport.ts:44`, `inStartingXI = multiplier > 0`.
- **Now:** under Bench Boost the bench has multiplier 1, so all 15 are imported as starters.
- **Should:** use `position <= 11`.
- **Why it matters:** an imported squad is wrong from the first moment.
- **Test:** `it.fails [TB-4]`.
- **Related (Low):** a Free Hit week imports the temporary squad.

**M11 — One round's availability zeroes all five steps.**
- **Severity / confidence:** Medium. Confidence High: code trace.
- **Where:** `minutesReliabilityBlend.ts` `availabilityModifier`; `expectedPoints.ts` (later steps scale `ep_next`).
- **Now:** Janelt (a one-match ban, back for GW9) gets 0 for GW+1..GW+5 in both models.
- **Should:** availability limited to the fixture it applies to, or the limit documented in the README and User Guide.
- **Why it matters:** a one-game ban looks like a month out.
- **Reproduce:** Janelt in Add Players, across GW+1..GW+5.

**M12 — Ownership lowers predicted minutes for every low-owned player.**
- **Severity / confidence:** Medium. Confidence High: computed.
- **Where:** `minutesReliabilityBlend.ts` (`OWNERSHIP_WEIGHT` 0.15, `OWNERSHIP_FULL_CONFIDENCE_PCT` 30).
- **Now:** a full-minutes player owned by 0.6% (Silva, BOU) gets reliability ≈0.853 instead of ≈1.0. That cuts every rate part of Model Predicted by ~15% and clean-sheet and appearance value by ~21%. The code comment says ownership is for thin-data cases, but it applies to everyone. README's "Current ownership adds 15%" reads as a bonus.
- **Should:** owner decision. A popularity figure is being used as a minutes input.
- **Why it matters:** differentials are systematically under-predicted.
- **Reproduce:** compare Silva's reliability with a 30%-owned player who has the same minutes record.

### Data source and server (Audits 1, 11)

**M1 — Club figures lag players' figures during a gameweek.**
- **Severity / confidence:** Medium. Confidence High: live data.
- **Where:** `server/src/clubHistory/aggregate.ts:167` and `normalize/deriveTeamStandings.ts:83` (finished only); historic bulk is cached 12 h (`config.ts`).
- **Now:** the five full-time GW7 matches above count in players' Current Season totals (bootstrap includes them) but not in any club figure. Every club shows P6:
  - CHE 10 pts (13 with yesterday's win)
  - LIV 9 (12)
  - AVL 5 (8)
  - MCI 18 (21)

  After FPL confirms them, the 10-minute poll refreshes fixtures-based standings (`applyRealTeamStandings`) but not the historic-bulk club figures. Those wait up to 12 h or for Refresh, so two league tables can disagree.
- **Should:** README documents "finished fixtures only", so the rule itself isn't wrong. What's missing is a decision, or at least a label, on the lag and the two sources.
- **Why it matters:** the league table and club totals look current but are a round behind.
- **Reproduce:** compare `fixtures` event 7 with the 2026/27 `clubSeasons` in `/api/historic-bulk`.

**M2 — One invalid record fails a whole dataset.**
- **Severity / confidence:** Medium. Confidence High: tests.
- **Where:** `api/client.ts:52,59,73`. `validate()` checks the whole fixtures / element-summary / historic-bulk payload as one unit.
- **Now:**
  - One bad `history_past` season breaks every Historic and Last Season view and all club figures.
  - One bad fixture empties the fixtures list without a warning.
  - One bad gameweek row fails that player's profile.

  Only bootstrap `elements` are checked one at a time.
- **Should:** README "Architecture": "per-record: a bad record is skipped and counted, never fatal".
- **Why it matters:** one odd FPL record can blank large parts of the app.
- **Tests:** `validation/schema.audit1018.test.ts`, two `it.fails [DATA-2]`.

**M3 — Stale data shown as current.**
- **Severity / confidence:** Medium. Confidence High from the code; not reproduced live.
- **Where:** `AppStateContext.tsx:188-189` ignores `fixturesResult.source`; `loadHistoric` (l.235–246) ignores `result.source`; `routes/historicBulk.ts:73–117` accepts `stale-cache` results inside a build.
- **Now:**
  - Stale fixtures raise no banner.
  - A refresh during an FPL outage can be built from cached element-summaries, labelled `source:"live"` and cached for 12 h. It never counts toward the more-than-half-failed rule.
- **Should:** README: stale data is "never presented as current".
- **Why it matters:** old figures presented as fresh.
- **Reproduce:** after one good build, make upstream return 5xx and POST `/api/refresh/historic-bulk`. You get `meta.source:"live"` with old data.

**M4 — Skipped players make partial club totals.**
- **Severity / confidence:** Medium. Confidence Medium: code reasoning; today `skippedPlayerIds` is empty.
- **Where:** `historicBulk.ts:123–141`, `aggregate.ts:189`.
- **Now:** a skipped player's ledger rows are simply missing, so his clubs' goals, points, xG and DC become partial sums shown as full. The skipped-player warning only shows outside Current Season (`AnalysisModeToggle.tsx:78`), the only mode built from the live season.
- **Should:** README "Gaps": "never a part-season sum".
- **Why it matters:** club totals can be quietly short.
- **Reproduce:** run `aggregateClubSeason` with one scorer's rows removed. Goals drop and nothing flags it.

**M5 — Desktop instance and port handling.**
- **Severity / confidence:** Medium. Confidence Medium: code read, not run.
- **Where:** `electron/main.js:21,52–58`.
- **Now:**
  - There is no `requestSingleInstanceLock()`, and `listen()` has no `'error'` handler. A second launch, or another program on 4317, gives EADDRINUSE: an uncaught exception and no window. Update checks are already running by then, so a second copy can still `quitAndInstall`.
  - `PORT` comes from the environment. The port is part of the localStorage origin, so a user with a `PORT` variable sees all saved data "lost".
- **Should:** fail clearly, never lose the user's saved data (CLAUDE.md "Graceful degradation").
- **Why it matters:** the app can fail to start, and saved data can look lost.

### Calculations (Audit 2, 9)

**M13 — Total xGC rewards playing less.**
- **Severity / confidence:** Medium. Confidence High: recomputed with the app's own modules.
- **Where:** `playerColumns.tsx:58` (xGC `higherIsBetter:false`); `PlayerDetailOverlay.tsx:228`.
- **Now:** a total grows with minutes, so flipping it ranks bench players best. Current Season, DEF, ≥90 min:
  - Keane: 90 min, 1.33/game → **95th** (Excellent).
  - Guéhi: 630 min, 1.41/game → **14th** (Poor).
  - Senesi (2.22/game) ranks above Gabriel (0.78/game). Hand check on Gabriel: 4.65 ÷ ceil(540/90) = 0.78.
- **Should:** README: the floor exists "to stop tiny samples taking over". Rank on the rate, or don't tint a lower-is-better total.
- **Why it matters:** a bench defender reads as elite and a starter as poor. This affects profile tiles, table tints and Comparison.
- **Reproduce:** the Current Season DEF figures above.

**M14 — Placeholder zeros before 2022/23 shown as real.**
- **Severity / confidence:** Medium. Confidence High: live `history_past`.
- **Where:** `normalize/normalizeElementSummary.ts` `normalizePastSeasons` (l.67–91). DC is nulled before 2024/25; starts and `expected_*` are not.
- **Now:** Pickford 2016/17–2021/22: minutes 2610 / 3420 / 3420 / 3420 / 2742 / 3150, starts 0 every season, xGC "0.00". In 2022/23: 37 starts, xGC 66.41. These zeros show, and are tinted, in the profile's Points History table and in Comparison trends (Starts, xG, xA, xGI, xGC and their per-game versions). Historic Average isn't affected: its window starts at 2022/23.
- **Should:** CLAUDE.md: "never fabricate… null and '—', never 0".
- **Why it matters:** impossible figures such as "0 starts in 3,420 minutes".
- **Reproduce:** Pickford's Points History table, or a Comparison trend of Starts.
- **Test:** `normalize/normalizeElementSummary.audit1018.test.ts`, `it.fails`.

### Filters, sorting and UI (Audits 5, 6)

**M15 — Team Explorer filters in Historic Average.**
- **Severity / confidence:** Medium. Confidence High: test.
- **Where:** `components/teamColumns.tsx` declares `decimals` only on xG/xA/xGI/xGC.
- **Now:** Historic Average means are compared raw. "= 66" on Goals For misses a club shown as 66 (mean 65.75), and "= 2" on League Position misses one shown as 2nd (2.25).
- **Should:** README: "Filters compare a value as displayed" (`roundAsDisplayed`).
- **Why it matters:** a filter hides clubs the table shows as matching.
- **Reproduce:** Team Explorer, Historic Average, filter Goals For "=" the figure shown for a club whose mean isn't whole.
- **Test:** `components/teamColumns.audit1018.test.tsx`, two `it.fails`.

**M16 — Bars inverted on Lowest First tiles.**
- **Severity / confidence:** Medium. Confidence High: test.
- **Where:** `TopList.tsx` / `TeamTopList.tsx` `barWidthPercent` (|value| ÷ largest |value|).
- **Now:** values 1, 2, 4 draw 25%, 50%, 100%. A League Position, Price, Goals Against or xGC tile gives the leader the shortest bar.
- **Should:** User Guide: "the top row's is full length, so a shorter bar shows how far behind that row is".
- **Why it matters:** the best row looks furthest behind.
- **Test:** `it.fails [PAGES-TILE-BAR]`.

**M17 — Reset keeps a hidden sort.**
- **Severity / confidence:** Medium. Confidence High: code trace.
- **Where:** `PlayerExplorer.tsx` (~l.557), `Teams.tsx` (~l.254). Reset never touches `sort`; `sortWithoutHiddenColumn` is only called on toggle.
- **Now:** turn on xGC, sort by it, then Reset. Rows stay ordered by the now-hidden xGC and no header shows an arrow.
- **Should:** README: a hidden column drops out of the sort and the page default takes over.
- **Why it matters:** rows are in an order the user can't see or undo.
- **Reproduce:** the steps above.

### Understat (Audits 1, 10)

**H2 — Small goal disagreements pass silently.**
- **Severity / confidence:** High. Confidence High: code.
- **Where:** `server/src/understat/pipeline/checks.ts:31,105–110` (`MAX_GOAL_DIFFERENCE_SHARE = 0.005`).
- **Now:** disagreements at or under 0.5% of a season's player-matches are a warning only. Warnings raise no alert (`understat-sync.yml:93–99`), so the run writes, commits and closes any open issue as clean. That is up to ~50 per completed season, or ~6 in the live season so far.
- **Should:** CLAUDE.md Data rule 2: the sync "stops (writes nothing) if Understat… disagrees with FPL on scores or goals, and alerts me". README step 5 says the sources agree on "every linked player's goals".
- **Why it matters:** a wrong link can go live with nobody told.
- **Reproduce:** `checkAgainstFpl` with 1 differing goal in 300+ compared player-matches gives `errors: []` and one warning.

**H3 — Matches newer than the ledger are published unchecked.**
- **Severity / confidence:** High. Confidence High: committed data.
- **Where:** `sync.ts:192–206`, `pairing.ts:120–141`, `aggregate.ts:36–39`.
- **Now:** the FPL side of every check is `data/club-history/<season>`, archived Tue/Fri only. Understat results with no ledger fixture aren't checked, but `buildAppSeason` still sums them. Today: ledger 60 fixtures (GW1–6), `app/2026-27.json` `matchesIncluded: 65`. Five GW7 matches went out unchecked. They are in fact correct: 439 linked players, 0 goal differences against live bootstrap. The "Understat 2+ days behind" alert can also arrive 4–6 days late.
- **Should:** publish only matches that have been paired and checked (rule 2), or check against live FPL.
- **Why it matters:** for up to four days at a time, published matches have had no FPL check.
- **Reproduce:** compare the ledger's fixture count with `matchesIncluded`.

**M18 — The amber "out of date" dot never fires for a stopped sync.**
- **Severity / confidence:** Medium. Confidence High.
- **Where:** `client/src/understat/UnderstatProvider.tsx:79–85`.
- **Now:** the dot comes only from a failed fetch or from `missingFixtures`. A failed sync writes nothing, so `status.json` stays frozen with `{}`, and weeks of block show no dot. The alert text (`scripts/understat/sync.ts:62`) promises the dot.
- **Should:** README: the dot "means its data is out of date or unavailable".
- **Why it matters:** old Understat figures read as current.
- **Reproduce:** keep today's `status.json` and advance the clock; the note stays null.

**M19 — `never` override doesn't break an existing link.**
- **Severity / confidence:** Medium. Confidence High: test.
- **Where:** `matcher.ts` `linkSeason`. `never` is checked only for new candidates (l.189, 243), not for saved links (l.146–168).
- **Now:** a saved confirmed link stays confirmed after `never` is added.
- **Should:** `types.ts:135`: "never" forbids a link on every run.
- **Why it matters:** the owner's manual fix for a wrong link (e.g. the two Arsenal Gabriels) does nothing, and the wrong figures stay live.
- **Test:** `server/src/understat/pipeline/matcher.audit1018.test.ts`, `it.fails`.

**M20 — The separation test can be bypassed.**
- **Severity / confidence:** Medium. Confidence High: test.
- **Where:** `client/src/understat/separation.test.ts:18–29`.
- **Now:** the regex misses these import forms:
  - side-effect imports (`import "../understat/x.css"`)
  - `import (` with a space
  - template-literal imports
  - `require()`

  It scans only `.ts`/`.tsx`, and only import paths. No violation exists today: a grep finds Understat only on the marked lines in `App.tsx`, `server/src/app.ts` and `server/src/index.ts`.
- **Should:** CLAUDE.md says the test "enforces" the separation.
- **Why it matters:** a future change could break the rule with the test still green.
- **Test:** `client/src/understat/separation.audit1018.test.ts`, 4 `it.fails`.

---

## 5. Low findings

| ID | Where | Finding |
|---|---|---|
| L1 | `state/useSummaryTiles.ts:108–109`, `Dashboard.tsx` `displayTileTitle` | Since `3576c06` dropped "Top 5/Bottom 5", the two Starter tiles are both titled "Goals vs xG (Goals − xG)" (one Highest First, one Lowest First); only the signs tell them apart. Any user tile ordered Lowest First has the same issue |
| L2 | `AppStateContext.tsx:216`, `cache.ts` | Poll and cache are both 10 min with the TTL starting on response, so every other poll gets the cached snapshot: live figures refresh ~every 20 min, not 10 (User Guide l.155). Test `server/src/proxy.audit1018.test.ts` `it.fails [DATA-3]` |
| L3 | `httpClient.ts:223–235` | Body read has no timeout (`clearTimeout` before `res.json()`); a JSON parse error on a 200 is retried, though policy is network/5xx only |
| L4 | `validation/schema.ts`; `normalizeEntryImport.ts:184` | Zod defaults would invent values if a field disappeared: `ep_next` "0.0", FDR 3, `status` "a", gameweek-row stats 0; a missing bank becomes 0. Not triggered today (all fields present) |
| L5 | `metrics/resolvePlayerStats.ts` | `saves`/`savesPerGame` aren't resolved per Data View or zeroed pre-season; no Data View page shows them today |
| L6 | `metrics/dictionary.ts:277` | DC units say "defensive contribution points"; it's a count of actions (Haaland 2025/26: CBI 48 + tackles 15 + recoveries 41 = 104 = `defensive_contribution`) |
| L7 | `utils/format.ts` `fmtSigned` | A tiny negative shows "-0.00", coloured red; uses `toFixed` unlike the other formatters |
| L8 | `Teams.tsx:149`, `TeamBuilder.tsx:863` | Nulls sort "last" always, unlike Player Explorer's "below zero"; README says the shared engine sorts nulls as lowest |
| L9 | `UserGuide.tsx` | (a) Dashboard says player tiles have their own Search; the dialogs have no Search box (Player Search and a price range instead, the latter undocumented). (b) Outputs: for xGC the tinted stretch is how far a player is *behind*, not ahead. (c) `?players=` isn't capped at 5 or de-duplicated (duplicate React keys, colours wrap). (d) "Shift-click to add a tiebreaker" can't add the Player name column |
| L10 | `pages/Dashboard.tsx` | 1,563 lines; tile and graph dialogs duplicate their pickers; the chained effects (l.446–498) are what allow C1; a comment still says delete "falls back to Default" |
| L11 | `expectedPointsV2.ts`, `minutesReliabilityBlend.ts` | README says every weight is a named constant with its reasoning; several aren't named there: base CS rate 0.28 and its sensitivity and clamp, FDR sensitivities per position, consistency retention 0.65, recency weights, ownership 30%, status defaults, DC thresholds 10/12 |
| L12 | README "Analysis modes" | Says the 900-minute bar "gates Expected Points' reliability"; it actually gates Tier 2's bonus rate (`qualifyingSeasons`), and reliability uses every season. `computeExpPointsBreakdown` has no importers |
| L13 | `TeamBuilder.tsx` | "Clear every picker filter" hover text mentions price; the picker has no price filter |
| L14 | `SquadPitch.tsx` | README says Tier 2 caveats are "shown on hover"; on pitch cards the hover is fixed text with no caveats |
| L15 | `UnderstatProvider.tsx:69` | After `control.json` is switched off, the hourly reload stops, so switching it back on needs an app restart |
| L16 | `PlayerExplorer.tsx:276–281`, `Teams.tsx:71–76` | If Understat disappears mid-session, a column switched to it falls back to FPL but keeps its Understat-based filter |
| L17 | `understat-sync.yml:63–106` | A failed `git push` still reports `ok:true`, so the alert step closes the issue as clean |
| L18 | README "API endpoints and caching" | "It never runs at startup": the Dashboard (the landing page) requests the historic build on mount, so it runs at every start (measured: request at 0.37 s, done at 1.2 s, cold). Cheap, but the README is untrue |

---

## 6. Needs verification (not counted as defects)

| ID | Item |
|---|---|
| V1 | Historic Average games come from total minutes (owner rule, 2026-09-25). For a multi-season cameo player that can be fewer games than seasons played: Esse 138 + 40 min gives 2 games and PPG 13.0, #1 in the no-floor list, though he appeared in at least 3 games. Owner may want max(ceil(total/90), seasons with minutes) |
| V2 | A normal and a Refresh historic build can run at once; the last to finish wins, possibly the older one |
| V3 | An open profile's gameweek log isn't refetched by Refresh Data while his totals are, so they can disagree during a gameweek |
| V4 | `seasonHasStarted` needs a `finished` fixture or event; on GW1 day, Current Season stays zeroed until FPL confirms the first match (hours after full time) |
| V5 | A failed silent poll just after a successful Refresh may set the stale flag over fresh data |
| V6 | Double gameweek: `ep_next` probably covers both matches, so GW+2 = `ep_next` × multiplier may double-count; a blank next gameweek gives `ep_next` 0 and zeroes all steps. No double or blank exists to test (GW7–13 are single) |
| V7 | Mid-gameweek, live minutes include provisional GW7 minutes but `team.played` counts only `finished` (Haaland 619 vs 540), slightly inflating the live minutes share (capped at 1) |
| V8 | DC thresholds 10/12 aren't in `game_config.scoring`, so they can't be confirmed from the API |
| V9 | Players who debuted on 17 Oct (Goretzka, Penders, Matusiwa) show "—" for Understat until the next archive can link them, and aren't counted as "held" anywhere visible. Correct under "nothing inferred"; just invisible |
| V10 | Two app windows (dev tabs) overwrite each other's stores, last write wins; no `storage` listener. The desktop app is single-window, so likely dev-only |

---

## 7. Recommended fix order

1. **C1** first: active data loss on a core path, small fix (load the newly selected view onto screen before live-sync, or move tiles into views as Player Comparison does).
2. **H1**, then **M11**: wrong Team Building figures every weekend; contained in `fixtureTicker.ts` and the availability step.
3. **H2, H3, M19**: restore the Understat safety net to what your rule says; pipeline-only, no app risk.
4. **M7, M8, M9, M2**: saved data and per-record resilience; each is small and test-backed.
5. **M6** before the 2027/28 reset (by July 2027): needs a store version bump and migration.
6. **M16, M13, M14, M15, M17**: display correctness; small, test-backed where noted.
7. **M1, M12, V1**: after your decisions.
8. **M3, M4, M5, M18, M10, M20**, then the Lows.

---

## 8. Tests added

All new files are named `*.audit1018.test.*`; no production code was changed.
Each `it.fails` test fails on its stated assertion today (checked with
inverted copies), so the suite stays green.

| File | Protects against | `it.fails` for |
|---|---|---|
| `client/src/pages/Dashboard.storage.audit1018.test.tsx` | Opening on a saved view changes no view; v5 upgrade opens on a blank My View | C1 |
| `client/src/pages/Dashboard.audit1018.test.tsx` | — | C1 |
| `client/src/state/savedData.audit1018.test.tsx` | Newer-version data loads for views, comparison views, notepad; comparison views skip an unreadable entry | M7 ×2 |
| `client/src/pages/TeamBuilder.audit1018.test.tsx` | — | M8, M9 |
| `client/src/metrics/expectedPointsV2.audit1018.test.ts` | Scoring rules match `game_config.scoring`; appearance split sums to 1; the Gabriel hand computation part by part; null safety; Tier 1 next/later fixtures; squad rules; normal import (22 passing tests) | H1, M10 |
| `client/src/validation/schema.audit1018.test.ts` | Bootstrap skips one bad element | M2 ×2 |
| `client/src/normalize/normalizeElementSummary.audit1018.test.ts` | 2022/23 starts and xGC stay real numbers | M14 |
| `client/src/components/teamColumns.audit1018.test.tsx` | — | M15 ×2, M16 |
| `client/src/understat/separation.audit1018.test.ts` | Separation regex catches a normal import | M20 ×4 |
| `server/src/understat/pipeline/matcher.audit1018.test.ts` | — | M19 |
| `server/src/proxy.audit1018.test.ts` | — | L2 |

---

## 9. Not fully covered

The helpers were stopped early by a usage limit. These got less than a full pass:
- Notepad and profile internals (line-by-line)
- a full claim-by-claim check of every User Guide sentence
- `understat/columns.ts` per-game consistency
- fixture-ticker ordering for postponed matches
- running `backtestExpectedPoints.ts`
- FPL's live Bench Boost picks shape (M10)
- chart hover in every chart type (Dashboard scatter and bar hover was not re-driven this run)
- drag-to-reorder

A narrower follow-up run on these is cheap if wanted.

## 10. Final build and tests

| | |
|---|---|
| `npm run build` | Passed (same chunk-size notice as baseline). One new test file first failed the type-check (a missing `position` in a test helper) and was corrected |
| `npm test` | Passed: server 13 files / 90 tests, client 60 files / 550 tests (640 total; 48 new) |
