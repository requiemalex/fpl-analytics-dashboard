# Player Explorer Audit — Phase 1 (Forensic Audit) — 2026-09-25

**Scope:** the Player Explorer page (`client/src/pages/PlayerExplorer.tsx`,
route `/players`) and the shared code it depends on:
- the column list (`components/playerColumns.tsx`);
- the sort, column-filter and column-layout engines (`state/useSortSpec.ts`,
  `state/useColumnFilters.ts`, `components/ColumnFilterControl.tsx`,
  `state/useColumnCustomization.ts`);
- search (`utils/playerSearch.ts`), CSV export (`utils/csvExport.ts`) and
  comparative colouring (`utils/colorScale.ts`);
- the metric pipeline behind every figure (`normalize/`,
  `metrics/resolvePlayerStats.ts`, `playerMetrics.ts`, `calculations.ts`,
  `careerMetrics.ts`, `historicAnalysis.ts`, `defensiveReward.ts`);
- the Teams → Player Explorer hand-off (`?team=`).

The player profile and Player Comparison were checked only for agreement with
the Explorer's figures.

---

## 1. Summary for the owner

**What was checked.** I ran the real app against the live 2026/27 FPL API
(Gameweek 5 finished, Gameweek 6 next) and used Player Explorer the way a user
would, in a separate test browser that doesn't touch your own settings. I
tried every control: the three Data Views, sorting, every kind of column
filter, search, the Columns picker, drag-to-reorder, resizing, Reset, Clear
filters, Export CSV, the Next 5 Fixtures column, Refresh, and arriving from
the Teams page. I also made the data fail on purpose to check the error
messages. I turned on all 31 columns in all three Data Views and checked
every one of the 62,031 cells for broken values. I recalculated the most
extreme leaderboard figures by hand from the raw FPL data.

**Findings:** 0 Critical, 1 High, 6 Medium, 9 Low, plus 2 questions that need
your decision.

**The ones that matter most:**
1. **H1 — "Player Rankings" from Teams leaves a hidden team filter.** The
   list is filtered to that club, but the Team column's own filter still says
   "All". Pick a different club there and you get "No players match your
   filters". Clearing all filters appears to work, but it comes back when the
   page is reloaded.
2. **M1 — per-game leaderboards are topped by one-cameo players.** Sort by PPG
   and the leader is Reed (15.0 PPG from one 89-minute appearance). DC/Game,
   xGI/Game and Def. Reward/Game do the same. The Dashboard stopped this on
   its own leaderboards in the last audit. Player Explorer relies on you to
   filter the Mins column yourself, and nothing tells you to.
3. **M2 — "Equal to" filters rarely match what you can see.** Haaland shows
   Pts/£m 15.3, but "Equal to 15.3" finds nobody, because the real value is
   15.32…
4. **M3 — hiding a filtered column leaves its filter working invisibly.** The
   table stays cut down, with no sign of why.
5. **M4 — PPG means two different things.** In Current Season it's FPL's own
   points per appearance. In the other two Data Views it's the app's points
   per estimated game. The README says it's always the app's. For 163 of the
   421 players who have played this season, the two differ by 0.5 or more.

**Checked and found fine:**
- Every figure I checked by hand matches the raw FPL data: prices, ownership,
  totals, per-game rates, per-£m values and 4-season averages.
- The same player shows the same numbers in the Explorer, their profile and
  Player Comparison.
- No NaN, Infinity or blank-instead-of-dash anywhere.
- Loading, a failed API and the Retry button all behave properly.
- Refresh really fetches fresh data.
- Export CSV matches the table exactly.
- Accent-insensitive and typo-tolerant search works.
- Drag-to-reorder and Reset work.
- The page stays quick enough: about 0.3–0.5 s to re-sort or switch Data
  View with all 667 players, in the built app.

---

## 2. Baseline

| Item | Value |
|---|---|
| Commit | `f794f96` |
| Version | v1.64.0 (latest tag) |
| `npm run build` | Clean (exit 0; Vite's usual large-chunk warning only) |
| `npm test` | 294/294 passed (server 45, client 249) |
| Live data | 667 players; GW5 `is_current` and finished, GW6 `is_next` (deadline 10 Oct 10:00 UTC) |

Method:
- Read CLAUDE.md, the README, the User Guide (Player Explorer, Analysis
  modes and Metric reference sections), `docs/audits/README.md`, and the
  2026-09-24 Dashboard run.
- Ran `npm run dev`, plus a production build (`node server/dist/index.js`)
  for the performance and request checks.
- Drove the app with headless Chromium through throwaway Playwright scripts
  outside the repo.
- Recomputed figures from `/api/bootstrap-static` and
  `/api/element-summary/{id}`.

---

## 3. Master index

| ID | Sev. | One line |
|---|---|---|
| H1 | High | Teams "Player Rankings" hand-off applies a hidden team filter the Team column doesn't show; choosing another club gives 0 players; it survives Clear filters on reload |
| M1 | Medium | Per-game columns (PPG, DC/Game, xGI/Game, Def. Reward/Game…) are led by one-cameo players, with no floor or warning |
| M2 | Medium | "Equal to" compares the unrounded value, so a number typed exactly as shown usually matches nobody |
| M3 | Medium | A filter on a column you then hide keeps filtering, with no visible sign |
| M4 | Medium | PPG is FPL's per-appearance figure in Current Season but per estimated game elsewhere; README says per estimated game throughout |
| M5 | Medium | The right half of each column's resize handle is covered by the next header, so dragging there sorts or moves the next column instead |
| M6 | Medium | Next 5 Fixtures is squeezed to the same width as a number column, so only about 2 of 5 fixtures are visible |
| L1 | Low | Keyboard Enter doesn't confirm a column filter; Escape closes nothing; the Columns picker doesn't close on an outside click |
| L2 | Low | Contradictory or negative filter values are accepted silently (≤100 and ≥200 → empty table) |
| L3 | Low | Player-name sort isn't alphabetical: accented and lower-case names (Ángel, Ødegaard, Šeško, van Ewijk) sort after Z |
| L4 | Low | Position sorts alphabetically (DEF, FWD, GKP, MID), not in pitch order |
| L5 | Low | Searching a name as displayed with its dot ("B.Fernandes") also returns Mateus Fernandes and Gustavo Nunes |
| L6 | Low | Manual column widths (including Own%/Price/Team/Position) are wiped by any window resize or column toggle |
| L7 | Low | Out-of-date wording on the page and in the User Guide (a "criteria bar"/"filter bar" that no longer exists, a "salah" example for a player no longer in FPL) |
| L8 | Low | Dead or unreachable code on the page and in shared code |
| L9 | Low | The column-filter ▾ button has hover text but no `aria-label` (CLAUDE.md convention) |
| V1 | Verify | Historic Average per-game rates count games from the *average* season's minutes, not total minutes as CLAUDE.md says |
| V2 | Verify | Column layout, sort and filters are forgotten when you leave the page: intended? |

---

## 4. Findings in detail

### Audit 1 — Data source accuracy

No defects. Checked:
- **Price and ownership.** `now_cost` 156 → "£15.6m" (Haaland);
  `selected_by_percent` "73.7" → "73.7%". Both are always live in every Data
  View, as documented.
- **Totals trace to the API.** Last Completed Season is
  `history_past["2025/26"]`: Haaland 2,953 min, xG 25.50, xA 2.67. Current
  Season is bootstrap: 39 pts, 450 min.
- **Missing data is "—", never 0.** A player with no 2025/26 record shows "—"
  in every performance column and is kept in the list (667/667 in every Data
  View). Current Season zero-minute players show "—" for per-game rates.
- **No NaN, Infinity or undefined** in 62,031 cells (all 31 columns × 667
  players × 3 Data Views).
- **The 2022/23 season inside the Historic Average window is a full-season
  record.** Haaland's 2022/23 row has 33 starts and xG 28.54. It is not the
  part-season sum the club-history backfill has to guard against.
- **Requests stay lean.** Only `element-summary` is per player, and it's
  requested only when a profile opens: none on page load. The production
  build makes one request each to `bootstrap-static`, `fixtures` and
  `historic-bulk` on load. The dev server doubles the first two because of
  React StrictMode, which is dev only.
- **Refresh** calls `/api/refresh/bootstrap-static` and
  `/api/refresh/fixtures` (cache bypass).
- **Errors are handled.**
  - `historic-bulk` returning 503 → "Couldn't load historic data: down" with
    Retry, and Retry restores the figures.
  - `bootstrap-static` returning 502 → "Couldn't load live FPL data" with
    Try again.
  - A slow historic build shows "Building the historic dataset…".
- **Gameweek** comes from `events.is_current`: the top bar shows GW6 next
  with its 10/10 deadline.

### Audit 2 — Metric and calculation correctness

Inventory of the Explorer's derived metrics. All come from
`metrics/calculations.ts` and `careerMetrics.ts` and match `dictionary.ts`,
except PPG (M4) and V1.

| Metric | Formula (Last Season / Current) | Historic Average | Zero / null |
|---|---|---|---|
| xG, xA, xGI, xGC, DC /Game | total ÷ estimatedGames, `max(1, ceil(min/90))` | avg stat ÷ games from avg minutes of the seasons that have that stat (V1) | 0 min → "—" |
| PPG | Last Season: pts ÷ estimatedGames; **Current: FPL `points_per_game`** (M4) | avg pts ÷ games from avg minutes | 0 min, 0 pts → "0.0" (documented `<ppg_vs_per90>`) |
| Pts/£m, xG/xA/xGI per £m | total ÷ live price | avg ÷ live price | null → "—" |
| Def. Reward/Game | CS × (4/4/1/0 by position) ÷ games + bonus ÷ games | same on averages | null → "—" |

Hand checks (raw API → app):
- **Haaland, Last Season.** PPG = 239 ÷ ceil(2953/90) = 239 ÷ 33 = 7.24 →
  "7.2" ✓. Pts/£m = 239 ÷ 15.6 = 15.32 → "15.3" ✓.
- **Haaland, Historic Average.**
  - xG = (28.54 + 29.57 + 21.90 + 25.50) ÷ 4 = 26.38 ✓.
  - Mins = (2767 + 2553 + 2736 + 2953) ÷ 4 = 2,752 ✓.
- **Collyer, Historic Average DC/Game 17.50** (the top of that list). Window
  seasons are 2023/24 (0 min), 2024/25 (174 min, 35 DC) and 2025/26 (0 min).
  DC seasons 2024/25 and 2025/26 give an average of 17.5 DC and 87 min → 1
  game → 17.50 ✓, per the documented `<matched_season_rates>`.
- **Benitez, Last Season Def. Reward 4.00.** 1 clean sheet × 4 (GKP) ÷ 1 game
  + 0 bonus = 4.00 ✓.

#### M4 — PPG is a different measure in Current Season
- **Severity / confidence:** Medium / High (measured on every player).
- **Where:**
  - `normalize/normalizePlayers.ts:80` reads FPL's `points_per_game`.
  - `metrics/resolvePlayerStats.ts:124-139` keeps it for Current Season.
  - Lines 174 and 203 estimate it for the other Data Views.
- **What it does:** in Current Season, PPG is FPL's points ÷ appearances. In
  Last Completed Season and Historic Average, it's points ÷ estimated games,
  where games = ceil(minutes/90). Every other per-game column uses estimated
  games in all three Data Views.
- **What the docs say:**
  - README "Per game, not per 90" (lines 236-237) lists PPG among the rates
    that are "per estimated game".
  - CLAUDE.md says rates use estimated games from total minutes.
  - `dictionary.ts:40-52` (User Guide Metric reference) says it's FPL's own
    figure live.
- **Why it matters:**
  - Switching the Data View changes what PPG means.
  - In Current Season, PPG sits next to xGI/Game but uses a different
    denominator.
  - Players used off the bench look very different: Cho shows PPG 2.2
    (FPL's figure for 9 pts over several substitute appearances) but would
    be 9.0 per estimated game (72 min = 1 game).
- **Reproduce:**
  1. In bootstrap-static, for each player with minutes > 0, compare
     `points_per_game` with total_points ÷ max(1, ceil(minutes/90)).
  2. 163 of 421 differ by ≥ 0.5, for example Cho 2.2 vs 9.0, Alysson 2.0
     vs 8.0 and Isidor 3.0 vs 7.5.
- **Should:** one definition in all three Data Views, or the README and
  CLAUDE.md corrected to say Current Season PPG is FPL's own figure. This is
  your call. Also affects Dashboard PPG tiles and graphs, Player Comparison
  and the profile.

### Audit 3 — Expected-points model

Out of scope: it lives in Team Building, which Player Explorer doesn't use.

### Audit 4 — Cross-application consistency

No defects. Haaland and B.Fernandes (Last Completed Season) show identical
Points, PPG, xG, xA, xGI, Pts/£m and Mins in the Explorer, their profile
(`?player=426`) and Player Comparison (`?players=411,426`). All three use the
same `resolvePlayerStats` + `getPlayerDerivedMetrics` + `PLAYER_COLUMNS`, so
nothing is recalculated locally. The PPG mismatch (M4) is between Data Views,
not between pages.

### Audit 5 — Filters, sorting, order and state

#### H1 — "Player Rankings" from Teams leaves a hidden, sticky team filter
- **Severity / confidence:** High / High (reproduced in the live app and in a
  test).
- **Where:** `pages/PlayerExplorer.tsx:80-83`. `?team=` seeds
  `filters.teamId`, which `useFilteredPlayers` applies. The page has no
  control for `filters.teamId`, and the Team column filter
  (`useColumnFilters`) is a separate, unrelated filter.
- **What it does:**
  - The list is cut to that club, but the Team column's ▾ isn't marked
    active and its "Show only" box reads "All".
  - Choosing another club there combines both filters, so the result is
    empty.
  - "Clear every filter" clears the list, but `?team=1` stays in the address,
    so a reload applies it again.
  - A bad or unknown id (`?team=abc`, `?team=99`) silently shows 0 players.
- **Should:** the hand-off should set the visible Team column filter, so it
  can be seen, changed and cleared like any other. Clearing it should also
  remove it from the address.
- **Why it matters:** this is the documented path from Teams, and a user who
  follows it and then tries to look at another club is told nobody matches.
- **Reproduce (live):**
  1. Open Teams and click "Player Rankings" on Arsenal. You land on
     `/players?team=1`, showing 29/667 (all ARS). The Team ▾ is not
     highlighted.
  2. Team ▾ → Show only "CHE" → Enter. Actual: "0/667 — No players match your
     filters". Expected: Chelsea's players.
  3. Click Clear every filter → 667/667, but the address is still
     `/players?team=1`.
  4. Reload → 29/667 again.
- **Tests:** two `it.fails` tests in `pages/PlayerExplorer.test.tsx`.

#### M1 — Per-game leaderboards are led by one-cameo players
- **Severity / confidence:** Medium / High.
- **Where:** `pages/PlayerExplorer.tsx`. There is no minutes floor for
  per-game columns. The Dashboard has one (`applyRateStatFloor`, D2 of
  2026-09-24).
- **What it does:** sorting any per-game column descending puts tiny samples
  on top.

  | Data View | Column | Top of list |
  |---|---|---|
  | Last Completed Season | PPG | Reed 15.0 (89 min), Onyeka 12.0 (88 min) |
  | Last Completed Season | Def. Reward/Game | Benitez 4.00 (90 min) |
  | Historic Average | DC/Game | Collyer 17.50 (58 min average) |
  | Historic Average | PPG | Esse 13.0 (89 min), Jebbison 10.5 (63 min) |
  | Current Season | xGI/Game | Hinshelwood 1.43 (63 min), Cho 1.15 (72 min) |
  | Current Season | DC/Game | Andrey Santos 18.00 (82 min) |

  Reed checked by hand: 2025/26 = 15 pts, 89 min → 15 ÷ 1 = 15.0.
- **Why it matters:** the number is arithmetically right but misleading as a
  ranking. Someone scouting "best PPG" is shown a player with one appearance.
  The README says the MINS column filter "does that job", but nothing on the
  page prompts for it.
- **Should:** your decision. Options are a default floor on per-game columns
  (like the Dashboard's 90/450 minutes), a visible default Mins filter, or
  flagging small samples.

#### M2 — "Equal to" rarely matches a value as displayed
- **Severity / confidence:** Medium / High.
- **Where:** `state/useColumnFilters.ts:207`
  (`value !== spec.eq` on the unrounded number).
- **What it does:** it compares against the full-precision value, while the
  table shows 0–2 decimals.
- **Reproduce:**
  1. Last Completed Season. Haaland shows Pts/£m "15.3".
  2. Pts/£m ▾ → Equal to 15.3 → Enter.
  3. Actual: 0/667. Expected: Haaland (value 15.32).

  The same happens for Historic Average totals (Haaland Points "227" is
  227.25) and any 1–2 decimal column.
- **Should:** compare at the column's displayed precision.
- **Test:** `it.fails` in `pages/PlayerExplorer.test.tsx`.

#### M3 — A hidden column's filter keeps filtering invisibly
- **Severity / confidence:** Medium / High.
- **Where:** `pages/PlayerExplorer.tsx:161-164` applies every stored column
  filter, whether or not its column is visible.
- **Reproduce:**
  1. Goals ▾ ≥ 10 → 21/667.
  2. Columns → untick Goals.
  3. Actual: still 21/667, with no Goals column and no ▾ to show why.
- **Should:** either drop the filter when its column is hidden, or keep some
  visible sign of it. Your call; no test added until that's decided.

#### L2 — Contradictory or negative values accepted
- **Severity / confidence:** Low / High.
- **Where:** `components/ColumnFilterControl.tsx`.
- **What it does:** Points ≤ 100 and ≥ 200 is accepted and shows "No players
  match your filters". Goals ≥ −5 is accepted.
- **Should:** refuse, or flag, a minimum above the maximum (the Dashboard got
  this in D13).

#### L3 — Player-name sort isn't alphabetical
- **Severity / confidence:** Low / High.
- **Where:** `state/useSortSpec.ts:183` compares strings with `<`, which uses
  character codes.
- **What it does:** A→Z ends "…Zetterer, Zirkzee, Zubimendi, van Ewijk,
  Ángel, Ömür, Ødegaard, Šeško". The first click on Player sorts Z→A.
- **Should:** a locale-aware comparison (accents and case ignored).
- **Test:** `it.fails` in `pages/PlayerExplorer.test.tsx`.

#### L4 — Position sorts alphabetically
- **Severity / confidence:** Low / High.
- **What it does:** descending gives MID, GKP, FWD, DEF.
- **Should:** GKP, DEF, MID, FWD (pitch order), which is what an FPL user
  expects.

#### L5 — Searching "B.Fernandes" also finds two other players
- **Severity / confidence:** Low / High.
- **Where:** `utils/playerSearch.ts:32-35`. The query isn't split on "." as
  the names are (line 79), so "b.fernandes" falls through to the typo match
  against "fernandes".
- **What it does:** it returns B.Fernandes, Mateus Fernandes and Gustavo Nunes
  (second name "Nunes Fernandes Gomes").
- **Test:** `it.fails` in `utils/playerSearch.test.ts`.

Checked and fine:
- Multi-column (shift-click) sort.
- Team and Position category filters.
- ≤ / ≥ filters, and filters combining with search.
- Filters kept across Data View changes.
- "—" fails any active filter, as documented.
- Clear filters and Reset both clear everything except the hidden H1 filter.
- Nulls sort below every real value, first ascending, as the User Guide says
  was requested. So "lowest xGC/Game" first shows the "—" players; that is
  documented behaviour.
- Analysis mode and filters are per page: nothing here reaches another page.

### Audit 6 — UI and interaction

#### M5 — Resize handle half-covered by the next header
- **Severity / confidence:** Medium / High.
- **Where:** `styles/components.css:251-259` (`.column-resize-handle` at
  `right: -4px`, 8 px wide) together with `table.data-table th`, which is
  `position: sticky; z-index: 2`. Each header forms its own layer, so the
  next header sits over the handle's right half.
- **What it does:** only the left 4 px of the 8 px handle resize. In the
  right half, `elementFromPoint` returns the next header.
- **Reproduce:**
  1. Grab the middle of Own%'s edge and drag right. The table sorts by Price
     instead of resizing.
  2. Do the same on xG's edge. xA is moved after xGI instead.
  3. Grabbing 1–3 px left of the edge works (79 → 159 px).
- **Should:** the whole handle should resize and nothing else.

#### M6 — Next 5 Fixtures is too narrow to show its fixtures
- **Severity / confidence:** Medium / High (screenshot).
- **Where:** `state/useColumnCustomization.ts:94-100`. `fitToBox` gives every
  column the same width.
- **What it does:** at 1600 px wide, turning it on gives it 72 px, so it shows
  about 2 of the 5 fixture chips and clips the rest. The table also overflows
  by 40 px.
- **Should:** give the fixtures column enough room for 5 chips. Resizing it
  by hand runs into M5.

#### L1 — Keyboard and closing behaviour
- **Severity / confidence:** Low / High.
- **Where:**
  - `components/ColumnFilterControl.tsx:340-347`: Enter and Cancel are
    buttons only, with no key handling.
  - The page and `components/PlayerDetailOverlay.tsx` have no Escape
    handler.
- **What it does:**
  - Pressing the Enter key in a filter box does nothing, even though the User
    Guide says "Confirm with Enter" (line 290).
  - Escape leaves the filter popover, the Columns picker and the player
    profile open.
  - Clicking outside the Columns picker doesn't close it.

#### L6 — Manual widths are lost
- **Severity / confidence:** Low / High.
- **What it does:** Price resized 82 → 142 px goes back to 78 px after a window
  resize, because `fitToBox` rebuilds `columnWidths` from the visible
  configurable columns only (the identity columns lose theirs too). Toggling
  a column does the same.

Checked and fine:
- Initial load, loading banner, historic failure with Retry, bootstrap
  failure with Try again.
- Row click opens the right profile.
- Drag to reorder.
- Reset restores order, visibility and widths.
- Export CSV: filename `player-explorer-lastSeason-2026-09-25.csv`, 668
  lines, headers and every value identical to the screen.
- An 800 px window scrolls inside the table, not the page.
- No console errors apart from React Router's future-flag warnings.
- Typed input (`pressSequentially`) in search and filter boxes keeps every
  keystroke.

### Audit 7 — Automated test coverage

- **Before:** nothing covered this page, the column-filter engine,
  column-layout engine or player search. The sort comparator had tests.
- **Added:** 27 tests, all passing; see section 8.
- **Still untested:**
  - M1 and M3, where the correct behaviour is your decision.
  - M4 (depends on the chosen PPG definition).
  - M5 and M6 (layout, not testable in jsdom).
  - L1 keyboard handling (depends on how it's built).

### Audit 8 — Saved data and upgrades

Nothing in scope. Player Explorer keeps no saved data: columns, widths, sort,
filters and Data View are plain page state (`useState`), and none of the
README "Saved data" stores is read or written by this page. See V2 on whether
that's intended.

### Audit 9 — Plausibility of outputs

- **Totals look right.** Every Data View's Points leaderboard is believable:
  Haaland, B.Fernandes, Gabriel, Semenyo last season; Groß, Tarkowski, Bogle,
  Haaland this season.
- **Per-game leaderboards don't** (M1).
- **The bottoms of lower-is-better columns (xGC/Game) are all "—"**,
  documented under Audit 5.
- **Highest DC/Game with a real sample** (Last Season): Cook 14.30 (872 min),
  Ugarte 14.20, Anderson 13.55 (3,332 min). These are plausible; the
  "impossible 35 DC/game" problem from D1 is gone.

### Audit 10 — Code quality and architecture

#### L8 — Dead or unreachable code
- **Severity / confidence:** Low / High.
- **Where:**
  - **`PlayerExplorer.tsx:385-389`.** The "Building the historic dataset…"
    empty state can never show: every player is kept (`<retained_not_omitted>`),
    so rows are never 0 while loading. The toggle's own banner covers it.
  - **`PlayerExplorer.tsx:265, 578`.** Special cases for `goalsMinusXG` and
    `assistsMinusXA` columns that don't exist in `PLAYER_COLUMNS`.
  - **`resolvePlayerStats.ts:12-16`.** `ANALYSIS_MODE_LABELS` is unused and
    says "Live Season" where the app says "Current Season".
  - **`resolvePlayerStats.ts:202-211`.** The Historic Average `?? 0`
    fallbacks can't currently run. If they ever did, they would put 0 where
    CLAUDE.md requires "—".
  - **Unused page state.** `filters.position`, `minMinutes` and the price
    range are carried in page state with no control. Only `teamId` is used,
    and only through H1.

No stale closures or races found. The page's filter and sort memos list their
real inputs.

#### L9 — Filter ▾ button has no `aria-label`
- **Severity / confidence:** Low / High.
- **Where:** `components/ColumnFilterControl.tsx:277-289`. It has `title` but
  not `aria-label`, so screen readers announce "▾". CLAUDE.md asks icon
  buttons for both. Shared with Team Building's table.

### Audit 11 — Performance and API efficiency

Measured in the production build at 1600 px, all 667 rows rendered, no list
virtualisation:
- sorting takes 330–420 ms;
- switching Data View takes 420–480 ms;
- 5 search keystrokes take about 300 ms in total.

That is noticeable but acceptable, so it isn't a finding. Requests are
covered under Audit 1 (no duplicates in production, lazy profiles).

### Audit 12 — Docs match the app

#### L7 — Out-of-date wording
- **Severity / confidence:** Low / High.
- **In the app:**
  - The empty state says "Try clearing a filter — the criteria bar above…"
    (`PlayerExplorer.tsx:393`).
  - Clear filters' hover text says "the filter bar above" (line 357). No
    such bar exists any more.
- **In the User Guide:**
  - Line 300's example "salah" finds nobody: Salah isn't in the 2026/27
    player list.
  - Line 294 presents "Comparative Colouring" in bold as if it were a
    control. There's no toggle; it's always on.
  - Line 313's tip says "Set Position to MID, add the 'Points/£m' column".
    Position is now a column filter, and Pts/£m is already on by default.
- **Elsewhere:** the README PPG point is covered by M4.

Checked true:
- the User Guide's reorder, resize, sort (with "—" lowest), filter types,
  auto-fit, Reset, search and Export CSV claims (apart from L1's keyboard
  Enter);
- Next 5 Fixtures being off by default and always live;
- README's "no Min Minutes control on Player Explorer" and the `?team=`
  hand-off.

---

## 5. Needs verification (not counted as defects)

### V1 — How Historic Average counts games for per-game rates
- **Where:** `metrics/careerMetrics.ts:217-223` (`perGameOverKnownSeasons`)
  and `resolvePlayerStats.ts:203`. Games = ceil(average season minutes ÷ 90).
- **The rule:** CLAUDE.md says per-game rates use "estimatedGames from total
  minutes". There are three possible readings:
  1. average minutes, then round up (what the app does);
  2. total minutes, then round up, then divide by seasons;
  3. round up each season, then add them.
- **For regular starters** they differ by at most about one game a season
  (a few %).
- **For light seasons the gap is large.** Reed (2022/23–2025/26), checked by
  hand:

  | | App | From total minutes |
  |---|---|---|
  | Historic Average PPG | 44.75 ÷ ceil(1093.5/90) = 44.75 ÷ 13 = **3.4** | 179 ÷ 49 games = **3.7** |
  | Historic Average DC/Game | avg 12.5 DC ÷ ceil(94.5/90) = 12.5 ÷ 2 = **6.25** | 25 DC ÷ ceil(189/90) = 25 ÷ 3 = **8.33** |

- **Needs:** your decision on which definition is intended. Then the code or
  the docs should follow it.

### V2 — Nothing on this page is remembered
Column choices, order, widths, sort and filters reset whenever you leave
Player Explorer, and on every app restart. The docs don't promise otherwise,
so this isn't a defect, but you may expect a layout you built to stay. If you
want it kept, it would need a new versioned saved-data store, per the README
rules.

---

## 6. Recommended fix order

1. **H1.** Small, clear fix: seed the Team column filter instead of the
   hidden one, and clear `?team=` when filters are cleared. Highest user
   impact, low risk.
2. **M2 and L2.** Small changes to the shared column filter (also used in
   Team Building).
3. **M3.** Small, once you've chosen "clear it" or "show it".
4. **M1.** Needs your choice of floor or indicator, then a medium change.
   Reuse the Dashboard's `applyRateStatFloor` rules for consistency.
5. **M4 and V1.** Your decisions first. Then either a small code change with
   the docs, or a docs-only fix. These touch every page that shows PPG or
   Historic Average rates, so re-check the Dashboard afterwards.
6. **M5, M6 and L6.** The column-layout engine, fixed together. Shared with
   Team Building's Add Players table.
7. **L3, L4, L5, L1, L9.** Small, independent polish.
8. **L7 and L8.** Wording and dead-code tidy-up, with the fixes above.

---

## 7. Tests added

All in `client/`. No production code was changed.

| File | Tests | What they protect |
|---|---|---|
| `src/pages/PlayerExplorer.test.tsx` (new) | 5 passing | All players listed and counted; Team category filter; numeric ≥ filter; accent-insensitive search; Export CSV identical to the screen (headers, row order, formatted values) |
| | 4 `it.fails` | **H1** ×2 (`?team=` shows as an active Team filter; choosing another club then works), **M2** (Equal to 15.3 matches a value shown as 15.3), **L3** (A→Z name sort with accents) |
| `src/utils/playerSearch.test.ts` (new) | 5 passing | Blank query, accent-insensitivity including Ø, any-order names, typo tolerance on long names only |
| | 1 `it.fails` | **L5** ("B.Fernandes" finds only Bruno Fernandes) |
| `src/state/useColumnFilters.test.ts` (new) | 7 passing | Inclusive ≤/≥ and ranges; "—" fails an active filter; category filters; active detection; draft vs applied (Enter/Cancel); AND across columns; reset |
| `src/state/useColumnCustomization.test.ts` (new) | 5 passing | Toggle appends; drag reorder; foreign keys ignored; fit shares width with the minimum floor; Reset restores order and clears widths |

Each `it.fails` test was also run as a normal test. Each failed on the exact
assertion for its finding, not on setup:
- H1 active-filter test: `expected 'column-filter-icon' to contain 'active'`.
- H1 other-club test: `expected [] to deeply equal ['Ángel','Bob']`.
- M2: `expected [] to deeply equal ['Zubimendi']`.
- L3: `expected ['Bob','Zubimendi','Ángel',…]` to equal `['Ángel','Bob','Ødegaard',…]`.
- L5: `expected ['B.Fernandes','Fernandes','Nunes']` to equal `['B.Fernandes']`.

When a finding is fixed, Phase 2 should change its `it.fails` to `it`.

---

## 8. Final build and test results

| Check | Result |
|---|---|
| `npm run build` | Clean (exit 0) |
| `npm test` | 321/321 passed: server 45, client 276. Client was 249; the 27 new tests include 5 expected failures (`it.fails`) |

The dev server and the production server started for this audit were
stopped. Nothing was installed in the repo; Playwright ran from a scratch
folder.
