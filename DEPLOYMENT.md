# Deployment

The app ships only as the Windows desktop app (below). Each user runs their
own copy, against their own FPL API requests, at no hosting cost.

## Web hosting (retired)

Until 2026-09 the app was also hosted on Railway as a website. That project
is deleted, and its files (`Dockerfile`, `railway.json`, `.dockerignore`)
and the `/api/health` check only Railway called were removed on 2026-10-23
(`docs/HISTORY.md`). To bring it back:

1. **Restore the files** from the last commit that had them:
   `git checkout 300f745 -- Dockerfile railway.json .dockerignore`.
   The Dockerfile is a two-stage build: `npm ci` + `npm run build`, then
   a production-only install running `node server/dist/index.js`. It uses
   the plain compiled server, not the Electron bundle, because that bundle
   fails as a process entry point (`Dynamic require of "path"`, from
   body-parser's `depd`).
2. **Bind outside connections:** the server listens on loopback only
   (`<loopback_only>`, `server/src/listen.ts`); set `HOST=0.0.0.0` in the
   container (the restored Dockerfile does). `PORT` (default 4000) is read
   by `server/src/config.ts`; most hosts inject it.
3. **Health check:** `railway.json` checks `/api/health`; add that route back
   to `server/src/app.ts` (any 200 JSON response) or point the check at
   `/api/fixtures`.
4. **One host, not split.** The client calls relative `/api/*` paths only,
   and `server/src/app.ts` serves the built client whenever `client/dist`
   exists, so one process serves both from the same address and no CORS
   setup is needed. Splitting client and API across two addresses would
   need an API base URL in `client/src/api/client.ts` and a CORS allow-list
   on the server.
5. Create a new Railway (or similar) project and link the repo.

## Electron desktop app: verified working, now the primary distribution path

**Renamed to Scoutline (2026-10-19), on Electron 44.** The installer,
window and shortcut are now "Scoutline". What lets existing installs update
in place and keep their saved data is unchanged on purpose: `appId`
(`com.fpldashboard.app`), the root package `name`, the GitHub repo (the
update feed and the Understat data URL), and the saved-data folder, which
`electron/main.js` pins to its old name (`%APPDATA%\FPL Analytics
Dashboard`, `<saved_data_folder>`). The installer shows `LICENSE.txt`
(`build.nsis.license`). See README "Desktop app and releases" and "Legal".

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
  failure the retired Dockerfile hit trying to use this bundle as
  a process entry point; it turned out to affect Electron's `import()`
  usage too, contrary to what was assumed here previously. The same CJS
  switch fixes it for the same reason: CJS keeps a real `require` in
  scope, so `depd`'s `require("path")` (a Node built-in — always
  resolvable, no relative-path concerns) just works.

**Auto-updates**: wired via `electron-updater` in `main.js`. Nothing
runs while the app is closed, so on every launch it checks GitHub
Releases (`package.json`'s `build.publish` config) before showing the
main window (which loads hidden meanwhile), unless a check found nothing
new in the last 10 minutes. If opening takes over a second, a small
launch window says so; if there's a newer tag, it shows the download,
then the app closes, the installer runs with its own progress bar and
reopens the app on the new version. No answer within 4s, no internet, or
a download stalled for 30s opens the app as it is, and so does a launch
after an install that didn't take (the app notes each attempt in
`update-state.json`). While the app is open it checks again every 10
minutes, downloads in the background, and a dialog offers "Restart now"
(install with its progress bar, then the app reopens) or "Later"
(installs the same way the next time the app is closed, leaving it closed,
but never while Windows is shutting down). `build.nsis.runAfterFinish` is
off: otherwise a visible one-click install always reopens the app, even
after the person closed it; the app is reopened only via `--force-run`.
Installs are never silent: a silent one showed nothing while it ran, and opening the
app in that gap started the old copy mid-install. This is a no-op during `npm run electron:start`
(electron-updater skips itself for an unpackaged dev run).

**Release pipeline**: `.github/workflows/release.yml` builds and
publishes automatically on every `v*` tag push — the exact same
tagging convention this project already uses for the web deploy, now
with one added effect: it also builds the Windows installer and
publishes it (plus the `latest.yml` update-metadata file) to a GitHub
Release, which every installed copy's `electron-updater` then finds. The
release is created as a draft (`build.publish.releaseType`), which installed
copies never see, and made public by the workflow's "Publish the release"
step only once all three files are uploaded.
The workflow derives the app version from the pushed tag itself
(`npm pkg set version=...`) rather than requiring `package.json`'s
`version` field to be kept in sync by hand.

**Platform scope**: Windows-only for now (NSIS installer), unsigned
(a SmartScreen "Windows protected your PC" prompt on first install is
expected and normal — click "More info" → "Run anyway"). Adding
Mac/Linux would need their targets in `package.json`'s `build` config
(`mac`/`linux`, removed 2026-10-23 as never built) and more matrix
entries in the same workflow.
