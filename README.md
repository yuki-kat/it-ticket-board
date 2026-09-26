# IT Ticket Board

A lightweight IT service desk board in a single web page: ticket queues, a Kanban board and other ticket views, a Home dashboard with Operations insights, asset and stock inventory with device health, an escalation matrix, email-to-ticket import, and reports.

## Open it

Double-click `index.html`. It runs in any modern browser, with no install and no server.

- **Your data stays in your browser.** Tickets, assets and settings are saved in that browser's local storage. A different browser or computer starts from the sample data.
- **Everything works offline**, including the Excel export.
- **Debug log:** add `?debug` to the end of the page address, or press **Ctrl + Shift + D**, to show a log of clicks, popups opening and closing, page changes, and errors. Click **Turn off** to hide it.

## How it is put together

- **`app/`** is the source: React + TypeScript, built with Vite. This is where every change is made.
- **`index.html`** is **built from `app/`** into one self-contained file. Do not edit it by hand; it says so at the top. Since 26 Sep 2026 it is no longer a compiled bundle with add-on scripts, which is what used to cause stacked, hard-to-find bugs.
- **`tests/`** are browser tests that open `index.html` exactly as it ships.
- **`desktop/`** wraps the same page as a Windows / Mac app (see `desktop/README.md`).
- **`legacy/`** holds a copy of the old compiled page, so you can compare the two. Delete it once you are happy with the new one.

## Making changes

You need Node.js (version 22) and, for the tests, Google Chrome.

1. Create a branch (for example `fix-insight-popup`).
2. Edit the source in `app/src/`. To try it while you work: `cd app && npm ci && npm run dev`.
3. Rebuild the page and run the tests:

   ```bash
   cd app && npm run build:page
   cd ../tests && npm ci && npm test
   ```

4. Commit **both** the source and the rebuilt `index.html`, push, and open a pull request. GitHub rebuilds the page from the source and **fails the pull request if `index.html` is out of date**, so a forgotten rebuild can't slip through.
5. Merge into `main` once the **Browser tests** check is green. `main` always holds a working version.

## What is in the source

- **Home** (`HomePopouts.tsx`, `HomeInsights.tsx`): the Ticket overview and Needs attention cards and their popups, the Explore tickets launcher, and the Operations insights: eight cards, their Settings switches, a detail popup for each, and "Arrange card" with its saved order.
- **Tickets** (`App.tsx`): the list, split, Kanban and other views, the "All Views" picker (`ViewPicker.tsx`), saved views, tabs, and exports (CSV and Excel).
- **Inventory** (`InventoryPage.tsx`): assets and stock, device health with a demo "Sync from Action1", and exports.
- **Around the edges:** `Overlay.tsx` (the round × in the corner and Escape to close every dialog, top one first), `QuickPageNav.tsx` (the previous/next page arrows), `screenPattern.ts` (background patterns), `debug.ts` and `DebugPanel.tsx` (the debug log).

Saved data uses the same storage keys as the old page, so nothing is lost when moving between them.

## Automated tests

The browser tests in `tests/` open the real `index.html` in Chrome and click through the app: the Home totals and their queues, every popup (opening, the four ways of closing, keyboard use, focus), the Explore tickets launcher, the Operations insights and arranging (including saved order), Home settings, opening a ticket, Inventory device health, every export (the downloaded files are checked, including the two-sheet Excel workbook), the extras around the edges, and the debug log. Each test starts with a fresh browser profile, so nothing depends on your saved tickets.

```bash
cd tests && npm ci && npm test
```

`npm run test:headed` shows the browser while it runs. GitHub runs the same tests on every pull request and on `main`; the result shows on the pull request as **Browser tests**. If a run fails, open it on the Actions tab and download the `playwright-report` file.
