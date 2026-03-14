require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const Database = require("better-sqlite3");
const multer = require("multer");
const ExcelJS = require("exceljs");

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
ensureColumn("students", "class_name", "TEXT");
ensureColumn("students", "period", "TEXT");
ensureColumn("students", "called_this_cycle", "INTEGER DEFAULT 0");


const insertSession = db.prepare(`
  INSERT INTO sessions (id, memo, display_mode, with_replacement, cycle_number, carry_memo, default_class_name, default_period, created_at, updated_at)
  VALUES (@id, @memo, @display_mode, @with_replacement, @cycle_number, @carry_memo, @default_class_name, @default_period, @now, @now)
  ON CONFLICT(id) DO UPDATE SET
    memo=excluded.memo,
    display_mode=excluded.display_mode,
    with_replacement=excluded.with_replacement,
    cycle_number=excluded.cycle_number,
    carry_memo=excluded.carry_memo,
    default_class_name=excluded.default_class_name,
    default_period=excluded.default_period,
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
  ({ sessionId, memo, displayMode, withReplacement, students, cycleNumber, memoHistory, carryMemo, defaults }) => {
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

const AERIES_HEADER_MAP = {
  lastname: "last", last: "last", lname: "last",
  firstname: "first", first: "first", fname: "first",
  studentname: "full", student: "full", name: "full", fullname: "full",
  per: "period", period: "period", pd: "period",
  course: "className", coursename: "className", coursetitle: "className",
  coursedescription: "className", description: "className",
  class: "className", classname: "className",
  stunum: "_id", studentnumber: "_id", studentid: "_id", perm: "_id", permid: "_id",
  grade: "_skip", grd: "_skip", gradelevel: "_skip", sex: "_skip", gender: "_skip",
};
const AERIES_HEADER_THRESHOLD = 2;

function normalizeCol(s) {
  return String(s || "").toLowerCase().replace(/[^a-z]/g, "");
}

async function parseAeriesBuffer(buffer, defaults = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("No worksheets found in file.");

  // Collect all rows as string arrays
  const rows = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const cells = [];
    for (let c = 1; c <= worksheet.columnCount; c++) {
      cells.push(String(row.getCell(c).text || "").trim());
    }
    rows.push(cells);
  });

  // Find header row in first 10 rows
  let headerRowIdx = -1;
  let fieldMap = {};
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const candidate = {};
    let hits = 0;
    rows[r].forEach((cell, colIdx) => {
      const field = AERIES_HEADER_MAP[normalizeCol(cell)];
      if (field) {
        hits++;
        if (!field.startsWith("_")) candidate[colIdx] = field;
      }
    });
    if (hits >= AERIES_HEADER_THRESHOLD) {
      headerRowIdx = r;
      fieldMap = candidate;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error("Could not find a recognised Aeries header row. Make sure this is a standard class roster export.");
  }

  const get = (row, field) => {
    for (const [colIdx, f] of Object.entries(fieldMap)) {
      if (f === field) return row[colIdx] || "";
    }
    return "";
  };

  const students = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((c) => c === "")) continue;

    let first = get(row, "first");
    let last = get(row, "last");
    let full = get(row, "full");
    const className = get(row, "className") || defaults.className || "";
    const period = get(row, "period") || defaults.period || "";

    // Handle "Last, First" combined column
    if (full && !first && !last) {
      if (full.includes(",")) {
        [last, first] = full.split(",").map((s) => s.trim());
        full = `${first} ${last}`.trim();
      }
    } else if (first || last) {
      full = `${first} ${last}`.trim();
    }

    if (!full && !first && !last) continue;

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

  return students;
}

app.use(express.json({ limit: "5mb" }));
// Serve only known front-end files — prevents /data/colderCall.sqlite exposure
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/app.js", (_req, res) => res.sendFile(path.join(__dirname, "app.js")));
app.get("/styles.css", (_req, res) => res.sendFile(path.join(__dirname, "styles.css")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, dbPath: DB_PATH });
});

app.get("/api/config", (_req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || "" });
});

app.post("/api/parse/aeries", aeriesUpload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded or file is not an XLSX." });
  }
  const defaults = {
    className: (req.body && req.body.defaultClassName) || "",
    period: (req.body && req.body.defaultPeriod) || "",
  };
  try {
    const students = await parseAeriesBuffer(req.file.buffer, defaults);
    res.json({ students });
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
