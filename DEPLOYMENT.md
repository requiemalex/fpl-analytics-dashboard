# Deployment

## Hosting shape: single host, not split

This app needs a real always-on backend — the Express proxy caches and
rate-limits calls to the live FPL API (see README's "API caching
behaviour") — so pure static hosting for the client alone was never an
option. The remaining choice was **one host running both client and
server** vs. **a split deployment** (static frontend host + separate API
host). Single-host was chosen, for reasons specific to how this app is
actually built, not as a generic default:

- **The client only ever calls relative `/api/*` paths** (`client/src/api/client.ts`
  uses `fetch(path)` with no base URL, anywhere) — confirmed by grepping
  the whole client source for `import.meta.env`/`process.env`: there are
  zero client-side env vars. That only works for free when client and
  server share an origin. A split deployment would mean either adding a
  configurable API base URL to every fetch call, or relying on the
  static host's own edge rewrite rules to proxy `/api/*` through to a
  separate API host — both are real, avoidable complexity for an app
  this size.
- **`server/src/app.ts` already serves the built client** whenever
  `client/dist` exists on disk (`express.static` + an SPA fallback to
  `index.html` for non-API routes) — this was built for the Electron
  path but is exactly the single-host production path too. Verified
  working end-to-end in this round (see "What was verified" below).
- **No CDN-heavy asset story.** This is a small SPA (one ~250KB gzipped
  JS bundle), not a large media-serving site — the usual reason to put a
  CDN/static host in front of a separate API doesn't apply here.
- **No independent-scaling need.** Client and server traffic are the
  same traffic (one user, one browser tab) — there's no scenario where
  you'd want to scale the static frontend separately from the API.

The tradeoff going the other way: a split deployment (e.g. Vercel for
the client + Railway/Fly for the API) would give you a CDN-fronted
client with near-zero cold-start for static assets, and would let you
redeploy the frontend without restarting the API process (irrelevant
here — the API's in-memory cache is cheap to rebuild, per the README's
"Known limitations"). If this ever grows into the multi-user website
version the README explicitly says it deliberately avoided (real
database, shared cache across many users), split hosting would be worth
revisiting. For the app as it exists today, single-host is the simpler,
correct choice.

## Environment variables

All server-side; the client has none (see above).

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `4000` | What the server listens on. Railway (and most PaaS hosts) inject this automatically — no action needed. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Used only for the CORS `origin` allow-list. Irrelevant for a single-host deploy (same-origin requests never trigger CORS) — only set this if you ever split the deployment or add a second consumer of the API on a different origin. |

No `.env` file / `dotenv` mechanism exists in this app (confirmed —
`dotenv` is only a transitive dependency, never imported by app code).
Set env vars through the hosting platform directly.

## Production build pipeline

```bash
npm install        # root workspace install (server + client)
npm run build       # tsc -p (server type-check) && tsc -b && vite build (client)
npm start            # -> add this script, see below, or: node server/dist/index.js
```

`npm run build` was run and verified in this round: server type-checks
clean, client type-checks and builds to `client/dist` (890KB JS /
247KB gzipped — Vite's own chunk-size warning suggests code-splitting as
a future optimisation, not a blocker for an app this size).

**Root `package.json` has no plain `start` script** — only `server`
(dev mode, `tsx watch`) and the Electron-specific scripts. Add one if
you want `npm start` to run the production build directly outside
Docker:
```json
"start": "node server/dist/index.js"
```

## Docker / Railway

`Dockerfile` and `railway.json` are provided at the repo root.

- **Multi-stage build**: a `build` stage does a full `npm ci` +
  `npm run build`; the `runtime` stage does a separate `npm ci --omit=dev`
  (production dependencies only — skips typescript/vite/esbuild/electron,
  which are large) and copies over just `server/dist` and `client/dist`.
- **Verified end-to-end in this round**, not just written: built the
  image's exact runtime-stage steps by hand (fresh `npm ci --omit=dev`
  install + the built `server/dist` + `client/dist`, no dev dependencies
  present) and confirmed `node server/dist/index.js` serves the static
  client, the live API (`/api/bootstrap-static/` returned real
  ~1.6MB data), the SPA fallback (a deep link like `/team-building`
  correctly returns `index.html` rather than 404ing), and `/api/health`
  — all with zero errors. (Docker itself isn't installed in the
  environment this was verified in, so the actual `docker build` /
  container run couldn't be executed — this was validated by exactly
  replicating what the Dockerfile's `RUN`/`COPY` steps produce, rather
  than assumed.)
- **A path that was tried and deliberately rejected**: reusing the
  esbuild single-file bundle already built for Electron
  (`build:electron-server` → `server/dist/app.bundle.js`, ESM format,
  bundles express/cors so nothing needs `node_modules` at runtime).
  It looked like the more elegant option for Docker too — no
  `node_modules` in the final image at all. Testing it directly
  (bundling `index.ts` instead of `app.ts` to get a runnable entry
  point) surfaced a real, reproducible failure: `node <bundle>.mjs`
  throws `Dynamic require of "path" is not supported` from deep inside
  body-parser's `depd` dependency, every time it's run as a normal file
  argument to `node` (directly, or via a `.mjs`/`.cjs` wrapper doing
  `import(...)`) — the *only* invocation style that didn't throw was an
  inline `node -e "import(...)"` eval script, which is not how a
  container `CMD` would ever invoke it. Since Electron's own `main.js`
  only ever reaches this bundle via a dynamic `import()` from its
  CommonJS process (a working, already-correct pattern — see the
  Electron section below), this fragility is specific to trying to use
  the *same* bundle as a direct process entry point, not a problem with
  Electron's usage of it. The Dockerfile therefore uses real
  `node_modules` instead of the bundle — slightly larger image, reliably
  correct.
- **Railway config** (`railway.json`): builds from the `Dockerfile`,
  health-checks `/api/health` (already existed, unused until now),
  restarts on failure. `PORT` is Railway-injected automatically, so no
  extra env var setup is needed for a first deploy.

## Electron desktop app: assessment

The README already disclosed this was written without ever being
installed or run (no network access in that build environment). This
round had real network access, so it was actually tested for the first
time.

**What's now confirmed working, not just reasoned through:**
- `npm run build:electron-server` (the esbuild bundle of `app.ts`) runs
  cleanly and produces a working bundle.
- The specific concern the README flagged as "least able to vouch for" —
  **dynamic `import()` of the ESM bundle from Electron's CommonJS
  `main.js`** — was tested directly and works: `import("../server/dist/app.bundle.js")`
  resolves successfully and `createApp()` runs without error. This is a
  different, safe usage of the same bundle from the fragile pattern
  described above (Docker's failed approach ran the bundle *as* the
  process entry point; Electron's `main.js` dynamically imports it *from
  within* an already-running CommonJS process — the case that
  consistently worked in testing).
- Launching the actual Electron GUI process itself could not be fully
  verified in this environment: the sandbox this was run in sets
  `ELECTRON_RUN_AS_NODE=1` globally, which forces `electron.exe` to run
  as a plain Node process instead of the real Chromium/Electron runtime
  (this is very likely a deliberate guard against agentic sessions
  spawning uncontrolled GUI windows, not something specific to this
  app). Temporarily clearing that variable, the process no longer
  crashed with the `app.whenReady` error the guard causes — but the
  embedded server never came up on its target port either, consistent
  with this sandbox having no real display/window station for a native
  window to attach to, a separate, disclosed limitation of the
  environment this was tested in, on the same footing as the original
  "no network access" limitation the README already discloses elsewhere.
  **A real desktop session (a normal Windows/Mac/Linux machine, not an
  agentic sandbox) is the outstanding step to fully confirm the window
  opens and renders** — everything short of that has now been verified.

**Recommendation: finish the web deployment first, revisit Electron
after.** The core risk the README couldn't check at all (does the
bundle even load without crashing?) is now resolved — it does. What's
left (does a real window open and render on each OS) is a much smaller,
lower-risk gap than what existed before, and is best closed by running
`npm run electron:start` on an actual desktop once, not from here. It
doesn't block or depend on the web deployment in any way (they share
`createApp()` but are otherwise independent artifacts), so there's no
sequencing risk in shipping the web version first.
