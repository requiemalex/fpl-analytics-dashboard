# FPL Analytics Dashboard — Non-negotiable rules

Claude: read this fully at the start of every session. If this file and your
memory of a past chat disagree, this file wins.

## Working with me
- I'm not a developer. Explain findings and trade-offs in plain terms, not jargon.
- Audit and fix are separate passes. Don't silently fix things while auditing,
  and don't skip straight to code changes when I ask you to investigate something.
- Before you mark any issue "fixed", show me the evidence (test output, a
  reproduction, build output) rather than just asserting it's correct.
- I test changes in the running app myself — don't launch it, screenshot it or
  click through it unless I ask.

## Project and docs
FPL scouting/analytics app on the live official FPL API. TypeScript
throughout: Express proxy (`server/`) + React/Vite client (`client/`), npm
workspaces at this root. Shipped as a Windows desktop app (Electron).
- `README.md` — how the app works **now**. Before non-trivial changes, read
  the section you're touching ("Data rules", "Metric methodology", "Saved
  data", the page's implementation notes) — not the whole file.
- In-app User Guide (`client/src/pages/UserGuide.tsx`) — what each page does,
  for users.
- `docs/HISTORY.md` — how things **used to** work. Archived: ignore it unless
  I ask to understand or restore an old feature.
- `DEPLOYMENT.md` — desktop build/packaging/auto-update.

```bash
npm install     # first time
npm run dev     # server :4000 + client :5173
npm run build   # type-checks both packages — a type error fails the build
npm test        # Vitest, both workspaces (coverage is partial — extend it)
```
No lint script. Playwright isn't installed but works via
`npx playwright install chromium` + a throwaway script (commit nothing).

## Data
- The official FPL API is the only authoritative source. One approved,
  one-off exception: club history 2016/17–2025/26 was backfilled from the
  vaastav community archive, frozen in `data/vaastav-snapshot/`. That same
  ledger also feeds the player profile's past-season Match Log (each player's
  own rows; owner's decision, 2026-10-19). Don't extend that exception to
  anything else.
- **Understat is the one approved second source** (owner's decision,
  2026-10-18), on two rules (README "Understat (second data source)"):
  1. **Full separation.** Its figures appear only in their own violet
     columns and profile sections, or in a column the user has switched to Understat with the
     header's FPL/Understat toggle; never mixed into an FPL figure. FPL code
     never imports Understat code: the only connections are the marked lines
     in `client/src/App.tsx` and `server/src/app.ts`
     (`client/src/understat/separation.test.ts` enforces it), so it can be
     removed in one go or switched off (`data/understat/control.json`).
  2. **Checked continuously.** The daily sync stops (writes nothing) if
     Understat blocks us, changes format, disagrees with FPL on a match
     score (scores are how fixtures are paired), or disagrees on so many
     goals (over 0.5% of player-matches) that player links must be wrong,
     and alerts me with a GitHub issue.
  **A stat both sources record may differ between them, and that's fine**
  (owner's decision, 2026-10-18): each column shows its own source's
  figure, and nothing forces one source to match the other. Goals included:
  a goal FPL credits to a player that Understat records as an own goal is
  two sources recording it differently, not an error. Toggles only where the
  sources usually differ (xG family, assists, minutes); goals, scores and
  results almost always agree, so they stay FPL only, while Understat's own
  goal-based columns (Goals − xG, NP Goals) use Understat's count. The same
  data rules apply to it (null not 0, nothing inferred). No other source
  without my approval.
- **Inspect the live API, never assume a field's shape.** Field availability
  is detected at runtime (`normalize/fieldAvailability.ts`).
- Never fabricate, substitute, or infer a metric when the real value is
  unavailable: leave it `null` and show "—" (`DASH`, `utils/format.ts`), never
  0 — unless it's provably zero (pre-season cumulative stats,
  `currentSeasonHasStarted` in `resolvePlayerStats.ts`).
- Never substitute tackles, interceptions, BPS, or any other metric for
  defensive contributions (DC).
- `now_cost` is £0.1m units. xGI is authoritative from the API where
  available. Current gameweek comes from `events.is_current`, with a
  documented fallback.

## Calculations
- Every derived metric has a formula in `metrics/dictionary.ts` and README
  "Metric methodology". Rates use aggregate totals (per game:
  `estimatedGames` from total minutes), never an average of per-gameweek
  values.
- Handle zero minutes and nulls safely — no divide-by-zero, no NaN/Infinity
  in the UI, no silent 0-instead-of-null.
- Goals−xG and assists−xA use the same source values everywhere.
- **Minimum minutes — one rule** (owner's decisions, 2026-10-19; README
  "Minimum minutes"). A floor exists only to stop tiny samples taking over.
  Where the user can set minimum minutes (Player Explorer, Dashboard
  tiles/graphs they build, Player Comparison cards in views they build,
  Team Building) theirs decides the rows, in every Data View, Current
  Season included. Where they can't (player profile, the packaged Starter
  views) the fixed floor applies — 90 min in Current Season, 450 otherwise
  (`metrics/fixedMinutesFloor.ts`) — to every percentile, totals too; below
  it is a "small sample" with no percentile or colour. Everywhere: no data
  counts as 0 minutes (`isUnderMinimum`); **one Historic Average**, counting
  only seasons of 450+ minutes (a shorter season's figures don't count at
  all), over the last 4 completed seasons, never reaching further back.
  Clubs and forward-looking figures (Team Building's Exp. Pts, Minutes
  Reliability, pitch cards) have no floor. **Every** threshold shows the
  amber stopwatch — on the view where it applies and on each entry under
  it, and no other symbol (`<minutes_marker>`,
  `components/MinutesFloorBadge.tsx`). Check which side a section is on
  before adding or removing any floor.
- **Comparative colouring — one rule** (owner's decision, 2026-10-19;
  README "Comparative colouring", `metrics/comparativeColour.ts`). Green /
  red on any figure is its rank: a player's within his position among the
  whole pool for the view's Data View (never just the filtered rows), a
  club's among all clubs. The fixed floor (90 live / 450 otherwise) always
  applies to colour, on every page: under it, no colour and out of the
  pool. More is better (over-performance included); lower price and
  ownership are better; played, draws and style stats are never coloured.
  Never use green or red as a series or decoration colour.

## Architecture
- Client data flows `api/client.ts` → `validation/` → `normalize/` →
  `metrics/` → `state/AppStateContext.tsx`. New code fetches through
  `api/client.ts` using relative `/api/*` paths only, and reads shared data
  from `AppStateContext` — never re-fetched per page.
- `element-summary/{id}` is lazy (per player, on demand). The whole-pool
  historic build runs only when a page (or an open profile) calls
  `requestHistoricData()`.
- **Analysis mode and filters are per page** (`useState` + the controlled
  `AnalysisModeToggle`/`FiltersBar`), never shared: one page must never change
  what another shows.
- No database, auth, or backend complexity unless a feature truly needs it.
  Preserve the proxy's caching behaviour.
- **Saved data:** user settings live in versioned localStorage stores
  (README "Saved data"). Any change to what a store holds — a new field, a new
  default, a changed meaning — needs a `STORAGE_VERSION` bump **and** a
  `migrate()` step. Editing only the fallback doesn't reach existing installs.
  Saved views embed tiles and graphs, so check that store too.
- **Stale closures:** a `useCallback([])` that reads state captures its
  initial value forever. Keep a `useRef` in sync and read the ref instead (as
  `AppStateContext` does).

## UI conventions
- **Graceful degradation over crashes** — a bad field, unmatched player, or
  unknown value gives a warning, not a broken page.
- **No inline explanatory captions.** Explanations go in the User Guide
  only, not under a control.
- **Icons over text buttons** for toolbar and card actions, each with hover
  text (`title` + `aria-label`) saying what it does. Shared icons live in
  `components/IconToolbar.tsx`.

## Keeping docs current
- When behaviour changes, update the affected README section **in place** (no
  changelog entries) and the User Guide if users see it. Check both for
  anything the change makes untrue.
- When a feature is removed or replaced, add an entry to `docs/HISTORY.md`
  under "Removed or replaced since 2026-09-24": what it did, why it went, and
  the last commit that had it.

## Releasing
Commit, then `git tag -a vX.Y.Z -m "vX.Y.Z"` and push both master and the tag
(minor for features, patch for fixes). `.github/workflows/release.yml` builds
and publishes; installed copies update themselves. The club-history
archive releases a patch by itself when a season completes. Railway hosting is
retired — `Dockerfile`/`railway.json` are reference only.

## Quality
- Never "fix" a failing test by weakening or removing it.
- Never hard-code a value just to make a test pass.
- Never claim something is correct without actually testing or tracing the
  implementation.
- Prefer fixing the root cause over adding a defensive patch on top.

## Audit process
Strategy and results are kept apart (index: `docs/audits/README.md`):
- **Strategy** — how to audit, reusable any time: `docs/audits/strategy/`.
- **Results** — what past audits found and fixed, one dated folder per run:
  `docs/audits/results/<YYYY-MM-DD>-<scope>/` (`1-audit.md`,
  `2-remediation.md`, `3-regression.md`). Never overwrite an earlier run.

Three phases, each in its own fresh session (never two in one conversation).
Each takes an optional scope (a page or feature; default the full app):
1. `PHASE-1-FORENSIC-AUDIT-PROMPT.md` — investigate and report only; commits
   the report as the baseline.
2. `PHASE-2-REMEDIATION-PROMPT.md` — fix that run's confirmed findings;
   commits, no release unless I ask.
3. `PHASE-3-ADVERSARIAL-REGRESSION-PROMPT.md` — try to break the fixes; report
   only, and recommend whether to release.

Asking you to run one of these prompts counts as asking you to run the app
for it. When I ask for past audit results, read `docs/audits/README.md` and
`docs/audits/results/`, not the strategy folder.
