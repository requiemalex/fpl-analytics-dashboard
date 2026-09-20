# CLAUDE.md

FPL Analytics Dashboard — a locally-run FPL scouting/analytics SPA built
against the live official FPL API. TypeScript throughout: Express proxy
(`server/`) + React/Vite client (`client/`), npm workspaces at this
directory's root. **Full feature docs, methodology, and a detailed
changelog live in `README.md` — read it before making non-trivial
changes.** `DEPLOYMENT.md` has hosting/build/Electron details.

## Non-negotiable conventions (do not work around without flagging it)

- **Inspect the live API, never assume a field's shape.** Advanced/
  expected-stats field availability is detected at runtime
  (`client/src/normalize/fieldAvailability.ts`), not hard-coded.
- **Missing data is never zeroed.** A null/missing metric renders as
  `—` (`DASH` in `utils/format.ts`), never a silent `0` — except where a
  value is genuinely, provably zero (e.g. pre-season cumulative stats —
  see `resolvePlayerStats.ts`'s handling of `currentSeasonHasStarted`).
- **Graceful degradation over crashes.** A bad field, unmatched player,
  or unrecognised value produces a warning, not a broken page. Server
  routes fall back to stale cache on upstream failure rather than
  erroring outright.
- **No inline explanatory captions on new features.** Don't add a
  `page-subtitle`/help paragraph under a control just to explain how it
  works — if a feature genuinely needs explaining, that explanation goes
  in the User Guide page (`pages/UserGuide.tsx`) only, not in the UI
  itself. The UI should be self-explanatory or not need the explanation.

## Architecture

```
Raw FPL API -> Express proxy (cache/timeout/retry) -> Zod validation
  -> raw types (types/raw.ts) -> normalize/ -> metrics/
  -> React Context (state/AppStateContext.tsx) -> pages/, components/
```

- The client **only ever calls relative `/api/*` paths** — no client-side
  env vars exist. This is why the app deploys as a single host (server
  serves the built client too, via `createApp()`'s static-serving
  fallback) — see `DEPLOYMENT.md`.
- `AppStateContext.tsx` is the single source of truth for players,
  teams, fixtures, and historic data (`historicProfiles`,
  `allTimeSeasonsByPlayerId`) — fetched once, shortly after app load,
  and **shared**, never re-fetched per-page.
- **Analysis-mode + filters are per-page, not shared.** Every page holds
  its own local `analysisMode` (+ `GlobalScoutingFilters` where it has a
  criteria bar) in `useState`, rendering the controlled
  `AnalysisModeToggle`/`FiltersBar` components — never a shared context
  value. Changing one page's mode/criteria must never change what
  another page shows; this was a real, user-reported bug (Player
  Explorer's Min Minutes affecting the Dashboard) before the fix. See
  `state/scoutingFilters.ts` and README's "Per-page filter/analysis-mode
  state" for the full story. Three-way toggle (Last Completed Season /
  Historic Average / Current Season) resolved through
  `resolvePlayerStats.ts` either way. Team Building is the one page that
  doesn't use it at all — see README's "Team Building: a predictive
  model" for why.

## A recurring bug class in this codebase: stale closures in `useCallback([])`

`AppStateContext.tsx` has (had) two real bugs of the same shape: a
`useCallback` with an intentionally-empty dependency array (to avoid
re-running on every render) reads a piece of React state directly in its
body — the closure captures that state's *initial* value forever, not
its current value. Both were fixed by keeping a `useRef` in sync with
the real value and reading the ref inside the callback instead. If you
add new state to this pattern (a stable callback that needs to check
"do we already have X"), use a ref, not the state variable directly.

## Development

```bash
npm install        # root workspace install — covers server + client
npm run dev          # both dev servers (server :4000, client :5173, Vite proxies /api)
npm run build         # type-checks + builds both for production
npm start             # runs the production build (node server/dist/index.js)
```

No test suite exists — verification is manual (type-check + running the
app). Playwright is not an installed dependency but works fine via
`npx playwright install chromium` + a small driver script for browser
checks; not committed to the repo.

## Known-good state (last verified)

Both packages type-check clean (`tsc -b` / `tsc --noEmit`) and the app
loads with zero console errors across every page. Production build,
the Electron desktop app, and its GitHub Actions release/auto-update
pipeline were verified end-to-end. See git history / session notes for
specifics — don't assume this stays true without re-checking after
further changes.

## Distribution: desktop app, not a hosted website

The Windows desktop app (Electron, auto-updating via GitHub Releases —
see `DEPLOYMENT.md`) is the primary way this app reaches users now. The
Railway web deployment was decommissioned once the desktop app was
verified working — `Dockerfile`/`railway.json` still exist and still
work, kept only as a reference for potential future redeploy, not as
anything currently live. A new release ships by tagging exactly as
before (`git tag -a vX.Y.Z && git push origin vX.Y.Z`); CI takes it
from there and every installed copy updates itself.
