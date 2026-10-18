# Full App Audit — Phase 3 (Adversarial Regression) — 2026-10-18

**Input:** `1-audit.md` and `2-remediation.md` in this folder. Phase 2 changes
read line by line: `git diff cd191ab..db21d3c` (95 files). Tree clean at
`db21d3c` before this pass.
**Method:**
- Reran `npm run build` and `npm test`.
- Ran the app (`npm run dev`) against the live 2026/27 API: GW7 in
  progress, 9 of 10 matches played but not yet `finished`, Spurs v
  Coventry still to kick off (Monday), GW8 `is_next`.
- Drove it with throwaway Playwright scripts outside the repo, a fresh
  browser context each.
- Faked bad and stale API data at the browser's network layer.
- Seeded old-version and damaged saved data, and a simulated previous
  season for the id rollover.
- Both servers were stopped at the end.

**Owner's decision, given at the start of this session (H2's open
question):** where FPL and Understat disagree on a fact like this (who
scored a goal), **FPL is the source of truth**, because points are awarded
from FPL's data. The Madueke/Darlow entry in `accepted-differences.csv`
stays, and FPL's version of that goal is the one that counts. The decision
is now recorded in CLAUDE.md (Understat rule 2) and the README. R1 below is
where the app doesn't yet follow it.

---

## 1. Summary for the owner

**The fixes hold.** Every Phase 2 fix I could re-run did what the report
said, in the running app as well as the tests:
- **C1:** deleting a Dashboard view keeps My View, in both the Players and
  Teams views and after a reload.
- **H1:** Team Building's GW+1 is GW8 for everyone, including Spurs and
  Coventry, whose GW7 match hasn't been played yet. Its deadline has passed,
  so it can't be picked for.
- Saved data written by older versions, and damaged saved data, loads
  without loss or a blank page.
- Build passes; all 691 tests pass.

**Three new Medium findings, none urgent:**
1. **R1: two Understat columns still use Understat's goal count**, which goes
   against your decision. "Goals − xG" and "NP Goals" (Understat groups) give
   Madueke 2 goals in 2025/26; FPL gives him 3. Only that one player-season
   is affected today. The in-app guide also still says goals are "identical
   in both sources" (R4).
2. **R2: next summer's id renumbering can still swap a tile's contents.**
   Two cases:
   - A tile that tracked **only** players who have left FPL ends up with an
     empty list. It then shows the league's top 5 under its old name.
   - A team tile that tracked **only** relegated clubs shows all 20 clubs.

   Reproduced with a simulated previous season. This is the silent swap M6
   was meant to prevent, so fix it before July 2027.
3. **R3: one unreadable old season blanks every club's live figures.**
   It takes just one player's 2021/22 record failing the app's checks:
   - every club's Current Season FPL points, goals, xG, xA, xGC and DC
     become "—", across the Team Explorer, Dashboard team tiles and Team
     Profiles;
   - this happens even though the server's figures for those clubs were
     complete;
   - the note blames "a transient fetch issue".

   It needs FPL to send a malformed record, so it's rare.

**Recommendation:** release now. C1 (lost data) and H1 (wrong Team Building
figures every weekend) are worth shipping, and no R-item is worse than
Medium. Fix R1–R5 in a later pass, R2 before the 2027/28 reset.

---

## 2. Phase 2 findings re-checked

"App" = re-run in the running app this session. "Code" = traced in the diff.
"Tests" = covered by the passing suite.

| ID | Verdict | Evidence |
|---|---|---|
| C1 | Fixed | App, Players and Teams scopes: My View tile "MINE A", create "Foo", add "FOO B", delete Foo → My View shows MINE A only; after reload the store holds `["My View",["MINE A …"]]`. Also deleted My View itself: falls back to Starter, stays there after reload, no errors |
| H1 | Fixed | App, Team Building GW+1..5: Haaland AVL (A) (GW7 IPS, `started: true`, excluded); Van Hecke (TOT) CHE (A) = GW8, GW7 COV correctly skipped (deadline passed, not kicked off); Jay Dasilva (COV) FUL (H). Explorer Next 5: Van Hecke starts COV (H) (not kicked off, still upcoming); Josh Dasilva (BRE) starts HUL (A), GW7 LIV excluded |
| H2 | Fixed | Code + tests: every difference is an error unless listed. Stored 2025/26 data checked: Understat has Madueke 0 goals, Darlow 1 own goal in match 29015; FPL's ledger has Madueke 1 goal in that fixture. Both listed. See R1 for the app side |
| H3 | Fixed | Code: `buildAppSeason` counts only matches in `matchByFixture`, which pairs finished FPL fixtures only (`sync.ts:208`). Live ledger merges with the archive, fresh rows replacing archived ones, so FPL's later corrections flow in. Tests: 3 |
| M1 | Unchanged (owner) | — |
| M2 | Fixed | App: one fixture with `team_h: "not a number"` → app loads normally; User Guide data health: "1 fixture(s) and 0 club-season(s)". See R3 for a side effect on historic-bulk |
| M3 | Fixed (client checked live) | App: fixtures served with `source: "stale-cache"` → banner "Showing a cached copy of the fixtures…". Server side: code + tests; when the build is rejected, the last good build is still served via `getStale` |
| M4 | Fixed, over-broad (R3) | App: a skipped player → all clubs' player-summed Current Season figures "—", results kept, note shown |
| M5 | Not run | `node --check electron/main.js` passes; code read. Not run as a packaged app |
| M6 | Fixed with a gap (R2) | App with a simulated 2025/26 ledger: tracked id 9002 → 411 (Haaland); a squad's departed captain cleared; a club-filtered tile renamed "… (club no longer in FPL)". The empty-list cases are R2 |
| M7 | Fixed | App: saved views at version 3 with a `null` view and a `null` tile → both skipped, every other view and tile kept, store rewritten at version 6 |
| M8 | Fixed | App: squad `{id, name}` only, plus a `null` and an id-less entry → page draws; the first is repaired to an empty squad, the other two are dropped |
| M9 | Fixed | App: squad with id 9999 in squad and XI → banner "1 saved player is no longer in FPL's player list… (FPL id 9999)", XI counts 2 listed starters |
| M10 | Fixed | Code + test |
| M11 | Documented | README and User Guide checked |
| M12 | Fixed | Code: no ownership term left; no minutes data → null. Tests updated |
| M13 | Fixed | Code: total xGC ranks on xGC/Game in Explorer, Team Building, Comparison and profile. Understat has no player xGC alternate, so the toggle can't bring it back |
| M14 | Fixed | App: Pickford 2013/14–2021/22 Starts "—", xG/xA/xGI "—"; 2022/23 Starts 37, xA 0.35 |
| M15 | Fixed | Code: `roundAsDisplayed` and every cell share one rounding (`toLocaleString`), so .5 and 1.005-type values filter as shown. Tests |
| M16 | Fixed | Code + tests. Edge in §4 |
| M17 | Fixed | App: Explorer sorted by xGC (Dubravka first), Reset → Points ↓, Haaland first |
| M18 | Fixed | Code + tests |
| M19 | Fixed | Code + test |
| M20 | Fixed | Code: detector covers side-effect, spaced, template, `require`, CSS `@import`; scans `.js/.css` |
| L1 | Fixed | App: Starter titles "Goals vs xG (Goals − xG)" and "… · Lowest First" |
| L2, L3 | Fixed | Code + tests |
| L4 | Partly (as reported) | — |
| L5–L8, L11–L14, L18 | Fixed | Code / docs |
| L9 | Fixed | App: `?players=411,411` → one card; `411,,1.5,-3,abc,430,112,226,1,2,3` → Haaland, Mount, Van Hecke, Pickford, Raya (5, junk dropped) |
| L10 | Partly (as reported) | — |
| L15 | Fixed | Code: the hourly reload keeps running while disabled. Also checked that the reload never passes through "loading", so L16's reset can't fire on it |
| L16 | Fixed | Code + test |
| L17 | Fixed | Code (YAML read) |
| V1 | Intended (owner) | — |
| V2–V10 | Open | Not in scope |

No fix regressed. No console errors in any run (React Router's own
future-flag warnings only).

---

## 3. New findings

### R1 — Medium: Understat "Goals − xG" and "NP Goals" use Understat's goals, not FPL's

- **Where:** `client/src/understat/columns.ts:111` (`us.goalsMinusXG` uses
  `r.totals.goals`), `:112` (`us.npGoals` from Understat's shots). The
  per-season files carry Understat's own goals (`app/2025-26.json`).
- **Now:** for the one reviewed difference, the app shows Understat's version
  of the goal:
  - Madueke 2025/26: Understat's file has `goals: 2, npGoals: 2`. FPL's
    ledger has 3 goals (fixtures 234, 252, 373), one of them the Leeds goal
    Understat calls a Darlow own goal.
  - So Understat "Goals − xG" is 2 − 2.00 = 0.00, where FPL's goals would
    give +1.00.
- **Should:** the owner's decision: FPL is authoritative for goals. CLAUDE.md
  says goals "stay FPL only" and that Goals−xG "use the same source values
  everywhere".
- **Why it matters:** until now the two sources agreed on every goal (the
  sync enforced it), so it didn't matter which count these columns used.
  Accepting a difference breaks that, so they can now contradict FPL. Small
  today (one player-season), but every future accepted difference adds one.
- **Reproduce:** Player Explorer, Last Completed Season, show Understat ·
  "Goals − xG" for Madueke; compare FPL Goals (3).
- **Fix direction (not done):** take goals from FPL (as the "Goals − xG"
  formula elsewhere does), or apply the listed differences when the sync
  builds `app/<season>.json`.

### R2 — Medium: after the id renumbering, a tile tracking only departed players or relegated clubs silently shows the whole league

- **Where:** `state/seasonIdRollover.ts` `remapList` returns `[]` when every id
  is dropped. `pages/Dashboard.tsx:103` treats `playerIds: []` as "no
  players picked", and `:607` treats `teamIds: []` as "all clubs".
- **Now** (app, simulated 2025/26 ledger):

  | Tile | Tracked before the rollover | Stored after | Shown after |
  |---|---|---|---|
  | "ONLY LEAVERS" | one player who has left FPL | `playerIds: []` | De Cuyper, Groß, Haaland, Vuskovic, João Pedro: the league's top 5 by points, under the same name |
  | "PROMOTED LAST YEAR" | one relegated club | `teamIds: []` | Brighton, Man City, Arsenal, Leeds, Everton: all clubs |

  The only change is a console message ("5 player and 6 club reference(s)…
  were removed"). The club-filter case gets the "(club no longer in FPL)"
  suffix; these two don't.
- **Should:** README / M6 design: "never silently substitute"; the change
  must be visible.
- **Why it matters:** this will happen at the 2027/28 reset to anyone with a
  tile for, say, this season's three promoted clubs, if all three go down.
  That is common: it happened in both 2023/24 and 2024/25.
- **Fix direction:** keep such a tile on an empty list that shows "no
  players/clubs left" with the suffix, or mark it as the club filter is.

### R3 — Medium: one unreadable past season for one player blanks all 20 clubs' Current Season figures

- **Where:** `validation/schema.ts` `historicBulkSchema` adds a player with any
  unreadable season to `skippedPlayerIds`. `livePlayerSumsPartial` is then
  set from `historicSkippedPlayerIds.length > 0` (Teams.tsx, Dashboard.tsx,
  TeamDetailOverlay.tsx).
- **Now** (app): `historic-bulk` served with one player's 2021/22
  `total_points` set to `"x"`, Team Explorer, Current Season, Arsenal:

  | | xG | xGC | xA | FPL Points |
  |---|---|---|---|---|
  | Control | 10.83 | 4.69 | 7.74 | 336 |
  | One bad 2021/22 record | — | — | — | — |

  Every club is blanked the same way. The note says the player "couldn't be
  loaded this session (a transient fetch issue)".
- **Should:** blank only when the server's live club sums really are partial:
  the server skipped the player (M4's case). A client-side validation drop
  of an old season doesn't touch them, because the server builds them from
  the live `history`. The note should give the right reason.
- **Why it matters:** correct figures hidden app-wide by one bad old record,
  with a misleading reason. Refresh doesn't clear it (same data). Rare: it
  needs FPL to send a malformed record.
- **Fix direction:** keep the server's `skippedPlayerIds` separate from
  players dropped by client validation, and base `livePlayerSumsPartial` on
  the server's list only.

### R4 — Low: Understat docs still say the sources agree on every goal

- `client/src/understat/guide.tsx:81` (in-app): "Goals, own goals, scores and
  results are identical in both sources".
- `understat/columns.ts` header comment: "0 differences in 23,837
  player-matches".
- `guide.tsx:15`: "Goals − xG: Goals minus Understat xG" doesn't say whose
  goals.
- No longer true since the reviewed difference. The guide should say FPL's
  goals are the ones that count where the two differ (and R1 should make the
  columns follow that).

### R5 — Low: the rollover tells the user nothing

`AppStateContext.tsx` logs the rollover only with `console.info`. A saved
squad can lose players and its captain, and tiles can lose tracked players,
with no message in the app. The README describes the dropping. A user sees
only a shorter squad or a cleared armband, with no explanation.

### R6 — Low (test coverage)

- No test for a tracked list emptied by the rollover (R2).
- No test that Understat goal-based columns agree with FPL for an accepted
  difference (R1).
- No test of a client-validation drop feeding `livePlayerSumsPartial` (R3).
- M5 (Electron), L15 and L17 have no automated test (code read / YAML parse
  only, as Phase 2 said).

---

## 4. Theoretical concerns (not proven defects)

1. **An accepted difference isn't tied to its values.** The key is season +
   Understat match + FPL player. If Understat later changes that same
   player-match again (say to 2 goals), it stays "reviewed" with no alert.
   Adding the expected FPL/Understat goal counts to the key would close this.
2. **New, unreviewed differences still stop the sync.** This is my reading of
   your decision: FPL's figure wins, but a new difference can also mean a
   wrong player link, which would corrupt that player's xG. So the sync still
   stops and alerts you, and you add the line to `accepted-differences.csv`.
   If you'd rather "scorer vs own goal" cases never stop the sync, that is a
   code change for a later pass.
3. **No ledger, new season:** an install whose first run of this version comes
   after the 2027 renumbering (a user who doesn't open the app until August
   2027) has no ledger. It records the new season "as is", so its saved ids
   stay untranslated, the M6 problem unchanged. Saved stores carry no season,
   so this can't be detected.
4. **Reset-day bootstrap:** the rollover runs once per season. If FPL's first
   new-season bootstrap lacked some players, or one failed validation that
   day, they'd be dropped from saved lists for good.
5. **Newer saved squads:** `normalizeSavedSquad` rebuilds each squad from the
   known fields. Data from a future version (a field added later) would lose
   that field if an older build opened it. The desktop app only moves
   forward, so this is mainly a dev concern.
6. **Lowest First bars with a 0 leader:** every other row draws at the 4%
   minimum, e.g. a Red Cards, Lowest First tile. That follows the formula
   (leader ÷ value), but it carries no information.
7. **Desktop start order:** the server now starts before update checks, so if
   port 4317 is permanently taken, no update can arrive to change that. Before
   this change, the app crashed in the same case.
8. **M4 blanks every club for any skipped player.** It could blank only the
   affected clubs, but a player's former clubs this season aren't known
   without his missing history, so blanking all is the safe choice.
9. **Daily FPL load:** the sync now fetches all ~668 element-summaries every
   day (was twice a week). It stays within FPL's normal use, and a failure
   falls back to the archive with a warning.

---

## 5. Verified correct

- Pairing uses finished FPL fixtures only. A provisional match waits, and a
  fresh FPL row replaces an archived one, so later corrections are used.
- After the GW7 deadline, a club's unplayed GW7 match is excluded from Team
  Building but kept in the Explorers' Next 5. That is the right split between
  "can still be picked" and "not yet played".
- Captain doubling with a repaired squad (Haaland 8.3 → 16.6 as captain).
- An Understat hourly reload never removes the source, so L16's reset only
  fires when Understat is really switched off.
- `fmtSigned` / `SignedNum`: "-0.00" can't appear; colour follows the shown
  figure.
- Saved views, selection and squads from older versions upgrade once:
  - version 3 views → 6, with Default renamed to Starter and both My Views
    added;
  - the selected-view store at version 1 moves a scope that was on the
    packaged view to My View, and keeps a user view;
  - a Current Season tile's unapplied Min Minutes (450) is cleared only for
    stores below version 4, as written.
- Player Comparison views hold no player ids, so the rollover's four stores
  are the complete set.

---

## 6. Build, tests and recommendation

| | |
|---|---|
| `npm run build` | Passed. Only Vite's existing chunk-size notice (`index-*.js` 739 kB) |
| `npm test` | Passed: server 15 files / 101 tests, client 64 files / 590 tests (691 total, as Phase 2 reported) |
| Real app | 11 scripted runs (C1 ×2 scopes, H1, upgrades/damaged data, stale fixtures, bad fixture, bad past season + control, rollover, M14, L1/M17/L9); servers stopped |

**Recommendation: release now.** No R-item is Critical or High; C1 and H1
are worth shipping. Fix in a later Phase 2 pass: R1 and R4 together (they
follow from your decision), R3, R5, R6, and **R2 before July 2027**.
