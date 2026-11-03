# Audit toolkit

Commands that do the mechanical part of an audit and print only what needs
a look. Code: `scripts/audit/`. Output detail: `audit-output/` (not
committed).

## `npm run check [-- <test filter>] [--no-build]`

The build (type-check) and every test suite (server, client, Electron),
in a few lines. All well:

```
build ok (18s)
server tests 163/163 passed (5s)
client tests 1443/1443 passed (45s)
electron tests 6/6 passed (0s)
```

Otherwise only what failed, with the first lines of each reason. A filter
(`npm run check -- metrics/ --no-build`) runs matching test files only —
use it while fixing, and the full run at the end. Exit code 1 on any failure.

## `npm run probe [-- <probes>] [options]`

Builds the app and runs the built copy on its own port (:4199) in a fresh
headless browser, so it tests what users get and never touches the owner's
running app or saved data. Stops it afterwards. No probe named runs all four
(~10 min: run it in the background).

| Probe | What it does to the app | Reports |
|---|---|---|
| `pages` | Opens every page at 1366 and 1920 px, moving between them as a user does | Crashes, uncaught/console errors, NaN/Infinity/undefined/−0 on screen or in hover text, text cut off, sideways scrolling, shared data re-fetched, duplicate requests, slow pages; load times and API calls per page |
| `failures` | Makes the API fail (500, dropped connection, rubbish, wrong shape, 8 s delay): shared data first, then everything fetched on demand while using each page | Crash or silence instead of an error message, no recovery after Try again; quotes what the page said; says which on-demand routes the run reached |
| `storage` | Damages every saved-data store at once (not JSON, null, wrong types, junk items, a newer version, an unversioned list); if anything breaks, one store at a time to find which | Crashes, errors, bad values per store and damage |
| `monkey` | An impatient user: random clicks, awkward typing key by key (negative, huge, letters, emoji, 80 characters, HTML), Escape, resizing, changing page — 40 steps from each page | Every problem, with the seed and the last 8 steps |

Options: `--quick` (fewer modes, 15 monkey steps — a 2-minute pass),
`--seed=N` (different random steps; the same seed replays the same steps),
`--actions=N`, `--pages=players,team-building` (names, not `/paths`: Git
Bash rewrites a leading `/`), `--no-build` (reuse the last build), `--dev`
(the dev server instead; expect StrictMode's double requests).

Output: one line per distinct problem, plus notes and the path of a JSON
file per probe holding every occurrence, repro steps, timings and each
monkey run's full step list. Read that file with a filter, not whole:

```bash
node -e 'const j=require("./audit-output/<stamp>/monkey.json");console.log(j.issues.filter(i=>i.kind==="crash"))'
```

A monkey problem's repro is its seed and steps: rerun with the same
`--seed` and `--pages` to see it again, then reduce it to the few steps
that matter.

## `npm run probe:selftest [-- --no-build]`

Plants each kind of fault the scan looks for (NaN, Infinity in hover text,
−0, cut-off text, sideways scroll, uncaught and console errors, the crash
screen) and checks each is reported. Run it after changing `scripts/audit/`,
so "No issues" from a probe can be trusted.

## Writing a one-off browser check

Put it in `audit-output/tmp/` and reuse the library rather than starting
from nothing:

```ts
import { resolve } from "node:path";
import { ensureApp } from "../../scripts/audit/lib/server";
import { gotoApp, navigate, launch, openSession, scan } from "../../scripts/audit/lib/browser";
(async () => {
  const ROOT = resolve(__dirname, "../..");
  const app = await ensureApp(ROOT, resolve(ROOT, "audit-output/tmp"), { dev: false, build: false });
  const browser = await launch();
  const s = await openSession(browser, ROOT, { width: 1366, storage: { /* key: JSON */ } });
  await gotoApp(s.page, "/");
  await navigate(s.page, "/players");
  // … drive it; print only the numbers you need
  console.log(await scan(s.page), s.capture.pageErrors);
  await browser.close(); app.stop();
})();
```

Run with `npx tsx audit-output/tmp/<name>.ts`. `openSession` gives a fresh
browser with the terms accepted, optional saved data seeded before the app
starts, and errors and `/api` requests captured. `scan` returns what a user
shouldn't see. `monkey` (lib/monkey.ts) runs seeded random use on any
session.

## Adding a probe

When a one-off check proves useful (it found something, or guards a rule
the owner cares about), add it to `scripts/audit/probe.ts` as a function
that adds issues to a `Report`, register it in `RUN`, add a line to the
table above, and run `npm run probe:selftest`. Probes print problems only;
measurements go in the JSON.
