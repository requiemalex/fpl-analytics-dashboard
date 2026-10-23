# In-App Audit and Remediation — 2026-10-23

**Scope:** the whole app, used the way a person uses it: every page, dialog
and control driven in a real browser (Playwright, throwaway scripts outside
the repo, a fresh browser profile each time), plus the desktop app itself
(Electron, launched with an isolated data folder after the first launch;
see "Process note" below).
**Baseline:** `3416140` (v1.101.0). Build passed; 136 server, 835 client and
4 desktop tests passed.
**Owner's instructions:** "commit to a really deep in app testing … try and
break it, look for inconsistencies", then, once the first findings were in,
"fix the issues you have found and then we can continue", then "keep
auditing". So audit and fixes ran in one session, as in the 2026-09-24
Dashboard run, not the standard three phases.
**Live data during the run:** 2026/27, GW7 finished, GW8 `is_next` with its
deadline at 18:30 the same day.

---

## 1. Summary for the owner

**One critical problem, found and fixed the same hour.** v1.101.0 opened to
a blank window for everyone (C1). It was released as a fix in v1.101.1
within about an hour of v1.101.0 going public. Your own installed copy was
still on 1.100.1 and never saw it.

**Two serious problems in Team Building, fixed:**
- an imported squad read as over budget (H1);
- Clear Draft wiped a squad with one click (H2).

**About forty smaller problems, almost all fixed.** They're about being
easy to use and consistent:
- the keyboard (player names couldn't be reached; search suggestions
  ignored the arrow keys);
- search finding the wrong player;
- table headers overlapping at laptop widths;
- confirmations missing before deleting things;
- small samples unmarked on graphs;
- error messages full of jargon;
- the same thing working differently on two pages.

**Checked and fine:** every figure recomputed by hand agreed with FPL's raw
data:
- this season's league table, to the clean sheet;
- Historic Average with a short season left out;
- player and club Match Logs, including past seasons;
- Model Predicted's breakdowns.

Also fine:
- saved views, squads and the notepad, including damaged saved data;
- deep links and the browser's Back button;
- the five-of-a-kind limits;
- the desktop app's own window controls;
- speed: 0.7 s to the first table, 1.3 s for a Dashboard at its 20-tile,
  10-graph limit.

**Left for you to decide** (section 4): the full-screen-only window, FPL
Official's GW+1 ignoring the opponent, the comparison colours, and two
earlier decisions of yours that a new user may trip over.

---

## 2. Findings and what happened

Severity as in the Phase 1 prompt. "Fixed" commits are on master.

| ID | Sev | Finding | Outcome |
|---|---|---|---|
| C1 | Critical | v1.101.0 opened to a blank window: the page's `crossorigin` script and stylesheet carried an `Origin` header that made Electron's `net.fetch` refuse the hop to the built-in server (`net::ERR_FAILED`). Reproduced from the tagged source with Electron 44.5.1, with and without Playwright | Fixed `1c1c6b9` (`electron/appAddress.js`, `<forwarded_headers>`); released as **v1.101.1**. Shown working in the real desktop window |
| H1 | High | Team Building judged an imported squad against a flat £100m at today's prices: FPL team 1 showed "£-2.1m left" in red with £0.1m really in the bank. The import read the bank and never used it | Fixed `857e16a`: an import's budget is its players at today's prices plus its bank (`<imported_budget>`, saved-squads store v2); "£2.1m over" wording |
| H2 | High | Clear Draft emptied a squad (saved as it changes) with no confirmation | Fixed `857e16a` |
| M1 | Medium | Captain/vice-captain badge hidden: clipped by the shirt shape and covered by the × button | Fixed `857e16a` |
| M2 | Medium | Add put every player on the bench; only drag-and-drop moved them up | Fixed `857e16a` (`<add_to_xi>`) |
| M3 | Medium | At 1366–1440px the ▾ filter arrow covered POINTS, GOALS, ASSISTS, PTS/£M; Add Players headers cut to "EXP. PTS (" | Fixed `18fc234` (`<header_floor>`, wrapping headers). Player Explorer now also fits 1366 without sideways scrolling; Add Players scrolls ~140px at 1440 instead of cutting labels |
| M4 | Medium | Dashboard graphs never marked small samples, though their Hide button said they were marked | Fixed `133f7c0` (`SmallSampleMark`, shared with Player Comparison's trends) |
| M5 | Medium | A saved graph missing its statistics crashed the Dashboard, and Reload couldn't help | Fixed `133f7c0` (normalizers skip unusable entries) |
| M6 | Medium | Removing a tile, graph or comparison card was instant, no undo | Fixed `133f7c0` |
| M7 | Medium | CSV exports had no byte-order mark: Excel on Windows showed "Â£15.7m", "Ã˜degaard" | Fixed `2819134` |
| M8 | Medium | Player search had no keyboard support, kept FPL's internal order ("João Pedro" listed Costinha first), and typo matching brought in the wrong player ("Wilson" → Nilson Angulo, above the real Wilsons) | Fixed `2819134` (`<exact_before_typos>`, `rankBySearch`, combobox keys) |
| M9 | Medium | The Statistic and Columns pickers listed ~90 items with no way to filter | Fixed `2819134`, `89a511c` (filter boxes, `<text_filter>`) |
| M10 | Medium | Fixtures failing with no saved copy was silent: Expected Points went blank and Minutes Reliability changed (Haaland 96% → 79%); also an unhandled promise rejection | Fixed `18bd1f6` (banner with Try again, `fixturesUnavailable`) |
| M11 | Medium | A column's first click always sorted highest first, so Goals Against, xGC, Price opened worst first, unlike the Dashboard's Order | Fixed `89a511c` (`<natural_first_click>`) |
| M12 | Medium | Player names couldn't be reached by keyboard anywhere (club badges could), so no profile could be opened without a mouse | Fixed `b9694b9` (`<keyboard_reachable>`); focus returns to the name on Escape |
| L1 | Low | Error messages showed internal addresses ("Request to /api/element-summary/411 failed (500)") | Fixed `18bd1f6` (`<plain_errors>`) |
| L2 | Low | The profile's Match Log had no Retry; Points History did | Fixed `18bd1f6` |
| L3 | Low | Team ID "1.5" passed the import's check | Fixed `18bd1f6` |
| L4 | Low | Add Tile/Graph needed a name though an auto title existed; the reason hid in a disabled button's hover text, unlike Create View's inline error | Fixed `133f7c0`; Player Comparison's card dialog matched in `89a511c` |
| L5 | Low | The exact-minutes box didn't look like a box | Fixed `133f7c0` |
| L6 | Low | Escape didn't close New Squad (every other dialog closes) | Fixed `857e16a` |
| L7 | Low | Captain/Vice-Captain/Clear Draft shown with no squad; "Remove every player from " with the name missing | Fixed `857e16a` |
| L8 | Low | An inline caption under Add Players, against the no-captions rule | Fixed `857e16a` (now hover text) |
| L9 | Low | Team Profile "Goals 67" beside Team Explorer "Goals For 71" with nothing to tell them apart | Fixed `aac7c0b` ("Goals (excl. OGs)", as Team Explorer's column) |
| L10 | Low | Team Match Log averages to two decimals (57.57 points) where the player's use one | Fixed `aac7c0b` |
| L11 | Low | Notepad's disabled New tab hover didn't say why | Fixed `aac7c0b` |
| L12 | Low | Club search didn't know full names ("Tottenham", "Manchester United", "Nottingham") | Fixed `89a511c` |
| L13 | Low | A squad renamed to blank left a blank dropdown entry and pitch title | Fixed `ca4260f` ("Untitled squad") |
| L14 | Low | Delete squad and delete notepad tab confirmed with "Yes"; elsewhere the verb | Fixed `ca4260f` |
| L15 | Low | The Team Profile showed a wall of "—" for a club with no matches in the view; the player profile suggests a view that has data | Fixed `ca4260f` |
| L16 | Low | A League Position tile was titled "· Lowest First" though it lists 1st first | Fixed `abd10d9` |
| L17 | Low | User Guide out of date: tile Data View "LS/HA/CS badge" (now an icon); "the rest of Team Building appears once a squad is loaded" | Fixed in the commits above |
| L18 | Low | The header ⇄ source toggle sits mid-header, so a click meant to sort can switch the source | Not changed: headers now wrap, which often puts it on its own line |
| L19 | Low | "Team Selection" icon in the team tile dialog looks like the Current Season icon | Not changed |
| L20 | Low | Clicking the captain's card silently removes the armband | Not changed |

Withdrawn during the run: a "2px dialog scrollbar" was the headless test
browser's overlay scrollbars, not the app's (10px in the app); minutes typed
past a season (99999) are allowed by design (`MinutesSlider` says so).

## 3. Process note

The first desktop launch used the owner's real saved-data folder (setting
`APPDATA` doesn't move Electron's `appData` on Windows). Nothing was
clicked, and the saved data file (`Local Storage/leveldb/000003.log`, last
written 10:39) was untouched; the launch added lines to `scoutline.log`
and Chromium's own housekeeping files. Every later launch used a wrapper
that sets `app.setPath("appData", …)` before loading `electron/main.js`.

One test file (`state/useSortSpec.test.ts`) was overwritten by mistake while
adding tests; it was restored from git before committing and the new tests
appended (`89a511c`).

## 4. For the owner to decide (not changed)

- **The window always opens full screen** (`fullscreen: true`, no frame),
  with only Minimize and Close, so the app can't sit beside a browser.
- **FPL Official's GW+1 ignores the opponent.** FPL's `ep_next` equals form ×
  chance of playing for all 668 players (629 identical, 39 scaled for
  availability), with no fixture term. GW+2 to GW+5 are scaled by FDR, so
  the same fixture reads differently as GW+1 than as GW+2.
- **Player Comparison's colours:** gold next to orange and white next to
  grey are hard to tell apart where lines cross.
- **Model Predicted's clean sheets** use FPL's whole-number overall strengths
  (2–5); FPL now sends 0 for the finer attack/defence ones. Many fixtures
  therefore get identical clean-sheet chances (Arsenal: Everton at home and
  Liverpool away both 1.3).
- **Earlier decisions a new user may trip over:** the Dashboard and Player
  Comparison open on a blank My View (Starter is in the dropdown); a blank
  "—" sorts first ascending in Player Explorer.

## 5. Not covered

- The 18:30 deadline changeover (GW+1 moving to GW9 mid-session).
- The installed NSIS package (running it would replace the owner's install);
  C1's fix was shown in the source desktop app, which uses the same files.

## 6. Tests and final results

Added: `electron/appAddress.test.js`; `metrics/squadRules.test.ts`;
`normalize/normalizeEntryImport.test.ts`; `state/useSavedSquads.test.ts`;
`state/dashboardItems.test.ts`; `components/PlayerSearch.test.tsx`;
`utils/csvExport.test.ts`; `api/errors.test.ts`; plus cases in
`utils/playerSearch.test.ts`, `components/GroupedPicker.test.tsx`,
`components/AppShell.stale.test.tsx`, `components/TopList.test.tsx`,
`components/profiles.audit.test.tsx`, `state/useSortSpec.test.ts`,
`pages/Dashboard.helpers.test.ts`. Three tests changed for intended new
behaviour (removing a card confirms; Player A→Z on first click; team
averages' decimals); none weakened.

Final: `npm run build` passes; 136 server, 870 client and 6 desktop tests
pass.
