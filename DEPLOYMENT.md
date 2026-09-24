# Deployment

## Current status: desktop app is primary; Railway is retired

The Railway deployment described below was decommissioned (project
deleted) once the Electron desktop app (see README's "Desktop app and
releases" section) was verified working end-to-end — each user now runs
their own copy locally, against their own FPL API requests, at zero
hosting cost, instead of one shared paid host. Everything below this
point (Docker image, `railway.json`, the single-host reasoning) is kept
as-is, working and unmaintained-but-valid, purely as a reference if the
hosted web version is ever wanted again — `Dockerfile` and
`railway.json` are still in the repo and nothing about them changed. It
would just need a fresh Railway (or equivalent) project created and
linked, since the old one no longer exists.

## Hosting shape: single host, not split

This app needs a real always-on backend — the Express proxy caches and
rate-limits calls to the live FPL API (see README's "API endpoints
and caching") — so pure static hosting for the client alone was never an
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
version this project deliberately avoided (real
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

## Electron desktop app: verified working, now the primary distribution path

Railway's free tier was ending, which prompted moving off a paid shared
host entirely: each user now runs their own copy of the app locally,
against their own network connection, at zero hosting cost — the app's
heavier server-side work (TTL caching, a concurrency-limited historic-
data build across ~600 players) still happens, it just runs on the
user's own machine instead of a shared box, with the side benefit of
spreading FPL API load across many home IPs instead of one shared one.

This was previously written and reasoned through but never run on a
real desktop (see git history for the earlier, more tentative version
of this section). It has now actually been built, installed, and
launched end-to-end on a real Windows machine, and two real bugs
specific to that were found and fixed:

- **`ERR_UNSUPPORTED_ESM_URL_SCHEME` on Windows.** `main.js`'s dynamic
  `import()` of the server bundle used a raw `path.join(...)` result —
  fine on macOS/Linux, but Node's ESM loader rejects a raw `"C:\..."`
  path as an unsupported URL scheme (`"c:"`) on Windows. Fixed by
  switching the server bundle to CommonJS output (`--format=cjs`,
  `server/dist/app.bundle.cjs`) and loading it with a plain `require()`
  instead of a dynamic `import()` — sidesteps the URL/path question
  entirely, since `require()` takes a filesystem path natively.
- **`Dynamic require of "path" is not supported`.** esbuild's ESM output
  has no real `require` in scope, so any dependency doing a dynamic
  `require(x)` it can't statically resolve — `body-parser`'s `depd`
  dependency does exactly this, for the built-in `path` module — gets
  replaced with a shim that throws the moment it runs. This is the same
  failure the Dockerfile section above hit trying to use this bundle as
  a process entry point; it turned out to affect Electron's `import()`
  usage too, contrary to what was assumed here previously. The same CJS
  switch fixes it for the same reason: CJS keeps a real `require` in
  scope, so `depd`'s `require("path")` (a Node built-in — always
  resolvable, no relative-path concerns) just works.
- A third, Windows-packaging-specific issue: `electron-builder`'s NSIS
  target normally downloads a `winCodeSign` tool archive (used for
  editing the exe's icon/version resources) that contains macOS `.dylib`
  symlinks — extracting those requires Windows "Developer Mode" or an
  elevated shell, neither of which can be assumed on a build machine (or
  CI runner). Since this app ships unsigned with no custom icon yet
  anyway, `win.signAndEditExecutable: false` in `package.json`'s build
  config skips that step entirely rather than requiring a machine-level
  setting change.

**Auto-updates**: wired via `electron-updater` — `main.js` calls
`autoUpdater.checkForUpdatesAndNotify()` once the window is up, which
checks GitHub Releases (`package.json`'s `build.publish` config) for a
newer tag, downloads it in the background, and shows a native OS
notification prompting a restart when ready. This is a no-op during
`npm run electron:start` (electron-updater skips itself for an
unpackaged dev run).

**Release pipeline**: `.github/workflows/release.yml` builds and
publishes automatically on every `v*` tag push — the exact same
tagging convention this project already uses for the web deploy, now
with one added effect: it also builds the Windows installer and
publishes it (plus the `latest.yml` update-metadata file) to a GitHub
Release, which every installed copy's `electron-updater` then finds.
The workflow derives the app version from the pushed tag itself
(`npm pkg set version=...`) rather than requiring `package.json`'s
`version` field to be kept in sync by hand.

**Platform scope**: Windows-only for now (NSIS installer), unsigned
(a SmartScreen "Windows protected your PC" prompt on first install is
expected and normal — click "More info" → "Run anyway"). Mac/Linux can
be added later as more matrix entries in the same workflow; nothing
about the current setup would need to change to add them.
