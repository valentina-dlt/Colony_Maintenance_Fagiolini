const SPREADSHEET_ID = "1G_w47rJrhOWsuK_Qpvs8vgC7VCyYLnjR6QvCZ87rR6k";
const SAC_KEEP_HEADER = "SAC/Keep Notes";
const ACTIVE_SHEETS = [
  "CDKL5 KO",
  "CDKL5 FS",
  "CDKL5 Flox",
  "Satb2 Cre",
  "C57",
  "CDKL5 KO x Satb2",
  "CDKL5 FS x Satb2",
  "CDKL5 Flox x Satb2 Cre",
  "CDKL5 FL x Fox J1 Cre"
];

function doGet(e) {
  const params = e?.parameter || {};
  const requestAction = params.action || "oldState";
  const responseBody = handleRequest_(requestAction, params);
  const output = JSON.stringify(responseBody);
  const callback = params.callback;
  return ContentService
    .createTextOutput(callback ? `${callback}(${output});` : output)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function doPost(e) {
  const params = e?.parameter || {};
  handleRequest_(params.action, params);
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleRequest_(requestAction, params) {
  if (requestAction === "oldState") return buildOldMouseState_();
  if (requestAction === "saveOldMouse") {
    saveOldMouse_(params);
    return { ok: true };
  }
  return { error: "Unknown action" };
}

function buildOldMouseState_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const state = {};
  ACTIVE_SHEETS.forEach((sheetName) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    const noteColumn = findSacKeepColumn_(sheet);
    if (!noteColumn) return;
    const values = sheet.getDataRange().getDisplayValues();
    values.forEach((cells, index) => {
      const note = cells[noteColumn - 1];
      if (!note) return;
      const animal = parseAnimalRow_(cells, index + 1, sheetName);
      if (!animal || !animal.id) return;
      state[animal.id] = parseSacKeepNote_(note);
    });
  });
  return state;
}

function saveOldMouse_(params) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(params.line);
  if (!sheet) throw new Error(`Sheet not found: ${params.line}`);
  const row = Number(params.row);
  if (!Number.isInteger(row) || row < 2) throw new Error(`Unsafe row: ${params.row}`);
  const values = sheet.getRange(row, 1, 1, sheet.getMaxColumns()).getDisplayValues()[0];
  const animal = parseAnimalRow_(values, row, params.line);
  if (!animal || animal.id !== params.id) {
    throw new Error(`Animal row mismatch. Expected ${params.id}, found ${animal?.id || "none"}`);
  }
  const noteColumn = ensureSacKeepColumn_(sheet);
  sheet.getRange(row, noteColumn).setValue(formatSacKeepNote_(params));
}

function findSacKeepColumn_(sheet) {
  const scanRows = Math.min(5, sheet.getMaxRows());
  const values = sheet.getRange(1, 1, scanRows, sheet.getMaxColumns()).getDisplayValues();
  for (let row = 0; row < values.length; row += 1) {
    const index = values[row].findIndex((cell) => String(cell || "").trim().toLowerCase() === SAC_KEEP_HEADER.toLowerCase());
    if (index >= 0) return index + 1;
  }
  return 0;
}

function ensureSacKeepColumn_(sheet) {
  const existing = findSacKeepColumn_(sheet);
  if (existing) return existing;
  const column = sheet.getLastColumn() + 1;
  sheet.getRange(1, column).setValue(SAC_KEEP_HEADER);
  return column;
}

function parseAnimalRow_(cells, row, line) {
  const sexIndex = cells.findIndex((cell) => /^[MF]$/i.test(String(cell || "").trim()));
  if (sexIndex < 0) return null;
  const dateIndex = cells.findIndex((cell) => normalizeDate_(cell));
  const ageIndex = dateIndex >= 0 ? cells.findIndex((cell, index) => index > dateIndex && numericAge_(cell) !== null) : -1;
  const tagIndex = sexIndex > 0 ? sexIndex - 1 : -1;
  const cage = findCageAbove_(line, row);
  const tag = tagIndex >= 0 ? cells[tagIndex] || "" : "";
  return {
    id: [line, cage, row, tag || "unmarked", cells[sexIndex] || "?"].join("|"),
    age: ageIndex >= 0 ? numericAge_(cells[ageIndex]) : null
  };
}

function findCageAbove_(sheetName, row) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  const values = sheet.getRange(1, 1, row, 4).getDisplayValues();
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const cage = values[index].find((cell) => /^\??\d{5,6}\??$/.test(String(cell || "").trim()));
    if (cage) return String(cage).replace(/[^\d]/g, "");
  }
  return "";
}

function formatSacKeepNote_(params) {
  if (!params.status) return "";
  const parts = [`status=${params.status}`];
  if (params.keepDate) parts.push(`keep_date=${params.keepDate}`);
  if (params.note) parts.push(`note=${String(params.note).replace(/\n/g, " ")}`);
  parts.push(`updated=${new Date().toISOString()}`);
  return parts.join("; ");
}

function parseSacKeepNote_(note) {
  const state = {};
  String(note || "").split(";").forEach((part) => {
    const [rawKey, ...rest] = part.split("=");
    const key = String(rawKey || "").trim();
    const value = rest.join("=").trim();
    if (key === "status") state.status = value;
    if (key === "keep_date") state.keepDate = value;
    if (key === "note") state.note = value;
  });
  return state;
}

function normalizeDate_(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return "";
  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  const rawYear = match[3];
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${year}-${month}-${day}`;
}

function numericAge_(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}
