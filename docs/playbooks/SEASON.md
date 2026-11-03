# Season change-over

FPL changes most at the season boundary, once a year, so these checks are
written down rather than remembered. Report only (adding tests is
allowed). Read `docs/audits/strategy/RULES.md` first. Being asked to run
this prompt is the owner asking you to run the app (probes and one-off
scripts per `TOOLKIT.md`) and to call the live FPL API through the app's
proxy.

Arguments:
- `end` — after the season's last fixture (late May), before FPL resets
  the API (usually mid-July).
- `start` — after FPL's reset for the new season, and again after GW1.
- `start preview` — any time: the `start` checks against a mocked new
  season (`page.route` on `bootstrap-static`: ids renumbered, one club
  swapped for a promoted one, every event unfinished), to find problems
  before the summer.

## You are the lead — target under 60 tool calls

### Step 1 — Baseline (≈5 calls)

Read CLAUDE.md once (lead only). Grep README for the sections the checks
touch, and read only those: "Club history" (its "End of season" and
"Data View mapping" points), "Minimum minutes", the reference season
(`The reference season rolls forward`), "Saved data" (the summer
renumbering, `rolloverSavedIds`). Record commit and version; `git pull
--rebase`; `npm run check`; start `npm run probe` in the background.

### Step 2 — Missions (helpers, in parallel)

Each brief: the part (`end`/`start`/`preview`), the mission, the CLAUDE.md
rules it touches (quoted), the run folder for its findings file, and
"follow `docs/audits/strategy/RULES.md`; stop at 40 tool calls".

**`end` missions**

| Mission | Goal |
|---|---|
| **E1. Archive and release** | The archive moved the season into `server/src/clubHistory/completedSeasons.generated.ts` (and players' rows into `completedPlayerMatches.generated.ts`) and tagged a patch release that published (`git tag`, `gh run list --workflow club-history-archive.yml` / `release.yml`). If not, why (a fixture unfinished? an FPL correction?) and the archive's `release_tag` input for a hand run. List what that release carried from master. |
| **E2. Final figures** | Every club's final record in the app (played, W/D/L, goals, points, position) against the raw API's fixtures, all 20 clubs, by script; three players' season totals and Match Log against `element-summary`. Understat has every match of the season. |
| **E3. What moves at season end** | Which Data Views now point at which season: Last Season, Current Season, the Historic Average window (last 4 completed seasons, 855+ minutes) and the reference season, against what README says. Profiles open on Last Season (owner-confirmed) — check it is now the right season. Completed-season floor is 855 everywhere. |

**`start` (and `preview`) missions**

| Mission | Goal |
|---|---|
| **S1. Jobs after the summer** | All scheduled workflows are switched on and have run since the reset (GitHub turns off a public repository's schedules after 60 days without activity; each re-enables itself, and the watchdog checks). The new season's folders start in `data/club-history/`, `data/understat/`, `data/fpl-availability/`; the Understat sync paired every fixture, promoted clubs' names included. |
| **S2. Renumbered ids** | Seed every store holding ids (tiles, graphs, saved views, squads, the id ledger) with last season's real ids, as an install left over the summer would have them, then load the new season: each id is translated through `code`; departed players and relegated clubs follow README's rules ("(players no longer in FPL)", never the whole league); squads drop the selling-price budget, transfers, window and spent chips. Nothing lost that should stay. |
| **S3. Promoted clubs and the empty season** | Promoted clubs appear on every page; their Historic Average covers only their Premier League seasons, never padded with zeros. Before GW1: every 0-minute figure is "—", the Current Season floor is never under 90, Team Building, Gameweek Log and every graph cope with no finished gameweek; no NaN, no blank page. After GW1: the first real gameweek shows right. |
| **S4. Hard-coded seasons** | Grep `client/src` and `server/src` (not tests, not `*.generated.ts`) for literal seasons (`20\d\d/\d\d`, `20\d\d-\d\d`, bare years in comparisons). Each must be derived from the data. Also README and Help examples that name a season and are now out of date (Low). |

### Step 3 — Verify and write

Re-run the cheapest piece of any High or Critical finding yourself. New
run folder `docs/audits/results/<YYYY-MM-DD>-season-<end|start|preview>/`;
`1-audit.md` in the Phase 1 output format, plain-English summary first,
saying which part ran and what couldn't be checked yet (e.g. `start`
before GW1). Add its row to `docs/audits/README.md` "Past runs"; commit the
report, the row and any tests: "Season <part> check: report". The owner
fixes findings with `/audit 2`. No release.
