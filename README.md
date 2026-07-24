# Anime Tracker

A local anime tracker that runs on your own computer. No cloud service, no account, no internet connection required (except for searching AniList and the Discover tab).

## Install

**Easiest — the standalone `.exe` (Windows, nothing else required):**

1. Download `AnimeTracker.exe`.
2. Double-click it. A small console window opens and your browser starts automatically.

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

All data (your library, cover images, automatic backups, Discover suggestions) lives **outside** the program folder, in an OS-specific directory:

- **Windows:** `%APPDATA%\anime-tracker\`
- **macOS:** `~/Library/Application Support/anime-tracker/`
- **Linux:** `~/.local/share/anime-tracker/` (or `$XDG_DATA_HOME/anime-tracker/` if that environment variable is set)

This means you can always delete the entire program folder and drop in a new version without losing anything.

If you're updating from a version older than this one, your old data is automatically moved **once**, the first time you start the new version. The old folder is never touched or deleted — you'll find a `MOVED.txt` file there explaining where the data went, in case you want to double-check or clean it up manually later.

## Manual backup

The app automatically takes a backup on every save (the last 150 are kept in the `backups/` folder inside the data directory above). To make your own backup:

1. Go to the data directory for your platform (see above).
2. Copy the entire folder somewhere safe (e.g. an external drive or cloud storage).

That's enough to restore everything — library, cover images, and settings.

You can also export a single JSON file with your entire library via the "Backup & restore" button in the app's header.
