# Phase 1 — Full Dashboard Forensic Audit

You are performing a full forensic audit of the existing FPL Analytics
Dashboard. This is an AUDIT ONLY. Do not make production-code changes during
this phase unless a change is required purely to create or improve automated
tests. Do not silently fix problems as you find them.

Determine whether the current application is: correct; internally consistent;
consistent with CLAUDE.md and any project docs; correctly using authoritative
FPL data; correctly calculating derived metrics; behaving correctly across the
whole UI; adequately tested; maintainable and architecturally coherent.

Treat this as a software quality review of an existing production-style
application, not a feature request.

## First: reconstruct the project

Before drawing any conclusions:
- Read CLAUDE.md and any files under docs/.
- Inspect package.json and every available script.
- Inspect the complete source tree and identify the main architecture.
- Inspect git status and recent history.
- Identify the frontend, data-access/API, calculation/model, state-management,
  and testing layers.
- Identify every place player/FPL data is transformed or calculated.
- Identify every place the same concept is independently re-implemented.
- Identify the existing test framework and current coverage.
- Determine how the application is actually run locally.

Do not rely on memory from previous conversations. Treat the repository and
its persistent documentation as the source of truth.

## Ground rules

Do not assume code is correct because it's typed, a function has a sensible
name, a test passes, the UI looks right, or a previous implementation was
accepted earlier. Trace important values from source → transformation →
state → UI.

For every significant finding, give: file; line/function/component; what it
currently does; what it should do; why the difference matters; how to
reproduce or verify it; severity; confidence.

Never invent a bug because something looks unusual. If something looks
questionable but can't be conclusively verified, classify it as "Needs
verification", not a confirmed defect.

## Audit 1 — Data source accuracy

Audit the entire FPL data pipeline. Verify: the official FPL API remains the
authoritative source; every displayed metric traces to a real source field or
documented derivation; no metric is silently substituted for a different one;
missing data is null/undefined and ultimately shown as "—", not 0; NaN/Infinity
can't reach the UI; `now_cost` is interpreted as £0.1m units; player IDs, team
IDs/names, and position classifications are used consistently everywhere;
current-gameweek logic correctly uses `events.is_current` and handles the
no-current-gameweek case; refresh behaviour actually refreshes the intended
data; caching can't silently serve stale data where fresh data is expected;
lazy player-profile requests are actually lazy; API errors and incomplete
responses are handled correctly. Where possible, test against the real FPL API
rather than assuming the implementation is right.

## Audit 2 — Metric and calculation correctness

Build a calculation inventory of every derived metric. For each, verify: source
fields; formula; units; handling of zero, null, and insufficient data;
rounding; whether it's aggregate-based or gameweek-based; whether the same
metric uses the same formula everywhere it appears. Pay particular attention
to: per-90 calculations; per-£m calculations; goals-minus-xG; assists-minus-xA;
involvements vs xGI; defensive-contribution metrics; clean-sheet calculations;
percentile calculations; position-relative rankings; value metrics; any
expected-points or weighted/modelled outputs. Do not accept substitutions for
unavailable metrics.

## Audit 3 — Expected-points model (if present)

Audit any expected-player-points model separately. Determine every input and
its source, historical period used, live/current-season uplift treatment,
positional weighting, team attacking/defensive output inputs, fixture
difficulty inputs, normalisation, weighting, and final score construction.
Check for double counting, incorrectly scaled variables, inconsistent
positional treatment, hidden hard-coded values, weights that don't sum
correctly where they should, stale assumptions, and accidental use of
presentation values instead of raw analytical ones. If the methodology is
undocumented, flag that as a documentation/maintainability issue rather than
inventing intended behaviour.

## Audit 4 — Cross-application consistency

Trace the same player through: the main player table, filters, rankings, the
player detail view, history, comparison, position rankings, team aggregation,
charts, model outputs, and any saved squad views. Check price, ownership,
points, minutes, starts, goals, assists, xG, xA, xGI, xGC, DC, bonus, BPS,
ICT, position, team, and rankings all agree. Look specifically for places
where the app independently recalculates or reconstructs a value that should
come from a shared source.

## Audit 5 — Filters, sorting and state

Test every filter and combination of filters (position, team, search, minutes,
starts, ownership, price, presets, sorting, ranking, pagination/virtualisation
if present) — combinations, not just individual controls. Look for stale
state, filters affecting the wrong dataset, filters lost on navigation,
sorting against displayed rather than raw values, null values behaving
incorrectly, reset buttons not fully resetting, and inconsistent filter
semantics between pages.

## Audit 6 — UI / integration testing

Run the application and test it as a real user: initial load, loading states,
API failure, partial data, refresh, empty results, player selection/details,
comparison, navigation, charts, rankings, responsive behaviour, browser
console, network requests. Use browser automation or a live preview if
available, rather than relying only on source-code inspection. Look for
runtime errors static analysis wouldn't catch.

## Audit 7 — Automated test coverage

Run every existing test, lint, typecheck, and build command first. Then
identify important behaviour with no meaningful automated coverage. Don't just
count tests — assess whether they actually protect core calculations, API
transformation, null handling, zero-minute handling, metric consistency,
filtering, sorting, comparison, model calculations, error states, refresh
behaviour, and current-gameweek detection. Add tests where useful, but don't
change production behaviour just to make a test pass. Tests should verify
general correctness, not encode the current implementation.

## Audit 8 — Code quality / architecture

Look for duplicated business logic or calculations, conflicting sources of
truth, unnecessary state, derived values stored when they should be
calculated, excessive useEffect chains, stale closures, race conditions,
unsafe TypeScript casts, unnecessary `any`, dead code, unused dependencies,
overly complex or giant components, poor separation between API/data/
calculation/UI concerns, inconsistent naming, unnecessary abstractions,
hard-coded business logic, and fragile fallback logic. Don't recommend a
refactor just because a different architecture would be nicer to look at —
prioritise changes that materially improve correctness, maintainability,
reliability, or performance.

## Audit 9 — Performance / API efficiency

Inspect: number of API calls on initial load, duplicate calls, calls repeated
by React effects, unnecessary re-fetching or recalculation, expensive table
rendering, chart recalculation, cache behaviour, player-detail lazy loading.
Say clearly where a performance concern is theoretical versus demonstrated.

## Audit 10 — Requirements / feature regression

Compare the implementation against documented requirements and historical
decisions. Identify what's implemented correctly, partially implemented,
missing, implemented but inconsistent or contradicted elsewhere, no longer
reflected in the code, or apparently regressed.

## Delegate the work

If subagents or a dynamic workflow are available to you, use them to run
independent streams in isolated context rather than trying to hold the whole
application in one context window — for example, a data/API-accuracy stream,
a calculations/model stream, a frontend/cross-page-consistency stream, a
testing stream, and an architecture stream. Don't let one stream's finding
become accepted fact without evidence from its own investigation.

## Output

Create `docs/audits/FULL_AUDIT_REPORT.md` containing: an executive summary in
factual terms; critical / high / medium / low priority defects; accuracy
findings; calculation findings; cross-application consistency findings;
testing gaps; architecture/code-quality findings; performance findings; UX
findings; confirmed issues kept clearly separate from suspected ones; a
recommended remediation order (by correctness impact, user impact,
reproducibility, scope, and regression risk — not personal preference); and a
list of every test added during the audit and what failure each one protects
against.

At the end, run the complete existing test/build/typecheck/lint suite again
and include the results. Don't claim success just because the app starts.

**Do not fix the application in this phase.** The goal is an evidence-based
baseline of what's wrong, what's correct, what's uncertain, and what needs
testing — nothing more.
