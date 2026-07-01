const SPREADSHEET_ID = "1G_w47rJrhOWsuK_Qpvs8vgC7VCyYLnjR6QvCZ87rR6k";
const APP_ACTIONS_SHEET = "App Actions";
const APP_ACTION_HEADERS = [
  "Timestamp",
  "User",
  "Session ID",
  "Action",
  "Task ID",
  "Task",
  "Line",
  "Cage",
  "Source Row",
  "DOB",
  "Previous State",
  "New State",
  "Details",
  "App Version",
  "Reconciliation Status"
];
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
  if (requestAction === "appState" || requestAction === "oldState") return buildAppState_();
  if (requestAction === "saveAction" || requestAction === "saveOldMouse") {
    appendAppAction_(params);
    return { ok: true };
  }
  return { error: "Unknown action" };
}

function buildAppState_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ensureAppActionsSheet_(ss);
  const values = sheet.getDataRange().getDisplayValues();
  const tasks = {};
  const oldMice = {};
  const reconciled = {};

  values.slice(1).forEach((row) => {
    const action = row[3];
    const id = row[4];
    if (!action || !id) return;
    const timestamp = row[0];
    const user = row[1] || "unknown";
    const nextState = parseJson_(row[11]) || {};
    const details = row[12] || "";
    const appVersion = row[13] || "";
    const reconciliationStatus = row[14] || "";

    if (action === "taskDone" || action === "sheetConfirmed") {
      tasks[id] = {
        ...tasks[id],
        ...nextState,
        id,
        task: row[5] || "",
        line: row[6] || "",
        cage: row[7] || "",
        row: row[8] || "",
        dob: row[9] || "",
        details,
        appVersion,
        updatedAt: timestamp,
        updatedBy: user
      };
    }

    if (action === "reconciliation") {
      reconciled[id] = {
        id,
        task: row[5] || "",
        line: row[6] || "",
        cage: row[7] || "",
        row: row[8] || "",
        dob: row[9] || "",
        details,
        appVersion,
        reconciliationStatus,
        updatedAt: timestamp,
        updatedBy: user
      };
    }

    if (action === "oldMouse") {
      if (nextState.cleared) {
        delete oldMice[id];
      } else {
        oldMice[id] = {
          status: nextState.status || "",
          keepDate: nextState.keepDate || "",
          note: nextState.note || details || "",
          updatedAt: timestamp,
          updatedBy: user
        };
      }
    }
  });

  return { tasks, oldMice, reconciled };
}

function appendAppAction_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ensureAppActionsSheet_(ss);
    const timestamp = new Date();
    const user = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || "unknown";
    const action = params.logAction || actionFromLegacyParams_(params);
    const nextState = params.nextState || legacyNextState_(params);

    sheet.appendRow([
      timestamp,
      user,
      params.sessionId || "",
      action,
      params.id || "",
      params.task || "",
      params.line || "",
      params.cage || "",
      params.row || "",
      params.dob || "",
      params.previousState || "",
      nextState || "",
      params.details || params.note || "",
      params.appVersion || "",
      params.reconciliationStatus || ""
    ]);
  } finally {
    lock.releaseLock();
  }
}

function ensureAppActionsSheet_(ss) {
  const sheet = ss.getSheetByName(APP_ACTIONS_SHEET) || ss.insertSheet(APP_ACTIONS_SHEET);
  const headerRange = sheet.getRange(1, 1, 1, APP_ACTION_HEADERS.length);
  const current = headerRange.getDisplayValues()[0];
  const needsHeader = APP_ACTION_HEADERS.some((header, index) => current[index] !== header);
  if (needsHeader) {
    headerRange.setValues([APP_ACTION_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function actionFromLegacyParams_(params) {
  if (params.action === "saveOldMouse") return "oldMouse";
  return params.logAction || "";
}

function legacyNextState_(params) {
  if (params.action !== "saveOldMouse") return params.nextState || "";
  if (!params.status) return JSON.stringify({ cleared: true });
  return JSON.stringify({
    status: params.status || "",
    keepDate: params.keepDate || "",
    note: params.note || ""
  });
}

function parseJson_(value) {
  try {
    return JSON.parse(value || "{}");
  } catch (error) {
    return {};
  }
}
