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

`app/` holds the React + TypeScript source the page was originally compiled from, recovered from the Codex workspace on 26 Sep 2026. It builds cleanly, but it is **one round behind** `index.html`. It is missing:

- the Inventory device-health column, filter and badges, and the demo "Sync from Action1";
- keyword-based ticket routing (VPN, laptop, printer…);
- the email reminder when a ticket has no affected-user email;
- the add-on scripts listed above.

Until those are brought into `app/`, **`index.html` stays the page to use**. Once `app/` matches it, `index.html` will be built from `app/` and the add-on scripts retired.

To build it (needs Node.js):

```bash
cd app && npm ci && npm run build
```

The result lands in `app/dist/`, which isn't committed.

## Automated tests

Browser tests in `tests/` open the real `index.html` in Chrome and click through the main flows: the Home totals and their queues, the Ticket overview and Needs-attention popups, the Explore tickets launcher, the Operations insights popups (including keyboard use and arranging), Home settings, opening a ticket, and Inventory device health. They also check that the Home page settles instead of re-rendering forever. Each test starts with a fresh browser profile, so nothing depends on your saved tickets.

Run them (needs Node.js and Google Chrome):

```bash
cd tests && npm ci && npm test
```

`npm run test:headed` shows the browser while it runs. GitHub runs the same tests on every pull request and on `main`; the result shows on the pull request as **Browser tests**. If a run fails, open it on the Actions tab and download the `playwright-report` file.

One test is marked `fixme`: filtering Inventory by At Risk, Critical or Monitor shows nothing in `index.html` (a known bug, fixed in the React source in `app/`). Turn it on when `index.html` is built from `app/`.

## Making changes

1. Create a branch (for example `fix-insight-popup`).
2. Edit `index.html` and test it in the browser.
3. Commit, push, and open a pull request.
4. Merge into `main` once it works. `main` always holds a working version.
