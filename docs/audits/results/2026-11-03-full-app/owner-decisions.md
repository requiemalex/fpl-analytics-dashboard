# Owner decisions on the 2026-11-03 Phase 1 report

Given by the owner on 2026-11-03, after `1-audit.md`, for Phase 2 to act on.

| Item | Decision | For Phase 2 |
|---|---|---|
| V5 Profiles open on Last Season, whatever the page's Data View | Fine as the default | Not a defect: leave it |
| V7 A player's DC/Game shows 2 decimals and reaches the teens | Round to the nearest whole number | Fix: a player's DC/Game is whole, like clubs'. Update README "Whole numbers" and CLAUDE.md's list |
| V8 A player's Starts and Minutes are coloured, clubs' Played and Draws aren't | Keep colouring them: minutes and starts vary by player (not by club), and more is better | Not a defect: leave it. Make the README / CLAUDE.md colouring rule say "a club's played" so it reads unambiguously |
| V12 A fresh Dashboard opens on the blank My View | Default views should show by default on every page that has this choice; My View stays alongside, so users can pick it and see how custom views work | Fix: open on the Starter/default view on every such page alike. Keep My View in the list. It's a saved-data change (version bump + `migrate()`) that keeps a view a user already picked |
| L15 "vaastav" as a Help search keyword | That is fine | Not a defect: leave it (and the Legal credit) |
