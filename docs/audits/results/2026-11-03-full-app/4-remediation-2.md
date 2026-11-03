# Audit 2026-11-03 — whole app — second remediation (Phase 3's R-items)

The owner asked on 2026-11-03 for every issue in `3-regression.md` to be
fixed, then released. R5, R6 and R8 were left for the owner there. Each
was fixed the way the report suggested, as the request was to fix all of
them.

| ID | Outcome | Change and evidence |
|---|---|---|
| R1 | Fixed | A hand-marked chip with no gameweek and no half is now kept at every store version, read as "half unknown", so the write-back at v6 on each live load no longer loses it. Phase 2's version plumbing for this was removed (`normalizeSavedSquad` takes no version). The phase 3 `it.fails` test is now a plain test, and it checks two live loads |
| R2 | Fixed | The Points History hover rule skips the picked season (`:not(.is-selected)`). New test in `selectedState.test.ts`: no hover background on a picked item's element outranks its picked rule (specificity, then order). It fails on the old CSS with exactly this rule |
| R3 | Fixed | Match Log Average DC `averageDp: 0`. Test: 29 DC over 3 matches shows "10". It fails on the old code ("9.67") |
| R4 | Fixed | Help "Build a comparison view": "On My View or a view you create, click a + card…". The Player Comparison steps name Starter as ready-made |
| R5 | Fixed | A stored selection whose view is gone falls back to Starter, then My View, on the Dashboard (`resolveSelectedViewIds`) and Player Comparison. Delete View keeps its own documented fallback. Three tests updated to the new rule; README updated |
| R6 | Fixed | Server `isValidTeamId` now rejects 0, as the client does. The client test now compares the two rules with nothing added, over 14 inputs. A gameweek must be 1–38 (`isValidGameweekId`). An ID is asked for and cached as its number (`canonicalId`: `007` = `7`). New `server/src/teamId.test.ts`; README updated |
| R7 | Fixed | The Match Log small-sample note and `qualifyingSeasons` call `isUnderMinimum`. Nothing on screen changes |
| R8 | Fixed | `fmtAverageMinutes`: "<1" for an average above 0 that rounds to 0, in Playing Time (text, hover, label) and the Match Log Average row's minutes. Test fails on the old code; README Playing Time updated |

Not changed: §4's items to verify (leaving the page mid-import, the stale
active-squad id, old pre-views tiles, the label's unused title,
`.column-filter-icon.active`, equal-looking DC/Game tints). They are
unproven or the owner's call, not defects.

## Final check

`npm run check`: build ok; server 166/166, client 1490/1490, electron 6/6.
