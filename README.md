# MellowPlayer

Offline chapter markers for your local video files. An Electron desktop app —
open a video, mark chapters, and everything stays on your machine (no uploads,
no accounts). Each video gets its own "vault" of chapters stored in a local
SQLite database.

## Features

- Open local videos (`mp4`, `mov`, `mkv`, `webm`, `avi`, `m4v`, `ogv`, `wmv`)
- Add chapters with title, start, and end times (`mm:ss`, `hh:mm:ss`, or seconds)
- Grab the current playback time into a chapter with one click
- Timeline strip showing chapter segments and playhead
- Library view of every video you've opened, with search
- Import chapters from a JSON file (template available in-app)

## Run

```bash
npm install
npm start
```

Requires Node.js and Electron (installed via `npm install`).

## Data

Chapters live in `vault.db` under Electron's per-user `userData` directory —
not in this repo. Delete that file to reset the library.

## Stack

Electron + [sql.js](https://sql.js.org/) (in-process SQLite via WebAssembly).
