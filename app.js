const CONFIG = {
  today: new Date().toISOString().slice(0, 10),
  spreadsheetId: "1G_w47rJrhOWsuK_Qpvs8vgC7VCyYLnjR6QvCZ87rR6k",
  sourceSheets: [
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
  localStorageKey: "colony-task-status-v1",
  oldMouseStorageKey: "colony-old-mouse-status-v1",
  oldMouseBridgeUrl: "https://script.google.com/a/macros/enders.tch.harvard.edu/s/AKfycbxRkyNZ4jWdP0NzdddZdgleRoCQjKY8eD0pdEY2Q0rGJMoTK0exIFgycwH8ZcCZsn_2/exec"
};

const CURRENT_BREEDER_CAGES = {
  "CDKL5 KO": ["450304", "450316", "450372", "496761"],
  "CDKL5 FS": ["450195", "450243", "450278", "450332", "500423"],
  "CDKL5 Flox": ["450271"],
  "Satb2 Cre": ["500301"],
  "C57": ["450210", "450225", "450281", "450323", "450394"],
  "CDKL5 KO x Satb2": ["450298", "500302"],
  "CDKL5 FS x Satb2": ["500422"]
};

const BREEDING_PROGRAMS = Object.keys(CURRENT_BREEDER_CAGES);

const els = {
  rows: document.querySelector("#taskRows"),
  template: document.querySelector("#taskRowTemplate"),
  statusFilter: document.querySelector("#statusFilter"),
  taskFilter: document.querySelector("#taskFilter"),
  lineFilter: document.querySelector("#lineFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  searchInput: document.querySelector("#searchInput"),
  refreshButton: document.querySelector("#refreshButton"),
  lastUpdated: document.querySelector("#lastUpdated"),
  refreshSchedule: document.querySelector("#refreshSchedule"),
  viewTabs: document.querySelectorAll(".view-tab"),
  tableView: document.querySelector("#tableView"),
  todayView: document.querySelector("#todayView"),
  calendarView: document.querySelector("#calendarView"),
  breedersView: document.querySelector("#breedersView"),
  oldView: document.querySelector("#oldView"),
  sheetsBridgeView: document.querySelector("#sheetsBridgeView"),
  summaryGrid: document.querySelector("#summaryGrid"),
  calendarHeader: document.querySelector("#calendarHeader"),
  calendarKicker: document.querySelector("#calendarKicker"),
  calendarTitle: document.querySelector("#calendarTitle"),
  calendarModeButtons: document.querySelectorAll(".mode-button"),
  overdueCount: document.querySelector("#overdueCount"),
  dueCount: document.querySelector("#dueCount"),
  upcomingCount: document.querySelector("#upcomingCount"),
  reviewCount: document.querySelector("#reviewCount")
};

let taskCache = [];
let sourceRows = [];
let completionState = loadCompletionState();
let oldMouseState = loadOldMouseState();
let activeView = "all";
let calendarMode = "window";

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

function formatAge(value) {
  if (value === "" || value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(formatAge).filter(Boolean).join(", ");
  if (Number.isFinite(value)) return `P${value}`;
  const text = String(value).trim();
  if (!text) return "";
  return text
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return "";
      return /^p/i.test(trimmed) ? `P${trimmed.replace(/^p/i, "")}` : `P${trimmed}`;
    })
    .filter(Boolean)
    .join(", ");
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

function isActionableToday(task) {
  return task.state !== "done" && task.dueStart <= CONFIG.today;
}

function todayBucket(task) {
  if (task.state === "review") return "review";
  if (task.dueEnd < CONFIG.today) return "overdue";
  if (task.dueEnd === CONFIG.today) return "dueToday";
  return "todo";
}

function taskAppearsOnDate(task, date, mode) {
  if (task.state === "done") return false;
  if (mode === "due") return task.dueEnd === date;
  return task.dueStart <= date && date <= task.dueEnd;
}

function isFsLine(line) {
  return /\bFS\b/i.test(line);
}

function isExactFsSheet(line) {
  return normalizedText(line) === "cdkl5 fs";
}

function isInjectionTask(task) {
  return task.task === "Pup ASO Injection 1" || task.task === "Pup ASO Injection 2";
}

function isReviewAfterWindowTask(task) {
  return isInjectionTask(task) || task.task === "Plasma/Tissue Collection";
}

function taskCategoryClass(task) {
  return task.category ? `task-category-${task.category}` : "";
}

function isC57Line(line) {
  return normalizedText(line) === "c57";
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

function loadOldMouseState() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.oldMouseStorageKey)) || {};
  } catch {
    return {};
  }
}

function saveOldMouseState() {
  localStorage.setItem(CONFIG.oldMouseStorageKey, JSON.stringify(oldMouseState));
}

function bridgeEnabled() {
  return Boolean(CONFIG.oldMouseBridgeUrl);
}

function taskId(parts) {
  return [parts.task, parts.line, parts.cage, parts.dob || parts.row].join("|");
}

function classifyTask(task) {
  if (completionState[task.id]?.done) return "done";
  if (task.reviewNeeded) return "review";
  const today = CONFIG.today;
  if (isReviewAfterWindowTask(task) && today > task.dueEnd) return "review";
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

function isLitterMarker(value) {
  return /^(pups?|tagged\?|\d+\s*[MF]|\d+\s*M\s*\+\s*\d+\s*F|\d+\s*F\s*\+\s*\d+\s*M|\d+M\d+F|~\d+[MF])$/i.test(String(value || "").trim());
}

function litterFromCells(cells) {
  if (isLikelyAnimalRow(cells)) return null;
  const markerIndex = cells.findIndex(isLitterMarker);
  const dob = markerIndex >= 0 ? firstDateAfter(cells, markerIndex) : "";
  if (!dob) return null;
  return {
    dob,
    label: cells[markerIndex],
    count: extractCount(cells)
  };
}

function isCageNumber(value) {
  return /^\??\d{5,6}\??$/.test(String(value || "").trim());
}

function cageValueFromCells(cells) {
  return cells.slice(0, 4).find((cell) => isCageNumber(cell)) || "";
}

function cleanCage(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function sexIndex(cells) {
  return cells.findIndex((cell) => /^[MF]$/i.test(String(cell || "").trim()));
}

function parseAnimal(cells, rowNumber) {
  const foundSexIndex = sexIndex(cells);
  if (foundSexIndex < 0) return null;
  const dateIndex = cells.findIndex((cell) => normalizeDate(cell));
  const ageIndex = dateIndex >= 0 ? cells.findIndex((cell, index) => index > dateIndex && numericAge(cell) !== null) : -1;
  const tagIndex = foundSexIndex > 0 ? foundSexIndex - 1 : -1;
  const genotypeEnd = tagIndex > 2 ? tagIndex : foundSexIndex;
  const genotype = cells.slice(2, genotypeEnd).filter(Boolean).join(" / ");

  return {
    row: rowNumber,
    genotype,
    tag: tagIndex >= 0 ? cells[tagIndex] || "" : "",
    sex: cells[foundSexIndex] || "",
    dob: dateIndex >= 0 ? normalizeDate(cells[dateIndex]) : "",
    age: ageIndex >= 0 ? numericAge(cells[ageIndex]) : null,
    experiment: cells.slice(foundSexIndex + 1).filter(Boolean).join(" | "),
    notes: cells.join(" ").trim()
  };
}

function isLikelyAnimalRow(cells) {
  const text = cells.join(" ").toLowerCase();
  return sexIndex(cells) >= 0 && !/pups?|preg|breeding|weanlings|adults|males|females|to genotype/.test(text);
}

function sectionFromRow(cells) {
  const filled = cells.filter(Boolean);
  if (filled.length > 3) return "";
  const text = filled.join(" ").trim().toLowerCase();
  if (/^(breeders?|breeding)$/.test(text)) return "breeding";
  if (/^weanlings?$/.test(text)) return "weanlings";
  if (/^adults?$/.test(text)) return "adults";
  if (/^males?$/.test(text)) return "adults";
  if (/^females?$/.test(text)) return "adults";
  return "";
}

function numericAge(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function animalAgeSummary(animals) {
  const ages = animals
    .map((animal) => animal.age)
    .filter((age) => Number.isFinite(age));
  return [...new Set(ages)].sort((a, b) => a - b);
}

function parseSheetRows(sheetName, tableRows) {
  const rows = [];
  let currentCage = "";
  let currentDam = null;
  let cageAnimals = [];
  let currentSection = "";

  function flushAdultCage() {
    if (!currentCage || cageAnimals.length === 0) return;
    rows.push({
      type: "cage",
      line: sheetName,
      cage: currentCage,
      section: currentSection || "unknown",
      row: cageAnimals[0].row,
      animals: cageAnimals
    });

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
        age: animalAgeSummary(cageAnimals),
        missingTags: true,
        notes: noteText || "Adult cage has missing or unclear ear tags."
      });
    }
  }

  tableRows.forEach((row, index) => {
    const cells = Array.from({ length: 13 }, (_, col) => readCell(row.c?.[col]));
    const rowNumber = index + 1;
    const joined = cells.join(" ").trim();

    const nextSection = sectionFromRow(cells);
    if (nextSection) currentSection = nextSection;

    if (!joined) {
      flushAdultCage();
      currentCage = "";
      currentDam = null;
      cageAnimals = [];
      return;
    }

    const cageValue = cageValueFromCells(cells);
    if (cageValue) {
      flushAdultCage();
      currentCage = cleanCage(cageValue);
      cageAnimals = [];
      const parsedDam = parseAnimal(cells, rowNumber);
      currentDam = {
        genotype: parsedDam?.genotype || "",
        tag: parsedDam?.tag || "",
        sex: parsedDam?.sex || "",
        dob: parsedDam?.dob || ""
      };
    }

    if (currentCage && isLikelyAnimalRow(cells)) {
      const animal = parseAnimal(cells, rowNumber);
      if (animal) cageAnimals.push(animal);
    }

    const litter = litterFromCells(cells);
    if (currentCage && litter) {
      rows.push({
        line: sheetName,
        cage: currentCage,
        row: rowNumber,
        dam: currentDam,
        litter,
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
    if (row.type === "cage") return;

    if (row.litter?.dob) {
      const age = daysBetween(row.litter.dob, CONFIG.today);
      const detailParts = [
        row.litter.count ? `Count: ${row.litter.count}` : "",
        row.dam ? `Dam ${row.dam.tag || "unmarked"} ${row.dam.genotype || ""}`.trim() : "",
        row.notes || ""
      ].filter(Boolean);

      if (!isC57Line(row.line)) {
        tasks.push(makeTask({
          task: "Ear tag",
          category: "maintenance",
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
      }

      const weanStart = addDays(row.litter.dob, 22);
      const weanEnd = addDays(row.litter.dob, 28);
      tasks.push(makeTask({
        task: CONFIG.today > weanEnd ? "Wean info to spreadsheet" : "Wean",
        category: "maintenance",
        line: row.line,
        cage: row.cage,
        row: row.row,
        dob: row.litter.dob,
        dueStart: weanStart,
        dueEnd: weanEnd,
        age,
        details: detailParts.join(" | "),
        reviewNeeded: /weaned/i.test(row.notes || "")
      }));

      if (isExactFsSheet(row.line)) {
        const injectionTasks = [
          {
            task: "Pup ASO Injection 1",
            dueStart: row.litter.dob,
            dueEnd: addDays(row.litter.dob, 2)
          },
          {
            task: "Pup ASO Injection 2",
            dueStart: addDays(row.litter.dob, 6),
            dueEnd: addDays(row.litter.dob, 6)
          }
        ];

        injectionTasks
          .filter((task) => task.dueEnd >= CONFIG.today)
          .forEach((task) => {
            tasks.push(makeTask({
              task: task.task,
              category: "experimental",
              line: row.line,
              cage: row.cage,
              row: row.row,
              dob: row.litter.dob,
              dueStart: task.dueStart,
              dueEnd: task.dueEnd,
              age,
              details: `FS pup experimental timeline | ${detailParts.join(" | ")}`,
              reviewNeeded: false
            }));
          });

        tasks.push(makeTask({
          task: "Plasma/Tissue Collection",
          category: "experimental",
          line: row.line,
          cage: row.cage,
          row: row.row,
          dob: row.litter.dob,
          dueStart: addDays(row.litter.dob, 21),
          dueEnd: addDays(row.litter.dob, 21),
          age,
          details: `FS pup experimental timeline | ${detailParts.join(" | ")}`,
          reviewNeeded: false
        }));
      }
    }

    if (row.adultCage && row.missingTags) {
      if (isC57Line(row.line)) return;
      tasks.push(makeTask({
        task: "Adult missing tags",
        category: "maintenance",
        line: row.line,
        cage: row.cage,
        row: row.row,
        dob: "",
        dueStart: CONFIG.today,
        dueEnd: CONFIG.today,
        age: row.age || "",
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

function breederStatus(cage) {
  const ages = cage.animals.map((animal) => animal.age).filter((age) => Number.isFinite(age));
  if (ages.some((age) => age >= 200)) return "Replace";
  return "Good";
}

function normalizedText(value) {
  return String(value || "").toLowerCase();
}

function hasHet(animal) {
  return /\bhet\b/i.test(animal.genotype);
}

function hasFlFl(animal) {
  return /fl\/fl|flox\/flox|cdkl5 fl\/fl/i.test(animal.genotype);
}

function hasSatPlusPlus(animal) {
  return /\+\/\+|satb2 cre\+\/cre\+/i.test(animal.genotype);
}

function hasSatPlus(animal) {
  return /(^|\/|\s)\+($|\/|\s)|\+\/-|cre\+/i.test(animal.genotype);
}

function isAgeAppropriate(animal) {
  return Number.isFinite(animal.age) && animal.age >= 60 && animal.age <= 200;
}

function isMale(animal) {
  return /^M$/i.test(animal.sex);
}

function isFemale(animal) {
  return /^F$/i.test(animal.sex);
}

function replacementPrograms(animal) {
  if (!isAgeAppropriate(animal)) return [];
  const line = normalizedText(animal.line);
  const programs = [];

  if (line === "c57") {
    programs.push("C57");
    if (isMale(animal)) {
      programs.push("CDKL5 KO", "CDKL5 FS", "CDKL5 Flox", "Satb2 Cre");
    }
  }

  if (line === "cdkl5 ko" && isFemale(animal) && hasHet(animal)) {
    programs.push("CDKL5 KO");
  }

  if (line === "cdkl5 fs" && isFemale(animal) && hasHet(animal)) {
    programs.push("CDKL5 FS");
  }

  if (line === "cdkl5 flox" && isFemale(animal) && hasFlFl(animal)) {
    programs.push("CDKL5 Flox");
  }

  if (line === "satb2 cre") {
    if (isFemale(animal) && hasSatPlusPlus(animal)) programs.push("Satb2 Cre");
    if (isMale(animal) && hasSatPlusPlus(animal)) programs.push("CDKL5 KO x Satb2", "CDKL5 FS x Satb2");
  }

  if (line === "cdkl5 ko x satb2" && isFemale(animal) && hasHet(animal) && hasSatPlus(animal)) {
    programs.push("CDKL5 KO x Satb2");
  }

  if (line === "cdkl5 fs x satb2" && isFemale(animal) && hasHet(animal) && hasSatPlus(animal)) {
    programs.push("CDKL5 FS x Satb2");
  }

  return [...new Set(programs)];
}

function buildBreederData(rows) {
  const cages = rows.filter((row) => row.type === "cage");
  const isBreederCage = (cage) => cage.section === "breeding" || CURRENT_BREEDER_CAGES[cage.line]?.includes(cage.cage);
  const breederCages = cages
    .filter(isBreederCage)
    .map((cage) => ({ ...cage, breederStatus: breederStatus(cage) }));

  const replacementOptions = cages
    .filter((cage) => !isBreederCage(cage))
    .flatMap((cage) => cage.animals
      .flatMap((animal) => replacementPrograms({ ...animal, line: cage.line })
        .map((program) => ({ ...animal, cage: cage.cage, line: cage.line, section: cage.section, program }))));

  return { breederCages, replacementOptions };
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

function loadOldMouseBridgeState() {
  if (!bridgeEnabled()) return Promise.resolve(oldMouseState);

  const params = new URLSearchParams({ action: "oldState" });
  return bridgeJsonp(params, "oldMouseState");
}

function bridgeJsonp(params, callbackPrefix) {
  return new Promise((resolve, reject) => {
    const callbackName = `${callbackPrefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("The shared Sheets bridge did not respond."));
    }, 10000);

    function cleanup() {
      delete window[callbackName];
      script.remove();
      window.clearTimeout(timeout);
    }

    params.set("callback", callbackName);

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload || {});
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Could not reach the shared Sheets bridge."));
    };

    script.src = `${CONFIG.oldMouseBridgeUrl}?${params.toString()}`;
    document.head.append(script);
  });
}

function saveOldMouseBridgeState(mouse, state) {
  if (!bridgeEnabled()) return Promise.resolve();
  if (!Number.isInteger(Number(mouse.row)) || Number(mouse.row) < 2) {
    return Promise.reject(new Error(`Unsafe old mouse row: ${mouse.row || "missing"}`));
  }
  const params = new URLSearchParams({
    action: "saveOldMouse",
    id: mouse.id,
    line: mouse.line,
    cage: mouse.cage,
    row: String(mouse.row),
    tag: mouse.tag || "",
    sex: mouse.sex || "",
    status: state?.status || "",
    keepDate: state?.keepDate || "",
    note: state?.note || ""
  });
  return bridgeJsonp(params, "oldMouseSave");
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

  const tasks = visibleTasks().filter((task) => {
    if (status === "open" && task.state === "done") return false;
    if (status !== "open" && status !== "all" && task.state !== status) return false;
    return true;
  });
  return sortTasks(tasks);
}

function sortTasks(tasks) {
  const sortMode = els.sortSelect.value;
  const direction = sortMode.endsWith("desc") ? -1 : 1;
  const field = sortMode.startsWith("dob") ? "dob" : sortMode.startsWith("age") ? "age" : sortMode.startsWith("line") ? "line" : "dueEnd";

  return [...tasks].sort((a, b) => {
    const aValue = sortValue(a, field);
    const bValue = sortValue(b, field);
    return direction * (compareSortValues(aValue, bValue) || a.cage.localeCompare(b.cage) || a.task.localeCompare(b.task));
  });
}

function sortValue(item, field) {
  if (field === "age") {
    if (Array.isArray(item.age)) return Math.max(...item.age.filter((age) => Number.isFinite(age)), -1);
    return Number.isFinite(item.age) ? item.age : -1;
  }
  return item[field] || "";
}

function compareSortValues(aValue, bValue) {
  if (typeof aValue === "number" || typeof bValue === "number") return aValue - bValue;
  return String(aValue).localeCompare(String(bValue));
}

function makeDoneToggle(task) {
  const done = document.createElement("input");
  done.className = "done-toggle";
  done.type = "checkbox";
  done.setAttribute("aria-label", `Mark ${task.task} for cage ${task.cage} done`);
  done.checked = Boolean(completionState[task.id]?.done);
  done.addEventListener("change", () => {
    const previous = completionState[task.id] || {};
    completionState[task.id] = {
      done: done.checked,
      completedAt: done.checked ? previous.completedAt || new Date().toISOString() : "",
      sheetConfirmed: done.checked ? Boolean(previous.sheetConfirmed) : false,
      sheetConfirmedAt: done.checked ? previous.sheetConfirmedAt || "" : ""
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

    row.classList.add(taskCategoryClass(task));
    doneCell.innerHTML = "";
    doneCell.append(makeDoneToggle(task));
    pill.textContent = task.state.replace("-", " ");
    pill.className = `state-pill state-${task.state}`;
    row.querySelector(".task-name").textContent = task.task;
    row.querySelector(".cage").textContent = task.cage;
    row.querySelector(".line").textContent = task.line;
    row.querySelector(".window").textContent = `${formatDate(task.dueStart)} - ${formatDate(task.dueEnd)}`;
    row.querySelector(".age").textContent = formatAge(task.age) || "P?";
    row.querySelector(".details").textContent = task.details || "";

    els.rows.append(row);
  });
}

function renderToday(tasks) {
  const todayTasks = tasks.filter(isActionableToday);
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
    ["dueToday", "Due Today"],
    ["todo", "To-Do"],
    ["review", "Needs Review"]
  ];

  groups.forEach(([state, title]) => {
    const groupTasks = todayTasks.filter((task) => todayBucket(task) === state);
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
  card.className = `task-card task-card-${task.state} ${taskCategoryClass(task)}`;
  const age = formatAge(task.age) || "P?";
  const meta = `${task.line} | ${age}`;

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
  els.calendarTitle.textContent = `${range.title} | ${calendarMode === "due" ? "Due dates only" : "Task windows"}`;
  els.calendarView.innerHTML = "";

  for (let index = 0; index < range.days; index += 1) {
    const date = addDays(range.start, index);
    const dayTasks = tasks.filter((task) => taskAppearsOnDate(task, date, calendarMode));
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
      const visibleLimit = view === "month" ? 6 : 18;
      const visibleTasksForDay = dayTasks.slice(0, visibleLimit);
      const groupedTasks = visibleTasksForDay.reduce((groups, task) => {
        if (!groups.has(task.line)) groups.set(task.line, []);
        groups.get(task.line).push(task);
        return groups;
      }, new Map());

      groupedTasks.forEach((lineTasks, line) => {
        const group = document.createElement("div");
        group.className = "calendar-line-group";
        const lineHeader = document.createElement("div");
        lineHeader.className = "calendar-line-name";
        lineHeader.textContent = line;
        group.append(lineHeader);

        lineTasks.forEach((task) => {
          const item = document.createElement("button");
          item.className = `calendar-task calendar-task-${task.state} ${taskCategoryClass(task)}`;
          item.type = "button";
          item.title = `${task.line} | ${task.details || ""}`;
          item.textContent = `${task.task}: ${task.cage}`;
          group.append(item);
        });

        cell.append(group);
      });
      if (dayTasks.length > visibleLimit) {
        const more = document.createElement("p");
        more.className = "calendar-more";
        more.textContent = `+${dayTasks.length - visibleLimit} more`;
        cell.append(more);
      }
    }

    els.calendarView.append(cell);
  }
}

function matchesBreederFilters(valueParts) {
  const line = els.lineFilter.value;
  const query = els.searchInput.value.trim().toLowerCase();
  const haystack = valueParts.filter(Boolean).join(" ").toLowerCase();
  if (line !== "all" && !valueParts.includes(line)) return false;
  if (!query) return true;
  return haystack.includes(query);
}

function renderBreeders(rows) {
  const rawData = buildBreederData(rows);
  const breederCages = rawData.breederCages.filter((cage) => matchesBreederFilters([
    cage.line,
    cage.cage,
    cage.breederStatus,
    cage.animals.map((animal) => animal.notes).join(" ")
  ]));
  const replacementOptions = rawData.replacementOptions.filter((animal) => matchesBreederFilters([
    animal.program,
    animal.line,
    animal.cage,
    animal.tag,
    animal.sex,
    animal.genotype,
    animal.notes
  ]));
  els.breedersView.innerHTML = "";

  const summary = document.createElement("section");
  summary.className = "breeder-summary";
  summary.innerHTML = `
    <div><strong>${breederCages.length}</strong><span>Breeding cages</span></div>
    <div><strong>${breederCages.filter((cage) => cage.breederStatus === "Good").length}</strong><span>Good</span></div>
    <div><strong>${breederCages.filter((cage) => cage.breederStatus === "Replace").length}</strong><span>Replace</span></div>
  `;
  els.breedersView.append(summary);

  const breederSection = document.createElement("section");
  breederSection.className = "breeder-section";
  breederSection.innerHTML = "<h2>Breeding Cages</h2>";
  breederSection.append(breederLineGroups(breederCages));
  els.breedersView.append(breederSection);

  const replacementSection = document.createElement("section");
  replacementSection.className = "breeder-section";
  replacementSection.innerHTML = "<h2>Replacement Options <span>No filters for inbreeding.</span></h2>";
  replacementSection.append(replacementGroups(replacementOptions));
  els.breedersView.append(replacementSection);
}

function breederLineGroups(cages) {
  const wrap = document.createElement("div");
  wrap.className = "breeder-line-groups";
  const lines = [...new Set(cages.map((cage) => cage.line))].sort();

  if (lines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "calendar-empty";
    empty.textContent = "No breeding cages match the current filters.";
    wrap.append(empty);
    return wrap;
  }

  lines.forEach((lineName) => {
    const lineCages = cages.filter((cage) => cage.line === lineName);
    const lineBlock = document.createElement("section");
    lineBlock.className = "breeder-line-group";
    const title = document.createElement("h3");
    title.textContent = `${lineName} (${lineCages.length})`;
    const grid = document.createElement("div");
    grid.className = "breeder-grid";
    lineCages.forEach((cage) => grid.append(breederCageCard(cage)));
    lineBlock.append(title, grid);
    wrap.append(lineBlock);
  });

  return wrap;
}

function breederCageCard(cage) {
  const card = document.createElement("article");
  card.className = `breeder-card breeder-${cage.breederStatus.toLowerCase().replace(" ", "-")}`;
  const ages = cage.animals.map((animal) => formatAge(animal.age) || "P?");
  const animals = cage.animals.map((animal) => `${animal.tag || "unmarked"} ${animal.sex || "?"} ${formatAge(animal.age) || "P?"}`).join(", ");
  card.innerHTML = "";

  const title = document.createElement("div");
  title.className = "breeder-card-title";
  title.textContent = `Cage ${cage.cage}`;
  const status = document.createElement("span");
  status.className = "breeder-status";
  status.textContent = cage.breederStatus;
  const ageLine = document.createElement("strong");
  ageLine.textContent = ages.join(", ");
  const detail = document.createElement("small");
  detail.textContent = animals;
  card.append(title, status, ageLine, detail);
  return card;
}

function replacementCard(animal) {
  const card = document.createElement("article");
  card.className = "replacement-card";
  const title = document.createElement("strong");
  title.textContent = `Cage ${animal.cage} | ${animal.tag || "unmarked"}`;
  const meta = document.createElement("p");
  meta.textContent = `${animal.line} | ${animal.sex || "?"} | ${formatAge(animal.age) || "P?"} | ${animal.genotype || "genotype ?"}`;
  const note = document.createElement("small");
  note.textContent = animal.experiment || animal.notes || "";
  card.append(title, meta, note);
  return card;
}

function replacementCriteriaLabel(program, sex) {
  const labels = {
    "C57": {
      M: "C57 MALES",
      F: "C57 FEMALES"
    },
    "CDKL5 KO": {
      M: "C57 MALES",
      F: "CDKL5KO HET FEMALES"
    },
    "CDKL5 FS": {
      M: "C57 MALES",
      F: "CDKL5FS HET FEMALES"
    },
    "CDKL5 Flox": {
      M: "C57 MALES",
      F: "CDKL5 FLOX FL/FL FEMALES"
    },
    "Satb2 Cre": {
      M: "C57 MALES",
      F: "SATB2 +/+ FEMALES"
    },
    "CDKL5 KO x Satb2": {
      M: "SATB2 +/+ MALES",
      F: "CDKL5KO x SATB2 HET + FEMALES"
    },
    "CDKL5 FS x Satb2": {
      M: "SATB2 +/+ MALES",
      F: "CDKL5FS x SATB2 HET + FEMALES"
    }
  };
  return labels[program]?.[sex] || (sex === "M" ? "MALES" : "FEMALES");
}

function replacementGroups(options) {
  const wrap = document.createElement("div");
  wrap.className = "replacement-programs";
  const programs = BREEDING_PROGRAMS;

  programs.forEach((program) => {
    const programOptions = options.filter((option) => option.program === program);
    const programBlock = document.createElement("details");
    programBlock.className = "replacement-program";
    programBlock.open = false;
    const title = document.createElement("summary");
    title.textContent = `${program} (${programOptions.length})`;
    programBlock.append(title);

    ["M", "F"].forEach((sex) => {
      const sexOptions = programOptions.filter((option) => option.sex.toUpperCase() === sex);
      const sexBlock = document.createElement("div");
      sexBlock.className = "replacement-sex-group";
      const sexTitle = document.createElement("h4");
      sexTitle.textContent = replacementCriteriaLabel(program, sex);
      sexBlock.append(sexTitle);

      if (sexOptions.length === 0) {
        const empty = document.createElement("p");
        empty.className = "calendar-empty";
        empty.textContent = "No options";
        sexBlock.append(empty);
      } else {
        const grid = document.createElement("div");
        grid.className = "replacement-grid";
        sexOptions.forEach((animal) => grid.append(replacementCard(animal)));
        sexBlock.append(grid);
      }

      programBlock.append(sexBlock);
    });

    wrap.append(programBlock);
  });

  return wrap;
}

function oldMouseId(mouse) {
  return [mouse.line, mouse.cage, mouse.row, mouse.tag || "unmarked", mouse.sex || "?"].join("|");
}

function buildOldMice(rows) {
  return rows
    .filter((row) => row.type === "cage")
    .flatMap((cage) => cage.animals
      .filter((animal) => Number.isFinite(animal.age) && animal.age > 220)
      .map((animal) => {
        const mouse = { ...animal, line: cage.line, cage: cage.cage };
        mouse.id = oldMouseId(mouse);
        mouse.oldState = oldMouseState[mouse.id] || {};
        return mouse;
      }));
}

function matchesOldFilters(mouse) {
  const line = els.lineFilter.value;
  const query = els.searchInput.value.trim().toLowerCase();
  const haystack = [mouse.line, mouse.cage, mouse.tag, mouse.sex, mouse.genotype, mouse.notes, mouse.oldState.note].filter(Boolean).join(" ").toLowerCase();
  if (line !== "all" && mouse.line !== line) return false;
  return !query || haystack.includes(query);
}

function isOldMouseAssigned(mouse) {
  const state = mouse.oldState;
  if (state.status === "SAC") return true;
  if (state.status === "KEEP" && state.keepDate && state.keepDate >= CONFIG.today) return true;
  return false;
}

function sortOldMice(mice) {
  const sortMode = els.sortSelect.value;
  const direction = sortMode.endsWith("desc") ? -1 : 1;
  const field = sortMode.startsWith("line") ? "line" : sortMode.startsWith("dob") ? "dob" : "age";
  return [...mice].sort((a, b) => direction * (compareSortValues(sortValue(a, field), sortValue(b, field)) || a.cage.localeCompare(b.cage) || String(a.tag || "").localeCompare(String(b.tag || ""))));
}

function renderOld(rows) {
  const mice = sortOldMice(buildOldMice(rows).filter(matchesOldFilters));
  const needsReview = mice.filter((mouse) => !isOldMouseAssigned(mouse));
  const assigned = mice.filter(isOldMouseAssigned);
  els.oldView.innerHTML = "";

  const summary = document.createElement("section");
  summary.className = "breeder-summary";
  summary.innerHTML = `
    <div><strong>${mice.length}</strong><span>Over P220</span></div>
    <div><strong>${needsReview.length}</strong><span>Needs review</span></div>
    <div><strong>${assigned.length}</strong><span>Assigned</span></div>
  `;
  els.oldView.append(summary, oldMouseSection("Needs Review", needsReview), oldMouseSection("Assigned", assigned));
}

function oldMouseSection(title, mice) {
  const section = document.createElement("section");
  section.className = "breeder-section";
  const heading = document.createElement("h2");
  heading.textContent = `${title} (${mice.length})`;
  const grid = document.createElement("div");
  grid.className = "old-mouse-grid";
  if (mice.length === 0) {
    const empty = document.createElement("p");
    empty.className = "calendar-empty";
    empty.textContent = "No mice match this group.";
    grid.append(empty);
  } else {
    mice.forEach((mouse) => grid.append(oldMouseCard(mouse)));
  }
  section.append(heading, grid);
  return section;
}

function oldMouseCard(mouse) {
  const state = mouse.oldState;
  const displayStatus = state.status === "KEEP" && state.keepDate < CONFIG.today ? "Review" : state.status || "Unassigned";
  const card = document.createElement("article");
  card.className = `old-mouse-card old-mouse-${displayStatus.toLowerCase() === "unassigned" ? "review" : displayStatus.toLowerCase()}`;

  const title = document.createElement("div");
  title.className = "breeder-card-title";
  title.textContent = `Cage ${mouse.cage} | ${mouse.tag || "unmarked"}`;
  const meta = document.createElement("p");
  meta.textContent = `${mouse.line} | ${mouse.sex || "?"} | ${formatAge(mouse.age)} | ${mouse.genotype || "genotype ?"}`;
  const status = document.createElement("span");
  status.className = "breeder-status";
  status.textContent = displayStatus;

  const controls = document.createElement("div");
  controls.className = "old-mouse-actions";
  const sacButton = document.createElement("button");
  sacButton.type = "button";
  sacButton.textContent = "SAC";
  sacButton.addEventListener("click", () => updateOldMouse(mouse, { status: "SAC", keepDate: "", note: state.note || "" }));
  const keepButton = document.createElement("button");
  keepButton.type = "button";
  keepButton.textContent = "Keep";
  keepButton.addEventListener("click", () => updateOldMouse(mouse, { status: "KEEP", keepDate: state.keepDate || CONFIG.today, note: state.note || "" }));
  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "Clear";
  clearButton.addEventListener("click", () => updateOldMouse(mouse, null));
  controls.append(sacButton, keepButton, clearButton);

  const keepFields = document.createElement("div");
  keepFields.className = "old-keep-fields";
  const keepDate = document.createElement("input");
  keepDate.type = "date";
  keepDate.value = state.keepDate || "";
  keepDate.addEventListener("change", () => updateOldMouse(mouse, { ...oldMouseState[mouse.id], status: "KEEP", keepDate: keepDate.value }));
  const note = document.createElement("input");
  note.type = "text";
  note.placeholder = "Keep note";
  note.value = state.note || "";
  note.addEventListener("change", () => updateOldMouse(mouse, { ...oldMouseState[mouse.id], note: note.value }));
  keepFields.append(keepDate, note);

  const detail = document.createElement("small");
  detail.textContent = mouse.experiment || mouse.notes || "";
  card.append(title, meta, status, controls, keepFields, detail);
  return card;
}

function updateOldMouse(mouse, state) {
  const id = mouse.id;
  if (state) {
    oldMouseState[id] = state;
  } else {
    delete oldMouseState[id];
  }
  saveOldMouseState();
  saveOldMouseBridgeState(mouse, state).catch((error) => {
    console.error(error);
    els.lastUpdated.textContent = "Old mouse choice saved locally; Sheets bridge is not reachable.";
  });
  render();
}

function bridgeTasks() {
  return sortTasks(visibleTasks().filter((task) => completionState[task.id]?.done));
}

function renderSheetsBridge() {
  const tasks = bridgeTasks();
  const needsUpdate = tasks.filter((task) => !completionState[task.id]?.sheetConfirmed);
  const confirmed = tasks.filter((task) => completionState[task.id]?.sheetConfirmed);
  els.sheetsBridgeView.innerHTML = "";

  const summary = document.createElement("section");
  summary.className = "breeder-summary";
  summary.innerHTML = `
    <div><strong>${tasks.length}</strong><span>Checked off</span></div>
    <div><strong>${needsUpdate.length}</strong><span>Needs Sheet update</span></div>
    <div><strong>${confirmed.length}</strong><span>Confirmed</span></div>
  `;
  els.sheetsBridgeView.append(
    summary,
    bridgeTaskSection("Needs Sheet Update", needsUpdate, false),
    bridgeTaskSection("Confirmed In Sheet", confirmed, true)
  );
}

function bridgeTaskSection(title, tasks, confirmed) {
  const section = document.createElement("section");
  section.className = "breeder-section";
  const heading = document.createElement("h2");
  heading.textContent = `${title} (${tasks.length})`;
  const grid = document.createElement("div");
  grid.className = "bridge-task-grid";
  if (tasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "calendar-empty";
    empty.textContent = confirmed ? "No confirmed spreadsheet updates yet." : "No checked-off tasks are waiting for spreadsheet confirmation.";
    grid.append(empty);
  } else {
    tasks.forEach((task) => grid.append(bridgeTaskCard(task)));
  }
  section.append(heading, grid);
  return section;
}

function bridgeTaskCard(task) {
  const state = completionState[task.id] || {};
  const card = document.createElement("article");
  card.className = `bridge-task-card ${state.sheetConfirmed ? "bridge-confirmed" : "bridge-pending"} ${taskCategoryClass(task)}`;

  const title = document.createElement("div");
  title.className = "breeder-card-title";
  title.textContent = `${task.task} | Cage ${task.cage}`;
  const meta = document.createElement("p");
  meta.textContent = `${task.line} | ${formatAge(task.age) || "P?"} | checked ${state.completedAt ? formatDate(state.completedAt.slice(0, 10)) : "today"}`;
  const detail = document.createElement("small");
  detail.textContent = task.details || "";
  const action = document.createElement("button");
  action.type = "button";
  action.textContent = state.sheetConfirmed ? "Needs Sheet Update" : "Confirmed in Sheet";
  action.addEventListener("click", () => setSheetConfirmed(task.id, !state.sheetConfirmed));
  card.append(title, meta, detail, action);
  return card;
}

function setSheetConfirmed(taskIdValue, confirmed) {
  const previous = completionState[taskIdValue] || {};
  completionState[taskIdValue] = {
    ...previous,
    done: true,
    completedAt: previous.completedAt || new Date().toISOString(),
    sheetConfirmed: confirmed,
    sheetConfirmedAt: confirmed ? new Date().toISOString() : ""
  };
  saveCompletionState();
  render();
}

function setActiveView(view) {
  activeView = view;
  els.viewTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  render();
}

function setCalendarMode(mode) {
  calendarMode = mode;
  els.calendarModeButtons.forEach((button) => button.classList.toggle("active", button.dataset.calendarMode === mode));
  render();
}

function render() {
  updateSummary(taskCache);
  const tasks = activeView === "all" ? filteredTasks() : visibleTasks();
  const taskSummaryViews = ["all", "today", "week", "month"];

  els.summaryGrid.classList.toggle("hidden", !taskSummaryViews.includes(activeView));
  els.tableView.classList.toggle("hidden", activeView !== "all");
  els.todayView.classList.toggle("hidden", activeView !== "today");
  els.calendarView.classList.toggle("hidden", activeView !== "week" && activeView !== "month");
  els.breedersView.classList.toggle("hidden", activeView !== "breeders");
  els.oldView.classList.toggle("hidden", activeView !== "old");
  els.sheetsBridgeView.classList.toggle("hidden", activeView !== "sheetsBridge");
  els.calendarHeader.classList.toggle("hidden", activeView !== "week" && activeView !== "month");
  els.statusFilter.disabled = activeView !== "all";

  if (activeView === "all") renderTable(tasks);
  if (activeView === "today") renderToday(tasks);
  if (activeView === "week" || activeView === "month") renderCalendar(tasks, activeView);
  if (activeView === "breeders") renderBreeders(sourceRows);
  if (activeView === "old") renderOld(sourceRows);
  if (activeView === "sheetsBridge") renderSheetsBridge();
}

async function refresh() {
  els.refreshButton.disabled = true;
  els.refreshButton.textContent = "Refreshing";
  try {
    const rows = await loadRows();
    sourceRows = rows;
    taskCache = buildTasks(rows);
    oldMouseState = await loadOldMouseBridgeState().catch((error) => {
      console.error(error);
      return oldMouseState;
    });
    saveOldMouseState();
    populateLineFilter([...taskCache, ...buildOldMice(rows)]);
    render();
    const source = els.lastUpdated.dataset.source === "fallback" ? "sample fallback" : "live Google Sheet";
    els.lastUpdated.textContent = `Updated from ${source} ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } finally {
    els.refreshButton.disabled = false;
    els.refreshButton.textContent = "Refresh";
  }
}

[els.statusFilter, els.taskFilter, els.lineFilter, els.sortSelect, els.searchInput].forEach((el) => {
  el.addEventListener("input", render);
});
els.viewTabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveView(tab.dataset.view));
});
els.calendarModeButtons.forEach((button) => {
  button.addEventListener("click", () => setCalendarMode(button.dataset.calendarMode));
});
els.refreshButton.addEventListener("click", refresh);
els.refreshSchedule.textContent = `Auto-refreshes every ${Math.round(CONFIG.autoRefreshMs / 60000)} min while open`;
refresh();
setInterval(refresh, CONFIG.autoRefreshMs);
