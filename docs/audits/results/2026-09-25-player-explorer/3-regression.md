# Player Explorer Audit — Phase 3 (Adversarial Regression) — 2026-09-25

**Input:** `1-audit.md` (Phase 1 commit `e4c9923`) and `2-remediation.md`
(Phase 2 commit `f2d4b7c`) in this folder. This was the only run with both
reports and no `3-regression.md`. The tree was clean at the start and no
production code was changed.

**Method:**
- Read CLAUDE.md, the README and both reports, then read
  `git diff e4c9923..f2d4b7c` line by line (32 files).
- Re-ran `npm run build` and `npm test`.
- Ran the fixed app (`npm run dev`) against the live 2026/27 API (GW5
  finished, GW6 next, 667 players). Drove it with throwaway Playwright
  scripts in a fresh browser context, at 1600 px and at the desktop app's
  default window size, 1440 × 900 (`electron/main.js`).
- For side-by-side checks, ran the pre-fix client (`e4c9923`, exported to a
  scratch folder outside the repo) against the same server. The server
  didn't change in Phase 2. Every server started for this phase was stopped.

---

## 1. Summary for the owner

**The fixes hold.** All 16 confirmed Phase 1 findings were rechecked in the
running app, and each does what Phase 2 said on the paths it tested. The
build is clean, and 346/346 tests pass.

**One fix causes a new problem at the desktop app's normal window size
(R1, Medium).** Next 5 Fixtures now reserves 190 px so all five fixtures
show. At 1440 px wide (the size the desktop app opens at), that means the
default columns plus Next 5 Fixtures no longer fit:
- the table scrolls sideways by 56 px;
- dragging a column edge to resize it does nothing (Price stays at 70 px;
  before the fix the same drag took it from 72 to 97 px);
- five number columns shrink below the 64 px minimum.

It fits again from about 1,540 px wide, or with Next 5 Fixtures turned off.

**Smaller new findings:**
- **R2.** A Dashboard view saved before v1.35.0 (21 Sep) can still apply the
  per-game floor, which you decided should only apply to the Default view.
  This happens only on a tile that came from the old Default view and has
  since been edited to a per-game stat.
- **R3.** If a number filter is on while the historic data is still
  building, Player Explorer now says "No players match your filters … not
  an API error". Phase 2 removed the "Building the historic dataset…"
  message as unreachable, but this case reaches it.
- **R4.** Following a club's player link from its Team Profile, while
  Player Explorer is already open, keeps the filters you'd already set.
- **R5.** Three sentences in the docs are slightly untrue.
- **R6.** Gaps in test coverage.

**Worth knowing before you release** (these are your M1 and M4 decisions
working as designed, not defects):
- **Existing user-built tiles and graphs change what they show.** A
  Dashboard PPG tile saved before the fix showed Osula 8.4, Haaland 7.2 …
  and now shows Reed 15.0, Onyeka 12.0, Chiesa 9.3. Raising that tile's Min
  Minutes brings the old list back. Nothing stored changes.
- **Current Season PPG leaderboards are now led by short appearances.**
  Examples: Hinshelwood 16.0 from 63 minutes, Cho 9.0 from 72. FPL's own
  per-appearance figure used to hide this.

**Recommendation: fix R1 before releasing.** It's visible at the app's
default size, in a column the page offers. R2–R5 are small and can go in
the same pass.

---

## 2. Phase 2 findings, rechecked

"Fixed" = the pre-fix app shows the problem and the fixed app doesn't.
Values are from the running app unless marked as code.

| ID | Verdict | Evidence (fixed app unless stated) |
|---|---|---|
| H1 | **Confirmed fixed** | Teams → Arsenal "Player Rankings": address `/players`, 29/667, all ARS. Team ▾ has class `active` and `aria-label` "Filter active on this column — click to edit"; its dropdown reads ARS. Switch to CHE → 34/667, all CHE. Back → `/teams`. Forward → `/players` 667/667. A direct cold load of `/players?team=14` → 36/667, all LIV, address cleared. `?team=99`, `abc`, empty, `0` and `1.5` → 667/667. `?team=1&team=2` → ARS. With `bootstrap-static` failing (502) on `/players?team=1`, "Try again" → 29/667 ARS. The hand-off makes no extra API requests. See R4 for arriving while the page is already open |
| M1 | **Confirmed, per your decision**, with R2 | Settings saved by the pre-fix app, loaded into the fixed one. User-built "PPG, Last Season, Min Minutes 0": pre-fix Osula 8.4, Haaland 7.2, Awoniyi 7.2 → fixed Reed 15.0, Onyeka 12.0, Chiesa 9.3, Enes Ünal 9.0. Same tile with Min Minutes 450: unchanged (Osula 8.4 …). Current Season xGI/Game: pre-fix Haaland 0.99 top → fixed Hinshelwood 1.43, Cho 1.15. User PPG bar graph: pre-fix Osula first → fixed Reed first (axis 0–16). Storage is byte-for-byte unchanged after the fixed app loads it. The Default view has no per-game tile or graph |
| M2 | **Confirmed fixed** | Last Season, Pts/£m Equal to 15.3 → 4/667: Haaland, Kroupi.Jr, Reijnders, Tonali, all shown "15.3". 15.3 ≤ x ≤ 15.3 → the same 4. Price = 15.6 → Haaland. Historic Average Mins = 2752 (shown "2,752") → Haaland, Robinson. Sweep: Equal to each of 3 sample rows' shown values, for 9 columns × 3 Data Views (81 checks) — every row found itself. Team Building: 21 checks across Exp. Pts (both), Minutes Reliability, Points, PPG, Pts/£m and xGI, with no mismatch. Negative values work (Current Season Points ≤ −1 → Methalie, shown −1) |
| M3 | **Confirmed fixed** | Goals ≥ 10 → 21/667; untick Goals → 667/667; re-show → ▾ not active. Team Building: Points ≥ 100 → 125 rows, hide Points → 667. Minutes Reliability ≥ 90 → 7, hide → 667 |
| M4 | **Confirmed fixed** | Current Season: Cho PPG 9.0 (9 pts, 72 min; FPL 2.2), Haaland 7.8, Methalie −1.0. Recomputed from the live API: 163 of 421 players who have played differ from FPL's figure by ≥ 0.5, as reported. Cho agrees everywhere: Explorer 9.0, profile tile 9.0 (Current Season), Comparison 9.0 next to Haaland 7.8. Pre-season PPG is unchanged ("—", `resolvePlayerStats.ts:141`). Expected Points reads only Last Season and Historic PPG (`expectedPoints.ts:143-148`), so it's unaffected. Nothing reads PPG from the unresolved player list, now `null` (checked every `pointsPerGame` reader) |
| M5 | **Confirmed fixed** | Hit test across the right edge of Own%, Price, Position, xG and Mins: all 8 px return the handle (−8 … −1). Drag from the handle's middle: Own% → 167 px with sort unchanged; xG → 112 px with order unchanged. Resizing still fails whenever the table overflows (R1) |
| M6 | **Fixed at 1600 px; regression at 1440 px (R1)** | 1600 px: Next 5 Fixtures 190 px, 5/5 chips fully visible, table fits exactly (1290 = 1290). Chips are 5/5 at every width tested. But below about 1,540 px the 190 px minimum makes the table overflow, and resizing then stops working (R1) |
| L1 | **Confirmed fixed** | Enter key in a field applies (Points ≥ 200 → 4/667, popover closed). Enter on a focused Cancel cancels. Enter on the Team dropdown applies (LIV 36/667). Escape discards a typed value. Columns picker: closes on Escape, an outside click, and its own button. Profile: Escape removes `?player=`. Team Building: Escape closes its filter and leaves the squad page alone. Note: one Escape closes the filter popover and the profile together when both are open (section 4) |
| L2 | **Confirmed fixed** | ≤ 100 with ≥ 200: Enter disabled, hover text "“Greater than or equal to” is above “Less than or equal to”"; the Enter key does nothing (667/667, popover stays open). Equal to outside the range is also refused. Negative values are still accepted. That's right: points can be negative (Methalie −1). Same in Team Building |
| L3 | **Confirmed fixed** | A→Z order is identical to an accent- and case-insensitive collator across all 667 names: Ángel 35th, Ødegaard 476th, Ömür 481st, Šeško 562nd, van Ewijk 623rd. Same in Team Building (A.Becker, A.García, A.Murphy …). Phase 2's positions are one lower (Ødegaard 475th …) because the live list has changed since |
| L4 | **Confirmed fixed** | First click GKP > DEF > MID > FWD; second click FWD > MID > DEF > GKP. Shift-click Points ranks within position |
| L5 | **Confirmed fixed** | 1 result each for "B.Fernandes", "b fernandes", "fernandes b", "O.Dango", "o dango", "Bruno G.", "o'riley", "J.Timber", "Tóth.A", "a toth", "sesko", "odegaard", "kadioglu". Typed key by key, "B.Fernandes" → 1. "h" → 53, "ha" → 76, "haa" → 1. "." or blanks → all 667. A curly apostrophe ("O’Riley") finds nobody, as before the fix (section 4) |
| L6 | **Fixed when the table fits; not when it overflows (R1)** | No Next 5 Fixtures, 1440 px: Price dragged 76 → 121 px, still 127 px after resizing to 1400. With Next 5 Fixtures on, 1600 → 1500 px: Price 107 → 72 px (lost). Back at 1600 px: 111 px (restored). Toggling Bonus at 1600 keeps it. Team Building: xGI dragged 76 → 120, 125 after resizing to 1400 |
| L7 | **Confirmed fixed** | Empty state "Try clearing the search or a column filter. This is a filter result, not an API error." Clear filters hover text "Clear every filter — the search box and every column filter". The User Guide's "sesko" example finds Šeško |
| L8 | **Fixed, but one removal was reachable (R3)** | Removed code is gone and the build is clean. The "Building the historic dataset…" empty state wasn't unreachable (R3). The removed Historic Average `?? 0` fallbacks: every Historic Average cell still renders, with no "0" in place of "—" |
| L9 | **Confirmed fixed** | Every ▾ has an `aria-label` ("Filter this column" / "Filter active on this column — click to edit") |
| V1, V2 | Open | Still your decision; nothing changed |

---

## 3. New findings

| ID | Sev. | One line |
|---|---|---|
| R1 | Medium | At the desktop app's default 1440 px window, Next 5 Fixtures makes the table overflow; column resizing then does nothing and number columns drop below 64 px. The M6 fix caused this |
| R2 | Low | A Dashboard tile with a packaged Default id, in a view saved before v1.35.0 and later edited to a per-game stat, still gets the hidden floor |
| R3 | Low | A number filter active while historic data builds shows "No players match your filters … not an API error" instead of the loading message L8 removed |
| R4 | Low | Following a club link from the Team Profile while Player Explorer is open keeps the earlier column filters |
| R5 | Low | Three doc sentences don't match the app |
| R6 | Low | Test coverage gaps around the Phase 2 changes |

### R1 — At 1440 px, Next 5 Fixtures breaks resizing and the column minimum
- **Severity / confidence:** Medium / High (measured in the running app,
  compared with the pre-fix app).
- **Where:**
  - `pages/PlayerExplorer.tsx:64` (`EXPLORER_MIN_COLUMN_WIDTHS`, 190 px).
  - `state/useColumnCustomization.ts:112-138` (`fitToBox` gives minimums
    first).
  - `table.data-table { width: 100% }`, automatic table layout
    (`styles/components.css:161`).
- **What happens:** the fit gives Next 5 Fixtures 190 px and the other nine
  columns 64 px each. Together with Player/Own%/Price/Team/Position, that
  needs about 1,263 px. At 1440 px the table area is only 1,166 px. When the
  set widths can't fit, the browser ignores all of them and sizes every
  column to its content. So:
  - the table scrolls sideways;
  - PPG (60), xG, xA and xGI (58) fall below the 64 px minimum;
  - a drag is recorded but has no visible effect.
- **Reproduce** (1440 × 900, Last Completed Season, default columns):
  1. Columns → tick Next 5 Fixtures. Actual: table 1,222 px in a 1,166 px
     area (56 px sideways scroll); PPG 60, xG/xA/xGI 58 px. Chips 5/5.
  2. Drag Price's right edge 60 px right. Actual: Price stays 70 px (its
     stored width becomes 130 px). Expected: about 130 px.
  3. Drag xG's edge 80 px right. Actual: stays 58 px (stored 144 px).
- **Pre-fix app, same steps:**
  - Next 5 Fixtures was 66 px wide (2/5 chips), and the columns kept their
    set widths.
  - The 46 px of overflow came from the clipped chips spilling out.
  - Price dragged 72 → 97 px.
- **Where it holds:** the default columns plus Next 5 Fixtures fit from
  about 1,540 px wide (1600 px: fits exactly). Without Next 5 Fixtures,
  1440 px fits and resizing works.
- **Pre-existing part:** with every column turned on, the table always
  overflows, and dragging Price does nothing in either version (1440 px:
  70 → 70 px in both). The regression is that ordinary use now reaches this
  state: default columns plus Next 5 Fixtures, at the default window size.
- **Also affects:** the README's claim that "the browser shrinks every
  column to the window" (R5).
- **Should:** at the default window size, resizing works, the table fits
  (or scrolls with set widths honoured), and no column drops below 64 px.
  Two ways to get there:
  - only reserve 190 px when there's room;
  - make the table honour set widths when they don't fit, e.g. a fixed
    table layout, so it scrolls rather than squeezing.

### R2 — Hidden floor still applies to a packaged-id tile inside a user view
- **Severity / confidence:** Low / High (reproduced with seeded saved data;
  reach confirmed from git history).
- **Where:**
  - `useSummaryTiles.ts:120-122` (`isPackagedDefaultTile` checks the tile's
    id).
  - `Dashboard.tsx:72-85`, called at lines 575 and 618.
- **How a user view can hold a packaged id:**
  - Before v1.35.0, "Save View" stored the on-screen tiles as they were
    (`git show bd6d53d^:client/src/pages/Dashboard.tsx`, line 277), so
    Default tiles kept their ids (`default-points`, `default-xgi` …).
  - The saved-views migration only replaces views whose *view* id is a
    Default id (`useSavedDashboardViews.ts:102-117`), so those tiles
    survive.
  - Since v1.62.0 (`203351e`), Edit keeps a tile's id (`useSummaryTiles.ts:189-191`).
- **Reproduce:**
  1. Seed a user view, as the pre-fix app saves it, with two tiles that
     are identical except for their id. Both are PPG, Last Completed
     Season, Min Minutes 0. One is `tile-…`, the other `default-points`.
  2. Fixed app: the `tile-…` one shows Reed 15.0, Onyeka 12.0, Chiesa 9.3.
     The `default-points` one still shows Osula 8.4, Haaland 7.2, Awoniyi
     7.2 (floored).
- **Expected:** both the same (no floor), per your M1 decision.
- **Not affected:** graphs. Packaged graphs arrived (`156de89`) after Save
  View was replaced by Create View (`bd6d53d`, v1.35.0).
- **Should:** decide "packaged default" by the view it lives in (the
  Default view), not by the tile's id. Or give such tiles fresh ids in a
  migration.

### R3 — "No players match your filters" while the historic data is building
- **Severity / confidence:** Low / High (reproduced; pre-fix app compared).
- **Where:** `PlayerExplorer.tsx:446-451`. L8 removed the loading empty
  state because it was thought unreachable: every player is kept, so rows
  never reach 0. That's true only with no number filter. Any active number
  filter fails every "—" value, so rows can be 0 while the data builds.
- **Reproduce** (historic data held back to simulate the first-run build):
  1. Current Season, Mins ≥ 300 → 172/667.
  2. Switch to Last Completed Season while it builds.
- **Actual:** 0/667, "No players match your filters. Try clearing the
  search or a column filter. This is a filter result, not an API error."
  It appears directly under the "Building the historic dataset…" banner.
- **Pre-fix, same steps:** "Building the historic dataset… This runs once
  per session and can take up to a minute."
- **After the build finishes:** 336/667 in both.
- **Also (pre-existing):** while the table is empty, every column's ▾ is
  gone. "Clear every filter" is the only way out.
- **Should:** restore the loading message for this case, or say both
  things.

### R4 — A club link from the Team Profile keeps the filters already set
- **Severity / confidence:** Low / High (reproduced). Possibly intended,
  your call.
- **Where:** `PlayerExplorer.tsx:99-112`, the effect that handles `?team=`
  arriving while the page is open. It adds the Team filter to whatever is
  already set.
- **Reproduce:**
  1. Player Explorer, Goals ≥ 3 → 108/667.
  2. Click a player's team badge. The Team Profile opens.
  3. Click its link to that club's players.
- **Actual:** 11/667, only Man City players with 3+ goals. The Goals ▾ is
  still highlighted.
- **Arriving from the Teams page** remounts Player Explorer, so it always
  starts clean. The two routes into the same hand-off behave differently.
- **Before the fix,** this route did nothing at all: `?team=` was read only
  on mount.
- **Should:** decide whether this hand-off clears the other filters and the
  search. The User Guide only says it "sets the Team column's filter".

### R5 — Doc sentences that aren't quite true
- **Severity / confidence:** Low / High.
- **Metric reference, PPG** (`dictionary.ts:50`, shown in the User Guide):
  "A player with 0 minutes shows 0.0". True once the season has started,
  but pre-season Current Season PPG is "—" for everyone
  (`resolvePlayerStats.ts:141`).
- **User Guide, Player Explorer:** "Next 5 Fixtures is always given room
  for all five fixtures." Only until you resize it by hand. Dragged to
  70 px at 1600 px, it shows 2/5 chips, and they spill 42 px past the
  table.
- **README, table layout:** "If hand-set widths plus the 64px minimums
  can't fit, the browser shrinks every column to the window." Actually the
  table scrolls sideways, set widths are ignored, and columns go to their
  content width, some below 64 px (R1).

### R6 — Test coverage gaps
- **Severity / confidence:** Low / High.
- No test covers any of these paths Phase 2 added or relies on:
  - `?team=` arriving while the page is already open (the effect at
    `PlayerExplorer.tsx:99-112`; R4). The H1 tests cover mount only.
  - Escape closing the profile (`PlayerDetailOverlay.tsx:257-266`).
  - A packaged id inside a user view (R2). The helper test checks only the
    id set.
  - The empty state while historic data builds (R3).
- R1 can't be caught in jsdom (no layout). It needs a check at 1440 × 900
  in the running app, with Next 5 Fixtures on.

---

## 4. Theoretical concerns (not reproduced as defects)

- **One Escape closes every layer at once.** Seen with the filter popover
  open under a player profile: one press closed both. Harmless here. If a
  profile ever opens over a Dashboard dialog, which has its own Escape
  handler (`Dashboard.tsx:972`), one press would also discard the dialog.
  I found no way to get both open.
- **Two ways of rounding.** Filters round with `toLocaleString`
  (`roundAsDisplayed`). Own%, Price and Team Building's Minutes Reliability
  cells use `toFixed`. They can disagree for a number whose next digit is
  exactly 5 in decimal but slightly less in binary. Today's data can't hit
  this: Own% and Price arrive with one decimal, and Reliability is shown
  with none.
- **Team Building's resize handler is out of date.** Its window-resize
  handler (`TeamBuilder.tsx:495-500`, registered once) still computes each
  group's width budget from its first render's column counts. The L6
  engine change stops it sizing the wrong columns. After showing or hiding
  picker columns and then resizing the window, the budget may still be off
  (pre-existing; not reproduced).
- **Hidden sort column (Phase 2 noted it).** Confirmed: sort by xG, hide
  xG, and the table stays in xG order with no arrow anywhere.
- **Curly apostrophe.** Searching "O’Riley" (as pasted from a web page)
  finds nobody, as before the fix. Only the straight ' is treated as a
  separator.

---

## 5. Behaviour verified as correct

- Build clean; 346/346 tests. No page errors or console errors (other than
  React Router's future-flag warnings) in any scripted session.
- **Upgrade:** saved Dashboard data written by the pre-fix app loads in the
  fixed app with no loss, crash or rewrite. All four stores are unchanged
  after load. No store changed format in Phase 2 and no version was
  bumped. That's right, because nothing stored changed meaning (see M1).
  Player Explorer still keeps no saved data (V2).
- **Failures:**
  - `historic-bulk` 503 → Retry restores the figures (Haaland 239 pts,
    7.2 PPG, 2,953 min).
  - `bootstrap-static` 502 → "Couldn't load live FPL data" → Try again
    works, `?team=` included.
- **Refresh** sends `POST refresh/bootstrap-static` and
  `POST refresh/fixtures`, and keeps the page's filters (18/667 before and
  after).
- **Collateral pages:**
  - Team Building's Add Players table: M2, M3, L1, L2, L3, and resizing
    that survives a window resize (L6).
  - Player Comparison and the profile agree with Player Explorer on PPG
    (M4).
  - The Dashboard's tiles and graphs follow the new floor rule (M1).
  - The Teams table's text sort uses the same collator; nothing there
    changed except accent handling.
- **Live-data edge cases:**
  - a negative-points player (Methalie −1, PPG −1.0, filterable);
  - one-letter name words (O.Dango, Bruno G., Tóth.A, J.Timber);
  - accented and non-Latin names (Kadıoğlu, Ødegaard, Šeško) in both
    search and sort;
  - long names (Borges Rodrigues, Williams-Barnett);
  - no player has points with 0 minutes, so a 0-minute PPG is never a
    non-zero number.
- **Docs:** the README "Per game" section and the rewritten PPG Metric
  reference, HISTORY entries, Dashboard floor text and User Guide Player
  Explorer text all match the app, except the R5 sentences.

---

## 6. Build, tests and recommendation

| Check | Result |
|---|---|
| `npm run build` | Clean (exit 0; Vite's usual large-chunk warning only) |
| `npm test` | 346/346 passed: server 45 (5 files), client 301 (31 files) |

**Recommendation: fix R1 before releasing.** It affects the desktop app at
its default window size whenever Next 5 Fixtures is turned on: resizing
stops working and the table scrolls sideways. That makes the M5/M6/L6
improvements look broken in the most likely setup. R2–R5 are small and can
go in the same Phase 2 pass. R6's tests should come with those fixes.

The dev server and the pre-fix client started for this phase were stopped.
Playwright ran from a scratch folder outside the repo, and nothing was
installed in or written to the repo apart from this report and the README
row.
