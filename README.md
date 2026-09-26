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

## Hosting (Vercel)

The app is hosted on Vercel, connected to this repo (Vercel project **app**, root directory `app/`). Vercel builds the React source itself, so only the built app goes online; the tests, `legacy/` and `supabase/` never do. Every merge into `main` updates the live site, and every pull request gets its own preview address, linked in a comment on the pull request.

- **Login protection:** Vercel's deployment protection is on, so only people signed in to the Vercel account can open the site. Keep it on until the app is ready for customers.
- **Security headers:** `app/vercel.json` turns off framing and MIME sniffing, sets a strict referrer policy, and blocks camera, microphone and location.
- **Sign-in** (Settings → Account) only works on the hosted site, not on a double-clicked `index.html`, because the sign-in email has to link back to a web address.

**One-time setup for sign-in:**

1. In Vercel, open project **app** → **Domains** and note the production address.
2. In Supabase: Authentication → URL Configuration. Set **Site URL** to that address and add it under **Redirect URLs**. To sign in on pull request previews too, also add `https://app-git-*-yuki-0306.vercel.app/**`.
3. Optional, until you're ready for other people: in Supabase, turn off **Allow new users to sign up**, so only accounts that already exist can sign in (you can invite people from the Supabase dashboard).

## Database and workspaces (Supabase)

The database is set up by two files in `supabase/`. Run each once, in order, in Supabase: **SQL Editor → New query → paste the file → Run**. Both are safe to run again.

1. `schema.sql`: the tables for tickets, deleted tickets, assets, stock and personal settings.
2. `002_workspaces.sql`: **company workspaces**. Tickets, assets and stock belong to a workspace (a company or IT team) instead of one person, so several IT staff can share them. Existing data is kept: anyone who already has data gets a workspace called "My workspace", as its admin.

Roles: an **admin** can invite people, change roles and remove members; an **agent** can work with the workspace's tickets, assets and stock. A workspace always keeps at least one admin. Access is enforced by the database's row level security, not by the app, so a member can never see another workspace's data.

In the app, **Settings → Account** shows your workspace, your role and the team. Admins invite colleagues by email; they join automatically the first time they sign in with that email. Someone signing in with no workspace and no invite gets their own workspace. Screen pattern, Home layout and saved views stay personal.

## Sync

**Settings → Account → Sync** keeps the board in the workspace's database, so everyone in the workspace works from the same tickets, deleted tickets, assets and stock. It needs sign-in (so the hosted site) and `002_workspaces.sql`. Settings stay personal and are not synced.

How it starts depends on what the workspace already has:

- **An empty workspace:** **Copy this board into …** sends everything in this browser, or **Start with an empty board**.
- **A workspace with a board:** **Use …'s board** shows that board here instead of what is here now.

Either way, what the browser had is kept first: **Backup and restore → Put it back** returns to it, and stops syncing.

While syncing:

- A change is sent about a second after it is made. The top bar shows **Saving…**, then **Saved to** the workspace.
- The workspace is read every 30 seconds while the page is visible, and whenever the window gets focus or the connection comes back, so colleagues' changes arrive. **Sync now** in Settings does both straight away.
- With no connection, changes wait in the browser, also over a reload or restart, and are sent when the connection is back. The top bar says **Offline, changes kept here**.
- Two people changing the same ticket: the change sent last wins, for the whole ticket (not field by field). A ticket changed here that someone else deleted is kept and sent again.
- Syncing stops, and the board in the browser stays as it is, when you stop it in Settings, sign out, restore a backup or put the previous data back, or are removed from the workspace.

How it works: the browser remembers a fingerprint of each record as the database last had it (under `it-ticket-kanban-sync-v1`, which is not part of backups). Comparing against it shows what changed here since, and what changed in the database. The rules are in `app/src/syncLogic.ts` (tested in `tests/sync-logic.spec.ts`); sending and reading are in `app/src/cloudSync.ts` (tested in `tests/sync.spec.ts`).

## Backup and restore

**Settings → Backup and restore** downloads everything saved in the browser as one JSON file (`it-ticket-board-backup-YYYY-MM-DD.json`) and can restore from such a file. Restoring shows what is in the file next to what is in the browser, checks the file first (a bad file changes nothing), replaces the tickets, assets, stock and settings, and keeps the replaced data under one key so the last restore can be undone with **Put it back**. In a browser that syncs with a workspace, restoring or putting data back stops syncing first, so the workspace is not changed.

File format (`format: 1`): `{ app, format, createdAt, counts, records: { tickets, deletedTickets, assets, stock }, settings }`. `records` are the plain lists, ready to import into a database later; `settings` are the remaining saved preferences as text. The code is in `app/src/backup.ts`.

## What is in the source

- **Home** (`HomePopouts.tsx`, `HomeInsights.tsx`): the Ticket overview and Needs attention cards and their popups, the Explore tickets launcher, and the Operations insights: eight cards, their Settings switches, a detail popup for each, and "Arrange card" with its saved order.
- **Tickets** (`App.tsx`): the list, split, Kanban and other views, the "All Views" picker (`ViewPicker.tsx`), saved views, tabs, and exports (CSV and Excel).
- **Inventory** (`InventoryPage.tsx`): assets and stock, device health with a demo "Sync from Action1", and exports.
- **Around the edges:** `Overlay.tsx` (the round × in the corner and Escape to close every dialog, top one first), `QuickPageNav.tsx` (the previous/next page arrows), `screenPattern.ts` (background patterns), `debug.ts` and `DebugPanel.tsx` (the debug log).

Saved data uses the same storage keys as the old page, so nothing is lost when moving between them.

## Automated tests

The browser tests in `tests/` open the real `index.html` in Chrome and click through the app: the Home totals and their queues, every popup (opening, the four ways of closing, keyboard use, focus), the Explore tickets launcher, the Operations insights and arranging (including saved order), Home settings, opening a ticket, Inventory device health, every export (the downloaded files are checked, including the two-sheet Excel workbook), the extras around the edges, the debug log, backups, sign-in, workspaces and sync. Each test starts with a fresh browser profile, so nothing depends on your saved tickets. The sign-in, workspace and sync tests talk to a stand-in for Supabase (`tests/fake-supabase.ts`), so they need no account and no network.

```bash
cd tests && npm ci && npm test
```

`npm run test:headed` shows the browser while it runs. GitHub runs the same tests on every pull request and on `main`; the result shows on the pull request as **Browser tests**. If a run fails, open it on the Actions tab and download the `playwright-report` file.
