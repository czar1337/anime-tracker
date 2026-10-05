# Anime Tracker

A local anime tracker that runs on your own computer. No cloud service, no account, no internet connection required (except for searching AniList, airing times, and building the Discover catalogue).

## What's new in 3.0

- **Discover, rebuilt.** Recommendations now combine what your favourite shows have in common with AniList's "fans of this also liked", and every card says honestly why it is there ("Fans of Mob Psycho 100 rate this highly (you gave it 10)"). One card per franchise, nothing unreleased or poorly rated on the taste rails, and three one-tap answers on every card: Want to watch, Seen it, Not for me. **Swipe through** (press T) answers one card at a time.
- **A faster, calmer app**: a new Home screen ("Tonight"), a command palette (Ctrl+K), a cleaner library with saved views, a detail drawer with your watch history, and a simpler Settings with 12 curated themes.
- **Sharper and livelier**: the same poster everywhere, tooltips with keyboard shortcuts, Library tabs with a list view, a Search that can mark episodes, a seasonal decoration level called Insane, and ? for every shortcut.
- **More of your history kept**: On hold, rewatches, start dates and a watch diary; lossless imports from MyAnimeList, AniList (by username) and backup files, each with an undo.
- **Schedule v2** with countdowns and a season chart, and optional episode notifications even when no browser tab is open.
- **Safer data**: a verified snapshot before every upgrade, backups kept by day and month, and protection against other websites talking to the app.

The full list is in [CHANGELOG.md](CHANGELOG.md).

## Install

**Easiest — the standalone `.exe` (Windows, nothing else required):**

1. Download `AnimeTracker.exe`.
2. Double-click it. Your browser opens the app, and an Anime Tracker icon appears in the system tray (bottom right): use it to open the app again, open the data folder, or quit.

That's it — no installation, no Node.js required.

**Alternative — zip with `start.bat`/`start.sh` (requires Node.js):**

1. Download and unzip the file anywhere on your computer.
2. Windows: double-click `start.bat`. Mac/Linux: run `./start.sh` in a terminal.
3. If Node.js isn't installed, a message with a link to nodejs.org is shown — install it and run the file again.
4. Your browser opens automatically at `http://localhost:4321`.

## Updating

Delete the entire old program folder (or the old `.exe`) and unzip/place the new version there instead. **Your data lives in a separate location and is not affected** — see below.

The app shows a discreet banner at the top if a newer version is available, linking to the GitHub release. The app never downloads or installs anything on its own — updating is always a manual step.

## Where your data lives

All data (your library, your activity log, cover images, automatic backups and snapshots, and the Discover catalogue) lives **outside** the program folder, in an OS-specific directory:

- **Windows:** `%APPDATA%\anime-tracker\`
- **macOS:** `~/Library/Application Support/anime-tracker/`
- **Linux:** `~/.local/share/anime-tracker/` (or `$XDG_DATA_HOME/anime-tracker/` if that environment variable is set)

This means you can always delete the entire program folder and drop in a new version without losing anything.

If you're updating from a version older than this one, your old data is automatically moved **once**, the first time you start the new version. The old folder is never touched or deleted — you'll find a `MOVED.txt` file there explaining where the data went, in case you want to double-check or clean it up manually later.

When 3.0 first opens a library from an earlier version, it takes a verified snapshot of it first and keeps that snapshot permanently, then upgrades the file. Nothing in your library is removed by the upgrade; settings that no longer exist (old themes, sliders) are carried over to their nearest new equivalent, and a one-time note says what changed. The Discover catalogue (about 6,000 titles, around 13 MB) downloads again in the background the first time, while the old one keeps working.

## Manual backup

The app automatically takes a backup when you save (the last 50, plus one per day for a month and one per month after that, in the `backups/` folder inside the data directory above), and keeps verified snapshots in `snapshots/`. To make your own backup:

1. Go to the data directory for your platform (see above).
2. Copy the entire folder somewhere safe (e.g. an external drive or cloud storage).

That's enough to restore everything — library, cover images, and settings.

You can also export a single file with your entire library, settings and history from **Settings → Data**, or with "Export library" in the command palette (Ctrl+K).
