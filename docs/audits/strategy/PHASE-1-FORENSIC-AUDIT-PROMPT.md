# Phase 1 — Audit

Audit Scoutline (or the scope the owner names: a page or feature; default
the full app). Find and evidence problems; don't fix them (adding tests is
allowed). Read `RULES.md` in this folder first: it says how to work without
burning the owner's usage, and the severity scale.

The owner wants an audit that **uses the app hard and tests the code
under pressure**: break things, find where the same thing behaves
differently in different places, and find what could be faster or simpler.
Reading code is for explaining what the probes and helpers found, not the
main activity.

Being asked to run this prompt is the owner asking you to run the app (via
the probes, which use a fresh browser and the built app on its own port)
and to call the live FPL API through the app's proxy.

## You are the lead

You coordinate. You stay short: you run the machine checks, brief helpers,
verify what they bring back, and write the report. Target: **under 60 tool
calls of your own**.

### Step 1 — Baseline (≈5 calls)

- Read CLAUDE.md once. From `docs/audits/README.md` read only the "Past
  runs" table's last two rows; from the latest run, grep its report for
  what was left open (`open`, `not fixed`, `left`, `V\d`), don't read it
  whole.
- Record `git rev-parse --short HEAD`, `git describe --tags --abbrev=0`.
- Start `npm run probe` **in the background** (≈10 min).
- Run `npm run check` and `npm run probe:selftest -- --no-build` meanwhile
  (selftest after the probe's build finishes, or `--no-build` on a fresh
  `npm run build`).

### Step 2 — Machine findings

When the probe finishes, every line it printed is a candidate. For each,
reproduce it (rerun with the same `--seed`/`--pages`, or a small script in
`audit-output/tmp/`) before it becomes a finding. A probe that reports
nothing is evidence too: say which pages, modes and stores were covered,
and which on-demand routes it didn't reach.

### Step 3 — Missions (helpers)

Brief one helper per mission (subagents, in parallel where independent),
picking the missions that touch the scope. Each brief contains: the scope,
the mission text below, the relevant CLAUDE.md rules quoted (not "read
CLAUDE.md"), the run folder for its findings file, and "follow
`docs/audits/strategy/RULES.md`; stop at 40 tool calls".

| Mission | Goal |
|---|---|
| **A. Pressure** | Push the flows the monkey can't reach blindly, with scripted Playwright (`TOOLKIT.md`, one-off script section): the maximum of everything (tiles, graphs, squad slots, comparison players, saved views), very long names, rapid Data View / filter / sort / toggle switching, typing key by key into every number input (min > max, negatives, decimals), destructive actions (confirm or undo?), undo/Escape mid-flow, reload mid-flow, a gameweek in progress vs finished vs pre-season (mock `bootstrap-static` via `page.route` with edited `events`). Report crashes, wrong states, lost data. |
| **B. Consistency** | The same thing must behave the same everywhere (CLAUDE.md "Same thing, same way"). Pick 3 players (a regular, a cameo, a 0-minute player) and 2 clubs; read their price, points, minutes, goals, xG, xGC, DC, rank and colour on every page in scope, as text, in the same Data View — they must agree. Then check each owner rule across every section: minimum minutes + stopwatch, comparative colouring, whole numbers, whole words, selected state, the FPL/Understat toggle, null shown as "—". Grep for one concept implemented more than once (a formula, a picker, a rounding). |
| **C. Numbers** | For every leaderboard, ranking and chart in scope, in each Data View: are the top and bottom plausible to an FPL player? Recompute at least three figures (one extreme, one per-game rate, one Historic Average) by hand from the raw API through the proxy, showing the working. Check formulas against `metrics/dictionary.ts` and README "Metric methodology" (grep the section). Team Building: audit Exp. Pts inputs and weights for double counting, scaling and undocumented constants. |
| **D. Saved data & upgrades** | The `storage` probe covers damaged data. This mission covers real old data: build each store's older shapes from `git log -p` of its file, seed them (`openSession(..., { storage })`), and check nothing is lost or changes meaning; each `migrate()` step runs only for the versions it was written for; saved views embedding tiles/graphs migrate consistently; an item pointing at a removed player/metric degrades and can be deleted. |
| **E. Optimisation** | Use the `pages` probe's timings and request counts, `npm run build`'s bundle sizes (grep its output) and a performance trace of the slowest page (`page.evaluate` timing around a Data View switch / sort on the biggest table). Find measured waste: repeated calculation, re-renders, oversized components, duplicate or unneeded requests, dead code. Every O-finding says measured or theoretical, and the expected gain. |
| **F. Docs vs app** | Each claim in Help (`client/src/help/*.tsx`) and the README sections for the scope: does the control exist and behave as described, is the stated limit the real limit? List untrue or missing docs. |

Helpers report back only a 5-line summary and their file path. Read the
files, not the helpers' working.

### Step 4 — Verify and write

Every helper finding needs its own evidence before it goes in the report;
re-run the cheapest piece of it yourself (a probe, a script, a grep) when
it is High or Critical, or when the evidence looks thin. Then write the
report once.

## Output

New run folder `docs/audits/results/<YYYY-MM-DD>-<scope>/` (never reuse an
earlier one). `1-audit.md`:

1. **Plain-English summary for the owner** (not a developer): what was
   tested and how hard, counts per severity, the few that matter most and
   why, what held up under pressure.
2. Baseline: commit, version, `npm run check` result, probe run (seed,
   duration, coverage).
3. Index of findings by severity: ID and one line each.
4. Findings in detail, each: ID; severity; confidence; where (file:line or
   page + control); what it does now vs should; why it matters to a user;
   exact repro with actual vs expected values.
5. V items, separate.
6. Recommended fix order (correctness, user impact, size, regression risk).
7. Tests added (what failure each guards; `it.fails`/`it.skip` with the
   finding ID for a defect that exists now).
8. Final `npm run check`.
9. Cost: the number of helper missions run and anything skipped to stay in
   budget.

Add the run's row to `docs/audits/README.md` "Past runs". Commit the
report, the row and any added tests, no production code, on its own:
"Audit <date> <scope>: phase 1 report". No release.
