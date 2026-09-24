# Phase 1 — Forensic Audit

You are performing a forensic audit of the FPL Analytics Dashboard. This is
an AUDIT ONLY: find and evidence problems, don't fix them. The one exception
is adding automated tests (see Audit 7). Don't change production code, even
for problems that look trivial.

Determine whether the app (or the part of it in scope) is: correct;
internally consistent; consistent with CLAUDE.md, README.md and the in-app
User Guide; correctly using authoritative FPL data; correctly calculating
derived metrics; behaving correctly in the real UI; safe across app updates;
adequately tested; and maintainable.

## Scope

The owner may name a scope: a page or feature, such as "Dashboard" or "Team
Building". If none is named, the scope is the **full app**.

With a narrower scope, apply every audit area below as far as it touches the
scope. That includes the shared code it depends on: metrics, stores, shared
components and normalisation. When a finding in shared code affects other
pages too, say so. It still belongs in this report.

## Permissions this prompt gives you

Being asked to run this prompt is the owner asking you to:
- **Run the app** (`npm run dev`) and drive it with browser automation
  (Playwright via `npx playwright install chromium` plus throwaway scripts in
  your scratch space, never in the repo), overriding CLAUDE.md's default of
  not launching it.
- **Call the live FPL API** through the app's proxy to check figures.

Use a fresh browser context, so the owner's own saved settings and installed
app are never touched. Stop any server you started before you finish.

## First: reconstruct the project

Before drawing any conclusions:
- Read CLAUDE.md, README.md (how the app works now), the User Guide
  (`client/src/pages/UserGuide.tsx`), and `docs/audits/README.md` plus the
  most recent run in `docs/audits/results/`, so you know what was already
  found and fixed. Skip `docs/HISTORY.md` (archived — past behaviour).
- Inspect `package.json` and the scripts that actually exist. There is no lint
  script; `npm run build` is the type-check.
- Inspect the source tree for the scope. Identify the data-access,
  normalisation, calculation, state, UI and test layers, every place FPL data
  is transformed or calculated, and every place one concept is re-implemented
  separately.
- Record the baseline: `git rev-parse --short HEAD`, the app version (latest
  `v*` tag), and the results of `npm run build` and `npm test`.

Don't rely on memory from previous conversations. The repository and its
docs are the source of truth.

## Ground rules

- Don't assume code is correct because it's typed, well named, tested, looks
  right in the UI, or was accepted before. Trace important values from source
  → transformation → state → UI.
- For each finding, give: ID; severity; confidence; file and
  line/function/component; what it does now; what it should do; why that
  matters to a user; exact steps to reproduce, with actual vs expected values.
- For any claim about a wrong number, recompute it by hand from the raw API
  response (`/api/bootstrap-static`, `/api/element-summary/{id}`, etc.) and
  show the working.
- If something looks wrong but you can't prove it, it's "Needs verification"
  (a V-numbered item), not a defect.

### Severity

| Level | ID | Meaning |
|---|---|---|
| Critical | C1, C2… | Crash or blank page, lost user data, or wrong figures shown as correct on a core, widely used path. |
| High | H1… | Wrong or misleading output, or a broken interaction, in a specific feature — a user could act on it and be misled. |
| Medium | M1… | Works, but is confusing, fragile, inconsistent or needlessly risky; recoverable, limited impact. |
| Low | L1… | Polish, cosmetic, or a doc/wording mismatch with no effect on figures. |
| Needs verification | V1… | Suspected, not proven. Not counted as a defect. |

IDs are stable for the life of this run: Phases 2 and 3 refer to them.
Confidence is High, Medium or Low, with a line on why.

## Audit 1 — Data source accuracy

Check each of these against CLAUDE.md's Data rules:
- The official FPL API is the only source, apart from the documented
  vaastav club-history backfill.
- Every displayed figure traces to a real field or a documented derivation,
  with nothing silently substituted.
- Missing data is `null` and shown as "—", never 0 (except the documented
  true zeros).
- No NaN or Infinity reaches the UI.
- `now_cost` is read as £0.1m units.
- IDs, team names and positions are used consistently.
- The current gameweek comes from `events.is_current`, with the documented
  fallback and the no-current-gameweek case handled.
- Refresh really refreshes, and caching doesn't serve stale data where fresh
  data is expected.
- Lazy per-player requests stay lazy.
- API errors and partial responses degrade gracefully.

Test against the live API, not just the code.

## Audit 2 — Metric and calculation correctness

Build an inventory of every derived metric in scope. For each, give its
source fields, formula, units, rounding, and how it handles zero, null and
tiny samples. Check the same metric uses the same formula everywhere, and
matches `metrics/dictionary.ts` and README "Metric methodology".

Pay particular attention to:
- Per-game rates (the app deliberately uses estimated games, not per-90).
- Per-£m values.
- Goals − xG, Assists − xA, and G+A − xGI.
- DC and Defensive Reward.
- Clean sheets.
- Percentiles and position-relative rankings.
- Historic Average windowing: a stat missing for some seasons must use
  matched seasons for its rate (`<matched_season_rates>`).
- Club (team) figures.

## Audit 3 — Expected-points model (Team Building)

Audit Exp. Pts (FPL Official) and Exp. Pts (Model Predicted) separately:
- Every input and its source, and the historical period used.
- Live-season blending, positional weighting, and team and fixture inputs.
- Normalisation, weighting, and how the final score is built.

Look for:
- Double counting and wrongly scaled variables.
- Inconsistent positional treatment.
- Hard-coded values not named in the README.
- Weights that should sum to 1 but don't.
- Presentation values used as analytical inputs.

Undocumented methodology is a documentation finding. Don't guess what was
intended.

## Audit 4 — Cross-application consistency

Trace the same few players and clubs through every place they appear in
scope:
- Tables and rankings.
- Profiles and history.
- Comparison.
- Team figures.
- Charts and tooltips.
- Model outputs.
- Saved squads, tiles and graphs.

Price, ownership, points, minutes, starts, goals, assists, xG, xA, xGI, xGC,
DC, bonus, BPS, ICT, position, team and rank should agree wherever the same
Data View is used. Flag anything recalculated locally that should come from a
shared source.

## Audit 5 — Filters, sorting, order and state

Test the controls the app actually has, in combination, not just one at a
time: position, team, search, min minutes, price range, column filters,
multi-column sort, analysis-mode toggles, and tile/graph criteria.

Look for:
- Stale state, or a filter applied to the wrong dataset.
- One page's filter changing another page.
- Sorting on the displayed value instead of the raw one.
- Nulls sorting or filtering wrongly.
- Resets that don't fully reset.
- Invalid ranges accepted, such as a minimum above the maximum or negatives.
- Rankings in the wrong direction for lower-is-better metrics (League
  Position, Goals Against, xGC, Price).

## Audit 6 — UI and interaction, in the real app

Use the running app like a real user:
- Initial load and loading states.
- API failure: block a route and check the error and Retry.
- Partial data, refresh, and empty results.
- Every dialog and flow in scope: add, edit, cancel, Escape, remove, delete,
  drag to reorder, switching views and tabs, and reloading mid-flow.
- The browser console and network requests.

Also check:
- **Typing** into inputs key by key (`pressSequentially`), not just setting
  their value. Rounding or validation on every keystroke only shows up this
  way.
- **Destructive actions** (delete, remove, reset): is there a confirmation or
  undo?
- **Hover and click** on every chart type. Does the tooltip name the thing
  under the cursor?
- **Extremes:** very long names, the maximum number of items, all-zero or
  single-item data, and a gameweek in progress versus finished.

## Audit 7 — Automated test coverage

Run `npm run build` and `npm test` first. Then find the important behaviour
in scope with no meaningful coverage: calculations, API transformation,
null and zero-minute handling, metric consistency, filtering and sorting,
storage migrations, error states, and gameweek detection.

You may add tests. They must test correct behaviour, not the current
implementation. A test that exposes a defect should fail now; mark it
`it.fails` or `it.skip` with the finding ID so the suite stays green, and
list it. Never change production code to make a test pass.

## Audit 8 — Saved data and upgrades

User settings live in versioned localStorage stores (README "Saved data").
For each store in scope:
- Load data saved by older versions (build it from the git history), data
  from a *newer* version, and corrupted data: unknown enum values, missing
  fields, wrong types.
- Each should load with a warning or fallback, never a crash or blank page.
- Check every `migrate()` step runs only for the versions it was written for.
  A later version bump mustn't re-run an old one-off step.
- Check stores that embed each other's data, such as saved views containing
  tiles and graphs, are migrated consistently.
- Check a saved item referring to something that no longer exists (a removed
  metric, player or club) degrades gracefully and can still be removed.

## Audit 9 — Plausibility of outputs

Wrong numbers often look fine at a glance. For every leaderboard, ranking and
chart in scope, in each Data View:
- Look at the top and bottom few. Would an FPL player believe them?
  Impossible values (e.g. 35 defensive contributions per game) or one-cameo
  players at the top of a per-game list are findings.
- Check who is at the extremes and why: minutes, seasons, data gaps.
- Recompute at least one extreme value by hand from the raw API.

## Audit 10 — Code quality and architecture

Look for:
- Duplicated business logic and conflicting sources of truth.
- Derived values stored instead of calculated.
- Effect chains and stale closures (CLAUDE.md "Stale closures").
- Race conditions.
- Unsafe casts and `any`, and dead code.
- Giant components mixing concerns.
- Hard-coded business rules, and fragile fallbacks.

Only recommend a refactor if it materially improves correctness, reliability,
maintainability or performance.

## Audit 11 — Performance and API efficiency

Check:
- API calls on load, and duplicate or effect-repeated calls.
- Unnecessary refetching or recalculation.
- Expensive table and chart rendering.
- Cache behaviour and lazy loading.

Say whether each concern is demonstrated (measured) or theoretical.

## Audit 12 — Docs match the app

Compare what README.md and the User Guide say about the scope with what the
app actually does. Every promise the guide makes should be true:
- A control it describes exists and works.
- A behaviour it describes happens.
- A limit it states is the real limit.

Also flag behaviour that has changed but whose docs weren't updated, and
documented features that are missing or have regressed.

## Delegating

If subagents are available, you may split independent areas across them, for
example data and calculations, UI and interaction, saved data, and tests.
Give each the scope and these rules. A subagent's finding still needs its own
evidence before it goes in the report.

## Output

Create a new run folder `docs/audits/results/<YYYY-MM-DD>-<scope>/` (today's
date; scope such as `full-app` or `dashboard`). Never reuse or overwrite an
earlier run's folder. Write `1-audit.md` in it, containing:

1. **Plain-English summary first**, for the owner, who isn't a developer. What
   was checked, how many findings at each severity, the few that matter most
   and why, and what was checked and found fine.
2. The baseline: commit, version, and the build and test results.
3. A master index of findings by severity, with ID and one line each.
4. Findings in detail, grouped by audit area, each with the fields listed
   under Ground rules.
5. The needs-verification (V) items, kept separate.
6. A recommended fix order: by correctness impact, user impact,
   reproducibility, size and regression risk.
7. Tests added: what failure each protects against, and which are
   `it.fails`/`it.skip` for which finding.
8. Final `npm run build` and `npm test` results.

Then add a row for this run to the "Past runs" table in `docs/audits/README.md`.

Finally, **commit** the report, the README row and any added tests, with no
production code, on its own ("Audit <date> <scope>: phase 1 report"). Don't
tag a release. The commit is the baseline Phases 2 and 3 work from.
