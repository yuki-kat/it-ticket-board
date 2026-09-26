# IT Ticket Board

A lightweight IT service desk board in a single web page: ticket queues, a Kanban board, a Home dashboard with Operations insights, asset and stock inventory with device health, an escalation matrix, email-to-ticket import, and reports.

## Open it

Double-click `index.html`. It runs in any modern browser, with no install and no server.

- **Your data stays in your browser.** Tickets, assets and settings are saved in that browser's local storage. A different browser or computer starts from the sample data.
- **Excel export needs internet** (the Excel library loads from a CDN). Everything else works offline.

## Debug log

Add `?debug` to the end of the page address, or press **Ctrl + Shift + D**, to show a log of clicks, popups opening and closing, page changes, and errors. Click **Turn off** to hide it.

## How the page is put together

`index.html` is a compiled React app plus a set of small add-on scripts near the end of the file that extend it: ticket overview popups, the Operations insights popups, the arrange popup, device health, the debug log, and so on. When changing behaviour, update or replace the relevant add-on script rather than stacking a new one on top. Stacked scripts caused most of the bugs fixed on 26 Sep 2026.

## The React source (`app/`)

`app/` holds the React + TypeScript source the page was originally compiled from, recovered from the Codex workspace on 26 Sep 2026. It builds cleanly and now does **everything `index.html` does**. The source has taken over these from the add-on scripts in `index.html`:

- **Inventory:** device health (Healthy, Monitor, At Risk, Critical) with the demo "Sync from Action1", and the exports (the Export CSV button on the Tickets page, and "All assets and stock" as CSV or a two-sheet Excel workbook).
- **Home:** the Ticket overview, Needs attention and Explore tickets popups (`app/src/HomePopouts.tsx`), and the Operations insights: all eight cards, their Settings switches, the detail popup, and "Arrange card" with its saved order (`app/src/HomeInsights.tsx`).
- **Around the edges:** the previous/next page arrows (`QuickPageNav.tsx`), the styled Settings button in the header, the round × in the corner and Escape to close every dialog (`Overlay.tsx`), the "All Views" picker (`ViewPicker.tsx`), the screen pattern choices in Settings (`screenPattern.ts`), and the debug log (`debug.ts`, `DebugPanel.tsx`; turn it on with `?debug` or Ctrl + Shift + D).
- **Already in the source, nothing to port:** keyword ticket routing, the missing-email reminder in the "resolved" email draft, and an Excel export that works offline (the page needs a web library for Excel).
- **Ahead of the page:** the ticket list view has checkboxes with Shift-click range selection and can export just the selected tickets; tickets can be exported to Excel; Escape closes only the top dialog; the SLA card lists the tickets really past their SLA; a card switched off in Settings keeps its place in the arrangement.
- **Left out on purpose:** the stand-in "Customize Home" and "Reports" dialogs, which the page showed only if the real ones failed to open.

**The next step is to build `index.html` from `app/`** and delete the add-on scripts. Until then, `index.html` stays the page to use.

To build it (needs Node.js):

```bash
cd app && npm ci && npm run build
```

The result lands in `app/dist/`, which isn't committed.

## Automated tests

Browser tests in `tests/` run in two sets. The **page** tests open the real `index.html` in Chrome and click through the main flows: the Home totals and their queues, the Ticket overview and Needs-attention popups, the Explore tickets launcher, the Operations insights popups (including keyboard use and arranging), Home settings, opening a ticket, and Inventory device health. They also check that the Home page settles instead of re-rendering forever. Each test starts with a fresh browser profile, so nothing depends on your saved tickets.

Run them (needs Node.js and Google Chrome):

```bash
cd tests && npm ci && npm test
```

`npm run test:headed` shows the browser while it runs. GitHub runs the same tests on every pull request and on `main`; the result shows on the pull request as **Browser tests**. If a run fails, open it on the Actions tab and download the `playwright-report` file.

The **source** tests (`tests/source/`) run against the React source built into `app/dist`, and cover Inventory device health, every export (the downloaded files are checked, including the two-sheet Excel workbook), and the accessibility and focus behaviour of the Home popups. A third set, **source-same-flows**, runs some of the page test files (currently the queue, popup, insights and arrange ones) unchanged against the source, which proves the two behave the same; a test file is added to that list as each feature is ported. Build the source first: `cd app && npm ci && npm run build`. GitHub does this automatically.

One page test is marked `fixme`: filtering Inventory by At Risk, Critical or Monitor shows nothing in `index.html` (a known bug, fixed in the React source and tested there). Turn it on when `index.html` is built from `app/`.

## Making changes

1. Create a branch (for example `fix-insight-popup`).
2. Edit `index.html` and test it in the browser.
3. Commit, push, and open a pull request.
4. Merge into `main` once it works. `main` always holds a working version.
