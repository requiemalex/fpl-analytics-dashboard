# Phase 3 — Adversarial Regression Audit

**Date:** 2026-09-21
**Input:** `docs/audits/FULL_AUDIT_REPORT.md` (Phase 1) and `docs/audits/REMEDIATION_REPORT.md`
(Phase 2), both against the same uncommitted working tree, HEAD `d7d847b`.
**Scope:** Independent adversarial QA per
`docs/audits/PHASE-3-ADVERSARIAL-REGRESSION-PROMPT.md`. Goal was not to trust
Phase 2's fixes but to try to break them — plus a fresh pass over the focus
areas the brief names (edge cases, null/zero values, ties, gameweek
boundaries, refresh behaviour, race conditions, API failure, partial data).
**No production code was changed in this phase** — report only, as instructed.

**Method:** Read every changed production file's diff against `HEAD` line by
line (not just the two prior reports' prose). Re-ran the full build and test
suite myself rather than trusting the prior reports' numbers. Started the
real dev servers (`npm run dev`, server `:4000` / client `:5173`) and drove
them with a real headless Chromium browser (Playwright, via `npx`, matching
`CLAUDE.md`'s documented pattern) against live FPL API data (2026/27 season).
Wrote and ran one throwaway Node/Vitest reproduction script to prove a
race condition at the actual code level (deleted afterwards — nothing
left behind in the working tree beyond this report).

**Headline result:** The Phase 2 remediation pass is, on the whole, solid —
every one of its 13 addressed findings (C1, M5–M9, L4, L5, L8, L10, plus M1–M4/
M10/L1–L2/L3/L6 which were docs/dead-code-only) was independently re-verified,
either by re-reading the fix against its own root-cause description, by a
live browser reproduction of the original failure mode, or both. **But one of
those fixes — L10 — introduced a new, real regression of its own**, in
exactly the category this phase was asked to hunt for (race conditions,
refresh behaviour). It has zero test coverage, which is also why Phase 2's
own test suite didn't catch it. That is this report's one confirmed defect.

---

## 1. Confirmed defects

### R1 — L10's own fix introduced a race condition: a "Refresh Historic Data" request can silently lose its force-refresh semantics if it lands while another historic-bulk build is already in flight

- **File/function:** `server/src/routes/historicBulk.ts`, `handle()`'s
  `inFlightBuild` singleton (lines ~90–102).
- **Root cause:** L10's fix (correctly) turned `bypassCache` into a real
  per-build parameter, threaded down into every nested `cachedFetch` call
  inside `buildBulkHistoricData(bypassCache)`. But the **de-duplication
  guard that decides whether to start a new build at all** was never updated
  to account for that parameter. `inFlightBuild` is a single module-level
  variable shared by every caller regardless of whether they asked for a
  normal load or an explicit refresh:
  ```ts
  if (!inFlightBuild) {
    inFlightBuild = buildBulkHistoricData(bypassCache).finally(() => { inFlightBuild = null; });
  }
  ```
  If a normal (non-refresh) build is already in flight (`inFlightBuild` is
  set, built with `bypassCache: false`) and a refresh request arrives before
  it settles, `handle(true)` sees `inFlightBuild` already non-null and just
  **awaits the existing non-bypassed build** — it never starts its own
  bypassed one. The user's explicit "force refresh" silently becomes a
  regular, cache-serving load.
- **Why this is realistic, not a contrived edge case:** the router's own
  comment (unchanged from before L10, now inaccurate about what it
  guarantees) says this exact guard exists to prevent "two simultaneous
  callers (e.g. two browser tabs both loading cold)". Two tabs against the
  same server is a normal way to use this app — and the client-side "Retry"
  button (`AppStateContext.tsx`'s `refreshHistoricData`, surfaced in
  `Dashboard.tsx`/`AnalysisModeToggle.tsx`/`LocalViewControls.tsx`) only ever
  appears **after** a historic-bulk build has already failed in that tab —
  meaning that tab's own prior attempt is guaranteed to have already cleared
  `inFlightBuild` by the time Retry is clickable. The collision instead needs
  a *second* tab/session: Tab A opens cold and starts a normal build
  (`HISTORIC_BULK_CONCURRENCY = 15`, ~660 players — the UI's own copy warns
  "can take up to a minute"); while that's still running, Tab B (already
  open, already erroring) clicks Retry. Tab B's refresh silently rides Tab
  A's non-bypassed build, and can end up serving per-player `element-summary`
  data from that build's nested caches that's up to 30 minutes old (the
  `element-summary` TTL) — the opposite of what the refresh click promised.
- **Reproduced:** directly, against the real route handler (not a
  hand-rolled simulation) — mocked `cachedFetch`, pulled the two real route
  handlers off `historicBulkRouter`'s internal stack, fired a normal
  `GET /historic-bulk` first, let it start and register `inFlightBuild`, then
  fired `POST /refresh/historic-bulk` while the first was still pending on an
  unresolved bootstrap-static fetch. Result: only **one** `cachedFetch` call
  for `bootstrap-static` across both requests, with `bypassCache: false` —
  the refresh request never made its own bypassed call at all.
  ```
  bootstrap-static cachedFetch calls' bypassCache values: [ false ]
  normal response meta: { source: 'live', ... }
  refresh response meta: { source: 'live', ... }   // looks identical to the normal response — no signal to the client that its refresh didn't actually bypass anything
  ```
- **Impact:** Medium. No crash, no data corruption, and the failure is
  silent (the refresh response looks like any other successful `"live"`-
  sourced response — there's no `source: "not-actually-refreshed"` to
  distinguish it). Directly contradicts the "force refresh" contract L10
  itself was written to restore, in the same class of bug L10 was fixing
  (nested caches silently serving stale data despite an explicit refresh
  request) — just one layer further out, in the coalescing guard rather than
  the nested `cachedFetch` calls.
- **Fix shape (for a future Phase 2-style pass, not applied here):** either
  key `inFlightBuild` by `bypassCache` (two independent in-flight slots,
  mirroring how `cachedFetch` itself already separates a `bypassCache`
  request into its own in-flight key — see `proxy.ts`, confirmed correct
  below), or have a refresh request that finds a non-bypassed build already
  in-flight start its own bypassed build anyway rather than piggyback.
- **Confidence:** High — reproduced against the real handler function, not
  an inference from reading the diff.

---

## 2. Test failures

**None.** Full suite re-run independently, both packages:

```
Server:  4 test files, 31 tests — all passing
Client:  20 test files, 154 tests — all passing
Combined: 185 tests, 185 passing, 0 failing.
```

Matches the Phase 2 report's claimed final numbers exactly. `npm run build`
(server `tsc -p tsconfig.json`, client `tsc -b && vite build`) is also clean
— zero type errors, production bundle builds successfully.

---

## 3. Weaknesses in test coverage

- **R1's blind spot, precisely.** `server/src/historicBulk.test.ts` (added
  for L10) tests `buildBulkHistoricData(bypassCache)` **directly and in
  isolation** — it never exercises `handle()` or the exported
  `historicBulkRouter`, so the `inFlightBuild` coalescing logic that R1 lives
  in has **zero test coverage** in either direction (neither the intended
  "two normal loads coalesce" behaviour nor the broken "refresh coalesces
  into a normal build" behaviour is asserted anywhere). This is exactly why
  R1 shipped: the test written to protect L10's fix tests the function one
  layer too deep to see the bug that fix's own integration point introduced.
- **M8's user-visibility gap has no test or UI assertion either.** The fix
  correctly counts and reports skipped records via `skippedPlayerCount`, but
  the *only* place that count is ever rendered is `UserGuide.tsx` (confirmed
  by grep — no banner/toast anywhere else, including `AppShell.tsx`'s header,
  which only shows the raw `players.length`, itself now a silent indicator
  since a shrunk count from a bad record looks identical to a shrunk count
  from a normal week-to-week roster change). Before M8, a bad record was a
  loud, unmissable full-page failure; after M8, it's an invisible-unless-you-
  visit-User-Guide partial reduction. This isn't a broken fix — a warning
  instead of a crash is exactly what `CLAUDE.md` asks for — but there's no
  test (and no obvious UI signal) confirming a user would ever actually see
  that warning without hunting for it, which is worth deliberately deciding
  on rather than leaving implicit.
- Consistent with Phase 1's own tally, real formula/logic-dense files remain
  untested: `expectedPoints.ts`/`expectedPointsV2.ts`, most of
  `TeamBuilder.tsx`'s own logic beyond the one extracted
  `pickerEffectiveMinMinutes` helper, `playerSearch.ts`'s fuzzy matching, and
  `httpClient.ts`'s retry/backoff/timeout logic. None of these were touched
  by Phase 2, so this is unchanged risk, not a new gap — flagged here only
  because the brief asked for a full test-coverage assessment, not just a
  diff of what changed.

---

## 4. Theoretical concerns (not reproduced this pass)

- All of Phase 1's **NV1–NV8 and NV10** remain exactly where Phase 1 left
  them: plausible, unconfirmed, not touched by any Phase 2 fix, and not
  independently reproduced in this pass either (per the same "don't treat
  unconfirmed as confirmed" rule Phase 1 and Phase 2 both followed). No new
  evidence for or against any of them was found. Not re-litigated in detail
  here — see `FULL_AUDIT_REPORT.md` §10 for the original list.
- **NV9** (bootstrap-static/fixtures each fetched twice on a fresh dev-mode
  load, via React `StrictMode`'s deliberate dev-only double-invoke) —
  **re-confirmed still present**, unchanged by L8's concurrency fix (network
  capture showed 2× `GET /api/bootstrap-static` + 2× `GET /api/fixtures` on
  one fresh load). Still dev-only/cosmetic as previously characterized —
  production build behaviour still not independently verified in this pass
  either (same limitation Phase 1 noted: only the dev servers were run).
  Notably, `GET /api/historic-bulk` was **not** doubled despite the same
  StrictMode double-invoke hitting `requestHistoricData()` twice — confirmed
  by trace that `historicRequestedRef` (a `useRef`, stable across
  StrictMode's synchronous double-effect-invoke on the same component
  instance) correctly no-ops the second call. Worth knowing if a future pass
  ever wants to explain why one shared fetch doubles in dev and the other
  doesn't — it's not an inconsistency, just two different guards with
  different scopes.
- **A softer version of R1** is worth flagging as still-theoretical on its
  own: whether the *client's* `historicRequestedRef` guard (single-flight
  per browser tab) could itself ever race across two components mounting in
  the same tick and both seeing the ref unset. Traced through the code and
  believe this is safe — JS's single-threaded execution means the first
  `useEffect` callback runs to completion (including synchronously flipping
  the ref) before the next mounted component's effect runs, even when both
  are mounted in the same commit (e.g. a page plus `PlayerDetailOverlay`
  mounted together) — but this reasoning wasn't independently stress-tested
  with a real double-mount scenario the way R1 was, so it's listed here as
  reasoned-through rather than reproduced.

---

## 5. Behaviour verified as correct (actively tried to break, didn't)

All of the following were re-verified independently this pass — either live,
via test re-run, or via a fresh code trace — not just taken on the prior
reports' word:

- **C1 (historic-bulk lazy gating).** Grepped every consumer of
  `historicProfiles`/`allTimeSeasonsByPlayerId` in the client and confirmed
  each is either one of the 8 components that call `requestHistoricData()`
  on mount (`Dashboard`, `PlayerComparison`, `PlayerExplorer`, `TeamBuilder`,
  `TeamDetail`, `Teams`, `UnderlyingNumbers`, `PlayerDetailOverlay`) or a
  pure function/child component only ever rendered inside one of those eight
  (`careerTrends.ts`, `thematicTrends.ts`, `UserAnalysisGraphCard.tsx`) —
  no orphaned consumer that could read stale/empty historic data without
  ever having triggered the fetch.
- **M5 (Top-5/Bottom-5 tie handling).** Re-derived the comparator fix's
  correctness by hand, then loaded the real Dashboard fresh **twice** in
  separate browser contexts and diffed every tile's rendered contents byte-
  for-byte — identical both times, confirming deterministic (not
  implementation-defined) tie resolution against real, tied live data.
- **M6 (Team Building Min Minutes live-mode bypass).** Reproduced live: created
  a squad, set Min Minutes to 900, confirmed the field is enabled and
  editable in Last Completed Season mode, then switched to Current Season —
  confirmed the input becomes `disabled`, its `title` attribute updates to
  the correct explanatory text, and the previously-entered value (900) is
  preserved rather than cleared (so it re-applies correctly if the user
  switches back).
- **M7 (empty-tile-array migration).** Traced the full round trip through
  `persistentStorage.ts` by hand: `migrate([])` on an empty array now returns
  `[]` (not `null`), `loadVersioned` only falls back to `store.fallback` when
  `migrate()` returns `null`/`undefined`, and `[] ?? fallback` correctly
  evaluates to `[]`. No `STORAGE_VERSION` bump was needed or made for this
  change (it corrects existing migration logic rather than introducing a new
  default shape), which is the right call.
- **M8 (malformed bootstrap-static record).** Reproduced Phase 1's exact
  repro live: intercepted `/api/bootstrap-static` and corrupted two records
  (`now_cost: null` on one, `total_points` deleted on another — both
  required fields) before they reached the app. Result: app loaded
  successfully showing **665 players** (667 − 2), zero console errors, no
  full-page failure; navigating to User Guide showed the exact expected
  copy: *"2 player record(s) were excluded..."*. Full opposite of Phase 1's
  original repro (0 players anywhere).
- **M9 (stale-cache fallback).** `server/src/cache.ts`'s `get()` no longer
  deletes an expired entry as a side effect; the test that was left
  deliberately failing in Phase 1 (`proxy.test.ts`'s stale-fallback test)
  now passes with its original, un-weakened assertion intact.
- **L4 (floating-point validation tolerance).** Confirmed via the test
  suite's own console output that the exact `0.4 - 0.39` IEEE-754 artifact
  case now produces a clean rounded `diff: 0.02` rather than
  `0.019999999999999574` — a visible, not just asserted, confirmation.
- **L5 (480px sidebar overlap).** This was explicitly flagged in the
  Phase 2 report as *"not visually re-verified... please check it
  yourself"* — did so here with a real headless browser at exactly 480×800.
  No overlap, no horizontal scroll (`document.body.scrollWidth` exactly
  matches `window.innerWidth`). Confirmed fixed.
- **L8 (concurrent bootstrap/fixtures fetch).** Confirmed via network
  capture on a fresh load: both `GET /api/bootstrap-static` and
  `GET /api/fixtures` fire back-to-back rather than the fixtures request
  waiting for bootstrap to fully resolve first.
- **Zero extra API calls on in-app navigation**, re-confirmed with real
  `<a>` click navigation (not `page.goto()`, which forces a full reload and
  would have produced a false positive here — caught and corrected this in
  my own test methodology mid-pass) across all 7 pages: Player Explorer,
  Player Comparison, Teams, Underlying Numbers, Team Building, User Guide,
  back to Dashboard. Zero `/api/*` calls fired on any of the 7 client-side
  navigations.
- **Full API failure on a fresh load still degrades cleanly** after the
  `AppStateContext.tsx` restructuring for C1/L8 (concurrent fetch, new
  `fetchBootstrap` return shape with `skippedElementCount`) — aborted both
  `bootstrap-static` and `fixtures` at the network level; app showed
  *"Couldn't load live FPL data... Try again"*, zero uncaught JS errors, no
  blank/crashed page. Confirms the restructuring didn't regress the
  previously-verified error-state behaviour.
- **`npm run build`**: clean on both packages (zero type errors), matching
  both prior reports.
- **Zero console errors** across a fresh-load sweep of all 7 pages (only
  React Router's own pre-existing future-flag deprecation warnings, unrelated
  to this app's code).

---

## Process notes

- This phase's one piece of throwaway evidence code
  (`server/src/_tmp_race_repro.test.ts`) was deleted after use — nothing was
  left in the working tree beyond this report. `git status` confirms the
  working tree's modified/untracked file list is unchanged from before this
  phase started, plus this new report file.
- Dev servers (`npm run dev`, ports 4000/5173) were started for this phase's
  browser testing and stopped again before finishing.
- Per this phase's brief, **no production code was changed** — R1 is
  reported, not fixed. It's a reasonable Phase-2-style follow-up: narrow
  scope (one file), same root-cause class as the fix that introduced it, and
  a fix shape is sketched above.
