# Player Explorer Audit — Phase 2 (Remediation) — 2026-09-25

**Input:** `1-audit.md` in this folder (Phase 1 commit `e4c9923`; no commits
since, clean tree at start).

**Owner decisions used** (given at the start of this session):
- **M1:** no minutes floor on Player Explorer's per-game columns; the user
  sets one with the Mins filter. The Dashboard's floor belongs only on the
  packaged Default view, which the user can't edit. It should be removed
  from tiles and graphs users build.
- **M3:** hiding a column removes its filter.
- **M4:** PPG is the app's points per estimated game in every view.

V1 and V2 were not decided, so they are left open (section 4).

---

## 1. Summary for the owner

**Everything confirmed in Phase 1 is fixed: 1 High, 6 Medium, 9 Low.** Each
fix has a test that fails on the old code and passes now. Each was also
checked in the running app with the audit's own steps.

**What you'll notice:**
- **Player Rankings from Teams now sets the Team column's own filter.** The ▾
  lights up and shows the club. You can switch it to another club or clear
  it. It no longer sticks in the address, so a reload shows everyone. A bad
  link (`?team=99`) shows all players instead of none.
- **Per-game leaderboards have no hidden floor on anything you build.** On
  Player Explorer, as you chose, sorting by PPG puts one-appearance players
  like Reed (15.0) on top until you filter Mins. The same now applies to
  Dashboard tiles and graphs you've built. **Your existing per-game tiles
  will show low-minute players they used to hide**; raise that tile's Min
  Minutes to get the old list back. The Default view keeps the floor.
  None of the Default view's tiles or graphs shows a per-game stat, so
  nothing changes there today.
- **PPG is now the same measure everywhere.** In Current Season it used to
  be FPL's points per appearance; now it's points per estimated game, like
  every other per-game column. On live data this changes the Current
  Season PPG of 163 of the 421 players who have played by 0.5 or more.
  Examples: Cho 2.2 → 9.0 and Isidor 3.0 → 7.5. Regular starters barely
  move (Haaland 7.8 either way). This shows in Player Explorer, the
  profile, Player Comparison, Team Building's Current Season columns and
  the Dashboard.
- **Filters match what you see.** Equal to 15.3 finds a player shown as 15.3.
  ≤ and ≥ work the same way.
- **Hiding a column removes its filter.** This also applies to Team
  Building's Add Players table, which shares the same filter engine.
- **Column widths behave.** The resize handle works along its whole width.
  A width you set by hand stays through window resizes and column toggles
  until Reset. Next 5 Fixtures opens wide enough for all five fixtures.
- **Smaller things:**
  - Enter confirms a filter.
  - Escape closes a filter, the Columns picker or a player profile.
  - Clicking outside closes the Columns picker.
  - An impossible range (≥ above ≤) can't be applied.
  - Names sort alphabetically, accents included.
  - Position sorts GKP → DEF → MID → FWD.
  - Searching "B.Fernandes" finds only Bruno Fernandes.
  - Out-of-date wording is corrected in the app and the User Guide.

**Not done:** V1 and V2 need your decision (section 4).

---

## 2. Findings and evidence

"Old → new" values are from the running app (dev server, live 2026/27 API,
GW5 finished, fresh browser context) unless marked as a test.

| ID | Outcome | Root cause | Fix (files) | Tests | Evidence |
|---|---|---|---|---|---|
| H1 | Fixed | `?team=` seeded a separate `filters.teamId` that had no control and wasn't the Team column's filter | `PlayerExplorer.tsx`: `?team=` sets the Team column filter (`setColumnFilter`, seeded at mount and on later arrival), then is removed from the address (`replace`). An unknown id is dropped. `useColumnFilters.ts`: `setColumnFilter`, optional initial filters | 2 Phase 1 `it.fails` → `it`; 2 new (address cleared + Clear filters; unknown id) | Teams → Arsenal "Player Rankings": URL `/players` (was `?team=1`), 29/667, Team ▾ active, reads "ARS". Show only CHE → 34/667 Chelsea (was 0/667). Clear filters → 667/667; reload → 667/667 (was 29/667). `?team=abc` and `?team=99` → 667/667 (was 0) |
| M1 | Fixed, per owner's decision | The Dashboard applied `applyRateStatFloor` to every criteria-based tile and graph, including user-built ones | `Dashboard.tsx`: new `playersForDashboardItem` (one helper for tiles and graphs, which had duplicated code) applies the floor only when `isPackagedDefaultTile`/`isPackagedDefaultGraph` (new, in `useSummaryTiles.ts`/`useDashboardGraphs.ts`). Player Explorer unchanged (no floor) | 5 new in `Dashboard.helpers.test.ts` | Seeded a user view with a Last Season PPG tile: no Min Minutes → Reed 15.0, Onyeka 12.0, Chiesa 9.3 (the old floor hid all three). Same tile with Min Minutes 450 → Osula 8.4, Haaland 7.2. Explorer Last Season PPG top: Reed, Onyeka, Chiesa, as decided |
| M2 | Fixed | Filters compared the full-precision value (15.3197) with what was typed (15.3) | `useColumnFilters.ts`: `columnFilterPasses`/`passesAllFilters` take the column's `decimals` and compare the value rounded as displayed (`roundAsDisplayed`, `utils/format.ts`, same rounding as the cell), for =, ≤ and ≥. `playerColumns.tsx`: each column has `decimals`. `TeamBuilder.tsx`: predictive columns have `decimals` and pass them | Phase 1 `it.fails` → `it`; 2 new engine tests (incl. 15.35 shown as "15.4") | Last Season, Pts/£m Equal to 15.3 → 4/667: Haaland, Kroupi.Jr, Reijnders, Tonali, all shown as 15.3 (was 0/667) |
| M3 | Fixed, per owner's decision | Every stored filter applied whether or not its column was visible | `useColumnFilters.ts`: `clearFilter`. `PlayerExplorer.tsx` `handleToggleColumn` and `TeamBuilder.tsx` `togglePickerColumn` clear a column's filter when it's hidden | 1 page test, 1 engine test | Goals ≥ 10 → 21/667; untick Goals → 667/667 (was 21/667). Re-showing Goals: ▾ not active |
| M4 | Fixed, per owner's decision | `normalizePlayers.ts` read FPL's `points_per_game` (per appearance) and `resolvePlayerStats.ts` kept it for Current Season | `normalizePlayers.ts` no longer reads it (placeholder `null`, like the other per-game fields). `resolvePlayerStats.ts` live branch sets `estimatedPointsPerGame(totalPoints, minutes)`. `dictionary.ts` PPG entry rewritten (derived; formula; per-appearance caveat). Comments in `calculations.ts`, `playerMetrics.ts` | 1 in `resolvePlayerStats.test.ts`, 1 in `normalizePlayers.test.ts` | Live API: 163 of 421 played players differ by ≥ 0.5. Current Season in app: Cho 9 pts/72 min → PPG 9.0 (FPL 2.2); Isidor 15/117 → 7.5 (FPL 3.0); Haaland 39/450 → 7.8 (FPL 7.8). Cho's profile PPG tile: 9.0, matching the table |
| M5 | Fixed | Handle at `right: -4px` overhung its header; the next sticky header (its own layer) covered the outer half | `styles/components.css`: handle at `right: 0`, wholly inside its own header | Layout: not testable in jsdom | Hit test across Own%'s edge: all 8 px (−8…−1) return the handle (was only the left 4). Drag from the handle's middle: Own% 85 → 165 px, sort unchanged (was: sorted by Price). xG edge drag: 61 → 105 px, order unchanged (was: moved xA) |
| M6 | Fixed | `fitToBox` gave every column the same width | `useColumnCustomization.ts`: optional per-column `minWidths`; fit gives those first, the rest share the remainder. `PlayerExplorer.tsx`: Next 5 Fixtures minimum 190 px | 1 engine test | 1600 px, Next 5 Fixtures on: 190 px (was 72), 5/5 chips fully visible (was ~2), table fits exactly (scrollWidth = clientWidth 1290; was 40 px overflow) |
| L1 | Fixed | No key handling in the filter popover; no Escape or outside-click handlers | `ColumnFilterControl.tsx`: Enter in a field applies (a focused button keeps its own action); Escape cancels. `PlayerExplorer.tsx`: Columns picker closes on Escape or an outside click. `PlayerDetailOverlay.tsx`: Escape closes the profile | 2 page tests | Points ≥ 200 + Enter key → 4/667, popover closed. Escape closes filter (not applied), Columns picker (Escape and outside click) and profile (`?player=` removed) |
| L2 | Fixed | No validation | `useColumnFilters.ts`: `columnFilterProblem` (≥ above ≤, or = outside the range); `confirmFilter` refuses; Enter button disabled with the reason as hover text, like the Dashboard's price check (D13) | 1 page test, 1 engine test | Points ≤ 100 and ≥ 200: Enter disabled, title "“Greater than or equal to” is above “Less than or equal to”"; Enter key does nothing (667/667, popover stays open) |
| L3 | Fixed | Strings compared with `<` (character codes) | `useSortSpec.ts`: `Intl.Collator("en-GB", { sensitivity: "base" })` for strings | Phase 1 `it.fails` → `it` | A→Z starts A.Becker, A.García, A.Murphy and ends Zetterer, Zirkzee, Zubimendi. Ødegaard 475th, Šeško 561st, van Ewijk 622nd of 667 (all were after Z) |
| L4 | Fixed | Position sorted as a string | `PlayerExplorer.tsx`: sort by `POSITION_SORT_RANK` (filtering still uses the label) | 1 page test | First click: GKP → DEF → MID → FWD (was MID, GKP, FWD, DEF) |
| L5 | Fixed | The query wasn't split on "." like names are. After splitting, a lone initial ("b") matched any name containing that letter | `playerSearch.ts`: query split with the same `WORD_SEPARATORS` as names; a one-letter word must start a name word | Phase 1 `it.fails` → `it`; 1 new (initials, including a G.Jesus fixture) | "B.Fernandes" → 1/667, B.Fernandes (was 3; a split-only fix still returned G.Jesus live, hence the initials rule) |
| L6 | Fixed | `fitToBox` rebuilt all widths from the visible configurable columns (dropping hand-set and identity widths). It was also called from a resize listener registered once, so it used the first render's columns | `useColumnCustomization.ts`: hand-dragged widths are kept until Reset and the rest share what's left; reads columns via refs. `PlayerExplorer.tsx`: measures the fixed block using hand-set widths where the browser squeezed them, and fits again once the new widths lay out | 4 engine tests (kept width, identity width kept, stale-listener, Reset) | Price dragged 83 → 143 px; window 1600 → 1500: 143 px (was 78); Bonus on: 143; Bonus off: 143; table fits exactly each time |
| L7 | Fixed | Wording left from the removed criteria bar; outdated guide examples | `PlayerExplorer.tsx`: empty state "Try clearing the search or a column filter…"; Clear filters "Clear every filter — the search box and every column filter". `UserGuide.tsx`: "sesko" example instead of "salah"; comparative colouring no longer bold like a control; tip uses the Position column's ▾ | — | Both new strings seen in the app; "sesko" finds Šeško |
| L8 | Fixed | Dead or unreachable code | Removed: the unreachable "Building the historic dataset…" empty state; `goalsMinusXG`/`assistsMinusXA` special cases; unused `signed`/`DASH` re-exports (`playerColumns.tsx`); `ANALYSIS_MODE_LABELS`; `useFilteredPlayers` hook (the page now keeps just `search`); unused page filter state. Historic Average `?? 0` fallbacks removed, so a missing average would show "—", not 0 | Existing suites pass | Build clean; 301/301 client tests |
| L9 | Fixed | `title` only | `ColumnFilterControl.tsx`: `aria-label` matching the hover text | 1 page test | ▾ `aria-label="Filter this column"` |
| V1 | Open | — | — | — | Needs your decision (section 4) |
| V2 | Open | — | — | — | Needs your decision (section 4) |

**Proof the new tests catch the old bugs:** with only the production changes
set aside (tests kept), all 28 new and converted tests failed. Each failed on
its own assertion or on a missing new function. Examples: H1 `expected
'?team=1' to be ''`; M2 `expected [] to deeply equal ['Zubimendi']`; M4
`expected 2.2 to be 9`; L6 `expected { totalPoints: 100, goals: 100, … } to
deeply equal { totalPoints: 80, goals: 160, … }`; M6 `expected { …: 133 } to
deeply equal { …: 105, fixtures: 190 }`. The later L5 initials test fails on
the old code too (its fixtures include G.Jesus).

---

## 3. Judgement calls

- **M1 — existing Dashboard tiles change what they show, with no migration.**
  Nothing stored changed meaning: a tile's Min Minutes is still that tile's
  own filter. The rule that added a hidden floor on top is what went. So
  there's no `STORAGE_VERSION` bump. The alternative was a migration raising
  each saved per-game tile's Min Minutes to 450 (or 90 in Current Season),
  which would keep its old list as a visible, editable number. I didn't do
  it: your instruction was that the floor comes off custom views. Say if you
  want it.
- **M1 — the Default-view floor is kept even though nothing uses it today.**
  No packaged Default tile or graph shows a per-game stat. So
  `playersForDashboardItem` only floors a default if one is added later.
  README and HISTORY say so.
- **M2 — ≤ and ≥ also compare as displayed**, not just Equal to. Otherwise
  "≤ 15.3" would leave out a player shown as 15.3 while "= 15.3" includes
  him.
- **M3 and M2 also apply to Team Building's Add Players table.** It uses the
  same filter engine, and a hidden-but-active filter there has the same
  problem. That table's behaviour was checked by the shared engine tests,
  not in the running app.
- **M4 — Expected Points is unaffected.** It uses Last Season and Historic
  Average PPG only, which were already per estimated game. A 0-minute,
  0-point player shows 0.0 in Current Season, as in the other views.
- **H1 — `?team=` is removed from the address once applied.** Nothing else on
  this page survives a reload (V2), so a reload now shows everyone. The
  address is replaced rather than added to, so Back should still go to
  Teams (by design; not checked in the app).
- **L4 — pitch order on the first (descending) click.** GKP, DEF, MID, FWD
  comes first because that's what the first click gives on every column.
- **L5 — a one-letter search word is now an initial.** Typing just "e" finds
  players with a name word starting with E, not every name containing an E.
- **L6 — when hand-set widths can't all fit, the browser shrinks every
  column.** A test that widened Own%, xG and Price and added a column at
  1500 px showed Price at 98 px. There wasn't room, so the table was trimmed
  to fit the window rather than scrolling sideways.
- **Tests:** no test was weakened or removed. The five Phase 1 `it.fails`
  became `it` unchanged. The L5 test gained one fixture player (G.Jesus),
  which makes it stricter.

---

## 4. Left open for you

- **V1 — how Historic Average counts games for per-game rates.** Not changed.
  Today it's the average season's minutes ÷ 90, rounded up. CLAUDE.md says
  "estimatedGames from total minutes". For regular starters the difference
  is a few percent. For light seasons it's large, e.g. Reed's Historic
  Average PPG is 3.4 vs 3.7. Choose one and either the code or CLAUDE.md
  follows.
- **V2 — Player Explorer remembers nothing between visits** (columns, widths,
  sort, filters). Unchanged. Keeping them would need a new saved-data store.
- **Noticed, not changed:** sorting by a column you then hide keeps the
  sort, with no arrow on screen. It's the same kind of invisible state as M3
  but wasn't a finding. Say if hiding should also drop the sort.

---

## 5. Final build and test results

| Check | Result |
|---|---|
| `npm run build` | Clean (exit 0; Vite's usual large-chunk warning only) |
| `npm test` | 346/346 passed: server 45, client 301 (was 276; 25 new tests, and the 5 Phase 1 `it.fails` are now normal tests) |

The dev server started for the app checks was stopped. Playwright ran from a
scratch folder outside the repo; nothing was installed in the repo.
