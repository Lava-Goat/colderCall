# colderCall

Cold calls. But even cooler.

A lightweight, self-hosted cold-calling tool for teachers. Upload a class roster, pick students at random, record outcomes, and keep notes — all in the browser, with data stored locally in SQLite.

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
| **Keyboard shortcut** | Space or Enter picks the next student when no input is focused |
| **Dark mode** | Manual toggle (☀️/🌙) that overrides the system preference, persisted across sessions |
| **Roster import** | CSV upload (headers optional), manual entry, or Google Classroom (OAuth, no token sent to server) |
| **Export** | Download the full roster + outcomes as CSV at any time |
| **Server persistence** | SQLite via `better-sqlite3`; save/load sessions by ID so data survives a browser clear |

---

## Quick start

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
# Get this from: https://console.cloud.google.com → APIs & Services → Credentials
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
```

> `.env` is gitignored and never committed.

---

## Usage

### Loading a roster

**CSV upload** — click *Upload roster (CSV)*. Headers are optional; the parser recognises `first`, `last`, `fullname`, `name`, `class`, `period`, and similar variants. Without headers, columns are interpreted as first, last, class, period.

**Manual entry** — type a first name, last name, optional class and period, then click *Add*.

**Google Classroom** — click *Sign in with Google*, select a course from the dropdown, then click *Import roster*. The OAuth token is used entirely in the browser and never sent to the server.

### Picking students

Click **Pick next student** (or press **Space / Enter**) to draw at random from the pool of present students.

- **No repeats this cycle** (default) — each student is called once before anyone is called again. The pool resets automatically at the end of each cycle.
- **Allow repeats** — draws from the full present roster every time.

Use **Skip** to pass on the current student without recording an outcome.

Use **Go back** to undo the last pick or status change.

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

Click **Pop out** in the Pick & Record panel header to open it in a separate window. Both windows stay in sync via `BroadcastChannel`. Click *Return to main window* in the pop-out to close it.

### Memos

The memo field is per-cycle. When you click **Reset cycle**, the current memo is archived to cycle history and a new one starts (or carries over if *Keep memo* is checked). Cycle history is saved with the session.

### Saving and loading

Click **Save to server** to persist the current session to SQLite. The server returns a session ID shown in the status pill — note it down if you want to load the session later.

Click **Load session** and enter a session ID to restore a previously saved session.

---

## Google Classroom setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) → *APIs & Services* → *Credentials*.
2. Create an **OAuth 2.0 Client ID** of type *Web application*.
3. Add your server's origin (e.g. `https://castle.great-morpho.ts.net:3000`) to *Authorised JavaScript origins*.
4. Copy the Client ID into your `.env` as `GOOGLE_CLIENT_ID`.
5. Enable the **Google Classroom API** in *APIs & Services* → *Enabled APIs*.

---

## Project structure

```
colderCallX/
├── server.js        Express server, SQLite persistence, static file serving
├── app.js           All client-side logic (state, rendering, sync, Classroom OAuth)
├── index.html       Single-page UI
├── styles.css       CSS custom properties, light + dark themes
├── data/            SQLite database (gitignored, created at runtime)
├── .env             Local environment config (gitignored)
└── package.json
```

The front end is vanilla JS with no build step. The server is a small Express app with `better-sqlite3`.

---

## Data storage

Sessions are stored in `data/colderCall.sqlite` with three tables:

- **`sessions`** — settings, memo, cycle number, defaults
- **`students`** — roster with outcomes and call counts per session
- **`cycle_memos`** — memo archive per cycle per session

The database file is excluded from static file serving and from version control.

---

## License

[GNU Affero General Public License v3.0](LICENSE)

Copyright © 2026 Jon-Erik G. Storm, Inc., a California Corporation Doing Business As "Lava Goat Software"

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [GNU AGPL v3](https://www.gnu.org/licenses/agpl-3.0.html) for more details.
