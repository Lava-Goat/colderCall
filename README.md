# colderCall

Modern browser-based cold calling helper. Upload a roster, pick students at random with or without replacement, track outcomes, and export results to CSV or SQLite.

## Quick start

1. Install dependencies: `npm install`
2. Start the server (serves the UI and stores data in SQLite at `data/colderCall.sqlite`): `npm start`
3. Open http://localhost:3000 in a modern browser (mobile, tablet, or desktop).
4. Upload a CSV roster (headers optional) or import directly from Google Classroom via API (provide course ID + OAuth token), or add students manually. Set default class name/period if you want those applied on import.
5. Choose how names display (full, first, last, first + last initial).
6. Hit **Pick next student**, record outcomes (correct, incorrect, pass, absent), and jot a memo for the current cycle (optionally carry it to the next cycle on reset). Use **Go back** to undo the last change.
7. Pop the Pick & Record panel into its own window if you want a floating control surface.
7. Click **Save to server** to persist to SQLite; optionally **Export CSV** for a quick download.

### Google Classroom API import
- Provide a valid Classroom OAuth access token and course ID, then click **Import via Classroom API**.
- The server proxies the Classroom request at `/api/classroom/students`; course name/section fill class/period fields.
- Tokens are not persisted; keep them short-lived.

## Feature checklist

- Responsive layout for phone, tablet, and desktop
- Name display options: full, first, last, first + last initial
- Random selection with or without replacement; cycle reset button
- Status tracking: correct, incorrect, pass, absent
- Roster import from CSV + manual add/remove
- Class name + period fields per student (defaults for imports)
- Per-cycle memo with optional carryover to next cycle (cycle history saved)
- Server-side SQLite persistence (data/colderCall.sqlite) plus CSV export
- Google Classroom import via API (course ID + OAuth token); legacy CSV import still supported
- Undo (go back) and optional pop-out control window
