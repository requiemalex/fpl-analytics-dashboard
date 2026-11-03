# Audit 2026-11-03 — whole app — Phase 3 (adversarial regression)

Run folder `results/2026-11-03-full-app/`. Phase 1 ended at `bdfe6f8` and
the owner's decisions at `a09344b`. Phase 2 ran up to `af890c8` (the L8
label). This pass reviewed `git diff a09344b..af890c8`, read file by file.
It made no changes to production code. One test was added (§3, R1).

## 1. Summary for the owner

**The fixes mostly hold, with one exception.** I reran 22 of the Phase 2
fixes in the built app and tried to break them. 17 hold completely. Three
hold with a small leftover (L1, L2, L16). One holds only in the tests and
never in the app (L9). The other changes are wording or deletions, checked
by reading. Both probe runs were clean: seed 1 (Phase 1's) and a new seed,
42. So were the attacks on races, upgrades and edge cases. Nothing crashed,
no wrong figure was found, and no earlier fix broke.

**What you should know before releasing:**

- **R1 (Medium):** L9 was meant to keep a chip marked as used by hand in an
  old saved squad, but it doesn't. On the first launch after the update,
  the app rewrites saved squads in the new format before Team Building
  reads them. Team Building then throws the chip away. It affects only
  someone with a squad saved before chip halves existed (version 5 or
  earlier) who marked a chip as used by hand. The cost is one lost "used"
  mark, which they can set again, but it is still saved data lost silently.
  The fix is small.
- **Six Low items:**
  - Hovering the picked Points History season turns its green to grey.
  - The Match Log's Average row still shows DC with 2 decimals.
  - The Player Comparison Help tells users to click a + card, but Starter
    has none.
  - A saved view that no longer exists opens My View instead of Starter.
  - The server's team-ID check is looser than the app's, though README
    says they're the same.
  - A 1–4-minute cameo shows "Average Minutes Per Match: 0".
- One Low with no effect on screen: two hand-written minutes checks are
  left over.

**Recommendation:** fix R1 before releasing. The Lows can go in the same
small pass, or wait until you've decided on them.

## 2. Phase 2 findings, re-checked

| ID | Status | Evidence (this pass) |
|---|---|---|
| M1 | Fixed | Kusi-Asare (0 min): Match Log Totals/Average and "Average Minutes Per Match" are all "—". Garnacho (34 min) and Henry (2 min) still show figures |
| M2 | Fixed | Entry slowed 3 s, Enter ×5 plus Enter in the name box: the button reads "Loading…" and is disabled; 1 squad saved |
| M3 | Fixed | Cancel, Escape and a backdrop click, each 400 ms into a 3 s import: the dialog closes; 9 s later no squad and no active change. Cancel, reopen and import ID 2 while ID 1 is slowed 5 s: only team 2 lands, and team 1 still hasn't landed 14 s later. A 500 arriving after Cancel shows nothing on the reopened dialog. Error, then Enter again: imports in 0.4–0.7 s (not stuck) |
| M4 | Fixed | Beta kept across a page change, a reload, and a rename plus reload. Deleting the active squad gives the first squad; deleting the last gives none. A new blank squad is active and remembered. Seven damaged values in the active store all give the first squad, with no errors |
| M5 | Fixed | `.nav-link.active` rgb(42,92,66), no border/outline/shadow, also on hover, at 1366 and 1920 |
| M6 | Fixed | `.notepad-tab.active` rgb(42,92,66), no line, also on hover (one tab tested) |
| M7 | Fixed | `percentileInSortedPool` against `percentileInPool` over 380,240 random pools (ties, negatives, −0, 0.30000000000000004): 0 mismatches. In a mocked GW1 with Raya the only goalkeeper and Gabriel the only defender with minutes, 0 tinted cells (both were coloured as 100 before). Explorer tints for Gabriel and Rice match the raw API working to ±0.002 (floor 180, GW9 in progress) |
| M8 | Fixed | Fresh install: Dashboard `{player: default-view-player, team: default-view-team}` v3, Comparison `comparison-starter` v2, each list Starter, My View. 21 upgrade cases (unversioned to v3, blank or filled My View, user views, deleted ids, missing or damaged stores) each open the right view, and nothing moves on a second load. See R5 for one fallback |
| L1 | Fixed, two leftovers | Every check Phase 2 changed is equivalent. Two hand-written checks are left (R7), neither changing anything on screen. The live floor never goes below 90 (`liveFloorMinutes`), so the "no data counts as 0 at a floor of 0" change can't happen through the fixed floor |
| L2 | Fixed, regressed on hover | The picked season is rgb(42,92,66) with no ring, but hovering it turns it grey (R2) |
| L3 | Fixed | No `.btn.active` in the stylesheets or on any page |
| L4 | Fixed | 70 characters typed key by key, pasted or filled give 60. 40 emoji give 59 UTF-16 units, with no half-character. HTML stays text. Whitespace only gives "Enter a squad name…" |
| L5 | Fixed in the app | 20 digits, 12 digits, "0", "-5", "1e3", "１２３" and emoji give "Enter a valid FPL team ID…" with no request; 11 digits is sent. The server's own rule is looser (R6) |
| L6 | Fixed | `?players=999999,1,0,abc,2,1,3,4,5,6` shows ids 1–5. 6 known ids plus an unknown one: the same. Only unknown ids: no cards. Bootstrap slowed 5 s: nothing shows while loading, then ids 1–5; no real player lost and no extra card |
| L7 | Left open (owner) | — |
| L8 | Fixed | "Gameweek 10" (in progress), "Gameweek 11" plus deadline, "Gameweek 38 finished" (both finished states), "Gameweek 10 finished", "Pre-season". No overflow at 1366 or 1920. No "· final" left in client, README or CLAUDE.md |
| L9 | **Not fixed** | Holds for the loader on its own, but not in the app (R1) |
| L10 | Fixed | The `fplOfficialPoints` entry matches `fplOfficialForFixture`, `fplSeasonRate` and `FORM_SHARE` [0.2, 0.15, 0.1] |
| L11 | Fixed | No reference to `computeExpPointsBreakdown` is left outside docs/HISTORY.md |
| L12–L14 | Fixed | The toolbar guide matches the six icons in order; Hide is "Player Explorer only"; Clear filters "turns Hide off"; no "five icons" text is left |
| L16 | Fixed, one leftover | Whole in the Explorer column (Historic Average too), the profile tile, the radar hover, the trends, Comparison Outputs and team columns. The Match Log Average row isn't (R3) |
| L17, L18 | Fixed | The README/CLAUDE.md/Help wording matches the code (README 1378, 1619–1622, 1936–1941, 2156; guides.tsx:368) |

## 3. New findings

### R1 — Medium — L9's kept chip is thrown away on the first live launch

- **Where:**
  - `client/src/state/useSavedSquads.ts:189-207` (`changeSavedSquads`,
    `recordSavedSquadDeadlines`)
  - called on every live load from `client/src/state/AppStateContext.tsx:311`
  - read by `normalizeUsedChips` (`useSavedSquads.ts:97-107`)
- **Now:** a version-5 squad with `{chip: "bboost", event: null}` is read
  once at version 5, so the chip is kept. The deadline recorder then always
  writes the whole store back at version 6, even when nothing changed, and
  the chip still has no half. Team Building next reads the store at
  version 6, where a chip with neither a gameweek nor a half is dropped.
- **Should:** the chip survives every later load, as Phase 2's L9 promised.
- **Evidence:**
  - **Built app** (`audit-output/tmp/R1-chip.ts`): seeded
    `{version: 5, data: [squad with wildcard GW3 + bboost event:null]}`
    and opened Team Building. The store is now
    `v6 [{"chip":"wildcard","event":3}]`; the Bench Boost mark is gone on
    the first launch.
  - **Node** (`audit-output/tmp/l9-twoloads.ts`): load at v5 keeps 2 chips;
    after one write-back at v6, the next load gives 1.
  - **Test added:** `useSavedSquads.test.ts` "survives the app's first live
    load…" as `it.fails`. It fails today with "expected [wildcard] to
    deeply equal [wildcard, bboost]". Remove `.fails` once it's fixed.
- **Test gap:** Phase 2's three L9 tests call `loadSavedSquads` and
  `normalizeSavedSquad` directly. None goes through a write-back.
- **Possible fix (for a later Phase 2):** give such a chip a marker that
  survives at version 6, for example an explicit "half unknown", or bump to
  v7 and keep it from ≤ 6. Not decided here.
- **Confidence:** High. Reproduced in the built app and in node, and the
  cause is in the code.

### R2 — Low — The picked Points History season loses its green on hover

- **Where:** `client/src/styles/components.css:2583` vs `:2586`; player
  profile, Points History season columns.
- **Now vs should:** `button.points-history-col.is-selectable:hover`
  (specificity 0,3,1) beats `.is-selected` (0,2,1). The picked column has
  both classes, so on hover it goes from rgb(42,92,66) to rgb(28,38,32).
  The side menu, Notepad tabs and toolbar chips keep their green on hover.
- **Evidence:** `audit-output/tmp/C-views-sel.ts`, `/players?player=1`,
  click a season: selected rgb(42,92,66); selected plus hover
  rgb(28,38,32), at 1366 and 1920. Before Phase 2 the picked and hover
  looks were the same grey, so this is new with L2's fix.
- **Test gap:** `selectedState.test.ts` checks each rule's own
  declarations, not which rule wins.
- **Confidence:** High (computed style, both widths).

### R3 — Low — The Match Log Average row shows DC with 2 decimals

- **Where:** `client/src/components/PlayerDetailOverlay.tsx:174`
  (`dc: … averageDp: 2`).
- **Now vs should:** Gabriel's 2026/27 Average row shows DC "9.00", while
  the same profile's DC/Game tile shows "9" and the BPS average beside it
  is "22". The owner's L16 decision makes a player's DC per match whole.
- **Evidence:** `audit-output/tmp/B-live.ts`. The AVERAGE row reads
  `6.4 90 1.00 … 0.80 9.00 22`; 81 DC over 9 matches.
- **Confidence:** High.

### R4 — Low — The comparison Help still says to click a + card

- **Where:** `client/src/help/moreGuides.tsx:928-931` (the "build a
  comparison view" answer) and `guides.tsx:726`.
- **Now vs should:** since M8, Player Comparison opens on Starter, which is
  read-only and has no + cards (`PlayerComparison.tsx:311`, `:637`). The
  answer should first say to pick My View or Create View, as the
  Dashboard's guide does (`guides.tsx:368`).
- **Evidence:** `audit-output/tmp/C-views-plus.ts`, a fresh
  `/player-comparison?players=1,2`: view `comparison-starter`, no + card.
- **Confidence:** Medium. The + buttons were matched by text and label;
  the read-only gating in the code agrees.

### R5 — Low — A saved selection of a view that's gone opens My View, not Starter

- **Where:** `useSavedDashboardViews.ts:248-253` (`resolveSelectedViewIds`)
  and `useComparisonViews.ts:210-214`.
- **Now vs should:** a missing selection opens Starter (M8). A selection
  naming a view that no longer exists falls to My View first.
  - **Dashboard:** `{player: "view-gone"}` v2 is rewritten as
    `my-view-player` v3 and stays there.
  - **Comparison:** `"cmp-view-gone"` shows My View.
  - Deleting the open view also falls to My View. That is documented
    (README 1632), so it may be intended.
- **The question:** should every fallback be Starter, under "open on the
  default view"?
- **Evidence:** `audit-output/tmp/C-views-upg.ts`, cases
  `D4_v2_deletedId` and `C6_v1_deletedId`.
- **Confidence:** Medium. The behaviour is proven; whether it breaks the
  rule is the owner's call.

### R6 — Low — The server's team-ID rule is looser than the app's; README says they're the same

- **Where:** `server/src/teamId.ts:7`, `server/src/routes/entryImport.ts`;
  README `<active_squad>` paragraph ("checked by the server's own rule").
- **Now vs should:** the app also rejects 0; the server doesn't.
  - `/api/entry/0` is asked of FPL (404).
  - `/api/entry/00000000001` returns 200 and is cached separately from
    `entry:1`.
  - The gameweek route forwards `event/0` and `event/99999999999` to FPL.
  - The app never sends any of these, so only a direct caller is affected:
    a wasted upstream call and a duplicate cache entry.
  - The server should reject 0, and should either reject leading zeros or
    use the number.
- **Evidence:** curl against a copy of the built server on :4201.
- **Confidence:** High on the behaviour; the impact is Low.

### R7 — Low — Two hand-written minutes checks that L1 missed

- **Where:**
  - `PlayerDetailOverlay.tsx:893`: the Match Log's small-sample note
    (`logMinutes < logFloor`).
  - `historicAnalysis.ts:105`: `qualifyingSeasons`, which feeds only the
    frozen legacy model.
- **Now vs should:** both should call `isUnderMinimum`. Neither changes
  anything on screen today, because the minutes are always a number there.
- **Side note:** a 0-minute log's note says "Small sample: 0 min" where
  elsewhere that case is called "no data".
- **Confidence:** Medium. A consistency gap with no wrong figure.

### R8 — Low (owner's call) — A 1–4-minute cameo shows "Average Minutes Per Match: 0"

- **Where:** `PlayingTimeIcon.tsx:62` (`fmtDecimal(avg, 0)`) and the Match
  Log Average row's minutes column (`PlayerDetailOverlay.tsx:165`).
- **Now:** Henry (id 89) has 2 minutes over 9 matches, an average of 0.22.
  It shows as "0" in both places. Since M1, a 0-minute player shows "—",
  so this "0" now reads as "never played". 10 players are in that band
  today.
- **Options:** "<1", or one decimal for this small figure (allowed under
  whole numbers).
- **Evidence:** `audit-output/tmp/B-henry.ts`; raw bootstrap minutes = 2.
- **Confidence:** High that it happens; whether it's a defect is a wording
  choice.

## 4. Theoretical concerns and items to verify (not defects)

- **Leaving Team Building mid-import** still saves the imported squad and
  makes it active. Only Cancel, Escape or a click outside drops the
  result. Reproduced: ID 6 slowed 3 s, Enter, go to Players. M3's
  "closing the dialog drops it" arguably covers leaving the page. The
  owner's call.
- **Deleting the active squad** leaves its id in `saved-squads:active:v1`.
  The page falls back to the first squad and ids are random, so there is
  no visible effect.
- **Phase 1's V2 is now proven, but it isn't a regression.** Old summary
  tiles (store v2) with no views store are lost on upgrade. Seeded
  old1–old3: old1 and old2 are in no view afterwards, and old3 survives
  only as the Teams working copy. Before Phase 2 the same happened with
  blank My View as the fallback. Whether any such install shipped decides
  whether a migration is worth it.
- **The top bar label's hover text is never shown.** Its `title`
  ("Gameweek N finished") is built in `AppShell.tsx:76-79`, but the span
  shows the data-status title. This matches the Help ("hover for when it
  last updated"); those strings are just unused.
- **`.column-filter-icon.active`** (`components.css:387`, `--accent-value`
  text) is a switched-on mark that isn't soft green. It's arguably an
  indicator, not a pick. The owner's call.
- **Whole DC/Game makes equal-looking figures tint differently.** 23
  midfielders show "8" with ranks from 54 to 69, so their tints range from
  almost none to light green. The rank uses the unrounded figure, so this
  is expected.

## 5. Verified correct

- **Probes:** pages, failures, storage and monkey, at seed 1 and seed 42.
  - The storage probe damaged 14 stores, the new `saved-squads:active`
    among them.
  - On-demand failures reached element-summary (seed 1 only),
    historic-bulk and understat. Player-seasons, entry and event weren't
    reached by the probe; the Team Building helper covered entry
    failures by hand.
  - First load: 4 API calls, 1.7–1.8 s.
- **Races:** repeated Enter, Cancel/Escape/backdrop, cancel-and-reimport,
  late 500 after Cancel, error then retry, at the 5-squad limit.
- **Saved-squad upgrades:** null, v1, v5 and v6 seeds load the same on the
  first and second load (when no chip lacks both a gameweek and a half).
- **No other store has R1's pattern.** The version-gated steps in
  `useComparisonViews`, `useDashboardGraphs`, `useSavedDashboardViews`
  (both stores) and `useSummaryTiles` produce data that is valid at the
  new version.
- **Mocked gameweek states:** pre-season (no colours, no NaN, no errors on
  Players, Dashboard, Comparison and Teams), GW1 in progress, the season's
  last gameweek finished, and mid-season.
- **Collateral:** `MAX_NAME_LENGTH`, `isValidFplTeamId` and
  `useActiveSquadId` are used only on Team Building. The `columnByKey`
  import in `careerTrends.ts` creates no import cycle. Every caller of the
  changed rank functions already treats null as "no colour".
- **Not checked:**
  - promoted clubs' pages on screen (code only);
  - Last Season and Historic Average colours on screen;
  - two tabs editing at once;
  - Notepad with 2+ tabs;
  - the Electron build.

## 6. Check, probes and recommendation

- **`npm run check`:** build ok (18 s); server 163/163, client 1488/1488
  (one more than Phase 2: R1's `it.fails`), electron 6/6.
- **`npm run probe -- --seed=1`:** 0 issues in 310 s
  (`audit-output/2026-11-03-13-58/`).
- **`npm run probe -- --seed=42 --no-build`:** 0 issues in 239 s
  (`audit-output/2026-11-03-14-03/`).
- **Recommendation:** fix R1 first. It's a small change, and it is the one
  item where saved data is quietly lost. R2–R4 are quick and could go in
  the same pass. R5, R6 and R8 need the owner's view first, and R7 is
  tidying. After that pass, release.
