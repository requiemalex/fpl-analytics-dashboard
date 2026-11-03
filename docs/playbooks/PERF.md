# Performance

A focused audit on speed: measure the same things the same way every run,
compare with the last run, and find measured waste. Report only (adding
tests and the measuring script is allowed). Read
`docs/audits/strategy/RULES.md` first. Being asked to run this prompt is
the owner asking you to run the app (the probes, the perf script, one
isolated desktop launch).

## You are the lead — target under 40 tool calls

### Step 1 — Baseline

Record commit and version. From `docs/audits/README.md` "Past runs", find
the last `-perf` run and read only its "Measurements" table (Grep for it).
`npm run check`.

### Step 2 — Measure (helpers, in parallel; 40 calls each)

**The perf script.** If `scripts/audit/perf.ts` doesn't exist, helper A
writes it on this first run (reusing `scripts/audit/lib/`, measuring the
built app on its own port in a fresh browser) and registers `"perf":
"tsx scripts/audit/perf.ts"` in `package.json`; later runs use it
unchanged so figures stay comparable (a change to what it measures is
noted in the report). It writes JSON to `audit-output/<stamp>/perf.json`
and prints one short table. Each timing is the median of 5.

| Helper | Measures |
|---|---|
| **A. In the browser** (`npm run perf`) | Per page at 1366 px: time to settled, `/api` requests, JS heap after load. Interactions: Data View switch and a sort on the biggest tables (Player Explorer, Team Explorer), opening a player profile, the whole-pool historic build (`requestHistoricData`), Team Building's Best Draft. Heap after visiting every page twice (leaks). |
| **B. Bundle and code** | `npm run build` chunk sizes (grep its output) and total; the largest dependencies in the client bundle; for the two slowest measurements from A, why (repeated calculation, re-renders, duplicate requests, oversized components), with the code location. Dead code. |
| **C. Desktop start** | One isolated launch (wrapper calling `app.setPath("appData", …)` before `require`-ing `electron/main.js`; `env -u ELECTRON_RUN_AS_NODE`; never the owner's `%APPDATA%` folder): time from launch to the first page, from the isolated `logs/scoutline.log` timestamps. Stop the app after. |

### Step 3 — Judge and write

A measurement more than 20% worse than the last run, or a page a user
waits over 2 s for, is a finding (severity by what a user notices). Every
O-finding says measured or theoretical and its expected gain. New run
folder `docs/audits/results/<YYYY-MM-DD>-perf/`; `1-audit.md` in the
Phase 1 output format with a **"Measurements"** table — each figure, this
run, last run, change — which the next run compares against. Add its row
to `docs/audits/README.md` "Past runs"; commit report, row and (first run)
the script: "Perf <date>: report". The owner fixes chosen O-findings with
`/audit 2` (naming them; Phase 2 does O only when asked).
