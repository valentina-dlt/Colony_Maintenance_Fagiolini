const SPREADSHEET_ID = "1G_w47rJrhOWsuK_Qpvs8vgC7VCyYLnjR6QvCZ87rR6k";

function doGet() {
  const rows = buildColonyRows_();
  return ContentService
    .createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildColonyRows_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const activeSheets = [
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
  ];

  return activeSheets.flatMap((sheetName) => parseSheet_(ss.getSheetByName(sheetName), sheetName));
}

function parseSheet_(sheet, line) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const rows = [];
  let currentCage = "";
  let currentDam = null;

  values.forEach((cells, index) => {
    const rowNumber = index + 1;
    const text = cells.join(" ").trim();
    const isBlank = !text;
    if (isBlank) {
      currentCage = "";
      currentDam = null;
      return;
    }

    const cageCandidate = String(cells[1] || "").trim();
    if (/^\??\d{5,6}\??$/.test(cageCandidate)) {
      currentCage = cageCandidate.replace(/[^\d]/g, "");
      currentDam = {
        genotype: [cells[2], cells[3]].filter(Boolean).join(" / "),
        tag: cells[4] || "",
        sex: cells[5] || "",
        dob: normalizeDate_(cells[6])
      };
    }

    const pupIndex = cells.findIndex((cell) => /pups?|tagged\?/i.test(String(cell || "")));
    const dob = findDate_(cells);
    if (currentCage && pupIndex >= 0 && dob) {
      rows.push({
        line,
        cage: currentCage,
        row: rowNumber,
        dam: currentDam,
        litter: {
          dob,
          label: cells[pupIndex],
          count: findCount_(cells)
        },
        notes: text
      });
    }

    const adultTagText = text.toLowerCase();
    const likelyAdultCage = currentCage && !/pups?|preg/i.test(adultTagText);
    const missingTag = likelyAdultCage && /missing tags?|tagged\?|check.*tag|compare.*tag/i.test(adultTagText);
    if (missingTag) {
      rows.push({
        line,
        cage: currentCage,
        row: rowNumber,
        adultCage: true,
        missingTags: true,
        notes: text
      });
    }
  });

  return rows;
}

function findDate_(cells) {
  for (const cell of cells) {
    const normalized = normalizeDate_(cell);
    if (normalized) return normalized;
  }
  return "";
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

function findCount_(cells) {
  const joined = cells.join(" ");
  const count = joined.match(/\b\d+\s*[MF](?:\s*\+\s*\d*\s*[MF])?|\d+M\d+F|~\d+[MF]|\d+\s*pups?/i);
  return count ? count[0] : "";
}
