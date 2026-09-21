# FPL Analytics Dashboard — Non-negotiable rules

Claude: read this fully at the start of every session. These rules matter more
than anything you might "remember" from an earlier conversation — if this file
and your memory of a past chat disagree, this file wins.

## Working with me
- I'm not a developer. Explain findings and trade-offs in plain terms, not jargon.
- Audit and fix are separate passes. Don't silently fix things while auditing,
  and don't skip straight to code changes when I ask you to investigate something.
- Before you mark any issue "fixed", show me the evidence (test output, a
  reproduction, a screenshot) rather than just asserting it's correct.

## Project overview

FPL Analytics Dashboard — a locally-run FPL scouting/analytics SPA built
against the live official FPL API. TypeScript throughout: Express proxy
(`server/`) + React/Vite client (`client/`), npm workspaces at this
directory's root. **Full feature docs, methodology, and a detailed
changelog live in `README.md` — read it before making non-trivial
changes.** `DEPLOYMENT.md` has hosting/build/Electron details.

## Running this project

```bash
npm install            # root workspace install — covers server + client (first time only)
npm run dev             # both dev servers (server :4000, client :5173, Vite proxies /api)
npm run build            # type-checks (tsc -b / tsc -p) + builds both for production
npm start                # runs the production build (node server/dist/index.js)
```

- **Test:** no automated test suite exists in any package (root/server/client
  all lack a `test` script). Verification is manual (type-check + running the
  app). Playwright is not an installed dependency but works via
  `npx playwright install chromium` + a small driver script for browser
  checks; nothing Playwright-related is committed to the repo.
- **Build/typecheck:** `npm run build` is the closest thing to a check
  suite — it runs `tsc -b`/`tsc --noEmit` for both packages before bundling,
  so a type error fails the build.
- **Lint:** no lint script is configured in root, `server/`, or `client`'s
  `package.json`.

## Data
- The official FPL API is the only authoritative source for player data.
- **Inspect the live API, never assume a field's shape.** Advanced/
  expected-stats field availability is detected at runtime
  (`client/src/normalize/fieldAvailability.ts`), not hard-coded.
- Never fabricate, substitute, or infer a metric when the authoritative value
  is unavailable. Leave it null and display it as "—" (`DASH` in
  `utils/format.ts`), never as 0 — except where a value is genuinely,
  provably zero (e.g. pre-season cumulative stats — see
  `resolvePlayerStats.ts`'s handling of `currentSeasonHasStarted`).
- Never let NaN or Infinity reach the UI.
- `now_cost` is in £0.1m units.
- xGI is authoritative from the FPL API where available.
- Never substitute tackles, interceptions, BPS, or any other metric for
  "defensive contributions" (DC).
- Determine the current gameweek from `events.is_current`, with an explicit,
  documented fallback for when no gameweek is current.

## Calculations
- Per-90 calculations use aggregate minutes, never the average of per-gameweek
  values.
- Per-£m calculations use the correct current-price conversion.
- Every derived metric has a documented formula (see docs/DATA_DICTIONARY.md
  once it exists).
- Every calculation handles zero minutes and null values safely — no
  divide-by-zero, no silent 0-instead-of-null.
- goals-minus-xG and assists-minus-xA use consistent source values everywhere
  they appear.

## Architecture

```
Raw FPL API -> Express proxy (cache/timeout/retry) -> Zod validation
  -> raw types (types/raw.ts) -> normalize/ -> metrics/
  -> React Context (state/AppStateContext.tsx) -> pages/, components/
```

- Keep current / future / historical data access behind the existing
  data-provider abstraction — don't bypass it from a new component.
- `element-summary/{player_id}` is lazy-loaded per player when their detail is
  viewed, never fetched for every player at startup.
- Don't introduce a database, authentication, or backend complexity unless a
  feature specifically requires it.
- Preserve existing API caching behaviour. The client **only ever calls
  relative `/api/*` paths** — no client-side env vars exist. This is why the
  app deploys as a single host (server serves the built client too, via
  `createApp()`'s static-serving fallback) — see `DEPLOYMENT.md`.
- `AppStateContext.tsx` is the single source of truth for players, teams,
  fixtures, and historic data (`historicProfiles`, `allTimeSeasonsByPlayerId`)
  — fetched once, shortly after app load, and **shared**, never re-fetched
  per-page.
- **Analysis-mode + filters are per-page, not shared.** Every page holds its
  own local `analysisMode` (+ `GlobalScoutingFilters` where it has a criteria
  bar) in `useState`, rendering the controlled `AnalysisModeToggle`/
  `FiltersBar` components — never a shared context value. Changing one page's
  mode/criteria must never change what another page shows; this was a real,
  user-reported bug (Player Explorer's Min Minutes affecting the Dashboard)
  before the fix. See `state/scoutingFilters.ts` and README's "Per-page
  filter/analysis-mode state" for the full story. Three-way toggle (Last
  Completed Season / Historic Average / Current Season) resolved through
  `resolvePlayerStats.ts` either way. Team Building is the one page that
  doesn't use it at all — see README's "Team Building: a predictive model"
  for why.

## UI conventions
- **Graceful degradation over crashes.** A bad field, unmatched player, or
  unrecognised value produces a warning, not a broken page. Server routes
  fall back to stale cache on upstream failure rather than erroring outright.
- **No inline explanatory captions on new features.** Don't add a
  `page-subtitle`/help paragraph under a control just to explain how it
  works — if a feature genuinely needs explaining, that explanation goes in
  the User Guide page (`pages/UserGuide.tsx`) only, not in the UI itself.
  The UI should be self-explanatory or not need the explanation.

## A recurring bug class in this codebase: stale closures in `useCallback([])`

`AppStateContext.tsx` has (had) two real bugs of the same shape: a
`useCallback` with an intentionally-empty dependency array (to avoid
re-running on every render) reads a piece of React state directly in its
body — the closure captures that state's *initial* value forever, not its
current value. Both were fixed by keeping a `useRef` in sync with the real
value and reading the ref inside the callback instead. If you add new state
to this pattern (a stable callback that needs to check "do we already have
X"), use a ref, not the state variable directly.

## Known-good state (last verified)

Both packages type-check clean (`tsc -b` / `tsc --noEmit`) and the app loads
with zero console errors across every page. Production build, the Electron
desktop app, and its GitHub Actions release/auto-update pipeline were
verified end-to-end. See git history / session notes for specifics — don't
assume this stays true without re-checking after further changes.

## Distribution: desktop app, not a hosted website

The Windows desktop app (Electron, auto-updating via GitHub Releases — see
`DEPLOYMENT.md`) is the primary way this app reaches users now. The Railway
web deployment was decommissioned once the desktop app was verified working
— `Dockerfile`/`railway.json` still exist and still work, kept only as a
reference for potential future redeploy, not as anything currently live. A
new release ships by tagging exactly as before (`git tag -a vX.Y.Z && git
push origin vX.Y.Z`); CI takes it from there and every installed copy
updates itself.

## Quality
- Never "fix" a failing test by weakening or removing it.
- Never hard-code a value just to make a test pass.
- Never claim something is correct without actually testing or tracing the
  implementation.
- Prefer fixing the root cause over adding a defensive patch on top.

## Current process
- We periodically run a three-phase review documented in docs/audits/:
  1. PHASE-1-FORENSIC-AUDIT-PROMPT.md — investigate and report only, no fixes.
  2. PHASE-2-REMEDIATION-PROMPT.md — fix confirmed issues from the audit.
  3. PHASE-3-ADVERSARIAL-REGRESSION-PROMPT.md — try to break what was just fixed.
- Each phase runs in its own fresh session. Don't try to do more than one
  phase in the same conversation.
