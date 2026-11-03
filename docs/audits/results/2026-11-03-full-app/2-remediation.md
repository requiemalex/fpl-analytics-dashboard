# Audit 2026-11-03 — whole app — Phase 2 (remediation)

Fixes for `1-audit.md`, with the owner's decisions in `owner-decisions.md`.
Six batches, each in a fresh helper and committed on its own, then checked
by the lead (full `npm run check`, and the finding's repro script or a
one-off browser check against the built app on :4199).

## 1. Summary for the owner

**Fixed: every confirmed Medium (M1–M8) and 15 of the Lows**, plus the two
"to verify" items you decided on and one that was proven along the way.

What you'll notice:

- **Team Building's import is safe to be impatient with.** Pressing Enter
  again while it loads does nothing. Cancel really cancels: the squad is
  never saved. A 20-digit team ID now gets "Enter a valid FPL team ID". The
  New Squad name stops at 60 characters, like every other name box.
- **Team Building remembers which squad you were on** after you change page
  or restart, as the Dashboard and Player Comparison remember their view.
- **The Dashboard and Player Comparison open on Starter** on a fresh
  install. My View is still in the list. An existing install that was
  sitting on a blank My View moves to Starter once. Anything with your
  tiles, cards or your own views on it stays as you left it.
- **A player who hasn't played shows "—"** in his profile's Match Log
  Totals and Average, and in "Average Minutes Per Match", never 0.
- **A player's DC/Game is a whole number** (Cook 14, not 14.30), like
  clubs'.
- **Everything picked now has the soft-green fill:**
  - the side menu's current page;
  - the open Notepad tab;
  - the picked Points History season.
- **A comparison link with unknown ids** no longer loses a real player to
  them.
- **Help is complete and correct:**
  - The table toolbar guide covers Hide, and says Clear filters turns Hide
    off.
  - "What the icons mean" has every icon, Notepad's Expand to full page
    included.

Behind the scenes:

- The percentile rank is one shared formula instead of five copies. A
  player alone in his pool now gets no rank everywhere; the radar used to
  show him full green.
- Every minutes-floor check uses the one shared test.
- Exp. Pts (FPL Official) has its dictionary formula.
- A dead, outdated Exp. Pts breakdown is gone.

**Not fixed, and why:**

- **Your call, so left open:** L7. Clamping loaded saved data to the
  limits would delete a user's extra squads or tiles. (L8 was decided after
  the report and is fixed.)
- **You ruled them not defects:** L15, V5, and the V8 colouring (its
  wording was fixed as L17).
- **Not asked for:** O1–O4.
- **Still unproven:** V1–V4, V6, V9, V11.

## 2. Every finding

| ID | Outcome | Evidence |
|---|---|---|
| M1 | Fixed (`8346546`) | `profileMatchLog.test.tsx` "M1 <no_minutes_no_figures>…" (phase 1's `it.fails`, now `it`) and the new Playing Time average test fail on the old code. Built app, Kusi-Asare (0 minutes): Totals/Average were `0 0 0 0 0 0.00 …` and "Average Minutes Per Match: 0"; now every cell and that line are "—" (`B-live.ts` rerun) |
| M2 | Fixed (`46aae1f`) | `TeamBuilder.newSquad.audit1103.test.tsx` "M2: Enter pressed again while an import loads imports once" fails on the old code. Built app, entry slowed: rapid Enter gave 4 identical squads before, 1 now (`A-tb.ts` rerun) |
| M3 | Fixed (`46aae1f`) | "M3: Cancel during an import drops its result; it's never saved" fails on the old code. Built app: Cancel at 300 ms gave a saved, active squad before; now 0 squads, none active (`A-last.ts`). The requests themselves aren't aborted (the fetch layer takes no AbortSignal); their result is dropped |
| M4 | Fixed (`46aae1f`) | "reopens on the squad last open…" and "a remembered squad no longer saved falls back to the first squad" fail on the old code. Built app: active Bravo stays Bravo after leaving the page and after a reload; before, the first squad (`A-routes.ts` part 3) |
| M5 | Fixed (`dfa9238`) | `selectedState.test.ts` (selector now in the main list) fails on the old CSS. Built app computed style: was rgb(28,38,32) + green left edge; now rgb(42,92,66) = `--accent-positive-dim`, edge transparent |
| M6 | Fixed (`dfa9238`) | As M5. Was no fill + green underline; now rgb(42,92,66), no line |
| M7 | Fixed (`3c48e43`) | One rule, `percentileFromCounts` (`<one_rank_rule>`, `metrics/percentiles.ts`); a pool under 2 has no rank. 11 tests fail on the old code (e.g. "totalPoints: expected 100 to be null"). The five copies agreed exactly for pools ≥ 2, so nothing changes on screen at real pool sizes |
| M8 (was V12) | Fixed (`de51c11`), owner's decision | Fresh install: both selected-view stores now hold the Starter (`default-view-player`/`-team`, `comparison-starter`), and the built app's Dashboard opens on Starter's tiles. Migration tests (3 cases per page) and fresh-install tests; 8 view-hook tests fail on the old code |
| L1 | Fixed (`3c48e43`) | Every hand-written floor check calls `isUnderMinimum`, including 3 the audit missed: `comparativeColour.ts`, `historicAnalysis.ts:106` and `careerTrends.ts:173`. Test "at a threshold of 0 keeps a player with no minutes data in the pool, as 0 minutes" fails on the old code |
| L2 | Fixed (`dfa9238`) | `selectedState.test.ts`, now in the main list; fails on the old CSS |
| L3 | Fixed (`dfa9238`) | Unused `.btn.active` removed (no component applies it). New test: no picked or switched-on rule in any stylesheet has a green border, outline or ring. It failed on the old CSS with 3 offenders |
| L4 | Fixed (`46aae1f`) | "L4: the squad name is capped at 60…" fails on the old code. Built app: 84 characters typed key by key gave a 60-character name |
| L5 | Fixed (`46aae1f`) | The server's ID rule is in `server/src/teamId.ts`; the client matches it, and a test compares the two over 13 inputs. Built app: `99999999999999999999` now says "Enter a valid FPL team ID…" |
| L6 | Fixed (`de51c11`) | `parseComparisonIds` drops unknown ids before taking 5. Test fails on the old code ("got 4"). Built app: `?players=999999,1,0,abc,2,1,3,4,5,6` shows 5 players (5/5) |
| L7 | Left open | See §4 |
| L8 | Fixed after the report, owner's choice ("Gameweek 9"; `owner-decisions.md`) | The last-completed label "GW 9 · final" now reads "Gameweek 9 finished", like the other finished state. `AppShell.stale.test.tsx` "the top bar's gameweek label has one style…" fails on the old code |
| L9 | Fixed (`de51c11`) | `migrate` now reads the stored version. A pre-v6 `{chip, event:null}` is kept, with no half guessed. 2 of 3 new tests fail on the old code |
| L10 | Fixed (`3c48e43`) | `fplOfficialPoints` in `metrics/dictionary.ts`, in README's wording. "every Predictive column's Exp. Pts / Exp. Mins has a metric definition" fails on the old code |
| L11 | Fixed (`3c48e43`) | `computeExpPointsBreakdown` deleted (nothing imported it). `MIN_QUALIFYING_SEASON_MINUTES`/`qualifyingSeasons` are kept: only the frozen backtest baseline uses them (`client/scripts/pointsModel/legacyModel.ts`). Their comments are corrected; nothing on screen changes |
| L12, L13 | Fixed (`0e84573`) | Guide lists the icons with no count that can drift; Hide is "Player Explorer only"; Clear filters "turns Hide off". Test compares the toolbar's icons with the guide's rows in order; it fails on the old guide (5 rows, 6 buttons) |
| L14 | Fixed (`0e84573`) | Rows added for Add, New Squad, Close, Players/Teams, ‹ ›, Expand to full page; the Notepad guide gains Expand. `HelpPanel.test.tsx` lists 28 icons the guide must cover; it fails on the old guide. 4 new search questions |
| L15 | Not a defect (owner) | Left as is |
| L16 (was V7) | Fixed (`8346546`), owner's decision | Player DC/Game column `num(0)`; Player Comparison's trend reads the column's decimals. Test fails on the old code. Built app: profiles show 9 and 5, the Starter tile "Cook 14" (was 14.30). README "Whole numbers" and CLAUDE.md updated |
| L17 (V8 wording) | Fixed (`0e84573`), owner's decision | "a club's played, draws and style stats are never coloured" in CLAUDE.md, README and Help's colours guide. Player Starts/Mins stay coloured |
| L18 (was V10) | Fixed (`0e84573`) | Proven from the code: `normalizeElementSummary.ts:72-79` keeps player starts from 2022/23 (`STARTS_AND_EXPECTED_TRACKING_START_YEAR = 2022`). README:582 corrected; Help was already right |
| O1–O4 | Not done | Optimisations, not asked for |
| V1–V4, V6, V9, V11 | Open | Unproven. V2 gained evidence, see §4 |
| V5, V8 | Not defects (owner) | — |

## 3. Judgement calls

- **M8 migration.** `dashboard:selected-view` moves from version 2 to 3,
  and `comparison:selected-view` from 1 to 2. Each step runs only for the
  versions it was written for. Both stores are written back on every load,
  so a stored "My View" can't show whether it was picked or just landed on.
  - **The rule:** a scope sitting on a still-blank My View (no tiles or
    graphs; on Comparison, no cards) moves to Starter once.
  - **Stays as it was:** a My View with anything on it, a Starter, or a
    user's own view.
  - **The one cost:** someone who deliberately chose an empty My View lands
    on Starter once.
- **M4** adds a new store, `fpl-dashboard:saved-squads:active:v1` (version
  1), following `comparison:selected-view`. No existing store changed. The
  storage probe found and damaged it with no issues.
- **L9** changes how old data is read, not the store's shape, so there's no
  version bump. A pre-v6 chip with no gameweek counts in neither half, since
  its half was never recorded.
- **M7 behaviour change:** a player or club alone in its pool now has no
  rank (no colour, no radar point) everywhere. Before, the radar, Player
  Comparison and team copies gave it 100.
- **L1 behaviour change:** at a floor of 0 (the live floor before any
  gameweek), a player with no minutes data is now in the pool as 0 minutes,
  as the rule says. Normal floors are unchanged.
- **Changed test expectations** (all because the intended behaviour
  changed):
  - **M8, opens on Starter:**
    - `useSavedDashboardViews.test.tsx`: fresh, malformed, unsalvageable,
      setSelected and v5→6 cases.
    - `useComparisonViews.test.tsx`: fresh install; the edit and reorder
      tests pick My View first, since Starter is read-only.
    - `PlayerComparison.test.tsx`: "opens on" and Outputs.
    - `Dashboard.storage.audit1018.test.tsx`: the v5 upgrade.
    - `understat/dashboardComparison.test.tsx`: seeds the selected view at
      the current version 3.
  - **M7, a lone player gets no rank:** three tests in `percentiles.test.ts`
    that expected 100.
- **Icons moved:** `PlayersViewIcon`, `TeamsViewIcon` and `ChevronsIcon`
  moved into `components/IconToolbar.tsx` (drawings unchanged), so Help can
  use the app's own icons.
- **First load:** the Dashboard now makes 4 API calls on first load (3
  before). The Starter tiles fetch up front the one call Player Explorer
  used to make on its first visit. Player Explorer now makes 0 calls; the
  total is the same.

## 4. Left open for the owner

- **L7:** limits aren't applied to loaded saved data. Clamping on load would
  delete a user's extra squads or tiles. A warning without deleting anything
  is possible, if you want one.
- **L8:** decided after the report ("Gameweek 9") and fixed. See the
  table above and `owner-decisions.md`.
- **V2, more likely now:** an install from before saved views existed
  (tiles store v≤2, no views key) would still not show its old custom tiles.
  It now opens on Starter instead of a blank My View. This is from code
  reading, not run. The fix would be to seed My View from the old tiles
  store when no views key exists. Whether such an install ever shipped
  decides whether it's worth doing.
- **New, found while fixing M5/M6 (not this run's findings, not fixed):**
  three "on" styles that aren't the soft-green fill:
  - `.source-toggle.on` (the FPL/Understat ⇄ toggle, violet tint);
  - `.duty-filter-cell.on` (grey fill, `border-color: currentColor`);
  - `.filter-toggle.on` (the Player header's ▾ toggles, grey fill, grey
    border).

  Decided after the report: the owner keeps all three as they are. They
  are now recorded as exceptions in README `<selected_state>` and
  CLAUDE.md.
- O1–O4, if you want a lighter start-up.

## 5. Final check

- `npm run check`: build ok (18 s); server 163/163, client 1483/1483,
  electron 6/6. Up from 163 + 1447 + 6 at phase 1.
- `npm run probe -- --quick --no-build`: 0 issues in 111 s.
  - **pages:** every page at 1366 and 1920 px.
  - **failures:** bootstrap-static and fixtures 500 / wrong shape; on-demand
    element-summary and historic-bulk.
  - **storage:** 14 stores damaged, the new active-squad store included.
  - **monkey:** 15 steps from each of 5 pages, seed 1.
  - Detail in `audit-output/2026-11-03-13-02/`.
