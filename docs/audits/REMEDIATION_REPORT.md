# Phase 2 — Remediation Report

**Date:** 2026-09-21
**Input:** `docs/audits/FULL_AUDIT_REPORT.md` (Phase 1 forensic audit, HEAD `d7d847b`)
**Scope:** Systematically remediate confirmed issues from the audit, per
`docs/audits/PHASE-2-REMEDIATION-PROMPT.md`. Nothing was committed —
everything below sits in the working tree for review, matching this
project's standing rule that commits only happen on explicit request.

## What was in scope, and what wasn't

The audit confirmed **1 Critical, 10 Medium, 11 Low** issues, plus 10
"needs verification" items explicitly not counted as defects. Per the
audit's own recommended order and rules ("don't fix a suspected issue
without verifying it yourself first"), this pass addressed:

- The Critical finding (C1)
- All 10 Medium findings (M1–M10)
- 4 of 11 Low findings: L3, L4, L6 (trivial/zero-risk, as the audit itself
  recommended bundling), plus L5, L8, L10 (small, contained, user-approved
  after a mid-pass scope check — see below)
- CLAUDE.md's "no test suite" line, now stale since a real Vitest suite
  exists (flagged in the audit's own Process Notes)

**Not addressed, by explicit user decision mid-pass:** L7 (splitting
`TeamBuilder.tsx` — a large refactor with no correctness bug behind it),
L9 (per-player-id client cache in `usePlayerHistory.ts`), L11 (Player
Explorer table virtualization/search debounce). All three are Low
severity, the audit itself called them "opportunistic, not urgent," and
L9/L11 specifically carry more implementation/regression surface for a
benefit the audit could only trace in code, never measure. **Not
addressed at all:** none of NV1–NV10 (needs-verification items) — per the
audit's own rule, none were independently observed to actually occur
during this pass, so none were "fixed" pre-emptively.

One judgment call was surfaced to the user before implementation rather
than decided unilaterally: **C1's actual fix shape** (the audit flagged
two valid paths — gate the fetch behind real demand, or keep it
unconditional and fix the documentation instead). The user chose to gate
behind real demand; see C1 below for what that meant in practice.

---

## C1 (Critical) — Whole-pool historic fetch not gated on demand

**Root cause:** `AppStateContext.tsx`'s `loadHistoric` mount effect fired
unconditionally on every app load, regardless of whether any page/component
actually needed lastSeason/historicAverage-mode stats yet — a direct
violation of CLAUDE.md's lazy-loading rule, even though in practice every
page defaults to `"lastSeason"` and needs the data almost immediately
anyway.

**Fix:** Replaced the unconditional mount effect with a `requestHistoricData()`
function exposed from `AppStateContext` — idempotent (guarded by the
existing `historicRequestedRef`), triggers the fetch on first real call.
Every page/component that resolves player stats in a non-`"live"` mode
now calls it in a `useEffect` on mount: `Dashboard.tsx`, `PlayerComparison.tsx`,
`PlayerExplorer.tsx`, `UnderlyingNumbers.tsx`, `Teams.tsx`, `TeamDetail.tsx`,
`TeamBuilder.tsx`, `PlayerDetailOverlay.tsx`.

**Files changed:** `client/src/state/AppStateContext.tsx`, and the 8 files
above.

**Test:** No new automated test (this is a data-fetch-timing behavior, not
a pure function) — verified by typecheck passing and by tracing every
`historicProfiles`/`allTimeSeasonsByPlayerId` consumer to confirm each has
its own `requestHistoricData()` call, so no page silently loses historic
data.

**Verification performed:** `npx tsc -b` clean on client. Manual code trace
confirming every consumer calls the new trigger (grepped all
`historicProfiles`/`allTimeSeasonsByPlayerId` reads against
`useAppState()` call sites).

---

## M9 — `TtlCache.get()` deleted an expired entry as a side effect, killing the stale-cache fallback

**Root cause:** `server/src/cache.ts`'s `get()` deleted an expired entry
before returning `undefined`. `proxy.ts`'s `cachedFetch()` calls `get()`
first on every normal request; if the upstream fetch then failed, the
catch block's `getStale()` call found nothing — the entry was already
gone. This defeated the documented "fall back to stale cache on upstream
failure" resilience guarantee for every ordinary request, only working via
an explicit `bypassCache: true` manual refresh.

**Fix:** `get()` no longer deletes the entry on expiry — it still refuses
to return an expired value (unchanged contract for `get()`'s own callers),
but leaves it in the store for `getStale()` to find.

**Files changed:** `server/src/cache.ts`.

**Test updated/added:** `server/src/cache.test.ts` — the two tests that
previously *asserted the buggy behavior as correct* ("get() deletes the
expired entry...") were rewritten to assert the fixed contract (an expired
entry survives a `get()` call for `getStale()` to find). This is a
deliberate correction of tests that encoded the defect, not a weakening —
the audit's own test-writing pass (Stream E) had already flagged this
exact interaction as the root cause.

**Verification performed:** The audit's own pre-existing failing test
(`server/src/proxy.test.ts`'s "falls back to a stale cache entry... when
upstream errors") now passes without any change to its assertion. Full
server suite: 31/31 passing (was 28/29 passing, 1 failing by design,
before this fix).

---

## M8 — A single malformed player record failed the whole bootstrap-static parse closed

**Root cause:** `client/src/validation/schema.ts`'s `bootstrapStaticSchema`
validated `elements: z.array(elementSchema)` — Zod's array validation is
all-or-nothing, so one record with e.g. `now_cost: null` (required, but
present in real broken responses) or a missing `total_points` failed the
*entire* array, throwing before `normalizePlayers.ts`'s own per-record
`skippedCount` mechanism ever ran. Reproduced by the audit with 0 players
loading anywhere, despite the rest of the pool being valid.

**Fix:** `elements` is now validated as `z.array(z.unknown())` at the
top level (still fails closed if `elements` itself isn't an array, or if
`teams`/`element_types`/`events`/`element_stats` are malformed — those
really do mean the response can't be trusted). A new
`parseBootstrapStatic()` function then validates each element individually
against `elementSchema`, keeping valid records and counting invalid ones.
`fetchBootstrap()` in `api/client.ts` now returns `skippedElementCount`
alongside the data; `AppStateContext.tsx` combines it with
`normalizePlayers`' own `skippedCount` into one user-facing
`skippedPlayerCount`. `UserGuide.tsx`'s explanatory copy was updated to
describe both possible reasons a record could be excluded (previously
only mentioned "unknown team or position id").

**Files changed:** `client/src/validation/schema.ts`,
`client/src/api/client.ts`, `client/src/state/AppStateContext.tsx`,
`client/src/pages/UserGuide.tsx`.

**Test added:** `client/src/validation/schema.test.ts` (new file, 4
tests) — reproduces the audit's exact repro (`now_cost: null`, missing
`total_points` on one of three records) and confirms 2 valid records
survive with `skippedElementCount: 1`; confirms 0-skipped on an
all-valid payload; confirms the top-level structure still fails closed
when genuinely broken (`teams` missing entirely, or `elements` not an
array at all).

**Verification performed:** New test suite passes (4/4). Full client
typecheck clean.

---

## M5 — Non-stable sort comparator in Dashboard/Underlying Numbers "Top 5" tiles

**Root cause:** `topN()` in both `Dashboard.tsx` and `UnderlyingNumbers.tsx`
used `(a, b) => a.value < b.value ? 1 : -1`, which never returns `0` for
equal values — not antisymmetric, not transitive for 3+-way ties. FPL data
has frequent exact ties (0 bonus, 0 assists, etc.), so which players
appeared in a tied "Top 5"/"Bottom 5" tile was implementation-defined and
not guaranteed stable. Dashboard's "Bottom 5" path compounded this by
reversing the already-broken descending sort.

**Fix:** Both rewritten to `(a, b) => (ascending ? a.value - b.value :
b.value - a.value)` — a proper numeric comparator, and ascending order is
now computed directly rather than by reversing a descending sort.

**Files changed:** `client/src/pages/Dashboard.tsx`,
`client/src/pages/UnderlyingNumbers.tsx` (both `topN` functions exported
for testability).

**Test added:** `client/src/pages/Dashboard.topN.test.ts` (5 tests) and
`client/src/pages/UnderlyingNumbers.topN.test.ts` (3 tests) — both cover
descending/ascending ordering, a 3-way exact tie (no drop/duplicate — the
scenario the old comparator broke), and null-value exclusion.

**Verification performed:** 8/8 new tests passing.

---

## M7 — `useSummaryTiles.ts`'s `migrate()` silently reverted a user's deliberate empty-tile state

**Root cause:** `migrate()` treated `data.length === 0` as invalid,
returning `null` — which `loadVersioned()` turns into the packaged
`DEFAULT_SUMMARY_TILES`. A user who removed every Dashboard tile had that
choice silently undone on next load, even though `Dashboard.tsx` already
renders a clean "No tiles yet" state for exactly this case, and the
sibling `useSavedSquads.ts` store already handles an empty array
correctly.

**Fix:** `migrate()` now only returns `null` for a genuinely non-array
payload; an empty array passes through as a legitimate, preserved state.

**Files changed:** `client/src/state/useSummaryTiles.ts`.

**Test updated/added:** `client/src/state/useSummaryTiles.test.tsx` — the
existing test that asserted the buggy behavior ("falls back to defaults
for unsalvageable data (empty array)") was corrected to test a genuinely
non-array payload instead; two new tests confirm an empty array survives
both a versioned and an unversioned/pre-envelope payload.

**Verification performed:** 7/7 tests in this file passing.

---

## M6 — Team Building's Min Minutes picker filter lacked the live-mode bypass

**Root cause:** Every other page's Min Minutes filter forces the
threshold to 0 in Current Season ("live") mode via `effectiveMinMinutes()`
(since most players haven't accumulated many live-season minutes yet, a
threshold there collapses the pool rather than narrowing it — a
previously-fixed failure class). Team Building's Add Players picker had
its own separate `pickerMinMinutes` state with no such bypass.

**Fix:** Added `pickerEffectiveMinMinutes(mode, minMinutes)` — the same
bypass logic, extracted as its own testable function since the picker's
state isn't part of a `GlobalScoutingFilters` object. The picker's filter
now calls it; the Min Minutes input is also disabled with an explanatory
title in live mode, matching `FiltersBar.tsx`'s existing treatment.

**Files changed:** `client/src/pages/TeamBuilder.tsx`.

**Test added:** `client/src/pages/TeamBuilder.pickerEffectiveMinMinutes.test.ts`
(5 tests) — bypass in live mode with/without a threshold set, threshold
applied as-is in lastSeason/historicAverage modes.

**Verification performed:** 5/5 tests passing; full client typecheck clean.

---

## M1–M4, M10, L1, L2 — README documentation sync pass

Per the audit's recommendation, bundled together as zero-code-risk
corrections:

- **M1** — README claimed `defensive_contribution` is "always 0 in
  `history_past`." Verified against the actual code
  (`normalizeElementSummary.ts`'s `DEFENSIVE_CONTRIBUTION_TRACKING_START_YEAR`
  gate) that this is false from 2024/25 onward and genuinely used in
  Last Completed Season/Historic Average analysis. README corrected.
- **M2** — README's "Calculation formulas" section still showed the old
  `Points/90 = totalPoints/minutes*90`-style formulas. Replaced with the
  actual current per-game formulas, cross-checked against
  `calculations.ts`'s `perGame()`/`estimatedGamesFromMinutes()`.
- **M3** — README described the defensive-contribution chart as
  `defensive_contribution_per_90` (raw FPL field) on a "/90" basis. Code
  uses `defensiveContributionsPerGame` (this app's own per-game
  derivation). README corrected, chart title in the text updated to match
  the actual on-screen title ("Defensive Contribution/Game vs Defensive
  Reward/Game").
- **M4** — The Expected Points Tier 2 section's own header said
  "experimental, not wired into any page yet," while text 130 lines later
  (and the code) confirmed it's shipped in Team Building. Header and intro
  rewritten to state the current, shipped status up front, with a
  cross-reference to the existing "wired into Team Building" subsection.
- **M10** — README's dead-code claims named `squadRating.ts` as orphaned
  and never mentioned `squadRules.ts` at all. Investigated via `git log
  --follow`: `squadRating.ts` was a real, separate file (chip-adjusted
  Expected Points), deleted outright in the archetype-removal commit;
  `squadRules.ts` is a different, unrelated, currently-live module
  (`validateSquad`/`validateStartingXI`/`canAddPlayer`, imported by
  `TeamBuilder.tsx`/`SquadPitch.tsx`) that was never orphaned and was
  simply never documented. Both "orphaned" mentions corrected; historical
  changelog entries describing past states were left as accurate history
  with a note added about what happened since.
- **L1** — README's "Known limitations" said team `strength_*` fields are
  entirely unused. True for `strength_attack_*`/`strength_defence_*`, false
  for `strength_overall_home/away`, which Expected Points Tier 2's
  clean-sheet model uses. Corrected to distinguish the two pairs.
- **L2** — README's "API endpoints used" table omitted `/api/historic-bulk`
  and the three `/api/entry/*` endpoints. Added, with TTLs cross-checked
  against `server/src/config.ts`'s actual `CACHE_TTL_MS` values.

**Files changed:** `README.md` only (no code changes for this group).

**Verification performed:** Each correction was checked against the
actual source it describes before editing (grep/read of the relevant
`.ts` file) — not just taken on the audit's word, per the remediation
rule to verify before fixing.

---

## L3 — Stale comment in `TeamBuilder.tsx`

Comment named `computeExpPointsBreakdown` (a function with zero importers
anywhere) as part of an expensive `useMemo`'s cost, when the memo actually
calls `computeBlendedMinutesReliability`, `computeExpectedPointsForSingleFixture`,
and `computeExpectedPointsV2ForFixture`. Comment corrected to name the
real three functions. **File:** `client/src/pages/TeamBuilder.tsx`. No
functional change; no test applicable.

---

## L4 — Floating-point false positive in the xGI validation tolerance check

**Root cause:** `runMetricValidation`'s discrepancy check compared
`Math.abs(apiValue - derivedValue)` directly against the 0.01 tolerance.
IEEE-754 representation error can push a genuinely-exact value's diff just
past the boundary (`0.4 - 0.39 === 0.010000000000000009` in JS, which is
`> 0.01`), producing a false-positive console warning on real, correct
data.

**Fix:** The diff is now rounded to 6 decimal places before comparing
against the tolerance.

**Files changed:** `client/src/metrics/validation.ts`.

**Test added:** A new case in `client/src/metrics/validation.test.ts`
reproducing the exact `0.4 - 0.39` scenario, asserting no discrepancy is
raised (with a sanity-check assertion confirming the raw JS float artifact
this guards against actually exists).

**Verification performed:** 8/8 tests in this file passing; the existing
"flags a discrepancy strictly beyond tolerance" test's `diff` value is now
a clean `0.02` in the console output instead of `0.019999999999999574` —
a visible confirmation the rounding fix works as intended, not just that
the test passes.

---

## L6 — Deleted confirmed-dead `optimalDraft.ts` and `transferSolver.ts`

Verified independently (not just trusting the audit) via `grep -rn` across
the whole client `src/` tree: zero importers of either file anywhere
outside themselves. Both deleted (327 + 142 = 469 lines). README's
"orphaned" claims about them (in the M10 edits above) updated to state
they're now deleted, not just orphaned, and cross-referenced to this
entry.

**Files changed:** deleted `client/src/metrics/optimalDraft.ts`,
`client/src/metrics/transferSolver.ts`; `README.md` updated in two spots.

**Verification performed:** Full client typecheck clean after deletion
(`npx tsc -b`) — confirms no import anywhere actually referenced them,
consistent with the pre-deletion grep.

---

## L8 — `bootstrap-static` and `fixtures` fetched sequentially despite the code's own comment saying they're independent

**Root cause:** `AppStateContext.tsx`'s `load()` awaited `fetchBootstrap()`
to completion before even starting `fetchFixtures()`, so total initial
load latency was `bootstrap + fixtures` instead of `max(bootstrap,
fixtures)` — despite an existing comment stating "Fixtures load
independently of bootstrap."

**Fix:** Both fetches are now started together (both promises created
before either is awaited), each still awaited and error-handled
independently right after, exactly as before.

**Files changed:** `client/src/state/AppStateContext.tsx`.

**Test added:** `client/src/state/AppStateContext.test.tsx` (new file) —
mocks `fetchBootstrap`/`fetchFixtures`, holds bootstrap's promise
unresolved, and asserts `fetchFixtures` was already called (not waiting
on bootstrap) — a direct proof the two are in flight together.

**Verification performed:** 1/1 new test passing; full client typecheck
clean.

---

## L10 — "Refresh Historic Data" didn't force-bypass its own nested caches

**Root cause:** `server/src/routes/historicBulk.ts`'s
`buildBulkHistoricData()` never received a `bypassCache` flag, so its two
nested `cachedFetch` calls (the internal `bootstrap-static` fetch, and
every per-player `element-summary` fetch) always defaulted to
`bypassCache: undefined` — even when the whole build was itself triggered
by an explicit user-initiated "force refresh." A refresh click only
guaranteed a fresh top-level `historic-bulk` build; the data feeding that
build could still silently be served from an already-cached (not-yet-expired)
nested entry.

**Fix:** `buildBulkHistoricData` now takes a `bypassCache: boolean`
parameter, forwarded to both nested `cachedFetch` calls; the route
handler passes through whatever bypass value it already received.

**Files changed:** `server/src/routes/historicBulk.ts` (also exported
`buildBulkHistoricData` for direct testing).

**Test added:** `server/src/historicBulk.test.ts` (new file, 2 tests) —
mocks `cachedFetch` and confirms `bypassCache: false` reaches both the
bootstrap and every per-player call on a normal build, and `bypassCache:
true` reaches all of them on a refresh build.

**Verification performed:** 2/2 new tests passing; server typecheck
clean.

---

## L5 — Sidebar/main-content overlap at narrow (≈480px) viewport width

**Root cause (best-effort, code-traced only — see caveat below):** at the
mobile breakpoint, `.sidebar` switches to `flex-direction: row` with
`overflow-x: auto` so nav items scroll horizontally instead of wrapping.
As a CSS grid item, though, a flex/grid container's default `min-width` is
its *content's* intrinsic (unwrapped) width, not the track's actual width
— so `overflow-x: auto` never actually engages; instead the grid track (and
by extension the row below it, `main`) gets forced wider than the
viewport or squeezed, producing the reported overlap. The same fix
pattern (`min-width: 0`) is already applied elsewhere in this exact file
(`.topbar-left`) for the identical symptom.

**Fix:** Added `min-width: 0; flex-wrap: nowrap;` to `.sidebar`'s mobile
rule.

**Files changed:** `client/src/styles/layout.css`.

**⚠️ Caveat — not visually re-verified.** This is a rendering-only bug
that needs an actual browser at a narrow width to confirm; per your own
standing preference, I didn't launch the app or take a screenshot myself.
The reasoning above is a well-established CSS pattern matching the
audit's exact symptom description, but **please check it yourself** (open
the app, narrow the window to ~480px) before treating this one as
confirmed-fixed. There's no automated visual-regression test in this
project to substitute for that check.

---

## CLAUDE.md — stale "no test suite" claim corrected

The audit's own Process Notes flagged that CLAUDE.md's "no automated test
suite exists in any package" line was already false by the end of Phase 1
(Stream E's 162-test suite, then uncommitted). That suite is now extended
by this pass to 185 tests and is the basis for most of the regression
tests above. CLAUDE.md's Test section updated to describe `npm test`,
roughly what's covered, and what's explicitly still untested
(`expectedPoints.ts`/`expectedPointsV2.ts`, most of `TeamBuilder.tsx`'s
own logic) — not claiming more coverage than actually exists.

---

## Final check-suite results

**Build** (`npm run build`):
```
✓ Server: tsc -p tsconfig.json — clean, zero errors
✓ Client: tsc -b && vite build — clean, zero errors, 923 modules, ~3.9s
  (pre-existing >500kB main-bundle warning, unrelated to this pass)
```

**Tests** (`npm test`):
```
Server:  4 test files, 31 tests — all passing
         (cache.test.ts 10, proxy.test.ts 12, historicBulk.test.ts 2 [new],
          concurrency.test.ts 7)
Client:  20 test files, 154 tests — all passing
         (15 pre-existing files + 5 new: schema.test.ts, Dashboard.topN.test.ts,
          UnderlyingNumbers.topN.test.ts, TeamBuilder.pickerEffectiveMinMinutes.test.ts,
          AppStateContext.test.tsx — plus edits to the pre-existing
          useSummaryTiles.test.tsx and validation.test.ts)

Combined: 185 tests, 185 passing, 0 failing.
(Baseline at the start of this pass: 162 tests, 161 passing, 1 failing by
design — M9's now-fixed stale-cache test.)
```

**Lint:** No lint script exists in any package (root/server/client) —
unchanged from baseline, confirmed again directly; out of scope to add
per the remediation brief.

**Typecheck:** Clean on both packages (`npx tsc -b` client,
`npx tsc -p tsconfig.json` server), run standalone after every logical
group of changes, not just once at the end.

---

## What's still open

- **L7, L9, L11** — explicitly deferred by your choice; still valid,
  Low-severity, "opportunistic" findings per the audit.
- **NV1–NV10** — the audit's needs-verification appendix. None were
  independently observed to occur during this pass, so per the audit's
  own rule, none were treated as confirmed defects or touched.
- **L5** — fixed but not visually re-verified (see caveat above) — please
  check narrow-window behavior yourself.
- Phase 3 (adversarial regression) is the next step in this project's
  three-phase process, per `docs/audits/PHASE-3-ADVERSARIAL-REGRESSION-PROMPT.md`
  — a fresh session, per your standing process.
