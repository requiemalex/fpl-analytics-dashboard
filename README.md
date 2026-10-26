# Scoutline — 2026/27

Scoutline is a scouting and analytics app for Fantasy Premier League managers, built on the
**live official FPL API**, with **Understat** as a clearly separate second
source in the Explorers, the profiles, the Dashboard and Player Comparison
(see "Understat (second data source)"). No mock
data, no database, no accounts — a small Express proxy and a React UI,
shipped as a Windows desktop app.

**Just want to use it?** Download the installer from
[the latest release](https://github.com/requiemalex/fpl-analytics-dashboard/releases/latest).
It updates itself. Everything below is for developing the app.

Scoutline is independent: not affiliated with or endorsed by the Premier
League. © 2026 the Scoutline developer, all rights reserved — see "Legal" below and
`LICENSE.txt`.

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

Requires Node.js 18.18+ (24 LTS recommended) and internet access to
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
| `npm run understat:sync` | One Understat sync by hand (the daily job's script) — see "Understat (second data source)" |
| `npm run unreleased` / `release-notes` / `released` | What the next release would ship; the release log (`docs/RELEASES.md`); what the latest release shipped — see "To release" |

There is no lint script. TypeScript runs `strict`, with `noUnusedLocals`/
`noUnusedParameters` off.

---

## Architecture

```
FPL API -> Express proxy (server/)       caching, timeouts, retries, stale fallback
        -> api/client.ts                 the only place the client fetches (relative /api/* paths only)
        -> validation/ (Zod)             per-record: a bad record is skipped and counted, never fatal (see below)
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
  understat/           Understat: /api/understat route + the sync pipeline (see "Understat")
  app.ts / index.ts    createApp() (shared with Electron) / dev+prod entry point
client/src/
  api/ validation/ types/ normalize/ metrics/ state/ components/ pages/ styles/ utils/
  extensions/          the slot a second data source plugs into (externalStats.ts)
  understat/           Understat's columns, Data View logic, guide section, colour
electron/main.js       desktop shell — starts the bundled server, answers http://localhost:4317
scripts/club-history/  snapshot, backfill, archive, build-aggregates
scripts/understat/     the daily Understat sync; scripts/alerts/ raises a workflow's alert issue
data/                  club-history ledgers, the frozen vaastav snapshot, data/understat/
```

**Per-record validation** (`validation/schema.ts`, `perRecord`). The record
is the smallest unit that can be dropped without leaving a part-total:
- bootstrap: one player; fixtures: one fixture; historic-bulk: one
  club-season, and one **whole player** — a player with any unreadable
  season joins `skippedPlayerIds` (flagged in the app as a skipped player)
  rather than keeping his other seasons and a part-history average;
- `element-summary`: one player's whole summary — a bad row fails only that
  player's profile, since a gameweek log with a row missing would mislead.

Dropped fixtures and club-seasons are counted (`skippedRecordCounts`, in the
User Guide's data health) and logged; a broken top-level shape is still
fatal. Validation adds no defaults that would invent a figure: a missing
`ep_next` is unknown, not 0 points; a missing `status` is unknown, not
available (Model Predicted then has no figure); an imported squad with no
bank has bank `null`, not £0.0m.

**Display errors** (`<crash_screen>`, `components/ErrorBoundary.tsx`). A
bug while drawing shows "Something went wrong", the reason and a Reload
button instead of a blank window, and is logged (`<app_log>` in the desktop
app). One boundary wraps the pages and overlays (`PageErrorBoundary`, in
`App.tsx`), so the menu keeps working and any change of address (another
page, a profile closed) tries again; another wraps the whole app
(`main.tsx`). Reload drops the address's overlay part, so a profile that
fails to draw doesn't fail again at once. A page whose code file can't be
loaded lands here too.

**Shared vs per-page state.** `AppStateContext` holds only shared,
expensive-to-fetch data: players, teams, fixtures, events, historic profiles
(`historicProfiles`, `allTimeSeasonsByPlayerId`), club seasons. It polls
`bootstrap-static` silently every 10 minutes. Analysis mode and filters are
**per page** — each page keeps its own in `useState` and renders the
controlled `AnalysisModeToggle`/`FiltersBar`; nothing a page does can change
another page. Every Data View picker (Player and Team Explorer, both
profiles, Team Building's Historic/Raw columns) is the one `DataViewPicker`
box: the mode icons, the season(s) the view covers (`dataViewSeasonLabel`:
`2026/27`, or `2022/23–2025/26` for Historic Average) and any minutes
stopwatch, all inside it. The live season (`liveSeason`, from gameweek 1's
deadline) is known from the first load; the other two labels appear once
`historicReferenceSeason` is. Overlays use URL params
too: `?player=<id>` (player profile), `?teamProfile=<id>` (team profile),
`?players=id,id` (Player Comparison selection).

**Fonts** (`<font_families>`, owner's rule 2026-10-21). Three typefaces
only: Archivo for headings (`--font-display`), IBM Plex Sans for body text
(`--font-body`) and JetBrains Mono for figures (`--font-mono`). Each is a
variable font bundled from its `@fontsource-variable` package (imported in
`main.tsx`), so every weight is there, the app draws the same offline and
nothing is fetched from a font service. `tokens.css` names them once;
everything else uses a token or `inherit`. The Electron update window
can't see the tokens, so it has its own copy of Plex Sans's Latin file
(`electron/fonts/`). `styles/fontRule.test.ts` scans every client source
file, `index.html` and the Electron pages, and fails on any other family,
a hard-coded one, a fourth token, another font package or a web-font
link; it also checks the update window's copy still matches the package.

**Pages:** Dashboard (`/`), Player Explorer (`/players`), Team Explorer (`/teams`),
Player Comparison (`/player-comparison`), Team Building (`/team-building`),
User Guide (`/guide`), plus the player and team profile overlays.

## API endpoints and caching

| Endpoint (proxied at the same path under `/api/`) | Used for | Cache |
|---|---|---|
| `bootstrap-static/` | Players, teams, positions, gameweeks | 10 min |
| `fixtures/` | Fixtures and FDR | 10 min |
| `element-summary/{id}/` | One player's gameweek history — fetched lazily when a profile opens | 30 min |
| `historic-bulk` (app's own) | Every player's `history_past` plus this season's club data, built server-side from hundreds of `element-summary` calls | 30 min |
| `entry/{id}/`, `entry/{id}/history/`, `entry/{id}/event/{gw}/picks/`, `entry/{id}/transfers/` | Team Building's FPL team import (read-only, unauthenticated; transfers for purchase prices) | 2 min |
| `understat` (app's own) | Understat season summaries, from this repo's `data/understat/` on GitHub (from disk under `npm run dev`) — never understat.com | 30 min; completed seasons 12 h |
| `understat/profile/{player|club}/{code}/{season}` (app's own) | One player's or club's Understat detail for one season (positions, shots, a player's shots faced while on the pitch, result chances, formations, starting XIs), sliced server-side from `app/profile/<season>.json` | as `understat` |
| `player-seasons/{code}` (app's own) | One player's match rows for every completed season (the profile's past-season Match Log), bundled with the server | none needed |

Outbound requests time out after 8 s and retry twice (capped backoff) on
network errors or 5xx only. Concurrent requests for the same resource share
one upstream call. There's no manual refresh: the app keeps itself current
(below). **Try again**, on the screen shown
when the data can't be loaded (`LoadStateGate`), calls `/api/refresh/*`,
which bypasses the cache (a refresh never piggybacks on a non-refresh
request in flight). If the historic dataset has been loaded this session, it is rebuilt too
(`/api/refresh/historic-bulk`, up to a minute, with the old data on screen
until it arrives): it carries the live season's club figures, including
Current Season's league table in Team Explorer and the Team Profile, which
otherwise stayed as first loaded.

**What refreshes by itself** (a session left open across a match catches up
by itself; hovering the topbar's status dot shows when the data was last
updated):
- `bootstrap-static` and `fixtures/`: the silent 10-minute poll.
- The historic dataset: rebuilt when the poll's fixtures show more finished
  matches than when it was last built, at most once an hour
  (`AUTO_HISTORIC_MIN_GAP_MS`), and only once something has asked for it. A
  build is one request per player, so a match day's kick-off windows cost a
  few builds, not one per match.
- An open player profile's Match Log: reloaded quietly with each poll (the
  proxy's copy, at most 30 minutes old) and fetched afresh by Try again
  (`liveDataVersion`); its rows stay until the new ones arrive.
- Understat: checked hourly. When a newer sync has been published
  (status.json's `generatedAt`), the live season's profile figures already
  loaded are asked for again, once; a completed season's never. The server
  likewise re-reads a cached live-season file read under an older sync
  (`readUnderSync`), so a fresh status never comes with a stale file. The app
  never contacts understat.com — only the daily sync job does — so none of
  this adds requests to Understat itself.
Each TTL runs from when the upstream request **started**, not from when a
slow response arrived (`TtlCache.set`), so the client's 10-minute poll lands
on a fresh `bootstrap-static` every time rather than every other time. The
timeout covers reading the body too; a 200 whose body isn't JSON is an
error, not retried.
If the upstream fails, the server serves its last cached copy and the client
shows a "stale data" banner — never blank, never presented as current. That
covers fixtures and the historic dataset too: either served from a stale
copy gets its own banner naming it (`staleDatasets`).
With no copy at all, a fixtures failure is never silent either: a banner
says upcoming fixtures, Team Building's Expected Points and this season's
table are missing, with Try again (`fixturesUnavailable`). Every load
error is put in plain words by `describeLoadError` (`<plain_errors>`,
`api/errors.ts`): no internal addresses or raw status lines on screen, the
detail in the console (the desktop app's log). Each profile section that
can fail to load has its own Retry.

**The desktop app's copies on disk** (`<disk_copies>`,
`server/src/diskCopies.ts`). The caches live in memory, so a fresh launch
used to have no last copy to fall back on: offline, during FPL's "the game
is being updated" spells, or on a slow connection it opened on "Couldn't
load live FPL data". Now the last good `bootstrap-static`, `fixtures/` and
every Understat file are also kept in the saved-data folder
(`data-cache/`, about 5 MB, written whole then renamed into place), and put
back into the memory cache with the time they were really fetched. The
rules above then apply unchanged: within its TTL a copy is served as cached
(a relaunch soon after downloads none of it; Understat's request went from
~0.9 s to ~0.06 s), past it a live fetch is tried first and the copy is
only the stale fallback, with its banner. A copy over 7 days old is never
used. Each copy is the latest fetched, so never from an earlier season
than the app has already seen. A live-season Understat file put back from
disk has no `readUnderSync` record, so it's read again if it was fetched
before the newest sync. Only the desktop app turns this on (`createApp`'s
`dataCacheDir`); `npm run dev` and `npm start` stay memory-only.
Understat's files are fetched side by side, not one after another.

**The historic bulk build** (`server/src/routes/historicBulk.ts`) fetches
every player's `element-summary` 15 at a time. A cold build takes up to a
minute, so it is demand-driven: a page that needs historic data calls
`requestHistoricData()` on mount, and a player or team profile calls it when
it opens. The Dashboard, the landing page, asks for it on mount, so in
practice it starts as the app opens (cheap when the server has it cached).
A handful of failures are reported as `skippedPlayerIds`. A player answered
only from a stale cached copy counts as failed too: more than half failing
counts as a failed build and falls back to the stale cache, and a build that
used any stale input is served as `stale-cache`, never labelled live.

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
`resolvePlayerStats.ts`). The one exception is the profile's Match Log
heading, which shows a past season's start and end price.
FPL's Form and its set-piece taker orders (Pen Order, FK Order, Corner
Order: 1 = first choice at his club, "—" when not listed) are always live
too: FPL keeps no history of them.

### Analysis modes

Every analysis page has the same three-way toggle, resolved through
`metrics/resolvePlayerStats.ts`. Team Building doesn't use it — see below.

- **Last Completed Season** — that season's actual totals, however much or
  little the player played.
- **Historic Average** — the mean across the last **4 completed seasons**
  the player has, counting only seasons of 855+ minutes, on every page
  (see "Minimum minutes"); a light season over that still counts
  (`<no_survivorship_bias>`, `metrics/historicAnalysis.ts`).
  `MIN_QUALIFYING_SEASON_MINUTES` (900) decides nothing the app shows any
  more (it fed Model Predicted's bonus rate before the points model,
  which reads every season).
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
  (`currentSeasonHasStarted`: a finished fixture, or a finished gameweek
  in case the fixtures request failed — `seasonHasStarted`,
  `normalize/gameweek.ts`), FPL still carries last season's totals in
  those fields, so they're never read: nobody has played yet, so every
  performance field is `null` ("—").

**0 minutes shows "—", never zeros** (`<no_minutes_no_figures>`,
`resolvePlayerStats.ts`; the owner's rule, 2026-10-19): a player with 0
minutes in the selected Data View has every performance figure `null` —
points, minutes, goals, cards, xG, rates — in every Data View, so a player
who hasn't played looks the same whichever is selected. Price, ownership,
status and news stay live. A player who did play keeps a real 0 for a stat
he didn't record.

**Clubs likewise** (`<no_matches_no_figures>`, `computeTeamAggregates` in
`metrics/teamStats.ts`, `resolveUnderstatClub`): a club that hasn't played a
match in the Data View — Current Season before a ball is kicked, or before
its first match — shows "—" for every figure, never a row of zeros.

The reference season rolls forward on its own: it's the most recent
`season_name` anywhere in the pool's `history_past`
(`determineReferenceSeason`). A player with no data for the selected mode
is **kept, not dropped or zeroed**: every performance field comes back
`null` and shows "—" (`<retained_not_omitted>`; check with
`hasDataForMode()`).

### Minimum minutes

**The principle (the owner's rule).** A minutes threshold exists only to
stop tiny samples taking over. The whole of it, as of 2026-10-19:

| | Where | Which rows show | Colour (green/red) |
|---|---|---|---|
| **You set the minimum** | Player Explorer (Mins column filter), Dashboard tiles and graphs you build (Min Minutes), Player Comparison cards in views you build (Min Minutes), Team Building's Add Players (Min minutes) | Yours, in **every** Data View, Current Season included; 0 by default | Fixed floor |
| **You can't** | Player profile, the packaged Starter views (Dashboard and Player Comparison) | Fixed floor: a quarter of the minutes available — 855 for a completed season; in Current Season a quarter of the gameweeks finished so far, never under 90 (`metrics/fixedMinutesFloor.ts`, `<fixed_minutes_floor>`) | Fixed floor |

The floor is a quarter of the minutes available (the owner's rule,
2026-10-24, replacing 90 / 450): 25% of a completed season's 38 matches is
855 minutes; in Current Season it's 25% of the gameweeks FPL has finished
× 90 (`state/seasonProgress.ts`, set on every load), never under one full
match, so it rises as the season goes on (203 after 9 gameweeks, 450
after 20).

Three rules hold everywhere:
- **No data is 0** (`<no_data_is_zero>`, `isUnderMinimum`): a player with no
  minutes for the Data View counts as 0 against any minimum — under it
  once a minimum is set, kept at the default 0.
- **One Historic Average**: only window seasons of **855+ minutes** count
  (`HistoricPlayerProfile.floorWindowAverage`), on every page. A season
  under that (a cameo year, one lost to injury, a 0) is a small sample and
  none of its figures count; a light season of 855+ still counts and pulls
  the average down (`<no_survivorship_bias>`). A player with no such
  season in the window has no Historic Average. The window is always the
  last 4 completed seasons; a short one is never replaced by an older one.
  (Until 2026-10-19 pages where you set minutes counted every season,
  0-minute ones included, so one player had two Historic Averages.)
- **Colours use the fixed floor** (the owner's rule, 2026-10-19): a player
  under the fixed floor for the Data View has no colour and
  isn't in anyone's comparison, even where your own minimum lets his row
  show (see "Comparative colouring"). Clubs have no floor, and nor do
  forward-looking figures (Team Building's two Exp. Pts, Exp. Mins,
  and every colour on its pitch cards — price and ownership
  there are ranked among every player in the position — and the Team
  Profile's Fixture Forecast).

In the fixed-floor sections the floor applies to **every percentile**,
totals as well as per-game rates: the pool is everyone at or above it, and
a player below it is a small sample, with no percentile and no colour. On
Player Comparison's Starter view a small sample isn't drawn on a radar,
gets the amber stopwatch for a marker on an Outputs bar and is never the
bold best — the others are ranked among themselves — and a trend season
under the floor is drawn as the stopwatch instead of a dot. A card you
build does the same at its own Min Minutes, card by card. The Dashboard's
Starter view leaves players under the floor out of **every** player tile
and graph, totals and per-game rates alike (`applyDefaultViewFloor`,
`playersForDashboardItem`); its graphs have no Min Minutes of their own.
Both are decided by the Starter view being the one selected
(`isDefaultViewSelected`), not by a tile's id. Specifically picked players
are never floored.

**The marker** (`<minutes_marker>`, `components/MinutesFloorBadge.tsx`): the
stopwatch is the **one** sign of a minimum-minutes threshold, anywhere — no
other symbol — so you can see where every threshold lands. Its hover text
always names the threshold. An entry's is always amber. A view's is amber
only while something it shows is under the threshold, and grey when
nothing is (`<marker_follows_data>`, the owner's rule, 2026-10-20): "under"
is the entry stopwatch's own test (`isSmallSample`: under the fixed floor
for the Data View, no minutes counting as 0). A Dashboard graph marks its
entries too: a scatter point under the floor is drawn as the amber
stopwatch (`SmallSampleMark`, the same mark as Player Comparison's trend
points) and a bar's stopwatch sits beside its name, each with the reason
in its hover box; the graph's own stopwatch hover counts them. A threshold
inside a figure that marks no entry is grey. Two uses:
- **On a view where a threshold is in force:** the profile's Data View
  toggle, always (`profileFloorNote`); Player Explorer's Mins header when
  a "≥"/"=" filter is set; Team Building's Min minutes label when set;
  each Dashboard player tile or graph with a threshold — the Starter floor
  or its own Min Minutes above 0 (`dashboardItemFloorNote`); each Player
  Comparison card with one (Starter's floor or a card's Min Minutes above
  0). Historic Average's 855-minute seasons alone never mark a view (the
  owner's rule, 2026-10-24): Player Explorer's and Team Building's Data
  View toggles have no stopwatch in any view, and only the players under
  those seasons carry one; a view's note mentions them alongside its own
  threshold;
  the Team Profile's Formations card title (only formations used for 90+ minutes
  are shown, `FORMATION_MIN_MINUTES` — too few for a formation's rates,
  not a club floor, which clubs don't have — so it's always grey).
- **On an entry under one:** a row in Player Explorer, Team Building's Add
  Players and a Dashboard tile (`RowSmallSampleBadge`, no minutes counting
  as 0); the profile's Summary and radar card titles for a small sample
  (FPL's and Understat's Summary alike); an under-floor season on the profile's Points History
  chart; the Match Log heading when the shown season is under the floor;
  the profile's Understat Shot Map · Taken title when he's under
  Understat's own floor for every season shown; a Player Comparison legend
  entry, trend point and Outputs marker.

**Hide** (`<hide_small_samples>`, `HideSmallSamplesButton`): the stopwatch
struck through, in each section that lists players chosen by criteria —
Player Explorer's toolbar, Team Building's Add Players toolbar, and the
header of each Dashboard player tile and graph. On, it leaves out every
entry under the threshold (a tile's top 5 refills with the next players;
a bar chart's top 15 likewise). It shows only when there's something to
leave out, or while it's on. Off by default; the Explorers' and Team
Building's are per page like their other filters (Clear filters turns it
off), a Dashboard item's is kept by item id in its own store. Player
Comparison and the profile have none: those show players the user picked.

Details:
- Default 0 everywhere you can set it (`DEFAULT_MIN_MINUTES`,
  `state/scoutingFilters.ts`). The shared filter is `filterPlayers`
  (`state/useFilteredPlayers.ts`); Team Building's is
  `pickerMeetsMinMinutes`. Until 2026-10-19 both skipped Current Season
  except on the Dashboard.
- Per-game rates (PPG, xG/xA/xGI/xGC/DC/Def. Reward per game, Goals/Game,
  Assists/Game) have **no built-in floor** for the rows where you set the
  minimum: a one-cameo player can top them; raising it is your call.
- Min Minutes takes any whole number as typed; the arrow buttons step by 90.
  In a dialog (Dashboard Add Tile/Add Graph, Player Comparison cards) it is
  a slider in whole matches up to a season's 3,420 (`MinutesSlider`), with
  the exact figure beside it — still typeable, any whole number, "Any" at 0.
- Player Explorer has no Min Minutes control — its Mins column filter does
  that job.
- Other minute figures that aren't sample floors: Model Predicted reads
  every season (a low-minutes season is the signal); the Playing Time
  gauge's tiers (75% / 40% of 90) classify, they don't exclude.

### Club history: team figures are club figures

Every team figure is **what the club did in that season, whoever played for
it** — never a sum over today's squad. Team Explorer, Team Profile and Dashboard
team tiles/graphs all use `computeTeamAggregates()` (`metrics/teamStats.ts`).
League results (position, points, goals for/against) follow the Data View
too.

- **The record:** `data/club-history/<season>/ledger.csv` has one row per
  player per fixture, with the club he played for *in that fixture*.
  Players are keyed by FPL `code`, clubs by team `code`. Team pages
  receive club figures only. The one use of its player rows is the player
  profile's own past-season Match Log (owner's decision, 2026-10-19):
  `build-aggregates.ts` also writes every player's rows for each completed
  season to `completedPlayerMatches.generated.ts` (gzipped JSON in base64,
  about 2.3 MB; `clubHistory/playerMatches.ts`), served one player at a
  time by `/api/player-seasons/{code}`. FPL serves past seasons as totals
  only, so this is the only match-by-match record of them. Expected stats
  are null before 2022/23 and defensive contributions before 2025/26, as
  FPL didn't record them.
- **Per match, then per season:** `aggregateClubSeason` turns each finished
  fixture into a `ClubMatch` per side — the score from the fixture, and
  FPL points, goals, assists, xG, xA, xGI, xGC and DC from that side's
  ledger rows for it (FPL serves xG and the rest per player only, never per
  team). A season's figures are its matches summed, and a match's are its
  players' rows summed (`<season_figures_mostly_complete>`,
  `sumMostlyComplete`, the owner's rule 2026-10-19): an entry or two
  without a stat doesn't blank it — the ones that have it are added up —
  but when more than a quarter lack it (`MAX_MISSING_SHARE`), like
  2022/23's expected stats, which start at GW16, it's `null`, since a sum
  of part of a season would read as the whole season. On today's data no
  club figure falls in between. Every `ClubSeason` carries its `matches`.
- **2016/17–2025/26** were backfilled once from the vaastav community
  archive — the one approved exception to the official-API-only rule,
  because the official API doesn't serve past seasons' match data. It was
  checked against every fixture's real score and a sample of official
  season totals. The raw archive is frozen in `data/vaastav-snapshot/`
  (commit and sha256 pinned in `manifest.json`), so the backfill never
  touches the network. It (and Understat) may also be used to fit and
  prove Model Predicted (the owner's decision, 2026-10-25;
  `client/scripts/pointsModel/`), never as a figure the app shows.
- **2026/27 on:** archived from the official API only, by
  `.github/workflows/club-history-archive.yml` (Tue/Fri 05:00 UTC). It is
  append-only and writes nothing if more than 5% of requests fail. It
  archives every player FPL lists, and FPL keeps a player who leaves
  (status "u") until the summer reset — in 2019/20–2025/26 every player who
  played was still listed at season end — so no appearance is lost. Each
  run re-enables its own schedule, since GitHub switches off a public
  repository's schedules after 60 days without activity (the summer break
  is longer).
- **Aggregation** (`server/src/clubHistory/aggregate.ts`) uses finished
  fixtures only. Completed seasons are pre-built into
  `completedSeasons.generated.ts`; the live season is aggregated inside the
  historic bulk build. Club xGC per match is the opponent's xG in it — the
  opponent's players' xG summed (`<club_xgc_per_match>`) — so one side's xG
  and the other's xGC are always equal.
- **Data View mapping** (`clubSeasonsForMode()`): Historic Average means the
  same 4-season window a player's uses — the last 4 completed seasons,
  never reaching further back — averaged over **the ones the club was in
  the Premier League**, never padded with zeros (in 2026/27 Leeds averages
  2025/26 and 2022/23, Sunderland 2025/26 alone). A season with no record shows "—". Its wins, draws and
  losses are whole numbers that add up to the games played
  (`resultsWithinPlayed`, `<results_within_played>`, the owner's rule):
  rounding each mean alone could show "38 played · 14W 11D 14L". League
  points follow the shared-out results — 3 for each win and 1 for each draw
  the rounding added or took away, any points deduction in the mean kept
  (`<league_points_follow_results>`) — so the line always adds up. League
  position stays a rounded mean, so two clubs can share a position; every
  count is whole (`<whole_numbers>`).
- **Gaps:** club xG/xA/xGI/xGC (and per-player starts) exist from 2023/24;
  club DC from 2025/26. FPL only started tracking starts and expected stats
  at 2022/23 GW16, and the archive carries 0 for earlier gameweeks, so the
  backfill stores those as `null` (`<untracked_expected_rounds>`) and any
  season total with a missing match is `null` — shown "—", never a
  part-season sum. Historic Average then averages those stats over the
  window seasons that have them.
- **End of season:** once the last fixture finishes, the next archive run
  moves the season into `completedSeasons.generated.ts`, then tags the next
  patch version and starts `release.yml` on it, so installed apps get the
  season well before FPL resets the API (usually mid-July). A later FPL
  correction to that season, before the reset, releases again the same way.
  The archive's `release_tag` input runs that release step by hand.
- **Proven behaviours** (`clubHistory/playerRemoval.test.ts`): a mid-season
  mover's matches count for the club he played each for; a player FPL stops
  listing keeps every archived appearance (`mergeArchivedRows`), and
  re-listing him replaces his rows without duplicating them. The app's live
  season is rebuilt from FPL's current list, so it would miss a dropped
  player until he's re-listed — FPL hasn't dropped a player mid-season in
  2019/20–2025/26; it marks leavers unavailable until the summer reset.
- **A skipped player in the live season** (`livePlayerSumsPartial`,
  `metrics/teamStats.ts`): the live season is built from every player's
  match rows, so while the server's historic build couldn't fetch anyone,
  his rows are missing. Results (from fixtures) stay whole; every club
  figure summed from players (FPL points, goals, assists, bonus, the xG
  family, DC), its match log and its points-by-season bar show "—" instead
  of a part-sum, and the team views' Data View note says so. A player the
  app left out only because his history couldn't be read here
  (`unreadablePlayerIds`) doesn't count: the server fetched him, so his
  matches are in its club figures, which stay as they are.

---

## Understat (second data source)

Understat (understat.com) adds shot-level and creative figures FPL doesn't
have: shots, key passes, xGChain, PPDA, open-play/set-piece xG and so on,
in **Player Explorer, Team Explorer, the player and team profiles** (shot
maps, positions, formations, result chances), **the Dashboard and Player
Comparison**. Approved by the owner
on two rules, both built in:

1. **Full separation, removable in one go.** Understat figures appear only in
   their own columns or in a column the user switches to Understat. FPL code
   never imports Understat code; the app reaches it through one slot,
   `client/src/extensions/externalStats.ts`.
2. **Checked continuously.** The daily sync proves it isn't blocked, is
   fresh, and agrees with FPL, or it writes nothing and alerts the owner.

Modelling (the owner's decision, 2026-10-25): Understat may be used to fit
and prove Team Building's Model Predicted, and may feed it while it's a
good source and helps, so long as taking Understat out takes it out of the
model too (through the same slot, with the model falling back to FPL's
data alone). Today it only fits and proves it: its penalty evidence was
tested and gave no gain, so the live model reads FPL's data only
(`<points_model>`).

### How data gets to the app

```
understat.com -> daily GitHub job (scripts/understat/sync.ts)    pairs, links, checks; commits data/understat/
              -> GitHub (raw files of this repo)                  published the moment the job commits
              -> /api/understat (server/src/understat/route.ts)   cached; last good copy if GitHub is down
              -> UnderstatProvider (client/src/understat/)        columns, Data Views, guide section
```

The app never contacts understat.com; installed copies read the committed
files, so new data needs no release. `npm run dev` reads `data/understat/`
from disk instead (`server/src/index.ts`).

**The sync** (`.github/workflows/understat-sync.yml`, daily 06:00 UTC; the
pipeline is `server/src/understat/pipeline/`, dependency-free) runs, in order:

1. **Off-switch:** `data/understat/control.json` `"enabled": false` stops
   everything, and the app then shows no Understat columns at all.
2. **Fetch politely:** one request at a time with a pause, an honest
   User-Agent, about 30–40 requests on a normal day (the live season's
   matches, plus each club's team page for its formations). The live season's new
   matches and the last 7 days' are fetched, to pick up Understat's
   corrections. A season not yet stored downloads 2 per run (about 380
   requests each), and a completed season's formations 2 seasons per run
   (20 team pages each). Every reply is shape-checked; a team page whose
   matches aren't that club's is a format failure. A refusal (HTTP 403/429,
   or a web page where data should be) stops the run at once
   (`UnderstatBlockedError`), as does a changed format.
3. **Pair clubs and fixtures by result, not name** (`pairing.ts`): venue,
   opponent and score. Last season's pairings seed it, and every one is
   re-checked. Any disagreeing score stops the run. The live season pairs
   against FPL's record **fetched that run** (`scripts/club-history/liveLedger.ts`,
   the same fetch the archive uses), not the Tue/Fri archive, so a match is
   checked the day FPL confirms it. If that fetch fails, the run falls back
   to the archive and says so in its warnings.
4. **Link players** (`matcher.ts`), FPL permanent `code` to Understat id, in
   `links.csv`. A link is confirmed only when both of these agree:
   - **appearances:** match by match, minutes within 20, since FPL counts
     stoppage time and Understat doesn't;
   - **names:** accents and nicknames tolerated.

   A club's last unlinked player and its last unlinked Understat player,
   with every appearance agreeing, are linked whatever their names (Bahoya
   is "Jean Négoce" on Understat). Anything else uncertain is **held** and
   shows "—". Saved links are never re-made from scratch, only re-checked;
   one that stops agreeing is **disputed** and hidden, never re-pointed.
   `overrides.csv` takes a manual `pair` or `never`; a `never` also breaks a
   link already saved, on the next run. Tested on 2021/22,
   2022/23 (both graded against vaastav's mapping: 0 disagreements) and
   2026/27: every player linked, none wrong. Matching on names alone got
   2–3% wrong.
5. **Accuracy checks** (`checks.ts`):
   - each match's goals add up from its players;
   - players' xG adds up to their shots' xG;
   - the match and club pages agree on xG;
   - every linked player's goals and own goals are compared with FPL's.
     The two sources may record a goal differently, and that's fine (the
     owner's decision, 2026-10-18): each column shows its own source's
     figure. The known case is Leeds 0–4 Arsenal, 31 Jan 2026, a goal FPL
     gives Madueke and Understat calls a Darlow own goal (2 of 9,386
     player-matches in 2025/26; none in the other seasons). A few
     differences are listed in the run report; more than 0.5% of a
     season's player-matches can only mean broken player links, and stops
     the run;
   - no more than 5% of saved links may change in one run.
6. **Write only if all of that passed.** A failed run writes nothing, so the
   app keeps the last good data. The app's figures count only Understat
   matches paired with a finished FPL fixture, so checked: a result FPL
   hasn't confirmed yet waits for a later run. Formations are Understat's
   own season totals and can't be filtered match by match, so a club's are
   kept only when its team page covers exactly its checked matches;
   otherwise (usually a match FPL hasn't confirmed yet) its last stored
   figures stay, or a completed season's club shows "—", with a warning.

**Alerts** (see "Automatic jobs and alerts"): a GitHub issue that @mentions the
owner, in plain English (what happened, whether app users are affected,
what to do). It is raised:
- straight away for a changed format, a failed check, or anything the run
  lists as needing attention: a disputed link, a player held for 14+ days,
  or Understat 2+ days behind;
- only on the second failure in a row for a refusal or a blip;
- straight away if the run passed but its data couldn't be committed or
  pushed (nothing was published).

While it stays open, its text is refreshed silently (no daily emails). The
next clean run closes it with a "resolved" comment.

**Files** (`data/understat/`): `control.json`, `status.json`, `links.csv`,
`overrides.csv`, `seasons/<season>/` (clubs, matches, team_matches,
appearances, shots, formations: what Understat said), `app/<season>.json`
(the season summary the app reads: totals per FPL player code and per FPL
club code) and `app/profile/<season>.json` (the profiles' per-match
detail, `pipeline/profile.ts`: each linked player's position, minutes,
xG, xA and assists in each match, the FPL club he played for in it, and
his shots; each club's shots, result chances, xG and xGA (its match line),
its players' xA and assists, its formations, and its starting XI in each
match (each starter's Understat position, FPL code when linked, and
Understat name) — every row by FPL fixture id, checked matches only; the
server sends one player or club at a time, never the file; a field a file
written before it was added lacks is sent as null, "—"). From a player's
match rows and the opponents' shots the server works out his **shots
faced** (`shotsFacedOnPitch`, `<shots_faced_on_pitch>` in
`server/src/understat/route.ts`): his club's opponents' shots while he
was on the pitch — a starter from kick-off until his minutes run out (all
of it, stoppage time included, at 90), a substitute from 90 minus his
minutes to the end. Understat counts a match as 90 minutes (a club's
players' minutes add up to 990, or a minute or two over), and shot minutes
and playing time are whole minutes, so a shot around a substitution can be
a minute out. Coverage: 2016/17 on, the same as club history. Every run rebuilds
every season's summary from the stored files, so a new summary figure
reaches all seasons at the next run without re-downloading anything. The
summary's shot detail (`shotDetail`: woodwork, blocked, assisted, and
shots by the action before them: cross, through ball, dribble, rebound)
was added on 2026-10-18; a summary written before then has none, and the
app shows "—" for those figures (never 0) until the next run. Each
player's `facing` (added 2026-10-21) is his club's opponents' shots while
he was on the pitch (`server/src/understat/onPitch.ts`, the same rule as
the profile route's shots faced): shots, on target, by situation, and
whether every one of those opponents' shot lists was complete; a summary
without it leaves that season's Shots Faced uncoloured.

### In the app

- **Colour index** (header text):

  | | Changes with the Data View | Always live |
  |---|---|---|
  | **FPL** | green (`--accent-positive`, `.col-source-fpl`) | muted red (`--col-static`) |
  | **Understat** | violet (`--col-understat`, `client/src/understat/understat.css`) | none exist |
  | **Both (crossover)** | rose (`--col-crossover`, `.col-source-crossover`): the ⇄ icon, and its Columns heading | — |

  A crossover column's header text is green while it shows FPL's figure
  and violet while it shows Understat's. Every list of stats grouped by
  heading uses the same index, with the same heading element
  (`MenuGroupHeading`: the group's icon, then its name, in its source's
  colour): the Explorers' and Team Building's Columns pickers, the
  Dashboard's Statistic and axis pickers (`components/GroupedPicker.tsx`,
  a select-like list, since the browser's own `<select>` can't show icons
  or colour), Player Comparison's card dialog and its Outputs panels.
  Green "FPL ·" groups (FPL-only figures), one rose "FPL & Understat"
  group for every figure with a ⇄ toggle, then violet "Understat ·"
  groups (Understat-only figures). With Understat switched off, the
  crossover figures go back to their FPL groups and the rose heading
  disappears. Team Building's Add Players headers follow the Explorers'
  too: green when the figure follows the Data View, muted red when always
  live (its Predictive Columns are the app's own model, not FPL's figures,
  so they stay plain). A
  small amber dot on an Understat header means its data is out of date or
  unavailable; its hover text says which. "Behind" is judged from FPL's own
  fixtures (`understat/staleness.ts`): a finished match 2+ days old that
  Understat's figures don't include, so it shows even when the sync has
  stopped writing.
- **Source toggle** (`components/SourceToggle.tsx`): a ⇄ icon on a header,
  only where the two sources genuinely differ:
  - players: xG, xA, xGI, their per-game and per-£m rates, Assists, Mins,
    Goals − xG, Assists − xA, xGC and xGC/Game;
  - clubs: xG, xA, xGI, xGC, Assists.

  **A player's Understat xGC — one rule everywhere**
  (`<understat_player_xgc>`, `understat/playerXGC.ts`; the owner's
  decision, 2026-10-21): Understat publishes no expected goals conceded
  per player, so its version of FPL's xGC is the xG of the shots his
  club's opponents took while he was on the pitch (`<shots_faced_on_pitch>`,
  `server/src/understat/onPitch.ts`) — the season summaries' `facing`
  totals, and the same shots as his profile's Shots Faced map, whose xG
  is this figure. Each shot's xG is summed (a club's xGA counts a shot and
  its rebound as one chance, `<club_xg_is_per_chance>`). xGC/Game is per
  game on Understat's minutes. Unknown ("—", never 0) for a summary
  written before shots faced were added, or where one of those opponents'
  shot lists is short. Fewer is better and, like FPL's xGC, the total is
  coloured on xGC per game (`rankBy`), or a bench player would look best.
  The Explorers, Dashboard tiles and graphs, Player Comparison cards and
  the player Match Log all switch to this figure; Player Comparison's
  trend graphs have no FPL xGC to switch.

  It starts on FPL each visit. The whole column switches source
  (`<one_source_per_figure>`): value, rate, sort, filter, tint and CSV
  export, so no figure ever mixes the two. Switching clears that column's
  filter; so does Understat going away mid-session, when the column falls
  back to FPL. Goals, own goals, scores and results almost always agree in
  the two sources, so they have no toggle and stay FPL only. Goals − xG
  and Assists − xA compare each source with itself: FPL's goals against
  FPL's xG, or (switched) Understat's against Understat's. Understat's
  goal-based figures (Goals − xG, NP Goals, goals by situation) use
  Understat's goal count, which can differ from FPL's where the sources
  record a goal differently (see step 5 of the sync above). Player
  Comparison leaves +/- figures out: its bars and radar axes start at 0.
- **Data Views** (`client/src/understat/resolve.ts`), with the same rules
  as FPL figures:
  - **Players:** a player's window is his FPL seasons (Premier League only).
    A season FPL says he played 0 minutes in is "—", like his FPL figures
    (`<no_minutes_no_figures>`), and so is one he played in with no
    Understat row (held link). Historic Average is the one Historic
    Average: only window seasons of 855+ FPL minutes count
    (`floorSeasonsInWindow`), the same seasons as the FPL figure beside it.
  - **Clubs:** clubs use `clubSeasonsForMode`.
  - **Rates:** per game is from **Understat's own minutes**
    (`<us_minutes_for_us_rates>`). Ratios (xG/Shot, PPDA) are built from
    totals.
- **Club xG is per chance** (`<club_xg_is_per_chance>`): Understat counts a
  shot and its rebound as one chance, so club xG can be lower than its
  players' xG added up. xG/Shot and the situation split use individual
  shots.
- Player analysis covers today's FPL players only. Club figures count
  everyone who played for the club in each match, from Understat's own
  line-ups, with no player links needed.
- **Profiles** (`client/src/understat/profiles.tsx`, through the slot's
  `profiles`): an "Understat · Views" section (violet heading) after the
  profile's "FPL · Views", following the profile's Data View over the
  seasons the FPL side names (`ProfileView`: a player's Historic Average
  counts only window seasons of 855+ FPL minutes, the profile's fixed
  floor; a club's only seasons it was in the league). A season Understat
  has nothing for (no link, didn't play) is left out, never counted as 0.
  A profile asking for its Understat details also starts the season
  summaries loading, so its Summary and colours work wherever it's
  opened from, not only after a page that uses Understat has loaded them.
  - **Summary** (`summary.ts`, on the shared `ProfileSummary` card, first
    in the section): the figures that matter most for his position, from
    the season summaries over the view's seasons summed as a Data View's
    (`sumPlayerSeasons`), each worked out exactly as the Explorer column of
    the same name (`summary.test.ts` checks they agree). Groups of 6 are
    three totals over the same three per game: **Defensive** (xGC, Shots
    Faced, On Target Faced and each per game: his club's opponents' shots
    while he was on the pitch, `<understat_player_xgc>`), **Offensive**
    (xG, xA, xGI and each per game), **Shooting** (Shots, NPxG, NP Goals;
    Shots, NPxG per game; NPxG/Shot), **Creating** (Key Passes, xGChain,
    xGBuildup and each per game); and **Actual vs Expected** (Goals − xG,
    Assists − xA, NP Goals − NPxG). By position (the choice made on the
    owner's request, 2026-10-24): a goalkeeper Defensive only (all
    Understat has on a keeper); a defender Defensive and Offensive, then
    Actual vs Expected beside Creating's per-game half; a midfielder
    Offensive and Creating, then Actual vs Expected beside Shooting's
    per-game half; a forward Offensive and Shooting, then Actual vs
    Expected beside Creating's per-game half. Coloured within his position
    (`playerSummaryRanks`): each other player's figure from his own rows
    for the view's seasons he reaches Understat's floor in, summed the same
    way; fewer is better for the shots-faced figures, whose totals rank per
    game (as xGC's do); under the floor, no colour and the amber stopwatch.
    With nothing from Understat for the view at all, the Summary says so
    and no shot-map card repeats it.
  - **Shot Maps** (`ShotMap.tsx`): with its figures in a panel beside it
    (under it on narrow screens), in the same graph-and-figures layout as
    the Formations card (`.shot-card-body`): the graph fills its column up
    to 760px, the panel always the same gap from it (64px), the pair
    centred in the card. The map is a `<figure>`, whose browser margin is
    cleared so it stays in its column. The zones' text scales with the map, so the cap keeps it
    near the app's own text sizes. Headed by the season or "Per
    season · n seasons". Which maps: a midfielder or forward gets **Shot
    Map · Taken**; a defender gets Taken and **Shot Map · Faced** (his
    club's opponents' shots while he was on the pitch, `<shots_faced_on_pitch>`
    above); a goalkeeper gets Faced only (the owner's decision,
    2026-10-21); a club gets Taken and Faced (its opponents' shots in its
    matches). One **zone map** for all of them, one season or several:
    the last 35 m (`SHOT_MAP_DEPTH`, over 99% of shots) cut into zones on
    the pitch's markings (`shotZones`): the six-yard box, the middle of the
    box (the six-yard box's width, out to 16.5 m), the box's left and right,
    wide of the box either side, the edge of the box (16.5–25 m, the box's
    width), long range (25–35 m) and outside the box left and right; shots
    from further out are a band of their own under the 35 m line, drawn
    only when there are some, so every shot is in one zone and the shares
    add up to 100%. Each zone shows its share of the shots ("<1%" for one
    that rounds to nothing), how many (a season, in a Historic Average) and
    their average xG, and is shaded by its share (one violet hue, the
    busiest darkest, capped at 60% so its text stays readable); hover adds
    its goals. A zone with none shows nothing. Figures: shots, on target
    (scored or saved), On Target % (of the shots), goals, Conversion %
    (goals per shot), xG, NPxG, xG/shot, Penalties Taken and Penalty Goals
    (taken and scored, or faced and conceded) — counts per season when
    averaged, the rates from the totals. Own goals are nobody's shots.
    Every figure is coloured (`understat/comparisons.ts`, "Comparative
    colouring"), the rates ranked as rates: a player's within his position
    among every other player's Understat figures for the same season(s), a
    club's among every club's — more penalties taken and scored better,
    shots faced fewer-is-better. A defender's or goalkeeper's Shots Faced
    are ranked within his position on the season summaries' `facing`
    totals (`playerFacedRanks`), fewer better: a count per 90 minutes on
    the pitch, so more minutes isn't held against him (the figure shown is
    still the total, as the FPL Match Log colours xGC Totals by xGC per
    game), a share as it is. Others need a complete shot list; under the
    floor he gets the amber stopwatch and no colour. A season from a
    profile file written before shots faced were added says "Not available
    for this view yet (—)".
- **Formations** (`client/src/understat/formations.tsx`, the slot's
  `clubFormations`): the Team Profile's own "Understat · Formations"
  section after its Views — the live season only, whatever the Data View
  (the owner's decision, 2026-10-21: a club's set-up now, not its past
  ones; past seasons would also bring in players no longer in FPL). The
  formations used for 90+ minutes (`FORMATION_MIN_MINUTES`), the 3
  most-used at most (`FORMATIONS_SHOWN`), one at a time with arrows in the
  card title stepping round them both ways. The card title has the grey
  stopwatch (`<minutes_marker>`: the 90-minute threshold is in force,
  nothing shown is under it). Each is drawn on Team Building's pitch (the
  `.pitch` turf and the shared `PitchMarkings`), attack at the top, its
  lines from forwards to goalkeeper. Every slot is Team Building's pitch
  card, at its sizes and spacing: the club's kit (`<club_kit>`,
  `components/Kit.tsx`; the goalkeeper's colours swapped, a neutral shirt
  for a club FPL no longer lists), the slot's code at the shirt's top left
  in its FPL position's colour (`positionGroupOf`: GK keeper, D* defence,
  DM*/M*/AM* midfield with the wing-backs, FW* forwards), and the dark nameplate
  naming who started there and how many times (3 names, then "+n more"
  with the rest on hover); beside it, as the shot maps have theirs: Time (share of the
  club's minutes), Minutes, Starts, xG/90, xGA/90, Scored, Conceded.
  xG/90, xGA/90, Scored and Conceded are coloured (`formationRank`): the
  figure per 90 minutes in the formation against every other club's per-90
  figure for the whole season (its total ÷ matches played) — more xG and
  goals better, less xGA and fewer conceded better. Time, Minutes and
  Starts say how much it was used, so like games played they aren't
  coloured. **Who started where**
  (`understat/lineups.ts`): Understat gives each starter his slot in the
  formation the club started in, from a fixed set of templates (26
  distinct XIs over 10 seasons), so the XI's slots name the formation, as
  Understat names them — the slots in each line counted and joined
  (defence, holding midfield, midfield with the wing-backs, attacking
  midfield, forwards, the forwards always named: 4-2-4-0). Checked: 7,734
  of 7,740 club-matches (2016/17–2025/26) and all 140 so far this season
  name a formation in that club's own Understat list. A formation is drawn
  from the XI the club most often started it with; a starter in a slot
  that XI hasn't (one name, two XIs: wing-backs or wide midfielders) is
  counted in the nearest slot in his line, same side first. Identical
  slots (two centre-backs) share their starters out in turn, most starts
  first — Understat doesn't say which one is on the left. A name in FPL's
  player list today is a link: it opens his profile and closes the team's
  (which would sit over it). Anyone else — no longer in FPL, or never
  linked to an FPL player — is greyed out with his Understat name, not a
  link, and drops out as the season goes on. A formation the club never
  started in (used only after a change during a match) says so, its
  figures still beside it. Starts count the XI a club kicked off with;
  Time and the rates are Understat's minutes in the formation, changes
  during matches included.
  - **Match Log columns** (violet headers; the log's heading turns rose,
    "FPL & Understat · Match Log"): a player's **Position** in each match
    (Understat's code, spelled out on hover; "Sub" off the bench), and a
    club's **Win/Draw/Loss Chance**: Understat's chances of each result
    from the shots both sides took, worked out *after* the match. No Totals
    by design, so that cell is blank ("—" means missing data). The Average (the mean chance over the listed matches Understat
    has; see below) is coloured against every club's mean that season
    (`league` in the club slice, from the season's profile file),
    ranked like the log's FPL columns ("Comparative colouring"; its own
    entry in `league` left out): more win chance better,
    more loss chance worse, draw chance uncoloured.
  - **Match Log ⇄ toggles** (`playerMatchAlternates`,
    `clubMatchAlternates`): on the figures both sources have — a player's
    Minutes, Assists, xG, xA, xGI, xGC (`<understat_player_xgc>`: each
    match's xG faced while he was on, 0 in one where his club faced no
    shot then); a club's Assists, xG, xA, xGI, xGC (its xG against). A
    player's xGC, fewer better, is coloured per game: its Totals on xGC per
    game (Understat's minutes), its Average against each other's total ÷
    his matches. Switched, the whole column is Understat's: each match,
    Totals and Average, their colours ranked on Understat's own season
    figures (`understat/comparisons.ts`: a player within his position at
    Understat's own minutes against the fixed floor, per-match against each other's total ÷
    his club's matches — 38 in a completed season; a club among every
    club) — `<one_source_per_figure>`. A match FPL
    says the player didn't play is "—" in its row, like his FPL figures
    (`<no_minutes_no_figures>`), and counts in the Average as a match with
    nothing in it; one he played that Understat lacks, or any before its
    figures load, is "—" and left out. Starts on FPL for each profile
    opened.
  - **Matches Understat lacks in Totals and Average:** a live match
    reaches Understat's files only on the first daily sync after FPL marks
    the fixture `finished` (bonus confirmed), so the latest match often
    has FPL figures but no Understat ones yet. Understat's Totals and
    Average (both the toggled columns and the Win/Draw/Loss Average) are
    worked out over the listed matches it has a figure for, leaving the
    rest out rather than counting them as 0 (a provable 0 above still
    counts); the cell's hover says "From the N of M matches Understat has
    a figure for". "—" only when it has none of them. The same rule as
    every Match Log (`<partial_totals>`, "Totals rows").
- **Dashboard and Player Comparison** work exactly as the Explorers do
  (`<same_toggle_everywhere>`, `extensions/externalStats.ts`): a tile,
  graph or comparison card shows the Explorers' columns from the same slot
  (`playerColumns`/`teamColumns` for the item's own Data View), so the same
  Data View rules apply.
  - **Pickers** are grouped as the Columns picker is: green "FPL ·" groups
    of FPL-only figures, one rose "FPL & Understat" group of the figures
    both have (players: xG, xA, xGI and their per-game and per-£m rates,
    Assists, Minutes, Goals − xG, Assists − xA, xGC, xGC/Game; clubs: xG, xA, xGI, xGC,
    Assists), then violet "Understat ·" groups of Understat's own. With
    Understat switched off only the FPL groups show. The Dashboard's
    Statistic and axis lists are `GroupedPicker`s (`metricPickerGroups`);
    Player Comparison's dialog uses its chip headings
    (`CrossoverGroupHeading`), holding only
    comparable figures (no +/− figures, so not NP Goals − NPxG, now flagged
    `signed`). A new pick starts in its natural order (Blocked Shots lowest
    first).
  - **Saved keys** (`<external_metric_key>`): a figure both sources have is
    saved by its FPL key, exactly as before; only Understat's own figures
    are saved as `"understat:<column key>"` (`understat:us.shots`).
  - **The ⇄ toggle** (`SourceToggle`, the Explorers' one) sits on each
    figure both sources have, wherever that figure has its own name in the
    page: a tile's header (its one figure), an Outputs row beside its name.
    Where the names are drawn inside the chart — a graph's axes, a radar's
    axes, a trend graph's y axis — one ⇄ in the card's header switches every
    such figure on it together. As in the Explorers it starts on FPL each
    visit (per page, by item id; never saved) and switches the whole figure
    — values, ranking, colour, scale, bold — so no figure mixes sources
    (`<one_source_per_figure>`); with Understat gone it falls back to FPL.
  - **On screen:** every card's header starts with its source mark
    (<card_source_mark>, below), with the amber stale dot beside it while
    any figure shown is Understat's and its data is out of date. A
    switched Outputs row keeps its name and place, its name violet (as a
    switched Explorer header is); Understat's own rows come after FPL's
    under violet "Understat ·" headings. No figure is ever labelled
    "(Understat)" in the app (owner's decision, 2026-10-24): the card's
    icon and title colour say where its figures come from, and an
    Understat figure's name is violet on a graph's axis, a radar's axis,
    a trend graph's axis and their hover boxes (`source-coloured`). Only a
    CSV export's headers spell it out (`externalLabel`), having no colour.
  - **The same rules as FPL figures:** comparative colours rank within
    position among the item's whole pool (`<comparative_colouring>`); rows
    are chosen and floored on FPL minutes, like the Explorers' Mins filter
    ("Minimum minutes": Starter floor, Min Minutes, Hide, the stopwatch);
    a player Understat has no figure for is left out of a tile and has no
    marker or point, never a 0. The Dashboard's Starter view has
    Understat's own items after the FPL ones (<source_starter_items>,
    below); Player Comparison's Starter has none, but its shared figures
    have the ⇄ like any other.
  - **Starter items** (<source_starter_items>, `dashboardStarter` in the
    slot, `understat/dashboardStarter.ts`): the source's own tiles and
    graphs in the Dashboard's Starter view, after the packaged FPL ones
    (`withSourceStarterItems`, Dashboard.tsx), with the same rules (Last
    Season, no criteria, the fixed floor). They live in the Understat
    folder, so switching it off or removing it leaves the FPL Starter
    alone, with nothing marked unavailable. Players: NPxGI/Game,
    Shots/Game, Key Passes/Game, Penalties Taken, NP Goals − NPxG lowest
    first (finishing below the chances); graphs Shots/Game vs xG/Shot and
    Price vs NPxGI/Game (FPL & Understat). Clubs: xGD, Pts − xPts, Shots
    Against (fewest first), Set-Piece xG; graph NPxG vs NPxGA.
  - **Source mark and title** (<card_source_mark>, `SourceMark`,
    `cardSource`/`CardTitle` in `components/SourceToggle.tsx`): every
    Dashboard tile and graph and Player Comparison card says where its
    figures come from, twice:
    - **The mark**, the first icon in its header (then the stopwatch, if
      any, then the Data View), one of three, as the pickers group the
      figures: FPL's football (green, `FplSourceIcon`) when every figure is
      FPL's own; the ⇄ (rose) when it has a figure both sources have, or
      figures from both; Understat's goal frame (violet) when every figure
      is Understat's own. Where the card has its own ⇄ toggle (tile,
      graph, radar, trend graph) the toggle is the mark; an Outputs panel's
      rows have their own toggles, so its ⇄ mark isn't a button. Hover
      names each source's figures and those in both.
    - **The title's colour** says which source is showing now: green (`col-source-fpl`) all
      FPL, the source's colour all its own, rose (`col-source-crossover`)
      both; a ⇄ figure counts as the source it's showing, as a switched
      Explorer header turns violet. Its hover names each source's figures
      ("FPL's figures: Price · Understat's figures: NPxGI/Game"). Source
      only, as on the profiles' section headings: a card doesn't use the
      Explorers' muted red for always-live figures.
  - **Trend graphs** (`playerTrends`, `understat/trends.ts`): Understat's
    versions of xG, xA, xGI, their per-game rates, Assists and Minutes (the
    graph's ⇄), and its own Shots, NPxG, xG/Shot, Key Passes, NPxGI,
    xGChain and xGBuildup, season by season over the player's FPL seasons
    (`buildSeasonTrend`'s `seasonValue`), per-game on Understat's minutes;
    a season Understat has no row for is a gap. The small-sample mark stays
    on FPL minutes.
  - Loaded once an item on the page uses one of Understat's own figures, or
    a ⇄ is switched. While loading, its cards say "Loading Understat
    data…"; if it can't be loaded, "Understat data couldn't be loaded."
    With Understat switched off, an item built on its own figures says so
    ("…uses figures from a second data source that's switched off") and
    can still be removed; an Outputs panel with FPL rows too keeps those.
- Its User Guide section and metric definitions live in
  `client/src/understat/guide.tsx`, shown through the slot.

### Removing it

- **Switch off:** set `"enabled": false` in `data/understat/control.json`
  and commit. Every installed app hides all Understat columns at its next
  refresh (within about an hour), and the sync stops fetching. Switching it
  back on reaches running apps the same way. No release is needed.
- **Remove for good:**
  1. Delete `client/src/understat/`, `server/src/understat/`,
     `scripts/understat/`, `data/understat/` and
     `.github/workflows/understat-sync.yml`.
  2. Delete the two marked connection lines in `client/src/App.tsx` (import
     and `<UnderstatProvider>`) and `server/src/app.ts` (import and
     `app.use`), the `understatLocalDir` lines in `server/src/index.ts`,
     the `understat:sync` script, and `--watch understat-sync.yml:2` in
     `.github/workflows/watchdog.yml`.
  3. Record it in `docs/HISTORY.md`.

  The generic slot (`extensions/externalStats.ts`, `SourceToggle`) can stay
  or go; with nothing mounted, it does nothing.
  `client/src/understat/separation.test.ts` proves nothing else depends on
  it. It scans code and stylesheets (`.ts`, `.tsx`, `.js`, `.css`…) for any
  way of loading a module from an `understat` folder: `import … from`,
  `export … from`, a side-effect `import`, CSS `@import`, `import(…)` and
  `require(…)` (`understat/separationDetector.ts`).

### Not included yet

- **Understat's own shot-zone figures** (six-yard box / box / outside):
  Understat publishes them per player only on individual player pages, and
  they can't be reproduced exactly from shot coordinates (tested: 6 of
  about 700 shots differ), so they wait for an upgrade that fetches those
  pages. The shot maps' zones are the app's own, worked out from each
  shot's coordinates on the pitch markings (`shotZones`), so a shot right
  on a line can sit in the zone next to the one Understat's count has it in.
- Match xG timelines: later.
- **Pre-match forecasts:** Understat's win/draw/loss figures exist only for
  matches already played (worked out from the shots), so there's nothing
  to show for upcoming fixtures.
- **Figures per formation per match:** Understat publishes each
  formation's figures as season totals only. The formation a club
  *started* each match in is named from its XI's slots (Formations,
  above); a change during a match isn't in the line-ups.
- Pass maps, average positions, sprints: not on Understat at all (it has
  shots only).

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
PPG                 = totalPoints / estimatedGames   (0 minutes: "—", like every figure — <no_minutes_no_figures>)
Points / £m         = totalPoints / price;   xG, xA, xGI / £m likewise
Minutes / Point     = minutes / totalPoints; Minutes / Goal, / Assist likewise
Goals − xG, Assists − xA, (Goals + Assists) − xGI
```

Known limit: ten 1-minute cameos look like one 10-minute cameo, because
there is no bulk per-gameweek data for the whole pool. Model Predicted's
rates are true per-90 rates, internal to it (`<points_model>`): it scales a
rate by the minutes expected in one upcoming match.

### Fixture Forecast

`<fixture_forecast>`, `metrics/fixtureForecast.ts`: the Team Profile's
forecast of each upcoming fixture, from FPL's own club match records only
(club history: every Premier League match since 2016/17, and this season's
so far, `clubSeasonsAsShown`, so a partial live season's xG is left out).
A fitted model — unlike Team Building's disclosed heuristics — whose three
settings were chosen by backtesting.

1. **Ratings.** Every club has an attack rating (chances created) and a
   defence rating (chances allowed), relative to the league average (1.0).
   A match's chances are 0.8 × its xG + 0.2 × its goals where FPL has xG
   (from part-way through 2022/23), its goals before that. Recent matches
   count most: a match's weight halves every 19 gameweeks back, across
   seasons (matches weighted under 1% are left out).
2. **Opposition.** Each club's chances are divided by what an average side
   would have managed against the same opponents at the same venue (home
   and away league averages), repeated until the ratings settle (25
   rounds), the average kept at 1.0 over the matches.
3. **Starting point.** Every rating begins from 4 matches' worth of the
   league average — or, for a club not in the Premier League the season
   before, of where promoted clubs have typically finished their first
   season (their goals for and against per match against the league
   average, every promotion in a completed season on record:
   `promotedStart`). A club with few recent matches isn't judged on a
   handful.
4. **A fixture.** Home goals expected = league average home goals × home
   attack × away defence; away goals the same the other way round (the
   averages over the same weighted matches). Goals are taken as Poisson:
   Clean Sheet = e^−(goals expected against), To Score = 1 − e^−(goals
   expected for), and Win/Draw/Loss sum the scorelines up to 10 goals each.

```
chances   = 0.8 × xG + 0.2 × goals   (goals alone before xG)
weight    = 0.5 ^ (gameweeks ago / 19)
attack_c  = (Σ weight × chances for     + 4 × avg × start_c) / (Σ weight × venue avg × opponent defence + 4 × avg)
defence_c = (Σ weight × chances against + 4 × avg × start_c) / (Σ weight × venue avg × opponent attack  + 4 × avg)
λ_home    = home goals avg × attack_home × defence_away;   λ_away = away goals avg × attack_away × defence_home
```

**Backtest** (2026-10-24): every match of 2023/24, 2024/25 and 2025/26
(2,280 club-matches) forecast from only the matches before its gameweek.
Clean Sheet Brier score 0.168 (lower is better) against 0.180 for the
league's home and away clean-sheet rates over the three seasons before
(To Score the same, as one side's clean sheet is the other not scoring);
Win/Draw/Loss 0.579 against 0.650; goals forecast 1.494 a side against
1.494 scored. Clean sheets are well calibrated: forecasts of 20–30% came
true 24.9% of the time (25% forecast), 30–40% 32.9% (34%), 10–20% 13.0%
(16%). Settings: xG weight 0.7–0.85, half-life 16–19 gameweeks and a 4-match
start did best and about equally (0, 0.5 and 1 xG weight, half-lives 8–76
and 2–12 matches were tried); goals alone (no xG) and a season-long
half-life were clearly worse. **Known limit:** goals are modelled as
independent, so draws come out a little low (22.6% forecast, 24.5%
happened) and wins a little high (38.7%, 37.8%). Nothing knows about
injuries, suspensions or rotation, only the matches.

Team Building's Model Predicted reads the same ratings for every match's
goals expected each way (`<points_model>`).

### Other methodology

- **xGI validation** (`metrics/validation.ts`) recomputes xG + xA against
  the API's xGI (tolerance 0.01) on every load. Discrepancies are logged and
  shown in the User Guide.
- **Percentiles** (`metrics/percentiles.ts`) are within-position, against
  the full mode-resolved pool at or above the fixed minutes floor — never a
  filtered view. The player profile's and Player Comparison's Starter
  radars use the fixed floor, so a player under it has none (see "Minimum
  minutes"); a Player Comparison radar the user builds uses its own Min
  Minutes instead.
  Lower-is-better stats (xGC, Min/Goal) are flipped. A lower-is-better
  **total** that grows with minutes ranks on its rate instead
  (`PlayerColumn.rankBy`, `rankValue()`): a player's total xGC is ranked,
  tinted and marked "best" on xGC per game, everywhere (Explorer and Team
  Building tints, Player Comparison percentiles and Outputs, profile tiles
  and Totals row). Ranked on itself, the fewer minutes a defender played
  the better he looked. They drive the
  profile's radars (`metrics/radarStats.ts`, position-specific axes; DEF/MID
  get separate Defence and Offence radars) and stat-tile tints. A radar's
  hover box shows the figure as its Explorer column does in the Data View
  (`<whole_numbers>`), as do the profile's Summary tiles.
- **Defensive Reward/Game** (`metrics/defensiveReward.ts`) = clean-sheet
  points/game (GKP/DEF 4, MID 1, FWD 0) + **total** bonus/game. The API has
  no breakdown of bonus by defensive action, so it's a proxy, and the
  dictionary says so.
- **Playing Time** (`metrics/rotationIndicators.ts`) = this season's average
  minutes per match in the player's log (0-minute matches included; a
  double gameweek is two matches). ≥75% of 90 is a starter, 40–74%
  rotation, <40% fringe.
- **Comparative colouring** (the owner's rule, 2026-10-19;
  `metrics/comparativeColour.ts`, `<comparative_colouring>`): one rule for
  green and red wherever a figure is shown — tables, Dashboard tiles,
  Team Building's pitch cards, profile tiles, Match Log and Points History
  rows, Understat's columns and shot figures:
  - a **player's** figure is ranked within his position (today's) among
    the whole pool for that view's Data View — never only the rows a
    filter, search, minimum minutes or picked-player list leaves on screen,
    so a colour doesn't change as a table is narrowed and matches the
    profile's;
  - a **club's** figure is ranked among every club with one (all 20);
    upcoming fixture difficulty is a club figure wherever it's shown;
  - a player under the **fixed floor** for the Data View (a quarter of
    the minutes available, see "Minimum minutes") has no colour and isn't in anyone's
    pool — on every page, including those where the user sets minimum
    minutes for the rows themselves (see "Minimum minutes"). Understat
    figures check Understat's own minutes. Clubs have no floor, and nor
    do forward-looking figures: Team Building's two Exp. Pts, Minutes
    Reliability and every colour on its pitch cards (M20, 2026-10-19),
    and the Team Profile's Fixture Forecast;
  - the rank is a percentile (half of ties below) flipped for
    lower-is-better figures; `percentileTint` (`utils/colorScale.ts`)
    turns it into the one scale: no colour at the 50th, stronger green
    above, stronger red below. A pool of fewer than two has no colour.
  - More is better for goals, assists, wins, points and the like,
    over-performance included (Goals − xG, Assists − xA, Pts − xPts).
    **Price and ownership are coloured, less is better** (cost efficiency,
    differential points). Never coloured (`noColour`, `colourDirection`):
    games played, draws and style statistics (Set-Piece xG %, Assisted
    Shots %, PPDA, Opp. PPDA). A player's own shots blocked count as worse.
  - Player Comparison's per-player colours and the Dashboard's charts use
    neither green nor red, so nothing reads as better or worse by its
    series colour.
  - **One switch turns it all off** (`<comparative_colour_switch>`,
    `state/comparativeColour.ts`): the palette button in the top bar,
    right of the notepad's. Off (struck through), `percentileTint` and
    `percentileColour` give no colour, so every comparative colour in the
    app goes at once; ranks, their hover text and every other colour
    (sources, positions, results, form arrows) stay. On by default, one
    app-wide setting kept across restarts. `App` re-renders the whole
    tree when it changes; a `React.memo` component that paints (Player
    Explorer's and Team Building's rows) calls `useComparativeColour()`
    itself, or it would keep its old colours. Any new colour by rank goes
    through those two functions, never its own.
- **Hover text** (the owner's pass, 2026-10-20; `components/hoverText.ts`,
  `<hover_text>`): a hover says what something is for *this* player, club
  or match, in one line. A column header gives its statistic in plain words
  (`PLAYER_STAT_HINTS`, `CLUB_STAT_HINTS`, the Understat maps), plus "Lower
  is better" or "Today's figure" where true; how to sort, drag and resize is
  in the User Guide only. A coloured cell, profile tile or pitch-card figure
  says its colour's rank in words: "Top 8% of midfielders" (40th–60th
  percentile: "Around the middle"), or for a club "3rd of 20 clubs" (a
  tie's middle place; not on League Position, which already is one). A
  fixture chip names the opponent, home or away, and FPL's difficulty. All
  are short strings from figures the page already has; the rank phrases
  are cached, so a table's cells share a few hundred strings.
- **Historic data caveats:** `history_past` carries FPL's placeholder 0 /
  `"0.00"` for starts and the xG family (xG, xA, xGI, xGC) before 2022/23
  (Pickford 2021/22: 3,150 minutes, 0 starts), so those are `null` ("—")
  before then (`STARTS_AND_EXPECTED_TRACKING_START_YEAR`). Defensive
  contribution is real from 2024/25
  (`DEFENSIVE_CONTRIBUTION_TRACKING_START_YEAR`, `null` before). DC is a
  count of actions, not points: for defenders clearances, blocks,
  interceptions and tackles; for midfielders and forwards recoveries too.
  DC's parts (Tackles, CBI, Recoveries) are tracked a season later, from
  2025/26 (`DC_PARTS_TRACKING_START_YEAR`; Gabriel 2024/25: DC 159 but
  0 / 0 / 0), so they're `null` before then and a Historic Average uses
  only the tracked seasons. Saves, penalties saved, cards and ICT's three
  parts (Influence, Creativity, Threat) are in `history_past` for every
  season (Pickford: 89–135 saves a season since 2016/17; live API checked
  2026-10-18), so they follow every Data View.
- **Totals rows** (the owner's rule, 2026-10-19; `metrics/partialTotals.ts`,
  `<partial_totals>`): one rule for every Totals and Average row under a
  list of matches — the player and club Match Logs, live and past seasons,
  FPL and Understat columns, and the past-season comparison pools
  (`seasonTotals`, server). A match with no figure for a column is left
  out: Totals adds up the matches that have one, Average divides by those
  same matches, and when that's only some of the listed matches the cell
  says so on hover ("From the N of M matches that have a figure"; for
  Understat, "…Understat has a figure for"). "—" only when none has one.
  In a player's log a match he didn't play in shows "—" for every figure
  in its row (`<no_minutes_no_figures>`; its opponent and result stay),
  and counts in the Average as a match with nothing in it — the Average
  is per match listed, the same basis as the averages it's coloured
  against — unless no match he played has the figure (a stat FPL didn't
  record that season), which is "—". A cell with no total by design (Understat's
  Win/Draw/Loss Chance Totals, Position) is blank: "—" always means
  missing data. (A club's *season* figures — Team Explorer, the Team
  Profile's Summary — follow their own rule, `<season_figures_mostly_complete>` in "Club
  history": totalled unless more than a quarter of matches lack the stat.)
- **Figures a position can't have** (`<position_only_figures>`,
  `PlayerColumn.positions`, `columnApplies`, `cellText`): FPL never
  credits a goalkeeper with a defensive contribution (checked: no
  goalkeeper match in 2025/26 has DC above 0, though they do have tackles,
  CBI and recoveries), and only a goalkeeper makes saves. So DC and
  DC/Game are goalkeeper-impossible, and Saves, Saves/Game and Pens Saved
  outfield-impossible: the figure is `null` for those positions (out of
  sorts, filters, colours, tiles, graphs and Player Comparison) and the
  cell is **blank** — not "—" (missing data) and never 0. The profile
  leaves those columns and tiles out altogether for the one player shown.
- **Whole numbers** (`<whole_numbers>`, the owner's rule, 2026-10-26;
  `columnForMode`, `teamColumnForMode`, `countDecimals`): figures are
  whole wherever a whole number still tells players or clubs apart. Every
  count is whole in every Data View, its Historic Average (a mean of
  seasons) included — 141.8 points a season shows "142" — and so are
  figures that run to dozens or hundreds: ICT, Influence, Creativity and
  Threat, a club's FPL Pts/Game and DC/Game, every percentage but
  ownership, Understat's xPts and Pts − xPts, and a Match Log Average of
  FPL points (a club's), DC (a club's) and BPS. Decimals stay only where
  a figure usually sits under 10, so rounding would blur real differences
  or show a misleading 0: xG figures (2), per-game and per-shot rates, PPG,
  Pts/£m, form, price, ownership, fixture difficulty and expected points —
  and the Historic Average of a **small count**, one recorded only a
  handful of times a season (`smallCount`: goals, assists, clean sheets,
  bonus, cards, penalties saved; Understat's goal types, woodwork and
  penalties; a club's penalties), which shows **1 decimal** so 0.4 a
  season reads "0.4", never a "0" that looks real. The same figure is
  shown the same way in tables and their filters (which compare it as
  shown), CSV exports, Dashboard tiles and graphs, Player Comparison cards,
  profile tiles, radars and Understat's cards and shot maps.
- **Signed figures** (`fmtSigned`): signed by the value as shown, so a
  tiny negative reads "0.00", not "-0.00". In tables and tiles their
  colour is the comparative one like any figure; the profile's Actual vs
  Expected bars show the direction (green over, red under, by the figure
  as shown).

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
  One missing its id, scope or metric key altogether can't be repaired and
  is skipped when loaded (`normalizeSummaryTile`/`normalizeDashboardGraph`
  return null), so damaged saved data can't stop the page.
- A name is optional (blank uses the auto title, shown as the Name box's
  placeholder). A dialog with a problem (no players or teams picked, a
  price range nothing meets) says so inside it when Add/Save is pressed, as
  Create View does. Removing a tile or graph asks first (no undo), as do
  Player Comparison's cards.
- A tile's or graph's metric key may name one of a second source's own
  figures (`understat:us.shots`), and a figure both sources have has the
  Explorers' ⇄ (see "Understat … Dashboard and Player Comparison");
  `resolvePlayerTileMetric`/`resolveTeamTileMetric` and the graph versions
  turn a key, and whether its ⇄ is switched, into the figure for the
  item's Data View.
- A bar graph ranks by its own `direction` (Order): new graphs and graphs
  saved before it existed get the metric's natural order
  (`defaultGraphDirection` — lowest first when `higherIsBetter` is false, so
  a League Position graph shows 1–15). A graph without a custom name is
  titled by its metric (bar) or "<X> vs <Y>" (scatter); a tile by its metric,
  plus its order when that runs against the metric's natural one ("· Lowest
  First" on a higher-is-better metric, "· Highest First" on a lower-is-better
  one; `displayTileTitle`), so a Highest First and a Lowest First tile of
  one metric read differently and a League Position tile listing 1st first
  isn't "Lowest First". A tile's bars
  (`components/statBar.ts`) give the top row, its leader, a full-length bar:
  Highest First (or any +/- metric) as |value| ÷ largest |value|; Lowest First
  on a non-negative metric as leader ÷ value.
- Saved views (`useSavedDashboardViews`) hold one scope's tiles and graphs.
  The selected non-Default view live-syncs every change. **Starter** (one
  per scope; "Default" in code, ids `default-view-*`) is immutable: no
  add, edit, remove or reorder, and it is re-synced to the packaged set on
  every load (so changing the packaged set needs no storage bump). The
  packaged FPL set is Points, Pts/£m and DC/Game tiles and xG vs Goals and
  Price vs Points graphs for players, FPL Points and Clean Sheets tiles and
  Team xG vs Goals and Team xGC vs Goals Against graphs for clubs; a
  mounted second source adds its own after them, on screen only
  (`withSourceStarterItems`; Understat's: <source_starter_items>). A default-id tile or graph can therefore only ever be an
  unmodified default, and Starter's cards aren't draggable. **My View**
  (`my-view-*`) is seeded blank per scope and is what a new install opens
  on; otherwise it's an ordinary view. Store v6 added it to existing
  installs (unless the scope already had a "My View" or was full) and moved
  a scope that was on the packaged view to it; the selection falls back to
  My View, then Starter, whenever the stored one doesn't exist
  (`resolveSelectedViewIds`). The tiles and graphs stores hold a working
  copy, so the page records which view each scope's on-screen copy came
  from (`loadedViewIds`) and loads the selected view whenever they differ —
  first open, or the selection moving without a load, as when deleting the
  selected view falls back to My View — before live-sync may write to it. Create View starts
  blank; Starter counts toward the 5 views per scope, and names must be
  unique within a scope. Delete View asks for confirmation.
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
(`state/useColumnCustomization.ts`), multi-column sort (`state/useSortSpec.ts`; a
column's first click puts its best first, `<natural_first_click>`: lowest first
where `higherIsBetter` is false, names A to Z, Position in pitch order; a "—"
sorts below every real value in Player Explorer, at the owner's request,
and last in either direction everywhere else; Shift-click adds any header,
the name column included, as a tiebreaker), and ≤/≥/= column filters
(`state/useColumnFilters.ts`, `components/ColumnFilterControl.tsx`) are
shared engines, reused by Team Building's Add Players table. Search is
accent- and order-insensitive with small-typo tolerance, splits the
query at dots/apostrophes (curly ones too)/hyphens as it does names, and treats a one-letter
word as an initial that must start a name word (`utils/playerSearch.ts`).
Every search box goes through `filterBySearch` (`<exact_before_typos>`):
typo matches count only when no player matches the query as typed, so
"wilson" doesn't bring in Nilson Angulo. PlayerSearch's suggestions are
ranked (`rankBySearch`: the player whose FPL name is the query first) and
work from the keyboard as a combobox (↓/↑, Enter, Escape closes just the
list). The Columns pickers (`ColumnsPopover`, `components/MenuControls.tsx`)
and the Dashboard's Statistic/axis pickers (`GroupedPicker`) have a filter
box that narrows them by name. CSV exports start with a UTF-8 byte-order
mark so Excel on Windows reads £ and accented names correctly
(`utils/csvExport.ts`).
- Filters compare a value **as displayed**: each column declares its
  `decimals` and the value is rounded the way its cell is
  (`roundAsDisplayed`) before ≤/≥/=. A range nothing can meet is refused
  (`columnFilterProblem`). Hiding a column clears its filter (`clearFilter`)
  and drops it from the sort (`sortWithoutHiddenColumn`; the page's default
  sort takes over if nothing's left). Reset does the same for every column
  it hides (`sortWithinColumns`). Every Team Explorer column declares its
  decimals, so a Historic Average mean is filtered as shown (65.75 as 66).
- When nothing matches, the table keeps its header (so each column's ▾ can
  still change its filter) with the message in the body — "Building the
  historic dataset…" instead while a historic view is still loading, when
  a number filter fails every "—".
- Auto-fit (`fitToBox`) keeps any width set by dragging, until Reset, and
  shares the rest; each column has a minimum, which also floors dragging:
  its header's longest word plus the header's padding, measured in the
  header font (`<header_floor>`, `components/headerWidth.ts`), or more where
  a table sets one (Player Explorer's Next 5 Fixtures: 190px). Headers in
  all three customisable tables (`wrap-headers`) wrap between words, and
  the sort arrow and ⇄ source toggle wrap under the label rather than
  widening the column, so the label never runs under the ▾ filter icon
  (it did at 1366–1440px before; audit 2026-10-23 in-app). It runs again when a
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
  rows that haven't changed; the colour ranks come from the whole pool
  (`allRows`, Team Building's `pickerAllRows`), so neither a sort nor a
  filter recomputes them. Player Explorer's Player column is sized by the browser to its
  widest name, so while rows are staged the likeliest-widest undrawn Player
  cells sit in hidden `visibility: collapse` rows (`.width-sizer-row`, which
  still count towards column widths) — the column is its final width from
  the first frame.
- The per-page row calculations are not cached across visits on purpose:
  on the live pool they take under 5ms (Team Building's predictions
  included), against the ~0.6s the full table took to draw. The data behind
  them is already fetched and normalised once in `AppStateContext`.
- Both Explorers open on their defaults each visit: columns, order, widths,
  sort, filters and Data View reset when you leave the page (by design).
- **Saved views** (`<explorer_views>`, `state/useExplorerViews.ts`,
  `components/ExplorerViewsMenu.tsx`): the icon right of Clear filters, in
  both Explorers, opens a menu of that page's saved views. "Save current
  view" names a snapshot of the Data View, the columns and their order,
  hand-set widths only (the rest fit the window on load, as after a drag),
  the sort, every column filter, the search, the ⇄ choices and Player
  Explorer's Hide. Clicking a view loads it; its save icon saves what's on
  screen over it, its bin deletes it, each after a confirm. Up to 5 per
  Explorer (`MAX_EXPLORER_VIEWS`), names unique and at most 60 characters,
  the same checks and wording as Create View. Unlike the Dashboard's and
  Player Comparison's views, which save every edit while picked, these
  change only when saved or saved over (owner's choice, 2026-10-20): an
  Explorer is for trying filters out, and every quick search would
  otherwise rewrite the view. No packaged view: Reset is the default.
  Loading (`explorerViewToApply`, `<explorer_view_load>`) leaves out what
  can't be shown now (a column this version doesn't have or a second
  source switched off, a Team filter on a club no longer in the league, a
  ⇄ choice with the source off, which drops that column's filter too) and
  names it in a dismissable notice above the table; the saved view itself
  keeps everything. A filter or sort survives only on a column on screen,
  as when hiding one by hand.
- Escape closes only the most recently opened layer — column filter, Columns
  picker, saved-views menu, Dashboard dialog, player profile or team profile
  (`state/useEscapeLayer.ts`).
- Text sorts with an accent- and case-insensitive collator; Player
  Explorer's Position sorts in pitch order (GKP, DEF, MID, FWD first).

**Player profile** (`components/PlayerDetailOverlay.tsx`) — has its own
mode toggle, and is a fixed-floor section (see "Minimum minutes"). Order:
"FPL · Views" (green heading; follows the Data View), a second source's
Views if mounted, then "FPL · Points History" and the **Match Log**
(`<match_log_follows_season>`), Playing Time at the top of its card.
Section headings use the colour index
(`.profile-section-heading.col-source-*`), and so do the Match Log's
headers (FPL green). Cards sit on `.profile-grid`, two columns laid out
row by row (`.profile-span-2` for a full-width card). Each source's Views
open with a **Summary** card across the width, then its graphs: FPL's
radars (a defender's or midfielder's two side by side, a goalkeeper's or
forward's one across the width, the chart the same size, centred), a
second source's own (Understat's shot maps). The Summary
(`components/playerProfile/ProfileSummary.tsx`, the same card for both
sources) is titled groups of label-above-value tiles on one six-column
grid (`.summary-grid`): a group of 6 fills a row, two groups of 3 share
one, every tile the same width so the columns line up; three columns on
a narrow screen. Every tile has the raised surface and its comparative
colour laid over it (`--tile-tint`), so an uncoloured figure never reads
as a gap. FPL's groups: **Defensive** (Clean Sheets, xGC, Def. Contrib.,
xGC/Game, DC/Game, BPS; a goalkeeper's Saves and Saves/Game where an
outfielder's DC figures are, as FPL's DC points exclude goalkeepers),
**Offensive** (xG, xA, xGI and each per game), then **Actual vs Expected**
(Goals − xG, Assists − xA, Goal Inv. − xGI) beside **Value** (Pts/£m,
PPG, Min/Goal). A defender or midfielder gets both Defensive and
Offensive, a forward Offensive only, a goalkeeper Defensive only. Every
tile is coloured by its rank within his position (Actual vs Expected
too, over-performance better, as in the Explorers).
The Match Log shows the live season unless a season is picked on Points
History (each bar is a button; the picked one is outlined, and the live
bar goes back); it never follows the Data View. A past season's rows come
from `/api/player-seasons` (`usePlayerPastSeasons`, fetched the first time
one is picked); its Totals and Average follow "Totals rows" (the
matches with a figure added up, the hover saying how many when it's only
some; a stat FPL didn't record that season, like xG before 2022/23, is
"—", never 0); a season before 2016/17 has no match record and says
so. Where a past season's rows don't add up to FPL's own season total
(minutes or points), a notice above them gives both
(`<match_record_check>`, `metrics/matchRecordCheck.ts`): FPL keeps no
per-match record of past seasons, so nothing approved can fill an archive
gap. The one case on today's data is Evan Ferguson's 2024/25 (the archive
gives 0 minutes for Brighton's GW24, so 368 minutes and 27 points against
FPL's 385 and 28); every other current player's 2022/23–2025/26 record
matches. A past season's Totals and Average are tinted like the live season's
(`<past_season_tints>`): ranked within his position that season (his
position then, from the ledger) among everyone at or above the fixed
floor (855, a completed season's), xGC per game; Average as his total ÷
his log's matches against each other player's total ÷ theirs (every
player's full log exists for a past season, so no club-matches stand-in).
The pool comes with his rows (`peers` in `/api/player-seasons`,
`peersFor` in `clubHistory/playerMatches.ts`), each player's totals
under the same Totals rule. Under the floor, or a stat FPL didn't record,
no colour (positions here are the ledger's for that season). Playing Time follows the shown season. Rows are keyed by fixture,
so a double gameweek is two rows. The live log lists only matches that
have kicked off (`<kicked_off_only>`, `normalizeElementSummary`): once a
gameweek is current FPL also lists each club's match in it before kick-off,
scoreless and all 0, and counted it made Playing Time and the Average
divide by a match not yet played. With a second source mounted its columns
join the log (its colour) and the heading reads "FPL & Understat · Match
Log" (rose). The live log's Totals row is
tinted by live within-position percentile. Its Average row (total ÷
matches in his log) is tinted by where that per-match figure ranks among
his position's, each other player's being their live season total ÷
the matches their club has kicked off, provisional and under way
included, as his log and FPL's season totals do (`metrics/profileComparisons.ts`,
`perMatchPositionPercentile`) — his own entry replaced by the figure shown,
Current Season floor for both; no colour if no one else qualifies (e.g.
fixtures failed to load). Only columns with a whole-pool season total are
shown, so both rows can be compared. Points History (`playerProfile/PointsHistory.tsx`,
shared with the Team Profile: bars with their own figures, no axis) uses the Historic Average (window
seasons of 855+ minutes; a window season under that carries the amber small-sample stopwatch, one outside the window "†"); its "(current season)" season is resolved as Current Season,
so pre-season it reads "—", not FPL's carried-over totals. A player's season
of 0 minutes has no figure (`<no_minutes_no_figures>`, `hasSeasonFigure`): "—"
and no bar, the hover saying he didn't play ("no minutes yet" for the live
season), and the change badge at the top right (`computeSeasonTrend`)
compares the latest two seasons he played in, its hover naming them. The gameweek-history
fetch (`usePlayerHistory`) is lazy, retries network failures twice, and
drops responses for a player no longer selected.
- The profile asks for the historic dataset only while it's open (both
  overlays are mounted on every page). Until that data has loaded — or if
  it failed, which the Data View toggle reports with Retry — it says
  nothing about the player having no data; Points History then shows its
  seasons with no window marks and no average. "No data in this mode"
  suggests only the other Data Views that do have figures for him.
- Points History has no season-by-season table (removed 2026-10-19, the
  owner's call: the Match Log, linked to the chart, holds the same
  figures). What only the table had moved to the Match Log: a **Starts**
  column (total and per-match average; the past-season pool carries
  `starts`), the season's **price** in the heading (start → end; today's
  for the current season), and, for a season before 2016/17 with no match
  record, FPL's **season totals** in a one-row table
  (`SeasonTotalsTable`).
- Both profiles are modal dialogs (`role="dialog"`, focus moved in and kept
  there, then returned: `state/useDialogFocus.ts`) and close on Escape
  (`useEscapeLayer`). An address naming a player or club that doesn't exist
  shows "not found" instead of nothing.

**Player Comparison** (`pages/PlayerComparison.tsx`, `components/comparison/`)
— one page-level list of up to 5 players (`?players=`, read as whole ids,
each once, at most 5), compared by every
card in the selected view. Each player's colour is his place in the list
(`seriesColors.ts`, `--series-*`: blue, gold, orange, white, grey — never
green or red, which mean better and worse, nor a source's violet or rose).
- Views (`useComparisonViews`) are layouts only — never players — of three
  element kinds, one section each: **radar** (3–8 axes) and **outputs** (up
  to 12 rows), each with its own Data View, from `COMPARISON_METRICS`
  (every non-static, non-signed `PLAYER_COLUMNS` metric, plus a second
  source's own comparable figures as `understat:<key>`, `resolveCardMetric`;
  shared figures have the ⇄); and **trend** (one `TREND_METRICS` key, or
  one of a second source's own `playerTrends` figures, on the y axis,
  seasons on the x — every season from the earliest on record to the
  latest, so one nobody has still takes its place, named short ("25/26"),
  every one while 12 or fewer, else evenly spaced back from the latest,
  which is always named (`seasonAxisTicks`); a player's spell out
  of FPL between two of his seasons is a dotted bridge in his colour,
  `buildSeasonTrend`'s `trendBridgeKey`, and the hover box says "Not in
  FPL this season"; a season of 0 minutes is no figure either
  (`<no_minutes_no_figures>`, `trendUnplayedKey`), bridged the same way,
  the hover box saying "Didn't play this season"). Max 5 views
  (Starter and My View included), 4 cards per section — the section's +
  card goes at 4; a view saved with more under the old limit of 6 keeps
  them but can't add another. **Starter**
  (`comparison-starter`) is packaged, read-only and restored on every load;
  **My View** is seeded blank and selected on first load. Edits save
  immediately; a stored card of an unknown kind is dropped, one with unknown
  metric keys shows as "unavailable" but can be removed.
- Minimum minutes follow the Dashboard's split. On **Starter** every card
  uses the fixed floor. On any other view each card has its own
  `minMinutes` (store v2; 0 by default), in every Data View. Each card
  with a threshold — Starter's, or its own above 0 — shows the amber
  stopwatch (`<minutes_marker>`). No
  minutes counts as 0. A player under the fixed floor is marked on every
  card, whatever its own Min Minutes (the owner's rule, 2026-10-24, as in
  Player Explorer and the Dashboard). Either way the threshold is per card: a player under
  it gets the amber badge on that card, isn't drawn on a radar, gets a
  stopwatch for its Outputs marker (pinned to the end with ▸ when past the
  leader), doesn't set the Outputs scale or tint its bar, and can't be bold.
- Radar percentiles are within position, among everyone at or above the
  fixed floor on every card, as every colour is (`comparisonPercentiles`, the same figure as
  `computePositionPercentiles`), flipped for lower-is-better metrics.
- An Outputs row is raw figures to scale: its bar runs from 0 to the
  highest figure among the ranked compared players, each marker at
  value ÷ leader with the figure above it; each row has its own scale.
  The bar is neutral up to the lowest ranked figure, then each stretch is
  tinted in the colour of the player whose marker ends it — how far they
  are past the one before (for a fewer-is-better statistic, how far
  behind). The bold "best" figure ranks on the column's `rankValue` (total
  xGC on xGC per game). Figures that would overlap are spread
  apart (`placeLabels`, sized from the mono font's fixed 0.6em width).
  The colour key sits under the panel, as under a radar.
- Trends use the full unwindowed career (`allTimeSeasonsByPlayerId`,
  completed seasons). A season under the card's threshold (the fixed floor,
  855, or the card's own Min Minutes where higher) still plots the real
  figure; its minutes are kept under `trendBelowKey`, so its point is the
  amber small-sample stopwatch and the hover text adds the minutes. A
  0-minute season is under it too (`<no_data_is_zero>`) but has no figure:
  its stopwatch sits on the dotted line bridging it, or on the chart's
  floor when nothing bridges it.

**Team Explorer / Team Profile** (`pages/Teams.tsx`, `components/TeamDetailOverlay.tsx`) — club
figures per "Club history" above. Club pills use real two-colour kits
(`utils/teamColors.ts`, with a generated fallback). Team Explorer's table
works like Player Explorer's: the same toolbar (Reset, Columns, clear
filters, saved views, Export CSV, a "Team name…" search via `matchesTeamSearch`), sort,
drag-reorder, resize, a ▾ filter per column, and Fit to Box sharing the width
left after the pinned, content-width Team column. The Columns picker lists
every `TEAM_COLUMNS` metric; beyond the nine league-table defaults they're
off. Headers wrap between words on narrow screens, each column floored at its
longest word (`<header_floor>`, as in every customisable table).
- The Team Profile's header (position, league points, played, W/D/L)
  follows its Data View like every other club figure, formatted as Team
  Explorer's columns show it (`teamHeaderLine`): in a Historic Average the
  league position is the rounded mean, W/D/L the shared-out whole numbers
  and league points whole, following them (`<league_points_follow_results>`);
  a season the club has no record of reads "—".
- **Club figures only — no players** (the owner's rule, 2026-09-26): no
  squad list, no player names, no link to player pages, and no minutes
  floor or badge. **One exception** (the owner's, 2026-10-21): a second
  source's Formations section, this season only, names who started in
  each slot of each formation from Understat's own line-ups, match by
  match, with links to their profiles (below). The rule's other direction
  has one exception too: a defender's or goalkeeper's Shots Faced map on
  the player profile.
- Same layout as the player profile: "FPL · Views" (a **Summary** across
  the width on the player profile's card, `ProfileSummary`, then the two
  radars), a second source's Views, then — whatever the Data View — "FPL ·
  Fixture Forecast", a second source's Formations (Understat: this
  season), "FPL · Points History", then the **Match Log**
  (`<club_match_log>`): the live season (`clubLiveMatches`) unless a season
  is picked on Points History, then that season's `ClubSeason.matches`,
  opponents named as they were that season. Never the Data View. One row
  per finished match, most recent first: GW, opponent (H/A), result, then
  FPL Points, Goals, Assists, xG, xA, xGI, Clean Sheets, xGC and Defensive
  Contributions, then any second source's columns. The Totals and Average
  (per match) rows are coloured against every other club's log for the
  same season ("Comparative colouring"); a column some matches lack follows
  "Totals rows".
- **Summary** (`SUMMARY_GROUPS`): every tile is a Team Explorer column
  (`TEAM_COLUMNS`), so the two always agree, coloured by the club's rank
  among every club for the Data View (`clubRanks`, its hover "4th of 20
  clubs"): **Attacking** (Goals excl. OGs, xG, xA and each per match),
  **Defensive** (Clean Sheets, Goals Against, xGC; Clean Sheet %,
  Conceded/Game, xGC/Game), **Balance** (Goal Difference, xGD, xGD/Game)
  beside **Actual vs Expected** (Goals − xG, Assists − xA, Conceded − xGC,
  fewer conceded better), and **FPL** (FPL Points, Bonus, Def.
  Contributions and each per match). Per match is ÷ the matches played in
  the view. The per-match figures, Clean Sheet %, xGD and the three Actual
  vs Expected figures were added to Team Explorer's columns for it (off by
  default; in the Dashboard's team tiles and graphs too).
- **Fixture Forecast** (`components/teamProfile/FixtureForecast.tsx`,
  "Fixture Forecast" in "Metric methodology"): the club's next five
  fixtures (`getUpcomingFixtures`), each with its expected goals for and
  against, Clean Sheet, To Score, Win, Draw and Loss chances; Totals (goals
  added up, a chance as the matches it's expected in) and Average (per
  fixture). A fixture's figure is coloured among every club's upcoming
  fixtures in the table, Totals and Average among every club's; fewer
  conceded and defeats better, a draw never coloured. It replaced the
  Upcoming Fixtures card (FPL's difficulty chips); the difficulty is still
  on a row's opponent hover and in the Explorers' Next 5 column.
- The team Defense radar ranks more Defensive Contributions as better
  (`TEAM_DEFENSE_AXES`), as for a player — they're FPL points. A dominant
  side that rarely has to defend can sit low on that one axis while topping
  the other three. Intended (the owner's decision, audit 2026-09-25 V1).

**Notepad** (`components/Notepad.tsx`, `state/useNotepad.ts`) — not a page:
a panel mounted once in `AppShell`, so it opens over any page, profile
included.
- The backtick key (`` ` ``, `NOTEPAD_KEY`) toggles it from anywhere, even
  while typing in a field or in the notes themselves (so a backtick can't be
  typed into a note); Ctrl/Alt/Cmd+backtick and key-repeat are ignored. The
  notepad button in the topbar does the same, and Escape closes it through
  `useEscapeLayer`, so it closes in turn with profiles and dialogs.
- It slides in from the right below the topbar (the desktop window's
  minimize/close stay reachable), at z-index 45: over a profile (40), under
  confirm dialogs (50). The rest of the screen is dimmed but the dim lets
  clicks and scrolling through, so the page behind can still be read and
  used while writing. No focus trap, for the same reason. The double-arrow
  at its top left widens it to fill the page below the topbar, and back
  (remembered until the app closes, not saved).
- Notes save to localStorage on every change. Tabs can be added, renamed
  (double-click, or the edit icon) and deleted; deleting a tab that has
  text asks first. Deleting every tab is kept as an empty notepad, not
  reseeded with a fresh Notes tab.
- At most 5 tabs (`MAX_TABS`; the + button turns off at 5) and tab names
  of at most 20 characters, spaces included (`MAX_TAB_TITLE`; typing stops
  there). Neither limit is shown in the UI. With those limits the tab strip
  never scrolls: tabs that don't fit share the width, cut short with "…".
  Notes saved before the 20-character limit (store version 1, 40
  characters) have longer names cut to 20 on load; more than 5 tabs from
  then are kept, but no more can be added until enough are deleted.

### Team Building — predictions

Everything else in the app describes what happened, but for the Team
Profile's Fixture Forecast (a fitted model, "Fixture Forecast" above), which
Model Predicted also reads.
Team Building predicts, at the user's request: FPL Official extends FPL's
own `ep_next` with **disclosed heuristics** (every weight a named constant
with its reasoning), and Model Predicted is a **fitted model**, proven on
seasons it wasn't fitted on (below). It has no analysis-mode
toggle; its Historic/Raw columns have their own. Squads (`useSavedSquads`,
max 5) are created blank or imported by FPL team ID (positions 1–11 are the
starting XI, also in a Bench Boost week; a Free Hit week imports that week's
temporary squad). Squad rules
(`metrics/squadRules.ts`) always use live price and club. The budget is
FPL's £100m for a squad built from scratch; an imported squad has its own
(`<imported_budget>`, `types/team.ts`): its players at today's prices when
imported plus the bank, so an unchanged import has exactly the manager's
bank left (today's prices, not FPL's selling prices, which keep half of a
rise: the pitch's Price highlight shows those, `<price_view>` below). Null where that can't be known (no bank, a pick FPL no
longer lists, or a squad saved before saved-squads store version 2): the
£100m applies, and the budget's hover text says to import again. Going over
is a warning ("£2.1m over"), never a block. **Add** starts a player while
the XI still has a legal place for him (`<add_to_xi>`, `fitsStartingXI`),
otherwise benches him; dragging moves anyone between pitch and bench.
**Clear Draft** asks first (there's no undo); **Best Draft** (below) doesn't,
as it only rearranges the squad. Before any squad exists the
whole Squad tile is greyed out and inert (`inert`, `.squad-pitch.is-disabled`):
nothing on it can be clicked or dropped on, so no player can be added until
New Squad makes or imports one; the "No squad loaded" note sits above it.

- **The pitch** (`components/SquadPitch.tsx`) — each player is his club's
  kit (`<club_kit>`, `components/Kit.tsx`): body in the club's colour,
  collar and cuffs in its second, the same pair as the team pill's swatch
  (`teamDisplayColors`); a goalkeeper's swaps them. The Team Profile's
  Formations section draws the same kit and nameplate. Under the
  kit, a dark nameplate: the name, then **one** figure, picked with
  **Highlight** (`<kit_view>`: Fixtures, Price, Owned, Minutes, Points Prediction,
  coloured as before), with no fixture beside it; **Fixtures** shows the
  next five FDR-coloured chips instead. **Points Prediction** is the
  player's Exp. Pts for the gameweek the pitch's arrows pick (a double's
  two matches added up, "—" for a blank), from the source its FPL/Model
  toggle picks (shown only while it's selected). **Minutes** is his Exp.
  Mins for that gameweek (below). **Price** has its own toggle
  (`<price_view>`, below). The switches are per page, like every view
  switch. Above the pitch, three rows: the squad's name (no formation or
  player count) with the Captain, Vice-Captain, Clear Draft and Best Draft
  buttons (the app's standard `.btn`, green while armed); then Squad Value
  and Bank as tiles; then the **Gameweek** arrows and Highlight. A
  club-limit breach is a banner. The bench is a row of slots, goalkeeper
  first, each labelled with its position (no bench order: the app has
  none).
- **Gameweek arrows** (`<gameweek_arrows>`, `GameweekArrows` in
  `components/MenuControls.tsx`) — ‹ GW10 › steps one gameweek at a time
  through the upcoming gameweeks (below), greyed at either end, "—" with
  none left. The pitch has its own (its cards' Points Prediction and
  Minutes, their colours, and Best Draft follow it) and Add Players has
  its own (its Exp. Pts and Exp. Mins columns); each moves only its own
  figures, per page, starting on the next gameweek. The same control in
  both places (the owner's rule: same thing, same way).
- **Best Draft** (`<best_draft>`, `metrics/bestDraft.ts`) — sets the
  starting XI, captain and vice-captain with the most Exp. Pts for the
  pitch's gameweek, from Points Prediction's source (FPL Official or
  Model Predicted, named in its hover), in a formation FPL allows (1 GKP,
  3–5 DEF, 2–5 MID, 1–3 FWD). Every legal formation is tried with each
  position's best players; the top figure in that XI captains and the
  next is vice-captain (the captain's doubling can't change which XI
  wins: the squad's top scorer starts in every formation). A blank counts
  as 0; a player who plays but has no figure starts only when a legal XI
  needs him and never gets an armband, as Totals rows never count a
  missing figure as 0 (`<partial_totals>`). Ties keep the current
  starters and armbands. The XI is saved as the squad's one XI, not one
  per gameweek. Greyed out, with the reason as its hover, until the squad
  can make a legal XI (11 players: at least 1 GKP, 3 DEF, 2 MID, 1 FWD)
  or while no player has a figure for that gameweek. Bench order and
  automatic substitutions aren't modelled (the app has no bench order).
- **Price** (`<price_view>`) — its toggle picks **Current** (today's
  price, coloured by rank within the position, lower greener, as
  before), **Sell** (`<selling_price>`, `sellingPrice` in
  `metrics/squadPrices.ts`: FPL's rule, the purchase price plus half of
  any rise, rounded down to £0.1m, or today's price after a fall),
  **Purchase** (`<purchase_prices>`, below) or **Change** (FPL's
  `cost_change_event`: ▲ rising, ▼ falling, since the last gameweek
  deadline; the hover adds the season's `cost_change_start`). Sell,
  Purchase and Change aren't coloured: a squad's own prices have no pool
  to rank in, and most players' change is 0. "—" for a purchase price
  that isn't known; the hover says why.
- **Purchase prices** (`<purchase_prices>`, `SavedSquad.purchasePrices`) —
  a player added in Scoutline (Add, or dragged in) is bought at his price
  that day; removing him drops it. An import reads FPL's public
  `entry/{id}/transfers/` (no login; `importedPurchasePrices`,
  `metrics/squadPrices.ts`): a player bought by transfer cost that
  transfer's `element_in_cost` (his latest), transfers in a Free Hit week
  don't count (the squad goes back afterwards) unless the import is that
  week, and a player the team has had since it started in GW1 cost his
  season-start price (`now_cost − cost_change_start`), trusted only when
  the starting 15's prices add up exactly to £100m − FPL's own bank that
  week. Checked on 2026-10-26 against 12 real teams by replaying every
  transfer onto those prices: each ended on FPL's own bank to the £0.1m.
  A team that started after GW1 bought its first 15 at prices FPL's
  public data doesn't keep, so those players have none ("—"); players it
  bought since still do. A failed transfers request still imports the
  squad, without purchase prices. A new season's rollover drops them
  (they were paid at last season's prices).
- **Open places** (`<open_slots>`, `openSquadSlots` in
  `metrics/squadRules.ts`) — every place the squad is still short of
  (2 GKP, 5 DEF, 5 MID, 3 FWD) is a "+": the XI's open places take them
  first, keeping it legal (each line to its minimum, then toward 4-4-2,
  then to its maximum), the rest on the bench, so an empty squad shows a
  4-4-2 and a bench of GKP, DEF, MID, FWD. A "+" sets Add Players'
  Position to that position and moves there; Add then places the player
  as always (`<add_to_xi>`). A player dragged onto a "+" lands on the
  pitch or bench it's on. With no squad yet the tile is inert, so no "+"
  can be used.
- **Upcoming gameweeks** (`<upcoming_gameweeks>`,
  `metrics/gameweekExpectations.ts`) — real gameweeks by FPL's own
  numbering, worked out from FPL's event list every time it loads, so
  they follow the season with nothing to maintain: up to five, starting
  at FPL's `is_next` gameweek (`firstPickableEventId`,
  `metrics/fixtureTicker.ts`: the one `ep_next` estimates and the first
  still open for picks), and only gameweeks the season has (just GW37–38
  near the end; none after the last deadline, or while events aren't
  loaded, when the figures are "—"). A player's figure for a gameweek
  (`expectationForGameweek`) is his club's matches in it added up: a
  double counts both, a blank has none ("No match in GW10"). Each match
  is still worked out by its place in his upcoming list (below). The
  pitch cards are for the gameweek the pitch's arrows pick; Add Players'
  Exp. Pts and Exp. Mins columns for the one its own arrows (beside the
  Data View picker) pick, each the next by default. The cards' colours
  rank the pitch's gameweek's figures among every player whatever the
  table shows (`pitchExpectations`). A match that has kicked off
  (FPL's `started`) is never upcoming, even before FPL marks it
  `finished` hours after full time. The Fixtures chips and column are
  still each club's next five matches; the Explorers' Next 5 Fixtures use
  the kick-off rule only.
- **Exp. Pts (FPL Official)** — `metrics/expectedPoints.ts`. FPL's `ep_next`
  for the player's first upcoming match. Later matches are `ep_next ×
  fixtureMultiplier(FDR, position)`.
- **Exp. Pts (Model Predicted)** — `<points_model>`, `metrics/pointsModel.ts`
  (the model), `metrics/pointsModelLive.ts` (its evidence from the app's
  data), `metrics/pointsModelParams.generated.ts` (its fitted settings).
  Scoutline's own expected points for one match, never reading `ep_next`:
  every way FPL scores a player, each as its own expectation under FPL's
  2026/27 rules, added up. Its shape comes from an analysis of every
  player-match since 2016/17 (which stats repeat season to season, how each
  position scores, what moves with the fixture), and every setting is fitted
  on past seasons and proven on seasons it didn't see (below).
  - **Playing time.** A chance of starting: a logistic per position of his
    starts in his last six matches this season (the latest counting most:
    ×0.75 per match back), whether he started the last one, his season's
    start share, last season's starts ÷ 38, and his price (a £1m-dearer
    goalkeeper is far likelier to be the first choice), plus two things a
    share of recent starts misses:
    - **Back from an absence** (`<return_from_absence>`,
      `returnFromAbsence`): in his first or second match back after
      missing 3+ in a row (injured, ill, dropped), a fitted lift (+1.0 to
      +2.1 on the log-odds): his recent share is low only because he was
      out, and returning players start more often than it says.
    - **Managers selling him** (`<transfer_signal>`, `sellOff`): FPL's
      transfers toward the next deadline, net selling only — transfers out
      beyond transfers in, as a share of the managers who owned him, on a
      log scale (ln((owners now + 10,000) ÷ (owners before + 10,000)),
      0 when more bought him than sold him). Managers sell on team news (an
      injury, a dropped player, a press conference) before anyone plays,
      so it carries news his match record can't; a regular being sold
      says most (it's weighted again by his recent start share). The
      owner's decision, 2026-10-25: the indicator is a lot of transfers
      out, so buying isn't read, and how many own him only scales it. Live,
      the counts are `transfers_in_event` / `transfers_out_event` (which
      run toward the next deadline) and ownership % × `total_players`;
      they count only toward that next gameweek's matches (the fit used
      each deadline's own), and early in the week they're partial, so the
      signal reaches its fitted weight only by the deadline. Unknown → it
      adds nothing.

    Then how long
    starters play: his own share of starts lasting 60+ and his minutes in
    them, pulled toward his position's (92–99% of starts, 82–90 minutes),
    so a forward taken off at 65 every week gets less of every part than
    one who plays the 90; and how often he comes off the bench when he
    doesn't start (his own record, pulled toward 1%/11%/21%/23% for
    GKP/DEF/MID/FWD). Everything is multiplied by FPL's availability
    (`availabilityModifier`, `metrics/availability.ts`:
    `chance_of_playing_next_round`, else a status default; unknown → no
    figure). Every other part is worked out for each
    way the match can go for him — starts and plays 60+, starts and goes
    off early, comes on, doesn't play — so the clean sheet, the 2-point
    appearance and the thresholds see the minutes they need.
  - **Goals and assists.** His rate per 90: 65% xG and 35% goals (49% xA,
    51% assists: actual goals add to xG's prediction of next season's
    goals), this season counting fully and each past season about half as
    much again per season back (×0.49, up to three), plus 10 matches'
    worth (9.6 for assists) of what a player of his position and price
    usually manages, so a few lucky minutes can't take over. Then × (his
    club's goals expected in this match ÷ its usual)^0.85.
  - **Clean sheet and goals conceded.** His club's, from the Fixture
    Forecast's goals expected against (`<fixture_forecast>`, the Team
    Profile's own ratings): a clean sheet is e^−(goals against × his
    minutes ÷ 90) when he plays 60+; "−1 per 2 conceded" is the exact
    expectation of ⌊conceded ÷ 2⌋. (A defender's clean sheets are his
    club's: r = 0.91.)
  - **Saves** (goalkeepers): his rate per 90 (12 matches of the league
    rate pulled in) × (goals expected against ÷ usual)^0.66, paying the
    exact ⌊saves ÷ 3⌋; plus penalty saves at the league rate.
  - **Defensive contribution.** His own rate per 90 (only 3 matches of his
    position's rate pulled in: it's the most repeatable stat in the game),
    and the chance of reaching 10 (DEF) / 12 (MID, FWD) in the minutes he
    plays, with the spread a match's actions really have (variance 1.2–1.3×
    the mean). Not moved by the opponent: a defender's actions barely
    change with who he faces.
  - **Bonus.** His bonus per 90 (25 matches of his position and price's
    pulled in: bonus is noisy), × (1 + k × (his club's chance of winning
    − its usual)), k ≈ 2–3 for outfield players (about 70% of bonus comes
    in wins), 0 for goalkeepers.
  - **Cards and own goals.** His yellow cards per 90 (20 matches of his
    position's pulled in), and red cards and own goals at his position's
    rate.
  - **Penalties** are inside his xG (FPL's xG counts them). The model can
    take them apart (non-penalty rates plus the club's 0.125 penalties a
    match, 82.9% scored, 0.79 xG each, all measured from Understat's
    shots) when it has penalty evidence, but the backtest found no gain
    over leaving them in xG, so the app gives it none and Model Predicted
    reads FPL's data only (the owner's decision, 2026-10-25: Understat may
    feed the model while it helps; here it doesn't).
  - **What it leans on** goes in the hover: under 900 Premier League
    minutes on record, his position and price weigh in; with none, they
    stand in. When it has allowed for a return or for managers selling
    him, the hover says so.
  - **Tried and left out** (backtested on seasons not fitted on, so the
    model stays as simple as the evidence allows): head-to-head records
    and former clubs (across every match since 2016/17 a player's or
    club's record against one opponent didn't carry into the next meeting;
    re-tested 2026-10-25 against the Fixture Forecast's goals expected,
    ~900 club-matches: correlation −0.01, a fitted weight of ~0); days
    since his club's last Premier League match (no effect on who starts
    once his recent starts are known); a returning player's shorter
    minutes once he starts (93% of starts reach 60 against 94%: too
    small to model); Understat's line-ups (its starts and minutes repeat
    FPL's, and its roles and formations — a club switching to a back
    three, a player's usual role — didn't improve who starts); Understat's
    penalty evidence (below).
  - **No figure ("—")** when his availability is unknown, his matches this
    season didn't load (the historic build skipped him), or either club
    has no Fixture Forecast rating (both come with the historic load).
    The hover says so.

  Hovering the figure, in Add Players or on a pitch card, shows its parts,
  his chance of starting and expected minutes, and what it leans on
  (`modelBreakdownHint`, `components/hoverText.ts`).
- **Its evidence** (`<points_model_evidence>`, `playerEvidence`): this
  season's totals from bootstrap-static, his matches this season
  (`<season_matches>`: [minutes, starts] each, oldest first, sent with the
  historic build from the element-summaries it already fetches), his last
  three completed seasons from `history_past`, his price, FPL's
  availability, and his transfers toward the next deadline
  (`liveTransfers`). Club ratings: the Fixture Forecast's, fitted once on
  the club records as the Team Profile shows them (`modelClubRatings`).
- **Fitting and proving it** (`client/scripts/pointsModel/`; the owner's
  decision 2026-10-25: every approved source may be used to fit and prove
  the model). `history.ts` rebuilds what the app would have known before
  every gameweek since 2022/23 (`<as_of_evidence>`: the club records'
  ledger, vaastav for cards, prices and transfers to 2025/26, FPL's
  element-summaries for 2026/27's transfers, Understat for penalties, and
  the availability record where it exists: `<availability_record>`, from
  2026/27 GW9, read as the app reads FPL's chance of playing; refitting
  as it grows lets the backtest prove the model with injury news too).
  `fit.ts`
  fits each part against its own outcome on 2022/23–2024/25 only
  (defensive contribution, recorded from 2025/26, on 2025/26 GW1–19) and
  writes `pointsModelParams.generated.ts`. `backtest.ts` proves it on
  2025/26 and 2026/27 so far against the model it replaced (kept frozen as
  `legacyModel.ts`) and a points-per-match baseline, writing
  `docs/models/model-predicted-backtest.md`. Run from the repo root:
  `npx tsx client/scripts/pointsModel/fit.ts`, then `backtest.ts`. The
  client build type-checks the scripts. Last results (no injury news given
  to either model; the new one sees managers' selling): on 2025/26
  GW20–38, unseen by every setting, the typical miss (RMSE) is 1.84
  points against the old model's 1.95, the average miss +0.07 against
  −0.16 (the old model's under-prediction gives it the smaller average
  absolute miss, 0.96 against 0.99: half of all players score 0, which a
  figure pulled toward 0 is nearer), and the correlation with actual
  points within a position and gameweek 0.61 against 0.54; on 2026/27 so
  far 2.14 against 2.29, and 0.57 against 0.51. It tells who starts better
  (AUC 0.93–0.98 against 0.89–0.96), and every part is calibrated to
  within a few hundredths of a point. The return and selling signals
  (2026-10-25) added 0.01 to the correlation on 2025/26 and lifted the
  top 10 picks' average from 4.84 to 4.96 points. Its weakest spot: among
  players who do start, it orders midfielders and forwards about as well
  as the old model did, not better. How far it can go: given perfect
  knowledge of who starts, the same model reaches about 0.69; of every
  player's minutes, 0.72; and of the chances each got in the match too,
  0.75 — the rest is finishing, clean sheets and bonus falling as they
  do.
- **Exp. Mins** (`<expected_minutes>`, dictionary `expectedMinutes`: the
  Add Players column and the pitch's Minutes) — Model Predicted's own
  playing time for a gameweek, its matches added up (a double's two, up
  to 180): for each match, Σ over the ways it can go for him (starts and
  plays 60+, starts and goes off early, comes on, doesn't play) of its
  chance × its minutes (`expectedMinutes` in `predictMatch`, "Playing
  time" above). So it reads how much he's been playing this season (his
  recent starts, the last counting most, and his season's share), last
  season's starts, a return from an absence, managers selling him on
  team news (next deadline only), FPL's injury and suspension news
  (availability), and how long he usually lasts. Competition for his
  place shows only through his own starts (a rival taking his place
  lowers his recent share); no squad-depth figure goes in. Whole minutes
  (`<whole_numbers>`), coloured by rank within the position (more is
  greener, no minutes floor, as Exp. Pts). Its hover gives his chance of
  starting. "—" where Model Predicted has none. It replaced Minutes
  Reliability (`docs/HISTORY.md`).
- **Availability's limit:** FPL publishes availability for the next round
  only, with no return date, so it can't tell a one-match ban from a long
  injury. The same availability applies to every upcoming gameweek: a
  one-match ban zeroes all five in both models (FPL Official because every later step
  scales `ep_next`, which FPL already zeroes).
- **The named weights** (judgement calls, not fitted; Model Predicted's
  settings are fitted, above):

  | Constant | Value | Where |
  |---|---|---|
  | `FDR_SENSITIVITY` | GKP 0.08, DEF 0.08, MID 0.10, FWD 0.12 per FDR step from 3 | `expectedPoints.ts` (FPL Official) |
  | status defaults | a 1, d 0.5, i/s/u/n 0, unknown → no figure | `availability.ts` |

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
| `fpl-dashboard:comparison:views:v1` | `useComparisonViews` (views embed their cards) |
| `fpl-dashboard:comparison:selected-view:v1` | `useComparisonViews` |
| `fpl-dashboard:saved-squads:v1` | `useSavedSquads` |
| `fpl-dashboard:notepad:v1` | `useNotepad` (tabs, their text, the active tab) |
| `fpl-dashboard:id-ledger:v1` | `state/seasonIdRollover.ts` (the season the saved ids belong to, and each id's permanent code) |
| `scoutline:terms-accepted:v1` | `components/TermsGate.tsx` (the terms version last accepted) |
| `scoutline:dashboard:hide-small-samples:v1` | `state/useHiddenSmallSamples.ts` (the ids of the Dashboard tiles and graphs whose Hide is on) |
| `scoutline:player-explorer:saved-views:v1` | `useExplorerViews("player")` (Player Explorer's saved views) |
| `scoutline:team-explorer:saved-views:v1` | `useExplorerViews("team")` (Team Explorer's saved views) |
| `scoutline:comparative-colour:v1` | `state/comparativeColour.ts` (whether comparative colouring is on) |

The `fpl-dashboard:` keys keep their names from before the rename to
Scoutline: renaming a key would lose everyone's saved data.

**Any change to what a store holds** — a new field, a new default, a
meaning change to an existing field — needs a `STORAGE_VERSION` bump **and**
a `migrate()` step, recorded in that store's version comment. Changing only
the `fallback` does nothing for existing installs, because the fallback is
used only when the key doesn't exist yet. Check `useSavedDashboardViews` too
whenever tiles or graphs change, since it embeds both. An empty array is a
valid user state, not a reason to reseed defaults. If localStorage throws,
changes still work for the session; they just don't persist.

- **A metric key can name one of a second source's own figures**
  (`understat:us.shots`, `<external_metric_key>`): tiles, graphs, saved
  views (v7) and comparison views (v3). FPL keys keep their plain form, so
  nothing stored before changes; with the source switched off such an
  item says so. A ⇄ choice is never saved there; an Explorer's saved view
  is the one place it is (see "Saved views" under Player Explorer).
- **One damaged entry costs only itself** (`mapReadableEntries`): tiles,
  graphs, saved views and saved squads skip an entry that isn't an object or
  can't be read, as comparison views and the notepad already did, instead of
  the whole store falling back to its defaults and being overwritten.
- **Saved squads are repaired on load** (`normalizeSavedSquad`): player lists
  keep only numbers, the XI and the armbands only players in the squad, and
  a squad with no id is skipped. Team Building flags any saved id FPL no
  longer lists (a banner with a remove icon); such an id holds no XI place.
- **FPL renumbers players and clubs every summer** (`id` is per season; the
  permanent identity is `code`). The id ledger records, for the season the
  saved ids belong to, every id's code. When the app first loads a new
  season (`rolloverSavedIds`, run on each bootstrap before any page reads a
  store), every saved player and club id in tiles, graphs, saved views and
  squads is translated old id → code → new id. A player or club no longer in
  FPL is dropped from lists and a squad armband on him is cleared; a tile or
  graph filtered to a club no longer in FPL falls back to all clubs, with
  "(club no longer in FPL)" added to its name. A tile or graph whose picked
  players (or clubs) have all left keeps an empty pick list, which shows
  nobody (never the whole league), with "(players no longer in FPL)" or
  "(clubs no longer in FPL)" added to its name. The stores keep their shape
  and versions. An install with no ledger yet records the current season as
  is (the ledger arrived mid-2026/27, while every saved id was 2026/27's).
  A session left open across the reset reloads itself once.

---

## Testing

`npm test` runs Vitest in both workspaces: calculations, normalize, state
persistence and migrations, the server cache/proxy/concurrency layer, club
history, and regression tests for past bugs. Coverage is partial —
`expectedPoints.ts` and most of `TeamBuilder.tsx` are untested; Model
Predicted is tested (`pointsModel.test.ts`, `TeamBuilder.model.test.tsx`)
and backtested (`client/scripts/pointsModel/`). Beyond tests, verification is `npm run build` plus running the
app. Playwright isn't installed, but it works via
`npx playwright install chromium` plus a throwaway driver script (nothing
committed).

## Automatic jobs and alerts

Five GitHub workflows run without anyone starting them:

| Workflow | When | What | Alerts the owner |
|---|---|---|---|
| `club-history-archive.yml` | Tue & Fri 05:00 UTC | Archives the live season's club history; releases at season end | On the 2nd failure in a row (a missed run loses nothing) |
| `understat-sync.yml` | Daily 06:00 UTC | Syncs Understat data (see "Understat"); fetches FPL's live record to check it against | At once for a changed format, a failed check, or data it couldn't commit or push; on the 2nd failure in a row for a block or blip; plus held/disputed links and Understat running late |
| `fpl-availability.yml` | Hourly | Records FPL's availability news for the next deadline (`<availability_record>`, below) | On the 2nd failure in a row (the next run records the news as it then stands) |
| `release.yml` | On a `v*` tag | Builds and publishes the desktop app | At once (installed apps would stop updating) |
| `watchdog.yml` | Mondays 07:00 UTC | Checks the three scheduled jobs are switched on and succeeded recently (Understat within 2 days, archive within 5, availability within 1), and the latest release didn't fail | When any of that is wrong |

**The availability record** (`<availability_record>`,
`server/src/fplAvailability/reading.ts`,
`scripts/fpl-availability/record.ts`): FPL only ever serves today's
injury and availability news, so no past deadline's news can be known
unless it's kept. Every hour the job reads bootstrap-static and, when the
news for the next deadline has changed, rewrites
`data/fpl-availability/<season>/gwNN.json`: every player who isn't
plain "available with no news" (status, chance of playing this and next
round, news text and when it was added, by FPL code), plus how many
players were in the game. Once the deadline passes, the file holds the
last reading before it. Kept from 2026/27 GW9 on. The app doesn't read it
(nothing needs a release); Model Predicted's fitting does
(`client/scripts/pointsModel/history.ts`), as the chance of playing each
player had at each recorded deadline.

The archive also checks the watchdog itself ran within 9 days, so a
stopped watchdog is caught too. Every scheduled workflow re-enables its own
schedule on each run (GitHub switches a public repository's schedules off
after 60 days without activity).

**An alert is a GitHub issue that @mentions the owner,** so GitHub emails
them (`scripts/alerts/github.ts`). It's plain English: what happened,
whether the app is affected, and what to tell Claude. There's one issue per
job:
- the first alert opens it (one email);
- while the problem lasts, its text is refreshed silently;
- the job's next clean run comments "Resolved" and closes it (one email).

This doesn't rely on GitHub's own failure emails, which for a scheduled job
go to whoever last re-enabled it, possibly the bot. The scripts:
- `workflow-alert.ts`: the failure/success step for a workflow without its
  own report;
- `alert.ts`: raise or resolve with given text (the Understat sync, the test
  alert);
- `watchdog.ts`: the checks above.

**Test alert:** run the Watchdog workflow by hand with `test_alert: raise`
(Actions → Watchdog → Run workflow, or `gh workflow run watchdog.yml -f
test_alert=raise`), check the email arrived, then run it with `resolve`.

## Desktop app and releases

The Windows desktop app (Electron, `electron/main.js`) is the only
distribution. The server is bundled by esbuild into one CommonJS file
(`server/dist/app.bundle.cjs`), `asar` is off, and the app is unsigned (a
SmartScreen prompt on first install). See `DEPLOYMENT.md`.

It runs on Electron 44 (a supported release line: Electron supports only
its three newest major versions, so move up at least once a year to keep
getting its browser's security fixes).

The page's address is always `http://localhost:4317`, never a `PORT` from
the environment: saved data belongs to the address. But nothing listens on
4317 (`<app_address>`, `electron/main.js`): the app answers that address
itself (`protocol.handle("http")`) and passes each request to the built-in
server, which listens on any free port of 127.0.0.1. So another program on
4317 (an OpenTelemetry agent's standard port, or a block Windows reserves
for Hyper-V/WSL/Docker) can't stop the app opening, as it used to. A
request is passed on with every header except `Origin`
(`<forwarded_headers>`, `electron/appAddress.js`): the page's script and
stylesheet are `crossorigin`, so their Origin would make the hop to the
server's own address a cross-origin request, which Electron refuses, and
the window would open blank (as v1.101.0 did). The server runs inside the app's main process: a separate process was tried
(2026-10-23) and measured no faster, as its heavy work waits on the network
far more than it computes. One copy runs at a time
(`requestSingleInstanceLock`); a second launch brings the first one's
window forward.

- **This computer only** (`<loopback_only>`, `server/src/listen.ts`): the
  server listens on the loopback addresses (127.0.0.1 and ::1; the desktop
  app's on 127.0.0.1 alone), never every network interface, so nothing else
  on the network can use it. `npm run dev` does the same; a container would
  set `HOST=0.0.0.0` (DEPLOYMENT.md "Web hosting (retired)").
- **Its own pages only** (`<navigation_guard>`, `electron/main.js`): a
  window never navigates away from `http://localhost:4317` or opens another
  window; an outside http(s) link opens in the person's own browser.
- **The rename** (2026-10-19, "FPL Analytics Dashboard" → Scoutline):
  `productName` is Scoutline, but the saved-data folder keeps its old name
  (`app.setPath("userData", …)`, `<saved_data_folder>`), and `appId`, the
  root package `name` and the GitHub repository keep theirs, so installed
  copies update in place and keep everything they had saved. Don't change
  any of those four.
- The server's memory caches are capped at 2,000 entries each
  (`TtlCache`, `server/src/cache.ts`), least recently stored out first.
- **Opening and updating** (`electron/main.js`). The main window loads
  hidden while the launch update check runs (it waits up to 4 s, and not
  at all if a check found nothing new in the last 10 minutes,
  `<update_state>`, `electron/updateState.js`). If opening takes over a
  second, the `<launch_window>` (`electron/launch-window.html`) says
  "Opening Scoutline"; if the check finds an update, it shows the download,
  then the app closes and the installer runs with its own progress bar
  (never silently: a silent install left nothing on screen while it ran)
  and reopens it. "Later" installs it, with that progress bar, as the app
  closes, and leaves it closed (`build.nsis.runAfterFinish` is off, so the
  installer reopens the app only when told to with `--force-run`; the cost:
  a first install from the setup file doesn't open the app at the end).
  Not while Windows is shutting down (`session-end`): an installer cut off
  half-way would leave a broken copy, so the next launch installs it
  instead. Each install attempt is noted first; if the next launch is still
  on the old version, that install failed, and the app opens as it is
  instead of trying it again before opening, so a failing update can't
  close the app on every launch. A second launch brings forward whichever
  window is showing.
- **Never running unseen** (`<window_watchdog>`, `electron/main.js`): a
  failed load or a crashed page process is reloaded (up to 3 times a
  session), a page that hasn't drawn in 20 s is reloaded once, and if the
  window still can't open the app says so and quits, instead of staying
  running with nothing on screen and the one-copy lock held.
- **Its own log** (`<app_log>`, `electron/log.js`): launches (with how
  long the server and the window took), update checks, and every error, from
  the app itself, the built-in server, the updater and the pages (console
  errors, crashes, failed loads), go to `logs/scoutline.log` in the
  saved-data folder, on this computer only. It starts afresh past 1 MB,
  keeping one previous file. An error nothing else caught is logged and
  shown once per session in the app's own dialog, which says where the log
  is (instead of Electron's raw "A JavaScript error occurred" box). The User
  Guide tells users how to find it.

## Legal

- **Terms and licence:** `LICENSE.txt` — proprietary, all rights reserved,
  with a personal-use licence, no-warranty and limitation-of-liability
  terms, the independence and trademark statement, and data ownership. The
  installer shows it (`build.nsis.license`), the app asks for it to be
  accepted on first launch and whenever it changes (`TermsGate`, bump
  `TERMS_VERSION` in `client/src/brand.ts` when the terms change in
  substance), and About & Legal (`pages/Legal.tsx`) shows it in full.
- **Privacy:** `PRIVACY.md`, summarised on About & Legal — keep the two in
  step.
- **Open-source notices:** `client/src/legal/third-party-notices.txt`,
  generated by `npm run legal:notices` (and before every desktop build by
  `electron:build`) from every package that ships in the app, shown on
  About & Legal. Commit it after a dependency change.
- **Name and copyright** in one place for the client: `client/src/brand.ts`.
  "FPL", "Fantasy Premier League" and "Premier League" are the Premier
  League's trademarks: use them only to describe the data (an "FPL" column
  source, an "FPL team ID"), never in the product's name or titles.
- **Data credits:** FPL, Understat and the vaastav archive (MIT) are
  credited on About & Legal and in `LICENSE.txt` section 6.

**To release** (batched, when the owner says: CLAUDE.md "Releasing"):
1. `npm run unreleased` lists what the release will ship (read from git,
   with dates and times; `scripts/release/unreleased.ts`), and warns about
   edits not committed and commits not pushed. Make sure this README
   reflects each of them.
2. Commit, then `git pull --rebase`: the Understat sync (daily) and the
   club-history archive commit data to master on their own, so a local copy
   is usually a few data commits behind.
3. `npm run release-notes -- vX.Y.Z` — bump the minor version if the batch
   has any feature, the patch version if it's only fixes. It rewrites
   `docs/RELEASES.md`, the release log: every release, newest first, with
   its changes (each version's commits since the one before, read from git;
   `scripts/release/notes.ts`), including vX.Y.Z. Commit it as
   "Release notes: vX.Y.Z"; that commit isn't listed as a change. A release
   the club-history archive made by itself is filled in the next time.
4. `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin master && git push origin vX.Y.Z`
5. Once the build has finished, `npm run released` says "vX.Y.Z now
   released" with every change in it, or that it isn't public yet (it asks
   GitHub, via `gh`).

`.github/workflows/release.yml` builds the installer, takes the version from
the tag, uploads it to a draft GitHub Release, and makes the release public
only once the installer, its blockmap and `latest.yml` are all there (a
release that went public mid-upload could point installed apps at a file
not there yet), then puts the version's change list on its Release page
(`npm run release-notes -- --list vX.Y.Z`; a failure there leaves the page
without it, never the release unpublished). One release build runs at a time. A closed copy installs it the next
time it's opened, before the app appears; an open one finds it within about
10 minutes and offers to restart into it (or install it when next closed).

## Known limitations

- No historic ownership: `history_past` has none, so it shows "—" in
  historic modes.
- Team `strength_attack_*`/`strength_defence_*` read 0 for every team
  (observed GW4 2026/27). `strength_overall_home/away` is normalized but
  no figure uses it any more (Model Predicted reads the Fixture Forecast).
- Restarting the server clears its in-memory cache (cheap — the API is the
  source of truth).
- Imported squads store chip usage (`usedChips`), but no page shows it at
  the moment.
- Club figures count only matches FPL has marked `finished`, hours after
  full time, while players' Current Season totals include a match from
  kick-off; during a gameweek the league table and club totals run a round
  behind (the owner's decision: FPL stays the authority). Once FPL confirms
  a match, fixture-based standings catch up on the 10-minute poll, and the
  club figures from the historic dataset with the automatic rebuild that
  follows (at most an hour later).
- Validation still defaults a few counts FPL has always sent (gameweek-row
  and `history_past` goals, assists, bonus and the like, to 0) and FDR (to 3);
  if FPL ever dropped one of those fields it would read as a real 0 or an
  average fixture.
