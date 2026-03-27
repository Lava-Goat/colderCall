const storageKey = "colderCall-state-v1";

const elements = {
  rosterUpload: document.getElementById("rosterUpload"),
  aeriesUpload: document.getElementById("aeriesUpload"),
  aeriesClassPicker: document.getElementById("aeriesClassPicker"),
  aeriesClassList: document.getElementById("aeriesClassList"),
  addStudent: document.getElementById("addStudent"),
  firstNameInput: document.getElementById("firstNameInput"),
  lastNameInput: document.getElementById("lastNameInput"),
  classNameInput: document.getElementById("classNameInput"),
  periodInput: document.getElementById("periodInput"),
  defaultClassName: document.getElementById("defaultClassName"),
  defaultPeriod: document.getElementById("defaultPeriod"),
  classroomConfig: document.getElementById("classroomConfig"),
  classroomReady: document.getElementById("classroomReady"),
  clientIdInput: document.getElementById("clientIdInput"),
  saveClientId: document.getElementById("saveClientId"),
  classroomChangeId: document.getElementById("classroomChangeId"),
  classroomSignIn: document.getElementById("classroomSignIn"),
  classroomSignOut: document.getElementById("classroomSignOut"),
  classroomPickerRow: document.getElementById("classroomPickerRow"),
  classroomCoursePicker: document.getElementById("classroomCoursePicker"),
  classroomApiImport: document.getElementById("classroomApiImport"),
  classroomStatus: document.getElementById("classroomStatus"),
  displayMode: document.getElementById("displayMode"),
  memo: document.getElementById("memo"),
  carryMemo: document.getElementById("carryMemo"),
  withReplacement: document.getElementById("withReplacement"),
  resetCycle: document.getElementById("resetCycle"),
  clearRoster: document.getElementById("clearRoster"),
  pickStudent: document.getElementById("pickStudent"),
  skipStudent: document.getElementById("skipStudent"),
  poolInfo: document.getElementById("poolInfo"),
  currentStudentName: document.getElementById("currentStudentName"),
  currentStatus: document.getElementById("currentStatus"),
  currentStudentCallout: document.getElementById("currentStudentCallout"),
  statusButtons: document.getElementById("statusButtons"),
  studentTable: document.getElementById("studentTable"),
  exportCsv: document.getElementById("exportCsv"),
  exportDb: document.getElementById("exportDb"),
  importDb: document.getElementById("importDb"),
  importDbFile: document.getElementById("importDbFile"),
  exportCycleCsv: document.getElementById("exportCycleCsv"),
  loadServer: document.getElementById("loadServer"),
  serverStatus: document.getElementById("serverStatus"),
  cycleInfo: document.getElementById("cycleInfo"),
  undoButton: document.getElementById("undoButton"),
  popOut: document.getElementById("popOut"),
  filterButtons: document.getElementById("filterButtons"),
  groupNameInput: document.getElementById("groupNameInput"),
  createGroupBtn: document.getElementById("createGroupBtn"),
  groupList: document.getElementById("groupList"),
};

const state = {
  students: [],
  currentId: null,
  withReplacement: false,
  displayMode: "full",
  memo: "",
  sessionId: null,
  memoHistory: [],
  cycleNumber: 1,
  carryMemo: false,
  defaults: {
    className: "",
    period: "",
  },
  groups: [],
  activeFilter: { type: "all" },
  callLog: [],
};

let unsavedChanges = false;

// Theme toggle — persists in localStorage, overrides prefers-color-scheme
const THEME_KEY = "colderCall-theme";
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = theme === "dark" ? "🌙" : "☀️";
}
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (systemDark ? "dark" : "light"));
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}
initTheme();

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
const historyStack = [];
const HISTORY_LIMIT = 30;
let tableSort = { col: null, dir: "asc" };
const windowId = randomId();
const isPopoutMode = new URLSearchParams(window.location.search).get("popout") === "1";
let popoutWindow = null;
let channel = null;
let applyingRemote = false;

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function randomId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Strip legacy UUID-format session IDs (server now uses adjective-noun IDs)
function sanitizeSessionId(id) {
  if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id)) return null;
  return id || null;
}

function snapshotState() {
  return JSON.parse(
    JSON.stringify({
      students: state.students,
      currentId: state.currentId,
      withReplacement: state.withReplacement,
      displayMode: state.displayMode,
      memo: state.memo,
      sessionId: state.sessionId,
      memoHistory: state.memoHistory,
      cycleNumber: state.cycleNumber,
      carryMemo: state.carryMemo,
      defaults: state.defaults,
      groups: state.groups,
      activeFilter: state.activeFilter,
      callLog: state.callLog,
    })
  );
}

function pushHistory() {
  historyStack.push(snapshotState());
  if (historyStack.length > HISTORY_LIMIT) {
    historyStack.shift();
  }
}

function persistState() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    if (channel && !applyingRemote) {
      channel.postMessage({ type: "stateUpdate", windowId, payload: snapshotState() });
    }
  } catch (error) {
    console.warn("Unable to save state", error);
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;
    const data = JSON.parse(saved);
    state.students = Array.isArray(data.students) ? data.students : [];
    state.currentId = data.currentId || null;
    state.withReplacement = Boolean(data.withReplacement);
    state.displayMode = data.displayMode || "full";
    state.memo = data.memo || "";
    state.sessionId = sanitizeSessionId(data.sessionId);
    state.memoHistory = Array.isArray(data.memoHistory) ? data.memoHistory : [];
    state.cycleNumber = Number.isInteger(data.cycleNumber) ? data.cycleNumber : 1;
    state.carryMemo = Boolean(data.carryMemo);
    state.defaults = {
      className: (data.defaults && data.defaults.className) || "",
      period: (data.defaults && data.defaults.period) || "",
    };
    state.groups = Array.isArray(data.groups) ? data.groups : [];
    state.activeFilter = data.activeFilter || { type: "all" };
    unsavedChanges = false;
    historyStack.length = 0;
    historyStack.push(snapshotState());
  } catch (error) {
    console.warn("Unable to load state", error);
  }
}

function markDirty() {
  unsavedChanges = true;
  renderServerSaveStatus();
}

function undoLastChange() {
  const snapshot = historyStack.pop();
  if (!snapshot) {
    alert("No more steps to undo.");
    return;
  }
  Object.assign(state, snapshot);
  unsavedChanges = true;
  persistState();
  render();
}

function openPopout() {
  if (isPopoutMode) {
    if (channel) channel.postMessage({ type: "popout-closed", windowId });
    window.close();
    return;
  }
  if (popoutWindow && !popoutWindow.closed) {
    popoutWindow.focus();
    return;
  }
  const url = `${window.location.origin}${window.location.pathname}?popout=1`;
  popoutWindow = window.open(url, "colderCallPopout", "width=520,height=760");
  document.body.classList.add("popout-detached");
  if (channel) channel.postMessage({ type: "popout-opened", windowId });
}

function formatName(student) {
  const first = student.firstName || "";
  const last = student.lastName || "";
  const full = student.fullName || `${first} ${last}`.trim();
  switch (state.displayMode) {
    case "first":
      return first || full || "(no name)";
    case "last":
      return last || full || "(no name)";
    case "firstLastInitial":
      return last
        ? `${first || full} ${last.charAt(0).toUpperCase()}.`.trim()
        : first || full || "(no name)";
    default:
      return full || "(no name)";
  }
}

function statusLabel(status) {
  switch (status) {
    case "correct":
      return "Correct";
    case "incorrect":
      return "Incorrect";
    case "pass":
      return "Pass";
    case "absent":
      return "Absent";
    case "pending":
    default:
      return "Pending";
  }
}

function statusClass(status) {
  switch (status) {
    case "correct":
      return "success";
    case "incorrect":
      return "warn";
    case "pass":
      return "muted";
    case "absent":
      return "danger";
    default:
      return "";
  }
}

function deriveFromFull(full) {
  if (!full) {
    return { full: "", first: "", last: "" };
  }
  let cleaned = full.trim();
  if (cleaned.includes(",")) {
    const [last, first] = cleaned.split(",").map((p) => p.trim());
    return { full: `${first} ${last}`.trim(), first, last };
  }
  const parts = cleaned.split(/\s+/);
  const first = parts.shift() || "";
  const last = parts.length ? parts.join(" ") : "";
  return { full: cleaned, first, last };
}

function normalizeHeader(header = "") {
  return header.toLowerCase().replace(/[^a-z]/g, "");
}

function splitCsvLine(line = "") {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function getDefaults() {
  return {
    className: (elements.defaultClassName?.value || state.defaults.className || "").trim(),
    period: (elements.defaultPeriod?.value || state.defaults.period || "").trim(),
  };
}

function parseCsv(text, opts = {}) {
  const { source = "generic" } = opts;
  const rows = text
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean);
  if (!rows.length) return [];

  const firstRow = splitCsvLine(rows[0]);
  const headersPresent =
    source === "classroom" ||
    firstRow.some((cell) => {
      const key = normalizeHeader(cell);
      return ["firstname", "first", "fname", "lastname", "last", "lname", "fullname", "name", "student", "studentname", "email", "emailaddress"].includes(
        key
      );
    });

  let headerIndexes = { first: null, last: null, full: null, className: null, period: null };
  let startIndex = 0;

  if (headersPresent) {
    firstRow.forEach((cell, index) => {
      const key = normalizeHeader(cell);
      if (["firstname", "first", "fname"].includes(key)) headerIndexes.first = index;
      if (["lastname", "last", "lname"].includes(key)) headerIndexes.last = index;
      if (["fullname", "name", "student", "studentname"].includes(key)) headerIndexes.full = index;
      if (["classname", "class", "course", "coursename", "coursetitle", "coursedescription", "description"].includes(key)) headerIndexes.className = index;
      if (["period", "per", "pd", "section"].includes(key)) headerIndexes.period = index;
      if (source === "classroom" && key === "section") headerIndexes.period = index;
    });
    startIndex = 1;
  }

  const parsed = [];
  const defaults = getDefaults();

  for (let i = startIndex; i < rows.length; i++) {
    const cells = splitCsvLine(rows[i]);
    const guessedFull = headerIndexes.full != null ? cells[headerIndexes.full] || "" : "";
    const guessedFirst = headerIndexes.first != null ? cells[headerIndexes.first] || "" : "";
    const guessedLast = headerIndexes.last != null ? cells[headerIndexes.last] || "" : "";
    const guessedClassName =
      headerIndexes.className != null ? cells[headerIndexes.className] || defaults.className : defaults.className;
    const guessedPeriod =
      headerIndexes.period != null ? cells[headerIndexes.period] || defaults.period : defaults.period;

    let full = guessedFull;
    let first = guessedFirst;
    let last = guessedLast;
    let className = guessedClassName;
    let period = guessedPeriod;

    if (!headersPresent) {
      if (cells.length >= 3) {
        // Assume first, last, class
        first = cells[0];
        last = cells[1];
        className = cells[2] || className;
        period = cells[3] || period;
      } else if (cells.length >= 2) {
        first = cells[0];
        last = cells[1];
      } else if (cells.length === 1) {
        full = cells[0];
      }
    }

    if (!full) {
      const derived = deriveFromFull(`${first} ${last}`.trim());
      full = derived.full;
      first = first || derived.first;
      last = last || derived.last;
    } else {
      const derived = deriveFromFull(full);
      first = first || derived.first;
      last = last || derived.last;
      full = derived.full;
    }

    const student = {
      id: randomId(),
      firstName: first.trim(),
      lastName: last.trim(),
      fullName: full.trim(),
      className: className.trim(),
      period: period.trim(),
      status: "pending",
      calls: 0,
      calledThisCycle: false,
    };

    if (student.fullName || student.firstName || student.lastName) {
      parsed.push(student);
    }
  }

  return parsed;
}

function addStudents(newStudents = []) {
  if (!newStudents.length) return;
  pushHistory();
  state.students = state.students.concat(newStudents);
  markDirty();
  persistState();
  render();
}

function handleRosterUpload(event) {
  const [file] = event.target.files;
  if (!file) return;
  file
    .text()
    .then((text) => {
      const parsed = parseCsv(text);
      if (!parsed.length) {
        alert("No students found in that CSV.");
        return;
      }
      addStudents(parsed);
    })
    .catch(() => {
      alert("Unable to read that file.");
    })
    .finally(() => {
      event.target.value = "";
    });
}

function showAeriesClassPicker(classes) {
  elements.aeriesClassList.innerHTML = "";
  const checkboxes = [];

  // Header controls row
  const header = document.createElement("div");
  header.className = "field-inline";
  header.style.cssText = "margin-bottom:8px;align-items:center;flex-wrap:wrap;";

  const selectAllBtn = document.createElement("button");
  selectAllBtn.className = "ghost";
  selectAllBtn.textContent = "Select all";
  let allSelected = false;
  selectAllBtn.addEventListener("click", () => {
    allSelected = !allSelected;
    checkboxes.forEach((cb) => { cb.checked = allSelected; });
    selectAllBtn.textContent = allSelected ? "Deselect all" : "Select all";
  });

  const importSelBtn = document.createElement("button");
  importSelBtn.className = "primary";
  importSelBtn.textContent = "Import selected";
  importSelBtn.addEventListener("click", () => {
    const selected = classes.filter((_, i) => checkboxes[i].checked);
    if (!selected.length) { alert("Select at least one class."); return; }
    addStudents(selected.flatMap((cls) => cls.students));
    elements.aeriesClassPicker.style.display = "none";
    elements.aeriesClassList.innerHTML = "";
  });

  header.appendChild(selectAllBtn);
  header.appendChild(importSelBtn);
  elements.aeriesClassList.appendChild(header);

  // One row per class
  classes.forEach((cls) => {
    const row = document.createElement("div");
    row.className = "aeries-class-row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.style.cssText = "width:16px;height:16px;flex-shrink:0;cursor:pointer;";
    checkboxes.push(cb);

    const label = document.createElement("span");
    label.textContent = `Per ${cls.period} — ${cls.className} (${cls.students.length} students)`;
    label.style.flex = "1";

    const btn = document.createElement("button");
    btn.className = "ghost";
    btn.textContent = "Import";
    btn.addEventListener("click", () => {
      addStudents(cls.students);
      elements.aeriesClassPicker.style.display = "none";
      elements.aeriesClassList.innerHTML = "";
    });

    row.appendChild(cb);
    row.appendChild(label);
    row.appendChild(btn);
    elements.aeriesClassList.appendChild(row);
  });

  elements.aeriesClassPicker.style.display = "";
}

async function handleAeriesUpload(event) {
  const [file] = event.target.files;
  if (!file) return;
  event.target.disabled = true;
  elements.aeriesClassPicker.style.display = "none";
  const defaults = getDefaults();
  try {
    const form = new FormData();
    form.append("file", file);
    form.append("defaultClassName", defaults.className);
    form.append("defaultPeriod", defaults.period);
    const res = await fetch("/api/parse/aeries", { method: "POST", body: form });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || "Server error");
    if (!payload.classes || !payload.classes.length) {
      alert("No students found in that Aeries file. Check that it is a standard class roster export.");
      return;
    }
    if (payload.classes.length === 1) {
      addStudents(payload.classes[0].students);
    } else {
      showAeriesClassPicker(payload.classes);
    }
  } catch (err) {
    alert(`Unable to import Aeries file: ${err.message}`);
  } finally {
    event.target.value = "";
    event.target.disabled = false;
  }
}

let classroomToken = null;
let googleClientId = "";

async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    const data = await res.json();
    googleClientId = data.googleClientId || "";
  } catch (_) {}
  updateClassroomConfigUI();
}

function updateClassroomConfigUI() {
  const configured = Boolean(googleClientId);
  elements.classroomConfig.style.display = configured ? "none" : "";
  elements.classroomReady.style.display = configured ? "" : "none";
}

async function saveGoogleClientId() {
  const id = (elements.clientIdInput.value || "").trim();
  if (!id) { alert("Please enter a Client ID."); return; }
  elements.saveClientId.disabled = true;
  try {
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ googleClientId: id }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to save");
    googleClientId = id;
    elements.clientIdInput.value = "";
    updateClassroomConfigUI();
  } catch (err) {
    alert("Could not save Client ID: " + err.message);
  } finally {
    elements.saveClientId.disabled = false;
  }
}

async function classroomGet(endpoint, params = {}) {
  const url = new URL(`https://classroom.googleapis.com/v1/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${classroomToken}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Classroom API error (${res.status}): ${text}`);
  }
  return res.json();
}

function classroomSignIn() {
  const client = google.accounts.oauth2.initTokenClient({
    client_id: googleClientId,
    scope: "https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.courses.readonly",
    callback: async (tokenResponse) => {
      if (tokenResponse.error) {
        elements.classroomStatus.textContent = `Sign-in failed: ${tokenResponse.error}`;
        return;
      }
      classroomToken = tokenResponse.access_token;
      elements.classroomSignIn.style.display = "none";
      elements.classroomSignOut.style.display = "";
      elements.classroomStatus.textContent = "Loading courses…";
      await loadClassroomCourses();
    },
  });
  client.requestAccessToken();
}

function classroomSignOut() {
  if (classroomToken) {
    google.accounts.oauth2.revoke(classroomToken, () => {});
  }
  classroomToken = null;
  elements.classroomSignIn.style.display = "";
  elements.classroomSignOut.style.display = "none";
  elements.classroomPickerRow.style.display = "none";
  elements.classroomCoursePicker.innerHTML = '<option value="">— select a course —</option>';
  elements.classroomApiImport.disabled = true;
  elements.classroomStatus.textContent = "";
}

async function loadClassroomCourses() {
  try {
    let allCourses = [];
    let pageToken;
    do {
      const data = await classroomGet("courses", { courseStates: "ACTIVE", pageToken, pageSize: 50 });
      allCourses = allCourses.concat(data.courses || []);
      pageToken = data.nextPageToken;
    } while (pageToken);

    elements.classroomCoursePicker.innerHTML = '<option value="">— select a course —</option>';
    allCourses.forEach((course) => {
      const opt = document.createElement("option");
      opt.value = course.id;
      opt.textContent = course.section ? `${course.name} (${course.section})` : course.name;
      opt.dataset.name = course.name;
      opt.dataset.section = course.section || "";
      elements.classroomCoursePicker.appendChild(opt);
    });
    elements.classroomPickerRow.style.display = "";
    elements.classroomStatus.textContent = `${allCourses.length} course${allCourses.length === 1 ? "" : "s"} found`;
  } catch (error) {
    console.error("Failed to load courses", error);
    elements.classroomStatus.textContent = "Failed to load courses. Try signing in again.";
    classroomSignOut();
  }
}

async function importClassroomApi() {
  const courseId = elements.classroomCoursePicker.value;
  if (!courseId) {
    alert("Please select a course first.");
    return;
  }
  const selectedOption = elements.classroomCoursePicker.selectedOptions[0];
  const courseName = selectedOption?.dataset.name || "";
  const courseSection = selectedOption?.dataset.section || "";

  elements.classroomApiImport.disabled = true;
  elements.classroomApiImport.textContent = "Importing…";
  try {
    let allStudents = [];
    let pageToken;
    do {
      const data = await classroomGet(`courses/${courseId}/students`, { pageToken, pageSize: 100 });
      allStudents = allStudents.concat(data.students || []);
      pageToken = data.nextPageToken;
    } while (pageToken);

    const mapped = allStudents.map((s) => ({
      id: s.userId || randomId(),
      fullName: s.profile?.name?.fullName || "",
      firstName: s.profile?.name?.givenName || "",
      lastName: s.profile?.name?.familyName || "",
      className: courseName,
      period: courseSection,
      status: "pending",
      calls: 0,
      calledThisCycle: false,
    }));

    if (mapped.length) {
      addStudents(mapped);
      if (!state.defaults.className && courseName) {
        state.defaults.className = courseName;
        elements.defaultClassName.value = courseName;
        markDirty();
        persistState();
      }
      if (!state.defaults.period && courseSection) {
        state.defaults.period = courseSection;
        elements.defaultPeriod.value = courseSection;
        markDirty();
        persistState();
      }
      elements.classroomStatus.textContent = `Imported ${mapped.length} students from ${courseName}`;
    } else {
      alert("No students returned from Classroom.");
    }
  } catch (error) {
    console.error("Classroom import failed", error);
    elements.classroomStatus.textContent = "Import failed. Try signing in again.";
  } finally {
    elements.classroomApiImport.disabled = false;
    elements.classroomApiImport.textContent = "Import roster";
  }
}

function getActivePool() {
  let students = state.students.filter((s) => s.status !== "absent");
  const f = state.activeFilter;
  if (!f || f.type === "all") return students;
  if (f.type === "class") {
    students = students.filter((s) => `${s.period}|||${s.className}` === f.key);
  } else if (f.type === "group-include") {
    const group = state.groups.find((g) => g.id === f.groupId);
    if (group) {
      const ids = new Set(group.studentIds);
      students = students.filter((s) => ids.has(s.id));
    }
  } else if (f.type === "group-exclude") {
    const group = state.groups.find((g) => g.id === f.groupId);
    if (group) {
      const ids = new Set(group.studentIds);
      students = students.filter((s) => !ids.has(s.id));
    }
  }
  return students;
}

function renderPoolInfo() {
  const pool = getActivePool();
  const total = state.students.length;
  const mode = state.withReplacement ? "with replacement" : "no repeats this cycle";
  if (!total) {
    elements.poolInfo.textContent = "No roster loaded";
    return;
  }
  const f = state.activeFilter;
  let filterLabel = "";
  if (f && f.type === "class") {
    const [period, className] = f.key.split("|||");
    const parts = [className, period && `Per ${period}`].filter(Boolean);
    filterLabel = ` · ${parts.join(" ")}`;
  } else if (f && (f.type === "group-include" || f.type === "group-exclude")) {
    const group = state.groups.find((g) => g.id === f.groupId);
    if (group) filterLabel = ` · ${f.type === "group-exclude" ? "excl. " : ""}${group.name}`;
  }
  elements.poolInfo.textContent = `${pool.length} in pool${filterLabel} · ${mode}`;
}

function renderCurrentStudent() {
  const student = state.students.find((s) => s.id === state.currentId);
  if (!student) {
    elements.currentStudentName.textContent = "No one selected";
    elements.currentStatus.textContent = "Waiting to pick";
    return;
  }
  elements.currentStudentName.textContent = formatName(student);
  const classBits = [student.className, student.period].filter(Boolean).join(" · ");
  const statusText = `${statusLabel(student.status)} · ${student.calls} call${
    student.calls === 1 ? "" : "s"
  }`;
  elements.currentStatus.textContent = classBits ? `${statusText} · ${classBits}` : statusText;
}

const STATUS_ORDER = { correct: 0, incorrect: 1, pass: 2, absent: 3, pending: 4 };

function getSortValue(student, col) {
  switch (col) {
    case "name": return formatName(student).toLowerCase();
    case "class": return (student.className || "").toLowerCase();
    case "period": {
      const n = parseInt(student.period, 10);
      return isNaN(n) ? (student.period || "").toLowerCase() : n;
    }
    case "status": return STATUS_ORDER[student.status] ?? 5;
    case "calls": return student.calls || 0;
    default: return "";
  }
}

function renderTableHeaders() {
  document.querySelectorAll("#classListPanel th[data-sort-col]").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.sortCol === tableSort.col) {
      th.classList.add(tableSort.dir === "asc" ? "sort-asc" : "sort-desc");
    }
  });
}

function renderStudents() {
  let students = [...state.students];
  if (tableSort.col) {
    students.sort((a, b) => {
      const av = getSortValue(a, tableSort.col);
      const bv = getSortValue(b, tableSort.col);
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return tableSort.dir === "asc" ? cmp : -cmp;
    });
  }

  // Pre-build group membership map to avoid O(n²) includes() inside the loop.
  const studentGroups = new Map();
  for (const group of state.groups) {
    for (const sid of group.studentIds) {
      if (!studentGroups.has(sid)) studentGroups.set(sid, []);
      studentGroups.get(sid).push(group);
    }
  }

  const fragment = document.createDocumentFragment();
  students.forEach((student) => {
    const tr = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = formatName(student);
    tr.appendChild(nameCell);

    const classCell = document.createElement("td");
    classCell.textContent = student.className || "—";
    tr.appendChild(classCell);

    const periodCell = document.createElement("td");
    periodCell.textContent = student.period || "—";
    tr.appendChild(periodCell);

    const statusCell = document.createElement("td");
    statusCell.textContent = statusLabel(student.status);
    statusCell.className = statusClass(student.status);
    tr.appendChild(statusCell);

    const callsCell = document.createElement("td");
    callsCell.textContent = student.calls || 0;
    tr.appendChild(callsCell);

    const lastOutcomeCell = document.createElement("td");
    lastOutcomeCell.textContent = student.status === "pending" ? "—" : statusLabel(student.status);
    tr.appendChild(lastOutcomeCell);

    // Groups column
    const groupsCell = document.createElement("td");
    const memberOf = studentGroups.get(student.id) || [];
    const memberIds = new Set(memberOf.map((g) => g.id));
    memberOf.forEach((g) => {
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.style.cssText = "margin-right:4px;display:inline-flex;align-items:center;gap:3px;font-size:11px;padding:3px 6px;";
      const label = document.createTextNode(g.name);
      pill.appendChild(label);
      const xBtn = document.createElement("button");
      xBtn.style.cssText = "padding:0 2px;min-width:0;font-size:11px;background:none;border:none;cursor:pointer;color:var(--danger);font-weight:700;line-height:1;";
      xBtn.textContent = "×";
      xBtn.dataset.action = "remove-from-group";
      xBtn.dataset.id = student.id;
      xBtn.dataset.groupId = g.id;
      xBtn.title = `Remove from ${g.name}`;
      pill.appendChild(xBtn);
      groupsCell.appendChild(pill);
    });
    const notMember = state.groups.filter((g) => !memberIds.has(g.id));
    if (notMember.length > 0) {
      const addSel = document.createElement("select");
      addSel.style.cssText = "font-size:12px;padding:2px 4px;border-radius:6px;max-width:120px;";
      addSel.dataset.action = "add-to-group";
      addSel.dataset.id = student.id;
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "+ Group";
      addSel.appendChild(placeholder);
      notMember.forEach((g) => {
        const opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = g.name;
        addSel.appendChild(opt);
      });
      groupsCell.appendChild(addSel);
    }
    tr.appendChild(groupsCell);

    // Actions column
    const actionsCell = document.createElement("td");
    const actionsRow = document.createElement("div");
    actionsRow.className = "actions-row";

    const absentBtn = document.createElement("button");
    absentBtn.className = student.status === "absent" ? "ghost success" : "ghost";
    absentBtn.dataset.action = "toggle-absent";
    absentBtn.dataset.id = student.id;
    absentBtn.textContent = student.status === "absent" ? "Present" : "Absent";
    actionsRow.appendChild(absentBtn);

    const editNameBtn = document.createElement("button");
    editNameBtn.className = "ghost";
    editNameBtn.dataset.action = "edit-name";
    editNameBtn.dataset.id = student.id;
    editNameBtn.textContent = "Edit";
    actionsRow.appendChild(editNameBtn);

    const focusBtn = document.createElement("button");
    focusBtn.className = "ghost";
    focusBtn.dataset.action = "focus";
    focusBtn.dataset.id = student.id;
    focusBtn.textContent = "Focus";
    actionsRow.appendChild(focusBtn);

    const removeBtn = document.createElement("button");
    removeBtn.className = "ghost danger";
    removeBtn.dataset.action = "remove";
    removeBtn.dataset.id = student.id;
    removeBtn.textContent = "Remove";
    actionsRow.appendChild(removeBtn);

    actionsCell.appendChild(actionsRow);
    tr.appendChild(actionsCell);

    fragment.appendChild(tr);
  });
  elements.studentTable.innerHTML = "";
  elements.studentTable.appendChild(fragment);
}

function activeFilterValue() {
  const f = state.activeFilter;
  if (!f || f.type === "all") return "all";
  if (f.type === "class") return `class:${f.key}`;
  if (f.type === "group-include") return `group-include:${f.groupId}`;
  if (f.type === "group-exclude") return `group-exclude:${f.groupId}`;
  return "all";
}

function setActiveFilterFromValue(val) {
  if (!val || val === "all") {
    state.activeFilter = { type: "all" };
  } else if (val.startsWith("class:")) {
    state.activeFilter = { type: "class", key: val.slice(6) };
  } else if (val.startsWith("group-include:")) {
    state.activeFilter = { type: "group-include", groupId: val.slice(14) };
  } else if (val.startsWith("group-exclude:")) {
    state.activeFilter = { type: "group-exclude", groupId: val.slice(14) };
  }
}

function renderFilterPicker() {
  const container = elements.filterButtons;
  if (!container) return;
  container.innerHTML = "";

  const current = activeFilterValue();

  function makeBtn(value, label, title) {
    const btn = document.createElement("button");
    btn.className = value === current ? "primary" : "ghost";
    btn.textContent = label;
    if (title) btn.title = title;
    btn.addEventListener("click", () => {
      setActiveFilterFromValue(value);
      persistState();
      renderFilterPicker();
      renderPoolInfo();
    });
    return btn;
  }

  // "All" button
  container.appendChild(makeBtn("all", "All students"));

  // One button per class
  const classMap = new Map();
  state.students.forEach((s) => {
    const key = `${s.period}|||${s.className}`;
    if (!classMap.has(key)) classMap.set(key, { period: s.period, className: s.className, count: 0 });
    classMap.get(key).count++;
  });
  classMap.forEach(({ period, className, count }, key) => {
    const parts = [period && `Per ${period}`, className].filter(Boolean);
    const label = parts.join(" · ") || "Unknown class";
    container.appendChild(makeBtn(`class:${key}`, label, `${count} students`));
  });

  // Group buttons (include / exclude pairs)
  state.groups.forEach((group) => {
    container.appendChild(makeBtn(`group-include:${group.id}`, `${group.name} only`, `Only call this group (${group.studentIds.length})`));
    container.appendChild(makeBtn(`group-exclude:${group.id}`, `Skip ${group.name}`, `Call everyone except this group (${group.studentIds.length})`));
  });

  // If current filter is no longer valid, reset to all
  const allValues = ["all",
    ...Array.from(classMap.keys()).map((k) => `class:${k}`),
    ...state.groups.flatMap((g) => [`group-include:${g.id}`, `group-exclude:${g.id}`]),
  ];
  if (!allValues.includes(current)) {
    state.activeFilter = { type: "all" };
  }
}

function renderGroups() {
  const list = elements.groupList;
  if (!list) return;
  list.innerHTML = "";
  state.groups.forEach((group) => {
    const row = document.createElement("div");
    row.className = "aeries-class-row";
    const label = document.createElement("span");
    label.textContent = `${group.name} (${group.studentIds.length} student${group.studentIds.length === 1 ? "" : "s"})`;
    const del = document.createElement("button");
    del.className = "ghost danger";
    del.textContent = "Delete";
    del.addEventListener("click", () => deleteGroup(group.id));
    row.appendChild(label);
    row.appendChild(del);
    list.appendChild(row);
  });
}

function renderGroupFromClassPicker() {
  const row = document.getElementById("groupFromClassRow");
  const list = document.getElementById("groupFromClassList");
  if (!row || !list) return;

  const classMap = new Map();
  state.students.forEach((s) => {
    const key = `${s.period}|||${s.className}`;
    if (!classMap.has(key)) classMap.set(key, { period: s.period, className: s.className });
  });

  if (classMap.size < 1) {
    row.style.display = "none";
    return;
  }

  // Preserve checked state across re-renders
  const prevChecked = new Set(
    Array.from(list.querySelectorAll("input[type=checkbox]:checked")).map((cb) => cb.value)
  );

  row.style.display = "";
  list.innerHTML = "";
  classMap.forEach(({ period, className }, key) => {
    const item = document.createElement("div");
    item.className = "aeries-class-row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = key;
    cb.id = `gfc-${CSS.escape(key)}`;
    cb.checked = prevChecked.has(key);
    cb.style.cssText = "width:16px;height:16px;flex-shrink:0;cursor:pointer;";

    const lbl = document.createElement("label");
    lbl.htmlFor = cb.id;
    lbl.style.cssText = "flex:1;cursor:pointer;";
    const parts = [period && `Per ${period}`, className].filter(Boolean);
    lbl.textContent = parts.join(" · ") || "Unknown class";

    item.appendChild(cb);
    item.appendChild(lbl);
    list.appendChild(item);
  });
}

function createGroupFromClass() {
  const list = document.getElementById("groupFromClassList");
  const nameInput = document.getElementById("groupFromClassNameInput");
  if (!list) return;

  const selectedKeys = Array.from(
    list.querySelectorAll("input[type=checkbox]:checked")
  ).map((cb) => cb.value);

  if (!selectedKeys.length) { alert("Select at least one class."); return; }

  let name = nameInput ? nameInput.value.trim() : "";
  if (!name) {
    name = selectedKeys.map((key) => {
      const [period, className] = key.split("|||");
      return [className, period && `Per ${period}`].filter(Boolean).join(" ");
    }).join(" + ") || "Class group";
  }

  if (state.groups.find((g) => g.name === name)) {
    alert(`A group named "${name}" already exists.`);
    return;
  }

  const studentIds = state.students
    .filter((s) => selectedKeys.includes(`${s.period}|||${s.className}`))
    .map((s) => s.id);

  pushHistory();
  state.groups.push({ id: randomId(), name, studentIds });
  if (nameInput) nameInput.value = "";
  list.querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = false; });
  markDirty();
  persistState();
  renderGroups();
  renderGroupFromClassPicker();
  renderFilterPicker();
  renderStudents();
}

function setServerStatus(message, tone = "muted") {
  if (!elements.serverStatus) return;
  const toneClass =
    tone === "success" ? "success" : tone === "danger" ? "danger" : tone === "warn" ? "warn" : "muted";
  elements.serverStatus.textContent = message;
  elements.serverStatus.className = `pill ${toneClass}`;
}

function renderServerSaveStatus() {
  const statusText = state.sessionId
    ? unsavedChanges
      ? `Unsaved changes · last saved ${state.sessionId}`
      : `Saved on server · ${state.sessionId}`
    : "Not saved to server";
  const tone = unsavedChanges ? "warn" : state.sessionId ? "success" : "muted";
  setServerStatus(statusText, tone);
}

function renderCycleInfo() {
  if (!elements.cycleInfo) return;
  elements.cycleInfo.textContent = `Cycle ${state.cycleNumber}`;
}

function sendStateToChannel() {
  if (!channel) return;
  channel.postMessage({ type: "stateUpdate", windowId, payload: snapshotState() });
}

function render() {
  renderFilterPicker();
  renderPoolInfo();
  renderCurrentStudent();
  renderStudents();
  renderTableHeaders();
  renderGroups();
  renderGroupFromClassPicker();
  elements.displayMode.value = state.displayMode;
  elements.memo.value = state.memo;
  elements.carryMemo.checked = state.carryMemo;
  elements.withReplacement.checked = state.withReplacement;
  elements.defaultClassName.value = state.defaults.className;
  elements.defaultPeriod.value = state.defaults.period;
  elements.pickStudent.disabled = !state.students.length;
  renderServerSaveStatus();
  renderCycleInfo();
}

function applyRemoteState(payload) {
  if (!payload) return;
  applyingRemote = true;
  Object.assign(state, payload);
  persistState();
  applyingRemote = false;
  render();
}

function pickStudent(excludeId = null) {
  const available = getActivePool();
  if (!available.length) {
    alert("No present students in the active pool.");
    return;
  }

  const filteredAvailable = excludeId && available.length > 1
    ? available.filter((s) => s.id !== excludeId)
    : available;

  let pool = state.withReplacement
    ? filteredAvailable
    : filteredAvailable.filter((s) => !s.calledThisCycle);

  pushHistory();
  if (!pool.length && !state.withReplacement) {
    // Reset calledThisCycle only for students currently in the active pool
    const poolIds = new Set(available.map((s) => s.id));
    state.students.forEach((s) => {
      if (poolIds.has(s.id)) s.calledThisCycle = false;
    });
    pool = filteredAvailable.filter((s) => s.status !== "absent");
    if (!pool.length) pool = available.filter((s) => s.status !== "absent");
  }
  const nextId = pool[Math.floor(Math.random() * pool.length)].id;
  const student = state.students.find((s) => s.id === nextId);
  student.calledThisCycle = true;
  student.calls = (student.calls || 0) + 1;
  state.currentId = nextId;
  state.callLog.push({
    id: randomId(),
    studentId: nextId,
    cycleNumber: state.cycleNumber,
    outcome: null,
    calledAt: new Date().toISOString(),
  });
  markDirty();
  persistState();
  renderCurrentStudent();
  renderStudents();
  renderPoolInfo();
}

function setOutcome(outcome) {
  if (!state.currentId) return;
  pushHistory();
  const student = state.students.find((s) => s.id === state.currentId);
  if (!student) return;

  if (outcome === "reset") {
    student.status = "pending";
  } else {
    student.status = outcome;
    // Update the most recent pending log entry for this student
    for (let i = state.callLog.length - 1; i >= 0; i--) {
      if (state.callLog[i].studentId === state.currentId && state.callLog[i].outcome === null) {
        state.callLog[i].outcome = outcome;
        break;
      }
    }
  }
  markDirty();
  persistState();
  renderCurrentStudent();
  renderStudents();
  renderPoolInfo();
}

function resetCycle() {
  pushHistory();
  const previousMemo = state.memo;
  state.memoHistory = state.memoHistory.concat({
    cycle: state.cycleNumber,
    memo: previousMemo,
  });
  state.cycleNumber = (state.cycleNumber || 1) + 1;
  state.memo = state.carryMemo ? previousMemo : "";
  state.students = state.students.map((student) => ({
    ...student,
    calledThisCycle: false,
  }));
  state.currentId = null;
  markDirty();
  persistState();
  render();
}

function clearRoster() {
  const confirmed = confirm("Clear the roster and reset progress?");
  if (!confirmed) return;
  pushHistory();
  state.students = [];
  state.currentId = null;
  state.memoHistory = [];
  state.cycleNumber = 1;
  state.memo = "";
  state.callLog = [];
  markDirty();
  persistState();
  render();
}

function addSingleStudent() {
  pushHistory();
  const first = elements.firstNameInput.value.trim();
  const last = elements.lastNameInput.value.trim();
  const classNameInput = elements.classNameInput.value.trim();
  const periodInput = elements.periodInput.value.trim();
  if (!first && !last) {
    alert("Please enter at least a first or last name.");
    return;
  }
  const defaults = getDefaults();
  const { full, first: derivedFirst, last: derivedLast } = deriveFromFull(
    `${first} ${last}`.trim()
  );
  const newStudent = {
    id: randomId(),
    firstName: first || derivedFirst,
    lastName: last || derivedLast,
    fullName: full,
    className: classNameInput || defaults.className,
    period: periodInput || defaults.period,
    status: "pending",
    calls: 0,
    calledThisCycle: false,
  };
  state.students.push(newStudent);
  elements.firstNameInput.value = "";
  elements.lastNameInput.value = "";
  elements.classNameInput.value = "";
  elements.periodInput.value = "";
  markDirty();
  persistState();
  render();
}

function toggleAbsent(studentId) {
  const student = state.students.find((s) => s.id === studentId);
  if (!student) return;
  pushHistory();
  student.status = student.status === "absent" ? "pending" : "absent";
  if (state.currentId === studentId && student.status === "absent") state.currentId = null;
  markDirty();
  persistState();
  renderCurrentStudent();
  renderStudents();
  renderPoolInfo();
}

function createGroup() {
  const name = elements.groupNameInput ? elements.groupNameInput.value.trim() : "";
  if (!name) { alert("Enter a group name."); return; }
  pushHistory();
  state.groups.push({ id: randomId(), name, studentIds: [] });
  if (elements.groupNameInput) elements.groupNameInput.value = "";
  markDirty();
  persistState();
  renderGroups();
  renderFilterPicker();
  renderStudents();
}

function deleteGroup(groupId) {
  pushHistory();
  state.groups = state.groups.filter((g) => g.id !== groupId);
  if (state.activeFilter && state.activeFilter.groupId === groupId) {
    state.activeFilter = { type: "all" };
  }
  markDirty();
  persistState();
  renderGroups();
  renderFilterPicker();
  renderStudents();
  renderPoolInfo();
}

function addStudentToGroup(studentId, groupId) {
  const group = state.groups.find((g) => g.id === groupId);
  if (!group || group.studentIds.includes(studentId)) return;
  pushHistory();
  group.studentIds.push(studentId);
  markDirty();
  persistState();
  renderGroups();
  renderFilterPicker();
  renderStudents();
}

function removeStudentFromGroup(studentId, groupId) {
  const group = state.groups.find((g) => g.id === groupId);
  if (!group) return;
  pushHistory();
  group.studentIds = group.studentIds.filter((id) => id !== studentId);
  markDirty();
  persistState();
  renderGroups();
  renderFilterPicker();
  renderStudents();
}

function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (!id) return;

  if (action === "toggle-absent") {
    toggleAbsent(id);
    return;
  }
  if (action === "remove-from-group") {
    if (button.dataset.groupId) removeStudentFromGroup(id, button.dataset.groupId);
    return;
  }

  const student = state.students.find((s) => s.id === id);
  if (!student) return;

  if (action === "remove") {
    pushHistory();
    state.students = state.students.filter((s) => s.id !== id);
    // Also remove from all groups
    state.groups.forEach((g) => {
      g.studentIds = g.studentIds.filter((sid) => sid !== id);
    });
    if (state.currentId === id) state.currentId = null;
    markDirty();
  }
  if (action === "edit-name") {
    const newFirst = prompt("First name:", student.firstName || "");
    if (newFirst === null) return;
    pushHistory();
    student.firstName = newFirst.trim();
    student.fullName = `${student.firstName} ${student.lastName}`.trim();
    markDirty();
  }
  if (action === "focus") {
    pushHistory();
    state.currentId = id;
  }
  persistState();
  render();
}

function handleTableChange(event) {
  const select = event.target.closest("select[data-action]");
  if (!select) return;
  const { action, id } = select.dataset;
  if (action === "add-to-group" && id && select.value) {
    addStudentToGroup(id, select.value);
    select.value = "";
  }
}

function updateDisplayMode(event) {
  pushHistory();
  state.displayMode = event.target.value;
  markDirty();
  persistState();
  render();
}

const debouncedMemoHistory = debounce(() => pushHistory(), 600);
const debouncedPersist = debounce(() => persistState(), 300);

function updateMemo(event) {
  debouncedMemoHistory();
  state.memo = event.target.value;
  markDirty();
  debouncedPersist();
}

function updateReplacement(event) {
  pushHistory();
  state.withReplacement = event.target.checked;
  markDirty();
  persistState();
  renderPoolInfo();
}

function skipStudent() {
  const skippedId = state.currentId;
  state.currentId = null;
  pickStudent(skippedId);
}

function toCsv() {
  // Pre-group call log by student ID to avoid O(n²) scans inside the map.
  const logByStudent = new Map();
  for (const entry of state.callLog) {
    if (entry.outcome === null) continue;
    if (!logByStudent.has(entry.studentId)) logByStudent.set(entry.studentId, []);
    logByStudent.get(entry.studentId).push(entry);
  }

  const rows = [
    [
      "id",
      "full_name",
      "first_name",
      "last_name",
      "class_name",
      "period",
      "status",
      "calls",
      "correct",
      "incorrect",
      "pass",
      "pct_correct",
      "memo",
      "cycle_number",
    ],
    ...state.students.map((s) => {
      const log = logByStudent.get(s.id) || [];
      const correct = log.filter((e) => e.outcome === "correct").length;
      const incorrect = log.filter((e) => e.outcome === "incorrect").length;
      const pass = log.filter((e) => e.outcome === "pass").length;
      const answered = correct + incorrect;
      const pctCorrect = answered > 0 ? ((correct / answered) * 100).toFixed(1) : "";
      return [
        s.id,
        s.fullName,
        s.firstName,
        s.lastName,
        s.className || "",
        s.period || "",
        s.status,
        s.calls || 0,
        correct,
        incorrect,
        pass,
        pctCorrect,
        state.memo || "",
        state.cycleNumber,
      ];
    }),
  ];
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell == null ? "" : String(cell);
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(",")
    )
    .join("\n");
  downloadFile("colderCall.csv", csv, "text/csv");
}

function showLoadSessionDialog() {
  return new Promise((resolve) => {
    const dlg = document.getElementById('loadSessionDialog');
    const input = document.getElementById('loadSessionInput');
    const okBtn = document.getElementById('loadSessionOk');
    const cancelBtn = document.getElementById('loadSessionCancel');
    input.value = '';
    const finish = (value) => {
      dlg.close();
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeydown);
      resolve(value || null);
    };
    const onOk = () => finish(input.value.trim());
    const onCancel = () => finish(null);
    const onKeydown = (e) => { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel(); };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeydown);
    dlg.showModal();
    input.focus();
  });
}

async function loadFromServer() {
  const id = await showLoadSessionDialog();
  if (!id) return;
  elements.loadServer.disabled = true;
  setServerStatus("Loading…", "warn");
  try {
    const response = await fetch(`/api/session/${encodeURIComponent(id.trim())}`);
    if (!response.ok) {
      const msg = await response.text();
      throw new Error(msg || "Not found");
    }
    const data = await response.json();
    pushHistory();
    state.students = (data.students || []).map((s) => ({
      id: s.id,
      firstName: s.first_name || "",
      lastName: s.last_name || "",
      fullName: s.full_name || "",
      className: s.class_name || "",
      period: s.period || "",
      status: s.status || "pending",
      calls: s.calls || 0,
      calledThisCycle: Boolean(s.called_this_cycle),
    }));
    state.currentId = null;
    state.memo = data.memo || "";
    state.displayMode = data.displayMode || "full";
    state.withReplacement = Boolean(data.withReplacement);
    state.cycleNumber = data.cycleNumber || 1;
    state.carryMemo = Boolean(data.carryMemo);
    state.memoHistory = data.memoHistory || [];
    state.defaults = data.defaults || { className: "", period: "" };
    state.groups = Array.isArray(data.groups) ? data.groups : [];
    state.callLog = Array.isArray(data.callLog) ? data.callLog : [];
    state.activeFilter = { type: "all" };
    state.sessionId = sanitizeSessionId(data.sessionId);
    unsavedChanges = false;
    persistState();
    render();
    setServerStatus(`Loaded · ${data.sessionId}`, "success");
  } catch (error) {
    console.error("Load failed", error);
    setServerStatus("Load failed", "danger");
    alert(`Unable to load session: ${error.message}`);
  } finally {
    elements.loadServer.disabled = false;
  }
}

function exportCycleCsv() {
  const cycleLog = state.callLog.filter(
    (e) => e.cycleNumber === state.cycleNumber && e.outcome !== null
  );
  const calledIds = new Set(cycleLog.map((e) => e.studentId));
  const calledStudents = state.students.filter((s) => calledIds.has(s.id));

  const logByStudent = new Map();
  for (const entry of cycleLog) {
    if (!logByStudent.has(entry.studentId)) logByStudent.set(entry.studentId, []);
    logByStudent.get(entry.studentId).push(entry);
  }

  const rows = [
    [
      "id",
      "full_name",
      "first_name",
      "last_name",
      "class_name",
      "period",
      "status",
      "calls",
      "correct",
      "incorrect",
      "pass",
      "pct_correct",
      "memo",
      "cycle_number",
    ],
    ...calledStudents.map((s) => {
      const log = logByStudent.get(s.id) || [];
      const correct = log.filter((e) => e.outcome === "correct").length;
      const incorrect = log.filter((e) => e.outcome === "incorrect").length;
      const pass = log.filter((e) => e.outcome === "pass").length;
      const answered = correct + incorrect;
      const pctCorrect = answered > 0 ? ((correct / answered) * 100).toFixed(1) : "";
      return [
        s.id,
        s.fullName,
        s.firstName,
        s.lastName,
        s.className || "",
        s.period || "",
        s.status,
        log.length,
        correct,
        incorrect,
        pass,
        pctCorrect,
        state.memo || "",
        state.cycleNumber,
      ];
    }),
  ];
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell == null ? "" : String(cell);
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(",")
    )
    .join("\n");
  downloadFile(`colderCall-cycle${state.cycleNumber}.csv`, csv, "text/csv");
}

async function exportDatabase() {
  elements.exportDb.disabled = true;
  try {
    const response = await fetch("/api/db/export");
    if (!response.ok) throw new Error(await response.text());
    const blob = await response.blob();
    downloadFile("colderCall.sqlite", blob, "application/x-sqlite3");
  } catch (err) {
    console.error("DB export failed", err);
    alert("Export failed: " + err.message);
  } finally {
    elements.exportDb.disabled = false;
  }
}

async function importDatabase(file) {
  if (!file) return;
  const confirmed = confirm(
    "Loading a database file will replace ALL current data. This cannot be undone.\n\nContinue?"
  );
  if (!confirmed) return;

  const form = new FormData();
  form.append("file", file);

  elements.importDb.disabled = true;
  setServerStatus("Importing database…", "warn");
  try {
    const response = await fetch("/api/db/import", { method: "POST", body: form });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error || response.statusText);
    }
    const { sessions, latestSessionId } = await response.json();
    localStorage.removeItem(storageKey);
    setServerStatus(`Database imported (${sessions} session${sessions !== 1 ? "s" : ""})`, "success");
    if (latestSessionId) {
      const r = await fetch(`/api/session/${encodeURIComponent(latestSessionId)}`);
      if (r.ok) {
        const data = await r.json();
        pushHistory();
        state.students = (data.students || []).map((s) => ({
          id: s.id,
          firstName: s.first_name || "",
          lastName: s.last_name || "",
          fullName: s.full_name || "",
          className: s.class_name || "",
          period: s.period || "",
          status: s.status || "pending",
          calls: s.calls || 0,
          calledThisCycle: Boolean(s.called_this_cycle),
        }));
        state.currentId = null;
        state.memo = data.memo || "";
        state.displayMode = data.displayMode || "full";
        state.withReplacement = Boolean(data.withReplacement);
        state.cycleNumber = data.cycleNumber || 1;
        state.carryMemo = Boolean(data.carryMemo);
        state.defaults = data.defaults || { className: "", period: "" };
        state.groups = Array.isArray(data.groups) ? data.groups : [];
        state.callLog = Array.isArray(data.callLog) ? data.callLog : [];
        state.activeFilter = { type: "all" };
        state.sessionId = sanitizeSessionId(data.sessionId);
        unsavedChanges = false;
        persistState();
        render();
        setServerStatus(`Database imported · ${latestSessionId}`, "success");
        return;
      }
    }
    location.reload();
  } catch (err) {
    console.error("DB import failed", err);
    setServerStatus("Import failed", "danger");
    alert("Import failed: " + err.message);
  } finally {
    elements.importDb.disabled = false;
    // Reset file input so the same file can be re-selected
    elements.importDbFile.value = "";
  }
}

function downloadFile(filename, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  requestAnimationFrame(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

const COLLAPSE_KEY = "colderCall-collapse";

function toggleCollapse(panelId, btnId) {
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  if (!panel || !btn) return;
  const isCollapsed = panel.classList.toggle("collapsed");
  btn.textContent = isCollapsed ? "▸" : "▾";
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}");
    saved[panelId] = isCollapsed;
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(saved));
  } catch {}
}

function loadCollapseState() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}");
    for (const [panelId, collapsed] of Object.entries(saved)) {
      if (!collapsed) continue;
      const panel = document.getElementById(panelId);
      const btn = panel && panel.querySelector(".collapse-btn");
      if (panel) panel.classList.add("collapsed");
      if (btn) btn.textContent = "▸";
    }
    // Restore add-student sub-section collapse (issue #11)
    if (saved["addStudentBody"]) {
      document.getElementById("addStudentBody")?.classList.add("collapsed");
      const btn = document.getElementById("collapseAddStudent");
      if (btn) btn.textContent = "▸";
    }
  } catch {}
}

function init() {
  if (isPopoutMode) {
    document.body.classList.add("popout-mode");
  }
  loadConfig();
  loadState();
  if (!historyStack.length) {
    historyStack.push(snapshotState());
  }
  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel("colderCall-sync");
    channel.onmessage = (event) => {
      const { type, payload, windowId: senderId } = event.data || {};
      if (senderId === windowId) return;
      if (type === "stateUpdate") {
        applyRemoteState(payload);
      }
      if (type === "requestState") {
        sendStateToChannel();
      }
      if (type === "popout-opened") {
        document.body.classList.add("popout-detached");
      }
      if (type === "popout-closed") {
        document.body.classList.remove("popout-detached");
      }
    };
    channel.postMessage({ type: "requestState", windowId });
    if (isPopoutMode) {
      channel.postMessage({ type: "popout-opened", windowId });
      window.addEventListener("beforeunload", () => {
        channel.postMessage({ type: "popout-closed", windowId });
      });
    }
  }
  elements.rosterUpload.addEventListener("change", handleRosterUpload);
  elements.aeriesUpload.addEventListener("change", handleAeriesUpload);
  elements.addStudent.addEventListener("click", addSingleStudent);
  elements.displayMode.addEventListener("change", updateDisplayMode);
  elements.memo.addEventListener("input", updateMemo);
  elements.carryMemo.addEventListener("change", (event) => {
    state.carryMemo = event.target.checked;
    markDirty();
    persistState();
  });
  const debouncedClassHistory = debounce(() => pushHistory(), 600);
  elements.defaultClassName.addEventListener("input", () => {
    debouncedClassHistory();
    state.defaults.className = elements.defaultClassName.value.trim();
    markDirty();
    debouncedPersist();
  });
  const debouncedPeriodHistory = debounce(() => pushHistory(), 600);
  elements.defaultPeriod.addEventListener("input", () => {
    debouncedPeriodHistory();
    state.defaults.period = elements.defaultPeriod.value.trim();
    markDirty();
    debouncedPersist();
  });
  elements.saveClientId.addEventListener("click", saveGoogleClientId);
  elements.clientIdInput.addEventListener("keydown", (e) => { if (e.key === "Enter") saveGoogleClientId(); });
  elements.classroomChangeId.addEventListener("click", () => {
    googleClientId = "";
    classroomSignOut();
    updateClassroomConfigUI();
  });
  elements.classroomSignIn.addEventListener("click", classroomSignIn);
  elements.classroomSignOut.addEventListener("click", classroomSignOut);
  elements.classroomCoursePicker.addEventListener("change", () => {
    elements.classroomApiImport.disabled = !elements.classroomCoursePicker.value;
  });
  elements.classroomApiImport.addEventListener("click", importClassroomApi);
  elements.withReplacement.addEventListener("change", updateReplacement);
  elements.pickStudent.addEventListener("click", pickStudent);
  elements.skipStudent.addEventListener("click", skipStudent);
  elements.undoButton.addEventListener("click", undoLastChange);
  elements.popOut.addEventListener("click", openPopout);
  if (isPopoutMode && elements.popOut) {
    elements.popOut.textContent = "Return to main window";
  }
  elements.statusButtons.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-outcome]");
    if (!button) return;
    setOutcome(button.dataset.outcome);
  });
  elements.resetCycle.addEventListener("click", resetCycle);
  elements.clearRoster.addEventListener("click", clearRoster);
  elements.studentTable.addEventListener("click", handleTableClick);
  elements.studentTable.addEventListener("change", handleTableChange);
  if (elements.createGroupBtn) {
    elements.createGroupBtn.addEventListener("click", createGroup);
  }
  if (elements.groupNameInput) {
    elements.groupNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") createGroup();
    });
  }
  document.getElementById("groupFromClassBtn")?.addEventListener("click", createGroupFromClass);
  document.querySelector("#classListPanel table thead")?.addEventListener("click", (event) => {
    const th = event.target.closest("th[data-sort-col]");
    if (!th) return;
    const col = th.dataset.sortCol;
    if (tableSort.col === col) {
      tableSort.dir = tableSort.dir === "asc" ? "desc" : "asc";
    } else {
      tableSort.col = col;
      tableSort.dir = "asc";
    }
    renderTableHeaders();
    renderStudents();
  });
  elements.exportCsv.addEventListener("click", toCsv);
  elements.exportDb.addEventListener("click", exportDatabase);
  elements.importDb.addEventListener("click", () => elements.importDbFile.click());
  elements.importDbFile.addEventListener("change", (e) => importDatabase(e.target.files[0]));
  elements.exportCycleCsv.addEventListener("click", exportCycleCsv);
  elements.loadServer.addEventListener("click", loadFromServer);
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  loadCollapseState();
  document.getElementById("collapseRoster")?.addEventListener("click", () => toggleCollapse("rosterPanel", "collapseRoster"));
  document.getElementById("collapseClassList")?.addEventListener("click", () => toggleCollapse("classListPanel", "collapseClassList"));
  document.getElementById("collapseAddStudent")?.addEventListener("click", () => toggleCollapse("addStudentBody", "collapseAddStudent"));
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    });
    document.addEventListener("fullscreenchange", () => {
      fullscreenBtn.textContent = document.fullscreenElement ? "✕" : "⛶";
      fullscreenBtn.title = document.fullscreenElement ? "Exit fullscreen" : "Fullscreen";
    });
  }
  document.addEventListener("keydown", (event) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!elements.pickStudent.disabled) pickStudent();
    }
  });
  render();
}

init();
