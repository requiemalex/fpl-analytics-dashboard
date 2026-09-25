# Player Explorer Audit — Second Remediation Pass — 2026-09-25

**Input:**
- `3-regression.md` in this folder (Phase 3 commit `d6143e0`): R1–R6, plus
  the concerns in its section 4, numbered R7–R12 here.
- The two open questions from `1-audit.md` (V1, V2).

**The owner asked for everything identified in all three stages to be
fixed and released, in the same session as Phase 3.** So no independent
Phase 3 has checked this pass, only the checks recorded below.

**Owner decisions used** (given at the start of this pass):
- **V1:** Historic Average games come from total minutes. Now **M7**.
- **V2:** Player Explorer keeps remembering nothing between visits;
  document it as intended.
- **R4:** a club link clears the search and other filters.

---

## 1. Summary for the owner

**Everything is fixed.** That's all six Phase 3 findings, the six smaller
issues Phase 3 raised as concerns, and V1 as you decided it. V2 is now
documented as intended.

The build is clean and all 371 tests pass. 25 of them are new. All but
one fail on the code before this pass; that one guards behaviour that was
already right. Each fix was also checked in the
running app against live data.

**What you'll notice:**
- **Resizing works at the desktop app's normal window size.** With Next 5
  Fixtures on at 1440 px:
  - dragging a column edge works again;
  - no column shrinks below 64 px;
  - the table scrolls sideways when the columns can't all fit, instead of
    squashing them.
  Widening one column narrows the others where there's room. Next 5
  Fixtures can't be dragged narrower than its five fixtures.
- **Historic Average per-game figures** (PPG, xG/Game, DC/Game, Def.
  Reward/Game, Goals and Assists per game) now divide the seasons' total by
  their total games. Players with light seasons move up, e.g. Reed PPG
  3.4 → 3.7 and DC/Game 6.25 → 8.33. Regular starters barely move (Haaland
  7.3 → 7.4). This shows everywhere those figures appear: Player Explorer,
  profile, Comparison, Dashboard and Team Building's Historic columns.
  Expected Points is unchanged, as its model is deliberately frozen.
- **A club's "players" link always shows the whole club.** It clears the
  search and other filters first, from the Team Profile as well as from
  Teams.
- **Hiding a column also stops the table sorting by it.** The default
  (Points) takes over.
- **When a filter leaves nobody, the columns stay on screen,** so you can
  change that filter from its own ▾. While historic data is still loading,
  the message says so.
- **Escape closes only the last thing you opened** (a profile over a
  filter, for example), not everything at once.
- **Smaller things:**
  - a Dashboard view saved before v1.35.0 now follows your "no hidden
    floor" rule;
  - searching a name pasted with a curly apostrophe (O’Riley) works;
  - Team Building's picker sizes its columns correctly after you hide some
    and resize the window.

---

## 2. Findings and evidence

App checks: dev server, live 2026/27 API (GW5 finished), fresh headless
Chromium context, at 1600 px and at the desktop default 1440 × 900.
"Before" values are from Phase 3.

| ID | Outcome | Root cause | Fix (files) | Tests | Evidence |
|---|---|---|---|---|---|
| R1 | Fixed | At `width: 100%`, a table whose set widths overflowed its box made the browser ignore them all | `styles/components.css`: `.resizable-columns` (`width: max-content; min-width: 100%`) on Player Explorer's and Team Building's resizable tables. `useColumnCustomization.ts`: a column's `minWidths` entry also floors dragging; new `onResizeEnd` callback. Both pages re-fit when a drag ends | 2 (`useColumnCustomization.test.ts`) | **1440 px + Next 5 Fixtures:** before, Price drag 70 → 70 and PPG/xG/xA/xGI at 58–60 px; now Price 70 → 130, Points 64 → 124, xG 64 → 144, no column under 64, fixtures 5/5, table scrolls sideways (97 px). **1600 px:** two drags (Own% → 168, xG → 126) and the table still fits exactly. Dragging Next 5 Fixtures narrower: stays 190 px, 5/5 (was 70 px, 2/5). Team Building: xGI 76 → 137 px, kept (138) at 1400 px, no overflow |
| R2 | Fixed | The floor was decided by a tile's id, and pre-v1.35.0 views hold Default-id copies | `Dashboard.tsx`: floor only when the Players Default view is selected. New `isDefaultViewSelected` in `useSavedDashboardViews.ts`, shared with the Default-view lock. Removed `isPackagedDefaultTile`/`isPackagedDefaultGraph` | 1 replaced (section 3) | Seeded user view, two identical PPG tiles, one with id `default-points`: before Osula 8.4 vs Reed 15.0; now both Reed 15.0, Onyeka 12.0, Chiesa 9.3. Default view tiles unchanged |
| R3 | Fixed | Phase 2 (L8) removed the loading message as unreachable, but a number filter makes it reachable | `PlayerExplorer.tsx`: empty message shows "Building the historic dataset…" while a historic view is loading (restored text) | 1 | Current Season Mins ≥ 300, switch to Last Season mid-build: "Building the historic dataset… This runs once per session…" (was "No players match your filters … not an API error"). After the build: 336/667 |
| R4 | Fixed, per owner's decision | The later-arrival path added the Team filter on top of existing ones | `PlayerExplorer.tsx`: a valid `?team=` arriving while open clears the search and all column filters first | 1 | Goals ≥ 3 (108/667) → Team Profile link to MCI → 33/667, all MCI, Goals ▾ inactive (was 11/667) |
| R5 | Fixed | Doc wording | `dictionary.ts` (PPG: 0.0 only once the season has started; pre-season "—"; Historic Average formula). User Guide: the fixtures sentence is now true (drag floor), plus the new behaviours. README table-layout paragraph rewritten | — | Read against the app checks above |
| R6 | Fixed | Missing tests | Tests for `?team=` arriving while open (R4), the profile's Escape, a Default-id tile in a user view (R2), and the loading empty state (R3) | 5 | See section 5 |
| R7 | Fixed | Hiding a column cleared its filter (M3) but kept its sort | `useSortSpec.ts`: `sortWithoutHiddenColumn` (falls back to the page default). Used by Player Explorer and Team Building | 4 unit + 1 page | Sort by xG, hide xG → Points ↓ shown, Points order (was xG order, no arrow) |
| R8 | Fixed | Only a straight ' split words | `playerSearch.ts`: ’ ‘ ʼ are separators too | 1 | "O’Riley" → 1/667 O'Riley (was 0) |
| R9 | Fixed | Team Building's once-registered resize listener used the first render's column counts | `TeamBuilder.tsx`: `pickerFitRef` always holds the current fit, used by the resize listener and drag end | — (layout) | Hide 4 Historic columns, then 1600 → 1400 px: remaining columns 88 px each, table exactly fills its 1,088 px box |
| R10 | Fixed | Each layer listened for Escape itself, so one press closed all of them | New `state/useEscapeLayer.ts` (a stack; Escape closes the newest). Used by the column filter, Columns picker, player profile and Dashboard dialogs | 3 unit + 1 page + 1 profile | Filter open under a profile: one Escape closes the profile only, and the filter stays (was both closed) |
| R11 | Fixed | Price and percent cells used `toFixed`; filters used `toLocaleString` | `format.ts`: one `fixedDecimals` for `fmtNumber`, `fmtPrice`, `fmtPercent` and `roundAsDisplayed` | 2 (`format.test.ts`) | `fmtPercent(1.005, 2)` "1.01%" (was "1.00%"). No live value changes: Own% and Price arrive with 1 decimal |
| R12 | Fixed | The whole table was swapped for the empty message, taking every ▾ with it | `PlayerExplorer.tsx`: the table always renders; the message sits in the body | 1 | Points ≥ 100000: 13 column ▾s present (was 0); clearing via Points ▾ restores 667 |
| M7 (was V1) | Fixed, per owner's decision | Games were `ceil(average season minutes ÷ 90)`, which adds up to a game per season for light seasons | `calculations.ts`: `estimatedGamesPerSeason`, `perEstimatedGame`, `pointsPerEstimatedGame`. `careerMetrics.ts`: totals-based rates, `avgEstimatedGamesPerSeason`. New `estimatedGames` on the player (`types/normalized.ts`), set per mode in `resolvePlayerStats.ts` and by `normalizePlayers.ts`. `defensiveReward.ts` and `playerMetrics.ts` divide by it | 6 | Reed, Historic Average: PPG 3.7 (was 3.4), DC/Game 8.33 (was 6.25), matching Phase 1's hand calculation (179 ÷ 49; 25 ÷ 3). Haaland 7.4 (was 7.3; 909 ÷ 123) |
| V2 | Documented as intended | — | README ("Player Explorer keeps no saved data") and User Guide ("starts fresh each visit") | — | — |

**Every earlier fix was rechecked in the app after these changes:** H1,
M2 (81-cell sweep plus 21 Team Building checks), M3, M4, M5 (8 px hit
test), M6, L1–L9, and the Phase 3 failure/refresh checks. All unchanged,
with no page errors.

---

## 3. Judgement calls

- **R1 — scroll rather than squeeze.** When the columns genuinely can't
  fit, the table now scrolls sideways with every width honoured, as Phase 3
  suggested. At 1440 px the default columns plus Next 5 Fixtures need
  about 1,263 px against 1,166 available, so that view scrolls by about
  97 px. Without Next 5 Fixtures, 1440 px still fits exactly.
- **R1 — you can't narrow Next 5 Fixtures below 190 px.** Its minimum now
  applies to dragging as well as auto-fit, which makes the User Guide's
  "always room for all five fixtures" true. Every other column's drag
  floor is unchanged (64 px).
- **R2 — a test replaced, and an option renamed.**
  - The Phase 2 test "only the packaged Default ids count as packaged
    defaults" tested `isPackagedDefaultTile`/`isPackagedDefaultGraph`.
    R2 showed that id-based rule was wrong, and both functions are gone.
    The test is replaced by one for the new rule (`isDefaultViewSelected`),
    including the pre-v1.35.0 case.
  - `playersForDashboardItem`'s option `isPackagedDefault` is renamed
    `defaultViewShown` in its four existing tests. Their assertions are
    unchanged.
- **M7 — Expected Points left on the old basis.** Its historic rate is
  documented as deliberately frozen while that model is revisited
  (`<expected_points_frozen>`, `expectedPoints.ts`). Changing it wasn't
  part of your V1 decision.
- **M7 — no saved data affected.** `estimatedGames` is worked out from
  live data and never stored, so no `STORAGE_VERSION` bump. Dashboard
  tiles on Historic Average per-game stats will show the new figures.
- **R7 — the fallback when nothing's left.** If the hidden column was the
  only sort, the page's default takes over (Points ↓ on Player Explorer,
  Exp. Pts on Team Building). If you hide that default column too, the
  table is left unsorted rather than sorted by a hidden column.
- **R4 — only a valid club id clears anything.** An unknown `?team=` is
  still just dropped.
- **Process.** Normally an independent Phase 3 checks a remediation pass
  before release. You asked for this pass and the release together, so
  I'd suggest a later Phase 3 on this pass, when convenient.

---

## 4. Left open

Nothing from this run.

One thing seen, not a finding: Team Building's own Next 5 Fixtures column
has no 190 px minimum, so it still shows only some fixtures at default
widths. It was outside this audit's scope and has been like this since
before the audit.

---

## 5. Final build and test results

| Check | Result |
|---|---|
| `npm run build` | Clean (exit 0; Vite's usual large-chunk warning only) |
| `npm test` | 371/371 passed: server 45, client 326 (was 301; 25 new) |
| New tests on the pre-change code | 20 of the 25 new tests fail on their own assertions or on a missing new function. The 5 in the two new files (`useEscapeLayer.test.tsx`, `PlayerDetailOverlay.test.tsx`) can't load because the hook doesn't exist there. The other new test, "missing values are still a dash", guards behaviour that was already right and passes on both. The only other failure there is the renamed-option test (section 3). Everything else passes |

The dev server was stopped. Playwright and the pre-change copy ran from a
scratch folder outside the repo.
