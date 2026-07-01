# Context From "Design mouse task tracker"

This project was moved here from the Codex thread "Design mouse task tracker".

## Product Goal

Build a free, simple colony task launchpad for mouse colony maintenance. The app reads a constantly updated Google Sheet where each tab corresponds to a genetic line, then turns ages, cages, breeding rows, pregnancy/litter notes, and experimental notes into visible task lists and calendar-like views.

The app should be more reliable for daily management than Google Tasks or Calendar alone: incomplete work should remain visible, overdue or review items should not disappear just because the due date passed, and managers should be able to scan what needs attention.

## Current App Shape

The current implementation is a static browser app intended for GitHub Pages:

- `index.html`
- `styles.css`
- `app.js`
- `sample-data.js`
- `apps-script/Code.gs`

It reads the live Google Sheet in the browser through Google's visualization endpoint. If live read fails, it falls back to `sample-data.js`.

The configured spreadsheet ID is in `CONFIG.spreadsheetId` in `app.js`.

## Current Views

- Tasks: `All`, `Today`, `Week`, `Month`
- Tools: `Breeders`, `Old`, `Sheets Bridge`, `Instructions`

The Instructions tab explains what comes from the spreadsheet, what is browser-local, and what actions record or erase local data.

## Current Task Logic

Implemented task categories include:

- Ear tagging: due after P13 and before P21.
- Weaning: due after P21 and by P28.
- Adult cages with missing or unclear tags: review tasks.
- C57 pups are not assigned ear-tagging tasks.
- C57 adult cages are not flagged for missing tags.
- Late weaning tasks are labeled `Wean info to spreadsheet`.
- CDKL5 FS pup experimental timeline:
  - Pup ASO Injection 1 at P0-P2.
  - Pup ASO Injection 2 at P6.
  - Plasma/Tissue Collection at P21.
- Past Pup ASO Injection 1/2 tasks are hidden.
- Current and future injection tasks remain visible.
- Pup ASO injection and plasma/tissue collection tasks move to review after their work window instead of becoming overdue.
- Breeders view shows breeding-section cages as Good or Replace by age.
- Breeder replacement options are grouped by target line and explicit sex/genotype criteria.
- Replacement option groups are collapsed by default.
- Replacement options do not yet filter for inbreeding.

## Local Versus Shared State

Read from spreadsheet:

- Genetic line tabs.
- Cage numbers.
- DOB and age.
- Sex, genotype, tag/mark data.
- Notes and experimental notes.
- Breeding sections and source rows.

Stored only in the current browser:

- Task completion checkboxes.
- Sheets Bridge confirmation state.
- Old tab SAC/Keep choices.

These local states are not shared across users, browsers, private windows, cleared browser data, or computers.

## Important Bridge History

There was an attempted Google Apps Script write bridge for Old-tab SAC/Keep decisions. It wrote to a `SAC/Keep Notes` column. During testing, it wrote `status=SAC` into wrong cells, including cells unrelated to the animal and at least one column-detail/header area.

Guardrails were added to `apps-script/Code.gs` and browser-side row checks, but the final resolution in the prior thread was to disable the bridge completely by setting:

```js
oldMouseBridgeUrl: ""
```

Current rule: the webpage must remain read-only until the write path is deliberately redesigned and tested against copied/non-production Sheet data. Do not casually re-enable the existing bridge against the live colony Sheet.

## New Shared-State Direction

On July 1, 2026, the workbook gained a dedicated `App Actions` tab. This is the safe shared-state target. The app should append UI events to `App Actions` and rebuild shared state from that log, instead of writing into the colony source tabs.

`App Actions` is initialized with:

`Timestamp`, `User`, `Session ID`, `Action`, `Task ID`, `Task`, `Line`, `Cage`, `Source Row`, `DOB`, `Previous State`, `New State`, `Details`, `App Version`, `Reconciliation Status`

The updated `apps-script/Code.gs` supports:

- `action=appState`: reads `App Actions` and returns latest task and old-mouse state.
- `action=saveAction`: appends a new action row with Apps Script's active/effective Google user when available.
- `logAction=reconciliation`: records that a checked-off task has resolved in the Sheet because it no longer exists in the current raw Sheet-derived task list.

The updated browser app supports `CONFIG.actionLogBridgeUrl`. When blank, the app stays browser-local. When set to a deployed Apps Script web app URL, task checkoffs, sheet confirmations, and Old SAC/Keep choices become shared through `App Actions`.

Sheets Bridge now asks: `Does the app log agree with the current colony sheet?` Checked-off tasks appear under `Needs Sheet Update` while raw data still generates them, then move to `Resolved In Sheet` once the colony Sheet update causes the task to disappear naturally. One reconciliation row is appended to `App Actions` for each newly detected resolved task.

The bad historical entries were strings like:

```text
status=SAC; updated=2026-06-29T21:13:18.722Z
status=SAC; updated=2026-06-29T21:13:19.970Z
```

Those were to be manually cleared from the Google Sheet.

## Deployment History

The previous workspace pushed to GitHub Pages from `main`. Recent commits there included:

- `91fec6b Add instructions view and grouped navigation`
- `5126d33 Disable old mouse sheet bridge`
- `5e85031 Guard old mouse sheet writes`
- `d425215 Use guarded bridge deployment`

The copied code here reflects the final read-only state after the bridge was disabled.

## Open Questions

- Some Sheet tabs use shifted columns for genotype, sex, DOB, and notes.
- Some litter rows say only `PUPS`; others use counts like `3M4F`, `~2M`, or notes in another column.
- Some rows appear already weaned but still have source litter rows, so the current app marks those as review instead of assuming complete.
- A future shared-state system should probably use a safer append-only log or explicit task table rather than writing derived state back into arbitrary source Sheet rows.
