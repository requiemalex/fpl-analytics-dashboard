# Player & Team Profiles Audit — Phase 1 (Forensic Audit) — 2026-09-25

**Scope:** the two profile overlays and the shared code behind them:
- **Player profile** — `components/PlayerDetailOverlay.tsx` (`?player=<id>`),
  its charts (`PlayerRadarChart.tsx`, `playerProfile/ActualVsExpectedBars.tsx`,
  `CareerHistoryChart.tsx`, `PlayingTimeIcon.tsx`), the lazy gameweek fetch
  (`state/usePlayerHistory.ts`, `normalize/normalizeElementSummary.ts`) and the
  metrics it shows (`metrics/radarStats.ts`, `percentiles.ts`,
  `rotationIndicators.ts`, `historicAnalysis.ts`, `careerMetrics.ts`,
  `playerMetrics.ts`, `resolvePlayerStats.ts`).
- **Team profile** — `components/TeamDetailOverlay.tsx` (`?teamProfile=<id>`)
  and `metrics/teamStats.ts`, `teamSeasonHistory.ts`, `fixtureTicker.ts`,
  `normalize/deriveTeamStandings.ts`, plus the `TeamBadge` that opens it
  (`components/primitives.tsx`).

Where a finding is in shared code, the other pages it reaches are named.

---

## 1. Summary for the owner

**What was checked.** I ran the app's production build against the live
2026/27 FPL API (Gameweek 5 finished, Gameweek 6 next) in a separate test
browser that doesn't touch your settings or installed app. I opened player
and team profiles the way a user would:
- the three Data Views, the radars, the charts and their hover boxes;
- the career table, Escape and the × button;
- clicking from a team's squad into a player, and the browser's Back button;
- a phone-width window.

I also made the data fail and made it slow on purpose, to see what each
profile says while it waits or after an error. I recalculated profile figures
by hand from the raw FPL data for six players (Haaland, Raya, Gabriel,
Ndiaye, B. Fernandes and a reserve goalkeeper) and for every club.

**Findings:** 0 Critical, 2 High, 5 Medium, 10 Low, plus 2 questions that need
your decision.

**The ones that matter most:**
1. **H1 — the percentile radars rank tiny samples at the top.** The profile
   has no minutes threshold at all: it's fixed at 0. So Ben Davies's two
   short appearances last season (136 minutes) put him in the **100th
   percentile of all defenders for xG/Game** and the 97th for xGI/Game.
   Remi Matthews's 3 minutes in four seasons make him the league's best
   goalkeeper for "Defence Tightness" in Historic Average. Players who
   didn't play at all are counted in the comparison too, which flatters
   everyone else. The profile does contain a "small sample" warning, but it
   can never switch on. Player Comparison's radars and the Team Profile's
   squad colouring work the same way. How to fix this is your decision (see
   the fix order).
2. **H2 — pre-season, Career History would show last season again as "this
   season".** Before the first game, FPL still carries last season's totals
   in its live figures. Everywhere else the app zeroes them, but the
   profile's "(live)" row reads them directly. Gabriel would show 209 points
   for 2026/27 before a ball is kicked. Nothing is wrong right now, but it
   will happen every summer, when people are planning squads.
3. **M2 — "No data for Haaland" while the data is still loading.** The
   profile opens on Last Completed Season. For the first few seconds (up to
   a minute on a cold start), it says the player has **no data in this
   mode** and suggests switching to Last Completed Season, the mode you're
   already on. If historic data fails to load, the same message stays up,
   and Career History shows "Season average (0 seasons)".
4. **M1 — the Team Profile header always shows today's table.** In Last
   Completed Season, Man City's profile reads "1st in table · 15 pts · 5
   played" above last season's totals. The README says league results
   follow the Data View.
5. **M3 — every page starts the big historic download.** Both profiles are
   loaded in the background on every page and ask for the historic dataset
   even when closed. Just opening the User Guide starts it. The README says
   this never happens at startup.

**Checked and found fine:**
- Every profile figure I recalculated by hand matches the raw FPL data:
  - the Prime tables' totals match each player's season totals exactly;
  - per-game rates, Pts/£m, Min/Goal and Goals − xG match;
  - Historic Average matches Player Explorer;
  - the Career History average matches the Historic Average points;
  - season-by-season history is identical whether it comes from the bulk
    download or the profile's own request.
- **Team figures:**
  - club season totals agree with the club history, for every club and
    Data View;
  - the FPL Points History average equals the Historic Average FPL points
    for all 20 clubs;
  - the live league table (position, points, W/D/L) matches one built by
    hand from the finished fixtures;
  - players who moved clubs this season (Ndiaye from Everton, Enzo from
    Chelsea) correctly count only their Man City games for Man City.
- Promoted clubs with no Premier League record (Coventry, Hull) show "—",
  never 0.
- No NaN, Infinity or crash anywhere.
- Opening a player profile makes exactly one request for that player.
- The × button, Escape (player profile), and team → player → Back all work.
- Both profiles fit a phone-width screen with no sideways scrolling.

---

## 2. Baseline

| Item | Value |
|---|---|
| Commit | `c15478f` |
| Version | v1.66.0 (latest tag) |
| `npm run build` | Clean (exit 0; Vite's usual large-chunk warning only) |
| `npm test` | 393/393 passed (server 45, client 348) |
| Live data | 667 players; GW5 `is_current` and finished, GW6 `is_next`; reference season 2025/26; 220 club-seasons |
| How it was run | Production build (`node server/dist/index.js`) on port 4400. A dev server that was already running on 4000/5173 was left untouched. Playwright (Chromium), fresh browser contexts, scripts in scratch space only |

---

## 3. Master index

| ID | Sev. | One line |
|---|---|---|
| H1 | High | Radars and percentile tints have no minutes threshold (fixed at 0): cameo players top per-game axes, 0-minute players pad the pool, and the small-sample warning can never trigger |
| H2 | High | Pre-season, Career History's "(live)" season repeats last season's totals, read from un-zeroed bootstrap fields |
| M1 | Medium | Team Profile header shows today's league position/points/record in every Data View; README says league results follow the Data View |
| M2 | Medium | While historic data loads (or after it fails), the player profile says "No data for X in this mode", shows "Small sample (0 min)", and suggests the mode already selected |
| M3 | Medium | Both overlays request the historic dataset on every page, even closed; README says the build never runs at startup |
| M4 | Medium | Gameweek log keys rows by gameweek number: a double gameweek gives duplicate React keys; "gameweeks" counts are really fixture counts |
| M5 | Medium | Escape doesn't close the Team Profile (it does close the player profile) |
| L1 | Low | Whole numbers show two decimals across the player profile ("90.00" minutes, "272.00 pts", "Clean Sheets 19.00") |
| L2 | Low | Radar hover says "42th", "1th", "2th", "3th", "21th percentile" |
| L3 | Low | Career chart hover marks out-of-window seasons "*", but the table uses "*" for light seasons and "†" for out-of-window |
| L4 | Low | Goalkeepers get Def. Contrib. and DC/Game tiles (always 0), while the gameweek log hides DC for goalkeepers |
| L5 | Low | Prime's Average row is tinted with the Totals row's percentile, not its own |
| L6 | Low | User Guide mismatches: Starts listed under Prime; "Current Season Log" isn't a name the UI uses; Average isn't "÷ gameweeks played" |
| L7 | Low | Team Profile squad table's Historic Average (seasons *at this club* only) is undocumented and differs from the club's own average |
| L8 | Low | Keyboard and screen-reader gaps: squad rows and team pills can't be opened by keyboard; overlays aren't dialogs; "Player Rankings" lacks `aria-label` |
| L9 | Low | An unknown `?player=`/`?teamProfile=` id silently shows nothing and stays in the address |
| L10 | Low | Dead and stale code: the unreachable small-sample path, `filters` plumbing, "Squad Points History" comments |
| V1 | Verify | Team Defense radar treats more Defensive Contributions as better: dominant sides like Man City rank 3rd–9th percentile. Intended? |
| V2 | Verify | A player's Historic Average counts 0-minute seasons on record (Ndiaye: 0 min in 2023/24 → "Season average (3 seasons)" 80.7 pts). Intended? |

---

## 4. Findings in detail

### Audit 1 — Data source accuracy

Checked and fine:
- Every profile figure traces to a real API field or documented derivation.
- `now_cost` is read as £0.1m.
- The current gameweek comes from `is_current`.
- The team header's league table uses fixture-derived standings
  (`applyRealTeamStandings`, which is correct: bootstrap `played`/`points`
  read 0 for all 20 clubs today, and the derived table matches my hand
  count).
- `element-summary` is fetched once per opened player and discards stale
  responses.
- History failures degrade to messages, not a blank page.

One finding:

#### H2 — Pre-season, the live Career History season is last season again

- **Severity:** High. **Confidence:** High. Traced in code, and the new test
  fails as expected. It can't be seen live until next summer.
- **Where:** `PlayerDetailOverlay.tsx:119-141` (`currentSeasonEntry`).
- **What it does:** it builds the "(live)" season from the raw live player
  (`player.totalPoints ?? 0`, `player.minutes ?? 0`, goals, xG…). It never
  checks `currentSeasonHasStarted`. The README ("Analysis modes") and
  `resolvePlayerStats.ts` (`<live_mode_preseason_fix>`) both record that
  before the first match FPL's bootstrap still carries **last season's
  final totals**. `resolvePlayerStats` zeroes them for that reason, but this
  entry doesn't use it.
- **What it should do:** show 0 for cumulative stats until the season has
  started, as Current Season does everywhere else.
- **Why it matters:** from the FPL reset (usually July) to GW1, every
  profile's Career History would show a 2026/27 bar and row identical to
  2025/26. Price would be live, but points, minutes, goals and xG would all
  be last season's, labelled as this season. That's peak squad-planning
  time.
- **Reproduce:** new test `profiles.audit.test.tsx` → "H2". Gabriel with
  carried-over totals of 209 points / 2,750 minutes and
  `currentSeasonHasStarted: false`. Expand the season table: the "2026/27
  (live)" row shows **2,750.00** minutes (expected 0) and **209.00** points
  (expected 0).

### Audit 2 — Metric and calculation correctness

Inventory of what the profiles calculate:

| Metric (where) | Source / formula | Zero, null, tiny samples |
|---|---|---|
| Underlying Numbers, Value tiles (player) | `resolvePlayerStats` for the Data View; Pts/£m = pts ÷ live price; Min/Goal = minutes ÷ goals; per-game = total ÷ `estimatedGames` | null → "—"; Min/Goal with 0 goals → "—" (checked on Raya) |
| Actual vs Expected (player) | Goals − xG, Assists − xA, G+A − xGI (`calculations.ts`) | null → muted row, "—" |
| Percentile radar and tile tints (player) | Within-position rank of `resolvePlayerStatsList` for the mode; threshold `effectiveMinMinutes(DEFAULT_FILTERS, mode)` = **0** | 0-minute players included; cameos included (H1) |
| Prime/Supplements Totals | Sum of `element-summary.history` rows | Matches bootstrap exactly for all 6 players checked |
| Prime/Supplements Average | Total ÷ number of history rows | Rows include 0-minute gameweeks and gameweeks at a previous club (L6) |
| Playing Time | Minutes ÷ history rows; tier at 75%/40% of 90 | No rows → "—" gauge |
| Career History average | `buildHistoricPlayerProfile(...).windowAverage`, last 4 completed seasons, light seasons included | Matches Historic Average (Haaland 227.3, Gabriel 155.3) |
| Career trend | Last two completed seasons on record, ±5 pts = flat | Labels both seasons, so a gap year is visible |
| Season Totals (team) | `computeTeamAggregates` (club, not squad) | No record → "—" (Coventry, Hull checked) |
| Team radars | League-wide rank of each club's aggregate | Null clubs excluded; direction of DC is V1 |
| Squad table (team) | `clubPlayerFigures`: the player's figures for this club only | Historic Average = mean over his seasons at the club (L7) |
| FPL Points History (team) | `clubSeasonHistory` + `computeClubSeasonWindow` | Equals Historic Average FPL points for all 20 clubs |

Hand recalculation, Haaland (raw `element-summary/411` and `history_past`):

| Figure | Working | Expected | Shown |
|---|---|---|---|
| Last Completed Season xG/Game | 25.50 ÷ ceil(2953/90)=33 | 0.77 | 0.77 |
| Historic Average PPG | (272+217+181+239) = 909 pts; games = ceil((2767+2553+2736+2953)/90) = ceil(122.3) = 123 | 7.39 | 7.4 |
| Last Completed Season Pts/£m | 239 ÷ £15.6m (live price, by design) | 15.3 | 15.3 |
| Min/Goal (Last Completed Season) | 2953 ÷ 27 | 109 | 109 |
| Career History average | 909 ÷ 4 | 227 | 227 |
| Prime Totals | 5 gameweek rows: 39 pts, 450 min, 5 G, xG 4.42 | = bootstrap | 39.00, 450.00, 5.00, 4.42 (values right; format L1) |

#### H1 — Radars and percentile tints rank tiny samples at the top

- **Severity:** High. **Confidence:** High. Measured on the live pool and
  hand-checked.
- **Where:**
  - `PlayerDetailOverlay.tsx:109`, `160-168`, `180-206`, `229-256`,
    `283-285`;
  - `state/useFilteredPlayers.ts` `effectiveMinMinutes`;
  - `state/scoutingFilters.ts` `DEFAULT_MIN_MINUTES = 0`;
  - `metrics/percentiles.ts` (`p.minutes < minMinutesThreshold`).
- **Shared:**
  - Player Comparison radars (`pages/PlayerComparison.tsx:161`, same
    `DEFAULT_FILTERS` pattern);
  - Team Profile squad tints (`TeamDetailOverlay.tsx:174`).
- **What it does:** the profile has no Min Minutes control, so its
  threshold is the fixed default, 0. A 0 threshold excludes nobody. The
  percentile population for a position is every player with non-null
  minutes, including 0-minute ones and one-cameo ones:

  | Data View | DEF population | of which 0 min | 1–449 min |
  |---|---|---|---|
  | Last Completed Season | 158 | 21 | 24 |
  | Historic Average | 174 | 17 | 28 |
  | Current Season | 217 | 69 | 123 |

  The best per-game values then belong to tiny samples:
  - **Ben Davies (DEF, TOT), Last Completed Season:** 136 min, 2 estimated
    games. xG/Game 0.49 ÷ 2 = 0.245 (shown 0.25) → **100th percentile**; xGI/Game 0.56 ÷
    2 = 0.28 → **97th**; "Defence Tightness" (xGC/Game 1.11 ÷ 2 = 0.56) →
    **95th**. By comparison, Konsa (3,035 min) sits at 27th for Defence
    Tightness.
  - **Remi Matthews (GKP, CRY), Historic Average:** 3 minutes across four
    seasons. xGC/Game 0.07 ÷ 1 game = 0.07, the best of all 59 goalkeepers
    → top of "Defence Tightness".
  - **Hinshelwood (MID, BHA), Current Season:** 1.43 xGI in 63 minutes =
    1.43 xGI/Game, top of all 298 midfielders (Saka is next with 0.84 over
    416 min).
  - Counting 0-minute players also lifts everyone who played: 21 defenders
    with 0 minutes sit at the bottom of every Last Completed Season count
    stat.
- **The warning that should catch this can't fire.** `smallSample` is
  `minutes < effectiveMinMinutes(...)`, which is `minutes < 0`, so it's only
  true when minutes are null (no data at all). The "(below eligibility
  threshold)" radar label and the "Small sample — below the current minutes
  eligibility threshold (0 min)" banner never show for a small sample. They
  only show, wrongly worded, for missing data (see M2).
  - History: the threshold came from the page's shared filters until
    `f766669` ("Make every page's filters/analysis-mode fully independent").
    Since then it has been this fixed 0.
- **What it should do:** README "Percentiles" says the pool is "the full
  mode-resolved pool that meets the minutes threshold". With the threshold
  fixed at 0, the pool isn't filtered at all. Either a real floor applies,
  or small samples are flagged and not coloured as elite.
- **Why it matters:** the radar and the green/red tiles are the profile's
  headline "how good is he" view. A reserve full-back reads as the best
  attacking defender in the league.
- **Reproduce:** open `/players?player=508` (Ben Davies), leave Last
  Completed Season, and hover the Offense radar's xG/Game axis: "100th
  percentile · 0.25" (also "BPS 23th", "Goals 71th": L2).
- **Note:** the last audit's M1 decided that **user-built** per-game lists
  get no floor, while the packaged Default view does. The profile has no
  control the user could raise, so it is closer to the Default view's case.
  This is your call (see §6).

### Audit 3 — Expected-points model

Not in scope. The profiles show no Expected Points.

### Audit 4 — Cross-application consistency

Traced Haaland, Gabriel, Raya, Ndiaye and B. Fernandes (player profile vs
Player Explorer's resolved values), and Man City (Team Profile vs Team
Explorer's `computeTeamAggregates`). All agree, in all three Data Views.

#### M1 — Team Profile header ignores the Data View

- **Severity:** Medium. **Confidence:** High.
- **Where:** `TeamDetailOverlay.tsx:237-240` (reads `team.position`,
  `team.points`, `team.played`, W/D/L from the live table).
- **What it does:** the header shows the live table in every Data View.
  Man City, Last Completed Season: header "1st in table · 15 pts · 5
  played · 5W 0D 0L", with last season's totals (FPL Points 2,092) directly
  underneath. The same header shows in Historic Average.
- **What it should do:** README "Club history": "League results (position,
  points, goals for/against) follow the Data View too". The Dashboard
  audit made team tiles do exactly that ("not today's table", User Guide).
  Either the header follows the Data View, or it's clearly labelled as
  today's table.
- **Why it matters:** two seasons are mixed on one card with nothing to say
  so. A promoted club reads "18th in table" above "—" for every season
  total.

### Audit 5 — Filters, sorting, order and state

The profiles have no filters. Checked:
- Each profile's Data View is independent of the page underneath (true for
  both).
- The squad table sorts by points with no-figure players last (true).
- Switching player via the URL keeps the chosen Data View and the career
  table's open state. That's reasonable, not a finding.

### Audit 6 — UI and interaction, in the real app

#### M2 — "No data" while the historic data is loading or failed

- **Severity:** Medium. **Confidence:** High. Reproduced in the real app.
- **Where:** `PlayerDetailOverlay.tsx:283-285` and `534-539`, `549-551`,
  `558-562`, `686-700`.
- **What it does:** the profile opens on Last Completed Season. Until the
  historic dataset arrives, every performance field is null, and the
  profile shows:
  - "No data for Haaland in this mode — every field below shows —. Try Last
    Completed Season or Historic Average." That's wrong: the data isn't
    missing, and he is already on Last Completed Season.
  - "Small sample — below the current minutes eligibility threshold (0
    min). Read with caution." That's wrong too, and "(0 min)" makes no
    sense.
  - "Percentile Radar — FWD (below eligibility threshold)".

  The Data View toggle's own "Building the historic dataset…" notice is
  correct, but it sits directly above these contradicting banners. If the
  historic request **fails**, the same banners stay up, and Career History
  shows every season as outside the window: grey bars, "Season average (0
  seasons) —", and no live-season bar, although the player's own history
  loaded fine.
- **What it should do:** while loading, say nothing about missing data. On
  failure, rely on the toggle's error-and-Retry notice. Only say "no data"
  when the dataset has loaded and the player really has none, and never
  suggest the mode already selected.
- **Reproduce:** Playwright, `historic-bulk` delayed 6 s, open
  `/players?player=411`: after 1.5 s all three messages show. With
  `historic-bulk` returning 502: the same messages, plus "Season average (0
  seasons) —". New test: "M2".

#### M4 — Double gameweeks in the gameweek log

- **Severity:** Medium. **Confidence:** High (code and test). Not visible
  yet: there hasn't been a double gameweek this season.
- **Where:** `PlayerDetailOverlay.tsx:462` (`<tr key={g.round}>`);
  `metrics/rotationIndicators.ts` `computeSeasonAverageMinutes` and
  `computeGameweekAverages` (divide by rows).
- **What it does:**
  - A double gameweek gives two history entries with the same `round`, so
    both tables render two rows with the same React key. React logs "two
    children with the same key" (test: 2 errors) and may reuse the wrong
    row when the list changes, for example when you switch player.
  - The Playing Time card's "Completed Gameweeks" and the Average row count
    **fixtures**, not gameweeks.
- **What it should do:** key rows by fixture. Say "matches"/"fixtures", or
  count gameweeks, consistently.
- **Reproduce:** new test "M4": two entries for round 2 → 2 duplicate-key
  errors.

#### M5 — Escape doesn't close the Team Profile

- **Severity:** Medium. **Confidence:** High. Reproduced.
- **Where:** `TeamDetailOverlay.tsx` (no `useEscapeLayer`). Compare
  `PlayerDetailOverlay.tsx:261`.
- **What it does:** Escape leaves the Team Profile open. With both
  `?player=` and `?teamProfile=` in the address, the team sheet is drawn on
  top, but Escape closes the hidden player profile underneath it.
- **What it should do:** close like the player profile (README: "Escape
  closes only the most recently opened layer").
- **Reproduce:** `/teams?teamProfile=15`, press Escape → still open. New
  test "M5".

#### L1 — Whole numbers shown with ".00"

- **Where:** `fmtDecimal` defaults to 2 decimals (`utils/format.ts:23`),
  and the profile calls it on counts in these places:
  - `PlayerDetailOverlay.tsx:349-374` (every gameweek cell);
  - `386-409` (Totals);
  - `578-608` (Clean Sheets, Def. Contrib., BPS tiles);
  - `835-843` (Career table);
  - `CareerHistoryChart.tsx` tooltip;
  - `PlayerRadarChart.tsx:22` (raw value).
- **Seen:**
  - Raya's GW5 row: "1.00 90.00 0.00 0.00 …";
  - Career table: "2,767.00" minutes, "33.00" starts, "272.00" points;
  - bar hover: "272.00 pts";
  - radar hover: "Points 99th percentile · 39.00";
  - tiles: "Clean Sheets 19.00".
- Not a regression: it has behaved like this since the first commit. Team
  Profile passes explicit decimals and is fine. The radar tooltip is shared
  with Player Comparison and the Team radars. New test "L1".

#### L2 — Wrong ordinal suffix on the radar

`PlayerRadarChart.tsx:21`: `${percentile.toFixed(0)}th percentile`. Seen:
"Assists 42th percentile". Also produces 1th, 2th, 3th, 21th, 22th, 23th.
Shared: every radar in the app.

#### L3 — Two meanings for "*" in Career History

`CareerHistoryChart.tsx:24` adds " *" on hover to any season **not
counted** (outside the 4-season window). The table below
(`PlayerDetailOverlay.tsx:826`) uses "*" for a **light** season that *is*
counted, and "†" for outside the window. Hovering an out-of-window bar
(Raya's 2021/22, say) shows "2021/22 *", which per the table means "light
but counted". It also appears
on the Team Profile's chart.

#### L4 — Goalkeepers get DC tiles that can only read 0

`PlayerDetailOverlay.tsx:599-611`. The goalkeeper Underlying Numbers show
Def. Contrib. and DC/Game. All 54 goalkeepers with a DC value last season
have 0, and none has any this season. The code's own reasoning for hiding
the DC column from goalkeepers' gameweek log (lines 330-339: "can never
score them anything") applies here too. Raya shows "Def. Contrib. 0.00,
DC/Game 0.00" in a neutral tint.

#### L5 — The Average row borrows the Totals row's colour

`PlayerDetailOverlay.tsx:483`, `496`, and the comment at `218-228`. Prime's
Average row is tinted with the **Totals** percentile. A player who joined
late, with high per-game output but low totals, gets a red Average row. The
User Guide says both rows show "this player's percentile against others in
their own position", which doesn't say the Average row reuses the Totals
rank.

#### L8 — Keyboard and screen-reader gaps

- Team Profile squad rows are clickable `<tr>`s with no `tabindex` (checked:
  null), so they can't be opened from the keyboard.
- `TeamBadge` (`primitives.tsx:62-63`) is `role="button" tabIndex={0}` with
  no key handler. Enter and Space do nothing.
- Neither profile has `role="dialog"`, moves focus into the sheet, or keeps
  focus there. Focus stays on `<body>`.
- "Player Rankings" (`TeamDetailOverlay.tsx:243`) has a `title` but no
  `aria-label` (CLAUDE.md: toolbar and card actions carry both).

#### L9 — Unknown ids are silently ignored

`/players?player=99999` and `?player=abc` show nothing, with no message,
and leave the parameter in the address (a later click on "Back" re-opens
nothing). The same happens for `?teamProfile=`. A player removed from FPL,
linked from an old URL, looks like a broken link.

Checked and fine:
- The loading and error messages for the gameweek fetch show, and Career
  History's Retry works (one request per attempt).
- The team → player swap, and Back returns to the team.
- Hover boxes name the hovered axis or season.
- No console errors in any real-app run.
- At 390px wide, neither profile scrolls sideways.
- A new-to-FPL player gets "No season data" rather than an error.

### Audit 7 — Automated test coverage

Before this audit there was one profile test file
(`PlayerDetailOverlay.test.tsx`: Escape only). Nothing covered the Team
Profile, the gameweek log, Career History, or how the overlays request data.
The pure metrics behind the profiles (`percentiles`, `careerMetrics`,
`historicAnalysis`, `teamStats`) do have unit tests. Still untested after
this audit: `radarStats.ts`, `rotationIndicators.ts`, `teamSeasonHistory.ts`,
`fixtureTicker.ts`, and the percentile *population* the profile passes in.
The radar threshold (H1) needs your decision before a test can state the
right behaviour. See §7 for what was added.

### Audit 8 — Saved data and upgrades

The profiles keep no saved data. Their Data View, the career-table toggle
and the selected id live in component state or the URL. Nothing to migrate.

### Audit 9 — Plausibility of outputs

- The extremes of every radar axis, in each Data View, are covered under
  H1. Every top per-game value was a small sample except DC/Game in Last
  Completed Season (Wieffer 12.2 over 1,901 min), which is believable.
- The squad table's top rows are believable (Man City, Last Completed
  Season: Haaland 239, O'Reilly 160, Matheus N. 154, Donnarumma 135).
- Team radars: Man City at the 91st–92nd percentile for clean sheets, goals
  conceded and xGC last season is believable. Its 3rd–9th percentile for
  Defensive Contributions is explained by V1.
- Club season totals: 2025/26 club FPL points range from 1,620 (TOT) to
  2,161 (ARS), which is plausible.

### Audit 10 — Code quality and architecture

#### M3 — The overlays start the historic build on every page

- **Severity:** Medium. **Confidence:** High. Measured.
- **Where:** `PlayerDetailOverlay.tsx:97-99`, `TeamDetailOverlay.tsx:68-70`,
  both mounted unconditionally in `App.tsx:36-37`.
- **What it does:** each overlay calls `requestHistoricData()` on mount,
  whether or not a profile is open. Opening `/guide` in a fresh browser
  requests `bootstrap-static`, `fixtures` **and `historic-bulk`**. On a cold
  server that's the one-minute build of hundreds of upstream
  `element-summary` calls.
- **What it should do:** README "API endpoints and caching": the build "is
  demand-driven … It never runs at startup". CLAUDE.md: it runs "only when a
  page calls `requestHistoricData()`". Request it only when a profile is
  actually open.
- **Why it matters:** extra load on FPL, and slower first use of the pages
  that don't need historic data. New test "M3".

#### L10 — Dead and stale code

- `PlayerDetailOverlay.tsx:109` `filters = DEFAULT_FILTERS`, and every
  `effectiveMinMinutes(filters, …)` in the file, always give 0 (H1). Also
  `filters.minMinutes` in two dependency lists, and the "(below eligibility
  threshold)" and "Small sample" paths (only reachable wrongly, M2).
- `CareerHistoryChart.tsx:9` and `metrics/careerMetrics.ts` refer to a
  "Squad Points History" / "squad-aggregated season total". Team history is
  a club figure now (`clubSeasonHistory`).
- `PlayerDetailOverlay.tsx` is 860 lines. It mixes population percentile
  scans, the gameweek table builder and all the markup. Splitting out the
  Live Data section would make M4 and L5 easier to fix. It's only worth
  doing alongside those fixes.

### Audit 11 — Performance and API efficiency

Measured, in the production build, on the live pool:
- Opening a profile from a Player Explorer row: 139 ms.
- Switching the Data View in a midfielder's profile: 368 ms, 429 ms and
  606 ms for the three switches, similar to what the last audit accepted
  for Player Explorer.
- One `element-summary` request per profile, no duplicates.

M3 is the one efficiency finding. The `O(n²)` percentile scans
(`computePositionPercentiles`, about 26 scans per player profile) are a
theoretical cost only; they weren't isolated from rendering in the timings
above.

### Audit 12 — Docs match the app

#### L6 — User Guide mismatches (`UserGuide.tsx:456-486`)

- "Prime covers Points, Minutes, **Starts**, …": Starts is in Supplements
  (moved on purpose, per the comment at `PlayerDetailOverlay.tsx:240-244`).
- "**Current Season Log** … Prime and Supplements": the UI heading is "Live
  Data". No "Current Season Log" appears.
- "Average row (total ÷ **gameweeks played** so far)": it divides by every
  gameweek listed, including 0-minute ones and gameweeks at a previous
  club. Example: Enzo, 271 min over 5 rows, one of them 0 minutes, has an
  Average of 54 minutes, not 68.
- "Prime's Totals and Average rows … this player's percentile": see L5.

#### L7 — Squad table Historic Average is undocumented

`teamStats.ts:161-198`. In Historic Average, each squad row is the player's
mean over **the seasons he played for this club**. The club's own figures
are a mean over **the club's** window seasons. Man City: Donnarumma
(signed 2025/26) shows 135, his one season, next to the club's 4-season
average. Vitor Reis shows 1.0 from his single 2024/25 season. The rule is
defensible, but neither the README nor the User Guide says so ("what each
player did for this club in the selected season").

Checked and true:
- Escape and × close the player profile.
- Defenders and midfielders get Defense and Offense radars.
- Compare links through, pre-filled.
- Career History marks the live season, and light (*) and out-of-window (†)
  seasons.
- Goalkeepers swap in Saves and Penalties Saved.
- FPL Points History shows the live season dashed and missing Premier
  League seasons as gaps.
- The Team Profile's "Player Rankings" hand-off works.

---

## 5. Needs verification (not counted as defects)

**V1 — Is more Defensive Contributions "better" for a club?**
`TEAM_DEFENSE_AXES` (`teamStats.ts:258`) ranks DC higher-is-better. A club
racks up DC by doing a lot of defending. Man City, the best defence last
season (91st percentile on clean sheets, goals conceded and xGC), is at the
**9th** percentile for DC (2,571). This season they're at the 3rd. For an
individual player, DC is FPL points. For a club's Defense radar, a high
figure can mean being under siege. Your decision: keep it, flip it, or move
it off the Defense radar.

**V2 — 0-minute seasons in a player's Historic Average.** `history_past`
lists seasons where a player was registered but never played. Ndiaye has
2023/24 on record with 0 minutes, so his Career History reads "Season
average (3 seasons) 81 pts · 1,736 mins". Without that season it would be
121 pts. `<no_survivorship_bias>` deliberately counts light seasons. Is a
season spent at a club outside the Premier League (0 FPL minutes) meant to
count as one? This is shared with Player Explorer and every Historic Average
figure.

---

## 6. Recommended fix order

1. **H1 (radar threshold)** — needs your decision first. Options:
   - (a) a fixed floor on the profile's percentiles, like the packaged
     Default view (for example 450 minutes, 90 in Current Season), with
     smaller samples shown as "small sample" and not tinted;
   - (b) exclude only 0-minute players, and mark small samples;
   - (c) keep no floor, but make the warning actually fire and label the
     radar.

   Whichever you pick, the same choice should apply to Player Comparison's
   radars and the Team Profile squad tints. Highest user impact. The code is
   small, but it touches shared percentile plumbing, so it needs tests.
2. **H2 (pre-season live season)** — a one-line guard using
   `currentSeasonHasStarted`. Low risk; must ship before next July.
3. **M2 (loading / failed messages)** — small. Fix it with the H1 work,
   since both touch `smallSample`.
4. **M3 (historic build on every page)** — small, and removes needless
   upstream load. Check that opening a profile still triggers the build.
5. **M1 (team header)** — needs a small decision: follow the Data View, or
   label the header as today's table.
6. **M5, M4** — small and mechanical: Escape via `useEscapeLayer`, and key
   the gameweek rows by fixture.
7. **L1–L10** — cosmetic and docs. L1 and L2 are one-line formatting fixes
   with app-wide reach (radar tooltips); L6 and L7 are wording.
8. **V1, V2** — your decisions. V2 is shared methodology beyond this scope.

---

## 7. Tests added

`client/src/components/profiles.audit.test.tsx` (9 tests). It renders the
real overlays with a mocked app state.

| Test | Protects against | Status |
|---|---|---|
| H2: pre-season '(live)' row shows 0 | Career History repeating last season as the live one | `it.fails` (H2) |
| M2: no "No data" while loading | Contradictory banners during the historic load | `it.fails` (M2) |
| L1: Prime shows '90', not '90.00' | Two-decimal whole numbers | `it.fails` (L1) |
| M4: double gameweek, no duplicate-key error | Duplicate React keys in the gameweek log | `it.fails` (M4) |
| Totals and averages sum the gameweeks shown | Regressions in the log's Totals/Average rows | passes |
| M5: Escape closes the team profile | Team Profile ignoring Escape | `it.fails` (M5) |
| × closes the team profile | Regressions in closing | passes |
| No-record club shows "—", never 0 | Silent 0 for missing club data | passes |
| M3: no historic request with nothing open | The historic build starting on every page | `it.fails` (M3) |

Each `it.fails` test was also run once as a plain test, to confirm it fails
for the stated reason (for example "expected '2,750.00' → 0", "expected
'?teamProfile=1' to be ''", "spy called 2 times"). No production code was
changed.

---

## 8. Final results

| Check | Result |
|---|---|
| `npm run build` | Clean (exit 0; Vite's usual large-chunk warning only) |
| `npm test` | 402/402 passed (server 45, client 357: the 348 from baseline plus 9 new, of which 6 are `it.fails` for H2, M2, M3, M4, M5, L1) |
