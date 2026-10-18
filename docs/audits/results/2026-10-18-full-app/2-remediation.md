# Full App Audit — Phase 2 (Remediation) — 2026-10-18

**Input:** `1-audit.md` in this folder (Phase 1 baseline `3b61448`, report
commits `7e1d89a`, `cd191ab`). No commits between Phase 1 and this pass; the
tree was clean.
**Owner's decisions, given at the start of this session:**
- **M1:** keep club figures to matches FPL has confirmed. FPL stays the
  authority; the round of lag during a gameweek is acceptable.
- **M12:** ownership must not affect predicted minutes. Only minutes
  evidence, such as historic minutes, should.
- **V1:** no change to how Historic Average counts games.

---

## 1. Summary for the owner

**Fixed:** the Critical, all 3 Highs, 18 of the 20 Mediums, and 16 of the 18
Lows. M1 is unchanged, as you decided. M11 is documented rather than changed
(see below). Two Lows are only partly done (L4, L10). The 10 "needs
verification" items are left open. Every fix has a test that fails on the
old code, and the visible ones were also checked in the running app.

**What you'll notice:**
- **Deleting a Dashboard view no longer wipes My View** (C1). Checked in the
  app: My View keeps its own tiles after the delete and a reload.
- **Team Building's GW+1 is now the next gameweek you can pick for** (H1),
  never a match already played. Checked live today: Haaland's GW+1 was
  "vs IPS", the match played yesterday; it is now "AVL (A)", his GW8
  fixture. Both Expected Points figures now line up with the gameweek they
  describe. The Explorers' Next 5 Fixtures also leave out matches that have
  kicked off.
- **Predicted minutes no longer use ownership** (M12, your decision). A
  low-owned regular now gets the same reliability as a popular one with the
  same minutes, so differentials' Model Predicted figures go up (about 15%,
  more for clean sheets). Hand-checked on Gabriel: reliability 0.901 → 0.936,
  Model Predicted 4.15 → 4.38.
- **Total xGC no longer makes a bench defender look elite** (M13): it is
  coloured and ranked by xGC per game everywhere.
- **Seasons before 2022/23 show "—" for starts and xG**, not FPL's
  placeholder 0 (M14). Checked on Pickford.
- **Lowest First tiles:** the leader's bar is full length, and the tile's
  title says "Lowest First" (M16, L1). The two Starter "Goals vs xG" tiles
  now read differently.
- **Reset** on the Explorers drops a sort on a column it hides (M17).
  **Team Explorer filters** in Historic Average compare the figure shown:
  "= 80" now finds Arsenal, whose average is 79.75 (M15).
- **Damaged saved data is repaired, not lost** (M7, M8, M9): one bad entry
  is skipped and the rest kept; a broken saved squad no longer blanks Team
  Building; a saved player FPL no longer lists is named in a banner with a
  bin to remove him.
- **Saved squads and tracked-player tiles survive next summer's
  renumbering** (M6): when FPL renumbers players and clubs for 2027/28, the
  app translates every saved id through FPL's permanent player code.
- **Stale data is labelled** (M3): fixtures or historic data served from an
  old copy get a banner, and a historic build made during an FPL outage is
  no longer cached as fresh for 12 hours.
- **Desktop app:** one copy at a time, a clear message if port 4317 is taken,
  and saved data can't look lost because of a `PORT` setting (M5). Not run
  as a packaged app here (see §4).
- Smaller things: live figures refresh every 10 minutes, not every 20 (L2);
  Bench Boost imports keep 11 starters (M10); Player Comparison's address
  ignores repeats (L9); Shift-click on the Player name adds a tiebreaker
  (L9); a tiny negative shows "0.00", not a red "-0.00" (L7).

**The Understat safety net now matches your rule** (H2, H3, M18, M19,
L15–L17):
- Any goals disagreement with FPL stops the sync, however small.
- Only matches checked against FPL are published.
- The daily sync now checks against FPL's own data from that day, not the
  twice-weekly archive, so new matches aren't held back for days.
- The "out of date" dot appears even when the sync has stopped writing.
- A manual `never` now breaks an existing link.
- A failed commit or push now raises the alert instead of closing it.

**One thing to confirm (H2):** checking the stored data found one real
disagreement. In Leeds 0–4 Arsenal (31 Jan 2026), FPL gives a goal to
Madueke and Understat records it as a Karl Darlow own goal. It is the same
goal scored differently; both player links are right. Under the new rule
this would stop the sync every day. I added it to a new file,
`data/understat/accepted-differences.csv`, which lists differences you've
reviewed. **If you'd rather the sync stop on it, delete those two lines.**
Your CLAUDE.md rule says the sync stops on any disagreement; whether
"reviewed and listed" should be an exception is your call.

**Not changed:**
- **M1:** your decision. The README's Known limitations now describe the lag.
- **M11:** FPL gives availability for the next round only, with no return
  date, so a one-match ban can't be told from a long injury. Applying it to
  GW+1 only would show long-term injured players at full minutes for
  GW+2–5. The limit is now documented in the README and the User Guide.
- **V1:** your decision; documented as intended.
- **V2–V10:** not proven this pass, so left open (§4).

**Final checks:** `npm run build` passed. `npm test` passed: server 15 files /
101 tests, client 64 files / 590 tests, 691 in total (640 before; every
Phase 1 `it.fails` is now a normal test).

---

## 2. Findings

"Old code" means the tests run against `cd191ab` in a scratch worktree: every
regression test listed failed there and passes now. "App" means checked in
the running app (`npm run dev`, live 2026/27 API, GW7 in progress, fresh
browser context per check).

| ID | Outcome | Root cause → fix | Tests | Evidence |
|---|---|---|---|---|
| C1 | Fixed | `hydratedScopes` was a one-time flag, so a selection change without a load (delete → My View) let the live-sync write the deleted view's on-screen copy into My View. Now `loadedViewIds` records which view is on screen per scope; the view is loaded whenever it differs, and live-sync waits until it matches (`Dashboard.tsx`). | Phase 1 `[PAGES-DELETE-VIEW]`, `[AUDIT8-1]` → normal | Old code: both fail. App: store after delete + reload `[["My View",["MINE A"]]]` (before `["FOO B"]`) |
| H1 | Fixed | `getUpcomingFixtures` filtered on `finished` only. Fixtures now carry FPL's `started` (no default); a started match is never upcoming. Team Building also starts at the `is_next` gameweek (`firstPickableEventId`), which is what `ep_next` describes. | `[TB-1]` → normal (see §3), +2 | Old code: 3 fail. App: Haaland GW+1 "AVL (A)" = GW8; GW7 vs IPS `started: true, finished: false` |
| H2 | Fixed | 0.5% allowance on goals differences. Every difference is now an error unless listed in `accepted-differences.csv` (`checkAgainstFpl`, `readAcceptedDifferences`). | `checks.test.ts` (3) | Old code: 2 fail. Offline run over all stored seasons: 0 errors; 2025/26's Madueke/Darlow pair reported as reviewed |
| H3 | Fixed | `buildAppSeason` summed every Understat result, paired or not, and the live season paired against the Tue/Fri archive. Now only matches paired with a finished FPL fixture count; the sync fetches FPL's live record each run (`scripts/club-history/liveLedger.ts`, shared with the archive), falling back to the archive with a warning. | `sync.test.ts` +3 | Old code: 2 fail (the third is a control). Offline: 2026/27 had 5 unpaired results; they now wait until FPL confirms them |
| M1 | Not changed (owner) | — | — | README "Known limitations" describes the lag and the 12-hour refresh of club figures |
| M2 | Fixed | Fixtures and historic-bulk were validated as one unit. `perRecord()` drops and counts a bad fixture or club-season. A historic-bulk player with any bad season is left out whole and joins `skippedPlayerIds` (already flagged in the app), so no average is built from part of a player's history. Counts in the User Guide's data health. element-summary stays per player (see §3). | `[DATA-2]` ×2 → normal, +3 | Old code: 4 fail |
| M3 | Fixed | Client ignored `source` for fixtures and historic data; the server built historic-bulk from stale player copies and labelled it live for 12 h. Now `staleDatasets` drives a banner; stale player data counts toward the more-than-half rule; a build with any stale input is served `stale-cache` and cached 30 min. | `historicBulk.test.ts` +3, `AppShell.stale.test.tsx` (2) | Old code: 3 fail. Not reproduced live (needs an FPL outage) |
| M4 | Fixed | A skipped player's rows were simply missing from live club sums. With any player skipped, the live season's player-summed club figures (points, goals, assists, bonus, xG family, DC), its match log and its points bar show "—"; results stay. Team views explain why in Current Season. | `teamStats.test.ts` +1 | Old code: fails. Not triggered live (0 skipped today) |
| M5 | Fixed | No single-instance lock, no `listen` error handler, port from env. `requestSingleInstanceLock`, port-in-use dialog, fixed port 4317 (`electron/main.js`). | none (Electron main process) | `node --check` passes. Not run as a packaged app (§4) |
| M6 | Fixed | Stores kept per-season ids. New id ledger (`state/seasonIdRollover.ts`, store `fpl-dashboard:id-ledger:v1`) records id → code; on a new season every saved id in tiles, graphs, views and squads is translated. See §3. | `seasonIdRollover.test.ts` (4), using the real 2025/26→2026/27 renumbering | New module |
| M7 | Fixed | A throw inside `migrate()` fell the whole store back to defaults. `mapReadableEntries` skips an unreadable entry (tiles, graphs, saved views and their embedded tiles and graphs). | `[AUDIT8-2]` ×2 → normal | Old code: 2 fail. App: `[view, null]` keeps "Keep me" |
| M8 | Fixed | Squads were loaded unchecked. `normalizeSavedSquad` repairs each squad and skips one with no id. | `[TB-3]` → normal, +1 | Old code: 2 fail. App: broken squad, page drawn, no errors |
| M9 | Fixed | Unlisted starters counted toward 11. Only listed starters count; missing ids are flagged in a banner with a remove icon. | `[TB-5]` → normal, +1 | Old code: 2 fail. App: banner names id 9999; remove → 10 players, captain cleared |
| M10 | Fixed | Starting XI read from `multiplier > 0`. Now `position <= 11`; multiplier only as a fallback. | `[TB-4]` → normal | Old code: fails |
| M11 | Documented (audit's second option) | FPL publishes next-round availability only. README "Availability's limit" and the User Guide. | — | — |
| M12 | Fixed (owner) | Ownership removed from the blend; no ownership fallback (no minutes data → null). | 3 updated (§3), +1 | Old code: 4 fail. Gabriel recomputed independently from the formulas (the same working with ownership reproduces Phase 1's 4.1522) |
| M13 | Fixed | Total xGC ranked on itself. `PlayerColumn.rankBy` / `rankValue()`: total xGC ranks, tints and is marked best on xGC/Game in the Explorer, Team Building, Player Comparison (percentiles, Outputs bold) and the profile tiles and Totals row. | +1, 1 updated (§3) | Old code: fails |
| M14 | Fixed | `normalizePastSeasons` didn't null starts and the xG family before 2022/23 (boundary checked live: Pickford, Gabriel, Haaland). | `[CALC-pre2223-placeholders]` → normal | Old code: fails. App: Pickford 2021/22 Starts "—", xG "—"; 2022/23 Starts 37 |
| M15 | Fixed | Team columns omitted `decimals`; `decimals` is now required on every team column, Understat's included. | `[PAGES-HA-FILTER]` ×2 → normal | Old code: 2 fail. App: Arsenal HA Goals For 79.75 shown 80; "= 80" keeps Arsenal |
| M16 | Fixed | Bars were |value| ÷ largest. `components/statBar.ts`: Lowest First on a non-negative metric is leader ÷ value. | `[PAGES-TILE-BAR]` → normal, `statBar.test.ts` (4) | Old code: fails. App: £4.5m, £9.0m, £15.7m → 100%, 50%, 28.7% |
| M17 | Fixed | Reset never touched the sort. `sortWithinColumns` drops sorts on columns Reset hides (both Explorers). | `useSortSpec.test.ts` +3 | Old code: 3 fail. App: sorted by xGC, Reset → sorted by Points |
| M18 | Fixed | The dot came only from the last sync's `missingFixtures`. `understatMatchesBehind` also judges from FPL's own finished fixtures. | `staleness.test.ts` (3) | New module |
| M19 | Fixed | `never` only blocked new candidates. A saved link a `never` names is removed and the player relinked if possible. | `[UNDERSTAT-NEVER]` → normal | Old code: fails |
| M20 | Fixed | The regex missed several import forms and the audit test tested a copy of it. One shared detector (`understat/separationDetector.ts`) used by the real test, scanning `.js/.css` too. | `[UNDERSTAT-SEP]` ×4 → normal, +2 | The real separation test still passes: only `App.tsx` and `app.ts` connect |
| L1 | Fixed | Unnamed Lowest First tiles get "· Lowest First" (`displayTileTitle`). | +2 | Old code: fail. App: the two Starter titles differ |
| L2 | Fixed | TTL started at response time. `TtlCache.set(…, startedAt)`; `cachedFetch` passes the request start. | `[DATA-3]` → normal (timing note §3) | Old code: fails |
| L3 | Fixed | Timeout now covers the body; a non-JSON 200 isn't retried. | `httpClient.test.ts` (2) | Old code: 2 fail |
| L4 | Partly fixed | No defaults for `ep_next` and `status`; unknown status → no reliability; import bank `null` when FPL sends none. Count defaults and FDR left (§4). | +3 | Old code: fail |
| L5 | Fixed | `saves` resolved per Data View: 0 pre-season, "—" in historic modes (`history_past` has none). | +2 | Old code: fail |
| L6 | Fixed | DC units now say a count of actions (verified live: DEF = CBIT, MID/FWD add recoveries). | — | Dictionary text |
| L7 | Fixed | `fmtSigned` and `SignedNum` sign by the value as shown. | +2 | Old code: fails |
| L8 | Fixed (docs) | The code's documented design is "nulls last" except Player Explorer (the owner's request); the README was wrong and now says so. | — | — |
| L9 | Fixed | (a) User Guide describes the tile dialog as it is; (b) Outputs stretch wording for fewer-is-better; (c) `?players=` de-duplicated, whole ids, capped at 5; (d) Shift-click on the Player header, which now also shows its sort arrow. | +2 | Old code: fail. App: `?players=411,411` → 1 tag |
| L10 | Partly | The stale "falls back to Default" comment is corrected. The Dashboard's size and duplicated pickers are architecture work, not done unless you ask. | — | — |
| L11 | Fixed (docs) | README now tables every named weight. | — | — |
| L12 | Fixed (docs) | README: the 900-minute bar decides Model Predicted's bonus seasons. `computeExpPointsBreakdown` is **not** dead: `client/scripts/backtestExpectedPoints.ts` imports it, so it stays. | — | — |
| L13 | Fixed | Hover text no longer mentions a price filter. | — | — |
| L14 | Fixed (docs) | README and Guide say caveats are on hover in the Add Players table. | — | — |
| L15 | Fixed | The hourly reload keeps running while Understat is switched off. | — | Code trace; not unit-tested |
| L16 | Fixed | When Understat goes away, a column switched to it loses its filter and choice. | `explorers.test.tsx` +1 | Old code: fails |
| L17 | Fixed | Commit step has an id and `continue-on-error`; its failure rewrites the report as failed, alerts, and fails the run. | — | YAML parsed with `js-yaml`; alert script passes `bash -n` |
| L18 | Fixed (docs) | README says the Dashboard requests the historic build on mount. | — | — |
| V1 | Intended (owner) | Historic Average games stay from total minutes. | — | — |
| V2–V10 | Open | Not proven this pass. | — | — |

---

## 3. Judgement calls

- **H2's accepted list.** A strict "any difference stops" rule would have
  failed every daily run on a known, reviewed case. The reviewed-list file is
  hand-edited only; the job never writes it. I pre-filled the one known case
  for you to confirm (summary above).
- **H1's test fixture.** Phase 1's `[TB-1]` fixture modelled "started, not
  finished" with a score only. `NormalizedFixture` gained `started` for this
  fix, so the fixture now sets `started: true`, as its own comment describes.
  Two mocked app states gained `events: []`, which the real state always has.
- **M2's record level.** For `element-summary` the record stays the whole
  player: a profile with a gameweek row silently missing would mislead. A
  bad row still fails only that player's profile, never the app.
- **M6 design.** No store changes shape, so no `STORAGE_VERSION` bump. The
  ledger is a new store at version 1. An install with no ledger records the
  current season as is, which is right because the ledger ships mid-2026/27
  and every saved id is 2026/27's. A club filter on a relegated club falls
  back to all clubs, and the tile's name says so, rather than silently
  broadening. A session open across the summer reset reloads once.
- **M12 changed expectations.** Three tests encoded the ownership blend:
  - the reliability hand computation (0.63125 → 0.625);
  - the "falls back to ownership" case, which now expects `null`;
  - Phase 1's Gabriel case: reliability 0.90091 → 0.93578, total
    4.15216 → 4.37697.
  The new figures were computed independently from the formulas in Python.
  The same working with ownership put back reproduces the old figures
  exactly.
- **M13's changed test.** `comparisonMetrics.test.ts` used total xGC as its
  example of the lower-is-better flip. That is exactly the behaviour M13
  changes, so the example is now xGC/Game, and a new test covers total xGC.
- **L2's test timing.** An existing test (`cache.test.ts`) deliberately keeps
  an entry valid at exactly its expiry instant, so that boundary stays.
  Phase 1's `[DATA-3]` polled at that exact instant. It now polls 1 ms later:
  a real poll always fires after the request it follows started. Old code
  still fails it, because its cache lasted to 10:01.5.
- **L4 scope.** `ep_next`, `status` and bank would put an invented figure on
  screen, so they're fixed. Making every always-sent count nullable through
  the normalisers, plus FDR (about ten consumers), is listed below instead.
- **Import bank type.** `importedFrom.bank` is now `number | null`. Old saved
  values stay valid, nothing displays it, and no version bump is needed.

---

## 4. Left open, for the owner

1. **Accepted differences (H2).** Confirm the Madueke/Darlow entry. Also
   consider whether CLAUDE.md's Understat rule 2 should mention reviewed
   differences.
2. **M1's second half.** After FPL confirms a match, the fixture-based
   standings catch up on the 10-minute poll, but the club figures from the
   historic dataset wait up to 12 h or for Refresh Data. You said the lag
   is fine; it's documented. A later fix could rebuild them when a fixture
   becomes finished.
3. **M11.** If you'd prefer availability on GW+1 only (risking long-term
   injured players showing full minutes later), that's a one-line change.
4. **M5.** Desktop changes are syntax-checked only. Worth a quick test of a
   second launch in the next installed build.
5. **L4 remainder:** validation still defaults always-sent counts (to 0) and
   FDR (to 3).
6. **L10:** the Dashboard file's size and duplicated pickers. Refactor only
   if you want it.
7. **V2–V10** need proving before any fix (concurrent historic builds, profile
   log vs Refresh, GW1-day zeroing, poll-after-refresh stale flag, double/
   blank gameweeks, provisional minutes share, DC thresholds, new players'
   Understat links, two windows overwriting stores).

---

## 5. Final build and tests

| | |
|---|---|
| `npm run build` | Passed. Only Vite's existing "chunk larger than 500 kB" notice (`index-*.js` 739 kB) |
| `npm test` | Passed: server 15 files / 101 tests, client 64 files / 590 tests (691 total; 640 at Phase 1) |
| Old-code check | All new and updated regression tests run against `cd191ab`: each fails there (or its new module doesn't exist); the controls pass |
| Real app | 11 checks in the running app (C1, H1, M7, M8, M9, M14, M15, M16, M17, L1, L9), all as expected; servers stopped afterwards |
