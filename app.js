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
  saveServer: document.getElementById("saveServer"),
  loadServer: document.getElementById("loadServer"),
  serverStatus: document.getElementById("serverStatus"),
  cycleInfo: document.getElementById("cycleInfo"),
  undoButton: document.getElementById("undoButton"),
  popOut: document.getElementById("popOut"),
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
const windowId = randomId();
const isPopoutMode = new URLSearchParams(window.location.search).get("popout") === "1";
let popoutWindow = null;
let channel = null;
let applyingRemote = false;

function randomId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    state.sessionId = data.sessionId || null;
    state.memoHistory = Array.isArray(data.memoHistory) ? data.memoHistory : [];
    state.cycleNumber = Number.isInteger(data.cycleNumber) ? data.cycleNumber : 1;
    state.carryMemo = Boolean(data.carryMemo);
    state.defaults = {
      className: (data.defaults && data.defaults.className) || "",
      period: (data.defaults && data.defaults.period) || "",
    };
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
      return ["firstname", "first", "lastname", "last", "fullname", "fullname", "name", "student", "email", "emailaddress"].includes(
        key
      );
    });

  let headerIndexes = { first: null, last: null, full: null, className: null, period: null };
  let startIndex = 0;

  if (headersPresent) {
    firstRow.forEach((cell, index) => {
      const key = normalizeHeader(cell);
      if (["firstname", "first"].includes(key)) headerIndexes.first = index;
      if (["lastname", "last"].includes(key)) headerIndexes.last = index;
      if (["fullname", "name", "student"].includes(key)) headerIndexes.full = index;
      if (["classname", "class", "course", "coursename"].includes(key)) headerIndexes.className = index;
      if (["period", "section"].includes(key)) headerIndexes.period = index;
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
  classes.forEach((cls) => {
    const row = document.createElement("div");
    row.className = "aeries-class-row";
    const label = document.createElement("span");
    label.textContent = `Per ${cls.period} — ${cls.className} (${cls.students.length} students)`;
    const btn = document.createElement("button");
    btn.className = "ghost";
    btn.textContent = "Import";
    btn.addEventListener("click", () => {
      addStudents(cls.students);
      elements.aeriesClassPicker.style.display = "none";
      elements.aeriesClassList.innerHTML = "";
    });
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
  if (!googleClientId) {
    alert("No Google Client ID configured. Add GOOGLE_CLIENT_ID to your .env file.");
    return;
  }
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

function renderPoolInfo() {
  const present = state.students.filter((s) => s.status !== "absent").length;
  const total = state.students.length;
  const mode = state.withReplacement ? "with replacement" : "no repeats this cycle";
  elements.poolInfo.textContent = total
    ? `${present}/${total} present · ${mode}`
    : "No roster loaded";
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

function renderStudents() {
  const fragment = document.createDocumentFragment();
  state.students.forEach((student) => {
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

    const actionsCell = document.createElement("td");
    actionsCell.innerHTML = `
      <div class="actions-row">
        <button class="ghost" data-action="focus" data-id="${student.id}">Focus</button>
        <button class="ghost danger" data-action="remove" data-id="${student.id}">Remove</button>
      </div>
    `;
    tr.appendChild(actionsCell);

    fragment.appendChild(tr);
  });
  elements.studentTable.innerHTML = "";
  elements.studentTable.appendChild(fragment);
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
  renderPoolInfo();
  renderCurrentStudent();
  renderStudents();
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
  unsavedChanges = true;
  persistState();
  applyingRemote = false;
  render();
}

function pickStudent() {
  const available = state.students.filter((s) => s.status !== "absent");
  if (!available.length) {
    alert("No present students to pick.");
    return;
  }

  let pool = state.withReplacement
    ? available
    : available.filter((s) => !s.calledThisCycle);

  pushHistory();
  if (!pool.length && !state.withReplacement) {
    state.students = state.students.map((s) => ({
      ...s,
      calledThisCycle: false,
    }));
    pool = available;
  }
  const next = pool[Math.floor(Math.random() * pool.length)];
  next.calledThisCycle = true;
  next.calls = (next.calls || 0) + 1;
  state.currentId = next.id;
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
  }
  markDirty();
  persistState();
  renderCurrentStudent();
  renderStudents();
  renderPoolInfo();
}

function resetCycle() {
  const previousMemo = state.memo;
  state.memoHistory = state.memoHistory.concat({
    cycle: state.cycleNumber,
    memo: previousMemo,
  });
  state.cycleNumber = (state.cycleNumber || 1) + 1;
  state.memo = state.carryMemo ? previousMemo : "";
  pushHistory();
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

function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (!id) return;
  const student = state.students.find((s) => s.id === id);
  if (!student) return;

  if (action === "remove") {
    pushHistory();
    state.students = state.students.filter((s) => s.id !== id);
    if (state.currentId === id) state.currentId = null;
    markDirty();
  }
  if (action === "focus") {
    pushHistory();
    state.currentId = id;
  }
  persistState();
  render();
}

function updateDisplayMode(event) {
  pushHistory();
  state.displayMode = event.target.value;
  markDirty();
  persistState();
  render();
}

const debouncedMemoHistory = debounce(() => pushHistory(), 600);

function updateMemo(event) {
  debouncedMemoHistory();
  state.memo = event.target.value;
  markDirty();
  persistState();
}

function updateReplacement(event) {
  pushHistory();
  state.withReplacement = event.target.checked;
  markDirty();
  persistState();
  renderPoolInfo();
}

function skipStudent() {
  state.currentId = null;
  pickStudent();
}

function toCsv() {
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
      "memo",
      "cycle_number",
    ],
    ...state.students.map((s) => [
      s.id,
      s.fullName,
      s.firstName,
      s.lastName,
      s.className || "",
      s.period || "",
      s.status,
      s.calls || 0,
      state.memo || "",
      state.cycleNumber,
    ]),
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

async function loadFromServer() {
  const id = prompt("Enter session ID to load:");
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
    state.sessionId = data.sessionId;
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

async function saveToServer() {
  elements.saveServer.disabled = true;
  setServerStatus("Saving to server…", "warn");
  try {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: state.sessionId,
        memo: state.memo,
        displayMode: state.displayMode,
        withReplacement: state.withReplacement,
        students: state.students,
        cycleNumber: state.cycleNumber,
        memoHistory: state.memoHistory,
        carryMemo: state.carryMemo,
        defaults: state.defaults,
      }),
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Request failed");
    }
    const payload = await response.json();
    state.sessionId = payload.sessionId;
    unsavedChanges = false;
    persistState();
    setServerStatus(`Saved on server · ${state.sessionId}`, "success");
    render();
  } catch (error) {
    console.error("Save failed", error);
    setServerStatus("Save to server failed", "danger");
    alert("Unable to save to server. Make sure the server is running.");
  } finally {
    elements.saveServer.disabled = false;
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
    persistState();
  });
  const debouncedPeriodHistory = debounce(() => pushHistory(), 600);
  elements.defaultPeriod.addEventListener("input", () => {
    debouncedPeriodHistory();
    state.defaults.period = elements.defaultPeriod.value.trim();
    markDirty();
    persistState();
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
  elements.exportCsv.addEventListener("click", toCsv);
  elements.saveServer.addEventListener("click", saveToServer);
  elements.loadServer.addEventListener("click", loadFromServer);
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
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
