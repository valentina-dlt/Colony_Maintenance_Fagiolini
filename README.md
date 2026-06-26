# Colony Task Launchpad

Static GitHub Pages app for turning a Google Sheets mouse colony workbook into a visible task checklist.

## What it tracks now

- Ear tagging: due after P13 and before P21.
- Weaning: due after P21 and by P28.
- Adult cages with missing or unclear tags: flagged for review.

The app reads the live Google Sheet directly in the browser through Google's visualization endpoint. The spreadsheet itself is not modified.

## Live Google Sheet bridge

The primary bridge is already built into `app.js`:

- `CONFIG.spreadsheetId` points to the colony workbook.
- `CONFIG.sourceSheets` lists the active tabs to scan.
- `loadGoogleSheet()` reads each tab live from Google Sheets.
- The page refreshes data on load, when Refresh is clicked, and every 5 minutes while open.

The workbook must remain accessible to the team account/browser opening the page. If Google blocks the live read, the app falls back to `sample-data.js` and says `sample fallback` in the upper right.

The `apps-script/Code.gs` file is an alternate bridge option if a stricter/private deployment is needed:

1. Open the Google Sheet.
2. Go to Extensions > Apps Script.
3. Paste `apps-script/Code.gs`.
4. Deploy as a Web App.
5. Replace `loadRows()` in `app.js` with a fetch to the Web App URL.

## GitHub Pages

Push these files to a GitHub repository and enable Pages from the repository root.

## Open formatting questions

- Some tabs use shifted columns for genotype, sex, and DOB.
- Some litter rows say only `PUPS`; others use counts like `3M4F`, `~2M`, or notes in another column.
- Some rows appear already weaned but still have source litter rows, so the first pass marks those as review instead of assuming complete.
