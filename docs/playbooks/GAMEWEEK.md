# Gameweek check

After a gameweek finishes: did the automatic jobs bring it in, and does the
app show it right? Report only; never fix while checking (adding tests is
allowed). Read `docs/audits/strategy/RULES.md` first.

Being asked to run this prompt is the owner asking you to run the app (via
the probes or a one-off script per `TOOLKIT.md`) and to call the live FPL
API through the app's proxy. Argument: a gameweek number; default the
latest with `finished: true` in `bootstrap-static` `events`. If that
gameweek isn't `data_checked` yet, FPL may still change its bonus and
points: say so and stop.

## You are the lead — target under 40 tool calls

### Step 1 — Baseline (≈4 calls)

- `git pull --rebase` (the jobs commit their data to master); record
  `git rev-parse --short HEAD` and `git describe --tags --abbrev=0`.
- Start `npm run probe -- pages --quick` in the background; run
  `npm run check` meanwhile.

### Step 2 — Missions (helpers, in parallel)

Each brief: the gameweek and season, the mission below, the CLAUDE.md
rules it touches (quoted), the folder `audit-output/gameweek-<N>/` for its
findings file, and "follow `docs/audits/strategy/RULES.md`; stop at 40
tool calls".

| Mission | Goal |
|---|---|
| **A. Jobs and data** | For `club-history-archive.yml`, `understat-sync.yml` and `fpl-availability.yml`: last runs (`gh run list --workflow <file> --limit 5`), each within its window in README "Automatic jobs and alerts"; open alert issues (`gh issue list --state open`). Did the data land: `data/club-history/<season>/` holds every finished fixture of GW N (count against `/api/fixtures` for that event); `data/understat/` covers its matches (Understat a day or two behind is normal, not a fault, while the sync isn't alerting); `data/fpl-availability/<season>/` has the file for GW N's deadline and the next one. Say whether anything missing affects what the app shows. |
| **B. Figures** | Pick 4 cases from GW N: its top scorer, a player with a red card or own goal, a cameo off the bench, a club that kept a clean sheet (plus a double or blank gameweek club if there is one). Read their figures in the app as text (Current Season, Match Log, Gameweek Log where shown) and recompute them from the raw API (`/api/element-summary/{id}`, `/api/fixtures`) through the proxy, showing the working. Where an Understat column shows, check only that it's Understat's own figure: the two sources may differ (CLAUDE.md "Data"). Check the Current Season fixed floor is now 25% of the finished gameweeks × 90, never under 90 (`metrics/fixedMinutesFloor.ts`), in the profile and Starter views, with the stopwatch amber only while something shown is under it. |
| **C. Gameweek-moving features** | What changes as a gameweek finishes: Team Building's GW+1 is the next unplayed gameweek, FPL Official and Exp. Pts refer to it, and availability news shows; a squad's gameweek points (Gameweek Log, Summary) are coloured against that gameweek's managers (FPL's average and highest for the event); the gameweek's deadline record. Seed a saved squad (`openSession(..., { storage })`, shape from README "Saved data") rather than using anyone's real team, unless the owner gave a team ID in the request. |

### Step 3 — Verify and write

Re-run the cheapest piece of any High or Critical finding yourself. A job
that has stopped or failed: say what to tell Claude or what to run (often
`gh workflow run <file>`), and run it only if the owner asked for that in
the request.

- **All clean:** write `audit-output/gameweek-<N>/report.md` (not
  committed) and reply in plain English: what was checked, what matched,
  anything pending (e.g. Understat a day behind). Nothing is committed.
- **Findings:** write `docs/audits/results/<YYYY-MM-DD>-gameweek-<N>/1-audit.md`
  in the Phase 1 output format (sections that apply; plain-English summary
  first), add its row to `docs/audits/README.md` "Past runs", and commit
  the report, the row and any tests: "Gameweek <N> check: report". The
  owner fixes them with `/audit 2`.
