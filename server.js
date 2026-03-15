require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const Database = require("better-sqlite3");
const multer = require("multer");
const XLSX = require("@e965/xlsx");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "colderCall.sqlite");

fs.mkdirSync(DATA_DIR, { recursive: true });

const makeId = () =>
  typeof randomUUID === "function"
    ? randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    memo TEXT,
    display_mode TEXT,
    with_replacement INTEGER,
    cycle_number INTEGER DEFAULT 1,
    carry_memo INTEGER DEFAULT 0,
    default_class_name TEXT,
    default_period TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS students (
    id TEXT,
    session_id TEXT,
    full_name TEXT,
    first_name TEXT,
    last_name TEXT,
    class_name TEXT,
    period TEXT,
    status TEXT,
    calls INTEGER DEFAULT 0,
    called_this_cycle INTEGER DEFAULT 0,
    PRIMARY KEY (session_id, id),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cycle_memos (
    session_id TEXT,
    cycle_number INTEGER,
    memo TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (session_id, cycle_number),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
`);

function ensureColumn(table, column, definition) {
  const exists = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((row) => row.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("sessions", "cycle_number", "INTEGER DEFAULT 1");
ensureColumn("sessions", "carry_memo", "INTEGER DEFAULT 0");
ensureColumn("sessions", "default_class_name", "TEXT");
ensureColumn("sessions", "default_period", "TEXT");
ensureColumn("sessions", "groups", "TEXT DEFAULT '[]'");
ensureColumn("students", "class_name", "TEXT");
ensureColumn("students", "period", "TEXT");
ensureColumn("students", "called_this_cycle", "INTEGER DEFAULT 0");


const insertSession = db.prepare(`
  INSERT INTO sessions (id, memo, display_mode, with_replacement, cycle_number, carry_memo, default_class_name, default_period, groups, created_at, updated_at)
  VALUES (@id, @memo, @display_mode, @with_replacement, @cycle_number, @carry_memo, @default_class_name, @default_period, @groups, @now, @now)
  ON CONFLICT(id) DO UPDATE SET
    memo=excluded.memo,
    display_mode=excluded.display_mode,
    with_replacement=excluded.with_replacement,
    cycle_number=excluded.cycle_number,
    carry_memo=excluded.carry_memo,
    default_class_name=excluded.default_class_name,
    default_period=excluded.default_period,
    groups=excluded.groups,
    updated_at=excluded.updated_at
`);

const deleteStudentsForSession = db.prepare("DELETE FROM students WHERE session_id = ?");
const insertStudent = db.prepare(`
  INSERT INTO students (id, session_id, full_name, first_name, last_name, class_name, period, status, calls, called_this_cycle)
  VALUES (@id, @session_id, @full_name, @first_name, @last_name, @class_name, @period, @status, @calls, @called_this_cycle)
`);

const getSession = db.prepare("SELECT * FROM sessions WHERE id = ?");
const getStudentsForSession = db.prepare(
  "SELECT id, full_name, first_name, last_name, class_name, period, status, calls, called_this_cycle FROM students WHERE session_id = ? ORDER BY rowid ASC"
);
const deleteCycleMemosForSession = db.prepare("DELETE FROM cycle_memos WHERE session_id = ?");
const insertCycleMemo = db.prepare(
  "INSERT INTO cycle_memos (session_id, cycle_number, memo, created_at) VALUES (@session_id, @cycle_number, @memo, @created_at)"
);
const getCycleMemos = db.prepare(
  "SELECT cycle_number, memo, created_at FROM cycle_memos WHERE session_id = ? ORDER BY cycle_number ASC"
);

const saveSession = db.transaction(
  ({ sessionId, memo, displayMode, withReplacement, students, cycleNumber, memoHistory, carryMemo, defaults, groups }) => {
    const now = new Date().toISOString();
    const id = sessionId || makeId();
    insertSession.run({
      id,
      memo: memo || "",
      display_mode: displayMode || "full",
      with_replacement: withReplacement ? 1 : 0,
      cycle_number: Number.isInteger(cycleNumber) ? cycleNumber : 1,
      carry_memo: carryMemo ? 1 : 0,
      default_class_name: (defaults && defaults.className) || "",
      default_period: (defaults && defaults.period) || "",
      groups: JSON.stringify(Array.isArray(groups) ? groups : []),
      now,
    });

    deleteStudentsForSession.run(id);
    (students || []).forEach((student) => {
      insertStudent.run({
        id: student.id || makeId(),
        session_id: id,
        full_name: student.fullName || "",
        first_name: student.firstName || "",
        last_name: student.lastName || "",
        class_name: student.className || "",
        period: student.period || "",
        status: student.status || "pending",
        calls: Number.isFinite(student.calls) ? student.calls : 0,
        called_this_cycle: student.calledThisCycle ? 1 : 0,
      });
    });

    deleteCycleMemosForSession.run(id);
    (memoHistory || []).forEach((entry) => {
      if (!entry || entry.cycle == null) return;
      const cycleNum = Number(entry.cycle);
      if (!Number.isFinite(cycleNum)) return;
      insertCycleMemo.run({
        session_id: id,
        cycle_number: cycleNum,
        memo: entry.memo || "",
        created_at: now,
      });
    });

    return id;
  }
);

const aeriesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      || file.originalname.endsWith(".xlsx"));
  },
});

// Maps normalised column header → internal field name.
// Fields starting with "_" are recognised but not used for student data.
const AERIES_HEADER_MAP = {
  lastname: "last", last: "last", lname: "last",
  firstname: "first", first: "first", fname: "first",
  // "Student Name" column (Aeries attendance roster format: "Last, First MI")
  studentname: "full", student: "full", name: "full", fullname: "full",
  per: "period", period: "period", pd: "period",
  course: "className", coursename: "className", coursetitle: "className",
  coursedescription: "className", description: "className",
  class: "className", classname: "className",
  stunum: "_id", studentnumber: "_id", studentid: "_id", perm: "_id", permid: "_id",
  gr: "_skip", grade: "_skip", grd: "_skip", gradelevel: "_skip",
  sex: "_skip", gender: "_skip",
};
// Header row must have at least this many recognised columns AND at least one name column.
const NAME_FIELDS = new Set(["full", "first", "last"]);

function normalizeCol(s) {
  return String(s || "").toLowerCase().replace(/[^a-z]/g, "");
}

// Extract just the period number from Aeries strings like "2 9:34AM-10:36AM" or "Period 3".
function extractPeriod(raw) {
  const m = String(raw).match(/\b(\d+)\b/);
  return m ? m[1] : String(raw).trim();
}

function parseAeriesBuffer(buffer, defaults = {}) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No worksheets found in file.");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });

  // State machine: walk every row once, updating class context whenever the
  // Aeries label row (Period | Course Title | …) is encountered and collecting
  // students in between.  This handles any number of classes in a single file.
  const students = [];
  let currentPeriod = defaults.period || "";
  let currentClassName = defaults.className || "";
  let studentFieldMap = null; // non-null once we've seen a student header row

  let i = 0;
  while (i < rows.length) {
    const row = rows[i];

    // ── Detect class metadata label row ─────────────────────────────────────
    // Aeries label rows have BOTH "Period" and a course-name column in the same
    // row (e.g. "Course Title", "Course", …).  We require both so we don't
    // accidentally match a student header row that happens to have "Period".
    const periodLabelIdx = row.findIndex((c) => normalizeCol(c) === "period");
    const courseLabelIdx = row.findIndex((c) =>
      ["coursetitle", "course", "coursename", "coursedescription"].includes(normalizeCol(c))
    );

    if (periodLabelIdx !== -1 && courseLabelIdx !== -1) {
      // The very next row contains the actual values for this class.
      const valueRow = rows[i + 1] || [];
      const rawPeriod = String(valueRow[periodLabelIdx] || "").trim();
      const rawClass = String(valueRow[courseLabelIdx] || "").trim();
      if (rawPeriod) currentPeriod = extractPeriod(rawPeriod);
      if (rawClass) currentClassName = rawClass;
      // Reset student header — each class block has its own header row.
      studentFieldMap = null;
      i += 2; // consume label row + value row
      continue;
    }

    // ── Detect student column header row ─────────────────────────────────────
    // Must contain at least one name-type column (full / first / last) so we
    // don't confuse it with the class metadata label row above.
    const candidate = {};
    let hits = 0;
    let hasName = false;
    row.forEach((cell, colIdx) => {
      const field = AERIES_HEADER_MAP[normalizeCol(cell)];
      if (field) {
        hits++;
        if (!field.startsWith("_")) {
          candidate[colIdx] = field;
          if (NAME_FIELDS.has(field)) hasName = true;
        }
      }
    });
    if (hits >= 2 && hasName) {
      studentFieldMap = candidate;
      i++;
      continue;
    }

    // ── Parse a student data row ──────────────────────────────────────────────
    if (studentFieldMap && row.some((c) => String(c).trim() !== "")) {
      const get = (field) => {
        for (const [colIdx, f] of Object.entries(studentFieldMap)) {
          if (f === field) return String(row[colIdx] || "").trim();
        }
        return "";
      };

      let first = get("first").replace(/^\*+/, "").trim();
      let last  = get("last").replace(/^\*+/, "").trim();
      let full  = get("full").replace(/^\*+/, "").trim();
      const className = get("className") || currentClassName;
      const period    = get("period")    || currentPeriod;

      // "Last, First MI" combined column → split and strip middle initial
      if (full && !first && !last) {
        if (full.includes(",")) {
          [last, first] = full.split(",").map((s) => s.trim());
          first = first.replace(/\s+[A-Z]\.?$/, "").trim();
          full = `${first} ${last}`.trim();
        }
      } else if (first || last) {
        full = `${first} ${last}`.trim();
      }

      if (full || first || last) {
        students.push({
          id: makeId(),
          firstName: first,
          lastName: last,
          fullName: full || `${first} ${last}`.trim(),
          className,
          period,
          status: "pending",
          calls: 0,
          calledThisCycle: false,
        });
      }
    }

    i++;
  }

  if (!students.length) {
    throw new Error("Could not find a recognised Aeries header row. Make sure this is a standard class roster export.");
  }

  // Group by period + className so the client can present a picker
  const classMap = new Map();
  for (const student of students) {
    const key = `${student.period}|||${student.className}`;
    if (!classMap.has(key)) {
      classMap.set(key, { period: student.period, className: student.className, students: [] });
    }
    classMap.get(key).students.push(student);
  }

  return Array.from(classMap.values());
}

app.use(express.json({ limit: "5mb" }));
// Serve only known front-end files — prevents /data/colderCall.sqlite exposure
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/app.js", (_req, res) => res.sendFile(path.join(__dirname, "app.js")));
app.get("/styles.css", (_req, res) => res.sendFile(path.join(__dirname, "styles.css")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (_req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || "" });
});

app.post("/api/parse/aeries", aeriesUpload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded or file is not an XLSX." });
  }
  const defaults = {
    className: (req.body && req.body.defaultClassName) || "",
    period: (req.body && req.body.defaultPeriod) || "",
  };
  try {
    const classes = parseAeriesBuffer(req.file.buffer, defaults);
    res.json({ classes });
  } catch (err) {
    console.error("Aeries parse failed", err);
    res.status(422).json({ error: err.message });
  }
});

app.post("/api/session", (req, res) => {
  const {
    memo = "",
    displayMode = "full",
    withReplacement = false,
    students = [],
    sessionId,
    cycleNumber = 1,
    memoHistory = [],
    carryMemo = false,
    defaults = { className: "", period: "" },
    groups = [],
  } = req.body || {};

  if (!Array.isArray(students)) {
    return res.status(400).json({ error: "students must be an array" });
  }

  try {
    const id = saveSession({
      sessionId,
      memo,
      displayMode,
      withReplacement,
      students,
      cycleNumber,
      memoHistory,
      carryMemo,
      defaults,
      groups,
    });
    res.json({ sessionId: id });
  } catch (error) {
    console.error("Failed to save session", error);
    res.status(500).json({ error: "Failed to save session" });
  }
});

app.get("/api/session/:id", (req, res) => {
  const session = getSession.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  const students = getStudentsForSession.all(req.params.id);
  const memos = getCycleMemos.all(req.params.id);
  res.json({
    sessionId: session.id,
    memo: session.memo,
    displayMode: session.display_mode,
    withReplacement: Boolean(session.with_replacement),
    cycleNumber: session.cycle_number || 1,
    carryMemo: Boolean(session.carry_memo),
    defaults: {
      className: session.default_class_name || "",
      period: session.default_period || "",
    },
    groups: JSON.parse(session.groups || "[]"),
    memoHistory: memos.map((row) => ({
      cycle: row.cycle_number,
      memo: row.memo,
      createdAt: row.created_at,
    })),
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    students,
  });
});


app.listen(PORT, () => {
  console.log(`colderCall server running at http://localhost:${PORT}`);
});
