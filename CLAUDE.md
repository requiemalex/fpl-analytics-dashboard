# Scoutline — Non-negotiable rules

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
Scoutline (until 2026-10-19 "FPL Analytics Dashboard"): an FPL
scouting/analytics app on the live official FPL API. TypeScript
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
- `docs/RELEASES.md` — every release and the changes it shipped, written
  from git ("Releasing" below).

```bash
npm install     # first time
npm run dev     # server :4000 + client :5173
npm run build   # type-checks both packages — a type error fails the build
npm test        # Vitest, both workspaces, + electron/*.test.js (node --test); coverage is partial — extend it
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
  sources usually differ (xG family incl. a player's xGC, assists, minutes); goals, scores and
  results almost always agree, so they stay FPL only, while Understat's own
  goal-based columns (Goals − xG, NP Goals) use Understat's count. The same
  data rules apply to it (null not 0, nothing inferred). No other source
  without my approval.
  **A player's Understat xGC — one rule, everywhere** (owner's decision,
  2026-10-21; `<understat_player_xgc>`, `client/src/understat/playerXGC.ts`):
  the xG of the shots his club's opponents took while he was on the pitch
  (`<shots_faced_on_pitch>`, `server/src/understat/onPitch.ts`: a starter
  from kick-off until his minutes run out, a sub for his last minutes of a
  90). Anything new that needs a player's Understat xGC or shots faced uses
  these two, never its own version.
- **Inspect the live API, never assume a field's shape.** Field availability
  is detected at runtime (`normalize/fieldAvailability.ts`).
- Never fabricate, substitute, or infer a metric when the real value is
  unavailable: leave it `null` and show "—" (`DASH`, `utils/format.ts`), never
  0. A player with **0 minutes** in a Data View has nothing to show: every
  performance figure is "—", never 0, in every Data View, pre-season
  included (owner's decision, 2026-10-19; `<no_minutes_no_figures>` in
  `resolvePlayerStats.ts`). A player who did play keeps a real 0 for a
  stat he didn't record.
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
  views) the fixed floor applies — a quarter of the minutes available: 855 for a
  completed season, and in Current Season 25% of the finished gameweeks × 90,
  never under 90 (`metrics/fixedMinutesFloor.ts`, `state/seasonProgress.ts`) — to every percentile, totals too; below
  it is a "small sample" with no percentile or colour. Everywhere: no data
  counts as 0 minutes (`isUnderMinimum`); **one Historic Average**, counting
  only seasons of 855+ minutes (a shorter season's figures don't count at
  all), over the last 4 completed seasons, never reaching further back.
  Clubs and forward-looking figures (Team Building's Exp. Pts, Minutes
  Reliability, pitch cards) have no floor. **Every** threshold shows the
  stopwatch — on the view where it applies and on each entry under it,
  and no other symbol (`<minutes_marker>`,
  `components/MinutesFloorBadge.tsx`). An entry's is always amber; a
  view's is amber only while something it shows is under the threshold,
  grey otherwise (`<marker_follows_data>`, owner's rule 2026-10-20).
  Where a section lists players chosen by criteria (Player Explorer, Team
  Building's Add Players, a Dashboard tile or graph the user built), a
  Hide button — the stopwatch struck through — leaves out the entries
  under the threshold (`<hide_small_samples>`, off by default). Check
  which side a section is on before adding or removing any floor.
- **Comparative colouring — one rule** (owner's decision, 2026-10-19;
  README "Comparative colouring", `metrics/comparativeColour.ts`). Green /
  red on any figure is its rank: a player's within his position among the
  whole pool for the view's Data View (never just the filtered rows), a
  club's among all clubs. The fixed floor (a quarter of the minutes available) always
  applies to colour, on every page: under it, no colour and out of the
  pool. More is better (over-performance included); lower price and
  ownership are better; played, draws and style stats are never coloured.
  The top bar's palette switch turns every such colour off at once
  (`<comparative_colour_switch>`): paint by rank only through
  `percentileTint` / `percentileColour`, never a colour of your own.
  Never use green or red as a series or decoration colour (one exception,
  the owner's choice: the green "line" in the Scoutline logo).

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
- **Same thing, same way, everywhere** (owner's rule, 2026-10-20). Before
  building or changing anything in a section, check how the same thing
  already works elsewhere in the app and do it that way: a universal rule
  over a section-specific one, the same behaviour across sections, and the
  shared element (component, helper, toggle, marker, picker grouping)
  reused rather than a new variant. Example: Understat's ⇄ toggle works on
  the Dashboard and Player Comparison exactly as in the Explorers
  (`<same_toggle_everywhere>`). Where a section genuinely can't match, flag
  it to me before building it, and say why in the code and README.
- **Same layout at every screen size** (owner's rule, 2026-10-21). A
  layout keeps its structure and spacing as the window changes: gaps
  between a graph and its figures, between cards, and so on are fixed
  tokens, never whatever space is left over; only the room around a group
  grows. Things of the same kind share one layout (e.g. every graph with
  a figures panel uses `.shot-card-body`: shot maps and the formation
  pitch alike). Check a layout change at laptop and wide-monitor widths.
- **Three fonts only** (owner's rule, 2026-10-21, `<font_families>`):
  Archivo (headings), IBM Plex Sans (body), JetBrains Mono (figures),
  bundled locally and used only through `--font-display`/`--font-body`/
  `--font-mono` or `inherit`. Never add a family, a web-font link or a
  hard-coded font; `client/src/styles/fontRule.test.ts` fails if you do.
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

## Name and legal
- The product is **Scoutline** (`client/src/brand.ts`, `package.json`
  `productName`, `electron/main.js`). Never put "FPL", "Fantasy Premier
  League" or "Premier League" in the product's name or titles; they may
  only describe the data.
- Never change `appId`, the root package `name`, the GitHub repo name, the
  saved-data folder (`<saved_data_folder>`) or any `fpl-dashboard:`
  localStorage key: installs would stop updating or lose saved data.
- **No personal names** anywhere in the app or codebase (owner's decision,
  2026-10-20): the copyright holder is "the Scoutline developer" /
  "Scoutline" (`client/src/brand.ts`, `LICENSE.txt`, `package.json`).
- Terms are `LICENSE.txt`, privacy `PRIVACY.md` (README "Legal"). A
  substantive change to the terms needs a `TERMS_VERSION` bump. After a
  dependency change, run `npm run legal:notices` and commit the result.

## Releasing
**Releases are batched, and only when I say** (owner's decision,
2026-10-23). Every finished change is committed straight away with a
plain-language subject line (that line is what the change list shows), and
master is pushed, but nothing is tagged. Git is the record of what's
waiting, never anyone's memory of a past session: `npm run unreleased`
lists every change since the last release, with dates and times, and warns
about edits not committed and commits not pushed. **After finishing and
committing a change, end your reply with that command's output.** The same
report, uncommitted edits first, is shown to me when a session opens
(`npm run session-start`, run by the SessionStart hook in the parent folder's
`.claude/settings.local.json`; `scripts/release/changes.ts` builds both). Remind me
to release when the list has grown or holds a fix users are waiting for.

To release: commit and `git pull --rebase`; `npm run release-notes -- vX.Y.Z`
(minor if the batch has any feature, patch if it's only fixes) and commit
`docs/RELEASES.md` as "Release notes: vX.Y.Z"; then `git tag -a vX.Y.Z -m
"vX.Y.Z"` and push both master and the tag.
`.github/workflows/release.yml` builds and publishes, with the version's
change list on its GitHub Release page; installed copies update
themselves. **Once the build has finished, end your reply with `npm run
released`'s output** ("vX.Y.Z now released" and every change in it; it
says so if the release isn't public yet). `docs/RELEASES.md` keeps every
release's changes for good (GitHub keeps only the last 5 releases); it's
written from git, never by hand. The club-history archive releases a patch by
itself when a season completes (around May), and that release ships
whatever is on master, so around then, release first or expect it to
carry the pending changes. Railway hosting is retired and its files
removed; DEPLOYMENT.md "Web hosting (retired)" says how to restore it.

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
