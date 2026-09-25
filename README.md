# FPL Analytics Dashboard — 2026/27

A scouting and analytics dashboard for Fantasy Premier League, built on the
**live official FPL API**. No mock data, no database, no accounts — a small
Express proxy and a React UI, shipped as a Windows desktop app.

**Just want to use it?** Download the installer from
[the latest release](https://github.com/requiemalex/fpl-analytics-dashboard/releases/latest).
It updates itself. Everything below is for developing the app.

## Where things are documented

| Document | What it's for |
|---|---|
| `README.md` (this file) | How the app works **now** — architecture, data rules, methodology, storage, releases |
| In-app User Guide (`client/src/pages/UserGuide.tsx`) | What each page does and how to use it — the user-facing feature reference |
| `DEPLOYMENT.md` | Desktop-app build, packaging, auto-update, and the retired web-hosting setup |
| `docs/HISTORY.md` | How the app **used to** work — archived. Only for understanding or restoring something old |
| `docs/audits/` | Audits: `strategy/` holds the reusable three-phase prompts, `results/` one dated folder per past run (index in `docs/audits/README.md`) |
| `CLAUDE.md` | Working rules for AI-assisted development |

Keep this file describing the current app: when behaviour changes, edit the
relevant section here rather than appending a changelog entry. When a
feature is removed or replaced, record it in `docs/HISTORY.md` (see its
header).

---

## Getting started

Requires Node.js 18.18+ (20 LTS recommended) and internet access to
`fantasy.premierleague.com`. npm workspaces — one install covers both
packages.

```bash
npm install
npm run dev      # server :4000 + client :5173 (Vite proxies /api/*) — open http://localhost:5173
```

| Command | Effect |
|---|---|
| `npm run dev` | Server and client together |
| `npm run server` / `npm run client` | One side only |
| `npm run build` | Type-checks (`tsc`) and builds both — the main correctness check besides tests |
| `npm test` | Vitest, server then client |
| `npm start` | Runs the production build (server also serves the built client) |
| `npm run electron:start` | Builds and launches the desktop app locally |
| `npm run electron:build` | Packages the Windows installer into `release/` |
| `npm run club-history:*` | Club-history data scripts — see "Club history" |

There is no lint script. TypeScript runs `strict`, with `noUnusedLocals`/
`noUnusedParameters` off.

---

## Architecture

```
FPL API -> Express proxy (server/)       caching, timeouts, retries, stale fallback
        -> api/client.ts                 the only place the client fetches (relative /api/* paths only)
        -> validation/ (Zod)             per-record: a bad record is skipped and counted, never fatal
        -> types/raw.ts -> normalize/    raw FPL fields never reach the UI
        -> metrics/                      pure, null-safe calculations
        -> state/AppStateContext.tsx     shared data, fetched once
        -> pages/, components/
```

```
server/src/
  config.ts            TTLs, timeout, retry policy, bulk concurrency — all tunables in one place
  cache.ts, proxy.ts   in-memory TTL cache, request de-duplication, stale-cache fallback
  httpClient.ts        fetch with timeout + capped retry
  concurrency.ts       worker pool for the historic bulk build
  routes/              one file per proxied endpoint
  clubHistory/         ledger -> per-club season aggregates (see "Club history")
  app.ts / index.ts    createApp() (shared with Electron) / dev+prod entry point
client/src/
  api/ validation/ types/ normalize/ metrics/ state/ components/ pages/ styles/ utils/
electron/main.js       desktop shell — starts the bundled server on :4317
scripts/club-history/  snapshot, backfill, archive, build-aggregates
data/                  club-history ledgers and the frozen vaastav snapshot
```

**Shared vs per-page state.** `AppStateContext` holds only shared,
expensive-to-fetch data: players, teams, fixtures, events, historic profiles
(`historicProfiles`, `allTimeSeasonsByPlayerId`), club seasons. It polls
`bootstrap-static` silently every 10 minutes. Analysis mode and filters are
**per page** — each page keeps its own in `useState` and renders the
controlled `AnalysisModeToggle`/`FiltersBar`; nothing a page does can change
another page. The one cross-page hand-off (Teams → Player Explorer filtered
to a club) goes through the `?team=<id>` URL param, which Player Explorer
turns into its Team column filter and then removes from the address. Arriving
while the page is already open (the Team Profile's link) also clears the
search and every other column filter, so both routes show the whole club.
Overlays use URL params
too: `?player=<id>` (player profile), `?teamProfile=<id>` (team profile),
`?players=id,id` (Player Comparison selection).

**Pages:** Dashboard (`/`), Player Explorer (`/players`), Teams (`/teams`),
Player Comparison (`/player-comparison`), Team Building (`/team-building`),
User Guide (`/guide`), plus the player and team profile overlays.

## API endpoints and caching

| Endpoint (proxied at the same path under `/api/`) | Used for | Cache |
|---|---|---|
| `bootstrap-static/` | Players, teams, positions, gameweeks | 10 min |
| `fixtures/` | Fixtures and FDR | 30 min |
| `element-summary/{id}/` | One player's gameweek history — fetched lazily when a profile opens | 30 min |
| `historic-bulk` (app's own) | Every player's `history_past` plus this season's club data, built server-side from hundreds of `element-summary` calls | 12 h |
| `entry/{id}/`, `entry/{id}/history/`, `entry/{id}/event/{gw}/picks/` | Team Building's FPL team import (read-only, unauthenticated) | 2 min |
| `event/{gw}/live/` | Proxied, not currently used by the client | 60 s |

Outbound requests time out after 8 s and retry twice (capped backoff) on
network errors or 5xx only. Concurrent requests for the same resource share
one upstream call. **Refresh Data** calls `/api/refresh/*`, which bypasses
the cache (a refresh never piggybacks on a non-refresh request in flight).
If the upstream fails, the server serves its last cached copy and the client
shows a "stale data" banner — never blank, never presented as current.

**The historic bulk build** (`server/src/routes/historicBulk.ts`) fetches
every player's `element-summary` 15 at a time. A cold build takes up to a
minute, so it is demand-driven: a page that needs historic data calls
`requestHistoricData()` on mount. It never runs at startup. A handful of
failures are reported as `skippedPlayerIds`; more than half failing counts
as a failed build and falls back to the stale cache.

---

## Data rules

**Inspect, don't assume.** Field availability is detected from the live
response (`normalize/fieldAvailability.ts`). A missing field makes that
metric `null` for everyone, shown as "—" (`DASH`, `utils/format.ts`), and
the User Guide's Metric reference lists which fields were found. Nothing is
substituted from another statistic.

**Units and identity.** `now_cost` is £0.1m units. Price, ownership,
availability, and a player's name/club/position are **always live**, in
every analysis mode — including the Price column and everything derived
from price, such as Points/£m (`<price_always_live>`,
`resolvePlayerStats.ts`). The one exception is the Career History
season-by-season table, which shows what a player cost at the time.

### Analysis modes

Every analysis page has the same three-way toggle, resolved through
`metrics/resolvePlayerStats.ts`. Team Building doesn't use it — see below.

- **Last Completed Season** — that season's actual totals, however much or
  little the player played.
- **Historic Average** — the mean across the last **4 completed seasons**
  the player has, light seasons included (`<no_survivorship_bias>`,
  `metrics/historicAnalysis.ts`). `MIN_QUALIFYING_SEASON_MINUTES` (900) only
  marks a season "light" in charts and gates Expected Points' reliability.
  Per-game rates count games from the **total** minutes across the
  seasons, rounded up once (`<games_from_total_minutes>`,
  `metrics/calculations.ts`), so each is total stat ÷ total games — never
  the average season's minutes rounded up, which added up to a game per
  season for light seasons. A stat missing for some seasons (DC before
  2024/25) is averaged over the seasons that have it, and its per-game rate
  uses those same seasons' minutes (`<matched_season_rates>`,
  `metrics/careerMetrics.ts`) — never the whole window's minutes, which
  inflated DC/Game.
- **Current Season** — live bootstrap fields. Before any club has played
  (`currentSeasonHasStarted`), FPL still carries last season's totals in
  those fields, so cumulative stats are zeroed (a true zero, not unknown)
  and rates become `null`.

The reference season rolls forward on its own: it's the most recent
`season_name` anywhere in the pool's `history_past`
(`determineReferenceSeason`). A player with no data for the selected mode
is **kept, not dropped or zeroed**: every performance field comes back
`null` and shows "—" (`<retained_not_omitted>`; check with
`hasDataForMode()`).

### Minimum minutes

- Default 0 everywhere (`DEFAULT_MIN_MINUTES`, `state/scoutingFilters.ts`).
  A player whose minutes are `null` for the mode is retained, not filtered.
- Most pages **bypass** Min Minutes in Current Season (`effectiveMinMinutes`,
  `state/useFilteredPlayers.ts`; Team Building: `pickerEffectiveMinMinutes`).
- **Dashboard tiles and graphs apply it in every mode**, Current Season
  included (`applyMinMinutesInLive`).
- Per-game rates (PPG, xG/xA/xGI/xGC/DC/Def. Reward per game, Goals/Game,
  Assists/Game — `PlayerTileMetric.ratePerMinutes`,
  `isRatePerMinutesColumnKey`) have **no built-in floor** anywhere the user
  can set Min Minutes or a Mins filter: a Dashboard tile or graph the user
  builds, and Player Explorer. A one-cameo player can top them; raising Min
  Minutes is the user's call.
- Only the packaged Default view, which the user can't edit, adds a floor
  to a tile or graph showing a per-game rate: 90 minutes in Current Season,
  450 otherwise (`applyRateStatFloor`, `playersForDashboardItem`). It's
  decided by the Players Default view being the one selected
  (`isDefaultViewSelected`), not by a tile's id: views saved before v1.35.0
  can hold copies of Default tiles, ids included. None of the current
  defaults shows a per-game rate, so today it changes nothing on screen.
  Specifically picked players are never floored.
- Min Minutes takes any whole number as typed; the arrow buttons step by 90.
- Player Explorer has no Min Minutes control — its MINS column filter does
  that job.

### Club history: team figures are club figures

Every team figure is **what the club did in that season, whoever played for
it** — never a sum over today's squad. Teams, Team Profile and Dashboard
team tiles/graphs all use `computeTeamAggregates()` (`metrics/teamStats.ts`).
League results (position, points, goals for/against) follow the Data View
too.

- **The record:** `data/club-history/<season>/ledger.csv` has one row per
  player per fixture, with the club he played for *in that fixture*.
  Players are keyed by FPL `code`, clubs by team `code`.
- **2016/17–2025/26** were backfilled once from the vaastav community
  archive — the one approved exception to the official-API-only rule,
  because the official API doesn't serve past seasons' match data. It was
  checked against every fixture's real score and a sample of official
  season totals. The raw archive is frozen in `data/vaastav-snapshot/`
  (commit and sha256 pinned in `manifest.json`), so the backfill never
  touches the network.
- **2026/27 on:** archived from the official API only, by
  `.github/workflows/club-history-archive.yml` (Tue/Fri 05:00 UTC). It is
  append-only and writes nothing if more than 5% of requests fail.
- **Aggregation** (`server/src/clubHistory/aggregate.ts`) uses finished
  fixtures only. Completed seasons are pre-built into
  `completedSeasons.generated.ts`; the live season is aggregated inside the
  historic bulk build. Club xGC per match is the highest xGC among that
  club's players in that match (`<club_xgc_per_match>`).
- **Data View mapping** (`clubSeasonsForMode()`): Historic Average means the
  last 4 completed seasons **the club was in the Premier League**, never
  padded with zeros. A season with no record shows "—".
- **Gaps:** club xG/xA/xGI/xGC (and per-player starts) exist from 2023/24;
  club DC from 2025/26. FPL only started tracking starts and expected stats
  at 2022/23 GW16, and the archive carries 0 for earlier gameweeks, so the
  backfill stores those as `null` (`<untracked_expected_rounds>`) and any
  season total with a missing match is `null` — shown "—", never a
  part-season sum. Historic Average then averages those stats over the
  window seasons that have them.
- **End of season:** once the last fixture finishes, the next archive run
  moves the season into `completedSeasons.generated.ts`. Cut a release
  before FPL resets the API for the new season (usually mid-July).

---

## Metric methodology

Every metric is defined in `metrics/dictionary.ts`, shown in the User
Guide's Metric reference. Calculations live in `metrics/calculations.ts` —
pure, null-safe functions: a zero or `null` denominator returns `null`,
never `NaN`/`Infinity`.

### Per game, not per 90

Display rates (xG/Game, xA/Game, xGI/Game, xGC/Game, DC/Game, Goals/Game,
Assists/Game, PPG) are per **estimated game** in every Data View, because
per-90 inflates tiny samples (2 points in 1 minute = 180 per 90). FPL's own
`*_per_90` fields are deliberately not read, and neither is its
`points_per_game`, which divides by appearances (a 10-minute cameo is a
whole game) — PPG is `estimatedPointsPerGame()` in Current Season too.
`resolvePlayerStats` sets each resolved player's `estimatedGames` once per
Data View, and every per-game rate (Def. Reward/Game and Goals/Assists per
game included) divides by it.

```
estimatedGames      = minutes > 0 ? max(1, ceil(minutes / 90)) : 0   (any appearance counts as a game)
  Historic Average  = estimatedGames(total minutes over the seasons) / seasons   (per season; may be fractional)
X / Game            = X / estimatedGames      (so Historic Average X / Game = total X / total games)
PPG                 = totalPoints / estimatedGames, or / 1 with 0 minutes (0 points in 0 minutes is 0.0)
Points / £m         = totalPoints / price;   xG, xA, xGI / £m likewise
Minutes / Point     = minutes / totalPoints; Minutes / Goal, / Assist likewise
Goals − xG, Assists − xA, (Goals + Assists) − xGI
```

Known limit: ten 1-minute cameos look like one 10-minute cameo, because
there is no bulk per-gameweek data for the whole pool. The one true per-90
rate is internal to Expected Points Tier 2 (`per90()`), which scales a rate
by a fraction of one upcoming match.

### Other methodology

- **xGI validation** (`metrics/validation.ts`) recomputes xG + xA against
  the API's xGI (tolerance 0.01) on every load. Discrepancies are logged and
  shown in the User Guide.
- **Percentiles** (`metrics/percentiles.ts`) are within-position, against
  the full mode-resolved pool that meets the minutes threshold — never a
  filtered view. Bands: 90+ Excellent, 70–89 Good, 30–69 Average, <30 Poor.
  Lower-is-better stats (xGC, Min/Goal) are flipped. They drive the
  profile's radars (`metrics/radarStats.ts`, position-specific axes; DEF/MID
  get separate Defence and Offence radars) and stat-tile tints.
- **Defensive Reward/Game** (`metrics/defensiveReward.ts`) = clean-sheet
  points/game (GKP/DEF 4, MID 1, FWD 0) + **total** bonus/game. The API has
  no breakdown of bonus by defensive action, so it's a proxy, and the
  dictionary says so.
- **Playing Time** (`metrics/rotationIndicators.ts`) = this season's average
  minutes per completed gameweek. ≥75% of 90 is a starter, 40–74% rotation,
  <40% fringe.
- **Comparative colouring** (`utils/colorScale.ts`): tables tint each column
  relative to the rows on screen; single-player cards tint by
  within-position percentile.
- **Historic data caveats:** `history_past` reports xG as `"0.00"` for
  seasons before FPL tracked it (roughly pre-2022/23). Defensive
  contribution is real from 2024/25
  (`DEFENSIVE_CONTRIBUTION_TRACKING_START_YEAR`, `null` before).

---

## Implementation notes by page

For what each page does, see the User Guide. These notes cover what isn't
obvious from the UI.

**Dashboard** (`pages/Dashboard.tsx`)
- Tiles (`useSummaryTiles`) and graphs (`useDashboardGraphs`) each carry
  their own `dataView`, criteria or picked player/team ids, and name. The
  pool is resolved once per mode and each item filters from its own. Items
  are added and edited through one dialog each (`updateTile`/`updateGraph`
  edit in place).
- The tile (20) and graph (10) caps count both scopes together, and the
  message says so. A stored value this version doesn't recognise (a
  `dataView`, an order) falls back to its default when loaded; a tile or
  graph whose metric no longer exists shows as an "unavailable" card that
  can still be removed, rather than vanishing while counting toward the cap.
- A bar graph ranks by its own `direction` (Order): new graphs and graphs
  saved before it existed get the metric's natural order
  (`defaultGraphDirection` — lowest first when `higherIsBetter` is false, so
  "Top 15 — League Position" is 1–15).
- Saved views (`useSavedDashboardViews`) hold one scope's tiles and graphs.
  The selected non-Default view live-syncs every change. **Default** (one
  per scope) is immutable: no add, edit, remove or reorder, and it is
  re-synced to the packaged set on every load. A default-id tile or graph
  can therefore only ever be an unmodified default, and Default's cards
  aren't draggable. Create View starts blank; Default counts toward the 5
  views per scope, and names must be unique within a scope. Delete View
  asks for confirmation.
- Scatter axes follow `<axis_scaling>` (`components/charts/axisScaling.ts`):
  - The y = x trend line is dropped when one axis is ≥5× the other.
  - A crowded axis goes log or √.
  - Axes fit the data, not 0.
  - With the line drawn, x and y share one planned axis.
  - It's a Recharts `ScatterChart` (item-triggered tooltip: it names the
    point under the cursor, with each metric's own format) and the y = x
    line is a `ReferenceLine` segment. A `ComposedChart` here had an
    axis-triggered tooltip that never fired or named the wrong player.

**Player Explorer / tables** — column reorder, resize, fit and reset
(`state/useColumnCustomization.ts`), multi-column sort with nulls as lowest
(`state/useSortSpec.ts`), and ≤/≥/= column filters
(`state/useColumnFilters.ts`, `components/ColumnFilterControl.tsx`) are
shared engines, reused by Team Building's Add Players table. Search is
accent- and order-insensitive with small-typo tolerance, splits the
query at dots/apostrophes (curly ones too)/hyphens as it does names, and treats a one-letter
word as an initial that must start a name word (`utils/playerSearch.ts`).
- Filters compare a value **as displayed**: each column declares its
  `decimals` and the value is rounded the way its cell is
  (`roundAsDisplayed`) before ≤/≥/=. A range nothing can meet is refused
  (`columnFilterProblem`). Hiding a column clears its filter (`clearFilter`)
  and drops it from the sort (`sortWithoutHiddenColumn`; the page's default
  sort takes over if nothing's left).
- When nothing matches, the table keeps its header (so each column's ▾ can
  still change its filter) with the message in the body — "Building the
  historic dataset…" instead while a historic view is still loading, when
  a number filter fails every "—".
- Auto-fit (`fitToBox`) keeps any width set by dragging, until Reset, and
  shares the rest; a table can give a column a minimum (Player Explorer's
  Next 5 Fixtures: 190px), which also floors dragging. It runs again when a
  drag ends, so widening one column narrows the others. It reads current
  columns through refs, so a once-registered window-resize listener stays
  correct. Player Explorer measures its fixed Player/Own%/Price/Team/Position
  block (hand-set widths win over squeezed ones) and fits a second time once
  the new widths have laid out.
- Resizable tables (`.resizable-columns`: Player Explorer, Add Players) are
  `width: max-content; min-width: 100%`: when the columns' widths and
  minimums can't fit (e.g. Next 5 Fixtures at the desktop's default 1440px
  window), the table scrolls sideways inside `.table-wrap` with every width
  honoured. At `width: 100%` the browser ignored all set widths once they
  overflowed, so dragging did nothing and columns fell below 64px.
- Both tables draw rows in stages (`state/useProgressiveRowCount.ts`): the
  first 50 at once, then 100 per animation frame until every row is drawn,
  with no scrolling needed. Mounting all ~700 rows in one go blocked the
  page for most of a second before anything showed. Only the drawing is
  staged — sort, filters, tints, the row count and CSV export always use the
  full list — and a filter that shrinks the list restages it when cleared.
  Rows are `React.memo` components (`ExplorerRow`, `PickerRow`) with stable
  props, so a filter popover, a sort or a newly staged batch doesn't redraw
  rows that haven't changed; tint ranges come from the unsorted rows for the
  same reason. Player Explorer's Player column is sized by the browser to its
  widest name, so while rows are staged the likeliest-widest undrawn Player
  cells sit in hidden `visibility: collapse` rows (`.width-sizer-row`, which
  still count towards column widths) — the column is its final width from
  the first frame.
- The per-page row calculations are not cached across visits on purpose:
  on the live pool they take under 5ms (Team Building's predictions
  included), against the ~0.6s the full table took to draw. The data behind
  them is already fetched and normalised once in `AppStateContext`.
- Player Explorer keeps no saved data: columns, order, widths, sort, filters
  and Data View reset when you leave the page (by design).
- Escape closes only the most recently opened layer — column filter, Columns
  picker, Dashboard dialog or player profile (`state/useEscapeLayer.ts`).
- Text sorts with an accent- and case-insensitive collator; Player
  Explorer's Position sorts in pitch order (GKP, DEF, MID, FWD first).

**Player profile** (`components/PlayerDetailOverlay.tsx`) — has its own
mode toggle. The Current Season Log (Prime/Supplements tables) and Playing
Time are always live data. Career History uses the same windowed average as
Historic Average. The gameweek-history fetch (`usePlayerHistory`) is lazy,
retries network failures twice, and drops responses for a player no longer
selected.

**Player Comparison** — up to 5 players across every `PLAYER_COLUMNS`
metric, coloured better/worse (price, ownership, xGC inverted), plus radars.
Player Trends (`metrics/careerTrends.ts`) is separate and uses the full
unwindowed career (`allTimeSeasonsByPlayerId`), outside the mode toggle.

**Teams / Team Profile** (`components/TeamDetailOverlay.tsx`) — club
figures per "Club history" above. Club pills use real two-colour kits
(`utils/teamColors.ts`, with a generated fallback).

### Team Building — the one predictive section

Everything else in the app describes what happened. Team Building predicts,
at the user's request, using **disclosed heuristics, not a fitted model**:
every weight is a named constant with its reasoning. It has no analysis-mode
toggle; its Historic/Raw columns have their own. Squads (`useSavedSquads`,
max 5) are created blank or imported by FPL team ID. Squad rules
(`metrics/squadRules.ts`) always use live price and club. Budget over £100m
is a warning, never a block.

- **Exp. Pts (FPL Official)** — `metrics/expectedPoints.ts`. FPL's `ep_next`
  for the next fixture. Later fixtures are
  `ep_next × fixtureMultiplier(FDR, position)`. The GW+1…GW+5 navigator picks
  one of the player's next five fixtures (a blank has none; a double shows
  two consecutive steps).
- **Exp. Pts (Model Predicted)** — Tier 2, `metrics/expectedPointsV2.ts`.
  Never reads `ep_next`. It estimates each scoring event from the app's own
  stats and FPL's 2026/27 scoring rules:
  - appearance split from reliability (`p60 = r^1.5`, `p0 = (1−r)^1.5`)
  - goals and assists as rates
  - clean sheets from overall team strengths
  - goals conceded as E[X]/2
  - saves
  - defensive contribution via Poisson
  - bonus as a rough historic rate

  Cards, own goals and penalties are not modelled. Each estimate carries
  `caveats[]`, shown on hover.
- **Last backtest** (`client/scripts/backtestExpectedPoints.ts`, GW2–3
  2026/27, top 20 per position): Tier 2 MAE 2.66 vs a historic-rate baseline
  2.76 — better at FWD, worse at GKP and for ≥15%-owned players. It's an
  early read; re-run it as the season deepens. (`ep_next` has no history, so
  Tier 1 itself can't be backtested.)
- **Minutes Reliability** (`metrics/minutesReliabilityBlend.ts`) blends
  historic minutes share with live share. The live weight is
  `min(1, club games / 8)`. The historic side uses every season in the
  window, weights recent seasons more, and discounts inconsistency. Current
  ownership adds 15%. The result is multiplied by availability
  (`chance_of_playing_next_round`, else a status default).

---

## Saved data (localStorage)

All user customisation lives in localStorage. There are no accounts and no
server storage. Each store wraps its data as `{ version, data }` via
`state/persistentStorage.ts` and has a `migrate(data, storedVersion)`:

| Store | Hook |
|---|---|
| `fpl-dashboard:dashboard:summary-tiles:v1` | `useSummaryTiles` |
| `fpl-dashboard:dashboard:graphs:v1` | `useDashboardGraphs` |
| `fpl-dashboard:dashboard:saved-views:v1` | `useSavedDashboardViews` (views embed tiles and graphs) |
| `fpl-dashboard:dashboard:selected-view:v1` | `useSavedDashboardViews` |
| `fpl-dashboard:saved-squads:v1` | `useSavedSquads` |

**Any change to what a store holds** — a new field, a new default, a
meaning change to an existing field — needs a `STORAGE_VERSION` bump **and**
a `migrate()` step, recorded in that store's version comment. Changing only
the `fallback` does nothing for existing installs, because the fallback is
used only when the key doesn't exist yet. Check `useSavedDashboardViews` too
whenever tiles or graphs change, since it embeds both. An empty array is a
valid user state, not a reason to reseed defaults. If localStorage throws,
changes still work for the session; they just don't persist.

---

## Testing

`npm test` runs Vitest in both workspaces: calculations, normalize, state
persistence and migrations, the server cache/proxy/concurrency layer, club
history, and regression tests for past bugs. Coverage is partial —
`expectedPoints.ts`, `expectedPointsV2.ts` and most of `TeamBuilder.tsx` are
untested. Beyond tests, verification is `npm run build` plus running the
app. Playwright isn't installed, but it works via
`npx playwright install chromium` plus a throwaway driver script (nothing
committed).

## Desktop app and releases

The Windows desktop app (Electron, `electron/main.js`) is the only
distribution. The server is bundled by esbuild into one CommonJS file
(`server/dist/app.bundle.cjs`), `asar` is off, and the app is unsigned (a
SmartScreen prompt on first install). See `DEPLOYMENT.md`.

**To release:**
1. Make sure this README reflects the change.
2. Commit.
3. `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin master && git push origin vX.Y.Z`
   — bump the minor version for features, the patch version for fixes.

`.github/workflows/release.yml` builds the installer, takes the version from
the tag, and publishes a GitHub Release. Installed copies update themselves
on next launch.

## Known limitations

- No historic ownership: `history_past` has none, so it shows "—" in
  historic modes.
- Team `strength_attack_*`/`strength_defence_*` read 0 for every team
  (observed GW4 2026/27). Only `strength_overall_home/away` is used, by
  Tier 2 clean sheets.
- Restarting the server clears its in-memory cache (cheap — the API is the
  source of truth).
- Imported squads store chip usage (`usedChips`), but no page shows it at
  the moment. `metrics/chipPlanner.ts` is left over from the retired Chip
  Planner and has no importers.
