const CONFIG = {
  today: new Date().toISOString().slice(0, 10),
  spreadsheetId: "1G_w47rJrhOWsuK_Qpvs8vgC7VCyYLnjR6QvCZ87rR6k",
  sourceSheets: [
    "CLS 13",
    "CDKL5 KO",
    "CDKL5 FS",
    "CDKL5 Flox",
    "Satb2 Cre",
    "C57",
    "CDKL5 KO x Satb2",
    "CDKL5 FS x Satb2",
    "CDKL5 Flox x Satb2 Cre",
    "CDKL5 FL x Fox J1 Cre"
  ],
  autoRefreshMs: 5 * 60 * 1000,
  localStorageKey: "colony-task-status-v1"
};

const els = {
  rows: document.querySelector("#taskRows"),
  template: document.querySelector("#taskRowTemplate"),
  statusFilter: document.querySelector("#statusFilter"),
  taskFilter: document.querySelector("#taskFilter"),
  lineFilter: document.querySelector("#lineFilter"),
  searchInput: document.querySelector("#searchInput"),
  refreshButton: document.querySelector("#refreshButton"),
  lastUpdated: document.querySelector("#lastUpdated"),
  refreshSchedule: document.querySelector("#refreshSchedule"),
  viewTabs: document.querySelectorAll(".view-tab"),
  tableView: document.querySelector("#tableView"),
  todayView: document.querySelector("#todayView"),
  calendarView: document.querySelector("#calendarView"),
  calendarHeader: document.querySelector("#calendarHeader"),
  calendarKicker: document.querySelector("#calendarKicker"),
  calendarTitle: document.querySelector("#calendarTitle"),
  overdueCount: document.querySelector("#overdueCount"),
  dueCount: document.querySelector("#dueCount"),
  upcomingCount: document.querySelector("#upcomingCount"),
  reviewCount: document.querySelector("#reviewCount")
};

let taskCache = [];
let completionState = loadCompletionState();
let activeView = "all";

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.round((end - start) / 86400000);
}

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatShortDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dayName(dateString, format = "short") {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString(undefined, { weekday: format });
}

function startOfWeek(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}

function startOfMonth(dateString) {
  return `${dateString.slice(0, 8)}01`;
}

function endOfMonth(dateString) {
  const date = new Date(`${dateString.slice(0, 8)}01T00:00:00`);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return date.toISOString().slice(0, 10);
}

function dueDateForCalendar(task) {
  if (task.state === "overdue" || task.state === "review") return CONFIG.today;
  if (CONFIG.today >= task.dueStart && CONFIG.today <= task.dueEnd) return CONFIG.today;
  return task.dueStart;
}

function loadCompletionState() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.localStorageKey)) || {};
  } catch {
    return {};
  }
}

function saveCompletionState() {
  localStorage.setItem(CONFIG.localStorageKey, JSON.stringify(completionState));
}

function taskId(parts) {
  return [parts.task, parts.line, parts.cage, parts.dob || parts.row].join("|");
}

function classifyTask(task) {
  if (completionState[task.id]?.done) return "done";
  if (task.reviewNeeded) return "review";
  const today = CONFIG.today;
  if (today > task.dueEnd) return "overdue";
  if (today >= task.dueStart && today <= task.dueEnd) return "due";
  return "upcoming";
}

function makeTask(base) {
  const task = { ...base };
  task.id = taskId(task);
  task.state = classifyTask(task);
  return task;
}

function readCell(cell) {
  if (!cell) return "";
  if (cell.f) return String(cell.f).trim();
  if (cell.v === null || cell.v === undefined) return "";
  if (typeof cell.v === "string" && cell.v.startsWith("Date(")) {
    const parts = cell.v.match(/\d+/g);
    if (parts && parts.length >= 3) {
      const year = Number(parts[0]);
      const month = String(Number(parts[1]) + 1).padStart(2, "0");
      const day = String(Number(parts[2])).padStart(2, "0");
      return `${month}/${day}/${year}`;
    }
  }
  return String(cell.v).trim();
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return "";
  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  const rawYear = match[3];
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${year}-${month}-${day}`;
}

function firstDate(cells) {
  for (const cell of cells) {
    const date = normalizeDate(cell);
    if (date) return date;
  }
  return "";
}

function firstDateAfter(cells, startIndex) {
  for (let index = startIndex + 1; index < cells.length; index += 1) {
    const date = normalizeDate(cells[index]);
    if (date) return date;
  }
  return "";
}

function extractCount(cells) {
  const text = cells.join(" ");
  const match = text.match(/\b\d+M\d+F\b|\b\d+\s*M\s*\+\s*\d+\s*F\b|\b\d+\s*F\s*\+\s*\d+\s*M\b|~\d+[MF]\b|\b\d+[MF]\b|\b\d+\s*pups?\b/i);
  return match ? match[0] : "";
}

function isCageNumber(value) {
  return /^\??\d{5,6}\??$/.test(String(value || "").trim());
}

function cleanCage(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function isLikelyAnimalRow(cells) {
  const text = cells.join(" ").toLowerCase();
  return /\b[fm]\b/i.test(cells.join(" ")) && !/pups?|preg|breeding|weanlings|adults|males|females|to genotype/.test(text);
}

function parseSheetRows(sheetName, tableRows) {
  const rows = [];
  let currentCage = "";
  let currentDam = null;
  let cageAnimals = [];

  function flushAdultCage() {
    if (!currentCage || cageAnimals.length === 0) return;
    const missingTags = cageAnimals.some((animal) => {
      const tag = String(animal.tag || "").trim();
      return !tag || /missing|none|nt|check|tagged\?|\?$/.test(tag.toLowerCase());
    });
    const noteText = cageAnimals.map((animal) => animal.notes).join(" ");
    if (missingTags || /missing tags?|check.*tag|compare.*tag|tagged\?/i.test(noteText)) {
      rows.push({
        line: sheetName,
        cage: currentCage,
        row: cageAnimals[0].row,
        adultCage: true,
        animals: cageAnimals.length,
        missingTags: true,
        notes: noteText || "Adult cage has missing or unclear ear tags."
      });
    }
  }

  tableRows.forEach((row, index) => {
    const cells = Array.from({ length: 13 }, (_, col) => readCell(row.c?.[col]));
    const rowNumber = index + 1;
    const joined = cells.join(" ").trim();

    if (!joined) {
      flushAdultCage();
      currentCage = "";
      currentDam = null;
      cageAnimals = [];
      return;
    }

    if (isCageNumber(cells[1])) {
      flushAdultCage();
      currentCage = cleanCage(cells[1]);
      cageAnimals = [];
      currentDam = {
        genotype: [cells[2], cells[3]].filter(Boolean).join(" / "),
        tag: cells[4] || "",
        sex: cells[5] || "",
        dob: normalizeDate(cells[6])
      };
    }

    if (currentCage && isLikelyAnimalRow(cells)) {
      cageAnimals.push({
        row: rowNumber,
        tag: cells[4] || "",
        sex: cells[5] || "",
        notes: joined
      });
    }

    const pupIndex = cells.findIndex((cell) => /^(pups?|tagged\?)$/i.test(String(cell || "").trim()));
    const dob = pupIndex >= 0 ? firstDateAfter(cells, pupIndex) : "";
    if (currentCage && pupIndex >= 0 && dob) {
      rows.push({
        line: sheetName,
        cage: currentCage,
        row: rowNumber,
        dam: currentDam,
        litter: {
          dob,
          label: cells[pupIndex],
          count: extractCount(cells)
        },
        notes: joined
      });
    }
  });

  flushAdultCage();
  return rows;
}

function buildTasks(rows) {
  const tasks = [];

  rows.forEach((row) => {
    if (row.litter?.dob) {
      const age = daysBetween(row.litter.dob, CONFIG.today);
      const detailParts = [
        row.litter.count ? `Count: ${row.litter.count}` : "",
        row.dam ? `Dam ${row.dam.tag || "unmarked"} ${row.dam.genotype || ""}`.trim() : "",
        row.notes || ""
      ].filter(Boolean);

      tasks.push(makeTask({
        task: "Ear tag",
        line: row.line,
        cage: row.cage,
        row: row.row,
        dob: row.litter.dob,
        dueStart: addDays(row.litter.dob, 14),
        dueEnd: addDays(row.litter.dob, 20),
        age,
        details: detailParts.join(" | "),
        reviewNeeded: /tagged\?/i.test(row.litter.label || "") || /review/i.test(row.notes || "")
      }));

      tasks.push(makeTask({
        task: "Wean",
        line: row.line,
        cage: row.cage,
        row: row.row,
        dob: row.litter.dob,
        dueStart: addDays(row.litter.dob, 22),
        dueEnd: addDays(row.litter.dob, 28),
        age,
        details: detailParts.join(" | "),
        reviewNeeded: /weaned/i.test(row.notes || "")
      }));
    }

    if (row.adultCage && row.missingTags) {
      tasks.push(makeTask({
        task: "Adult missing tags",
        line: row.line,
        cage: row.cage,
        row: row.row,
        dob: "",
        dueStart: CONFIG.today,
        dueEnd: CONFIG.today,
        age: "",
        details: `${row.animals || "Unknown"} animals. ${row.notes || ""}`,
        reviewNeeded: true
      }));
    }
  });

  return tasks.sort((a, b) => {
    const stateRank = { overdue: 0, due: 1, review: 2, upcoming: 3, done: 4 };
    return stateRank[a.state] - stateRank[b.state] || a.dueEnd.localeCompare(b.dueEnd);
  });
}

function loadGoogleSheet(sheetName) {
  return new Promise((resolve, reject) => {
    const callbackName = `sheetCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const params = new URLSearchParams({
      tqx: `responseHandler:${callbackName}`,
      tq: "select *",
      sheet: sheetName
    });

    window[callbackName] = (response) => {
      delete window[callbackName];
      script.remove();
      if (response.status === "error") {
        reject(new Error(response.errors?.[0]?.detailed_message || `Could not load ${sheetName}`));
        return;
      }
      resolve(parseSheetRows(sheetName, response.table.rows || []));
    };

    script.onerror = () => {
      delete window[callbackName];
      script.remove();
      reject(new Error(`Could not reach Google Sheet tab ${sheetName}`));
    };

    script.src = `https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/gviz/tq?${params.toString()}`;
    document.head.append(script);
  });
}

async function loadRows() {
  try {
    const sheetRows = await Promise.all(CONFIG.sourceSheets.map(loadGoogleSheet));
    els.lastUpdated.dataset.source = "live";
    return sheetRows.flat();
  } catch (error) {
    console.error(error);
    els.lastUpdated.dataset.source = "fallback";
    return window.COLONY_SAMPLE_ROWS;
  }
}

function populateLineFilter(tasks) {
  const current = els.lineFilter.value;
  const lines = [...new Set(tasks.map((task) => task.line))].sort();
  els.lineFilter.innerHTML = '<option value="all">All lines</option>';
  lines.forEach((line) => {
    const option = document.createElement("option");
    option.value = line;
    option.textContent = line;
    els.lineFilter.append(option);
  });
  els.lineFilter.value = lines.includes(current) ? current : "all";
}

function updateSummary(tasks) {
  els.overdueCount.textContent = tasks.filter((task) => task.state === "overdue").length;
  els.dueCount.textContent = tasks.filter((task) => task.state === "due").length;
  els.upcomingCount.textContent = tasks.filter((task) => task.state === "upcoming").length;
  els.reviewCount.textContent = tasks.filter((task) => task.state === "review").length;
}

function visibleTasks() {
  return taskCache.filter((task) => {
    const taskType = els.taskFilter.value;
    const line = els.lineFilter.value;
    const query = els.searchInput.value.trim().toLowerCase();

    if (taskType !== "all" && task.task !== taskType) return false;
    if (line !== "all" && task.line !== line) return false;
    if (!query) return true;
    return [task.task, task.cage, task.line, task.details].join(" ").toLowerCase().includes(query);
  });
}

function filteredTasks() {
  const status = els.statusFilter.value;

  return visibleTasks().filter((task) => {
    if (status === "open" && task.state === "done") return false;
    if (status !== "open" && status !== "all" && task.state !== status) return false;
    return true;
  });
}

function makeDoneToggle(task) {
  const done = document.createElement("input");
  done.className = "done-toggle";
  done.type = "checkbox";
  done.setAttribute("aria-label", `Mark ${task.task} for cage ${task.cage} done`);
  done.checked = Boolean(completionState[task.id]?.done);
  done.addEventListener("change", () => {
    completionState[task.id] = {
      done: done.checked,
      completedAt: done.checked ? new Date().toISOString() : ""
    };
    saveCompletionState();
    taskCache = taskCache.map((item) => item.id === task.id ? { ...item, state: classifyTask(item) } : item);
    render();
  });
  return done;
}

function renderTable(tasks) {
  els.rows.innerHTML = "";

  tasks.forEach((task) => {
    const row = els.template.content.firstElementChild.cloneNode(true);
    const doneCell = row.querySelector("td");
    const pill = row.querySelector(".state-pill");

    doneCell.innerHTML = "";
    doneCell.append(makeDoneToggle(task));
    pill.textContent = task.state.replace("-", " ");
    pill.className = `state-pill state-${task.state}`;
    row.querySelector(".task-name").textContent = task.task;
    row.querySelector(".cage").textContent = task.cage;
    row.querySelector(".line").textContent = task.line;
    row.querySelector(".window").textContent = `${formatDate(task.dueStart)} - ${formatDate(task.dueEnd)}`;
    row.querySelector(".age").textContent = task.age === "" ? "" : `P${task.age}`;
    row.querySelector(".details").textContent = task.details || "";

    els.rows.append(row);
  });
}

function renderToday(tasks) {
  const todayTasks = tasks.filter((task) => task.state !== "done" && dueDateForCalendar(task) === CONFIG.today);
  els.todayView.innerHTML = "";

  if (todayTasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No open tasks are due today.";
    els.todayView.append(empty);
    return;
  }

  const groups = [
    ["overdue", "Overdue"],
    ["due", "Due Today"],
    ["review", "Needs Review"]
  ];

  groups.forEach(([state, title]) => {
    const groupTasks = todayTasks.filter((task) => task.state === state);
    if (groupTasks.length === 0) return;
    const section = document.createElement("section");
    section.className = "today-group";
    section.innerHTML = `<h2>${title}</h2>`;
    groupTasks.forEach((task) => section.append(taskCard(task)));
    els.todayView.append(section);
  });
}

function taskCard(task) {
  const card = document.createElement("article");
  card.className = `task-card task-card-${task.state}`;
  const meta = task.age === "" ? task.line : `${task.line} | P${task.age}`;

  const top = document.createElement("div");
  top.className = "task-card-top";
  const pill = document.createElement("span");
  pill.className = `state-pill state-${task.state}`;
  pill.textContent = task.state;
  const name = document.createElement("strong");
  name.textContent = task.task;
  top.append(makeDoneToggle(task), pill, name);

  const main = document.createElement("div");
  main.className = "task-card-main";
  main.textContent = `Cage ${task.cage}`;

  const metaLine = document.createElement("p");
  metaLine.textContent = meta;

  const windowLine = document.createElement("small");
  windowLine.textContent = `${formatShortDate(task.dueStart)} - ${formatShortDate(task.dueEnd)}`;

  const details = document.createElement("p");
  details.className = "task-card-details";
  details.textContent = task.details || "";

  card.append(top, main, metaLine, windowLine, details);
  return card;
}

function calendarRange(view) {
  if (view === "week") {
    const start = startOfWeek(CONFIG.today);
    return { start, days: 7, title: `${formatDate(start)} - ${formatDate(addDays(start, 6))}`, kicker: "Weekly Calendar" };
  }

  const monthStart = startOfMonth(CONFIG.today);
  const firstGridDay = startOfWeek(monthStart);
  const monthEnd = endOfMonth(CONFIG.today);
  const gridDays = daysBetween(firstGridDay, monthEnd) + 1;
  const totalDays = Math.ceil(gridDays / 7) * 7;
  const title = new Date(`${monthStart}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return { start: firstGridDay, days: totalDays, title, kicker: "Monthly Calendar" };
}

function renderCalendar(tasks, view) {
  const range = calendarRange(view);
  const monthPrefix = CONFIG.today.slice(0, 7);
  els.calendarKicker.textContent = range.kicker;
  els.calendarTitle.textContent = range.title;
  els.calendarView.innerHTML = "";

  for (let index = 0; index < range.days; index += 1) {
    const date = addDays(range.start, index);
    const dayTasks = tasks.filter((task) => task.state !== "done" && dueDateForCalendar(task) === date);
    const cell = document.createElement("section");
    cell.className = "calendar-day";
    if (date === CONFIG.today) cell.classList.add("is-today");
    if (view === "month" && !date.startsWith(monthPrefix)) cell.classList.add("outside-month");

    const heading = document.createElement("div");
    heading.className = "calendar-day-heading";
    heading.innerHTML = `<span>${dayName(date)}</span><strong>${formatShortDate(date)}</strong>`;
    cell.append(heading);

    if (dayTasks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "calendar-empty";
      empty.textContent = "No tasks";
      cell.append(empty);
    } else {
      dayTasks.slice(0, view === "month" ? 4 : 12).forEach((task) => {
        const item = document.createElement("button");
        item.className = `calendar-task calendar-task-${task.state}`;
        item.type = "button";
        item.title = task.details || "";
        item.textContent = `${task.task}: ${task.cage}`;
        cell.append(item);
      });
      if (dayTasks.length > 4 && view === "month") {
        const more = document.createElement("p");
        more.className = "calendar-more";
        more.textContent = `+${dayTasks.length - 4} more`;
        cell.append(more);
      }
    }

    els.calendarView.append(cell);
  }
}

function setActiveView(view) {
  activeView = view;
  els.viewTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  render();
}

function render() {
  updateSummary(taskCache);
  const tasks = activeView === "all" ? filteredTasks() : visibleTasks();

  els.tableView.classList.toggle("hidden", activeView !== "all");
  els.todayView.classList.toggle("hidden", activeView !== "today");
  els.calendarView.classList.toggle("hidden", activeView !== "week" && activeView !== "month");
  els.calendarHeader.classList.toggle("hidden", activeView !== "week" && activeView !== "month");
  els.statusFilter.disabled = activeView !== "all";

  if (activeView === "all") renderTable(tasks);
  if (activeView === "today") renderToday(tasks);
  if (activeView === "week" || activeView === "month") renderCalendar(tasks, activeView);
}

async function refresh() {
  els.refreshButton.disabled = true;
  els.refreshButton.textContent = "Refreshing";
  try {
    const rows = await loadRows();
    taskCache = buildTasks(rows);
    populateLineFilter(taskCache);
    render();
    const source = els.lastUpdated.dataset.source === "fallback" ? "sample fallback" : "live Google Sheet";
    els.lastUpdated.textContent = `Updated from ${source} ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } finally {
    els.refreshButton.disabled = false;
    els.refreshButton.textContent = "Refresh";
  }
}

[els.statusFilter, els.taskFilter, els.lineFilter, els.searchInput].forEach((el) => {
  el.addEventListener("input", render);
});
els.viewTabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveView(tab.dataset.view));
});
els.refreshButton.addEventListener("click", refresh);
els.refreshSchedule.textContent = `Auto-refreshes every ${Math.round(CONFIG.autoRefreshMs / 60000)} min while open`;
refresh();
setInterval(refresh, CONFIG.autoRefreshMs);
