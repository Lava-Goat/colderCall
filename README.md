<p align="center">
  <img src="icon.svg" width="120" alt="colderCall icon"/>
</p>

# colderCall

Cold calls. But even cooler.

A lightweight cold-calling tool for teachers. Upload a class roster, pick students at random, record outcomes, and keep notes — with data stored locally in SQLite. Available as a native desktop app or self-hosted web server.

Built to stay out of your way during class. No accounts, no subscriptions, no cloud.

---

## Features

| | |
|---|---|
| **Random selection** | With or without replacement; automatic cycle reset when every student has been called |
| **Outcome tracking** | Correct · Incorrect · Pass · Absent per student, per cycle |
| **Name display modes** | Full name · First only · Last only · First + last initial |
| **Per-cycle memos** | Freeform note for each cycle; optional carryover; full memo history saved |
| **Undo** | Go back one step at any point |
| **Pop-out window** | Detach the Pick & Record panel into a floating window — keep the roster on one screen, the picker on another |
| **Fullscreen mode** | Distraction-free display of the current student's name for classroom projection |
| **Collapsible panels** | Collapse the roster or picker panel independently to reclaim screen space |
| **Sortable roster** | Click any column header to sort by name, class, period, status, or call count |
| **Edit student names** | Click the pencil icon on any roster row to rename a student in place |
| **Class & group filtering** | Filter the pick pool to a specific class/period combination or a custom group |
| **Custom groups** | Create named groups of students (e.g. "Reading Support") and include or exclude them from picks |
| **Group from class** | One-click: convert an existing class/period into a named group |
| **Ahead-of-time absent marking** | Mark students absent from the roster before starting picks |
| **Keyboard shortcut** | Space or Enter picks the next student when no input is focused |
| **Dark mode** | Manual toggle (☀️/🌙) that overrides the system preference, persisted across sessions |
| **Roster import** | CSV upload, Aeries XLSX export (single or multi-class), manual entry, or Google Classroom (OAuth) |
| **Aeries multi-class import** | Import an Aeries XLSX with multiple classes; pick which classes to load via a checkbox picker |
| **Export** | Download the full roster + outcomes as CSV at any time |
| **Server persistence** | SQLite via `better-sqlite3`; save/load sessions by ID so data survives restarts |

---

## Desktop app (Electron)

The recommended way to run colderCall. Runs as a native app on macOS, Windows, and Linux — no browser required, no server to manage.

### Requirements

- [Node.js](https://nodejs.org) 18 or later
- npm

### Install and run

```bash
git clone https://castle.great-morpho.ts.net:3000/jonerik/colderCallX.git
cd colderCallX
npm install
npm run electron
```

Data is stored in your system's app-data directory:

| Platform | Location |
|---|---|
| macOS | `~/Library/Application Support/colderCall/data/` |
| Windows | `%APPDATA%\colderCall\data\` |
| Linux | `~/.config/colderCall/data/` |

Data persists across app updates as long as the app ID (`com.coldercall.app`) is unchanged.

### Build a distributable

```bash
# macOS (Apple Silicon)
npm run dist:mac:arm64

# macOS (Intel)
npm run dist:mac:x64

# Windows
npm run dist:win

# Linux
npm run dist:linux
```

Outputs land in `dist/`.

---

## Web server

Run colderCall as a local web server and open it in any browser — useful for shared classroom computers or self-hosted deployments.

### Requirements

- [Node.js](https://nodejs.org) 18 or later
- npm

### Install and run

```bash
git clone https://castle.great-morpho.ts.net:3000/jonerik/colderCallX.git
cd colderCallX
npm install
npm start
```

Open **http://localhost:3000** in any modern browser.

### Environment variables

Copy `.env.example` to `.env` and fill in your values before starting the server:

```env
# Port to listen on (default: 3000)
PORT=3000

# Google OAuth 2.0 Client ID (Web application type)
# Required only for the Google Classroom import feature
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
```

> `.env` is gitignored and never committed.

---

## Docker

For always-on self-hosted deployments.

```bash
docker compose up -d
```

The compose file binds to `127.0.0.1:16767` and mounts data at `/home/jonerik/docker/coldercall/data`. Edit `docker-compose.yml` to suit your environment. The container runs as a non-root user; the host data directory must be owned by UID 1000.

---

## Usage

### Loading a roster

**Aeries XLSX** — click *Import Aeries XLSX* and upload a standard Aeries class roster export. Multi-class files are supported: a picker lets you select which classes to import.

**CSV upload** — click *Upload roster (CSV)*. Headers are optional; the parser recognises `first`, `last`, `fullname`, `name`, `class`, `period`, and similar variants. Without headers, columns are interpreted as first, last, class, period.

**Manual entry** — type a first name, last name, optional class and period, then click *Add*.

**Google Classroom** — click *Sign in with Google*, select a course from the dropdown, then click *Import roster*. The OAuth token is used entirely in the browser and never sent to the server.

### Filtering the pick pool

Use the filter buttons above the roster to limit picks to:

- **All** — the full present roster
- **A class/period** — one class at a time (buttons generated from your roster)
- **A group (include)** — only students in the named group
- **A group (exclude)** — everyone except students in the named group

The pool info bar shows how many students are in the active pool and which filter is applied.

### Custom groups

Type a group name and click **Create group**, then check the students you want to include. Groups are saved with the session. You can also create a group from an existing class using the **Group from class** button next to any class filter.

### Picking students

Click **Pick next student** (or press **Space / Enter**) to draw at random from the active pool.

- **No repeats this cycle** (default) — each student is called once before anyone is called again. The pool resets automatically at the end of each cycle.
- **Allow repeats** — draws from the full active pool every time.

Use **Skip** to pass on the current student without recording an outcome.

Use **Undo** to reverse the last pick or status change (up to 30 steps).

### Recording outcomes

After picking a student, click one of the outcome buttons:

| Button | Meaning |
|---|---|
| **Correct** | Student answered correctly |
| **Incorrect** | Student answered incorrectly |
| **Pass** | Student passed |
| **Absent** | Mark absent (excluded from future picks this cycle) |
| **Reset status** | Clear the current outcome back to pending |

### Pop-out window

Click **Pop out** in the picker panel header to open it in a separate window. Both windows stay in sync via `BroadcastChannel`. In the Electron app, the pop-out opens as a native window. Click *Return to main window* in the pop-out to close it.

### Fullscreen mode

Click **Fullscreen** in the picker panel to display the current student's name in a large, distraction-free view. Press **Escape** or click **Exit fullscreen** to return.

### Memos

The memo field is per-cycle. When you click **Reset cycle**, the current memo is archived to cycle history and a new one starts (or carries over if *Keep memo* is checked). Cycle history is saved with the session.

### Saving and loading

Click **Save to server** to persist the current session to SQLite. A session ID is shown in the status pill — copy it to restore the session later.

Click **Load session** and enter the session ID to restore a previously saved session.

---

## Google Classroom setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) → *APIs & Services* → *Credentials*.
2. Create an **OAuth 2.0 Client ID** of type *Web application*.
3. Add your server's origin (e.g. `http://localhost:3000`) to *Authorised JavaScript origins*.
4. Copy the Client ID into your `.env` as `GOOGLE_CLIENT_ID`.
5. Enable the **Google Classroom API** in *APIs & Services* → *Enabled APIs*.

---

## Project structure

```
colderCallX/
├── electron.js      Electron main process (embeds Express, manages windows)
├── server.js        Express server, SQLite persistence, Aeries parser
├── app.js           All client-side logic (state, rendering, sync, OAuth)
├── index.html       Single-page UI
├── styles.css       CSS custom properties, light + dark themes
├── icon.icns        macOS app icon
├── icon.svg         App icon source (SVG)
├── Dockerfile       Multi-stage Docker build
├── docker-compose.yml
├── data/            SQLite database (gitignored, created at runtime)
├── .env             Local environment config (gitignored)
└── package.json
```

The front end is vanilla JS with no build step. The server is a small Express app with `better-sqlite3`.

---

## Data storage

Sessions are stored in `colderCall.sqlite` with three tables:

- **`sessions`** — settings, memo, cycle number, defaults, groups
- **`students`** — roster with outcomes and call counts per session
- **`cycle_memos`** — memo archive per cycle per session

The database file is excluded from static file serving and from version control.

---

## License

[GNU Affero General Public License v3.0](LICENSE)

Copyright © 2026 Jon-Erik G. Storm, Inc., a California Corporation Doing Business As "Lava Goat Software"

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [GNU AGPL v3](https://www.gnu.org/licenses/agpl-3.0.html) for more details.
