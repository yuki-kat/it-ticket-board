---
name: ticket-board-iterate
description: Change, fix and deliver the IT Ticket Board (also called Ops Kanban; GitHub repo yuki-kat/it-ticket-board) end to end - edit the React source, rebuild the single-file index.html, run the browser tests, take before/after screenshots on desktop and phone, commit on a branch, and hand back the updated file and the test link. Use this whenever the user asks to fix, change, restyle, add to or test anything in the ticket board (Home, Tickets, Inventory, Explore tickets, popups, New task, insight cards, phone layout), reports that something in it "looks weird" or "doesn't work", or asks for the latest file, link or screenshots of it - even if they don't name the repo.
---

# IT Ticket Board: change, check, deliver

The user iterates on this app in short loops: they point at something on screen, you change it, and they want to *see* the result straight away (screenshots, then the file or link to click through). Every loop follows the same steps below. The value is in the checking and the handover, not just the code edit.

## The project in one minute

- **Repo:** `yuki-kat/it-ticket-board` (private). In a cloud session, attach it with `add_repo` (access `push`), clone with `git clone --depth 1` into `/home/user/it-ticket-board`, then `register_repo_root`. On the user's Mac it's their local clone.
- **Source:** `app/src/` (React + TypeScript + Vite). **`index.html` is generated** by `cd app && npm run build:page` (run `npm ci` first if `node_modules` is missing). Never edit `index.html` by hand; commit it together with the source, because the GitHub check fails when it is out of date.
- **Tests:** `tests/*.spec.ts` (Playwright), opening the real `index.html`.
- **Where things live:**

| File (in `app/src/`) | What it holds |
| --- | --- |
| `App.tsx` | Header, Tickets page, Home (`HomeScreen`), New task form, ticket record panel, `exploreQueuesFor` |
| `route.ts` | Page addresses: `#/home`, `#/tickets`, `#/inventory`, `#/explore[/queue[/ticket]]` |
| `ExplorePage.tsx`, `explore-page.css` | Explore tickets page (queues, tickets, summary) |
| `HomeInsights.tsx`, `HomePopouts.tsx` | Operations insight cards, their popups, Home popups |
| `Overlay.tsx` | Side panels / dialogs (round × in the corner, Escape) |
| `board-refresh.css`, `index.css` | Old, heavily layered styles |
| `gui-fixes.css` | Cross-page fixes, imported last in `main.tsx` so it wins |

- **Design direction the user has chosen:** real pages with their own address over chains of popups (they rejected a three-popup Explore flow and asked for pages). Small previews can stay popups. Only one popup at a time.
- **CSS traps met before:** two-column grids with plain `1fr` let a long `<select>` push the grid wider than its panel (use `minmax(0, 1fr)`); `.primary-button span` enlarges any span inside a primary button; `.field` is a flex column, so label text and "Optional" stack unless it is made `display: block`.

## The loop

1. **Pin down the ask.** If it can mean two very different things ("there should be 3 popups", "split it into pages"), ask one short multiple-choice question, with a preview where it helps. Guessing wrong costs a whole loop. If it's clear, state your assumption in one line and go.
2. **Branch.** Work on the current feature branch (`gui-cleanup` as of Sep 2026) or a new one. Never commit to `main`.
3. **Before screenshots** of the pages you'll touch (see Screenshots). If the user reports a bug, reproduce it first. Then check whether it already exists on `main`: `git show origin/main:index.html > <scratchpad>/main-index.html` and screenshot or click through that. Tell the user plainly whether your earlier changes caused it.
4. **Change the source**, then rebuild with `cd app && npm run build:page`. Type errors show up here.
5. **Look at it yourself.** Take after screenshots and read the images. For behaviour, write a small Playwright click-through of the changed flow (focus, Escape, Back button, counts) and print its state. Always check phone width (390 px): most regressions in this app were phone-only.
6. **Tests.** Add or update specs for the behaviour you changed, then run `bash <skill>/scripts/run-tests.sh <repo>`. All tests pass on `main` (Sep 2026, after the sync was finished), so any failure is yours until shown otherwise. To prove a failure is older than your change, build the base version and run just that spec.
7. **Commit** the source, the rebuilt `index.html` and the tests. Explain *why* in the message and end it with the session's attribution lines. Check `git status` first for strays (`tests/test-results/`, screenshots, temporary config files).
8. **Push** only to a branch the user has already approved as a backup (they approved `gui-cleanup`). Ask before pushing a new branch. Never open a pull request unless asked; they don't want changes on `main` without saying so. After the first push from a shallow clone, run `git config --add remote.origin.fetch '+refs/heads/<branch>:refs/remotes/origin/<branch>'`, `git fetch origin <branch>` and `git branch -u origin/<branch>`. Otherwise git (and the stop hook) wrongly reports the branch as unpushed.
9. **Deliver.**
   - Send before/after screenshots with `SendUserFile` (`display: render`).
   - Copy `index.html` to `<scratchpad>/IT Ticket Board - updated.html` and send it (`display: attach`).
   - Republish the test link: copy `index.html` to `<scratchpad>/it-ticket-board.html` and publish it to `https://claude.ai/artifact/VBe1uMrj1mtNNeXc7h6tgy`. From a new conversation, `read` that URL first, then publish with `url`.
   - Offer to update the handover notes doc (`https://claude.ai/artifact/DWqgxzbDqtHcbFEo8v6fSc`). Its "What changed in this version" table and "Open questions and next steps" list are edited through the Claude Docs connector, not by publishing.
10. **Report** in a few lines: what changed, what you checked (tests passed/total, naming the known failures), where it lives (branch, pushed or not), and the next open item.

## Screenshots

```bash
cd <repo>/tests && node <skill>/scripts/screenshots.mjs <path/to/index.html> <scratchpad>/<before|after> home,tickets,inventory,explore
```

It saves `desktop-<page>.png` and `phone-<page>.png` and prints any page errors. It works on older builds without page addresses too. For a popup or a single step, write a few lines of Playwright instead: click to open it, `waitForTimeout(300)`, then screenshot. Crop with `clip` when only part of the screen matters.

## Things to tell the user (they are easy to forget)

- **Saved tickets belong to each file.** Browsers keep saved data per file, so a copy with a new name or location starts with the sample tickets. To keep their data, save the new file over the old one (same name, same place), or use Settings → Backup and restore.
- **The test link** (the artifact) starts with sample data. Exports and backup downloads do nothing there, and sign-in only works on the hosted site. It's also private until they share it from its Share menu.
- **Browsers:** checks run in Chromium only. Say so if the change is browser-sensitive.

## How this user likes to work

- Concise and results-first. Lead with what changed and the evidence (screenshot, test count), then the details.
- Never say "fixed" or "works" without a screenshot, a click-through or a test run behind it. Separate bugs you introduced from ones that were already on `main`.
- Ask before outward-facing steps: pushing a new branch, opening a pull request, publishing a new link, deleting anything.
- Git and GitHub are newer to them. When a git step needs their action, explain it with this project as the example, one command at a time.
