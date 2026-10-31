# Releases

Every release of Scoutline, newest first, with the changes it shipped:
each version's commits since the one before. Written from git by
`npm run release-notes` (`scripts/release/notes.ts`) as each release is
made, so don't edit it by hand: the next release rewrites it.

## v1.125.0 · 31 Oct 2026

- Player Explorer and Add Players: the Player header's filter now picks positions, clubs, availability and set-piece duties (several at once); the Team and Position columns are gone, as both show under each name
- Player Explorer and Add Players: filter by set-piece duty from a ▾ on the Player header (penalties, direct free kicks and corners; first, second or third choice), saved with saved views

## v1.124.0 · 31 Oct 2026

- Set-piece duties as gold, silver and bronze icons after a player's name (replacing the Pen Order, FK Order and Corner Order columns); new Understat figures: shots, goals and xG inside and outside the box, chances created and xA from corners and set pieces, headed xG from corners and from crosses; clearer names and hovers for the set-piece figures
- Help: 16 more guides — live gameweeks, pre-season, Dashboard limits and unavailable cards, saved views that load partly, Match Logs that don't add up, purchase prices, an import's budget, chips, Locked/Calibrating prices, how accurate predictions are, installing, updates, players leaving FPL, and Understat's club xG

## v1.123.1 · 30 Oct 2026

- Team Building: summary card's toggles, buttons and gameweek on one row

## v1.123.0 · 30 Oct 2026

- Team Building: redesigned squad header, squad picker under the heading, formation warning removed

## v1.122.2 · 30 Oct 2026

- Faster across the app with identical figures: Add Players opens without freezing, profiles open without recalculating the page beneath, Team Building's predictions and Player Explorer's column sizing do less work

## v1.122.1 · 30 Oct 2026

- Player Explorer and Add Players scroll, sort and switch Data View without lag: the table draws only the rows in view
- Add Players' Data View picker stays put at the left, under the toolbar, instead of sliding with the table

## v1.122.0 · 30 Oct 2026

- Help: guides narrow from the first letter typed, one Statistics guide lists every statistic, and 46 more guides (icons, top bar, finding players, fixtures, profiles, Team Building)

## v1.121.0 · 30 Oct 2026

- Help replaces the User Guide: a magnifying glass in the top bar searches 40 short visual guides and every statistic, matched to your own words
- User Guide: brought up to date — Team Building's Source toggle, Projected Points and Delete, Exp. Mins, Data View throughout, defensive contribution dates, sections in the menu's order

## v1.120.0 · 29 Oct 2026

- Explorers open with Understat's most useful columns after FPL's
- Dashboard: Starter views get a Bonus tile, 9 tiles for players and teams alike

## v1.119.0 · 29 Oct 2026

- Pickers: fewer, fuller headings — no heading over one or two statistics
- Dashboard: team Starter view now has as many tiles and graphs as the player one

## v1.118.0 · 28 Oct 2026

- Team Building: the squad's name is a section heading with an icon, and Projected Points uses the same tiles as Squad Value and Bank

## v1.117.0 · 26 Oct 2026

- Every figure's hover says what it measures and its percentile in position; Next 5 Fixtures joins the always-live columns and Add Players' Data View picker sits over the columns it changes

## v1.116.1 · 26 Oct 2026

- Team Building: Projected Points sits under the Captain to Best Draft buttons at their width, its parts in aligned rows, with a green heading and stripe

## v1.116.0 · 26 Oct 2026

- Team Building: Squad Value shows FPL's figure (players at today's prices); its hover gives what they'd sell for
- Team Building: Add Players opens as a dialog using Player Explorer's table and saved views, Exp. Pts adds up 1–5 gameweeks, and a Projected Points box

## v1.115.0 · 26 Oct 2026

- FPL Official expected points: mostly the season's points a match, not just recent form

## v1.114.0 · 26 Oct 2026

- Team Building: FPL's price Progress and Predicted Progress on the pitch, coloured purchase and selling prices, and an imported squad's budget at selling prices
- Team Building: gameweek arrows, Best Draft, a price toggle and expected minutes on the pitch

## v1.113.0 · 26 Oct 2026

- Show whole numbers wherever they still tell players apart

## v1.112.0 · 25 Oct 2026

- Team Building: Model Predicted allows for players back from an absence and managers selling them before the deadline
- Record FPL's injury and availability news before every deadline, for fitting Model Predicted
- Team Building: Model Predicted is now a fitted points model, tested on past seasons

## v1.111.1 · 25 Oct 2026

- Team Building: tiles renamed Squad Value, Bank and Projected Team Points; "FPL team ID" hover says where to find it

## v1.111.0 · 25 Oct 2026

- Team Building: figures by real gameweek (GW9, GW10…) that follow the season, and no formation or player counters

## v1.110.1 · 25 Oct 2026

- Team Building: drop the import badge and captain instructions, Points Prediction last and no longer spills out of its button

## v1.110.0 · 25 Oct 2026

- Team Building: Add Players gets its own GW+1 to GW+5 picker for the Exp. Pts columns
- Team Building: tidier squad header, Highlight with Points Prediction, per-gameweek Projected, greyed out until a squad is loaded

## v1.109.0 · 24 Oct 2026

- Team Building's Projected points total, with a menu to pick FPL or Model and 1-5 matches ahead; Formations pitch now matches Team Building's
- Team Building's pitch redesigned: club-colour kits, one figure at a time, + places to fill

## v1.108.3 · 24 Oct 2026

- Player Comparison trends: a season a player didn't play now carries the amber stopwatch, on his dotted line or along the bottom of the chart
- Player Comparison: cards you build now mark a player under the fixed floor with the amber stopwatch whatever their own Min Minutes, as Player Explorer and the Dashboard do, and their radars rank against players at or above the fixed floor

## v1.108.2 · 24 Oct 2026

- Player profile: a player with no figures in the chosen Data View now gets the amber stopwatch on the Data View toggle and on each card, as no minutes counts as 0 everywhere else; the "No data" message stays

## v1.108.1 · 24 Oct 2026

- Historic Average no longer puts a stopwatch on Player Explorer's or Team Building's Data View toggle, or on Dashboard tiles and Player Comparison cards with no minimum of their own; only the players under its 855-minute seasons are marked, as in the other Data Views

## v1.108.0 · 24 Oct 2026

- Minimum minutes: the fixed floor is now a quarter of the minutes available — 855 for a completed season (was 450), and in Current Season a quarter of the gameweeks finished so far, never under 90 (was always 90), so it rises as the season goes on

## v1.107.0 · 24 Oct 2026

- Team Profile: a Summary of tiles (attacking, defensive, balance, actual vs expected, FPL) replaces Season Totals, and a Fixture Forecast (each upcoming match's expected goals for and against, clean-sheet, scoring and result chances, from a model fitted to every match since 2016/17) replaces Upcoming Fixtures
- Understat figures are no longer labelled "(Understat)" on Dashboard tiles and graphs or Player Comparison trends and radars: their colour and icon say it (axis names in violet); only CSV export headers keep it

## v1.106.0 · 24 Oct 2026

- Player profile: one Summary card of tiles replaces Underlying Numbers, Actual vs Expected and Value; Understat's Views open with their own Summary, chosen by position
- Player and team profiles: Understat's colours load wherever a profile is opened, not only after a page that uses Understat
- Understat shot maps: the map no longer runs under its figures panel, and sits a fixed 64px from it

## v1.105.0 · 24 Oct 2026

- Player profile: a past season's Match Log says so when its matches don't add up to FPL's season total, giving both (Evan Ferguson's 2024/25 is missing a Brighton appearance in the archive)
- README and User Guide: a club's Historic Average is said to cover whichever of the last 4 completed seasons it was in the Premier League, as it does, not its last 4 Premier League seasons
- Player Comparison trends: the season axis names every season (short form, "24/25") instead of dropping whichever label crowded the latest one, and its end labels are no longer clipped
- Player profile's Points History and Player Comparison's trends: a season a player played no minutes in shows "—" (no bar, a gap in the line) instead of 0, and the change badge compares the last two seasons he played in
- Player profile: the Match Log no longer counts a match that hasn't kicked off in Matches, Average Minutes or the Average row, and its Average is coloured against clubs' matches played so far, provisional ones included
- Dashboard and Player Comparison: every card's first icon says where its figures come from (FPL's football, ⇄ for both, Understat's icon), then the stopwatch, then the Data View

## v1.104.0 · 24 Oct 2026

- Dashboard Starter: duplicates out, Understat's own tiles and graphs in; every tile, graph and comparison card's title coloured by where its figures come from (green FPL, violet Understat, rose both)

## v1.103.0 · 23 Oct 2026

- Player Comparison trends: a spell out of FPL between two of a player's seasons is a dotted line (hover says he wasn't in FPL), and every season takes its place on the axis

## v1.102.0 · 23 Oct 2026

- Audit 2026-10-23 in-app: report (audit and fixes in one session)
- Dashboard: a tile is titled with its order only when that's against the statistic's usual way (League Position no longer reads 'Lowest First')
- Keyboard: a player's name opens his profile with Tab and Enter, everywhere it can be clicked
- Team Profile suggests a Data View when the club has no matches in the chosen one; squads never show a blank name; delete confirmations say Delete
- Tables open a column on its best first; club search knows full names; Player Comparison cards: name optional, filterable statistics
- Team Profile: 'Goals (excl. OGs)' named as in Team Explorer; Match Log averages to one decimal for points and DC, as the player's
- Errors: a fixture list that won't load is flagged with Try again; plain-English error messages; Retry on the Match Log
- Search: exact names before typo matches, keyboard-friendly suggestions, filterable pickers; CSV opens correctly in Excel
- Dashboard: graphs mark small samples; removing a tile, graph or card asks first; names optional; damaged saved graphs can't stop the page
- Tables: column headers never run under the filter arrow at laptop widths
- Team Building: imported squads use their real budget; Clear Draft asks first; Add fills the pitch; captain badge visible

## v1.101.1 · 23 Oct 2026

- Desktop app: opens normally again instead of a blank window (v1.101.0)
- Release log: every release's changes kept in docs/RELEASES.md, and a "now released" message

## v1.101.0 · 23 Oct 2026

- Top bar: Refresh button removed — the app keeps its data current by itself
- Lean pass: retired Railway hosting files, unused server routes and dead code removed
- Session start: a message showing what's waiting to be committed and released
- Updates: installing on close leaves the app closed; never installs mid-shutdown
- Releases go public only once every file is uploaded; one release build at a time
- Launch without FPL or the internet: last good data kept on disk; Understat fetched side by side
- Desktop app: nothing listens on port 4317, so another program there can't stop it opening
- Opening and updating: a launch window, a visible installer, never stuck unseen
- Display errors: "Something went wrong" and Reload instead of a blank window
- App log: launches, update checks and every error saved to a file
- Change list: npm run unreleased shows what the next release would ship

## v1.100.1 · 21 Oct 2026

- Graph and figures: one layout at every screen size

## v1.100.0 · 21 Oct 2026

- Formations on Team Building's pitch; shot map figures drawn over the lines

## v1.99.0 · 21 Oct 2026

- Fonts: three typefaces, bundled locally, enforced by a test; smaller shot maps

## v1.98.0 · 21 Oct 2026

- Understat xGC for players: the ⇄ toggle on xGC everywhere, one rule

## v1.97.0 · 21 Oct 2026

- Shot maps by zone; shots faced for defenders and keepers; this season's formations with who starts where

## v1.96.0 · 20 Oct 2026

- Top bar: one switch for comparative colouring across the app

## v1.95.0 · 20 Oct 2026

- Explorers: saved views (save, load, save over, delete)

## v1.94.2 · 20 Oct 2026

- About & Legal: cards run full width, like every other page

## v1.94.1 · 20 Oct 2026

- Club history: completed seasons updated from the archive (automatic)

## v1.94.0 · 20 Oct 2026

- Stat pickers: the Explorers' coloured, iconed group headings everywhere

## v1.93.0 · 20 Oct 2026

- Understat on the Dashboard and in Player Comparison, the Explorers' way

## v1.92.0 · 20 Oct 2026

- Hover text: say what it is for this player, club or match

## v1.91.0 · 20 Oct 2026

- Stopwatch follows the data; Hide small samples; no personal name

## v1.90.0 · 20 Oct 2026

- Rename to Scoutline; dashes for no minutes; legal terms; hardening

## v1.89.0 · 19 Oct 2026

- Data View picker: one box everywhere, with the season it covers inside

## v1.88.0 · 19 Oct 2026

- Display rules: one minimum-minutes rule, one marker, one Totals rule

## v1.87.1 · 19 Oct 2026

- Match Log: Understat Totals and Average cover the matches it has

## v1.87.0 · 19 Oct 2026

- Profiles: past-season Match Log tints, shot map goal counts and stats panel, team profile tidy-up

## v1.86.0 · 19 Oct 2026

- Profiles: grid layout, larger shot maps, Match Log source toggles

## v1.85.0 · 19 Oct 2026

- Profiles: Understat views, season-following Match Log; "FPL ·" picker headings

## v1.84.1 · 18 Oct 2026

- User Guide: drop the note that Understat shot detail arrives a day late (the sync has run)

## v1.84.0 · 18 Oct 2026

- Explorers: more FPL and Understat stats; crossover picker group

## v1.83.0 · 18 Oct 2026

- Audit 2026-10-18 full-app: second remediation pass (R2, R3, goals may differ by source)
- Audit 2026-10-18 full-app: phase 3 report
- Understat: FPL is the source of truth where the sources disagree
- Audit 2026-10-18 full-app: phase 2 fixes
- Audit 2026-10-18 full-app: correct it.fails count in index
- Audit 2026-10-18 full-app: phase 1 report

## v1.82.1 · 18 Oct 2026

- Explorers: FPL headers that follow the Data View are green

## v1.82.0 · 18 Oct 2026

- Understat as a separate second source in the Explorers; alerts for every workflow

## v1.81.0 · 15 Oct 2026

- Player Comparison: Outputs as tinted bars with figures above markers

## v1.80.0 · 14 Oct 2026

- Notepad: full-page toggle, tab limits, no placeholder or scrollbar

## v1.79.2 · 12 Oct 2026

- Player Comparison: Players heading above the search card

## v1.79.1 · 12 Oct 2026

- Player Comparison: Saved Views heading above the view picker

## v1.79.0 · 11 Oct 2026

- Notepad: slide-in notes panel with saved tabs

## v1.78.0 · 3 Oct 2026

- User Guide: coloured section headings

## v1.77.1 · 1 Oct 2026

- Icon toolbar count badges back in Inter

## v1.77.0 · 1 Oct 2026

- De-template the UI: Plex Sans, plain guide, slim gameweek strip, no em dashes

## v1.76.3 · 30 Sept 2026

- User Guide: condensed by about 40%

## v1.76.2 · 30 Sept 2026

- Launch update window: card design with icon, version, progress and stage

## v1.76.1 · 30 Sept 2026

- User Guide: current Player Explorer toolbar, tidy Team Explorer, drop old history

## v1.76.0 · 30 Sept 2026

- Updates install on open and are offered while running; workflows on Node 24

## v1.75.1 · 30 Sept 2026

- Explorer name columns: same gap before the divider on both pages

## v1.75.0 · 30 Sept 2026

- Menus redesigned as one set; 4 cards per comparison section; green section icons

## v1.74.1 · 30 Sept 2026

- Page section headings: icon badge, title and trailing rule

## v1.74.0 · 29 Sept 2026

- Player Comparison rebuilt as a view builder; Dashboard opens on a blank My View

## v1.73.1 · 26 Sept 2026

- Club history: automatic release when a season completes; player drop/re-list tests

## v1.73.0 · 26 Sept 2026

- Team Profile: club figures only, with a match log; club xGC from opponent xG; small-sample icon

## v1.72.1 · 26 Sept 2026

- Profiles: section headings above cards, Points History type matches the app

## v1.72.0 · 26 Sept 2026

- Profile focus ring removed; club pills on player tiles; shorter default titles

## v1.71.0 · 26 Sept 2026

- Minutes-floor badge, one floor for the Default Dashboard, aligned tile bars

## v1.70.0 · 26 Sept 2026

- Roll back the tile restyle and app-wide badge style to v1.67.0's look

## v1.69.0 · 26 Sept 2026

- Badges app-wide: plain-text positions and pill club badges; Team Explorer's Player Rankings button removed

## v1.68.0 · 26 Sept 2026

- Dashboard tile restyle; Live Data Totals/Average labels centred

## v1.67.0 · 26 Sept 2026

- Profiles: Points History redesign, Supplements removed, Average row and Price colouring

## v1.66.2 · 25 Sept 2026

- Fixed-floor sections: Historic Average counts only 450+ minute seasons; Player Comparison's table ignores small samples

## v1.66.1 · 25 Sept 2026

- Audit 2026-09-25 player-team-profiles: phase 2 fixes (second pass: R1–R7, T2)
- Audit 2026-09-25 player-team-profiles: phase 3 report
- Audit 2026-09-25 player-team-profiles: phase 2 fixes
- Audit 2026-09-25 player-team-profiles: phase 1 report

## v1.66.0 · 25 Sept 2026

- Team Explorer: Player Explorer's toolbar, column filters and every team metric

## v1.65.2 · 25 Sept 2026

- Team Explorer: rename Teams, and lay its table out like Player Explorer's

## v1.65.1 · 25 Sept 2026

- Player Explorer and Team Building open fast: tables draw rows in stages

## v1.65.0 · 25 Sept 2026

- Audit 2026-09-25 player-explorer: phase 2 fixes (second pass: R1–R12, V1)
- Audit 2026-09-25 player-explorer: phase 3 report
- Audit 2026-09-25 player-explorer: phase 2 fixes
- Audit 2026-09-25 player-explorer: phase 1 report
- Audits: separate reusable strategy from dated results; tighten the three phase prompts

## v1.64.0 · 24 Sept 2026

- Dashboard audit fixes: correct per-game rates, bar order, scatter tooltips, safer views

## v1.63.1 · 24 Sept 2026

- Club history: 2022/23 expected stats and starts are "—", not part-season sums

## v1.63.0 · 24 Sept 2026

- Docs: split README into current reference vs archived history; tighten CLAUDE.md

## v1.62.0 · 24 Sept 2026

- Dashboard: edit tiles/graphs in place, icon Remove, Add Trend Line toggle

## v1.61.0 · 24 Sept 2026

- Dashboard: Min Minutes applies to Current Season tiles and graphs

## v1.60.0 · 23 Sept 2026

- Graphs: axes fit the data, stretched reference-line graphs, no stretch note

## v1.59.0 · 23 Sept 2026

- Graphs: blanket axis-scaling rules so any metric pair stays readable
- Freeze the vaastav archive in the repo: the backfill no longer reads it online
- CLAUDE.md: note the one-off vaastav club-history backfill; test per-metric blank-season averaging

## v1.58.0 · 23 Sept 2026

- Team analysis becomes club analysis: every team figure is what the club did that season
- Club history: match-level club record 2016/17 onward, plus a weekly official archive

## v1.57.0 · 23 Sept 2026

- Dashboard graphs: fix team xGC (~11x inflated), same-season Goals Conceded, readable player defaults

## v1.56.0 · 23 Sept 2026

- Underlying Numbers removed — graph building moves into Dashboard's new Graphs section

## v1.55.0 · 22 Sept 2026

- Fix header filter/sort icon overlap; Dashboard's Players/Teams toggle becomes icon buttons next to the title

## v1.54.0 · 22 Sept 2026

- Player Explorer: tighten Player-to-Ownership spacing, add a divider between them

## v1.53.0 · 22 Sept 2026

- Player Explorer: Ownership/Price/Team/Position become a fixed identity block; Team pill uses TeamBadge

## v1.52.0 · 22 Sept 2026

- Player Explorer: Team/Position columns replace criteria dropdowns, Price relocated; Add Tile gets price criteria; Starts moves to Supplements

## v1.51.0 · 22 Sept 2026

- Add Tile modal: icon toggles for Filters/Player Search and All/Selected Teams

## v1.50.0 · 22 Sept 2026

- Dashboard tiles: mandatory names, player/team tracking picks

## v1.49.0 · 22 Sept 2026

- Player Explorer: drop Min Minutes criteria, Reset Criteria becomes an icon

## v1.48.0 · 22 Sept 2026

- Icon toolbar: fix popovers opening off-screen, bump icon size

## v1.47.0 · 22 Sept 2026

- Icon toolbar count badges: green accent instead of blue, to match theme

## v1.46.0 · 22 Sept 2026

- Player Explorer: auto-size table to viewport; icon toolbars replace text chips

## v1.45.0 · 22 Sept 2026

- Topbar status strip gets icons instead of text

## v1.44.0 · 22 Sept 2026

- View toggle and data-view badges get icons instead of text

## v1.43.0 · 22 Sept 2026

- Team Profile: fix Views grid layout (plain 2x2, not masonry columns)

## v1.42.0 · 22 Sept 2026

- Team Profile: fold radars into Views, move Squad Points History below squad table

## v1.41.0 · 22 Sept 2026

- Team Profile: add Squad Points History chart

## v1.40.0 · 22 Sept 2026

- Team Profile: comparative colouring, richer squad summary, team radars, distinct team colours

## v1.39.0 · 21 Sept 2026

- Team Profile overlay replaces Team Detail's ranking page; Playing Time gets a text summary

## v1.38.0 · 21 Sept 2026

- Live Data: split Current Season Log into Prime/Supplements tables, Playing Time full-width

## v1.37.0 · 21 Sept 2026

- Current Season Log: Prime/Supplements grouping, position sense-check, fuller names

## v1.36.0 · 21 Sept 2026

- Player Profile: always-shown columns, comparative colouring, tidier Career History

## v1.35.0 · 21 Sept 2026

- Make Default view immutable; replace Save View with Create View + live-sync

## v1.34.0 · 21 Sept 2026

- Streamline Dashboard summary-tile view selector; persist selected view per scope

## v1.33.0 · 21 Sept 2026

- Fix race condition in historic-bulk refresh coalescing (Phase 3 regression R1)
- Fix Critical/Medium/Low findings from forensic audit; add Vitest test suite
- Set up three-phase audit process (CLAUDE.md rules + docs/audits/ prompts)

## v1.32.1 · 21 Sept 2026

- Make Default saved-view backfill self-healing, not one-time

## v1.32.0 · 21 Sept 2026

- Make Default saved view permanent; auto-refresh bootstrap data

## v1.31.1 · 21 Sept 2026

- Fix Career History chart colour logic and missing Default saved views

## v1.31.0 · 21 Sept 2026

- Drop career-chart hover captions; fold Dashboard defaults into saved views

## v1.30.0 · 20 Sept 2026

- Per-tile Dashboard criteria + naming, and fix unstyled Saved Views dropdown

## v1.29.0 · 20 Sept 2026

- Dashboard saved views, two-tone team colours, profile percentile tints, drop inline captions

## v1.28.0 · 20 Sept 2026

- Dashboard visual uplift: per-tile data view, Players/Teams toggle, tile bars, real club colours

## v1.27.0 · 20 Sept 2026

- Version localStorage so app updates can't break saved customisation

## v1.26.0 · 20 Sept 2026

- Make every page's filters/analysis-mode fully independent

## v1.25.0 · 20 Sept 2026

- Stop excluding light/injury seasons from Historic Average

## v1.24.0 · 20 Sept 2026

- Replace per-90-minutes metrics with per-game app-wide

## v1.23.1 · 19 Sept 2026

- Fix Dashboard rate-stat leaderboards still skewed in Current Season

## v1.23.0 · 19 Sept 2026

- Fix low-minutes skew on Dashboard's rate-based Top-5 leaderboards

## v1.22.0 · 19 Sept 2026

- Remove Position Percentile bar; radar charts lead the Views zone

## v1.21.0 · 19 Sept 2026

- Remove archetype system entirely; split Underlying Numbers for DEF/MID

## v1.20.0 · 19 Sept 2026

- Rename profile section headings, fix This View card-height imbalance

## v1.19.0 · 19 Sept 2026

- Split DEF/MID percentile radar into Defense/Offense, drop redundant footnote

## v1.18.0 · 19 Sept 2026

- Trim player profile section labels and fix Season Log averages

## v1.17.0 · 19 Sept 2026

- Replace player profile static-data red text with zoned layout

## v1.16.1 · 19 Sept 2026

- Bump version to 1.16.1
- Fix PPG blowing up for low-minutes players; flag always-live profile data

## v1.16.0 · 19 Sept 2026

- Bump version to 1.16.0
- Rebuild player profile as a full-screen hero report

## v1.15.0 · 19 Sept 2026

- Bump version to 1.15.0
- Performance pass: memoize context value, lazy-load pages per route

## v1.14.1 · 19 Sept 2026

- Bump version to 1.14.1
- Fix huge dead gaps in 2-card rows; cap dialog height to viewport

## v1.14.0 · 19 Sept 2026

- Bump version to 1.14.0
- Separate Refresh Data from window controls; prune old GitHub releases
- Allow the release pipeline's git/gh commands without prompting

## v1.13.0 · 19 Sept 2026

- Sync package.json version with released git tags (v1.12.0 -> v1.13.0)
- True fullscreen desktop window with custom themed controls

## v1.12.0 · 18 Sept 2026

- Borderless maximized window, no default menu bar, custom app icon
- Retire Railway hosting; document the desktop app as primary

## v1.11.4 · 18 Sept 2026

- Fix invalid electron-builder publish config: draft -> releaseType
- Publish GitHub Releases live, not as drafts

## v1.11.3 · 18 Sept 2026

- Fix and finish the Electron desktop app; add auto-updates and a release pipeline

## v1.11.2 · 15 Sept 2026

- Revert position badge colours to the original red/green/blue/yellow palette

## v1.11.1 · 10 Sept 2026

- Add colour-coded team badges to give team listings the same visual interest as players

## v1.11.0 · 10 Sept 2026

- Restyle static-column marker as muted red, add customisable Dashboard tiles

## v1.10.5 · 10 Sept 2026

- Distinguish static vs dynamic columns across player tables

## v1.10.4 · 10 Sept 2026

- Refine position colour scheme: exact target hexes, tokenized, cohesive tints

## v1.10.3 · 9 Sept 2026

- Give position badges their own colour palette, off this app's semantic tokens

## v1.10.2 · 9 Sept 2026

- Redesign position badges to a distinct silhouette from other FPL tools

## v1.10.1 · 9 Sept 2026

- Remove Points per 90 from Player Comparison's Player Trends metric picker

## v1.10.0 · 9 Sept 2026

- Team Building: gameweek navigator, Expected Points Tier 1 + Tier 2 side by side

## v1.9.0 · 9 Sept 2026

- Add Expected Points Tier 2: independent per-event model + backtest

## v1.8.2 · 9 Sept 2026

- Team Building: add matching pill backing to GKP/FWD jersey badges

## v1.8.1 · 9 Sept 2026

- Team Building: fix illegible DEF/MID position badges on the pitch jersey

## v1.8.0 · 9 Sept 2026

- Underlying Numbers: independent per-section view wiring; save custom graphs

## v1.7.1 · 8 Sept 2026

- Move Teams' no-data-for-mode note into the aggregate info banner

## v1.7.0 · 8 Sept 2026

- Rework Team Building: squad management dialogs, redesigned pitch, trimmed page

## v1.6.0 · 8 Sept 2026

- Move Player Trends to Player Comparison; add accent/fuzzy player-name search

## v1.5.0 · 8 Sept 2026

- Nav reorganisation, Player Explorer null-sort, Underlying Numbers reorder

## v1.4.2 · 8 Sept 2026

- Teams: move the current-squad-aggregate note below the table

## v1.4.1 · 8 Sept 2026

- Underlying Numbers: axis labels, outlier fix, Player Trends starts empty

## v1.4.0 · 8 Sept 2026

- Player Profile: This Season gameweek breakdown; Normalise on by default

## v1.3.0 · 1 Sept 2026

- Player Explorer fixtures column; Underlying Numbers cleanup and multi-metric trends

## v1.2.0 · 1 Sept 2026

- Add Championship section covering the three promoted teams

## v1.1.0 · 26 Aug 2026

- Reduce redundant recomputation across the app (perf, no behavior change)

## v1.0.9 · 26 Aug 2026

- Fix production outage: allow null ep_next from FPL's live API

## v1.0.8 · 26 Aug 2026

- Player Explorer count pill, CSV export for Player Explorer and Team Building

## v1.0.7 · 26 Aug 2026

- Dashboard status cards, one-line summary boxes, and live-aware Career History

## v1.0.6 · 26 Aug 2026

- Default min-minutes eligibility threshold to 0

## v1.0.5 · 26 Aug 2026

- Price always reflects live cost; consolidate explanatory text into User Guide

## v1.0.4 · 26 Aug 2026

- Simplify Player Explorer and Team Building filter bars

## v1.0.3 · 26 Aug 2026

- Fix gameweek status label, retain no-data players instead of omitting them, add ownership/archetype column defaults, multi-player trends

## v1.0.2 · 25 Aug 2026

- Fix Current Season mode showing no GW1 stats

## v1.0.1 · 25 Aug 2026

- Bump version to 1.0.1 (verify Railway auto-deploy on push)
- Initial commit: FPL Analytics Dashboard
