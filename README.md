# Colony Task Launchpad

Static GitHub Pages app for turning a Google Sheets mouse colony workbook into a visible task checklist.

## What it tracks now

- Ear tagging: due after P13 and before P21.
- Weaning: due after P21 and by P28.
- Adult cages with missing or unclear tags: flagged for review.
- C57 pups are not assigned ear-tagging tasks, and C57 adult cages are not flagged for missing tags.
- Late weaning tasks are labeled `Wean info to spreadsheet`.
- Today view: shows open tasks whose work window has started.
- Week and Month views: toggle between full task windows and due dates only.
- CDKL5 FS pup experimental timeline: Pup ASO Injection 1 at P0-P2, Pup ASO Injection 2 at P6, and Plasma/Tissue Collection at P21.
- Past Pup ASO Injection 1/2 tasks are hidden; current and future injection tasks remain visible.
- Pup ASO injection and Plasma/Tissue Collection tasks move to review after their work window instead of becoming overdue.
- Breeders view: shows breeding-section cages as Good or Replace by age, plus replacement options grouped by target line and explicit sex/genotype criteria. Replacement options do not filter for inbreeding yet.
- Replacement option groups are collapsed by default.

The app reads the live Google Sheet directly in the browser through Google's visualization endpoint. Task generation is read-only.

## Live Google Sheet bridge

The primary bridge is already built into `app.js`:

- `CONFIG.spreadsheetId` points to the colony workbook.
- `CONFIG.sourceSheets` lists the active tabs to scan.
- `loadGoogleSheet()` reads each tab live from Google Sheets.
- The page refreshes data on load, when Refresh is clicked, and every 5 minutes while open.

The workbook must remain accessible to the team account/browser opening the page. If Google blocks the live read, the app falls back to `sample-data.js` and says `sample fallback` in the upper right.

The `apps-script/Code.gs` file is the shared write bridge for Old-tab SAC/Keep decisions. It writes decisions back to a same-row column named `SAC/Keep Notes` on the existing line tabs, so the whole team can see the same assignments.

1. Open the Google Sheet.
2. Go to Extensions > Apps Script.
3. Paste `apps-script/Code.gs`.
4. Deploy as a Web App with access appropriate for the team.
5. Put the Web App URL into `CONFIG.oldMouseBridgeUrl` in `app.js`.

If `CONFIG.oldMouseBridgeUrl` is blank, the Old tab still works locally but SAC/Keep decisions are stored only in that browser.

## GitHub Pages

Push these files to a GitHub repository and enable Pages from the repository root.

## Open formatting questions

- Some tabs use shifted columns for genotype, sex, and DOB.
- Some litter rows say only `PUPS`; others use counts like `3M4F`, `~2M`, or notes in another column.
- Some rows appear already weaned but still have source litter rows, so the first pass marks those as review instead of assuming complete.
