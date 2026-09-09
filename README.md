# FPL Analytics Dashboard — 2026/27

A locally-run scouting and analytics dashboard for Fantasy Premier League,
built against the **live official FPL API**. No mock data, no database, no
authentication — just your machine, a small Express proxy, and a React UI.

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

All four are proxied through the local Express server at matching paths
under `/api/`.

## API caching behaviour

| Data | TTL | Notes |
|---|---|---|
| `bootstrap-static` | 10 minutes | |
| `fixtures` | 30 minutes | |
| `element-summary/{id}` | 30 minutes | Cached per player id |
| `event/{gw}/live` | 60 seconds | |

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
| xG/90, xA/90, xGI/90, xGC/90 | `expected_goals_per_90`, etc. | **FPL API — supplied directly**, not derived |
| Defensive Contributions, DC/90 | `defensive_contribution`, `defensive_contribution_per_90` | FPL API |
| Starts | `starts` | FPL API |

The per-90 expected-stats fields and Defensive Contributions/90 turned out
to be supplied directly by the live API rather than needing local
derivation — this was confirmed by inspecting an actual `bootstrap-static`
response, per the project's "inspect, don't assume" rule.

## Underlying Numbers — chart methodology

Three charts were added alongside the original xG-vs-Goals and
xA-vs-Assists pair:

- **xGI vs Goals + Assists** — same treatment as xG/xA: xGI and
  Goals+Assists are the same underlying concept (expected vs actual goal
  involvements), so the dashed 45° reference line means the same thing.
- **ICT Index vs Goals + Assists** — ICT Index is a composite
  influence/creativity/threat score on its own scale, not the same unit
  as Goals+Assists. This chart intentionally has **no reference line**:
  a 45° "expected output" line would be meaningless when the axes aren't
  commensurate. It shows correlation/pattern only, and says so on the
  card.
- **Defensive Contribution/90 vs Defensive Reward/90** — the defensive
  equivalent of the xG/Goals charts, and the hardest of the three to get
  right honestly:
  - X-axis is `defensive_contribution_per_90` (the FPL-supplied rate of
    qualifying actions).
  - Y-axis is **clean-sheet points/90 + total bonus/90**
    (`client/src/metrics/defensiveReward.ts`). Clean-sheet points use a
    hard-coded position table (GKP/DEF 4, MID 1, FWD 0) — confirmed
    against current official FPL scoring rules, since the API returns
    raw clean-sheet counts, not the points they're worth.
  - Bubble size (third dimension, not merged into an axis) is
    **Expected Goals Conceded/90** — bigger bubble means a leakier
    expected defence.
  - Goalkeepers are excluded — the Defensive Contribution mechanic
    (2 points for reaching a per-match action threshold: 10 combined
    clearances/blocks/interceptions/tackles for defenders, 12 including
    recoveries for midfielders/forwards, capped at 2 points regardless of
    how far over the threshold) doesn't apply to them.
  - **Important caveat, stated on the card itself**: "bonus/90" here is
    **total** bonus, not bonus isolated to defensive actions. The public
    API has no breakdown of the Bonus Points System by contributing
    factor — defensive actions are confirmed to feed into it, but so do
    goals, assists, clean sheets, and saves. This is the most honest
    proxy available, not an attribution, and it's labelled as such rather
    than presented as more precise than it is.
  - Because Defensive Contribution points are a per-match threshold
    capped at 2 (not points-per-action), the x-axis rate does not convert
    to points linearly — also stated on the card.

## Calculation formulas

All derived metrics live in `client/src/metrics/calculations.ts` (pure,
null-safe functions — division by zero or a null input always returns
`null`, never `NaN`/`Infinity`):

```
Points / £m        = totalPoints / priceInMillions
xG / £m, xA / £m, xGI / £m  = (xG | xA | xGI) / priceInMillions
Points / 90         = totalPoints / minutes * 90
Goals / 90          = goals / minutes * 90
Assists / 90        = assists / minutes * 90
Minutes / Point     = minutes / totalPoints
Minutes / Goal      = minutes / goals
Minutes / Assist    = minutes / assists
Goals − xG           = goals - xG
Assists − xA         = assists - xA
Goal Involvements − xGI = (goals + assists) - xGI
```

## Per-90 and xGI validation

Because the live API supplies xG/90, xA/90, xGI/90, xGC/90 and DC/90
directly, this app treats those API values as authoritative for display —
but it also **independently recomputes** each one from raw totals ÷
minutes × 90 (and xGI as xG + xA) as a cross-check, with a 0.01 tolerance.
Discrepancies beyond tolerance are never silently hidden: they're logged
to the browser console and summarised on the Metric Definitions page
(`client/src/metrics/validation.ts`). This runs automatically once per
data load.

## Percentile methodology

Position percentiles (`client/src/metrics/percentiles.ts`) are calculated
against the **eligible population for that position only** — players
meeting the current minimum-minutes threshold, excluding anyone for whom
the metric itself is null. Team, ownership, and price filters do **not**
change this reference population, so a percentile means the same thing
regardless of what you're currently filtering the visible table by.

Bands: 90th percentile+ = Excellent, 70th–89th = Good, 30th–69th =
Average, below 30th = Poor.

## Archetype rules

Archetypes (`client/src/metrics/archetypes.ts`) are transparent,
rule-based labels — never predictions. All thresholds are centralised in
one exported object (`ARCHETYPE_THRESHOLDS`) rather than scattered magic
numbers:

- **Premium Player**: price ≥ £8.0m
- **Mid-priced Player**: £5.1m ≤ price ≤ £7.9m
- **Budget Option**: price ≤ £5.0m
- **Enabler**: price ≤ £5.0m *and* blended minutes reliability ≥ 65%
  (`minutesReliabilityBlend.ts` — the same historic+live blend Team
  Building uses, not a flat minutes-eligibility check; a cheap-but-risky
  bench player no longer qualifies just for having once cleared a
  minutes bar)
- **High-upside Attacker**: MID/FWD with Goals+Assists ≥ 90th positional
  percentile (min-minutes eligible)
- **High-xGI Defender**: DEF with xGI/90 ≥ 90th positional percentile
- **Strong Underlying Attacker**: xGI/90 ≥ 70th positional percentile
  (any position; actual output plays no part in this label)
- **High-clean sheet Defender**: DEF with xGC/90 in the *tightest* 90th
  percentile for the position — computed on −xGC/90 so a low expected-
  goals-conceded rate is what ranks highly, not a raw ascending
  percentile that would reward leaky defences
- **High def con Defender**: DEF with Defensive Contributions/90 ≥ 90th
  positional percentile
- **Influential Player**: any position, ICT Index ≥ 90th positional
  percentile
- **Rounded Midfielder**: MID with *both* Defensive Contributions/90 and
  xGI/90 ≥ 70th positional percentile — the only label requiring two
  conditions at once
- **Goals Above / Below xG**: `goals - xG` sign

Price cutoffs (£5.0m / £5.1m–£7.9m / £8.0m) and percentile bars (70th
"strong", 90th "elite") were not specified in the brief; these are the
least-assumptive, commonly-understood bands, centralised here rather
than hard-coded per component. Change `ARCHETYPE_THRESHOLDS` in one
place if you'd prefer different cutoffs. The Mid-priced floor was
originally £5.5m, leaving a £5.1m–£5.4m gap that fell into neither
Budget nor Mid-priced — fixed by lowering the floor to £5.1m rather than
raising Budget's ceiling, so every price still gets exactly one tier.

**One entry point, not two.** `computeArchetypes` (a single-player
function) used to exist alongside `computeArchetypesForAllPlayers` (a
population function) — now there's only the population version, and a
single-player caller just looks up `.get(id)` on its result. This
stopped being optional once Enabler needed reliability data: reliability
requires `NormalizedTeam` + `HistoricPlayerProfile` per player, which
only the population function was already threading through, so
maintaining two separate context-building paths would have meant either
duplicating that plumbing or letting the two diverge. Every caller
(`PlayerDetailOverlay.tsx`, `useFilteredPlayers.ts`, `PlayerExplorer.tsx`,
`TeamBuilder.tsx`) now passes `teamsById`/`historicProfiles` through to
get there.

**Every archetype surface updates from one shared list.** The
`ARCHETYPE_LABELS` array drives the FiltersBar popover, Team Building's
picker archetype filter, and every `ArchetypeBadges` render (Player
Explorer's table, the profile) — nothing hard-codes a second copy of the
label list anywhere, so adding a new archetype here is genuinely a
one-file change.

## Playing-time indicator methodology

Shown on a player's profile once their current-season gameweek history has
loaded (`client/src/metrics/rotationIndicators.ts`). Always labelled
**descriptive**, never a rotation prediction.

- **Recent window** = the 5 most recently completed current-season
  gameweeks present in the player's history.
- **Appearances** = entries in that window with minutes > 0.
- **Starts %** = starts ÷ appearances, computed only over entries where
  the API's per-gameweek `starts` value is known (entries with an unknown
  `starts` value are excluded from this specific ratio rather than
  guessed).
- **Average Minutes** = total minutes in the window ÷ window size.
- **Substitute Appearance Frequency** = (appearances − known starts) ÷
  appearances, among entries with a known starts value.
- **Recent Minutes** = total minutes across the window, regardless of
  whether the player appeared.

This is fetched lazily (only when a player profile is opened) and is
race-condition-safe: switching profiles quickly discards any in-flight
response for the previously-selected player.

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
- Team `strength_*` fields were observed as `0` on the live pre-season
  bootstrap-static response used during development (before gameweek 1)
  — the app does not use them for any ranking or metric, so this doesn't
  affect anything currently displayed.
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

## Current-season team aggregation methodology

The Teams page sums each currently-rostered player's **full-season**
totals (points, goals, assists, xG, xA, xGI, clean sheets) per club. This
is explicitly a **current-squad aggregate**, not a historical
"who scored while playing for this club" breakdown — a player transferred
mid-season contributes their entire season total to whichever club they
are registered with today. This is labelled directly in the UI.

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
- **`defensive_contribution` is always 0 in `history_past`**, regardless
  of season, even where the related raw counters are non-zero — typed
  and passed through, never used for historical analysis.

### Analysis mode: Last Completed Season / Historic Average / Current Season

Most main views (starting with Player Explorer; the rest followed soon
after) offer a toggle between three ways of looking at "a player's
performance", per the brief:

1. **Last Completed Season** — the player's actual totals from the most
   recently completed FPL season, however much or little they played.
   No minutes threshold applied: an injury-hit season is real data, not
   noise, when the question is specifically "what happened last season".
2. **Historic Average** — averaged across however many *qualifying*
   prior seasons the player has (1 season → that season; 2 → averaged
   over 2; etc.), where a qualifying season is one that:
   - falls within the most recent **4 completed seasons** (a hard
     window — currently 2022/23 through 2025/26 — that rolls forward on
     its own as real seasons complete, see below), and
   - has at least **900 minutes** played (~10 full matches) — an
     example threshold from the brief, centralised as
     `MIN_QUALIFYING_SEASON_MINUTES` in
     `client/src/metrics/historicAnalysis.ts` if you want it changed.
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

**Price in historic modes** is that season's (or the qualifying
average's) end-of-season price, not today's live price — comparing a
past season's points against today's price would be a mismatched,
misleading Points/£m. See `<historic_price_choice>` in
`client/src/metrics/resolvePlayerStats.ts`.

**A player with nothing to show for the selected mode is omitted, not
zeroed.** No entry for the reference season, or zero qualifying seasons,
means they don't appear in that view at all — pages show how many were
omitted rather than rendering misleading all-zero rows.

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

FPL doesn't publish `ep_next2`, `ep_next3`, etc., so the 1/3/5-gameweek
toggle extends forward using only real, FPL-published fixture-difficulty
data (`client/src/metrics/expectedPoints.ts`):

- Gameweek+1 = `ep_next`, unmodified.
- Each fixture after that = `ep_next × fixtureMultiplier(difficulty, position)`, where the multiplier moves the estimate away from
  neutral (FDR 3) by a per-position sensitivity constant
  (`FDR_SENSITIVITY` — forwards swing most on attacking difficulty,
  defenders/goalkeepers least, since appearance/DC/save points are less
  fixture-dependent than goal threat).
- Summed across the window. "Gameweek" here means each player's own
  next fixtures, not a calendar slot — a blank gameweek contributes
  nothing automatically (there's no fixture to sum), and a double
  gameweek counts both fixtures, simply by using "next N fixtures" as
  the unit throughout (`getUpcomingFixtures`, already built for the
  pitch's fixture ticker).

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

## Expected Points — Tier 2 (experimental, not wired into any page yet)

A second, independent Expected Points estimate, built alongside — not
instead of — the existing model above. Where Tier 1 trusts FPL's own
`ep_next` outright, Tier 2 never looks at `ep_next` at all: it estimates
each of FPL's actual scoring events separately from this app's own
normalized stats, using FPL's real scoring rules, and sums them.
`client/src/metrics/expectedPointsV2.ts` — a new module, deliberately
not touching `expectedPoints.ts` and not replacing any figure shown
anywhere in the app yet. Whether it ever does depends on the backtest
results below, per this app's own "never replace a working, documented
feature with an unvalidated one" rule.

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

### Not wired into the UI, and what would change that

Per this app's own conventions (documented in `build_and_validate`
guidance this section was built against): an unvalidated model doesn't
quietly replace, or even sit alongside, a working documented feature
until there's real evidence it's earned the place. Right now the
backtest is 156 points from 2 gameweeks — real signal, but nowhere near
enough to trust as a settled comparison. Before Tier 2 appears anywhere
in the UI, it should be re-run with more backtest depth (ideally
several gameweeks, all 654 players not just the top 20 per position),
and even then it should be surfaced **alongside** the existing Tier 1
figure, not in place of it — so a person using the app can see both and
judge for themselves, exactly as `overallAverage` already blends
multiple inputs transparently rather than presenting one as ground
truth.

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
  (Goals, xG/90, Assists, xA/90, ICT Index, Points). Every axis is a
  metric that already exists on `NormalizedPlayer`, so nothing new had
  to be computed to support this.
- **Every axis is a within-position percentile**, reusing
  `computePositionPercentiles` — the same function and the same
  `<percentile_population>` convention (computed against the full,
  unfiltered, mode-resolved population, never something already cut
  down by team/ownership/price) already used for the existing Position
  Percentile card and the archetype system.
- **Axes where a lower raw value is better get flipped**
  (`higherIsBetter: false` — currently just xGC/90, "Defence
  Tightness"), so every axis on the chart consistently points "outward
  = good" regardless of which direction the underlying stat runs.
- **Works across all three analysis modes already on the page** — the
  radar reads from the same `resolvedPlayer/resolvedPlayers` the
  profile's other cards already compute, so switching
  Last Completed Season / Historic Average / Current Season just works
  without the chart needing any mode-awareness of its own.
- A player below the minutes eligibility threshold gets the same
  "(below eligibility threshold)" treatment as the existing Position
  Percentile card, rather than a chart quietly built from an unreliable
  sample.

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
Rankings" button, contained within the Team cell — clicking it sets the
global team filter and navigates to Player Explorer, landing already
filtered to that club's players. It's a discoverability shortcut into
functionality that already existed (Player Explorer's own column
sorting), not a second ranking system.

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

## Player Explorer: Archetypes is a real column now

Previously fixed in its own fixed-width slot next to Player, unable to
move, resize, or hide — now it participates in the same
reorder/resize/Fit-to-Box/visibility system as every other column, via
a synthetic `"archetypes"` key that isn't a `PLAYER_COLUMNS` entry (it
renders badges, not a number) but flows through the same engine as a
special case. Scoped to this page's own default column list, not the
shared `DEFAULT_VISIBLE_COLUMNS` Team Building also uses — Team
Building's Historic/Raw group was never asked for an archetypes column
and doesn't get one.

Below 110px wide, badges switch to short 2-4 character codes
(`ARCHETYPE_SHORT_LABELS` — a `Record<ArchetypeLabel, string>` rather
than a lookup-with-fallback, so TypeScript itself refuses to compile if
a future archetype is added without a short form) with the full label
as a tooltip; narrower still, they simply overflow-hide, which was the
explicitly acceptable fallback ("disappearing or turning into little
symbol icons" — this does the second, and lets the first happen
naturally at the extreme rather than needing a third explicit tier).

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

**Thematic Analysis**: average points by position, and average points by price tier, across every season on record. Price tier uses each season's OWN price (`endCost`, falling back to `startCost`), not today's — consistent with how price tiers work everywhere else in this app. Position uses each player's CURRENT position, since this app has no record of historical position changes; a position-switcher's older seasons are grouped under where they play now, disclosed rather than hidden. This deliberately does NOT re-run the full percentile-based archetype system (High-upside Attacker, Strong Underlying Attacker, etc.) against every historical season — that would mean rebuilding a whole separate qualifying population and percentile computation per season, a materially bigger undertaking than two charts, so it wasn't attempted. A season only counts for a player if they met the same `MIN_QUALIFYING_SEASON_MINUTES` bar `historicProfiles` uses elsewhere; a player no longer in the live pool is excluded from this chart specifically (their own Player Trends chart is unaffected).

**What changed**: `state/AppStateContext.tsx` (`allTimeSeasonsByPlayerId`), new `metrics/careerTrends.ts` and `metrics/thematicTrends.ts`, `pages/UnderlyingNumbers.tsx` (two new chart sections using Recharts' `LineChart` directly, alongside the existing `ScatterWithReference` component).

### User Guide

Updated throughout for everything above — Dashboard, Team Building, Underlying Numbers, and the Archetypes section's price-tier clarification.

### Testing note

Same disclosed limitation as every other round: no network access in this build environment, so no `npm install`/`tsc`/browser session was possible — every file got a careful manual review instead, cross-checking every new export against every place it's imported. The entry-picks endpoint specifically (see above) is the one piece of this batch resting on community documentation rather than a direct live fetch. A real `npm run dev` session remains the outstanding step before treating any of this as fully verified.

## Electron desktop app

Wraps the existing app into a downloadable, installable desktop app —
one self-contained install per person, no accounts, no shared server,
no database. This deliberately avoids the much larger multi-user-website
version of this project (auth, a real database, a shared cache to avoid
multiplying load on FPL's API across many users) — a downloadable app
doesn't have that problem, since each install just runs the app the way
it already runs locally today. **I could not install or test any of
this myself** — the environment this was built in has no network
access, so `npm install electron` and an actual build/launch were never
possible here. Everything below is written and reasoned through
carefully, but the exact commands below are the first real test of it.

### What changed
- `server/src/app.ts` (new) — the Express app's setup, extracted out of
  `index.ts` into a `createApp()` function that builds the app without
  starting it. `index.ts` is now a thin entry point (`createApp().listen(...)`)
  — `npm run dev` and `npm start` behave identically to before. The
  extraction exists so Electron can start the exact same app itself,
  rather than duplicating its route/middleware setup.
- `createApp()` also now serves the built client (`client/dist`) and
  falls back to `index.html` for client-side routes, whenever that
  build actually exists on disk — a plain `npm run dev` never has one,
  so this is a no-op there; a production/Electron run does.
- `electron/main.js` (new) — the Electron main process. Starts the
  embedded server on port 4317 (chosen to avoid colliding with the dev
  server's port 4000), waits for it to actually be listening, then
  opens a window pointed at `http://localhost:4317`. No preload script
  — the page itself never needs Node or Electron APIs, it's the same
  web app that already runs in a normal browser.
- Root `package.json` — added `electron`, `electron-builder`, and
  `esbuild` as dev dependencies, plus an electron-builder `build`
  config (targets: `.dmg` for Mac, NSIS installer for Windows,
  AppImage for Linux — pick whichever you actually want to build; you
  don't need all three).

### Why the server is bundled with esbuild, not packaged as-is
This is an npm-workspaces monorepo — `express`/`cors` live in the
hoisted root `node_modules`, not `server/node_modules`. Having
electron-builder figure out which `node_modules` to include based on
`server/package.json`'s dependencies, when the actual files live one
level up, is a real risk I had no way to verify from here — getting it
wrong would mean the packaged app silently fails to start because
`express` can't be found. Sidestepped entirely: `npm run
build:electron-server` uses esbuild to bundle `server/src/app.ts` and
everything it imports — express and cors included — into one
self-contained file (`server/dist/app.bundle.js`) that needs zero
`node_modules` resolution at runtime. Same reasoning behind `"asar":
false` in the build config — `express.static` serving files from
inside an ASAR archive is a known friction point elsewhere, and this
app has no real need for ASAR's main benefit (obscuring source), so
avoiding that whole risk category seemed worth more than the slightly
less "sealed" result.

### To actually build and test it
```bash
npm install                    # pulls in electron/electron-builder/esbuild
npm run electron:start         # builds the client, bundles the server, launches the app directly (fastest way to check it actually works)
```
If that opens a working window, packaging an installer is:
```bash
npm run electron:build         # same build steps, then electron-builder packages an installer into /release
```

### What's genuinely untested and most likely to need a small fix
- **The dynamic `import()` of the ESM bundle from a CommonJS main
  process.** This is a well-supported Node pattern, but it's the one
  piece of this I'm least able to vouch for without having run it.
- **Whether `esbuild`'s ESM output bundles cleanly** given the server
  code's `.js`-suffixed imports (`./config.js` etc.) — a common,
  well-supported TypeScript/ESM pattern, but again, unverified here.
- **Unsigned app warnings.** No code-signing certificates are
  configured (they cost money and need real identity verification I
  can't do on your behalf) — expect Gatekeeper on Mac and SmartScreen
  on Windows to warn on first launch. Normal for an unsigned first
  version, not a bug.
- **No app icon configured** — Electron will fall back to its own
  default icon. Easy to add later; didn't want to block a first
  working build on it.

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
      metrics/               Calculations, dictionary, percentiles, archetypes, validation, rotation indicators
      api/                  Frontend fetch client
      state/                 App-wide React Context (data + global filters)
      components/            Reusable UI pieces (table, filters, charts, overlay)
      pages/                 One file per navigation section
      styles/                Design tokens + component CSS
```

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
