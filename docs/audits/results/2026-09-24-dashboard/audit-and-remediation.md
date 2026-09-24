# Dashboard Audit and Remediation — 2026-09-24

**Scope:** The Dashboard page (`client/src/pages/Dashboard.tsx`) and everything
it relies on: summary tiles, graphs, saved views, the Add/Edit dialogs, the
chart components (`components/charts/`), the tile/graph/view stores, and the
metric pipeline they read from. The Team Profile overlay was in scope only as
far as the Dashboard links to it.
**Baseline:** HEAD `c56ff1d` (v1.63.1). 264/264 tests passed (client 219,
server 45) and `npm run build` was clean before any change.
**Method:**
- Read the Dashboard code and its stores, chart components and metric functions.
- Ran the real app (`npm run dev`) against the live 2026/27 FPL API (Gameweek 5
  finished, Gameweek 6 next) and drove it with headless Chromium (Playwright,
  throwaway scripts outside the repo).
- Built every player and team statistic as a tile in all three Data Views and
  both orders (306 tiles).
- Built every graph metric as a bar chart, plus 14 scatter pairs, in all three
  Data Views (180 graphs).
- Scanned all of the above for crashes and bad values (NaN, Infinity,
  undefined).
- Exercised every dialog, view and drag flow by hand.
- Cross-checked suspicious figures against the raw API (`bootstrap-static`,
  `element-summary`).

**No crash or bad value** (NaN, Infinity, undefined) appeared in any of the
486 tiles and graphs. The findings below are wrong or misleading numbers,
broken interactions, and gaps between the app and its own documentation.

Remediation followed in the same session, at the owner's request. The
outcome for each finding is in "Remediation" at the end.

---

## Serious — the page shows wrong or misleading information

### D1. Historic Average DC/Game is inflated, sometimes to impossible values
- **Where:** `metrics/careerMetrics.ts` (`avgDefensiveContributionPerSeason`),
  used by `metrics/resolvePlayerStats.ts` (Historic Average branch). The code
  is shared, so every page's Historic Average DC/Game is affected.
- **What:** DC is averaged over only the window seasons where FPL tracked it
  (2024/25 onward), but it is divided by average minutes over **all** window
  seasons. A player with light or zero-minute early seasons gets far too few
  "games" for his DC total.
- **Evidence:** figures recomputed from raw `history_past` match the app to the
  decimal.

  | Player | App shows | App's inputs | Correct figure (DC seasons only) |
  |---|---|---|---|
  | Anderson | 21.95 | 461 DC ÷ 21 games | 13.56 |
  | Iroegbunam | 21.43 | 150 DC ÷ 7 games | 12.50 |
  | Ampadu | 34.67 | 416 DC ÷ 12 games | 11.89 |

  Anderson's 21 and Iroegbunam's 7 games come from average minutes across all
  4 window seasons; Ampadu's 12 come from his 3 window seasons, two of them 0
  minutes.

### D2. Most per-game leaderboards have no minutes floor
- **Where:** `components/summaryTileMetrics.ts`, `RATE_PER_MINUTES_COLUMN_KEYS`.
- **What:** only PPG, DC/Game, Goals/Game and Assists/Game get the
  90-minute (Current Season) or 450-minute (other views) floor. xG/Game,
  xA/Game, xGI/Game, xGC/Game and Def. Reward/Game don't, so one-cameo players
  top them. Graphs apply no floor to any rate metric.
- **Evidence:**
  - Current Season xG/Game is led by Hinshelwood (1.41) on 63 minutes.
  - Last Season "lowest xGC/Game" is led by Oriola and Byfield, 1 minute each.
  - Last Season Def. Reward/Game is led by Benitez (4.00) on one 90-minute
    match.

### D3. Bar charts always rank highest number first
- **Where:** `components/charts/BarTopN.tsx` sorts descending unconditionally.
- **What:** for lower-is-better metrics, "Top 15" shows the worst 15.
- **Evidence:**
  - "Top 15 — League Position" (Last Season) starts Spurs, Nott'm Forest,
    Crystal Palace, Leeds, Everton, and leaves out the actual top clubs.
  - Goals Against and xGC/Game are likewise worst-first.

### D4. Hovering a scatter point doesn't identify it
- **Where:** `components/charts/ScatterWithReference.tsx` (a `ComposedChart`
  with an axis-triggered tooltip).
- **What:**
  - Graphs without the trend line never show a tooltip: 0 hits at 81 grid
    positions on "Price vs Points".
  - Graphs with the trend line show one anywhere over the plot, keyed to the
    x-position alone. Sweeping "xG vs Goals" showed the same name at all 8
    heights of each column, so it names the wrong player.
- The User Guide promises "hovering a point always shows its real values".
  Clicking a point works (24/24 opened the right profile).

## Medium

### D5. Min Minutes can't be typed into
- **Where:** `components/FiltersBar.tsx`. The input rounds to the nearest 90 on
  every keystroke.
- **Evidence:**
  - Typing "450" key by key leaves the box showing "00" (value 0).
  - Entering "1000" becomes 990.
- Shared control: every page's Min Minutes behaves the same way.

### D6. One unrecognised saved Data View blanks the whole Dashboard
- **Where:** `Dashboard.tsx` indexes `resolvedByMode[tile.dataView]` without
  checking the value. `normalizeSummaryTile` and `normalizeDashboardGraph`
  don't validate `dataView`.
- **Related gap:** saved views never normalised their embedded tiles at all
  (only graphs), so an older-shaped tile loaded from a view went on screen
  raw.
- **Evidence:** setting one stored tile's `dataView` to an unknown value gives
  a blank page ("Cannot read properties of undefined (reading 'filter')") on
  every reload, with no recovery short of clearing storage.

### D7. Delete View has no confirmation
- One click permanently removes a view with all its tiles and graphs.

### D8. The tile/graph limit message counts hidden tiles
- **What:** the 20-tile (and 10-graph) cap spans both scopes. With 17 player
  tiles on screen and Team's 3 hidden, adding one says "You already have 20
  tiles".

## Low / polish

- **D9.** The User Guide says a tile's name can be left blank for the
  automatic title. The dialog requires a name.
- **D10.** "Up to 5 views" includes the permanent Default, so there are only 4
  of your own. The guide and the error message don't say so.
- **D11.** Duplicate view names are accepted, including a second "Default".
- **D12.** Default-view tiles and graphs show a grab cursor but snap back when
  dropped (Default can't be reordered).
- **D13.** A min price above the max price is accepted silently and gives an
  empty tile. Negative prices are accepted.
- **D14.** A tile or graph whose statistic no longer exists disappears from
  the grid but still sits in storage and counts toward the cap, and it can't
  be removed.
- **D15.** A long name with no spaces spills out of its card and pushes the
  Edit/Remove buttons off-screen.
- **D16.** Bar charts of small whole-number stats repeat axis labels
  ("0, 1, 2, 2, 3").
- **D17.** While a gameweek is in play, the Gameweek Status card shows its
  already-passed deadline and a full progress bar.
- **D18.** If the historic data fails to load, every dependent tile says "No
  eligible players", which reads like a filter result. The error banner and
  Retry do work (verified).
- **D19.** Escape doesn't close the Dashboard's dialogs.

## Outside the Dashboard, reached from it

- **D20.** The Team Profile header reads e.g. "2nd in table · 0 pts · 5 played
  · 4W 0D 1L". FPL's `team.points` is always 0. The app recomputes played and
  W/D/L from finished fixtures (`normalize/deriveTeamStandings.ts`) but never
  recomputes points. The Dashboard's own League Points tiles are correct.

## Checked and fine

- Default tiles and graphs, the Gameweek Status card (GW5 finished → GW6
  deadline 10 Oct), and team row clicks opening Team Profile.
- Edit keeps a tile's position.
- Switching views keeps each view's content, and survives a reload and a
  Players/Teams toggle.
- Deleting a view falls back to Default.
- Historic error banner and Retry.
- Axis planning for all-zero, single-point, negative and very-long-tail data
  (no crash, no data outside the axis).
- 0.0 PPG for zero-minute players is documented and intentional
  (`<ppg_vs_per90>`).

---

## Remediation

Released as **v1.64.0**. Every finding was fixed.

**Verification:**
- `npm run build` is clean.
- `npm test` passes 294/294 (client 249, server 45; 30 new tests).
- Each fix was re-checked in the running app against the live API with the
  same Playwright scripts that found it.
- The 306-tile and 180-graph sweeps were re-run with no crash, bad value,
  empty graph or repeated axis label.
- The new Min Minutes/price tests were also run against the old
  `FiltersBar.tsx`, and failed there as they should.

| # | Fix | Evidence after the fix |
|---|---|---|
| D1 | `computeCareerAverages` returns per-game rates (`xGPerGame` … `defensiveContributionPerGame`) worked out over the same seasons each stat is averaged over (`<matched_season_rates>`), and `resolvePlayerStats` uses them. Stats known every season (xG etc.) give the same result as before. | Historic Average DC/Game: Anderson 13.56, Iroegbunam 12.50, Ampadu 11.89, matching the hand calculation. The leaderboard now tops out at 13.56. `careerMetrics.test.ts` uses Anderson's real seasons. |
| D2 | Every per-game column is flagged `ratePerMinutes` (`isRatePerMinutesColumnKey`). Graphs plotting one get the same floor as tiles (`applyRateStatFloor`), except for specifically picked players. | Current Season xG/Game: Haaland 0.88, Isidor 0.75, Isak… Last Season lowest xGC/Game: Calafiori 0.51, Merino… Def. Reward/Game: Gabriel 3.29… A test fails if a future `…PerGame` column isn't flagged. |
| D3 | Graphs gained `direction`, shown as an **Order** control for bar charts. It defaults to the metric's natural order (`defaultGraphDirection`) and is backfilled for older graphs. Graphs store v4→5 and saved-views store v4→5. The 3→4 live-Min-Minutes clear is limited to data older than v4 (a bump would otherwise have re-run it and wiped settings chosen under v4). | "League Position" bars: Arsenal, Man City, Man Utd, Aston Villa, Liverpool. An unmigrated v4 graph loads the same way. Migration tests cover the backfill, a retired metric key, keeping v4 Min Minutes and keeping a stored direction. |
| D4 | `ScatterWithReference` is now a `ScatterChart` (tooltip follows the hovered point), with y = x drawn as a `ReferenceLine` segment. The tooltip shows metric names and formats. | Tooltip on 20/20 hovered dots on both "Price vs Points" and "xG vs Goals", nothing over empty space, and the trend line still drawn. Values match the API (Raya: Price £6.1m · Points 162). |
| D5 | Min Minutes keeps what's typed (any whole number ≥ 0). The box may be blank while editing and shows the real value when you leave it. The arrow buttons still step by 90. | Typing "450" gives 450; "1000" stays 1000. `FiltersBar.test.tsx` fails on the old code. |
| D6 | `normalizeSummaryTile`/`normalizeDashboardGraph` replace an unrecognised `dataView` (and order) with the default. Saved views now normalise their embedded tiles as well as graphs. | A tile stored with `dataView: "nextSeason"` loads as Last Completed Season and the page renders. Store tests cover all three stores. |
| D7 | Delete View opens a confirm dialog naming the view. | Cancel keeps it (5 → 5 views); Delete removes it (5 → 4). |
| D8 | The cap messages (add and load) say the limit counts Players and Teams together, with the split. | "You already have 20 tiles across Players and Teams (17 here, 3 in Teams)…" |
| D9 | The User Guide now says every tile needs a name. | — |
| D10 | The error and the User Guide say "5 views, Default included". | "You already have 5 player views, Default included…" |
| D11 | View names must be unique within a scope (not case-sensitive). | "default" and a repeated "Test View" are both refused. |
| D12 | Default-view tiles and graphs aren't draggable. | 0 draggable cards in Default. |
| D13 | Add Tile/Graph is disabled when min price > max price ("Min price is above max price"). Prices can't go below £0m. | Confirmed in the dialog; "-5" is stored as 0. |
| D14 | A tile or graph whose metric no longer exists shows as an "unavailable" card with Remove. | Both ghosts shown and removed; storage then holds only the valid tile. |
| D15 | `.card-title` wraps long words (`overflow-wrap: anywhere; min-width: 0`), the header buttons don't shrink, and names are capped at 60 characters. | The Edit button stays inside the card; no horizontal scroll. |
| D16 | Bar charts of whole-number data get whole-number ticks. | Draws axis: 0, 1, 2, 3, 4. |
| D17 | `gameweekDisplay()`: a gameweek being played shows "In progress · next deadline …" with progress toward that deadline. | Simulated GW6 in progress: "In progress · next deadline Sat 17 Oct, 11:00". Unit tests cover in-progress, finished, last-of-season and pre-season. |
| D18 | Tiles and graphs that need historic data say "Loading historic data…" or "Historic data couldn't be loaded." instead of "No eligible players". | With `/api/historic-bulk` returning 503: "Historic data couldn't be loaded." |
| D19 | Escape closes any Dashboard dialog. | Confirmed. |
| D20 | `applyRealTeamStandings` also derives league points (3 per win, 1 per draw) from finished fixtures. | Team Profile: "2nd in table · 12 pts · 5 played · 4W 0D 1L". `deriveTeamStandings.test.ts` added. |

**Existing test changed:** `useSavedDashboardViews.test.tsx` "leaves non-Default
entries completely untouched by the Default resync" compared a custom view's
tiles to the raw stored JSON. Custom-view tiles are now deliberately
normalised (D6), so it compares to the same tiles after `normalizeSummaryTile`
and additionally checks it is still the user's own tile. The check isn't
loosened, and its purpose (Default resync never replaces a custom view's
content) still holds.

**Not changed:** the app has no error boundary, so a future crash in any page
still shows a blank screen. D6 fixes the one known cause at its root. A
friendly error screen app-wide would be a separate, small piece of work.
