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

## Making changes

1. Create a branch (for example `fix-insight-popup`).
2. Edit `index.html` and test it in the browser.
3. Commit, push, and open a pull request.
4. Merge into `main` once it works. `main` always holds a working version.
