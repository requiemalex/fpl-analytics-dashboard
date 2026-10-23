# Scoutline privacy notice

Version 2, 23 October 2026

Scoutline is a desktop app. It has no accounts, no advertising, no
analytics and no tracking, and it never sends anything about you to its
developer.

## What it stores, and where

Everything you create stays **on your own computer**, in the app's local
storage:

- your settings, Dashboard tiles, graphs and saved views;
- Player Comparison views;
- saved squads (including a squad you imported by FPL team ID);
- notepad notes;
- that you accepted the app's terms, and which version;
- a log of what the app did (launches, update checks) and any errors it
  hit, in the data folder's `logs` subfolder, so a problem can be traced.

Nothing of this leaves your computer. Uninstalling the app and deleting its
data folder (`%APPDATA%\FPL Analytics Dashboard` on Windows: the folder kept
its original name so saved data survived the rename) removes it.

## What it connects to

The app connects only to these services. Each sees your IP address and the
request, as any website you visit would, under its own privacy policy:

| Service | Why |
|---|---|
| `fantasy.premierleague.com` (the Fantasy Premier League game's data feed, operated by the Premier League) | Live player, fixture and gameweek data. If you import a squad, the team ID you type is sent to load that team. |
| `raw.githubusercontent.com` (GitHub) | The Understat dataset the app publishes for itself. |
| `github.com` (GitHub Releases) | Checking for and downloading app updates. |

The app's built-in server accepts connections only from your own computer.

## Contact

Questions: https://github.com/requiemalex/fpl-analytics-dashboard/issues
