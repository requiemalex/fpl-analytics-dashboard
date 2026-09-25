# Project history — archived, not current documentation

**This file describes how the app used to work and why it changed. It is not
a description of the app as it is today** — much of it has since been
superseded (pages removed, features reworked, numbers changed). For how the
app works now, read `README.md`; for what each page does, the in-app User
Guide (`client/src/pages/UserGuide.tsx`).

Use this only to understand or restore something that used to exist, when
that is specifically asked for. Everything below the line is the README as it
stood on 2026-09-24, kept verbatim.

**From then on, add an entry here only when a feature is removed or
replaced** — under "Removed or replaced since 2026-09-24" at the end: what
it did, why it went, and the last commit that had it (so it can be
restored). Ordinary changes need no entry; commit messages record them.

---

# FPL Analytics Dashboard — 2026/27

A locally-run scouting and analytics dashboard for Fantasy Premier League,
built against the **live official FPL API**. No mock data, no database, no
authentication — just your machine, a small Express proxy, and a React UI.

**Just want to use it?** Download the Windows installer from
[the latest release](https://github.com/requiemalex/fpl-analytics-dashboard/releases/latest)
— no Node, no terminal, no hosting cost. It auto-updates itself. See
"Electron desktop app" further down for details. Everything below this
point (`npm install`, `npm run dev`, etc.) is for developing the app
itself, not for using it.

---

## Prerequisites

- Node.js **18.18+** (Node 20 LTS recommended)
- npm 9+ (ships with Node)
- Internet access from the machine running the app (the Express proxy talks
  to `https://fantasy.premierleague.com/api/` directly)

## Installation

From the repository root (this uses npm workspaces — one install covers
both the server and the client):

```bash
npm install
```

## How to run locally

```bash
npm run dev
```

This starts **both** processes concurrently:
- the Express API proxy on `http://localhost:4000`
- the Vite dev server on `http://localhost:5173`

Open `http://localhost:5173` in a browser. The Vite dev server proxies
`/api/*` requests to the Express backend, so you don't need to configure
CORS or hit two different ports manually.

## Development commands

| Command | Effect |
|---|---|
| `npm run dev` | Runs the server and client together (recommended) |
| `npm run server` | Runs only the Express proxy |
| `npm run client` | Runs only the Vite dev server |
| `npm run build` | Type-checks and builds both packages for production |

---

## Architecture overview

```
Raw FPL API
   -> Express proxy (server/)            — caching, timeouts, retries
   -> fetch + response validation (Zod)  — client/src/validation
   -> raw API models                     — client/src/types/raw.ts
   -> normalisation layer                — client/src/normalize
   -> metric/calculation layer           — client/src/metrics
   -> React state (Context)              — client/src/state
   -> React UI                           — client/src/pages, components
```

- **Server** (`server/`): a minimal Express app whose only job is to proxy
  the four FPL endpoints this app uses, with in-memory TTL caching, request
  timeouts, and small capped-retry logic for transient failures. It holds
  no player statistics of its own — everything it returns comes straight
  from the live API (or its own short-lived cache of that same data).
- **Client** (`client/`): a Vite + React + TypeScript SPA. UI components
  read from a normalised `NormalizedPlayer` / `NormalizedTeam` shape and
  never touch raw FPL field names directly — that mapping lives entirely
  in `client/src/normalize/`.
- Advanced/expected-stats field availability is **detected from the live
  response at load time** (`client/src/normalize/fieldAvailability.ts`),
  not assumed from a hard-coded list — see "Unavailable metrics" below.

## API endpoints used

| Endpoint | Used for | Notes |
|---|---|---|
| `GET /api/bootstrap-static/` | Players, teams, positions, gameweeks, chip schedule, Price Change Predictor | Fetched once on load. As of 2026/27 this also carries the official Price Change Predictor fields and the season's chip-availability schedule — see "New sections: Price Watch and Chip Planner" below. |
| `GET /api/fixtures/` | Fixture list | Fetched when needed, cached |
| `GET /api/element-summary/{id}/` | Per-player current-season gameweek history | Fetched **lazily**, only when a player profile is opened |
| `GET /api/event/{gw}/live/` | Live current-gameweek data | Only used if live-gameweek functionality is invoked |
| `GET /api/historic-bulk` | Whole-pool `history_past` (every player's prior-seasons data), aggregated server-side from several hundred individual `element-summary/{id}/` calls | Requested the first time any page/component actually needs lastSeason/historicAverage analysis (see "How the whole-pool historic dataset is fetched" below) — cached 12 hours |
| `GET /api/entry/{teamId}/` | A real manager's team identity, bank, squad value | Team Building's squad-import feature |
| `GET /api/entry/{teamId}/history/` | A real manager's chips-used record and per-gameweek bank/value/transfers | Team Building's squad-import feature |
| `GET /api/entry/{teamId}/event/{eventId}/picks/` | A real manager's actual 15 picks for one gameweek | Team Building's squad-import feature |

All of the above are proxied through the local Express server at
matching paths under `/api/`.

## API caching behaviour

| Data | TTL | Notes |
|---|---|---|
| `bootstrap-static` | 10 minutes | |
| `fixtures` | 30 minutes | |
| `element-summary/{id}` | 30 minutes | Cached per player id |
| `event/{gw}/live` | 60 seconds | |
| `historic-bulk` | 12 hours | `history_past` can't change mid-season — see "How the whole-pool historic dataset is fetched" |
| `entry/{teamId}` (identity, history, picks) | 2 minutes | Short-lived — a real manager's bank/picks/chips can change the moment they make a transfer, unlike the shared pool data above |

TTLs are centralised in `server/src/config.ts` — change them in one place.
Every outbound request has an 8-second timeout and retries up to twice
(capped exponential backoff) **only** for network failures or 5xx
responses; 4xx responses are never retried. Concurrent requests for the
same resource are de-duplicated (`server/src/proxy.ts`) so a manual
refresh can never fire two upstream requests at once.

The **Refresh Data** button in the top bar calls the `/api/refresh/*`
endpoints, which bypass the cache and re-fetch from the live API. If a
refresh fails but a previous successful fetch is still cached, the app
keeps showing that data with a visible "stale data" banner and timestamp
— it never presents stale data as current, and never blanks the screen if
there's something usable to show instead.

---

## Metric definitions

Every metric in the app is documented in-app at **Metric Definitions**
(`/definitions`), sourced from a single dictionary at
`client/src/metrics/dictionary.ts`. That page also shows, live, which
advanced fields the current API build actually returned.

Key field mappings (verified against the live 2026/27 API, not assumed
from a previous season):

| Displayed metric | Raw field | Source |
|---|---|---|
| Price | `now_cost` ÷ 10 | Derived (unit conversion only) |
| xG / xA / xGI / xGC | `expected_goals`, `expected_assists`, `expected_goal_involvements`, `expected_goals_conceded` | FPL API |
| xG/Game, xA/Game, xGI/Game, xGC/Game | `xG`/`xA`/`xGI`/`xGC` above ÷ estimated games played | **Derived by this app** — see "Per-game, not per-90" below |
| Defensive Contributions, DC/Game | `defensive_contribution`; DC/Game derived the same way | Total: FPL API; DC/Game: derived |
| Starts | `starts` | FPL API |

The live API also supplies its own `expected_goals_per_90` etc. and
`defensive_contribution_per_90` fields directly — confirmed by inspecting
an actual `bootstrap-static` response, per the project's "inspect, don't
assume" rule — but this app deliberately no longer reads them; see
"Per-game, not per-90" below for why.

## Per-game, not per-90

Every display-facing rate metric in this app — xG/Game, xA/Game,
xGI/Game, xGC/Game, Defensive Contributions/Game, Goals/Game,
Assists/Game, and PPG — is normalized per estimated GAME, not per 90
minutes. This replaced an earlier per-90-minutes basis (total ÷ minutes
× 90, including trusting the live API's own supplied per-90 fields
directly) app-wide, after that shape of formula repeatedly produced
nonsensical results for a low-minutes cameo. Confirmed directly from a
live screenshot at gameweek 5: "Points/90: 180.0" was exactly 2 points
scored in 1 minute (`2/1*90`). PPG had already been fixed the same way
earlier (see the PPG section above) — this generalizes that same fix to
every other per-90 metric in the app, by explicit request, rather than
patching each one individually as it was noticed.

**Why per-90 caused this**: the `×90` multiplier is greater than 1 for
any minutes total below 90 and only a dampener at or above it, so it
structurally amplifies a tiny sample instead of just describing it. A
490-minute season with 1 goal reads as a modest 0.18 xG/90-equivalent;
a 5-minute cameo with 1 goal reads as an absurd 18.0.

**Why per-game instead, and how "games" is estimated**: real
games-played isn't available from the FPL API for the whole player
population in one request — only fetched per-player, lazily, via
gameweek history when a profile is opened. So games played is
estimated from cumulative minutes (`estimatedGamesFromMinutes` in
`metrics/calculations.ts`), by explicit product decision:

- **Any appearance, even a single minute, counts as a full game
  played** — so a player whose minutes are fragmented across several
  small cameos gets divided by MORE estimated games (a lower, more
  conservative rate), the opposite bias from the old per-90 problem.
  This pushes low-minutes cameo players down the rankings rather than
  letting them spike to the top, which was the explicit goal: "the best
  players with the best minutes per game with the best points per game
  truly appear at the top."
- Concretely, this means always rounding UP (`Math.ceil(minutes / 90)`,
  floored at 1 for any nonzero minutes), never to the nearest or down —
  95 minutes (a full match plus 5 more) is estimated as at least 2
  separate appearances, never 1.
- **Known limitation**, disclosed rather than hidden: this can still
  under-count truly fragmented appearances. Ten separate 1-minute
  cameos summing to 10 minutes look identical, from cumulative minutes
  alone, to one 10-minute cameo — both estimate to 1 game — since the
  app has no per-gameweek data for the whole population to tell them
  apart. A real, structural limit of estimating from a cumulative total
  rather than counting actual appearances, not a bug to be fixed later
  without a bigger data-fetching change (bulk gameweek history for the
  whole player pool, rather than one player at a time as now).

**One deliberate exception**: Expected Points Tier 2
(`metrics/expectedPointsV2.ts`) still computes and uses a genuine
per-90-minutes rate internally, via `per90()` (kept in
`calculations.ts` for exactly this one caller). That model multiplies a
rate by `expectedMinutesFraction` — the expected share of ONE upcoming
fixture's minutes — to project that single match's expected output; a
per-game figure has no coherent way to be scaled by a fraction of one
match, since "how many games appeared in so far" has no bearing on "how
much of the next single match will this player be on the pitch for."
This is the only place in the app that still reads a true per-90 rate,
and it computes it fresh from the player's own totals + minutes rather
than depending on any of the renamed display fields.

**What changed, concretely**: `NormalizedPlayer.xGPer90` →
`xGPerGame` (same for xA/xGI/xGC/defensiveContributions/saves);
`PlayerDerivedMetrics.pointsPer90` removed entirely (redundant with the
already-existing `player.pointsPerGame`); `goalsPer90`/`assistsPer90` →
`goalsPerGame`/`assistsPerGame`; every column, radar axis, chart label,
and dictionary entry renamed to match ("xG/90" → "xG/Game", etc.);
`normalize/normalizePlayers.ts` no longer reads the live API's raw
per-90 fields at all (they're left `null` there, always overwritten by
`resolvePlayerStats.ts` for every analysis mode including live); and
the old per-90 API-vs-recomputed cross-check in `metrics/validation.ts`
was retired, since there's no longer a raw per-90 figure to cross-check
against (the xGI = xG + xA cross-check is unaffected and still runs).
Dashboard's existing rate-based Top-5 minimum-minutes floor (see below)
is unchanged in spirit and still applies on top of this — the
calculation fix and the leaderboard-ranking-confidence floor address
two different, complementary concerns.

## Underlying Numbers (retired page) — chart methodology still behind Defensive Reward/Game

The Underlying Numbers page itself is gone (see "Underlying Numbers
removed" further down) — graph building moved to the Dashboard's Graphs
section, built around a generic "pick any X metric, any Y metric" model
rather than a fixed set of hardcoded charts. This section is kept for the
one piece of methodology that didn't just become an ordinary column:
`defensiveRewardPerGame`, still selectable as a Y (or X) metric on any
Player Graph.

- **xGI vs Goals + Assists** and **ICT Index vs Goals + Assists** were
  two of the page's hardcoded charts, not distinct metrics — xGI, Goals,
  Assists, and ICT Index are all ordinary PLAYER_COLUMNS today, buildable
  as any Player Graph. The reasoning behind them lives on as the Dashboard
  Graphs' optional reference-line checkbox: xGI and Goals+Assists are the
  same underlying concept (expected vs actual goal involvements), so a
  dashed 45° line means something there; ICT Index is a composite
  influence/creativity/threat score on its own scale, not the same unit
  as Goals+Assists, so a reference line would be meaningless on that pair
  — the checkbox is opt-in per graph specifically so this is a choice, not
  a guess.
- **Defensive Contribution/Game vs Defensive Reward/Game** was the
  hardest of the old page's charts to get right honestly, and the one
  metric pair whose Y-axis (`defensiveRewardPerGame`,
  `client/src/metrics/defensiveReward.ts`) is now a genuinely new
  PLAYER_COLUMN rather than just a retired chart:
  - X-axis is `defensiveContributionsPerGame` — this app's own
    per-game derivation (`perGame()`, see "Per-game, not per-90"
    above), **not** FPL's raw `defensive_contribution_per_90` field
    directly; a different, app-derived denominator (estimated games
    played, not literal per-90-minutes).
  - Y-axis (`defensiveRewardPerGame`) is **clean-sheet points/game +
    total bonus/game**. Clean-sheet points use a hard-coded position
    table (GKP/DEF 4, MID 1, FWD 0) — confirmed against current official
    FPL scoring rules, since the API returns raw clean-sheet counts, not
    the points they're worth.
  - **Important caveat** (in the metric dictionary — `defensiveReward
    PerGame` entry, `metrics/dictionary.ts` — surfaced in the User Guide's
    Metric Reference table): this is **total** bonus, not bonus isolated
    to defensive actions. The public API has no breakdown of the Bonus
    Points System by contributing factor — defensive actions are
    confirmed to feed into it, but so do goals, assists, clean sheets, and
    saves. This is the most honest proxy available, not an attribution.
  - Because Defensive Contribution points are a per-match threshold
    capped at 2 (not points-per-action), the x-axis rate does not convert
    to points linearly.
  - Not carried over into the generic graph builder: the old chart's
    colour-coded third dimension (Expected Goals Conceded/Game as a
    bubble-colour gradient), its goalkeeper exclusion, and its bespoke
    450-minute floor override. Those were specific to that one hardcoded
    card, not something a "pick any X, pick any Y" builder generalises —
    a user building this pair today gets the two core axes, plotted for
    whoever their own Filters/Min Minutes criteria include.

## Calculation formulas

All derived metrics live in `client/src/metrics/calculations.ts` (pure,
null-safe functions — division by zero or a null input always returns
`null`, never `NaN`/`Infinity`):

```
Points / £m        = totalPoints / priceInMillions
xG / £m, xA / £m, xGI / £m  = (xG | xA | xGI) / priceInMillions
Points / Game       = totalPoints / estimatedGames   (perGame(); see "Per-game, not per-90" above)
Goals / Game        = goals / estimatedGames
Assists / Game      = assists / estimatedGames
  where estimatedGames = minutes > 0 ? max(1, ceil(minutes / 90)) : 0
Minutes / Point     = minutes / totalPoints
Minutes / Goal      = minutes / goals
Minutes / Assist    = minutes / assists
Goals − xG           = goals - xG
Assists − xA         = assists - xA
Goal Involvements − xGI = (goals + assists) - xGI
```

(This section used to show `Points/90`/`Goals/90`/`Assists/90` formulas —
retired app-wide alongside the per-90 → per-game migration; see "Per-game,
not per-90" above. `per90()` still exists in `calculations.ts` but only for
Expected Points Tier 2's internal minute-projection use, never for display.)

## xGI validation

This app **independently recomputes** xGI as xG + xA as a cross-check
against the API-supplied value, with a 0.01 tolerance. Discrepancies
beyond tolerance are never silently hidden: they're logged to the
browser console and summarised on the Metric Definitions page
(`client/src/metrics/validation.ts`). This runs automatically once per
data load. This section used to also cover xG/90, xA/90, xGI/90, xGC/90,
and DC/90 — the live API supplies those directly, and this app used to
treat them as authoritative for display, cross-checking them the same
way. Retired alongside the app-wide move to per-game metrics (see
"Per-game, not per-90" above): this app no longer reads or surfaces
those raw per-90 fields at all, so there's nothing left to cross-check.

## Percentile methodology

Position percentiles (`client/src/metrics/percentiles.ts`) are calculated
against the **eligible population for that position only** — players
meeting the current minimum-minutes threshold, excluding anyone for whom
the metric itself is null. Team, ownership, and price filters do **not**
change this reference population, so a percentile means the same thing
regardless of what you're currently filtering the visible table by.

Bands: 90th percentile+ = Excellent, 70th–89th = Good, 30th–69th =
Average, below 30th = Poor.

## Archetypes — removed

The rule-based archetype label system (Premium/Mid-priced/Budget price
tiers, Enabler, High-upside Attacker, Strong Underlying Attacker, etc. —
previously `client/src/metrics/archetypes.ts`) has been removed
entirely, end to end: the computation module, `ArchetypeBadges` (was in
`primitives.tsx`), the Archetypes column in Player Explorer, the
archetype filter popovers in FiltersBar/LocalViewControls/Team
Building's Add Players picker, and the `archetypes` field on
`GlobalScoutingFilters`. Removed by request — it wasn't earning its
clutter. `thematicTrends.ts`'s unrelated price-tier logic (Premium/
Mid-priced/Budget for the Season Trends chart) kept its own small local
threshold constants rather than importing from the now-deleted module.
`squadRating.ts`, which depended on `ArchetypeLabel` but had zero
importers anywhere in the app (a "Good Differentials"/"Archetype Mix"
feature that no longer existed on any page), was confirmed fully dead
and deleted alongside it, along with `SQUAD_RULES.differentialOwnershipMax`
(orphaned by the same deletion).

## Playing-time indicator methodology

Shown on a player's profile as a single color-tiered gauge icon (Playing
Time card) once their current-season gameweek history has loaded
(`client/src/metrics/rotationIndicators.ts` /
`client/src/components/playerProfile/PlayingTimeIcon.tsx`). The exact
figures live in the icon's hover tooltip rather than as on-card text.

- **Average Minutes** = total minutes across every completed gameweek
  this season ÷ number of completed gameweeks — a season-to-date average,
  not a recent-form rolling window.
- **Tier** (drives the icon's fill and color) = that average as a
  fraction of a 90-minute match: ≥75% is a regular starter (green),
  40–74% is a rotation risk (amber), below 40% is a fringe player (red).
  No data yet this season renders as an empty dashed ring.

This is fetched lazily (only when a player profile is opened) and is
race-condition-safe: switching profiles quickly discards any in-flight
response for the previously-selected player.

## Dashboard: minimum-sample floor for rate-based Top-5 tiles

Audited every per-90/per-game calculation in the app after a reported
skew in the Dashboard's "Points/90" tile, to check for a repeat of the
earlier PPG bug (a "per game" field that was actually computed as a
per-90-minutes rate, distorting badly for a low-minutes cameo — see
`estimatedPointsPerGame` in `calculations.ts`). Result: no other
metric has that specific defect — every other per-90 field genuinely
is documented and computed as a true per-90-minutes rate (`per90()`
correctly pairs the same season's numerator and denominator
everywhere it's called, in `resolvePlayerStats.ts` and
`playerMetrics.ts`), so the formulas themselves are correct.

The visible symptom was real, though: a rate-per-minutes metric
(PPG, Points/90, Goals/90, Assists/90, DC/90 — see
`PlayerTileMetric.ratePerMinutes` in `summaryTileMetrics.ts`) can
still look absurd for a tiny-minutes sample (one bonus point in a
2-minute cameo), and the Dashboard is the one page with no Min
Minutes control of its own — Player Explorer, Underlying Numbers, and
Team Building all expose one, but the Dashboard's Top-5 leaderboards
just inherited the shared global filter, which defaults to 0. Fixed
by giving exactly those rate-based tiles their own minimum-minutes
floor (`Dashboard.tsx`), via `Math.max` against whatever the shared
filter is set to — so a stricter setting elsewhere is never loosened,
but a low default can no longer let a cameo outlier top a rate-based
leaderboard. Count-based and price-based tiles (Points, Goals,
Points/£m, etc.) are untouched — a small-minutes player can't
accumulate a large total the way a rate stat can spike, so they were
never the source of this bug.

**First cut of this fix bypassed Current Season mode entirely**,
reasoning that everyone has low minutes early in a season so a fixed
floor would just empty the leaderboards. Wrong in practice — confirmed
directly from a live screenshot at gameweek 5 showing "Points/90:
180.0" (exactly 2 points in 1 minute, `2/1*90`) still topping the
tile. `per90()`'s `*90` multiplier is greater than 1 for any minutes
total below 90 and only a dampener at or above it — 90 minutes (one
full match) is the precise, mathematically meaningful floor below
which the rate can read as better than the player's real observed
output, and it's trivially reachable by any genuine starter from
gameweek 1 onward, unlike a fixed 450. So Current Season now gets its
own lower floor (`LIVE_RATE_STAT_MIN_MINUTES = 90`) instead of no
floor at all, while Last Completed Season / Historic Average keep the
stricter `RATE_STAT_MIN_MINUTES = 450` (~5 games) for genuine ranking
confidence over a completed season's full data.

## Dashboard: Player Tiles get their own criteria bar, split from Team Tiles

Alongside the modularity fix (see "Per-page filter/analysis-mode state"
above): Dashboard's Top-5 tiles gained real Search/Position/Team/Min
Minutes criteria — this page previously had no such control at all, so
its rate-based tiles' minimum-minutes floor (below) was the only thing
standing between a tiny-sample outlier and the top of a leaderboard.
(This started as one shared bar above every Player Tile; see "Dashboard:
per-tile criteria and tile naming" further down for why that later
became a per-tile setting instead.)

Player and Team tiles are shown one scope at a time, switched with a
**Players / Teams** toggle top-right of the page (not stacked with a
divider any more — see the per-tile data view change just below for
why a toggle reads better once tiles can each be on a different data
view). "+ Add Tile" always adds to whichever scope is currently
selected. Reordering (drag-and-drop) is unaffected either way — it's
id-based against the one underlying `tilesState.tiles` array regardless
of scope, so which scope is currently rendered doesn't touch how tiles
are actually stored or reordered.

## Dashboard: per-tile data view, instead of one dashboard-wide mode

Every summary tile now carries its own `dataView` (`SummaryTileConfig`,
`useSummaryTiles.ts`) — Last Completed Season / Historic Average /
Current Season — chosen once in the "Add Tile" dialog, rather than the
whole Dashboard sharing a single analysis-mode toggle the way every
other page still does. A small two-letter badge in each tile's header
(`CS`/`LS`/`HA`, hover for the full name — `components/DataViewBadge.tsx`)
shows which one a given tile is built from, since with several tiles on
screen there's no longer one page-level control to read that off.

Internally, Dashboard.tsx resolves the player pool **once per mode**
(one small `Record<AnalysisMode, …>` map — `MODES` is just `["live",
"lastSeason", "historicAverage"]`) instead of once for a single shared
mode, and each tile filters from whichever map entry matches its own
`dataView` when building its Top-5 (see "Dashboard: per-tile criteria
and tile naming" below for how the filtering itself now works —
criteria moved from one shared bar to a per-tile setting shortly after
this). `filterPlayers()` already resolves Min Minutes to 0 under Current
Season per-mode internally (see `effectiveMinMinutes()`,
`useFilteredPlayers.ts`), so a Current Season tile is never wrongly
filtered out by a Min Minutes value meant for a different tile.

Existing tiles saved before this change (no `dataView` field yet) are
migrated to `"lastSeason"` on load — the same default every other page
already starts on — via the versioned-localStorage machinery added
just before this (`state/persistentStorage.ts`); nothing resets or
breaks for anyone with tiles already saved.

## Dashboard: tile bars, and real club colours for the Team Badge pill

Each tile row now shows a small horizontal bar alongside its value,
sized relative to the largest value in that tile's Top-5/Bottom-5 (the
top row is always full-width) — a plain accent colour for most metrics,
green/red by sign for the three "vs expected" comparison metrics (Goals
vs xG, Assists vs xA, G+A vs xGI — see `PlayerTileMetric.signed`).
`TopList`/`TeamTopList` are shared components, so Underlying Numbers'
own Top-5 lists picked up the same bars automatically, for the same
plain-accent treatment.

Separately: the `TeamBadge` pill (used anywhere a team is a row's own
subject — Teams, Team Detail, Dashboard's Team Tiles) now colours
itself from a hand-picked table of each club's real primary/kit colour
(`CLUB_COLORS`, `utils/teamColors.ts`), not the old generated
per-team-id colour. A few clubs whose true primary is itself very dark
(Newcastle's black, several clubs' claret) are represented by a
lightened shade or their prominent trim colour instead of the literal
brand hex, since a near-black pill is simply invisible against this
app's dark background regardless of accuracy. The table only covers
clubs that have appeared in the Premier League in roughly the last
decade — anything it doesn't have falls back to the old generated
colour (`teamAccentColor()`, still exported, still used as the
fallback), so no club ever goes uncoloured.

## Dashboard: saved views, per scope

Same idea as Team Building's saved squads, applied to Dashboard tiles:
"Save View" snapshots whichever scope (Player or Team) is currently
selected — its tiles, in order, each with its own data view — as a
named entry, up to 5 per scope (`MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE`,
`state/useSavedDashboardViews.ts`). A "Saved views" dropdown next to it
lists whichever scope is active; **Load** replaces the live tiles for
that scope only (the other scope's tiles are untouched — a saved Team
view can't clobber your Player tiles or vice versa), **Delete** removes
the selection. A view is a plain snapshot, not a live-linked entity —
editing tiles after loading a view doesn't update the saved view itself;
save again under the same or a new name to capture the change. Loading
a view that would push the combined Player+Team tile count past
`MAX_SUMMARY_TILES` (20) is refused with an inline error rather than
silently truncating it. Persisted the same versioned-localStorage way
as everything else in this section.

There's no separate "Reset to Defaults" button. The tile layout the
Dashboard always used to ship with is seeded as a saved view named
"Default" (one for Player, one for Team) the first time the app ever
runs with no saved-views data yet — it behaves exactly like any view a
user saves themselves: **Load** it to get back to that layout, or
**Delete** it for good if it's not wanted (it doesn't come back once
deleted). This replaced a dedicated `resetTiles()` reset-to-hardcoded-
defaults function with one unified saved-views mechanism.

## Team Badge: two-colour club pills, not one flat colour

Several Premier League clubs share close to the same primary colour
(Arsenal/Nottingham Forest/Brentford are all red; Chelsea/Man City are
both blue), which made the single-colour `TeamBadge` pill introduced
above hard to tell apart at a glance. `TeamBadge` now renders a small
two-colour swatch — that club's real primary colour on top, its real
secondary/trim colour below (`CLUB_SECONDARY_COLORS`,
`utils/teamColors.ts`, `teamDisplayColors()`) — instead of a single flat
fill. Where two clubs are *also* genuinely the same secondary colour in
real life (Aston Villa and West Ham are both claret-and-blue; Aston
Villa and Burnley are both claret-and-blue too), that secondary's exact
shade is nudged apart deliberately (Villa's steel blue vs. West Ham's
cyan; Villa's blue vs. Burnley's teal) — still recognisably the same
colour family, just not pixel-identical to the other club wearing it.
Clubs not in either table still render (both halves fall back to the
same generated per-id colour), so nothing goes uncoloured.

## Player Profile: comparative colouring on every stat tile

Underlying Numbers and Value's stat tiles (`StatTile`,
`PlayerDetailOverlay.tsx`) are now lightly tinted green/red — same
green-better/red-worse language and colour scale as Player Explorer's
Comparative Colouring and Player Comparison's cell tints
(`utils/colorScale.ts`), extended with a new `percentileTint()` that
takes a percentile directly rather than a value-plus-range. A single
player card has no "other rows on screen" to compare against the way a
table does, so the tint is driven by this player's within-**position**
percentile (`computePositionPercentiles`, `metrics/percentiles.ts`) —
the same population and minutes-eligibility threshold the Percentile
Radar above it already uses, computed once per stat
(`statPercentiles`, `PlayerDetailOverlay.tsx`) so both sections can
never disagree about where a player ranks. A small-sample player (below
the eligibility threshold) gets `null` back from
`computePositionPercentiles` for every stat, same as the radar already
nulling itself out for that case, so no tile is misleadingly tinted.
Metrics where a lower raw number is actually better (xGC, xGC/Game,
Min/Goal) have their percentile flipped before tinting, same convention
as the radar's own `higherIsBetter` axes. The three "Actual vs Expected"
bars (Goals/Assists/Goal Involvements vs. their expected figures) were
deliberately left alone — they're already green/red by their own sign,
which is a comparison against this player's own expected numbers, not
against the rest of the player pool, so applying a second tint on top
would be a different (and confusing) comparison layered onto the first.

## Dashboard: per-tile criteria and tile naming

Every Player Tile now carries its own `criteria` (`SummaryTileConfig`,
`useSummaryTiles.ts`) — the same `GlobalScoutingFilters` shape
(Search/Position/Team/Min Minutes) every filtered page already uses —
set once in the "Add Tile" dialog via the existing `FiltersBar`
component (reused as-is, bound to the dialog's own draft state instead
of a page-level one), replacing the single shared criteria bar that
used to sit above every Player Tile at once. Two tiles can now watch
completely different slices of the player pool (e.g. one restricted to
Defenders on a specific club, another unrestricted) side by side — a
capability that was needed once Data View, colouring, and now saved
views could all differ per tile, but the criteria feeding a tile's
numbers still couldn't. Passing the dialog's own `newTileDataView` as
the `FiltersBar`'s `analysisMode` prop also means Min Minutes correctly
greys itself out when building a Current Season tile specifically,
without needing the fixed `"lastSeason"` sentinel the old shared bar
required (there's no longer one bar serving tiles on several different
data views at once, so the prop's original purpose — matching *this*
tile's own mode — works exactly as designed again). Every tile — Player
or Team — also gets an optional **Name** field in the same dialog;
leaving it blank keeps the auto-generated "Top/Bottom 5 — &lt;metric&gt;"
title exactly as before. Team Tiles have no criteria field (unchanged —
a team tile always aggregates a club's whole squad).

Existing tiles saved before this change (no `criteria`/`name` fields
yet) migrate on load: `name` defaults to `null` (auto-generated title),
`criteria` defaults to the same `DEFAULT_FILTERS` (no filtering) the old
shared bar itself started on for player tiles, and stays `null` for
team tiles — nothing resets or breaks for anyone with tiles already
saved. `STORAGE_VERSION` bumped 2 → 3.

## Fixed: bare `<select>` elements rendering with the browser's default white styling

The Dashboard's Saved Views dropdown (not wrapped in a `.field`
container the way every other `<select>` in the app is) rendered with
the unstyled browser-default white control, clashing badly with the
dark theme. The themed look (`.field select`) is now a base `select`
rule in `components.css`, applied to every select in the app whether or
not it's inside a `.field` wrapper, so this can't recur for a future
standalone dropdown either.

## Known limitations

- Historic ownership isn't available. Confirmed directly against the raw
  API response (not just assumed): `history_past` has no
  ownership/selected-by field at all, for any season — only live,
  current ownership exists anywhere in the public API. Ownership shows
  as `—` in Last Completed Season / Historic Average modes, with the
  toggle explaining why.
- No authentication and no persistent server-side storage, by design —
  restarting the server clears its in-memory cache (the live API is the
  source of truth, so this is inexpensive).
- Team `strength_attack_*`/`strength_defence_*` fields were observed as
  `0` on the live pre-season bootstrap-static response used during
  development (before gameweek 1) and still read `0` for every team —
  the app does not use these two specifically for any ranking or metric,
  so this doesn't affect anything currently displayed. `strength_overall_home`/
  `strength_overall_away` are a separate pair of fields that ARE
  populated and ARE used — by Expected Points Tier 2's clean-sheet
  probability model (`expectedPointsV2.ts`) — see the "Two small data
  gaps filled in to support this" note under Expected Points — Tier 2
  below.
- The Express proxy requires outbound internet access to
  `fantasy.premierleague.com`. If your network blocks that, the app will
  show the API error state rather than fabricated data.

## Unavailable metrics and why they are unavailable

If the live API ever omits a field this app expects (e.g. a future season
renames or removes `defensive_contribution`), the normalisation layer
detects that at load time (`client/src/normalize/fieldAvailability.ts`)
rather than assuming the field exists — every player's value for that
metric becomes `null`, which renders as **"—"** everywhere in the UI, and
the Metric Definitions page (`/definitions`) shows exactly which fields
were and weren't found on the current API response. Nothing is ever
substituted from a different statistic to fill the gap.

## Club history: team figures are club figures, season by season

**Every team-level figure is what the CLUB did in a given season,
whoever was playing for it** — never a sum over its current squad.
Teams, Team Profile, and the Dashboard's team tiles/graphs all read the
same computation (`computeTeamAggregates()`, `metrics/teamStats.ts`). A
summer signing's previous season stays with his previous club; a player
who leaves mid-season keeps what he did for the club counted for it.
"What would this signing bring?" is deliberately player analysis, not
team analysis.

This replaced the old current-squad aggregate, which summed each
current player's mode-resolved totals — so a transfer dragged a player's
past output to his new club (e.g. Dubravka's full 2025/26 Burnley season
landing in Spurs' 2025/26 figures), and team xGC was ~11x too high
(every player on the pitch carries the same on-pitch xGC).

### The record: a match-level ledger

`data/club-history/<season>/` holds, per season:

- `ledger.csv` — one row per player per fixture (unused squad listings
  included): the club he was registered to **for that fixture** (read off
  the fixture's home/away side, never his current club), plus minutes,
  points, goals, assists, xG/xA/xGI/xGC, DC, etc.
- `fixtures.csv`, `teams.csv` — that season's fixtures and team ids.

Players are keyed by FPL's stable `code` (element ids change every
season), clubs by their stable team `code`. Because rows are per
fixture, a mid-season move splits correctly between clubs.

**Sources.**

- **2016/17–2025/26: one-off backfill from the vaastav/Fantasy-Premier-League
  community archive** (`npm run club-history:backfill`) — a mirror of
  FPL's own API data. The official API doesn't serve past seasons' match
  data at all, and its per-season player history carries no club, so this
  is a deliberate, one-time exception to the official-API-only rule,
  approved for this purpose only. Checks run on the backfill: every
  finished fixture's goals (player goals + opponent own goals) equal its
  real score, in all 3,800 fixtures across all 10 seasons; and a random
  213 player-seasons matched FPL's official `history_past` totals
  (minutes, points, goals, xGC) exactly. Archive quirks handled: exact
  duplicate rows (10 in 2025/26) are dropped; a postponed fixture's
  placeholder row from its original gameweek (no score, 0 minutes — e.g.
  2019/20's COVID-postponed games) gives way to the real one; 2016/17 and
  2017/18 have no fixture list, so each fixture's sides are rebuilt from
  the rows themselves (a home row's opponent is the away side).

  **The archive is frozen in the repo, not read online.**
  `data/vaastav-snapshot/` holds every file the backfill reads, raw and
  complete (every column: cards, ICT, price, ownership, transfers, … —
  not just what the ledger uses today), gzipped, ~12 MB: each season's
  `players_raw.csv` and `gws/merged_gw.csv`, plus `fixtures.csv` (2018/19
  on) and `teams.csv` (2019/20 on), `master_team_list.csv`, and the
  official bootstrap's team short names at snapshot time.
  `manifest.json` pins the vaastav commit it was taken from and each
  file's sha256; the backfill checks every file against it and never
  touches the network, so it rebuilds the committed ledger byte-for-byte
  (verified) even if the online repository disappears — and the ledger
  can be widened later from data already in hand.
  `npm run club-history:snapshot` took it (refuses to overwrite without
  `--force`).
- **2026/27 on: archived from the official API** by
  `.github/workflows/club-history-archive.yml` (Tuesdays and Fridays,
  05:00 UTC, plus manual runs) via `scripts/club-history/archive-current.ts`.
  Append-only: a fresh fetch overwrites a (fixture, player) row, so late
  corrections flow in, but never deletes one — a player removed from the
  game mid-season keeps his archived appearances. A run where more than
  5% of element-summary requests fail writes nothing.

**Data gaps.** Club xG/xA/xGI/xGC exist from 2022/23 (FPL didn't track
them before — null, shown as "—"). Club DC is 2025/26 on: the vaastav
archive has no defensive-contribution column for 2024/25, even though FPL
tracked it that season.

### From ledger to app

`server/src/clubHistory/aggregate.ts` turns a season's ledger into one
`ClubSeason` per club, from finished fixtures only: results (W/D/L, goals
for/against, club clean sheets = matches conceding 0, league points,
position by points → goal difference → goals scored), FPL points scored
for the club, goals (excluding opponents' own goals — the like-for-like
partner for xG), xG/xA/xGI, DC, and per-player club records.

<club_xgc_per_match>: club xGC is summed per match as the highest xGC
among the club's players in that match — i.e. that of a player on for
the whole game (xGC only accumulates with time on the pitch). All 760
club-matches in 2025/26 had at least one player on for 90+ minutes, so
this is the real club figure, not an estimate.

- **Completed seasons** are pre-aggregated into
  `server/src/clubHistory/completedSeasons.generated.ts`
  (`npm run club-history:build`; the archive workflow reruns it, so a
  season lands there automatically once its last fixture finishes).
- **The live season** is aggregated on the fly by the server's
  `/api/historic-bulk` build, from the same element-summary responses it
  already fetches for `history_past` (each carries this season's
  per-fixture `history`) — no extra per-player requests. The response's
  `clubSeasons` carries every season, live included.

**Data View mapping** (`clubSeasonsForMode()`): Current Season = the live
season; Last Completed Season = the season the player data calls the
last completed one (`historicReferenceSeason`); Historic Average = the
mean of each field over the last 4 completed seasons **the club was in
the Premier League** (never padded with zeros). A club with no record for
the view (e.g. promoted this season, viewed at Last Completed Season)
shows "—". Results metrics (League Position, Goals For/Against, …) follow
the Data View too — a Last Completed Season team tile shows that season's
table.

**Players not selectable in FPL.** Team figures include every player who
played for the club, including ones no longer in the FPL game — but
nothing is shown about them at player level. Team Profile's roster lists
the club's current (selectable) players only, each with what he did **for
this club** in the selected season. If a player returns to the game, his
player-level data comes back through the official API as normal; his
club rows were never lost.

**End of season.** Once a season's last fixture has finished, the next
scheduled archive run moves it into `completedSeasons.generated.ts`. Cut
a release after that so installed copies get it bundled before FPL
resets the live API for the new season (usually mid-July).

## Career history and historic analysis mode

### Per-player Career History (profile)

Each player's profile has a **Career History** card showing every prior
season they appear in the FPL game for — season totals (points, minutes,
starts, goals, assists, clean sheets, xG/xA/xGI where available),
start/end price for that season, and a trend comparing the two most
recent prior seasons. A player new to the FPL API (no prior seasons)
shows that plainly rather than an empty table.

Two caveats worth knowing (also stated directly under the table):

- **Expected-stats placeholders.** `expected_goals`/`expected_assists`/
  `expected_goal_involvements`/`expected_goals_conceded` are present in
  `history_past` even for seasons before FPL tracked xG at all — shown as
  the string `"0.00"` rather than the key being omitted, so treat
  exact-zero xG figures in older seasons (roughly pre-2022/23) with
  caution.
- **`defensive_contribution` in `history_past` is real from 2024/25
  onward** (the season FPL introduced the stat) — confirmed non-zero
  against the live API and genuinely used in Last Completed Season /
  Historic Average analysis, gated by
  `DEFENSIVE_CONTRIBUTION_TRACKING_START_YEAR` in
  `normalizeElementSummary.ts` so seasons before it are correctly left
  `null` rather than a misleading 0.

### Analysis mode: Last Completed Season / Historic Average / Current Season

Most main views (starting with Player Explorer; the rest followed soon
after) offer a toggle between three ways of looking at "a player's
performance", per the brief:

1. **Last Completed Season** — the player's actual totals from the most
   recently completed FPL season, however much or little they played.
   No minutes threshold applied: an injury-hit season is real data, not
   noise, when the question is specifically "what happened last season".
2. **Historic Average** — averaged across every prior season the player
   has within the most recent **4 completed seasons** (a hard window —
   currently 2022/23 through 2025/26 — that rolls forward on its own as
   real seasons complete, see below), 1 season → that season, 2 →
   averaged over 2, etc. **No minutes threshold applied**, by explicit
   product decision (see `<no_survivorship_bias>` in
   `client/src/metrics/historicAnalysis.ts`): a light or injury-hit
   season is real history and now drags the average down like any other
   season, rather than being quietly dropped from it — a player who's
   reliably excellent when fit but frequently unavailable should show a
   LOWER average than one who's merely good but always available, not a
   flattered one from only ever averaging their good seasons. A
   `MIN_QUALIFYING_SEASON_MINUTES` bar (~10 full matches) still exists
   for two narrower, unrelated purposes — flagging a season as "light"
   in the UI, and Expected Points' forward-prediction reliability gate —
   see that file for both.
3. **Current Season** — the live 2026/27 season's own bootstrap fields,
   completely unresolved (`resolvePlayerStats` returns the player
   object unchanged for `mode === "live"`). Added as a third toggle
   option later, once the brief asked for it explicitly everywhere the
   other two already existed. This is deliberately wired up even though
   every field is empty or near-empty before a ball is kicked — the
   toggle exists now so live figures simply appear as real gameweeks are
   played, with no further code change needed. `AnalysisModeToggle`
   shows a plain "fields fill in as gameweeks are played" note for this
   mode instead of the historic-window caption.

**The reference season rolls forward automatically.** Rather than
hard-coding "2025/26", `determineReferenceSeason` (in
`historicAnalysis.ts`) takes the single most recent `season_name` found
anywhere across the whole player pool's `history_past` — which *is* the
most recently completed season, by construction, since a season only
appears in `history_past` once it's over. No date arithmetic, no yearly
maintenance.

**Price in historic modes** is that season's (or the window average's)
end-of-season price, not today's live price — comparing a past season's
points against today's price would be a mismatched, misleading
Points/£m. See `<historic_price_choice>` in
`client/src/metrics/resolvePlayerStats.ts`.

**A player with nothing to show for the selected mode is omitted, not
zeroed.** No entry for the reference season, or an empty window, means
they don't appear in that view at all — pages show how many were
omitted rather than rendering misleading all-zero rows.

### Per-page filter/analysis-mode state

**Every page holds its own independent `analysisMode` + (where it has a
criteria bar) `GlobalScoutingFilters`, in plain `useState` — never a
value shared via `AppStateContext`.** This wasn't the original design:
`filters`/`analysisMode` used to live in `AppStateContext` as one value
shared by the whole app, on the reasoning that "switching it anywhere
should be consistent everywhere." That turned out to be a real bug, not
a feature — reported directly: changing Min Minutes on Player Explorer
silently changed what the Dashboard's Top-5 leaderboards showed, since
both read the same global `filters.minMinutes`, and Player Explorer was
the only one of the two with a visible control for it. No page should
ever be able to change what another page displays.

**What changed**: `AppStateContext.tsx` no longer holds `filters`,
`setFilters`, `resetFilters`, `analysisMode`, or `setAnalysisMode` at
all — only genuinely shared, expensive-to-fetch DATA remains there
(players, teams, fixtures, `historicProfiles`, etc.). The historic bulk
dataset used to be fetched lazily, gated behind "the first time any
page's analysisMode moves off live" — with a single shared toggle
removed, an earlier version of this simplified to firing unconditionally
on every app mount, which technically violated this project's own
lazy-loading rule even though every page defaulted to `"lastSeason"`
anyway and needed it almost immediately regardless (Phase 1 audit,
finding C1). Fixed by exposing `requestHistoricData()` from
`AppStateContext` — an idempotent, demand-driven trigger — and having
each page/component that actually resolves stats in a non-`"live"`
mode call it on mount, rather than the context assuming every consumer
needs it.

`GlobalScoutingFilters`/`LocalViewState`/`createDefaultLocalViewState`
moved to a new `client/src/state/scoutingFilters.ts` — a shape shared by
every page's local filters, not a piece of shared state itself. Every
page that needs both a mode toggle and a criteria bar (Player Explorer,
Underlying Numbers' top section) composes the now-**controlled**
`AnalysisModeToggle`/`FiltersBar` components (`{ mode, onChange }` /
`{ filters, onChange, onReset, analysisMode }` props — no more direct
context reads inside either), each backed by that page's own
`useState`. `LocalViewControls` (the combined one-card version already
used by Underlying Numbers' Value section and every saved User Analysis
graph) now composes the controlled `FiltersBar` internally too, instead
of duplicating its markup.

Pages with no visible criteria bar of their own (Player Comparison, Team
Detail, Teams, the Player Profile overlay) still need *some*
`analysisMode`/`filters` value to resolve player stats against — each
holds its own local `analysisMode` (defaulting to `"lastSeason"`, fully
independent of whatever mode is active on the page underneath, including
for the profile overlay opened over another page) and, where a
`GlobalScoutingFilters` value is needed only internally (e.g. a radar
chart's minutes-eligibility threshold, never exposed as a control), a
fixed, never-mutated `DEFAULT_FILTERS` constant rather than new dead
state.

**The one genuine cross-page hand-off** (Teams' "Player Rankings"
button, jumping to Player Explorer pre-filtered to a club) is now
carried via a `?team=<id>` URL query param rather than a shared-state
write — Player Explorer reads it once, on mount, to seed its own local
`filters.teamId`, and never re-syncs afterwards. Dashboard's Top-5
Player Tiles now have their own visible Search/Position/Team/Min
Minutes criteria bar too (previously this page had none at all,
silently inheriting whatever the old shared global filter happened to
be) — see "Dashboard: Player Tiles get their own criteria bar" below.

### How the whole-pool historic dataset is fetched

There's no bulk endpoint for `history_past` on the official API — only
the per-player `element-summary/{id}` endpoint has it. Building a
whole-pool dataset therefore costs several hundred individual upstream
requests. `server/src/routes/historicBulk.ts` handles this:

- Fetches every current player's `element-summary` with a
  concurrency-limited worker pool (`server/src/concurrency.ts`, 15 at
  once by default — `HISTORIC_BULK_CONCURRENCY` in `config.ts`), reusing
  the same per-player cache the profile's lazy fetch already uses.
  There's real overlap here: opening a player's profile can save this
  job a request later, and vice versa.
- Caches the aggregated result for **12 hours** — far longer than
  anything else this app caches, because `history_past` cannot change
  until a season ends.
  Concurrent requests (e.g. two browser tabs both loading cold)
  coalesce into a single build rather than starting two.
- Degrades gracefully: if a handful of players fail to fetch, they're
  reported as `skippedPlayerIds` and everyone else still loads; if more
  than half fail, the whole build is treated as a failure and falls back
  to a stale cached copy if one exists.
- **A cold build takes real time** — tens of seconds, potentially close
  to a minute — since it's several hundred sequential-ish HTTP requests
  to the official API. It's lazy (only triggered the first time any page
  needs historic data, not blocking app startup) and the client shows a
  "building the historic dataset" state while it runs. Once cached,
  every page shares the same result.

### What's still ahead

**Current Season Performance** (separate request, not started): a new
section tracking the live in-progress season gameweek-by-gameweek —
points, bonus, xG/90, xGI/90, ICT, DC/90, updating after each gameweek.
Unlike historic data, there's a bulk endpoint for this already proxied
and unused by the client: `server/src/routes/eventLive.ts` — the FPL
API's `event/{id}/live` returns every player's stats for one gameweek in
a single call, so this shouldn't need the same concurrency-pool
treatment as historic data. Deliberately not started yet: gameweek 1
hasn't happened, so the endpoint currently returns `{"elements": []}` —
there's no populated response to confirm the exact per-player `stats`
field names against, the way `history_past`'s fields were confirmed
before writing that normaliser. Better built once there's real data to
verify against.

**A new-to-FPL-this-season flag/section** (raised while testing the
toggle rollout, not started): players transferred in from other leagues
have no `history_past` at all, so they're the ones `omittedCount` is
counting on every page in historic modes. Team Builder's picker already
tags them "New" as a first, minimal step. A proper dedicated section
(who's new, at a glance) is agreed as a later piece of work.

**Everything else from this round is built**: the analysis-mode toggle
covers Player Explorer, Rankings, Value, Underlying Numbers, Dashboard,
Teams, and Team Detail. Team Builder no longer has this toggle at all —
see "Team Building: a predictive model" below, which superseded it in a
later round. The profile's Career History average now uses the same
windowed, qualifying-only calculation (`historicAnalysis.ts`) as
everywhere else, replacing the old unconditional all-seasons average.

---

## Team Building: visual pitch and drag-and-drop

The Squad card in Team Building is a formation pitch
(`client/src/components/SquadPitch.tsx`) rather than a checkbox list:
starting XI players are laid out by position (FWD → MID → DEF → GKP,
top to bottom) with a separate bench strip below. Dragging a card onto
another swaps their bench/starting status; dragging onto open pitch or
bench space moves a player there directly; the × on a card removes that
player from the squad entirely.

- **Built with the native HTML5 drag-and-drop API** (`draggable`,
  `onDragStart`/`onDragOver`/`onDrop`), not a library — no drag-and-drop
  package is installed, and this project avoids adding a dependency for
  one call site. `e.stopPropagation()` in each card's `onDrop` is
  load-bearing: without it, dropping onto a card would also fire the
  containing pitch/bench zone's own drop handler and double-apply the
  move.
- **Every drag operation reuses `toggleStartingCore`** — the same
  validated bench/starting-XI rule TeamBuilder already had (11-player
  cap, exactly one starting goalkeeper, auto-benching the other GKP when
  a second one starts). A swap is implemented as that same function
  applied twice in one state update (bench the outgoing player first, so
  there's room for the incoming one) rather than as separate logic that
  could drift out of sync with it.
- **The pitch is always visible**, and the Add Players picker's rows are
  draggable too — dropping a picker row straight onto the pitch or bench
  adds the player (validated by the same `canAddPlayer` rules the "Add"
  button uses) rather than requiring an Add-then-drag two-step. A
  rejected drag (budget, composition, or club limit) shows a brief
  warning banner with the specific reason instead of silently doing
  nothing.
- **Captain/vice-captain are click-to-assign, not dropdowns**: two small
  tiles top-left of the pitch arm "pick" mode (the eligible starting-XI
  cards pulse while armed); clicking a player assigns them and disarms
  automatically. Clicking the current captain/vice-captain directly
  toggles them off without re-arming the tile. Each card shows ownership
  and expected points for the selected gameweek window, captain-doubled
  live when you assign/unassign — same formula as the aggregate
  "Expected Points" card, just surfaced per player. See "Team Building: a
  predictive model" below for what "expected points" actually means here.
- **Cards always land in the correct position row structurally** —
  `positionGroups` is built from each player's own `.position` field,
  never from where exactly a card was dropped, so "goalkeeper in goal,
  defenders in front of them, then midfielders, then forwards" holds
  regardless of the literal drop location on the pitch.
- **Each card shows its club and next 5 fixtures**, colour-coded by
  FPL's own 1–5 difficulty rating (confirmed directly against a live
  `fixtures` response, present even on unplayed fixtures —
  `team_h_difficulty`/`team_a_difficulty`). Fixtures were previously
  fetched and normalised (`normalizeFixtures.ts`) but never actually
  loaded anywhere in the app — this is now wired into
  `AppStateContext`, fetched independently of the main bootstrap load so
  a fixtures failure never blocks the rest of the app.
- **Pitch markings** (centre circle, centre spot, penalty boxes, goal
  mouths) are pure CSS decoration — no image assets.
- Formation validity (3-5 DEF / 2-5 MID / 1-3 FWD) is still a soft
  warning banner, not a block on the drag interactions — you can freely
  drag your way to an invalid formation and see why, same as the
  checkbox version did.
- This is desktop-oriented (built for the documented Chrome/`npm run
  dev` workflow); native HTML5 drag-and-drop has known weak touch
  support, so this hasn't been built or tested for a touch device.

## Team Building: a predictive model (deliberate exception to "descriptive, not predictive")

Every other section of this app is explicitly descriptive — it never
tells you what will happen, only what has. Team Building is the one
deliberate exception: at the user's request, it's about predicting the
best squad for the *current* season, and its two headline numbers
(Expected Points, Minutes Reliability) are genuinely predictive. That's
a real shift in what this app claims to do, confined to one section on
purpose, and called out here in case future-me forgets why this part
reads differently from the rest of the codebase.

**This is a disclosed heuristic, not a fitted model.** A real predictive
model needs a training pipeline — regression or ML fit against
historical outcomes, with validated, empirically-derived weights. This
project has no data-science environment to do that in, so what's built
here is a transparent formula with judgement-call coefficients, not
something statistically validated. Every weight is a named constant with
a comment explaining the reasoning, specifically so nobody mistakes a
clean-looking decimal for more rigour than it has.

### Expected Points

Anchored on FPL's own `ep_next` field — their official published
expected-points prediction for a player's next gameweek, confirmed
present and populated even pre-season. The explicit design decision here
(made after review) was **not** to rebuild this from scratch. FPL's own
model almost certainly has signals this app doesn't (team news, live
form, historical calibration) — reinventing it from surface-level
proxies risked producing something worse than what's already sitting in
the data this app already fetches. "Just use that number" was the
instruction, and that's what happens for the immediate gameweek.

FPL doesn't publish `ep_next2`, `ep_next3`, etc., so gameweeks beyond
the immediate one extend forward using only real, FPL-published
fixture-difficulty data (`client/src/metrics/expectedPoints.ts`):

- The very next fixture = `ep_next`, unmodified.
- Each fixture after that = `ep_next × fixtureMultiplier(difficulty, position)`, where the multiplier moves the estimate away from
  neutral (FDR 3) by a per-position sensitivity constant
  (`FDR_SENSITIVITY` — forwards swing most on attacking difficulty,
  defenders/goalkeepers least, since appearance/DC/save points are less
  fixture-dependent than goal threat).
- "Gameweek" here means each player's own next fixtures, not a calendar
  slot — a blank gameweek has no fixture to select, and a double
  gameweek's two fixtures both show up as consecutive steps, simply by
  using "next N fixtures" as the unit throughout (`getUpcomingFixtures`,
  already built for the pitch's fixture ticker).

**Team Building no longer sums a 1/3/5-gameweek window into one
figure.** A gameweek navigator on the pitch view (`GW+1` .. `GW+5`)
picks exactly one of a player's next five upcoming fixtures, and both
this figure and Expected Points Tier 2 (below) show that single
fixture's estimate — on the pitch cards and in the Add Players table —
recomputed live as the navigator moves.
`computeExpectedPointsForSingleFixture` is the single-fixture building
block; `computeExpectedPointsForWindow` still exists for anything that
wants that shape, but its only two callers — `optimalDraft.ts` and
`transferSolver.ts` — were themselves confirmed fully orphaned (zero
importers from any page) during the Phase 2 remediation pass and have
since been deleted outright, the same way `squadRating.ts` was earlier
(see "Archetype system removal" above). Don't confuse any of these with
the separate, unrelated, and very much live `squadRules.ts`, which
holds squad-legality validation (`validateSquad`/`validateStartingXI`/
`canAddPlayer`) imported by `TeamBuilder.tsx` and `SquadPitch.tsx`.

No separate "team defence" / "opponent attack" buckets: FDR is already
substantially derived from team strength by FPL, so weighting both
would double-count the same signal. This was a specific correction from
the first draft of this model (which listed them separately), caught
before writing any code.

### Minutes Reliability

`client/src/metrics/minutesReliabilityBlend.ts`. An adaptive blend,
proposed as an answer to "this is more static, any ideas for optimising
it":

- **Historic component**: average, across qualifying historic seasons,
  of minutes played ÷ a full 38-game season's possible minutes (3420).
- **Live component**: this season's minutes ÷ (the player's club's
  games played so far × 90) — null before any live games exist.
- **Blend weight shifts automatically**: `currentWeight = min(1, club's games played / 8)`. Pre-season this is 100% historic; by gameweek 8 it's
  100% live. No manual toggle — the trust shifts on its own as real
  data accumulates.
- **Multiplied by availability** last: FPL's own
  `chance_of_playing_next_round` percentage when published, else a
  status-based default (available = 1.0, doubtful = 0.5, anything else
  = 0). An impeccable track record still shows near-zero reliability for
  a currently-injured player.

### What's live vs. what's historic in this section now

Team Building no longer has the Last Completed Season / Historic
Average toggle the rest of the app has — it was superseded by the model
above, which already decides internally what mix of historic and live
data to use for each of its two outputs. Squad rules (budget, price,
composition, club limits) still always use live data, unchanged.
Archetypes (feeding Good Differentials / Archetype Mix) now use a fixed
historic-average basis rather than a user-selectable one, since this
section isn't about choosing a description basis anymore.

### Squad status lives in the pitch header now

Size/budget/composition/club-limit status used to be its own card above
the pitch; it's now a compact line in the pitch header, next to the
squad name, rather than a separate scroll-past card. Same
`SquadValidation` data, same rules, just relocated — `SquadPitch.tsx`
renders it via a small `SquadStatusLine` component.

### Viewing a profile from the pitch

Every player card on the pitch/bench, and every picker row, already had
a click behaviour (captain-assign, or drag-to-add) — so viewing a
profile needed its own distinct target rather than overloading the
card's own click. The player's **name** specifically is the reference
point: clicking it calls `stopPropagation()` before opening the profile
overlay (`?player=id`), so it doesn't also trigger the card's
captain-assign click or interfere with the drag gesture. The rest of
the card keeps its existing behaviour untouched.

## Expected Points — Tier 2 (now shipped: live in Team Building's Add Players table, labelled "Exp. Pts (Model Predicted)")

A second, independent Expected Points estimate, built alongside — not
instead of — the existing model above. Where Tier 1 trusts FPL's own
`ep_next` outright, Tier 2 never looks at `ep_next` at all: it estimates
each of FPL's actual scoring events separately from this app's own
normalized stats, using FPL's real scoring rules, and sums them.
`client/src/metrics/expectedPointsV2.ts` — a separate module, deliberately
not touching `expectedPoints.ts`. It started experimental, not replacing
any figure shown anywhere in the app, pending the backtest results
below; once that backtest supported it (per this app's own "never
replace a working, documented feature with an unvalidated one" rule),
`TeamBuilder.tsx` wired it in alongside Tier 1's figure — see "Now
wired into Team Building, alongside — not instead of — Tier 1" further
down — with a tooltip that self-discloses its experimental nature to
end users.

### Scoring rules used (2026/27, cross-checked directly, not assumed)

| Event | GK | DEF | MID | FWD |
|---|---|---|---|---|
| Plays 1-59 mins | 1 | 1 | 1 | 1 |
| Plays 60+ mins | 2 | 2 | 2 | 2 |
| Goal | 10 | 6 | 5 | 4 |
| Assist | 3 | 3 | 3 | 3 |
| Clean sheet (needs 60+ mins) | 4 | 4 | 1 | 0 |
| Every 3 saves | 1 | — | — | — |
| Penalty save | 5 | — | — | — |
| Every 2 goals conceded | -1 | -1 | 0 | 0 |
| Defensive contribution (flat, doesn't stack) | — | +2 | +2 | +2 |
| Bonus (top 3 BPS per match) | 3/2/1 | 3/2/1 | 3/2/1 | 3/2/1 |

Defensive contribution needs 10+ combined clearances+blocks+interceptions+tackles (CBIT) for a defender in one match, or 12+ of the same four plus recoveries (CBIRT) for a midfielder/forward — FPL's `defensive_contribution_per_90` field already reflects the position-correct definition, so this app doesn't reconstruct it from the individual components. Cards, red cards, own goals, and penalty misses are **not modelled** (assumed zero) — small, rare events with no per-player historic rate normalized anywhere in this app; modelling them from nothing would be worse than naming the gap. Penalty saves are the same story specifically for goalkeepers.

### Two small data gaps filled in to support this

- **`NormalizedTeam.strengthOverallHome/Away`** — FPL's own overall team-strength rating (roughly 2-5), newly normalized from `bootstrap-static`. The more granular `strength_attack_home/away` / `strength_defence_home/away` fields also exist on the live API, and would be a better input for clean-sheet estimation — but as directly observed on the live 2026/27 endpoint on 9 Sept 2026 (gameweek 4), **they read 0 for every single team**, not yet populated this early in the season. Only the overall ratings are used as a result; worth revisiting once FPL populates the granular fields.
- **`NormalizedPlayer.saves` / `savesPer90`** — season-to-date save counts, newly normalized (existing goalkeeper columns had never needed this before). Genuinely 0, not null, for an outfield player — same convention as `bonus`/`bps`.
- **`UpcomingFixture.opponentTeamId`** — the opponent's numeric id was already computed inside `getUpcomingFixtures` but not returned; now exposed so Tier 2 can look up the opponent's own team-strength rating per fixture.

### Per-event modelling

- **Appearance points**: the blended minutes-reliability figure already computed elsewhere (`minutesReliabilityBlend.ts`) is a single 0-1 share, but the scoring rule is a three-way step function (0 / 1 / 2 points). `splitMinutesProbability()` converts one into the other via `p60 = r^1.5`, `p0 = (1-r)^1.5`, remainder = `p1to59` — a judgement-call power curve (like `FDR_SENSITIVITY` elsewhere in this app), chosen so reliable players skew toward "start and finish or don't feature at all" rather than a smeared, unrealistic 45-minutes-every-time distribution this app has no real data to justify more precisely.
- **Goals & assists**: pay per event with no cap, so expected points from them is just `xG/90 (or xA/90) × expected-minutes-fraction × fixture attack multiplier × point value` — no probability distribution needed for an unbounded-count event. The fixture attack multiplier **reuses** `fixtureMultiplier()` from Tier 1 rather than inventing a second fixture-adjustment scheme — one fixture-difficulty judgement call in this app, not two.
- **Clean sheets**: genuinely needs a probability (a threshold, flat-value outcome), estimated from the defending side's own home/away-specific overall-strength rating vs. the attacking side's, mapped through a bounded linear function anchored on a ~28% league-average clean-sheet rate (`estimateCleanSheetProbability`), then gated by `p60Plus` — a clean sheet only pays for 60+ minutes. Falls back to the flat anchor, not a guessed direction, if either side's rating is unavailable.
- **Goals conceded** (GK/DEF only): `xGC/90 × expected-minutes-fraction`, scaled by the mirror image of the same fixture multiplier (a harder fixture means facing a stronger attack, so MORE expected concessions, not fewer). "Every 2 conceded → -1" is a discrete floor() rule; `E[floor(X/2)]` is approximated as `E[X]/2` — a continuous relaxation, documented rather than hidden, and immaterial at the fractional-goal scale this operates on.
- **Saves** (GK only): `saves/90 × expected-minutes-fraction ÷ 3` — a continuous rate, same reasoning as goals/assists.
- **Defensive contribution**: the hardest one to get right, and honestly flagged in the model's own output as its least certain component. It's a threshold on a per-match total, but only a per-90 season rate exists for the live model (match-by-match action counts aren't bulk-fetched anywhere in this app — see the backtest section below for where they ARE used). Approximated via a Poisson distribution: `λ = defensive_contribution_per_90 × expected-minutes-fraction`, `P(reach threshold) = P(X ≥ threshold)` for `X ~ Poisson(λ)`. A genuine approximation, not a measured probability — real defensive-action counts are typically more variable than a Poisson distribution assumes, so this likely understates the true spread.
- **Bonus**: the roughest approximation in the whole model, and it's fine to say so — BPS depends on how a player compares to 21 others in the same match, which nothing in this app's data can see directly. A historic bonus-points-per-90 rate (from qualifying prior seasons), scaled by expected minutes and the same mild fixture-favourability multiplier used for goals/assists. Nothing more sophisticated is attempted here.

Every `ExpectedPointsV2Breakdown` carries a `caveats: string[]` array listing exactly which of the above applied for that specific estimate (missing xG/xA/xGC/saves/DC data, the always-true omissions, the DC and bonus roughness notes) — read before trusting the total at face value, per this app's own convention.

### Why Tier 1 itself can't be backtested (and what this backtest compares instead)

Tier 1's headline figure is built on FPL's own `ep_next` — a live,
continuously-updated "current best guess," with **no historical record
anywhere**. There is no way to ask the FPL API "what was `ep_next`
before gameweek 2" after the fact, so a true head-to-head backtest of
Tier 1's actual number against Tier 2 isn't possible with data that
exists — this was checked directly against the raw API and confirmed
absent, not assumed.

What CAN be faithfully reconstructed for any past gameweek is Tier 1's
other two inputs — `lastSeason` and `historicAverage` — both pure
prior-season rate extrapolations that never depend on the live season,
so they're identical whether computed today or reconstructed for
gameweek 2. The backtest below compares Tier 2 against that
reconstruction (`computeExpPointsBreakdown`'s `overallAverage`, with
`fplPredicted` forced null) — a genuinely fair, apples-to-apples
comparison, just not the exact number Team Building shows today (which
also blends in live `ep_next`).

### Backtest methodology and results

`client/scripts/backtestExpectedPoints.ts` — run with `npx tsx
client/scripts/backtestExpectedPoints.ts` from the repo root. Fetches
the live FPL API directly (bootstrap-static, fixtures, and
`element-summary` per sampled player), reconstructs each sampled
player's cumulative per-90 rates and reliability **as of immediately
before** each past gameweek (never using data from the gameweek being
predicted or later — no leakage), and compares both models' single-
fixture estimate to the real result. Real per-match fixture difficulty,
opponent, and home/away are looked up from the actual historical
fixture list, not approximated.

**Sample**: the 20 highest-minutes players per position (80 total) as
of the time this was run — a documented, bounded selection, not a
random sample or every player who's featured, chosen to keep the
script's load on FPL's public API reasonable while covering a
position-balanced cross-section of players with an actual per-90 rate
to estimate from.

**Depth**: only gameweeks 2 and 3 were backtestable at the time this was
run (gameweek 1 has no prior data to predict from, and gameweek 4 hadn't
been played yet) — 156 backtest points total. This is a genuinely small
sample from a very early point in the season; treat the numbers below as
an early read, not a settled verdict, and re-run this script as the
season progresses for a more reliable comparison.

Results from that run:

| | n | MAE | Mean signed error |
|---|---|---|---|
| Tier 2 | 156 | 2.66 | +0.23 (slight over-prediction) |
| Tier 1 baseline (historic-rate only) | 125 | 2.76 | +0.60 (over-predicts more) |

*(Tier 1 baseline has fewer rows — some sampled players have no
qualifying prior season, e.g. newly-established Premier League players,
so it's null for them while Tier 2 still produces a caveated estimate
from live per-90 rates alone.)*

By position:

| Position | n | Tier 2 MAE | Tier 1 baseline MAE |
|---|---|---|---|
| GKP | 38 | 2.27 | 1.90 |
| DEF | 40 | 2.47 | 2.54 |
| MID | 40 | 3.38 | 3.31 |
| FWD | 38 | 2.48 | **3.07** |

Tier 2's clearest edge is at forward (a full point of MAE better) — plausibly because it's estimating goal threat from this season's actual live xG/90 rather than a flat prior-season rate, which matters most for the position where scoring output is most volatile season to season. Tier 1's baseline edges it out for goalkeepers, where clean sheets and saves dominate and a flat historic rate may simply be a more stable target than this early season's small sample.

By current ownership (a rough "nailed-on vs. differential" split, since only 2 backtestable gameweeks exist so far — too little depth for an appearance-count-based split to mean anything):

| | n | Tier 2 MAE |
|---|---|---|
| Ownership ≥15% ("nailed-on") | 28 | 3.89 |
| Ownership <15% ("differential") | 128 | 2.39 |

Tier 2 does noticeably worse on high-ownership players — the same
direction FPL Pulse's own published comparison against FPL's official
xP has described. Some of this is a property of MAE itself rather than
a model flaw specifically: popular players tend to be explosive
high-ceiling picks, so a single big haul produces a large absolute
error regardless of which model predicted it. Worth re-checking once
there's enough season depth to separate "Tier 2 is worse at nailed-on
players" from "nailed-on players are just higher-variance."

### Now wired into Team Building, alongside — not instead of — Tier 1

With the backtest above showing genuine (if early and mixed) promise —
roughly tied overall, clearly ahead at forward, behind at goalkeeper
and for high-ownership players — the decision made was **not** to
replace Tier 1, and not to wait for a deeper backtest before showing
Tier 2 at all. Team Building's Add Players table now shows both figures
as separate columns, **Exp. Pts (FPL Official)** and **Exp. Pts (Model
Predicted)**, so a person using the app can see both and judge for
themselves which to trust for a given player — exactly the "surface
alongside, never replace outright" approach this section originally
called for, just exercised now rather than after a deeper backtest,
since showing both costs nothing a user can't already see through
(hover the Model Predicted figure for its caveats).

The old three-way Last Completed Season / Historic Average / Overall
Average breakdown and the 1/3/5-gameweek window toggle are both gone
from the Add Players table — replaced by the single-fixture gameweek
navigator described above, which now drives both Expected Points
columns together. `optimalDraft.ts` and `transferSolver.ts` still
referenced the old window-summing shape (`computeExpectedPointsForWindow`/
`ExpPointsBreakdown`) but weren't imported from any page any more at
the time this was written — orphaned by an earlier Team Building
simplification, left alone rather than touched as part of this change.
(`squadRating.ts` was in the same "orphaned" position at the time; it
was later deleted outright, not left orphaned — see "Archetype system
removal" above. Both `optimalDraft.ts` and `transferSolver.ts` were
likewise confirmed still-orphaned and deleted outright during the
Phase 2 remediation pass — see the note under "Team Building: a
predictive model" above. `squadRules.ts` is a different, unrelated
module and remains live squad-legality validation, imported by
`TeamBuilder.tsx`/`SquadPitch.tsx` — not dead code.)

Re-running the backtest with more depth (more gameweeks, the full
player pool rather than the top 20 per position) as the season
progresses remains worthwhile — the numbers above are still an early
read, and the gap in how Tier 2 handles goalkeepers and nailed-on
picks specifically is worth watching rather than dismissing.

## Player Comparison

Comparison moved out of the player profile into its own section
(`client/src/pages/PlayerComparison.tsx`) supporting up to 5 players at
once, up from the profile's old fixed pair. The profile still links
into it (pre-filled with that player) rather than duplicating the
table.

- **Every metric is `PLAYER_COLUMNS`** — the same source Player Explorer
  and Rankings now both use — grouped the same way, rather than a
  separately hand-curated comparison list that could drift from what's
  available elsewhere.
- **Colour scale is better/worse, not mechanically higher/lower**: each
  `PlayerColumn` now carries an optional `higherIsBetter` flag (default
  true). Price, ownership, and xGC are the three explicitly flagged
  `false` — the request specifically named these as "higher is worse" —
  every other metric defaults to higher-is-better. The highest-*rated*
  value in a row (respecting that flag) gets full green, the lowest-rated
  gets full red, and values near the middle of the row's range fade
  toward neutral grey. Still computed per-row against only the players
  actually being compared, not an absolute scale.
- **A Summary card** states who rates best overall and why, but stays
  within what's actually computed rather than implying a holistic
  verdict: it's a plain count of how many metrics each player leads on
  (`computeWinTally` in `PlayerComparison.tsx`), stated as exactly that.
  A universal tie on a metric awards nobody a point for it. Alongside
  the overall count, it separately reports who leads within just the
  ACTUAL OUTPUT group (points, goals, assists, clean sheets, bonus),
  since that's usually more decision-relevant than a raw count across
  all ~20 metrics — the caption says directly that this treats every
  metric as equally significant, which they obviously aren't, rather
  than dressing up an unweighted count as a rigorous verdict.
- Respects the same three-way analysis-mode toggle as the rest of the
  app (Last Completed Season / Historic Average / Current Season); a
  player with nothing to show for the selected mode is named and
  excluded rather than shown as misleading zeros.
- **Clicking a player's name in the comparison table** opens their
  profile (`?player=id`) — previously the table had no way to do this at
  all.
- Selection lives in the URL (`?players=id,id,id`), so a comparison is
  shareable/bookmarkable the same way the profile's old compare param
  was.

## Player Explorer: column customisation

Columns in Player Explorer can be reordered, resized, compressed to fit,
and reset — `client/src/pages/PlayerExplorer.tsx`.

- **Reordering uses native HTML5 drag-and-drop** (same approach as the
  Team Building pitch), dragging a header onto another to swap its
  position in the order.
- **Resizing uses pointer events, not drag-and-drop** — a small handle
  on each header's right edge tracks `pointermove`/`pointerup` on
  `window` directly, because resizing needs continuous position
  feedback on the same element being interacted with, which HTML5
  drag-and-drop doesn't provide. The handle is explicitly
  `draggable={false}` so starting a resize there doesn't also get
  picked up as a reorder-drag on the header it sits inside.
- **`visibleColumns` is now the display order**, not just a membership
  filter — previously it stored *which* columns were visible but
  display order always fell back to `PLAYER_COLUMNS`' fixed order
  regardless. Toggling a new column on now appends it to the end of the
  current custom order rather than snapping back to canonical order.
- **Column width state (`columnWidths`) is sparse by design**: a column
  only gets an entry once explicitly resized (by hand or by Fit to Box).
  No entry means natural/auto width. This is what makes Reset Columns
  simple and correct — `setColumnWidths({})` alone restores every
  column to natural sizing, no need to know or restore "the default
  width" for anything.
- **Fit to Box** measures the actual rendered width of the sticky
  Player and Archetypes columns (via refs, not a hard-coded estimate)
  and divides whatever's left evenly across the currently visible
  columns, floored at a minimum readable width. With enough columns
  visible, the floor wins and the table still scrolls — that's expected
  degradation, not a bug: Fit to Box can't force more columns into less
  space than they can readably occupy.
- Reordering, resizing, and the "Columns" visibility picker are
  deliberately scoped to the metric columns only — the sticky Player
  column and the Archetypes column stay fixed in place, consistent with
  the "Columns" picker never having listed them either.

## Dashboard: team snapshot, no Quick Links

Quick Links (a row of links to every other section) was removed — the
sidebar nav already lists every section, so the card was pure
duplication. The freed space went to more Top-5 boxes:

- **xGI/£m** and **Goals + Assists Above xGI** reuse derived metrics
  that already existed (`xGIPerMillion`, `goalInvolvementsMinusXGI` in
  `playerMetrics.ts`) — no new calculation needed, just two more
  `TopList` cards.
- **Team Points / Team xGI / Team Clean Sheets** are genuinely new: a
  small `TeamTopList` component (`client/src/components/TeamTopList.tsx`)
  alongside the existing player-only `TopList`, since team rows don't
  fit that component's player-specific identity display (position
  badge, availability flag). Team aggregation uses the exact same
  current-squad attribution as the Teams page (every resolved player
  summed under their current club) — deliberately, so these numbers
  match what you'd see clicking through to Teams rather than looking
  like a second, subtly different total. Clicking a team row navigates
  to that club's Team Detail page.

## Bug: "Current Season" mode was showing last season's data

Found during user testing, not by this app's own checks — a good example
of why. Confirmed directly against the live API: `bootstrap-static`'s
cumulative per-player fields (`total_points`, `minutes`, `goals_scored`,
`assists`, `clean_sheets`, `bonus`, `bps`, `ict_index`, the whole
expected-stats family, `starts`, `defensive_contribution`, every
`_per_90` variant) **are not reset at the season boundary**. Pre-season,
they still carry 25/26's final totals, even though gameweek 1 is
confirmed unplayed (`"finished": false`) and every club shows
`"played": 0`. "Current Season" mode returned the live player
completely unresolved, so all of that stale carryover passed straight
through as if it were real 26/27 data. Only `now_cost` (price),
`selected_by_percent` (ownership), `status`/`news`/
`chance_of_playing_next_round`, and `ep_next` (forward-looking, not
accumulated) are genuinely live before a ball is kicked.

**The fix doesn't need nullable types.** The key realisation: pre-season,
the *true* current-season value for every one of those cumulative
fields genuinely **is** zero — zero games played, zero points actually
scored — not "unknown". So `resolvePlayerStats` (`metrics/
resolvePlayerStats.ts`) can safely zero them rather than needing them to
become nullable, which would have meant touching `NormalizedPlayer`'s
core type and every direct arithmetic use of it. Per-90 *rates* go to
`null` instead of zero, since a rate is undefined — not zero — with
zero minutes played (`per90(0, 0)` already returns `null`, so this falls
out for free from the existing helper). Price, ownership, and
availability are untouched either way.

`currentSeasonHasStarted` (`AppStateContext` — true once any club shows
`played > 0`) is the signal for whether to trust the raw fields or apply
the correction. `resolvePlayerStats` and `resolvePlayerStatsList` both
take it as a required parameter now, threaded through from every one of
their nine call sites (all eight toggle-equipped pages plus
`PlayerDetailOverlay`).

**A second, related bug found during the same investigation**: the
player profile's main stat cards (`Actual Output`, `Underlying
Performance`, `Value`) read live fields directly and had no mode
awareness at all — this page was built before the analysis-mode system
existed and was never connected to it, so it showed the same stale
numbers unconditionally, with no toggle to fix it and no label saying
what season it represented. It's wired in now: `AnalysisModeToggle` was
added to the overlay, the three stat cards plus the archetype/percentile
computation now resolve through the same mechanism every other page
uses, and a player with nothing to show for the selected mode gets a
clear empty state instead of a wall of misleading zeros. Identity
(name, team, position, price/ownership in the header), Career History,
Playing-Time Indicators, and the Compare link were already correct —
those pull from `history_past`/gameweek `history`, genuinely different
data sources unaffected by this bug — and stay on the live player
throughout, unchanged, matching how every other page keeps identity
live and only resolves the performance figures.

**What's still unaffected, confirmed during the same audit**: Team
Building's Expected Points (anchored on `ep_next`, forward-looking, not
accumulated) and Minutes Reliability (its live component already divides
by `team.played × 90`, which is `0` pre-season, so it was already
correctly falling back to history — by how it happened to be built,
not by design against this specific bug).

## Follow-up bug: the minutes/starts eligibility filter emptied Current Season views

Found immediately after the fix above, by the same route (user testing).
The zeroing fix was correct, but `filters.minMinutes` (default 450 —
roughly 5 games' worth) is applied on top of it to decide which players
even show up in a view at all. Pre-season, or early in a live season,
genuinely everyone falls under that bar — so Current Season mode went
from "showing wrong data" to "showing nothing", for the same underlying
reason.

**Fix**: `effectiveMinMinutes(filters, mode)` in `state/
useFilteredPlayers.ts` — returns `0` for live mode, the user's actual
setting otherwise. `filterPlayers`/`useFilteredPlayers` now take
`analysisMode` and use this for both the minutes bar and (same
reasoning) the minimum-starts filter, rather than applying either
against a season that hasn't accumulated a real track record yet.
Threaded through every page that filters by minutes — Player Explorer,
Rankings, Underlying Numbers, Value, Dashboard's Top-5 eligibility, and
the profile's percentile/archetype/small-sample calculation. `Team
Builder` needed no change — its archetype computation is hardcoded to
historic-average, never live, so the threshold is always meaningful
there.

**`FiltersBar`'s Min minutes/Min starts controls are disabled (not
hidden) in live mode**, with a tooltip explaining why, rather than
leaving them looking live while silently doing nothing — a control that
visibly does nothing is worse than a control that's visibly turned off.
Dashboard's "Eligibility threshold" caption says "none (bypassed for
Current Season)" instead of a number that would no longer be true.

## Minor fixes and structural changes (latest round)

- **Historic Average's "Starts" was hardcoded null** — an original
  oversight (`careerMetrics.ts` never computed a starts average, so
  `resolvePlayerStats.ts` just passed `null`). Added
  `avgStartsPerSeason` using the same `avgOrNull` pattern as the other
  partially-available career fields, and wired it in.
- **Rankings removed entirely** — route, nav item, and file deleted. Its
  job (ranking by any metric) is already covered by sorting Player
  Explorer's columns.
- **Value merged into Underlying Numbers.** Same page now, in sections
  (`Expected vs Actual`, then the Value content unchanged, then a new
  `Build Your Own Graph` section). Value's route/nav/file are gone.
- **Build Your Own Graph**: two dropdowns sourced from the same
  `PLAYER_COLUMNS` list every other page uses, plotted via the existing
  `ScatterWithReference`. No reference line — an arbitrary metric pair
  usually isn't an expected-vs-actual relationship, so one isn't drawn
  unless the chart is specifically built to represent that (like the
  charts above it).
- **Team Building's Add Players picker gained Team, Price range, and
  Archetype filters** — the same popover/multi-select patterns already
  used in `FiltersBar`, not new UI language. Archetype filtering reuses
  the same historic-average-basis `archetypeMap` already computed for
  Good Differentials/Archetype Mix, so a player filtered in here is
  guaranteed to match how they're labelled elsewhere in the section.

## Team Building: the Add Players table rebuild

The picker went from a 4-column static table to a fully customisable one
matching Player Explorer's engine, split into two independently
governed column groups.

**Shared engine, not a second implementation.** Player Explorer's
reorder/resize/Fit-to-Box/Reset logic was extracted into
`state/useColumnCustomization.ts`, and Player Explorer was refactored to
use it rather than keeping its own inline copy — asked for explicitly
("if you can do this and it is efficient for you to do so please go for
it as long as we retain accuracy"), and it means the two tables can't
drift apart over time the way two parallel implementations would.

**Two column groups, two independent toggles, both embedded in the table
itself** (moved out of the page header, per the brief):

- **Predictive** — governed by the Next 1/3/5 GW toggle. Six columns:
  Exp. Pts (FPL Predicted, Last Completed Season, Historic Average,
  Overall Average), Minutes Reliability, and Next 5 Fixtures
  (colour-coded exactly like the pitch tiles, reusing `fdrColor`).
- **Historic/Raw** — governed by a *new*, second toggle (Last Completed
  Season / Historic Average / Current Season), independent of the
  predictive one. This is `PLAYER_COLUMNS` itself, the same list Player
  Explorer uses, minus `ownership` (pinned separately, so listing it
  again here would be redundant) — so a predictive figure and a historic
  one can sit side by side in the same row.

**Groups can't be reordered into each other — by construction, not a
guard clause.** Each group is its own `useColumnCustomization` instance
with its own `visibleColumns` state. `reorderColumn` looks the dragged
key up in `visibleColumns` via `indexOf`; a predictive key dropped onto
a historic/raw column returns `-1` and the reorder silently no-ops,
because the two key namespaces never overlap. No explicit "prevent
cross-group drops" logic was needed. The visible line between the two
groups (`.column-group-divider`, a 2px accent border on the first
historic/raw column) is purely cosmetic — the real separation is the
state architecture.

**The Exp. Pts figures aren't all computed the same way**
(`metrics/expectedPoints.ts` → `computeExpPointsBreakdown`):

- FPL Predicted is `computeExpectedPointsForWindow` (already existed —
  `ep_next`, fixture-difficulty-extended).
- Last Completed Season and Historic Average are backward-looking rates
  (that season's/those seasons' points-per-game) re-purposed as a
  per-window estimate — `pointsPerGame × window`, sourced by resolving
  the player through `resolvePlayerStats` in `"lastSeason"` /
  `"historicAverage"` mode and reading the same `pointsPerGame` field
  the rest of the app already uses. Not fixture-adjusted — those seasons
  are over, there's no fixture left to adjust against.
- Overall Average is the mean of whichever of the three above exist,
  never a sum-of-three-divided-by-three — a summer signing with no Last
  Completed Season figure doesn't get dragged toward zero for lacking
  one. A `*` marker (with a tooltip naming what's missing) shows when
  the average was built from fewer than three inputs, so it's visibly
  flagged rather than silently presented as complete.

**Three pinned-left columns with fixed widths, not measured ones.**
Player Explorer's single sticky column has a natural (unmeasured)
width; stacking three sticky columns reliably needs *known* widths so
the second and third can compute their own `left` offset in CSS. Player
(170px), Add (64px), Own% (70px) are fixed via `.picker-sticky-*` rather
than JS-measured — the brief confirmed Add pinning left (not right) was
fine, which avoided needing right-side sticky positioning entirely, a
CSS capability this table doesn't otherwise need.

**Sort order**: the 40 shown candidates are sorted by Exp. Pts (FPL
Predicted) regardless of which columns are currently visible or how
they're ordered — column customisation here governs *display*, not
ranking (matching how Player Explorer's own column reordering doesn't
change its sort either — that's driven by clicking a header).

## Sortable columns, fixture difficulty number, auto Fit to Box

- **Team Building's Add Players table is now sortable** — click any
  header (pinned or in either column group) to sort, shift-click to add
  a secondary tiebreaker, same interaction as Player Explorer. This
  reused the same mechanism rather than a second one:
  `state/useSortSpec.ts` now holds the sort-state hook and the
  null-safe, string-and-number comparator, and Player Explorer was
  refactored to use it too.
- **Found and fixed a real bug while extracting that shared hook**:
  clicking the "Player" header in Player Explorer did nothing — `name`
  isn't a `PLAYER_COLUMNS` entry, so `columnByKey("name")` returned
  `undefined` and the sort silently skipped it. Both tables now handle
  the name column as a special case before falling back to
  `columnByKey` for everything else.
- **Next 5 Fixtures now shows an average difficulty number** next to
  the coloured chips, and that average is what the column actually
  sorts by — asked for specifically so the fixture run itself becomes
  sortable, not just visually scannable.
- **Fit to Box now runs automatically** the first time each table has
  real content to measure, on both Player Explorer and Team Building's
  picker — a `useRef` flag makes sure it only fires once, since the
  effect can't safely depend on row content across Team Building's
  early return (`pickerRows` isn't computed until after
  `if (!active) return`, so that effect instead retries against the
  DOM ref directly on every render until it succeeds, then the flag
  makes every render after that a no-op). This was specifically about
  the *default* view not looking cramped on a narrower screen before
  anyone's touched the button — manually clicking Fit to Box or Reset
  Columns still works exactly as before.

## Bug fixes, minor changes, and the profile radar chart (latest round)

**Exp. Pts (Last Completed Season) was calculating wrong for
low-minutes players — fixed.** Root cause: `pointsPerGame` is actually
points-per-90-*minutes-played*, not points-per-game (an approximation
this app has used since early on, for seasons where a comparable
"games played" figure wasn't available). For a well-sampled season
that's reasonable; for a player with, say, 45 minutes and one lucky
haul last season, it produced a wildly inflated rate that then got
multiplied by the GW window, compounding the distortion.
`resolvePlayerStats`'s "lastSeason" mode deliberately applies no
minutes floor at all — correct for its own descriptive purpose
elsewhere (an injury-hit season is real data, not noise, when the
question is literally "what happened last season") — but wrong when
that same rate gets repurposed as a forward-looking Exp Pts estimate.
Fixed in `computeExpPointsBreakdown` (`metrics/expectedPoints.ts`):
both Last Completed Season and Historic Average now require the
season(s) behind the rate to clear `MIN_QUALIFYING_SEASON_MINUTES`
(900 min, the same bar already used to decide which seasons qualify
for a historic average) before trusting it — below that, the figure is
null rather than a misleadingly precise-looking number.

**Player Comparison's "Players (x/5)" chips had no click-through** —
only the × remove button did anything. The name/badge portion now
opens the profile, with × kept separate via `stopPropagation`.

**Team Building, several changes**:

- Price is off by default in Historic/Raw columns (still selectable) —
  it conflicts with the section's purpose, since squad budget always
  uses live price regardless of this toggle.
- **Subtle colour grading** across the picker table: a new shared
  `utils/colorScale.ts` (extracted from Player Comparison's colour
  logic, which was refactored to use it too rather than keeping a
  second implementation) adds `relativeCellTint` — a low-alpha
  background tint, capped around 16% opacity, computed per-column
  against only the rows currently shown. Deliberately subtle by
  request ("shouldn't overwhelm the current structure").
- **Add button moved into the Player cell** (after position/club/live
  price) instead of its own pinned column — the sticky-column CSS went
  from three stacked columns to two, and Player widened slightly
  (170px → 210px) to comfortably fit the inline button.
- **Clear button** next to the Captain/Vice-Captain tiles empties the
  active squad (players, starting XI, captain, vice-captain) in one
  click — the squad's own name/id are untouched, only its contents.
  No confirmation step, by request ("one click").
- **Sortable columns**: every header (pinned or in either column
  group) can now be clicked to sort, shift-click for a secondary
  tiebreaker — reusing a new shared `state/useSortSpec.ts` hook rather
  than a second sort implementation. **Found and fixed a real bug
  while extracting it**: clicking "Player" in Player Explorer did
  nothing, since `name` isn't a `PLAYER_COLUMNS` entry and
  `columnByKey("name")` returned `undefined`, silently skipping the
  sort. Both tables now special-case the name column before falling
  back to `columnByKey`.
- **Next 5 Fixtures shows an average difficulty number** next to the
  chips, and that average is what the column actually sorts by.
- **Fit to Box now runs automatically** the first time each table
  (Player Explorer and Team Building's picker) has real content to
  measure — a `useRef` flag ensures it only fires once. Team Building's
  version can't depend on row content in its effect (`pickerRows` isn't
  computed until after the early `if (!active) return`), so it instead
  retries against the DOM ref directly on every render until it
  succeeds, then the flag makes every later render a no-op.
- Pitch markings (centre circle, centre spot, penalty boxes, goal
  mouths, halfway line) are thicker and slightly more opaque, so
  they read clearly as pitch markings rather than being easy to miss.

## Player Profile: percentile radar chart

`metrics/radarStats.ts` + `components/PlayerRadarChart.tsx` (recharts'
own `RadarChart` — already a dependency, no new one added).

- **The stat set is position-specific**, not one generic set for
  everyone — a goalkeeper's axes (Clean Sheets, Defence Tightness,
  Bonus, BPS, ICT Index, Points) share almost nothing with a forward's
  (Goals, xG/Game, Assists, xA/Game, ICT Index, Points). Every axis is a
  metric that already exists on `NormalizedPlayer`, so nothing new had
  to be computed to support this.
- **Defenders and midfielders get two radars, not one** — "Percentile
  Radar — Defense" (Clean Sheets, Defence Tightness, Def. Contribution/Game,
  BPS, Bonus) and "Percentile Radar — Offense" (Goals, Assists, xG/Game,
  xA/Game, xGI/Game, plus ICT Index for midfielders only), on the player
  profile only (Player Comparison, below, still uses one combined radar
  per position). Goalkeepers and forwards keep a single combined radar,
  since their points genuinely come from overwhelmingly one facet already.
  See `getRadarAxisGroupsForPosition` (`metrics/radarStats.ts`).
- **Every axis is a within-position percentile**, reusing
  `computePositionPercentiles` — the same function and the same
  `<percentile_population>` convention (computed against the full,
  unfiltered, mode-resolved population, never something already cut
  down by team/ownership/price).
- **Axes where a lower raw value is better get flipped**
  (`higherIsBetter: false` — currently just xGC/Game, "Defence
  Tightness"), so every axis on the chart consistently points "outward
  = good" regardless of which direction the underlying stat runs.
- **Works across all three analysis modes already on the page** — the
  radar reads from the same `resolvedPlayer/resolvedPlayers` the
  profile's other cards already compute, so switching
  Last Completed Season / Historic Average / Current Season just works
  without the chart needing any mode-awareness of its own.
- A player below the minutes eligibility threshold gets a
  "(below eligibility threshold)" label on the card title, rather than a
  chart quietly built from an unreliable sample. (A standalone
  "Position Percentile — xGI/Game" bar used to sit under the first radar
  card too — removed as redundant clutter now that multiple radar
  charts already cover this ground; see `PercentileBar`'s removal.)
- The Views zone's cards are ordered radar chart(s) first, then Actual
  vs Expected / Underlying Numbers / Value — set by JSX source order,
  which is what the CSS multi-column balance layout (see the "This
  View card-height imbalance" fix above) flows through.

## Player name colour matches their availability marker

Across every place a player's name renders next to an `AvailabilityFlag`
dot (Player Explorer, Team Building's pitch tiles and picker, Team
Detail, Player Comparison, TopList), the name text now takes the same
colour as the marker for doubtful/injured/unavailable players. Built as
`availabilityTextClass(status)` in `primitives.tsx`, returning a class
that uses the *exact same* CSS variable as the marker dot
(`--accent-value` for doubtful, `--accent-negative` for
injured/suspended/unavailable) — so the two are guaranteed to match by
construction, not by picking two similar-looking colours by hand in two
different places.

## Team Building: no more 40-player cap, and a disclaimer pass

The Add Players picker now shows every player matching the current
filters rather than a fixed top-40 slice — removing the cap was a
direct request, worth being upfront about the tradeoff: with a wide set
of columns visible and no filters narrowing things down, this can mean
rendering several hundred rows × ~25 columns, which is more DOM for the
browser to reconcile on every filter/sort/re-render than the old capped
version. No virtualisation library is installed in this project, so
there's no windowing yet — if this turns out to be genuinely sluggish
in practice, pagination or virtualisation would be the next step, but
that's a real addition, not a quick follow-up. The picker's own caption
was rewritten to match — it no longer claims a 40-candidate limit or a
single fixed sort, since every header is clickable now.

**A full pass through every disclaimer/caption in the app**, checking
each against current behaviour rather than assuming past wording still
holds. Found: the pitch's own usage hint never mentioned the Clear
button added the previous round — fixed. Everything else checked out
accurate, including one that looked suspicious at first read — Player
Explorer's "Defensive Contributions is not present on this build of the
live API" banner is gated on a genuine runtime check
(`advancedFieldAvailability`) against the actual API response, not
stale hardcoded text, so it correctly stays silent now that DC is
confirmed present.

## Player Comparison: radar charts alongside the numbers

A new "Percentile Radar Comparison" card sits below the numeric
comparison table, one radar chart per compared player (up to 5), reusing
the exact same `computeRadarData`/`PlayerRadarChart` the profile page
already uses — not a second implementation. Percentiles are computed
against the whole resolved player population
(`resolvePlayerStatsList`), not just the players being compared, same
`<percentile_population>` convention as everywhere else percentiles
appear. Since the stat set is position-specific, comparing players
across different positions shows genuinely different axes per chart —
consistent with the existing banner that already warns about
cross-position comparisons in the numeric table above. A player below
the minutes eligibility threshold gets the same "(below eligibility
threshold)" treatment as their own profile page, rather than a chart
built from an unreliable sample.

## Team Building's Historic/Raw filter now includes minutes

A "Min minutes" filter joins Team/Price/Archetype in the Add Players
picker (`pickerMinMinutes`), filtering on `row.historicRaw.minutes` —
whichever Historic/Raw mode is currently selected, so it's Last
Completed Season minutes, Historic Average minutes, or Current Season
minutes depending on the toggle above it. A player with no data at all
for the selected mode is excluded once a minimum is set, same as
genuinely not meeting the bar.

## Comparative Colouring: same subtle tint, now toggleable, now in Player Explorer too

Both Team Building's picker and Player Explorer now share a
"Comparative Colouring" checkbox (default on) that shows/hides the
`relativeCellTint` background tint per column. Player Explorer's
version is new — it reuses the exact same `utils/colorScale.ts`
function Team Building already had, computed the same way (per-column
min/max across whatever's currently shown, post-filter and post-sort,
not an absolute scale).

## Fixed: player price was still changing by mode in several identity clusters

Found via direct report — the "name, position, price" cluster (the
`.player-name-cell`/`.meta` pattern) in Player Explorer's sticky column
and Team Detail's sticky column was pulling price from the *resolved*
player, so it changed across Last Completed Season / Historic Average /
Current Season, even though Team Building's picker and the profile
header both already kept this specific cluster on live price. Fixed by
adding a `livePlayersById` lookup at both call sites and pulling price
from that specifically — the toggleable Price *column* (`PLAYER_COLUMNS`)
is unaffected and correctly still resolves per mode; this was
specifically about the identity line, not that explicit column. Checked
every other `fmtPrice(...)` call site in the app (SquadPitch, the
profile header, Career History's season-by-season price table, Team
Building's picker) to confirm nothing else had the same bug — Career
History's price-by-season table is deliberately historic (it's showing
what price was at the time for each season), not a case of this bug.

## Comparative Colouring: repositioned, and now on Teams too

Moved to the far right of each toolbar per request — after "Columns" on
Player Explorer, after "Historic/Raw Columns" on Team Building. Teams
now has the same checkbox and tinting too (`Teams.tsx`), reusing the
same `relativeCellTint` utility a third time rather than a third
implementation — positioned above the table since Teams has no existing
toolbar row to sit within, right-aligned to match the "far right"
convention the other two pages use.

## Team Building: Excel-style per-column filtering

A filter icon (▾) sits on every predictive and historic/raw column
header, next to the resize handle — clicking it opens a small popover
with three fields (Less than or equal to / Greater than or equal to /
Equal to) and Enter/Cancel buttons, matching the brief's spec directly.
Scoped to the predictive and historic/raw groups only, not the pinned
Player/Own% columns, per the request.

- **Reuses the existing sort-value resolver.** `getPickerSortValue`
  already knows how to pull a numeric value for any column key —
  pinned, predictive, or historic/raw — since sorting needed exactly
  that. The filter predicate (`passesColumnFilters`) calls the same
  function rather than a second column-to-value mapping.
- **Draft state, not live-applied.** Typing into the three fields
  doesn't filter anything until "Enter" is clicked — a separate
  `filterDraft` holds in-progress edits, only committed to
  `columnFilters` on confirm. "Cancel" discards the draft and closes the
  popover, leaving whatever was previously applied untouched.
- **`MIN_COLUMN_WIDTH` raised from 56 to 64** (in the shared
  `useColumnCustomization` hook, so this applies to Player Explorer too)
  to comfortably fit the label, sort arrow, filter icon, and resize
  handle together — this is also what satisfies "Fit to Box should
  ensure filter icons are visible on load": Fit to Box already floors
  every column at `MIN_COLUMN_WIDTH`, so raising that floor was the
  actual fix, not a separate mechanism.
- **Known limitation, not silently swept under**: the popover is
  positioned via the same `.popover` CSS every other popover in this
  app uses (`position: absolute` relative to its trigger), but this is
  the first popover triggered from *inside* a scrolling table
  (`.table-wrap` has `overflow: auto` on both axes). If a header is
  scrolled to sit right at the table's visible edge when its filter
  icon is clicked, the popover can get visually clipped. A fully robust
  fix means rendering it through a portal with its own scroll/resize-
  aware positioning — a real addition, not a quick patch — so this was
  left as a known edge case rather than built speculatively. In
  practice this only bites with an awkward scroll position, since the
  header has to be at least partly visible to click its icon at all.

## Column filtering extracted and reused, Player Explorer gets it too

The Excel-style column filter (▾ icon, Less/Greater/Equal-to popover)
built for Team Building last round is now `state/useColumnFilters.ts` +
`components/ColumnFilterControl.tsx` — a shared hook and a real
component, not a per-page copy. Team Building was refactored onto it
(no behaviour change, same interaction, just one implementation instead
of a soon-to-diverge second one), and Player Explorer now has the exact
same filtering, sharing a `getRowValue` resolver with its own sort logic
so the two can never disagree about what a column means. The filter
icon also grows slightly on hover now (`transform: scale(1.4)`) — one
CSS rule, applies everywhere the icon appears since both pages use the
same class.

## Teams: sortable, plus a shortcut into Player Explorer

Teams' table is now sortable like every other table in the app (reused
`useSortSpec`, not a new implementation). Each row also has a "Player
Rankings" button, contained within the Team cell — clicking it navigates
to Player Explorer with `?team=<id>` in the URL, landing already filtered
to that club's players (Player Explorer reads that param once on mount
to seed its own local filters — see "Per-page filter/analysis-mode
state" below; not a shared-state write, since each page's filters are
independent). It's a discoverability shortcut into functionality that
already existed (Player Explorer's own column sorting), not a second
ranking system.

## Metric Definitions → User Guide

Replaced, not just renamed — `pages/UserGuide.tsx` is a full walkthrough
of every section (what it does, how to use it, a concrete "try it"
example per major section), the three analysis modes explained once in
one place, Team Building's predictive model stated plainly as the one
deliberate exception to "descriptive, not predictive," the full
archetype list, and a consolidated data-limitations section pulling
together caveats that were previously scattered across individual pages
(no historic team-level data and why, the xG/2022-23 and DC/2024-25
data-quality boundaries, no predicted-lineup data anywhere in the API).
The old Metric Definitions content — Live API Field Availability, the
Per-90/xGI validation report, both metric tables — is folded in
wholesale as a "Metric reference" section at the bottom, using the same
live checks as before, not discarded. Route moved from `/definitions`
to `/guide`; checked for and fixed every reference to the old page,
including one in a code comment.

## Fixed: Minutes Reliability was inflated for fringe players with one good season

Found via concrete examples (a backup goalkeeper and a squad midfielder
both showing 75-90%+ reliability). Root cause: the historic component
only averaged `qualifyingSeasons` — seasons individually clearing a
900-minute bar, correct for a *performance* metric like points-per-90,
where a tiny sample is noise worth excluding. Applied to *reliability*,
that was backwards: a player with one strong season and several weak
ones had the weak seasons silently excluded before the average was even
computed, since only the strong one cleared the bar. `HistoricPlayerProfile`
now also carries `allSeasonsInWindow` — every season in the window,
regardless of minutes — and `minutesReliabilityBlend.ts` uses that
instead. Confirmed structurally independent of the Historic/Raw toggle,
as it always was — this is one predictive figure, not something that
should read differently depending on which historic view happens to be
selected elsewhere on the page.

Two further refinements built in at the same time, both requested
directly: **recency weighting** (a season's position in the window sets
its weight — oldest counts least, most recent counts most, so a
breakout run three years ago no longer says more than an honest
last season) and a **consistency discount** (population stdev of the
per-season minutes shares, normalised and applied as a discount on the
weighted mean, floored so a volatile record still counts for something).
**Current ownership** is also folded in now, at a deliberately modest
15% weight — a weak, secondary "does the market believe this player
starts" signal, useful mainly where minutes-based evidence is thin (a
new signing with no track record at their new club), never a
replacement for the real playing-time data.

## Clear Filters

Both Player Explorer and Team Building's picker now have a one-click
"Clear Filters" button, clearing everything at once — the filter bar
inputs (search, position, team, price, minutes, archetypes) *and* any
Excel-style per-column filters, which the pre-existing "Reset filters"
button in the shared FiltersBar never touched (it only knew about the
global filter state, not a page's own column-filter state). Added
`resetAllFilters` to the shared `useColumnFilters` hook rather than
reaching into its internals from each page.

## Fixed: Player Explorer's table went stale on filter changes

Confirmed and fixed a real bug: `sortedRows` read from `filteredRows` in
its body but declared `[rows, sort]` as its dependency array — so
applying or clearing a filter updated `filteredRows` correctly, but
React never re-ran the memo, since none of *its own* dependencies had
changed. The table only refreshed once something else (a sort click, a
data reload) happened to trigger it — exactly "waiting for an update
from a different source." Fixed by depending on `filteredRows` instead
of `rows`, which is what the function actually reads.

I checked Team Building's picker carefully for the same bug and
couldn't find it — `pickerRows` there is a plain `const`, recomputed in
full on every render with no memoization at all, which is structurally
immune to this specific bug class (it only happens with `useMemo` and
an incomplete dependency list). I didn't want to claim a fix for
something I couldn't verify was actually broken, so if this is still
happening on Team Building after this round, it's a different cause and
would need a specific reproduction to track down.

## Fixed: column filters didn't work correctly for percentage/composite columns

Confirmed the reported cause directly, then swept every column in the
app (`playerColumns.tsx` and Team Building's `PREDICTIVE_COLUMNS`) for
the same class of bug — a mismatch between what a column's `getValue`
returns (used for sort *and* filter) and what it visibly displays.
Found exactly one: Minutes Reliability stored `getValue` as a 0-1
fraction while displaying it as a 0-100 percentage, so typing "50" into
a filter (thinking "50%") was silently compared against 0-1-scale
numbers and could never match sensibly. Fixed by making `getValue`
return the same 0-100 scale as the display. Every other column —
including Next 5 Fixtures, the other suspect — was already consistent
between its stored and displayed scale; no second bug found there.

## Team Building: Optimal Draft

`metrics/optimalDraft.ts` — a new button next to Clear that replaces
the whole squad with a freshly drafted one, built to maximise
Exp. Pts (Overall Average) for whichever GW window is currently
selected (so the draft matches what the rest of the page is already
showing, not a separately-hardcoded window).

**Stated plainly: this is a greedy-fill-then-repair heuristic, not a
provably optimal solver** — no constrained-optimisation library is
available in this project, and this was disclosed as a limitation the
first time the optimiser was discussed. It reliably finds a strong
squad; it doesn't guarantee the mathematically best one, and never
claims to.

- **Eligibility**: a player needs blended Minutes Reliability \u2265 40%
  and a non-null Exp. Pts (Overall Average) to be considered at all —
  excludes both bench-risk players and anyone with too little data to
  optimise against, from the whole draft, not just the starting XI.
- **Selection order**: fills the starting XI's required position
  minimums first (1 GKP / 3 DEF / 2 MID / 1 FWD) by highest Exp Pts,
  always reserving enough budget for whatever's still required so an
  early pick can't strand a later one; then fills the 4 flexible
  outfield slots the same way, respecting each position's cap. The
  bench's composition is then fully determined (whatever completes
  2 GKP / 5 DEF / 5 MID / 3 FWD) and filled against the remaining
  budget the same greedy-with-reserve way.
- **The 75%/25% budget split** ("at most 75% of squad value in the
  starting 11, more to the bench is fine") is mathematically the same
  constraint as `benchValue \u2265 startingXIValue / 3` — that's the form
  actually checked. A bounded corrective pass (capped at 30 iterations)
  upgrades the cheapest bench player first when the split isn't met,
  since bench players don't affect the objective at all; only falls
  back to downgrading the lowest-Exp-Pts starter if no bench upgrade is
  affordable. If genuinely stuck, this is reported honestly via
  `budgetSplitSatisfied: false` and a warning banner, rather than
  silently accepted.
- **Captain/vice-captain** are the two highest Exp. Pts starters in the
  final XI, captain first — the direct way to maximise the
  captain-doubling bonus.

## Fixed: Optimal Draft failing outright, and the budget split reconsidered

Two separate issues, both real.

**The actual bug**: the required-minimum phase of the draft (filling
the 1 GKP / 3 DEF / 2 MID / 1 FWD every starting XI needs) only reserved
budget for the *other* required minimums — it never reserved anything
for the 4 flexible slots that get filled afterward. That let it spend
right up to the cap on its first 7 picks and leave nothing for the
remaining 4, which is exactly what "couldn't find enough affordable
players" was reporting. Fixed by reserving for the flexible slots
throughout that phase too, using the cheapest available outfield price
as a conservative per-slot estimate — the same reserve-based approach
already used everywhere else in the algorithm.

**The budget split**: raised from 75% to 80% for the starting XI, per
the direct request and the reasoning behind it — a real, well-built
bench of 4 squad players typically costs somewhere around £16-20m
(a backup keeper plus a few sub-£4.5m picks), which is roughly 16-20% of
the total budget, not the 25% a 75/25 split demanded. 80/20 leaves the
bench a genuine £20m at the cap — room for decent backups, not just
bare-minimum fodder — while matching how a strong real squad's value
actually skews. The 3× ratio the corrective pass checks against is now
derived from the share (`MAX_XI_TO_BENCH_RATIO = share / (1 - share)`)
rather than hardcoded, so the two can't drift out of sync if this ever
changes again — and every hardcoded "75%" in an error message or
comment was swept and fixed at the same time, not just the one that
surfaced first.

## Comparative Colouring: always furthest right

Moved to sit after Clear Filters on both Player Explorer and Team
Building, per direct request — and noted as a standing rule for
anything added to that toolbar row in future: Comparative Colouring
stays the rightmost control.

## User Guide: coloured, numbered section headings

Each of the guide's 12 sections now gets a numbered badge and a
coloured heading, cycling through the app's four existing accent
tokens (no new colours introduced) — `limitations` deliberately gets
the negative/warning colour, since that's genuinely what the section
is. The "On this page" nav chips are coloured to match their section,
and both read from one shared `SECTION_META` list rather than two
separate ones, so the nav and the headings can't drift out of sync with
each other. The four plain sub-headings inside Metric Reference got the
same lighter treatment (a coloured left-accent bar) rather than staying
the one visibly duller corner of an otherwise-refreshed page.

## Optimal Draft: real backtracking, not just a bigger budget cap

The 80% budget change from last round wasn't enough — the error kept
recurring because the *actual* bug was in the search itself, not the
percentage. `metrics/optimalDraft.ts`'s fill logic was a single greedy
pass with a budget "reserve" check: it took the best-Exp-Pts affordable
player for each slot and never reconsidered that choice. Greedily
filling early slots can exhaust a club's 3-player quota among the
handful of clubs that dominate the top of the Exp Pts rankings, in a
way that leaves a *later* slot with zero legal candidates — and a
one-shot search has no way to recover from that once it's happened,
regardless of how generous the budget cap is.

Replaced with genuine depth-first backtracking (`backtrackFill`): try
the best candidate for a slot, recurse to the next one, and if that
path can't ultimately complete, undo the pick and try the next-best
candidate for *this* slot instead — exploring alternatives instead of
failing outright the first time a choice turns out to be a dead end.
Candidates are still tried best-first (highest Exp Pts before lower),
so in practice most searches succeed within the first few attempts per
slot and rarely backtrack far; a bounded node budget (120,000 steps per
search) caps worst-case runtime rather than risking a hang on a
pathological candidate pool. This is still a heuristic — genuinely
better at finding *a* legal, strong squad than the single-pass greedy
version was, not a guarantee of the mathematically best one.

## Fixed: Teams' "Player Rankings" button pointed at a route that doesn't exist

The button called `navigate("/player-explorer")` — but the page is
actually registered at `/players` (`App.tsx`). Simple, direct bug: the
button always failed silently rather than doing anything, which is
exactly "dead link." The row's own click-through to Team Detail, and
the button's `stopPropagation()` keeping it independent of that, were
both already correct — only the destination string was wrong.

## Player Explorer & Team Building: centred table values

Added `table.data-table.center-values td { text-align: center; }` and
applied the `center-values` class to just these two tables — the base
`table.data-table td` rule (right-aligned) is untouched, so Teams, Team
Detail, and Player Comparison are unaffected, matching the request's
scope exactly. The identity column (player name, and every sticky/
pinned column) keeps its existing left-alignment: the general "centre
everything" rule and the specific "except the first column" /
"except sticky columns" exceptions were both a genuine specificity tie
against the pre-existing rules they needed to override, so each
exception was written one level more specific again to make sure it
reliably wins rather than depending on source-order luck.

## Table alignment: centred everywhere, headers included

Changed the two shared base rules directly (`table.data-table th` and
`table.data-table td` in `components.css`) from right-aligned to
centred, rather than the scoped `.center-values` opt-in added last
round — now that the request is "everywhere it makes sense," making it
the actual default is simpler than an opt-in class every table has to
remember to add. The identity column (player name) and every sticky/
pinned column keep their existing left-alignment automatically — those
exceptions were already more specific than the base rule, so they
continue to win without needing any changes. Also caught and left alone
on purpose: `.percentile-label` uses the same right-aligned CSS but
isn't a table cell at all (it's the small text next to a percentile
bar) — centering that would affect an unrelated part of the UI for no
reason, so it was left as-is.

## Optimal Draft: found and fixed a real efficiency bug, not just a bigger budget

The backtracking added last round was correct in principle but too
slow in practice to be reliable: trying the highest-Exp-Pts (and often
highest-priced) candidate first at every one of 11 slots meant the
search could spend enormous effort exploring expensive-first
combinations that were always going to blow the budget, long before
ever reaching one that fit. Fixed with branch-and-bound pruning
(`minCostForRemainingSlots`) — before committing to a candidate, the
search now checks whether even the *cheapest possible* way to fill
everything else still fits the budget, and skips straight past
candidates that can't, without wasting search effort recursing into a
branch that was always doomed. The node budget was also raised
substantially (120,000 → 2,000,000), since pruning makes exploring that
many steps actually cheap in practice rather than a real risk of
hanging.

**Also caught and fixed a copy-paste error introduced while writing
that pruning logic**: the starting XI's required-minimum slots
temporarily dropped from 3 DEF to 1 DEF (10 total slots instead of 11)
partway through the edit — confirmed and corrected before shipping,
not left to surface as a second bug report.

**The failure messages are now diagnostic instead of speculative.**
Previously: a single guess ("the reliability filter or fixture set may
be leaving too thin a pool"). Now: the actual candidate pool size per
position after filtering, whether a budget-feasible combination exists
in principle at all (computed directly, not guessed at), and if one
does, whether the search ran out of its step budget or hit a genuine
club-limit wall — so a real cause is visible immediately rather than
requiring another round of "not sure what's causing this."

## Career History: "Failed to fetch" investigated, and made more resilient

Investigated directly rather than guessed at. `"Failed to fetch"` is
the browser's own generic message for a *network-level* failure — the
request never reached a server at all — as distinct from
`ApiRequestError` (a real HTTP error response like a 404 or 500, which
carries its own, different message). That distinction points at the
cause: something transient at the transport level — a momentary local
dev-server restart, a Wi-Fi drop, a backgrounded browser tab losing its
connection — not a bug in the app's own request logic, which was
already structured correctly (proper async handling, a stale-request
guard so a slow response for a since-abandoned player selection can't
overwrite the current one).

No app can eliminate every possible one-off network hiccup — that's not
a realistic bar for anything networked — but the app can be resilient
to it. `usePlayerHistory` now retries automatically (up to twice, with
a short delay) specifically for this class of network-level failure —
not for real HTTP errors, where blindly retrying usually just wastes
time — so a momentary blip self-heals before it's ever shown to the
user. If it still fails after retrying, the error state now includes a
manual Retry button too.

## Optimal Draft: keeps existing selections, respects current filters

Two uplifts, both requiring the algorithm to treat some candidates
differently from others rather than just changing inputs.

**Players already in the squad are preserved.** `buildOptimalDraft`
now takes a `lockedPlayerIds` set — locked players bypass the
reliability/data-availability filters everyone else needs to clear
(since the user already chose them), and are sorted ahead of every
non-locked candidate at any slot they're eligible for, so backtracking
always tries to place them before reaching for an alternative. The
corrective pass was also updated to never choose a locked player as the
one swapped out when repairing the budget split. A locked player who
doesn't fit the starting XI remains available and still prioritised for
the bench search that follows — either way they end up somewhere in the
final 15, not dropped, unless keeping them is genuinely infeasible
(reported honestly, same as any other infeasibility).

**The draft now works from the currently-filtered table, not the whole
player base.** The candidate pool passed to the algorithm is
`pickerRows` (whatever the Add Players table is actually showing after
the user's own search/position/team/price/archetype/minutes/column
filters) combined with the locked players — filtering the table down
first genuinely scopes what the draft can choose from, which was named
directly as a desired, supported use case rather than something to
guard against.

## Team Building: min/max ownership filter

Added to the Add Players picker, matching Player Explorer's existing
control exactly (same 0-100 range, same "Any" placeholder for unset).
Included in Clear Filters' reset too.

## Fixed: Optimal Draft could bench a player with higher Exp Pts than a starter

Root cause found and confirmed, not guessed at. The corrective pass
added to satisfy the old 75/25 (then 80/20) budget split picked its
swap-in candidates **purely by price** — "cheapest player that's more
expensive than the current bench player" for an upgrade, "priciest
player that's still cheaper than the current starter" for a downgrade —
with no regard for Exp Pts at all. That could easily bench a
genuinely-better player in favour of a pricier-but-worse one, or drop a
starter for someone cheaper *and* worse, purely to satisfy the budget
ratio. This was a real design flaw in that pass, not a tuning issue —
raising or lowering the split percentage would never have fixed it.

Removing the budget-split constraint entirely (the third request this
round, reasoned through directly: "the 11 players who score points
should hold the majority of the budget" is a sound instinct, but
enforcing it as a hard ratio was fighting the actual objective) made
the proper fix possible. Rebuilt as:

1. **One unified 15-slot squad search** (2 GKP / 5 DEF / 5 MID / 3 FWD,
   single £100m cap) — no separate starting-XI sub-budget, no
   corrective pass, because there's no longer a ratio to correct
   *toward*.
2. **Exact starting XI selection from that fixed squad**
   (`selectBestStartingXI`) — with the squad already bought, there's no
   budget trade-off left to weigh, so the Exp-Pts-maximising XI for any
   given formation is simply the top-N players by Exp Pts within each
   position. The best formation is found by exhaustively trying every
   legal (DEF, MID, FWD) split — a handful of combinations, genuinely
   optimal for this specific sub-problem, not a heuristic. This
   guarantees, by construction, that no bench player can outscore a
   formation-compatible starter — the bug can't recur because there's
   no longer a price-driven step capable of causing it.

Captain/vice-captain assignment (two highest-Exp-Pts starters) is
unchanged. Locked-player handling (sort-first priority, bypasses
eligibility filters, never the one dropped) carries over to the new
unified search unchanged in spirit — it's just one search now instead
of two.

## Fixed: Optimal Draft could still drop a locked-in player

Reported directly with a concrete example (Haaland and João Pedro
placed on the pitch, then removed by the draft) — and reproducible from
the algorithm's own design, not just the report. Locked players were
only *sorted first* within the search, which turns out not to be the
same as guaranteed: backtracking's whole mechanism is "undo a tentative
pick and try an alternative if something downstream fails," and it
doesn't distinguish a merely-preferred candidate from a required one.
Two expensive locked players (both forwards, both likely genuinely
pricey) could easily leave too little room for the rest of a legal
squad — and when that happened, backtracking would undo them just like
any other tentative pick, in search of a full squad that fit the
budget, exactly as observed.

Fixed properly rather than patched: locked players are now
**pre-committed outside the search entirely**, before it ever runs —
added directly to the running budget/club-count/position-count state,
with the search only ever running over the positions genuinely still
needed once their contribution is accounted for. They are never part of
the search's own decision space, so there is nothing left for
backtracking to undo. `buildOptimalDraft`'s doc comment spells out the
distinction (sort-first vs. pre-commit) directly, since it's the kind
of thing worth being explicit about for future reference given it was
the actual root cause here.

## Full codebase audit, and fixes from it

Requested directly — a systematic bug and efficiency pass across
everything built so far, not a recollection from memory. Read every
`useMemo` (50, across 11 files) and every `useEffect` (7, across 5
files) by hand against what its body actually reads, checked for
orphaned files, checked for dead code with `noUnusedLocals`/
`noUnusedParameters` enabled as a one-off (off by default in this
project's `tsconfig.json`, so a clean normal type-check doesn't rule
this out on its own), and re-verified the table-alignment CSS
specificity work was still intact after later edits. Full findings, and
what was fixed:

- **Fixed — Team Building's picker recomputed on every render,
  including every frame of a column resize drag.** `pickerRows` was
  deliberately left unmemoized early on specifically to avoid the
  stale-dependency bug class — but that meant every state update
  anywhere in the component re-ran the full per-candidate Exp Pts and
  reliability computation, including the state update fired on *every
  `pointermove` event* while dragging a resize handle. Now properly
  memoized with a complete, explicit dependency list (deliberately
  long, because the computation genuinely reads that much). This
  required also memoizing `fixturesByTeamId`, which was itself
  rebuilt as a new `Map` every render — an unmemoized dependency would
  have silently defeated `pickerRows`' own memoisation, since a "new
  Map every render" always looks changed even when nothing in it is.
- **Fixed — Optimal Draft could silently run on incomplete historic
  data.** It still runs while historic data is loading (blocking it
  outright felt too restrictive — live `ep_next` data alone is enough
  for a reasonable result), but now warns afterward if that's what
  happened, so the result isn't presented as more informed than it was.
- **Fixed — one genuinely unused import** (`fmtPrice` in
  `Dashboard.tsx`), left over from an earlier version of that page.
- **Checked and confirmed clean**: no other instance of the stale-
  useMemo-dependency bug class anywhere in the app (the one already
  found and fixed in Player Explorer was genuinely isolated), no
  orphaned files, no debug artifacts (`console.log`, unresolved
  `TODO`/`FIXME`), Clear Filters on both pages genuinely resets
  everything including the ownership fields added the round before.

**Honest limit of this audit**: it's static code review, type-checking,
and logical tracing — there's no way to run the app in an actual
browser here, so genuinely runtime-only issues (visual glitches,
browser-specific quirks) wouldn't necessarily surface this way.

## Fixed: Player Profile radar chart wrongly flagged well-sampled players as "limited data"

Reported directly (radar charts showing limited-data treatment for
players with plenty of historic data) and confirmed as the same class
of mistake already caught elsewhere in this app: mixing live data with
resolved data. `smallSample` — which gates the radar chart, Position
Percentile bar, and the Actual-vs-Expected card — checked
`player.minutes` (the LIVE player's current-season minutes) even when
viewing Last Completed Season or Historic Average. Since the live
season has barely started, nearly every player's live minutes are near
zero right now regardless of how much historic data they have — so
almost everyone got flagged as a small sample the moment a historic
mode was selected, independent of whether their data for THAT mode was
actually robust. Fixed to check the RESOLVED player's minutes — the
figure that actually corresponds to whichever mode is selected — instead.
Confirmed the Position Percentile bar's own underlying computation
(`computePositionPercentiles`) was already correct, since it works
directly from the resolved population passed into it; the bug was
isolated to this one local variable.

## New sections: Price Watch and Chip Planner

Two new nav entries, both requested directly, both built around real FPL
data rather than an invented model.

### Price Watch

FPL shipped an official **Price Change Predictor** for 2026/27
(announced 21 July 2026) — confirmed live by fetching a real
`bootstrap-static` response directly rather than assumed from the
announcement alone. Every player element now genuinely carries
`price_change_percent` (live progress toward today's threshold),
`price_change_projections` (an array of `{offset, projected_percent,
likelihood}` for today/tomorrow/the day after), `price_change_locked_until`,
and `price_change_calibrating`, plus a new top-level `total_players`
count. This page surfaces those fields directly — it does not
recompute or second-guess FPL's own number. FPL's own published
caveat ("a reading over 100% means expected to cross the threshold at
the next 00:00 UK update — not a guarantee") is repeated on the page
rather than softened.

Alongside FPL's own figures, the page adds one supporting figure of
its own: **Net Transfer Ratio** — net transfers this gameweek ÷ an
estimated current owner count (`ownership% × total_players`). This
exists because raw transfer counts alone are misleading across very
differently-owned players; it's explicitly labelled as this app's own
supporting context, never as a competing prediction.

Because this is a brand-new field with no track record, it's routed
through the same `AdvancedFieldAvailability` detect-at-runtime pattern
as the expected-stats fields — if a session's API response doesn't
carry it, the page falls back to raw transfer/price-movement data with
a visible banner, rather than crashing or fabricating a reading.

**What changed**: `client/src/types/raw.ts` (new price-change and
transfer fields on `RawElement`, `total_players` on
`RawBootstrapStatic`), `client/src/validation/schema.ts` (matching
optional/nullable zod fields), `client/src/normalize/fieldAvailability.ts`
(candidate-field detection extended), `client/src/normalize/normalizePlayers.ts`
(populates the new `NormalizedPlayer` fields and returns `totalPlayers`),
`client/src/types/normalized.ts` (new fields + `PriceChangeInfo`/
`PriceChangeProjection`), `client/src/metrics/priceChange.ts` (new —
signal classification, owner-count estimate, net-transfer ratio),
`client/src/metrics/dictionary.ts` (new metric entries), new page
`client/src/pages/PriceWatch.tsx`, nav entry in `AppShell.tsx`, route
in `App.tsx`.

### Chip Planner

Takes a saved squad from Team Building and plots every remaining
fixture through to the end of the season, then suggests a window for
Wildcard, Free Hit, Bench Boost, and Triple Captain in each half of
the season. The half boundary and each chip's exact opening/closing
gameweek are **not** a hard-coded assumption — they're read directly
from bootstrap-static's top-level `chips` array, confirmed live: two
windows per chip type, split at Gameweek 19/20 for 2026/27, with
Wildcard and Free Hit's first window starting at Gameweek 2 (not 1,
since the initial squad is already locked in before the season
starts) while Bench Boost and Triple Captain's first window opens at
Gameweek 1 — a real asymmetry in FPL's own schedule that a
hard-coded GW19/20 constant would have missed entirely.

Bench Boost and Triple Captain recommendations reuse Team Building's
existing fixture-difficulty-scaling method (`fixtureMultiplier` in
`metrics/expectedPoints.ts`, now exported for reuse) — today's Exp.
Pts baseline (`ep_next`, falling back to points-per-game) scaled by
each fixture's own FDR, summed across doubles — extended across every
remaining gameweek rather than just the next 1/3/5. This is a
materially bigger extrapolation than Team Building ever makes, and the
page says so directly: it uses today's rate flat across a gameweek
that might be months away, with no way to account for price changes,
injuries, transfers, or changing form between now and then. Free Hit
looks for the squad's biggest blank (most players with zero fixtures
at once) rather than a points projection, since a blank gameweek is a
concrete, undeniable signal that doesn't need a model. Wildcard is
deliberately the weakest of the four: its value comes from players not
yet owned, so it can only flag when the *current* squad's own fixture
run turns hard, not recommend a rebuild target — the page states this
limitation plainly rather than pretending to a precision it can't have.

**What changed**: `client/src/normalize/normalizeChips.ts` (new —
maps the raw `chips` array into per-chip, per-half windows),
`client/src/normalize/gameweek.ts` (extracted `normalizeEvents` so the
full events list, not just the current one, can be exposed),
`client/src/state/AppStateContext.tsx` (exposes `events`, `chips`, and
`totalPlayers`), `client/src/metrics/chipPlanner.ts` (new — fixture
profiling and all four recommendation functions), new page
`client/src/pages/ChipPlanner.tsx`, nav entry in `AppShell.tsx`, route
in `App.tsx`.

### Testing note

Both features were built and reviewed the same way as the rest of this
app's development: type-level review of every changed file, with no
way to run `npm install` or an actual browser session in this
environment (no network access here — the same disclosed limitation
as every other round of work on this project). One genuine mistake was
caught and fixed during review: a couple of `\uXXXX` unicode escapes
were initially written directly inside raw JSX attribute strings and
JSX text content, where they render as literal backslash-escaped text
rather than the intended character — JSX only interprets escapes
inside an actual `{...}` JavaScript expression. Fixed by moving each
one into a string expression. A real `npm install && npm run dev`
session is the outstanding step before treating this as fully verified.

## Bug fixes, Transfer Solver, FPL team import, chip tracking, and two new trend charts

A large batch, requested together and worked through piece by piece.

### Bug fixes

- **Chip Planner home/away** — fixture chips showed "(A)" for away games but nothing at all for home games, reading as a missing indicator roughly half the time. Both now show explicitly.
- **Player Explorer preset buttons** — "FPL Output"/"Underlying"/"Value"/"Advanced" quick-preset buttons removed, along with their now-dead supporting code.
- **Team Building delete button** — traced end-to-end (button wiring, handler, storage hook, render guard) and found no reproducible bug in the button itself, but found a real, separate bug while building the Transfer Solver: four `useMemo` calls were declared *after* an early-return guard (`if (!active) return`), a genuine React Rules-of-Hooks violation. Deleting the active squad briefly sets `active` to null for one render, which took the early-return path with fewer hooks called than a normal render — exactly what React detects and throws on, which with no error boundary presents as the page going blank. This is almost certainly the actual "blank page" bug; fixed by moving every hook above the guard. The delete button itself was also improved regardless: always clickable now, with an explicit on-page warning (not a silent disable) if it's the squad's last one.
- **"Reset Filters" → "Reset Criteria"** — renamed in the one shared `FiltersBar` component powering it everywhere; "Clear Filters" (the separate per-table control) is untouched.
- **Archetype price-tier conflict** — root cause was a data-basis bug, not a threshold bug: Team Building's archetype computation ran against historic-average prices, while Player Explorer's followed whichever analysis-mode toggle was active, so the same live-priced player could get a different Premium/Mid-priced/Budget label depending on which page (or toggle state) computed it. Fixed by decoupling price-tier archetypes from whatever "resolved" player object is in play — they now always bucket on today's real live price, while performance-based archetypes still correctly follow the active analysis mode.

### Dashboard

Two colour-coded section titles — "Player Summary Statistics" and "Team Summary Statistics" — replacing a single plain caption, so the two groupings read as distinct at a glance.

### Chip Planner — squad clashes

A ⚔ now marks any fixture where two of the squad's own players are on opposite sides. Genuinely factored into Bench Boost's ranking (not just decorative): a documented, bounded 20%-of-the-weaker-side penalty per clash, reasoning that a striker scoring past your own goalkeeper/defender is the literal mechanism by which one side's points disappear — summing both sides' projections at face value overstates the realistic combined return from that one fixture. Triple Captain's own ranking is deliberately unaffected (the captained player's own output isn't what's at risk) but flags a clash in its reasoning when relevant.

### Team Building — Transfer Solver

Searches for same-position swaps that improve the squad's Expected Points total, validated against budget/composition/club-limits via the same `canAddPlayer` check the Add Players table already uses. 1 transfer is exhaustive (15 × pool size). 2 transfers is explicitly a heuristic, not exhaustive — a true search is tens of millions of combinations, so it instead pairs up the strongest single-swap legs (a beam of the top 10) and checks whether any pair still fits the rules together; a strong pair built from two only-mediocre-alone moves wouldn't surface. Scoring reuses the exact same Expected Points method as the rest of the page (`fixtureMultiplier`, now exported from `expectedPoints.ts` for reuse) — not a second model. A free-transfers input feeds the standard -4/hit cost into ranking. Each suggestion has an Apply button that safely updates squad, starting XI, and captaincy.

**What changed**: new `client/src/metrics/transferSolver.ts`; `expectedPoints.ts`'s `fixtureMultiplier` exported; `TeamBuilder.tsx` wired up (and restructured for the hooks-order fix above, which touched most of the component's data-derivation block).

### Team Building — Load from FPL, chip tracking, chip-adjusted Expected Points

**Load from FPL**: a team ID import, built against endpoints verified two different ways — `entry/{id}/` and `entry/{id}/history/` were fetched directly against a live 2026/27 response (team identity, bank/value, and the real chips-used history, confirmed with real field names); `entry/{id}/event/{event}/picks/` could not be fetched directly in this build environment (no network access) and is instead cross-checked against several independent community write-ups, so its parsing is deliberately defensive — an unmatched player or an unrecognised chip name becomes a warning, never a crash. All three are read-only, unauthenticated public requests; nothing is ever written back to FPL. Importing creates a new saved squad rather than overwriting anything.

**Chips Used This Season**: a per-half checkbox grid (Wildcard/Free Hit/Bench Boost/Triple Captain × first/second half), auto-filled from a real import's chip history or ticked manually for a from-scratch squad. Chip Planner reads this directly via a shared `isChipUsedForWindow` function (in `metrics/chipPlanner.ts`) and marks an already-used window instead of recommending it — the same function in both places, so they can't disagree.

**Chip-adjusted Expected Points**: a None/Bench Boost/Triple Captain toggle on the Expected Points card (`computeChipAdjustedExpectedPoints` in `metrics/squadRating.ts`). Free Hit and Wildcard are deliberately excluded — neither has a well-defined effect on a fixed squad's own points, since their whole point is bringing in players not currently owned. Correctly scoped to one gameweek: in a 3- or 5-GW window, the chip's effect (the bench's points for Bench Boost, the 3x multiplier for Triple Captain) only applies to the first upcoming fixture's contribution, not the whole window, since a chip is played for exactly one gameweek, never held across several.

**What changed**: server — new `server/src/routes/entryImport.ts` (three proxied endpoints, its own short-TTL cache given how quickly a real manager's data can change), registered in `app.ts`. Client — `types/raw.ts` (`RawEntryTeam`/`RawEntryHistory`/`RawEntryPicks`), matching zod schemas, `api/client.ts` fetch functions, new `normalize/normalizeEntryImport.ts`, `types/team.ts` (`SavedSquad.usedChips`/`.importedFrom`, plus a `loadFromStorage` migration so squads saved before this change don't crash on load), `metrics/chipPlanner.ts` (`isChipUsedForWindow`), `metrics/squadRating.ts` (`computeChipAdjustedExpectedPoints`), `TeamBuilder.tsx` and `ChipPlanner.tsx` wired up.

### Underlying Numbers — Thematic Analysis and Player Trends

Both requested to sit outside the Last Completed Season / Historic Average / Current Season plumbing the rest of the page uses, since both need a genuine multi-season time series rather than a single resolved season — a structurally different data shape. A new `allTimeSeasonsByPlayerId` (full, unwindowed career history) is exposed via `AppStateContext`, alongside `historicProfiles`' existing 4-season-windowed view which is unchanged and still used everywhere it already was.

**Player Trends**: pick any player, pick a metric (Points/Points-per-90/xG/xA/xGI/Minutes), see their whole career on record — no minutes qualifying threshold, deliberately, since a quiet or injury-hit season is real data worth seeing, not noise to filter out.

**Thematic Analysis**: average points by position, and average points by price tier, across every season on record — including light or injury-hit ones, no qualifying-minutes bar (see <no_survivorship_bias>, `historicAnalysis.ts`). Price tier uses each season's OWN price (`endCost`, falling back to `startCost`), not today's — consistent with how price tiers work everywhere else in this app. Position uses each player's CURRENT position, since this app has no record of historical position changes; a position-switcher's older seasons are grouped under where they play now, disclosed rather than hidden. A player no longer in the live pool is excluded from this chart specifically (their own Player Trends chart is unaffected).

**What changed**: `state/AppStateContext.tsx` (`allTimeSeasonsByPlayerId`), new `metrics/careerTrends.ts` and `metrics/thematicTrends.ts`, `pages/UnderlyingNumbers.tsx` (two new chart sections using Recharts' `LineChart` directly, alongside the existing `ScatterWithReference` component).

### User Guide

Updated throughout for everything above — Dashboard, Team Building, Underlying Numbers, and the Archetypes section's price-tier clarification.

### Testing note

Same disclosed limitation as every other round: no network access in this build environment, so no `npm install`/`tsc`/browser session was possible — every file got a careful manual review instead, cross-checking every new export against every place it's imported. The entry-picks endpoint specifically (see above) is the one piece of this batch resting on community documentation rather than a direct live fetch. A real `npm run dev` session remains the outstanding step before treating any of this as fully verified.

## Electron desktop app

Wraps the existing app into a downloadable, installable desktop app —
one self-contained install per person, no accounts, no shared server,
no database, no hosting cost. This deliberately avoids the much larger
multi-user-website version of this project (auth, a real database, a
shared cache to avoid multiplying load on FPL's API across many users)
— a downloadable app doesn't have that problem, since each install just
runs the app the way it already runs locally today, against the user's
own network connection. **This is now the primary way this app is
distributed** — built, installed, and verified working end-to-end on a
real Windows machine (see `DEPLOYMENT.md`'s "Electron desktop app"
section for the full verification writeup and the real bugs that
surfaced and got fixed along the way).

### What changed
- `server/src/app.ts` — the Express app's setup, extracted out of
  `index.ts` into a `createApp(options?)` function that builds the app
  without starting it. `index.ts` is a thin entry point
  (`createApp().listen(...)`) — `npm run dev` and `npm start` behave
  identically to before. The extraction exists so Electron can start
  the exact same app itself, rather than duplicating its route/
  middleware setup. `createApp()` takes an optional `clientDistPath` —
  Electron's bundled server can't use `import.meta.url` (see below) to
  find `client/dist` itself, so it passes the path in explicitly;
  every other caller (`index.ts`, Docker) omits it and gets the normal
  auto-detected path.
- `electron/main.js` — the Electron main process. Starts the embedded
  server on port 4317 (chosen to avoid colliding with the dev server's
  port 4000), waits for it to actually be listening, opens a window
  pointed at `http://localhost:4317`, then calls `electron-updater`'s
  `checkForUpdatesAndNotify()` to check GitHub Releases for a newer
  version. No preload script — the page itself never needs Node or
  Electron APIs, it's the same web app that already runs in a normal
  browser.
- Root `package.json` — `electron`, `electron-builder`, `esbuild` as
  dev dependencies, `electron-updater` as a runtime dependency, an
  electron-builder `build` config (Windows NSIS installer for now —
  see `DEPLOYMENT.md` for why Mac/Linux are deferred), and a `publish`
  block pointing at this repo's GitHub Releases.
- `.github/workflows/release.yml` — builds and publishes the installer
  automatically on every `v*` tag push, so tagging a release (the same
  `git tag -a vX.Y.Z` this project always does) is the entire release
  process — no separate manual build-and-upload step.

### Why the server is bundled with esbuild, not packaged as-is
This is an npm-workspaces monorepo — `express`/`cors` live in the
hoisted root `node_modules`, not `server/node_modules`. Having
electron-builder figure out which `node_modules` to include based on
`server/package.json`'s dependencies, when the actual files live one
level up, was a real risk worth avoiding entirely: `npm run
build:electron-server` uses esbuild to bundle `server/src/app.ts` and
everything it imports — express and cors included — into one
self-contained **CommonJS** file (`server/dist/app.bundle.cjs`) that
needs zero `node_modules` resolution at runtime. CommonJS, not ESM —
an earlier version of this bundle used ESM output and dynamic
`import()`, which broke two different ways on a real Windows run (see
`DEPLOYMENT.md`); CJS plus a plain `require()` sidesteps both. Same
reasoning behind `"asar": false` in the build config — `express.static`
serving files from inside an ASAR archive is a known friction point
elsewhere, and this app has no real need for ASAR's main benefit
(obscuring source).

### To build and test it locally
```bash
npm install                    # pulls in electron/electron-builder/esbuild/electron-updater
npm run electron:start         # builds the client, bundles the server, launches the app directly
```
Packaging an installer:
```bash
npm run electron:build         # same build steps, then electron-builder packages an NSIS installer into /release
```

### Releasing a new version
Tag it exactly as usual — `git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z`.
GitHub Actions (`.github/workflows/release.yml`) takes it from there:
builds the installer, derives the app version from the tag itself, and
publishes both the installer and update metadata to a GitHub Release.
Every installed copy's `electron-updater` finds it on next launch,
downloads it in the background, and prompts a restart when ready.

### Known, accepted limitations for now
- **Unsigned app.** No code-signing certificate — expect a Windows
  SmartScreen "Windows protected your PC" prompt on first install
  (click "More info" → "Run anyway"). A deliberate cost/complexity
  trade-off, not a bug; revisit if it ever becomes worth the ~$100–400/yr.
- **No app icon configured** — Electron falls back to its own default
  icon. Cosmetic; easy to add later.
- **Windows only.** Mac/Linux would need their own CI runners in the
  same workflow (and Mac specifically needs paid code signing +
  notarization for its own auto-update to work at all) — deferred
  until actually needed, not because of any blocker in the approach.

## Championship data (promoted teams) — added, then removed

A `/championship` section covering the 2025/26 EFL Championship's three
promoted clubs was added as a static, one-time-computed dataset
(`football-data.co.uk`'s E1 CSV, transformed offline into a league
table + per-team stats, no live fetch or server route). Removed shortly
after in a broader nav cleanup — "seems pointless" was the reasoning —
along with Price Watch and Chip Planner (see the nav-reorganisation
entry below). The commit that added it is still in git history if this
or something like it is wanted again; nothing about the approach (a
static JSON asset, its own type, no AppStateContext entry) was wrong,
it just didn't earn a permanent place in the nav.

## Nav reorganisation: Price Watch, Chip Planner, and Championship removed

Sidebar restructured into a flat "Dashboard" link, an "Analysis Tools"
group (Player Explorer, Underlying Numbers, Teams, Player Comparison),
a "Predictive Tools" group (Team Building), and a trailing "User Guide"
link, with separators between each — see `AppShell.tsx`'s
`NAV_STRUCTURE`. Price Watch and Chip Planner were removed as pages
(their functionality is intended to be uplifted into Team Building
later — `metrics/chipPlanner.ts`'s `isChipUsedForWindow` survived the
cut since Team Building's own "Chips Used" card already depends on it;
everything else chip- and price-watch-specific was deleted, not just
unrouted). Championship was removed as "pointless" per direct feedback.
All three still exist in git history.

## User customisation survives app updates: versioned localStorage

This app has no accounts and no server-side storage — every piece of
user customisation (Dashboard summary tiles, saved User Analysis
graphs, saved squads) already lived in the browser's `localStorage`,
keyed to whichever machine/browser profile the app runs in. That
storage is a separate Chromium storage partition from the installed
app bundle, so it was already untouched by an auto-update in practice —
the open question was what happens when a *future* version changes the
shape of what's stored (a renamed field, a new required property) and
an existing user's saved data no longer matches it.

Each of those three localStorage keys now wraps its data in a small
versioned envelope (`{ version, data }`, via the new
`state/persistentStorage.ts`) instead of writing the raw value
directly. On load, a per-store `migrate(data, storedVersion)` function
gets the raw payload plus the version it was written under (`null` for
every key written before this change — read once, treated as legacy
unversioned data, exactly like today) and returns either something
shaped like the current version or `null` to fall back to the default/
empty state. This replaces three near-identical hand-rolled try/catch/
`JSON.parse` blocks with one shared implementation, and gives future
shape changes (adding a field, renaming one) a real place to add a
version-gated migration instead of an ad-hoc `?? fallback` sprinkled at
the read site — see `useSavedSquads.ts`'s `usedChips`/`importedFrom`
backfill for the kind of case-by-case fix this is meant to generalise.

Saving still degrades the same way as before if `localStorage` throws
(private browsing, quota) — the customisation still works for the rest
of that session, it just won't persist across a reload.

## Project structure

```
fpl-dashboard/
  server/                  Express API proxy
    src/
      config.ts            Centralised TTLs, timeouts, retry policy
      cache.ts             In-memory TTL cache
      httpClient.ts         fetch with timeout + capped retry
      proxy.ts             Cache + de-duplication + stale-fallback glue
      routes/               One file per FPL endpoint proxied
      index.ts              Express app entry point
  client/                  React + Vite + TypeScript SPA
    src/
      types/                Raw API types vs. normalised UI types
      validation/            Zod schemas — validated before normalisation
      normalize/             Raw -> normalised mapping, gameweek logic, field-availability detection
      metrics/               Calculations, dictionary, percentiles, validation, rotation indicators
      api/                  Frontend fetch client
      state/                 App-wide React Context (shared data only — see scoutingFilters.ts for why filters/analysis-mode are per-page, not here)
      components/            Reusable UI pieces (table, filters, charts, overlay)
      pages/                 One file per navigation section
      styles/                Design tokens + component CSS
```

## Fixed: Career History chart colour tracked minutes, not average inclusion

`CareerHistoryChart` (the player profile's per-season points bar chart)
originally coloured a bar green only if that season individually cleared
`MIN_QUALIFYING_SEASON_MINUTES` (900), grey otherwise — a leftover from
before `<no_survivorship_bias>` (`historicAnalysis.ts`) changed Historic
Average to include every season in the rolling window regardless of
minutes. The result: a genuinely light season still counted in the
average line drew grey anyway, looking like it had been excluded when it
hadn't. The chart's colour now tracks the same `allSeasonsInWindow` set
the average is actually built from — green for every in-window season
(light or not), grey only for a season outside the window (the one case
genuinely excluded), dashed for the live/in-progress season. The
season-by-season detail table underneath is unaffected — it already
distinguished "light but counted" (asterisk) from "outside window, not
counted" (dagger) via separate symbols and tooltips.

## Fixed: seeded "Default" saved dashboard views didn't show up for existing installs

The Dashboard's saved-views localStorage key already existed for anyone
who'd opened the Dashboard under a prior version — its own save effect
had already written an (empty) array to disk before "Default" views were
introduced. Changing that store's `fallback` only matters on a
key-doesn't-exist-yet load, so it silently never took effect for anyone
upgrading rather than installing fresh. Fixed by bumping the store's
version and having `migrate()` backfill the two "Default" entries (by id,
skipping ones already present) into any array stored under the older
version — see the `STORAGE_VERSION` comment in
`state/useSavedDashboardViews.ts`.

## Dashboard: "Default" saved view can't be deleted

Every other saved Dashboard view can be deleted; "Default" (one per
scope, see the section above) now can't — `useSavedDashboardViews`'s
`remove()` refuses its two fixed ids, and the Dashboard's own Delete
button is disabled with an explanatory hover title whenever "Default"
is the one selected. The point is to guarantee there's always at least
one view to fall back on for each scope, rather than a user being able
to delete every saved view and have nothing left to load.

## Fixed: bootstrap data never refreshed itself mid-session

Before this, `bootstrap-static` (players, teams, gameweek state) was
fetched exactly once per app launch — nothing polled for updates, so
the Dashboard's Gameweek Status, Players Tracked, and "Data Last
Updated" cards would silently go stale for as long as the app stayed
open, only correcting on a restart or a manually-clicked "Refresh
Data" (reported directly: a gameweek whose matches had already finished
still showing as in progress days later, a recurring issue across
several gameweeks rather than a one-off). `AppStateContext` now polls
in the background every 10 minutes — matching the server's own
`bootstrap-static` cache TTL (`CACHE_TTL_MS.bootstrapStatic`,
`server/src/config.ts`), so each poll is likely to land on a genuinely
re-fetched upstream snapshot — and applies the result the same way a
manual refresh does, just without the loading screen or the button's
"Refreshing…" state (`load(forceRefresh, silent)` in
`state/AppStateContext.tsx`). "Players Tracked" and "Total Players"
were also checked while investigating this: "Players Tracked" is
`players.length`, the count of elements that normalized successfully
(excluding any dropped for referencing an unknown team/position id,
which is separately surfaced via `skippedPlayerCount` in the User
Guide's data-quality panel) — a different, correct number from
bootstrap-static's own `total_players`, which is the count of
registered FPL managers, not footballers, and is used elsewhere only
for ownership%-to-owner-count math (`totalPlayers`,
`metrics/priceChange.ts`). No accuracy issue found there.

## Fixed: a Default view deleted before the anti-delete guard existed never came back

The Default-view backfill (see "Dashboard: 'Default' saved view can't be
deleted" above) only ran once, gated behind a version bump — fine for
seeding it in the first time, but it meant a Default view someone had
already deleted under a version that still allowed deleting it (i.e.
before that guard shipped) stayed gone forever afterwards, even for
just one scope (reported: the Player-scope Default view, and with it
the entire Saved Views dropdown for Players, had disappeared again
while Team's was still fine). `migrate()` now re-checks for both
Default entries on every load rather than only across that one version
transition, and adds back whichever is missing — a cheap, idempotent
check that's a no-op once both are present, which self-heals this case
and any equivalent one rather than needing a fix release each time.

## Forensic audit and remediation pass

A systematic bug/efficiency review, run as its own fresh session with fixes
explicitly not allowed during the audit itself — findings only, then a
separate remediation session against that report. Checked against the live
app and the real FPL API (2026/27 season). Full detail in
`docs/audits/results/2026-09-21-full-app/` (`1-audit.md`, `2-remediation.md`).

- **Fixed — the whole player pool's historic career data was being fetched
  unconditionally on every app launch**, regardless of whether any page
  actually needed it yet — several hundred `element-summary` requests to
  the live FPL API before the user had done anything but load the
  Dashboard, a direct violation of this project's own lazy-loading rule.
  Replaced with `requestHistoricData()`, called on mount by every
  page/component that actually resolves stats in a non-"live" mode.
- **Fixed — a single malformed player record (e.g. a null `now_cost`) could
  take down the entire app**, 0 players anywhere, instead of just that one
  record. Bootstrap data is now validated per-record; a bad one is skipped
  and counted (surfaced in the User Guide), not fatal to everyone else.
- **Fixed — the server's stale-cache fallback was dead code on the normal
  request path.** An expired cache entry was being deleted as a side effect
  of the routine cache-hit check, before the fallback logic ever got a
  chance to serve it if the upstream FPL API then failed — silently
  defeating the documented "serve stale data rather than error outright"
  resilience guarantee for every ordinary request.
- **Fixed — Dashboard/Underlying Numbers "Top 5"/"Bottom 5" tiles used a
  broken sort comparator** that never resolved ties correctly, so which
  player appeared at a tied boundary (common on integer stats like 0
  assists/bonus) wasn't guaranteed stable.
- **Fixed — Team Building's Add Players Min Minutes filter was missing the
  live-mode bypass every other page's equivalent filter has**, so setting a
  threshold and switching to Current Season mid-season could silently
  collapse the candidate pool with no explanation.
- **Fixed — deliberately emptying every Dashboard tile didn't stick** — the
  saved-tiles migration treated a genuinely empty tile list as invalid and
  silently reseeded the packaged defaults on next load.
- **Fixed — "Refresh Historic Data" didn't force-refresh all the way
  down.** The top-level rebuild honoured a forced refresh, but the nested
  per-player and bootstrap fetches it depends on didn't, so a refresh could
  still silently serve already-cached data.
- **Fixed** a handful of smaller issues from the same audit: a
  floating-point false positive in the xGI validation check right at its
  tolerance boundary; `bootstrap-static` and `fixtures` fetching
  sequentially despite being independent; a narrow-viewport (~480px)
  sidebar/content overlap; 469 lines of confirmed-dead code
  (`optimalDraft.ts`, `transferSolver.ts`) removed; several README sections
  that had drifted from what the shipped code actually does.
- **Added** a real automated test suite from zero — Vitest across both
  workspaces, 185 tests covering the metrics/calculation layer, normalize/,
  state persistence, the server cache/proxy/concurrency layer, and
  regression tests for every bug fixed above (see `CLAUDE.md`'s Test
  section for what's covered and what's deliberately still out of scope).
- **Checked and confirmed correct, actively trying to break each one**:
  race-condition-safe rapid player-profile switching; per-page filter/
  analysis-mode isolation (zero shared state, zero extra API calls across
  in-app navigation); clean, non-crashing error states for both a fresh-load
  API failure and a failed manual refresh; the core calculation layer
  end to end (per-90→per-game migration, percentile methodology, price
  conversion, xGI validation, Expected Points, Minutes Reliability blend) —
  no defect found anywhere in it, across either audit pass.

## Adversarial regression pass: one real defect found in the remediation itself

A third, independent session with one job: don't trust the remediation pass
above — try to break it. Re-read every changed file's diff, re-ran the full
build and test suite independently, and drove the real dev servers with a
headless browser against live data. Full detail in
`docs/audits/results/2026-09-21-full-app/3-regression.md`.

- **Fixed — the previous entry's own "Refresh Historic Data" fix introduced
  a race condition.** If an explicit refresh request arrived while an
  ordinary (non-refresh) historic-data build was already in flight — e.g.
  two browser tabs, one loading cold and one retrying after an earlier
  error — the refresh silently rode the in-progress non-refresh build
  instead of forcing its own, quietly losing its "force fresh" guarantee.
  Reproduced directly against the real route handler before fixing. Fixed
  by keying the in-flight build tracker by whether it's a refresh,
  mirroring the pattern the single-resource proxy cache already used
  correctly — plus two new regression tests exercising the real route
  handlers together, not just the build function in isolation (the
  isolation gap that let this one through the first time).
- **Confirmed correct, everything else from the remediation pass above** —
  re-verified live, not just re-read: the malformed-record handling (fed it
  two corrupted player records through a real browser, app loaded fine with
  the rest of the pool and reported exactly what was skipped), the Team
  Building Min Minutes live-mode bypass, deterministic tile tie-breaking
  across repeat loads, the 480px layout fix, zero extra API calls across
  in-app navigation, and a clean error state on a full API failure.

## Testing performed

This app was developed and reviewed against the live 2026/27
`bootstrap-static` response (fetched directly to confirm real field names
before writing any normalisation code). Every TypeScript/TSX source file
in both `server/` and `client/` was type-checked with the TypeScript
compiler; the only errors surfaced were the expected "module not found"
errors for third-party packages not yet installed via `npm install` (this
review environment does not have package-registry access) — there are
**zero** genuine syntax or type errors in the application's own code.

Because that same restriction means `npm install` / `npm run dev` and a
real browser session could not be executed in this environment, the
runtime functional checks called for in the brief (live data loading,
filter/sort interaction, chart rendering, race-condition behaviour, and a
final "run it and fix what breaks" pass) still need to be performed by
running `npm install && npm run dev` locally and clicking through the app
once. Please treat that as the outstanding step before calling this
"done" in the strictest sense of the brief's definition of done.

## Dashboard: streamlined summary-tile view selector, and the selected view now persists

The Dashboard's Summary Tiles controls (Players and Teams sections alike)
were carrying more chrome than they needed: a "Saved views…" placeholder
that meant the dropdown never actually pointed at what was on screen, a
separate Load button after picking a view, and three fully-labelled text
buttons. Reworked to match how it's actually used — picking a view in the
dropdown now loads it immediately, the dropdown defaults to "Default" (the
permanent built-in view) instead of an empty placeholder, and Add Tile/Save
View/Delete are now icon-only buttons (+ / floppy disk / bin), ordered
selector → add → save → delete.

Which view is selected also now **persists per scope** (Player and Team
tracked separately) across a reload or fully closing and reopening the
desktop app — previously it reset to Default every time regardless of what
was actually on screen, even after loading a different saved view. New
small localStorage store (`useSavedDashboardViews`'s `selectedViewIds`),
self-healing the same way the Default-view backfill already does; deleting
the view currently selected for a scope falls that scope back to Default
automatically rather than pointing at something that no longer exists.

## Dashboard: Default is now truly immutable, and "Create View" replaces the old Save-View-then-edit flow

Two problems with the previous round of Summary Tiles controls: "Default"
could still be freely edited (add/remove a tile while it was selected),
which meant its whole point — one always-known-good, never-broken layout
to fall back on — didn't actually hold; and there was no clear way to
*start* building your own view versus just poking at whatever happened to
be on screen, which read as confusing next to the "+ Add Tile" button.

- **Default is now fully immutable.** While a scope's Default view is
  selected, every tile's per-card Remove button is hidden, and the "+ Add
  Tile" card doesn't render at all — Default can be loaded and looked at,
  never edited. `useSavedDashboardViews`'s Default entries are also now
  force-resynced to the packaged tile set on every load (not just backfilled
  when missing outright), which both performs a one-off reset for anyone
  whose Default had already drifted under the previous release (when it
  could still be freely edited) and guards against any future drift.
- **New Create View button** (the icon between the dropdown and Delete)
  replaces the old "Save View" flow. Instead of snapshotting whatever's
  currently on screen under a new name, it starts a genuinely blank view —
  name it, and the tile grid clears to just the + card, ready to build up
  from nothing. This was the actual source of the "Add Tile vs. Save View"
  confusion: there's now exactly one way to start a new view, and it's
  unambiguous about what it does.
- **No more separate Save step.** Once a non-Default view is selected,
  every tile you add, remove, or reorder live-syncs straight into that
  view's own storage as you go (`useSavedDashboardViews.updateTiles()`) —
  the floppy-disk Save icon is gone, since there's nothing left for it to
  do. Reloading the page, switching tabs, or fully closing and reopening
  the app always shows exactly what you left on screen.
- **Add Tile moved into the tile grid itself** — a dashed "+" card
  sitting after the last tile (wrapping to its own row once a row is
  full, via the grid's own layout, not a hardcoded column count), replacing
  the old standalone "+ Add Tile" button above the grid.

## Player Profile: Current Season Log always shows every column, comparative colouring added, Career History decluttered

- **"Show all columns"/"Show fewer columns" removed** — the Current Season
  Log always shows every column now (GW, Opponent, Result, Points, Minutes,
  Goals, Assists, xG, xA, xGI, Clean Sheets, Starts, Goals Conceded, xGC,
  Tackles, CBI, Recoveries, Defensive Contribution, Own Goals, Penalties
  Saved/Missed, Cards, Saves, BPS) — it scrolls horizontally rather than
  hiding most of it behind a toggle.
- **Comparative colouring on the Totals/Average rows** — same green-better/
  red-worse percentile tint already used on this page's Underlying Numbers
  and Value stat tiles, computed against the live-season population (this
  log is always live data, independent of the page's analysis-mode toggle)
  rather than whatever mode happens to be selected. Limited to the 13
  columns with a real season-aggregate figure on the whole player pool
  (Points, Minutes, Goals, Assists, xG, xA, xGI, Clean Sheets, Starts, xGC,
  Defensive Contribution, Saves, BPS) — the other 9 (Tackles, CBI,
  Recoveries, Goals Conceded, Own Goals, Cards, Penalties) are only ever
  tracked per-gameweek for the one player being viewed (this app never
  bulk-fetches every player's full gameweek history just to build a
  population average for a handful of columns), so those stay untinted
  rather than showing a comparison with nothing real behind it.
- **"Career History — Points by Season" renamed to "Career History".**
- **Season-by-season detail is now an icon** — a chevron (flips up/down)
  replaces the "Show/Hide season-by-season detail" text button. Its table
  is comparatively coloured too, but relative to this player's own other
  seasons shown in the table (there's no cross-player population for a
  single player's career), the same per-column-range technique Player
  Explorer's Comparative Colouring uses.

## Current Season Log: grouped into Prime/Supplements, position sense-check, fuller column names

- **Grouped and labelled** — the 13 comparatively-coloured columns now sit
  together right after GW/Opponent/Result under a "Prime" header label, a
  divider, then the 9 uncoloured columns under "Supplements" — reusing the
  app's existing column-group-divider styling (already used for Team
  Building's predictive/historic column split) rather than a new pattern.
- **Position sense-check** — Saves and Penalties Saved are now GKP-only
  columns (hidden entirely for DEF/MID/FWD, rather than a row that can only
  ever read zero for an outfield player). Defensive Contributions is hidden
  for GKP instead, on the same basis already documented in this README's
  "Defensive Contribution/Game vs Defensive Reward/Game" section:
  goalkeepers are explicitly excluded from the DC mechanic under official
  FPL scoring rules.
- **Fuller column names** — Pts→Points, Min→Minutes, G→Goals, A→Assists,
  CS→Clean Sheets, GC→Goals Conceded, T→Tackles, CBI→Clear/Blocks/Int,
  R→Recoveries, OG→Own Goals, PS→Penalties Saved, PM→Penalties Missed,
  YC→Yellow Cards, RC→Red Cards. xG/xA/xGI/xGC/BPS/DC were deliberately left
  as their established short form — that's already how they're labelled
  everywhere else in this app (and, for xG/xA/xGI/xGC, in football
  analytics generally), so spelling them out here alone would make this one
  table less consistent rather than clearer.

## Live Data: Current Season Log split into Prime/Supplements tables, Playing Time full-width

- **Two tables instead of one wide one** — the combined GW/Opponent/Result +
  Prime + Supplements table ran wider than the card on typical screens,
  scrolling the Playing Time gauge beside it off the page entirely. Prime and
  Supplements now render as their own stacked tables (Prime on top), each
  repeating GW/Opponent/Result so it stands alone — narrower, and no longer
  dependent on how much horizontal room its neighbour leaves it. Per-gameweek
  figures, Totals/Average rows and Prime's comparative colouring all work
  exactly as before, just split across two tables instead of one.
- **Playing Time moved below both tables** — previously squeezed into a
  second column beside Current Season Log (which is what pushed it off
  screen along with the overflow). It's now a full-width card underneath
  both tables and above Career History, so it's never at the mercy of how
  wide the tables above it happen to run.
- **Totals/Average row label** — now spans the full GW/Opponent/Result block
  instead of spanning just GW/Opponent and leaving Result blank next to it.
- **Column-group-divider colour** — the divider between the identity columns
  (GW/Opponent/Result) and the stat columns (also used for Team Building's
  predictive/historic column split) is now a muted grey
  (`var(--border-strong)`) instead of the focus-accent blue, since it's a
  neutral visual separator rather than an interactive cue.

## Team Profile overlay replaces Team Detail's ranking page; Playing Time gains a text summary and stops stretching full width

- **Team Detail (the "rank players by attribute" page at `/teams/:teamId`)
  removed.** It duplicated a metric-picker table that already exists — Teams'
  own "Player Rankings" shortcut jumps into Player Explorer pre-filtered to
  that club, which is fully sortable by every column already. Nothing was
  gained by a second, narrower copy of the same idea.
- **Team Profile overlay added** (`TeamDetailOverlay.tsx`), in the same
  spirit as the player profile: a coloured team pill is now clickable
  *everywhere* it appears in the app (Teams, the Dashboard's team tiles) and
  opens an overlay (`?teamProfile=` query param, same pattern as the player
  profile's `?player=`) showing that club's league standing, squad totals
  (Points, Goals, Assists, xG, xA, xGI, Clean Sheets) under the same
  Last Completed Season / Historic Average / Current Season toggle every
  other page has, upcoming fixtures with FDR, and the current squad sorted
  by points — with its own "Player Rankings" link through to Player
  Explorer for anyone who wants the full sortable table. Clicking a player
  in the squad list swaps the team overlay for that player's profile rather
  than stacking both.
- **Playing Time (player profile) gets a text summary next to the gauge** —
  "Completed Gameweeks" and "Average Minutes Per Gameweek" spelled out
  alongside the icon, since the gauge alone read as a lot of near-empty
  space once Current Season Log was split into Prime/Supplements and
  Playing Time became its own full-width card underneath. The card is now
  capped at a sensible width instead of stretching edge-to-edge, while
  keeping its place beneath Supplements and above Career History.

## Underlying Numbers removed — graph building moved into the Dashboard

Underlying Numbers had drifted into duplicating leaderboards the Dashboard
already showed, and graph building (its one genuinely distinct capability)
had no real reason to live on a separate page from the Dashboard's tiles.
That page is gone; graph building now lives alongside Summary Tiles.

- **Dashboard gains a Graphs section**, under a divider below the tile
  grid — a graph needs a lot more room than a tile to be readable, so it
  gets its own section rather than sharing the tile grid's compact card
  size. Both Player and Team scopes get a couple of packaged default
  graphs (see below), and every saved Dashboard view (Default and custom)
  now carries its own `graphs` array alongside its `tiles` — built,
  removed, reordered (drag-and-drop, same as tiles), and live-synced into
  that view's storage exactly the way tiles already were
  (`useSavedDashboardViews.updateView()`, replacing the old `updateTiles()`
  now that a view is more than just its tiles).
- **Graphs are built once, like tiles — not left permanently editable.**
  The old Underlying Numbers "User Analysis" graphs each carried their own
  live-editable analysis-mode toggle and filter bar
  (`LocalViewControls`/`UserAnalysisGraphCard`) that stayed on screen
  forever. A Dashboard graph instead picks its Data View, chart type
  (Scatter Plot or Bar Chart), X/Y metrics, and — for a Player Graph —
  Filters or up to 5 specific players (Player Search), or — for a Team
  Graph — All Teams or up to 5 specific teams, once in the **+ Add Graph**
  dialog, the same "configure once, remove-and-recreate to change" model
  `SummaryTileConfig` already used. New: `useDashboardGraphs.ts`
  (`DashboardGraphConfig`, mirroring `SummaryTileConfig`) and
  `DashboardGraphCard.tsx` (a presentational chart card mirroring
  `TopList`/`TeamTopList`'s header conventions — title, `DataViewBadge`,
  drag handle, Remove). `UserAnalysisGraphCard.tsx` and
  `useSavedUserGraphs.ts` are deleted.
- **An optional 45° reference line, settable per graph.** Carried over from
  the old Expected vs Actual charts' dashed "expected output" line —
  meaningful only when X and Y are on a comparable scale (xG vs Goals, xA
  vs Assists), so it's a checkbox in Add Graph rather than always-on or
  always-off. `ScatterWithReference`/`BarTopN` also gained an `emptyMessage`
  prop so a Team Graph's empty state reads "teams," not "players."
- **Packaged default graphs**: Players get `xG vs Goals` and
  `xA vs Assists` (reference line on) plus `Price vs Points` (off — price
  and points aren't on a comparable scale); Teams get `Team xG vs Goals`
  and `Team xGC vs Goals Against` (both on). The old page's **Thematic
  Analysis** charts (average points by position/price tier across every
  season on record) are deliberately NOT among them — those are genuine
  multi-season time series built on `thematicTrends.ts`'s own pipeline, not
  a single-Data-View metric-vs-metric graph, so they don't fit this
  per-graph model. Rather than force a special case into it, they were
  retired along with the rest of the page; `thematicTrends.ts` is deleted.
- **Team metrics catalogue expanded** (`components/teamColumns.tsx`, new —
  the team-scope counterpart to `playerColumns.tsx`, now the one place both
  Team Tiles and Team Graphs pick their metrics from instead of a
  Dashboard-only hardcoded list). Previously six squad-sum metrics (Squad
  Points, xGI, Clean Sheets, Goals, Assists, Bonus); now also xG, xA, xGC,
  and Defensive Contributions (squad sums, same as the others — all now
  computed via the shared `computeTeamAggregates()`, TeamDetailOverlay's
  own function, rather than Dashboard.tsx's own duplicate inline version),
  plus a genuinely new **LEAGUE STANDING** group read straight from this
  season's real table and match results rather than a squad sum — League
  Position, League Points, Played, Wins, Draws, Losses, Goals For, Goals
  Against, Goal Difference — always live regardless of a tile/graph's own
  Data View, same "always live" convention as a player's price
  (`TeamAggregate`/`TeamColumn.varies`, `metrics/teamStats.ts`).
- **Two leaderboard tiles' worth of leftover useful stats also moved to
  the Dashboard's defaults**, folded in as new default Player Tiles rather
  than as graphs, since a ranked top-5 list is what a tile is for: xG, xA,
  xGI/Game, Assists vs xA (Above and Below), xG/£m, and xA/£m — Underlying
  Numbers' "Top xG"/"Top xA"/etc. leaderboards, none of which the Dashboard
  already covered.
- **Two new player metrics, available anywhere PLAYER_COLUMNS is (tiles,
  graphs, Player Explorer)**: `xGC/Game` (existed in the metric dictionary
  already, just never exposed as a pickable column) and
  `Defensive Reward/Game` (`defensiveRewardPerGame`, from
  `metrics/defensiveReward.ts`) — the two axes of the old page's
  "Defensive Contribution/Game vs Defensive Reward/Game" chart, now
  buildable as an ordinary two-metric graph. The old chart's colour-coded
  third dimension (xGC/Game as a green→red gradient) and its bespoke
  goalkeeper-exclusion/minutes-floor logic aren't reproduced — those were
  specific to that one hardcoded chart, not something the generic "pick any
  X, pick any Y" graph builder tries to generalise.
- **Nav entry, route (`/underlying`), and page deleted.** `App.tsx`,
  `AppShell.tsx`, and the User Guide's "Underlying Numbers" section are
  updated/removed accordingly; the Dashboard's User Guide section now
  documents Graphs alongside Summary Tiles.

## Dashboard graphs: readability fixes

- **Default player graphs get a 900-minute floor**
  (`DEFAULT_GRAPH_MIN_MINUTES`, `useDashboardGraphs.ts`) so fringe players
  no longer bury the chart at 0,0.
- **Scatter axes fit the data** when there's no reference line
  (`domain={["auto","auto"]}`); with the 45° line both axes still start at
  0. Fixed-size dots are smaller and semi-transparent so dense clusters
  read as darker patches.
- **Graphs sit 2 per row** (`.graph-grid`), 1 per row under 900px wide.
- **<axis_scaling>: blanket rules for every scatter**
  (`client/src/components/charts/axisScaling.ts`, `planScatterAxes()`,
  applied inside `ScatterWithReference`, which now always passes an
  explicit scale, domain and ticks):
  1. *Different scales* — if one axis's largest absolute value is ≥5×
     the other's (`SCALE_MISMATCH_FACTOR`; Price vs Points is ~16×), the
     45° reference line isn't drawn even if ticked, a note under the chart
     says so, and each axis is planned alone.
  2. *Long tail* — if the middle half of an axis's points (25th–75th
     percentile) spans under 20% of it (`CROWDED_SHARE`), the axis goes
     log (all values > 0) or √ (zeros present), but only if that widens
     the middle half by ≥30% (`MIN_SPREAD_GAIN`) and there are ≥8 points.
     Ticks are spaced evenly in the stretched axis, taking the roundest
     value each step (Price: 4, 5, 7.5, 10, 15); the axis title gets
     "(log scale)"/"(√ scale)".
  3. *Fit the data* — the axis runs 5% (`AXIS_PAD`, measured in the
     axis's own spacing) beyond the data at each end, not from 0 (club
     goals against 27–58 → axis ~25–60); it starts at 0 only when the
     lowest value is within 15% of the range of it (`ZERO_SNAP_SHARE`;
     Points from 19 of 0–239 → 0), and never crosses 0 unless the data
     does.

  With the reference line drawn, x and y are planned as ONE axis over
  both sets of values and share it — range, ticks and stretch — so y = x
  stays the diagonal. That is how xG vs Goals / xA vs Assists get √ on
  both axes (most players 0–3, a few 20+), spreading the pile-up at 0.
- A short-lived goalkeeper-based team xGC/"Goals Conceded" (v1.57.0) was
  superseded by club history (above) — "Goals Conceded" is now exactly
  the club's Goals Against for the view's season, so the key is retired:
  a stored tile/graph carrying it resolves to `goalsAgainst`
  (`currentTeamMetricKey()`, `teamColumns.tsx`), and the default team
  graph is "Team xGC vs Goals Against" again (graphs store v3).

## Dashboard tiles/graphs: Min Minutes applies in Current Season

Min Minutes used to be greyed out ("bypassed") in the Add Tile/Add Graph
dialogs whenever the Data View was Current Season, and was never applied
to a live tile/graph (see "Dashboard: per-tile criteria and tile naming"
above). It is now editable and applied in every data view, for Dashboard
tiles/graphs only:

- `filterPlayers()`/`effectiveMinMinutes()` (`useFilteredPlayers.ts`) take
  an opt-in `applyMinMinutesInLive`/`applyInLive` flag, passed only by
  Dashboard.tsx's tile and graph rows; `FiltersBar` takes a matching
  `minMinutesInLive` prop, set only by the two Dashboard dialogs. Every
  other page (Player Comparison, player/team detail overlays, Team
  Building's picker) still bypasses Min Minutes in Current Season.
- The default is still 0, so a new Current Season tile shows everyone
  until the user raises it. Players with null minutes are still retained.
- Migration: a live tile/graph saved before this could carry a non-zero
  `minMinutes` that was never applied (typed before switching the Data
  View to Current Season). `clearUnappliedLiveMinMinutes()`
  (`scoutingFilters.ts`) zeroes it on first load, so every existing tile/
  graph shows exactly what it did before — tiles store v5 → 6, graphs
  store v3 → 4, saved views store v3 → 4 (non-Default views' tiles and
  graphs). Non-live items keep their values.

## Dashboard: edit tiles/graphs in place, icon Remove, Add Trend Line toggle

- **Edit** — every tile/graph header on a non-Default view has a pencil
  icon (`CardEditRemoveButtons`, `components/IconToolbar.tsx`) that reopens
  the Add Tile/Add Graph dialog prefilled with that item's settings
  (`openEditTileModal`/`openEditGraphModal`, `editingTileId`/
  `editingGraphId` in Dashboard.tsx). Saving calls the new
  `updateTile`/`updateGraph` (`useSummaryTiles.ts`/`useDashboardGraphs.ts`),
  which replace the settings in place — same id, scope and grid position —
  and the live-sync effect writes the change into the selected saved view.
  The Default view stays immutable: no Edit there, same as no Remove. That
  also keeps the graphs store's migrate() assumption true: a default-id
  graph only lives in Default, so it's always an unmodified default.
- **Remove** is a bin icon (same `TrashIcon` as Delete View, moved into
  IconToolbar.tsx) instead of a text button, on tiles and graphs.
- The Add Graph dialog's "Show expected-output reference line" checkbox is
  now an icon toggle chip (`TrendLineIcon`, hover "Add Trend Line"). What
  it draws is unchanged: the dashed y = x line, still left out when the
  axes' scales differ.

---

## Removed or replaced since 2026-09-24

### Current Season PPG from FPL's `points_per_game` (replaced 2026-09-25)
- **What it did:** in Current Season, PPG was FPL's own bootstrap
  `points_per_game` (points ÷ appearances), read in
  `normalize/normalizePlayers.ts` and passed through by
  `resolvePlayerStats.ts`. Last Completed Season and Historic Average
  estimated it as points ÷ estimated games.
- **Why it went:** PPG meant a different thing depending on the Data View,
  and differed by 0.5 or more for 163 of 421 players who'd played (e.g. a
  substitute with 9 points in 72 minutes: 2.2 vs 9.0). The owner chose the
  app's points per estimated game everywhere (audit 2026-09-25, M4).
- **Last commit with it:** `e4c9923`.

### Per-game minutes floor on user-built Dashboard tiles and graphs (removed 2026-09-25)
- **What it did:** any Dashboard tile or graph showing a per-game rate
  (PPG, xG/Game, DC/Game…) left out players under 90 minutes (Current
  Season) or 450 (other views), on top of its own criteria —
  `applyRateStatFloor` in `pages/Dashboard.tsx`, called for every
  criteria-based tile and graph.
- **Why it went:** users set their own Min Minutes on tiles and graphs they
  build, so a hidden extra floor overrode their choice. The owner decided
  the floor belongs only on the packaged Default view, which can't be
  edited (audit 2026-09-25, M1). It is still applied there
  (`playersForDashboardItem`), though no current default shows a per-game
  rate.
- **Last commit with it:** `e4c9923`.

### Historic Average games from the average season's minutes (replaced 2026-09-25)
- **What it did:** Historic Average per-game rates (PPG, xG/xA/xGI/xGC/DC
  per game, Def. Reward/Game, Goals/Game, Assists/Game) divided the average
  season's stat by `ceil(average season minutes ÷ 90)` —
  `perGameOverKnownSeasons` in `metrics/careerMetrics.ts`, and
  `estimatedPointsPerGame(avgPoints, avgMinutes)` /
  `perGame(stat, player.minutes)` on the resolved player.
- **Why it went:** rounding each average season up added up to a whole
  game per season for light seasons, understating the rate (Reed
  2022/23–2025/26: PPG 3.4 vs 3.7 from total minutes; DC/Game 6.25 vs 8.33),
  and CLAUDE.md already said games come from total minutes. The owner chose
  total minutes (audit 2026-09-25, V1). Games are now counted once from the
  seasons' total minutes and carried on the resolved player
  (`estimatedGames`). Expected Points' historic rate still uses the old
  basis, deliberately frozen (`<expected_points_frozen>`).
- **Last commit with it:** `d6143e0`.


### No minutes floor on profile percentiles (replaced 2026-09-25)
- **What it did:** the player profile's radars and tile tints, Player
  Comparison's radars and the Team Profile's squad tints ranked each player
  against every player in his position with minutes for the Data View
  (`effectiveMinMinutes(DEFAULT_FILTERS, mode)`, always 0), and the
  "small sample" warning checked `minutes < 0`, so it never showed.
- **Why it went:** cameos topped per-game axes (Ben Davies, 136 minutes,
  100th percentile of defenders for xG/Game) and 0-minute players padded
  the bottom of every count. The owner set one rule: where the user can't
  set minimum minutes, the fixed floor applies (90 min Current Season, 450
  otherwise), to every percentile, and a player under it is a small sample
  with no percentile or colour (audit 2026-09-25 player-team-profiles H1).
- **Last commit with it:** `ae127db`.

### 0-minute seasons in the profiles' Historic Average (replaced 2026-09-25)
- **What it did:** the player profile (Views and Career History), Player
  Comparison and the Default Dashboard view averaged every season in the
  4-season window, including seasons on record with 0 minutes
  (`windowAverage`).
- **Why it went:** the owner decided that where the user can't set minimum
  minutes, a season with 0 minutes doesn't count (audit 2026-09-25
  player-team-profiles V2). Those sections now use `playedWindowAverage`;
  everywhere else still uses `windowAverage`.
- **Last commit with it:** `ae127db`.

### Team Profile header from today's table (replaced 2026-09-25)
- **What it did:** the header read "1st in table · 15 pts · 5 played ·
  5W 0D 0L" from the live table (`team.position`, `team.points`…) in every
  Data View.
- **Why it went:** every other club figure follows the Data View. It now
  shows the club's figures for the view, as Team Explorer shows them
  (audit 2026-09-25 player-team-profiles M1).
- **Last commit with it:** `ae127db`.

### Profile details removed (2026-09-25)
- **Prime's Average-row tint:** the Average row was tinted with the Totals
  row's percentile, which coloured a late joiner's strong per-match figures
  red. The Average row is now untinted (audit L5).
- **Goalkeeper Def. Contrib. and DC/Game tiles:** always 0, since FPL's
  defensive-contribution points exclude goalkeepers (audit L4).
- **"Completed Gameweeks" / "per Gameweek" in Playing Time:** it counted
  matches, so a double gameweek counted two. Now labelled "Matches" and
  "per Match" (audit M4).
- **Last commit with them:** `ae127db`.

### Historic Average dropping only 0-minute seasons in the fixed-floor sections (replaced 2026-09-25)
- **What it did:** in the player profile (Views and Career History), Player
  Comparison and the Default Dashboard view, Historic Average left out
  window seasons with 0 minutes and counted any season with more
  (`playedWindowAverage`, `dropZeroMinuteSeasons`). The 450-minute floor
  was then compared with the average minutes per counted season, so a
  300-minute cameo season still went into the average.
- **Why it went:** the owner set one definitive rule for sections where the
  user can't set minimum minutes: only seasons of 450+ minutes count, and a
  shorter season's figures don't count at all (`floorWindowAverage`,
  `fixedFloorSeasons`). The Team Profile squad's Historic Average follows
  the same rule for seasons at the club.
- **Last commit with it:** `7da1500`.

### Player Comparison's table colouring small samples (replaced 2026-09-25)
- **What it did:** the table coloured every picked player better/worse
  head-to-head and counted everyone in the Summary's "leads on" tally, so a
  136-minute cameo showed green over a regular on per-game rows. Only the
  radars followed the fixed minutes floor.
- **Why it went:** the owner asked for the table to match the radars: a
  small sample gets no colour or bold, the others are coloured among
  themselves, and the Summary doesn't count him.
- **Last commit with it:** `7da1500`.
