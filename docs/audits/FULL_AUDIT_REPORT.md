# FPL Analytics Dashboard — Phase 1 Full Forensic Audit Report

**Date:** 2026-09-21
**Scope:** Full forensic audit per `docs/audits/PHASE-1-FORENSIC-AUDIT-PROMPT.md` — data
accuracy, calculation correctness, the Expected Points model, cross-application
consistency, filters/sorting/state, live UI behaviour, automated test coverage,
architecture/code quality, performance, and requirements/feature regression.
**Method:** Six independent audit streams, each run in isolated context against
the live repository (`C:\FPL Dashboard Project\fpl-dashboard-code-base`, git
HEAD `d7d847b`), cross-checked against `CLAUDE.md` and `README.md`, and — where
possible — against the real, live FPL API (season 2026/27, Gameweek 5 in
progress at time of testing). One stream also drove the real app with a
headless Chromium browser; one stream added real automated tests. This report
consolidates all six streams' findings, independently re-verifies the build
and test results, and adds no new findings of its own beyond reconciling
overlaps between streams.
**This was an audit-only pass.** No production application code was changed.
The one permitted exception (per the audit brief) is Stream E's addition of a
test framework and test files — pure test infrastructure, currently sitting
**uncommitted** in the working tree for your review (see §12 and the Process
Notes below).

---

## Executive summary

The application is, on the whole, **well-engineered and internally
disciplined** relative to its own stated rules. Across all six streams, only
**one Critical-severity defect** was found, and it is a real, direct violation
of the single most specific non-negotiable rule in `CLAUDE.md` (lazy
per-player data fetching) — not a data-correctness or calculation bug. No
defect was found in the core calculation layer (per-90→per-game migration,
percentile methodology, price conversion, xGI validation, clean-sheet scoring,
Expected Points model, Minutes Reliability blend) — every formula traced back
to a single shared implementation, correctly null/zero-safe, with no
inconsistent re-implementation found anywhere. The per-page filter/analysis-mode
isolation fix (a real, previously-shipped bug fix) holds everywhere it was
traced, with no regression. The app's fault-tolerance design (stale-cache
banners, clean error states, race-condition-safe async player switching) held
up under active attempts to break it with a real browser.

Ten **Medium**-severity issues were confirmed: one behavioural/data-fetching
defect (the Critical item's sibling class — see M9), one robustness gap (a
single malformed API record can take down the whole app), three real
UI/state bugs (a broken sort comparator, a missing filter bypass, a
localStorage migration bug that silently reverts a user's customisation), one
confirmed-via-failing-test server resilience defect, and four documentation
staleness issues in `README.md` where the shipped code is correct but the
written record disagrees with it (in one case, disagrees with *itself*).

Eleven **Low**-severity issues were confirmed — mostly documentation
completeness gaps, minor UX rough edges, and modest, code-traced (not
measured) performance opportunities. Ten further items are flagged
**Needs verification**: plausible but not conclusively provable without a
condition this audit could not reproduce (a specific browser input state, a
future upstream API anomaly, etc.) — these are explicitly **not** counted as
confirmed defects, per the audit's own ground rules.

Stream E added a real automated test suite from zero (Vitest, 162 tests
across 18 files) covering the priority areas named in the audit brief, and in
doing so **found one additional confirmed Medium defect via a failing test**
— the strongest evidence tier available. That test suite is currently
uncommitted in the working tree.

**No defect of any severity was found in**: the core `now_cost`/price
conversion; DC-never-substituted-for-tackles/BPS; NaN/Infinity containment;
current-gameweek `is_current` detection and its pre-season fallback; the
xGI = xG+xA validation cross-check; the Expected Points Tier 1/Tier 2
formulas' internal correctness; the Minutes Reliability blend math; the
per-page state isolation architecture; dependency hygiene; or the previously
fixed `useCallback([])` stale-closure bug class (confirmed not to have
recurred anywhere).

---

## 1. Defects by severity — master index

| ID | Severity | One-line summary | Audit area | Evidence tier |
|---|---|---|---|---|
| **C1** | **Critical** | Whole player pool's `element-summary` fetched unconditionally at every app startup, not lazily | Data accuracy (1) | Confirmed, source-traced |
| M1 | Medium | README falsely claims `defensive_contribution` is always 0 in `history_past` | Data accuracy (1) | Confirmed, live-API-verified |
| M2 | Medium | README "Calculation formulas" section shows the old, pre-migration per-90 formulas | Calculations (2) | Confirmed, source-traced |
| M3 | Medium | README's defensive-contribution chart section describes per-90 when code is per-game, and misstates the data source | Calculations (2) | Confirmed, source-traced |
| M4 | Medium | README's Expected Points Tier 2 section contradicts itself (header says unused; later text + code say it's shipped) | Expected Points model (3) | Confirmed, source-traced |
| M5 | Medium | Non-stable sort comparator in Dashboard/Underlying Numbers "Top 5" tiles can non-deterministically drop a tied player | Cross-app consistency (4) | Confirmed, source-traced |
| M6 | Medium | Team Building picker's Min Minutes filter lacks the live-mode bypass every other page has | Filters/state (5) | Confirmed, source-traced |
| M7 | Medium | Dashboard tiles' `migrate()` treats a user-emptied tile list as invalid, silently reseeds packaged defaults | Filters/state (5) | Confirmed, source-traced |
| M8 | Medium | A single schema-invalid player record blocks the *entire* app from loading, not just that player | UI/integration (6) | Confirmed, browser-reproduced |
| M9 | Medium | Stale-cache graceful-degradation fallback is dead code on the normal request path | Testing (7) | **Confirmed via failing test** |
| M10 | Medium | README's "orphaned modules" claim is wrong for `squadRules.ts` — it's live, load-bearing squad-validation logic | Architecture / regression (8, 10) | Confirmed, source-traced |
| L1–L11 | Low | See §7–§9 | various | Confirmed |
| NV1–NV10 | — | Needs verification, not confirmed | various | See §10 |

**Total confirmed: 1 Critical, 10 Medium, 11 Low. Needs-verification: 10 (not counted as defects).**

---

## 2. Critical finding

### C1 — Whole player pool's `element-summary` is fetched unconditionally at every app startup, violating the project's own lazy-loading rule

- **File/function**: `client/src/state/AppStateContext.tsx`, the `loadHistoric`
  mount effect (~lines 246–258), calling `client/src/api/client.ts`'s
  `fetchHistoricBulk()` → `server/src/routes/historicBulk.ts`'s
  `buildBulkHistoricData()`, which calls `GET /api/element-summary/{id}/`
  **once per player in the entire pool** (~600–700 requests,
  `HISTORIC_BULK_CONCURRENCY = 15` at a time).
- **What it currently does**: The effect has an empty dependency array and
  **no gating condition** — it fires on every app mount, regardless of
  whether the user ever opens a single player profile. On a cold server
  cache (first run of the day, or any 12-hour gap), this fires several
  hundred live requests to the official FPL API before the user has done
  anything but load the Dashboard. The code's own comment explains why: a
  previous conditional gate ("only when a page's analysisMode moves off
  live") was removed because every page now defaults off `"live"` anyway, so
  the gate "was already firing on essentially every app load in practice" —
  and was simplified to fire unconditionally instead of being re-designed to
  actually gate on profile-open.
- **What it should do**: Per `CLAUDE.md`'s Data section and Architecture
  section (both state this rule explicitly, near-verbatim) and README's own
  "How the whole-pool historic dataset is fetched" section: *"lazy-loaded per
  player when their detail is viewed, never fetched for every player at
  startup"*.
- **Why it matters**: Direct, unambiguous violation of the single most
  specific data-fetching rule in the project's own non-negotiable rules file.
  It places real load on the official, free, third-party FPL API on every
  cold-cache launch, independent of user behaviour — exactly the outcome the
  lazy rule exists to prevent. It is masked in casual use by the 12-hour
  server cache, which is likely why it survived previous "zero console
  errors" verification passes: it's a behavioural/timing defect, not a crash.
- **How to reproduce**: Restart the server (clears the in-memory cache), load
  the client, and watch server logs or a network proxy — `GET
  /api/historic-bulk` fires immediately, and the server immediately begins
  several hundred `element-summary/{id}` requests, before any profile has
  been opened. Confirmed by direct source read: no conditional gate exists
  before `loadHistoric(false)` in the mount effect.
- **Severity**: Critical. **Confidence**: High.

---

## 3. Audit 1 — Data source accuracy (findings)

Full detail: audit stream A. Live network access to the real FPL API (season
2026/27, GW5) was used throughout to verify findings directly, not just trace
code statically.

**Confirmed:**
- **C1** (above).
- **M1** — README's Career History section states `defensive_contribution` is
  "always 0 in `history_past`... never used for historical analysis." This is
  false — verified directly against the live API (`element-summary/4`,
  Gabriel/Arsenal: DC = 159 in 2024/25, 277 in 2025/26, both non-zero) and
  against the app's own code, which correctly treats DC as real from 2024/25
  onward and *does* use it in Last Completed Season / Historic Average modes
  (`normalizeElementSummary.ts`, `careerMetrics.ts`, `resolvePlayerStats.ts`).
  **The displayed data is correct; only the README text is wrong.**
  Severity: Medium (docs only). Confidence: High.
- **L1** — README's "Known limitations" overstates that team `strength_*`
  fields are entirely unused. `strength_attack_*`/`strength_defence_*` are
  indeed still `0` live (as documented), but `strength_overall_home/away` are
  populated and *are* actively used by Expected Points Tier 2's clean-sheet
  probability model (`expectedPointsV2.ts`). `types/raw.ts`'s own inline
  comment already gets this right — only the README paragraph is stale.
  Severity: Low. Confidence: High.
- **L2** — README's "API endpoints used" summary table omits
  `/api/historic-bulk` and the three `/api/entry/*` endpoints (each is
  documented properly elsewhere in the README, just not in this one
  consolidated table). Severity: Low. Confidence: High.

**Needs verification:**
- **NV1** — `client/src/validation/schema.ts`'s `elementSummaryHistorySchema`
  Zod-defaults several current-season gameweek fields — including
  `defensive_contribution` — to `0` (not `null`) if the API ever omits them.
  Not currently reachable (the live field is always present, confirmed), and
  there's no `fieldAvailability.ts`-style runtime guard the way
  `bootstrap-static`'s advanced fields have. Latent gap, not an observed bug.
  Severity if it ever fires: Medium-High. Confidence: High on the code
  pattern, low on real-world reachability.
- **NV2** — The "Refresh Data" button bypasses cache for `bootstrap-static`
  and `fixtures` only — not `historic-bulk` (separate Retry affordance) or
  per-player `element-summary` (own 30-min TTL). Arguably correct design
  (historic data changes at most once a season), but README's phrasing could
  read as "everything refreshes." Judgment call, not a rule violation.
  Severity: Low. Confidence: Medium.

**Areas checked and found correct** (see stream A's file for full detail):
`now_cost` unit conversion; DC never substituted for tackles/CBI/
recoveries/BPS anywhere; NaN/Infinity containment (`safeDivide` +
`isDisplayable` double guard); current-gameweek `is_current`/fallback logic;
the team-standings live-recompute workaround for permanently-zero
`played`/`win`/`draw`/`loss` fields; player/team ID consistency across
fixtures, entry-import, and bootstrap; server cache TTLs and stale-data
signalling (verified end-to-end into a visible UI banner); request
de-duplication; retry policy (5xx/timeout only, never 4xx); Zod schema
`.passthrough()` design; runtime field-availability detection; and the
documented pre-season zero-vs-null exception in `resolvePlayerStats.ts`.

**Process note (superseded during this audit):** Stream A separately flagged
that `CLAUDE.md`'s "no test suite exists" claim was, at the moment it
checked, already false because test files were appearing mid-session — this
was Stream E's concurrent, in-progress work (see §6/§12), not a pre-existing
suite. By the end of the audit this is real, substantive test infrastructure,
currently uncommitted. `CLAUDE.md`'s testing section will need updating once/if
that work is committed — see Process Notes at the end of this report.

---

## 4. Audit 2 & 3 — Calculation correctness and the Expected Points model (findings)

Full detail: audit stream B. **No confirmed calculation-formula defect was
found anywhere in scope.** Every metric recurrence (goals−xG, assists−xA, xGI
validation, price conversion, per-game rates, clean-sheet points, percentile
population) traces to a single shared implementation. The per-90→per-game
migration is complete and consistent: `per90()` is used nowhere in the
codebase except its one documented, deliberate exception in
`expectedPointsV2.ts`.

**Confirmed (all documentation/comment staleness, not runtime bugs):**
- **M2** — README's "Calculation formulas" section (lines ~267–285) still
  shows `Points/90 = totalPoints/minutes*90` etc. — formulas the app no
  longer computes anywhere. The in-app "Metric Definitions" page
  (`dictionary.ts`, the actual user-facing source of truth) is correct and
  agrees with the code; only this specific README block is stale. Severity:
  Medium (documentation-only, but this is exactly the reference `CLAUDE.md`
  tells future sessions to read before making changes). Confidence: High.
- **M3** — README's "Underlying Numbers — chart methodology" section
  describes the defensive-contribution chart as per-90 and implies the
  X-axis is FPL's raw `defensive_contribution_per_90` field. In code, both
  axes are per-game (`defensiveContributionsPerGame`,
  `defensiveRewardPerGame`) — a different, app-derived denominator than what
  the README describes. Someone reproducing this chart's numbers from the
  README would use the wrong basis. Severity: Medium. Confidence: High.
- **M4** — The README's "Expected Points — Tier 2" section header/intro
  states Tier 2 is "experimental, not wired into any page yet," but 130 lines
  later, in the same section, documents it being wired into Team Building's
  Add Players table after a backtest — and the code confirms the *later*
  claim (`TeamBuilder.tsx` calls `computeExpectedPointsV2ForFixture` and
  exposes it as a live, labelled "Exp. Pts (Model Predicted)" column). The
  app does self-disclose Tier 2's nature to end users via a tooltip — this is
  a documentation-freshness problem, not a hidden-substitution problem.
  Severity: Medium (misleading if a reader stops at the header).
  Confidence: High.
- **L3** — A stale code comment in `TeamBuilder.tsx` (~line 602) misnames
  which function an expensive `useMemo` calls (`computeExpPointsBreakdown`,
  which has zero importers anywhere and is not part of the memo's real
  cost — the memo actually calls `computeBlendedMinutesReliability`,
  `computeExpectedPointsForSingleFixture`, `computeExpectedPointsV2ForFixture`).
  No functional effect. Severity: Low. Confidence: High.

**Needs verification:**
- **NV3** — `percentiles.ts` forces a single-player position bucket to the
  100th percentile (`n <= 1 ? 100 : ...`) rather than null. Plausibly
  intentional for a degenerate sample size; README doesn't specify intended
  behaviour for n=1. Severity if unintended: Low. Confidence: Low.
- **NV4** — `estimatedPointsPerGame`'s `minutes === 0` branch hard-codes
  `games = 1` (by design, so a genuine 0/0 season shows "0.0" not "—"), which
  would silently misbehave only if `totalPoints` were ever non-zero at zero
  minutes — a combination FPL's scoring rules make structurally impossible
  (no defensive-coding failure found reachable in practice). Severity if
  ever reachable: Low. Confidence: Low.

**Calculation inventory** (abbreviated — full table with source files and
per-metric consistency verdicts in the stream B detail file): price, Points/
£m, xG/£m, xA/£m, xGI/£m, Goals/Game, Assists/Game, xG/Game, xA/Game, xGI/
Game, xGC/Game, DC/Game, PPG, Minutes/Point, Minutes/Goal, Minutes/Assist,
Goals−xG, Assists−xA, GI−xGI, xGI validation, percentile (mean-rank formula),
clean-sheet points table, Defensive Reward/Game, Expected Points Tier 1,
Expected Points Tier 2, Minutes Reliability blend, Historic Average
(no-survivorship-bias window), reference-season roll-forward, Playing Time
average minutes, Dashboard rate-stat minimum-sample floor, and squad
budget/composition validation — **every one traced to a single source
implementation with no defect found.** One minor maintainability note (not a
defect): the clean-sheet points-by-position table is duplicated verbatim in
`defensiveReward.ts` and `expectedPointsV2.ts` rather than imported from one
shared constant — currently identical, so harmless today, but a future FPL
scoring-rule change would need updating in two places.

---

## 5. Audit 4 & 5 — Cross-application consistency and filters/sorting/state (findings)

Full detail: audit stream C. **Headline result: the per-page
`analysisMode`/`GlobalScoutingFilters` isolation architecture — a real,
previously-fixed bug — holds everywhere traced, with no regression.**
`AppStateContext.tsx` contains zero filter/mode state (grepped directly).
Every page (Dashboard, Player Explorer, Player Comparison, Team Detail,
Teams, Underlying Numbers' three independent view states, the Player Detail
overlay, Team Building) correctly holds its own local state.
`resolvePlayerStats.ts` is the sole route to mode-dependent stats at every
site checked. Price/ownership are correctly always-live everywhere.

**Confirmed:**
- **M5** — `Dashboard.tsx` and `UnderlyingNumbers.tsx`'s `topN()` sort
  comparator (`(a,b) => a.value < b.value ? 1 : -1`) never returns `0` for
  equal values, violating the comparator contract (not antisymmetric, not
  transitive for 3+-way ties). FPL data has frequent exact ties on integer
  stats (0 bonus, 0 assists, 0 clean sheets), so which specific players land
  in a "Top 5"/"Bottom 5" tile at a tie boundary is implementation-defined,
  not a real ranking decision, and isn't guaranteed stable across renders.
  Dashboard's "Bottom 5" path compounds this by reversing the
  already-broken descending sort rather than sorting ascending directly. Fix
  is a one-line comparator change (`(b.value - a.value)`, matching the
  already-correct comparators in `TeamDetail.tsx`/`BarTopN.tsx`). Severity:
  Medium. Confidence: High on the defect; medium-high on real-world
  visibility (not directly observed live).
- **M6** — Team Building's Add Players picker has its own opt-in Min Minutes
  filter (`pickerMinMinutes`) with **no live-mode bypass**, unlike every
  other page's `effectiveMinMinutes()` (which forces the threshold to 0 in
  Current Season mode specifically to prevent the exact failure this filter
  is now exposed to). A user who sets a minutes threshold and then switches
  the picker to Current Season mid-season sees the candidate pool silently
  collapse with no explanation — the same failure class the rest of the app
  was explicitly hardened against. Severity: Medium (opt-in, so most users
  never hit it — but it's a real regression of a previously-fixed failure
  mode in one specific control). Confidence: High.
- **M7** — `useSummaryTiles.ts`'s `migrate()` treats a genuinely-empty tile
  array (`data.length === 0`) as invalid and returns `null`, which
  `loadVersioned()` turns into the packaged `DEFAULT_SUMMARY_TILES` — i.e., a
  user who deliberately removes every Dashboard tile has that choice
  silently reverted on next load. The sibling `useSavedSquads.ts` store
  handles this correctly (`if (!Array.isArray(data)) return null` — no
  length check, with an explicit comment that an empty list is legitimate).
  `Dashboard.tsx`'s own render logic already supports a clean zero-tile
  state ("No tiles yet — add one above."), so there's no technical reason
  for the asymmetry. This is the same "does an edge case survive `migrate()`"
  bug class README documents as already having been fixed once for Default
  saved views — a live, unfixed instance of the same class in a sibling
  store. Severity: Medium (silent reversion of explicit user customisation,
  no data loss). Confidence: High.

**Needs verification:**
- **NV5** — `resolvePlayerStats.ts` never resolves `saves`/`savesPerGame` per
  analysis mode in `lastSeason`/`historicAverage` branches (both fields keep
  whatever the *live* player object had). Violates the "one shared resolved
  source" contract in principle, but an exhaustive grep found **zero current
  UI readers** of the mode-resolved value — latent, not currently visible.
  Severity: Low (currently unreachable). Confidence: High on the code fact.
- **NV6** — `FiltersBar.tsx`'s and `TeamBuilder.tsx`'s Min Minutes number
  inputs compute `Math.round(Number(e.target.value)/STEP)*STEP` with no
  `Number.isNaN` guard; a browser-dependent intermediate invalid typed value
  (e.g. a bare `-`) could in principle produce `NaN` in state, contrary to
  `CLAUDE.md`'s explicit "never let NaN reach the UI" rule. Could not confirm
  a real browser actually fires `onChange` with such a value. Severity: Low.
  Confidence: Medium.
- **NV7** — `useColumnFilters.ts`'s "Equal to" column filter uses strict
  `!==` against computed (divided/multiplied) metrics, which could in theory
  under-match a value like "2.34" if the underlying float is
  `2.3400000000000003`. Not confirmed against any real computed value in
  this app. Severity: Low. Confidence: Low.
- **NV8** — `useSortSpec.ts`'s header-click direction toggle only applies
  when the clicked column is the *sole* active sort key; re-clicking the
  primary column while a shift-added secondary sort is active always resets
  to descending rather than toggling. Possibly intentional design (code
  comment supports this reading). Severity: Low. Confidence: Medium.

**Other things checked and found correct:** null-safe sort comparators
elsewhere (`compareSortValues`'s two documented null-handling modes);
`colorScale.ts`'s tie-safe (`max === min`) short-circuit; `filterPlayers()`'s
correct retention (never silent-drop) of null-minutes players; column-filter
draft/cancel isolation; every page's "Clear Filters"/"Reset" correctly
resetting its own full filter state (and consistently *not* resetting
`analysisMode`, on every page that has both); no pagination/virtualisation
exists anywhere (so that Audit 5 sub-question doesn't apply); the shared
player-search implementation used identically by every page; each saved User
Analysis graph's view state fully isolated from every other graph and from
the page underneath it.

---

## 6. Audit 6 — UI / integration testing (findings)

Full detail: audit stream D. **Browser automation fully worked** — Playwright
+ headless Chromium drove the real dev servers (Express :4000, Vite :5173)
against live FPL API data (GW5, 667 players). Coverage: initial load, all 7
pages, SPA navigation (confirmed zero extra API calls), player selection/
overlay, 8-player rapid-switch race-condition stress test, Player Comparison,
empty-filter states, Refresh Data (success and failure paths), full API
failure on a fresh load, a simulated malformed-payload injection, three
viewport sizes, and full console/network capture across ~15 scenarios. The
Electron desktop app itself was **not** tested (out of scope for this pass —
only the web dev servers were driven).

**Confirmed:**
- **M8** — Using route interception to simulate a single upstream record
  with `now_cost: null` and a missing `total_points` (both required,
  non-nullable in the Zod schema), the **entire app fails to load — 0
  players anywhere**, not just the corrupted record, even though
  `normalizePlayers.ts` already has a per-player `skippedCount` mechanism for
  exactly this kind of individual bad record. Schema validation is
  all-or-nothing over the whole `elements` array, so it fails closed on a
  single bad record before normalization's own per-player skip logic ever
  runs. This is the opposite of `CLAUDE.md`'s own stated principle ("A bad
  field, unmatched player, or unrecognised value produces a warning, not a
  broken page") for this specific failure class. The error state shown is
  clean and specific (no crash, no blank screen, a "Try again" button) — this
  is a scope/blast-radius issue, not a robustness-vs-crash issue. Requires an
  external precondition (a real upstream schema violation) not observed
  happening live during this session, only simulated. Severity: Medium.
  Confidence: High (directly reproduced with exact error text and
  screenshot).
- **L4** — The `[metric-validation]` console warning (xGI = xG+xA
  cross-check) fires a false positive on real, correct data due to IEEE-754
  floating-point representation error exactly at the 0.01 tolerance boundary
  (`0.4 - 0.39 === 0.010000000000000009` in JS, which is `> 0.01`).
  Reproduced deterministically on the live player pool (Thomas-Asante, GW5).
  Undermines the check's "never silently concealed" design intent, since a
  real discrepancy is currently indistinguishable from this artifact.
  Severity: Low (console/dev-facing only). Confidence: High.
- **L5** — At a 480px viewport width, the sidebar nav overlaps the main
  content and wraps/clips awkwardly ("User Guide" cut off). 1024px and
  1920px both reflow cleanly. Given this ships primarily as a Windows
  Electron desktop app (not a responsive website, per `CLAUDE.md`), real-world
  impact is limited to an unusually narrow desktop window. Severity: Low.
  Confidence: High.

**Needs verification:**
- **NV9** — `bootstrap-static` and `fixtures` are each fetched twice on every
  fresh dev-mode load. Root cause identified with high confidence:
  `main.tsx` wraps the app in `React.StrictMode`, which deliberately
  double-invokes effects in development only — this does not occur in a
  production build (not independently verified against a production build
  in this pass, since only the dev servers were run per the audit's own
  instructions). Severity if also present in production: would be Medium; in
  dev it's cosmetic. Confidence: High on cause, none on production
  behaviour.
- **NV10** — `useColumnCustomization.ts`'s column-resize drag listeners are
  attached to `window` and only removed on `pointerup`, not on component
  unmount via a `useEffect` cleanup. A user starting a drag and navigating
  away before releasing the pointer could theoretically leave a stale
  listener referencing an unmounted component's closures — though it
  self-heals on the very next `pointerup` anywhere on the page, and could not
  be reliably reproduced via Playwright. Severity: Low. Confidence: Low.
- Loading-state screenshot attempt was inconclusive (dev server responds too
  fast to catch a genuine loading skeleton) — a coverage gap, not a finding.

**Explicitly confirmed working correctly** (properties the audit brief asked
to actively try to break): race-condition-safe rapid player-profile
switching (8 players switched in ~40ms increments, final overlay always
showed the last-clicked player's correct data, no cross-contamination);
per-page state isolation confirmed at the network level (zero extra API
calls across 7 in-app navigations); clean, non-crashing error states for
both a fresh-load API failure and a failed manual refresh (previously-loaded
data stays visible under a clear banner); explicit, non-alarming empty-filter
messaging; zero React key warnings, unhandled promise rejections, or failed
network requests across all ~15 scenarios tested.

---

## 7. Audit 7 — Automated test coverage

Full detail: audit stream E. Confirmed independently by re-running the suite
myself (see §12 for exact output).

**Baseline confirmed:** zero test/lint scripts existed anywhere in the repo
at the start of this audit — matches `CLAUDE.md`'s claim exactly.
`npm run build` passed cleanly (both packages type-check, Vite build
succeeds).

**What was added:** Vitest 2.1.9 to both workspaces (client: + jsdom +
@testing-library/react for the two hook-migration tests; server: vitest
only), `test`/`test:watch` scripts in all three `package.json` files, two
vitest configs, two non-production test-fixture helper files, and **18 test
files, 162 tests** covering every function named in the audit brief's
priority list. Full per-file breakdown and exactly what each file protects
against is in §12. **No production application code was modified** — the
only non-test files touched are the three `package.json`s (scripts/deps) and
`package-lock.json` (regenerated by `npm install`).

**One additional confirmed defect, found via a failing test (M9)** — see §5's
sibling entry and full writeup below in §8. This is the single
highest-confidence finding in the whole audit: a real assertion failure
against the actual shipped code, not a trace-based inference.

**What remains untested** (time-boxed out, documented rather than silently
skipped): `expectedPoints.ts`/`expectedPointsV2.ts` (the two largest,
most formula-dense metric files — the highest-value follow-up target);
`normalizeElementSummary.ts`'s DC-placeholder-nulling logic tested only
indirectly; several smaller normalize-layer files; `playerSearch.ts`'s
fuzzy-match/edit-distance logic tested only via one straightforward case;
`optimalDraft.ts`, `transferSolver.ts`, `squadRules.ts`, `chipPlanner.ts`,
`fixtureTicker.ts`, `rotationIndicators.ts`, `radarStats.ts`,
`careerTrends.ts`, `playerMetrics.ts` (not in the audit's explicit priority
list); `httpClient.ts`'s retry/backoff/timeout logic (used, mocked, as a
dependency of the proxy tests, but not tested in its own right — worth
covering given it's the same "easy to get subtly wrong" timing-logic
category the brief specifically prioritized); and Express route-handler
wiring (thin orchestration, lower marginal value). Anything requiring the
live API or a real browser (field-availability behaviour, visual rendering,
Electron packaging/auto-update) is out of scope for unit tests and was
instead covered by Stream D.

---

## 8. Audit 8 — Code quality / architecture (findings)

Full detail: audit stream F, cross-validated against Stream E's failing test.

**Confirmed:**
- **M9** — `server/src/proxy.ts`'s `cachedFetch()` normal (non-`bypassCache`)
  path calls `TtlCache.get()` first, which **deletes an expired entry as a
  side effect the moment it's read**, before returning `undefined`. If the
  subsequent upstream `fetchJson` call then fails, the `catch` block's
  `cache.getStale()` fallback finds nothing — the entry is already gone — so
  the request fails outright with a real error instead of the documented
  "fall back to stale cache on upstream failure" graceful degradation
  (`CLAUDE.md`: *"Server routes fall back to stale cache on upstream failure
  rather than erroring outright"*). The stale-fallback path is only actually
  reachable via an explicit `bypassCache: true` manual-refresh request, which
  skips the initial `get()` call. This defeats the resilience feature for
  every ordinary (non-manual-refresh) request across all six cached data
  domains, exactly when the FPL API is unstable — the scenario the feature
  exists for. **Confirmed via a failing test** (`server/src/proxy.test.ts`,
  left failing and documented per the phase-1 rules, not weakened) and
  independently reproduced at the `TtlCache` level too. Severity: Medium (no
  data corruption, but a real, live-traffic-relevant resilience gap).
  Confidence: Highest available — direct test failure against real code, not
  an inference.
- **M10** — README's dead-code claim (naming `optimalDraft.ts`,
  `squadRating.ts`, `transferSolver.ts` as orphaned) is stale/wrong: there is
  no `squadRating.ts` in the repo (only `squadRules.ts`), and `squadRules.ts`
  is **not** orphaned — `validateSquad`, `validateStartingXI`, `canAddPlayer`
  are actively imported and called by `TeamBuilder.tsx` (the live
  add-player-legality check) and `SquadPitch.tsx`. This is load-bearing
  business logic mislabeled as dead code in the docs — a real risk that a
  future cleanup pass, trusting the README, could delete it and break Team
  Building's squad-building flow. Severity: Medium (documentation-risk, not
  a current runtime bug). Confidence: High.
- **L6** — `optimalDraft.ts` (327 lines) and `transferSolver.ts` (142 lines)
  **are** genuinely orphaned as claimed (zero importers anywhere, confirmed
  via export-symbol grep) — 469 lines of confirmed dead code, a real cleanup
  opportunity. Severity: Low. Confidence: High.
- **L7** — `TeamBuilder.tsx` (1,276 lines) is the largest, most complex
  component by a wide margin (next largest: `PlayerDetailOverlay.tsx` at
  705). Mixes picker filtering/sorting, two Expected-Points computations,
  squad-rule validation, captain/vice-captain state, CSV export, and
  drag/resize logic in one file. Not flagged as causing any current bug —
  the file is extensively self-documented (including an inline note about a
  previously-fixed Rules-of-Hooks bug caused by this complexity, and
  carefully-scoped `useMemo` dependencies) — but is a genuine maintainability
  and onboarding cost, and further growth without splitting increases risk.
  Severity: Low (maintainability, not correctness). Confidence: High on the
  measurement.

**Confirmed — positive (no defect, stated for completeness):** the
`useCallback([])` stale-closure bug class `CLAUDE.md` names as a recurring
historical pattern has **not** recurred anywhere in the current codebase —
all 5 `useCallback([])` call sites either correctly use the documented
ref-based fix or the functional-updater form (immune to the bug
structurally). `any` usage is narrow and confined to 6 Recharts
tooltip-prop-typing workarounds in 4 chart files, never touching application
data flow. Non-null assertions (`!`) occur exactly once in the entire
codebase, inside the already-confirmed-dead `optimalDraft.ts` — production
code paths have zero. Dependency hygiene is exact in both `package.json`
files (every declared dependency used, every import declared, in both
directions). The archetype-system removal and the `resetTiles()`→saved-views
replacement (both previously-documented feature changes) were verified fully
clean — zero residual dead code, orphaned types, or leftover references in
either case.

---

## 9. Audit 9 — Performance / API efficiency (findings)

All items below are **code-traced, not measured against a running app** (per
the audit stream's honesty requirement, and consistent with the project
owner's own preference to test in-app personally). Each is labelled by
whether the underlying mechanism is demonstrated (confirmed in code) versus
whether real-world perceptible impact is theoretical (unmeasured).

**Confirmed, demonstrated mechanism:**
- **L8** — `AppStateContext.tsx`'s initial `load()` fetches `bootstrap-static`
  fully to completion before even starting the separate `fixtures` fetch,
  despite the code's own comment stating "Fixtures load independently of
  bootstrap." Could run concurrently (`Promise.allSettled`) to make total
  initial-load latency `max(bootstrap, fixtures)` instead of the sum. Pays
  this cost on every launch, background poll, and manual refresh. Severity:
  Low-medium. Confidence: High (traced, not timed).
- **L9** — Reopening the same player's profile within a session always
  re-fetches, re-validates (Zod), and re-normalizes client-side — no
  per-player-id cache inside `usePlayerHistory.ts`. Does **not** hit the live
  FPL API repeatedly (the server's own 30-minute cache protects that) — the
  cost is confined to an extra client↔local-proxy round trip and re-render.
  Severity: Low. Confidence: High.
- **L10** — "Refresh Historic Data" only bypasses the top-level
  `historic-bulk` cache; the nested per-player `element-summary` and
  `bootstrap-static` `cachedFetch` calls inside `buildBulkHistoricData()`
  carry no `bypassCache` flag, so they can silently serve already-cached
  per-player data despite the user explicitly requesting a refresh. Low
  real-world impact since `history_past` is documented as immutable
  mid-season, but the button's implied "force refresh" contract isn't fully
  honored end-to-end. Severity: Low. Confidence: High.
- **L11** — Player Explorer's main table has no virtualization (no
  `react-window`/`react-virtual` anywhere in the codebase) and the search
  input has no debounce — every keystroke recomputes the full filtered/
  sorted ~600–700-row set via the (necessarily reactive) `useMemo` chain,
  and individual `<tr>`s are not `React.memo`'d. This is the textbook shape
  of a table that gets janky to type in as row count grows. Severity:
  low-medium, contingent on real hardware/row count — **not measured live**.
  Confidence: High on mechanism, unverified on perceived impact.

**Needs verification / dev-only:**
- **NV9** (cross-referenced from §6) — StrictMode double-fetch, dev-only,
  mitigated by server-side in-flight request de-duplication either way
  (confirmed: the upstream FPL API is never hit twice even under this
  double-fire, only the client→local-proxy hop is duplicated, and only in
  development).

**Confirmed — positive:** `element-summary` lazy-loading matches its
documented contract at the single-fetch-trigger level (re-fetch-on-reopen is
the separate L9 finding above); the server cache/proxy layer's TTL tiering,
in-flight de-duplication, and stale-fallback design are well-engineered
(modulo the M9 side-effect bug); Dashboard, Player Comparison, Underlying
Numbers, and Player Explorer all compute derived data via correctly-scoped
`useMemo` with no `useEffect`-chain re-render cascades (Dashboard in
particular has zero `useEffect` calls at all).

---

## 10. Needs-verification appendix (not confirmed defects)

Per the audit's own ground rules, these are explicitly **not** counted in the
defect totals — each is plausible but could not be conclusively proven
without a condition this audit could not reproduce (a specific live-API
anomaly, a specific browser input edge case, or a production-build
measurement). Listed here for completeness and so a future pass knows what
was considered and why it wasn't escalated.

| ID | Summary | Why unconfirmed | If confirmed |
|---|---|---|---|
| NV1 | Zod schema defaults DC and other fields to `0` if the API ever omits them | Field always present in current live data; no guard exists but is untriggered | Medium-High |
| NV2 | "Refresh Data" scope narrower than README's phrasing implies | Arguably correct by design, not a rule violation | Low |
| NV3 | Single-player percentile bucket forced to 100th percentile | Plausibly intentional for a degenerate sample; no documented spec either way | Low |
| NV4 | `estimatedPointsPerGame`'s 0-minutes branch assumes 0 points too | Combination is structurally impossible under FPL's real scoring rules | Low |
| NV5 | `resolvePlayerStats` never resolves `saves`/`savesPerGame` per mode | Zero current UI readers found via exhaustive grep | Low |
| NV6 | Possible `NaN` in Min Minutes number inputs from an invalid intermediate typed value | Requires a specific real-browser input-event edge case not reproduced | Low |
| NV7 | Floating-point-sensitive exact-equality column filter | No concrete failing value found in this app's actual computed metrics | Low |
| NV8 | Sort-toggle always resets to descending when a secondary sort is active | Plausibly intentional design, per the code's own comment | Low |
| NV9 | Duplicate bootstrap/fixtures fetch — confirmed dev-only (StrictMode), production unverified | Only dev servers were run, per audit instructions | Medium if also in production (unlikely) |
| NV10 | Column-resize listeners cleaned up only on `pointerup`, not unmount | Self-healing; could not reproduce a real leak via Playwright | Low |

---

## 11. Recommended remediation order

Ordered by correctness impact, user impact, reproducibility, scope, and
regression risk — **not** by how the findings happened to be discovered.
This ordering is a recommendation for Phase 2, not an instruction executed in
this phase.

1. **C1** — Gate the historic-bulk fetch behind actual need (or explicitly
   accept and re-document the always-fetch design if that's now the intended
   behaviour — but the current state contradicts the project's own written
   rule and should not simply stay silently inconsistent with it). Highest
   priority: direct rule violation, real external-API load, affects every
   launch, trivial to reproduce.
2. **M9** — Fix `TtlCache.get()`'s eager delete-on-read so the stale-fallback
   path is reachable on the normal request path, not just manual refresh.
   Confirmed via failing test (already written — this fix should make that
   test pass without weakening it); restores a documented resilience
   guarantee across all six cached domains.
3. **M8** — Make bootstrap-static parsing degrade per-record instead of
   failing the whole array closed on one bad record, consistent with
   `normalizePlayers.ts`'s existing `skippedCount` mechanism and
   `CLAUDE.md`'s own "graceful degradation over crashes" principle. Whole-app
   blast radius if it ever fires against the real live API.
4. **M5** — One-line comparator fix in `Dashboard.tsx`/`UnderlyingNumbers.tsx`'s
   `topN()`. Low effort, user-visible (which players appear in a leaderboard
   tile), no architectural risk.
5. **M7** — Align `useSummaryTiles.ts`'s `migrate()` with
   `useSavedSquads.ts`'s correct empty-array handling. Low effort, directly
   prevents silent reversion of user customisation, same bug class already
   fixed once elsewhere in this exact file's history.
6. **M6** — Add the live-mode Min Minutes bypass (or an explicit disabled/
   labelled state matching `FiltersBar`) to Team Building's picker. Opt-in
   control, so narrower blast radius, but same failure class the rest of the
   app was specifically hardened against.
7. **Documentation sync pass** (M1, M2, M3, M4, M10, L1, L2) — batch these
   together: all are README corrections with zero code risk, all independently
   confirmed, and `CLAUDE.md` explicitly tells future sessions to treat
   README as a maintenance reference, so leaving it stale compounds over
   time.
8. **L6** — Delete confirmed-dead `optimalDraft.ts`/`transferSolver.ts` (469
   lines), *after* correcting the README claim in step 7 so the two changes
   don't get conflated with the still-live `squadRules.ts`.
9. **L3, L4** — Trivial, zero-risk fixes (stale comment; floating-point
   epsilon in the validation tolerance check).
10. **L8–L11** (performance items) and **L5, L7** (UX/maintainability) — lowest
    priority; all Low severity, several unmeasured against real usage. Worth
    picking up opportunistically or if user-reported, not urgent on their
    own.
11. **NV1–NV10** — no action required unless one is independently observed to
    actually occur; re-assess at that point rather than pre-emptively fixing
    unconfirmed behaviour.

---

## 12. Test suite added during this audit

18 new test files, 162 tests (161 passing, 1 failing by design — it exposes
M9 and should start passing once M9 is fixed, not before). Added to both
`client/` and `server/` workspaces via Vitest. **Currently uncommitted** —
see Process Notes below.

| File | Tests | Protects against |
|---|---|---|
| `client/src/metrics/calculations.test.ts` | 22 | Divide-by-zero returning `null` not `NaN`/`Infinity`; the documented always-round-up `estimatedGamesFromMinutes` rule; the deliberate zero-vs-null exception in `estimatedPointsPerGame`; reproduction of the exact "180 points/90 from a 1-minute cameo" bug the app moved away from; null propagation in goals−xG/assists−xA. |
| `client/src/metrics/percentiles.test.ts` | 8 | The mean-rank percentile formula, independently re-derived; tie handling; the n≤1 special case; minimum-minutes and metric-null population exclusion; per-position isolation. |
| `client/src/metrics/validation.test.ts` | 7 | The xGI = xG+xA cross-check and its exact 0.01 tolerance boundary; null-input skip behaviour; the "never silently concealed" contract. |
| `client/src/metrics/resolvePlayerStats.test.ts` | 8 | Pre-season zero-vs-null handling; live-mode per-game rates; every player always retained (never dropped); price always resolving live even in historic modes; `noDataCount` accounting. |
| `client/src/metrics/historicAnalysis.test.ts` | 11 | Reference-season roll-forward; the 4-season window's exact cutoff-year arithmetic; last-completed-season never falling back further; the no-survivorship-bias window average genuinely including light seasons (hand-verified). |
| `client/src/metrics/minutesReliabilityBlend.test.ts` | 7 | The full blend pipeline, hand-computed independently for several scenarios; the `currentWeight` boundary; ownership-signal capping; the injured-player-with-perfect-history-still-shows-~0 composition. |
| `client/src/metrics/defensiveReward.test.ts` | 9 | The clean-sheet-points-by-position table; null propagation instead of silent-zero when a component is missing. |
| `client/src/normalize/fieldAvailability.test.ts` | 6 | Runtime field detection sampling every element (not just the first); correct default when a list is empty. |
| `client/src/normalize/normalizePlayers.test.ts` | 11 | `now_cost`→£m conversion; structurally-broken-record skipping with correct `skippedCount`; advanced fields staying null when unavailable; malformed numeric strings never reaching the UI as `NaN`. |
| `client/src/normalize/gameweek.test.ts` | 8 | `is_current` detection; the full documented fallback chain; a completed gameweek never mislabelled current. |
| `client/src/state/persistentStorage.test.ts` | 9 | The generic versioned-envelope contract end to end: fallback-on-nothing-stored, real old-shape-to-new-shape migration, un-enveloped legacy data, fallback (not crash) on a null migration result, corrupt JSON, `localStorage` throwing. |
| `client/src/state/useSummaryTiles.test.tsx` | 5 | The real, shipped v2→v3 tile migration, exercised through the actual hook against real `localStorage`. |
| `client/src/state/useSavedDashboardViews.test.tsx` | 5 | The real, shipped self-healing "missing Default view" migration, through the actual hook. |
| `client/src/state/useFilteredPlayers.test.ts` | 10 | The live-mode Min Minutes bypass; AND-combination filtering; null-safe minutes retention; the inclusive `>=` boundary. |
| `client/src/state/useSortSpec.test.ts` | 7 | Both documented null-handling sort modes; asc/desc symmetry. |
| `server/src/cache.test.ts` | 10 | TTL expiry boundary correctness; `getStale()` in isolation; **`get()`'s expired-entry deletion side effect — the root cause of M9**. |
| `server/src/concurrency.test.ts` | 7 | The worker pool respecting its concurrency limit; result order matching input order even under out-of-order completion; per-item error capture without failing the whole batch. |
| `server/src/proxy.test.ts` | 12 (11 pass, 1 fails by design) | Cache-hit/miss behaviour; `bypassCache` forcing a refetch; true concurrent request de-duplication (proven with a manually-resolved promise); upstream-error status mapping; **the stale-cache fallback — the failing test that surfaces M9**. |

---

## 13. Final check-suite run (re-verified independently by the orchestrating session)

All commands below were re-run directly against the current working tree
after all six audit streams completed, to independently confirm every
stream's self-reported numbers rather than taking them on trust.

**Build** (`npm run build` — server `tsc -p tsconfig.json`, then client
`tsc -b && vite build`):
```
✓ Both packages type-check clean, zero errors.
✓ Vite production build succeeds (923 modules, ~3.7s).
  (Pre-existing, unrelated warning: main bundle >500kB — a known,
  already-documented characteristic of this build, not introduced by
  anything in this audit.)
```

**Tests** (`npm test` at root → `npm run test -w server && npm run test -w client`):
```
Server:  Test Files  1 failed | 2 passed (3)
              Tests  1 failed | 28 passed (29)
  → the 1 failure is proxy.test.ts's stale-cache fallback test — confirmed
    reproducing M9, left failing and documented per the phase-1 rules
    (root npm test exits non-zero because of this; that is correct,
    intentional `&&`-chain behaviour surfacing the real finding, not a
    setup bug).

Client:  Test Files  15 passed (15)
              Tests  133 passed (133)
```
**Combined: 162 tests, 161 passing, 1 failing by design (documents M9).**

**Lint**: No lint script exists in any package (root, `server/`, `client/`) —
confirmed directly, matches `CLAUDE.md`'s claim. Not part of this audit's
remit to add.

---

## Process notes (for you, not findings about the app)

- **The test suite (§12) is real and currently sits uncommitted** in the
  working tree (`git status`: modified `package.json`/`client/package.json`/
  `server/package.json`/`package-lock.json`; 18 new untracked test files +
  2 fixture files + 2 vitest configs). Nothing was committed, per your
  standing rule that commits only happen when you explicitly ask. Review with
  `git status`/`git diff` when convenient; if you decide to keep it,
  `CLAUDE.md`'s "Test" section ("no automated test suite exists in any
  package") will need a one-line update to match.
- Two streams (E and F) independently flagged that the working tree was
  mutating *during* the audit because Stream E's test-writing ran
  concurrently with the other read-only streams, all against the same
  shared directory (this environment has no per-agent worktree isolation for
  subagents). This did not corrupt any stream's findings — Stream F
  explicitly re-based its own conclusions against git HEAD rather than the
  in-flight drift — but it's worth knowing if you run a similar multi-stream
  audit again.
- Screenshots and raw evidence (console logs, network captures, per-test JSON
  detail) from Stream D's browser testing are sitting in this session's
  scratchpad directory, not the repo. They aren't committed anywhere and may
  not persist — let me know if you'd like any of them preserved somewhere
  durable before they're cleaned up.
