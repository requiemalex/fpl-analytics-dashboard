# Release

Check that what's waiting is ready, then release it (CLAUDE.md
"Releasing"). Read `docs/audits/strategy/RULES.md` first.

Being asked to run this prompt is the owner saying to release, and asking
you to run the app for it (the quick probe and one isolated desktop
launch). Arguments: `check` stops after the go/no-go, before anything is
tagged; a version (`v1.133.0`) replaces the one you work out.

## You are the lead — target under 30 tool calls

### Step 1 — What's waiting (lead)

- `npm run unreleased`. Nothing waiting → say so and stop. Uncommitted
  edits or unpushed commits → stop and list them: never commit someone's
  unfinished work in order to release it.
- `git pull --rebase` (the automatic jobs commit data to master).
- Version: `git describe --tags --abbrev=0`, then minor if any waiting
  change is a feature, patch if they're all fixes. Name the subjects that
  made it a feature.
- From `docs/audits/README.md` "Past runs", read the last two rows only.
  An audit with a remediation but no Phase 3 since, or a Phase 3 that
  recommends a fix before release that hasn't been made, goes in the
  go/no-go as a warning (the owner decides; it doesn't block by itself).

### Step 2 — Checks (in parallel)

- **Lead:** start `npm run probe -- --quick` in the background, run
  `npm run check` meanwhile.
- **Helper A — desktop launch.** `npm run build -w client && npm run
  build:electron-server`, then launch the desktop app isolated from the
  owner's saved data: a throwaway wrapper in `audit-output/tmp/electron/`
  whose `main.js` calls `app.setPath("appData", <that folder>/appdata)`
  before `require`-ing `electron/main.js`, with a `package.json` beside it,
  run as `env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe
  audit-output/tmp/electron`. Setting `APPDATA` does **not** isolate it —
  never let it open `%APPDATA%\FPL Analytics Dashboard`. Pass if the
  window loads the app (not blank: v1.101.0 opened to a blank window) and
  the isolated `logs/scoutline.log` shows no error; at most one capture of
  the window (`webContents.capturePage()`). Stop the app after.
- **Helper B — paperwork.** Since the last tag (`git diff --stat
  <tag>..`): if any `package*.json` changed, run `npm run legal:notices`
  and check `git status` is clean after (if not, the notices were out of
  date: commit them as "Update third-party notices"). If `LICENSE.txt` or
  `PRIVACY.md` changed in substance, `TERMS_VERSION` was bumped. Each
  feature change touched its README section and, if users see it, Help
  (`client/src/help/`); list any that didn't. No personal names and no
  "FPL"/"Premier League" in product names or titles in the changed files.

Helpers stop at 40 tool calls and reply with a few lines.

### Step 3 — Go / no-go (lead)

A short table: check, result. **Go** only if `npm run check` passes, the
quick probe is clean (or each line it printed is reproduced and shown to
be already in the last release, not new), the desktop app loads, and the
notices are current. Docs gaps and audit warnings are listed, not
blocking. **No-go:** say in plain English what's wrong and what to do
next (often a fix, or `/audit`), and stop. `check` given: stop here.

### Step 4 — Release (lead), exactly as CLAUDE.md "Releasing"

`npm run release-notes -- vX.Y.Z`; commit `docs/RELEASES.md` as "Release
notes: vX.Y.Z"; `git tag -a vX.Y.Z -m "vX.Y.Z"`; push master and the tag.
Watch the `release.yml` run in the background (`gh run watch`). When it
finishes, end the reply with `npm run released`'s output. If the build
fails, say so with the failing lines (`gh run view <id> --log-failed |
tail -40`); never delete, move or re-push a published tag without the
owner.

Around May, the club-history archive releases a patch by itself when the
season completes, shipping whatever is on master: say so if a release now
would land in that window.
